# Fase 13C — Vigencia, externos y normograma: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar al sistema los pasos 11 y 13 del procedimiento de control de documentos del
hospital y cerrar la Fase 13: plazo de revisión con ratificación firmada y semáforo documental;
documentos externos con adopción firmada, verificación de vigencia y la matriz SGC-MZ-03; la
revisión anual como campaña con decisión por documento e informe SGC-RG-06 congelado; el
normograma institucional y por proceso con impacto documental al cambiar una norma; siete
indicadores del proceso documental con meta; y las cinco preguntas que la 13B dejó, todo en «Mis
tareas» y la campana, sin planificador ni correo.

**Architecture:** Seis módulos sobre lo que dejaron la 13A y la 13B. El **semáforo** se calcula
al mostrarse desde una fecha base que ramifica por origen de la aprobación y que la
**ratificación** (una firma sin trámite, `firmas.tramite_id` nulo) reinicia. Un **externo** es
un documento del Maestro con `origen = 'externo'`, control propio en `externos`, una versión por
edición adoptada (`aplicarPublicacion('externo')`, el cuarto camino que publica) y verificaciones
inmutables. La **revisión anual** es una fila `revisiones_anuales` con una decisión por documento
que los actos registran solos, y un informe que se congela al cierre y se genera al primer clic
como el acta. El **normograma** son normas con relaciones que cambian estados, y cada cambio
abre **impactos** por documento y proceso. Los **indicadores** son funciones puras sobre filas
leídas. Las reglas puras viven en `src/lib/vigencia/`, `src/lib/normograma/` y
`src/lib/indicadores-documentales/`; las consultas en `src/db/consultas/vigencia/` y
`src/db/consultas/normograma/`; la visibilidad en `src/lib/alcance.ts`; las tareas en
`misTareas()`; los vencimientos en la revisión de la 13A.

**Tech Stack:** Next.js 16.4 (App Router, Server Actions, route handlers), TypeScript estricto,
PostgreSQL 16 con `postgres` (SQL etiquetado) y Drizzle para el esquema y las migraciones,
`zod` 4, `pdf-lib` (informe sobre el membrete), `exceljs`, Tailwind 4 con los componentes base de
`src/componentes/ui`, Vitest. **Sin dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-11-08-fase13c-vigencia-externos-normograma-design.md`
(«el spec»), que detalla a los specs 13A (`2026-11-05-fase13a-flujo-documental-design.md`) y 13B
(`2026-11-07-fase13b-distribucion-puntos-de-uso-design.md`) y al spec maestro
(`2026-11-03-sgc-integral-plataforma-design.md`). Las decisiones del spec se citan como
F13C-DCn; las de la 13A y la 13B, como F13A-DCn y F13B-DCn.

## Avisos para quien ejecuta

- **La base de desarrollo se vuelve a sembrar una vez**, en la **Tarea 15** (`npm run db:seed`
  y luego `npm run admin:asegurar`). El controlador avisa al usuario antes: pierde los datos de
  prueba manual. Hasta entonces, la migración 0008 se aplica sobre la base sembrada sin
  resembrar.
- **Puntos de control en navegador del controlador:** después de las Tareas 5 (semáforo y
  ratificación), 7 (externos), 9 (normograma), 11 (revisión anual e informe) y 13 (herencia de la
  13B), y la demostración de §19 del spec en la Tarea 16.
- **Las carpetas `puntos-uso` y `listas-distribucion` cambian de grupo de rutas** en la Tarea 13
  (`admin/(panel)` → `admin/(catalogos)`), sin cambiar URL; `tests/paginas-sesion.test.ts` debe
  cubrir el grupo nuevo en esa misma tarea.
- **El informe se prueba con el formato real del hospital** (los PDF de la raíz, sin seguimiento
  y excluidos en `.git/info/exclude`) en la Tarea 11; **nunca entran a un commit**.
- **Las firmas «Ratificó» y «Adoptó» no tienen trámite:** antes de cerrar la Tarea 4 se compara
  el acta de SOL-2026-001 byte a byte con la de `main` (la Tarea 1 guarda la copia).
- No se lee `.env.local`. No se detiene ni se borra el servicio `bd` ni su volumen. No se hace
  `push` ni `merge` sin que el usuario lo pida. Todo en la rama
  `fase-13c-vigencia-externos-normograma` (ya existe, con el spec).

## Global Constraints

- Node 24 en desarrollo, CI e imagen. TypeScript estricto, sin `any` salvo justificación
  puntual. Dominio, interfaz y código en español.
- **Sin dependencias npm nuevas.** `pdf-lib`, `exceljs` y `zod` ya están.
- **Migración aditiva, aplicable sobre una base de `sgc-suaza`, de la 13A o de la 13B:** no se
  renombra ni se borra ninguna tabla ni columna. `firmas.tramite_id` y
  `lista_miembros.referencia_id` dejan de ser obligatorias con un `CHECK` que las filas
  existentes cumplen; los `CHECK` de listas se amplían (spec §15.1).
- **Una sola versión vigente** y publicar en una sola transacción no cambian. La adopción de una
  edición pasa por `aplicarPublicacion(tx, versionId, "externo", …)` y el retiro por
  `anularVigenteEn`: `alDejarDeSerVigente` conserva sus tres llamadores (spec §8.3, §8.5).
- **La fecha base de un documento aprobado fuera de la plataforma es `fecha_aprobacion`, nunca
  `publicado_en`** (F13C-DC31). Un externo cuenta desde su última verificación o su adopción.
- **Toda escritura exige sesión y un permiso de la matriz** `src/lib/permisos.ts`, más el
  alcance o la condición de persona donde el spec la pide (líder sobre sus procesos, Gerencia
  solo estratégicos, responsable técnico de su externo). Las Server Actions nuevas viven en
  `src/app/acciones-vigencia.ts` y `src/app/acciones-normograma.ts`, cada una con
  `mutacion(formData, "<permiso>", fn)`; la Tarea 2 las añade a la lista de
  `tests/acciones-permisos.test.ts`.
- **Toda firma sigue F13A-R4:** validador de solo lectura, clave verificada con
  `verificarParaFirmar` fuera de la transacción, comprobaciones repetidas dentro con `FOR UPDATE`;
  un fallo cuenta para el bloqueo. `registrarFirma` acepta `tramiteId: null` y `ronda = 0` en
  «Ratificó» y «Adoptó».
- **Toda consulta nueva recibe la conexión como última opción** (`opciones?: { sql?: Cliente }`,
  por defecto `obtenerSql()`); los tests corren en una transacción que se revierte (`revertida`,
  `tests/utiles/transaccion.ts`).
- Esquemas `zod` `.strict()` leídos con `parsearFormulario`; un `id` de ruta se lee con
  `idNumerico()` y `omitir: ["id"]`. Ninguna acción vuelca el formulario en un `UPDATE`.
- Cada página nueva llama `exigirSesion()` y después su regla de alcance con `notFound()` (el
  patrón de `exigirDistribucion`, F13C-DC39), nunca `exigirPermiso` en las páginas de Vigencia y
  del normograma; cada handler nuevo usa `sesionDePeticion`, autoriza y, si escribe,
  `origenValido()`. Las rutas de subida (`api/externos/[versionId]/archivos`,
  `api/normas/[id]/archivos`, `api/hallazgos/[id]/archivos`) van fuera del `matcher` de
  `src/proxy.ts`, con los puntos como `[.]`, y con su caso en `tests/proxy-matcher.test.ts`.
- **`ratificaciones`, `externo_verificaciones` y `norma_cambios` son de solo inserción**; una
  revisión anual cerrada, sus procesos y sus decisiones no se modifican. Nunca `UPDATE` ni
  `DELETE` sobre ellas ni sobre `auditoria`, `accesos`, `firmas`, `tramite_eventos`,
  `copia_eventos` y `acuse_eventos`, tampoco en la limpieza de un test.
- Quien no puede ver un documento, un externo, una revisión, un impacto o el informe recibe **«no
  encontrado»** (404), nunca «sin permiso». El normograma se lee con cualquier sesión.
- Fechas en la zona de la instalación (`zonaHoraria()`); el plazo de revisión y la periodicidad de
  verificación en **meses calendario** (`sumarMeses`, Tarea 3); los demás plazos en días con
  `fechaLimite` (`src/lib/tramites/plazos.ts`); la BD guarda `timestamptz` y `date`.
- Sin `dangerouslySetInnerHTML`; notas, requisitos y temas son texto plano; el enlace oficial de
  una norma se muestra como texto, no como `<a href>` (F13C-DC19). Todo Excel pasa por
  `neutralizarFormula`. Los PDF adjuntos entran por `recibirArchivo`.
- Interfaz dentro del cascarón, con los componentes de `src/componentes/ui` y clases de token;
  nunca los alias `azul`/`verde` ni colores fijos de Tailwind. Estado nunca solo por color: el
  chip del semáforo lleva texto siempre. Teclado, foco visible, AA en claro y oscuro, 390 px (la
  verificación de un externo y la decisión de la revisión anual se hacen también en el celular).
- Textos de interfaz: el rol se llama como `src/lib/roles.ts`; «Coordinador SGC» no aparece como
  nombre de rol.
- Todos los archivos con finales de línea LF. Commits convencionales en español con el trailer
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Ratificar un documento cuyo archivo principal en disco ya no coincide con la huella
   registrada.** Se rechaza con «El archivo en disco no coincide con el registrado; avise al
   Administrador del SGC», no se escribe firma ni ratificación y queda `ratificacion_rechazada`
   en la bitácora. Test en la Tarea 4.
2. **Fijar «Próxima revisión» con una fecha de ayer, de hoy, o más allá del plazo del documento
   contado desde hoy.** Las tres se rechazan con un mensaje propio; una fecha válida queda con
   quién y cuándo y se muestra como «fijada por …». Test en la Tarea 4.
3. **Adoptar la misma edición desde dos pestañas, o adoptar una versión que ya no está en
   borrador; y `publicarVersion` (carga directa) sobre un documento de origen externo.** La
   segunda adopción falla con «La edición ya no está en borrador»; la carga directa rechaza el
   externo con «Un documento externo se adopta desde Vigencia → Externos». Test en la Tarea 6.
4. **Registrar «deroga a» de una norma consigo misma, sobre una ya derogada o repitiendo una
   relación que existe.** Las tres se rechazan y no nace ningún impacto duplicado; un cambio de
   estado sobre una norma sin documentos ni procesos no deja tareas. Test en la Tarea 8.
5. **Cerrar la revisión anual dos veces, o decidir sobre un documento de un proceso fuera del
   alcance del líder.** La segunda vez «La revisión ya está cerrada»; la decisión ajena responde
   «no encontrado». Test en la Tarea 10.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `drizzle/0008_*.sql`, `src/db/esquema.ts`, `src/db/roles-bd.ts`, `src/db/semillas/minima.ts` | Tablas, columnas, `CHECK`, triggers, privilegios, `TRUNCATE`, tipo `DE` | 1 |
| `src/lib/permisos.ts`, `src/lib/tramites/tipos.ts`, `src/db/consultas/firmas.ts`, `src/db/consultas/admin.ts` (`aplicarPublicacion`), `src/lib/distribucion/tipos.ts`, `src/db/consultas/config-documental.ts`, `src/app/admin/acciones-config-documental.ts`, `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx` | Permisos nuevos, tipos ampliados, firmas sin trámite, configuración «Vigencia» e «Indicadores documentales» | 2 |
| `src/lib/vigencia/{tipos,plazo,semaforo}.ts`, `src/lib/indicadores-documentales/{periodo,definiciones,metas}.ts` | Reglas puras: fecha base, próxima revisión, estado del semáforo, periodos, siete definiciones y metas | 3 |
| `src/lib/alcance.ts`, `src/db/consultas/vigencia/{semaforo,ratificaciones}.ts`, `src/app/acciones-vigencia.ts`, `src/lib/esquemas/vigencia.ts`, `src/app/(app)/vigencia/**` (redirección, `semaforo`, Excel), `src/componentes/vigencia/*`, fichas del documento | Semáforo, ratificación, fecha fijada a mano, pestaña «Semáforo», bloque «Vigencia» de la ficha | 4 |
| `src/db/consultas/maestro.ts`, `src/lib/maestro-excel.ts`, `src/db/consultas/admin.ts` (`listarDocumentosAdmin`), `src/componentes/admin/TablaDocumentosAdmin.tsx`, `src/db/consultas/procesos.ts`, `src/app/(app)/procesos/[slug]/page.tsx`, `src/db/consultas/vigencia/{tareas,vencimientos}.ts`, `src/db/consultas/vencimientos.ts`, `src/lib/tareas.ts`, `src/componentes/cascaron/navegacion.ts` | Semáforo en Maestro, Gestión y página del proceso; tareas y vencimientos de vigencia; entrada «Vigencia» | 5 |
| `src/db/consultas/vigencia/externos.ts`, `src/app/api/externos/**`, `src/db/consultas/admin.ts` (`publicarVersion`), `src/db/consultas/distribucion/version-vigencia.ts` | Externos: alta, edición en borrador, adopción, verificación, retiro, archivos de la edición | 6 |
| `src/app/(app)/vigencia/externos/**`, `src/componentes/vigencia/externos/*`, `src/lib/vigencia/externos-excel.ts`, fichas del documento, Maestro | Matriz SGC-MZ-03, página del externo, alta, bloque «Documento externo», columnas «Origen» y «Edición»; tareas y vencimientos de externos | 7 |
| `src/lib/normograma/tipos.ts`, `src/db/consultas/normograma/{normas,relaciones,asociaciones,impactos,tipos-norma,busqueda}.ts`, `src/app/acciones-normograma.ts`, `src/lib/esquemas/normograma.ts`, `src/app/api/normas/**` | Normograma: catálogo, relaciones y estados, asociaciones, cambios e impactos, búsqueda, PDF | 8 |
| `src/app/(app)/normograma/**`, `src/componentes/normograma/*`, `src/lib/normograma/normograma-excel.ts`, `src/app/(app)/procesos/[slug]/page.tsx`, `src/app/(app)/buscar/page.tsx`, `src/app/api/buscar/route.ts`, `src/componentes/cascaron/{navegacion,Buscador}.tsx`, `src/db/consultas/vigencia/semaforo.ts` (marca normativa) | Pantallas del normograma, «Normas aplicables», grupo «Normas» en la búsqueda, tareas e impactos | 9 |
| `src/db/consultas/vigencia/revision-anual.ts`, `src/db/consultas/tramites-flujo.ts` (`crearSolicitud`), `src/db/consultas/admin.ts` (`aplicarPublicacion`) | Campaña: abrir, foto, decisiones automáticas, enlace de trámites, normograma del proceso, prórroga, cierre, tareas, vencimientos | 10 |
| `src/lib/informe-anual.ts`, `src/db/consultas/vigencia/informe.ts`, `src/app/(app)/vigencia/revision-anual/**`, `src/componentes/vigencia/revision/*`, `src/app/(app)/tramites/nueva/page.tsx`, `src/app/(app)/tramites/[id]/page.tsx`, `src/app/admin/api/informe-ejemplo/route.ts` | Informe SGC-RG-06, pantallas de la revisión, solicitud prellenada y enlazada, formato del informe | 11 |
| `src/db/consultas/vigencia/indicadores.ts`, `src/app/(app)/vigencia/indicadores/**`, `src/lib/vigencia/indicadores-excel.ts`, `src/db/consultas/tramites-flujo.ts` (`transicionar`) | Indicadores documentales: consulta, página, Excel, `venceEn` en los eventos | 12 |
| `src/app/(app)/distribucion/socializaciones/excel/route.ts`, `src/lib/distribucion/{socializaciones-excel,acuses-excel}.ts`, `src/db/consultas/distribucion/{verificaciones,hallazgos,listas,copias}.ts`, `src/app/(app)/admin/(catalogos)/**`, `src/app/api/hallazgos/**`, `src/componentes/distribucion/**` | Herencia de la 13B: Excel de jornadas, fecha de corrección, catálogos en solo lectura, miembro «todos», hallazgos en dos pasos, dos tareas pequeñas | 13 |
| `src/lib/bitacora-detalle.ts`, `src/lib/tareas.ts` (agrupación), `src/componentes/cascaron/Cascaron.tsx`, `src/db/consultas/vigencia/vencimientos.ts` (silencio en campaña) | Frases de bitácora, agrupación de tareas, `siResponsableTecnico`, detalles transversales | 14 |
| `src/db/semillas/demo.ts`, `src/db/semillas/vigencia-demo.ts`, `tests/semilla-vigencia.test.ts` | Demo de la 13C (resiembra) | 15 |
| `docs/manual/usuario/07-*.md`, `CONTEXT.md`, `AGENTS.md`, `PLAN.md`, `README.md` | Documentación de cierre y verificación final | 16 |

---

### Tarea 1: Migración 0008, esquema, roles y privilegios

**Files:**
- Create: `drizzle/0008_fase13c-vigencia-externos-normograma.sql` (con
  `npm run db:generate -- --name fase13c-vigencia-externos-normograma`, más SQL a mano),
  `tests/esquema-fase13c.test.ts`
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts:46`, `src/db/semillas/minima.ts`
  (`limpiarTodo` y `sembrarBase`), `tests/privilegios-bd.test.ts`

**Interfaces:**
- Consumes: `sgc_impedir_modificacion()` (`drizzle/0002_fase11-acceso.sql`); `revertida`
  (`tests/utiles/transaccion.ts`); `fallaCon` (copiar de `tests/esquema-fase13b.test.ts`).
- Produces (nombres definitivos de BD; todo el plan los usa). FK con `ON DELETE RESTRICT`,
  fechas `timestamptz` salvo las marcadas `date`, `id` como en las demás tablas:
  - `tipos_documento.meses_revision integer NOT NULL DEFAULT 12`, `CHECK tipos_documento_meses_revision_valido` (`BETWEEN 1 AND 120`).
    La migración inserta el tipo «Documento externo» (`sigla 'DE'`, `autoridad 'operativo'`,
    `es_diligenciable false`, `orden = max(orden) + 1`) si no existe un tipo con esa sigla.
  - `documentos`: `origen text NOT NULL DEFAULT 'interno'` `CHECK documentos_origen_valido IN ('interno','externo')`;
    `meses_revision integer NULL` (`CHECK 1..120`); `proxima_revision_fijada date NULL`;
    `fijada_por bigint NULL` → `usuarios`; `fijada_en timestamptz NULL`; `fijada_nota text NULL`;
    `CHECK documentos_fijada_coherente`: `(proxima_revision_fijada IS NULL) = (fijada_por IS NULL)`;
    `revision_aviso_en`, `revision_escalado_en timestamptz NULL`.
  - `documento_versiones`: `edicion_externa text NULL`, `fecha_edicion_externa date NULL`;
    `versiones_origen_aprobacion_valido` pasa a `IN ('plataforma','fuera','externo')`.
  - `firmas`: `tramite_id` **pasa a nullable**; `firmas_firma_valida` pasa a
    `IN ('elaboro','reviso','aprobo','publico','ratifico','adopto')`; `CHECK firmas_tramite_coherente`:
    `tramite_id IS NOT NULL OR firma IN ('ratifico','adopto')`.
  - `tramites`: `revision_anual_id bigint NULL` → `revisiones_anuales`, `impacto_id bigint NULL` → `impactos_normativos`; índices.
  - `lista_miembros`: `referencia_id` **pasa a nullable**; `lista_miembros_tipo_valido` admite `'todos'`;
    `CHECK lista_miembros_referencia_coherente`: `(tipo = 'todos') = (referencia_id IS NULL)`; la
    restricción `lista_miembros_unico` se sustituye por el índice único `lista_miembros_unico_idx`
    sobre (`lista_id`, `tipo`, `referencia_id`) `NULLS NOT DISTINCT`.
  - `hallazgos`: `hallazgos_estado_valido` pasa a `IN ('abierto','por_validar','cerrado')`;
    `corregido_en timestamptz NULL`, `corregido_por bigint NULL` → `usuarios`, `nota_correccion text NULL`,
    `validacion text NULL CHECK IN ('admin','verificacion')`, `validacion_verificacion_id bigint NULL` → `verificaciones`,
    `reaperturas integer NOT NULL DEFAULT 0`.
  - `archivos.archivos_contexto_valido` pasa a `IN ('version','jornada','verificacion_item','norma','revision_anual','hallazgo')`.
  - `copias_controladas.copias_motivo_por_recoger_valido` admite `'retirado'`.
  - `ratificaciones`: `version_id NOT NULL` → `documento_versiones`, `firma_id NOT NULL UNIQUE` → `firmas`,
    `nota text NULL`, `proxima_revision date NOT NULL`, `revision_anual_id bigint NULL` → `revisiones_anuales`,
    `creado_en`; índice (`version_id`, `creado_en`). Trigger `ratificaciones_inmutable`.
  - `externos`: `documento_id NOT NULL UNIQUE` → `documentos`, `entidad_emisora text NOT NULL`,
    `titulo_original text NULL`, `fuente_oficial text NULL`, `responsable_id bigint NOT NULL` → `usuarios`,
    `verificacion_meses integer NOT NULL DEFAULT 12` (`CHECK 1..60`), `edicion_nueva_pendiente_desde timestamptz NULL`,
    `aviso_vencido_en`, `escalado_en timestamptz NULL`, `creado_en`, `actualizado_en`; índice `responsable_id`.
  - `externo_verificaciones`: `documento_id NOT NULL` → `documentos`, `version_id NOT NULL` → `documento_versiones`,
    `usuario_id NOT NULL` → `usuarios`, `resultado text NOT NULL CHECK IN ('vigente','edicion_nueva','retirado')`,
    `fuente_consultada text NOT NULL`, `nota text NULL`, `revision_anual_id bigint NULL`, `impacto_id bigint NULL`,
    `creado_en`; índice (`documento_id`, `creado_en`). Trigger `externo_verificaciones_inmutable`.
  - `revisiones_anuales`: `anio integer NOT NULL UNIQUE`, `estado text NOT NULL DEFAULT 'abierta' CHECK IN ('abierta','cerrada')`,
    `plazo_dias integer NOT NULL`, `ventana_meses integer NOT NULL`, `abierta_por NOT NULL` → `usuarios`,
    `abierta_en NOT NULL`, `vence_en NOT NULL`, `prorrogas jsonb NOT NULL DEFAULT '[]'`,
    `cerrada_por NULL`, `cerrada_en NULL`, `metodo_cierre text NULL CHECK IN ('clave','clave_totp')`,
    `informe jsonb NULL`. Índice único parcial `revisiones_una_abierta_idx` sobre `(estado) WHERE estado = 'abierta'`.
  - `revision_anual_procesos`: `revision_id NOT NULL`, `proceso_id NOT NULL` → `procesos`,
    `documentos integer NOT NULL` (conteo al abrir), `normograma_resultado text NULL CHECK IN ('sin_novedad','cambios')`,
    `normograma_nota text NULL`, `normograma_por NULL` → `usuarios`, `normograma_en NULL`,
    `aviso_vencido_en`, `escalado_en NULL`; único (`revision_id`, `proceso_id`).
  - `revision_anual_decisiones`: `revision_id NOT NULL`, `documento_id NOT NULL`, `version_id NOT NULL`,
    `decision text NOT NULL CHECK IN ('ratificar','actualizar','eliminar','reciente','en_tramite','sin_revisar')`,
    `usuario_id NULL` → `usuarios` (nulo si el sistema), `ratificacion_id NULL`, `verificacion_id NULL` → `externo_verificaciones`,
    `tramite_id NULL` → `tramites`, `insumos jsonb NOT NULL DEFAULT '{}'`, `creado_en`, `actualizado_en`;
    único (`revision_id`, `documento_id`); índice `tramite_id`.
  - `tipos_norma`: `nombre text NOT NULL`, `orden integer NOT NULL`, `activo boolean NOT NULL DEFAULT true`;
    índice único sobre `lower(nombre)`.
  - `normas`: `tipo_norma_id NOT NULL` → `tipos_norma`, `numero text NOT NULL`, `anio integer NOT NULL`,
    `fecha_expedicion date NULL`, `entidad_emisora text NOT NULL`, `titulo text NOT NULL`, `tema text NULL`,
    `estado text NOT NULL DEFAULT 'vigente' CHECK IN ('vigente','modificada','derogada','retirada')`,
    `estado_en date NULL`, `enlace_oficial text NULL`, `notas text NULL`, `creado_por NOT NULL` → `usuarios`,
    `creado_en`, `actualizado_en`, `tsv tsvector` generada con `espanol_unaccent` sobre
    `numero || ' ' || anio || ' ' || titulo` (peso A), `tema` (B), `entidad_emisora` (C); índices GIN sobre `tsv`
    y único (`tipo_norma_id`, `lower(numero)`, `anio`).
  - `norma_relaciones`: `norma_id NOT NULL`, `afectada_id NOT NULL` → `normas`, `tipo text NOT NULL CHECK IN ('modifica','deroga','reglamenta')`,
    `detalle text NULL`, `creado_por NOT NULL`, `creado_en`; único (`norma_id`, `afectada_id`, `tipo`);
    `CHECK norma_relaciones_distintas` (`norma_id <> afectada_id`).
  - `norma_cambios`: `norma_id NOT NULL`, `estado_anterior text NOT NULL`, `estado_nuevo text NOT NULL`,
    `fecha date NOT NULL`, `relacion_id NULL` → `norma_relaciones`, `usuario_id NOT NULL`, `nota text NULL`,
    `creado_en`; índice (`norma_id`, `creado_en`). Trigger `norma_cambios_inmutable`.
  - `norma_procesos`: `norma_id NOT NULL`, `proceso_id NOT NULL` → `procesos`, `requisito text NULL`,
    `creado_por NOT NULL`, `creado_en`, `actualizado_por NULL`, `actualizado_en NULL`; único (`norma_id`, `proceso_id`);
    índice `proceso_id`.
  - `norma_documentos`: `norma_id NOT NULL`, `documento_id NOT NULL` → `documentos`, `creado_por NOT NULL`, `creado_en`;
    único (`norma_id`, `documento_id`); índice `documento_id`.
  - `impactos_normativos`: `cambio_id NOT NULL` → `norma_cambios`, `norma_id NOT NULL`, `documento_id NULL` → `documentos`,
    `proceso_id NOT NULL` → `procesos`, `estado text NOT NULL DEFAULT 'pendiente' CHECK IN ('pendiente','resuelto')`,
    `vence_en NOT NULL`, `aviso_vencido_en`, `escalado_en NULL`,
    `resolucion text NULL CHECK IN ('solicitud','no_afecta','verificacion')`, `tramite_id NULL`,
    `verificacion_id NULL` → `externo_verificaciones`, `nota text NULL`, `resuelto_por NULL`, `resuelto_en NULL`, `creado_en`;
    índices (`documento_id`, `estado`) y (`proceso_id`, `estado`).
  - Función `sgc_impedir_si_revision_cerrada()` (plpgsql, `RAISE EXCEPTION … USING ERRCODE = '42501'`
    si la revisión de la fila está `cerrada`: para `revisiones_anuales` mira `OLD.estado`; para
    `revision_anual_procesos` y `revision_anual_decisiones` consulta su revisión) con triggers
    `revisiones_anuales_cerrada_inmutable BEFORE UPDATE OR DELETE`,
    `revision_anual_procesos_inmutables` y `revision_anual_decisiones_inmutables BEFORE UPDATE OR DELETE`.

- [ ] **Step 0: Guardar el acta de referencia**

Run: `mkdir -p .superpowers/13c && curl -s -o .superpowers/13c/acta-sol-001-main.pdf -b "sgc_sesion=<cookie de coordinadora.sgc>" http://localhost:3002/tramites/1/acta`
(o descargarla desde el navegador con `coordinadora.sgc`). Es la referencia byte a byte de la
Tarea 4. `.superpowers/` está en `.gitignore`.

- [ ] **Step 1: Tests que fallan**

`tests/esquema-fase13c.test.ts` (BD de desarrollo, `sql` como la app, al estilo de
`tests/esquema-fase13b.test.ts`; cada inserción que debe fallar va en `tx.savepoint`):

```ts
it("firmas: sin trámite solo para ratifico y adopto", () => revertida(sql, async (tx) => {
  const [v] = await tx`SELECT v.id FROM documento_versiones v WHERE v.estado = 'vigente' LIMIT 1`;
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const firmar = (firma: string, tramiteId: number | null) => tx.savepoint((s) =>
    s`INSERT INTO firmas (tramite_id, version_id, usuario_id, firma, ronda, hash_sha256, nombre_firmante, metodo)
      VALUES (${tramiteId}, ${v.id}, ${u.id}, ${firma}, 0, 'x', 'Alguien', 'clave')`);
  await firmar("ratifico", null);
  await firmar("adopto", null);
  expect(await fallaCon(firmar("aprobo", null))).toBe("23514");
  expect(await fallaCon(firmar("otra", null))).toBe("23514");
}));

it("documentos: origen, plazo y fecha fijada coherente", () => revertida(sql, async (tx) => {
  const [d] = await tx`SELECT id FROM documentos LIMIT 1`;
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE documentos SET origen = 'otro' WHERE id = ${d.id}`))).toBe("23514");
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE documentos SET meses_revision = 0 WHERE id = ${d.id}`))).toBe("23514");
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE documentos SET proxima_revision_fijada = '2027-01-01' WHERE id = ${d.id}`))).toBe("23514");
  const [{ n }] = await tx`SELECT count(*)::int AS n FROM tipos_documento WHERE meses_revision <> 12`;
  expect(n).toBe(0);
  const [de] = await tx`SELECT 1 FROM tipos_documento WHERE sigla = 'DE'`;
  expect(de).toBeTruthy();
}));

it("lista_miembros: 'todos' sin referencia, los demás con ella, y sin duplicados", () => revertida(sql, async (tx) => {
  const [l] = await tx`INSERT INTO listas_distribucion (nombre) VALUES ('zz_lista_13c') RETURNING id`;
  const miembro = (tipo: string, ref: number | null) => tx.savepoint((s) =>
    s`INSERT INTO lista_miembros (lista_id, tipo, referencia_id) VALUES (${l.id}, ${tipo}, ${ref})`);
  await miembro("todos", null);
  expect(await fallaCon(miembro("todos", null))).toBe("23505");
  expect(await fallaCon(miembro("todos", 1))).toBe("23514");
  expect(await fallaCon(miembro("usuario", null))).toBe("23514");
}));

it("una sola revisión anual abierta; cerrada, no se modifica ni ella ni sus decisiones", () => revertida(sql, async (tx) => {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const abrir = (anio: number) => tx.savepoint((s) =>
    s`INSERT INTO revisiones_anuales (anio, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
      VALUES (${anio}, 60, 6, ${u.id}, now(), now() + interval '60 days') RETURNING id`);
  const [r] = await abrir(2090);
  expect(await fallaCon(abrir(2091))).toBe("23505");
  const [d] = await tx`SELECT v.documento_id, v.id FROM documento_versiones v WHERE v.estado = 'vigente' LIMIT 1`;
  const [dec] = await tx`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision)
    VALUES (${r.id}, ${d.documento_id}, ${d.id}, 'reciente') RETURNING id`;
  await tx`UPDATE revisiones_anuales SET estado = 'cerrada', cerrada_en = now(), cerrada_por = ${u.id}, metodo_cierre = 'clave' WHERE id = ${r.id}`;
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE revisiones_anuales SET plazo_dias = 90 WHERE id = ${r.id}`))).toBe("42501");
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE revision_anual_decisiones SET decision = 'ratificar' WHERE id = ${dec.id}`))).toBe("42501");
  expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM revision_anual_decisiones WHERE id = ${dec.id}`))).toBe("42501");
}));

it("normas: única por tipo, número y año; relación consigo misma rechazada; tsv generada", () => revertida(sql, async (tx) => { /* 23505 en la segunda «Resolución 3100 de 2019»; 23514 en norma_id = afectada_id; tsv IS NOT NULL */ }));
it("hallazgos admite por_validar y archivos admite norma, revision_anual y hallazgo", () => revertida(sql, async (tx) => { /* UPDATE estado = 'por_validar' pasa; INSERT archivos contexto 'norma' con contexto_id pasa; 'otro' → 23514 */ }));
it("las tablas inmutables nuevas rechazan UPDATE y DELETE también al dueño", () => revertida(sql, async (tx) => { /* ratificaciones, externo_verificaciones, norma_cambios → 42501 */ }));
```

En `tests/privilegios-bd.test.ts`, el `it.each` de tablas inmutables pasa a
`["firmas", "tramite_eventos", "copia_eventos", "acuse_eventos", "ratificaciones", "externo_verificaciones", "norma_cambios"]`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/esquema-fase13c.test.ts tests/privilegios-bd.test.ts`
Expected: FAIL (tablas y columnas inexistentes; `firmas.tramite_id` NOT NULL).

