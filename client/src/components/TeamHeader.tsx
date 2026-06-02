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

// ─── Category detection from task title ──────────────────────────────────────

type TaskCategory = "Frontend" | "Backend" | "Тестирование" | "Дизайн";

const CATEGORY_ORDER: (TaskCategory | "Другие работы")[] = [
  "Frontend", "Backend", "Тестирование", "Дизайн", "Другие работы",
];

// Patterns: look for [keyword] in title (case-insensitive)
const TITLE_CATEGORY_PATTERNS: { pattern: RegExp; category: TaskCategory }[] = [
  { pattern: /\[back(?:end)?\]/gi, category: "Backend" },
  { pattern: /\[бэк(?:енд)?\]/gi, category: "Backend" },
  { pattern: /\[back\]/gi, category: "Backend" },
  { pattern: /\[front(?:end)?\]/gi, category: "Frontend" },
  { pattern: /\[фронт(?:енд)?\]/gi, category: "Frontend" },
  { pattern: /\[fe\]/gi, category: "Frontend" },
  { pattern: /\[qa\]/gi, category: "Тестирование" },
  { pattern: /\[qа\]/gi, category: "Тестирование" }, // Cyrillic А
  { pattern: /\[тест(?:ирование)?\]/gi, category: "Тестирование" },
  { pattern: /\[test(?:ing)?\]/gi, category: "Тестирование" },
  { pattern: /\[дизайн\]/gi, category: "Дизайн" },
  { pattern: /\[design\]/gi, category: "Дизайн" },
  { pattern: /\[ux\]/gi, category: "Дизайн" },
];

interface ParsedTask {
  category: TaskCategory | null;
  cleanTitle: string;
  original: TaskRow;
}

function parseTaskTitle(task: TaskRow): ParsedTask {
  let title = task.title;
  let category: TaskCategory | null = null;

  for (const { pattern, category: cat } of TITLE_CATEGORY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(title)) {
      category = cat;
      pattern.lastIndex = 0;
      // Remove ALL matched bracket tokens from title and clean up extra spaces
      title = title.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
      break;
    }
  }

  return { category, cleanTitle: title, original: task };
}

// ─── HTML generation helpers ─────────────────────────────────────────────────

const RED = "#cc0000";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build sub-grouped HTML for one initiative's task list.
 *  If none of the tasks have a category marker → flat list (no sub-headers).
 *  Otherwise → grouped by category with bold sub-headers. */
const TASK_LI = `style="list-style-type:none;margin-bottom:3px;padding-left:4px"`;
const TASK_BULLET = `&#9675;&nbsp;`; // ○

// Task representation for email — category parsed from original title, displayTitle from LLM
interface TaskForEmail {
  key: string;           // unique id for dedup/mapping
  displayTitle: string;  // humanized title (or original if LLM unavailable)
  category: TaskCategory | null; // parsed from ORIGINAL title before humanization
  condition: string | null;
  initCardId: number | null;
}

function buildInitiativeTasksHtml(tasks: TaskForEmail[]): string {
  const anyHasCategory = tasks.some(t => t.category !== null);

  if (!anyHasCategory) {
    return tasks
      .map(t => `<li ${TASK_LI}>${TASK_BULLET}${esc(t.displayTitle)}</li>`)
      .join("");
  }

  // Group by pre-parsed category
  const groups = new Map<string, TaskForEmail[]>();
  for (const t of tasks) {
    const key = t.category ?? "Другие работы";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  let html = "";
  for (const cat of CATEGORY_ORDER) {
    const group = groups.get(cat);
    if (!group?.length) continue;
    html += `<li style="list-style-type:none;margin-bottom:4px"><b>${esc(cat)}:</b>`;
    html += `<ul style="margin:2px 0 6px 0;padding-left:20px">`;
    for (const t of group) {
      html += `<li ${TASK_LI}>${TASK_BULLET}${esc(t.displayTitle)}</li>`;
    }
    html += `</ul></li>`;
  }
  return html;
}

// ─── Full HTML body ───────────────────────────────────────────────────────────

interface TeamSection {
  teamName: string;
  sprintTitle: string;
  tasks: TaskForEmail[];
}

const TEXT = "#333333";
const INIT_LI = `style="list-style-type:none;margin-bottom:10px"`;
const INIT_BULLET = `&#9679;&nbsp;`; // ●

function buildTeamSectionHtml(section: TeamSection, initiativesMap: Map<number, string>): string {
  const activeTasks = section.tasks.filter(t => t.condition !== "3 - deleted");

  const initiativeGroups = new Map<string, TaskForEmail[]>();
  const noInitiativeTasks: TaskForEmail[] = [];

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
    const subHtml = buildInitiativeTasksHtml(initTasks);
    listHtml += `<li ${INIT_LI}><b>${INIT_BULLET}${esc(initTitle)}:</b>`;
    listHtml += `<ul style="margin:4px 0;padding-left:24px">${subHtml}</ul></li>`;
  });

  if (noInitiativeTasks.length > 0) {
    const subHtml = buildInitiativeTasksHtml(noInitiativeTasks);
    listHtml += `<li ${INIT_LI}><b>${INIT_BULLET}Другие задачи:</b>`;
    listHtml += `<ul style="margin:4px 0;padding-left:24px">${subHtml}</ul></li>`;
  }

  return `<p style="margin:16px 0 8px 0">Команда <b style="color:${RED}">${esc(section.teamName)}</b> за <b style="color:${RED}">${esc(section.sprintTitle)}</b> реализовала следующее:</p>
<ul style="padding-left:10px;margin:0 0 8px 0;list-style-type:none">
${listHtml}
</ul>`;
}

