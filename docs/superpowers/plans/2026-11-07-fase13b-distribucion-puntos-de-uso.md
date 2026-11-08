# Fase 13B — Distribución y puntos de uso: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar al sistema los pasos 9 y 10 del procedimiento de control de documentos del
hospital: copias controladas impresas con sello y QR, recibido y recogida por el responsable
del punto de uso; listas de distribución y acuse de lectura con porcentaje; jornadas de
socialización con evidencia; y verificación de puntos de uso con hallazgos y porcentaje de
conformidad; todo en «Mis tareas» y la campana, sin planificador ni correo.

**Architecture:** Seis módulos sobre lo que la 13A dejó: un catálogo de **puntos de uso**; las
**copias controladas** como filas con estado y un historial de solo inserción, cuyo PDF sellado
se genera al vuelo desde el principal; una función única (`alDejarDeSerVigente`) que, en la
misma transacción en que una versión deja de ser vigente (publicar, eliminar, deshacer carga),
marca sus copias por recoger y supera sus acuses; los **acuses** como estado por persona y
versión más eventos inmutables; las **jornadas** como primer dueño de `archivos` distinto de
una versión; y las **verificaciones** con una lista que arma el sistema y hallazgos que nacen al
cerrarla. Las reglas puras viven en `src/lib/distribucion/`, las consultas en
`src/db/consultas/distribucion/`, la visibilidad en `src/lib/alcance.ts`, las tareas en
`misTareas()` y los vencimientos en la revisión de la 13A.

**Tech Stack:** Next.js 16.4 (App Router, Server Actions, route handlers), TypeScript estricto,
PostgreSQL 16 con `postgres` (SQL etiquetado) y Drizzle para el esquema y las migraciones,
`zod` 4, `pdf-lib` (sello), `qrcode` (QR en PNG), `exceljs`, Tailwind 4 con los componentes
base de `src/componentes/ui`, Vitest. **Sin dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-11-07-fase13b-distribucion-puntos-de-uso-design.md`
(«el spec»), que detalla al spec 13A (`2026-11-05-fase13a-flujo-documental-design.md`) y al
spec maestro (`2026-11-03-sgc-integral-plataforma-design.md`). Las decisiones del spec se citan
como F13B-DCn; las de la 13A, como F13A-DCn.

## Avisos para quien ejecuta

- **La base de desarrollo se vuelve a sembrar una vez**, en la **Tarea 15** (`npm run db:seed`
  y luego `npm run admin:asegurar`). El controlador avisa al usuario antes: pierde los datos de
  prueba manual. Hasta entonces, la migración 0006 se aplica sobre la base sembrada sin
  resembrar.
- **La demo gana dos usuarios** con rol `consulta` (`jefe.urgencias`, `regente.farmacia`) y un
  cargo («Regente de Farmacia»), y **asigna procesos a todos sus usuarios** (spec §16); todos
  con la clave demo. El controlador se lo dice al usuario al entregar el plan.
- **Puntos de control en navegador del controlador:** después de las Tareas 6 (copias de punta
  a punta), 9 (acuses y listas) y 13 (verificación), y la demostración de §18 del spec en la
  Tarea 16.
- **El QR del sello necesita `url_publica`** (Tarea 2). Sin ella, el sello sale sin QR y el
  diálogo lo dice: no es un error.
- **Los PDF reales del hospital** (`SGC-FO-0XX Acta_Control_Documental.pdf` y los Word de la
  raíz) están sin seguimiento y excluidos en `.git/info/exclude`: sirven para probar la franja
  del sello (Tarea 5) y **nunca entran a un commit**.
- No se lee `.env.local`. No se detiene ni se borra el servicio `bd` ni su volumen. No se hace
  `push` ni `merge` sin que el usuario lo pida. Todo en la rama
  `fase-13b-distribucion-puntos-de-uso`.

## Global Constraints

- Node 24 en desarrollo, CI e imagen. TypeScript estricto, sin `any` salvo justificación
  puntual. Dominio, interfaz y código en español.
- **Sin dependencias npm nuevas.** `pdf-lib`, `qrcode` y `exceljs` ya están.
- **Migración aditiva, aplicable sobre una base de `sgc-suaza` y sobre una de la 13A:** no se
  renombra ni se borra ninguna tabla ni columna. En `archivos`, `version_id` deja de ser
  obligatoria y entra un `CHECK` que las filas existentes cumplen (spec §14.1).
- **Una sola versión vigente** y publicar en una sola transacción no cambian; los enganches de
  esta entrega van **dentro** de esa transacción (`alDejarDeSerVigente`, spec §8.4).
- **Toda escritura exige sesión y un permiso de la matriz** `src/lib/permisos.ts`, más la
  condición de persona donde el spec la pide (responsable del punto, destinatario del acuse).
  Las Server Actions nuevas viven en `src/app/acciones-distribucion.ts`,
  `src/app/admin/acciones-puntos-uso.ts` y `src/app/admin/acciones-listas.ts`, cada una con
  `mutacion(formData, "<permiso>", fn)`; `tests/acciones-permisos.test.ts` las cubre (la Tarea 2
  añade el archivo nuevo a su lista).
- **Toda consulta nueva recibe la conexión como última opción** (`opciones?: { sql?: Cliente }`,
  por defecto `obtenerSql()`): los tests corren en una transacción que se revierte
  (`tests/utiles/transaccion.ts`, `revertida`).
- Esquemas `zod` `.strict()` leídos con `parsearFormulario`; un `id` de ruta se lee con
  `idNumerico()` y `omitir: ["id"]`. Ninguna acción vuelca el formulario en un `UPDATE`.
- Cada página nueva llama `exigirSesion()` o `exigirPermiso(permiso)`; cada handler nuevo usa
  `sesionDePeticion`, autoriza y, si escribe, `origenValido()`. Las rutas de subida van fuera
  del `matcher` de `src/proxy.ts`, con los puntos como `[.]`, y con su caso en
  `tests/proxy-matcher.test.ts`.
- **`copia_eventos` y `acuse_eventos` son de solo inserción**; una verificación cerrada o
  descartada y sus ítems no se modifican. Nunca `UPDATE` ni `DELETE` sobre ellas ni sobre
  `auditoria`, `accesos`, `firmas` y `tramite_eventos`, tampoco en la limpieza de un test.
- Quien no puede ver un punto, una copia, un acuse, una jornada o una verificación recibe **«no
  encontrado»** (404), nunca «sin permiso».
- Fechas y plazos en la zona de la instalación (`zonaHoraria()`); plazos en días calendario con
  `fechaLimite` (`src/lib/tramites/plazos.ts`); la BD guarda `timestamptz`.
- Sin `dangerouslySetInnerHTML`; notas, descripciones y observaciones son texto plano. Todo
  Excel pasa por `neutralizarFormula`. La evidencia adjunta nunca es SVG ni HTML.
- Interfaz dentro del cascarón, con los componentes de `src/componentes/ui` y clases de token;
  nunca los alias `azul`/`verde` ni colores fijos de Tailwind. Estado nunca solo por color.
  Teclado, foco visible, AA en claro y oscuro, 390 px (la verificación se diseña primero para
  el celular).
- Textos de interfaz: el rol se llama como `src/lib/roles.ts`; «Coordinador SGC» no aparece como
  nombre de rol.
- Todos los archivos con finales de línea LF. Commits convencionales en español con el trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. **`GET` del PDF sellado fuera de la ventana de impresión** (recarga veinte minutos después,
   o una dirección copiada). No sirve el PDF: responde 409 con el enlace a «Reimprimir», y no
   deja evento `impresa`. Test en la Tarea 5.
2. **Doble confirmación del recibido o de la recogida** desde dos pestañas, o un reenvío del
   formulario. La segunda falla con «La copia ya no está en ese estado» y queda un solo evento.
   Test en la Tarea 6.
3. **Confirmar la lectura sin haber abierto el documento, o la de otra persona.** La primera se
   rechaza con «Abra el documento antes de confirmar»; la segunda responde 404. Test en la
   Tarea 8.
4. **Escribir en una verificación cerrada o cerrar una con ítems sin responder.** Las dos se
   rechazan: la primera también por el trigger (`42501`). Test en la Tarea 12.
5. **`url_publica` con esquema o ruta no permitidos** (`javascript:`, `ftp:`, una ruta, un
   espacio). Se rechaza al guardar; con ella vacía el sello sale sin QR y el diálogo lo avisa.
   Test en las Tareas 2 y 5.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `drizzle/0006_*.sql`, `src/db/esquema.ts`, `src/db/roles-bd.ts`, `src/db/semillas/minima.ts` | Tablas, restricciones, triggers, privilegios, `TRUNCATE` | 1 |
| `src/lib/permisos.ts`, `src/lib/url-publica.ts`, `src/db/consultas/config-documental.ts`, `src/db/consultas/entidad.ts`, `src/lib/esquemas/entidad.ts` | Permisos nuevos, configuración de distribución, dirección pública | 2 |
| `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx`, `src/componentes/admin/entidad/*`, `src/app/admin/acciones-config-documental.ts`, `src/app/admin/acciones-entidad.ts` | Sección «Distribución» y campo «Dirección de la plataforma» | 2 |
| `src/lib/distribucion/{tipos,copias,acuses,verificacion}.ts` | Reglas puras: estados, sello, QR, ventana, porcentajes, lista de chequeo | 3 |
| `src/lib/alcance.ts` | Quién ve la distribución; filtro por alcance de puntos y copias | 4 |
| `src/db/consultas/distribucion/puntos-uso.ts`, `src/app/admin/acciones-puntos-uso.ts`, `src/app/(app)/admin/(panel)/puntos-uso/**`, `src/componentes/distribucion/puntos/*` | Catálogo de puntos de uso | 4 |
| `src/db/consultas/usuarios.ts` (`cambiarActivo`), `src/app/(app)/admin/(panel)/usuarios/[id]/page.tsx` | Un responsable de puntos activos no se desactiva | 4 |
| `src/lib/distribucion/sello-pdf.ts`, `src/db/consultas/distribucion/copias.ts`, `src/app/(app)/distribucion/copias/[id]/{pdf,reimprimir}/route.ts` | Emisión, sello, ventana de impresión, reimpresión, anulación | 5 |
| `src/db/consultas/distribucion/version-vigencia.ts`, `src/db/consultas/admin.ts`, `src/db/consultas/flujo/cierre.ts` | `alDejarDeSerVigente` en los tres lugares | 6 |
| `src/app/acciones-distribucion.ts`, `src/app/(app)/distribucion/**`, `src/componentes/distribucion/*`, `src/componentes/cascaron/navegacion.ts`, `src/lib/tareas.ts`, `src/db/consultas/distribucion/tareas.ts` | Recibido, recogida, reemplazo, pantalla «Distribución», entrada en la barra, tareas de copias | 6 |
| `src/db/consultas/distribucion/{listas,audiencia}.ts`, `src/app/admin/acciones-listas.ts`, `src/app/(app)/admin/(panel)/listas-distribucion/**`, `src/componentes/admin/FormularioDocumento.tsx`, `src/app/admin/acciones.ts` | Listas nombradas; audiencia y marca de ingreso como dato de catálogo | 7 |
| `src/db/consultas/distribucion/acuses.ts`, `src/app/(app)/acuses/**` | Acuses: creación al publicar, confirmación, superado, tarea | 8 |
| `src/db/consultas/usuarios.ts` (`crearUsuario`, `editarUsuario`, `crearUsuariosEnLote`), `src/app/(app)/distribucion/acuses/page.tsx`, `src/lib/distribucion/acuses-excel.ts` | Pedido manual, ingreso al proceso, salida de la audiencia, porcentajes, Excel | 9 |
| `src/lib/subida.ts`, `src/lib/recepcion-archivo.ts`, `src/db/consultas/admin.ts` (`registrarArchivo`), `src/db/consultas/distribucion/evidencias.ts` | `archivos` con contexto: subida y servido de evidencias | 10 |
| `src/db/consultas/distribucion/jornadas.ts`, `src/db/consultas/flujo/aceptacion.ts`, `src/lib/esquemas/tramites.ts`, `src/app/(app)/distribucion/socializaciones/**`, `src/app/api/socializaciones/**` | Marca de socialización, jornadas, asistencia como acuse | 11 |
| `src/db/consultas/distribucion/{verificaciones,hallazgos}.ts`, `src/app/(app)/distribucion/verificaciones/**`, `src/app/api/verificaciones/**` | Verificación en el celular, hallazgos, fotos | 12 |
| `src/db/consultas/distribucion/vencimientos.ts`, `src/db/consultas/vencimientos.ts`, `src/lib/distribucion/verificaciones-excel.ts` | Pestaña Verificaciones, tareas de verificar y corregir, vencimientos de toda la entrega | 13 |
| `src/lib/bitacora-detalle.ts`, `src/componentes/inicio/MisTareas.tsx`, `src/app/(app)/tramites/[id]/page.tsx`, fichas del documento | Frases de bitácora, agrupación de tareas, estado de distribución en el trámite y en las fichas | 14 |
| `src/db/semillas/demo.ts`, `src/db/semillas/distribucion-demo.ts`, `tests/semilla-distribucion.test.ts` | Demo de la 13B (resiembra) | 15 |
| `docs/manual/usuario/06-*.md`, `CONTEXT.md`, `AGENTS.md`, `PLAN.md`, `README.md` | Documentación de cierre | 16 |

---

### Tarea 1: Migración 0006, esquema, roles y privilegios

**Files:**
- Create: `drizzle/0006_fase13b-distribucion.sql` (con `npm run db:generate -- --name fase13b-distribucion`,
  más SQL a mano), `tests/esquema-fase13b.test.ts`
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts:46`, `src/db/semillas/minima.ts` (`limpiarTodo`),
  `tests/privilegios-bd.test.ts`

**Interfaces:**
- Consumes: `sgc_impedir_modificacion()` (`drizzle/0002_fase11-acceso.sql:80`); `revertida`
  (`tests/utiles/transaccion.ts`).
- Produces (nombres definitivos de BD; todo el plan los usa). Todas las FK con `ON DELETE RESTRICT`,
  todas las fechas `timestamptz`, `id` como en las demás tablas:
  - `archivos`: `version_id` **pasa a nullable**; `contexto text NOT NULL DEFAULT 'version'`;
    `contexto_id bigint NULL`; `CHECK archivos_contexto_valido`:
    `contexto IN ('version','jornada','verificacion_item')`; `CHECK archivos_contexto_coherente`:
    `(contexto = 'version' AND version_id IS NOT NULL AND contexto_id IS NULL) OR (contexto <> 'version' AND version_id IS NULL AND contexto_id IS NOT NULL)`;
    `archivos_rol_valido` admite además `'evidencia'`; índice `archivos_contexto_idx` sobre
    (`contexto`, `contexto_id`).
  - `documentos.lectura_obligatoria_ingreso boolean NOT NULL DEFAULT false`.
  - `tramites.requiere_socializacion boolean NOT NULL DEFAULT false`.
  - `puntos_uso`: `nombre text NOT NULL`, `sede text NULL`, `ubicacion text NULL`,
    `responsable_id NOT NULL` → `usuarios`, `activo boolean NOT NULL DEFAULT true`,
    `orden integer NOT NULL DEFAULT 0`, `creado_en`, `actualizado_en`. Índice único
    `puntos_uso_sede_nombre_unico` sobre (`lower(coalesce(sede, ''))`, `lower(nombre)`).
  - `punto_uso_procesos`: `punto_uso_id` → `puntos_uso`, `proceso_id` → `procesos`; PK
    compuesta; índice por `proceso_id`.
  - `copias_controladas`: `version_id NOT NULL` → `documento_versiones`; `numero integer NOT NULL`
    (único con `version_id`: `copias_version_numero_unico`); `punto_uso_id NOT NULL`;
    `responsable_id NOT NULL` → `usuarios`; `responsable_nombre text NOT NULL`;
    `responsable_cargo text NULL`; `emitida_por NOT NULL` → `usuarios`;
    `hash_principal text NOT NULL`; `nota text NULL`; `estado text NOT NULL DEFAULT 'emitida'`
    `CHECK IN ('emitida','recibida','por_recoger','recogida','anulada')`; `emitida_en NOT NULL`;
    `recibida_en`, `por_recoger_en`, `recogida_en`, `anulada_en NULL`; `motivo_por_recoger text
    NULL CHECK IN ('nueva_version','eliminado','carga_deshecha')`; `destino_recogida text NULL
    CHECK IN ('devuelta','destruida','no_encontrada','retirada_en_verificacion')`;
    `motivo_anulacion text NULL`; `reemplaza_copia_id NULL` → `copias_controladas`;
    `ultima_apertura_en NULL` (inicio de la ventana de impresión); `vence_en`,
    `aviso_vencido_en`, `escalado_en NULL`. Índices por `punto_uso_id` y por `estado`.
  - `copia_eventos`: `copia_id NOT NULL`, `tipo text NOT NULL CHECK IN ('emitida','impresa','consultada','reimpresa','recibida','por_recoger','recogida','anulada')`,
    `usuario_id NULL`, `detalle jsonb NOT NULL DEFAULT '{}'`, `creado_en`; índice (`copia_id`,
    `creado_en`). Trigger `copia_eventos_inmutable`.
  - `listas_distribucion`: `nombre text NOT NULL`, `descripcion text NULL`, `activa boolean NOT NULL
    DEFAULT true`, `creado_en`; índice único sobre `lower(nombre)`.
  - `lista_miembros`: `lista_id NOT NULL` → `listas_distribucion`, `tipo text NOT NULL CHECK IN
    ('area','cargo','proceso','usuario')`, `referencia_id bigint NOT NULL`; único (`lista_id`,
    `tipo`, `referencia_id`). La referencia se valida en la aplicación (no hay FK polimórfica).
  - `documento_listas`: `documento_id` → `documentos`, `lista_id` → `listas_distribucion`; PK
    compuesta.
  - `acuses`: `version_id NOT NULL`, `usuario_id NOT NULL`, `origen text NOT NULL CHECK IN
    ('publicacion','solicitud_manual','ingreso_proceso')`, `estado text NOT NULL DEFAULT 'pendiente'
    CHECK IN ('pendiente','confirmado','superado','retirado')`, `modo text NULL CHECK IN
    ('individual','asistencia','firma')`, `jornada_id NULL` → `jornadas`, `creado_en`,
    `confirmado_en NULL`, `vence_en NOT NULL`, `aviso_vencido_en`, `escalado_en`, `cerrado_en NULL`,
    `motivo_cierre text NULL`. Índice único parcial `acuses_vivo_unico` sobre (`version_id`,
    `usuario_id`) `WHERE estado IN ('pendiente','confirmado')`; índices (`usuario_id`, `estado`) y
    `version_id`.
  - `acuse_eventos`: `acuse_id NOT NULL`, `tipo text NOT NULL CHECK IN
    ('creado','confirmado','superado','retirado','revertido')`, `usuario_id NULL`, `detalle jsonb
    NOT NULL DEFAULT '{}'`, `creado_en`; índice (`acuse_id`, `creado_en`). Trigger
    `acuse_eventos_inmutable`.
  - `jornadas`: `fecha date NOT NULL`, `modalidad text NOT NULL CHECK IN
    ('presencial','virtual','reunion_servicio','otra')`, `facilitador_id NOT NULL` → `usuarios`,
    `observaciones text NULL`, `asistentes_externos text NULL`, `registrada_por NOT NULL` →
    `usuarios`, `creado_en`, `anulada_en NULL`, `anulada_por NULL` → `usuarios`,
    `motivo_anulacion text NULL`.
  - `jornada_versiones` (`jornada_id`, `version_id`; PK compuesta; índice `version_id`) y
    `jornada_asistentes` (`jornada_id`, `usuario_id`; PK compuesta).
  - `socializaciones_requeridas`: `version_id NOT NULL UNIQUE` → `documento_versiones`,
    `creado_en`, `vence_en NOT NULL`, `aviso_vencido_en`, `escalado_en`, `cumplida_en NULL`,
    `jornada_id NULL`, `superada_en NULL`.
  - `verificaciones`: `punto_uso_id NOT NULL`, `estado text NOT NULL DEFAULT 'abierta' CHECK IN
    ('abierta','cerrada','descartada')`, `abierta_por NOT NULL` → `usuarios`, `abierta_en NOT NULL`,
    `cerrada_por NULL`, `cerrada_en NULL`, `conforme boolean NULL`, `propio_punto boolean NOT NULL
    DEFAULT false`, `motivo_descarte text NULL`, `punto_nombre text NOT NULL`,
    `responsable_id NOT NULL` → `usuarios`, `responsable_nombre text NOT NULL`. Índice único
    parcial `verificaciones_una_abierta_idx` sobre (`punto_uso_id`) `WHERE estado = 'abierta'`;
    índice (`punto_uso_id`, `cerrada_en`).
  - `verificacion_items`: `verificacion_id NOT NULL`, `orden integer NOT NULL`, `origen text NOT NULL
    CHECK IN ('copia','copia_por_recoger','fijo','libre')`, `copia_id NULL` → `copias_controladas`,
    `texto text NOT NULL`, `respuesta text NULL CHECK IN ('conforme','no_conforme','no_aplica')`,
    `nota text NULL`; índice `verificacion_id`.
  - `hallazgos`: `punto_uso_id NOT NULL`, `origen text NOT NULL CHECK IN ('verificacion','recogida')`,
    `verificacion_id NULL`, `item_id NULL` → `verificacion_items`, `copia_id NULL`,
    `documento_id NULL`, `descripcion text NOT NULL`, `retirado_en_el_acto boolean NOT NULL DEFAULT
    false`, `responsable_id NOT NULL` → `usuarios`, `estado text NOT NULL DEFAULT 'abierto' CHECK IN
    ('abierto','cerrado')`, `vence_en NOT NULL`, `aviso_vencido_en`, `escalado_en`, `creado_en`,
    `cerrado_en NULL`, `cerrado_por NULL`, `nota_cierre text NULL`. Índices (`punto_uso_id`,
    `estado`) y `responsable_id`.
  - Función `sgc_impedir_si_verificacion_cerrada()` (plpgsql, `RAISE EXCEPTION … USING ERRCODE =
    '42501'` si la verificación de la fila está `cerrada` o `descartada`; para `verificaciones`
    mira `OLD.estado`, para `verificacion_items` consulta su verificación) con triggers
    `verificaciones_cerrada_inmutable BEFORE UPDATE` y `verificacion_items_inmutables BEFORE UPDATE OR DELETE`.

- [ ] **Step 1: Tests que fallan**

`tests/esquema-fase13b.test.ts` (BD de desarrollo, `sql` como la app, al estilo de
`tests/esquema-fase13a.test.ts`; cada inserción que debe fallar va en `tx.savepoint`):

```ts
it("archivos: las filas heredadas son de versión y un contexto nuevo exige contexto_id", () => revertida(sql, async (tx) => {
  const [{ n }] = await tx`SELECT count(*)::int AS n FROM archivos WHERE contexto <> 'version' OR version_id IS NULL`;
  expect(n).toBe(0);
  const insertar = (contexto: string, versionId: number | null, contextoId: number | null, ruta: string) => tx.savepoint((s) =>
    s`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
      VALUES (${versionId}, ${contexto}, ${contextoId}, 'evidencia', ${ruta}, 'acta.pdf', 'pdf', 'application/pdf', 10, 'x')`);
  await insertar("jornada", null, 1, "zz/j1.pdf");
  expect(await fallaCon(insertar("jornada", 1, 1, "zz/j2.pdf"))).toBe("23514");
  expect(await fallaCon(insertar("version", null, null, "zz/j3.pdf"))).toBe("23514");
  expect(await fallaCon(insertar("otro", null, 1, "zz/j4.pdf"))).toBe("23514");
}));

it("un solo acuse vivo por versión y persona; los cerrados no cuentan", () => revertida(sql, async (tx) => {
  const [v] = await tx`SELECT id FROM documento_versiones LIMIT 1`;
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const crear = (estado: string) => tx.savepoint((s) =>
    s`INSERT INTO acuses (version_id, usuario_id, origen, estado, vence_en) VALUES (${v.id}, ${u.id}, 'publicacion', ${estado}, now())`);
  await crear("retirado");
  await crear("pendiente");
  expect(await fallaCon(crear("confirmado"))).toBe("23505");
}));

it("una verificación cerrada y sus ítems no se modifican, ni para el dueño", () => revertida(sql, async (tx) => {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO puntos_uso (nombre, responsable_id) VALUES ('zz_punto', ${u.id}) RETURNING id`;
  const [v] = await tx`INSERT INTO verificaciones (punto_uso_id, abierta_por, abierta_en, punto_nombre, responsable_id, responsable_nombre)
    VALUES (${p.id}, ${u.id}, now(), 'zz_punto', ${u.id}, 'Alguien') RETURNING id`;
  const [i] = await tx`INSERT INTO verificacion_items (verificacion_id, orden, origen, texto) VALUES (${v.id}, 1, 'fijo', 'Sin obsoletos') RETURNING id`;
  await tx`UPDATE verificacion_items SET respuesta = 'conforme' WHERE id = ${i.id}`;          // abierta: se puede
  await tx`UPDATE verificaciones SET estado = 'cerrada', cerrada_en = now(), conforme = true WHERE id = ${v.id}`;
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE verificacion_items SET nota = 'x' WHERE id = ${i.id}`))).toBe("42501");
  expect(await fallaCon(tx.savepoint((s) => s`DELETE FROM verificacion_items WHERE id = ${i.id}`))).toBe("42501");
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE verificaciones SET conforme = false WHERE id = ${v.id}`))).toBe("42501");
}));

it("una sola verificación abierta por punto; una copia por número y versión", () => revertida(sql, async (tx) => { /* 23505 en la segunda abierta y en el segundo número */ }));
```

En `tests/privilegios-bd.test.ts`, el `it.each` de tablas inmutables pasa a
`["firmas", "tramite_eventos", "copia_eventos", "acuse_eventos"]`, y el caso del dueño del esquema
inserta y falla también sobre `copia_eventos` (`UPDATE … SET tipo = 'x'` → `42501`).

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/esquema-fase13b.test.ts tests/privilegios-bd.test.ts`
Expected: FAIL (tablas y columnas inexistentes).

