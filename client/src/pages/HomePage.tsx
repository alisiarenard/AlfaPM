import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { TeamHeader } from "@/components/TeamHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Department, TeamRow, InitiativeRow, Initiative, Team, SprintRow } from "@shared/schema";

export default function HomePage() {
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("");

  const { data: departments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", selectedDepartment],
    enabled: !!selectedDepartment,
  });

  useEffect(() => {
    if (departments && departments.length > 0 && !selectedDepartment) {
      setSelectedDepartment(departments[0].id);
    }
  }, [departments, selectedDepartment]);

  useEffect(() => {
    if (departmentTeams && departmentTeams.length > 0) {
      setActiveTab(departmentTeams[0].teamId);
    }
  }, [departmentTeams]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto" data-testid="main-container">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <h2 className="text-sm font-medium text-muted-foreground">Initiatives Timeline</h2>
          <Select 
            value={selectedDepartment} 
            onValueChange={setSelectedDepartment}
            data-testid="select-department"
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Выберите департамент" />
            </SelectTrigger>
            <SelectContent>
              {departments?.map((dept) => (
                <SelectItem key={dept.id} value={dept.id} data-testid={`option-department-${dept.id}`}>
                  {dept.department}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="p-6">
          {departmentTeams && departmentTeams.length > 0 && activeTab ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex gap-4 mb-6">
                <div className="w-[20%] h-[110px] border border-border rounded-lg px-4 py-3 flex flex-col justify-between">
                  <div className="text-sm font-bold text-muted-foreground">Innovation Rate</div>
                  <div className="text-3xl font-semibold" data-testid="metric-innovation-rate">43%</div>
                  <div className="text-xs text-muted-foreground"><span className="font-semibold" style={{ color: '#cd253d' }}>-11%</span> от планового значения</div>
                </div>
                <div className="w-[20%] h-[110px] border border-border rounded-lg px-4 py-3 flex flex-col justify-between">
                  <div className="text-sm font-bold text-muted-foreground">Value/Cost</div>
                  <div className="text-3xl font-semibold" data-testid="metric-value-cost">4,7</div>
                  <div className="text-xs text-muted-foreground"><span className="font-semibold text-green-600">+1,7</span> от планового значения</div>
                </div>
                <div className="w-[60%] h-[110px] border border-border rounded-lg"></div>
              </div>
              <TabsList data-testid="tabs-teams">
                {departmentTeams.map((team) => (
                  <TabsTrigger 
                    key={team.teamId} 
                    value={team.teamId}
                    data-testid={`tab-team-${team.teamId}`}
                  >
                    {team.teamName}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {departmentTeams.map((team) => (
                <TabsContent key={team.teamId} value={team.teamId}>
                  <TeamInitiativesTab team={team} />
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Нет команд в выбранном департаменте
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamInitiativesTab({ team }: { team: TeamRow }) {
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  
  const { data: initiativeRows, isLoading: initiativesLoading, error: initiativesError } = useQuery<Initiative[]>({
    queryKey: ["/api/initiatives/board", team.initBoardId],
    enabled: !!team.initBoardId,
  });

  const { data: sprints, isLoading: sprintsLoading } = useQuery<SprintRow[]>({
    queryKey: ["/api/sprints"],
  });

  const isLoading = initiativesLoading || sprintsLoading;

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Загрузка данных...</p>
      </div>
    );
  }

  if (initiativesError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Ошибка при загрузке инициатив: {initiativesError instanceof Error ? initiativesError.message : "Неизвестная ошибка"}
        </AlertDescription>
      </Alert>
    );
  }

  if (!team.initBoardId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        У команды {team.teamName} не настроена доска инициатив
      </div>
    );
  }

  // Данные уже приходят в правильном формате Initiative с сервера
  const allInitiatives: Initiative[] = initiativeRows || [];
  
  // Фильтруем инициативы, если включен фильтр "Активные"
  const initiatives = showActiveOnly 
    ? allInitiatives.filter(init => init.state === "2-inProgress")
    : allInitiatives;

  const teamData: Team = {
    boardId: team.initBoardId.toString(),
    teamId: team.teamId,
    name: team.teamName,
    velocity: team.vilocity,
    sprintDuration: team.sprintDuration
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <TeamHeader 
        team={teamData} 
        initiatives={allInitiatives} 
        dbTeam={team} 
        showActiveOnly={showActiveOnly}
        onFilterChange={setShowActiveOnly}
      />
      <div className="px-4">
        <InitiativesTimeline initiatives={initiatives} team={teamData} sprints={sprints || []} />
      </div>
    </div>
  );
}
