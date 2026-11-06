/**
 * Aprobación, publicación y eliminación (spec 13A §10.4, §11.1 y §11.3). Los validadores dicen lo
 * que falta antes de pedir la firma y otra vez con la fila bloqueada; los manejadores solo escriben.
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { anularVigenteEn, aplicarPublicacion } from "@/db/consultas/admin";
import { congelarDatosActa, nombreDeEntidadParaActa } from "@/db/consultas/actas";
import { exigirDesignacion } from "./aceptacion";
import { listarFirmas, type FirmaRegistrada } from "@/db/consultas/firmas";
import { crearObservacionesDeAprobacion } from "@/db/consultas/revision";
import { adminsActivos, lideresDeProceso, lideresDeProcesosDelDocumento, rotuloDeTramite } from "@/db/consultas/tramites";
import { huellaDeArchivo } from "@/lib/huella";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { MAX_OBSERVACIONES_APROBACION, type Firma } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  ARCHIVO_CAMBIADO,
  ErrorTramite,
  motivoObligatorio,
  type ContextoManejador,
  type Efecto,
  type FilaTramite,
  type Manejador,
  type RegistroManejadores,
  type RegistroValidadores,
  type Validador,
} from "./contrato";
import { conceptoDe } from "./revision";

const NO_COINCIDE = "El archivo en el almacén no coincide con el aprobado. No se publicó.";

async function firmasDeLaRonda(sql: Cliente, tramite: FilaTramite): Promise<FirmaRegistrada[]> {
  return (await listarFirmas(tramite.id, { sql })).filter((f) => f.ronda === tramite.ronda);
}

function laFirma(firmas: FirmaRegistrada[], firma: Firma): FirmaRegistrada {
  const encontrada = firmas.find((f) => f.firma === firma);
  if (!encontrada) throw new ErrorTramite("Faltan firmas para publicar");
  return encontrada;
}

/** Un archivo que no se puede leer tampoco es el aprobado. La causa, con su ruta, va al registro. */
async function huellaEnAlmacen(ruta: string): Promise<string> {
  try {
    return await huellaDeArchivo(ruta);
  } catch (err) {
    console.error("No se pudo leer el archivo principal al publicar:", err);
    throw new ErrorTramite(NO_COINCIDE);
  }
}

/** Lo que se publica es lo firmado: sigue en borrador, con sus firmas, y el archivo es el de ellas. */
async function exigirLoAprobado(sql: Cliente, tramite: FilaTramite, exigidas: Firma[]): Promise<void> {
  const [version] = await sql`SELECT v.estado, a.ruta, a.hash_sha256
    FROM documento_versiones v
    LEFT JOIN archivos a ON a.version_id = v.id AND a.rol = 'principal'
    WHERE v.id = ${tramite.versionId}`;
  if (version?.estado !== "borrador") throw new ErrorTramite("La versión de este trámite ya no está en borrador");
  const firmas = await firmasDeLaRonda(sql, tramite);
  const firmantes = exigidas.map((firma) => laFirma(firmas, firma));
  if (!version.ruta) throw new ErrorTramite("Falta el archivo principal");
  if ((await huellaEnAlmacen(version.ruta)) !== version.hash_sha256) throw new ErrorTramite(NO_COINCIDE);
  if (firmantes.some((f) => f.hashSha256 !== version.hash_sha256)) throw new ErrorTramite(ARCHIVO_CAMBIADO);
}

/** Lo que se retira es lo que se aprobó retirar. */
async function exigirVersionVigente(sql: Cliente, tramite: FilaTramite): Promise<void> {
  const [version] = await sql`SELECT estado FROM documento_versiones WHERE id = ${tramite.versionId}`;
  if (version?.estado !== "vigente") throw new ErrorTramite("La versión de este trámite ya no está vigente");
}

/** Quien elabora no aprueba (spec §6.3): también al firmar, porque el aprobador puede reasignarse. */
async function exigirAprobadorDistinto(sql: Cliente, tramite: FilaTramite, usuarioId: number): Promise<void> {
  const elaboro = (await firmasDeLaRonda(sql, tramite)).find((f) => f.firma === "elaboro");
  if (elaboro?.usuarioId === usuarioId) throw new ErrorTramite("Quien elabora no puede aprobar");
}

/**
 * La autoridad del tipo puede cambiar con el trámite abierto (spec §6.3: las reglas se comprueban
 * al designar, al reasignar y al firmar): quien firma debe tener el rol que exige la autoridad
 * actual, con la misma regla de la designación. El trámite no queda sin salida: se reasigna al
 * aprobador. Del revisor no se mira el rol: ya dio su paso, y S1 y S2 siguen valiendo.
 */
