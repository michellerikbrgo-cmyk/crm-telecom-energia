# Actualizações do CRM — referência

Documento versionado no repositório (`shared/ATUALIZACOES.md`). Actualize este ficheiro quando implementar melhorias relevantes; o texto aparece também na página **Super Admin**.

---

## Autenticação e infraestrutura

- Login com **e-mail e senha** e sessão **JWT** (`JWT_SECRET`).
- Armazenamento de ficheiros **local** (`LOCAL_UPLOAD_ROOT`), servidos em `/manus-storage/`.
- Remoção do ecossistema externo **Manus / Forge / OAuth** que existia antes desta linha de produto.

---

## Log de actualização (deploy)

- Script **`pnpm run deploy:pm2`**: build + registo em **`data/release-log.json`** + reinício PM2.
- **`release-log-bootstrap.json`** na raiz: histórico inicial curado no Git.
- **Fusão na leitura**: deploy recente + bootstrap (entradas antigas curadas não desaparecem só porque já existe ficheiro no servidor).
- **Retenção de 15 dias** para entradas **automáticas** de deploy (no disco); blocos do bootstrap permanecem até os editar no repo.
- Variáveis opcionais: `DEPLOY_NOTES`, `DEPLOY_REF` / `GITHUB_SHA`.

---

## Alerta global aos utilizadores

- Na Super Admin é possível definir um **texto de aviso** mostrado na barra superior aos utilizadores (exc. Super Admin ao trabalhar).
- Cada nova publicação incrementa uma **revisão**; quem fechou o aviso volta a ver quando houver revisão nova.

---

## Papéis (recordatório)

- **CEJ** = **Chefe de Equipa Júnior** (`crmRole`: `cej`) — mesmo conceito que «chefe de equipa jr».
- **CE** = Chefe de Equipa (`ce`).
- Hierarquia típica: Coordenador → CE → (CEJ opcional) → Vendedores.

---

## Lista negra por equipa

- Campo **`teamId`** na tabela de lista negra: bloqueios ficam associados à **equipa do chefe** (além do tenant / empresa).
- **Vendedor e CEJ**: podem **adicionar** (ex.: a partir do discador) mas **não veem** a lista de números nesta página (política interna).
- **CE** e **Coordenador**: veem números; CE filtra pela **sua equipa**; CE pode **remover** linhas da sua equipa.
- **Coordenador**: âmbito empresa (inclui linhas sem `teamId` herdadas).

---

## Contactos manuais

- Contactos criados manualmente por **vendedor** ou **CEJ** ficam **atribuídos ao criador**.
- **Chefe de Equipa** não vê esses contactos em estado **novo / em_contacto** até passarem a **pendente** ou estado seguinte (visibilidade alargada a partir daí).
- **CEJ** não vê contactos manuais **de outros** nesses estados iniciais.

---

## Discador e pendentes

- Consultas de datas nos pendentes usam operadores tipados do ORM (**lte / gte / lt**) para compatibilidade estável com MySQL.
- **Migrar a base**: garantir migração **`0013_pendentes_priority`** (`priorityLevel`) para o discador e listagens funcionarem.

---

## Vendas e acompanhamento

- Endpoint **`sales.pipeline`** com vista filtrada por estado da venda.
- Página **Acompanhamento** (`/acompanhamento`) para seguir o pipeline (âmbito: próprio vendedor ou equipa consoante o papel).
- Estados possíveis incluem **aguarda instalação**, **em aberto** (ex.: problema técnico), **activo**, **e_switch** (energia), **cancelado**.

---

## Calendário e instalações

- Eventos de calendário respeitam **equipa** para CE / CEJ (e visibilidade do coordenador para reuniões institucionais).
- Criação de eventos: **Coordenador**, **CE** e **CEJ**.
- Ao definir **data de instalação** numa venda, é criado/atualizado um evento de **instalação** ligado ao contacto.

---

## Ranking e relatórios

- Para **CE** e **CEJ**, ranking e métricas agregadas consideram a **equipa** (não o tenant inteiro).
- **Relatórios**: ao actualizar estado de venda, sincronizam-se também pipeline e calendário.

---

## Campanhas

- **CEJ** pode **criar campanhas** e **carregar PDFs** (alinhado com CE e coordenador).

---

## Base de dados (importação)

- **CE** e **CEJ**: ao atribuir uma lista importada, só podem escolher vendedores da **própria equipa**.

---

## Migrações SQL relevantes

- `0014` — alerta global (`userBroadcastAlert`) em `appSettings`.
- `0015` — `blacklist.teamId` para isolamento por equipa.
- `0016` — `featureSuggestions`: página **Beta** (`/beta`) para sugestões; área interna de gestão vê roadmap consolidado de aceites.

---

## Beta — sugestões de funcionalidades

- Qualquer utilizador autenticado pode enviar ideias em **`/beta`**.
- **Coordenador** rever sugestões da empresa (aceitar / recusar); existe também fluxo interno de revisão global na gestão da plataforma.
- Sugestões **aceites** aparecem na página Beta (filtradas por empresa) e na área interna de administração como lista **«Próxima versão»** (consolidado).

---

*Última revisão deste documento: actualizar manualmente em cada release significativo.*
