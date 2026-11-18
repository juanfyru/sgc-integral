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
  archivosQuitables,
  autorizarSubida,
  exigirDestinoAbierto,
  quitarArchivoDeMejora,
} from "@/db/consultas/mejoramiento/archivos";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { puedeAbrirArchivoDeMejora } from "@/lib/alcance";
import { datosDeEvaluacion, evaluarEficacia, fechaMinimaDe, huellaDeLoVisto, verificarImplementacion } from "@/db/consultas/mejoramiento/verificacion";
import { zonaHoraria } from "@/lib/zona-horaria";
import { actividadPorSql, baseDeMejora, c, datosDeHallazgo, hallazgoEn, HORA_DE_ESCENA, otroProcesoConLider } from "./utiles/mejoramiento";
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
      expect(await autorizarSubida(b.consulta, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      expect(await autorizarSubida(b.admin, { ...d, id: 987654321 }, subida(tx))).toMatchObject({ ok: false, estado: 404 });
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
      expect(await autorizarSubida(b.consulta, d, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      expect(await autorizarSubida(b.control, { ...d, id: 987654321 }, subida(tx))).toMatchObject({ ok: false, estado: 404 });
      await estado(tx, h.id, "por_formular");
      expect(await autorizarSubida(b.control, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
    }));

  it("verificación: quien ejecutó no verifica, y tampoco sube su evidencia (`puedeVerificar`)", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const r1 = await rondaPorSql(tx, h.id, 1);
      const d = { contexto: "mejora_ronda", id: r1, rol: "verificacion" } as const;
      await estado(tx, h.id, "por_verificar");
      const ejecuto = await usuarioDePrueba(tx, { rol: "control_interno" });
      expect((await autorizarSubida(ejecuto, d, subida(tx))).ok).toBe(true);
      await actividadPorSql(tx, h.id, ejecuto.usuarioId, { estado: "terminada", avance: 100 });
      expect(await autorizarSubida(ejecuto, d, subida(tx))).toMatchObject({ ok: false, estado: 403 });
      await expect(exigirDestinoAbierto(tx, "mejora_ronda", r1, ejecuto.usuarioId, "verificacion")).rejects.toBeInstanceOf(ErrorTramite);
      expect((await autorizarSubida(b.control, d, subida(tx))).ok).toBe(true);
    }));

  it("una ronda anterior queda congelada: ni subir ni quitar, tampoco el Admin SGC", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const r1 = await rondaPorSql(tx, h.id, 1);
      await rondaPorSql(tx, h.id, 2);
      await estado(tx, h.id, "por_verificar", { ronda: 2 });
      const d = { contexto: "mejora_ronda", id: r1, rol: "verificacion" } as const;
      expect(await autorizarSubida(b.control, d, subida(tx))).toMatchObject({ ok: false, estado: 409 });
      await expect(exigirDestinoAbierto(tx, "mejora_ronda", r1, b.control.usuarioId, "verificacion")).rejects.toBeInstanceOf(ErrorTramite);
      // El archivo ya estaba cuando la ronda era la en curso.
      await estado(tx, h.id, "por_verificar", { ronda: 1 });
      const { id } = await registrarArchivo(
        {
          versionId: null, rol: "verificacion", ruta: `mejoramiento/rondas/${r1}/${Date.now()}-v.pdf`, nombreOriginal: "v.pdf",
          extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "d".repeat(64),
          contexto: "mejora_ronda", contextoId: r1,
        },
        b.control.usuarioId,
        { sql: tx },
      );
      await estado(tx, h.id, "por_verificar", { ronda: 2 });
      await expect(quitarArchivoDeMejora(b.admin, id, { sql: tx })).rejects.toThrow(/congelada/);
      await expect(quitarArchivoDeMejora(b.control, id, { sql: tx })).rejects.toThrow(/congelada/);
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${id}`).toHaveLength(1);
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
      await expect(quitarArchivoDeMejora(b.control, f1, { sql: tx })).rejects.toThrow("No puede quitar este archivo");
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
      await expect(quitarArchivoDeMejora(b.admin, f3, { sql: tx })).rejects.toThrow("El hallazgo ya terminó");
      await expect(quitarArchivoDeMejora(b.lider, f3, { sql: tx })).rejects.toThrow("El hallazgo ya terminó");
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${f3}`).toHaveLength(1);
      // Quien no ve el archivo no lo quita ni sabe que existe.
      await expect(quitarArchivoDeMejora(b.consulta, f3, { sql: tx })).rejects.toThrow(/no existe/);
      await expect(quitarArchivoDeMejora(b.admin, 987654321, { sql: tx })).rejects.toThrow(/no existe/);
    }));
});

