CREATE TABLE `calendarEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`type` enum('geral','pendente','venda','instalacao') NOT NULL DEFAULT 'geral',
	`startAt` timestamp NOT NULL,
	`endAt` timestamp,
	`allDay` boolean NOT NULL DEFAULT true,
	`contactId` int,
	`assignedTo` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calendarEvents_id` PRIMARY KEY(`id`)
);
