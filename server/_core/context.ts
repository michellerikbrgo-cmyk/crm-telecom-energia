import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getUserByOpenId } from "../db";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const sdkUser: any = await sdk.authenticateRequest(opts.req);
    // Ensure we use DB-backed user (crmRole/role/isSuperAdmin) when available.
    const openId = sdkUser?.openId;
    if (openId) {
      const dbUser = await getUserByOpenId(openId);
      const blocked =
        dbUser &&
        ((dbUser as { bloqueado?: unknown }).bloqueado === true ||
          (dbUser as { bloqueado?: unknown }).bloqueado === 1 ||
          (dbUser as { bloqueado?: unknown }).bloqueado === "1");
      if (blocked) {
        user = null;
      } else {
        user = (dbUser as any) || (sdkUser as any);
      }
    } else {
      user = sdkUser as any;
    }

    // Presence: mark user online on any authenticated request.
    // Do NOT touch lastOnlineAt here (used as session start in UI).
    if (user?.openId) {
      const db = await getDb();
      if (db) {
        try {
          await db.update(users)
            .set({ isOnline: true })
            .where(eq(users.openId, user.openId));
        } catch {
          // ignore presence update errors
        }
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