describe("quitar un archivo de corrección y exigirDestinoAbierto por rol", () => {
  it("la evidencia de la corrección solo se quita por corregir; después nadie, tampoco el Admin SGC (PC-02: no se cierra sin evidencia)", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      await estado(tx, h.id, "por_corregir");
      const subir = async (nombre: string) =>
        Number(
          (
            await registrarArchivo(
              {
                versionId: null, rol: "correccion", ruta: `mejoramiento/hallazgos/${h.id}/${Date.now()}-${nombre}`, nombreOriginal: nombre,
                extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "e".repeat(64),
                contexto: "mejora_hallazgo", contextoId: h.id,
              },
              b.lider.usuarioId,
              { sql: tx },
            )
          ).id,
        );
      const f1 = await subir("c1.pdf");
      const f2 = await subir("c2.pdf");
      const f3 = await subir("c3.pdf");
      // Por corregir: quien la subió y el Admin SGC la quitan.
      await quitarArchivoDeMejora(b.lider, f2, { sql: tx });
      await quitarArchivoDeMejora(b.admin, f3, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id IN (${f2}, ${f3})`).toHaveLength(0);
      const dueno = { contexto: "mejora_hallazgo", contextoId: h.id };
      for (const e of ["por_decidir", "por_validar", "por_formular"]) {
        await estado(tx, h.id, e);
        for (const quien of [b.lider, b.admin]) {
          await expect(quitarArchivoDeMejora(quien, f1, { sql: tx })).rejects.toThrow(
            "La evidencia de la corrección solo se quita mientras está por corregir",
          );
          expect(await archivosQuitables(tx, quien, [{ id: f1 }], dueno)).toEqual([]);
        }
      }
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${f1}`).toHaveLength(1);
    }));

  it("la evidencia de una actividad terminada o cancelada no se quita, tampoco el Admin SGC (PC-05: no se termina sin evidencia)", () =>
    revertida(sql, async (tx) => {
      const { b, h, responsable } = await escena(tx);
      const a = await actividadPorSql(tx, h.id, responsable.usuarioId, { aprobada: true, estado: "en_proceso" });
      await estado(tx, h.id, "en_ejecucion");
      const subir = async (nombre: string) =>
        Number(
          (
            await registrarArchivo(
              {
                versionId: null, rol: "evidencia", ruta: `mejoramiento/actividades/${a}/${Date.now()}-${nombre}`, nombreOriginal: nombre,
                extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "f".repeat(64),
                contexto: "mejora_actividad", contextoId: a,
              },
              responsable.usuarioId,
              { sql: tx },
            )
          ).id,
        );
      const dueno = { contexto: "mejora_actividad", contextoId: a };
      // Con la actividad en curso: quien lo subió y el Admin SGC lo quitan.
      const f1 = await subir("e1.pdf");
      const f2 = await subir("e2.pdf");
      const f3 = await subir("e3.pdf");
      expect(await archivosQuitables(tx, responsable, [{ id: f1 }], dueno)).toEqual([f1]);
      await quitarArchivoDeMejora(responsable, f1, { sql: tx });
      await quitarArchivoDeMejora(b.admin, f2, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id IN (${f1}, ${f2})`).toHaveLength(0);
      for (const e of ["terminada", "cancelada"]) {
        await tx`UPDATE mejora_actividades SET estado = ${e} WHERE id = ${a}`;
        for (const quien of [responsable, b.admin]) {
          await expect(quitarArchivoDeMejora(quien, f3, { sql: tx })).rejects.toThrow(
            "La evidencia de una actividad terminada o cancelada no se quita",
          );
          expect(await archivosQuitables(tx, quien, [{ id: f3 }], dueno)).toEqual([]);
        }
      }
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${f3}`).toHaveLength(1);
      // Devuelta en la verificación, vuelve a estar en curso: se puede otra vez.
      await tx`UPDATE mejora_actividades SET estado = 'en_proceso', verificacion = 'devuelta' WHERE id = ${a}`;
      await quitarArchivoDeMejora(b.admin, f3, { sql: tx });
      expect(await tx`SELECT 1 FROM archivos WHERE id = ${f3}`).toHaveLength(0);
    }));

  it("exigirDestinoAbierto: corrección y análisis, y el rol es obligatorio donde hay roles", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await escena(tx);
      const r1 = await rondaPorSql(tx, h.id, 1);
      await estado(tx, h.id, "por_corregir");
      await exigirDestinoAbierto(tx, "mejora_hallazgo", h.id, b.lider.usuarioId, "correccion");
      await estado(tx, h.id, "por_formular");
      await expect(exigirDestinoAbierto(tx, "mejora_hallazgo", h.id, b.lider.usuarioId, "correccion")).rejects.toBeInstanceOf(ErrorTramite);
      await exigirDestinoAbierto(tx, "mejora_ronda", r1, b.lider.usuarioId, "analisis");
      await estado(tx, h.id, "en_revision");
      await expect(exigirDestinoAbierto(tx, "mejora_ronda", r1, b.lider.usuarioId, "analisis")).rejects.toBeInstanceOf(ErrorTramite);
      const sinRol = exigirDestinoAbierto(tx, "mejora_hallazgo", h.id, b.lider.usuarioId);
      await expect(sinRol).rejects.toThrow(/rol/);
      await expect(sinRol).rejects.not.toBeInstanceOf(ErrorTramite);
    }));
});

