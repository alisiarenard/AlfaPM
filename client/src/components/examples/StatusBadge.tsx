import { StatusBadge } from '../StatusBadge';

export default function StatusBadgeExample() {
  return (
    <div className="flex flex-wrap gap-3 p-8 bg-background">
      <StatusBadge status="Active" />
      <StatusBadge status="Planned" />
      <StatusBadge status="Completed" />
      <StatusBadge status="At Risk" />
    </div>
  );
}
