import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
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
    // norma, revisión anual, hallazgo, lo de los indicadores o lo de mejoramiento (`mejora_*`).
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
      sql`${t.rol} IN ('principal', 'editable', 'anexo', 'acta_aprobacion', 'acta_eliminacion', 'evidencia', 'correccion', 'carga', 'analisis', 'verificacion')`,
    ),
    check(
      "archivos_contexto_valido",
      sql`${t.contexto} IN ('version', 'jornada', 'verificacion_item', 'norma', 'revision_anual', 'hallazgo', 'medicion', 'reporte_externo', 'importacion_indicadores', 'dato_compartido', 'mejora_hallazgo', 'mejora_ronda', 'mejora_actividad', 'mejora_reporte', 'mejora_plan')`,
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
    // Las de un hallazgo de mejoramiento (las del plan, `verifico` y `cerro`), con la ronda del hallazgo.
    mejoraHallazgoId: bigint("mejora_hallazgo_id", { mode: "number" }).references(
      (): AnyPgColumn => mejoraHallazgos.id,
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
      sql`${t.firma} IN ('elaboro', 'reviso', 'aprobo', 'publico', 'ratifico', 'adopto', 'verifico', 'cerro')`,
    ),
    check(
      "firmas_tramite_coherente",
      sql`${t.tramiteId} IS NOT NULL OR ${t.firma} IN ('ratifico', 'adopto') OR ${t.indicadorVersionId} IS NOT NULL OR ${t.mejoraHallazgoId} IS NOT NULL`,
    ),
    check("firmas_metodo_valido", sql`${t.metodo} IN ('clave', 'clave_totp')`),
    index("firmas_tramite_idx").on(t.tramiteId),
    index("firmas_version_idx").on(t.versionId),
    index("firmas_indicador_version_idx").on(t.indicadorVersionId),
    index("firmas_mejora_hallazgo_idx").on(t.mejoraHallazgoId),
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

export const dimensiones = pgTable(
  "dimensiones",
  {
    id: id(),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [uniqueIndex("dimensiones_nombre_idx").on(sql`lower(${t.nombre})`)],
);

export const dimensionCategorias = pgTable(
  "dimension_categorias",
  {
    id: id(),
    dimensionId: ref("dimension_id", () => dimensiones.id).notNull(),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull(),
    activo: boolean("activo").notNull().default(true),
    creadoEn: creado(),
    // Desde cuándo un periodo nuevo ya no la pide.
    desactivadaEn: marca("desactivada_en"),
  },
  // Única dentro de su dimensión sin distinguir mayúsculas; también es el índice por dimensión.
  (t) => [uniqueIndex("dimension_categorias_nombre_idx").on(t.dimensionId, sql`lower(${t.nombre})`)],
);

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
    // Desde cuándo lo exige; nula si no lo exige (`indicadores_soporte_desde`). Se muestra y se audita: si una medición
    // debe el soporte lo decide su marca (`mediciones.debe_soporte`), no esta fecha.
    soporteObligatorioDesde: marca("soporte_obligatorio_desde"),
    bajaPor: refUsuario("baja_por"),
    bajaEn: marca("baja_en"),
    bajaMotivo: text("baja_motivo"),
    // El cálculo y el alcance de la ficha vigente, si es automática. A lo sumo un activo por cálculo y alcance (con
    // alcance «proceso», por proceso): índice único parcial `indicadores_calculo_unico`, en la migración 0013.
    calculo: text("calculo"),
    calculoAlcance: text("calculo_alcance"),
    // Desde cuándo la ficha vigente se reporta a su ente con su periodicidad y su plazo.
    enteDesde: marca("ente_desde"),
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
    check("indicadores_calculo_coherente", sql`(${t.calculo} IS NULL) = (${t.calculoAlcance} IS NULL)`),
    check(
      "indicadores_soporte_desde",
      sql`(${t.soporteObligatorio} AND ${t.soporteObligatorioDesde} IS NOT NULL) OR (NOT ${t.soporteObligatorio} AND ${t.soporteObligatorioDesde} IS NULL)`,
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
    // El nombre con que se firmó la dimensión.
    dimensionNombre: text("dimension_nombre"),
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
    check(
      "indicador_versiones_automatica_coherente",
      sql`(${t.origenDato} = 'automatico') = (${t.calculo} IS NOT NULL AND ${t.calculoAlcance} IS NOT NULL)`,
    ),
    check("indicador_versiones_calculo_coherente", sql`(${t.calculo} IS NULL) = (${t.calculoAlcance} IS NULL)`),
    check(
      "indicador_versiones_alcance_valido",
      sql`${t.calculoAlcance} IN ('entidad', 'proceso', 'calidad', 'institucional', 'todos')`,
    ),
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
    check("indicador_versiones_dimension_manual", sql`${t.dimensionId} IS NULL OR ${t.origenDato} = 'manual'`),
    check("indicador_versiones_dimension_coherente", sql`(${t.dimensionId} IS NULL) = (${t.dimensionNombre} IS NULL)`),
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
    periodicidad: text("periodicidad").notNull(),
    consolidacion: text("consolidacion").notNull(),
    capturaMin: num("captura_min"),
    capturaMax: num("captura_max"),
    admiteNegativos: boolean("admite_negativos").notNull().default(false),
    plazoReporteDias: integer("plazo_reporte_dias").notNull(),
    dimensionId: ref("dimension_id", () => dimensiones.id),
    activa: boolean("activa").notNull().default(true),
    creadoPor: refUsuario("creado_por"),
    creadoEn: creado(),
  },
  (t) => [
    uniqueIndex("variables_compartidas_nombre_idx").on(t.procesoId, sql`lower(${t.nombre})`),
    check(
      "variables_compartidas_periodicidad_valida",
      sql`${t.periodicidad} IN ('mensual', 'bimestral', 'trimestral', 'semestral', 'anual')`,
    ),
    check("variables_compartidas_consolidacion_valida", sql`${t.consolidacion} IN ('suma', 'ultimo', 'promedio')`),
    check("variables_compartidas_plazo_valido", sql`${t.plazoReporteDias} BETWEEN 0 AND 90`),
  ],
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
    // La periodicidad del dato citado, firmada.
    datoPeriodicidad: text("dato_periodicidad"),
    indicadorOrigenId: ref("indicador_origen_id", () => indicadores.id),
    // El código y el nombre del componente, firmados.
    origenCodigo: text("origen_codigo"),
    origenNombre: text("origen_nombre"),
    toma: text("toma"),
    capturaMin: num("captura_min"),
    capturaMax: num("captura_max"),
    admiteNegativos: boolean("admite_negativos").notNull().default(false),
    orden: integer("orden").notNull().default(0),
  },
  (t) => [
    unique("indicador_variables_letra_unica").on(t.versionId, t.letra),
    index("indicador_variables_dato_idx").on(t.variableCompartidaId),
    index("indicador_variables_origen_idx").on(t.indicadorOrigenId),
    check("indicador_variables_letra_valida", sql`${t.letra} ~ '^[A-Z]$'`),
    check("indicador_variables_consolidacion_valida", sql`${t.consolidacion} IN ('suma', 'ultimo', 'promedio')`),
    check("indicador_variables_origen_valido", sql`${t.origen} IN ('propia', 'compartida', 'automatica', 'indicador')`),
    check("indicador_variables_toma_valida", sql`${t.toma} IN ('valor', 'cumplimiento')`),
    check(
      "indicador_variables_origen_coherente",
      sql`(${t.origen} = 'compartida') = (${t.variableCompartidaId} IS NOT NULL) AND (${t.origen} = 'indicador') = (${t.indicadorOrigenId} IS NOT NULL) AND (${t.origen} = 'indicador') = (${t.toma} IS NOT NULL)`,
    ),
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
    // Si quedó obligada a llevar soporte: se decide una vez, al activarse el soporte o al nacer la medición.
    debeSoporte: boolean("debe_soporte").notNull().default(false),
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
    // Cuándo el sistema tomó la foto de una medición automática.
    fotoEn: marca("foto_en"),
    // Las categorías que pide la medición, si la ficha tiene dimensión, y cuántas quedaron en Crítico.
    categorias: jsonb("categorias"),
    categoriasEnCritico: integer("categorias_en_critico"),
  },
  (t) => [
    unique("mediciones_periodo_unico").on(t.indicadorId, t.periodo),
    index("mediciones_estado_vence_idx").on(t.estado, t.venceEn),
    index("mediciones_indicador_hasta_idx").on(t.indicadorId, t.hasta),
    index("mediciones_cierre_idx").on(t.cierreId),
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
    // La fracción exacta como «n/d», como `mediciones.resultado_exacto`.
    valorExacto: text("valor_exacto"),
    noAplica: boolean("no_aplica").notNull().default(false),
    noAplicaMotivo: text("no_aplica_motivo"),
    reportadoPor: refUsuario("reportado_por"),
    reportadoEn: marca("reportado_en"),
  },
  (t) => [
    // La migración 0011 lo crea con NULLS NOT DISTINCT: un valor sin categoría también es único.
    uniqueIndex("medicion_valores_unico_idx").on(t.medicionId, t.variableId, t.categoriaId),
    index("medicion_valores_categoria_idx").on(t.categoriaId),
  ],
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
      sql`${t.tipo} IN ('reporte', 'correccion', 'analisis', 'no_aplica', 'meta', 'soporte', 'cierre', 'reapertura', 'recalculo', 'historico', 'foto', 'propagacion', 'categorias')`,
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
  (t) => [
    index("medicion_observaciones_medicion_idx").on(t.medicionId, t.creadoEn),
    index("medicion_observaciones_responde_idx").on(t.respondeA),
  ],
);

