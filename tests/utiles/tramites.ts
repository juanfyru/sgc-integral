/**
 * Ayudantes de todos los tests del flujo documental. Corren dentro de una transacción que
 * se revierte (`revertida`): lo que crean aquí no sobrevive al test.
 */
import { createHash } from "node:crypto";
import { mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { guardarControlCambios } from "@/db/consultas/tramites-archivos";
import { crearSolicitud, transicionar, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import { resolverRutaAlmacen } from "@/lib/almacen";
import type { Rol } from "@/lib/roles";
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
  versionId: number | null;
  ronda: number;
  admin: SesionFlujo;
  elaborador: SesionFlujo;
  revisor: SesionFlujo;
  aprobador: SesionFlujo;
  limpiar: () => Promise<void>;
};

/**
 * Lleva un trámite hasta `etapa` con las funciones reales. Por defecto, una modificación de
 * GTH-PR-02 pedida por `lider.gth`, que también elabora. Una creación es un formato nuevo de CEX
 * pedido por `lider.cex`, y `codigo` es el del documento que nace. Si el trámite ya tiene archivo,
 * el test llama `limpiar` en un `finally`. Quien aprueba por defecto es un `admin_sgc`: un
 * documento estratégico, o uno que elabora un `admin_sgc`, necesita que le pasen `aprobador`.
 */
export async function tramiteEn(
  tx: TransactionSql,
  etapa: EtapaTrabajo,
  o: { codigo?: string; tipo?: TipoSolicitud; elaborador?: SesionFlujo; revisor?: SesionFlujo; aprobador?: SesionFlujo } = {},
): Promise<Trayecto> {
  const tipo = o.tipo ?? "modificar";
  const crea = tipo === "crear";
  if (crea && etapa === "visto_bueno") throw new Error("La creación de prueba la pide el líder: ya trae el visto bueno");

  const admin = await sesionAdmin(tx);
  const lider = await sesionDe(tx, crea ? "lider.cex" : "lider.gth");
  const elaborador = o.elaborador ?? lider;
  const revisor = o.revisor ?? (await usuarioDePrueba(tx, { rol: "lider_proceso" }));
  const aprobador = o.aprobador ?? (await sesionAdmin(tx));
  const pedirSobreDocumento = async () => {
    const [{ id: documentoId }] = await tx`SELECT id FROM documentos WHERE codigo = ${o.codigo ?? "GTH-PR-02"}`;
    // Si pide un administrador, el visto bueno queda pendiente; si pide el líder, queda dado.
    return crearSolicitud(
      etapa === "visto_bueno" ? admin : lider,
      { tipo, motivo: "mejora", justificacion: "Se ajusta el documento al proceso actual.", documentoId },
      opc(tx),
    );
  };
  const { tramiteId } = crea
    ? await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato de prueba del flujo" })
    : await pedirSobreDocumento();
  const trayecto = async (limpiar = async () => {}): Promise<Trayecto> => {
    const [t] = await tx`SELECT version_id, ronda FROM tramites WHERE id = ${tramiteId}`;
    const versionId = t.version_id === null ? null : Number(t.version_id);
    return { tramiteId, versionId, ronda: t.ronda, admin, elaborador, revisor, aprobador, limpiar };
  };
  if (etapa === "visto_bueno" || etapa === "aceptacion") return trayecto();

  const datosDeAceptar = () => {
    if (tipo === "eliminar") return { aprobadorId: aprobador.usuarioId };
    const responsables = { elaboradorId: elaborador.usuarioId, revisorId: revisor.usuarioId, aprobadorId: aprobador.usuarioId };
    return crea
      ? aceptarCreacion({ codigo: o.codigo ?? "CEX-FO-01", ...responsables })
      : { ...responsables, venceElaboracion: "2026-11-20" };
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
  if (etapa !== "revision" || tipo === "eliminar") throw new Error(`tramiteEn todavía no llega a ${etapa} en ${tipo}`);

  const { versionId } = await trayecto();
  const archivo = await archivoPrincipal(tx, versionId!);
  try {
    await guardarControlCambios(tramiteId, elaborador, "Se añade la inducción por servicio.", { sql: tx });
    await transicionar(
      elaborador,
      { tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } },
      opc(tx),
    );
    return await trayecto(archivo.limpiar);
  } catch (err) {
    await archivo.limpiar();
    throw err;
  }
}
