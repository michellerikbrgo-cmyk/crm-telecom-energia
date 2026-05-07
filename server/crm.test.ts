import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(crmRole: string = "vendedor"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      crmRole,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as any,
  };
}

describe("CRM Router Structure", () => {
  it("should have contacts router with list, add, bulkAdd", () => {
    expect(appRouter._def.procedures).toHaveProperty("contacts.list");
    expect(appRouter._def.procedures).toHaveProperty("contacts.add");
    expect(appRouter._def.procedures).toHaveProperty("contacts.bulkAdd");
  });

  it("should have pendentes router with list and create", () => {
    expect(appRouter._def.procedures).toHaveProperty("pendentes.list");
    expect(appRouter._def.procedures).toHaveProperty("pendentes.create");
  });

  it("should have contracts router with list and create", () => {
    expect(appRouter._def.procedures).toHaveProperty("contracts.list");
    expect(appRouter._def.procedures).toHaveProperty("contracts.create");
  });

  it("should have campaigns router with list and create", () => {
    expect(appRouter._def.procedures).toHaveProperty("campaigns.list");
    expect(appRouter._def.procedures).toHaveProperty("campaigns.create");
  });

  it("should have ai router with askObjection", () => {
    expect(appRouter._def.procedures).toHaveProperty("ai.askObjection");
  });

  it("should have calls router with log", () => {
    expect(appRouter._def.procedures).toHaveProperty("calls.log");
  });

  it("should have sos router with create", () => {
    expect(appRouter._def.procedures).toHaveProperty("sos.create");
  });

  it("should have distribution router with getNext and repescagem", () => {
    expect(appRouter._def.procedures).toHaveProperty("distribution.getNext");
    expect(appRouter._def.procedures).toHaveProperty("distribution.repescagem");
  });

  it("should have blacklist router with add", () => {
    expect(appRouter._def.procedures).toHaveProperty("blacklist.add");
  });

  it("should have gamification router with ranking", () => {
    expect(appRouter._def.procedures).toHaveProperty("gamification.ranking");
  });

  it("should have audit router with list", () => {
    expect(appRouter._def.procedures).toHaveProperty("audit.list");
  });

  it("should have scripts router with list and create", () => {
    expect(appRouter._def.procedures).toHaveProperty("scripts.list");
    expect(appRouter._def.procedures).toHaveProperty("scripts.create");
  });

  it("should have sales router with list and create", () => {
    expect(appRouter._def.procedures).toHaveProperty("sales.list");
    expect(appRouter._def.procedures).toHaveProperty("sales.create");
  });

  it("should have dashboard router with stats", () => {
    expect(appRouter._def.procedures).toHaveProperty("dashboard.stats");
  });

  it("should have auth router with me and logout", () => {
    expect(appRouter._def.procedures).toHaveProperty("auth.me");
    expect(appRouter._def.procedures).toHaveProperty("auth.logout");
  });
});
