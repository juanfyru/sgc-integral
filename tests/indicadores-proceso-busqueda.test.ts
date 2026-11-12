/**
 * Los indicadores en la página del proceso, en la búsqueda (la paleta y «Buscar») y en la ficha de una norma (Fase 14A,
 * Tarea 17; spec §12.8). Contra la BD de desarrollo, dentro de una transacción que se revierte; cada caso crea sus
 * propios procesos, indicadores y normas con textos únicos de la corrida: lo que ya trae la demo no cambia las cuentas.
 */
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { enCurso, sesionDePeticion } = vi.hoisted(() => ({
  enCurso: { sql: null as unknown },
  sesionDePeticion: vi.fn(),
}));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (enCurso.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import { GET as buscarRapido } from "@/app/api/buscar/route";
import { obtenerSql } from "@/db/cliente";
import { buscarIndicadores, indicadoresQueExige } from "@/db/consultas/indicadores/busqueda";
import { indicadoresDeProceso, indicadoresDeSubproceso, sinTumbarLaPagina } from "@/db/consultas/indicadores/lista";
import { asegurarMediciones } from "@/db/consultas/indicadores/mediciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import { INDICADORES_EN_LA_BUSQUEDA, INDICADORES_EN_LA_PALETA, gruposDeResultados, type ResultadoRapido } from "@/lib/busqueda-rapida";
import { indicadorDePrueba, type IndicadorDePrueba, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { normaDePrueba } from "./utiles/normograma";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const AHORA = new Date("2026-10-20T15:00:00Z");
const APROBADA = new Date("2025-12-15T15:00:00Z");
const opc = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA });

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}x${++consecutivo}`;

async function proceso(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `P${unico()}`.toUpperCase();
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const nombre = `Proceso de búsqueda ${sigla}`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${nombre}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return { id: Number(p.id), nombre };
}

/**
 * Un indicador con nombre, subproceso y normas propios: nace en borrador (la versión aprobada no se modifica), se le
 * cambia lo pedido y se aprueba como lo deja `indicadorDePrueba`.
 */
async function aprobadoCon(
  tx: TransactionSql,
  o: OpcionesIndicadorDePrueba,
  c: { nombre?: string; subprocesoId?: number; normas?: { id: number; nombre: string }[] },
): Promise<IndicadorDePrueba> {
  const ind = await indicadorDePrueba(tx, { periodicidad: "trimestral", inicioMedicion: "2026-T1", aprobadaEn: APROBADA, ...o, estado: "borrador" });
  if (c.nombre) await tx`UPDATE indicador_versiones SET nombre = ${c.nombre} WHERE id = ${ind.versionId}`;
  if (c.subprocesoId) {
    await tx`UPDATE indicador_versiones SET subproceso_id = s.id, subproceso_nombre = s.nombre FROM subprocesos s
      WHERE s.id = ${c.subprocesoId} AND indicador_versiones.id = ${ind.versionId}`;
  }
  for (const n of c.normas ?? []) {
    await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre) VALUES (${ind.versionId}, ${n.id}, ${n.nombre})`;
  }
  const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = creado_por, elaborada_en = ${APROBADA},
      huella = ${"0".repeat(64)}, rige_desde = ${o.inicioMedicion ?? "2026-T1"}, aprobada_por = ${gerente.usuarioId}, aprobada_en = ${APROBADA}
    WHERE id = ${ind.versionId}`;
  await tx`UPDATE indicadores SET estado = 'activo' WHERE id = ${ind.id}`;
  return ind;
}

const subproceso = async (tx: TransactionSql, procesoId: number, nombre = "Subproceso de búsqueda") => {
  const [s] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden) VALUES (${procesoId}, ${nombre}, ${`zz-${unico()}`}, 1) RETURNING id`;
  return Number(s.id);
};

