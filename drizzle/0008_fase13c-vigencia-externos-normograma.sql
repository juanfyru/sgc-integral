CREATE TABLE "externo_verificaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "externo_verificaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento_id" bigint NOT NULL,
	"version_id" bigint NOT NULL,
	"usuario_id" bigint NOT NULL,
	"resultado" text NOT NULL,
	"fuente_consultada" text NOT NULL,
	"nota" text,
	"revision_anual_id" bigint,
	"impacto_id" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "externo_verificaciones_resultado_valido" CHECK ("externo_verificaciones"."resultado" IN ('vigente', 'edicion_nueva', 'retirado'))
);
--> statement-breakpoint
CREATE TABLE "externos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "externos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento_id" bigint NOT NULL,
	"entidad_emisora" text NOT NULL,
	"titulo_original" text,
	"fuente_oficial" text,
	"responsable_id" bigint NOT NULL,
	"verificacion_meses" integer DEFAULT 12 NOT NULL,
	"edicion_nueva_pendiente_desde" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "externos_documento_id_unique" UNIQUE("documento_id"),
	CONSTRAINT "externos_verificacion_meses_valido" CHECK ("externos"."verificacion_meses" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "impactos_normativos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "impactos_normativos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cambio_id" bigint NOT NULL,
	"norma_id" bigint NOT NULL,
	"documento_id" bigint,
	"proceso_id" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"resolucion" text,
	"tramite_id" bigint,
	"verificacion_id" bigint,
	"nota" text,
	"resuelto_por" bigint,
	"resuelto_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impactos_normativos_estado_valido" CHECK ("impactos_normativos"."estado" IN ('pendiente', 'resuelto')),
	CONSTRAINT "impactos_normativos_resolucion_valida" CHECK ("impactos_normativos"."resolucion" IN ('solicitud', 'no_afecta', 'verificacion'))
);
--> statement-breakpoint
CREATE TABLE "norma_cambios" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "norma_cambios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"norma_id" bigint NOT NULL,
	"estado_anterior" text NOT NULL,
	"estado_nuevo" text NOT NULL,
	"fecha" date NOT NULL,
	"relacion_id" bigint,
	"usuario_id" bigint NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "norma_documentos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "norma_documentos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"norma_id" bigint NOT NULL,
	"documento_id" bigint NOT NULL,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "norma_documentos_unica" UNIQUE("norma_id","documento_id")
);
--> statement-breakpoint
CREATE TABLE "norma_procesos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "norma_procesos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"norma_id" bigint NOT NULL,
	"proceso_id" bigint NOT NULL,
	"requisito" text,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" bigint,
	"actualizado_en" timestamp with time zone,
	CONSTRAINT "norma_procesos_unica" UNIQUE("norma_id","proceso_id")
);
--> statement-breakpoint
CREATE TABLE "norma_relaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "norma_relaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"norma_id" bigint NOT NULL,
	"afectada_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"detalle" text,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "norma_relaciones_unica" UNIQUE("norma_id","afectada_id","tipo"),
	CONSTRAINT "norma_relaciones_tipo_valido" CHECK ("norma_relaciones"."tipo" IN ('modifica', 'deroga', 'reglamenta')),
	CONSTRAINT "norma_relaciones_distintas" CHECK ("norma_relaciones"."norma_id" <> "norma_relaciones"."afectada_id")
);
--> statement-breakpoint
CREATE TABLE "normas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "normas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tipo_norma_id" bigint NOT NULL,
	"numero" text NOT NULL,
	"anio" integer NOT NULL,
	"fecha_expedicion" date,
	"entidad_emisora" text NOT NULL,
	"titulo" text NOT NULL,
	"tema" text,
	"estado" text DEFAULT 'vigente' NOT NULL,
	"estado_en" date,
	"enlace_oficial" text,
	"notas" text,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('espanol_unaccent', coalesce(numero, '') || ' ' || anio::text || ' ' || coalesce(titulo, '')), 'A') || setweight(to_tsvector('espanol_unaccent', coalesce(tema, '')), 'B') || setweight(to_tsvector('espanol_unaccent', coalesce(entidad_emisora, '')), 'C')) STORED,
	CONSTRAINT "normas_estado_valido" CHECK ("normas"."estado" IN ('vigente', 'modificada', 'derogada', 'retirada'))
);
--> statement-breakpoint
CREATE TABLE "ratificaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ratificaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"firma_id" bigint NOT NULL,
	"nota" text,
	"proxima_revision" date NOT NULL,
	"revision_anual_id" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratificaciones_firma_id_unique" UNIQUE("firma_id")
);
--> statement-breakpoint
CREATE TABLE "revision_anual_decisiones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "revision_anual_decisiones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"revision_id" bigint NOT NULL,
	"documento_id" bigint NOT NULL,
	"version_id" bigint NOT NULL,
	"decision" text NOT NULL,
	"usuario_id" bigint,
	"ratificacion_id" bigint,
	"verificacion_id" bigint,
	"tramite_id" bigint,
	"insumos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revision_anual_decisiones_unica" UNIQUE("revision_id","documento_id"),
	CONSTRAINT "revision_anual_decisiones_decision_valida" CHECK ("revision_anual_decisiones"."decision" IN ('ratificar', 'actualizar', 'eliminar', 'reciente', 'en_tramite', 'sin_revisar'))
);
--> statement-breakpoint
CREATE TABLE "revision_anual_procesos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "revision_anual_procesos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"revision_id" bigint NOT NULL,
	"proceso_id" bigint NOT NULL,
	"documentos" integer NOT NULL,
	"normograma_resultado" text,
	"normograma_nota" text,
	"normograma_por" bigint,
	"normograma_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	CONSTRAINT "revision_anual_procesos_unica" UNIQUE("revision_id","proceso_id"),
	CONSTRAINT "revision_anual_procesos_normograma_valido" CHECK ("revision_anual_procesos"."normograma_resultado" IN ('sin_novedad', 'cambios'))
);
--> statement-breakpoint
CREATE TABLE "revisiones_anuales" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "revisiones_anuales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"anio" integer NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"plazo_dias" integer NOT NULL,
	"ventana_meses" integer NOT NULL,
	"abierta_por" bigint NOT NULL,
	"abierta_en" timestamp with time zone NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"prorrogas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cerrada_por" bigint,
	"cerrada_en" timestamp with time zone,
	"metodo_cierre" text,
	"informe" jsonb,
	CONSTRAINT "revisiones_anuales_anio_unique" UNIQUE("anio"),
	CONSTRAINT "revisiones_anuales_estado_valido" CHECK ("revisiones_anuales"."estado" IN ('abierta', 'cerrada')),
	CONSTRAINT "revisiones_anuales_metodo_cierre_valido" CHECK ("revisiones_anuales"."metodo_cierre" IN ('clave', 'clave_totp'))
);
--> statement-breakpoint
CREATE TABLE "tipos_norma" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tipos_norma_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lista_miembros" DROP CONSTRAINT "lista_miembros_unico";--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_contexto_valido";--> statement-breakpoint
ALTER TABLE "copias_controladas" DROP CONSTRAINT "copias_motivo_por_recoger_valido";--> statement-breakpoint
ALTER TABLE "documento_versiones" DROP CONSTRAINT "versiones_origen_aprobacion_valido";--> statement-breakpoint
ALTER TABLE "firmas" DROP CONSTRAINT "firmas_firma_valida";--> statement-breakpoint
ALTER TABLE "hallazgos" DROP CONSTRAINT "hallazgos_estado_valido";--> statement-breakpoint
ALTER TABLE "lista_miembros" DROP CONSTRAINT "lista_miembros_tipo_valido";--> statement-breakpoint
ALTER TABLE "firmas" ALTER COLUMN "tramite_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lista_miembros" ALTER COLUMN "referencia_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD COLUMN "edicion_externa" text;--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD COLUMN "fecha_edicion_externa" date;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "origen" text DEFAULT 'interno' NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "meses_revision" integer;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "proxima_revision_fijada" date;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "fijada_por" bigint;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "fijada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "fijada_nota" text;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "revision_aviso_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "revision_escalado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "corregido_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "corregido_por" bigint;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "nota_correccion" text;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "validacion" text;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "validacion_verificacion_id" bigint;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN "reaperturas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_documento" ADD COLUMN "meses_revision" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "tramites" ADD COLUMN "revision_anual_id" bigint;--> statement-breakpoint
ALTER TABLE "tramites" ADD COLUMN "impacto_id" bigint;--> statement-breakpoint
ALTER TABLE "externo_verificaciones" ADD CONSTRAINT "externo_verificaciones_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externo_verificaciones" ADD CONSTRAINT "externo_verificaciones_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externo_verificaciones" ADD CONSTRAINT "externo_verificaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externo_verificaciones" ADD CONSTRAINT "externo_verificaciones_revision_anual_id_revisiones_anuales_id_fk" FOREIGN KEY ("revision_anual_id") REFERENCES "public"."revisiones_anuales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externo_verificaciones" ADD CONSTRAINT "externo_verificaciones_impacto_id_impactos_normativos_id_fk" FOREIGN KEY ("impacto_id") REFERENCES "public"."impactos_normativos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externos" ADD CONSTRAINT "externos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "externos" ADD CONSTRAINT "externos_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_normativos" ADD CONSTRAINT "impactos_normativos_cambio_id_norma_cambios_id_fk" FOREIGN KEY ("cambio_id") REFERENCES "public"."norma_cambios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_normativos" ADD CONSTRAINT "impactos_normativos_norma_id_normas_id_fk" FOREIGN KEY ("norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_normativos" ADD CONSTRAINT "impactos_normativos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_normativos" ADD CONSTRAINT "impactos_normativos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_normativos" ADD CONSTRAINT "impactos_normativos_tramite_id_tramites_id_fk" FOREIGN KEY ("tramite_id") REFERENCES "public"."tramites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_normativos" ADD CONSTRAINT "impactos_normativos_verificacion_id_externo_verificaciones_id_fk" FOREIGN KEY ("verificacion_id") REFERENCES "public"."externo_verificaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_normativos" ADD CONSTRAINT "impactos_normativos_resuelto_por_usuarios_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_cambios" ADD CONSTRAINT "norma_cambios_norma_id_normas_id_fk" FOREIGN KEY ("norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_cambios" ADD CONSTRAINT "norma_cambios_relacion_id_norma_relaciones_id_fk" FOREIGN KEY ("relacion_id") REFERENCES "public"."norma_relaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_cambios" ADD CONSTRAINT "norma_cambios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_documentos" ADD CONSTRAINT "norma_documentos_norma_id_normas_id_fk" FOREIGN KEY ("norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_documentos" ADD CONSTRAINT "norma_documentos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_documentos" ADD CONSTRAINT "norma_documentos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_procesos" ADD CONSTRAINT "norma_procesos_norma_id_normas_id_fk" FOREIGN KEY ("norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_procesos" ADD CONSTRAINT "norma_procesos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_procesos" ADD CONSTRAINT "norma_procesos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_procesos" ADD CONSTRAINT "norma_procesos_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_relaciones" ADD CONSTRAINT "norma_relaciones_norma_id_normas_id_fk" FOREIGN KEY ("norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_relaciones" ADD CONSTRAINT "norma_relaciones_afectada_id_normas_id_fk" FOREIGN KEY ("afectada_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "norma_relaciones" ADD CONSTRAINT "norma_relaciones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normas" ADD CONSTRAINT "normas_tipo_norma_id_tipos_norma_id_fk" FOREIGN KEY ("tipo_norma_id") REFERENCES "public"."tipos_norma"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normas" ADD CONSTRAINT "normas_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratificaciones" ADD CONSTRAINT "ratificaciones_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratificaciones" ADD CONSTRAINT "ratificaciones_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratificaciones" ADD CONSTRAINT "ratificaciones_revision_anual_id_revisiones_anuales_id_fk" FOREIGN KEY ("revision_anual_id") REFERENCES "public"."revisiones_anuales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_decisiones" ADD CONSTRAINT "revision_anual_decisiones_revision_id_revisiones_anuales_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones_anuales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_decisiones" ADD CONSTRAINT "revision_anual_decisiones_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_decisiones" ADD CONSTRAINT "revision_anual_decisiones_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_decisiones" ADD CONSTRAINT "revision_anual_decisiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_decisiones" ADD CONSTRAINT "revision_anual_decisiones_ratificacion_id_ratificaciones_id_fk" FOREIGN KEY ("ratificacion_id") REFERENCES "public"."ratificaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_decisiones" ADD CONSTRAINT "revision_anual_decisiones_verificacion_id_externo_verificaciones_id_fk" FOREIGN KEY ("verificacion_id") REFERENCES "public"."externo_verificaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_decisiones" ADD CONSTRAINT "revision_anual_decisiones_tramite_id_tramites_id_fk" FOREIGN KEY ("tramite_id") REFERENCES "public"."tramites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_procesos" ADD CONSTRAINT "revision_anual_procesos_revision_id_revisiones_anuales_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones_anuales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_procesos" ADD CONSTRAINT "revision_anual_procesos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_anual_procesos" ADD CONSTRAINT "revision_anual_procesos_normograma_por_usuarios_id_fk" FOREIGN KEY ("normograma_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_anuales" ADD CONSTRAINT "revisiones_anuales_abierta_por_usuarios_id_fk" FOREIGN KEY ("abierta_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisiones_anuales" ADD CONSTRAINT "revisiones_anuales_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "externo_verificaciones_documento_idx" ON "externo_verificaciones" USING btree ("documento_id","creado_en");--> statement-breakpoint
CREATE INDEX "externos_responsable_idx" ON "externos" USING btree ("responsable_id");--> statement-breakpoint
CREATE INDEX "impactos_normativos_documento_idx" ON "impactos_normativos" USING btree ("documento_id","estado");--> statement-breakpoint
CREATE INDEX "impactos_normativos_proceso_idx" ON "impactos_normativos" USING btree ("proceso_id","estado");--> statement-breakpoint
CREATE INDEX "norma_cambios_norma_idx" ON "norma_cambios" USING btree ("norma_id","creado_en");--> statement-breakpoint
CREATE INDEX "norma_documentos_documento_idx" ON "norma_documentos" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "norma_procesos_proceso_idx" ON "norma_procesos" USING btree ("proceso_id");--> statement-breakpoint
CREATE INDEX "normas_tsv_idx" ON "normas" USING gin ("tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "normas_tipo_numero_anio_unico" ON "normas" USING btree ("tipo_norma_id",lower("numero"),"anio");--> statement-breakpoint
CREATE INDEX "ratificaciones_version_idx" ON "ratificaciones" USING btree ("version_id","creado_en");--> statement-breakpoint
CREATE INDEX "revision_anual_decisiones_tramite_idx" ON "revision_anual_decisiones" USING btree ("tramite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revisiones_una_abierta_idx" ON "revisiones_anuales" USING btree ("estado") WHERE estado = 'abierta';--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_norma_nombre_unico" ON "tipos_norma" USING btree (lower("nombre"));--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_fijada_por_usuarios_id_fk" FOREIGN KEY ("fijada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_corregido_por_usuarios_id_fk" FOREIGN KEY ("corregido_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_validacion_verificacion_id_verificaciones_id_fk" FOREIGN KEY ("validacion_verificacion_id") REFERENCES "public"."verificaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_revision_anual_id_revisiones_anuales_id_fk" FOREIGN KEY ("revision_anual_id") REFERENCES "public"."revisiones_anuales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_impacto_id_impactos_normativos_id_fk" FOREIGN KEY ("impacto_id") REFERENCES "public"."impactos_normativos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lista_miembros_unico_idx" ON "lista_miembros" USING btree ("lista_id","tipo","referencia_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX "tramites_revision_anual_idx" ON "tramites" USING btree ("revision_anual_id");--> statement-breakpoint
CREATE INDEX "tramites_impacto_idx" ON "tramites" USING btree ("impacto_id");--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_valido" CHECK ("archivos"."contexto" IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo'));--> statement-breakpoint
ALTER TABLE "copias_controladas" ADD CONSTRAINT "copias_motivo_por_recoger_valido" CHECK ("copias_controladas"."motivo_por_recoger" IN ('nueva_version', 'eliminado', 'carga_deshecha', 'retirado'));--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD CONSTRAINT "versiones_origen_aprobacion_valido" CHECK ("documento_versiones"."origen_aprobacion" IN ('plataforma', 'fuera', 'externo'));--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_origen_valido" CHECK ("documentos"."origen" IN ('interno', 'externo'));--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_meses_revision_valido" CHECK ("documentos"."meses_revision" BETWEEN 1 AND 120);--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_fijada_coherente" CHECK (("documentos"."proxima_revision_fijada" IS NULL) = ("documentos"."fijada_por" IS NULL));--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_tramite_coherente" CHECK ("firmas"."tramite_id" IS NOT NULL OR "firmas"."firma" IN ('ratifico', 'adopto'));--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_firma_valida" CHECK ("firmas"."firma" IN ('elaboro', 'reviso', 'aprobo', 'publico', 'ratifico', 'adopto'));--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_validacion_valida" CHECK ("hallazgos"."validacion" IN ('admin', 'verificacion'));--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_estado_valido" CHECK ("hallazgos"."estado" IN ('abierto', 'por_validar', 'cerrado'));--> statement-breakpoint
ALTER TABLE "lista_miembros" ADD CONSTRAINT "lista_miembros_referencia_coherente" CHECK (("lista_miembros"."tipo" = 'todos') = ("lista_miembros"."referencia_id" IS NULL));--> statement-breakpoint
ALTER TABLE "lista_miembros" ADD CONSTRAINT "lista_miembros_tipo_valido" CHECK ("lista_miembros"."tipo" IN ('area', 'cargo', 'proceso', 'usuario', 'todos'));--> statement-breakpoint
ALTER TABLE "tipos_documento" ADD CONSTRAINT "tipos_documento_meses_revision_valido" CHECK ("tipos_documento"."meses_revision" BETWEEN 1 AND 120);--> statement-breakpoint
INSERT INTO "tipos_documento" ("nombre", "sigla", "autoridad", "es_diligenciable", "orden")
SELECT 'Documento externo', 'DE', 'operativo', false, coalesce(max("orden"), 0) + 1 FROM "tipos_documento"
WHERE NOT EXISTS (SELECT 1 FROM "tipos_documento" WHERE "sigla" = 'DE' OR "nombre" = 'Documento externo');--> statement-breakpoint
CREATE FUNCTION sgc_impedir_si_revision_cerrada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_revision text;
BEGIN
  IF TG_TABLE_NAME = 'revisiones_anuales' THEN
    estado_revision := OLD.estado;
  ELSE
    SELECT estado INTO estado_revision FROM revisiones_anuales WHERE id = OLD.revision_id;
  END IF;
  IF estado_revision = 'cerrada' THEN
    RAISE EXCEPTION 'La revisión anual de la fila % de % está cerrada y no admite cambios (%)', OLD.id, TG_TABLE_NAME, TG_OP
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER ratificaciones_inmutable BEFORE UPDATE OR DELETE ON "ratificaciones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER externo_verificaciones_inmutable BEFORE UPDATE OR DELETE ON "externo_verificaciones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER norma_cambios_inmutable BEFORE UPDATE OR DELETE ON "norma_cambios" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER revisiones_anuales_cerrada_inmutable BEFORE UPDATE OR DELETE ON "revisiones_anuales" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_revision_cerrada();--> statement-breakpoint
CREATE TRIGGER revision_anual_procesos_inmutables BEFORE UPDATE OR DELETE ON "revision_anual_procesos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_revision_cerrada();--> statement-breakpoint
CREATE TRIGGER revision_anual_decisiones_inmutables BEFORE UPDATE OR DELETE ON "revision_anual_decisiones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_revision_cerrada();
