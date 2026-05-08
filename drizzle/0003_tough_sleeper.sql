CREATE TABLE `campaignFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`sizeBytes` bigint NOT NULL,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaignFiles_id` PRIMARY KEY(`id`)
);
