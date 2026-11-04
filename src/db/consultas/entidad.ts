import { cache } from "react";
import { hexValido, normalizarHex } from "../../lib/color";
import { MARCA_DEFECTO, validarMarca, type Marca } from "../../lib/marca";
import { obtenerSql } from "../cliente";
import { registrarAuditoria } from "./admin";

export const CLAVES_ENTIDAD = [
  "nombre_entidad",
  "sigla_entidad",
  "lema",
  "aviso_datos_personales",
  "color_primario",
  "color_secundario",
  "logo_ruta",
  "logo_mime",
  "logo_version",
] as const;

async function leerClaves(): Promise<Record<string, string>> {
  const sql = obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion
    WHERE clave IN ${sql([...CLAVES_ENTIDAD])}`;
  return Object.fromEntries(filas.map((f) => [f.clave as string, f.valor as string]));
}

const texto = (v: string | undefined, defecto: string) => (v && v.trim() ? v : defecto);
const color = (v: string | undefined, defecto: string) =>
  v && hexValido(v.trim()) ? normalizarHex(v.trim()) : defecto;

export const obtenerMarca: () => Promise<Marca> = cache(async () => {
  const c = await leerClaves();
  const logo =
    c.logo_ruta && c.logo_mime && c.logo_version
      ? { version: c.logo_version, mime: c.logo_mime }
      : null;
  return {
    nombre: texto(c.nombre_entidad, MARCA_DEFECTO.nombre),
    sigla: texto(c.sigla_entidad, MARCA_DEFECTO.sigla),
    lema: texto(c.lema, MARCA_DEFECTO.lema),
    primario: color(c.color_primario, MARCA_DEFECTO.primario),
    secundario: color(c.color_secundario, MARCA_DEFECTO.secundario),
    logo,
  };
});

export type DatosEntidad = {
  nombre: string;
  sigla: string;
  lema: string;
  avisoDatosPersonales: string;
  primario: string;
  secundario: string;
};

export async function obtenerEntidad(): Promise<DatosEntidad> {
  const c = await leerClaves();
  return {
    nombre: texto(c.nombre_entidad, MARCA_DEFECTO.nombre),
    sigla: texto(c.sigla_entidad, MARCA_DEFECTO.sigla),
    lema: c.lema ?? "",
    avisoDatosPersonales: c.aviso_datos_personales ?? "",
    primario: color(c.color_primario, MARCA_DEFECTO.primario),
    secundario: color(c.color_secundario, MARCA_DEFECTO.secundario),
  };
}

export async function guardarEntidad(datos: DatosEntidad, actorId: number): Promise<void> {
  if (!hexValido(datos.primario) || !hexValido(datos.secundario)) throw new Error("Color inválido");
  const errores = validarMarca({ primario: datos.primario, secundario: datos.secundario });
  if (errores.length > 0) throw new Error(errores[0].mensaje);
  const valores: Record<string, string> = {
    nombre_entidad: datos.nombre,
    sigla_entidad: datos.sigla,
    lema: datos.lema,
    aviso_datos_personales: datos.avisoDatosPersonales,
    color_primario: normalizarHex(datos.primario),
    color_secundario: normalizarHex(datos.secundario),
  };
  const sql = obtenerSql();
  await sql.begin(async (tx) => {
    for (const [clave, valor] of Object.entries(valores)) {
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    }
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: "editar_configuracion",
      entidad: "configuracion",
      entidadId: null,
      detalle: { claves: Object.keys(valores) },
    });
  });
}

export type LogoGuardado = {
  ruta: string;
  mime: string;
  version: string;
  nombre: string;
  bytes: number;
  ancho: number;
  alto: number;
};

export async function guardarLogo(
  logo: LogoGuardado,
  actorId: number,
): Promise<{ rutaAnterior: string | null }> {
  const sql = obtenerSql();
  return sql.begin(async (tx) => {
    const [previo] = await tx`SELECT valor FROM configuracion WHERE clave = 'logo_ruta' FOR UPDATE`;
    const nuevas = { logo_ruta: logo.ruta, logo_mime: logo.mime, logo_version: logo.version };
    for (const [clave, valor] of Object.entries(nuevas)) {
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    }
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: "subir_logo",
      entidad: "configuracion",
      entidadId: null,
      detalle: { nombre: logo.nombre, bytes: logo.bytes, mime: logo.mime, ancho: logo.ancho, alto: logo.alto },
    });
    const anterior = previo ? (previo.valor as string) : null;
    return { rutaAnterior: anterior && anterior !== logo.ruta ? anterior : null };
  });
}

export async function quitarLogo(actorId: number): Promise<{ rutaAnterior: string | null }> {
  const sql = obtenerSql();
  return sql.begin(async (tx) => {
    const [previo] = await tx`SELECT valor FROM configuracion WHERE clave = 'logo_ruta' FOR UPDATE`;
    await tx`DELETE FROM configuracion WHERE clave IN ('logo_ruta', 'logo_mime', 'logo_version')`;
    await registrarAuditoria(tx, {
      usuarioId: actorId,
      accion: "quitar_logo",
      entidad: "configuracion",
      entidadId: null,
      detalle: {},
    });
    return { rutaAnterior: previo ? (previo.valor as string) : null };
  });
}
