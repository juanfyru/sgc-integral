/**
 * El informe de la revisión anual de documentos (spec 13C §9.5, maqueta 6). `DatosInforme` es todo lo que el PDF
 * imprime: se congela al cerrar la revisión en `revisiones_anuales.informe` (jsonb) y de ahí se regenera, años
 * después, sin consultar nada más. `generarInformeAnual` lo dibuja con el mismo mecanismo del acta (`pdf-hoja.ts`): el
 * membrete bajo cada hoja respetando el espacio de su encabezado y de su pie, la tabla que sigue en otra hoja con su
 * cabecera, la transliteración y el aviso de «?». Con los mismos datos da los mismos bytes: la fecha del documento es la
 * del cierre.
 */
import { PDFDocument } from "pdf-lib";
import {
  ANCHO_UTIL,
  Hoja,
  MARGEN,
  SUAVE,
  dia,
  diaYHora,
  dibujarPies,
  lineas,
  prepararHoja,
  textosDe,
  type FormatoActa,
} from "@/lib/pdf-hoja";
import { cuenta } from "@/lib/plural";
import { pierdeCaracteres, textoParaFuente } from "@/lib/texto-pdf";
import { DECISIONES, ETIQUETA_DECISION, type Decision } from "@/lib/vigencia/tipos";

export type DatosInforme = {
  entidad: string;
  anio: number;
  abiertaEn: Date;
  prorrogas: { fecha: Date; dias: number; motivo: string; por: string }[];
  cerradaEn: Date;
  cerradaPor: { nombre: string; cargo: string | null };
  metodo: string;
  alcance: { documentos: number; internos: number; externos: number; procesos: number };
  totales: Record<Decision, number>;
  decisiones: {
    codigo: string;
    titulo: string;
    version: number;
    proceso: string;
    decision: Decision;
    responsable: string | null;
    solicitud: { numero: string; venceEn: Date | null; estadoAlCierre: string } | null;
    fecha: Date | null;
    /** Solo en un externo: «Edición adoptada», «Pendiente de adoptar» o «Retirado». */
    estadoExterno?: string;
  }[];
  normograma: {
    cambios: { norma: string; estado: string; fecha: Date; documentos: number; resueltos: number; noAfecta: number }[];
    porProceso: { proceso: string; resultado: string | null; nota: string | null }[];
  };
  otros: { acusesPct: number | null; conformidadPct: number | null; externosAlDia: { alDia: number; total: number } };
  formato: FormatoActa | null;
  zona: string;
  ejemplo?: boolean;
  /**
   * El id de la revisión, que el pie imprime en lugar de la huella (el PDF no puede llevar la suya). No se congela: lo
   * pone `asegurarInforme` desde la fila; el ejemplo no lo tiene.
   */
  revisionId?: number;
};

/** Cómo dice cada decisión la tabla de cifras: en plural, porque cuenta documentos. */
const CIFRA: Record<Decision, string> = {
  ratificar: "Ratificados",
  reciente: "Revisados recientemente",
  actualizar: "Por actualizar",
  eliminar: "Por eliminar",
  en_tramite: "En trámite",
  sin_revisar: "Sin revisar",
};

/** El orden de la tabla de cifras: lo revisado primero, lo que quedó sin revisar al final. */
const ORDEN_CIFRAS: Decision[] = ["ratificar", "reciente", "actualizar", "eliminar", "en_tramite", "sin_revisar"];

const METODO: Record<string, string> = { clave: "Con su clave", clave_totp: "Con su clave y el segundo factor" };

const AVISO_CARACTERES =
  "Algunos caracteres no se pudieron imprimir y se muestran como «?». El texto íntegro consta en la revisión anual, en el sistema.";

const TAMANO_TABLA = 8.5;
const PASO_TABLA = 10.5;
/** Lo que una celda deja libre a su derecha, para que dos columnas no se toquen. */
const HUECO = 6;

type Columna = { titulo: string; ancho: number; derecha?: boolean };

