-- Discador: exclusão cliente Vodafone + sub-contactos; cooldown 30d por vendedor só após chamada atendida (callLogs).

ALTER TABLE `contacts` ADD `isVodafoneClient` tinyint(1) NOT NULL DEFAULT 0;

CREATE TABLE `contact_subcontacts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `contactId` int NOT NULL,
  `phone` varchar(20) NOT NULL,
  `category` varchar(32) NOT NULL DEFAULT 'vodafone_client',
  `source` varchar(16) NOT NULL DEFAULT 'automatic',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `contact_subcontacts_id` PRIMARY KEY(`id`),
  CONSTRAINT `contact_subcontacts_contactId_contacts_id_fk`
    FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON DELETE cascade ON UPDATE cascade
);

CREATE INDEX `contact_subcontacts_contactId` ON `contact_subcontacts` (`contactId`);
CREATE UNIQUE INDEX `contact_subcontacts_contact_category_phone`
  ON `contact_subcontacts` (`contactId`, `category`, `phone`);

CREATE INDEX `callLogs_dialer_answered_cooldown`
  ON `callLogs` (`contactId`, `vendedorId`, `outcome`, `calledAt`);
