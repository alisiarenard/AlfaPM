import { InitiativesTimeline } from '../InitiativesTimeline';

export default function InitiativesTimelineExample() {
  const mockInitiatives = [
    {
      id: "INIT-1",
      name: "Platform Migration",
      status: "Active",
      startDate: "2024-01-22",
      size: 120,
      involvement: 80,
      sprints: [
        { sprintId: "SP-1", name: "Sprint 1", startDate: "2024-01-08", endDate: "2024-01-21", storyPoints: 21 },
        { sprintId: "SP-2", name: "Sprint 2", startDate: "2024-01-22", endDate: "2024-02-04", storyPoints: 18 },
        { sprintId: "SP-3", name: "Sprint 3", startDate: "2024-02-05", endDate: "2024-02-18", storyPoints: 15 },
      ]
    },
    {
      id: "INIT-2",
      name: "API Redesign",
      status: "Planned",
      startDate: "2024-02-05",
      size: 80,
      involvement: 60,
      sprints: [
        { sprintId: "SP-3", name: "Sprint 3", startDate: "2024-02-05", endDate: "2024-02-18", storyPoints: 21 },
        { sprintId: "SP-4", name: "Sprint 4", startDate: "2024-02-19", endDate: "2024-03-03", storyPoints: 17 },
      ]
    },
    {
      id: "INIT-3",
      name: "Security Audit",
      status: "Completed",
      startDate: "2024-01-08",
      size: 45,
      involvement: 100,
      sprints: [
        { sprintId: "SP-1", name: "Sprint 1", startDate: "2024-01-08", endDate: "2024-01-21", storyPoints: 8 },
      ]
    }
  ];

  return (
    <div className="bg-background p-6">
      <InitiativesTimeline initiatives={mockInitiatives} />
    </div>
  );
}
