import { Users, RefreshCw, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { Team, Initiative, TeamRow } from "@shared/schema";
import { SprintInfoDialog } from "@/components/SprintInfoDialog";

interface TeamHeaderProps {
  team: Team;
  initiatives: Initiative[];
  allInitiatives?: Initiative[]; // Все инициативы без фильтра для ИР
  dbTeam?: TeamRow;
  showActiveOnly: boolean;
  onFilterChange: (checked: boolean) => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function TeamHeader({ team, initiatives, allInitiatives, dbTeam, showActiveOnly, onFilterChange, onSync, isSyncing }: TeamHeaderProps) {
  const [sprintInfoOpen, setSprintInfoOpen] = useState(false);

  const calculateInnovationRate = (): string => {
    let totalStoryPoints = 0;
    let innovationStoryPoints = 0;

    // Используем allInitiatives для расчёта ИР, чтобы он не менялся при фильтрации
    const dataForIR = allInitiatives || initiatives;
    dataForIR.forEach(initiative => {
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

  return (
    <div className="px-4 py-4 border-b border-border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md" style={{ backgroundColor: 'rgba(205, 37, 61, 0.1)' }}>
            <Users className="h-5 w-5" style={{ color: '#cd253d' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground" data-testid="text-team-name">
                {team.name}
              </h1>
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-update-team"
                className="h-7 w-7"
                onClick={onSync}
                disabled={isSyncing || !onSync}
                title="Синхронизировать данные"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-sprint-info"
                className="h-7 w-7"
                onClick={() => setSprintInfoOpen(true)}
                title="Добавить спринт"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Innovation Rate: <span data-testid="text-innovation-rate">{calculateInnovationRate()}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="active-filter"
            checked={showActiveOnly}
            onCheckedChange={onFilterChange}
            data-testid="switch-active-filter"
          />
          <Label htmlFor="active-filter" className="cursor-pointer text-sm">
            Активные
          </Label>
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
