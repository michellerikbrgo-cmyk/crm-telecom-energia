CREATE TABLE `appSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`aiEnabled` boolean NOT NULL DEFAULT true,
	`openaiApiKeyEnc` text,
	`geminiApiKeyEnc` text,
	`deepseekApiKeyEnc` text,
	`claudeApiKeyEnc` text,
	`preferredAiProvider` enum('openai','gemini','deepseek','claude') NOT NULL DEFAULT 'openai',
	`whatsappEnabled` boolean NOT NULL DEFAULT false,
	`whatsappAccessTokenEnc` text,
	`whatsappPhoneNumberId` varchar(64),
	`whatsappBusinessAccountId` varchar(64),
	`whatsappVerifyTokenEnc` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `isSuperAdmin` boolean DEFAULT false NOT NULL;