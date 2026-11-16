/**
 * Las páginas de «Datos compartidos» (anexo 14C, §4.7; Tarea 13 de la 14C, maquetas 11 y 12): la lista y la página de un
 * dato, contra la BD de desarrollo, dentro de una transacción que se revierte (el cliente de la app se sustituye por ella).
 * Para quien no ve un dato, no existe; «Lo usan» muestra solo los indicadores que la persona ve, sin decir si hay más; la
 * página pinta el antes y el después de cada corrección y quién la hizo.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ sql: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  usePathname: () => "/indicadores/datos",
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("@/app/acciones-indicadores", () => ({ reportarDatoCompartido: vi.fn() }));
vi.mock("@/app/admin/acciones-indicadores", () => ({
  guardarDatoCompartido: vi.fn(),
  designarResponsablesDelDato: vi.fn(),
  cambiarEstadoDelDato: vi.fn(),
  borrarDatoCompartido: vi.fn(),
}));

import PaginaDato from "@/app/(app)/indicadores/datos/[id]/page";
import PaginaDatos from "@/app/(app)/indicadores/datos/page";
import { cifraDeDato, conPuntoDeMiles } from "@/componentes/indicadores/datos/comun";
import { CamposDelDato } from "@/componentes/indicadores/datos/FormularioDato";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { DatoCompartido } from "@/db/consultas/indicadores/datos";
import { reportarDato } from "@/db/consultas/indicadores/datos-periodos";
import type { SesionValida } from "@/lib/sesion";
import { datoDePrueba, dimensionDePrueba, indicadorDePrueba, periodoDeDatoDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

beforeEach(() => {
  contexto.sesion = null;
});

const NOMBRE = "Total facturado en el mes";
const DIC_2025 = new Date("2025-12-15T15:00:00Z");
const OCT_6 = new Date("2026-10-06T15:00:00Z");
const OCT_9 = new Date("2026-10-09T15:00:00Z");

const valida = (s: SesionFlujo): SesionValida => ({
  ...s,
  totpActivo: false,
  factorPendiente: false,
  debeCambiarClave: false,
  aceptoDatos: true,
  tema: "sistema",
});

const enTransaccion = (prueba: (tx: TransactionSql) => Promise<void>) =>
  revertida(sql, async (tx) => {
    contexto.sql = tx;
    try {
      await prueba(tx);
    } finally {
      contexto.sql = null;
    }
  });

let consecutivo = 0;

/** Un proceso que solo existe en la transacción, sin líderes. */
async function procesoNuevo(tx: TransactionSql): Promise<number> {
  consecutivo += 1;
  const sigla = `Z${Date.now() % 100_000_000}${consecutivo}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

const lista = async (sesion: SesionFlujo) => {
  contexto.sesion = valida(sesion);
  return renderToStaticMarkup(await PaginaDatos());
};

const pagina = async (sesion: SesionFlujo, id: number | string) => {
  contexto.sesion = valida(sesion);
  return renderToStaticMarkup(await PaginaDato({ params: Promise.resolve({ id: String(id) }) }));
};

/** El dato de un proceso propio con su responsable, que usan un indicador general y uno restringido de otro proceso. */
async function entorno(tx: TransactionSql) {
  const procesoId = await procesoNuevo(tx);
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const datoId = await datoDePrueba(tx, { procesoId, nombre: NOMBRE, responsables: [responsable.usuarioId] });
  const general = await indicadorDePrueba(tx, { procesoId, aprobadaEn: DIC_2025, variables: { B: { datoId } } });
  const restringido = await indicadorDePrueba(tx, {
    procesoId: await procesoNuevo(tx),
    nivelAcceso: "restringido",
    periodicidad: "trimestral",
    aprobadaEn: DIC_2025,
    variables: { B: { datoId } },
  });
  return { procesoId, responsable, datoId, general, restringido };
}

describe("la lista de «Datos compartidos»", () => {
  it("a quien no ve ningún dato ni administra le responde «no encontrado»", () =>
    enTransaccion(async (tx) => {
      await entorno(tx);
      await expect(lista(await usuarioDePrueba(tx, { rol: "consulta" }))).rejects.toThrow("NO_ENCONTRADA");
    }));

  it("«Lo usan» muestra solo los indicadores que la persona ve, sin decir si hay más; quien administra los ve todos", () =>
    enTransaccion(async (tx) => {
      const { responsable, general, restringido } = await entorno(tx);
      const suya = await lista(responsable);
      expect(suya).toContain(NOMBRE);
      expect(suya).toContain(general.codigo);
      // El nombre va junto al código para el lector de pantalla, no solo en `title`.
      expect(suya).toContain(`<span class="sr-only"> Indicador de prueba ${general.codigo}</span>`);
      expect(suya).not.toContain(restringido.codigo);
      expect(suya).not.toMatch(/y otros?\b|más indicadores|\+\d/);
      // Sus periodos se abrieron al entrar y el responsable los tiene por reportar.
      expect(suya).toContain("Por reportar · vence el");
      expect(suya).not.toContain("Nuevo dato");

      const delAdmin = await lista(await sesionAdmin(tx));
      expect(delAdmin).toContain(general.codigo);
      expect(delAdmin).toContain(restringido.codigo);
      expect(delAdmin).toContain("Nuevo dato");
    }));
});

describe("la página de un dato", () => {
  it("pinta el antes y el después de una corrección y quién la hizo", () =>
    enTransaccion(async (tx) => {
      const { responsable, datoId, general, restringido } = await entorno(tx);
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`INSERT INTO variable_responsables (variable_id, usuario_id) VALUES (${datoId}, ${otro.usuarioId})`;
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-09", ahora: OCT_6 });
      await reportarDato(responsable, { periodoId, valor: "1179850000", confirmado: true }, { sql: tx, ahora: OCT_6 });
      await reportarDato(otro, { periodoId, valor: "1197850000", confirmado: true }, { sql: tx, ahora: OCT_9 });

      const html = await pagina(responsable, datoId);
      expect(html).toContain(NOMBRE);
      expect(html).toContain("Septiembre de 2026");
      expect(html).toContain("1.197.850.000");
      expect(html).toContain("antes 1.179.850.000");
      expect(html).toContain(`${responsable.nombre} · 6 oct 2026`);
      expect(html).toContain(`lo corrigió ${otro.nombre} · 9 oct 2026`);
      expect(html).toContain("Corregido");
      // En el historial del periodo, la corrección con su antes y su después.
      expect(html).toContain("1.179.850.000 → 1.197.850.000");
      // «Lo usan», solo lo que la persona ve.
      expect(html).toContain(general.codigo);
      expect(html).not.toContain(restringido.codigo);
      // Lo cita una ficha aprobada: lo congelado lo dice.
      expect(html).toContain("(no cambia mientras una ficha aprobada lo use)");
      expect(html).toContain("(un trimestre es la suma de sus tres meses)");
    }));

  it("con dimensión, el formulario pide un valor por categoría del periodo y no uno solo", () =>
    enTransaccion(async (tx) => {
      consecutivo += 1;
      const dimension = await dimensionDePrueba(tx, `ZZ Sedes ${Date.now() % 100_000_000}${consecutivo}`, ["Sede norte", "Sede sur"]);
      const procesoId = await procesoNuevo(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const datoId = await datoDePrueba(tx, { procesoId, nombre: NOMBRE, dimensionId: dimension.id, responsables: [responsable.usuarioId] });
      await indicadorDePrueba(tx, { procesoId, aprobadaEn: DIC_2025, dimensionId: dimension.id, variables: { B: { datoId } } });

      const html = await pagina(responsable, datoId);
      expect(html).toContain("Valor de cada categoría");
      for (const id of dimension.categorias) expect(html).toContain(`name="categoria_${id}"`);
      expect(html).toContain("Sede norte");
      expect(html).not.toContain('name="valor"');
    }));

  it("a quien no ve el dato, y a un id que no es un número, «no encontrado»", () =>
    enTransaccion(async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      await expect(pagina(await usuarioDePrueba(tx, { rol: "consulta" }), datoId)).rejects.toThrow("NO_ENCONTRADA");
      await expect(pagina(responsable, "abc")).rejects.toThrow("NO_ENCONTRADA");
      await expect(pagina(responsable, "999999999")).rejects.toThrow("NO_ENCONTRADA");
    }));

  it("quien responde por el dato tiene el formulario del periodo pendiente más antiguo que se pide; quien solo lo ve, no", () =>
    enTransaccion(async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      const html = await pagina(responsable, datoId);
      expect(html).toContain("Reportar · enero de 2026");
      expect(html).toContain("Reportar el dato");
      const gerencia = await usuarioDePrueba(tx, { rol: "gerencia" });
      const suya = await pagina(gerencia, datoId);
      expect(suya).toContain(NOMBRE);
      expect(suya).not.toContain("Reportar el dato");
    }));
});

describe("lo que ya no se pide y lo que hace quien administra", () => {
  it("un pendiente con soporte que ninguna medición necesita: la lista y la página dicen «Ya no se pide» y no se reporta ni se le sube nada", () =>
    enTransaccion(async (tx) => {
      const { responsable, datoId, general, restringido } = await entorno(tx);
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-09", ahora: OCT_6 });
      const [archivo] = await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (NULL, 'dato_compartido', ${periodoId}, 'evidencia', ${`datos-compartidos/${periodoId}/cierre.pdf`}, 'cierre.pdf', 'pdf',
          'application/pdf', 4, ${"e".repeat(64)})
        RETURNING id`;
      const admin = await sesionAdmin(tx);
      for (const i of [general, restringido]) {
        await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide'
          WHERE id = ${i.id}`;
      }

      expect(await lista(responsable)).toContain("Ya no se pide");
      const html = await pagina(responsable, datoId);
      expect(html).toContain("Ya no se pide");
      expect(html).not.toContain("Reportar el dato");
      expect(html).not.toContain("Reportar septiembre de 2026");
      expect(html).not.toContain("Zona de carga de los soportes de septiembre de 2026");
      // Su soporte se sigue descargando.
      expect(html).toContain(`href="/indicadores/datos/${datoId}/soportes/${Number(archivo.id)}"`);
    }));

  it("un pendiente viejo que se conserva por su soporte no decide el estado: con un periodo reportado después, «Reportado»", () =>
    enTransaccion(async (tx) => {
      const { responsable, datoId, general, restringido } = await entorno(tx);
      const septiembre = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-09", ahora: OCT_6 });
      await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
        VALUES (NULL, 'dato_compartido', ${septiembre}, 'evidencia', ${`datos-compartidos/${septiembre}/cierre.pdf`}, 'cierre.pdf', 'pdf',
          'application/pdf', 4, ${"e".repeat(64)})`;
      const octubre = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: OCT_9 });
      await reportarDato(responsable, { periodoId: octubre, valor: "1284300000", confirmado: true }, { sql: tx, ahora: OCT_9 });
      const admin = await sesionAdmin(tx);
      for (const i of [general, restringido]) {
        await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Ya no se mide'
          WHERE id = ${i.id}`;
      }

      const html = await lista(responsable);
      expect(html).toContain(">Reportado<");
      expect(html).not.toContain("Ya no se pide");
      expect(html).toContain("1.284.300.000");
      // En la página, septiembre sí dice que ya no se pide.
      expect(await pagina(responsable, datoId)).toContain("Ya no se pide");
    }));

  it("quien administra activa o desactiva el dato y lo borra desde su página; quien no administra, no", () =>
    enTransaccion(async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      const delAdmin = await pagina(await sesionAdmin(tx), datoId);
      expect(delAdmin).toContain("Desactivar el dato");
      expect(delAdmin).toContain("Borrar el dato");
      await tx`UPDATE variables_compartidas SET activa = false WHERE id = ${datoId}`;
      expect(await pagina(await sesionAdmin(tx), datoId)).toContain("Activar el dato");
      const suya = await pagina(responsable, datoId);
      for (const texto of ["Activar el dato", "Desactivar el dato", "Borrar el dato", "Editar el dato", "Cambiar responsables"]) {
        expect(suya).not.toContain(texto);
      }
    }));
});

describe("los campos del dato (CamposDelDato)", () => {
  const opciones = { procesos: [{ id: 1, nombre: "Facturación" }], dimensiones: [{ id: 3, nombre: "Sedes" }], usuarios: [], plazoReporteDias: 15 };
  const dato: DatoCompartido = {
    id: 9,
    procesoId: 1,
    proceso: "Facturación",
    nombre: NOMBRE,
    descripcion: null,
    fuente: null,
    unidad: null,
    periodicidad: "mensual",
    consolidacion: "suma",
    capturaMin: null,
    capturaMax: null,
    admiteNegativos: false,
    plazoReporteDias: 10,
    dimensionId: 3,
    dimension: "Sedes",
    activa: true,
    citado: true,
    responsables: [],
  };
  const campos = (d: DatoCompartido | null) => renderToStaticMarkup(<CamposDelDato dato={d} opciones={opciones} estado={null} prefijo="prueba" />);
  const etiqueta = (html: string, nombre: string) => html.match(new RegExp(`<(input|select)[^>]*name="${nombre}"[^>]*>`))?.[0] ?? "";

  it("un dato nuevo trae puesto el plazo de reporte de la entidad", () => {
    const html = campos(null);
    expect(etiqueta(html, "plazoReporteDias")).toContain('value="15"');
    expect(etiqueta(html, "periodicidad")).toMatch(/^<select/);
  });

  it("si una ficha aprobada lo cita, periodicidad, cómo se junta y desagregación van de solo lectura, con sus campos ocultos", () => {
    const html = campos(dato);
    expect(html).toContain("Una ficha aprobada ya cita este dato");
    for (const [nombre, valor] of [
      ["periodicidad", "mensual"],
      ["consolidacion", "suma"],
      ["dimensionId", "3"],
    ]) {
      const tag = etiqueta(html, nombre);
      expect(tag, nombre).toMatch(/^<input/);
      expect(tag, nombre).toContain('type="hidden"');
      expect(tag, nombre).toContain(`value="${valor}"`);
    }
    expect(html).toContain("Se suma");
    expect(etiqueta(html, "plazoReporteDias")).toContain('value="10"');
    // Lo demás se edita siempre; sin cita, también la periodicidad.
    expect(etiqueta(campos({ ...dato, citado: false }), "periodicidad")).toMatch(/^<select/);
  });
});

describe("las cifras de las pantallas del dato", () => {
  it.each([
    ["1284300000", "1.284.300.000"],
    ["-1234,5", "-1.234,5"],
    ["999", "999"],
    ["1000", "1.000"],
    ["0,1234", "0,1234"],
    ["?", "?"],
  ])("conPuntoDeMiles(%s) = %s", (entrada, salida) => expect(conPuntoDeMiles(entrada)).toBe(salida));

  it("cifraDeDato pone la coma decimal y el punto de miles a un valor guardado", () => {
    expect(cifraDeDato("1284300000.5")).toBe("1.284.300.000,5");
    expect(cifraDeDato("-1234.5")).toBe("-1.234,5");
    expect(cifraDeDato("12.3456")).toBe("12,3456");
  });
});