- [ ] **Step 3: Esquema y migración**

Editar `src/db/esquema.ts` con lo de **Produces** (rutas relativas, nunca `@/`; en `archivos`,
`versionId` sin `.notNull()`, y `contexto`/`contextoId` nuevos). Generar con
`npm run db:generate -- --name fase13b-distribucion` y revisar el SQL: debe traer
`ALTER TABLE "archivos" ALTER COLUMN "version_id" DROP NOT NULL` y los `CHECK` nuevos. Añadir a
mano al final, separados por `--> statement-breakpoint`: la función
`sgc_impedir_si_verificacion_cerrada()` y los cuatro triggers (`copia_eventos_inmutable`,
`acuse_eventos_inmutable`, `verificaciones_cerrada_inmutable`, `verificacion_items_inmutables`).

- [ ] **Step 4: Roles y limpieza**

`src/db/roles-bd.ts:46`: `REVOKE UPDATE, DELETE ON auditoria, accesos, firmas, tramite_eventos, copia_eventos, acuse_eventos FROM ${r}`.
`limpiarTodo` (`src/db/semillas/minima.ts`): añadir al `TRUNCATE` las dieciséis tablas nuevas.

- [ ] **Step 5: Aplicar y verificar**

Run: `npm run db:preparar` y luego
`npx vitest run tests/esquema-fase13b.test.ts tests/privilegios-bd.test.ts tests/esquema.test.ts tests/esquema-fase13a.test.ts`
Expected: PASS, sobre la base sembrada sin resembrar.
Run: `npm run lint && npm test`
Expected: PASS (la migración es aditiva; la suite sigue en verde).

- [ ] **Step 6: Commit**

```bash
git add drizzle src/db tests
git commit -m "feat(f13b): migración 0006 - puntos de uso, copias, acuses, jornadas, verificaciones y archivos con contexto"
```

---

### Tarea 2: Permisos, configuración de distribución y dirección pública

**Files:**
- Create: `src/lib/url-publica.ts`, `tests/url-publica.test.ts`
- Modify: `src/lib/permisos.ts`, `tests/permisos.test.ts`, `tests/acciones-permisos.test.ts`
  (`ARCHIVOS_PANEL` gana `src/app/acciones-distribucion.ts`, que la Tarea 6 crea; hasta entonces
  el archivo existe vacío con `"use server"`), `src/db/consultas/config-documental.ts`,
  `src/app/admin/acciones-config-documental.ts`,
  `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx`,
  `src/db/consultas/entidad.ts`, `src/lib/esquemas/entidad.ts`, `src/app/admin/acciones-entidad.ts`,
  `src/componentes/admin/entidad/FormularioEntidad.tsx`, `tests/config-documental.test.ts`,
  `tests/entidad.test.ts`, `tests/esquemas-entidad.test.ts`

**Interfaces:**
- Produces:
  - `Permiso` gana `"distribucion.ver" | "distribucion.gestionar" | "distribucion.responder" | "copias.emitir" | "acuses.confirmar" | "socializaciones.registrar" | "verificaciones.realizar"`,
    con la matriz del spec §6.2 (`distribucion.ver`: `admin_sgc`, `gerencia`, `control_interno`,
    `lider_proceso`; `distribucion.gestionar` y `verificaciones.realizar`: `admin_sgc`;
    `copias.emitir` y `socializaciones.registrar`: `admin_sgc`, `lider_proceso`;
    `distribucion.responder` y `acuses.confirmar`: los cinco roles).
  - `ConfigDocumental.distribucion: { plazoRecibidoDias: number; plazoRecogidaDias: number; plazoAcuseDias: number; plazoSocializacionDias: number; plazoCorreccionDias: number; verificacionCadaDias: number; umbralConformidadPct: number; selloFranjaCm: number; selloQrCm: number }`
    con defectos `3, 5, 15, 30, 5, 90, 95, 1.0, 1.5`; claves `plazo_recibido_dias`,
    `plazo_recogida_dias`, `plazo_acuse_dias`, `plazo_socializacion_dias`, `plazo_correccion_dias`,
    `verificacion_cada_dias`, `umbral_conformidad_pct`, `sello_franja_cm`, `sello_qr_cm`.
    `DatosConfigDocumental.distribucion` igual; `guardarConfigDocumentalEn` valida: plazos y
    días enteros de 1 a 365, umbral entero de 50 a 100, franja de 0,5 a 3,0 cm, QR de 1,0 a 3,0 cm.
  - `validarUrlPublica(texto: string): { ok: true; url: string } | { ok: false; error: string }`
    (`src/lib/url-publica.ts`): acepta `http://` o `https://`, host (nombre o IPv4), puerto
    opcional, **sin ruta, consulta ni fragmento**; devuelve la URL sin barra final; vacío es
    `{ ok: true, url: "" }`.
  - `DatosEntidad.urlPublica: string` (vacía si no está); clave `url_publica` en `CLAVES_ENTIDAD`;
    `obtenerUrlPublica(opciones?: { sql?: Cliente }): Promise<string | null>` (`null` si vacía).
  - `EsquemaEntidad.url_publica: z.string().trim().max(200).default("")`, validada con
    `validarUrlPublica` en `guardarEntidad` (error con el texto de la función).

- [ ] **Step 1: Tests que fallan**

`tests/permisos.test.ts`: una celda por permiso nuevo, al estilo de las existentes (p. ej.
`puede({ rol: "consulta" }, "acuses.confirmar") === true`, `puede({ rol: "lider_proceso" }, "verificaciones.realizar") === false`,
`puede({ rol: "gerencia" }, "distribucion.ver") === true`, `puede({ rol: "gerencia" }, "copias.emitir") === false`).

`tests/url-publica.test.ts`:

```ts
it.each(["https://sgc.hospital.gov.co", "http://192.168.1.20:8443", "https://sgc.hospital.gov.co/"])("acepta %s", (u) =>
  expect(validarUrlPublica(u)).toEqual({ ok: true, url: u.replace(/\/$/, "") }));
it.each(["javascript:alert(1)", "ftp://x", "https://sgc.gov.co/ruta", "https://sgc.gov.co?x=1", "sgc.gov.co", "https://a b"])("rechaza %s", (u) =>
  expect(validarUrlPublica(u).ok).toBe(false));
it("vacía es válida y queda vacía", () => expect(validarUrlPublica("  ")).toEqual({ ok: true, url: "" }));
```

`tests/config-documental.test.ts`: `obtenerConfigDocumental()` trae `distribucion` con los nueve
defectos cuando las claves no existen; `guardarConfigDocumentalEn` rechaza `umbralConformidadPct: 49`
(«El umbral de conformidad debe ser un número entero de 50 a 100») y `selloQrCm: 0.5`, y audita
`editar_config_documental` con el antes y el después de `plazo_acuse_dias`.

`tests/entidad.test.ts`: `guardarEntidad` con `urlPublica: "javascript:alert(1)"` lanza; con
`"https://sgc.hospital.gov.co/"` guarda `https://sgc.hospital.gov.co` y `obtenerUrlPublica()` la
devuelve; vacía → `null`. Como los demás casos de ese archivo, restaura la fila en `finally`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/permisos.test.ts tests/url-publica.test.ts tests/config-documental.test.ts tests/entidad.test.ts`
Expected: FAIL.

- [ ] **Step 3: Permisos, configuración y entidad**

Matriz en `src/lib/permisos.ts`. En `config-documental.ts`, `CLAVES` gana las nueve claves y la
lectura y el guardado siguen el patrón de `formatoActa` (comparación por valor efectivo).
`validarUrlPublica` con `new URL()` dentro de `try` y comprobación de `protocol`, `pathname === "/"`,
`search === ""` y `hash === ""`. En `entidad.ts`, `url_publica` entra a `CLAVES_ENTIDAD`,
`DatosEntidad`, `obtenerEntidad` y `guardarEntidad`; `obtenerUrlPublica` lee la clave.

- [ ] **Step 4: Pantallas**

`FormularioConfigDocumental.tsx`: sección **Distribución** con los nueve campos (`Campo` con ayuda
de una línea cada uno; los centímetros con el mismo patrón de coma o punto de los márgenes del
acta) y el esquema de `acciones-config-documental.ts` con sus campos
(`plazoRecibidoDias`, …, `selloFranjaCm`, `selloQrCm`). `FormularioEntidad.tsx`: campo
**Dirección de la plataforma** (`url_publica`), con la ayuda «Se imprime en el código QR de las
copias controladas. Sin ella, el sello sale sin QR.».

`tests/acciones-permisos.test.ts`: `ARCHIVOS_PANEL` añade `"src/app/acciones-distribucion.ts"`;
crear ese archivo con solo `"use server";` y un comentario de que la Tarea 6 lo llena.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/permisos.test.ts tests/url-publica.test.ts tests/config-documental.test.ts tests/config-documental-pantalla.test.tsx tests/entidad.test.ts tests/esquemas-entidad.test.ts tests/acciones-permisos.test.ts`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13b): permisos de distribución, configuración de plazos y sello, dirección pública de la plataforma"
```

---

### Tarea 3: Reglas puras de la distribución

**Files:**
- Create: `src/lib/distribucion/tipos.ts`, `src/lib/distribucion/copias.ts`,
  `src/lib/distribucion/acuses.ts`, `src/lib/distribucion/verificacion.ts`,
  `tests/distribucion-reglas.test.ts`

**Interfaces:**
- Produces (`src/lib/distribucion/tipos.ts`):
  - `ESTADOS_COPIA = ["emitida","recibida","por_recoger","recogida","anulada"] as const`, `EstadoCopia`;
    `MOTIVOS_POR_RECOGER = ["nueva_version","eliminado","carga_deshecha"]`, `MotivoPorRecoger`;
    `DESTINOS_RECOGIDA = ["devuelta","destruida","no_encontrada","retirada_en_verificacion"]`,
    `DestinoRecogida` (los dos primeros y `no_encontrada` los elige la persona; el cuarto lo pone
    el sistema); `MOTIVOS_ANULACION = ["error","extraviada","deteriorada"]`;
    `MOTIVOS_REIMPRESION = ["deteriorada","ilegible","extraviada_sin_entregar","otro"]`;
    `TIPOS_EVENTO_COPIA` (los ocho de la BD).
  - `ESTADOS_ACUSE`, `MODOS_ACUSE`, `ORIGENES_ACUSE`, `MODALIDADES_JORNADA`, `RESPUESTAS_ITEM`,
    `ORIGENES_ITEM` con sus tipos, y `ETIQUETA_ESTADO_COPIA`, `ETIQUETA_DESTINO`,
    `ETIQUETA_MODO_ACUSE`, `ETIQUETA_MODALIDAD`, `ETIQUETA_RESPUESTA` (texto de interfaz).
  - `VENTANA_IMPRESION_MS = 15 * 60_000`.
  - `class ErrorDistribucion extends ErrorTramite` (`@/db/consultas/flujo/contrato`): error de
    negocio cuyo mensaje se muestra; hereda para que `recibirArchivo` lo trate como 409.
- Produces (`copias.ts`):
  - `puedePasar(de: EstadoCopia, a: EstadoCopia): boolean` con exactamente estas aristas:
    `emitida→recibida`, `emitida→anulada`, `recibida→anulada`, `emitida→por_recoger`,
    `recibida→por_recoger`, `por_recoger→recogida`.
  - `numeroDeCopia(n: number): string` → `"02"` (dos dígitos; `100` → `"100"`).
  - `textoSello(d: { numero: number; codigo: string; version: number; punto: string; responsable: string; cargo: string | null; emitidaEn: Date; zona: string }): { titulo: string; detalle: string }`
    → `titulo = "COPIA CONTROLADA N.º 02"`,
    `detalle = "GTH-PR-02 v2 · Urgencias · Entregada a Luz Dary Ortiz, Enfermera Jefe · 12/11/2026"`
    (sin cargo: «Entregada a Luz Dary Ortiz»; fecha `dd/mm/aaaa` en `zona`).
  - `urlDeQr(urlPublica: string | null, codigo: string, version: number): string | null` →
    `"https://sgc.gov.co/documentos/GTH-PR-02?v=2"`; `null` sin `urlPublica`.
  - `enVentanaDeImpresion(abiertaEn: Date | null, ahora: Date): boolean` (`abiertaEn` nula →
    `false`; dentro si `ahora - abiertaEn < VENTANA_IMPRESION_MS`).
- Produces (`acuses.ts`):
  - `porcentaje(confirmados: number, pendientes: number): number | null` → entero redondeado
    sobre `confirmados + pendientes`; `null` si la suma es 0.
  - `acusadosPorFirma(firmantes: number[], audiencia: number[]): number[]` → los firmantes que
    están en la audiencia, sin repetir.
- Produces (`verificacion.ts`):
  - `ITEMS_FIJOS = ["Sin documentos obsoletos a la vista", "Sin copias no controladas (impresiones sin sello)", "El personal sabe consultar la plataforma"] as const`.
  - `type CopiaParaLista = { id: number; codigo: string; version: number; numero: number; estado: "emitida" | "recibida" | "por_recoger" }`;
    `armarListaDeChequeo(copias: CopiaParaLista[]): { origen: "copia" | "copia_por_recoger" | "fijo"; copiaId: number | null; texto: string }[]`
    → por cada copia viva **tres** filas en orden («GTH-PR-02 v2 · Copia N.º 02: está»,
    «…: legible», «…: es la versión vigente»), por cada `por_recoger` una («… (obsoleta): ya no
    está»), y los tres fijos al final; ordena las copias por código, versión y número.
  - `esConforme(items: { respuesta: "conforme" | "no_conforme" | "no_aplica" | null }[]): boolean`
    → `true` si ninguna es `no_conforme` (una `null` no decide; cerrar exige que no haya `null`,
    eso lo valida la consulta).
  - `conformidad(puntos: { conforme: boolean }[], umbral: number): { porcentaje: number | null; cumple: boolean | null }`.
  - `verificacionVencida(ultimaCerrada: Date | null, cadaDias: number, ahora: Date): boolean`
    (`null` → `true`).

- [ ] **Step 1: Tests que fallan**

`tests/distribucion-reglas.test.ts`, sin BD:

```ts
it("puedePasar: solo las seis aristas", () => {
  const ok = [["emitida","recibida"],["emitida","anulada"],["recibida","anulada"],["emitida","por_recoger"],["recibida","por_recoger"],["por_recoger","recogida"]];
  for (const de of ESTADOS_COPIA) for (const a of ESTADOS_COPIA)
    expect(puedePasar(de, a)).toBe(ok.some(([x, y]) => x === de && y === a));
});
it("textoSello", () => expect(textoSello({ numero: 2, codigo: "GTH-PR-02", version: 2, punto: "Urgencias", responsable: "Luz Dary Ortiz", cargo: "Enfermera Jefe", emitidaEn: new Date("2026-11-12T15:00:00Z"), zona: "America/Bogota" }))
  .toEqual({ titulo: "COPIA CONTROLADA N.º 02", detalle: "GTH-PR-02 v2 · Urgencias · Entregada a Luz Dary Ortiz, Enfermera Jefe · 12/11/2026" }));
