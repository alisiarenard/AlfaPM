import { type User, type InsertUser, type TeamData, type Department, type DepartmentWithTeamCount, type TeamRow, type InitiativeRow, type InsertInitiative, type TaskRow, type InsertTask, type SprintRow, type InsertSprint, type TeamYearlyDataRow, type InsertTeamYearlyData, users, departments, teams, initiatives, tasks, sprints, teamYearlyData } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, sql, asc, desc, and, gte, lt } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDepartments(): Promise<DepartmentWithTeamCount[]>;
  createDepartment(department: { department: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department>;
  updateDepartment(id: string, department: { department?: string; plannedIr?: number | null; plannedVc?: number | null }): Promise<Department | undefined>;
  getAllTeams(): Promise<TeamRow[]>;
  getTeamsByDepartment(departmentId: string): Promise<TeamRow[]>;
  getTeamById(teamId: string): Promise<TeamRow | undefined>;
  getTeamBySprintBoardId(sprintBoardId: number): Promise<TeamRow | undefined>;
  getTeamByInitBoardId(initBoardId: number): Promise<TeamRow | undefined>;
  createTeam(team: { teamName: string; spaceId: number; spaceName?: string; initSpaceId?: number; initSpaceName?: string; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice?: number; departmentId: string; omniBoardId?: number }): Promise<TeamRow>;
  updateTeam(teamId: string, team: Partial<{ teamName: string; spaceId: number; spaceName: string; initSpaceId: number; initSpaceName: string; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice: number; departmentId: string; omniBoardId: number | null }>): Promise<TeamRow | undefined>;
  deleteTeam(teamId: string): Promise<void>;
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
    plannedValue?: string | null,
    factValueId?: string | null,
    factValue?: string | null,
    dueDate?: string | null,
    doneDate?: string | null
  ): Promise<InitiativeRow>;
  archiveInitiativesNotInList(boardId: number, activeCardIds: number[]): Promise<void>;
  getAllTasks(): Promise<TaskRow[]>;
  getTasksByBoardId(boardId: number): Promise<TaskRow[]>;
  getTasksByInitCardId(initCardId: number): Promise<TaskRow[]>;
  getTask(id: string): Promise<TaskRow | undefined>;
  getTaskByCardId(cardId: number): Promise<TaskRow | undefined>;
  createTask(task: InsertTask): Promise<TaskRow>;
  updateTask(id: string, task: Partial<InsertTask>): Promise<TaskRow | undefined>;
  deleteTask(id: string): Promise<void>;
  deleteTasksForSprint(sprintId: number): Promise<void>;
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
    sprintId?: number | null,
    doneDate?: string | null,
    teamId?: string | null
  ): Promise<TaskRow>;
  getAllSprints(): Promise<SprintRow[]>;
  getSprintsByBoardId(boardId: number): Promise<SprintRow[]>;
  getSprint(sprintId: number): Promise<SprintRow | undefined>;
  getLatestSprintByBoardId(boardId: number): Promise<SprintRow | undefined>;
  getTasksBySprint(sprintId: number): Promise<TaskRow[]>;
  getTasksByTeamAndDoneDateRange(teamId: string, startDate: Date, endDate: Date): Promise<TaskRow[]>;
  getSprintInfo(sprintId: number): Promise<{
    sprint: SprintRow;
    tasks: Array<{
      id: string;
      cardId: number;
      title: string;
      size: number;
      initiativeTitle: string | null;
      initiativeCardId: number | null;
    }>;
  } | null>;
  getTeamYearlyData(teamId: string, year: number): Promise<TeamYearlyDataRow | undefined>;
  getTeamYearlyDataAll(teamId: string): Promise<TeamYearlyDataRow[]>;
  getAllTeamYearlyData(): Promise<TeamYearlyDataRow[]>;
  upsertTeamYearlyData(data: InsertTeamYearlyData): Promise<TeamYearlyDataRow>;
  deleteTeamYearlyData(teamId: string): Promise<void>;
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

  async getAllTeams(): Promise<TeamRow[]> {
    return [];
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    return [];
  }

  async getTeamById(teamId: string): Promise<TeamRow | undefined> {
    return undefined;
  }

  async getTeamBySprintBoardId(sprintBoardId: number): Promise<TeamRow | undefined> {
    return undefined;
  }

  async getTeamByInitBoardId(initBoardId: number): Promise<TeamRow | undefined> {
    return undefined;
  }

  async createTeam(team: { teamName: string; spaceId: number; spaceName?: string; initSpaceId?: number; initSpaceName?: string; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice?: number; departmentId: string; omniBoardId?: number }): Promise<TeamRow> {
    return {} as TeamRow;
  }

  async updateTeam(teamId: string, team: Partial<{ teamName: string; spaceId: number; spaceName: string; initSpaceId: number; initSpaceName: string; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice: number; departmentId: string; omniBoardId: number | null }>): Promise<TeamRow | undefined> {
    return undefined;
  }

  async deleteTeam(teamId: string): Promise<void> {
    return;
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
      plannedValue: initiative.plannedValue ?? null,
      factValueId: initiative.factValueId ?? null,
      factValue: initiative.factValue ?? null,
      dueDate: initiative.dueDate ?? null,
      doneDate: initiative.doneDate ?? null
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
    plannedValue?: string | null,
    factValueId?: string | null,
    factValue?: string | null,
    dueDate?: string | null,
    doneDate?: string | null
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
      type: type ?? null, 
      plannedInvolvement: null,
      plannedValueId: plannedValueId ?? null,
      plannedValue: plannedValue ?? null,
      factValueId: factValueId ?? null,
      factValue: factValue ?? null,
      dueDate: dueDate ?? null,
      doneDate: doneDate ?? null
    };
  }

  async archiveInitiativesNotInList(boardId: number, activeCardIds: number[]): Promise<void> {
    return;
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
      initCardId: task.initCardId ?? 0,
      doneDate: task.doneDate ?? null,
      teamId: task.teamId ?? null
    };
  }

  async updateTask(id: string, task: Partial<InsertTask>): Promise<TaskRow | undefined> {
    throw new Error("Not implemented");
  }

  async deleteTask(id: string): Promise<void> {
    return;
  }

  async deleteTasksForSprint(sprintId: number): Promise<void> {
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
    sprintId?: number | null,
    doneDate?: string | null,
    teamId?: string | null
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
      completedAt: completedAt ?? null,
      doneDate: doneDate ?? null,
      teamId: teamId ?? null
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

  async getLatestSprintByBoardId(boardId: number): Promise<SprintRow | undefined> {
    return undefined;
  }

  async getTasksBySprint(sprintId: number): Promise<TaskRow[]> {
    return [];
  }

  async getTasksByTeamAndDoneDateRange(teamId: string, startDate: Date, endDate: Date): Promise<TaskRow[]> {
    return [];
  }

  async getSprintInfo(sprintId: number): Promise<{
    sprint: SprintRow;
    tasks: Array<{
      id: string;
      cardId: number;
      title: string;
      size: number;
      initiativeTitle: string | null;
      initiativeCardId: number | null;
    }>;
  } | null> {
    return null;
  }

  async getTeamYearlyData(teamId: string, year: number): Promise<TeamYearlyDataRow | undefined> {
    return undefined;
  }

  async getTeamYearlyDataAll(teamId: string): Promise<TeamYearlyDataRow[]> {
    return [];
  }

  async getAllTeamYearlyData(): Promise<TeamYearlyDataRow[]> {
    return [];
  }

  async upsertTeamYearlyData(data: InsertTeamYearlyData): Promise<TeamYearlyDataRow> {
    return {} as TeamYearlyDataRow;
  }

  async deleteTeamYearlyData(teamId: string): Promise<void> {
    return;
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

  async getAllTeams(): Promise<TeamRow[]> {
    const result = await db.select().from(teams);
    return result;
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    const result = await db.select().from(teams).where(eq(teams.departmentId, departmentId));
    return result;
  }

  async getTeamById(teamId: string): Promise<TeamRow | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.teamId, teamId));
    return result;
  }

  async getTeamBySprintBoardId(sprintBoardId: number): Promise<TeamRow | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.sprintBoardId, sprintBoardId));
    return result;
  }

  async getTeamByInitBoardId(initBoardId: number): Promise<TeamRow | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.initBoardId, initBoardId));
    return result;
  }

  async createTeam(team: { teamName: string; spaceId: number; spaceName?: string; initSpaceId?: number; initSpaceName?: string; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice?: number; departmentId: string; omniBoardId?: number }): Promise<TeamRow> {
    const [newTeam] = await db.insert(teams).values({
      ...team,
      spPrice: team.spPrice ?? 0
    }).returning();
    return newTeam;
  }

  async updateTeam(teamId: string, team: Partial<{ teamName: string; spaceId: number; spaceName: string; initSpaceId: number; initSpaceName: string; sprintBoardId: number; initBoardId: number; vilocity: number; sprintDuration: number; spPrice: number; departmentId: string; omniBoardId: number | null }>): Promise<TeamRow | undefined> {
    const [updated] = await db.update(teams)
      .set(team)
      .where(eq(teams.teamId, teamId))
      .returning();
    return updated;
  }

  async deleteTeam(teamId: string): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    await db.transaction(async (tx) => {
      await tx.delete(tasks).where(eq(tasks.teamId, teamId));

      if (team.sprintBoardId) {
        await tx.delete(sprints).where(eq(sprints.boardId, team.sprintBoardId));
      }

      await tx.delete(teamYearlyData).where(eq(teamYearlyData.teamId, teamId));

      await tx.delete(teams).where(eq(teams.teamId, teamId));
    });
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
    plannedValue?: string | null,
    factValueId?: string | null,
    factValue?: string | null,
    dueDate?: string | null,
    doneDate?: string | null
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
          plannedValue: plannedValue || null,
          factValueId: factValueId || null,
          factValue: factValue || null,
          dueDate: dueDate || null,
          doneDate: doneDate || null
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
          plannedValue: plannedValue || null,
          factValueId: factValueId || null,
          factValue: factValue || null,
          dueDate: dueDate || null,
          doneDate: doneDate || null
        })
        .returning();
      return created;
    }
  }

  async archiveInitiativesNotInList(boardId: number, activeCardIds: number[]): Promise<void> {
    const cardIdSet = new Set(activeCardIds);
    
    // Получаем все инициативы этой доски
    const boardInitiatives = await this.getInitiativesByBoardId(boardId);
    
    // Находим те, которых нет в списке активных
    const initiativesToArchive = boardInitiatives.filter(init => !cardIdSet.has(init.cardId));
    
    if (initiativesToArchive.length > 0) {
      console.log(`[Archive Initiatives] Archiving ${initiativesToArchive.length} initiatives not in sync list for board ${boardId}`);
      
      // Помечаем как archived
      for (const initiative of initiativesToArchive) {
        await db
          .update(initiatives)
          .set({ condition: "2-archived" })
          .where(eq(initiatives.cardId, initiative.cardId));
      }
      
      console.log(`[Archive Initiatives] Archived initiatives: ${initiativesToArchive.map(i => i.cardId).join(', ')}`);
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

  async deleteTasksForSprint(sprintId: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.sprintId, sprintId));
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
    sprintId?: number | null,
    doneDate?: string | null,
    teamId?: string | null
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
          completedAt: completedAt ?? null,
          doneDate: doneDate ?? null,
          teamId: teamId ?? null
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
          completedAt: completedAt ?? null,
          doneDate: doneDate ?? null,
          teamId: teamId ?? null
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

  async getLatestSprintByBoardId(boardId: number): Promise<SprintRow | undefined> {
    const result = await db.select().from(sprints)
      .where(eq(sprints.boardId, boardId))
      .orderBy(desc(sprints.startDate))
      .limit(1);
    return result[0];
  }

  async getTasksBySprint(sprintId: number): Promise<TaskRow[]> {
    const result = await db.select().from(tasks)
      .where(eq(tasks.sprintId, sprintId))
      .orderBy(asc(tasks.created));
    return result;
  }

  async getTasksByTeamAndDoneDateRange(teamId: string, startDate: Date, endDate: Date): Promise<TaskRow[]> {
    // Добавляем буферы для учета timezone: вычитаем 1 день от начала и добавляем 1 день к концу
    // Это гарантирует включение всех задач независимо от их timezone
    const startDateInclusive = new Date(startDate);
    startDateInclusive.setDate(startDateInclusive.getDate() - 1);
    
    const endDateInclusive = new Date(endDate);
    endDateInclusive.setDate(endDateInclusive.getDate() + 2);
    
    const result = await db.select().from(tasks)
      .where(
        and(
          eq(tasks.teamId, teamId),
          gte(tasks.doneDate, startDateInclusive.toISOString()),
          lt(tasks.doneDate, endDateInclusive.toISOString())
        )
      )
      .orderBy(asc(tasks.created));
    return result;
  }

  async getSprintInfo(sprintId: number): Promise<{
    sprint: SprintRow;
    tasks: Array<{
      id: string;
      cardId: number;
      title: string;
      size: number;
      initiativeTitle: string | null;
      initiativeCardId: number | null;
    }>;
  } | null> {
    const sprint = await this.getSprint(sprintId);
    if (!sprint) {
      return null;
    }

    const sprintTasks = await this.getTasksBySprint(sprintId);

    // Собираем все уникальные initCardId (кроме null и 0)
    const uniqueInitCardIds = Array.from(
      new Set(
        sprintTasks
          .map(task => task.initCardId)
          .filter(id => id !== null && id !== undefined && id !== 0)
      )
    ) as number[];

    // Получаем все инициативы одним запросом
    const initiativesMap = new Map<number, InitiativeRow>();
    if (uniqueInitCardIds.length > 0) {
      const foundInitiatives = await db.select().from(initiatives)
        .where(sql`${initiatives.cardId} IN (${sql.join(uniqueInitCardIds.map(id => sql`${id}`), sql`, `)})`);
      
      foundInitiatives.forEach(initiative => {
        initiativesMap.set(initiative.cardId, initiative);
      });
    }

    // Формируем результат
    const tasksWithInitiatives = sprintTasks.map((task) => {
      let initiativeTitle: string | null = null;
      let initiativeCardId: number | null = null;

      if (task.initCardId === 0) {
        initiativeTitle = "Поддержка бизнеса";
        initiativeCardId = 0;
      } else if (task.initCardId && task.initCardId !== 0) {
        const initiative = initiativesMap.get(task.initCardId);
        if (initiative) {
          initiativeTitle = initiative.title;
          initiativeCardId = initiative.cardId;
        }
      }

      return {
        id: task.id,
        cardId: task.cardId,
        title: task.title,
        size: task.size,
        initiativeTitle,
        initiativeCardId,
      };
    });

    return {
      sprint,
      tasks: tasksWithInitiatives,
    };
  }

  async syncSprintFromKaiten(
    sprintId: number,
    boardId: number,
    title: string,
    velocity: number,
    startDate: string,
    finishDate: string,
    actualFinishDate: string | null,
    goal: string | null
  ): Promise<SprintRow> {
    const existing = await this.getSprint(sprintId);
    
    if (existing) {
      const [updated] = await db
        .update(sprints)
        .set({ 
          boardId,
          title,
          velocity,
          startDate,
          finishDate,
          actualFinishDate: actualFinishDate || null,
          goal: goal || null
        })
        .where(eq(sprints.sprintId, sprintId))
        .returning();
      return updated;
    } else {
      const [newSprint] = await db
        .insert(sprints)
        .values({
          sprintId,
          boardId,
          title,
          velocity,
          startDate,
          finishDate,
          actualFinishDate: actualFinishDate || null,
          goal: goal || null
        })
        .returning();
      return newSprint;
    }
  }

  async getTeamYearlyData(teamId: string, year: number): Promise<TeamYearlyDataRow | undefined> {
    const [result] = await db.select().from(teamYearlyData)
      .where(and(eq(teamYearlyData.teamId, teamId), eq(teamYearlyData.year, year)));
    return result;
  }

  async getTeamYearlyDataAll(teamId: string): Promise<TeamYearlyDataRow[]> {
    return await db.select().from(teamYearlyData)
      .where(eq(teamYearlyData.teamId, teamId))
      .orderBy(asc(teamYearlyData.year));
  }

  async getAllTeamYearlyData(): Promise<TeamYearlyDataRow[]> {
    return await db.select().from(teamYearlyData);
  }

  async upsertTeamYearlyData(data: InsertTeamYearlyData): Promise<TeamYearlyDataRow> {
    const existing = await this.getTeamYearlyData(data.teamId, data.year);
    if (existing) {
      const [updated] = await db.update(teamYearlyData)
        .set({
          vilocity: data.vilocity,
          sprintDuration: data.sprintDuration,
          spPrice: data.spPrice,
          hasSprints: data.hasSprints,
        })
        .where(eq(teamYearlyData.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(teamYearlyData).values(data).returning();
    return created;
  }

  async deleteTeamYearlyData(teamId: string): Promise<void> {
    await db.delete(teamYearlyData).where(eq(teamYearlyData.teamId, teamId));
  }
}

export const storage = new DbStorage();

export async function migrateTeamsToYearlyData() {
  try {
    const currentYear = new Date().getFullYear();
    const allTeams = await db.select().from(teams);
    for (const team of allTeams) {
      const existing = await db.select().from(teamYearlyData)
        .where(and(eq(teamYearlyData.teamId, team.teamId), eq(teamYearlyData.year, currentYear)));
      if (existing.length === 0) {
        await db.insert(teamYearlyData).values({
          teamId: team.teamId,
          year: currentYear,
          vilocity: team.vilocity,
          sprintDuration: team.sprintDuration,
          spPrice: team.spPrice,
          hasSprints: team.hasSprints,
        });
      }
    }
  } catch (e) {
    console.warn("migrateTeamsToYearlyData: skipped, table may not exist yet. Run db:push first.", (e as Error).message);
  }
}
