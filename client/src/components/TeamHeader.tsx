import { Building2 } from "lucide-react";
import type { Team } from "@shared/schema";

interface TeamHeaderProps {
  team: Team;
}

export function TeamHeader({ team }: TeamHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card">
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
  );
}
