import { TeamHeader } from '../TeamHeader';

export default function TeamHeaderExample() {
  const mockTeam = {
    boardId: "BOARD-123",
    teamId: "TEAM-456",
    name: "Platform Engineering Team"
  };

  return (
    <div className="bg-background">
      <TeamHeader team={mockTeam} />
    </div>
  );
}
