/**
 * Corrección de los datos de control mientras nadie ha aprobado (spec 13A §8.6). No es una
 * transición: el trámite sigue en su etapa y su ronda, por eso no pasa por `transicionar`. Vive
 * fuera de `flujo/`, junto a `revision.ts`, porque registra su evento y sus avisos con
 * `tramites-flujo.ts`, que un archivo de `flujo/` no puede importar.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import {
  codigoAbandonado,
  errorDeCodigoRepetido,
  exigirFormatoDeCodigo,
  exigirSiglasDelCodigo,
  sugerirCodigo,
} from "@/db/consultas/codigos";
import { rotuloDeTramite, tipoDeDocumento, tramiteVisto } from "@/db/consultas/tramites";
import { enviarAvisos, registrarEvento } from "@/db/consultas/tramites-flujo";
import type { DatosCorreccion } from "@/lib/esquemas/tramites";
import { puede } from "@/lib/permisos";
import { ETAPAS_CON_CORRECCION, esEtapaDeTrabajo } from "@/lib/tramites/tipos";
import { exigirDesignacion, propietarioElegido } from "./flujo/aceptacion";
import { CAMBIO_MIENTRAS, ErrorTramite, enTransaccion, type Aviso, type FilaTramite, type SesionFlujo } from "./flujo/contrato";
import { exigirQueNoElaboro, relevoDe } from "./flujo/gestion";
import type { Esperado } from "./revision";

/** Solo lo que cambió, para la evidencia. null si nada cambió. */
type Correccion = { detalle: Record<string, unknown>; avisos?: Aviso[] } | null;

type Propietario = Pick<FilaTramite, "procesoId" | "subprocesoId">;

const SOLO_EN_CREACION = ["codigo", "tipoDocumentoId", "procesoId", "subprocesoId", "aprobadorId"] as const;

const distinto = <T>(nuevo: T | undefined, actual: T): T | null => (nuevo !== undefined && nuevo !== actual ? nuevo : null);

/** En una modificación el documento vigente no cambia: el título nuevo espera en el trámite hasta publicar. */
async function corregirModificacion(tx: TransactionSql, tramite: FilaTramite, datos: DatosCorreccion, ahora: Date): Promise<Correccion> {
  if (SOLO_EN_CREACION.some((dato) => datos[dato] !== undefined)) throw new ErrorTramite("En una modificación solo se corrige el título");
  const [documento] = await tx`SELECT titulo FROM documentos WHERE id = ${tramite.documentoId}`;
  const anterior: string = tramite.tituloPropuesto ?? documento.titulo;
  if (datos.titulo === undefined || datos.titulo === anterior) return null;
  await tx`UPDATE tramites SET titulo_propuesto = ${datos.titulo === documento.titulo ? null : datos.titulo}, actualizado_en = ${ahora}
    WHERE id = ${tramite.id}`;
  return { detalle: { antes: { titulo: anterior }, despues: { titulo: datos.titulo } } };
}

/**
 * El propietario elegido, validado como en la aceptación; null si es el que ya tiene. Esa
 * comparación va primero: que el actual se haya desactivado no debe impedir corregir otro dato.
 */
async function propietarioNuevo(
  tx: TransactionSql,
  tramite: FilaTramite,
  { procesoId, subprocesoId }: DatosCorreccion,
): Promise<Propietario | null> {
  if (procesoId === undefined && subprocesoId === undefined) return null;
  const esElActual =
    subprocesoId === undefined
      ? procesoId === tramite.procesoId && tramite.subprocesoId === null
      : subprocesoId === tramite.subprocesoId && (procesoId === undefined || procesoId === tramite.procesoId);
  if (esElActual) return null;
  const elegido = await propietarioElegido(tx, { procesoId, subprocesoId, esPrincipal: true });
  if (procesoId !== undefined && elegido.procesoId !== procesoId) throw new ErrorTramite("El subproceso no es de ese proceso");
  return elegido;
}

async function nombreDelPropietario(tx: TransactionSql, { procesoId, subprocesoId }: Propietario): Promise<string> {
  const [p] = await tx`SELECT p.nombre AS proceso, s.nombre AS subproceso
    FROM procesos p LEFT JOIN subprocesos s ON s.id = ${subprocesoId}
    WHERE p.id = ${procesoId}`;
  return p.subproceso ? `${p.proceso} › ${p.subproceso}` : p.proceso;
}

