import { format } from "date-fns";
import { StatusBadge } from "./StatusBadge";
import type { Initiative } from "@shared/schema";

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
  }, [] as { sprintId: string; name: string }[]);

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-full">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-20 bg-background px-4 py-3 text-left min-w-[200px]">
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
              <th className="px-4 py-3 text-left w-[140px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Статус
                </span>
              </th>
              {allSprints.map((sprint) => (
                <th
                  key={sprint.sprintId}
                  className="px-4 py-3 text-center min-w-[120px] bg-muted/30"
                  data-testid={`header-sprint-${sprint.sprintId}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {sprint.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initiatives.map((initiative, idx) => (
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
                  <StatusBadge status={initiative.status} />
                </td>
                {allSprints.map((sprint) => {
                  const initiativeSprint = initiative.sprints.find(
                    (s) => s.sprintId === sprint.sprintId
                  );
                  return (
                    <td
                      key={sprint.sprintId}
                      className="px-4 py-3 text-center bg-muted/10"
                      data-testid={`cell-sprint-${initiative.id}-${sprint.sprintId}`}
                    >
                      {initiativeSprint ? (
                        <span className="font-mono text-base font-semibold text-primary">
                          {initiativeSprint.storyPoints}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
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
