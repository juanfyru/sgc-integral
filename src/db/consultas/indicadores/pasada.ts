/**
 * Lo que comparten las pasadas de recordatorios de los indicadores: la de las mediciones (`vencimientos.ts`), la de las
 * constancias de envío al ente (`constancias-vencidas.ts`) y la de los periodos de los datos compartidos
 * (`datos-vencidos.ts`). Vive aparte porque `vencimientos.ts` llama a las otras dos: si estas importaran de aquella, se
 * importarían entre sí.
 *
 * La mecánica de un paso (`correrPaso`) es la de las pasadas de la 13A a la 13C: candidatas por marca nula, lo que puede
 * fallar buscado antes del candado y fuera de la transacción de los avisos (un grupo a la vez, el indicador o el dato del
 * que cuelgan las filas: el que falla se registra y se salta), y en una transacción corta el candado (`FOR UPDATE SKIP
 * LOCKED`), lo releído, los avisos y las marcas.
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { MESES } from "@/lib/indicadores-documentales/periodo";
import { fechaEnZona } from "@/lib/tramites/plazos";

/** «10 de abril», el día en la zona de la instalación. */
export function diaYMes(d: Date, zona: string): string {
  const [, mes, dia] = fechaEnZona(d, zona).split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]}`;
}

/**
 * Un paso de una pasada sobre filas `T` (una medición, una constancia, un periodo de un dato): cómo lee las candidatas (sin
 * `ids`) y las releídas bajo el candado (con `ids`, bloqueadas `FOR UPDATE SKIP LOCKED`), qué busca de cada grupo antes del
 * candado (`resolver`, por `grupo`: el indicador de una medición o de una constancia, el dato de un periodo; deja fuera al
 * que falla), qué avisa (devuelve las filas avisadas: solo ellas llevan la marca) y cómo marca.
 */
export type PasoDeVencimiento<T extends { id: number; grupo: number }, R, C extends { sql: Cliente; ahora: Date }> = {
  leer: (sql: Cliente, c: C, ids?: number[]) => Promise<T[]>;
  resolver: (c: C, candidatas: T[]) => Promise<Map<number, R>>;
  avisar: (tx: TransactionSql, filas: T[], resueltos: Map<number, R>, c: C) => Promise<number[]>;
  marcar: (tx: TransactionSql, ids: number[], ahora: Date) => Promise<unknown>;
};

/** Un paso: las candidatas, lo que necesitan (antes del candado) y, en su transacción, el candado, lo releído, los avisos y las marcas. */
export async function correrPaso<T extends { id: number; grupo: number }, R, C extends { sql: Cliente; ahora: Date }>(
  c: C,
  paso: PasoDeVencimiento<T, R, C>,
): Promise<number> {
  const candidatas = await paso.leer(c.sql, c);
  if (candidatas.length === 0) return 0;
  const resueltos = await paso.resolver(c, candidatas);
  const ids = candidatas.filter((f) => resueltos.has(f.grupo)).map((f) => f.id);
  if (ids.length === 0) return 0;
  return enTransaccion(c.sql, async (tx) => {
    // Lo que otra pasada ya avisó, o lo que se completó entre la lista y el candado, no se avisa.
    const bajoCandado = await paso.leer(tx, c, ids);
    if (bajoCandado.length === 0) return 0;
    const avisadas = await paso.avisar(tx, bajoCandado, resueltos, c);
    if (avisadas.length > 0) await paso.marcar(tx, avisadas, c.ahora);
    return avisadas.length;
  });
}
