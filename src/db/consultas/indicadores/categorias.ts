/**
 * Lo que se lee y se cambia de la lista de categorías de una medición desagregada (anexo 14C, §5.3 y §5.6): el desglose por
 * categoría (`desgloseDe`), «Actualizar categorías» (`actualizarCategorias`) y la lista que se rehace cuando un cambio mayor
 * cambia la dimensión (`rehacerCategorias`). El reporte de la rejilla, el total y la cuenta de las categorías en Crítico viven
 * en `mediciones.ts`, que no puede importar este módulo.
 *
 * Quien fija o amplía una lista lee el maestro `FOR KEY SHARE` en la transacción que la guarda: el `jsonb` no tiene llave
 * foránea, y `borrarCategoria` toma la categoría `FOR UPDATE` antes de ver si alguna lista la usa.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { enTransaccion, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { puedeVerIndicador } from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { estadoDeFila, resultadoDeCategoria, type CategoriaDeMedicion, type EstadoDeFila } from "@/lib/indicadores/categorias";
import { cumpleDeFila } from "@/lib/indicadores/estados";
import { aDecimal, deTexto, type Fraccion } from "@/lib/indicadores/formula/fraccion";
import { versionQueRigeEntre } from "@/lib/indicadores/periodos";
import { fichaDeCalculo, valorEnTexto } from "@/lib/indicadores/reporte";
import { numeroExacto } from "@/lib/indicadores/semaforo";
import { textoValor } from "@/lib/indicadores/textos";
import { ErrorIndicador, MOTIVO_DATO_SIN_CATEGORIA, type Semaforo } from "@/lib/indicadores/tipos";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { maestroDeCategorias } from "./dimensiones";
import {
  celdasPorCategoria,
  detalleDeCategorias,
  esDeOtraPeriodicidad,
  listaDe,
  listasDeCategorias,
  NO_EXISTE,
  reglaMostrada,
  valoresPorLetra,
  versionesAprobadas,
  type CambioDeFila,
  type VersionDeCalculo,
} from "./mediciones";

type Opciones = { sql?: Cliente; ahora?: Date };

const SOLO_ABIERTA = "Solo se actualizan las categorías de una medición abierta sin reportar";
const SIN_DESAGREGAR = "Esta medición no se mide por categorías";

/**
 * Una fila del desglose: su categoría (de la lista de la medición), su estado, sus valores y lo que da, calculado al leer. Los
 * números salen de la fracción exacta y solo dibujan: `numero`, la cifra (el ancho de la barra); `numeros`, cada valor (las
 * celdas del Excel). El color y el estado son siempre los del semáforo. Una fila «No aplica» no lleva valores (no entran al
 * total), aunque sigan guardados: si se le quita, vuelven.
 */
export type FilaDeDesglose = {
  categoria: CategoriaDeMedicion;
  estado: EstadoDeFila;
  valores: Record<string, string | null>;
  resultado: string | null;
  semaforo: Semaforo | null;
  cumple: boolean | null;
  numero: number | null;
  numeros: Record<string, number | null>;
};

/**
 * El desglose de una medición por categoría (anexo 14C, §5.6). `periodo` es su clave; `dimension`, el nombre con que se firmó
 * la versión; `meta`, la que se le aplica, en texto («85 %»; `null` sin meta), y `metaNumero`, la misma como número para la
 * línea de las barras; `enCritico`, las categorías completas que quedan en Crítico, en el orden de la lista.
 */
export type Desglose = {
  medicionId: number;
  periodo: string;
  dimension: string;
  filas: FilaDeDesglose[];
  total: {
    valores: Record<string, string | null>;
    resultado: string | null;
    semaforo: Semaforo | null;
    cumple: boolean | null;
    numero: number | null;
    numeros: Record<string, number | null>;
  } | null;
  meta: string | null;
  metaNumero: number | null;
  enCritico: string[];
  /** El «No aplica» de toda la medición (su motivo; uno del sistema, como `MOTIVO_NADA_QUE_MEDIR`), o `null`: el total lo dice. */
  noAplica: string | null;
};

const enTexto = (v: VersionDeCalculo, valores: Readonly<Record<string, Fraccion>>): Record<string, string | null> =>
  Object.fromEntries(v.calculo.letras.map((l) => [l, valores[l] ? valorEnTexto(valores[l]) : null]));

