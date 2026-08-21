type Slice = { label: string; value: number; color: string };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function pieChartPng(title: string, slices: Slice[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 22px Segoe UI, sans-serif";
  ctx.fillText(title, 24, 36);

  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const cx = 210;
  const cy = 240;
  const radius = 130;
  let start = -Math.PI / 2;
  slices.forEach((slice) => {
    const angle = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    start += angle;
  });

  let legendY = 88;
  ctx.font = "16px Segoe UI, sans-serif";
  slices.forEach((slice) => {
    ctx.fillStyle = slice.color;
    roundRect(ctx, 400, legendY, 18, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#334155";
    const pct = Math.round((slice.value / total) * 100);
    ctx.fillText(`${slice.label}: ${slice.value} (${pct}%)`, 430, legendY + 15);
    legendY += 32;
  });
  return canvas.toDataURL("image/png");
}

export function barChartPng(title: string, slices: Slice[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 22px Segoe UI, sans-serif";
  ctx.fillText(title, 24, 36);

  const max = Math.max(1, ...slices.map((s) => s.value));
  const left = 48;
  const bottom = 360;
  const top = 72;
  const barW = Math.min(72, (640 - slices.length * 12) / Math.max(slices.length, 1));
  slices.forEach((slice, i) => {
    const h = ((bottom - top) * slice.value) / max;
    const x = left + i * (barW + 28);
    const y = bottom - h;
    ctx.fillStyle = slice.color;
    roundRect(ctx, x, y, barW, h, 8);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 14px Segoe UI, sans-serif";
    ctx.fillText(String(slice.value), x, y - 8);
    ctx.fillStyle = "#64748b";
    ctx.font = "12px Segoe UI, sans-serif";
    ctx.fillText(slice.label.slice(0, 14), x, bottom + 22);
  });
  return canvas.toDataURL("image/png");
}