/** Una asociación secundaria al mismo destino sobraría: la principal ocupa su lugar. Dice si retiró una. */
async function moverAsociacionPrincipal(tx: TransactionSql, documentoId: number | null, { procesoId, subprocesoId }: Propietario): Promise<boolean> {
  const proceso = subprocesoId === null ? procesoId : null;
  const retiradas = await tx`DELETE FROM documento_proceso WHERE documento_id = ${documentoId} AND NOT es_principal
    AND proceso_id IS NOT DISTINCT FROM ${proceso} AND subproceso_id IS NOT DISTINCT FROM ${subprocesoId}
    RETURNING id`;
  await tx`UPDATE documento_proceso SET proceso_id = ${proceso}, subproceso_id = ${subprocesoId}
    WHERE documento_id = ${documentoId} AND es_principal`;
  return retiradas.length > 0;
}

/** Otro tipo puede pedir otro aprobador: se valida el conjunto completo con la autoridad nueva. */
async function exigirTipo(tx: TransactionSql, tramite: FilaTramite, tipoId: number, aprobadorId: number | undefined) {
  const tipo = await tipoDeDocumento(tipoId, { sql: tx });
  if (!tipo?.activo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");
  if (aprobadorId === tramite.aprobadorId) throw new ErrorTramite("Esa persona ya tiene ese papel");
  if (aprobadorId !== undefined) await exigirQueNoElaboro(tx, tramite.id, aprobadorId, "aprobador");
  const { elaboradorId, revisorId } = tramite;
  const designados = await exigirDesignacion(
    tx,
    tramite,
    "crear",
    tipo.autoridad,
    { elaboradorId, revisorId, aprobadorId: aprobadorId ?? tramite.aprobadorId },
    aprobadorId === undefined ? [] : [aprobadorId],
  );
  return { nombre: tipo.nombre, aprobador: designados.aprobador };
}

/** En una creación nadie ve todavía el documento: se corrige en él, y el trámite lo sigue. */
async function corregirCreacion(tx: TransactionSql, tramite: FilaTramite, datos: DatosCorreccion, ahora: Date): Promise<Correccion> {
  const [documento] = await tx`SELECT d.titulo, d.codigo, d.tipo_id, t.nombre AS tipo
    FROM documentos d JOIN tipos_documento t ON t.id = d.tipo_id
    WHERE d.id = ${tramite.documentoId}`;
  const titulo = distinto(datos.titulo, documento.titulo as string);
  const codigo = distinto(datos.codigo, documento.codigo as string);
  const tipoId = distinto(datos.tipoDocumentoId, Number(documento.tipo_id));
  const propietario = await propietarioNuevo(tx, tramite, datos);
  const { aprobadorId } = datos;
  if (aprobadorId !== undefined && tipoId === null) throw new ErrorTramite("Quien aprueba solo cambia junto al tipo");
  if (titulo === null && codigo === null && tipoId === null && propietario === null) return null;

  const tipoNuevo = tipoId === null ? null : await exigirTipo(tx, tramite, tipoId, aprobadorId);
  const destino = { procesoId: propietario?.procesoId ?? tramite.procesoId, tipoDocumentoId: tipoId ?? Number(documento.tipo_id) };
  if (codigo !== null) await exigirFormatoDeCodigo(tx, codigo, destino);
  // Corregir el tipo o el propietario también puede dejar el código sin sus siglas: se cambian juntos.
  if (codigo !== null || tipoId !== null || propietario !== null) await exigirSiglasDelCodigo(tx, codigo ?? documento.codigo, destino);
  if (codigo !== null && (await codigoAbandonado(codigo, tramite.id, { sql: tx }))) throw errorDeCodigoRepetido(await sugerirCodigo(destino, { sql: tx }));

  const repetido = await tx
    .savepoint((s) => s`UPDATE documentos SET
        titulo = ${titulo ?? documento.titulo}, codigo = ${codigo ?? documento.codigo}, tipo_id = ${destino.tipoDocumentoId}, actualizado_en = ${ahora}
      WHERE id = ${tramite.documentoId}`)
    .then(
      () => false,
      (err: { constraint_name?: string }) => {
        if (err.constraint_name === "documentos_codigo_unique") return true;
        throw err;
      },
    );
  if (repetido) throw errorDeCodigoRepetido(await sugerirCodigo(destino, { sql: tx }));
  const secundariaRetirada = propietario ? await moverAsociacionPrincipal(tx, tramite.documentoId, propietario) : false;
  await tx`UPDATE tramites SET
      tipo_documento_id = ${destino.tipoDocumentoId}, proceso_id = ${destino.procesoId},
      subproceso_id = ${propietario ? propietario.subprocesoId : tramite.subprocesoId},
      aprobador_id = ${aprobadorId ?? tramite.aprobadorId}, actualizado_en = ${ahora}
    WHERE id = ${tramite.id}`;

  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};
  const anotar = (dato: string, de: unknown, a: unknown) => {
    antes[dato] = de;
    despues[dato] = a;
  };
  if (titulo !== null) anotar("titulo", documento.titulo, titulo);
  if (codigo !== null) anotar("codigo", documento.codigo, codigo);
  if (tipoNuevo) anotar("tipo", documento.tipo, tipoNuevo.nombre);
  if (propietario) anotar("proceso", await nombreDelPropietario(tx, tramite), await nombreDelPropietario(tx, propietario));
  const evidencia = {
    antes,
    despues,
    ...(propietario && secundariaRetirada ? { secundariaRetirada: await nombreDelPropietario(tx, propietario) } : {}),
  };
  if (aprobadorId === undefined) return { detalle: evidencia };

  const { texto } = await rotuloDeTramite(tx, tramite);
  const relevo = await relevoDe(tx, tramite, "aprobador", aprobadorId, texto);
  return {
    detalle: { ...evidencia, aprobador: { de: relevo.de, a: tipoNuevo?.aprobador } },
    avisos: [relevo.entra, relevo.sale],
  };
}

