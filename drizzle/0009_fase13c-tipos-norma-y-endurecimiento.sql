ALTER TABLE "norma_cambios" ADD CONSTRAINT "norma_cambios_estados_validos" CHECK ("norma_cambios"."estado_anterior" IN ('vigente', 'modificada', 'derogada', 'retirada') AND "norma_cambios"."estado_nuevo" IN ('vigente', 'modificada', 'derogada', 'retirada'));--> statement-breakpoint
ALTER TABLE "revisiones_anuales" ADD CONSTRAINT "revisiones_anuales_cierre_coherente" CHECK (("revisiones_anuales"."estado" = 'cerrada') = ("revisiones_anuales"."cerrada_por" IS NOT NULL AND "revisiones_anuales"."cerrada_en" IS NOT NULL AND "revisiones_anuales"."metodo_cierre" IS NOT NULL));--> statement-breakpoint
INSERT INTO "tipos_norma" ("nombre", "orden")
SELECT v.nombre, v.orden
FROM (VALUES
	('Ley', 1),
	('Decreto', 2),
	('Resolución', 3),
	('Circular', 4),
	('Acuerdo', 5),
	('Norma técnica', 6),
	('Sentencia', 7),
	('Directiva', 8),
	('Otro', 9)
) AS v(nombre, orden)
WHERE NOT EXISTS (SELECT 1 FROM "tipos_norma");--> statement-breakpoint
CREATE OR REPLACE FUNCTION sgc_impedir_si_revision_cerrada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_revision text;
BEGIN
  IF TG_TABLE_NAME = 'revisiones_anuales' THEN
    IF OLD.estado = 'cerrada' THEN
      RAISE EXCEPTION 'La revisión anual % está cerrada y no admite cambios (%)', OLD.id, TG_OP
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- La revisión de la que sale la fila (UPDATE, DELETE) y a la que llega (INSERT, UPDATE). FOR SHARE
    -- serializa contra un cierre concurrente: el cierre espera a esta escritura, o esta ve la revisión cerrada.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT estado INTO estado_revision FROM revisiones_anuales WHERE id = OLD.revision_id FOR SHARE;
      IF estado_revision = 'cerrada' THEN
        RAISE EXCEPTION 'La revisión anual % está cerrada y no admite cambios en % (%)', OLD.revision_id, TG_TABLE_NAME, TG_OP
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      SELECT estado INTO estado_revision FROM revisiones_anuales WHERE id = NEW.revision_id FOR SHARE;
      IF estado_revision = 'cerrada' THEN
        RAISE EXCEPTION 'La revisión anual % está cerrada y no admite cambios en % (%)', NEW.revision_id, TG_TABLE_NAME, TG_OP
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER revision_anual_procesos_inmutables ON "revision_anual_procesos";--> statement-breakpoint
CREATE TRIGGER revision_anual_procesos_inmutables BEFORE INSERT OR UPDATE OR DELETE ON "revision_anual_procesos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_revision_cerrada();--> statement-breakpoint
DROP TRIGGER revision_anual_decisiones_inmutables ON "revision_anual_decisiones";--> statement-breakpoint
CREATE TRIGGER revision_anual_decisiones_inmutables BEFORE INSERT OR UPDATE OR DELETE ON "revision_anual_decisiones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_revision_cerrada();
