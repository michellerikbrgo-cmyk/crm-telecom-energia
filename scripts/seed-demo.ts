/**
 * Insere dados de demonstração na base de dados (empresa demo + vendedor + contactos, etc.).
 *
 * Idempotente: se já existir o utilizador demo.coordenador@crm-seed.local, não faz nada.
 *
 * Uso: pnpm seed
 * Requer: DATABASE_URL no .env
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import {
  users,
  teams,
  contacts,
  pendentes,
  calendarEvents,
  campaigns,
  contracts,
  competitorScripts,
  contactOrigins,
  energyConfig,
  sales,
  callLogs,
  sosRequests,
} from "../drizzle/schema";

const COORD_EMAIL = "demo.coordenador@crm-seed.local";
const VEND_EMAIL = "demo.vendedor@crm-seed.local";
const DEMO_PASSWORD = "Demo2026!";
const COORD_OPENID = "local_seed_demo_coord_v1";
const VEND_OPENID = "local_seed_demo_vend_v1";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL em falta no .env");
    process.exit(1);
  }

  const pool = await mysql.createPool(url);
  const db = drizzle(pool);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, COORD_EMAIL)).limit(1);
  if (existing.length > 0) {
    console.log(`Seed já aplicado (utilizador ${COORD_EMAIL} existe). Nada a fazer.`);
    await pool.end();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      openId: COORD_OPENID,
      name: "Empresa Demo — Coordenador",
      email: COORD_EMAIL,
      password: passwordHash,
      loginMethod: "local",
      role: "admin",
      crmRole: "coordenador",
      isSuperAdmin: false,
      tenantId: null,
    } as any);

    const [coordRow] = await tx.select({ id: users.id }).from(users).where(eq(users.email, COORD_EMAIL)).limit(1);
    const coordId = coordRow!.id;
    await tx.update(users).set({ tenantId: coordId } as any).where(eq(users.id, coordId));

    await tx.insert(users).values({
      openId: VEND_OPENID,
      name: "Maria Santos (vendedora demo)",
      email: VEND_EMAIL,
      password: passwordHash,
      loginMethod: "local",
      role: "user",
      crmRole: "vendedor",
      isSuperAdmin: false,
      tenantId: coordId,
    } as any);

    const [vendRow] = await tx.select({ id: users.id }).from(users).where(eq(users.email, VEND_EMAIL)).limit(1);
    const vendId = vendRow!.id;

    await tx.insert(teams).values({
      name: "Equipa Demo — Norte",
      leaderId: vendId,
      tenantId: coordId,
      contactEmail: "equipa.demo@crm-seed.local",
    } as any);

    const [teamRow] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.tenantId, coordId)).limit(1);
    const teamId = teamRow!.id;

    await tx.update(users).set({ teamId } as any).where(eq(users.id, vendId));

    await tx.insert(contactOrigins).values({
      tenantId: coordId,
      name: "Stand Colombo (demo)",
      createdBy: coordId,
    } as any);

    await tx.insert(energyConfig).values({
      tenantCoordinatorUserId: coordId,
      priceKwhSimples: "0.1690",
      priceKwhBiHorariaPonta: "0.1890",
      priceKwhBiHorariaVazio: "0.0990",
      baseDiscountPercent: "12",
      vdfClientExtraPercent: "5",
      vdfGasClientExtraPercent: "3",
      reembolsoPercent: "2",
      updatedBy: coordId,
    } as any);

    await tx.insert(campaigns).values({
      tenantId: coordId,
      title: "Fibra + TV Vodafone — Maio 2026 (demo)",
      description: "Campanha de demonstração com script de objeções e foco em poupança familiar.",
      product: "telecom",
      isActive: true,
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-06-30"),
      createdBy: coordId,
    } as any);

    const contactRows = [
      {
        phone: "919876543",
        name: "Carla Mendes",
        email: "carla.mendes@email.pt",
        origin: "Stand Colombo (demo)",
        status: "em_contacto" as const,
        notes: "Interessada em fibra 500 Mbps + TV; comparar com NOS.",
      },
      {
        phone: "916111222",
        name: "João Ferreira",
        email: "joao.f@sapo.pt",
        origin: "Telemarketing",
        status: "novo" as const,
        notes: "Lead frio — lista importação demo.",
      },
      {
        phone: "918555666",
        name: "Ana Rodrigues",
        email: "ana.r@gmail.com",
        origin: "Indicação",
        status: "pendente" as const,
        notes: "Quer proposta Repsol eletricidade vs tarifa simples.",
      },
    ];

    const insertedContactIds: number[] = [];
    for (const c of contactRows) {
      await tx.insert(contacts).values({
        tenantId: coordId,
        phone: c.phone,
        name: c.name,
        email: c.email,
        origin: c.origin,
        status: c.status,
        notes: c.notes,
        assignedTo: vendId,
        addedBy: coordId,
        addedSource: "import",
        listName: "Lista demo seed",
      } as any);
      const [last] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.phone, c.phone), eq(contacts.tenantId, coordId)))
        .limit(1);
      if (last) insertedContactIds.push(last.id);
    }

    const c1 = insertedContactIds[0];
    const c3 = insertedContactIds[2];

    if (c1) {
      await tx.insert(callLogs).values({
        contactId: c1,
        vendedorId: vendId,
        outcome: "atendeu",
        notes: "Primeira chamada — cliente receptiva.",
      } as any);

      await tx.insert(pendentes).values({
        contactId: c1,
        vendedorId: vendId,
        returnDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        notes: "Enviar simulação Vodafone Fibra + cartão adicional.",
        offerDesired: "Pacote família 4 linhas",
        status: "agendado",
      } as any);

      await tx.insert(calendarEvents).values({
        tenantId: coordId,
        title: "Follow-up Carla Mendes — proposta fibra",
        description: "Ligar antes das 18h; cliente trabalha por turnos.",
        type: "pendente",
        startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
        allDay: false,
        contactId: c1,
        assignedTo: vendId,
        createdBy: vendId,
      } as any);
    }

    if (c3) {
      await tx.insert(contracts).values({
        contactId: c3,
        vendedorId: vendId,
        type: "portabilidade",
        product: "energia",
        status: "gerado",
      } as any);
    }

    await tx.insert(competitorScripts).values({
      tenantId: coordId,
      competitor: "NOS",
      weakness: "Fidelização 24 meses rígida; penalização na rescisão.",
      ourStrength: "Vodafone permite rever tarifa ao fim de 12 meses com campanhas retention.",
      product: "telecom",
      createdBy: coordId,
    } as any);

    const now = new Date();
    const installationDate = new Date(now.getFullYear(), now.getMonth(), 15, 10, 0, 0);

    if (c1) {
      await tx.insert(sales).values({
        contactId: c1,
        vendedorId: vendId,
        product: "telecom",
        offer: "Fibra 500 Mbps + TV mini — promoção 24 meses",
        value: "€39,99/mês primeiros 6 meses",
        status: "activo",
        installationDate,
        closedAt: now,
      } as any);
    }

    await tx.insert(sosRequests).values({
      tenantId: coordId,
      vendedorId: vendId,
      contactId: c1 ?? null,
      message: "Pedido SOS de demonstração — pode ignorar ou marcar como resolvido.",
      status: "aberto",
    } as any);
  });

  console.log("");
  console.log("Seed demo concluído.");
  console.log("");
  console.log("  Coordenador:", COORD_EMAIL);
  console.log("  Vendedor:   ", VEND_EMAIL);
  console.log("  Palavra-passe (ambos):", DEMO_PASSWORD);
  console.log("");
  console.log("Inicie sessão em /login com uma destas contas.");
  console.log("");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
