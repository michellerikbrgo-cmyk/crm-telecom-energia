import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { contacts, pendentes, contracts, campaigns, competitorScripts, callLogs, auditLogs, sales, blacklist, sosRequests, gamification } from "../drizzle/schema";
import { eq, desc, and, sql, like, or } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ CONTACTS ============
  contacts: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional(), status: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        let query = db.select().from(contacts);
        const conditions: any[] = [];

        if (input?.search) {
          conditions.push(
            or(
              like(contacts.name, `%${input.search}%`),
              like(contacts.phone, `%${input.search}%`)
            )
          );
        }
        if (input?.status && input.status !== "todos") {
          conditions.push(eq(contacts.status, input.status as any));
        }

        // Vendedores só veem os seus contactos
        const user = ctx.user as any;
        if (user?.crmRole === "vendedor") {
          conditions.push(eq(contacts.assignedTo, user.id));
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        return await (query as any).orderBy(desc(contacts.createdAt)).limit(100);
      }),

    add: protectedProcedure
      .input(z.object({
        phone: z.string().min(1),
        name: z.string().optional(),
        email: z.string().optional(),
        origin: z.string().default("Indicação"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(contacts).values({
          phone: input.phone,
          name: input.name || null,
          email: input.email || null,
          origin: user?.crmRole === "ce" ? "Telemarketing" : input.origin,
          notes: input.notes || null,
          addedBy: user?.id,
          status: "novo",
        });

        // Log audit
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "create",
          entity: "contact",
          details: `Adicionou contacto: ${input.phone}`,
        });

        return { success: true };
      }),

    bulkAdd: protectedProcedure
      .input(z.object({ phones: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const values = input.phones.map(phone => ({
          phone,
          origin: "Telemarketing",
          status: "novo" as const,
          addedBy: user?.id,
        }));

        await db.insert(contacts).values(values);

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "bulk_create",
          entity: "contact",
          details: `Adicionou ${input.phones.length} contactos em massa`,
        });

        return { count: input.phones.length };
      }),
  }),

  // ============ PENDENTES ============
  pendentes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;

      let conditions: any[] = [];
      if (user?.crmRole === "vendedor") {
        conditions.push(eq(pendentes.vendedorId, user.id));
      }

      let query = db.select().from(pendentes);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      return await (query as any).orderBy(desc(pendentes.returnDate)).limit(50);
    }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        returnDate: z.string(),
        notes: z.string().optional(),
        offerDesired: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(pendentes).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          returnDate: new Date(input.returnDate),
          notes: input.notes || null,
          offerDesired: input.offerDesired || null,
          status: "agendado",
        });

        // Update contact status
        await db.update(contacts)
          .set({ status: "pendente" })
          .where(eq(contacts.id, input.contactId));

        return { success: true };
      }),
  }),

  // ============ CONTRACTS ============
  contracts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const user = ctx.user as any;

      let query = db.select().from(contracts);
      if (user?.crmRole === "vendedor") {
        query = query.where(eq(contracts.vendedorId, user.id)) as any;
      }

      return await (query as any).orderBy(desc(contracts.createdAt)).limit(50);
    }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        type: z.enum(["contrato", "portabilidade", "rescisao"]),
        product: z.enum(["telecom", "energia"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(contracts).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          type: input.type,
          product: input.product,
          status: "gerado",
        });

        return { success: true };
      }),
  }),

  // ============ CAMPAIGNS ============
  campaigns: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(campaigns)
        .where(eq(campaigns.isActive, true))
        .orderBy(desc(campaigns.createdAt));
    }),

    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        product: z.enum(["telecom", "energia", "ambos"]).default("ambos"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(campaigns).values({
          title: input.title,
          description: input.description || null,
          product: input.product,
          createdBy: user?.id,
        });

        return { success: true };
      }),
  }),

  // ============ AI ============
  ai: router({
    askObjection: protectedProcedure
      .input(z.object({ objection: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const systemPrompt = `Você é um assistente de vendas especializado em Telecomunicações e Energia em Portugal. 
O seu papel é ajudar vendedores a ultrapassar objeções de clientes durante chamadas telefónicas.

Regras:
- Responda SEMPRE em português de Portugal
- Seja conciso e direto (máximo 3-4 parágrafos)
- Forneça argumentos específicos para o setor de Telecom e Energia
- Sugira frases exatas que o vendedor pode usar
- Mantenha um tom profissional mas empático
- Foque na criação de valor, não apenas no preço
- Mencione benefícios como: poupança, qualidade de serviço, fidelização sem compromisso, apoio técnico dedicado`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `O cliente disse: "${input.objection}"\n\nComo devo responder para ultrapassar esta objeção?` },
          ],
        });

        const content = response.choices?.[0]?.message?.content || "Não foi possível gerar uma resposta. Tente novamente.";
        return { response: content };
      }),
  }),

  // ============ CALL LOGS ============
  calls: router({
    log: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        outcome: z.enum(["atendeu", "nao_atende", "ocupado", "numero_errado", "venda", "pendente", "sem_interesse"]),
        notes: z.string().optional(),
        lossReason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(callLogs).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          outcome: input.outcome,
          notes: input.notes || null,
        });

        // Update contact status and attempts
        const statusMap: Record<string, string> = {
          atendeu: "em_contacto",
          nao_atende: "nao_atende",
          venda: "venda",
          pendente: "pendente",
          sem_interesse: "sem_interesse",
        };

        const newStatus = statusMap[input.outcome] || "em_contacto";
        await db.update(contacts).set({
          status: newStatus as any,
          attempts: sql`attempts + 1`,
          lastAttemptAt: new Date(),
          lossReason: input.lossReason || null,
        }).where(eq(contacts.id, input.contactId));

        return { success: true };
      }),
  }),

  // ============ SOS ============
  sos: router({
    create: protectedProcedure
      .input(z.object({
        contactId: z.number().optional(),
        message: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(sosRequests).values({
          vendedorId: user?.id,
          contactId: input.contactId || null,
          message: input.message || "Preciso de ajuda!",
          status: "aberto",
        });

        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
