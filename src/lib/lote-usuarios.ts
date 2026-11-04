import type { DatosUsuario, ResultadoLote } from "@/db/consultas/usuarios";
import { neutralizarFormula } from "@/lib/celdas";
import { EsquemaUsuario } from "@/lib/esquemas/usuarios";
import { ETIQUETA_ROL, ROLES, type Rol } from "@/lib/roles";
import "@/lib/validacion"; // configura los mensajes de zod en español

export const COLUMNAS_LOTE = ["usuario", "nombre", "correo", "rol", "cargo", "procesos"] as const;
export const MAXIMO_FILAS_LOTE = 500;

/** Claves normalizadas: cargo en minúsculas sin acentos ni espacios dobles; sigla en mayúsculas. */
export type Catalogo = { cargos: Map<string, number>; procesos: Map<string, number> };
export type FilaLoteValida = { linea: number; datos: DatosUsuario };
export type FilaLoteInvalida = { linea: number; usuario: string; error: string };

const BOM = "﻿";

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function plantillaCsv(): string {
  return (
    BOM +
    COLUMNAS_LOTE.join(";") +
    "\r\n" +
    ["ana.perez", "Ana Pérez", "ana.perez@ejemplo.gov.co", "Líder de proceso", "Enfermera Jefe", "GTH|CEX"]
      .map(campoCsv)
      .join(";") +
    "\r\n"
  );
}

function campoCsv(valor: string | number): string {
  const t = neutralizarFormula(String(valor));
  return /[;,"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function resultadosCsv(resultado: ResultadoLote): string {
  const filas = [
    ...resultado.creados.map((c) => [c.linea, c.usuario, c.nombre, "creado", c.claveTemporal]),
    ...resultado.fallidos.map((f) => [f.linea, f.usuario, "", "error", f.error]),
  ].sort((a, b) => Number(a[0]) - Number(b[0]));
  return (
    BOM +
    ["linea", "usuario", "nombre", "estado", "clave_temporal_o_error"].join(";") +
    "\r\n" +
    filas.map((f) => f.map(campoCsv).join(";")).join("\r\n") +
    (filas.length ? "\r\n" : "")
  );
}

/** Registros con su línea de inicio; respeta comillas dobles (con "" como escape) y saltos dentro de ellas. */
function dividirRegistros(texto: string, separador: string): Array<{ linea: number; campos: string[] }> {
  const registros: Array<{ linea: number; campos: string[] }> = [];
  let campos: string[] = [];
  let campo = "";
  let entreComillas = false;
  let linea = 1;
  let inicio = 1;
  const cerrarRegistro = () => {
    campos.push(campo);
    registros.push({ linea: inicio, campos });
    campos = [];
    campo = "";
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreComillas = false;
      } else {
        if (c === "\n") linea++;
        campo += c;
      }
    } else if (c === '"' && campo === "") {
      entreComillas = true;
    } else if (c === separador) {
      campos.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      cerrarRegistro();
      linea++;
      inicio = linea;
    } else campo += c;
  }
  if (campo !== "" || campos.length > 0) cerrarRegistro();
  return registros;
}

function mensajeDeZod(issue: { path: PropertyKey[]; message: string; code: string }): string {
  const etiqueta: Record<string, string> = { nombre: "Nombre", correo: "Correo" };
  const prefijo = issue.code === "custom" ? undefined : etiqueta[String(issue.path[0])];
  return prefijo ? `${prefijo}: ${issue.message}` : issue.message;
}

function rolDe(valor: string): Rol | null {
  const n = normalizar(valor);
  return ROLES.find((r) => r === n || normalizar(ETIQUETA_ROL[r]) === n) ?? null;
}

export function parsearLoteCsv(
  texto: string,
  catalogo: Catalogo,
): { validas: FilaLoteValida[]; invalidas: FilaLoteInvalida[] } {
  const limpio = texto.startsWith(BOM) ? texto.slice(1) : texto;
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] ?? "";
  const separador = primeraLinea.includes(";") || !primeraLinea.includes(",") ? ";" : ",";
  const registros = dividirRegistros(limpio, separador).filter(
    (r) => r.campos.some((c) => c.trim() !== ""),
  );

  const cabecera = registros.shift();
  const nombres = cabecera?.campos.map((c) => normalizar(c)) ?? [];
  const posicion = COLUMNAS_LOTE.map((c) => nombres.indexOf(c));
  if (posicion.some((p) => p < 0)) {
    throw new Error(`La cabecera debe incluir las columnas: ${COLUMNAS_LOTE.join(", ")}`);
  }
  if (registros.length > MAXIMO_FILAS_LOTE) {
    throw new Error(`El archivo supera las ${MAXIMO_FILAS_LOTE} filas`);
  }

  const validas: FilaLoteValida[] = [];
  const invalidas: FilaLoteInvalida[] = [];
  const vistos = new Map<string, number>();

  for (const { linea, campos } of registros) {
    const celda = (k: number) => (campos[posicion[k]] ?? "").trim();
    const [usuario, nombre, correo, rolTexto, cargoTexto, procesosTexto] = COLUMNAS_LOTE.map((_, k) => celda(k));
    const rechazar = (error: string) => invalidas.push({ linea, usuario, error });

    if (campos.length > nombres.length) {
      rechazar("La fila tiene más columnas que la cabecera");
      continue;
    }
    const previa = vistos.get(usuario.toLowerCase());
    if (usuario && previa !== undefined) {
      rechazar(`Usuario repetido en el archivo (ya aparece en la línea ${previa})`);
      continue;
    }
    if (usuario) vistos.set(usuario.toLowerCase(), linea);

    const rol = rolDe(rolTexto);
    if (!rol) {
      rechazar(`Rol desconocido «${rolTexto}»`);
      continue;
    }
    let cargoId: number | null = null;
    if (cargoTexto) {
      const id = catalogo.cargos.get(normalizar(cargoTexto));
      if (id === undefined) {
        rechazar(`Cargo inexistente «${cargoTexto}»`);
        continue;
      }
      cargoId = id;
    }
    const procesoIds: number[] = [];
    let siglaMala: string | null = null;
    for (const sigla of procesosTexto.split("|").map((s) => s.trim()).filter(Boolean)) {
      const id = catalogo.procesos.get(sigla.toUpperCase());
      if (id === undefined) siglaMala ??= sigla;
      else procesoIds.push(id);
    }
    if (siglaMala) {
      rechazar(`Proceso inexistente «${siglaMala}»`);
      continue;
    }

    const r = EsquemaUsuario.safeParse({
      usuario, nombre, correo, rol, cargoId, jefeInmediatoId: null, procesoIds, verHistorial: false,
    });
    if (!r.success) {
      rechazar(mensajeDeZod(r.error.issues[0]));
      continue;
    }
    validas.push({ linea, datos: r.data });
  }
  return { validas, invalidas };
}