// Las tablas siguientes son de la 14C, como `variables_compartidas`, `dimensiones` y `dimension_categorias`: nacieron
// vacías en la 0011 y la 0015 las alteró en su sitio (anexo 14C, §8).
export const variableResponsables = pgTable(
  "variable_responsables",
  {
    id: id(),
    variableId: ref("variable_id", () => variablesCompartidas.id).notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
    designadoPor: refUsuario("designado_por"),
    designadoEn: marca("designado_en").notNull().defaultNow(),
  },
  (t) => [
    unique("variable_responsables_unico").on(t.variableId, t.usuarioId),
    index("variable_responsables_usuario_idx").on(t.usuarioId),
  ],
);

// Una fila es un periodo del dato.
export const variableValores = pgTable(
  "variable_valores",
  {
    id: id(),
    variableId: ref("variable_id", () => variablesCompartidas.id).notNull(),
    periodo: text("periodo").notNull(),
    desde: marca("desde").notNull(),
    hasta: marca("hasta").notNull(),
    // Sin uso y siempre nula, como `aviso_previo_en` en `reportes_externos`: los valores por categoría van en `por_categoria`.
    categoriaId: ref("categoria_id", () => dimensionCategorias.id),
    // Con dimensión, la suma de las categorías.
    valor: num("valor"),
    // `{"<categoriaId>": "<valor>"}`, si el dato tiene dimensión.
    porCategoria: jsonb("por_categoria"),
    // Las categorías que pide el periodo.
    categorias: jsonb("categorias"),
    estado: text("estado").notNull().default("pendiente"),
    venceEn: marca("vence_en").notNull(),
    reportadoPor: refUsuario("reportado_por"),
    reportadoEn: marca("reportado_en"),
    corregido: boolean("corregido").notNull().default(false),
    reabiertoPor: refUsuario("reabierto_por"),
    reabiertoEn: marca("reabierto_en"),
    reaperturaJustificacion: text("reapertura_justificacion"),
    avisoPrevioEn: marca("aviso_previo_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    cierreId: ref("cierre_id", () => cierresIndicadores.id),
    creadoEn: creado(),
    // Algún indicador lo necesita (lo escribe `asegurarPeriodosDeDatos`): un pendiente que ya nadie pide y se conserva
    // porque tiene historia o un soporte queda en falso y no es tarea de nadie (anexo 14C, §4.3).
    sePide: boolean("se_pide").notNull().default(true),
  },
  (t) => [
    // La migración 0011 lo crea con NULLS NOT DISTINCT.
    uniqueIndex("variable_valores_unico_idx").on(t.variableId, t.periodo, t.categoriaId),
    index("variable_valores_estado_vence_idx").on(t.estado, t.venceEn),
    check("variable_valores_estado_valido", sql`${t.estado} IN ('pendiente', 'reportado', 'cerrado')`),
    check(
      "variable_valores_reportado_coherente",
      sql`${t.estado} <> 'reportado' OR (${t.valor} IS NOT NULL AND ${t.reportadoEn} IS NOT NULL)`,
    ),
  ],
);

// Solo-inserción (trigger en la migración 0015 y REVOKE en roles-bd.ts): el historial de un periodo del dato.
export const variableEventos = pgTable(
  "variable_eventos",
  {
    id: id(),
    valorId: ref("valor_id", () => variableValores.id).notNull(),
    tipo: text("tipo").notNull(),
    // Nulo cuando lo hizo el sistema.
    usuarioId: refUsuario("usuario_id"),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creado(),
  },
  (t) => [
    index("variable_eventos_valor_idx").on(t.valorId, t.creadoEn),
    check("variable_eventos_tipo_valido", sql`${t.tipo} IN ('reporte', 'correccion', 'soporte', 'cierre', 'reapertura')`),
  ],
);

// La constancia del envío de un periodo externo a su ente (14B; la 0013 la rehizo sobre la tabla vacía de la 0011).
export const reportesExternos = pgTable(
  "reportes_externos",
  {
    id: id(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    periodo: text("periodo").notNull(),
    desde: marca("desde").notNull(),
    hasta: marca("hasta").notNull(),
    venceEn: marca("vence_en").notNull(),
    // El nombre del ente de cuando nació la constancia.
    ente: text("ente").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    fechaEnvio: date("fecha_envio"),
    radicado: text("radicado"),
    resultadoEnviado: text("resultado_enviado"),
    resultadoDetalle: jsonb("resultado_detalle"),
    nota: text("nota"),
    registradaPor: refUsuario("registrada_por"),
    registradaEn: marca("registrada_en"),
    corregida: boolean("corregida").notNull().default(false),
    // Sin uso: las constancias no tienen aviso previo (quitarla haría preguntar a drizzle-kit).
    avisoPrevioEn: marca("aviso_previo_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    creadoEn: creado(),
  },
  (t) => [
    unique("reportes_externos_unico").on(t.indicadorId, t.periodo),
    index("reportes_externos_estado_vence_idx").on(t.estado, t.venceEn),
    check("reportes_externos_estado_valido", sql`${t.estado} IN ('pendiente', 'registrada')`),
    check(
      "reportes_externos_registrada_coherente",
      sql`(${t.estado} = 'registrada') = (${t.fechaEnvio} IS NOT NULL AND ${t.radicado} IS NOT NULL AND ${t.registradaPor} IS NOT NULL AND ${t.registradaEn} IS NOT NULL)`,
    ),
  ],
);

// Solo-inserción (trigger en la migración 0013 y REVOKE en roles-bd.ts): el registro, cada corrección y los soportes.
export const reporteExternoEventos = pgTable(
  "reporte_externo_eventos",
  {
    id: id(),
    reporteId: ref("reporte_id", () => reportesExternos.id).notNull(),
    tipo: text("tipo").notNull(),
    usuarioId: refUsuario("usuario_id").notNull(),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creado(),
  },
  (t) => [
    index("reporte_externo_eventos_reporte_idx").on(t.reporteId, t.creadoEn),
    check("reporte_externo_eventos_tipo_valido", sql`${t.tipo} IN ('registro', 'correccion', 'soporte')`),
  ],
);

// La revisión de un indicador por el cambio de estado de una norma que su ficha vigente cita (14B; la 0013 la rehizo).
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
    creadoEn: creado(),
  },
  (t) => [
    unique("impactos_indicadores_unico").on(t.normaCambioId, t.indicadorId),
    index("impactos_indicadores_indicador_idx").on(t.indicadorId, t.estado),
    check("impactos_indicadores_estado_valido", sql`${t.estado} IN ('pendiente', 'resuelto')`),
    check("impactos_indicadores_resolucion_valida", sql`${t.resolucion} IN ('no_afecta', 'nueva_version', 'retiro')`),
    check(
      "impactos_indicadores_resuelto_coherente",
      sql`(${t.estado} = 'resuelto') = (${t.resolucion} IS NOT NULL AND ${t.resueltoPor} IS NOT NULL AND ${t.resueltoEn} IS NOT NULL)`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Fase 15A: mejoramiento. `hallazgos` es de la 13B: lo de esta fase lleva el prefijo `mejora_`. Toda tabla hija lleva
// `hallazgo_id`: un hallazgo cerrado, rechazado o anulado no cambia, ni sus hijas, ni recibe hijas nuevas (trigger
// `sgc_impedir_si_hallazgo_terminado` de la migración 0018).
// ─────────────────────────────────────────────────────────────────────────────

// Lo que la entidad cambia del calendario de festivos: un día no hábil más, o un festivo calculado que sí es hábil.
export const diasNoHabiles = pgTable(
  "dias_no_habiles",
  {
    id: id(),
    fecha: date("fecha").notNull().unique(),
    tipo: text("tipo").notNull(),
    motivo: text("motivo").notNull(),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
  },
  (t) => [check("dias_no_habiles_tipo_valido", sql`${t.tipo} IN ('no_habil', 'habil')`)],
);

// El consecutivo del código `HZ-AAAA-NNN` por año: una secuencia quemaría el número de una transacción revertida.
export const mejoraConsecutivos = pgTable("mejora_consecutivos", {
  anio: integer("anio").primaryKey(),
  ultimo: integer("ultimo").notNull(),
});

export const mejoraHallazgos = pgTable(
  "mejora_hallazgos",
  {
    id: id(),
    codigo: text("codigo").notNull().unique(),
    anio: integer("anio").notNull(),
    consecutivo: integer("consecutivo").notNull(),
    clase: text("clase").notNull(),
    origen: text("origen").notNull(),
    fuente: text("fuente"),
    referenciaCaso: text("referencia_caso"),
    detectadoEn: date("detectado_en").notNull(),
    procesoId: ref("proceso_id", () => procesos.id).notNull(),
    subprocesoId: ref("subproceso_id", () => subprocesos.id),
    criticidad: text("criticidad"),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion").notNull(),
    requisitoClausula: text("requisito_clausula"),
    requisitoNormaId: ref("requisito_norma_id", () => normas.id),
    requisitoDocumentoId: ref("requisito_documento_id", () => documentos.id),
    documentoId: ref("documento_id", () => documentos.id),
    indicadorId: ref("indicador_id", () => indicadores.id),
    medicionId: ref("medicion_id", () => mediciones.id),
    riesgo: text("riesgo"),
    estado: text("estado").notNull(),
    ronda: integer("ronda").notNull().default(1),
    registradoPor: refUsuario("registrado_por").notNull(),
    registradoEn: marca("registrado_en").notNull(),
    reincidenteDe: ref("reincidente_de", (): AnyPgColumn => mejoraHallazgos.id),
    derivadoDe: ref("derivado_de", (): AnyPgColumn => mejoraHallazgos.id),
    cargado: boolean("cargado").notNull().default(false),
    // Nulo mientras no se registra la corrección.
    correccionRequerida: boolean("correccion_requerida"),
    correccionDescripcion: text("correccion_descripcion"),
    correccionResponsableId: refUsuario("correccion_responsable_id"),
    correccionResponsableNombre: text("correccion_responsable_nombre"),
    correccionImplementadaEn: date("correccion_implementada_en"),
    correccionRegistradaPor: refUsuario("correccion_registrada_por"),
    correccionRegistradaEn: marca("correccion_registrada_en"),
    // Nulo mientras no se decide si lleva acción correctiva.
    accionRequerida: boolean("accion_requerida"),
    accionJustificacion: text("accion_justificacion"),
    accionDecididaPor: refUsuario("accion_decidida_por"),
    accionDecididaEn: marca("accion_decidida_en"),
    validadaPor: refUsuario("validada_por"),
    validadaEn: marca("validada_en"),
    fechaLimiteEnte: date("fecha_limite_ente"),
    respuestaEnteEn: date("respuesta_ente_en"),
    respuestaEntePor: refUsuario("respuesta_ente_por"),
    // El vencimiento del paso en curso y sus marcas de aviso; `aviso_evaluar_en`, el de «ya se puede evaluar».
    venceEn: marca("vence_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    avisoEvaluarEn: marca("aviso_evaluar_en"),
    cerradoEn: marca("cerrado_en"),
    cerradoPor: refUsuario("cerrado_por"),
    resultadoCierre: text("resultado_cierre"),
    lecciones: text("lecciones"),
    cambiosAtendidos: text("cambios_atendidos"),
    anuladoMotivo: text("anulado_motivo"),
    // Fase 15B: de dónde nació, si nació de un hallazgo de verificación o de un impacto. Se escriben solo al nacer.
    verificacionHallazgoId: ref("verificacion_hallazgo_id", () => hallazgos.id),
    impactoId: ref("impacto_id", () => impactosNormativos.id),
    impactoIndicadorId: ref("impacto_indicador_id", () => impactosIndicadores.id),
  },
  (t) => [
    unique("mejora_hallazgos_anio_consecutivo_unico").on(t.anio, t.consecutivo),
    index("mejora_hallazgos_verificacion_hallazgo_idx").on(t.verificacionHallazgoId),
    index("mejora_hallazgos_impacto_idx").on(t.impactoId),
    index("mejora_hallazgos_impacto_indicador_idx").on(t.impactoIndicadorId),
    uniqueIndex("mejora_hallazgos_verificacion_hallazgo_unico")
      .on(t.verificacionHallazgoId)
      .where(sql`estado NOT IN ('rechazado', 'anulado')`),
    uniqueIndex("mejora_hallazgos_impacto_unico").on(t.impactoId).where(sql`estado NOT IN ('rechazado', 'anulado')`),
    uniqueIndex("mejora_hallazgos_impacto_indicador_unico")
      .on(t.impactoIndicadorId)
      .where(sql`estado NOT IN ('rechazado', 'anulado')`),
    index("mejora_hallazgos_proceso_estado_idx").on(t.procesoId, t.estado),
    index("mejora_hallazgos_estado_vence_idx").on(t.estado, t.venceEn),
    index("mejora_hallazgos_registrado_por_idx").on(t.registradoPor),
    index("mejora_hallazgos_indicador_idx").on(t.indicadorId),
    index("mejora_hallazgos_medicion_idx").on(t.medicionId),
    index("mejora_hallazgos_requisito_norma_idx").on(t.requisitoNormaId),
    index("mejora_hallazgos_documento_idx").on(t.documentoId),
    index("mejora_hallazgos_requisito_documento_idx").on(t.requisitoDocumentoId),
    index("mejora_hallazgos_subproceso_idx").on(t.subprocesoId),
    index("mejora_hallazgos_reincidente_de_idx").on(t.reincidenteDe),
    index("mejora_hallazgos_derivado_de_idx").on(t.derivadoDe),
    check("mejora_hallazgos_clase_valida", sql`${t.clase} IN ('no_conformidad', 'observacion', 'oportunidad')`),
    check(
      "mejora_hallazgos_origen_valido",
      sql`${t.origen} IN ('auditoria_interna', 'control_interno', 'revision_direccion', 'pamec', 'autoevaluacion', 'indicador', 'pqrsf', 'evento_adverso', 'riesgo_materializado', 'satisfaccion_usuario', 'control_documental', 'otro', 'auditoria_externa', 'ente_control')`,
    ),
    check("mejora_hallazgos_criticidad_valida", sql`${t.criticidad} IN ('alta', 'media', 'baja')`),
    check("mejora_hallazgos_criticidad_coherente", sql`(${t.clase} = 'no_conformidad') = (${t.criticidad} IS NOT NULL)`),
    check(
      "mejora_hallazgos_estado_valido",
      sql`${t.estado} IN ('por_aceptar', 'rechazo', 'arbitraje', 'por_corregir', 'por_decidir', 'por_validar', 'por_formular', 'en_revision', 'en_aprobacion', 'en_ejecucion', 'por_verificar', 'en_espera', 'por_cerrar', 'cerrado', 'rechazado', 'anulado')`,
    ),
    check(
      "mejora_hallazgos_resultado_cierre_valido",
      sql`${t.resultadoCierre} IN ('eficaz', 'con_correccion', 'sin_accion')`,
    ),
  ],
);

export const mejoraRondas = pgTable(
  "mejora_rondas",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    numero: integer("numero").notNull(),
    formularAntesDe: marca("formular_antes_de"),
    // La primera vez que se envió el plan: una devolución no la cambia.
    enviadoEn: marca("enviado_en"),
    estadoPlan: text("estado_plan").notNull().default("borrador"),
    elaboradoPor: refUsuario("elaborado_por"),
    revisadoPor: refUsuario("revisado_por"),
    revisadoEn: marca("revisado_en"),
    aprobadoPor: refUsuario("aprobado_por"),
    aprobadoEn: marca("aprobado_en"),
    aprobadoRol: text("aprobado_rol"),
    // Quién lo aprobó en papel, en un hallazgo cargado.
    aprobadoFuera: text("aprobado_fuera"),
    requiereRecursos: boolean("requiere_recursos").notNull().default(false),
    notaRecursos: text("nota_recursos"),
    // Las dos preguntas de cierre del análisis: nulas mientras no se responden.
    similares: boolean("similares"),
    similaresDetalle: text("similares_detalle"),
    cambios: jsonb("cambios"),
    criterios: jsonb("criterios").notNull().default(sql`'[]'::jsonb`),
    criterioOtro: text("criterio_otro"),
    indicadorEficaciaId: ref("indicador_eficacia_id", () => indicadores.id),
    fechaEvaluacion: date("fecha_evaluacion"),
    cierrePrevisto: marca("cierre_previsto"),
    verificadaPor: refUsuario("verificada_por"),
    verificadaEn: marca("verificada_en"),
    verificacionMetodos: jsonb("verificacion_metodos"),
    verificacionNota: text("verificacion_nota"),
    evaluadaPor: refUsuario("evaluada_por"),
    evaluadaEn: marca("evaluada_en"),
    resultado: text("resultado"),
    evaluacionDesde: date("evaluacion_desde"),
    evaluacionHasta: date("evaluacion_hasta"),
    evaluacionCriterios: jsonb("evaluacion_criterios"),
    evaluacionJustificacion: text("evaluacion_justificacion"),
  },
  (t) => [
    unique("mejora_rondas_numero_unico").on(t.hallazgoId, t.numero),
    // El destino de las llaves compuestas de sus hijas: una hija no cuelga de la ronda de otro hallazgo.
    unique("mejora_rondas_id_hallazgo_unico").on(t.id, t.hallazgoId),
    index("mejora_rondas_indicador_eficacia_idx").on(t.indicadorEficaciaId),
    check("mejora_rondas_estado_plan_valido", sql`${t.estadoPlan} IN ('borrador', 'enviado', 'aprobado')`),
    check("mejora_rondas_aprobado_rol_valido", sql`${t.aprobadoRol} IN ('admin_sgc', 'gerencia')`),
    check("mejora_rondas_resultado_valido", sql`${t.resultado} IN ('eficaz', 'no_eficaz')`),
  ],
);

export const mejoraAnalisis = pgTable(
  "mejora_analisis",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    rondaId: ref("ronda_id", () => mejoraRondas.id).notNull(),
    orden: integer("orden").notNull(),
    metodo: text("metodo").notNull(),
    equipo: text("equipo"),
    observaciones: text("observaciones"),
    contenido: jsonb("contenido"),
  },
  (t) => [
    index("mejora_analisis_hallazgo_idx").on(t.hallazgoId),
    index("mejora_analisis_ronda_idx").on(t.rondaId),
    foreignKey({
      name: "mejora_analisis_ronda_coherente",
      columns: [t.rondaId, t.hallazgoId],
      foreignColumns: [mejoraRondas.id, mejoraRondas.hallazgoId],
    }).onDelete("restrict"),
    check("mejora_analisis_metodo_valido", sql`${t.metodo} IN ('cinco_porques', 'ishikawa', 'pareto', 'otro')`),
  ],
);

export const mejoraCausas = pgTable(
  "mejora_causas",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    rondaId: ref("ronda_id", () => mejoraRondas.id).notNull(),
    orden: integer("orden").notNull(),
    texto: text("texto").notNull(),
    sinAccionPorque: text("sin_accion_porque"),
  },
  (t) => [
    unique("mejora_causas_id_hallazgo_unico").on(t.id, t.hallazgoId),
    index("mejora_causas_hallazgo_idx").on(t.hallazgoId),
    index("mejora_causas_ronda_idx").on(t.rondaId),
    foreignKey({
      name: "mejora_causas_ronda_coherente",
      columns: [t.rondaId, t.hallazgoId],
      foreignColumns: [mejoraRondas.id, mejoraRondas.hallazgoId],
    }).onDelete("restrict"),
  ],
);

export const mejoraAcciones = pgTable(
  "mejora_acciones",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    rondaId: ref("ronda_id", () => mejoraRondas.id).notNull(),
    orden: integer("orden").notNull(),
    tipo: text("tipo").notNull(),
    descripcion: text("descripcion").notNull(),
    recursos: text("recursos"),
    indicadorCumplimiento: text("indicador_cumplimiento"),
    meta: text("meta"),
  },
  (t) => [
    unique("mejora_acciones_id_hallazgo_unico").on(t.id, t.hallazgoId),
    index("mejora_acciones_hallazgo_idx").on(t.hallazgoId),
    index("mejora_acciones_ronda_idx").on(t.rondaId),
    foreignKey({
      name: "mejora_acciones_ronda_coherente",
      columns: [t.rondaId, t.hallazgoId],
      foreignColumns: [mejoraRondas.id, mejoraRondas.hallazgoId],
    }).onDelete("restrict"),
    check("mejora_acciones_tipo_valido", sql`${t.tipo} IN ('correctiva', 'preventiva', 'mejora')`),
  ],
);

export const mejoraAccionCausas = pgTable(
  "mejora_accion_causas",
  {
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    accionId: ref("accion_id", () => mejoraAcciones.id).notNull(),
    causaId: ref("causa_id", () => mejoraCausas.id).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accionId, t.causaId] }),
    index("mejora_accion_causas_hallazgo_idx").on(t.hallazgoId),
    index("mejora_accion_causas_causa_idx").on(t.causaId),
    foreignKey({
      name: "mejora_accion_causas_accion_coherente",
      columns: [t.accionId, t.hallazgoId],
      foreignColumns: [mejoraAcciones.id, mejoraAcciones.hallazgoId],
    }).onDelete("restrict"),
    foreignKey({
      name: "mejora_accion_causas_causa_coherente",
      columns: [t.causaId, t.hallazgoId],
      foreignColumns: [mejoraCausas.id, mejoraCausas.hallazgoId],
    }).onDelete("restrict"),
  ],
);

