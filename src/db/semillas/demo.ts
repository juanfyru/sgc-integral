/**
 * Semilla demo: el mapa de procesos real (validado por el usuario, ver
 * PLAN.md Apéndice A) + documentos ficticios pero verosímiles que cubren
 * todos los casos del modelo (asociaciones M:N con principal, relaciones
 * procedimiento↔formato, archivos multi-rol y los cuatro estados), más una
 * estructura organizacional, un usuario de ejemplo por rol, formatos ficticios
 * del acta y del informe ya elegidos, trámites en cada etapa (ver
 * `sembrarTramites`), la distribución de la 13B, la vigencia, los externos, el
 * normograma y la revisión anual de la 13C (`sembrarVigencia`) y los indicadores
 * de la 14A (`sembrarIndicadores`).
 *
 * Ejecutar: npm run db:seed   (borra y recarga TODO — solo desarrollo/demo)
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Sql, TransactionSql } from "postgres";
import { rutaBaseAlmacen } from "../../lib/almacen";
import { hashearClave } from "../../lib/clave";
import type { Rol } from "../../lib/roles";
import { constanciaDeCriterios } from "../../lib/tramites/criterios";
import { fechaEnZona, fechaLimite } from "../../lib/tramites/plazos";
import { esEtapaDeTrabajo, type Motivo, type TipoSolicitud } from "../../lib/tramites/tipos";
import { evaluarTransicion, type Accion } from "../../lib/tramites/transiciones";
import { zonaHoraria } from "../../lib/zona-horaria";
import { congelarDatosActa } from "../consultas/actas";
import { crearAcusesAlPublicar } from "../consultas/distribucion/acuses";
import { obtenerConfigDocumental, type ConfigDocumental } from "../consultas/config-documental";
import { listarFirmas, registrarFirma, type FirmaRegistrada } from "../consultas/firmas";
import { exigirDesignacion } from "../consultas/flujo/aceptacion";
import { criteriosNoCumplen, listarItemsVerificacion, obtenerVerificacion } from "../consultas/revision";
import {
  aFilaTramite,
  adminsActivos,
  lideresDeProceso,
  propietarioDeDocumento,
  rotuloDeTramite,
  tipoDeDocumento,
} from "../consultas/tramites";
import {
  enviarAvisos,
  nuevoVencimiento,
  registrarEvento,
  type Efecto,
  type FilaTramite,
} from "../consultas/tramites-flujo";
import * as e from "../esquema";
import { generarPlaceholder } from "../placeholders";
import { CLAVE_DEMO } from "./clave-demo";
import { momentoHace, sembrarDistribucion, sembrarDistribucionPrevia } from "./distribucion-demo";
import { CODIGO_FORMATO_ACTA, CODIGO_FORMATO_INFORME, generarFormatoActaDemo, generarFormatoInformeDemo } from "./formato-acta-demo";
import { sembrarIndicadores } from "./indicadores-demo";
import { limpiarTodo, sembrarBase, type Db } from "./minima";
import { sembrarVigencia } from "./vigencia-demo";

export { CLAVE_DEMO };
const NOMBRE_ENTIDAD = "ESE Hospital Nuestra Señora de Fátima de Suaza";
const LOGO_DEMO = path.join("src", "db", "semillas", "recursos", "logo-demo.png");

const MIMES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const slug = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Copia el logo demo al almacén (marca/logo-<hash>.png) y registra sus tres claves. */
async function sembrarLogoDemo(db: Db, almacen: string): Promise<void> {
  const hash = createHash("sha256").update(await readFile(LOGO_DEMO)).digest("hex").slice(0, 8);
  const ruta = `marca/logo-${hash}.png`;
  const destino = path.join(almacen, ...ruta.split("/"));
  await mkdir(path.dirname(destino), { recursive: true });
  await copyFile(LOGO_DEMO, destino);
  await db.insert(e.configuracion).values([
    { clave: "logo_ruta", valor: ruta },
    { clave: "logo_mime", valor: "image/png" },
    { clave: "logo_version", valor: hash },
  ]);
}

type DefArchivo = {
  rol: "principal" | "editable" | "anexo";
  ext: "pdf" | "docx" | "xlsx";
  /** El contenido de un archivo que no es un placeholder. */
  contenido?: () => Promise<Uint8Array>;
};

/**
 * Deja en el almacén `bytes`, o sin ellos un placeholder, y devuelve los datos de su fila en
 * `archivos`. `nota` cambia el contenido del placeholder, y con él su huella, sin cambiar su
 * nombre: es un archivo que reemplaza a otro.
 */
async function archivoDemo(
  { codigo, titulo }: { codigo: string; titulo: string },
  numero: number,
  { rol, ext }: DefArchivo,
  nota = "",
  bytes?: Uint8Array,
) {
  // El rol distingue archivos de la misma versión y extensión (p. ej.
  // principal PDF + anexo PDF) sin colisión de ruta.
  const nombreArchivo =
    rol === "principal"
      ? `${codigo.toLowerCase()}-v${numero}.${ext}`
      : `${codigo.toLowerCase()}-v${numero}-${rol}.${ext}`;
  const ruta = `${codigo}/v${numero}/${nombreArchivo}`;

  const contenido =
    bytes ??
    (await generarPlaceholder({
      codigo,
      titulo: `${titulo}${nota}`,
      numeroVersion: numero,
      ext,
      entidad: NOMBRE_ENTIDAD,
    }));
  const destino = path.join(rutaBaseAlmacen(), ...ruta.split("/"));
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, contenido);

  return {
    ruta,
    nombreOriginal: `${codigo} ${titulo} v${numero}.${ext}`,
    extension: ext,
    mime: MIMES[ext],
    tamanoBytes: contenido.length,
    hashSha256: createHash("sha256").update(contenido).digest("hex"),
  };
}

/** Documentos de la demo con acceso restringido (spec §5.3). */
const CODIGOS_RESTRINGIDOS: ReadonlySet<string> = new Set(["GTH-FO-01"]);

/**
 * `sql` es una conexión sin drizzle, para reutilizar `src/db/consultas`: `drizzle()` les quita a las
 * fechas y al JSON de su cliente la conversión con que esas consultas leen y escriben.
 */
