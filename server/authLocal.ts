import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

const JWT_SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || "crm-telecom-secret-2026");

async function createToken(userId: number, email: string) {
  return await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(JWT_SECRET_KEY);
}

export const authLocalRouter = router({
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de dados indisponível");

      const result = await db.select().from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (result.length === 0) {
        throw new Error("E-mail ou senha incorretos");
      }

      const user = result[0];
      if (!user.password) {
        throw new Error("E-mail ou senha incorretos");
      }

      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) {
        throw new Error("E-mail ou senha incorretos");
      }

      // Create JWT token and set cookie
      const token = await createToken(user.id, user.email || "");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          crmRole: user.crmRole,
        },
      };
    }),

  register: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      crmRole: z.enum(["vendedor", "cej", "ce", "coordenador"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Base de dados indisponível");

      const currentUser = ctx.user as any;

      // Permission check: CO can create all, CE can create CEJ and Vendedor
      if (currentUser?.crmRole === "ce") {
        if (!["cej", "vendedor"].includes(input.crmRole)) {
          throw new Error("CE só pode criar CEJ e Vendedores");
        }
      } else if (currentUser?.crmRole === "coordenador") {
        // CO can create all roles
      } else {
        throw new Error("Sem permissão para criar utilizadores");
      }

      // Check if email already exists
      const existing = await db.select().from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Este e-mail já está registado");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Create user
      const openId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await db.insert(users).values({
        openId,
        name: input.name,
        email: input.email,
        password: hashedPassword,
        loginMethod: "local",
        role: input.crmRole === "coordenador" ? "admin" : "user",
        crmRole: input.crmRole,
      });

      return { success: true };
    }),

  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const currentUser = ctx.user as any;

    // Only CE and CO can list users
    if (!["ce", "coordenador"].includes(currentUser?.crmRole)) {
      return [];
    }

    const result = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      crmRole: users.crmRole,
      isOnline: users.isOnline,
      createdAt: users.createdAt,
    }).from(users);

    return result;
  }),
});