it("urlDeQr", () => {
  expect(urlDeQr("https://sgc.gov.co", "GTH-PR-02", 2)).toBe("https://sgc.gov.co/documentos/GTH-PR-02?v=2");
  expect(urlDeQr(null, "GTH-PR-02", 2)).toBeNull();
});
it("enVentanaDeImpresion", () => {
  const t0 = new Date("2026-11-12T15:00:00Z");
  expect(enVentanaDeImpresion(null, t0)).toBe(false);
  expect(enVentanaDeImpresion(t0, new Date(t0.getTime() + 14 * 60_000))).toBe(true);
  expect(enVentanaDeImpresion(t0, new Date(t0.getTime() + 15 * 60_000))).toBe(false);
});
it("porcentaje", () => { expect(porcentaje(23, 11)).toBe(68); expect(porcentaje(0, 0)).toBeNull(); });
it("armarListaDeChequeo", () => {
  const lista = armarListaDeChequeo([
    { id: 9, codigo: "ATE-FO-02", version: 1, numero: 1, estado: "por_recoger" },
    { id: 7, codigo: "ATE-PR-01", version: 3, numero: 1, estado: "recibida" },
  ]);
  expect(lista.map((i) => i.texto)).toEqual([
    "ATE-PR-01 v3 · Copia N.º 01: está", "ATE-PR-01 v3 · Copia N.º 01: legible", "ATE-PR-01 v3 · Copia N.º 01: es la versión vigente",
    "ATE-FO-02 v1 · Copia N.º 01 (obsoleta): ya no está", ...ITEMS_FIJOS,
  ]);
  expect(lista[3]).toMatchObject({ origen: "copia_por_recoger", copiaId: 9 });
});
it("conformidad", () => {
  expect(conformidad([{ conforme: true }, { conforme: true }, { conforme: false }], 95)).toEqual({ porcentaje: 67, cumple: false });
  expect(conformidad([], 95)).toEqual({ porcentaje: null, cumple: null });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/distribucion-reglas.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar los cuatro módulos** con las firmas de **Produces**. `textoSello`
formatea la fecha con `Intl.DateTimeFormat("es-CO", { timeZone: zona, day: "2-digit", month: "2-digit", year: "numeric" })`
como `fechaCorta` de `marca-agua.ts`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/distribucion-reglas.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/distribucion tests/distribucion-reglas.test.ts
git commit -m "feat(f13b): reglas puras de copias, acuses y verificación"
```

---

### Tarea 4: Puntos de uso y visibilidad de la distribución

**Files:**
- Create: `src/db/consultas/distribucion/puntos-uso.ts`, `src/app/admin/acciones-puntos-uso.ts`,
  `src/lib/esquemas/distribucion.ts`,
  `src/app/(app)/admin/(panel)/puntos-uso/page.tsx`, `…/puntos-uso/nuevo/page.tsx`,
  `…/puntos-uso/[id]/page.tsx`, `src/componentes/distribucion/puntos/FormularioPuntoUso.tsx`,
  `tests/utiles/distribucion.ts`, `tests/puntos-uso.test.ts`, `tests/distribucion-visibilidad.test.ts`
- Modify: `src/lib/alcance.ts`, `src/db/consultas/usuarios.ts` (`cambiarActivo`),
  `src/app/(app)/admin/(panel)/usuarios/[id]/page.tsx`, `src/componentes/cascaron/navegacion.ts`,
  `tests/navegacion.test.ts`, `tests/usuarios.test.ts`

**Interfaces:**
- Consumes: `alcanceProcesos`, `puedeAccederDocumento` (`src/lib/alcance.ts`); `registrarAuditoria`
  (`src/db/consultas/admin.ts`); `traducirUnico` (`src/db/consultas/mapa-admin.ts`) para el 23505.
- Produces (`src/lib/alcance.ts`):
  - `puedeVerDistribucion(sesion: SujetoVisibilidad & { responsableDePuntos?: boolean }): boolean`
    → `puede(sesion, "distribucion.ver") || sesion.responsableDePuntos === true`.
  - `filtroPuntos(sql: Cliente, sesion: SujetoVisibilidad): Fragment` para un `WHERE` sobre
    `puntos_uso pu`: `true` para `admin_sgc`, `gerencia`, `control_interno`; para
    `lider_proceso`, `EXISTS` en `punto_uso_procesos` con sus procesos activos **o**
    `pu.responsable_id = <usuario>`; para `consulta`, solo `pu.responsable_id = <usuario>`.
- Produces (`puntos-uso.ts`):
  - `type PuntoUso = { id: number; nombre: string; sede: string | null; ubicacion: string | null; responsable: { id: number; nombre: string; cargo: string | null; activo: boolean }; procesos: { id: number; sigla: string; nombre: string }[]; activo: boolean; orden: number; copiasVivas: number }`.
  - `type DatosPuntoUso = { nombre: string; sede: string | null; ubicacion: string | null; responsableId: number; procesoIds: number[] }`.
  - `listarPuntosUso(sesion: SujetoVisibilidad, opciones?: { sql?: Cliente; soloActivos?: boolean }): Promise<PuntoUso[]>`
    (aplica `filtroPuntos`; orden por `orden`, `sede`, `nombre`).
  - `obtenerPuntoUso(id: number, sesion: SujetoVisibilidad, opciones?): Promise<PuntoUso | null>` (`null` si no lo ve).
  - `crearPuntoUso(datos: DatosPuntoUso, actorId: number, opciones?): Promise<{ id: number }>`;
    `editarPuntoUso(id, datos, actorId, opciones?)`; `alternarPuntoUso(id, activo: boolean, actorId, opciones?)`.
    Reglas: responsable activo; procesos activos; nombre único por sede (23505 → «Ya existe un
    punto de uso con ese nombre en esa sede»); **desactivar con copias vivas lanza**
    `ErrorDistribucion("El punto tiene N copias por recibir o por recoger: recójalas o anúlelas antes")`;
    **cambiar el responsable con copias vivas de un documento restringido que el nuevo no puede
    ver lanza** `ErrorDistribucion("El responsable nuevo no tiene acceso a <código>: recoja o anule esas copias antes")`
    (F13B-DC27). Auditoría `crear_punto_uso`, `editar_punto_uso` (antes/después),
    `activar_punto_uso`/`desactivar_punto_uso`.
  - `puntosDeResponsable(usuarioId: number, opciones?): Promise<{ id: number; nombre: string }[]>` (activos).
  - `esResponsableDePuntos(usuarioId: number, opciones?): Promise<boolean>`.
  - `copiasVivasDePunto(sql: Cliente, puntoId: number): Promise<{ id: number; codigo: string; documentoId: number }[]>`
    (estado en `emitida`, `recibida`, `por_recoger`; en esta tarea devuelve lo que haya en la tabla,
    que las Tareas 5 y 6 empiezan a llenar).
- Produces (`src/lib/esquemas/distribucion.ts`): `EsquemaPuntoUso`
  (`nombre` 2–80, `sede` 0–80 opcional, `ubicacion` 0–200 opcional, `responsableId` id,
  `procesoIds` con `lista(id)` de `esquemas/tramites.ts`), `EsquemaAlternar` (`activo: "true" | "false"`).
- Produces (`tests/utiles/distribucion.ts`):
  - `puntoDePrueba(tx: TransactionSql, d: { responsable: SesionFlujo; procesos?: string[]; nombre?: string; sede?: string }): Promise<{ id: number; nombre: string }>`
    (siglas de proceso; nombre único por corrida `zz_punto_<n>`).
- Produces (`navegacion.ts`): entradas `{ href: "/admin/puntos-uso", etiqueta: "Puntos de uso", grupo: "administracion", permiso: "distribucion.gestionar" }`
  y `{ href: "/admin/listas-distribucion", etiqueta: "Listas de distribución", grupo: "administracion", permiso: "distribucion.gestionar" }`
  después de Estructura (la página de listas llega en la Tarea 7; la entrada se añade aquí para
  no tocar dos veces los conteos del test). Íconos nuevos `puntos` y `listas` en `IconoNav` y en el
  mapa de íconos del cascarón (`MapPin`, `ListChecks` de lucide).
- Produces (`usuarios.ts`): `cambiarActivo(id, false, actorId)` lanza
  `Error("La persona es responsable de N puntos de uso activos: reasígnelos antes de desactivarla")`;
  la página de la persona lista esos puntos con enlace.

- [ ] **Step 1: Tests que fallan**

`tests/puntos-uso.test.ts` (BD, en `revertida`):

```ts
it("crea, edita y lista con alcance", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const resp = await usuarioDePrueba(tx, { rol: "consulta" });
  const [{ id: ate }] = await tx`SELECT id FROM procesos WHERE sigla = 'ATE'`;
  const { id } = await crearPuntoUso({ nombre: `zz Farmacia ${Date.now()}`, sede: null, ubicacion: null, responsableId: resp.usuarioId, procesoIds: [ate] }, admin.usuarioId, { sql: tx });
  expect((await listarPuntosUso(await sesionDe(tx, "lider.cex"), { sql: tx })).map((p) => p.id)).not.toContain(id);   // CEX no alcanza ATE
  expect((await listarPuntosUso(resp, { sql: tx })).map((p) => p.id)).toEqual([id]);                                  // el responsable ve el suyo
  expect(await obtenerPuntoUso(id, await sesionDe(tx, "gerente"), { sql: tx })).toMatchObject({ responsable: { id: resp.usuarioId }, copiasVivas: 0 });
}));
it("el nombre es único por sede, sin distinguir mayúsculas", () => revertida(sql, async (tx) => { /* segundo crearPuntoUso con "FARMACIA" lanza con el mensaje */ }));
it("no se desactiva con copias vivas ni se desactiva a su responsable", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const resp = await usuarioDePrueba(tx, { rol: "consulta" });
  const punto = await puntoDePrueba(tx, { responsable: resp });
  await expect(cambiarActivo(resp.usuarioId, false, admin.usuarioId, { sql: tx })).rejects.toThrow(/responsable de 1 puntos de uso activos/);
  const doc = await documentoLibre(tx, { proceso: "ATE", tipo: "PR" });
  const [v] = await tx`SELECT id FROM documento_versiones WHERE documento_id = ${doc.id}`;
  await tx`INSERT INTO copias_controladas (version_id, numero, punto_uso_id, responsable_id, responsable_nombre, emitida_por, hash_principal, emitida_en)
    VALUES (${v.id}, 1, ${punto.id}, ${resp.usuarioId}, 'Prueba', ${admin.usuarioId}, 'x', now())`;
  await expect(alternarPuntoUso(punto.id, false, admin.usuarioId, { sql: tx })).rejects.toThrow(/1 copias por recibir o por recoger/);
}));
it("el responsable nuevo debe ver los restringidos con copias vivas", () => revertida(sql, async (tx) => { /* documento restringido de ATE, copia viva, editar con responsable sin procesos → lanza con el código */ }));
```

`cambiarActivo` hoy no recibe `opciones`: añadirle `opciones?: { sql?: Cliente }` como las demás
consultas (el test lo necesita).

`tests/distribucion-visibilidad.test.ts`: `puedeVerDistribucion` por rol y con
`responsableDePuntos`; `filtroPuntos` para un líder de ATE ve el punto de ATE y no el de GTH, y ve
uno de GTH si es su responsable.

`tests/navegacion.test.ts`: el admin ve **17** entradas; `consulta` sigue viendo dos; «Puntos de
uso» y «Listas de distribución» están en Administración solo para `admin_sgc`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/puntos-uso.test.ts tests/distribucion-visibilidad.test.ts tests/navegacion.test.ts`
Expected: FAIL.

- [ ] **Step 3: Consultas, alcance y acciones**

`alcance.ts` con `puedeVerDistribucion` y `filtroPuntos`. `puntos-uso.ts` con las funciones de
**Produces**; `copiasVivasDePunto` consulta `copias_controladas` por estado. Acciones
`crearPuntoUsoAccion`, `editarPuntoUsoAccion`, `alternarPuntoUsoAccion` con
`mutacion(formData, "distribucion.gestionar", …)` y redirección a `/admin/puntos-uso`.

- [ ] **Step 4: Pantallas**

`/admin/puntos-uso`: `TablaDatos` (nombre y sede, procesos, responsable, copias vivas, estado con
`Insignia`), botón «Nuevo punto de uso», filas inactivas como en Estructura (F12-D42). `/nuevo` y
`/[id]`: `FormularioPuntoUso` (`Campo` por campo; responsable con `<select>` de usuarios activos
ordenados por nombre; procesos con casillas; en `/[id]`, «Desactivar»/«Activar» con `FormAccion`).
Atajo «Crear desde un subproceso» (`?subproceso=<id>` prellena nombre y proceso, F13B-DC18).
`usuarios/[id]/page.tsx`: lista «Responsable de los puntos de uso: …» con enlaces, y el error de
`cambiarActivo` llega por `mutacion` como hoy. Cada página con `exigirPermiso("distribucion.gestionar")`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/puntos-uso.test.ts tests/distribucion-visibilidad.test.ts tests/navegacion.test.ts tests/usuarios.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13b): catálogo de puntos de uso con responsable, alcance y entradas de la barra"
```

---

### Tarea 5: Copias controladas — emisión, sello, ventana de impresión, reimpresión y anulación

**Files:**
- Create: `src/lib/distribucion/sello-pdf.ts`, `src/db/consultas/distribucion/copias.ts`,
  `src/app/(app)/distribucion/copias/[id]/pdf/route.ts`,
  `src/app/(app)/distribucion/copias/[id]/reimprimir/route.ts`, `tests/sello-pdf.test.ts`,
  `tests/copias.test.ts`, `tests/copias-rutas.test.ts`
- Modify: `tests/utiles/distribucion.ts`, `tests/handlers-permisos.test.ts`, `tests/proxy-matcher.test.ts`

**Interfaces:**
- Consumes: `textoSello`, `urlDeQr`, `enVentanaDeImpresion`, `numeroDeCopia`, `puedePasar`
  (Tarea 3); `obtenerUrlPublica`, `obtenerMarcaSegura` (color primario); `ConfigDocumental.distribucion`
  (Tarea 2); `puedeAccederDocumento`, `alcanceProcesos`, `filtroPuntos` (Tarea 4);
  `huellaDeArchivo` (`src/lib/huella.ts`); `textoParaFuente` (`src/lib/texto-pdf.ts`);
  `resolverRutaAlmacen`; `crearLimitador`; `origenValido`; `sesionDePeticion`.
- Produces (`sello-pdf.ts`):
  - `imagenQr(url: string): Promise<Uint8Array>` → PNG con `QRCode.toBuffer(url, { type: "png", margin: 1, errorCorrectionLevel: "M", scale: 6 })`.
  - `estamparCopiaControlada(pdf: Uint8Array, d: { titulo: string; detalle: string; qr: string | null; colorHex: string; franjaCm: number; qrCm: number }): Promise<Uint8Array>`:
    en **cada página**, un rectángulo de `franjaCm` de alto pegado al borde inferior, de ancho
    completo, relleno con `colorHex`; `titulo` en Helvetica-Bold y `detalle` en Helvetica, blancos,
    centrados verticalmente en la franja, con el tamaño que quepa (máximo 9 pt, mínimo 6 pt;
    `detalle` se recorta con «…» si aun a 6 pt no cabe); si `qr` no es nulo, la imagen PNG de
    `qrCm` de lado en la esquina inferior derecha, apoyada sobre la franja, con fondo blanco de
    0,15 cm alrededor. Lanza si el PDF no se puede abrir (cifrado o dañado). Ambos textos pasan
    por `textoParaFuente`.
- Produces (`copias.ts`):
  - `type Copia = { id: number; versionId: number; documentoId: number; codigo: string; titulo: string; version: number; numero: number; punto: { id: number; nombre: string; sede: string | null }; responsable: { id: number; nombre: string; cargo: string | null }; responsableActual: { id: number; nombre: string }; emitidaPor: { id: number; nombre: string }; emitidaEn: Date; estado: EstadoCopia; nota: string | null; hashPrincipal: string; reemplazaCopiaId: number | null; versionVigente: boolean; venceEn: Date | null; fechas: { recibidaEn: Date | null; porRecogerEn: Date | null; recogidaEn: Date | null; anuladaEn: Date | null }; motivoPorRecoger: MotivoPorRecoger | null; destinoRecogida: DestinoRecogida | null; motivoAnulacion: string | null }`.
  - `type EventoCopia = { tipo: TipoEventoCopia; usuario: string | null; creadoEn: Date; detalle: Record<string, unknown> }`.
  - `emitirCopia(sesion: SesionFlujo, d: { documentoId: number; puntoUsoId: number; nota: string | null; reemplazaCopiaId?: number }, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ copiaId: number; numero: number }>`.
    Exige `copias.emitir` y, para `lider_proceso`, que algún proceso del documento esté en su
    alcance (si no, `ErrorDistribucion("El documento no existe")`); versión vigente del documento
    (`FOR UPDATE` sobre ella) o `ErrorDistribucion("El documento no tiene versión vigente")`;
    principal `application/pdf` o `ErrorDistribucion("Para emitir copias controladas el archivo principal debe ser PDF")`;
    punto activo; si el documento es restringido, `puedeAccederDocumento(documentoId, responsable)`
    o `ErrorDistribucion("El responsable de <punto> no tiene acceso a este documento")`;
    `reemplazaCopiaId` debe ser una copia `por_recoger` del mismo documento y punto. Número =
    `max(numero) + 1` de la versión. Estado `recibida` si `sesion.usuarioId === responsable_id`
    (evento `emitida` con `detalle.recibidaEnElActo: true` y evento `recibida`), si no `emitida`
    con `vence_en = fechaLimite(ahora, plazoRecibidoDias, zona)`. `ultima_apertura_en = ahora`
    (abre la ventana). Auditoría `copia_emitida` (`detalle`: código, versión, número, punto).
    Aviso `distribucion.copia` al responsable si no es quien emite, con enlace
    `/distribucion/copias/<id>`.
  - `obtenerCopia(id: number, sesion: SesionFlujo, opciones?): Promise<(Copia & { eventos: EventoCopia[]; acciones: ("recibir" | "recoger" | "anular" | "reimprimir" | "pdf")[] }) | null>`:
    `null` si la persona no la ve (§6.4: `distribucion.ver` con alcance, o responsable del
    punto, o quien emitió). `acciones` sale del estado, del permiso y de la persona (`pdf` solo
    si `versionVigente` y estado `emitida` o `recibida`).
  - `copiaParaPdf(id: number, sesion: SesionFlujo, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ ok: true; bytes: Uint8Array; nombre: string } | { ok: false; estado: 404 | 409 }>`:
    404 si no la ve; 409 si la versión no está vigente, la copia no está en `emitida`/`recibida`,
    o la huella del principal en disco no coincide con `hash_principal`. Si quien pide puede
    emitir (`copias.emitir` con alcance): dentro de la ventana registra `impresa` **solo si no
    hay ya un evento `impresa` o `reimpresa` posterior a `ultima_apertura_en`** y devuelve el
    PDF; fuera de la ventana devuelve `{ ok: false, estado: 409 }`. Si solo tiene
    `distribucion.ver`: registra `consultada` y devuelve el PDF siempre. Genera con
    `estamparCopiaControlada` usando `textoSello`, `urlDeQr(obtenerUrlPublica(), …)`, el primario
    de la marca y `selloFranjaCm`/`selloQrCm`. `nombre = "<codigo>-v<n>-copia-<nn>.pdf"`.
  - `reimprimirCopia(id: number, sesion: SesionFlujo, motivo: MotivoReimpresion, texto: string | null, opciones?): Promise<void>`:
    `copias.emitir` con alcance, estado `emitida` o `recibida`, versión vigente; `motivo = "otro"`
    exige `texto`; pone `ultima_apertura_en = ahora`, evento `reimpresa` con el motivo, auditoría
    `copia_reimpresa`.
  - `anularCopia(id: number, sesion: SesionFlujo, motivo: MotivoAnulacion, texto: string | null, opciones?): Promise<void>`:
    quien emitió o `distribucion.gestionar`; `puedePasar(estado, "anulada")` o
    `ErrorDistribucion("La copia ya no está en ese estado")`; evento `anulada`, auditoría
    `copia_anulada`, aviso al responsable si estaba `emitida`.
  - `listarCopias(sesion: SesionFlujo, filtro: { puntoId?: number; documentoId?: number; estado?: "vivas" | "por_recoger" | "sin_recibido" | "anuladas" | "todas" }, opciones?): Promise<Copia[]>`
    (aplica `filtroPuntos` y, para el líder, además las copias de documentos de su alcance).
  - `conteosPorPunto(sesion, opciones?): Promise<{ puntoId: number; nombre: string; sede: string | null; vivas: number; porRecoger: number; sinRecibido: number }[]>`.
- Produces (`tests/utiles/distribucion.ts`):
  - `vigenteConPdf(tx, d: { proceso: string; tipo: string; restringido?: boolean }): Promise<{ documento: DocumentoLibre; versionId: number; hash: string; limpiar: () => Promise<void> }>`:
    `documentoLibre` + borra su fila falsa de `archivos` + `archivoPrincipal(tx, versionId)`
    (PDF real de dos páginas con `pdfDePrueba([[612, 792], [612, 792]])`).
  - `copiaDePrueba(tx, d: { emisor: SesionFlujo; documento: DocumentoLibre; punto: { id: number }; ahora?: Date }): Promise<{ copiaId: number; numero: number }>` (llama `emitirCopia`).
- Rutas:
  - `GET /distribucion/copias/[id]/pdf`: `sesionDePeticion` (401), límite 60/min por usuario
    (429), `copiaParaPdf`: 404 → `respuesta404()`; 409 → JSON `{ error: "La ventana de impresión terminó. Use «Reimprimir» para volver a imprimir esta copia." }`
    con `status: 409`; ok → `application/pdf`, `Content-Disposition: inline; filename*=…`,
    `Cache-Control: no-store`.
  - `POST /distribucion/copias/[id]/reimprimir`: cuerpo `application/x-www-form-urlencoded`
    (`motivo`, `texto`), `origenValido` (403), `reimprimirCopia` y luego la misma respuesta
    PDF de `copiaParaPdf` (ya dentro de la ventana nueva). Un error de negocio responde 409 con
    el mensaje. Fuera del `matcher` no hace falta: el cuerpo es pequeño.

- [ ] **Step 1: Tests que fallan**

`tests/sello-pdf.test.ts` (sin BD; `contieneTexto` y `contenidoPorPagina` de `tests/utiles/pdf.ts`):

```ts
it("estampa la franja y el QR en cada página", async () => {
  const pdf = await pdfDePrueba([[612, 792], [612, 792]]);
  const salida = await estamparCopiaControlada(pdf, { titulo: "COPIA CONTROLADA N.º 02", detalle: "GTH-PR-02 v2 · Urgencias · Entregada a Luz Dary Ortiz · 12/11/2026", qr: "https://sgc.gov.co/documentos/GTH-PR-02?v=2", colorHex: "#1b4e8e", franjaCm: 1, qrCm: 1.5 });
  const doc = await PDFDocument.load(salida);
  expect(doc.getPageCount()).toBe(2);
  for (const pagina of await contenidoPorPagina(salida)) expect(contieneTexto(pagina, "COPIA CONTROLADA N")).toBe(true);
  expect(doc.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"))).toBeDefined();   // la imagen del QR
});
it("sin QR no incrusta imagen y con nombre largo recorta", async () => { /* qr: null → sin XObject; detalle de 300 caracteres → termina en "…" (leer el contenido) */ });
it("un PDF protegido lanza", async () => { await expect(estamparCopiaControlada(await pdfProtegido(), { /* … */ })).rejects.toThrow(); });
```

`tests/copias.test.ts` (BD, `revertida`, `ALMACEN_RUTA` a una carpeta temporal como en
`tests/acta.test.ts`):

```ts
it("emite con número por versión, abre la ventana y avisa al responsable", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const resp = await usuarioDePrueba(tx, { rol: "consulta" });
  const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
  const { documento, hash, limpiar } = await vigenteConPdf(tx, { proceso: "GTH", tipo: "PR" });
  try {
    const a = await emitirCopia(admin, { documentoId: documento.id, puntoUsoId: punto.id, nota: null }, { sql: tx, ahora: T0 });
    const b = await emitirCopia(admin, { documentoId: documento.id, puntoUsoId: punto.id, nota: "segunda" }, { sql: tx, ahora: T0 });
    expect([a.numero, b.numero]).toEqual([1, 2]);
    const copia = await obtenerCopia(a.copiaId, resp, { sql: tx });
    expect(copia).toMatchObject({ estado: "emitida", hashPrincipal: hash, numero: 1, acciones: ["recibir"] });
    expect(copia?.venceEn).toEqual(fechaLimite(T0, 3, zonaHoraria()));
    const [aviso] = await tx`SELECT tipo, enlace FROM notificaciones WHERE usuario_id = ${resp.usuarioId} ORDER BY id DESC LIMIT 1`;
    expect(aviso).toMatchObject({ tipo: "distribucion.copia", enlace: `/distribucion/copias/${a.copiaId}` });
  } finally { await limpiar(); }
}));
it("quien emite y es responsable la recibe en el acto", …);  // estado recibida, dos eventos, sin aviso
it("rechaza sin PDF, sin vigente, punto inactivo, restringido que el responsable no ve y líder fuera de alcance", …);
it("la ventana de impresión: dentro, una sola impresa; fuera, 409; quien solo ve, consultada", () => revertida(sql, async (tx) => {
  /* emitir en T0; copiaParaPdf(admin, T0+1min) ok e `impresa`; otra vez T0+2min ok sin nuevo evento;
     T0+16min → { ok: false, estado: 409 }; reimprimirCopia(motivo "deteriorada") en T0+20min → copiaParaPdf ok y evento `reimpresa` + `impresa`;
     control.interno → ok con evento `consultada` aunque esté fuera de la ventana */
}));
it("anular: solo desde emitida o recibida, por quien emitió o quien gestiona", …);
it("el PDF sellado trae el QR con url_publica y sale sin QR sin ella", …);   // escribe la clave en la transacción y la restaura al revertir
```

`tests/copias-rutas.test.ts` y `tests/handlers-permisos.test.ts`: `GET …/pdf` responde 401 sin
sesión, 404 a `consulta` ajeno, 200 `application/pdf` al emisor dentro de la ventana, 409 fuera;
`POST …/reimprimir` sin `Origin` → 403, con motivo → 200 PDF. `tests/proxy-matcher.test.ts`:
`/distribucion/copias/5/pdf` y `/distribucion/copias/5/reimprimir` **pasan** por el proxy.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/sello-pdf.test.ts tests/copias.test.ts tests/copias-rutas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Sello, consultas y rutas** con las firmas de **Produces**. En `copias.ts`, toda
escritura va en `enTransaccion` con `SELECT … FOR UPDATE` sobre la copia (o la versión al emitir)
y comprobación del estado esperado con `puedePasar`; cada paso inserta en `copia_eventos`
mediante una sola función `evento(tx, copiaId, tipo, usuarioId, detalle)`.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/sello-pdf.test.ts tests/copias.test.ts tests/copias-rutas.test.ts tests/handlers-permisos.test.ts tests/proxy-matcher.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Prueba manual del sello con los PDF del hospital**

Con `npx tsx` y un guion desechable (no se versiona): leer
`SGC-FO-0XX Acta_Control_Documental.pdf` de la raíz, pasarlo por `estamparCopiaControlada` con los
defectos (1,0 y 1,5 cm) y abrir el resultado: la franja no debe pisar el pie del formato y el QR
debe leerse con un celular. Si la franja pisa el pie, ajustar los **defectos** en la Tarea 2 y
anotarlo en el commit. Si el pie del hospital queda a menos de 1 cm del borde, dejarlo escrito
para el usuario en el cierre (§Avisos).

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13b): emisión de copias controladas con sello y QR, ventana de impresión, reimpresión y anulación"
```

