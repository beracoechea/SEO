import { scoreTone } from "../lib/score";

export function ScoreRing({
  value,
  size = 108,
  label,
  mode = "score",
}: {
  value: number | null;
  size?: number;
  label?: string;
  mode?: "score" | "progress";
}) {
  const tone = mode === "progress" ? "progress" : scoreTone(value);
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = 38;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const shown = value == null ? "—" : String(Math.round(value));

  return (
    <div className={`score-ring score-${tone}${mode === "progress" ? " is-filling" : ""}`} style={{ width: size, height: size }} title={label}>
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle className="score-track" cx="48" cy="48" r={r} />
        <circle
          className="score-value"
          cx="48"
          cy="48"
          r={r}
          style={{ strokeDasharray: `${dash} ${c}` }}
        />
      </svg>
      <div className="score-ring-label">
        {mode === "progress" ? (
          <span className="score-scan-pulse" aria-label={label} />
        ) : (
          <>
            <strong>{shown}</strong>
            {label ? <span>{label}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
