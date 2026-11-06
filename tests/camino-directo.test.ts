/**
 * Camino directo del panel (spec 13A §8.6 y §13): la carga de documentos ya aprobados fuera de la
 * plataforma. Estas funciones abren sus propias transacciones, así que los casos confirman filas:
 * documentos `ZZ-CD-*` y trámites sueltos, sin eventos ni firmas, que `limpiar` borra. Los códigos que
 * un caso abandona quedan en la bitácora para siempre: llevan un número único por corrida.
 */
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  anularVigenteEn,
  asegurarAdmin,
  crearDocumento,
  crearVersionBorrador,
  deshacerCarga,
  descartarBorrador,
  editarCatalogo,
  editarControl,
  editarVersionBorrador,
  exigirDocumentoRegistrable,
  listarDocumentosAdmin,
  obtenerDocumentoAdmin,
  publicarVersion,
  registrarArchivo,
} from "@/db/consultas/admin";
import { codigoAbandonado, todosLosCodigos } from "@/db/consultas/codigos";
import { sesionDe } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
const ACTOR = `zz_carga_${Date.now()}`;
let actorId: number;
let procesoId: number;
let otroProcesoId: number;
let tipoId: number;
let otroTipoId: number;
let consecutivo = Date.now() % 1_000_000;
/** Un número nuevo en cada corrida: un código que se abandona no vuelve a estar libre. */
let unico = Date.now();
const codigoUnico = () => `ZZ-CD-${(unico += 1)}`;

async function limpiar() {
  await sql`DELETE FROM tramites WHERE documento_id IN (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-CD-%')`;
  await sql`DELETE FROM archivos WHERE version_id IN (
    SELECT v.id FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id WHERE d.codigo LIKE 'ZZ-CD-%')`;
  await sql`DELETE FROM documento_versiones WHERE documento_id IN (SELECT id FROM documentos WHERE codigo LIKE 'ZZ-CD-%')`;
  await sql`DELETE FROM documentos WHERE codigo LIKE 'ZZ-CD-%'`;
}

beforeAll(async () => {
  await limpiar();
  await sql`UPDATE configuracion SET valor = '1' WHERE clave = 'publicacion_directa'`;
  await asegurarAdmin(ACTOR, "Actor de la carga", "x");
  [{ id: actorId }] = await sql`SELECT id FROM usuarios WHERE usuario = ${ACTOR}`;
  const procesos = await sql`SELECT id FROM procesos WHERE activo ORDER BY id LIMIT 2`;
  [procesoId, otroProcesoId] = procesos.map((p) => Number(p.id));
  const tipos = await sql`SELECT id FROM tipos_documento WHERE activo ORDER BY id LIMIT 2`;
  [tipoId, otroTipoId] = tipos.map((t) => Number(t.id));
});

afterAll(async () => {
  await limpiar();
  await sql.end();
  globalThis.__sql = undefined;
});

const asociacionesDe = (proceso: number = procesoId) => [{ procesoId: proceso, esPrincipal: true }];

const base = (codigo: string) => ({
  codigo,
  titulo: `Documento ${codigo}`,
  tipoId,
  descripcion: null,
  palabrasClave: null,
  asociaciones: asociacionesDe(),
});

/** Lo que la pantalla escribe antes de publicar: la evidencia de aprobación y el archivo principal. */
async function prepararBorrador(versionId: number) {
  await editarVersionBorrador(
    versionId,
    {
      fechaElaboracion: null,
      fechaRevision: null,
      fechaAprobacion: "2026-01-01",
      elaboro: null,
      reviso: null,
      aprobo: "Gerente",
      resumenCambios: null,
    },
    actorId,
  );
  await sql`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (${versionId}, 'principal', ${`pruebas/carga-${versionId}.pdf`}, 'carga.pdf', 'pdf', 'application/pdf', 100, ${`hash-${versionId}`})`;
}

