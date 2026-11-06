CREATE INDEX "auditoria_cambios_codigo_idx" ON "auditoria" USING btree ("entidad","accion") WHERE accion IN ('editar_control', 'editar_documento');--> statement-breakpoint
CREATE INDEX "tramite_eventos_codigo_corregido_idx" ON "tramite_eventos" USING btree ((detalle -> 'antes' ->> 'codigo')) WHERE tipo = 'corregir_datos';--> statement-breakpoint
INSERT INTO "lista_verificacion_items" ("texto", "critico", "orden")
SELECT v.texto, v.critico, v.orden
FROM (VALUES
	('Usa la plantilla vigente de su tipo', true, 1),
	('Código, versión y fecha en el encabezado', true, 2),
	('Tiene todas las secciones obligatorias', true, 3),
	('Es coherente con los demás documentos del SGC', false, 4),
	('Cumple los requisitos de ISO 9001:2015 que le aplican', false, 5),
	('Es aplicable a una institución de primer nivel', false, 6),
	('Cita la normativa vigente que le aplica', false, 7),
	('Define los registros que genera y su archivo', false, 8)
) AS v(texto, critico, orden)
WHERE NOT EXISTS (SELECT 1 FROM "lista_verificacion_items");
