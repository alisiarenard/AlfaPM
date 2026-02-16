import { InitiativesTimeline } from "@/components/InitiativesTimeline";
import { TeamHeader } from "@/components/TeamHeader";
import { MetricsCharts } from "@/components/MetricsCharts";
import { TeamMetricsPanel } from "@/components/TeamMetricsPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AlertCircle, Plus, Folder, MoreVertical, Download, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { MdAccountTree } from "react-icons/md";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Department, DepartmentWithTeamCount, TeamRow, InitiativeRow, Initiative, Team, SprintRow } from "@shared/schema";

interface HomePageProps {
  selectedDepartment: string;
  setSelectedDepartment: (value: string) => void;
  selectedYear: string;
  setSelectedYear: (value: string) => void;
  departments?: DepartmentWithTeamCount[];
  setPageSubtitle: (subtitle: string) => void;
}

export default function HomePage({ selectedDepartment, setSelectedDepartment, selectedYear, setSelectedYear, departments, setPageSubtitle }: HomePageProps) {
  const currentYear = new Date().getFullYear();
  const [location, setLocation] = useLocation();
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    setPageSubtitle('');
    return () => setPageSubtitle('');
  }, [setPageSubtitle]);
  const [activeTabInitialized, setActiveTabInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [viewTab, setViewTab] = useState<"initiatives" | "metrics">("initiatives");
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
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

  const updateUrl = (dept: string, year: string, teams: Set<string>, active: boolean, tab?: string) => {
    const params = new URLSearchParams();
    if (dept) params.set('dept', dept);
    if (year) params.set('year', year);
    if (teams.size > 0) params.set('teams', Array.from(teams).join(','));
    if (active) params.set('active', '1');
    if (tab) params.set('tab', tab);
    
    const newSearch = params.toString() ? `?${params.toString()}` : '';
    const currentSearch = window.location.search;
    if (currentSearch !== newSearch) {
      setLocation(`/${newSearch}`);
    }
  };

  const { data: departmentTeams } = useQuery<TeamRow[]>({
    queryKey: ["/api/teams", selectedDepartment],
    enabled: !!selectedDepartment,
  });



  useEffect(() => {
    if (isInitialLoad && departments && departments.length > 0) {
      const searchParams = new URLSearchParams(window.location.search);
      const urlDept = searchParams.get('dept');
      const urlYear = searchParams.get('year');
      const urlActive = searchParams.get('active');

      const hasUrlParams = urlDept || urlYear || urlActive;

      if (hasUrlParams) {
        if (urlDept && departments.some(d => d.id === urlDept)) {
          setSelectedDepartment(urlDept);
        }
        if (urlYear) {
          setSelectedYear(urlYear);
        }
        if (urlActive) {
          setShowActiveOnly(urlActive === '1');
        }
      } else if (!selectedDepartment) {
        const firstAvailableDepartment = departments.find(dept => dept.teamCount > 0);
        if (firstAvailableDepartment) {
          setSelectedDepartment(firstAvailableDepartment.id);
        }
      }
      
      setIsInitialLoad(false);
    }
  }, [departments, isInitialLoad]);

  useEffect(() => {
    if (departmentTeams && departmentTeams.length > 0) {
      const needsTabUpdate = !activeTab || !departmentTeams.some(t => t.teamId === activeTab);
      
      if (needsTabUpdate) {
        const urlParams = parseUrlParams();
        if (urlParams.tab && departmentTeams.some(t => t.teamId === urlParams.tab)) {
          setActiveTab(urlParams.tab);
          setActiveTabInitialized(true);
        } else {
          setActiveTab(departmentTeams[0].teamId);
          setActiveTabInitialized(true);
        }
      } else {
        if (!activeTabInitialized) {
          setActiveTabInitialized(true);
        }
      }
    } else if (departmentTeams && departmentTeams.length === 0) {
      setActiveTab("");
      setActiveTabInitialized(false);
      setSelectedTeams(new Set());
    }
  }, [departmentTeams]);

  const prevDepartmentRef = useRef(selectedDepartment);
  useEffect(() => {
    if (prevDepartmentRef.current !== selectedDepartment) {
      prevDepartmentRef.current = selectedDepartment;
      setActiveTabInitialized(false);
    }
  }, [selectedDepartment]);

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

  useEffect(() => {
    if (!isInitialLoad && activeTabInitialized && activeTab) {
      updateUrl(selectedDepartment, selectedYear, selectedTeams, showActiveOnly, activeTab);
    }
  }, [selectedDepartment, selectedYear, selectedTeams, showActiveOnly, activeTab, isInitialLoad, activeTabInitialized]);

  // Синхронизация состояния при изменении URL через popstate (назад/вперед браузера)
  useEffect(() => {
    const handlePopState = () => {
      if (!isInitialLoad && departments && departments.length > 0) {
        const urlParams = parseUrlParams();
        
        if (urlParams.dept !== selectedDepartment) {
          if (urlParams.dept && departments.some(d => d.id === urlParams.dept)) {
            setSelectedDepartment(urlParams.dept);
          } else if (!urlParams.dept && selectedDepartment) {
            const firstAvailableDepartment = departments.find(dept => dept.teamCount > 0);
            if (firstAvailableDepartment) {
              setSelectedDepartment(firstAvailableDepartment.id);
            }
          }
        }
        
        if (urlParams.year !== selectedYear) {
          setSelectedYear(urlParams.year);
        }
        
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
    if (departmentTeams) {
      setSelectedTeams(new Set(departmentTeams.map(team => team.teamId)));
    }
  }, [selectedDepartment, departmentTeams]);

  return (
    <div className="bg-background flex-1">
    <div className="max-w-[1200px] xl:max-w-none xl:w-[95%] mx-auto" data-testid="main-container">
        <div className="p-6">
          {departmentTeams && departmentTeams.length > 0 && activeTab ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                    className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
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
                    className={`px-4 py-1 text-xs font-medium rounded transition-colors ${
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

              {activeTab && (
                <TeamMetricsPanel teamId={activeTab} selectedYear={selectedYear} />
              )}
              
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
                onClick={() => setLocation("/settings")}
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
                onClick={() => setLocation("/settings")}
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
    </div>
  );
}

function TeamInitiativesTab({ team, showActiveOnly, setShowActiveOnly, selectedYear, viewTab }: { team: TeamRow; showActiveOnly: boolean; setShowActiveOnly: (value: boolean) => void; selectedYear: string; viewTab: "initiatives" | "metrics" }) {
  const { toast } = useToast();
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const hasSyncedRef = useRef(false);
  
  // Загружаем данные из БД сразу, без ожидания проверки синхронизации
  const { data: timelineData, isLoading: timelineLoading, error: initiativesError } = useQuery<{initiatives: Initiative[], sprints: SprintRow[]}>({
    queryKey: ["/api/timeline", team.teamId, selectedYear, showActiveOnly],
    queryFn: async () => {
      const response = await fetch(`/api/timeline/${team.teamId}?year=${selectedYear}&showActiveOnly=${showActiveOnly}`);
      if (!response.ok) throw new Error('Failed to fetch timeline');
      return response.json();
    },
    enabled: !!team.teamId && !!team.initBoardId,
  });
  
  // Отдельный запрос для всех инициатив (без фильтра) для расчёта ИР
  const { data: allTimelineData } = useQuery<{initiatives: Initiative[], sprints: SprintRow[]}>({
    queryKey: ["/api/timeline", team.teamId, selectedYear, false],
    queryFn: async () => {
      const response = await fetch(`/api/timeline/${team.teamId}?year=${selectedYear}&showActiveOnly=false`);
      if (!response.ok) throw new Error('Failed to fetch all timeline');
      return response.json();
    },
    enabled: !!team.teamId && !!team.initBoardId && showActiveOnly,
  });
  
  // Сбрасываем флаг синхронизации при смене команды
  useEffect(() => {
    hasSyncedRef.current = false;
  }, [team.teamId]);
  
  // Фоновая синхронизация спринта - запускается после загрузки данных (только один раз)
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    
    const runBackgroundSync = async () => {
      // Только для команд со спринтами
      if (!team.teamId || !team.sprintBoardId || !team.spaceId) return;
      // Не запускать повторно (ни во время синхронизации, ни если уже синхронизировали)
      if (isBackgroundSyncing || hasSyncedRef.current) {
        console.log(`[Background Sync] SKIPPED for team ${team.teamId} - hasSyncedRef=${hasSyncedRef.current}, isBackgroundSyncing=${isBackgroundSyncing}`);
        return;
      }
      
      console.log(`[Background Sync] STARTING for team ${team.teamId}`);
      // Помечаем что синхронизация началась
      hasSyncedRef.current = true;
      
      try {
        if (!isMounted) return;
        setIsBackgroundSyncing(true);
        
        // Проверяем нужна ли синхронизация
        const checkResponse = await fetch(`/api/sprints/check-sync/${team.teamId}`, {
          signal: abortController.signal
        });
        if (!checkResponse.ok || !isMounted) return;
        
        const checkData = await checkResponse.json();
        
        // check-sync endpoint уже синхронизирует данные и возвращает tasksSynced
        // Если данные были синхронизированы - обновляем UI
        if (checkData.synced && checkData.tasksSynced > 0) {
          console.log(`[Background Sync] check-sync completed for team ${team.teamId}:`, checkData);
          
          // Обновляем данные на фронте
          queryClient.invalidateQueries({ queryKey: ["/api/timeline", team.teamId] });
          queryClient.invalidateQueries({ queryKey: ['/api/metrics/innovation-rate'] });
          queryClient.invalidateQueries({ queryKey: ['/api/metrics/cost-structure'] });
          queryClient.invalidateQueries({ queryKey: ['/api/metrics/value-cost'] });
          
          // Показываем уведомление об обновлении данных
          if (isMounted) {
            toast({
              title: "Данные обновлены",
              description: `Синхронизировано ${checkData.tasksSynced} задач`,
            });
          }
        } else if (!checkData.synced && checkData.sprintId) {
          // Если нужна полная синхронизация нового спринта
          console.log(`[Background Sync] Starting smart-sync for team ${team.teamId}, sprint ${checkData.sprintId}`);
          
          const syncResponse = await apiRequest("POST", `/api/kaiten/smart-sync/${team.teamId}`, {});
          if (!isMounted) return;
          
          const syncData = await syncResponse.json();
          
          console.log(`[Background Sync] smart-sync completed for team ${team.teamId}:`, syncData);
          
          // Обновляем данные на фронте
          queryClient.invalidateQueries({ queryKey: ["/api/timeline", team.teamId] });
          queryClient.invalidateQueries({ queryKey: ['/api/metrics/innovation-rate'] });
          queryClient.invalidateQueries({ queryKey: ['/api/metrics/cost-structure'] });
          queryClient.invalidateQueries({ queryKey: ['/api/metrics/value-cost'] });
          
          // Показываем уведомление об обновлении данных
          if (isMounted) {
            const taskCount = syncData.sprint?.tasksSynced || 0;
            toast({
              title: "Данные обновлены",
              description: `Спринт "${checkData.sprintTitle || 'текущий'}" синхронизирован: ${taskCount} задач`,
            });
          }
        }
      } catch (error) {
        // Игнорируем ошибки отмены запроса
        if (error instanceof Error && error.name === 'AbortError') {
          console.log(`[Background Sync] Cancelled for team ${team.teamId}`);
          return;
        }
        console.error('[Background Sync] Error:', error);
      } finally {
        if (isMounted) {
          setIsBackgroundSyncing(false);
        }
      }
    };
    
    // Запускаем фоновую синхронизацию когда данные уже загружены
    if (timelineData && !timelineLoading) {
      runBackgroundSync();
    }
    
    // Очистка при размонтировании компонента
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [team.teamId, team.sprintBoardId, team.spaceId, timelineData, timelineLoading]);

  const initiativeRows = timelineData?.initiatives;
  const allInitiativeRows = showActiveOnly ? (allTimelineData?.initiatives || initiativeRows) : initiativeRows;
  const sprints = timelineData?.sprints;
  const initiativesLoading = timelineLoading;
  const sprintsLoading = timelineLoading;

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      // Умная синхронизация: синхронизирует инициативы + спринты выбранного года + задачи
      const smartSyncRes = await apiRequest("POST", `/api/kaiten/smart-sync/${team.teamId}`, { year: parseInt(selectedYear) });
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
        <span className="loader mb-4"></span>
        <p className="text-muted-foreground mt-4">Загрузка данных...</p>
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

  // Данные уже приходят отфильтрованными с сервера (фильтрация по году, активности, типу и SP)
  const initiatives: Initiative[] = initiativeRows || [];
  // Все инициативы без фильтра "Активные" для расчёта ИР
  const allInitiatives: Initiative[] = allInitiativeRows || [];
  
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
  
  console.log(`[Initiatives Filter] Final count: ${sortedInitiatives.length} initiatives shown (from ${initiatives.length} total)`);

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
        initiatives={initiatives}
        allInitiatives={allInitiatives}
        dbTeam={team} 
        showActiveOnly={showActiveOnly}
        onFilterChange={setShowActiveOnly}
        onSync={handleSync}
        isSyncing={syncAllMutation.isPending}
      />
      <div className="overflow-auto custom-scrollbar pr-6" style={{ height: '60vh' }}>
        {viewTab === "initiatives" ? (
          <InitiativesTimeline initiatives={sortedInitiatives} allInitiatives={allInitiatives} team={teamData} sprints={sprints || []} />
        ) : (
          <MetricsCharts team={team} selectedYear={selectedYear} />
        )}
      </div>
    </div>
  );
}
