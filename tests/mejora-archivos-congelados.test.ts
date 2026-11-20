/**
 * Los archivos que ya se firmaron (Fase 15B, anexo §11.2): la evidencia del registro que ya estaba cuando el plan se envió por
 * primera vez, y los archivos del análisis de la ronda en curso mientras el plan está enviado o aprobado, no se quitan, por nadie;
 * en un hallazgo cargado, desde que se confirma la carga (decisión del controlador: la fila `mejora_carga_confirmada`, que deja el
 * formato firmado). La única salida es el retiro por datos personales del Admin SGC, con justificación, que deja el rastro en el
 * historial del hallazgo y el acto, sin la justificación, en la bitácora. Contra la base de trabajo, dentro de una transacción que
 * se revierte; los archivos se suben por el dominio (`registrarArchivo`, que deja su `subir_archivo`) y los estados se alcanzan
 * por el dominio, salvo la ronda anterior y el análisis de una carga, que el dominio no admite subir y se arman por SQL.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToReadableStream } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// La página del hallazgo se pinta con la transacción del test y la sesión que se elija; sin ellas (el resto del archivo), lo real.
const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));
vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.tx ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({
  exigirSesion: async () => contexto.sesion,
  exigirPermiso: async () => contexto.sesion,
  exigirEntradaPanel: async () => contexto.sesion,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import type { TransactionSql } from "postgres";
import PaginaHallazgo from "@/app/(app)/mejoramiento/[id]/page";
import { obtenerSql } from "@/db/cliente";
import { registrarArchivo } from "@/db/consultas/admin";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { devolverPlan } from "@/db/consultas/mejoramiento/aprobacion";
import {
  archivoServible,
  archivosDe,
  archivosQuitables,
  autorizarSubida,
  estaCongelado,
  quitarArchivoDeMejora,
  retirarPorDatosPersonales,
} from "@/db/consultas/mejoramiento/archivos";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { anularHallazgo, registrarHallazgo, registrarRespuestaAlEnte } from "@/db/consultas/mejoramiento/registro";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { ARCHIVO_FIRMADO, NO_SE_RETIRA_POR_AQUI, RETIRO_SIN_JUSTIFICAR } from "@/lib/mejoramiento/textos";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import {
  baseDeMejora,
  c,
  datosDeCarga,
  datosDeHallazgo,
  escaneoDeLaCarga,
  hallazgoEn,
  HORA_DE_ESCENA,
  llevarHasta,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

let almacen = "";
const previo = process.env.ALMACEN_RUTA;
beforeAll(() => {
  almacen = mkdtempSync(path.join(tmpdir(), "sgc-mejora-congelados-"));
  process.env.ALMACEN_RUTA = almacen;
});
afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  rmSync(almacen, { recursive: true, force: true });
  await sql.end();
  globalThis.__sql = undefined;
});

/** La página del hallazgo (`/mejoramiento/[id]`) como la ve `sesion`, pintada con la transacción del test. */
async function pintar(tx: TransactionSql, sesion: SesionFlujo, id: number): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    const flujo = await renderToReadableStream(await PaginaHallazgo({ params: Promise.resolve({ id: String(id) }), searchParams: Promise.resolve({}) }));
    await flujo.allReady;
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

const JUSTIFICACION = "Trae el nombre y el documento de un paciente en la primera hoja";
const TERMINADO = "El hallazgo ya terminó y no admite cambios";

type Dueno = { contexto: "mejora_hallazgo" | "mejora_ronda"; contextoId: number };