describe("la página del proceso", () => {
  it("lista sus indicadores y, agrupados, los de sus subprocesos, con el último periodo terminado", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const subA = await subproceso(tx, p.id, "Subproceso A");
      const subB = await subproceso(tx, p.id, "Subproceso B");
      const propio = await aprobadoCon(tx, { procesoId: p.id }, {});
      const deA = await aprobadoCon(tx, { procesoId: p.id }, { subprocesoId: subA });
      const deA2 = await aprobadoCon(tx, { procesoId: p.id }, { subprocesoId: subA });
      const otro = await proceso(tx);
      await aprobadoCon(tx, { procesoId: otro.id }, {});
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });

      const r = await indicadoresDeProceso(quien, p.id, opc(tx));
      expect(r.propios.map((f) => f.codigo)).toEqual([propio.codigo]);
      expect(r.propios[0]).toMatchObject({ nombre: `Indicador de prueba ${propio.codigo}`, periodo: "2026-T3", resultado: null, semaforo: null });
      expect(r.porSubproceso).toHaveLength(1);
      expect(r.porSubproceso[0]).toMatchObject({ subprocesoId: subA, nombre: "Subproceso A" });
      expect(r.porSubproceso[0].filas.map((f) => f.codigo).sort()).toEqual([deA.codigo, deA2.codigo].sort());
      expect(r.porSubproceso.some((g) => g.subprocesoId === subB)).toBe(false);

      const sub = await indicadoresDeSubproceso(quien, subA, opc(tx));
      expect(sub.map((f) => f.codigo).sort()).toEqual([deA.codigo, deA2.codigo].sort());
      expect(await indicadoresDeSubproceso(quien, subB, opc(tx))).toEqual([]);
    }));

  it("no cuenta ni nombra un restringido que la persona no ve, ni un borrador, ni un retirado", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const sub = await subproceso(tx, p.id);
      const general = await aprobadoCon(tx, { procesoId: p.id }, {});
      const restringido = await aprobadoCon(tx, { procesoId: p.id, nivelAcceso: "restringido" }, { subprocesoId: sub });
      const borrador = await indicadorDePrueba(tx, { procesoId: p.id, estado: "borrador" });
      const retirado = await aprobadoCon(tx, { procesoId: p.id }, {});
      const admin = await sesionAdmin(tx);
      await retirar(admin, { indicadorId: retirado.id, motivo: "Ya no se mide" }, { sql: tx });
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const delProceso = await usuarioDePrueba(tx, { rol: "consulta", procesos: [p.id] });
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });

      const vistoPor = async (s: typeof ajeno) => {
        const r = await indicadoresDeProceso(s, p.id, opc(tx));
        return [...r.propios, ...r.porSubproceso.flatMap((g) => g.filas)].map((f) => f.codigo).sort();
      };
      expect(await vistoPor(ajeno)).toEqual([general.codigo]);
      // Sin el restringido no queda ni el grupo de su subproceso.
      expect((await indicadoresDeProceso(ajeno, p.id, opc(tx))).porSubproceso).toEqual([]);
      expect(await indicadoresDeSubproceso(ajeno, sub, opc(tx))).toEqual([]);
      expect(await vistoPor(delProceso)).toEqual([general.codigo, restringido.codigo].sort());
      expect(await vistoPor(gerencia)).toEqual([general.codigo, restringido.codigo].sort());
      // Ni el administrador ve en la página un borrador sin ficha aprobada.
      expect(await vistoPor(admin)).toEqual([general.codigo, restringido.codigo].sort());
      expect(await vistoPor(admin)).not.toContain(borrador.codigo);
    }));
});

describe("los periodos que abre la lectura", () => {
  const abiertas = async (tx: TransactionSql, indicadorId: number) =>
    Number((await tx`SELECT count(*)::int AS n FROM mediciones WHERE indicador_id = ${indicadorId}`)[0].n);

  it("un proceso sin indicadores no abre periodos de otro; la del proceso abre solo los suyos", () =>
    revertida(sql, async (tx) => {
      const vacio = await proceso(tx);
      const lleno = await proceso(tx);
      const otro = await proceso(tx);
      const mio = await aprobadoCon(tx, { procesoId: lleno.id }, {});
      const ajeno = await aprobadoCon(tx, { procesoId: otro.id }, {});
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });

      expect(await indicadoresDeProceso(quien, vacio.id, opc(tx))).toEqual({ propios: [], porSubproceso: [] });
      expect(await abiertas(tx, mio.id)).toBe(0);
      expect(await abiertas(tx, ajeno.id)).toBe(0);
      await indicadoresDeProceso(quien, lleno.id, opc(tx));
      expect(await abiertas(tx, mio.id)).toBeGreaterThan(0);
      expect(await abiertas(tx, ajeno.id)).toBe(0);
    }));

  it("un indicador que falla al abrir sus periodos no impide abrir los demás ni leer", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const roto = await aprobadoCon(tx, { procesoId: p.id }, {});
      const sano = await aprobadoCon(tx, { procesoId: p.id }, {});
      // El primer indicador que intenta abrir lanza; el cliente es el mismo para todo lo demás.
      let intentos = 0;
      const cliente = new Proxy(tx, {
        get: (destino, propiedad) => {
          if (propiedad !== "savepoint") return Reflect.get(destino, propiedad, destino);
          return (fn: never) => (++intentos === 1 ? Promise.reject(new Error("falla de prueba")) : destino.savepoint(fn));
        },
      });
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await asegurarMediciones({ sql: cliente, ahora: AHORA, indicadorIds: [roto.id, sano.id] });
        expect(error).toHaveBeenCalledTimes(1);
        expect(await abiertas(tx, roto.id)).toBe(0);
        expect(await abiertas(tx, sano.id)).toBeGreaterThan(0);
        const quien = await usuarioDePrueba(tx, { rol: "consulta" });
        const r = await indicadoresDeProceso(quien, p.id, opc(tx));
        expect(r.propios.map((f) => f.codigo).sort()).toEqual([roto.codigo, sano.codigo].sort());
      } finally {
        error.mockRestore();
      }
    }));

  it("los grupos de subproceso llevan el nombre congelado en la versión y van en el orden del mapa", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const [b] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden) VALUES (${p.id}, 'Alfa', ${`zz-${unico()}`}, 2) RETURNING id`;
      const [a] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden) VALUES (${p.id}, 'Zeta', ${`zz-${unico()}`}, 1) RETURNING id`;
      await aprobadoCon(tx, { procesoId: p.id }, { subprocesoId: Number(b.id) });
      await aprobadoCon(tx, { procesoId: p.id }, { subprocesoId: Number(a.id) });
      await tx`UPDATE subprocesos SET nombre = 'Renombrado' WHERE id = ${a.id}`;
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const r = await indicadoresDeProceso(quien, p.id, opc(tx));
      expect(r.porSubproceso.map((g) => g.nombre)).toEqual(["Zeta", "Alfa"]);
    }));
});

