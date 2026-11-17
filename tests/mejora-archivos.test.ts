/**
 * Los archivos del módulo de mejoramiento (Fase 15A, Tarea 9, spec §6.3 y §12.2): quién sube qué, quién abre qué y quién
 * quita. Contra la BD de trabajo, dentro de una transacción que se revierte; los archivos son filas de `archivos`.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { registrarArchivo } from "@/db/consultas/admin";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import {
  archivoServible,
  archivosDe,
  autorizarSubida,
  exigirDestinoAbierto,
  quitarArchivoDeMejora,
} from "@/db/consultas/mejoramiento/archivos";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { puedeAbrirArchivoDeMejora } from "@/lib/alcance";
import { actividadPorSql, baseDeMejora, c, datosDeHallazgo, otroProcesoConLider } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-17T15:00:00Z";

/** Un hallazgo registrado por su líder, con el responsable de una actividad (rol consulta) y otro proceso. */
async function escena(tx: TransactionSql) {
  const b = await baseDeMejora(tx);
  const otro = await otroProcesoConLider(tx);
  const h = await registrarHallazgo(b.lider, datosDeHallazgo(b.procesoId), c(AHORA, tx));
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  return { b, otro, h, responsable };
}

const estado = (tx: TransactionSql, id: number, e: string, extra?: { cargado?: boolean; ronda?: number }) =>
  tx`UPDATE mejora_hallazgos SET estado = ${e}, cargado = ${extra?.cargado ?? false}, ronda = ${extra?.ronda ?? 1} WHERE id = ${id}`;

let n = 0;
async function archivoPorSql(tx: TransactionSql, contexto: string, contextoId: number, rol = "evidencia"): Promise<number> {
  n += 1;
  const [a] = await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (NULL, ${contexto}, ${contextoId}, ${rol}, ${`mejoramiento/prueba/${Date.now()}-${n}/a.pdf`}, ${`a${n}.pdf`}, 'pdf',
      'application/pdf', 10, ${"a".repeat(64)}) RETURNING id`;
  return Number(a.id);
}

async function rondaPorSql(tx: TransactionSql, hallazgoId: number, numero = 1): Promise<number> {
  // El registro ya crea la ronda 1: se toma la que haya.
  const [ya] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} AND numero = ${numero}`;
  if (ya) return Number(ya.id);
  const [r] = await tx`INSERT INTO mejora_rondas (hallazgo_id, numero) VALUES (${hallazgoId}, ${numero}) RETURNING id`;
  return Number(r.id);
}

async function reportePorSql(tx: TransactionSql, por: number, cambios?: { estado?: string; hallazgoId?: number }): Promise<number> {
  const [r] = await tx`INSERT INTO mejora_reportes (reportado_por, reportado_en, descripcion, visto_en, estado, hallazgo_id, vence_en)
    VALUES (${por}, ${AHORA}, 'Algo que vi', '2026-11-16', ${cambios?.estado ?? "recibido"}, ${cambios?.hallazgoId ?? null}, ${AHORA}) RETURNING id`;
  return Number(r.id);
}

const subida = (tx: TransactionSql) => ({ sql: tx });

