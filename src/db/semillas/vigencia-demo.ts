/**
 * La vigencia de la demo (spec 13C §17): la carga inicial con su próxima revisión fijada y dos ratificaciones de meses
 * atrás, cuatro documentos externos con su PDF, el normograma con doce normas colombianas reales (la Resolución 2003 de
 * 2014 derogada por la 3100 de 2019, con sus impactos) y la revisión anual del año, abierta hace una semana. El contenido
 * de las normas es ilustrativo: la entidad registra las suyas.
 *
 * Todo pasa por las funciones del dominio, cada paso con la hora en que ocurrió (`opciones.ahora`) y las firmas con la
 * clave de la demo (`firmaDeLaDemo`). La única escritura directa es el archivo principal de cada edición, subido antes de
 * adoptarla (`subirPrincipal`): `registrarArchivo` no recibe la hora del paso. La bitácora que escriben las funciones
 * lleva la hora de la siembra: `registrarAuditoria` tampoco la recibe.
 *
 * El orden del código importa además del de las fechas: los actos leen la revisión anual abierta cuando corren. Todo lo
 * anterior a la campaña va antes de `abrirRevision` y lo de la campaña (el normograma de GTH, la solicitud de CEX) después.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";
import { resolverRutaAlmacen } from "../../lib/almacen";
import type { Verificador } from "../../lib/firma";
import { fechaEnZona, fechaLimite } from "../../lib/tramites/plazos";
import { zonaHoraria } from "../../lib/zona-horaria";
import type { SesionFlujo } from "../consultas/flujo/contrato";
import { asociarProceso, enlazarDocumento } from "../consultas/normograma/asociaciones";
import { resolverImpacto } from "../consultas/normograma/impactos";
import { crearNorma } from "../consultas/normograma/normas";
import { registrarRelacion } from "../consultas/normograma/relaciones";
import { crearSolicitud } from "../consultas/tramites-flujo";
import {
  abrirEdicion,
  adoptarEdicion,
  registrarExterno,
  registrarVerificacion,
  type DatosExterno,
} from "../consultas/vigencia/externos";
import { ratificar } from "../consultas/vigencia/ratificaciones";
import { abrirRevision, confirmarNormograma } from "../consultas/vigencia/revision-anual";
import { fijarProximaRevision } from "../consultas/vigencia/semaforo";
import { generarPlaceholder } from "../placeholders";
import { CLAVE_DEMO } from "./clave-demo";
import { sesionDe, type ContextoDistribucion } from "./distribucion-demo";

/** La firma de la semilla: acepta la clave de la demo sin tocar `accesos` (los tests usan su propia `firmaDePrueba`). */
const firmaDeLaDemo: Verificador = async (_sesion, credenciales) =>
  credenciales.clave === CLAVE_DEMO
    ? { ok: true, metodo: "clave" }
    : { ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false };

const FIRMA = { clave: CLAVE_DEMO };

const minutosDespues = (instante: Date, minutos: number) => new Date(instante.getTime() + minutos * 60_000);

type Norma = {
  tipo: "Ley" | "Decreto" | "Resolución";
  numero: string;
  anio: number;
  fechaExpedicion: string;
  entidadEmisora: string;
  titulo: string;
  tema: string;
  /** Los procesos a los que aplica, con su requisito. */
  procesos: Record<string, string>;
  /** Los documentos de la demo que la citan. */
  documentos: string[];
};

const MINSALUD = "Ministerio de Salud y Protección Social";
const CONGRESO = "Congreso de la República";
const MINTRABAJO = "Ministerio del Trabajo";

/**
 * Las doce normas del spec 13C §17. La 2003 de 2014 solo se asocia a SOG y se enlaza a `CEX-GU-01`: su derogación abre
 * exactamente dos impactos, el de la guía en Consulta Externa y el del proceso SOG, que no tiene documentos enlazados.
 */
