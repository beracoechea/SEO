import { CircleHelp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconBtn } from "./IconBtn";

const ITEMS = [
  { kind: "start", label: "sites.trendStart", hint: "sites.trendStartHint" },
  { kind: "up", label: "sites.trendUp", hint: "sites.trendUpHint" },
  { kind: "down", label: "sites.trendDown", hint: "sites.trendDownHint" },
  { kind: "same", label: "sites.trendSame", hint: "sites.trendSameHint" },
] as const;

export function HelpLegend() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!box.current?.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="help-pop" ref={box}>
      <IconBtn
        label={t("help.legend")}
        icon={<CircleHelp size={20} />}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <div className="help-pop-panel" role="dialog" aria-label={t("help.legend")}>
          <strong>{t("sites.trend")}</strong>
          <p className="muted">{t("help.legendIntro")}</p>
          <ul className="help-legend">
            {ITEMS.map((item) => (
              <li key={item.kind}>
                <span className={`trend-dot is-${item.kind}`} />
                <span>
                  <strong>{t(item.label)}</strong>
                  <span className="muted">{t(item.hint)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