export async function sembrarDemo(db: Db, sql: Sql): Promise<void> {
  // Un solo reloj para toda la siembra: cada fecha relativa se cuenta desde él, y es el `creado_en` de los usuarios demo
  // (`sembradaEn` en los tests). Cruzar la medianoche mientras siembra no corre ningún día.
  const ahora = new Date();
  await limpiarTodo(db);
  const { tipoPorSigla } = await sembrarBase(db);

  await db
    .update(e.configuracion)
    .set({ valor: NOMBRE_ENTIDAD })
    .where(eq(e.configuracion.clave, "nombre_entidad"));
  await db
    .update(e.configuracion)
    .set({ valor: "HNSF" })
    .where(eq(e.configuracion.clave, "sigla_entidad"));
  await sembrarLogoDemo(db, rutaBaseAlmacen());
  await db
    .update(e.configuracion)
    .set({ valor: "Comprometidos con la vida y el bienestar de nuestra comunidad" })
    .where(eq(e.configuracion.clave, "lema"));

  // ── Mapa de procesos ──────────────────────────────────────────────────────
  console.log("Sembrando mapa de procesos…");

  const VERDE = "#2E9B47";
  const AZUL = "#1B4E8E";

  const macros = await db
    .insert(e.macroprocesos)
    .values([
      { letra: "A", nombre: "Procesos Estratégicos", slug: "estrategicos", banda: "estrategicos", color: VERDE, icono: "settings", orden: 1 },
      { letra: "B", nombre: "Procesos Misionales (Asistenciales)", slug: "misionales", banda: "misionales", color: AZUL, icono: "cross", orden: 2 },
      { letra: "C", nombre: "Procesos de Apoyo", slug: "apoyo", banda: "apoyo", color: AZUL, icono: "users-round", orden: 3 },
      { letra: "D", nombre: "Procesos de Evaluación y Mejora", slug: "evaluacion-y-mejora", banda: "evaluacion", color: VERDE, icono: "circle-check-big", orden: 4 },
    ])
    .returning();
  const macroPorLetra = Object.fromEntries(macros.map((m) => [m.letra, m.id]));

  type DefProceso = {
    letra: string;
    sigla: string;
    nombre: string;
    icono: string;
    descripcion: string;
    subprocesos: string[];
  };

  // Siglas PROVISIONALES hasta que el usuario entregue la convención oficial
  // de códigos (ver CONTEXT.md § Pendientes). Editables desde el admin.
  const defProcesos: DefProceso[] = [
    { letra: "A", sigla: "GES", nombre: "Gestión Estratégica", icono: "target", descripcion: "Direccionamiento estratégico y gerencial de la institución.", subprocesos: ["Gestión Directiva", "Gestión Gerencial"] },
    { letra: "A", sigla: "SGC", nombre: "Sistema de Gestión de Calidad", icono: "award", descripcion: "Implementación y mantenimiento del SGC bajo NTC ISO 9001:2015.", subprocesos: [] },
    { letra: "A", sigla: "SOG", nombre: "SOGCS", icono: "shield-plus", descripcion: "Sistema Obligatorio de Garantía de Calidad en Salud.", subprocesos: ["Sistema Único de Habilitación", "PAMEC", "Seguridad del Paciente"] },
    { letra: "A", sigla: "RIE", nombre: "Gestión del Riesgo", icono: "shield-alert", descripcion: "Identificación, análisis y tratamiento de los riesgos institucionales.", subprocesos: [] },
    { letra: "B", sigla: "ATU", nombre: "Atención al Usuario", icono: "headset", descripcion: "Acceso, experiencia y participación de los usuarios y sus familias.", subprocesos: ["Acceso a los Servicios", "Gestión de la Experiencia y Satisfacción del Usuario", "Participación Ciudadana"] },
    { letra: "B", sigla: "CEX", nombre: "Consulta Externa", icono: "stethoscope", descripcion: "Atención ambulatoria programada en medicina, odontología y psicología.", subprocesos: ["Medicina General", "Medicina Especializada", "Odontología", "Psicología"] },
    { letra: "B", sigla: "PYM", nombre: "PYM", icono: "baby", descripcion: "Promoción de la salud y mantenimiento — intervenciones colectivas e individuales.", subprocesos: ["Vacunación", "Promoción de la Salud", "Atención Integral del Riesgo", "Gestión de la Salud Pública"] },
    { letra: "B", sigla: "ADX", nombre: "Apoyo Diagnóstico", icono: "microscope", descripcion: "Servicios de laboratorio clínico e imágenes diagnósticas.", subprocesos: ["Laboratorio", "Imágenes no Ionizantes", "Toma de Citologías"] },
    { letra: "B", sigla: "ATE", nombre: "Apoyo Terapéutico", icono: "heart-handshake", descripcion: "Farmacia y fisioterapia como soporte al tratamiento.", subprocesos: ["Farmacia", "Fisioterapia"] },
    { letra: "B", sigla: "AIN", nombre: "Atención Inmediata", icono: "siren", descripcion: "Urgencias, transporte asistencial y atención del parto.", subprocesos: ["Urgencias", "Transporte Asistencial Básico", "Atención del Parto"] },
    { letra: "B", sigla: "INT", nombre: "Internación", icono: "bed-double", descripcion: "Hospitalización de pacientes adultos y pediátricos.", subprocesos: ["Hospitalización Adulto y Pediátrico"] },
    { letra: "C", sigla: "GBS", nombre: "Gestión de Bienes y Servicios", icono: "shopping-cart", descripcion: "Adquisición, almacenamiento y mantenimiento de bienes y servicios.", subprocesos: ["Gestión Contractual", "Gestión de Compras", "Almacén", "Mantenimiento", "Apoyo Logístico", "Gestión Ambiental"] },
    { letra: "C", sigla: "GTH", nombre: "Gestión del Talento Humano", icono: "users", descripcion: "Ciclo de vida laboral del personal: ingreso, desarrollo y retiro.", subprocesos: ["Planeación del TH", "Ingreso", "Desarrollo", "Retiro", "Gestión del Conocimiento", "Seguridad y Salud en el Trabajo", "Docencia Servicio"] },
    { letra: "C", sigla: "GRF", nombre: "Gestión de Recursos Financieros", icono: "circle-dollar-sign", descripcion: "Gestión presupuestal, contable, de facturación y cartera.", subprocesos: ["Gestión Presupuestal", "Gestión de Facturación", "Gestión Tesorería", "Gestión Contable", "Gestión de Costos", "Gestión de Cuentas Médicas", "Gestión de Cartera"] },
    { letra: "C", sigla: "GJU", nombre: "Gestión Jurídica", icono: "scale", descripcion: "Asesoría legal y defensa judicial y extrajudicial de la entidad.", subprocesos: ["Asesoría Jurídica", "Defensa Judicial y Extrajudicial"] },
    { letra: "C", sigla: "GIC", nombre: "Gestión de la Información y las Comunicaciones", icono: "monitor-smartphone", descripcion: "Sistemas de información, soporte TI, estadística y comunicaciones.", subprocesos: ["Gestión de Sistemas de Información", "Soporte Técnico e Infraestructura TI", "Seguridad de la Información", "Gestión de Estadística y Análisis de Datos", "Mercadeo Institucional y Comunicaciones"] },
    { letra: "C", sigla: "GDO", nombre: "Gestión Documental", icono: "folder-open", descripcion: "Administración de documentos y archivo institucional.", subprocesos: ["Administración de Documentos", "Gestión de Archivo"] },
    { letra: "D", sigla: "SCI", nombre: "Sistema de Control Interno", icono: "clipboard-check", descripcion: "Control interno institucional bajo el modelo MECI.", subprocesos: ["MECI"] },
    { letra: "D", sigla: "AEV", nombre: "Autoevaluación Institucional", icono: "trending-up", descripcion: "Autoevaluación y auditorías internas de gestión.", subprocesos: ["Auditorías"] },
  ];

  const procesoPorSigla: Record<string, number> = {};
  const subprocesoPorClave: Record<string, number> = {};

  for (const [i, p] of defProcesos.entries()) {
    const [fila] = await db
      .insert(e.procesos)
      .values({
        macroprocesoId: macroPorLetra[p.letra],
        nombre: p.nombre,
        sigla: p.sigla,
        slug: slug(p.nombre),
        descripcion: p.descripcion,
        icono: p.icono,
        orden: i + 1,
      })
      .returning();
    procesoPorSigla[p.sigla] = fila.id;

    for (const [j, nombreSub] of p.subprocesos.entries()) {
      const [sub] = await db
        .insert(e.subprocesos)
        .values({
          procesoId: fila.id,
          nombre: nombreSub,
          slug: slug(nombreSub),
          orden: j + 1,
        })
        .returning();
      subprocesoPorClave[`${p.sigla}/${slug(nombreSub)}`] = sub.id;
    }
  }

  await db.insert(e.elementosPerifericos).values([
    { tipo: "entrada", texto: "Necesidades y expectativas de los usuarios", icono: "users", orden: 1 },
    { tipo: "entrada", texto: "Normatividad vigente del sector salud", icono: "scroll-text", orden: 2 },
    { tipo: "entrada", texto: "Requisitos de entes de control", icono: "landmark", orden: 3 },
    { tipo: "entrada", texto: "Recursos (humanos, financieros, tecnológicos, infraestructura)", icono: "boxes", orden: 4 },
    { tipo: "entrada", texto: "Información (epidemiológica, guías clínicas, evidencia científica)", icono: "chart-column", orden: 5 },
    { tipo: "salida", texto: "Servicios de salud (seguros, oportunos, de calidad)", icono: "heart-pulse", orden: 1 },
    { tipo: "salida", texto: "Seguridad del paciente", icono: "shield-plus", orden: 2 },
    { tipo: "salida", texto: "Calidad técnica", icono: "award", orden: 3 },
    { tipo: "salida", texto: "Oportunidad en la atención", icono: "clock", orden: 4 },
    { tipo: "salida", texto: "Satisfacción del usuario", icono: "smile", orden: 5 },
    { tipo: "salida", texto: "Cumplimiento normativo", icono: "clipboard-check", orden: 6 },
    { tipo: "salida", texto: "Resultados en salud", icono: "trending-up", orden: 7 },
    { tipo: "salida", texto: "Rentabilidad social", icono: "users-round", orden: 8 },
    { tipo: "convencion", texto: "Orientan y dirigen", icono: "move-right", orden: 1 },
    { tipo: "convencion", texto: "Interacción y soporte", icono: "move-horizontal", orden: 2 },
    { tipo: "convencion", texto: "Evaluación y mejora continua", icono: "iteration-cw", orden: 3 },
  ]);

  // ── Documentos ────────────────────────────────────────────────────────────
  console.log("Sembrando documentos…");

  const GERENTE = "Luz Dary Cabrera — Gerente";
  const CALIDAD = "María Fernanda Perdomo — Líder de Calidad";

  type DefVersion = {
    numero: number;
    estado: "borrador" | "vigente" | "obsoleto" | "anulado";
    elaboracion?: string;
    revision?: string;
    aprobacion?: string;
    elaboro?: string;
    reviso?: string;
    aprobo?: string;
    cambios?: string;
    archivos: DefArchivo[];
  };

  type DefAsociacion =
    | { proceso: string; principal?: boolean }
    | { subproceso: string; principal?: boolean };

  type DefDocumento = {
    codigo: string;
    titulo: string;
    tipo: string;
    descripcion: string;
    palabrasClave: string;
    versiones: DefVersion[];
    asociaciones: DefAsociacion[];
    relaciones?: string[];
  };

  // Lo aprobado fuera cuenta su plazo desde la fecha de aprobación (F13C-DC31): los documentos cuyo estado en el
  // semáforo depende de ella la llevan relativa a hoy, para que la demo amanezca igual el día que se siembre.
  const zona = zonaHoraria();
  const diaHace = (dias: number) => fechaEnZona(fechaLimite(ahora, -dias, zona), zona);
  const aprobadoHace = (dias: number) => ({ elaboracion: diaHace(dias + 30), revision: diaHace(dias + 15), aprobacion: diaHace(dias) });

  const v1Vigente = (
    elaboro: string,
    archivos: DefVersion["archivos"] = [{ rol: "principal", ext: "pdf" }],
  ): DefVersion => ({
    numero: 1,
    estado: "vigente",
    elaboracion: "2026-02-10",
    revision: "2026-02-25",
    aprobacion: "2026-03-12",
    elaboro,
    reviso: CALIDAD,
    aprobo: GERENTE,
    cambios: "Emisión inicial del documento.",
    archivos,
  });

  const defDocumentos: DefDocumento[] = [
    // ── Calidad (SGC) ──
    {
      codigo: "SGC-MN-01", titulo: "Manual de Calidad", tipo: "MN",
      descripcion: "Describe el Sistema de Gestión de Calidad de la ESE, su alcance, el mapa de procesos y las interacciones entre procesos.",
      palabrasClave: "manual calidad SGC ISO 9001 alcance exclusiones",
      versiones: [v1Vigente(CALIDAD)],
      asociaciones: [{ proceso: "SGC", principal: true }],
    },
    {
      codigo: "SGC-CA-01", titulo: "Caracterización Sistema de Gestión de Calidad", tipo: "CA",
      descripcion: "Caracterización del proceso: objetivo, alcance, entradas, salidas, actividades PHVA, indicadores y riesgos.",
      palabrasClave: "caracterizacion calidad proceso PHVA indicadores",
      versiones: [v1Vigente(CALIDAD)],
      asociaciones: [{ proceso: "SGC", principal: true }],
    },
    {
      codigo: "SGC-PR-01", titulo: "Procedimiento de Control de Documentos", tipo: "PR",
      descripcion: "Define la elaboración, revisión, aprobación, distribución, actualización y control de los documentos del SGC (numeral 7.5).",
      palabrasClave: "control documentos informacion documentada versiones obsoletos",
      versiones: [v1Vigente(CALIDAD)],
      asociaciones: [{ proceso: "SGC", principal: true }],
      relaciones: ["SGC-FO-03"],
    },
    {
      codigo: "SGC-FO-01", titulo: "Formato de Acta de Reunión", tipo: "FO",
      descripcion: "Formato institucional para registrar actas de reuniones, comités y socializaciones. De uso transversal.",
      palabrasClave: "acta reunion comite asistencia compromisos",
      versiones: [v1Vigente(CALIDAD, [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "docx" }])],
      asociaciones: [
        { proceso: "SGC", principal: true },
        { proceso: "GES" }, { proceso: "GTH" }, { proceso: "GBS" }, { proceso: "SCI" },
      ],
    },
    {
      codigo: "SGC-FO-02", titulo: "Formato de Informe", tipo: "FO",
      descripcion: "Formato institucional para presentación de informes de gestión, seguimiento y resultados.",
      palabrasClave: "informe gestion seguimiento resultados",
      versiones: [v1Vigente(CALIDAD, [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "docx" }])],
      asociaciones: [
        { proceso: "SGC", principal: true },
        { proceso: "GES" }, { proceso: "GRF" }, { proceso: "AEV" },
      ],
    },
    {
      codigo: "SGC-FO-03", titulo: "Formato Listado Maestro de Documentos", tipo: "FO",
      descripcion: "Consolida el inventario de documentos vigentes del SGC con su código, versión y fechas de control.",
      palabrasClave: "listado maestro documentos inventario control",
      versiones: [{
        numero: 1, estado: "borrador",
        elaboracion: "2026-06-20", elaboro: CALIDAD,
        cambios: "Borrador en elaboración — pendiente de aprobación.",
        archivos: [{ rol: "principal", ext: "xlsx" }],
      }],
      asociaciones: [{ proceso: "SGC", principal: true }],
    },
    {
      codigo: "SGC-FO-04", titulo: "Plantilla para procedimientos", tipo: "FO",
      descripcion: "Plantilla institucional para elaborar procedimientos: encabezado de control, objetivo, alcance, actividades y registros.",
      palabrasClave: "plantilla procedimiento encabezado estructura",
      versiones: [v1Vigente(CALIDAD, [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "docx" }])],
      asociaciones: [{ proceso: "SGC", principal: true }],
    },
    {
      codigo: "SGC-FO-05", titulo: "Plantilla para formatos", tipo: "FO",
      descripcion: "Plantilla institucional para elaborar formatos: encabezado de control, campos y espacio de firmas.",
      palabrasClave: "plantilla formato encabezado estructura",
      versiones: [v1Vigente(CALIDAD, [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "docx" }])],
      asociaciones: [{ proceso: "SGC", principal: true }],
    },
    {
      codigo: CODIGO_FORMATO_ACTA, titulo: "Acta de control documental", tipo: "FO",
      descripcion: "Formato institucional sobre el que la plataforma genera las actas de aprobación y de eliminación de documentos.",
      palabrasClave: "acta aprobacion eliminacion control documental formato",
      versiones: [v1Vigente(CALIDAD, [{ rol: "principal", ext: "pdf", contenido: () => generarFormatoActaDemo(NOMBRE_ENTIDAD) }])],
      asociaciones: [{ proceso: "SGC", principal: true }],
    },
    {
      codigo: CODIGO_FORMATO_INFORME, titulo: "Informe de revisión anual de documentos", tipo: "FO",
      descripcion: "Membrete institucional sobre el que la plataforma genera el informe de cierre de la revisión anual de documentos.",
      palabrasClave: "informe revision anual vigencia membrete",
      versiones: [v1Vigente(CALIDAD, [{ rol: "principal", ext: "pdf", contenido: () => generarFormatoInformeDemo(NOMBRE_ENTIDAD) }])],
      asociaciones: [{ proceso: "SGC", principal: true }],
    },

    // ── Talento Humano (GTH) ── incluye la demo de versión obsoleta retenida
    {
      codigo: "GTH-CA-01", titulo: "Caracterización Gestión del Talento Humano", tipo: "CA",
      descripcion: "Caracterización del proceso de talento humano: objetivo, alcance, actividades PHVA e indicadores.",
      palabrasClave: "caracterizacion talento humano personal PHVA",
      versiones: [
        {
          numero: 1, estado: "obsoleto",
          elaboracion: "2024-03-05", revision: "2024-03-20", aprobacion: "2024-04-02",
          elaboro: "Diana Patricia Losada — Coordinadora de Talento Humano",
          reviso: CALIDAD, aprobo: GERENTE,
          cambios: "Emisión inicial del documento.",
          archivos: [{ rol: "principal", ext: "pdf" }],
        },
        {
          numero: 2, estado: "vigente",
          elaboracion: "2026-01-15", revision: "2026-02-01", aprobacion: "2026-02-18",
          elaboro: "Diana Patricia Losada — Coordinadora de Talento Humano",
          reviso: CALIDAD, aprobo: GERENTE,
          cambios: "Actualización de indicadores y ajuste del alcance por reorganización de subprocesos.",
          archivos: [{ rol: "principal", ext: "pdf" }],
        },
      ],
      asociaciones: [{ proceso: "GTH", principal: true }],
    },
    {
      codigo: "GTH-PR-01", titulo: "Procedimiento de Ingreso de Personal", tipo: "PR",
      descripcion: "Establece las actividades para la vinculación de personal de planta y contratistas: verificación de requisitos, afiliaciones y posesión.",
      palabrasClave: "ingreso vinculacion contratacion hoja de vida requisitos",
      // Vencido en el semáforo: aprobado hace más de un año, sin fecha fijada ni ratificación.
      versiones: [{ ...v1Vigente("Diana Patricia Losada — Coordinadora de Talento Humano"), ...aprobadoHace(450) }],
      asociaciones: [{ subproceso: "GTH/ingreso", principal: true }],
      relaciones: ["GTH-FO-01"],
    },
    {
      codigo: "GTH-FO-01", titulo: "Formato Lista de Chequeo Hoja de Vida", tipo: "FO",
      descripcion: "Lista de verificación de los documentos exigidos para la vinculación de personal.",
      palabrasClave: "lista chequeo hoja de vida requisitos ingreso",
      versiones: [v1Vigente("Diana Patricia Losada — Coordinadora de Talento Humano", [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "xlsx" }])],
      asociaciones: [{ subproceso: "GTH/ingreso", principal: true }],
    },
    {
      codigo: "GTH-PR-02", titulo: "Procedimiento de Inducción y Reinducción", tipo: "PR",
      descripcion: "Define la inducción institucional y del puesto de trabajo para personal nuevo, y la reinducción periódica.",
      palabrasClave: "induccion reinduccion capacitacion personal nuevo",
      versiones: [v1Vigente("Diana Patricia Losada — Coordinadora de Talento Humano")],
      asociaciones: [{ subproceso: "GTH/desarrollo", principal: true }],
      relaciones: ["SGC-FO-01"],
    },

    // ── SOGCS ── política transversal a todos los misionales
    {
      codigo: "SOG-PO-01", titulo: "Política de Seguridad del Paciente", tipo: "PO",
      descripcion: "Declara el compromiso institucional con la atención segura: cultura del reporte, gestión de eventos adversos y buenas prácticas.",
      palabrasClave: "seguridad paciente eventos adversos cultura reporte",
      versiones: [v1Vigente(CALIDAD)],
      asociaciones: [
        { subproceso: "SOG/seguridad-del-paciente", principal: true },
        { proceso: "ATU" }, { proceso: "CEX" }, { proceso: "PYM" }, { proceso: "ADX" },
        { proceso: "ATE" }, { proceso: "AIN" }, { proceso: "INT" },
      ],
    },
    {
      codigo: "SOG-PL-01", titulo: "Programa de Auditoría para el Mejoramiento de la Calidad (PAMEC)", tipo: "PL",
      descripcion: "Ruta crítica del PAMEC: autoevaluación, selección de procesos prioritarios, calidad esperada y planes de mejoramiento.",
      palabrasClave: "PAMEC auditoria mejoramiento calidad esperada",
      versiones: [v1Vigente(CALIDAD)],
      asociaciones: [{ subproceso: "SOG/pamec", principal: true }],
    },

    // ── Bienes y Servicios (GBS) ── formato compartido con ADX e INT
    {
      codigo: "GBS-FO-01", titulo: "Formato Solicitud de Mantenimiento", tipo: "FO",
      descripcion: "Solicitud de mantenimiento correctivo o preventivo de equipos e infraestructura. Lo usan todos los servicios.",
      palabrasClave: "solicitud mantenimiento correctivo preventivo equipos",
      versiones: [v1Vigente("Jorge Eliécer Ramos — Técnico de Mantenimiento", [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "xlsx" }])],
      asociaciones: [
        { subproceso: "GBS/mantenimiento", principal: true },
        { proceso: "ADX" }, { proceso: "INT" },
      ],
    },
    {
      codigo: "GBS-PR-01", titulo: "Procedimiento de Mantenimiento Preventivo de Equipos Biomédicos", tipo: "PR",
      descripcion: "Programación y ejecución del mantenimiento preventivo de equipos biomédicos según cronograma anual y hojas de vida de equipos.",
      palabrasClave: "mantenimiento preventivo equipos biomedicos cronograma",
      versiones: [v1Vigente("Jorge Eliécer Ramos — Técnico de Mantenimiento")],
      asociaciones: [{ subproceso: "GBS/mantenimiento", principal: true }],
      relaciones: ["GBS-FO-01"],
    },
    {
      codigo: "GBS-PR-02", titulo: "Procedimiento de Ingreso de Bienes a Almacén", tipo: "PR",
      descripcion: "Recepción, verificación e ingreso de bienes al almacén general con su registro correspondiente.",
      palabrasClave: "almacen ingreso bienes inventario recepcion",
      versiones: [v1Vigente("Nubia Esperanza Quintero — Almacenista")],
      asociaciones: [{ subproceso: "GBS/almacen", principal: true }],
      relaciones: ["SGC-FO-02"],
    },

    // ── Misionales ──
    {
      codigo: "CEX-CA-01", titulo: "Caracterización Consulta Externa", tipo: "CA",
      descripcion: "Caracterización del proceso de consulta externa: objetivo, alcance, actividades PHVA e indicadores.",
      palabrasClave: "caracterizacion consulta externa ambulatoria",
      // Aprobado hace casi dos años y ratificado hace ocho meses (`sembrarVigencia`).
      versiones: [{ ...v1Vigente("Hernán Darío Ceballos — Médico Coordinador"), ...aprobadoHace(660) }],
      asociaciones: [{ proceso: "CEX", principal: true }],
    },
    {
      codigo: "CEX-GU-01", titulo: "Guía de Atención de Hipertensión Arterial", tipo: "GU",
      descripcion: "Guía de práctica clínica adoptada para el diagnóstico, tratamiento y seguimiento del paciente hipertenso.",
      palabrasClave: "hipertension arterial HTA guia clinica cronicos",
      versiones: [v1Vigente("Hernán Darío Ceballos — Médico Coordinador")],
      asociaciones: [{ subproceso: "CEX/medicina-general", principal: true }],
    },
    {
      codigo: "AIN-PR-01", titulo: "Procedimiento de Referencia y Contrarreferencia", tipo: "PR",
      descripcion: "Remisión de pacientes a mayor nivel de complejidad y recepción de contrarreferencias, incluyendo coordinación con el CRUE.",
      palabrasClave: "referencia contrarreferencia remision CRUE traslado",
      versiones: [v1Vigente("Sandra Milena Artunduaga — Enfermera Jefe de Urgencias")],
      asociaciones: [{ subproceso: "AIN/urgencias", principal: true }],
      relaciones: ["AIN-FO-01"],
    },
    {
      codigo: "AIN-FO-01", titulo: "Formato de Remisión de Pacientes", tipo: "FO",
      descripcion: "Registro de la remisión de pacientes: datos clínicos, motivo de remisión y condiciones del traslado.",
      palabrasClave: "remision traslado paciente formato",
      // Vencido en el semáforo, como GTH-PR-01.
      versiones: [{
        ...v1Vigente("Sandra Milena Artunduaga — Enfermera Jefe de Urgencias", [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "docx" }]),
        ...aprobadoHace(420),
      }],
      asociaciones: [{ subproceso: "AIN/urgencias", principal: true }],
    },
    {
      codigo: "AIN-PT-01", titulo: "Protocolo de Atención del Parto de Bajo Riesgo", tipo: "PT",
      descripcion: "Protocolo institucional para la atención del trabajo de parto, parto y posparto inmediato de bajo riesgo.",
      palabrasClave: "parto bajo riesgo protocolo materno perinatal",
      versiones: [v1Vigente("Sandra Milena Artunduaga — Enfermera Jefe de Urgencias")],
      asociaciones: [{ subproceso: "AIN/atencion-del-parto", principal: true }],
    },
    {
      codigo: "PYM-PR-01", titulo: "Procedimiento de Vacunación", tipo: "PR",
      descripcion: "Aplicación de biológicos del PAI: esquema, cadena de frío, registro nominal y manejo de reacciones postvacunales.",
      palabrasClave: "vacunacion PAI biologicos cadena frio esquema",
      versiones: [v1Vigente("Yolanda Trujillo — Auxiliar de Enfermería PAI")],
      asociaciones: [{ subproceso: "PYM/vacunacion", principal: true }],
      relaciones: ["PYM-FO-01"],
    },
    {
      codigo: "PYM-FO-01", titulo: "Formato Registro Diario de Vacunación", tipo: "FO",
      descripcion: "Registro diario de dosis aplicadas por biológico, grupo de edad y estrategia.",
      palabrasClave: "registro diario vacunacion dosis biologico",
      versiones: [v1Vigente("Yolanda Trujillo — Auxiliar de Enfermería PAI", [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "xlsx" }])],
      asociaciones: [{ subproceso: "PYM/vacunacion", principal: true }],
    },

    // ── Gestión Documental (GDO) ──
    {
      codigo: "GDO-PR-01", titulo: "Procedimiento de Organización de Archivos de Gestión", tipo: "PR",
      descripcion: "Organización, foliación y transferencia de los archivos de gestión según las TRD institucionales.",
      palabrasClave: "archivo gestion TRD foliacion transferencia documental",
      versiones: [v1Vigente("Rosa Elena Manrique — Técnica de Archivo")],
      asociaciones: [{ subproceso: "GDO/gestion-de-archivo", principal: true }],
      relaciones: ["GDO-FO-01"],
    },
    {
      codigo: "GDO-FO-01", titulo: "Formato Único de Inventario Documental (FUID)", tipo: "FO",
      descripcion: "Inventario documental para transferencias y entregas de archivo, según lineamientos del AGN.",
      palabrasClave: "FUID inventario documental transferencia AGN",
      versiones: [v1Vigente("Rosa Elena Manrique — Técnica de Archivo", [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "xlsx" }])],
      asociaciones: [
        { proceso: "GDO", principal: true },
        { proceso: "GTH" }, { proceso: "GRF" },
      ],
    },

    // ── GIC ── incluye la demo de documento anulado
    {
      codigo: "GIC-IN-01", titulo: "Instructivo de Copias de Seguridad", tipo: "IN",
      descripcion: "Ejecución y verificación de las copias de seguridad de los sistemas de información institucionales.",
      palabrasClave: "copias seguridad backup respaldo sistemas",
      versiones: [v1Vigente("Andrés Felipe Cardozo — Ingeniero de Sistemas")],
      asociaciones: [{ subproceso: "GIC/soporte-tecnico-e-infraestructura-ti", principal: true }],
    },
    {
      codigo: "GIC-IN-02", titulo: "Instructivo de Uso del Fax Institucional", tipo: "IN",
      descripcion: "Instructivo para el envío y recepción de documentos por fax. Anulado: el equipo fue dado de baja y el canal reemplazado por correo institucional.",
      palabrasClave: "fax envio recepcion documentos",
      versiones: [{
        numero: 1, estado: "anulado",
        elaboracion: "2023-05-10", revision: "2023-05-25", aprobacion: "2023-06-08",
        elaboro: "Andrés Felipe Cardozo — Ingeniero de Sistemas",
        reviso: CALIDAD, aprobo: GERENTE,
        cambios: "Anulado en 2026-01: equipo dado de baja, sin documento que lo reemplace.",
        archivos: [{ rol: "principal", ext: "pdf" }],
      }],
      asociaciones: [{ proceso: "GIC", principal: true }],
    },

    // ── Estratégicos y financieros ──
    {
      codigo: "GES-PL-01", titulo: "Plan de Desarrollo Institucional 2024-2027", tipo: "PL",
      descripcion: "Plan de desarrollo de la ESE: ejes estratégicos, metas e indicadores del cuatrienio.",
      palabrasClave: "plan desarrollo institucional estrategia metas",
      versiones: [v1Vigente("Luz Dary Cabrera — Gerente")],
      asociaciones: [{ proceso: "GES", principal: true }],
    },
    {
      codigo: "GRF-PR-01", titulo: "Procedimiento de Facturación de Servicios de Salud", tipo: "PR",
      descripcion: "Facturación de los servicios prestados: admisión, liquidación, soportes y radicación ante las EPS.",
      palabrasClave: "facturacion servicios salud EPS radicacion RIPS",
      versiones: [v1Vigente("Mariela Fajardo — Técnica de Facturación")],
      asociaciones: [{ subproceso: "GRF/gestion-de-facturacion", principal: true }],
    },
  ];

  const documentoPorCodigo: Record<string, number> = {};

  for (const def of defDocumentos) {
    const [doc] = await db
      .insert(e.documentos)
      .values({
        codigo: def.codigo,
        titulo: def.titulo,
        tipoId: tipoPorSigla[def.tipo],
        descripcion: def.descripcion,
        palabrasClave: def.palabrasClave,
        nivelAcceso: CODIGOS_RESTRINGIDOS.has(def.codigo) ? "restringido" : "general",
      })
      .returning();
    documentoPorCodigo[def.codigo] = doc.id;

    for (const v of def.versiones) {
      const [version] = await db
        .insert(e.documentoVersiones)
        .values({
          documentoId: doc.id,
          numero: v.numero,
          estado: v.estado,
          fechaElaboracion: v.elaboracion,
          fechaRevision: v.revision,
          fechaAprobacion: v.aprobacion,
          elaboro: v.elaboro,
          reviso: v.reviso,
          aprobo: v.aprobo,
          resumenCambios: v.cambios,
        })
        .returning();

      for (const a of v.archivos) {
        const archivo = await archivoDemo(def, v.numero, a, "", await a.contenido?.());
        await db.insert(e.archivos).values({ versionId: version.id, rol: a.rol, ...archivo });
      }
    }

    for (const asoc of def.asociaciones) {
      if ("proceso" in asoc) {
        await db.insert(e.documentoProceso).values({
          documentoId: doc.id,
          procesoId: procesoPorSigla[asoc.proceso],
          esPrincipal: asoc.principal ?? false,
        });
      } else {
        const subId = subprocesoPorClave[asoc.subproceso];
        if (!subId) throw new Error(`Subproceso no encontrado: ${asoc.subproceso}`);
        await db.insert(e.documentoProceso).values({
          documentoId: doc.id,
          subprocesoId: subId,
          esPrincipal: asoc.principal ?? false,
        });
      }
    }
  }

  // Segunda pasada: relaciones documento↔documento (los destinos ya existen).
  for (const def of defDocumentos) {
    for (const codigoRelacionado of def.relaciones ?? []) {
      const relacionadoId = documentoPorCodigo[codigoRelacionado];
      if (!relacionadoId) throw new Error(`Relación a código inexistente: ${codigoRelacionado}`);
      await db.insert(e.documentoRelaciones).values({
        documentoId: documentoPorCodigo[def.codigo],
        relacionadoId,
      });
    }
  }
  // Los tipos apuntan a la plantilla con que se elaboran sus documentos.
  for (const [sigla, plantilla] of [["PR", "SGC-FO-04"], ["FO", "SGC-FO-05"]]) {
    await db
      .update(e.tiposDocumento)
      .set({ plantillaDocumentoId: documentoPorCodigo[plantilla] })
      .where(eq(e.tiposDocumento.id, tipoPorSigla[sigla]));
  }

  const usuarioPorNombre = await sembrarEstructuraYUsuarios(db, procesoPorSigla, ahora);
  // Antes de los trámites: el acta de cada cierre congela el formato elegido.
  await db.insert(e.configuracion).values([
    { clave: "formato_acta_documento_id", valor: String(documentoPorCodigo[CODIGO_FORMATO_ACTA]) },
    { clave: "formato_acta_margen_superior_cm", valor: "4.2" },
    { clave: "formato_acta_margen_inferior_cm", valor: "3.2" },
  ]);
  // La copia de la v2 de GTH-CA-01 se emite antes de que los trámites publiquen la v3.
  const distribucion = { ahora, usuarioPorNombre, documentoPorCodigo, procesoPorSigla };
  await sembrarDistribucionPrevia(sql, distribucion);
  await sembrarTramites(sql, { tipoPorSigla, procesoPorSigla, documentoPorCodigo }, ahora);
  await sembrarDistribucion(sql, distribucion);
  await sembrarVigencia(sql, distribucion);
  // Después de la vigencia: el regulatorio cita una norma del normograma.
  await sembrarIndicadores(sql, distribucion);
}