/** La tabla de decisiones (maqueta 6): suma el ancho útil de la hoja. */
const COLUMNAS_DECISIONES: Columna[] = [
  { titulo: "Documento", ancho: 96 },
  { titulo: "Decisión", ancho: 88 },
  { titulo: "Responsable", ancho: 116 },
  { titulo: "Solicitud y plazo", ancho: 98 },
  { titulo: "Estado al cierre", ancho: 118 },
];
const COLUMNAS_CIFRAS: Columna[] = [
  { titulo: "Decisión", ancho: 170 },
  { titulo: "Documentos", ancho: 70, derecha: true },
  { titulo: "Estado al cierre", ancho: 276 },
];
const COLUMNAS_CAMBIOS: Columna[] = [
  { titulo: "Norma", ancho: 190 },
  { titulo: "Estado", ancho: 80 },
  { titulo: "Fecha", ancho: 66 },
  { titulo: "Documentos afectados", ancho: 180 },
];
const COLUMNAS_NORMOGRAMA: Columna[] = [
  { titulo: "Proceso", ancho: 190 },
  { titulo: "Confirmación", ancho: 96 },
  { titulo: "Nota", ancho: 230 },
];

/** La hoja del informe: la común más las tablas, que siguen en otra hoja con su cabecera. */
class HojaInforme extends Hoja {
  /** Un párrafo a todo el ancho, en la letra del cuerpo. */
  parrafo(t: string) {
    const paso = 13;
    for (const l of lineas(t, this.f.normal, 9.5, ANCHO_UTIL)) {
      this.espacio(paso);
      this.texto(l, MARGEN, this.f.normal, 9.5);
      this.y -= paso;
    }
    this.y -= 4;
  }

  private lineasDe(columnas: Columna[], celdas: string[], negrita = false): string[][] {
    return celdas.map((c, i) => lineas(c, negrita ? this.f.negrita : this.f.normal, TAMANO_TABLA, columnas[i].ancho - HUECO));
  }

  /** Dibuja una línea de cada celda en la altura actual. */
  private renglon(columnas: Columna[], partes: string[], negrita: boolean) {
    const fuente = negrita ? this.f.negrita : this.f.normal;
    let x = MARGEN;
    partes.forEach((t, i) => {
      const { ancho, derecha } = columnas[i];
      const izquierda = derecha ? x + ancho - HUECO - fuente.widthOfTextAtSize(textoParaFuente(t, fuente), TAMANO_TABLA) : x;
      if (t) this.texto(t, izquierda, fuente, TAMANO_TABLA, negrita ? SUAVE : undefined);
      x += ancho;
    });
    this.y -= PASO_TABLA;
  }

  cabecera(columnas: Columna[]) {
    const ls = this.lineasDe(columnas, columnas.map((c) => c.titulo), true);
    const alto = Math.max(...ls.map((l) => l.length));
    for (let i = 0; i < alto; i++) this.renglon(columnas, ls.map((l) => l[i] ?? ""), true);
    this.y -= 2;
    this.regla();
    this.y -= 3;
  }

  /** Lo que ocupa la fila: sus líneas más el respiro de debajo. */
  altoDe(columnas: Columna[], celdas: string[]): number {
    return Math.max(...this.lineasDe(columnas, celdas).map((l) => l.length)) * PASO_TABLA + 3;
  }

  /** Si no caben `alto` puntos, sigue en otra hoja, con la cabecera de la tabla. */
  private seguir(columnas: Columna[], alto: number) {
    if (this.y - alto < this.g.abajo) {
      this.nueva();
      this.cabecera(columnas);
    }
  }

  /** Una fila: entera en la hoja si cabe; una más larga que una hoja vacía sigue, línea a línea, en la siguiente. */
  filaDeTabla(columnas: Columna[], celdas: string[]) {
    const ls = this.lineasDe(columnas, celdas);
    const alto = Math.max(...ls.map((l) => l.length));
    this.seguir(columnas, alto * PASO_TABLA + 3);
    for (let i = 0; i < alto; i++) {
      this.seguir(columnas, PASO_TABLA);
      this.renglon(columnas, ls.map((l) => l[i] ?? ""), false);
    }
    this.y -= 3;
  }

