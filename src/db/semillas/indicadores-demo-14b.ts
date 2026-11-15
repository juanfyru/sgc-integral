/**
 * El final de la siembra de los indicadores, desde la 14B (anexo §11), a la hora de la siembra y por las funciones del
 * dominio: la pasada de fotos de esa hora (`tomarFotos`, como la de vencimientos al abrir la aplicación), el análisis del
 * mes de conformidad y las constancias de envío al ente de `CEX-IND-01`.
 *
 * - **Las fotos:** las que la historia no tomó (las del mes de conformidad y de «Reportes a tiempo», y la de `SGC-IND-03`
 *   si su hora no llegó). `tomarFotos` registra y salta la que falla: aquí se comprueba lo que dejó, como `reportarPeriodo`.
 * - **Conformidad:** el mes anterior sale en «Crítico» (Farmacia conforme y Urgencias no: 1 de 2, 50 % frente a 90) y la
 *   coordinadora lo analiza a la misma hora, con su causa y su acción, para que la demo lo muestre ya analizado. Sin el
 *   análisis tampoco nacería vencido: si la siembra toma la foto después de la fecha límite del mes, la foto la cuenta otra
 *   vez desde ella (`laFotoMueveElPlazo`).
 * - **Constancias:** nacen las de los trimestres terminados desde que `CEX-IND-01` se reporta (`asegurarConstancias`) y
 *   `lider.cex` registra la de `constanciasDeLaDemo` con su radicado y un PDF de soporte. `registrarArchivo` no recibe la
 *   hora (escribe el evento `soporte` con la del reloj): el registro va después, también con la hora del reloj, para que el
 *   historial no diga que se registró antes de subir el soporte. Las demás quedan pendientes; al menos una, vencida.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";
import { resolverRutaAlmacen } from "../../lib/almacen";
import { zonaHoraria } from "../../lib/zona-horaria";
import { registrarArchivo } from "../consultas/admin";
import type { SesionFlujo } from "../consultas/flujo/contrato";
import { analizar } from "../consultas/indicadores/analisis";
import { asegurarConstancias, registrarConstancia } from "../consultas/indicadores/constancias";
import { tomarFotos } from "../consultas/indicadores/fotos";
import { generarPlaceholder } from "../placeholders";
import { calendarioDeIndicadores, constanciasDeLaDemo, type CalendarioDeIndicadores } from "./indicadores-demo-agenda";
import { CEX_01, SGC_03, SGC_CONFORMIDAD, SGC_REPORTES } from "./indicadores-demo-fichas";

export async function sembrarFinalDe14B(sql: Sql, quien: { coordinadora: SesionFlujo; liderCex: SesionFlujo }, ahora: Date): Promise<void> {
  const cal = calendarioDeIndicadores(ahora, zonaHoraria());
  await tomarFotos({ sql, ahora });
  await comprobarFotos(sql, cal, ahora);
  await analizarConformidad(sql, quien.coordinadora, cal, ahora);
  await sembrarConstancias(sql, quien.liderCex, ahora);
}

const idDe = async (sql: Sql, codigo: string): Promise<number> => {
  const [i] = await sql`SELECT id FROM indicadores WHERE codigo = ${codigo}`;
  if (!i) throw new Error(`La semilla no creó ${codigo}`);
  return Number(i.id);
};

/** Lo que la pasada debe haber dejado; si no, la semilla no sigue. */
async function comprobarFotos(sql: Sql, cal: CalendarioDeIndicadores, ahora: Date): Promise<void> {
  const unaDe = async (codigo: string, periodo: string) => {
    const [m] = await sql`SELECT foto_en, semaforo FROM mediciones WHERE indicador_id = ${await idDe(sql, codigo)} AND periodo = ${periodo}`;
    return m;
  };
  const exigir = async (codigo: string, periodo: string, semaforo: string) => {
    const m = await unaDe(codigo, periodo);
    if (!m?.foto_en || m.semaforo !== semaforo) throw new Error(`${codigo} ${periodo}: la foto debía quedar en ${semaforo} y quedó ${m?.foto_en ? m.semaforo : "sin foto"}`);
  };
  await exigir(SGC_03.codigo, cal.semestreAutomatico.clave, cal.sgc03.esperado);
  await exigir(SGC_CONFORMIDAD.codigo, cal.mesAnterior.clave, "critico");

  // «Reportes a tiempo»: lo que pasó su plazo ya tiene foto (al menos un «No aplica»); al menos un mes la sigue esperando.
  const meses = await sql`SELECT periodo, vence_en, foto_en, no_aplica FROM mediciones
    WHERE indicador_id = ${await idDe(sql, SGC_REPORTES.codigo)} ORDER BY desde`;
  const sinFoto = meses.filter((m) => m.foto_en === null && new Date(m.vence_en as Date).getTime() < ahora.getTime());
  if (sinFoto.length > 0) throw new Error(`${SGC_REPORTES.codigo}: quedaron sin foto ${sinFoto.map((m) => m.periodo).join(", ")}`);
  if (!meses.some((m) => m.no_aplica === true)) throw new Error(`${SGC_REPORTES.codigo}: ningún mes quedó «No aplica»`);
  if (!meses.some((m) => m.foto_en === null)) throw new Error(`${SGC_REPORTES.codigo}: ningún mes quedó en «Falta un dato»`);
}

