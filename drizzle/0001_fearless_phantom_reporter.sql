CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entity` varchar(100) NOT NULL,
	`entityId` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blacklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`reason` text,
	`addedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blacklist_id` PRIMARY KEY(`id`),
	CONSTRAINT `blacklist_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `callLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`vendedorId` int NOT NULL,
	`outcome` enum('atendeu','nao_atende','ocupado','numero_errado','venda','pendente','sem_interesse') NOT NULL,
	`duration` int,
	`notes` text,
	`calledAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `callLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`product` enum('telecom','energia','ambos') NOT NULL DEFAULT 'ambos',
	`isActive` boolean NOT NULL DEFAULT true,
	`startDate` timestamp,
	`endDate` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `competitorScripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`competitor` varchar(255) NOT NULL,
	`weakness` text NOT NULL,
	`ourStrength` text NOT NULL,
	`product` enum('telecom','energia','ambos') NOT NULL DEFAULT 'ambos',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `competitorScripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`address` text,
	`postalCode` varchar(10),
	`origin` varchar(100) NOT NULL DEFAULT 'Telemarketing',
	`status` enum('novo','em_contacto','pendente','venda','nao_atende','sem_interesse','blacklist') NOT NULL DEFAULT 'novo',
	`assignedTo` int,
	`lastAssignedAt` timestamp,
	`attempts` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp,
	`addedBy` int,
	`hasEnergy` boolean NOT NULL DEFAULT false,
	`hasTelecom` boolean NOT NULL DEFAULT false,
	`lossReason` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`vendedorId` int NOT NULL,
	`type` enum('contrato','portabilidade','rescisao') NOT NULL,
	`product` enum('telecom','energia') NOT NULL,
	`status` enum('gerado','enviado','lido','assinado','cancelado') NOT NULL DEFAULT 'gerado',
	`emailSentAt` timestamp,
	`emailReadAt` timestamp,
	`signedAt` timestamp,
	`installationDate` timestamp,
	`documentUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `energyCalculations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int,
	`vendedorId` int NOT NULL,
	`currentProvider` varchar(100),
	`currentMonthlyBill` text,
	`currentConsumptionKwh` text,
	`ourOffer` text,
	`estimatedSavings` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `energyCalculations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gamification` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`points` int NOT NULL DEFAULT 0,
	`totalCalls` int NOT NULL DEFAULT 0,
	`totalSales` int NOT NULL DEFAULT 0,
	`totalPendentes` int NOT NULL DEFAULT 0,
	`badges` text,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gamification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pendentes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`vendedorId` int NOT NULL,
	`returnDate` timestamp NOT NULL,
	`notes` text,
	`offerDesired` text,
	`status` enum('agendado','realizado','expirado','cancelado') NOT NULL DEFAULT 'agendado',
	`notified` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pendentes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`vendedorId` int NOT NULL,
	`product` enum('telecom','energia') NOT NULL,
	`offer` text,
	`value` text,
	`status` enum('pendente_instalacao','instalado','cancelado') NOT NULL DEFAULT 'pendente_instalacao',
	`installationDate` timestamp,
	`closedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sosRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendedorId` int NOT NULL,
	`contactId` int,
	`message` text,
	`status` enum('aberto','em_atendimento','resolvido') NOT NULL DEFAULT 'aberto',
	`respondedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `sosRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`leaderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `crmRole` enum('vendedor','cej','ce','coordenador') DEFAULT 'vendedor' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `teamId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `isOnline` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastOnlineAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `pauseStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `totalPauseMinutes` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `totalOnlineMinutes` int DEFAULT 0 NOT NULL;