async function registrado(codigo: string, numeroInicial = 1) {
  const creado = await crearDocumento({ ...base(codigo), numeroInicial }, actorId);
  await prepararBorrador(creado.versionId);
  await publicarVersion(creado.versionId, actorId);
  return creado;
}

async function conCargaCerrada(fn: () => Promise<void>) {
  const [previa] = await sql`SELECT valor FROM configuracion WHERE clave = 'publicacion_directa'`;
  await sql`INSERT INTO configuracion (clave, valor) VALUES ('publicacion_directa', '0')
    ON CONFLICT (clave) DO UPDATE SET valor = '0'`;
  try {
    await fn();
  } finally {
    if (previa) await sql`UPDATE configuracion SET valor = ${previa.valor} WHERE clave = 'publicacion_directa'`;
    else await sql`DELETE FROM configuracion WHERE clave = 'publicacion_directa'`;
  }
}

/** Un trámite confirmado, sin eventos: la otra conexión lo ve, y `limpiar` lo puede borrar. */
async function tramiteSuelto(d: { tipo: string; etapa: string; documentoId: number; versionId?: number }) {
  consecutivo += 1;
  await sql`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, documento_id, version_id, etapa)
    VALUES (${`SOL-1998-${consecutivo}`}, 1998, ${consecutivo}, ${d.tipo}, 'mejora', 'Prueba del camino directo.', ${actorId}, ${procesoId},
      ${d.documentoId}, ${d.versionId ?? null}, ${d.etapa})`;
}

/** Como lo dejaría una base de `sgc-suaza`: ya trae su evidencia y su archivo. */
async function borradorHeredado(documentoId: number, numero: number) {
  const [{ id }] = await sql`INSERT INTO documento_versiones (documento_id, numero, estado, aprobo, fecha_aprobacion)
    VALUES (${documentoId}, ${numero}, 'borrador', 'Gerente', '2026-01-01') RETURNING id`;
  await sql`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES (${id}, 'principal', ${`pruebas/heredado-${id}.pdf`}, 'heredado.pdf', 'pdf', 'application/pdf', 100, ${`hash-${id}`})`;
  return Number(id);
}

const auditoriaDe = (accion: string, entidadId: number) =>
  sql`SELECT detalle FROM auditoria WHERE accion = ${accion} AND entidad_id = ${entidadId} ORDER BY id DESC`;

