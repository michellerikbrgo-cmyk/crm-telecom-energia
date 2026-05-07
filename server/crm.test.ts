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
  it("should have contacts router", () => {
    expect(appRouter._def.procedures).toHaveProperty("contacts.list");
    expect(appRouter._def.procedures).toHaveProperty("contacts.add");
    expect(appRouter._def.procedures).toHaveProperty("contacts.bulkAdd");
  });

  it("should have pendentes router", () => {
    expect(appRouter._def.procedures).toHaveProperty("pendentes.list");
    expect(appRouter._def.procedures).toHaveProperty("pendentes.create");
  });

  it("should have contracts router", () => {
    expect(appRouter._def.procedures).toHaveProperty("contracts.list");
    expect(appRouter._def.procedures).toHaveProperty("contracts.create");
  });

  it("should have campaigns router", () => {
    expect(appRouter._def.procedures).toHaveProperty("campaigns.list");
    expect(appRouter._def.procedures).toHaveProperty("campaigns.create");
  });

  it("should have ai router", () => {
    expect(appRouter._def.procedures).toHaveProperty("ai.askObjection");
  });

  it("should have calls router", () => {
    expect(appRouter._def.procedures).toHaveProperty("calls.log");
  });

  it("should have sos router", () => {
    expect(appRouter._def.procedures).toHaveProperty("sos.create");
  });

  it("should have auth router with me and logout", () => {
    expect(appRouter._def.procedures).toHaveProperty("auth.me");
    expect(appRouter._def.procedures).toHaveProperty("auth.logout");
  });
});
