import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

type Tone = "ghost" | "primary" | "accent" | "sky" | "danger";

type Props = {
  label: string;
  tone?: Tone;
  to?: string;
  href?: string;
  icon: ReactNode;
  showLabel?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

export function IconBtn({ label, tone = "ghost", to, href, icon, showLabel = false, className = "", disabled, onClick, ...rest }: Props) {
  const cls = `icon-btn tone-${tone}${showLabel ? " with-label" : ""}${disabled ? " is-disabled" : ""} ${className}`.trim();
  function handleClick(event: MouseEvent<HTMLElement>) {
    onClick?.(event as MouseEvent<HTMLButtonElement>);
  }
  if (href && !disabled) {
    return (
      <a href={href} className={cls} aria-label={label} title={label} onClick={handleClick}>
        {icon}
        {showLabel ? <span>{label}</span> : null}
      </a>
    );
  }
  if (to && !disabled) {
    return (
      <Link to={to} className={cls} aria-label={label} title={label} onClick={handleClick}>
        {icon}
        {showLabel ? <span>{label}</span> : null}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} title={label} disabled={disabled} onClick={onClick} {...rest}>
      {icon}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