export const mejoraActividades = pgTable(
  "mejora_actividades",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    accionId: ref("accion_id", () => mejoraAcciones.id).notNull(),
    orden: integer("orden").notNull(),
    descripcion: text("descripcion").notNull(),
    responsableId: refUsuario("responsable_id").notNull(),
    inicio: date("inicio").notNull(),
    // Nula hasta que se aprueba el plan; después no cambia nunca.
    finOriginal: date("fin_original"),
    fin: date("fin").notNull(),
    avance: integer("avance").notNull().default(0),
    estado: text("estado").notNull().default("abierta"),
    terminadaEn: marca("terminada_en"),
    terminadaPor: refUsuario("terminada_por"),
    verificacion: text("verificacion"),
    verificacionNota: text("verificacion_nota"),
    corregirAntesDe: date("corregir_antes_de"),
    canceladaEn: marca("cancelada_en"),
    reprogramaciones: integer("reprogramaciones").notNull().default(0),
    // Cuándo se escaló a Gerencia; `escalado_en` es el aviso al jefe.
    gerenciaEn: marca("gerencia_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    recordatorioEn: marca("recordatorio_en"),
  },
  (t) => [
    index("mejora_actividades_responsable_estado_idx").on(t.responsableId, t.estado),
    unique("mejora_actividades_id_hallazgo_unico").on(t.id, t.hallazgoId),
    index("mejora_actividades_hallazgo_idx").on(t.hallazgoId),
    index("mejora_actividades_accion_idx").on(t.accionId),
    foreignKey({
      name: "mejora_actividades_accion_coherente",
      columns: [t.accionId, t.hallazgoId],
      foreignColumns: [mejoraAcciones.id, mejoraAcciones.hallazgoId],
    }).onDelete("restrict"),
    check("mejora_actividades_avance_valido", sql`${t.avance} BETWEEN 0 AND 100`),
    check("mejora_actividades_estado_valido", sql`${t.estado} IN ('abierta', 'en_proceso', 'terminada', 'cancelada')`),
    check("mejora_actividades_verificacion_valida", sql`${t.verificacion} IN ('conforme', 'devuelta')`),
  ],
);

