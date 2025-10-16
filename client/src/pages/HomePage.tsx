import { TeamHeader } from "@/components/TeamHeader";
import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { TeamData, Department, TeamRow } from "@shared/schema";

export default function HomePage() {
  const [teamDataArray, setTeamDataArray] = useState<TeamData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
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

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const response = await fetch("/team-data.json");
        if (!response.ok) {
          setLoadError("Не удалось загрузить файл с данными команд");
          return;
        }

        const data = await response.json();
        setTeamDataArray(data);
      } catch (error) {
        console.error("Failed to load initial data:", error);
        setLoadError("Ошибка при загрузке данных");
      } finally {
        setIsLoadingData(false);
      }
    };

    loadInitialData();
  }, []);

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка данных...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

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
              <TabsList className="mb-6" data-testid="tabs-teams">
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
              
              {departmentTeams.map((team) => {
                const teamData = teamDataArray?.find(td => td.team.teamId === team.teamId);
                return (
                  <TabsContent key={team.teamId} value={team.teamId}>
                    {teamData ? (
                      <>
                        <TeamHeader team={teamData.team} initiatives={teamData.initiatives} dbTeam={team} />
                        <div className="mt-6">
                          <InitiativesTimeline initiatives={teamData.initiatives} team={teamData.team} />
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        Нет данных для команды {team.teamName}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
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
