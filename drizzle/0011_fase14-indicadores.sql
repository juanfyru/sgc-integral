CREATE TABLE "calculo_fotos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calculo_fotos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"calculo" text NOT NULL,
	"proceso_id" bigint,
	"clase_objetivo" text,
	"periodo" text NOT NULL,
	"numerador" numeric,
	"denominador" numeric,
	"valor" numeric,
	"tomada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"historica" boolean DEFAULT false NOT NULL,
	"cierre_id" bigint
);
--> statement-breakpoint
CREATE TABLE "cierres_indicadores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cierres_indicadores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"mes" date NOT NULL,
	"cerrado_por" bigint NOT NULL,
	"cerrado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resumen" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "cierres_indicadores_mes_unique" UNIQUE("mes")
);
--> statement-breakpoint
CREATE TABLE "clasificaciones_indicador" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clasificaciones_indicador_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"aprueba" text NOT NULL,
	"exige_norma" boolean DEFAULT false NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "clasificaciones_indicador_aprueba_valida" CHECK ("clasificaciones_indicador"."aprueba" IN ('gerencia', 'lider'))
);
--> statement-breakpoint
CREATE TABLE "dimension_categorias" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dimension_categorias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"dimension_id" bigint NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dimensiones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dimensiones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	CONSTRAINT "dimensiones_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "impactos_indicadores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "impactos_indicadores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"norma_cambio_id" bigint NOT NULL,
	"norma_id" bigint NOT NULL,
	"indicador_id" bigint NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"resolucion" text,
	"version_id" bigint,
	"nota" text,
	"resuelto_por" bigint,
	"resuelto_en" timestamp with time zone,
	CONSTRAINT "impactos_indicadores_unico" UNIQUE("norma_cambio_id","indicador_id")
);
--> statement-breakpoint
CREATE TABLE "indicador_designados" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicador_designados_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"indicador_id" bigint NOT NULL,
	"usuario_id" bigint NOT NULL,
	"funcion" text NOT NULL,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicador_designados_unico" UNIQUE("indicador_id","usuario_id","funcion"),
	CONSTRAINT "indicador_designados_funcion_valida" CHECK ("indicador_designados"."funcion" IN ('mide', 'analiza', 'seguimiento'))
);
--> statement-breakpoint
CREATE TABLE "indicador_metas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicador_metas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"indicador_id" bigint NOT NULL,
	"periodo" text NOT NULL,
	"meta" numeric,
	"meta_max" numeric,
	"justificacion" text,
	"tardia" boolean DEFAULT false NOT NULL,
	"programada_por" bigint NOT NULL,
	"programada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicador_metas_unica" UNIQUE("indicador_id","periodo")
);
--> statement-breakpoint
CREATE TABLE "indicador_normas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicador_normas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"norma_id" bigint NOT NULL,
	"norma_nombre" text NOT NULL,
	CONSTRAINT "indicador_normas_unica" UNIQUE("version_id","norma_id")
);
--> statement-breakpoint
CREATE TABLE "indicador_responsables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicador_responsables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"cargo_id" bigint NOT NULL,
	"cargo_nombre" text NOT NULL,
	"funcion" text NOT NULL,
	CONSTRAINT "indicador_responsables_unico" UNIQUE("version_id","cargo_id","funcion"),
	CONSTRAINT "indicador_responsables_funcion_valida" CHECK ("indicador_responsables"."funcion" IN ('medir', 'analizar'))
);
--> statement-breakpoint
CREATE TABLE "indicador_variables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicador_variables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"version_id" bigint NOT NULL,
	"letra" text NOT NULL,
	"nombre" text,
	"descripcion" text,
	"fuente" text,
	"unidad" text,
	"consolidacion" text DEFAULT 'suma' NOT NULL,
	"origen" text DEFAULT 'propia' NOT NULL,
	"variable_compartida_id" bigint,
	"indicador_origen_id" bigint,
	"toma" text,
	"captura_min" numeric,
	"captura_max" numeric,
	"admite_negativos" boolean DEFAULT false NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "indicador_variables_letra_unica" UNIQUE("version_id","letra"),
	CONSTRAINT "indicador_variables_letra_valida" CHECK ("indicador_variables"."letra" ~ '^[A-Z]$'),
	CONSTRAINT "indicador_variables_consolidacion_valida" CHECK ("indicador_variables"."consolidacion" IN ('suma', 'ultimo', 'promedio')),
	CONSTRAINT "indicador_variables_origen_valido" CHECK ("indicador_variables"."origen" IN ('propia', 'compartida', 'automatica', 'indicador')),
	CONSTRAINT "indicador_variables_toma_valida" CHECK ("indicador_variables"."toma" IN ('valor', 'cumplimiento'))
);
--> statement-breakpoint
CREATE TABLE "indicador_versiones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicador_versiones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"indicador_id" bigint NOT NULL,
	"numero" integer NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"tipo_cambio" text NOT NULL,
	"motivo_cambio" text,
	"rige_desde" text,
	"nombre" text,
	"proposito" text,
	"requisito" text,
	"tipo_id" bigint,
	"tipo_nombre" text,
	"clasificacion_id" bigint,
	"clasificacion_nombre" text,
	"objetivo_id" bigint,
	"objetivo_nombre" text,
	"proceso_nombre" text,
	"subproceso_id" bigint,
	"subproceso_nombre" text,
	"procedimiento_documento_id" bigint,
	"punto_control" text,
	"origen_dato" text DEFAULT 'manual' NOT NULL,
	"calculo" text,
	"calculo_alcance" text,
	"forma" text,
	"factor" integer,
	"formula" text,
	"unidad_id" bigint,
	"unidad_nombre" text,
	"unidad_sufijo" text,
	"decimales" integer,
	"periodicidad" text,
	"tendencia" text,
	"meta" numeric,
	"meta_max" numeric,
	"semaforo_modo" text,
	"umbral_atencion_pct" integer,
	"limite_critico" numeric,
	"tolerancia" numeric,
	"resultado_min" numeric,
	"resultado_max" numeric,
	"linea_base_valor" numeric,
	"linea_base_periodo" text,
	"linea_base_nota" text,
	"sustento_meta" text,
	"ente" text,
	"periodicidad_externa" text,
	"plazo_externo_dias" integer,
	"dimension_id" bigint,
	"prueba" jsonb,
	"nota_devolucion" text,
	"huella" text,
	"elaborada_por" bigint,
	"elaborada_en" timestamp with time zone,
	"aprobada_por" bigint,
	"aprobada_en" timestamp with time zone,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicador_versiones_numero_unico" UNIQUE("indicador_id","numero"),
	CONSTRAINT "indicador_versiones_estado_valido" CHECK ("indicador_versiones"."estado" IN ('borrador', 'por_aprobar', 'aprobada', 'descartada')),
	CONSTRAINT "indicador_versiones_tipo_cambio_valido" CHECK ("indicador_versiones"."tipo_cambio" IN ('inicial', 'mayor', 'menor')),
	CONSTRAINT "indicador_versiones_origen_dato_valido" CHECK ("indicador_versiones"."origen_dato" IN ('manual', 'automatico')),
	CONSTRAINT "indicador_versiones_forma_valida" CHECK ("indicador_versiones"."forma" IN ('porcentaje', 'tasa', 'razon', 'conteo', 'libre')),
	CONSTRAINT "indicador_versiones_periodicidad_valida" CHECK ("indicador_versiones"."periodicidad" IN ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual')),
	CONSTRAINT "indicador_versiones_tendencia_valida" CHECK ("indicador_versiones"."tendencia" IN ('ascendente', 'descendente', 'constante')),
	CONSTRAINT "indicador_versiones_semaforo_modo_valido" CHECK ("indicador_versiones"."semaforo_modo" IN ('relativo', 'fijo')),
	CONSTRAINT "indicador_versiones_decimales_validos" CHECK ("indicador_versiones"."decimales" BETWEEN 0 AND 4),
	CONSTRAINT "indicador_versiones_umbral_valido" CHECK ("indicador_versiones"."umbral_atencion_pct" BETWEEN 1 AND 99),
	CONSTRAINT "indicador_versiones_aprobada_coherente" CHECK ("indicador_versiones"."estado" <> 'aprobada' OR ("indicador_versiones"."elaborada_por" IS NOT NULL AND "indicador_versiones"."huella" IS NOT NULL AND "indicador_versiones"."rige_desde" IS NOT NULL AND ("indicador_versiones"."tipo_cambio" = 'menor' OR "indicador_versiones"."aprobada_por" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "indicadores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "indicadores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"codigo" text NOT NULL,
	"proceso_id" bigint NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"nivel_acceso" text DEFAULT 'general' NOT NULL,
	"plazo_reporte_dias" integer DEFAULT 10 NOT NULL,
	"inicio_medicion" text,
	"soporte_obligatorio" boolean DEFAULT false NOT NULL,
	"baja_por" bigint,
	"baja_en" timestamp with time zone,
	"baja_motivo" text,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicadores_estado_valido" CHECK ("indicadores"."estado" IN ('borrador', 'activo', 'retirado', 'descartado')),
	CONSTRAINT "indicadores_nivel_acceso_valido" CHECK ("indicadores"."nivel_acceso" IN ('general', 'restringido')),
	CONSTRAINT "indicadores_plazo_reporte_valido" CHECK ("indicadores"."plazo_reporte_dias" BETWEEN 0 AND 90),
	CONSTRAINT "indicadores_baja_coherente" CHECK (("indicadores"."estado" IN ('retirado', 'descartado')) = ("indicadores"."baja_por" IS NOT NULL AND "indicadores"."baja_en" IS NOT NULL AND "indicadores"."baja_motivo" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "medicion_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "medicion_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"medicion_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" bigint,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicion_eventos_tipo_valido" CHECK ("medicion_eventos"."tipo" IN ('reporte', 'correccion', 'analisis', 'no_aplica', 'meta', 'soporte', 'cierre', 'reapertura', 'recalculo', 'historico'))
);
--> statement-breakpoint
CREATE TABLE "medicion_observaciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "medicion_observaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"medicion_id" bigint NOT NULL,
	"usuario_id" bigint NOT NULL,
	"texto" text NOT NULL,
	"responde_a" bigint,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medicion_valores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "medicion_valores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"medicion_id" bigint NOT NULL,
	"variable_id" bigint NOT NULL,
	"categoria_id" bigint,
	"valor" numeric,
	"no_aplica" boolean DEFAULT false NOT NULL,
	"no_aplica_motivo" text,
	"reportado_por" bigint,
	"reportado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mediciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mediciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"indicador_id" bigint NOT NULL,
	"version_id" bigint NOT NULL,
	"periodo" text NOT NULL,
	"desde" timestamp with time zone NOT NULL,
	"hasta" timestamp with time zone NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"historica" boolean DEFAULT false NOT NULL,
	"no_aplica" boolean DEFAULT false NOT NULL,
	"no_aplica_motivo" text,
	"resultado_exacto" text,
	"resultado" numeric,
	"semaforo" text,
	"meta_aplicada" numeric,
	"meta_max_aplicada" numeric,
	"limite_aplicado" numeric,
	"requiere_accion" boolean DEFAULT false NOT NULL,
	"incumplimiento_repetido" boolean DEFAULT false NOT NULL,
	"analisis" text,
	"causa" text,
	"accion_propuesta" text,
	"reportada_por" bigint,
	"reportada_en" timestamp with time zone,
	"analizada_por" bigint,
	"analizada_en" timestamp with time zone,
	"corregida" boolean DEFAULT false NOT NULL,
	"meta_tardia" boolean DEFAULT false NOT NULL,
	"sin_analisis" boolean DEFAULT false NOT NULL,
	"cierre_id" bigint,
	"reabierta_por" bigint,
	"reabierta_en" timestamp with time zone,
	"reabierta_motivo" text,
	"aviso_previo_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"alerta_estado" text,
	CONSTRAINT "mediciones_periodo_unico" UNIQUE("indicador_id","periodo"),
	CONSTRAINT "mediciones_estado_valido" CHECK ("mediciones"."estado" IN ('abierta', 'reportada', 'cerrada')),
	CONSTRAINT "mediciones_semaforo_valido" CHECK ("mediciones"."semaforo" IN ('bien', 'atencion', 'critico'))
);
--> statement-breakpoint
CREATE TABLE "objetivos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "objetivos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"clase" text NOT NULL,
	"enunciado" text NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "objetivos_clase_valida" CHECK ("objetivos"."clase" IN ('calidad', 'institucional'))
);
--> statement-breakpoint
CREATE TABLE "reportes_externos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reportes_externos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"indicador_id" bigint NOT NULL,
	"periodo" text NOT NULL,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"vence_en" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"fecha_envio" date,
	"radicado" text,
	"resultado_enviado" text,
	"nota" text,
	"registrada_por" bigint,
	"registrada_en" timestamp with time zone,
	"aviso_previo_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	CONSTRAINT "reportes_externos_unico" UNIQUE("indicador_id","periodo")
);
--> statement-breakpoint
CREATE TABLE "tipos_indicador" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tipos_indicador_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unidades_indicador" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "unidades_indicador_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"sufijo" text DEFAULT '' NOT NULL,
	"decimales" integer DEFAULT 0 NOT NULL,
	"orden" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "unidades_indicador_decimales_validos" CHECK ("unidades_indicador"."decimales" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "variable_responsables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variable_responsables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"variable_id" bigint NOT NULL,
	"usuario_id" bigint NOT NULL,
	CONSTRAINT "variable_responsables_unico" UNIQUE("variable_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "variable_valores" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variable_valores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"variable_id" bigint NOT NULL,
	"periodo" text NOT NULL,
	"categoria_id" bigint,
	"valor" numeric,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"vence_en" timestamp with time zone,
	"reportado_por" bigint,
	"reportado_en" timestamp with time zone,
	"aviso_previo_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"cierre_id" bigint
);
--> statement-breakpoint
CREATE TABLE "variables_compartidas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variables_compartidas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"proceso_id" bigint NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"fuente" text,
	"unidad" text,
	"periodicidad" text,
	"consolidacion" text,
	"captura_min" numeric,
	"captura_max" numeric,
	"admite_negativos" boolean DEFAULT false NOT NULL,
	"plazo_reporte_dias" integer,
	"dimension_id" bigint,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "variables_compartidas_unica" UNIQUE("proceso_id","nombre")
);
--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_contexto_valido";--> statement-breakpoint
ALTER TABLE "firmas" DROP CONSTRAINT "firmas_tramite_coherente";--> statement-breakpoint
ALTER TABLE "firmas" ADD COLUMN "indicador_version_id" bigint;--> statement-breakpoint
ALTER TABLE "calculo_fotos" ADD CONSTRAINT "calculo_fotos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculo_fotos" ADD CONSTRAINT "calculo_fotos_cierre_id_cierres_indicadores_id_fk" FOREIGN KEY ("cierre_id") REFERENCES "public"."cierres_indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cierres_indicadores" ADD CONSTRAINT "cierres_indicadores_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_categorias" ADD CONSTRAINT "dimension_categorias_dimension_id_dimensiones_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."dimensiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_norma_cambio_id_norma_cambios_id_fk" FOREIGN KEY ("norma_cambio_id") REFERENCES "public"."norma_cambios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_norma_id_normas_id_fk" FOREIGN KEY ("norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_version_id_indicador_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."indicador_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impactos_indicadores" ADD CONSTRAINT "impactos_indicadores_resuelto_por_usuarios_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_designados" ADD CONSTRAINT "indicador_designados_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_designados" ADD CONSTRAINT "indicador_designados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_designados" ADD CONSTRAINT "indicador_designados_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_metas" ADD CONSTRAINT "indicador_metas_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_metas" ADD CONSTRAINT "indicador_metas_programada_por_usuarios_id_fk" FOREIGN KEY ("programada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_normas" ADD CONSTRAINT "indicador_normas_version_id_indicador_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."indicador_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_normas" ADD CONSTRAINT "indicador_normas_norma_id_normas_id_fk" FOREIGN KEY ("norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_responsables" ADD CONSTRAINT "indicador_responsables_version_id_indicador_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."indicador_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_responsables" ADD CONSTRAINT "indicador_responsables_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_variables" ADD CONSTRAINT "indicador_variables_version_id_indicador_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."indicador_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_variables" ADD CONSTRAINT "indicador_variables_variable_compartida_id_variables_compartidas_id_fk" FOREIGN KEY ("variable_compartida_id") REFERENCES "public"."variables_compartidas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_variables" ADD CONSTRAINT "indicador_variables_indicador_origen_id_indicadores_id_fk" FOREIGN KEY ("indicador_origen_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_tipo_id_tipos_indicador_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos_indicador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_clasificacion_id_clasificaciones_indicador_id_fk" FOREIGN KEY ("clasificacion_id") REFERENCES "public"."clasificaciones_indicador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_objetivo_id_objetivos_id_fk" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_subproceso_id_subprocesos_id_fk" FOREIGN KEY ("subproceso_id") REFERENCES "public"."subprocesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_procedimiento_documento_id_documentos_id_fk" FOREIGN KEY ("procedimiento_documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_unidad_id_unidades_indicador_id_fk" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades_indicador"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_dimension_id_dimensiones_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."dimensiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_elaborada_por_usuarios_id_fk" FOREIGN KEY ("elaborada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_aprobada_por_usuarios_id_fk" FOREIGN KEY ("aprobada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicador_versiones" ADD CONSTRAINT "indicador_versiones_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_baja_por_usuarios_id_fk" FOREIGN KEY ("baja_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_eventos" ADD CONSTRAINT "medicion_eventos_medicion_id_mediciones_id_fk" FOREIGN KEY ("medicion_id") REFERENCES "public"."mediciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_eventos" ADD CONSTRAINT "medicion_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_observaciones" ADD CONSTRAINT "medicion_observaciones_medicion_id_mediciones_id_fk" FOREIGN KEY ("medicion_id") REFERENCES "public"."mediciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_observaciones" ADD CONSTRAINT "medicion_observaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_observaciones" ADD CONSTRAINT "medicion_observaciones_responde_a_medicion_observaciones_id_fk" FOREIGN KEY ("responde_a") REFERENCES "public"."medicion_observaciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_valores" ADD CONSTRAINT "medicion_valores_medicion_id_mediciones_id_fk" FOREIGN KEY ("medicion_id") REFERENCES "public"."mediciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_valores" ADD CONSTRAINT "medicion_valores_variable_id_indicador_variables_id_fk" FOREIGN KEY ("variable_id") REFERENCES "public"."indicador_variables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_valores" ADD CONSTRAINT "medicion_valores_categoria_id_dimension_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."dimension_categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medicion_valores" ADD CONSTRAINT "medicion_valores_reportado_por_usuarios_id_fk" FOREIGN KEY ("reportado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediciones" ADD CONSTRAINT "mediciones_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediciones" ADD CONSTRAINT "mediciones_version_id_indicador_versiones_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."indicador_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediciones" ADD CONSTRAINT "mediciones_reportada_por_usuarios_id_fk" FOREIGN KEY ("reportada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediciones" ADD CONSTRAINT "mediciones_analizada_por_usuarios_id_fk" FOREIGN KEY ("analizada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediciones" ADD CONSTRAINT "mediciones_cierre_id_cierres_indicadores_id_fk" FOREIGN KEY ("cierre_id") REFERENCES "public"."cierres_indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mediciones" ADD CONSTRAINT "mediciones_reabierta_por_usuarios_id_fk" FOREIGN KEY ("reabierta_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD CONSTRAINT "reportes_externos_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reportes_externos" ADD CONSTRAINT "reportes_externos_registrada_por_usuarios_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_responsables" ADD CONSTRAINT "variable_responsables_variable_id_variables_compartidas_id_fk" FOREIGN KEY ("variable_id") REFERENCES "public"."variables_compartidas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_responsables" ADD CONSTRAINT "variable_responsables_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD CONSTRAINT "variable_valores_variable_id_variables_compartidas_id_fk" FOREIGN KEY ("variable_id") REFERENCES "public"."variables_compartidas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD CONSTRAINT "variable_valores_categoria_id_dimension_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."dimension_categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD CONSTRAINT "variable_valores_reportado_por_usuarios_id_fk" FOREIGN KEY ("reportado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_valores" ADD CONSTRAINT "variable_valores_cierre_id_cierres_indicadores_id_fk" FOREIGN KEY ("cierre_id") REFERENCES "public"."cierres_indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD CONSTRAINT "variables_compartidas_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variables_compartidas" ADD CONSTRAINT "variables_compartidas_dimension_id_dimensiones_id_fk" FOREIGN KEY ("dimension_id") REFERENCES "public"."dimensiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calculo_fotos_unico_idx" ON "calculo_fotos" USING btree ("calculo","proceso_id","clase_objetivo","periodo") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE UNIQUE INDEX "clasificaciones_indicador_nombre_unico" ON "clasificaciones_indicador" USING btree (lower("nombre"));--> statement-breakpoint
CREATE INDEX "indicador_designados_usuario_idx" ON "indicador_designados" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "indicador_versiones_un_borrador_idx" ON "indicador_versiones" USING btree ("indicador_id") WHERE estado IN ('borrador', 'por_aprobar');--> statement-breakpoint
CREATE UNIQUE INDEX "indicadores_codigo_unico" ON "indicadores" USING btree (lower("codigo"));--> statement-breakpoint
CREATE INDEX "indicadores_proceso_idx" ON "indicadores" USING btree ("proceso_id");--> statement-breakpoint
CREATE INDEX "medicion_eventos_medicion_idx" ON "medicion_eventos" USING btree ("medicion_id","creado_en");--> statement-breakpoint
CREATE INDEX "medicion_observaciones_medicion_idx" ON "medicion_observaciones" USING btree ("medicion_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "medicion_valores_unico_idx" ON "medicion_valores" USING btree ("medicion_id","variable_id","categoria_id") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX "mediciones_estado_vence_idx" ON "mediciones" USING btree ("estado","vence_en");--> statement-breakpoint
CREATE INDEX "mediciones_indicador_hasta_idx" ON "mediciones" USING btree ("indicador_id","hasta");--> statement-breakpoint
CREATE UNIQUE INDEX "tipos_indicador_nombre_unico" ON "tipos_indicador" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "unidades_indicador_nombre_unico" ON "unidades_indicador" USING btree (lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "variable_valores_unico_idx" ON "variable_valores" USING btree ("variable_id","periodo","categoria_id") NULLS NOT DISTINCT;--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_indicador_version_id_indicador_versiones_id_fk" FOREIGN KEY ("indicador_version_id") REFERENCES "public"."indicador_versiones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_valido" CHECK ("archivos"."contexto" IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo', 'medicion', 'reporte_externo'));--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_tramite_coherente" CHECK ("firmas"."tramite_id" IS NOT NULL OR "firmas"."firma" IN ('ratifico', 'adopto') OR "firmas"."indicador_version_id" IS NOT NULL);
--> statement-breakpoint
CREATE TRIGGER medicion_eventos_inmutable BEFORE UPDATE OR DELETE ON "medicion_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER medicion_observaciones_inmutable BEFORE UPDATE OR DELETE ON "medicion_observaciones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER cierres_indicadores_inmutable BEFORE UPDATE OR DELETE ON "cierres_indicadores" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
INSERT INTO "tipos_indicador" ("nombre", "orden")
SELECT v.nombre, v.orden
FROM (VALUES
	('Eficacia', 1),
	('Eficiencia', 2),
	('Efectividad', 3)
) AS v(nombre, orden)
WHERE NOT EXISTS (SELECT 1 FROM "tipos_indicador");--> statement-breakpoint
INSERT INTO "clasificaciones_indicador" ("nombre", "aprueba", "exige_norma", "orden")
SELECT v.nombre, v.aprueba, v.exige_norma, v.orden
FROM (VALUES
	('Estratégico', 'gerencia', false, 1),
	('Operativo', 'lider', false, 2),
	('Regulatorio', 'gerencia', true, 3)
) AS v(nombre, aprueba, exige_norma, orden)
WHERE NOT EXISTS (SELECT 1 FROM "clasificaciones_indicador");--> statement-breakpoint
INSERT INTO "unidades_indicador" ("nombre", "sufijo", "decimales", "orden")
SELECT v.nombre, v.sufijo, v.decimales, v.orden
FROM (VALUES
	('Porcentaje', ' %', 1, 1),
	('Número', '', 0, 2),
	('Días', ' días', 1, 3),
	('Horas', ' h', 1, 4),
	('Minutos', ' min', 0, 5),
	('Tasa por mil', ' por mil', 1, 6),
	('Pesos', ' pesos', 0, 7)
) AS v(nombre, sufijo, decimales, orden)
WHERE NOT EXISTS (SELECT 1 FROM "unidades_indicador");--> statement-breakpoint
INSERT INTO "configuracion" ("clave", "valor") VALUES
	('ind_umbral_atencion_pct', '70'),
	('ind_aviso_previo_dias', '3'),
	('ind_plazo_reporte_dias', '10'),
	('ind_incumplimiento_periodos', '3'),
	('ind_variacion_confirmar_pct', '30')
ON CONFLICT ("clave") DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sgc_impedir_si_medicion_cerrada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_medicion text;
BEGIN
  IF TG_TABLE_NAME = 'mediciones' THEN
    IF OLD.estado = 'cerrada' THEN
      -- El único cambio que admite una medición cerrada es su reapertura.
      IF TG_OP = 'UPDATE' AND NEW.estado IN ('abierta', 'reportada')
         AND NEW.reabierta_por IS NOT NULL AND NEW.reabierta_motivo IS NOT NULL
         AND NEW.reabierta_en IS NOT NULL AND NEW.reabierta_en IS DISTINCT FROM OLD.reabierta_en THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'La medición % está cerrada y no admite cambios (%)', OLD.id, TG_OP USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT estado INTO estado_medicion FROM mediciones WHERE id = OLD.medicion_id FOR SHARE;
      IF estado_medicion = 'cerrada' THEN
        RAISE EXCEPTION 'La medición % está cerrada y no admite cambios en % (%)', OLD.medicion_id, TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      SELECT estado INTO estado_medicion FROM mediciones WHERE id = NEW.medicion_id FOR SHARE;
      IF estado_medicion = 'cerrada' THEN
        RAISE EXCEPTION 'La medición % está cerrada y no admite cambios en % (%)', NEW.medicion_id, TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER mediciones_cerrada_inmutable BEFORE UPDATE OR DELETE ON "mediciones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_medicion_cerrada();--> statement-breakpoint
CREATE TRIGGER medicion_valores_cerrada_inmutable BEFORE INSERT OR UPDATE OR DELETE ON "medicion_valores" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_medicion_cerrada();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sgc_impedir_si_version_aprobada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_version text;
BEGIN
  IF TG_TABLE_NAME = 'indicador_versiones' THEN
    IF OLD.estado = 'aprobada' THEN
      RAISE EXCEPTION 'La versión % de la ficha está aprobada y no admite cambios (%)', OLD.id, TG_OP USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT estado INTO estado_version FROM indicador_versiones WHERE id = OLD.version_id FOR SHARE;
      IF estado_version = 'aprobada' THEN
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
END $$;--> statement-breakpoint
CREATE TRIGGER indicador_versiones_aprobada_inmutable BEFORE UPDATE OR DELETE ON "indicador_versiones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_version_aprobada();--> statement-breakpoint
CREATE TRIGGER indicador_variables_aprobada_inmutable BEFORE INSERT OR UPDATE OR DELETE ON "indicador_variables" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_version_aprobada();--> statement-breakpoint
CREATE TRIGGER indicador_responsables_aprobada_inmutable BEFORE INSERT OR UPDATE OR DELETE ON "indicador_responsables" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_version_aprobada();--> statement-breakpoint
CREATE TRIGGER indicador_normas_aprobada_inmutable BEFORE INSERT OR UPDATE OR DELETE ON "indicador_normas" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_version_aprobada();