describe("el tope de tres archivos de un reporte con subidas simultáneas", () => {
  it("la segunda transacción ve el archivo que la primera acaba de confirmar", async () => {
    // Datos confirmados (dos conexiones distintas): se limpian en `finally`; el usuario lleva nombre único y no se borra.
    const reportante = await sql.begin((tx) => usuarioDePrueba(tx, { rol: "consulta" }));
    const [r] = await sql`INSERT INTO mejora_reportes (reportado_por, reportado_en, descripcion, visto_en, estado, vence_en)
      VALUES (${reportante.usuarioId}, ${AHORA}, 'Algo que vi', '2026-11-16', 'recibido', ${AHORA}) RETURNING id`;
    const reporteId = Number(r.id);
    try {
      for (let i = 0; i < 2; i += 1) await archivoPorSql(sql as unknown as TransactionSql, "mejora_reporte", reporteId);
      const datosDe = (nombre: string) => ({
        versionId: null, rol: "evidencia", ruta: `mejoramiento/reportes/${reporteId}/${Date.now()}-${nombre}`, nombreOriginal: nombre,
        extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "f".repeat(64),
        contexto: "mejora_reporte", contextoId: reporteId,
      });
      const subir = (nombre: string) => registrarArchivo(datosDe(nombre), reportante.usuarioId);
      // La primera sube dentro de una transacción abierta; la segunda se encola en el candado del reporte; entonces confirma la
      // primera. La segunda debe contar el archivo recién confirmado.
      let segunda!: Promise<unknown>;
      const primera = sql.begin(async (tx) => {
        await registrarArchivo(datosDe("x.pdf"), reportante.usuarioId, { sql: tx });
        segunda = subir("y.pdf").then(
          () => ({ status: "fulfilled" as const }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        );
        await new Promise((resolver) => setTimeout(resolver, 300));
      });
      await primera;
      const resultado = (await segunda) as { status: string; reason?: unknown };
      expect(resultado.status).toBe("rejected");
      expect(resultado.reason).toBeInstanceOf(ErrorTramite);
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM archivos WHERE contexto = 'mejora_reporte' AND contexto_id = ${reporteId}`;
      expect(n).toBe(3);
    } finally {
      await sql`DELETE FROM archivos WHERE contexto = 'mejora_reporte' AND contexto_id = ${reporteId}`;
      await sql`DELETE FROM mejora_reportes WHERE id = ${reporteId}`;
    }
  });
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

describe("la evidencia de la verificación (Tarea 17, ronda 1)", () => {
  it("lo que había al verificar ya no se quita; lo que se sube en la espera, hasta que se registra la evaluación; después, nada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_verificar");
      const [r] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      const rondaId = Number(r.id);
      const dueno = { contexto: "mejora_ronda", contextoId: rondaId };
      const subir = async (nombre: string) =>
        Number(
          (
            await registrarArchivo(
              {
                versionId: null, rol: "verificacion", ruta: `mejoramiento/rondas/${rondaId}/${Date.now()}-${nombre}`, nombreOriginal: nombre,
                extension: "pdf", mime: "application/pdf", tamanoBytes: 10, hashSha256: "d".repeat(64), contexto: "mejora_ronda", contextoId: rondaId,
              },
              b.control.usuarioId,
              { sql: tx },
            )
          ).id,
        );
      const quitables = async (quien: typeof b.control) => archivosQuitables(tx, quien, (await archivosDe(tx, quien, dueno)).map((a) => ({ id: a.id })), dueno);

      const antes = await subir("verificacion.pdf");
      expect(await quitables(b.control)).toContain(antes);
      expect(await quitables(b.admin)).toContain(antes);
      const terminadas = await tx`SELECT a.id FROM mejora_actividades a WHERE a.hallazgo_id = ${h.id} AND a.estado = 'terminada' ORDER BY a.id`;
      await verificarImplementacion(
        b.control,
        { hallazgoId: h.id, actividades: terminadas.map((a) => ({ id: Number(a.id), conforme: true })), metodos: ["evidencias"] },
        c(HORA_DE_ESCENA, tx),
      );
      // El evento de la verificación guarda qué archivos había: esos ya no se quitan, tampoco el Admin SGC.
      const [evento] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'verificar_implementacion'`;
      expect(evento.detalle).toMatchObject({ archivosVerificados: [antes] });
      expect(await quitables(b.control)).not.toContain(antes);
      expect(await quitables(b.admin)).not.toContain(antes);
      await expect(quitarArchivoDeMejora(b.admin, antes, { sql: tx })).rejects.toThrow("La evidencia de la verificación ya se usó al verificar: no se quita");

      // Lo que se sube durante la espera (la evidencia de la eficacia) se quita mientras no se registre la evaluación.
      const espera = await subir("eficacia.pdf");
      expect(await quitables(b.control)).toEqual([espera]);
      const fm = await fechaMinimaDe(tx, h.id, zonaHoraria());
      const evalua = c(`${fm!.minima}T15:00:00Z`, tx);
      await evaluarEficacia(
        b.control,
        {
          hallazgoId: h.id, resultado: "eficaz", criterios: ["no_recurrencia"], desde: fm!.r, hasta: fm!.minima,
          justificacion: "No se repitió el hecho desde que terminó el plan de prueba", confirmaOcurrencias: true,
          vistoHuella: huellaDeLoVisto(await datosDeEvaluacion(b.control, h.id, evalua)), credenciales: { clave: "ok" },
        },
        evalua,
      );
      expect(await quitables(b.control)).toEqual([]);
      expect(await quitables(b.admin)).toEqual([]);
      await expect(quitarArchivoDeMejora(b.admin, espera, { sql: tx })).rejects.toThrow("La evaluación de la eficacia ya se registró: su evidencia no se quita");
    }));
});