- [ ] **Step 3: Esquema y migración**

Editar `src/db/esquema.ts` con lo de **Produces** (rutas relativas, nunca `@/`; en `firmas`,
`tramiteId` sin `.notNull()`; en `listaMiembros`, `referenciaId` sin `.notNull()` y
`uniqueIndex(...).on(...)` con `.nullsNotDistinct()`). Generar con
`npm run db:generate -- --name fase13c-vigencia-externos-normograma` y revisar el SQL: debe traer
`ALTER TABLE "firmas" ALTER COLUMN "tramite_id" DROP NOT NULL`,
`ALTER TABLE "lista_miembros" ALTER COLUMN "referencia_id" DROP NOT NULL`, el `DROP CONSTRAINT` de
cada `CHECK` que se amplía seguido de su `ADD CONSTRAINT` con la lista nueva, y las trece tablas.
Añadir a mano al final, separados por `--> statement-breakpoint`: el `INSERT` condicional del
tipo `DE`; la función `sgc_impedir_si_revision_cerrada()` y los seis triggers (`ratificaciones_inmutable`,
`externo_verificaciones_inmutable`, `norma_cambios_inmutable`, `revisiones_anuales_cerrada_inmutable`,
`revision_anual_procesos_inmutables`, `revision_anual_decisiones_inmutables`).

- [ ] **Step 4: Roles y semilla mínima**

`src/db/roles-bd.ts:46`: `REVOKE UPDATE, DELETE ON auditoria, accesos, firmas, tramite_eventos, copia_eventos, acuse_eventos, ratificaciones, externo_verificaciones, norma_cambios FROM ${r}`.
`limpiarTodo` (`src/db/semillas/minima.ts`): añadir al `TRUNCATE` las trece tablas nuevas.
`sembrarBase`: el tipo «Documento externo» (`DE`, orden 12) en la lista de tipos; `mesesRevision: 12`
no hace falta escribirlo (defecto de BD); la tabla `tipos_norma` con `["Ley", "Decreto", "Resolución", "Circular", "Acuerdo", "Norma técnica", "Sentencia", "Directiva", "Otro"]`
en ese orden; las claves de configuración de la Tarea 2 con sus valores por defecto como texto.

- [ ] **Step 5: Aplicar y verificar**

Run: `npm run db:preparar` y luego
`npx vitest run tests/esquema-fase13c.test.ts tests/privilegios-bd.test.ts tests/esquema.test.ts tests/esquema-fase13a.test.ts tests/esquema-fase13b.test.ts`
Expected: PASS, sobre la base sembrada sin resembrar.
Run: `npm run lint && npm test`
Expected: PASS (la migración es aditiva; la suite sigue en verde).

- [ ] **Step 6: Commit**

```bash
git add drizzle src/db tests
git commit -m "feat(f13c): migración 0008 - vigencia, externos, revisión anual, normograma y herencia de la 13B"
```

---

### Tarea 2: Permisos, tipos ampliados, firmas sin trámite y configuración de vigencia e indicadores

**Files:**
- Modify: `src/lib/permisos.ts`, `tests/permisos.test.ts`, `tests/acciones-permisos.test.ts:8-9`,
  `src/lib/tramites/tipos.ts`, `src/db/consultas/firmas.ts`, `src/db/consultas/admin.ts`
  (`aplicarPublicacion`), `src/lib/distribucion/tipos.ts`,
  `src/db/consultas/distribucion/version-vigencia.ts` (`CIERRE_DEL_AVISO`),
  `src/db/consultas/config-documental.ts`, `src/app/admin/acciones-config-documental.ts`,
  `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx`,
  `tests/config-documental.test.ts`, `tests/config-documental-pantalla.test.tsx`
- Create: `src/app/acciones-vigencia.ts` y `src/app/acciones-normograma.ts` (vacíos salvo
  `"use server";` y un comentario: los llenan las Tareas 4 a 12)

**Interfaces:**
- Produces (`permisos.ts`): nueve permisos nuevos con las celdas exactas del spec §6.2:
  `vigencia.ver` (admin_sgc, gerencia, control_interno, lider_proceso); `documentos.ratificar`
  (admin_sgc, gerencia, lider_proceso); `revision_anual.gestionar` (admin_sgc);
  `revision_anual.decidir` (admin_sgc, lider_proceso); `externos.gestionar` (admin_sgc,
  lider_proceso); `externos.verificar` (los cinco); `normograma.administrar` (admin_sgc);
  `normograma.procesos` (admin_sgc, lider_proceso); `documentos.indicadores` (admin_sgc,
  gerencia, control_interno, lider_proceso).
- Produces (`tramites/tipos.ts`): `FIRMAS = ["elaboro","reviso","aprobo","publico","ratifico","adopto"]`;
  `ETIQUETA_FIRMA` gana `ratifico: "Ratificó"`, `adopto: "Adoptó"`;
  `type OrigenAprobacion = "plataforma" | "fuera" | "externo"`; `APROBACION_EN_LISTADO.externo = "Adoptado"`;
  `APROBACION_DE_VERSION.externo = "Edición adoptada en la plataforma"`.
- Produces (`firmas.ts`): `registrarFirma(tx, f: { tramiteId: number | null; …; ronda: number; … })`
  (misma firma, `tramiteId` nullable); `listarFirmas` no cambia.
- Produces (`admin.ts`): `aplicarPublicacion(tx, versionId, origen: OrigenAprobacion, usuarioId, ahora?)`.
- Produces (`distribucion/tipos.ts`): `MOTIVOS_POR_RECOGER` gana `"retirado"`;
  `ETIQUETA_MOTIVO_POR_RECOGER.retirado = "El documento externo fue retirado"`;
  `CIERRE_DEL_AVISO.retirado = () => "el documento externo fue retirado"`.
- Produces (`config-documental.ts`): `ConfigDocumental` gana
  `vigencia: { atencionDias: number; revisionAnualPlazoDias: number; revisionAnualVentanaMeses: number; externosVerificacionMeses: number; impactoPlazoDias: number; formatoInforme: { documentoId: number | null; margenSuperiorCm: number; margenInferiorCm: number } }`
  y `metas: { dentroPlazoPct: number; aprobacionDias: number; vencidos: number; acusesPct: number; externosPct: number; etapasPlazoPct: number }`
  (la meta de conformidad es `distribucion.umbralConformidadPct`). Claves y defectos:
  `revision_atencion_dias` 90 (1–365), `revision_anual_plazo_dias` 60 (7–365),
  `revision_anual_ventana_meses` 6 (0–24), `externos_verificacion_meses` 12 (1–60),
  `impacto_plazo_dias` 15 (1–365), `formato_informe_documento_id` vacío,
  `formato_informe_margen_superior_cm` 5.5, `formato_informe_margen_inferior_cm` 3.5,
  `meta_dentro_plazo_pct` 95 (50–100), `meta_aprobacion_dias` 30 (1–365), `meta_vencidos` 0 (0–999),
  `meta_acuses_pct` 90 (50–100), `meta_externos_pct` 95 (50–100), `meta_etapas_plazo_pct` 90 (50–100).
  `DatosConfigDocumental` gana `vigencia?` y `metas?` con los mismos campos (números ya
  parseados); `guardarConfigDocumentalEn` los escribe y audita como los de distribución (tabla
  `CAMPOS_VIGENCIA` y `CAMPOS_METAS` al estilo de `CAMPOS_DISTRIBUCION`).
- Produces (pantalla): dos secciones nuevas en `FormularioConfigDocumental`: «Vigencia» (los
  cinco plazos y el formato del informe, con el mismo selector de documentos de «Formato del acta»
  y el botón «Ver informe de ejemplo», que la Tarea 11 conecta) e «Indicadores documentales» (las
  seis metas con su unidad).
- Produces (Tipos de documento): el campo **«Plazo de revisión (meses)»** (1–120, 12 por defecto)
  en el formulario de tipos (`src/componentes/admin/mapa/`, el formulario que ya lleva «Autoridad»
  y «Plantilla»), en su acción de `src/app/admin/acciones-mapa.ts` (esquema `zod` con
  `mesesRevision`) y en el CRUD de `src/db/consultas/mapa-admin.ts`; la lista de tipos lo muestra;
  `tests/mapa-admin.test.ts` cubre crear y editar con el valor y el rechazo de 0 y 121.

- [ ] **Step 1: Tests que fallan**

`tests/permisos.test.ts`: añadir las nueve filas a `ESPERADA`. `tests/acciones-permisos.test.ts`:
añadir `"src/app/acciones-vigencia.ts"` y `"src/app/acciones-normograma.ts"` a la lista.
`tests/config-documental.test.ts`:

```ts
it("lee los valores por defecto de vigencia y metas sin filas en configuracion", () => revertida(sql, async (tx) => {
  await tx`DELETE FROM configuracion WHERE clave LIKE 'revision_%' OR clave LIKE 'meta_%' OR clave LIKE 'externos_%' OR clave LIKE 'impacto_%' OR clave LIKE 'formato_informe_%'`;
  const c = await obtenerConfigDocumental({ sql: tx });
  expect(c.vigencia).toEqual({ atencionDias: 90, revisionAnualPlazoDias: 60, revisionAnualVentanaMeses: 6, externosVerificacionMeses: 12, impactoPlazoDias: 15, formatoInforme: { documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 } });
  expect(c.metas).toEqual({ dentroPlazoPct: 95, aprobacionDias: 30, vencidos: 0, acusesPct: 90, externosPct: 95, etapasPlazoPct: 90 });
}));
it("guarda metas y plazos de vigencia, acota los rangos y audita el cambio", () => revertida(sql, async (tx) => { /* metas.acusesPct 80 → se guarda; 30 → defecto 90; fila editar_config_documental con detalle.cambios.meta_acuses_pct */ }));
```

