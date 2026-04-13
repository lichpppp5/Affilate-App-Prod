import { viBadgeLabel } from "../lib/ui-vi";

interface StatusBadgeProps {
  value: string;
}

export function StatusBadge({ value }: StatusBadgeProps) {
  const tone = getTone(value);

  return <span className={`status-badge status-${tone}`}>{viBadgeLabel(value)}</span>;
}

function getTone(value: string) {
  if (
    value === "completed" ||
    value === "approved" ||
    value === "published" ||
    value === "success"
  ) {
    return "success";
  }

  if (
    value === "processing" ||
    value === "queued" ||
    value === "generating" ||
    value === "scheduled" ||
    value === "draft_uploaded"
  ) {
    return "info";
  }

  if (value === "failed" || value === "rejected" || value === "error") {
    return "danger";
  }

  return "neutral";
}
