/**
 * Un indicador compuesto al enviarse y aprobarse, quién lo aprueba y lo que se bloquea del lado del indicador del que otro
 * depende (anexo 14C, §6.1 y §6.6; Tarea 7 de la 14C). Contra la BD de desarrollo, dentro de una transacción que se
 * revierte: ninguna ficha aprobada queda confirmada. La prueba «a la vez» pide el candado consultivo desde otra conexión
 * del grupo, sin escribir nada.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { componentesRestringidos, quienesToman } from "@/db/consultas/indicadores/componentes";
import { abrirCambio, contenidoDeVersion, crearIndicador, fichaParaEditar, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { condicionDeDeshacer, deshacerImportacion } from "@/db/consultas/indicadores/importacion";
import { cambiarOperacion, retirar } from "@/db/consultas/indicadores/operacion";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { aprobadoresDeFicha, puedeAprobarFicha } from "@/lib/alcance";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { huellaDeFicha } from "@/lib/indicadores/ficha";
import { ErrorIndicador, type NivelAcceso, type Toma } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, versionTrimestral, type IndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2026-11-10T15:00:00Z");
const CLAVE = { clave: "ok" };
const MOTIVO = { motivo: "Ajustar la ficha", credenciales: CLAVE };
const firmar = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA, verificar: firmaDePrueba });

const CICLO = "Esta ficha cerraría un ciclo entre indicadores";
const CICLO_EN_LA_APROBACION = "Esta aprobación cerraría un ciclo entre indicadores";
const CAMBIE_ANTES = "Cambie antes el indicador que lo usa";
const TOMA_RESTRINGIDO = "Este indicador toma un indicador restringido: no puede ser general";
const NO_LE_TOCA = "La ficha no existe o no le corresponde aprobarla";

type Base = {
  admin: SesionFlujo;
  gerente: SesionFlujo;
  procesoId: number;
  tipoId: number;
  estrategico: number;
  operativo: number;
  porcentaje: number;
  cargoId: number;
};

/** El proceso SGC, los maestros sembrados, un cargo propio, un Administrador del SGC y una persona de Gerencia. */
async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [op] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    gerente: await usuarioDePrueba(tx, { rol: "gerencia" }),
    procesoId: Number(p.id),
    tipoId: Number(t.id),
    estrategico: Number(es.id),
    operativo: Number(op.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
  };
}

/** Un proceso que solo existe en la transacción: sus líderes son los que la prueba le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

const RANGOS_80 = JSON.stringify({ bien: [{ signo: ">=", valor: "80" }], atencion: [{ signo: ">=", valor: "56" }], critico: [{ signo: "<", valor: "56" }] });
/** Los de la meta 90 de `indicadorDePrueba`: un cambio mayor sobre sus fichas los escribe. */
const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });

type Variable = DatosFicha["variables"][number];

const propia = (letra: string): Variable => ({ letra, nombre: `Propia ${letra}`, consolidacion: "suma", admiteNegativos: false });
const delIndicador = (letra: string, indicadorOrigenId: number, toma: Toma = "valor"): Variable => ({
  letra,
  nombre: `Tomada ${letra}`,
  consolidacion: "suma",
  admiteNegativos: false,
  origen: "indicador",
  indicadorOrigenId,
  toma,
});

/** Una ficha estratégica de fórmula libre (la suma de sus variables), trimestral desde 2026-T1, probada con unos. */
function ficha(b: Base, variables: Variable[], parcial: Partial<DatosFicha> = {}): DatosFicha {
  const letras = variables.map((v) => v.letra);
  return {
    procesoId: b.procesoId,
    nombre: "Atención integral",
    proposito: "Saber cuántas atenciones integrales se prestan",
    tipoId: b.tipoId,
    clasificacionId: b.estrategico,
    forma: "libre",
    formula: letras.join(" + "),
    variables,
    unidadId: b.porcentaje,
    decimales: 1,
    periodicidad: "trimestral",
    tendencia: "ascendente",
    meta: "80",
    semaforoModo: "rangos",
    rangos: RANGOS_80,
    cargosMedir: [b.cargoId],
    cargosAnalizar: [b.cargoId],
    normaIds: [],
    plazoReporteDias: 10,
    inicioMedicion: "2026-T1",
    soporteObligatorio: false,
    nivelAcceso: "general",
    mide: [],
    analiza: [],
    prueba: { valores: Object.fromEntries(letras.map((l) => [l, "1"])) },
    ...parcial,
  };
}

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

