import { useState, useRef, useEffect } from "react";
import type { Initiative, Team, SprintRow, TaskInSprint } from "@shared/schema";
import { getKaitenCardUrl } from "@shared/kaiten.config";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MdPlayCircleOutline, MdCheckCircleOutline, MdPauseCircleOutline } from "react-icons/md";
import { ExternalLink } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface InitiativesTimelineProps {
  initiatives: Initiative[];
  team: Team;
  sprints: SprintRow[];
}

interface InitiativeWithTasks {
  initiativeTitle: string;
  tasks: TaskInSprint[];
}

interface InitiativeProgress {
  title: string;
  sp: number;
  percent: number;
  tasks: TaskInSprint[];
}

interface SprintModalData {
  sprintTitle: string;
  sprintDates: string;
  initiatives: InitiativeProgress[];
  businessSupportSP: number;
  otherInitiativesSP: number;
}

interface InitiativeDetailsData {
  title: string;
  type: string | null;
  cardId: number;
  plannedSize: number;
  actualSize: number;
  plannedCost: number;
  actualCost: number;
  plannedValue: number | null;
  valueCost: number | null;
  factValue: number | null;
  factValueCost: number | null;
}

type EditableField = 'plannedSize' | 'plannedValue' | 'factValue';

export function InitiativesTimeline({ initiatives, team, sprints }: InitiativesTimelineProps) {
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [sprintModalData, setSprintModalData] = useState<SprintModalData | null>(null);
  const [initiativeDetailsOpen, setInitiativeDetailsOpen] = useState(false);
  const [initiativeDetailsData, setInitiativeDetailsData] = useState<InitiativeDetailsData | null>(null);
  const [editingInitiativeId, setEditingInitiativeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingInitiativeId, setSavingInitiativeId] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Состояние для редактирования полей в модалке
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editingFieldValue, setEditingFieldValue] = useState<string>("");
  const [savingField, setSavingField] = useState<EditableField | null>(null);
  const fieldInputRef = useRef<HTMLInputElement>(null);

  // Mutation для обновления planned_involvement
  const updatePlannedInvolvementMutation = useMutation({
    mutationFn: async ({ id, plannedInvolvement }: { id: string; plannedInvolvement: number }) => {
      const response = await fetch(`/api/initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedInvolvement }),
      });
      if (!response.ok) {
        throw new Error('Failed to update planned involvement');
      }
      return response.json();
    },
    onSuccess: () => {
      // Сбрасываем состояние редактирования после успешного сохранения
      setEditingInitiativeId(null);
      setEditValue("");
      // Инвалидируем кэш, используя тот же queryKey, что и в HomePage
      queryClient.invalidateQueries({ 
        queryKey: ["/api/initiatives/board", team.initBoardId, "sprint", team.sprintBoardId] 
      });
      // Сбрасываем opacity и pendingValue с задержкой, чтобы новые данные успели загрузиться
      setTimeout(() => {
        setSavingInitiativeId(null);
        setPendingValue("");
      }, 500);
    },
  });

  // Mutation для обновления инициативы в Kaiten и БД
  const updateInitiativeFieldMutation = useMutation({
    mutationFn: async ({ cardId, size, plannedValue, factValue }: { 
      cardId: number;
      size?: number;
      plannedValue?: string | null;
      factValue?: string | null;
    }) => {
      const response = await fetch(`/api/kaiten/update-initiative/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size, plannedValue, factValue }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update initiative');
      }
      return response.json();
    },
    onSuccess: async () => {
      // Сбрасываем состояние редактирования
      setEditingField(null);
      setEditingFieldValue("");
      setSavingField(null);
      
      // Инвалидируем кэш
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/initiatives/board", team.initBoardId, "sprint", team.sprintBoardId] 
      });
      
      // Обновляем данные модалки сразу без переоткрытия
      if (initiativeDetailsData) {
        // Получаем свежие данные инициативы после инвалидации
        const freshInitiatives = queryClient.getQueryData<Initiative[]>([
          "/api/initiatives/board", team.initBoardId, "sprint", team.sprintBoardId
        ]);
        
        const freshInitiative = freshInitiatives?.find(i => i.cardId === initiativeDetailsData.cardId);
        
        if (freshInitiative) {
          // Пересчитываем все данные аналогично handleInitiativeTitleClick
          const actualSize = getTotalSP(freshInitiative);
          const plannedSize = freshInitiative.size || 0;
          const plannedCost = plannedSize * team.spPrice;
          const actualCost = actualSize * team.spPrice;
          
          // Преобразуем plannedValue из строки в число
          let plannedValue = freshInitiative.plannedValue && freshInitiative.plannedValue.trim() !== '' 
            ? parseFloat(freshInitiative.plannedValue) 
            : null;
          
          // Преобразуем factValue из строки в число
          let factValue = freshInitiative.factValue && freshInitiative.factValue.trim() !== '' 
            ? parseFloat(freshInitiative.factValue) 
            : null;
          
          // Для типов Compliance и Enabler эффект всегда равен затратам
          if (freshInitiative.type === 'Compliance' || freshInitiative.type === 'Enabler') {
            plannedValue = plannedCost;
            factValue = actualCost;
          }
          
          // Рассчитываем value/cost (плановый value / плановый cost)
          const valueCost = plannedValue !== null && plannedCost > 0
            ? Math.round((plannedValue / plannedCost) * 10) / 10
            : null;
          
          // Рассчитываем фактический value/cost (фактический value / фактический cost)
          const factValueCost = factValue !== null && actualCost > 0
            ? Math.round((factValue / actualCost) * 10) / 10
            : null;
          
          // Обновляем состояние модалки с новыми данными
          setInitiativeDetailsData({
            title: freshInitiative.title,
            type: freshInitiative.type,
            cardId: freshInitiative.cardId,
            plannedSize,
            actualSize,
            plannedCost,
            actualCost,
            plannedValue,
            valueCost,
            factValue,
            factValueCost
          });
        }
      }
    },
    onError: (error: Error) => {
      // Сбрасываем состояние редактирования
      setEditingField(null);
      setEditingFieldValue("");
      setSavingField(null);
      
      // Показываем уведомление об ошибке
      console.error('Failed to update initiative:', error);
      alert(`Ошибка при сохранении: ${error.message}`);
    },
  });

  // Автофокус на input при начале редактирования
  useEffect(() => {
    if (editingInitiativeId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingInitiativeId]);

  // Автофокус на input полей в модалке
  useEffect(() => {
    if (editingField && fieldInputRef.current) {
      fieldInputRef.current.focus();
      fieldInputRef.current.select();
    }
  }, [editingField]);

  // Начать редактирование
  const startEditing = (initiativeId: string, currentValue: number | null) => {
    setEditingInitiativeId(initiativeId);
    setEditValue(currentValue !== null ? currentValue.toString() : "0");
  };

  // Сохранить изменения
  const saveEdit = (initiativeId: string) => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setSavingInitiativeId(initiativeId);
      setPendingValue(editValue); // Сохраняем введенное значение
      updatePlannedInvolvementMutation.mutate({
        id: initiativeId,
        plannedInvolvement: numValue,
      });
      // Сброс состояния теперь происходит в onSuccess колбэке мутации
    } else {
      // Если значение некорректное, просто отменяем редактирование
      cancelEdit();
    }
  };

  // Отменить редактирование
  const cancelEdit = () => {
    setEditingInitiativeId(null);
    setEditValue("");
  };

  // Начать редактирование поля в модалке
  const startFieldEditing = (field: EditableField, currentValue: number | string | null) => {
    setEditingField(field);
    if (currentValue === null || currentValue === '') {
      setEditingFieldValue("0");
    } else {
      setEditingFieldValue(String(currentValue));
    }
  };

  // Сохранить изменения поля в модалке
  const saveFieldEdit = () => {
    if (!editingField || !initiativeDetailsData) return;
    
    // Очищаем строку от всех видов пробелов и групповых разделителей
    // Поддерживаем различные локализованные форматы:
    // - "1 234 567,89" (ru-RU с пробелами)
    // - "1.234.567,89" (de-DE с точками как разделители тысяч)
    // - "1,234,567.89" (en-US с запятыми как разделители тысяч)
    // - "1.234.567" (de-DE целые числа с точками)
    // - "1,234,567" (en-US целые числа с запятыми)
    let cleanedValue = editingFieldValue
      .replace(/[\s\u00A0\u202F]/g, '') // Удаляем все виды пробелов (обычные, NBSP, узкие)
      .replace(/\u2009/g, ''); // Удаляем thin space
    
    // Определяем десятичный разделитель (последняя запятая или точка)
    const lastComma = cleanedValue.lastIndexOf(',');
    const lastDot = cleanedValue.lastIndexOf('.');
    const commaCount = (cleanedValue.match(/,/g) || []).length;
    const dotCount = (cleanedValue.match(/\./g) || []).length;
    
    if (lastComma > -1 && lastDot > -1) {
      // Оба разделителя присутствуют - используем тот, который идет последним как десятичный
      if (lastComma > lastDot) {
        // Запятая - десятичный разделитель (европейский формат: "1.234.567,89")
        cleanedValue = cleanedValue.replace(/\./g, '').replace(',', '.');
      } else {
        // Точка - десятичный разделитель (американский формат: "1,234,567.89")
        cleanedValue = cleanedValue.replace(/,/g, '');
      }
    } else if (lastComma > -1) {
      // Только запятые
      if (commaCount === 1) {
        // Одна запятая - проверяем количество цифр после нее
        const digitsAfterComma = cleanedValue.substring(lastComma + 1).length;
        if (digitsAfterComma <= 2) {
          // 1-2 цифры после запятой - десятичный разделитель (европейский формат: "123,45")
          cleanedValue = cleanedValue.replace(',', '.');
        } else {
          // 3+ цифры после запятой - групповой разделитель (американский формат: "1,234")
          cleanedValue = cleanedValue.replace(',', '');
        }
      } else {
        // Несколько запятых - групповые разделители (американский формат: "1,234,567")
        cleanedValue = cleanedValue.replace(/,/g, '');
      }
    } else if (lastDot > -1) {
      // Только точки
      if (dotCount === 1 && lastDot === cleanedValue.length - 3) {
        // Одна точка в позиции десятичного разделителя (американский формат: "123.45")
        // Оставляем как есть
      } else {
        // Несколько точек или одна точка не в конце - групповые разделители (европейский формат: "1.234.567")
        cleanedValue = cleanedValue.replace(/\./g, '');
      }
    }
    // Если нет разделителей - оставляем как есть
    
    const numValue = parseFloat(cleanedValue);
    
    if (isNaN(numValue) || numValue < 0) {
      alert('Некорректное значение. Пожалуйста, введите положительное число.');
      cancelFieldEdit();
      return;
    }

    setSavingField(editingField);

    const updateData: {
      cardId: number;
      size?: number;
      plannedValue?: string | null;
      factValue?: string | null;
    } = {
      cardId: initiativeDetailsData.cardId,
    };

    if (editingField === 'plannedSize') {
      updateData.size = Math.round(numValue);
    } else if (editingField === 'plannedValue') {
      updateData.plannedValue = String(numValue);
    } else if (editingField === 'factValue') {
      updateData.factValue = String(numValue);
    }

    updateInitiativeFieldMutation.mutate(updateData);
  };

  // Отменить редактирование поля в модалке
  const cancelFieldEdit = () => {
    setEditingField(null);
    setEditingFieldValue("");
  };
  // Отсортировать спринты по дате начала от более ранних до более поздних
  const sortedSprints = [...sprints].sort((a, b) => {
    const dateA = new Date(a.startDate).getTime();
    const dateB = new Date(b.startDate).getTime();
    return dateA - dateB;
  });
  
  // Автогенерация спринтов на 6 месяцев вперед от текущего спринта
  const generateSprintsUntilEndOfYear = (): SprintRow[] => {
    if (!team.sprintDuration || sortedSprints.length === 0) {
      return sortedSprints;
    }

    const now = new Date();
    
    // Найти текущий спринт (спринт, который содержит сегодняшнюю дату)
    const currentSprint = sortedSprints.find(sprint => {
      const start = new Date(sprint.startDate);
      const end = new Date(sprint.actualFinishDate || sprint.finishDate);
      return now >= start && now <= end;
    });
    
    // Определяем точку отсчета для 6 месяцев вперед
    let referenceDate: Date;
    if (currentSprint) {
      // Если нашли текущий спринт, берем его дату начала
      referenceDate = new Date(currentSprint.startDate);
    } else {
      // Если текущего спринта нет, берем текущую дату
      referenceDate = now;
    }
    
    // Вычисляем дату 6 месяцев вперед
    const sixMonthsLater = new Date(referenceDate);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    sixMonthsLater.setHours(23, 59, 59, 999);
    
    const allSprints = [...sortedSprints];
    const lastSprint = sortedSprints[sortedSprints.length - 1];
    let nextStartDate = new Date(lastSprint.finishDate);
    nextStartDate.setDate(nextStartDate.getDate() + 1); // Следующий день после окончания последнего спринта
    
    // Найти максимальный существующий sprintId
    const maxExistingId = Math.max(...sortedSprints.map(s => s.sprintId));
    let sprintCounter = maxExistingId + 1;
    let generatedCounter = 1;
    
    // Генерируем спринты на 6 месяцев вперед от текущего спринта
    while (nextStartDate < sixMonthsLater) {
      const finishDate = new Date(nextStartDate);
      finishDate.setDate(finishDate.getDate() + team.sprintDuration - 1);
      finishDate.setHours(23, 59, 59, 999);
      
      // Если финиш спринта выходит за пределы 6 месяцев, обрезаем
      if (finishDate > sixMonthsLater) {
        finishDate.setTime(sixMonthsLater.getTime());
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
    
    // Рассчитываем распределение SP
    let businessSupportSP = 0;
    let otherInitiativesSP = 0;
    let totalSP = 0;
    
    initiatives.forEach(initiative => {
      const sp = getSprintSP(initiative, sprintId);
      totalSP += sp;
      if (initiative.cardId === 0) {
        businessSupportSP += sp;
      } else {
        otherInitiativesSP += sp;
      }
    });
    
    // Собираем инициативы с их SP, процентами и задачами
    const initiativesProgress: InitiativeProgress[] = initiatives
      .map(initiative => {
        const tasks = getSprintTasks(initiative, sprintId);
        // Пропускаем инициативы без тасок в этом спринте
        if (tasks.length === 0) return null;
        
        const sp = getSprintSP(initiative, sprintId);
        const percent = totalSP > 0 ? Math.round((sp / totalSP) * 100) : 0;
        
        return {
          title: initiative.title,
          sp,
          percent,
          tasks
        };
      })
      .filter((item): item is InitiativeProgress => item !== null);
    
    if (initiativesProgress.length === 0) return;
    
    // Форматируем даты спринта
    const sprintDates = sprintInfo 
      ? `${formatDate(sprintInfo.startDate)} - ${formatDate(sprintInfo.actualFinishDate || sprintInfo.finishDate)}`
      : '';
    
    setSprintModalData({
      sprintTitle: sprintInfo?.title || `Спринт ${sprintId}`,
      sprintDates,
      initiatives: initiativesProgress,
      businessSupportSP,
      otherInitiativesSP
    });
    setSprintModalOpen(true);
  };

  // Обработчик клика на название инициативы
  const handleInitiativeTitleClick = (initiative: Initiative) => {
    if (!initiative) {
      console.error("Initiative is null or undefined");
      return;
    }
    
    const actualSize = getTotalSP(initiative);
    const plannedSize = initiative.size || 0;
    const plannedCost = plannedSize * team.spPrice;
    const actualCost = actualSize * team.spPrice;
    
    // Преобразуем plannedValue из строки в число
    let plannedValue = initiative.plannedValue && initiative.plannedValue.trim() !== '' 
      ? parseFloat(initiative.plannedValue) 
      : null;
    
    // Преобразуем factValue из строки в число
    let factValue = initiative.factValue && initiative.factValue.trim() !== '' 
      ? parseFloat(initiative.factValue) 
      : null;
    
    // Для типов Compliance и Enabler эффект всегда равен затратам
    if (initiative.type === 'Compliance' || initiative.type === 'Enabler') {
      plannedValue = plannedCost;
      factValue = actualCost;
    }
    
    // Рассчитываем value/cost (плановый value / плановый cost)
    const valueCost = plannedValue !== null && plannedCost > 0
      ? Math.round((plannedValue / plannedCost) * 10) / 10
      : null;
    
    // Рассчитываем фактический value/cost (фактический value / фактический cost)
    const factValueCost = factValue !== null && actualCost > 0
      ? Math.round((factValue / actualCost) * 10) / 10
      : null;
    
    setInitiativeDetailsData({
      title: initiative.title,
      type: initiative.type,
      cardId: initiative.cardId,
      plannedSize,
      actualSize,
      plannedCost,
      actualCost,
      plannedValue,
      valueCost,
      factValue,
      factValueCost
    });
    setInitiativeDetailsOpen(true);
  };

  // Рассчитать общую сумму SP для инициативы (выполнено)
  const getTotalSP = (initiative: Initiative): number => {
    return initiative.sprints.reduce((sum, sprint) => sum + sprint.sp, 0);
  };

  // Форматировать колонку "Выполнено"
  const formatCompleted = (initiative: Initiative): string => {
    const completed = getTotalSP(initiative);
    const size = initiative.size || 0;
    
    if (completed === 0 && size === 0) {
      return '—';
    }
    
    if (size > 0) {
      return `${completed} из ${size}`;
    }
    
    return `${completed}`;
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
      return "hsl(220 8% 55% / 0.1)";
    }
    
    // Остальные инициативы - красный #cd253d с 10% прозрачности
    return "rgba(205, 37, 61, 0.1)";
  };

  // Получить иконку статуса инициативы
  const getStatusIcon = (initiative: Initiative) => {
    const iconClass = "w-5 h-5 flex-shrink-0";
    
    // Поддержка бизнеса - серый
    if (initiative.cardId === 0) {
      switch (initiative.state) {
        case "2-inProgress":
          return <MdPlayCircleOutline className={iconClass} style={{ color: "hsl(220 8% 55%)" }} data-testid="icon-in-progress" />;
        case "3-done":
          return <MdCheckCircleOutline className={iconClass} style={{ color: "hsl(220 8% 55%)" }} data-testid="icon-done" />;
        case "1-queued":
          return <MdPauseCircleOutline className={iconClass} style={{ color: "hsl(220 8% 55%)" }} data-testid="icon-queued" />;
        default:
          return <MdPauseCircleOutline className={iconClass} style={{ color: "hsl(220 8% 55%)" }} data-testid="icon-default" />;
      }
    }
    
    // Остальные инициативы
    switch (initiative.state) {
      case "2-inProgress":
        return <MdPlayCircleOutline className={iconClass} style={{ color: "rgba(205, 37, 61, 1)" }} data-testid="icon-in-progress" />;
      case "3-done":
        return <MdCheckCircleOutline className={iconClass} style={{ color: "rgba(205, 37, 61, 1)" }} data-testid="icon-done" />;
      case "1-queued":
        return <MdPauseCircleOutline className={iconClass} style={{ color: "#d1d5db" }} data-testid="icon-queued" />;
      default:
        return <MdPauseCircleOutline className={iconClass} style={{ color: "#d1d5db" }} data-testid="icon-default" />;
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

  // Рассчитать плановое количество спринтов для инициативы
  const calculatePlannedSprints = (initiative: Initiative): number => {
    // Проверяем корректность входных данных
    if (!initiative.plannedInvolvement || initiative.plannedInvolvement === 0) {
      return 0;
    }
    
    if (!team.velocity || team.velocity === 0) {
      return 0;
    }
    
    if (initiative.size <= 0) {
      return 0;
    }
    
    // Формула: ceil(Размер инициативы / (velocity * plannedInvolvement / 100))
    const sprintsNeeded = initiative.size / (team.velocity * (initiative.plannedInvolvement / 100));
    
    // Защита от некорректных результатов
    if (!isFinite(sprintsNeeded) || sprintsNeeded <= 0) {
      return 0;
    }
    
    return Math.ceil(sprintsNeeded);
  };

  // Определить, должен ли спринт иметь плановые borders
  const getPlannedBorders = (initiative: Initiative, sprintId: number): { 
    top: boolean; 
    bottom: boolean; 
    left: boolean; 
    right: boolean;
    isFirst: boolean;
    isLast: boolean;
  } => {
    // Для "Поддержки бизнеса" и инициатив в очереди без спринтов - нет borders
    if (initiative.cardId === 0 || initiative.sprints.length === 0) {
      return { top: false, bottom: false, left: false, right: false, isFirst: false, isLast: false };
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
      return { top: false, bottom: false, left: false, right: false, isFirst: false, isLast: false };
    }

    // Первый спринт с SP (по дате)
    const firstSprintId = initiativeSprintsWithDates[0].sprintId;
    
    // Находим индекс первого спринта в общем списке
    const firstSprintIndex = allSprintIds.indexOf(firstSprintId);
    if (firstSprintIndex === -1) {
      return { top: false, bottom: false, left: false, right: false, isFirst: false, isLast: false };
    }

    // Рассчитываем плановое количество спринтов
    const plannedSprintCount = calculatePlannedSprints(initiative);
    
    // Если не можем рассчитать план, нет borders
    if (plannedSprintCount === 0) {
      return { top: false, bottom: false, left: false, right: false, isFirst: false, isLast: false };
    }

    // Индекс последнего планового спринта
    const lastPlannedIndex = firstSprintIndex + plannedSprintCount - 1;
    const currentSprintIndex = allSprintIds.indexOf(sprintId);

    // Проверяем, находится ли текущий спринт в плановом диапазоне
    const isInPlannedRange = currentSprintIndex >= firstSprintIndex && currentSprintIndex <= lastPlannedIndex;
    
    if (!isInPlannedRange) {
      return { top: false, bottom: false, left: false, right: false, isFirst: false, isLast: false };
    }

    const isFirst = currentSprintIndex === firstSprintIndex;
    const isLast = currentSprintIndex === lastPlannedIndex;

    // Все спринты в диапазоне имеют верхний и нижний borders
    // Левый border только у первого
    // Правый border только у последнего
    return { 
      top: true, 
      bottom: true, 
      left: isFirst, 
      right: isLast,
      isFirst,
      isLast
    };
  };

  // Получить информацию о датах инициативы для тултипа
  const getInitiativeTooltip = (initiative: Initiative): { startDate: string; plannedEndDate: string; actualEndDate: string } | null => {
    if (initiative.sprints.length === 0) {
      return null;
    }

    // Находим спринты инициативы с их датами для правильного упорядочивания
    const initiativeSprintsWithDates = initiative.sprints
      .map(s => {
        const sprintInfo = getSprintInfo(s.sprint_id);
        return {
          sprintId: s.sprint_id,
          startDate: sprintInfo ? new Date(sprintInfo.startDate) : null,
          finishDate: sprintInfo ? new Date(sprintInfo.actualFinishDate || sprintInfo.finishDate) : null
        };
      })
      .filter(s => s.startDate !== null)
      .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime());

    if (initiativeSprintsWithDates.length === 0) {
      return null;
    }

    // Первый спринт с SP (по дате)
    const firstSprintId = initiativeSprintsWithDates[0].sprintId;
    const firstSprintIndex = allSprintIds.indexOf(firstSprintId);
    
    if (firstSprintIndex === -1) {
      return null;
    }

    // Дата начала - дата начала первого спринта
    const startDate = initiativeSprintsWithDates[0].startDate;

    // Рассчитываем плановое количество спринтов
    const plannedSprintCount = calculatePlannedSprints(initiative);
    let plannedEndDate: Date | null = null;
    
    if (plannedSprintCount > 0) {
      // Индекс последнего планового спринта
      const lastPlannedIndex = firstSprintIndex + plannedSprintCount - 1;
      if (lastPlannedIndex >= 0 && lastPlannedIndex < allSprintIds.length) {
        const lastPlannedSprintId = allSprintIds[lastPlannedIndex];
        const lastPlannedSprintInfo = getSprintInfo(lastPlannedSprintId);
        plannedEndDate = lastPlannedSprintInfo ? new Date(lastPlannedSprintInfo.actualFinishDate || lastPlannedSprintInfo.finishDate) : null;
      }
    }

    // Рассчитываем прогнозируемое количество спринтов (фактическая дата)
    const forecastedSprintCount = calculateForecastedSprints(initiative);
    let actualEndDate: Date | null = null;
    
    // Если не можем рассчитать прогноз, используем фактические спринты
    if (forecastedSprintCount === 0) {
      const lastSprint = initiativeSprintsWithDates[initiativeSprintsWithDates.length - 1];
      actualEndDate = lastSprint.finishDate;
    } else {
      // Индекс последнего прогнозируемого спринта
      const lastForecastedIndex = firstSprintIndex + forecastedSprintCount - 1;
      if (lastForecastedIndex >= 0 && lastForecastedIndex < allSprintIds.length) {
        const lastSprintId = allSprintIds[lastForecastedIndex];
        const lastSprintInfo = getSprintInfo(lastSprintId);
        actualEndDate = lastSprintInfo ? new Date(lastSprintInfo.actualFinishDate || lastSprintInfo.finishDate) : null;
      }
    }

    if (!startDate || !actualEndDate) {
      return null;
    }

    return {
      startDate: formatDate(startDate.toISOString()),
      plannedEndDate: plannedEndDate ? formatDate(plannedEndDate.toISOString()) : '—',
      actualEndDate: formatDate(actualEndDate.toISOString())
    };
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
    <TooltipProvider>
      <div className="w-full overflow-x-auto max-w-full custom-scrollbar">
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
                Выполнено
              </span>
            </th>
            <th className="sticky left-[320px] z-[120] bg-background px-2 py-3 text-left min-w-[100px] max-w-[100px]">
              <span className="text-xs font-normal tracking-wide text-muted-foreground">
                Фокус(план)
              </span>
            </th>
            <th className="sticky left-[420px] z-[120] bg-background px-2 py-3 text-left min-w-[100px] max-w-[100px]">
              <span className="text-xs font-normal tracking-wide text-muted-foreground">
                Фокус (факт)
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
          {initiatives.map((initiative, index) => (
            <tr
              key={initiative.id}
              className={`${index !== initiatives.length - 1 ? 'border-b border-border' : ''}`}
              data-testid={`row-initiative-${initiative.id}`}
            >
              <td className="sticky left-0 z-[100] bg-background px-2 py-3 min-w-[220px] max-w-[220px]">
                <div className="flex items-center gap-2">
                  {getStatusIcon(initiative)}
                  {(() => {
                    // Проверяем, есть ли данные у инициативы
                    const hasData = (initiative.size && initiative.size > 0) || getTotalSP(initiative) > 0;
                    const isClickable = initiative.cardId !== 0 && hasData;
                    
                    if (isClickable) {
                      return (
                        <button
                          onClick={() => handleInitiativeTitleClick(initiative)}
                          className="text-sm text-foreground font-semibold transition-colors text-left"
                          data-testid={`button-initiative-${initiative.id}`}
                        >
                          {initiative.title}
                        </button>
                      );
                    } else {
                      return (
                        <span
                          className="text-sm text-foreground font-semibold text-left"
                          data-testid={`text-initiative-${initiative.id}`}
                        >
                          {initiative.title}
                        </span>
                      );
                    }
                  })()}
                </div>
              </td>
              <td className="sticky left-[220px] z-[100] bg-background px-2 py-3 min-w-[100px] max-w-[100px]">
                <div className="flex items-center gap-2">
                  {(() => {
                    const completed = getTotalSP(initiative);
                    const size = initiative.size || 0;
                    const percentage = size > 0 ? Math.round((completed / size) * 100) : 0;
                    
                    const donutData = [
                      { value: percentage },
                      { value: 100 - percentage }
                    ];
                    
                    return (
                      <>
                        <div className="w-4 h-4 flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={donutData}
                                cx="50%"
                                cy="50%"
                                innerRadius={5}
                                outerRadius={8}
                                dataKey="value"
                                startAngle={90}
                                endAngle={-270}
                              >
                                <Cell fill="#cd253d" />
                                <Cell fill="hsl(var(--muted))" />
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {formatCompleted(initiative)}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </td>
              <td 
                className="sticky left-[320px] z-[100] bg-background min-w-[100px] max-w-[100px]"
                data-testid={`cell-planned-involvement-${initiative.id}`}
              >
                <div 
                  className="px-2 py-3 cursor-pointer transition-opacity duration-300"
                  style={{ opacity: savingInitiativeId === initiative.id ? 0.4 : 1 }}
                  onClick={() => editingInitiativeId !== initiative.id && savingInitiativeId !== initiative.id && startEditing(initiative.id, initiative.plannedInvolvement)}
                >
                  {editingInitiativeId === initiative.id ? (
                    <input
                      ref={inputRef}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => saveEdit(initiative.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          saveEdit(initiative.id);
                        } else if (e.key === 'Escape') {
                          cancelEdit();
                        }
                      }}
                      className="w-full text-xs text-foreground bg-transparent border-none p-0 m-0 no-arrows"
                      style={{ outline: 'none' }}
                      data-testid={`input-planned-involvement-${initiative.id}`}
                    />
                  ) : (
                    <span className="text-xs text-foreground">
                      {savingInitiativeId === initiative.id && pendingValue 
                        ? `${Math.round(parseFloat(pendingValue))}%`
                        : formatInvolvement(initiative.plannedInvolvement)
                      }
                    </span>
                  )}
                </div>
              </td>
              <td className="sticky left-[420px] z-[100] bg-background px-2 py-3 min-w-[100px] max-w-[100px]">
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

                const tooltipData = getInitiativeTooltip(initiative);
                
                return allSprintIds.map((sprintId, idx) => {
                  const sp = getSprintSP(initiative, sprintId);
                  const showBlock = shouldShowColorBlock(initiative, sprintId);
                  const isFirst = idx === firstBlockIdx;
                  const isLast = idx === lastBlockIdx;
                  const plannedBorders = getPlannedBorders(initiative, sprintId);

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

                  // Стили для плановых borders (2px с opacity 0.3)
                  let plannedBorderClasses = '';
                  if (showBlock && (plannedBorders.top || plannedBorders.bottom || plannedBorders.left || plannedBorders.right)) {
                    if (plannedBorders.top) plannedBorderClasses += 'border-t-2 ';
                    if (plannedBorders.bottom) plannedBorderClasses += 'border-b-2 ';
                    if (plannedBorders.left) plannedBorderClasses += 'border-l-2 ';
                    if (plannedBorders.right) plannedBorderClasses += 'border-r-2 ';
                  }

                  // Радиус для плановых borders (только слева)
                  let plannedRadiusClass = '';
                  if (showBlock && plannedBorders.isFirst) {
                    plannedRadiusClass = 'rounded-l-[6px]';
                  }
                  
                  const blockContent = (
                    <div
                      className={`h-[30px] w-full flex items-center justify-center ${roundedClass} ${plannedBorderClasses} ${plannedRadiusClass}`}
                      style={{ 
                        backgroundColor: showBlock ? getStatusColor(initiative) : 'transparent',
                        borderColor: (plannedBorders.top || plannedBorders.bottom || plannedBorders.left || plannedBorders.right) ? 'rgba(205, 37, 61, 0.3)' : undefined
                      }}
                    >
                      {showBlock && sp > 0 && (
                        <span className="text-xs font-semibold text-foreground">
                          {sp}
                        </span>
                      )}
                    </div>
                  );

                  return (
                    <td
                      key={sprintId}
                      className="p-0 min-w-[100px]"
                      data-testid={`cell-initiative-${initiative.id}-sprint-${sprintId}`}
                    >
                      {showBlock && tooltipData && initiative.cardId !== 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {blockContent}
                          </TooltipTrigger>
                          <TooltipContent className="z-[200] bg-white dark:bg-white text-foreground">
                            <div className="text-xs space-y-1">
                              <div>Дата начала: {tooltipData.startDate}</div>
                              <div>Дата окончания(план): {tooltipData.plannedEndDate}</div>
                              <div>Дата окончания(факт): {tooltipData.actualEndDate}</div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        blockContent
                      )}
                    </td>
                  );
                });
              })()}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Initiative Details Modal */}
      <Dialog open={initiativeDetailsOpen} onOpenChange={setInitiativeDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {initiativeDetailsData?.title}
            </DialogTitle>
            {initiativeDetailsData?.type && (
              <p className="text-xs text-foreground mt-1" data-testid="text-initiative-type">
                {initiativeDetailsData.type}
              </p>
            )}
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Размер */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm text-muted-foreground">Размер, SP</p>
                <div className="text-sm font-medium flex items-center gap-2" data-testid="text-size-progress">
                  <span className={initiativeDetailsData && initiativeDetailsData.actualSize > initiativeDetailsData.plannedSize ? "text-[#cd253d]" : ""}>
                    {initiativeDetailsData?.actualSize}
                  </span>
                  <span>{' / '}</span>
                  {editingField === 'plannedSize' ? (
                    <input
                      ref={fieldInputRef}
                      type="number"
                      value={editingFieldValue}
                      onChange={(e) => setEditingFieldValue(e.target.value)}
                      onBlur={saveFieldEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveFieldEdit();
                        if (e.key === 'Escape') cancelFieldEdit();
                      }}
                      className="w-16 px-1 py-0.5 text-sm border rounded no-arrows"
                      data-testid="input-planned-size"
                      disabled={savingField === 'plannedSize'}
                    />
                  ) : initiativeDetailsData?.type === 'Epic' ? (
                    <button
                      onClick={() => startFieldEditing('plannedSize', initiativeDetailsData?.plannedSize || 0)}
                      className="transition-colors cursor-pointer"
                      data-testid="button-edit-planned-size"
                      disabled={savingField !== null}
                    >
                      {initiativeDetailsData?.plannedSize || '—'}
                    </button>
                  ) : (
                    <span>{initiativeDetailsData?.plannedSize || '—'}</span>
                  )}
                </div>
              </div>
              <div className="relative w-full h-[5px] bg-muted rounded-full overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full transition-all"
                  style={{ 
                    width: initiativeDetailsData?.plannedSize 
                      ? `${Math.min((initiativeDetailsData.actualSize / initiativeDetailsData.plannedSize) * 100, 100)}%` 
                      : '0%',
                    backgroundColor: '#cd253d'
                  }}
                  data-testid="progress-size"
                />
              </div>
            </div>
            
            {/* Затраты */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm text-muted-foreground">Затраты, ₽</p>
                <p className="text-sm font-medium" data-testid="text-cost-progress">
                  <span className={initiativeDetailsData && initiativeDetailsData.actualCost > initiativeDetailsData.plannedCost ? "text-[#cd253d]" : ""}>
                    {initiativeDetailsData?.actualCost.toLocaleString('ru-RU')}
                  </span>
                  {' / '}
                  {initiativeDetailsData?.plannedCost.toLocaleString('ru-RU')}
                </p>
              </div>
              <div className="relative w-full h-[5px] bg-muted rounded-full overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full transition-all"
                  style={{ 
                    width: initiativeDetailsData?.plannedCost 
                      ? `${Math.min((initiativeDetailsData.actualCost / initiativeDetailsData.plannedCost) * 100, 100)}%` 
                      : '0%',
                    backgroundColor: '#cd253d'
                  }}
                  data-testid="progress-cost"
                />
              </div>
            </div>
            
            {/* Эффект */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm text-muted-foreground">Эффект, ₽</p>
                <div className="text-sm font-medium flex items-center gap-2" data-testid="text-value-progress">
                  {editingField === 'factValue' ? (
                    <input
                      ref={fieldInputRef}
                      type="number"
                      value={editingFieldValue}
                      onChange={(e) => setEditingFieldValue(e.target.value)}
                      onBlur={saveFieldEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveFieldEdit();
                        if (e.key === 'Escape') cancelFieldEdit();
                      }}
                      className="w-24 px-1 py-0.5 text-sm border rounded no-arrows"
                      data-testid="input-fact-value"
                      disabled={savingField === 'factValue'}
                    />
                  ) : initiativeDetailsData?.type === 'Epic' ? (
                    <button
                      onClick={() => startFieldEditing('factValue', initiativeDetailsData?.factValue || 0)}
                      className="transition-colors cursor-pointer"
                      data-testid="button-edit-fact-value"
                      disabled={savingField !== null}
                    >
                      {initiativeDetailsData?.factValue !== null && initiativeDetailsData?.factValue !== undefined
                        ? initiativeDetailsData.factValue.toLocaleString('ru-RU')
                        : '—'}
                    </button>
                  ) : (
                    <span>
                      {initiativeDetailsData?.factValue !== null && initiativeDetailsData?.factValue !== undefined
                        ? initiativeDetailsData.factValue.toLocaleString('ru-RU')
                        : '—'}
                    </span>
                  )}
                  <span>{' / '}</span>
                  {editingField === 'plannedValue' ? (
                    <input
                      ref={fieldInputRef}
                      type="number"
                      value={editingFieldValue}
                      onChange={(e) => setEditingFieldValue(e.target.value)}
                      onBlur={saveFieldEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveFieldEdit();
                        if (e.key === 'Escape') cancelFieldEdit();
                      }}
                      className="w-24 px-1 py-0.5 text-sm border rounded no-arrows"
                      data-testid="input-planned-value"
                      disabled={savingField === 'plannedValue'}
                    />
                  ) : initiativeDetailsData?.type === 'Epic' ? (
                    <button
                      onClick={() => startFieldEditing('plannedValue', initiativeDetailsData?.plannedValue || 0)}
                      className="transition-colors cursor-pointer"
                      data-testid="button-edit-planned-value"
                      disabled={savingField !== null}
                    >
                      {initiativeDetailsData?.plannedValue !== null && initiativeDetailsData?.plannedValue !== undefined
                        ? initiativeDetailsData.plannedValue.toLocaleString('ru-RU')
                        : '—'}
                    </button>
                  ) : (
                    <span>
                      {initiativeDetailsData?.plannedValue !== null && initiativeDetailsData?.plannedValue !== undefined
                        ? initiativeDetailsData.plannedValue.toLocaleString('ru-RU')
                        : '—'}
                    </span>
                  )}
                </div>
              </div>
              <div className="relative w-full h-[5px] bg-muted rounded-full overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full transition-all"
                  style={{ 
                    width: (initiativeDetailsData?.plannedValue && initiativeDetailsData?.plannedValue > 0)
                      ? `${Math.min(((initiativeDetailsData?.factValue || 0) / initiativeDetailsData.plannedValue) * 100, 100)}%` 
                      : '0%',
                    backgroundColor: '#cd253d'
                  }}
                  data-testid="progress-value"
                />
              </div>
            </div>
            
            {/* Value/Cost */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm text-muted-foreground">Value/Cost</p>
                <p className="text-sm font-medium" data-testid="text-valuecost-progress">
                  <span className={initiativeDetailsData?.factValueCost !== null && initiativeDetailsData?.factValueCost !== undefined && initiativeDetailsData.factValueCost < 1 ? "text-[#cd253d]" : ""}>
                    {initiativeDetailsData?.factValueCost !== null && initiativeDetailsData?.factValueCost !== undefined
                      ? initiativeDetailsData.factValueCost.toFixed(1)
                      : '—'}
                  </span>
                  {' / '}
                  <span className={initiativeDetailsData?.valueCost !== null && initiativeDetailsData?.valueCost !== undefined && initiativeDetailsData.valueCost < 1 ? "text-[#cd253d]" : ""}>
                    {initiativeDetailsData?.valueCost !== null && initiativeDetailsData?.valueCost !== undefined
                      ? initiativeDetailsData.valueCost.toFixed(1)
                      : '—'}
                  </span>
                </p>
              </div>
              <div className="relative w-full h-[5px] bg-muted rounded-full overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full transition-all"
                  style={{ 
                    width: (initiativeDetailsData?.valueCost && initiativeDetailsData?.valueCost > 0)
                      ? `${Math.min(((initiativeDetailsData?.factValueCost || 0) / initiativeDetailsData.valueCost) * 100, 100)}%` 
                      : '0%',
                    backgroundColor: '#cd253d'
                  }}
                  data-testid="progress-valuecost"
                />
              </div>
            </div>
            
            {/* Легенда */}
            <div className="flex items-center justify-center gap-4 pt-6 border-t-0" data-testid="legend-container">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted" data-testid="legend-planned-indicator"></div>
                <span className="text-xs text-muted-foreground">Плановые значения</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#cd253d' }} data-testid="legend-actual-indicator"></div>
                <span className="text-xs text-muted-foreground">Фактические значения</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sprintModalOpen} onOpenChange={setSprintModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Спринт {sprintModalData?.sprintDates || ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-6">
            {/* Левый блок - 30% ширины - Круговая диаграмма */}
            <div className="w-[30%] flex-shrink-0">
              {(() => {
                const businessSP = sprintModalData?.businessSupportSP || 0;
                const otherSP = sprintModalData?.otherInitiativesSP || 0;
                const totalSP = businessSP + otherSP;
                
                if (totalSP === 0) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Нет данных
                    </p>
                  );
                }
                
                const businessPercent = Math.round((businessSP / totalSP) * 100);
                const otherPercent = Math.round((otherSP / totalSP) * 100);
                
                // IR - процент инициатив (не включая поддержку бизнеса)
                const ir = otherPercent;
                
                const data = [
                  { name: 'Поддержка бизнеса', value: businessSP, percent: businessPercent },
                  { name: 'Остальные инициативы', value: otherSP, percent: otherPercent }
                ];
                
                const COLORS = ['rgb(131, 137, 149)', '#cd253d'];
                
                return (
                  <div>
                    <div className="relative">
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            innerRadius={45}
                            outerRadius={60}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-sm font-semibold text-foreground">
                            IR - {ir}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* Правый блок - Инициативы с прогресс-барами */}
            <div className="flex-1">
              {sprintModalData && sprintModalData.initiatives.length > 0 ? (
                <Accordion 
                  type="multiple" 
                  className="w-full" 
                  defaultValue={sprintModalData.initiatives.map((_, idx) => `initiative-${idx}`)}
                  data-testid="sprint-initiatives-list"
                >
                  {sprintModalData.initiatives.map((initiative, idx) => (
                    <AccordionItem key={idx} value={`initiative-${idx}`} className="border-none">
                      <AccordionTrigger className="hover:no-underline py-3 flex-row-reverse justify-end gap-3" data-testid={`initiative-accordion-${idx}`}>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-foreground text-left" data-testid={`initiative-title-${idx}`}>
                              {initiative.title}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {initiative.percent}%
                            </span>
                          </div>
                          <div className="relative w-full h-[5px] bg-muted rounded-md overflow-hidden">
                            <div 
                              className="absolute inset-y-0 left-0 transition-all duration-300 rounded-md"
                              style={{ 
                                width: `${initiative.percent}%`,
                                backgroundColor: initiative.title === 'Поддержка бизнеса' ? 'rgb(131, 137, 149)' : '#cd253d'
                              }}
                              data-testid={`progress-bar-${idx}`}
                            />
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-2 pl-8">
                          {initiative.tasks.map((task, taskIdx) => (
                            <div key={taskIdx} className="flex items-center justify-between" data-testid={`task-${idx}-${taskIdx}`}>
                              <a 
                                href={getKaitenCardUrl(team.spaceId, task.cardId, task.archived)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors group"
                                data-testid={`task-link-${idx}-${taskIdx}`}
                              >
                                <span className="group-hover:underline">{task.title}</span>
                                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              </a>
                              {task.size === 0 ? (
                                <span className="text-[10px] text-destructive ml-4 font-medium">нет оценки</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground ml-4">{task.size} sp</span>
                              )}
                            </div>
                          ))}
                          {initiative.tasks.length === 0 && (
                            <p className="text-xs text-muted-foreground">Нет задач</p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Нет данных
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
