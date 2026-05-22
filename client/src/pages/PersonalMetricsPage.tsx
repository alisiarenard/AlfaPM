import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TeamMemberRow, TeamRow, PersonalMetricsRow } from "@shared/schema";

interface Props {
  selectedDepartment: string;
  selectedYear: string;
}

interface MetricsSnapshot {
  mrs_with_ai_review: number;
  avg_issues_per_mr: number;
  avg_critical_per_mr: number;
  avg_high_per_mr: number;
  clean_mr_rate: number;
  problem_mr_rate: number;
  critical_accept_rate: number;
  weekly_trend: string;
  category_distribution?: Record<string, number>;
  verdict_distribution?: Record<string, number>;
  severity_distribution?: Record<string, number>;
}

interface ContributionSnapshot {
  sp_share?: number;
  elevated_rate?: number;
  rework_rate?: number;
  tech_debt_rate?: number;
  total_team_size?: number;
  team_total_tasks?: number;
  tasks_without_size?: number;
  low_complexity_rate?: number;
  high_complexity_rate?: number;
  contribution_sp_share?: number;
  developer_tasks_count?: number;
  developer_story_points?: number;
  medium_complexity_rate?: number;
  team_total_story_points?: number;
  contribution_tasks_share?: number;
  developer_elevated_count?: number;
  team_elevated_count?: number;
}

interface ContributionStatus {
  status: "completed" | "in_progress" | "not_found";
  score: number | null;
  grade: string | null;
  metricsSnapshot: ContributionSnapshot | null;
  evaluatedAt: string | null;
  errorMessage: string | null;
}

interface EvaluationStatus {
  developerId: string;
  status: "completed" | "in_progress" | "not_found";
  score: number | null;
  grade: string | null;
  metricsSnapshot: MetricsSnapshot | null;
  evaluatedAt: string | null;
  contribution?: ContributionStatus;
}

interface PersonalMetricsResponse {
  metrics: PersonalMetricsRow[];
  evaluations: EvaluationStatus[];
  members: TeamMemberRow[];
}

const ROLE_TABS = [
  { value: "Разработчик", label: "Разработчики" },
  { value: "Тестировщик", label: "Тестировщики" },
  { value: "Аналитик",   label: "Аналитики" },
];

const QUARTER_TABS = [
  { key: 1, label: "I квартал" },
  { key: 2, label: "II квартал" },
  { key: 3, label: "III квартал" },
  { key: 4, label: "IV квартал" },
] as const;

const METRIC_KEYS = [
  "codeQuality",
  "taskComplexity",
  "productivity",
  "estimationAccuracy",
  "aiUsage",
  "communication",
  "discipline",
] as const;

type MetricKey = typeof METRIC_KEYS[number];

const METRIC_COLS: { key: MetricKey; label: string }[] = [
  { key: "codeQuality",        label: "Качество кода" },
  { key: "taskComplexity",     label: "Вклад" },
  { key: "productivity",       label: "Производительность" },
  { key: "estimationAccuracy", label: "Точность оценки" },
  { key: "aiUsage",            label: "AI-влияние" },
  { key: "communication",      label: "Коммуникации" },
  { key: "discipline",         label: "Дисциплина" },
];

function RatingCircles({ value }: { value: number | null | undefined }) {
  const v = value ?? 0;
  const filledClass: Record<number, string> = {
    1: "bg-destructive/20",
    2: "bg-destructive/40",
    3: "bg-destructive/60",
    4: "bg-destructive/80",
    5: "bg-destructive",
  };
  const filled = filledClass[v] ?? "bg-muted-foreground/30";
  return (
    <div className="flex items-center justify-center" style={{ gap: 2 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{ width: 8, height: 15, borderRadius: 2, display: 'inline-block', flexShrink: 0 }}
          className={i < v ? filled : "bg-muted"}
        />
      ))}
    </div>
  );
}

