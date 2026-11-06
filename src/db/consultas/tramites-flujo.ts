/**
 * Punto único de entrada del trámite: `crearSolicitud` lo abre y `transicionar` hace toda
 * transición (spec 13A §7.2). Ningún otro código cambia `tramites.etapa`.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { obtenerConfigDocumental, type ConfigDocumental } from "@/db/consultas/config-documental";
import { registrarFirma } from "@/db/consultas/firmas";
import { alcanceProcesos, enAlcance } from "@/lib/alcance";
import { verificarParaFirmar, type CredencialesFirma } from "@/lib/firma";
import { puede } from "@/lib/permisos";
import { fechaLimite } from "@/lib/tramites/plazos";
import { evaluarTransicion, type Accion } from "@/lib/tramites/transiciones";
import {
  esEtapaDeTrabajo,
  type Etapa,
  type Firma,
  type Motivo,
  type TipoSolicitud,
} from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  ARCHIVO_CAMBIADO,
  CAMBIO_MIENTRAS,
  ErrorFirma,
  ErrorTramite,
  YA_ABIERTO,
  enTransaccion,
  type Aviso,
  type Efecto,
  type FilaTramite,
  type Manejador,
  type OpcionesFlujo,
  type RegistroManejadores,
  type RegistroValidadores,
  type SesionFlujo,
} from "./flujo/contrato";
import { MANEJADORES_ACEPTACION } from "./flujo/aceptacion";
import { MANEJADORES_CIERRE, VALIDADORES_CIERRE } from "./flujo/cierre";
import { MANEJADORES_ELABORACION, VALIDADORES_ELABORACION } from "./flujo/elaboracion";
import { MANEJADORES_GESTION } from "./flujo/gestion";
import { MANEJADORES_REVISION, VALIDADORES_REVISION } from "./flujo/revision";
import { MANEJADORES_SOLICITUD } from "./flujo/solicitud";
import {
  ETAPAS_ABIERTAS,
  adminsActivos,
  lideresDeProceso,
  propietarioDeDocumento,
  rotuloDeTramite,
  tramiteVisto,
} from "./tramites";

export { CAMBIO_MIENTRAS, ErrorFirma, ErrorTramite, enTransaccion, motivoObligatorio } from "./flujo/contrato";
export type {
  Aviso,
  ContextoManejador,
  ContextoValidacion,
  Efecto,
  FilaTramite,
  Manejador,
  OpcionesFlujo,
  SesionFlujo,
  TipoAviso,
  Validador,
} from "./flujo/contrato";

/** Una acción sin entrada aquí no está disponible. */
export const MANEJADORES: RegistroManejadores = {
  ...MANEJADORES_SOLICITUD,
  ...MANEJADORES_ACEPTACION,
  ...MANEJADORES_ELABORACION,
  ...MANEJADORES_REVISION,
  ...MANEJADORES_CIERRE,
  ...MANEJADORES_GESTION,
};

/** Comprobaciones de negocio de las acciones que firman, antes de pedir o gastar la firma. */
export const VALIDADORES: RegistroValidadores = {
  ...VALIDADORES_ELABORACION,
  ...VALIDADORES_REVISION,
  ...VALIDADORES_CIERRE,
};

/** La carrera entre una solicitud y una aceptación que convierte otro trámite en modificación. */
function traducirChoqueDeAbierto(err: { constraint_name?: string }): never {
  if (err.constraint_name === "tramites_uno_abierto_idx") throw new ErrorTramite(YA_ABIERTO);
  throw err;
}

export type DatosSolicitud = {
  tipo: TipoSolicitud;
  motivo: Motivo;
  justificacion: string;
  procesoId?: number;
  subprocesoId?: number;
  tipoDocumentoId?: number;
  tituloPropuesto?: string;
  documentoId?: number;
};

export type EntradaTransicion = {
  tramiteId: number;
  accion: Accion;
  etapaEsperada: Etapa;
  rondaEsperada: number;
  datos?: Record<string, unknown>;
  credenciales?: CredencialesFirma;
};

