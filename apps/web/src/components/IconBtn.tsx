import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type Tone = "ghost" | "primary" | "accent" | "sky" | "danger";

type Props = {
  label: string;
  tone?: Tone;
  to?: string;
  icon: ReactNode;
  showLabel?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export function IconBtn({ label, tone = "ghost", to, icon, showLabel = false, className = "", disabled, ...rest }: Props) {
  const cls = `icon-btn tone-${tone}${showLabel ? " with-label" : ""} ${className}`.trim();
  if (to && !disabled) {
    return (
      <Link to={to} className={cls} aria-label={label} title={label}>
        {icon}
        {showLabel ? <span>{label}</span> : null}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} title={label} disabled={disabled} {...rest}>
      {icon}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