/**
 * Áreas, cargos con su jerarquía y un usuario de ejemplo por rol. `admin` no se siembra: lo crea
 * `admin:asegurar`. `coordinadora.sgc` es la otra Admin SGC, la que revisa en la demo.
 */
async function sembrarEstructuraYUsuarios(
  db: Db,
  procesoPorSigla: Record<string, number>,
  ahora: Date,
): Promise<Record<string, number>> {
  console.log("Sembrando estructura organizacional y usuarios demo…");

  const areas = await db
    .insert(e.areas)
    .values(
      [
        "Gerencia",
        "Subgerencia Científica",
        "Subgerencia Administrativa",
        "Oficina de Calidad",
        "Control Interno",
      ].map((nombre, i) => ({ nombre, orden: i + 1 })),
    )
    .returning();
  const area = Object.fromEntries(areas.map((a) => [a.nombre, a.id]));

  // Orden de inserción: cada superior se crea antes que sus subordinados.
  const defCargos: { nombre: string; area: string; superior?: string }[] = [
    { nombre: "Gerente", area: "Gerencia" },
    { nombre: "Subgerente Científico", area: "Subgerencia Científica", superior: "Gerente" },
    { nombre: "Subgerente Administrativo", area: "Subgerencia Administrativa", superior: "Gerente" },
    { nombre: "Líder de Calidad", area: "Oficina de Calidad", superior: "Gerente" },
    { nombre: "Jefe de Control Interno", area: "Control Interno", superior: "Gerente" },
    { nombre: "Médico Coordinador", area: "Subgerencia Científica", superior: "Subgerente Científico" },
    { nombre: "Enfermera Jefe", area: "Subgerencia Científica", superior: "Médico Coordinador" },
    { nombre: "Auxiliar de Enfermería", area: "Subgerencia Científica", superior: "Enfermera Jefe" },
    { nombre: "Coordinadora de Talento Humano", area: "Subgerencia Administrativa", superior: "Subgerente Administrativo" },
    { nombre: "Regente de Farmacia", area: "Subgerencia Científica", superior: "Subgerente Científico" },
  ];
  const cargo: Record<string, number> = {};
  for (const c of defCargos) {
    const [fila] = await db
      .insert(e.cargos)
      .values({
        nombre: c.nombre,
        areaId: area[c.area],
        superiorId: c.superior ? cargo[c.superior] : null,
      })
      .returning();
    cargo[c.nombre] = fila.id;
  }

  const hashClave = await hashearClave(CLAVE_DEMO);
  const defUsuarios: {
    usuario: string;
    nombre: string;
    rol: string;
    cargo: string;
    procesos?: string[];
  }[] = [
    { usuario: "coordinadora.sgc", nombre: "María Fernanda Perdomo", rol: "admin_sgc", cargo: "Líder de Calidad", procesos: ["SGC"] },
    { usuario: "gerente", nombre: "Gerente de ejemplo", rol: "gerencia", cargo: "Gerente" },
    { usuario: "control.interno", nombre: "Control Interno de ejemplo", rol: "control_interno", cargo: "Jefe de Control Interno" },
    { usuario: "lider.gth", nombre: "Líder de Talento Humano de ejemplo", rol: "lider_proceso", cargo: "Coordinadora de Talento Humano", procesos: ["GTH"] },
    { usuario: "lider.cex", nombre: "Líder de Consulta Externa de ejemplo", rol: "lider_proceso", cargo: "Médico Coordinador", procesos: ["CEX"] },
    { usuario: "consulta", nombre: "Usuario de consulta de ejemplo", rol: "consulta", cargo: "Auxiliar de Enfermería", procesos: ["AIN", "CEX"] },
    { usuario: "jefe.urgencias", nombre: "Luz Dary Ortiz", rol: "consulta", cargo: "Enfermera Jefe", procesos: ["AIN"] },
    { usuario: "regente.farmacia", nombre: "Carlos Andrés Rojas", rol: "consulta", cargo: "Regente de Farmacia", procesos: ["ATE"] },
  ];
  const usuarioPorNombre: Record<string, number> = {};
  for (const u of defUsuarios) {
    const [fila] = await db
      .insert(e.usuarios)
      .values({
        usuario: u.usuario,
        nombre: u.nombre,
        hashClave,
        rol: u.rol,
        cargoId: cargo[u.cargo],
        debeCambiarClave: false,
        aceptoDatosEn: ahora,
        creadoEn: ahora,
      })
      .returning();
    await db.insert(e.notificaciones).values({
      usuarioId: fila.id,
      tipo: "bienvenida",
      titulo: "Bienvenida al SGC Integral",
      cuerpo: "Explore el mapa de procesos y revise su cuenta en Mi cuenta.",
      enlace: "/cuenta",
    });
    usuarioPorNombre[u.usuario] = fila.id;
    for (const sigla of u.procesos ?? []) {
      await db
        .insert(e.usuarioProcesos)
        .values({ usuarioId: fila.id, procesoId: procesoPorSigla[sigla] });
    }
  }
  return usuarioPorNombre;
}

