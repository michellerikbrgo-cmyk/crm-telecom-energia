-- Contagem global de pedidos API (Gemini, pesquisa Tavily) por período; alertas de quota.

CREATE TABLE `system_api_usage` (
  `provider` varchar(32) NOT NULL,
  `periodKey` varchar(16) NOT NULL,
  `requestCount` int unsigned NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `system_api_usage_pk` PRIMARY KEY(`provider`, `periodKey`)
);

CREATE TABLE `system_api_usage_alerts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `provider` varchar(32) NOT NULL,
  `periodKey` varchar(16) NOT NULL,
  `alertCode` varchar(32) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `system_api_usage_alerts_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_provider_period_alert` UNIQUE(`provider`, `periodKey`, `alertCode`)
);