// Solo-inserción (trigger en la migración 0018 y REVOKE en roles-bd.ts)
export const mejoraSeguimientos = pgTable(
  "mejora_seguimientos",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    actividadId: ref("actividad_id", () => mejoraActividades.id).notNull(),
    fecha: date("fecha").notNull(),
    realizado: text("realizado").notNull(),
    avance: integer("avance").notNull(),
    barreras: text("barreras"),
    registradoPor: refUsuario("registrado_por").notNull(),
    creadoEn: creado(),
  },
  (t) => [
    index("mejora_seguimientos_actividad_idx").on(t.actividadId, t.fecha),
    index("mejora_seguimientos_hallazgo_registrado_por_idx").on(t.hallazgoId, t.registradoPor),
    foreignKey({
      name: "mejora_seguimientos_actividad_coherente",
      columns: [t.actividadId, t.hallazgoId],
      foreignColumns: [mejoraActividades.id, mejoraActividades.hallazgoId],
    }).onDelete("restrict"),
    check("mejora_seguimientos_avance_valido", sql`${t.avance} BETWEEN 0 AND 100`),
  ],
);

export const mejoraAjustes = pgTable(
  "mejora_ajustes",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    rondaId: ref("ronda_id", () => mejoraRondas.id).notNull(),
    tipo: text("tipo").notNull(),
    // En un «añadir», nula hasta aprobarse; después, la actividad que creó.
    actividadId: ref("actividad_id", () => mejoraActividades.id),
    datos: jsonb("datos"),
    causa: text("causa").notNull(),
    pedidoPor: refUsuario("pedido_por").notNull(),
    pedidoEn: marca("pedido_en").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    decididoPor: refUsuario("decidido_por"),
    decididoEn: marca("decidido_en"),
    nota: text("nota"),
    actaNumero: text("acta_numero"),
    actaFecha: date("acta_fecha"),
    venceEn: marca("vence_en"),
    avisoVencidoEn: marca("aviso_vencido_en"),
  },
  (t) => [
    uniqueIndex("mejora_ajustes_un_pendiente_idx").on(t.actividadId).where(sql`estado = 'pendiente'`),
    index("mejora_ajustes_hallazgo_idx").on(t.hallazgoId),
    index("mejora_ajustes_ronda_idx").on(t.rondaId),
    index("mejora_ajustes_actividad_idx").on(t.actividadId),
    foreignKey({
      name: "mejora_ajustes_ronda_coherente",
      columns: [t.rondaId, t.hallazgoId],
      foreignColumns: [mejoraRondas.id, mejoraRondas.hallazgoId],
    }).onDelete("restrict"),
    // Con la actividad nula (un «añadir») no se comprueba: MATCH SIMPLE.
    foreignKey({
      name: "mejora_ajustes_actividad_coherente",
      columns: [t.actividadId, t.hallazgoId],
      foreignColumns: [mejoraActividades.id, mejoraActividades.hallazgoId],
    }).onDelete("restrict"),
    check("mejora_ajustes_tipo_valido", sql`${t.tipo} IN ('reprogramar', 'agregar', 'cancelar')`),
    check("mejora_ajustes_estado_valido", sql`${t.estado} IN ('pendiente', 'aprobado', 'negado')`),
  ],
);

