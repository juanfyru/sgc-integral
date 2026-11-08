/**
 * La historia de la distribución de la demo (spec 13B §16): puntos de uso, listas, copias controladas en
 * cada estado, acuses de lectura, una jornada de socialización y dos verificaciones. Todo pasa por las
 * funciones reales, cada paso con la hora en que ocurrió, días atrás. Las dos únicas escrituras directas son
 * las que ninguna función real hace: la apertura previa del documento (`eventos_consulta`) y el plazo vencido
 * de un acuse (`acuses.vence_en`).
 *
 * Va en dos tiempos porque `emitirCopia` siempre emite la versión vigente: la copia de la v2 de `GTH-CA-01`
 * se emite antes de que la semilla de trámites publique la v3 (`sembrarDistribucionPrevia`), y lo demás
 * después, cuando la v3 ya es la vigente y sus acuses existen (`sembrarDistribucion`).
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";
import { resolverRutaAlmacen } from "../../lib/almacen";
import { fechaEnZona, fechaLimite } from "../../lib/tramites/plazos";
import { zonaHoraria } from "../../lib/zona-horaria";
import { registrarArchivo } from "../consultas/admin";
import type { SesionFlujo } from "../consultas/flujo/contrato";
import { confirmarLectura } from "../consultas/distribucion/acuses";
import { guardarAudiencia } from "../consultas/distribucion/audiencia";
import { anularCopia, emitirCopia } from "../consultas/distribucion/copias";
import { registrarJornada } from "../consultas/distribucion/jornadas";
import { crearLista } from "../consultas/distribucion/listas";
import { crearPuntoUso } from "../consultas/distribucion/puntos-uso";
import { alDejarDeSerVigente } from "../consultas/distribucion/version-vigencia";
import {
  abrirVerificacion,
  cerrarVerificacion,
  guardarAvance,
  type RespuestaDeItem,
} from "../consultas/distribucion/verificaciones";
import { generarPlaceholder } from "../placeholders";

export type ContextoDistribucion = {
  /** Id de cada usuario demo por su nombre de usuario. */
  usuarioPorNombre: Record<string, number>;
  documentoPorCodigo: Record<string, number>;
  procesoPorSigla: Record<string, number>;
};

const CODIGO = "GTH-CA-01";
const SEDE = "Sede principal";
const TODO_EL_HOSPITAL = "Todo el hospital";
const ITEM_COPIAS_NO_CONTROLADAS = "Sin copias no controladas (impresiones sin sello)";

/** La misma regla de `sembrarTramites`: ocho horas antes de que acabara el día de hace `dias` días. */
function momentoHace(dias: number): Date {
  return new Date(fechaLimite(new Date(), -dias, zonaHoraria()).getTime() - 8 * 3_600_000);
}

async function sesionDe(sql: Sql, usuario: string): Promise<SesionFlujo> {
  const [u] = await sql`SELECT id, usuario, nombre, rol, ver_historial FROM usuarios WHERE usuario = ${usuario}`;
  if (!u) throw new Error(`Usuario demo no encontrado: ${usuario}`);
  return {
    sesionId: `semilla-${u.id}`,
    usuarioId: Number(u.id),
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    verHistorial: u.ver_historial,
  };
}

/**
 * Antes de los trámites: los puntos, las listas, la audiencia de `GTH-CA-01` y la copia de su v2 en Archivo,
 * emitida diez días antes de que la semilla de trámites publique la v3 (hace 9 días).
 */
