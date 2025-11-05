import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInitiativeSchema, insertTaskSchema, insertDepartmentSchema } from "@shared/schema";
import { kaitenClient } from "./kaiten";
import { log } from "./vite";

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
      
      // Автоматическая синхронизация инициатив с Kaiten
      if (teamData.initBoardId) {
        try {
          log(`[Team Creation] Starting automatic sync for board ${teamData.initBoardId}`);
          
          const cards = await kaitenClient.getCardsFromBoard(teamData.initBoardId);
          log(`[Team Creation] Found ${cards.length} cards to sync`);
          
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
            
            // Получаем plannedValue из properties по ключу plannedValueId
            const rawPlanned = card.properties?.[plannedValueId];
            const plannedValue = rawPlanned == null ? undefined : String(rawPlanned);
            
            // Получаем factValue из properties по ключу factValueId
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
          // Логируем ошибку синхронизации, но не блокируем создание команды
          console.error("[Team Creation] Initiative sync error:", syncError);
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
      const initiativesWithInvolvement = filteredInitiatives.map(initiative => {
        // Если нет спринтов - involvement = null
        if (initiative.sprints.length === 0) {
          return {
            ...initiative,
            involvement: null
          };
        }
        
        // Создаем map спринтов с датами для быстрого доступа
        const sprintDataMap = new Map(
          teamSprints.map(s => [s.sprintId, { 
            startDate: new Date(s.startDate),
            finishDate: new Date(s.finishDate)
          }])
        );
        
        // Получаем спринты инициативы с датами
        const initiativeSprintsWithDates = initiative.sprints
          .map(s => ({
            ...s,
            startDate: sprintDataMap.get(s.sprint_id)?.startDate,
            finishDate: sprintDataMap.get(s.sprint_id)?.finishDate
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
          // Для inProgress - ближайший спринт к текущей дате
          const now = new Date();
          const sortedSprints = teamSprints
            .map(s => ({
              ...s,
              startDate: new Date(s.startDate),
              distance: Math.abs(new Date(s.startDate).getTime() - now.getTime())
            }))
            .sort((a, b) => a.distance - b.distance);
          
          lastSprintDate = sortedSprints.length > 0 
            ? sortedSprints[0].startDate 
            : new Date(Math.max(...initiativeSprintsWithDates.map(s => s.startDate!.getTime())));
        } else {
          // Для done - последний спринт с ненулевыми SP (максимальная дата начала)
          lastSprintDate = new Date(Math.max(...initiativeSprintsWithDates.map(s => s.startDate!.getTime())));
        }
        
        // Получаем все спринты в период [firstSprintDate, lastSprintDate]
        const periodSprintIds = teamSprints
          .filter(s => {
            const sprintStart = new Date(s.startDate);
            return sprintStart >= firstSprintDate && sprintStart <= lastSprintDate;
          })
          .map(s => s.sprintId);
        
        // Считаем сумму SP данной инициативы за период
        const initiativeSp = initiative.sprints
          .filter(s => periodSprintIds.includes(s.sprint_id))
          .reduce((sum, s) => sum + s.sp, 0);
        
        // Считаем сумму SP всех инициатив за период
        const totalSp = filteredInitiatives.reduce((sum, init) => {
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
      
      res.json(initiativesWithInvolvement);
    } catch (error) {
      console.error("GET /api/initiatives/board/:initBoardId error:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve initiatives" 
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
      
      const cards = await kaitenClient.getCardsFromBoard(boardId);
      log(`[Kaiten Sync] Found ${cards.length} cards`);

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
            card.sprint_id ?? null // sprint_id from Kaiten
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
          sprintId
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

      log(`[Kaiten Sync All Sprints] Starting sync for all sprints on board ${boardId}`);
      
      // Получаем все спринты для этой доски
      const sprints = await storage.getSprintsByBoardId(boardId);
      log(`[Kaiten Sync All Sprints] Found ${sprints.length} sprints`);

      let totalSynced = 0;
      const results = [];

      // Синхронизируем задачи для каждого спринта
      for (const sprint of sprints) {
        try {
          log(`[Kaiten Sync All Sprints] Syncing sprint ${sprint.sprintId} (${sprint.title})`);
          
          // Получаем данные спринта из Kaiten
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
            
            // Логирование для отладки
            if (card.id === 56806578 || card.id === 56806579) {
              log(`[Kaiten Sync Debug] Card ${card.id} "${card.title}": size from Kaiten = ${card.size}, will save as ${card.size || 0}`);
            }
            
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
              sprint.sprintId
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

      log(`[Kaiten Sync All Sprints] Completed. Total synced: ${totalSynced} tasks`);
      
      res.json({
        success: true,
        totalSynced,
        sprintsProcessed: sprints.length,
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

  app.get("/api/metrics/innovation-rate", async (req, res) => {
    try {
      const teamIdsParam = req.query.teamIds as string;
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }

      log(`[Innovation Rate] Calculating for teams: ${teamIds.join(', ')}`);

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

      // Получаем все спринты для выбранных команд
      const allSprints = await Promise.all(
        validTeams.map(team => storage.getSprintsByBoardId(team.sprintBoardId))
      );
      const sprintIds = new Set(allSprints.flat().map(s => s.sprintId));
      
      log(`[Innovation Rate] Found ${sprintIds.size} unique sprints`);

      // Получаем все таски из этих спринтов
      const allTasks = await storage.getAllTasks();
      const relevantTasks = allTasks.filter(task => 
        task.sprintId !== null && sprintIds.has(task.sprintId)
      );
      
      log(`[Innovation Rate] Found ${relevantTasks.length} tasks in selected sprints`);

      // Подсчитываем SP
      let totalSP = 0;
      let innovationSP = 0;

      for (const task of relevantTasks) {
        const taskSize = task.size || 0;
        totalSP += taskSize;

        // Таск относится к инновациям, если у него есть родительская инициатива (init_card_id !== null и !== 0)
        if (task.initCardId !== null && task.initCardId !== 0) {
          innovationSP += taskSize;
        }
      }

      log(`[Innovation Rate] Total SP: ${totalSP}, Innovation SP: ${innovationSP}`);

      // Расчитываем фактический IR
      const actualIR = totalSP > 0 ? Math.round((innovationSP / totalSP) * 100) : 0;
      
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

      // Получаем все спринты для выбранных команд
      const allSprints = await Promise.all(
        validTeams.map(team => storage.getSprintsByBoardId(team.sprintBoardId))
      );
      
      // Фильтруем спринты по году
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      
      const yearSprints = allSprints.flat().filter(sprint => {
        const sprintStart = new Date(sprint.startDate);
        return sprintStart >= yearStart && sprintStart <= yearEnd;
      });
      
      const sprintIds = new Set(yearSprints.map(s => s.sprintId));
      
      log(`[Cost Structure] Found ${sprintIds.size} sprints in year ${year}`);

      // Получаем все таски из этих спринтов
      const allTasks = await storage.getAllTasks();
      const relevantTasks = allTasks.filter(task => 
        task.sprintId !== null && sprintIds.has(task.sprintId)
      );
      
      log(`[Cost Structure] Found ${relevantTasks.length} tasks in selected sprints`);

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
      
      if (!teamIdsParam) {
        return res.status(400).json({ 
          success: false, 
          error: "teamIds parameter is required" 
        });
      }

      const teamIds = teamIdsParam.split(',').map(id => id.trim()).filter(id => id);
      
      if (teamIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: "At least one team ID is required" 
        });
      }

      log(`[Value/Cost] Calculating for teams: ${teamIds.join(', ')}`);

      // Получаем команды
      const teams = await Promise.all(teamIds.map(id => storage.getTeamById(id)));
      const validTeams = teams.filter((t): t is NonNullable<typeof t> => t !== undefined);
      
      if (validTeams.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: "No valid teams found" 
        });
      }

      // Получаем все инициативы для выбранных команд
      const allInitiatives = await Promise.all(
        validTeams.map(team => storage.getInitiativesByBoardId(team.initBoardId))
      );
      const initiatives = allInitiatives.flat();
      
      // Группируем инициативы по cardId для исключения дубликатов
      const initiativesByCardId = new Map<number, typeof initiatives>();
      initiatives.forEach((initiative) => {
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
        
        // Суммируем затраты по всем командам, работающим с этой инициативой
        let totalPlannedCost = 0;
        let totalActualCost = 0;
        
        for (const initiative of relatedInitiatives) {
          const team = validTeams.find(t => t.initBoardId === initiative.initBoardId);
          if (!team) continue;
          
          const tasks = await storage.getTasksByInitCardId(initiative.cardId);
          const actualSize = tasks.reduce((sum, task) => sum + task.size, 0);
          const plannedSize = initiative.size || 0;
          
          totalPlannedCost += plannedSize * (team.spPrice || 0);
          totalActualCost += actualSize * (team.spPrice || 0);
        }
        
        // Получаем plannedValue и factValue из первой инициативы
        const plannedValue = firstInit.plannedValue && firstInit.plannedValue.trim() !== '' 
          ? parseFloat(firstInit.plannedValue) 
          : 0;
        const factValue = firstInit.factValue && firstInit.factValue.trim() !== '' 
          ? parseFloat(firstInit.factValue) 
          : 0;
        
        // Добавляем к суммам
        sumPlannedValue += plannedValue;
        sumPlannedCost += totalPlannedCost;
        sumFactValue += factValue;
        sumFactCost += totalActualCost;
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

  const httpServer = createServer(app);

  return httpServer;
}
