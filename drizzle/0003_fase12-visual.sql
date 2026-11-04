CREATE TABLE "notificaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notificaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"cuerpo" text,
	"enlace" text,
	"entidad" text,
	"entidad_id" bigint,
	"leida_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "tema" text DEFAULT 'claro' NOT NULL;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notificaciones_usuario_idx" ON "notificaciones" USING btree ("usuario_id","leida_en","creado_en" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_usuario_lower_unico" ON "usuarios" USING btree (lower("usuario"));--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tema_valido" CHECK ("usuarios"."tema" IN ('claro', 'oscuro', 'sistema'));