-- Estado «cliente fidelizado» para contactos (discador / filtros).

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
