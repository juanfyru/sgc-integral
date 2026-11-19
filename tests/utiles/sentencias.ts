/** Contar las sentencias que ejecuta un camino del dominio dentro de una transacción de prueba. */
import type { TransactionSql } from "postgres";

/**
 * La transacción con un contador: cuenta una sentencia cuando se ejecuta (cuando se espera), no cuando se arma como
 * fragmento de otra. Devuelve el texto de cada una.
 */
export function contada(tx: TransactionSql): { sql: TransactionSql; sentencias: string[] } {
  const sentencias: string[] = [];
  const proxy = new Proxy(tx, {
    apply(objetivo, propio, argumentos: unknown[]) {
      const consulta = Reflect.apply(objetivo, propio, argumentos) as { then?: (...a: unknown[]) => unknown };
      const plantilla = argumentos[0];
      if (consulta && typeof consulta.then === "function" && Array.isArray(plantilla) && "raw" in plantilla) {
        const original = consulta.then.bind(consulta);
        let contadaYa = false;
        consulta.then = (...a: unknown[]) => {
          if (!contadaYa) {
            contadaYa = true;
            sentencias.push((plantilla as string[]).join("?"));
          }
          return original(...a);
        };
      }
      return consulta;
    },
  });
  return { sql: proxy as unknown as TransactionSql, sentencias };
}