type Destino = {
  procesoId: number;
  subprocesoId: number | null;
  tipoDocumentoId: number | null;
  tituloPropuesto: string | null;
  documentoId: number | null;
};

async function destinoDeCreacion(tx: TransactionSql, datos: DatosSolicitud): Promise<Destino> {
  const { procesoId, subprocesoId, tipoDocumentoId } = datos;
  const titulo = datos.tituloPropuesto?.trim();
  if (!titulo) throw new ErrorTramite("Falta el título propuesto");
  if (!tipoDocumentoId) throw new ErrorTramite("Elija el tipo de documento");
  const [tipo] = await tx`SELECT 1 FROM tipos_documento WHERE id = ${tipoDocumentoId} AND activo`;
  if (!tipo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");

  if (subprocesoId) {
    const [s] = await tx`SELECT s.proceso_id FROM subprocesos s
      JOIN procesos p ON p.id = s.proceso_id AND p.activo
      WHERE s.id = ${subprocesoId} AND s.activo`;
    if (!s) throw new ErrorTramite("El subproceso no existe o está inactivo");
    if (procesoId && Number(s.proceso_id) !== procesoId) throw new ErrorTramite("El subproceso no es de ese proceso");
    return { procesoId: Number(s.proceso_id), subprocesoId, tipoDocumentoId, tituloPropuesto: titulo, documentoId: null };
  }
  if (!procesoId) throw new ErrorTramite("Elija el proceso");
  const [p] = await tx`SELECT 1 FROM procesos WHERE id = ${procesoId} AND activo`;
  if (!p) throw new ErrorTramite("El proceso no existe o está inactivo");
  return { procesoId, subprocesoId: null, tipoDocumentoId, tituloPropuesto: titulo, documentoId: null };
}

async function destinoDeDocumento(tx: TransactionSql, documentoId: number | undefined): Promise<Destino> {
  if (!documentoId) throw new ErrorTramite("Elija el documento");
  const [vigente] = await tx`SELECT 1 FROM documento_versiones WHERE documento_id = ${documentoId} AND estado = 'vigente'`;
  if (!vigente) throw new ErrorTramite("El documento no existe o no tiene versión vigente");
  const propietario = await propietarioDeDocumento(documentoId, { sql: tx });
  if (!propietario) throw new ErrorTramite("El documento no tiene proceso propietario");
  return { ...propietario, tipoDocumentoId: null, tituloPropuesto: null, documentoId };
}

function anioEn(instante: Date, zona: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric" }).format(instante));
}

export async function registrarEvento(
  tx: TransactionSql,
  e: { tramiteId: number; tipo: string; usuarioId: number | null; ronda: number; detalle?: Record<string, unknown>; ahora: Date },
): Promise<void> {
  await tx`INSERT INTO tramite_eventos (tramite_id, tipo, usuario_id, ronda, detalle, creado_en)
    VALUES (${e.tramiteId}, ${e.tipo}, ${e.usuarioId}, ${e.ronda}, ${tx.json((e.detalle ?? {}) as never)}, ${e.ahora})`;
}

/** Sin repetir destinatario entre avisos: gana el primero. Nadie se avisa de lo que acaba de hacer. Una sola inserción. */
export async function enviarAvisos(tx: TransactionSql, tramiteId: number, actorId: number, avisos: Aviso[]): Promise<void> {
  const avisados = new Set([actorId]);
  const filas: { usuarioId: number; aviso: Aviso }[] = [];
  for (const aviso of avisos) {
    for (const usuarioId of aviso.usuarioIds) {
      if (avisados.has(usuarioId)) continue;
      avisados.add(usuarioId);
      filas.push({ usuarioId, aviso });
    }
  }
  if (filas.length === 0) return;
  await tx`INSERT INTO notificaciones (usuario_id, tipo, titulo, cuerpo, enlace, entidad, entidad_id)
    SELECT u, t, ti, nullif(c, ''), ${`/tramites/${tramiteId}`}, 'tramite', ${tramiteId}
    FROM unnest(
      ${tx.array(filas.map((f) => f.usuarioId))}::int[],
      ${tx.array(filas.map((f) => f.aviso.tipo))}::text[],
      ${tx.array(filas.map((f) => f.aviso.titulo))}::text[],
      ${tx.array(filas.map((f) => f.aviso.cuerpo ?? ""))}::text[]
    ) AS a(u, t, ti, c)`;
}

export async function crearSolicitud(
  sesion: SesionFlujo,
  datos: DatosSolicitud,
  opciones: OpcionesFlujo = {},
): Promise<{ tramiteId: number; numero: string; etapa: Etapa }> {
  if (!puede(sesion, "tramites.solicitar")) throw new ErrorTramite("Sin permiso para esta acción");
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const zona = zonaHoraria();
  const config = await obtenerConfigDocumental({ sql });

  return enTransaccion(sql, async (tx) => {
    const destino =
      datos.tipo === "crear" ? await destinoDeCreacion(tx, datos) : await destinoDeDocumento(tx, datos.documentoId);
    if (!enAlcance(await alcanceProcesos(sesion, { sql: tx }), destino.procesoId))
      throw new ErrorTramite("Solo puede pedir sobre los procesos que lidera");

    // Bajo el candado, dos solicitudes simultáneas no leen el mismo consecutivo.
    await tx`SELECT pg_advisory_xact_lock(hashtext('tramites_numero'))`;
    if (destino.documentoId !== null) {
      const [abierto] = await tx`SELECT 1 FROM tramites
        WHERE documento_id = ${destino.documentoId} AND etapa = ANY(${ETAPAS_ABIERTAS})`;
      if (abierto) throw new ErrorTramite(YA_ABIERTO);
    }
    const anio = anioEn(ahora, zona);
    const [{ consecutivo }] = await tx`SELECT COALESCE(max(consecutivo), 0) + 1 AS consecutivo FROM tramites WHERE anio = ${anio}`;
    const numero = `SOL-${anio}-${String(consecutivo).padStart(3, "0")}`;

    const lideres = await lideresDeProceso(destino.procesoId, { sql: tx });
    const pideElLider = lideres.includes(sesion.usuarioId);
    const etapa = pideElLider || lideres.length === 0 ? "aceptacion" : "visto_bueno";

    const [fila] = await tx`INSERT INTO tramites
        (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, subproceso_id,
         tipo_documento_id, titulo_propuesto, documento_id, etapa, ronda, vence_en, creado_en, actualizado_en)
      VALUES
        (${numero}, ${anio}, ${consecutivo}, ${datos.tipo}, ${datos.motivo}, ${datos.justificacion.trim()},
         ${sesion.usuarioId}, ${destino.procesoId}, ${destino.subprocesoId}, ${destino.tipoDocumentoId},
         ${destino.tituloPropuesto}, ${destino.documentoId}, ${etapa}, 0,
         ${fechaLimite(ahora, config.plazos[etapa], zona)}, ${ahora}, ${ahora})
      RETURNING id`.catch(traducirChoqueDeAbierto);
    const tramiteId = Number(fila.id);

    const evento = { tramiteId, ronda: 0, ahora };
    await registrarEvento(tx, { ...evento, tipo: "solicitar", usuarioId: sesion.usuarioId });
    if (pideElLider) await registrarEvento(tx, { ...evento, tipo: "visto_bueno_automatico", usuarioId: sesion.usuarioId });
    else if (lideres.length === 0) await registrarEvento(tx, { ...evento, tipo: "visto_bueno_omitido", usuarioId: null });

    const { codigo, texto } = await rotuloDeTramite(tx, { tipo: datos.tipo, ...destino });
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "tramite_solicitar",
      entidad: "tramite",
      entidadId: tramiteId,
      detalle: { numero, codigo, documentoId: destino.documentoId, de: null, hacia: etapa, ronda: 0, tipo: datos.tipo, motivo: datos.motivo },
    });
    await enviarAvisos(tx, tramiteId, sesion.usuarioId, [
      etapa === "aceptacion"
        ? { usuarioIds: await adminsActivos({ sql: tx }), tipo: "tramite.paso", titulo: `Solicitud ${numero} por aceptar`, cuerpo: texto }
        : { usuarioIds: lideres, tipo: "tramite.paso", titulo: `Solicitud ${numero} espera su visto bueno`, cuerpo: texto },
    ]);
    return { tramiteId, numero, etapa };
  });
}