let n = 0;
/** Un archivo subido por el dominio (`registrarArchivo`, con su `subir_archivo`); con `enDisco`, también en el almacén. */
async function subir(
  tx: TransactionSql,
  d: Dueno,
  rol: "evidencia" | "analisis",
  quien: SesionFlujo,
  enDisco = false,
): Promise<{ id: number; ruta: string; nombre: string }> {
  n += 1;
  const nombre = `zz-congelado-${n}.pdf`;
  const ruta = `mejoramiento/${d.contexto === "mejora_hallazgo" ? "hallazgos" : "rondas"}/${d.contextoId}/${Date.now()}-${n}-${nombre}`;
  if (enDisco) {
    const absoluta = resolverRutaAlmacen(ruta)!;
    mkdirSync(path.dirname(absoluta), { recursive: true });
    writeFileSync(absoluta, "%PDF-1.4 prueba");
  }
  const { id } = await registrarArchivo(
    {
      versionId: null, rol, ruta, nombreOriginal: nombre, extension: "pdf", mime: "application/pdf", tamanoBytes: 2048,
      hashSha256: "9".repeat(64), contexto: d.contexto, contextoId: d.contextoId,
    },
    quien.usuarioId,
    { sql: tx },
  );
  return { id: Number(id), ruta, nombre };
}

/** Un archivo del análisis por SQL, sin `subir_archivo`: solo para lo que el dominio no admite subir (la regla no mira el orden). */
async function analisisPorSql(tx: TransactionSql, rondaId: number): Promise<number> {
  n += 1;
  const [a] = await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (NULL, 'mejora_ronda', ${rondaId}, 'analisis', ${`mejoramiento/rondas/${rondaId}/${Date.now()}-${n}-a.pdf`}, ${`zz-analisis-${n}.pdf`},
      'pdf', 'application/pdf', 10, ${"8".repeat(64)}) RETURNING id`;
  return Number(a.id);
}

const rondaDe = async (tx: TransactionSql, hallazgoId: number, numero = 1) =>
  Number((await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} AND numero = ${numero}`)[0].id);

const delHallazgo = (hallazgoId: number): Dueno => ({ contexto: "mejora_hallazgo", contextoId: hallazgoId });
const deLaRonda = (rondaId: number): Dueno => ({ contexto: "mejora_ronda", contextoId: rondaId });

/** Si la persona puede quitar ese archivo hoy (la regla del botón, la misma del servidor). */
const quita = async (tx: TransactionSql, quien: SesionFlujo, id: number, d: Dueno) =>
  (await archivosQuitables(tx, quien, [{ id }], d)).includes(id);

const congelado = async (tx: TransactionSql, id: number, d: Dueno, rol: string) =>
  estaCongelado(tx, { id, contexto: d.contexto, contextoId: d.contextoId, rol });

const devolver = (tx: TransactionSql, b: BaseDeMejora, hallazgoId: number) =>
  devolverPlan(b.admin, { hallazgoId, observaciones: "Falta decir quién verifica el registro de cada turno" }, c(HORA_DE_ESCENA, tx));

const retirar = (tx: TransactionSql, quien: SesionFlujo, archivoId: number, justificacion = JUSTIFICACION) =>
  retirarPorDatosPersonales(quien, { archivoId, justificacion }, c(HORA_DE_ESCENA, tx));

