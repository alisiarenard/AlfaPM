import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, RefreshCw, Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TeamMemberRow, TeamRow, PersonalMetricsRow } from "@shared/schema";

interface Props {
  selectedDepartment: string;
  selectedYear: string;
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
  { key: "taskComplexity",     label: "Сложность задач" },
  { key: "productivity",       label: "Производительность" },
  { key: "estimationAccuracy", label: "Точность оценки" },
  { key: "aiUsage",            label: "AI-usage" },
  { key: "communication",      label: "Коммуникации" },
  { key: "discipline",         label: "Дисциплина" },
];

function RatingCircles({ value }: { value: number | null | undefined }) {
  const v = value ?? 0;

  function getColor(i: number): string {
    if (i >= v) return "bg-muted";
    if (v <= 2) return "bg-muted-foreground/50";
    if (v <= 4) return "bg-destructive/40";
    return "bg-destructive";
  }

  return (
    <div className="flex items-center justify-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full inline-block ${getColor(i)}`} />
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

  const { data: metricsRows } = useQuery<PersonalMetricsRow[]>({
    queryKey: ["/api/personal-metrics", departmentId, year, quarter],
    queryFn: async () => {
      const res = await fetch(`/api/personal-metrics?departmentId=${departmentId}&year=${year}&quarter=${quarter}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const teamMap = Object.fromEntries((teams ?? []).map((t) => [t.teamId, t.teamName]));
  const metricsMap = Object.fromEntries((metricsRows ?? []).map((r) => [r.memberId, r]));

  async function syncMember(m: TeamMemberRow, allMembers: TeamMemberRow[]) {
    const sameTeamRole = allMembers.filter((x) => x.teamId === m.teamId && x.role === m.role);
    const gitlabUsernames = sameTeamRole.map((x) => x.gitlabUsername).filter((u): u is string => !!u);
    const { periodStart, periodEnd } = getPeriod(year, quarter);
    const payload = {
      developerId: m.username,
      teamId: m.teamId,
      totalTeamSize: sameTeamRole.length,
      gitlabUsernames,
      periodStart,
      periodEnd,
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
                            return (
                              <tr key={m.id} className="hover-elevate" data-testid={`row-member-${m.id}`}>
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
                                {METRIC_COLS.map((col) => (
                                  <MetricCell
                                    key={col.key}
                                    value={metrics?.[col.key] ?? null}
                                  />
                                ))}
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