// Solo-inserción (trigger en la migración 0018 y REVOKE en roles-bd.ts)
export const mejoraOcurrencias = pgTable(
  "mejora_ocurrencias",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    fecha: date("fecha").notNull(),
    descripcion: text("descripcion").notNull(),
    origen: text("origen").notNull(),
    reporteId: ref("reporte_id", (): AnyPgColumn => mejoraReportes.id),
    registradoPor: refUsuario("registrado_por").notNull(),
    creadoEn: creado(),
  },
  (t) => [
    index("mejora_ocurrencias_hallazgo_idx").on(t.hallazgoId),
    index("mejora_ocurrencias_reporte_idx").on(t.reporteId),
    check("mejora_ocurrencias_origen_valido", sql`${t.origen} IN ('registro', 'reporte', 'medicion')`),
  ],
);

// Solo-inserción (trigger en la migración 0018 y REVOKE en roles-bd.ts)
export const mejoraEventos = pgTable(
  "mejora_eventos",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    ronda: integer("ronda").notNull(),
    tipo: text("tipo").notNull(),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    // Nulo cuando lo hizo el sistema.
    usuarioId: refUsuario("usuario_id"),
    // Hecho fuera de la plataforma (un hallazgo cargado): `ocurrio_en` es su fecha real.
    fuera: boolean("fuera").notNull().default(false),
    ocurrioEn: marca("ocurrio_en").notNull(),
    creadoEn: creado(),
  },
  (t) => [index("mejora_eventos_hallazgo_idx").on(t.hallazgoId, t.creadoEn)],
);

