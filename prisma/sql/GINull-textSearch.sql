-- migration: add_fts_index_to_change.sql

-- Coluna tsvector gerada automaticamente a partir de searchText
ALTER TABLE "Change"
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', "searchText")
  ) STORED;

-- Índice GIN sobre a coluna gerada
CREATE INDEX change_search_vector_idx
  ON "Change" USING GIN (search_vector);

-- Índice extra para buscas por stat.name (ex: "Damage vs players")
CREATE INDEX stat_name_idx ON "Stat" USING GIN (to_tsvector('english', name));