describe("la evidencia del registro (anexo §11.2)", () => {
  it("antes del primer envío la quitan quien la subió y el Admin SGC; después, nadie, ni tras una devolución; la que se sube después, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const d = delHallazgo(h.id);
      // Antes de enviar el plan: quien la subió (Control Interno, que lo registró) y el Admin SGC la quitan.
      const suya = await subir(tx, d, "evidencia", b.control);
      const delAdmin = await subir(tx, d, "evidencia", b.control);
      await quitarArchivoDeMejora(b.control, suya.id, { sql: tx });
      await quitarArchivoDeMejora(b.admin, delAdmin.id, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id IN ${tx([suya.id, delAdmin.id])}`).toHaveLength(0);

      const antes = await subir(tx, d, "evidencia", b.control);
      expect(await congelado(tx, antes.id, d, "evidencia")).toBe(false);
      expect(await quita(tx, b.control, antes.id, d)).toBe(true);
      expect(await quita(tx, b.admin, antes.id, d)).toBe(true);

      // El primer envío del plan la congela: nadie la quita, tampoco el Admin SGC.
      await llevarHasta(tx, b, h.id, "en_revision");
      expect(await congelado(tx, antes.id, d, "evidencia")).toBe(true);
      expect(await quita(tx, b.control, antes.id, d)).toBe(false);
      expect(await quita(tx, b.admin, antes.id, d)).toBe(false);
      await expect(quitarArchivoDeMejora(b.control, antes.id, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));
      await expect(quitarArchivoDeMejora(b.admin, antes.id, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));
      const lista = await archivosDe(tx, b.admin, d);
      expect(lista.archivos.find((a) => a.id === antes.id)?.congelado).toBe(true);

      // Añadir sigue permitido; lo que se sube después del envío se quita como hoy.
      expect((await autorizarSubida(b.control, { contexto: "mejora_hallazgo", id: h.id, rol: "evidencia" }, { sql: tx })).ok).toBe(true);
      const despues = await subir(tx, d, "evidencia", b.control);
      expect(await congelado(tx, despues.id, d, "evidencia")).toBe(false);
      expect((await archivosDe(tx, b.admin, d)).archivos.find((a) => a.id === despues.id)?.congelado).toBe(false);
      await quitarArchivoDeMejora(b.control, despues.id, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${despues.id}`).toHaveLength(0);

      // Devuelto el plan, la que estaba antes del primer envío sigue sin quitarse.
      await devolver(tx, b, h.id);
      expect((await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${h.id}`)[0].estado).toBe("por_formular");
      expect(await congelado(tx, antes.id, d, "evidencia")).toBe(true);
      await expect(quitarArchivoDeMejora(b.admin, antes.id, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));
      // Y la que se sube en la devolución, antes del reenvío, no es la del primer envío: se quita.
      const enLaDevolucion = await subir(tx, d, "evidencia", b.control);
      await llevarHasta(tx, b, h.id, "en_revision");
      expect(await congelado(tx, enLaDevolucion.id, d, "evidencia")).toBe(false);
      await quitarArchivoDeMejora(b.admin, enLaDevolucion.id, { sql: tx });
    }));
});

describe("los archivos del análisis (anexo §11.2)", () => {
  it("en «Por formular» se quitan; enviado o aprobado, no, tampoco el Admin SGC; devuelto, otra vez sí; reenviado, otra vez no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const d = deLaRonda(await rondaDe(tx, h.id));
      const otro = await subir(tx, d, "analisis", b.lider);
      const adjunto = await subir(tx, d, "analisis", b.lider);
      await quitarArchivoDeMejora(b.lider, otro.id, { sql: tx });
      expect(await quita(tx, b.lider, adjunto.id, d)).toBe(true);
      expect(await quita(tx, b.admin, adjunto.id, d)).toBe(true);
      expect(await congelado(tx, adjunto.id, d, "analisis")).toBe(false);

      // Enviado («En revisión»): nadie lo quita.
      await llevarHasta(tx, b, h.id, "en_revision");
      expect(await congelado(tx, adjunto.id, d, "analisis")).toBe(true);
      expect(await quita(tx, b.lider, adjunto.id, d)).toBe(false);
      expect(await quita(tx, b.admin, adjunto.id, d)).toBe(false);
      await expect(quitarArchivoDeMejora(b.admin, adjunto.id, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));

      // Devuelto, vuelve a «Por formular»: se quitan otra vez y se añaden.
      await devolver(tx, b, h.id);
      expect(await congelado(tx, adjunto.id, d, "analisis")).toBe(false);
      expect(await quita(tx, b.lider, adjunto.id, d)).toBe(true);
      expect((await autorizarSubida(b.lider, { contexto: "mejora_ronda", id: d.contextoId, rol: "analisis" }, { sql: tx })).ok).toBe(true);

      // Reenviado, otra vez no; y aprobado («En ejecución»), tampoco.
      await llevarHasta(tx, b, h.id, "en_revision");
      await expect(quitarArchivoDeMejora(b.lider, adjunto.id, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));
      await llevarHasta(tx, b, h.id, "en_ejecucion");
      expect(await congelado(tx, adjunto.id, d, "analisis")).toBe(true);
      await expect(quitarArchivoDeMejora(b.admin, adjunto.id, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${adjunto.id}`).toHaveLength(1);
    }));
});