---

### Tarea 6: La vida de la copia — recibido, recogida automática, reemplazo, pantalla «Distribución» y tareas

**Files:**
- Create: `src/db/consultas/distribucion/version-vigencia.ts`, `src/db/consultas/distribucion/tareas.ts`,
  `src/app/(app)/distribucion/page.tsx`, `src/app/(app)/distribucion/copias/page.tsx`,
  `src/app/(app)/distribucion/copias/[id]/page.tsx`, `src/componentes/distribucion/PestanasDistribucion.tsx`,
  `src/componentes/distribucion/copias/{TablaCopias,ListaPuntos,DialogoEmitir,AccionesCopia,HistorialCopia}.tsx`,
  `src/componentes/distribucion/BloqueDistribucion.tsx` (fichas), `tests/copias-recogida.test.ts`,
  `tests/distribucion-tareas.test.ts`, `tests/distribucion-pantallas.test.tsx`
- Modify: `src/app/acciones-distribucion.ts`, `src/db/consultas/distribucion/copias.ts`,
  `tests/utiles/distribucion.ts`, `src/db/consultas/admin.ts` (`aplicarPublicacion`, `anularVigenteEn`, `deshacerCarga`),
  `src/db/consultas/flujo/cierre.ts` (pasa `nuevaVersionId`), `src/lib/tareas.ts`,
  `src/componentes/cascaron/navegacion.ts`, `src/componentes/cascaron/Cascaron.tsx`,
  `src/componentes/cascaron/BarraLateral.tsx`, `src/app/(app)/page.tsx`, `tests/tareas.test.ts`,
  `tests/cascaron.test.tsx`, `tests/inicio.test.tsx`,
  `src/app/(app)/documentos/[codigo]/page.tsx`, `src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx`,
  `src/lib/esquemas/distribucion.ts`, `tests/navegacion.test.ts`, `tests/publicar.test.ts`,
  `tests/tramites-cierre.test.ts`, `tests/camino-directo.test.ts`

**Interfaces:**
- Consumes: Tarea 5; `fechaLimite`; `crearNotificacion`; `supervisoresDe`; `misTareas` y `Tarea`
  (`src/lib/tareas.ts`); `TablaDatos`, `Insignia`, `Dialogo`, `Boton`, `Campo`, `EstadoVacio`.
- Produces (`version-vigencia.ts`):
  - `alDejarDeSerVigente(tx: TransactionSql, versionId: number, motivo: MotivoPorRecoger, ahora: Date, opciones?: { nuevaVersionId?: number; actorId?: number }): Promise<{ copiasPorRecoger: number }>`:
    marca `por_recoger` las copias `emitida`/`recibida` de la versión (`por_recoger_en = ahora`,
    `motivo_por_recoger`, `vence_en = fechaLimite(ahora, plazoRecogidaDias, zona)`, limpia
    `aviso_vencido_en`/`escalado_en`), evento `por_recoger` por copia (`detalle: { motivo, nuevaVersionId }`),
    aviso `distribucion.recoger` al **responsable actual del punto** («Recoja la copia N.º 03 de
    GBS-PR-01 v1 en Urgencias: la versión 2 es la vigente desde hoy» / «…: el documento fue
    eliminado» / «…: la carga se deshizo») con enlace a la copia. Las Tareas 8 y 11 le añaden los
    acuses y la socialización; por eso es el **único** punto de enganche.
  - Llamadas: `aplicarPublicacion` por cada versión que pasa a obsoleta
    (`motivo: "nueva_version"`, `nuevaVersionId: versionId`); `anularVigenteEn`
    (`"eliminado"`); `deshacerCarga` (`"carga_deshecha"`). Las tres reciben `ahora` (hoy
    `aplicarPublicacion` lo tiene; `anularVigenteEn` y `deshacerCarga` lo ganan como último
    parámetro opcional con `new Date()` por defecto).
- Produces (`copias.ts`, además de la Tarea 5):
  - `confirmarRecibido(id: number, sesion: SesionFlujo, opciones?: { sql?: Cliente; ahora?: Date }): Promise<void>`:
    `distribucion.responder` y ser el **responsable actual del punto**; `emitida → recibida`
    (`FOR UPDATE`, estado esperado, si no `ErrorDistribucion("La copia ya no está en ese estado")`);
    evento `recibida`; auditoría `copia_recibida`; limpia `vence_en`.
  - `confirmarRecogida(id, sesion, destino: "devuelta" | "destruida" | "no_encontrada", opciones?)`:
    responsable actual **o** `distribucion.gestionar`; `por_recoger → recogida`; evento
    `recogida` con el destino; auditoría `copia_recogida`; con `no_encontrada` llama
    `abrirHallazgoDeRecogida` (Tarea 12 lo define; aquí se deja la inserción directa en
    `hallazgos` con `origen = 'recogida'`, `descripcion = "La copia N.º nn de <código> v<n> no se encontró al recogerla"`,
    `responsable_id` el del punto, `vence_en = fechaLimite(ahora, plazoCorreccionDias, zona)` y
    aviso `distribucion.hallazgo`; la Tarea 12 la mueve a `hallazgos.ts` sin cambiar el comportamiento).
  - `confirmarReemplazo(idNueva: number, sesion, destino: "devuelta" | "destruida", opciones?)`:
    la copia nueva debe tener `reemplaza_copia_id`; en una transacción confirma el recibido de la
    nueva y la recogida de la vieja con el destino.
  - `reemplazarCopias(sesion, versionNuevaId: number, opciones?): Promise<{ emitidas: number }>`:
    `copias.emitir` con alcance; por cada copia `por_recoger` de las versiones anteriores del
    mismo documento cuyo punto no tenga ya una copia viva de la nueva, `emitirCopia` con
    `reemplazaCopiaId`; si la nueva no tiene principal PDF, `ErrorDistribucion("La versión nueva no tiene PDF: las copias anteriores se recogen sin reemplazo")`.
  - `copiasDeDocumento(documentoId: number, sesion, opciones?): Promise<{ vigentes: Copia[]; porRecoger: Copia[]; puedeReemplazar: boolean }>` para el bloque de las fichas.
- Produces (`tests/utiles/distribucion.ts`):
  - `copiaSobreVigente(tx: TransactionSql, d: { emisor: SesionFlujo; codigo: string; punto: { id: number }; ahora?: Date }): Promise<{ copiaId: number; numero: number; limpiar: () => Promise<void> }>`:
    cambia la fila falsa del principal de la versión vigente de `codigo` por un PDF real
    (`archivoPrincipal`) y emite una copia con `emitirCopia`. Sirve para los documentos que
    `tramiteEn` crea con `documentoLibre`.
- Produces (`distribucion/tareas.ts`):
  - `tareasDeCopias(sesion: SesionFlujo, opciones?): Promise<Tarea[]>`: para el responsable actual
    de cada punto, `copia:<id>` «Recibir la copia N.º 02 de GTH-PR-02 v2 en Urgencias» (`emitida`),
    «Recoger la copia N.º 03 de GBS-PR-01 v1 en Urgencias» (`por_recoger` sin reemplazo vivo) o
    «Recibir la copia N.º 01 de la v2 y retirar la N.º 03 de la v1 en Urgencias» (nueva `emitida`
    con `reemplaza_copia_id` a una `por_recoger`); `vence` = `vence_en`; `enlace`
    `/distribucion/copias/<id>`. `misTareas()` concatena `tareasDeCopias` tras las de trámites y
    **desde esta tarea devuelve `{ tareas: Tarea[]; total: number }`** (`total = tareas.length`
    hasta que la Tarea 14 añada la agrupación): `Cascaron.tsx`, la barra lateral
    (`tareas={total}`), `src/app/(app)/page.tsx` y los tests `tareas`, `cascaron` e `inicio` se
    ajustan aquí, una sola vez.
- Produces (`acciones-distribucion.ts`, `"use server"`): `emitirCopiaAccion`
  (`copias.emitir`; `EsquemaEmitirCopia`: `documentoId`, `puntoUsoId`, `nota` 0–200 opcional,
  `reemplazaCopiaId` opcional; redirige a `/distribucion/copias/<id>?imprimir=1`: una Server
  Action envía por `fetch` e ignora `target`, así que el PDF no puede abrirse en otra pestaña
  desde la acción; la página de la copia, con `?imprimir=1`, destaca el enlace «Abrir el PDF para
  imprimir» (`<a target="_blank">` a la ruta del PDF) y explica la ventana de 15 minutos),
  `confirmarRecibidoAccion` (`distribucion.responder`), `confirmarRecogidaAccion`
  (`distribucion.responder`; `EsquemaRecogida`: `destino`), `confirmarReemplazoAccion`,
  `anularCopiaAccion` (`copias.emitir`; `EsquemaAnulacion`: `motivo`, `texto` opcional),
  `reemplazarCopiasAccion` (`copias.emitir`; `versionId`).
- Produces (navegación): `{ href: "/distribucion", etiqueta: "Distribución", icono: "distribucion", grupo: "documentos", permiso: "distribucion.ver", siResponsable: true }`
  después de Trámites; `entradasVisibles` acepta `responsableDePuntos?: boolean`; `Cascaron.tsx`
  calcula `esResponsableDePuntos(sesion.usuarioId)` junto a `participaEnTramites`.
- Produces (pantallas):
  - `/distribucion` → `exigirSesion()`, `puedeVerDistribucion` o `notFound()`, `redirect("/distribucion/copias")`.
  - `/distribucion/copias`: `EncabezadoPagina` «Distribución» con «Emitir copia controlada»
    (`copias.emitir`; abre `DialogoEmitir`: documento con buscador por código entre los vigentes
    con PDF de su alcance, punto con los de sus procesos primero, nota); `PestanasDistribucion`
    (Copias controladas · Acuses de lectura · Socializaciones · Verificaciones; las tres últimas
    llegan en las Tareas 9, 11 y 13 y hasta entonces responden «Próximamente» con `EstadoVacio`,
    sin romper el guard); `ListaPuntos` (conteos) y `TablaCopias` con filtros `?estado=` y
    `?punto=`/`?documento=`, maqueta 4; a 390 px, tarjetas.
  - `/distribucion/copias/[id]`: datos, `HistorialCopia` y `AccionesCopia` (recibir, recoger con
    destino en `Dialogo`, reemplazo, anular con motivo, reimprimir con motivo → formulario `POST`
    al handler de la Tarea 5, abrir PDF).
  - `BloqueDistribucion` en las dos fichas: sección «Copias controladas» (`copiasDeDocumento`) con
    «Emitir copia controlada» y «Reemplazar las copias de la vN (k)»; visible con `copias.emitir`
    o `distribucion.ver` sobre el documento. Las secciones de acuses y socialización se añaden en
    las Tareas 9 y 11.

- [ ] **Step 1: Tests que fallan**

`tests/copias-recogida.test.ts`:

```ts
it("al publicar por trámite, las copias de la obsoleta pasan a por recoger con tarea y aviso", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
  try {
    const resp = await usuarioDePrueba(tx, { rol: "consulta" });
    const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["GTH"] });
    // La vigente del documento del trámite: su archivo falso se cambia por uno real para poder emitir.
    const { copiaId } = await copiaSobreVigente(tx, { emisor: t.admin, codigo: t.codigo, punto });
    await transicionar(t.admin, { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } }, opc(tx, "2026-11-20T15:00:00Z"));
    const copia = await obtenerCopia(copiaId, resp, { sql: tx });
    expect(copia).toMatchObject({ estado: "por_recoger", motivoPorRecoger: "nueva_version", versionVigente: false });
    expect(copia?.venceEn).toEqual(fechaLimite(new Date("2026-11-20T15:00:00Z"), 5, zonaHoraria()));
    expect((await tareasDeCopias(resp, { sql: tx })).map((x) => x.titulo)).toEqual([`Recoger la copia N.º 01 de ${t.codigo} v1 en ${punto.nombre}`]);
    expect((await tx`SELECT tipo FROM notificaciones WHERE usuario_id = ${resp.usuarioId} ORDER BY id DESC LIMIT 1`)[0].tipo).toBe("distribucion.recoger");
  } finally { await t.limpiar(); }
}));
it("lo mismo al ejecutar una eliminación y al deshacer una carga", …);   // motivos "eliminado" y "carga_deshecha"
it("recibido y recogida: solo el responsable actual; la segunda confirmación falla; cambiar el responsable traslada la tarea", …);
it("reemplazar emite una por punto, enlazada, y una sola tarea doble la resuelve", () => revertida(sql, async (tx) => {
  /* publicar v2 con PDF; reemplazarCopias → emitidas 1; tareasDeCopias(resp) tiene un solo título «Recibir la copia N.º 01 de la v2 y retirar la N.º 01 de la v1 en …»;
     confirmarReemplazo(nueva, resp, "devuelta") → nueva recibida, vieja recogida con destino devuelta */
}));
it("recogida «no se encontró» abre un hallazgo al responsable", …);
```

