ALTER TABLE `appSettings` ADD `userBroadcastAlert` text;
--> statement-breakpoint
ALTER TABLE `appSettings` ADD `userBroadcastAlertRevision` int DEFAULT 0 NOT NULL;
