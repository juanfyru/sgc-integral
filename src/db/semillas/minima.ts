/**
 * Semilla mínima: lo indispensable para una instalación nueva (tipos de
 * documento genéricos y la configuración base). Sin mapa, sin documentos y
 * sin usuarios: el admin lo crea `npm run admin:asegurar`.
 */
import { rm } from "node:fs/promises";
import { sql as dsql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { rutaBaseAlmacen } from "../../lib/almacen";
import { FORMATO_CODIGO_DEFECTO } from "../../lib/tramites/codigo";
import * as e from "../esquema";

export type Db = PostgresJsDatabase;

/** Lista de verificación de la revisión (spec §5): los tres primeros son críticos. */
const ITEMS_VERIFICACION: ReadonlyArray<readonly [string, boolean]> = [
  ["Usa la plantilla vigente de su tipo", true],
  ["Código, versión y fecha en el encabezado", true],
  ["Tiene todas las secciones obligatorias", true],
  ["Es coherente con los demás documentos del SGC", false],
  ["Cumple los requisitos de ISO 9001:2015 que le aplican", false],
  ["Es aplicable a una institución de primer nivel", false],
  ["Cita la normativa vigente que le aplica", false],
  ["Define los registros que genera y su archivo", false],
];

const AVISO_DATOS_PERSONALES = [
  "TEXTO DE EJEMPLO — la entidad debe reemplazarlo por su política de tratamiento de datos personales. Al ingresar a este sistema, la entidad registra su usuario, cargo, dirección IP y las acciones que realiza, con el único fin de garantizar el control, la trazabilidad y la seguridad de la información documentada del sistema de gestión.",
  "Los datos se tratan conforme a la Ley 1581 de 2012 y se conservan mientras dure su vinculación. Puede ejercer sus derechos de conocer, actualizar y rectificar sus datos solicitándolo al administrador del sistema.",
].join("\n\n");

/** Vacía TODAS las tablas (reinicia identidades) y el almacén físico de archivos. */
export async function limpiarTodo(db: Db): Promise<void> {
  const almacen = rutaBaseAlmacen();
  console.log(`Limpiando almacén de archivos (${almacen})…`);
  await rm(almacen, { recursive: true, force: true });

  console.log("Limpiando tablas…");
  // Corre con el rol dueño (migrador): TRUNCATE no dispara los triggers de
  // inmutabilidad por fila y `sgc_app` no tiene ese privilegio.
  await db.execute(dsql`
    TRUNCATE macroprocesos, procesos, subprocesos, elementos_perifericos,
      configuracion, tipos_documento, documentos, documento_versiones,
      archivos, documento_proceso, documento_relaciones, areas, cargos,
      usuarios, usuario_procesos, sesiones, accesos, codigos_recuperacion,
      auditoria, eventos_consulta, busquedas, notificaciones,
      tramites, tramite_eventos, firmas, tramite_observaciones,
      tramite_verificaciones, lista_verificacion_items
    RESTART IDENTITY CASCADE
  `);
}

/** Tipos de documento genéricos y configuración mínima. Idempotente sobre tablas vacías. */
export async function sembrarBase(
  db: Db,
): Promise<{ tipoPorSigla: Record<string, number> }> {
  await db.insert(e.configuracion).values([
    { clave: "nombre_entidad", valor: "Entidad sin configurar" },
    { clave: "subtitulo_mapa", valor: "Enfoque basado en procesos — NTC ISO 9001:2015" },
    { clave: "sigla_entidad", valor: "SGC" },
    { clave: "color_primario", valor: "#1b4e8e" },
    { clave: "color_secundario", valor: "#2e9b47" },
    { clave: "lema", valor: "" },
    { clave: "titulo_phva", valor: "Mejora Continua" },
    { clave: "texto_phva", valor: "" },
    { clave: "formato_codigo", valor: FORMATO_CODIGO_DEFECTO },
    { clave: "plazo_visto_bueno_dias", valor: "3" },
    { clave: "plazo_aceptacion_dias", valor: "3" },
    { clave: "plazo_elaboracion_dias", valor: "15" },
    { clave: "plazo_ajustes_dias", valor: "5" },
    { clave: "plazo_revision_dias", valor: "5" },
    { clave: "plazo_aprobacion_dias", valor: "5" },
    { clave: "plazo_publicacion_dias", valor: "2" },
    { clave: "escalamiento_dias", valor: "3" },
    { clave: "publicacion_directa", valor: "1" },
    { clave: "aviso_datos_personales", valor: AVISO_DATOS_PERSONALES },
  ]);

  const tipos = await db
    .insert(e.tiposDocumento)
    .values([
      { nombre: "Caracterización", sigla: "CA", autoridad: "estrategico", esDiligenciable: false, orden: 1 },
      { nombre: "Manual", sigla: "MN", autoridad: "estrategico", esDiligenciable: false, orden: 2 },
      { nombre: "Procedimiento", sigla: "PR", autoridad: "operativo", esDiligenciable: false, orden: 3 },
      { nombre: "Instructivo", sigla: "IN", autoridad: "operativo", esDiligenciable: false, orden: 4 },
      { nombre: "Formato", sigla: "FO", autoridad: "operativo", esDiligenciable: true, orden: 5 },
      { nombre: "Guía", sigla: "GU", autoridad: "operativo", esDiligenciable: false, orden: 6 },
      { nombre: "Protocolo", sigla: "PT", autoridad: "operativo", esDiligenciable: false, orden: 7 },
      { nombre: "Plan", sigla: "PL", autoridad: "estrategico", esDiligenciable: false, orden: 8 },
      { nombre: "Política", sigla: "PO", autoridad: "estrategico", esDiligenciable: false, orden: 9 },
      { nombre: "Registro", sigla: "RG", autoridad: "operativo", esDiligenciable: true, orden: 10 },
      { nombre: "Matriz", sigla: "MZ", autoridad: "operativo", esDiligenciable: true, orden: 11 },
    ])
    .returning();

  await db.insert(e.listaVerificacionItems).values(
    ITEMS_VERIFICACION.map(([texto, critico], i) => ({ texto, critico, orden: i + 1 })),
  );
  return { tipoPorSigla: Object.fromEntries(tipos.map((t) => [t.sigla, t.id])) };
}

export async function sembrarMinima(db: Db): Promise<void> {
  await limpiarTodo(db);
  await sembrarBase(db);
}