/**
 * Abre un cambio sobre una ficha de `indicadorDePrueba` y lo que el formulario mandaría para un cambio mayor: con cargos,
 * los rangos de su meta y la prueba con valores. `cambiar` decide lo que cambia; lo demás queda como en la vigente.
 */
async function cambioMayor(
  tx: TransactionSql,
  b: Base,
  ind: IndicadorDePrueba,
  cambiar: (valores: DatosFicha) => DatosFicha,
): Promise<number> {
  const { versionId } = await abrirCambio(b.admin, ind.id, { sql: tx });
  const editable = (await fichaParaEditar(b.admin, ind.codigo, { sql: tx }))!.valores as DatosFicha;
  const valores: DatosFicha = {
    ...editable,
    cargosMedir: [b.cargoId],
    cargosAnalizar: [b.cargoId],
    semaforoModo: "rangos",
    rangos: RANGOS_90,
    umbralAtencionPct: undefined,
    prueba: { valores: { A: "9", B: "10" } },
  };
  await guardarBorrador(b.admin, versionId, cambiar(valores), { sql: tx });
  return versionId;
}

/** Sin meta: también sin la regla del semáforo. */
const sinMeta = (v: DatosFicha): DatosFicha => ({ ...v, meta: undefined, semaforoModo: undefined, rangos: undefined, umbralAtencionPct: undefined });
const trimestral = (v: DatosFicha): DatosFicha => ({ ...v, periodicidad: "trimestral", inicioMedicion: "2026-T1" });

const enviar = (tx: TransactionSql, b: Base, versionId: number) => enviarAAprobacion(b.admin, { versionId, ...MOTIVO }, firmar(tx));
const aprobar = (tx: TransactionSql, quien: SesionFlujo, versionIds: number[]) =>
  aprobarFichas(quien, { versionIds, credenciales: CLAVE }, firmar(tx));

const estadoDe = async (tx: TransactionSql, versionId: number) =>
  ((await tx`SELECT estado FROM indicador_versiones WHERE id = ${versionId}`)[0]?.estado as string | undefined) ?? null;

/** Los datos de operación de hoy, con el nivel de acceso dado. */
async function conNivel(tx: TransactionSql, indicadorId: number, nivelAcceso: NivelAcceso) {
  const [i] = await tx`SELECT plazo_reporte_dias, inicio_medicion, soporte_obligatorio FROM indicadores WHERE id = ${indicadorId}`;
  return {
    indicadorId,
    plazoReporteDias: Number(i.plazo_reporte_dias),
    inicioMedicion: i.inicio_medicion as string,
    soporteObligatorio: i.soporte_obligatorio as boolean,
    nivelAcceso,
  };
}

const gerenciasActivas = async (tx: TransactionSql) =>
  (await tx`SELECT id FROM usuarios WHERE rol = 'gerencia' AND activo ORDER BY id`).map((f) => Number(f.id));

/** Pide el candado de las aprobaciones desde otra conexión del grupo, fuera de la transacción de la prueba. */
async function candadoLibre(): Promise<boolean> {
  const [f] = await sql`SELECT pg_try_advisory_xact_lock(hashtext('sgc.indicadores.compuestos')) AS libre`;
  return f.libre === true;
}

const retiro = { motivo: "Ya no se mide" };

