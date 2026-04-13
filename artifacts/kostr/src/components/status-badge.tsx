import { Badge } from "@/components/ui/badge";

type Status = "healthy" | "review" | "critical" | "unknown";

export function StatusBadge({ status }: { status: Status }) {
  const variants: Record<Status, { variant: "default" | "secondary" | "destructive" | "outline", label: string, className?: string }> = {
    healthy: { variant: "default", label: "Healthy", className: "bg-success text-success-foreground hover:bg-success/90 border-transparent" },
    review: { variant: "default", label: "Review", className: "bg-warning text-warning-foreground hover:bg-warning/90 border-transparent" },
    critical: { variant: "destructive", label: "Critical" },
    unknown: { variant: "secondary", label: "Unknown" },
  };

  const config = variants[status] || variants.unknown;

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
