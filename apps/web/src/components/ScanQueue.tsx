import { ChevronsUp, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconBtn } from "./IconBtn";
import type { QueueItem } from "../lib/runtime";

type Named = { id: string; name: string };

type Props = {
  runningName?: string | null;
  items: QueueItem[];
  sites: Named[];
  disabled?: boolean;
  runNowDisabled?: boolean;
  onMove: (siteIds: string[]) => void | Promise<void>;
  onCancel: (siteId: string) => void | Promise<void>;
  onRunNow: (siteId: string) => void | Promise<void>;
};

export function ScanQueue({ runningName, items, sites, disabled, runNowDisabled, onMove, onCancel, onRunNow }: Props) {
  const { t } = useTranslation();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const names = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const ids = items.map((q) => q.site_id);
  const locked = Boolean(disabled || cancelingId);

  useEffect(() => {
    if (cancelingId && !items.some((q) => q.site_id === cancelingId)) setCancelingId(null);
  }, [items, cancelingId]);

  if (!items.length && !runningName) return null;

  function move(index: number, dir: -1 | 1) {
    if (locked) return;
    const next = index + dir;
    if (next < 0 || next >= ids.length) return;
    const copy = [...ids];
    const [row] = copy.splice(index, 1);
    copy.splice(next, 0, row);
    void onMove(copy);
  }

  async function cancel(siteId: string) {
    if (locked) return;
    setCancelingId(siteId);
    try {
      await onCancel(siteId);
    } catch {
      setCancelingId(null);
    }
  }

  return (
    <div className="card stack scan-queue">
      <h2 style={{ margin: 0, fontSize: 16 }}>{t("queue.title")}</h2>
      {runningName ? (
        <div className="scan-queue-row is-running">
          <span className="scan-queue-pos">{t("queue.now")}</span>
          <strong className="ellipsis">{runningName}</strong>
          <span className="muted">{t("crawl.running")}</span>
        </div>
      ) : null}
      {items.map((q, i) => {
        const canceling = cancelingId === q.site_id;
        return (
          <div key={q.id ?? q.site_id} className={`scan-queue-row${canceling ? " is-busy" : ""}`}>
            <span className="scan-queue-pos">{i + 1}</span>
            <div className="scan-queue-copy">
              <strong className="ellipsis">{names[q.site_id] || q.site_id}</strong>
              <span className="muted">{q.reason === "schedule" ? t("queue.reasonSchedule") : t("queue.reasonManual")}</span>
            </div>
            <div className="row scan-queue-actions">
              <IconBtn
                label={t("queue.up")}
                disabled={locked || i === 0}
                onClick={() => move(i, -1)}
                icon={<ChevronUp size={18} />}
              />
              <IconBtn
                label={t("queue.down")}
                disabled={locked || i === items.length - 1}
                onClick={() => move(i, 1)}
                icon={<ChevronDown size={18} />}
              />
              <IconBtn
                label={t("queue.runNow")}
                tone="accent"
                disabled={locked || runNowDisabled}
                onClick={() => void onRunNow(q.site_id)}
                icon={<ChevronsUp size={18} />}
              />
              <IconBtn
                label={canceling ? t("queue.canceling") : t("queue.cancel")}
                tone="danger"
                disabled={locked}
                onClick={() => void cancel(q.site_id)}
                icon={canceling ? <Loader2 size={18} className="icon-spin" /> : <X size={18} />}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
