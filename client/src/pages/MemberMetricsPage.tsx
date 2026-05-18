import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
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
  low_sample?: boolean;
  verdict_distribution?: { blocked: number; approved: number; needs_changes: number; ready_with_improvements: number };
  category_distribution?: Record<string, number>;
  severity_distribution?: { low: number; high: number; medium: number; critical: number };
  top3_recurring_categories?: string[];
}

interface EvidenceRef {
  note: string;
  mr_url: string;
  verdict: string;
  mr_title: string;
  issues_count: number;
}

interface DeveloperSummary {
  strengths: string[];
  growthAreas: string[];
  recommendations: string[];
}

interface ManagerSummary {
  gradeRationale: string;
  criticalIssues: string[];
  recurringPatterns: string[];
  keyStrengths: string[];
  calibrationNotes: string;
  teamContextText: string | null;
}

interface EvaluationDetail {
  developerId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  score: number | null;
  confidence: number | null;
  grade: string | null;
  gradeConfidence: number | null;
  gradeDisclaimer: string | null;
  evaluatedAt: string | null;
  metricsSnapshot: MetricsSnapshot | null;
  evidenceRefs: EvidenceRef[];
  managerSummary: ManagerSummary | null;
  developerSummary: DeveloperSummary | null;
  summariesAvailable: boolean;
  errorMessage: string | null;
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

const VERDICT_COLOR: Record<string, string> = {
  APPROVED: "text-emerald-500",
  BLOCKED: "text-destructive",
  NEEDS_CHANGES: "text-yellow-500",
  READY_WITH_IMPROVEMENTS: "text-blue-400",
};

function RatingCircles({ value, size = "md" }: { value: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  const v = value ?? 0;
  const dim = size === "lg" ? "h-2.5 w-2.5" : size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  function getColor(i: number): string {
    if (i >= v) return "bg-muted";
    if (v >= 5) return "bg-emerald-500";
    if (v >= 4) return "bg-emerald-400";
    if (v >= 3) return "bg-yellow-400";
    if (v >= 2) return "bg-orange-400";
    return "bg-destructive/60";
  }

  return (
    <div className="flex items-center gap-0.5">
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{children}</p>
  );
}

function ListCard({ title, items, color }: { title: string; items: string[]; color?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-2 min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-foreground leading-snug">
              <span className={`mt-0.5 shrink-0 text-xs ${color ?? "text-muted-foreground"}`}>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

  const periodRanges: Record<number, [string, string]> = {
    1: [`${year}-01-01`, `${year}-03-31`],
    2: [`${year}-04-01`, `${year}-06-30`],
    3: [`${year}-07-01`, `${year}-09-30`],
    4: [`${year}-10-01`, `${year}-12-31`],
  };
  const [periodStart, periodEnd] = periodRanges[quarter] ?? periodRanges[1];

  const { data: detail } = useQuery<EvaluationDetail>({
    queryKey: ["/api/evaluations/detail", member?.username, periodStart, periodEnd],
    queryFn: async () => {
      const res = await fetch(
        `/api/evaluations/detail?developerId=${encodeURIComponent(member!.username)}&periodStart=${periodStart}&periodEnd=${periodEnd}`
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!member?.username,
  });

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

  const devSummary = detail?.developerSummary;
  const mgrSummary = detail?.managerSummary;
  const evidenceRefs = detail?.evidenceRefs ?? [];

  if (!member) {
    return (
      <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto px-6 pt-8">
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto px-6 pt-6 pb-12 space-y-8">

      {/* ── Метрики: одна строка ── */}
      <div>
        {avg !== null && (
          <div className="flex items-center gap-3 mb-4">
            {member.gitlabUsername && (
              <p className="text-sm text-muted-foreground">@{member.gitlabUsername}</p>
            )}
            <div className="ml-auto flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${scoreColor(avg)}`}>{avg}</span>
              <span className={`text-sm font-medium ${scoreColor(avg)}`}>{scoreLabel(avg)}</span>
              <span className="text-xs text-muted-foreground">средний балл</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-7 gap-2">
          {METRIC_COLS.map((col) => {
            const isCodeQuality = col.key === "codeQuality";
            const rawValue = metrics?.[col.key] as number | null | undefined;
            const displayValue = isCodeQuality && hasEval ? evaluation!.score : rawValue ?? null;

            const card = (
              <div
                key={col.key}
                className="rounded-md border border-border bg-card p-3 flex flex-col gap-2"
              >
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide leading-tight">{col.label}</p>
                <div className="flex items-center justify-between gap-1">
                  <RatingCircles value={displayValue} size="md" />
                  <span className={`text-xl font-bold ${scoreColor(displayValue)}`}>
                    {displayValue ?? "—"}
                  </span>
                </div>
                {displayValue !== null && (
                  <p className={`text-[10px] font-medium ${scoreColor(displayValue)}`}>{scoreLabel(displayValue)}</p>
                )}
              </div>
            );

            if (isCodeQuality && snap) {
              return (
                <Tooltip key={col.key}>
                  <TooltipTrigger asChild>
                    <div className="cursor-default">{card}</div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="p-3 text-xs space-y-1.5 min-w-48">
                    {SNAPSHOT_LABELS.map(({ key, label, format }) => {
                      const raw = snap[key as keyof MetricsSnapshot];
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

      {/* ── Секция для разработчика ── */}
      {devSummary && (
        <div>
          <SectionTitle>Для разработчика</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            <ListCard
              title="Сильные стороны"
              items={devSummary.strengths}
              color="text-emerald-500"
            />
            <ListCard
              title="Зоны роста"
              items={devSummary.growthAreas}
              color="text-yellow-500"
            />
            <ListCard
              title="Рекомендации"
              items={devSummary.recommendations}
              color="text-blue-400"
            />
          </div>
        </div>
      )}

      {/* ── Секция для руководителя ── */}
      {mgrSummary && (
        <div>
          <SectionTitle>Для руководителя</SectionTitle>
          <div className="space-y-3">

            {/* Обоснование грейда + calibration */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-card p-4 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Обоснование грейда</p>
                <p className="text-sm text-foreground leading-relaxed">{mgrSummary.gradeRationale}</p>
              </div>
              <div className="rounded-md border border-border bg-card p-4 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Калибровочные заметки</p>
                <p className="text-sm text-foreground leading-relaxed">{mgrSummary.calibrationNotes}</p>
              </div>
            </div>

            {/* Критические проблемы + паттерны + сильные стороны */}
            <div className="grid grid-cols-3 gap-3">
              <ListCard
                title="Критические проблемы"
                items={mgrSummary.criticalIssues}
                color="text-destructive"
              />
              <ListCard
                title="Повторяющиеся паттерны"
                items={mgrSummary.recurringPatterns}
                color="text-yellow-500"
              />
              <ListCard
                title="Сильные стороны"
                items={mgrSummary.keyStrengths}
                color="text-emerald-500"
              />
            </div>

            {/* Evidence refs */}
            {evidenceRefs.length > 0 && (
              <div className="rounded-md bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Примеры MR</p>
                <div className="grid grid-cols-2 gap-2">
                  {evidenceRefs.map((ref, i) => (
                    <a
                      key={i}
                      href={ref.mr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-3 rounded border border-border px-3 py-2 hover-elevate group"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs text-muted-foreground">{ref.note}</p>
                        <p className="text-sm text-foreground truncate">{ref.mr_title}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${VERDICT_COLOR[ref.verdict] ?? "text-muted-foreground"}`}>
                            {ref.verdict}
                          </span>
                          {ref.issues_count > 0 && (
                            <span className="text-xs text-muted-foreground">{ref.issues_count} замеч.</span>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
