import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInitiativeSchema, insertTaskSchema, insertDepartmentSchema, type TaskRow } from "@shared/schema";
import { kaitenClient } from "./kaiten";
import { log } from "./vite";
import { calculateInitiativesInvolvement } from "./utils/involvement";

/**
 * Рекурсивно ищет инициативу в родительской цепочке карточки
 * @param parentCardId - ID родительской карточки
 * @param depth - глубина рекурсии (защита от бесконечных циклов)
 * @param originalTaskId - ID исходной задачи (для логирования)
 * @returns ID инициативы или 0, если не найдена
 */
async function findInitiativeInParentChain(parentCardId: number, depth = 0, originalTaskId?: number): Promise<number> {
  // Защита от бесконечной рекурсии
  if (depth > 5) {
    return 0;
  }
  
  // Проверяем, является ли родитель инициативой
  const parentInitiative = await storage.getInitiativeByCardId(parentCardId);
  if (parentInitiative) {
    // Проверяем тип инициативы - подходящие типы: Epic, Compliance, Enabler
    const validTypes = ['Epic', 'Compliance', 'Enabler'];
    const initiativeType = parentInitiative.type || '';
    
    if (validTypes.includes(initiativeType)) {
      // Тип подходит - возвращаем этот ID
      return parentCardId;
    } else {
      // Тип НЕ подходит - продолжаем поиск вверх по цепочке
      try {
        const parentCard = await kaitenClient.getCard(parentCardId);
        
        // Проверяем, есть ли у этой инициативы свой родитель
        if (parentCard.parents_ids && Array.isArray(parentCard.parents_ids) && parentCard.parents_ids.length > 0) {
          const grandParentId = parentCard.parents_ids[0];
          return await findInitiativeInParentChain(grandParentId, depth + 1, originalTaskId);
        } else {
          return 0;
        }
      } catch (error) {
        return 0;
      }
    }
  }
  
  // Если родитель не инициатива, получаем его карточку из Kaiten
  try {
    const parentCard = await kaitenClient.getCard(parentCardId);
    
    // Проверяем, есть ли у родительской карточки свой родитель
    if (parentCard.parents_ids && Array.isArray(parentCard.parents_ids) && parentCard.parents_ids.length > 0) {
      const grandParentId = parentCard.parents_ids[0];
      return await findInitiativeInParentChain(grandParentId, depth + 1, originalTaskId);
    }
  } catch (error) {
  }
  
  // Не нашли инициативу в цепочке
  return 0;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve departments" 
      });
    }
  });

  app.post("/api/departments", async (req, res) => {
    try {
      const validatedData = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(validatedData);
      res.status(201).json(department);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/departments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Request body cannot be empty" 
        });
      }
      
      const validatedData = insertDepartmentSchema.partial().parse(req.body);
      
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one field must be provided for update" 
        });
      }
      
      const department = await storage.updateDepartment(id, validatedData);
      
      if (!department) {
        return res.status(404).json({ 
          success: false, 
          error: "Department not found" 
        });
      }
      
      res.json(department);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.get("/api/teams/:departmentId", async (req, res) => {
    try {
      const { departmentId } = req.params;
      const teams = await storage.getTeamsByDepartment(departmentId);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve teams" 
      });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const teamData = req.body;
      
      // Валидация initBoardId через Kaiten API
      if (teamData.initBoardId) {
        const initBoardValidation = await kaitenClient.validateBoard(teamData.initBoardId, 'initiatives');
        if (!initBoardValidation.valid) {
          return res.status(400).json({ 
            success: false, 
            error: initBoardValidation.error || "Доска инициатив не найдена в Kaiten"
          });
        }
      }
      
      // Создаем команду в БД
      const team = await storage.createTeam(teamData);
      
      // Автоматическая синхронизация данных с Kaiten
      // Последовательность: 1) Инициативы, 2) Спринты, 3) Таски
      
      // 1. Синхронизация инициатив
      if (teamData.initBoardId) {
        try {
          
          const allCards = await kaitenClient.getCardsFromBoard(teamData.initBoardId);
          
          // Фильтруем: сохраняем только неархивные инициативы
          const cards = allCards.filter(card => !card.archived);
          
          
          const plannedValueId = "id_237";
          const factValueId = "id_238";
          const syncedCardIds: number[] = [];
          
          for (const card of cards) {
            let state: "1-queued" | "2-inProgress" | "3-done";
            
            if (card.state === 3) {
              state = "3-done";
            } else if (card.state === 2) {
              state = "2-inProgress";
            } else {
              state = "1-queued";
            }
            
            const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
            
            const rawPlanned = card.properties?.[plannedValueId];
            const plannedValue = rawPlanned == null ? undefined : String(rawPlanned);
            
            const rawFact = card.properties?.[factValueId];
            const factValue = rawFact == null ? undefined : String(rawFact);
            
            await storage.syncInitiativeFromKaiten(
              card.id,
              teamData.initBoardId,
              card.title,
              state,
              condition,
              card.size || 0,
              card.type?.name,
              plannedValueId,
              plannedValue,
              factValueId,
              factValue,
              card.due_date || null,
              card.last_moved_to_done_at || null
            );
            syncedCardIds.push(card.id);
          }
          
          // Архивируем инициативы, которых больше нет на доске
          await storage.archiveInitiativesNotInList(teamData.initBoardId, syncedCardIds);
          
        } catch (syncError) {
        }
      }
      
      // 2. Синхронизация спринтов и задач
      // Логика зависит от состояния hasSprints:
      // - Если hasSprints === true: синхронизируем реальные спринты и их задачи
      // - Если hasSprints === false: синхронизируем только задачи через date filter (виртуальные спринты создадутся автоматически)
      
      if (teamData.hasSprints && teamData.sprintIds) {
        // РЕЖИМ: Реальные спринты
        try {
          
          // Парсим sprint IDs из строки (разделитель - запятая)
          const sprintIdArray = teamData.sprintIds
            .split(',')
            .map((id: string) => id.trim())
            .filter((id: string) => id.length > 0)
            .map((id: string) => parseInt(id))
            .filter((id: number) => !isNaN(id));
          
          
          // Получаем summary каждого спринта через getSprint API
          const syncedSprints: any[] = [];
          
          for (const sprintId of sprintIdArray) {
            try {
              const sprint = await kaitenClient.getSprint(sprintId);
              
              // Сохраняем спринт в БД
              await storage.syncSprintFromKaiten(
                sprint.id,
                sprint.board_id,
                sprint.title,
                sprint.velocity,
                sprint.start_date,
                sprint.finish_date,
                sprint.actual_finish_date,
                sprint.goal
              );
              
              syncedSprints.push(sprint);
            } catch (sprintError: unknown) {
              const errorMessage = sprintError instanceof Error ? sprintError.message : String(sprintError);
            }
          }
          
          
          // 3. Синхронизация тасок из реальных спринтов
          let totalTasks = 0;
          
          if (syncedSprints.length > 0) {
            // Есть спринты - синхронизируем задачи из них
            for (const sprint of syncedSprints) {
              try {
                const kaitenSprint = await kaitenClient.getSprint(sprint.id);
                
                if (kaitenSprint.cards && Array.isArray(kaitenSprint.cards)) {
                  for (const sprintCard of kaitenSprint.cards) {
                    const card = await kaitenClient.getCard(sprintCard.id);
                    
                    // Пропускаем удаленные карточки (condition === 3)
                    if (card.condition === 3) {
                      continue;
                    }
                    
                    // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
                    let initCardId = 0;
                    if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                      initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
                    }
                    
                    let state: "1-queued" | "2-inProgress" | "3-done";
                    if (card.state === 3) {
                      state = "3-done";
                    } else if (card.state === 2) {
                      state = "2-inProgress";
                    } else {
                      state = "1-queued";
                    }
                    
                    const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
                    
                    await storage.syncTaskFromKaiten(
                      card.id,
                      card.board_id,
                      card.title,
                      card.created || new Date().toISOString(),
                      state,
                      card.size || 0,
                      condition,
                      card.archived || false,
                      initCardId,
                      card.type?.name,
                      card.completed_at ?? undefined,
                      sprint.id,
                      card.last_moved_to_done_at ?? null,
                      team.teamId
                    );
                    
                    totalTasks++;
                  }
                }
              } catch (sprintError: unknown) {
                const errorMessage = sprintError instanceof Error ? sprintError.message : String(sprintError);
              }
            }
          }
        } catch (syncError) {
        }
      } else if (teamData.initBoardId) {
        // РЕЖИМ: Виртуальные спринты (hasSprints === false)
        // Синхронизируем дочерние карточки инициатив (children)
        // Виртуальные спринты создадутся автоматически в /api/timeline на основе sprintDuration
        try {
          
          // Получаем все инициативы, которые были синхронизированы на шаге 1
          const initiatives = await storage.getInitiativesByBoardId(teamData.initBoardId);
          
          let totalTasks = 0;
          
          // Для каждой инициативы синхронизируем её дочерние карточки
          for (const initiative of initiatives) {
            try {
              // Получаем полную карточку инициативы из Kaiten для доступа к children_ids
              const initiativeCard = await kaitenClient.getCard(initiative.cardId);
              
              if (initiativeCard.children_ids && Array.isArray(initiativeCard.children_ids) && initiativeCard.children_ids.length > 0) {
                
                // Синхронизируем каждую дочернюю карточку
                for (const childId of initiativeCard.children_ids) {
                  try {
                    const childCard = await kaitenClient.getCard(childId);
                    
                    // Пропускаем архивные
                    if (childCard.archived) {
                      continue;
                    }
                    
                    // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
                    let initCardId = initiative.cardId; // По умолчанию - родительская инициатива
                    if (childCard.parents_ids && Array.isArray(childCard.parents_ids) && childCard.parents_ids.length > 0) {
                      // Если у дочерней карточки есть parents_ids, ищем инициативу через цепочку
                      const foundInitCardId = await findInitiativeInParentChain(childCard.parents_ids[0]);
                      if (foundInitCardId !== 0) {
                        initCardId = foundInitCardId;
                      }
                    }
                    
                    let state: "1-queued" | "2-inProgress" | "3-done";
                    if (childCard.state === 3) {
                      state = "3-done";
                    } else if (childCard.state === 2) {
                      state = "2-inProgress";
                    } else {
                      state = "1-queued";
                    }
                    
                    const condition: "1-live" | "2-archived" = childCard.archived ? "2-archived" : "1-live";
                    
                    await storage.syncTaskFromKaiten(
                      childCard.id,
                      childCard.board_id,
                      childCard.title,
                      childCard.created || new Date().toISOString(),
                      state,
                      childCard.size || 0,
                      condition,
                      childCard.archived || false,
                      initCardId, // Используем найденную инициативу
                      childCard.type?.name,
                      childCard.completed_at ?? undefined,
                      null, // Нет sprint_id для виртуальных спринтов
                      childCard.last_moved_to_done_at,
                      team.teamId
                    );
                    
                    totalTasks++;
                  } catch (childError: unknown) {
                    const errorMessage = childError instanceof Error ? childError.message : String(childError);
                  }
                }
              }
            } catch (initError: unknown) {
              const errorMessage = initError instanceof Error ? initError.message : String(initError);
            }
          }
          
        } catch (syncError) {
        }
      }
      
      res.json(team);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/teams/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      const updateData = req.body;

      // Получаем текущие данные команды для валидации
      const currentTeam = updateData.initBoardId !== undefined || updateData.sprintBoardId !== undefined
        ? await storage.getTeamById(teamId)
        : null;

      // Если изменяется initBoardId, проверяем его в Kaiten только если значение действительно изменилось
      if (updateData.initBoardId !== undefined) {
        // Валидируем только если ID доски действительно изменился
        if (!currentTeam || currentTeam.initBoardId !== updateData.initBoardId) {
          const validation = await kaitenClient.validateBoard(updateData.initBoardId, 'initiatives');
          if (!validation.valid) {
            return res.status(400).json({ 
              success: false, 
              error: validation.error || "Доска инициатив не найдена в Kaiten"
            });
          }
        }
      }

      // Если изменяется sprintBoardId, проверяем его в Kaiten только если значение действительно изменилось
      if (updateData.sprintBoardId !== undefined) {
        // Валидируем только если ID доски действительно изменился
        if (!currentTeam || currentTeam.sprintBoardId !== updateData.sprintBoardId) {
          const validation = await kaitenClient.validateBoard(updateData.sprintBoardId, 'sprints');
          if (!validation.valid) {
            return res.status(400).json({ 
              success: false, 
              error: validation.error || "Доска спринтов не найдена в Kaiten"
            });
          }
        }
      }

      const team = await storage.updateTeam(teamId, updateData);
      
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          error: "Team not found" 
        });
      }
      
      res.json(team);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.delete("/api/teams/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      
      await storage.deleteTeam(teamId);
      
      res.json({ success: true });
    } catch (error) {
      
      if (error instanceof Error && error.message === "Team not found") {
        return res.status(404).json({ 
          success: false, 
          error: "Team not found" 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.get("/api/initiatives", async (req, res) => {
    try {
      const initiatives = await storage.getAllInitiatives();
      res.json(initiatives);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve initiatives" 
      });
    }
  });

  app.get("/api/initiatives/board/:initBoardId", async (req, res) => {
    try {
      const initBoardId = parseInt(req.params.initBoardId);
      const sprintBoardId = req.query.sprintBoardId ? parseInt(req.query.sprintBoardId as string) : null;
      
      if (isNaN(initBoardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }
      
      const initiatives = await storage.getInitiativesByBoardId(initBoardId);
      
      // Если передан sprintBoardId, получаем sprint_id спринтов этой команды
      let teamSprintIds: Set<number> | null = null;
      let teamSprints: any[] = [];
      if (sprintBoardId !== null && !isNaN(sprintBoardId)) {
        teamSprints = await storage.getSprintsByBoardId(sprintBoardId);
        teamSprintIds = new Set(teamSprints.map(s => s.sprintId));
      }
      
      // Добавляем массив sprints для каждой инициативы
      const initiativesWithSprints = await Promise.all(
        initiatives.map(async (initiative) => {
          // Получаем все таски для данной инициативы
          const allTasks = await storage.getTasksByInitCardId(initiative.cardId);
          
          // Если указан sprintBoardId - фильтруем только задачи из спринтов команды
          const tasks = teamSprintIds 
            ? allTasks.filter(task => task.sprintId !== null && teamSprintIds!.has(task.sprintId))
            : allTasks;
          
          // Группируем по sprint_id и собираем задачи
          const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
          
          // Кэш для спринтов чтобы не запрашивать дважды
          const sprintInfoCache = new Map<number, any>();
          
          for (const task of tasks) {
            if (task.sprintId !== null) {
              const current = sprintsMap.get(task.sprintId) || { sp: 0, tasks: [] };
              
              // Получаем инфо о спринте (сначала из teamSprints, потом из БД если нужно)
              let sprintInfo = teamSprints.find(s => s.sprintId === task.sprintId);
              
              // Если спринт не в teamSprints, получаем из БД
              if (!sprintInfo && !sprintInfoCache.has(task.sprintId)) {
                sprintInfo = await storage.getSprint(task.sprintId);
                if (sprintInfo) {
                  sprintInfoCache.set(task.sprintId, sprintInfo);
                }
              } else if (!sprintInfo && sprintInfoCache.has(task.sprintId)) {
                sprintInfo = sprintInfoCache.get(task.sprintId);
              }
              
              // Проверяем: добавляем SP для любых задач (без doneDate ИЛИ с doneDate внутри дат спринта)
              // И НЕ добавляем SP для удаленных задач
              let countSP = false;
              if (sprintInfo && task.condition !== '3 - deleted') {
                if (!task.doneDate) {
                  countSP = true;
                } else {
                  const sprintStartTime = new Date(sprintInfo.startDate).getTime();
                  const sprintEndTime = new Date(sprintInfo.finishDate).getTime();
                  const taskDoneTime = new Date(task.doneDate).getTime();
                  countSP = taskDoneTime >= sprintStartTime && taskDoneTime <= sprintEndTime;
                }
              }
              
              console.log(`[Timeline SP] Init: ${initiative.cardId}, Task: ${task.id}, Sprint: ${task.sprintId}, Size: ${task.size}, DoneDate: ${task.doneDate}, CountSP: ${countSP}, SprintInfo: ${sprintInfo ? 'Found' : 'NOT FOUND'}`);
              
              if (countSP) {
                current.sp += task.size;
              }
              
              current.tasks.push({
                id: task.id,
                cardId: task.cardId,
                title: task.title,
                type: task.type,
                size: task.size,
                state: task.state,
                condition: task.condition,
                archived: task.archived,
                doneDate: task.doneDate
              });
              sprintsMap.set(task.sprintId, current);
            }
          }
          
          // Преобразуем в массив объектов {sprint_id, sp, tasks}
          const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
            sprint_id,
            sp: data.sp,
            tasks: data.tasks
          }));
          
          return {
            ...initiative,
            sprints
          };
        })
      );
      
      // Если указан sprintBoardId - фильтруем только инициативы с задачами в спринтах команды
      // Инициативы в очереди показываем всегда
      const filteredInitiatives = teamSprintIds
        ? initiativesWithSprints.filter(init => {
            const hasSprints = init.sprints.length > 0;
            const isSupport = init.cardId === 0;
            const isQueued = init.state === "1-queued";
            const pass = hasSprints || isSupport || isQueued;
            
            if (isQueued) {
            }
            
            return pass;
          })
        : initiativesWithSprints;
      
      // Рассчитываем involvement для каждой инициативы
      const sprintPeriods = new Map(
        teamSprints.map(s => [s.sprintId, { 
          startDate: new Date(s.startDate),
          finishDate: new Date(s.finishDate)
        }])
      );
      
      const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);
      
      res.json(initiativesWithInvolvement);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve initiatives" 
      });
    }
  });

  app.get("/api/timeline/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      const team = await storage.getTeamById(teamId);
      
      if (!team) {
        return res.status(404).json({ 
          success: false, 
          error: "Team not found" 
        });
      }

      const initBoardId = team.initBoardId;
      const sprintBoardId = team.sprintBoardId;
      const sprintDuration = team.sprintDuration || 14; // Default to 14 days if not set

      if (!initBoardId) {
        return res.status(400).json({ 
          success: false, 
          error: "Team missing initBoardId" 
        });
      }


      // Получаем инициативы
      let initiatives = await storage.getInitiativesByBoardId(initBoardId);
      
      // Добавляем "Поддержка бизнеса" (cardId=0) если её нет
      const hasBusinessSupport = initiatives.some(init => init.cardId === 0);
      if (!hasBusinessSupport) {
        const businessSupport = await storage.getInitiativeByCardId(0);
        if (businessSupport) {
          initiatives = [businessSupport, ...initiatives];
        }
      }
      
      // Фильтруем инициативы - показываем только Epic, Compliance, Enabler и "Поддержка бизнеса"
      const allInitiatives = [...initiatives];
      initiatives = initiatives.filter(init => 
        init.cardId === 0 || init.type === 'Epic' || init.type === 'Compliance' || init.type === 'Enabler'
      );

      // Загружаем все задачи один раз (избегаем N+1)
      // Используем allInitiatives для загрузки задач (включая задачи из других типов)
      const allInitiativeCardIds = new Set(allInitiatives.map(i => i.cardId));
      const allTasks = await storage.getAllTasks();
      // Фильтруем задачи по teamId чтобы показывать только задачи этой команды
      let initiativeTasks = allTasks.filter(task => 
        task.initCardId !== null && 
        allInitiativeCardIds.has(task.initCardId) &&
        task.teamId === teamId
      );
      
      // Создаем Map для быстрого поиска типа инициативы по cardId
      const initiativeTypeMap = new Map(allInitiatives.map(init => [init.cardId, init.type]));
      
      // Перенаправляем задачи из инициатив других типов (не Epic, Compliance и не Enabler) в "Поддержку бизнеса"
      initiativeTasks = initiativeTasks.map(task => {
        const initType = initiativeTypeMap.get(task.initCardId || 0);
        // Если инициатива не Epic, не Compliance, не Enabler и не "Поддержка бизнеса" (cardId=0), перенаправляем в "Поддержку бизнеса"
        if (task.initCardId !== 0 && initType !== 'Epic' && initType !== 'Compliance' && initType !== 'Enabler') {
          // ВАЖНО: Сохраняем тип инициативы в task.type для правильного подсчета в Cost Structure
          return { ...task, initCardId: 0, type: initType || task.type };
        }
        return task;
      });

      // Логика зависит от флага hasSprints:
      // - Если hasSprints === true: используем реальные спринты из БД
      // - Если hasSprints === false: создаём виртуальные спринты на основе sprintDuration
      
      if (team.hasSprints && sprintBoardId) {
        // РЕЖИМ: Реальные спринты
        const teamSprints = await storage.getSprintsByBoardId(sprintBoardId);
        const teamSprintIds = new Set(teamSprints.map(s => s.sprintId));

        // Если спринтов нет в БД - возвращаем пустой результат с предупреждением
        if (teamSprints.length === 0) {

          // Фильтруем задачи с doneDate
          const tasksForVirtual = initiativeTasks.filter(task => 
            task.doneDate !== null && 
            task.doneDate !== ''
          );


          if (tasksForVirtual.length === 0) {
            // Нет задач - возвращаем пустые спринты
            const initiativesWithEmpty = initiatives.map(init => ({
              ...init,
              sprints: [],
              involvement: null
            }));
            return res.json({ initiatives: initiativesWithEmpty, sprints: [] });
          }

          // Создаём виртуальные спринты (копия логики из else ветки)
          const sortedTasks = tasksForVirtual.sort((a, b) => {
            const dateA = new Date(a.doneDate!);
            const dateB = new Date(b.doneDate!);
            return dateA.getTime() - dateB.getTime();
          });

          const firstDate = new Date(sortedTasks[0].doneDate!);
          const lastDate = new Date(sortedTasks[sortedTasks.length - 1].doneDate!);

          const virtualSprints: any[] = [];
          const virtualSprintTasksMap = new Map<number, any[]>();
          let currentStartDate = new Date(firstDate);
          let sprintNumber = 1;

          while (currentStartDate <= lastDate) {
            const currentEndDate = new Date(currentStartDate);
            currentEndDate.setDate(currentEndDate.getDate() + sprintDuration - 1);

            const sprintTasks = sortedTasks.filter(task => {
              const taskDate = new Date(task.doneDate!);
              return taskDate >= currentStartDate && taskDate <= currentEndDate;
            });

            if (sprintTasks.length > 0) {
              const virtualSprintId = -sprintNumber;
              virtualSprints.push({
                sprintId: virtualSprintId,
                boardId: sprintBoardId,
                title: `Виртуальный спринт ${sprintNumber}`,
                velocity: 0,
                startDate: currentStartDate.toISOString(),
                finishDate: currentEndDate.toISOString(),
                actualFinishDate: null,
                goal: null,
                isVirtual: true
              });
              virtualSprintTasksMap.set(virtualSprintId, sprintTasks);
              sprintNumber++;
            }

            currentStartDate = new Date(currentEndDate);
            currentStartDate.setDate(currentStartDate.getDate() + 1);
          }

          // Группируем задачи по инициативам
          const tasksByInitiative = new Map<number, any[]>();
          tasksForVirtual.forEach(task => {
            if (task.initCardId !== null) {
              if (!tasksByInitiative.has(task.initCardId)) {
                tasksByInitiative.set(task.initCardId, []);
              }
              tasksByInitiative.get(task.initCardId)!.push(task);
            }
          });

          const initiativesWithVirtualSprints = initiatives.map(initiative => {
            const tasks = tasksByInitiative.get(initiative.cardId) || [];

            const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
            tasks.forEach(task => {
              const taskDate = new Date(task.doneDate!);
              const virtualSprint = virtualSprints.find(vs => {
                const start = new Date(vs.startDate);
                const end = new Date(vs.finishDate);
                return taskDate >= start && taskDate <= end;
              });

              if (virtualSprint) {
                const current = sprintsMap.get(virtualSprint.sprintId) || { sp: 0, tasks: [] };
                // Все виртуальные спринты уже содержат только done задачи с doneDate в диапазоне спринта
                current.sp += task.size;
                current.tasks.push({
                  id: task.id,
                  cardId: task.cardId,
                  title: task.title,
                  type: task.type,
                  size: task.size,
                  archived: task.archived,
                  doneDate: task.doneDate
                });
                sprintsMap.set(virtualSprint.sprintId, current);
              }
            });

            const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
              sprint_id,
              sp: data.sp,
              tasks: data.tasks
            }));

            return {
              ...initiative,
              sprints,
              involvement: null
            };
          });

          const filteredInitiatives = initiativesWithVirtualSprints.filter(init => {
            const hasSprints = init.sprints.length > 0;
            const isSupport = init.cardId === 0;
            const isQueued = init.state === "1-queued";
            return hasSprints || isSupport || isQueued;
          });

          // Рассчитываем involvement для виртуальных спринтов
          const sprintPeriods = new Map(
            virtualSprints.map(s => [s.sprintId, { 
              startDate: new Date(s.startDate),
              finishDate: new Date(s.finishDate)
            }])
          );
          
          const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);

          return res.json({ initiatives: initiativesWithInvolvement, sprints: virtualSprints });
        }

        // Группируем задачи по инициативам в памяти
        const tasksByInitiative = new Map<number, any[]>();
        initiativeTasks
          .filter(task => task.sprintId !== null && teamSprintIds.has(task.sprintId) && task.initCardId !== null)
          .forEach(task => {
            if (!tasksByInitiative.has(task.initCardId!)) {
              tasksByInitiative.set(task.initCardId!, []);
            }
            tasksByInitiative.get(task.initCardId!)!.push(task);
          });

        // Добавляем спринты для каждой инициативы
        const initiativesWithSprints = initiatives.map(initiative => {
          const tasks = tasksByInitiative.get(initiative.cardId) || [];

          const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
          tasks.forEach(task => {
            if (task.sprintId !== null) {
              const sprintInfo = teamSprints.find(s => s.sprintId === task.sprintId);
              const current = sprintsMap.get(task.sprintId) || { sp: 0, tasks: [] };
              
              // Считаем SP только для задач без doneDate ИЛИ с doneDate внутри дат спринта
              let countSP = false;
              if (sprintInfo) {
                if (!task.doneDate) {
                  countSP = true;
                } else {
                  const sprintStartTime = new Date(sprintInfo.startDate).getTime();
                  const sprintEndTime = new Date(sprintInfo.finishDate).getTime();
                  const taskDoneTime = new Date(task.doneDate).getTime();
                  countSP = taskDoneTime >= sprintStartTime && taskDoneTime <= sprintEndTime;
                }
              }
              
              if (countSP) {
                current.sp += task.size;
              }
              
              current.tasks.push({
                id: task.id,
                cardId: task.cardId,
                title: task.title,
                type: task.type,
                size: task.size,
                state: task.state,
                condition: task.condition,
                archived: task.archived,
                doneDate: task.doneDate
              });
              sprintsMap.set(task.sprintId, current);
            }
          });

          const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
            sprint_id,
            sp: data.sp,
            tasks: data.tasks
          }));

          return {
            ...initiative,
            sprints,
            involvement: null
          };
        });

        // Фильтруем инициативы (с задачами, поддержка бизнеса, или в очереди)
        const filteredInitiatives = initiativesWithSprints.filter(init => {
          const hasSprints = init.sprints.length > 0;
          const isSupport = init.cardId === 0;
          const isQueued = init.state === "1-queued";
          return hasSprints || isSupport || isQueued;
        });

        // Рассчитываем involvement для реальных спринтов
        const sprintPeriods = new Map(
          teamSprints.map(s => [s.sprintId, { 
            startDate: new Date(s.startDate),
            finishDate: new Date(s.finishDate)
          }])
        );
        
        const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);

        res.json({ initiatives: initiativesWithInvolvement, sprints: teamSprints });
      } else {
        // РЕЖИМ: Виртуальные спринты (hasSprints === false)
        // Создаём виртуальные спринты на основе sprintDuration

        // Фильтруем задачи с doneDate (для виртуальных спринтов берём ВСЕ задачи с датой закрытия)
        const tasksForVirtual = initiativeTasks.filter(task => 
          task.doneDate !== null && 
          task.doneDate !== ''
        );


        if (tasksForVirtual.length === 0) {
          // Нет задач - возвращаем пустые спринты
          const initiativesWithEmpty = initiatives.map(init => ({
            ...init,
            sprints: [],
            involvement: null
          }));
          return res.json({ initiatives: initiativesWithEmpty, sprints: [] });
        }

        // Создаём виртуальные спринты
        const sortedTasks = tasksForVirtual.sort((a, b) => {
          const dateA = new Date(a.doneDate!);
          const dateB = new Date(b.doneDate!);
          return dateA.getTime() - dateB.getTime();
        });

        const firstDate = new Date(sortedTasks[0].doneDate!);
        const lastDate = new Date(sortedTasks[sortedTasks.length - 1].doneDate!);

        const virtualSprints: any[] = [];
        const virtualSprintTasksMap = new Map<number, any[]>();
        let currentStartDate = new Date(firstDate);
        let sprintNumber = 1;

        while (currentStartDate <= lastDate) {
          const currentEndDate = new Date(currentStartDate);
          currentEndDate.setDate(currentEndDate.getDate() + sprintDuration - 1);

          const sprintTasks = sortedTasks.filter(task => {
            const taskDate = new Date(task.doneDate!);
            return taskDate >= currentStartDate && taskDate <= currentEndDate;
          });

          if (sprintTasks.length > 0) {
            const totalSp = sprintTasks.reduce((sum, task) => sum + task.size, 0);
            const virtualSprintId = -(sprintNumber);

            virtualSprints.push({
              sprintId: virtualSprintId,
              boardId: initBoardId,
              title: `Период ${sprintNumber}`,
              velocity: totalSp,
              startDate: currentStartDate.toISOString(),
              finishDate: currentEndDate.toISOString(),
              actualFinishDate: currentEndDate.toISOString(),
              goal: `Задачи завершенные с ${currentStartDate.toLocaleDateString('ru-RU')} по ${currentEndDate.toLocaleDateString('ru-RU')}`,
              isVirtual: true
            });

            virtualSprintTasksMap.set(virtualSprintId, sprintTasks);
          }

          currentStartDate = new Date(currentEndDate);
          currentStartDate.setDate(currentStartDate.getDate() + 1);
          sprintNumber++;
        }


        // Группируем задачи по инициативам и виртуальным спринтам
        const initiativesWithSprints = initiatives.map(initiative => {
          const sprintsMap = new Map<number, { sp: number; tasks: any[] }>();
          
          virtualSprintTasksMap.forEach((tasks, virtualSprintId) => {
            const tasksForInit = tasks.filter(task => task.initCardId === initiative.cardId);
            if (tasksForInit.length > 0) {
              const sp = tasksForInit.reduce((sum, task) => sum + task.size, 0);
              sprintsMap.set(virtualSprintId, {
                sp,
                tasks: tasksForInit.map(task => ({
                  id: task.id,
                  cardId: task.cardId,
                  title: task.title,
                  type: task.type,
                  size: task.size,
                  archived: task.archived,
                  doneDate: task.doneDate
                }))
              });
            }
          });

          const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
            sprint_id,
            sp: data.sp,
            tasks: data.tasks
          }));

          return {
            ...initiative,
            sprints,
            involvement: null
          };
        });

        // Фильтруем инициативы (с задачами, поддержка бизнеса, или в очереди)
        const filteredInitiatives = initiativesWithSprints.filter(init => {
          const hasSprints = init.sprints.length > 0;
          const isSupport = init.cardId === 0;
          const isQueued = init.state === "1-queued";
          return hasSprints || isSupport || isQueued;
        });

        // Рассчитываем involvement для виртуальных спринтов
        const sprintPeriods = new Map(
          virtualSprints.map(s => [s.sprintId, { 
            startDate: new Date(s.startDate),
            finishDate: new Date(s.finishDate)
          }])
        );
        
        const initiativesWithInvolvement = calculateInitiativesInvolvement(filteredInitiatives, sprintPeriods);

        res.json({ initiatives: initiativesWithInvolvement, sprints: virtualSprints });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve timeline data" 
      });
    }
  });

  app.get("/api/initiatives/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const initiative = await storage.getInitiative(id);
      if (!initiative) {
        return res.status(404).json({ 
          success: false, 
          error: "Initiative not found" 
        });
      }
      res.json(initiative);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve initiative" 
      });
    }
  });

  app.post("/api/initiatives", async (req, res) => {
    try {
      const validatedData = insertInitiativeSchema.parse(req.body);
      const initiative = await storage.createInitiative(validatedData);
      res.status(201).json(initiative);
    } catch (error) {
      
      // Check if it's a validation error
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      // Server error
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/initiatives/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate that body is not empty
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Request body cannot be empty" 
        });
      }
      
      const validatedData = insertInitiativeSchema.partial().parse(req.body);
      
      // Validate that at least one field is provided after parsing
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one field must be provided for update" 
        });
      }
      
      const initiative = await storage.updateInitiative(id, validatedData);
      
      if (!initiative) {
        return res.status(404).json({ 
          success: false, 
          error: "Initiative not found" 
        });
      }
      
      res.json(initiative);
    } catch (error) {
      
      // Check if it's a validation error
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      // Server error
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.delete("/api/initiatives/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteInitiative(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to delete initiative" 
      });
    }
  });

  // Sprints endpoints
  app.get("/api/sprints", async (req, res) => {
    try {
      const sprints = await storage.getAllSprints();
      res.json(sprints);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprints" 
      });
    }
  });

  app.get("/api/sprints/board/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }
      const sprints = await storage.getSprintsByBoardId(boardId);
      res.json(sprints);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprints" 
      });
    }
  });

  app.get("/api/sprints/:sprintId", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }
      const sprint = await storage.getSprint(sprintId);
      if (!sprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found" 
        });
      }
      res.json(sprint);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint" 
      });
    }
  });

  app.get("/api/sprints/:sprintId/preview", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      const kaitenSprint = await kaitenClient.getSprint(sprintId);
      if (!kaitenSprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found in Kaiten" 
        });
      }

      const sprint = {
        sprintId: kaitenSprint.id,
        boardId: kaitenSprint.board_id,
        title: kaitenSprint.title,
        velocity: kaitenSprint.velocity || 0,
        startDate: kaitenSprint.start_date,
        finishDate: kaitenSprint.finish_date,
        actualFinishDate: kaitenSprint.actual_finish_date || null,
        goal: kaitenSprint.goal || null,
      };

      const tasks: any[] = [];
      
      if (kaitenSprint.cards && Array.isArray(kaitenSprint.cards)) {
        for (const sprintCard of kaitenSprint.cards) {
          try {
            const card = await kaitenClient.getCard(sprintCard.id);
            
            if (card.condition === 3) {
              continue;
            }

            let initCardId = 0;
            let initiativeTitle = null;
            if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
              try {
                initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
                if (initCardId > 0) {
                  const initiative = await storage.getInitiative(initCardId.toString());
                  if (!initiative) {
                    const initiativeCard = await kaitenClient.getCard(initCardId);
                    initiativeTitle = initiativeCard.title;
                  } else {
                    initiativeTitle = initiative.title;
                  }
                }
              } catch (parentError) {
                console.error(`[Sprint Preview] Error finding initiative for card ${sprintCard.id}:`, parentError);
              }
            }

            tasks.push({
              id: card.id.toString(),
              cardId: card.id,
              title: card.title,
              size: card.size || 0,
              state: card.state === 3 ? "3-done" : (card.state === 2 ? "2-inProgress" : "1-queued"),
              initiativeCardId: initCardId,
              initiativeTitle: initiativeTitle,
              doneDate: card.last_moved_to_done_at || null,
              condition: card.condition,
            } as any);
          } catch (cardError) {
            console.error(`[Sprint Preview] Error processing card ${sprintCard.id}:`, cardError);
          }
        }
      }

      const sprintEndDate = kaitenSprint.actual_finish_date || kaitenSprint.finish_date;
      const sprintStartDate = kaitenSprint.start_date;
      const sprintEndTime = new Date(sprintEndDate).getTime();
      const sprintStartTime = new Date(sprintStartDate).getTime();

      // tasksInside = задачи без doneDate ИЛИ задачи с doneDate внутри дат спринта (кроме deleted)
      const tasksInside = tasks.filter(task => {
        const condition = (task as any).condition;
        // Исключаем только deleted(3)
        if (condition === 3) return false;
        
        // Если нет doneDate - включаем (queued/inProgress)
        if (!task.doneDate) return true;
        
        // Если doneDate внутри дат спринта - включаем
        const taskTime = new Date(task.doneDate).getTime();
        return taskTime >= sprintStartTime && taskTime <= sprintEndTime;
      });

      // tasksOutside = задачи с doneDate вне дат спринта
      const tasksOutside = tasks.filter(task => {
        // No need to filter by condition - all tasks saved are non-deleted
        
        // Если нет doneDate - не считаем вне спринта
        if (!task.doneDate) return false;
        
        // Если doneDate вне дат спринта - включаем
        const taskTime = new Date(task.doneDate).getTime();
        return taskTime < sprintStartTime || taskTime > sprintEndTime;
      });

      // СПД = Done SP (в даты спринта) / Total SP (всех планируемых без deleted)
      let totalSP = 0;
      let doneSP = 0;
      
      // Всего SP = ВСЕ задачи (все уже сохраненные задачи - deleted исключены при сохранении)
      tasks.forEach(task => {
        totalSP += task.size || 0;
      });
      
      // Done SP = только done задачи с doneDate внутри дат спринта
      tasksInside.forEach(task => {
        if (task.state === "3-done" && task.condition !== '3 - deleted') {
          doneSP += task.size || 0;
        }
      });

      const deliveryPlanCompliance = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;

      // Velocity = количество done SP задач
      sprint.velocity = doneSP;

      res.json({
        sprint,
        tasks: tasksInside,
        tasksOutside: tasksOutside,
        stats: {
          totalSP,
          doneSP,
          deliveryPlanCompliance,
        },
      });
    } catch (error) {
      console.error(`[Sprint Preview] Error retrieving sprint ${sprintId}:`, error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint preview from Kaiten",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/sprints/:sprintId/info", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      const sprint = await storage.getSprint(sprintId);
      if (!sprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found" 
        });
      }

      const allSprintTasks = await storage.getTasksBySprint(sprintId);
      
      // Разделяем задачи на две группы
      const sprintEndDate = sprint.actualFinishDate || sprint.finishDate;
      const sprintStartDate = sprint.startDate;
      const sprintEndTime = sprintEndDate ? new Date(sprintEndDate).getTime() : Date.now();
      const sprintStartTime = sprintStartDate ? new Date(sprintStartDate).getTime() : 0;
      
      const tasksInside: any[] = [];
      const tasksOutside: any[] = [];
      
      for (const task of allSprintTasks) {
        const taskInfo = {
          id: task.id,
          cardId: task.cardId,
          title: task.title,
          size: task.size,
          state: task.state,
          initiativeCardId: task.initCardId,
          doneDate: task.doneDate,
        };
        
        if (!task.doneDate) {
          tasksInside.push(taskInfo);
        } else {
          const taskDoneTime = new Date(task.doneDate).getTime();
          if (taskDoneTime >= sprintStartTime && taskDoneTime <= sprintEndTime) {
            tasksInside.push(taskInfo);
          } else {
            tasksOutside.push(taskInfo);
          }
        }
      }
      
      // СПД = Done SP (в даты спринта) / Total SP (всех планируемых)
      let totalSP = 0;
      let doneSP = 0;
      
      // Всего SP = ВСЕ задачи
      allSprintTasks.forEach(task => {
        totalSP += task.size || 0;
      });
      
      // Done SP = только done задачи с doneDate внутри дат спринта
      tasksInside.forEach(task => {
        if (task.state === '3-done' && task.condition !== '3 - deleted') {
          doneSP += task.size || 0;
        }
      });
      
      // СПД = Done SP / Total SP
      const deliveryPlanCompliance = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
      
      res.json({
        sprint,
        tasks: tasksInside,
        tasksOutside: tasksOutside,
        stats: {
          totalSP,
          doneSP,
          deliveryPlanCompliance,
        },
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint info" 
      });
    }
  });

  app.get("/api/sprints/:sprintId/stats", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      // Получаем спринт из БД
      const sprint = await storage.getSprint(sprintId);
      if (!sprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found in database" 
        });
      }

      // Получаем все задачи спринта из БД
      const tasks = await storage.getTasksBySprint(sprintId);
      
      
      // Подсчитываем статистику
      let totalSP = 0;
      let doneSP = 0;
      
      tasks.forEach(task => {
        const taskSize = task.size || 0;
        totalSP += taskSize;
        const isDone = task.state === '3-done' && task.condition !== '3 - deleted';
        if (isDone) {
          doneSP += taskSize;
        }
      });
      
      const deliveryPlanCompliance = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
      
      
      res.json({
        success: true,
        stats: {
          totalSP,
          doneSP,
          deliveryPlanCompliance,
        },
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint stats" 
      });
    }
  });

  app.post("/api/sprints/:sprintId/save", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      const kaitenSprint = await kaitenClient.getSprint(sprintId);
      
      if (!kaitenSprint) {
        return res.status(404).json({ 
          success: false, 
          error: "Sprint not found in Kaiten" 
        });
      }

      
      // Валидируем обязательные поля
      if (!kaitenSprint.board_id || !kaitenSprint.start_date || !kaitenSprint.finish_date) {
        return res.status(400).json({
          success: false,
          error: "Sprint is missing required fields (board_id, start_date, or finish_date)"
        });
      }

      // Проверяем наличие команды ДО сохранения спринта
      const team = await storage.getTeamBySprintBoardId(kaitenSprint.board_id);
      if (!team) {
        return res.status(400).json({
          success: false,
          error: `Team with sprint board ID ${kaitenSprint.board_id} not found. Please create a team with this sprint board ID first.`
        });
      }

      const teamId = team.teamId;

      // Сохраняем спринт
      await storage.syncSprintFromKaiten(
        kaitenSprint.id,
        kaitenSprint.board_id,
        kaitenSprint.title,
        kaitenSprint.velocity || 0,
        kaitenSprint.start_date,
        kaitenSprint.finish_date,
        kaitenSprint.actual_finish_date || null,
        kaitenSprint.goal || null
      );

      // Удаляем все старые задачи этого спринта перед синхронизацией новых
      await storage.deleteTasksForSprint(sprintId);

      let tasksSaved = 0;
      const errors: string[] = [];
      
      if (kaitenSprint.cards && Array.isArray(kaitenSprint.cards)) {
        
        // Параллельно получаем все карточки
        const cardPromises = kaitenSprint.cards.map(sprintCard => 
          kaitenClient.getCard(sprintCard.id).catch(err => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            errors.push(`Card ${sprintCard.id}: ${errorMessage}`);
            return null;
          })
        );
        
        const cards = await Promise.all(cardPromises);
        
        // Сохраняем все задачи (независимо от статуса)
        const validCards = cards.filter(c => c !== null);
        
        // Сохраняем все карточки
        for (const card of validCards) {
          try {
            // Пропускаем удаленные карточки (condition === 3)
            if (card.condition === 3) {
              continue;
            }
            
            // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
            let initCardId = 0;
            if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
              const parentCardId = card.parents_ids[0];
              initCardId = await findInitiativeInParentChain(parentCardId);
              
              if (initCardId !== 0) {
              } else {
              }
            } else {
            }

            // Преобразуем state и condition из number в строку с валидацией
            let stateStr: "1-queued" | "2-inProgress" | "3-done" = "1-queued";
            if (card.state === 1) stateStr = "1-queued";
            else if (card.state === 2) stateStr = "2-inProgress";
            else if (card.state === 3) stateStr = "3-done";
            else {
            }

            let conditionStr: "1-live" | "2-archived" = "1-live";
            if (card.condition === 1) conditionStr = "1-live";
            else if (card.condition === 2) conditionStr = "2-archived";
            else {
            }

            // Сохраняем задачу
            await storage.syncTaskFromKaiten(
              card.id,
              card.board_id,
              card.title,
              card.created || new Date().toISOString(),
              stateStr,
              card.size || 0,
              conditionStr,
              card.archived || false,
              initCardId,
              card.type?.name,
              card.completed_at || undefined,
              sprintId,
              card.last_moved_to_done_at || null,  // Используем last_moved_to_done_at для doneDate
              teamId
            );

            tasksSaved++;
          } catch (cardError) {
            const errorMessage = cardError instanceof Error ? cardError.message : String(cardError);
            errors.push(`Card ${card.id}: ${errorMessage}`);
          }
        }
      }

      if (errors.length > 0) {
      }
      
      res.json({
        success: true,
        sprint: {
          sprintId: kaitenSprint.id,
          title: kaitenSprint.title,
        },
        tasksSaved,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to save sprint to database" 
      });
    }
  });

  // Tasks endpoints
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve tasks" 
      });
    }
  });

  app.get("/api/tasks/board/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }
      const tasks = await storage.getTasksByBoardId(boardId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve tasks" 
      });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.getTask(id);
      if (!task) {
        return res.status(404).json({ 
          success: false, 
          error: "Task not found" 
        });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve task" 
        });
    }
  });

  app.get("/api/tasks/grouped/:initBoardId/:sprintDuration", async (req, res) => {
    try {
      const initBoardId = parseInt(req.params.initBoardId);
      const sprintDuration = parseInt(req.params.sprintDuration);
      
      if (isNaN(initBoardId) || isNaN(sprintDuration)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID or sprint duration" 
        });
      }


      // Получаем все задачи без sprintId для этой доски
      const allTasks = await storage.getAllTasks();
      const initiativeTasks = allTasks.filter(task => 
        task.sprintId === null && 
        task.doneDate !== null && 
        task.doneDate !== ''
      );


      if (initiativeTasks.length === 0) {
        return res.json([]);
      }

      // Сортируем по дате закрытия
      const sortedTasks = initiativeTasks.sort((a, b) => {
        const dateA = new Date(a.doneDate!);
        const dateB = new Date(b.doneDate!);
        return dateA.getTime() - dateB.getTime();
      });

      // Определяем первую и последнюю дату
      const firstDate = new Date(sortedTasks[0].doneDate!);
      const lastDate = new Date(sortedTasks[sortedTasks.length - 1].doneDate!);

      // Создаем интервалы (виртуальные спринты)
      const virtualSprints: any[] = [];
      let currentStartDate = new Date(firstDate);
      let sprintNumber = 1;

      while (currentStartDate <= lastDate) {
        const currentEndDate = new Date(currentStartDate);
        currentEndDate.setDate(currentEndDate.getDate() + sprintDuration - 1);

        // Получаем задачи для этого интервала
        const sprintTasks = sortedTasks.filter(task => {
          const taskDate = new Date(task.doneDate!);
          return taskDate >= currentStartDate && taskDate <= currentEndDate;
        });

        if (sprintTasks.length > 0) {
          const totalSp = sprintTasks.reduce((sum, task) => sum + task.size, 0);

          virtualSprints.push({
            sprintId: -(sprintNumber), // Отрицательный ID для виртуальных спринтов
            boardId: initBoardId,
            title: `Период ${sprintNumber}`,
            velocity: totalSp,
            startDate: currentStartDate.toISOString(),
            finishDate: currentEndDate.toISOString(),
            actualFinishDate: currentEndDate.toISOString(),
            goal: `Задачи завершенные с ${currentStartDate.toLocaleDateString('ru-RU')} по ${currentEndDate.toLocaleDateString('ru-RU')}`,
            isVirtual: true
          });
        }

        // Переходим к следующему интервалу
        currentStartDate = new Date(currentEndDate);
        currentStartDate.setDate(currentStartDate.getDate() + 1);
        sprintNumber++;
      }


      res.json(virtualSprints);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve grouped tasks" 
      });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);
      res.status(201).json(task);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Request body cannot be empty" 
        });
      }
      
      const validatedData = insertTaskSchema.partial().parse(req.body);
      
      if (Object.keys(validatedData).length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one field must be provided for update" 
        });
      }
      
      const task = await storage.updateTask(id, validatedData);
      
      if (!task) {
        return res.status(404).json({ 
          success: false, 
          error: "Task not found" 
        });
      }
      
      res.json(task);
    } catch (error) {
      
      if (error instanceof Error && error.name === 'ZodError') {
        return res.status(400).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTask(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to delete task" 
      });
    }
  });

  app.post("/api/kaiten/sync-board/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }

      
      const allCards = await kaitenClient.getCardsFromBoard(boardId);
      
      // Фильтруем: сохраняем только неархивные инициативы
      const cards = allCards.filter(card => !card.archived);
      

      const syncedInitiatives = [];
      const syncedCardIds: number[] = [];
      const plannedValueId = "id_237";
      const factValueId = "id_238";
      
      for (const card of cards) {
        let state: "1-queued" | "2-inProgress" | "3-done";
        
        // Basic Kaiten state mapping (can be extended for more states)
        // state 1 = queued, state 2 = in progress, state 3 = done
        // TODO: Add configurable mapping for custom Kaiten workflow states
        if (card.state === 3) {
          state = "3-done";
        } else if (card.state === 2) {
          state = "2-inProgress";
        } else {
          state = "1-queued";
        }
        
        const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";

        
        // Логируем всю структуру properties для диагностики
        
        // Получаем plannedValue из properties по ключу plannedValueId
        const rawPlanned = card.properties?.[plannedValueId];
        const plannedValue = rawPlanned == null ? undefined : String(rawPlanned);
        
        // log(`[Kaiten Sync] Card ${card.id} - raw plannedValue from properties[${plannedValueId}]:`, rawPlanned);
        // log(`[Kaiten Sync] Card ${card.id} - plannedValue (converted to string):`, plannedValue);
        
        // Получаем factValue из properties по ключу factValueId
        const rawFact = card.properties?.[factValueId];
        const factValue = rawFact == null ? undefined : String(rawFact);
        
        // log(`[Kaiten Sync] Card ${card.id} - raw factValue from properties[${factValueId}]:`, rawFact);
        // log(`[Kaiten Sync] Card ${card.id} - factValue (converted to string):`, factValue);
        
        // Логируем даты для отладки

        const synced = await storage.syncInitiativeFromKaiten(
          card.id,
          boardId,
          card.title,
          state,
          condition,
          card.size || 0,
          card.type?.name,
          plannedValueId,
          plannedValue,
          factValueId,
          factValue,
          card.due_date || null,
          card.last_moved_to_done_at || null
        );
        
        syncedInitiatives.push(synced);
        syncedCardIds.push(card.id);
      }

      // Архивируем инициативы, которых больше нет на доске
      await storage.archiveInitiativesNotInList(boardId, syncedCardIds);

      
      // Для инициатив типа Compliance и Enabler автоматически проставляем planned_value = planned_cost и fact_value = fact_cost
      const allTeams = await storage.getAllTeams();
      const relevantTeams = allTeams.filter(team => team.initBoardId === boardId);
      
      if (relevantTeams.length > 0) {
        // Используем первую команду для расчета cost (если несколько команд работают с одной доской)
        const team = relevantTeams[0];
        const spPrice = team.spPrice || 0;
        
        
        for (const initiative of syncedInitiatives) {
          if (initiative.type === 'Compliance' || initiative.type === 'Enabler') {
            // Рассчитываем planned_cost
            const plannedCost = initiative.size * spPrice;
            
            // Получаем фактические задачи для расчета fact_cost
            const tasks = await storage.getTasksByInitCardId(initiative.cardId);
            const actualSize = tasks.reduce((sum, task) => sum + task.size, 0);
            const factCost = actualSize * spPrice;
            
            // log(`[Kaiten Sync] Updating initiative ${initiative.cardId} "${initiative.title}" (${initiative.type}): planned_cost=${plannedCost}, fact_cost=${factCost}`);
            
            // Обновляем planned_value и fact_value
            await storage.updateInitiative(initiative.id, {
              plannedValue: String(plannedCost),
              factValue: String(factCost)
            });
          }
        }
      }
      
      res.json({
        success: true,
        count: syncedInitiatives.length,
        initiatives: syncedInitiatives
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync initiatives from Kaiten" 
      });
    }
  });

  app.post("/api/kaiten/sync-tasks/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }

      
      // Lookup team by initBoardId
      const team = await storage.getTeamByInitBoardId(boardId);
      if (!team) {
        return res.status(404).json({
          success: false,
          error: `No team found with initBoardId=${boardId}`
        });
      }
      
      // Step 1: Get list of cards from board
      const boardCards = await kaitenClient.getCardsFromBoard(boardId);

      const syncedTasks = [];
      
      // Step 2: Fetch each card individually to get parents_ids
      for (const boardCard of boardCards) {
        const card = await kaitenClient.getCard(boardCard.id);
        
        // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
        let initCardId = 0; // По умолчанию - "Поддержка бизнеса"
        if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
          initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
        }
        
        // Синхронизируем таски с state === 3 (done)
        if (card.state === 3) {
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          
          if (card.state === 3) {
            state = "3-done";
          } else if (card.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";


          const synced = await storage.syncTaskFromKaiten(
            card.id,
            boardId,
            card.title,
            card.created || new Date().toISOString(),
            state,
            card.size || 0,
            condition,
            card.archived || false, // archived status from Kaiten
            initCardId, // parent card_id from parents_ids
            card.type?.name,
            card.completed_at ?? undefined,
            card.sprint_id ?? null, // sprint_id from Kaiten
            card.last_moved_to_done_at ?? null,
            team.teamId
          );
          
          syncedTasks.push(synced);
        }
      }

      
      res.json({
        success: true,
        count: syncedTasks.length,
        tasks: syncedTasks
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync tasks from Kaiten" 
      });
    }
  });

  app.post("/api/kaiten/update-sprint/:sprintId", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      
      // Получаем данные спринта из Kaiten
      const sprint = await kaitenClient.getSprint(sprintId);
      
      if (!sprint.cards || !Array.isArray(sprint.cards)) {
        return res.json({
          success: true,
          updated: 0,
          message: "No cards found in sprint"
        });
      }

      
      // Получаем все tasks из базы данных
      const allTasks = await storage.getAllTasks();
      
      // Создаем Set с card_id из спринта для быстрого поиска
      const sprintCardIds = new Set(sprint.cards.map(card => card.id));
      
      let updatedCount = 0;
      
      // Обновляем sprint_id для tasks, у которых card_id совпадает с card_id из спринта
      for (const task of allTasks) {
        if (sprintCardIds.has(task.cardId)) {
          
          await storage.updateTask(task.id, { sprintId });
          updatedCount++;
        }
      }

      
      res.json({
        success: true,
        updated: updatedCount,
        sprintId,
        totalCardsInSprint: sprint.cards.length,
        totalTasksInDb: allTasks.length
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update sprint info" 
      });
    }
  });

  app.patch("/api/kaiten/update-initiative/:cardId", async (req, res) => {
    try {
      const cardId = parseInt(req.params.cardId);
      if (isNaN(cardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid card ID" 
        });
      }

      const { size, plannedValue, factValue } = req.body;
      
      
      // Подготовка обновлений для Kaiten
      const kaitenUpdates: { size?: number; properties?: Record<string, any> } = {};
      
      if (size !== undefined) {
        kaitenUpdates.size = parseInt(String(size));
      }
      
      // Обновляем properties если есть plannedValue или factValue
      if (plannedValue !== undefined || factValue !== undefined) {
        kaitenUpdates.properties = {};
        
        const plannedValueId = "id_237";
        const factValueId = "id_238";
        
        if (plannedValue !== undefined) {
          // Kaiten expects numeric values for custom properties
          kaitenUpdates.properties[plannedValueId] = plannedValue === null || plannedValue === '' ? null : parseFloat(String(plannedValue));
        }
        
        if (factValue !== undefined) {
          // Kaiten expects numeric values for custom properties
          kaitenUpdates.properties[factValueId] = factValue === null || factValue === '' ? null : parseFloat(String(factValue));
        }
      }
      
      
      // Обновляем в Kaiten
      await kaitenClient.updateCard(cardId, kaitenUpdates);
      
      // Подготовка обновлений для БД
      const dbUpdates: any = {};
      
      if (size !== undefined) {
        dbUpdates.size = parseInt(String(size));
      }
      
      if (plannedValue !== undefined) {
        dbUpdates.plannedValue = plannedValue === null || plannedValue === '' ? null : String(plannedValue);
      }
      
      if (factValue !== undefined) {
        dbUpdates.factValue = factValue === null || factValue === '' ? null : String(factValue);
      }
      
      
      // Находим инициативу в БД по cardId
      const initiative = await storage.getInitiativeByCardId(cardId);
      
      if (!initiative) {
        return res.status(404).json({ 
          success: false, 
          error: "Initiative not found in database" 
        });
      }
      
      // Обновляем в БД
      const updated = await storage.updateInitiative(initiative.id, dbUpdates);
      
      
      res.json({
        success: true,
        initiative: updated
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update initiative" 
      });
    }
  });

  app.post("/api/kaiten/sync-sprint/:sprintId", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      
      // Получаем данные спринта из Kaiten
      const sprint = await kaitenClient.getSprint(sprintId);
      
      if (!sprint.cards || !Array.isArray(sprint.cards)) {
        return res.json({
          success: true,
          synced: 0,
          message: "No cards found in sprint"
        });
      }

      
      // Lookup team once before processing cards
      const dbSprint = await storage.getSprint(sprintId);
      if (!dbSprint) {
        throw new Error(`Sprint ${sprintId} not found in database`);
      }
      const team = await storage.getTeamBySprintBoardId(dbSprint.boardId);
      if (!team) {
        throw new Error(`No team found for sprint board ${dbSprint.boardId}`);
      }
      
      const syncedTasks = [];
      
      // Создаем записи в tasks для каждой карточки из спринта
      for (const sprintCard of sprint.cards) {
        // Получаем детальную информацию по карточке чтобы получить parents_ids
        const card = await kaitenClient.getCard(sprintCard.id);
        
        // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
        let initCardId: number | null = null;
        
        if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
          const parentCardId = card.parents_ids[0];
          
          // Ищем инициативу в родительской цепочке
          initCardId = await findInitiativeInParentChain(parentCardId);
          
          if (initCardId !== 0) {
          } else {
          }
        } else {
          initCardId = 0;
        }
        
        let state: "1-queued" | "2-inProgress" | "3-done";
        
        if (card.state === 3) {
          state = "3-done";
        } else if (card.state === 2) {
          state = "2-inProgress";
        } else {
          state = "1-queued";
        }
        
        const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";


        const synced = await storage.syncTaskFromKaiten(
          card.id,
          card.board_id,
          card.title,
          card.created || new Date().toISOString(),
          state,
          card.size || 0,
          condition,
          card.archived || false,
          initCardId,
          card.type?.name,
          card.completed_at ?? undefined,
          sprintId,
          card.last_moved_to_done_at ?? null,
          team.teamId
        );
        
        syncedTasks.push(synced);
      }

      
      res.json({
        success: true,
        synced: syncedTasks.length,
        sprintId,
        tasks: syncedTasks
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync sprint" 
      });
    }
  });

  app.post("/api/kaiten/sync-sprints/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }

      
      // Получаем все спринты с доски из Kaiten
      const kaitenSprints = await kaitenClient.getSprintsFromBoard(boardId);

      const syncedSprints = [];
      let tasksSynced = 0;
      
      for (const kaitenSprint of kaitenSprints) {
        // Получаем детальную информацию о спринте
        const sprintDetails = await kaitenClient.getSprint(kaitenSprint.id);
        
        
        // Синхронизируем спринт
        const synced = await storage.syncSprintFromKaiten(
          sprintDetails.id,
          boardId,
          sprintDetails.title || `Sprint ${sprintDetails.id}`,
          sprintDetails.velocity || 0,
          sprintDetails.start_date || new Date().toISOString(),
          sprintDetails.finish_date || new Date().toISOString(),
          sprintDetails.actual_finish_date || null,
          sprintDetails.goal || null
        );
        
        syncedSprints.push(synced);
        
        // Синхронизируем задачи спринта
        if (sprintDetails.cards && Array.isArray(sprintDetails.cards)) {
          for (const sprintCard of sprintDetails.cards) {
            try {
              const card = await kaitenClient.getCard(sprintCard.id);
              
              // Пропускаем удаленные карточки (condition === 3)
              if (card.condition === 3) {
                continue;
              }
              
              // Ищем инициативу в родительской цепочке
              let initCardId: number | null = null;
              
              if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
              } else {
                initCardId = 0;
              }
              
              let state: "1-queued" | "2-inProgress" | "3-done";
              if (card.state === 3) {
                state = "3-done";
              } else if (card.state === 2) {
                state = "2-inProgress";
              } else {
                state = "1-queued";
              }
              
              const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
              
              // Получаем team по board_id для team_id
              const team = await storage.getTeamBySprintBoardId(boardId);
              const teamId = team?.teamId || null;
              
              await storage.syncTaskFromKaiten(
                card.id,
                card.board_id,
                card.title,
                card.created || new Date().toISOString(),
                state,
                card.size || 0,
                condition,
                card.archived || false,
                initCardId,
                card.type?.name,
                card.completed_at ?? undefined,
                sprintDetails.id,
                card.last_moved_to_done_at ?? null,
                teamId
              );
              
              tasksSynced++;
            } catch (taskError) {
              console.error(`Error syncing task ${sprintCard.id}:`, taskError instanceof Error ? taskError.message : String(taskError));
            }
          }
        }
      }

      
      res.json({
        success: true,
        count: syncedSprints.length,
        sprints: syncedSprints,
        tasksSynced
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync sprints from Kaiten" 
      });
    }
  });

  app.post("/api/kaiten/sync-initiative-tasks/:initBoardId", async (req, res) => {
    try {
      const initBoardId = parseInt(req.params.initBoardId);
      if (isNaN(initBoardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid initiative board ID" 
        });
      }

      
      // Получаем начало текущего года
      const currentYear = new Date().getFullYear();
      const yearStart = new Date(currentYear, 0, 1).toISOString();
      
      
      // Получаем все задачи с фильтром по дате
      const tasks = await kaitenClient.getCardsWithDateFilter({
        boardId: initBoardId,
        lastMovedToDoneAtAfter: yearStart,
        limit: 1000
      });
      
      
      let totalTasksSynced = 0;
      const syncedTasks = [];
      
      // Сохраняем каждую задачу
      for (const taskCard of tasks) {
        try {
          // Ищем инициативу в родительской цепочке (поддержка многоуровневой вложенности)
          let initCardId = 0;
          if (taskCard.parents_ids && Array.isArray(taskCard.parents_ids) && taskCard.parents_ids.length > 0) {
            const parentId = taskCard.parents_ids[0];
            initCardId = await findInitiativeInParentChain(parentId);
            
            if (initCardId !== 0) {
            } else {
            }
          } else {
          }
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          if (taskCard.state === 3) {
            state = "3-done";
          } else if (taskCard.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          const condition: "1-live" | "2-archived" = taskCard.archived ? "2-archived" : "1-live";
          
          // Lookup team by initBoardId
          const team = await storage.getTeamByInitBoardId(initBoardId);
          if (!team) {
            throw new Error(`No team found for init board ${initBoardId}`);
          }

          const synced = await storage.syncTaskFromKaiten(
            taskCard.id,
            taskCard.board_id,
            taskCard.title,
            taskCard.created || new Date().toISOString(),
            state,
            taskCard.size || 0,
            condition,
            taskCard.archived || false,
            initCardId,
            taskCard.type?.name,
            taskCard.completed_at ?? undefined,
            null,
            taskCard.last_moved_to_done_at,
            team.teamId
          );
          
          syncedTasks.push(synced);
          totalTasksSynced++;
        } catch (taskError: unknown) {
          const errorMessage = taskError instanceof Error ? taskError.message : String(taskError);
        }
      }
      
      
      res.json({
        success: true,
        synced: totalTasksSynced,
        tasks: syncedTasks
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync initiative tasks" 
      });
    }
  });

  app.post("/api/kaiten/smart-sync/:teamId", async (req, res) => {
    try {
      const teamId = req.params.teamId;
      console.log(`\n[SMART-SYNC START] Syncing team ${teamId}`);
      
      // Получаем команду
      const team = await storage.getTeamById(teamId);
      console.log(`[SMART-SYNC] Team found: ${team?.teamName}`);
      if (!team) {
        return res.status(404).json({
          success: false,
          error: `Team ${teamId} not found`
        });
      }
      
      
      // Шаг 1: Синхронизируем инициативы
      const allCards = await kaitenClient.getCardsFromBoard(team.initBoardId);
      
      // Фильтруем: сохраняем только неархивные инициативы
      const cardsToSync = allCards.filter(card => !card.archived);
      
      
      const plannedValueId = "id_237";
      const factValueId = "id_238";
      const syncedCardIds: number[] = [];
      
      let syncedCount = 0;
      for (const card of cardsToSync) {
        try {
          // Детальное логирование для отладки
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          if (card.state === 3) {
            state = "3-done";
          } else if (card.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          
          const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
          
          const plannedValueRaw = card.properties?.[plannedValueId];
          const factValueRaw = card.properties?.[factValueId];
          
          let plannedValue: number | null = null;
          if (plannedValueRaw !== undefined && plannedValueRaw !== null && plannedValueRaw !== "") {
            const parsed = parseFloat(String(plannedValueRaw));
            if (!isNaN(parsed)) {
              plannedValue = parsed;
            }
          }
          
          let factValue: number | null = null;
          if (factValueRaw !== undefined && factValueRaw !== null && factValueRaw !== "") {
            const parsed = parseFloat(String(factValueRaw));
            if (!isNaN(parsed)) {
              factValue = parsed;
            }
          }
          
          // Логируем дату для отладки
          if (card.last_moved_to_done_at) {
          }
          
          await storage.syncInitiativeFromKaiten(
            card.id,
            team.initBoardId,
            card.title,
            state,
            condition,
            card.size || 0,
            card.type?.name || null,
            plannedValueId,
            plannedValue !== null ? String(plannedValue) : null,
            factValueId,
            factValue !== null ? String(factValue) : null,
            card.due_date || null,
            card.last_moved_to_done_at || null
          );
          
          syncedCardIds.push(card.id);
          syncedCount++;
        } catch (error) {
        }
      }
      
      // Архивируем инициативы, которых больше нет на доске
      await storage.archiveInitiativesNotInList(team.initBoardId, syncedCardIds);
      console.log(`[SMART-SYNC] Initiatives synced: ${syncedCount}`);
      
      
      // Шаг 2: Синхронизируем все спринты из таблицы спринтов
      let tasksSynced = 0;
      
      console.log(`[SMART-SYNC] Checking for sprint board. hasSprints=${team.hasSprints}, sprintBoardId=${team.sprintBoardId}`);
      if (team.sprintBoardId) {
        console.log(`[SMART-SYNC] Getting all sprints from database for board ${team.sprintBoardId}`);
        
        // Получаем ВСЕ спринты для этой доски из БД
        const allSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
        console.log(`[SMART-SYNC] Found ${allSprints.length} sprints in database`);
        
        // Проходим по каждому спринту
        for (const dbSprint of allSprints) {
          try {
            console.log(`[SMART-SYNC] Processing sprint ${dbSprint.sprintId} (Kaiten ID: ${dbSprint.sprintId})`);
            
            // Получаем детали спринта из Kaiten
            const sprintDetails = await kaitenClient.getSprint(dbSprint.sprintId);
            console.log(`[SMART-SYNC] Sprint ${dbSprint.sprintId} has ${sprintDetails.cards?.length || 0} cards`);
            
            // Синхронизируем задачи этого спринта
            if (sprintDetails.cards && Array.isArray(sprintDetails.cards) && sprintDetails.cards.length > 0) {
              for (const sprintCard of sprintDetails.cards) {
                try {
                  const card = await kaitenClient.getCard(sprintCard.id);
                  
                  // Пропускаем удаленные карточки (condition === 3)
                  if (card.condition === 3) {
                    continue;
                  }
                  
                  // Ищем инициативу в родительской цепочке
                  let initCardId: number | null = null;
                  
                  if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                    initCardId = await findInitiativeInParentChain(card.parents_ids[0]);
                  } else {
                    initCardId = 0;
                  }
                  
                  let state: "1-queued" | "2-inProgress" | "3-done";
                  if (card.state === 3) {
                    state = "3-done";
                  } else if (card.state === 2) {
                    state = "2-inProgress";
                  } else {
                    state = "1-queued";
                  }
                  
                  const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";
                  
                  await storage.syncTaskFromKaiten(
                    card.id,
                    card.board_id,
                    card.title,
                    card.created || new Date().toISOString(),
                    state,
                    card.size || 0,
                    condition,
                    card.archived || false,
                    initCardId,
                    card.type?.name,
                    card.completed_at ?? undefined,
                    dbSprint.sprintId,
                    card.last_moved_to_done_at ?? null,
                    team.teamId
                  );
                  
                  tasksSynced++;
                } catch (taskError) {
                  console.error(`[SMART-SYNC] Error syncing task ${sprintCard.id}:`, taskError instanceof Error ? taskError.message : String(taskError));
                }
              }
            }
          } catch (sprintError) {
            const msg = sprintError instanceof Error ? sprintError.message : String(sprintError);
            console.error(`[SMART-SYNC] Error processing sprint ${dbSprint.sprintId}:`, msg);
          }
        }
        
        console.log(`[SMART-SYNC] Total tasks synced from all sprints: ${tasksSynced}`);
      } else {
        console.log(`[SMART-SYNC] No sprint board configured for this team`);
      }
      
      
      res.json({
        success: true,
        initiativesSynced: syncedCount,
        tasksSynced
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[SMART-SYNC] ERROR:`, errorMsg);
      if (error instanceof Error) {
        console.error(`[SMART-SYNC] Stack:`, error.stack);
      }
      res.status(500).json({ 
        success: false, 
        error: errorMsg
      });
    }
  });

  app.get("/api/metrics/innovation-rate", async (req, res) => {
    try {
      const teamIdsParam = req.query.teamIds as string;
      const yearParam = req.query.year as string;
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }


      // Получаем команды и департамент
      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);
      
      if (validTeams.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No valid teams found" 
        });
      }

      // Получаем департамент (все команды должны быть из одного департамента)
      const departmentId = validTeams[0].departmentId;
      const departments = await storage.getDepartments();
      const department = departments.find(d => d.id === departmentId);
      
      if (!department) {
        return res.status(404).json({ 
          success: false, 
          error: "Department not found" 
        });
      }

      // Фильтруем по году
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      
      // Получаем задачи из двух источников:
      // 1. Из реальных спринтов для команд со спринтами
      // 2. По doneDate для команд без спринтов
      const relevantTasks: TaskRow[] = [];
      const processedTaskIds = new Set<number>();
      
      for (const team of validTeams) {
        if (team.sprintBoardId !== null) {
          // Получаем спринты команды
          const teamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
          const yearSprints = teamSprints.filter(sprint => {
            const sprintStart = new Date(sprint.startDate);
            return sprintStart >= yearStart && sprintStart <= yearEnd;
          });
          
          if (yearSprints.length > 0) {
            // Команда имеет реальные спринты в этом году - берем только done-задачи из спринтов
            const sprintIds = new Set(yearSprints.map(s => s.sprintId));
            const allTasks = await storage.getAllTasks();
            const teamSprintTasks = allTasks.filter(task => 
              task.teamId === team.teamId &&
              task.sprintId !== null && 
              sprintIds.has(task.sprintId) && 
              task.state === '3-done' &&  // Только done-задачи
              task.condition !== '3 - deleted' &&  // Исключаем удаленные
              !processedTaskIds.has(task.cardId)
            );
            teamSprintTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          } else {
            // Команда не имеет реальных спринтов в этом году - берем по doneDate
            const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
            const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
            newTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          }
        } else {
          // Команда вообще без спринтовой доски - берем по doneDate
          const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
          const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
          newTasks.forEach(task => {
            relevantTasks.push(task);
            processedTaskIds.add(task.cardId);
          });
        }
      }
      

      // Получаем все инициативы для выбранных команд
      const allInitiatives = await Promise.all(
        validTeams.map(team => storage.getInitiativesByBoardId(team.initBoardId))
      );
      const initiatives = allInitiatives.flat();
      
      // Создаем мапу инициатив по cardId для быстрого поиска
      const initiativesMap = new Map(initiatives.map(init => [init.cardId, init]));
      

      // Подсчитываем SP по типам (как в Cost Structure)
      const typeStats: Record<string, number> = {};
      let totalSP = 0;

      for (const task of relevantTasks) {
        const taskSize = task.size || 0;
        totalSP += taskSize;

        // Проверяем, привязан ли таск к инициативе
        if (task.initCardId !== null && task.initCardId !== 0) {
          const initiative = initiativesMap.get(task.initCardId);
          if (initiative && initiative.type) {
            typeStats[initiative.type] = (typeStats[initiative.type] || 0) + taskSize;
          }
        }
      }

      // Рассчитываем проценты для каждого типа (с округлением, как в Cost Structure)
      const epicPercent = totalSP > 0 ? Math.round(((typeStats['Epic'] || 0) / totalSP) * 100) : 0;
      const compliancePercent = totalSP > 0 ? Math.round(((typeStats['Compliance'] || 0) / totalSP) * 100) : 0;
      const enablerPercent = totalSP > 0 ? Math.round(((typeStats['Enabler'] || 0) / totalSP) * 100) : 0;
      
      // IR - это сумма округленных процентов (как в Excel)
      const actualIR = epicPercent + compliancePercent + enablerPercent;
      const innovationSP = (typeStats['Epic'] || 0) + (typeStats['Compliance'] || 0) + (typeStats['Enabler'] || 0);

      
      // Расчитываем разницу с плановым IR
      const plannedIR = department.plannedIr || 0;
      const diffFromPlanned = actualIR - plannedIR;


      res.json({
        success: true,
        actualIR,
        plannedIR,
        diffFromPlanned,
        totalSP,
        innovationSP
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to calculate innovation rate" 
      });
    }
  });

  app.get("/api/metrics/cost-structure", async (req, res) => {
    try {
      const teamIdsParam = req.query.teamIds as string;
      const yearParam = req.query.year as string;
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }


      // Получаем команды
      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);
      
      if (validTeams.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No valid teams found" 
        });
      }

      // Фильтруем по году
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      
      // Получаем задачи из двух источников:
      // 1. Из реальных спринтов для команд со спринтами
      // 2. По doneDate для команд без спринтов
      const relevantTasks: TaskRow[] = [];
      const processedTaskIds = new Set<number>();
      
      for (const team of validTeams) {
        if (team.sprintBoardId !== null) {
          // Получаем спринты команды
          const teamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
          const yearSprints = teamSprints.filter(sprint => {
            const sprintStart = new Date(sprint.startDate);
            return sprintStart >= yearStart && sprintStart <= yearEnd;
          });
          
          if (yearSprints.length > 0) {
            // Команда имеет реальные спринты в этом году - берем только done-задачи из спринтов
            const sprintIds = new Set(yearSprints.map(s => s.sprintId));
            const allTasks = await storage.getAllTasks();
            const teamSprintTasks = allTasks.filter(task => 
              task.teamId === team.teamId &&
              task.sprintId !== null && 
              sprintIds.has(task.sprintId) && 
              task.state === '3-done' &&  // Только done-задачи
              task.condition !== '3 - deleted' &&  // Исключаем удаленные
              !processedTaskIds.has(task.cardId)
            );
            teamSprintTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          } else {
            // Команда не имеет реальных спринтов в этом году - берем по doneDate
            const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
            const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
            newTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
          }
        } else {
          // Команда вообще без спринтовой доски - берем по doneDate
          const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
          const newTasks = teamTasks.filter(task => task.condition !== '3 - deleted' && !processedTaskIds.has(task.cardId));
          newTasks.forEach(task => {
            relevantTasks.push(task);
            processedTaskIds.add(task.cardId);
          });
        }
      }
      

      // Получаем все инициативы для выбранных команд
      const allInitiatives = await Promise.all(
        validTeams.map(team => storage.getInitiativesByBoardId(team.initBoardId))
      );
      const initiatives = allInitiatives.flat();
      
      // Создаем мапу инициатив по cardId для быстрого поиска
      const initiativesMap = new Map(initiatives.map(init => [init.cardId, init]));
      

      // Маппинг различных вариантов написания типов (применяется ко ВСЕМ задачам)
      const typeMapping: Record<string, string> = {
        'Omni': 'Service Desk',
        'Technical Debt': 'Tech debt',
        'Technical debt': 'Tech debt',
        'Tech Debt': 'Tech debt',
        'Tech debt': 'Tech debt',
        'Tech Task': 'Tech debt'
      };

      // Подсчитываем SP по типам инициатив
      const typeStats: Record<string, number> = {};
      let totalSP = 0;
      
      // Счетчики для отладки
      let tasksWithInitiative = 0;
      let tasksWithoutInitiative = 0;
      let techDebtCandidates = 0;

      for (const task of relevantTasks) {
        const taskSize = task.size || 0;
        totalSP += taskSize;

        // Проверяем, привязан ли таск к инициативе
        if (task.initCardId !== null && task.initCardId !== 0) {
          tasksWithInitiative++;
          const initiative = initiativesMap.get(task.initCardId);
          if (initiative && initiative.type) {
            // ТОЛЬКО считаем Epic, Compliance, Enabler инициативы (как в Excel)
            if (initiative.type === 'Epic' || initiative.type === 'Compliance' || initiative.type === 'Enabler') {
              typeStats[initiative.type] = (typeStats[initiative.type] || 0) + taskSize;
            }
          }
        } else {
          tasksWithoutInitiative++;
          // Таск не привязан к инициативе - используем тип задачи
          if (task.type) {
            
            // Применяем маппинг к типу задачи
            let displayType = task.type;
            if (typeMapping[task.type]) {
              displayType = typeMapping[task.type];
              if (displayType === 'Tech debt') {
                techDebtCandidates++;
              }
            }
            
            // Известные типы из структуры затрат
            const knownTypes = ['Security', 'Service Desk', 'Postmortem', 'Tech debt', 'Bug'];
            
            if (knownTypes.includes(displayType)) {
              typeStats[displayType] = (typeStats[displayType] || 0) + taskSize;
            } else {
              // Неизвестный тип - в "Др. доработки"
              typeStats['Др. доработки'] = (typeStats['Др. доработки'] || 0) + taskSize;
            }
          } else {
            // Нет типа - в "Др. доработки"
            typeStats['Др. доработки'] = (typeStats['Др. доработки'] || 0) + taskSize;
          }
        }
      }
      

      // Рассчитываем проценты
      const typePercentages: Record<string, number> = {};
      for (const [type, sp] of Object.entries(typeStats)) {
        typePercentages[type] = totalSP > 0 ? Math.round((sp / totalSP) * 100) : 0;
      }


      res.json({
        success: true,
        year,
        totalSP,
        typeStats,
        typePercentages,
        teams: validTeams.map(t => ({ id: t.teamId, name: t.teamName }))
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to calculate cost structure" 
      });
    }
  });

  app.get("/api/metrics/value-cost", async (req, res) => {
    try {
      const teamIdsParam = req.query.teamIds as string;
      const yearParam = req.query.year as string;
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }

      // log(`[Value/Cost] Calculating for teams: ${teamIds.join(', ')}, year: ${year}`);

      // Получаем команды
      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);
      
      if (validTeams.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No valid teams found" 
        });
      }

      // Получаем инициативы для каждой команды с фильтрацией по спринтам команды (как в Excel)
      const initiativesWithSprints = await Promise.all(
        validTeams.map(async (team) => {
          // Получаем инициативы для этой команды
          const initiatives = await storage.getInitiativesByBoardId(team.initBoardId);
          
          // Определяем способ получения задач команды
          const yearStart = new Date(year, 0, 1);
          const yearEnd = new Date(year, 11, 31, 23, 59, 59);
          let useSprintFilter = false;
          let teamSprintIds = new Set<number>();
          
          if (team.sprintBoardId !== null) {
            const teamSprints = await storage.getSprintsByBoardId(team.sprintBoardId);
            const filteredSprints = teamSprints.filter(sprint => {
              const sprintYear = new Date(sprint.startDate).getFullYear();
              return sprintYear === year;
            });
            if (filteredSprints.length > 0) {
              useSprintFilter = true;
              teamSprintIds = new Set(filteredSprints.map(s => s.sprintId));
              // log(`[Value/Cost] Team ${team.teamId}: using sprint filter with ${filteredSprints.length} sprints`);
            } else {
              // log(`[Value/Cost] Team ${team.teamId}: no sprints in year ${year}, using doneDate filter`);
            }
          } else {
            // log(`[Value/Cost] Team ${team.teamId}: no sprint board, using doneDate filter`);
          }
          
          // Для каждой инициативы получаем задачи, отфильтрованные по спринтам команды или по doneDate
          return Promise.all(
            initiatives.map(async (initiative) => {
              const allTasks = await storage.getTasksByInitCardId(initiative.cardId);
              
              // Фильтруем задачи в зависимости от типа команды (только done-задачи)
              let tasks: TaskRow[];
              if (useSprintFilter) {
                // Команда со спринтами - фильтруем по спринтам и только done-задачи
                tasks = allTasks.filter(task => 
                  task.sprintId !== null && 
                  teamSprintIds.has(task.sprintId) &&
                  task.state === '3-done' &&  // Только done-задачи
                  task.condition !== '3 - deleted'  // Исключаем удаленные
                );
              } else {
                // Команда без спринтов - фильтруем по doneDate и teamId (doneDate уже означает done)
                tasks = allTasks.filter(task => 
                  task.teamId === team.teamId && 
                  task.doneDate !== null &&
                  task.doneDate !== '' &&
                  new Date(task.doneDate) >= yearStart &&
                  new Date(task.doneDate) <= yearEnd &&
                  task.condition !== '3 - deleted'  // Исключаем удаленные
                );
              }
              
              // log(`[Value/Cost] Initiative ${initiative.cardId} "${initiative.title}": found ${allTasks.length} tasks total, ${tasks.length} tasks after filter (useSprintFilter=${useSprintFilter})`);
              
              // Группируем по sprint_id (для команд со спринтами) или используем виртуальный sprint_id (для команд без)
              const sprintsMap = new Map<number, { sp: number }>();
              tasks.forEach(task => {
                if (useSprintFilter) {
                  // Для команд со спринтами - группируем по реальному sprint_id
                  if (task.sprintId !== null) {
                    const current = sprintsMap.get(task.sprintId) || { sp: 0 };
                    current.sp += task.size;
                    sprintsMap.set(task.sprintId, current);
                  }
                } else {
                  // Для команд без спринтов - используем виртуальный sprint_id = -1
                  const virtualSprintId = -1;
                  const current = sprintsMap.get(virtualSprintId) || { sp: 0 };
                  current.sp += task.size;
                  sprintsMap.set(virtualSprintId, current);
                }
              });
              
              const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, data]) => ({
                sprint_id,
                sp: data.sp,
              }));
              
              // Создаем новый объект с полями teamId, spPrice, teamName и sprints
              return {
                id: initiative.id,
                cardId: initiative.cardId,
                title: initiative.title,
                state: initiative.state,
                condition: initiative.condition,
                type: initiative.type,
                initBoardId: initiative.initBoardId,
                size: initiative.size,
                plannedInvolvement: initiative.plannedInvolvement,
                plannedValueId: initiative.plannedValueId,
                plannedValue: initiative.plannedValue,
                factValueId: initiative.factValueId,
                factValue: initiative.factValue,
                dueDate: initiative.doneDate,
                doneDate: initiative.doneDate,
                teamId: team.teamId,
                spPrice: team.spPrice,
                teamName: team.teamName,
                sprints: sprints
              };
            })
          );
        })
      );
      
      const allInitiatives = initiativesWithSprints.flat();
      
      // Группируем инициативы по cardId для исключения дубликатов
      const initiativesByCardId = new Map<number, any[]>();
      allInitiatives.forEach((initiative) => {
        // Пропускаем "Поддержку бизнеса"
        if (initiative.cardId === 0) return;
        
        if (!initiativesByCardId.has(initiative.cardId)) {
          initiativesByCardId.set(initiative.cardId, []);
        }
        initiativesByCardId.get(initiative.cardId)!.push(initiative);
      });

      // log(`[Value/Cost] Found ${initiativesByCardId.size} unique initiatives`);

      // Рассчитываем суммарные значения
      let sumPlannedValue = 0;
      let sumPlannedCost = 0;
      let sumFactValue = 0;
      let sumFactCost = 0;

      for (const [cardId, relatedInitiatives] of Array.from(initiativesByCardId.entries())) {
        const firstInit = relatedInitiatives[0];
        
        // Фильтруем только инициативы выбранных команд
        const teamFilteredInitiatives = relatedInitiatives.filter(init => teamIds.includes(init.teamId));
        
        // Если после фильтрации не осталось инициатив - пропускаем
        if (teamFilteredInitiatives.length === 0) continue;
        
        // Суммируем затраты только по выбранным командам
        // Плановые затраты считаем только для команд с фактическими затратами
        let totalPlannedCost = 0;
        let totalActualCost = 0;
        
        for (const initiative of teamFilteredInitiatives) {
          // Actual size уже рассчитан в initiative.sprints
          const actualSize = initiative.sprints?.reduce((sum: number, sprint: any) => sum + sprint.sp, 0) || 0;
          const plannedSize = initiative.size || 0;
          
          // log(`[Value/Cost] Init ${cardId} "${firstInit.title}" type=${firstInit.type} team=${initiative.teamName}: plannedSize=${plannedSize}, actualSize=${actualSize}, spPrice=${initiative.spPrice}`);
          
          // Плановые затраты считаем только для команд с фактическими затратами
          if (actualSize > 0) {
            totalPlannedCost += plannedSize * (initiative.spPrice || 0);
          }
          totalActualCost += actualSize * (initiative.spPrice || 0);
        }
        
        // log(`[Value/Cost] Init ${cardId} total costs: planned=${totalPlannedCost}, actual=${totalActualCost}`);
        
        // Для Epic получаем plannedValue и factValue из БД
        // Для Compliance и Enabler: plannedValue = plannedCost, factValue = actualCost
        let plannedValue = 0;
        let factValue = 0;
        
        if (firstInit.type === 'Compliance' || firstInit.type === 'Enabler') {
          // Для Compliance/Enabler value всегда равен cost
          plannedValue = totalPlannedCost;
          factValue = totalActualCost;
        } else {
          // Для Epic берем из БД
          plannedValue = firstInit.plannedValue && firstInit.plannedValue.trim() !== '' 
            ? parseFloat(firstInit.plannedValue) 
            : 0;
          factValue = firstInit.factValue && firstInit.factValue.trim() !== '' 
            ? parseFloat(firstInit.factValue) 
            : 0;
        }
        
        // Добавляем только если есть ФАКТИЧЕСКИЕ затраты у выбранных команд
        if (totalActualCost > 0) {
          sumPlannedValue += plannedValue;
          sumPlannedCost += totalPlannedCost;
          sumFactValue += factValue;
          sumFactCost += totalActualCost;
          // log(`[Value/Cost] Added to totals: plannedValue=${plannedValue}, factValue=${factValue}, plannedCost=${totalPlannedCost}, actualCost=${totalActualCost}`);
        }
      }

      // Рассчитываем коэффициенты Value/Cost
      const plannedValueCost = sumPlannedCost > 0 
        ? Math.round((sumPlannedValue / sumPlannedCost) * 10) / 10
        : 0;
      const factValueCost = sumFactCost > 0 
        ? Math.round((sumFactValue / sumFactCost) * 10) / 10
        : 0;

      // log(`[Value/Cost] Planned: ${plannedValueCost} (${sumPlannedValue}/${sumPlannedCost}), Fact: ${factValueCost} (${sumFactValue}/${sumFactCost})`);

      res.json({
        success: true,
        plannedValueCost,
        factValueCost,
        sumPlannedValue,
        sumPlannedCost,
        sumFactValue,
        sumFactCost
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to calculate value/cost" 
      });
    }
  });

  app.get("/api/kaiten/sprint-raw/:sprintId", async (req, res) => {
    try {
      const sprintId = parseInt(req.params.sprintId);
      if (isNaN(sprintId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid sprint ID" 
        });
      }

      
      const sprint = await kaitenClient.getSprint(sprintId);
      
      
      res.json(sprint);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to fetch sprint from Kaiten" 
      });
    }
  });

  app.get("/api/kaiten/test", async (req, res) => {
    try {
      const isConnected = await kaitenClient.testConnection();
      res.json({ 
        success: true, 
        connected: isConnected,
        message: isConnected ? "Kaiten API connection successful" : "Kaiten API connection failed"
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to test Kaiten connection" 
      });
    }
  });

  app.post("/api/sprints/:sprintId/generate-report", async (req, res) => {
    try {
      const { sprintId } = req.params;
      const { teamName, sprintDates, teamId } = req.body;

      const sprintIdNum = parseInt(sprintId);
      
      // Получаем задачи спринта
      let tasks: TaskRow[];
      
      if (sprintIdNum < 0) {
        // Виртуальный спринт - выбираем задачи по команде и диапазону дат
        if (!teamId || typeof teamId !== 'string') {
          return res.status(400).json({ 
            success: false, 
            error: 'teamId is required for virtual sprints' 
          });
        }
        
        if (!sprintDates?.start || !sprintDates?.end) {
          return res.status(400).json({ 
            success: false, 
            error: 'sprintDates.start and sprintDates.end are required for virtual sprints' 
          });
        }
        
        const startDate = new Date(sprintDates.start);
        const endDate = new Date(sprintDates.end);
        
        // Проверяем валидность дат
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid date format in sprintDates' 
          });
        }
        
        tasks = await storage.getTasksByTeamAndDoneDateRange(teamId, startDate, endDate);
      } else {
        // Реальный спринт - выбираем по sprint_id
        tasks = await storage.getTasksBySprint(sprintIdNum);
      }
      
      // Получаем инициативы для группировки
      const initiativeMap = new Map<number, { title: string; tasks: Array<{ title: string; size: number }> }>();
      
      for (const task of tasks) {
        const initCardId = task.initCardId || 0;
        
        if (!initiativeMap.has(initCardId)) {
          if (initCardId === 0) {
            initiativeMap.set(0, { title: 'Другие задачи', tasks: [] });
          } else {
            const initiative = await storage.getInitiativeByCardId(initCardId);
            initiativeMap.set(initCardId, {
              title: initiative?.title || `Инициатива ${initCardId}`,
              tasks: []
            });
          }
        }
        
        initiativeMap.get(initCardId)!.tasks.push({
          title: task.title,
          size: task.size
        });
      }

      // Преобразуем Map в массив и сортируем: сначала инициативы, потом "Другие задачи"
      const initiatives = Array.from(initiativeMap.entries())
        .sort(([idA], [idB]) => {
          // Если ID = 0 (Другие задачи), помещаем в конец
          if (idA === 0) return 1;
          if (idB === 0) return -1;
          return 0; // Остальные инициативы сохраняют исходный порядок
        })
        .map(([_, initiative]) => initiative);

      // Динамически импортируем модуль генерации PDF
      const { generateSprintReportPDF } = await import('./pdf-generator');
      const pdfBuffer = await generateSprintReportPDF(teamName, sprintDates, initiatives);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Sprint_Report_${sprintId}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to generate report" 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
