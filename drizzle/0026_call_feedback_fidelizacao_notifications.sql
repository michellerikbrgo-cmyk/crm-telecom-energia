-- Feedback pós-chamada, fidelizações, notificações internas, exclusões temporárias do discador.

CREATE TABLE `call_feedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contactId` int NOT NULL,
  `userId` int NOT NULL,
  `destination` varchar(32) NOT NULL,
  `observacoes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `call_feedback_id` PRIMARY KEY(`id`),
  CONSTRAINT `call_feedback_contactId_contacts_id_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT `call_feedback_userId_users_id_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade
);

CREATE INDEX `call_feedback_contactId` ON `call_feedback` (`contactId`);
CREATE INDEX `call_feedback_userId` ON `call_feedback` (`userId`);

CREATE TABLE `fidelizacoes_terminando` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contactId` int NOT NULL,
  `data_fim_fidelizacao` date NOT NULL,
  `operadora` varchar(32) NOT NULL,
  `observacoes` text,
  `createdBy` int NOT NULL,
  `companyId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fidelizacoes_terminando_id` PRIMARY KEY(`id`),
  CONSTRAINT `fidelizacoes_contactId_contacts_id_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT `fidelizacoes_createdBy_users_id_fk`
    FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade,
  CONSTRAINT `fidelizacoes_companyId_companies_id_fk`
    FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE cascade
);

CREATE INDEX `fidelizacoes_contactId` ON `fidelizacoes_terminando` (`contactId`);
CREATE INDEX `fidelizacoes_data_fim` ON `fidelizacoes_terminando` (`data_fim_fidelizacao`);

CREATE TABLE `crm_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `type` varchar(32) NOT NULL DEFAULT 'info',
  `message` text NOT NULL,
  `link` varchar(512),
  `readAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `crm_notifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `crm_notifications_userId_users_id_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade
);

CREATE INDEX `crm_notifications_user_created` ON `crm_notifications` (`userId`, `createdAt`);

ALTER TABLE `contacts` ADD `discardUntil` timestamp;

ALTER TABLE `contacts` MODIFY COLUMN `status` enum(
  'novo','em_contacto','pendente','venda','nao_atende','sem_interesse','blacklist',
  'outros','sem_cobertura_fibra','fidelizado'
) NOT NULL DEFAULT 'novo';
