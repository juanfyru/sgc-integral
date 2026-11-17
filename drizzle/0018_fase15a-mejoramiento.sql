CREATE TABLE "dias_no_habiles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dias_no_habiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"fecha" date NOT NULL,
	"tipo" text NOT NULL,
	"motivo" text NOT NULL,
	"creado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dias_no_habiles_fecha_unique" UNIQUE("fecha"),
	CONSTRAINT "dias_no_habiles_tipo_valido" CHECK ("dias_no_habiles"."tipo" IN ('no_habil', 'habil'))
);
--> statement-breakpoint
CREATE TABLE "mejora_accion_causas" (
	"hallazgo_id" bigint NOT NULL,
	"accion_id" bigint NOT NULL,
	"causa_id" bigint NOT NULL,
	CONSTRAINT "mejora_accion_causas_accion_id_causa_id_pk" PRIMARY KEY("accion_id","causa_id")
);
--> statement-breakpoint
CREATE TABLE "mejora_acciones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_acciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"ronda_id" bigint NOT NULL,
	"orden" integer NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"recursos" text,
	"indicador_cumplimiento" text,
	"meta" text,
	CONSTRAINT "mejora_acciones_tipo_valido" CHECK ("mejora_acciones"."tipo" IN ('correctiva', 'preventiva', 'mejora'))
);
--> statement-breakpoint
CREATE TABLE "mejora_actividades" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_actividades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"accion_id" bigint NOT NULL,
	"orden" integer NOT NULL,
	"descripcion" text NOT NULL,
	"responsable_id" bigint NOT NULL,
	"inicio" date NOT NULL,
	"fin_original" date,
	"fin" date NOT NULL,
	"avance" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"terminada_en" timestamp with time zone,
	"terminada_por" bigint,
	"verificacion" text,
	"verificacion_nota" text,
	"corregir_antes_de" date,
	"cancelada_en" timestamp with time zone,
	"reprogramaciones" integer DEFAULT 0 NOT NULL,
	"gerencia_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"recordatorio_en" timestamp with time zone,
	CONSTRAINT "mejora_actividades_avance_valido" CHECK ("mejora_actividades"."avance" BETWEEN 0 AND 100),
	CONSTRAINT "mejora_actividades_estado_valido" CHECK ("mejora_actividades"."estado" IN ('abierta', 'en_proceso', 'terminada', 'cancelada')),
	CONSTRAINT "mejora_actividades_verificacion_valida" CHECK ("mejora_actividades"."verificacion" IN ('conforme', 'devuelta'))
);
--> statement-breakpoint
CREATE TABLE "mejora_ajustes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_ajustes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"ronda_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"actividad_id" bigint,
	"datos" jsonb,
	"causa" text NOT NULL,
	"pedido_por" bigint NOT NULL,
	"pedido_en" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"decidido_por" bigint,
	"decidido_en" timestamp with time zone,
	"nota" text,
	"acta_numero" text,
	"acta_fecha" date,
	"vence_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	CONSTRAINT "mejora_ajustes_tipo_valido" CHECK ("mejora_ajustes"."tipo" IN ('reprogramar', 'agregar', 'cancelar')),
	CONSTRAINT "mejora_ajustes_estado_valido" CHECK ("mejora_ajustes"."estado" IN ('pendiente', 'aprobado', 'negado'))
);
--> statement-breakpoint
CREATE TABLE "mejora_analisis" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_analisis_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"ronda_id" bigint NOT NULL,
	"orden" integer NOT NULL,
	"metodo" text NOT NULL,
	"equipo" text,
	"observaciones" text,
	"contenido" jsonb,
	CONSTRAINT "mejora_analisis_metodo_valido" CHECK ("mejora_analisis"."metodo" IN ('cinco_porques', 'ishikawa', 'pareto', 'otro'))
);
--> statement-breakpoint
CREATE TABLE "mejora_causas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_causas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"ronda_id" bigint NOT NULL,
	"orden" integer NOT NULL,
	"texto" text NOT NULL,
	"sin_accion_porque" text
);
--> statement-breakpoint
CREATE TABLE "mejora_consecutivos" (
	"anio" integer PRIMARY KEY NOT NULL,
	"ultimo" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mejora_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"ronda" integer NOT NULL,
	"tipo" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usuario_id" bigint,
	"fuera" boolean DEFAULT false NOT NULL,
	"ocurrio_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mejora_hallazgos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_hallazgos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"codigo" text NOT NULL,
	"anio" integer NOT NULL,
	"consecutivo" integer NOT NULL,
	"clase" text NOT NULL,
	"origen" text NOT NULL,
	"fuente" text,
	"referencia_caso" text,
	"detectado_en" date NOT NULL,
	"proceso_id" bigint NOT NULL,
	"subproceso_id" bigint,
	"criticidad" text,
	"titulo" text NOT NULL,
	"descripcion" text NOT NULL,
	"requisito_clausula" text,
	"requisito_norma_id" bigint,
	"requisito_documento_id" bigint,
	"documento_id" bigint,
	"indicador_id" bigint,
	"medicion_id" bigint,
	"riesgo" text,
	"estado" text NOT NULL,
	"ronda" integer DEFAULT 1 NOT NULL,
	"registrado_por" bigint NOT NULL,
	"registrado_en" timestamp with time zone NOT NULL,
	"reincidente_de" bigint,
	"derivado_de" bigint,
	"cargado" boolean DEFAULT false NOT NULL,
	"correccion_requerida" boolean,
	"correccion_descripcion" text,
	"correccion_responsable_id" bigint,
	"correccion_responsable_nombre" text,
	"correccion_implementada_en" date,
	"correccion_registrada_por" bigint,
	"correccion_registrada_en" timestamp with time zone,
	"accion_requerida" boolean,
	"accion_justificacion" text,
	"accion_decidida_por" bigint,
	"accion_decidida_en" timestamp with time zone,
	"validada_por" bigint,
	"validada_en" timestamp with time zone,
	"fecha_limite_ente" date,
	"respuesta_ente_en" date,
	"respuesta_ente_por" bigint,
	"vence_en" timestamp with time zone,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	"aviso_evaluar_en" timestamp with time zone,
	"cerrado_en" timestamp with time zone,
	"cerrado_por" bigint,
	"resultado_cierre" text,
	"lecciones" text,
	"cambios_atendidos" text,
	"anulado_motivo" text,
	CONSTRAINT "mejora_hallazgos_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "mejora_hallazgos_anio_consecutivo_unico" UNIQUE("anio","consecutivo"),
	CONSTRAINT "mejora_hallazgos_clase_valida" CHECK ("mejora_hallazgos"."clase" IN ('no_conformidad', 'observacion', 'oportunidad')),
	CONSTRAINT "mejora_hallazgos_origen_valido" CHECK ("mejora_hallazgos"."origen" IN ('auditoria_interna', 'control_interno', 'revision_direccion', 'pamec', 'autoevaluacion', 'indicador', 'pqrsf', 'evento_adverso', 'riesgo_materializado', 'satisfaccion_usuario', 'control_documental', 'otro', 'auditoria_externa', 'ente_control')),
	CONSTRAINT "mejora_hallazgos_criticidad_valida" CHECK ("mejora_hallazgos"."criticidad" IN ('alta', 'media', 'baja')),
	CONSTRAINT "mejora_hallazgos_criticidad_coherente" CHECK (("mejora_hallazgos"."clase" = 'no_conformidad') = ("mejora_hallazgos"."criticidad" IS NOT NULL)),
	CONSTRAINT "mejora_hallazgos_estado_valido" CHECK ("mejora_hallazgos"."estado" IN ('por_aceptar', 'rechazo', 'arbitraje', 'por_corregir', 'por_decidir', 'por_validar', 'por_formular', 'en_revision', 'en_aprobacion', 'en_ejecucion', 'por_verificar', 'en_espera', 'por_cerrar', 'cerrado', 'rechazado', 'anulado')),
	CONSTRAINT "mejora_hallazgos_resultado_cierre_valido" CHECK ("mejora_hallazgos"."resultado_cierre" IN ('eficaz', 'con_correccion', 'sin_accion'))
);
--> statement-breakpoint
CREATE TABLE "mejora_ocurrencias" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_ocurrencias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"descripcion" text NOT NULL,
	"origen" text NOT NULL,
	"reporte_id" bigint,
	"registrado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mejora_ocurrencias_origen_valido" CHECK ("mejora_ocurrencias"."origen" IN ('registro', 'reporte', 'medicion'))
);
--> statement-breakpoint
CREATE TABLE "mejora_reporte_eventos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_reporte_eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reporte_id" bigint NOT NULL,
	"tipo" text NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"usuario_id" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mejora_reportes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_reportes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reportado_por" bigint NOT NULL,
	"reportado_en" timestamp with time zone NOT NULL,
	"descripcion" text NOT NULL,
	"visto_en" date NOT NULL,
	"proceso_id" bigint,
	"referencia_caso" text,
	"estado" text DEFAULT 'recibido' NOT NULL,
	"hallazgo_id" bigint,
	"motivo_descarte" text,
	"clasificado_por" bigint,
	"clasificado_en" timestamp with time zone,
	"vence_en" timestamp with time zone NOT NULL,
	"aviso_vencido_en" timestamp with time zone,
	"escalado_en" timestamp with time zone,
	CONSTRAINT "mejora_reportes_estado_valido" CHECK ("mejora_reportes"."estado" IN ('recibido', 'convertido', 'sumado', 'descartado'))
);
--> statement-breakpoint
CREATE TABLE "mejora_rondas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_rondas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"numero" integer NOT NULL,
	"formular_antes_de" timestamp with time zone,
	"enviado_en" timestamp with time zone,
	"estado_plan" text DEFAULT 'borrador' NOT NULL,
	"elaborado_por" bigint,
	"revisado_por" bigint,
	"revisado_en" timestamp with time zone,
	"aprobado_por" bigint,
	"aprobado_en" timestamp with time zone,
	"aprobado_rol" text,
	"aprobado_fuera" text,
	"requiere_recursos" boolean DEFAULT false NOT NULL,
	"nota_recursos" text,
	"similares" boolean,
	"similares_detalle" text,
	"cambios" jsonb,
	"criterios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"criterio_otro" text,
	"indicador_eficacia_id" bigint,
	"fecha_evaluacion" date,
	"cierre_previsto" timestamp with time zone,
	"verificada_por" bigint,
	"verificada_en" timestamp with time zone,
	"verificacion_metodos" jsonb,
	"verificacion_nota" text,
	"evaluada_por" bigint,
	"evaluada_en" timestamp with time zone,
	"resultado" text,
	"evaluacion_desde" date,
	"evaluacion_hasta" date,
	"evaluacion_criterios" jsonb,
	"evaluacion_justificacion" text,
	CONSTRAINT "mejora_rondas_numero_unico" UNIQUE("hallazgo_id","numero"),
	CONSTRAINT "mejora_rondas_estado_plan_valido" CHECK ("mejora_rondas"."estado_plan" IN ('borrador', 'enviado', 'aprobado')),
	CONSTRAINT "mejora_rondas_aprobado_rol_valido" CHECK ("mejora_rondas"."aprobado_rol" IN ('admin_sgc', 'gerencia')),
	CONSTRAINT "mejora_rondas_resultado_valido" CHECK ("mejora_rondas"."resultado" IN ('eficaz', 'no_eficaz'))
);
--> statement-breakpoint
CREATE TABLE "mejora_seguimientos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mejora_seguimientos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"hallazgo_id" bigint NOT NULL,
	"actividad_id" bigint NOT NULL,
	"fecha" date NOT NULL,
	"realizado" text NOT NULL,
	"avance" integer NOT NULL,
	"barreras" text,
	"registrado_por" bigint NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mejora_seguimientos_avance_valido" CHECK ("mejora_seguimientos"."avance" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_rol_valido";--> statement-breakpoint
