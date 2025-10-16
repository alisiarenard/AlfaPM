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
