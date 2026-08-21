import { httpMixPercents, type HttpMix } from "../lib/score";

const rows: { key: keyof HttpMix; className: string }[] = [
  { key: "ok", className: "bar-ok" },
  { key: "redirect", className: "bar-info" },
  { key: "client", className: "bar-warn" },
  { key: "server", className: "bar-danger" },
];

export function StatusBars({
  mix,
  labels,
}: {
  mix: HttpMix;
  labels: Record<keyof HttpMix, string>;
}) {
  const pct = httpMixPercents(mix);
  const empty = mix.ok + mix.redirect + mix.client + mix.server === 0;

  return (
    <div className="status-bars" role="img" aria-label="HTTP">
      {rows.map((row) => (
        <div key={row.key} className="status-bar-row">
          <span className="status-bar-label">{labels[row.key]}</span>
          <div className="status-bar-track">
            <div
              className={`status-bar-fill ${row.className}`}
              style={{ width: empty ? "6%" : `${Math.max(pct[row.key], 0)}%`, opacity: empty ? 0.28 : 1 }}
            />
          </div>
          <span className="status-bar-n">{empty ? "—" : mix[row.key]}</span>
        </div>
      ))}
    </div>
  );
}
