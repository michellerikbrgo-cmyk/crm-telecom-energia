CREATE TABLE `featureSuggestions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int,
  `authorId` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  `reviewedBy` int,
  `reviewedAt` timestamp,
  `reviewNote` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `featureSuggestions_id` PRIMARY KEY(`id`)
);

CREATE INDEX `featureSuggestions_tenant_status` ON `featureSuggestions` (`tenantId`, `status`);
CREATE INDEX `featureSuggestions_status` ON `featureSuggestions` (`status`);