ALTER TABLE "archivos" DROP CONSTRAINT "archivos_contexto_valido";--> statement-breakpoint
ALTER TABLE "firmas" DROP CONSTRAINT "firmas_firma_valida";--> statement-breakpoint
ALTER TABLE "firmas" DROP CONSTRAINT "firmas_tramite_coherente";--> statement-breakpoint
ALTER TABLE "firmas" ADD COLUMN "mejora_hallazgo_id" bigint;--> statement-breakpoint
ALTER TABLE "dias_no_habiles" ADD CONSTRAINT "dias_no_habiles_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_accion_causas" ADD CONSTRAINT "mejora_accion_causas_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_accion_causas" ADD CONSTRAINT "mejora_accion_causas_accion_id_mejora_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."mejora_acciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_accion_causas" ADD CONSTRAINT "mejora_accion_causas_causa_id_mejora_causas_id_fk" FOREIGN KEY ("causa_id") REFERENCES "public"."mejora_causas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_acciones" ADD CONSTRAINT "mejora_acciones_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_acciones" ADD CONSTRAINT "mejora_acciones_ronda_id_mejora_rondas_id_fk" FOREIGN KEY ("ronda_id") REFERENCES "public"."mejora_rondas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividades" ADD CONSTRAINT "mejora_actividades_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividades" ADD CONSTRAINT "mejora_actividades_accion_id_mejora_acciones_id_fk" FOREIGN KEY ("accion_id") REFERENCES "public"."mejora_acciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividades" ADD CONSTRAINT "mejora_actividades_responsable_id_usuarios_id_fk" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_actividades" ADD CONSTRAINT "mejora_actividades_terminada_por_usuarios_id_fk" FOREIGN KEY ("terminada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ajustes" ADD CONSTRAINT "mejora_ajustes_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ajustes" ADD CONSTRAINT "mejora_ajustes_ronda_id_mejora_rondas_id_fk" FOREIGN KEY ("ronda_id") REFERENCES "public"."mejora_rondas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ajustes" ADD CONSTRAINT "mejora_ajustes_actividad_id_mejora_actividades_id_fk" FOREIGN KEY ("actividad_id") REFERENCES "public"."mejora_actividades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ajustes" ADD CONSTRAINT "mejora_ajustes_pedido_por_usuarios_id_fk" FOREIGN KEY ("pedido_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ajustes" ADD CONSTRAINT "mejora_ajustes_decidido_por_usuarios_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_analisis" ADD CONSTRAINT "mejora_analisis_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_analisis" ADD CONSTRAINT "mejora_analisis_ronda_id_mejora_rondas_id_fk" FOREIGN KEY ("ronda_id") REFERENCES "public"."mejora_rondas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_causas" ADD CONSTRAINT "mejora_causas_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_causas" ADD CONSTRAINT "mejora_causas_ronda_id_mejora_rondas_id_fk" FOREIGN KEY ("ronda_id") REFERENCES "public"."mejora_rondas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_eventos" ADD CONSTRAINT "mejora_eventos_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_eventos" ADD CONSTRAINT "mejora_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_subproceso_id_subprocesos_id_fk" FOREIGN KEY ("subproceso_id") REFERENCES "public"."subprocesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_requisito_norma_id_normas_id_fk" FOREIGN KEY ("requisito_norma_id") REFERENCES "public"."normas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_requisito_documento_id_documentos_id_fk" FOREIGN KEY ("requisito_documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_indicador_id_indicadores_id_fk" FOREIGN KEY ("indicador_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_medicion_id_mediciones_id_fk" FOREIGN KEY ("medicion_id") REFERENCES "public"."mediciones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_reincidente_de_mejora_hallazgos_id_fk" FOREIGN KEY ("reincidente_de") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_derivado_de_mejora_hallazgos_id_fk" FOREIGN KEY ("derivado_de") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_correccion_responsable_id_usuarios_id_fk" FOREIGN KEY ("correccion_responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_correccion_registrada_por_usuarios_id_fk" FOREIGN KEY ("correccion_registrada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_accion_decidida_por_usuarios_id_fk" FOREIGN KEY ("accion_decidida_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_validada_por_usuarios_id_fk" FOREIGN KEY ("validada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_respuesta_ente_por_usuarios_id_fk" FOREIGN KEY ("respuesta_ente_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_hallazgos" ADD CONSTRAINT "mejora_hallazgos_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ocurrencias" ADD CONSTRAINT "mejora_ocurrencias_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ocurrencias" ADD CONSTRAINT "mejora_ocurrencias_reporte_id_mejora_reportes_id_fk" FOREIGN KEY ("reporte_id") REFERENCES "public"."mejora_reportes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_ocurrencias" ADD CONSTRAINT "mejora_ocurrencias_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reporte_eventos" ADD CONSTRAINT "mejora_reporte_eventos_reporte_id_mejora_reportes_id_fk" FOREIGN KEY ("reporte_id") REFERENCES "public"."mejora_reportes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reporte_eventos" ADD CONSTRAINT "mejora_reporte_eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD CONSTRAINT "mejora_reportes_reportado_por_usuarios_id_fk" FOREIGN KEY ("reportado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD CONSTRAINT "mejora_reportes_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD CONSTRAINT "mejora_reportes_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_reportes" ADD CONSTRAINT "mejora_reportes_clasificado_por_usuarios_id_fk" FOREIGN KEY ("clasificado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_rondas" ADD CONSTRAINT "mejora_rondas_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_rondas" ADD CONSTRAINT "mejora_rondas_elaborado_por_usuarios_id_fk" FOREIGN KEY ("elaborado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_rondas" ADD CONSTRAINT "mejora_rondas_revisado_por_usuarios_id_fk" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_rondas" ADD CONSTRAINT "mejora_rondas_aprobado_por_usuarios_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_rondas" ADD CONSTRAINT "mejora_rondas_indicador_eficacia_id_indicadores_id_fk" FOREIGN KEY ("indicador_eficacia_id") REFERENCES "public"."indicadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_rondas" ADD CONSTRAINT "mejora_rondas_verificada_por_usuarios_id_fk" FOREIGN KEY ("verificada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_rondas" ADD CONSTRAINT "mejora_rondas_evaluada_por_usuarios_id_fk" FOREIGN KEY ("evaluada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_seguimientos" ADD CONSTRAINT "mejora_seguimientos_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_seguimientos" ADD CONSTRAINT "mejora_seguimientos_actividad_id_mejora_actividades_id_fk" FOREIGN KEY ("actividad_id") REFERENCES "public"."mejora_actividades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mejora_seguimientos" ADD CONSTRAINT "mejora_seguimientos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mejora_actividades_responsable_estado_idx" ON "mejora_actividades" USING btree ("responsable_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "mejora_ajustes_un_pendiente_idx" ON "mejora_ajustes" USING btree ("actividad_id") WHERE estado = 'pendiente';--> statement-breakpoint
CREATE INDEX "mejora_eventos_hallazgo_idx" ON "mejora_eventos" USING btree ("hallazgo_id","creado_en");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_proceso_estado_idx" ON "mejora_hallazgos" USING btree ("proceso_id","estado");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_estado_vence_idx" ON "mejora_hallazgos" USING btree ("estado","vence_en");--> statement-breakpoint
CREATE INDEX "mejora_reporte_eventos_reporte_idx" ON "mejora_reporte_eventos" USING btree ("reporte_id","creado_en");--> statement-breakpoint
CREATE INDEX "mejora_seguimientos_actividad_idx" ON "mejora_seguimientos" USING btree ("actividad_id","fecha");--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_mejora_hallazgo_id_mejora_hallazgos_id_fk" FOREIGN KEY ("mejora_hallazgo_id") REFERENCES "public"."mejora_hallazgos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "firmas_mejora_hallazgo_idx" ON "firmas" USING btree ("mejora_hallazgo_id");--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_rol_valido" CHECK ("archivos"."rol" IN ('principal', 'editable', 'anexo', 'acta_aprobacion', 'acta_eliminacion', 'evidencia', 'correccion', 'carga', 'analisis', 'verificacion'));--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_contexto_valido" CHECK ("archivos"."contexto" IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo', 'medicion', 'reporte_externo', 'importacion_indicadores', 'dato_compartido', 'mejora_hallazgo', 'mejora_ronda', 'mejora_actividad', 'mejora_reporte'));--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_firma_valida" CHECK ("firmas"."firma" IN ('elaboro', 'reviso', 'aprobo', 'publico', 'ratifico', 'adopto', 'verifico', 'cerro'));--> statement-breakpoint
ALTER TABLE "firmas" ADD CONSTRAINT "firmas_tramite_coherente" CHECK ("firmas"."tramite_id" IS NOT NULL OR "firmas"."firma" IN ('ratifico', 'adopto') OR "firmas"."indicador_version_id" IS NOT NULL OR "firmas"."mejora_hallazgo_id" IS NOT NULL);--> statement-breakpoint
CREATE INDEX "mejora_accion_causas_hallazgo_idx" ON "mejora_accion_causas" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_acciones_hallazgo_idx" ON "mejora_acciones" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_acciones_ronda_idx" ON "mejora_acciones" USING btree ("ronda_id");--> statement-breakpoint
CREATE INDEX "mejora_actividades_hallazgo_idx" ON "mejora_actividades" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_actividades_accion_idx" ON "mejora_actividades" USING btree ("accion_id");--> statement-breakpoint
CREATE INDEX "mejora_ajustes_hallazgo_idx" ON "mejora_ajustes" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_ajustes_ronda_idx" ON "mejora_ajustes" USING btree ("ronda_id");--> statement-breakpoint
CREATE INDEX "mejora_analisis_hallazgo_idx" ON "mejora_analisis" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_analisis_ronda_idx" ON "mejora_analisis" USING btree ("ronda_id");--> statement-breakpoint
CREATE INDEX "mejora_causas_hallazgo_idx" ON "mejora_causas" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_causas_ronda_idx" ON "mejora_causas" USING btree ("ronda_id");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_registrado_por_idx" ON "mejora_hallazgos" USING btree ("registrado_por");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_indicador_idx" ON "mejora_hallazgos" USING btree ("indicador_id");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_medicion_idx" ON "mejora_hallazgos" USING btree ("medicion_id");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_requisito_norma_idx" ON "mejora_hallazgos" USING btree ("requisito_norma_id");--> statement-breakpoint
CREATE INDEX "mejora_hallazgos_documento_idx" ON "mejora_hallazgos" USING btree ("documento_id");--> statement-breakpoint
CREATE INDEX "mejora_ocurrencias_hallazgo_idx" ON "mejora_ocurrencias" USING btree ("hallazgo_id");--> statement-breakpoint
CREATE INDEX "mejora_reportes_estado_vence_idx" ON "mejora_reportes" USING btree ("estado","vence_en");--> statement-breakpoint
CREATE INDEX "mejora_reportes_reportado_por_idx" ON "mejora_reportes" USING btree ("reportado_por");--> statement-breakpoint
CREATE INDEX "mejora_rondas_indicador_eficacia_idx" ON "mejora_rondas" USING btree ("indicador_eficacia_id");--> statement-breakpoint
CREATE INDEX "mejora_seguimientos_hallazgo_registrado_por_idx" ON "mejora_seguimientos" USING btree ("hallazgo_id","registrado_por");--> statement-breakpoint
CREATE TRIGGER mejora_eventos_inmutable BEFORE UPDATE OR DELETE ON "mejora_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER mejora_seguimientos_inmutable BEFORE UPDATE OR DELETE ON "mejora_seguimientos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER mejora_ocurrencias_inmutable BEFORE UPDATE OR DELETE ON "mejora_ocurrencias" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE TRIGGER mejora_reporte_eventos_inmutable BEFORE UPDATE OR DELETE ON "mejora_reporte_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sgc_impedir_si_hallazgo_terminado() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_hallazgo text;
BEGIN
  IF TG_TABLE_NAME = 'mejora_hallazgos' THEN
    IF OLD.estado IN ('cerrado', 'rechazado', 'anulado') THEN
      RAISE EXCEPTION 'El hallazgo % ya terminó y no admite cambios (%)', OLD.id, TG_OP
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- El hallazgo del que sale la fila (UPDATE, DELETE) y al que llega (INSERT, UPDATE). FOR SHARE serializa contra el
    -- acto que lo termina: ese acto espera a esta escritura, o esta ve el hallazgo terminado.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT estado INTO estado_hallazgo FROM mejora_hallazgos WHERE id = OLD.hallazgo_id FOR SHARE;
      IF estado_hallazgo IN ('cerrado', 'rechazado', 'anulado') THEN
        RAISE EXCEPTION 'El hallazgo % ya terminó y no admite cambios en % (%)', OLD.hallazgo_id, TG_TABLE_NAME, TG_OP
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      SELECT estado INTO estado_hallazgo FROM mejora_hallazgos WHERE id = NEW.hallazgo_id FOR SHARE;
      IF estado_hallazgo IN ('cerrado', 'rechazado', 'anulado') THEN
        RAISE EXCEPTION 'El hallazgo % ya terminó y no admite cambios en % (%)', NEW.hallazgo_id, TG_TABLE_NAME, TG_OP
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER mejora_hallazgos_terminado_inmutable BEFORE UPDATE OR DELETE ON "mejora_hallazgos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_rondas_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_rondas" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_analisis_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_analisis" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_causas_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_causas" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_acciones_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_acciones" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_accion_causas_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_accion_causas" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_actividades_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_actividades" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_ajustes_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON "mejora_ajustes" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_eventos_hallazgo_terminado BEFORE INSERT ON "mejora_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_seguimientos_hallazgo_terminado BEFORE INSERT ON "mejora_seguimientos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
CREATE TRIGGER mejora_ocurrencias_hallazgo_terminado BEFORE INSERT ON "mejora_ocurrencias" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();--> statement-breakpoint
INSERT INTO "configuracion" ("clave", "valor") VALUES
	('mej_plazo_clasificar_dias', '3'),
	('mej_plazo_aceptar_dias', '3'),
	('mej_plazo_decision_dias', '3'),
	('mej_plazo_correccion_dias', '3'),
	('mej_plazo_formular_dias', '10'),
	('mej_plazo_reenviar_dias', '5'),
	('mej_plazo_revisar_dias', '3'),
	('mej_plazo_aprobar_dias', '3'),
	('mej_plazo_verificar_dias', '5'),
	('mej_plazo_evaluar_dias', '5'),
	('mej_recordatorio_alta_dias', '15'),
	('mej_recordatorio_dias', '30'),
	('mej_formato_registro_documento_id', ''),
	('mej_formato_porques_documento_id', ''),
	('mej_formato_ishikawa_documento_id', '')
ON CONFLICT ("clave") DO NOTHING;