function generateHtmlBody(
  meeting: CalendarItem,
  selectedTeamNames: string[],
  sections: TeamSection[],
  initiativesMap: Map<number, string>
): string {
  const meetingDate = meeting.start ? new Date(meeting.start) : null;
  const dateStr = meetingDate
    ? meetingDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const timeStr = meetingDate
    ? meetingDate.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    meetingDate &&
    meetingDate.getDate() === tomorrow.getDate() &&
    meetingDate.getMonth() === tomorrow.getMonth() &&
    meetingDate.getFullYear() === tomorrow.getFullYear();
  const dayWord = isTomorrow ? "завтра " : "";

  const teamNamesHtml = selectedTeamNames
    .map(n => `<b style="color:${RED}">${esc(n)}</b>`)
    .join(", ");

  const sectionsHtml = sections
    .map(s => buildTeamSectionHtml(s, initiativesMap))
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:15px;color:${TEXT};margin:0;padding:20px;line-height:1.6">
<p style="margin:0 0 0 0">Коллеги,</p>
<p style="margin:4px 0 16px 24px">Обзор спринта команд разработки ${teamNamesHtml} состоится ${dayWord}<b style="color:${RED}">${esc(dateStr)}</b> в <b style="color:${RED}">${esc(timeStr)}&nbsp;МСК</b> в <b style="color:${RED}">Контур.Толк</b> по следующим вопросам:</p>
${sectionsHtml}
</body>
</html>`;
}

// ─── EML file generation ──────────────────────────────────────────────────────

function encodeRfc2047(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function generateEml(
  subject: string,
  toEmails: string[],
  ccEmails: string[],
  htmlBody: string
): string {
  return [
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    `Subject: ${encodeRfc2047(subject)}`,
    `To: ${toEmails.join(", ")}`,
    ...(ccEmails.length > 0 ? [`CC: ${ccEmails.join(", ")}`] : []),
    ``,
    htmlBody,
  ].join("\r\n");
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

// ─── Sprint Review Modal ──────────────────────────────────────────────────────

function formatSprintDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
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
  const [isDownloading, setIsDownloading] = useState(false);

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

  async function handleDownload() {
    if (!selectedMeeting) return;
    setIsDownloading(true);

    try {
      const selectedTeamRows = departmentTeams
        ? departmentTeams.filter(t => selectedTeams.has(t.teamId))
        : [];
      const selectedTeamNames = selectedTeamRows.map(t => t.teamName);

      // Fetch latest sprint + tasks + initiatives for each selected team in parallel
      type RawSection = { teamName: string; sprintTitle: string; tasks: TaskRow[] };
      type TeamFetchResult = { section: RawSection | null; teamInitiatives: Initiative[] };

      const fetchResults: TeamFetchResult[] = await Promise.all(
        selectedTeamRows.map(async (teamRow): Promise<TeamFetchResult> => {
          // Fetch initiatives for this team's board (for correct grouping)
          let teamInitiatives: Initiative[] = [];
          if (teamRow.initBoardId) {
            try {
              const initRes = await fetch(`/api/initiatives/board/${teamRow.initBoardId}`);
              if (initRes.ok) teamInitiatives = await initRes.json();
            } catch { /* ignore */ }
          }

          if (!teamRow.sprintBoardId) return { section: null, teamInitiatives };
          try {
            const sprintsRes = await fetch(`/api/sprints/board/${teamRow.sprintBoardId}`);
            if (!sprintsRes.ok) return { section: null, teamInitiatives };
            const sprints: SprintRow[] = await sprintsRes.json();
            const latest = [...sprints].sort(
              (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
            )[0];
            if (!latest) return { section: null, teamInitiatives };

            const tasksRes = await fetch(`/api/tasks/sprint/${latest.sprintId}`);
            if (!tasksRes.ok) return { section: null, teamInitiatives };
            const tasks: TaskRow[] = await tasksRes.json();

            return {
              section: {
                teamName: teamRow.teamName,
                sprintTitle: latest.title ?? `${formatSprintDate(latest.startDate)} — ${formatSprintDate(latest.finishDate)}`,
                tasks,
              },
              teamInitiatives,
            };
          } catch {
            return { section: null, teamInitiatives };
          }
        })
      );

      // Merge all team initiatives into one map (seed with prop initiatives first)
      const initiativesMap = new Map<number, string>(
        initiatives.map(i => [i.cardId, i.title])
      );
      for (const { teamInitiatives } of fetchResults) {
        for (const init of teamInitiatives) {
          if (!initiativesMap.has(init.cardId)) {
            initiativesMap.set(init.cardId, init.title);
          }
        }
      }

      const rawSections: RawSection[] = fetchResults
        .map(r => r.section)
        .filter((s): s is RawSection => s !== null);

      // Step 1: parse categories from ORIGINAL titles before humanization
      // key → { category, cleanTitle (markers stripped) }
      type PreParsed = { category: TaskCategory | null; cleanTitle: string };
      const preParsedMap = new Map<string, PreParsed>();
      for (const s of rawSections) {
        for (const t of s.tasks) {
          const key = t.cardId?.toString() ?? t.title;
          if (!preParsedMap.has(key)) {
            const parsed = parseTaskTitle(t);
            preParsedMap.set(key, { category: parsed.category, cleanTitle: parsed.cleanTitle });
          }
        }
      }

      // Step 2: humanize the CLEAN titles (markers already stripped) via LLM
      const allTasksFlat = rawSections.flatMap(s =>
        s.tasks.map(t => {
          const key = t.cardId?.toString() ?? t.title;
          const clean = preParsedMap.get(key)?.cleanTitle ?? t.title;
          return { id: key, title: clean };
        })
      );

      // Deduplicate by id before sending to LLM
      const uniqueTasksForLLM = Array.from(
        new Map(allTasksFlat.map(t => [t.id, t])).values()
      );

      let humanizedMap = new Map<string, string>();
      if (uniqueTasksForLLM.length > 0) {
        try {
          const humanizeRes = await fetch("/api/llm/humanize-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tasks: uniqueTasksForLLM }),
          });
          if (humanizeRes.ok) {
            const { tasks: humanized } = await humanizeRes.json();
            for (const h of humanized) humanizedMap.set(h.id, h.title);
          }
        } catch {
          // fallback: use clean titles
        }
      }

      // Step 3: build TaskForEmail — category from pre-parsed, displayTitle from LLM (or clean fallback)
      const sections: TeamSection[] = rawSections.map(s => ({
        teamName: s.teamName,
        sprintTitle: s.sprintTitle,
        tasks: s.tasks.map(t => {
          const key = t.cardId?.toString() ?? t.title;
          const pre = preParsedMap.get(key);
          const displayTitle = humanizedMap.get(key) ?? pre?.cleanTitle ?? t.title;
          return {
            key,
            displayTitle,
            category: pre?.category ?? null,
            condition: t.condition,
            initCardId: t.initCardId,
          } satisfies TaskForEmail;
        }),
      }));

      const htmlBody = generateHtmlBody(
        selectedMeeting,
        selectedTeamNames,
        sections,
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
      onOpenChange(false);
    } finally {
      setIsDownloading(false);
    }
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
                        className="border-[#cd253d] data-[state=checked]:bg-[#cd253d] data-[state=checked]:border-[#cd253d]"
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
            disabled={!selectedMeeting || isDownloading}
            onClick={handleDownload}
            style={{ backgroundColor: "#cd253d" }}
            className="text-white hover:opacity-90 border-0"
            data-testid="button-download-sprint-letter"
          >
            {isDownloading
              ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              : <Download className="h-4 w-4 mr-2" />}
            {isDownloading ? "Загрузка..." : "Скачать"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── TeamHeader ───────────────────────────────────────────────────────────────

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
