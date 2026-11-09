ALTER TABLE "norma_relaciones" ADD COLUMN IF NOT EXISTS "eliminada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "norma_relaciones" ADD COLUMN IF NOT EXISTS "eliminada_por" bigint;--> statement-breakpoint
ALTER TABLE "norma_relaciones" ADD COLUMN IF NOT EXISTS "eliminada_motivo" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = '"norma_relaciones"'::regclass AND conname = 'norma_relaciones_eliminada_por_usuarios_id_fk') THEN
    ALTER TABLE "norma_relaciones" ADD CONSTRAINT "norma_relaciones_eliminada_por_usuarios_id_fk" FOREIGN KEY ("eliminada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = '"norma_relaciones"'::regclass AND conname = 'norma_relaciones_baja_coherente') THEN
    ALTER TABLE "norma_relaciones" ADD CONSTRAINT "norma_relaciones_baja_coherente" CHECK (("norma_relaciones"."eliminada_en" IS NULL AND "norma_relaciones"."eliminada_por" IS NULL AND "norma_relaciones"."eliminada_motivo" IS NULL) OR ("norma_relaciones"."eliminada_en" IS NOT NULL AND "norma_relaciones"."eliminada_por" IS NOT NULL AND "norma_relaciones"."eliminada_motivo" IS NOT NULL));
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "norma_relaciones_unica_sin_baja" ON "norma_relaciones" USING btree ("norma_id","afectada_id","tipo") WHERE eliminada_en IS NULL;--> statement-breakpoint
ALTER TABLE "norma_relaciones" DROP CONSTRAINT IF EXISTS "norma_relaciones_unica";
