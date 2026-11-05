CREATE TABLE "firmas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "firmas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tramite_id" bigint NOT NULL,
	"version_id" bigint,
	"usuario_id" bigint NOT NULL,
	"firma" text NOT NULL,
	"ronda" integer NOT NULL,
	"hash_sha256" text NOT NULL,
	"nombre_firmante" text NOT NULL,
	"cargo_firmante" text,
	"metodo" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firmas_firma_valida" CHECK ("firmas"."firma" IN ('elaboro', 'reviso', 'aprobo', 'publico')),
	CONSTRAINT "firmas_metodo_valido" CHECK ("firmas"."metodo" IN ('clave', 'clave_totp'))
);
--> statement-breakpoint
CREATE TABLE "lista_verificacion_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lista_verificacion_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"texto" text NOT NULL,
	"critico" boolean DEFAULT false NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tramite_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tramite_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" bigint,
	"ronda" integer NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramite_observaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tramite_observaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tramite_id" bigint NOT NULL,
	"numero" integer NOT NULL,
	"ronda" integer NOT NULL,
	"origen" text NOT NULL,
	"texto" text NOT NULL,
	"autor_id" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"respuesta" text,
	"respondida_por" bigint,
	"respondida_en" timestamp with time zone,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"cerrada_por" bigint,
	"cerrada_en" timestamp with time zone,
	"nota_reapertura" text,
	CONSTRAINT "tramite_observaciones_numero_unico" UNIQUE("tramite_id","numero"),
	CONSTRAINT "tramite_observaciones_origen_valido" CHECK ("tramite_observaciones"."origen" IN ('revision', 'aprobacion')),
	CONSTRAINT "tramite_observaciones_estado_valido" CHECK ("tramite_observaciones"."estado" IN ('abierta', 'atendida', 'cerrada'))
);
--> statement-breakpoint
CREATE TABLE "tramite_verificaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tramite_verificaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tramite_id" bigint NOT NULL,
	"ronda" integer NOT NULL,
	"item_id" bigint NOT NULL,
	"texto_item" text NOT NULL,
	"critico" boolean NOT NULL,
	"resultado" text NOT NULL,
	"nota" text,
	CONSTRAINT "tramite_verificaciones_item_unico" UNIQUE("tramite_id","ronda","item_id"),
	CONSTRAINT "tramite_verificaciones_resultado_valido" CHECK ("tramite_verificaciones"."resultado" IN ('cumple', 'no_cumple', 'no_aplica'))
);
--> statement-breakpoint
CREATE TABLE "tramites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tramites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"numero" text NOT NULL,
	"anio" integer NOT NULL,
	"consecutivo" integer NOT NULL,
	"tipo" text NOT NULL,
	"motivo" text NOT NULL,
	"justificacion" text NOT NULL,
	"solicitante_id" bigint NOT NULL,
	"proceso_id" bigint NOT NULL,
	"subproceso_id" bigint,
	"tipo_documento_id" bigint,
	"titulo_propuesto" text,
	"documento_id" bigint,
	"version_id" bigint,
	"etapa" text NOT NULL,
	"ronda" integer DEFAULT 0 NOT NULL,
	"elaborador_id" bigint,
	"revisor_id" bigint,
	"aprobador_id" bigint,
	"vence_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"cerrado_en" timestamp with time zone,
	"motivo_cierre" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tramites_numero_unique" UNIQUE("numero"),
	CONSTRAINT "tramites_anio_consecutivo_unico" UNIQUE("anio","consecutivo"),
	CONSTRAINT "tramites_tipo_valido" CHECK ("tramites"."tipo" IN ('crear', 'modificar', 'eliminar')),
	CONSTRAINT "tramites_motivo_valido" CHECK ("tramites"."motivo" IN ('cambio_normativo', 'mejora', 'no_conformidad', 'solicitud_personal', 'revision_anual')),
	CONSTRAINT "tramites_etapa_valida" CHECK ("tramites"."etapa" IN ('visto_bueno', 'aceptacion', 'elaboracion', 'revision', 'aprobacion', 'publicacion', 'publicado', 'eliminado', 'rechazado', 'cancelado'))
);
--> statement-breakpoint
ALTER TABLE "documento_versiones" DROP CONSTRAINT "versiones_documento_numero_unico";--> statement-breakpoint
ALTER TABLE "accesos" DROP CONSTRAINT "accesos_resultado_valido";--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_rol_valido";--> statement-breakpoint
ALTER TABLE "documento_versiones" DROP CONSTRAINT "versiones_estado_valido";--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD COLUMN "origen_aprobacion" text DEFAULT 'fuera' NOT NULL;--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD COLUMN "publicado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "nivel_acceso" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_documento" ADD COLUMN "autoridad" text DEFAULT 'operativo' NOT NULL;--> statement-breakpoint
ALTER TABLE "tipos_documento" ADD COLUMN "plantilla_documento_id" bigint;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_tramite_id_tramites_id_fk" FOREIGN KEY ("tramite_id") REFERENCES "public"."tramites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_eventos" ADD CONSTRAINT "tramite_eventos_tramite_id_tramites_id_fk" FOREIGN KEY ("tramite_id") REFERENCES "public"."tramites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_eventos" ADD CONSTRAINT "tramite_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_observaciones" ADD CONSTRAINT "tramite_observaciones_tramite_id_tramites_id_fk" FOREIGN KEY ("tramite_id") REFERENCES "public"."tramites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_observaciones" ADD CONSTRAINT "tramite_observaciones_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_observaciones" ADD CONSTRAINT "tramite_observaciones_respondida_por_usuarios_id_fk" FOREIGN KEY ("respondida_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_observaciones" ADD CONSTRAINT "tramite_observaciones_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_verificaciones" ADD CONSTRAINT "tramite_verificaciones_tramite_id_tramites_id_fk" FOREIGN KEY ("tramite_id") REFERENCES "public"."tramites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramite_verificaciones" ADD CONSTRAINT "tramite_verificaciones_item_id_lista_verificacion_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."lista_verificacion_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_solicitante_id_usuarios_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_subproceso_id_subprocesos_id_fk" FOREIGN KEY ("subproceso_id") REFERENCES "public"."subprocesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_elaborador_id_usuarios_id_fk" FOREIGN KEY ("elaborador_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_revisor_id_usuarios_id_fk" FOREIGN KEY ("revisor_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tramites" ADD CONSTRAINT "tramites_aprobador_id_usuarios_id_fk" FOREIGN KEY ("aprobador_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "firmas_tramite_idx" ON "firmas" USING btree ("tramite_id");--> statement-breakpoint
CREATE INDEX "firmas_version_idx" ON "firmas" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "tramite_eventos_tramite_idx" ON "tramite_eventos" USING btree ("tramite_id","creado_en");--> statement-breakpoint
CREATE INDEX "tramites_proceso_idx" ON "tramites" USING btree ("proceso_id");--> statement-breakpoint
CREATE INDEX "tramites_etapa_idx" ON "tramites" USING btree ("etapa");--> statement-breakpoint
CREATE UNIQUE INDEX "tramites_uno_abierto_idx" ON "tramites" USING btree ("documento_id") WHERE etapa IN ('visto_bueno', 'aceptacion', 'elaboracion', 'revision', 'aprobacion', 'publicacion');--> statement-breakpoint
ALTER TABLE "tipos_documento" ADD CONSTRAINT "tipos_documento_plantilla_documento_id_documentos_id_fk" FOREIGN KEY ("plantilla_documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "archivos_un_acta_idx" ON "archivos" USING btree ("version_id","rol") WHERE rol IN ('acta_aprobacion', 'acta_eliminacion');--> statement-breakpoint
CREATE UNIQUE INDEX "versiones_documento_numero_unico_idx" ON "documento_versiones" USING btree ("documento_id","numero") WHERE estado <> 'descartado';--> statement-breakpoint
ALTER TABLE "accesos" ADD CONSTRAINT "accesos_resultado_valido" CHECK ("accesos"."resultado" IN ('ingreso', 'salida', 'fallo', 'bloqueo', 'desbloqueo', 'restablecimiento', 'factor_fallo', 'cierre_forzado', 'firma_fallo'));--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_rol_valido" CHECK ("archivos"."rol" IN ('principal', 'editable', 'anexo', 'acta_aprobacion', 'acta_eliminacion'));--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD CONSTRAINT "versiones_origen_aprobacion_valido" CHECK ("documento_versiones"."origen_aprobacion" IN ('plataforma', 'fuera'));--> statement-breakpoint
ALTER TABLE "documento_versiones" ADD CONSTRAINT "versiones_estado_valido" CHECK ("documento_versiones"."estado" IN ('borrador', 'vigente', 'obsoleto', 'anulado', 'descartado'));--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_nivel_acceso_valido" CHECK ("documentos"."nivel_acceso" IN ('general', 'restringido'));--> statement-breakpoint
ALTER TABLE "tipos_documento" ADD CONSTRAINT "tipos_documento_autoridad_valida" CHECK ("tipos_documento"."autoridad" IN ('estrategico', 'operativo'));
--> statement-breakpoint
CREATE TRIGGER firmas_inmutable BEFORE UPDATE OR DELETE ON "firmas" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER tramite_eventos_inmutable BEFORE UPDATE OR DELETE ON "tramite_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();
