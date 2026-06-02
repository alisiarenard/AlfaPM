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

interface CalendarItem {
  subject: string;
  description: string;
  start: string;
  end: string;
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

  const { data: calendarData, isFetching: calendarFetching } = useQuery<{ items: CalendarItem[] }>({
    queryKey: ["/api/konturtolk/calendar"],
    queryFn: async () => {
      const res = await fetch("/api/konturtolk/calendar");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch calendar");
      }
      return res.json();
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const calendarItems = calendarData?.items ?? [];

  const latestSprint = sprints
    ? [...sprints].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      )[0]
    : undefined;

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set([team.teamId]));
  const [selectedMeeting, setSelectedMeeting] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelectedTeams(new Set([team.teamId]));
      setSelectedMeeting("");
    }
  }, [open, team.teamId]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeams(prev => {
      if (prev.has(teamId) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const sprintDatesLabel = latestSprint
    ? `${formatSprintDate(latestSprint.startDate)} — ${formatSprintDate(latestSprint.finishDate)}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Письмо для Обзора спринта
            {sprintDatesLabel && (
              <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                {sprintDatesLabel}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {departmentTeams && departmentTeams.length > 1 && (
            <div className="space-y-2">
              <Label>Команды</Label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {departmentTeams.map(t => {
                  const isChecked = selectedTeams.has(t.teamId);
                  const isDisabled = isChecked && selectedTeams.size === 1;
                  return (
                    <div key={t.teamId} className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        id={`team-cb-${t.teamId}`}
                        checked={isChecked}
                        disabled={isDisabled}
                        onCheckedChange={() => toggleTeam(t.teamId)}
                        data-testid={`checkbox-sprint-review-team-${t.teamId}`}
                        className="data-[state=checked]:bg-[#cd253d] data-[state=checked]:border-[#cd253d]"
                      />
                      <label
                        htmlFor={`team-cb-${t.teamId}`}
                        className={`text-sm truncate select-none ${isDisabled ? "text-muted-foreground" : "cursor-pointer"}`}
                      >
                        {t.teamName}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Встреча для рассылки</Label>
            <Select
              value={selectedMeeting}
              onValueChange={setSelectedMeeting}
              disabled={calendarFetching || calendarItems.length === 0}
            >
              <SelectTrigger data-testid="select-sprint-review-meeting">
                <SelectValue
                  placeholder={
                    calendarFetching
                      ? "Загрузка..."
                      : calendarItems.length === 0
                      ? "Нет встреч"
                      : "Выберите встречу"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {calendarItems.map((item, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {item.subject || item.description || "Без названия"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            Скачать
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
