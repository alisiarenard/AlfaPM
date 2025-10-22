import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { TeamHeader } from "@/components/TeamHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { AlertCircle, Settings, ChevronRight, ChevronDown, Plus, Folder, MoreVertical, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Department, DepartmentWithTeamCount, TeamRow, InitiativeRow, Initiative, Team, SprintRow } from "@shared/schema";
import logoImage from "@assets/b65ec2efbce39c024d959704d8bc5dfa_1760955834035.jpg";

function DepartmentTreeItem({ 
  department, 
  isExpanded, 
  onToggle,
  onDepartmentClick,
  onTeamClick,
  isSelected,
  selectedTeamId
}: { 
  department: DepartmentWithTeamCount; 
  isExpanded: boolean; 
  onToggle: () => void;
  onDepartmentClick: (dept: DepartmentWithTeamCount) => void;
  onTeamClick: (team: TeamRow) => void;
  isSelected: boolean;
  selectedTeamId: string | null;
}) {
  const { data: teams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", department.id],
    enabled: isExpanded,
  });

  const hasTeams = department.teamCount > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 text-sm text-foreground rounded-md hover-elevate cursor-pointer ${isSelected ? 'bg-muted' : ''}`}
        data-testid={`settings-department-${department.id}`}
      >
        {hasTeams && (
          <div onClick={onToggle} className="flex items-center">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0" />
            )}
          </div>
        )}
        <span 
          className="font-medium flex-1" 
          onClick={() => onDepartmentClick(department)}
          style={{ marginLeft: hasTeams ? '0' : '24px' }}
        >
          {department.department}
        </span>
      </div>
      {isExpanded && teams && teams.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {teams.map((team) => (
            <div
              key={team.teamId}
              className={`px-3 py-2 text-sm text-muted-foreground rounded-md hover-elevate cursor-pointer ${selectedTeamId === team.teamId ? 'bg-muted' : ''}`}
              data-testid={`settings-team-${team.teamId}`}
              onClick={() => onTeamClick(team)}
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
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [rightPanelMode, setRightPanelMode] = useState<null | "addBlock" | "addTeam" | "editBlock" | "editTeam">(null);
  const [blockName, setBlockName] = useState("");
  const [innovationRate, setInnovationRate] = useState("");
  const [valueCost, setValueCost] = useState("");
  const [editingDepartment, setEditingDepartment] = useState<DepartmentWithTeamCount | null>(null);
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [selectedDepartmentForTeam, setSelectedDepartmentForTeam] = useState<string>("");
  const [teamName, setTeamName] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [sprintBoardId, setSprintBoardId] = useState("");
  const [initBoardId, setInitBoardId] = useState("");
  const [velocity, setVelocity] = useState("");
  const [sprintDuration, setSprintDuration] = useState("");
  const [spPrice, setSpPrice] = useState("");
  const { toast } = useToast();

  const { data: departments } = useQuery<DepartmentWithTeamCount[]>({
    queryKey: ["/api/departments"],
  });

  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", selectedDepartment],
    enabled: !!selectedDepartment,
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: { department: string; plannedIr?: number | null; plannedVc?: number | null }) => {
      const res = await apiRequest("POST", "/api/departments", data);
      return await res.json();
    },
    onSuccess: (newDepartment: Department) => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({
        title: "Успешно",
        description: "Блок успешно создан",
      });
      const departmentWithCount: DepartmentWithTeamCount = { ...newDepartment, teamCount: 0 };
      setEditingDepartment(departmentWithCount);
      setRightPanelMode("editBlock");
      setBlockName(departmentWithCount.department);
      setInnovationRate(departmentWithCount.plannedIr?.toString() || "");
      setValueCost(departmentWithCount.plannedVc?.toString() || "");
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: "Не удалось создать блок",
      });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async (data: { id: string; department?: string; plannedIr?: number | null; plannedVc?: number | null }) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/departments/${id}`, updateData);
      return await res.json();
    },
    onSuccess: (updatedDepartment: Department) => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({
        title: "Успешно",
        description: "Изменения сохранены",
      });
      const departmentWithCount: DepartmentWithTeamCount = { 
        ...updatedDepartment, 
        teamCount: editingDepartment?.teamCount ?? 0 
      };
      setEditingDepartment(departmentWithCount);
      setBlockName(departmentWithCount.department);
      setInnovationRate(departmentWithCount.plannedIr?.toString() || "");
      setValueCost(departmentWithCount.plannedVc?.toString() || "");
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить изменения",
      });
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: { 
      teamName: string; 
      spaceId: number; 
      sprintBoardId: number; 
      initBoardId: number; 
      vilocity: number; 
      sprintDuration: number; 
      spPrice?: number;
      departmentId: string;
    }) => {
      const res = await apiRequest("POST", "/api/teams", data);
      return await res.json();
    },
    onSuccess: (newTeam: TeamRow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", newTeam.departmentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives/board", newTeam.initBoardId] });
      toast({
        title: "Успешно",
        description: "Команда создана и инициативы синхронизированы",
      });
      setActiveTab(newTeam.teamId);
      setEditingTeam(newTeam);
      setRightPanelMode("editTeam");
    },
    onError: (error: Error) => {
      let errorMessage = "Не удалось создать команду";
      
      // Парсим ошибку формата "400: {"success":false,"error":"текст ошибки"}"
      if (error.message && error.message.includes(':')) {
        const parts = error.message.split(': ');
        const jsonPart = parts.slice(1).join(': ');
        try {
          const errorData = JSON.parse(jsonPart);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Если не JSON, используем текст как есть
          errorMessage = jsonPart;
        }
      } else {
        errorMessage = error.message || errorMessage;
      }
      
      toast({
        title: "Ошибка",
        description: errorMessage,
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (data: { 
      teamId: string; 
      teamName?: string; 
      spaceId?: number; 
      sprintBoardId?: number; 
      initBoardId?: number; 
      vilocity?: number; 
      sprintDuration?: number; 
      spPrice?: number;
      departmentId?: string;
    }) => {
      const { teamId, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/teams/${teamId}`, updateData);
      return await res.json();
    },
    onSuccess: (updatedTeam: TeamRow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", updatedTeam.departmentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({
        title: "Успешно",
        description: "Команда обновлена",
      });
      setEditingTeam(updatedTeam);
      setTeamName(updatedTeam.teamName);
      setSpaceId(updatedTeam.spaceId.toString());
      setSprintBoardId(updatedTeam.sprintBoardId.toString());
      setInitBoardId(updatedTeam.initBoardId.toString());
      setVelocity(updatedTeam.vilocity.toString());
      setSprintDuration(updatedTeam.sprintDuration.toString());
      setSpPrice(updatedTeam.spPrice.toString());
    },
    onError: (error: Error) => {
      let errorMessage = "Не удалось обновить команду";
      
      // Парсим ошибку формата "400: {"success":false,"error":"текст ошибки"}"
      if (error.message && error.message.includes(':')) {
        const parts = error.message.split(': ');
        const jsonPart = parts.slice(1).join(': ');
        try {
          const errorData = JSON.parse(jsonPart);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Если не JSON, используем текст как есть
          errorMessage = jsonPart;
        }
      } else {
        errorMessage = error.message || errorMessage;
      }
      
      toast({
        title: "Ошибка",
        description: errorMessage,
      });
    },
  });

  useEffect(() => {
    if (departments && departments.length > 0 && !selectedDepartment) {
      const firstAvailableDepartment = departments.find(dept => dept.teamCount > 0);
      if (firstAvailableDepartment) {
        setSelectedDepartment(firstAvailableDepartment.id);
      }
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

  useEffect(() => {
    if (rightPanelMode === "editBlock" && editingDepartment) {
      setBlockName(editingDepartment.department);
      setInnovationRate(editingDepartment.plannedIr?.toString() || "");
      setValueCost(editingDepartment.plannedVc?.toString() || "");
    } else if (rightPanelMode === "addBlock") {
      setBlockName("");
      setInnovationRate("");
      setValueCost("");
    } else if (rightPanelMode === "addTeam") {
      setTeamName("");
      setSpaceId("");
      setSprintBoardId("");
      setInitBoardId("");
      setVelocity("");
      setSprintDuration("");
      setSpPrice("");
      setSelectedDepartmentForTeam(departments?.[0]?.id || "");
    } else if (rightPanelMode === "editTeam" && editingTeam) {
      setTeamName(editingTeam.teamName);
      setSpaceId(editingTeam.spaceId.toString());
      setSprintBoardId(editingTeam.sprintBoardId.toString());
      setInitBoardId(editingTeam.initBoardId.toString());
      setVelocity(editingTeam.vilocity.toString());
      setSprintDuration(editingTeam.sprintDuration.toString());
      setSpPrice(editingTeam.spPrice.toString());
    }
  }, [rightPanelMode, editingDepartment, editingTeam, departments]);

  const handleDepartmentClick = (dept: DepartmentWithTeamCount) => {
    setEditingDepartment(dept);
    setEditingTeam(null);
    setRightPanelMode("editBlock");
  };

  const handleTeamClick = (team: TeamRow) => {
    setEditingTeam(team);
    setEditingDepartment(null);
    setRightPanelMode("editTeam");
  };

  const hasFormChanged = () => {
    if (rightPanelMode === "addBlock") {
      return true;
    }
    if (rightPanelMode === "editBlock" && editingDepartment) {
      const nameChanged = blockName.trim() !== editingDepartment.department;
      const irChanged = (innovationRate ? parseInt(innovationRate) : null) !== editingDepartment.plannedIr;
      const vcChanged = (valueCost ? parseInt(valueCost) : null) !== editingDepartment.plannedVc;
      return nameChanged || irChanged || vcChanged;
    }
    if (rightPanelMode === "editTeam" && editingTeam) {
      const nameChanged = teamName.trim() !== editingTeam.teamName;
      const spaceIdChanged = (spaceId ? parseInt(spaceId) : editingTeam.spaceId) !== editingTeam.spaceId;
      const sprintBoardIdChanged = (sprintBoardId ? parseInt(sprintBoardId) : editingTeam.sprintBoardId) !== editingTeam.sprintBoardId;
      const initBoardIdChanged = (initBoardId ? parseInt(initBoardId) : editingTeam.initBoardId) !== editingTeam.initBoardId;
      const velocityChanged = (velocity ? parseInt(velocity) : editingTeam.vilocity) !== editingTeam.vilocity;
      const sprintDurationChanged = (sprintDuration ? parseInt(sprintDuration) : editingTeam.sprintDuration) !== editingTeam.sprintDuration;
      const spPriceChanged = (spPrice ? parseInt(spPrice) : editingTeam.spPrice) !== editingTeam.spPrice;
      return nameChanged || spaceIdChanged || sprintBoardIdChanged || initBoardIdChanged || velocityChanged || sprintDurationChanged || spPriceChanged;
    }
    return false;
  };

  const handleSave = () => {
    if (rightPanelMode === "addBlock") {
      createDepartmentMutation.mutate({
        department: blockName.trim(),
        plannedIr: innovationRate ? parseInt(innovationRate) : null,
        plannedVc: valueCost ? parseInt(valueCost) : null,
      });
    } else if (rightPanelMode === "editBlock" && editingDepartment) {
      updateDepartmentMutation.mutate({
        id: editingDepartment.id,
        department: blockName.trim(),
        plannedIr: innovationRate ? parseInt(innovationRate) : null,
        plannedVc: valueCost ? parseInt(valueCost) : null,
      });
    }
  };

  const handleTeamToggle = (teamId: string) => {
    const newSelectedTeams = new Set(selectedTeams);
    if (newSelectedTeams.has(teamId)) {
      newSelectedTeams.delete(teamId);
    } else {
      newSelectedTeams.add(teamId);
    }
    setSelectedTeams(newSelectedTeams);
  };

  useEffect(() => {
    if (departmentTeams) {
      setSelectedTeams(new Set(departmentTeams.map(team => team.teamId)));
    }
  }, [selectedDepartment, departmentTeams]);

  const handleDownloadReport = () => {
    toast({
      title: "Скачивание отчета",
      description: "Функция скачивания отчета будет реализована позже",
    });
  };

  // Получаем Innovation Rate для выбранных команд
  const teamIdsArray = Array.from(selectedTeams);
  const teamIdsParam = teamIdsArray.sort().join(',');
  const { data: innovationRateData, isFetching: isIRFetching } = useQuery<{
    success: boolean;
    actualIR: number;
    plannedIR: number;
    diffFromPlanned: number;
    totalSP: number;
    innovationSP: number;
  }>({
    queryKey: ['/api/metrics/innovation-rate', { teamIds: teamIdsParam }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/innovation-rate?teamIds=${teamIdsParam}`);
      if (!response.ok) {
        throw new Error('Failed to fetch innovation rate');
      }
      return response.json();
    },
    enabled: teamIdsArray.length > 0,
    placeholderData: (previousData) => previousData,
  });

  // Используем ref для хранения последнего успешного значения
  const lastSuccessfulDataRef = useRef<typeof innovationRateData | null>(null);
  
  // Обновляем ref когда получаем новые данные
  if (innovationRateData && !isIRFetching) {
    lastSuccessfulDataRef.current = innovationRateData;
  }

  // Показываем последнее успешное значение во время загрузки
  const displayIR = innovationRateData || lastSuccessfulDataRef.current;

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
              <SelectTrigger className="w-[200px] bg-white">
                <SelectValue placeholder="Выберите департамент" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {departments?.map((dept) => (
                  <SelectItem 
                    key={dept.id} 
                    value={dept.id} 
                    data-testid={`option-department-${dept.id}`}
                    disabled={dept.teamCount === 0}
                  >
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
              <div className="mb-6">
                <div 
                  className="w-full h-[110px] border border-border rounded-lg flex relative transition-opacity duration-300"
                  style={{ opacity: isIRFetching ? 0.5 : 1 }}
                >
                  <div className="w-1/3 px-4 py-3 flex flex-col justify-between">
                    <div className="text-sm font-bold text-muted-foreground">Innovation Rate</div>
                    <div className="text-3xl font-semibold" data-testid="metric-innovation-rate">
                      {displayIR ? `${displayIR.actualIR}%` : '-'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {displayIR && (
                        <span 
                          className="font-semibold" 
                          style={{ color: displayIR.diffFromPlanned >= 0 ? '#16a34a' : '#cd253d' }}
                        >
                          {displayIR.diffFromPlanned >= 0 ? '+' : ''}{displayIR.diffFromPlanned}%
                        </span>
                      )}
                      {displayIR && ' от планового значения'}
                    </div>
                  </div>
                  <div className="border-l border-border my-3"></div>
                  <div className="w-1/3 px-4 py-3 flex flex-col justify-between">
                    <div className="text-sm font-bold text-muted-foreground">Value/Cost</div>
                    <div className="text-3xl font-semibold" data-testid="metric-value-cost">4,7</div>
                    <div className="text-xs text-muted-foreground"><span className="font-semibold text-green-600">+1,7</span> от планового значения</div>
                  </div>
                  <div className="border-l border-border my-3"></div>
                  <div className="w-1/3 px-4 py-3 flex flex-col justify-between">
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-1 right-1 h-7 w-7"
                        data-testid="button-menu"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-white">
                      {departmentTeams && departmentTeams.length > 0 ? (
                        <>
                          <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                            Команды
                          </div>
                          {departmentTeams.map((team) => (
                            <DropdownMenuCheckboxItem
                              key={team.teamId}
                              checked={selectedTeams.has(team.teamId)}
                              onCheckedChange={() => handleTeamToggle(team.teamId)}
                              data-testid={`menu-team-${team.teamId}`}
                            >
                              {team.teamName}
                            </DropdownMenuCheckboxItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="flex items-center gap-2 cursor-pointer"
                            onSelect={handleDownloadReport}
                            role="menuitem"
                            aria-label="Скачать отчет по выбранным командам"
                            data-testid="menu-download-report"
                          >
                            <Download className="h-4 w-4" />
                            <span>Скачать отчет</span>
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Нет команд
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
                    <DropdownMenuItem 
                      data-testid="menu-item-block"
                      onClick={() => setRightPanelMode("addBlock")}
                    >
                      Блок
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      data-testid="menu-item-team"
                      onClick={() => setRightPanelMode("addTeam")}
                    >
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
                    isSelected={editingDepartment?.id === dept.id}
                    selectedTeamId={editingTeam?.teamId || null}
                    onToggle={() => {
                      const newExpanded = new Set(expandedDepartments);
                      if (newExpanded.has(dept.id)) {
                        newExpanded.delete(dept.id);
                      } else {
                        newExpanded.add(dept.id);
                      }
                      setExpandedDepartments(newExpanded);
                    }}
                    onDepartmentClick={handleDepartmentClick}
                    onTeamClick={handleTeamClick}
                  />
                ))}
              </div>
            </div>
            <div className="w-[70%] overflow-y-auto">
              {(rightPanelMode === "addBlock" || rightPanelMode === "editBlock") ? (
                <div className="flex flex-col h-full">
                  <div className="px-6 py-4 border-b border-border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md" style={{ backgroundColor: 'rgba(205, 37, 61, 0.1)' }}>
                        <Folder className="h-5 w-5" style={{ color: '#cd253d' }} />
                      </div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {blockName.trim() || "Новый блок"}
                      </h2>
                    </div>
                  </div>
                  <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                    <div className="space-y-2">
                      <Label htmlFor="block-name">Название блока</Label>
                      <Input
                        id="block-name"
                        placeholder="Введите название блока"
                        value={blockName}
                        onChange={(e) => setBlockName(e.target.value)}
                        data-testid="input-block-name"
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="innovation-rate">Плановый Innovation Rate, %</Label>
                        <Input
                          id="innovation-rate"
                          type="number"
                          placeholder="0"
                          value={innovationRate}
                          onChange={(e) => setInnovationRate(e.target.value)}
                          data-testid="input-innovation-rate"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="value-cost">Value/Cost</Label>
                        <Input
                          id="value-cost"
                          type="number"
                          step="0.1"
                          placeholder="0.0"
                          value={valueCost}
                          onChange={(e) => setValueCost(e.target.value)}
                          data-testid="input-value-cost"
                        />
                      </div>
                    </div>
                  </div>
                  {(rightPanelMode === "addBlock" || hasFormChanged()) && (
                    <div className="p-4 flex justify-end">
                      <Button
                        disabled={!blockName.trim() || createDepartmentMutation.isPending || updateDepartmentMutation.isPending}
                        style={{ backgroundColor: '#cd253d' }}
                        className="hover:opacity-90 border-0"
                        data-testid="button-save-block"
                        onClick={handleSave}
                      >
                        {createDepartmentMutation.isPending || updateDepartmentMutation.isPending 
                          ? "Сохранение..." 
                          : rightPanelMode === "addBlock" 
                            ? "Добавить" 
                            : "Сохранить"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : rightPanelMode === "editTeam" ? (
                <div className="flex flex-col h-full">
                  <div className="px-6 py-4 border-b border-border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md" style={{ backgroundColor: 'rgba(205, 37, 61, 0.1)' }}>
                        <Folder className="h-5 w-5" style={{ color: '#cd253d' }} />
                      </div>
                      <div className="flex flex-col">
                        <h2 className="text-lg font-semibold text-foreground">
                          {teamName || "Команда"}
                        </h2>
                        {editingTeam && departments && (
                          <p className="text-sm text-muted-foreground">
                            {departments.find(d => d.id === editingTeam.departmentId)?.department}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                    <div className="space-y-2">
                      <Label htmlFor="team-name">Название команды</Label>
                      <Input
                        id="team-name"
                        placeholder="Введите название команды"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        data-testid="input-team-name"
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="space-id">ID пространства</Label>
                        <Input
                          id="space-id"
                          type="number"
                          placeholder="0"
                          value={spaceId}
                          onChange={(e) => setSpaceId(e.target.value)}
                          data-testid="input-space-id"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="sprint-board-id">ID доски</Label>
                        <Input
                          id="sprint-board-id"
                          type="number"
                          placeholder="0"
                          value={sprintBoardId}
                          onChange={(e) => setSprintBoardId(e.target.value)}
                          data-testid="input-sprint-board-id"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="init-board-id">ID доски инициатив</Label>
                        <Input
                          id="init-board-id"
                          type="number"
                          placeholder="0"
                          value={initBoardId}
                          onChange={(e) => setInitBoardId(e.target.value)}
                          data-testid="input-init-board-id"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="velocity">Velocity</Label>
                        <Input
                          id="velocity"
                          type="number"
                          placeholder="0"
                          value={velocity}
                          onChange={(e) => setVelocity(e.target.value)}
                          data-testid="input-velocity"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="sprint-duration">Длительность спринта (дней)</Label>
                        <Input
                          id="sprint-duration"
                          type="number"
                          placeholder="0"
                          value={sprintDuration}
                          onChange={(e) => setSprintDuration(e.target.value)}
                          data-testid="input-sprint-duration"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="sp-price">Стоимость одного SP (₽)</Label>
                        <Input
                          id="sp-price"
                          type="number"
                          placeholder="0"
                          value={spPrice}
                          onChange={(e) => setSpPrice(e.target.value)}
                          data-testid="input-sp-price"
                        />
                      </div>
                    </div>
                  </div>
                  {hasFormChanged() && (
                    <div className="p-4 flex justify-end">
                      <Button
                        disabled={!teamName.trim() || updateTeamMutation.isPending}
                        style={{ backgroundColor: '#cd253d' }}
                        className="hover:opacity-90 border-0"
                        data-testid="button-save-team"
                        onClick={() => {
                          if (editingTeam) {
                            updateTeamMutation.mutate({
                              teamId: editingTeam.teamId,
                              teamName: teamName.trim(),
                              spaceId: spaceId ? parseInt(spaceId) : editingTeam.spaceId,
                              sprintBoardId: sprintBoardId ? parseInt(sprintBoardId) : editingTeam.sprintBoardId,
                              initBoardId: initBoardId ? parseInt(initBoardId) : editingTeam.initBoardId,
                              vilocity: velocity ? parseInt(velocity) : editingTeam.vilocity,
                              sprintDuration: sprintDuration ? parseInt(sprintDuration) : editingTeam.sprintDuration,
                              spPrice: spPrice ? parseInt(spPrice) : editingTeam.spPrice,
                              departmentId: editingTeam.departmentId
                            });
                          }
                        }}
                      >
                        {updateTeamMutation.isPending ? "Сохранение..." : "Сохранить"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : rightPanelMode === "addTeam" ? (
                <div className="flex flex-col h-full">
                  <div className="px-6 py-4 border-b border-border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-md" style={{ backgroundColor: 'rgba(205, 37, 61, 0.1)' }}>
                        <Folder className="h-5 w-5" style={{ color: '#cd253d' }} />
                      </div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {teamName.trim() || "Новая команда"}
                      </h2>
                    </div>
                  </div>
                  <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="new-team-name">Название команды</Label>
                        <Input
                          id="new-team-name"
                          placeholder="Введите название команды"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          data-testid="input-team-name"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="team-department">Подразделение</Label>
                        <Select value={selectedDepartmentForTeam} onValueChange={setSelectedDepartmentForTeam}>
                          <SelectTrigger id="team-department" data-testid="select-department">
                            <SelectValue placeholder="Выберите подразделение" />
                          </SelectTrigger>
                          <SelectContent className="z-[300] bg-white">
                            {departments?.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.department}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="new-space-id">ID пространства</Label>
                        <Input
                          id="new-space-id"
                          type="number"
                          placeholder="0"
                          value={spaceId}
                          onChange={(e) => setSpaceId(e.target.value)}
                          data-testid="input-space-id"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="new-sprint-board-id">ID доски</Label>
                        <Input
                          id="new-sprint-board-id"
                          type="number"
                          placeholder="0"
                          value={sprintBoardId}
                          onChange={(e) => setSprintBoardId(e.target.value)}
                          data-testid="input-sprint-board-id"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="new-init-board-id">ID доски инициатив</Label>
                        <Input
                          id="new-init-board-id"
                          type="number"
                          placeholder="0"
                          value={initBoardId}
                          onChange={(e) => setInitBoardId(e.target.value)}
                          data-testid="input-init-board-id"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="new-velocity">Velocity</Label>
                        <Input
                          id="new-velocity"
                          type="number"
                          placeholder="0"
                          value={velocity}
                          onChange={(e) => setVelocity(e.target.value)}
                          data-testid="input-velocity"
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="new-sprint-duration">Длительность спринта (дней)</Label>
                        <Input
                          id="new-sprint-duration"
                          type="number"
                          placeholder="0"
                          value={sprintDuration}
                          onChange={(e) => setSprintDuration(e.target.value)}
                          data-testid="input-sprint-duration"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="new-sp-price">Стоимость одного SP (₽)</Label>
                        <Input
                          id="new-sp-price"
                          type="number"
                          placeholder="0"
                          value={spPrice}
                          onChange={(e) => setSpPrice(e.target.value)}
                          data-testid="input-sp-price"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 flex justify-end">
                    <Button
                      disabled={
                        !teamName.trim() || 
                        !spaceId || 
                        !sprintBoardId || 
                        !initBoardId || 
                        !velocity || 
                        !sprintDuration ||
                        !selectedDepartmentForTeam ||
                        createTeamMutation.isPending
                      }
                      style={{ backgroundColor: '#cd253d' }}
                      className="hover:opacity-90 border-0"
                      data-testid="button-add-team"
                      onClick={() => {
                        createTeamMutation.mutate({
                          teamName: teamName.trim(),
                          spaceId: parseInt(spaceId),
                          sprintBoardId: parseInt(sprintBoardId),
                          initBoardId: parseInt(initBoardId),
                          vilocity: parseInt(velocity),
                          sprintDuration: parseInt(sprintDuration),
                          spPrice: spPrice ? parseInt(spPrice) : undefined,
                          departmentId: selectedDepartmentForTeam
                        });
                      }}
                    >
                      {createTeamMutation.isPending ? "Создание..." : "Добавить"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <p className="text-sm text-muted-foreground">Выберите действие в меню слева</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamInitiativesTab({ team }: { team: TeamRow }) {
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const { toast } = useToast();
  
  const { data: initiativeRows, isLoading: initiativesLoading, error: initiativesError } = useQuery<Initiative[]>({
    queryKey: ["/api/initiatives/board", team.initBoardId, "sprint", team.sprintBoardId],
    queryFn: async () => {
      const url = `/api/initiatives/board/${team.initBoardId}?sprintBoardId=${team.sprintBoardId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch initiatives');
      return response.json();
    },
    enabled: !!team.initBoardId && !!team.sprintBoardId,
  });

  const { data: sprints, isLoading: sprintsLoading } = useQuery<SprintRow[]>({
    queryKey: ["/api/sprints/board", team.sprintBoardId],
    enabled: !!team.sprintBoardId,
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      // Сначала синхронизируем инициативы
      const initiativesRes = await apiRequest("POST", `/api/kaiten/sync-board/${team.initBoardId}`, {});
      const initiativesData = await initiativesRes.json();
      
      // Затем синхронизируем задачи по всем спринтам, если указана доска спринтов
      let sprintsData = null;
      if (team.sprintBoardId) {
        const sprintsRes = await apiRequest("POST", `/api/kaiten/sync-all-sprints/${team.sprintBoardId}`, {});
        sprintsData = await sprintsRes.json();
      }
      
      return { initiatives: initiativesData, sprints: sprintsData };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives/board", team.initBoardId] });
      
      let description = `Синхронизировано ${data.initiatives.count} инициатив`;
      if (data.sprints) {
        description += ` и ${data.sprints.totalSynced} задач из ${data.sprints.sprintsProcessed} спринтов`;
      }
      
      toast({
        title: "Успешно",
        description,
      });
    },
    onError: (error: Error) => {
      let errorMessage = "Не удалось синхронизировать данные";
      
      if (error.message && error.message.includes(':')) {
        const parts = error.message.split(': ');
        const jsonPart = parts.slice(1).join(': ');
        try {
          const errorData = JSON.parse(jsonPart);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = jsonPart;
        }
      } else {
        errorMessage = error.message || errorMessage;
      }
      
      toast({
        title: "Ошибка",
        description: errorMessage,
      });
    },
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
      <Alert>
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
  
  // Фильтруем инициативы:
  // 1. Если включен фильтр "Активные" - только inProgress (скрываем queued и done)
  // 2. Если инициатива done или inProgress и выполнено 0 SP - не показываем
  const initiatives = allInitiatives.filter(init => {
    // Фильтр "Активные" - показываем только inProgress
    if (showActiveOnly && init.state !== "2-inProgress") {
      return false;
    }
    
    // Если инициатива в статусе done или inProgress
    if (init.state === "2-inProgress" || init.state === "3-done") {
      // Считаем общее количество выполненных SP
      const totalSp = init.sprints.reduce((sum, sprint) => sum + sprint.sp, 0);
      
      // Не показываем если выполнено 0 SP
      if (totalSp === 0) {
        return false;
      }
    }
    
    return true;
  });

  const teamData: Team = {
    boardId: team.initBoardId.toString(),
    teamId: team.teamId,
    name: team.teamName,
    velocity: team.vilocity,
    sprintDuration: team.sprintDuration
  };

  const handleSync = () => {
    syncAllMutation.mutate();
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <TeamHeader 
        team={teamData} 
        initiatives={allInitiatives} 
        dbTeam={team} 
        showActiveOnly={showActiveOnly}
        onFilterChange={setShowActiveOnly}
        onSync={handleSync}
        isSyncing={syncAllMutation.isPending}
      />
      <div className="px-4">
        <InitiativesTimeline initiatives={initiatives} team={teamData} sprints={sprints || []} />
      </div>
    </div>
  );
}
