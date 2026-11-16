/**
 * El final de la siembra de los indicadores, desde la 14C (anexo §10), a la hora de la siembra y por las funciones del
 * dominio: la pasada de esa hora (lo que haría la primera lectura) y el soporte del dato compartido.
 *
 * - **La pasada:** abre los periodos del dato que falten (el pendiente, si ningún paso de la historia lo pidió: entonces se
 *   pide desde hoy y no nace vencido), las mediciones terminadas y propaga. Después de ella, una lectura de la aplicación no
 *   tiene nada que abrir ni que propagar (lo comprueba `tests/semilla-indicadores-14c.test.ts`).
 * - **El soporte:** `consulta` sube un PDF al periodo `conSoporte` del plan (reportado y sin cerrar). `registrarArchivo` no
 *   recibe la hora (escribe el evento `soporte` con la del reloj), como el de la constancia de la 14B.
 * - **Lo que debe quedar** (`comprobar`): si algo no quedó, la semilla no sigue.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";
import { resolverRutaAlmacen } from "../../lib/almacen";
import { zonaHoraria } from "../../lib/zona-horaria";
import { registrarArchivo } from "../consultas/admin";
import type { SesionFlujo } from "../consultas/flujo/contrato";
import { asegurarPeriodosDeDatos } from "../consultas/indicadores/datos-periodos";
import { asegurarMediciones } from "../consultas/indicadores/mediciones";
import { propagar } from "../consultas/indicadores/propagacion";
import { generarPlaceholder } from "../placeholders";
import { calendarioDeIndicadores, planDe14C } from "./indicadores-demo-agenda";
import {
  CEX_AGENDA,
  CEX_CONSULTAS_TRIMESTRE,
  DATO_CONSULTAS,
  SGC_INDICE,
  SGC_INDICE_RESTRINGIDO,
} from "./indicadores-demo-fichas";

export async function sembrarFinalDe14C(sql: Sql, quien: { consulta: SesionFlujo }, ahora: Date): Promise<void> {
  await asegurarPeriodosDeDatos({ sql, ahora });
  await asegurarMediciones({ sql, ahora });
  const r = await propagar({ sql, ahora });
  if (r.fallidas > 0) throw new Error(`La propagación de la hora de la siembra falló en ${r.fallidas} mediciones`);
  await subirSoporte(sql, quien.consulta, ahora);
  await comprobar(sql, ahora);
}

const datoId = async (sql: Sql): Promise<number> => {
  const [d] = await sql`SELECT id FROM variables_compartidas WHERE nombre = ${DATO_CONSULTAS.nombre}`;
  if (!d) throw new Error(`La semilla no creó el dato «${DATO_CONSULTAS.nombre}»`);
  return Number(d.id);
};

/** El soporte del periodo `conSoporte`: el consolidado del RIPS de ese mes, en PDF. */
async function subirSoporte(sql: Sql, consulta: SesionFlujo, ahora: Date): Promise<void> {
  const plan = planDe14C(ahora, zonaHoraria());
  const [p] = await sql`SELECT id, estado FROM variable_valores WHERE variable_id = ${await datoId(sql)} AND periodo = ${plan.conSoporte.clave}`;
  if (!p || p.estado !== "reportado") throw new Error(`El periodo ${plan.conSoporte.clave} del dato debía estar reportado para subirle el soporte`);
  const periodoId = Number(p.id);
  const [{ valor: entidad }] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombre_entidad'`;
  const contenido = await generarPlaceholder({
    codigo: "RIPS",
    titulo: `Consolidado de consultas de medicina general, ${plan.conSoporte.etiqueta}`,
    numeroVersion: 1,
    ext: "pdf",
    entidad,
  });
  const ruta = `datos-compartidos/${periodoId}/consolidado-rips-${plan.conSoporte.clave}.pdf`;
  const destino = resolverRutaAlmacen(ruta);
  if (!destino) throw new Error(`Ruta de almacén inválida: ${ruta}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, contenido);
  await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      contexto: "dato_compartido",
      contextoId: periodoId,
      ruta,
      nombreOriginal: `Consolidado RIPS de medicina general ${plan.conSoporte.clave}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: contenido.length,
      hashSha256: createHash("sha256").update(contenido).digest("hex"),
    },
    consulta.usuarioId,
    { sql },
  );
}

/**
 * Lo que la demo de la 14C debe dejar: el pendiente en plazo, el mes corregido cerrado, y con resultado el uso de la agenda
 * en ese mes, las consultas del trimestre en el trimestre completo y los dos compuestos en el último trimestre sembrado.
 */
async function comprobar(sql: Sql, ahora: Date): Promise<void> {
  const zona = zonaHoraria();
  const plan = planDe14C(ahora, zona);
  const cal = calendarioDeIndicadores(ahora, zona);
  const periodos = new Map(
    (await sql`SELECT periodo, estado, vence_en FROM variable_valores WHERE variable_id = ${await datoId(sql)}`).map((f) => [f.periodo as string, f]),
  );
  const pendiente = periodos.get(plan.pendiente.clave);
  if (pendiente?.estado !== "pendiente" || new Date(pendiente.vence_en as Date).getTime() <= ahora.getTime()) {
    throw new Error(`El periodo ${plan.pendiente.clave} del dato debía quedar pendiente y en plazo`);
  }
  if (periodos.get(plan.corregido.clave)?.estado !== "cerrado") throw new Error(`El periodo ${plan.corregido.clave} del dato debía quedar cerrado`);

  const conResultado: [string, string][] = [
    [CEX_AGENDA.codigo, plan.corregido.clave],
    [CEX_CONSULTAS_TRIMESTRE.codigo, plan.trimestreCompleto.clave],
    [SGC_INDICE.codigo, cal.trimestres[2].clave],
    [SGC_INDICE_RESTRINGIDO.codigo, cal.trimestres[2].clave],
  ];
  for (const [codigo, periodo] of conResultado) {
    const [m] = await sql`SELECT m.resultado_exacto, m.semaforo FROM mediciones m JOIN indicadores i ON i.id = m.indicador_id
      WHERE i.codigo = ${codigo} AND m.periodo = ${periodo}`;
    if (!m?.resultado_exacto || m.semaforo !== "bien") throw new Error(`${codigo} ${periodo}: debía quedar calculado y en Bien`);
  }
}
