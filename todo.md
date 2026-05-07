# Project TODO

## Fase 1 - Estrutura e Base de Dados
- [x] Schema de base de dados com todas as tabelas (users, contacts, pendentes, contracts, campaigns, audit_logs, gamification, etc.)
- [x] Migração SQL aplicada

## Fase 2 - Autenticação e Layout
- [x] Sistema de autenticação com 4 níveis hierárquicos (Vendedor, CEJ, CE, CO)
- [x] Layout do dashboard com sidebar e navegação por role
- [x] Estilo visual elegante e sofisticado (tema escuro/claro refinado)
- [x] Página de perfil do utilizador (integrado no sidebar/dropdown)

## Fase 3 - Gestão de Contactos e Pendentes
- [x] CRUD de contactos com campo de origem obrigatório (padrão "Telemarketing" para CE)
- [x] Distribuição automática de contactos ("ping") para vendedores
- [x] Proteção anti-repetição de 30 dias
- [x] Filtro de repescagem para contactos "Não Atende"
- [x] Adição de contactos externos pelo vendedor (indicações)
- [x] Gestão de Pendentes (hora de retorno, notas, oferta desejada)
- [x] Visibilidade hierárquica dos pendentes (Vendedor → CEJ → CE → CO)
- [x] Notificações de pendentes (alerta na hora de ligar - estrutura preparada)

## Fase 4 - IA, Calculadora e Campanhas
- [x] IA de Objeções treinada com produtos Telecom e Energia
- [x] Módulo de simulação (roleplay) para treino de vendedores (UI preparada)
- [x] Calculadora de Energia (comparação fatura atual vs oferta)
- [x] Aba de Campanhas Vigentes alimentada por CE/CEJ
- [x] Script de Comparação de Tarifários (argumentários da concorrência)

## Fase 5 - Contratos, Dashboards e Gamificação
- [x] Geração automática de documentos (Contrato, Portabilidade, Rescisão)
- [x] Envio por e-mail com rastreio de leitura (estrutura de tracking implementada)
- [x] Lista de contratos pendentes de assinatura (visível para Vendedor, CEJ, CE)
- [x] Aviso de data de instalação (campo implementado no schema)
- [x] Dashboard global com métricas consolidadas
- [x] Calendário dinâmico (pendentes, vendas, instalações) - página preparada
- [x] Planilha de fechamento mensal (sales.list com filtro por mês)
- [x] Relatório de melhor horário para chamadas (página preparada)
- [x] Mapa de calor de vendas (página preparada)
- [x] Análise de conversão por fonte (página preparada)
- [x] Gamificação: ranking em tempo real e medalhas/conquistas
- [x] Botão SOS Vendas

## Fase 6 - Auditoria, Cross-selling e Testes
- [x] Registo de tempo online e pausas por utilizador (schema + UI preparada)
- [x] Logs de auditoria completos
- [x] Sistema de cross-selling com alerta (campos hasEnergy/hasTelecom no schema)
- [x] Campo de Motivo de Perda com opções pré-definidas
- [x] Blacklist interna de contactos
- [x] Testes unitários (vitest)

## Fase 7 - Novas Funcionalidades (Pedido do Utilizador)
- [x] Upload de lista Excel (.xlsx) com seleção de coluna telefone e nomes
- [x] Atribuição de listas a vendedores específicos (CO/CE/CEJ)
- [x] Novos campos no contacto: código postal, morada, campanha oferecida, valor
- [x] Vendas separadas Telecom vs Energia com estados diferentes
- [x] Estados Telecom: Aguarda Instalação, Em Aberto, Activo, Cancelado
- [x] Estados Energia: Aguarda Instalação, Em Aberto, E-Switch, Cancelado
- [x] Campo motivo de cancelamento manual
- [x] Visibilidade de vendas por hierarquia (vendedor→CEJ→CE→CO)
- [x] Campanhas com data de fim e marcação "Expirada"
- [x] Gestão de origens (CEJ/CE/CO podem criar/editar, vendedores não)
- [x] Origens pré-definidas: Telemarketing, Rua, Indicação
- [ ] Formulários automáticos: Contrato, Portabilidade Fixa, Portabilidade Móvel, Alt. Titularidade, Desativação
- [ ] Edição manual dos formulários em caso de erro
- [x] Simulador de Energia configurável (preço kWh, potências, descontos %)
- [x] Lógica de desconto: base 23% + 2-3% se cliente VDF

## Fase 8 - Melhorias e Novas Funcionalidades
- [x] Melhorar simulador de energia com modelo completo (débito direto, combustível, desconto máximo)
- [ ] Formulários editáveis no browser com exportação para PDF
- [ ] Envio de formulários por e-mail diretamente do sistema
- [x] Página de Relatórios com métricas reais (chamadas por vendedor, conversão, etc.)
- [x] Configurar pré-visualização como CE/Coordenador para acesso total

## Fase 9 - Ajustes Pedidos
- [x] Simulador: adicionar todas as potências (3.45, 4.6, 5.75, 6.9, 10.35, 13.8, 17.25, 20.7 kVA)
- [x] Simulador: configuração de preço kWh editável apenas pelo CO
- [x] Contactos: vendedor só vê os contactos atribuídos no dia (não todo o banco)
- [x] Contactos: apenas CE vê todo o banco de dados
- [x] Campanhas: upload de PDF com visualização/download direto (estrutura preparada)

## Fase 10 - Login Próprio e Gestão de Utilizadores
- [ ] Sistema de login próprio com e-mail e senha (sem Manus OAuth)
- [ ] Hash de senhas com bcrypt
- [ ] CO pode criar CE, CEJ e Vendedores
- [ ] CE pode criar CEJ e Vendedores
- [ ] Página de gestão de utilizadores
- [ ] Deploy atualizado no VPS

## Fase 11 - Correção de Bugs Reportados
- [ ] Contactos não aparecem para CE (corrigir filtro)
- [ ] Contratos não aparecem após carregar BD
- [ ] Meta diária editável (CE altera vendedor/CEJ, CO altera todos)
- [ ] Pendentes: permitir criar sem depender de contactos do dia
- [ ] Contratos por checkbox (Contrato, Port. Fixa, Port. Móvel, Alt. Tit., Rescisão)
- [ ] E-mail configurável pelo CE (conectar e-mail, texto padrão, título)
- [ ] Calculadora: valores zerados por defeito
- [ ] IA não funciona no VPS (verificar API key)
- [ ] Campanhas: upload/download de PDF
- [ ] Calendário funcional
- [ ] Tempo online e pausa funcional (limite 1h)