/** Una fracción como número para dibujar (como `aNumero` de las lecturas); la de una celda del Excel, con diez decimales. */
const aNumero = (f: Fraccion) => Number(aDecimal(f, 6, "redondear"));
const enNumeros = (v: VersionDeCalculo, valores: Readonly<Record<string, Fraccion>>): Record<string, number | null> =>
  Object.fromEntries(v.calculo.letras.map((l) => [l, valores[l] ? Number(aDecimal(valores[l], 10, "redondear")) : null]));

/**
 * El desglose de la medición por categoría, o `null` si no es desagregada (no tiene lista; tampoco una histórica). La
 * visibilidad la comprueba quien llama. Cada fila se calcula aquí y nunca se guarda: con la versión de la medición (la que se
 * congeló con su dato o, sin dato, la que rige su periodo) y la meta que se le aplicó (o la del periodo: `reglaMostrada`), con
 * `textoValor`, que no contradice el color. El total es el que escribió el sistema, con el resultado de la medición; `null`
 * mientras no lo hay.
 */
export async function desgloseDe(sql: Cliente, medicionId: number): Promise<Desglose | null> {
  const [m] = await sql`SELECT m.*,
      (SELECT json_build_object('meta', x.meta::text, 'metaMax', x.meta_max::text) FROM indicador_metas x
        WHERE x.indicador_id = m.indicador_id AND x.periodo = m.periodo) AS programada
    FROM mediciones m WHERE m.id = ${medicionId}`;
  const lista = m ? listaDe(m) : null;
  if (!m || !lista) return null;
  const zona = zonaHoraria();
  const versiones = await versionesAprobadas(sql, Number(m.indicador_id));
  const periodo = periodoDe(m.periodo as string, zona);
  const rige = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
  const conDato = m.no_aplica === true || typeof m.resultado_exacto === "string";
  const version = (conDato ? versiones.find((v) => v.id === Number(m.version_id)) : null) ?? rige;
  const ficha = version ? fichaDeCalculo(version.calculo) : null;
  if (!version || !ficha) return null;
  const regla = reglaMostrada(m, version);
  const celdas = await celdasPorCategoria(sql, medicionId, version);
  const filas: FilaDeDesglose[] = lista.map((c) => {
    const valores = celdas.get(c.id) ?? {};
    const estado = estadoDeFila(c, valores, ficha);
    const r = estado === "completa" ? resultadoDeCategoria(valores, ficha, regla) : { resultado: null, semaforo: null, cumple: null };
    // Lo que una fila «No aplica» tenía guardado no cuenta: no se muestra ni se suma.
    const cuentan = estado === "no_aplica" ? {} : valores;
    return {
      categoria: c,
      estado,
      valores: enTexto(version, cuentan),
      resultado: r.resultado ? textoValor(r.resultado, version.unidad, regla) : null,
      semaforo: r.semaforo,
      cumple: r.cumple,
      numero: r.resultado ? aNumero(r.resultado) : null,
      numeros: enNumeros(version, cuentan),
    };
  });
  const guardado = await valoresPorLetra(sql, medicionId, version);
  const semaforo = (m.semaforo as Semaforo | null) ?? null;
  const exacto = typeof m.resultado_exacto === "string" ? deTexto(m.resultado_exacto) : null;
  const total =
    Object.keys(guardado).length === 0
      ? null
      : {
          valores: enTexto(version, guardado),
          resultado: exacto ? textoValor(exacto, version.unidad, regla) : null,
          semaforo,
          cumple: cumpleDeFila({ cumple: (m.cumple as boolean | null) ?? null, semaforo }),
          numero: exacto ? aNumero(exacto) : null,
          numeros: enNumeros(version, guardado),
        };
  return {
    medicionId,
    periodo: m.periodo as string,
    dimension: version.dimensionNombre ?? "",
    filas,
    total,
    meta: regla.meta ? `${numeroExacto(regla.meta, version.unidad.decimales)}${version.unidad.sufijo}` : null,
    metaNumero: regla.meta ? aNumero(regla.meta) : null,
    enCritico: filas.filter((f) => f.semaforo === "critico").map((f) => f.categoria.nombre),
    noAplica: m.no_aplica === true ? ((m.no_aplica_motivo as string | null) ?? "") : null,
  };
}

