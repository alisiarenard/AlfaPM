import { useState } from "react";
import type { Initiative, Team, SprintRow, TaskInSprint } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { MdPlayCircleOutline, MdCheckCircleOutline, MdPauseCircleOutline } from "react-icons/md";

interface InitiativesTimelineProps {
  initiatives: Initiative[];
  team: Team;
  sprints: SprintRow[];
}

interface InitiativeWithTasks {
  initiativeTitle: string;
  tasks: TaskInSprint[];
}

interface SprintModalData {
  sprintTitle: string;
  initiatives: InitiativeWithTasks[];
}

export function InitiativesTimeline({ initiatives, team, sprints }: InitiativesTimelineProps) {
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [sprintModalData, setSprintModalData] = useState<SprintModalData | null>(null);
  // Отсортировать спринты по дате начала от более ранних до более поздних
  const sortedSprints = [...sprints].sort((a, b) => {
    const dateA = new Date(a.startDate).getTime();
    const dateB = new Date(b.startDate).getTime();
    return dateA - dateB;
  });
  
  // Автогенерация спринтов до конца года
  const generateSprintsUntilEndOfYear = (): SprintRow[] => {
    if (!team.sprintDuration || sortedSprints.length === 0) {
      return sortedSprints;
    }

    const currentYear = new Date().getFullYear();
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999); // 31 декабря текущего года
    
    const allSprints = [...sortedSprints];
    const lastSprint = sortedSprints[sortedSprints.length - 1];
    let nextStartDate = new Date(lastSprint.finishDate);
    nextStartDate.setDate(nextStartDate.getDate() + 1); // Следующий день после окончания последнего спринта
    
    // Найти максимальный существующий sprintId
    const maxExistingId = Math.max(...sortedSprints.map(s => s.sprintId));
    let sprintCounter = maxExistingId + 1;
    let generatedCounter = 1;
    
    // Генерируем спринты до конца года
    while (nextStartDate < endOfYear) {
      const finishDate = new Date(nextStartDate);
      finishDate.setDate(finishDate.getDate() + team.sprintDuration - 1);
      finishDate.setHours(23, 59, 59, 999);
      
      // Если финиш спринта выходит за пределы года, обрезаем до конца года
      if (finishDate > endOfYear) {
        finishDate.setTime(endOfYear.getTime());
      }
      
      allSprints.push({
        sprintId: sprintCounter,
        boardId: lastSprint.boardId,
        title: `Спринт ${generatedCounter}`,
        velocity: lastSprint.velocity,
        startDate: nextStartDate.toISOString(),
        finishDate: finishDate.toISOString(),
        actualFinishDate: null
      });
      
      // Переходим к следующему спринту
      nextStartDate = new Date(finishDate);
      nextStartDate.setDate(nextStartDate.getDate() + 1);
      sprintCounter++;
      generatedCounter++;
      
      // Защита от бесконечного цикла
      if (generatedCounter > 100) {
        break;
      }
    }
    
    return allSprints;
  };
  
  const allSprintsWithGenerated = generateSprintsUntilEndOfYear();
  
  // Получить все sprint_id в хронологическом порядке
  const allSprintIds = allSprintsWithGenerated.map(s => s.sprintId);
  
  // Найти максимальный ID спринта из базы данных (не автогенерированный)
  const maxDbSprintId = sortedSprints.length > 0 
    ? Math.max(...sortedSprints.map(s => s.sprintId))
    : 0;
  
  // Проверка, является ли спринт автогенерированным
  const isGeneratedSprint = (sprintId: number): boolean => {
    return sprintId > maxDbSprintId;
  };

  // Проверка, является ли спринт текущим (сегодняшняя дата попадает в диапазон спринта)
  const isCurrentSprint = (sprintId: number): boolean => {
    const sprintInfo = getSprintInfo(sprintId);
    if (!sprintInfo) return false;

    const now = new Date();
    const start = new Date(sprintInfo.startDate);
    const end = new Date(sprintInfo.actualFinishDate || sprintInfo.finishDate);

    return now >= start && now <= end;
  };

  // Получить SP для конкретной инициативы в конкретном спринте
  const getSprintSP = (initiative: Initiative, sprintId: number): number => {
    const sprint = initiative.sprints.find(s => s.sprint_id === sprintId);
    return sprint?.sp || 0;
  };

  // Получить задачи для конкретной инициативы в конкретном спринте
  const getSprintTasks = (initiative: Initiative, sprintId: number): TaskInSprint[] => {
    const sprint = initiative.sprints.find(s => s.sprint_id === sprintId);
    return sprint?.tasks || [];
  };

  // Обработчик клика на заголовок спринта
  const handleSprintHeaderClick = (sprintId: number) => {
    const sprintInfo = getSprintInfo(sprintId);
    
    // Собираем все инициативы с задачами для этого спринта
    const initiativesWithTasks: InitiativeWithTasks[] = initiatives
      .map(initiative => {
        const tasks = getSprintTasks(initiative, sprintId);
        if (tasks.length === 0) return null;
        
        return {
          initiativeTitle: initiative.title,
          tasks
        };
      })
      .filter((item): item is InitiativeWithTasks => item !== null);
    
    if (initiativesWithTasks.length === 0) return;
    
    setSprintModalData({
      sprintTitle: sprintInfo?.title || `Спринт ${sprintId}`,
      initiatives: initiativesWithTasks
    });
    setSprintModalOpen(true);
  };

  // Рассчитать общую сумму SP для инициативы (выполнено)
  const getTotalSP = (initiative: Initiative): number => {
    return initiative.sprints.reduce((sum, sprint) => sum + sprint.sp, 0);
  };

  // Получить дату начала инициативы (дата начала первого спринта)
  const getStartSprint = (initiative: Initiative): string => {
    // Для "Поддержка бизнеса" всегда первый день текущего года
    if (initiative.cardId === 0) {
      const currentYear = String(new Date().getFullYear());
      return `01.01.${currentYear}`;
    }
    
    if (initiative.sprints.length === 0) {
      return '—';
    }
    
    // Получить информацию о всех спринтах с story points для этой инициативы
    const initiativeSprintInfos = initiative.sprints
      .map(s => getSprintInfo(s.sprint_id))
      .filter((info): info is SprintRow => info !== undefined);
    
    if (initiativeSprintInfos.length === 0) {
      return '—';
    }
    
    // Найти спринт с самой ранней датой начала
    const earliestSprint = initiativeSprintInfos.reduce((earliest, current) => {
      const earliestDate = new Date(earliest.startDate).getTime();
      const currentDate = new Date(current.startDate).getTime();
      return currentDate < earliestDate ? current : earliest;
    });
    
    // Вернуть дату начала самого раннего спринта
    return formatDate(earliestSprint.startDate);
  };

  // Форматировать вовлечённость (используем precomputed значение из API)
  const formatInvolvement = (involvement: number | null): string => {
    if (involvement === null) {
      return '0%';
    }
    return `${involvement}%`;
  };

  // Рассчитать Investment Ratio для спринта (процент SP всех инициатив кроме "Поддержка бизнеса" от всех SP спринта)
  const calculateSprintIR = (sprintId: number): string => {
    let totalSP = 0;
    let spWithoutSupport = 0;

    initiatives.forEach(init => {
      const sp = getSprintSP(init, sprintId);
      totalSP += sp;
      
      // Добавляем SP только если это НЕ "Поддержка бизнеса" (cardId !== 0)
      if (init.cardId !== 0) {
        spWithoutSupport += sp;
      }
    });

    if (totalSP === 0) {
      return '—';
    }

    const ir = Math.round((spWithoutSupport / totalSP) * 100);
    return `${ir}%`;
  };

  // Получить информацию о спринте по ID
  const getSprintInfo = (sprintId: number): SprintRow | undefined => {
    return allSprintsWithGenerated.find(s => s.sprintId === sprintId);
  };

  // Форматировать дату в формат ДД.ММ.ГГГГ
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${day}.${month}.${year}`;
  };

  // Форматировать дату для заголовка спринта (ДД.ММ без года)
  const formatDateShort = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}`;
  };

  const getStatusColor = (initiative: Initiative): string => {
    // Поддержка бизнеса - серый
    if (initiative.cardId === 0) {
      return "hsl(220 8% 55% / 0.2)";
    }
    
    // Остальные инициативы - красный #cd253d с 20% прозрачности
    return "rgba(205, 37, 61, 0.2)";
  };

  // Получить иконку статуса инициативы
  const getStatusIcon = (initiative: Initiative) => {
    const iconClass = "w-4 h-4 flex-shrink-0";
    
    switch (initiative.state) {
      case "2-inProgress":
        return <MdPlayCircleOutline className={iconClass} style={{ color: "rgba(205, 37, 61, 1)" }} data-testid="icon-in-progress" />;
      case "3-done":
        return <MdCheckCircleOutline className={iconClass} style={{ color: "rgba(205, 37, 61, 1)" }} data-testid="icon-done" />;
      case "1-queued":
        return <MdPauseCircleOutline className={iconClass} style={{ color: "rgba(205, 37, 61, 1)" }} data-testid="icon-queued" />;
      default:
        return <MdPauseCircleOutline className={iconClass} style={{ color: "rgba(205, 37, 61, 1)" }} data-testid="icon-default" />;
    }
  };

  // Рассчитать прогнозируемое количество спринтов для инициативы
  const calculateForecastedSprints = (initiative: Initiative): number => {
    // Проверяем корректность входных данных
    if (!initiative.involvement || initiative.involvement === 0) {
      return 0;
    }
    
    if (!team.velocity || team.velocity === 0) {
      return 0;
    }
    
    if (initiative.size <= 0) {
      return 0;
    }
    
    // Формула: ceil(Размер инициативы / (velocity * involvement / 100))
    const sprintsNeeded = initiative.size / (team.velocity * (initiative.involvement / 100));
    
    // Защита от некорректных результатов
    if (!isFinite(sprintsNeeded) || sprintsNeeded <= 0) {
      return 0;
    }
    
    return Math.ceil(sprintsNeeded);
  };

  // Определить, нужно ли показывать цветной блок (прогнозируемый срок)
  const shouldShowColorBlock = (initiative: Initiative, sprintId: number): boolean => {
    if (initiative.sprints.length === 0) {
      return false;
    }

    // Для "Поддержки бизнеса" показываем блоки только там, где есть фактические SP > 0
    if (initiative.cardId === 0) {
      const sp = getSprintSP(initiative, sprintId);
      return sp > 0;
    }

    // Находим спринты инициативы с их датами для правильного упорядочивания
    const initiativeSprintsWithDates = initiative.sprints
      .map(s => {
        const sprintInfo = getSprintInfo(s.sprint_id);
        return {
          sprintId: s.sprint_id,
          startDate: sprintInfo ? new Date(sprintInfo.startDate) : null
        };
      })
      .filter(s => s.startDate !== null)
      .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime());

    if (initiativeSprintsWithDates.length === 0) {
      return false;
    }

    // Первый спринт с SP (по дате)
    const firstSprintId = initiativeSprintsWithDates[0].sprintId;
    
    // Находим индекс первого спринта в общем списке
    const firstSprintIndex = allSprintIds.indexOf(firstSprintId);
    if (firstSprintIndex === -1) {
      return false;
    }

    // Рассчитываем прогнозируемое количество спринтов
    const forecastedSprintCount = calculateForecastedSprints(initiative);
    
    // Если не можем рассчитать прогноз, используем фактические спринты
    if (forecastedSprintCount === 0) {
      const lastSprintId = initiativeSprintsWithDates[initiativeSprintsWithDates.length - 1].sprintId;
      const lastSprintIndex = allSprintIds.indexOf(lastSprintId);
      const currentSprintIndex = allSprintIds.indexOf(sprintId);
      return currentSprintIndex >= firstSprintIndex && currentSprintIndex <= lastSprintIndex;
    }

    // Индекс последнего прогнозируемого спринта
    const lastForecastedIndex = firstSprintIndex + forecastedSprintCount - 1;
    const currentSprintIndex = allSprintIds.indexOf(sprintId);

    return currentSprintIndex >= firstSprintIndex && currentSprintIndex <= lastForecastedIndex;
  };

  return (
    <div className="w-full overflow-x-auto max-w-full">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-[110] bg-background">
          <tr className="border-b border-border">
            <th className="sticky left-0 z-[120] bg-background px-2 py-3 text-left min-w-[220px] max-w-[220px]">
              <span className="text-xs font-normal tracking-wide text-muted-foreground">
                Инициатива
              </span>
            </th>
            <th className="sticky left-[220px] z-[120] bg-background px-2 py-3 text-left min-w-[100px] max-w-[100px]">
              <span className="text-xs font-normal tracking-wide text-muted-foreground">
                Дата начала
              </span>
            </th>
            <th className="sticky left-[320px] z-[120] bg-background px-2 py-3 text-left min-w-[80px] max-w-[80px]">
              <span className="text-xs font-normal tracking-wide text-muted-foreground">
                Размер
              </span>
            </th>
            <th className="sticky left-[400px] z-[120] bg-background px-2 py-3 text-left min-w-[100px] max-w-[100px]">
              <span className="text-xs font-normal tracking-wide text-muted-foreground">
                Выполнено
              </span>
            </th>
            <th className="sticky left-[500px] z-[120] bg-background px-2 py-3 text-left min-w-[120px] max-w-[120px]">
              <span className="text-xs font-normal tracking-wide text-muted-foreground">
                Вовлечённость
              </span>
            </th>
            {allSprintIds.map((sprintId) => {
              const sprintInfo = getSprintInfo(sprintId);
              const isGenerated = isGeneratedSprint(sprintId);
              const isCurrent = isCurrentSprint(sprintId);
              
              // Проверяем, есть ли задачи в этом спринте
              const hasTasksInSprint = initiatives.some(init => getSprintTasks(init, sprintId).length > 0);
              
              return (
                <th
                  key={sprintId}
                  className="px-2 py-3 text-center min-w-[100px]"
                  data-testid={`header-sprint-${sprintId}`}
                >
                  {hasTasksInSprint ? (
                    <button
                      type="button"
                      onClick={() => handleSprintHeaderClick(sprintId)}
                      className="flex flex-col gap-0.5 w-full hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded-md"
                      data-testid={`button-sprint-header-${sprintId}`}
                      aria-label={`Показать задачи спринта ${sprintInfo?.title || sprintId}`}
                    >
                      <span className={`text-[11px] text-foreground ${isCurrent ? 'font-semibold' : 'font-normal'}`}>
                        {formatDateShort(sprintInfo?.startDate)} - {formatDateShort(sprintInfo?.actualFinishDate || sprintInfo?.finishDate)}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        IR: {calculateSprintIR(sprintId)}
                      </span>
                    </button>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-[11px] text-foreground ${isCurrent ? 'font-semibold' : 'font-normal'}`}>
                        {formatDateShort(sprintInfo?.startDate)} - {formatDateShort(sprintInfo?.actualFinishDate || sprintInfo?.finishDate)}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        IR: {calculateSprintIR(sprintId)}
                      </span>
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {initiatives.map((initiative) => (
            <tr
              key={initiative.id}
              className="border-b border-border hover:bg-muted/50 transition-colors"
              data-testid={`row-initiative-${initiative.id}`}
            >
              <td className="sticky left-0 z-[100] bg-background px-2 py-3 min-w-[220px] max-w-[220px]">
                <div className="flex items-center gap-2">
                  {getStatusIcon(initiative)}
                  <span className="text-sm text-foreground font-semibold">
                    {initiative.title}
                  </span>
                </div>
              </td>
              <td className="sticky left-[220px] z-[100] bg-background px-2 py-3 min-w-[100px] max-w-[100px]">
                <span className="text-xs text-muted-foreground">
                  {getStartSprint(initiative)}
                </span>
              </td>
              <td className="sticky left-[320px] z-[100] bg-background px-2 py-3 min-w-[80px] max-w-[80px]">
                <span className="text-xs text-foreground">
                  {initiative.size}
                </span>
              </td>
              <td className="sticky left-[400px] z-[100] bg-background px-2 py-3 min-w-[100px] max-w-[100px]">
                <span className="text-xs text-foreground">
                  {getTotalSP(initiative)}
                </span>
              </td>
              <td className="sticky left-[500px] z-[100] bg-background px-2 py-3 min-w-[120px] max-w-[120px]">
                <span className="text-xs text-foreground">
                  {formatInvolvement(initiative.involvement)}
                </span>
              </td>
              {(() => {
                // Найти индексы первого и последнего блока
                const blocksToShow = allSprintIds.map((id, idx) => ({ id, idx, show: shouldShowColorBlock(initiative, id) }));
                const shownBlocks = blocksToShow.filter(b => b.show);
                const firstBlockIdx = shownBlocks.length > 0 ? shownBlocks[0].idx : -1;
                const lastBlockIdx = shownBlocks.length > 0 ? shownBlocks[shownBlocks.length - 1].idx : -1;

                return allSprintIds.map((sprintId, idx) => {
                  const sp = getSprintSP(initiative, sprintId);
                  const showBlock = shouldShowColorBlock(initiative, sprintId);
                  const isFirst = idx === firstBlockIdx;
                  const isLast = idx === lastBlockIdx;

                  let roundedClass = '';
                  if (showBlock) {
                    if (isFirst && isLast) {
                      roundedClass = 'rounded-[6px]';
                    } else if (isFirst) {
                      roundedClass = 'rounded-l-[6px]';
                    } else if (isLast) {
                      roundedClass = 'rounded-r-[6px]';
                    }
                  }

                  return (
                    <td
                      key={sprintId}
                      className="p-0 min-w-[100px]"
                      data-testid={`cell-initiative-${initiative.id}-sprint-${sprintId}`}
                    >
                      <div
                        className={`h-[30px] w-full flex items-center justify-center ${roundedClass}`}
                        style={{ backgroundColor: showBlock ? getStatusColor(initiative) : 'transparent' }}
                      >
                        {showBlock && sp > 0 && (
                          <span className="text-xs font-semibold text-foreground">
                            {sp}
                          </span>
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

      <Dialog open={sprintModalOpen} onOpenChange={setSprintModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {sprintModalData?.sprintTitle || 'Задачи спринта'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Инициативы и задачи спринта
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4" data-testid="sprint-initiatives-list">
            {sprintModalData?.initiatives.map((initiativeData, idx) => (
              <div key={idx} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground" data-testid={`initiative-title-${idx}`}>
                  {initiativeData.initiativeTitle}
                </h3>
                <div className="space-y-2 pl-4" data-testid={`tasks-list-${idx}`}>
                  {initiativeData.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      data-testid={`task-item-${task.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" data-testid={`task-title-${task.id}`}>
                          {task.title}
                        </p>
                        {task.type && (
                          <p className="text-xs text-muted-foreground mt-0.5" data-testid={`task-type-${task.id}`}>
                            {task.type}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center justify-center min-w-[40px]">
                        <span className="text-sm font-semibold text-foreground" data-testid={`task-size-${task.id}`}>
                          {task.size}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {(!sprintModalData || sprintModalData.initiatives.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Нет задач
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
