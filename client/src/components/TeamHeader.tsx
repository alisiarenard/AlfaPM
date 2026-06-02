import { RefreshCw, Plus, Mail, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Team, Initiative, TeamRow, SprintRow } from "@shared/schema";
import { SprintInfoDialog } from "@/components/SprintInfoDialog";
import { VirtualStartDateDialog } from "@/components/VirtualStartDateDialog";

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
  year?: number;
}

function formatSprintDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function SprintReviewModal({
  open,
  onOpenChange,
  team,
  dbTeam,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: Team;
  dbTeam?: TeamRow;
}) {
  const { data: sprints } = useQuery<SprintRow[]>({
    queryKey: ["/api/sprints/board", team.sprintBoardId],
    queryFn: async () => {
      const res = await fetch(`/api/sprints/board/${team.sprintBoardId}`);
      if (!res.ok) throw new Error("Failed to fetch sprints");
      return res.json();
    },
    enabled: open && !!team.sprintBoardId,
    staleTime: 60000,
  });

  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", dbTeam?.departmentId],
    enabled: open && !!dbTeam?.departmentId,
    staleTime: 60000,
  });

  const sortedSprints = sprints
    ? [...sprints].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      )
    : [];

  const [selectedSprint, setSelectedSprint] = useState<string>("");
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set([team.teamId]));

  useEffect(() => {
    if (sortedSprints.length > 0 && !selectedSprint) {
      setSelectedSprint(String(sortedSprints[0].sprintId));
    }
  }, [sortedSprints.length]);

  useEffect(() => {
    if (open) {
      setSelectedTeams(new Set([team.teamId]));
      setSelectedSprint("");
    }
  }, [open, team.teamId]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Сформировать письмо для обзора спринта</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Спринт</Label>
            <Select value={selectedSprint} onValueChange={setSelectedSprint}>
              <SelectTrigger data-testid="select-sprint-review-sprint">
                <SelectValue placeholder={sortedSprints.length === 0 ? "Нет спринтов" : "Выберите спринт"} />
              </SelectTrigger>
              <SelectContent>
                {sortedSprints.map(s => (
                  <SelectItem key={s.sprintId} value={String(s.sprintId)}>
                    {formatSprintDate(s.startDate)} — {formatSprintDate(s.finishDate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Команды</Label>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {(departmentTeams || []).map(t => (
                <div key={t.teamId} className="flex items-center gap-2">
                  <Checkbox
                    id={`team-cb-${t.teamId}`}
                    checked={selectedTeams.has(t.teamId)}
                    onCheckedChange={() => toggleTeam(t.teamId)}
                    data-testid={`checkbox-sprint-review-team-${t.teamId}`}
                  />
                  <label
                    htmlFor={`team-cb-${t.teamId}`}
                    className="text-sm cursor-pointer select-none"
                  >
                    {t.teamName}
                  </label>
                </div>
              ))}
              {!departmentTeams && (
                <p className="text-xs text-muted-foreground">Загрузка...</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Встреча для рассылки</Label>
            <Select disabled>
              <SelectTrigger data-testid="select-sprint-review-meeting">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Получатели</Label>
            <div
              className="min-h-[40px] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              data-testid="chips-sprint-review-recipients"
            >
              &nbsp;
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            disabled
            style={{ backgroundColor: "#cd253d" }}
            className="hover:opacity-90 border-0"
            data-testid="button-download-sprint-letter"
          >
            <Download className="h-4 w-4 mr-2" />
            Скачать письмо
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TeamHeader({ team, dbTeam, onSync, isSyncing, viewTab, onViewTabChange, year }: TeamHeaderProps) {
  const [sprintInfoOpen, setSprintInfoOpen] = useState(false);
  const [virtualStartOpen, setVirtualStartOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const isVirtual = team.hasSprints === false;
  const currentYear = year ?? new Date().getFullYear();

  return (
    <div className="px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-sprint-info"
            onClick={() => isVirtual ? setVirtualStartOpen(true) : setSprintInfoOpen(true)}
            title={isVirtual ? "Дата начала виртуальных спринтов" : "Добавить спринт"}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-update-team"
                onClick={onSync}
                disabled={isSyncing || !onSync}
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Синхронизировать данные</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                data-testid="button-sprint-review-letter"
                onClick={() => setReviewModalOpen(true)}
              >
                <Mail className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Сформировать письмо для обзора спринта</TooltipContent>
          </Tooltip>
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
      <VirtualStartDateDialog
        open={virtualStartOpen}
        onOpenChange={setVirtualStartOpen}
        teamId={team.teamId}
        year={currentYear}
      />
      <SprintReviewModal
        open={reviewModalOpen}
        onOpenChange={setReviewModalOpen}
        team={team}
        dbTeam={dbTeam}
      />
    </div>
  );
}
