import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";

const teamDataSchema = z.array(z.object({
  team: z.object({
    boardId: z.string(),
    teamId: z.string(),
    name: z.string(),
    velocity: z.number(),
    sprintDuration: z.number().optional(),
  }),
  initiatives: z.array(z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    type: z.string().optional(),
    startDate: z.string(),
    size: z.number(),
    involvement: z.number(),
    sprints: z.array(z.object({
      sprintId: z.string(),
      name: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      storyPoints: z.number(),
    })),
  })),
}));

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/team-data", async (req, res) => {
    try {
      const validatedData = teamDataSchema.parse(req.body);
      await storage.setTeamData(validatedData);
      res.json({ success: true, message: "Data uploaded successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ 
          success: false, 
          error: "Invalid data format", 
          details: error.errors 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: "Internal server error" 
        });
      }
    }
  });

  app.get("/api/team-data", async (req, res) => {
    try {
      const data = await storage.getTeamData();
      res.json(data);
    } catch (error) {
      console.error("GET /api/team-data error:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to retrieve data" 
      });
    }
  });

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

  const httpServer = createServer(app);

  return httpServer;
}
