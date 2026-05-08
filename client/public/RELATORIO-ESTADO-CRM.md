# Relatório — Estado do CRM Telecom / Energia

Documento gerado a pedido: resumo do que o sistema **faz até agora** e do que está **pendente, incompleto ou com limitações**.

**No browser:** `http://<seu-ip>/RELATORIO-ESTADO-CRM.md` (ou o mesmo com `:3000` se aceder directo ao Node).

---

## 1. O que o CRM faz até agora

### Autenticação e utilizadores

- Login **local** (e-mail / palavra-passe) e sessão por **cookie**.
- Utilizador carregado da base de dados (papel CRM, Super Admin).
- **Papéis**: vendedor, CEJ (chefe de equipa júnior), CE, coordenador, **Super Admin**.
- Super Admin pode **criar utilizadores** com qualquer papel operacional e **listar** a equipa.
- **Menus** filtrados por papel; Super Admin tem **visão alargada** de navegação.

### Contactos

- Listagem com pesquisa e filtro por estado.
- Adicionar contacto individual; importação em massa (bulk) para telemarketing.
- Obter **próximo contacto** via distribuição.
- **Edição de contactos** reservada a **CE, coordenador e Super Admin** (dados como telefone, nome, e-mail, origem, estado, morada, notas).

### Pendentes (retornos)

- Criar pendente associado a um contacto.
- Listagem com **nome e telefone do contacto** quando existem na BD.
- **Atualização**: vendedor só os **seus** pendentes; **CEJ, CE, coordenador e Super Admin** podem editar qualquer pendente (data, estado, notas, oferta).

### Discador e chamadas

- Fluxo de **próximo contacto** na fila e resultado da chamada orientado a **vendedores**.
- Registo de chamadas e actualização de estados do contacto conforme o fluxo existente.

### Supervisão

- Visão de estado da equipa (online, estado do discador, etc.) para perfis adequados (**CEJ, CE, coordenador**).
- Lista simples de **alertas** (ex.: pendentes em atraso) para supervisão.

### Dashboard (início)

- Indicadores: **chamadas hoje**, **pendentes para hoje**, **vendas do mês** (critério: vendas **activas** com **data de instalação** no **mês corrente**).
- Posição indicativa no **ranking** segundo o mesmo critério (para utilizadores que entram como «vendedor» da venda).
- Alerta destacado quando há **pendentes em atraso** (data de retorno já passada), com lista e atalhos.
- Lista resumida de próximos pendentes; barra de **sessão / pausa**.
- Botão «próximo contacto»: comportamento específico para **vendedor**; outros perfis recebem mensagem orientativa e são encaminhados (ex.: supervisão ou contactos).

### Campanhas e materiais

- Listagem de **todas** as campanhas (não só as «ativas» no sentido estrito da BD): inclui estado lógico **vigente**, **expirada** (por data de fim) e **arquivada**.
- Upload e download de **PDFs** por campanha.
- **Criar**, **arquivar**, **eliminar** campanha e **remover PDF**: apenas **CE, coordenador e Super Admin** (não CEJ para estas acções na campanha).
- Separador **argumentários**: criação ainda também para **CEJ** (mantido relativamente aos scripts de concorrência).

### Vendas e ranking

- Pipeline de vendas com estados (aguarda instalação, em aberto, activo, e_switch, cancelado) exposto nos **relatórios / stats**.
- **Actualização manual** do estado da venda e da **data de instalação** por quem tem permissão (CEJ, CE, coordenador, Super Admin). Passar para **activo** exige **data de instalação** quando aplicável pela regra de negócio.
- Página **Ranking**: ordenação por número de vendas **activas** com instalação contabilizada **no mês actual**.

### Outros módulos existentes na aplicação

Consoante papel: **calendário**, **contratos**, **IA para objeções**, **calculadora**, **SOS**, **blacklist**, **auditoria**, **base de dados**, **Super Admin** (configurações, purge com protecção da auditoria), conforme já implementado nas rotas e páginas do projecto.

---

## 2. O que está pendente, incompleto ou com limitações

| Área | Descrição |
|------|-----------|
| **Deploy** | Garantir `npm run build` e reinício do processo (ex.: PM2) no servidor onde corre a produção. |
| **Total de contactos no dashboard** | O campo existe na estrutura de resposta mas **não está preenchido** com um valor real (incompleto). |
| **Tabela `gamification`** | O **ranking efectivo na app** já **não** depende desta tabela; pode ficar como legado até haver decisão de sincronizar pontos ou purgar. |
| **Relatórios analíticos** | Vários blocos («chamadas por vendedor», «vendas por fonte», «melhor horário», «motivos de perda») continuam essencialmente **placeholders** sem análises reais. |
| **Storage físico ao apagar PDF / campanha** | Remove registos na **base de dados**; pode **não remover** o ficheiro físico em storage conforme política/implementação externa — verificar ou completar limpeza. |
| **Filtro estrito CEJ por equipa** | O modelo pode ainda estar **demasiado amplo** (ver tudo ao nível de pendentes/alertas) se o negócio exigir apenas **equipa própria** por `teamId`. |
| **Super Admin vs Discador** | Super Admin vê entrada de Discador pelo menu «completo»; pode não ser **desejado** só por UX/perfil — ajustável. |
| **Ranking para perfis não vendedores** | A «posição no ranking» na dashboard faz mais sentido para quem aparece como **vendedor** nas vendas; coordenadores/CE podem não ter posição útil. |
| **Empates no ranking** | Desempates explícitos (ex.: alfabético) podem não estar definidos dependendo da query SQL. |
| **Outros métodos de login (OAuth)** | Utilizadores ou ambientes apenas OAuth / proxies podem ter **sessão ou sincronização** mais sensíveis à configuração de cookies e servidor. |

---

## 3. Síntese

O **fluxo núcleo** de vendas (contactos, pendentes, discador para vendedor, supervisão base, campanhas com papéis corrigidos, pipeline de vendas, marcação manual de instalação, ranking por vendas activas no mês, gestão de utilizadores com Super Admin) está **operacional** no código actual.

O que resta é sobretudo **profundidade de relatórios**, **alguns números da dashboard ainda por calcular**, **alinhamento fino por equipa (CEJ)**, **limpeza de ficheiros** e **ajustes de UX/regra de negócio** conforme a tua operação.

---

*Origem no repositório: `docs/RELATORIO-ESTADO-CRM.md` · **Público (browser):** `/RELATORIO-ESTADO-CRM.md`*
