import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, X, Users, Trash2, ChevronRight, ChevronDown } from "lucide-react";
import { MdAccountTree } from "react-icons/md";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { DepartmentWithTeamCount, TeamRow, Department, TeamYearlyDataRow, TeamMemberRow } from "@shared/schema";

const MEMBER_ROLES = ["Разработчик", "Тестировщик", "Аналитик", "Дизайнер"] as const;

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
  const [, setLocation] = useLocation();
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
  const [plannedIr, setPlannedIr] = useState("");
  const [initSpaceId, setInitSpaceId] = useState("");
  const [omniBoardId, setOmniBoardId] = useState("");
  const [devColumnId, setDevColumnId] = useState("");
  const [testColumnId, setTestColumnId] = useState("");
  const [extraBoards, setExtraBoards] = useState<{spaceId: string; boardId: string}[]>([]);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberUsername, setNewMemberUsername] = useState("");
  const [newMemberFullName, setNewMemberFullName] = useState("");
  const [newMemberAvatarUrl, setNewMemberAvatarUrl] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");
  const [newMemberGitlabUsername, setNewMemberGitlabUsername] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [gitlabSearchQuery, setGitlabSearchQuery] = useState("");
  const [gitlabSearchOpen, setGitlabSearchOpen] = useState(false);
  const [debouncedGitlabSearch, setDebouncedGitlabSearch] = useState("");
  const [metricsYear, setMetricsYear] = useState(new Date().getFullYear().toString());
  const [sprintIds, setSprintIds] = useState("");
  const [ttmSpaceId, setTtmSpaceId] = useState("");
  const [ttmBoardId, setTtmBoardId] = useState("");
  const [ttmStartColumnId, setTtmStartColumnId] = useState("");
  const [ttmEndColumnId, setTtmEndColumnId] = useState("");
  const [leadTimeStartColumnId, setLeadTimeStartColumnId] = useState("");
  const [leadTimeEndColumnId, setLeadTimeEndColumnId] = useState("");
  const [cycleTimeStartColumnId, setCycleTimeStartColumnId] = useState("");
  const [cycleTimeEndColumnId, setCycleTimeEndColumnId] = useState("");

  const { data: departments } = useQuery<DepartmentWithTeamCount[]>({
    queryKey: ["/api/departments"],
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: { department: string; plannedIr?: number | null; plannedVc?: number | null; kaitenSpaceId?: number | null; kaitenBoardId?: number | null; ttmStartColumnId?: number | null; ttmEndColumnId?: number | null; leadTimeStartColumnId?: number | null; leadTimeEndColumnId?: number | null; cycleTimeStartColumnId?: number | null; cycleTimeEndColumnId?: number | null }) => {
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
      setTtmSpaceId(departmentWithCount.kaitenSpaceId?.toString() || "");
      setTtmBoardId(departmentWithCount.kaitenBoardId?.toString() || "");
      setTtmStartColumnId(departmentWithCount.ttmStartColumnId?.toString() || "");
      setTtmEndColumnId(departmentWithCount.ttmEndColumnId?.toString() || "");
      setLeadTimeStartColumnId(departmentWithCount.leadTimeStartColumnId?.toString() || "");
      setLeadTimeEndColumnId(departmentWithCount.leadTimeEndColumnId?.toString() || "");
      setCycleTimeStartColumnId(departmentWithCount.cycleTimeStartColumnId?.toString() || "");
      setCycleTimeEndColumnId(departmentWithCount.cycleTimeEndColumnId?.toString() || "");
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: "Не удалось создать блок",
      });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async (data: { id: string; department?: string; plannedIr?: number | null; plannedVc?: number | null; kaitenSpaceId?: number | null; kaitenBoardId?: number | null; ttmStartColumnId?: number | null; ttmEndColumnId?: number | null; leadTimeStartColumnId?: number | null; leadTimeEndColumnId?: number | null; cycleTimeStartColumnId?: number | null; cycleTimeEndColumnId?: number | null }) => {
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
      setTtmSpaceId(departmentWithCount.kaitenSpaceId?.toString() || "");
      setTtmBoardId(departmentWithCount.kaitenBoardId?.toString() || "");
      setTtmStartColumnId(departmentWithCount.ttmStartColumnId?.toString() || "");
      setTtmEndColumnId(departmentWithCount.ttmEndColumnId?.toString() || "");
      setLeadTimeStartColumnId(departmentWithCount.leadTimeStartColumnId?.toString() || "");
      setLeadTimeEndColumnId(departmentWithCount.leadTimeEndColumnId?.toString() || "");
      setCycleTimeStartColumnId(departmentWithCount.cycleTimeStartColumnId?.toString() || "");
      setCycleTimeEndColumnId(departmentWithCount.cycleTimeEndColumnId?.toString() || "");
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
      extraBoards?: {spaceId: number; boardId: number}[];
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
      setDevColumnId("");
      setTestColumnId("");
      setVelocity("");
      setSprintDuration("");
      setSpPrice("");
      setHasSprints(true);
      setSprintIds("");
      setExtraBoards([]);
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
      extraBoards?: {spaceId: number; boardId: number}[] | null;
      vilocity?: number; 
      sprintDuration?: number; 
      spPrice?: number;
      departmentId?: string;
      hasSprints?: boolean;
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
      setExtraBoards((updatedTeam.extraBoards || []).map(b => ({ spaceId: b.spaceId.toString(), boardId: b.boardId.toString() })));
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

  const validSpaceId = spaceId && !isNaN(parseInt(spaceId)) && parseInt(spaceId) > 0;
  const validInitSpaceId = initSpaceId && !isNaN(parseInt(initSpaceId)) && parseInt(initSpaceId) > 0;

  const { data: spaceBoards, isFetching: spaceBoardsFetching } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["/api/kaiten/spaces", spaceId, "boards"],
    queryFn: async () => {
      const res = await fetch(`/api/kaiten/spaces/${spaceId}/boards`);
      if (!res.ok) throw new Error("Failed to fetch boards");
      return await res.json();
    },
    enabled: !!validSpaceId,
    staleTime: 60000,
  });

  const { data: initSpaceBoards, isFetching: initSpaceBoardsFetching } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["/api/kaiten/spaces", initSpaceId, "boards"],
    queryFn: async () => {
      const res = await fetch(`/api/kaiten/spaces/${initSpaceId}/boards`);
      if (!res.ok) throw new Error("Failed to fetch boards");
      return await res.json();
    },
    enabled: !!validInitSpaceId,
    staleTime: 60000,
  });

  const validSprintBoardId = sprintBoardId && !isNaN(parseInt(sprintBoardId)) && parseInt(sprintBoardId) > 0;

  const { data: sprintBoardColumns, isFetching: sprintBoardColumnsFetching } = useQuery<{ id: number; title: string; type: number; parentTitle?: string }[]>({
    queryKey: ["/api/kaiten/boards", sprintBoardId, "columns"],
    queryFn: async () => {
      const res = await fetch(`/api/kaiten/boards/${sprintBoardId}/columns`);
      if (!res.ok) throw new Error("Failed to fetch columns");
      return await res.json();
    },
    enabled: !!validSprintBoardId,
    staleTime: 60000,
  });

  const [debouncedUserSearch, setDebouncedUserSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserSearch(userSearchQuery), 350);
    return () => clearTimeout(t);
  }, [userSearchQuery]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedGitlabSearch(gitlabSearchQuery), 350);
    return () => clearTimeout(t);
  }, [gitlabSearchQuery]);

  const { data: gitlabSearchResults, isFetching: gitlabSearchLoading } = useQuery<{ username: string; full_name: string; avatar_url: string | null }[]>({
    queryKey: ["/api/gitlab/users/search", debouncedGitlabSearch],
    queryFn: async () => {
      if (!debouncedGitlabSearch.trim()) return [];
      const res = await fetch(`/api/gitlab/users/search?q=${encodeURIComponent(debouncedGitlabSearch)}`);
      if (!res.ok) throw new Error("Failed to search GitLab users");
      return await res.json();
    },
    enabled: debouncedGitlabSearch.trim().length >= 2,
    staleTime: 30000,
  });

  const { data: userSearchResults, isFetching: userSearchLoading } = useQuery<{ username: string; full_name: string }[]>({
    queryKey: ["/api/kaiten/users/search", debouncedUserSearch],
    queryFn: async () => {
      if (!debouncedUserSearch.trim()) return [];
      const res = await fetch(`/api/kaiten/users/search?q=${encodeURIComponent(debouncedUserSearch)}`);
      if (!res.ok) throw new Error("Failed to search users");
      return await res.json();
    },
    enabled: debouncedUserSearch.trim().length >= 2,
    staleTime: 30000,
  });

  const { data: teamMembersList, isLoading: membersLoading } = useQuery<TeamMemberRow[]>({
    queryKey: ["/api/teams", editingTeam?.teamId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${editingTeam!.teamId}/members`);
      if (!res.ok) throw new Error("Failed to fetch members");
      return await res.json();
    },
    enabled: !!editingTeam && rightPanelMode === "editTeam",
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: { username: string; role: string; fullName: string; avatarUrl: string; gitlabUsername?: string }) => {
      const res = await apiRequest("POST", `/api/teams/${editingTeam!.teamId}/members`, {
        ...data,
        departmentId: editingTeam!.departmentId,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", editingTeam?.teamId, "members"] });
      setShowAddMemberModal(false);
      setNewMemberUsername("");
      setNewMemberFullName("");
      setNewMemberAvatarUrl("");
      setNewMemberRole("");
      setNewMemberGitlabUsername("");
      setUserSearchQuery("");
      setDebouncedUserSearch("");
      setUserSearchOpen(false);
      setGitlabSearchQuery("");
      setDebouncedGitlabSearch("");
      setGitlabSearchOpen(false);
      toast({ title: "Участник добавлен" });
    },
    onError: (err: Error) => {
      const match = err.message.match(/^\d+: (.+)$/s);
      let description = err.message;
      if (match) {
        try { description = JSON.parse(match[1]).error ?? match[1]; } catch { description = match[1]; }
      }
      toast({ title: "Ошибка", description, variant: "destructive" });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiRequest("DELETE", `/api/team-members/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", editingTeam?.teamId, "members"] });
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const { data: kaitenColumns, isLoading: columnsLoading } = useQuery<{ id: number; title: string; type: number; parentTitle?: string }[]>({
    queryKey: ["/api/kaiten/boards", ttmBoardId, "columns"],
    queryFn: async () => {
      const res = await fetch(`/api/kaiten/boards/${ttmBoardId}/columns`);
      if (!res.ok) throw new Error("Failed to fetch columns");
      return await res.json();
    },
    enabled: !!ttmBoardId && !isNaN(parseInt(ttmBoardId)) && parseInt(ttmBoardId) > 0,
    staleTime: 60000,
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
    mutationFn: async (data: { teamId: string; year: number; vilocity: number; sprintDuration: number; spPrice: number; hasSprints: boolean; plannedIr?: number | null }) => {
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
      setTtmSpaceId(editingDepartment.kaitenSpaceId?.toString() || "");
      setTtmBoardId(editingDepartment.kaitenBoardId?.toString() || "");
      setTtmStartColumnId(editingDepartment.ttmStartColumnId?.toString() || "");
      setTtmEndColumnId(editingDepartment.ttmEndColumnId?.toString() || "");
      setLeadTimeStartColumnId(editingDepartment.leadTimeStartColumnId?.toString() || "");
      setLeadTimeEndColumnId(editingDepartment.leadTimeEndColumnId?.toString() || "");
      setCycleTimeStartColumnId(editingDepartment.cycleTimeStartColumnId?.toString() || "");
      setCycleTimeEndColumnId(editingDepartment.cycleTimeEndColumnId?.toString() || "");
    } else if (rightPanelMode === "addBlock") {
      setBlockName("");
      setInnovationRate("");
      setValueCost("");
      setTtmSpaceId("");
      setTtmBoardId("");
      setTtmStartColumnId("");
      setTtmEndColumnId("");
      setLeadTimeStartColumnId("");
      setLeadTimeEndColumnId("");
      setCycleTimeStartColumnId("");
      setCycleTimeEndColumnId("");
    } else if (rightPanelMode === "addTeam") {
      setTeamName("");
      setSpaceId("");
      setSprintBoardId("");
      setInitBoardId("");
      setInitSpaceId("");
      setOmniBoardId("");
      setDevColumnId("");
      setTestColumnId("");
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
      setDevColumnId(editingTeam.devColumnId?.toString() || "");
      setTestColumnId(editingTeam.testColumnId?.toString() || "");
      setExtraBoards((editingTeam.extraBoards || []).map(b => ({ spaceId: b.spaceId.toString(), boardId: b.boardId.toString() })));
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
        setPlannedIr(yearlyData.plannedIr?.toString() || "");
      } else {
        setVelocity(editingTeam.vilocity.toString());
        setSprintDuration(editingTeam.sprintDuration.toString());
        setSpPrice(editingTeam.spPrice.toString());
        setHasSprints(editingTeam.hasSprints);
        setPlannedIr("");
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
    setExtraBoards((team.extraBoards || []).map(b => ({ spaceId: b.spaceId.toString(), boardId: b.boardId.toString() })));
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
      const ttmSpaceChanged = (ttmSpaceId ? parseInt(ttmSpaceId) : null) !== (editingDepartment.kaitenSpaceId ?? null);
      const ttmBoardChanged = (ttmBoardId ? parseInt(ttmBoardId) : null) !== (editingDepartment.kaitenBoardId ?? null);
      const ttmStartChanged = (ttmStartColumnId ? parseInt(ttmStartColumnId) : null) !== (editingDepartment.ttmStartColumnId ?? null);
      const ttmEndChanged = (ttmEndColumnId ? parseInt(ttmEndColumnId) : null) !== (editingDepartment.ttmEndColumnId ?? null);
      const ltStartChanged = (leadTimeStartColumnId ? parseInt(leadTimeStartColumnId) : null) !== (editingDepartment.leadTimeStartColumnId ?? null);
      const ltEndChanged = (leadTimeEndColumnId ? parseInt(leadTimeEndColumnId) : null) !== (editingDepartment.leadTimeEndColumnId ?? null);
      const ctStartChanged = (cycleTimeStartColumnId ? parseInt(cycleTimeStartColumnId) : null) !== (editingDepartment.cycleTimeStartColumnId ?? null);
      const ctEndChanged = (cycleTimeEndColumnId ? parseInt(cycleTimeEndColumnId) : null) !== (editingDepartment.cycleTimeEndColumnId ?? null);
      return nameChanged || irChanged || vcChanged || ttmSpaceChanged || ttmBoardChanged || ttmStartChanged || ttmEndChanged || ltStartChanged || ltEndChanged || ctStartChanged || ctEndChanged;
    }
    if (rightPanelMode === "editTeam" && editingTeam) {
      const nameChanged = teamName.trim() !== editingTeam.teamName;
      const spaceIdChanged = (spaceId ? parseInt(spaceId) : editingTeam.spaceId) !== editingTeam.spaceId;
      const sprintBoardIdChanged = (sprintBoardId ? parseInt(sprintBoardId) : editingTeam.sprintBoardId) !== editingTeam.sprintBoardId;
      const initBoardIdChanged = (initBoardId ? parseInt(initBoardId) : editingTeam.initBoardId) !== editingTeam.initBoardId;
      const initSpaceIdChanged = (initSpaceId ? parseInt(initSpaceId) : (editingTeam.initSpaceId ?? 0)) !== (editingTeam.initSpaceId ?? 0);
      const omniBoardIdChanged = (omniBoardId ? parseInt(omniBoardId) : (editingTeam.omniBoardId ?? 0)) !== (editingTeam.omniBoardId ?? 0);
      const devColumnIdChanged = (devColumnId ? parseInt(devColumnId) : (editingTeam.devColumnId ?? 0)) !== (editingTeam.devColumnId ?? 0);
      const testColumnIdChanged = (testColumnId ? parseInt(testColumnId) : (editingTeam.testColumnId ?? 0)) !== (editingTeam.testColumnId ?? 0);
      const origVelocity = yearlyData ? yearlyData.vilocity : editingTeam.vilocity;
      const origSprintDuration = yearlyData ? yearlyData.sprintDuration : editingTeam.sprintDuration;
      const origSpPrice = yearlyData ? yearlyData.spPrice : editingTeam.spPrice;
      const origHasSprints = yearlyData ? yearlyData.hasSprints : editingTeam.hasSprints;
      const origPlannedIr = yearlyData ? (yearlyData.plannedIr ?? null) : null;
      const velocityChanged = (velocity ? parseFloat(velocity) : origVelocity) !== origVelocity;
      const sprintDurationChanged = (sprintDuration ? parseInt(sprintDuration) : origSprintDuration) !== origSprintDuration;
      const spPriceChanged = (spPrice ? parseInt(spPrice) : origSpPrice) !== origSpPrice;
      const hasSprintsChanged = hasSprints !== origHasSprints;
      const plannedIrChanged = (plannedIr ? parseInt(plannedIr) : null) !== origPlannedIr;
      const sprintIdsChanged = sprintIds.trim() !== "";
      return nameChanged || spaceIdChanged || sprintBoardIdChanged || initBoardIdChanged || initSpaceIdChanged || omniBoardIdChanged || devColumnIdChanged || testColumnIdChanged || velocityChanged || sprintDurationChanged || spPriceChanged || hasSprintsChanged || plannedIrChanged || sprintIdsChanged;
    }
    return false;
  };

  const handleSave = () => {
    if (rightPanelMode === "addBlock") {
      createDepartmentMutation.mutate({
        department: blockName.trim(),
        plannedIr: innovationRate ? parseInt(innovationRate) : null,
        plannedVc: valueCost ? parseInt(valueCost) : null,
        kaitenSpaceId: ttmSpaceId ? parseInt(ttmSpaceId) : null,
        kaitenBoardId: ttmBoardId ? parseInt(ttmBoardId) : null,
        ttmStartColumnId: ttmStartColumnId ? parseInt(ttmStartColumnId) : null,
        ttmEndColumnId: ttmEndColumnId ? parseInt(ttmEndColumnId) : null,
        leadTimeStartColumnId: leadTimeStartColumnId ? parseInt(leadTimeStartColumnId) : null,
        leadTimeEndColumnId: leadTimeEndColumnId ? parseInt(leadTimeEndColumnId) : null,
        cycleTimeStartColumnId: cycleTimeStartColumnId ? parseInt(cycleTimeStartColumnId) : null,
        cycleTimeEndColumnId: cycleTimeEndColumnId ? parseInt(cycleTimeEndColumnId) : null,
      });
    } else if (rightPanelMode === "editBlock" && editingDepartment) {
      updateDepartmentMutation.mutate({
        id: editingDepartment.id,
        department: blockName.trim(),
        plannedIr: innovationRate ? parseInt(innovationRate) : null,
        plannedVc: valueCost ? parseInt(valueCost) : null,
        kaitenSpaceId: ttmSpaceId ? parseInt(ttmSpaceId) : null,
        kaitenBoardId: ttmBoardId ? parseInt(ttmBoardId) : null,
        ttmStartColumnId: ttmStartColumnId ? parseInt(ttmStartColumnId) : null,
        ttmEndColumnId: ttmEndColumnId ? parseInt(ttmEndColumnId) : null,
        leadTimeStartColumnId: leadTimeStartColumnId ? parseInt(leadTimeStartColumnId) : null,
        leadTimeEndColumnId: leadTimeEndColumnId ? parseInt(leadTimeEndColumnId) : null,
        cycleTimeStartColumnId: cycleTimeStartColumnId ? parseInt(cycleTimeStartColumnId) : null,
        cycleTimeEndColumnId: cycleTimeEndColumnId ? parseInt(cycleTimeEndColumnId) : null,
      });
    }
  };


  return (
    <>
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
                      <div className="flex gap-3">
                        <div className="flex-1 space-y-2">
                          <Label htmlFor="block-name">Название блока <span className="text-destructive">*</span></Label>
                          <Input
                            id="block-name"
                            placeholder="Введите название"
                            value={blockName}
                            onChange={(e) => setBlockName(e.target.value)}
                            data-testid="input-block-name"
                          />
                        </div>
                        <div className="w-28 space-y-2">
                          <Label htmlFor="innovation-rate">Плановый ИР, %</Label>
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
                        <div className="w-28 space-y-2">
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

                      <div className="pt-2">
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Данные Kaiten для расчёта Time To Market, Lead Time, Cycle Time</h3>
                        <div className="space-y-3">
                          <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="ttm-space-id">ID пространства</Label>
                              <Input
                                id="ttm-space-id"
                                type="number"
                                placeholder="0"
                                value={ttmSpaceId}
                                onChange={(e) => setTtmSpaceId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-ttm-space-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="ttm-board-id">ID доски</Label>
                              <Input
                                id="ttm-board-id"
                                type="number"
                                placeholder="0"
                                value={ttmBoardId}
                                onChange={(e) => setTtmBoardId(e.target.value)}
                                className="no-arrows"
                                data-testid="input-ttm-board-id"
                              />
                            </div>
                          </div>

                          {columnsLoading && ttmBoardId && (
                            <p className="text-xs text-muted-foreground">Загрузка колонок...</p>
                          )}

                          <div className="space-y-3">
                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2">Time To Market</h4>
                              <div className="flex gap-4">
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs text-muted-foreground">Начальная колонка</Label>
                                  <Select
                                    value={ttmStartColumnId}
                                    onValueChange={setTtmStartColumnId}
                                    disabled={!kaitenColumns || kaitenColumns.length === 0}
                                  >
                                    <SelectTrigger data-testid="select-ttm-start-column">
                                      <SelectValue placeholder={kaitenColumns ? "Выберите колонку" : "Введите ID доски"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[300]">
                                      {kaitenColumns?.map((col) => (
                                        <SelectItem key={col.id} value={col.id.toString()}>
                                          {col.parentTitle ? `${col.parentTitle} / ${col.title}` : col.title}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs text-muted-foreground">Конечная колонка</Label>
                                  <Select
                                    value={ttmEndColumnId}
                                    onValueChange={setTtmEndColumnId}
                                    disabled={!kaitenColumns || kaitenColumns.length === 0}
                                  >
                                    <SelectTrigger data-testid="select-ttm-end-column">
                                      <SelectValue placeholder={kaitenColumns ? "Выберите колонку" : "Введите ID доски"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[300]">
                                      {kaitenColumns?.map((col) => (
                                        <SelectItem key={col.id} value={col.id.toString()}>
                                          {col.parentTitle ? `${col.parentTitle} / ${col.title}` : col.title}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2">Lead Time</h4>
                              <div className="flex gap-4">
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs text-muted-foreground">Начальная колонка</Label>
                                  <Select
                                    value={leadTimeStartColumnId}
                                    onValueChange={setLeadTimeStartColumnId}
                                    disabled={!kaitenColumns || kaitenColumns.length === 0}
                                  >
                                    <SelectTrigger data-testid="select-lead-time-start-column">
                                      <SelectValue placeholder={kaitenColumns ? "Выберите колонку" : "Введите ID доски"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[300]">
                                      {kaitenColumns?.map((col) => (
                                        <SelectItem key={col.id} value={col.id.toString()}>
                                          {col.parentTitle ? `${col.parentTitle} / ${col.title}` : col.title}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs text-muted-foreground">Конечная колонка</Label>
                                  <Select
                                    value={leadTimeEndColumnId}
                                    onValueChange={setLeadTimeEndColumnId}
                                    disabled={!kaitenColumns || kaitenColumns.length === 0}
                                  >
                                    <SelectTrigger data-testid="select-lead-time-end-column">
                                      <SelectValue placeholder={kaitenColumns ? "Выберите колонку" : "Введите ID доски"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[300]">
                                      {kaitenColumns?.map((col) => (
                                        <SelectItem key={col.id} value={col.id.toString()}>
                                          {col.parentTitle ? `${col.parentTitle} / ${col.title}` : col.title}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-semibold text-foreground mb-2">Cycle Time</h4>
                              <div className="flex gap-4">
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs text-muted-foreground">Начальная колонка</Label>
                                  <Select
                                    value={cycleTimeStartColumnId}
                                    onValueChange={setCycleTimeStartColumnId}
                                    disabled={!kaitenColumns || kaitenColumns.length === 0}
                                  >
                                    <SelectTrigger data-testid="select-cycle-time-start-column">
                                      <SelectValue placeholder={kaitenColumns ? "Выберите колонку" : "Введите ID доски"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[300]">
                                      {kaitenColumns?.map((col) => (
                                        <SelectItem key={col.id} value={col.id.toString()}>
                                          {col.parentTitle ? `${col.parentTitle} / ${col.title}` : col.title}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex-1 space-y-1">
                                  <Label className="text-xs text-muted-foreground">Конечная колонка</Label>
                                  <Select
                                    value={cycleTimeEndColumnId}
                                    onValueChange={setCycleTimeEndColumnId}
                                    disabled={!kaitenColumns || kaitenColumns.length === 0}
                                  >
                                    <SelectTrigger data-testid="select-cycle-time-end-column">
                                      <SelectValue placeholder={kaitenColumns ? "Выберите колонку" : "Введите ID доски"} />
                                    </SelectTrigger>
                                    <SelectContent className="z-[300]">
                                      {kaitenColumns?.map((col) => (
                                        <SelectItem key={col.id} value={col.id.toString()}>
                                          {col.parentTitle ? `${col.parentTitle} / ${col.title}` : col.title}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between gap-2 border-t border-border">
                      {rightPanelMode === "editBlock" && editingDepartment && (
                        <Button
                          variant="outline"
                          type="button"
                          data-testid="button-department-developers"
                          onClick={() => setLocation(`/personal-metrics/${editingDepartment.id}`)}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Разработчики
                        </Button>
                      )}
                      <div className="flex-1" />
                      {(rightPanelMode === "addBlock" || hasFormChanged()) && (
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
                      )}
                    </div>
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
                          <div className="flex gap-2 items-end">
                            <div className="space-y-2 w-32 shrink-0">
                              <Label htmlFor="space-id">ID пространства <span className="text-destructive">*</span></Label>
                              <Input
                                id="space-id"
                                type="number"
                                placeholder="0"
                                value={spaceId}
                                onChange={(e) => { setSpaceId(e.target.value); setSprintBoardId(""); }}
                                className="no-arrows"
                                data-testid="input-space-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="sprint-board-id">Доска {spaceBoardsFetching && <span className="text-muted-foreground text-xs">загрузка...</span>}</Label>
                              <Select
                                value={sprintBoardId}
                                onValueChange={setSprintBoardId}
                                disabled={!spaceBoards || spaceBoards.length === 0}
                              >
                                <SelectTrigger id="sprint-board-id" data-testid="select-sprint-board-id">
                                  <SelectValue placeholder={validSpaceId ? (spaceBoardsFetching ? "Загрузка..." : "Выберите доску") : "Введите ID пространства"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {spaceBoards?.map((b) => (
                                    <SelectItem key={b.id} value={b.id.toString()}>{b.title}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 w-32 shrink-0">
                              <Label htmlFor="init-space-id">ID пр. инициатив <span className="text-destructive">*</span></Label>
                              <Input
                                id="init-space-id"
                                type="number"
                                placeholder="0"
                                value={initSpaceId}
                                onChange={(e) => { setInitSpaceId(e.target.value); setInitBoardId(""); }}
                                className="no-arrows"
                                data-testid="input-init-space-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="init-board-id">Доска инициатив <span className="text-destructive">*</span> {initSpaceBoardsFetching && <span className="text-muted-foreground text-xs">загрузка...</span>}</Label>
                              <Select
                                value={initBoardId}
                                onValueChange={setInitBoardId}
                                disabled={!initSpaceBoards || initSpaceBoards.length === 0}
                              >
                                <SelectTrigger id="init-board-id" data-testid="select-init-board-id">
                                  <SelectValue placeholder={validInitSpaceId ? (initSpaceBoardsFetching ? "Загрузка..." : "Выберите доску") : "Введите ID пространства"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {initSpaceBoards?.map((b) => (
                                    <SelectItem key={b.id} value={b.id.toString()}>{b.title}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex gap-2 items-end">
                            <div className="space-y-2 w-32 shrink-0">
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
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="dev-column-id">Разработка {sprintBoardColumnsFetching && <span className="text-muted-foreground text-xs">загрузка...</span>}</Label>
                              <Select
                                value={devColumnId}
                                onValueChange={setDevColumnId}
                                disabled={!sprintBoardColumns || sprintBoardColumns.length === 0}
                              >
                                <SelectTrigger id="dev-column-id" data-testid="select-dev-column-id">
                                  <SelectValue placeholder={validSprintBoardId ? (sprintBoardColumnsFetching ? "Загрузка..." : "Выберите колонку") : "Выберите доску"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {sprintBoardColumns?.map((c) => (
                                    <SelectItem key={c.id} value={c.id.toString()}>
                                      {c.parentTitle ? `${c.parentTitle} / ${c.title}` : c.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="test-column-id">Тестирование</Label>
                              <Select
                                value={testColumnId}
                                onValueChange={setTestColumnId}
                                disabled={!sprintBoardColumns || sprintBoardColumns.length === 0}
                              >
                                <SelectTrigger id="test-column-id" data-testid="select-test-column-id">
                                  <SelectValue placeholder={validSprintBoardId ? (sprintBoardColumnsFetching ? "Загрузка..." : "Выберите колонку") : "Выберите доску"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {sprintBoardColumns?.map((c) => (
                                    <SelectItem key={c.id} value={c.id.toString()}>
                                      {c.parentTitle ? `${c.parentTitle} / ${c.title}` : c.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
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
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="planned-ir">Плановый IR, %</Label>
                              <Input
                                id="planned-ir"
                                type="number"
                                placeholder="0"
                                value={plannedIr}
                                onChange={(e) => setPlannedIr(e.target.value)}
                                className="no-arrows"
                                data-testid="input-planned-ir"
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
                            <div className="flex-1 space-y-1">
                              <Label htmlFor="edit-sprint-ids">Sprint IDs {hasSprints && <span className="text-destructive">*</span>}</Label>
                              <Input
                                id="edit-sprint-ids"
                                placeholder="ID через запятую (123, 456, 789)"
                                value={sprintIds}
                                onChange={(e) => setSprintIds(e.target.value)}
                                disabled={!hasSprints}
                                data-testid="input-sprint-ids"
                              />
                            </div>
                          </div>
                          {!hasSprints && (
                            <div className="space-y-2 pt-1">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Дополнительные доски</Label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  data-testid="button-add-extra-board"
                                  onClick={() => setExtraBoards([...extraBoards, { spaceId: "", boardId: "" }])}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Добавить
                                </Button>
                              </div>
                              {extraBoards.map((board, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                  <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">ID пространства</Label>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      value={board.spaceId}
                                      onChange={e => {
                                        const nb = [...extraBoards];
                                        nb[idx] = { ...nb[idx], spaceId: e.target.value };
                                        setExtraBoards(nb);
                                      }}
                                      className="no-arrows"
                                      data-testid={`input-extra-board-space-${idx}`}
                                    />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">ID доски</Label>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      value={board.boardId}
                                      onChange={e => {
                                        const nb = [...extraBoards];
                                        nb[idx] = { ...nb[idx], boardId: e.target.value };
                                        setExtraBoards(nb);
                                      }}
                                      className="no-arrows"
                                      data-testid={`input-extra-board-board-${idx}`}
                                    />
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    type="button"
                                    data-testid={`button-remove-extra-board-${idx}`}
                                    onClick={() => setExtraBoards(extraBoards.filter((_, i) => i !== idx))}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {editingTeam && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-muted-foreground">Участники</h3>
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              data-testid="button-add-member"
                              onClick={() => setShowAddMemberModal(true)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Добавить
                            </Button>
                          </div>
                          {membersLoading ? (
                            <p className="text-xs text-muted-foreground">Загрузка...</p>
                          ) : !teamMembersList || teamMembersList.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Участников нет</p>
                          ) : (
                            <div className="space-y-1">
                              {teamMembersList.map((member) => (
                                <div key={member.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 bg-muted/40">
                                  {member.avatarUrl ? (
                                    <img src={member.avatarUrl} alt={member.fullName || member.username} className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
                                  ) : (
                                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                                      {(member.fullName || member.username).charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium truncate block">{member.fullName || member.username}</span>
                                    <span className="text-xs text-muted-foreground">{member.username} · {member.role}</span>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    type="button"
                                    data-testid={`button-delete-member-${member.id}`}
                                    onClick={() => deleteMemberMutation.mutate(member.id)}
                                    disabled={deleteMemberMutation.isPending}
                                    className="invisible group-hover:visible"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
                                devColumnId: devColumnId ? parseInt(devColumnId) : null,
                                testColumnId: testColumnId ? parseInt(testColumnId) : null,
                                extraBoards: extraBoards.length > 0
                                  ? extraBoards.filter(b => b.spaceId && b.boardId).map(b => ({ spaceId: parseInt(b.spaceId), boardId: parseInt(b.boardId) }))
                                  : null,
                                vilocity: vel,
                                sprintDuration: sd,
                                spPrice: sp,
                                departmentId: editingTeam.departmentId,
                                hasSprints,
                              });
                              saveYearlyDataMutation.mutate({
                                teamId: editingTeam.teamId,
                                year: parseInt(metricsYear),
                                vilocity: vel,
                                sprintDuration: sd,
                                spPrice: sp,
                                hasSprints,
                                plannedIr: plannedIr ? parseInt(plannedIr) : null,
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
                          <div className="flex gap-2 items-end">
                            <div className="space-y-2 w-32 shrink-0">
                              <Label htmlFor="new-space-id">ID пространства <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-space-id"
                                type="number"
                                placeholder="0"
                                value={spaceId}
                                onChange={(e) => { setSpaceId(e.target.value); setSprintBoardId(""); }}
                                className="no-arrows"
                                data-testid="input-space-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-sprint-board-id">Доска <span className="text-destructive">*</span> {spaceBoardsFetching && <span className="text-muted-foreground text-xs">загрузка...</span>}</Label>
                              <Select
                                value={sprintBoardId}
                                onValueChange={setSprintBoardId}
                                disabled={!spaceBoards || spaceBoards.length === 0}
                              >
                                <SelectTrigger id="new-sprint-board-id" data-testid="select-sprint-board-id">
                                  <SelectValue placeholder={validSpaceId ? (spaceBoardsFetching ? "Загрузка..." : "Выберите доску") : "Введите ID пространства"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {spaceBoards?.map((b) => (
                                    <SelectItem key={b.id} value={b.id.toString()}>{b.title}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 w-32 shrink-0">
                              <Label htmlFor="new-init-space-id">ID пр. инициатив <span className="text-destructive">*</span></Label>
                              <Input
                                id="new-init-space-id"
                                type="number"
                                placeholder="0"
                                value={initSpaceId}
                                onChange={(e) => { setInitSpaceId(e.target.value); setInitBoardId(""); }}
                                className="no-arrows"
                                data-testid="input-init-space-id"
                              />
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-init-board-id">Доска инициатив <span className="text-destructive">*</span> {initSpaceBoardsFetching && <span className="text-muted-foreground text-xs">загрузка...</span>}</Label>
                              <Select
                                value={initBoardId}
                                onValueChange={setInitBoardId}
                                disabled={!initSpaceBoards || initSpaceBoards.length === 0}
                              >
                                <SelectTrigger id="new-init-board-id" data-testid="select-init-board-id">
                                  <SelectValue placeholder={validInitSpaceId ? (initSpaceBoardsFetching ? "Загрузка..." : "Выберите доску") : "Введите ID пространства"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {initSpaceBoards?.map((b) => (
                                    <SelectItem key={b.id} value={b.id.toString()}>{b.title}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex gap-2 items-end">
                            <div className="space-y-2 w-32 shrink-0">
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
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-dev-column-id">Разработка {sprintBoardColumnsFetching && <span className="text-muted-foreground text-xs">загрузка...</span>}</Label>
                              <Select
                                value={devColumnId}
                                onValueChange={setDevColumnId}
                                disabled={!sprintBoardColumns || sprintBoardColumns.length === 0}
                              >
                                <SelectTrigger id="new-dev-column-id" data-testid="select-dev-column-id">
                                  <SelectValue placeholder={validSprintBoardId ? (sprintBoardColumnsFetching ? "Загрузка..." : "Выберите колонку") : "Выберите доску"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {sprintBoardColumns?.map((c) => (
                                    <SelectItem key={c.id} value={c.id.toString()}>
                                      {c.parentTitle ? `${c.parentTitle} / ${c.title}` : c.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex-1 space-y-2">
                              <Label htmlFor="new-test-column-id">Тестирование</Label>
                              <Select
                                value={testColumnId}
                                onValueChange={setTestColumnId}
                                disabled={!sprintBoardColumns || sprintBoardColumns.length === 0}
                              >
                                <SelectTrigger id="new-test-column-id" data-testid="select-test-column-id">
                                  <SelectValue placeholder={validSprintBoardId ? (sprintBoardColumnsFetching ? "Загрузка..." : "Выберите колонку") : "Выберите доску"} />
                                </SelectTrigger>
                                <SelectContent className="z-[300]">
                                  {sprintBoardColumns?.map((c) => (
                                    <SelectItem key={c.id} value={c.id.toString()}>
                                      {c.parentTitle ? `${c.parentTitle} / ${c.title}` : c.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
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
                            <div className="flex-1 space-y-1">
                              <Label htmlFor="new-sprint-ids">Sprint IDs {hasSprints && <span className="text-destructive">*</span>}</Label>
                              <Input
                                id="new-sprint-ids"
                                placeholder="ID через запятую (123, 456, 789)"
                                value={sprintIds}
                                onChange={(e) => setSprintIds(e.target.value)}
                                disabled={!hasSprints}
                                data-testid="input-sprint-ids"
                              />
                            </div>
                          </div>
                          {!hasSprints && (
                            <div className="space-y-2 pt-1">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">Дополнительные доски</Label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  data-testid="button-add-extra-board-new"
                                  onClick={() => setExtraBoards([...extraBoards, { spaceId: "", boardId: "" }])}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Добавить
                                </Button>
                              </div>
                              {extraBoards.map((board, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                  <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">ID пространства</Label>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      value={board.spaceId}
                                      onChange={e => {
                                        const nb = [...extraBoards];
                                        nb[idx] = { ...nb[idx], spaceId: e.target.value };
                                        setExtraBoards(nb);
                                      }}
                                      className="no-arrows"
                                      data-testid={`input-new-extra-board-space-${idx}`}
                                    />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <Label className="text-xs text-muted-foreground">ID доски</Label>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      value={board.boardId}
                                      onChange={e => {
                                        const nb = [...extraBoards];
                                        nb[idx] = { ...nb[idx], boardId: e.target.value };
                                        setExtraBoards(nb);
                                      }}
                                      className="no-arrows"
                                      data-testid={`input-new-extra-board-board-${idx}`}
                                    />
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    type="button"
                                    data-testid={`button-remove-new-extra-board-${idx}`}
                                    onClick={() => setExtraBoards(extraBoards.filter((_, i) => i !== idx))}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
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
                            devColumnId: devColumnId ? parseInt(devColumnId) : undefined,
                            testColumnId: testColumnId ? parseInt(testColumnId) : undefined,
                            extraBoards: extraBoards.length > 0
                              ? extraBoards.filter(b => b.spaceId && b.boardId).map(b => ({ spaceId: parseInt(b.spaceId), boardId: parseInt(b.boardId) }))
                              : undefined,
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

    <Dialog open={showAddMemberModal} onOpenChange={(open) => {
      setShowAddMemberModal(open);
      if (!open) {
        setNewMemberUsername("");
        setNewMemberFullName("");
        setNewMemberAvatarUrl("");
        setNewMemberRole("");
        setNewMemberGitlabUsername("");
        setUserSearchQuery("");
        setDebouncedUserSearch("");
        setUserSearchOpen(false);
        setGitlabSearchQuery("");
        setDebouncedGitlabSearch("");
        setGitlabSearchOpen(false);
      }
    }}>
      <DialogContent data-testid="dialog-add-member">
        <DialogHeader>
          <DialogTitle>Добавить участника</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="member-username">Пользователь <span className="text-destructive">*</span></Label>
            <div className="relative">
              {newMemberUsername ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2">
                  <div>
                    <span className="text-sm font-medium">{newMemberFullName || newMemberUsername}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{newMemberUsername}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setNewMemberUsername(""); setNewMemberFullName(""); setUserSearchQuery(""); }}
                    className="ml-1 px-0.5 py-0 rounded opacity-50 hover:opacity-100 transition-opacity leading-none"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    id="member-username"
                    data-testid="input-member-username"
                    placeholder="Начните вводить имя или логин..."
                    value={userSearchQuery}
                    autoComplete="off"
                    onChange={(e) => { setUserSearchQuery(e.target.value); setUserSearchOpen(true); }}
                    onFocus={() => setUserSearchOpen(true)}
                    onBlur={() => setTimeout(() => setUserSearchOpen(false), 150)}
                  />
                  {userSearchOpen && userSearchQuery.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-[230] rounded-md border bg-popover shadow-md overflow-y-auto max-h-52">
                      {userSearchLoading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Поиск...</div>
                      ) : !userSearchResults || userSearchResults.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Пользователи не найдены</div>
                      ) : (
                        userSearchResults.map((u) => (
                          <button
                            key={u.username}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover-elevate flex flex-col"
                            onMouseDown={() => {
                              setNewMemberUsername(u.username);
                              setNewMemberFullName(u.full_name);
                              setNewMemberAvatarUrl(u.avatar_url || "");
                              setUserSearchQuery("");
                              setUserSearchOpen(false);
                            }}
                          >
                            <span className="font-medium">{u.full_name}</span>
                            <span className="text-xs text-muted-foreground">{u.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-gitlab-username">Юзернейм (GitLab)</Label>
            <div className="relative">
              {newMemberGitlabUsername ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-muted/40 px-3 py-2">
                  <span className="text-sm font-medium">{newMemberGitlabUsername}</span>
                  <button
                    type="button"
                    onClick={() => { setNewMemberGitlabUsername(""); setGitlabSearchQuery(""); }}
                    className="ml-1 px-0.5 py-0 rounded opacity-50 hover:opacity-100 transition-opacity leading-none"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    id="member-gitlab-username"
                    data-testid="input-member-gitlab-username"
                    placeholder="Начните вводить логин GitLab..."
                    value={gitlabSearchQuery}
                    autoComplete="off"
                    onChange={(e) => { setGitlabSearchQuery(e.target.value); setGitlabSearchOpen(true); }}
                    onFocus={() => setGitlabSearchOpen(true)}
                    onBlur={() => setTimeout(() => setGitlabSearchOpen(false), 150)}
                  />
                  {gitlabSearchOpen && gitlabSearchQuery.trim().length >= 2 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-[230] rounded-md border bg-popover shadow-md overflow-y-auto max-h-52">
                      {gitlabSearchLoading ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Поиск...</div>
                      ) : !gitlabSearchResults || gitlabSearchResults.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Пользователи не найдены</div>
                      ) : (
                        gitlabSearchResults.map((u) => (
                          <button
                            key={u.username}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover-elevate flex flex-col"
                            onMouseDown={() => {
                              setNewMemberGitlabUsername(u.username);
                              setGitlabSearchQuery("");
                              setGitlabSearchOpen(false);
                            }}
                          >
                            <span className="font-medium">{u.full_name}</span>
                            <span className="text-xs text-muted-foreground">{u.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-role">Роль <span className="text-destructive">*</span></Label>
            <Select value={newMemberRole} onValueChange={setNewMemberRole}>
              <SelectTrigger id="member-role" data-testid="select-member-role">
                <SelectValue placeholder="Выберите роль" />
              </SelectTrigger>
              <SelectContent>
                {MEMBER_ROLES.map((role) => (
                  <SelectItem key={role} value={role} data-testid={`option-role-${role}`}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            data-testid="button-cancel-member"
            onClick={() => setShowAddMemberModal(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            data-testid="button-confirm-add-member"
            disabled={!newMemberUsername.trim() || !newMemberRole || addMemberMutation.isPending}
            style={{ backgroundColor: '#cd253d' }}
            className="hover:opacity-90 border-0"
            onClick={() => addMemberMutation.mutate({ username: newMemberUsername.trim(), role: newMemberRole, fullName: newMemberFullName, avatarUrl: newMemberAvatarUrl, gitlabUsername: newMemberGitlabUsername.trim() || undefined })}
          >
            {addMemberMutation.isPending ? "Добавление..." : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
