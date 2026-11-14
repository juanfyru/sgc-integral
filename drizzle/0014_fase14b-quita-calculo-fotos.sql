DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM calculo_fotos) THEN
    RAISE EXCEPTION 'Las tablas de la 14B tienen filas: la migración no las rehace';
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "calculo_fotos" CASCADE;