/**
 * Garante um utilizador Super Admin com login local (e-mail + senha).
 * Idempotente: actualiza senha e flags se o e-mail já existir.
 *
 * Uso: pnpm ensure-super-admin
 * Requer: DATABASE_URL no .env
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";

const EMAIL = "admin@crm.local";
const PASSWORD = "ChangeMe2026!";
/** openId fixo ≤64 caracteres; único na tabela. */
const OPEN_ID = "local_sa_admin_crm_local";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL em falta no .env");
    process.exit(1);
  }

  const pool = await mysql.createPool(url);
  const db = drizzle(pool);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);

  if (existing.length > 0) {
    const id = existing[0]!.id;
    await db
      .update(users)
      .set({
        password: passwordHash,
        loginMethod: "local",
        role: "admin",
        crmRole: "coordenador",
        isSuperAdmin: true,
        tenantId: null,
        name: "Super Admin",
      } as any)
      .where(eq(users.id, id));
    console.log(`Actualizado Super Admin existente (id=${id}, email=${EMAIL}).`);
  } else {
    await db.insert(users).values({
      openId: OPEN_ID,
      name: "Super Admin",
      email: EMAIL,
      password: passwordHash,
      loginMethod: "local",
      role: "admin",
      crmRole: "coordenador",
      isSuperAdmin: true,
      tenantId: null,
    } as any);
    console.log(`Criado Super Admin: ${EMAIL} (openId=${OPEN_ID}).`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
