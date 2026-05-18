-- Estado «fidelizado» em pendentes + cofre de documentos por venda.

ALTER TABLE `pendentes`
  MODIFY COLUMN `status` enum(
    'agendado',
    'realizado',
    'expirado',
    'cancelado',
    'nao_fechou',
    'fidelizado'
  ) NOT NULL DEFAULT 'agendado';

CREATE TABLE IF NOT EXISTS `sale_attachments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sale_id` int NOT NULL,
  `storage_key` varchar(512) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mime_type` varchar(128) NOT NULL,
  `size_bytes` int NOT NULL,
  `uploaded_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `sale_attachments_id` PRIMARY KEY(`id`),
  INDEX `sale_attachments_sale_id_idx` (`sale_id`)
);