describe("quién aprueba un compuesto con un componente restringido (anexo §6.1, decisión 8.1)", () => {
  it("Gerencia y no el líder, sea cual sea la clasificación; si el componente se restringe después de enviar, la lista cambia", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const procesoId = await procesoNuevo(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [procesoId] });
      const restringido = await indicadorDePrueba(tx, { procesoId, nivelAcceso: "restringido" });
      const general = await indicadorDePrueba(tx, { procesoId });
      const operativa = (componente: number) =>
        ficha(b, [propia("A"), delIndicador("B", componente)], { procesoId, clasificacionId: b.operativo, nivelAcceso: "restringido" });

      const conRestringido = await crearIndicador(b.admin, operativa(restringido.id), { sql: tx });
      await enviar(tx, b, conRestringido.versionId);
      expect(await componentesRestringidos(tx, conRestringido.versionId)).toEqual([restringido.id]);
      expect(await aprobadoresDeFicha(conRestringido.versionId, { sql: tx })).toEqual(await gerenciasActivas(tx));
      expect(await puedeAprobarFicha(conRestringido.versionId, lider, { sql: tx })).toBe(false);

      const conGeneral = await crearIndicador(b.admin, operativa(general.id), { sql: tx });
      await enviar(tx, b, conGeneral.versionId);
      expect(await componentesRestringidos(tx, conGeneral.versionId)).toEqual([]);
      expect(await aprobadoresDeFicha(conGeneral.versionId, { sql: tx })).toEqual([lider.usuarioId]);
      const tareasDe = async (s: SesionFlujo) => (await tareasDeIndicadores(s, { sql: tx, ahora: AHORA })).tareas.map((t) => t.id);
      expect(await tareasDe(lider)).toContain(`ficha:${conGeneral.versionId}`);
      expect(await tareasDe(b.gerente)).not.toContain(`ficha:${conGeneral.versionId}`);

      // El componente se restringe con la ficha ya enviada: sin reenviarla, la aprueba Gerencia y no el líder.
      await cambiarOperacion(b.admin, await conNivel(tx, general.id, "restringido"), { sql: tx, ahora: AHORA });
      expect(await aprobadoresDeFicha(conGeneral.versionId, { sql: tx })).toEqual(await gerenciasActivas(tx));
      expect(await puedeAprobarFicha(conGeneral.versionId, lider, { sql: tx })).toBe(false);
      expect(await tareasDe(lider)).not.toContain(`ficha:${conGeneral.versionId}`);
      expect(await tareasDe(b.gerente)).toContain(`ficha:${conGeneral.versionId}`);
      await rechaza(aprobar(tx, lider, [conGeneral.versionId]), NO_LE_TOCA);
      await aprobar(tx, b.gerente, [conGeneral.versionId]);
      expect(await estadoDe(tx, conGeneral.versionId)).toBe("aprobada");
    }));
});

