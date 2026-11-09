/**
 * Ayudantes de los tests del normograma (Fase 13C). Corren dentro de una transacción que se revierte: las normas
 * que crean no sobreviven al test.
 */
import type { TransactionSql } from "postgres";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { crearNorma, type DatosNorma } from "@/db/consultas/normograma/normas";

let consecutivo = 0;

/** El id de un tipo de norma por su nombre (la migración 0009 siembra los nueve; ningún test supone un id fijo). */
export async function tipoNormaId(tx: TransactionSql, nombre = "Resolución"): Promise<number> {
  const [t] = await tx`SELECT id FROM tipos_norma WHERE lower(nombre) = lower(${nombre})`;
  if (!t) throw new Error(`No existe el tipo de norma «${nombre}»`);
  return Number(t.id);
}

/**
 * Una norma vigente creada con `crearNorma` por `admin`: una Resolución de 2020 con un número único por corrida
 * (`zz_<instante>_<n>`), que no choca con lo que haya en la demo ni con otra del mismo test.
 */
export async function normaDePrueba(
  tx: TransactionSql,
  admin: SesionFlujo,
  d?: Partial<DatosNorma>,
): Promise<{ id: number; nombre: string }> {
  consecutivo += 1;
  const datos: DatosNorma = {
    tipoNormaId: d?.tipoNormaId ?? (await tipoNormaId(tx)),
    numero: `zz_${Date.now()}_${consecutivo}`,
    anio: 2020,
    fechaExpedicion: null,
    entidadEmisora: "Ministerio de Salud y Protección Social",
    titulo: `Norma de prueba ${consecutivo}`,
    tema: null,
    enlaceOficial: null,
    notas: null,
    ...d,
  };
  const { id } = await crearNorma(admin, datos, { sql: tx });
  const [n] = await tx`SELECT concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre
    FROM normas n JOIN tipos_norma tn ON tn.id = n.tipo_norma_id WHERE n.id = ${id}`;
  return { id, nombre: n.nombre as string };
}

/**
 * Marca como avisados y escalados los impactos pendientes que ya hay en la base: la pasada de impactos vencidos los
 * recorre todos y el test cuenta solo los suyos. Se llama antes de crear los impactos del test (la Tarea 9 lo usa al
 * sumar la pasada a `revisarVencimientosDeVigencia`).
 */
export async function silenciarImpactos(tx: TransactionSql): Promise<void> {
  await tx`UPDATE impactos_normativos SET aviso_vencido_en = now(), escalado_en = now()
    WHERE estado = 'pendiente' AND (aviso_vencido_en IS NULL OR escalado_en IS NULL)`;
}