describe("registrar y deshacer", () => {
  it("registra un documento ya aprobado con su número real de versión", async () => {
    const { documentoId, versionId } = await crearDocumento({ ...base("ZZ-CD-01"), numeroInicial: 4 }, actorId);
    await prepararBorrador(versionId);
    await publicarVersion(versionId, actorId);
    const [v] = await sql`SELECT numero, estado, origen_aprobacion, publicado_en FROM documento_versiones WHERE id = ${versionId}`;
    expect(v).toMatchObject({ numero: 4, estado: "vigente", origen_aprobacion: "fuera" });
    expect(v.publicado_en).not.toBeNull();
    await expect(crearVersionBorrador(documentoId, actorId)).rejects.toThrow(/se pide por trámite/);
  });

  it("el número de entrada es un entero de 1 a 999", async () => {
    await expect(crearDocumento({ ...base("ZZ-CD-10"), numeroInicial: 0 }, actorId)).rejects.toThrow(/de 1 a 999/);
    await expect(crearDocumento({ ...base("ZZ-CD-10"), numeroInicial: 1000 }, actorId)).rejects.toThrow(/de 1 a 999/);
    await expect(crearDocumento({ ...base("ZZ-CD-10"), numeroInicial: 1.5 }, actorId)).rejects.toThrow(/de 1 a 999/);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM documentos WHERE codigo = 'ZZ-CD-10'`;
    expect(n).toBe(0);
  });

  it("el alta guarda el nivel de acceso y los documentos relacionados", async () => {
    const [rel] = await sql`SELECT id FROM documentos WHERE codigo = 'ZZ-CD-01'`;
    const { documentoId } = await crearDocumento({ ...base("ZZ-CD-11"), nivelAcceso: "restringido", relacionados: [rel.id] }, actorId);
    const [d] = await sql`SELECT nivel_acceso FROM documentos WHERE id = ${documentoId}`;
    expect(d.nivel_acceso).toBe("restringido");
    const relaciones = await sql`SELECT relacionado_id FROM documento_relaciones WHERE documento_id = ${documentoId}`;
    expect(relaciones).toEqual([{ relacionado_id: rel.id }]);
  });

  it("deshacer una carga conserva el código y libera el número", async () => {
    const { documentoId, versionId } = await registrado("ZZ-CD-02", 3);
    await deshacerCarga(documentoId, "Se subió el archivo equivocado.", actorId);
    const [vieja] = await sql`SELECT estado FROM documento_versiones WHERE id = ${versionId}`;
    expect(vieja.estado).toBe("descartado");
    const [aud] = await auditoriaDe("deshacer_carga", documentoId);
    expect(aud.detalle).toMatchObject({ numero: 3, motivo: "Se subió el archivo equivocado." });

    const nueva = await crearVersionBorrador(documentoId, actorId, 3); // mismo número, mismo código
    await prepararBorrador(nueva.versionId);
    await publicarVersion(nueva.versionId, actorId);
    const [d] = await sql`SELECT d.codigo, v.numero FROM documentos d
      JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente' WHERE d.id = ${documentoId}`;
    expect(d).toMatchObject({ codigo: "ZZ-CD-02", numero: 3 });
    const documento = await obtenerDocumentoAdmin("ZZ-CD-02", await sesionDe(sql, ACTOR));
    expect(documento?.versiones.map((v) => v.estado)).toEqual(["vigente", "descartado"]); // el mismo número: la vigente primero
  });

  it("deshacer pide el motivo y no toca un documento con un trámite abierto", async () => {
    const { documentoId, versionId } = await registrado("ZZ-CD-12");
    await expect(deshacerCarga(documentoId, "   ", actorId)).rejects.toThrow(/motivo/);
    await tramiteSuelto({ tipo: "modificar", etapa: "aceptacion", documentoId });
    await expect(deshacerCarga(documentoId, "Motivo de prueba.", actorId)).rejects.toThrow("Este documento tiene un trámite abierto");
    const [v] = await sql`SELECT estado FROM documento_versiones WHERE id = ${versionId}`;
    expect(v.estado).toBe("vigente");
  });

  it("no acepta un número por debajo de las versiones ya publicadas", async () => {
    const { documentoId, versionId } = await registrado("ZZ-CD-13", 2);
    await sql`UPDATE documento_versiones SET estado = 'obsoleto' WHERE id = ${versionId}`; // como lo dejaría una base de sgc-suaza
    await expect(crearVersionBorrador(documentoId, actorId, 2)).rejects.toThrow(/3 o mayor/);
    await expect(crearVersionBorrador(documentoId, actorId, 1000)).rejects.toThrow(/de 1 a 999/);
    expect(await crearVersionBorrador(documentoId, actorId)).toMatchObject({ numero: 3 });
  });

  it("un borrador heredado sobre un documento vigente no se publica: se descarta", async () => {
    const { documentoId } = await registrado("ZZ-CD-03");
    const heredado = await borradorHeredado(documentoId, 2);
    await expect(publicarVersion(heredado, actorId)).rejects.toThrow(/se pide por trámite/);
    await descartarBorrador(heredado, actorId);
    const [v] = await sql`SELECT estado FROM documento_versiones WHERE id = ${heredado}`;
    expect(v.estado).toBe("descartado");
    const [aud] = await auditoriaDe("descartar_borrador", heredado);
    expect(aud.detalle).toMatchObject({ documentoId, numero: 2 });
  });

  it("descartar solo vale para un borrador que no está en un trámite abierto", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-14"), actorId);
    await tramiteSuelto({ tipo: "crear", etapa: "elaboracion", documentoId, versionId });
    await expect(descartarBorrador(versionId, actorId)).rejects.toThrow(/en un trámite/);
    const vigente = await registrado("ZZ-CD-15");
    await expect(descartarBorrador(vigente.versionId, actorId)).rejects.toThrow(/en borrador/);
  });
});

