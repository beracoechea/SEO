import { useTranslation } from "react-i18next";
import { trendSteps, type TrendPoint } from "../lib/score";

export function TrendNodes({ points }: { points: TrendPoint[] }) {
  const { t, i18n } = useTranslation();
  const steps = trendSteps(points, 5);
  if (steps.length === 0) return null;

  const locale = i18n.language.startsWith("en") ? "en" : "es";

  return (
    <ol className="trend-nodes" aria-label={t("sites.trend")}>
      {steps.map((step, i) => {
        const label = step.at
          ? new Date(step.at).toLocaleDateString(locale, { day: "numeric", month: "short" })
          : "—";
        const kindLabel =
          step.kind === "up"
            ? t("sites.trendUp")
            : step.kind === "down"
              ? t("sites.trendDown")
              : step.kind === "same"
                ? t("sites.trendSame")
                : t("sites.trendStart");
        const delta =
          step.delta == null ? "" : step.delta > 0 ? ` · +${step.delta}` : ` · ${step.delta}`;
        return (
          <li key={`${step.at}-${i}`} className={`trend-node is-${step.kind}`} tabIndex={0}>
            <span className="trend-dot" />
            <span className="trend-day">{label}</span>
            <span className="trend-tip" role="tooltip">
              <strong>
                {t("sites.score")} {Math.round(step.score)}
              </strong>
              <span>
                {label} · {kindLabel}
                {delta}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
