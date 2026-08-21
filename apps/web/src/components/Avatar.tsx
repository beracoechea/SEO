import type { User } from "firebase/auth";

export function Avatar({ user }: { user: User | null }) {
  const photo = user?.photoURL || "";
  const initial = (user?.displayName || user?.email || "?").slice(0, 1).toUpperCase();
  const title = user?.displayName || user?.email || "";
  if (photo) {
    return <img className="avatar" src={photo} alt="" title={title} referrerPolicy="no-referrer" />;
  }
  return (
    <div className="avatar" title={title}>
      {initial}
    </div>
  );
}
