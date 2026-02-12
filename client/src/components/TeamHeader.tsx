import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Team, Initiative, TeamRow } from "@shared/schema";
import { SprintInfoDialog } from "@/components/SprintInfoDialog";

interface TeamHeaderProps {
  team: Team;
  initiatives: Initiative[];
  allInitiatives?: Initiative[];
  dbTeam?: TeamRow;
  showActiveOnly: boolean;
  onFilterChange: (checked: boolean) => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function TeamHeader({ team, onSync, isSyncing }: TeamHeaderProps) {
  const [sprintInfoOpen, setSprintInfoOpen] = useState(false);

  return (
    <div className="px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="icon"
          variant="ghost"
          data-testid="button-sprint-info"
          onClick={() => setSprintInfoOpen(true)}
          title="Добавить спринт"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          data-testid="button-update-team"
          onClick={onSync}
          disabled={isSyncing || !onSync}
          title="Синхронизировать данные"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <SprintInfoDialog 
        open={sprintInfoOpen} 
        onOpenChange={setSprintInfoOpen}
        teamId={team.teamId}
      />
    </div>
  );
}
