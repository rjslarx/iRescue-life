import { type User, type InsertUser, type AdoptionContractTemplate, type InsertAdoptionContractTemplate } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { users, adoptionContractTemplates } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Contract template methods
  getAllContractTemplates(tenantId: string): Promise<AdoptionContractTemplate[]>;
  getContractTemplateById(id: string, tenantId: string): Promise<AdoptionContractTemplate | null>;
  getDefaultContractTemplate(tenantId: string): Promise<AdoptionContractTemplate | null>;
  createContractTemplate(data: InsertAdoptionContractTemplate): Promise<AdoptionContractTemplate>;
  updateContractTemplate(id: string, tenantId: string, updates: Partial<InsertAdoptionContractTemplate>): Promise<AdoptionContractTemplate | null>;
  deleteContractTemplate(id: string, tenantId: string): Promise<void>;
  setDefaultContractTemplate(id: string, tenantId: string): Promise<AdoptionContractTemplate | null>;
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

  // Contract template methods (using database since this is a DB-backed app)
  async getAllContractTemplates(tenantId: string): Promise<AdoptionContractTemplate[]> {
    const templates = await db
      .select()
      .from(adoptionContractTemplates)
      .where(eq(adoptionContractTemplates.tenantId, tenantId))
      .orderBy(desc(adoptionContractTemplates.isDefault), desc(adoptionContractTemplates.createdAt));
    return templates;
  }

  async getContractTemplateById(id: string, tenantId: string): Promise<AdoptionContractTemplate | null> {
    const [template] = await db
      .select()
      .from(adoptionContractTemplates)
      .where(
        and(
          eq(adoptionContractTemplates.id, parseInt(id)),
          eq(adoptionContractTemplates.tenantId, tenantId)
        )
      )
      .limit(1);
    return template || null;
  }

  async getDefaultContractTemplate(tenantId: string): Promise<AdoptionContractTemplate | null> {
    const [template] = await db
      .select()
      .from(adoptionContractTemplates)
      .where(
        and(
          eq(adoptionContractTemplates.tenantId, tenantId),
          eq(adoptionContractTemplates.isDefault, true)
        )
      )
      .limit(1);
    return template || null;
  }

  async createContractTemplate(data: InsertAdoptionContractTemplate): Promise<AdoptionContractTemplate> {
    const [template] = await db
      .insert(adoptionContractTemplates)
      .values(data)
      .returning();
    return template;
  }

  async updateContractTemplate(
    id: string,
    tenantId: string,
    updates: Partial<InsertAdoptionContractTemplate>
  ): Promise<AdoptionContractTemplate | null> {
    const [template] = await db
      .update(adoptionContractTemplates)
      .set(updates)
      .where(
        and(
          eq(adoptionContractTemplates.id, parseInt(id)),
          eq(adoptionContractTemplates.tenantId, tenantId)
        )
      )
      .returning();
    return template || null;
  }

  async deleteContractTemplate(id: string, tenantId: string): Promise<void> {
    await db
      .delete(adoptionContractTemplates)
      .where(
        and(
          eq(adoptionContractTemplates.id, parseInt(id)),
          eq(adoptionContractTemplates.tenantId, tenantId)
        )
      );
  }

  async setDefaultContractTemplate(id: string, tenantId: string): Promise<AdoptionContractTemplate | null> {
    // First, unset any existing default
    await db
      .update(adoptionContractTemplates)
      .set({ isDefault: false })
      .where(
        and(
          eq(adoptionContractTemplates.tenantId, tenantId),
          eq(adoptionContractTemplates.isDefault, true)
        )
      );

    // Then set the new default
    const [template] = await db
      .update(adoptionContractTemplates)
      .set({ isDefault: true })
      .where(
        and(
          eq(adoptionContractTemplates.id, parseInt(id)),
          eq(adoptionContractTemplates.tenantId, tenantId)
        )
      )
      .returning();
    return template || null;
  }
}

export const storage = new MemStorage();
