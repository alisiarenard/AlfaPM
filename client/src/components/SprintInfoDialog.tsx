import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { roundSP } from "@shared/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface SprintInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
}

interface TaskItem {
  id: string;
  cardId: number;
  title: string;
  size: number;
  state: string | number;
  initiativeTitle: string | null;
  initiativeCardId: number | null;
  doneDate: string | null;
  condition: number;
}

interface SprintData {
  sprintId: number;
  boardId: number;
  title: string;
  velocity: number;
  startDate: string;
  finishDate: string;
  actualFinishDate: string | null;
  goal: string | null;
}

const BATCH_SIZE = 10;

export function SprintInfoDialog({ open, onOpenChange, teamId }: SprintInfoDialogProps) {
  const [sprintId, setSprintId] = useState("");
  const [sprint, setSprint] = useState<SprintData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksOutside, setTasksOutside] = useState<TaskItem[]>([]);
  const [totalCards, setTotalCards] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadBatch = useCallback(async (searchSprintId: number, offset: number) => {
    setIsLoadingBatch(true);
    setError(null);
    try {
      const response = await fetch(`/api/sprints/${searchSprintId}/preview?offset=${offset}&limit=${BATCH_SIZE}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const detail = errorData?.details || errorData?.error || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      const data = await response.json();

      if (offset === 0) {
        setSprint(data.sprint);
        setTasks(data.tasks);
        setTasksOutside(data.tasksOutside);
      } else {
        setTasks(prev => [...prev, ...data.tasks]);
        setTasksOutside(prev => [...prev, ...data.tasksOutside]);
      }
      setTotalCards(data.totalCards);
      setNextOffset(data.offset + data.limit);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingBatch(false);
    }
  }, []);

  const handleSearch = () => {
    const id = parseInt(sprintId, 10);
    if (!isNaN(id)) {
      setSprint(null);
      setTasks([]);
      setTasksOutside([]);
      setTotalCards(0);
      setNextOffset(0);
      setHasMore(false);
      setError(null);
      loadBatch(id, 0);
    }
  };

  const handleLoadMore = () => {
    const id = parseInt(sprintId, 10);
    if (!isNaN(id)) {
      loadBatch(id, nextOffset);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = parseInt(sprintId, 10);
      if (isNaN(id)) throw new Error('No sprint selected');
      return apiRequest('POST', `/api/sprints/${id}/save`);
    },
    onSuccess: () => {
      toast({
        title: "Успешно",
        description: "Спринт и задачи сохранены в базу данных",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/timeline", teamId] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/innovation-rate'] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/cost-structure'] });
      queryClient.invalidateQueries({ queryKey: ['/api/metrics/value-cost'] });
      resetAndClose();
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить спринт",
        variant: "destructive",
      });
    },
  });

  const resetAndClose = () => {
    setSprintId("");
    setSprint(null);
    setTasks([]);
    setTasksOutside([]);
    setTotalCards(0);
    setNextOffset(0);
    setHasMore(false);
    setError(null);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSprintId("");
      setSprint(null);
      setTasks([]);
      setTasksOutside([]);
      setTotalCards(0);
      setNextOffset(0);
      setHasMore(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const allTasks = [...tasks, ...tasksOutside];
  const totalSP = allTasks.reduce((sum, t) => sum + (t.size || 0), 0);
  const doneSP = tasks.filter(t => t.state === "3-done" || t.state === 3).reduce((sum, t) => sum + (t.size || 0), 0);
  const deliveryPlanCompliance = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
  const processedCards = tasks.length + tasksOutside.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0" data-testid="dialog-sprint-info">
        <div className="px-6 pt-[0.7rem] pb-4 border-b border-border">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-semibold">Добавить спринт</DialogTitle>
          </DialogHeader>
          
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="sprint-id">Sprint ID</Label>
              <Input
                id="sprint-id"
                type="number"
                placeholder="Введите ID спринта"
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className="no-arrows"
                data-testid="input-sprint-id"
              />
            </div>
            <Button 
              onClick={handleSearch} 
              className="self-end hover:opacity-90 border-0"
              style={{ backgroundColor: '#cd253d' }}
              disabled={!sprintId || isLoadingBatch}
              data-testid="button-search-sprint"
            >
              {isLoadingBatch && !sprint ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Загрузка...
                </>
              ) : (
                'Найти'
              )}
            </Button>
          </div>

          {error && (
            <div className="text-sm text-destructive mt-2" data-testid="text-sprint-error">
              Ошибка: {error}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          <div className="space-y-4">

            {sprint && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-2" data-testid="text-sprint-title">
                    {sprint.title}
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Дата начала:</span>{' '}
                      <span data-testid="text-sprint-start-date">{formatDate(sprint.startDate)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Дата окончания (план):</span>{' '}
                      <span data-testid="text-sprint-finish-date">{formatDate(sprint.finishDate)}</span>
                    </div>
                    {sprint.actualFinishDate && (
                      <div>
                        <span className="text-muted-foreground">Дата окончания (факт):</span>{' '}
                        <span data-testid="text-sprint-actual-finish-date">
                          {formatDate(sprint.actualFinishDate)}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Всего карточек:</span>{' '}
                      <span data-testid="text-sprint-total-cards">{totalCards}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Загружено:</span>{' '}
                      <span data-testid="text-sprint-loaded-cards">
                        {processedCards} из {totalCards}
                        {hasMore && <span className="text-muted-foreground ml-1">(ещё есть)</span>}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Всего SP:</span>{' '}
                      <span data-testid="text-sprint-total-sp">{roundSP(totalSP)}{hasMore ? '+' : ''}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Done SP:</span>{' '}
                      <span data-testid="text-sprint-done-sp">{roundSP(doneSP)}{hasMore ? '+' : ''}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">СПД{hasMore ? ' (промежуточный)' : ''}:</span>{' '}
                      <span 
                        className="font-semibold"
                        style={{ 
                          color: deliveryPlanCompliance >= 80 ? '#10b981' : 
                                 deliveryPlanCompliance >= 60 ? '#f59e0b' : '#ef4444'
                        }}
                        data-testid="text-sprint-delivery-plan-compliance"
                      >
                        {deliveryPlanCompliance}%
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({Math.round(doneSP)} / {Math.round(totalSP)} SP)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {tasks.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-green-600" data-testid="text-tasks-inside-header">
                        Внутри спринта ({tasks.length})
                      </h4>
                      <div className="border rounded-md">
                        <table className="w-full">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2 text-sm font-medium">Название задачи</th>
                              <th className="text-left p-2 text-sm font-medium">Инициатива</th>
                              <th className="text-right p-2 text-sm font-medium">SP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tasks.map((task) => (
                              <tr 
                                key={task.id} 
                                className="border-t hover-elevate"
                                data-testid={`row-task-inside-${task.cardId}`}
                              >
                                <td className="p-2 text-sm" data-testid={`text-task-title-inside-${task.cardId}`}>
                                  {task.title}
                                </td>
                                <td className="p-2 text-sm text-muted-foreground" data-testid={`text-task-initiative-inside-${task.cardId}`}>
                                  {task.initiativeTitle || '\u2014'}
                                </td>
                                <td className="p-2 text-sm text-right" data-testid={`text-task-sp-inside-${task.cardId}`}>
                                  {roundSP(task.size)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {tasksOutside.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-orange-600" data-testid="text-tasks-outside-header">
                        Вне спринта ({tasksOutside.length})
                      </h4>
                      <div className="border rounded-md">
                        <table className="w-full">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2 text-sm font-medium">Название задачи</th>
                              <th className="text-left p-2 text-sm font-medium">Инициатива</th>
                              <th className="text-right p-2 text-sm font-medium">SP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tasksOutside.map((task) => (
                              <tr 
                                key={task.id} 
                                className="border-t hover-elevate opacity-60"
                                data-testid={`row-task-outside-${task.cardId}`}
                              >
                                <td className="p-2 text-sm" data-testid={`text-task-title-outside-${task.cardId}`}>
                                  {task.title}
                                </td>
                                <td className="p-2 text-sm text-muted-foreground" data-testid={`text-task-initiative-outside-${task.cardId}`}>
                                  {task.initiativeTitle || '\u2014'}
                                </td>
                                <td className="p-2 text-sm text-right" data-testid={`text-task-sp-outside-${task.cardId}`}>
                                  {roundSP(task.size)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {tasks.length === 0 && tasksOutside.length === 0 && !isLoadingBatch && (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      Задачи не найдены
                    </div>
                  )}

                  {hasMore && (
                    <div className="flex justify-center pt-2">
                      <Button 
                        onClick={handleLoadMore} 
                        variant="outline"
                        disabled={isLoadingBatch}
                        data-testid="button-load-more-tasks"
                      >
                        {isLoadingBatch ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Загрузка...
                          </>
                        ) : (
                          `Загрузить ещё (${processedCards} из ${totalCards})`
                        )}
                      </Button>
                    </div>
                  )}

                  {isLoadingBatch && sprint && (
                    <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Загрузка карточек...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {sprint && (
          <DialogFooter className="px-6 py-4 border-t">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="hover:opacity-90 border-0"
              style={{ backgroundColor: '#cd253d' }}
              data-testid="button-save-sprint"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Сохранить'
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
