# Exemplos reais das funções API (tRPC)

## Dados na base de dados

Para criar utilizadores e registos de demonstração na MySQL (contactos, campanha, vendas, etc.), corre na raiz do projecto:

```bash
pnpm seed
```

Credenciais: ver **README** (secção «Dados de demonstração»).

---

Este documento mostra **payloads de exemplo** alinhados com o uso real do CRM (telecom/energia, Portugal).  
Todos os endpoints estão sob o prefixo HTTP **`/api/trpc`** (ver secção [Chamadas HTTP](#chamadas-http-fora-do-react)).

**Convenções:**

- Substitui IDs (`contactId: 42`, `campaignId: 3`) pelos valores da tua base.
- Datas em **ISO 8601** (`2026-05-15` ou `2026-05-15T14:30:00.000Z`).
- Telefones sem espaços, formato nacional típico (`919876543`).

---

## Papéis (`crmRole`)

| Papel           | Notas breves                                      |
|-----------------|---------------------------------------------------|
| `vendedor`      | Contactos atribuídos, discador, pendentes próprios |
| `cej` / `ce`    | Supervisão parcial, equipa, mais permissões       |
| `coordenador`   | Tenant (empresa), energia, equipas                |
| Super Admin     | `isSuperAdmin: true` — sem tenant obrigatório     |

---

## `system`

### `system.health` (query)

Verificação simples.

```ts
// Input
{ timestamp: Date.now() }

// Exemplo React
trpc.system.health.useQuery({ timestamp: Date.now() });
```

### `system.notifyOwner` (mutation) — **admin** (`user.role === 'admin'`)

Envia notificação ao dono do projecto (serviço Forge).

```ts
await trpc.system.notifyOwner.mutateAsync({
  title: "Erro na importação CSV",
  content: "Falhou a linha 45 no ficheiro contactos_maio.csv — número inválido.",
});
```

---

## `auth`

### `auth.me` (query)

Sessão actual (sem input).

```ts
const { data } = trpc.auth.me.useQuery();
// data: utilizador sem campo password; inclui avatarUrl, crmRole, tenantId, etc.
```

### `auth.logout` (mutation)

```ts
await trpc.auth.logout.mutateAsync();
```

### `auth.uploadAvatar` (mutation)

Imagem em base64 (sem prefixo `data:image/...` na string enviada ao servidor — só o payload base64).

```ts
await trpc.auth.uploadAvatar.mutateAsync({
  base64: "/9j/4AAQSkZJRg...", // JPEG em base64 (exemplo truncado)
  mimeType: "image/jpeg", // "image/jpeg" | "image/png" | "image/webp"
});
```

### `auth.removeAvatar` (mutation)

```ts
await trpc.auth.removeAvatar.mutateAsync();
```

---

## `authLocal`

### `authLocal.login` (mutation) — público

```ts
await trpc.authLocal.login.mutateAsync({
  email: "maria.silva@empresa.pt",
  password: "SenhaSegura123!",
});
```

### `authLocal.listCoordinators` (query) — Super Admin

Lista empresas (coordenadores) para criar utilizadores.

```ts
const { data } = trpc.authLocal.listCoordinators.useQuery();
```

### `authLocal.register` (mutation)

Super Admin a criar vendedor numa empresa existente (`tenantCoordinatorUserId` = id do coordenador).

```ts
await trpc.authLocal.register.mutateAsync({
  name: "João Pereira",
  email: "joao.pereira@empresa.pt",
  password: "NovaSenha2026!",
  crmRole: "vendedor",
  tenantCoordinatorUserId: 12, // id do utilizador com crmRole "coordenador"
});
```

Coordenador **novo** (só Super Admin):

```ts
await trpc.authLocal.register.mutateAsync({
  name: "Ana Costa — Vodafone Partner",
  email: "ana.costa@partner.pt",
  password: "Coord2026!!",
  crmRole: "coordenador",
});
```

### `authLocal.listUsers` (query)

Quem tem permissão de directorio de utilizadores vê a lista filtrada por tenant.

```ts
const { data } = trpc.authLocal.listUsers.useQuery();
```

---

## `contacts`

### `contacts.list` (query)

```ts
const { data } = trpc.contacts.list.useQuery({
  search: "vodafone",
  status: "em_contacto", // opcional: "todos" ou estado específico
});
```

### `contacts.add` (mutation)

```ts
await trpc.contacts.add.mutateAsync({
  phone: "919876543",
  name: "Carla Mendes",
  email: "carla.mendes@email.pt",
  origin: "Stand Colombo",
  notes: "Interessada em fibra 500 Mbps + TV",
});
```

### `contacts.bulkAdd` (mutation)

```ts
await trpc.contacts.bulkAdd.mutateAsync({
  phones: ["916111222", "917333444", "918555666"],
  names: ["Cliente A", "Cliente B", ""],
  listName: "Campanha Fibra Lisboa — Maio 2026",
  assignTo: 45, // opcional: id do vendedor
});
```

### `contacts.update` (mutation) — CE/CO/Super Admin (edição de gestão)

```ts
await trpc.contacts.update.mutateAsync({
  id: 1205,
  name: "Carla Mendes Alves",
  phone: "919876543",
  status: "pendente",
  notes: "Pediu chamada na terça após as 18h",
  postalCode: "1000-001",
});
```

---

## `pendentes`

### `pendentes.list` (query)

Sem input.

```ts
const { data } = trpc.pendentes.list.useQuery();
```

### `pendentes.create` (mutation)

```ts
await trpc.pendentes.create.mutateAsync({
  contactId: 1205,
  returnDate: "2026-05-20T16:00:00.000Z",
  notes: "Enviar proposta Vodafone Fibra + móvel",
  offerDesired: "Pacote família 4 linhas",
});
```

### `pendentes.update` (mutation)

```ts
await trpc.pendentes.update.mutateAsync({
  id: 88,
  status: "realizado",
  notes: "Cliente fechou — enviado para backoffice",
});
```

---

## `calendar`

### `calendar.list` (query)

```ts
const { data } = trpc.calendar.list.useQuery({
  from: "2026-05-01T00:00:00.000Z",
  to: "2026-05-31T23:59:59.999Z",
});
```

### `calendar.create` (mutation)

```ts
await trpc.calendar.create.mutateAsync({
  title: "Instalação Vodafone — Rua das Flores",
  description: "Técnico externo; cliente com código portão 1234",
  type: "instalacao",
  startAt: "2026-05-22T09:00:00.000Z",
  endAt: "2026-05-22T11:00:00.000Z",
  allDay: false,
  contactId: 1205,
  assignedTo: 45,
});
```

### `calendar.update` / `calendar.remove` (mutation)

```ts
await trpc.calendar.update.mutateAsync({
  id: 301,
  title: "Instalação Vodafone (reagendada)",
  startAt: "2026-05-23T14:00:00.000Z",
});

await trpc.calendar.remove.mutateAsync({ id: 301 });
```

---

## `contracts`

### `contracts.list` (query)

Sem input.

### `contracts.create` (mutation)

```ts
await trpc.contracts.create.mutateAsync({
  contactId: 1205,
  type: "portabilidade",
  product: "telecom",
});
```

---

## `campaigns`

### `campaigns.list` (query)

Sem input.

### `campaigns.create` (mutation)

```ts
await trpc.campaigns.create.mutateAsync({
  title: "Repsol Luz — campanha poupança",
  description: "Tarifa simples vs bi-horária; foco em facturas acima de 80 €",
  product: "energia",
  startDate: "2026-05-01",
  endDate: "2026-06-30",
});
```

### `campaigns.archive` / `campaigns.remove`

```ts
await trpc.campaigns.archive.mutateAsync({ campaignId: 14 });
await trpc.campaigns.remove.mutateAsync({ campaignId: 14 });
```

### `campaigns.files` (query)

```ts
const { data } = trpc.campaigns.files.useQuery({ campaignId: 14 });
```

### `campaigns.uploadPdf` (mutation)

```ts
await trpc.campaigns.uploadPdf.mutateAsync({
  campaignId: 14,
  filename: "script_objeccoes_repsol.pdf",
  base64: "JVBERi0xLjQK...", // PDF em base64
});
```

### `campaigns.removePdf` (mutation)

```ts
await trpc.campaigns.removePdf.mutateAsync({ fileId: 9 });
```

---

## `ai`

### `ai.askObjection` (mutation)

```ts
const r = await trpc.ai.askObjection.mutateAsync({
  objection: "Está mais barato na Meo, não quero mudar.",
});
// r.response — texto sugerido para o vendedor
```

---

## `admin` — **Super Admin**

### `admin.getSettings` (query)

Sem input.

### `admin.updateSettings` (mutation)

Campos opcionais; strings vazias **mantêm** segredos existentes (comportamento actual).

```ts
await trpc.admin.updateSettings.mutateAsync({
  aiEnabled: true,
  preferredAiProvider: "openai",
  openaiApiKey: "sk-proj-xxxxxxxx", // novo valor; omitir ou "" para não alterar
  forgeApiUrl: "https://forge.manus.im",
  forgeApiKey: "forge_pat_xxxxxxxx",
  whatsappPhoneNumberId: "123456789012345",
  whatsappAccessToken: "EAAG...",
});
```

### `admin.purgeData` (mutation)

```ts
await trpc.admin.purgeData.mutateAsync({
  scope: "crm_only",
  confirm: "APAGAR",
});
```

---

## `calls`

### `calls.log` (mutation)

```ts
await trpc.calls.log.mutateAsync({
  contactId: 1205,
  outcome: "pendente",
  notes: "Marcou visita presencial ao stand",
  lossReason: null,
});
```

Outros `outcome`: `"atendeu"`, `"nao_atende"`, `"ocupado"`, `"numero_errado"`, `"venda"`, `"sem_interesse"`.

---

## `dashboard`

### `dashboard.stats` (query)

Sem input — KPIs conforme o papel.

```ts
const { data } = trpc.dashboard.stats.useQuery();
```

---

## `distribution`

### `distribution.getNext` (query)

Próximo contacto na fila de distribuição (regras internas).

### `distribution.repescagem` (query)

Contactos para repescagem.

---

## `dialer` — **vendedor**

### `dialer.next` (query)

Sem input — devolve pendente em atraso ou fila.

### `dialer.outcome` (mutation)

**Não atendeu:**

```ts
await trpc.dialer.outcome.mutateAsync({
  contactId: 1205,
  outcome: "nao_atende",
  notes: "Caixa de voz cheia",
});
```

**Atendeu — lead:**

```ts
await trpc.dialer.outcome.mutateAsync({
  contactId: 1205,
  outcome: "atendeu",
  disposition: "lead",
  notes: "Quer comparar Vodafone vs NOS — enviar simulação",
});
```

**Atendeu — pendente:**

```ts
await trpc.dialer.outcome.mutateAsync({
  contactId: 1205,
  outcome: "atendeu",
  disposition: "pendente",
  pendenteReturnDate: "2026-05-25T18:00:00.000Z",
  pendenteNotes: "Ligar depois do expediente — trabalha turnos",
});
```

---

## `supervision`

### `supervision.teamStatus` (query)

Estado da equipa (online, discador, IP, etc.) — CE/CEJ/Coordenador/Super Admin.

### `supervision.alerts` (query)

Alertas (pendentes em atraso, etc.).

---

## `blacklist`

### `blacklist.add` (mutation)

```ts
await trpc.blacklist.add.mutateAsync({
  phone: "964000000",
  reason: "Cliente pediu RGPD — não voltar a contactar",
});
```

---

## `gamification`

### `gamification.ranking` (query)

Ranking do mês actual (vendas activas instaladas).

---

## `audit`

### `audit.list` (query)

```ts
const { data } = trpc.audit.list.useQuery({ limit: 100 });
```

---

## `scripts` (argumentários concorrentes)

### `scripts.list` (query)

### `scripts.create` (mutation)

```ts
await trpc.scripts.create.mutateAsync({
  competitor: "NOS",
  weakness: "Fidelização 24 meses rígida; penalização alta na rescisão antecipada",
  ourStrength: "Vodafone permite renegociar ao fim de 12 meses com campanha retention",
  product: "telecom",
});
```

---

## `sales`

### `sales.list` (query)

```ts
const { data } = trpc.sales.list.useQuery({ month: 5, year: 2026 });
```

### `sales.create` (mutation)

```ts
await trpc.sales.create.mutateAsync({
  contactId: 1205,
  product: "energia",
  offer: "Tarifa simples Repsol — desconto 15 % 12 meses",
  value: "annual_estimate_540eur",
  installationDate: "2026-06-01",
});
```

### `sales.update` (mutation) — gestão de ciclo de vida

```ts
await trpc.sales.update.mutateAsync({
  saleId: 501,
  status: "activo",
  installationDate: "2026-06-02",
});
```

---

## `session` (presença / pausa)

### `session.goOnline` / `session.goOffline` (mutation)

Normalmente chamados pela app ao iniciar/sair.

### `session.startPause` / `session.endPause` (mutation)

```ts
await trpc.session.startPause.mutateAsync();
await trpc.session.endPause.mutateAsync();
```

### `session.getStatus` (query)

```ts
const { data } = trpc.session.getStatus.useQuery(undefined, { refetchInterval: 15000 });
```

---

## `origins`

### `origins.list` (query)

### `origins.create` (mutation)

```ts
await trpc.origins.create.mutateAsync({ name: "Facebook Ads — Fibra PT" });
```

---

## `energy` (tarifário calculadora)

### `energy.getConfig` (query)

### `energy.updateConfig` (mutation) — **coordenador**

```ts
await trpc.energy.updateConfig.mutateAsync({
  priceKwhSimples: "0.1690",
  priceKwhBiHorariaPonta: "0.1890",
  priceKwhBiHorariaVazio: "0.0990",
  baseDiscountPercent: "12",
  vdfClientExtraPercent: "5",
  vdfGasClientExtraPercent: "3",
  reembolsoPercent: "2",
});
```

---

## `teams`

### `teams.list` / `teams.mine` (query)

### `teams.create` (mutation)

```ts
await trpc.teams.create.mutateAsync({
  name: "Equipa Norte — Porto",
  leaderId: 45,
});
```

### `teams.updateContactEmail` (mutation)

```ts
await trpc.teams.updateContactEmail.mutateAsync({
  teamId: 3,
  contactEmail: "equipa.norte@empresa.pt",
});
```

---

## `sos`

### `sos.openList` (query)

Pedidos SOS abertos (supervisão).

### `sos.create` (mutation)

```ts
await trpc.sos.create.mutateAsync({
  contactId: 1205,
  message: "Cliente agressivo no telefone — preciso de conferência com CE",
});
```

Sem contacto:

```ts
await trpc.sos.create.mutateAsync({
  message: "Travamento no CRM ao gravar pendente",
});
```

---

## Chamadas HTTP fora do React

O servidor usa **superjson**. O caminho é:

`POST /api/trpc/<procedimento>`  
ou batch: `POST /api/trpc/<p1,p2>?batch=1`

Para testes rápidos é mais fiável usar o **cliente oficial** (`createTRPCProxyClient` + `httpBatchLink` + `superjson`) num script Node do que montar JSON à mão.

Exemplo mínimo (após login com cookie):

```bash
curl -sS 'https://SEU_DOMINIO/api/trpc/auth.me' \
  -H 'Cookie: app_session_id=...'
```

Para **mutations** com body, o formato exacto depende da versão do cliente; usa o painel da app ou um script com `@trpc/client`.

---

## Variáveis só no servidor (sem UI Super Admin)

Estas **não** estão na página Super Admin de propósito (arranque / segurança):

| Variável          | Uso |
|-------------------|-----|
| `DATABASE_URL`    | MySQL |
| `JWT_SECRET`      | Cookies / encriptação de segredos em `appSettings` |
| `VITE_APP_ID`     | Integração OAuth Manus |
| `OAUTH_SERVER_URL`| OAuth |
| `OWNER_OPEN_ID`   | Bootstrap proprietário |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | Cookies HTTPS/HTTP |

Prioridade **Forge**: variáveis `BUILT_IN_FORGE_API_*` no ambiente sobrepõem-se aos campos **Forge** guardados na base (Super Admin).