describe("lo que se vuelve a mirar al enviar y al aprobar", () => {
  it("entre guardar y aprobar se retiró el componente: la aprobación lo rechaza", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const { versionId } = await crearIndicador(b.admin, ficha(b, [delIndicador("A", comp.id), propia("B")]), { sql: tx });
      await enviar(tx, b, versionId);
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = now(), baja_motivo = 'Prueba de retiro'
        WHERE id = ${comp.id}`;
      await rechaza(aprobar(tx, b.gerente, [versionId]), "El indicador de la variable A debe estar activo y tener ficha vigente");
      expect(await estadoDe(tx, versionId)).toBe("por_aprobar");
    }));

  it("al enviar: el componente se restringió desde que se guardó la ficha", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const { versionId } = await crearIndicador(b.admin, ficha(b, [delIndicador("A", comp.id), propia("B")]), { sql: tx });
      await tx`UPDATE indicadores SET nivel_acceso = 'restringido' WHERE id = ${comp.id}`;
      await rechaza(enviar(tx, b, versionId), "Esta ficha toma un indicador restringido: debe ser restringida");
    }));

  it("un bloque en el que A toma B y B toma A, cada una válida contra la vigente de la otra: no se aprueba ninguna", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const a = await indicadorDePrueba(tx, { procesoId: b.procesoId, clasificacion: "Estratégico" });
      const c = await indicadorDePrueba(tx, { procesoId: b.procesoId, clasificacion: "Estratégico" });
      const tomar = (otro: number) => (v: DatosFicha) => ({ ...v, variables: [v.variables[0], delIndicador("B", otro)] });
      const deA = await cambioMayor(tx, b, a, tomar(c.id));
      const deC = await cambioMayor(tx, b, c, tomar(a.id));
      await enviar(tx, b, deA);
      await enviar(tx, b, deC);

      await rechaza(aprobar(tx, b.gerente, [deA, deC]), CICLO_EN_LA_APROBACION);
      expect([await estadoDe(tx, deA), await estadoDe(tx, deC)]).toEqual(["por_aprobar", "por_aprobar"]);
      // Una sola, sí: la otra sigue con su vigente.
      await aprobar(tx, b.gerente, [deA]);
      expect(await estadoDe(tx, deA)).toBe("aprobada");
    }));

  it("un bloque que cierra el ciclo de «Objetivos cumplidos» con las clases de sus fichas, no con las de las vigentes", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const objetivo = async (clase: "calidad" | "institucional") =>
        Number((await tx`INSERT INTO objetivos (clase, enunciado, orden) VALUES (${clase}, ${`ZZ Objetivo ${unico()}`}, 99) RETURNING id`)[0].id);
      const calidad = await objetivo("calidad");
      const institucional = await objetivo("institucional");
      const deCalidad = await indicadorDePrueba(tx, { procesoId: b.procesoId, calculo: { clave: "objetivos_cumplidos", alcance: "calidad" } });
      const institucionales = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        calculo: { clave: "objetivos_cumplidos", alcance: "institucional" },
      });
      // X y Y no apuntan a ningún objetivo en su vigente; sus cambios los apuntan y toman el «Objetivos cumplidos» de la otra clase.
      const x = await indicadorDePrueba(tx, { procesoId: b.procesoId, clasificacion: "Estratégico" });
      const y = await indicadorDePrueba(tx, { procesoId: b.procesoId, clasificacion: "Estratégico" });
      const apuntarYTomar = (objetivoId: number, cumplidos: number) => (v: DatosFicha) => ({
        ...v,
        objetivoId,
        variables: [v.variables[0], delIndicador("B", cumplidos)],
      });
      const deX = await cambioMayor(tx, b, x, apuntarYTomar(calidad, institucionales.id));
      const deY = await cambioMayor(tx, b, y, apuntarYTomar(institucional, deCalidad.id));
      await enviar(tx, b, deX);
      await enviar(tx, b, deY);

      await rechaza(aprobar(tx, b.gerente, [deX, deY]), CICLO_EN_LA_APROBACION);
      expect([await estadoDe(tx, deX), await estadoDe(tx, deY)]).toEqual(["por_aprobar", "por_aprobar"]);
    }));
});

describe("el ciclo oculto de «Objetivos cumplidos» con dos aristas ocultas", () => {
  it("X apunta a calidad y toma el institucional; Y, que apunta a uno institucional, no puede tomar el de calidad", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const objetivo = async (clase: "calidad" | "institucional") =>
        Number((await tx`INSERT INTO objetivos (clase, enunciado, orden) VALUES (${clase}, ${`ZZ Objetivo ${unico()}`}, 99) RETURNING id`)[0].id);
      const calidad = await objetivo("calidad");
      const institucional = await objetivo("institucional");
      const deCalidad = await indicadorDePrueba(tx, { procesoId: b.procesoId, calculo: { clave: "objetivos_cumplidos", alcance: "calidad" } });
      const institucionales = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        calculo: { clave: "objetivos_cumplidos", alcance: "institucional" },
      });
      const simple = await indicadorDePrueba(tx, { procesoId: b.procesoId });

      // Sin X, Y vale: toma el de calidad y apunta a uno institucional.
      await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", deCalidad.id)], { objetivoId: institucional }), { sql: tx });
      await indicadorDePrueba(tx, { procesoId: b.procesoId, objetivoId: calidad, variables: { A: { indicadorOrigenId: institucionales.id } } });
      // Con X: Y → «Objetivos cumplidos» de calidad ⇒ X → «Objetivos cumplidos» institucional ⇒ Y.
      await rechaza(
        crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", deCalidad.id)], { objetivoId: institucional }), { sql: tx }),
        CICLO,
      );
      // Apuntando a uno institucional y tomando un indicador simple, sí.
      await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", simple.id)], { objetivoId: institucional }), { sql: tx });
    }));
});

describe("la prueba «a la vez»: el candado consultivo de las aprobaciones", () => {
  it("la transacción de aprobarFichas lo tiene hasta terminar; la del cambio menor de enviarAAprobacion, también", async () => {
    // La ficha por aprobar se deja por SQL, sin enviarla: enviar también toma el candado.
    await revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador", clasificacion: "Estratégico" });
      const huella = huellaDeFicha(await contenidoDeVersion(tx, ind.versionId));
      await tx`UPDATE indicador_versiones SET estado = 'por_aprobar', huella = ${huella}, elaborada_por = ${b.admin.usuarioId},
          elaborada_en = ${AHORA}, rige_desde = '2026-01'
        WHERE id = ${ind.versionId}`;
      expect(await candadoLibre()).toBe(true);
      await aprobar(tx, b.gerente, [ind.versionId]);
      expect(await estadoDe(tx, ind.versionId)).toBe("aprobada");
      expect(await candadoLibre()).toBe(false);
    });
    expect(await candadoLibre()).toBe(true);

    await revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const { versionId } = await abrirCambio(b.admin, ind.id, { sql: tx });
      const editable = (await fichaParaEditar(b.admin, ind.codigo, { sql: tx }))!.valores as DatosFicha;
      await guardarBorrador(
        b.admin,
        versionId,
        { ...editable, nombre: "Otro nombre", cargosMedir: [b.cargoId], cargosAnalizar: [b.cargoId], prueba: { valores: { A: "9", B: "10" } } },
        { sql: tx },
      );
      expect(await candadoLibre()).toBe(true);
      expect(await enviar(tx, b, versionId)).toEqual({ codigo: ind.codigo, menor: true });
      expect(await candadoLibre()).toBe(false);
    });
    expect(await candadoLibre()).toBe(true);
  });
});

describe("del lado del componente", () => {
  it("un cambio mayor que le quita la meta a un indicador cuyo cumplimiento toma otro: el código para quien administra", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const compuesto = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: comp.id, toma: "cumplimiento" } } });
      const v = await cambioMayor(tx, b, comp, sinMeta);
      await rechaza(enviar(tx, b, v), `${CAMBIE_ANTES}: ${compuesto.codigo}`);

      // Si solo toma su valor, perder la meta no le importa.
      const otro = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: otro.id } } });
      await enviar(tx, b, await cambioMayor(tx, b, otro, sinMeta));
    }));

  it("un cambio mayor de mensual a trimestral en el componente de un compuesto mensual: el código para quien administra", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const compuesto = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: comp.id } } });
      await rechaza(enviar(tx, b, await cambioMayor(tx, b, comp, trimestral)), `${CAMBIE_ANTES}: ${compuesto.codigo}`);

      // De un compuesto trimestral, sí.
      const otro = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "trimestral", variables: { A: { indicadorOrigenId: otro.id } } });
      await enviar(tx, b, await cambioMayor(tx, b, otro, trimestral));
    }));

  for (const [caso, cambio, toma] of [
    ["le quita la meta", sinMeta, "cumplimiento"],
    ["lo pasa a trimestral", trimestral, "valor"],
  ] as const) {
    it(`aprobado por un líder que no ve el compuesto (restringido, de otro proceso), ${caso}: el mensaje sin código`, () =>
      revertida(sql, async (tx) => {
        const b = await base(tx);
        const procesoId = await procesoNuevo(tx);
        const otroProceso = await procesoNuevo(tx);
        const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [procesoId] });
        const comp = await indicadorDePrueba(tx, { procesoId });
        // Se envía antes de que el compuesto exista: al enviar no hay a quién proteger.
        const v = await cambioMayor(tx, b, comp, cambio);
        await enviar(tx, b, v);
        expect(await aprobadoresDeFicha(v, { sql: tx })).toEqual([lider.usuarioId]);
        await indicadorDePrueba(tx, { procesoId: otroProceso, nivelAcceso: "restringido", variables: { A: { indicadorOrigenId: comp.id, toma } } });

        await rechaza(aprobar(tx, lider, [v]), CAMBIE_ANTES);
        expect(await estadoDe(tx, v)).toBe("por_aprobar");
      }));
  }
});

describe("nadie mide un compuesto sin variables propias", () => {
  it("enviarlo no pide la prueba; al aprobarlo se quitan sus designados «mide» y se apaga el soporte obligatorio", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const medidor = await usuarioDePrueba(tx, { rol: "consulta" });
      const uno = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const otro = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const ind = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        clasificacion: "Estratégico",
        soporteObligatorio: true,
        mide: [medidor.usuarioId],
      });
      const v = await cambioMayor(tx, b, ind, (valores) => ({
        ...valores,
        variables: [delIndicador("A", uno.id), delIndicador("B", otro.id)],
        cargosMedir: [],
        prueba: undefined,
      }));
      expect((await tx`SELECT prueba FROM indicador_versiones WHERE id = ${v}`)[0].prueba).toBeNull();
      await enviar(tx, b, v);
      await aprobar(tx, b.gerente, [v]);

      const [i] = await tx`SELECT soporte_obligatorio FROM indicadores WHERE id = ${ind.id}`;
      expect(i.soporte_obligatorio).toBe(false);
      const funciones = (await tx`SELECT funcion FROM indicador_designados WHERE indicador_id = ${ind.id}`).map((d) => d.funcion);
      expect(funciones).not.toContain("mide");
      const [quitados] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_medidores_quitados' AND entidad_id = ${ind.id}`;
      expect(quitados.detalle).toEqual({ codigo: ind.codigo, cuantos: 1 });
      const [aprobado] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_aprobado' AND entidad_id = ${ind.id}`;
      expect(aprobado.detalle).toMatchObject({ soporteApagado: true });
    }));
});

