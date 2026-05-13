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
      loginMethod: "email",
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

  it("should have ai router with askObjection and roleplayTurn", () => {
    expect(appRouter._def.procedures).toHaveProperty("ai.askObjection");
    expect(appRouter._def.procedures).toHaveProperty("ai.roleplayTurn");
  });

  it("should have calls router with log", () => {
    expect(appRouter._def.procedures).toHaveProperty("calls.log");
  });

  it("should have sos router with create and openList", () => {
    expect(appRouter._def.procedures).toHaveProperty("sos.create");
    expect(appRouter._def.procedures).toHaveProperty("sos.openList");
  });

  it("should have distribution router with getNext and repescagem", () => {
    expect(appRouter._def.procedures).toHaveProperty("distribution.getNext");
    expect(appRouter._def.procedures).toHaveProperty("distribution.repescagem");
  });

  it("should have blacklist router with add and remove", () => {
    expect(appRouter._def.procedures).toHaveProperty("blacklist.add");
    expect(appRouter._def.procedures).toHaveProperty("blacklist.remove");
  });

  it("should have beta router for feature suggestions", () => {
    expect(appRouter._def.procedures).toHaveProperty("beta.submit");
    expect(appRouter._def.procedures).toHaveProperty("beta.listMine");
    expect(appRouter._def.procedures).toHaveProperty("beta.listPending");
    expect(appRouter._def.procedures).toHaveProperty("beta.listAccepted");
    expect(appRouter._def.procedures).toHaveProperty("beta.review");
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

  it("should have sales router with list, pipeline, create, update and dossier", () => {
    expect(appRouter._def.procedures).toHaveProperty("sales.list");
    expect(appRouter._def.procedures).toHaveProperty("sales.pipeline");
    expect(appRouter._def.procedures).toHaveProperty("sales.create");
    expect(appRouter._def.procedures).toHaveProperty("sales.update");
    expect(appRouter._def.procedures).toHaveProperty("sales.saveContractDossier");
  });

  it("should have dashboard router with stats", () => {
    expect(appRouter._def.procedures).toHaveProperty("dashboard.stats");
  });

  it("should have origins router with list and create", () => {
    expect(appRouter._def.procedures).toHaveProperty("origins.list");
    expect(appRouter._def.procedures).toHaveProperty("origins.create");
  });

  it("should have energy router with getConfig and updateConfig", () => {
    expect(appRouter._def.procedures).toHaveProperty("energy.getConfig");
    expect(appRouter._def.procedures).toHaveProperty("energy.updateConfig");
  });

  it("should have auth router with me, logout, avatar mutations", () => {
    expect(appRouter._def.procedures).toHaveProperty("auth.me");
    expect(appRouter._def.procedures).toHaveProperty("auth.logout");
    expect(appRouter._def.procedures).toHaveProperty("auth.uploadAvatar");
    expect(appRouter._def.procedures).toHaveProperty("auth.removeAvatar");
  });

  it("should expose system.ping, getPricingPlansFeature and blacklist.list", () => {
    expect(appRouter._def.procedures).toHaveProperty("system.ping");
    expect(appRouter._def.procedures).toHaveProperty("system.getPricingPlansFeature");
    expect(appRouter._def.procedures).toHaveProperty("blacklist.list");
  });

  it("should have admin.getReleaseLog for Super Admin changelog", () => {
    expect(appRouter._def.procedures).toHaveProperty("admin.getReleaseLog");
  });

  it("should expose admin.createPaymentCheckout for gateways", () => {
    expect(appRouter._def.procedures).toHaveProperty("admin.createPaymentCheckout");
  });

  it("should have system.getUserBroadcastAlert", () => {
    expect(appRouter._def.procedures).toHaveProperty("system.getUserBroadcastAlert");
  });
});
