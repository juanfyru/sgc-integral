/**
 * La base de los tests es la de las pruebas a mano: después de recorrer la demostración, sus
 * documentos y trámites ya no están como se sembraron. Lo que un test afirma de la historia
 * sembrada se filtra a lo sembrado (`sembradaEn`); lo que afirma del estado actual de la demo pasa
 * por `exigirDemo`. Justo después de `npm run db:seed`, `SEMILLA_RECIEN=1 npm test` corre todos los
 * casos: con esa variable, un caso que se saltaría falla.
 */
import type { TestContext } from "vitest";
import type { Cliente } from "@/db/cliente";

/** El instante de la siembra: un paso sembrado es anterior; uno hecho después de usar la demo, posterior. */
export async function sembradaEn(sql: Cliente): Promise<Date> {
  const [u] = await sql`SELECT creado_en FROM usuarios WHERE usuario = 'gerente'`;
  return u.creado_en;
}

/** Salta el caso, con su motivo, si la demo ya no cumple lo que el caso necesita. */
export function exigirDemo(ctx: TestContext, cumple: boolean, motivo: string): void {
  if (cumple) return;
  if (process.env.SEMILLA_RECIEN === "1") throw new Error(`SEMILLA_RECIEN=1, pero ${motivo}`);
  const mensaje = `La demo ya se usó: ${motivo}. Resiembre para correr este caso.`;
  console.warn(mensaje);                                                 // el reporte por defecto no muestra la nota del salto
  ctx.skip(mensaje);
}

/**
 * La demostración cierra la carga de documentos ya aprobados. Quien la usa la abre y, con la
 * función que recibe, la deja como estaba: esa fila no se revierte con el test.
 */
export async function abrirCarga(sql: Cliente): Promise<() => Promise<void>> {
  const [{ valor }] = await sql`SELECT valor FROM configuracion WHERE clave = 'publicacion_directa'`;
  await sql`UPDATE configuracion SET valor = '1' WHERE clave = 'publicacion_directa'`;
  return async () => {
    await sql`UPDATE configuracion SET valor = ${valor} WHERE clave = 'publicacion_directa'`;
  };
}

const ETAPAS_SEMBRADAS = ["publicado", "revision", "publicacion", "aceptacion", "visto_bueno"];

/** Los totales de la demo solo valen si nadie creó documentos ni trámites ni avanzó los sembrados. */
export async function exigirDemoIntacta(ctx: TestContext, sql: Cliente): Promise<void> {
  const [{ documentos }] = await sql`SELECT count(*)::int AS documentos FROM documentos`;
  const tramites = await sql`SELECT etapa FROM tramites ORDER BY id`;
  const etapas = tramites.map((t) => t.etapa as string);
  const iguales = etapas.length === ETAPAS_SEMBRADAS.length && etapas.every((e, i) => e === ETAPAS_SEMBRADAS[i]);
  exigirDemo(ctx, documentos === 30 && iguales, `hay ${documentos} documentos y ${etapas.length} trámites, o los sembrados avanzaron`);
}