`tests/esquema.test.ts` o un test nuevo en `tests/tramites-reglas.test.ts`: `ETIQUETA_FIRMA.ratifico === "Ratificó"`,
`APROBACION_EN_LISTADO.externo === "Adoptado"`, `ETIQUETA_MOTIVO_POR_RECOGER.retirado` definida.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/permisos.test.ts tests/acciones-permisos.test.ts tests/config-documental.test.ts tests/tramites-reglas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Los nueve permisos en `MATRIZ` y `Permiso`; los tipos de **Produces**; `registrarFirma` con
`tramiteId: number | null`; el tipo de `origen` en `aplicarPublicacion`; las claves, defectos,
rangos, lectura, escritura y auditoría en `config-documental.ts`; el esquema `zod` de
`acciones-config-documental.ts` con los campos nuevos (`entero(...)`, `centimetros(...)`, el
`formatoInformeDocumentoId` opcional); las dos secciones del formulario; los dos archivos de
acciones vacíos.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/permisos.test.ts tests/acciones-permisos.test.ts tests/config-documental.test.ts tests/config-documental-pantalla.test.tsx tests/tramites-reglas.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): permisos de vigencia y normograma, firmas sin trámite, origen externo y configuración de vigencia y metas"
```

---
### Tarea 3: Reglas puras de vigencia e indicadores

**Files:**
- Create: `src/lib/vigencia/tipos.ts`, `src/lib/vigencia/plazo.ts`, `src/lib/vigencia/semaforo.ts`,
  `src/lib/indicadores-documentales/periodo.ts`, `src/lib/indicadores-documentales/definiciones.ts`,
  `src/lib/indicadores-documentales/metas.ts`, `tests/vigencia-reglas.test.ts`,
  `tests/indicadores-documentales.test.ts`

**Interfaces:**
- Consumes: `fechaEnZona`, `finDeFecha`, `estadoPlazo` (`src/lib/tramites/plazos.ts`);
  `ErrorTramite` (`src/db/consultas/flujo/contrato.ts`); `VarianteInsignia`
  (`src/componentes/ui/Insignia.tsx`); `ConfigDocumental["metas"]` (Tarea 2).
- Produces (`vigencia/tipos.ts`):
  - `ESTADOS_VIGENCIA = ["al_dia", "atencion", "vencida", "en_tramite"] as const`, `type EstadoVigencia`;
    `ETIQUETA_VIGENCIA: Record<EstadoVigencia, string>` = Al día, Atención, Vencida, En trámite;
    `VARIANTE_VIGENCIA: Record<EstadoVigencia, VarianteInsignia>` = bien, atencion, critico, neutra.
  - `RESULTADOS_VERIFICACION = ["vigente", "edicion_nueva", "retirado"] as const`, `type ResultadoVerificacion`,
    `ETIQUETA_RESULTADO` = «Sigue vigente», «Hay una edición nueva», «Fue retirado o derogado».
  - `DECISIONES = ["ratificar", "actualizar", "eliminar", "reciente", "en_tramite", "sin_revisar"] as const`,
    `type Decision`, `ETIQUETA_DECISION` = Ratificado, Por actualizar, Por eliminar, Revisado
    recientemente, En trámite, Sin revisar.
  - `class ErrorVigencia extends ErrorTramite` (mensaje visible; `recibirArchivo` lo trata como 409).
- Produces (`vigencia/plazo.ts`):
  - `type OrigenVigencia = "plataforma" | "fuera" | "externo"`.
  - `type BaseDeRevision = { origen: OrigenVigencia; publicadoEn: Date | null; fechaAprobacion: string | null; ultimaRatificacion: Date | null; ultimaVerificacion: Date | null }`.
  - `fechaBase(b: BaseDeRevision, zona: string): Date | null`: `plataforma` → `publicadoEn`;
    `fuera` → `finDeFecha(fechaAprobacion, zona)` (nunca `publicadoEn`, F13C-DC31); `externo` →
    `ultimaVerificacion ?? publicadoEn`; en los internos, la mayor entre esa fecha y
    `ultimaRatificacion`.
  - `sumarMeses(fecha: Date, meses: number, zona: string): Date`: suma meses calendario en la zona
    y devuelve el fin de ese día (el 31 de enero + 1 mes = fin del 28/29 de febrero).
  - `proximaRevision(d: { base: Date | null; meses: number; fijada: string | null }, zona: string): Date | null`:
    `fijada` → `finDeFecha(fijada, zona)`; si no, `base` + `meses`; sin base, `null`.
  - `limitesDeFechaFijada(d: { meses: number }, hoy: Date, zona: string): { minima: string; maxima: string }`:
    de mañana a `sumarMeses(hoy, meses)` en formato `YYYY-MM-DD`.
- Produces (`vigencia/semaforo.ts`):
  - `estadoVigencia(d: { proxima: Date | null; enTramite: boolean; impactoPendiente: boolean }, ahora: Date, atencionDias: number, zona: string): { estado: EstadoVigencia; dias: number | null }`:
    `enTramite` → `en_tramite`; `proxima` nula → `al_dia` con `dias: null`; pasada → `vencida` con
    `dias` negativos (días desde el vencimiento, `estadoPlazo`); a `atencionDias` o menos, o con
    `impactoPendiente` → `atencion`; si no, `al_dia`; `dias` positivos = días que faltan.
  - `textoVigencia(r: { estado: EstadoVigencia; dias: number | null }, extra?: { etapa?: string; dia?: number; cambioNormativo?: string }): string`:
    «Vencida hace 86 días», «Vence en 83 días», «Al día», «En trámite · revisión, día 3»,
    «Atención · revisión por cambio normativo».
- Produces (`indicadores-documentales/periodo.ts`):
  - `type Periodo = { clave: string; desde: Date; hasta: Date; etiqueta: string }`.
  - `periodoDe(clave: string, zona: string): Periodo | null`: acepta `AAAA`, `AAAA-MM`, `AAAA-T1..T4`,
    `AAAA-S1..S2`; `hasta` es el fin del último día; etiqueta «2026», «noviembre de 2026»,
    «tercer trimestre de 2026», «primer semestre de 2026».
  - `periodoActual(ahora: Date, zona: string): Periodo` (el año en curso).
- Produces (`indicadores-documentales/definiciones.ts`):
  - `type Medicion = { valor: number | null; numerador: number; denominador: number }`.
  - `porcentaje(numerador: number, denominador: number): Medicion` (`valor` nulo con denominador 0;
    redondeo a entero).
  - `dentroDelPlazo(docs: { vencida: boolean }[]): Medicion`.
  - `tiempoDeAprobacion(tramites: { solicitadoEn: Date; aceptadoEn: Date; publicadoEn: Date }[]): { promedio: number | null; mediana: number | null; desdeSolicitud: number | null; n: number }`
    (días con un decimal; nulos con `n = 0`).
  - `etapasEnPlazo(eventos: { cerradaEn: Date; venceEn: Date | null }[]): Medicion & { sinDato: number }`
    (los `venceEn` nulos no entran al denominador y se cuentan en `sinDato`).
  - `vencidosPorProceso(docs: { procesoId: number; proceso: string; sigla: string; vencida: boolean }[]): { procesoId: number; proceso: string; sigla: string; vencidos: number; vigentes: number; dentro: Medicion }[]`.
- Produces (`indicadores-documentales/metas.ts`):
  - `INDICADORES = ["dentro_plazo", "aprobacion", "vencidos", "acuses", "conformidad", "externos", "etapas"] as const`,
    `type Indicador`; `NOMBRE_INDICADOR: Record<Indicador, string>` (spec §11.1);
    `UNIDAD: Record<Indicador, "pct" | "dias" | "conteo">`; `SENTIDO: Record<Indicador, "min" | "max">`
    (`aprobacion` y `vencidos` son `max`; los demás `min`).
  - `metaDe(i: Indicador, c: { metas: ConfigDocumental["metas"]; umbralConformidadPct: number }): number`.
  - `cumple(i: Indicador, valor: number | null, meta: number): boolean | null`.

- [ ] **Step 1: Tests que fallan**

`tests/vigencia-reglas.test.ts` (sin BD, zona `America/Bogota`):

```ts
it("la fecha base de lo aprobado fuera es la fecha de aprobación, no la publicación", () => {
  const base = fechaBase({ origen: "fuera", publicadoEn: new Date("2026-11-05T15:00:00Z"), fechaAprobacion: "2025-08-14", ultimaRatificacion: null, ultimaVerificacion: null }, ZONA);
  expect(fechaEnZona(base!, ZONA)).toBe("2025-08-14");
});
it("la ratificación posterior reemplaza a la publicación; la anterior no", () => { /* plataforma con publicadoEn 2026-01-30 y ratificación 2026-06-01 → 2026-06-01; ratificación 2025-12-01 → 2026-01-30 */ });
it("un externo cuenta desde la última verificación o la adopción", () => { /* ultimaVerificacion null → publicadoEn */ });
it("sumarMeses respeta el calendario y la zona", () => {
  expect(fechaEnZona(sumarMeses(finDeFecha("2026-01-31", ZONA), 1, ZONA), ZONA)).toBe("2026-02-28");
  expect(fechaEnZona(sumarMeses(finDeFecha("2025-08-14", ZONA), 12, ZONA), ZONA)).toBe("2026-08-14");
});
it("la fecha fijada manda sobre base + meses", () => { /* fijada "2027-01-30" → ese día */ });
it("estadoVigencia: en trámite, vencida con días negativos, atención a 90 días, al día, marca normativa", () => {
  const ahora = finDeFecha("2026-11-08", ZONA);
  expect(estadoVigencia({ proxima: finDeFecha("2026-08-14", ZONA), enTramite: false, impactoPendiente: false }, ahora, 90, ZONA)).toEqual({ estado: "vencida", dias: -86 });
  expect(estadoVigencia({ proxima: finDeFecha("2027-01-30", ZONA), enTramite: false, impactoPendiente: false }, ahora, 90, ZONA)).toEqual({ estado: "atencion", dias: 83 });
  expect(estadoVigencia({ proxima: finDeFecha("2027-11-06", ZONA), enTramite: false, impactoPendiente: true }, ahora, 90, ZONA).estado).toBe("atencion");
  expect(estadoVigencia({ proxima: finDeFecha("2027-11-06", ZONA), enTramite: true, impactoPendiente: false }, ahora, 90, ZONA).estado).toBe("en_tramite");
});
it("limitesDeFechaFijada va de mañana al plazo del documento", () => { /* hoy 2026-11-08, 12 meses → minima 2026-11-09, maxima 2027-11-08 */ });
```

`tests/indicadores-documentales.test.ts`:

```ts
it("periodoDe entiende año, mes, trimestre y semestre y rechaza lo demás", () => {
  expect(periodoDe("2026-T3", ZONA)).toMatchObject({ etiqueta: "tercer trimestre de 2026" });
  expect(fechaEnZona(periodoDe("2026-T3", ZONA)!.hasta, ZONA)).toBe("2026-09-30");
  expect(periodoDe("2026-13", ZONA)).toBeNull();
});
it("porcentaje con denominador cero es sin dato", () => expect(porcentaje(0, 0)).toEqual({ valor: null, numerador: 0, denominador: 0 }));
it("dentroDelPlazo cuenta vencidos sobre vigentes", () => expect(dentroDelPlazo([{ vencida: true }, { vencida: false }, { vencida: false }]).valor).toBe(67));
it("tiempoDeAprobacion: promedio y mediana en días, nulos sin trámites", () => { /* [21, 27, 30] → promedio 26, mediana 27 */ });
it("etapasEnPlazo ignora las etapas sin fecha límite y las cuenta como sin dato", () => { /* 2 en plazo, 1 fuera, 1 sin venceEn → 67 %, sinDato 1 */ });
it("cumple respeta el sentido de cada indicador y es nulo sin valor", () => {
  expect(cumple("dentro_plazo", 94, 95)).toBe(false);
  expect(cumple("aprobacion", 24, 30)).toBe(true);
  expect(cumple("vencidos", 7, 0)).toBe(false);
  expect(cumple("acuses", null, 90)).toBeNull();
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/vigencia-reglas.test.ts tests/indicadores-documentales.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar los seis módulos con las firmas de Produces**

`sumarMeses`: descomponer la fecha en la zona (`Intl.DateTimeFormat` con `formatToParts`), sumar
los meses, recortar el día al último del mes destino y devolver `finDeFecha(…)`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/vigencia-reglas.test.ts tests/indicadores-documentales.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vigencia src/lib/indicadores-documentales tests
git commit -m "feat(f13c): reglas puras de vigencia, semáforo, periodos e indicadores documentales"
```

---

### Tarea 4: Semáforo y ratificación — consultas, acciones, pestaña «Semáforo» y bloque «Vigencia» de la ficha

**Files:**
- Create: `src/db/consultas/vigencia/semaforo.ts`, `src/db/consultas/vigencia/ratificaciones.ts`,
  `src/lib/esquemas/vigencia.ts`, `src/app/(app)/vigencia/_comun.ts`, `src/app/(app)/vigencia/page.tsx`,
  `src/app/(app)/vigencia/semaforo/page.tsx`, `src/app/(app)/vigencia/semaforo/excel/route.ts`,
  `src/lib/vigencia/semaforo-excel.ts`, `src/componentes/vigencia/PestanasVigencia.tsx`,
  `src/componentes/vigencia/ChipVigencia.tsx`, `src/componentes/vigencia/BloqueVigencia.tsx`,
  `src/componentes/vigencia/DialogoRatificar.tsx`, `src/componentes/vigencia/DialogoFijarFecha.tsx`,
  `src/componentes/vigencia/TablaSemaforo.tsx`, `tests/semaforo.test.ts`, `tests/ratificaciones.test.ts`,
  `tests/vigencia-rutas.test.ts`, `tests/utiles/vigencia.ts`
- Modify: `src/lib/alcance.ts`, `src/app/acciones-vigencia.ts`, `src/app/(app)/documentos/[codigo]/page.tsx`,
  `src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx`, `tests/handlers-permisos.test.ts`,
  `tests/alcance.test.ts`

**Interfaces:**
- Consumes: Tareas 2 y 3; `verificarParaFirmar`, `CredencialesFirma`, `ContextoFirma`
  (`src/lib/firma.ts`); `registrarFirma`; `huellaDeArchivo` (`src/lib/huella.ts`);
  `alcanceProcesos`, `enAlcance`, `filtroAcceso`, `puedeVerVersion`; `enTransaccion`,
  `OpcionesFlujo`, `SesionFlujo`; `registrarAuditoria`; `DialogoFirma` y `textoDeFirmar`
  (`src/componentes/tramites/DialogoFirma.tsx`); `construirHoja` (`src/lib/distribucion/hoja-excel.ts`);
  `obtenerMarcaSegura`; `crearLimitador`; `documentoLibre`, `usuarioDePrueba`, `sesionAdmin`
  (`tests/utiles/tramites.ts`).
- Produces (`alcance.ts`):
  - `puedeVerVigencia(sesion: SujetoVisibilidad & { responsableTecnico?: boolean }): boolean` =
    `vigencia.ver` o `documentos.indicadores` o `responsableTecnico`.
  - `puedeRatificar(sujeto: SujetoVisibilidad, d: { procesoId: number; autoridad: Autoridad; origen: "interno" | "externo"; enTramite: boolean; vigente: boolean }, alcance: Alcance): boolean`:
    `documentos.ratificar` y `vigente` y `!enTramite` y `origen === "interno"`, y además
    `admin_sgc` siempre; `lider_proceso` si `enAlcance(alcance, procesoId)`; `gerencia` si
    `autoridad === "estrategico"`.
  - `filtroVigencia(sql: Cliente, sujeto: SujetoVisibilidad, alcance: Alcance)`: fragmento para la
    pestaña (`filtroAcceso` y, para el líder, `dp.proceso_id = ANY(...)` sobre la asociación principal).
- Produces (`semaforo.ts`):
  - `type FilaSemaforo = { documentoId: number; codigo: string; titulo: string; origen: "interno" | "externo"; tipo: string; autoridad: Autoridad; proceso: { id: number; nombre: string; sigla: string }; version: { id: number; numero: number; edicion: string | null }; mesesRevision: number; ultimaRevision: { fecha: Date; clase: "publicacion" | "aprobacion" | "ratificacion" | "verificacion" | "adopcion"; quien: string | null } | null; proximaRevision: Date | null; fijada: { por: string; en: Date; nota: string } | null; vigencia: { estado: EstadoVigencia; dias: number | null }; tramite: { id: number; numero: string; etapa: Etapa; dia: number } | null; impacto: { cambioId: number; norma: string } | null }`.
  - `type FiltroSemaforo = { estado?: EstadoVigencia | "todos"; procesoId?: number; origen?: "interno" | "externo" | "todos" }`.
  - `listarSemaforo(sesion: SesionFlujo, filtro: FiltroSemaforo, opciones?: { sql?: Cliente; ahora?: Date }): Promise<FilaSemaforo[]>`:
    una consulta sobre los documentos con versión vigente que pasan `filtroVigencia`, con
    `LATERAL` para la última ratificación, la última verificación (`externo_verificaciones`), el
    trámite abierto y el impacto pendiente (la Tarea 9 llena esa tabla; aquí la consulta ya la lee
    y devuelve `null`); el estado se calcula en TS con `fechaBase`, `proximaRevision` y
    `estadoVigencia` usando `config.vigencia.atencionDias`; el filtro de estado se aplica después.
  - `vigenciaDeDocumento(documentoId: number, sesion: SesionFlujo, opciones?): Promise<(FilaSemaforo & { acciones: { ratificar: boolean; solicitar: boolean; ajustar: boolean }; ratificaciones: Ratificacion[] }) | null>`
    (`null` si no pasa `puedeAccederDocumento`).
  - `conteosSemaforo(sesion, opciones?): Promise<Record<EstadoVigencia, number> & { total: number; dentroDelPlazoPct: number | null }>`.
  - `fijarProximaRevision(sesion: SesionFlujo, d: { documentoIds: number[]; fecha: string; nota: string }, opciones?): Promise<{ fijados: number }>`:
    `revision_anual.gestionar`; cada documento vigente, interno; `fecha` dentro de
    `limitesDeFechaFijada` del documento o `ErrorVigencia("La fecha debe estar entre mañana y el <max>")`
    (con `documentoIds.length > 1` y una fecha fuera del límite de alguno, rechaza todo y nombra el
    código); `UPDATE documentos SET proxima_revision_fijada, fijada_por, fijada_en, fijada_nota, revision_aviso_en = NULL, revision_escalado_en = NULL`;
    auditoría `fecha_revision_fijada` por documento con `detalle: { codigo, fecha, nota }`.
  - `quitarFechaFijada(sesion, documentoId, opciones?)`: vuelve los cinco campos a nulo; auditoría `fecha_revision_quitada`.
  - `ajustarPlazo(sesion, d: { documentoId: number; mesesRevision: number | null }, opciones?)`: `revision_anual.gestionar`; 1–120 o nulo (el del tipo); auditoría `plazo_revision_ajustado` con antes y después.
- Produces (`ratificaciones.ts`):
  - `type Ratificacion = { id: number; versionId: number; version: number; nombre: string; cargo: string | null; nota: string | null; creadoEn: Date; proximaRevision: Date; revisionAnualId: number | null }`.
  - `validarRatificacion(sql: Cliente, sesion: SesionFlujo, documentoId: number): Promise<{ versionId: number; numero: number; codigo: string; procesoId: number; autoridad: Autoridad; hashRegistrado: string; ruta: string }>`:
    solo lectura; `ErrorVigencia("El documento no existe")` si no lo ve o no es interno vigente;
    `ErrorVigencia("El documento tiene un trámite abierto: el trámite ya es su revisión")`;
    `ErrorVigencia("No puede ratificar este documento")` si `puedeRatificar` es falso; sin principal,
    `ErrorVigencia("El documento no tiene archivo principal")`.
  - `ratificar(sesion: SesionFlujo, d: { documentoId: number; nota: string | null; credenciales: CredencialesFirma }, opciones?: OpcionesFlujo): Promise<{ ratificacionId: number; proximaRevision: Date }>`:
    `validarRatificacion`, luego la firma fuera de la transacción (`opciones.verificar ?? verificarParaFirmar`),
    luego en `enTransaccion`: `SELECT … FROM documentos WHERE id = … FOR UPDATE`, repetir la
    validación, `huellaDeArchivo(ruta)` y comparar con `hashRegistrado` (si difiere: auditoría
    `ratificacion_rechazada` con `detalle: { codigo, huellaRegistrada, huellaEnDisco }` y
    `ErrorVigencia("El archivo en disco no coincide con el registrado; avise al Administrador del SGC")`),
    `registrarFirma({ tramiteId: null, versionId, firma: "ratifico", ronda: 0, hashSha256, metodo, contexto, ahora })`,
    `INSERT ratificaciones` con `proxima_revision = fechaEnZona(sumarMeses(ahora, meses), zona)` y
    `revision_anual_id` de la revisión abierta si el documento está en ella (la Tarea 10 añade
    `registrarDecisionAutomatica`; aquí se deja el enlace nulo y un `TODO(T10)` no: se deja la
    llamada preparada en una función `alRatificar(tx, …)` vacía que la Tarea 10 llena),
    `UPDATE documentos SET proxima_revision_fijada = NULL, fijada_por = NULL, fijada_en = NULL, fijada_nota = NULL, revision_aviso_en = NULL, revision_escalado_en = NULL`;
    auditoría `documento_ratificado` con `detalle: { codigo, version, nota, proximaRevision }`. Sin avisos (F13C-DC3).
  - `ratificacionesDe(versionId: number, opciones?): Promise<Ratificacion[]>` (orden descendente).
- Produces (`esquemas/vigencia.ts`): `EsquemaRatificar = z.object({ documentoId: id, nota: textoAcotado("La nota", 0, 1000).optional(), clave, codigo? }).strict()`
  (los campos de clave como `EsquemaFirma` de `src/lib/esquemas/tramites.ts`);
  `EsquemaFijarFecha = z.object({ documentoIds: lista(id), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), nota: textoAcotado("La nota", 5, 500) }).strict()`;
  `EsquemaAjustarPlazo = z.object({ documentoId: id, mesesRevision: z.string().regex(/^\d{0,3}$/) }).strict()`.
- Produces (`acciones-vigencia.ts`): `ratificarAccion(_prev: EstadoAccion, formData): Promise<EstadoAccion>`
  (`mutacion(formData, "documentos.ratificar", …)`, devuelve la ruta de la ficha; un `ErrorFirma` que
  cierra la sesión redirige a `/ingreso` como en `acciones-tramites.ts`);
  `fijarFechaAccion` y `quitarFechaAccion` (`revision_anual.gestionar`); `ajustarPlazoAccion`.
- Produces (`vigencia/_comun.ts`): `exigirVigencia(sesion: SesionValida): Promise<void>` (con
  `esResponsableTecnico`, que la Tarea 6 crea: hasta entonces, `false`), `notFound()` si no.
- Produces (pantallas): `/vigencia` redirige a `/vigencia/semaforo` (o, para quien solo es
  responsable técnico, a `/vigencia/externos` desde la Tarea 7); `/vigencia/semaforo` con
  `PestanasVigencia` (Semáforo, Revisión anual, Externos, Indicadores; las dos últimas las habilitan
  las Tareas 7 y 12, hasta entonces no se pintan), las cuatro tarjetas de conteo, los filtros por
  `searchParams` (`estado`, `proceso`, `origen`), `TablaSemaforo` (columnas de la maqueta 2, a 390
  px tarjetas) con `ChipVigencia` y los botones «Ratificar» (`DialogoRatificar`, sobre
  `DialogoFirma` con `resumen` del documento) y «Solicitar cambio» (enlace a
  `/tramites/nueva?documento=<codigo>&motivo=revision_anual`), y para `revision_anual.gestionar` el
  bloque «Fijar próxima revisión a los N documentos filtrados» (`DialogoFijarFecha`). Excel en
  `/vigencia/semaforo/excel` (`vigencia.ver`, 10/min por usuario, `construirHoja` con las columnas
  de la tabla más la nota de la fecha fijada, auditoría `exporto_semaforo`).
- Produces (ficha): `BloqueVigencia({ documentoId, sesion })` (Server Component) debajo del bloque
  de control en la ficha del portal y del panel: chip, plazo con «Ajustar» para el Admin SGC, última
  y próxima revisión, «fijada por …», marca de cambio normativo (Tarea 9), historial de
  ratificaciones, botones según `acciones`. En un externo, nada aquí (la Tarea 7 pinta su bloque).
- Produces (`tests/utiles/vigencia.ts`): `vigenteFuera(tx, d: { fechaAprobacion: string; proceso?: string; autoridad?: Autoridad }): Promise<DocumentoLibre & { versionId: number; procesoId: number }>`
  (un `documentoLibre` publicado «fuera» con esa fecha de aprobación y un principal real en el almacén,
  reutilizando `archivoPrincipal` de `tests/utiles/distribucion.ts`); `firmaDePrueba`: un
  `Verificador` que acepta la clave `"ok"` con `metodo: "clave"` y rechaza las demás.

- [ ] **Step 1: Tests que fallan**

`tests/semaforo.test.ts` (BD, `revertida`):

```ts
it("un documento aprobado fuera hace 15 meses sale vencido aunque se cargó ayer", () => revertida(sql, async (tx) => {
  const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
  const fila = (await listarSemaforo(await sesionAdmin(tx), { estado: "vencida" }, { sql: tx, ahora })).find((f) => f.documentoId === d.id)!;
  expect(fila.vigencia.estado).toBe("vencida");
  expect(fechaEnZona(fila.proximaRevision!, ZONA)).toBe("2026-08-14");
  expect(fila.ultimaRevision).toMatchObject({ clase: "aprobacion" });
}));
it("el líder solo ve los documentos de sus procesos y Gerencia todo", () => revertida(sql, async (tx) => { /* lider.gth no ve un vigenteFuera de CEX; gerente sí */ }));
it("fijar la fecha a mano la muestra como fijada y la rechaza fuera de los límites", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
  await expect(fijarProximaRevision(admin, { documentoIds: [d.id], fecha: fechaEnZona(ahora, ZONA), nota: "carga inicial" }, { sql: tx, ahora })).rejects.toThrow("La fecha debe estar entre");
  await fijarProximaRevision(admin, { documentoIds: [d.id], fecha: "2027-03-01", nota: "carga inicial" }, { sql: tx, ahora });
  const v = await vigenciaDeDocumento(d.id, admin, { sql: tx, ahora });
  expect(v!.fijada).toMatchObject({ nota: "carga inicial" });
  expect(v!.vigencia.estado).toBe("al_dia");
  const [a] = await tx`SELECT 1 FROM auditoria WHERE accion = 'fecha_revision_fijada' AND entidad_id = ${d.id}`;
  expect(a).toBeTruthy();
}));
it("un líder no fija fechas y un trámite abierto pone el documento en trámite", () => revertida(sql, async (tx) => { /* ErrorPermiso; tramiteEn → estado en_tramite */ }));
```

`tests/ratificaciones.test.ts`:

```ts
it("el líder ratifica con clave: firma sin trámite, fila inmutable, reloj reiniciado y fecha fijada borrada", () => revertida(sql, async (tx) => {
  const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14", proceso: "GTH" });
  const lider = await sesionDe(tx, "lider.gth");
  await fijarProximaRevision(await sesionAdmin(tx), { documentoIds: [d.id], fecha: "2027-03-01", nota: "x" }, { sql: tx, ahora });
  const r = await ratificar(lider, { documentoId: d.id, nota: "Sin cambios", credenciales: { clave: "ok" } }, { sql: tx, ahora, verificar: firmaDePrueba });
  expect(fechaEnZona(r.proximaRevision, ZONA)).toBe("2027-11-08");
  const [f] = await tx`SELECT tramite_id, firma, ronda, version_id FROM firmas WHERE id = (SELECT firma_id FROM ratificaciones WHERE id = ${r.ratificacionId})`;
  expect(f).toMatchObject({ tramite_id: null, firma: "ratifico", ronda: 0, version_id: d.versionId });
  const [doc] = await tx`SELECT proxima_revision_fijada FROM documentos WHERE id = ${d.id}`;
  expect(doc.proxima_revision_fijada).toBeNull();
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE ratificaciones SET nota = 'y' WHERE id = ${r.ratificacionId}`))).toBe("42501");
}));
it("Gerencia ratifica solo estratégicos; consulta y un líder ajeno no; con trámite abierto nadie", () => revertida(sql, async (tx) => { /* mensajes de validarRatificacion */ }));
it("una clave errada no escribe nada y cuenta como firma fallida", () => revertida(sql, async (tx) => { /* credenciales { clave: "mala" } → ErrorFirma; sin filas en ratificaciones ni firmas */ }));
it("si el archivo en disco cambió, rechaza y deja ratificacion_rechazada", () => revertida(sql, async (tx) => {
  const d = await vigenteFuera(tx, { fechaAprobacion: "2025-08-14" });
  await writeFile(rutaAbsolutaDelPrincipal(d), new Uint8Array([1, 2, 3]));
  await expect(ratificar(await sesionAdmin(tx), { documentoId: d.id, nota: null, credenciales: { clave: "ok" } }, { sql: tx, ahora, verificar: firmaDePrueba })).rejects.toThrow("no coincide con el registrado");
  const [a] = await tx`SELECT 1 FROM auditoria WHERE accion = 'ratificacion_rechazada' AND entidad_id = ${d.id}`;
  expect(a).toBeTruthy();
  expect((await tx`SELECT 1 FROM firmas WHERE version_id = ${d.versionId} AND firma = 'ratifico'`).length).toBe(0);
}));
it("el acta de SOL-2026-001 no cambia con firmas sin trámite en la base", async () => { /* asegurarActa(1) → bytes idénticos a .superpowers/13c/acta-sol-001-main.pdf; se salta si la demo avanzó */ });
```

`tests/vigencia-rutas.test.ts` y `tests/handlers-permisos.test.ts`: `GET /vigencia/semaforo/excel`
401 sin sesión, 404 para `consulta`, 200 `xlsx` para `gerente` con fila `exporto_semaforo`.
`tests/alcance.test.ts`: la tabla de `puedeRatificar` por rol, autoridad, alcance, origen y trámite.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/semaforo.test.ts tests/ratificaciones.test.ts tests/vigencia-rutas.test.ts tests/alcance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Consultas, alcance y acciones**

Implementar **Produces** en `alcance.ts`, `semaforo.ts`, `ratificaciones.ts`, `esquemas/vigencia.ts`
y `acciones-vigencia.ts`. La consulta del semáforo es una sola sentencia con `LATERAL` por fuente;
todo lo demás (`fechaBase`, `proximaRevision`, `estadoVigencia`) corre en TS por fila.

- [ ] **Step 4: Pantallas**

`_comun.ts`, `/vigencia` y `/vigencia/semaforo` con sus componentes, el Excel, y `BloqueVigencia`
en las dos fichas (debajo de la sección `titulo-control` del portal y en el detalle de la versión
vigente del panel). El chip usa `Insignia` con `VARIANTE_VIGENCIA` y `textoVigencia`.
`DialogoRatificar` compone `DialogoFirma` con `titulo "Ratificar <codigo>, versión <n>"`,
`etiquetaBoton "Ratificar sin cambios"`, un `textarea` de nota como `children` y el texto «La
próxima revisión pasará al <fecha>». A 390 px la tabla pasa a tarjetas (clases como `TablaCopias`).

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/semaforo.test.ts tests/ratificaciones.test.ts tests/vigencia-rutas.test.ts tests/alcance.test.ts tests/handlers-permisos.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS. En el navegador (`npm run dev`): `lider.gth` abre la ficha de un vencido, ratifica y
ve «Ratificado el …»; `coordinadora.sgc` fija la fecha a tres documentos filtrados y descarga el Excel.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13c): semáforo documental, ratificación firmada y fecha de revisión fijada a mano"
```

---
### Tarea 5: Semáforo en el Maestro, Gestión de documentos y la página del proceso; tareas y vencimientos de vigencia; entrada «Vigencia»

**Files:**
- Create: `src/db/consultas/vigencia/tareas.ts`, `src/db/consultas/vigencia/vencimientos.ts`,
  `tests/vigencia-tareas.test.ts`, `tests/vigencia-vencimientos.test.ts`
- Modify: `src/db/consultas/maestro.ts`, `src/lib/maestro-excel.ts`, `src/app/(app)/admin/(panel)/maestro/page.tsx`,
  `src/db/consultas/admin.ts` (`listarDocumentosAdmin`), `src/componentes/admin/TablaDocumentosAdmin.tsx`,
  `src/lib/filtro-documentos-admin.ts`, `src/db/consultas/procesos.ts`, `src/app/(app)/procesos/[slug]/page.tsx`,
  `src/componentes/documentos/GruposPorTipo.tsx`, `src/db/consultas/vencimientos.ts`, `src/lib/tareas.ts`,
  `src/componentes/cascaron/navegacion.ts`, `tests/navegacion.test.ts`, `tests/maestro.test.ts`,
  `tests/maestro-excel.test.ts`, `tests/tareas.test.ts`, `tests/filtro-documentos-admin.test.ts`

**Interfaces:**
- Consumes: `listarSemaforo`, `vigenciaDeDocumento` (Tarea 4); `avisarA`, `jefesDe`
  (`src/db/consultas/avisos-vencimiento.ts`); `lideresDeProceso`, `adminsActivos`; `estadoPlazo`;
  `porFila`, `queFalta`, `avisarYEscalar` (copiar el patrón de
  `src/db/consultas/distribucion/vencimientos.ts`, no importar sus privadas).
- Produces (`maestro.ts`): `FilaMaestro` gana `origen: "interno" | "externo"`, `edicion: string | null`,
  `ultimaRevision: string | null`, `proximaRevision: string | null`, `vigencia: EstadoVigencia | null`
  (calculados con las reglas de la Tarea 3 sobre las mismas columnas que el semáforo; `null` en
  las filas no vigentes de «todos»). `APROBACION_EN_LISTADO.externo` ya existe.
- Produces (`maestro-excel.ts`): columnas nuevas «Origen» (tras «Tipo»), «Edición» (tras «Versión»),
  «Última revisión», «Próxima revisión», «Vigencia» (al final, antes de «Proceso propietario»).
- Produces (`admin.ts`): `FilaDocumentoAdmin` gana `vigencia: { estado: EstadoVigencia; dias: number | null } | null`
  y `origen`; `filtro-documentos-admin.ts` gana el filtro `vigencia` (`todos`, `vencida`, `atencion`, `al_dia`, `en_tramite`).
- Produces (`procesos.ts`): `DocumentoListado` gana `vigencia: { estado: EstadoVigencia; dias: number | null } | null`;
  `resumenVigenciaDeProceso(procesoId: number, sesion: SesionFlujo, opciones?): Promise<{ vencidas: number; atencion: number }>`.
- Produces (`vigencia/tareas.ts`):
  - `tareasDeVigencia(sesion: SesionFlujo, opciones?: { sql?: Cliente; ahora?: Date }): Promise<Tarea[]>`:
    para los documentos internos vigentes en `atencion` o `vencida` cuyo proceso propietario lidera
    la persona (o todos los que no tienen líder, si es `admin_sgc`), **excluidos los que están en una
    revisión anual abierta** (`EXISTS revision_anual_decisiones` de la revisión abierta; hasta la
    Tarea 10 ese `EXISTS` es siempre falso), `id: "vigencia:<documentoId>"`, título «Revisar la
    vigencia de <codigo> v<n> · vence el <fecha>» o «… vencida hace N días», `enlace: /documentos/<codigo>`.
- Produces (`vigencia/vencimientos.ts`): `revisarVencimientosDeVigencia(opciones: { sql: Cliente; ahora: Date; config: ConfigDocumental }): Promise<{ avisados: number; escalados: number }>`
  con la pasada `documentosVencidos`: por cada persona destinataria (líderes del proceso, o los
  Admin SGC sin líder, **y** los Admin SGC siempre), **un aviso por persona y proceso** con el
  conteo (`vigencia.vencida`, título «N documentos con revisión vencida en <proceso>», enlace
  `/vigencia/semaforo?estado=vencida&proceso=<id>`), marcando `revision_aviso_en` en las filas
  avisadas en una sola transacción por proceso; escalamiento al jefe del líder a los
  `escalamientoDias` con `revision_escalado_en`, un aviso por jefe sin títulos; omitidos los
  documentos de la revisión anual abierta. `revisarVencimientos` (`src/db/consultas/vencimientos.ts`)
  la llama después de la distribución y suma su resultado.
- Produces (`tareas.ts`): `misTareas` suma `tareasDeVigencia`.
- Produces (`navegacion.ts`): `IconoNav` gana `"vigencia"` y `"normograma"`; entrada
  `{ href: "/vigencia", etiqueta: "Vigencia", icono: "vigencia", grupo: "documentos", algunPermiso: ["vigencia.ver", "documentos.indicadores"], siResponsableTecnico: true }`
  después de «Distribución»; `EntradaNav.siResponsableTecnico?: true` y `entradasVisibles` lo
  evalúa con `sujeto.responsableTecnico` (la Tarea 7 lo calcula en el cascarón). «Normograma» la
  añade la Tarea 9.

- [ ] **Step 1: Tests que fallan**

`tests/maestro.test.ts`: `obtenerListadoMaestro({ incluir: "vigentes" })` trae `origen: "interno"`,
`vigencia` no nulo y `proximaRevision` igual a la fecha de aprobación más doce meses en un
`vigenteFuera`. `tests/maestro-excel.test.ts`: las cinco cabeceras nuevas en su posición.
`tests/filtro-documentos-admin.test.ts`: el filtro `vigencia: "vencida"` deja solo las filas con ese estado.
`tests/vigencia-tareas.test.ts`:

```ts
it("el líder recibe la tarea de un vencido suyo; el Admin la de un proceso sin líder; nadie la de un al día", () => revertida(sql, async (tx) => { /* vigenteFuera GTH 2025-08-14 → lider.gth tiene vigencia:<id>; vigenteFuera de un proceso sin líder → admin la tiene; vigenteFuera 2026-10-01 → nadie */ }));
```

`tests/vigencia-vencimientos.test.ts`:

```ts
it("avisa una vez por persona y proceso, con el conteo, y marca las filas", () => revertida(sql, async (tx) => {
  const a = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
  const b = await vigenteFuera(tx, { fechaAprobacion: "2025-02-10", proceso: "GTH" });
  const r = await revisarVencimientosDeVigencia({ sql: tx, ahora, config });
  const avisos = await tx`SELECT titulo FROM notificaciones WHERE tipo = 'vigencia.vencida' AND usuario_id = ${liderGth.usuarioId}`;
  expect(avisos).toHaveLength(1);
  expect(avisos[0].titulo).toMatch(/^2 documentos con revisión vencida en/);
  expect((await tx`SELECT 1 FROM documentos WHERE id IN (${a.id}, ${b.id}) AND revision_aviso_en IS NULL`).length).toBe(0);
  expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(0);
}));
it("escala al jefe a los días configurados, sin título ni enlace", () => revertida(sql, async (tx) => { /* ahora + 4 días con escalamientoDias 3 → aviso vigencia.escalado al jefe de lider.gth, enlace null */ }));
```

`tests/navegacion.test.ts`: admin ve **19** entradas (20 tras la Tarea 9); `/vigencia` la ven
gerencia, control_interno y lider_proceso; `consulta` no, salvo `responsableTecnico: true`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/maestro.test.ts tests/maestro-excel.test.ts tests/filtro-documentos-admin.test.ts tests/vigencia-tareas.test.ts tests/vigencia-vencimientos.test.ts tests/navegacion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Las columnas del Maestro (página y Excel), la columna y el filtro «Vigencia» de Gestión de
documentos, el chip junto a cada documento en `GruposPorTipo` y el resumen «N con revisión vencida ·
M en atención» en el encabezado de la página del proceso (solo cuando hay alguno), las tareas, la
pasada de vencimientos y la entrada de la barra. La consulta del Maestro reutiliza los mismos
`LATERAL` de `listarSemaforo` (extraer a `src/db/consultas/vigencia/fragmentos.ts` una función
`columnasDeVigencia(sql)` que ambos componen).

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/maestro.test.ts tests/maestro-excel.test.ts tests/filtro-documentos-admin.test.ts tests/vigencia-tareas.test.ts tests/vigencia-vencimientos.test.ts tests/navegacion.test.ts tests/tareas.test.ts tests/vencimientos.test.ts && npm run lint`
Expected: PASS. **Punto de control en navegador** (controlador): Semáforo, ficha con ratificación,
Maestro con las columnas, página de GTH con el resumen, «Mis tareas» de `lider.gth` con «Revisar la
vigencia…», claro, oscuro y 390 px.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): semáforo en Maestro, Gestión y página del proceso; tareas y vencimientos de vigencia; entrada Vigencia"
```

---

### Tarea 6: Documentos externos — alta, edición en borrador, adopción, verificación y retiro

**Files:**
- Create: `src/db/consultas/vigencia/externos.ts`, `src/app/api/externos/[versionId]/archivos/route.ts`,
  `src/app/api/externos/[versionId]/archivos/[archivoId]/route.ts`, `tests/externos.test.ts`,
  `tests/externos-rutas.test.ts`
- Modify: `src/lib/alcance.ts`, `src/lib/esquemas/vigencia.ts`, `src/app/acciones-vigencia.ts`,
  `src/db/consultas/admin.ts` (`publicarVersion`, `crearDocumentoEn` sin tocar su firma),
  `src/lib/recepcion-archivo.ts` (solo si `DestinoVersion` necesita `origen`), `src/proxy.ts`,
  `tests/proxy-matcher.test.ts`, `tests/handlers-permisos.test.ts`, `tests/utiles/vigencia.ts`

**Interfaces:**
- Consumes: `crearDocumentoEn`, `registrarArchivo`, `aplicarPublicacion`, `anularVigenteEn`,
  `exigirDocumentoRegistrable` (no: los externos no pasan por ella), `crearAcusesAlPublicar`,
  `pedirSocializacion` (exportarla desde `src/db/consultas/distribucion/jornadas.ts` si es
  privada), `avisarEliminacion` (exportarla desde `flujo/cierre.ts` como `avisarRetiro(tx, documentoId, codigo, titulo, ahora, actorId, texto)`),
  `sugerirCodigo`, `exigirFormatoDeCodigo` (`src/db/consultas/codigos.ts`), `registrarFirma`,
  `verificarParaFirmar`, `recibirArchivo` con `DestinoVersion`, `sumarMeses`, `sesionDe`.
- Produces (`alcance.ts`): `puedeVerExterno(documentoId: number, sujeto: SujetoVisibilidad & { usuarioId: number }, opciones?): Promise<boolean>`
  = `externos.gestionar` con el proceso propietario en alcance, o responsable técnico, o
  `vigencia.ver` con alcance; siempre además `puedeAccederDocumento`.
  `puedeGestionarExterno(sujeto, procesoId, alcance): boolean`.
- Produces (`externos.ts`):
  - `type DatosExterno = { titulo: string; procesoId: number; subprocesoId: number | null; otrosProcesos: AsociacionEntrada[]; nivelAcceso: "general" | "restringido"; descripcion: string | null; palabrasClave: string | null; entidadEmisora: string; tituloOriginal: string | null; fuenteOficial: string | null; responsableId: number; verificacionMeses: number; normaId: number | null; edicion: string; fechaEdicion: string | null }`.
  - `registrarExterno(sesion: SesionFlujo, d: DatosExterno, opciones?): Promise<{ documentoId: number; versionId: number; codigo: string }>`:
    `externos.gestionar` y alcance; código = `sugerirCodigo({ procesoId, tipoDocumentoId: <DE> })`
    (si falta el tipo `DE` activo, `ErrorVigencia("Falta el tipo de documento «Documento externo»")`);
    `crearDocumentoEn` + `UPDATE documentos SET origen = 'externo'` + `INSERT externos` +
    `UPDATE documento_versiones SET edicion_externa, fecha_edicion_externa`; **sin
    `exigirCargaAbierta`**; auditoría `externo_registrado`. `responsableId` debe ser un usuario activo.
  - `editarControlExterno(sesion, documentoId: number, d: Pick<DatosExterno, "entidadEmisora" | "tituloOriginal" | "fuenteOficial" | "responsableId" | "verificacionMeses" | "normaId">, opciones?)`:
    auditoría `externo_editado` con antes y después.
  - `abrirEdicion(sesion, documentoId, d: { edicion: string; fechaEdicion: string | null; resumenCambios: string }, opciones?): Promise<{ versionId: number }>`:
    una sola edición en borrador (`ErrorVigencia("Ya hay una edición pendiente de adoptar")`),
    número = máximo + 1; `edicion_nueva_pendiente_desde` se conserva si venía de una verificación.
  - `editarEdicion(sesion, versionId, d, opciones?)`, `descartarEdicion(sesion, versionId, opciones?)` (estado `descartado`, F13A-DC16; auditoría).
  - `validarAdopcion(sql, sesion, versionId): Promise<{ documentoId; codigo; numero; procesoId; esPrimera: boolean; hashPrincipal: string | null }>`:
    borrador, documento externo, alcance, `edicion_externa` no vacía, `resumen_cambios` presente si no es la primera.
  - `adoptarEdicion(sesion: SesionFlujo, d: { versionId: number; pedirAcuses: boolean; requiereSocializacion: boolean; credenciales: CredencialesFirma; verificacionId?: number }, opciones?: OpcionesFlujo): Promise<{ documentoId: number; numero: number; obsoletas: number[]; acuses: number }>`:
    firma fuera de la transacción; dentro: `FOR UPDATE` de la versión y de `externos`, repetir
    `validarAdopcion`, huella = `huellaDeArchivo` del principal si existe o SHA-256 de
    `codigo|edicion|emisor` si no; `UPDATE documento_versiones SET aprobo = <nombre y cargo>, fecha_aprobacion = <hoy en zona>`;
    `registrarFirma({ tramiteId: null, versionId, firma: "adopto", ronda: 0, … })`;
    `aplicarPublicacion(tx, versionId, "externo", usuarioId, ahora)`; si `!esPrimera || pedirAcuses`,
    `crearAcusesAlPublicar(tx, versionId, ahora, [sesion.usuarioId])`; si `requiereSocializacion`,
    `pedirSocializacion`; `UPDATE externos SET edicion_nueva_pendiente_desde = NULL, aviso_vencido_en = NULL, escalado_en = NULL`;
    auditoría `externo_adoptado` con `detalle: { codigo, numero, edicion, obsoletas, acuses, verificacionId }`.
    `alAdoptar(tx, …)` queda preparada para la Tarea 10 (decisión de la campaña).
  - `registrarVerificacion(sesion, d: { documentoId: number; resultado: ResultadoVerificacion; fuente: string; nota: string | null; revisionAnualId?: number; impactoId?: number }, opciones?): Promise<{ verificacionId: number; retirado: boolean }>`:
    `externos.verificar` y (responsable técnico o `puedeGestionarExterno`); `fuente` de 3 a 300;
    inserta `externo_verificaciones` sobre la versión vigente; `vigente` → `UPDATE externos SET aviso_vencido_en = NULL, escalado_en = NULL`;
    `edicion_nueva` → `edicion_nueva_pendiente_desde = ahora` y aviso `externos.edicion_nueva` a
    quienes gestionan (líderes del proceso y Admin SGC) si quien verifica no gestiona;
    `retirado` → `retirarExterno` dentro de la misma transacción. Auditoría `externo_verificado`.
  - `retirarExterno(sesion, d: { documentoId: number; motivo: string; verificacionId?: number }, opciones?): Promise<void>`:
    `externos.gestionar` o la verificación en curso; `anularVigenteEn(tx, documentoId, usuarioId, ahora)`
    **con motivo `retirado`** (añadir a `anularVigenteEn` el parámetro opcional
    `motivo: MotivoPorRecoger = "eliminado"` y pasarlo a `alDejarDeSerVigente`); aviso a la
    audiencia «<codigo> <titulo> dejó de aplicar: el documento externo fue retirado»
    (`externos.retirado`, sin tarea); auditoría `externo_retirado` con el motivo.
  - `type Externo = { documentoId; codigo; titulo; nivelAcceso; proceso; control: { entidadEmisora; tituloOriginal; fuenteOficial; responsable: { id; nombre }; verificacionMeses; norma: { id; nombre } | null; edicionNuevaPendienteDesde: Date | null }; vigente: { versionId; numero; edicion; fechaEdicion; adoptadaEn: Date; adoptoPor: string } | null; borrador: { versionId; numero; edicion; fechaEdicion; resumenCambios; archivos: ArchivoFicha[] } | null; ediciones: { numero; edicion; estado; adoptadaEn: Date | null }[]; verificaciones: Verificacion[]; vigencia: { estado: EstadoVigencia; dias: number | null; proxima: Date | null }; acciones: { editar: boolean; abrirEdicion: boolean; adoptar: boolean; verificar: boolean; retirar: boolean } }`;
    `type Verificacion = { id; resultado; fuente; nota; nombre; creadoEn: Date; version: number }`.
  - `obtenerExterno(documentoId: number, sesion: SesionFlujo, opciones?): Promise<Externo | null>` (`puedeVerExterno`).
  - `type FilaExterno = Pick<Externo, "documentoId" | "codigo" | "titulo" | "proceso" | "vigencia"> & { emisor: string; edicion: string | null; adoptadaEn: Date | null; ultimaVerificacion: { fecha: Date; resultado: ResultadoVerificacion; nombre: string } | null; proximaVerificacion: Date | null; responsable: string; copiasVivas: number }`;
    `listarExternos(sesion, filtro: { estado?: EstadoVigencia | "todos"; procesoId?: number; responsableId?: number; q?: string }, opciones?): Promise<FilaExterno[]>`.
  - `esResponsableTecnico(usuarioId: number, opciones?): Promise<boolean>`.
  - `autorizarArchivoDeEdicion(versionId: number, sesion: SesionFlujo, opciones?): Promise<{ ok: true; destino: DestinoVersion } | { ok: false; estado: 404 | 409 }>`
    (409 si la versión no está en borrador).
- Produces (`admin.ts`): `publicarVersion` rechaza `origen = 'externo'` con
  `"Un documento externo se adopta desde Vigencia → Externos"`; `crearVersionBorrador` y
  `deshacerCarga` también rechazan externos con el mismo texto.
- Produces (esquemas): `EsquemaExterno` (todos los campos de `DatosExterno`, `verificacionMeses`
  1–60, `edicion` 1–60 caracteres), `EsquemaControlExterno`, `EsquemaEdicion` (`edicion`,
  `fechaEdicion?`, `resumenCambios` 5–2000), `EsquemaAdoptar` (`versionId`, `pedirAcuses?: "on"`,
  `requiereSocializacion?: "on"`, clave y código), `EsquemaVerificacion` (`documentoId`,
  `resultado`, `fuente` 3–300, `nota?` ≤ 1000), `EsquemaRetirar` (`documentoId`, `motivo` 5–500).
- Produces (acciones): `registrarExternoAccion`, `editarControlExternoAccion`, `abrirEdicionAccion`,
  `editarEdicionAccion`, `descartarEdicionAccion`, `adoptarEdicionAccion` (todas con
  `externos.gestionar`), `verificarExternoAccion` y `retirarExternoAccion` (`externos.verificar` /
  `externos.gestionar`). Devuelven `/vigencia/externos/<documentoId>`.
- Rutas: `POST /api/externos/[versionId]/archivos` (`sesionDePeticion`, `externos.gestionar`,
  `origenValido`, 30/min, `autorizarArchivoDeEdicion` → `recibirArchivo(peticion, destino, usuarioId)`
  con `rol` de la query como en `api/tramites`); `DELETE /api/externos/[versionId]/archivos/[archivoId]`
  (borrador y alcance; `eliminarArchivoBorrador`). Ambas fuera del `matcher`: añadir
  `api/externos/[0-9]+/archivos$` al patrón de `src/proxy.ts`.

- [ ] **Step 1: Tests que fallan**

`tests/externos.test.ts` (BD, `revertida`; `externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017" })`
en `tests/utiles/vigencia.ts`, que registra, sube un PDF real con `archivoPrincipal` y adopta con
`firmaDePrueba`):

