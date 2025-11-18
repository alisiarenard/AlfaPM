import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInitiativeSchema, insertTaskSchema, insertDepartmentSchema, type TaskRow } from "@shared/schema";
import { kaitenClient } from "./kaiten";
import { log } from "./vite";
import { calculateInitiativesInvolvement } from "./utils/involvement";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/departments", async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      console.error("GET /api/departments error:", error);
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
      console.error("POST /api/departments error:", error);
      
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
      console.error("PATCH /api/departments/:id error:", error);
      
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
      console.error("GET /api/teams/:departmentId error:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve teams" 
      });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const teamData = req.body;
      
      // Валидация sprintBoardId через Kaiten API
      if (teamData.sprintBoardId) {
        const sprintBoardValidation = await kaitenClient.validateBoard(teamData.sprintBoardId, 'sprints');
        if (!sprintBoardValidation.valid) {
          return res.status(400).json({ 
            success: false, 
            error: sprintBoardValidation.error || "Доска спринтов не найдена в Kaiten"
          });
        }
      }
      
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
          log(`[Team Creation] Step 1: Syncing initiatives from board ${teamData.initBoardId}`);
          
          const allCards = await kaitenClient.getCardsFromBoard(teamData.initBoardId);
          // Фильтруем только неархивные инициативы
          const cards = allCards.filter(card => !card.archived);
          log(`[Team Creation] Found ${allCards.length} total cards, ${cards.length} non-archived initiatives`);
          
          const plannedValueId = "id_451379";
          const factValueId = "id_448119";
          
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
          }
          
          log(`[Team Creation] Successfully synced ${cards.length} initiatives`);
        } catch (syncError) {
          console.error("[Team Creation] Initiative sync error:", syncError);
        }
      }
      
      // 2. Синхронизация спринтов
      if (teamData.sprintBoardId) {
        try {
          log(`[Team Creation] Step 2: Syncing sprints from board ${teamData.sprintBoardId}`);
          
          const currentYear = new Date().getFullYear();
          let offset = 0;
          const limit = 100;
          const maxOffset = 500;
          let allBoardSprints: any[] = [];
          let foundPreviousYear = false;
          
          // Получаем спринты порциями пока не найдем спринты предыдущего года (до offset=500)
          while (!foundPreviousYear && offset < maxOffset) {
            log(`[Team Creation] Fetching sprints with offset ${offset}`);
            const allSprints = await kaitenClient.getAllSprints({ limit, offset });
            
            if (allSprints.length === 0) {
              log(`[Team Creation] No more sprints to fetch`);
              break;
            }
            
            // Фильтруем по board_id команды
            const boardSprints = allSprints.filter(sprint => sprint.board_id === teamData.sprintBoardId);
            
            if (boardSprints.length === 0) {
              log(`[Team Creation] No sprints found for board ${teamData.sprintBoardId} in this batch (offset=${offset}), fetching next batch`);
              offset += limit;
              continue;
            }
            
            // Добавляем найденные спринты команды в общий массив
            allBoardSprints.push(...boardSprints);
            
            // Проверяем, есть ли спринты с датами предыдущего года
            for (const sprint of boardSprints) {
              const startDate = new Date(sprint.start_date);
              const startYear = startDate.getFullYear();
              
              if (startYear < currentYear) {
                foundPreviousYear = true;
                log(`[Team Creation] Found sprint with previous year date: ${sprint.start_date} (Year: ${startYear})`);
                break;
              }
            }
            
            if (!foundPreviousYear) {
              log(`[Team Creation] All sprints in this batch are from ${currentYear}, fetching next batch`);
              offset += limit;
            }
          }
          
          if (offset >= maxOffset) {
            log(`[Team Creation] Reached max offset ${maxOffset}, stopping sprint fetch`);
          }
          
          log(`[Team Creation] Found total ${allBoardSprints.length} sprints for board ${teamData.sprintBoardId}`);
          
          // Сохраняем все найденные спринты в БД
          for (const sprint of allBoardSprints) {
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
          }
          
          log(`[Team Creation] Successfully synced ${allBoardSprints.length} sprints`);
          
          // 3. Синхронизация тасок по спринтам
          log(`[Team Creation] Step 3: Syncing tasks`);
          let totalTasks = 0;
          
          if (allBoardSprints.length > 0) {
            // Есть спринты - синхронизируем задачи из них
            log(`[Team Creation] Syncing tasks from ${allBoardSprints.length} sprints`);
            for (const sprint of allBoardSprints) {
              try {
                const kaitenSprint = await kaitenClient.getSprint(sprint.id);
                
                if (kaitenSprint.cards && Array.isArray(kaitenSprint.cards)) {
                  for (const sprintCard of kaitenSprint.cards) {
                    const card = await kaitenClient.getCard(sprintCard.id);
                    
                    let initCardId = 0;
                    if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
                      const parentInitiative = await storage.getInitiativeByCardId(card.parents_ids[0]);
                      initCardId = parentInitiative ? card.parents_ids[0] : 0;
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
                log(`[Team Creation] Error syncing tasks for sprint ${sprint.id}: ${errorMessage}`);
              }
            }
          } else {
            // Нет спринтов - используем date filter API
            log(`[Team Creation] No sprints found. Using Kaiten API with date filter for tasks.`);
            try {
              const currentYear = new Date().getFullYear();
              const yearStart = new Date(currentYear, 0, 1).toISOString();
              
              log(`[Team Creation] Fetching tasks completed after ${yearStart} from sprint board ${teamData.sprintBoardId}`);
              
              const tasks = await kaitenClient.getCardsWithDateFilter({
                boardId: teamData.sprintBoardId,
                lastMovedToDoneAtAfter: yearStart,
                limit: 1000
              });
              
              log(`[Team Creation] Found ${tasks.length} tasks completed after ${yearStart}`);
              
              for (const taskCard of tasks) {
                try {
                  // Пропускаем инициативные карточки (Epic, Compliance, Enabler)
                  const cardType = taskCard.type?.name;
                  if (cardType === 'Epic' || cardType === 'Compliance' || cardType === 'Enabler') {
                    log(`[Team Creation] Skipping initiative card ${taskCard.id} "${taskCard.title}" (type: ${cardType})`);
                    continue;
                  }
                  
                  let initCardId = 0;
                  if (taskCard.parents_ids && Array.isArray(taskCard.parents_ids) && taskCard.parents_ids.length > 0) {
                    const parentId = taskCard.parents_ids[0];
                    const parentInitiative = await storage.getInitiativeByCardId(parentId);
                    if (parentInitiative) {
                      initCardId = parentId;
                      log(`[Team Creation] Task ${taskCard.id} linked to initiative ${parentId}`);
                    }
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
                  
                  await storage.syncTaskFromKaiten(
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
                  
                  totalTasks++;
                } catch (taskError: unknown) {
                  const errorMessage = taskError instanceof Error ? taskError.message : String(taskError);
                  log(`[Team Creation] Error syncing task ${taskCard.id}: ${errorMessage}`);
                }
              }
            } catch (dateFilterError) {
              console.error("[Team Creation] Task sync with date filter error:", dateFilterError);
            }
          }
          
          log(`[Team Creation] Successfully synced ${totalTasks} tasks`);
        } catch (syncError) {
          console.error("[Team Creation] Sprint/Task sync error:", syncError);
        }
      } else {
        // Команда без спринтов - используем Kaiten API для получения задач с фильтром по дате
        log(`[Team Creation] No sprint board specified. Using Kaiten API with date filter for tasks.`);
        
        try {
          // Получаем начало текущего года
          const currentYear = new Date().getFullYear();
          const yearStart = new Date(currentYear, 0, 1).toISOString();
          
          log(`[Team Creation] Fetching tasks completed after ${yearStart} from board ${teamData.initBoardId}`);
          
          // Получаем все задачи с фильтром по дате
          const tasks = await kaitenClient.getCardsWithDateFilter({
            boardId: teamData.initBoardId,
            lastMovedToDoneAtAfter: yearStart,
            limit: 1000
          });
          
          log(`[Team Creation] Found ${tasks.length} tasks completed after ${yearStart}`);
          
          let totalTasksSynced = 0;
          
          // Сохраняем каждую задачу
          for (const taskCard of tasks) {
            try {
              // Определяем init_card_id по parent_id
              let initCardId = 0;
              if (taskCard.parents_ids && Array.isArray(taskCard.parents_ids) && taskCard.parents_ids.length > 0) {
                const parentId = taskCard.parents_ids[0];
                const parentInitiative = await storage.getInitiativeByCardId(parentId);
                if (parentInitiative) {
                  initCardId = parentId;
                  log(`[Team Creation] Task ${taskCard.id} linked to initiative ${parentId}`);
                } else {
                  log(`[Team Creation] Task ${taskCard.id} has parent ${parentId} but it's not an initiative`);
                }
              } else {
                log(`[Team Creation] Task ${taskCard.id} has no parent_id`);
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
              
              await storage.syncTaskFromKaiten(
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
              
              totalTasksSynced++;
            } catch (taskError: unknown) {
              const errorMessage = taskError instanceof Error ? taskError.message : String(taskError);
              log(`[Team Creation] Error syncing task ${taskCard.id}: ${errorMessage}`);
            }
          }
          
          log(`[Team Creation] Successfully synced ${totalTasksSynced} tasks from Kaiten API`);
        } catch (syncError) {
          console.error("[Team Creation] Task sync with date filter error:", syncError);
        }
      }
      
      res.json(team);
    } catch (error) {
      console.error("POST /api/teams error:", error);
      
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
      console.error("PATCH /api/teams/:teamId error:", error);
      
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

  app.get("/api/initiatives", async (req, res) => {
    try {
      const initiatives = await storage.getAllInitiatives();
      res.json(initiatives);
    } catch (error) {
      console.error("GET /api/initiatives error:", error);
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
      log(`[Initiatives Filter] Got ${initiatives.length} initiatives from DB for board ${initBoardId}`);
      
      // Если передан sprintBoardId, получаем sprint_id спринтов этой команды
      let teamSprintIds: Set<number> | null = null;
      let teamSprints: any[] = [];
      if (sprintBoardId !== null && !isNaN(sprintBoardId)) {
        teamSprints = await storage.getSprintsByBoardId(sprintBoardId);
        teamSprintIds = new Set(teamSprints.map(s => s.sprintId));
        log(`[Initiatives Filter] Team sprint IDs for board ${sprintBoardId}: ${Array.from(teamSprintIds).join(', ')}`);
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
          tasks.forEach(task => {
            if (task.sprintId !== null) {
              const current = sprintsMap.get(task.sprintId) || { sp: 0, tasks: [] };
              current.sp += task.size;
              current.tasks.push({
                id: task.id,
                cardId: task.cardId,
                title: task.title,
                type: task.type,
                size: task.size,
                archived: task.archived
              });
              sprintsMap.set(task.sprintId, current);
            }
          });
          
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
              log(`[Initiatives Filter] Init ${init.cardId} "${init.title}" state=${init.state} isQueued=${isQueued} pass=${pass}`);
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
      console.error("GET /api/initiatives/board/:initBoardId error:", error);
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

      log(`[Timeline] Team ${teamId} - initBoardId: ${initBoardId}, sprintBoardId: ${sprintBoardId}, sprintDuration: ${sprintDuration}`);

      // Получаем инициативы
      const initiatives = await storage.getInitiativesByBoardId(initBoardId);
      log(`[Timeline] Got ${initiatives.length} initiatives from DB for board ${initBoardId}`);

      // Загружаем все задачи один раз (избегаем N+1)
      const initiativeCardIds = new Set(initiatives.map(i => i.cardId));
      const allTasks = await storage.getAllTasks();
      // Фильтруем задачи по teamId чтобы показывать только задачи этой команды
      const initiativeTasks = allTasks.filter(task => 
        task.initCardId !== null && 
        initiativeCardIds.has(task.initCardId) &&
        task.teamId === teamId
      );
      log(`[Timeline] Loaded ${initiativeTasks.length} tasks for ${initiatives.length} initiatives (team: ${teamId})`);

      if (sprintBoardId) {
        // Команда со спринтами - используем реальные спринты
        const teamSprints = await storage.getSprintsByBoardId(sprintBoardId);
        const teamSprintIds = new Set(teamSprints.map(s => s.sprintId));
        log(`[Timeline] Team has ${teamSprints.length} real sprints`);

        // Если спринтов нет - используем виртуальные спринты
        if (teamSprints.length === 0) {
          log(`[Timeline] No real sprints found. Creating virtual sprints for team with sprintBoardId`);

          // Фильтруем задачи с doneDate
          const tasksForVirtual = initiativeTasks.filter(task => 
            task.doneDate !== null && 
            task.doneDate !== ''
          );

          log(`[Timeline] Found ${tasksForVirtual.length} tasks with doneDate`);

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
                current.sp += task.size;
                current.tasks.push({
                  id: task.id,
                  cardId: task.cardId,
                  title: task.title,
                  type: task.type,
                  size: task.size,
                  archived: task.archived
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
              const current = sprintsMap.get(task.sprintId) || { sp: 0, tasks: [] };
              current.sp += task.size;
              current.tasks.push({
                id: task.id,
                cardId: task.cardId,
                title: task.title,
                type: task.type,
                size: task.size,
                archived: task.archived
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
        // Команда без спринтов - создаём виртуальные спринты
        log(`[Timeline] Creating virtual sprints for team without sprintBoardId`);

        // Фильтруем задачи без sprint_id но с doneDate
        const tasksForVirtual = initiativeTasks.filter(task => 
          task.sprintId === null && 
          task.doneDate !== null && 
          task.doneDate !== ''
        );

        log(`[Timeline] Found ${tasksForVirtual.length} tasks without sprint (with doneDate)`);

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

        log(`[Timeline] Created ${virtualSprints.length} virtual sprints`);

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
                  archived: task.archived
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
      console.error("GET /api/timeline/:teamId error:", error);
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
      console.error("GET /api/initiatives/:id error:", error);
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
      console.error("POST /api/initiatives error:", error);
      
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
      console.error("PATCH /api/initiatives/:id error:", error);
      
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
      console.error("DELETE /api/initiatives/:id error:", error);
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
      console.error("GET /api/sprints error:", error);
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
      console.error("GET /api/sprints/board/:boardId error:", error);
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
      console.error("GET /api/sprints/:sprintId error:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve sprint" 
      });
    }
  });

  // Tasks endpoints
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error) {
      console.error("GET /api/tasks error:", error);
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
      console.error("GET /api/tasks/board/:boardId error:", error);
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
      console.error("GET /api/tasks/:id error:", error);
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

      log(`[Grouped Tasks] Fetching tasks for initBoardId=${initBoardId}, sprintDuration=${sprintDuration} days`);

      // Получаем все задачи без sprintId для этой доски
      const allTasks = await storage.getAllTasks();
      const initiativeTasks = allTasks.filter(task => 
        task.sprintId === null && 
        task.doneDate !== null && 
        task.doneDate !== ''
      );

      log(`[Grouped Tasks] Found ${initiativeTasks.length} tasks without sprint (with doneDate)`);

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

      log(`[Grouped Tasks] Created ${virtualSprints.length} virtual sprints`);

      res.json(virtualSprints);
    } catch (error) {
      console.error("GET /api/tasks/grouped/:initBoardId/:sprintDuration error:", error);
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
      console.error("POST /api/tasks error:", error);
      
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
      console.error("PATCH /api/tasks/:id error:", error);
      
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
      console.error("DELETE /api/tasks/:id error:", error);
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

      log(`[Kaiten Sync] Starting sync for board ${boardId}`);
      
      const allCards = await kaitenClient.getCardsFromBoard(boardId);
      // Фильтруем только неархивные инициативы
      const cards = allCards.filter(card => !card.archived);
      log(`[Kaiten Sync] Found ${allCards.length} total cards, ${cards.length} non-archived initiatives`);

      const syncedInitiatives = [];
      const plannedValueId = "id_451379";
      const factValueId = "id_448119";
      
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

        log(`[Kaiten Sync] Card ${card.id} "${card.title}" - type object:`, JSON.stringify(card.type));
        log(`[Kaiten Sync] Card ${card.id} - type.name value: ${card.type?.name}`);
        
        // Логируем всю структуру properties для диагностики
        log(`[Kaiten Sync] Card ${card.id} - all properties:`, JSON.stringify(card.properties));
        log(`[Kaiten Sync] Card ${card.id} - properties keys:`, card.properties ? Object.keys(card.properties).join(', ') : 'no properties');
        
        // Получаем plannedValue из properties по ключу plannedValueId
        const rawPlanned = card.properties?.[plannedValueId];
        const plannedValue = rawPlanned == null ? undefined : String(rawPlanned);
        
        log(`[Kaiten Sync] Card ${card.id} - raw plannedValue from properties[${plannedValueId}]:`, rawPlanned);
        log(`[Kaiten Sync] Card ${card.id} - plannedValue (converted to string):`, plannedValue);
        
        // Получаем factValue из properties по ключу factValueId
        const rawFact = card.properties?.[factValueId];
        const factValue = rawFact == null ? undefined : String(rawFact);
        
        log(`[Kaiten Sync] Card ${card.id} - raw factValue from properties[${factValueId}]:`, rawFact);
        log(`[Kaiten Sync] Card ${card.id} - factValue (converted to string):`, factValue);

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
      }

      log(`[Kaiten Sync] Successfully synced ${syncedInitiatives.length} initiatives`);
      
      // Для инициатив типа Compliance и Enabler автоматически проставляем planned_value = planned_cost и fact_value = fact_cost
      const allTeams = await storage.getAllTeams();
      const relevantTeams = allTeams.filter(team => team.initBoardId === boardId);
      
      if (relevantTeams.length > 0) {
        // Используем первую команду для расчета cost (если несколько команд работают с одной доской)
        const team = relevantTeams[0];
        const spPrice = team.spPrice || 0;
        
        log(`[Kaiten Sync] Processing Compliance/Enabler initiatives for team "${team.teamName}" with spPrice=${spPrice}`);
        
        for (const initiative of syncedInitiatives) {
          if (initiative.type === 'Compliance' || initiative.type === 'Enabler') {
            // Рассчитываем planned_cost
            const plannedCost = initiative.size * spPrice;
            
            // Получаем фактические задачи для расчета fact_cost
            const tasks = await storage.getTasksByInitCardId(initiative.cardId);
            const actualSize = tasks.reduce((sum, task) => sum + task.size, 0);
            const factCost = actualSize * spPrice;
            
            log(`[Kaiten Sync] Updating initiative ${initiative.cardId} "${initiative.title}" (${initiative.type}): planned_cost=${plannedCost}, fact_cost=${factCost}`);
            
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
      console.error("POST /api/kaiten/sync-board/:boardId error:", error);
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

      log(`[Kaiten Sync Tasks] Starting sync for board ${boardId}`);
      
      // Lookup team by initBoardId
      const team = await storage.getTeamByInitBoardId(boardId);
      if (!team) {
        log(`[Kaiten Sync Tasks] No team found for board ${boardId}`);
        return res.status(404).json({
          success: false,
          error: `No team found with initBoardId=${boardId}`
        });
      }
      log(`[Kaiten Sync Tasks] Found team ${team.teamName} (${team.teamId})`);
      
      // Step 1: Get list of cards from board
      const boardCards = await kaitenClient.getCardsFromBoard(boardId);
      log(`[Kaiten Sync Tasks] Found ${boardCards.length} cards on board`);

      const syncedTasks = [];
      
      // Step 2: Fetch each card individually to get parents_ids
      for (const boardCard of boardCards) {
        const card = await kaitenClient.getCard(boardCard.id);
        
        // Определяем init_card_id по parents_ids
        let initCardId = 0; // По умолчанию - "Поддержка бизнеса"
        if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
          initCardId = card.parents_ids[0]; // Первый родитель - это инициатива
        }
        
        // Синхронизируем таски с state === 3 (done)
        if (card.state === 3) {
          log(`[Kaiten Sync Tasks]   ✓ Syncing task ${card.id}, sprint_id=${card.sprint_id}, init_card_id=${initCardId}`);
          
          let state: "1-queued" | "2-inProgress" | "3-done";
          
          if (card.state === 3) {
            state = "3-done";
          } else if (card.state === 2) {
            state = "2-inProgress";
          } else {
            state = "1-queued";
          }
          
          const condition: "1-live" | "2-archived" = card.archived ? "2-archived" : "1-live";

          log(`[Kaiten Sync Tasks] Task ${card.id} "${card.title}" - type.name value: ${card.type?.name}`);

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

      log(`[Kaiten Sync Tasks] Synced ${syncedTasks.length} tasks from ${boardCards.length} cards`);
      
      res.json({
        success: true,
        count: syncedTasks.length,
        tasks: syncedTasks
      });
    } catch (error) {
      console.error("POST /api/kaiten/sync-tasks/:boardId error:", error);
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

      log(`[Kaiten Update Sprint] Fetching sprint ${sprintId} from Kaiten`);
      
      // Получаем данные спринта из Kaiten
      const sprint = await kaitenClient.getSprint(sprintId);
      
      if (!sprint.cards || !Array.isArray(sprint.cards)) {
        log(`[Kaiten Update Sprint] No cards found in sprint ${sprintId}`);
        return res.json({
          success: true,
          updated: 0,
          message: "No cards found in sprint"
        });
      }

      log(`[Kaiten Update Sprint] Sprint has ${sprint.cards.length} cards`);
      log(`[Kaiten Update Sprint] Sprint card IDs: ${sprint.cards.map(c => c.id).join(', ')}`);
      
      // Получаем все tasks из базы данных
      const allTasks = await storage.getAllTasks();
      log(`[Kaiten Update Sprint] Found ${allTasks.length} tasks in database`);
      log(`[Kaiten Update Sprint] Task card IDs: ${allTasks.map(t => t.cardId).join(', ')}`);
      
      // Создаем Set с card_id из спринта для быстрого поиска
      const sprintCardIds = new Set(sprint.cards.map(card => card.id));
      
      let updatedCount = 0;
      
      // Обновляем sprint_id для tasks, у которых card_id совпадает с card_id из спринта
      for (const task of allTasks) {
        if (sprintCardIds.has(task.cardId)) {
          log(`[Kaiten Update Sprint] Updating task ${task.id} (card_id: ${task.cardId}) with sprint_id: ${sprintId}`);
          
          await storage.updateTask(task.id, { sprintId });
          updatedCount++;
        }
      }

      log(`[Kaiten Update Sprint] Updated ${updatedCount} tasks with sprint_id ${sprintId}`);
      
      res.json({
        success: true,
        updated: updatedCount,
        sprintId,
        totalCardsInSprint: sprint.cards.length,
        totalTasksInDb: allTasks.length
      });
    } catch (error) {
      console.error("POST /api/kaiten/update-sprint/:sprintId error:", error);
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
      
      log(`[Kaiten Update Initiative] Updating card ${cardId} with size=${size}, plannedValue=${plannedValue}, factValue=${factValue}`);
      
      // Подготовка обновлений для Kaiten
      const kaitenUpdates: { size?: number; properties?: Record<string, any> } = {};
      
      if (size !== undefined) {
        kaitenUpdates.size = parseInt(String(size));
      }
      
      // Обновляем properties если есть plannedValue или factValue
      if (plannedValue !== undefined || factValue !== undefined) {
        kaitenUpdates.properties = {};
        
        const plannedValueId = "id_451379";
        const factValueId = "id_448119";
        
        if (plannedValue !== undefined) {
          // Kaiten expects numeric values for custom properties
          kaitenUpdates.properties[plannedValueId] = plannedValue === null || plannedValue === '' ? null : parseFloat(String(plannedValue));
        }
        
        if (factValue !== undefined) {
          // Kaiten expects numeric values for custom properties
          kaitenUpdates.properties[factValueId] = factValue === null || factValue === '' ? null : parseFloat(String(factValue));
        }
      }
      
      log(`[Kaiten Update Initiative] Kaiten updates:`, JSON.stringify(kaitenUpdates));
      
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
      
      log(`[Kaiten Update Initiative] DB updates:`, JSON.stringify(dbUpdates));
      
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
      
      log(`[Kaiten Update Initiative] Successfully updated card ${cardId}`);
      
      res.json({
        success: true,
        initiative: updated
      });
    } catch (error) {
      console.error("PATCH /api/kaiten/update-initiative/:cardId error:", error);
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

      log(`[Kaiten Sync Sprint] Fetching sprint ${sprintId} from Kaiten`);
      
      // Получаем данные спринта из Kaiten
      const sprint = await kaitenClient.getSprint(sprintId);
      
      if (!sprint.cards || !Array.isArray(sprint.cards)) {
        log(`[Kaiten Sync Sprint] No cards found in sprint ${sprintId}`);
        return res.json({
          success: true,
          synced: 0,
          message: "No cards found in sprint"
        });
      }

      log(`[Kaiten Sync Sprint] Sprint has ${sprint.cards.length} cards`);
      
      // Lookup team once before processing cards
      const dbSprint = await storage.getSprint(sprintId);
      if (!dbSprint) {
        throw new Error(`Sprint ${sprintId} not found in database`);
      }
      const team = await storage.getTeamBySprintBoardId(dbSprint.boardId);
      if (!team) {
        throw new Error(`No team found for sprint board ${dbSprint.boardId}`);
      }
      log(`[Kaiten Sync Sprint] Found team ${team.teamName} (${team.teamId})`);
      
      const syncedTasks = [];
      
      // Создаем записи в tasks для каждой карточки из спринта
      for (const sprintCard of sprint.cards) {
        // Получаем детальную информацию по карточке чтобы получить parents_ids
        const card = await kaitenClient.getCard(sprintCard.id);
        log(`[Kaiten Sync Sprint] Syncing card ${card.id}: ${card.title}`);
        
        // Определяем init_card_id из parents_ids
        let initCardId: number | null = null;
        
        if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
          const parentCardId = card.parents_ids[0]; // Первый родитель
          log(`[Kaiten Sync Sprint]   Parent card_id: ${parentCardId}`);
          
          // Проверяем есть ли такая инициатива в базе
          const parentInitiative = await storage.getInitiativeByCardId(parentCardId);
          
          if (parentInitiative) {
            initCardId = parentCardId;
            log(`[Kaiten Sync Sprint]   ✓ Parent found in initiatives, setting init_card_id=${initCardId}`);
          } else {
            initCardId = 0;
            log(`[Kaiten Sync Sprint]   ✗ Parent NOT found in initiatives, setting init_card_id=0`);
          }
        } else {
          initCardId = 0;
          log(`[Kaiten Sync Sprint]   No parents_ids, setting init_card_id=0`);
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

        log(`[Kaiten Sync Sprint] Task ${card.id} "${card.title}" - type.name value: ${card.type?.name}`);

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

      log(`[Kaiten Sync Sprint] Synced ${syncedTasks.length} tasks from sprint ${sprintId}`);
      
      res.json({
        success: true,
        synced: syncedTasks.length,
        sprintId,
        tasks: syncedTasks
      });
    } catch (error) {
      console.error("POST /api/kaiten/sync-sprint/:sprintId error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync sprint" 
      });
    }
  });

  app.post("/api/kaiten/sync-all-sprints/:boardId", async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      if (isNaN(boardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }

      log(`[Kaiten Sync All Sprints] Starting sync for board ${boardId}`);
      
      // Lookup team once at the beginning
      const team = await storage.getTeamBySprintBoardId(boardId);
      if (!team) {
        return res.status(404).json({
          success: false,
          error: `No team found for sprint board ${boardId}`
        });
      }
      log(`[Kaiten Sync All Sprints] Found team ${team.teamName} (${team.teamId})`);
      
      // Шаг 1: Получаем все спринты через новый API с пагинацией
      log(`[Kaiten Sync All Sprints] Step 1: Fetching all sprints from Kaiten API`);
      
      const currentYear = new Date().getFullYear();
      let offset = 0;
      const limit = 100;
      const maxOffset = 500;
      let boardSprints: any[] = [];
      let foundPreviousYear = false;
      
      // Получаем спринты порциями пока не найдем спринты предыдущего года (до offset=500)
      while (!foundPreviousYear && offset < maxOffset) {
        log(`[Kaiten Sync All Sprints] Fetching sprints with offset ${offset}`);
        const allSprints = await kaitenClient.getAllSprints({ limit, offset });
        
        if (allSprints.length === 0) {
          log(`[Kaiten Sync All Sprints] No more sprints to fetch`);
          break;
        }
        
        // Фильтруем по board_id команды
        const batchBoardSprints = allSprints.filter(sprint => sprint.board_id === boardId);
        
        if (batchBoardSprints.length === 0) {
          log(`[Kaiten Sync All Sprints] No sprints found for board ${boardId} in this batch (offset=${offset}), fetching next batch`);
          offset += limit;
          continue;
        }
        
        // Добавляем найденные спринты команды в общий массив
        boardSprints.push(...batchBoardSprints);
        
        // Проверяем, есть ли спринты с датами предыдущего года
        for (const sprint of batchBoardSprints) {
          const startDate = new Date(sprint.start_date);
          const startYear = startDate.getFullYear();
          
          if (startYear < currentYear) {
            foundPreviousYear = true;
            log(`[Kaiten Sync All Sprints] Found sprint with previous year date: ${sprint.start_date} (Year: ${startYear})`);
            break;
          }
        }
        
        if (!foundPreviousYear) {
          log(`[Kaiten Sync All Sprints] All sprints in this batch are from ${currentYear}, fetching next batch`);
          offset += limit;
        }
      }
      
      if (offset >= maxOffset) {
        log(`[Kaiten Sync All Sprints] Reached max offset ${maxOffset}, stopping sprint fetch`);
      }
      
      log(`[Kaiten Sync All Sprints] Found total ${boardSprints.length} sprints for board ${boardId}`);
      
      // Если спринтов вообще не найдено - используем fallback на date filter API
      if (boardSprints.length === 0) {
        log(`[Kaiten Sync All Sprints] No sprints found on board ${boardId}. Using date filter API fallback.`);
        
        // Team уже загружен в начале endpoint, используем его
        log(`[Kaiten Sync All Sprints] Using team ${team.teamName}, sprintBoardId=${boardId} for task sync`);
        
        // Используем date filter API для получения задач
        const currentYear = new Date().getFullYear();
        const yearStart = new Date(currentYear, 0, 1).toISOString();
        
        log(`[Kaiten Sync All Sprints] Fetching tasks completed after ${yearStart} from sprint board ${boardId}`);
        
        const tasks = await kaitenClient.getCardsWithDateFilter({
          boardId: boardId,
          lastMovedToDoneAtAfter: yearStart,
          limit: 1000
        });
        
        log(`[Kaiten Sync All Sprints] Found ${tasks.length} cards from board ${boardId}`);
        
        let totalTasksSynced = 0;
        
        for (const taskCard of tasks) {
          try {
            // Пропускаем инициативные карточки (Epic, Compliance, Enabler)
            const cardType = taskCard.type?.name;
            if (cardType === 'Epic' || cardType === 'Compliance' || cardType === 'Enabler') {
              log(`[Kaiten Sync All Sprints] Skipping initiative card ${taskCard.id} "${taskCard.title}" (type: ${cardType})`);
              continue;
            }
            
            let initCardId = 0;
            if (taskCard.parents_ids && Array.isArray(taskCard.parents_ids) && taskCard.parents_ids.length > 0) {
              const parentId = taskCard.parents_ids[0];
              const parentInitiative = await storage.getInitiativeByCardId(parentId);
              if (parentInitiative) {
                initCardId = parentId;
              }
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
            
            await storage.syncTaskFromKaiten(
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
            
            totalTasksSynced++;
          } catch (taskError: unknown) {
            const errorMessage = taskError instanceof Error ? taskError.message : String(taskError);
            log(`[Kaiten Sync All Sprints] Error syncing task ${taskCard.id}: ${errorMessage}`);
          }
        }
        
        log(`[Kaiten Sync All Sprints] Fallback completed: synced ${totalTasksSynced} tasks via date filter API`);
        
        return res.json({
          success: true,
          sprintsSaved: 0,
          totalSynced: totalTasksSynced,
          sprintsProcessed: 0,
          results: [],
          message: `No sprints found. Synced ${totalTasksSynced} tasks via date filter API`
        });
      }
      
      // Шаг 3: Получаем существующие спринты из БД для этой команды
      log(`[Kaiten Sync All Sprints] Step 2: Checking existing sprints in database`);
      const existingSprints = await storage.getSprintsByBoardId(boardId);
      log(`[Kaiten Sync All Sprints] Found ${existingSprints.length} existing sprints in database`);
      
      // Шаг 4: Находим новые спринты (те, которых нет в БД по ID)
      const existingSprintIds = new Set(existingSprints.map(s => s.sprintId));
      const newSprints = boardSprints.filter(sprint => !existingSprintIds.has(sprint.id));
      log(`[Kaiten Sync All Sprints] Found ${newSprints.length} new sprints to sync`);
      
      // Шаг 5: Если новых спринтов нет, возвращаем результат без синхронизации
      if (newSprints.length === 0) {
        log(`[Kaiten Sync All Sprints] No new sprints found. All sprints are already in sync.`);
        return res.json({
          success: true,
          sprintsSaved: 0,
          totalSynced: 0,
          sprintsProcessed: 0,
          results: [],
          message: 'No new sprints found'
        });
      }
      
      // Шаг 6: Сохраняем только новые спринты в БД
      log(`[Kaiten Sync All Sprints] Step 3: Saving new sprints to database`);
      const savedSprints = [];
      for (const kaitenSprint of newSprints) {
        const saved = await storage.syncSprintFromKaiten(
          kaitenSprint.id,
          kaitenSprint.board_id,
          kaitenSprint.title,
          kaitenSprint.velocity,
          kaitenSprint.start_date,
          kaitenSprint.finish_date,
          kaitenSprint.actual_finish_date,
          kaitenSprint.goal
        );
        savedSprints.push(saved);
        log(`[Kaiten Sync All Sprints] Saved new sprint ${kaitenSprint.id}: "${kaitenSprint.title}"`);
      }
      
      // Шаг 7: Синхронизируем задачи только для новых спринтов
      log(`[Kaiten Sync All Sprints] Step 4: Syncing tasks for new sprints`);
      let totalSynced = 0;
      const results = [];

      for (const sprint of savedSprints) {
        try {
          log(`[Kaiten Sync All Sprints] Syncing tasks for sprint ${sprint.sprintId} (${sprint.title})`);
          
          // Получаем полные данные спринта с карточками
          const kaitenSprint = await kaitenClient.getSprint(sprint.sprintId);
          
          if (!kaitenSprint.cards || !Array.isArray(kaitenSprint.cards)) {
            log(`[Kaiten Sync All Sprints] No cards in sprint ${sprint.sprintId}`);
            results.push({ sprintId: sprint.sprintId, synced: 0 });
            continue;
          }

          let sprintSynced = 0;
          
          // Синхронизируем каждую карточку из спринта
          for (const sprintCard of kaitenSprint.cards) {
            const card = await kaitenClient.getCard(sprintCard.id);
            
            // Определяем init_card_id из parents_ids
            let initCardId: number | null = null;
            
            if (card.parents_ids && Array.isArray(card.parents_ids) && card.parents_ids.length > 0) {
              const parentCardId = card.parents_ids[0];
              const parentInitiative = await storage.getInitiativeByCardId(parentCardId);
              
              if (parentInitiative) {
                initCardId = parentCardId;
              } else {
                initCardId = 0;
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
              sprint.sprintId,
              card.last_moved_to_done_at ?? null,
              team.teamId
            );
            
            sprintSynced++;
            totalSynced++;
          }
          
          log(`[Kaiten Sync All Sprints] Sprint ${sprint.sprintId}: synced ${sprintSynced} tasks`);
          results.push({ sprintId: sprint.sprintId, synced: sprintSynced });
          
        } catch (sprintError: unknown) {
          const errorMessage = sprintError instanceof Error ? sprintError.message : 'Unknown error';
          log(`[Kaiten Sync All Sprints] Error syncing sprint ${sprint.sprintId}:`, errorMessage);
          results.push({ sprintId: sprint.sprintId, error: errorMessage });
        }
      }

      log(`[Kaiten Sync All Sprints] Completed. Saved ${savedSprints.length} new sprints, synced ${totalSynced} tasks`);
      
      res.json({
        success: true,
        sprintsSaved: savedSprints.length,
        totalSynced,
        sprintsProcessed: savedSprints.length,
        results
      });
    } catch (error) {
      console.error("POST /api/kaiten/sync-all-sprints/:boardId error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync all sprints" 
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

      log(`[Kaiten Sync Sprints] Starting sync for sprints on board ${boardId}`);
      
      // Получаем все спринты с доски из Kaiten
      const kaitenSprints = await kaitenClient.getSprintsFromBoard(boardId);
      log(`[Kaiten Sync Sprints] Found ${kaitenSprints.length} sprints in Kaiten`);

      const syncedSprints = [];
      
      for (const kaitenSprint of kaitenSprints) {
        // Получаем детальную информацию о спринте
        const sprintDetails = await kaitenClient.getSprint(kaitenSprint.id);
        
        log(`[Kaiten Sync Sprints] Syncing sprint ${sprintDetails.id}: "${sprintDetails.title}"`);
        log(`[Kaiten Sync Sprints] Sprint details:`, JSON.stringify(sprintDetails, null, 2));
        
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
      }

      log(`[Kaiten Sync Sprints] Successfully synced ${syncedSprints.length} sprints`);
      
      res.json({
        success: true,
        count: syncedSprints.length,
        sprints: syncedSprints
      });
    } catch (error) {
      console.error("POST /api/kaiten/sync-sprints/:boardId error:", error);
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

      log(`[Kaiten Sync Initiative Tasks] Starting sync for initiative board ${initBoardId}`);
      
      // Получаем начало текущего года
      const currentYear = new Date().getFullYear();
      const yearStart = new Date(currentYear, 0, 1).toISOString();
      
      log(`[Kaiten Sync Initiative Tasks] Fetching tasks completed after ${yearStart} from board ${initBoardId}`);
      
      // Получаем все задачи с фильтром по дате
      const tasks = await kaitenClient.getCardsWithDateFilter({
        boardId: initBoardId,
        lastMovedToDoneAtAfter: yearStart,
        limit: 1000
      });
      
      log(`[Kaiten Sync Initiative Tasks] Found ${tasks.length} tasks completed after ${yearStart}`);
      
      let totalTasksSynced = 0;
      const syncedTasks = [];
      
      // Сохраняем каждую задачу
      for (const taskCard of tasks) {
        try {
          // Определяем init_card_id по parent_id
          let initCardId = 0;
          if (taskCard.parents_ids && Array.isArray(taskCard.parents_ids) && taskCard.parents_ids.length > 0) {
            const parentId = taskCard.parents_ids[0];
            const parentInitiative = await storage.getInitiativeByCardId(parentId);
            if (parentInitiative) {
              initCardId = parentId;
              log(`[Kaiten Sync Initiative Tasks] Task ${taskCard.id} linked to initiative ${parentId}`);
            } else {
              log(`[Kaiten Sync Initiative Tasks] Task ${taskCard.id} has parent ${parentId} but it's not an initiative`);
            }
          } else {
            log(`[Kaiten Sync Initiative Tasks] Task ${taskCard.id} has no parent_id`);
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
          log(`[Kaiten Sync Initiative Tasks] Error syncing task ${taskCard.id}: ${errorMessage}`);
        }
      }
      
      log(`[Kaiten Sync Initiative Tasks] Successfully synced ${totalTasksSynced} tasks from Kaiten API`);
      
      res.json({
        success: true,
        synced: totalTasksSynced,
        tasks: syncedTasks
      });
    } catch (error) {
      console.error("POST /api/kaiten/sync-initiative-tasks/:initBoardId error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to sync initiative tasks" 
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

      log(`[Innovation Rate] Calculating for teams: ${teamIds.join(', ')}, year: ${year}`);

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
            // Команда имеет реальные спринты в этом году - берем задачи из спринтов
            const sprintIds = new Set(yearSprints.map(s => s.sprintId));
            const allTasks = await storage.getAllTasks();
            const teamSprintTasks = allTasks.filter(task => 
              task.teamId === team.teamId &&
              task.sprintId !== null && 
              sprintIds.has(task.sprintId) && 
              !processedTaskIds.has(task.cardId)
            );
            teamSprintTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
            log(`[Innovation Rate] Team ${team.teamId}: found ${teamSprintTasks.length} tasks in ${yearSprints.length} sprints`);
          } else {
            // Команда не имеет реальных спринтов в этом году - берем по doneDate
            const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
            const newTasks = teamTasks.filter(task => !processedTaskIds.has(task.cardId));
            newTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
            log(`[Innovation Rate] Team ${team.teamId}: found ${newTasks.length} tasks by doneDate (no sprints in year)`);
          }
        } else {
          // Команда вообще без спринтовой доски - берем по doneDate
          const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
          const newTasks = teamTasks.filter(task => !processedTaskIds.has(task.cardId));
          newTasks.forEach(task => {
            relevantTasks.push(task);
            processedTaskIds.add(task.cardId);
          });
          log(`[Innovation Rate] Team ${team.teamId}: found ${newTasks.length} tasks by doneDate (no sprint board)`);
        }
      }
      
      log(`[Innovation Rate] Found total ${relevantTasks.length} unique tasks across all teams`);

      // Получаем все инициативы для выбранных команд
      const allInitiatives = await Promise.all(
        validTeams.map(team => storage.getInitiativesByBoardId(team.initBoardId))
      );
      const initiatives = allInitiatives.flat();
      
      // Создаем мапу инициатив по cardId для быстрого поиска
      const initiativesMap = new Map(initiatives.map(init => [init.cardId, init]));
      
      log(`[Innovation Rate] Found ${initiatives.length} initiatives`);

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

      log(`[Innovation Rate] Total SP: ${totalSP}, Epic: ${typeStats['Epic'] || 0}, Compliance: ${typeStats['Compliance'] || 0}, Enabler: ${typeStats['Enabler'] || 0}`);
      log(`[Innovation Rate] Epic: ${epicPercent}%, Compliance: ${compliancePercent}%, Enabler: ${enablerPercent}%`);
      log(`[Innovation Rate] Actual IR (sum of rounded %): ${actualIR}%`);
      
      // Расчитываем разницу с плановым IR
      const plannedIR = department.plannedIr || 0;
      const diffFromPlanned = actualIR - plannedIR;

      log(`[Innovation Rate] Actual IR: ${actualIR}%, Planned IR: ${plannedIR}%, Diff: ${diffFromPlanned}%`);

      res.json({
        success: true,
        actualIR,
        plannedIR,
        diffFromPlanned,
        totalSP,
        innovationSP
      });
    } catch (error) {
      console.error("GET /api/metrics/innovation-rate error:", error);
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

      log(`[Cost Structure] Calculating for teams: ${teamIds.join(', ')}, year: ${year}`);

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
            // Команда имеет реальные спринты в этом году - берем задачи из спринтов
            const sprintIds = new Set(yearSprints.map(s => s.sprintId));
            const allTasks = await storage.getAllTasks();
            const teamSprintTasks = allTasks.filter(task => 
              task.teamId === team.teamId &&
              task.sprintId !== null && 
              sprintIds.has(task.sprintId) && 
              !processedTaskIds.has(task.cardId)
            );
            teamSprintTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
            log(`[Cost Structure] Team ${team.teamId}: found ${teamSprintTasks.length} tasks in ${yearSprints.length} sprints`);
          } else {
            // Команда не имеет реальных спринтов в этом году - берем по doneDate
            const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
            const newTasks = teamTasks.filter(task => !processedTaskIds.has(task.cardId));
            newTasks.forEach(task => {
              relevantTasks.push(task);
              processedTaskIds.add(task.cardId);
            });
            log(`[Cost Structure] Team ${team.teamId}: found ${newTasks.length} tasks by doneDate (no sprints in year)`);
          }
        } else {
          // Команда вообще без спринтовой доски - берем по doneDate
          const teamTasks = await storage.getTasksByTeamAndDoneDateRange(team.teamId, yearStart, yearEnd);
          const newTasks = teamTasks.filter(task => !processedTaskIds.has(task.cardId));
          newTasks.forEach(task => {
            relevantTasks.push(task);
            processedTaskIds.add(task.cardId);
          });
          log(`[Cost Structure] Team ${team.teamId}: found ${newTasks.length} tasks by doneDate (no sprint board)`);
        }
      }
      
      log(`[Cost Structure] Found total ${relevantTasks.length} unique tasks across all teams`);

      // Получаем все инициативы для выбранных команд
      const allInitiatives = await Promise.all(
        validTeams.map(team => storage.getInitiativesByBoardId(team.initBoardId))
      );
      const initiatives = allInitiatives.flat();
      
      // Создаем мапу инициатив по cardId для быстрого поиска
      const initiativesMap = new Map(initiatives.map(init => [init.cardId, init]));
      
      log(`[Cost Structure] Found ${initiatives.length} initiatives`);

      // Подсчитываем SP по типам инициатив
      const typeStats: Record<string, number> = {};
      let totalSP = 0;

      for (const task of relevantTasks) {
        const taskSize = task.size || 0;
        totalSP += taskSize;

        // Проверяем, привязан ли таск к инициативе
        if (task.initCardId !== null && task.initCardId !== 0) {
          const initiative = initiativesMap.get(task.initCardId);
          if (initiative && initiative.type) {
            // Используем тип инициативы
            typeStats[initiative.type] = (typeStats[initiative.type] || 0) + taskSize;
          } else {
            // Инициатива не найдена или нет типа - в "Др. доработки"
            typeStats['Др. доработки'] = (typeStats['Др. доработки'] || 0) + taskSize;
          }
        } else {
          // Таск не привязан к инициативе - используем тип задачи
          if (task.type) {
            // Маппинг типов задач к категориям структуры затрат
            let displayType = task.type;
            
            // Маппинг различных вариантов написания типов
            const typeMapping: Record<string, string> = {
              'Omni': 'Service Desk',
              'Technical Debt': 'Tech debt',
              'Tech Debt': 'Tech debt',
              'Tech Task': 'Tech debt'
            };
            
            // Применяем маппинг если есть
            if (typeMapping[task.type]) {
              displayType = typeMapping[task.type];
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

      log(`[Cost Structure] Total SP: ${totalSP}, Types: ${Object.keys(typeStats).length}`);

      res.json({
        success: true,
        year,
        totalSP,
        typeStats,
        typePercentages,
        teams: validTeams.map(t => ({ id: t.teamId, name: t.teamName }))
      });
    } catch (error) {
      console.error("GET /api/metrics/cost-structure error:", error);
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

      log(`[Value/Cost] Calculating for teams: ${teamIds.join(', ')}, year: ${year}`);

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
              log(`[Value/Cost] Team ${team.teamId}: using sprint filter with ${filteredSprints.length} sprints`);
            } else {
              log(`[Value/Cost] Team ${team.teamId}: no sprints in year ${year}, using doneDate filter`);
            }
          } else {
            log(`[Value/Cost] Team ${team.teamId}: no sprint board, using doneDate filter`);
          }
          
          // Для каждой инициативы получаем задачи, отфильтрованные по спринтам команды или по doneDate
          return Promise.all(
            initiatives.map(async (initiative) => {
              const allTasks = await storage.getTasksByInitCardId(initiative.cardId);
              
              // Фильтруем задачи в зависимости от типа команды
              let tasks: TaskRow[];
              if (useSprintFilter) {
                // Команда со спринтами - фильтруем по спринтам
                tasks = allTasks.filter(task => 
                  task.sprintId !== null && teamSprintIds.has(task.sprintId)
                );
              } else {
                // Команда без спринтов - фильтруем по doneDate и teamId
                tasks = allTasks.filter(task => 
                  task.teamId === team.teamId && 
                  task.doneDate !== null &&
                  task.doneDate !== '' &&
                  new Date(task.doneDate) >= yearStart &&
                  new Date(task.doneDate) <= yearEnd
                );
              }
              
              log(`[Value/Cost] Initiative ${initiative.cardId} "${initiative.title}": found ${allTasks.length} tasks total, ${tasks.length} tasks after filter (useSprintFilter=${useSprintFilter})`);
              
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

      log(`[Value/Cost] Found ${initiativesByCardId.size} unique initiatives`);

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
          
          log(`[Value/Cost] Init ${cardId} "${firstInit.title}" type=${firstInit.type} team=${initiative.teamName}: plannedSize=${plannedSize}, actualSize=${actualSize}, spPrice=${initiative.spPrice}`);
          
          // Плановые затраты считаем только для команд с фактическими затратами
          if (actualSize > 0) {
            totalPlannedCost += plannedSize * (initiative.spPrice || 0);
          }
          totalActualCost += actualSize * (initiative.spPrice || 0);
        }
        
        log(`[Value/Cost] Init ${cardId} total costs: planned=${totalPlannedCost}, actual=${totalActualCost}`);
        
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
          log(`[Value/Cost] Added to totals: plannedValue=${plannedValue}, factValue=${factValue}, plannedCost=${totalPlannedCost}, actualCost=${totalActualCost}`);
        }
      }

      // Рассчитываем коэффициенты Value/Cost
      const plannedValueCost = sumPlannedCost > 0 
        ? Math.round((sumPlannedValue / sumPlannedCost) * 10) / 10
        : 0;
      const factValueCost = sumFactCost > 0 
        ? Math.round((sumFactValue / sumFactCost) * 10) / 10
        : 0;

      log(`[Value/Cost] Planned: ${plannedValueCost} (${sumPlannedValue}/${sumPlannedCost}), Fact: ${factValueCost} (${sumFactValue}/${sumFactCost})`);

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
      console.error("GET /api/metrics/value-cost error:", error);
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

      log(`[Kaiten Raw Sprint] Fetching sprint ${sprintId} from Kaiten`);
      
      const sprint = await kaitenClient.getSprint(sprintId);
      
      log(`[Kaiten Raw Sprint] Sprint response keys: ${Object.keys(sprint).join(', ')}`);
      log(`[Kaiten Raw Sprint] Full response:`, JSON.stringify(sprint, null, 2));
      
      res.json(sprint);
    } catch (error) {
      console.error("GET /api/kaiten/sprint-raw/:sprintId error:", error);
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
      console.error("GET /api/kaiten/test error:", error);
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
      console.error("POST /api/sprints/:sprintId/generate-report error:", error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to generate report" 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
