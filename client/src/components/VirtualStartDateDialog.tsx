import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface VirtualStartDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  year: number;
}

function toDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function parseDisplayDate(value: string): string | null {
  const parts = value.trim().split(/[.\-\/]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (c.length === 4) {
      const iso = `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }
    if (a.length === 4) {
      const iso = `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return iso;
    }
  }
  return null;
}

export function VirtualStartDateDialog({ open, onOpenChange, teamId, year }: VirtualStartDateDialogProps) {
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState("");

  const { data: yearlyData } = useQuery<{ virtualStartDate?: string | null }>({
    queryKey: ["/api/teams", teamId, "yearly-data", year],
    queryFn: () =>
      fetch(`/api/teams/${teamId}/yearly-data?year=${year}`).then(r => r.json()),
    enabled: open,
  });

  useEffect(() => {
    if (open && yearlyData?.virtualStartDate) {
      setInputValue(toDisplayDate(yearlyData.virtualStartDate));
    } else if (open) {
      setInputValue("");
    }
  }, [open, yearlyData]);

  const saveMutation = useMutation({
    mutationFn: async (startDate: string) => {
      return await apiRequest("PATCH", `/api/teams/${teamId}/virtual-sprint-start`, { year, startDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timeline", teamId] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "yearly-data", year] });
      toast({ title: "Дата старта сохранена", description: "Виртуальные спринты пересчитаны." });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось сохранить дату.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const iso = parseDisplayDate(inputValue);
    if (!iso) {
      toast({ title: "Неверный формат", description: "Введите дату в формате ДД.ММ.ГГГГ", variant: "destructive" });
      return;
    }
    saveMutation.mutate(iso);
  };

  const handleClear = () => {
    saveMutation.mutate("");
    setInputValue("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Дата начала виртуальных спринтов</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Укажите дату, с которой начинается отсчёт виртуальных спринтов. Все задачи будут перегруппированы по новым периодам.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="vsd-input">Дата старта (ДД.ММ.ГГГГ)</Label>
            <Input
              id="vsd-input"
              data-testid="input-virtual-start-date"
              placeholder="01.01.2025"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          {yearlyData?.virtualStartDate && (
            <Button variant="ghost" onClick={handleClear} disabled={saveMutation.isPending} className="mr-auto">
              Сбросить
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-virtual-start">
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