const NORMAS: Norma[] = [
  {
    tipo: "Ley", numero: "100", anio: 1993, fechaExpedicion: "1993-12-23", entidadEmisora: CONGRESO,
    titulo: "Por la cual se crea el sistema de seguridad social integral y se dictan otras disposiciones",
    tema: "Sistema General de Seguridad Social en Salud",
    procesos: {
      GES: "La ESE presta sus servicios dentro del Sistema General de Seguridad Social en Salud.",
      ATU: "Derechos y deberes de los afiliados en el acceso a los servicios de salud.",
    },
    documentos: ["GES-PL-01"],
  },
  {
    tipo: "Ley", numero: "1438", anio: 2011, fechaExpedicion: "2011-01-19", entidadEmisora: CONGRESO,
    titulo: "Por medio de la cual se reforma el Sistema General de Seguridad Social en Salud y se dictan otras disposiciones",
    tema: "Reforma del sistema de salud y atención primaria en salud",
    procesos: {
      GES: "Gestión de la ESE con enfoque de atención primaria y redes integradas de servicios.",
      PYM: "Acciones de promoción de la salud y prevención de la enfermedad en la atención primaria.",
    },
    documentos: ["PYM-PR-01"],
  },
  {
    tipo: "Decreto", numero: "780", anio: 2016, fechaExpedicion: "2016-05-06", entidadEmisora: MINSALUD,
    titulo: "Por medio del cual se expide el Decreto Único Reglamentario del Sector Salud y Protección Social",
    tema: "Reglamentación del sector salud; Sistema Obligatorio de Garantía de Calidad de la Atención en Salud",
    procesos: {
      SOG: "Sistema Obligatorio de Garantía de Calidad de la Atención en Salud y sus cuatro componentes.",
      GES: "Organización y funcionamiento de la ESE como prestador de servicios de salud.",
    },
    documentos: ["SOG-PO-01"],
  },
  {
    tipo: "Resolución", numero: "3100", anio: 2019, fechaExpedicion: "2019-11-25", entidadEmisora: MINSALUD,
    titulo:
      "Por la cual se definen los procedimientos y condiciones de inscripción de los prestadores de servicios de salud y de " +
      "habilitación de los servicios de salud y se adopta el Manual de Inscripción de Prestadores y Habilitación de Servicios de Salud",
    tema: "Habilitación de servicios de salud",
    procesos: {
      SOG: "Estándares de habilitación de los servicios que presta la ESE y su autoevaluación.",
      GTH: "Estándar de talento humano: soportes de la idoneidad del personal asistencial.",
      AIN: "Condiciones de habilitación del servicio de urgencias y de la atención del parto.",
    },
    documentos: ["GTH-FO-01"],
  },
  {
    tipo: "Resolución", numero: "2003", anio: 2014, fechaExpedicion: "2014-05-28", entidadEmisora: MINSALUD,
    titulo:
      "Por la cual se definen los procedimientos y condiciones de inscripción de los Prestadores de Servicios de Salud y de " +
      "habilitación de servicios de salud",
    tema: "Habilitación de servicios de salud (régimen anterior)",
    procesos: { SOG: "Condiciones de habilitación de los servicios, en el texto anterior a la Resolución 3100 de 2019." },
    documentos: ["CEX-GU-01"],
  },
  {
    tipo: "Resolución", numero: "256", anio: 2016, fechaExpedicion: "2016-02-05", entidadEmisora: MINSALUD,
    titulo:
      "Por la cual se dictan disposiciones en relación con el Sistema de Información para la Calidad y se establecen los " +
      "indicadores para el monitoreo de la calidad en salud",
    tema: "Indicadores de calidad en salud",
    procesos: {
      SOG: "Reporte de los indicadores del Sistema de Información para la Calidad.",
      SGC: "Indicadores de calidad que alimentan la revisión por la dirección.",
    },
    documentos: ["SOG-PL-01"],
  },
  {
    tipo: "Resolución", numero: "1995", anio: 1999, fechaExpedicion: "1999-07-08", entidadEmisora: "Ministerio de Salud",
    titulo: "Por la cual se establecen normas para el manejo de la Historia Clínica",
    tema: "Historia clínica",
    procesos: {
      AIN: "Diligenciamiento de la historia clínica en la atención de urgencias y en la remisión de pacientes.",
      GDO: "Custodia y conservación del archivo de historias clínicas.",
    },
    documentos: ["AIN-PR-01", "AIN-FO-01"],
  },
  {
    tipo: "Ley", numero: "1581", anio: 2012, fechaExpedicion: "2012-10-17", entidadEmisora: CONGRESO,
    titulo: "Por la cual se dictan disposiciones generales para la protección de datos personales",
    tema: "Protección de datos personales",
    procesos: {
      GIC: "Tratamiento y seguridad de los datos personales de usuarios y funcionarios.",
      ATU: "Autorización del tratamiento de los datos de los usuarios.",
    },
    documentos: ["GIC-IN-01"],
  },
  {
    tipo: "Ley", numero: "527", anio: 1999, fechaExpedicion: "1999-08-18", entidadEmisora: CONGRESO,
    titulo:
      "Por medio de la cual se define y reglamenta el acceso y uso de los mensajes de datos, del comercio electrónico y de las " +
      "firmas digitales, y se establecen las entidades de certificación y se dictan otras disposiciones",
    tema: "Mensajes de datos y firma electrónica",
    procesos: {
      GIC: "Validez de los mensajes de datos y de la firma electrónica en los sistemas de información.",
      SGC: "Firma electrónica de los documentos del sistema de gestión en la plataforma.",
    },
    documentos: ["SGC-PR-01"],
  },
  {
    tipo: "Decreto", numero: "1072", anio: 2015, fechaExpedicion: "2015-05-26", entidadEmisora: MINTRABAJO,
    titulo: "Por medio del cual se expide el Decreto Único Reglamentario del Sector Trabajo",
    tema: "Sistema de Gestión de la Seguridad y Salud en el Trabajo",
    procesos: { GTH: "Implementación del Sistema de Gestión de la Seguridad y Salud en el Trabajo." },
    documentos: ["GTH-PR-02"],
  },
  {
    tipo: "Resolución", numero: "0312", anio: 2019, fechaExpedicion: "2019-02-13", entidadEmisora: MINTRABAJO,
    titulo: "Por la cual se definen los Estándares Mínimos del Sistema de Gestión de la Seguridad y Salud en el Trabajo SG-SST",
    tema: "Estándares mínimos del SG-SST",
    procesos: { GTH: "Autoevaluación anual de los estándares mínimos del SG-SST y su plan de mejora." },
    // Su externo, `GTH-DE-01`, se enlaza al registrarlo.
    documentos: [],
  },
  {
    tipo: "Ley", numero: "594", anio: 2000, fechaExpedicion: "2000-07-14", entidadEmisora: CONGRESO,
    titulo: "Por medio de la cual se dicta la Ley General de Archivos y se dictan otras disposiciones",
    tema: "Gestión documental y archivos",
    procesos: {
      GDO: "Organización de los archivos de gestión y aplicación de las tablas de retención documental.",
      SGC: "Conservación de la información documentada del sistema de gestión.",
    },
    documentos: ["GDO-PR-01", "GDO-FO-01"],
  },
];