describe("un hallazgo cargado: desde la carga confirmada (decisión del controlador)", () => {
  it("sin el formato firmado se quitan como hoy; con él, la evidencia y el análisis de antes no; lo de después sigue la regla general", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, b.lider.usuarioId), c(HORA_DE_ESCENA, tx));
      const d = delHallazgo(id);
      const ronda = deLaRonda(await rondaDe(tx, id));
      const quitada = await subir(tx, d, "evidencia", b.admin);
      const evidencia = await subir(tx, d, "evidencia", b.admin);
      const analisis = await analisisPorSql(tx, ronda.contextoId);
      // La carga sin confirmar: se quitan como hoy.
      expect(await congelado(tx, evidencia.id, d, "evidencia")).toBe(false);
      expect(await congelado(tx, analisis, ronda, "analisis")).toBe(false);
      expect(await quita(tx, b.admin, evidencia.id, d)).toBe(true);
      expect(await quita(tx, b.admin, analisis, ronda)).toBe(true);
      await quitarArchivoDeMejora(b.admin, quitada.id, { sql: tx });

      // El formato firmado confirma la carga: lo que estaba ya no se quita.
      const formato = await escaneoDeLaCarga(tx, id, b.admin.usuarioId, HORA_DE_ESCENA);
      expect(await congelado(tx, evidencia.id, d, "evidencia")).toBe(true);
      expect(await congelado(tx, analisis, ronda, "analisis")).toBe(true);
      await expect(quitarArchivoDeMejora(b.admin, evidencia.id, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));
      await expect(quitarArchivoDeMejora(b.admin, analisis, { sql: tx })).rejects.toThrow(new ErrorMejora(ARCHIVO_FIRMADO));

      // Lo que se sube después: la evidencia se quita como hoy; el análisis, con el plan aprobado, no.
      expect((await autorizarSubida(b.admin, { contexto: "mejora_hallazgo", id, rol: "evidencia" }, { sql: tx })).ok).toBe(true);
      const despues = await subir(tx, d, "evidencia", b.admin);
      expect(await congelado(tx, despues.id, d, "evidencia")).toBe(false);
      await quitarArchivoDeMejora(b.admin, despues.id, { sql: tx });
      const analisisDespues = await analisisPorSql(tx, ronda.contextoId);
      expect(await congelado(tx, analisisDespues, ronda, "analisis")).toBe(true);
      // El formato firmado no es de esta regla: lo deja la de la 15A.
      expect(await congelado(tx, formato, d, "carga")).toBe(false);
    }));
});

