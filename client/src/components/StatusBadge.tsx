import { Badge } from "@/components/ui/badge";
import { Circle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase();
  
  const getStatusColor = () => {
    switch (normalizedStatus) {
      case "active":
      case "in progress":
        return "bg-status-active/10 text-status-active border-status-active/20";
      case "planned":
        return "bg-status-planned/10 text-status-planned border-status-planned/20";
      case "completed":
        return "bg-status-completed/10 text-status-completed border-status-completed/20";
      case "at risk":
        return "bg-status-at-risk/10 text-status-at-risk border-status-at-risk/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  return (
    <Badge 
      variant="outline" 
      className={`${getStatusColor()} font-medium text-xs px-2 py-0.5 gap-1`}
      data-testid={`badge-status-${normalizedStatus}`}
    >
      <Circle className="h-2 w-2 fill-current" />
      {status}
    </Badge>
  );
}
