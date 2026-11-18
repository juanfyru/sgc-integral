CREATE TABLE "mejora_actividad_tramites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_actividad_tramites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"actividad_id" bigint NOT NULL,
	"tramite_id" bigint NOT NULL,
	"origen" text NOT NULL,
	"enlazado_por" bigint NOT NULL,
	"enlazado_en" timestamp with time zone NOT NULL,
	"avisado_en" timestamp with time zone,
	CONSTRAINT "mejora_actividad_tramites_tramite_id_unique" UNIQUE("tramite_id"),
	CONSTRAINT "mejora_actividad_tramites_origen_valido" CHECK ("mejora_actividad_tramites"."origen" IN ('pedido', 'enlazado'))
);
--> statement-breakpoint
CREATE TABLE "mejora_clasificacion" (
	"hallazgo_id" bigint PRIMARY KEY NOT NULL,
	"plan_id" bigint,
	"objetivo_id" bigint,
	"actualizado_por" bigint NOT NULL,
	"actualizado_en" timestamp with time zone NOT NULL,
	CONSTRAINT "mejora_clasificacion_no_vacia" CHECK ("mejora_clasificacion"."plan_id" IS NOT NULL OR "mejora_clasificacion"."objetivo_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "mejora_marcas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_marcas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"medicion_id" bigint NOT NULL,
	"indicador_id" bigint NOT NULL,
	"salida" text NOT NULL,
	"hallazgo_id" bigint,
	"justificacion" text,
	"decidido_por" bigint NOT NULL,
	"decidido_en" timestamp with time zone NOT NULL,
	CONSTRAINT "mejora_marcas_salida_valida" CHECK ("mejora_marcas"."salida" IN ('hallazgo', 'ocurrencia', 'no_requiere')),
	CONSTRAINT "mejora_marcas_coherente" CHECK (("mejora_marcas"."salida" = 'no_requiere' AND "mejora_marcas"."justificacion" IS NOT NULL AND "mejora_marcas"."hallazgo_id" IS NULL) OR ("mejora_marcas"."salida" <> 'no_requiere' AND "mejora_marcas"."justificacion" IS NULL AND "mejora_marcas"."hallazgo_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mejora_plan_consecutivos" (
	"vigencia" integer PRIMARY KEY NOT NULL,
	"ultimo" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mejora_plan_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_plan_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"plan_id" bigint NOT NULL,
	"hallazgo_id" bigint,
	"tipo" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usuario_id" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mejora_plan_eventos_tipo_valido" CHECK ("mejora_plan_eventos"."tipo" IN ('creado', 'editado', 'anulado', 'entra', 'sale', 'archivo', 'archivo_quitado', 'respuesta'))
);
--> statement-breakpoint
CREATE TABLE "mejora_plan_respuesta_hallazgos" (
	"respuesta_id" bigint NOT NULL,
	"hallazgo_id" bigint NOT NULL,
	CONSTRAINT "mejora_plan_respuesta_hallazgos_respuesta_id_hallazgo_id_pk" PRIMARY KEY("respuesta_id","hallazgo_id")
);
--> statement-breakpoint
CREATE TABLE "mejora_plan_respuestas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_plan_respuestas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"plan_id" bigint NOT NULL,
	"enviada_en" date NOT NULL,
	"archivo_id" bigint NOT NULL,
	"registrada_por" bigint NOT NULL,
	"registrada_en" timestamp with time zone NOT NULL,
	CONSTRAINT "mejora_plan_respuestas_archivo_id_unique" UNIQUE("archivo_id")
);
--> statement-breakpoint
CREATE TABLE "mejora_planes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_planes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"codigo" text NOT NULL,
	"vigencia" integer NOT NULL,
	"consecutivo" integer NOT NULL,
	"nombre" text NOT NULL,
	"origen" text NOT NULL,
	"fecha_evento" date NOT NULL,
	"objetivo_texto" text,
	"objetivo_id" bigint,
	"fecha_limite_ente" date,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"anulado_en" timestamp with time zone,
	"anulado_por" bigint,
	"anulado_motivo" text,
	CONSTRAINT "mejora_planes_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "mejora_planes_vigencia_consecutivo_unico" UNIQUE("vigencia","consecutivo"),
	CONSTRAINT "mejora_planes_origen_valido" CHECK ("mejora_planes"."origen" IN ('auditoria_interna', 'control_interno', 'revision_direccion', 'pamec', 'autoevaluacion', 'indicador', 'pqrsf', 'evento_adverso', 'riesgo_materializado', 'satisfaccion_usuario', 'control_documental', 'otro', 'auditoria_externa', 'ente_control'))
);
--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_contexto_valido";--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD COLUMN "verificacion_hallazgo_id" bigint;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD COLUMN "impacto_id" bigint;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD COLUMN "impacto_indicador_id" bigint;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD COLUMN "documento_id" bigint;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD COLUMN "indicador_id" bigint;--> statement-breakpoint
ALTER TABLE "mejora_actividad_tramites" ADD CONSTRAINT "mejora_actividad_tramites_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividad_tramites" ADD CONSTRAINT "mejora_actividad_tramites_actividad_id_mejora_actividades_id_fk" FOREIGN KEY ("actividad_id") REFERENCES "public"."mejora_actividades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividad_tramites" ADD CONSTRAINT "mejora_actividad_tramites_tramite_id_tramites_id_fk" FOREIGN KEY ("tramite_id") REFERENCES "public"."tramites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividad_tramites" ADD CONSTRAINT "mejora_actividad_tramites_enlazado_por_usuarios_id_fk" FOREIGN KEY ("enlazado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividad_tramites" ADD CONSTRAINT "mejora_actividad_tramites_actividad_coherente" FOREIGN KEY ("actividad_id","hallazgo_id") REFERENCES "public"."mejora_actividades"("id","hallazgo_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_clasificacion" ADD CONSTRAINT "mejora_clasificacion_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_clasificacion" ADD CONSTRAINT "mejora_clasificacion_plan_id_mejora_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."mejora_planes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_clasificacion" ADD CONSTRAINT "mejora_clasificacion_objetivo_id_objetivos_id_fk" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_clasificacion" ADD CONSTRAINT "mejora_clasificacion_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_marcas" ADD CONSTRAINT "mejora_marcas_medicion_id_mediciones_id_fk" FOREIGN KEY ("medicion_id") REFERENCES "public"."mediciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_marcas" ADD CONSTRAINT "mejora_marcas_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_marcas" ADD CONSTRAINT "mejora_marcas_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_marcas" ADD CONSTRAINT "mejora_marcas_decidido_por_usuarios_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_eventos" ADD CONSTRAINT "mejora_plan_eventos_plan_id_mejora_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."mejora_planes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_eventos" ADD CONSTRAINT "mejora_plan_eventos_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_eventos" ADD CONSTRAINT "mejora_plan_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_respuesta_hallazgos" ADD CONSTRAINT "mejora_plan_respuesta_hallazgos_respuesta_id_mejora_plan_respuestas_id_fk" FOREIGN KEY ("respuesta_id") REFERENCES "public"."mejora_plan_respuestas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_respuesta_hallazgos" ADD CONSTRAINT "mejora_plan_respuesta_hallazgos_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_respuestas" ADD CONSTRAINT "mejora_plan_respuestas_plan_id_mejora_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."mejora_planes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_respuestas" ADD CONSTRAINT "mejora_plan_respuestas_archivo_id_archivos_id_fk" FOREIGN KEY ("archivo_id") REFERENCES "public"."archivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_plan_respuestas" ADD CONSTRAINT "mejora_plan_respuestas_registrada_por_usuarios_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_planes" ADD CONSTRAINT "mejora_planes_objetivo_id_objetivos_id_fk" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_planes" ADD CONSTRAINT "mejora_planes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_planes" ADD CONSTRAINT "mejora_planes_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mejora_actividad_tramites_hallazgo_idx" ON "mejora_actividad_tramites" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_actividad_tramites_actividad_idx" ON "mejora_actividad_tramites" USING btree ("actividad_id");--> statement-breakpoint
CREATE INDEX "mejora_clasificacion_plan_idx" ON "mejora_clasificacion" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "mejora_clasificacion_objetivo_idx" ON "mejora_clasificacion" USING btree ("objetivo_id");--> statement-breakpoint
CREATE INDEX "mejora_marcas_medicion_idx" ON "mejora_marcas" USING btree ("medicion_id");--> statement-breakpoint
CREATE INDEX "mejora_marcas_indicador_idx" ON "mejora_marcas" USING btree ("indicador_id");--> statement-breakpoint
CREATE INDEX "mejora_marcas_hallazgo_idx" ON "mejora_marcas" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_plan_eventos_plan_idx" ON "mejora_plan_eventos" USING btree ("plan_id","creado_en");--> statement-breakpoint
CREATE INDEX "mejora_plan_eventos_hallazgo_idx" ON "mejora_plan_eventos" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_plan_respuesta_hallazgos_hallazgo_idx" ON "mejora_plan_respuesta_hallazgos" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_plan_respuestas_plan_idx" ON "mejora_plan_respuestas" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "mejora_planes_objetivo_idx" ON "mejora_planes" USING btree ("objetivo_id");--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_verificacion_hallazgo_id_hallazgos_id_fk" FOREIGN KEY ("verificacion_hallazgo_id") REFERENCES "public"."hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_impacto_id_impactos_normativos_id_fk" FOREIGN KEY ("impacto_id") REFERENCES "public"."impactos_normativos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_impacto_indicador_id_impactos_indicadores_id_fk" FOREIGN KEY ("impacto_indicador_id") REFERENCES "public"."impactos_indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD CONSTRAINT "mejora_reportes_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD CONSTRAINT "mejora_reportes_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_verificacion_hallazgo_idx" ON "mejora_hallazgos" USING btree ("verificacion_hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_impacto_idx" ON "mejora_hallazgos" USING btree ("impacto_id");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_impacto_indicador_idx" ON "mejora_hallazgos" USING btree ("impacto_indicador_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mejora_hallazgos_verificacion_hallazgo_unico" ON "mejora_hallazgos" USING btree ("verificacion_hallazgo_id") WHERE estado NOT IN ('rechazado', 'anulado');--> statement-breakpoint
CREATE UNIQUE INDEX "mejora_hallazgos_impacto_unico" ON "mejora_hallazgos" USING btree ("impacto_id") WHERE estado NOT IN ('rechazado', 'anulado');--> statement-breakpoint
CREATE UNIQUE INDEX "mejora_hallazgos_impacto_indicador_unico" ON "mejora_hallazgos" USING btree ("impacto_indicador_id") WHERE estado NOT IN ('rechazado', 'anulado');--> statement-breakpoint
CREATE INDEX "mejora_reportes_documento_idx" ON "mejora_reportes" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "mejora_reportes_indicador_idx" ON "mejora_reportes" USING btree ("indicador_id");--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_valido" CHECK ("archivos"."contexto" IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo', 'medicion', 'reporte_externo', 'importacion_indicadores', 'dato_compartido', 'mejora_hallazgo', 'mejora_ronda', 'mejora_actividad', 'mejora_reporte', 'mejora_plan'));--> statement-breakpoint
CREATE TRIGGER mejora_plan_eventos_inmutable BEFORE UPDATE OR DELETE ON "mejora_plan_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER mejora_marcas_inmutable BEFORE UPDATE OR DELETE ON "mejora_marcas" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER mejora_actividad_tramites_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_actividad_tramites" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
INSERT INTO "configuracion" ("clave", "valor") VALUES
	('mej_formato_plan_documento_id', ''),
	('mej_sugerir_hallazgos', '3'),
	('mej_sugerir_meses', '12')
ON CONFLICT ("clave") DO NOTHING;
