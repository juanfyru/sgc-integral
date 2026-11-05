/**
 * Semilla demo: el mapa de procesos real (validado por el usuario, ver
 * PLAN.md Apéndice A) + documentos ficticios pero verosímiles que cubren
 * todos los casos del modelo (asociaciones M:N con principal, relaciones
 * procedimiento↔formato, archivos multi-rol y los cuatro estados), más una
 * estructura organizacional y un usuario de ejemplo por rol.
 *
 * Ejecutar: npm run db:seed   (borra y recarga TODO — solo desarrollo/demo)
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { rutaBaseAlmacen } from "../../lib/almacen";
import { hashearClave } from "../../lib/clave";
import * as e from "../esquema";
import { generarPlaceholder } from "../placeholders";
import { limpiarTodo, sembrarBase, type Db } from "./minima";

export const CLAVE_DEMO = "Demo-SGC-2026-clave";
const NOMBRE_ENTIDAD = "ESE Hospital Nuestra Señora de Fátima de Suaza";
const LOGO_DEMO = path.join("src", "db", "semillas", "recursos", "logo-demo.png");

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

/** Documentos de la demo con acceso restringido (spec §5.3). */
const CODIGOS_RESTRINGIDOS: ReadonlySet<string> = new Set(["GTH-FO-01"]);

export async function sembrarDemo(db: Db): Promise<void> {
  await limpiarTodo(db);
  const { tipoPorSigla } = await sembrarBase(db);
  const almacen = rutaBaseAlmacen();

  await db
    .update(e.configuracion)
    .set({ valor: NOMBRE_ENTIDAD })
    .where(eq(e.configuracion.clave, "nombre_entidad"));
  await db
    .update(e.configuracion)
    .set({ valor: "HNSF" })
    .where(eq(e.configuracion.clave, "sigla_entidad"));
  await sembrarLogoDemo(db, almacen);
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

  const MIMES: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

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
    archivos: { rol: "principal" | "editable" | "anexo"; ext: "pdf" | "docx" | "xlsx" }[];
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
      versiones: [v1Vigente("Diana Patricia Losada — Coordinadora de Talento Humano")],
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
      versiones: [v1Vigente("Hernán Darío Ceballos — Médico Coordinador")],
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
      versiones: [v1Vigente("Sandra Milena Artunduaga — Enfermera Jefe de Urgencias", [{ rol: "principal", ext: "pdf" }, { rol: "editable", ext: "docx" }])],
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
        // El rol distingue archivos de la misma versión y extensión (p. ej.
        // principal PDF + anexo PDF) sin colisión de ruta.
        const nombreArchivo =
          a.rol === "principal"
            ? `${def.codigo.toLowerCase()}-v${v.numero}.${a.ext}`
            : `${def.codigo.toLowerCase()}-v${v.numero}-${a.rol}.${a.ext}`;
        const ruta = `${def.codigo}/v${v.numero}/${nombreArchivo}`;

        const contenido = await generarPlaceholder({
          codigo: def.codigo,
          titulo: def.titulo,
          numeroVersion: v.numero,
          ext: a.ext,
          entidad: NOMBRE_ENTIDAD,
        });
        const destino = path.join(almacen, ...ruta.split("/"));
        await mkdir(path.dirname(destino), { recursive: true });
        await writeFile(destino, contenido);

        await db.insert(e.archivos).values({
          versionId: version.id,
          rol: a.rol,
          ruta,
          nombreOriginal: `${def.codigo} ${def.titulo} v${v.numero}.${a.ext}`,
          extension: a.ext,
          mime: MIMES[a.ext],
          tamanoBytes: contenido.length,
          hashSha256: createHash("sha256").update(contenido).digest("hex"),
        });
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


  await sembrarEstructuraYUsuarios(db, procesoPorSigla);
}

/** Áreas, cargos con su jerarquía y un usuario de ejemplo por rol (el admin no se siembra). */
async function sembrarEstructuraYUsuarios(
  db: Db,
  procesoPorSigla: Record<string, number>,
): Promise<void> {
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
    proceso?: string;
  }[] = [
    { usuario: "gerente", nombre: "Gerente de ejemplo", rol: "gerencia", cargo: "Gerente" },
    { usuario: "control.interno", nombre: "Control Interno de ejemplo", rol: "control_interno", cargo: "Jefe de Control Interno" },
    { usuario: "lider.gth", nombre: "Líder de Talento Humano de ejemplo", rol: "lider_proceso", cargo: "Coordinadora de Talento Humano", proceso: "GTH" },
    { usuario: "lider.cex", nombre: "Líder de Consulta Externa de ejemplo", rol: "lider_proceso", cargo: "Médico Coordinador", proceso: "CEX" },
    { usuario: "consulta", nombre: "Usuario de consulta de ejemplo", rol: "consulta", cargo: "Auxiliar de Enfermería" },
  ];
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
        aceptoDatosEn: new Date(),
      })
      .returning();
    await db.insert(e.notificaciones).values({
      usuarioId: fila.id,
      tipo: "bienvenida",
      titulo: "Bienvenida al SGC Integral",
      cuerpo: "Explore el mapa de procesos y revise su cuenta en Mi cuenta.",
      enlace: "/cuenta",
    });
    if (u.proceso) {
      await db
        .insert(e.usuarioProcesos)
        .values({ usuarioId: fila.id, procesoId: procesoPorSigla[u.proceso] });
    }
  }
}