/**
 * «Actualizar categorías» (anexo 14C, §5.3): en una medición abierta sin reportar, quien administra añade al final de su lista
 * las categorías de la dimensión que hoy están activas y no estaban, en el orden del maestro; nada sale de la lista. Deja el
 * evento `categorias` (con las que añadió) y su bitácora; sin nada que añadir, nada. Candados: el indicador `FOR SHARE`, la
 * medición `FOR UPDATE` y el maestro `FOR KEY SHARE`.
 */
export async function actualizarCategorias(sesion: SesionFlujo, medicionId: number, opciones?: Opciones): Promise<{ agregadas: number }> {
  if (!puede(sesion, "indicadores.administrar")) throw new ErrorPermiso();
  if (!Number.isSafeInteger(medicionId) || medicionId <= 0) throw new ErrorIndicador(NO_EXISTE);
  const ahora = opciones?.ahora ?? new Date();
  return enTransaccion(opciones?.sql ?? obtenerSql(), async (tx) => {
    const [i] = await tx`SELECT id, codigo, estado FROM indicadores
      WHERE id = (SELECT indicador_id FROM mediciones WHERE id = ${medicionId}) FOR SHARE`;
    const [m] = await tx`SELECT * FROM mediciones WHERE id = ${medicionId} FOR UPDATE`;
    if (!i || !m || !(await puedeVerIndicador(Number(i.id), sesion, { sql: tx }))) throw new ErrorIndicador(NO_EXISTE);
    if (i.estado !== "activo") throw new ErrorIndicador("El indicador está retirado: ya no admite reportes");
    const lista = listaDe(m);
    if (!lista) throw new ErrorIndicador(SIN_DESAGREGAR);
    if (m.estado !== "abierta" || m.reportada_en !== null || m.no_aplica === true) throw new ErrorIndicador(SOLO_ABIERTA);
    const zona = zonaHoraria();
    const periodo = periodoDe(m.periodo as string, zona);
    const version = periodo ? versionQueRigeEntre(await versionesAprobadas(tx, Number(i.id)), periodo, zona) : null;
    if (version?.dimensionId === null || version?.dimensionId === undefined) throw new ErrorIndicador(SIN_DESAGREGAR);
    const ya = new Set(lista.map((c) => c.id));
    const agregadas: CategoriaDeMedicion[] = (await maestroDeCategorias(tx, version.dimensionId, { bloquear: true }))
      .filter((c) => c.activo && !ya.has(c.id))
      .map((c) => ({ id: c.id, nombre: c.nombre, orden: c.orden, noAplica: null }));
    if (agregadas.length === 0) return { agregadas: 0 };
    await tx`UPDATE mediciones SET categorias = ${tx.json([...lista, ...agregadas] as never)} WHERE id = ${medicionId}`;
    const detalle = { agregadas: agregadas.map((c) => ({ id: c.id, nombre: c.nombre })) };
    await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
      VALUES (${medicionId}, 'categorias', ${sesion.usuarioId}, ${tx.json(detalle as never)}, ${ahora})`;
    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "medicion_categorias_actualizadas",
      entidad: "medicion",
      entidadId: medicionId,
      detalle: { codigo: i.codigo as string, indicadorId: Number(i.id), periodo: m.periodo as string, agregadas: agregadas.map((c) => c.nombre) },
    });
    return { agregadas: agregadas.length };
  });
}

/** ¿La lista es de la dimensión `dimensionId`? Sin dimensión, solo la falta de lista; una lista vacía no es de ninguna. */
async function esDeLaDimension(tx: TransactionSql, lista: readonly CategoriaDeMedicion[] | null, dimensionId: number | null): Promise<boolean> {
  if (dimensionId === null || lista === null) return dimensionId === null && lista === null;
  if (lista.length === 0) return false;
  const [r] = await tx`SELECT count(*)::int AS ajenas FROM dimension_categorias
    WHERE id IN ${tx(lista.map((c) => c.id))} AND dimension_id <> ${dimensionId}`;
  return Number(r.ajenas) === 0;
}

/**
 * Al aprobarse un cambio mayor que rige desde `rigeDesde` (anexo 14C, §5.3), en cada medición abierta sin reportar de su
 * tramo (una reportada, una histórica o una de otra periodicidad no se toca):
 * - si su lista no es de la dimensión de la versión que ahora rige su periodo, rehace la lista (o la quita, si ya no se
 *   desagrega) y borra sus celdas y su total, que eran de la dimensión anterior; si borró valores, deja el evento `categorias`
 *   del sistema con la lista de antes y la de después (sin valores no deja rastro en la medición: la aprobación queda en la
 *   bitácora);
 * - si la lista ya es de esa dimensión pero la versión que rige no trae ningún dato compartido, quita los «No aplica» de fila
 *   con `MOTIVO_DATO_SIN_CATEGORIA`: la propagación ya no vuelve a esa medición y la persona no podría medir esas filas. Deja
 *   el evento `categorias` del sistema con las filas que cambiaron. Si la versión sigue trayendo un dato por categoría, la
 *   propagación sigue a cargo.
 * Un cambio mayor que no cambia la dimensión ni deja de traer el dato no toca nada; si ninguna versión aprobada se
 * desagrega, ni siquiera lee las mediciones (mirar solo las dos más nuevas no basta: nada ordena el «rige desde» entre
 * versiones, y una que rige antes que la anterior alcanza mediciones con la lista de una más vieja). Quien llama tiene el indicador `FOR UPDATE`. Devuelve cuántas listas cambió.
 */
export async function rehacerCategorias(tx: TransactionSql, indicadorId: number, rigeDesde: string, ahora: Date = new Date()): Promise<number> {
  const zona = zonaHoraria();
  const desde = periodoDe(rigeDesde, zona);
  if (!desde) return 0;
  const versiones = await versionesAprobadas(tx, indicadorId);
  // Sin dimensión en ninguna versión aprobada, ninguna medición tiene lista que tocar.
  if (versiones.every((v) => v.dimensionId === null)) return 0;
  const filas = await tx`SELECT * FROM mediciones
    WHERE indicador_id = ${indicadorId} AND desde >= ${desde.desde} AND estado = 'abierta' AND reportada_en IS NULL
      AND NOT no_aplica AND NOT historica
    ORDER BY desde, id
    FOR UPDATE`;
  let rehechas = 0;
  for (const m of filas) {
    const periodo = periodoDe(m.periodo as string, zona);
    const rige = periodo ? versionQueRigeEntre(versiones, periodo, zona) : null;
    if (!periodo || !rige || esDeOtraPeriodicidad(m.periodo as string, rige)) continue;
    const lista = listaDe(m);
    if (await esDeLaDimension(tx, lista, rige.dimensionId)) {
      if (lista === null || rige.variables.some((v) => v.origen === "compartida")) continue;
      const filasSinDato: CambioDeFila[] = lista
        .filter((c) => c.noAplica === MOTIVO_DATO_SIN_CATEGORIA)
        .map((c) => ({ categoria: c, antes: c.noAplica, despues: null }));
      if (filasSinDato.length === 0) continue;
      const nueva = lista.map((c) => (c.noAplica === MOTIVO_DATO_SIN_CATEGORIA ? { ...c, noAplica: null } : c));
      await tx`UPDATE mediciones SET categorias = ${tx.json(nueva as never)} WHERE id = ${m.id}`;
      const detalle = { causa: "sin_dato", categorias: detalleDeCategorias(lista, [], filasSinDato) };
      await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
        VALUES (${m.id}, 'categorias', NULL, ${tx.json(detalle as never)}, ${ahora})`;
      rehechas += 1;
      continue;
    }
    const [nueva] = await listasDeCategorias(tx, [{ dimensionId: rige.dimensionId, periodo }]);
    const quitados = await tx`DELETE FROM medicion_valores WHERE medicion_id = ${m.id} RETURNING id`;
    await tx`UPDATE mediciones SET categorias = ${nueva === null ? null : tx.json(nueva as never)}, categorias_en_critico = NULL WHERE id = ${m.id}`;
    if (quitados.length > 0) {
      const detalle = {
        causa: "dimension",
        antes: (lista ?? []).map((c) => c.nombre),
        despues: (nueva ?? []).map((c) => c.nombre),
        valoresQuitados: quitados.length,
      };
      await tx`INSERT INTO medicion_eventos (medicion_id, tipo, usuario_id, detalle, creado_en)
        VALUES (${m.id}, 'categorias', NULL, ${tx.json(detalle as never)}, ${ahora})`;
    }
    rehechas += 1;
  }
  return rehechas;
}
