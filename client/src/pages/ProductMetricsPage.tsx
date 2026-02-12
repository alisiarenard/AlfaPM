import type { DepartmentWithTeamCount } from "@shared/schema";

interface ProductMetricsPageProps {
  selectedDepartment: string;
  selectedYear: string;
  departments?: DepartmentWithTeamCount[];
}

export default function ProductMetricsPage({ selectedDepartment, selectedYear, departments }: ProductMetricsPageProps) {
  return (
    <div className="p-6" data-testid="page-product-metrics">
      <p className="text-muted-foreground mt-2">Страница в разработке</p>
    </div>
  );
}
