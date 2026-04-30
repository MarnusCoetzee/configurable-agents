"""Tool registry — each tool is a callable returning a JSON-serializable result.

The workflow runner injects the result of an agent's tools into its message
context so the LLM has grounded data to reason over. Keeping this simple
(no formal tool-calling protocol) makes the demo easier to follow.
"""

from .data_tools import (
    compliance_check,
    get_campaign_metrics,
    get_policy_margin_by_campaign,
    rank_segments,
)

TOOLS = {
    "get_campaign_metrics": get_campaign_metrics,
    "compare_campaigns": get_campaign_metrics,  # alias
    "query_postgres": get_campaign_metrics,  # generic alias for analyst
    "get_policy_margin": get_policy_margin_by_campaign,
    "get_expected_loss_by_segment": rank_segments,
    "segment_customers": rank_segments,
    "rank_segments": rank_segments,
    "compliance_check": compliance_check,
    # Strategist + QA agents do not pull data — they read prior outputs
    "read_prior_agent_outputs": None,
    "create_recommendation": None,
    "score_answer": None,
    "write_eval_result": None,
    "suggest_prompt_patch": None,
}


def run_tool(name: str, session, **kwargs):
    fn = TOOLS.get(name)
    if fn is None:
        return None
    return fn(session, **kwargs)