function MetricCell({ value }: { value: number | null | undefined }) {
  return (
    <td className="border-b border-border px-3 py-2.5 text-center" style={{ minWidth: 100 }}>
      <RatingCircles value={value} />
    </td>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const SNAPSHOT_LABELS: { key: keyof MetricsSnapshot; label: string; format?: (v: any) => string }[] = [
  { key: "mrs_with_ai_review",  label: "MR с AI ревью" },
  { key: "avg_critical_per_mr", label: "Критические замечания на MR" },
  { key: "clean_mr_rate",       label: "Чистые MR",       format: pct },
];

function CodeQualityCell({ evaluation }: { evaluation: EvaluationStatus | undefined }) {
  const hasScore = evaluation?.status === "completed" && evaluation.score !== null;
  const snap = hasScore ? evaluation!.metricsSnapshot : null;

  const circles = <RatingCircles value={hasScore ? evaluation!.score : null} />;

  if (!snap) {
    return (
      <td className="border-b border-border px-3 py-2.5 text-center" style={{ minWidth: 100 }}>
        {circles}
      </td>
    );
  }

  return (
    <td className="border-b border-border px-3 py-2.5 text-center" style={{ minWidth: 100 }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex cursor-default">{circles}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-3 text-xs space-y-1.5 min-w-52">
          {SNAPSHOT_LABELS.map(({ key, label, format }) => {
            const raw = snap[key];
            const displayed = format ? format(raw as number) : String(raw);
            const isRed = key === "problem_mr_rate" && (raw as number) > 0.3;
            return (
              <div key={key} className="flex justify-between gap-6">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-medium tabular-nums ${isRed ? "text-destructive" : ""}`}>
                  {displayed}
                </span>
              </div>
            );
          })}
          {(() => {
            const rows: { label: string; value: string; red?: boolean }[] = [];

            if (snap.verdict_distribution) {
              const total = Object.values(snap.verdict_distribution).reduce((s, v) => s + v, 0);
              const blocked = snap.verdict_distribution["blocked"] ?? 0;
              const pctBlocked = total > 0 ? Math.round((blocked / total) * 100) : 0;
              rows.push({ label: "Блокирующие MRs", value: `${pctBlocked}%`, red: pctBlocked > 20 });
            }

            if (snap.severity_distribution) {
              const total = Object.values(snap.severity_distribution).reduce((s, v) => s + v, 0);
              const critical = snap.severity_distribution["critical"] ?? 0;
              const pctCritical = total > 0 ? Math.round((critical / total) * 100) : 0;
              rows.push({ label: "MR с критичными изменениями", value: `${pctCritical}%` });
            }

            if (rows.length === 0) return null;
            return rows.map(({ label, value, red }) => (
              <div key={label} className="flex justify-between gap-6">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-medium tabular-nums ${red ? "text-destructive" : ""}`}>{value}</span>
              </div>
            ));
          })()}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

const CONTRIBUTION_LABELS: { label: string; compute: (s: ContributionSnapshot) => string }[] = [
  {
    label: "Доля SP",
    compute: s => s.sp_share != null ? pct(s.sp_share) : "—",
  },
  {
    label: "Задачи повышенной сложности",
    compute: s => s.elevated_rate != null ? pct(s.elevated_rate) : "—",
  },
];

function ContributionCell({ evaluation }: { evaluation: EvaluationStatus | undefined }) {
  const contrib = evaluation?.contribution;
  const hasScore = contrib?.status === "completed" && contrib.score !== null;
  const snap = hasScore ? contrib!.metricsSnapshot : null;

  const circles = <RatingCircles value={hasScore ? contrib!.score : null} />;

  if (!snap) {
    return (
      <td className="border-b border-border px-3 py-2.5 text-center" style={{ minWidth: 100 }}>
        {circles}
      </td>
    );
  }

  return (
    <td className="border-b border-border px-3 py-2.5 text-center" style={{ minWidth: 100 }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex cursor-default">{circles}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-3 text-xs space-y-1.5 min-w-52">
          {CONTRIBUTION_LABELS.map(({ label, compute }) => (
            <div key={label} className="flex justify-between gap-6">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">{compute(snap)}</span>
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

function calcAverage(metrics: PersonalMetricsRow | undefined, evaluation: EvaluationStatus | undefined): number | null {
  const vals: number[] = [];
  if (evaluation?.status === "completed" && evaluation.score != null && evaluation.score > 0) vals.push(evaluation.score);
  if (evaluation?.contribution?.status === "completed" && evaluation.contribution.score != null && evaluation.contribution.score > 0) vals.push(evaluation.contribution.score);
  if (metrics) {
    const metricKeys: (keyof PersonalMetricsRow)[] = ["productivity", "estimationAccuracy", "aiUsage", "communication", "discipline"];
    for (const k of metricKeys) {
      const v = metrics[k];
      if (typeof v === "number" && v > 0) vals.push(v);
    }
  }
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function AverageCell({ metrics, evaluation }: { metrics: PersonalMetricsRow | undefined; evaluation: EvaluationStatus | undefined }) {
  const avg = calcAverage(metrics, evaluation);

  if (avg === null) {
    return (
      <td className="border-b border-border px-3 py-2.5 text-center text-muted-foreground text-sm" style={{ minWidth: 80 }}>
        —
      </td>
    );
  }

  const color = avg <= 2 ? "text-destructive" : "text-foreground/60";

  return (
    <td className={`border-b border-border px-3 py-2.5 text-center font-bold text-sm ${color}`} style={{ minWidth: 80 }}>
      {avg.toFixed(1)}
    </td>
  );
}

function getPeriod(year: number, quarter: number): { periodStart: string; periodEnd: string } {
  const ranges: Record<number, [string, string]> = {
    1: [`${year}-01-01`, `${year}-03-31`],
    2: [`${year}-04-01`, `${year}-06-30`],
    3: [`${year}-07-01`, `${year}-09-30`],
    4: [`${year}-10-01`, `${year}-12-31`],
  };
  const [periodStart, periodEnd] = ranges[quarter] ?? ranges[1];
  return { periodStart, periodEnd };
}

export default function PersonalMetricsPage({ selectedDepartment, selectedYear }: Props) {
  const departmentId = selectedDepartment;
  const year = Number(selectedYear);
  const [activeTab, setActiveTab] = useState(ROLE_TABS[0].value);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncingMemberId, setSyncingMemberId] = useState<string | null>(null);
  const [isSyncingTeam, setIsSyncingTeam] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // URL-driven team and quarter (location from wouter triggers re-renders on navigation)
  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const teamId = urlParams.get("team") ?? "all";
  const quarter = Number(urlParams.get("quarter") ?? "1");

  function setQuarter(q: number) {
    const p = new URLSearchParams(window.location.search);
    if (q === 1) p.delete("quarter"); else p.set("quarter", String(q));
    const qs = p.toString();
    setLocation(window.location.pathname + (qs ? `?${qs}` : ""));
  }

  const { data: teams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${departmentId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const { data: metricsData, isLoading } = useQuery<PersonalMetricsResponse>({
    queryKey: ["/api/personal-metrics", departmentId, year, quarter, teamId],
    queryFn: async () => {
      const p = new URLSearchParams({ departmentId, year: String(year), quarter: String(quarter) });
      if (teamId !== "all") p.set("teamId", teamId);
      const res = await fetch(`/api/personal-metrics?${p.toString()}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const members = metricsData?.members ?? [];
  const metricsRows = metricsData?.metrics ?? [];
  const evaluations = metricsData?.evaluations ?? [];

  const teamMap = Object.fromEntries((teams ?? []).map((t) => [t.teamId, t.teamName]));
  const metricsMap = Object.fromEntries(metricsRows.map((r) => [r.memberId, r]));
  const evaluationsMap = Object.fromEntries(evaluations.map((e) => [e.developerId, e]));

  async function syncTeam() {
    if (!teamId || teamId === "all") return;
    setIsSyncingTeam(true);
    try {
      const res = await fetch("/api/evaluations/sync-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, quarter, year, forceRecompute: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка синхронизации");
      toast({ title: "Синхронизация завершена", description: "Данные команды отправлены в сервис оценки" });
      queryClient.invalidateQueries({ queryKey: ["/api/personal-metrics", departmentId, year, quarter, teamId] });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setIsSyncingTeam(false);
    }
  }

  async function syncMember(m: TeamMemberRow) {
    const teamDevelopers = members.filter((x) => x.teamId === m.teamId && x.role === "Разработчик");
    const gitlabUsernames = m.gitlabUsername ? [m.gitlabUsername] : [];
    const { periodStart, periodEnd } = getPeriod(year, quarter);
    const payload = {
      developerId: m.username,
      teamId: m.teamId,
      totalTeamSize: teamDevelopers.length,
      gitlabUsernames,
      periodStart,
      periodEnd,
      forceRecompute: true,
    };
    setSyncingMemberId(m.id);
    try {
      const res = await fetch("/api/evaluations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка синхронизации");
      toast({ title: "Синхронизировано", description: `${m.fullName || m.username}` });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setSyncingMemberId(null);
    }
  }

  if (!departmentId) {
    return (
      <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto px-6 pt-6">
        <p className="text-sm text-muted-foreground">Выберите департамент для просмотра метрик</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto px-6 pt-3 pb-6">
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Загрузка...</p>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList data-testid="tabs-roles">
            {ROLE_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-role-${tab.value}`}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {ROLE_TABS.map((tab) => {
            const byRole = members.filter((m) => m.role === tab.value);
            const q = searchQuery.trim().toLowerCase();
            const filtered = (q
              ? byRole.filter((m) => (m.fullName || m.username).toLowerCase().includes(q))
              : byRole
            ).slice().sort((a, b) => {
              const avgA = calcAverage(metricsMap[a.id], evaluationsMap[a.username]);
              const avgB = calcAverage(metricsMap[b.id], evaluationsMap[b.username]);
              if (avgA === null && avgB === null) return 0;
              if (avgA === null) return 1;
              if (avgB === null) return -1;
              return avgB - avgA;
            });
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-0">
                {byRole.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-4">Нет участников с ролью «{tab.label}»</p>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden flex flex-col max-h-[85vh]">
                    <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between gap-2 shrink-0">
                      {teamId === "all" ? (
                        <div className="relative flex items-center">
                          <Search className="absolute left-0 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          <input
                            type="text"
                            placeholder="Поиск сотрудника..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-5 pr-3 py-1.5 text-sm bg-transparent border-0 border-b border-border outline-none focus:ring-0 w-56"
                            data-testid="input-search-member"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={syncTeam}
                          disabled={isSyncingTeam}
                          className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-sync-team"
                        >
                          <RefreshCw className={`h-4 w-4 ${isSyncingTeam ? "animate-spin" : ""}`} />
                        </button>
                      )}
                      <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
                        {QUARTER_TABS.map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setQuarter(key)}
                            className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
                              quarter === key
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            data-testid={`filter-quarter-${key}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-auto custom-scrollbar flex-1">
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-white dark:bg-background" style={{ backdropFilter: 'blur(8px)' }}>
                            <th
                              className="sticky left-0 z-10 bg-white dark:bg-background text-left px-4 py-3 text-xs font-normal text-muted-foreground border-b border-border whitespace-nowrap"
                              style={{ minWidth: 200 }}
                            >
                              Сотрудник
                            </th>
                            {METRIC_COLS.map((col) => (
                              <th
                                key={col.key}
                                className="px-4 py-3 text-xs font-normal text-center text-muted-foreground border-b border-border whitespace-nowrap"
                                style={{ minWidth: 110 }}
                              >
                                {col.label}
                              </th>
                            ))}
                            <th
                              className="px-4 py-3 text-xs font-normal text-center text-muted-foreground border-b border-border whitespace-nowrap"
                              style={{ minWidth: 80 }}
                            >
                              Итого
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((m) => {
                            const metrics = metricsMap[m.id];
                            const evaluation = evaluationsMap[m.username];
                            return (
                              <tr
                                key={m.id}
                                className="cursor-pointer"
                                data-testid={`row-member-${m.id}`}
                                onClick={(e) => {
                                  const target = e.target as HTMLElement;
                                  if (target.closest("button")) return;
                                  setLocation(`/personal-metrics/${departmentId}/member/${m.id}`);
                                }}
                              >
                                <td
                                  className="sticky left-0 z-10 bg-background border-b border-border px-4 py-2.5 whitespace-nowrap"
                                  style={{ minWidth: 200 }}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                      {m.avatarUrl ? (
                                        <img src={m.avatarUrl} alt={m.fullName || m.username} className="h-full w-full object-cover" />
                                      ) : (
                                        <span className="text-xs font-semibold text-muted-foreground">
                                          {(m.fullName || m.username).charAt(0).toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium truncate text-foreground">{m.fullName || m.username}</p>
                                      <p className="text-xs text-muted-foreground truncate">{teamMap[m.teamId] ?? ""}</p>
                                    </div>
                                  </div>
                                </td>
                                {METRIC_COLS.map((col) =>
                                  col.key === "codeQuality" ? (
                                    <CodeQualityCell key={col.key} evaluation={evaluation} />
                                  ) : col.key === "taskComplexity" ? (
                                    <ContributionCell key={col.key} evaluation={evaluation} />
                                  ) : (
                                    <MetricCell key={col.key} value={metrics?.[col.key] ?? null} />
                                  )
                                )}
                                <AverageCell
                                  metrics={metrics}
                                  evaluation={evaluation}
                                />
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
