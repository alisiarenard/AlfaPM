import { type User, type InsertUser, type TeamData, type Department, type TeamRow, type InitiativeRow, type InsertInitiative, users, departments, teams, initiatives } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDepartments(): Promise<Department[]>;
  getTeamsByDepartment(departmentId: string): Promise<TeamRow[]>;
  getAllInitiatives(): Promise<InitiativeRow[]>;
  getInitiativesByBoardId(initBoardId: number): Promise<InitiativeRow[]>;
  getInitiative(id: string): Promise<InitiativeRow | undefined>;
  createInitiative(initiative: InsertInitiative): Promise<InitiativeRow>;
  updateInitiative(id: string, initiative: Partial<InsertInitiative>): Promise<InitiativeRow | undefined>;
  deleteInitiative(id: string): Promise<void>;
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

  async getDepartments(): Promise<Department[]> {
    return [];
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    return [];
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

  async createInitiative(initiative: InsertInitiative): Promise<InitiativeRow> {
    const id = randomUUID();
    return { ...initiative, id };
  }

  async updateInitiative(id: string, initiative: Partial<InsertInitiative>): Promise<InitiativeRow> {
    throw new Error("Not implemented");
  }

  async deleteInitiative(id: string): Promise<void> {
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

  async getDepartments(): Promise<Department[]> {
    const result = await db.select().from(departments);
    return result;
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    const result = await db.select().from(teams).where(eq(teams.departmentId, departmentId));
    return result;
  }

  async getAllInitiatives(): Promise<InitiativeRow[]> {
    const result = await db.select().from(initiatives);
    return result;
  }

  async getInitiativesByBoardId(initBoardId: number): Promise<InitiativeRow[]> {
    const result = await db.select().from(initiatives).where(eq(initiatives.initBoardId, initBoardId));
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
}

export const storage = new DbStorage();
