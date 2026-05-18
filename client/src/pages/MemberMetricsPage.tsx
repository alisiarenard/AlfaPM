import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TeamMemberRow, TeamRow, PersonalMetricsRow } from "@shared/schema";

interface MetricsSnapshot {
  mrs_with_ai_review: number;
  avg_issues_per_mr: number;
  avg_critical_per_mr: number;
  avg_high_per_mr: number;
  clean_mr_rate: number;
  problem_mr_rate: number;
  critical_accept_rate: number;
  weekly_trend: string;
}

interface EvaluationStatus {
  developerId: string;
  status: "completed" | "in_progress" | "not_found";
  score: number | null;
  grade: string | null;
  metricsSnapshot: MetricsSnapshot | null;
  evaluatedAt: string | null;
}

interface PersonalMetricsResponse {
  metrics: PersonalMetricsRow[];
  evaluations: EvaluationStatus[];
}

interface Props {
  departmentId: string;
  memberId: string;
  quarter: number;
  year: string;
  setMemberInfo: (info: { fullName: string; role: string; teamName: string; avatarUrl?: string | null } | null) => void;
}

const METRIC_COLS: { key: keyof PersonalMetricsRow; label: string }[] = [
  { key: "codeQuality",        label: "Качество кода" },
  { key: "taskComplexity",     label: "Вклад" },
  { key: "productivity",       label: "Производительность" },
  { key: "estimationAccuracy", label: "Точность оценки" },
  { key: "aiUsage",            label: "AI-usage" },
  { key: "communication",      label: "Коммуникации" },
  { key: "discipline",         label: "Дисциплина" },
];

const SNAPSHOT_LABELS: { key: keyof MetricsSnapshot; label: string; format?: (v: any) => string }[] = [
  { key: "mrs_with_ai_review",  label: "MR с AI ревью" },
  { key: "avg_critical_per_mr", label: "Критические замечания на MR" },
  { key: "clean_mr_rate",       label: "Чистые MR",     format: (v) => `${Math.round(v * 100)}%` },
  { key: "problem_mr_rate",     label: "Проблемные MR", format: (v) => `${Math.round(v * 100)}%` },
  { key: "weekly_trend",        label: "Тренд" },
];

function RatingCircles({ value, size = "md" }: { value: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  const v = value ?? 0;
  const dim = size === "lg" ? "h-3 w-3" : size === "sm" ? "h-1.5 w-1.5" : "h-2.5 w-2.5";

  function getColor(i: number): string {
    if (i >= v) return "bg-muted";
    if (v >= 5) return "bg-emerald-500";
    if (v >= 4) return "bg-emerald-400";
    if (v >= 3) return "bg-yellow-400";
    if (v >= 2) return "bg-orange-400";
    return "bg-destructive/60";
  }

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`${dim} rounded-full inline-block ${getColor(i)}`} />
      ))}
    </div>
  );
}

function calcAverage(metrics: PersonalMetricsRow | undefined): number | null {
  if (!metrics) return null;
  const keys = METRIC_COLS.map((c) => c.key);
  const vals = keys.map((k) => metrics[k] as number | null).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function scoreLabel(v: number | null): string {
  if (v === null) return "—";
  if (v >= 5) return "Отлично";
  if (v >= 4) return "Хорошо";
  if (v >= 3) return "Средне";
  if (v >= 2) return "Ниже среднего";
  return "Слабо";
}

function scoreColor(v: number | null): string {
  if (v === null) return "text-muted-foreground";
  if (v >= 4) return "text-emerald-500";
  if (v >= 3) return "text-yellow-500";
  return "text-destructive";
}

export default function MemberMetricsPage({ departmentId, memberId, quarter, year, setMemberInfo }: Props) {
  const { data: members } = useQuery<TeamMemberRow[]>({
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
    queryKey: ["/api/personal-metrics", departmentId, Number(year), quarter],
    queryFn: async () => {
      const res = await fetch(`/api/personal-metrics?departmentId=${departmentId}&year=${year}&quarter=${quarter}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const member = members?.find((m) => m.id === memberId);
  const teamName = teams?.find((t) => t.teamId === member?.teamId)?.teamName ?? "";
  const metrics = metricsData?.metrics.find((r) => r.memberId === memberId);
  const evaluations = metricsData?.evaluations ?? [];
  const evaluation = member ? evaluations.find((e) => e.developerId === member.username) : undefined;

  useEffect(() => {
    if (member) {
      setMemberInfo({
        fullName: member.fullName || member.username,
        role: member.role,
        teamName: teamName,
        avatarUrl: member.avatarUrl,
      });
    }
    return () => setMemberInfo(null);
  }, [member?.id, teamName]);

  const avg = calcAverage(metrics);
  const hasEval = evaluation?.status === "completed" && evaluation.score !== null;
  const snap = hasEval ? evaluation!.metricsSnapshot : null;

  if (!member) {
    return (
      <div className="max-w-[900px] mx-auto px-6 pt-8">
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto px-6 pt-6 pb-10">
      {avg !== null && (
        <div className="flex items-center justify-between mb-8">
          {member.gitlabUsername && (
            <p className="text-sm text-muted-foreground">@{member.gitlabUsername}</p>
          )}
          <div className="ml-auto text-right">
            <p className="text-3xl font-bold text-foreground">{avg}</p>
            <p className={`text-sm font-medium ${scoreColor(avg)}`}>{scoreLabel(avg)}</p>
            <p className="text-xs text-muted-foreground">средний балл</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {METRIC_COLS.map((col) => {
          const isCodeQuality = col.key === "codeQuality";
          const rawValue = metrics?.[col.key] as number | null | undefined;
          const displayValue = isCodeQuality && hasEval ? evaluation!.score : rawValue ?? null;

          const card = (
            <div
              key={col.key}
              className="rounded-md border border-border bg-card p-4 flex flex-col gap-3"
            >
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{col.label}</p>
              <div className="flex items-end justify-between">
                <RatingCircles value={displayValue} size="lg" />
                <span className={`text-2xl font-bold ${scoreColor(displayValue)}`}>
                  {displayValue ?? "—"}
                </span>
              </div>
              {displayValue !== null && (
                <p className={`text-xs font-medium ${scoreColor(displayValue)}`}>{scoreLabel(displayValue)}</p>
              )}
            </div>
          );

          if (isCodeQuality && snap) {
            return (
              <Tooltip key={col.key}>
                <TooltipTrigger asChild>
                  <div className="cursor-default">{card}</div>
                </TooltipTrigger>
                <TooltipContent side="top" className="p-3 text-xs space-y-1.5 min-w-48">
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
                </TooltipContent>
              </Tooltip>
            );
          }

          return card;
        })}
      </div>
    </div>
  );
}
