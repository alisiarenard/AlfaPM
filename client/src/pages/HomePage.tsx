import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { TeamHeader } from "@/components/TeamHeader";
import { MetricsCharts } from "@/components/MetricsCharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AlertCircle, Settings, ChevronRight, ChevronDown, Plus, Folder, MoreVertical, Download, Users, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MdAccountTree } from "react-icons/md";
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

export default function HomePage() {
  const currentYear = new Date().getFullYear();
  const [location, setLocation] = useLocation();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [activeTabInitialized, setActiveTabInitialized] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [activeTab, setActiveTab] = useState<string>("");
  const [viewTab, setViewTab] = useState<"initiatives" | "metrics">("initiatives");
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
  const [hasSprints, setHasSprints] = useState(true);
  const [sprintIds, setSprintIds] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const { toast } = useToast();

  // Функция для парсинга query параметров из URL
  const parseUrlParams = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return {
      dept: searchParams.get('dept') || '',
      year: searchParams.get('year') || currentYear.toString(),
      teams: searchParams.get('teams')?.split(',').filter(Boolean) || [],
      active: searchParams.get('active') === '1',
      tab: searchParams.get('tab') || ''
    };
  };

  // Функция для обновления URL с текущими фильтрами
  const updateUrl = (dept: string, year: string, teams: Set<string>, active: boolean, tab?: string) => {
    console.log(`[updateUrl] Called with tab: "${tab}"`);
    const params = new URLSearchParams();
    if (dept) params.set('dept', dept);
    if (year) params.set('year', year);
    if (teams.size > 0) params.set('teams', Array.from(teams).join(','));
    if (active) params.set('active', '1');
    if (tab) {
      console.log(`[updateUrl] Adding tab to URL: ${tab}`);
      params.set('tab', tab);
    } else {
      console.log(`[updateUrl] Tab is empty, NOT adding to URL`);
    }
    
    const newUrl = params.toString() ? `/?${params.toString()}` : '/';
    console.log(`[updateUrl] New URL: ${newUrl}`);
    if (location !== newUrl) {
      setLocation(newUrl);
    }
  };

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
      toast({
        title: "Успешно",
        description: "Команда создана и инициативы синхронизированы",
      });
      setActiveTab(newTeam.teamId);
      setEditingTeam(newTeam);
      setRightPanelMode("editTeam");
      // Сброс формы
      setTeamName("");
      setSpaceId("");
      setSprintBoardId("");
      setInitBoardId("");
      setVelocity("");
      setSprintDuration("");
      setSpPrice("");
      setHasSprints(true);
      setSprintIds("");
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
      sprintBoardId?: number | null; 
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
      setSprintBoardId(updatedTeam.sprintBoardId?.toString() || "");
      setInitBoardId(updatedTeam.initBoardId.toString());
      setVelocity(updatedTeam.vilocity.toString());
      setSprintDuration(updatedTeam.sprintDuration.toString());
      setSpPrice(updatedTeam.spPrice.toString());
      setHasSprints(true);
      setSprintIds("");
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
      
      if (selectedTeams.has(data.teamId)) {
        const newSelectedTeams = new Set(selectedTeams);
        newSelectedTeams.delete(data.teamId);
        setSelectedTeams(newSelectedTeams);
        
        if (newSelectedTeams.size === 0 && selectedDepartment) {
          setActiveTab('');
        }
      }
      
      if (activeTab === data.teamId) {
        setActiveTab('');
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

  useEffect(() => {
    if (departments && departments.length > 0) {
      const allDepartmentIds = new Set(departments.map(dept => dept.id));
      setExpandedDepartments(allDepartmentIds);
    }
  }, [departments]);

  // Восстановление состояния из URL при первой загрузке
  useEffect(() => {
    if (isInitialLoad && departments && departments.length > 0) {
      const urlParams = parseUrlParams();
      
      // Восстанавливаем департамент из URL или выбираем первый доступный
      if (urlParams.dept && departments.some(d => d.id === urlParams.dept)) {
        setSelectedDepartment(urlParams.dept);
      } else if (!selectedDepartment) {
        const firstAvailableDepartment = departments.find(dept => dept.teamCount > 0);
        if (firstAvailableDepartment) {
          setSelectedDepartment(firstAvailableDepartment.id);
        }
      }
      
      // Восстанавливаем год
      setSelectedYear(urlParams.year);
      
      // Восстанавливаем фильтр "Активные"
      setShowActiveOnly(urlParams.active);
      
      setIsInitialLoad(false);
    }
  }, [departments, isInitialLoad]);

  // Устанавливаем activeTab из URL только на начальной загрузке или когда текущий activeTab невалиден
  useEffect(() => {
    if (departmentTeams && departmentTeams.length > 0) {
      // Проверяем, нужно ли установить activeTab
      const needsTabUpdate = !activeTab || !departmentTeams.some(t => t.teamId === activeTab);
      
      if (needsTabUpdate) {
        const urlParams = parseUrlParams();
        // Если в URL есть tab параметр и он валидный, используем его
        if (urlParams.tab && departmentTeams.some(t => t.teamId === urlParams.tab)) {
          console.log(`[Tab Restore] Setting activeTab from URL: ${urlParams.tab}`);
          setActiveTab(urlParams.tab);
          setActiveTabInitialized(true);
        } else {
          // Иначе выбираем первую команду
          console.log(`[Tab Restore] No valid tab in URL, using first team: ${departmentTeams[0].teamId}`);
          setActiveTab(departmentTeams[0].teamId);
          setActiveTabInitialized(true);
        }
      } else {
        console.log(`[Tab Restore] activeTab already set and valid: ${activeTab}, skipping`);
        if (!activeTabInitialized) {
          setActiveTabInitialized(true);
        }
      }
    } else if (departmentTeams && departmentTeams.length === 0) {
      // Если департамент пустой, сбрасываем activeTab, selectedTeams и метрики
      console.log(`[Tab Restore] Department has no teams, clearing activeTab`);
      setActiveTab("");
      setActiveTabInitialized(false);
      setSelectedTeams(new Set());
      lastSuccessfulDataRef.current = null;
      lastSuccessfulCostStructureRef.current = null;
      lastSuccessfulValueCostRef.current = null;
    }
  }, [departmentTeams]);

  // Восстановление выбранных команд после загрузки команд департамента
  useEffect(() => {
    if (!isInitialLoad && departmentTeams && departmentTeams.length > 0 && selectedDepartment) {
      const urlParams = parseUrlParams();
      if (urlParams.teams.length > 0) {
        const validTeamIds = departmentTeams.map(t => t.teamId);
        const teamsToSelect = urlParams.teams.filter(tid => validTeamIds.includes(tid));
        if (teamsToSelect.length > 0) {
          setSelectedTeams(new Set(teamsToSelect));
        }
      }
    }
  }, [departmentTeams, selectedDepartment, isInitialLoad]);

  // Синхронизация URL при изменении фильтров
  useEffect(() => {
    // Не обновляем URL пока не загружены данные и не установлен activeTab
    if (!isInitialLoad && activeTabInitialized && activeTab) {
      console.log(`[URL Sync] Updating URL with activeTab: ${activeTab}`);
      updateUrl(selectedDepartment, selectedYear, selectedTeams, showActiveOnly, activeTab);
    } else {
      console.log(`[URL Sync] Skipping URL update - isInitialLoad: ${isInitialLoad}, activeTabInitialized: ${activeTabInitialized}, activeTab: "${activeTab}"`);
    }
  }, [selectedDepartment, selectedYear, selectedTeams, showActiveOnly, activeTab, isInitialLoad, activeTabInitialized]);

  // Синхронизация состояния при изменении URL через popstate (назад/вперед браузера)
  useEffect(() => {
    const handlePopState = () => {
      if (!isInitialLoad && departments && departments.length > 0) {
        const urlParams = parseUrlParams();
        
        // Обновляем департамент если он изменился в URL
        setSelectedDepartment(currentDept => {
          if (urlParams.dept !== currentDept) {
            if (urlParams.dept && departments.some(d => d.id === urlParams.dept)) {
              return urlParams.dept;
            } else if (!urlParams.dept && currentDept) {
              // Если параметр dept убрали из URL, выбираем первый доступный
              const firstAvailableDepartment = departments.find(dept => dept.teamCount > 0);
              return firstAvailableDepartment ? firstAvailableDepartment.id : currentDept;
            }
          }
          return currentDept;
        });
        
        // Обновляем год если он изменился в URL
        setSelectedYear(currentYear => {
          return urlParams.year !== currentYear ? urlParams.year : currentYear;
        });
        
        // Обновляем фильтр "Активные" если он изменился в URL
        setShowActiveOnly(currentActive => {
          return urlParams.active !== currentActive ? urlParams.active : currentActive;
        });
        
        // Обновляем выбранные команды если они изменились в URL
        setSelectedTeams(currentTeams => {
          const currentTeamsArray = Array.from(currentTeams).sort();
          const urlTeamsArray = urlParams.teams.sort();
          const teamsChanged = currentTeamsArray.length !== urlTeamsArray.length ||
            currentTeamsArray.some((t, i) => t !== urlTeamsArray[i]);
          
          if (teamsChanged && departmentTeams) {
            const validTeamIds = departmentTeams.map(t => t.teamId);
            const teamsToSelect = urlParams.teams.filter(tid => validTeamIds.includes(tid));
            return new Set(teamsToSelect);
          }
          return currentTeams;
        });
        
        // Обновляем активный таб если он изменился в URL
        setActiveTab(currentTab => {
          if (urlParams.tab && urlParams.tab !== currentTab && departmentTeams) {
            const validTabIds = departmentTeams.map(t => t.teamId);
            if (validTabIds.includes(urlParams.tab)) {
              return urlParams.tab;
            }
          }
          return currentTab;
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isInitialLoad, departments, departmentTeams]);

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
      setSprintBoardId(editingTeam.sprintBoardId?.toString() || "");
      setInitBoardId(editingTeam.initBoardId.toString());
      setVelocity(editingTeam.vilocity.toString());
      setSprintDuration(editingTeam.sprintDuration.toString());
      setSpPrice(editingTeam.spPrice.toString());
      setHasSprints(true);
      setSprintIds("");
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
    // Обновляем поля формы сразу, чтобы избежать мелькания кнопки "Сохранить"
    setTeamName(team.teamName);
    setSpaceId(team.spaceId.toString());
    setSprintBoardId(team.sprintBoardId?.toString() || "");
    setInitBoardId(team.initBoardId.toString());
    setVelocity(team.vilocity.toString());
    setSprintDuration(team.sprintDuration.toString());
    setSpPrice(team.spPrice.toString());
    setHasSprints(true); // Пока по умолчанию true, позже можно сохранять в БД
    setSprintIds(""); // Пока пустая строка, позже можно загружать из БД
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
      // Пока hasSprints и sprintIds не сохраняются в БД, считаем что они изменились если не пустые
      const hasSprintsChanged = hasSprints !== true; // По умолчанию true, если изменили - показываем кнопку
      const sprintIdsChanged = sprintIds.trim() !== ""; // По умолчанию пусто, если заполнили - показываем кнопку
      return nameChanged || spaceIdChanged || sprintBoardIdChanged || initBoardIdChanged || velocityChanged || sprintDurationChanged || spPriceChanged || hasSprintsChanged || sprintIdsChanged;
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
      // Не позволяем снять последнюю оставшуюся команду
      if (newSelectedTeams.size === 1) {
        return;
      }
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

  // Получаем массив ID команд для запросов
  const teamIdsArray = Array.from(selectedTeams);
  const teamIdsParam = teamIdsArray.sort().join(',');

  const handleDownloadReport = async () => {
    try {
      if (teamIdsArray.length === 0) {
        toast({
          title: "Ошибка",
          description: "Выберите хотя бы одну команду",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Формирование отчета",
        description: "Пожалуйста, подождите...",
      });

      const response = await fetch(`/api/metrics/cost-structure?teamIds=${teamIdsParam}&year=${selectedYear}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch cost structure data');
      }

      const data = await response.json();

      // Получаем инициативы для всех выбранных команд
      const selectedTeamsData = departmentTeams?.filter(t => selectedTeams.has(t.teamId)) || [];
      const initiativesPromises = selectedTeamsData.map(async (team) => {
        const url = `/api/initiatives/board/${team.initBoardId}?sprintBoardId=${team.sprintBoardId}&teamId=${team.teamId}&year=${selectedYear}&_t=${Date.now()}`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const initiatives = await response.json();
        return initiatives.map((init: any) => ({ ...init, team }));
      });

      const initiativesArrays = await Promise.all(initiativesPromises);
      const allInitiatives = initiativesArrays.flat();

      // Динамически импортируем библиотеку exceljs
      const ExcelJS = (await import('exceljs')).default;

      // Создаем рабочую книгу ExcelJS
      const workbook = new ExcelJS.Workbook();
      
      // Получаем название департамента
      const departmentName = departments?.find(d => d.id === selectedDepartment)?.department || 'Не указан';

      // Рассчитываем проценты для категорий
      const epicPercent = data.typePercentages['Epic'] || 0;
      const compliancePercent = data.typePercentages['Compliance'] || 0;
      const enablerPercent = data.typePercentages['Enabler'] || 0;
      const developmentPercent = epicPercent + compliancePercent + enablerPercent;
      const supportPercent = 100 - developmentPercent;

      // Получаем названия команд
      const teamNames = data.teams.map((t: { name: string }) => t.name).join(', ');

      // Создаем лист "Структура затрат"
      const worksheet = workbook.addWorksheet('Структура затрат');
      
      // Устанавливаем ширину колонок
      worksheet.columns = [
        { width: 25 },
        { width: 15 }
      ];

      // Добавляем данные
      worksheet.addRow(['Год', data.year]);
      worksheet.addRow(['Блок', departmentName]);
      worksheet.addRow(['Команды', teamNames]);
      worksheet.addRow(['']);
      const razvitieRow = worksheet.addRow(['РАЗВИТИЕ', `${developmentPercent}%`]);
      worksheet.addRow(['Epic', `${epicPercent}%`]);
      worksheet.addRow(['Compliance', `${compliancePercent}%`]);
      worksheet.addRow(['Enabler', `${enablerPercent}%`]);
      worksheet.addRow(['']);
      const podderzhkaRow = worksheet.addRow(['ПОДДЕРЖКА', `${supportPercent}%`]);

      // Добавляем остальные типы (кроме Epic, Compliance, Enabler)
      const supportTypes = ['Service Desk', 'Bug', 'Security', 'Tech debt', 'Postmortem', 'Др. доработки'];
      for (const type of supportTypes) {
        const percentage = data.typePercentages[type] || 0;
        worksheet.addRow([type, `${percentage}%`]);
      }

      // Применяем шрифт Akrobat 14 и выравнивание ко всем ячейкам
      worksheet.eachRow((row) => {
        row.eachCell((cell, colNumber) => {
          cell.font = { name: 'Akrobat', size: 14 };
          // Выравнивание по центру для ячеек с процентами (второй столбец)
          if (colNumber === 2 && cell.value && typeof cell.value === 'string' && cell.value.includes('%')) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });
      });

      // Выделяем жирным строки "РАЗВИТИЕ" и "ПОДДЕРЖКА"
      [razvitieRow, podderzhkaRow].forEach(row => {
        row.eachCell((cell) => {
          cell.font = { name: 'Akrobat', size: 14, bold: true };
        });
      });

      // Создаем лист "Инициативы"
      const initiativesWorksheet = workbook.addWorksheet('Инициативы');
      
      // Получаем уникальные команды и сортируем их
      const uniqueTeamsMap = new Map<string, any>();
      allInitiatives.forEach((initiative: any) => {
        if (initiative.team && initiative.team.teamId && !uniqueTeamsMap.has(initiative.team.teamId)) {
          uniqueTeamsMap.set(initiative.team.teamId, initiative.team);
        }
      });
      const sortedTeams = Array.from(uniqueTeamsMap.values()).sort((a, b) => a.teamName.localeCompare(b.teamName));
      
      // Устанавливаем ширину колонок (базовые 13 + одна на каждую команду)
      initiativesWorksheet.columns = [
        { width: 15 }, // Тип
        { width: 40 }, // Инициативы
        { width: 15 }, // Срок (план)
        { width: 15 }, // Срок (прод)
        { width: 15 }, // Срок (эффект)
        { width: 15 }, // Затраты (план)
        { width: 15 }, // Затраты (факт)
        { width: 15 }, // Тип эффект
        { width: 18 }, // эффект по данным
        { width: 15 }, // Эффект (план)
        { width: 15 }, // Эффект (факт)
        { width: 18 }, // Value/Cost (план)
        { width: 18 }, // Value/Cost (факт)
        ...sortedTeams.map(() => ({ width: 12 })) // Колонки для каждой команды
      ];

      // Добавляем заголовок
      const headerValues = [
        'Тип', 'Инициативы', 'Срок (план)', 'Срок (прод)', 'Срок (эффект)', 
        'Затраты (план)', 'Затраты (факт)', 'Тип эффект', 'эффект по данным', 
        'Эффект (план)', 'Эффект (факт)', 'Value/Cost (план)', 'Value/Cost (факт)',
        ...sortedTeams.map(team => team.teamName)
      ];
      const headerRow = initiativesWorksheet.addRow(headerValues);
      
      // Применяем форматирование к заголовку
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Akrobat', size: 14, color: { argb: 'FFFFFFFF' } }; // Белый текст
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC00000' } // Красный фон RGB(192, 0, 0)
        };
        
        // Выравнивание по центру для всех столбцов кроме первых двух
        if (colNumber > 2) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });

      // Функция для форматирования даты в формат "dd.MM"
      const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return '—';
        try {
          const date = new Date(dateString);
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          return `${day}.${month}`;
        } catch {
          return '—';
        }
      };

      // Группируем инициативы по cardId для исключения дубликатов
      const initiativesByCardId = new Map<number, any[]>();
      allInitiatives.forEach((initiative: any) => {
        // Пропускаем "Поддержку бизнеса"
        if (initiative.cardId === 0) return;
        
        // Пропускаем архивные инициативы
        if (initiative.condition === "2-archived") return;
        
        // Оставляем только Epic, Compliance, Enabler
        if (initiative.type !== 'Epic' && initiative.type !== 'Compliance' && initiative.type !== 'Enabler') {
          return;
        }
        
        if (!initiativesByCardId.has(initiative.cardId)) {
          initiativesByCardId.set(initiative.cardId, []);
        }
        initiativesByCardId.get(initiative.cardId)!.push(initiative);
      });

      // Обрабатываем уникальные инициативы и собираем их данные
      const processedInitiatives: any[] = [];
      initiativesByCardId.forEach((initiatives) => {
        // Используем данные из первой инициативы для общих полей
        const firstInit = initiatives[0];
        
        // Суммируем затраты по всем командам
        let totalPlannedCost = 0;
        let totalActualCost = 0;
        
        // Подсчитываем SP по каждой команде
        const spByTeamId = new Map<string, number>();
        
        initiatives.forEach((initiative: any) => {
          const team = initiative.team;
          // Считаем SP только для done-задач (как на главной странице)
          let actualSize = 0;
          if (initiative.sprints && Array.isArray(initiative.sprints)) {
            for (const sprint of initiative.sprints) {
              if (sprint.tasks && Array.isArray(sprint.tasks)) {
                for (const task of sprint.tasks) {
                  // Только done-задачи, не удаленные
                  if (task.state === '3-done' && task.condition !== '3 - deleted') {
                    actualSize += task.size || 0;
                  }
                }
              } else {
                // Fallback если нет tasks - используем sp
                actualSize += sprint.sp || 0;
              }
            }
          }
          const plannedSize = initiative.size || 0;
          totalPlannedCost += plannedSize * team.spPrice;
          totalActualCost += actualSize * team.spPrice;
          
          // Сохраняем SP по команде
          spByTeamId.set(team.teamId, (spByTeamId.get(team.teamId) || 0) + actualSize);
        });

        // Для Compliance и Enabler эффект = затратам
        let plannedValue: number | null;
        let factValue: number | null;
        
        if (firstInit.type === 'Compliance' || firstInit.type === 'Enabler') {
          plannedValue = totalPlannedCost;
          factValue = totalActualCost;
        } else {
          // Для остальных типов преобразуем plannedValue и factValue из строки в число
          plannedValue = firstInit.plannedValue && firstInit.plannedValue.trim() !== '' 
            ? parseFloat(firstInit.plannedValue) 
            : null;
          factValue = firstInit.factValue && firstInit.factValue.trim() !== '' 
            ? parseFloat(firstInit.factValue) 
            : null;
        }

        // Рассчитываем value/cost
        const plannedValueCost = plannedValue !== null && totalPlannedCost > 0
          ? Math.round((plannedValue / totalPlannedCost) * 10) / 10
          : null;
        const factValueCost = factValue !== null && totalActualCost > 0
          ? Math.round((factValue / totalActualCost) * 10) / 10
          : null;

        // Срок (прод): показываем срок план только если инициатива в статусе done
        const productionDate = firstInit.state === '3-done' ? firstInit.dueDate : null;

        processedInitiatives.push({
          type: firstInit.type || '—',
          title: firstInit.title,
          dueDate: firstInit.dueDate,
          doneDate: productionDate,
          totalPlannedCost,
          totalActualCost,
          plannedValue,
          factValue,
          plannedValueCost,
          factValueCost,
          spByTeamId
        });
      });

      // Группируем по типам
      const epicInitiatives = processedInitiatives.filter(i => i.type === 'Epic');
      const complianceInitiatives = processedInitiatives.filter(i => i.type === 'Compliance');
      const enablerInitiatives = processedInitiatives.filter(i => i.type === 'Enabler');

      // Функция для добавления группы инициатив
      const addInitiativesGroup = (initiatives: any[], typeName: string) => {
        if (initiatives.length === 0) return;

        // Фильтруем инициативы - только с фактическими затратами
        const initiativesWithActualCosts = initiatives.filter(init => init.totalActualCost > 0);
        
        if (initiativesWithActualCosts.length === 0) return;

        // Сначала вычисляем суммы только для инициатив с фактическими затратами
        let sumPlannedCost = 0;
        let sumActualCost = 0;
        let sumPlannedValue = 0;
        let sumFactValue = 0;

        initiativesWithActualCosts.forEach((init) => {
          sumPlannedCost += init.totalPlannedCost;
          sumActualCost += init.totalActualCost;
          if (init.plannedValue !== null) sumPlannedValue += init.plannedValue;
          if (init.factValue !== null) sumFactValue += init.factValue;
        });

        // Добавляем строку "Всего" СНАЧАЛА
        const totalPlannedValueCost = sumPlannedValue > 0 && sumPlannedCost > 0
          ? Math.round((sumPlannedValue / sumPlannedCost) * 10) / 10
          : '—';
        const totalFactValueCost = sumFactValue > 0 && sumActualCost > 0
          ? Math.round((sumFactValue / sumActualCost) * 10) / 10
          : '—';

        // Суммируем SP по командам для итоговой строки
        const teamSpTotals = new Map<string, number>();
        initiativesWithActualCosts.forEach((init) => {
          init.spByTeamId?.forEach((sp: number, teamId: string) => {
            teamSpTotals.set(teamId, (teamSpTotals.get(teamId) || 0) + sp);
          });
        });
        
        const totalRowValues = [
          'Всего',
          typeName, // Тип инициативы
          '',
          '',
          '',
          sumPlannedCost,
          sumActualCost,
          '', // Тип эффект - пусто для итоговой строки
          '', // эффект по данным - пусто для итоговой строки
          sumPlannedValue || '—',
          sumFactValue || '—',
          totalPlannedValueCost,
          totalFactValueCost,
          ...sortedTeams.map(team => teamSpTotals.get(team.teamId) || 0)
        ];
        
        const totalRow = initiativesWorksheet.addRow(totalRowValues);
        
        // Применяем светлый фон, шрифт и выравнивание к строке "Всего"
        totalRow.eachCell((cell, colNumber) => {
          cell.font = { name: 'Akrobat', size: 14, bold: true }; // Жирный шрифт
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8E8E8' } // Светло-серый фон
          };
          
          // Выравнивание по центру для всех столбцов кроме первых двух
          if (colNumber > 2) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
          
          // Числовой формат для столбцов с затратами и эффектами
          if ([6, 7, 10, 11].includes(colNumber)) {
            cell.numFmt = '#,##0';
          }
          // Value/Cost округляем до одной десятой
          if ([12, 13].includes(colNumber)) {
            cell.numFmt = '#,##0.0';
          }
        });

        // Потом добавляем детали инициатив (только с фактическими затратами)
        initiativesWithActualCosts.forEach((init) => {
          const rowValues = [
            init.type,
            init.title,
            formatDate(init.dueDate),
            formatDate(init.doneDate),
            '—', // Срок (эффект) - пока не определено
            init.totalPlannedCost,
            init.totalActualCost,
            '', // Тип эффект - оставляем пустым
            '', // эффект по данным - оставляем пустым
            init.plannedValue ?? '—',
            init.factValue ?? '—',
            init.plannedValueCost ?? '—',
            init.factValueCost ?? '—',
            ...sortedTeams.map(team => init.spByTeamId?.get(team.teamId) || 0)
          ];
          const row = initiativesWorksheet.addRow(rowValues);
          
          // Применяем шрифт, выравнивание и числовой формат к обычным строкам
          row.eachCell((cell, colNumber) => {
            cell.font = { name: 'Akrobat', size: 14 };
            
            // Выравнивание по центру для всех столбцов кроме первых двух
            if (colNumber > 2) {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
            
            // Числовой формат для столбцов с затратами и эффектами
            if ([6, 7, 10, 11].includes(colNumber)) {
              cell.numFmt = '#,##0';
            }
            // Value/Cost округляем до одной десятой
            if ([12, 13].includes(colNumber)) {
              cell.numFmt = '#,##0.0';
            }
          });
        });
      };

      // Добавляем группы в порядке: Epic, Compliance, Enabler
      addInitiativesGroup(epicInitiatives, 'Epic');
      addInitiativesGroup(complianceInitiatives, 'Compliance');
      addInitiativesGroup(enablerInitiatives, 'Enabler');

      // Генерируем имя файла
      const fileName = `Cost_Structure_${data.year}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Сохраняем файл через ExcelJS
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Успешно",
        description: "Отчет успешно скачан",
      });
    } catch (error) {
      console.error('Error downloading report:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось сформировать отчет",
        variant: "destructive",
      });
    }
  };

  // Получаем Innovation Rate для выбранных команд
  const { data: innovationRateData, isFetching: isIRFetching } = useQuery<{
    success: boolean;
    actualIR: number;
    plannedIR: number;
    diffFromPlanned: number;
    totalSP: number;
    innovationSP: number;
  }>({
    queryKey: ['/api/metrics/innovation-rate', { teamIds: teamIdsParam, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/innovation-rate?teamIds=${teamIdsParam}&year=${selectedYear}`);
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

  // Получаем Cost Structure для выбранных команд и года
  const { data: costStructureData, isFetching: isCostStructureFetching } = useQuery<{
    success: boolean;
    year: number;
    totalSP: number;
    typeStats: Record<string, number>;
    typePercentages: Record<string, number>;
    teams: Array<{ id: string; name: string }>;
  }>({
    queryKey: ['/api/metrics/cost-structure', { teamIds: teamIdsParam, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/cost-structure?teamIds=${teamIdsParam}&year=${selectedYear}`);
      if (!response.ok) {
        throw new Error('Failed to fetch cost structure');
      }
      return response.json();
    },
    enabled: teamIdsArray.length > 0,
    placeholderData: (previousData) => previousData,
  });

  // Используем ref для хранения последнего успешного значения
  const lastSuccessfulCostStructureRef = useRef<typeof costStructureData | null>(null);
  
  // Обновляем ref когда получаем новые данные
  if (costStructureData && !isCostStructureFetching) {
    lastSuccessfulCostStructureRef.current = costStructureData;
  }

  // Показываем последнее успешное значение во время загрузки
  const displayCostStructure = costStructureData || lastSuccessfulCostStructureRef.current;

  // Получаем Value/Cost для выбранных команд
  const { data: valueCostData, isFetching: isValueCostFetching } = useQuery<{
    success: boolean;
    plannedValueCost: number;
    factValueCost: number;
    sumPlannedValue: number;
    sumPlannedCost: number;
    sumFactValue: number;
    sumFactCost: number;
  }>({
    queryKey: ['/api/metrics/value-cost', { teamIds: teamIdsParam, year: selectedYear }],
    queryFn: async () => {
      const response = await fetch(`/api/metrics/value-cost?teamIds=${teamIdsParam}&year=${selectedYear}`);
      if (!response.ok) {
        throw new Error('Failed to fetch value/cost');
      }
      return response.json();
    },
    enabled: teamIdsArray.length > 0,
    placeholderData: (previousData) => previousData,
  });

  // Используем ref для хранения последнего успешного значения
  const lastSuccessfulValueCostRef = useRef<typeof valueCostData | null>(null);
  
  // Обновляем ref когда получаем новые данные
  if (valueCostData && !isValueCostFetching) {
    lastSuccessfulValueCostRef.current = valueCostData;
  }

  // Показываем последнее успешное значение во время загрузки
  const displayValueCost = valueCostData || lastSuccessfulValueCostRef.current;


  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <img src={logoImage} alt="Logo" className="w-10 h-10 rounded-md" />
              <h2 className="text-2xl font-bold text-foreground">AlfaPM</h2>
            </div>
            <div className="flex items-center gap-3">
            <Select 
              value={selectedDepartment} 
              onValueChange={(dept) => {
                setSelectedDepartment(dept);
                setActiveTabInitialized(false); // Сбрасываем флаг при смене департамента
              }}
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
                  >
                    {dept.department} {dept.teamCount === 0 ? "(нет команд)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select 
              value={selectedYear} 
              onValueChange={setSelectedYear}
              data-testid="select-year"
            >
              <SelectTrigger className="w-[120px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="2025" data-testid="option-year-2025">
                  2025
                </SelectItem>
                <SelectItem 
                  value="2026" 
                  data-testid="option-year-2026"
                  disabled={currentYear < 2026}
                >
                  2026
                </SelectItem>
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
      </div>
    </div>
    
    <div className="max-w-[1200px] xl:max-w-none xl:w-4/5 mx-auto" data-testid="main-container">
        <div className="p-6">
          {departmentTeams && departmentTeams.length > 0 && activeTab ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="mb-6">
                <div 
                  className="w-full h-[110px] border border-border rounded-lg flex relative transition-opacity duration-300"
                  style={{ opacity: isIRFetching || isCostStructureFetching || isValueCostFetching ? 0.5 : 1 }}
                >
                  <div className="w-[17%] px-4 py-3 flex flex-col justify-between">
                    <div className="text-sm font-bold text-muted-foreground">Innovation Rate</div>
                    <div className="text-3xl font-semibold" data-testid="metric-innovation-rate">
                      {displayIR ? `${displayIR.actualIR}%` : '-'}
                    </div>
                    <div className="text-[0.8rem] text-muted-foreground truncate">
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
                  <div className="w-[17%] px-4 py-3 flex flex-col justify-between">
                    <div className="text-sm font-bold text-muted-foreground">Value/Cost</div>
                    <div className="flex justify-between items-end w-full">
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-3xl font-semibold" data-testid="metric-value-cost-plan">
                          {displayValueCost ? displayValueCost.plannedValueCost.toFixed(1) : '-'}
                        </div>
                        <div className="text-[0.8rem] text-muted-foreground">плановый</div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-3xl font-semibold" data-testid="metric-value-cost-actual">
                          {displayValueCost ? displayValueCost.factValueCost.toFixed(1) : '-'}
                        </div>
                        <div className="text-[0.8rem] text-muted-foreground">фактический</div>
                      </div>
                    </div>
                    <div></div>
                  </div>
                  <div className="border-l border-border my-3"></div>
                  <div className="w-[66%] pl-4 py-3 flex flex-col justify-between">
                    <div className="text-sm font-bold text-muted-foreground">Структура затрат</div>
                    <div className="flex gap-2 items-end flex-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold" style={{ color: '#cd253d' }} data-testid="cost-epic">
                              {displayCostStructure?.typePercentages?.['Epic'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Epic</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Epic'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold" style={{ color: '#cd253d' }} data-testid="cost-compliance">
                              {displayCostStructure?.typePercentages?.['Compliance'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Compliance</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Compliance'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold" style={{ color: '#cd253d' }} data-testid="cost-enabler">
                              {displayCostStructure?.typePercentages?.['Enabler'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Enabler</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Enabler'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold text-muted-foreground" data-testid="cost-security">
                              {displayCostStructure?.typePercentages?.['Security'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Security</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Security'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold text-muted-foreground" data-testid="cost-service-desk">
                              {displayCostStructure?.typePercentages?.['Service Desk'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Service Desk</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Service Desk'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold text-muted-foreground" data-testid="cost-postmortem">
                              {displayCostStructure?.typePercentages?.['Postmortem'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Postmortem</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Postmortem'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold text-muted-foreground" data-testid="cost-tech-debt">
                              {displayCostStructure?.typePercentages?.['Tech debt'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Tech debt</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Tech debt'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 cursor-help">
                            <div className="text-[1rem] font-semibold text-muted-foreground" data-testid="cost-bug">
                              {displayCostStructure?.typePercentages?.['Bug'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Bug</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Bug'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-center gap-1 flex-1 min-w-[80px] cursor-help">
                            <div className="text-[1rem] font-semibold text-muted-foreground" data-testid="cost-other">
                              {displayCostStructure?.typePercentages?.['Др. доработки'] || 0}%
                            </div>
                            <div className="text-[0.8rem] text-muted-foreground truncate w-full text-center">Др. доработки</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{(displayCostStructure?.typeStats?.['Др. доработки'] || 0).toFixed(1)} SP</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-1 right-1 h-7 w-7 relative"
                        data-testid="button-menu"
                      >
                        <MoreVertical className="h-4 w-4" />
                        {departmentTeams && selectedTeams.size < departmentTeams.length && (
                          <span 
                            className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: '#cd253d' }}
                          />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-white z-[250]">
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
                              onSelect={(e) => e.preventDefault()}
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
              <div className="flex items-center justify-between">
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
                <div className="flex gap-0.5 bg-muted rounded-md p-0.5 mb-3">
                  <button
                    onClick={() => setViewTab("initiatives")}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      viewTab === "initiatives" 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="tab-view-initiatives"
                  >
                    Инициативы
                  </button>
                  <button
                    onClick={() => setViewTab("metrics")}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      viewTab === "metrics" 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="tab-view-metrics"
                  >
                    Метрики
                  </button>
                </div>
              </div>
              
              {departmentTeams.map((team) => (
                <TabsContent key={team.teamId} value={team.teamId}>
                  <TeamInitiativesTab team={team} showActiveOnly={showActiveOnly} setShowActiveOnly={setShowActiveOnly} selectedYear={selectedYear} viewTab={viewTab} />
                </TabsContent>
              ))}
            </Tabs>
          ) : selectedDepartment ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Users className="h-16 w-16 text-muted-foreground/50" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Нет команд в департаменте
                </h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md">
                  Для начала работы создайте команду в этом департаменте. После создания команды вы сможете синхронизировать инициативы из Kaiten.
                </p>
              </div>
              <Button
                onClick={() => {
                  setSelectedDepartmentForTeam(selectedDepartment);
                  setRightPanelMode("addTeam");
                  setSettingsOpen(true);
                }}
                style={{ backgroundColor: '#cd253d' }}
                className="hover:opacity-90 border-0"
                data-testid="button-create-team"
              >
                <Plus className="h-4 w-4 mr-2" />
                Создать команду
              </Button>
            </div>
          ) : departments && departments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Folder className="h-16 w-16 text-muted-foreground/50" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Нет департаментов
                </h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md">
                  Для начала работы создайте первый департамент. В нём вы сможете добавить команды и синхронизировать инициативы.
                </p>
              </div>
              <Button
                onClick={() => {
                  setRightPanelMode("addBlock");
                  setSettingsOpen(true);
                }}
                style={{ backgroundColor: '#cd253d' }}
                className="hover:opacity-90 border-0"
                data-testid="button-create-department"
              >
                <Plus className="h-4 w-4 mr-2" />
                Создать департамент
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <MdAccountTree className="h-16 w-16 text-muted-foreground/50" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Выберите департамент
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Используйте выпадающий список выше для выбора департамента
                </p>
              </div>
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
                  <div className="flex-1 px-6 pt-3 pb-6 space-y-2 overflow-y-auto">
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
                        <Label htmlFor="sprint-board-id">ID доски <span className="text-destructive">*</span></Label>
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
                    </div>
                    <div className="flex gap-4">
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
                        <Label htmlFor="sp-price">Стоимость одного SP (₽)</Label>
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
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="edit-has-sprints" 
                          checked={hasSprints}
                          onCheckedChange={(checked) => setHasSprints(checked === true)}
                          data-testid="checkbox-has-sprints"
                        />
                        <Label htmlFor="edit-has-sprints" className="cursor-pointer">Спринты</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-sprint-ids">Sprint IDs {hasSprints && <span className="text-destructive">*</span>}</Label>
                      <Input
                        id="edit-sprint-ids"
                        placeholder="Введите ID спринтов через запятую (например: 123, 456, 789)"
                        value={sprintIds}
                        onChange={(e) => setSprintIds(e.target.value)}
                        disabled={!hasSprints}
                        data-testid="input-sprint-ids"
                      />
                    </div>
                  </div>
                  {editingTeam && hasFormChanged() && (
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
                              sprintBoardId: sprintBoardId ? parseInt(sprintBoardId) : null,
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
                        <Users className="h-5 w-5" style={{ color: '#cd253d' }} />
                      </div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {teamName.trim() || "Новая команда"}
                      </h2>
                    </div>
                  </div>
                  <div className="flex-1 px-6 pt-3 pb-6 space-y-2 overflow-y-auto">
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
                    </div>
                    <div className="flex gap-4">
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
                        <Label htmlFor="new-sp-price">Стоимость одного SP (₽)</Label>
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
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="new-has-sprints" 
                          checked={hasSprints}
                          onCheckedChange={(checked) => setHasSprints(checked === true)}
                          data-testid="checkbox-has-sprints"
                        />
                        <Label htmlFor="new-has-sprints" className="cursor-pointer">Спринты</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-sprint-ids">Sprint IDs {hasSprints && <span className="text-destructive">*</span>}</Label>
                      <Input
                        id="new-sprint-ids"
                        placeholder="Введите ID спринтов через запятую (например: 123, 456, 789)"
                        value={sprintIds}
                        onChange={(e) => setSprintIds(e.target.value)}
                        disabled={!hasSprints}
                        data-testid="input-sprint-ids"
                      />
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
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamInitiativesTab({ team, showActiveOnly, setShowActiveOnly, selectedYear, viewTab }: { team: TeamRow; showActiveOnly: boolean; setShowActiveOnly: (value: boolean) => void; selectedYear: string; viewTab: "initiatives" | "metrics" }) {
  const { toast } = useToast();
  
  const { data: timelineData, isLoading: timelineLoading, error: initiativesError } = useQuery<{initiatives: Initiative[], sprints: SprintRow[]}>({
    queryKey: ["/api/timeline", team.teamId],
    queryFn: async () => {
      const response = await fetch(`/api/timeline/${team.teamId}`);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      return response.json();
    },
    enabled: !!team.teamId && !!team.initBoardId,
  });

  const initiativeRows = timelineData?.initiatives;
  const sprints = timelineData?.sprints;
  const initiativesLoading = timelineLoading;
  const sprintsLoading = timelineLoading;

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      // Умная синхронизация: синхронизирует инициативы + проверяет новый спринт + синхронизирует задачи нового спринта
      const smartSyncRes = await apiRequest("POST", `/api/kaiten/smart-sync/${team.teamId}`, {});
      const smartSyncData = await smartSyncRes.json();
      
      // Для команд без спринтов - дополнительно синхронизируем задачи из инициатив
      let tasksData = null;
      if (!team.sprintBoardId) {
        const tasksRes = await apiRequest("POST", `/api/kaiten/sync-initiative-tasks/${team.initBoardId}`, {});
        tasksData = await tasksRes.json();
      }
      
      return { 
        initiatives: { count: smartSyncData.initiativesSynced }, 
        sprint: smartSyncData.sprint,
        newSprintSynced: smartSyncData.newSprintSynced,
        tasks: tasksData
      };
    },
    onSuccess: (data) => {
      // Инвалидация timeline
      queryClient.invalidateQueries({ queryKey: ["/api/timeline", team.teamId] });
      
      // Инвалидация всех метрик (Innovation Rate, Cost Structure, Value/Cost)
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/innovation-rate'] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/cost-structure'] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/value-cost'] });
      
      let description = `Синхронизировано ${data.initiatives.count} инициатив`;
      
      // Для команд со спринтами - показываем информацию о синхронизированном спринте
      if (team.sprintBoardId && data.sprint) {
        const taskCount = data.sprint.tasksSynced || 0;
        if (data.newSprintSynced) {
          description += `. Новый спринт: ${taskCount} задач`;
        } else {
          description += ` и ${taskCount} задач из текущего спринта`;
        }
      } else if (team.sprintBoardId && !data.sprint) {
        description += '. Спринт не найден';
      }
      
      // Для команд без спринтов - показываем информацию о синхронизированных задачах
      if (!team.sprintBoardId && data.tasks) {
        description += ` и ${data.tasks.totalSynced || 0} задач`;
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
  
  console.log(`[Initiatives Filter] Received ${allInitiatives.length} initiatives from backend for team ${team.teamName}`);
  console.log(`[Initiatives Filter] All initiatives:`, allInitiatives.map(i => ({ 
    cardId: i.cardId, 
    title: i.title, 
    type: i.type, 
    state: i.state,
    sprintsCount: i.sprints?.length || 0,
    totalSp: i.sprints?.reduce((sum, s) => sum + s.sp, 0) || 0
  })));
  
  // Фильтруем инициативы:
  // 1. "Поддержка бизнеса" (cardId === 0) показываем всегда независимо от года
  // 2. Показываем только типы Epic, Compliance и Enabler
  // 3. Если включен фильтр "Активные" - только inProgress (скрываем queued и done)
  // 4. Если инициатива done или inProgress и выполнено 0 SP - не показываем
  // 5. Если выбран год, для инициатив done или inProgress показываем только те, у которых есть задачи, закрытые в этом году
  const initiatives = allInitiatives.filter(init => {
    // "Поддержка бизнеса" показываем всегда (независимо от года и других фильтров)
    const isSupport = init.cardId === 0;
    if (isSupport) {
      return true;
    }
    
    // Не показываем архивные инициативы
    if (init.condition === "2-archived") {
      console.log(`[Initiatives Filter] Filtered out initiative ${init.cardId} "${init.title}" - archived`);
      return false;
    }
    
    // Показываем только Epic, Compliance и Enabler
    if (init.type !== 'Epic' && init.type !== 'Compliance' && init.type !== 'Enabler') {
      console.log(`[Initiatives Filter] Filtered out initiative ${init.cardId} "${init.title}" - type: ${init.type} (не Epic/Compliance/Enabler)`);
      return false;
    }
    
    // Фильтр "Активные" - показываем только inProgress
    if (showActiveOnly && init.state !== "2-inProgress") {
      console.log(`[Initiatives Filter] Filtered out initiative ${init.cardId} "${init.title}" - state: ${init.state} (showActiveOnly=${showActiveOnly})`);
      return false;
    }
    
    // Если инициатива в статусе done или inProgress
    if (init.state === "2-inProgress" || init.state === "3-done") {
      // Считаем общее количество выполненных SP
      const totalSp = init.sprints.reduce((sum, sprint) => sum + sprint.sp, 0);
      
      // Не показываем если выполнено 0 SP
      if (totalSp === 0) {
        console.log(`[Initiatives Filter] Filtered out initiative ${init.cardId} "${init.title}" - totalSp: ${totalSp} (done/inProgress с 0 SP)`);
        return false;
      }
      
      // Фильтр по году: проверяем, есть ли задачи, закрытые в выбранном году
      const hasTasksInSelectedYear = init.sprints.some(sprint => 
        sprint.tasks.some(task => {
          if (!task.doneDate) return false;
          const taskYear = new Date(task.doneDate).getFullYear();
          return taskYear.toString() === selectedYear;
        })
      );
      
      // Не показываем если нет задач в выбранном году
      if (!hasTasksInSelectedYear) {
        console.log(`[Initiatives Filter] Filtered out initiative ${init.cardId} "${init.title}" - no tasks in year ${selectedYear} (state: ${init.state})`);
        return false;
      }
    }
    
    console.log(`[Initiatives Filter] Initiative ${init.cardId} "${init.title}" PASSED all filters`);
    return true;
  });
  
  // Сортируем инициативы:
  // 1. "Поддержка бизнеса" всегда первая
  // 2. Группировка по статусу (завершенные -> в работе -> запланированные)
  // 3. Внутри каждой группы статуса - от начатых раньше к начатым позже
  const sortedInitiatives = [...initiatives].sort((a, b) => {
    // "Поддержка бизнеса" всегда первая
    const isSupportA = a.cardId === 0;
    const isSupportB = b.cardId === 0;
    
    if (isSupportA && !isSupportB) return -1;
    if (!isSupportA && isSupportB) return 1;
    
    // Вспомогательная функция для получения самой ранней даты начала работы
    const getStartDate = (init: typeof a) => {
      // Собираем все doneDate из всех задач всех спринтов
      const allDoneDates = init.sprints
        .flatMap(sprint => sprint.tasks)
        .map(task => task.doneDate)
        .filter((date): date is string => date !== null)
        .map(date => new Date(date).getTime());
      
      // Возвращаем минимальную дату (самая ранняя задача = дата начала инициативы)
      return allDoneDates.length > 0 ? Math.min(...allDoneDates) : Infinity;
    };
    
    // Приоритет статусов: done (1) -> inProgress (2) -> queued (3)
    const statusPriority = {
      "3-done": 1,
      "2-inProgress": 2,
      "1-queued": 3,
    };
    
    const priorityA = statusPriority[a.state as keyof typeof statusPriority] || 999;
    const priorityB = statusPriority[b.state as keyof typeof statusPriority] || 999;
    
    // Сначала сортируем по статусу
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Внутри одного статуса - сортируем по дате начала (раньше начатые - выше)
    return getStartDate(a) - getStartDate(b);
  });
  
  console.log(`[Initiatives Filter] Final count: ${sortedInitiatives.length} initiatives shown (from ${allInitiatives.length} total)`);

  const teamData: Team = {
    boardId: team.initBoardId.toString(),
    teamId: team.teamId,
    name: team.teamName,
    velocity: team.vilocity,
    sprintDuration: team.sprintDuration,
    initBoardId: team.initBoardId,
    sprintBoardId: team.sprintBoardId,
    spaceId: team.spaceId,
    spPrice: team.spPrice
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
      <div className="overflow-auto custom-scrollbar pr-4" style={{ height: 'calc(100vh - 400px)' }}>
        {viewTab === "initiatives" ? (
          <InitiativesTimeline initiatives={sortedInitiatives} team={teamData} sprints={sprints || []} />
        ) : (
          <MetricsCharts team={team} selectedYear={selectedYear} />
        )}
      </div>
    </div>
  );
}