`tests/distribucion-tareas.test.ts`: `misTareas` de un responsable con una copia emitida trae la
tarea de copia después de las de trámites, con `id = "copia:<id>"` y `modulo = "documentos"`.
`tests/navegacion.test.ts`: «Distribución» después de Trámites; `consulta` la ve solo con
`responsableDePuntos`; admin ve 18. `tests/distribucion-pantallas.test.tsx`: render de
`TablaCopias` con una copia por estado (texto de la insignia: «Recibida 12 nov», «Sin recibido · 4
días», «Por recoger · 6 días») y de `AccionesCopia` según `acciones`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/copias-recogida.test.ts tests/distribucion-tareas.test.ts tests/navegacion.test.ts tests/distribucion-pantallas.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `alDejarDeSerVigente` y sus tres llamadas**, consultas de recibido, recogida,
reemplazo y tareas, acciones. Los tests heredados `publicar`, `tramites-cierre` y
`camino-directo` deben seguir en verde: la función no hace nada si la versión no tiene copias.

- [ ] **Step 4: Pantallas y navegación**, con la maqueta 4 como contenido. El `DialogoEmitir`
envía la acción y aterriza en la página de la copia con el enlace al PDF (ver **Produces**). El
diálogo de recogida de una copia que nunca se recibió preselecciona «devuelta al SGC» y lo explica
(spec §8.4), para que «no se encontró» no abra hallazgos falsos.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/copias-recogida.test.ts tests/distribucion-tareas.test.ts tests/navegacion.test.ts tests/distribucion-pantallas.test.tsx tests/publicar.test.ts tests/tramites-cierre.test.ts tests/camino-directo.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit y punto de control en navegador**

```bash
git add src tests
git commit -m "feat(f13b): recibido, recogida automática al cambiar de versión, reemplazo, pantalla Distribución y tareas de copias"
```

Punto de control del controlador con `npm run dev`: como `coordinadora.sgc`, crear un punto,
emitir una copia de un vigente con PDF (ver el sello y el QR si `url_publica` está), confirmar el
recibido con el responsable, publicar una versión nueva por el camino de la 13A y ver la copia por
recoger, la tarea y el reemplazo; a 390 px, la tabla en tarjetas.

---

### Tarea 7: Listas de distribución y audiencia del documento

**Files:**
- Create: `src/db/consultas/distribucion/listas.ts`, `src/db/consultas/distribucion/audiencia.ts`,
  `src/app/admin/acciones-listas.ts`, `src/app/(app)/admin/(panel)/listas-distribucion/page.tsx`,
  `…/listas-distribucion/nueva/page.tsx`, `…/listas-distribucion/[id]/page.tsx`,
  `src/componentes/distribucion/listas/FormularioLista.tsx`, `tests/listas-audiencia.test.ts`
- Modify: `src/lib/esquemas/distribucion.ts`, `src/componentes/admin/FormularioDocumento.tsx`,
  `src/app/admin/acciones.ts` (editar documento: datos de catálogo), `src/lib/esquemas/documentos.ts`,
  `src/db/consultas/admin.ts` (`editarCatalogo` o la función que hoy guarda el nivel de acceso),
  `tests/acciones-documentos.test.ts`, `tests/formulario-documento.test.tsx`

**Interfaces:**
- Consumes: `filtroAcceso` (`src/lib/alcance.ts`); `listarAreas`, `listarCargos`
  (`src/db/consultas/estructura.ts`); `registrarAuditoria`.
- Produces (`listas.ts`):
  - `type Miembro = { tipo: "area" | "cargo" | "proceso" | "usuario"; referenciaId: number; nombre: string }`;
    `type Lista = { id: number; nombre: string; descripcion: string | null; activa: boolean; miembros: Miembro[]; personas: number }`
    (`personas` = cuántas resuelve hoy).
  - `listarListas(opciones?: { sql?: Cliente; soloActivas?: boolean }): Promise<Lista[]>`;
    `obtenerLista(id, opciones?): Promise<(Lista & { resueltas: { id: number; nombre: string }[] }) | null>`.
  - `crearLista(datos: { nombre: string; descripcion: string | null; miembros: Omit<Miembro, "nombre">[] }, actorId, opciones?): Promise<{ id: number }>`;
    `editarLista(id, datos, actorId, opciones?)`; `alternarLista(id, activa, actorId, opciones?)`.
    Cada referencia debe existir y estar activa (área, cargo, proceso, usuario), si no
    `ErrorDistribucion("La referencia <tipo> <id> no existe o está inactiva")`; nombre único
    (23505 → «Ya existe una lista con ese nombre»). Auditoría `crear_lista`, `editar_lista`
    (antes/después), `activar_lista`/`desactivar_lista`.
  - `resolverLista(sql: Cliente, listaId: number): Promise<number[]>` → ids de usuarios **activos**:
    por área (cargo cuyo `area_id` es el área), por cargo, por proceso (`usuario_procesos`), por
    persona; sin repetir.
- Produces (`audiencia.ts`):
  - `audienciaDeDocumento(sql: Cliente, documentoId: number): Promise<number[]>` → personas
    activas con alguno de los procesos del documento (propietario y donde aplica; un subproceso
    cuenta por su proceso) ∪ `resolverLista` de cada lista **activa** asignada, **filtradas con**
    `filtroAcceso` del documento (un restringido solo a quien puede verlo); ordenadas.
  - `listasDeDocumento(sql, documentoId): Promise<{ id: number; nombre: string; activa: boolean }[]>`.
  - `guardarAudiencia(documentoId: number, d: { listaIds: number[]; lecturaObligatoriaIngreso: boolean }, actorId: number, opciones?): Promise<void>`:
    reescribe `documento_listas` y la marca; auditoría `editar_documento` con `despues.listas` y
    `despues.lecturaObligatoriaIngreso` (reutiliza la acción existente de datos de catálogo).
- Produces (esquemas): `EsquemaLista` (`nombre` 2–80, `descripcion` 0–300 opcional, `miembros`
  como `lista(z.string().regex(/^(area|cargo|proceso|usuario):[1-9]\d*$/))`, al menos uno);
  `EsquemaDocumentoCatalogo` gana `listaIds` (`lista(id)`, opcional) y
  `lecturaObligatoriaIngreso` (`z.literal("on").optional()`).

- [ ] **Step 1: Tests que fallan**

`tests/listas-audiencia.test.ts` (BD, `revertida`):

```ts
it("resuelve una lista por área, cargo, proceso y persona, sin repetir y solo activos", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
  const a = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
  const b = await usuarioDePrueba(tx, { rol: "consulta" });
  const inactivo = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
  await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
  const { id } = await crearLista({ nombre: `zz lista ${Date.now()}`, descripcion: null, miembros: [{ tipo: "proceso", referenciaId: gth }, { tipo: "usuario", referenciaId: b.usuarioId }, { tipo: "usuario", referenciaId: a.usuarioId }] }, admin.usuarioId, { sql: tx });
  const ids = await resolverLista(tx, id);
  expect(ids).toContain(a.usuarioId); expect(ids).toContain(b.usuarioId); expect(ids).not.toContain(inactivo.usuarioId);
  expect(new Set(ids).size).toBe(ids.length);
}));
it("la audiencia une procesos y listas y respeta el nivel de acceso", () => revertida(sql, async (tx) => {
  const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
  const dentro = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
  const fuera = await usuarioDePrueba(tx, { rol: "consulta" });
  const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
  const admin = await sesionAdmin(tx);
  const { id: lista } = await crearLista({ nombre: `zz ${Date.now()}`, descripcion: null, miembros: [{ tipo: "usuario", referenciaId: fuera.usuarioId }] }, admin.usuarioId, { sql: tx });
  await guardarAudiencia(doc.id, { listaIds: [lista], lecturaObligatoriaIngreso: false }, admin.usuarioId, { sql: tx });
  expect(await audienciaDeDocumento(tx, doc.id)).toEqual(expect.arrayContaining([dentro.usuarioId, fuera.usuarioId]));
  await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${doc.id}`;
  const restringida = await audienciaDeDocumento(tx, doc.id);
  expect(restringida).toContain(dentro.usuarioId); expect(restringida).not.toContain(fuera.usuarioId);   // la lista no abre lo restringido
}));
it("una referencia inactiva o inexistente se rechaza; el nombre es único", …);
```

`tests/formulario-documento.test.tsx`: el formulario de edición trae las casillas de listas y
«Lectura obligatoria al ingresar al proceso». `tests/acciones-documentos.test.ts`: la acción de
catálogo guarda `listaIds` y la marca.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/listas-audiencia.test.ts tests/formulario-documento.test.tsx tests/acciones-documentos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Consultas y acciones** con las firmas de **Produces**; `audienciaDeDocumento` en una
sola consulta SQL con `UNION` y el `filtroAcceso` evaluado por persona (una subconsulta
`EXISTS` con `acceso_up.usuario_id = u.id`, variante de `filtroAcceso` que recibe la columna de
usuario en vez del sujeto: añadir `filtroAccesoDe(sql, columnaUsuario: Fragment)` en `alcance.ts`).

- [ ] **Step 4: Pantallas**: `/admin/listas-distribucion` (tabla con nombre, miembros resumidos,
personas que resuelve, estado), `/nueva` y `/[id]` con `FormularioLista` (miembros en cuatro
grupos de casillas: áreas, cargos agrupados por área, procesos, personas con buscador por nombre),
«Desactivar»; detalle con «Resuelve hoy a N personas» y la lista de nombres. En «Editar documento»
del panel, bloque **Distribución** con las casillas de listas activas y la marca de ingreso. Cada
página con `exigirPermiso("distribucion.gestionar")`.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/listas-audiencia.test.ts tests/formulario-documento.test.tsx tests/acciones-documentos.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13b): listas de distribución y audiencia del documento como dato de catálogo"
```

---

### Tarea 8: Acuses de lectura — creación al publicar, tarea y confirmación

**Files:**
- Create: `src/db/consultas/distribucion/acuses.ts`, `src/app/(app)/acuses/page.tsx`,
  `src/app/(app)/acuses/[id]/page.tsx`, `src/componentes/distribucion/acuses/{TareaAcuse,ListaAcusesPropios}.tsx`,
  `tests/acuses.test.ts`, `tests/acuses-pantalla.test.tsx`
- Modify: `src/db/consultas/flujo/cierre.ts` (`publicarVersion`), `src/db/consultas/distribucion/version-vigencia.ts`,
  `src/db/consultas/distribucion/tareas.ts`, `src/app/acciones-distribucion.ts`,
  `src/lib/esquemas/distribucion.ts`, `tests/distribucion-tareas.test.ts`, `tests/tramites-cierre.test.ts`

**Interfaces:**
- Consumes: `audienciaDeDocumento` (Tarea 7); `acusadosPorFirma`, `porcentaje` (Tarea 3);
  `listarFirmas` (`src/db/consultas/firmas.ts`); `fechaLimite`; `crearNotificacion`;
  `eventos_consulta` (vista o descarga por versión y persona).
- Produces (`acuses.ts`):
  - `type Acuse = { id: number; versionId: number; documentoId: number; codigo: string; titulo: string; version: number; usuarioId: number; origen: OrigenAcuse; estado: EstadoAcuse; modo: ModoAcuse | null; jornadaId: number | null; creadoEn: Date; venceEn: Date; confirmadoEn: Date | null; porQue: string; queCambio: string | null; publicadoEn: Date | null; abierto: boolean }`
    (`porQue`: «pertenece al proceso X» o «está en la lista Y»; `queCambio`: `resumen_cambios`;
    `abierto`: hay vista o descarga de esa versión por esa persona).
  - `crearAcusesAlPublicar(tx: TransactionSql, versionId: number, ahora: Date): Promise<{ creados: number; porFirma: number }>`:
    audiencia del documento; firmantes de la ronda (`elaboro`, `reviso`, `aprobo`, `publico`)
    que estén en la audiencia nacen `confirmado` con `modo = 'firma'` y `confirmado_en = ahora`;
    los demás `pendiente` con `vence_en = fechaLimite(ahora, plazoAcuseDias, zona)`; un evento
    `creado` (y `confirmado` para los de firma) por fila; aviso `distribucion.acuse` a cada
    pendiente («GTH-PR-02 v2 Inducción y reinducción: confirme su lectura», enlace
    `/acuses/<id>`). Origen `publicacion`. Se llama desde `publicarVersion` después de
    `aplicarPublicacion`, dentro de la transacción.
  - `superarAcuses(tx, versionId, ahora, motivo: MotivoPorRecoger): Promise<number>`: pendientes →
    `superado` (`cerrado_en`, `motivo_cierre`), evento `superado`. Se llama desde
    `alDejarDeSerVigente`.
  - `confirmarLectura(id: number, sesion: SesionFlujo, opciones?: { sql?: Cliente; ahora?: Date }): Promise<void>`:
    `acuses.confirmar`; la fila debe ser de `sesion.usuarioId` (si no, `ErrorDistribucion("La tarea no existe")`),
    `pendiente` (si no, `ErrorDistribucion("Esta lectura ya no está pendiente")`), con vista o
    descarga registrada (si no, `ErrorDistribucion("Abra el documento antes de confirmar la lectura")`);
    `confirmado` con `modo = 'individual'`, evento `confirmado`, **auditoría `acuse_lectura`**
    (`detalle`: código, versión). `FOR UPDATE` y estado esperado.
  - `obtenerAcuse(id, sesion, opciones?): Promise<Acuse | null>` (solo el destinatario; `null` si no).
  - `acusesPendientesDe(usuarioId, opciones?): Promise<Acuse[]>`; `acusesDeVersion(versionId, opciones?): Promise<{ confirmados: number; pendientes: number; porcentaje: number | null }>`.
- Produces (`distribucion/tareas.ts`): `tareasDeAcuses(sesion, opciones?): Promise<Tarea[]>`
  (`acuse:<id>`, «Confirmar lectura de GTH-PR-02 v2», detalle el título, `vence`, enlace
  `/acuses/<id>`); `misTareas()` la concatena.
- Produces (`version-vigencia.ts`): `alDejarDeSerVigente` llama `superarAcuses`.
- Produces (acciones): `confirmarLecturaAccion` (`acuses.confirmar`; `EsquemaConfirmarLectura`:
  `confirmo: z.literal("on")` con mensaje «Marque la casilla para confirmar»; redirige a `/`).
- Produces (pantallas): `/acuses/[id]` → `exigirSesion()`, `obtenerAcuse` o `notFound()`;
  `TareaAcuse` (maqueta 2): «Qué cambió» (o «Versión N, vigente desde <fecha>» / «Documento
  nuevo»), «Le llega porque», enlace «Abrir el documento» a `/documentos/<codigo>`, casilla y botón
  deshabilitado mientras `!abierto` con el texto «Abra el documento para habilitar la
  confirmación»; confirmado: «Lectura confirmada el <fecha>». `/acuses` → `ListaAcusesPropios`
  (pendientes y confirmados de la persona; es el destino de la agrupación de la Tarea 14).

- [ ] **Step 1: Tests que fallan**

`tests/acuses.test.ts`:

```ts
it("al publicar nacen los acuses de la audiencia; los firmantes, por firma", () => revertida(sql, async (tx) => {
  const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
  const lectora = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth] });
  const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });   // elabora lider.gth (está en GTH)
  try {
    await transicionar(t.admin, { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } }, opc(tx, "2026-11-20T15:00:00Z"));
    const filas = await tx`SELECT usuario_id, estado, modo FROM acuses WHERE version_id = ${t.versionId}`;
    expect(filas.find((f) => Number(f.usuario_id) === lectora.usuarioId)).toMatchObject({ estado: "pendiente", modo: null });
    expect(filas.find((f) => Number(f.usuario_id) === t.elaborador.usuarioId)).toMatchObject({ estado: "confirmado", modo: "firma" });
    expect(filas.some((f) => Number(f.usuario_id) === t.admin.usuarioId)).toBe(false);          // el admin no tiene procesos: no está en la audiencia
    const [acuse] = await acusesPendientesDe(lectora.usuarioId, { sql: tx });
    expect(acuse.venceEn).toEqual(fechaLimite(new Date("2026-11-20T15:00:00Z"), 15, zonaHoraria()));
    expect((await tareasDeAcuses(lectora, { sql: tx }))[0].titulo).toBe(`Confirmar lectura de ${t.codigo} v2`);
  } finally { await t.limpiar(); }
}));
it("confirmar exige ser el destinatario, estar pendiente y haber abierto el documento", () => revertida(sql, async (tx) => {
  /* sin eventos_consulta → rejects "Abra el documento…"; insertar vista (tipo 'vista', version_id, usuario_id) → ok, auditoría acuse_lectura, evento confirmado;
     otra persona → rejects "La tarea no existe"; segunda confirmación → "Esta lectura ya no está pendiente" */
}));
it("una versión nueva supera los pendientes de la anterior", …);   // dos publicaciones seguidas con tramiteEn/codigo; el primero queda superado con motivo nueva_version; porcentaje no lo cuenta
it("un restringido no crea acuse a quien no lo ve", …);
```

