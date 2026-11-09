/**
 * El maestro de tipos de norma (spec 13C §10.1 y §10.6): Ley, Decreto, Resolución… Lo administra quien tiene
 * `normograma.administrar`. Un tipo no se borra (sus normas lo citan): se desactiva y deja de ofrecerse al crear.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { acotado, ErrorNormograma } from "@/lib/normograma/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";

type Opciones = { sql?: Cliente };

export type TipoNorma = { id: number; nombre: string; orden: number; activo: boolean; normas: number };

const NO_EXISTE = "El tipo de norma no existe";

function exigirAdministrar(sesion: SesionFlujo): void {
  if (!puede(sesion, "normograma.administrar")) throw new ErrorPermiso();
}

/** En el orden del maestro; `normas` cuenta las que lo usan, retiradas incluidas. */
export async function listarTiposNorma(opciones?: Opciones & { soloActivos?: boolean }): Promise<TipoNorma[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`
    SELECT tn.id, tn.nombre, tn.orden, tn.activo, (SELECT count(*) FROM normas n WHERE n.tipo_norma_id = tn.id)::int AS normas
    FROM tipos_norma tn
    ${opciones?.soloActivos ? sql`WHERE tn.activo` : sql``}
    ORDER BY tn.orden, tn.id`;
  return filas.map((f) => ({ id: Number(f.id), nombre: f.nombre, orden: f.orden, activo: f.activo, normas: f.normas }));
}

/** Todas las que cambian el maestro toman el mismo candado: el orden se calcula sobre una sola vista. */
const bloquear = (tx: TransactionSql) => tx`LOCK TABLE tipos_norma IN SHARE ROW EXCLUSIVE MODE`;

async function tipoBloqueado(tx: TransactionSql, id: number) {
  const [t] = await tx`SELECT id, nombre, orden, activo FROM tipos_norma WHERE id = ${id} FOR UPDATE`;
  if (!t) throw new ErrorNormograma(NO_EXISTE);
  return t;
}

async function exigirNombreLibre(tx: TransactionSql, nombre: string, salvo: number | null): Promise<void> {
  const [otro] = await tx`SELECT 1 FROM tipos_norma
    WHERE lower(nombre) = lower(${nombre}) ${salvo === null ? tx`` : tx`AND id <> ${salvo}`}`;
  if (otro) throw new ErrorNormograma(`Ya existe el tipo de norma «${nombre}»`);
}

const auditar = (tx: TransactionSql, sesion: SesionFlujo, accion: string, id: number, detalle: Record<string, unknown>) =>
  registrarAuditoria(tx, { usuarioId: sesion.usuarioId, accion, entidad: "tipos_norma", entidadId: id, detalle });

export async function crearTipoNorma(sesion: SesionFlujo, nombre: string, opciones?: Opciones): Promise<{ id: number }> {
  exigirAdministrar(sesion);
  const limpio = acotado(nombre, "El nombre del tipo de norma", 2, 60);
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx);
    await exigirNombreLibre(tx, limpio, null);
    const [t] = await tx`INSERT INTO tipos_norma (nombre, orden)
      VALUES (${limpio}, (SELECT coalesce(max(orden), 0) + 1 FROM tipos_norma))
      RETURNING id`;
    await auditar(tx, sesion, "tipo_norma_creado", Number(t.id), { nombre: limpio });
    return { id: Number(t.id) };
  });
}

export async function editarTipoNorma(sesion: SesionFlujo, id: number, nombre: string, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  const limpio = acotado(nombre, "El nombre del tipo de norma", 2, 60);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx);
    const anterior = await tipoBloqueado(tx, id);
    if (anterior.nombre === limpio) return;
    await exigirNombreLibre(tx, limpio, id);
    await tx`UPDATE tipos_norma SET nombre = ${limpio} WHERE id = ${id}`;
    await auditar(tx, sesion, "tipo_norma_editado", id, { antes: anterior.nombre, despues: limpio });
  });
}

/** Intercambia el orden con el tipo vecino (activo o no: la sección los muestra todos). */
export async function moverTipoNorma(sesion: SesionFlujo, id: number, direccion: "arriba" | "abajo", opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  if (direccion !== "arriba" && direccion !== "abajo") throw new ErrorNormograma("Dirección inválida");
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx);
    const tipo = await tipoBloqueado(tx, id);
    const [vecino] = direccion === "arriba"
      ? await tx`SELECT id, orden FROM tipos_norma WHERE (orden, id) < (${tipo.orden}, ${id}) ORDER BY orden DESC, id DESC LIMIT 1`
      : await tx`SELECT id, orden FROM tipos_norma WHERE (orden, id) > (${tipo.orden}, ${id}) ORDER BY orden, id LIMIT 1`;
    if (!vecino) return;
    await tx`UPDATE tipos_norma SET orden = ${vecino.orden} WHERE id = ${id}`;
    await tx`UPDATE tipos_norma SET orden = ${tipo.orden} WHERE id = ${vecino.id}`;
    await auditar(tx, sesion, "tipo_norma_movido", id, { nombre: tipo.nombre, direccion });
  });
}

export async function alternarTipoNorma(sesion: SesionFlujo, id: number, activo: boolean, opciones?: Opciones): Promise<void> {
  exigirAdministrar(sesion);
  await enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    await bloquear(tx);
    const tipo = await tipoBloqueado(tx, id);
    if (tipo.activo === activo) return;
    await tx`UPDATE tipos_norma SET activo = ${activo} WHERE id = ${id}`;
    await auditar(tx, sesion, "tipo_norma_alternado", id, { nombre: tipo.nombre, activo });
  });
}
