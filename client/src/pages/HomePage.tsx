import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { TeamHeader } from "@/components/TeamHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AlertCircle, Settings, ChevronRight, ChevronDown, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Department, TeamRow, InitiativeRow, Initiative, Team, SprintRow } from "@shared/schema";
import logoImage from "@assets/b65ec2efbce39c024d959704d8bc5dfa_1760955834035.jpg";

function DepartmentTreeItem({ 
  department, 
  isExpanded, 
  onToggle
}: { 
  department: Department; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  const { data: teams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", department.id],
    enabled: isExpanded,
  });

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground rounded-md hover-elevate cursor-pointer"
        onClick={onToggle}
        data-testid={`settings-department-${department.id}`}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="font-medium">{department.department}</span>
      </div>
      {isExpanded && teams && teams.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {teams.map((team) => (
            <div
              key={team.teamId}
              className="px-3 py-2 text-sm text-muted-foreground rounded-md hover-elevate cursor-pointer"
              data-testid={`settings-team-${team.teamId}`}
            >
              {team.teamName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());

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
    if (departments && departments.length > 0) {
      const allDepartmentIds = new Set(departments.map(dept => dept.id));
      setExpandedDepartments(allDepartmentIds);
    }
  }, [departments]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto" data-testid="main-container">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="Logo" className="w-10 h-10 rounded-md" />
            <h2 className="text-lg font-bold text-foreground">Продуктовые метрики</h2>
          </div>
          <div className="flex items-center gap-3">
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
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
              data-testid="button-settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
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
      
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-4xl h-[80vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="pt-4 px-4 pb-0">
            <DialogTitle className="text-xl font-bold">Настройки</DialogTitle>
          </DialogHeader>
          <div className="flex flex-1 overflow-hidden border-t border-border">
            <div className="w-[30%] border-r border-border p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Подразделения</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      data-testid="button-add-dropdown"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[250] bg-white dark:bg-white">
                    <DropdownMenuItem data-testid="menu-item-block">
                      Блок
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="menu-item-team">
                      Команда
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-1">
                {departments?.map((dept) => (
                  <DepartmentTreeItem
                    key={dept.id}
                    department={dept}
                    isExpanded={expandedDepartments.has(dept.id)}
                    onToggle={() => {
                      const newExpanded = new Set(expandedDepartments);
                      if (newExpanded.has(dept.id)) {
                        newExpanded.delete(dept.id);
                      } else {
                        newExpanded.add(dept.id);
                      }
                      setExpandedDepartments(newExpanded);
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="w-[70%] p-4 overflow-y-auto">
              <p className="text-sm text-muted-foreground">Правая панель (70%)</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
