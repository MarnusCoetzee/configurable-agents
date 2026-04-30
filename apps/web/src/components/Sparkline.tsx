/** Tiny inline sparkline. ~120x32 by default. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = "#7dd3fc",
  domain,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  domain?: [number, number];
}) {
  const points = values.filter((v): v is number => v !== null);
  if (points.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-40">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#475569"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const [lo, hi] = domain ?? [Math.min(...points), Math.max(...points)];
  const range = hi - lo || 1;
  const stepX = width / (values.length - 1);

  const path = values
    .map((v, i) => {
      if (v === null) return null;
      const x = i * stepX;
      const y = height - ((v - lo) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const last = points[points.length - 1];
  const lastIdx = values.lastIndexOf(last);
  const lastX = lastIdx * stepX;
  const lastY = height - ((last - lo) / range) * (height - 4) - 2;

  return (
    <svg width={width} height={height}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={path}
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}
