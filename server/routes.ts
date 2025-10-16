import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertInitiativeSchema, insertTaskSchema } from "@shared/schema";
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
      res.json(initiatives);
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
      
      // Step 1: Get list of card IDs from board
      const boardCards = await kaitenClient.getCardsFromBoard(boardId);
      log(`[Kaiten Sync Tasks] Found ${boardCards.length} parent cards on board`);

      const syncedTasks = [];
      let totalChildrenProcessed = 0;
      
      // Step 2: Fetch each card individually to get children
      for (const boardCard of boardCards) {
        const card = await kaitenClient.getCard(boardCard.id);
        log(`[Kaiten Sync Tasks] Card ${card.id} - children: ${card.children?.length || 0}`);
        
        if (card.children && Array.isArray(card.children)) {
          log(`[Kaiten Sync Tasks] Card ${card.id} has ${card.children.length} children`);
          
          for (const child of card.children) {
            totalChildrenProcessed++;
            log(`[Kaiten Sync Tasks]   Child ${child.id}: state=${child.state}, sprint_id=${child.sprint_id}, title="${child.title}"`);
            
            // Filter: state === 3 and sprint_id is not empty (not null, undefined, 0, or empty string)
            if (child.state === 3 && child.sprint_id && child.sprint_id !== 0) {
              log(`[Kaiten Sync Tasks]   ✓ Syncing child ${child.id}`);
              
              let state: "1-queued" | "2-inProgress" | "3-done";
              
              if (child.state === 3) {
                state = "3-done";
              } else if (child.state === 2) {
                state = "2-inProgress";
              } else {
                state = "1-queued";
              }
              
              const condition: "1-live" | "2-archived" = child.archived ? "2-archived" : "1-live";

              const synced = await storage.syncTaskFromKaiten(
                child.id,
                boardId,
                child.title,
                child.created || new Date().toISOString(),
                state,
                child.size || 0,
                condition,
                card.id, // parent card_id goes to init_card_id
                child.type_id?.toString(),
                child.completed_at ?? undefined
              );
              
              syncedTasks.push(synced);
            }
          }
        }
      }

      log(`[Kaiten Sync Tasks] Processed ${totalChildrenProcessed} children total, synced ${syncedTasks.length} tasks`);
      
      res.json({
        success: true,
        count: syncedTasks.length,
        totalChildrenProcessed,
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