`tests/acuses-pantalla.test.tsx`: `TareaAcuse` con `abierto: false` deshabilita el botón y
muestra el texto; con `queCambio: null` muestra «Versión 2, vigente desde …».

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/acuses.test.ts tests/acuses-pantalla.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Consultas, enganche en `publicarVersion` y `alDejarDeSerVigente`, acción y páginas.**
`publicarVersion` llama `crearAcusesAlPublicar(tx, versionId, ahora)` tras `aplicarPublicacion` y
deja `acuses: { creados, porFirma }` en `detalle` (el acta no lo imprime).

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/acuses.test.ts tests/acuses-pantalla.test.tsx tests/distribucion-tareas.test.ts tests/tramites-cierre.test.ts tests/acta.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13b): acuses de lectura al publicar, tarea con «qué cambió» y confirmación auditada"
```

---

### Tarea 9: Acuses — pedido manual, ingreso al proceso, salida de la audiencia, eliminación, porcentajes y Excel

**Files:**
- Create: `src/lib/distribucion/acuses-excel.ts`, `src/app/(app)/distribucion/acuses/page.tsx`,
  `src/app/(app)/distribucion/acuses/excel/route.ts`, `src/componentes/distribucion/acuses/{TablaAcuses,QuienFalta}.tsx`,
  `tests/acuses-audiencia.test.ts`, `tests/acuses-excel.test.ts`
- Modify: `src/db/consultas/distribucion/acuses.ts`, `src/db/consultas/distribucion/audiencia.ts`,
  `src/db/consultas/usuarios.ts` (`crearUsuario`, `editarUsuario`, `cambiarActivo`, `crearUsuariosEnLote`),
  `src/db/consultas/distribucion/listas.ts` (`editarLista`, `alternarLista`),
  `src/db/consultas/admin.ts` (nivel de acceso al editar catálogo), `src/db/consultas/flujo/cierre.ts`
  (`ejecutarEliminacion`), `src/app/acciones-distribucion.ts`, `src/componentes/distribucion/BloqueDistribucion.tsx`,
  `src/lib/lote-usuarios.ts` (resumen), `tests/usuarios.test.ts`, `tests/lote-usuarios.test.ts`

**Interfaces:**
- Consumes: Tareas 7 y 8; `construirExcelMaestro` como patrón (`src/lib/maestro-excel.ts`);
  `neutralizarFormula`; `alcanceProcesos`.
- Produces (`acuses.ts`):
  - `pedirAcuses(sesion: SesionFlujo, documentoId: number, opciones?): Promise<{ creados: number }>`:
    `distribucion.gestionar`; versión vigente; por cada persona de la audiencia sin acuse vivo de
    esa versión, fila `pendiente` con origen `solicitud_manual`, evento y aviso; auditoría
    `acuses_pedidos` (`detalle`: código, versión, creados). Repetirlo crea 0.
  - `acusesDeIngreso(tx: TransactionSql, usuarioId: number, procesoIds: number[], ahora: Date): Promise<number>`:
    por cada versión vigente de un documento con `lectura_obligatoria_ingreso` cuyo proceso
    propietario o «donde aplica» esté en `procesoIds`, visible para la persona, sin acuse vivo →
    `pendiente` con origen `ingreso_proceso`, evento y aviso.
  - `retirarAcusesFueraDeAudiencia(tx, documentoId: number, ahora: Date, motivo: string): Promise<number>`:
    pendientes de las versiones del documento cuyo usuario **ya no está** en
    `audienciaDeDocumento` → `retirado` (`cerrado_en`, `motivo_cierre`), evento `retirado`.
  - `retirarAcusesDe(tx, usuarioId: number, ahora: Date, motivo: string): Promise<number>`: todos los
    pendientes de la persona (al desactivarla).
  - `avisarEliminacion(tx, documentoId: number, codigo: string, titulo: string, ahora: Date): Promise<void>`:
    aviso `distribucion.eliminado` a la audiencia («CEX-GU-01 Guía de atención dejó de aplicar:
    fue eliminado el <fecha>»), sin tarea; se llama desde `ejecutarEliminacion` (los pendientes ya
    los supera `alDejarDeSerVigente`).
  - `type FilaAcuses = { versionId: number; codigo: string; titulo: string; version: number; proceso: string; publicadoEn: Date | null; confirmados: number; pendientes: number; porAsistencia: number; porFirma: number; porcentaje: number | null; venceEn: Date | null }`;
    `resumenAcuses(sesion: SesionFlujo, filtro: { desde: Date; hasta: Date; procesoId?: number }, opciones?): Promise<{ versiones: FilaAcuses[]; porProceso: { procesoId: number; nombre: string; confirmados: number; pendientes: number; porcentaje: number | null }[]; entidad: { confirmados: number; pendientes: number; porcentaje: number | null } }>`
    (líder: solo documentos cuyo proceso propietario está en su alcance; `superado` y `retirado`
    no cuentan; periodo sobre `publicado_en`; por defecto el año en curso).
  - `quienFalta(versionId: number, sesion, opciones?): Promise<{ id: number; nombre: string; cargo: string | null; desdeHace: number }[] | null>` (`null` si no puede verlo).
- Produces (`usuarios.ts`): `crearUsuario` y `editarUsuario` llaman `acusesDeIngreso` con los
  procesos **nuevos** (la diferencia entre `antesCompleto.procesos` y `despuesCompleto.procesos`
  en `editarUsuario`) y, al quitar procesos, `retirarAcusesFueraDeAudiencia` para cada documento
  afectado (los de los procesos quitados); `cambiarActivo(id, false)` llama `retirarAcusesDe`;
  `crearUsuariosEnLote` suma `tareasDeLectura` al resultado y `lote-usuarios.ts` lo muestra en el
  resumen («Se crearon N tareas de lectura»). Todas las funciones ganan `opciones?: { sql?: Cliente; ahora?: Date }` donde falten.
- Produces (`listas.ts`, `admin.ts`): `editarLista` y `alternarLista` llaman
  `retirarAcusesFueraDeAudiencia` para cada documento que tenga la lista; cambiar `nivel_acceso` a
  `restringido` también.
- Produces (`acuses-excel.ts`): `construirExcelAcuses(filas: FilaAcuses[], meta: { hospital: string; generadoEn: string; periodo: string; total: number }): Promise<Buffer>`
  (columnas: Código, Título, Versión, Proceso, Publicada, Confirmados, Pendientes, Por
  asistencia, Por firma, Porcentaje; celdas de texto por `neutralizarFormula`).
- Produces (ruta): `GET /distribucion/acuses/excel?desde&hasta&proceso` → `distribucion.ver`,
  `resumenAcuses` con el alcance de la sesión, auditoría `exporto_acuses`, `Cache-Control: no-store`.
- Produces (acciones): `pedirAcusesAccion` (`distribucion.gestionar`; `documentoId`).
- Produces (`tests/utiles/distribucion.ts`): `datosDeUsuario(tx: TransactionSql, usuarioId: number): Promise<DatosUsuario>`
  (lee la fila y sus procesos en la forma que `editarUsuario` recibe, para cambiar un solo campo).
- Produces (pantallas): `/distribucion/acuses` (pestaña): filtros de periodo y proceso, cifras de
  la entidad y por proceso (`TarjetaCifra`), `TablaAcuses` por versión con «Ver quién falta»
  (`QuienFalta` en `Dialogo`: nombre, cargo, hace N días) y «Descargar Excel». En las fichas,
  `BloqueDistribucion` gana la sección «Acuses vN: 23 de 34 (68 %) · vencen el … · 4 por
  asistencia», «Ver quién falta» y, con `distribucion.gestionar`, «Pedir acuse de lectura».

- [ ] **Step 1: Tests que fallan**

`tests/acuses-audiencia.test.ts`:

```ts
it("pedir acuse crea solo los que faltan y repetir no duplica", …);
it("asignar un proceso crea los acuses de los vigentes marcados; quitarlo retira los pendientes", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
  const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
  await guardarAudiencia(doc.id, { listaIds: [], lecturaObligatoriaIngreso: true }, admin.usuarioId, { sql: tx });
  const otro = await documentoLibre(tx, { proceso: "GTH", tipo: "GU" });                  // sin la marca
  const persona = await usuarioDePrueba(tx, { rol: "consulta" });
  const datos = await datosDeUsuario(tx, persona.usuarioId);
  await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [gth] }, admin.usuarioId, { sql: tx });
  const pendientes = await acusesPendientesDe(persona.usuarioId, { sql: tx });
  expect(pendientes.map((a) => a.codigo)).toEqual([doc.codigo]);
  expect(pendientes[0].origen).toBe("ingreso_proceso");
  await editarUsuario(persona.usuarioId, { ...datos, procesoIds: [] }, admin.usuarioId, { sql: tx });
  expect(await acusesPendientesDe(persona.usuarioId, { sql: tx })).toEqual([]);
  const [fila] = await tx`SELECT estado, motivo_cierre FROM acuses WHERE usuario_id = ${persona.usuarioId}`;
  expect(fila).toMatchObject({ estado: "retirado" });
  void otro;
}));
it("desactivar a la persona retira sus pendientes; volver a asignar el proceso crea uno nuevo (unicidad parcial)", …);
it("la eliminación avisa a la audiencia sin tarea", …);   // ejecutar eliminación con tramiteEn tipo eliminar; notificaciones tipo distribucion.eliminado; sin acuses pendientes nuevos
it("resumenAcuses: porcentaje por versión, proceso y entidad; el líder solo ve sus procesos; superados no cuentan", …);
```

`tests/acuses-excel.test.ts`: dos filas, encabezado institucional, una celda que empieza por `=`
sale neutralizada. `tests/usuarios.test.ts` y `tests/lote-usuarios.test.ts`: el lote devuelve
`tareasDeLectura` y el resumen lo nombra.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/acuses-audiencia.test.ts tests/acuses-excel.test.ts tests/usuarios.test.ts tests/lote-usuarios.test.ts`
Expected: FAIL.

- [ ] **Step 3: Consultas, enganches en usuarios, listas, catálogo y eliminación; Excel; acción.**
En `editarUsuario` la diferencia de procesos se calcula con `antesCompleto`/`despuesCompleto`, que
ya existen (`usuarios.ts:225`); el `DELETE`/`INSERT` de `usuario_procesos` no cambia.

- [ ] **Step 4: Pantalla y bloque de las fichas** (maqueta 5 para el bloque).

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/acuses-audiencia.test.ts tests/acuses-excel.test.ts tests/acuses.test.ts tests/usuarios.test.ts tests/lote-usuarios.test.ts tests/tramites-cierre.test.ts tests/handlers-permisos.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit y punto de control en navegador**

```bash
git add src tests
git commit -m "feat(f13b): pedido de acuses, lectura obligatoria al ingresar, retiro al salir de la audiencia, porcentajes y Excel"
```

Punto de control: como `coordinadora.sgc`, asignar una lista a un documento, publicar una versión
(camino de la 13A) y, como una persona de la audiencia, abrir la tarea, ver el botón deshabilitado,
abrir el documento y confirmar; ver el porcentaje en la pestaña Acuses y en la ficha; pedir acuse
de un vigente; asignar un proceso a un usuario con la marca de ingreso y ver su tarea.

---

### Tarea 10: `archivos` con contexto — subida y servido de evidencias

**Files:**
- Create: `src/db/consultas/distribucion/evidencias.ts`, `tests/evidencias.test.ts`
- Modify: `src/lib/subida.ts`, `src/lib/recepcion-archivo.ts`, `src/db/consultas/admin.ts`
  (`registrarArchivo`), `src/lib/servir-archivo.ts` (sin cambios de comportamiento; solo si hace
  falta exportar el tipo), `tests/subida.test.ts`, `tests/recepcion-archivo.test.ts`

**Interfaces:**
- Consumes: `recibirArchivo`, `validarTipo`, `sanearNombre`, `registrarArchivo` (`admin.ts`),
  `resolverRutaAlmacen`, `respuestaArchivo`, `respuesta404`.
- Produces (`subida.ts`): `validarTipoEvidencia(nombre: string, muestra: Uint8Array): Promise<ResultadoTipo>`
  → como `validarTipo` pero solo `pdf`, `png`, `jpg`, `jpeg`, `webp` (error «La evidencia debe ser
  PDF o imagen (PNG, JPG, WebP)»). `CONTEXTOS_EVIDENCIA = ["jornada", "verificacion_item"] as const`, `ContextoEvidencia`.
- Produces (`recepcion-archivo.ts`): `recibirArchivo(peticion, destino: DestinoVersion | DestinoEvidencia, usuarioId)`
  con `DestinoVersion` = el tipo actual (`{ contexto?: "version"; versionId; codigo; numero; rol; tramiteId? }`)
  y `DestinoEvidencia = { contexto: ContextoEvidencia; contextoId: number; carpeta: string }`
  (`carpeta` = `jornadas/<id>` o `verificaciones/<verificacionId>/items/<itemId>`). Con
  `DestinoEvidencia` valida con `validarTipoEvidencia`, guarda en `almacen/<carpeta>/<nombre>`
  (spec maestro §5.5) y registra con `rol = 'evidencia'`, `version_id = null`, `contexto`,
  `contexto_id`. El camino de las versiones no cambia ni un byte de ruta.
- Produces (`admin.ts`): `registrarArchivo(datos: DatosArchivo & { versionId: number | null; contexto?: string; contextoId?: number | null }, usuarioId, opciones)`;
  la auditoría `subir_archivo` lleva `contexto` y `contextoId` cuando no es de versión.
- Produces (`evidencias.ts`):
  - `type Evidencia = { id: number; nombreOriginal: string; mime: string; tamanoBytes: number; hashSha256: string; creadoEn: Date }`.
  - `evidenciasDe(contexto: ContextoEvidencia, contextoId: number, opciones?): Promise<Evidencia[]>`.
  - `evidenciaServible(contexto, contextoId, archivoId, opciones?): Promise<ArchivoServible | null>`
    (solo filas con ese contexto e id: una evidencia no se sirve por la ruta de otra).
  - `eliminarEvidencia(contexto, contextoId, archivoId, usuarioId, opciones?): Promise<void>`
    (borra fila y archivo; auditoría `eliminar_archivo`). Quien llama ya autorizó: la Tarea 11 lo
    permite sobre una jornada durante las 24 horas siguientes a su registro, por quien la
    registró; la Tarea 12, sobre una verificación **abierta**.
  - **La autorización es del dueño**: `evidencias.ts` no decide quién ve; cada ruta (Tareas 11 y
    12) llama a `puedeVerJornada`/`puedeVerVerificacion` antes.
- Produces (`tests/utiles/distribucion.ts`): `peticionDeSubida(nombre: string, bytes: Uint8Array, cabeceras?: Record<string, string>): NextRequest`
  (cuerpo crudo con `x-nombre-archivo`, `content-length` y `Origin` del host), reutilizable por
  las rutas de las Tareas 11 y 12.

- [ ] **Step 1: Tests que fallan**

`tests/subida.test.ts`: `validarTipoEvidencia` acepta un PNG (`pngDePrueba`) y un PDF, rechaza
`.docx` y `.svg` renombrado a `.png` con el mensaje. `tests/recepcion-archivo.test.ts`: con un
`DestinoEvidencia` `{ contexto: "jornada", contextoId: 5, carpeta: "jornadas/5" }` guarda en
`almacen/jornadas/5/<nombre>` y la fila tiene `version_id` nula, `contexto = 'jornada'`,
`contexto_id = 5`, `rol = 'evidencia'`; con el destino de versión, la ruta sigue siendo
`documentos/<codigo>/v<n>/<nombre>` (caso existente, sin cambios). `tests/evidencias.test.ts`:
`evidenciasDe` lista solo las de ese contexto e id; `evidenciaServible` devuelve `null` para un
`archivoId` de otro contexto.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/subida.test.ts tests/recepcion-archivo.test.ts tests/evidencias.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** con las firmas de **Produces**. `recibirArchivo` decide el
validador, la carpeta y los datos de `registrarArchivo` por `destino.contexto`; el resto del flujo
(muestra, hash, tope, `wx`, limpieza) es el mismo.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/subida.test.ts tests/recepcion-archivo.test.ts tests/evidencias.test.ts tests/tramites-archivos.test.ts tests/tramites-archivos-rutas.test.ts tests/handlers-permisos.test.ts tests/archivos-origen.test.ts && npm run lint`
Expected: PASS (el camino de las versiones intacto).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13b): archivos con contexto - subida y servido de evidencias con la misma validación"
```

---

### Tarea 11: Socialización — marca en la aceptación, jornadas y asistencia como acuse

**Files:**
- Create: `src/db/consultas/distribucion/jornadas.ts`, `src/app/(app)/distribucion/socializaciones/page.tsx`,
  `…/socializaciones/nueva/page.tsx`, `…/socializaciones/[id]/page.tsx`,
  `…/socializaciones/[id]/archivos/[archivoId]/[[...nombre]]/route.ts`,
  `src/app/api/socializaciones/[id]/archivos/route.ts`,
  `src/componentes/distribucion/socializaciones/{FormularioJornada,TablaJornadas,DetalleJornada}.tsx`,
  `tests/jornadas.test.ts`, `tests/jornadas-rutas.test.ts`
- Modify: `src/db/consultas/flujo/aceptacion.ts`, `src/db/consultas/flujo/contrato.ts` (`FilaTramite`,
  `Efecto.cambios`), `src/db/consultas/tramites.ts` (`aFilaTramite`), `src/db/consultas/tramites-gestion.ts`
  (`corregirDatosDeControl`), `src/db/consultas/flujo/cierre.ts` (`publicarVersion`),
  `src/db/consultas/distribucion/version-vigencia.ts`, `src/db/consultas/distribucion/tareas.ts`,
  `src/lib/esquemas/tramites.ts`, `src/lib/esquemas/distribucion.ts`, `src/lib/alcance.ts`,
  `src/componentes/tramites/{PanelAceptacion,BloqueSolicitud}.tsx`, `src/app/acciones-tramites.ts`,
  `src/app/acciones-distribucion.ts`, `src/proxy.ts`, `src/componentes/distribucion/BloqueDistribucion.tsx`,
  `tests/proxy-matcher.test.ts`, `tests/tramites-aceptacion.test.ts`, `tests/tramites-gestion.test.ts`

**Interfaces:**
- Consumes: Tareas 8 y 10; `fechaLimite`; `lideresDeProceso`, `adminsActivos`; `alcanceProcesos`.
- Produces (trámite):
  - `FilaTramite.requiereSocializacion: boolean`; `Efecto.cambios` lo admite; `aFilaTramite` lo lee.
  - `EsquemaAceptarCreacion` y `EsquemaAceptarModificacion` ganan `requiereSocializacion: z.literal("on").optional()`;
    `aceptarNuevo`, `convertirEnModificacion` y `aceptarModificacion` lo escriben en `cambios` y en
    `detalle.requiereSocializacion`. `PanelAceptacion` muestra la casilla «Requiere socialización
    (capacitar al personal al publicar)».
  - `DatosCorreccion.requiereSocializacion?: boolean` en `corregirDatosDeControl` (permitido en
    toda etapa de trabajo, también `aprobacion` y `publicacion`, solo ese campo; con
    `distribucion.gestionar` además de `tramites.gestionar`); el historial dice «Cambió la marca de socialización a sí/no».
  - `publicarVersion`: si `tramite.requiereSocializacion`, inserta en `socializaciones_requeridas`
    (`vence_en = fechaLimite(ahora, plazoSocializacionDias, zona)`) y avisa `distribucion.socializar`
    a los líderes del proceso propietario (o a los Admin SGC si no hay) con enlace
    `/distribucion/socializaciones/nueva?version=<id>`.
- Produces (`jornadas.ts`):
  - `type Jornada = { id: number; fecha: string; modalidad: Modalidad; facilitador: { id: number; nombre: string }; observaciones: string | null; asistentesExternos: string | null; registradaPor: { id: number; nombre: string }; creadoEn: Date; anulada: { en: Date; por: string; motivo: string } | null; versiones: { versionId: number; codigo: string; titulo: string; version: number }[]; asistentes: { id: number; nombre: string; cargo: string | null }[]; evidencias: Evidencia[]; puedeVerEvidencia: boolean }`.
  - `registrarJornada(sesion: SesionFlujo, d: { fecha: string; modalidad: Modalidad; facilitadorId: number; versionIds: number[]; asistenteIds: number[]; asistentesExternos: string | null; observaciones: string | null }, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ jornadaId: number; acusesPorAsistencia: number }>`:
    `socializaciones.registrar` y, para el líder, alguna versión de un documento de su alcance por
    cada versión; `fecha` no futura (`ErrorDistribucion("La fecha no puede ser futura")`); al
    menos una versión; al menos un asistente o texto de externos; cada asistente con acuse
    `pendiente` de alguna de las versiones → `confirmado` con `modo = 'asistencia'`,
    `jornada_id`, evento `confirmado`; cada `socializaciones_requeridas` de esas versiones sin
    cumplir → `cumplida_en`, `jornada_id`; auditoría `jornada_registrada`.
  - `anularJornada(id, sesion, motivo: string, opciones?)`: quien la registró o
    `distribucion.gestionar`; los acuses `asistencia` de esa jornada vuelven a `pendiente` con
    `vence_en = fechaLimite(ahora, plazoAcuseDias, zona)` si su versión sigue vigente, o pasan a
    `superado`; evento `revertido`; las `socializaciones_requeridas` que cumplió vuelven a
    pendientes si su versión sigue vigente; auditoría `jornada_anulada`.
  - `obtenerJornada(id, sesion, opciones?): Promise<Jornada | null>` (`puedeVerJornada`);
    `listarJornadas(sesion, filtro: { desde?: Date; hasta?: Date; procesoId?: number }, opciones?)`;
    `jornadasDeVersion(versionId, sesion, opciones?)` y `socializacionDeVersion(versionId, opciones?): Promise<{ requerida: boolean; venceEn: Date | null; cumplida: { jornadaId: number; fecha: string; asistentes: number } | null; superada: boolean }>`
    para el bloque de las fichas.
- Produces (`alcance.ts`): `puedeVerJornada(sesion, jornada: { procesoIds: number[] }): { ve: boolean; evidencia: boolean }`
  → `ve` si tiene sesión y puede ver alguno de los documentos (resumen para todos los que ven el
  documento); `evidencia` para `admin_sgc`, `control_interno`, `gerencia` y `lider_proceso` con
  alguno de esos procesos en su alcance (spec §6.4).
- Produces (`distribucion/tareas.ts`): `tareasDeSocializacion(sesion, opciones?)` →
  `socializacion:<versionId>` «Registrar la socialización de GTH-PR-02 v2» para los líderes del
  propietario (o Admin SGC si no hay), `vence` = `vence_en`, enlace a `/distribucion/socializaciones/nueva?version=<id>`.
- Produces (`version-vigencia.ts`): `alDejarDeSerVigente` marca `superada_en` en la
  `socializaciones_requeridas` pendiente de la versión.
- Produces (rutas): la jornada se registra primero y la evidencia se adjunta después. La página
  `/nueva` crea la jornada con `registrarJornada` y redirige a su detalle, que ofrece la zona de
  carga durante **24 horas** desde `creado_en`. `POST /api/socializaciones/[id]/archivos` exige
  `socializaciones.registrar`, ser quien la registró, jornada no anulada y menos de 24 horas
  desde `creado_en` (si no, 409 «La evidencia de esta jornada ya no se puede cambiar»);
  `DELETE …/[archivoId]` con las mismas condiciones (`eliminarEvidencia`). La ruta de subida va
  fuera del `matcher`: `api/socializaciones/[0-9]+/archivos$`.
  `GET /distribucion/socializaciones/[id]/archivos/[archivoId]/[[...nombre]]` →
  `puedeVerJornada(...).evidencia` o 404; `evidenciaServible("jornada", id, archivoId)`; sin marca de agua.
- Produces (acciones): `registrarJornadaAccion` (`socializaciones.registrar`; `EsquemaJornada`:
  `fecha` `z.iso.date()`, `modalidad`, `facilitadorId`, `versionIds` `lista(id)`, `asistenteIds`
  `lista(id)` opcional, `asistentesExternos` 0–1000 opcional, `observaciones` 0–2000 opcional;
  redirige a `/distribucion/socializaciones/<id>?evidencia=1`, donde la página ofrece la zona de
  carga), `anularJornadaAccion` (`EsquemaMotivoCierre` de trámites).
