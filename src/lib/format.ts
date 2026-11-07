export function formatRelativeTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  const minutes = Math.round((now - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
