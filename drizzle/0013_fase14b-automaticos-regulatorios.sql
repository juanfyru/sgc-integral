DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM reportes_externos) OR EXISTS (SELECT 1 FROM impactos_indicadores) THEN
    RAISE EXCEPTION 'Las tablas de la 14B tienen filas: la migración no las rehace';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "reporte_externo_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reporte_externo_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reporte_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" bigint NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporte_externo_eventos_tipo_valido" CHECK ("reporte_externo_eventos"."tipo" IN ('registro', 'correccion', 'soporte'))
);
--> statement-breakpoint
ALTER TABLE "medicion_eventos" DROP CONSTRAINT "medicion_eventos_tipo_valido";--> statement-breakpoint
ALTER TABLE "reportes_externos" ALTER COLUMN "desde" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reportes_externos" ALTER COLUMN "hasta" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "indicadores" ADD COLUMN "calculo" text;--> statement-breakpoint
ALTER TABLE "indicadores" ADD COLUMN "calculo_alcance" text;--> statement-breakpoint
ALTER TABLE "indicadores" ADD COLUMN "ente_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mediciones" ADD COLUMN "foto_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD COLUMN "ente" text NOT NULL;--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD COLUMN "resultado_detalle" jsonb;--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD COLUMN "corregida" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD COLUMN "escalado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reporte_externo_eventos" ADD CONSTRAINT "reporte_externo_eventos_reporte_id_reportes_externos_id_fk" FOREIGN KEY ("reporte_id") REFERENCES "public"."reportes_externos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporte_externo_eventos" ADD CONSTRAINT "reporte_externo_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reporte_externo_eventos_reporte_idx" ON "reporte_externo_eventos" USING btree ("reporte_id","creado_en");--> statement-breakpoint
CREATE INDEX "firmas_indicador_version_idx" ON "firmas" USING btree ("indicador_version_id");--> statement-breakpoint
CREATE INDEX "impactos_indicadores_indicador_idx" ON "impactos_indicadores" USING btree ("indicador_id","estado");--> statement-breakpoint
CREATE INDEX "medicion_observaciones_responde_idx" ON "medicion_observaciones" USING btree ("responde_a");--> statement-breakpoint
CREATE INDEX "mediciones_cierre_idx" ON "mediciones" USING btree ("cierre_id");--> statement-breakpoint
CREATE INDEX "reportes_externos_estado_vence_idx" ON "reportes_externos" USING btree ("estado","vence_en");--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_estado_valido" CHECK ("impactos_indicadores"."estado" IN ('pendiente', 'resuelto'));--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_resolucion_valida" CHECK ("impactos_indicadores"."resolucion" IN ('no_afecta', 'nueva_version', 'retiro'));--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_resuelto_coherente" CHECK (("impactos_indicadores"."estado" = 'resuelto') = ("impactos_indicadores"."resolucion" IS NOT NULL AND "impactos_indicadores"."resuelto_por" IS NOT NULL AND "impactos_indicadores"."resuelto_en" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_automatica_coherente" CHECK (("indicador_versiones"."origen_dato" = 'automatico') = ("indicador_versiones"."calculo" IS NOT NULL AND "indicador_versiones"."calculo_alcance" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_calculo_coherente" CHECK (("indicador_versiones"."calculo" IS NULL) = ("indicador_versiones"."calculo_alcance" IS NULL));--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_alcance_valido" CHECK ("indicador_versiones"."calculo_alcance" IN ('entidad', 'proceso', 'calidad', 'institucional', 'todos'));--> statement-breakpoint
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_calculo_coherente" CHECK (("indicadores"."calculo" IS NULL) = ("indicadores"."calculo_alcance" IS NULL));--> statement-breakpoint
ALTER TABLE "medicion_eventos" ADD CONSTRAINT "medicion_eventos_tipo_valido" CHECK ("medicion_eventos"."tipo" IN ('reporte', 'correccion', 'analisis', 'no_aplica', 'meta', 'soporte', 'cierre', 'reapertura', 'recalculo', 'historico', 'foto'));--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD CONSTRAINT "reportes_externos_estado_valido" CHECK ("reportes_externos"."estado" IN ('pendiente', 'registrada'));--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD CONSTRAINT "reportes_externos_registrada_coherente" CHECK (("reportes_externos"."estado" = 'registrada') = ("reportes_externos"."fecha_envio" IS NOT NULL AND "reportes_externos"."radicado" IS NOT NULL AND "reportes_externos"."registrada_por" IS NOT NULL AND "reportes_externos"."registrada_en" IS NOT NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "indicadores_calculo_unico" ON "indicadores" USING btree ("calculo","calculo_alcance",(CASE WHEN "calculo_alcance" = 'proceso' THEN "proceso_id" ELSE 0 END)) WHERE "estado" = 'activo' AND "calculo" IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER reporte_externo_eventos_inmutable BEFORE UPDATE OR DELETE ON "reporte_externo_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();