async function exigirAutoridadActual(sql: Cliente, tramite: FilaTramite, aprobadorId: number): Promise<void> {
  const [tipo] = await sql`SELECT t.autoridad FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id WHERE d.id = ${tramite.documentoId}`;
  if (!tipo) throw new ErrorTramite("El tipo de documento no existe");
  try {
    await exigirDesignacion(
      sql,
      tramite,
      tramite.tipo,
      tipo.autoridad,
      { elaboradorId: tramite.elaboradorId, revisorId: tramite.revisorId, aprobadorId },
      [],
    );
  } catch (err) {
    if (err instanceof ErrorTramite && err.message.startsWith("Quien aprueba debe")) {
      throw new ErrorTramite(`${err.message}. Pida reasignar al aprobador.`);
    }
    throw err;
  }
}

const validarAprobar: Validador = async ({ sql, tramite, sesion, datos }) => {
  conceptoDe(datos);
  await exigirAprobadorDistinto(sql, tramite, sesion.usuarioId);
  await exigirAutoridadActual(sql, tramite, sesion.usuarioId);
};

const validarPublicar: Validador = async ({ sql, tramite }) => {
  await nombreDeEntidadParaActa(sql);
  if (tramite.tipo !== "eliminar") return exigirLoAprobado(sql, tramite, ["elaboro", "reviso", "aprobo"]);
  await exigirVersionVigente(sql, tramite);
  const aprobo = laFirma(await firmasDeLaRonda(sql, tramite), "aprobo");
  const [principal] = await sql`SELECT hash_sha256 FROM archivos WHERE version_id = ${tramite.versionId} AND rol = 'principal'`;
  if (principal?.hash_sha256 !== aprobo.hashSha256) throw new ErrorTramite("El archivo cambió después de la firma de quien aprobó");
};

/** La firma `aprobo` se escribe en esta misma transición: todavía no se exige. */
const validarAprobarYPublicar: Validador = async ({ sql, tramite, sesion, datos }) => {
  conceptoDe(datos);
  await nombreDeEntidadParaActa(sql);
  await exigirAprobadorDistinto(sql, tramite, sesion.usuarioId);
  await exigirAutoridadActual(sql, tramite, sesion.usuarioId);
  if (tramite.tipo === "eliminar") return exigirVersionVigente(sql, tramite);
  await exigirLoAprobado(sql, tramite, ["elaboro", "reviso"]);
};

function observacionesDe(datos: Record<string, unknown>): string[] {
  const { observaciones } = datos;
  const validas =
    Array.isArray(observaciones) &&
    observaciones.length >= 1 &&
    observaciones.length <= MAX_OBSERVACIONES_APROBACION &&
    observaciones.every((o) => typeof o === "string");
  if (!validas) throw new ErrorTramite(`Escriba entre 1 y ${MAX_OBSERVACIONES_APROBACION} observaciones`);
  return observaciones;
}

const aprobar: Manejador = async ({ tx, tramite, datos }) => {
  const { texto } = await rotuloDeTramite(tx, tramite);
  const titulo = tramite.tipo === "eliminar" ? `Eliminación ${tramite.numero} por ejecutar` : `Solicitud ${tramite.numero} por publicar`;
  return {
    detalle: { concepto: conceptoDe(datos) },
    avisos: [{ usuarioIds: await adminsActivos({ sql: tx }), tipo: "tramite.paso", titulo, cuerpo: texto }],
  };
};

const devolverAprobacion: Manejador = async ({ tx, tramite, sesion, datos }) => {
  const observaciones = await crearObservacionesDeAprobacion(tx, tramite, sesion.usuarioId, observacionesDe(datos));
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    detalle: { observaciones },
    avisos:
      tramite.elaboradorId === null
        ? []
        : [{ usuarioIds: [tramite.elaboradorId], tipo: "tramite.devuelto", titulo: `Solicitud ${tramite.numero}: devuelta a elaboración`, cuerpo: texto }],
  };
};

const negarEliminacion: Manejador = async ({ tx, tramite, datos }) => {
  const motivo = motivoObligatorio(datos);
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    detalle: { motivo },
    cambios: { motivoCierre: motivo },
    avisos: [{ usuarioIds: [tramite.solicitanteId], tipo: "tramite.resuelto", titulo: `Eliminación ${tramite.numero} negada`, cuerpo: texto }],
  };
};

/** A los participantes y a los líderes de los procesos del documento; sin documento, a los del proceso (spec 13A §14.2). */
export async function avisoDeCierre(tx: TransactionSql, tramite: FilaTramite, documentoId: number | null, titulo: string): Promise<Efecto["avisos"]> {
  const { texto } = await rotuloDeTramite(tx, tramite);
  const participantes = [tramite.solicitanteId, tramite.elaboradorId, tramite.revisorId, tramite.aprobadorId];
  const lideres =
    documentoId === null
      ? await lideresDeProceso(tramite.procesoId, { sql: tx })
      : await lideresDeProcesosDelDocumento(documentoId, { sql: tx });
  return [
    {
      usuarioIds: [...participantes.filter((id) => id !== null), ...lideres],
      tipo: "tramite.cerrado",
      titulo,
      cuerpo: texto,
    },
  ];
}

