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

/**
 * Las sentencias de un camino del dominio que abre su propia transacción sobre la del test (`enTransaccion`: un savepoint), en dos
 * listas: `fuera`, las que corre sobre la transacción del test antes o después de abrir la suya (un camino que lee algo antes de su
 * primer candado las deja aquí), y `dentro`, las de su savepoint, en orden. Las de un savepoint anidado dentro de ese no se cuentan.
 */
export function contadaConSuTransaccion(tx: TransactionSql): { sql: TransactionSql; fuera: string[]; dentro: string[] } {
  const exterior = contada(tx);
  const dentro: string[] = [];
  const envoltura = new Proxy(exterior.sql, {
    get(objetivo, clave, propio) {
      if (clave !== "savepoint") return Reflect.get(objetivo, clave, propio);
      return (fn: (sp: TransactionSql) => Promise<unknown>) =>
        tx.savepoint(async (sp) => {
          const interior = contada(sp);
          try {
            return await fn(interior.sql);
          } finally {
            dentro.push(...interior.sentencias);
          }
        });
    },
  });
  return { sql: envoltura, fuera: exterior.sentencias, dentro };
}