- Produces (pantallas): pestaña Socializaciones (`TablaJornadas`: fecha, modalidad, documentos,
  asistentes, evidencia «2 archivos»/«Sin acta adjunta», estado), `/nueva` (`FormularioJornada`:
  documentos con buscador y la versión vigente por defecto, `?version=` prellena; asistentes con
  buscador por nombre; «Registrar»), `/[id]` (`DetalleJornada`; `ZonaCarga` reutilizada para la
  evidencia durante las 24 horas siguientes, con `validarTipoEvidencia` del lado del cliente como
  aviso; la lista de asistentes y los archivos solo con `evidencia`; «Anular» con motivo). En las
  fichas, `BloqueDistribucion` gana «Socialización: requerida · jornada del 14 nov, reunión de
  servicio, 18 asistentes, acta adjunta» y «Registrar socialización» (`socializaciones.registrar`).

- [ ] **Step 1: Tests que fallan**

`tests/jornadas.test.ts`:

```ts
it("la marca en la aceptación llega a la fila y, al publicar, crea la socialización requerida y la tarea del líder", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]), aceptar: { requiereSocializacion: true } });
  try {
    await transicionar(t.admin, { tramiteId: t.tramiteId, etapaEsperada: "publicacion", rondaEsperada: t.ronda, accion: "publicar", credenciales: { clave: "x" } }, opc(tx, "2026-11-20T15:00:00Z"));
    const [req] = await tx`SELECT vence_en, cumplida_en FROM socializaciones_requeridas WHERE version_id = ${t.versionId}`;
    expect(req.vence_en).toEqual(fechaLimite(new Date("2026-11-20T15:00:00Z"), 30, zonaHoraria()));
    const lider = await sesionDe(tx, "lider.gth");
    expect((await tareasDeSocializacion(lider, { sql: tx })).map((x) => x.titulo)).toContain(`Registrar la socialización de ${t.codigo} v2`);
  } finally { await t.limpiar(); }
}));
it("registrar una jornada confirma por asistencia y cumple la requerida; anularla lo revierte", () => revertida(sql, async (tx) => {
  /* publicar con audiencia (lectora en GTH); registrarJornada(lider.gth, { versionIds: [v], asistenteIds: [lectora] }) → acuse confirmado modo asistencia, jornada_id; requerida cumplida_en;
     anularJornada → acuse pendiente con vence_en nuevo y evento revertido; requerida sin cumplir */
}));
it("rechaza fecha futura, sin versiones, sin asistentes ni externos, y líder fuera de alcance", …);
it("quién ve la evidencia", …);   // puedeVerJornada: consulta de la audiencia ve=true evidencia=false; control.interno ambas; lider de otro proceso ninguna
```

`tramiteEn` gana la opción `aceptar?: Record<string, unknown>` que se mezcla en los datos de
`aceptar` (hoy los arma `aceptarCreacion`/los de modificación dentro de la función).

`tests/jornadas-rutas.test.ts`: subir un PNG a una jornada propia recién creada → 201 con
`contexto = 'jornada'`; otra persona → 404; a las 25 horas → 409; `GET` del archivo: quien ve la
evidencia 200, quien solo ve el documento 404, sin sesión 401. `tests/proxy-matcher.test.ts`:
`/api/socializaciones/5/archivos` queda fuera; `/api/socializaciones/5/archivos/7` y
`/distribucion/socializaciones/5/archivos/7/acta.pdf` pasan.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/jornadas.test.ts tests/jornadas-rutas.test.ts tests/proxy-matcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Trámite (marca), consultas, alcance, rutas y acciones** con las firmas de **Produces**.

- [ ] **Step 4: Pantallas y bloque de las fichas**.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/jornadas.test.ts tests/jornadas-rutas.test.ts tests/proxy-matcher.test.ts tests/tramites-aceptacion.test.ts tests/tramites-gestion.test.ts tests/tramites-cierre.test.ts tests/tramites-ui.test.tsx tests/handlers-permisos.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13b): marca de socialización en la aceptación, jornadas con evidencia y asistencia como acuse"
```

---

### Tarea 12: Verificación en puntos de uso — lista de chequeo, cierre, hallazgos y fotos

**Files:**
- Create: `src/db/consultas/distribucion/verificaciones.ts`, `src/db/consultas/distribucion/hallazgos.ts`,
  `src/app/(app)/distribucion/verificaciones/nueva/page.tsx`, `…/verificaciones/[id]/page.tsx`,
  `…/verificaciones/[id]/archivos/[archivoId]/[[...nombre]]/route.ts`,
  `src/app/api/verificaciones/[id]/items/[itemId]/archivos/route.ts`,
  `src/app/api/verificaciones/[id]/items/[itemId]/archivos/[archivoId]/route.ts`,
  `src/componentes/distribucion/verificaciones/{ListaChequeo,ItemChequeo,ResumenCierre}.tsx`,
  `tests/verificaciones.test.ts`, `tests/verificaciones-rutas.test.ts`, `tests/verificaciones-pantalla.test.tsx`
- Modify: `src/db/consultas/distribucion/copias.ts` (la inserción de hallazgo de la Tarea 6 pasa a
  `abrirHallazgoDeRecogida`), `src/lib/alcance.ts`, `src/lib/esquemas/distribucion.ts`,
  `src/app/acciones-distribucion.ts`, `src/proxy.ts`, `tests/proxy-matcher.test.ts`, `tests/copias-recogida.test.ts`

**Interfaces:**
- Consumes: `armarListaDeChequeo`, `esConforme`, `RESPUESTAS_ITEM` (Tarea 3); Tarea 10;
  `leerVerificacion` como patrón de lectura de `respuesta_<id>`/`nota_<id>` (`src/lib/esquemas/tramites.ts`).
- Produces (`verificaciones.ts`):
  - `type ItemVerificacion = { id: number; orden: number; origen: OrigenItem; copiaId: number | null; texto: string; respuesta: Respuesta | null; nota: string | null; fotos: Evidencia[] }`;
    `type Verificacion = { id: number; punto: { id: number; nombre: string; sede: string | null }; responsable: { id: number; nombre: string }; estado: "abierta" | "cerrada" | "descartada"; abiertaPor: string; abiertaEn: Date; cerradaPor: string | null; cerradaEn: Date | null; conforme: boolean | null; propioPunto: boolean; motivoDescarte: string | null; items: ItemVerificacion[]; hallazgos: Hallazgo[]; puedeEditar: boolean }`.
  - `abrirVerificacion(sesion: SesionFlujo, puntoId: number, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ verificacionId: number }>`:
    `verificaciones.realizar`; punto activo; si ya hay una abierta devuelve **esa** (no lanza);
    copia `punto_nombre`, `responsable_id`, `responsable_nombre`; si quien abre es el responsable
    del punto y existe **otro** `admin_sgc` activo (`adminsActivos` sin él), lanza
    `ErrorDistribucion("Otro Administrador del SGC debe verificar este punto: usted es su responsable")`
    (spec §6.3); si no hay otro, abre con `propio_punto = true`; inserta los ítems de
    `armarListaDeChequeo(copias vivas del punto)`.
  - `guardarAvance(id, sesion, respuestas: { itemId: number; respuesta: Respuesta | null; nota: string | null }[], opciones?)`:
    `verificaciones.realizar`; abierta (si no, `ErrorDistribucion("La verificación ya está cerrada")`);
    cada `itemId` de esa verificación; sin efectos fuera de `verificacion_items`.
  - `agregarItemLibre(id, sesion, texto: string, opciones?): Promise<{ itemId: number }>` (origen `libre`, al final).
  - `cerrarVerificacion(id, sesion, opciones?): Promise<{ conforme: boolean; hallazgos: number }>`:
    todos los ítems con respuesta (si no, `ErrorDistribucion("Responda todos los ítems antes de cerrar")`);
    en una transacción: `estado = 'cerrada'`, `conforme = esConforme(items)`, `cerrada_por/en`;
    por cada `no_conforme`, `abrirHallazgo` (origen `verificacion`, `item_id`, `copia_id`,
    `documento_id` de la copia si la hay, `descripcion = texto del ítem + ": " + nota`,
    `retirado_en_el_acto` según lo marcado en el ítem, `vence_en = fechaLimite(ahora, plazoCorreccionDias, zona)`);
    por cada ítem `copia_por_recoger` **conforme**, o `no_conforme` con «retirado en el acto», la
    copia pasa a `recogida` con destino `retirada_en_verificacion` (evento `recogida`
    `detalle.verificacionId`); auditoría `verificacion_cerrada` (`detalle`: punto, conforme,
    hallazgos). La firma completa es
    `cerrarVerificacion(id, sesion, datos: { retirados: number[] }, opciones?)`: `retirados` son
    los ids de los ítems `no_conforme` cuya casilla «Retirado en el acto» venía marcada
    (`retirado_<id>` en el formulario); el dato no se guarda en el ítem, va al hallazgo.
  - `descartarVerificacion(id, sesion, motivo: string, opciones?)`: quien la abrió o
    `distribucion.gestionar`; abierta; `estado = 'descartada'`, `motivo_descarte`; auditoría
    `verificacion_descartada`. Las fotos subidas quedan como archivos de sus ítems.
  - `obtenerVerificacion(id, sesion, opciones?): Promise<Verificacion | null>` (`puedeVerVerificacion`);
    `ultimaVerificacionDe(puntoId, opciones?): Promise<{ cerradaEn: Date; conforme: boolean } | null>`.
- Produces (`hallazgos.ts`):
  - `type Hallazgo = { id: number; punto: { id: number; nombre: string }; origen: "verificacion" | "recogida"; verificacionId: number | null; itemId: number | null; copia: { id: number; codigo: string; version: number; numero: number } | null; descripcion: string; retiradoEnElActo: boolean; responsable: { id: number; nombre: string }; estado: "abierto" | "cerrado"; venceEn: Date; creadoEn: Date; cierre: { en: Date; por: string; nota: string } | null; fotos: Evidencia[] }`.
  - `abrirHallazgo(tx: TransactionSql, d: { puntoId; origen; verificacionId?; itemId?; copiaId?; documentoId?; descripcion; retiradoEnElActo; responsableId; ahora: Date; plazoDias: number }): Promise<{ hallazgoId: number }>`
    (inserta y avisa `distribucion.hallazgo` al responsable con enlace a la verificación o a la
    copia); `abrirHallazgoDeRecogida(tx, copia, ahora, plazoDias)` lo usa desde `confirmarRecogida`.
  - `cerrarHallazgo(id, sesion, nota: string, opciones?)`: responsable actual del punto
    (`distribucion.responder`) o `distribucion.gestionar`; `abierto`; auditoría `hallazgo_cerrado`.
  - `hallazgosDe(filtro: { puntoId?: number; estado?: "abierto" | "cerrado" }, sesion, opciones?): Promise<Hallazgo[]>`;
    `hallazgosAbiertosDe(usuarioId, opciones?)` (para las tareas de la Tarea 13).
- Produces (`alcance.ts`): `puedeVerVerificacion(sesion, v: { puntoId; responsableId; procesoIds })`
  → `admin_sgc`, `gerencia`, `control_interno`; líder con alguno de los procesos del punto; el
  responsable del punto.
- Produces (rutas): `POST /api/verificaciones/[id]/items/[itemId]/archivos` →
  `verificaciones.realizar`, verificación **abierta**, ítem de ella; `recibirArchivo` con
  `{ contexto: "verificacion_item", contextoId: itemId, carpeta: "verificaciones/<id>/items/<itemId>" }`;
  `DELETE …/[archivoId]` igual (`eliminarEvidencia`). Fuera del `matcher`:
  `api/verificaciones/[0-9]+/items/[0-9]+/archivos$`. `GET /distribucion/verificaciones/[id]/archivos/[archivoId]/[[...nombre]]`
  → `puedeVerVerificacion` o 404; el archivo debe ser de un ítem de esa verificación.
- Produces (acciones): `abrirVerificacionAccion` (`verificaciones.realizar`; `puntoId`; redirige a
  `/distribucion/verificaciones/<id>`), `guardarAvanceAccion` (lee `respuesta_<id>`, `nota_<id>`,
  `retirado_<id>` con `leerChequeo(formData, omitir)` en `esquemas/distribucion.ts`),
  `agregarItemLibreAccion`, `cerrarVerificacionAccion`, `descartarVerificacionAccion`
  (`EsquemaMotivoCierre`), `cerrarHallazgoAccion` (`distribucion.responder`; `nota` 5–1000).
- Produces (pantallas): `/distribucion/verificaciones/nueva?punto=<id>` → abre (o retoma) y
  redirige; `/distribucion/verificaciones/[id]` (maqueta 3, **celular primero**): cabecera con
  punto, responsable y última verificación; `ListaChequeo` con un `ItemChequeo` por fila (tres
  botones de radio en segmento: conforme / no conforme / no aplica, texto siempre visible; al
  marcar no conforme se despliegan nota, casilla «Retirado en el acto» y «Foto» con `ZonaCarga`
  hacia la ruta del ítem); «Añadir ítem»; pie fijo con «N de M ítems conformes · Punto conforme /
  no conforme (provisional)», «Guardar avance», «Cerrar verificación» (confirmación en `Dialogo`) y
  «Descartar». Cerrada: solo lectura con `ResumenCierre` y la lista de hallazgos con su cierre.

- [ ] **Step 1: Tests que fallan**

`tests/verificaciones.test.ts`:

```ts
it("abrir arma la lista con las copias del punto y los fijos; abrir de nuevo devuelve la misma", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const resp = await usuarioDePrueba(tx, { rol: "consulta" });
  const punto = await puntoDePrueba(tx, { responsable: resp, procesos: ["ATE"] });
  const { documento, limpiar } = await vigenteConPdf(tx, { proceso: "ATE", tipo: "PR" });
  try {
    await copiaDePrueba(tx, { emisor: admin, documento, punto });
    const { verificacionId } = await abrirVerificacion(admin, punto.id, { sql: tx, ahora: T0 });
    expect((await abrirVerificacion(admin, punto.id, { sql: tx })).verificacionId).toBe(verificacionId);
    const v = await obtenerVerificacion(verificacionId, admin, { sql: tx });
    expect(v?.items.map((i) => i.texto)).toEqual([`${documento.codigo} v1 · Copia N.º 01: está`, `${documento.codigo} v1 · Copia N.º 01: legible`, `${documento.codigo} v1 · Copia N.º 01: es la versión vigente`, ...ITEMS_FIJOS]);
  } finally { await limpiar(); }
}));
it("cerrar exige todas las respuestas; crea hallazgos por cada no conforme y recoge la copia obsoleta retirada en el acto", () => revertida(sql, async (tx) => {
  /* copia por_recoger en el punto (publicar v2 con alDejarDeSerVigente o UPDATE directo del estado dentro de la tx);
     cerrar con un item sin respuesta → rejects "Responda todos…"; responder: fijo «Sin documentos obsoletos» no_conforme con nota y retirado;
     el item copia_por_recoger conforme → cerrar → { conforme: false, hallazgos: 1 }; copia recogida con destino retirada_en_verificacion;
     hallazgo con responsable del punto, vence_en = fechaLimite(T0, 5); tarea/aviso al responsable; `guardarAvance` después → rejects "ya está cerrada" y el UPDATE directo da 42501 */
}));
it("descartar libera el punto y no deja efectos", …);
it("el responsable cierra su hallazgo con nota; otro consulta recibe «no existe»", …);
it("propio punto: con otro admin activo lanza; sin otro, abre con la marca", () => revertida(sql, async (tx) => {
  /* punto con responsable = admin de prueba; abrirVerificacion → rejects /Otro Administrador del SGC/;
     UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc' AND id <> admin (dentro de la transacción) → abre con propioPunto true */
}));
```

`tests/copias-recogida.test.ts`: el caso de «no se encontró» pasa a comprobar
`hallazgos.origen = 'recogida'` por `abrirHallazgoDeRecogida` (mismo comportamiento).
`tests/verificaciones-rutas.test.ts`: subir una foto a un ítem de una verificación abierta → 201
con `contexto = 'verificacion_item'`; a una cerrada → 409; `GET` de la foto: responsable 200,
`consulta` ajeno 404. `tests/proxy-matcher.test.ts`: `/api/verificaciones/5/items/9/archivos` fuera;
`/api/verificaciones/5/items/9/archivos/3` y `/distribucion/verificaciones/5/archivos/3/foto.png` dentro.
`tests/verificaciones-pantalla.test.tsx`: `ItemChequeo` con `no_conforme` muestra nota, casilla y
foto; `ResumenCierre` dice «7 de 9 ítems conformes · Punto no conforme».

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/verificaciones.test.ts tests/verificaciones-rutas.test.ts tests/verificaciones-pantalla.test.tsx tests/proxy-matcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Consultas, alcance, rutas y acciones** con las firmas de **Produces**;
`cerrarVerificacion(id, sesion, datos: { retirados: number[] }, opciones?)`.

- [ ] **Step 4: Pantalla de la verificación**, maqueta 3, probada a 390 px.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/verificaciones.test.ts tests/verificaciones-rutas.test.ts tests/verificaciones-pantalla.test.tsx tests/copias-recogida.test.ts tests/proxy-matcher.test.ts tests/handlers-permisos.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13b): verificación de puntos de uso con lista generada, hallazgos al cerrar y fotos por ítem"
```

---

### Tarea 13: Pestaña Verificaciones, tareas de verificar y corregir, vencimientos de toda la entrega

**Files:**
- Create: `src/db/consultas/distribucion/vencimientos.ts`, `src/lib/distribucion/verificaciones-excel.ts`,
  `src/app/(app)/distribucion/verificaciones/page.tsx`, `src/app/(app)/distribucion/verificaciones/excel/route.ts`,
  `src/app/(app)/distribucion/copias/excel/route.ts`, `src/lib/distribucion/copias-excel.ts`,
  `src/componentes/distribucion/verificaciones/{EstadoPuntos,HistorialVerificaciones,TablaHallazgos}.tsx`,
  `tests/distribucion-vencimientos.test.ts`, `tests/distribucion-excel.test.ts`
- Modify: `src/db/consultas/vencimientos.ts` (`revisarVencimientos`), `src/db/consultas/distribucion/tareas.ts`,
  `src/lib/tareas.ts`, `tests/distribucion-tareas.test.ts`, `tests/vencimientos.test.ts`, `tests/handlers-permisos.test.ts`

**Interfaces:**
- Consumes: `conformidad`, `verificacionVencida` (Tarea 3); `ultimaVerificacionDe`,
  `hallazgosAbiertosDe` (Tarea 12); `supervisoresDe`, `jefesDe`-equivalente y `avisar` de
  `vencimientos.ts` (hoy privados: se exportan como `avisarA(tx, aviso, destinatarios)` y
  `jefesDe(tx, responsables)` sin cambiar su cuerpo); `estadoPlazo`.
- Produces (`distribucion/tareas.ts`): `tareasDeVerificacion(sesion, opciones?)` →
  para `verificaciones.realizar`, `verificacion:<puntoId>` «Verificar Farmacia: última hace 95 días»
  o «Verificar Farmacia: nunca verificado» por cada punto activo con `verificacionVencida`,
  `vence` = última cerrada + `verificacionCadaDias` (o `null`), enlace
  `/distribucion/verificaciones/nueva?punto=<id>`; `tareasDeHallazgos(sesion, opciones?)` →
  `hallazgo:<id>` «Corregir hallazgo en Farmacia: <descripción recortada a 80>» para el
  responsable actual del punto, `vence` = `vence_en`, enlace a la verificación o a la copia.
  `misTareas()` concatena todas las fuentes en este orden: trámites, copias, acuses,
  socialización, verificación, hallazgos.
- Produces (`distribucion/vencimientos.ts`):
  - `revisarVencimientosDeDistribucion(opciones: { sql: Cliente; ahora: Date; config: ConfigDocumental }): Promise<{ avisados: number; escalados: number }>`:
    cinco pasadas, cada fila en su transacción corta con `FOR UPDATE SKIP LOCKED`, sin
    `auditoria`:
    1. copias `emitida` con `vence_en < ahora` sin `aviso_vencido_en` → aviso `distribucion.vencido`
       al responsable actual del punto **y** a quien emitió («La copia N.º 02 de GTH-PR-02 v2 en
       Urgencias sigue sin recibido»); escalado a `jefesDe([responsable])` pasados
       `escalamientoDias` más, sin título ni enlace;
    2. copias `por_recoger` vencidas → igual, al responsable («… sigue sin recogerse»);
    3. acuses `pendiente` vencidos, **agrupados por versión** (una transacción por versión, con
       las filas de esa versión bloqueadas): aviso a cada persona «GTH-PR-02 v2: su lectura venció
       hace N días»; escalado: `jefesDe(personas)` y **un aviso por jefe** «N lecturas vencidas de
       <nombres>» sin títulos ni enlaces (F13A-DC27);
    4. `socializaciones_requeridas` vencidas sin cumplir ni superar → a los líderes del propietario
       (o Admin SGC) y escalado a sus jefes;
    5. `hallazgos` abiertos vencidos → al responsable; escalado a sus jefes.
  - `revisarVencimientos` (`vencimientos.ts`) llama al final
    `revisarVencimientosDeDistribucion({ sql, ahora, config })` y suma sus conteos. El disparo
    del cascarón no cambia.
