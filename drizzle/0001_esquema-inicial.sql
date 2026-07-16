CREATE TABLE "archivos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "archivos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"rol" text DEFAULT 'principal' NOT NULL,
	"ruta" text NOT NULL,
	"nombre_original" text NOT NULL,
	"extension" text NOT NULL,
	"mime" text NOT NULL,
	"tamano_bytes" bigint NOT NULL,
	"hash_sha256" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archivos_ruta_unique" UNIQUE("ruta"),
	CONSTRAINT "archivos_rol_valido" CHECK ("archivos"."rol" IN ('principal', 'editable', 'anexo')),
	CONSTRAINT "archivos_tamano_positivo" CHECK ("archivos"."tamano_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" bigint,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "busquedas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "busquedas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"termino" text NOT NULL,
	"cantidad_resultados" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documento_proceso" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documento_proceso_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento_id" bigint NOT NULL,
	"proceso_id" bigint,
	"subproceso_id" bigint,
	"es_principal" boolean DEFAULT false NOT NULL,
	CONSTRAINT "documento_proceso_asociacion_unica" UNIQUE NULLS NOT DISTINCT("documento_id","proceso_id","subproceso_id"),
	CONSTRAINT "documento_proceso_un_solo_destino" CHECK (num_nonnulls("documento_proceso"."proceso_id", "documento_proceso"."subproceso_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "documento_relaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documento_relaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento_id" bigint NOT NULL,
	"relacionado_id" bigint NOT NULL,
	CONSTRAINT "documento_relaciones_unica" UNIQUE("documento_id","relacionado_id"),
	CONSTRAINT "documento_relaciones_sin_autorelacion" CHECK ("documento_relaciones"."documento_id" <> "documento_relaciones"."relacionado_id")
);
--> statement-breakpoint
CREATE TABLE "documento_versiones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documento_versiones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"documento_id" bigint NOT NULL,
	"numero" integer NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"fecha_elaboracion" date,
	"fecha_revision" date,
	"fecha_aprobacion" date,
	"elaboro" text,
	"reviso" text,
	"aprobo" text,
	"resumen_cambios" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "versiones_documento_numero_unico" UNIQUE("documento_id","numero"),
	CONSTRAINT "versiones_estado_valido" CHECK ("documento_versiones"."estado" IN ('borrador', 'vigente', 'obsoleto', 'anulado')),
	CONSTRAINT "versiones_numero_positivo" CHECK ("documento_versiones"."numero" > 0),
	CONSTRAINT "versiones_vigente_con_aprobacion" CHECK ("documento_versiones"."estado" <> 'vigente' OR ("documento_versiones"."aprobo" IS NOT NULL AND "documento_versiones"."fecha_aprobacion" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documentos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"codigo" text NOT NULL,
	"titulo" text NOT NULL,
	"tipo_id" bigint NOT NULL,
	"descripcion" text,
	"palabras_clave" text,
	"tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('espanol_unaccent', coalesce(codigo, '') || ' ' || coalesce(titulo, '')), 'A') || setweight(to_tsvector('espanol_unaccent', coalesce(palabras_clave, '')), 'B') || setweight(to_tsvector('espanol_unaccent', coalesce(descripcion, '')), 'C')) STORED,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "elementos_perifericos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "elementos_perifericos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"icono" text,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "elementos_tipo_valido" CHECK ("elementos_perifericos"."tipo" IN ('entrada', 'salida', 'convencion'))
);
--> statement-breakpoint
CREATE TABLE "eventos_consulta" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "eventos_consulta_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tipo" text NOT NULL,
	"documento_id" bigint NOT NULL,
	"version_id" bigint,
	"ip" "inet",
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_tipo_valido" CHECK ("eventos_consulta"."tipo" IN ('vista', 'descarga'))
);
--> statement-breakpoint
CREATE TABLE "macroprocesos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "macroprocesos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"letra" text NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"banda" text NOT NULL,
	"color" text NOT NULL,
	"icono" text NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "macroprocesos_letra_unique" UNIQUE("letra"),
	CONSTRAINT "macroprocesos_slug_unique" UNIQUE("slug"),
	CONSTRAINT "macroprocesos_banda_valida" CHECK ("macroprocesos"."banda" IN ('estrategicos', 'misionales', 'apoyo', 'evaluacion'))
);
--> statement-breakpoint
CREATE TABLE "procesos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "procesos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"macroproceso_id" bigint NOT NULL,
	"nombre" text NOT NULL,
	"sigla" text NOT NULL,
	"slug" text NOT NULL,
	"descripcion" text,
	"icono" text NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "procesos_sigla_unique" UNIQUE("sigla"),
	CONSTRAINT "procesos_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" bigint NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subprocesos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subprocesos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"proceso_id" bigint NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subprocesos_proceso_slug_unico" UNIQUE("proceso_id","slug")
);
--> statement-breakpoint
CREATE TABLE "tipos_documento" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tipos_documento_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"sigla" text NOT NULL,
	"es_diligenciable" boolean DEFAULT false NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tipos_documento_nombre_unique" UNIQUE("nombre"),
	CONSTRAINT "tipos_documento_sigla_unique" UNIQUE("sigla")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usuarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario" text NOT NULL,
	"nombre" text NOT NULL,
	"hash_clave" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario")
);
--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_proceso" ADD CONSTRAINT "documento_proceso_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_proceso" ADD CONSTRAINT "documento_proceso_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_proceso" ADD CONSTRAINT "documento_proceso_subproceso_id_subprocesos_id_fk" FOREIGN KEY ("subproceso_id") REFERENCES "public"."subprocesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_relaciones" ADD CONSTRAINT "documento_relaciones_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_relaciones" ADD CONSTRAINT "documento_relaciones_relacionado_id_documentos_id_fk" FOREIGN KEY ("relacionado_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD CONSTRAINT "documento_versiones_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tipo_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_documento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_consulta" ADD CONSTRAINT "eventos_consulta_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_consulta" ADD CONSTRAINT "eventos_consulta_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procesos" ADD CONSTRAINT "procesos_macroproceso_id_macroprocesos_id_fk" FOREIGN KEY ("macroproceso_id") REFERENCES "public"."macroprocesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subprocesos" ADD CONSTRAINT "subprocesos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "archivos_un_principal_idx" ON "archivos" USING btree ("version_id") WHERE rol = 'principal';--> statement-breakpoint
CREATE INDEX "archivos_version_idx" ON "archivos" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "auditoria_creado_idx" ON "auditoria" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "busquedas_creado_idx" ON "busquedas" USING btree ("creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "documento_proceso_un_principal_idx" ON "documento_proceso" USING btree ("documento_id") WHERE es_principal;--> statement-breakpoint
CREATE INDEX "documento_proceso_proceso_idx" ON "documento_proceso" USING btree ("proceso_id");--> statement-breakpoint
CREATE INDEX "documento_proceso_subproceso_idx" ON "documento_proceso" USING btree ("subproceso_id");--> statement-breakpoint
CREATE INDEX "documento_relaciones_relacionado_idx" ON "documento_relaciones" USING btree ("relacionado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "versiones_una_vigente_idx" ON "documento_versiones" USING btree ("documento_id") WHERE estado = 'vigente';--> statement-breakpoint
CREATE INDEX "versiones_documento_idx" ON "documento_versiones" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "documentos_tsv_idx" ON "documentos" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "documentos_codigo_trgm_idx" ON "documentos" USING gin ("codigo" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documentos_titulo_trgm_idx" ON "documentos" USING gin ("titulo" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documentos_tipo_idx" ON "documentos" USING btree ("tipo_id");--> statement-breakpoint
CREATE INDEX "eventos_documento_idx" ON "eventos_consulta" USING btree ("documento_id","creado_en");--> statement-breakpoint
CREATE INDEX "eventos_creado_idx" ON "eventos_consulta" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "procesos_macroproceso_idx" ON "procesos" USING btree ("macroproceso_id");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sesiones_expira_idx" ON "sesiones" USING btree ("expira_en");--> statement-breakpoint
CREATE INDEX "subprocesos_proceso_idx" ON "subprocesos" USING btree ("proceso_id");