describe("cerrar la carga", () => {
  it("con la carga cerrada el camino directo no hace nada, salvo descartar", async () => {
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'ZZ-CD-01'`;
    const sinVigente = await crearDocumento(base("ZZ-CD-16"), actorId);
    await prepararBorrador(sinVigente.versionId);
    const deshecho = await registrado("ZZ-CD-17");
    await deshacerCarga(deshecho.documentoId, "Número equivocado.", actorId);
    await conCargaCerrada(async () => {
      await expect(crearDocumento(base("ZZ-CD-04"), actorId)).rejects.toThrow(/carga .* está cerrada/);
      await expect(deshacerCarga(doc.id, "Motivo de prueba.", actorId)).rejects.toThrow(/carga .* está cerrada/);
      await expect(publicarVersion(sinVigente.versionId, actorId)).rejects.toThrow(/carga .* está cerrada/);
      await expect(crearVersionBorrador(deshecho.documentoId, actorId)).rejects.toThrow(/carga .* está cerrada/);
      await descartarBorrador(sinVigente.versionId, actorId); // R24: si no, el documento quedaría sin salida
    });
    const [v] = await sql`SELECT estado FROM documento_versiones WHERE id = ${sinVigente.versionId}`;
    expect(v.estado).toBe("descartado");
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM documentos WHERE codigo = 'ZZ-CD-04'`;
    expect(n).toBe(0);
  });
});

describe("ningún camino directo revive lo que un trámite cerró", () => {
  it("un documento eliminado no vuelve", async () => {
    const { documentoId } = await registrado("ZZ-CD-20");
    const heredado = await borradorHeredado(documentoId, 2);
    await sql.begin((tx) => anularVigenteEn(tx, documentoId, actorId));
    await expect(publicarVersion(heredado, actorId)).rejects.toThrow("Este documento fue eliminado: su código no se reutiliza");
    await descartarBorrador(heredado, actorId);
    await expect(crearVersionBorrador(documentoId, actorId)).rejects.toThrow("Este documento fue eliminado: su código no se reutiliza");
  });

  it("una creación cancelada no se reactiva desde el panel", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-21"), actorId);
    await sql`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${versionId}`;
    await tramiteSuelto({ tipo: "crear", etapa: "cancelado", documentoId, versionId });
    await expect(crearVersionBorrador(documentoId, actorId)).rejects.toThrow("Esta creación se canceló: pida un trámite nuevo");
    const heredado = await borradorHeredado(documentoId, 1);
    await expect(publicarVersion(heredado, actorId)).rejects.toThrow("Esta creación se canceló: pida un trámite nuevo");
  });

  it("una carga deshecha también deja solo versiones descartadas, y sí se registra de nuevo", async () => {
    const { documentoId } = await registrado("ZZ-CD-22");
    await deshacerCarga(documentoId, "Unos nombres mal escritos.", actorId);
    expect(await crearVersionBorrador(documentoId, actorId)).toMatchObject({ numero: 1 });
  });

  it("un documento con un trámite abierto no admite una versión nueva", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-23"), actorId);
    await sql`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${versionId}`;
    await tramiteSuelto({ tipo: "crear", etapa: "elaboracion", documentoId });
    await expect(crearVersionBorrador(documentoId, actorId)).rejects.toThrow("Este documento tiene un trámite abierto");
  });

  it("publicarVersion rechaza la versión de un trámite abierto", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-24"), actorId);
    await prepararBorrador(versionId);
    await tramiteSuelto({ tipo: "crear", etapa: "aprobacion", documentoId, versionId });
    await expect(publicarVersion(versionId, actorId)).rejects.toThrow("Este documento tiene un trámite abierto");
    const [v] = await sql`SELECT estado FROM documento_versiones WHERE id = ${versionId}`;
    expect(v.estado).toBe("borrador");
  });

  it("publicarVersion rechaza la versión de un trámite cerrado", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-25"), actorId);
    await prepararBorrador(versionId);
    await tramiteSuelto({ tipo: "modificar", etapa: "rechazado", documentoId, versionId });
    await expect(publicarVersion(versionId, actorId)).rejects.toThrow(/es de un trámite/);
  });

  it("exigirDocumentoRegistrable lee lo que hay dentro de la transacción", () => revertida(sql, async (tx) => {
    const [t] = await tx`SELECT id FROM tipos_documento WHERE activo LIMIT 1`;
    const [d] = await tx`INSERT INTO documentos (codigo, titulo, tipo_id) VALUES ('ZZ-CD-26', 'Registrable', ${t.id}) RETURNING id`;
    await tx`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${d.id}, 1, 'descartado')`;
    await expect(tx.savepoint((s) => exigirDocumentoRegistrable(s, d.id))).resolves.toBeUndefined();
    await expect(tx.savepoint((s) => exigirDocumentoRegistrable(s, 0))).rejects.toThrow("El documento no existe");
  }));
});

