import { CircleHelp } from "lucide-react";
import { scoreTone } from "../lib/score";

export function ScoreChip({ value }: { value: number | null }) {
  const tone = scoreTone(value);
  return <span className={`score-chip score-${tone}`}>{value == null ? "—" : Math.round(value)}</span>;
}

type Tone = "ok" | "warn" | "danger" | "info" | "pending";

export function Kpi({
  label,
  value,
  tone,
  active,
  onSelect,
  onInfo,
  infoLabel,
}: {
  label: string;
  value: string | number;
  tone: Tone;
  active?: boolean;
  onSelect?: () => void;
  onInfo?: () => void;
  infoLabel?: string;
}) {
  return (
    <div className={`kpi kpi-${tone}${active ? " is-active" : ""}${onSelect ? " is-clickable" : ""}`}>
      <button type="button" className="kpi-main" onClick={onSelect} disabled={!onSelect}>
        <span className="kpi-value">{value}</span>
        <span className="kpi-label">{label}</span>
      </button>
      {onInfo ? (
        <button type="button" className="kpi-info-btn" aria-label={infoLabel || label} title={infoLabel || label} onClick={onInfo}>
          <CircleHelp size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function KpiHint({
  title,
  body,
  onClose,
  closeLabel,
}: {
  title: string;
  body: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="kpi-hint" role="status">
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <button type="button" className="kpi-hint-close" onClick={onClose}>
        {closeLabel}
      </button>
    </div>
  );
}
