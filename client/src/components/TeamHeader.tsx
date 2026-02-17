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
  viewTab: "initiatives" | "metrics";
  onViewTabChange: (tab: "initiatives" | "metrics") => void;
}

export function TeamHeader({ team, onSync, isSyncing, viewTab, onViewTabChange }: TeamHeaderProps) {
  const [sprintInfoOpen, setSprintInfoOpen] = useState(false);

  return (
    <div className="px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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
        <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
          <button
            onClick={() => onViewTabChange("initiatives")}
            className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
              viewTab === "initiatives" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-view-initiatives"
          >
            Инициативы
          </button>
          <button
            onClick={() => onViewTabChange("metrics")}
            className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
              viewTab === "metrics" 
                ? "bg-background text-foreground shadow-sm" 
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-view-metrics"
          >
            Метрики
          </button>
        </div>
      </div>
      <SprintInfoDialog 
        open={sprintInfoOpen} 
        onOpenChange={setSprintInfoOpen}
        teamId={team.teamId}
      />
    </div>
  );
}
