/** Manejadores de la aceptación: duplicidad, clasificación, código y responsables (spec 13A §8.3). */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { crearDocumentoEn, crearVersionBorradorEn, type AsociacionEntrada } from "@/db/consultas/admin";
import {
  codigoAbandonado,
  errorDeCodigoRepetido,
  exigirFormatoDeCodigo,
  exigirSiglasDelCodigo,
  sugerirCodigo,
} from "@/db/consultas/codigos";
import { buscarParecidos } from "@/db/consultas/parecidos";
import {
  propietarioDeDocumento,
  rotuloDeTramite,
  tipoDeDocumento,
} from "@/db/consultas/tramites";
import type {
  DatosAceptarCreacion,
  DatosAceptarEliminacion,
  DatosAceptarModificacion,
} from "@/lib/esquemas/tramites";
import { finDeFecha } from "@/lib/tramites/plazos";
import { papelesReasignables, validarDesignacion } from "@/lib/tramites/separacion";
import { ETAPAS_ABIERTAS, type Autoridad, type TipoSolicitud } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  ErrorTramite,
  YA_ABIERTO,
  motivoObligatorio,
  type Aviso,
  type ContextoManejador,
  type Efecto,
  type FilaTramite,
  type Manejador,
  type RegistroManejadores,
} from "./contrato";

type Designados = Pick<DatosAceptarModificacion, "elaboradorId" | "revisorId" | "aprobadorId">;
type DatosNuevo = DatosAceptarCreacion &
  Required<Pick<DatosAceptarCreacion, "tipoDocumentoId" | "titulo" | "nivelAcceso" | "codigo">>;

/**
 * Aplica las reglas de separación y devuelve, para la evidencia, a cada designado con su nombre.
 * `entran` es para un trámite ya aceptado: solo a esas personas se les exige estar activas, y el rol
 * solo a quien aún tiene su paso pendiente. A quien ya estaba se le cuenta la separación; si se le
 * pidiera estar activa, o conservar el rol de un paso que ya dio, el trámite podría quedar sin salida.
 */
export async function exigirDesignacion(
  sql: Cliente,
  tramite: FilaTramite,
  tipo: TipoSolicitud,
  autoridad: Autoridad,
  ids: { [papel in keyof Designados]?: number | null },
  entran?: readonly number[],
) {
  const buscados = [tramite.solicitanteId, ids.elaboradorId, ids.revisorId, ids.aprobadorId].filter((i) => typeof i === "number");
  const filas = await sql`SELECT id, nombre, rol, activo FROM usuarios WHERE id = ANY(${buscados})`;
  const persona = (id: number | null | undefined) => {
    const f = filas.find((u) => Number(u.id) === id);
    if (!f) return null;
    const exigeActivo = entran === undefined || entran.includes(Number(f.id));
    return { id: Number(f.id), nombre: f.nombre as string, rol: f.rol, activo: (f.activo as boolean) || !exigeActivo };
  };
  const solicitante = persona(tramite.solicitanteId);
  const elaborador = persona(ids.elaboradorId);
  const revisor = persona(ids.revisorId);
  const aprobador = persona(ids.aprobadorId);
  if (!solicitante) throw new ErrorTramite("El trámite no tiene solicitante");
  if (!aprobador) throw new ErrorTramite("Falta designar quién aprueba");
  const pendientes = entran === undefined ? undefined : papelesReasignables(tramite.etapa);
  const error = validarDesignacion({ tipo, autoridad, solicitante, elaborador, revisor, aprobador, pendientes });
  if (error) throw new ErrorTramite(error);
  const evidencia = (p: { id: number; nombre: string } | null) => p && { id: p.id, nombre: p.nombre };
  return { elaborador: evidencia(elaborador), revisor: evidencia(revisor), aprobador: evidencia(aprobador) };
}

/** Una fecha yyyy-mm-dd de la zona de la instalación vence al final de ese día. `que` nombra el plazo en el error. */
export function plazoHasta(fecha: string, ahora: Date, que: string): Date {
  const venceEn = finDeFecha(fecha, zonaHoraria());
  if (venceEn < ahora) throw new ErrorTramite(`${que} no puede ser anterior a hoy`);
  return venceEn;
}

/** La casilla de la aceptación (en el evento solo consta cuando se marcó) («on» en el formulario); los tests pasan `true`. */
function marcaDeSocializacion(datos: Record<string, unknown>): boolean {
  return datos.requiereSocializacion === "on" || datos.requiereSocializacion === true;
}