export const mejoraReportes = pgTable(
  "mejora_reportes",
  {
    id: id(),
    reportadoPor: refUsuario("reportado_por").notNull(),
    reportadoEn: marca("reportado_en").notNull(),
    descripcion: text("descripcion").notNull(),
    vistoEn: date("visto_en").notNull(),
    procesoId: ref("proceso_id", () => procesos.id),
    referenciaCaso: text("referencia_caso"),
    estado: text("estado").notNull().default("recibido"),
    // El hallazgo que nació del reporte o al que se sumó.
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id),
    motivoDescarte: text("motivo_descarte"),
    clasificadoPor: refUsuario("clasificado_por"),
    clasificadoEn: marca("clasificado_en"),
    venceEn: marca("vence_en").notNull(),
    avisoVencidoEn: marca("aviso_vencido_en"),
    escaladoEn: marca("escalado_en"),
    // Fase 15B: el documento y el indicador sobre los que se reporta.
    documentoId: ref("documento_id", () => documentos.id),
    indicadorId: ref("indicador_id", () => indicadores.id),
  },
  (t) => [
    index("mejora_reportes_documento_idx").on(t.documentoId),
    index("mejora_reportes_indicador_idx").on(t.indicadorId),
    index("mejora_reportes_estado_vence_idx").on(t.estado, t.venceEn),
    index("mejora_reportes_reportado_por_idx").on(t.reportadoPor),
    index("mejora_reportes_hallazgo_idx").on(t.hallazgoId),
    index("mejora_reportes_proceso_idx").on(t.procesoId),
    check("mejora_reportes_estado_valido", sql`${t.estado} IN ('recibido', 'convertido', 'sumado', 'descartado')`),
  ],
);