// ── Trámites ────────────────────────────────────────────────────────────────
// Se escriben por inserción directa, sin `transicionar`, porque cada paso lleva la hora en que
// ocurrió, días atrás. Las filas son las que deja el flujo real; `tests/semilla-tramites.test.ts`
// compara la forma de los detalles y sigue cada trámite con las funciones reales.

type Persona = { id: number; rol: Rol };

/** Quién hizo un paso y cuándo. */
type Autor = { quien: Persona; momento: Date };

type Contexto = { tx: TransactionSql; config: ConfigDocumental; zona: string; anio: number };

/** `registrarAuditoria` con la hora del paso, que el flujo real no necesita: ahí siempre es ahora. */
async function auditar(
  { tx }: Contexto,
  { quien, momento }: Autor,
  fila: { accion: string; entidad: string; entidadId: number; detalle: Record<string, unknown> },
): Promise<void> {
  await tx`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, creado_en)
    VALUES (${quien.id}, ${fila.accion}, ${fila.entidad}, ${fila.entidadId}, ${tx.json(fila.detalle as never)}, ${momento})`;
}

async function auditarTramite(c: Contexto, t: FilaTramite, autor: Autor, accion: string, detalle: Record<string, unknown>): Promise<void> {
  const { codigo } = await rotuloDeTramite(c.tx, t);
  await auditar(c, autor, {
    accion: `tramite_${accion}`,
    entidad: "tramite",
    entidadId: t.id,
    detalle: { numero: t.numero, codigo, documentoId: t.documentoId, ...detalle },
  });
}

