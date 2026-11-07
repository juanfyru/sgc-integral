CREATE TABLE "acuse_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "acuse_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"acuse_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" bigint,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acuse_eventos_tipo_valido" CHECK ("acuse_eventos"."tipo" IN ('creado', 'confirmado', 'superado', 'retirado', 'revertido'))
);
--> statement-breakpoint
CREATE TABLE "acuses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "acuses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"usuario_id" bigint NOT NULL,
	"origen" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"modo" text,
	"jornada_id" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmado_en" timestamp with time zone,
	"vence_en" timestamp with time zone NOT NULL,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"cerrado_en" timestamp with time zone,
	"motivo_cierre" text,
	CONSTRAINT "acuses_origen_valido" CHECK ("acuses"."origen" IN ('publicacion', 'solicitud_manual', 'ingreso_proceso')),
	CONSTRAINT "acuses_estado_valido" CHECK ("acuses"."estado" IN ('pendiente', 'confirmado', 'superado', 'retirado')),
	CONSTRAINT "acuses_modo_valido" CHECK ("acuses"."modo" IN ('individual', 'asistencia', 'firma'))
);
--> statement-breakpoint
CREATE TABLE "copia_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "copia_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"copia_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" bigint,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copia_eventos_tipo_valido" CHECK ("copia_eventos"."tipo" IN ('emitida', 'impresa', 'consultada', 'reimpresa', 'recibida', 'por_recoger', 'recogida', 'anulada'))
);
--> statement-breakpoint
CREATE TABLE "copias_controladas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "copias_controladas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"numero" integer NOT NULL,
	"punto_uso_id" bigint NOT NULL,
	"responsable_id" bigint NOT NULL,
	"responsable_nombre" text NOT NULL,
	"responsable_cargo" text,
	"emitida_por" bigint NOT NULL,
	"hash_principal" text NOT NULL,
	"nota" text,
	"estado" text DEFAULT 'emitida' NOT NULL,
	"emitida_en" timestamp with time zone NOT NULL,
	"recibida_en" timestamp with time zone,
	"por_recoger_en" timestamp with time zone,
	"recogida_en" timestamp with time zone,
	"anulada_en" timestamp with time zone,
	"motivo_por_recoger" text,
	"destino_recogida" text,
	"motivo_anulacion" text,
	"reemplaza_copia_id" bigint,
	"ultima_apertura_en" timestamp with time zone,
	"vence_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	CONSTRAINT "copias_version_numero_unico" UNIQUE("version_id","numero"),
	CONSTRAINT "copias_estado_valido" CHECK ("copias_controladas"."estado" IN ('emitida', 'recibida', 'por_recoger', 'recogida', 'anulada')),
	CONSTRAINT "copias_motivo_por_recoger_valido" CHECK ("copias_controladas"."motivo_por_recoger" IN ('nueva_version', 'eliminado', 'carga_deshecha')),
	CONSTRAINT "copias_destino_recogida_valido" CHECK ("copias_controladas"."destino_recogida" IN ('devuelta', 'destruida', 'no_encontrada', 'retirada_en_verificacion'))
);
--> statement-breakpoint
CREATE TABLE "documento_listas" (
	"documento_id" bigint NOT NULL,
	"lista_id" bigint NOT NULL,
	CONSTRAINT "documento_listas_documento_id_lista_id_pk" PRIMARY KEY("documento_id","lista_id")
);
--> statement-breakpoint
CREATE TABLE "hallazgos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hallazgos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"punto_uso_id" bigint NOT NULL,
	"origen" text NOT NULL,
	"verificacion_id" bigint,
	"item_id" bigint,
	"copia_id" bigint,
	"documento_id" bigint,
	"descripcion" text NOT NULL,
	"retirado_en_el_acto" boolean DEFAULT false NOT NULL,
	"responsable_id" bigint NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrado_en" timestamp with time zone,
	"cerrado_por" bigint,
	"nota_cierre" text,
	CONSTRAINT "hallazgos_origen_valido" CHECK ("hallazgos"."origen" IN ('verificacion', 'recogida')),
	CONSTRAINT "hallazgos_estado_valido" CHECK ("hallazgos"."estado" IN ('abierto', 'cerrado'))
);
--> statement-breakpoint
CREATE TABLE "jornada_asistentes" (
	"jornada_id" bigint NOT NULL,
	"usuario_id" bigint NOT NULL,
	CONSTRAINT "jornada_asistentes_jornada_id_usuario_id_pk" PRIMARY KEY("jornada_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "jornada_versiones" (
	"jornada_id" bigint NOT NULL,
	"version_id" bigint NOT NULL,
	CONSTRAINT "jornada_versiones_jornada_id_version_id_pk" PRIMARY KEY("jornada_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "jornadas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jornadas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"fecha" date NOT NULL,
	"modalidad" text NOT NULL,
	"facilitador_id" bigint NOT NULL,
	"observaciones" text,
	"asistentes_externos" text,
	"registrada_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"anulada_en" timestamp with time zone,
	"anulada_por" bigint,
	"motivo_anulacion" text,
	CONSTRAINT "jornadas_modalidad_valida" CHECK ("jornadas"."modalidad" IN ('presencial', 'virtual', 'reunion_servicio', 'otra'))
);
--> statement-breakpoint
CREATE TABLE "lista_miembros" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lista_miembros_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"lista_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"referencia_id" bigint NOT NULL,
	CONSTRAINT "lista_miembros_unico" UNIQUE("lista_id","tipo","referencia_id"),
	CONSTRAINT "lista_miembros_tipo_valido" CHECK ("lista_miembros"."tipo" IN ('area', 'cargo', 'proceso', 'usuario'))
);
--> statement-breakpoint
CREATE TABLE "listas_distribucion" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listas_distribucion_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"descripcion" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "punto_uso_procesos" (
	"punto_uso_id" bigint NOT NULL,
	"proceso_id" bigint NOT NULL,
	CONSTRAINT "punto_uso_procesos_punto_uso_id_proceso_id_pk" PRIMARY KEY("punto_uso_id","proceso_id")
);
--> statement-breakpoint
CREATE TABLE "puntos_uso" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "puntos_uso_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"sede" text,
	"ubicacion" text,
	"responsable_id" bigint NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "socializaciones_requeridas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "socializaciones_requeridas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"cumplida_en" timestamp with time zone,
	"jornada_id" bigint,
	"superada_en" timestamp with time zone,
	CONSTRAINT "socializaciones_requeridas_version_id_unique" UNIQUE("version_id")
);
--> statement-breakpoint
CREATE TABLE "verificacion_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verificacion_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"verificacion_id" bigint NOT NULL,
	"orden" integer NOT NULL,
	"origen" text NOT NULL,
	"copia_id" bigint,
	"texto" text NOT NULL,
	"respuesta" text,
	"nota" text,
	CONSTRAINT "verificacion_items_origen_valido" CHECK ("verificacion_items"."origen" IN ('copia', 'copia_por_recoger', 'fijo', 'libre')),
	CONSTRAINT "verificacion_items_respuesta_valida" CHECK ("verificacion_items"."respuesta" IN ('conforme', 'no_conforme', 'no_aplica'))
);
--> statement-breakpoint
CREATE TABLE "verificaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "verificaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"punto_uso_id" bigint NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"abierta_por" bigint NOT NULL,
	"abierta_en" timestamp with time zone NOT NULL,
	"cerrada_por" bigint,
	"cerrada_en" timestamp with time zone,
	"conforme" boolean,
	"propio_punto" boolean DEFAULT false NOT NULL,
	"motivo_descarte" text,
	"punto_nombre" text NOT NULL,
	"responsable_id" bigint NOT NULL,
	"responsable_nombre" text NOT NULL,
	CONSTRAINT "verificaciones_estado_valido" CHECK ("verificaciones"."estado" IN ('abierta', 'cerrada', 'descartada'))
);
--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_rol_valido";--> statement-breakpoint
ALTER TABLE "archivos" ALTER COLUMN "version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "archivos" ADD COLUMN "contexto" text DEFAULT 'version' NOT NULL;--> statement-breakpoint
ALTER TABLE "archivos" ADD COLUMN "contexto_id" bigint;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "lectura_obligatoria_ingreso" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tramites" ADD COLUMN "requiere_socializacion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "acuse_eventos" ADD CONSTRAINT "acuse_eventos_acuse_id_acuses_id_fk" FOREIGN KEY ("acuse_id") REFERENCES "public"."acuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acuse_eventos" ADD CONSTRAINT "acuse_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acuses" ADD CONSTRAINT "acuses_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acuses" ADD CONSTRAINT "acuses_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acuses" ADD CONSTRAINT "acuses_jornada_id_jornadas_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornadas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copia_eventos" ADD CONSTRAINT "copia_eventos_copia_id_copias_controladas_id_fk" FOREIGN KEY ("copia_id") REFERENCES "public"."copias_controladas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copia_eventos" ADD CONSTRAINT "copia_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copias_controladas" ADD CONSTRAINT "copias_controladas_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copias_controladas" ADD CONSTRAINT "copias_controladas_punto_uso_id_puntos_uso_id_fk" FOREIGN KEY ("punto_uso_id") REFERENCES "public"."puntos_uso"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copias_controladas" ADD CONSTRAINT "copias_controladas_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copias_controladas" ADD CONSTRAINT "copias_controladas_emitida_por_usuarios_id_fk" FOREIGN KEY ("emitida_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copias_controladas" ADD CONSTRAINT "copias_controladas_reemplaza_copia_id_copias_controladas_id_fk" FOREIGN KEY ("reemplaza_copia_id") REFERENCES "public"."copias_controladas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_listas" ADD CONSTRAINT "documento_listas_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento_listas" ADD CONSTRAINT "documento_listas_lista_id_listas_distribucion_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."listas_distribucion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_punto_uso_id_puntos_uso_id_fk" FOREIGN KEY ("punto_uso_id") REFERENCES "public"."puntos_uso"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_verificacion_id_verificaciones_id_fk" FOREIGN KEY ("verificacion_id") REFERENCES "public"."verificaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_item_id_verificacion_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."verificacion_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_copia_id_copias_controladas_id_fk" FOREIGN KEY ("copia_id") REFERENCES "public"."copias_controladas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada_asistentes" ADD CONSTRAINT "jornada_asistentes_jornada_id_jornadas_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornadas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada_asistentes" ADD CONSTRAINT "jornada_asistentes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada_versiones" ADD CONSTRAINT "jornada_versiones_jornada_id_jornadas_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornadas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornada_versiones" ADD CONSTRAINT "jornada_versiones_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_facilitador_id_usuarios_id_fk" FOREIGN KEY ("facilitador_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_registrada_por_usuarios_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jornadas" ADD CONSTRAINT "jornadas_anulada_por_usuarios_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lista_miembros" ADD CONSTRAINT "lista_miembros_lista_id_listas_distribucion_id_fk" FOREIGN KEY ("lista_id") REFERENCES "public"."listas_distribucion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_uso_procesos" ADD CONSTRAINT "punto_uso_procesos_punto_uso_id_puntos_uso_id_fk" FOREIGN KEY ("punto_uso_id") REFERENCES "public"."puntos_uso"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punto_uso_procesos" ADD CONSTRAINT "punto_uso_procesos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puntos_uso" ADD CONSTRAINT "puntos_uso_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "socializaciones_requeridas" ADD CONSTRAINT "socializaciones_requeridas_version_id_documento_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."documento_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "socializaciones_requeridas" ADD CONSTRAINT "socializaciones_requeridas_jornada_id_jornadas_id_fk" FOREIGN KEY ("jornada_id") REFERENCES "public"."jornadas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificacion_items" ADD CONSTRAINT "verificacion_items_verificacion_id_verificaciones_id_fk" FOREIGN KEY ("verificacion_id") REFERENCES "public"."verificaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificacion_items" ADD CONSTRAINT "verificacion_items_copia_id_copias_controladas_id_fk" FOREIGN KEY ("copia_id") REFERENCES "public"."copias_controladas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificaciones" ADD CONSTRAINT "verificaciones_punto_uso_id_puntos_uso_id_fk" FOREIGN KEY ("punto_uso_id") REFERENCES "public"."puntos_uso"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificaciones" ADD CONSTRAINT "verificaciones_abierta_por_usuarios_id_fk" FOREIGN KEY ("abierta_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificaciones" ADD CONSTRAINT "verificaciones_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verificaciones" ADD CONSTRAINT "verificaciones_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acuse_eventos_acuse_idx" ON "acuse_eventos" USING btree ("acuse_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "acuses_vivo_unico" ON "acuses" USING btree ("version_id","usuario_id") WHERE estado IN ('pendiente', 'confirmado');--> statement-breakpoint
CREATE INDEX "acuses_usuario_estado_idx" ON "acuses" USING btree ("usuario_id","estado");--> statement-breakpoint
CREATE INDEX "acuses_version_idx" ON "acuses" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "copia_eventos_copia_idx" ON "copia_eventos" USING btree ("copia_id","creado_en");--> statement-breakpoint
CREATE INDEX "copias_punto_uso_idx" ON "copias_controladas" USING btree ("punto_uso_id");--> statement-breakpoint
CREATE INDEX "copias_estado_idx" ON "copias_controladas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "hallazgos_punto_estado_idx" ON "hallazgos" USING btree ("punto_uso_id","estado");--> statement-breakpoint
CREATE INDEX "hallazgos_responsable_idx" ON "hallazgos" USING btree ("responsable_id");--> statement-breakpoint
CREATE INDEX "jornada_versiones_version_idx" ON "jornada_versiones" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listas_distribucion_nombre_unico" ON "listas_distribucion" USING btree (lower("nombre"));--> statement-breakpoint
CREATE INDEX "punto_uso_procesos_proceso_idx" ON "punto_uso_procesos" USING btree ("proceso_id");--> statement-breakpoint
CREATE UNIQUE INDEX "puntos_uso_sede_nombre_unico" ON "puntos_uso" USING btree (lower(coalesce("sede", '')),lower("nombre"));--> statement-breakpoint
CREATE INDEX "verificacion_items_verificacion_idx" ON "verificacion_items" USING btree ("verificacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verificaciones_una_abierta_idx" ON "verificaciones" USING btree ("punto_uso_id") WHERE estado = 'abierta';--> statement-breakpoint
CREATE INDEX "verificaciones_punto_cerrada_idx" ON "verificaciones" USING btree ("punto_uso_id","cerrada_en");--> statement-breakpoint
CREATE INDEX "archivos_contexto_idx" ON "archivos" USING btree ("contexto","contexto_id");--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_valido" CHECK ("archivos"."contexto" IN ('version', 'jornada', 'verificacion_item'));--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_coherente" CHECK (("archivos"."contexto" = 'version' AND "archivos"."version_id" IS NOT NULL AND "archivos"."contexto_id" IS NULL) OR ("archivos"."contexto" <> 'version' AND "archivos"."version_id" IS NULL AND "archivos"."contexto_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_rol_valido" CHECK ("archivos"."rol" IN ('principal', 'editable', 'anexo', 'acta_aprobacion', 'acta_eliminacion', 'evidencia'));--> statement-breakpoint
CREATE FUNCTION sgc_impedir_si_verificacion_cerrada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_verificacion text;
BEGIN
  IF TG_TABLE_NAME = 'verificaciones' THEN
    estado_verificacion := OLD.estado;
  ELSE
    SELECT estado INTO estado_verificacion FROM verificaciones WHERE id = OLD.verificacion_id;
  END IF;
  IF estado_verificacion IN ('cerrada', 'descartada') THEN
    RAISE EXCEPTION 'La verificación % está % y no admite cambios (%)', COALESCE(OLD.id, 0), estado_verificacion, TG_OP
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER copia_eventos_inmutable BEFORE UPDATE OR DELETE ON "copia_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER acuse_eventos_inmutable BEFORE UPDATE OR DELETE ON "acuse_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER verificaciones_cerrada_inmutable BEFORE UPDATE ON "verificaciones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_verificacion_cerrada();--> statement-breakpoint
CREATE TRIGGER verificacion_items_inmutables BEFORE UPDATE OR DELETE ON "verificacion_items" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_verificacion_cerrada();