const nombreDe = (n: Pick<Norma, "tipo" | "numero" | "anio">) => `${n.tipo} ${n.numero} de ${n.anio}`;

/** Los documentos «fuera» que la carga inicial no deja con fecha fijada: los dos vencidos y el que va a 83 días. */
const SIN_FECHA_DE_CARGA = ["GTH-PR-01", "AIN-FO-01", "SGC-PR-01"];

/** Los plazos, en días desde hoy, con que la coordinadora reparte la próxima revisión de la carga inicial. */
const PLAZOS_DE_CARGA = [120, 180, 240, 300];

export async function sembrarVigencia(sql: Sql, c: ContextoDistribucion & { ahora: Date }): Promise<void> {
  console.log("Sembrando vigencia, externos, normograma y revisión anual…");
  const zona = zonaHoraria();
  /** La regla de las demás semillas: ocho horas antes de que acabara el día de hace `dias` días. */
  const hace = (dias: number) => new Date(fechaLimite(c.ahora, -dias, zona).getTime() - 8 * 3_600_000);
  /** El día, `yyyy-mm-dd`, que cae `dias` días después de hoy. */
  const diaEn = (dias: number) => fechaEnZona(fechaLimite(c.ahora, dias, zona), zona);
  const [{ valor: entidad }] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombre_entidad'`;

  const coordinadora = await sesionDe(sql, "coordinadora.sgc");
  const liderGth = await sesionDe(sql, "lider.gth");
  const liderCex = await sesionDe(sql, "lider.cex");
  const documento = (codigo: string) => {
    const id = c.documentoPorCodigo[codigo];
    if (!id) throw new Error(`Documento demo no encontrado: ${codigo}`);
    return id;
  };
  const subproceso = async (sigla: string, slug: string) => {
    const [s] = await sql`SELECT s.id FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id WHERE p.sigla = ${sigla} AND s.slug = ${slug}`;
    if (!s) throw new Error(`Subproceso demo no encontrado: ${sigla}/${slug}`);
    return Number(s.id);
  };

  /**
   * El PDF principal de una edición en borrador, en el almacén y con su fila, como lo deja la subida de la página del
   * externo (`documentos/<código>/v<n>/`), con la hora del paso.
   */
  async function subirPrincipal(
    d: { versionId: number; codigo: string; numero: number; titulo: string; edicion: string; archivo: string },
    quien: SesionFlujo,
    momento: Date,
  ): Promise<void> {
    const contenido = await generarPlaceholder({
      codigo: d.codigo,
      titulo: `${d.titulo} (edición ${d.edicion})`,
      numeroVersion: d.numero,
      ext: "pdf",
      entidad,
    });
    const ruta = `documentos/${d.codigo}/v${d.numero}/${d.archivo}`;
    const destino = resolverRutaAlmacen(ruta);
    if (!destino) throw new Error(`Ruta de almacén inválida: ${ruta}`);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, contenido);
    const [a] = await sql`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256, creado_en)
      VALUES (${d.versionId}, 'principal', ${ruta}, ${d.archivo}, 'pdf', 'application/pdf', ${contenido.length},
              ${createHash("sha256").update(contenido).digest("hex")}, ${momento})
      RETURNING id`;
    await sql`INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle, creado_en)
      VALUES (${quien.usuarioId}, 'subir_archivo', 'archivo', ${a.id},
              ${sql.json({ versionId: d.versionId, rol: "principal", nombre: d.archivo })}, ${momento})`;
  }

  /** Registra el externo, sube el PDF de su primera edición y la adopta con firma, sin acuses (es un alta). */
  async function altaDeExterno(
    quien: SesionFlujo,
    datos: DatosExterno,
    archivo: string,
    momento: Date,
  ): Promise<{ documentoId: number; codigo: string }> {
    const { documentoId, versionId, codigo } = await registrarExterno(quien, datos, { sql, ahora: momento });
    const titulo = datos.titulo;
    await subirPrincipal({ versionId, codigo, numero: 1, titulo, edicion: datos.edicion, archivo }, quien, minutosDespues(momento, 10));
    await adoptarEdicion(
      quien,
      { versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: FIRMA },
      { sql, ahora: minutosDespues(momento, 20), verificar: firmaDeLaDemo },
    );
    return { documentoId, codigo };
  }

  const sinOtros = { otrosProcesos: [], nivelAcceso: "general" as const, verificacionMeses: 12 };

  // ── Externos de antes del normograma ─────────────────────────────────────────────────────────────────────────────
  // La guía nacional de HTA, adoptada hace 15 meses y verificada hace nueve: al día, con la verificación vigente.
  const { documentoId: guiaHta } = await altaDeExterno(
    liderCex,
    {
      ...sinOtros,
      titulo: "Guía de práctica clínica de hipertensión arterial primaria",
      procesoId: c.procesoPorSigla.CEX,
      subprocesoId: await subproceso("CEX", "medicina-general"),
      descripcion: "Guía nacional adoptada para el diagnóstico, el tratamiento y el seguimiento del paciente hipertenso en la consulta externa.",
      palabrasClave: "hipertension arterial HTA guia practica clinica ministerio",
      entidadEmisora: MINSALUD,
      tituloOriginal: "Guía de práctica clínica: hipertensión arterial primaria (HTA)",
      fuenteOficial: "Repositorio de guías de práctica clínica del Ministerio de Salud y Protección Social",
      responsableId: liderCex.usuarioId,
      normaId: null,
      edicion: "2017",
      fechaEdicion: null,
    },
    "guia-practica-clinica-hta-2017.pdf",
    hace(450),
  );
  await registrarVerificacion(
    liderCex,
    {
      documentoId: guiaHta,
      resultado: "vigente",
      fuente: "Repositorio de guías de práctica clínica del Ministerio de Salud y Protección Social",
      nota: "Sigue publicada como la edición vigente; no hay actualización anunciada.",
    },
    { sql, ahora: hace(270) },
  );

  // El manual del fabricante de la bomba de infusión, adoptado hace 17 meses y nunca verificado: vencido.
  await altaDeExterno(
    coordinadora,
    {
      ...sinOtros,
      titulo: "Manual de usuario de la bomba de infusión volumétrica",
      procesoId: c.procesoPorSigla.ATE,
      subprocesoId: await subproceso("ATE", "farmacia"),
      descripcion: "Manual del fabricante para programar, usar con seguridad y cuidar las bombas de infusión de los servicios.",
      palabrasClave: "bomba infusion manual usuario fabricante equipo biomedico",
      entidadEmisora: "Equipos Biomédicos de Ejemplo S.A.S. (fabricante ficticio)",
      tituloOriginal: "Manual de usuario: bomba de infusión volumétrica, modelo de ejemplo",
      fuenteOficial: "Portal de soporte técnico del fabricante",
      responsableId: c.usuarioPorNombre["regente.farmacia"],
      normaId: null,
      edicion: "rev. 4.2",
      fechaEdicion: null,
    },
    "manual-bomba-infusion-rev-4-2.pdf",
    hace(520),
  );

  // La Resolución 3100 como texto de trabajo: la edición «2019» quedó obsoleta al adoptar la corregida hace cinco meses.
  const datosResolucion: DatosExterno = {
    ...sinOtros,
    titulo: "Resolución 3100 de 2019: texto de trabajo del manual de habilitación",
    procesoId: c.procesoPorSigla.SOG,
    subprocesoId: await subproceso("SOG", "sistema-unico-de-habilitacion"),
    descripcion:
      "Copia de trabajo de la Resolución 3100 de 2019 y su Manual de Inscripción de Prestadores y Habilitación de Servicios de " +
      "Salud, para la autoevaluación de los estándares.",
    palabrasClave: "habilitacion resolucion 3100 estandares manual inscripcion prestadores",
    entidadEmisora: MINSALUD,
    tituloOriginal: "Resolución 3100 de 2019: Manual de Inscripción de Prestadores y Habilitación de Servicios de Salud",
    fuenteOficial: "Normativa publicada por el Ministerio de Salud y Protección Social",
    responsableId: coordinadora.usuarioId,
    normaId: null,
    edicion: "2019",
    fechaEdicion: "2019-11-25",
  };
  const { documentoId: resolucion, codigo: codigoResolucion } = await altaDeExterno(
    coordinadora,
    datosResolucion,
    "resolucion-3100-2019.pdf",
    hace(800),
  );
  const corregida = { edicion: "2019, corr.", momento: hace(150) };
  const { versionId: versionCorregida } = await abrirEdicion(
    coordinadora,
    resolucion,
    {
      edicion: corregida.edicion,
      fechaEdicion: null,
      resumenCambios: "Copia con la fe de erratas del Ministerio incorporada; reemplaza la copia de trabajo anterior.",
    },
    { sql, ahora: corregida.momento },
  );
  await subirPrincipal(
    {
      versionId: versionCorregida,
      codigo: codigoResolucion,
      numero: 2,
      titulo: datosResolucion.titulo,
      edicion: corregida.edicion,
      archivo: "resolucion-3100-2019-corregida.pdf",
    },
    coordinadora,
    minutosDespues(corregida.momento, 10),
  );
  await adoptarEdicion(
    coordinadora,
    { versionId: versionCorregida, pedirAcuses: false, requiereSocializacion: false, credenciales: FIRMA },
    { sql, ahora: minutosDespues(corregida.momento, 20), verificar: firmaDeLaDemo },
  );

  // ── Normograma: la carga de hace tres meses ──────────────────────────────────────────────────────────────────────
  const carga = hace(90);
  const tipos = await sql`SELECT id, nombre FROM tipos_norma`;
  const tipoDe = (nombre: string) => Number(tipos.find((t) => t.nombre === nombre)!.id);
  const normaPorNombre: Record<string, number> = {};
  for (const n of NORMAS) {
    const { id } = await crearNorma(
      coordinadora,
      {
        tipoNormaId: tipoDe(n.tipo),
        numero: n.numero,
        anio: n.anio,
        fechaExpedicion: n.fechaExpedicion,
        entidadEmisora: n.entidadEmisora,
        titulo: n.titulo,
        tema: n.tema,
        enlaceOficial: null,
        notas: null,
      },
      { sql, ahora: carga },
    );
    normaPorNombre[nombreDe(n)] = id;
    for (const [sigla, requisito] of Object.entries(n.procesos)) {
      await asociarProceso(coordinadora, { normaId: id, procesoId: c.procesoPorSigla[sigla], requisito }, { sql, ahora: carga });
    }
    for (const codigo of n.documentos) {
      await enlazarDocumento(coordinadora, { normaId: id, documentoId: documento(codigo) }, { sql, ahora: carga });
    }
  }
  await enlazarDocumento(coordinadora, { normaId: normaPorNombre["Resolución 3100 de 2019"], documentoId: resolucion }, { sql, ahora: carga });
  await registrarRelacion(
    coordinadora,
    {
      normaId: normaPorNombre["Resolución 3100 de 2019"],
      afectadaId: normaPorNombre["Decreto 780 de 2016"],
      tipo: "reglamenta",
      detalle: "Reglamenta el Sistema Único de Habilitación del Sistema Obligatorio de Garantía de Calidad.",
    },
    { sql, ahora: carga },
  );

  // Los estándares mínimos del SG-SST, registrados por el líder de Talento Humano hace dos meses, ya enlazados a su norma.
  await altaDeExterno(
    liderGth,
    {
      ...sinOtros,
      titulo: "Estándares mínimos del Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST)",
      procesoId: c.procesoPorSigla.GTH,
      subprocesoId: await subproceso("GTH", "seguridad-y-salud-en-el-trabajo"),
      descripcion: "Estándares mínimos que la entidad cumple en su SG-SST y la tabla de valores de su autoevaluación anual.",
      palabrasClave: "SG-SST estandares minimos seguridad salud trabajo autoevaluacion",
      entidadEmisora: MINTRABAJO,
      tituloOriginal: "Resolución 0312 de 2019: Estándares Mínimos del SG-SST",
      fuenteOficial: "Normativa publicada por el Ministerio del Trabajo",
      responsableId: liderGth.usuarioId,
      normaId: normaPorNombre["Resolución 0312 de 2019"],
      edicion: "2019",
      fechaEdicion: "2019-02-13",
    },
    "estandares-minimos-sg-sst-2019.pdf",
    hace(60),
  );

  // ── Ratificaciones de meses atrás ────────────────────────────────────────────────────────────────────────────────
  // Hace ocho meses: fuera de la ventana de la revisión anual, Consulta Externa la vuelve a revisar en la campaña.
  await ratificar(
    liderCex,
    { documentoId: documento("CEX-CA-01"), nota: "Revisada con el equipo de consulta externa: sigue vigente sin cambios.", credenciales: FIRMA },
    { sql, ahora: hace(240), verificar: firmaDeLaDemo },
  );
  // Hace cuatro meses: dentro de la ventana, entra a la revisión como revisada recientemente.
  await ratificar(
    liderGth,
    {
      documentoId: documento("GTH-FO-01"),
      nota: "La lista de chequeo sigue respondiendo a los requisitos de vinculación: sin cambios.",
      credenciales: FIRMA,
    },
    { sql, ahora: hace(120), verificar: firmaDeLaDemo },
  );

  // ── Carga inicial: la coordinadora reparte la próxima revisión de lo aprobado fuera ────────────────────────────────
  const fijada = hace(40);
  const deLaCarga = await sql`
    SELECT d.id FROM documentos d
    JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente' AND v.origen_aprobacion = 'fuera'
    WHERE d.origen = 'interno' AND d.codigo <> ALL(${SIN_FECHA_DE_CARGA})
      AND NOT EXISTS (SELECT 1 FROM ratificaciones r WHERE r.version_id = v.id)
    ORDER BY d.codigo`;
  for (const [i, plazo] of PLAZOS_DE_CARGA.entries()) {
    const documentoIds = deLaCarga.filter((_, j) => j % PLAZOS_DE_CARGA.length === i).map((f) => Number(f.id));
    if (documentoIds.length === 0) continue;
    await fijarProximaRevision(coordinadora, { documentoIds, fecha: diaEn(plazo), nota: "Carga inicial" }, { sql, ahora: fijada });
  }
  // A 83 días: dentro de los 90 de aviso, sale en atención.
  await fijarProximaRevision(
    coordinadora,
    {
      documentoIds: [documento("SGC-PR-01")],
      fecha: diaEn(83),
      nota: "Carga inicial: se revisa junto con la puesta en marcha de la plataforma",
    },
    { sql, ahora: minutosDespues(fijada, 30) },
  );

  // ── La derogación de la Resolución 2003 de 2014, registrada hace nueve días ─────────────────────────────────────────
  const { cambioId } = await registrarRelacion(
    coordinadora,
    {
      normaId: normaPorNombre["Resolución 3100 de 2019"],
      afectadaId: normaPorNombre["Resolución 2003 de 2014"],
      tipo: "deroga",
      detalle: "La Resolución 3100 de 2019 deroga expresamente la Resolución 2003 de 2014.",
      fecha: "2019-11-25",
    },
    { sql, ahora: hace(9) },
  );
  // SOG no tiene líder: su impacto lo resuelve la coordinadora. El de `CEX-GU-01` queda pendiente para el líder de CEX.
  const [impactoSog] = await sql`SELECT id FROM impactos_normativos
    WHERE cambio_id = ${cambioId} AND documento_id IS NULL AND proceso_id = ${c.procesoPorSigla.SOG}`;
  await resolverImpacto(
    coordinadora,
    {
      impactoId: Number(impactoSog.id),
      resolucion: "no_afecta",
      nota: "El proceso ya trabaja con los estándares de la Resolución 3100 de 2019: la derogación no cambia sus documentos.",
    },
    { sql, ahora: hace(8) },
  );

  // ── La revisión anual del año, abierta hace una semana ───────────────────────────────────────────────────────────
  const anio = Number(fechaEnZona(c.ahora, zona).slice(0, 4));
  const { revisionId } = await abrirRevision(coordinadora, { anio, plazoDias: 60, ventanaMeses: 6 }, { sql, ahora: hace(7) });
  // GTH: lo demás ya entró revisado; confirma su normograma. GTH-PR-01, vencido, sigue por decidir.
  await confirmarNormograma(
    liderGth,
    { revisionId, procesoId: c.procesoPorSigla.GTH, resultado: "sin_novedad", nota: "Las normas del proceso siguen vigentes y sus requisitos no cambiaron." },
    { sql, ahora: hace(5) },
  );
  // CEX, a medias: pide actualizar su caracterización desde la campaña; la guía de HTA externa sigue por decidir.
  await crearSolicitud(
    liderCex,
    {
      tipo: "modificar",
      motivo: "revision_anual",
      justificacion: "Revisión anual: la caracterización debe incluir la consulta de psicología y los indicadores de oportunidad de la cita.",
      documentoId: documento("CEX-CA-01"),
      revisionAnualId: revisionId,
    },
    { sql, ahora: hace(3) },
  );
}