```ts
it("registra un externo con código DE, origen externo y edición, sin depender de la carga directa", () => revertida(sql, async (tx) => {
  await tx`INSERT INTO configuracion (clave, valor) VALUES ('publicacion_directa', '0') ON CONFLICT (clave) DO UPDATE SET valor = '0'`;
  const lider = await sesionDe(tx, "lider.cex");
  const r = await registrarExterno(lider, datosExterno({ procesoId: cex.id }), { sql: tx });
  expect(r.codigo).toMatch(/^CEX-DE-\d{2}$/);
  const [d] = await tx`SELECT origen, tipo_id FROM documentos WHERE id = ${r.documentoId}`;
  expect(d.origen).toBe("externo");
}));
it("adoptar la primera edición publica sin acuses; la segunda deja obsoleta la anterior, recoge copias y pide acuses", () => revertida(sql, async (tx) => {
  const e = await externoDePrueba(tx, lider, { proceso: "CEX", edicion: "2017" });
  expect((await tx`SELECT 1 FROM acuses WHERE version_id = ${e.versionId}`).length).toBe(0);
  const [f] = await tx`SELECT firma, tramite_id FROM firmas WHERE version_id = ${e.versionId}`;
  expect(f).toMatchObject({ firma: "adopto", tramite_id: null });
  await copiaSobreVigente(tx, { documentoId: e.documentoId, punto });
  const { versionId } = await abrirEdicion(lider, e.documentoId, { edicion: "2023", fechaEdicion: null, resumenCambios: "Nuevas metas de presión" }, { sql: tx });
  const r = await adoptarEdicion(lider, { versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: { clave: "ok" } }, { sql: tx, ahora, verificar: firmaDePrueba });
  expect(r.obsoletas).toEqual([1]);
  expect(r.acuses).toBeGreaterThan(0);
  const [c] = await tx`SELECT estado, motivo_por_recoger FROM copias_controladas WHERE version_id = ${e.versionId}`;
  expect(c).toMatchObject({ estado: "por_recoger", motivo_por_recoger: "nueva_version" });
}));
it("adoptar dos veces la misma edición falla la segunda; la carga directa rechaza un externo", () => revertida(sql, async (tx) => {
  /* segunda adoptarEdicion → "La edición ya no está en borrador"; publicarVersion sobre un borrador de externo → "Un documento externo se adopta desde Vigencia → Externos" */
}));
it("la verificación la registra el responsable técnico: vigente reinicia; edición nueva avisa a quien gestiona; retirado anula con motivo retirado", () => revertida(sql, async (tx) => {
  /* consulta responsable → registrarVerificacion vigente OK; otro consulta → ErrorVigencia("El documento no existe"); edicion_nueva → edicion_nueva_pendiente_desde no nulo y aviso externos.edicion_nueva al líder; retirado → versión anulada, copias por_recoger con motivo 'retirado', aviso externos.retirado */
}));
it("las verificaciones son inmutables y la fecha base del externo es la última verificación", () => revertida(sql, async (tx) => { /* 42501; vigenciaDeDocumento.ultimaRevision.clase === "verificacion" */ }));
```