describe("el camino corto (sin plan de acción)", () => {
  it("la evidencia se quita como hoy", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(HORA_DE_ESCENA, tx));
      const d = delHallazgo(id);
      const evidencia = await subir(tx, d, "evidencia", b.control);
      await llevarHasta(tx, b, id, "por_validar");
      expect(await congelado(tx, evidencia.id, d, "evidencia")).toBe(false);
      expect(await quita(tx, b.control, evidencia.id, d)).toBe(true);
      expect((await autorizarSubida(b.control, { contexto: "mejora_hallazgo", id, rol: "evidencia" }, { sql: tx })).ok).toBe(true);
      await quitarArchivoDeMejora(b.control, evidencia.id, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${evidencia.id}`).toHaveLength(0);
    }));
});

describe("retirar por datos personales (anexo §11.2; Ley 1581 de 2012)", () => {
  it("el Admin SGC retira un archivo congelado: deja de servirse y de estar en el almacén, y queda su rastro", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const d = delHallazgo(h.id);
      const archivo = await subir(tx, d, "evidencia", b.control, true);
      await llevarHasta(tx, b, h.id, "en_revision");
      const absoluta = resolverRutaAlmacen(archivo.ruta)!;
      expect(existsSync(absoluta)).toBe(true);
      expect(await archivoServible(b.admin, archivo.id, { sql: tx })).not.toBeNull();

      await retirar(tx, b.admin, archivo.id);

      expect(await archivoServible(b.admin, archivo.id, { sql: tx })).toBeNull();
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${archivo.id}`).toHaveLength(0);
      expect(existsSync(absoluta)).toBe(false);
      // El rastro, en el historial del hallazgo: el nombre, el tamaño, la huella, el rol, quién lo había subido y por qué.
      const eventos = await tx`SELECT ronda, detalle, usuario_id, ocurrio_en FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'archivo_retirado'`;
      expect(eventos).toHaveLength(1);
      expect(Number(eventos[0].usuario_id)).toBe(b.admin.usuarioId);
      expect((eventos[0].ocurrio_en as Date).toISOString()).toBe(new Date(HORA_DE_ESCENA).toISOString());
      expect(eventos[0].detalle).toMatchObject({
        archivoId: archivo.id,
        contexto: "mejora_hallazgo",
        contextoId: h.id,
        rol: "evidencia",
        nombre: archivo.nombre,
        tamano: 2048,
        huella: "9".repeat(64),
        subidoPor: b.control.usuarioId,
        subidoPorNombre: b.control.nombre,
        justificacion: JUSTIFICACION,
      });
      // A la bitácora va el acto, sin la justificación.
      const bitacora = await tx`SELECT detalle FROM auditoria
        WHERE accion = 'mejora_archivo_retirado' AND entidad = 'mejora_hallazgo' AND entidad_id = ${h.id}`;
      expect(bitacora).toHaveLength(1);
      expect(bitacora[0].detalle).toMatchObject({ archivoId: archivo.id, rol: "evidencia", codigo: h.codigo });
      expect(bitacora[0].detalle).not.toHaveProperty("justificacion");
      expect(JSON.stringify(bitacora[0].detalle)).not.toContain(JUSTIFICACION);
      // La página dice, donde estaba, que se retiró y cuándo.
      const lista = await archivosDe(tx, b.admin, d);
      expect(lista.archivos.map((a) => a.id)).not.toContain(archivo.id);
      expect(lista.retirados).toEqual([{ nombre: archivo.nombre, rol: "evidencia", en: new Date(HORA_DE_ESCENA) }]);
      // Quien no abre los archivos del hallazgo tampoco sabe que se retiró uno.
      expect(await archivosDe(tx, b.consulta, d)).toEqual({ archivos: [], retirados: [] });
    }));

  it("un archivo del análisis también; la justificación y el permiso", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const d = deLaRonda(await rondaDe(tx, h.id));
      const adjunto = await subir(tx, d, "analisis", b.lider);
      await llevarHasta(tx, b, h.id, "en_revision");
      await expect(retirar(tx, b.admin, adjunto.id, "Un pacien")).rejects.toThrow(new ErrorMejora(RETIRO_SIN_JUSTIFICAR));
      await expect(retirar(tx, b.admin, adjunto.id, "")).rejects.toThrow(new ErrorMejora(RETIRO_SIN_JUSTIFICAR));
      await expect(retirar(tx, b.control, adjunto.id)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(retirar(tx, b.lider, adjunto.id)).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${adjunto.id}`).toHaveLength(1);
      await expect(retirar(tx, b.admin, 987654321)).rejects.toThrow("El archivo no existe");

      await retirar(tx, b.admin, adjunto.id);
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${adjunto.id}`).toHaveLength(0);
      const [evento] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'archivo_retirado'`;
      expect(evento.detalle).toMatchObject({ contexto: "mejora_ronda", contextoId: d.contextoId, rol: "analisis", subidoPor: b.lider.usuarioId });
      expect((await archivosDe(tx, b.admin, d)).retirados).toEqual([{ nombre: adjunto.nombre, rol: "analisis", en: new Date(HORA_DE_ESCENA) }]);
    }));

  it("no se retira por aquí lo que no está congelado ni lo que la 15A ya dejaba sin quitar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      // Un archivo que no está congelado: la evidencia subida después del envío.
      const h = await hallazgoEn(tx, b, "por_formular");
      const adjunto = await subir(tx, deLaRonda(await rondaDe(tx, h.id)), "analisis", b.lider);
      await llevarHasta(tx, b, h.id, "en_revision");
      const libre = await subir(tx, delHallazgo(h.id), "evidencia", b.control);
      await expect(retirar(tx, b.admin, libre.id)).rejects.toThrow(new ErrorMejora(NO_SE_RETIRA_POR_AQUI));

      // Un archivo de una ronda anterior: la ronda 1 queda congelada al pasar a la 2 (por SQL: el dominio pide la evaluación).
      await tx`INSERT INTO mejora_rondas (hallazgo_id, numero) VALUES (${h.id}, 2)`;
      await tx`UPDATE mejora_hallazgos SET estado = 'por_formular', ronda = 2 WHERE id = ${h.id}`;
      expect(await congelado(tx, adjunto.id, deLaRonda(await rondaDe(tx, h.id)), "analisis")).toBe(false);
      await expect(retirar(tx, b.admin, adjunto.id)).rejects.toThrow(new ErrorMejora(NO_SE_RETIRA_POR_AQUI));
      await expect(quitarArchivoDeMejora(b.admin, adjunto.id, { sql: tx })).rejects.toThrow(/congelada/);

      // La evidencia de una actividad terminada.
      const ejecutado = await hallazgoEn(tx, b, "por_verificar");
      const [deActividad] = await tx`SELECT f.id FROM archivos f JOIN mejora_actividades a ON f.contexto = 'mejora_actividad' AND f.contexto_id = a.id
        WHERE a.hallazgo_id = ${ejecutado.id} AND a.estado = 'terminada' ORDER BY f.id LIMIT 1`;
      await expect(retirar(tx, b.admin, Number(deActividad.id))).rejects.toThrow(new ErrorMejora(NO_SE_RETIRA_POR_AQUI));

      // En un externo cargado: el formato firmado de la carga y el oficio de la respuesta registrada, aunque se hayan subido antes
      // de confirmarse la carga; la otra evidencia de antes, sí.
      const { id } = await cargarHallazgo(
        b.admin,
        datosDeCarga(b.procesoId, b.lider.usuarioId, { origen: "ente_control", fuente: "Visita de la Superintendencia de Salud", fechaLimiteEnte: "2026-12-30" }),
        c(HORA_DE_ESCENA, tx),
      );
      const d = delHallazgo(id);
      const oficio = await subir(tx, d, "evidencia", b.admin);
      const otra = await subir(tx, d, "evidencia", b.admin);
      await registrarRespuestaAlEnte(b.admin, { hallazgoId: id, enviadaEn: "2025-11-04", oficioId: oficio.id }, c(HORA_DE_ESCENA, tx));
      const formato = await escaneoDeLaCarga(tx, id, b.admin.usuarioId, HORA_DE_ESCENA);
      expect(await congelado(tx, oficio.id, d, "evidencia")).toBe(false);
      expect(await congelado(tx, otra.id, d, "evidencia")).toBe(true);
      await expect(retirar(tx, b.admin, formato)).rejects.toThrow(new ErrorMejora(NO_SE_RETIRA_POR_AQUI));
      await expect(retirar(tx, b.admin, oficio.id)).rejects.toThrow(new ErrorMejora(NO_SE_RETIRA_POR_AQUI));
      await expect(quitarArchivoDeMejora(b.admin, oficio.id, { sql: tx })).rejects.toThrow("El oficio de la respuesta al ente ya se registró: no se quita");
      await retirar(tx, b.admin, otra.id);
      expect(await tx`SELECT id FROM archivos WHERE id IN ${tx([formato, oficio.id, otra.id])} ORDER BY id`).toHaveLength(2);
      expect(await tx`SELECT 1 FROM mejora_eventos WHERE tipo = 'archivo_retirado' AND hallazgo_id IN ${tx([h.id, ejecutado.id])}`).toHaveLength(0);
    }));

  it("con el hallazgo terminado se rechaza, con la frase de un hallazgo terminado", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const d = delHallazgo(h.id);
      const archivo = await subir(tx, d, "evidencia", b.control);
      await llevarHasta(tx, b, h.id, "en_revision");
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró dos veces el mismo hecho" }, c(HORA_DE_ESCENA, tx));
      await expect(retirar(tx, b.admin, archivo.id)).rejects.toThrow(new ErrorMejora(TERMINADO));
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${archivo.id}`).toHaveLength(1);
    }));
});