/** La marca de socialización: «sí» pide una jornada al publicar. Nada más cambia. */
async function corregirMarca(tx: TransactionSql, tramite: FilaTramite, marca: boolean, ahora: Date) {
  await tx`UPDATE tramites SET requiere_socializacion = ${marca}, actualizado_en = ${ahora} WHERE id = ${tramite.id}`;
  const texto = (v: boolean) => (v ? "sí" : "no");
  return { antes: { socializacion: texto(tramite.requiereSocializacion) }, despues: { socializacion: texto(marca) } };
}

/** Corrige los datos de control. `esperado` es lo que vio la persona: si el trámite cambió, no se escribe. */
export async function corregirDatosDeControl(
  tramiteId: number,
  sesion: SesionFlujo,
  datos: DatosCorreccion,
  esperado: Esperado,
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<void> {
  if (!puede(sesion, "tramites.gestionar")) throw new ErrorTramite("Sin permiso para esta acción");
  const { requiereSocializacion: marca, ...datosDelDocumento } = datos;
  const cambiaDocumento = Object.values(datosDelDocumento).some((v) => v !== undefined);
  if (marca !== undefined && !puede(sesion, "distribucion.gestionar")) throw new ErrorTramite("Sin permiso para esta acción");
  const ahora = opciones?.ahora ?? new Date();
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const visto = await tramiteVisto(tx, tramiteId, sesion, true);
    if (!visto?.visible) throw new ErrorTramite("El trámite no existe");
    const { tramite } = visto;
    if (tramite.etapa !== esperado.etapa || tramite.ronda !== esperado.ronda) throw new ErrorTramite(CAMBIO_MIENTRAS);
    // La marca de socialización se corrige en toda etapa de trabajo; los datos del documento, solo hasta la revisión.
    if (cambiaDocumento && !ETAPAS_CON_CORRECCION.includes(tramite.etapa)) throw new ErrorTramite("Desde la aprobación los datos del documento quedan fijos");
    if (!esEtapaDeTrabajo(tramite.etapa)) throw new ErrorTramite("El trámite ya está cerrado");

    const delDocumento = cambiaDocumento
      ? tramite.tipo === "crear"
        ? await corregirCreacion(tx, tramite, datosDelDocumento, ahora)
        : await corregirModificacion(tx, tramite, datosDelDocumento, ahora)
      : null;
    const delaMarca = marca !== undefined && marca !== tramite.requiereSocializacion ? await corregirMarca(tx, tramite, marca, ahora) : null;
    if (!delDocumento && !delaMarca) throw new ErrorTramite("No hay cambios que guardar");
    const correccion: NonNullable<Correccion> = {
      detalle: {
        ...delDocumento?.detalle,
        ...(delaMarca
          ? {
              antes: { ...(delDocumento?.detalle.antes as object), ...delaMarca.antes },
              despues: { ...(delDocumento?.detalle.despues as object), ...delaMarca.despues },
            }
          : {}),
      },
      avisos: delDocumento?.avisos,
    };

    const { detalle } = correccion;
    await registrarEvento(tx, { tramiteId, tipo: "corregir_datos", usuarioId: sesion.usuarioId, ronda: tramite.ronda, detalle, ahora });
    const { codigo } = await rotuloDeTramite(tx, tramite);
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "tramite_corregir_datos",
      entidad: "tramite",
      entidadId: tramiteId,
      detalle: { numero: tramite.numero, codigo, documentoId: tramite.documentoId, ronda: tramite.ronda, ...detalle },
    });
    await enviarAvisos(tx, tramiteId, sesion.usuarioId, correccion.avisos ?? []);
  });
}