type Comprobacion = { tramite: FilaTramite; hacia: Etapa; firmas: Firma[]; sumaRonda: boolean; manejador: Manejador };

/** Solo lee: dice si la acción procede. Corre antes de la firma y otra vez con la fila bloqueada. */
async function comprobar(
  sql: Cliente,
  sesion: SesionFlujo,
  entrada: EntradaTransicion,
  config: ConfigDocumental,
  bloquear: boolean,
): Promise<Comprobacion> {
  const visto = await tramiteVisto(sql, entrada.tramiteId, sesion, bloquear);
  if (!visto?.visible) throw new ErrorTramite("El trámite no existe");
  const { tramite, lideraPropietario } = visto;
  if (tramite.etapa !== entrada.etapaEsperada || tramite.ronda !== entrada.rondaEsperada)
    throw new ErrorTramite(CAMBIO_MIENTRAS);

  const veredicto = evaluarTransicion(entrada.accion, tramite, {
    usuarioId: sesion.usuarioId,
    rol: sesion.rol,
    lideraPropietario,
  });
  if (!veredicto.ok) throw new ErrorTramite(veredicto.motivo);
  const manejador = MANEJADORES[entrada.accion];
  if (!manejador) throw new ErrorTramite("Acción no disponible");
  await VALIDADORES[entrada.accion]?.({ sql, tramite, sesion, datos: entrada.datos ?? {}, config });
  return { tramite, hacia: veredicto.hacia, firmas: veredicto.firmas, sumaRonda: veredicto.sumaRonda, manejador };
}

