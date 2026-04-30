"""MiniMax M2.7 chat completions client.

MiniMax exposes an OpenAI-compatible chat completions endpoint at
{base_url}/text/chatcompletion_v2 (intl) or {base_url}/chat/completions for the
OpenAI-compatible alias. We default to the OpenAI-compatible alias so that
swapping providers later is trivial.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from ..config import settings

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_OPEN_THINK = re.compile(r"<think>.*", re.DOTALL | re.IGNORECASE)


def _strip_thinking(text: str) -> tuple[str, str]:
    """Return (final_answer, reasoning). Handles M2.7 <think>…</think> blocks
    plus the truncated-mid-think case (no closing tag)."""
    if not text:
        return "", ""
    reasoning_parts = [m.group(0) for m in _THINK_BLOCK.finditer(text)]
    cleaned = _THINK_BLOCK.sub("", text)
    # If we truncated mid-think (open tag with no close), the rest is reasoning
    open_match = _OPEN_THINK.search(cleaned)
    if open_match:
        reasoning_parts.append(open_match.group(0))
        cleaned = cleaned[: open_match.start()]
    return cleaned.strip(), "\n".join(reasoning_parts).strip()


@dataclass
class LLMResponse:
    content: str
    reasoning: str
    raw: dict[str, Any]
    tokens_used: int
    finish_reason: str | None


class MiniMaxClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        connect_timeout: float = 15.0,
        read_timeout: float = 240.0,
        max_retries: int = 2,
    ) -> None:
        self.api_key = api_key or settings.minimax_api_key
        self.base_url = (base_url or settings.minimax_base_url).rstrip("/")
        self.model = model or settings.minimax_model
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.max_retries = max_retries

    def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 8192,
        model: str | None = None,
        json_mode: bool = False,
    ) -> LLMResponse:
        if not self.api_key:
            return LLMResponse(
                content="[stub] MINIMAX_API_KEY not set — returning canned response.",
                reasoning="",
                raw={"stub": True},
                tokens_used=0,
                finish_reason="stub",
            )

        url = f"{self.base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            # OpenAI-compatible providers honor this; MiniMax docs list it as supported.
            payload["response_format"] = {"type": "json_object"}
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        timeout = httpx.Timeout(
            connect=self.connect_timeout,
            read=self.read_timeout,
            write=self.connect_timeout,
            pool=self.connect_timeout,
        )

        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=timeout) as client:
                    resp = client.post(url, json=payload, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                break
            except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError) as exc:
                last_exc = exc
                if attempt >= self.max_retries:
                    raise
                # transient — short backoff and try again
                time.sleep(1.5 * (attempt + 1))
            except httpx.HTTPStatusError as exc:
                # Retry on 5xx; don't retry on 4xx (auth, bad request).
                if 500 <= exc.response.status_code < 600 and attempt < self.max_retries:
                    last_exc = exc
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise
        else:  # pragma: no cover
            raise last_exc or RuntimeError("LLM call failed without exception")

        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        finish_reason = choice.get("finish_reason")
        raw_content = message.get("content") or ""
        # MiniMax (and DeepSeek-style) thinking models may also emit
        # `reasoning_content`. Prefer the explicit answer when available.
        reasoning_field = message.get("reasoning_content") or ""
        usage = data.get("usage") or {}
        tokens = int(usage.get("total_tokens") or 0)

        cleaned, inline_reasoning = _strip_thinking(raw_content)
        reasoning = (reasoning_field + "\n" + inline_reasoning).strip()

        # If the model returned only thinking (no final answer), surface a hint.
        if not cleaned and reasoning:
            cleaned = "(model truncated before producing a final answer — see reasoning trace)"

        return LLMResponse(
            content=cleaned,
            reasoning=reasoning,
            raw=data,
            tokens_used=tokens,
            finish_reason=finish_reason,
        )


def get_llm_client() -> MiniMaxClient:
    return MiniMaxClient()
