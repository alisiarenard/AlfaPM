import { useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { TeamMemberRow, DepartmentWithTeamCount, TeamRow } from "@shared/schema";

interface Props {
  setPageSubtitle?: (s: string) => void;
}

export default function PersonalMetricsPage({ setPageSubtitle }: Props) {
  const [, params] = useRoute("/personal-metrics/:departmentId");
  const departmentId = params?.departmentId ?? "";

  const { data: departments } = useQuery<DepartmentWithTeamCount[]>({
    queryKey: ["/api/departments"],
  });

  const { data: members, isLoading } = useQuery<TeamMemberRow[]>({
    queryKey: ["/api/departments", departmentId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/departments/${departmentId}/members`);
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const { data: teams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", departmentId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${departmentId}`);
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    enabled: !!departmentId,
  });

  const department = departments?.find((d) => d.id === departmentId);

  useEffect(() => {
    if (setPageSubtitle) {
      setPageSubtitle(department?.department ?? "");
    }
    return () => { if (setPageSubtitle) setPageSubtitle(""); };
  }, [department, setPageSubtitle]);

  const teamMap = Object.fromEntries((teams ?? []).map((t) => [t.teamId, t.teamName]));

  const grouped: Record<string, TeamMemberRow[]> = {};
  for (const m of members ?? []) {
    if (!grouped[m.teamId]) grouped[m.teamId] = [];
    grouped[m.teamId].push(m);
  }

  return (
    <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto px-6 py-6">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : !members || members.length === 0 ? (
        <p className="text-sm text-muted-foreground">В этом подразделении нет участников</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([teamId, teamMembers]) => (
            <div key={teamId}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                {teamMap[teamId] ?? "Команда"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {teamMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-md bg-card border border-border"
                    data-testid={`card-member-${m.id}`}
                  >
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.fullName || m.username} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">
                          {(m.fullName || m.username).charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.fullName || m.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
