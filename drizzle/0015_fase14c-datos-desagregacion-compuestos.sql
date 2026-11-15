DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM variables_compartidas) OR EXISTS (SELECT 1 FROM variable_responsables)
    OR EXISTS (SELECT 1 FROM variable_valores) OR EXISTS (SELECT 1 FROM dimensiones)
    OR EXISTS (SELECT 1 FROM dimension_categorias) THEN
    RAISE EXCEPTION 'Las tablas de la 14C tienen filas: la migración no las rehace';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "variable_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variable_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"valor_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" bigint,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variable_eventos_tipo_valido" CHECK ("variable_eventos"."tipo" IN ('reporte', 'correccion', 'soporte', 'cierre', 'reapertura'))
);
--> statement-breakpoint
ALTER TABLE "dimensiones" DROP CONSTRAINT "dimensiones_nombre_unique";--> statement-breakpoint
ALTER TABLE "variables_compartidas" DROP CONSTRAINT "variables_compartidas_unica";--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_contexto_valido";--> statement-breakpoint
ALTER TABLE "medicion_eventos" DROP CONSTRAINT "medicion_eventos_tipo_valido";--> statement-breakpoint
ALTER TABLE "variable_valores" ALTER COLUMN "vence_en" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ALTER COLUMN "periodicidad" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ALTER COLUMN "consolidacion" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ALTER COLUMN "plazo_reporte_dias" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dimension_categorias" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "dimension_categorias" ADD COLUMN "desactivada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dimensiones" ADD COLUMN "orden" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dimensiones" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "indicador_variables" ADD COLUMN "dato_periodicidad" text;--> statement-breakpoint
ALTER TABLE "indicador_variables" ADD COLUMN "origen_codigo" text;--> statement-breakpoint
ALTER TABLE "indicador_variables" ADD COLUMN "origen_nombre" text;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD COLUMN "dimension_nombre" text;--> statement-breakpoint
ALTER TABLE "medicion_valores" ADD COLUMN "valor_exacto" text;--> statement-breakpoint
ALTER TABLE "mediciones" ADD COLUMN "categorias" jsonb;--> statement-breakpoint
ALTER TABLE "mediciones" ADD COLUMN "categorias_en_critico" integer;--> statement-breakpoint
ALTER TABLE "variable_responsables" ADD COLUMN "designado_por" bigint;--> statement-breakpoint
ALTER TABLE "variable_responsables" ADD COLUMN "designado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "desde" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "hasta" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "por_categoria" jsonb;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "categorias" jsonb;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "corregido" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "reabierto_por" bigint;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "reabierto_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "reapertura_justificacion" text;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "escalado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD COLUMN "creado_por" bigint;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "variable_eventos" ADD CONSTRAINT "variable_eventos_valor_id_variable_valores_id_fk" FOREIGN KEY ("valor_id") REFERENCES "public"."variable_valores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_eventos" ADD CONSTRAINT "variable_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "variable_eventos_valor_idx" ON "variable_eventos" USING btree ("valor_id","creado_en");--> statement-breakpoint
ALTER TABLE "variable_responsables" ADD CONSTRAINT "variable_responsables_designado_por_usuarios_id_fk" FOREIGN KEY ("designado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD CONSTRAINT "variable_valores_reabierto_por_usuarios_id_fk" FOREIGN KEY ("reabierto_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD CONSTRAINT "variables_compartidas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dimension_categorias_nombre_idx" ON "dimension_categorias" USING btree ("dimension_id",lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "dimensiones_nombre_idx" ON "dimensiones" USING btree (lower("nombre"));--> statement-breakpoint
CREATE INDEX "indicador_variables_dato_idx" ON "indicador_variables" USING btree ("variable_compartida_id");--> statement-breakpoint
CREATE INDEX "indicador_variables_origen_idx" ON "indicador_variables" USING btree ("indicador_origen_id");--> statement-breakpoint
CREATE INDEX "medicion_valores_categoria_idx" ON "medicion_valores" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "variable_responsables_usuario_idx" ON "variable_responsables" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "variable_valores_estado_vence_idx" ON "variable_valores" USING btree ("estado","vence_en");--> statement-breakpoint
CREATE UNIQUE INDEX "variables_compartidas_nombre_idx" ON "variables_compartidas" USING btree ("proceso_id",lower("nombre"));--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_valido" CHECK ("archivos"."contexto" IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo', 'medicion', 'reporte_externo', 'importacion_indicadores', 'dato_compartido'));--> statement-breakpoint
ALTER TABLE "indicador_variables" ADD CONSTRAINT "indicador_variables_origen_coherente" CHECK (("indicador_variables"."origen" = 'compartida') = ("indicador_variables"."variable_compartida_id" IS NOT NULL) AND ("indicador_variables"."origen" = 'indicador') = ("indicador_variables"."indicador_origen_id" IS NOT NULL) AND ("indicador_variables"."origen" = 'indicador') = ("indicador_variables"."toma" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_dimension_manual" CHECK ("indicador_versiones"."dimension_id" IS NULL OR "indicador_versiones"."origen_dato" = 'manual');--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_dimension_coherente" CHECK (("indicador_versiones"."dimension_id" IS NULL) = ("indicador_versiones"."dimension_nombre" IS NULL));--> statement-breakpoint
ALTER TABLE "medicion_eventos" ADD CONSTRAINT "medicion_eventos_tipo_valido" CHECK ("medicion_eventos"."tipo" IN ('reporte', 'correccion', 'analisis', 'no_aplica', 'meta', 'soporte', 'cierre', 'reapertura', 'recalculo', 'historico', 'foto', 'propagacion', 'categorias'));--> statement-breakpoint
ALTER TABLE "variable_valores" ADD CONSTRAINT "variable_valores_estado_valido" CHECK ("variable_valores"."estado" IN ('pendiente', 'reportado', 'cerrado'));--> statement-breakpoint
ALTER TABLE "variable_valores" ADD CONSTRAINT "variable_valores_reportado_coherente" CHECK ("variable_valores"."estado" <> 'reportado' OR ("variable_valores"."valor" IS NOT NULL AND "variable_valores"."reportado_en" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD CONSTRAINT "variables_compartidas_periodicidad_valida" CHECK ("variables_compartidas"."periodicidad" IN ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual'));--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD CONSTRAINT "variables_compartidas_consolidacion_valida" CHECK ("variables_compartidas"."consolidacion" IN ('suma', 'ultimo', 'promedio'));--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD CONSTRAINT "variables_compartidas_plazo_valido" CHECK ("variables_compartidas"."plazo_reporte_dias" BETWEEN 0 AND 90);--> statement-breakpoint
CREATE TRIGGER variable_eventos_inmutable BEFORE UPDATE OR DELETE ON "variable_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();