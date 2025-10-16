import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InitiativeRow } from "@shared/schema";

interface InitiativesListProps {
  initiatives: InitiativeRow[];
  teamName: string;
}

export function InitiativesList({ initiatives, teamName }: InitiativesListProps) {
  const getStateBadge = (state: string) => {
    const stateMap = {
      "1-queued": { label: "В очереди", variant: "secondary" as const },
      "2-inProgress": { label: "В работе", variant: "default" as const },
      "3-done": { label: "Завершено", variant: "outline" as const },
    };
    const config = stateMap[state as keyof typeof stateMap] || { label: state, variant: "secondary" as const };
    return <Badge variant={config.variant} data-testid={`badge-state-${state}`}>{config.label}</Badge>;
  };

  const getConditionBadge = (condition: string) => {
    if (condition === "2-archived") {
      return <Badge variant="outline" data-testid="badge-archived">Архивная</Badge>;
    }
    return null;
  };

  return (
    <div className="space-y-4" data-testid="initiatives-list">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" data-testid="text-team-name">{teamName}</h3>
        <div className="text-sm text-muted-foreground" data-testid="text-initiatives-count">
          Инициатив: {initiatives.length}
        </div>
      </div>

      {initiatives.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Нет инициатив для отображения
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {initiatives.map((initiative) => (
            <Card key={initiative.id} className="hover-elevate" data-testid={`card-initiative-${initiative.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-base font-medium" data-testid={`text-title-${initiative.id}`}>
                    {initiative.title}
                  </CardTitle>
                  <div className="flex gap-2">
                    {getStateBadge(initiative.state)}
                    {getConditionBadge(initiative.condition)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Размер</div>
                    <div className="font-medium font-mono" data-testid={`text-size-${initiative.id}`}>
                      {initiative.size} SP
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Card ID</div>
                    <div className="font-medium font-mono" data-testid={`text-card-id-${initiative.id}`}>
                      {initiative.cardId}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Board ID</div>
                    <div className="font-medium font-mono" data-testid={`text-board-id-${initiative.id}`}>
                      {initiative.initBoardId}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
