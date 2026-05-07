import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { authLocalRouter } from "./authLocal";
import { getDb } from "./db";
import { contacts, pendentes, contracts, campaigns, competitorScripts, callLogs, auditLogs, sales, blacklist, sosRequests, gamification, contactOrigins, energyConfig } from "../drizzle/schema";
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

  authLocal: authLocalRouter,

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

        // Vendedores só veem os contactos atribuídos a eles no dia
        const user = ctx.user as any;
        if (user?.crmRole === "vendedor") {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          conditions.push(eq(contacts.assignedTo, user.id));
          conditions.push(sql`${contacts.lastAssignedAt} >= ${today}`);
        } else if (user?.crmRole === "cej") {
          // CEJ vê os contactos da sua equipa (por agora, vê os atribuídos)
          // Futuramente filtrar por teamId
        }
        // CE e CO veem tudo (sem filtro adicional)

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
      .input(z.object({
        phones: z.array(z.string()),
        names: z.array(z.string()).optional(),
        listName: z.string().optional(),
        assignTo: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        const values = input.phones.map((phone, i) => ({
          phone,
          name: input.names?.[i] || null,
          origin: "Telemarketing",
          status: "novo" as const,
          addedBy: user?.id,
          listName: input.listName || null,
          assignedTo: input.assignTo || null,
          lastAssignedAt: input.assignTo ? new Date() : null,
        }));

        // Insert in batches of 500 to avoid query limits
        for (let i = 0; i < values.length; i += 500) {
          const batch = values.slice(i, i + 500);
          await db.insert(contacts).values(batch);
        }

        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "bulk_create",
          entity: "contact",
          details: `Adicionou ${input.phones.length} contactos${input.listName ? ` (Lista: ${input.listName})` : ''}${input.assignTo ? ` atribuídos ao vendedor #${input.assignTo}` : ''}`,
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

  // ============ DASHBOARD ============
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { callsToday: 0, pendentesToday: 0, salesMonth: 0, totalContacts: 0 };
      const user = ctx.user as any;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calls today
      let callsResult;
      if (user?.crmRole === "vendedor") {
        callsResult = await db.select({ count: sql<number>`COUNT(*)` }).from(callLogs)
          .where(and(eq(callLogs.vendedorId, user.id), sql`${callLogs.calledAt} >= ${today}`));
      } else {
        callsResult = await db.select({ count: sql<number>`COUNT(*)` }).from(callLogs)
          .where(sql`${callLogs.calledAt} >= ${today}`);
      }

      // Pendentes for today
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      let pendentesResult;
      if (user?.crmRole === "vendedor") {
        pendentesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(pendentes)
          .where(and(
            eq(pendentes.vendedorId, user.id),
            eq(pendentes.status, "agendado"),
            sql`${pendentes.returnDate} >= ${today}`,
            sql`${pendentes.returnDate} < ${tomorrow}`
          ));
      } else {
        pendentesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(pendentes)
          .where(and(
            eq(pendentes.status, "agendado"),
            sql`${pendentes.returnDate} >= ${today}`,
            sql`${pendentes.returnDate} < ${tomorrow}`
          ));
      }

      // Sales this month
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      let salesResult;
      if (user?.crmRole === "vendedor") {
        salesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(sales)
          .where(and(eq(sales.vendedorId, user.id), sql`${sales.closedAt} >= ${monthStart}`));
      } else {
        salesResult = await db.select({ count: sql<number>`COUNT(*)` }).from(sales)
          .where(sql`${sales.closedAt} >= ${monthStart}`);
      }

      return {
        callsToday: callsResult[0]?.count || 0,
        pendentesToday: pendentesResult[0]?.count || 0,
        salesMonth: salesResult[0]?.count || 0,
        totalContacts: 0,
      };
    }),
  }),

  // ============ DISTRIBUTION ============
  distribution: router({
    getNext: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const user = ctx.user as any;

      // Get next available contact not assigned in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await db.select().from(contacts)
        .where(
          and(
            eq(contacts.status, "novo"),
            or(
              sql`${contacts.lastAssignedAt} IS NULL`,
              sql`${contacts.lastAssignedAt} < ${thirtyDaysAgo}`
            )
          )
        )
        .limit(1);

      if (result.length === 0) return null;

      const contact = result[0];
      // Assign to current user
      await db.update(contacts).set({
        assignedTo: user?.id,
        lastAssignedAt: new Date(),
        status: "em_contacto",
      }).where(eq(contacts.id, contact.id));

      return contact;
    }),

    repescagem: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      // Get contacts that didn't answer after 3+ attempts
      return await db.select().from(contacts)
        .where(
          and(
            eq(contacts.status, "nao_atende"),
            sql`${contacts.attempts} >= 3`
          )
        )
        .orderBy(desc(contacts.lastAttemptAt))
        .limit(20);
    }),
  }),

  // ============ BLACKLIST ============
  blacklist: router({
    add: protectedProcedure
      .input(z.object({ phone: z.string(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(blacklist).values({
          phone: input.phone,
          reason: input.reason || null,
          addedBy: user?.id,
        });

        // Update contact status
        await db.update(contacts)
          .set({ status: "blacklist" })
          .where(eq(contacts.phone, input.phone));

        return { success: true };
      }),
  }),

  // ============ GAMIFICATION ============
  gamification: router({
    ranking: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      return await db.select().from(gamification)
        .where(
          and(
            eq(gamification.month, now.getMonth() + 1),
            eq(gamification.year, now.getFullYear())
          )
        )
        .orderBy(desc(gamification.points))
        .limit(20);
    }),
  }),

  // ============ AUDIT ============
  audit: router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return await db.select().from(auditLogs)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input?.limit || 50);
      }),
  }),

  // ============ COMPETITOR SCRIPTS ============
  scripts: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(competitorScripts)
        .orderBy(desc(competitorScripts.createdAt));
    }),
    create: protectedProcedure
      .input(z.object({
        competitor: z.string().min(1),
        weakness: z.string().min(1),
        ourStrength: z.string().min(1),
        product: z.enum(["telecom", "energia", "ambos"]).default("ambos"),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(competitorScripts).values({
          competitor: input.competitor,
          weakness: input.weakness,
          ourStrength: input.ourStrength,
          product: input.product,
          createdBy: user?.id,
        });

        return { success: true };
      }),
  }),

  // ============ SALES ============
  sales: router({
    list: protectedProcedure
      .input(z.object({ month: z.number().optional(), year: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        const user = ctx.user as any;
        const now = new Date();
        const month = input?.month || (now.getMonth() + 1);
        const year = input?.year || now.getFullYear();

        let conditions: any[] = [
          sql`MONTH(${sales.closedAt}) = ${month}`,
          sql`YEAR(${sales.closedAt}) = ${year}`,
        ];

        if (user?.crmRole === "vendedor") {
          conditions.push(eq(sales.vendedorId, user.id));
        }

        return await db.select().from(sales)
          .where(and(...conditions))
          .orderBy(desc(sales.closedAt));
      }),

    create: protectedProcedure
      .input(z.object({
        contactId: z.number(),
        product: z.enum(["telecom", "energia"]),
        offer: z.string().optional(),
        value: z.string().optional(),
        installationDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;

        await db.insert(sales).values({
          contactId: input.contactId,
          vendedorId: user?.id,
          product: input.product,
          offer: input.offer || null,
          value: input.value || null,
          installationDate: input.installationDate ? new Date(input.installationDate) : null,
          status: "aguarda_instalacao",
        });

        // Update contact status
        await db.update(contacts)
          .set({
            status: "venda",
            ...(input.product === "telecom" ? { hasTelecom: true } : { hasEnergy: true }),
          })
          .where(eq(contacts.id, input.contactId));

        // Log audit
        await db.insert(auditLogs).values({
          userId: user?.id,
          action: "sale_created",
          entity: "sale",
          details: `Venda ${input.product} para contacto #${input.contactId}`,
        });

        return { success: true };
      }),
  }),

  // ============ ORIGINS ============
  origins: router({
    list: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(contactOrigins).orderBy(contactOrigins.name);
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        // Only CEJ/CE/CO can manage origins
        if (user?.crmRole === "vendedor") throw new Error("Sem permissão");
        await db.insert(contactOrigins).values({ name: input.name, createdBy: user?.id });
        return { success: true };
      }),
  }),

  // ============ ENERGY CONFIG ============
  energy: router({
    getConfig: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return null;
      const result = await db.select().from(energyConfig).limit(1);
      return result[0] || null;
    }),
    updateConfig: protectedProcedure
      .input(z.object({
        priceKwhSimples: z.string(),
        priceKwhBiHorariaPonta: z.string(),
        priceKwhBiHorariaVazio: z.string(),
        baseDiscountPercent: z.string(),
        vdfClientExtraPercent: z.string(),
        vdfGasClientExtraPercent: z.string(),
        reembolsoPercent: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const user = ctx.user as any;
        if (user?.crmRole !== 'coordenador') throw new Error("Apenas o Coordenador pode alterar a configuração");
        await db.update(energyConfig).set({
          ...input,
          updatedBy: user?.id,
        }).where(eq(energyConfig.id, 1));
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