describe("datos de control y de catálogo", () => {
  it("el título es dato de control; la descripción, los relacionados y el nivel de acceso son de catálogo", async () => {
    const { documentoId, versionId } = await registrado("ZZ-CD-05");
    await editarControl(documentoId, { codigo: "ZZ-CD-05", titulo: "Título corregido", tipoId }, actorId); // cargado fuera y carga abierta
    await sql`UPDATE documento_versiones SET origen_aprobacion = 'plataforma' WHERE id = ${versionId}`;
    await expect(editarControl(documentoId, { codigo: "ZZ-CD-05", titulo: "Otro título", tipoId }, actorId)).rejects.toThrow(/se cambia con un trámite/);
    const [rel] = await sql`SELECT id FROM documentos WHERE codigo = 'SGC-FO-01'`;
    await editarCatalogo(
      documentoId,
      { descripcion: "Descripción nueva", palabrasClave: null, asociaciones: asociacionesDe(), relacionados: [rel.id], nivelAcceso: "restringido" },
      actorId,
    );
    const [d] = await sql`SELECT nivel_acceso, descripcion FROM documentos WHERE id = ${documentoId}`;
    expect(d).toMatchObject({ nivel_acceso: "restringido", descripcion: "Descripción nueva" });
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM documento_relaciones WHERE documento_id = ${documentoId}`;
    expect(n).toBe(1);
    await expect(deshacerCarga(documentoId, "No aplica.", actorId)).rejects.toThrow(/fuera de la plataforma/);
  });

  it("con la carga cerrada tampoco se corrige el título de lo cargado", async () => {
    const { documentoId } = await registrado("ZZ-CD-30");
    await conCargaCerrada(async () => {
      await expect(editarControl(documentoId, { codigo: "ZZ-CD-30", titulo: "Título corregido", tipoId }, actorId)).rejects.toThrow(/se cambia con un trámite/);
    });
  });

  it("el código y el tipo solo cambian sin versión publicada; una descartada no cuenta", async () => {
    const { documentoId, versionId } = await registrado("ZZ-CD-31");
    const titulo = "Documento ZZ-CD-31";
    await expect(editarControl(documentoId, { codigo: "ZZ-CD-32", titulo, tipoId }, actorId)).rejects.toThrow(/no cambian/);
    await expect(editarControl(documentoId, { codigo: "ZZ-CD-31", titulo, tipoId: otroTipoId }, actorId)).rejects.toThrow(/no cambian/);
    await sql`UPDATE documento_versiones SET estado = 'obsoleto' WHERE id = ${versionId}`;
    await expect(editarControl(documentoId, { codigo: "ZZ-CD-32", titulo, tipoId }, actorId)).rejects.toThrow(/no cambian/);
    await expect(editarControl(documentoId, { codigo: "ZZ-CD-31", titulo: "Otro", tipoId }, actorId)).rejects.toThrow(/se cambia con un trámite/);
    await sql`UPDATE documento_versiones SET estado = 'descartado' WHERE id = ${versionId}`;
    await editarControl(documentoId, { codigo: "ZZ-CD-31", titulo, tipoId: otroTipoId }, actorId);
    const [d] = await sql`SELECT tipo_id FROM documentos WHERE id = ${documentoId}`;
    expect(d.tipo_id).toBe(otroTipoId);
  });

  it("un documento con trámite abierto no admite editarControl", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-33"), actorId);
    await tramiteSuelto({ tipo: "crear", etapa: "elaboracion", documentoId, versionId });
    await expect(editarControl(documentoId, { codigo: "ZZ-CD-33", titulo: "Otro título", tipoId }, actorId)).rejects.toThrow(/trámite abierto/);
  });

  it("editarControl valida el formato y el código repetido, y solo audita lo que cambió", async () => {
    const { documentoId } = await crearDocumento(base("ZZ-CD-34"), actorId);
    const titulo = "Documento ZZ-CD-34";
    await expect(editarControl(documentoId, { codigo: "basura", titulo, tipoId }, actorId)).rejects.toThrow(/no cumple el formato/);
    await expect(editarControl(documentoId, { codigo: "ZZ-CD-01", titulo, tipoId }, actorId)).rejects.toThrow(/ya existe/);
    await editarControl(documentoId, { codigo: "ZZ-CD-34", titulo, tipoId }, actorId);
    expect(await auditoriaDe("editar_control", documentoId)).toEqual([]);
    await editarControl(documentoId, { codigo: "ZZ-CD-34", titulo: "Título nuevo", tipoId }, actorId);
    const [aud] = await auditoriaDe("editar_control", documentoId);
    expect(aud.detalle).toMatchObject({ antes: { titulo }, despues: { titulo: "Título nuevo" } });
    expect(aud.detalle.antes).not.toHaveProperty("codigo");
  });

  it("el propietario no cambia si ya hubo una versión publicada", async () => {
    const { documentoId } = await registrado("ZZ-CD-35");
    const datos = { descripcion: null, palabrasClave: null, relacionados: [], nivelAcceso: "general" as const };
    await expect(editarCatalogo(documentoId, { ...datos, asociaciones: asociacionesDe(otroProcesoId) }, actorId)).rejects.toThrow(
      "El proceso propietario no cambia: es parte del código",
    );
    await editarCatalogo(
      documentoId,
      { ...datos, asociaciones: [...asociacionesDe(), { procesoId: otroProcesoId, esPrincipal: false }] },
      actorId,
    );
    const filas = await sql`SELECT proceso_id, es_principal FROM documento_proceso WHERE documento_id = ${documentoId} ORDER BY es_principal DESC`;
    expect(filas).toEqual([
      { proceso_id: procesoId, es_principal: true },
      { proceso_id: otroProcesoId, es_principal: false },
    ]);
  });

  it("sin versión publicada el propietario cambia, salvo con un trámite abierto (§8.6)", async () => {
    const datos = { descripcion: null, palabrasClave: null, relacionados: [], nivelAcceso: "general" as const };
    const libre = await crearDocumento(base("ZZ-CD-36"), actorId);
    await editarCatalogo(libre.documentoId, { ...datos, asociaciones: asociacionesDe(otroProcesoId) }, actorId);
    const [p] = await sql`SELECT proceso_id FROM documento_proceso WHERE documento_id = ${libre.documentoId} AND es_principal`;
    expect(p.proceso_id).toBe(otroProcesoId);

    const enTramite = await crearDocumento(base("ZZ-CD-37"), actorId);
    await tramiteSuelto({ tipo: "crear", etapa: "elaboracion", documentoId: enTramite.documentoId, versionId: enTramite.versionId });
    await expect(editarCatalogo(enTramite.documentoId, { ...datos, asociaciones: asociacionesDe(otroProcesoId) }, actorId)).rejects.toThrow(/desde el trámite/);
    await editarCatalogo(enTramite.documentoId, { ...datos, descripcion: "Con trámite abierto", asociaciones: asociacionesDe() }, actorId);
    const [d] = await sql`SELECT descripcion FROM documentos WHERE id = ${enTramite.documentoId}`;
    expect(d.descripcion).toBe("Con trámite abierto");
  });

  it("editarCatalogo audita el antes y el después de lo que cambió, y nada si no cambió nada", async () => {
    const { documentoId } = await crearDocumento(base("ZZ-CD-38"), actorId);
    const [rel] = await sql`SELECT id FROM documentos WHERE codigo = 'SGC-FO-01'`;
    const datos = { descripcion: null, palabrasClave: null, asociaciones: asociacionesDe(), relacionados: [], nivelAcceso: "general" as const };
    await editarCatalogo(documentoId, datos, actorId);
    expect(await auditoriaDe("editar_documento", documentoId)).toEqual([]);
    await editarCatalogo(documentoId, { ...datos, palabrasClave: "uno, dos", relacionados: [rel.id] }, actorId);
    const [aud] = await auditoriaDe("editar_documento", documentoId);
    expect(aud.detalle).toMatchObject({
      antes: { palabrasClave: null, relacionados: [] },
      despues: { palabrasClave: "uno, dos", relacionados: ["SGC-FO-01"] },
    });
    expect(Object.keys(aud.detalle.despues).sort()).toEqual(["palabrasClave", "relacionados"]);
  });
});

describe("un código abandonado no se reutiliza desde el panel", () => {
  it("el código que dejó editarControl no lo usa otro documento, y sí quien lo dejó", async () => {
    const dejado = codigoUnico();
    const nuevo = codigoUnico();
    const { documentoId } = await crearDocumento(base(dejado), actorId);
    await editarControl(documentoId, { codigo: nuevo, titulo: `Documento ${dejado}`, tipoId }, actorId);
    const [aud] = await auditoriaDe("editar_control", documentoId);
    expect(aud.detalle).toMatchObject({ antes: { codigo: dejado }, despues: { codigo: nuevo } });

    expect(await todosLosCodigos()).toContain(dejado);
    expect(await codigoAbandonado(dejado, null)).toBe(true);
    await expect(crearDocumento(base(dejado), actorId)).rejects.toThrow(/ya existe/);
    const otroCodigo = codigoUnico();
    const otro = await crearDocumento(base(otroCodigo), actorId);
    await expect(editarControl(otro.documentoId, { codigo: dejado, titulo: `Documento ${otroCodigo}`, tipoId }, actorId)).rejects.toThrow(/ya existe/);

    await editarControl(documentoId, { codigo: dejado, titulo: `Documento ${dejado}`, tipoId }, actorId);
    const [d] = await sql`SELECT codigo FROM documentos WHERE id = ${documentoId}`;
    expect(d.codigo).toBe(dejado);
  });

  it("desde el panel cuenta lo que dejó cualquier trámite", () => revertida(sql, async (tx) => {
    const [{ id }] = await tx`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, etapa)
      VALUES ('SOL-1998-1', 1998, 1, 'crear', 'mejora', 'Prueba del camino directo.', ${actorId}, ${procesoId}, 'elaboracion') RETURNING id`;
    await tx`INSERT INTO tramite_eventos (tramite_id, tipo, usuario_id, ronda, detalle)
      VALUES (${id}, 'corregir_datos', ${actorId}, 1, ${tx.json({ antes: { codigo: "ZZ-CD-40" }, despues: { codigo: "ZZ-CD-41" } })})`;
    expect(await codigoAbandonado("ZZ-CD-40", null, { sql: tx })).toBe(true);
    expect(await codigoAbandonado("ZZ-CD-40", Number(id), { sql: tx })).toBe(false);
    expect(await codigoAbandonado("ZZ-CD-40", Number(id) + 1, { sql: tx })).toBe(true);
    expect(await codigoAbandonado("ZZ-CD-42", null, { sql: tx })).toBe(false);
  }));
});

describe("el panel y lo descartado", () => {
  it("un documento con solo versiones descartadas no cuenta como publicado ni como activo", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-50"), actorId);
    await descartarBorrador(versionId, actorId);
    const admin = await sesionDe(sql, ACTOR);
    const documento = await obtenerDocumentoAdmin("ZZ-CD-50", admin);
    expect(documento?.situacion).toMatchObject({ publicado: false, creacionCancelada: false, tramiteAbierto: null });
    const fila = (await listarDocumentosAdmin(admin)).find((d) => d.id === documentoId);
    expect(fila).toMatchObject({ versionVigente: null, versionBorrador: null, anulado: false, descartado: true });

    await tramiteSuelto({ tipo: "crear", etapa: "cancelado", documentoId, versionId });
    expect((await obtenerDocumentoAdmin("ZZ-CD-50", admin))?.situacion.creacionCancelada).toBe(true);
  });

  it("el detalle dice el origen de cada versión publicada, y no el de un borrador", async () => {
    const { documentoId } = await registrado("ZZ-CD-51", 2);
    await borradorHeredado(documentoId, 3);
    const admin = await sesionDe(sql, ACTOR);
    const documento = await obtenerDocumentoAdmin("ZZ-CD-51", admin);
    expect(documento?.versiones.map((v) => [v.numero, v.origenAprobacion])).toEqual([[3, null], [2, "fuera"]]);
    expect(documento?.situacion).toMatchObject({ publicado: true, origenVigente: "fuera" });
  });

  it("las fechas de la versión llegan como las pide un <input type=date>", async () => {
    await registrado("ZZ-CD-52");
    const documento = await obtenerDocumentoAdmin("ZZ-CD-52", await sesionDe(sql, ACTOR));
    expect(documento?.versiones[0].fechaAprobacion).toBe("2026-01-01");
    expect(documento?.versiones[0].fechaElaboracion).toBeNull();
  });
});

describe("registrarArchivo y el candado de la versión", () => {
  const anexo = (versionId: number, sufijo: string) => ({
    versionId,
    rol: "anexo",
    ruta: `pruebas/anexo-${sufijo}.pdf`,
    nombreOriginal: "anexo.pdf",
    extension: "pdf",
    mime: "application/pdf",
    tamanoBytes: 100,
    hashSha256: `hash-anexo-${sufijo}`,
  });

  it("no entra un archivo en una versión que ya no es borrador", async () => {
    const { versionId } = await registrado("ZZ-CD-60");
    await expect(registrarArchivo(anexo(versionId, "vigente"), actorId)).rejects.toThrow(/versión en borrador/);
  });

  it("el anexo que esperaba el candado no entra en la versión que se acaba de publicar", async () => {
    const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-61"), actorId);
    await prepararBorrador(versionId);
    let soltar = () => {};
    const espera = new Promise<void>((r) => { soltar = r; });
    let avisarCandado = () => {};
    const conCandado = new Promise<void>((r) => { avisarCandado = r; });
    const publicacion = sql.begin(async (tx) => {
      await tx`SELECT 1 FROM documento_versiones WHERE id = ${versionId} FOR UPDATE`;
      avisarCandado();
      await espera;
      await tx`UPDATE documento_versiones SET estado = 'vigente' WHERE id = ${versionId}`;
    });
    await conCandado;
    let subida: Promise<unknown> = Promise.resolve();
    try {
      subida = registrarArchivo(anexo(versionId, "carrera"), actorId);
      await new Promise((r) => setTimeout(r, 150)); // que la subida llegue a esperar el candado
    } finally {
      soltar();
    }
    await publicacion;
    await expect(subida).rejects.toThrow(/versión en borrador/);
    const archivos = await sql`SELECT rol FROM archivos a JOIN documento_versiones v ON v.id = a.version_id WHERE v.documento_id = ${documentoId}`;
    expect(archivos).toEqual([{ rol: "principal" }]);
  });
});
