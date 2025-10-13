import { format, addDays } from "date-fns";
import { StatusBadge } from "./StatusBadge";
import type { Initiative, Sprint, Team } from "@shared/schema";

interface InitiativesTimelineProps {
  initiatives: Initiative[];
  team: Team;
}

export function InitiativesTimeline({ initiatives, team }: InitiativesTimelineProps) {
  // Собрать все спринты из данных
  const dataSprints = initiatives.reduce((acc, initiative) => {
    initiative.sprints.forEach(sprint => {
      if (!acc.some(s => s.sprintId === sprint.sprintId)) {
        acc.push(sprint);
      }
    });
    return acc;
  }, [] as Sprint[]);

  // Генерировать все спринты до конца года
  const generateSprintsToEndOfYear = (): Sprint[] => {
    // Валидация: если нет sprintDuration, нет данных или sprintDuration некорректен
    if (!team.sprintDuration || team.sprintDuration <= 0 || dataSprints.length === 0) {
      return dataSprints;
    }

    const sprintDuration = team.sprintDuration;
    const endOfYear = new Date(new Date().getFullYear(), 11, 31); // 31 декабря текущего года
    
    // Сортируем существующие спринты по дате начала
    const sortedDataSprints = [...dataSprints].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    
    // Найти максимальный номер спринта для продолжения нумерации
    let maxSprintNum = 0;
    sortedDataSprints.forEach(sprint => {
      const num = parseInt(sprint.sprintId.replace(/\D/g, ''));
      if (num > maxSprintNum) {
        maxSprintNum = num;
      }
    });
    let sprintCounter = maxSprintNum + 1;
    
    const allSprints: Sprint[] = [];
    
    // Функция для заполнения пробела синтетическими спринтами
    const fillGap = (gapStartDate: Date, gapEndDate: Date, isLastGap: boolean = false) => {
      let currentDate = new Date(gapStartDate);
      
      while (currentDate <= gapEndDate) {
        // Рассчитываем дату окончания нового спринта
        const calculatedEndDate = addDays(currentDate, sprintDuration - 1);
        
        // Ограничиваем дату окончания концом пробела или концом года
        const maxAllowedEndDate = gapEndDate < endOfYear ? gapEndDate : endOfYear;
        const endDate = calculatedEndDate <= maxAllowedEndDate ? calculatedEndDate : maxAllowedEndDate;
        
        // Проверяем, достаточно ли места для полноценного спринта
        const daysBetween = Math.floor(
          (endDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;
        
        // Если это не последний пробел (до конца года), пропускаем слишком короткие спринты
        // Для последнего пробела создаем частичный спринт до конца года
        if (daysBetween < sprintDuration && !isLastGap) {
          break;
        }
        
        // Если это последний пробел и остались дни до конца года, создаем частичный спринт
        if (daysBetween > 0 && currentDate <= gapEndDate) {
          allSprints.push({
            sprintId: `${sprintCounter}`,
            name: `Спринт ${sprintCounter}`,
            startDate: currentDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            storyPoints: 0
          });
          sprintCounter++;
        }
        
        currentDate = addDays(endDate, 1);
        
        // Выходим если достигли конца пробела
        if (currentDate > gapEndDate) {
          break;
        }
      }
    };
    
    // Заполняем от начала первого спринта, через все существующие спринты, до конца года
    let lastEndDate: Date | null = null;
    
    for (let i = 0; i < sortedDataSprints.length; i++) {
      const currentSprint = sortedDataSprints[i];
      const currentStartDate = new Date(currentSprint.startDate);
      
      // Заполняем пробел перед текущим спринтом, если он есть
      if (lastEndDate && lastEndDate < addDays(currentStartDate, -1)) {
        const gapStart = addDays(lastEndDate, 1);
        const gapEnd = addDays(currentStartDate, -1);
        fillGap(gapStart, gapEnd);
      }
      
      // Добавляем текущий существующий спринт
      allSprints.push(currentSprint);
      lastEndDate = new Date(currentSprint.endDate);
    }
    
    // Заполняем пробел после последнего спринта до конца года
    if (lastEndDate && lastEndDate < endOfYear) {
      const gapStart = addDays(lastEndDate, 1);
      fillGap(gapStart, endOfYear, true); // isLastGap=true для включения частичного спринта
    }
    
    // Возвращаем уже отсортированный массив
    return allSprints.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  };

  const allSprints = generateSprintsToEndOfYear();

  // Рассчитать IR (Investment Ratio) для каждого спринта
  const calculateSprintIR = (sprint: Sprint): string => {
    let totalStoryPoints = 0;
    let epicStoryPoints = 0;

    initiatives.forEach(initiative => {
      const initiativeSprint = initiative.sprints.find(s => s.sprintId === sprint.sprintId);
      if (initiativeSprint && initiativeSprint.storyPoints > 0) {
        totalStoryPoints += initiativeSprint.storyPoints;
        
        // Если type === "Epic", добавляем к epicStoryPoints
        if (initiative.type?.toLowerCase() === 'epic') {
          epicStoryPoints += initiativeSprint.storyPoints;
        }
      }
    });

    if (totalStoryPoints === 0) {
      return '—';
    }

    const ir = Math.round((epicStoryPoints / totalStoryPoints) * 100);
    return `${ir}%`;
  };

  const getStatusColor = (status: string): string => {
    const normalizedStatus = status.toLowerCase();
    switch (normalizedStatus) {
      case "active":
      case "in progress":
        return "hsl(142 76% 45% / 0.4)";
      case "planned":
        return "hsl(215 80% 60% / 0.4)";
      case "completed":
        return "hsl(220 8% 55% / 0.4)";
      case "at risk":
        return "hsl(25 95% 55% / 0.4)";
      default:
        return "hsl(220 12% 94% / 0.3)";
    }
  };

  const shouldShowColorBlock = (initiative: Initiative, sprint: Sprint, sprintIndex: number) => {
    const initiativeStartDate = new Date(initiative.startDate);
    const sprintStartDate = new Date(sprint.startDate);
    
    if (sprintStartDate < initiativeStartDate) {
      return false;
    }
    
    if (initiative.sprints.length === 0) {
      return false;
    }
    
    const lastInitiativeSprint = initiative.sprints.reduce((latest, s) => {
      const currentSprintIndex = allSprints.findIndex(as => as.sprintId === s.sprintId);
      const latestSprintIndex = allSprints.findIndex(as => as.sprintId === latest.sprintId);
      return currentSprintIndex > latestSprintIndex ? s : latest;
    }, initiative.sprints[0]);
    
    const lastSprintIndex = allSprints.findIndex(s => s.sprintId === lastInitiativeSprint.sprintId);
    
    return sprintIndex <= lastSprintIndex;
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-full">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-[110] bg-background">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-[120] bg-background px-4 py-3 text-left min-w-[220px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Инициатива
                </span>
              </th>
              <th className="px-4 py-3 text-left w-[140px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Дата начала
                </span>
              </th>
              <th className="px-4 py-3 text-left w-[100px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Размер
                </span>
              </th>
              <th className="px-4 py-3 text-left w-[120px]">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Вовлечённость
                </span>
              </th>
              {allSprints.map((sprint) => (
                <th
                  key={sprint.sprintId}
                  className="px-4 py-3 text-center min-w-[140px] bg-muted/30"
                  data-testid={`header-sprint-${sprint.sprintId}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {sprint.name}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format(new Date(sprint.startDate), "dd.MM")} - {format(new Date(sprint.endDate), "dd.MM")}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      IR: {calculateSprintIR(sprint)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initiatives.map((initiative) => (
              <tr
                key={initiative.id}
                className="border-b border-border hover-elevate transition-colors duration-150"
                data-testid={`row-initiative-${initiative.id}`}
              >
                <td className="sticky left-0 z-[100] bg-background px-4 py-3">
                  <span className="font-medium text-sm text-foreground">
                    {initiative.name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-sm text-foreground">
                    {format(new Date(initiative.startDate), "dd.MM.yyyy")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground font-medium">
                    {initiative.size}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground font-medium">
                    {initiative.involvement}%
                  </span>
                </td>
{(() => {
                  // Найти первый и последний цветной блок
                  const coloredBlocks = allSprints.map((s, idx) => ({ sprint: s, index: idx }))
                    .filter(({ sprint, index }) => shouldShowColorBlock(initiative, sprint, index));
                  
                  const firstColoredIndex = coloredBlocks.length > 0 ? coloredBlocks[0].index : -1;
                  const lastColoredIndex = coloredBlocks.length > 0 ? coloredBlocks[coloredBlocks.length - 1].index : -1;
                  
                  return allSprints.map((sprint, sprintIndex) => {
                    const initiativeSprint = initiative.sprints.find(
                      (s) => s.sprintId === sprint.sprintId
                    );
                    const showColorBlock = shouldShowColorBlock(initiative, sprint, sprintIndex);
                    const isFirstColored = sprintIndex === firstColoredIndex;
                    const isLastColored = sprintIndex === lastColoredIndex;
                    
                    return (
                      <td
                        key={sprint.sprintId}
                        className={`text-center relative ${showColorBlock ? 'p-0' : 'px-4 py-3'}`}
                        data-testid={`cell-sprint-${initiative.id}-${sprint.sprintId}`}
                      >
                        <div
                          style={{
                            backgroundColor: showColorBlock ? getStatusColor(initiative.status) : 'transparent',
                            borderRadius: showColorBlock 
                              ? `${isFirstColored ? '10px' : '0px'} ${isLastColored ? '10px' : '0px'} ${isLastColored ? '10px' : '0px'} ${isFirstColored ? '10px' : '0px'}`
                              : '0px',
                            padding: showColorBlock ? '5px 16px' : '0',
                            minHeight: showColorBlock ? '40px' : 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {initiativeSprint ? (
                            <span className="font-mono text-base font-semibold text-foreground relative z-10">
                              {initiativeSprint.storyPoints}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm relative z-10">—</span>
                          )}
                        </div>
                      </td>
                    );
                  });
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
