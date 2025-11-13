interface Sprint {
  sprint_id: number;
  sp: number;
}

interface Initiative {
  cardId: number;
  state: string;
  sprints: Sprint[];
}

interface SprintPeriod {
  startDate: Date;
  finishDate: Date;
}

export function calculateInitiativesInvolvement<T extends Initiative>(
  initiatives: T[],
  sprintPeriods: Map<number, SprintPeriod>
): (T & { involvement: number | null })[] {
  return initiatives.map(initiative => {
    // Если нет спринтов - involvement = null
    if (initiative.sprints.length === 0) {
      return {
        ...initiative,
        involvement: null
      };
    }
    
    // Получаем спринты инициативы с датами
    const initiativeSprintsWithDates = initiative.sprints
      .map(s => ({
        ...s,
        startDate: sprintPeriods.get(s.sprint_id)?.startDate,
        finishDate: sprintPeriods.get(s.sprint_id)?.finishDate
      }))
      .filter(s => s.startDate !== undefined);
    
    if (initiativeSprintsWithDates.length === 0) {
      return {
        ...initiative,
        involvement: null
      };
    }
    
    // Определяем период для расчета involvement
    // Начало: первый спринт с ненулевыми SP (минимальная дата начала)
    const firstSprintDate = new Date(Math.min(...initiativeSprintsWithDates.map(s => s.startDate!.getTime())));
    
    // Конец: зависит от статуса
    let lastSprintDate: Date;
    if (initiative.state === "2-inProgress") {
      // Для inProgress - ближайший спринт к текущей дате из спринтов команды
      // Это отражает текущую capacity команды, даже если инициатива ещё не имеет задач в текущем спринте
      const now = new Date();
      const teamSprints = Array.from(sprintPeriods.entries())
        .map(([sprintId, period]) => ({
          sprintId,
          startDate: period.startDate,
          distance: Math.abs(period.startDate.getTime() - now.getTime())
        }))
        .sort((a, b) => a.distance - b.distance);
      
      lastSprintDate = teamSprints.length > 0 
        ? teamSprints[0].startDate 
        : new Date(Math.max(...initiativeSprintsWithDates.map(s => s.startDate!.getTime())));
    } else {
      // Для done - последний спринт инициативы с ненулевыми SP (максимальная дата начала)
      lastSprintDate = new Date(Math.max(...initiativeSprintsWithDates.map(s => s.startDate!.getTime())));
    }
    
    // Получаем все спринты в период [firstSprintDate, lastSprintDate]
    const periodSprintIds = Array.from(sprintPeriods.entries())
      .filter(([_, period]) => {
        return period.startDate >= firstSprintDate && period.startDate <= lastSprintDate;
      })
      .map(([sprintId]) => sprintId);
    
    // Считаем сумму SP данной инициативы за период
    const initiativeSp = initiative.sprints
      .filter(s => periodSprintIds.includes(s.sprint_id))
      .reduce((sum, s) => sum + s.sp, 0);
    
    // Считаем сумму SP всех инициатив за период
    const totalSp = initiatives.reduce((sum, init) => {
      const initSpInPeriod = init.sprints
        .filter(s => periodSprintIds.includes(s.sprint_id))
        .reduce((s, sprint) => s + sprint.sp, 0);
      return sum + initSpInPeriod;
    }, 0);
    
    // Рассчитываем involvement (%)
    const involvement = totalSp > 0 ? Math.round((initiativeSp / totalSp) * 100) : null;
    
    return {
      ...initiative,
      involvement
    };
  });
}