export async function sembrarDistribucionPrevia(sql: Sql, c: ContextoDistribucion): Promise<void> {
  console.log("Sembrando puntos de uso y listas de distribución…");
  const coordinadora = c.usuarioPorNombre["coordinadora.sgc"];

  const puntos: { nombre: string; ubicacion: string; responsable: string; proceso: string }[] = [
    { nombre: "Urgencias", ubicacion: "Estación de enfermería", responsable: "jefe.urgencias", proceso: "AIN" },
    { nombre: "Farmacia", ubicacion: "Oficina del regente", responsable: "regente.farmacia", proceso: "ATE" },
    { nombre: "Laboratorio", ubicacion: "Recepción de muestras", responsable: "consulta", proceso: "ADX" },
    { nombre: "Vacunación", ubicacion: "Sala de vacunación", responsable: "consulta", proceso: "PYM" },
    { nombre: "Odontología", ubicacion: "Consultorio odontológico", responsable: "lider.cex", proceso: "CEX" },
    { nombre: "Talento Humano", ubicacion: "Oficina de Talento Humano", responsable: "lider.gth", proceso: "GTH" },
    { nombre: "Archivo", ubicacion: "Archivo central", responsable: "coordinadora.sgc", proceso: "GDO" },
  ];
  for (const p of puntos) {
    await crearPuntoUso(
      {
        nombre: p.nombre,
        sede: SEDE,
        ubicacion: p.ubicacion,
        responsableId: c.usuarioPorNombre[p.responsable],
        procesoIds: [c.procesoPorSigla[p.proceso]],
      },
      coordinadora,
      { sql },
    );
  }

  const areas = await sql`SELECT id, nombre FROM areas ORDER BY orden`;
  const area = (nombre: string) => {
    const a = areas.find((f) => f.nombre === nombre);
    if (!a) throw new Error(`Área demo no encontrada: ${nombre}`);
    return Number(a.id);
  };
  const { id: todoElHospital } = await crearLista(
    {
      nombre: TODO_EL_HOSPITAL,
      descripcion: "Todas las áreas de la institución.",
      miembros: areas.map((a) => ({ tipo: "area" as const, referenciaId: Number(a.id) })),
    },
    coordinadora,
    { sql },
  );
  await crearLista(
    {
      nombre: "Personal asistencial",
      descripcion: "El personal de la Subgerencia Científica.",
      miembros: [{ tipo: "area", referenciaId: area("Subgerencia Científica") }],
    },
    coordinadora,
    { sql },
  );

  await guardarAudiencia(
    c.documentoPorCodigo[CODIGO],
    { listaIds: [todoElHospital], lecturaObligatoriaIngreso: true },
    coordinadora,
    { sql },
  );

  // La v2 aún es la vigente: esta copia queda «por recoger» cuando la semilla de trámites publica la v3.
  const [archivo] = await sql`SELECT id FROM puntos_uso WHERE nombre = 'Archivo'`;
  await emitirCopia(
    await sesionDe(sql, "coordinadora.sgc"),
    { documentoId: c.documentoPorCodigo[CODIGO], puntoUsoId: Number(archivo.id), nota: "Copia de consulta del archivo central" },
    { sql, ahora: momentoHace(19) },
  );
}

/** El PDF del acta de la jornada, en el almacén y registrado como evidencia suya. */
async function guardarActaDeJornada(sql: Sql, jornadaId: number, actorId: number, momento: Date): Promise<void> {
  const [{ valor: entidad }] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombre_entidad'`;
  const contenido = await generarPlaceholder({
    codigo: CODIGO,
    titulo: "Acta de socialización",
    numeroVersion: 3,
    ext: "pdf",
    entidad,
  });
  const ruta = `jornadas/${jornadaId}/acta-socializacion.pdf`;
  const destino = resolverRutaAlmacen(ruta);
  if (!destino) throw new Error(`Ruta de almacén inválida: ${ruta}`);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, contenido);
  await registrarArchivo(
    {
      versionId: null,
      rol: "evidencia",
      contexto: "jornada",
      contextoId: jornadaId,
      ruta,
      nombreOriginal: `Acta de socialización ${CODIGO} ${fechaEnZona(momento, zonaHoraria())}.pdf`,
      extension: "pdf",
      mime: "application/pdf",
      tamanoBytes: contenido.length,
      hashSha256: createHash("sha256").update(contenido).digest("hex"),
    },
    actorId,
    { sql },
  );
}

/** Abre, responde y cierra la verificación de un punto; `noConformes` mapea el texto de un ítem a su nota. */
async function verificar(
  sql: Sql,
  puntoId: number,
  ahora: Date,
  noConformes: Record<string, string> = {},
): Promise<void> {
  const verificador = await sesionDe(sql, "coordinadora.sgc");
  const { verificacionId } = await abrirVerificacion(verificador, puntoId, { sql, ahora });
  const items = await sql`SELECT id, texto FROM verificacion_items WHERE verificacion_id = ${verificacionId} ORDER BY orden`;
  const respuestas: RespuestaDeItem[] = items.map((i) => {
    const nota = noConformes[i.texto as string];
    return nota === undefined
      ? { itemId: Number(i.id), respuesta: "conforme", nota: null }
      : { itemId: Number(i.id), respuesta: "no_conforme", nota };
  });
  await guardarAvance(verificacionId, verificador, respuestas, { sql, ahora });
  await cerrarVerificacion(verificacionId, verificador, { sql, ahora });
}

/**
 * Después de los trámites, con la v3 de `GTH-CA-01` vigente y sus acuses creados al publicar: la copia de la v2
 * pasa a «por recoger», las copias de la v3, las lecturas, la jornada y las dos verificaciones, en orden cronológico.
 */
