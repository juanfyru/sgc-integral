/**
 * Los hallazgos en la búsqueda global (Fase 15A, Tarea 21; spec 15 §16.2, F15-DC30): por código y por título, sin distinguir
 * tildes ni mayúsculas, solo los que la persona ve (`filtroHallazgos`, la regla de la lista). Contra la BD de desarrollo, dentro
 * de una transacción que se revierte; cada caso marca sus títulos con un texto único.
 */
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { buscarHallazgos } from "@/db/consultas/mejoramiento/busqueda";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { enviarReporte } from "@/db/consultas/mejoramiento/reportes";
import { HALLAZGOS_EN_LA_PALETA } from "@/lib/busqueda-rapida";
import { baseDeMejora, c, datosDeCarga, datosDeHallazgo, escaneoDeLaCarga, HORA_DE_ESCENA, otroProcesoConLider } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

let consecutivo = 0;
/** Un texto que no se repite entre corridas ni casos: los títulos de la demo y de otros tests no lo traen. */
const marca = () => `zq${Date.now() % 100_000_000}${++consecutivo}`;

describe("buscarHallazgos", () => {
  it("encuentra por código y por título sin distinguir tildes ni mayúsculas, solo los que la persona ve", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const m = marca();
      const { id, codigo } = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { titulo: `Cadena de frío sin registro ${m}` }),
        c(HORA_DE_ESCENA, tx),
      );

      // Por el título, sin tildes y en mayúsculas; por el código, en minúsculas.
      const porTitulo = await buscarHallazgos(`CADENA DE FRIO SIN REGISTRO ${m}`, b.admin, 10, { sql: tx });
      expect(porTitulo).toEqual([{ id, codigo, titulo: `Cadena de frío sin registro ${m}`, etiqueta: "Por aceptar" }]);
      expect((await buscarHallazgos(codigo.toLowerCase(), b.admin, 10, { sql: tx })).map((r) => r.id)).toContain(id);

      // Lo ven quien lo registró, el líder de su proceso y los roles de control; no el líder de otro proceso ni Consulta.
      for (const quien of [b.control, b.lider, b.gerencia]) {
        expect((await buscarHallazgos(m, quien, 10, { sql: tx })).map((r) => r.id)).toEqual([id]);
      }
      const ajeno = (await otroProcesoConLider(tx)).lider;
      expect(await buscarHallazgos(m, ajeno, 10, { sql: tx })).toEqual([]);
      expect(await buscarHallazgos(codigo, ajeno, 10, { sql: tx })).toEqual([]);
    }));

  it("para el rol Consulta sin participación, vacío", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const m = marca();
      const { codigo } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo: `Formato vencido ${m}` }), c(HORA_DE_ESCENA, tx));
      expect(await buscarHallazgos(m, b.consulta, 10, { sql: tx })).toEqual([]);
      expect(await buscarHallazgos(codigo, b.consulta, 10, { sql: tx })).toEqual([]);
      // Control positivo: el mismo texto sí lo encuentra quien lo ve.
      expect(await buscarHallazgos(m, b.admin, 10, { sql: tx })).toHaveLength(1);
    }));

  it("quien reportó el reporte convertido en el hallazgo no lo encuentra, ni por su código ni por su título", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const m = marca();
      const o = c(HORA_DE_ESCENA, tx);
      const { id: reporteId } = await enviarReporte(
        quien,
        { descripcion: `La nevera de urgencias marcaba 12 grados ${m}`, vistoEn: "2026-11-09", procesoId: b.procesoId, referenciaCaso: null },
        o,
      );
      const { id, codigo } = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId, { reporteId, titulo: `Nevera sin registro ${m}` }), o);
      expect(await buscarHallazgos(m, quien, 10, { sql: tx })).toEqual([]);
      expect(await buscarHallazgos(codigo, quien, 10, { sql: tx })).toEqual([]);
      // Control positivo: quien lo registró sí.
      expect((await buscarHallazgos(m, b.admin, 10, { sql: tx })).map((r) => r.id)).toEqual([id]);
    }));

  it("una carga sin su formato firmado no la encuentra quien solo es responsable declarado; con el escaneo, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const m = marca();
      const { id } = await cargarHallazgo(
        b.admin,
        datosDeCarga(b.procesoId, responsable.usuarioId, { titulo: `Carga en curso ${m}` }),
        c("2026-11-18T15:00:00Z", tx),
      );
      expect(await buscarHallazgos(m, responsable, 10, { sql: tx })).toEqual([]);
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId, "2026-11-18T16:00:00Z");
      expect((await buscarHallazgos(m, responsable, 10, { sql: tx })).map((r) => r.id)).toEqual([id]);
    }));

  it("con menos de dos caracteres no busca; `%` y `_` son texto; respeta el límite", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const m = marca();
      for (let i = 0; i < HALLAZGOS_EN_LA_PALETA + 1; i++) {
        await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo: `Hallazgo ${i} ${m}` }), c(HORA_DE_ESCENA, tx));
      }
      expect(await buscarHallazgos("z", b.admin, 10, { sql: tx })).toEqual([]);
      expect(await buscarHallazgos(`${m}%`, b.admin, 10, { sql: tx })).toEqual([]);
      expect(await buscarHallazgos(m, b.admin, HALLAZGOS_EN_LA_PALETA, { sql: tx })).toHaveLength(HALLAZGOS_EN_LA_PALETA);
    }));
});
