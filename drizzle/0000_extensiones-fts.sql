-- Extensiones y configuración de búsqueda en español sin acentos.
-- Debe correr ANTES del esquema: la columna generada documentos.tsv usa
-- la configuración 'espanol_unaccent' y los índices trgm usan pg_trgm.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TEXT SEARCH CONFIGURATION espanol_unaccent (COPY = spanish);
--> statement-breakpoint
ALTER TEXT SEARCH CONFIGURATION espanol_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, spanish_stem;
