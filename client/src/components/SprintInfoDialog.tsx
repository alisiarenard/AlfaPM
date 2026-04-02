import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface SprintInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
}

interface SprintMeta {
  sprintId: number;
  boardId: number;
  title: string;
  velocity: number;
  startDate: string;
  finishDate: string;
  actualFinishDate: string | null;
  goal: string | null;
}

export function SprintInfoDialog({ open, onOpenChange, teamId }: SprintInfoDialogProps) {
  const [sprintId, setSprintId] = useState("");
  const [sprint, setSprint] = useState<SprintMeta | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleSearch = async () => {
    const id = parseInt(sprintId, 10);
    if (isNaN(id)) return;

    setIsSearching(true);
    setSprint(null);
    setError(null);

    try {
      const response = await fetch(`/api/sprints/${id}/preview?metaOnly=true`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setSprint(data.sprint);
      setTotalCards(data.totalCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const id = parseInt(sprintId, 10);
      if (isNaN(id)) throw new Error('No sprint selected');
      const res = await apiRequest('POST', `/api/sprints/${id}/save`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Спринт добавлен",
        description: `Сохранено задач: ${data?.synced ?? 0}`,
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
    setTotalCards(0);
    setError(null);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSprintId("");
      setSprint(null);
      setTotalCards(0);
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-sprint-info">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Добавить спринт</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="sprint-id">Sprint ID</Label>
              <Input
                id="sprint-id"
                type="number"
                placeholder="Введите ID спринта"
                value={sprintId}
                onChange={(e) => { setSprintId(e.target.value); setSprint(null); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                className="no-arrows"
                data-testid="input-sprint-id"
              />
            </div>
            <Button
              onClick={handleSearch}
              variant="outline"
              disabled={!sprintId || isSearching}
              data-testid="button-search-sprint"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Найти'}
            </Button>
          </div>

          {error && (
            <div className="text-sm text-destructive" data-testid="text-sprint-error">
              {error}
            </div>
          )}

          {sprint && (
            <div className="rounded-md border border-border p-4 space-y-3">
              <div className="font-semibold text-base" data-testid="text-sprint-title">{sprint.title}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Начало</span>
                  <div data-testid="text-sprint-start-date">{formatDate(sprint.startDate)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Окончание</span>
                  <div data-testid="text-sprint-finish-date">
                    {sprint.actualFinishDate ? formatDate(sprint.actualFinishDate) : formatDate(sprint.finishDate)}
                    {sprint.actualFinishDate && (
                      <span className="text-xs text-muted-foreground ml-1">(факт)</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Карточек</span>
                  <div data-testid="text-sprint-total-cards">{totalCards}</div>
                </div>
                {sprint.velocity > 0 && (
                  <div>
                    <span className="text-muted-foreground">Velocity</span>
                    <div>{sprint.velocity}</div>
                  </div>
                )}
                {sprint.goal && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Цель</span>
                    <div className="text-xs mt-0.5">{sprint.goal}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={resetAndClose} disabled={saveMutation.isPending}>
            Отмена
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!sprint || saveMutation.isPending}
            className="hover:opacity-90 border-0"
            style={{ backgroundColor: '#cd253d' }}
            data-testid="button-save-sprint"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Добавляем {totalCards} задач...
              </>
            ) : (
              `Добавить${sprint ? ` (${totalCards})` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
