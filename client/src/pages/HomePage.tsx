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
      name: "Platform Engineering Team",
      velocity: 42
    },
    initiatives: [
      {
        id: "INIT-001",
        name: "Cloud Infrastructure Migration",
        status: "Active",
        startDate: "2024-01-22",
        size: 144,
        involvement: 80,
        sprints: [
          { sprintId: "SP-2024-02", name: "Sprint 2", startDate: "2024-01-22", endDate: "2024-02-04", storyPoints: 18 },
          { sprintId: "SP-2024-03", name: "Sprint 3", startDate: "2024-02-05", endDate: "2024-02-18", storyPoints: 24 },
          { sprintId: "SP-2024-04", name: "Sprint 4", startDate: "2024-02-19", endDate: "2024-03-03", storyPoints: 19 },
        ]
      },
      {
        id: "INIT-002",
        name: "API Gateway Redesign",
        status: "Planned",
        startDate: "2024-02-05",
        size: 89,
        involvement: 60,
        sprints: [
          { sprintId: "SP-2024-03", name: "Sprint 3", startDate: "2024-02-05", endDate: "2024-02-18", storyPoints: 21 },
          { sprintId: "SP-2024-04", name: "Sprint 4", startDate: "2024-02-19", endDate: "2024-03-03", storyPoints: 17 },
          { sprintId: "SP-2024-05", name: "Sprint 5", startDate: "2024-03-04", endDate: "2024-03-17", storyPoints: 15 },
        ]
      },
      {
        id: "INIT-003",
        name: "Security Compliance Audit",
        status: "Completed",
        startDate: "2024-01-08",
        size: 55,
        involvement: 100,
        sprints: [
          { sprintId: "SP-2024-01", name: "Sprint 1", startDate: "2024-01-08", endDate: "2024-01-21", storyPoints: 13 },
          { sprintId: "SP-2024-02", name: "Sprint 2", startDate: "2024-01-22", endDate: "2024-02-04", storyPoints: 8 },
        ]
      },
      {
        id: "INIT-004",
        name: "Mobile App Performance Optimization",
        status: "At Risk",
        startDate: "2024-01-15",
        size: 72,
        involvement: 75,
        sprints: [
          { sprintId: "SP-2024-01", name: "Sprint 1", startDate: "2024-01-08", endDate: "2024-01-21", storyPoints: 18 },
          { sprintId: "SP-2024-02", name: "Sprint 2", startDate: "2024-01-22", endDate: "2024-02-04", storyPoints: 12 },
          { sprintId: "SP-2024-03", name: "Sprint 3", startDate: "2024-02-05", endDate: "2024-02-18", storyPoints: 8 },
        ]
      },
      {
        id: "INIT-005",
        name: "Data Analytics Platform",
        status: "Active",
        startDate: "2024-02-12",
        size: 120,
        involvement: 90,
        sprints: [
          { sprintId: "SP-2024-03", name: "Sprint 3", startDate: "2024-02-05", endDate: "2024-02-18", storyPoints: 16 },
          { sprintId: "SP-2024-04", name: "Sprint 4", startDate: "2024-02-19", endDate: "2024-03-03", storyPoints: 22 },
          { sprintId: "SP-2024-05", name: "Sprint 5", startDate: "2024-03-04", endDate: "2024-03-17", storyPoints: 19 },
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