`tests/externos-rutas.test.ts`: `POST /api/externos/<v>/archivos` 401, 403 (`consulta`), 404
(líder de otro proceso), 409 (versión vigente), 201 (borrador propio con PDF); `DELETE` del
anexo del borrador. `tests/proxy-matcher.test.ts`: `/api/externos/5/archivos` fuera del proxy.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/externos.test.ts tests/externos-rutas.test.ts tests/proxy-matcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

`externos.ts` con todas las funciones; `anularVigenteEn` con el motivo opcional; los rechazos de
`admin.ts`; las rutas; el `matcher`; esquemas y acciones.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/externos.test.ts tests/externos-rutas.test.ts tests/proxy-matcher.test.ts tests/handlers-permisos.test.ts tests/publicar.test.ts tests/camino-directo.test.ts tests/copias-recogida.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): documentos externos - alta, edición en borrador, adopción firmada, verificación de vigencia y retiro"
```

---

### Tarea 7: Externos — matriz SGC-MZ-03, página del externo, alta, bloque de la ficha, Maestro, tareas y vencimientos

**Files:**
- Create: `src/app/(app)/vigencia/externos/page.tsx`, `src/app/(app)/vigencia/externos/nuevo/page.tsx`,
  `src/app/(app)/vigencia/externos/[id]/page.tsx`, `src/app/(app)/vigencia/externos/excel/route.ts`,
  `src/lib/vigencia/externos-excel.ts`, `src/componentes/vigencia/externos/{FormularioExterno,TablaExternos,PaginaExterno,DialogoAdoptar,FormularioVerificacion,BloqueExterno}.tsx`,
  `tests/externos-pantallas.test.tsx`
- Modify: `src/db/consultas/vigencia/tareas.ts`, `src/db/consultas/vigencia/vencimientos.ts`,
  `src/lib/tareas.ts`, `src/app/(app)/vigencia/_comun.ts`, `src/app/(app)/vigencia/page.tsx`,
  `src/componentes/vigencia/PestanasVigencia.tsx`, `src/componentes/vigencia/BloqueVigencia.tsx`,
  `src/app/(app)/documentos/[codigo]/page.tsx`, `src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx`,
  `src/app/(app)/admin/(panel)/page.tsx` (botón «Registrar documento externo»),
  `src/componentes/cascaron/Cascaron.tsx`, `tests/vigencia-tareas.test.ts`, `tests/vigencia-vencimientos.test.ts`,
  `tests/handlers-permisos.test.ts`

**Interfaces:**
- Consumes: Tarea 6; `ZonaCarga` (`src/componentes/admin/ZonaCarga.tsx`) apuntando a
  `/api/externos/<versionId>/archivos`; `DialogoFirma`; `construirHoja`.
- Produces (`vigencia/tareas.ts`): `tareasDeExternos(sesion, opciones?)`: para el responsable
  técnico, los externos vigentes en `atencion` o `vencida` → `id: "externo:<documentoId>"`,
  «Verificar la vigencia de <codigo> · <titulo>», enlace `/vigencia/externos/<id>`;
  `tareasDeAdopcion(sesion, opciones?)`: externos con `edicion_nueva_pendiente_desde` no nulo
  para quienes gestionan (alcance) → `id: "adopcion:<documentoId>"`, «Adoptar la edición nueva
  de <codigo>», vence a 15 días de esa fecha. `misTareas` suma ambas.
- Produces (`vigencia/vencimientos.ts`): pasada `externosVencidos`: externos con próxima
  verificación pasada y `aviso_vencido_en` nulo → aviso `externos.vencida` al responsable técnico
  (y a los Admin SGC agrupado por proceso), marca, escalamiento al jefe del responsable.
- Produces (pantallas): `/vigencia/externos` (la matriz: tabla de la maqueta 7 con filtros
  `estado`, `proceso`, `responsable`, `q`; «Registrar documento externo» con `externos.gestionar`;
  «Descargar Excel»); `/vigencia/externos/nuevo` (`FormularioExterno`: título, proceso propietario
  del alcance, otros procesos, nivel de acceso, descripción, palabras clave, los datos de control,
  la primera edición; al guardar redirige a la página del externo); `/vigencia/externos/[id]`
  (`PaginaExterno`: datos de control con «Editar», el borrador con `ZonaCarga`, «Qué cambió»,
  «Adoptar esta edición» (`DialogoAdoptar` sobre `DialogoFirma` con las casillas «Pedir acuse de
  lectura a la audiencia» y «Requiere socialización») y «Descartar»; «Adoptar edición nueva» abre
  el borrador; `FormularioVerificacion` (fuente, resultado, nota) para quien puede; «Retirar» con
  motivo; historial de ediciones y verificaciones). `/vigencia` redirige a `externos` cuando la
  persona solo es responsable técnico; `PestanasVigencia` muestra «Externos» (y solo esa para el
  responsable técnico sin `vigencia.ver`). `BloqueExterno({ documentoId, sesion })` en las dos
  fichas en lugar de `BloqueVigencia` cuando `origen = 'externo'`: emisor, edición, adoptó, fuente,
  norma, responsable, estado de verificación, y el enlace «Gestionar en Vigencia → Externos» para
  quien puede; sin «Solicitar cambio» ni «Emitir copia» si no hay principal PDF (regla 13B). El
  Excel (`/vigencia/externos/excel`, `vigencia.ver` o responsable técnico, que ve solo los suyos)
  con las columnas de la matriz más fuente oficial, norma y copias vivas; auditoría `exporto_externos`.
- Produces (`Cascaron.tsx`): calcula `responsableTecnico` con `esResponsableTecnico` y lo pasa a
  `entradasVisibles`; `exigirVigencia` lo usa.

- [ ] **Step 1: Tests que fallan**

`tests/vigencia-tareas.test.ts`: el responsable técnico de un externo vencido tiene
`externo:<id>`; tras `registrarVerificacion` `edicion_nueva`, `lider.cex` tiene `adopcion:<id>` y
el responsable ya no tiene `externo:<id>`. `tests/vigencia-vencimientos.test.ts`: un externo
vencido avisa una vez al responsable (`externos.vencida`) y escala a su jefe. `tests/externos-pantallas.test.tsx`
(render con `renderToStaticMarkup`, como `tests/distribucion-pantallas.test.tsx`): `TablaExternos`
pinta «Vencida hace N días» y el nombre del responsable; `PaginaExterno` sin borrador no muestra
«Adoptar esta edición» y con borrador sí; `BloqueExterno` no muestra «Solicitar cambio».
`tests/handlers-permisos.test.ts`: `GET /vigencia/externos/excel` 404 para `consulta` sin externos,
200 para `regente.farmacia` (responsable técnico en la demo desde la Tarea 15; hasta entonces un
`zz_*` responsable creado en el test) con solo sus filas.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/vigencia-tareas.test.ts tests/vigencia-vencimientos.test.ts tests/externos-pantallas.test.tsx tests/handlers-permisos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/vigencia-tareas.test.ts tests/vigencia-vencimientos.test.ts tests/externos-pantallas.test.tsx tests/handlers-permisos.test.ts tests/paginas-sesion.test.ts tests/navegacion.test.ts tests/cascaron.test.tsx && npm run lint`
Expected: PASS. **Punto de control en navegador**: `lider.cex` registra un externo, sube el PDF,
adopta; `consulta` (responsable) verifica desde el celular (390 px) con «hay edición nueva»;
`coordinadora.sgc` adopta la edición nueva y ve las copias por recoger; Maestro con «Origen:
Externo» y «Adoptado»; `gerente` descarga la matriz.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): matriz de documentos externos, página del externo, bloque de la ficha, tareas y vencimientos"
```

---
### Tarea 8: Normograma — catálogo, relaciones y estados, asociaciones, cambios e impactos, búsqueda y PDF

**Files:**
- Create: `src/lib/normograma/tipos.ts`, `src/db/consultas/normograma/normas.ts`,
  `src/db/consultas/normograma/relaciones.ts`, `src/db/consultas/normograma/asociaciones.ts`,
  `src/db/consultas/normograma/impactos.ts`, `src/db/consultas/normograma/tipos-norma.ts`,
  `src/db/consultas/normograma/busqueda.ts`, `src/lib/esquemas/normograma.ts`,
  `src/app/api/normas/[id]/archivos/route.ts`, `src/app/api/normas/[id]/archivos/[archivoId]/route.ts`,
  `tests/normas.test.ts`, `tests/normas-impactos.test.ts`, `tests/normas-rutas.test.ts`, `tests/utiles/normograma.ts`
- Modify: `src/lib/alcance.ts`, `src/app/acciones-normograma.ts`, `src/lib/subida.ts`
  (`CONTEXTOS_EVIDENCIA` gana `"norma"`, `"revision_anual"`, `"hallazgo"`), `src/lib/recepcion-archivo.ts`
  (si el tipo `DestinoEvidencia` lo necesita), `src/proxy.ts`, `tests/proxy-matcher.test.ts`,
  `tests/handlers-permisos.test.ts`, `tests/alcance.test.ts`

**Interfaces:**
- Consumes: `recibirArchivo` con `DestinoEvidencia` (`{ contexto: "norma", contextoId, carpeta: "normas/<id>" }`),
  `validarTipoEvidencia` (solo PDF para normas: un parámetro `soloPdf` o una lista propia),
  `evidenciasDe`, `evidenciaServible`, `eliminarEvidencia` (`src/db/consultas/distribucion/evidencias.ts`,
  generalizadas al contexto `norma`); `alcanceProcesos`, `enAlcance`; `lideresDeProceso`,
  `adminsActivos`; `fechaLimite`; `enviarAvisos` no (usar `avisarA` o `crearNotificacion`).
- Produces (`normograma/tipos.ts`): `ESTADOS_NORMA = ["vigente", "modificada", "derogada", "retirada"] as const`,
  `ETIQUETA_ESTADO_NORMA`; `TIPOS_RELACION = ["modifica", "deroga", "reglamenta"] as const`,
  `ETIQUETA_RELACION` («Modifica a», «Deroga a», «Reglamenta a») y `ETIQUETA_RELACION_INVERSA`
  («Modificada por», «Derogada por», «Reglamentada por»); `ESTADO_TRAS_RELACION: Record<TipoRelacion, EstadoNorma | null>`
  = modifica → `modificada`, deroga → `derogada`, reglamenta → `null`; `RESOLUCIONES_IMPACTO = ["solicitud", "no_afecta", "verificacion"]`;
  `nombreDeNorma(n: { tipo: string; numero: string; anio: number }): string` («Resolución 3100 de 2019»);
  `class ErrorNormograma extends ErrorTramite`.
- Produces (`alcance.ts`): `puedeAsociarNorma(sujeto, procesoId, alcance): boolean` (`normograma.procesos` y alcance);
  `puedeVerImpacto(sujeto, procesoId, alcance): boolean` (lo mismo, o `admin_sgc`).
- Produces (`tipos-norma.ts`): `listarTiposNorma(opciones?)`, `crearTipoNorma(sesion, nombre, opciones?)`,
  `editarTipoNorma`, `moverTipoNorma`, `alternarTipoNorma` (`normograma.administrar`; no se borra: se desactiva).
- Produces (`normas.ts`):
  - `type DatosNorma = { tipoNormaId: number; numero: string; anio: number; fechaExpedicion: string | null; entidadEmisora: string; titulo: string; tema: string | null; enlaceOficial: string | null; notas: string | null }`.
  - `crearNorma(sesion, d: DatosNorma, opciones?): Promise<{ id: number }>` (`normograma.administrar`;
    duplicado → `ErrorNormograma("Ya existe <nombre>")`; auditoría `norma_creada`).
  - `editarNorma(sesion, id, d: DatosNorma, opciones?)` (auditoría `norma_editada` con antes y después).
  - `cambiarEstadoNorma(sesion, d: { normaId: number; estado: EstadoNorma; fecha: string; nota: string | null }, opciones?): Promise<{ cambioId: number | null; impactos: number }>`:
    si el estado no cambia, nada; si no, `UPDATE normas`, `INSERT norma_cambios` y, cuando el nuevo
    estado es `modificada`, `derogada` o `retirada`, `crearImpactos` (abajo); auditoría `norma_estado`.
  - `retirarNorma(sesion, d: { normaId: number; motivo: string }, opciones?)` = `cambiarEstadoNorma` a `retirada` con la nota; `borrarNorma(sesion, normaId, opciones?)` solo sin relaciones, asociaciones, cambios ni archivos (`ErrorNormograma("La norma tiene historia: retírela")`).
  - `type Norma = { id; tipo: string; numero; anio; nombre: string; fechaExpedicion; entidadEmisora; titulo; tema; estado; estadoEn; enlaceOficial; notas; relaciones: { tipo: TipoRelacion; norma: { id; nombre; estado }; detalle; directa: boolean }[]; cambios: { estadoAnterior; estadoNuevo; fecha; nombre; nota; creadoEn }[]; procesos: { id; nombre; sigla; slug; requisito: string | null; puedeEditar: boolean }[]; documentos: { id; codigo; titulo; origen; visible: boolean }[]; archivo: Evidencia | null; acciones: { administrar: boolean } }`;
    `obtenerNorma(id: number, sesion: SesionFlujo, opciones?): Promise<Norma | null>` (toda sesión; los documentos restringidos que la persona no ve salen con `visible: false` y sin código ni título).
  - `type FilaNorma = { id; nombre; titulo; entidadEmisora; estado; estadoEn; anio; tipo; procesos: string[]; documentos: number }`;
    `type FiltroNormas = { tipoNormaId?: number; anio?: number; emisor?: string; estado?: EstadoNorma | "todas"; procesoId?: number; q?: string; incluirRetiradas?: boolean }`;
    `listarNormas(filtro: FiltroNormas, opciones?): Promise<FilaNorma[]>` (sin retiradas salvo `incluirRetiradas`).
  - `sugerirEmisores(prefijo: string, opciones?): Promise<string[]>` (`DISTINCT`, 10, `ILIKE`).
  - `aniosYEmisores(opciones?): Promise<{ anios: number[]; emisores: string[] }>` (para los filtros).
- Produces (`relaciones.ts`):
  - `registrarRelacion(sesion, d: { normaId: number; afectadaId: number; tipo: TipoRelacion; detalle: string | null; fecha?: string }, opciones?): Promise<{ relacionId: number; cambioId: number | null; impactos: number }>`:
    `normaId !== afectadaId` o `ErrorNormograma("Una norma no se relaciona consigo misma")`; duplicado →
    `ErrorNormograma("Esa relación ya está registrada")`; si `ESTADO_TRAS_RELACION[tipo]` no es nulo y la
    afectada está `vigente` (o `modificada` y pasa a `derogada`), llama `cambiarEstadoNorma` con
    `fecha = d.fecha ?? fecha_expedicion de la norma nueva ?? hoy` y `relacion_id`; una afectada ya
    `derogada` o `retirada` → `ErrorNormograma("<nombre> ya está <estado>")`; auditoría `norma_relacion`.
  - `eliminarRelacion(sesion, d: { relacionId: number; motivo: string }, opciones?)`: borra la fila;
    auditoría `norma_relacion_eliminada` con la relación y el motivo; no toca estados ni impactos.
- Produces (`asociaciones.ts`): `asociarProceso(sesion, d: { normaId; procesoId; requisito: string | null }, opciones?)`
  (`puedeAsociarNorma`; `UPSERT` del requisito; auditoría `norma_asociada` / `norma_requisito_editado`);
  `desasociarProceso(sesion, d: { normaId; procesoId }, opciones?)` (auditoría `norma_desasociada`);
  `enlazarDocumento(sesion, d: { normaId; documentoId }, opciones?)` (`puedeAsociarNorma` sobre el
  proceso propietario del documento, y `puedeAccederDocumento`; auditoría `norma_documento_enlazado`);
  `desenlazarDocumento`; `normasDeProceso(procesoId: number, sesion: SesionFlujo, opciones?): Promise<(FilaNorma & { requisito: string | null })[]>`;
  `normasDeDocumento(documentoId, sesion, opciones?): Promise<FilaNorma[]>`.
- Produces (`impactos.ts`):
  - `crearImpactos(tx: TransactionSql, d: { cambioId: number; normaId: number; ahora: Date; plazoDias: number }): Promise<number>`:
    un impacto por documento enlazado con versión vigente (proceso = propietario) y uno por
    proceso asociado sin documentos enlazados (sin `documento_id`); `vence_en = fechaLimite(ahora, plazoDias, zona)`;
    aviso `normograma.cambio` a los líderes de cada proceso (o Admin SGC) «<nombre> pasó a
    <estado>: revise su impacto en <proceso>» con enlace `/normograma/impactos/<cambioId>?proceso=<id>`.
  - `type Impacto = { id; cambio: { id; norma: { id; nombre }; estadoNuevo; fecha }; proceso: { id; nombre; sigla }; documento: { id; codigo; titulo; origen; version: number; tramiteAbierto: { id; numero } | null } | null; estado; venceEn; resolucion; tramite: { id; numero } | null; verificacion: { id; resultado } | null; nota; resueltoPor; resueltoEn }`.
  - `impactosDe(cambioId: number, procesoId: number, sesion: SesionFlujo, opciones?): Promise<Impacto[] | null>` (`null` si no ve).
  - `impactoPendienteDe(documentoId: number, opciones?): Promise<{ cambioId: number; norma: string } | null>`.
  - `resolverImpacto(sesion, d: { impactoId: number } & ({ resolucion: "no_afecta"; nota: string } | { resolucion: "solicitud"; tramiteId: number } | { resolucion: "verificacion"; verificacionId: number }), opciones?): Promise<void>`:
    `puedeVerImpacto`; `no_afecta` exige nota ≥ 5; `solicitud` exige que el trámite sea del
    documento (o del proceso en una creación); auditoría `impacto_resuelto`.
  - `tareasDeImpactos(sesion, opciones?): Promise<Tarea[]>`: un `id: "impacto:<cambioId>:<procesoId>"`
    por cambio y proceso con pendientes, «Revisar el impacto de <nombre> (<estado>) en <proceso> (N)».
  - `impactosVencidos(c)` para `revisarVencimientosDeVigencia` (aviso `normograma.impacto_vencido` y escalamiento).
- Produces (`busqueda.ts`): `buscarNormas(q: string, limite: number, opciones?): Promise<{ id: number; nombre: string; titulo: string; estado: EstadoNorma }[]>`
  (FTS sobre `tsv` con `espanol_unaccent` más `ILIKE` sobre `numero`, sin retiradas).
- Produces (esquemas): `EsquemaNorma`, `EsquemaEstadoNorma`, `EsquemaRelacion`, `EsquemaMotivo`,
  `EsquemaAsociarProceso` (`normaId`, `procesoId`, `requisito?` ≤ 2000), `EsquemaEnlazarDocumento`,
  `EsquemaResolverImpacto` (discriminado por `resolucion`), `EsquemaTipoNorma`.
- Produces (`acciones-normograma.ts`): una acción por función de **Produces**, con
  `normograma.administrar` o `normograma.procesos` según el caso.
- Rutas: `POST /api/normas/[id]/archivos` (`normograma.administrar`, `origenValido`, solo PDF,
  reemplaza el anterior: un archivo por norma), `DELETE …/[archivoId]`; servido en la Tarea 9.
  Fuera del `matcher`: `api/normas/[0-9]+/archivos$`.
- Produces (`tests/utiles/normograma.ts`): `normaDePrueba(tx, admin, d?: Partial<DatosNorma>): Promise<{ id: number; nombre: string }>`
  (número único por corrida: `zz_${Date.now()}`).

- [ ] **Step 1: Tests que fallan**

`tests/normas.test.ts`:

```ts
it("crea, lista y busca una norma; el duplicado se rechaza", () => revertida(sql, async (tx) => { /* nombreDeNorma; listarNormas({ q: "zz_" }); buscarNormas; segundo crearNorma → "Ya existe" */ }));
it("«deroga a» pasa la afectada a derogada con la fecha de la nueva y deja el cambio; consigo misma, repetida o sobre una derogada se rechaza", () => revertida(sql, async (tx) => {
  const vieja = await normaDePrueba(tx, admin, { anio: 2014 });
  const nueva = await normaDePrueba(tx, admin, { anio: 2019, fechaExpedicion: "2019-11-25" });
  const r = await registrarRelacion(admin, { normaId: nueva.id, afectadaId: vieja.id, tipo: "deroga", detalle: null }, { sql: tx, ahora });
  const [n] = await tx`SELECT estado, estado_en::text FROM normas WHERE id = ${vieja.id}`;
  expect(n).toEqual({ estado: "derogada", estado_en: "2019-11-25" });
  expect(r.cambioId).not.toBeNull();
  await expect(registrarRelacion(admin, { normaId: nueva.id, afectadaId: nueva.id, tipo: "modifica", detalle: null }, { sql: tx })).rejects.toThrow("consigo misma");
  await expect(registrarRelacion(admin, { normaId: nueva.id, afectadaId: vieja.id, tipo: "deroga", detalle: null }, { sql: tx })).rejects.toThrow("ya está registrada");
  await expect(registrarRelacion(admin, { normaId: (await normaDePrueba(tx, admin)).id, afectadaId: vieja.id, tipo: "deroga", detalle: null }, { sql: tx })).rejects.toThrow("ya está derogada");
  expect((await tx`SELECT 1 FROM impactos_normativos WHERE norma_id = ${vieja.id}`).length).toBe(0);
}));
it("el líder asocia su proceso con requisito y enlaza un documento suyo; otro proceso no; el requisito se audita", () => revertida(sql, async (tx) => { /* lider.gth asocia GTH; CEX → ErrorNormograma; enlazarDocumento de CEX → rechazo */ }));
it("retirar una norma la saca de la lista y la deja en la ficha; borrar solo si está vacía", () => revertida(sql, async (tx) => { /* ... */ }));
it("norma_cambios es inmutable y el enlace oficial se guarda como texto", () => revertida(sql, async (tx) => { /* 42501; obtenerNorma().enlaceOficial igual al texto guardado */ }));
```

`tests/normas-impactos.test.ts`:

```ts
it("derogar una norma con documentos enlazados abre un impacto por documento y uno por proceso sin documentos, con tarea y aviso al líder", () => revertida(sql, async (tx) => {
  const n = await normaDePrueba(tx, admin);
  const doc = await vigenteFuera(tx, { fechaAprobacion: "2026-10-01", proceso: "GTH" });
  await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
  await asociarProceso(admin, { normaId: n.id, procesoId: cex.id, requisito: "art. 5" }, { sql: tx });
  const r = await cambiarEstadoNorma(admin, { normaId: n.id, estado: "derogada", fecha: "2026-11-01", nota: null }, { sql: tx, ahora });
  expect(r.impactos).toBe(2);
  expect((await tareasDeImpactos(liderGth, { sql: tx })).map((t) => t.id)).toContain(`impacto:${r.cambioId}:${gth.id}`);
  expect((await vigenciaDeDocumento(doc.id, admin, { sql: tx, ahora }))!.vigencia.estado).toBe("atencion");
  const [aviso] = await tx`SELECT 1 FROM notificaciones WHERE tipo = 'normograma.cambio' AND usuario_id = ${liderGth.usuarioId}`;
  expect(aviso).toBeTruthy();
}));
it("«no afecta» exige nota y quita la marca; una solicitud enlazada resuelve con el trámite; otro líder recibe 404", () => revertida(sql, async (tx) => { /* resolverImpacto no_afecta nota "x" → rechazo; nota válida → estado resuelto y vigencia al_dia; crearSolicitud modificar + resolverImpacto solicitud → tramite enlazado; lider.cex → impactosDe null */ }));
it("un cambio de estado sobre una norma sin documentos ni procesos no deja impactos ni tareas", () => revertida(sql, async (tx) => { /* impactos 0 */ }));
```

`tests/normas-rutas.test.ts`: `POST /api/normas/<id>/archivos` 401, 403 (`lider_proceso`), 415 con
un PNG, 201 con PDF y reemplazo del anterior; `tests/proxy-matcher.test.ts`: `/api/normas/5/archivos` fuera.
`tests/alcance.test.ts`: `puedeAsociarNorma` y `puedeVerImpacto` por rol y alcance.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/normas.test.ts tests/normas-impactos.test.ts tests/normas-rutas.test.ts tests/proxy-matcher.test.ts tests/alcance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

`listarSemaforo` y `vigenciaDeDocumento` (Tarea 4) ya leen `impactos_normativos`: aquí solo se
comprueba que el `LATERAL` del impacto pendiente devuelve la norma; si la Tarea 4 lo dejó como
`null` fijo, se completa ahora. `registrarVerificacion` (Tarea 6) llama `resolverImpacto(sesion, { impactoId, resolucion: "verificacion", verificacionId })`
dentro de su transacción cuando viene `impactoId` (el impacto debe ser del mismo documento), y
`tests/normas-impactos.test.ts` lo cubre con un externo enlazado a la norma derogada.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/normas.test.ts tests/normas-impactos.test.ts tests/normas-rutas.test.ts tests/proxy-matcher.test.ts tests/alcance.test.ts tests/handlers-permisos.test.ts tests/acciones-permisos.test.ts tests/semaforo.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): normograma - normas, relaciones y estados, asociaciones, impactos documentales, búsqueda y PDF"
```

