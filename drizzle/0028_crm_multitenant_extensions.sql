-- Extensões CRM: fidelização em contactos, blacklist por sub-empresa, vendas/pendentes, RH, calendário.

ALTER TABLE `contacts` ADD COLUMN `data_fidelizacao` date NULL;
ALTER TABLE `contacts` ADD COLUMN `import_batch_label` varchar(255) NULL;

ALTER TABLE `blacklist` ADD COLUMN `company_id` int NULL;
ALTER TABLE `blacklist`
  ADD CONSTRAINT `fk_blacklist_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE `blacklist` b
  INNER JOIN `users` u ON u.id = b.addedBy
  SET b.company_id = u.companyId
  WHERE b.company_id IS NULL AND u.companyId IS NOT NULL;
ALTER TABLE `blacklist` DROP INDEX `blacklist_phone_tenant`;
CREATE INDEX `idx_blacklist_phone_company` ON `blacklist` (`phone`, `company_id`);
CREATE INDEX `idx_blacklist_phone_tenant` ON `blacklist` (`phone`, `tenant_id`);

CREATE TABLE `motivos_nao_fechamento` (
  `id` int AUTO_INCREMENT NOT NULL,
  `descricao` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `motivos_nao_fechamento_id` PRIMARY KEY(`id`)
);

ALTER TABLE `sales` MODIFY COLUMN `status` enum(
  'aguarda_instalacao','em_aberto','activo','e_switch','cancelado','pendente','nao_fechou'
) NOT NULL DEFAULT 'aguarda_instalacao';

ALTER TABLE `sales` ADD COLUMN `public_sale_id` varchar(32) NULL;
ALTER TABLE `sales` ADD UNIQUE INDEX `uniq_sales_public_sale_id` (`public_sale_id`);
ALTER TABLE `sales` ADD COLUMN `data_ativacao` timestamp NULL;
ALTER TABLE `sales` ADD COLUMN `antigo_titular_nome` varchar(255) NULL;
ALTER TABLE `sales` ADD COLUMN `antigo_titular_nif` varchar(32) NULL;
ALTER TABLE `sales` ADD COLUMN `motivo_nao_fechamento_id` int NULL;
ALTER TABLE `sales` ADD CONSTRAINT `fk_sales_motivo_nao_fechamento`
  FOREIGN KEY (`motivo_nao_fechamento_id`) REFERENCES `motivos_nao_fechamento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `sales` ADD COLUMN `pre_agendamento_at` timestamp NULL;
ALTER TABLE `sales` ADD COLUMN `titular_troca` tinyint NOT NULL DEFAULT 0;
ALTER TABLE `sales` ADD COLUMN `sale_detail_json` text NULL;

ALTER TABLE `pendentes` MODIFY COLUMN `status` enum(
  'agendado','realizado','expirado','cancelado','nao_fechou'
) NOT NULL DEFAULT 'agendado';
ALTER TABLE `pendentes` ADD COLUMN `motivo_nao_fechamento_id` int NULL;
ALTER TABLE `pendentes` ADD CONSTRAINT `fk_pendentes_motivo_nao_fechamento`
  FOREIGN KEY (`motivo_nao_fechamento_id`) REFERENCES `motivos_nao_fechamento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `users` ADD COLUMN `nif` varchar(20) NULL;
ALTER TABLE `users` ADD COLUMN `sfid` varchar(64) NULL;
ALTER TABLE `users` ADD COLUMN `bloqueado` tinyint NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `team_leader_junior_id` int NULL;
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_team_leader_junior` FOREIGN KEY (`team_leader_junior_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `calendarEvents` ADD COLUMN `company_id` int NULL;
ALTER TABLE `calendarEvents`
  ADD CONSTRAINT `fk_calendar_events_company` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `calendar_event_invitees` (
  `id` int AUTO_INCREMENT NOT NULL,
  `event_id` int NOT NULL,
  `user_id` int NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `calendar_event_invitees_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_calendar_event_invitee` UNIQUE(`event_id`, `user_id`),
  CONSTRAINT `fk_calendar_invitee_event` FOREIGN KEY (`event_id`) REFERENCES `calendarEvents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_calendar_invitee_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO `motivos_nao_fechamento` (`descricao`) VALUES
  ('Preço / concorrência'),
  ('Sem cobertura / técnico'),
  ('Desistência do cliente'),
  ('Documentação incompleta'),
  ('Outro');
