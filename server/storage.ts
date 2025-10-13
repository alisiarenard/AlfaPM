import { type User, type InsertUser, type TeamData } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getTeamData(): Promise<TeamData[]>;
  setTeamData(data: TeamData[]): Promise<void>;
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
}

export const storage = new MemStorage();
