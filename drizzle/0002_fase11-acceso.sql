CREATE TABLE "accesos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "accesos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint,
	"usuario_texto" text NOT NULL,
	"resultado" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accesos_resultado_valido" CHECK ("accesos"."resultado" IN ('ingreso', 'salida', 'fallo', 'bloqueo', 'desbloqueo', 'restablecimiento', 'factor_fallo', 'cierre_forzado'))
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "areas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "areas_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cargos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"area_id" bigint NOT NULL,
	"superior_id" bigint,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cargos_area_nombre_unico" UNIQUE("area_id","nombre")
);
--> statement-breakpoint
CREATE TABLE "codigos_recuperacion" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codigos_recuperacion_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint NOT NULL,
	"hash" text NOT NULL,
	"usado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usuario_procesos" (
	"usuario_id" bigint NOT NULL,
	"proceso_id" bigint NOT NULL,
	CONSTRAINT "usuario_procesos_usuario_id_proceso_id_pk" PRIMARY KEY("usuario_id","proceso_id")
);
--> statement-breakpoint
ALTER TABLE "auditoria" DROP CONSTRAINT "auditoria_usuario_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "eventos_consulta" ADD COLUMN "usuario_id" bigint;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "ultimo_uso_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "factor_pendiente" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "ip" "inet";--> statement-breakpoint
ALTER TABLE "sesiones" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "rol" text DEFAULT 'consulta' NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "correo" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "cargo_id" bigint;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "jefe_inmediato_id" bigint;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "debe_cambiar_clave" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "intentos_fallidos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "bloqueos_consecutivos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "bloqueado_hasta" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "totp_secreto_cifrado" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "totp_activo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "ver_historial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "acepto_datos_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_superior_id_cargos_id_fk" FOREIGN KEY ("superior_id") REFERENCES "public"."cargos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codigos_recuperacion" ADD CONSTRAINT "codigos_recuperacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_procesos" ADD CONSTRAINT "usuario_procesos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_procesos" ADD CONSTRAINT "usuario_procesos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accesos_usuario_idx" ON "accesos" USING btree ("usuario_id","creado_en");--> statement-breakpoint
CREATE INDEX "accesos_creado_idx" ON "accesos" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "codigos_recuperacion_usuario_idx" ON "codigos_recuperacion" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "usuario_procesos_proceso_idx" ON "usuario_procesos" USING btree ("proceso_id");--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_consulta" ADD CONSTRAINT "eventos_consulta_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_jefe_inmediato_id_usuarios_id_fk" FOREIGN KEY ("jefe_inmediato_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_correo_idx" ON "usuarios" USING btree (lower("correo")) WHERE "usuarios"."correo" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_valido" CHECK ("usuarios"."rol" IN ('admin_sgc', 'gerencia', 'control_interno', 'lider_proceso', 'consulta'));--> statement-breakpoint
UPDATE "usuarios" SET "rol" = 'admin_sgc';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sgc_impedir_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON "auditoria" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();
--> statement-breakpoint
CREATE TRIGGER accesos_inmutable BEFORE UPDATE OR DELETE ON "accesos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();
