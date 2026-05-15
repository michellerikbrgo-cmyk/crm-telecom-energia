-- Normalizar estados de contacto (remover em_contacto, outros, fidelizado) e histórico de chamada em pendentes.

ALTER TABLE `pendentes` ADD COLUMN `historico_chamada` text;

UPDATE `contacts` SET `status` = 'pendente' WHERE `status` IN ('em_contacto','fidelizado');
UPDATE `contacts` SET `status` = 'sem_interesse' WHERE `status` = 'outros';

ALTER TABLE `contacts`
  MODIFY COLUMN `status` enum(
    'novo',
    'pendente',
    'venda',
    'nao_atende',
    'sem_interesse',
    'blacklist',
    'sem_cobertura_fibra'
  ) NOT NULL DEFAULT 'novo';