---

### Tarea 9: Normograma — pantallas, «Normas aplicables», grupo «Normas» en la búsqueda, Excel, entrada en la barra, tareas y vencimientos de impactos

**Files:**
- Create: `src/app/(app)/normograma/page.tsx`, `src/app/(app)/normograma/nueva/page.tsx`,
  `src/app/(app)/normograma/[id]/page.tsx`, `src/app/(app)/normograma/[id]/editar/page.tsx`,
  `src/app/(app)/normograma/[id]/archivos/[archivoId]/[[...nombre]]/route.ts`,
  `src/app/(app)/normograma/excel/route.ts`, `src/app/(app)/normograma/impactos/[cambioId]/page.tsx`,
  `src/lib/normograma/normograma-excel.ts`,
  `src/componentes/normograma/{TablaNormas,FiltrosNormas,FormularioNorma,FichaNorma,DialogoRelacion,DialogoEstado,AsociarProceso,EnlazarDocumento,TiposNorma,PaginaImactos,NormasAplicables}.tsx`,
  `tests/normograma-pantallas.test.tsx`, `tests/normograma-rutas.test.ts`
- Modify: `src/app/(app)/procesos/[slug]/page.tsx`, `src/db/consultas/procesos.ts`,
  `src/app/(app)/buscar/page.tsx`, `src/db/consultas/busqueda.ts` (o la página compone
  `buscarNormas`), `src/app/api/buscar/route.ts`, `src/lib/busqueda-rapida.ts`,
  `src/componentes/cascaron/Buscador.tsx`, `src/componentes/cascaron/navegacion.ts`,
  `src/lib/tareas.ts`, `src/db/consultas/vigencia/vencimientos.ts`, `src/componentes/vigencia/BloqueVigencia.tsx`,
  `tests/navegacion.test.ts`, `tests/busqueda-fase5.test.ts`, `tests/buscador-rapido.test.ts`,
  `tests/handlers-permisos.test.ts`, `tests/vigencia-vencimientos.test.ts`

**Interfaces:**
- Consumes: Tarea 8; `evidenciaServible` + `respuestaArchivo` (sin marca de agua) para el PDF de
  la norma; `construirHoja`; `ResultadoRapido` gana `grupo: "documento" | "norma"`.
- Produces (pantallas): `/normograma` con `FiltrosNormas` (tipo, año, emisor, estado, proceso,
  texto, «incluir retiradas» para quien administra), `TablaNormas` (maqueta 8), «Nueva norma» y
  «Excel institucional»; con `?proceso=<slug>`, el título «Normograma de <proceso>», la columna
  «Requisito» y «Excel del proceso». `/normograma/nueva` y `/normograma/[id]/editar`
  (`FormularioNorma` con `datalist` de emisores desde `sugerirEmisores`). `/normograma/[id]`
  (`FichaNorma`: datos, estado e historial, relaciones directas e inversas, procesos con requisito
  y «Asociar proceso», documentos y externos enlazados (restringidos ocultos a quien no los ve) y
  «Enlazar documento», PDF, y las acciones de quien administra: editar, `DialogoEstado`,
  `DialogoRelacion`, retirar, borrar si vacía). `/normograma/impactos/[cambioId]?proceso=`
  (`PaginaImpactos`: la lista de la maqueta 8 con «Abrir solicitud de cambio» → `/tramites/nueva?documento=<codigo>&motivo=cambio_normativo&impacto=<id>`,
  «Verificar el externo» → `/vigencia/externos/<id>?impacto=<id>`, «No afecta…» con nota, y
  «Abrir solicitud de creación» en el impacto de proceso). `TiposNorma` como sección al pie de
  `/normograma` para quien administra. El PDF por `/normograma/[id]/archivos/[archivoId]/[[...nombre]]`
  a toda sesión, `no-store`, sin marca.
- Produces (página del proceso): `NormasAplicables({ procesoId, slug, sesion })`: las primeras
  cinco normas de `normasDeProceso` con su estado, el enlace «Ver las N en el normograma del
  proceso» y «Asociar norma» para `puedeAsociarNorma`.
- Produces (búsqueda): `/buscar` muestra el grupo «Normas» (hasta 5) debajo de los documentos cuando
  hay `q`; `/api/buscar` devuelve hasta 4 normas con `grupo: "norma"`, `ruta: /normograma/<id>`;
  el `Buscador` las pinta bajo el encabezado «Normas».
- Produces (Excel): `construirExcelNormograma(filas, meta: { hospital; generadoEn; alcance: string; total })`
  con las columnas del spec §10.6; `/normograma/excel` (toda sesión, 10/min; con `?proceso=`
  añade «Requisito»); auditoría `exporto_normograma` con el alcance.
- Produces (barra): entrada `{ href: "/normograma", etiqueta: "Normograma", icono: "normograma", grupo: "documentos" }`
  sin permiso, después de «Vigencia». Admin ve **20** entradas; `consulta` ve Inicio, Buscar y Normograma.
- Produces (tareas y vencimientos): `misTareas` suma `tareasDeImpactos`; `revisarVencimientosDeVigencia`
  suma la pasada `impactosVencidos`. `BloqueVigencia` pinta la marca «Revisión por cambio normativo ·
  <norma>» con enlace a la tarea.

- [ ] **Step 1: Tests que fallan**

`tests/normograma-pantallas.test.tsx`: `FichaNorma` oculta el código de un documento restringido a
`consulta` y lo muestra a `gerente`; `TablaNormas` pinta «Derogada · 25/11/2019»; `PaginaImpactos`
muestra «Verificar el externo» para un externo y «Abrir solicitud de cambio» para un interno.
`tests/normograma-rutas.test.ts`: el PDF de la norma 200 para `consulta` con `Content-Disposition`
`inline` y sin «COPIA NO CONTROLADA» (`contieneTexto` falso); 404 con id inexistente; el Excel 200
para `consulta` con fila `exporto_normograma`. `tests/busqueda-fase5.test.ts` / `tests/buscador-rapido.test.ts`:
`/api/buscar?q=3100` trae la norma con `grupo: "norma"`. `tests/navegacion.test.ts`: 20 entradas;
`consulta` → `["/", "/buscar", "/normograma"]`. `tests/vigencia-vencimientos.test.ts`: un impacto
vencido avisa una vez al líder y escala.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/normograma-pantallas.test.tsx tests/normograma-rutas.test.ts tests/busqueda-fase5.test.ts tests/buscador-rapido.test.ts tests/navegacion.test.ts tests/vigencia-vencimientos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/normograma-pantallas.test.tsx tests/normograma-rutas.test.ts tests/busqueda-fase5.test.ts tests/buscador-rapido.test.ts tests/navegacion.test.ts tests/vigencia-vencimientos.test.ts tests/paginas-sesion.test.ts tests/handlers-permisos.test.ts tests/a11y-estructura.test.ts && npm run lint`
Expected: PASS. **Punto de control en navegador**: `coordinadora.sgc` registra una resolución que
deroga a otra enlazada a un documento; la tarea de impacto llega al líder; «No afecta…» con nota
quita la marca; `consulta` consulta el normograma y la ficha de la 3100 sin ver el restringido;
`lider.gth` asocia una norma desde la página de GTH; `Ctrl K` con «3100».

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): pantallas del normograma, normas aplicables del proceso, normas en la búsqueda, Excel e impactos"
```

---
### Tarea 10: Revisión anual — campaña, decisiones, enlace de trámites, normograma del proceso, prórroga, cierre, tareas y vencimientos

**Files:**
- Create: `src/db/consultas/vigencia/revision-anual.ts`, `src/lib/informe-anual.ts` (en esta tarea
  solo el tipo `DatosInforme`, con la forma exacta que define la Tarea 11 en sus Interfaces; la
  Tarea 11 añade el generador), `tests/revision-anual.test.ts`
- Modify: `src/db/consultas/vigencia/{ratificaciones,externos,tareas,vencimientos}.ts`,
  `src/db/consultas/tramites-flujo.ts` (`DatosSolicitud`, `crearSolicitud`),
  `src/db/consultas/flujo/cierre.ts` (publicar: decisión «reciente»), `src/db/consultas/admin.ts`
  (`aplicarPublicacion` llama `alPublicarDuranteRevision`), `src/lib/alcance.ts`,
  `src/lib/esquemas/vigencia.ts`, `src/app/acciones-vigencia.ts`, `src/lib/tareas.ts`,
  `tests/tramites-solicitud.test.ts`, `tests/vigencia-tareas.test.ts`, `tests/vigencia-vencimientos.test.ts`

**Interfaces:**
- Consumes: `listarSemaforo` (foto), `fechaBase`, `sumarMeses`, `resumenAcusesDeDocumento`
  (`src/db/consultas/distribucion/acuses.ts`), `hallazgosDe`, `normasDeProceso`, `eventos_consulta`,
  `verificarParaFirmar`, `avisarA`, `jefesDe`, `lideresDeProceso`, `adminsActivos`, `fechaLimite`.
- Produces (`alcance.ts`): `puedeVerRevisionAnual(sujeto): boolean` (= `vigencia.ver`);
  `puedeDecidirEn(sujeto, procesoId, alcance): boolean` (`revision_anual.decidir` y alcance);
  `puedeVerInformeAnual(sujeto): boolean` (`ROLES_VEN_RESTRINGIDO`).
- Produces (`revision-anual.ts`):
  - `type Revision = { id: number; anio: number; estado: "abierta" | "cerrada"; plazoDias: number; ventanaMeses: number; abiertaPor: string; abiertaEn: Date; venceEn: Date; prorrogas: { fecha: Date; dias: number; motivo: string; por: string }[]; cerradaPor: string | null; cerradaEn: Date | null; totales: Record<Decision, number> & { documentos: number } }`.
  - `revisionAbierta(opciones?): Promise<Revision | null>`; `listarRevisiones(opciones?): Promise<Revision[]>`.
  - `abrirRevision(sesion: SesionFlujo, d: { anio: number; plazoDias: number; ventanaMeses: number }, opciones?: { sql?; ahora? }): Promise<{ revisionId: number }>`:
    `revision_anual.gestionar`; `ErrorVigencia("Ya hay una revisión anual abierta")` (índice parcial,
    traducido); `anio` entre el actual − 1 y el actual + 1; en una transacción: `INSERT revisiones_anuales`;
    para **todos** los documentos con versión vigente (sin filtro de acceso: la foto es
    institucional) una fila `revision_anual_procesos` por proceso propietario con el conteo, y las
    decisiones automáticas: `reciente` si `fechaBase` ≥ `ahora − ventanaMeses`, `en_tramite` con el
    `tramite_id` si hay trámite abierto; `insumos` vacío por ahora (se calculan al mostrar); tareas
    (son calculadas) y aviso `revision.abierta` a líderes, Gerencia y Control Interno «Se abrió la
    revisión anual <año>: decida sobre los documentos de sus procesos antes del <fecha>»; auditoría
    `revision_anual_abierta`.
  - `prorrogarRevision(sesion, d: { revisionId: number; dias: number; motivo: string }, opciones?)`:
    `dias` 1–365, motivo ≥ 5; `vence_en += dias`, `prorrogas` gana la entrada, `aviso_vencido_en`
    y `escalado_en` de `revision_anual_procesos` a nulo; aviso `revision.prorrogada` a los líderes con
    pendientes; auditoría `revision_anual_prorrogada`.
  - `registrarDecision(tx: TransactionSql, d: { documentoId: number; versionId: number; decision: "ratificar" | "actualizar" | "eliminar" | "reciente"; usuarioId: number | null; ratificacionId?: number; verificacionId?: number; tramiteId?: number; ahora: Date }): Promise<{ revisionId: number } | null>`:
    busca la revisión abierta; si no hay o el documento no está en su foto, devuelve `null`; si la
    decisión existente **quedó fija** (tiene `ratificacion_id`, `verificacion_id`, o un trámite en
    etapa distinta de `visto_bueno`, `aceptacion`, `rechazado`, `cancelado`) no la toca y devuelve
    la revisión; si no, `UPSERT` con la decisión nueva, `usuario_id`, los enlaces y `actualizado_en`;
    auditoría `revision_anual_decision` con antes y después. **La llaman**: `ratificar` (Tarea 4,
    en `alRatificar`), `registrarVerificacion` «vigente» → `ratificar`, `edicion_nueva` →
    `actualizar`, `retirado` → `eliminar` (Tarea 6), `adoptarEdicion` (en `alAdoptar`, decisión
    `actualizar` con la verificación o `reciente` si no venía de una), `crearSolicitud`
    (`modificar` → `actualizar`, `eliminar` → `eliminar`, con el trámite) y `alPublicarDuranteRevision`.
  - `alPublicarDuranteRevision(tx, documentoId: number, versionId: number, ahora: Date): Promise<void>`:
    desde `aplicarPublicacion`, decisión `reciente` para un documento que entra a la foto después
    de abrir (si no estaba, se añade la fila y el conteo del proceso), o `reciente` sobre una decisión
    `actualizar` cuyo trámite acaba de publicar **no**: esa conserva `actualizar` (el estado del
    trámite se lee al cerrar).
  - `enlazarTramiteExistente(sesion, d: { revisionId; documentoId; tramiteId }, opciones?)`: `puedeDecidirEn`; el trámite debe estar abierto sobre ese documento; decisión `actualizar` o `eliminar` según su tipo.
  - `confirmarNormograma(sesion, d: { revisionId; procesoId; resultado: "sin_novedad" | "cambios"; nota: string | null }, opciones?)`:
    `puedeDecidirEn`; `cambios` exige nota ≥ 5 y avisa `revision.normograma_cambios` a los Admin SGC;
    auditoría `revision_anual_normograma`.
  - `type DetalleRevision = Revision & { procesos: { id; nombre; sigla; lider: string | null; documentos: number; decididos: number; porDecision: Record<Decision, number>; normograma: { resultado; nota; por; en } | null; puedeDecidir: boolean }[]; documentos: (FilaSemaforo & { decision: { decision: Decision; por: string | null; en: Date; tramite: { id; numero; etapa } | null; ratificacionId: number | null; verificacionId: number | null } | null; insumos: { acuses: { confirmados; total; porcentaje: number | null } | null; hallazgos: number; normasCambiadas: string[]; consultas: number } })[] }`.
  - `obtenerRevision(id: number, sesion: SesionFlujo, opciones?: { sql?; ahora? }): Promise<DetalleRevision | null>`:
    `puedeVerRevisionAnual`; el líder recibe solo sus procesos y sus documentos (`alcanceProcesos`);
    los insumos se calculan al mostrar (acuses de la versión vigente, hallazgos del año que
    mencionan el documento o una copia suya, `norma_cambios` del año sobre normas enlazadas,
    `eventos_consulta` del año).
  - `cerrarRevision(sesion, d: { revisionId: number; credenciales: CredencialesFirma }, opciones?: OpcionesFlujo): Promise<{ sinRevisar: number }>`:
    `revision_anual.gestionar`; validador: abierta; firma fuera de la transacción; dentro, `FOR UPDATE`,
    `ErrorVigencia("La revisión ya está cerrada")` si cambió; `sin_revisar` para los documentos de la
    foto sin decisión; `datosDelInforme` (abajo) → `informe` jsonb; `UPDATE revisiones_anuales SET estado = 'cerrada', cerrada_por, cerrada_en, metodo_cierre, informe`;
    aviso `revision.cerrada` a Gerencia, Control Interno y líderes; auditoría `revision_anual_cerrada`.
  - `datosDelInforme(tx: Cliente, revisionId: number, ahora: Date): Promise<DatosInforme>` (tipo en la
    Tarea 11, `src/lib/informe-anual.ts`): todo lo que el PDF imprime, con el estado de cada trámite
    al cierre y el formato elegido (`config.vigencia.formatoInforme.documentoId ?? config.formatoActa.documentoId`,
    con su `archivoDeFormato` y márgenes), congelado.
  - `tareasDeRevision(sesion, opciones?): Promise<Tarea[]>`: por proceso del alcance con pendientes
    (documentos sin decisión más uno si falta el normograma): `id: "revision:<revisionId>:<procesoId>"`,
    «Revisar los documentos de <proceso> (N pendientes)», `vence: venceEn`, enlace
    `/vigencia/revision-anual?proceso=<id>`.
  - `revisionVencida(c)` para `revisarVencimientosDeVigencia`: por proceso con pendientes y campaña
    vencida, aviso `revision.vencida` a sus líderes (o Admin SGC) y escalamiento al jefe, con las
    marcas de `revision_anual_procesos`.
- Produces (`tramites-flujo.ts`): `DatosSolicitud` gana `revisionAnualId?: number` e `impactoId?: number`;
  `crearSolicitud` los guarda en `tramites`, llama `registrarDecision` cuando hay revisión abierta
  (venga o no `revisionAnualId`) y `resolverImpacto(… "solicitud" …)` cuando viene `impactoId`
  (dentro de la misma transacción, con el permiso de quien pide).
- Produces (esquemas y acciones): `EsquemaAbrirRevision`, `EsquemaProrrogar`, `EsquemaEnlazarTramite`,
  `EsquemaConfirmarNormograma`, `EsquemaCerrarRevision` (clave y código); acciones
  `abrirRevisionAccion`, `prorrogarRevisionAccion`, `cerrarRevisionAccion` (`revision_anual.gestionar`),
  `enlazarTramiteAccion`, `confirmarNormogramaAccion` (`revision_anual.decidir`).

- [ ] **Step 1: Tests que fallan**

`tests/revision-anual.test.ts` (BD, `revertida`; `revisionDePrueba(tx, admin, { ahora })` en
`tests/utiles/vigencia.ts`):

