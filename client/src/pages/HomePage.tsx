import { InitiativesList } from "@/components/InitiativesList";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Department, TeamRow, InitiativeRow } from "@shared/schema";

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
          <h2 className="text-sm font-medium text-muted-foreground">Список инициатив</h2>
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
  const { data: initiatives, isLoading, error } = useQuery<InitiativeRow[]>({
    queryKey: ["/api/initiatives/board", team.initBoardId],
    enabled: !!team.initBoardId,
  });

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Загрузка инициатив...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Ошибка при загрузке инициатив: {error instanceof Error ? error.message : "Неизвестная ошибка"}
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

  return <InitiativesList initiatives={initiatives || []} teamName={team.teamName} />;
}
