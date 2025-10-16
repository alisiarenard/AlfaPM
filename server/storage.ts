import { type User, type InsertUser, type TeamData, type Department, type TeamRow, users, teamData, departments, teams } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getTeamData(): Promise<TeamData[]>;
  setTeamData(data: TeamData[]): Promise<void>;
  getDepartments(): Promise<Department[]>;
  getTeamsByDepartment(departmentId: string): Promise<TeamRow[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private teamData: TeamData[];

  constructor() {
    this.users = new Map();
    this.teamData = [];
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

  async getTeamData(): Promise<TeamData[]> {
    return this.teamData;
  }

  async setTeamData(data: TeamData[]): Promise<void> {
    this.teamData = data;
  }

  async getDepartments(): Promise<Department[]> {
    return [];
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    return [];
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

  async getTeamData(): Promise<TeamData[]> {
    const result = await db.select().from(teamData);
    return result.map((row: any) => row.data as TeamData);
  }

  async setTeamData(data: TeamData[]): Promise<void> {
    await db.transaction(async (tx: any) => {
      await tx.delete(teamData);
      
      if (data.length > 0) {
        await tx.insert(teamData).values(
          data.map((td: TeamData) => ({
            teamId: td.team.teamId,
            data: td,
          }))
        );
      }
    });
  }

  async getDepartments(): Promise<Department[]> {
    const result = await db.select().from(departments);
    return result;
  }

  async getTeamsByDepartment(departmentId: string): Promise<TeamRow[]> {
    const result = await db.select().from(teams).where(eq(teams.departmentId, departmentId));
    return result;
  }
}

export const storage = new DbStorage();
