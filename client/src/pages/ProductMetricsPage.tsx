import { useQuery } from "@tanstack/react-query";
import { MetricsPanel } from "@/components/MetricsPanel";
import type { DepartmentWithTeamCount, TeamRow } from "@shared/schema";

interface ProductMetricsPageProps {
  selectedDepartment: string;
  selectedYear: string;
  departments?: DepartmentWithTeamCount[];
}

export default function ProductMetricsPage({ selectedDepartment, selectedYear }: ProductMetricsPageProps) {
  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", selectedDepartment],
    enabled: !!selectedDepartment,
  });

  const teamIds = departmentTeams?.map(t => t.teamId) || [];

  return (
    <div className="bg-background flex-1">
      <div className="max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto" data-testid="page-product-metrics">
        <div className="p-6">
          {selectedDepartment && teamIds.length > 0 ? (
            <MetricsPanel teamIds={teamIds} selectedYear={selectedYear} />
          ) : selectedDepartment ? (
            <p className="text-muted-foreground text-center py-12">Нет команд в выбранном департаменте</p>
          ) : (
            <p className="text-muted-foreground text-center py-12">Выберите департамент для просмотра метрик</p>
          )}
        </div>
      </div>
    </div>
  );
}
