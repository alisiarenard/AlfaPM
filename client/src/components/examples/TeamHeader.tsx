import { TeamHeader } from '../TeamHeader';

export default function TeamHeaderExample() {
  const mockTeam = {
    boardId: "BOARD-123",
    teamId: "TEAM-456",
    name: "Platform Engineering Team",
    velocity: 42,
    initBoardId: 0,
    sprintBoardId: null,
    spaceId: 0,
    spPrice: 0,
    hasSprints: true,
  };

  return (
    <div className="bg-background">
      <TeamHeader
        team={mockTeam}
        initiatives={[]}
        showActiveOnly={false}
        onFilterChange={() => {}}
        viewTab="initiatives"
        onViewTabChange={() => {}}
      />
    </div>
  );
}
