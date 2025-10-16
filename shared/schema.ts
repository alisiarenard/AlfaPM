import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const teamData = pgTable("team_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: text("team_id").notNull().unique(),
  data: jsonb("data").notNull(),
});

export const insertTeamDataSchema = createInsertSchema(teamData).omit({ id: true });
export type InsertTeamData = z.infer<typeof insertTeamDataSchema>;
export type TeamDataRow = typeof teamData.$inferSelect;

export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  department: varchar("department").notNull(),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

export const teams = pgTable("teams", {
  spaceId: integer("space_id").notNull(),
  sprintBoardId: integer("sprint_board_id").notNull(),
  initBoardId: integer("init_board_id").notNull(),
  teamId: varchar("team_id").primaryKey().default(sql`gen_random_uuid()`),
  teamName: varchar("team_name").notNull(),
  vilocity: integer("vilocity").notNull(),
  sprintDuration: integer("sprint_duration").notNull(),
  departmentId: varchar("department_id").notNull(),
  spPrice: integer("sp_price").notNull(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ teamId: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type TeamRow = typeof teams.$inferSelect;

export interface Sprint {
  sprintId: string;
  name: string;
  startDate: string;
  endDate: string;
  storyPoints: number;
}

export interface Initiative {
  id: string;
  name: string;
  status: string;
  type?: string;
  startDate: string;
  size: number;
  involvement: number;
  sprints: Sprint[];
}

export interface Team {
  boardId: string;
  teamId: string;
  name: string;
  velocity: number;
  sprintDuration?: number;
}

export interface TeamData {
  team: Team;
  initiatives: Initiative[];
}
