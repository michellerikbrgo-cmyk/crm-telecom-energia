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
