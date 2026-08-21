import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import type { PageSnap } from "../lib/runtime";
import { issueCodes, pageFetched } from "../lib/pageFilter";

const PAGE_SIZE = 30;

export function UrlFeed({ pages }: { pages: PageSnap[] }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown((n) => Math.min(pages.length, n + PAGE_SIZE));
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [pages.length]);

  const slice = useMemo(() => pages.slice(0, shown), [pages, shown]);

  if (pages.length === 0) {
    return <p className="muted">{t("audit.filterEmpty")}</p>;
  }

  return (
    <div className="url-feed">
      {slice.map((p) => {
        const codes = issueCodes(p);
        return (
          <article key={`${p.url}-${p.depth}`} className="url-card">
            <a className="url-card-link" href={p.url} target="_blank" rel="noreferrer">
              <span className="ellipsis">{p.url}</span>
              <ExternalLink size={14} aria-hidden />
            </a>
            {p.title ? <div className="url-card-title">{p.title}</div> : null}
            <div className="url-card-meta">
              <span>
                {pageFetched(p)
                  ? `HTTP ${p.redirect_status && p.redirect_status !== p.status ? `${p.redirect_status} → ${p.status || "—"}` : p.status || "—"}`
                  : t("audit.notFetched")}
              </span>
              <span>{p.ms != null ? `${p.ms} ms` : "—"}</span>
              <span>{t("audit.score")} {p.score}</span>
              {(p.hops || 0) > 0 ? <span>{t("audit.hops", { n: p.hops })}</span> : null}
              {p.rendered ? <span>{t("audit.rendered")}</span> : null}
            </div>
            {p.final_url && p.final_url !== p.url ? (
              <div className="muted ellipsis" title={p.final_url}>
                {t("audit.landedAt")}: {p.final_url}
              </div>
            ) : null}
            {codes.length > 0 ? (
              <ul className="findings">
                {codes.map((code) => (
                  <li key={code}>
                    <strong>{t(`issue.${code}`, { defaultValue: code })}</strong>
                    <span>{t(`issue.${code}.how`, { defaultValue: "" })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{t("audit.findingOk")}</p>
            )}
          </article>
        );
      })}
      {shown < pages.length ? (
        <div ref={sentinel} className="url-feed-more muted">
          {t("audit.loadingMore", { have: shown, total: pages.length })}
        </div>
      ) : (
        <p className="muted">{t("audit.showingCount", { n: pages.length })}</p>
      )}
    </div>
  );
}