describe("quién toma a un indicador", () => {
  it("la vigente de un activo y la versión que rige una medición sin cerrar; con `conBorradores`, también los borradores", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const deLaVigente = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        nivelAcceso: "restringido",
        variables: { A: { indicadorOrigenId: comp.id, toma: "cumplimiento" } },
      });
      // Su versión 2 ya no lo toma, pero la de enero sigue abierta con la versión 1, que sí.
      const deUnaMedicion = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: comp.id } } });
      await versionTrimestral(tx, { indicadorId: deUnaMedicion.id, usuarioId: b.admin.usuarioId, rigeDesde: "2026-T2", aprobadaEn: AHORA });
      const enero = periodoDe("2026-01", zonaHoraria())!;
      const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en)
        VALUES (${deUnaMedicion.id}, ${deUnaMedicion.versionId}, '2026-01', ${enero.desde}, ${enero.hasta}, ${enero.hasta}) RETURNING id`;
      const borrador = await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", comp.id)]), { sql: tx });
      const retirado = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: comp.id } } });
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = now(), baja_motivo = 'Prueba de retiro'
        WHERE id = ${retirado.id}`;

      const activos = [
        { indicadorId: deLaVigente.id, codigo: deLaVigente.codigo, toma: "cumplimiento", periodicidad: "mensual", restringido: true, enBorrador: false },
        { indicadorId: deUnaMedicion.id, codigo: deUnaMedicion.codigo, toma: "valor", periodicidad: "mensual", restringido: false, enBorrador: false },
      ].sort((x, y) => x.indicadorId - y.indicadorId);
      expect(await quienesToman(tx, comp.id)).toEqual(activos);
      const [{ codigo }] = await tx`SELECT codigo FROM indicadores WHERE id = ${borrador.indicadorId}`;
      expect(await quienesToman(tx, comp.id, { conBorradores: true })).toEqual(
        [
          ...activos,
          { indicadorId: borrador.indicadorId, codigo: codigo as string, toma: "valor", periodicidad: "trimestral", restringido: false, enBorrador: true },
        ].sort((x, y) => x.indicadorId - y.indicadorId),
      );

      // Cerrada la medición de enero, ya no lo toma.
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id = ${m.id}`;
      expect((await quienesToman(tx, comp.id)).map((t) => t.indicadorId)).toEqual([deLaVigente.id]);
    }));
});

describe("retirar", () => {
  it("un componente que otro toma no se retira; retirado primero el compuesto, sí", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const compuesto = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: comp.id } } });
      await rechaza(retirar(b.admin, { indicadorId: comp.id, ...retiro }, { sql: tx, ahora: AHORA }), `${CAMBIE_ANTES}: ${compuesto.codigo}`);
      await retirar(b.admin, { indicadorId: compuesto.id, ...retiro }, { sql: tx, ahora: AHORA });
      await retirar(b.admin, { indicadorId: comp.id, ...retiro }, { sql: tx, ahora: AHORA });
      expect((await tx`SELECT estado FROM indicadores WHERE id = ${comp.id}`)[0].estado).toBe("retirado");
    }));
});

describe("el nivel de acceso", () => {
  it("restringir un componente de un compuesto general, no; de uno restringido, sí", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const compuesto = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: comp.id } } });
      const restringir = async () => cambiarOperacion(b.admin, await conNivel(tx, comp.id, "restringido"), { sql: tx, ahora: AHORA });
      await rechaza(restringir(), `${CAMBIE_ANTES}: ${compuesto.codigo}`);
      await tx`UPDATE indicadores SET nivel_acceso = 'restringido' WHERE id = ${compuesto.id}`;
      await restringir();
      expect((await tx`SELECT nivel_acceso FROM indicadores WHERE id = ${comp.id}`)[0].nivel_acceso).toBe("restringido");
    }));

  it("abrir un compuesto con un componente restringido, no", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const comp = await indicadorDePrueba(tx, { procesoId: b.procesoId, nivelAcceso: "restringido" });
      const compuesto = await indicadorDePrueba(tx, {
        procesoId: b.procesoId,
        nivelAcceso: "restringido",
        variables: { A: { indicadorOrigenId: comp.id } },
      });
      await rechaza(cambiarOperacion(b.admin, await conNivel(tx, compuesto.id, "general"), { sql: tx, ahora: AHORA }), TOMA_RESTRINGIDO);
      // Con el componente general, sí.
      await tx`UPDATE indicadores SET nivel_acceso = 'general' WHERE id = ${comp.id}`;
      await cambiarOperacion(b.admin, await conNivel(tx, compuesto.id, "general"), { sql: tx, ahora: AHORA });
    }));
});

describe("deshacer un lote", () => {
  it("otra ficha toma una del lote, aunque sea un borrador o un compuesto retirado: lo impide y no sale un 23503", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [lote] = await tx`INSERT INTO importaciones_indicadores (cargado_por, cargado_en) VALUES (${b.admin.usuarioId}, ${AHORA}) RETURNING id`;
      const loteId = Number(lote.id);
      const delLote = await indicadorDePrueba(tx, { procesoId: b.procesoId, importacionId: loteId, aprobadaEn: AHORA });
      const otroDelLote = await indicadorDePrueba(tx, { procesoId: b.procesoId, importacionId: loteId, aprobadaEn: AHORA });
      await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo, detalle, creado_en)
        VALUES (${loteId}, 'importado', ${b.admin.usuarioId}, 'clave', ${tx.json({
          fichas: [delLote, otroDelLote].map((f) => ({ indicadorId: f.id, versionId: f.versionId, estado: "aprobado" })),
        } as never)}, ${AHORA})`;
      expect(await condicionDeDeshacer(tx, loteId)).toEqual({ puede: true, impiden: [] });

      const motivo = "otra ficha toma el resultado de una ficha del lote";
      await crearIndicador(b.admin, ficha(b, [propia("A"), delIndicador("B", delLote.id)]), { sql: tx });
      expect(await condicionDeDeshacer(tx, loteId)).toEqual({ puede: false, impiden: [{ codigo: delLote.codigo, motivo }] });
      const deshacer = deshacerImportacion(b.admin, loteId, { motivo: "Se importó con la plantilla equivocada", credenciales: CLAVE }, firmar(tx));
      await rechaza(deshacer, `No se puede deshacer: ${delLote.codigo} ${motivo}`);

      // Un compuesto retirado también lo cita: su llave foránea lo impediría igual.
      const retirado = await indicadorDePrueba(tx, { procesoId: b.procesoId, variables: { A: { indicadorOrigenId: otroDelLote.id } } });
      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = now(), baja_motivo = 'Prueba de retiro'
        WHERE id = ${retirado.id}`;
      expect((await condicionDeDeshacer(tx, loteId)).impiden).toEqual([
        { codigo: delLote.codigo, motivo },
        { codigo: otroDelLote.codigo, motivo },
      ]);
    }));
});
