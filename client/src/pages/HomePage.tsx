import { useState } from "react";
import { TeamHeader } from "@/components/TeamHeader";
import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { TeamData } from "@shared/schema";

export default function HomePage() {
  // TODO: remove mock functionality - replace with real data from API
  const [teamData] = useState<TeamData>({
    team: {
      boardId: "BOARD-2024-Q1",
      teamId: "TEAM-PLATFORM-01",
      name: "Platform Engineering Team"
    },
    initiatives: [
      {
        id: "INIT-001",
        name: "Cloud Infrastructure Migration",
        status: "Active",
        startDate: "2024-01-15",
        size: 144,
        sprints: [
          { sprintId: "SP-2024-01", name: "Sprint 1", storyPoints: 21 },
          { sprintId: "SP-2024-02", name: "Sprint 2", storyPoints: 18 },
          { sprintId: "SP-2024-03", name: "Sprint 3", storyPoints: 24 },
          { sprintId: "SP-2024-04", name: "Sprint 4", storyPoints: 19 },
        ]
      },
      {
        id: "INIT-002",
        name: "API Gateway Redesign",
        status: "Planned",
        startDate: "2024-02-01",
        size: 89,
        sprints: [
          { sprintId: "SP-2024-02", name: "Sprint 2", storyPoints: 13 },
          { sprintId: "SP-2024-03", name: "Sprint 3", storyPoints: 21 },
          { sprintId: "SP-2024-04", name: "Sprint 4", storyPoints: 17 },
          { sprintId: "SP-2024-05", name: "Sprint 5", storyPoints: 15 },
        ]
      },
      {
        id: "INIT-003",
        name: "Security Compliance Audit",
        status: "Completed",
        startDate: "2023-12-10",
        size: 55,
        sprints: [
          { sprintId: "SP-2024-01", name: "Sprint 1", storyPoints: 13 },
          { sprintId: "SP-2024-02", name: "Sprint 2", storyPoints: 8 },
        ]
      },
      {
        id: "INIT-004",
        name: "Mobile App Performance Optimization",
        status: "At Risk",
        startDate: "2024-01-20",
        size: 72,
        sprints: [
          { sprintId: "SP-2024-01", name: "Sprint 1", storyPoints: 18 },
          { sprintId: "SP-2024-02", name: "Sprint 2", storyPoints: 12 },
          { sprintId: "SP-2024-03", name: "Sprint 3", storyPoints: 8 },
        ]
      },
      {
        id: "INIT-005",
        name: "Data Analytics Platform",
        status: "Active",
        startDate: "2024-02-15",
        size: 120,
        sprints: [
          { sprintId: "SP-2024-03", name: "Sprint 3", storyPoints: 16 },
          { sprintId: "SP-2024-04", name: "Sprint 4", storyPoints: 22 },
          { sprintId: "SP-2024-05", name: "Sprint 5", storyPoints: 19 },
        ]
      }
    ]
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
        <h2 className="text-sm font-medium text-muted-foreground">Initiatives Timeline</h2>
        <ThemeToggle />
      </div>
      
      <TeamHeader team={teamData.team} />
      
      <div className="p-6">
        <InitiativesTimeline initiatives={teamData.initiatives} />
      </div>
    </div>
  );
}
