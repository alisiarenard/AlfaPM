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
      const team = await storage.createTeam(teamData);
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
      if (isNaN(initBoardId)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid board ID" 
        });
      }
      const initiatives = await storage.getInitiativesByBoardId(initBoardId);
      
      // Добавляем массив sprints для каждой инициативы
      const initiativesWithSprints = await Promise.all(
        initiatives.map(async (initiative) => {
          // Получаем все таски для данной инициативы
          const tasks = await storage.getTasksByInitCardId(initiative.cardId);
          
          // Группируем по sprint_id и считаем сумму size
          const sprintsMap = new Map<number, number>();
          tasks.forEach(task => {
            if (task.sprintId !== null) {
              const currentSp = sprintsMap.get(task.sprintId) || 0;
              sprintsMap.set(task.sprintId, currentSp + task.size);
            }
          });
          
          // Преобразуем в массив объектов {sprint_id, sp}
          const sprints = Array.from(sprintsMap.entries()).map(([sprint_id, sp]) => ({
            sprint_id,
            sp
          }));
          
          return {
            ...initiative,
            sprints
          };
        })
      );
      
      res.json(initiativesWithSprints);
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

        const synced = await storage.syncInitiativeFromKaiten(
          card.id,
          boardId,
          card.title,
          state,
          condition,
          card.size || 0
        );
        
        syncedInitiatives.push(synced);
      }

      log(`[Kaiten Sync] Successfully synced ${syncedInitiatives.length} initiatives`);
      
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

          const synced = await storage.syncTaskFromKaiten(
            card.id,
            boardId,
            card.title,
            card.created || new Date().toISOString(),
            state,
            card.size || 0,
            condition,
            initCardId, // parent card_id from parents_ids
            card.type_id?.toString(),
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
      for (const card of sprint.cards) {
        log(`[Kaiten Sync Sprint] Syncing card ${card.id}: ${card.title}`);
        
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
          null, // init_card_id оставляем пустым
          card.type_id?.toString(),
          card.completed_at ?? undefined,
          sprintId // передаем sprint_id
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
