import { InitiativesTimeline } from '../InitiativesTimeline';

export default function InitiativesTimelineExample() {
  const mockInitiatives = [
    {
      id: "INIT-1",
      name: "Platform Migration",
      status: "Active",
      startDate: "2024-01-15",
      size: 120,
      sprints: [
        { sprintId: "SP-1", name: "Sprint 1", storyPoints: 21 },
        { sprintId: "SP-2", name: "Sprint 2", storyPoints: 18 },
        { sprintId: "SP-3", name: "Sprint 3", storyPoints: 15 },
      ]
    },
    {
      id: "INIT-2",
      name: "API Redesign",
      status: "Planned",
      startDate: "2024-02-01",
      size: 80,
      sprints: [
        { sprintId: "SP-2", name: "Sprint 2", storyPoints: 13 },
        { sprintId: "SP-3", name: "Sprint 3", storyPoints: 21 },
        { sprintId: "SP-4", name: "Sprint 4", storyPoints: 17 },
      ]
    },
    {
      id: "INIT-3",
      name: "Security Audit",
      status: "Completed",
      startDate: "2023-12-10",
      size: 45,
      sprints: [
        { sprintId: "SP-1", name: "Sprint 1", storyPoints: 8 },
      ]
    }
  ];

  return (
    <div className="bg-background p-6">
      <InitiativesTimeline initiatives={mockInitiatives} />
    </div>
  );
}
