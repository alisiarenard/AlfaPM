import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, RefreshCw, Loader2 } from "lucide-react";
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
  tech_debt_rate: number;
  total_team_size: number;
  team_total_tasks: number;
  tasks_without_size: number;
  low_complexity_rate: number;
  high_complexity_rate: number;
  contribution_sp_share: number;
  developer_tasks_count: number;
  developer_story_points: number;
  medium_complexity_rate: number;
  team_total_story_points: number;
  contribution_tasks_share: number;
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
}

const ROLE_TABS = [
  { value: "Разработчик", label: "Разработчики" },
  { value: "Тестировщик", label: "Тестировщики" },
  { value: "Аналитик",   label: "Аналитики" },
  { value: "Дизайнер",   label: "Дизайнеры" },
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
  { key: "aiUsage",            label: "AI-usage" },
  { key: "communication",      label: "Коммуникации" },
  { key: "discipline",         label: "Дисциплина" },
];

function RatingCircles({ value }: { value: number | null | undefined }) {
  const v = value ?? 0;
  const filled = v > 2 ? "bg-destructive" : "bg-muted-foreground/50";
  return (
    <div className="flex items-center justify-center" style={{ gap: 2 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{ width: 8, height: 15, borderRadius: 1, display: 'inline-block', flexShrink: 0 }}
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

const CONTRIBUTION_LABELS: { key: keyof ContributionSnapshot; label: string; format?: (v: any) => string }[] = [
  { key: "contribution_sp_share",   label: "Доля SP",    format: pct },
  { key: "contribution_tasks_share",label: "Доля задач", format: pct },
  { key: "high_complexity_rate",    label: "Высокая сложность", format: pct },
  { key: "medium_complexity_rate",  label: "Средняя сложность", format: pct },
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
          {CONTRIBUTION_LABELS.map(({ key, label, format }) => {
            const raw = snap[key];
            const displayed = format ? format(raw as number) : String(raw);
            return (
              <div key={key} className="flex justify-between gap-6">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{displayed}</span>
              </div>
            );
          })}
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

function calcAverage(metrics: PersonalMetricsRow | undefined): number | null {
  if (!metrics) return null;
  const vals = METRIC_KEYS.map((k) => metrics[k]).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function AverageCell({ metrics, queryKey, onSync, syncing }: { metrics: PersonalMetricsRow | undefined; queryKey: unknown[]; onSync: () => void; syncing: boolean }) {
  const avg = calcAverage(metrics);

  if (avg === null) {
    return (
      <td className="border-b border-border px-2 py-2.5 text-center" style={{ minWidth: 80 }}>
        <button
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Получить данные"
          data-testid="button-refetch-metrics"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </td>
    );
  }

  const color =
    avg <= 2 ? "text-muted-foreground" :
    avg <= 4 ? "text-destructive/70" :
    "text-destructive";

  return (
    <td className={`border-b border-border px-3 py-2.5 text-center font-semibold text-sm ${color}`} style={{ minWidth: 80 }}>
      {avg}
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
  const [quarter, setQuarter] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncingMemberId, setSyncingMemberId] = useState<string | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: members, isLoading } = useQuery<TeamMemberRow[]>({
    queryKey: ["/api/departments", departmentId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${departmentId}/members`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const { data: teams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${departmentId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const { data: metricsData } = useQuery<PersonalMetricsResponse>({
    queryKey: ["/api/personal-metrics", departmentId, year, quarter],
    queryFn: async () => {
      const res = await fetch(`/api/personal-metrics?departmentId=${departmentId}&year=${year}&quarter=${quarter}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const metricsRows = metricsData?.metrics ?? [];
  const evaluations = metricsData?.evaluations ?? [];

  const teamMap = Object.fromEntries((teams ?? []).map((t) => [t.teamId, t.teamName]));
  const metricsMap = Object.fromEntries(metricsRows.map((r) => [r.memberId, r]));
  const evaluationsMap = Object.fromEntries(evaluations.map((e) => [e.developerId, e]));

  async function syncMember(m: TeamMemberRow, allMembers: TeamMemberRow[]) {
    const sameTeamRole = allMembers.filter((x) => x.teamId === m.teamId && x.role === m.role);
    const gitlabUsernames = m.gitlabUsername ? [m.gitlabUsername] : [];
    const { periodStart, periodEnd } = getPeriod(year, quarter);
    const payload = {
      developerId: m.username,
      teamId: m.teamId,
      totalTeamSize: sameTeamRole.length,
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
            const byRole = (members ?? []).filter((m) => m.role === tab.value);
            const q = searchQuery.trim().toLowerCase();
            const filtered = q
              ? byRole.filter((m) => (m.fullName || m.username).toLowerCase().includes(q))
              : byRole;
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-0">
                {byRole.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-4">Нет участников с ролью «{tab.label}»</p>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between gap-2">
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
                    <div className="overflow-x-auto">
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
                                className="hover-elevate cursor-pointer"
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
                                  queryKey={["/api/personal-metrics", departmentId, year, quarter]}
                                  onSync={() => syncMember(m, members ?? [])}
                                  syncing={syncingMemberId === m.id}
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