type Solicitud = Autor & {
  consecutivo: number;
  tipo: TipoSolicitud;
  motivo: Motivo;
  justificacion: string;
} & ({ documentoId: number } | { procesoId: number; tipoDocumentoId: number; tituloPropuesto: string });

/** Lo que escribe `crearSolicitud`: el visto bueno queda dado si pide el líder y omitido si el proceso no tiene. */
async function solicitar(c: Contexto, s: Solicitud): Promise<FilaTramite> {
  const { tx, config, zona, anio } = c;
  const { quien, momento, consecutivo, tipo, motivo, justificacion } = s;
  const destino =
    "documentoId" in s
      ? { ...(await propietarioDeDocumento(s.documentoId, { sql: tx }))!, tipoDocumentoId: null, tituloPropuesto: null, documentoId: s.documentoId }
      : { procesoId: s.procesoId, subprocesoId: null, tipoDocumentoId: s.tipoDocumentoId, tituloPropuesto: s.tituloPropuesto, documentoId: null };
  const lideres = await lideresDeProceso(destino.procesoId, { sql: tx });
  const pideElLider = lideres.includes(quien.id);
  const etapa = pideElLider || lideres.length === 0 ? "aceptacion" : "visto_bueno";
  const numero = `SOL-${anio}-${String(consecutivo).padStart(3, "0")}`;

  const [fila] = await tx`INSERT INTO tramites
      (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, subproceso_id,
       tipo_documento_id, titulo_propuesto, documento_id, etapa, ronda, vence_en, creado_en, actualizado_en)
    VALUES
      (${numero}, ${anio}, ${consecutivo}, ${tipo}, ${motivo}, ${justificacion}, ${quien.id}, ${destino.procesoId},
       ${destino.subprocesoId}, ${destino.tipoDocumentoId}, ${destino.tituloPropuesto}, ${destino.documentoId}, ${etapa}, 0,
       ${fechaLimite(momento, config.plazos[etapa], zona)}, ${momento}, ${momento})
    RETURNING *`;
  const t = aFilaTramite(fila);

  const evento = { tramiteId: t.id, ronda: 0, ahora: momento };
  await registrarEvento(tx, { ...evento, tipo: "solicitar", usuarioId: quien.id });
  if (pideElLider) await registrarEvento(tx, { ...evento, tipo: "visto_bueno_automatico", usuarioId: quien.id });
  else if (lideres.length === 0) await registrarEvento(tx, { ...evento, tipo: "visto_bueno_omitido", usuarioId: null });
  await auditarTramite(c, t, s, "solicitar", { de: null, hacia: etapa, ronda: 0, tipo, motivo });
  return t;
}

