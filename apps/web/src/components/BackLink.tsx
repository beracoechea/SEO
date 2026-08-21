import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function BackLink({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link to={to} className="back-link">
      <span className="back-link-icon">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