// Solo-inserción (trigger en la migración 0018 y REVOKE en roles-bd.ts)
export const mejoraReporteEventos = pgTable(
  "mejora_reporte_eventos",
  {
    id: id(),
    reporteId: ref("reporte_id", () => mejoraReportes.id).notNull(),
    tipo: text("tipo").notNull(),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    usuarioId: refUsuario("usuario_id").notNull(),
    creadoEn: creado(),
  },
  (t) => [index("mejora_reporte_eventos_reporte_idx").on(t.reporteId, t.creadoEn)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Fase 15B: planes de mejoramiento y enganches (migración 0019). El plan, su clasificación y sus eventos no cuelgan del
// trigger del hallazgo terminado: un hallazgo cerrado entra, sale y cambia de plan.
// ─────────────────────────────────────────────────────────────────────────────

// El consecutivo del código `PM-AAAA-NN` por vigencia, como `mejora_consecutivos`.
export const mejoraPlanConsecutivos = pgTable("mejora_plan_consecutivos", {
  vigencia: integer("vigencia").primaryKey(),
  ultimo: integer("ultimo").notNull(),
});

export const mejoraPlanes = pgTable(
  "mejora_planes",
  {
    id: id(),
    codigo: text("codigo").notNull().unique(),
    vigencia: integer("vigencia").notNull(),
    consecutivo: integer("consecutivo").notNull(),
    nombre: text("nombre").notNull(),
    origen: text("origen").notNull(),
    fechaEvento: date("fecha_evento").notNull(),
    objetivoTexto: text("objetivo_texto"),
    objetivoId: ref("objetivo_id", () => objetivos.id),
    fechaLimiteEnte: date("fecha_limite_ente"),
    creadoPor: refUsuario("creado_por").notNull(),
    creadoEn: creado(),
    anuladoEn: marca("anulado_en"),
    anuladoPor: refUsuario("anulado_por"),
    anuladoMotivo: text("anulado_motivo"),
  },
  (t) => [
    unique("mejora_planes_vigencia_consecutivo_unico").on(t.vigencia, t.consecutivo),
    index("mejora_planes_objetivo_idx").on(t.objetivoId),
    check(
      "mejora_planes_origen_valido",
      sql`${t.origen} IN ('auditoria_interna', 'control_interno', 'revision_direccion', 'pamec', 'autoevaluacion', 'indicador', 'pqrsf', 'evento_adverso', 'riesgo_materializado', 'satisfaccion_usuario', 'control_documental', 'otro', 'auditoria_externa', 'ente_control')`,
    ),
  ],
);

// El plan y el objetivo de un hallazgo, fuera de él. La fila se borra cuando quedan los dos nulos.
export const mejoraClasificacion = pgTable(
  "mejora_clasificacion",
  {
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).primaryKey(),
    planId: ref("plan_id", () => mejoraPlanes.id),
    objetivoId: ref("objetivo_id", () => objetivos.id),
    actualizadoPor: refUsuario("actualizado_por").notNull(),
    actualizadoEn: marca("actualizado_en").notNull(),
  },
  (t) => [
    index("mejora_clasificacion_plan_idx").on(t.planId),
    index("mejora_clasificacion_objetivo_idx").on(t.objetivoId),
    check("mejora_clasificacion_no_vacia", sql`${t.planId} IS NOT NULL OR ${t.objetivoId} IS NOT NULL`),
  ],
);

// Solo-inserción (trigger en la migración 0019 y REVOKE en roles-bd.ts)
export const mejoraPlanEventos = pgTable(
  "mejora_plan_eventos",
  {
    id: id(),
    planId: ref("plan_id", () => mejoraPlanes.id).notNull(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id),
    tipo: text("tipo").notNull(),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    usuarioId: refUsuario("usuario_id").notNull(),
    creadoEn: creado(),
  },
  (t) => [
    index("mejora_plan_eventos_plan_idx").on(t.planId, t.creadoEn),
    index("mejora_plan_eventos_hallazgo_idx").on(t.hallazgoId),
    check(
      "mejora_plan_eventos_tipo_valido",
      sql`${t.tipo} IN ('creado', 'editado', 'anulado', 'entra', 'sale', 'archivo', 'archivo_quitado', 'respuesta')`,
    ),
  ],
);

export const mejoraPlanRespuestas = pgTable(
  "mejora_plan_respuestas",
  {
    id: id(),
    planId: ref("plan_id", () => mejoraPlanes.id).notNull(),
    enviadaEn: date("enviada_en").notNull(),
    archivoId: ref("archivo_id", () => archivos.id).notNull().unique(),
    registradaPor: refUsuario("registrada_por").notNull(),
    registradaEn: marca("registrada_en").notNull(),
  },
  (t) => [index("mejora_plan_respuestas_plan_idx").on(t.planId)],
);

export const mejoraPlanRespuestaHallazgos = pgTable(
  "mejora_plan_respuesta_hallazgos",
  {
    respuestaId: ref("respuesta_id", () => mejoraPlanRespuestas.id).notNull(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.respuestaId, t.hallazgoId] }),
    index("mejora_plan_respuesta_hallazgos_hallazgo_idx").on(t.hallazgoId),
  ],
);

