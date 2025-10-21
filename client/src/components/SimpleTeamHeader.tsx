import type { TeamRow } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface SimpleTeamHeaderProps {
  team: TeamRow;
  initiativesCount: number;
}

export function SimpleTeamHeader({ team, initiativesCount }: SimpleTeamHeaderProps) {
  return (
    <div className="bg-card border border-border rounded-md p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold" data-testid="text-team-name">{team.teamName}</h3>
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-update-team"
            className="h-7 w-7"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <p className="text-sm text-muted-foreground" data-testid="text-board-id">
            Board ID: {team.initBoardId}
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <div className="text-2xl font-bold font-mono" data-testid="text-velocity">{team.vilocity}</div>
            <div className="text-xs text-muted-foreground">Velocity</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono" data-testid="text-initiatives-count">{initiativesCount}</div>
            <div className="text-xs text-muted-foreground">Инициатив</div>
          </div>
        </div>
      </div>
    </div>
  );
}
