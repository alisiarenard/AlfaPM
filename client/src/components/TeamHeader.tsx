import { Building2, TrendingUp, Lightbulb } from "lucide-react";
import type { Team, Initiative, TeamRow } from "@shared/schema";

interface TeamHeaderProps {
  team: Team;
  initiatives: Initiative[];
  dbTeam?: TeamRow;
}

export function TeamHeader({ team, initiatives, dbTeam }: TeamHeaderProps) {
  const calculateInnovationRate = (): string => {
    let totalStoryPoints = 0;
    let innovationStoryPoints = 0;

    initiatives.forEach(initiative => {
      const initiativePoints = initiative.sprints.reduce((sum, sprint) => sum + sprint.sp, 0);
      totalStoryPoints += initiativePoints;
      
      // Считаем все инициативы кроме "Поддержка бизнеса" (cardId !== 0)
      if (initiative.cardId !== 0) {
        innovationStoryPoints += initiativePoints;
      }
    });

    if (totalStoryPoints === 0) {
      return "0%";
    }

    const rate = (innovationStoryPoints / totalStoryPoints) * 100;
    return `${Math.round(rate)}%`;
  };

  const velocity = dbTeam?.vilocity ?? team.velocity;

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground" data-testid="text-team-name">
            {team.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            Board ID: <span className="font-mono">{team.boardId}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Velocity</span>
            <span className="text-sm font-semibold font-mono text-foreground" data-testid="text-velocity">{velocity}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50">
          <Lightbulb className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Innovation Rate</span>
            <span className="text-sm font-semibold font-mono text-foreground" data-testid="text-innovation-rate">{calculateInnovationRate()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
