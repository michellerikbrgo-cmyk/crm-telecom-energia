ALTER TABLE `featureSuggestions`
  MODIFY `status` enum('pending','accepted','rejected','completed') NOT NULL DEFAULT 'pending';

CREATE TABLE `featureSuggestionEdits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `suggestionId` int NOT NULL,
  `editedBy` int NOT NULL,
  `oldTitle` varchar(255) NOT NULL,
  `oldBody` text NOT NULL,
  `newTitle` varchar(255) NOT NULL,
  `newBody` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `featureSuggestionEdits_id` PRIMARY KEY(`id`)
);

CREATE INDEX `featureSuggestionEdits_suggestionId` ON `featureSuggestionEdits` (`suggestionId`);
