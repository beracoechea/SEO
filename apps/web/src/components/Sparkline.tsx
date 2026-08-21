export function Sparkline({ values, width = 88, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) {
    return <span className="sparkline sparkline-empty" aria-hidden="true" />;
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = Math.max(max - min, 1);
  const step = (width - 4) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = 2 + i * step;
    const y = height - 3 - ((v - min) / span) * (height - 8);
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  const first = values[0];
  const up = last >= first;
  return (
    <svg className={`sparkline ${up ? "is-up" : "is-down"}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline fill="none" strokeWidth="2" points={pts.join(" ")} />
    </svg>
  );
}
