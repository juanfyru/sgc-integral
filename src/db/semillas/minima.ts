/**
 * Semilla mínima: lo indispensable para una instalación nueva (tipos de
 * documento genéricos y la configuración base). Sin mapa, sin documentos y
 * sin usuarios: el admin lo crea `npm run admin:asegurar`.
 */
import { rm } from "node:fs/promises";
import { sql as dsql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { rutaBaseAlmacen } from "../../lib/almacen";
import * as e from "../esquema";

export type Db = PostgresJsDatabase;

const PATRON_CODIGO_DEFECTO = "^[A-Z]{2,4}-[A-Z]{2,4}-\\d{3}$";

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
      auditoria, eventos_consulta, busquedas
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
    { clave: "lema", valor: "" },
    { clave: "titulo_phva", valor: "Mejora Continua" },
    { clave: "texto_phva", valor: "" },
    { clave: "patron_codigo", valor: PATRON_CODIGO_DEFECTO },
    { clave: "aviso_datos_personales", valor: AVISO_DATOS_PERSONALES },
  ]);

  const tipos = await db
    .insert(e.tiposDocumento)
    .values([
      { nombre: "Caracterización", sigla: "CA", orden: 1 },
      { nombre: "Manual", sigla: "MN", orden: 2 },
      { nombre: "Procedimiento", sigla: "PR", orden: 3 },
      { nombre: "Instructivo", sigla: "IN", orden: 4 },
      { nombre: "Formato", sigla: "FT", esDiligenciable: true, orden: 5 },
      { nombre: "Guía", sigla: "GU", orden: 6 },
      { nombre: "Protocolo", sigla: "PT", orden: 7 },
      { nombre: "Plan", sigla: "PL", orden: 8 },
      { nombre: "Política", sigla: "PO", orden: 9 },
    ])
    .returning();
  return { tipoPorSigla: Object.fromEntries(tipos.map((t) => [t.sigla, t.id])) };
}

export async function sembrarMinima(db: Db): Promise<void> {
  await limpiarTodo(db);
  await sembrarBase(db);
}