function nuevoVencimiento(
  previo: FilaTramite,
  cambios: NonNullable<Efecto["cambios"]>,
  etapa: Etapa,
  ronda: number,
  ahora: Date,
  config: ConfigDocumental,
): Date | null {
  if (cambios.venceEn !== undefined) return cambios.venceEn;
  if (etapa === previo.etapa) return previo.venceEn;
  if (!esEtapaDeTrabajo(etapa)) return null;
  return fechaLimite(ahora, config.plazos[etapa === "elaboracion" && ronda > 1 ? "ajustes" : etapa], zonaHoraria());
}

async function huellaPrincipal(tx: TransactionSql, versionId: number | null): Promise<string> {
  const [archivo] = versionId === null ? [] : await tx`SELECT hash_sha256 FROM archivos WHERE version_id = ${versionId} AND rol = 'principal'`;
  if (!archivo) throw new ErrorTramite("Falta el archivo principal");
  return archivo.hash_sha256;
}

/** Lo que se firma después de elaborar es lo que firmó quien elaboró en esta ronda (spec 13A §10.4). */
async function exigirHuellaDelElaborador(tx: TransactionSql, tramite: FilaTramite, hashSha256: string): Promise<void> {
  const [elaboro] = await tx`SELECT hash_sha256 FROM firmas
    WHERE tramite_id = ${tramite.id} AND firma = 'elaboro' AND ronda = ${tramite.ronda}
    ORDER BY id DESC LIMIT 1`;
  if (elaboro?.hash_sha256 !== hashSha256) throw new ErrorTramite(ARCHIVO_CAMBIADO);
}

/** Las marcas de aviso son de la etapa: al cambiar de etapa se limpian, diga lo que diga el manejador. */
export function conservaMarcas(efecto: Efecto, hacia: Etapa, etapaPrevia: Etapa): boolean {
  return efecto.conservarAvisos === true && hacia === etapaPrevia;
}

/**
 * Hace una transición. La firma se verifica fuera de la transacción: usa otras conexiones del
 * pool y Argon2 tarda, y no debe gastarse si la acción no procede. Por eso todo se comprueba
 * antes de firmar y se repite con la fila bloqueada: otra pestaña pudo adelantarse entre tanto.
 */
