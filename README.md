# CRM Telecom Energia

Aplicação web para gestão comercial (contactos, campanhas, contratos, relatórios, equipa, etc.) com **multi-tenant** (empresa → sub-empresa → membros), API **tRPC** e base de dados **MySQL** via **Drizzle ORM**.

## Hierarquia e isolamento (tenant)

| Nível | Na aplicação | Dados principais |
|-------|----------------|------------------|
| **Super Admin** | `users.isSuperAdmin` | Visão global; sem filtro de empresa |
| **Empresa (coordenador)** | `crmRole = coordenador`, `users.tenantId = id` do coordenador | Tabela `companies` (raiz): `coordinatorUserId` = id do coordenador |
| **Sub-empresa (chefe de equipa)** | `crmRole = ce`, `users.companyId` = linha em `companies` com `parentCompanyId` ≠ null | Equipa em `teams` ligada à mesma sub-empresa (`teams.companyId`) |
| **Membros** | `crmRole = vendedor` ou `cej` | `companyId` da sub-empresa (ou raiz se ainda sem equipa, conforme migração) |

- **Contactos:** `contacts.tenantId` mantém o tenant do coordenador; **`contacts.companyId`** restringe visibilidade entre chefes de equipa (filtros em `server/tenantScope.ts` e `assertEntityTenant` em `server/routers.ts`).
- **Criação de utilizadores:** `authLocal.register` — coordenador (ou Super Admin a nomear empresa) cria **CE** com transacção atómica (sub-empresa + utilizador + equipa); **CE / CEJ** criam membros só na sua sub-empresa. Campos opcionais no registo: `rootCompanyName`, `subCompanyName`, `targetCompanyId` (ver schema Zod no servidor).

Migração de referência: `drizzle/0024_companies_hierarchy.sql` (tabela `companies` + colunas `companyId` + backfill a partir de coordenadores e equipas existentes).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, Vite 7, TanStack Query, Wouter, Tailwind CSS |
| Backend | Node.js, Express, tRPC |
| Dados | MySQL, Drizzle ORM |
| Auth | E-mail + senha (bcrypt), sessão em cookie JWT (`JWT_SECRET`) |

## Requisitos

- **Node.js** ≥ 20.19 (recomendado; o Vite 7 avisa em versões mais antigas)
- **pnpm** (versão fixada em `package.json` / `packageManager`)
- **MySQL** acessível via URL de ligação

## Instalação

```bash
git clone <url-do-repositório>
cd crm-telecom-energia
pnpm install
```

## Variáveis de ambiente

Cria um ficheiro `.env` na raiz do projeto. Valores típicos:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL MySQL para Drizzle (obrigatória para migrações e persistência) |
| `JWT_SECRET` | Segredo para assinar o cookie de sessão (obrigatório em produção) |
| `VITE_APP_ID` | Identificador incluído no JWT (opcional; predefinição no servidor: `crm-telecom-energia`) |
| `OWNER_OPEN_ID` | OpenID do super-admin de arranque (se usado nos scripts de seed / permissões) |
| `PORT` | Porta HTTP (predefinição: `3000`) |
| `NODE_ENV` | `development` ou `production` |
| `OPENAI_API_KEY` | Chave **OpenAI** (deve começar por `sk-`). Usada para Whisper e, se preferido, chat. Não coloque aqui a chave do Gemini. |
| `GEMINI_API_KEY` | Chave **Google AI Studio** (começa por `AIza…`). Chat quando o fornecedor preferido é Gemini ou como fallback. |
| `GEMINI_CHAT_MODEL` | Opcional — modelo REST (ex. `gemini-2.5-flash`, `gemini-2.0-flash`). |
| `GOOGLE_MAPS_API_KEY` | Servidor: pedidos às APIs Google Maps. **Cliente:** `VITE_GOOGLE_MAPS_API_KEY` para carregar o script do mapa no browser. |
| `COOKIE_SECURE` | Se definido, influencia cookies seguros em HTTPS |
| `COOKIE_SAMESITE` | Política SameSite dos cookies (útil em HTTP vs HTTPS) |
| `API_RATE_LIMIT_PER_MIN` | Opcional — pedidos `/api/trpc` por IP por minuto (predefinição: 400; mín. 60, máx. 2000) |
| `DEPLOY_REF` ou `GITHUB_SHA` | Opcional — aparece em `/api/health` e `system.ping` para confirmar deploy |
| `LOCAL_UPLOAD_ROOT` | **Obrigatório para anexos/avatars** — caminho absoluto no servidor; ficheiros servidos em `/manus-storage/…`. |
| `PUBLIC_BASE_URL` | Opcional — URL pública (ex. `https://crm.exemplo.pt`) para URLs absolutos de ficheiros. |

Não commits o `.env`; mantém credenciais só no servidor ou gestor de segredos.

### Problemas frequentes

