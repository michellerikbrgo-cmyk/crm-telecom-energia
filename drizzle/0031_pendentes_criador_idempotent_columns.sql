-- Colunas idempotentes: historico_chamada (se migração 0030 não correu) e criador_id.

SET @db := DATABASE();
SET @t := 'pendentes';

-- historico_chamada
SET @c := 'historico_chamada';
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = @t AND COLUMN_NAME = @c) > 0,
    'SELECT 1',
    'ALTER TABLE `pendentes` ADD COLUMN `historico_chamada` text'
  )
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

-- criador_id (utilizador que abriu o registo; pode coincidir com vendedor_id)
SET @c := 'criador_id';
SET @sql := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = @t AND COLUMN_NAME = @c) > 0,
    'SELECT 1',
    'ALTER TABLE `pendentes` ADD COLUMN `criador_id` int NULL'
  )
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;