type Paso = Autor & {
  accion: Accion;
  /** El `detalle` del evento, como lo escribe el manejador de la acción. */
  detalle?: Record<string, unknown>;
  cambios?: NonNullable<Efecto["cambios"]>;
};

/**
 * Lo que escribe `transicionar` en un paso: el trámite, las firmas, el evento y su bitácora. Etapa,
 * ronda, firmas y plazo salen de las reglas reales, y un paso que ellas no admiten rompe la semilla.
 * Un `detalle` que dependa de lo anterior se calcula antes de llamar, en el orden del manejador.
 */
async function paso(c: Contexto, previo: FilaTramite, p: Paso): Promise<FilaTramite> {
  const { tx, config } = c;
  const { accion, quien, momento, detalle = {}, cambios = {} } = p;
  const veredicto = evaluarTransicion(accion, previo, { usuarioId: quien.id, rol: quien.rol, lideraPropietario: false });
  if (!veredicto.ok) throw new Error(`${previo.numero}, ${accion}: ${veredicto.motivo}`);
  const { hacia, sumaRonda, firmas } = veredicto;

  const t: FilaTramite = { ...previo, ...cambios, etapa: hacia, ronda: previo.ronda + (sumaRonda ? 1 : 0) };
  t.venceEn = nuevoVencimiento(previo, cambios, t.etapa, t.ronda, momento, config);
  await tx`UPDATE tramites SET
      etapa = ${t.etapa}, ronda = ${t.ronda}, version_id = ${t.versionId}, elaborador_id = ${t.elaboradorId},
      revisor_id = ${t.revisorId}, aprobador_id = ${t.aprobadorId}, vence_en = ${t.venceEn},
      cerrado_en = ${esEtapaDeTrabajo(t.etapa) ? null : momento}, actualizado_en = ${momento}
    WHERE id = ${t.id}`;

  for (const firma of firmas) {
    const [{ hash_sha256: hashSha256 }] = await tx`SELECT hash_sha256 FROM archivos WHERE version_id = ${t.versionId} AND rol = 'principal'`;
    await registrarFirma(tx, {
      tramiteId: t.id,
      versionId: t.versionId,
      usuarioId: quien.id,
      firma,
      ronda: t.ronda,
      hashSha256,
      metodo: "clave",
      contexto: { ip: null, userAgent: null },
      ahora: momento,
    });
  }

  // Como `transicionar`: el paso que cierra una etapa guarda la fecha límite que tenía (indicador de etapas en plazo).
  const delEvento = hacia === previo.etapa ? detalle : { ...detalle, venceEn: previo.venceEn?.toISOString() ?? null };
  await registrarEvento(tx, { tramiteId: t.id, tipo: accion, usuarioId: quien.id, ronda: t.ronda, detalle: delEvento, ahora: momento });
  // El acta congelada ya está en el evento; la bitácora no la repite.
  const detalleDeAuditoria = { ...detalle };
  delete detalleDeAuditoria.acta;
  await auditarTramite(c, t, p, accion, { ...detalleDeAuditoria, de: previo.etapa, hacia, ronda: t.ronda });
  return t;
}