  /** El título de un grupo de filas (un proceso): nunca queda solo al pie de una hoja. */
  grupo(columnas: Columna[], titulo: string, primera: string[]) {
    this.seguir(columnas, PASO_TABLA + 2 + this.altoDe(columnas, primera));
    for (const l of lineas(titulo, this.f.negrita, TAMANO_TABLA, ANCHO_UTIL)) {
      this.texto(l, MARGEN, this.f.negrita, TAMANO_TABLA);
      this.y -= PASO_TABLA;
    }
    this.y -= 2;
  }

  /** Una tabla completa: su cabecera y sus filas. */
  tabla(columnas: Columna[], filas: string[][]) {
    this.espacio(PASO_TABLA * 3);
    this.cabecera(columnas);
    for (const f of filas) this.filaDeTabla(columnas, f);
  }

}

/** «Publicado (5) · En curso: Elaboración (2)»: los estados al cierre de unas decisiones, con cuántas tiene cada uno. */
function resumenDeEstados(decisiones: DatosInforme["decisiones"]): string {
  const conteo = new Map<string, number>();
  for (const d of decisiones) {
    const estado = d.solicitud?.estadoAlCierre ?? d.estadoExterno;
    if (estado) conteo.set(estado, (conteo.get(estado) ?? 0) + 1);
  }
  return [...conteo].map(([estado, n]) => `${estado} (${n})`).join(" · ");
}

/** Lo que la tabla de cifras dice al lado de cada decisión. */
function estadoDeCifra(decision: Decision, decisiones: DatosInforme["decisiones"]): string {
  const de = decisiones.filter((d) => d.decision === decision);
  if (decision === "sin_revisar") {
    const codigos = de.map((d) => d.codigo);
    return codigos.length <= 6 ? codigos.join(", ") : `${codigos.slice(0, 6).join(", ")} y ${codigos.length - 6} más`;
  }
  return resumenDeEstados(de);
}

function filaDeDecision(d: DatosInforme["decisiones"][number], zona: string): string[] {
  // Sin responsable y con fecha, la puso el sistema (al abrir o al publicar); sin fecha, quedó sin revisar.
  const quien = d.responsable ?? (d.fecha ? "Automática" : "—");
  const responsable = d.fecha ? `${quien}, ${dia(d.fecha, zona)}` : quien;
  const solicitud = d.solicitud
    ? `${d.solicitud.numero}${d.solicitud.venceEn ? `\nvence ${dia(d.solicitud.venceEn, zona)}` : ""}`
    : "—";
  return [`${d.codigo} v${d.version}`, ETIQUETA_DECISION[d.decision], responsable, solicitud, d.solicitud?.estadoAlCierre ?? d.estadoExterno ?? "—"];
}