describe("sinTumbarLaPagina", () => {
  it("devuelve la lectura, o registra el error y devuelve null para que los documentos se muestren", async () => {
    expect(await sinTumbarLaPagina(Promise.resolve({ propios: [] }))).toEqual({ propios: [] });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sinTumbarLaPagina(Promise.reject(new Error("falla")))).toBeNull();
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});

describe("buscarIndicadores", () => {
  it("con más coincidencias que el tope: primero el código que empieza por el texto, luego por nombre y por código", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const marca = `zo${unico()}`;
      const c = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Cobertura ${marca}` });
      const a = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Auditoría ${marca}` });
      const b = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Bienestar ${marca}` });
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      expect((await buscarIndicadores(marca, quien, 2, { sql: tx })).map((r) => r.codigo)).toEqual([a.codigo, b.codigo]);
      expect((await buscarIndicadores(marca, quien, 10, { sql: tx })).map((r) => r.codigo)).toEqual([a.codigo, b.codigo, c.codigo]);
      // Un código que empieza por el texto va antes que un nombre que lo contiene.
      expect((await buscarIndicadores(c.codigo.toLowerCase(), quien, 1, { sql: tx }))[0].codigo).toBe(c.codigo);
    }));

  it("busca el guion bajo y la barra invertida tal cual, sin tratarlos como comodines", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const marca = `zu${unico()}`;
      const guion = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Tasa a_b ${marca}` });
      await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Tasa axb ${marca}` });
      const barra = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Tasa c\\d ${marca}` });
      await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Tasa cxd ${marca}` });
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      const de = async (q: string) => (await buscarIndicadores(q, quien, 10, { sql: tx })).map((r) => r.codigo);
      expect(await de(`a_b ${marca}`)).toEqual([guion.codigo]);
      expect(await de(`c\\d ${marca}`)).toEqual([barra.codigo]);
    }));

  it("sigue la versión vigente: un borrador v2 con otro nombre y otra norma no cambia lo que se encuentra", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);
      const marca = `zv${unico()}`;
      const normaA = await normaDePrueba(tx, admin);
      const normaB = await normaDePrueba(tx, admin);
      const ind = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Vigente ${marca}`, normas: [normaA] });
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, creado_por)
        SELECT indicador_id, 2, 'borrador', 'mayor', ${`Borrador ${marca}`}, creado_por FROM indicador_versiones WHERE id = ${ind.versionId} RETURNING id`;
      await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre) VALUES (${v2.id}, ${normaB.id}, ${normaB.nombre})`;
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      expect((await buscarIndicadores(`Vigente ${marca}`, quien, 5, { sql: tx })).map((r) => r.codigo)).toEqual([ind.codigo]);
      expect(await buscarIndicadores(`Borrador ${marca}`, quien, 5, { sql: tx })).toEqual([]);
      expect((await indicadoresQueExige(quien, normaA.id, { sql: tx })).map((r) => r.codigo)).toEqual([ind.codigo]);
      expect(await indicadoresQueExige(quien, normaB.id, { sql: tx })).toEqual([]);
    }));

  it("encuentra por código y por nombre, sin tildes ni mayúsculas, con tope", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const marca = `zq${unico()}`;
      const a = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Cumplimiento de auditorías internas ${marca}` });
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });

      const porCodigo = await buscarIndicadores(a.codigo.toLowerCase(), quien, 10, { sql: tx });
      expect(porCodigo).toEqual([{ codigo: a.codigo, nombre: `Cumplimiento de auditorías internas ${marca}`, proceso: p.nombre, retirado: false }]);
      expect(await buscarIndicadores(`AUDITORIAS internas ${marca}`, quien, 10, { sql: tx })).toEqual(porCodigo);
      expect(await buscarIndicadores("auditorías", quien, 10, { sql: tx })).toEqual(expect.arrayContaining(porCodigo));
      expect(await buscarIndicadores("a", quien, 10, { sql: tx })).toEqual([]);
      // `%` y `_` se buscan tal cual.
      expect(await buscarIndicadores(`${marca}%`, quien, 10, { sql: tx })).toEqual([]);

      const comun = `tope${unico()}`;
      for (let i = 0; i < 6; i += 1) await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Indicador ${comun} ${i}` });
      expect(await buscarIndicadores(comun, quien, INDICADORES_EN_LA_PALETA, { sql: tx })).toHaveLength(4);
      expect(await buscarIndicadores(comun, quien, INDICADORES_EN_LA_BUSQUEDA, { sql: tx })).toHaveLength(5);
      expect(INDICADORES_EN_LA_PALETA).toBe(4);
      expect(INDICADORES_EN_LA_BUSQUEDA).toBe(5);
    }));

  it("no devuelve restringidos ajenos, borradores ni descartados; el retirado sale marcado", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const marca = `zr${unico()}`;
      const nombre = (t: string) => `${t} ${marca}`;
      const general = await aprobadoCon(tx, { procesoId: p.id }, { nombre: nombre("General") });
      const restringido = await aprobadoCon(tx, { procesoId: p.id, nivelAcceso: "restringido" }, { nombre: nombre("Restringido") });
      const retirado = await aprobadoCon(tx, { procesoId: p.id }, { nombre: nombre("Retirado") });
      const borrador = await indicadorDePrueba(tx, { procesoId: p.id, estado: "borrador" });
      await tx`UPDATE indicador_versiones SET nombre = ${nombre("Borrador")} WHERE id = ${borrador.versionId}`;
      const descartado = await indicadorDePrueba(tx, { procesoId: p.id, estado: "borrador" });
      await tx`UPDATE indicador_versiones SET nombre = ${nombre("Descartado")} WHERE id = ${descartado.versionId}`;
      const admin = await sesionAdmin(tx);
      await tx`UPDATE indicadores SET estado = 'descartado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Creado por error'
        WHERE id = ${descartado.id}`;
      await retirar(admin, { indicadorId: retirado.id, motivo: "Ya no se mide" }, { sql: tx });
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const delProceso = await usuarioDePrueba(tx, { rol: "consulta", procesos: [p.id] });

      const codigos = async (s: typeof ajeno) => (await buscarIndicadores(marca, s, 20, { sql: tx })).map((r) => r.codigo).sort();
      expect(await codigos(ajeno)).toEqual([general.codigo, retirado.codigo].sort());
      expect(await codigos(delProceso)).toEqual([general.codigo, restringido.codigo, retirado.codigo].sort());
      expect((await buscarIndicadores(marca, ajeno, 20, { sql: tx })).find((r) => r.codigo === retirado.codigo)?.retirado).toBe(true);
      for (const x of [borrador, descartado]) expect(await codigos(delProceso)).not.toContain(x.codigo);
    }));

  it("sin llamar a asegurarMediciones: no abre periodos ni escribe", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const a = await aprobadoCon(tx, { procesoId: p.id }, {});
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      await buscarIndicadores(a.codigo, quien, 4, { sql: tx });
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM mediciones WHERE indicador_id = ${a.id}`;
      expect(n).toBe(0);
    }));
});

describe("GET /api/buscar: el grupo «indicador»", () => {
  it("va después de los documentos y de las normas, con su código, su nombre, el proceso y la ruta de su página", () =>
    revertida(sql, async (tx) => {
      enCurso.sql = tx;
      try {
        const p = await proceso(tx);
        const admin = await sesionAdmin(tx);
        const marca = `zs${unico()}`;
        const norma = await normaDePrueba(tx, admin, { titulo: `Norma ${marca}` });
        await documentoLibre(tx, { proceso: "GTH", tipo: "PR", titulo: `Documento ${marca}` });
        const ind = await aprobadoCon(tx, { procesoId: p.id }, { nombre: `Indicador ${marca}` });
        sesionDePeticion.mockResolvedValue(await usuarioDePrueba(tx, { rol: "consulta" }));
        const r = (await (await buscarRapido(new NextRequest(`http://localhost:3002/api/buscar?q=${marca}`))).json()) as { resultados: ResultadoRapido[] };
        const iDoc = r.resultados.findIndex((x) => x.grupo === "documento");
        const iNorma = r.resultados.findIndex((x) => x.ruta === `/normograma/${norma.id}`);
        const iInd = r.resultados.findIndex((x) => x.grupo === "indicador");
        expect(iDoc).toBeGreaterThanOrEqual(0);
        expect(iNorma).toBeGreaterThan(iDoc);
        expect(iInd).toBeGreaterThan(iNorma);
        expect(r.resultados[iInd]).toEqual({
          grupo: "indicador",
          codigo: ind.codigo,
          titulo: `Indicador ${marca}`,
          tituloResaltado: null,
          tipo: p.nombre,
          ruta: `/indicadores/${ind.codigo}`,
        });
        expect(gruposDeResultados(r.resultados).indicadores.map((x) => x.codigo)).toEqual([ind.codigo]);
        expect(gruposDeResultados(r.resultados).documentos.every((x) => x.grupo === "documento")).toBe(true);
      } finally {
        enCurso.sql = null;
      }
    }));
});