```ts
it("abre la campaña con la foto: recientes, en trámite y pendientes; una sola abierta", () => revertida(sql, async (tx) => {
  const viejo = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
  const nuevo = await vigenteFuera(tx, { fechaAprobacion: fechaEnZona(ahora, ZONA), proceso: "GTH" });
  const enTramite = await tramiteEn(tx, "elaboracion", { proceso: "GTH" });
  const { revisionId } = await abrirRevision(admin, { anio: 2090, plazoDias: 60, ventanaMeses: 6 }, { sql: tx, ahora });
  const r = (await obtenerRevision(revisionId, admin, { sql: tx, ahora }))!;
  const decision = (id: number) => r.documentos.find((d) => d.documentoId === id)!.decision?.decision ?? null;
  expect(decision(viejo.id)).toBeNull();
  expect(decision(nuevo.id)).toBe("reciente");
  expect(decision(enTramite.documentoId)).toBe("en_tramite");
  await expect(abrirRevision(admin, { anio: 2091, plazoDias: 60, ventanaMeses: 6 }, { sql: tx, ahora })).rejects.toThrow("Ya hay una revisión anual abierta");
}));
it("ratificar desde la ficha, verificar un externo y pedir una solicitud registran la decisión; Gerencia también aunque no decida", () => revertida(sql, async (tx) => { /* ratificar(gerente, estratégico) → decision ratificar con usuario gerente; registrarVerificacion edicion_nueva → actualizar; crearSolicitud eliminar → eliminar con tramite_id */ }));
it("el líder decide solo sobre sus procesos; una decisión con trámite aceptado queda fija; una con trámite retirado se puede cambiar", () => revertida(sql, async (tx) => { /* enlazarTramiteExistente de CEX por lider.gth → 404; retirar la solicitud → registrarDecision ratificar la reemplaza */ }));
it("mientras hay campaña no hay tareas ni avisos individuales de vigencia y sí la tarea del proceso", () => revertida(sql, async (tx) => {
  const viejo = await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
  await revisionDePrueba(tx, admin, { ahora });
  const ids = (await misTareas(liderGth, { sql: tx, ahora })).tareas.map((t) => t.id);
  expect(ids).not.toContain(`vigencia:${viejo.id}`);
  expect(ids.some((i) => i.startsWith("revision:"))).toBe(true);
  expect((await revisarVencimientosDeVigencia({ sql: tx, ahora, config })).avisados).toBe(0);
}));
it("cerrar con clave congela el informe, marca sin revisar y protege las filas; cerrar dos veces falla", () => revertida(sql, async (tx) => {
  const { revisionId } = await revisionDePrueba(tx, admin, { ahora });
  const r = await cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, { sql: tx, ahora, verificar: firmaDePrueba });
  expect(r.sinRevisar).toBeGreaterThan(0);
  const [fila] = await tx`SELECT estado, informe->'totales' AS totales FROM revisiones_anuales WHERE id = ${revisionId}`;
  expect(fila.estado).toBe("cerrada");
  expect(fila.totales).toMatchObject({ sin_revisar: r.sinRevisar });
  await expect(cerrarRevision(admin, { revisionId, credenciales: { clave: "ok" } }, { sql: tx, ahora, verificar: firmaDePrueba })).rejects.toThrow("La revisión ya está cerrada");
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE revisiones_anuales SET plazo_dias = 1 WHERE id = ${revisionId}`))).toBe("42501");
}));
it("prorrogar mueve la fecha, exige motivo y reinicia las marcas de aviso", () => revertida(sql, async (tx) => { /* ... */ }));
it("confirmar el normograma del proceso: «sin novedad» sin nota; «cambios» con nota avisa a los Admin SGC", () => revertida(sql, async (tx) => { /* ... */ }));
```

`tests/tramites-solicitud.test.ts`: `crearSolicitud` con `impactoId` resuelve el impacto y guarda
`tramites.impacto_id`. `tests/vigencia-vencimientos.test.ts`: campaña vencida → un aviso
`revision.vencida` por líder y escalamiento.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/revision-anual.test.ts tests/tramites-solicitud.test.ts tests/vigencia-tareas.test.ts tests/vigencia-vencimientos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

Rellenar `alRatificar` (Tarea 4) y `alAdoptar` (Tarea 6) con `registrarDecision`; añadir la llamada
en `registrarVerificacion`, en `crearSolicitud` y en `aplicarPublicacion`; la exclusión de la
campaña abierta en `tareasDeVigencia` y en `documentosVencidos` (Tarea 5) pasa de un `EXISTS`
falso a la consulta real.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/revision-anual.test.ts tests/tramites-solicitud.test.ts tests/vigencia-tareas.test.ts tests/vigencia-vencimientos.test.ts tests/ratificaciones.test.ts tests/externos.test.ts tests/publicar.test.ts tests/tramites-cierre.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): revisión anual - campaña, decisiones automáticas, enlace de trámites, normograma del proceso, prórroga y cierre"
```

---

### Tarea 11: Revisión anual — informe SGC-RG-06 en PDF, pantallas, solicitud prellenada y formato del informe

**Files:**
- Create: `src/db/consultas/vigencia/informe.ts`,
  `src/app/(app)/vigencia/revision-anual/page.tsx`, `src/app/(app)/vigencia/revision-anual/[id]/page.tsx`,
  `src/app/(app)/vigencia/revision-anual/[id]/informe/route.ts`, `src/app/admin/api/informe-ejemplo/route.ts`,
  `src/componentes/vigencia/revision/{PanelAdmin,TablaDecisiones,NormogramaDelProceso,DialogoAbrir,DialogoProrrogar,DialogoCerrar}.tsx`,
  `tests/informe-anual.test.ts`, `tests/revision-anual-pantallas.test.tsx`, `tests/revision-anual-rutas.test.ts`
- Modify: `src/lib/informe-anual.ts` (el generador sobre el tipo de la Tarea 10),
  `src/app/(app)/tramites/nueva/page.tsx`, `src/componentes/tramites/FormularioSolicitud.tsx`,
  `src/app/(app)/tramites/[id]/page.tsx`, `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx`
  (botón «Ver informe de ejemplo»), `src/componentes/vigencia/PestanasVigencia.tsx`,
  `tests/handlers-permisos.test.ts`, `tests/tramites-ui.test.tsx`

**Interfaces:**
- Consumes: Tarea 10; `generarActa` como referencia de geometría (`src/lib/acta.ts`: `cm`,
  `partes`, `dia`, la clase `Hoja` y el dibujo sobre el membrete; extraer lo compartido a
  `src/lib/pdf-hoja.ts` si la duplicación pasa de cien líneas, sin cambiar los bytes del acta: el
  test byte a byte de la Tarea 4 lo vigila); `membreteListo`, `leerFormatoCongelado`,
  `archivoDeFormato` (`src/db/consultas/formato-acta.ts`); `textoParaFuente`
  (`src/lib/texto-pdf.ts`); `escribirAtomico` y `auditarNoRegenerable` (exportar de `actas.ts`
  o duplicar en `informe.ts`); `respuestaArchivo`.
- Produces (`informe-anual.ts`):
  - `type DatosInforme = { entidad: string; anio: number; abiertaEn: Date; prorrogas: { fecha: Date; dias: number; motivo: string; por: string }[]; cerradaEn: Date; cerradaPor: { nombre: string; cargo: string | null }; metodo: string; alcance: { documentos: number; internos: number; externos: number; procesos: number }; totales: Record<Decision, number>; decisiones: { codigo: string; titulo: string; version: number; proceso: string; decision: Decision; responsable: string | null; solicitud: { numero: string; venceEn: Date | null; estadoAlCierre: string } | null; fecha: Date | null }[]; normograma: { cambios: { norma: string; estado: string; fecha: Date; documentos: number; resueltos: number; noAfecta: number }[]; porProceso: { proceso: string; resultado: string | null; nota: string | null }[] }; otros: { acusesPct: number | null; conformidadPct: number | null; externosAlDia: { alDia: number; total: number } }; formato: FormatoActa | null; zona: string; ejemplo?: boolean }`.
  - `generarInformeAnual(d: DatosInforme, membrete: Uint8Array | null): Promise<Uint8Array>`:
    carta, el mismo mecanismo que el acta (membrete bajo cada hoja respetando los márgenes
    configurados; continuación con el mismo encabezado; transliteración y aviso de «?»), con las
    secciones de la maqueta 6: título «Informe de revisión anual de documentos del SGC», cifras,
    tabla de decisiones (código, decisión, responsable, solicitud y plazo, estado al cierre),
    cambios normativos y normograma por proceso, otros insumos, pie con quién firmó, fecha, hora y
    la huella (la huella se imprime como «se calcula al registrar el archivo»: el PDF no puede
    contener su propia huella; imprime en su lugar el id de la revisión y la hora de cierre).
  - `datosDeEjemplo(entidad: string, zona: string, formato: FormatoActa | null): DatosInforme` (con `ejemplo: true`, marca «EJEMPLO, SIN VALOR» como el acta de ejemplo).
- Produces (`informe.ts`): `asegurarInforme(revisionId: number, opciones?: { sql?; generar?; usuarioId? }): Promise<{ archivoId: number; ruta: string } | null>`:
  el patrón exacto de `asegurarActa`: busca el archivo con contexto `revision_anual` y
  `contexto_id = revisionId`; si existe en disco, lo devuelve; si no, lee `informe` jsonb, el
  formato congelado (`leerFormatoCongelado`; si falta, `informe_no_regenerable` con motivo
  `formato`), genera, escribe por `escribirAtomico` en `informes/revision-<anio>.pdf`, y registra
  en `archivos` (`contexto 'revision_anual'`, rol `evidencia`, nombre `Informe revisión anual <anio>.pdf`)
  con `ON CONFLICT DO NOTHING`; si la fila existía y la huella regenerada no coincide,
  `informe_no_regenerable` y `null`; auditoría `informe_generado`.
- Produces (pantallas): `/vigencia/revision-anual`: sin revisión abierta, la última cerrada (si hay)
  con su enlace y el botón «Abrir la revisión anual <año>» (`DialogoAbrir` con plazo y ventana
  prellenados de la configuración) para quien gestiona; con una abierta, `PanelAdmin` (maqueta 4:
  cifras, tabla por proceso, «Prorrogar…», «Cerrar y generar informe» sobre `DialogoFirma`) para
  `revision_anual.gestionar` y, para cada líder, `TablaDecisiones` de sus procesos (maqueta 5:
  insumos, «Ratificar» = `DialogoRatificar`, «Actualizar» y «Eliminar» = enlaces a
  `/tramites/nueva?documento=<codigo>&tipo=modificar|eliminar&motivo=revision_anual&revision=<id>`,
  o «Enlazar el trámite en curso SOL-…» si lo hay; en un externo, «Ratificar» = verificación
  «sigue vigente» en un paso, «Actualizar» y «Eliminar» llevan a la página del externo con
  `?verificar=edicion_nueva|retirado`) y `NormogramaDelProceso` («Sin novedad» / «Marcar
  cambios…»); `?proceso=<id>` filtra. Gerencia y Control Interno ven todo sin botones. «Ver el informe
  parcial» abre `/vigencia/revision-anual/<id>` en pantalla con los mismos datos.
  `/vigencia/revision-anual/[id]`: una revisión cerrada (o la abierta, parcial) con sus cifras,
  decisiones y el botón «Informe en PDF» para `puedeVerInformeAnual`.
  `/vigencia/revision-anual/[id]/informe`: `puedeVerInformeAnual` y revisión cerrada (404 si no),
  `asegurarInforme` → PDF `inline`, `no-store`; sin informe, 404 con el mensaje de bitácora.
- Produces (solicitud): `/tramites/nueva` acepta `tipo`, `motivo`, `revision` e `impacto` en la
  query y los pasa a `FormularioSolicitud` como valores iniciales y campos ocultos; el esquema
  `EsquemaSolicitud` gana `revisionAnualId?` e `impactoId?`; la acción los pasa a `crearSolicitud`.
  `/tramites/[id]` muestra «Abierto desde la revisión anual <año>» o «Abierto por el cambio de
  <norma>» bajo el motivo.
- Produces (formato): `GET /admin/api/informe-ejemplo` (`tramites.gestionar`, 10/min) genera el
  informe de ejemplo sobre el formato elegido para el informe o, si no hay, el del acta; el botón
  «Ver informe de ejemplo» de Configuración documental lo abre en otra pestaña.

- [ ] **Step 1: Tests que fallan**

`tests/informe-anual.test.ts` (sin BD; `pdfDeFormato` y `contenidoPorPagina` de `tests/utiles`):

```ts
it("imprime título, cifras, cada decisión con su estado al cierre y la firma, sobre el membrete y sin él", async () => {
  const datos = datosDePrueba({ decisiones: 40 });
  for (const membrete of [null, await pdfDeFormato(1)]) {
    const bytes = await generarInformeAnual(datos, membrete);
    const paginas = await contenidoPorPagina(bytes);
    expect(paginas.length).toBeGreaterThan(1);
    expect(contieneTexto(paginas[0], "INFORME DE REVISI")).toBe(true);
    expect(paginas.some((p) => contieneTexto(p, "Sin revisar"))).toBe(true);
    expect(contieneTexto(paginas[paginas.length - 1], "Cerr")).toBe(true);
  }
});
it("respeta los márgenes del formato en cada hoja", async () => { /* ningún texto por encima de margenSuperiorCm ni por debajo de margenInferiorCm, como tests/acta.test.ts */ });
it("el ejemplo lleva la marca EJEMPLO, SIN VALOR", async () => { /* ... */ });
```

`tests/revision-anual-rutas.test.ts`: `asegurarInforme` genera una vez y la segunda devuelve el
mismo archivo; con el archivo borrado y la huella coincidente lo regenera; con un `generar` que
devuelve otros bytes deja `informe_no_regenerable`; la ruta responde 404 a `lider.gth`, 200 a
`gerente` y `control.interno`, 404 con la revisión abierta. `tests/revision-anual-pantallas.test.tsx`:
`TablaDecisiones` muestra «Revisado recientemente» sin botones y los tres botones en un pendiente;
para un externo, «Ratificar» con el texto de verificación. `tests/tramites-ui.test.tsx`:
`FormularioSolicitud` con `revisionAnualId` lo manda como campo oculto y preselecciona el motivo.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/informe-anual.test.ts tests/revision-anual-rutas.test.ts tests/revision-anual-pantallas.test.tsx tests/tramites-ui.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/informe-anual.test.ts tests/revision-anual-rutas.test.ts tests/revision-anual-pantallas.test.tsx tests/tramites-ui.test.tsx tests/acta.test.ts tests/acta-cierre.test.ts tests/handlers-permisos.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS, y el acta de SOL-2026-001 sigue idéntica (test de la Tarea 4). **Punto de control en
navegador**, sobre una copia con el formato real del hospital (como F13A-AU1): abrir la revisión,
decidir como `lider.cex` (ratificar, actualizar con solicitud, eliminar, externo), confirmar el
normograma, prorrogar, cerrar con clave y abrir el informe de dos o tres hojas sin pisar el
encabezado ni el pie; `gerente` lo abre y `lider.gth` recibe «no encontrado»; «Ver informe de
ejemplo» en Configuración documental; claro, oscuro y 390 px en la tabla de decisiones.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): informe de revisión anual sobre el membrete, pantallas de la campaña y solicitud enlazada"
```

---
### Tarea 12: Indicadores documentales — consulta, pestaña, Excel y la fecha límite en los eventos del trámite

**Files:**
- Create: `src/db/consultas/vigencia/indicadores.ts`, `src/app/(app)/vigencia/indicadores/page.tsx`,
  `src/app/(app)/vigencia/indicadores/excel/route.ts`, `src/lib/vigencia/indicadores-excel.ts`,
  `src/componentes/vigencia/indicadores/{TarjetasIndicadores,BarrasPorProceso,TablaPorProceso,FiltroPeriodo}.tsx`,
  `tests/indicadores-consulta.test.ts`, `tests/indicadores-pantalla.test.tsx`
- Modify: `src/db/consultas/tramites-flujo.ts` (`transicionar`), `src/db/consultas/flujo/contrato.ts`
  (tipo del evento, si lo hay), `src/componentes/vigencia/PestanasVigencia.tsx`,
  `src/app/(app)/vigencia/_comun.ts`, `tests/tramites-cierre.test.ts`, `tests/handlers-permisos.test.ts`

**Interfaces:**
- Consumes: Tarea 3 (`periodoDe`, `periodoActual`, las siete definiciones, `metaDe`, `cumple`);
  `listarSemaforo` (estado a la fecha); `resumenAcuses` (`src/db/consultas/distribucion/acuses.ts`,
  para las versiones publicadas en el periodo); `estadoDePuntos` y `historialVerificaciones`
  (`verificaciones-resumen.ts`); `GraficoBarras` (`PuntoSerie = { fecha: string; conteo: number }`,
  reutilizado con la sigla del proceso en `fecha`); `TarjetaCifra`; `construirHoja`.
- Produces (`transicionar`): el `detalle` del evento de cada transición lleva
  `venceEn: previo.venceEn?.toISOString() ?? null` (la fecha límite de la etapa que cierra);
  `registrarEvento` no cambia.
- Produces (`indicadores.ts`):
  - `type IndicadorMedido = { clave: Indicador; nombre: string; unidad: "pct" | "dias" | "conteo"; valor: number | null; numerador: number; denominador: number; meta: number; cumple: boolean | null; detalle: string | null }`
    (`detalle`: «mediana 21 días», «3 etapas sin dato»).
  - `type ResultadoIndicadores = { periodo: Periodo; procesoId: number | null; indicadores: IndicadorMedido[]; vencidosPorProceso: { procesoId: number; sigla: string; proceso: string; vencidos: number }[]; dentroPorProceso: { procesoId: number; sigla: string; proceso: string; vigentes: number; alDia: number; valor: number | null; cumple: boolean | null }[]; tramites: { publicados: number; enCurso: number } }`.
  - `indicadoresDocumentales(sesion: SesionFlujo, filtro: { periodo: string; procesoId?: number }, opciones?: { sql?; ahora? }): Promise<ResultadoIndicadores | null>`:
    `documentos.indicadores`; `periodoDe` inválido → el periodo actual; el líder solo sus procesos
    (un `procesoId` fuera de su alcance → `null`); (1) y (3) de `listarSemaforo` a `ahora`; (2) de
    `tramites` publicados en el periodo (`aceptado` = el evento `aceptar`, `publicado` = `cerrado_en`);
    (4) acuses de versiones con `publicado_en` en el periodo; (5) `estadoDePuntos` actual y las
    verificaciones cerradas en el periodo; (6) externos con próxima verificación posterior a `ahora`;
    (7) `tramite_eventos` del periodo con `detalle->>'venceEn'` no nulo, cerradas en plazo si
    `creado_en <= venceEn`. Todo con las funciones puras de la Tarea 3; la consulta solo trae filas.
- Produces (pantalla): `/vigencia/indicadores` (maqueta 9) con `FiltroPeriodo` (año, trimestres,
  semestres y meses del año en curso y del anterior; `?periodo=` y `?proceso=`), siete
  `TarjetaCifra` con «meta ≥ 95 % · cumple» en `Insignia` (`bien` / `critico`, «sin meta» en
  `sin-dato`), `BarrasPorProceso` (vencidos por proceso, con tabla equivalente `sr-only`),
  `TablaPorProceso` y «Descargar Excel».
- Produces (Excel): `construirExcelIndicadores(r: ResultadoIndicadores, meta)`: hoja «Indicadores»
  (indicador, valor, meta, cumple, numerador, denominador, detalle) y hoja «Por proceso»; ruta
  `/vigencia/indicadores/excel` con `documentos.indicadores`, 10/min, auditoría `exporto_indicadores`
  con el periodo y el proceso.
- Produces (`PestanasVigencia`): «Indicadores» visible con `documentos.indicadores`; `exigirVigencia`
  acepta también ese permiso; `/vigencia` redirige a `indicadores` a quien solo tiene ese permiso.

- [ ] **Step 1: Tests que fallan**

`tests/indicadores-consulta.test.ts` (BD, `revertida`):

```ts
it("dentro del plazo y vencidos salen del semáforo a la fecha; el líder solo ve sus procesos", () => revertida(sql, async (tx) => {
  await vigenteFuera(tx, { fechaAprobacion: "2025-01-10", proceso: "GTH" });
  const r = (await indicadoresDocumentales(liderGth, { periodo: "2026" }, { sql: tx, ahora }))!;
  const vencidos = r.indicadores.find((i) => i.clave === "vencidos")!;
  expect(vencidos.valor).toBeGreaterThanOrEqual(1);
  expect(vencidos.cumple).toBe(false);
  expect(r.vencidosPorProceso.every((p) => p.sigla === "GTH")).toBe(true);
  expect(await indicadoresDocumentales(liderGth, { periodo: "2026", procesoId: cex.id }, { sql: tx, ahora })).toBeNull();
}));
it("el tiempo de aprobación usa los trámites publicados en el periodo y es sin dato sin trámites", () => revertida(sql, async (tx) => { /* periodo "2000" → valor null */ }));
it("las etapas en plazo cuentan solo eventos con venceEn", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "aceptacion", { proceso: "GTH" });
  await transicionar(admin, { tramiteId: t.id, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0, datos: datosDeAceptacion(t) }, { sql: tx, ahora });
  const [e] = await tx`SELECT detalle->>'venceEn' AS vence FROM tramite_eventos WHERE tramite_id = ${t.id} AND tipo = 'aceptar'`;
  expect(e.vence).not.toBeNull();
  const r = (await indicadoresDocumentales(admin, { periodo: periodoActual(ahora, ZONA).clave }, { sql: tx, ahora }))!;
  expect(r.indicadores.find((i) => i.clave === "etapas")!.denominador).toBeGreaterThanOrEqual(1);
}));
it("una meta cambiada en configuración cambia el cumplimiento", () => revertida(sql, async (tx) => { /* meta_vencidos 100 → cumple true */ }));
```

`tests/indicadores-pantalla.test.tsx`: `TarjetasIndicadores` pinta «94 % · meta ≥ 95 % · no
cumple» y «sin meta» cuando el valor es nulo. `tests/handlers-permisos.test.ts`: el Excel 404 para
`consulta`, 200 para `lider.gth` con fila `exporto_indicadores`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-consulta.test.ts tests/indicadores-pantalla.test.tsx tests/handlers-permisos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/indicadores-consulta.test.ts tests/indicadores-pantalla.test.tsx tests/handlers-permisos.test.ts tests/tramites-cierre.test.ts tests/acta.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS (el `venceEn` en el detalle no cambia el acta: `congelarDatosActa` no lo lee).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13c): indicadores del proceso documental con meta, pestaña, Excel y fecha límite en los eventos del trámite"
```

---

### Tarea 13: Herencia de la 13B — Excel de socializaciones, fecha de corrección, catálogos en solo lectura, miembro «todos», hallazgos en dos pasos y dos tareas pequeñas

**Files:**
- Create: `src/app/(app)/distribucion/socializaciones/excel/route.ts`, `src/lib/distribucion/socializaciones-excel.ts`,
  `src/app/(app)/admin/(catalogos)/layout.tsx`, `src/app/api/hallazgos/[id]/archivos/route.ts`,
  `src/componentes/distribucion/verificaciones/AccionesHallazgo.tsx`, `tests/hallazgos-dos-pasos.test.ts`,
  `tests/catalogos-lectura.test.tsx`
- Move: `src/app/(app)/admin/(panel)/puntos-uso/**` → `src/app/(app)/admin/(catalogos)/puntos-uso/**`,
  `src/app/(app)/admin/(panel)/listas-distribucion/**` → `src/app/(app)/admin/(catalogos)/listas-distribucion/**`
- Modify: `src/lib/distribucion/acuses-excel.ts`, `src/db/consultas/distribucion/jornadas.ts`
  (`listarJornadasParaExcel`), `src/db/consultas/distribucion/verificaciones.ts` (`cerrarVerificacion`),
  `src/lib/esquemas/distribucion.ts` (`leerChequeo` con `fechaCorreccion`), `src/componentes/distribucion/verificaciones/*`,
  `src/db/consultas/distribucion/hallazgos.ts`, `src/db/consultas/distribucion/listas.ts`,
  `src/db/consultas/distribucion/acuses.ts` (retiro por diferencia con `todos`),
  `src/componentes/distribucion/listas/FormularioLista.tsx`, `src/db/consultas/distribucion/copias.ts`
  (`conteosPorPunto`, `reemplazarCopias`), `src/app/acciones-distribucion.ts`,
  `src/componentes/distribucion/BloqueDistribucion.tsx` (aviso de Reemplazar por URL),
  `src/componentes/cascaron/navegacion.ts`, `src/db/consultas/distribucion/tareas.ts`,
  `src/db/consultas/distribucion/verificaciones-resumen.ts` (conformidad sin `por_validar`),
  `src/lib/alcance.ts`, `src/proxy.ts`, `tests/paginas-sesion.test.ts`, `tests/proxy-matcher.test.ts`,
  `tests/handlers-permisos.test.ts`, `tests/listas-audiencia.test.ts`, `tests/verificaciones.test.ts`,
  `tests/distribucion-excel.test.ts`, `tests/navegacion.test.ts`, `tests/copias.test.ts`, `tests/bloque-distribucion.test.tsx`

