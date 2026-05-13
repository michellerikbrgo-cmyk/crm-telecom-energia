-- Hierarquia: empresa (coordenador) > sub-empresa (chefe CE) > membros (vendedor/CEJ).
-- Mapeamento de papéis na app: coordinator = coordenador, team_leader = ce, member = vendedor | cej.

CREATE TABLE `companies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `coordinatorUserId` int,
  `parentCompanyId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `companies_id` PRIMARY KEY(`id`),
  UNIQUE INDEX `companies_coordinatorUserId_unique`(`coordinatorUserId`)
);

ALTER TABLE `companies` ADD CONSTRAINT `companies_parentCompanyId_companies_id_fk`
  FOREIGN KEY (`parentCompanyId`) REFERENCES `companies`(`id`) ON DELETE restrict ON UPDATE cascade;

ALTER TABLE `companies` ADD CONSTRAINT `companies_coordinatorUserId_users_id_fk`
  FOREIGN KEY (`coordinatorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE cascade;

ALTER TABLE `users` ADD `companyId` int;
ALTER TABLE `users` ADD CONSTRAINT `users_companyId_companies_id_fk`
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE cascade;

ALTER TABLE `contacts` ADD `companyId` int;
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_companyId_companies_id_fk`
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE cascade;

ALTER TABLE `teams` ADD `companyId` int;
ALTER TABLE `teams` ADD CONSTRAINT `teams_companyId_companies_id_fk`
  FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE set null ON UPDATE cascade;

-- ========== Backfill: uma empresa raiz por coordenador ==========
INSERT INTO `companies` (`name`, `coordinatorUserId`, `parentCompanyId`)
SELECT
  COALESCE(NULLIF(TRIM(u.`name`), ''), u.`email`, CONCAT('Empresa #', u.`id`)),
  u.`id`,
  NULL
FROM `users` u
WHERE u.`crmRole` = 'coordenador'
  AND u.`tenantId` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `companies` c WHERE c.`coordinatorUserId` = u.`id`);

UPDATE `users` u
INNER JOIN `companies` c ON c.`coordinatorUserId` = u.`id`
SET u.`companyId` = c.`id`
WHERE u.`crmRole` = 'coordenador' AND u.`companyId` IS NULL;

-- Sub-empresa por equipa (1 linha companies por team, nome interno estável)
INSERT INTO `companies` (`name`, `coordinatorUserId`, `parentCompanyId`)
SELECT
  CONCAT('__team_', t.`id`),
  NULL,
  rc.`id`
FROM `teams` t
INNER JOIN `companies` rc ON rc.`coordinatorUserId` = t.`tenantId`
WHERE t.`tenantId` IS NOT NULL
  AND t.`companyId` IS NULL
  AND NOT EXISTS (SELECT 1 FROM `companies` c2 WHERE c2.`name` = CONCAT('__team_', t.`id`));

UPDATE `teams` t
INNER JOIN `companies` sc ON sc.`name` = CONCAT('__team_', t.`id`)
SET
  t.`companyId` = sc.`id`,
  sc.`name` = COALESCE(NULLIF(TRIM(t.`name`), ''), CONCAT('Equipe #', t.`id`))
WHERE t.`companyId` IS NULL AND t.`tenantId` IS NOT NULL;

-- Utilizadores com teamId: companyId da equipa
UPDATE `users` u
INNER JOIN `teams` t ON t.`id` = u.`teamId`
SET u.`companyId` = COALESCE(t.`companyId`, u.`companyId`)
WHERE u.`teamId` IS NOT NULL AND t.`companyId` IS NOT NULL AND (u.`companyId` IS NULL OR u.`companyId` <> t.`companyId`);

-- CE sem teamId mas líder de equipa
UPDATE `users` u
INNER JOIN `teams` t ON t.`leaderId` = u.`id`
SET u.`companyId` = COALESCE(t.`companyId`, u.`companyId`), u.`teamId` = COALESCE(u.`teamId`, t.`id`)
WHERE u.`crmRole` = 'ce' AND t.`companyId` IS NOT NULL AND u.`companyId` IS NULL;

-- Membros (vendedor/cej) no tenant: companyId da raiz se ainda sem equipa
UPDATE `users` u
INNER JOIN `companies` rc ON rc.`coordinatorUserId` = u.`tenantId`
SET u.`companyId` = rc.`id`
WHERE u.`crmRole` IN ('vendedor', 'cej')
  AND u.`tenantId` IS NOT NULL
  AND u.`companyId` IS NULL
  AND u.`teamId` IS NULL;

-- Contactos: primeiro raiz do tenant; depois alinhar à sub-empresa do vendedor atribuído (isolamento entre equipas)
UPDATE `contacts` c
INNER JOIN `companies` rc ON rc.`coordinatorUserId` = c.`tenantId`
SET c.`companyId` = rc.`id`
WHERE c.`tenantId` IS NOT NULL AND c.`companyId` IS NULL;

UPDATE `contacts` c
INNER JOIN `users` seller ON seller.`id` = c.`assignedTo`
INNER JOIN `companies` sc ON sc.`id` = seller.`companyId` AND sc.`parentCompanyId` IS NOT NULL
SET c.`companyId` = sc.`id`
WHERE c.`assignedTo` IS NOT NULL;
