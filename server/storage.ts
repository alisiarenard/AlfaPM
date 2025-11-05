import { type User, type InsertUser, type TeamData, type Department, type DepartmentWithTeamCount, type TeamRow, type InitiativeRow, type InsertInitiative, type TaskRow, type InsertTask, type SprintRow, type InsertSprint, users, departments, teams, initiatives, tasks, sprints } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, sql, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDepartments(): Promise<DepartmentWithTeamCount[]>;
  createDepartment(department: { department: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department>;
  updateDepartment(id: string, department: { department?: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department | undefined>;
  getTeamsByDepartment(departmentId: string): Promise<TeamRow[]>;
  getTeamById(teamId: string): Promise<TeamRow | undefined>;
  createTeam(team: { teamName: string; spaceId: number; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice?: number; departmentId: string }): Promise<TeamRow>;
  updateTeam(teamId: string, team: Partial<{ teamName: string; spaceId: number; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice: number; departmentId: string }>): Promise<TeamRow | undefined>;
  getAllInitiatives(): Promise<InitiativeRow[]>;
  getInitiativesByBoardId(initBoardId: number): Promise<InitiativeRow[]>;
  getInitiative(id: string): Promise<InitiativeRow | undefined>;
  getInitiativeByCardId(cardId: number): Promise<InitiativeRow | undefined>;
  createInitiative(initiative: InsertInitiative): Promise<InitiativeRow>;
  updateInitiative(id: string, initiative: Partial<InsertInitiative>): Promise<InitiativeRow | undefined>;
  deleteInitiative(id: string): Promise<void>;
  syncInitiativeFromKaiten(
    cardId: number, 
    boardId: number, 
    title: string, 
    state: "1-queued" | "2-inProgress" | "3-done", 
    condition: "1-live" | "2-archived", 
    size: number,
    type?: string | null,
    plannedValueId?: string | null,
    plannedValue?: string | null
  ): Promise<InitiativeRow>;
  getAllTasks(): Promise<TaskRow[]>;
  getTasksByBoardId(boardId: number): Promise<TaskRow[]>;
  getTasksByInitCardId(initCardId: number): Promise<TaskRow[]>;
  getTask(id: string): Promise<TaskRow | undefined>;
  getTaskByCardId(cardId: number): Promise<TaskRow | undefined>;
  createTask(task: InsertTask): Promise<TaskRow>;
  updateTask(id: string, task: Partial<InsertTask>): Promise<TaskRow | undefined>;
  deleteTask(id: string): Promise<void>;
  syncTaskFromKaiten(
    cardId: number,
    boardId: number,
    title: string,
    created: string,
    state: "1-queued" | "2-inProgress" | "3-done",
    size: number,
    condition: "1-live" | "2-archived",
    archived: boolean,
    initCardId?: number | null,
    type?: string,
    completedAt?: string,
    sprintId?: number | null
  ): Promise<TaskRow>;
  getAllSprints(): Promise<SprintRow[]>;
  getSprintsByBoardId(boardId: number): Promise<SprintRow[]>;
  getSprint(sprintId: number): Promise<SprintRow | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getDepartments(): Promise<DepartmentWithTeamCount[]> {
    return [];
  }

  async createDepartment(department: { department: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department> {
    const id = randomUUID();
    return { id, department: department.department, plannedIr: department.plannedIr || null, plannedVc: department.plannedVc || null };
  }

  async updateDepartment(id: string, department: { department?: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department | undefined> {
    return undefined;
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    return [];
  }

  async getTeamById(teamId: string): Promise<TeamRow | undefined> {
    return undefined;
  }

  async createTeam(team: { teamName: string; spaceId: number; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice?: number; departmentId: string }): Promise<TeamRow> {
    return {} as TeamRow;
  }

  async updateTeam(teamId: string, team: Partial<{ teamName: string; spaceId: number; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice: number; departmentId: string }>): Promise<TeamRow | undefined> {
    return undefined;
  }

  async getAllInitiatives(): Promise<InitiativeRow[]> {
    return [];
  }

  async getInitiativesByBoardId(initBoardId: number): Promise<InitiativeRow[]> {
    return [];
  }

  async getInitiative(id: string): Promise<InitiativeRow | undefined> {
    return undefined;
  }

  async getInitiativeByCardId(cardId: number): Promise<InitiativeRow | undefined> {
    return undefined;
  }

  async createInitiative(initiative: InsertInitiative): Promise<InitiativeRow> {
    const id = randomUUID();
    return { 
      ...initiative, 
      id, 
      type: initiative.type ?? null, 
      plannedInvolvement: initiative.plannedInvolvement ?? null,
      plannedValueId: initiative.plannedValueId ?? null,
      plannedValue: initiative.plannedValue ?? null
    };
  }

  async updateInitiative(id: string, initiative: Partial<InsertInitiative>): Promise<InitiativeRow | undefined> {
    throw new Error("Not implemented");
  }

  async deleteInitiative(id: string): Promise<void> {
    return;
  }

  async syncInitiativeFromKaiten(
    cardId: number, 
    boardId: number, 
    title: string, 
    state: "1-queued" | "2-inProgress" | "3-done", 
    condition: "1-live" | "2-archived", 
    size: number,
    type?: string | null,
    plannedValueId?: string | null,
    plannedValue?: string | null
  ): Promise<InitiativeRow> {
    const id = randomUUID();
    return { 
      id, 
      cardId, 
      title, 
      state, 
      condition, 
      size, 
      initBoardId: boardId, 
      type: type || null, 
      plannedInvolvement: null,
      plannedValueId: plannedValueId || null,
      plannedValue: plannedValue || null
    };
  }

  async getAllTasks(): Promise<TaskRow[]> {
    return [];
  }

  async getTasksByBoardId(boardId: number): Promise<TaskRow[]> {
    return [];
  }

  async getTasksByInitCardId(initCardId: number): Promise<TaskRow[]> {
    return [];
  }

  async getTask(id: string): Promise<TaskRow | undefined> {
    return undefined;
  }

  async getTaskByCardId(cardId: number): Promise<TaskRow | undefined> {
    return undefined;
  }

  async createTask(task: InsertTask): Promise<TaskRow> {
    const id = randomUUID();
    return { 
      ...task, 
      id,
      archived: task.archived ?? false,
      sprintId: task.sprintId ?? null,
      type: task.type ?? null,
      completedAt: task.completedAt ?? null,
      initCardId: task.initCardId ?? 0
    };
  }

  async updateTask(id: string, task: Partial<InsertTask>): Promise<TaskRow | undefined> {
    throw new Error("Not implemented");
  }

  async deleteTask(id: string): Promise<void> {
    return;
  }

  async syncTaskFromKaiten(
    cardId: number,
    boardId: number,
    title: string,
    created: string,
    state: "1-queued" | "2-inProgress" | "3-done",
    size: number,
    condition: "1-live" | "2-archived",
    archived: boolean,
    initCardId?: number | null,
    type?: string,
    completedAt?: string,
    sprintId?: number | null
  ): Promise<TaskRow> {
    const id = randomUUID();
    return {
      id,
      cardId,
      boardId,
      title,
      created,
      state,
      size,
      condition,
      archived,
      sprintId: sprintId ?? null,
      initCardId: initCardId ?? 0,
      type: type ?? null,
      completedAt: completedAt ?? null
    };
  }

  async getAllSprints(): Promise<SprintRow[]> {
    return [];
  }

  async getSprintsByBoardId(boardId: number): Promise<SprintRow[]> {
    return [];
  }

  async getSprint(sprintId: number): Promise<SprintRow | undefined> {
    return undefined;
  }
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return result;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.query.users.findFirst({
      where: eq(users.username, username),
    });
    return result;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getDepartments(): Promise<DepartmentWithTeamCount[]> {
    const result = await db
      .select({
        id: departments.id,
        department: departments.department,
        plannedIr: departments.plannedIr,
        plannedVc: departments.plannedVc,
        teamCount: sql<number>`(SELECT COUNT(*)::int FROM ${teams} WHERE ${teams.departmentId} = ${departments.id})`,
      })
      .from(departments);
    return result;
  }

  async createDepartment(department: { department: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department> {
    const [newDepartment] = await db.insert(departments).values(department).returning();
    return newDepartment;
  }

  async updateDepartment(id: string, department: { department?: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department | undefined> {
    const [updated] = await db.update(departments)
      .set(department)
      .where(eq(departments.id, id))
      .returning();
    return updated;
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    const result = await db.select().from(teams).where(eq(teams.departmentId, departmentId));
    return result;
  }

  async getTeamById(teamId: string): Promise<TeamRow | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.teamId, teamId));
    return result;
  }

  async createTeam(team: { teamName: string; spaceId: number; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice?: number; departmentId: string }): Promise<TeamRow> {
    const [newTeam] = await db.insert(teams).values({
      ...team,
      spPrice: team.spPrice ?? 0
    }).returning();
    return newTeam;
  }

  async updateTeam(teamId: string, team: Partial<{ teamName: string; spaceId: number; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice: number; departmentId: string }>): Promise<TeamRow | undefined> {
    const [updated] = await db.update(teams)
      .set(team)
      .where(eq(teams.teamId, teamId))
      .returning();
    return updated;
  }

  async getAllInitiatives(): Promise<InitiativeRow[]> {
    const result = await db.select().from(initiatives);
    return result;
  }

  async getInitiativesByBoardId(initBoardId: number): Promise<InitiativeRow[]> {
    const result = await db
      .select()
      .from(initiatives)
      .where(eq(initiatives.initBoardId, initBoardId))
      .orderBy(
        asc(sql`
          CASE 
            WHEN ${initiatives.cardId} = 0 THEN 1
            WHEN ${initiatives.state} = '3-done' THEN 2
            WHEN ${initiatives.state} = '2-inProgress' THEN 3
            WHEN ${initiatives.state} = '1-queued' THEN 4
            ELSE 5
          END
        `)
      );
    return result;
  }

  async getInitiative(id: string): Promise<InitiativeRow | undefined> {
    const result = await db.query.initiatives.findFirst({
      where: eq(initiatives.id, id),
    });
    return result;
  }

  async createInitiative(initiative: InsertInitiative): Promise<InitiativeRow> {
    const [result] = await db.insert(initiatives).values(initiative).returning();
    return result;
  }

  async updateInitiative(id: string, updateData: Partial<InsertInitiative>): Promise<InitiativeRow | undefined> {
    const [result] = await db
      .update(initiatives)
      .set(updateData)
      .where(eq(initiatives.id, id))
      .returning();
    return result;
  }

  async deleteInitiative(id: string): Promise<void> {
    await db.delete(initiatives).where(eq(initiatives.id, id));
  }

  async getInitiativeByCardId(cardId: number): Promise<InitiativeRow | undefined> {
    const result = await db.query.initiatives.findFirst({
      where: eq(initiatives.cardId, cardId),
    });
    return result;
  }

  async syncInitiativeFromKaiten(
    cardId: number, 
    boardId: number, 
    title: string, 
    state: "1-queued" | "2-inProgress" | "3-done", 
    condition: "1-live" | "2-archived", 
    size: number,
    type?: string | null,
    plannedValueId?: string | null,
    plannedValue?: string | null
  ): Promise<InitiativeRow> {
    const existing = await this.getInitiativeByCardId(cardId);
    
    if (existing) {
      const [updated] = await db
        .update(initiatives)
        .set({ 
          title, 
          state, 
          condition, 
          size, 
          initBoardId: boardId, 
          type: type || null,
          plannedValueId: plannedValueId || null,
          plannedValue: plannedValue || null
        })
        .where(eq(initiatives.cardId, cardId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(initiatives)
        .values({ 
          cardId, 
          title, 
          state, 
          condition, 
          size, 
          initBoardId: boardId, 
          type: type || null,
          plannedValueId: plannedValueId || null,
          plannedValue: plannedValue || null
        })
        .returning();
      return created;
    }
  }

  async getAllTasks(): Promise<TaskRow[]> {
    const result = await db.select().from(tasks);
    return result;
  }

  async getTasksByBoardId(boardId: number): Promise<TaskRow[]> {
    const result = await db.select().from(tasks).where(eq(tasks.boardId, boardId));
    return result;
  }

  async getTasksByInitCardId(initCardId: number): Promise<TaskRow[]> {
    const result = await db.select().from(tasks).where(eq(tasks.initCardId, initCardId));
    return result;
  }

  async getTask(id: string): Promise<TaskRow | undefined> {
    const result = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });
    return result;
  }

  async getTaskByCardId(cardId: number): Promise<TaskRow | undefined> {
    const result = await db.query.tasks.findFirst({
      where: eq(tasks.cardId, cardId),
    });
    return result;
  }

  async createTask(task: InsertTask): Promise<TaskRow> {
    const [result] = await db.insert(tasks).values(task).returning();
    return result;
  }

  async updateTask(id: string, updateData: Partial<InsertTask>): Promise<TaskRow | undefined> {
    const [result] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .returning();
    return result;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async syncTaskFromKaiten(
    cardId: number,
    boardId: number,
    title: string,
    created: string,
    state: "1-queued" | "2-inProgress" | "3-done",
    size: number,
    condition: "1-live" | "2-archived",
    archived: boolean,
    initCardId?: number | null,
    type?: string,
    completedAt?: string,
    sprintId?: number | null
  ): Promise<TaskRow> {
    const existing = await this.getTaskByCardId(cardId);
    
    if (existing) {
      const [updated] = await db
        .update(tasks)
        .set({ 
          title, 
          created,
          state, 
          size,
          condition,
          archived,
          boardId,
          sprintId: sprintId ?? null,
          initCardId: initCardId ?? 0,
          type: type ?? null,
          completedAt: completedAt ?? null
        })
        .where(eq(tasks.cardId, cardId))
        .returning();
      return updated;
    } else {
      const [newTask] = await db
        .insert(tasks)
        .values({ 
          cardId, 
          title, 
          created: created,
          state, 
          size,
          condition,
          archived,
          boardId,
          sprintId: sprintId ?? null,
          initCardId: initCardId ?? 0,
          type: type ?? null,
          completedAt: completedAt ?? null
        })
        .returning();
      return newTask;
    }
  }

  async getAllSprints(): Promise<SprintRow[]> {
    const result = await db.select().from(sprints).orderBy(asc(sprints.startDate));
    return result;
  }

  async getSprintsByBoardId(boardId: number): Promise<SprintRow[]> {
    const result = await db.select().from(sprints)
      .where(eq(sprints.boardId, boardId))
      .orderBy(asc(sprints.startDate));
    return result;
  }

  async getSprint(sprintId: number): Promise<SprintRow | undefined> {
    const result = await db.query.sprints.findFirst({
      where: eq(sprints.sprintId, sprintId),
    });
    return result;
  }
}

export const storage = new DbStorage();