/** Solo descartarlo: ya hay una versión vigente, y sobre ella el camino directo no publica. */
const BORRADOR_PENDIENTE = "El documento tiene un borrador de carga pendiente: descártelo";

const plazoDeElaboracion = (fecha: string, ahora: Date) => plazoHasta(fecha, ahora, "La fecha límite de elaboración");

/** El paso va primero: si quien pidió también elabora, recibe el aviso que le dice qué hacer. */
function avisosDeElaboracion(tramite: FilaTramite, elaboradorId: number, texto: string): Aviso[] {
  const { numero, solicitanteId } = tramite;
  return [
    { usuarioIds: [elaboradorId], tipo: "tramite.paso", titulo: `Solicitud ${numero} aceptada: le toca elaborar`, cuerpo: texto },
    { usuarioIds: [solicitanteId], tipo: "tramite.resuelto", titulo: `Solicitud ${numero} aceptada`, cuerpo: texto },
  ];
}

/** Abre la versión siguiente de un documento vigente: una modificación, nativa o convertida. */
async function abrirVersion(
  { tx, tramite, sesion, ahora }: ContextoManejador,
  documentoId: number,
  datos: Designados & { venceElaboracion: string },
) {
  const [doc] = await tx`SELECT d.codigo, d.titulo, d.tipo_id,
      EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente') AS vigente,
      EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'borrador') AS borrador
    FROM documentos d WHERE d.id = ${documentoId}`;
  if (!doc?.vigente) throw new ErrorTramite("El documento ya no tiene versión vigente");
  if (doc.borrador) throw new ErrorTramite(BORRADOR_PENDIENTE);

  const tipo = await tipoDeDocumento(Number(doc.tipo_id), { sql: tx });
  if (!tipo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");
  const responsables = await exigirDesignacion(tx, tramite, "modificar", tipo.autoridad, datos);
  const venceEn = plazoDeElaboracion(datos.venceElaboracion, ahora);
  const { versionId, numero } = await crearVersionBorradorEn(tx, documentoId, sesion.usuarioId);
  return {
    titulo: doc.titulo as string,
    cambios: { versionId, elaboradorId: datos.elaboradorId, revisorId: datos.revisorId, aprobadorId: datos.aprobadorId, venceEn },
    detalle: { codigo: doc.codigo as string, version: numero, plantilla: tipo.plantilla, responsables },
  };
}

async function aceptarModificacion(c: ContextoManejador): Promise<Efecto> {
  const { tx, tramite } = c;
  const datos = c.datos as DatosAceptarModificacion;
  if (tramite.documentoId === null) throw new ErrorTramite("El trámite no tiene documento");
  const { titulo, cambios, detalle } = await abrirVersion(c, tramite.documentoId, datos);
  const tituloPropuesto = datos.tituloNuevo && datos.tituloNuevo !== titulo ? datos.tituloNuevo : null;
  const { texto } = await rotuloDeTramite(tx, { ...tramite, tituloPropuesto });
  const requiereSocializacion = marcaDeSocializacion(c.datos);
  return {
    detalle: { ...detalle, ...(requiereSocializacion ? { requiereSocializacion } : {}), ...(tituloPropuesto ? { tituloNuevo: tituloPropuesto } : {}) },
    cambios: { ...cambios, tituloPropuesto, requiereSocializacion },
    avisos: avisosDeElaboracion(tramite, datos.elaboradorId, texto),
  };
}

/** La lista que vio quien acepta: la misma consulta de la pantalla, sobre el título que se pidió. */
function parecidosVistos(tx: TransactionSql, tramite: FilaTramite) {
  return buscarParecidos(tramite.tituloPropuesto ?? "", { sql: tx });
}

/** Lo que traía la solicitud: el evento lo conserva aunque al aceptar se corrija o se convierta. */
function loSolicitado(t: FilaTramite) {
  return { procesoId: t.procesoId, subprocesoId: t.subprocesoId, tipoDocumentoId: t.tipoDocumentoId, titulo: t.tituloPropuesto };
}

/** El mismo proceso y sin otro trámite: así el visto bueno ya dado sigue siendo del líder correcto. */
async function convertirEnModificacion(c: ContextoManejador): Promise<Efecto> {
  const { tx, tramite } = c;
  const datos = c.datos as DatosAceptarCreacion;
  const documentoId = datos.documentoExistenteId;
  if (documentoId === undefined) throw new ErrorTramite("Elija el documento que ya existe");
  const propietario = await propietarioDeDocumento(documentoId, { sql: tx });
  if (propietario?.procesoId !== tramite.procesoId)
    throw new ErrorTramite("Ese documento es de otro proceso: rechace la solicitud con su código");
  const [abierto] = await tx`SELECT 1 FROM tramites
    WHERE documento_id = ${documentoId} AND id <> ${tramite.id} AND etapa = ANY(${ETAPAS_ABIERTAS})`;
  if (abierto) throw new ErrorTramite(YA_ABIERTO);

  const parecidos = await parecidosVistos(tx, tramite);
  const { cambios, detalle } = await abrirVersion(c, documentoId, datos).catch((err: { constraint_name?: string }) => {
    // Otra conversión sobre el mismo documento se adelantó y ya abrió esa versión.
    if (err.constraint_name === "versiones_documento_numero_unico_idx") throw new ErrorTramite(YA_ABIERTO);
    throw err;
  });
  const { texto } = await rotuloDeTramite(tx, { tipo: "modificar", documentoId, tituloPropuesto: null });
  const requiereSocializacion = marcaDeSocializacion(c.datos);
  return {
    detalle: {
      ...detalle,
      ...(requiereSocializacion ? { requiereSocializacion } : {}),
      parecidos,
      decision: "modificacion",
      clasificacion: { solicitado: loSolicitado(tramite) },
    },
    cambios: {
      ...cambios,
      tipo: "modificar",
      documentoId,
      subprocesoId: propietario.subprocesoId,
      tipoDocumentoId: null,
      tituloPropuesto: null,
      requiereSocializacion,
    },
    avisos: avisosDeElaboracion(tramite, datos.elaboradorId, texto),
  };
}

/** El proceso propietario que se eligió, con el trámite siguiéndolo a él. */
export async function propietarioElegido(tx: TransactionSql, principal: AsociacionEntrada | undefined) {
  if (!principal) throw new ErrorTramite("Elija el proceso propietario");
  const { procesoId, subprocesoId } = principal;
  const [f] = subprocesoId
    ? await tx`SELECT s.proceso_id FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id AND p.activo
        WHERE s.id = ${subprocesoId} AND s.activo`
    : await tx`SELECT id AS proceso_id FROM procesos WHERE id = ${procesoId ?? 0} AND activo`;
  if (!f) throw new ErrorTramite("El proceso propietario no existe o está inactivo");
  return { procesoId: Number(f.proceso_id), subprocesoId: subprocesoId ?? null };
}

const REINTENTOS_DE_CODIGO = 3;

/**
 * Crea el documento. Si el código sugerido ya lo tomó otra aceptación, o lo abandonó otro trámite,
 * sigue con el consecutivo siguiente (spec 13A §8.4); uno escrito a mano no se cambia sin que la
 * persona lo decida. Va en un savepoint porque, tras un 23505, la transacción ya no admite más
 * consultas.
 */
async function crearConCodigoLibre(
  tx: TransactionSql,
  d: DatosNuevo,
  procesoId: number,
  usuarioId: number,
  tramiteId: number,
): Promise<{ documentoId: number; versionId: number; codigo: string }> {
  const esElSugerido = d.codigo === d.codigoSugerido;
  const datos = {
    titulo: d.titulo,
    tipoId: d.tipoDocumentoId,
    descripcion: d.descripcion ?? null,
    palabrasClave: d.palabrasClave ?? null,
    asociaciones: d.asociaciones,
    nivelAcceso: d.nivelAcceso,
    relacionados: d.relacionados,
  };
  let codigo = d.codigo;
  for (let intento = 0; ; intento += 1) {
    if (!(await codigoAbandonado(codigo, tramiteId, { sql: tx }))) {
      try {
        const creado = await tx.savepoint((s) => crearDocumentoEn(s, { ...datos, codigo }, usuarioId));
        return { ...creado, codigo };
      } catch (err) {
        if ((err as { constraint_name?: string }).constraint_name !== "documentos_codigo_unique") throw err;
      }
    }
    const siguiente = await sugerirCodigo({ procesoId, tipoDocumentoId: d.tipoDocumentoId }, { sql: tx });
    if (!siguiente || !esElSugerido || intento === REINTENTOS_DE_CODIGO) throw errorDeCodigoRepetido(siguiente);
    codigo = siguiente;
  }
}

async function aceptarNuevo(c: ContextoManejador): Promise<Efecto> {
  const { tx, tramite, sesion, ahora } = c;
  const d = c.datos as DatosNuevo;
  const tipo = await tipoDeDocumento(d.tipoDocumentoId, { sql: tx });
  if (!tipo?.activo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");
  const propietario = await propietarioElegido(tx, d.asociaciones.find((a) => a.esPrincipal));
  const responsables = await exigirDesignacion(tx, tramite, "crear", tipo.autoridad, d);
  const venceEn = plazoDeElaboracion(d.venceElaboracion, ahora);
  const destino = { procesoId: propietario.procesoId, tipoDocumentoId: d.tipoDocumentoId };
  await exigirFormatoDeCodigo(tx, d.codigo, destino);
  await exigirSiglasDelCodigo(tx, d.codigo, destino);

  const parecidos = await parecidosVistos(tx, tramite);
  const { documentoId, versionId, codigo } = await crearConCodigoLibre(tx, d, propietario.procesoId, sesion.usuarioId, tramite.id);
  const { texto } = await rotuloDeTramite(tx, { ...tramite, documentoId });
  const requiereSocializacion = marcaDeSocializacion(c.datos);
  return {
    detalle: {
      parecidos,
      ...(requiereSocializacion ? { requiereSocializacion } : {}),
      decision: "nuevo",
      codigo,
      version: 1,
      clasificacion: {
        solicitado: loSolicitado(tramite),
        tipoDocumentoId: d.tipoDocumentoId,
        asociaciones: d.asociaciones,
        titulo: d.titulo,
        descripcion: d.descripcion ?? null,
        palabrasClave: d.palabrasClave ?? null,
        relacionados: d.relacionados,
        nivelAcceso: d.nivelAcceso,
      },
      plantilla: tipo.plantilla,
      responsables,
    },
    cambios: {
      ...propietario,
      tipoDocumentoId: d.tipoDocumentoId,
      documentoId,
      versionId,
      elaboradorId: d.elaboradorId,
      revisorId: d.revisorId,
      aprobadorId: d.aprobadorId,
      venceEn,
      requiereSocializacion,
    },
    avisos: avisosDeElaboracion(tramite, d.elaboradorId, texto),
  };
}

async function aceptarEliminacion({ tx, tramite, datos }: ContextoManejador): Promise<Efecto> {
  const { aprobadorId } = datos as DatosAceptarEliminacion;
  const [vigente] = await tx`SELECT v.id, v.numero, d.codigo, d.tipo_id,
      EXISTS (SELECT 1 FROM documento_versiones o WHERE o.documento_id = d.id AND o.estado = 'borrador') AS borrador
    FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
    WHERE v.documento_id = ${tramite.documentoId ?? 0} AND v.estado = 'vigente'`;
  if (!vigente) throw new ErrorTramite("El documento ya no tiene versión vigente");
  if (vigente.borrador) throw new ErrorTramite(BORRADOR_PENDIENTE);
  const tipo = await tipoDeDocumento(Number(vigente.tipo_id), { sql: tx });
  if (!tipo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");
  const responsables = await exigirDesignacion(tx, tramite, "eliminar", tipo.autoridad, { aprobadorId });
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    detalle: { codigo: vigente.codigo, version: vigente.numero, responsables },
    cambios: { aprobadorId, versionId: Number(vigente.id) },
    avisos: [
      { usuarioIds: [aprobadorId], tipo: "tramite.paso", titulo: `Eliminación ${tramite.numero} espera su aprobación`, cuerpo: texto },
      { usuarioIds: [tramite.solicitanteId], tipo: "tramite.resuelto", titulo: `Solicitud ${tramite.numero} aceptada`, cuerpo: texto },
    ],
  };
}

const aceptar: Manejador = (c) => {
  if (c.tramite.tipo === "eliminar") return aceptarEliminacion(c);
  if (c.tramite.tipo === "modificar") return aceptarModificacion(c);
  return (c.datos as DatosAceptarCreacion).decision === "modificacion" ? convertirEnModificacion(c) : aceptarNuevo(c);
};

const rechazar: Manejador = async ({ tx, tramite, datos }) => {
  const motivo = motivoObligatorio(datos);
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    detalle: { motivo },
    cambios: { motivoCierre: motivo },
    avisos: [
      { usuarioIds: [tramite.solicitanteId], tipo: "tramite.resuelto", titulo: `Solicitud ${tramite.numero} rechazada`, cuerpo: texto },
    ],
  };
};

export const MANEJADORES_ACEPTACION: RegistroManejadores = { aceptar, rechazar };