**Interfaces:**
- Consumes: `construirHoja`; `cerrarVerificacion`, `cerrarHallazgo`, `abrirHallazgo`;
  `usuariosDeListas`, `resolverLista`; `exigirPermiso` no: las páginas del grupo nuevo llaman
  `exigirSesion` y `exigirCatalogo`.
- Produces (Excel de jornadas): `construirExcelSocializaciones(filas, meta)` sobre `hoja-excel.ts`
  con las columnas del spec §12.1 (nombres de asistentes solo si `verEvidencia`); ruta
  `/distribucion/socializaciones/excel` con `distribucion.ver`, 10/min, auditoría
  `exporto_socializaciones` (frase en la bitácora, Tarea 14). `acuses-excel.ts` pasa a `construirHoja`
  sin cambiar sus columnas (test existente en verde).
- Produces (fecha de corrección): `RespuestaDeItem` gana `fechaCorreccion?: string` (`YYYY-MM-DD`);
  `leerChequeo` la lee de `fecha_<itemId>`; `cerrarVerificacion` la usa en `abrirHallazgo` como
  `venceEn` si viene, acotada a mañana … hoy + 365 (`ErrorDistribucion("La fecha de corrección debe estar entre mañana y <max>")`),
  y la pone en el `detalle` de `verificacion_cerrada`; la pantalla de la verificación muestra por
  cada no conforme un `<input type="date">` con la fecha propuesta (`plazo_correccion_dias`).
- Produces (catálogos en solo lectura): grupo `src/app/(app)/admin/(catalogos)/` con `layout.tsx`
  (`force-dynamic`, sin guard: cada página llama `exigirSesion()` y `exigirCatalogo(sesion)` =
  `puede(sesion, "distribucion.ver")` o `notFound()`); las páginas de puntos y listas reciben
  `soloLectura = !puede(sesion, "distribucion.gestionar")` y, con él, no pintan formularios ni
  botones y el líder ve solo sus puntos (`filtroPuntos`); las entradas «Puntos de uso» y «Listas de
  distribución» pasan a `permiso: "distribucion.ver"`; `tests/paginas-sesion.test.ts` añade el grupo
  `(catalogos)` a `portal` (regla `exigir(Sesion|Permiso)\(`).
- Produces (miembro «todos»): `TipoMiembro` gana `"todos"`; `Miembro.referenciaId: number | null`;
  `usuariosDeListas` añade `OR m.tipo = 'todos'` (toda `u.activo`); `resumenMiembros` dice «Todos
  los usuarios activos»; `FormularioLista` ofrece la casilla «Todos los usuarios activos» (una por
  lista) y, marcada, oculta los demás selectores; el retiro de acuses por diferencia trata `todos`
  como la planta activa (desactivar una cuenta la retira, ya cubierto por `u.activo`).
- Produces (hallazgos en dos pasos):
  - `corregirHallazgo(id: number, sesion: SesionFlujo, nota: string, opciones?): Promise<void>`:
    responsable actual del punto (`distribucion.responder`) o `distribucion.gestionar`; de `abierto`
    a `por_validar` con `corregido_en`, `corregido_por`, `nota_correccion`; aviso `hallazgo.por_validar`
    a los Admin SGC; auditoría `hallazgo_corregido`.
  - `validarHallazgo(id, sesion, opciones?)`: `verificaciones.realizar`; de `por_validar` a `cerrado`
    con `validacion = 'admin'`, `cerrado_en`, `cerrado_por`, `nota_cierre = nota_correccion`; auditoría `hallazgo_validado`.
  - `reabrirHallazgo(id, sesion, nota, opciones?)`: `verificaciones.realizar`; de `por_validar` a
    `abierto` con `reaperturas + 1`, `vence_en` nuevo (`plazo_correccion_dias`), `corregido_*` a nulo,
    nota en auditoría `hallazgo_reabierto` y aviso `distribucion.hallazgo` al responsable.
  - `cerrarHallazgo` (existente) sigue para `distribucion.gestionar` desde cualquier estado no
    cerrado, con `validacion = 'admin'`.
  - `validarPorVerificacion(tx, verificacionId: number, puntoId: number, itemsNoConformes: { copiaId: number | null; documentoId: number | null }[], ahora: Date): Promise<{ validados: number; reabiertos: number }>`,
    llamada al final de `cerrarVerificacion`: los `por_validar` del punto cuyo `copia_id` o
    `documento_id` **no** aparece entre los no conformes pasan a `cerrado` con
    `validacion = 'verificacion'` y `validacion_verificacion_id`; los que sí aparecen se reabren con
    la nota «sigue no conforme en la verificación del <fecha>».
  - `tareasDeValidacion(sesion, opciones?)`: para `verificaciones.realizar`, un
    `id: "validar:<hallazgoId>"` por `por_validar`, «Validar la corrección del hallazgo en <punto>»,
    vence `corregido_en + plazo_correccion_dias`. `tareasDeHallazgos` deja de listar los `por_validar`.
    `estadoDePuntos` no cuenta `por_validar` como abiertos.
  - Foto de la corrección: `POST /api/hallazgos/[id]/archivos` (`distribucion.responder` +
    responsable, o gestionar; solo imágenes y PDF; contexto `hallazgo`, carpeta `hallazgos/<id>`;
    fuera del `matcher`: `api/hallazgos/[0-9]+/archivos$`); servida por la ruta de archivos de la
    verificación o una nueva `/distribucion/verificaciones/hallazgos/[id]/archivos/[archivoId]/[[...nombre]]`
    con la visibilidad del hallazgo.
  - `AccionesHallazgo`: «Corregido» (nota y foto opcional) para el responsable; «Validar» y
    «Reabrir…» para el Admin SGC; estado «Por validar» con `Insignia` `atencion`.
- Produces (dos tareas pequeñas): `reemplazarCopiasAccion` devuelve `…?aviso=reemplazadas&n=<k>` y
  `BloqueDistribucion` lee `searchParams` para pintar «Se emitieron N copias» en `role="status"`;
  `conteosPorPunto` cuenta para el líder también las copias de documentos de su alcance en puntos
  de otros procesos (misma condición que `listarCopias`).

- [ ] **Step 1: Tests que fallan**

`tests/hallazgos-dos-pasos.test.ts`:

```ts
it("el responsable marca corregido, el hallazgo pasa a por validar y el Admin lo valida o lo reabre", () => revertida(sql, async (tx) => {
  const { hallazgoId, responsable, punto } = await hallazgoDePrueba(tx);
  await corregirHallazgo(hallazgoId, responsable, "Retiré la copia vieja", { sql: tx, ahora });
  expect((await tx`SELECT estado FROM hallazgos WHERE id = ${hallazgoId}`)[0].estado).toBe("por_validar");
  expect((await tareasDeValidacion(admin, { sql: tx })).map((t) => t.id)).toContain(`validar:${hallazgoId}`);
  expect((await tareasDeHallazgos(responsable, { sql: tx })).map((t) => t.id)).not.toContain(`hallazgo:${hallazgoId}`);
  await reabrirHallazgo(hallazgoId, admin, "La copia sigue ahí", { sql: tx, ahora });
  expect((await tx`SELECT estado, reaperturas FROM hallazgos WHERE id = ${hallazgoId}`)[0]).toMatchObject({ estado: "abierto", reaperturas: 1 });
  await corregirHallazgo(hallazgoId, responsable, "Ahora sí", { sql: tx, ahora });
  await validarHallazgo(hallazgoId, admin, { sql: tx, ahora });
  expect((await tx`SELECT estado, validacion FROM hallazgos WHERE id = ${hallazgoId}`)[0]).toMatchObject({ estado: "cerrado", validacion: "admin" });
}));
it("la siguiente verificación conforme valida sola; una con el mismo documento no conforme lo reabre", () => revertida(sql, async (tx) => { /* verificarPunto conforme → validacion 'verificacion'; otro por_validar + item no_conforme sobre su copia → abierto con reaperturas 1 */ }));
it("otro usuario no corrige; por validar no cuenta en la conformidad", () => revertida(sql, async (tx) => { /* ErrorDistribucion("El hallazgo no existe"); estadoDePuntos sin abiertos */ }));
```

`tests/verificaciones.test.ts`: cerrar con `fecha_<itemId>` = hoy + 2 → `vence_en` ese día; = ayer →
rechazo. `tests/listas-audiencia.test.ts`: una lista con `todos` resuelve a toda la planta activa
(incluido `admin`, sin cargo) y no a un `zz_*` inactivo; crear dos miembros `todos` → 23505.
`tests/distribucion-excel.test.ts`: `construirExcelSocializaciones` con y sin nombres;
`acuses-excel` idéntico al anterior. `tests/catalogos-lectura.test.tsx`: la página de puntos con
`soloLectura` no pinta «Nuevo punto de uso» ni formularios. `tests/paginas-sesion.test.ts`: cubre
`(catalogos)`. `tests/navegacion.test.ts`: `gerente` y `lider_proceso` ven `/admin/puntos-uso`.
`tests/handlers-permisos.test.ts`: `GET /distribucion/socializaciones/excel` 200 para `gerente`;
`POST /api/hallazgos/<id>/archivos` 403 a un ajeno. `tests/copias.test.ts`: `conteosPorPunto` del
líder incluye la copia emitida en un punto de otro proceso. `tests/bloque-distribucion.test.tsx`:
con `?aviso=reemplazadas&n=2` pinta «Se emitieron 2 copias».

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/hallazgos-dos-pasos.test.ts tests/verificaciones.test.ts tests/listas-audiencia.test.ts tests/distribucion-excel.test.ts tests/catalogos-lectura.test.tsx tests/paginas-sesion.test.ts tests/navegacion.test.ts tests/copias.test.ts tests/bloque-distribucion.test.tsx tests/proxy-matcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces**

Mover las dos carpetas con `git mv`; el layout nuevo no llama `exigirEntradaPanel`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/hallazgos-dos-pasos.test.ts tests/verificaciones.test.ts tests/listas-audiencia.test.ts tests/distribucion-excel.test.ts tests/catalogos-lectura.test.tsx tests/paginas-sesion.test.ts tests/navegacion.test.ts tests/copias.test.ts tests/bloque-distribucion.test.tsx tests/proxy-matcher.test.ts tests/handlers-permisos.test.ts tests/puntos-uso.test.ts tests/acuses.test.ts && npm run lint`
Expected: PASS. **Punto de control en navegador**: `gerente` abre Puntos de uso y Listas sin
botones; `lider.gth` ve solo sus puntos; una lista con «Todos los usuarios activos» y «Pedir acuse»
llega a `admin`; `jefe.urgencias` marca «Corregido» con foto, `coordinadora.sgc` reabre y después
verifica Urgencias conforme y el hallazgo se cierra solo; Excel de Socializaciones; fecha de
corrección cambiada al cerrar una verificación; el aviso de Reemplazar se ve.

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(f13c): herencia de la 13B - Excel de socializaciones, fecha de corrección, catálogos en solo lectura, miembro todos y hallazgos en dos pasos"
```

---
### Tarea 14: Bitácora, agrupación de tareas, detalles transversales y `AGENTS.md`

**Files:**
- Modify: `src/lib/bitacora-detalle.ts`, `tests/bitacora-detalle.test.ts`, `src/lib/tareas.ts`,
  `tests/tareas.test.ts`, `src/componentes/vigencia/BloqueVigencia.tsx`, `src/componentes/vigencia/TablaSemaforo.tsx`,
  `src/app/(app)/admin/(panel)/page.tsx`, `src/db/semillas/minima.ts` (claves que falten), `AGENTS.md`

**Interfaces:**
- Produces (`bitacora-detalle.ts`): frase legible y nombre de filtro para cada acción nueva:
  `documento_ratificado` («Ratificó sin cambios <codigo> v<n>»), `ratificacion_rechazada`,
  `fecha_revision_fijada`, `fecha_revision_quitada`, `plazo_revision_ajustado`, `externo_registrado`,
  `externo_editado`, `externo_adoptado` («Adoptó la edición <edicion> de <codigo>»), `externo_verificado`
  («Verificó la vigencia de <codigo>: <resultado>»), `externo_retirado`, `revision_anual_abierta`,
  `revision_anual_prorrogada`, `revision_anual_decision`, `revision_anual_normograma`,
  `revision_anual_cerrada`, `informe_generado`, `informe_no_regenerable`, `norma_creada`,
  `norma_editada`, `norma_estado` («Pasó <nombre> a <estado>»), `norma_relacion`,
  `norma_relacion_eliminada`, `norma_asociada`, `norma_requisito_editado`, `norma_desasociada`,
  `norma_documento_enlazado`, `norma_documento_desenlazado`, `norma_retirada`, `norma_borrada`,
  `impacto_resuelto` («Resolvió el impacto de <nombre> en <codigo>: no afecta»), `hallazgo_corregido`,
  `hallazgo_validado`, `hallazgo_reabierto`, `exporto_semaforo`, `exporto_externos`,
  `exporto_normograma`, `exporto_indicadores`, `exporto_socializaciones`, `tipo_norma_*`;
  `NOMBRE_CLAVE_DOCUMENTAL` gana las claves de la Tarea 2 con sus nombres («días de atención del
  semáforo», «meta de documentos dentro del plazo»…).
- Produces (`tareas.ts`): `agruparTareas` agrupa también `vigencia:` («12 documentos por revisar»,
  enlace `/vigencia/semaforo?estado=vencida`) y `externo:` («4 externos por verificar», enlace
  `/vigencia/externos`) con el mismo umbral de cinco; el total sigue siendo el real (F13B-R12).
- Produces (pantallas): la leyenda «En revisión anual <año>» junto a los botones de la ficha y del
  Semáforo cuando el documento está en una campaña abierta (spec §7.5); el botón «Registrar
  documento externo» en Gestión de documentos junto a «Registrar documento ya aprobado» (visible con
  `externos.gestionar`).
- Produces (`AGENTS.md`), spec §15.4: regla de negocio 5 (tablas de solo inserción nuevas), regla
  10 (la adopción como cuarto camino que publica, con firma, por `aplicarPublicacion`), la nota de
  que la adopción y el retiro usan los tres llamadores de `alDejarDeSerVigente`, las tres rutas de
  subida nuevas fuera del `matcher`, los dos archivos de acciones nuevos, las firmas sin trámite, y
  en «Reglas fijas» la fecha base por origen (F13C-DC31) y el patrón `exigirSesion` + alcance +
  `notFound()` de las páginas de Vigencia y normograma.

- [ ] **Step 1: Tests que fallan**

`tests/bitacora-detalle.test.ts`: una frase por acción nueva (`describirEvento` con el `detalle`
mínimo de cada una) y `nombreDeAccion` para el filtro. `tests/tareas.test.ts`: seis `vigencia:` se
agrupan en una con «6 documentos por revisar» y el total sigue siendo 6 más las demás.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/bitacora-detalle.test.ts tests/tareas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar Produces y editar `AGENTS.md`**

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/bitacora-detalle.test.ts tests/tareas.test.ts tests/bitacora.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests AGENTS.md
git commit -m "feat(f13c): frases de bitácora, agrupación de tareas de vigencia, leyenda de campaña y reglas nuevas en AGENTS.md"
```

---

### Tarea 15: Semilla demo de la 13C (resiembra)

**Files:**
- Create: `src/db/semillas/vigencia-demo.ts`, `tests/semilla-vigencia.test.ts`
- Modify: `src/db/semillas/demo.ts` (llama `sembrarVigencia` al final, después de la distribución),
  `src/db/semillas/distribucion-demo.ts` (la lista «Todo el hospital» pasa a `todos`),
  `tests/utiles/demo.ts` (`exigirDemoIntacta` con el conteo nuevo de documentos), `tests/semilla-distribucion.test.ts`

**Interfaces:**
- Consumes: `registrarExterno`, `abrirEdicion`, `adoptarEdicion`, `registrarVerificacion`,
  `ratificar`, `fijarProximaRevision`, `crearNorma`, `registrarRelacion`, `asociarProceso`,
  `enlazarDocumento`, `cambiarEstadoNorma`, `resolverImpacto`, `abrirRevision`, `confirmarNormograma`,
  `crearSolicitud`, con `opciones.ahora` en fechas relativas a hoy y `opciones.verificar` =
  `firmaDePrueba` de la semilla (acepta `CLAVE_DEMO`), al estilo de `distribucion-demo.ts`.
- Produces (`vigencia-demo.ts`): `sembrarVigencia(c: ContextoDistribucion & { ahora: Date }): Promise<void>`
  que deja exactamente el estado del spec §17:
  - `proxima_revision_fijada` en una parte de los documentos cargados «fuera» (por `coordinadora.sgc`,
    nota «Carga inicial»), de modo que queden **vencidos** `GTH-PR-01` y `AIN-FO-01` (sin fecha
    fijada: su `fecha_aprobacion` de 2025 los vence), en **atención** `SGC-PR-01` (fijada a 83 días)
    y los demás al día; dos **ratificaciones** de hace meses (`GTH-CA-01` v3 por `lider.gth`,
    `CEX-CA-01` por `lider.cex`, con `ahora` desplazado y `firmaDePrueba`).
  - Cuatro **externos** con PDF generado por la semilla (`generarPlaceholder`): `CEX-DE-01` Guía de
    práctica clínica de hipertensión arterial (MinSalud, edición «2017», responsable `lider.cex`,
    verificada hace 9 meses «sigue vigente»), `ATE-DE-01` Manual de usuario de una bomba de infusión
    (fabricante ficticio, «rev. 4.2», responsable `regente.farmacia`, adoptado hace 17 meses, **sin
    verificación: vencido**), `SOG-DE-01` Resolución 3100 de 2019 como texto de trabajo (enlazada a
    su norma; responsable `coordinadora.sgc`; una edición obsoleta «2019» y la vigente «2019, corr.»),
    `GTH-DE-01` Estándares mínimos del SG-SST (enlazado a la Resolución 0312 de 2019; responsable `lider.gth`).
  - **Normograma:** las doce normas del spec §17 con tipo, emisor, título y tema; asociadas a
    procesos con requisito y enlazadas a documentos de la demo; la Resolución 2003 de 2014
    **derogada** por la 3100 (relación «deroga a» con fecha 2019-11-25) con **un impacto pendiente**
    sobre `CEX-GU-01` (CEX) y uno resuelto «no afecta» en SOG; la 3100 «reglamenta a» el Decreto 780.
  - La **revisión anual 2026 abierta** hace siete días (plazo 60, ventana 6): GTH completo (sus
    documentos ratificados o recientes, normograma «sin novedad»); CEX a medias (una solicitud de
    modificación enlazada, `SOL-2026-00N`, por `lider.cex`); AIN sin líder; los demás pendientes.
  - La lista «Todo el hospital» con un solo miembro `todos`; el hallazgo abierto de Urgencias intacto.
- Produces (`tests/semilla-vigencia.test.ts`): lee la demo y comprueba §17 (conteos de vencidos y
  atención, los cuatro externos con su estado, la 2003 derogada con su impacto pendiente, la revisión
  abierta con GTH completo); salta con aviso si la demo ya avanzó (`exigirDemoIntacta`) y
  `SEMILLA_RECIEN=1` lo exige.

- [ ] **Step 1: Test que falla**

Escribir `tests/semilla-vigencia.test.ts` con las aserciones de **Produces**.

Run: `npx vitest run tests/semilla-vigencia.test.ts`
Expected: FAIL (sin externos ni normas en la demo).

- [ ] **Step 2: Implementar `vigencia-demo.ts` y los cambios de `demo.ts` y `distribucion-demo.ts`**

- [ ] **Step 3: Resembrar y verificar**

El controlador avisa al usuario. Run: `npm run db:seed && npm run admin:asegurar`, luego
`$env:SEMILLA_RECIEN=1; npm test` (PowerShell) y `npm run lint`.
Expected: PASS sin saltos; `tests/semilla-tramites.test.ts`, `tests/semilla-distribucion.test.ts` y
`tests/semilla-vigencia.test.ts` en verde.

- [ ] **Step 4: Commit**

```bash
git add src tests
git commit -m "feat(f13c): demo de vigencia, externos, normograma y revisión anual (resiembra)"
```

---

### Tarea 16: Documentación de cierre y verificación final

**Files:**
- Create: `docs/manual/usuario/07-vigencia-revision-anual-externos-y-normograma.md`
- Modify: `docs/manual/usuario/03-conocer-la-plataforma.md`, `docs/manual/usuario/05-*.md`,
  `docs/manual/usuario/06-*.md`, `CONTEXT.md`, `PLAN.md`, `README.md`

**Interfaces:**
- Consumes: el spec §20 (contenido del capítulo 7 por actor), §19 (recorrido), §23 (decisiones
  F13C-DC1 a DC39) y las resoluciones del controlador durante la ejecución (F13C-R1…).

- [ ] **Step 1: Manual**

Capítulo 7 con una sección por actor (spec §20): cualquier persona (normograma, qué significa el
semáforo), el responsable técnico (verificar), el líder (ratificar, decidir, normograma del
proceso, externos, asociar normas, impactos, indicadores), Gerencia y Control Interno (leer todo,
el informe), el Administrador del SGC (fijar fechas tras la carga inicial, abrir, prorrogar y
cerrar la revisión, normograma, metas y plazos, formato del informe); los tres ajustes al texto del
procedimiento (§5); la advertencia de la carga inicial vencida y cómo tratarla. Corregir los
capítulos 3, 5 y 6 donde esta entrega los deje falsos (entradas de la barra, motivos y trámites
enlazados, catálogos en solo lectura, miembro «todos», hallazgos en dos pasos, Excel de
socializaciones, fecha de corrección).

- [ ] **Step 2: `CONTEXT.md`, `PLAN.md` y `README.md`**

`CONTEXT.md`: punto de reanudación (la 13C en su rama, qué sigue: la fusión y la Fase 14), «Qué
probar y cómo (Fase 13C)» con los doce pasos de §19 del spec adaptados a la demo real, «Avisos para
el usuario (Fase 13C)», «Hecho (Fase 13C)», «Decisiones adicionales (Fase 13C)» (F13C-DC1 a DC39 y
las R del controlador, con Base), la deuda técnica nueva y los conteos de tests. `PLAN.md`: la fila
13C ✅. `README.md`: rutas y módulos nuevos.

- [ ] **Step 3: Verificación final**

Run: `npm run lint`, `$env:SEMILLA_RECIEN=1; npm test` (sobre la demo recién sembrada de la Tarea 15,
o resembrar), `npm run build` sin `DATABASE_URL`, `docker compose -f docker-compose.dev.yml up -d --build --no-deps app`
y comprobar «Migraciones al día» (nueve migraciones) y `/api/salud` `{"estado":"ok"}`; aplicar la
0008 sobre una copia con la demo de `main` (`pg_dump` → base `sgc_copia` → `db:migrate` con la
`DATABASE_URL_MIGRADOR` apuntando a la copia) y sobre una con el esquema de `sgc-suaza`, con
`tests/esquema*.test.ts` en verde contra ellas; borrar las copias.
Expected: todo en verde; conteos anotados en `CONTEXT.md`.

- [ ] **Step 4: Recorrido de demostración**

El controlador recorre los doce pasos de §19 del spec en el navegador (claro, oscuro y 390 px) y
deja las capturas en la bitácora de la sesión; lo que falle vuelve a su tarea como ola de arreglos
antes del commit de cierre.

- [ ] **Step 5: Commit de cierre**

```bash
git add docs CONTEXT.md PLAN.md README.md
git commit -m "docs: CONTEXT.md, manual (capítulo 7) y PLAN.md al cierre de la Fase 13C"
```

La fusión a `main` la decide el usuario después de su recorrido, como en la 13A y la 13B.