- Produces (Excel): `construirExcelCopias(filas: Copia[], meta): Promise<Buffer>` (Número,
  Documento, Versión, Punto, Sede, Entregada a, Emitida por, Emitida el, Estado, Recibida el, Por
  recoger desde, Recogida el, Destino, Reemplaza a) y `construirExcelVerificaciones(filas: { punto; sede; cerradaEn; verificoNombre; conforme; itemsConformes; itemsTotal; hallazgosAbiertos; propioPunto }[], meta)`;
  rutas `GET /distribucion/copias/excel` y `GET /distribucion/verificaciones/excel` con
  `distribucion.ver`, el alcance de la sesión, auditoría `exporto_copias` / `exporto_verificaciones`.
- Produces (pantalla `/distribucion/verificaciones`): `EstadoPuntos` (una fila por punto activo:
  última verificación, resultado, hallazgos abiertos, próxima; botón «Verificar» con
  `verificaciones.realizar`; `TarjetaCifra` con «Conformidad actual: 86 % · umbral 95 %» y la
  insignia «Por debajo del umbral»/«Cumple»), `HistorialVerificaciones` con filtros de punto, fechas
  y resultado, y por ítem «qué falla más» (conteo de `no_conforme` por texto en el periodo),
  `TablaHallazgos` (abiertos y cerrados). «Descargar Excel» en las dos listas.

- [ ] **Step 1: Tests que fallan**

`tests/distribucion-tareas.test.ts`: un admin ve «Verificar <punto>: nunca verificado» para un
punto nuevo y no para uno con verificación cerrada hace 10 días (con `ahora` fijo); el responsable
ve «Corregir hallazgo en …». `tests/distribucion-vencimientos.test.ts` (patrón de
`tests/vencimientos.test.ts`: silenciar lo demás con `aviso_vencido_en = now()`):

```ts
it("acuses vencidos: un aviso por persona y uno por jefe con los nombres, sin título", () => revertida(sql, async (tx) => {
  const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
  const [{ id: gth }] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
  const a = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth], jefeId: jefe.usuarioId });
  const b = await usuarioDePrueba(tx, { rol: "consulta", procesos: [gth], jefeId: jefe.usuarioId });
  const t = await tramiteEn(tx, "publicacion", { principal: await pdfDePrueba([[612, 792]]) });
  try {
    await transicionar(t.admin, { /* publicar */ }, opc(tx, "2026-11-01T15:00:00Z"));   // vence el 16/11
    await silenciarOtros(tx);
    const r1 = await revisarVencimientos({ sql: tx, ahora: new Date("2026-11-17T15:00:00Z") });
    expect(r1.avisados).toBeGreaterThanOrEqual(2);
    expect((await tx`SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = ${jefe.usuarioId} AND tipo = 'distribucion.escalado'`)[0].n).toBe(0);
    const r2 = await revisarVencimientos({ sql: tx, ahora: new Date("2026-11-20T15:00:00Z") });
    const [aviso] = await tx`SELECT titulo, cuerpo, enlace FROM notificaciones WHERE usuario_id = ${jefe.usuarioId} AND tipo = 'distribucion.escalado'`;
    expect(aviso.enlace).toBeNull(); expect(aviso.titulo).not.toContain(t.codigo); expect(aviso.cuerpo).toContain(a.nombre); expect(aviso.cuerpo).toContain(b.nombre);
    expect((await tx`SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = ${jefe.usuarioId} AND tipo = 'distribucion.escalado'`)[0].n).toBe(1);
    await revisarVencimientos({ sql: tx, ahora: new Date("2026-11-21T15:00:00Z") });                // no repite
    void r2;
  } finally { await t.limpiar(); }
}));
it("copia sin recibido vencida avisa al responsable y al emisor; por recoger vencida al responsable", …);
it("socialización requerida y hallazgo vencidos avisan y escalan una sola vez", …);
```

`tests/distribucion-excel.test.ts`: los dos constructores con filas de ejemplo y una celda `=SUMA`.
`tests/handlers-permisos.test.ts`: las tres rutas de Excel responden 401/403/200 y auditan.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/distribucion-tareas.test.ts tests/distribucion-vencimientos.test.ts tests/distribucion-excel.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tareas, vencimientos y Excel** con las firmas de **Produces**.

- [ ] **Step 4: Pestaña Verificaciones** y los botones de Excel en Copias y Verificaciones.

- [ ] **Step 5: Verificar**

Run: `npx vitest run tests/distribucion-tareas.test.ts tests/distribucion-vencimientos.test.ts tests/vencimientos.test.ts tests/cascaron-vencimientos.test.ts tests/distribucion-excel.test.ts tests/handlers-permisos.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit y punto de control en navegador**

```bash
git add src tests
git commit -m "feat(f13b): pestaña Verificaciones con conformidad, tareas de verificar y corregir, vencimientos y Excel de la distribución"
```

Punto de control (a 390 px y en escritorio): verificar un punto con una copia por recoger y un
no conforme con foto, cerrar, ver el hallazgo en «Mis tareas» del responsable y cerrarlo; la
conformidad y el umbral en la pestaña; bajar los plazos en Configuración documental y ver los
avisos de vencimiento tras la revisión (adelantar `vence_en` con `psql` si hace falta).

---

### Tarea 14: Bitácora, agrupación de tareas, estado de distribución en el trámite y detalles transversales

**Files:**
- Modify: `src/lib/bitacora-detalle.ts`, `tests/bitacora-detalle.test.ts`, `src/lib/tareas.ts`
  (`agruparTareas`), `src/componentes/inicio/MisTareas.tsx`, `tests/tareas.test.ts`, `tests/inicio.test.tsx`,
  `src/app/(app)/tramites/[id]/page.tsx`, `src/componentes/tramites/PanelPublicacion.tsx` (o el
  bloque del trámite cerrado), `src/app/(app)/documentos/[codigo]/page.tsx` (aviso `?v=`),
  `src/app/(app)/admin/(panel)/usuarios/page.tsx` (nota de procesos), `tests/tramites-ui.test.tsx`

**Interfaces:**
- Produces (`bitacora-detalle.ts`): frases para `copia_emitida` («Emitió la copia controlada N.º 02
  de GTH-PR-02 v2 para Urgencias»), `copia_reimpresa`, `copia_recibida`, `copia_recogida` («…
  recogida: devuelta al SGC»), `copia_anulada`, `acuses_pedidos`, `acuse_lectura` («Confirmó la
  lectura de GTH-PR-02 v2»), `jornada_registrada` («Registró una socialización de GTH-PR-02 v2 con
  18 asistentes»), `jornada_anulada`, `verificacion_cerrada` («Cerró la verificación de Farmacia:
  no conforme, 2 hallazgos»), `verificacion_descartada`, `hallazgo_cerrado`, `crear_punto_uso`,
  `editar_punto_uso`, `activar_punto_uso`, `desactivar_punto_uso`, `crear_lista`, `editar_lista`,
  `activar_lista`, `desactivar_lista`, `exporto_copias`, `exporto_acuses`, `exporto_verificaciones`,
  `exporto_socializaciones`; y su entrada en `NOMBRE_DE_ACCION` para el filtro.
- Produces (`tareas.ts`): `agruparTareas(tareas: Tarea[], umbral = 5): Tarea[]` → si hay más de
  `umbral` tareas con prefijo `acuse:`, las reemplaza por una sola
  `{ id: "acuses", modulo: "documentos", titulo: "12 lecturas por confirmar", detalle: "La más próxima vence el <fecha>", vence: <la más próxima>, enlace: "/acuses" }`
  en la posición de la primera. `misTareas(sesion)` (que desde la Tarea 6 devuelve
  `{ tareas, total }`) aplica `agruparTareas` a `tareas` y deja en `total` el conteo real antes de
  agrupar; la barra lateral sigue mostrando `total`.
- Produces (trámite): con el trámite `publicado`, el bloque de publicación muestra «Distribución de
  la versión N: acuses 23 de 34 (68 %) · socialización registrada el … / requerida, vence el … ·
  copias: 3 recibidas, 2 por recoger» con enlace a la ficha (consultas de las Tareas 6, 9 y 11).
- Produces (ficha del portal): con `?v=<n>` distinto de la vigente, aviso «Esta copia es de la
  versión <n>; la vigente es la <m>» (F13B-DC4); con `?v` igual, «Esta copia corresponde a la
  versión vigente».
- Produces (Usuarios): nota bajo el campo Procesos: «Los procesos definen qué documentos
  restringidos ve la persona y de cuáles recibe tareas de lectura. Asigne a cada persona los
  procesos en los que trabaja, o use listas de distribución.».

- [ ] **Step 1: Tests que fallan**

`tests/bitacora-detalle.test.ts`: una frase por acción nueva con su `detalle` mínimo.
`tests/tareas.test.ts`: `agruparTareas` con 7 acuses y 2 trámites devuelve 3 tareas, la agrupada en
la posición del primer acuse con el título «7 lecturas por confirmar»; con 5 acuses no agrupa.
`tests/tramites-ui.test.tsx`: el bloque del trámite publicado pinta la distribución.
`tests/inicio.test.tsx`: `MisTareas` con la agrupada enlaza a `/acuses`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/bitacora-detalle.test.ts tests/tareas.test.ts tests/tramites-ui.test.tsx tests/inicio.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar** las cuatro piezas.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/bitacora-detalle.test.ts tests/tareas.test.ts tests/tramites-ui.test.tsx tests/inicio.test.tsx tests/cascaron.test.tsx tests/bitacora.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13b): frases de bitácora, agrupación de lecturas en Mis tareas, distribución en el trámite cerrado y aviso de versión por QR"
```

---

### Tarea 15: Semilla demo de la distribución (resiembra)

**Files:**
- Create: `src/db/semillas/distribucion-demo.ts`, `tests/semilla-distribucion.test.ts`
- Modify: `src/db/semillas/demo.ts` (`sembrarEstructuraYUsuarios`, llamada a `sembrarDistribucion`),
  `src/db/semillas/minima.ts` (nada que insertar: las claves se leen con sus defectos; verificar),
  `tests/utiles/demo.ts` (`exigirDemoIntacta` cuenta 7 puntos y los estados sembrados),
  `tests/semilla-tramites.test.ts`, `CONTEXT.md` (tabla de usuarios demo, en la Tarea 16)

**Interfaces:**
- Consumes: las funciones reales de las Tareas 4 a 12 (`crearPuntoUso`, `emitirCopia`,
  `confirmarRecibido`, `alDejarDeSerVigente` ya corrió al publicar `GTH-CA-01` v3 en la semilla de
  trámites, `crearLista`, `guardarAudiencia`, `pedirAcuses`, `confirmarLectura`,
  `registrarJornada`, `abrirVerificacion`, `guardarAvance`, `cerrarVerificacion`), con `ahora`
  fijo por paso como hace `sembrarTramites`; `archivoDemo` para el PDF del acta de la jornada.
- Produces (`sembrarDistribucion(sql: Sql, c: { usuarioPorNombre; documentoPorCodigo; procesoPorSigla })`),
  llamado después de `sembrarTramites`, que deja exactamente (spec §16):
  - `usuario_procesos`: `consulta` → AIN y CEX; `coordinadora.sgc` → SGC; `gerente` y
    `control.interno` sin procesos. Usuarios nuevos en `sembrarEstructuraYUsuarios`:
    `jefe.urgencias` («Luz Dary Ortiz», `consulta`, cargo Enfermera Jefe, AIN) y
    `regente.farmacia` («Carlos Andrés Rojas», `consulta`, cargo nuevo «Regente de Farmacia» en
    Subgerencia Científica con superior Subgerente Científico, ATE), clave demo y aviso aceptado.
  - Siete puntos: Urgencias (`jefe.urgencias`, AIN), Farmacia (`regente.farmacia`, ATE),
    Laboratorio (`consulta`, ADX), Vacunación (`consulta`, PYM), Odontología (`lider.cex`, CEX),
    Talento Humano (`lider.gth`, GTH), Archivo (`coordinadora.sgc`, GDO); todos en sede «Sede
    principal».
  - Dos listas: «Todo el hospital» (las cinco áreas) y «Personal asistencial» (área Subgerencia
    Científica). `GTH-CA-01` con «Todo el hospital» y `lectura_obligatoria_ingreso = true`.
  - Copias de `GTH-CA-01` v3: Talento Humano N.º 01 **recibida** (emitida por `lider.gth`, en el
    acto), Urgencias N.º 02 **emitida** hace 4 días por `coordinadora.sgc` (sin recibido, vence en
    −1 día: ya vencida); una copia de la v2 en Archivo **por recoger** desde la publicación de la v3
    (se emite y se recibe con `ahora` anterior a la publicación sembrada y después se corre
    `alDejarDeSerVigente` para la v2 con la fecha de esa publicación); una copia anulada por error
    (Vacunación, motivo `error`).
  - Acuses de `GTH-CA-01` v3: `pedirAcuses` con la fecha de publicación (la semilla de trámites
    publicó sin acuses porque entonces no existían: por eso el pedido manual, origen
    `solicitud_manual`); `consulta` y `jefe.urgencias` confirmados (`individual`, con una fila de
    `eventos_consulta` previa), dos por firma (los firmantes del trámite), `regente.farmacia` por
    asistencia, el resto pendientes y uno con `vence_en` ya pasado.
  - Jornada del 14 de octubre de 2026, «reunión de servicio», facilitó `lider.gth`, versión
    `GTH-CA-01` v3, asistentes `regente.farmacia`, `lider.cex`, `jefe.urgencias` y `consulta`, con
    un PDF de acta generado por `archivoDemo` como evidencia (contexto `jornada`).
  - Verificaciones: Farmacia **cerrada y conforme** hace 95 días, abierta cuando el punto aún no
    tenía copias (solo los tres ítems fijos, conformes); Urgencias **cerrada** hace 20 días, antes
    de emitir sus copias, con «Sin copias no controladas» no conforme y un **hallazgo abierto**
    («Copia no controlada de AIN-FO-01») para `jefe.urgencias`, con fecha de corrección a 5 días
    de entonces (vencido).
  - `notificaciones` y `auditoria` con lo que esas funciones escriban (es la demo).
- Produces (`tests/semilla-distribucion.test.ts`): comprueba los estados de arriba con
  `exigirDemo` y los conteos (7 puntos, 4 copias de `GTH-CA-01`, estados, porcentaje de la v3,
  1 jornada con 4 asistentes y 1 evidencia, 2 verificaciones cerradas, 1 hallazgo abierto);
  `exigirDemoIntacta` suma «7 puntos y 2 verificaciones cerradas» a su condición.

- [ ] **Step 1: Test que falla**

Escribir `tests/semilla-distribucion.test.ts` con las aserciones de **Produces**.

Run: `npx vitest run tests/semilla-distribucion.test.ts`
Expected: FAIL (sin puntos sembrados; o salta si la demo ya se usó: correr con `SEMILLA_RECIEN=1`
tras resembrar, en el Step 3).

- [ ] **Step 2: Semilla**

`distribucion-demo.ts` con las funciones reales y fechas fijas relativas a `sembradaEn`
(`now()` de la siembra menos N días), nunca `INSERT` directos salvo `eventos_consulta` (vista
previa al acuse) y el `UPDATE` de `vence_en` para dejar vencidos (como la semilla de trámites deja
SOL-2026-003 vencida).

- [ ] **Step 3: Resembrar y verificar** (avisar al usuario antes)

Run: `npm run db:seed && npm run admin:asegurar`
Run: `$env:SEMILLA_RECIEN=1; npm test` (PowerShell) — toda la suite con la demo recién sembrada.
Expected: PASS, sin saltos.

- [ ] **Step 4: Commit**

```bash
git add src/db/semillas tests
git commit -m "feat(f13b): demo de la distribución - puntos de uso, copias, acuses, jornada y verificaciones"
```

---

### Tarea 16: Documentación de cierre y verificación final

**Files:**
- Create: `docs/manual/usuario/06-distribucion-copias-controladas-acuses-y-puntos-de-uso.md`
- Modify: `docs/manual/usuario/02-usuarios-cargos-y-procesos.md` (procesos y audiencia),
  `03-conocer-la-plataforma.md` (entrada Distribución, tareas nuevas),
  `05-documentos-solicitar-elaborar-revisar-aprobar-y-publicar.md` (casilla de socialización,
  estado del trámite cerrado), `CONTEXT.md`, `AGENTS.md`, `PLAN.md`, `README.md`

- [ ] **Step 1: Manual**

Capítulo 6 con una sección por actor (spec §19): el responsable de un punto (recibir, recoger,
reemplazo, corregir un hallazgo), cualquier persona (confirmar una lectura; qué pasa si no abre
el documento), el líder (emitir, reimprimir, reemplazar, registrar una socialización, su
porcentaje), el Administrador del SGC (puntos de uso, listas, audiencia de un documento, pedir
acuses, verificar con el celular, cerrar hallazgos, configuración de plazos, umbral y sello,
`url_publica`). Incluye: la recomendación de asignar procesos a todo el personal, el QR y la
intranet en el celular, y los dos ajustes al texto del procedimiento (SGC-RG-02 y las evidencias
de socialización). Capítulos 2, 3 y 5 corregidos donde esta entrega los deja falsos.

- [ ] **Step 2: `AGENTS.md`**

Añadir, sin reescribir lo demás: en las reglas de seguridad, las rutas de subida nuevas fuera del
`matcher` y las tablas inmutables nuevas (`copia_eventos`, `acuse_eventos`) en la regla 5 y en el
piso 10; en convenciones, «Toda escritura de la distribución exige su permiso de matriz más la
condición de persona (responsable del punto, destinatario del acuse)», «`archivos` admite dueños
distintos de una versión (`contexto`); el control de acceso de un archivo es el de su dueño» y
«Una versión deja de ser vigente solo por `aplicarPublicacion`, `anularVigenteEn` o
`deshacerCarga`, que llaman `alDejarDeSerVigente`»; la excepción F12-D35 pasa a decir que el acuse
sí se audita (`acuse_lectura`).

- [ ] **Step 3: `CONTEXT.md`, `PLAN.md`, `README.md`**

`CONTEXT.md`: punto de reanudación (13B en la rama, lo que sigue: 13C), «Qué probar y cómo (Fase
13B)» con el recorrido de §18 del spec paso a paso y la tabla de usuarios demo (dos nuevos), «Hecho
(Fase 13B)», decisiones F13B-DC1 a DC27 con su base, deuda técnica nueva y «Avisos para el
usuario» (franja y pie del formato real, QR e intranet, `url_publica`). `PLAN.md`: la fila 13B con
✅ y fecha. `README.md`: rutas y permisos nuevos si los lista.

- [ ] **Step 4: Verificación final**

Run: `npm run lint && npm test && npm run build` (el build sin `DATABASE_URL`, como el CI).
Run: `docker compose -f docker-compose.dev.yml up -d --build --no-deps app` y luego
`curl http://localhost:9081/api/salud` → `{"estado":"ok"}`; el log dice «Migraciones al día» con
**siete** migraciones.
Aplicar la 0006 sobre una copia de la base con la demo de `main` (`pg_dump` → base `sgc_copia` →
`DATABASE_URL_MIGRADOR` apuntando a ella → `npm run db:migrate`): sin errores, `archivos` con
todas sus filas en `contexto = 'version'`, y los tests de esquema en verde contra la copia. Borrar
la copia.
Recorrido de §18 del spec en navegador (claro, oscuro y 390 px), con capturas de los pasos 2, 3,
6, 9 en la bitácora de la sesión.

- [ ] **Step 5: Commit**

```bash
git add docs CONTEXT.md AGENTS.md PLAN.md README.md
git commit -m "docs: cierre de la Fase 13B - manual, CONTEXT.md, AGENTS.md y PLAN.md"
```

Entregar al usuario: qué probar y cómo (ya en `CONTEXT.md`), los dos usuarios demo nuevos, el aviso
de `url_publica`, y pedir la fusión a `main` cuando él lo decida (sin `push` ni `merge` sin su
palabra).
