ALTER TABLE `sosRequests` ADD `tenantId` int;

UPDATE `sosRequests` s
INNER JOIN `users` u ON u.id = s.vendedorId
SET s.tenantId = u.tenantId
WHERE s.tenantId IS NULL AND u.tenantId IS NOT NULL;
