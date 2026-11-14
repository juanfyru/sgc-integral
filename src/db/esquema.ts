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
  numeric,
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
    // Sigla para el código de los indicadores (migración 0012); única sin distinguir mayúsculas.
    sigla: text("sigla"),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    unique("subprocesos_proceso_slug_unico").on(t.procesoId, t.slug),
    index("subprocesos_proceso_idx").on(t.procesoId),
    uniqueIndex("subprocesos_sigla_unica")
      .on(sql`lower(${t.sigla})`)
      .where(sql`${t.sigla} IS NOT NULL`),
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
    // Plazo de revisión de los documentos del tipo, en meses calendario.
    mesesRevision: integer("meses_revision").notNull().default(12),
  },
  (t) => [
    check("tipos_documento_autoridad_valida", sql`${t.autoridad} IN ('estrategico', 'operativo')`),
    check("tipos_documento_meses_revision_valido", sql`${t.mesesRevision} BETWEEN 1 AND 120`),
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
    origen: text("origen").notNull().default("interno"),
    // Plazo propio; nulo: el del tipo.
    mesesRevision: integer("meses_revision"),
    proximaRevisionFijada: date("proxima_revision_fijada"),
    fijadaPor: bigint("fijada_por", { mode: "number" }).references(
      (): AnyPgColumn => usuarios.id,
      { onDelete: "restrict" },
    ),
    fijadaEn: timestamp("fijada_en", { withTimezone: true }),
    fijadaNota: text("fijada_nota"),
    revisionAvisoEn: timestamp("revision_aviso_en", { withTimezone: true }),
    revisionEscaladoEn: timestamp("revision_escalado_en", { withTimezone: true }),
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
    check("documentos_origen_valido", sql`${t.origen} IN ('interno', 'externo')`),
    check("documentos_meses_revision_valido", sql`${t.mesesRevision} BETWEEN 1 AND 120`),
    // Una fecha fijada a mano siempre dice quién la fijó.
    check(
      "documentos_fijada_coherente",
      sql`(${t.proximaRevisionFijada} IS NULL) = (${t.fijadaPor} IS NULL)`,
    ),
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
    // 'plataforma': aprobada con las firmas del trámite; 'fuera': aprobada fuera de la plataforma;
    // 'externo': edición de un documento externo adoptada con la firma «Adoptó».
    origenAprobacion: text("origen_aprobacion").notNull().default("fuera"),
    edicionExterna: text("edicion_externa"),
    fechaEdicionExterna: date("fecha_edicion_externa"),
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
      sql`${t.origenAprobacion} IN ('plataforma', 'fuera', 'externo')`,
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
    // Nulo cuando el archivo es de otro dueño (`contexto`): jornada, ítem de verificación,
    // norma, revisión anual o hallazgo.
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
      sql`${t.contexto} IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo', 'medicion', 'reporte_externo', 'importacion_indicadores')`,
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
    // La solicitud nació de una decisión de la revisión anual o de un impacto normativo.
    revisionAnualId: bigint("revision_anual_id", { mode: "number" }).references(
      (): AnyPgColumn => revisionesAnuales.id,
      { onDelete: "restrict" },
    ),
    impactoId: bigint("impacto_id", { mode: "number" }).references(
      (): AnyPgColumn => impactosNormativos.id,
      { onDelete: "restrict" },
    ),
    creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("tramites_anio_consecutivo_unico").on(t.anio, t.consecutivo),
    index("tramites_revision_anual_idx").on(t.revisionAnualId),
    index("tramites_impacto_idx").on(t.impactoId),
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

// Solo-inserción (trigger en la migración). «Ratificó» y «Adoptó» se firman sin trámite.
export const firmas = pgTable(
  "firmas",
  {
    id: id(),
    tramiteId: bigint("tramite_id", { mode: "number" }).references(() => tramites.id, {
      onDelete: "restrict",
    }),
    versionId: bigint("version_id", { mode: "number" }).references(
      () => documentoVersiones.id,
      { onDelete: "restrict" },
    ),
    // La firma de una ficha de indicador (`elaboro`, `aprobo`) no tiene trámite ni versión documental.
    indicadorVersionId: bigint("indicador_version_id", { mode: "number" }).references(
      (): AnyPgColumn => indicadorVersiones.id,
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
    check(
      "firmas_firma_valida",
      sql`${t.firma} IN ('elaboro', 'reviso', 'aprobo', 'publico', 'ratifico', 'adopto')`,
    ),
    check(
      "firmas_tramite_coherente",
      sql`${t.tramiteId} IS NOT NULL OR ${t.firma} IN ('ratifico', 'adopto') OR ${t.indicadorVersionId} IS NOT NULL`,
    ),
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
      sql`${t.motivoPorRecoger} IN ('nueva_version', 'eliminado', 'carga_deshecha', 'retirado')`,
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
    // Polimórfica: la referencia se valida en la aplicación. Nula solo en «todos».
    referenciaId: bigint("referencia_id", { mode: "number" }),
  },
  (t) => [
    // La migración 0008 lo crea con NULLS NOT DISTINCT (Drizzle no lo expresa en un índice):
    // un solo miembro «todos» por lista.
    uniqueIndex("lista_miembros_unico_idx").on(t.listaId, t.tipo, t.referenciaId),
    check(
      "lista_miembros_tipo_valido",
      sql`${t.tipo} IN ('area', 'cargo', 'proceso', 'usuario', 'todos')`,
    ),
    check(
      "lista_miembros_referencia_coherente",
      sql`(${t.tipo} = 'todos') = (${t.referenciaId} IS NULL)`,
    ),
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
    retirado: boolean("retirado").notNull().default(false),
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
    // Cierre en dos pasos: el responsable corrige y el Admin SGC o una verificación valida.
    corregidoEn: marca("corregido_en"),
    corregidoPor: refUsuario("corregido_por"),
    notaCorreccion: text("nota_correccion"),
    validacion: text("validacion"),
    validacionVerificacionId: ref("validacion_verificacion_id", () => verificaciones.id),
    reaperturas: integer("reaperturas").notNull().default(0),
  },
  (t) => [
    check("hallazgos_origen_valido", sql`${t.origen} IN ('verificacion', 'recogida')`),
    check(
      "hallazgos_estado_valido",
      sql`${t.estado} IN ('abierto', 'por_validar', 'cerrado')`,
    ),
    check("hallazgos_validacion_valida", sql`${t.validacion} IN ('admin', 'verificacion')`),
    index("hallazgos_punto_estado_idx").on(t.puntoUsoId, t.estado),
    index("hallazgos_responsable_idx").on(t.responsableId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Fase 13C: vigencia, documentos externos, revisión anual y normograma
// ─────────────────────────────────────────────────────────────────────────────

export const tiposNorma = pgTable(
  "tipos_norma",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [uniqueIndex("tipos_norma_nombre_unico").on(sql`lower(${t.nombre})`)],
);

export const normas = pgTable(
  "normas",
  {
    id: id(),
    tipoNormaId: ref("tipo_norma_id", () => tiposNorma.id).notNull(),
    numero: text("numero").notNull(),
    anio: integer("anio").notNull(),
    fechaExpedicion: date("fecha_expedicion"),
    entidadEmisora: text("entidad_emisora").notNull(),
    titulo: text("titulo").notNull(),
    tema: text("tema"),
    estado: text("estado").notNull().default("vigente"),
    estadoEn: date("estado_en"),
    enlaceOficial: text("enlace_oficial"),
    notas: text("notas"),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
    actualizadoEn: marca("actualizado_en").notNull().defaultNow(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('espanol_unaccent', coalesce(numero, '') || ' ' || anio::text || ' ' || coalesce(titulo, '')), 'A') || setweight(to_tsvector('espanol_unaccent', coalesce(tema, '')), 'B') || setweight(to_tsvector('espanol_unaccent', coalesce(entidad_emisora, '')), 'C')`,
    ),
  },
  (t) => [
    check(
      "normas_estado_valido",
      sql`${t.estado} IN ('vigente', 'modificada', 'derogada', 'retirada')`,
    ),
    index("normas_tsv_idx").using("gin", t.tsv),
    uniqueIndex("normas_tipo_numero_anio_unico").on(
      t.tipoNormaId,
      sql`lower(${t.numero})`,
      t.anio,
    ),
  ],
);

export const normaRelaciones = pgTable(
  "norma_relaciones",
  {
    id: id(),
    normaId: ref("norma_id", () => normas.id).notNull(),
    afectadaId: ref("afectada_id", () => normas.id).notNull(),
    tipo: text("tipo").notNull(),
    detalle: text("detalle"),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
    // Baja lógica (migración 0010): la relación registrada por error se elimina con motivo, y el cambio de estado que
    // causó (`norma_cambios`, de solo inserción) la sigue citando.
    eliminadaEn: marca("eliminada_en"),
    eliminadaPor: refUsuario("eliminada_por"),
    eliminadaMotivo: text("eliminada_motivo"),
  },
  (t) => [
    // Única entre las no eliminadas: la misma relación se puede volver a registrar después de eliminada.
    uniqueIndex("norma_relaciones_unica_sin_baja")
      .on(t.normaId, t.afectadaId, t.tipo)
      .where(sql`eliminada_en IS NULL`),
    check(
      "norma_relaciones_tipo_valido",
      sql`${t.tipo} IN ('modifica', 'deroga', 'reglamenta')`,
    ),
    check("norma_relaciones_distintas", sql`${t.normaId} <> ${t.afectadaId}`),
    check(
      "norma_relaciones_baja_coherente",
      sql`(${t.eliminadaEn} IS NULL AND ${t.eliminadaPor} IS NULL AND ${t.eliminadaMotivo} IS NULL) OR (${t.eliminadaEn} IS NOT NULL AND ${t.eliminadaPor} IS NOT NULL AND ${t.eliminadaMotivo} IS NOT NULL)`,
    ),
  ],
);

// Solo-inserción (trigger en la migración).
export const normaCambios = pgTable(
  "norma_cambios",
  {
    id: id(),
    normaId: ref("norma_id", () => normas.id).notNull(),
    estadoAnterior: text("estado_anterior").notNull(),
    estadoNuevo: text("estado_nuevo").notNull(),
    fecha: date("fecha").notNull(),
    relacionId: ref("relacion_id", () => normaRelaciones.id),
    usuarioId: refUsuario("usuario_id").notNull(),
    nota: text("nota"),
    creadoEn: creado(),
  },
  (t) => [
    index("norma_cambios_norma_idx").on(t.normaId, t.creadoEn),
    check(
      "norma_cambios_estados_validos",
      sql`${t.estadoAnterior} IN ('vigente', 'modificada', 'derogada', 'retirada') AND ${t.estadoNuevo} IN ('vigente', 'modificada', 'derogada', 'retirada')`,
    ),
  ],
);

export const normaProcesos = pgTable(
  "norma_procesos",
  {
    id: id(),
    normaId: ref("norma_id", () => normas.id).notNull(),
    procesoId: ref("proceso_id", () => procesos.id).notNull(),
    requisito: text("requisito"),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
    actualizadoPor: refUsuario("actualizado_por"),
    actualizadoEn: marca("actualizado_en"),
  },
  (t) => [
    unique("norma_procesos_unica").on(t.normaId, t.procesoId),
    index("norma_procesos_proceso_idx").on(t.procesoId),
  ],
);

export const normaDocumentos = pgTable(
  "norma_documentos",
  {
    id: id(),
    normaId: ref("norma_id", () => normas.id).notNull(),
    documentoId: ref("documento_id", () => documentos.id).notNull(),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
  },
  (t) => [
    unique("norma_documentos_unica").on(t.normaId, t.documentoId),
    index("norma_documentos_documento_idx").on(t.documentoId),
  ],
);

// Cerrada, ni ella ni sus procesos ni sus decisiones se modifican, ni recibe nuevos (triggers de las migraciones 0008 y 0009).
export const revisionesAnuales = pgTable(
  "revisiones_anuales",
  {
    id: id(),
    anio: integer("anio").notNull().unique(),
    estado: text("estado").notNull().default("abierta"),
    plazoDias: integer("plazo_dias").notNull(),
    ventanaMeses: integer("ventana_meses").notNull(),
    abiertaPor: refUsuario("abierta_por").notNull(),
    abiertaEn: marca("abierta_en").notNull(),
    venceEn: marca("vence_en").notNull(),
    prorrogas: jsonb("prorrogas").notNull().default(sql`'[]'::jsonb`),
    cerradaPor: refUsuario("cerrada_por"),
    cerradaEn: marca("cerrada_en"),
    metodoCierre: text("metodo_cierre"),
    // El informe congelado al cierre, con el formato usado.
    informe: jsonb("informe"),
  },
  (t) => [
    check("revisiones_anuales_estado_valido", sql`${t.estado} IN ('abierta', 'cerrada')`),
    check(
      "revisiones_anuales_metodo_cierre_valido",
      sql`${t.metodoCierre} IN ('clave', 'clave_totp')`,
    ),
    // Cerrada, siempre con quién, cuándo y el método de la firma; abierta, nunca con los tres.
    check(
      "revisiones_anuales_cierre_coherente",
      sql`(${t.estado} = 'cerrada') = (${t.cerradaPor} IS NOT NULL AND ${t.cerradaEn} IS NOT NULL AND ${t.metodoCierre} IS NOT NULL)`,
    ),
    uniqueIndex("revisiones_una_abierta_idx").on(t.estado).where(sql`estado = 'abierta'`),
  ],
);

export const revisionAnualProcesos = pgTable(
  "revision_anual_procesos",
  {
    id: id(),
    revisionId: ref("revision_id", () => revisionesAnuales.id).notNull(),
    procesoId: ref("proceso_id", () => procesos.id).notNull(),
    // Documentos del proceso al abrir la revisión.
    documentos: integer("documentos").notNull(),
    normogramaResultado: text("normograma_resultado"),
    normogramaNota: text("normograma_nota"),
    normogramaPor: refUsuario("normograma_por"),
    normogramaEn: marca("normograma_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
  },
  (t) => [
    unique("revision_anual_procesos_unica").on(t.revisionId, t.procesoId),
    check(
      "revision_anual_procesos_normograma_valido",
      sql`${t.normogramaResultado} IN ('sin_novedad', 'cambios')`,
    ),
  ],
);

// Solo-inserción (trigger en la migración).
export const ratificaciones = pgTable(
  "ratificaciones",
  {
    id: id(),
    versionId: ref("version_id", () => documentoVersiones.id).notNull(),
    firmaId: ref("firma_id", () => firmas.id).notNull().unique(),
    nota: text("nota"),
    proximaRevision: date("proxima_revision").notNull(),
    revisionAnualId: ref("revision_anual_id", () => revisionesAnuales.id),
    creadoEn: creado(),
  },
  (t) => [index("ratificaciones_version_idx").on(t.versionId, t.creadoEn)],
);

// Control propio de un documento con `origen = 'externo'`.
export const externos = pgTable(
  "externos",
  {
    id: id(),
    documentoId: ref("documento_id", () => documentos.id).notNull().unique(),
    entidadEmisora: text("entidad_emisora").notNull(),
    tituloOriginal: text("titulo_original"),
    fuenteOficial: text("fuente_oficial"),
    // Responsable técnico de verificar su vigencia.
    responsableId: refUsuario("responsable_id").notNull(),
    verificacionMeses: integer("verificacion_meses").notNull().default(12),
    edicionNuevaPendienteDesde: marca("edicion_nueva_pendiente_desde"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    creadoEn: creado(),
    actualizadoEn: marca("actualizado_en").notNull().defaultNow(),
  },
  (t) => [
    check("externos_verificacion_meses_valido", sql`${t.verificacionMeses} BETWEEN 1 AND 60`),
    index("externos_responsable_idx").on(t.responsableId),
  ],
);

// Solo-inserción (trigger en la migración).
export const externoVerificaciones = pgTable(
  "externo_verificaciones",
  {
    id: id(),
    documentoId: ref("documento_id", () => documentos.id).notNull(),
    versionId: ref("version_id", () => documentoVersiones.id).notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
    resultado: text("resultado").notNull(),
    fuenteConsultada: text("fuente_consultada").notNull(),
    nota: text("nota"),
    revisionAnualId: ref("revision_anual_id", () => revisionesAnuales.id),
    impactoId: ref("impacto_id", (): AnyPgColumn => impactosNormativos.id),
    creadoEn: creado(),
  },
  (t) => [
    check(
      "externo_verificaciones_resultado_valido",
      sql`${t.resultado} IN ('vigente', 'edicion_nueva', 'retirado')`,
    ),
    index("externo_verificaciones_documento_idx").on(t.documentoId, t.creadoEn),
  ],
);

// Una tarea por cambio normativo y proceso (o documento del proceso).
export const impactosNormativos = pgTable(
  "impactos_normativos",
  {
    id: id(),
    cambioId: ref("cambio_id", () => normaCambios.id).notNull(),
    normaId: ref("norma_id", () => normas.id).notNull(),
    documentoId: ref("documento_id", () => documentos.id),
    procesoId: ref("proceso_id", () => procesos.id).notNull(),
    estado: text("estado").notNull().default("pendiente"),
    venceEn: marca("vence_en").notNull(),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    resolucion: text("resolucion"),
    tramiteId: ref("tramite_id", (): AnyPgColumn => tramites.id),
    verificacionId: ref("verificacion_id", (): AnyPgColumn => externoVerificaciones.id),
    nota: text("nota"),
    resueltoPor: refUsuario("resuelto_por"),
    resueltoEn: marca("resuelto_en"),
    creadoEn: creado(),
  },
  (t) => [
    check("impactos_normativos_estado_valido", sql`${t.estado} IN ('pendiente', 'resuelto')`),
    check(
      "impactos_normativos_resolucion_valida",
      sql`${t.resolucion} IN ('solicitud', 'no_afecta', 'verificacion')`,
    ),
    index("impactos_normativos_documento_idx").on(t.documentoId, t.estado),
    index("impactos_normativos_proceso_idx").on(t.procesoId, t.estado),
  ],
);

export const revisionAnualDecisiones = pgTable(
  "revision_anual_decisiones",
  {
    id: id(),
    revisionId: ref("revision_id", () => revisionesAnuales.id).notNull(),
    documentoId: ref("documento_id", () => documentos.id).notNull(),
    // La versión vigente al abrir la revisión; la adopción de una edición la mueve a la versión adoptada.
    versionId: ref("version_id", () => documentoVersiones.id).notNull(),
    decision: text("decision").notNull(),
    // Nulo cuando la registra el sistema.
    usuarioId: refUsuario("usuario_id"),
    ratificacionId: ref("ratificacion_id", () => ratificaciones.id),
    verificacionId: ref("verificacion_id", () => externoVerificaciones.id),
    tramiteId: ref("tramite_id", () => tramites.id),
    insumos: jsonb("insumos").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creado(),
    actualizadoEn: marca("actualizado_en").notNull().defaultNow(),
  },
  (t) => [
    unique("revision_anual_decisiones_unica").on(t.revisionId, t.documentoId),
    check(
      "revision_anual_decisiones_decision_valida",
      sql`${t.decision} IN ('ratificar', 'actualizar', 'eliminar', 'reciente', 'en_tramite', 'sin_revisar')`,
    ),
    index("revision_anual_decisiones_tramite_idx").on(t.tramiteId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Grupo: indicadores (Fase 14). «Indicadores» ya nombra cosas de la 13C (indicadores documentales);
// aquí viven la ficha, las mediciones y sus maestros.
// ─────────────────────────────────────────────────────────────────────────────

const num = (nombre: string) => numeric(nombre);

export const tiposIndicador = pgTable(
  "tipos_indicador",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [uniqueIndex("tipos_indicador_nombre_unico").on(sql`lower(${t.nombre})`)],
);

export const clasificacionesIndicador = pgTable(
  "clasificaciones_indicador",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    // Quién aprueba la ficha: Gerencia o el líder del proceso.
    aprueba: text("aprueba").notNull(),
    exigeNorma: boolean("exige_norma").notNull().default(false),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("clasificaciones_indicador_nombre_unico").on(sql`lower(${t.nombre})`),
    check("clasificaciones_indicador_aprueba_valida", sql`${t.aprueba} IN ('gerencia', 'lider')`),
  ],
);

export const unidadesIndicador = pgTable(
  "unidades_indicador",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    sufijo: text("sufijo").notNull().default(""),
    decimales: integer("decimales").notNull().default(0),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("unidades_indicador_nombre_unico").on(sql`lower(${t.nombre})`),
    check("unidades_indicador_decimales_validos", sql`${t.decimales} BETWEEN 0 AND 4`),
  ],
);

export const objetivos = pgTable(
  "objetivos",
  {
    id: id(),
    clase: text("clase").notNull(),
    enunciado: text("enunciado").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [check("objetivos_clase_valida", sql`${t.clase} IN ('calidad', 'institucional')`)],
);

export const dimensiones = pgTable("dimensiones", {
  id: id(),
  nombre: text("nombre").notNull().unique(),
});

export const dimensionCategorias = pgTable("dimension_categorias", {
  id: id(),
  dimensionId: ref("dimension_id", () => dimensiones.id).notNull(),
  nombre: text("nombre").notNull(),
  orden: integer("orden").notNull(),
  activo: boolean("activo").notNull().default(true),
});

export const indicadores = pgTable(
  "indicadores",
  {
    id: id(),
    codigo: text("codigo").notNull(),
    procesoId: ref("proceso_id", () => procesos.id).notNull(),
    estado: text("estado").notNull().default("borrador"),
    nivelAcceso: text("nivel_acceso").notNull().default("general"),
    plazoReporteDias: integer("plazo_reporte_dias").notNull().default(10),
    // Clave de periodo (`2026-03`, `2026-T1`…) desde la que se mide.
    inicioMedicion: text("inicio_medicion"),
    soporteObligatorio: boolean("soporte_obligatorio").notNull().default(false),
    bajaPor: refUsuario("baja_por"),
    bajaEn: marca("baja_en"),
    bajaMotivo: text("baja_motivo"),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
  },
  (t) => [
    uniqueIndex("indicadores_codigo_unico").on(sql`lower(${t.codigo})`),
    index("indicadores_proceso_idx").on(t.procesoId),
    check("indicadores_estado_valido", sql`${t.estado} IN ('borrador', 'activo', 'retirado', 'descartado')`),
    check("indicadores_nivel_acceso_valido", sql`${t.nivelAcceso} IN ('general', 'restringido')`),
    check("indicadores_plazo_reporte_valido", sql`${t.plazoReporteDias} BETWEEN 0 AND 90`),
    check(
      "indicadores_baja_coherente",
      sql`(${t.estado} IN ('retirado', 'descartado')) = (${t.bajaPor} IS NOT NULL AND ${t.bajaEn} IS NOT NULL AND ${t.bajaMotivo} IS NOT NULL)`,
    ),
  ],
);

// Solo-inserción (triggers en la migración 0012): el registro de un lote de fichas importadas y sus eventos.
export const importacionesIndicadores = pgTable("importaciones_indicadores", {
  id: id(),
  cargadoPor: refUsuario("cargado_por").notNull(),
  cargadoEn: marca("cargado_en").notNull().defaultNow(),
});

export const importacionEventos = pgTable(
  "importacion_eventos",
  {
    id: id(),
    importacionId: ref("importacion_id", () => importacionesIndicadores.id).notNull(),
    tipo: text("tipo").notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
    metodo: text("metodo"),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creado(),
  },
  (t) => [
    uniqueIndex("importacion_eventos_tipo_unico").on(t.importacionId, t.tipo),
    check("importacion_eventos_tipo_valido", sql`${t.tipo} IN ('importado', 'deshecho')`),
  ],
);

// Aprobada es inmutable, con sus variables, responsables y normas: trigger `sgc_impedir_si_version_aprobada` (de la 0011;
// la función vigente es la de la 0012, con su única excepción: deshacer un lote de importación, spec 14A §5.9).
export const indicadorVersiones = pgTable(
  "indicador_versiones",
  {
    id: id(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    numero: integer("numero").notNull(),
    estado: text("estado").notNull().default("borrador"),
    tipoCambio: text("tipo_cambio").notNull(),
    motivoCambio: text("motivo_cambio"),
    // Clave de periodo desde la que rige.
    rigeDesde: text("rige_desde"),
    nombre: text("nombre"),
    proposito: text("proposito"),
    requisito: text("requisito"),
    tipoId: ref("tipo_id", () => tiposIndicador.id),
    tipoNombre: text("tipo_nombre"),
    clasificacionId: ref("clasificacion_id", () => clasificacionesIndicador.id),
    clasificacionNombre: text("clasificacion_nombre"),
    objetivoId: ref("objetivo_id", () => objetivos.id),
    objetivoNombre: text("objetivo_nombre"),
    procesoNombre: text("proceso_nombre"),
    subprocesoId: ref("subproceso_id", () => subprocesos.id),
    subprocesoNombre: text("subproceso_nombre"),
    procedimientoDocumentoId: ref("procedimiento_documento_id", () => documentos.id),
    puntoControl: text("punto_control"),
    origenDato: text("origen_dato").notNull().default("manual"),
    calculo: text("calculo"),
    calculoAlcance: text("calculo_alcance"),
    forma: text("forma"),
    factor: integer("factor"),
    formula: text("formula"),
    unidadId: ref("unidad_id", () => unidadesIndicador.id),
    unidadNombre: text("unidad_nombre"),
    unidadSufijo: text("unidad_sufijo"),
    decimales: integer("decimales"),
    periodicidad: text("periodicidad"),
    tendencia: text("tendencia"),
    meta: num("meta"),
    metaMax: num("meta_max"),
    semaforoModo: text("semaforo_modo"),
    rangos: jsonb("rangos"),
    nivel: text("nivel"),
    riesgoAsociado: text("riesgo_asociado"),
    importacionId: ref("importacion_id", () => importacionesIndicadores.id),
    aprobacionPreviaDocumento: text("aprobacion_previa_documento"),
    aprobacionPreviaPor: text("aprobacion_previa_por"),
    aprobacionPreviaFecha: date("aprobacion_previa_fecha"),
    umbralAtencionPct: integer("umbral_atencion_pct"),
    limiteCritico: num("limite_critico"),
    tolerancia: num("tolerancia"),
    resultadoMin: num("resultado_min"),
    resultadoMax: num("resultado_max"),
    lineaBaseValor: num("linea_base_valor"),
    lineaBasePeriodo: text("linea_base_periodo"),
    lineaBaseNota: text("linea_base_nota"),
    sustentoMeta: text("sustento_meta"),
    ente: text("ente"),
    periodicidadExterna: text("periodicidad_externa"),
    plazoExternoDias: integer("plazo_externo_dias"),
    dimensionId: ref("dimension_id", () => dimensiones.id),
    prueba: jsonb("prueba"),
    notaDevolucion: text("nota_devolucion"),
    huella: text("huella"),
    elaboradaPor: refUsuario("elaborada_por"),
    elaboradaEn: marca("elaborada_en"),
    aprobadaPor: refUsuario("aprobada_por"),
    aprobadaEn: marca("aprobada_en"),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
    actualizadoEn: marca("actualizado_en").notNull().defaultNow(),
  },
  (t) => [
    unique("indicador_versiones_numero_unico").on(t.indicadorId, t.numero),
    uniqueIndex("indicador_versiones_un_borrador_idx")
      .on(t.indicadorId)
      .where(sql`estado IN ('borrador', 'por_aprobar')`),
    check("indicador_versiones_estado_valido", sql`${t.estado} IN ('borrador', 'por_aprobar', 'aprobada', 'descartada')`),
    check("indicador_versiones_tipo_cambio_valido", sql`${t.tipoCambio} IN ('inicial', 'mayor', 'menor')`),
    check("indicador_versiones_origen_dato_valido", sql`${t.origenDato} IN ('manual', 'automatico')`),
    check("indicador_versiones_forma_valida", sql`${t.forma} IN ('porcentaje', 'tasa', 'razon', 'conteo', 'libre')`),
    check(
      "indicador_versiones_periodicidad_valida",
      sql`${t.periodicidad} IN ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual')`,
    ),
    check("indicador_versiones_tendencia_valida", sql`${t.tendencia} IN ('ascendente', 'descendente', 'constante')`),
    check("indicador_versiones_semaforo_modo_valido", sql`${t.semaforoModo} IN ('relativo', 'fijo', 'rangos')`),
    check("indicador_versiones_rangos_con_modo", sql`(${t.semaforoModo} IS DISTINCT FROM 'rangos') = (${t.rangos} IS NULL)`),
    check(
      "indicador_versiones_importada_coherente",
      sql`${t.importacionId} IS NULL OR ${t.estado} <> 'aprobada' OR (${t.aprobacionPreviaDocumento} IS NOT NULL AND ${t.aprobacionPreviaPor} IS NOT NULL AND ${t.aprobacionPreviaFecha} IS NOT NULL)`,
    ),
    check("indicador_versiones_decimales_validos", sql`${t.decimales} BETWEEN 0 AND 4`),
    check("indicador_versiones_umbral_valido", sql`${t.umbralAtencionPct} BETWEEN 1 AND 99`),
    check(
      "indicador_versiones_aprobada_coherente",
      sql`${t.estado} <> 'aprobada' OR (${t.elaboradaPor} IS NOT NULL AND ${t.huella} IS NOT NULL AND ${t.rigeDesde} IS NOT NULL AND (${t.tipoCambio} = 'menor' OR ${t.aprobadaPor} IS NOT NULL))`,
    ),
  ],
);

export const variablesCompartidas = pgTable(
  "variables_compartidas",
  {
    id: id(),
    procesoId: ref("proceso_id", () => procesos.id).notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    fuente: text("fuente"),
    unidad: text("unidad"),
    periodicidad: text("periodicidad"),
    consolidacion: text("consolidacion"),
    capturaMin: num("captura_min"),
    capturaMax: num("captura_max"),
    admiteNegativos: boolean("admite_negativos").notNull().default(false),
    plazoReporteDias: integer("plazo_reporte_dias"),
    dimensionId: ref("dimension_id", () => dimensiones.id),
    activa: boolean("activa").notNull().default(true),
  },
  (t) => [unique("variables_compartidas_unica").on(t.procesoId, t.nombre)],
);

export const indicadorVariables = pgTable(
  "indicador_variables",
  {
    id: id(),
    versionId: ref("version_id", () => indicadorVersiones.id).notNull(),
    letra: text("letra").notNull(),
    nombre: text("nombre"),
    descripcion: text("descripcion"),
    fuente: text("fuente"),
    unidad: text("unidad"),
    consolidacion: text("consolidacion").notNull().default("suma"),
    origen: text("origen").notNull().default("propia"),
    variableCompartidaId: ref("variable_compartida_id", () => variablesCompartidas.id),
    indicadorOrigenId: ref("indicador_origen_id", () => indicadores.id),
    toma: text("toma"),
    capturaMin: num("captura_min"),
    capturaMax: num("captura_max"),
    admiteNegativos: boolean("admite_negativos").notNull().default(false),
    orden: integer("orden").notNull().default(0),
  },
  (t) => [
    unique("indicador_variables_letra_unica").on(t.versionId, t.letra),
    check("indicador_variables_letra_valida", sql`${t.letra} ~ '^[A-Z]$'`),
    check("indicador_variables_consolidacion_valida", sql`${t.consolidacion} IN ('suma', 'ultimo', 'promedio')`),
    check("indicador_variables_origen_valido", sql`${t.origen} IN ('propia', 'compartida', 'automatica', 'indicador')`),
    check("indicador_variables_toma_valida", sql`${t.toma} IN ('valor', 'cumplimiento')`),
  ],
);

export const indicadorResponsables = pgTable(
  "indicador_responsables",
  {
    id: id(),
    versionId: ref("version_id", () => indicadorVersiones.id).notNull(),
    cargoId: ref("cargo_id", () => cargos.id).notNull(),
    cargoNombre: text("cargo_nombre").notNull(),
    funcion: text("funcion").notNull(),
  },
  (t) => [
    unique("indicador_responsables_unico").on(t.versionId, t.cargoId, t.funcion),
    check("indicador_responsables_funcion_valida", sql`${t.funcion} IN ('medir', 'analizar')`),
  ],
);

export const indicadorNormas = pgTable(
  "indicador_normas",
  {
    id: id(),
    versionId: ref("version_id", () => indicadorVersiones.id).notNull(),
    normaId: ref("norma_id", () => normas.id).notNull(),
    normaNombre: text("norma_nombre").notNull(),
  },
  (t) => [unique("indicador_normas_unica").on(t.versionId, t.normaId)],
);

export const indicadorDesignados = pgTable(
  "indicador_designados",
  {
    id: id(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
    funcion: text("funcion").notNull(),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
  },
  (t) => [
    unique("indicador_designados_unico").on(t.indicadorId, t.usuarioId, t.funcion),
    index("indicador_designados_usuario_idx").on(t.usuarioId),
    check("indicador_designados_funcion_valida", sql`${t.funcion} IN ('mide', 'analiza', 'seguimiento')`),
  ],
);

export const indicadorMetas = pgTable(
  "indicador_metas",
  {
    id: id(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    periodo: text("periodo").notNull(),
    meta: num("meta"),
    metaMax: num("meta_max"),
    justificacion: text("justificacion"),
    tardia: boolean("tardia").notNull().default(false),
    programadaPor: refUsuario("programada_por").notNull(),
    programadaEn: marca("programada_en").notNull().defaultNow(),
  },
  (t) => [unique("indicador_metas_unica").on(t.indicadorId, t.periodo)],
);

// Solo-inserción (trigger en la migración 0011).
export const cierresIndicadores = pgTable("cierres_indicadores", {
  id: id(),
  // El último día del mes cerrado.
  mes: date("mes").notNull().unique(),
  cerradoPor: refUsuario("cerrado_por").notNull(),
  cerradoEn: marca("cerrado_en").notNull().defaultNow(),
  resumen: jsonb("resumen").notNull().default(sql`'{}'::jsonb`),
});

// Cerrada es inmutable salvo su reapertura (trigger en la migración 0011).
export const mediciones = pgTable(
  "mediciones",
  {
    id: id(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    versionId: ref("version_id", () => indicadorVersiones.id).notNull(),
    periodo: text("periodo").notNull(),
    desde: marca("desde").notNull(),
    hasta: marca("hasta").notNull(),
    venceEn: marca("vence_en").notNull(),
    estado: text("estado").notNull().default("abierta"),
    historica: boolean("historica").notNull().default(false),
    noAplica: boolean("no_aplica").notNull().default(false),
    noAplicaMotivo: text("no_aplica_motivo"),
    // La fracción exacta como «n/d»; con ella se decide el semáforo.
    resultadoExacto: text("resultado_exacto"),
    resultado: num("resultado"),
    semaforo: text("semaforo"),
    // Nulo en las filas anteriores a la 0012: se lee con `cumpleDeFila`.
    cumple: boolean("cumple"),
    metaAplicada: num("meta_aplicada"),
    metaMaxAplicada: num("meta_max_aplicada"),
    limiteAplicado: num("limite_aplicado"),
    requiereAccion: boolean("requiere_accion").notNull().default(false),
    incumplimientoRepetido: boolean("incumplimiento_repetido").notNull().default(false),
    analisis: text("analisis"),
    causa: text("causa"),
    accionPropuesta: text("accion_propuesta"),
    reportadaPor: refUsuario("reportada_por"),
    reportadaEn: marca("reportada_en"),
    analizadaPor: refUsuario("analizada_por"),
    analizadaEn: marca("analizada_en"),
    corregida: boolean("corregida").notNull().default(false),
    metaTardia: boolean("meta_tardia").notNull().default(false),
    sinAnalisis: boolean("sin_analisis").notNull().default(false),
    cierreId: ref("cierre_id", () => cierresIndicadores.id),
    reabiertaPor: refUsuario("reabierta_por"),
    reabiertaEn: marca("reabierta_en"),
    reabiertaMotivo: text("reabierta_motivo"),
    avisoPrevioEn: marca("aviso_previo_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    alertaEstado: text("alerta_estado"),
  },
  (t) => [
    unique("mediciones_periodo_unico").on(t.indicadorId, t.periodo),
    index("mediciones_estado_vence_idx").on(t.estado, t.venceEn),
    index("mediciones_indicador_hasta_idx").on(t.indicadorId, t.hasta),
    check("mediciones_estado_valido", sql`${t.estado} IN ('abierta', 'reportada', 'cerrada')`),
    check("mediciones_semaforo_valido", sql`${t.semaforo} IN ('bien', 'atencion', 'critico')`),
  ],
);

export const medicionValores = pgTable(
  "medicion_valores",
  {
    id: id(),
    medicionId: ref("medicion_id", () => mediciones.id).notNull(),
    variableId: ref("variable_id", () => indicadorVariables.id).notNull(),
    categoriaId: ref("categoria_id", () => dimensionCategorias.id),
    valor: num("valor"),
    noAplica: boolean("no_aplica").notNull().default(false),
    noAplicaMotivo: text("no_aplica_motivo"),
    reportadoPor: refUsuario("reportado_por"),
    reportadoEn: marca("reportado_en"),
  },
  // La migración lo crea con NULLS NOT DISTINCT: un valor sin categoría también es único.
  (t) => [uniqueIndex("medicion_valores_unico_idx").on(t.medicionId, t.variableId, t.categoriaId)],
);

// Solo-inserción (trigger y REVOKE en roles-bd.ts).
export const medicionEventos = pgTable(
  "medicion_eventos",
  {
    id: id(),
    medicionId: ref("medicion_id", () => mediciones.id).notNull(),
    tipo: text("tipo").notNull(),
    // Nulo cuando lo hizo el sistema.
    usuarioId: refUsuario("usuario_id"),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creado(),
  },
  (t) => [
    index("medicion_eventos_medicion_idx").on(t.medicionId, t.creadoEn),
    check(
      "medicion_eventos_tipo_valido",
      sql`${t.tipo} IN ('reporte', 'correccion', 'analisis', 'no_aplica', 'meta', 'soporte', 'cierre', 'reapertura', 'recalculo', 'historico')`,
    ),
  ],
);

// Solo-inserción (trigger y REVOKE en roles-bd.ts).
export const medicionObservaciones = pgTable(
  "medicion_observaciones",
  {
    id: id(),
    medicionId: ref("medicion_id", () => mediciones.id).notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
    texto: text("texto").notNull(),
    respondeA: ref("responde_a", (): AnyPgColumn => medicionObservaciones.id),
    creadoEn: creado(),
  },
  (t) => [index("medicion_observaciones_medicion_idx").on(t.medicionId, t.creadoEn)],
);

// Las tablas siguientes son de la 14B: nacen vacías y la migración 0012 puede rehacerlas (spec §19.5).
export const variableResponsables = pgTable(
  "variable_responsables",
  {
    id: id(),
    variableId: ref("variable_id", () => variablesCompartidas.id).notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
  },
  (t) => [unique("variable_responsables_unico").on(t.variableId, t.usuarioId)],
);

export const variableValores = pgTable(
  "variable_valores",
  {
    id: id(),
    variableId: ref("variable_id", () => variablesCompartidas.id).notNull(),
    periodo: text("periodo").notNull(),
    categoriaId: ref("categoria_id", () => dimensionCategorias.id),
    valor: num("valor"),
    estado: text("estado").notNull().default("pendiente"),
    venceEn: marca("vence_en"),
    reportadoPor: refUsuario("reportado_por"),
    reportadoEn: marca("reportado_en"),
    avisoPrevioEn: marca("aviso_previo_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    cierreId: ref("cierre_id", () => cierresIndicadores.id),
  },
  // La migración lo crea con NULLS NOT DISTINCT.
  (t) => [uniqueIndex("variable_valores_unico_idx").on(t.variableId, t.periodo, t.categoriaId)],
);

export const calculoFotos = pgTable(
  "calculo_fotos",
  {
    id: id(),
    calculo: text("calculo").notNull(),
    // Alcance: un proceso, una clase de objetivo, o ambos nulos para la entidad.
    procesoId: ref("proceso_id", () => procesos.id),
    claseObjetivo: text("clase_objetivo"),
    periodo: text("periodo").notNull(),
    numerador: num("numerador"),
    denominador: num("denominador"),
    valor: num("valor"),
    tomadaEn: marca("tomada_en").notNull().defaultNow(),
    historica: boolean("historica").notNull().default(false),
    cierreId: ref("cierre_id", () => cierresIndicadores.id),
  },
  // La migración lo crea con NULLS NOT DISTINCT.
  (t) => [uniqueIndex("calculo_fotos_unico_idx").on(t.calculo, t.procesoId, t.claseObjetivo, t.periodo)],
);

export const reportesExternos = pgTable(
  "reportes_externos",
  {
    id: id(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    periodo: text("periodo").notNull(),
    desde: date("desde").notNull(),
    hasta: date("hasta").notNull(),
    venceEn: marca("vence_en").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    fechaEnvio: date("fecha_envio"),
    radicado: text("radicado"),
    resultadoEnviado: text("resultado_enviado"),
    nota: text("nota"),
    registradaPor: refUsuario("registrada_por"),
    registradaEn: marca("registrada_en"),
    avisoPrevioEn: marca("aviso_previo_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
  },
  (t) => [unique("reportes_externos_unico").on(t.indicadorId, t.periodo)],
);

export const impactosIndicadores = pgTable(
  "impactos_indicadores",
  {
    id: id(),
    normaCambioId: ref("norma_cambio_id", () => normaCambios.id).notNull(),
    normaId: ref("norma_id", () => normas.id).notNull(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    estado: text("estado").notNull().default("pendiente"),
    venceEn: marca("vence_en").notNull(),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    resolucion: text("resolucion"),
    versionId: ref("version_id", () => indicadorVersiones.id),
    nota: text("nota"),
    resueltoPor: refUsuario("resuelto_por"),
    resueltoEn: marca("resuelto_en"),
  },
  (t) => [unique("impactos_indicadores_unico").on(t.normaCambioId, t.indicadorId)],
);