describe("«Indicadores que exige» de una norma", () => {
  it("lista los activos cuya versión vigente la cita y que la persona ve", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);
      const norma = await normaDePrueba(tx, admin);
      const otraNorma = await normaDePrueba(tx, admin);
      const cita = await aprobadoCon(tx, { procesoId: p.id }, { normas: [norma] });
      const restringido = await aprobadoCon(tx, { procesoId: p.id, nivelAcceso: "restringido" }, { normas: [norma] });
      const retirado = await aprobadoCon(tx, { procesoId: p.id }, { normas: [norma] });
      await retirar(admin, { indicadorId: retirado.id, motivo: "Ya no se mide" }, { sql: tx });
      await aprobadoCon(tx, { procesoId: p.id }, { normas: [otraNorma] });
      const borrador = await indicadorDePrueba(tx, { procesoId: p.id, estado: "borrador" });
      await tx`INSERT INTO indicador_normas (version_id, norma_id, norma_nombre) VALUES (${borrador.versionId}, ${norma.id}, ${norma.nombre})`;
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const delProceso = await usuarioDePrueba(tx, { rol: "consulta", procesos: [p.id] });

      const de = async (s: typeof ajeno, id = norma.id) => (await indicadoresQueExige(s, id, { sql: tx })).map((x) => x.codigo).sort();
      expect(await de(ajeno)).toEqual([cita.codigo]);
      expect(await de(delProceso)).toEqual([cita.codigo, restringido.codigo].sort());
      expect(await de(admin)).toEqual([cita.codigo, restringido.codigo].sort());
      expect((await indicadoresQueExige(ajeno, norma.id, { sql: tx }))[0]).toEqual({
        codigo: cita.codigo,
        nombre: `Indicador de prueba ${cita.codigo}`,
        proceso: p.nombre,
      });
      expect(await de(ajeno, 2_000_000_000)).toEqual([]);
    }));

  it("solo cuenta la versión vigente: una citada en una versión anterior no exige", () =>
    revertida(sql, async (tx) => {
      const p = await proceso(tx);
      const admin = await sesionAdmin(tx);
      const norma = await normaDePrueba(tx, admin);
      const ind = await aprobadoCon(tx, { procesoId: p.id }, { normas: [norma] });
      // Una versión 2 aprobada que ya no la cita: la vigente es la aprobada de mayor número.
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, creado_por)
        SELECT indicador_id, 2, 'borrador', 'mayor', nombre, creado_por FROM indicador_versiones WHERE id = ${ind.versionId} RETURNING id`;
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = creado_por, elaborada_en = ${APROBADA},
          huella = ${"1".repeat(64)}, rige_desde = '2026-T3', aprobada_por = ${gerente.usuarioId}, aprobada_en = ${APROBADA} WHERE id = ${v2.id}`;
      const quien = await usuarioDePrueba(tx, { rol: "consulta" });
      expect(await indicadoresQueExige(quien, norma.id, { sql: tx })).toEqual([]);
    }));
});
