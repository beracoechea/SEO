import { scoreTone } from "../lib/score";

export function ScoreChip({ value }: { value: number | null }) {
  const tone = scoreTone(value);
  return <span className={`score-chip score-${tone}`}>{value == null ? "—" : Math.round(value)}</span>;
}

export function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "ok" | "warn" | "danger" | "info" | "pending";
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}
