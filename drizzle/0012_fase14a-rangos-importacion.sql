CREATE TABLE "importacion_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "importacion_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"importacion_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" bigint NOT NULL,
	"metodo" text,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "importacion_eventos_tipo_valido" CHECK ("importacion_eventos"."tipo" IN ('importado', 'deshecho'))
);
--> statement-breakpoint
CREATE TABLE "importaciones_indicadores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "importaciones_indicadores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cargado_por" bigint NOT NULL,
	"cargado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_contexto_valido";--> statement-breakpoint
ALTER TABLE "indicador_versiones" DROP CONSTRAINT "indicador_versiones_semaforo_modo_valido";--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "rangos" jsonb;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "nivel" text;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "riesgo_asociado" text;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "importacion_id" bigint;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "aprobacion_previa_documento" text;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "aprobacion_previa_por" text;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "aprobacion_previa_fecha" date;--> statement-breakpoint
ALTER TABLE "mediciones" ADD COLUMN "cumple" boolean;--> statement-breakpoint
ALTER TABLE "subprocesos" ADD COLUMN "sigla" text;--> statement-breakpoint
ALTER TABLE "importacion_eventos" ADD CONSTRAINT "importacion_eventos_importacion_id_importaciones_indicadores_id_fk" FOREIGN KEY ("importacion_id") REFERENCES "public"."importaciones_indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacion_eventos" ADD CONSTRAINT "importacion_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones_indicadores" ADD CONSTRAINT "importaciones_indicadores_cargado_por_usuarios_id_fk" FOREIGN KEY ("cargado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "importacion_eventos_tipo_unico" ON "importacion_eventos" USING btree ("importacion_id","tipo");--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_importacion_id_importaciones_indicadores_id_fk" FOREIGN KEY ("importacion_id") REFERENCES "public"."importaciones_indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subprocesos_sigla_unica" ON "subprocesos" USING btree (lower("sigla")) WHERE "subprocesos"."sigla" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_valido" CHECK ("archivos"."contexto" IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo', 'medicion', 'reporte_externo', 'importacion_indicadores'));--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_rangos_con_modo" CHECK (("indicador_versiones"."semaforo_modo" IS DISTINCT FROM 'rangos') = ("indicador_versiones"."rangos" IS NULL));--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_importada_coherente" CHECK ("indicador_versiones"."importacion_id" IS NULL OR "indicador_versiones"."estado" <> 'aprobada' OR ("indicador_versiones"."aprobacion_previa_documento" IS NOT NULL AND "indicador_versiones"."aprobacion_previa_por" IS NOT NULL AND "indicador_versiones"."aprobacion_previa_fecha" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_semaforo_modo_valido" CHECK ("indicador_versiones"."semaforo_modo" IN ('relativo', 'fijo', 'rangos'));--> statement-breakpoint
CREATE TRIGGER importaciones_indicadores_inmutable BEFORE UPDATE OR DELETE ON "importaciones_indicadores" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER importacion_eventos_inmutable BEFORE UPDATE OR DELETE ON "importacion_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sgc_impedir_si_version_aprobada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_version text;
  lote_version bigint;
BEGIN
  IF TG_TABLE_NAME = 'indicador_versiones' THEN
    IF OLD.estado = 'aprobada' THEN
      -- Única excepción: borrar la versión de un lote que se está deshaciendo (marca de transacción con el id del lote).
      IF TG_OP = 'DELETE' AND OLD.importacion_id IS NOT NULL
         AND OLD.importacion_id::text = current_setting('sgc.deshacer_importacion', true) THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'La versión % de la ficha está aprobada y no admite cambios (%)', OLD.id, TG_OP USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT estado, importacion_id INTO estado_version, lote_version FROM indicador_versiones WHERE id = OLD.version_id FOR SHARE;
      IF estado_version = 'aprobada' THEN
        IF TG_OP = 'DELETE' AND lote_version IS NOT NULL
           AND lote_version::text = current_setting('sgc.deshacer_importacion', true) THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'La versión % de la ficha está aprobada y no admite cambios en % (%)', OLD.version_id, TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      SELECT estado INTO estado_version FROM indicador_versiones WHERE id = NEW.version_id FOR SHARE;
      IF estado_version = 'aprobada' THEN
        RAISE EXCEPTION 'La versión % de la ficha está aprobada y no admite cambios en % (%)', NEW.version_id, TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