/** Acepta una modificación: abre la versión siguiente, con las reglas reales de designación. */
async function aceptar(
  c: Contexto,
  t: FilaTramite,
  autor: Autor,
  { elaborador, revisor, aprobador }: { elaborador: Persona; revisor: Persona; aprobador: Persona },
): Promise<FilaTramite> {
  const { tx, config, zona } = c;
  const documentoId = t.documentoId as number;
  const ids = { elaboradorId: elaborador.id, revisorId: revisor.id, aprobadorId: aprobador.id };
  const [doc] = await tx`SELECT codigo, tipo_id FROM documentos WHERE id = ${documentoId}`;
  const tipo = (await tipoDeDocumento(Number(doc.tipo_id), { sql: tx }))!;
  const responsables = await exigirDesignacion(tx, t, "modificar", tipo.autoridad, ids);

  const [version] = await tx`INSERT INTO documento_versiones (documento_id, numero, estado, creado_en)
    SELECT ${documentoId}, max(numero) + 1, 'borrador', ${autor.momento} FROM documento_versiones WHERE documento_id = ${documentoId}
    RETURNING id, numero`;
  const versionId = Number(version.id);
  await auditar(c, autor, {
    accion: "crear_version",
    entidad: "documento_version",
    entidadId: versionId,
    detalle: { documentoId, numero: version.numero },
  });
  return paso(c, t, {
    ...autor,
    accion: "aceptar",
    detalle: { codigo: doc.codigo, version: version.numero, plantilla: tipo.plantilla, responsables },
    cambios: { ...ids, versionId, venceEn: fechaLimite(autor.momento, config.plazos.elaboracion, zona) },
  });
}

/** Escribe el control de cambios, sube el archivo principal (reemplaza el de la ronda anterior) y envía a revisión. */
async function elaborar(
  c: Contexto,
  t: FilaTramite,
  autor: Autor,
  { controlCambios, nota }: { controlCambios: string; nota?: string },
): Promise<FilaTramite> {
  const { tx } = c;
  const versionId = t.versionId as number;
  const [v] = await tx`UPDATE documento_versiones v SET resumen_cambios = ${controlCambios}
    FROM documentos d WHERE v.id = ${versionId} AND d.id = v.documento_id
    RETURNING v.numero, d.codigo, d.titulo`;
  await auditar(c, autor, {
    accion: "editar_version",
    entidad: "documento_version",
    entidadId: versionId,
    detalle: { documentoId: t.documentoId, numero: v.numero, tramite: t.numero, resumenCambios: controlCambios },
  });

  const [anterior] = await tx`DELETE FROM archivos WHERE version_id = ${versionId} AND rol = 'principal' RETURNING id, nombre_original`;
  if (anterior) {
    await auditar(c, autor, {
      accion: "eliminar_archivo",
      entidad: "archivo",
      entidadId: Number(anterior.id),
      detalle: { nombre: anterior.nombre_original },
    });
  }
  const a = await archivoDemo({ codigo: v.codigo, titulo: v.titulo }, v.numero, { rol: "principal", ext: "pdf" }, nota);
  const [archivo] = await tx`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256, creado_en)
    VALUES (${versionId}, 'principal', ${a.ruta}, ${a.nombreOriginal}, ${a.extension}, ${a.mime}, ${a.tamanoBytes}, ${a.hashSha256}, ${autor.momento})
    RETURNING id`;
  await auditar(c, autor, {
    accion: "subir_archivo",
    entidad: "archivo",
    entidadId: Number(archivo.id),
    detalle: { versionId, rol: "principal", nombre: a.nombreOriginal },
  });
  return paso(c, t, { ...autor, accion: "enviar_a_revision" });
}

/** La lista de la ronda: todo cumple, salvo los ítems de `fallas`, por su orden y con su nota. */
async function responderLista(c: Contexto, t: FilaTramite, autor: Autor, fallas: Record<number, string> = {}): Promise<void> {
  const { tx } = c;
  const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
  for (const i of items) {
    const nota = fallas[i.orden] ?? null;
    await tx`INSERT INTO tramite_verificaciones (tramite_id, ronda, item_id, texto_item, critico, resultado, nota)
      VALUES (${t.id}, ${t.ronda}, ${i.id}, ${i.texto}, ${i.critico}, ${nota ? "no_cumple" : "cumple"}, ${nota})`;
  }
  await auditarTramite(c, t, autor, "guardar_lista", { ronda: t.ronda, respondidos: items.length });
}

/** La constancia de los criterios de la ronda, como la deja el manejador: sin criterios no añade claves. */
const constanciaDeLaRonda = async ({ tx }: Contexto, t: FilaTramite) =>
  constanciaDeCriterios(await criteriosNoCumplen(t.id, t.ronda, { sql: tx }));

/** Solo sin observaciones: los dos trámites de la demo que llegan aquí no tuvieron ninguna. */
async function darConcepto(c: Contexto, t: FilaTramite, autor: Autor, concepto: string): Promise<FilaTramite> {
  const lista = await obtenerVerificacion(t.id, t.ronda, { sql: c.tx });
  const constancia = await constanciaDeLaRonda(c, t);
  return paso(c, t, { ...autor, accion: "concepto_favorable", detalle: { concepto, lista, observaciones: { total: 0, cerradas: 0 }, ...constancia } });
}

const aprobar = async (c: Contexto, t: FilaTramite, autor: Autor, concepto: string) =>
  paso(c, t, { ...autor, accion: "aprobar", detalle: { concepto, ...(await constanciaDeLaRonda(c, t)) } });

/** Lo que hace `publicarVersion` (flujo/cierre.ts): copia la evidencia a la versión, la publica y congela el acta. */
async function publicar(c: Contexto, t: FilaTramite, autor: Autor): Promise<FilaTramite> {
  const { tx, zona } = c;
  const { momento } = autor;
  const firmas = (await listarFirmas(t.id, { sql: tx })).filter((f) => f.ronda === t.ronda);
  const [elaboro, reviso, aprobo] = (["elaboro", "reviso", "aprobo"] as const).map((firma) => firmas.find((f) => f.firma === firma)!);
  const nombreYCargo = (f: FirmaRegistrada) => `${f.nombre} — ${f.cargo}`;
  const dia = (f: FirmaRegistrada) => fechaEnZona(f.creadoEn, zona);

  const anteriores = await tx`UPDATE documento_versiones SET estado = 'obsoleto'
    WHERE documento_id = ${t.documentoId} AND estado = 'vigente'
    RETURNING numero`;
  const [version] = await tx`UPDATE documento_versiones SET
      estado = 'vigente', origen_aprobacion = 'plataforma', publicado_en = ${momento},
      elaboro = ${nombreYCargo(elaboro)}, reviso = ${nombreYCargo(reviso)}, aprobo = ${nombreYCargo(aprobo)},
      fecha_elaboracion = ${dia(elaboro)}, fecha_revision = ${dia(reviso)}, fecha_aprobacion = ${dia(aprobo)}
    WHERE id = ${t.versionId}
    RETURNING numero`;
  await tx`UPDATE documentos SET actualizado_en = ${momento} WHERE id = ${t.documentoId}`;
  const obsoletas = anteriores.map((a) => a.numero as number);
  await auditar(c, autor, {
    accion: "publicar_version",
    entidad: "documento_version",
    entidadId: t.versionId as number,
    detalle: { documentoId: t.documentoId, numero: version.numero, obsoletas },
  });
  const acuses = await crearAcusesAlPublicar(tx, t.versionId as number, momento, [elaboro.usuarioId, reviso.usuarioId, aprobo.usuarioId, autor.quien.id]);
  return paso(c, t, {
    ...autor,
    accion: "publicar",
    detalle: {
      version: version.numero,
      obsoletas,
      huella: elaboro.hashSha256,
      acuses,
      acta: await congelarDatosActa(tx, t, "aprobacion", momento, Math.max(...obsoletas)),
    },
  });
}

/** Los avisos del paso en que quedó el trámite; los de los pasos ya hechos no le dicen nada a nadie. */
async function avisar(
  { tx }: Contexto,
  t: FilaTramite,
  actor: Persona,
  usuarioIds: number[],
  titulo: string,
): Promise<void> {
  const { texto } = await rotuloDeTramite(tx, t);
  await enviarAvisos(tx, t.id, actor.id, [{ usuarioIds, tipo: "tramite.paso", titulo, cuerpo: texto }]);
}