| Sintoma | O que fazer |
|---------|----------------|
| Queries a `pendentes` com erro e menção a `priorityLevel` | Aplicar migrações: `pnpm exec drizzle-kit migrate` (add coluna `priorityLevel` em `0013_pendentes_priority.sql`). |
| `401 Incorrect API key` da OpenAI ao usar só Gemini | Confirme que a chave Gemini está no campo **Gemini** / `GEMINI_API_KEY` e em Super Admin escolha **Gemini** como fornecedor preferido. Remova valores inválidos de `OPENAI_API_KEY` no `.env`. |
| `ai.roleplayTurn` 404 | Actualize o servidor com `pnpm run build` + reinício (o bundle antigo pode não expor o procedure). |
| Erros por colunas em falta (`pricingPlansEnabled`, `completedAt`, `companyId`, etc.) | Correr `pnpm exec drizzle-kit migrate` com `DATABASE_URL` correcto; em produção `pnpm run deploy:pm2` já executa migrate antes do build. |

## Beta (sugestões / roadmap)

- Página **`/beta`:** envio de sugestões, roadmap global de aceites/concluídas, cronómetro até remoção automática das concluídas (`BETA_COMPLETED_RETENTION_DAYS` em `shared/const.ts`, cálculo em `shared/betaRetention.ts`).
- **`/beta/revisao`:** fila de pendentes (aceitar/recusar) para coordenadores e Super Admin; acesso pelo botão na página Beta (sem item separado no menu lateral).

## API

| Rota | Descrição |
|------|-----------|
| `POST /api/trpc` | API principal (queries/mutations **tRPC**). |
| `GET /api/health` | Estado do serviço (versão, uptime, deploy). |
| `GET /api/v1/ping` | Idem à saúde + campo `api: "v1"`. |

## Scripts

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Servidor + Vite em modo desenvolvimento |
| `pnpm build` | Build do cliente (Vite) e bundle do servidor (`dist/`) |
| `pnpm start` | Produção: `node dist/index.js` (requer `pnpm build` antes) |
| `pnpm test` | Testes (Vitest) |
| `pnpm check` | Verificação TypeScript (`tsc --noEmit`) |
| `pnpm exec drizzle-kit migrate` | Aplica migrações SQL em `drizzle/` (requer `DATABASE_URL`) |
| `pnpm run deploy:pm2` | **`drizzle-kit migrate`** + build + **registo no log de actualização** (`data/release-log.json`) + `pm2 restart crm`. Opcional: `DEPLOY_NOTES="texto"` ou `DEPLOY_REF` / `GITHUB_SHA`. |

Guia legível de melhorias (editar no Git e fazer deploy para aparecer na Super Admin): **`shared/ATUALIZACOES.md`**.

Para gerar novas migrações a partir do schema (equipa de desenvolvimento):

```bash
pnpm exec drizzle-kit generate
```

## Base de dados

- Schema: `drizzle/schema.ts`
- Migrações SQL: pasta `drizzle/` (ficheiros numerados + `meta/`)
- Cópias de segurança manuais do código (opcional): `local/backups/` — ver `local/LEIAME.txt` (conteúdo local não versionado excepto o guia).

Em produção, após atualizar código:

```bash
set -a && source .env && set +a   # ou export manual de DATABASE_URL
pnpm exec drizzle-kit migrate
```

Com **`LOCAL_UPLOAD_ROOT`** (upload local), cria a pasta no servidor e garante permissões de escrita para o utilizador do Node/PM2:

```bash
mkdir -p /var/www/crm-telecom-energia/data/uploads
chown -R deployuser:deployuser /var/www/crm-telecom-energia/data/uploads   # ajustar utilizador
```

## Produção (exemplo)

```bash
pnpm install --frozen-lockfile
pnpm exec drizzle-kit migrate   # com DATABASE_URL carregada (também incluído em `pnpm run deploy:pm2`)
pnpm run build
node dist/index.js              # ou PM2, systemd, etc.
```

Com **PM2** (exemplo):

```bash
pm2 start dist/index.js --name crm --cwd /caminho/para/crm-telecom-energia
```

Garante que `NODE_ENV=production` e que o processo lê o mesmo `.env` (ou variáveis equivalentes) que usaste no build/migrate.

## Proxy e HTTPS

O servidor usa `trust proxy` para obter o IP real atrás de Nginx ou outro reverse proxy — importante para sessão, presença e auditoria.

## Saúde da API (deploy)

- **HTTP:** `GET /api/health` — JSON com `version`, `uptimeSec`, `deployRef`, `node` (útil para load balancer ou scripts).
- **tRPC:** `system.ping` (público) — mesma informação útil a partir do cliente autenticado ou não.

## Dados de demonstração (seed)

Após migrações e com `DATABASE_URL` definido:

```bash
pnpm seed
```

Cria uma empresa demo (coordenador + vendedor), equipa, contactos, campanha, pendente, evento de calendário, origem, tarifário energia, script concorrente, venda exemplo e SOS de teste.

Contas (palavra-passe igual para ambas: **`Demo2026!`**):

- `demo.coordenador@crm-seed.local`
- `demo.vendedor@crm-seed.local`

O comando é **idempotente**: se o coordenador demo já existir, não altera nada.

## Documentação da API (exemplos)

Lista de procedimentos tRPC com **payloads realistas** (contactos, campanhas, discador, Super Admin, sessão, etc.): [docs/EXEMPLOS-FUNCOES.md](docs/EXEMPLOS-FUNCOES.md).

## Licença

MIT (ver `package.json`).
