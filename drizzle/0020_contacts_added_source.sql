ALTER TABLE `contacts` ADD `addedSource` enum('manual','bulk','import','system') NOT NULL DEFAULT 'import';
