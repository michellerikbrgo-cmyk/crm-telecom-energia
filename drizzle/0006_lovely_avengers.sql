ALTER TABLE `contacts` ADD `isLead` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `dialerState` enum('idle','ready','in_call','wrap_up') DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `dialerContactId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `dialerSource` enum('queue','pendente') DEFAULT 'queue' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `dialerUpdatedAt` timestamp;