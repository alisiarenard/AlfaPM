import { format } from "date-fns";
import { StatusBadge } from "./StatusBadge";
import type { Initiative, Sprint } from "@shared/schema";

interface InitiativesTimelineProps {
  initiatives: Initiative[];
}

export function InitiativesTimeline({ initiatives }: InitiativesTimelineProps) {
  const allSprints = initiatives.reduce((acc, initiative) => {
    initiative.sprints.forEach(sprint => {
      if (!acc.some(s => s.sprintId === sprint.sprintId)) {
        acc.push(sprint);
      }
    });
    return acc;
  }, [] as Sprint[]);

  allSprints.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    switch (normalizedStatus) {
      case "active":
      case "in progress":
        return "bg-status-active";
      case "planned":
        return "bg-status-planned";
      case "completed":
        return "bg-status-completed";
      case "at risk":
        return "bg-status-at-risk";
      default:
        return "bg-muted";
    }
  };

  const shouldShowColorBlock = (initiative: Initiative, sprint: Sprint, sprintIndex: number) => {
    const initiativeStartDate = new Date(initiative.startDate);
    const sprintStartDate = new Date(sprint.startDate);
    
    if (sprintStartDate < initiativeStartDate) {
      return false;
    }
    
    if (initiative.sprints.length === 0) {
      return false;
    }
    
    const lastInitiativeSprint = initiative.sprints.reduce((latest, s) => {
      const currentSprintIndex = allSprints.findIndex(as => as.sprintId === s.sprintId);
      const latestSprintIndex = allSprints.findIndex(as => as.sprintId === latest.sprintId);
      return currentSprintIndex > latestSprintIndex ? s : latest;
    }, initiative.sprints[0]);
    
    const lastSprintIndex = allSprints.findIndex(s => s.sprintId === lastInitiativeSprint.sprintId);
    
    return sprintIndex <= lastSprintIndex;
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-full">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 bg-background px-4 py-3 text-left min-w-[220px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Инициатива
                </span>
              </th>
              <th className="px-4 py-3 text-left w-[140px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Дата начала
                </span>
              </th>
              <th className="px-4 py-3 text-left w-[100px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Размер
                </span>
              </th>
              <th className="px-4 py-3 text-left w-[120px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Вовлечённость
                </span>
              </th>
              <th className="px-4 py-3 text-left w-[140px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Статус
                </span>
              </th>
              {allSprints.map((sprint) => (
                <th
                  key={sprint.sprintId}
                  className="px-4 py-3 text-center min-w-[140px] bg-muted/30"
                  data-testid={`header-sprint-${sprint.sprintId}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {sprint.name}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(sprint.startDate), "dd.MM")} - {format(new Date(sprint.endDate), "dd.MM")}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initiatives.map((initiative) => (
              <tr
                key={initiative.id}
                className="border-b border-border hover-elevate transition-colors duration-150"
                data-testid={`row-initiative-${initiative.id}`}
              >
                <td className="sticky left-0 z-10 bg-background px-4 py-3">
                  <span className="font-medium text-sm text-foreground">
                    {initiative.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-sm text-foreground">
                    {format(new Date(initiative.startDate), "dd.MM.yyyy")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground font-medium">
                    {initiative.size}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground font-medium">
                    {initiative.involvement}%
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={initiative.status} />
                </td>
                {allSprints.map((sprint, sprintIndex) => {
                  const initiativeSprint = initiative.sprints.find(
                    (s) => s.sprintId === sprint.sprintId
                  );
                  const showColorBlock = shouldShowColorBlock(initiative, sprint, sprintIndex);
                  
                  return (
                    <td
                      key={sprint.sprintId}
                      className={`px-4 py-3 text-center relative ${showColorBlock ? getStatusColor(initiative.status) + '/40' : 'bg-muted/10'}`}
                      data-testid={`cell-sprint-${initiative.id}-${sprint.sprintId}`}
                    >
                      {initiativeSprint ? (
                        <span className="font-mono text-base font-semibold text-foreground relative z-10">
                          {initiativeSprint.storyPoints}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm relative z-10">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
