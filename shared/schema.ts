import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, pgEnum, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const initiativeStateEnum = pgEnum("initiative_state", ["1-queued", "2-inProgress", "3-done"]);
export const initiativeConditionEnum = pgEnum("initiative_condition", ["1-live", "2-archived"]);

export const initiatives = pgTable("initiatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cardId: integer("card_id").notNull(),
  title: varchar("title").notNull(),
  state: initiativeStateEnum("state").notNull(),
  condition: initiativeConditionEnum("condition").notNull(),
  size: real("size").notNull(),
  initBoardId: integer("init_board_id").notNull(),
  type: varchar("type"),
  plannedInvolvement: integer("planned_involvement"),
  plannedValueId: varchar("planned_value_id"),
  plannedValue: varchar("planned_value"),
  factValueId: varchar("fact_value_id"),
  factValue: varchar("fact_value"),
  dueDate: varchar("due_date"),
  doneDate: varchar("done_date"),
});

export const insertInitiativeSchema = createInsertSchema(initiatives).omit({ id: true });
export type InsertInitiative = z.infer<typeof insertInitiativeSchema>;
export type InitiativeRow = typeof initiatives.$inferSelect;

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cardId: integer("card_id").notNull(),
  title: varchar("title").notNull(),
  created: varchar("created").notNull(),
  state: initiativeStateEnum("state").notNull(),
  size: real("size").notNull(),
  condition: initiativeConditionEnum("condition").notNull(),
  boardId: integer("board_id").notNull(),
  sprintId: integer("sprint_id"),
  completedAt: varchar("completed_at"),
  type: varchar("type"),
  initCardId: integer("init_card_id"),
  archived: boolean("archived").notNull().default(false),
  doneDate: varchar("done_date"),
  teamId: varchar("team_id"),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskRow = typeof tasks.$inferSelect;

export const sprints = pgTable("sprints", {
  sprintId: integer("sprint_id").primaryKey(),
  boardId: integer("board_id").notNull(),
  title: varchar("title").notNull(),
  velocity: real("velocity").notNull(),
  startDate: varchar("start_date").notNull(),
  finishDate: varchar("finish_date").notNull(),
  actualFinishDate: varchar("actual_finish_date"),
  goal: varchar("goal"),
});

export const insertSprintSchema = createInsertSchema(sprints);
export type InsertSprint = z.infer<typeof insertSprintSchema>;
export type SprintRow = typeof sprints.$inferSelect;

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

export const departments = pgTable("departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  department: varchar("department").notNull(),
  plannedIr: integer("planned_ir"),
  plannedVc: integer("planned_vc"),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;
export type DepartmentWithTeamCount = Department & { teamCount: number };

export const teams = pgTable("teams", {
  spaceId: integer("space_id").notNull(),
  spaceName: varchar("space_name"),
  initSpaceId: integer("init_space_id"),
  initSpaceName: varchar("init_space_name"),
  sprintBoardId: integer("sprint_board_id"),
  initBoardId: integer("init_board_id").notNull(),
  teamId: varchar("team_id").primaryKey().default(sql`gen_random_uuid()`),
  teamName: varchar("team_name").notNull(),
  vilocity: real("vilocity").notNull(),
  sprintDuration: integer("sprint_duration").notNull(),
  departmentId: varchar("department_id").notNull(),
  spPrice: integer("sp_price").notNull(),
  hasSprints: boolean("has_sprints").notNull().default(true),
  omniBoardId: integer("omni_board_id"),
});

export const insertTeamSchema = createInsertSchema(teams)
  .omit({ teamId: true, sprintBoardId: true })
  .extend({
    sprintBoardId: z.number().nullable().optional(),
  });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type TeamRow = typeof teams.$inferSelect;

export const teamYearlyData = pgTable("team_yearly_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull(),
  year: integer("year").notNull(),
  vilocity: real("vilocity").notNull(),
  sprintDuration: integer("sprint_duration").notNull(),
  spPrice: integer("sp_price").notNull().default(0),
  hasSprints: boolean("has_sprints").notNull().default(true),
});

export const insertTeamYearlyDataSchema = createInsertSchema(teamYearlyData).omit({ id: true });
export type InsertTeamYearlyData = z.infer<typeof insertTeamYearlyDataSchema>;
export type TeamYearlyDataRow = typeof teamYearlyData.$inferSelect;

export interface TaskInSprint {
  id: string;
  cardId: number;
  title: string;
  type: string | null;
  size: number;
  archived: boolean;
  doneDate: string | null;
}

export interface SprintAllocation {
  sprint_id: number;
  sp: number;
  tasks: TaskInSprint[];
}

export interface Initiative {
  id: string;
  cardId: number;
  title: string;
  state: string;
  condition: string;
  size: number;
  initBoardId: number;
  type: string | null;
  sprints: SprintAllocation[];
  involvement: number | null;
  plannedInvolvement: number | null;
  plannedValueId: string | null;
  plannedValue: string | null;
  factValueId: string | null;
  factValue: string | null;
  dueDate: string | null;
  doneDate: string | null;
  teamBreakdown?: Record<string, number>;
  totalDoneSP?: number;
}

export interface Team {
  boardId: string;
  teamId: string;
  name: string;
  velocity: number;
  sprintDuration?: number;
  initBoardId: number;
  sprintBoardId: number | null;
  spaceId: number;
  spPrice: number;
}

export interface TeamData {
  team: Team;
  initiatives: Initiative[];
}