/** Cinco trámites, uno por etapa de la demostración (spec 13A §18.2 y §20), con fechas relativas al momento de sembrar. */
async function sembrarTramites(
  sql: Sql,
  { tipoPorSigla, procesoPorSigla, documentoPorCodigo }: {
    tipoPorSigla: Record<string, number>;
    procesoPorSigla: Record<string, number>;
    documentoPorCodigo: Record<string, number>;
  },
  ahora: Date,
): Promise<void> {
  console.log("Sembrando trámites…");
  const zona = zonaHoraria();
  /** Un instante de hace `dias` días en la zona: ocho horas antes de que acabara ese día, siempre en el pasado. */
  const hace = (dias: number) => momentoHace(dias, ahora);

  await sql.begin(async (tx) => {
    const config = await obtenerConfigDocumental({ sql: tx });
    const c: Contexto = { tx, config, zona, anio: Number(fechaEnZona(ahora, zona).slice(0, 4)) };
    const usuarios = await tx`SELECT id, usuario, rol FROM usuarios`;
    const persona = (usuario: string): Persona => {
      const u = usuarios.find((f) => f.usuario === usuario);
      if (!u) throw new Error(`Usuario demo no encontrado: ${usuario}`);
      return { id: Number(u.id), rol: u.rol };
    };
    const coordinadora = persona("coordinadora.sgc");
    const gerente = persona("gerente");
    const liderGth = persona("lider.gth");
    const liderCex = persona("lider.cex");
    const consulta = persona("consulta");

    // Publicado por trámite, con sus cuatro firmas: la caracterización es estratégica, aprueba Gerencia.
    let t = await solicitar(c, {
      quien: liderGth,
      momento: hace(20),
      consecutivo: 1,
      tipo: "modificar",
      motivo: "revision_anual",
      justificacion: "Revisión anual: los indicadores y las actividades del proceso ya no corresponden a la operación actual.",
      documentoId: documentoPorCodigo["GTH-CA-01"],
    });
    t = await aceptar(c, t, { quien: coordinadora, momento: hace(19) }, { elaborador: liderGth, revisor: coordinadora, aprobador: gerente });
    t = await elaborar(c, t, { quien: liderGth, momento: hace(15) }, {
      controlCambios: "Se actualizan los indicadores del proceso y las actividades del ciclo PHVA.",
    });
    await responderLista(c, t, { quien: coordinadora, momento: hace(13) }, {
      8: "Nombra los registros del proceso, pero aún no dice dónde se archivan: se completará en la próxima revisión anual.",
    });
    t = await darConcepto(c, t, { quien: coordinadora, momento: hace(12) }, "Favorable, con un criterio aceptado que no afecta la operación del proceso; listo para aprobación.");
    t = await aprobar(c, t, { quien: gerente, momento: hace(10) }, "Aprobada: los indicadores responden a la planeación institucional.");
    await publicar(c, t, { quien: coordinadora, momento: hace(9) });

    // En revisión, ronda 2: la revisora devolvió con dos observaciones y quien elabora ya las atendió.
    t = await solicitar(c, {
      quien: liderGth,
      momento: hace(12),
      consecutivo: 2,
      tipo: "modificar",
      motivo: "mejora",
      justificacion: "El personal asistencial pide una inducción propia de cada servicio, además de la institucional.",
      documentoId: documentoPorCodigo["GTH-PR-02"],
    });
    t = await aceptar(c, t, { quien: coordinadora, momento: hace(11) }, { elaborador: liderGth, revisor: coordinadora, aprobador: coordinadora });
    t = await elaborar(c, t, { quien: liderGth, momento: hace(8) }, {
      controlCambios: "Se añade la inducción específica por servicio.",
      nota: " (primer borrador)",
    });
    const revisora: Autor = { quien: coordinadora, momento: hace(7) };
    const observacion1 = "Cita la Resolución 2003 de 2014, que ya fue derogada: actualice la referencia de habilitación.";
    const observacion2 = "No dice quién conserva el registro de asistencia a la inducción ni por cuánto tiempo.";
    await responderLista(c, t, revisora, { 7: observacion1, 8: observacion2 });
    for (const [i, texto] of [observacion1, observacion2].entries()) {
      await tx`INSERT INTO tramite_observaciones (tramite_id, numero, ronda, origen, texto, autor_id, creado_en)
        VALUES (${t.id}, ${i + 1}, ${t.ronda}, 'revision', ${texto}, ${coordinadora.id}, ${revisora.momento})`;
      await auditarTramite(c, t, revisora, "crear_observacion", { ronda: t.ronda, observacion: i + 1 });
    }
    t = await paso(c, t, { quien: coordinadora, momento: hace(6), accion: "devolver_revision", detalle: { observaciones: [1, 2] } });

    const respuestas = [
      "Se cambió la referencia por la Resolución 3100 de 2019.",
      "Se añadió la sección de registros: los conserva Talento Humano en la historia laboral.",
    ];
    const elabora: Autor = { quien: liderGth, momento: hace(3) };
    for (const [i, respuesta] of respuestas.entries()) {
      await tx`UPDATE tramite_observaciones
        SET respuesta = ${respuesta}, respondida_por = ${liderGth.id}, respondida_en = ${elabora.momento}, estado = 'atendida'
        WHERE tramite_id = ${t.id} AND numero = ${i + 1}`;
      await auditarTramite(c, t, elabora, "responder_observacion", { ronda: t.ronda, observacion: i + 1 });
    }
    t = await elaborar(c, t, { quien: liderGth, momento: hace(2) }, {
      controlCambios: "Se añade la inducción específica por servicio y se define quién conserva el registro de asistencia.",
      nota: " (segundo borrador)",
    });
    const cierra: Autor = { quien: coordinadora, momento: hace(1) };
    await tx`UPDATE tramite_observaciones SET estado = 'cerrada', cerrada_por = ${coordinadora.id}, cerrada_en = ${cierra.momento}
      WHERE tramite_id = ${t.id} AND numero = 1`;
    await auditarTramite(c, t, cierra, "cerrar_observacion", { ronda: t.ronda, observacion: 1 });
    await avisar(c, t, liderGth, [coordinadora.id], `Solicitud ${t.numero}: le toca revisar`);

    // Espera «Publicar» con el plazo vencido hace dos días. GBS no tiene líder: el visto bueno se omitió.
    t = await solicitar(c, {
      quien: coordinadora,
      momento: hace(14),
      consecutivo: 3,
      tipo: "modificar",
      motivo: "cambio_normativo",
      justificacion: "La normativa de equipos biomédicos cambió la periodicidad del mantenimiento preventivo.",
      documentoId: documentoPorCodigo["GBS-PR-01"],
    });
    t = await aceptar(c, t, { quien: coordinadora, momento: hace(13) }, { elaborador: consulta, revisor: liderGth, aprobador: coordinadora });
    t = await elaborar(c, t, { quien: consulta, momento: hace(10) }, {
      controlCambios: "Se ajusta la periodicidad del mantenimiento preventivo y las hojas de vida de los equipos.",
    });
    await responderLista(c, t, { quien: liderGth, momento: hace(8) });
    t = await darConcepto(c, t, { quien: liderGth, momento: hace(7) }, "Cumple la lista de verificación; listo para aprobación.");
    // El plazo de la publicación corre desde que se aprueba: la demostración necesita el aviso de vencido.
    await aprobar(c, t, { quien: coordinadora, momento: hace(config.plazos.publicacion + 2) }, "Aprobada: se publica con la nueva periodicidad.");

    // Por aceptar y vence hoy: la pide el líder, así que el visto bueno quedó dado.
    t = await solicitar(c, {
      quien: liderCex,
      momento: hace(config.plazos.aceptacion),
      consecutivo: 4,
      tipo: "crear",
      motivo: "solicitud_personal",
      justificacion: "Consulta Externa no tiene dónde dejar constancia del consentimiento en los procedimientos menores.",
      procesoId: procesoPorSigla.CEX,
      tipoDocumentoId: tipoPorSigla.FO,
      tituloPropuesto: "Consentimiento informado de procedimientos menores",
    });
    await avisar(c, t, liderCex, await adminsActivos({ sql: tx }), `Solicitud ${t.numero} por aceptar`);

    // Espera el visto bueno del líder de Consulta Externa.
    t = await solicitar(c, {
      quien: coordinadora,
      momento: hace(1),
      consecutivo: 5,
      tipo: "eliminar",
      motivo: "cambio_normativo",
      justificacion: "La institución adoptó la guía de práctica clínica nacional: esta guía propia ya no se usa.",
      documentoId: documentoPorCodigo["CEX-GU-01"],
    });
    await avisar(c, t, coordinadora, [liderCex.id], `Solicitud ${t.numero} espera su visto bueno`);
  });
}
