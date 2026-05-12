export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return "฿" + new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString + "T00:00:00").toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString + "T00:00:00").toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}
