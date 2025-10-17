import type { Initiative, Team, SprintRow } from "@shared/schema";

interface InitiativesTimelineProps {
  initiatives: Initiative[];
  team: Team;
  sprints: SprintRow[];
}

export function InitiativesTimeline({ initiatives, team, sprints }: InitiativesTimelineProps) {
  // Получить все sprint_id из массива sprints, пришедшего с бэкенда
  const allSprintIds = sprints.map(s => s.sprintId).sort((a, b) => a - b);

  // Получить SP для конкретной инициативы в конкретном спринте
  const getSprintSP = (initiative: Initiative, sprintId: number): number => {
    const sprint = initiative.sprints.find(s => s.sprint_id === sprintId);
    return sprint?.sp || 0;
  };

  // Рассчитать общую сумму SP для инициативы (выполнено)
  const getTotalSP = (initiative: Initiative): number => {
    return initiative.sprints.reduce((sum, sprint) => sum + sprint.sp, 0);
  };

  // Получить дату начала инициативы (дата начала первого спринта)
  const getStartSprint = (initiative: Initiative): string => {
    // Для "Поддержка бизнеса" всегда первый день текущего года
    if (initiative.cardId === 0) {
      const currentYear = String(new Date().getFullYear()).slice(-2);
      return `01.01.${currentYear}`;
    }
    
    if (initiative.sprints.length === 0) {
      return '—';
    }
    
    // Найти минимальный sprint_id (самый первый спринт с тасками)
    const minSprintId = Math.min(...initiative.sprints.map(s => s.sprint_id));
    
    // Получить информацию о спринте
    const sprintInfo = getSprintInfo(minSprintId);
    
    // Вернуть дату начала спринта
    return formatDate(sprintInfo?.startDate);
  };

  // Рассчитать вовлечённость (процент SP инициативы от всех SP в её спринтах)
  const calculateInvolvement = (initiative: Initiative): string => {
    if (initiative.sprints.length === 0) {
      return '0%';
    }

    // Найти все спринты, в которых есть эта инициатива
    const initiativeSprintIds = new Set(initiative.sprints.map(s => s.sprint_id));
    
    // Сумма SP текущей инициативы в её спринтах
    const initiativeTotal = getTotalSP(initiative);
    
    // Сумма всех SP всех инициатив в тех же спринтах
    let totalAllInitiatives = 0;
    initiatives.forEach(init => {
      init.sprints.forEach(sprint => {
        if (initiativeSprintIds.has(sprint.sprint_id)) {
          totalAllInitiatives += sprint.sp;
        }
      });
    });
    
    if (totalAllInitiatives === 0) {
      return '0%';
    }
    
    const involvement = Math.round((initiativeTotal / totalAllInitiatives) * 100);
    return `${involvement}%`;
  };

  // Рассчитать Investment Ratio для спринта (процент Epic SP от всех SP в спринте)
  const calculateSprintIR = (sprintId: number): string => {
    let totalSP = 0;

    initiatives.forEach(init => {
      const sp = getSprintSP(init, sprintId);
      totalSP += sp;
    });

    if (totalSP === 0) {
      return '—';
    }

    // Для IR пока считаем все инициативы как Epic (100%)
    // Можно доработать логику позже, если нужно различать типы
    return '100%';
  };

  // Получить информацию о спринте по ID
  const getSprintInfo = (sprintId: number): SprintRow | undefined => {
    return sprints.find(s => s.sprintId === sprintId);
  };

  // Форматировать дату в формат ДД.ММ.ГГ
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2); // Последние 2 цифры года
    return `${day}.${month}.${year}`;
  };

  const getStatusColor = (initiative: Initiative): string => {
    // Поддержка бизнеса - серый
    if (initiative.cardId === 0) {
      return "hsl(220 8% 55% / 0.4)";
    }
    
    // Остальные инициативы - по состоянию
    switch (initiative.state) {
      case "3-done":
        // Выполненные - зеленый
        return "hsl(142 76% 45% / 0.4)";
      case "2-inProgress":
        // В процессе - голубой
        return "hsl(200 80% 60% / 0.4)";
      case "1-queued":
        // В очереди - светло-серый
        return "hsl(220 8% 75% / 0.4)";
      default:
        return "hsl(220 12% 94% / 0.3)";
    }
  };

  // Определить, нужно ли показывать цветной блок
  const shouldShowColorBlock = (initiative: Initiative, sprintId: number): boolean => {
    if (initiative.sprints.length === 0) {
      return false;
    }

    const initiativeSprintIds = initiative.sprints.map(s => s.sprint_id).sort((a, b) => a - b);
    const minSprintId = initiativeSprintIds[0];
    const maxSprintId = initiativeSprintIds[initiativeSprintIds.length - 1];

    return sprintId >= minSprintId && sprintId <= maxSprintId;
  };

  return (
    <div className="w-full overflow-x-auto max-w-full">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-[110] bg-background">
          <tr className="border-b border-border">
            <th className="sticky left-0 z-[120] bg-background px-4 py-3 text-left min-w-[220px] max-w-[220px]">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Инициатива
              </span>
            </th>
            <th className="sticky left-[220px] z-[120] bg-background px-4 py-3 text-left min-w-[140px] max-w-[140px]">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Дата начала
              </span>
            </th>
            <th className="sticky left-[360px] z-[120] bg-background px-4 py-3 text-left min-w-[100px] max-w-[100px]">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Размер
              </span>
            </th>
            <th className="sticky left-[460px] z-[120] bg-background px-4 py-3 text-left min-w-[100px] max-w-[100px]">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Выполнено
              </span>
            </th>
            <th className="sticky left-[560px] z-[120] bg-background px-4 py-3 text-left min-w-[120px] max-w-[120px]">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground">
                Вовлечённость
              </span>
            </th>
            {allSprintIds.map((sprintId) => {
              const sprintInfo = getSprintInfo(sprintId);
              return (
                <th
                  key={sprintId}
                  className="px-4 py-3 text-center min-w-[140px] bg-muted/30"
                  data-testid={`header-sprint-${sprintId}`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-foreground font-mono">
                      {formatDate(sprintInfo?.startDate)} - {formatDate(sprintInfo?.actualFinishDate || sprintInfo?.finishDate)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      IR: {calculateSprintIR(sprintId)} | Velocity: {sprintInfo?.velocity || '—'}
                    </span>
                  </div>
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
              <td className="sticky left-0 z-[100] bg-background px-4 py-3 min-w-[220px] max-w-[220px]">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getStatusColor(initiative) }}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {initiative.title}
                  </span>
                </div>
              </td>
              <td className="sticky left-[220px] z-[100] bg-background px-4 py-3 min-w-[140px] max-w-[140px]">
                <span className="text-sm font-mono text-muted-foreground">
                  {getStartSprint(initiative)}
                </span>
              </td>
              <td className="sticky left-[360px] z-[100] bg-background px-4 py-3 min-w-[100px] max-w-[100px]">
                <span className="text-sm font-mono text-foreground">
                  {initiative.size}
                </span>
              </td>
              <td className="sticky left-[460px] z-[100] bg-background px-4 py-3 min-w-[100px] max-w-[100px]">
                <span className="text-sm font-mono text-foreground">
                  {getTotalSP(initiative)}
                </span>
              </td>
              <td className="sticky left-[560px] z-[100] bg-background px-4 py-3 min-w-[120px] max-w-[120px]">
                <span className="text-sm font-mono text-foreground">
                  {calculateInvolvement(initiative)}
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
                      className="p-0 min-w-[140px]"
                      data-testid={`cell-initiative-${initiative.id}-sprint-${sprintId}`}
                    >
                      <div
                        className={`h-full w-full flex items-center justify-center ${roundedClass}`}
                        style={{ backgroundColor: showBlock ? getStatusColor(initiative) : 'transparent' }}
                      >
                        {showBlock && sp > 0 && (
                          <span className="text-xs font-mono font-semibold text-foreground">
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
    </div>
  );
}
