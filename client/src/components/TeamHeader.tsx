import { RefreshCw, Plus, Mail, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Team, Initiative, TeamRow, SprintRow, TaskRow } from "@shared/schema";
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
  requiredEmails: string[];
  optionalEmails: string[];
}

function formatSprintDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function encodeRfc2047(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

const RED = "#cc0000";
const CATEGORY_ORDER = ["Frontend", "Backend", "Тестирование", "Другие работы"];

function taskTypeCategory(type: string | null): string {
  const t = (type || "").toLowerCase().trim();
  if (t.includes("front") || t === "ui" || t === "fe") return "Frontend";
  if (t.includes("back") || t === "be" || t === "api" || t === "server") return "Backend";
  if (t.includes("test") || t.includes("qa") || t.includes("тест") || t === "quality") return "Тестирование";
  return "Другие работы";
}

function buildCategoryBlock(tasks: TaskRow[]): string {
  const byCategory = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const cat = taskTypeCategory(task.type);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(task);
  }
  let html = "";
  for (const cat of CATEGORY_ORDER) {
    const catTasks = byCategory.get(cat);
    if (!catTasks?.length) continue;
    html += `<li style="list-style-type:none;margin-bottom:4px"><b>${cat}:</b><ul style="margin:2px 0 6px 0;padding-left:20px">`;
    for (const task of catTasks) {
      html += `<li style="list-style-type:circle;margin-bottom:2px">${task.title}</li>`;
    }
    html += `</ul></li>`;
  }
  return html;
}

function generateHtmlBody(
  meeting: CalendarItem,
  selectedTeamNames: string[],
  sprintTitle: string,
  teamName: string,
  tasks: TaskRow[],
  initiativesMap: Map<number, string>
): string {
  const meetingDate = meeting.start ? new Date(meeting.start) : null;
  const dateStr = meetingDate
    ? meetingDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const timeStr = meetingDate
    ? meetingDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    meetingDate &&
    meetingDate.getDate() === tomorrow.getDate() &&
    meetingDate.getMonth() === tomorrow.getMonth() &&
    meetingDate.getFullYear() === tomorrow.getFullYear();
  const dayWord = isTomorrow ? "завтра " : "";

  const teamNamesHtml = selectedTeamNames
    .map(n => `<b style="color:${RED}">${n}</b>`)
    .join(", ");

  const activeTasks = tasks.filter(t => t.condition !== "3 - deleted");

  const initiativeGroups = new Map<string, TaskRow[]>();
  const noInitiativeTasks: TaskRow[] = [];

  for (const task of activeTasks) {
    if (task.initCardId && initiativesMap.has(task.initCardId)) {
      const title = initiativesMap.get(task.initCardId)!;
      if (!initiativeGroups.has(title)) initiativeGroups.set(title, []);
      initiativeGroups.get(title)!.push(task);
    } else {
      noInitiativeTasks.push(task);
    }
  }

  let listHtml = "";

  initiativeGroups.forEach((initTasks, initTitle) => {
    listHtml += `<li style="margin-bottom:10px"><b>${initTitle}:</b><ul style="margin:4px 0;padding-left:20px">${buildCategoryBlock(initTasks)}</ul></li>`;
  });

  if (noInitiativeTasks.length > 0) {
    const catHtml = buildCategoryBlock(noInitiativeTasks);
    if (catHtml) {
      listHtml += `<li style="margin-bottom:10px"><b>Другие задачи:</b><ul style="margin:4px 0;padding-left:20px">${catHtml}</ul></li>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#000;margin:0;padding:20px;line-height:1.5">
<p style="margin:0 0 0 0">Коллеги,</p>
<p style="margin:4px 0 16px 24px">Обзор спринта команд разработки системы ${teamNamesHtml} состоится ${dayWord}<b style="color:${RED}">${dateStr}</b> в <b style="color:${RED}">${timeStr}&nbsp;МСК</b> в <b style="color:${RED}">Контур.Толк</b> по следующим вопросам:</p>
<p style="margin:0 0 12px 0">Команда <b style="color:${RED}">${teamName}</b> за <b style="color:${RED}">${sprintTitle}</b> реализовала следующее:</p>
<ul style="padding-left:30px;margin:0">
${listHtml}
</ul>
</body>
</html>`;
}

function generateEml(
  subject: string,
  toEmails: string[],
  ccEmails: string[],
  htmlBody: string
): string {
  const parts = [
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    `Subject: ${encodeRfc2047(subject)}`,
    `To: ${toEmails.join(", ")}`,
    ...(ccEmails.length > 0 ? [`CC: ${ccEmails.join(", ")}`] : []),
    ``,
    htmlBody,
  ];
  return parts.join("\r\n");
}

function downloadEml(filename: string, content: string) {
  const blob = new Blob([content], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SprintReviewModal({
  open,
  onOpenChange,
  team,
  dbTeam,
  initiatives,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: Team;
  dbTeam?: TeamRow;
  initiatives: Initiative[];
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

  const latestSprint = sprints
    ? [...sprints].sort(
        (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      )[0]
    : undefined;

  const { data: sprintTasks } = useQuery<TaskRow[]>({
    queryKey: ["/api/tasks/sprint", latestSprint?.sprintId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/sprint/${latestSprint!.sprintId}`);
      if (!res.ok) throw new Error("Failed to fetch sprint tasks");
      return res.json();
    },
    enabled: open && !!latestSprint?.sprintId,
    staleTime: 60000,
  });

  const calendarItems = calendarData?.items ?? [];

  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set([team.teamId]));
  const [selectedMeetingIdx, setSelectedMeetingIdx] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelectedTeams(new Set([team.teamId]));
      setSelectedMeetingIdx("");
    }
  }, [open, team.teamId]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeams(prev => {
      if (prev.has(teamId) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const sprintDatesLabel = latestSprint
    ? `${formatSprintDate(latestSprint.startDate)} — ${formatSprintDate(latestSprint.finishDate)}`
    : "";

  const selectedMeeting =
    selectedMeetingIdx !== "" ? calendarItems[parseInt(selectedMeetingIdx)] : undefined;

  const canDownload = !!selectedMeeting;

  function handleDownload() {
    if (!selectedMeeting) return;

    const initiativesMap = new Map<number, string>(
      initiatives.map(i => [i.cardId, i.title])
    );

    const selectedTeamNames: string[] = departmentTeams
      ? departmentTeams.filter(t => selectedTeams.has(t.teamId)).map(t => t.teamName)
      : [team.name];

    const sprintTitle = latestSprint?.title ?? sprintDatesLabel ?? "";
    const tasks = sprintTasks ?? [];

    const htmlBody = generateHtmlBody(
      selectedMeeting,
      selectedTeamNames,
      sprintTitle,
      team.name,
      tasks,
      initiativesMap
    );

    const content = generateEml(
      selectedMeeting.subject,
      selectedMeeting.requiredEmails,
      selectedMeeting.optionalEmails,
      htmlBody
    );

    const safeName = selectedMeeting.subject.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 60);
    downloadEml(`${safeName}.eml`, content);
  }

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
              value={selectedMeetingIdx}
              onValueChange={setSelectedMeetingIdx}
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
            disabled={!canDownload}
            onClick={handleDownload}
            style={canDownload ? { backgroundColor: "#cd253d" } : undefined}
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

export function TeamHeader({ team, initiatives, dbTeam, onSync, isSyncing, viewTab, onViewTabChange, year }: TeamHeaderProps) {
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
                <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
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
        initiatives={initiatives}
      />
    </div>
  );
}