export async function sembrarDistribucion(sql: Sql, c: ContextoDistribucion): Promise<void> {
  console.log("Sembrando copias, acuses, jornada y verificaciones…");
  const documentoId = c.documentoPorCodigo[CODIGO];
  const coordinadora = await sesionDe(sql, "coordinadora.sgc");
  const liderGth = await sesionDe(sql, "lider.gth");
  const puntoDe = async (nombre: string) => Number((await sql`SELECT id FROM puntos_uso WHERE nombre = ${nombre}`)[0].id);

  // Verificación de Farmacia, cuando el punto aún no tenía copias.
  await verificar(sql, await puntoDe("Farmacia"), momentoHace(95));

  // Lo que hace la publicación de la v3 con las copias de la v2 (la semilla de trámites publica por SQL).
  const [v2] = await sql`SELECT id FROM documento_versiones WHERE documento_id = ${documentoId} AND numero = 2`;
  const [v3] = await sql`SELECT id, publicado_en FROM documento_versiones WHERE documento_id = ${documentoId} AND numero = 3`;
  await sql.begin((tx) =>
    alDejarDeSerVigente(tx, Number(v2.id), "nueva_version", v3.publicado_en as Date, {
      nuevaVersionId: Number(v3.id),
      actorId: coordinadora.usuarioId,
    }),
  );

  // Verificación de Urgencias, antes de que tuviera copias: un ítem no conforme y un hallazgo vencido.
  await verificar(sql, await puntoDe("Urgencias"), momentoHace(20), {
    [ITEM_COPIAS_NO_CONTROLADAS]: "Copia no controlada de AIN-FO-01",
  });

  // Lecturas individuales: la persona abre el documento y después confirma.
  for (const [usuario, dias] of [["consulta", 7], ["jefe.urgencias", 6]] as const) {
    const sesion = await sesionDe(sql, usuario);
    const abierta = new Date(momentoHace(dias).getTime() - 3_600_000);
    await sql`INSERT INTO eventos_consulta (tipo, documento_id, version_id, usuario_id, creado_en)
      VALUES ('vista', ${documentoId}, ${v3.id}, ${sesion.usuarioId}, ${abierta})`;
    const [acuse] = await sql`SELECT id FROM acuses WHERE version_id = ${v3.id} AND usuario_id = ${sesion.usuarioId}`;
    await confirmarLectura(Number(acuse.id), sesion, { sql, ahora: momentoHace(dias) });
  }

  // Copias de la v3.
  await emitirCopia(
    liderGth,
    { documentoId, puntoUsoId: await puntoDe("Talento Humano"), nota: "Copia del puesto de trabajo" },
    { sql, ahora: momentoHace(7) },
  );
  await emitirCopia(
    coordinadora,
    { documentoId, puntoUsoId: await puntoDe("Urgencias"), nota: "Para el servicio de urgencias" },
    { sql, ahora: momentoHace(4) },
  );
  const { copiaId: errada } = await emitirCopia(
    coordinadora,
    { documentoId, puntoUsoId: await puntoDe("Vacunación"), nota: null },
    { sql, ahora: momentoHace(3) },
  );
  await anularCopia(errada, coordinadora, "error", "Se emitió al punto equivocado", { sql, ahora: momentoHace(3) });

  // Jornada: los asistentes pendientes quedan confirmados por asistencia.
  const momentoJornada = momentoHace(5);
  const { jornadaId } = await registrarJornada(
    liderGth,
    {
      fecha: fechaEnZona(momentoJornada, zonaHoraria()),
      modalidad: "reunion_servicio",
      facilitadorId: liderGth.usuarioId,
      versionIds: [Number(v3.id)],
      asistenteIds: ["regente.farmacia", "lider.cex", "jefe.urgencias", "consulta"].map((u) => c.usuarioPorNombre[u]),
      asistentesExternos: null,
      observaciones: "Se socializó la actualización de la caracterización en la reunión de servicio.",
    },
    { sql, ahora: momentoJornada },
  );
  await guardarActaDeJornada(sql, jornadaId, liderGth.usuarioId, momentoJornada);

  // Un acuse pendiente con el plazo vencido: ninguna función real deja vencer un plazo hacia atrás.
  await sql`UPDATE acuses SET vence_en = ${momentoHace(2)}
    WHERE version_id = ${v3.id} AND estado = 'pendiente' AND usuario_id = ${c.usuarioPorNombre["control.interno"]}`;
}