// Solo-inserción (trigger en la migración 0019 y REVOKE en roles-bd.ts). Una fila por decisión, varias por medición.
export const mejoraMarcas = pgTable(
  "mejora_marcas",
  {
    id: id(),
    medicionId: ref("medicion_id", () => mediciones.id).notNull(),
    indicadorId: ref("indicador_id", () => indicadores.id).notNull(),
    salida: text("salida").notNull(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id),
    justificacion: text("justificacion"),
    decididoPor: refUsuario("decidido_por").notNull(),
    decididoEn: marca("decidido_en").notNull(),
  },
  (t) => [
    index("mejora_marcas_medicion_idx").on(t.medicionId),
    index("mejora_marcas_indicador_idx").on(t.indicadorId),
    index("mejora_marcas_hallazgo_idx").on(t.hallazgoId),
    check("mejora_marcas_salida_valida", sql`${t.salida} IN ('hallazgo', 'ocurrencia', 'no_requiere')`),
    check(
      "mejora_marcas_coherente",
      sql`(${t.salida} = 'no_requiere' AND ${t.justificacion} IS NOT NULL AND ${t.hallazgoId} IS NULL) OR (${t.salida} <> 'no_requiere' AND ${t.justificacion} IS NULL AND ${t.hallazgoId} IS NOT NULL)`,
    ),
  ],
);

// El trámite documental que atiende una actividad. Con el trigger del hallazgo terminado (migración 0019).
export const mejoraActividadTramites = pgTable(
  "mejora_actividad_tramites",
  {
    id: id(),
    hallazgoId: ref("hallazgo_id", () => mejoraHallazgos.id).notNull(),
    actividadId: ref("actividad_id", () => mejoraActividades.id).notNull(),
    tramiteId: ref("tramite_id", () => tramites.id).notNull().unique(),
    origen: text("origen").notNull(),
    enlazadoPor: refUsuario("enlazado_por").notNull(),
    enlazadoEn: marca("enlazado_en").notNull(),
    avisadoEn: marca("avisado_en"),
  },
  (t) => [
    index("mejora_actividad_tramites_hallazgo_idx").on(t.hallazgoId),
    index("mejora_actividad_tramites_actividad_idx").on(t.actividadId),
    foreignKey({
      name: "mejora_actividad_tramites_actividad_coherente",
      columns: [t.actividadId, t.hallazgoId],
      foreignColumns: [mejoraActividades.id, mejoraActividades.hallazgoId],
    }).onDelete("restrict"),
    check("mejora_actividad_tramites_origen_valido", sql`${t.origen} IN ('pedido', 'enlazado')`),
  ],
);
