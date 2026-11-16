ALTER TABLE "indicadores" ADD COLUMN "soporte_obligatorio_desde" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mediciones" ADD COLUMN "debe_soporte" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- relleno 0017
UPDATE "indicadores" i SET "soporte_obligatorio_desde" = coalesce((
    SELECT a."creado_en" FROM "auditoria" a
    WHERE a."entidad" = 'indicador' AND a."entidad_id" = i."id" AND (
      (a."accion" = 'indicador_operacion'
        AND a."detalle" -> 'despues' ->> 'soporteObligatorio' = 'true'
        AND (a."detalle" -> 'antes' ->> 'soporteObligatorio') IS DISTINCT FROM 'true')
      OR (a."accion" = 'indicador_borrador_guardado'
        AND a."detalle" -> 'operacion' -> 'despues' ->> 'soporteObligatorio' = 'true'
        AND (a."detalle" -> 'operacion' -> 'antes' ->> 'soporteObligatorio') IS DISTINCT FROM 'true')
      OR (a."accion" = 'indicador_creado' AND a."detalle" -> 'operacion' ->> 'soporteObligatorio' = 'true'))
    ORDER BY a."creado_en" DESC, a."id" DESC LIMIT 1), i."creado_en")
  WHERE i."soporte_obligatorio";--> statement-breakpoint
-- relleno 0017
UPDATE "mediciones" m SET "debe_soporte" = true
  FROM "indicadores" i
  WHERE i."id" = m."indicador_id" AND i."soporte_obligatorio" AND m."estado" <> 'cerrada' AND NOT m."historica"
    AND NOT (
      coalesce((SELECT min(e."creado_en") FROM "medicion_eventos" e
          WHERE e."medicion_id" = m."id" AND e."tipo" IN ('reporte', 'no_aplica') AND e."usuario_id" IS NOT NULL),
        'infinity'::timestamptz) < i."soporte_obligatorio_desde"
      AND coalesce((SELECT (a."detalle" ->> 'venceAntes')::timestamptz FROM "medicion_eventos" a
          WHERE a."medicion_id" = m."id" AND a."detalle" ? 'venceAntes' ORDER BY a."id" LIMIT 1),
        m."vence_en") < i."soporte_obligatorio_desde");--> statement-breakpoint
ALTER TABLE "indicadores" ADD CONSTRAINT "indicadores_soporte_desde" CHECK (("indicadores"."soporte_obligatorio" AND "indicadores"."soporte_obligatorio_desde" IS NOT NULL) OR (NOT "indicadores"."soporte_obligatorio" AND "indicadores"."soporte_obligatorio_desde" IS NULL));
