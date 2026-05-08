ALTER TABLE `users` ADD `presenceSessionStartedAt` timestamp NULL;
ALTER TABLE `users` ADD `lastSeenIp` varchar(45) NULL;
ALTER TABLE `users` ADD `lastSeenUserAgent` varchar(512) NULL;
ALTER TABLE `users` ADD `lastSeenGeo` varchar(255) NULL;
