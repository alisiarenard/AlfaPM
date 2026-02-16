import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Users, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { MdAccountTree } from "react-icons/md";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { DepartmentWithTeamCount, TeamRow, Department, TeamYearlyDataRow } from "@shared/schema";

function DepartmentTreeItem({ 
  department, 
  isExpanded, 
  onToggle,
  onDepartmentClick,
  onTeamClick,
  onTeamDelete,
  isSelected,
  selectedTeamId
}: { 
  department: DepartmentWithTeamCount; 
  isExpanded: boolean; 
  onToggle: () => void;
  onDepartmentClick: (dept: DepartmentWithTeamCount) => void;
  onTeamClick: (team: TeamRow) => void;
  onTeamDelete: (team: TeamRow) => void;
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
              className={`group flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground rounded-md hover-elevate ${selectedTeamId === team.teamId ? 'bg-muted' : ''}`}
              data-testid={`settings-team-${team.teamId}`}
            >
              <span 
                className="flex-1 cursor-pointer"
                onClick={() => onTeamClick(team)}
              >
                {team.teamName}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onTeamDelete(team);
                }}
                data-testid={`button-delete-team-${team.teamId}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
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
  const [hasSprints, setHasSprints] = useState(true);
  const [initSpaceId, setInitSpaceId] = useState("");
  const [omniBoardId, setOmniBoardId] = useState("");
  const [metricsYear, setMetricsYear] = useState(new Date().getFullYear().toString());
  const [sprintIds, setSprintIds] = useState("");

  const { data: departments } = useQuery<DepartmentWithTeamCount[]>({
    queryKey: ["/api/departments"],
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
      initSpaceId?: number;
      omniBoardId?: number;
      vilocity: number; 
      sprintDuration: number; 
      spPrice?: number;
      departmentId: string;
      hasSprints: boolean;
      sprintIds?: string;
    }) => {
      const res = await apiRequest("POST", "/api/teams", data);
      return await res.json();
    },
    onSuccess: (newTeam: TeamRow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", newTeam.departmentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives/board", newTeam.initBoardId] });
      saveYearlyDataMutation.mutate({
        teamId: newTeam.teamId,
        year: parseInt(metricsYear),
        vilocity: newTeam.vilocity,
        sprintDuration: newTeam.sprintDuration,
        spPrice: newTeam.spPrice,
        hasSprints: newTeam.hasSprints,
      });
      toast({
        title: "Успешно",
        description: "Команда создана и инициативы синхронизированы",
      });
      setEditingTeam(newTeam);
      setRightPanelMode("editTeam");
      setTeamName("");
      setSpaceId("");
      setSprintBoardId("");
      setInitBoardId("");
      setInitSpaceId("");
      setOmniBoardId("");
      setVelocity("");
      setSprintDuration("");
      setSpPrice("");
      setHasSprints(true);
      setSprintIds("");
    },
    onError: (error: Error) => {
      let errorMessage = "Не удалось создать команду";
      
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

  const updateTeamMutation = useMutation({
    mutationFn: async (data: { 
      teamId: string; 
      teamName?: string; 
      spaceId?: number; 
      sprintBoardId?: number | null; 
      initBoardId?: number; 
      initSpaceId?: number;
      omniBoardId?: number | null;
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
      setSprintBoardId(updatedTeam.sprintBoardId?.toString() || "");
      setInitBoardId(updatedTeam.initBoardId.toString());
      setInitSpaceId(updatedTeam.initSpaceId?.toString() || "");
      setOmniBoardId(updatedTeam.omniBoardId?.toString() || "");
      setVelocity(updatedTeam.vilocity.toString());
      setSprintDuration(updatedTeam.sprintDuration.toString());
      setSpPrice(updatedTeam.spPrice.toString());
      setHasSprints(true);
      setSprintIds("");
    },
    onError: (error: Error) => {
      let errorMessage = "Не удалось обновить команду";
      
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

  const deleteTeamMutation = useMutation({
    mutationFn: async (data: { teamId: string; departmentId: string }) => {
      const res = await apiRequest("DELETE", `/api/teams/${data.teamId}`);
      return { teamId: data.teamId, departmentId: data.departmentId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", data.departmentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timeline", data.teamId] });
      queryClient.invalidateQueries({ queryKey: ["/api/initiatives/board"] });
      
      if (editingTeam?.teamId === data.teamId) {
        setRightPanelMode(null);
        setEditingTeam(null);
      }
      
      toast({
        title: "Успешно",
        description: "Команда удалена",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить команду",
      });
    },
  });

  const { data: yearlyData, isLoading: yearlyDataLoading } = useQuery<TeamYearlyDataRow | null>({
    queryKey: ["/api/team-yearly-data", editingTeam?.teamId, { year: metricsYear }],
    queryFn: async () => {
      if (!editingTeam) return null;
      const res = await fetch(`/api/team-yearly-data/${editingTeam.teamId}?year=${metricsYear}`);
      return await res.json();
    },
    enabled: !!editingTeam && rightPanelMode === "editTeam",
  });

  const saveYearlyDataMutation = useMutation({
    mutationFn: async (data: { teamId: string; year: number; vilocity: number; sprintDuration: number; spPrice: number; hasSprints: boolean }) => {
      const res = await apiRequest("POST", "/api/team-yearly-data", data);
      return await res.json();
    },
    onSuccess: () => {
      if (editingTeam) {
        queryClient.invalidateQueries({ queryKey: ["/api/team-yearly-data", editingTeam.teamId] });
      }
    },
  });

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
      setInitSpaceId("");
      setOmniBoardId("");
      setVelocity("");
      setSprintDuration("");
      setSpPrice("");
      setSelectedDepartmentForTeam(departments?.[0]?.id || "");
    } else if (rightPanelMode === "editTeam" && editingTeam) {
      setTeamName(editingTeam.teamName);
      setSpaceId(editingTeam.spaceId.toString());
      setSprintBoardId(editingTeam.sprintBoardId?.toString() || "");
      setInitBoardId(editingTeam.initBoardId.toString());
      setInitSpaceId(editingTeam.initSpaceId?.toString() || "");
      setOmniBoardId(editingTeam.omniBoardId?.toString() || "");
      setHasSprints(true);
      setSprintIds("");
    }
  }, [rightPanelMode, editingDepartment, editingTeam, departments]);

  useEffect(() => {
    if (rightPanelMode === "editTeam" && editingTeam && !yearlyDataLoading) {
      if (yearlyData) {
        setVelocity(yearlyData.vilocity.toString());
        setSprintDuration(yearlyData.sprintDuration.toString());
        setSpPrice(yearlyData.spPrice.toString());
        setHasSprints(yearlyData.hasSprints);
      } else {
        setVelocity(editingTeam.vilocity.toString());
        setSprintDuration(editingTeam.sprintDuration.toString());
        setSpPrice(editingTeam.spPrice.toString());
        setHasSprints(editingTeam.hasSprints);
      }
    }
  }, [rightPanelMode, editingTeam, yearlyData, yearlyDataLoading, metricsYear]);

  const handleDepartmentClick = (dept: DepartmentWithTeamCount) => {
    setEditingDepartment(dept);
    setEditingTeam(null);
    setRightPanelMode("editBlock");
  };

  const handleTeamClick = (team: TeamRow) => {
    setEditingTeam(team);
    setEditingDepartment(null);
    setRightPanelMode("editTeam");
    setTeamName(team.teamName);
    setSpaceId(team.spaceId.toString());
    setSprintBoardId(team.sprintBoardId?.toString() || "");
    setInitBoardId(team.initBoardId.toString());
    setInitSpaceId(team.initSpaceId?.toString() || "");
    setOmniBoardId(team.omniBoardId?.toString() || "");
    setHasSprints(true);
    setSprintIds("");
    setMetricsYear(new Date().getFullYear().toString());
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
      const initSpaceIdChanged = (initSpaceId ? parseInt(initSpaceId) : (editingTeam.initSpaceId ?? 0)) !== (editingTeam.initSpaceId ?? 0);
      const omniBoardIdChanged = (omniBoardId ? parseInt(omniBoardId) : (editingTeam.omniBoardId ?? 0)) !== (editingTeam.omniBoardId ?? 0);
      const velocityChanged = (velocity ? parseInt(velocity) : editingTeam.vilocity) !== editingTeam.vilocity;
      const sprintDurationChanged = (sprintDuration ? parseInt(sprintDuration) : editingTeam.sprintDuration) !== editingTeam.sprintDuration;
      const spPriceChanged = (spPrice ? parseInt(spPrice) : editingTeam.spPrice) !== editingTeam.spPrice;
      const hasSprintsChanged = hasSprints !== true;
      const sprintIdsChanged = sprintIds.trim() !== "";
      return nameChanged || spaceIdChanged || sprintBoardIdChanged || initBoardIdChanged || initSpaceIdChanged || omniBoardIdChanged || velocityChanged || sprintDurationChanged || spPriceChanged || hasSprintsChanged || sprintIdsChanged;
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

  return (
    <div className="bg-background flex-1" data-testid="page-settings">
      <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto">
        <div className="px-6 pb-6">
          <div className="border border-border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 80px)' }}>
            <div className="flex h-full">
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
                      onTeamDelete={(team) => {
                        deleteTeamMutation.mutate({
                          teamId: team.teamId,
                          departmentId: team.departmentId
                        });
                      }}
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
                          <MdAccountTree className="h-5 w-5" style={{ color: '#cd253d' }} />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">
                          {blockName.trim() || "Новый блок"}
                        </h2>
                      </div>
                    </div>
                    <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                      <div className="space-y-2">
                        <Label htmlFor="block-name">Название блока <span className="text-destructive">*</span></Label>
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
                            className="no-arrows"
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
                            className="no-arrows"
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
                          <Users className="h-5 w-5" style={{ color: '#cd253d' }} />
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
                    <div className="flex-1 px-6 pt-3 pb-6 space-y-4 overflow-y-auto">
                      <div className="space-y-2">
                        <Label htmlFor="team-name">Название команды <span className="text-destructive">*</span></Label>
                        <Input
                          id="team-name"
                          placeholder="Введите название команды"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          data-testid="input-team-name"
                        />
                      </div>

                      <div className="pt-2">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3" data-testid="section-kaiten-integration">Настройка интеграции с Kaiten</h3>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="space-id">ID пространства <span className="text-destructive">*</span></Label>
                              <Input
                                id="space-id"
                                type="number"
                                placeholder="0"
                                value={spaceId}
                                onChange={(e) => setSpaceId(e.target.value)}
                                className="no-arrows"
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
                                className="no-arrows"
                                data-testid="input-sprint-board-id"
                              />
                            </div>
                          </div>
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="init-board-id">ID доски инициатив <span className="text-destructive">*</span></Label>
                              <Input
                                id="init-board-id"
                                type="number"
                                placeholder="0"
                                value={initBoardId}
                                onChange={(e) => setInitBoardId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-init-board-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="init-space-id">ID пространства инициатив <span className="text-destructive">*</span></Label>
                              <Input
                                id="init-space-id"
                                type="number"
                                placeholder="0"
                                value={initSpaceId}
                                onChange={(e) => setInitSpaceId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-init-space-id"
                              />
                            </div>
                          </div>
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="omni-board-id">ID omni-доски</Label>
                              <Input
                                id="omni-board-id"
                                type="number"
                                placeholder="0"
                                value={omniBoardId}
                                onChange={(e) => setOmniBoardId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-omni-board-id"
                              />
                            </div>
                            <div className="flex-1" />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-semibold text-muted-foreground" data-testid="section-annual-metrics">Годовые метрики и данные за:</h3>
                          <Select value={metricsYear} onValueChange={setMetricsYear}>
                            <SelectTrigger className="w-[100px] h-8" data-testid="select-metrics-year">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[300]">
                              <SelectItem value="2024">2024</SelectItem>
                              <SelectItem value="2025">2025</SelectItem>
                              <SelectItem value="2026">2026</SelectItem>
                              <SelectItem value="2027">2027</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="velocity">Velocity <span className="text-destructive">*</span></Label>
                              <Input
                                id="velocity"
                                type="number"
                                placeholder="0"
                                value={velocity}
                                onChange={(e) => setVelocity(e.target.value)}
                                className="no-arrows"
                                data-testid="input-velocity"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="sprint-duration">Длительность спринта (дней) <span className="text-destructive">*</span></Label>
                              <Input
                                id="sprint-duration"
                                type="number"
                                placeholder="0"
                                value={sprintDuration}
                                onChange={(e) => setSprintDuration(e.target.value)}
                                className="no-arrows"
                                data-testid="input-sprint-duration"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="sp-price">Стоимость одного SP</Label>
                              <Input
                                id="sp-price"
                                type="number"
                                placeholder="0"
                                value={spPrice}
                                onChange={(e) => setSpPrice(e.target.value)}
                                className="no-arrows"
                                data-testid="input-sp-price"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <Checkbox 
                                id="edit-has-sprints" 
                                checked={hasSprints}
                                onCheckedChange={(checked) => setHasSprints(checked === true)}
                                data-testid="checkbox-has-sprints"
                              />
                              <Label htmlFor="edit-has-sprints" className="cursor-pointer">Спринты</Label>
                            </div>
                            <Input
                              id="edit-sprint-ids"
                              placeholder="Sprint IDs через запятую"
                              value={sprintIds}
                              onChange={(e) => setSprintIds(e.target.value)}
                              disabled={!hasSprints}
                              data-testid="input-sprint-ids"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    {editingTeam && hasFormChanged() && (
                      <div className="p-4 flex justify-end">
                        <Button
                          disabled={!teamName.trim() || !initSpaceId || updateTeamMutation.isPending}
                          style={{ backgroundColor: '#cd253d' }}
                          className="hover:opacity-90 border-0"
                          data-testid="button-save-team"
                          onClick={() => {
                            if (editingTeam) {
                              const vel = velocity ? parseInt(velocity) : editingTeam.vilocity;
                              const sd = sprintDuration ? parseInt(sprintDuration) : editingTeam.sprintDuration;
                              const sp = spPrice ? parseInt(spPrice) : editingTeam.spPrice;
                              updateTeamMutation.mutate({
                                teamId: editingTeam.teamId,
                                teamName: teamName.trim(),
                                spaceId: spaceId ? parseInt(spaceId) : editingTeam.spaceId,
                                sprintBoardId: sprintBoardId ? parseInt(sprintBoardId) : null,
                                initBoardId: initBoardId ? parseInt(initBoardId) : editingTeam.initBoardId,
                                initSpaceId: parseInt(initSpaceId),
                                omniBoardId: omniBoardId ? parseInt(omniBoardId) : null,
                                vilocity: vel,
                                sprintDuration: sd,
                                spPrice: sp,
                                departmentId: editingTeam.departmentId
                              });
                              saveYearlyDataMutation.mutate({
                                teamId: editingTeam.teamId,
                                year: parseInt(metricsYear),
                                vilocity: vel,
                                sprintDuration: sd,
                                spPrice: sp,
                                hasSprints,
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
                          <Users className="h-5 w-5" style={{ color: '#cd253d' }} />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">
                          {teamName.trim() || "Новая команда"}
                        </h2>
                      </div>
                    </div>
                    <div className="flex-1 px-6 pt-3 pb-6 space-y-4 overflow-y-auto">
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-2">
                          <Label htmlFor="new-team-name">Название команды <span className="text-destructive">*</span></Label>
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

                      <div className="pt-2">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3" data-testid="section-new-kaiten-integration">Настройка интеграции с Kaiten</h3>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-space-id">ID пространства <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-space-id"
                                type="number"
                                placeholder="0"
                                value={spaceId}
                                onChange={(e) => setSpaceId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-space-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-sprint-board-id">ID доски <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-sprint-board-id"
                                type="number"
                                placeholder="0"
                                value={sprintBoardId}
                                onChange={(e) => setSprintBoardId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-sprint-board-id"
                              />
                            </div>
                          </div>
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-init-board-id">ID доски инициатив <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-init-board-id"
                                type="number"
                                placeholder="0"
                                value={initBoardId}
                                onChange={(e) => setInitBoardId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-init-board-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-init-space-id">ID пространства инициатив <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-init-space-id"
                                type="number"
                                placeholder="0"
                                value={initSpaceId}
                                onChange={(e) => setInitSpaceId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-init-space-id"
                              />
                            </div>
                          </div>
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-omni-board-id">ID omni-доски</Label>
                              <Input
                                id="new-omni-board-id"
                                type="number"
                                placeholder="0"
                                value={omniBoardId}
                                onChange={(e) => setOmniBoardId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-omni-board-id"
                              />
                            </div>
                            <div className="flex-1" />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-sm font-semibold text-muted-foreground" data-testid="section-new-annual-metrics">Годовые метрики и данные за:</h3>
                          <Select value={metricsYear} onValueChange={setMetricsYear}>
                            <SelectTrigger className="w-[100px] h-8" data-testid="select-new-metrics-year">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[300]">
                              <SelectItem value="2024">2024</SelectItem>
                              <SelectItem value="2025">2025</SelectItem>
                              <SelectItem value="2026">2026</SelectItem>
                              <SelectItem value="2027">2027</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-velocity">Velocity <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-velocity"
                                type="number"
                                placeholder="0"
                                value={velocity}
                                onChange={(e) => setVelocity(e.target.value)}
                                className="no-arrows"
                                data-testid="input-velocity"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-sprint-duration">Длительность спринта (дней) <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-sprint-duration"
                                type="number"
                                placeholder="0"
                                value={sprintDuration}
                                onChange={(e) => setSprintDuration(e.target.value)}
                                className="no-arrows"
                                data-testid="input-sprint-duration"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-sp-price">Стоимость одного SP</Label>
                              <Input
                                id="new-sp-price"
                                type="number"
                                placeholder="0"
                                value={spPrice}
                                onChange={(e) => setSpPrice(e.target.value)}
                                className="no-arrows"
                                data-testid="input-sp-price"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <Checkbox 
                                id="new-has-sprints" 
                                checked={hasSprints}
                                onCheckedChange={(checked) => setHasSprints(checked === true)}
                                data-testid="checkbox-has-sprints"
                              />
                              <Label htmlFor="new-has-sprints" className="cursor-pointer">Спринты</Label>
                            </div>
                            <Input
                              id="new-sprint-ids"
                              placeholder="Sprint IDs через запятую"
                              value={sprintIds}
                              onChange={(e) => setSprintIds(e.target.value)}
                              disabled={!hasSprints}
                              data-testid="input-sprint-ids"
                            />
                          </div>
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
                          !initSpaceId ||
                          !velocity || 
                          !sprintDuration ||
                          (hasSprints && !sprintIds.trim()) ||
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
                            initSpaceId: parseInt(initSpaceId),
                            omniBoardId: omniBoardId ? parseInt(omniBoardId) : undefined,
                            vilocity: parseInt(velocity),
                            sprintDuration: parseInt(sprintDuration),
                            spPrice: spPrice ? parseInt(spPrice) : undefined,
                            departmentId: selectedDepartmentForTeam,
                            hasSprints,
                            sprintIds: hasSprints ? sprintIds.trim() : undefined
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
          </div>
        </div>
      </div>
    </div>
  );
}
