import { StatusBadge } from "./StatusBadge";
import type { InitiativeRow } from "@shared/schema";

interface SimpleInitiativesTimelineProps {
  initiatives: InitiativeRow[];
  teamName: string;
}

export function SimpleInitiativesTimeline({ initiatives, teamName }: SimpleInitiativesTimelineProps) {
  const getStatusFromState = (state: string): string => {
    const stateMap: { [key: string]: string } = {
      "1-queued": "planned",
      "2-inProgress": "active",
      "3-done": "completed",
    };
    return stateMap[state] || "planned";
  };

  return (
    <div className="overflow-x-auto" data-testid="initiatives-timeline">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="sticky left-0 bg-card z-10 px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[220px]">
              Инициатива
            </th>
            <th className="sticky left-[220px] bg-card z-10 px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[140px]">
              Дата начала
            </th>
            <th className="sticky left-[360px] bg-card z-10 px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[100px]">
              Размер
            </th>
            <th className="sticky left-[460px] bg-card z-10 px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[100px]">
              Выполнено
            </th>
            <th className="sticky left-[560px] bg-card z-10 px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[120px]">
              Вовлечённость
            </th>
          </tr>
        </thead>
        <tbody>
          {initiatives.map((initiative, index) => (
            <tr 
              key={initiative.id} 
              className="border-b border-border hover-elevate"
              data-testid={`row-initiative-${initiative.id}`}
            >
              <td className="sticky left-0 bg-background z-10 px-4 py-3 w-[220px]">
                <div className="flex items-center gap-2">
                  <StatusBadge status={getStatusFromState(initiative.state)} />
                  <span className="text-sm font-medium truncate" data-testid={`text-title-${initiative.id}`}>
                    {initiative.title}
                  </span>
                </div>
              </td>
              <td className="sticky left-[220px] bg-background z-10 px-4 py-3 text-sm text-muted-foreground font-mono w-[140px]">
                —
              </td>
              <td className="sticky left-[360px] bg-background z-10 px-4 py-3 text-sm font-medium font-mono w-[100px]" data-testid={`text-size-${initiative.id}`}>
                {initiative.size}
              </td>
              <td className="sticky left-[460px] bg-background z-10 px-4 py-3 text-sm text-muted-foreground font-mono w-[100px]">
                —
              </td>
              <td className="sticky left-[560px] bg-background z-10 px-4 py-3 text-sm text-muted-foreground font-mono w-[120px]">
                —
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {initiatives.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Нет инициатив для отображения
        </div>
      )}
    </div>
  );
}