type Firmante = Pick<FirmaRegistrada, "nombre" | "cargo" | "creadoEn">;

async function quienActua({ tx, sesion, ahora }: ContextoManejador): Promise<Firmante> {
  const [u] = await tx`SELECT u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
    WHERE u.id = ${sesion.usuarioId}`;
  return { nombre: u.nombre, cargo: u.cargo, creadoEn: ahora };
}

const nombreYCargo = (f: Firmante) => (f.cargo ? `${f.nombre} — ${f.cargo}` : f.nombre);
const diaDe = (f: Firmante) => fechaEnZona(f.creadoEn, zonaHoraria());

/**
 * Copia a la versión lo que el `CHECK versiones_vigente_con_aprobacion`, la ficha y el Listado
 * Maestro leen, y solo entonces publica. `aprobador` es quien firma en esta misma transición.
 */
async function publicarVersion(c: ContextoManejador, aprobador?: Firmante): Promise<Efecto> {
  const { tx, tramite, sesion, ahora } = c;
  const versionId = tramite.versionId as number;
  const firmas = await firmasDeLaRonda(tx, tramite);
  const elaboro = laFirma(firmas, "elaboro");
  const reviso = laFirma(firmas, "reviso");
  const aprobo = aprobador ?? laFirma(firmas, "aprobo");
  await tx`UPDATE documento_versiones SET
      elaboro = ${nombreYCargo(elaboro)}, reviso = ${nombreYCargo(reviso)}, aprobo = ${nombreYCargo(aprobo)},
      fecha_elaboracion = ${diaDe(elaboro)}, fecha_revision = ${diaDe(reviso)}, fecha_aprobacion = ${diaDe(aprobo)}
    WHERE id = ${versionId}`;
  const { documentoId, numero, obsoletas } = await aplicarPublicacion(tx, versionId, "plataforma", sesion.usuarioId, ahora);
  // Solo una modificación: en una creación, `titulo_propuesto` es lo pedido y el título es el que quedó al aceptar.
  let cambioDeTitulo: { tituloAnterior: string; titulo: string } | null = null;
  if (tramite.tipo === "modificar" && tramite.tituloPropuesto) {
    const [{ titulo: tituloAnterior }] = await tx`SELECT titulo FROM documentos WHERE id = ${documentoId}`;
    await tx`UPDATE documentos SET titulo = ${tramite.tituloPropuesto} WHERE id = ${documentoId}`;
    if (tituloAnterior !== tramite.tituloPropuesto) cambioDeTitulo = { tituloAnterior, titulo: tramite.tituloPropuesto };
  }
  return {
    // Se congela después de aplicar el título nuevo: el acta lleva el título con el que queda el documento.
    detalle: {
      version: numero,
      obsoletas,
      huella: elaboro.hashSha256,
      ...cambioDeTitulo,
      acta: await congelarDatosActa(tx, tramite, "aprobacion", ahora, obsoletas.length === 0 ? null : Math.max(...obsoletas)),
    },
    avisos: await avisoDeCierre(tx, tramite, documentoId, `Solicitud ${tramite.numero}: documento publicado`),
  };
}

async function ejecutarEliminacion({ tx, tramite, sesion, ahora }: ContextoManejador): Promise<Efecto> {
  const documentoId = tramite.documentoId as number;
  const { versionId, numero } = await anularVigenteEn(tx, documentoId, sesion.usuarioId);
  if (versionId !== tramite.versionId) throw new ErrorTramite("La versión vigente cambió: revise el trámite");
  return {
    detalle: { versionAnulada: numero, acta: await congelarDatosActa(tx, tramite, "eliminacion", ahora) },
    avisos: await avisoDeCierre(tx, tramite, documentoId, `Solicitud ${tramite.numero}: documento eliminado`),
  };
}

const publicar: Manejador = (c) => (c.tramite.tipo === "eliminar" ? ejecutarEliminacion(c) : publicarVersion(c));

/** De `aprobar` conserva el concepto y no su aviso: nadie queda esperando publicar lo ya publicado. */
const aprobarYPublicar: Manejador = async (c) => {
  const concepto = conceptoDe(c.datos);
  const efecto = c.tramite.tipo === "eliminar" ? await ejecutarEliminacion(c) : await publicarVersion(c, await quienActua(c));
  return { ...efecto, detalle: { concepto, ...efecto.detalle } };
};

export const VALIDADORES_CIERRE: RegistroValidadores = {
  aprobar: validarAprobar,
  publicar: validarPublicar,
  aprobar_y_publicar: validarAprobarYPublicar,
};

export const MANEJADORES_CIERRE: RegistroManejadores = {
  aprobar,
  devolver_aprobacion: devolverAprobacion,
  negar_eliminacion: negarEliminacion,
  publicar,
  aprobar_y_publicar: aprobarYPublicar,
};
