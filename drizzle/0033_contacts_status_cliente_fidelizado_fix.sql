-- Corrige enum contacts.status: migra legados e adiciona cliente_fidelizado.

UPDATE `contacts` SET `status` = 'pendente' WHERE `status` IN ('em_contacto', 'fidelizado', 'outros');

ALTER TABLE `contacts`
  MODIFY COLUMN `status` enum(
    'novo',
    'pendente',
    'venda',
    'nao_atende',
    'sem_interesse',
    'blacklist',
    'sem_cobertura_fibra',
    'cliente_fidelizado'
  ) NOT NULL DEFAULT 'novo';
