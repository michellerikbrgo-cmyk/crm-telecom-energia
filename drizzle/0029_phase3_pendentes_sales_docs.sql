-- Fase 3: PENDING_ID, campos de pré-venda, serviços e documentação

ALTER TABLE `pendentes`
  ADD COLUMN `public_pending_id` varchar(32) NULL,
  ADD COLUMN `client_nif` varchar(32) NULL,
  ADD COLUMN `operadora_atual` varchar(64) NULL,
  ADD COLUMN `converted_sale_id` int NULL;

CREATE UNIQUE INDEX `pendentes_public_pending_id_unique` ON `pendentes` (`public_pending_id`);

ALTER TABLE `sales`
  ADD COLUMN `status_documentacao` enum('pendente','enviado','assinado','back_office') NOT NULL DEFAULT 'pendente',
  ADD COLUMN `portabilidade_movel` boolean NOT NULL DEFAULT false,
  ADD COLUMN `portabilidade_fixa` boolean NOT NULL DEFAULT false,
  ADD COLUMN `desativacao_apoiada` boolean NOT NULL DEFAULT false;
