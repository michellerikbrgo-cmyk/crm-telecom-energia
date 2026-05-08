# CRM Telecom Energia

Aplicação web para gestão comercial (contactos, campanhas, contratos, relatórios, equipa, etc.) com **multi-tenant**, API **tRPC** e base de dados **MySQL** via **Drizzle ORM**.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, Vite 7, TanStack Query, Wouter, Tailwind CSS |
| Backend | Node.js, Express, tRPC |
| Dados | MySQL, Drizzle ORM |
| Auth | OAuth integrado + sessão local (cookies / JWT) |

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
| `JWT_SECRET` | Segredo para cookies/sessão (`cookieSecret`) |
| `VITE_APP_ID` | Identificador da app no ecossistema OAuth |
| `OAUTH_SERVER_URL` | URL base do servidor OAuth |
| `OWNER_OPEN_ID` | OpenID do proprietário (bootstrapping / permissões) |
| `PORT` | Porta HTTP (predefinição: `3000`) |
| `NODE_ENV` | `development` ou `production` |
| `OPENAI_API_KEY` | Opcional — IA de objeções (fallback quando outras APIs não estão disponíveis) |
| `COOKIE_SECURE` | Se definido, influencia cookies seguros em HTTPS |
| `COOKIE_SAMESITE` | Política SameSite dos cookies (útil em HTTP vs HTTPS) |
| `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` | Opcional — integrações Forge |

Não commits o `.env`; mantém credenciais só no servidor ou gestor de segredos.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Servidor + Vite em modo desenvolvimento |
| `pnpm build` | Build do cliente (Vite) e bundle do servidor (`dist/`) |
| `pnpm start` | Produção: `node dist/index.js` (requer `pnpm build` antes) |
| `pnpm test` | Testes (Vitest) |
| `pnpm check` | Verificação TypeScript (`tsc --noEmit`) |
| `pnpm exec drizzle-kit migrate` | Aplica migrações SQL em `drizzle/` (requer `DATABASE_URL`) |

Para gerar novas migrações a partir do schema (equipa de desenvolvimento):

```bash
pnpm exec drizzle-kit generate
```

## Base de dados

- Schema: `drizzle/schema.ts`
- Migrações SQL: pasta `drizzle/` (ficheiros numerados + `meta/`)

Em produção, após atualizar código:

```bash
set -a && source .env && set +a   # ou export manual de DATABASE_URL
pnpm exec drizzle-kit migrate
```

## Produção (exemplo)

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm exec drizzle-kit migrate   # com DATABASE_URL carregada
node dist/index.js              # ou PM2, systemd, etc.
```

Com **PM2** (exemplo):

```bash
pm2 start dist/index.js --name crm --cwd /caminho/para/crm-telecom-energia
```

Garante que `NODE_ENV=production` e que o processo lê o mesmo `.env` (ou variáveis equivalentes) que usaste no build/migrate.

## Proxy e HTTPS

O servidor usa `trust proxy` para obter o IP real atrás de Nginx ou outro reverse proxy — importante para sessão, presença e auditoria.

## Licença

MIT (ver `package.json`).