describe("autorizarSubida: el hallazgo", () => {
  it("evidencia: quien lo registró y el Admin SGC, mientras no termine", () =>
    revertida(sql, async (tx) => {
      const { b, otro, h } = await escena(tx);
      const d = { contexto: "mejora_hallazgo", id: h.id, rol: "evidencia" } as const;
      expect(await autorizarSubida(b.lider, d, subida(tx))).toEqual({ ok: true, carpeta: `mejoramiento/hallazgos/${h.id}` });
      expect((await autorizarSubida(b.admin, d, subida(tx))).ok).toBe(true);
      expect(await autorizarSubida(b.control, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      expect(await autorizarSubida(b.consulta, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      expect(await autorizarSubida(otro.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      expect(await autorizarSubida(b.lider, { ...d, id: 987654321 }, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      await estado(tx, h.id, "cerrado");
      expect(await autorizarSubida(b.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
      expect(await autorizarSubida(b.admin, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));

  it("corrección: quien actúa por el proceso, en por_corregir", () =>
    revertida(sql, async (tx) => {
      const { b, otro, h } = await escena(tx);
      const d = { contexto: "mejora_hallazgo", id: h.id, rol: "correccion" } as const;
      await estado(tx, h.id, "por_corregir");
      expect((await autorizarSubida(b.lider, d, subida(tx))).ok).toBe(true);
      // El proceso tiene líder: el Admin SGC no actúa por él.
      expect(await autorizarSubida(b.admin, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      expect(await autorizarSubida(otro.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      await estado(tx, h.id, "por_decidir");
      expect(await autorizarSubida(b.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));

  it("carga: el Admin SGC, con el hallazgo cargado y sin terminar", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const d = { contexto: "mejora_hallazgo", id: h.id, rol: "carga" } as const;
      await estado(tx, h.id, "en_ejecucion", { cargado: true });
      expect((await autorizarSubida(b.admin, d, subida(tx))).ok).toBe(true);
      expect(await autorizarSubida(b.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      await estado(tx, h.id, "en_ejecucion", { cargado: false });
      expect(await autorizarSubida(b.admin, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
      await estado(tx, h.id, "cerrado", { cargado: true });
      expect(await autorizarSubida(b.admin, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));
});

describe("autorizarSubida: la ronda", () => {
  it("análisis: quien actúa por el proceso, en por_formular y en la ronda del hallazgo", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const r1 = await rondaPorSql(tx, h.id, 1);
      const r2 = await rondaPorSql(tx, h.id, 2);
      await estado(tx, h.id, "por_formular", { ronda: 1 });
      const d = { contexto: "mejora_ronda", id: r1, rol: "analisis" } as const;
      expect(await autorizarSubida(b.lider, d, subida(tx))).toEqual({ ok: true, carpeta: `mejoramiento/rondas/${r1}` });
      expect(await autorizarSubida(b.admin, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      expect(await autorizarSubida(b.lider, { ...d, id: r2 }, subida(tx))).toMatchObject({ ok: false, estado: 409 });
      expect(await autorizarSubida(b.consulta, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      expect(await autorizarSubida(b.lider, { ...d, id: 987654321 }, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      await estado(tx, h.id, "en_revision", { ronda: 1 });
      expect(await autorizarSubida(b.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));

  it("verificación: quien verifica, en por_verificar o en_espera", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const r1 = await rondaPorSql(tx, h.id, 1);
      const d = { contexto: "mejora_ronda", id: r1, rol: "verificacion" } as const;
      await estado(tx, h.id, "por_verificar");
      expect((await autorizarSubida(b.control, d, subida(tx))).ok).toBe(true);
      await estado(tx, h.id, "en_espera");
      expect((await autorizarSubida(b.control, d, subida(tx))).ok).toBe(true);
      expect(await autorizarSubida(b.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      await estado(tx, h.id, "por_formular");
      expect(await autorizarSubida(b.control, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));
});

describe("autorizarSubida: la actividad", () => {
  it("su responsable, con el hallazgo en ejecución y la actividad sin terminar", () =>
    revertida(sql, async (tx) => {
      const { b, otro, h, responsable } = await escena(tx);
      const a = await actividadPorSql(tx, h.id, responsable.usuarioId, { aprobada: true });
      await estado(tx, h.id, "en_ejecucion");
      const d = { contexto: "mejora_actividad", id: a } as const;
      expect(await autorizarSubida(responsable, d, subida(tx))).toEqual({ ok: true, carpeta: `mejoramiento/actividades/${a}` });
      expect(await autorizarSubida(b.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      expect(await autorizarSubida(otro.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      expect(await autorizarSubida(responsable, { ...d, id: 987654321 }, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      await tx`UPDATE mejora_actividades SET estado = 'terminada' WHERE id = ${a}`;
      expect(await autorizarSubida(responsable, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));

  it("subir a una actividad terminada o a un hallazgo terminado se rechaza, también dentro de la transacción", () =>
    revertida(sql, async (tx) => {
      const { b, h, responsable } = await escena(tx);
      const a = await actividadPorSql(tx, h.id, responsable.usuarioId, { aprobada: true });
      await estado(tx, h.id, "en_ejecucion");
      const act = { contexto: "mejora_actividad", id: a } as const;
      const hz = { contexto: "mejora_hallazgo", id: h.id, rol: "evidencia" } as const;
      expect((await autorizarSubida(responsable, act, subida(tx))).ok).toBe(true);
      expect((await autorizarSubida(b.lider, hz, subida(tx))).ok).toBe(true);
      // El estado cambia entre la autorización y el registro.
      await tx`UPDATE mejora_actividades SET estado = 'cancelada' WHERE id = ${a}`;
      await expect(exigirDestinoAbierto(tx, "mejora_actividad", a, responsable.usuarioId)).rejects.toBeInstanceOf(ErrorTramite);
      await estado(tx, h.id, "cerrado");
      await expect(exigirDestinoAbierto(tx, "mejora_hallazgo", h.id, b.lider.usuarioId, "evidencia")).rejects.toBeInstanceOf(ErrorTramite);
      expect(await autorizarSubida(responsable, act, subida(tx))).toMatchObject({ ok: false, estado: 409 });
      expect(await autorizarSubida(b.lider, hz, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));
});

describe("autorizarSubida: el reporte", () => {
  it("quien reportó, mientras esté recibido y con menos de tres archivos", () =>
    revertida(sql, async (tx) => {
      const { b } = await escena(tx);
      const r = await reportePorSql(tx, b.consulta.usuarioId);
      const d = { contexto: "mejora_reporte", id: r } as const;
      expect(await autorizarSubida(b.consulta, d, subida(tx))).toEqual({ ok: true, carpeta: `mejoramiento/reportes/${r}` });
      expect(await autorizarSubida(b.control, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      expect(await autorizarSubida(b.lider, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      expect(await autorizarSubida(b.consulta, { ...d, id: 987654321 }, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      for (let i = 0; i < 3; i += 1) await archivoPorSql(tx, "mejora_reporte", r);
      expect(await autorizarSubida(b.consulta, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
      const r2 = await reportePorSql(tx, b.consulta.usuarioId, { estado: "descartado" });
      expect(await autorizarSubida(b.consulta, { ...d, id: r2 }, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));
});

describe("quién abre qué", () => {
  it("el responsable de una actividad abre los archivos de la suya y ningún otro", () =>
    revertida(sql, async (tx) => {
      const { b, h, responsable } = await escena(tx);
      const a1 = await actividadPorSql(tx, h.id, responsable.usuarioId, { aprobada: true });
      const a2 = await actividadPorSql(tx, h.id, b.admin.usuarioId, { aprobada: true });
      const r = await rondaPorSql(tx, h.id, 1);
      const deA1 = await archivoPorSql(tx, "mejora_actividad", a1);
      const deA2 = await archivoPorSql(tx, "mejora_actividad", a2);
      const deHallazgo = await archivoPorSql(tx, "mejora_hallazgo", h.id);
      const deRonda = await archivoPorSql(tx, "mejora_ronda", r, "analisis");
      expect(await archivoServible(responsable, deA1, subida(tx))).not.toBeNull();
      for (const id of [deA2, deHallazgo, deRonda]) expect(await archivoServible(responsable, id, subida(tx))).toBeNull();
      expect(await archivosDe(tx, responsable, { contexto: "mejora_hallazgo", contextoId: h.id })).toEqual([]);
      expect(await archivosDe(tx, responsable, { contexto: "mejora_actividad", contextoId: a2 })).toEqual([]);
      expect((await archivosDe(tx, responsable, { contexto: "mejora_actividad", contextoId: a1 })).map((f) => f.id)).toEqual([deA1]);
      // Quien ve el hallazgo completo abre todo.
      for (const id of [deA1, deA2, deHallazgo, deRonda]) expect(await archivoServible(b.control, id, subida(tx))).not.toBeNull();
      // Un seguimiento en esa actividad da lo mismo que ser su responsable, y solo en esa.
      const seguidor = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, registrado_por)
        VALUES (${h.id}, ${a2}, '2026-11-16', 'Algo', 10, ${seguidor.usuarioId})`;
      expect(await archivoServible(seguidor, deA2, subida(tx))).not.toBeNull();
      expect(await archivoServible(seguidor, deA1, subida(tx))).toBeNull();
    }));

  it("el rol Consulta sin participación no abre nada, igual que ante un identificador que no existe", () =>
    revertida(sql, async (tx) => {
      const { b, otro, h } = await escena(tx);
      const a = await archivoPorSql(tx, "mejora_hallazgo", h.id);
      expect(await archivoServible(b.consulta, a, subida(tx))).toBeNull();
      expect(await archivoServible(otro.lider, a, subida(tx))).toBeNull();
      expect(await archivoServible(b.consulta, 987654321, subida(tx))).toBeNull();
      expect(await puedeAbrirArchivoDeMejora({ contexto: "mejora_hallazgo", contextoId: h.id }, b.consulta, subida(tx))).toBe(false);
      expect(await puedeAbrirArchivoDeMejora({ contexto: "hallazgo", contextoId: h.id }, b.admin, subida(tx))).toBe(false);
      expect(await archivoServible(b.lider, a, subida(tx))).not.toBeNull();
    }));

  it("los de un reporte: quien reportó, quien ve todo y, convertido, quien ve el hallazgo completo", () =>
    revertida(sql, async (tx) => {
      const { b, otro, h } = await escena(tx);
      const r = await reportePorSql(tx, b.consulta.usuarioId);
      const a = await archivoPorSql(tx, "mejora_reporte", r);
      expect(await archivoServible(b.consulta, a, subida(tx))).not.toBeNull();
      expect(await archivoServible(b.control, a, subida(tx))).not.toBeNull();
      expect(await archivoServible(b.lider, a, subida(tx))).toBeNull();
      await tx`UPDATE mejora_reportes SET estado = 'convertido', hallazgo_id = ${h.id} WHERE id = ${r}`;
      expect(await archivoServible(b.lider, a, subida(tx))).not.toBeNull();
      expect(await archivoServible(otro.lider, a, subida(tx))).toBeNull();
    }));
});

describe("quitar", () => {
  it("quien lo subió, mientras el paso sigue abierto; el Admin SGC, mientras el hallazgo no termine; nadie después", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const subir = async (nombre: string, quien = b.lider) => {
        await estado(tx, h.id, "por_aceptar");
        const { id } = await registrarArchivo(
          {
            versionId: null, rol: "evidencia", ruta: `mejoramiento/hallazgos/${h.id}/${Date.now()}-${nombre}`, nombreOriginal: nombre,
            extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "b".repeat(64),
            contexto: "mejora_hallazgo", contextoId: h.id,
          },
          quien.usuarioId,
          { sql: tx },
        );
        return id;
      };
      const f1 = await subir("uno.pdf");
      await expect(quitarArchivoDeMejora(b.control, f1, { sql: tx })).rejects.toThrow();
      await quitarArchivoDeMejora(b.lider, f1, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${f1}`).toHaveLength(0);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'eliminar_archivo' AND entidad_id = ${f1}`;
      expect(bitacora.detalle).toMatchObject({ nombre: "uno.pdf", contexto: "mejora_hallazgo" });

      const f2 = await subir("dos.pdf");
      await estado(tx, h.id, "por_corregir");
      await quitarArchivoDeMejora(b.admin, f2, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${f2}`).toHaveLength(0);

      const f3 = await subir("tres.pdf");
      await estado(tx, h.id, "cerrado");
      await expect(quitarArchivoDeMejora(b.admin, f3, { sql: tx })).rejects.toThrow();
      await expect(quitarArchivoDeMejora(b.lider, f3, { sql: tx })).rejects.toThrow();
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${f3}`).toHaveLength(1);
      // Quien no ve el archivo no lo quita ni sabe que existe.
      await expect(quitarArchivoDeMejora(b.consulta, f3, { sql: tx })).rejects.toThrow(/no existe/);
      await expect(quitarArchivoDeMejora(b.admin, 987654321, { sql: tx })).rejects.toThrow(/no existe/);
    }));
});

describe("registrarArchivo", () => {
  it("rechaza un destino cerrado y un nombre repetido con su frase", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const datos = {
        versionId: null, rol: "evidencia", ruta: `mejoramiento/hallazgos/${h.id}/${Date.now()}-x.pdf`, nombreOriginal: "x.pdf",
        extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "c".repeat(64),
        contexto: "mejora_hallazgo", contextoId: h.id,
      };
      await registrarArchivo(datos, b.lider.usuarioId, { sql: tx });
      await expect(registrarArchivo(datos, b.lider.usuarioId, { sql: tx })).rejects.toThrow("Ya hay un archivo con ese nombre");
      await estado(tx, h.id, "anulado");
      await expect(registrarArchivo({ ...datos, ruta: `${datos.ruta}.2` }, b.lider.usuarioId, { sql: tx })).rejects.toBeInstanceOf(ErrorTramite);
    }));
});
