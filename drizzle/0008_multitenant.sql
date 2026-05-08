ALTER TABLE `users` ADD `tenantId` int;
ALTER TABLE `teams` ADD `tenantId` int;
ALTER TABLE `contacts` ADD `tenantId` int;
ALTER TABLE `calendarEvents` ADD `tenantId` int;
ALTER TABLE `campaigns` ADD `tenantId` int;
ALTER TABLE `competitorScripts` ADD `tenantId` int;
ALTER TABLE `energyConfig` ADD `tenantCoordinatorUserId` int;

ALTER TABLE `blacklist` ADD `tenantId` int DEFAULT NULL;
ALTER TABLE `blacklist` DROP INDEX `blacklist_phone_unique`;
CREATE UNIQUE INDEX `blacklist_phone_tenant` ON `blacklist` (`phone`, `tenantId`);

ALTER TABLE `contactOrigins` ADD `tenantId` int DEFAULT NULL;
ALTER TABLE `contactOrigins` DROP INDEX `contactOrigins_name_unique`;
CREATE UNIQUE INDEX `contact_origins_tenant_name` ON `contactOrigins` (`tenantId`, `name`);

/* Opcional — dados já existentes:
UPDATE users SET tenantId = id WHERE crmRole = 'coordenador' AND tenantId IS NULL;
-- Repete CONTACTOS/campaTeams/etc., definindo tenantId = id_do_coordenador_dessa_org onde aplique.
*/
