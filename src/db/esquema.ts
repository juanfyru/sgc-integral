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

export const tiposDocumento = pgTable("tipos_documento", {
  id: id(),
  nombre: text("nombre").notNull().unique(),
  sigla: text("sigla").notNull().unique(),
  esDiligenciable: boolean("es_diligenciable").notNull().default(false),
  orden: integer("orden").notNull(),
  activo: boolean("activo").notNull().default(true),
});

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
    unique("versiones_documento_numero_unico").on(t.documentoId, t.numero),
    check(
      "versiones_estado_valido",
      sql`${t.estado} IN ('borrador', 'vigente', 'obsoleto', 'anulado')`,
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
    versionId: bigint("version_id", { mode: "number" })
      .notNull()
      .references(() => documentoVersiones.id, { onDelete: "restrict" }),
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
      sql`${t.rol} IN ('principal', 'editable', 'anexo')`,
    ),
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
    uniqueIndex("usuarios_correo_idx")
      .on(sql`lower(${t.correo})`)
      .where(sql`${t.correo} IS NOT NULL`),
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
      sql`${t.resultado} IN ('ingreso', 'salida', 'fallo', 'bloqueo', 'desbloqueo', 'restablecimiento', 'factor_fallo', 'cierre_forzado')`,
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