/** La coordinadora analiza el «Crítico» del mes de conformidad: la causa es el hallazgo de Urgencias (`distribucion-demo.ts`). */
async function analizarConformidad(sql: Sql, coordinadora: SesionFlujo, cal: CalendarioDeIndicadores, ahora: Date): Promise<void> {
  const [m] = await sql`SELECT id FROM mediciones WHERE indicador_id = ${await idDe(sql, SGC_CONFORMIDAD.codigo)} AND periodo = ${cal.mesAnterior.clave}`;
  await analizar(
    coordinadora,
    {
      medicionId: Number(m.id),
      causa:
        "La verificación de Urgencias encontró una copia no controlada de AIN-FO-01 en el servicio: de los dos puntos verificados, solo Farmacia estaba conforme.",
      accionPropuesta:
        "Recoger la copia no controlada, emitir a Urgencias la copia controlada vigente y verificar en el mes los cinco puntos de uso que aún no tienen verificación.",
    },
    { sql, ahora },
  );
}

/** Las constancias de `CEX-IND-01`: las que nacen a la hora de la siembra y la registrada, con su soporte (ver el encabezado). */
async function sembrarConstancias(sql: Sql, liderCex: SesionFlujo, ahora: Date): Promise<void> {
  const indicadorId = await idDe(sql, CEX_01.codigo);
  const plan = constanciasDeLaDemo(ahora, zonaHoraria());
  await asegurarConstancias({ sql, ahora, indicadorId });
  const nacidas = await sql`SELECT id, periodo, vence_en FROM reportes_externos WHERE indicador_id = ${indicadorId} ORDER BY hasta`;
  const esperadas = plan.periodos.map((p) => `${p.clave} (${p.vence.toISOString()})`).join(", ");
  const quedaron = nacidas.map((c) => `${c.periodo} (${new Date(c.vence_en as Date).toISOString()})`).join(", ");
  if (quedaron !== esperadas) throw new Error(`Las constancias de ${CEX_01.codigo} debían ser ${esperadas} y son ${quedaron}`);
  const reporteId = Number(nacidas.find((c) => c.periodo === plan.registrada)!.id);

  const [{ valor: entidad }] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombre_entidad'`;
  const contenido = await generarPlaceholder({
    codigo: CEX_01.codigo,
    titulo: `Constancia de envío al ${CEX_01.ente}, ${plan.registrada}`,
    numeroVersion: 1,
    ext: "pdf",
    entidad,
  });
  const ruta = `reportes-externos/${reporteId}/constancia-${plan.registrada}.pdf`;
  const destino = resolverRutaAlmacen(ruta);
  if (!destino) throw new Error(`Ruta de almacén inválida: ${ruta}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, contenido);
  await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      contexto: "reporte_externo",
      contextoId: reporteId,
      ruta,
      nombreOriginal: `Constancia de envío ${CEX_01.codigo} ${plan.registrada}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: contenido.length,
      hashSha256: createHash("sha256").update(contenido).digest("hex"),
    },
    liderCex.usuarioId,
    { sql },
  );
  await registrarConstancia(
    liderCex,
    {
      reporteId,
      fechaEnvio: plan.fechaEnvio,
      radicado: plan.radicado,
      nota: "Reporte trimestral de la oportunidad de la cita de medicina general, enviado por la plataforma del Ministerio.",
    },
    { sql, ahora: new Date() },
  );
}