export async function generarInformeAnual(d: DatosInforme, membrete: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { formato, geometria, fuentes: f } = await prepararHoja(doc, {
    formato: d.formato,
    membrete,
    ejemplo: d.ejemplo === true,
    quien: `Informe de la revisión anual ${d.anio}`,
  });
  const zona = d.zona;
  doc.setTitle(textoParaFuente(`Informe de revisión anual ${d.anio}`, f.normal));
  doc.setCreator("SGC Integral");
  doc.setProducer("SGC Integral");
  doc.setCreationDate(d.cerradaEn);
  doc.setModificationDate(d.cerradaEn);

  const h = new HojaInforme(doc, f, geometria);
  for (const l of lineas("INFORME DE REVISIÓN ANUAL DE DOCUMENTOS DEL SGC", f.negrita, 14, ANCHO_UTIL)) {
    h.texto(l, MARGEN, f.negrita, 14);
    h.y -= 19;
  }
  // Con el formato, el nombre de la entidad ya está en su encabezado.
  if (!formato) {
    for (const l of lineas(d.entidad, f.normal, 10.5, ANCHO_UTIL)) {
      h.texto(l, MARGEN, f.normal, 10.5, SUAVE);
      h.y -= 14;
    }
  }
  h.y -= 4;
  h.texto(`Revisión anual ${d.anio}`, MARGEN, f.negrita, 11);
  h.y -= 19;
  const quien = `${d.cerradaPor.nombre}${d.cerradaPor.cargo ? `, ${d.cerradaPor.cargo}` : ""}`;
  const { documentos, internos, externos, procesos } = d.alcance;
  h.parrafo(
    `Abierta el ${dia(d.abiertaEn, zona)} y cerrada el ${dia(d.cerradaEn, zona)} por ${quien}. Alcance: ${cuenta(documentos, "documento vigente", "documentos vigentes")} (${cuenta(internos, "interno", "internos")}, ${cuenta(externos, "externo", "externos")}) de ${cuenta(procesos, "proceso", "procesos")}.`,
  );
  for (const p of d.prorrogas) {
    h.fila("Prórroga", `${cuenta(p.dias, "día", "días")}, el ${dia(p.fecha, zona)}, por ${p.por}`);
    h.fila("Motivo", p.motivo);
  }

  h.titulo("Resultado");
  h.tabla(COLUMNAS_CIFRAS, [
    ...ORDEN_CIFRAS.map((decision) => [CIFRA[decision], String(d.totales[decision]), estadoDeCifra(decision, d.decisiones) || "—"]),
    ["Total", String(DECISIONES.reduce((s, x) => s + d.totales[x], 0)), ""],
  ]);

  h.titulo("Decisiones con responsable y fecha");
  h.espacio(PASO_TABLA * 3);
  h.cabecera(COLUMNAS_DECISIONES);
  let proceso: string | null = null;
  for (const x of d.decisiones) {
    const celdas = filaDeDecision(x, zona);
    if (x.proceso !== proceso) {
      proceso = x.proceso;
      h.grupo(COLUMNAS_DECISIONES, x.proceso, celdas);
    }
    h.filaDeTabla(COLUMNAS_DECISIONES, celdas);
  }

  h.titulo(`Cambios normativos de ${d.anio}`);
  if (d.normograma.cambios.length === 0) {
    h.parrafo(`No se registraron cambios normativos en ${d.anio}.`);
  } else {
    h.tabla(
      COLUMNAS_CAMBIOS,
      d.normograma.cambios.map((c) => [
        c.norma,
        c.estado,
        dia(c.fecha, zona),
        `${cuenta(c.documentos, "afectado", "afectados")} · ${cuenta(c.resueltos, "resuelto", "resueltos")} · ${c.noAfecta} «no afecta»`,
      ]),
    );
  }

  h.titulo("Normograma por proceso");
  if (d.normograma.porProceso.length === 0) {
    h.parrafo("Ningún proceso de la revisión tuvo documentos ni normograma por confirmar.");
  } else {
    h.tabla(COLUMNAS_NORMOGRAMA, d.normograma.porProceso.map((p) => [p.proceso, p.resultado ?? "Sin confirmar", p.nota ?? "—"]));
  }

  h.titulo("Otros insumos");
  h.fila(
    "Acuses de lectura",
    d.otros.acusesPct === null ? `Las versiones publicadas en ${d.anio} no pidieron acuses` : `${d.otros.acusesPct} % de las versiones publicadas en ${d.anio}`,
  );
  h.fila(
    "Puntos de uso",
    d.otros.conformidadPct === null
      ? `Sin verificaciones cerradas en ${d.anio}`
      : `${d.otros.conformidadPct} % de conformidad en las verificaciones de ${d.anio}`,
  );
  h.fila("Externos al día", `${d.otros.externosAlDia.alDia} de ${d.otros.externosAlDia.total}`);

  // Los saltos de línea y las tabulaciones no se pierden: `lineas` los resuelve antes de dibujar.
  if (textosDe(d).some((t) => pierdeCaracteres(t.replace(/\r?\n|\t/g, " "), f.normal))) h.nota(AVISO_CARACTERES);

  // El cierre va entero en una hoja: la firma no queda separada de quién firmó.
  h.espacio(130);
  h.titulo("Cierre");
  h.fila("Cerró y firmó", `${d.cerradaPor.nombre}${d.cerradaPor.cargo ? ` · ${d.cerradaPor.cargo}` : ""} · ${diaYHora(d.cerradaEn, zona)}`);
  h.fila("Método", METODO[d.metodo] ?? d.metodo);
  h.fila("Huella SHA-256", "Se calcula al registrar el archivo");
  h.fila(
    "Identificación",
    d.revisionId === undefined
      ? `Revisión anual ${d.anio}, cerrada el ${diaYHora(d.cerradaEn, zona)}`
      : `Revisión n.º ${d.revisionId}, cerrada el ${diaYHora(d.cerradaEn, zona)}`,
  );

  dibujarPies(doc, f, formato, "Firma electrónica con reingreso de clave (Ley 527 de 1999)", `Generado por SGC Integral el ${diaYHora(d.cerradaEn, zona)}`);
  return doc.save();
}

