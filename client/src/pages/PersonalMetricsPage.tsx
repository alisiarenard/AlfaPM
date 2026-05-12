import { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TeamMemberRow, DepartmentWithTeamCount, TeamRow, PersonalMetricsRow } from "@shared/schema";

interface Props {
  setPageSubtitle?: (s: string) => void;
}

const ROLE_TABS = [
  { value: "Разработчик", label: "Разработчики" },
  { value: "Тестировщик", label: "Тестировщики" },
  { value: "Аналитик",   label: "Аналитики" },
  { value: "Дизайнер",   label: "Дизайнеры" },
];

const METRIC_COLS: { key: keyof Omit<PersonalMetricsRow, "id" | "memberId" | "year">; label: string }[] = [
  { key: "codeQuality",        label: "Качество кода" },
  { key: "taskComplexity",     label: "Сложность задач" },
  { key: "productivity",       label: "Производительность" },
  { key: "estimationAccuracy", label: "Точность оценки" },
  { key: "documentation",      label: "Документирование" },
  { key: "communication",      label: "Коммуникации" },
  { key: "discipline",         label: "Дисциплина" },
];

const currentYear = new Date().getFullYear();

function MetricCell({
  memberId, metricKey, value, year,
}: {
  memberId: string;
  metricKey: string;
  value: number | null | undefined;
  year: number;
}) {
  const [local, setLocal] = useState<string>(value != null ? String(value) : "");
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      setLocal(value != null ? String(value) : "");
      prevValue.current = value;
    }
  }, [value]);

  const mutation = useMutation({
    mutationFn: async (val: number | null) => {
      await apiRequest("PUT", `/api/personal-metrics/${memberId}`, { year, [metricKey]: val });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personal-metrics"] });
    },
  });

  function handleBlur() {
    const parsed = local.trim() === "" ? null : Number(local);
    if (parsed !== null && (isNaN(parsed) || parsed < 1 || parsed > 10)) return;
    if (parsed !== (value ?? null)) mutation.mutate(parsed);
  }

  return (
    <td className="border-b border-border px-3 py-0 text-center" style={{ minWidth: 100 }}>
      <input
        type="number"
        min={1}
        max={10}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        placeholder="—"
        className="w-14 text-center bg-transparent text-sm outline-none border-0 focus:ring-1 focus:ring-primary rounded px-1 py-1 no-arrows"
        data-testid={`input-metric-${memberId}-${metricKey}`}
      />
    </td>
  );
}

export default function PersonalMetricsPage({ setPageSubtitle }: Props) {
  const [, params] = useRoute("/personal-metrics/:departmentId");
  const departmentId = params?.departmentId ?? "";
  const [activeTab, setActiveTab] = useState(ROLE_TABS[0].value);
  const [year] = useState(currentYear);

  const { data: departments } = useQuery<DepartmentWithTeamCount[]>({
    queryKey: ["/api/departments"],
  });

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
    queryKey: ["/api/personal-metrics", departmentId, year],
    queryFn: async () => {
      const res = await fetch(`/api/personal-metrics?departmentId=${departmentId}&year=${year}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const department = departments?.find((d) => d.id === departmentId);

  useEffect(() => {
    if (setPageSubtitle) setPageSubtitle(department?.department ?? "");
    return () => { if (setPageSubtitle) setPageSubtitle(""); };
  }, [department, setPageSubtitle]);

  const teamMap = Object.fromEntries((teams ?? []).map((t) => [t.teamId, t.teamName]));
  const metricsMap = Object.fromEntries((metricsRows ?? []).map((r) => [r.memberId, r]));

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
            const filtered = (members ?? []).filter((m) => m.role === tab.value);
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-4">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Нет участников с ролью «{tab.label}»</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/50">
                          <th
                            className="sticky left-0 z-10 bg-muted/50 text-left px-4 py-2.5 font-semibold text-foreground border-b border-border whitespace-nowrap"
                            style={{ minWidth: 200 }}
                          >
                            Сотрудник
                          </th>
                          {METRIC_COLS.map((col) => (
                            <th
                              key={col.key}
                              className="px-3 py-2.5 font-semibold text-center text-foreground border-b border-border whitespace-nowrap"
                              style={{ minWidth: 100 }}
                            >
                              {col.label}
                            </th>
                          ))}
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
                                  memberId={m.id}
                                  metricKey={col.key}
                                  value={metrics?.[col.key] ?? null}
                                  year={year}
                                />
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