describe("la página del hallazgo (anexo §11.2)", () => {
  it("el Admin SGC ve «Retirar por datos personales» en lo firmado, sin «Quitar»; nadie más; retirado, la línea y el rastro en el historial", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const evidencia = await subir(tx, delHallazgo(h.id), "evidencia", b.control);
      const adjunto = await subir(tx, deLaRonda(await rondaDe(tx, h.id)), "analisis", b.lider);
      await llevarHasta(tx, b, h.id, "en_revision");
      const libre = await subir(tx, delHallazgo(h.id), "evidencia", b.control);

      const delAdmin = await pintar(tx, b.admin, h.id);
      for (const a of [evidencia, adjunto]) {
        expect(delAdmin).toContain(`aria-label="Retirar por datos personales el archivo ${a.nombre}"`);
        expect(delAdmin).not.toContain(`aria-label="Quitar el archivo ${a.nombre}"`);
      }
      // Lo que se subió después del envío no está firmado: se quita, no se retira.
      expect(delAdmin).toContain(`aria-label="Quitar el archivo ${libre.nombre}"`);
      expect(delAdmin).not.toContain(`aria-label="Retirar por datos personales el archivo ${libre.nombre}"`);
      // Control Interno ve el hallazgo completo y sus archivos, pero no retira.
      const deControl = await pintar(tx, b.control, h.id);
      expect(deControl).toContain(evidencia.nombre);
      expect(deControl).not.toContain("Retirar por datos personales");

      await retirar(tx, b.admin, evidencia.id);
      await retirar(tx, b.admin, adjunto.id);
      const despues = await pintar(tx, b.admin, h.id);
      expect(despues).not.toContain(`/mejoramiento/archivos/${evidencia.id}/`);
      expect(despues.match(/Se retiró un archivo el <time dateTime="2026-11-17">/g)).toHaveLength(2);
      expect(despues).toContain(`Retiró por datos personales el archivo «${evidencia.nombre}» (2 KB) de la evidencia del registro, que había subido ${b.control.nombre}`);
      expect(despues).toContain(`Retiró por datos personales el archivo «${adjunto.nombre}» (2 KB) de los adjuntos del análisis, que había subido ${b.lider.nombre}`);
      expect(despues).toContain(`Justificación: ${JUSTIFICACION}`);
    }));

  it("una observación enviada con un adjunto del análisis y sin análisis escrito: el bloque se ve y el Admin SGC lo retira (revisión final, I2)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { clase: "observacion", criticidad: null });
      const ronda = deLaRonda(await rondaDe(tx, h.id));
      const adjunto = await subir(tx, ronda, "analisis", b.lider);
      await llevarHasta(tx, b, h.id, "en_revision");
      // El plan de una observación se envía sin análisis, sin causas y sin las dos preguntas (`examinarPlan` las pide solo en la
      // no conformidad): «3. Causa raíz» no tiene texto.
      expect(await tx`SELECT 1 FROM mejora_analisis WHERE hallazgo_id = ${h.id}`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM mejora_causas WHERE hallazgo_id = ${h.id}`).toHaveLength(0);
      expect((await tx`SELECT similares FROM mejora_rondas WHERE id = ${ronda.contextoId}`)[0].similares).toBeNull();

      const delAdmin = await pintar(tx, b.admin, h.id);
      expect(delAdmin).toContain("Adjuntos del análisis");
      expect(delAdmin).toContain(`/mejoramiento/archivos/${adjunto.id}/`);
      expect(delAdmin).toContain(`aria-label="Retirar por datos personales el archivo ${adjunto.nombre}"`);
      // Quien revisa lo lee, sin retirarlo; quien solo consulta no ve el hallazgo.
      const deControl = await pintar(tx, b.control, h.id);
      expect(deControl).toContain(`/mejoramiento/archivos/${adjunto.id}/`);
      expect(deControl).not.toContain("Retirar por datos personales");
      await expect(pintar(tx, b.consulta, h.id)).rejects.toThrow("NO_ENCONTRADA");

      // Retirado el único adjunto, el bloque sigue, con la línea del retiro.
      await retirar(tx, b.admin, adjunto.id);
      const despues = await pintar(tx, b.admin, h.id);
      expect(despues).toContain("Adjuntos del análisis");
      expect(despues).not.toContain(`/mejoramiento/archivos/${adjunto.id}/`);
      expect(despues.match(/Se retiró un archivo el <time dateTime="2026-11-17">/g)).toHaveLength(1);
    }));

  it("en una ronda anterior sin análisis escrito, sus adjuntos y sus retiros se leen (revisión final, I2)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { clase: "observacion", criticidad: null });
      const ronda = deLaRonda(await rondaDe(tx, h.id));
      const queda = await subir(tx, ronda, "analisis", b.lider);
      const sale = await subir(tx, ronda, "analisis", b.lider);
      await llevarHasta(tx, b, h.id, "en_revision");
      await retirar(tx, b.admin, sale.id);
      // La ronda 1 queda anterior al abrir la 2 (por SQL: el dominio pide el plan aprobado, ejecutado y evaluado «no eficaz»).
      await tx`INSERT INTO mejora_rondas (hallazgo_id, numero) VALUES (${h.id}, 2)`;
      await tx`UPDATE mejora_hallazgos SET estado = 'por_formular', ronda = 2 WHERE id = ${h.id}`;

      for (const quien of [b.admin, b.control]) {
        const html = await pintar(tx, quien, h.id);
        expect(html).toContain("Ronda 1 · no eficaz");
        expect(html).toContain(`/mejoramiento/archivos/${queda.id}/`);
        expect(html.match(/Se retiró un archivo el <time dateTime="2026-11-17">/g)).toHaveLength(1);
        // En una ronda anterior no se retira nada: queda congelada.
        expect(html).not.toContain(`aria-label="Retirar por datos personales el archivo ${queda.nombre}"`);
      }
    }));
});

describe("el retiro que no encuentra el archivo en el almacén (revisión final, M4)", () => {
  it("si la ruta no se resuelve dentro del almacén, lo dice en el registro de errores con el id y la ruta", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const archivo = await subir(tx, delHallazgo(h.id), "evidencia", b.control);
      await llevarHasta(tx, b, h.id, "en_revision");
      const fuera = `mejoramiento/../../fuera-${archivo.id}.pdf`;
      await tx`UPDATE archivos SET ruta = ${fuera} WHERE id = ${archivo.id}`;
      expect(resolverRutaAlmacen(fuera)).toBeNull();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await retirar(tx, b.admin, archivo.id);
        expect(await tx`SELECT 1 FROM archivos WHERE id = ${archivo.id}`).toHaveLength(0);
        expect(error).toHaveBeenCalledTimes(1);
        const [mensaje] = error.mock.calls[0] as [string];
        expect(mensaje).toContain(`archivo retirado ${archivo.id}`);
        expect(mensaje).toContain(fuera);
      } finally {
        error.mockRestore();
      }
    }));
});