const EJEMPLO_PROCESOS = ["Proceso de ejemplo A", "Proceso de ejemplo B", "Proceso de ejemplo C", "Proceso de ejemplo D"];
const EJEMPLO_DECISIONES: Decision[] = ["ratificar", "ratificar", "actualizar", "reciente", "ratificar", "eliminar", "en_tramite", "ratificar", "actualizar", "sin_revisar"];
const EJEMPLO_ESTADOS = ["Publicado", "En curso: Elaboración", "Cancelado"];

/**
 * Un informe inventado, con texto para dos o tres hojas: lo que «Ver informe de ejemplo» de Configuración documental
 * dibuja sobre el formato elegido para comprobar los espacios. Nada de esto es un registro: lleva la marca «EJEMPLO, SIN
 * VALOR» en cada hoja.
 */
export function datosDeEjemplo(entidad: string, zona: string, formato: FormatoActa | null): DatosInforme {
  const decisiones: DatosInforme["decisiones"] = EJEMPLO_PROCESOS.flatMap((proceso, p) =>
    EJEMPLO_DECISIONES.map((decision, i) => {
      const n = p * EJEMPLO_DECISIONES.length + i + 1;
      const conSolicitud = decision === "actualizar" || decision === "eliminar" || decision === "en_tramite";
      return {
        codigo: `XX${String.fromCharCode(65 + p)}-PR-${String(i + 1).padStart(2, "0")}`,
        titulo: `Documento de ejemplo ${n}`,
        version: 1 + (i % 3),
        proceso,
        decision,
        responsable: decision === "sin_revisar" || decision === "reciente" || decision === "en_tramite" ? null : "Líder de ejemplo",
        solicitud: conSolicitud
          ? { numero: `SOL-0000-${String(n).padStart(3, "0")}`, venceEn: new Date("2026-12-15T15:00:00Z"), estadoAlCierre: EJEMPLO_ESTADOS[n % 3] }
          : null,
        fecha: decision === "sin_revisar" ? null : new Date("2026-11-20T15:00:00Z"),
      };
    }),
  );
  const totales = Object.fromEntries(DECISIONES.map((x) => [x, decisiones.filter((y) => y.decision === x).length])) as Record<Decision, number>;
  return {
    entidad,
    anio: 2026,
    abiertaEn: new Date("2026-11-02T13:00:00Z"),
    prorrogas: [{ fecha: new Date("2026-12-01T13:00:00Z"), dias: 10, motivo: "Texto de ejemplo: el motivo de la prórroga.", por: "Persona administradora de ejemplo" }],
    cerradaEn: new Date("2026-12-18T19:30:00Z"),
    cerradaPor: { nombre: "Persona administradora de ejemplo", cargo: "Cargo de ejemplo" },
    metodo: "clave",
    alcance: { documentos: decisiones.length, internos: decisiones.length, externos: 0, procesos: EJEMPLO_PROCESOS.length },
    totales,
    decisiones,
    normograma: {
      cambios: [
        { norma: "Norma de ejemplo 1 de 2026", estado: "Derogada", fecha: new Date("2026-03-12T05:00:00Z"), documentos: 3, resueltos: 2, noAfecta: 1 },
        { norma: "Norma de ejemplo 2 de 2026", estado: "Modificada", fecha: new Date("2026-08-04T05:00:00Z"), documentos: 1, resueltos: 1, noAfecta: 0 },
      ],
      porProceso: EJEMPLO_PROCESOS.map((proceso, i) => ({
        proceso,
        resultado: i === 1 ? "Con cambios" : "Sin novedad",
        nota: i === 1 ? "Texto de ejemplo: la norma que falta o la que cambió." : null,
      })),
    },
    otros: { acusesPct: 88, conformidadPct: 86, externosAlDia: { alDia: 6, total: 6 } },
    formato,
    zona,
    ejemplo: true,
  };
}
