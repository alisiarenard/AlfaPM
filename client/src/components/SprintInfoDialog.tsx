import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { roundSP } from "@shared/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SprintInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SprintInfo {
  sprint: {
    sprintId: number;
    boardId: number;
    title: string;
    velocity: number;
    startDate: string;
    finishDate: string;
    actualFinishDate: string | null;
    goal: string | null;
  };
  tasks: Array<{
    id: string;
    cardId: number;
    title: string;
    size: number;
    initiativeTitle: string | null;
    initiativeCardId: number | null;
  }>;
}

export function SprintInfoDialog({ open, onOpenChange }: SprintInfoDialogProps) {
  const [sprintId, setSprintId] = useState("");
  const [searchedSprintId, setSearchedSprintId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: sprintInfo, isLoading, error } = useQuery<SprintInfo>({
    queryKey: ["/api/sprints", searchedSprintId, "info"],
    queryFn: async () => {
      const response = await fetch(`/api/sprints/${searchedSprintId}/info`);
      if (!response.ok) {
        throw new Error('Sprint not found');
      }
      return response.json();
    },
    enabled: searchedSprintId !== null,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!searchedSprintId) {
        throw new Error('No sprint selected');
      }
      return apiRequest('POST', `/api/sprints/${searchedSprintId}/save`);
    },
    onSuccess: () => {
      toast({
        title: "Успешно",
        description: "Спринт и задачи сохранены в базу данных",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sprints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось сохранить спринт",
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    const id = parseInt(sprintId, 10);
    if (!isNaN(id)) {
      setSearchedSprintId(id);
    }
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSprintId("");
      setSearchedSprintId(null);
    }
    onOpenChange(nextOpen);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0" data-testid="dialog-sprint-info">
        {/* Фиксированный хедер с поиском */}
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
              disabled={!sprintId || isLoading}
              data-testid="button-search-sprint"
            >
              {isLoading ? (
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
              Спринт не найден
            </div>
          )}
        </div>

        {/* Прокручиваемый контент */}
        <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
          <div className="space-y-4">

            {sprintInfo && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-2" data-testid="text-sprint-title">
                    {sprintInfo.sprint.title}
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Дата начала:</span>{' '}
                      <span data-testid="text-sprint-start-date">{formatDate(sprintInfo.sprint.startDate)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Дата окончания (план):</span>{' '}
                      <span data-testid="text-sprint-finish-date">{formatDate(sprintInfo.sprint.finishDate)}</span>
                    </div>
                    {sprintInfo.sprint.actualFinishDate && (
                      <div>
                        <span className="text-muted-foreground">Дата окончания (факт):</span>{' '}
                        <span data-testid="text-sprint-actual-finish-date">
                          {formatDate(sprintInfo.sprint.actualFinishDate)}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Velocity:</span>{' '}
                      <span data-testid="text-sprint-velocity">{Math.round(sprintInfo.sprint.velocity)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Задачи ({sprintInfo.tasks.length})</h4>
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
                        {sprintInfo.tasks.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-muted-foreground text-sm">
                              Задачи не найдены
                            </td>
                          </tr>
                        ) : (
                          sprintInfo.tasks.map((task) => (
                            <tr 
                              key={task.id} 
                              className="border-t hover-elevate"
                              data-testid={`row-task-${task.cardId}`}
                            >
                              <td className="p-2 text-sm" data-testid={`text-task-title-${task.cardId}`}>
                                {task.title}
                              </td>
                              <td className="p-2 text-sm text-muted-foreground" data-testid={`text-task-initiative-${task.cardId}`}>
                                {task.initiativeTitle || '—'}
                              </td>
                              <td className="p-2 text-sm text-right" data-testid={`text-task-sp-${task.cardId}`}>
                                {roundSP(task.size)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Фиксированный футер */}
        {sprintInfo && (
          <DialogFooter className="px-6 py-4 border-t">
            <Button
              onClick={handleSave}
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
