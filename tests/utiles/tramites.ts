/**
 * Ayudantes de todos los tests del flujo documental. Corren dentro de una transacción que
 * se revierte (`revertida`): lo que crean aquí no sobrevive al test.
 */
import { createHash } from "node:crypto";
import { mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { criteriosNoCumplen, guardarVerificacion, listarItemsVerificacion } from "@/db/consultas/revision";
import { guardarControlCambios } from "@/db/consultas/tramites-archivos";
import { crearSolicitud, transicionar, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import { resolverRutaAlmacen } from "@/lib/almacen";
import type { Rol } from "@/lib/roles";
import { huellaDeCriterios } from "@/lib/tramites/criterios";
import type { EtapaTrabajo, TipoSolicitud } from "@/lib/tramites/tipos";
import { pdfDePrueba } from "./pdf";

function aSesion(u: Row): SesionFlujo {
  return {
    sesionId: `prueba-${u.id}`,
    usuarioId: Number(u.id),
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    verHistorial: u.ver_historial,
  };
}

/** Lee a un usuario que ya existe, por ejemplo uno de la demo. */
export async function sesionDe(sql: Cliente, usuario: string): Promise<SesionFlujo> {
  const [u] = await sql`SELECT id, usuario, nombre, rol, ver_historial FROM usuarios WHERE usuario = ${usuario}`;
  if (!u) throw new Error(`No existe el usuario de prueba «${usuario}»`);
  return aSesion(u);
}

let consecutivo = 0;

/** Un número que no se repite: lo que crea un test no choca con lo que se acumule en la demo. */
function unico(): string {
  consecutivo += 1;
  return `${Date.now() % 100_000_000}${consecutivo}`;
}

export type DocumentoLibre = { id: number; codigo: string; titulo: string };

/**
 * Crea dentro de la transacción un documento vigente en su versión 1, sin trámites y con archivo
 * principal (solo la fila: no hay archivo en disco). Los tests no dependen de cómo esté un documento
 * de la demo: la misma base se usa a mano, y ahí cualquiera puede tener un trámite o una versión más.
 */
export async function documentoLibre(
  tx: TransactionSql,
  d: { proceso: string; tipo: string; titulo?: string; subproceso?: string },
): Promise<DocumentoLibre> {
  const codigo = `${d.proceso}-${d.tipo}-${unico()}`;
  const titulo = d.titulo ?? `Documento de prueba ${codigo}`;
  const [{ id }] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id)
    SELECT ${codigo}, ${titulo}, id FROM tipos_documento WHERE sigla = ${d.tipo}
    RETURNING id`;
  const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado, aprobo, fecha_aprobacion)
    VALUES (${id}, 1, 'vigente', 'Prueba', '2026-01-01') RETURNING id`;
  await tx`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (${version.id}, 'principal', ${`zz-pruebas/${codigo}/principal.pdf`}, 'principal.pdf', 'pdf', 'application/pdf', 1, ${"0".repeat(64)})`;
  if (d.subproceso) {
    await tx`INSERT INTO documento_proceso (documento_id, subproceso_id, es_principal)
      SELECT ${id}, s.id, true FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id
      WHERE p.sigla = ${d.proceso} AND s.slug = ${d.subproceso}`;
  } else {
    await tx`INSERT INTO documento_proceso (documento_id, proceso_id, es_principal)
      SELECT ${id}, id, true FROM procesos WHERE sigla = ${d.proceso}`;
  }
  return { id: Number(id), codigo, titulo };
}

/**
 * La sigla de un tipo que solo existe en la transacción: como no tiene documentos, sus códigos y
 * su consecutivo son los del test (`CEX-ZP-01`), aunque en la demo ya se hayan creado formatos.
 */
export const TIPO_LIBRE = "ZP";

export async function tipoLibre(tx: TransactionSql): Promise<number> {
  await tx`INSERT INTO tipos_documento (nombre, sigla, orden, autoridad, es_diligenciable)
    VALUES ('Tipo de prueba', ${TIPO_LIBRE}, 99, 'operativo', true)
    ON CONFLICT (sigla) DO NOTHING`;
  const [{ id }] = await tx`SELECT id FROM tipos_documento WHERE sigla = ${TIPO_LIBRE}`;
  return Number(id);
}

/** Crea un usuario activo dentro de la transacción; `procesos` son ids de `procesos`. */
export async function usuarioDePrueba(
  tx: TransactionSql,
  datos: { rol: Rol; procesos?: number[]; jefeId?: number },
): Promise<SesionFlujo> {
  consecutivo += 1;
  const usuario = `zz_tramite_${Date.now()}_${consecutivo}`;
  const [u] = await tx`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, jefe_inmediato_id)
    VALUES (${usuario}, ${`Prueba ${consecutivo}`}, 'x', ${datos.rol}, ${datos.jefeId ?? null})
    RETURNING id, usuario, nombre, rol, ver_historial`;
  for (const procesoId of datos.procesos ?? []) {
    await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${u.id}, ${procesoId})`;
  }
  return aSesion(u);
}

export function sesionAdmin(tx: TransactionSql): Promise<SesionFlujo> {
  return usuarioDePrueba(tx, { rol: "admin_sgc" });
}

/** Opciones del flujo para un test: la transacción, una hora fija y una firma que siempre pasa. */
export function opc(tx: TransactionSql, ahora = "2026-11-05T15:00:00Z"): OpcionesFlujo {
  return { sql: tx, ahora: new Date(ahora), verificar: async () => ({ ok: true, metodo: "clave" }) };
}

/** Lo que `aceptarCreacion`, que no consulta la BD, necesita de la última solicitud de creación. */
let ultimaSolicitud: { procesoId: number; tipoDocumentoId: number; titulo: string } | null = null;

/** Deja una creación en `aceptacion`: la pide el líder de CEX, así que el visto bueno queda dado. */
export async function solicitudDeCreacion(tx: TransactionSql, d: { proceso: string; tipo: string; titulo: string }) {
  const admin = await sesionAdmin(tx);
  const gerente = await sesionDe(tx, "gerente");
  const liderCex = await sesionDe(tx, "lider.cex");
  await tipoLibre(tx);
  const [{ id: procesoId }] = await tx`SELECT id FROM procesos WHERE sigla = ${d.proceso}`;
  const [{ id: tipoDocumentoId }] = await tx`SELECT id FROM tipos_documento WHERE sigla = ${d.tipo}`;
  const { tramiteId } = await crearSolicitud(
    liderCex,
    { tipo: "crear", motivo: "solicitud_personal", justificacion: "Se necesita para la atención.", procesoId, tipoDocumentoId, tituloPropuesto: d.titulo },
    opc(tx),
  );
  ultimaSolicitud = { procesoId, tipoDocumentoId, titulo: d.titulo };
  return { admin, gerente, liderCex, tramiteId, procesoId, tipoDocumentoId };
}

/** Los datos de `aceptar` en la última creación, como salen de `EsquemaAceptarCreacion`. */
export function aceptarCreacion(parcial: Record<string, unknown>): Record<string, unknown> {
  if (!ultimaSolicitud) throw new Error("aceptarCreacion va después de solicitudDeCreacion");
  const { procesoId, tipoDocumentoId, titulo } = ultimaSolicitud;
  return {
    decision: "nuevo",
    tipoDocumentoId,
    asociaciones: [{ procesoId, esPrincipal: true }],
    titulo,
    relacionados: [],
    nivelAcceso: "general",
    venceElaboracion: "2026-11-20",
    ...parcial,
  };
}

/**
 * Escribe un PDF real en el almacén y registra su fila con la huella verdadera, porque publicar
 * la vuelve a calcular en disco. La fila se revierte con el test; el archivo lo borra `limpiar`.
 */
export async function archivoPrincipal(
  tx: TransactionSql,
  versionId: number,
): Promise<{ archivoId: number; hash: string; limpiar: () => Promise<void> }> {
  consecutivo += 1;
  const ruta = `zz-pruebas/${Date.now()}-${consecutivo}/principal.pdf`;
  const absoluta = resolverRutaAlmacen(ruta);
  if (!absoluta) throw new Error(`Ruta inválida en el almacén: ${ruta}`);
  const carpeta = path.dirname(absoluta);
  const limpiar = async () => {
    await rm(carpeta, { recursive: true, force: true });
    await rmdir(path.dirname(carpeta)).catch(() => {}); // Solo se borra si quedó vacía.
  };

  const bytes = await pdfDePrueba([[200, 200]]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  try {
    await mkdir(carpeta, { recursive: true });
    await writeFile(absoluta, bytes);
    const [fila] = await tx`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
      VALUES (${versionId}, 'principal', ${ruta}, 'principal.pdf', 'pdf', 'application/pdf', ${bytes.byteLength}, ${hash})
      RETURNING id`;
    return { archivoId: Number(fila.id), hash, limpiar };
  } catch (err) {
    await limpiar();
    throw err;
  }
}

type Trayecto = {
  tramiteId: number;
  /** El documento del trámite; en una creación, el que nace al aceptar. */
  codigo: string;
  titulo: string;
  versionId: number | null;
  ronda: number;
  admin: SesionFlujo;
  elaborador: SesionFlujo;
  revisor: SesionFlujo;
  aprobador: SesionFlujo;
  limpiar: () => Promise<void>;
};

/**
 * Lleva un trámite hasta `etapa` con las funciones reales. Por defecto, una modificación pedida
 * por `lider.gth`, que también elabora, sobre un documento de GTH que nace aquí (`documentoLibre`),
 * del tipo `tipoDocumento`: procedimiento si no se dice. `codigo` escoge otro que ya exista, como
 * el que dejó un trámite anterior del mismo test. Una creación es un documento nuevo de CEX, de
 * `TIPO_LIBRE`, pedido por `lider.cex`, y `codigo` es el del documento que nace. Si el trámite ya
 * tiene archivo, el test llama `limpiar` en un `finally`. Quien aprueba por defecto es un
 * `admin_sgc`: un documento estratégico, o uno que elabora un `admin_sgc`, necesita que le pasen
 * `aprobador`. `tituloNuevo` es el título propuesto de una modificación, el que se decide al aceptar.
 */
export async function tramiteEn(
  tx: TransactionSql,
  etapa: EtapaTrabajo,
  o: {
    codigo?: string;
    tipo?: TipoSolicitud;
    tipoDocumento?: string;
    elaborador?: SesionFlujo;
    revisor?: SesionFlujo;
    aprobador?: SesionFlujo;
    tituloNuevo?: string;
  } = {},
): Promise<Trayecto> {
  const tipo = o.tipo ?? "modificar";
  const crea = tipo === "crear";
  if (crea && etapa === "visto_bueno") throw new Error("La creación de prueba la pide el líder: ya trae el visto bueno");

  const admin = await sesionAdmin(tx);
  const lider = await sesionDe(tx, crea ? "lider.cex" : "lider.gth");
  const elaborador = o.elaborador ?? lider;
  const revisor = o.revisor ?? (await usuarioDePrueba(tx, { rol: "lider_proceso" }));
  const aprobador = o.aprobador ?? (await sesionAdmin(tx));
  const documentoDelTramite = async (): Promise<DocumentoLibre> => {
    if (o.codigo === undefined) return documentoLibre(tx, { proceso: "GTH", tipo: o.tipoDocumento ?? "PR" });
    const [d] = await tx`SELECT id, codigo, titulo FROM documentos WHERE codigo = ${o.codigo}`;
    return { id: Number(d.id), codigo: d.codigo, titulo: d.titulo };
  };
  const pedirSobre = async ({ id: documentoId }: DocumentoLibre) =>
    // Si pide un administrador, el visto bueno queda pendiente; si pide el líder, queda dado.
    crearSolicitud(
      etapa === "visto_bueno" ? admin : lider,
      { tipo, motivo: "mejora", justificacion: "Se ajusta el documento al proceso actual.", documentoId },
      opc(tx),
    );
  const creado = { codigo: o.codigo ?? `CEX-${TIPO_LIBRE}-01`, titulo: "Formato de prueba del flujo" };
  const documento = crea ? null : await documentoDelTramite();
  const { tramiteId } =
    documento === null
      ? await solicitudDeCreacion(tx, { proceso: "CEX", tipo: TIPO_LIBRE, titulo: creado.titulo })
      : await pedirSobre(documento);
  const { codigo, titulo } = documento ?? creado;
  const trayecto = async (limpiar = async () => {}): Promise<Trayecto> => {
    const [t] = await tx`SELECT version_id, ronda FROM tramites WHERE id = ${tramiteId}`;
    const versionId = t.version_id === null ? null : Number(t.version_id);
    return { tramiteId, codigo, titulo, versionId, ronda: t.ronda, admin, elaborador, revisor, aprobador, limpiar };
  };
  if (etapa === "visto_bueno" || etapa === "aceptacion") return trayecto();

  const datosDeAceptar = () => {
    if (tipo === "eliminar") return { aprobadorId: aprobador.usuarioId };
    const responsables = { elaboradorId: elaborador.usuarioId, revisorId: revisor.usuarioId, aprobadorId: aprobador.usuarioId };
    return crea
      ? aceptarCreacion({ codigo, ...responsables })
      : { ...responsables, venceElaboracion: "2026-11-20", tituloNuevo: o.tituloNuevo };
  };
  await transicionar(
    admin,
    {
      tramiteId,
      accion: "aceptar",
      etapaEsperada: "aceptacion",
      rondaEsperada: 0,
      datos: datosDeAceptar(),
    },
    opc(tx),
  );
  if (etapa === (tipo === "eliminar" ? "aprobacion" : "elaboracion")) return trayecto();
  const aprobar = (rondaEsperada: number) =>
    transicionar(
      aprobador,
      { tramiteId, accion: "aprobar", etapaEsperada: "aprobacion", rondaEsperada, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } },
      opc(tx),
    );
  if (tipo === "eliminar") {
    if (etapa !== "publicacion") throw new Error(`tramiteEn no llega a ${etapa} en una eliminación`);
    await aprobar(0);
    return trayecto();
  }
  if (!["revision", "aprobacion", "publicacion"].includes(etapa)) throw new Error(`tramiteEn no llega a ${etapa} en ${tipo}`);

  const { versionId } = await trayecto();
  const archivo = await archivoPrincipal(tx, versionId!);
  try {
    await guardarControlCambios(tramiteId, elaborador, "Se añade la inducción por servicio.", { sql: tx });
    await transicionar(
      elaborador,
      { tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } },
      opc(tx),
    );
    if (etapa !== "revision") {
      const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
      await guardarVerificacion(tramiteId, revisor, items.map((i) => ({ itemId: i.id, resultado: "cumple" as const })), { etapa: "revision", ronda: 1 }, { sql: tx });
      await transicionar(
        revisor,
        { tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 1, datos: { concepto: "Cumple; listo para aprobación." }, credenciales: { clave: "x" } },
        opc(tx),
      );
    }
    if (etapa === "publicacion") await aprobar(1);
    return await trayecto(archivo.limpiar);
  } catch (err) {
    await archivo.limpiar();
    throw err;
  }
}

export const NOTA = "Se ajustará con la guía de redacción.";

/**
 * Lleva a aprobación un trámite con un criterio que no cumple y que el revisor aceptó. La lista ya
 * está guardada cuando corre `antesDelConcepto`: lo que le haga al ítem no cambia lo respondido.
 * El test llama `t.limpiar` en un `finally`.
 */
export async function aprobacionConCriterio(
  tx: TransactionSql,
  o: { antesDelConcepto?: (itemId: number) => PromiseLike<unknown> } = {},
) {
  const t = await tramiteEn(tx, "revision");
  try {
    const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
    const criterio = items.find((i) => !i.critico)!;
    await guardarVerificacion(t.tramiteId, t.revisor,
      items.map((i) => (i.id === criterio.id ? { itemId: i.id, resultado: "no_cumple" as const, nota: NOTA } : { itemId: i.id, resultado: "cumple" as const })),
      { etapa: "revision", ronda: t.ronda }, { sql: tx });
    await o.antesDelConcepto?.(criterio.id);
    const confirmaNoCumple = huellaDeCriterios(await criteriosNoCumplen(t.tramiteId, t.ronda, { sql: tx }));
    await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: t.ronda,
      datos: { concepto: "Cumple, con un criterio aceptado.", confirmaNoCumple }, credenciales: { clave: "x" } }, opc(tx));
    return { t, criterio, confirmaNoCumple };
  } catch (err) {
    await t.limpiar();
    throw err;
  }
}
