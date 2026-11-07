import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const id = () =>
  bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey();

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 1: mapa de procesos configurable (100% data-driven, editable en admin)
// ─────────────────────────────────────────────────────────────────────────────

export const macroprocesos = pgTable(
  "macroprocesos",
  {
    id: id(),
    letra: text("letra").notNull().unique(),
    nombre: text("nombre").notNull(),
    slug: text("slug").notNull().unique(),
    // La banda define la posición en la plantilla espacial del mapa (D1).
    banda: text("banda").notNull(),
    color: text("color").notNull(),
    icono: text("icono").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    check(
      "macroprocesos_banda_valida",
      sql`${t.banda} IN ('estrategicos', 'misionales', 'apoyo', 'evaluacion')`,
    ),
  ],
);

export const procesos = pgTable(
  "procesos",
  {
    id: id(),
    macroprocesoId: bigint("macroproceso_id", { mode: "number" })
      .notNull()
      .references(() => macroprocesos.id, { onDelete: "restrict" }),
    nombre: text("nombre").notNull(),
    sigla: text("sigla").notNull().unique(),
    slug: text("slug").notNull().unique(),
    descripcion: text("descripcion"),
    icono: text("icono").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [index("procesos_macroproceso_idx").on(t.macroprocesoId)],
);

export const subprocesos = pgTable(
  "subprocesos",
  {
    id: id(),
    procesoId: bigint("proceso_id", { mode: "number" })
      .notNull()
      .references(() => procesos.id, { onDelete: "restrict" }),
    nombre: text("nombre").notNull(),
    slug: text("slug").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("subprocesos_proceso_slug_unico").on(t.procesoId, t.slug),
    index("subprocesos_proceso_idx").on(t.procesoId),
  ],
);

export const elementosPerifericos = pgTable(
  "elementos_perifericos",
  {
    id: id(),
    tipo: text("tipo").notNull(),
    texto: text("texto").notNull(),
    icono: text("icono"),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    check(
      "elementos_tipo_valido",
      sql`${t.tipo} IN ('entrada', 'salida', 'convencion')`,
    ),
  ],
);

export const configuracion = pgTable("configuracion", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 2: documentos con control ISO 9001 (7.5)
// ─────────────────────────────────────────────────────────────────────────────

export const tiposDocumento = pgTable(
  "tipos_documento",
  {
    id: id(),
    nombre: text("nombre").notNull().unique(),
    sigla: text("sigla").notNull().unique(),
    esDiligenciable: boolean("es_diligenciable").notNull().default(false),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
    // Quién aprueba los documentos del tipo: estratégico (Gerencia) u operativo.
    autoridad: text("autoridad").notNull().default("operativo"),
    plantillaDocumentoId: bigint("plantilla_documento_id", {
      mode: "number",
    }).references((): AnyPgColumn => documentos.id, { onDelete: "restrict" }),
  },
  (t) => [
    check("tipos_documento_autoridad_valida", sql`${t.autoridad} IN ('estrategico', 'operativo')`),
  ],
);

export const documentos = pgTable(
  "documentos",
  {
    id: id(),
    // Estable entre versiones: la identidad del documento es su código.
    codigo: text("codigo").notNull().unique(),
    titulo: text("titulo").notNull(),
    tipoId: bigint("tipo_id", { mode: "number" })
      .notNull()
      .references(() => tiposDocumento.id, { onDelete: "restrict" }),
    descripcion: text("descripcion"),
    palabrasClave: text("palabras_clave"),
    nivelAcceso: text("nivel_acceso").notNull().default("general"),
    lecturaObligatoriaIngreso: boolean("lectura_obligatoria_ingreso").notNull().default(false),
    tsv: tsvector("tsv").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('espanol_unaccent', coalesce(codigo, '') || ' ' || coalesce(titulo, '')), 'A') || setweight(to_tsvector('espanol_unaccent', coalesce(palabras_clave, '')), 'B') || setweight(to_tsvector('espanol_unaccent', coalesce(descripcion, '')), 'C')`,
    ),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("documentos_tsv_idx").using("gin", t.tsv),
    index("documentos_codigo_trgm_idx").using(
      "gin",
      sql`${t.codigo} gin_trgm_ops`,
    ),
    index("documentos_titulo_trgm_idx").using(
      "gin",
      sql`${t.titulo} gin_trgm_ops`,
    ),
    index("documentos_tipo_idx").on(t.tipoId),
    check("documentos_nivel_acceso_valido", sql`${t.nivelAcceso} IN ('general', 'restringido')`),
  ],
);

export const documentoVersiones = pgTable(
  "documento_versiones",
  {
    id: id(),
    documentoId: bigint("documento_id", { mode: "number" })
      .notNull()
      .references(() => documentos.id, { onDelete: "restrict" }),
    numero: integer("numero").notNull(),
    estado: text("estado").notNull().default("borrador"),
    fechaElaboracion: date("fecha_elaboracion"),
    fechaRevision: date("fecha_revision"),
    fechaAprobacion: date("fecha_aprobacion"),
    elaboro: text("elaboro"),
    reviso: text("reviso"),
    aprobo: text("aprobo"),
    resumenCambios: text("resumen_cambios"),
    // 'plataforma': aprobada con las firmas del trámite; 'fuera': aprobada fuera de la plataforma.
    origenAprobacion: text("origen_aprobacion").notNull().default("fuera"),
    publicadoEn: timestamp("publicado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Regla de negocio central ISO 7.5: UNA sola versión vigente por documento,
    // reforzada en la BD, no solo en código.
    uniqueIndex("versiones_una_vigente_idx")
      .on(t.documentoId)
      .where(sql`estado = 'vigente'`),
    // Una versión descartada libera su número para la siguiente.
    uniqueIndex("versiones_documento_numero_unico_idx")
      .on(t.documentoId, t.numero)
      .where(sql`estado <> 'descartado'`),
    check(
      "versiones_estado_valido",
      sql`${t.estado} IN ('borrador', 'vigente', 'obsoleto', 'anulado', 'descartado')`,
    ),
    check(
      "versiones_origen_aprobacion_valido",
      sql`${t.origenAprobacion} IN ('plataforma', 'fuera')`,
    ),
    check("versiones_numero_positivo", sql`${t.numero} > 0`),
    // Un documento no puede estar vigente sin evidencia de aprobación.
    check(
      "versiones_vigente_con_aprobacion",
      sql`${t.estado} <> 'vigente' OR (${t.aprobo} IS NOT NULL AND ${t.fechaAprobacion} IS NOT NULL)`,
    ),
    index("versiones_documento_idx").on(t.documentoId),
  ],
);

export const archivos = pgTable(
  "archivos",
  {
    id: id(),
    // Nulo cuando el archivo es evidencia de una jornada o de un ítem de verificación.
    versionId: bigint("version_id", { mode: "number" }).references(
      () => documentoVersiones.id,
      { onDelete: "restrict" },
    ),
    contexto: text("contexto").notNull().default("version"),
    contextoId: bigint("contexto_id", { mode: "number" }),
    rol: text("rol").notNull().default("principal"),
    ruta: text("ruta").notNull().unique(),
    nombreOriginal: text("nombre_original").notNull(),
    extension: text("extension").notNull(),
    // MIME detectado por magic bytes en la carga, NUNCA el declarado por el
    // navegador ni el deducido de la extensión (regla de negocio 6).
    mime: text("mime").notNull(),
    tamanoBytes: bigint("tamano_bytes", { mode: "number" }).notNull(),
    hashSha256: text("hash_sha256").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("archivos_un_principal_idx")
      .on(t.versionId)
      .where(sql`rol = 'principal'`),
    check(
      "archivos_rol_valido",
      sql`${t.rol} IN ('principal', 'editable', 'anexo', 'acta_aprobacion', 'acta_eliminacion', 'evidencia')`,
    ),
    check(
      "archivos_contexto_valido",
      sql`${t.contexto} IN ('version', 'jornada', 'verificacion_item')`,
    ),
    check(
      "archivos_contexto_coherente",
      sql`(${t.contexto} = 'version' AND ${t.versionId} IS NOT NULL AND ${t.contextoId} IS NULL) OR (${t.contexto} <> 'version' AND ${t.versionId} IS NULL AND ${t.contextoId} IS NOT NULL)`,
    ),
    index("archivos_contexto_idx").on(t.contexto, t.contextoId),
    uniqueIndex("archivos_un_acta_idx")
      .on(t.versionId, t.rol)
      .where(sql`rol IN ('acta_aprobacion', 'acta_eliminacion')`),
    check("archivos_tamano_positivo", sql`${t.tamanoBytes} > 0`),
    index("archivos_version_idx").on(t.versionId),
  ],
);

export const documentoProceso = pgTable(
  "documento_proceso",
  {
    id: id(),
    documentoId: bigint("documento_id", { mode: "number" })
      .notNull()
      .references(() => documentos.id, { onDelete: "cascade" }),
    procesoId: bigint("proceso_id", { mode: "number" }).references(
      () => procesos.id,
      { onDelete: "restrict" },
    ),
    subprocesoId: bigint("subproceso_id", { mode: "number" }).references(
      () => subprocesos.id,
      { onDelete: "restrict" },
    ),
    // La asociación principal define el proceso propietario: valida el código,
    // asigna responsable y evita doble conteo en el Listado Maestro (D6).
    esPrincipal: boolean("es_principal").notNull().default(false),
  },
  (t) => [
    check(
      "documento_proceso_un_solo_destino",
      sql`num_nonnulls(${t.procesoId}, ${t.subprocesoId}) = 1`,
    ),
    uniqueIndex("documento_proceso_un_principal_idx")
      .on(t.documentoId)
      .where(sql`es_principal`),
    unique("documento_proceso_asociacion_unica")
      .on(t.documentoId, t.procesoId, t.subprocesoId)
      .nullsNotDistinct(),
    index("documento_proceso_proceso_idx").on(t.procesoId),
    index("documento_proceso_subproceso_idx").on(t.subprocesoId),
  ],
);

// Relación explícita procedimiento ↔ formatos/anexos que usa (respuesta 12 del
// usuario: "varios procedimientos utilizan como documento relacionado el
// formato de acta o el formato de informe").
export const documentoRelaciones = pgTable(
  "documento_relaciones",
  {
    id: id(),
    documentoId: bigint("documento_id", { mode: "number" })
      .notNull()
      .references(() => documentos.id, { onDelete: "cascade" }),
    relacionadoId: bigint("relacionado_id", { mode: "number" })
      .notNull()
      .references(() => documentos.id, { onDelete: "cascade" }),
  },
  (t) => [
    unique("documento_relaciones_unica").on(t.documentoId, t.relacionadoId),
    check(
      "documento_relaciones_sin_autorelacion",
      sql`${t.documentoId} <> ${t.relacionadoId}`,
    ),
    index("documento_relaciones_relacionado_idx").on(t.relacionadoId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Grupo 3: operación y trazabilidad
// ─────────────────────────────────────────────────────────────────────────────

// Estructura organizacional: áreas y cargos (con jerarquía por superior).
export const areas = pgTable("areas", {
  id: id(),
  nombre: text("nombre").notNull().unique(),
  orden: integer("orden").notNull().default(0),
  activo: boolean("activo").notNull().default(true),
});

export const cargos = pgTable(
  "cargos",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    areaId: bigint("area_id", { mode: "number" })
      .notNull()
      .references(() => areas.id, { onDelete: "restrict" }),
    superiorId: bigint("superior_id", { mode: "number" }).references(
      (): AnyPgColumn => cargos.id,
      { onDelete: "restrict" },
    ),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [unique("cargos_area_nombre_unico").on(t.areaId, t.nombre)],
);

export const usuarios = pgTable(
  "usuarios",
  {
    id: id(),
    usuario: text("usuario").notNull().unique(),
    nombre: text("nombre").notNull(),
    hashClave: text("hash_clave").notNull(),
    activo: boolean("activo").notNull().default(true),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    rol: text("rol").notNull().default("consulta"),
    correo: text("correo"),
    // Nullable: el admin de arranque no tiene cargo.
    cargoId: bigint("cargo_id", { mode: "number" }).references(
      () => cargos.id,
      { onDelete: "restrict" },
    ),
    jefeInmediatoId: bigint("jefe_inmediato_id", { mode: "number" }).references(
      (): AnyPgColumn => usuarios.id,
      { onDelete: "restrict" },
    ),
    debeCambiarClave: boolean("debe_cambiar_clave").notNull().default(false),
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    bloqueosConsecutivos: integer("bloqueos_consecutivos").notNull().default(0),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    totpSecretoCifrado: text("totp_secreto_cifrado"),
    totpActivo: boolean("totp_activo").notNull().default(false),
    verHistorial: boolean("ver_historial").notNull().default(false),
    tema: text("tema").notNull().default("claro"),
    aceptoDatosEn: timestamp("acepto_datos_en", { withTimezone: true }),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "usuarios_rol_valido",
      sql`${t.rol} IN ('admin_sgc', 'gerencia', 'control_interno', 'lider_proceso', 'consulta')`,
    ),
    check("usuarios_tema_valido", sql`${t.tema} IN ('claro', 'oscuro', 'sistema')`),
    uniqueIndex("usuarios_usuario_lower_unico").on(sql`lower(${t.usuario})`),
    uniqueIndex("usuarios_correo_idx")
      .on(sql`lower(${t.correo})`)
      .where(sql`${t.correo} IS NOT NULL`),
  ],
);

export const notificaciones = pgTable(
  "notificaciones",
  {
    id: id(),
    usuarioId: bigint("usuario_id", { mode: "number" })
      .notNull()
      .references(() => usuarios.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    cuerpo: text("cuerpo"),
    enlace: text("enlace"),
    entidad: text("entidad"),
    entidadId: bigint("entidad_id", { mode: "number" }),
    leidaEn: timestamp("leida_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notificaciones_usuario_idx").on(t.usuarioId, t.leidaEn, t.creadoEn.desc()),
  ],
);

export const usuarioProcesos = pgTable(
  "usuario_procesos",
  {
    usuarioId: bigint("usuario_id", { mode: "number" })
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    procesoId: bigint("proceso_id", { mode: "number" })
      .notNull()
      .references(() => procesos.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.usuarioId, t.procesoId] }),
    index("usuario_procesos_proceso_idx").on(t.procesoId),
  ],
);

export const sesiones = pgTable(
  "sesiones",
  {
    // Hash del token de sesión: si la BD se filtra, los tokens no sirven.
    id: text("id").primaryKey(),
    usuarioId: bigint("usuario_id", { mode: "number" })
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ultimoUsoEn: timestamp("ultimo_uso_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    factorPendiente: boolean("factor_pendiente").notNull().default(false),
    ip: inet("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("sesiones_usuario_idx").on(t.usuarioId),
    index("sesiones_expira_idx").on(t.expiraEn),
  ],
);

// Solo-inserción: la bitácora jamás se edita ni se depura desde la app.
export const auditoria = pgTable(
  "auditoria",
  {
    id: id(),
    usuarioId: bigint("usuario_id", { mode: "number" }).references(
      () => usuarios.id,
      { onDelete: "restrict" },
    ),
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: bigint("entidad_id", { mode: "number" }),
    detalle: jsonb("detalle").notNull().default({}),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auditoria_entidad_idx").on(t.entidad, t.entidadId),
    index("auditoria_creado_idx").on(t.creadoEn),
    // Los códigos que dejó el panel al corregirlos (`todosLosCodigos`, `codigoAbandonado`).
    index("auditoria_cambios_codigo_idx")
      .on(t.entidad, t.accion)
      .where(sql`accion IN ('editar_control', 'editar_documento')`),
  ],
);

// Solo-inserción (trigger en la migración). Los usuarios con historial no se
// borran, se desactivan: por eso la FK es restrict y no set null (un set null
// sería un UPDATE y el trigger lo rechazaría).
export const accesos = pgTable(
  "accesos",
  {
    id: id(),
    usuarioId: bigint("usuario_id", { mode: "number" }).references(
      () => usuarios.id,
      { onDelete: "restrict" },
    ),
    usuarioTexto: text("usuario_texto").notNull(),
    resultado: text("resultado").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "accesos_resultado_valido",
      sql`${t.resultado} IN ('ingreso', 'salida', 'fallo', 'bloqueo', 'desbloqueo', 'restablecimiento', 'factor_fallo', 'cierre_forzado', 'firma_fallo')`,
    ),
    index("accesos_usuario_idx").on(t.usuarioId, t.creadoEn),
    index("accesos_creado_idx").on(t.creadoEn),
  ],
);

export const codigosRecuperacion = pgTable(
  "codigos_recuperacion",
  {
    id: id(),
    usuarioId: bigint("usuario_id", { mode: "number" })
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    usadoEn: timestamp("usado_en", { withTimezone: true }),
  },
  (t) => [index("codigos_recuperacion_usuario_idx").on(t.usuarioId)],
);

// Rastro de consulta pública sin login: IP + user-agent (D8).
export const eventosConsulta = pgTable(
  "eventos_consulta",
  {
    id: id(),
    tipo: text("tipo").notNull(),
    documentoId: bigint("documento_id", { mode: "number" })
      .notNull()
      .references(() => documentos.id, { onDelete: "restrict" }),
    versionId: bigint("version_id", { mode: "number" }).references(
      () => documentoVersiones.id,
      { onDelete: "restrict" },
    ),
    usuarioId: bigint("usuario_id", { mode: "number" }).references(
      () => usuarios.id,
      { onDelete: "set null" },
    ),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("eventos_tipo_valido", sql`${t.tipo} IN ('vista', 'descarga')`),
    index("eventos_documento_idx").on(t.documentoId, t.creadoEn),
    index("eventos_creado_idx").on(t.creadoEn),
  ],
);

// Las búsquedas con 0 resultados le dicen a calidad qué documentación falta.
export const busquedas = pgTable(
  "busquedas",
  {
    id: id(),
    termino: text("termino").notNull(),
    cantidadResultados: integer("cantidad_resultados").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("busquedas_creado_idx").on(t.creadoEn)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Grupo: flujo de trámite documental (Fase 13A)
// ─────────────────────────────────────────────────────────────────────────────

const refUsuario = (nombre: string) =>
  bigint(nombre, { mode: "number" }).references(() => usuarios.id, {
    onDelete: "restrict",
  });

export const listaVerificacionItems = pgTable("lista_verificacion_items", {
  id: id(),
  texto: text("texto").notNull(),
  critico: boolean("critico").notNull().default(false),
  orden: integer("orden").notNull(),
  activo: boolean("activo").notNull().default(true),
});

export const tramites = pgTable(
  "tramites",
  {
    id: id(),
    numero: text("numero").notNull().unique(),
    anio: integer("anio").notNull(),
    consecutivo: integer("consecutivo").notNull(),
    tipo: text("tipo").notNull(),
    motivo: text("motivo").notNull(),
    justificacion: text("justificacion").notNull(),
    solicitanteId: refUsuario("solicitante_id").notNull(),
    // El proceso propietario del documento.
    procesoId: bigint("proceso_id", { mode: "number" })
      .notNull()
      .references(() => procesos.id, { onDelete: "restrict" }),
    subprocesoId: bigint("subproceso_id", { mode: "number" }).references(
      () => subprocesos.id,
      { onDelete: "restrict" },
    ),
    tipoDocumentoId: bigint("tipo_documento_id", { mode: "number" }).references(
      () => tiposDocumento.id,
      { onDelete: "restrict" },
    ),
    tituloPropuesto: text("titulo_propuesto"),
    documentoId: bigint("documento_id", { mode: "number" }).references(
      () => documentos.id,
      { onDelete: "restrict" },
    ),
    versionId: bigint("version_id", { mode: "number" }).references(
      () => documentoVersiones.id,
      { onDelete: "restrict" },
    ),
    etapa: text("etapa").notNull(),
    ronda: integer("ronda").notNull().default(0),
    elaboradorId: refUsuario("elaborador_id"),
    revisorId: refUsuario("revisor_id"),
    aprobadorId: refUsuario("aprobador_id"),
    venceEn: timestamp("vence_en", { withTimezone: true }),
    avisoVencidoEn: timestamp("aviso_vencido_en", { withTimezone: true }),
    escaladoEn: timestamp("escalado_en", { withTimezone: true }),
    cerradoEn: timestamp("cerrado_en", { withTimezone: true }),
    motivoCierre: text("motivo_cierre"),
    requiereSocializacion: boolean("requiere_socializacion").notNull().default(false),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("tramites_anio_consecutivo_unico").on(t.anio, t.consecutivo),
    check("tramites_tipo_valido", sql`${t.tipo} IN ('crear', 'modificar', 'eliminar')`),
    check(
      "tramites_motivo_valido",
      sql`${t.motivo} IN ('cambio_normativo', 'mejora', 'no_conformidad', 'solicitud_personal', 'revision_anual')`,
    ),
    check(
      "tramites_etapa_valida",
      sql`${t.etapa} IN ('visto_bueno', 'aceptacion', 'elaboracion', 'revision', 'aprobacion', 'publicacion', 'publicado', 'eliminado', 'rechazado', 'cancelado')`,
    ),
    index("tramites_proceso_idx").on(t.procesoId),
    index("tramites_etapa_idx").on(t.etapa),
    // Un documento tiene a lo sumo un trámite abierto.
    uniqueIndex("tramites_uno_abierto_idx")
      .on(t.documentoId)
      .where(
        sql`etapa IN ('visto_bueno', 'aceptacion', 'elaboracion', 'revision', 'aprobacion', 'publicacion')`,
      ),
  ],
);

// Solo-inserción (trigger en la migración).
export const tramiteEventos = pgTable(
  "tramite_eventos",
  {
    id: id(),
    tramiteId: bigint("tramite_id", { mode: "number" })
      .notNull()
      .references(() => tramites.id, { onDelete: "restrict" }),
    tipo: text("tipo").notNull(),
    usuarioId: refUsuario("usuario_id"),
    ronda: integer("ronda").notNull(),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tramite_eventos_tramite_idx").on(t.tramiteId, t.creadoEn),
    // Los códigos que dejó un trámite al corregirlos (`todosLosCodigos`, `codigoAbandonado`).
    index("tramite_eventos_codigo_corregido_idx")
      .on(sql`(detalle -> 'antes' ->> 'codigo')`)
      .where(sql`tipo = 'corregir_datos'`),
  ],
);

// Solo-inserción (trigger en la migración).
export const firmas = pgTable(
  "firmas",
  {
    id: id(),
    tramiteId: bigint("tramite_id", { mode: "number" })
      .notNull()
      .references(() => tramites.id, { onDelete: "restrict" }),
    versionId: bigint("version_id", { mode: "number" }).references(
      () => documentoVersiones.id,
      { onDelete: "restrict" },
    ),
    usuarioId: refUsuario("usuario_id").notNull(),
    firma: text("firma").notNull(),
    ronda: integer("ronda").notNull(),
    hashSha256: text("hash_sha256").notNull(),
    nombreFirmante: text("nombre_firmante").notNull(),
    cargoFirmante: text("cargo_firmante"),
    metodo: text("metodo").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("firmas_firma_valida", sql`${t.firma} IN ('elaboro', 'reviso', 'aprobo', 'publico')`),
    check("firmas_metodo_valido", sql`${t.metodo} IN ('clave', 'clave_totp')`),
    index("firmas_tramite_idx").on(t.tramiteId),
    index("firmas_version_idx").on(t.versionId),
  ],
);

export const tramiteObservaciones = pgTable(
  "tramite_observaciones",
  {
    id: id(),
    tramiteId: bigint("tramite_id", { mode: "number" })
      .notNull()
      .references(() => tramites.id, { onDelete: "restrict" }),
    numero: integer("numero").notNull(),
    ronda: integer("ronda").notNull(),
    origen: text("origen").notNull(),
    texto: text("texto").notNull(),
    autorId: refUsuario("autor_id").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    respuesta: text("respuesta"),
    respondidaPor: refUsuario("respondida_por"),
    respondidaEn: timestamp("respondida_en", { withTimezone: true }),
    estado: text("estado").notNull().default("abierta"),
    cerradaPor: refUsuario("cerrada_por"),
    cerradaEn: timestamp("cerrada_en", { withTimezone: true }),
    notaReapertura: text("nota_reapertura"),
  },
  (t) => [
    unique("tramite_observaciones_numero_unico").on(t.tramiteId, t.numero),
    check("tramite_observaciones_origen_valido", sql`${t.origen} IN ('revision', 'aprobacion')`),
    check(
      "tramite_observaciones_estado_valido",
      sql`${t.estado} IN ('abierta', 'atendida', 'cerrada')`,
    ),
  ],
);

export const tramiteVerificaciones = pgTable(
  "tramite_verificaciones",
  {
    id: id(),
    tramiteId: bigint("tramite_id", { mode: "number" })
      .notNull()
      .references(() => tramites.id, { onDelete: "restrict" }),
    ronda: integer("ronda").notNull(),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => listaVerificacionItems.id, { onDelete: "restrict" }),
    textoItem: text("texto_item").notNull(),
    critico: boolean("critico").notNull(),
    resultado: text("resultado").notNull(),
    nota: text("nota"),
  },
  (t) => [
    unique("tramite_verificaciones_item_unico").on(t.tramiteId, t.ronda, t.itemId),
    check(
      "tramite_verificaciones_resultado_valido",
      sql`${t.resultado} IN ('cumple', 'no_cumple', 'no_aplica')`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Fase 13B: distribución, puntos de uso, acuses, jornadas y verificaciones
// ─────────────────────────────────────────────────────────────────────────────

const ref = (nombre: string, tabla: () => AnyPgColumn) =>
  bigint(nombre, { mode: "number" }).references(tabla, { onDelete: "restrict" });
const marca = (nombre: string) => timestamp(nombre, { withTimezone: true });
const creado = () => marca("creado_en").notNull().defaultNow();

export const puntosUso = pgTable(
  "puntos_uso",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    sede: text("sede"),
    ubicacion: text("ubicacion"),
    responsableId: refUsuario("responsable_id").notNull(),
    activo: boolean("activo").notNull().default(true),
    orden: integer("orden").notNull().default(0),
    creadoEn: creado(),
    actualizadoEn: marca("actualizado_en").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("puntos_uso_sede_nombre_unico").on(
      sql`lower(coalesce(${t.sede}, ''))`,
      sql`lower(${t.nombre})`,
    ),
  ],
);

export const puntoUsoProcesos = pgTable(
  "punto_uso_procesos",
  {
    puntoUsoId: ref("punto_uso_id", () => puntosUso.id).notNull(),
    procesoId: ref("proceso_id", () => procesos.id).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.puntoUsoId, t.procesoId] }),
    index("punto_uso_procesos_proceso_idx").on(t.procesoId),
  ],
);

export const copiasControladas = pgTable(
  "copias_controladas",
  {
    id: id(),
    versionId: ref("version_id", () => documentoVersiones.id).notNull(),
    numero: integer("numero").notNull(),
    puntoUsoId: ref("punto_uso_id", () => puntosUso.id).notNull(),
    responsableId: refUsuario("responsable_id").notNull(),
    responsableNombre: text("responsable_nombre").notNull(),
    responsableCargo: text("responsable_cargo"),
    emitidaPor: refUsuario("emitida_por").notNull(),
    hashPrincipal: text("hash_principal").notNull(),
    nota: text("nota"),
    estado: text("estado").notNull().default("emitida"),
    emitidaEn: marca("emitida_en").notNull(),
    recibidaEn: marca("recibida_en"),
    porRecogerEn: marca("por_recoger_en"),
    recogidaEn: marca("recogida_en"),
    anuladaEn: marca("anulada_en"),
    motivoPorRecoger: text("motivo_por_recoger"),
    destinoRecogida: text("destino_recogida"),
    motivoAnulacion: text("motivo_anulacion"),
    reemplazaCopiaId: ref("reemplaza_copia_id", (): AnyPgColumn => copiasControladas.id),
    // Inicio de la ventana de impresión.
    ultimaAperturaEn: marca("ultima_apertura_en"),
    venceEn: marca("vence_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
  },
  (t) => [
    unique("copias_version_numero_unico").on(t.versionId, t.numero),
    check(
      "copias_estado_valido",
      sql`${t.estado} IN ('emitida', 'recibida', 'por_recoger', 'recogida', 'anulada')`,
    ),
    check(
      "copias_motivo_por_recoger_valido",
      sql`${t.motivoPorRecoger} IN ('nueva_version', 'eliminado', 'carga_deshecha')`,
    ),
    check(
      "copias_destino_recogida_valido",
      sql`${t.destinoRecogida} IN ('devuelta', 'destruida', 'no_encontrada', 'retirada_en_verificacion')`,
    ),
    index("copias_punto_uso_idx").on(t.puntoUsoId),
    index("copias_estado_idx").on(t.estado),
  ],
);

// Solo-inserción (trigger en la migración).
export const copiaEventos = pgTable(
  "copia_eventos",
  {
    id: id(),
    copiaId: ref("copia_id", () => copiasControladas.id).notNull(),
    tipo: text("tipo").notNull(),
    usuarioId: refUsuario("usuario_id"),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creado(),
  },
  (t) => [
    check(
      "copia_eventos_tipo_valido",
      sql`${t.tipo} IN ('emitida', 'impresa', 'consultada', 'reimpresa', 'recibida', 'por_recoger', 'recogida', 'anulada')`,
    ),
    index("copia_eventos_copia_idx").on(t.copiaId, t.creadoEn),
  ],
);

export const listasDistribucion = pgTable(
  "listas_distribucion",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    activa: boolean("activa").notNull().default(true),
    creadoEn: creado(),
  },
  (t) => [uniqueIndex("listas_distribucion_nombre_unico").on(sql`lower(${t.nombre})`)],
);

export const listaMiembros = pgTable(
  "lista_miembros",
  {
    id: id(),
    listaId: ref("lista_id", () => listasDistribucion.id).notNull(),
    tipo: text("tipo").notNull(),
    // Polimórfica: la referencia se valida en la aplicación.
    referenciaId: bigint("referencia_id", { mode: "number" }).notNull(),
  },
  (t) => [
    unique("lista_miembros_unico").on(t.listaId, t.tipo, t.referenciaId),
    check("lista_miembros_tipo_valido", sql`${t.tipo} IN ('area', 'cargo', 'proceso', 'usuario')`),
  ],
);

export const documentoListas = pgTable(
  "documento_listas",
  {
    documentoId: ref("documento_id", () => documentos.id).notNull(),
    listaId: ref("lista_id", () => listasDistribucion.id).notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentoId, t.listaId] })],
);

export const jornadas = pgTable(
  "jornadas",
  {
    id: id(),
    fecha: date("fecha").notNull(),
    modalidad: text("modalidad").notNull(),
    facilitadorId: refUsuario("facilitador_id").notNull(),
    observaciones: text("observaciones"),
    asistentesExternos: text("asistentes_externos"),
    registradaPor: refUsuario("registrada_por").notNull(),
    creadoEn: creado(),
    anuladaEn: marca("anulada_en"),
    anuladaPor: refUsuario("anulada_por"),
    motivoAnulacion: text("motivo_anulacion"),
  },
  (t) => [
    check(
      "jornadas_modalidad_valida",
      sql`${t.modalidad} IN ('presencial', 'virtual', 'reunion_servicio', 'otra')`,
    ),
  ],
);

export const jornadaVersiones = pgTable(
  "jornada_versiones",
  {
    jornadaId: ref("jornada_id", () => jornadas.id).notNull(),
    versionId: ref("version_id", () => documentoVersiones.id).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jornadaId, t.versionId] }),
    index("jornada_versiones_version_idx").on(t.versionId),
  ],
);

export const jornadaAsistentes = pgTable(
  "jornada_asistentes",
  {
    jornadaId: ref("jornada_id", () => jornadas.id).notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.jornadaId, t.usuarioId] })],
);

export const acuses = pgTable(
  "acuses",
  {
    id: id(),
    versionId: ref("version_id", () => documentoVersiones.id).notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
    origen: text("origen").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    modo: text("modo"),
    jornadaId: ref("jornada_id", () => jornadas.id),
    creadoEn: creado(),
    confirmadoEn: marca("confirmado_en"),
    venceEn: marca("vence_en").notNull(),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    cerradoEn: marca("cerrado_en"),
    motivoCierre: text("motivo_cierre"),
  },
  (t) => [
    uniqueIndex("acuses_vivo_unico")
      .on(t.versionId, t.usuarioId)
      .where(sql`estado IN ('pendiente', 'confirmado')`),
    check(
      "acuses_origen_valido",
      sql`${t.origen} IN ('publicacion', 'solicitud_manual', 'ingreso_proceso')`,
    ),
    check(
      "acuses_estado_valido",
      sql`${t.estado} IN ('pendiente', 'confirmado', 'superado', 'retirado')`,
    ),
    check("acuses_modo_valido", sql`${t.modo} IN ('individual', 'asistencia', 'firma')`),
    index("acuses_usuario_estado_idx").on(t.usuarioId, t.estado),
    index("acuses_version_idx").on(t.versionId),
  ],
);

// Solo-inserción (trigger en la migración).
export const acuseEventos = pgTable(
  "acuse_eventos",
  {
    id: id(),
    acuseId: ref("acuse_id", () => acuses.id).notNull(),
    tipo: text("tipo").notNull(),
    usuarioId: refUsuario("usuario_id"),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creado(),
  },
  (t) => [
    check(
      "acuse_eventos_tipo_valido",
      sql`${t.tipo} IN ('creado', 'confirmado', 'superado', 'retirado', 'revertido')`,
    ),
    index("acuse_eventos_acuse_idx").on(t.acuseId, t.creadoEn),
  ],
);

export const socializacionesRequeridas = pgTable("socializaciones_requeridas", {
  id: id(),
  versionId: ref("version_id", () => documentoVersiones.id).notNull().unique(),
  creadoEn: creado(),
  venceEn: marca("vence_en").notNull(),
  avisoVencidoEn: marca("aviso_vencido_en"),
  escaladoEn: marca("escalado_en"),
  cumplidaEn: marca("cumplida_en"),
  jornadaId: ref("jornada_id", () => jornadas.id),
  superadaEn: marca("superada_en"),
});

export const verificaciones = pgTable(
  "verificaciones",
  {
    id: id(),
    puntoUsoId: ref("punto_uso_id", () => puntosUso.id).notNull(),
    estado: text("estado").notNull().default("abierta"),
    abiertaPor: refUsuario("abierta_por").notNull(),
    abiertaEn: marca("abierta_en").notNull(),
    cerradaPor: refUsuario("cerrada_por"),
    cerradaEn: marca("cerrada_en"),
    conforme: boolean("conforme"),
    propioPunto: boolean("propio_punto").notNull().default(false),
    motivoDescarte: text("motivo_descarte"),
    puntoNombre: text("punto_nombre").notNull(),
    responsableId: refUsuario("responsable_id").notNull(),
    responsableNombre: text("responsable_nombre").notNull(),
  },
  (t) => [
    check(
      "verificaciones_estado_valido",
      sql`${t.estado} IN ('abierta', 'cerrada', 'descartada')`,
    ),
    uniqueIndex("verificaciones_una_abierta_idx")
      .on(t.puntoUsoId)
      .where(sql`estado = 'abierta'`),
    index("verificaciones_punto_cerrada_idx").on(t.puntoUsoId, t.cerradaEn),
  ],
);

export const verificacionItems = pgTable(
  "verificacion_items",
  {
    id: id(),
    verificacionId: ref("verificacion_id", () => verificaciones.id).notNull(),
    orden: integer("orden").notNull(),
    origen: text("origen").notNull(),
    copiaId: ref("copia_id", () => copiasControladas.id),
    texto: text("texto").notNull(),
    respuesta: text("respuesta"),
    nota: text("nota"),
  },
  (t) => [
    check(
      "verificacion_items_origen_valido",
      sql`${t.origen} IN ('copia', 'copia_por_recoger', 'fijo', 'libre')`,
    ),
    check(
      "verificacion_items_respuesta_valida",
      sql`${t.respuesta} IN ('conforme', 'no_conforme', 'no_aplica')`,
    ),
    index("verificacion_items_verificacion_idx").on(t.verificacionId),
  ],
);

export const hallazgos = pgTable(
  "hallazgos",
  {
    id: id(),
    puntoUsoId: ref("punto_uso_id", () => puntosUso.id).notNull(),
    origen: text("origen").notNull(),
    verificacionId: ref("verificacion_id", () => verificaciones.id),
    itemId: ref("item_id", () => verificacionItems.id),
    copiaId: ref("copia_id", () => copiasControladas.id),
    documentoId: ref("documento_id", () => documentos.id),
    descripcion: text("descripcion").notNull(),
    retiradoEnElActo: boolean("retirado_en_el_acto").notNull().default(false),
    responsableId: refUsuario("responsable_id").notNull(),
    estado: text("estado").notNull().default("abierto"),
    venceEn: marca("vence_en").notNull(),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    creadoEn: creado(),
    cerradoEn: marca("cerrado_en"),
    cerradoPor: refUsuario("cerrado_por"),
    notaCierre: text("nota_cierre"),
  },
  (t) => [
    check("hallazgos_origen_valido", sql`${t.origen} IN ('verificacion', 'recogida')`),
    check("hallazgos_estado_valido", sql`${t.estado} IN ('abierto', 'cerrado')`),
    index("hallazgos_punto_estado_idx").on(t.puntoUsoId, t.estado),
    index("hallazgos_responsable_idx").on(t.responsableId),
  ],
);