export async function transicionar(
  sesion: SesionFlujo,
  entrada: EntradaTransicion,
  opciones: OpcionesFlujo = {},
): Promise<{ etapa: Etapa; ronda: number }> {
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };
  const config = await obtenerConfigDocumental({ sql });

  const { firmas } = await comprobar(sql, sesion, entrada, config, false);
  let metodo: "clave" | "clave_totp" = "clave";
  if (firmas.length > 0) {
    if (!entrada.credenciales) throw new ErrorFirma("Escriba su clave para firmar", false);
    const verificar = opciones.verificar ?? verificarParaFirmar;
    const r = await verificar(sesion, entrada.credenciales, contexto, ahora);
    if (!r.ok) throw new ErrorFirma(r.mensaje, r.sesionCerrada);
    metodo = r.metodo;
  }

  return enTransaccion(sql, async (tx) => {
    const { tramite: previo, hacia, sumaRonda, manejador } = await comprobar(tx, sesion, entrada, config, true);
    const datos = entrada.datos ?? {};
    const efecto = (await manejador({ tx, tramite: previo, sesion, datos, ahora, config, hacia })) ?? {};

    const cambios = Object.fromEntries(
      Object.entries(efecto.cambios ?? {}).filter(([, valor]) => valor !== undefined),
    ) as NonNullable<Efecto["cambios"]>;
    const t: FilaTramite = { ...previo, ...cambios, etapa: hacia, ronda: previo.ronda + (sumaRonda ? 1 : 0) };
    const venceEn = nuevoVencimiento(previo, cambios, t.etapa, t.ronda, ahora, config);
    await tx`UPDATE tramites SET
        etapa = ${t.etapa}, ronda = ${t.ronda}, tipo = ${t.tipo}, proceso_id = ${t.procesoId},
        subproceso_id = ${t.subprocesoId}, tipo_documento_id = ${t.tipoDocumentoId}, documento_id = ${t.documentoId},
        version_id = ${t.versionId}, titulo_propuesto = ${t.tituloPropuesto}, elaborador_id = ${t.elaboradorId},
        revisor_id = ${t.revisorId}, aprobador_id = ${t.aprobadorId}, motivo_cierre = ${t.motivoCierre},
        vence_en = ${venceEn}, ${conservaMarcas(efecto, hacia, previo.etapa) ? tx`` : tx`aviso_vencido_en = NULL, escalado_en = NULL,`}
        cerrado_en = ${esEtapaDeTrabajo(t.etapa) ? null : ahora}, actualizado_en = ${ahora}
      WHERE id = ${t.id}`.catch(traducirChoqueDeAbierto);

    if (firmas.length > 0) {
      const hashSha256 = await huellaPrincipal(tx, t.versionId);
      if (t.tipo !== "eliminar" && firmas.some((firma) => firma !== "elaboro")) {
        await exigirHuellaDelElaborador(tx, t, hashSha256);
      }
      for (const firma of firmas) {
        await registrarFirma(tx, {
          tramiteId: t.id,
          versionId: t.versionId,
          usuarioId: sesion.usuarioId,
          firma,
          ronda: t.ronda,
          hashSha256,
          metodo,
          contexto,
          ahora,
        });
      }
    }

    await registrarEvento(tx, { tramiteId: t.id, tipo: entrada.accion, usuarioId: sesion.usuarioId, ronda: t.ronda, detalle: efecto.detalle, ahora });
    const { codigo } = await rotuloDeTramite(tx, t);
    // El acta congelada ya está en el evento; la bitácora no la repite.
    const detalleDeAuditoria: Record<string, unknown> = { ...efecto.detalle };
    delete detalleDeAuditoria.acta;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: `tramite_${entrada.accion}`,
      entidad: "tramite",
      entidadId: t.id,
      detalle: { numero: t.numero, codigo, documentoId: t.documentoId, ...detalleDeAuditoria, ...efecto.auditoria, de: previo.etapa, hacia, ronda: t.ronda },
    });
    await enviarAvisos(tx, t.id, sesion.usuarioId, efecto.avisos ?? []);
    return { etapa: t.etapa, ronda: t.ronda };
  });
}
