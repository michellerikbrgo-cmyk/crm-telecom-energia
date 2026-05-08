CREATE TABLE `contactOrigins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contactOrigins_id` PRIMARY KEY(`id`),
	CONSTRAINT `contactOrigins_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `energyConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`priceKwhSimples` text NOT NULL DEFAULT ('0.1500'),
	`priceKwhBiHorariaPonta` text NOT NULL DEFAULT ('0.2000'),
	`priceKwhBiHorariaVazio` text NOT NULL DEFAULT ('0.1000'),
	`baseDiscountPercent` text NOT NULL DEFAULT ('23.00'),
	`vdfClientExtraPercent` text NOT NULL DEFAULT ('2.00'),
	`vdfGasClientExtraPercent` text NOT NULL DEFAULT ('3.00'),
	`reembolsoPercent` text NOT NULL DEFAULT ('3.00'),
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `energyConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sales` MODIFY COLUMN `status` enum('aguarda_instalacao','em_aberto','activo','e_switch','cancelado') NOT NULL DEFAULT 'aguarda_instalacao';--> statement-breakpoint
ALTER TABLE `contacts` ADD `campaignOffered` varchar(255);--> statement-breakpoint
ALTER TABLE `contacts` ADD `offerValue` varchar(100);--> statement-breakpoint
ALTER TABLE `contacts` ADD `listName` varchar(255);--> statement-breakpoint
ALTER TABLE `sales` ADD `cancelReason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password` varchar(255);