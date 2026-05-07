# Project TODO

## Fase 1 - Estrutura e Base de Dados
- [x] Schema de base de dados com todas as tabelas (users, contacts, pendentes, contracts, campaigns, audit_logs, gamification, etc.)
- [x] Migração SQL aplicada

## Fase 2 - Autenticação e Layout
- [x] Sistema de autenticação com 4 níveis hierárquicos (Vendedor, CEJ, CE, CO)
- [x] Layout do dashboard com sidebar e navegação por role
- [x] Estilo visual elegante e sofisticado (tema escuro/claro refinado)
- [ ] Página de perfil do utilizador

## Fase 3 - Gestão de Contactos e Pendentes
- [x] CRUD de contactos com campo de origem obrigatório (padrão "Telemarketing" para CE)
- [ ] Distribuição automática de contactos ("ping") para vendedores
- [ ] Proteção anti-repetição de 30 dias
- [ ] Filtro de repescagem para contactos "Não Atende"
- [ ] Adição de contactos externos pelo vendedor (indicações)
- [x] Gestão de Pendentes (hora de retorno, notas, oferta desejada)
- [ ] Visibilidade hierárquica dos pendentes (Vendedor → CEJ → CE → CO)
- [ ] Notificações de pendentes (alerta na hora de ligar)

## Fase 4 - IA, Calculadora e Campanhas
- [x] IA de Objeções treinada com produtos Telecom e Energia
- [ ] Módulo de simulação (roleplay) para treino de vendedores
- [x] Calculadora de Energia (comparação fatura atual vs oferta)
- [x] Aba de Campanhas Vigentes alimentada por CE/CEJ
- [ ] Script de Comparação de Tarifários (argumentários da concorrência)

## Fase 5 - Contratos, Dashboards e Gamificação
- [ ] Geração automática de documentos (Contrato, Portabilidade, Rescisão)
- [ ] Envio por e-mail com rastreio de leitura
- [ ] Lista de contratos pendentes de assinatura (visível para Vendedor, CEJ, CE)
- [ ] Aviso de data de instalação
- [ ] Dashboard global com métricas consolidadas
- [ ] Calendário dinâmico (pendentes, vendas, instalações)
- [ ] Planilha de fechamento mensal
- [ ] Relatório de melhor horário para chamadas
- [ ] Mapa de calor de vendas
- [ ] Análise de conversão por fonte
- [x] Gamificação: ranking em tempo real e medalhas/conquistas
- [x] Botão SOS Vendas

## Fase 6 - Auditoria, Cross-selling e Testes
- [ ] Registo de tempo online e pausas por utilizador
- [ ] Logs de auditoria completos
- [ ] Sistema de cross-selling com alerta
- [ ] Campo de Motivo de Perda com opções pré-definidas
- [ ] Blacklist interna de contactos
- [x] Testes unitários (vitest)
