/**
 * Repara BD quando 0028 falhou a meio (tenant_id vs tenantId) ou migrações Drizzle desalinhadas.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

async function columnExists(pool: mysql.Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function tableExists(pool: mysql.Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function indexExists(pool: mysql.Pool, table: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, indexName],
  );
  return rows.length > 0;
}

async function execIgnoreDup(pool: mysql.Pool, sql: string): Promise<void> {
  try {
    await pool.query(sql);
    console.log("  OK:", sql.split("\n")[0]!.slice(0, 80));
  } catch (e: unknown) {
    const err = e as { code?: string; errno?: number; message?: string };
    if (err.errno === 1060 || err.errno === 1061 || err.errno === 1050 || err.code === "ER_DUP_FIELDNAME" || err.code === "ER_DUP_KEYNAME" || err.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("  skip (já existe):", sql.split("\n")[0]!.slice(0, 60));
      return;
    }
    throw e;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL em falta");
  const pool = mysql.createPool({ uri: url, multipleStatements: true });

  console.log("[repair] Índices blacklist…");
  if (await indexExists(pool, "blacklist", "blacklist_phone_tenant")) {
    await pool.query("ALTER TABLE `blacklist` DROP INDEX `blacklist_phone_tenant`");
    console.log("  dropped blacklist_phone_tenant");
  }
  if (!(await indexExists(pool, "blacklist", "idx_blacklist_phone_company"))) {
    await pool.query("CREATE INDEX `idx_blacklist_phone_company` ON `blacklist` (`phone`, `company_id`)");
  }
  if (!(await indexExists(pool, "blacklist", "idx_blacklist_phone_tenant"))) {
    await pool.query("CREATE INDEX `idx_blacklist_phone_tenant` ON `blacklist` (`phone`, `tenantId`)");
  }

  if (!(await tableExists(pool, "motivos_nao_fechamento"))) {
    console.log("[repair] motivos_nao_fechamento…");
    await pool.query(`
      CREATE TABLE \`motivos_nao_fechamento\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`descricao\` varchar(255) NOT NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`motivos_nao_fechamento_id\` PRIMARY KEY(\`id\`)
      )
    `);
    await pool.query(`
      INSERT INTO \`motivos_nao_fechamento\` (\`descricao\`) VALUES
        ('Preço / concorrência'),
        ('Sem cobertura / técnico'),
        ('Desistência do cliente'),
        ('Documentação incompleta'),
        ('Outro')
    `);
  }

  console.log("[repair] sales / pendentes…");
  await execIgnoreDup(
    pool,
    `ALTER TABLE \`sales\` MODIFY COLUMN \`status\` enum(
      'aguarda_instalacao','em_aberto','activo','e_switch','cancelado','pendente','nao_fechou'
    ) NOT NULL DEFAULT 'aguarda_instalacao'`,
  );
  for (const [col, def] of [
    ["public_sale_id", "varchar(32) NULL"],
    ["data_ativacao", "timestamp NULL"],
    ["antigo_titular_nome", "varchar(255) NULL"],
    ["antigo_titular_nif", "varchar(32) NULL"],
    ["motivo_nao_fechamento_id", "int NULL"],
    ["pre_agendamento_at", "timestamp NULL"],
    ["titular_troca", "tinyint NOT NULL DEFAULT 0"],
    ["sale_detail_json", "text NULL"],
  ] as const) {
    if (!(await columnExists(pool, "sales", col))) {
      await pool.query(`ALTER TABLE \`sales\` ADD COLUMN \`${col}\` ${def}`);
    }
  }

  await execIgnoreDup(
    pool,
    `ALTER TABLE \`pendentes\` MODIFY COLUMN \`status\` enum(
      'agendado','realizado','expirado','cancelado','nao_fechou'
    ) NOT NULL DEFAULT 'agendado'`,
  );
  if (!(await columnExists(pool, "pendentes", "motivo_nao_fechamento_id"))) {
    await pool.query("ALTER TABLE `pendentes` ADD COLUMN `motivo_nao_fechamento_id` int NULL");
  }

  console.log("[repair] users (login)…");
  if (!(await columnExists(pool, "users", "nif"))) {
    await pool.query("ALTER TABLE `users` ADD COLUMN `nif` varchar(20) NULL");
  }
  if (!(await columnExists(pool, "users", "sfid"))) {
    await pool.query("ALTER TABLE `users` ADD COLUMN `sfid` varchar(64) NULL");
  }
  if (!(await columnExists(pool, "users", "bloqueado"))) {
    await pool.query("ALTER TABLE `users` ADD COLUMN `bloqueado` tinyint NOT NULL DEFAULT 0");
  }
  if (!(await columnExists(pool, "users", "team_leader_junior_id"))) {
    await pool.query("ALTER TABLE `users` ADD COLUMN `team_leader_junior_id` int NULL");
  }

  if (!(await columnExists(pool, "calendarEvents", "company_id"))) {
    await pool.query("ALTER TABLE `calendarEvents` ADD COLUMN `company_id` int NULL");
  }

  if (!(await tableExists(pool, "calendar_event_invitees"))) {
    await pool.query(`
      CREATE TABLE \`calendar_event_invitees\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`event_id\` int NOT NULL,
        \`user_id\` int NOT NULL,
        \`status\` varchar(16) NOT NULL DEFAULT 'pending',
        \`created_at\` timestamp NOT NULL DEFAULT (now()),
        \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`calendar_event_invitees_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`uniq_calendar_event_invitee\` UNIQUE(\`event_id\`, \`user_id\`),
        CONSTRAINT \`fk_calendar_invitee_event\` FOREIGN KEY (\`event_id\`) REFERENCES \`calendarEvents\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_calendar_invitee_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
  }

  const file0028 = path.join(process.cwd(), "drizzle", "0028_crm_multitenant_extensions.sql");
  const sql0028 = fs.readFileSync(file0028, "utf8");
  const hash0028 = crypto.createHash("sha256").update(sql0028).digest("hex");
  const [existing] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT hash FROM __drizzle_migrations WHERE hash = ? LIMIT 1",
    [hash0028],
  );
  if (existing.length === 0) {
    await pool.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [
      hash0028,
      1778250020000,
    ]);
    console.log("[repair] Registada migração 0028 em __drizzle_migrations");
  }

  await pool.end();
  console.log("[repair] Concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
