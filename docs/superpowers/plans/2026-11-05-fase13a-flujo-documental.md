# Fase 13A — Flujo documental: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar al sistema los pasos 1 a 8 del procedimiento de control de documentos del
hospital: solicitud con visto bueno, aceptación con duplicidad asistida y código correlativo,
elaboración, revisión con lista de verificación, aprobación y publicación firmadas con clave
y acta en PDF; con visibilidad por rol y nivel de acceso, tareas y avisos, y la carga de los
documentos ya aprobados.

**Architecture:** Un trámite es una fila de `tramites` que avanza por etapas. Toda transición
pasa por una sola función del servidor (`transicionar`) que, en una transacción con la fila
bloqueada, evalúa una tabla de reglas puras, verifica la firma si la acción firma, ejecuta el
manejador de esa acción y deja evento, auditoría y avisos. La versión en trámite es una fila
`borrador` de `documento_versiones`, así que la subida de archivos y la transacción de
publicar existentes se reutilizan. La visibilidad de documentos se decide en un solo módulo
(`src/lib/alcance.ts`) que todas las consultas usan.

**Tech Stack:** Next.js 16.4 (App Router, Server Actions, route handlers), TypeScript
estricto, PostgreSQL 16 con `postgres` (SQL etiquetado) y Drizzle para el esquema y las
migraciones, `zod` 4, `pdf-lib` (acta y marca de agua), `otpauth`, Tailwind 4 con los
componentes base de `src/componentes/ui`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-fase13a-flujo-documental-design.md` («el spec»),
que detalla y corrige al spec maestro
`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` (§5.1, §5.3, §5.6, §5.9,
§6.1, §8 Fase 13). Las decisiones del spec se citan como F13A-DCn.

## Avisos para quien ejecuta

- **La base de desarrollo se vuelve a sembrar dos veces** (`npm run db:seed` y luego
  `npm run admin:asegurar`): en la **Tarea 2** (la demo adopta la convención de códigos) y en
  la **Tarea 15** (trámites de demostración). El controlador avisa al usuario antes de la
  primera: ya perdió datos de prueba con la resiembra de la Fase 12.
- **La demo gana un segundo Admin SGC en la Tarea 15:** `coordinadora.sgc`, con la clave
  demo y sin cambio obligatorio, como los demás usuarios demo. Hasta ahora ningún Admin SGC
  venía en la semilla (se crea con `admin:asegurar`); hace falta porque un trámite sembrado
  como publicado necesita un Admin SGC que lo firme. La semilla demo es solo de desarrollo.
  El controlador se lo dice al usuario al entregar el plan.
- **Puntos de control en navegador del controlador:** después de las Tareas 7 (pedir y
  aceptar), 11 (trámite completo con acta) y 15 (demostración de §20 del spec).
- **Hallazgo al planear:** el panel nunca tuvo cómo editar `documento_relaciones` (hoy solo
  las llena la semilla). La Tarea 13 añade ese selector; el spec §8.6 las cuenta entre los
  datos de catálogo.
- No se lee `.env.local`. No se detiene ni se borra el servicio `bd` ni su volumen. No se
  hace `push` ni `merge` sin que el usuario lo pida.

## Global Constraints

- Node 24 en desarrollo, CI e imagen. TypeScript estricto, sin `any` salvo justificación
  puntual. Dominio, interfaz y código en español.
- **Sin dependencias npm nuevas.**
- **Migración aplicable sobre una base de `sgc-suaza`:** no se renombra ni se borra ninguna
  tabla ni columna heredada. Se permite ampliar un `CHECK` y sustituir una restricción única
  por un índice único parcial que los datos heredados ya cumplen.
- **Una sola versión vigente:** el índice `versiones_una_vigente_idx` y el `CHECK`
  `versiones_vigente_con_aprobacion` no se tocan. Publicar es una sola transacción.
- **Toda escritura exige sesión y un permiso de la matriz** `src/lib/permisos.ts`. Las
  acciones del trámite viven en `src/app/acciones-tramites.ts`, cada una con
  `mutacion(formData, "<permiso>", fn)`; `tests/acciones-permisos.test.ts` las cubre.
- **Toda transición del trámite entra por `transicionar`** (`src/db/consultas/tramites-flujo.ts`).
  Ningún otro código cambia `tramites.etapa`.
- **Toda consulta nueva recibe la conexión como última opción** (`opciones?: { sql?: Cliente }`,
  por defecto `obtenerSql()`), como ya hace `crearNotificacion`: los tests del flujo corren
  dentro de una transacción que se revierte (`tests/utiles/transaccion.ts`).
- Esquemas `zod` `.strict()` leídos con `parsearFormulario`; un `id` de ruta se lee con
  `idNumerico()` y `omitir: ["id"]`. Ninguna acción vuelca el formulario en un `UPDATE`.
- Cada página nueva llama `exigirSesion()` o `exigirPermiso(permiso)`; cada handler nuevo usa
  `sesionDePeticion`, autoriza y, si escribe, `origenValido()`.
- **`firmas` y `tramite_eventos` son de solo inserción.** Nunca `UPDATE` ni `DELETE` sobre
  ellas, ni sobre `auditoria` y `accesos`, tampoco en la limpieza de un test.
- Quien no puede ver un trámite, un borrador o un documento restringido recibe **«no
  encontrado»** (404), nunca «sin permiso».
- Fechas y plazos en la zona de la instalación (`zonaHoraria()`); la BD guarda `timestamptz`.
- Sin `dangerouslySetInnerHTML`; justificación, observaciones y conceptos son texto plano.
  Todo Excel que se toque sigue pasando por `neutralizarFormula`.
- Interfaz dentro del cascarón, con los componentes de `src/componentes/ui` y clases de
  token (`bg-marca-relleno`, `text-estado-critico-texto`, `bg-muted`); nunca los alias `azul`
  ni `verde` en líneas nuevas, ni colores fijos de Tailwind. Sin `<main>` propio. Estado
  nunca solo por color. Teclado, foco visible, AA en claro y oscuro, 390 px.
- Textos de interfaz: «Coordinador SGC» no aparece como nombre de rol; el rol se llama como
  hoy lo llama `src/lib/roles.ts`.
- Todos los archivos con finales de línea LF.
- Commits convencionales en español con el trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. **Responsable desactivado a mitad de un trámite.** El trámite no puede quedar sin salida:
   la bandeja lo sigue mostrando y `tramites.gestionar` lo reasigna. Test en la Tarea 12.
2. **Firma con la cuenta ya bloqueada desde otra pestaña.** La clave no se evalúa aunque sea
   correcta, y la sesión se cierra. Test en la Tarea 5.
3. **El acta falla al generarse después del commit.** La publicación queda en pie y el enlace
   del acta la genera a pedido. Test en la Tarea 11.
4. **Un elaborador con rol `consulta` sube a un trámite ajeno, o al suyo fuera de
   `elaboracion`.** Recibe 404 en el ajeno y 409 en el suyo. Test en la Tarea 8.
5. **Borrador heredado sobre un documento con versión vigente** (base de `sgc-suaza`). No se
   publica por el camino directo; se descarta. Test en la Tarea 13.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `drizzle/0004_*.sql`, `src/db/esquema.ts` | Tablas y restricciones nuevas | 1 |
| `tests/utiles/transaccion.ts` | Correr un test en una transacción que se revierte | 1 |
| `src/lib/tramites/codigo.ts` | Formato del código: validar, generar, siguiente consecutivo | 2 |
| `src/lib/tramites/tipos.ts` | Tipos, listas fijas y etiquetas del trámite | 3 |
| `src/lib/tramites/transiciones.ts` | Tabla de transiciones (regla pura) | 3 |
| `src/lib/tramites/separacion.ts` | S1 a S3 y quién puede ser designado | 3 |
| `src/lib/tramites/plazos.ts` | Fecha límite y estado del plazo | 3 |
| `src/lib/alcance.ts` | Regla única de visibilidad de documentos y de trámites | 4, 6 |
| `src/lib/firma.ts`, `src/db/consultas/firmas.ts` | Verificar la clave para firmar; registrar la firma | 5 |
| `src/db/consultas/config-documental.ts` | Formato, plazos, publicación directa, ítems de la lista | 6, 14 |
| `src/db/consultas/tramites-flujo.ts` | `crearSolicitud` y `transicionar` (punto único) | 6 |
| `src/db/consultas/flujo/*.ts` | Un manejador por grupo de acciones | 6 a 12 |
| `src/db/consultas/tramites.ts` | Lecturas: bandeja, detalle, participación | 6 |
| `src/app/acciones-tramites.ts` | Server Actions del trámite | 6 a 12 |
| `src/app/(app)/tramites/**` | Bandeja, nueva solicitud, página del trámite, archivos | 6 a 12 |
| `src/componentes/tramites/*.tsx` | Paneles de la página del trámite | 6 a 12 |
| `src/db/consultas/parecidos.ts`, `codigos.ts` | Duplicidad asistida; código sugerido | 7 |
| `src/lib/recepcion-archivo.ts` | Núcleo de la subida, compartido por los dos handlers | 8 |
| `src/db/consultas/revision.ts` | Lista de verificación y observaciones | 9 |
| `src/lib/huella.ts` | SHA-256 de un archivo del almacén | 10 |
| `src/lib/acta.ts`, `src/db/consultas/actas.ts` | PDF del acta; guardarla y servirla | 11 |
| `src/db/consultas/vencimientos.ts` | Avisos de vencimiento y escalamiento | 12 |
| `src/app/admin/acciones-config-documental.ts`, `…/configuracion-documental/page.tsx` | Pantalla de configuración | 14 |

---

### Tarea 1: Migración 0004, esquema, roles y privilegios

**Files:**
- Create: `drizzle/0004_fase13a-flujo.sql` (con `npm run db:generate -- --name fase13a-flujo`,
  más SQL a mano), `tests/utiles/transaccion.ts`, `tests/esquema-fase13a.test.ts`
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts:46`, `src/db/semillas/minima.ts`
  (`limpiarTodo`), `tests/privilegios-bd.test.ts`

**Interfaces:**
- Consumes: `sgc_impedir_modificacion()` (ya existe, `drizzle/0002_fase11-acceso.sql:80`).
- Produces (nombres definitivos de BD; todo lo demás del plan los usa):
  - `tipos_documento.autoridad text NOT NULL DEFAULT 'operativo'` con `CHECK IN ('estrategico','operativo')`;
    `tipos_documento.plantilla_documento_id bigint NULL REFERENCES documentos(id) ON DELETE RESTRICT`.
  - `documentos.nivel_acceso text NOT NULL DEFAULT 'general'` con `CHECK IN ('general','restringido')`.
  - `documento_versiones.origen_aprobacion text NOT NULL DEFAULT 'fuera'` con
    `CHECK IN ('plataforma','fuera')`; `documento_versiones.publicado_en timestamptz NULL`.
  - `versiones_estado_valido` admite además `'descartado'`.
  - Se elimina la restricción `versiones_documento_numero_unico` y se crea el índice único
    `versiones_documento_numero_unico_idx` sobre (`documento_id`, `numero`) `WHERE estado <> 'descartado'`.
  - `archivos_rol_valido` admite además `'acta_aprobacion'` y `'acta_eliminacion'`; índice único
    `archivos_un_acta_idx` sobre (`version_id`, `rol`) `WHERE rol IN ('acta_aprobacion','acta_eliminacion')`.
  - `accesos_resultado_valido` admite además `'firma_fallo'`.
  - Tabla `tramites`: `id`; `numero text NOT NULL UNIQUE`; `anio integer NOT NULL`;
    `consecutivo integer NOT NULL` (único con `anio`); `tipo` (`crear`, `modificar`,
    `eliminar`); `motivo` (`cambio_normativo`, `mejora`, `no_conformidad`,
    `solicitud_personal`, `revision_anual`); `justificacion text NOT NULL`;
    `solicitante_id` → `usuarios`; `proceso_id NOT NULL` → `procesos` (el propietario);
    `subproceso_id NULL` → `subprocesos`; `tipo_documento_id NULL` → `tipos_documento`;
    `titulo_propuesto text NULL`; `documento_id NULL` → `documentos`; `version_id NULL` →
    `documento_versiones`; `etapa text NOT NULL` (`visto_bueno`, `aceptacion`, `elaboracion`,
    `revision`, `aprobacion`, `publicacion`, `publicado`, `eliminado`, `rechazado`,
    `cancelado`); `ronda integer NOT NULL DEFAULT 0`; `elaborador_id`, `revisor_id`,
    `aprobador_id NULL` → `usuarios`; `vence_en`, `aviso_vencido_en`, `escalado_en`,
    `cerrado_en timestamptz NULL`; `motivo_cierre text NULL`; `creado_en`, `actualizado_en`.
    Todas las FK con `ON DELETE RESTRICT`. Índices por `proceso_id` y por `etapa`. Índice único
    `tramites_uno_abierto_idx` sobre (`documento_id`)
    `WHERE etapa IN ('visto_bueno','aceptacion','elaboracion','revision','aprobacion','publicacion')`.
  - Tabla `tramite_eventos`: `id`, `tramite_id`, `tipo text NOT NULL`, `usuario_id NULL`,
    `ronda integer NOT NULL`, `detalle jsonb NOT NULL DEFAULT '{}'`, `creado_en`; índice
    (`tramite_id`, `creado_en`). Trigger `tramite_eventos_inmutable`.
  - Tabla `firmas`: `id`, `tramite_id`, `version_id NULL`, `usuario_id`, `firma` (`elaboro`,
    `reviso`, `aprobo`, `publico`), `ronda integer NOT NULL`, `hash_sha256 text NOT NULL`,
    `nombre_firmante text NOT NULL`, `cargo_firmante text NULL`, `metodo` (`clave`,
    `clave_totp`), `ip inet NULL`, `user_agent text NULL`, `creado_en`; índices por
    `tramite_id` y por `version_id`. Trigger `firmas_inmutable`.
  - Tabla `tramite_observaciones`: `id`, `tramite_id`, `numero integer NOT NULL` (único con
    `tramite_id`), `ronda`, `origen` (`revision`, `aprobacion`), `texto`, `autor_id`,
    `creado_en`, `respuesta NULL`, `respondida_por NULL`, `respondida_en NULL`, `estado`
    (`abierta`, `atendida`, `cerrada`; por defecto `abierta`), `cerrada_por NULL`,
    `cerrada_en NULL`, `nota_reapertura NULL`.
  - Tabla `tramite_verificaciones`: `id`, `tramite_id`, `ronda`, `item_id` →
    `lista_verificacion_items`, `texto_item`, `critico boolean`, `resultado` (`cumple`,
    `no_cumple`, `no_aplica`), `nota NULL`; único (`tramite_id`, `ronda`, `item_id`).
  - Tabla `lista_verificacion_items`: `id`, `texto text NOT NULL`, `critico boolean NOT NULL
    DEFAULT false`, `orden integer NOT NULL`, `activo boolean NOT NULL DEFAULT true`.
  - `tests/utiles/transaccion.ts`:
    `export async function revertida<T>(sql: Sql, fn: (tx: TransactionSql) => Promise<T>): Promise<T>`
    (corre `fn` en `sql.begin`, guarda su resultado, lanza un centinela para forzar el
    `ROLLBACK` y devuelve el resultado; un error de `fn` se propaga tal cual).

- [ ] **Step 1: Tests que fallan**

`tests/esquema-fase13a.test.ts` (BD de desarrollo; `sql` conectado como la app, igual que
`tests/esquema.test.ts`). Dentro de una transacción abortada no se puede seguir: cada
inserción que debe fallar va en `tx.savepoint(...)`.

```ts
const fallaCon = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code ?? "sin-codigo");

it("los valores por defecto describen lo heredado", async () => {
  const filas = await sql`SELECT table_name || '.' || column_name AS columna, column_default FROM information_schema.columns
    WHERE (table_name, column_name) IN (('tipos_documento', 'autoridad'), ('documentos', 'nivel_acceso'), ('documento_versiones', 'origen_aprobacion'))
    ORDER BY 1`;
  expect(filas.map((f) => `${f.columna}=${String(f.column_default).split("::")[0]}`)).toEqual([
    "documento_versiones.origen_aprobacion='fuera'", "documentos.nivel_acceso='general'", "tipos_documento.autoridad='operativo'",
  ]);
});

it("una versión descartada libera su número", () => revertida(sql, async (tx) => {
  const [d] = await tx`SELECT documento_id AS id, max(numero) + 1 AS n FROM documento_versiones GROUP BY documento_id LIMIT 1`;
  const insertar = (estado: string) => tx.savepoint((s) =>
    s`INSERT INTO documento_versiones (documento_id, numero, estado) VALUES (${d.id}, ${d.n}, ${estado})`);
  await insertar("descartado");
  await insertar("borrador");                                  // mismo número: no choca
  expect(await fallaCon(insertar("borrador"))).toBe("23505");  // dos no descartadas sí chocan
}));

it("un solo trámite abierto por documento", () => revertida(sql, async (tx) => {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const [d] = await tx`SELECT d.id, COALESCE(dp.proceso_id, s.proceso_id) AS proceso_id FROM documentos d
    JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id LIMIT 1`;
  const crear = (consecutivo: number, etapa: string) => tx.savepoint((s) =>
    s`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, documento_id, etapa)
      VALUES (${`SOL-9999-${consecutivo}`}, 9999, ${consecutivo}, 'modificar', 'mejora', 'prueba', ${u.id}, ${d.proceso_id}, ${d.id}, ${etapa})`);
  await crear(1, "publicado");
  await crear(2, "elaboracion");
  expect(await fallaCon(crear(3, "revision"))).toBe("23505");
}));

it("los CHECK nuevos aceptan y rechazan lo debido", () => revertida(sql, async (tx) => {
  const [v] = await tx`SELECT id FROM documento_versiones LIMIT 1`;
  const acta = (rol: string, ruta: string) => tx.savepoint((s) =>
    s`INSERT INTO archivos (version_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
      VALUES (${v.id}, ${rol}, ${ruta}, 'acta.pdf', 'pdf', 'application/pdf', 10, 'x')`);
  await acta("acta_aprobacion", "zz/acta-1.pdf");
  expect(await fallaCon(acta("acta_aprobacion", "zz/acta-2.pdf"))).toBe("23505");
  expect(await fallaCon(acta("acta", "zz/acta-3.pdf"))).toBe("23514");
  expect(await fallaCon(tx.savepoint((s) => s`UPDATE tipos_documento SET autoridad = 'otra'`))).toBe("23514");
  await tx`INSERT INTO accesos (usuario_texto, resultado) VALUES ('zz_esquema13a', 'firma_fallo')`;
}));
```

En `tests/privilegios-bd.test.ts`, añadir `firmas` y `tramite_eventos` a los casos que ya
existen para `auditoria` y `accesos`: `UPDATE` y `DELETE` devuelven `42501` conectado como
`sgc_app`, y el trigger frena también al dueño.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/esquema-fase13a.test.ts tests/privilegios-bd.test.ts`
Expected: FAIL (columnas y tablas inexistentes).

- [ ] **Step 3: Esquema y migración**

Editar `src/db/esquema.ts` con lo de **Produces** (solo rutas relativas; nunca `@/`).
Generar con `npm run db:generate -- --name fase13a-flujo` y revisar el SQL: el `DROP
CONSTRAINT "versiones_documento_numero_unico"` debe ir antes del `CREATE UNIQUE INDEX`. Añadir
a mano al final del archivo generado, cada sentencia separada por `--> statement-breakpoint`:

```sql
CREATE TRIGGER firmas_inmutable BEFORE UPDATE OR DELETE ON "firmas" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();
CREATE TRIGGER tramite_eventos_inmutable BEFORE UPDATE OR DELETE ON "tramite_eventos" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_modificacion();
```

- [ ] **Step 4: Roles y semillas**

En `src/db/roles-bd.ts:46` la sentencia es una cadena, no una lista: pasa a
`REVOKE UPDATE, DELETE ON auditoria, accesos, firmas, tramite_eventos FROM ${r}`, y el
comentario de las líneas 48 a 50 deja de citar `firmas` como pendiente. En `limpiarTodo`
(`src/db/semillas/minima.ts`), añadir al `TRUNCATE`: `tramites`, `tramite_eventos`, `firmas`,
`tramite_observaciones`, `tramite_verificaciones`, `lista_verificacion_items`.

- [ ] **Step 5: Aplicar y verificar**

Run: `npm run db:preparar` y luego
`npx vitest run tests/esquema-fase13a.test.ts tests/privilegios-bd.test.ts tests/esquema.test.ts`
Expected: PASS. La migración se aplica sobre la base sembrada **sin resembrar**.
Run: `npm run lint && npm test`
Expected: PASS (la suite completa sigue en verde: la migración es aditiva).

- [ ] **Step 6: Commit**

```bash
git add drizzle src/db tests
git commit -m "feat(f13a): migración 0004 - trámites, firmas, historial, lista de verificación y restricciones del flujo"
```

---

### Tarea 2: Formato del código y semillas con la convención del hospital (primera resiembra)

**Files:**
- Create: `src/lib/tramites/codigo.ts`, `tests/codigo.test.ts`
- Modify: `src/db/consultas/admin.ts` (`PATRON_CODIGO_DEFECTO`, `obtenerPatronCodigo`),
  `src/app/admin/acciones.ts` (mensaje de `parsearDocumento`),
  `src/db/consultas/mapa-admin.ts` (`CLAVES_TEXTO`),
  `src/componentes/admin/mapa/FormularioTextos.tsx`,
  `src/componentes/admin/FormularioDocumento.tsx` (ejemplo del código),
  `src/db/semillas/minima.ts`, `src/db/semillas/demo.ts`, `src/lib/tareas.ts` (ejemplo del
  comentario), los 18 archivos de `tests/` que citan códigos de la demo, y los capítulos de
  `docs/manual/usuario/` que citen el «Patrón del código»

**Interfaces:**
- Produces (`src/lib/tramites/codigo.ts`, sin BD):
  - `export const FORMATO_CODIGO_DEFECTO = "{PROCESO}-{TIPO}-{NN}";`
  - `export function validarFormato(formato: string): string | null` — `null` si es válido.
    Válido: exactamente un `{PROCESO}`, un `{TIPO}` y un marcador de consecutivo (`{NN}` o
    `{NNN}`), y fuera de los marcadores solo `A-Z`, `0-9` y `-`.
  - `export function patronDesdeFormato(formato: string): RegExp` — anclado; `{PROCESO}` y
    `{TIPO}` son `[A-Z]{2,4}`; `{NN}` es `\d{2,}` y `{NNN}` es `\d{3,}`.
  - `export function generarCodigo(formato: string, p: { proceso: string; tipo: string; consecutivo: number }): string`
    (rellena con ceros hasta el ancho mínimo del marcador).
  - `export function consecutivoDe(formato: string, codigo: string, p: { proceso: string; tipo: string }): number | null`
  - `export function siguienteConsecutivo(formato: string, codigos: readonly string[], p: { proceso: string; tipo: string }): number`
    (el mayor de los que correspondan a ese proceso y tipo, más uno; 1 si no hay ninguno).
- Produces (`src/db/consultas/admin.ts`): `obtenerPatronCodigo()` lee `formato_codigo`; si
  existe y `validarFormato` da `null`, devuelve `patronDesdeFormato`; si no, usa
  `patron_codigo` y, a falta de este, `PATRON_CODIGO_DEFECTO`, que pasa a ser
  `^[A-Z]{2,4}-[A-Z]{2,4}-\d{2,}$`.
- Produces (configuración): la clave `patron_codigo` sale de `CLAVES_TEXTO` y de
  `FormularioTextos` (la pantalla que edita el formato llega en la Tarea 14; hasta entonces
  lo fijan las semillas).
- Produces (semilla mínima, `sembrarBase`):
  - Tipos, con el `orden` actual para los nueve que existen:

    | Sigla | Nombre | `autoridad` | `es_diligenciable` | `orden` |
    |---|---|---|---|---|
    | CA | Caracterización | estrategico | false | 1 |
    | MN | Manual | estrategico | false | 2 |
    | PR | Procedimiento | operativo | false | 3 |
    | IN | Instructivo | operativo | false | 4 |
    | FO | Formato (antes `FT`) | operativo | true | 5 |
    | GU | Guía | operativo | false | 6 |
    | PT | Protocolo | operativo | false | 7 |
    | PL | Plan | estrategico | false | 8 |
    | PO | Política | estrategico | false | 9 |
    | RG | Registro | operativo | true | 10 |
    | MZ | Matriz | operativo | true | 11 |

  - Claves nuevas de `configuracion`: `formato_codigo` = `{PROCESO}-{TIPO}-{NN}`;
    `plazo_visto_bueno_dias` = `3`; `plazo_aceptacion_dias` = `3`; `plazo_elaboracion_dias` =
    `15`; `plazo_ajustes_dias` = `5`; `plazo_revision_dias` = `5`; `plazo_aprobacion_dias` =
    `5`; `plazo_publicacion_dias` = `2`; `escalamiento_dias` = `3`; `publicacion_directa` =
    `1`. La clave `patron_codigo` deja de sembrarse.
  - `lista_verificacion_items`, en este orden, los tres primeros con `critico = true`: «Usa
    la plantilla vigente de su tipo»; «Código, versión y fecha en el encabezado»; «Tiene
    todas las secciones obligatorias»; «Es coherente con los demás documentos del SGC»;
    «Cumple los requisitos de ISO 9001:2015 que le aplican»; «Es aplicable a una institución
    de primer nivel»; «Cita la normativa vigente que le aplica»; «Define los registros que
    genera y su archivo».
- Produces (semilla demo): el proceso «Sistema de Gestión de Calidad» pasa de la sigla `CAL`
  a `SGC`. Los 28 códigos se recodifican con la regla `XX-YYY-0NN` → `YYY-XX-NN`, más `CAL` →
  `SGC` y `FT` → `FO`:

  | Antes | Después | Antes | Después |
  |---|---|---|---|
  | MN-CAL-001 | SGC-MN-01 | CA-CEX-001 | CEX-CA-01 |
  | CA-CAL-001 | SGC-CA-01 | GU-CEX-001 | CEX-GU-01 |
  | PR-CAL-001 | SGC-PR-01 | PR-AIN-001 | AIN-PR-01 |
  | FT-CAL-001 | SGC-FO-01 | FT-AIN-001 | AIN-FO-01 |
  | FT-CAL-002 | SGC-FO-02 | PT-AIN-001 | AIN-PT-01 |
  | FT-CAL-003 | SGC-FO-03 | PR-PYM-001 | PYM-PR-01 |
  | CA-GTH-001 | GTH-CA-01 | FT-PYM-001 | PYM-FO-01 |
  | PR-GTH-001 | GTH-PR-01 | PR-GDO-001 | GDO-PR-01 |
  | FT-GTH-001 | GTH-FO-01 | FT-GDO-001 | GDO-FO-01 |
  | PR-GTH-002 | GTH-PR-02 | IN-GIC-001 | GIC-IN-01 |
  | PO-SOG-001 | SOG-PO-01 | IN-GIC-002 | GIC-IN-02 |
  | PL-SOG-001 | SOG-PL-01 | PL-GES-001 | GES-PL-01 |
  | FT-GBS-001 | GBS-FO-01 | PR-GRF-001 | GRF-PR-01 |
  | PR-GBS-001 | GBS-PR-01 | | |
  | PR-GBS-002 | GBS-PR-02 | | |

  `GTH-FO-01` queda con `nivel_acceso = 'restringido'`. Los demás documentos, sus estados y
  sus relaciones no cambian (28 documentos, 29 versiones).

- [ ] **Step 1: Test que falla** (`tests/codigo.test.ts`, sin BD)

```ts
const F = FORMATO_CODIGO_DEFECTO;
it("valida el formato", () => {
  expect(validarFormato(F)).toBeNull();
  expect(validarFormato("{TIPO}-{PROCESO}-{NNN}")).toBeNull();
  expect(validarFormato("{PROCESO}-{NN}")).toMatch(/TIPO/);
  expect(validarFormato("{PROCESO}-{TIPO}-{NN};x")).not.toBeNull();
});
it("deriva el patrón", () => {
  const p = patronDesdeFormato(F);
  expect(["SGC-FO-02", "GTH-PR-100", "ZZ-TST-001"].every((c) => p.test(c))).toBe(true);
  expect(["SGC-FO-2", "sgc-fo-02", "SGC-FO-02 ", "SGCXX-FO-02"].some((c) => p.test(c))).toBe(false);
});
it("genera y lee consecutivos", () => {
  expect(generarCodigo(F, { proceso: "SGC", tipo: "FO", consecutivo: 2 })).toBe("SGC-FO-02");
  expect(generarCodigo(F, { proceso: "SGC", tipo: "FO", consecutivo: 100 })).toBe("SGC-FO-100");
  expect(consecutivoDe(F, "SGC-FO-02", { proceso: "SGC", tipo: "FO" })).toBe(2);
  expect(consecutivoDe(F, "GTH-FO-02", { proceso: "SGC", tipo: "FO" })).toBeNull();
});
it("propone el siguiente sin reutilizar", () => {
  const codigos = ["SGC-FO-01", "SGC-FO-03", "SGC-RG-07", "GTH-FO-09"];
  expect(siguienteConsecutivo(F, codigos, { proceso: "SGC", tipo: "FO" })).toBe(4);
  expect(siguienteConsecutivo(F, [], { proceso: "SGC", tipo: "FO" })).toBe(1);
  expect(siguienteConsecutivo(F, ["SGC-FO-99"], { proceso: "SGC", tipo: "FO" })).toBe(100);
});
```

- [ ] **Step 2:** Run: `npx vitest run tests/codigo.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/tramites/codigo.ts`** y volver a correr — Expected: PASS.

- [ ] **Step 4: Patrón, textos y pantalla de Textos del mapa**

Aplicar los tres **Produces** de `admin.ts` y de configuración. El mensaje de
`parsearDocumento` pasa a «El código no cumple el formato configurado (ej. SGC-FO-02)».
Ajustar `tests/mapa-admin.test.ts` y `tests/validaciones-mapa.test.ts` donde citen la clave
`patron_codigo` como editable.

- [ ] **Step 5: Semillas**

Aplicar los **Produces** de las dos semillas. En `tests/esquema.test.ts` (claves y tipos de
la semilla), actualizar lo que cambie: once tipos, `FO` en lugar de `FT`, claves nuevas.

- [ ] **Step 6: Barrido de los tests**

Reemplazar en `tests/` y en `src/` cada código de la tabla por su equivalente, y `"CAL"` por
`"SGC"` donde sea la sigla del proceso. **Solo los 28 códigos de la tabla:** los códigos
propios de los tests (`ZZ-TST-…`, `ZZ-MST-…`) no se tocan y siguen siendo válidos con el
patrón nuevo. Comprobar que no queda ninguno:

Run: `grep -rnE "\b(MN|CA|PR|FT|PO|PL|GU|PT|IN)-(CAL|GTH|SOG|GBS|CEX|AIN|PYM|GDO|GIC|GES|GRF)-0[0-9]{2}\b" src tests docs/manual`
Expected: sin resultados.

La sigla del tipo también aparece sola, como filtro (`tipo: "FT"`, `?tipo=FT`) y en
comentarios (`src/db/consultas/busqueda.ts:18`): pasa a `FO`.

Run: `grep -rnE '"FT"|tipo=FT|\(FT,' src tests`
Expected: sin resultados.

- [ ] **Step 7: Resembrar y verificar** (el controlador ya avisó al usuario)

Run: `npm run db:seed && npm run admin:asegurar`
Run: `npm run lint && npm test`
Expected: PASS con la suite completa.
Run: `DATABASE_URL=postgres://x:x@127.0.0.1:1/x DATABASE_URL_MIGRADOR=postgres://x:x@127.0.0.1:1/x npm run build`
Expected: build correcto (simulación del CI).

- [ ] **Step 8: Commit**

```bash
git add src tests docs
git commit -m "feat(f13a): formato del código PROCESO-TIPO-NN; semillas con los tipos, la autoridad y la convención del hospital"
```

---

### Tarea 3: Permisos y reglas puras del trámite

**Files:**
- Create: `src/lib/tramites/tipos.ts`, `src/lib/tramites/transiciones.ts`,
  `src/lib/tramites/separacion.ts`, `src/lib/tramites/plazos.ts`,
  `tests/tramites-reglas.test.ts`, `tests/tramites-plazos.test.ts`
- Modify: `src/lib/permisos.ts`, `tests/permisos.test.ts`

**Interfaces:**
- Consumes: `Rol` (`src/lib/roles.ts`), `puede`, `Permiso` (`src/lib/permisos.ts`).
- Produces (`src/lib/permisos.ts`), seis permisos nuevos en `Permiso` y en `MATRIZ`:

  | Permiso | Roles |
  |---|---|
  | `tramites.solicitar` | `admin_sgc`, `lider_proceso` |
  | `tramites.visto_bueno` | `lider_proceso` |
  | `tramites.participar` | `admin_sgc`, `gerencia`, `control_interno`, `lider_proceso`, `consulta` |
  | `tramites.revisar` | `admin_sgc`, `lider_proceso` |
  | `tramites.aprobar` | `admin_sgc`, `gerencia` |
  | `tramites.gestionar` | `admin_sgc` |

- Produces (`src/lib/tramites/tipos.ts`):
  - `TIPOS_SOLICITUD = ["crear", "modificar", "eliminar"] as const` y `TipoSolicitud`.
  - `MOTIVOS = ["cambio_normativo", "mejora", "no_conformidad", "solicitud_personal", "revision_anual"] as const` y `Motivo`.
  - `ETAPAS_TRABAJO = ["visto_bueno", "aceptacion", "elaboracion", "revision", "aprobacion", "publicacion"] as const`,
    `ETAPAS_FINALES = ["publicado", "eliminado", "rechazado", "cancelado"] as const`, `Etapa`,
    `EtapaTrabajo`, y `esEtapaDeTrabajo(e: Etapa): e is EtapaTrabajo`.
  - `FIRMAS = ["elaboro", "reviso", "aprobo", "publico"] as const` y `Firma`.
  - `type Autoridad = "estrategico" | "operativo"`.
  - `ETIQUETA_ETAPA`, `ETIQUETA_MOTIVO`, `ETIQUETA_TIPO_SOLICITUD`, `ETIQUETA_FIRMA`
    (`Record<…, string>`): «Visto bueno», «Aceptación», «Elaboración», «Revisión»,
    «Aprobación», «Publicación», «Publicado», «Eliminado», «Rechazado», «Cancelado»; «Cambio
    normativo», «Mejora del proceso», «No conformidad», «Solicitud del personal», «Revisión
    anual»; «Crear», «Modificar», «Eliminar»; «Elaboró», «Revisó», «Aprobó», «Publicó».
- Produces (`src/lib/tramites/transiciones.ts`):
  - `ACCIONES = ["dar_visto_bueno", "negar_visto_bueno", "retirar", "aceptar", "rechazar", "enviar_a_revision", "devolver_revision", "concepto_favorable", "aprobar", "devolver_aprobacion", "negar_eliminacion", "publicar", "aprobar_y_publicar", "cancelar", "reasignar"] as const`
    y `Accion`.
  - `type TramiteParaRegla = { tipo: TipoSolicitud; etapa: Etapa; solicitanteId: number; elaboradorId: number | null; revisorId: number | null; aprobadorId: number | null }`
  - `type ActorParaRegla = { usuarioId: number; rol: Rol; lideraPropietario: boolean }`
  - `type Veredicto = { ok: true; hacia: Etapa; firmas: Firma[]; sumaRonda: boolean } | { ok: false; motivo: string }`
  - `export const PERMISO_DE_ACCION: Record<Accion, Permiso>`
  - `export function evaluarTransicion(accion: Accion, t: TramiteParaRegla, actor: ActorParaRegla): Veredicto`
  - `export function accionesDisponibles(t: TramiteParaRegla, actor: ActorParaRegla): Accion[]`

  La tabla que implementa (spec §7.2). «Persona» es la condición además del permiso:

  | Acción | Etapa | Persona | Permiso | Hacia | Firmas | Suma ronda |
  |---|---|---|---|---|---|---|
  | `dar_visto_bueno` | `visto_bueno` | `lideraPropietario` | `tramites.visto_bueno` | `aceptacion` | — | no |
  | `negar_visto_bueno` | `visto_bueno` | `lideraPropietario` | `tramites.visto_bueno` | `rechazado` | — | no |
  | `retirar` | `visto_bueno`, `aceptacion` | es el solicitante | `tramites.solicitar` | `cancelado` | — | no |
  | `aceptar` | `aceptacion` | — | `tramites.gestionar` | `elaboracion`; en `eliminar`, `aprobacion` | — | sí, salvo en `eliminar` |
  | `rechazar` | `aceptacion` | — | `tramites.gestionar` | `rechazado` | — | no |
  | `enviar_a_revision` | `elaboracion` | es el elaborador | `tramites.participar` | `revision` | `elaboro` | no |
  | `devolver_revision` | `revision` | es el revisor | `tramites.revisar` | `elaboracion` | — | sí |
  | `concepto_favorable` | `revision` | es el revisor | `tramites.revisar` | `aprobacion` | `reviso` | no |
  | `aprobar` | `aprobacion` | es el aprobador | `tramites.aprobar` | `publicacion` | `aprobo` | no |
  | `devolver_aprobacion` | `aprobacion` | es el aprobador; el tipo no es `eliminar` | `tramites.aprobar` | `elaboracion` | — | sí |
  | `negar_eliminacion` | `aprobacion` | es el aprobador; el tipo es `eliminar` | `tramites.aprobar` | `rechazado` | — | no |
  | `publicar` | `publicacion` | — | `tramites.gestionar` | `publicado`; en `eliminar`, `eliminado` | `publico` | no |
  | `aprobar_y_publicar` | `aprobacion` | es el aprobador | `tramites.gestionar` | `publicado`; en `eliminar`, `eliminado` | `aprobo`, `publico` | no |
  | `cancelar` | cualquiera de trabajo | — | `tramites.gestionar` | `cancelado` | — | no |
  | `reasignar` | cualquiera de trabajo | — | `tramites.gestionar` | la misma | — | no |

  La ronda vale 0 al crear la solicitud y pasa a 1 al aceptar una creación o una
  modificación; en una eliminación se queda en 0.
- Produces (`src/lib/tramites/separacion.ts`):
  - `type Persona = { id: number; rol: Rol; activo: boolean }`
  - `export function rolAprobador(autoridad: Autoridad, rolOriginador: Rol): "gerencia" | "admin_sgc"`
    — `gerencia` si la autoridad es `estrategico` **o** si el originador tiene rol
    `admin_sgc`; si no, `admin_sgc`. El originador es el elaborador en crear y modificar, y
    el solicitante en eliminar (spec §6.4).
  - `export function validarDesignacion(d: { tipo: TipoSolicitud; autoridad: Autoridad; solicitante: Persona; elaborador: Persona | null; revisor: Persona | null; aprobador: Persona }): string | null`
    — devuelve el primer mensaje que aplique, o `null`:
    «El usuario designado no está activo»; «Falta designar quién elabora» y «Falta designar
    quién revisa» (crear y modificar); «Quien revisa debe ser Administrador del SGC o Líder de
    proceso»; «Quien elabora no puede revisar»; «Quien aprueba debe tener el rol Gerencia» o
    «Quien aprueba debe ser Administrador del SGC», según `rolAprobador`; «Quien elabora no
    puede aprobar»; «Quien pide la eliminación no puede aprobarla».
- Produces (`src/lib/tramites/plazos.ts`):
  - `export function fechaLimite(desde: Date, dias: number, zona: string): Date` — el último
    milisegundo del día que resulta de sumar `dias` días calendario al día de `desde`, ambos
    en `zona`.
  - `export function estadoPlazo(vence: Date | null, ahora: Date, zona: string): { estado: "sin_plazo" | "a_tiempo" | "vence_hoy" | "vencido"; dias: number }`
    — `dias` es la distancia en días calendario de la zona entre hoy y el día en que vence.

- [ ] **Step 1: Tests que fallan**

`tests/permisos.test.ts`: añadir las seis filas de la tabla al test por celda que ya existe
(cada permiso contra los cinco roles).

`tests/tramites-reglas.test.ts` (sin BD):

```ts
const base: TramiteParaRegla = { tipo: "modificar", etapa: "revision", solicitanteId: 1, elaboradorId: 2, revisorId: 3, aprobadorId: 4 };
const actor = (usuarioId: number, rol: Rol, lideraPropietario = false): ActorParaRegla => ({ usuarioId, rol, lideraPropietario });

it.each([
  ["dar_visto_bueno",    { etapa: "visto_bueno" },                  actor(9, "lider_proceso", true), "aceptacion",  [],                    false],
  ["negar_visto_bueno",  { etapa: "visto_bueno" },                  actor(9, "lider_proceso", true), "rechazado",   [],                    false],
  ["retirar",            { etapa: "aceptacion" },                   actor(1, "lider_proceso"),       "cancelado",   [],                    false],
  ["aceptar",            { etapa: "aceptacion" },                   actor(8, "admin_sgc"),           "elaboracion", [],                    true],
  ["aceptar",            { etapa: "aceptacion", tipo: "eliminar" }, actor(8, "admin_sgc"),           "aprobacion",  [],                    false],
  ["rechazar",           { etapa: "aceptacion" },                   actor(8, "admin_sgc"),           "rechazado",   [],                    false],
  ["enviar_a_revision",  { etapa: "elaboracion" },                  actor(2, "consulta"),            "revision",    ["elaboro"],           false],
  ["devolver_revision",  { etapa: "revision" },                     actor(3, "admin_sgc"),           "elaboracion", [],                    true],
  ["concepto_favorable", { etapa: "revision" },                     actor(3, "lider_proceso"),       "aprobacion",  ["reviso"],            false],
  ["aprobar",            { etapa: "aprobacion" },                   actor(4, "gerencia"),            "publicacion", ["aprobo"],            false],
  ["devolver_aprobacion",{ etapa: "aprobacion" },                   actor(4, "gerencia"),            "elaboracion", [],                    true],
  ["negar_eliminacion",  { etapa: "aprobacion", tipo: "eliminar" }, actor(4, "gerencia"),            "rechazado",   [],                    false],
  ["publicar",           { etapa: "publicacion" },                  actor(8, "admin_sgc"),           "publicado",   ["publico"],           false],
  ["publicar",           { etapa: "publicacion", tipo: "eliminar" },actor(8, "admin_sgc"),           "eliminado",   ["publico"],           false],
  ["aprobar_y_publicar", { etapa: "aprobacion" },                   actor(4, "admin_sgc"),           "publicado",   ["aprobo", "publico"], false],
  ["cancelar",           { etapa: "elaboracion" },                  actor(8, "admin_sgc"),           "cancelado",   [],                    false],
  ["reasignar",          { etapa: "revision" },                     actor(8, "admin_sgc"),           "revision",    [],                    false],
] as const)("%s permitido", (accion, cambios, quien, hacia, firmas, sumaRonda) => {
  expect(evaluarTransicion(accion, { ...base, ...cambios }, quien)).toEqual({ ok: true, hacia, firmas, sumaRonda });
});

it.each([
  ["dar_visto_bueno",     { etapa: "visto_bueno" },                  actor(9, "lider_proceso", false)], // lidera otro proceso
  ["dar_visto_bueno",     { etapa: "visto_bueno" },                  actor(8, "admin_sgc", true)],      // sin el permiso
  ["retirar",             { etapa: "elaboracion" },                  actor(1, "lider_proceso")],        // ya se aceptó
  ["retirar",             { etapa: "aceptacion" },                   actor(7, "lider_proceso")],        // no es el solicitante
  ["aceptar",             { etapa: "aceptacion" },                   actor(4, "gerencia")],
  ["enviar_a_revision",   { etapa: "elaboracion" },                  actor(3, "admin_sgc")],            // no es el elaborador
  ["enviar_a_revision",   { etapa: "revision" },                     actor(2, "consulta")],             // etapa equivocada
  ["concepto_favorable",  { etapa: "revision" },                     actor(8, "admin_sgc")],            // no es el revisor designado
  ["aprobar",             { etapa: "aprobacion" },                   actor(3, "admin_sgc")],            // no es el aprobador
  ["devolver_aprobacion", { etapa: "aprobacion", tipo: "eliminar" }, actor(4, "gerencia")],
  ["negar_eliminacion",   { etapa: "aprobacion" },                   actor(4, "gerencia")],
  ["aprobar_y_publicar",  { etapa: "aprobacion" },                   actor(4, "gerencia")],             // aprueba pero no gestiona
  ["publicar",            { etapa: "aprobacion" },                   actor(8, "admin_sgc")],
  ["cancelar",            { etapa: "publicado" },                    actor(8, "admin_sgc")],            // ya cerrado
  ["reasignar",           { etapa: "cancelado" },                    actor(8, "admin_sgc")],
] as const)("%s rechazado", (accion, cambios, quien) => {
  expect(evaluarTransicion(accion, { ...base, ...cambios }, quien).ok).toBe(false);
});

it("accionesDisponibles lista solo lo permitido", () => {
  expect(accionesDisponibles({ ...base, etapa: "revision" }, actor(3, "admin_sgc")).sort())
    .toEqual(["cancelar", "concepto_favorable", "devolver_revision", "reasignar"]);
  expect(accionesDisponibles({ ...base, etapa: "revision" }, actor(5, "consulta"))).toEqual([]);
});

const p = (id: number, rol: Rol, activo = true): Persona => ({ id, rol, activo });
it("rolAprobador sigue la autoridad y el origen", () => {
  expect(rolAprobador("estrategico", "lider_proceso")).toBe("gerencia");
  expect(rolAprobador("operativo", "lider_proceso")).toBe("admin_sgc");
  expect(rolAprobador("operativo", "consulta")).toBe("admin_sgc");
  expect(rolAprobador("operativo", "admin_sgc")).toBe("gerencia");   // lo que nace del Admin SGC lo aprueba Gerencia
});
it("validarDesignacion aplica S1, S2 y S3", () => {
  const d = { tipo: "modificar" as const, autoridad: "operativo" as const, solicitante: p(1, "lider_proceso"), elaborador: p(1, "lider_proceso"), revisor: p(3, "admin_sgc"), aprobador: p(3, "admin_sgc") };
  expect(validarDesignacion(d)).toBeNull();                                            // revisor y aprobador pueden coincidir
  expect(validarDesignacion({ ...d, revisor: p(1, "lider_proceso") })).toBe("Quien elabora no puede revisar");
  expect(validarDesignacion({ ...d, revisor: p(5, "consulta") })).toMatch(/Administrador del SGC o Líder/);
  expect(validarDesignacion({ ...d, elaborador: p(3, "admin_sgc"), revisor: p(6, "lider_proceso"), aprobador: p(7, "admin_sgc") })).toBe("Quien aprueba debe tener el rol Gerencia");
  expect(validarDesignacion({ ...d, aprobador: p(4, "gerencia") })).toBe("Quien aprueba debe ser Administrador del SGC");
  expect(validarDesignacion({ ...d, aprobador: p(3, "admin_sgc", false) })).toBe("El usuario designado no está activo");
  const baja = { tipo: "eliminar" as const, autoridad: "operativo" as const, solicitante: p(1, "lider_proceso"), elaborador: null, revisor: null, aprobador: p(3, "admin_sgc") };
  expect(validarDesignacion(baja)).toBeNull();
  expect(validarDesignacion({ ...baja, solicitante: p(3, "admin_sgc"), aprobador: p(8, "admin_sgc") })).toBe("Quien aprueba debe tener el rol Gerencia");
  expect(validarDesignacion({ ...baja, autoridad: "estrategico", solicitante: p(4, "gerencia"), aprobador: p(4, "gerencia") })).toBe("Quien pide la eliminación no puede aprobarla");
});
```

`tests/tramites-plazos.test.ts` (sin BD):

```ts
const Z = "America/Bogota";
it("la fecha límite es el fin del día en la zona", () => {
  expect(fechaLimite(new Date("2026-11-05T15:00:00Z"), 3, Z).toISOString()).toBe("2026-11-09T04:59:59.999Z");
  // 03:30 UTC del día 6 son las 22:30 del día 5 en Bogotá: el día de partida es el 5
  expect(fechaLimite(new Date("2026-11-06T03:30:00Z"), 0, Z).toISOString()).toBe("2026-11-06T04:59:59.999Z");
});
it("estadoPlazo distingue a tiempo, hoy y vencido", () => {
  const vence = new Date("2026-11-09T04:59:59.999Z");                       // fin del 8 en Bogotá
  expect(estadoPlazo(vence, new Date("2026-11-07T15:00:00Z"), Z)).toEqual({ estado: "a_tiempo", dias: 1 });
  expect(estadoPlazo(vence, new Date("2026-11-08T20:00:00Z"), Z)).toEqual({ estado: "vence_hoy", dias: 0 });
  expect(estadoPlazo(vence, new Date("2026-11-11T12:00:00Z"), Z)).toEqual({ estado: "vencido", dias: 3 });
  expect(estadoPlazo(null, new Date(), Z).estado).toBe("sin_plazo");
});
```

- [ ] **Step 2:** Run: `npx vitest run tests/tramites-reglas.test.ts tests/tramites-plazos.test.ts tests/permisos.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Implementar** los cuatro módulos y la matriz. `evaluarTransicion` comprueba,
  en este orden: etapa, permiso (`puede({ rol }, PERMISO_DE_ACCION[accion])`), persona y tipo
  de solicitud; el `motivo` de un rechazo es una frase para el usuario («Este trámite ya no
  está en esa etapa», «No es la persona designada para este paso», «Sin permiso para esta
  acción»).

- [ ] **Step 4:** Run: los mismos tests y `npm run lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib tests
git commit -m "feat(f13a): permisos del trámite y reglas puras - transiciones, separación de funciones y plazos"
```

---

### Tarea 4: Visibilidad por rol y nivel de acceso; marca de agua con el nombre

**Files:**
- Modify: `src/lib/alcance.ts`, `src/db/consultas/documentos.ts`, `src/db/consultas/procesos.ts`,
  `src/db/consultas/busqueda.ts`, `src/db/consultas/mapa.ts`, `src/db/consultas/maestro.ts`,
  `src/db/consultas/admin.ts` (`listarDocumentosAdmin`, `obtenerDocumentoAdmin`,
  `obtenerArchivoAdmin`), las páginas y handlers que las llaman (`(app)/page.tsx`,
  `(app)/procesos/[slug]/page.tsx`, `(app)/procesos/[slug]/[sub]/page.tsx`,
  `(app)/documentos/[codigo]/page.tsx`, `(app)/buscar/page.tsx`, `src/app/api/buscar/route.ts`,
  `(app)/documentos/[codigo]/archivos/[archivoId]/[[...nombre]]/route.ts`,
  `(app)/admin/(panel)/page.tsx`, `(app)/admin/(panel)/documentos/[codigo]/page.tsx`,
  `src/app/admin/api/archivos/[archivoId]/route.ts`), `src/lib/marca-agua.ts`,
  `src/lib/servir-archivo.ts`, `src/componentes/admin/usuarios/FormularioUsuario.tsx`, y los
  tests que llaman a esas funciones
- Create: `tests/visibilidad.test.ts`, `tests/visibilidad-estructura.test.ts`

**Interfaces:**
- Consumes: `nivel_acceso`, estado `descartado` (Tarea 1); `GTH-FO-01` restringido (Tarea 2).
- Produces (`src/lib/alcance.ts`):
  - `export type SujetoVisibilidad = Pick<SesionValida, "usuarioId" | "rol" | "verHistorial">;`
  - `export const ROLES_VEN_RESTRINGIDO: readonly Rol[] = ["admin_sgc", "gerencia", "control_interno"];`
  - `export function filtroAcceso(sql: Cliente, sujeto: SujetoVisibilidad)` — fragmento SQL
    para poner en un `WHERE` o un `JOIN … ON`. **Convención: la consulta llama `d` a
    `documentos`.** Para los roles de `ROLES_VEN_RESTRINGIDO` es `true`; para los demás:
    `d.nivel_acceso = 'general'` **o** existe una fila de `documento_proceso` de `d` cuyo
    proceso (el suyo, o el de su subproceso) está activo y asignado al usuario en
    `usuario_procesos`.
  - `export async function puedeAccederDocumento(documentoId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>`
    (la misma regla para un documento suelto).
  - `export type Cliente = Sql | TransactionSql` se exporta desde `src/db/cliente.ts` y los
    módulos nuevos lo importan de ahí.
- Produces (firmas que cambian; cada una gana `sujeto: SujetoVisibilidad` como último
  parámetro obligatorio y aplica `filtroAcceso`):
  `obtenerFichaDocumento(codigo, sujeto)` (también filtra los relacionados),
  `obtenerArchivoVigente(codigo, archivoId, sujeto)`, `buscarDocumentos(filtros, sujeto)`
  (resultados y facetas), `obtenerDocumentosDeProceso(procesoId, incluirSubprocesos, sujeto)`,
  `obtenerDocumentosDeSubproceso(subprocesoId, sujeto)`, `obtenerDetalleProceso(slug, sujeto)`
  y `obtenerDetalleSubproceso(…, sujeto)` (sus conteos), `obtenerDatosMapa(sujeto)`
  (`docsVigentes`). `obtenerDatosMapaAdmin()` no cambia.
- Produces (panel, spec §12 y F13A-DC13):
  - `listarDocumentosAdmin(sujeto)`: aplica `filtroAcceso`; el número del borrador solo se
    devuelve si `puede(sujeto, "documentos.administrar")`; omite los documentos cuyas únicas
    versiones están en `borrador` o `descartado` para quien no administra.
  - `obtenerDocumentoAdmin(codigo, sujeto)`: `null` si no pasa `filtroAcceso`; las versiones
    `borrador` y `descartado` solo se devuelven con `documentos.administrar`.
  - Ruta `src/app/admin/api/archivos/[archivoId]/route.ts` (GET): versión `vigente`,
    `obsoleto` o `anulado` exige `documentos.ver_historial` y `puedeAccederDocumento`;
    `borrador` o `descartado` exige `documentos.administrar`. Si no, 404.
  - `obtenerListadoMaestro`: la versión representativa nunca es `borrador` ni `descartado`
    (un documento que solo tiene esas no aparece en «todos»).
- Produces (marca de agua):
  - `export async function estamparCopiaNoControlada(pdf: Uint8Array, datos: { fecha: Date; nombre: string; zona: string }): Promise<Uint8Array>`
    — leyenda: `Descargada por ${nombre} el ${dd/mm/aaaa} — verifique su vigencia en el SGC`,
    con el día calculado en `zona`. El nombre se recorta a 60 caracteres y todo carácter que
    la fuente estándar no pueda codificar se cambia por `?`.
  - `respuestaArchivoEstampado(archivo, esDescarga, nombre: string, fecha = new Date())` usa
    `zonaHoraria()`. La ruta del portal le pasa `sesion.nombre`.
- Produces (interfaz): en `FormularioUsuario`, «Procesos que lidera» pasa a **«Procesos»**
  con la ayuda «Para un líder: los procesos que lidera. Para los demás: los procesos a los
  que pertenece; le dan acceso a sus documentos restringidos.» La ficha del portal muestra la
  insignia «Acceso restringido» en un documento restringido.

- [ ] **Step 1: Tests que fallan**

`tests/visibilidad.test.ts` (BD, datos de la demo ya confirmados; no escribe nada):

```ts
const sujeto = async (usuario: string): Promise<SujetoVisibilidad> => {
  const [u] = await sql`SELECT id, rol, ver_historial FROM usuarios WHERE usuario = ${usuario}`;
  return { usuarioId: u.id, rol: u.rol, verHistorial: u.ver_historial };
};
const RESTRINGIDO = "GTH-FO-01";      // Formato Lista de Chequeo Hoja de Vida, subproceso GTH/ingreso

it.each([["consulta", false], ["lider.cex", false], ["lider.gth", true], ["gerente", true], ["control.interno", true]] as const)(
  "%s ve el documento restringido: %s", async (usuario, ve) => {
    const s = await sujeto(usuario);
    const ficha = await obtenerFichaDocumento(RESTRINGIDO, s);
    expect(ficha !== null).toBe(ve);
    const r = await buscarDocumentos({ q: "hoja de vida" }, s);
    expect(r.resultados.some((x) => x.codigo === RESTRINGIDO)).toBe(ve);
    const [a] = await sql`SELECT a.id FROM archivos a JOIN documento_versiones v ON v.id = a.version_id
      JOIN documentos d ON d.id = v.documento_id WHERE d.codigo = ${RESTRINGIDO} AND v.estado = 'vigente' LIMIT 1`;
    expect((await obtenerArchivoVigente(RESTRINGIDO, a.id, s)) !== null).toBe(ve);
  });

it("un documento general lo ve cualquiera, y el relacionado restringido se oculta", async () => {
  const ficha = await obtenerFichaDocumento("GTH-PR-01", await sujeto("consulta"));   // su formato relacionado es GTH-FO-01
  expect(ficha).not.toBeNull();
  expect(ficha!.relacionados.some((r) => r.codigo === RESTRINGIDO)).toBe(false);
  const conAcceso = await obtenerFichaDocumento("GTH-PR-01", await sujeto("lider.gth"));
  expect(conAcceso!.relacionados.some((r) => r.codigo === RESTRINGIDO)).toBe(true);
});

it("el conteo del mapa y la lista del proceso no cuentan lo que el usuario no ve", async () => {
  const contar = async (usuario: string) => {
    const mapa = await obtenerDatosMapa(await sujeto(usuario));
    return mapa.macroprocesos.flatMap((m) => m.procesos).find((p) => p.sigla === "GTH")!.docsVigentes;
  };
  expect(await contar("lider.gth")).toBe((await contar("consulta")) + 1);
});

it("el panel no muestra borradores a quien no administra", async () => {
  const ci = await sujeto("control.interno");
  const doc = await obtenerDocumentoAdmin("SGC-FO-03", ci);          // solo tiene una versión en borrador
  expect(doc === null || doc.versiones.every((v) => v.estado !== "borrador")).toBe(true);
  expect((await listarDocumentosAdmin(ci)).some((d) => d.codigo === "SGC-FO-03")).toBe(false);
  const maestro = await obtenerListadoMaestro({ incluir: "todos" });
  expect(maestro.some((f) => f.codigo === "SGC-FO-03")).toBe(false);
  expect(maestro.some((f) => f.codigo === "GIC-IN-02")).toBe(true);  // el anulado sí es historial
});
```

(Ajustar los nombres de campo de `relacionados`, `macroprocesos` y `versiones` a los tipos
reales; las afirmaciones no cambian.)

`tests/visibilidad-estructura.test.ts` (estático): en `src/db/consultas/documentos.ts`,
`procesos.ts`, `busqueda.ts` y `mapa.ts`, el número de apariciones de `filtroAcceso(` es al
menos el de `estado = 'vigente'`, salvo en `obtenerDatosMapaAdmin`, que queda fuera del
conteo.

`tests/marca-agua.test.ts` (ampliar): el PDF estampado contiene «Descargada por María Ñáñez
el 05/11/2026» para `{ fecha: new Date("2026-11-06T03:30:00Z"), nombre: "María Ñáñez", zona: "America/Bogota" }`
(las 22:30 del día 5 en Bogotá), y un nombre con un carácter fuera de la fuente no hace
fallar el estampado.

- [ ] **Step 2:** Run: `npx vitest run tests/visibilidad.test.ts tests/visibilidad-estructura.test.ts tests/marca-agua.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Implementar** `filtroAcceso` y `puedeAccederDocumento`, y pasar `sujeto` por
  cada función y cada llamador de **Produces**. Las páginas ya tienen la sesión de
  `exigirSesion()`; los handlers, la de `sesionDePeticion`.

- [ ] **Step 4: Ajustar los tests existentes** que llaman a esas funciones
  (`tests/archivos-vigentes.test.ts`, `tests/consultas-fase4.test.ts`,
  `tests/busqueda-fase5.test.ts`, `tests/descarga-estampada.test.ts`, `tests/maestro.test.ts`,
  `tests/handlers-permisos.test.ts` y los que señale `tsc`): pasan un sujeto `admin_sgc`
  cuando prueban otra cosa que la visibilidad. Ningún test heredado de «solo se sirven
  vigentes» se borra.

- [ ] **Step 5:** Run: `npm run lint && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13a): visibilidad por nivel de acceso en portal, búsqueda y archivos; el panel reserva los borradores; marca de agua con el nombre de quien descarga"
```

---

### Tarea 5: Firma con reingreso de clave

**Files:**
- Create: `src/lib/firma.ts`, `src/db/consultas/firmas.ts`, `tests/firma.test.ts`
- Modify: `src/lib/ingreso.ts` (extraer `comprobarCodigoFactor`), el tipo `ResultadoAcceso` y
  las etiquetas y el filtro de la pantalla Accesos (localizarlos con
  `grep -rn "factor_fallo" src`), `tests/accesos.test.ts` si enumera los resultados

**Interfaces:**
- Consumes: `verificarClave` (`src/lib/clave.ts`), `verificarTotp`, `hashCodigoRecuperacion`
  (`src/lib/totp.ts`), `consumirCodigoRecuperacion`, `obtenerSecretoTotp`,
  `buscarParaIngresoPorId`, `guardarEstadoBloqueo`, `registrarAcceso`
  (`src/db/consultas/autenticacion.ts`), `SIN_BLOQUEO`, `estaBloqueado`, `estadoTrasFallo`
  (`src/lib/bloqueo.ts`), `conCandado`, `claveCandadoUsuario` (`src/lib/candado.ts`),
  `cerrarSesionPorId` (`src/lib/sesion.ts`), `firmas` y `firma_fallo` (Tarea 1), `Firma`
  (Tarea 3).
- Produces (`src/lib/ingreso.ts`):
  `export async function comprobarCodigoFactor(usuarioId: number, codigo: string): Promise<boolean>`
  — el bloque que hoy está dentro de `intentarFactor`: seis dígitos se verifican como TOTP;
  cualquier otra cosa se consume como código de recuperación. `intentarFactor` pasa a
  llamarla, sin cambiar su comportamiento.
- Produces (`src/lib/firma.ts`):
  - `export type CredencialesFirma = { clave: string; codigo?: string };`
  - `export type ContextoFirma = { ip: string | null; userAgent: string | null };`
  - `export type ResultadoVerificacion = { ok: true; metodo: "clave" | "clave_totp" } | { ok: false; mensaje: string; sesionCerrada: boolean };`
  - `export type SesionFirma = Pick<SesionValida, "sesionId" | "usuarioId" | "usuario">;`
  - `export type Verificador = (sesion: SesionFirma, credenciales: CredencialesFirma, contexto: ContextoFirma, ahora?: Date) => Promise<ResultadoVerificacion>;`
  - `export const verificarParaFirmar: Verificador` — bajo `conCandado(claveCandadoUsuario(id))`
    y releyendo al usuario dentro del candado:
    1. Si no existe, está inactivo o **ya está bloqueado**: no evalúa nada, cierra la sesión,
       registra `firma_fallo` y devuelve `sesionCerrada: true`.
    2. Verifica la clave. **Solo si es correcta** y el usuario tiene segundo factor, verifica
       el código con `comprobarCodigoFactor` (así una clave errada nunca consume un código de
       recuperación). Sin código, cuenta como fallo.
    3. En un fallo: `estadoTrasFallo` + `guardarEstadoBloqueo`; registra `bloqueo` si el
       fallo bloqueó la cuenta y `firma_fallo` si no; si bloqueó, cierra la sesión. Mensaje:
       «Clave o código incorrectos».
    4. En un acierto: `guardarEstadoBloqueo(SIN_BLOQUEO)` y devuelve el método.
- Produces (`src/db/consultas/firmas.ts`):
  - `export async function registrarFirma(tx: Cliente, f: { tramiteId: number; versionId: number | null; usuarioId: number; firma: Firma; ronda: number; hashSha256: string; metodo: "clave" | "clave_totp"; contexto: ContextoFirma }): Promise<number>`
    — copia a la fila el nombre del usuario y el nombre de su cargo en ese momento.
  - `export type FirmaRegistrada = { firma: Firma; ronda: number; usuarioId: number; nombre: string; cargo: string | null; hashSha256: string; metodo: string; creadoEn: Date };`
  - `export async function listarFirmas(tramiteId: number, opciones?: { sql?: Cliente }): Promise<FirmaRegistrada[]>` (por orden de creación).

- [ ] **Step 1: Test que falla** (`tests/firma.test.ts`, BD)

Estos casos escriben en `accesos` desde otra conexión, así que no van en una transacción
revertida: usan usuarios `zz_firma_<caso>_${Date.now()}` creados con `INSERT` (clave
`Clave-Firma-13A-ok` con `hashearClave`, `acepto_datos_en = now()`) y una sesión de
`crearSesion`; no se borran.

```ts
const ctx = { ip: null, userAgent: "test-firma" };
it("clave correcta firma y reinicia el contador", async () => {
  const { sesion, id } = await usuarioConSesion("ok");
  await sql`UPDATE usuarios SET intentos_fallidos = 2 WHERE id = ${id}`;
  expect(await verificarParaFirmar(sesion, { clave: CLAVE }, ctx)).toEqual({ ok: true, metodo: "clave" });
  const [u] = await sql`SELECT intentos_fallidos FROM usuarios WHERE id = ${id}`;
  expect(u.intentos_fallidos).toBe(0);
});
it("clave errada no firma, suma al bloqueo y queda en accesos", async () => {
  const { sesion, id } = await usuarioConSesion("mala");
  const r = await verificarParaFirmar(sesion, { clave: "otra-clave-larga-1" }, ctx);
  expect(r).toEqual({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false });
  const [a] = await sql`SELECT resultado FROM accesos WHERE usuario_id = ${id} ORDER BY id DESC LIMIT 1`;
  expect(a.resultado).toBe("firma_fallo");
});
it("el quinto fallo bloquea la cuenta y cierra la sesión", async () => {
  const { sesion, id, token } = await usuarioConSesion("bloqueo");
  let r: ResultadoVerificacion = { ok: true, metodo: "clave" };
  for (let i = 0; i < 5; i++) r = await verificarParaFirmar(sesion, { clave: "otra-clave-larga-1" }, ctx);
  expect(r).toMatchObject({ ok: false, sesionCerrada: true });
  expect(await validarSesion(token)).toBeNull();
  const [a] = await sql`SELECT resultado FROM accesos WHERE usuario_id = ${id} ORDER BY id DESC LIMIT 1`;
  expect(a.resultado).toBe("bloqueo");
});
it("con la cuenta ya bloqueada no evalúa la clave correcta y cierra la sesión", async () => {
  const { sesion, id, token } = await usuarioConSesion("ya-bloqueada");
  await sql`UPDATE usuarios SET bloqueado_hasta = now() + interval '10 minutes' WHERE id = ${id}`;
  expect(await verificarParaFirmar(sesion, { clave: CLAVE }, ctx)).toMatchObject({ ok: false, sesionCerrada: true });
  expect(await validarSesion(token)).toBeNull();
});
it("con segundo factor exige el código, y una clave errada no gasta un código de recuperación", async () => {
  const { sesion, id, secreto, recuperacion } = await usuarioConSesion("totp", { totp: true });
  expect((await verificarParaFirmar(sesion, { clave: CLAVE }, ctx)).ok).toBe(false);                       // falta el código
  expect((await verificarParaFirmar(sesion, { clave: "otra-clave-larga-1", codigo: recuperacion }, ctx)).ok).toBe(false);
  expect(await verificarParaFirmar(sesion, { clave: CLAVE, codigo: recuperacion }, ctx)).toEqual({ ok: true, metodo: "clave_totp" });
  expect(await verificarParaFirmar(sesion, { clave: CLAVE, codigo: generarCodigoTotp(secreto, Date.now()) }, ctx)).toEqual({ ok: true, metodo: "clave_totp" });
  void id;
});
it("registrarFirma copia nombre y cargo, y la fila no se puede cambiar", () => revertida(sql, async (tx) => {
  const [u] = await tx`SELECT u.id, u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id WHERE u.usuario = 'lider.gth'`;
  const [t] = await tx`INSERT INTO tramites (numero, anio, consecutivo, tipo, motivo, justificacion, solicitante_id, proceso_id, etapa)
    SELECT 'SOL-9998-001', 9998, 1, 'crear', 'mejora', 'prueba de firma', ${u.id}, id, 'elaboracion' FROM procesos LIMIT 1 RETURNING id`;
  await registrarFirma(tx, { tramiteId: t.id, versionId: null, usuarioId: u.id, firma: "elaboro", ronda: 1, hashSha256: "abc", metodo: "clave", contexto: ctx });
  const [f] = await listarFirmas(t.id, { sql: tx });
  expect(f).toMatchObject({ firma: "elaboro", nombre: u.nombre, cargo: u.cargo, hashSha256: "abc" });
  expect(await tx.savepoint((s) => s`UPDATE firmas SET hash_sha256 = 'x'`).then(() => null, (e) => e.code)).toBe("42501");
}));
```

`usuarioConSesion(caso, { totp? })` es un ayudante del propio test: con `totp`, activa el
segundo factor (`totp_activo`, secreto cifrado con `cifrar`) e inserta un código de
recuperación con `hashCodigoRecuperacion`.

- [ ] **Step 2:** Run: `npx vitest run tests/firma.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar** `comprobarCodigoFactor`, `verificarParaFirmar`, `registrarFirma`
  y `listarFirmas`; añadir `firma_fallo` al tipo y a la pantalla Accesos con la etiqueta
  «Firma fallida».

- [ ] **Step 4:** Run: `npx vitest run tests/firma.test.ts tests/ingreso.test.ts tests/segundo-factor.test.ts tests/accesos.test.ts && npm run lint`
  — Expected: PASS (el ingreso no cambió de comportamiento).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): firma con reingreso de clave - los fallos cuentan para el bloqueo y quedan en accesos; registro de firmas"
```

---

### Tarea 6: Solicitud, visto bueno, punto único de transiciones, bandeja y página del trámite

**Files:**
- Create: `src/db/consultas/config-documental.ts`, `src/db/consultas/tramites-flujo.ts`,
  `src/db/consultas/flujo/solicitud.ts`, `src/db/consultas/tramites.ts`,
  `src/lib/esquemas/tramites.ts`, `src/app/acciones-tramites.ts`,
  `src/app/(app)/tramites/page.tsx`, `src/app/(app)/tramites/nueva/page.tsx`,
  `src/app/(app)/tramites/[id]/page.tsx`, `src/componentes/tramites/TablaTramites.tsx`,
  `src/componentes/tramites/FormularioSolicitud.tsx`, `src/componentes/tramites/EncabezadoTramite.tsx`,
  `src/componentes/tramites/PasosTramite.tsx`, `src/componentes/tramites/BloqueSolicitud.tsx`,
  `src/componentes/tramites/HistorialTramite.tsx`, `src/componentes/tramites/AccionesSolicitud.tsx`,
  `tests/utiles/tramites.ts`, `tests/tramites-solicitud.test.ts`,
  `tests/tramites-visibilidad.test.ts`, `tests/tramites-ui.test.tsx`
- Modify: `src/lib/alcance.ts` (`puedeVerTramite`), `src/componentes/cascaron/navegacion.ts`,
  `src/componentes/cascaron/IconoNav.tsx`, `src/componentes/cascaron/Cascaron.tsx`,
  `src/lib/bitacora-detalle.ts`, `src/app/(app)/documentos/[codigo]/page.tsx` (botón
  «Solicitar cambio»), `tests/acciones-permisos.test.ts`, `tests/navegacion.test.ts`,
  `tests/cascaron.test.tsx`

**Interfaces:**
- Consumes: Tareas 1 a 5; `alcanceProcesos`, `enAlcance`; `crearNotificacion`;
  `registrarAuditoria`; `mutacion`, `idNumerico` (`src/app/admin/comun.ts`);
  `parsearFormulario`; `zonaHoraria()`.
- Produces (`src/db/consultas/config-documental.ts`):
  - `export type ConfigDocumental = { formatoCodigo: string | null; plazos: { visto_bueno: number; aceptacion: number; elaboracion: number; ajustes: number; revision: number; aprobacion: number; publicacion: number }; escalamientoDias: number; publicacionDirecta: boolean };`
  - `export const CONFIG_DOCUMENTAL_DEFECTO: ConfigDocumental` (plazos 3, 3, 15, 5, 5, 5, 2;
    escalamiento 3; publicación directa `true`; formato `null`).
  - `export async function obtenerConfigDocumental(opciones?: { sql?: Cliente }): Promise<ConfigDocumental>`
    — una clave ausente, vacía o que no sea un entero entre 0 y 365 toma el valor por defecto.
- Produces (`src/db/consultas/tramites-flujo.ts`):
  - `export type SesionFlujo = Pick<SesionValida, "sesionId" | "usuarioId" | "usuario" | "nombre" | "rol" | "verHistorial">;`
  - `export class ErrorTramite extends Error {}` (errores de negocio, con mensaje para el usuario).
  - `export class ErrorFirma extends ErrorTramite { sesionCerrada: boolean }`.
  - `export type OpcionesFlujo = { sql?: Cliente; verificar?: Verificador; ahora?: Date; contexto?: ContextoFirma };`
  - `export type FilaTramite` — la fila de `tramites` en camelCase (`id`, `numero`, `tipo`,
    `motivo`, `justificacion`, `solicitanteId`, `procesoId`, `subprocesoId`,
    `tipoDocumentoId`, `tituloPropuesto`, `documentoId`, `versionId`, `etapa`, `ronda`,
    `elaboradorId`, `revisorId`, `aprobadorId`, `venceEn`, `motivoCierre`, `creadoEn`).
  - `export type DatosSolicitud = { tipo: TipoSolicitud; motivo: Motivo; justificacion: string; procesoId?: number; subprocesoId?: number; tipoDocumentoId?: number; tituloPropuesto?: string; documentoId?: number };`
  - `export async function crearSolicitud(sesion: SesionFlujo, datos: DatosSolicitud, opciones?: OpcionesFlujo): Promise<{ tramiteId: number; numero: string; etapa: Etapa }>`
  - `export type EntradaTransicion = { tramiteId: number; accion: Accion; etapaEsperada: Etapa; rondaEsperada: number; datos?: Record<string, unknown>; credenciales?: CredencialesFirma };`
  - `export async function transicionar(sesion: SesionFlujo, entrada: EntradaTransicion, opciones?: OpcionesFlujo): Promise<{ etapa: Etapa; ronda: number }>`
  - Contrato de los manejadores (lo usan las Tareas 7 a 12):
    ```ts
    export type ContextoManejador = { tx: TransactionSql; tramite: FilaTramite; sesion: SesionFlujo; datos: Record<string, unknown>; ahora: Date; config: ConfigDocumental; hacia: Etapa };
    export type Aviso = { usuarioIds: number[]; tipo: TipoAviso; titulo: string; cuerpo?: string };
    export type Efecto = { detalle?: Record<string, unknown>; cambios?: Partial<Pick<FilaTramite, "tipo" | "documentoId" | "versionId" | "tituloPropuesto" | "elaboradorId" | "revisorId" | "aprobadorId" | "venceEn" | "motivoCierre">>; avisos?: Aviso[] };
    export type Manejador = (c: ContextoManejador) => Promise<Efecto | void>;
    export type TipoAviso = "tramite.paso" | "tramite.devuelto" | "tramite.resuelto" | "tramite.cerrado" | "tramite.reasignado" | "tramite.vencido" | "tramite.escalado";
    ```
    El registro `MANEJADORES: Partial<Record<Accion, Manejador>>` se arma con los de
    `src/db/consultas/flujo/*.ts`. Una acción sin manejador lanza
    `ErrorTramite("Acción no disponible")`.
  - Qué hace `transicionar`, en este orden, dentro de una transacción (la de `opciones.sql`
    si es una, o una nueva):
    1. Lee el trámite con `FOR UPDATE`; si no existe o quien llama no puede verlo, lanza
       `ErrorTramite("El trámite no existe")`.
    2. Si `etapa` o `ronda` no son las esperadas, lanza
       `ErrorTramite("Este trámite cambió mientras lo tenía abierto. Recargue la página.")`
       y no escribe nada.
    3. Calcula `lideraPropietario` y llama a `evaluarTransicion`; un veredicto negativo lanza
       `ErrorTramite(motivo)`.
    4. Si el veredicto trae firmas, llama al verificador (`opciones.verificar`, por defecto
       `verificarParaFirmar`) con las credenciales; si falla, lanza `ErrorFirma`.
    5. Ejecuta el manejador.
    6. Actualiza el trámite: `etapa`, `ronda` (+1 si `sumaRonda`), los `cambios` del efecto,
       `vence_en`, `aviso_vencido_en` y `escalado_en` en `NULL`, y `cerrado_en` en una etapa
       final. Para `vence_en`: si el efecto trae uno, ese; si la etapa no cambia, se conserva;
       en una etapa final, `NULL`; si no, `fechaLimite` con el plazo de la etapa nueva (el de
       `ajustes` cuando entra a `elaboracion` con ronda mayor que 1).
    7. Por cada firma del veredicto, `registrarFirma` con la huella del archivo principal de
       la versión del trámite.
    8. Inserta el evento (`tipo` = la acción; `detalle` = el del efecto), la fila de
       `auditoria` (`accion: "tramite_" + accion`, `entidad: "tramite"`, `entidadId`,
       `detalle: { numero, codigo, documentoId, de, hacia, ronda, …detalle }`) y los avisos
       con `crearNotificacion(…, tx)` y `enlace: "/tramites/<id>"`, sin repetir destinatario
       y sin avisar a quien actúa.
  - Reglas de `crearSolicitud`:
    - Exige `tramites.solicitar`. Un `lider_proceso` solo pide sobre un proceso de su
      alcance; si no, `ErrorTramite("Solo puede pedir sobre los procesos que lidera")`.
    - `crear`: proceso o subproceso activos, tipo de documento activo y título propuesto.
      `modificar` y `eliminar`: el documento debe tener versión vigente; el proceso
      propietario sale de su asociación principal. La unicidad del trámite abierto se traduce
      a `ErrorTramite("Ya hay un trámite abierto sobre este documento")`.
    - Número: `SOL-<año en la zona>-<consecutivo con tres dígitos como mínimo>`, tomado bajo
      `pg_advisory_xact_lock` para que dos solicitudes simultáneas no choquen.
    - Etapa inicial (spec §8.2): si quien pide lidera el proceso propietario, eventos
      `solicitar` y `visto_bueno_automatico`, y etapa `aceptacion`; si el proceso no tiene
      ningún líder activo, eventos `solicitar` y `visto_bueno_omitido`, y etapa `aceptacion`;
      si no, evento `solicitar` y etapa `visto_bueno`.
    - Avisos `tramite.paso` a los líderes del proceso o a todos los `admin_sgc` activos,
      según la etapa. Auditoría `tramite_solicitar`.
- Produces (`src/db/consultas/flujo/solicitud.ts`): manejadores `dar_visto_bueno`,
  `negar_visto_bueno` (dato `motivo`, obligatorio) y `retirar`; avisan `tramite.resuelto` al
  solicitante y `tramite.paso` a los `admin_sgc` cuando corresponde.
- Produces (`src/lib/alcance.ts`):
  `export function puedeVerTramite(v: { etapa: Etapa; esParticipante: boolean; rol: Rol; lideraAlgunProceso: boolean; verHistorial: boolean; pasaNivelAcceso: boolean }): boolean`
  — spec §6.5: participante, `admin_sgc`, o líder de alguno de los procesos del documento; y
  en `publicado` o `eliminado`, además quien tiene historial y pasa el nivel de acceso.
- Produces (`src/db/consultas/tramites.ts`):
  - `export type ResumenTramite = { id: number; numero: string; tipo: TipoSolicitud; etapa: Etapa; ronda: number; codigo: string | null; titulo: string; versionNumero: number | null; procesoNombre: string; responsables: string[]; venceEn: Date | null };`
  - `export async function listarTramites(sesion: SesionFlujo, pestana: "por_hacer" | "en_curso" | "cerrados", opciones?: { sql?: Cliente }): Promise<ResumenTramite[]>`
    — solo los que la persona puede ver; «por hacer» son aquellos en los que
    `accionesDisponibles` le da una acción distinta de `cancelar`, `reasignar` y `retirar`.
  - `export type DetalleTramite = FilaTramite & { codigo: string | null; titulo: string; procesoNombre: string; solicitante: string; elaborador: string | null; revisor: string | null; aprobador: string | null; acciones: Accion[]; eventos: { tipo: string; persona: string | null; ronda: number; detalle: Record<string, unknown>; creadoEn: Date }[] };`
  - `export async function obtenerTramite(id: number, sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<DetalleTramite | null>` (`null` si no lo puede ver).
  - `export async function participaEnTramites(usuarioId: number, opciones?: { sql?: Cliente }): Promise<boolean>`
  - `export async function lideresDeProceso(procesoId: number, opciones?: { sql?: Cliente }): Promise<number[]>` (usuarios activos con rol `lider_proceso` asignados a ese proceso).
- Produces (`src/lib/esquemas/tramites.ts`): `EsquemaSolicitud`, `EsquemaMotivoCierre`
  (`motivo`: 5 a 1000 caracteres) y `EsquemaFirma` (`clave`: 1 a 128; `codigo` opcional, 6 a
  20), todos `.strict()`. La justificación va de 10 a 2000 caracteres y el título propuesto
  de 3 a 200.
- Produces (`src/app/acciones-tramites.ts`): `crearSolicitudAccion` (`tramites.solicitar`,
  redirige a `/tramites/<id>`), `darVistoBuenoAccion` y `negarVistoBuenoAccion`
  (`tramites.visto_bueno`), `retirarSolicitudAccion` (`tramites.solicitar`). Todas con
  `mutacion(formData, "<permiso>", fn)`; el formulario envía `id`, `etapa` y `ronda` ocultos.
  Un `ErrorFirma` con `sesionCerrada` devuelve el destino `/ingreso`.
- Produces (navegación): `EntradaNav` gana `algunPermiso?: readonly Permiso[]` y
  `siParticipa?: true`; `entradasVisibles(sujeto: SujetoPermiso & { participaEnTramites?: boolean })`
  muestra una entrada con `algunPermiso` si el sujeto tiene alguno, o si `siParticipa` y
  `participaEnTramites`. Entrada nueva en el grupo `documentos`, después de «Buscar
  documentos»: `{ href: "/tramites", etiqueta: "Trámites", icono: "tramites", grupo: "documentos", algunPermiso: ["tramites.solicitar", "tramites.gestionar", "tramites.aprobar"], siParticipa: true }`.
  `Cascaron` calcula `participaEnTramites` y lo pasa a la barra y a la paleta `Ctrl K`.
- Produces (`src/lib/bitacora-detalle.ts`): un caso para las acciones `tramite_*`, con el
  número de solicitud y el código en la frase.
- Produces (`tests/utiles/tramites.ts`, ayudantes de todos los tests del flujo; las Tareas
  7 y 8 lo amplían):
  - `sesionDe(sql: Cliente, usuario: string): Promise<SesionFlujo>` (lee a un usuario que ya
    existe, por ejemplo uno de la demo).
  - `usuarioDePrueba(tx, { rol, procesos?, jefeId? }): Promise<SesionFlujo>` (crea un usuario
    activo dentro de la transacción) y `sesionAdmin(tx): Promise<SesionFlujo>` (uno con rol
    `admin_sgc`).
  - `opc(tx, ahora = "2026-11-05T15:00:00Z"): OpcionesFlujo` con
    `verificar: async () => ({ ok: true, metodo: "clave" })`.
- Produces (pantallas, spec §15.1 a §15.3 y maquetas 1 y 3):
  - `/tramites`: `exigirSesion()`; pestañas con `?pestana=`; `TablaTramites` con las columnas
    solicitud, documento, qué pide, etapa (con la ronda si es mayor que 1), responsable y
    vencimiento (`estadoPlazo` con texto: «En N días», «Hoy», «Vencido hace N días»); botón
    «Nueva solicitud» con `tramites.solicitar`; `EstadoVacio` por pestaña.
  - `/tramites/nueva`: `exigirPermiso("tramites.solicitar")`; con `?documento=<código>` llega
    con el documento elegido. El líder solo ve sus procesos y los documentos vigentes de
    ellos.
  - `/tramites/[id]`: `exigirSesion()` y `notFound()` si `obtenerTramite` da `null`. Muestra
    `EncabezadoTramite`, `PasosTramite` (siete pasos, cinco en una eliminación; el actual con
    `aria-current="step"` y los hechos con el texto «hecho» para lectores de pantalla),
    `BloqueSolicitud`, `HistorialTramite` y `AccionesSolicitud` (solo las de `acciones`).
  - Ficha del portal: botón «Solicitar cambio» a `/tramites/nueva?documento=<código>` para
    quien tiene `tramites.solicitar` y, si es líder, el documento es de su alcance.

- [ ] **Step 1: Tests que fallan**

`tests/tramites-solicitud.test.ts` (BD, todo dentro de `revertida`, con los ayudantes de
`tests/utiles/tramites.ts`):

```ts
it("el líder pide sobre su proceso y el visto bueno queda dado", () => revertida(sql, async (tx) => {
  const lider = await sesionDe(tx, "lider.gth");
  const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-02'`;
  const r = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: "Se añade la inducción por servicio.", documentoId: doc.id }, opc(tx));
  expect(r.numero).toMatch(/^SOL-2026-\d{3,}$/);
  expect(r.etapa).toBe("aceptacion");
  const eventos = await tx`SELECT tipo FROM tramite_eventos WHERE tramite_id = ${r.tramiteId} ORDER BY id`;
  expect(eventos.map((e) => e.tipo)).toEqual(["solicitar", "visto_bueno_automatico"]);
  const [t] = await tx`SELECT vence_en, ronda FROM tramites WHERE id = ${r.tramiteId}`;
  expect(t.vence_en.toISOString()).toBe("2026-11-09T04:59:59.999Z");        // aceptación: 3 días
  expect(t.ronda).toBe(0);
  const avisos = await tx`SELECT n.tipo FROM notificaciones n JOIN usuarios u ON u.id = n.usuario_id
    WHERE n.entidad = 'tramite' AND n.entidad_id = ${r.tramiteId} AND u.rol = 'admin_sgc'`;
  expect(avisos.length).toBeGreaterThan(0);
  expect(avisos.every((a) => a.tipo === "tramite.paso")).toBe(true);
}));

it("un líder no pide sobre un proceso ajeno, ni dos veces sobre el mismo documento", () => revertida(sql, async (tx) => {
  const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-02'`;
  const datos = { tipo: "modificar", motivo: "mejora", justificacion: "Justificación de prueba.", documentoId: doc.id } as const;
  await expect(crearSolicitud(await sesionDe(tx, "lider.cex"), datos, opc(tx))).rejects.toThrow(/procesos que lidera/);
  await crearSolicitud(await sesionDe(tx, "lider.gth"), datos, opc(tx));
  await expect(crearSolicitud(await sesionDe(tx, "lider.gth"), datos, opc(tx))).rejects.toThrow(/Ya hay un trámite abierto/);
}));

it("si pide el Admin SGC, el líder da o niega el visto bueno", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);                                       // crea un admin_sgc dentro de la transacción
  const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-02'`;
  const r = await crearSolicitud(admin, { tipo: "eliminar", motivo: "mejora", justificacion: "Ya no se usa en el proceso.", documentoId: doc.id }, opc(tx));
  expect(r.etapa).toBe("visto_bueno");
  const entrada = { tramiteId: r.tramiteId, accion: "dar_visto_bueno", etapaEsperada: "visto_bueno", rondaEsperada: 0 } as const;
  await expect(transicionar(await sesionDe(tx, "lider.cex"), entrada, opc(tx))).rejects.toBeInstanceOf(ErrorTramite);
  expect(await transicionar(await sesionDe(tx, "lider.gth"), entrada, opc(tx))).toEqual({ etapa: "aceptacion", ronda: 0 });
  await expect(transicionar(await sesionDe(tx, "lider.gth"), entrada, opc(tx))).rejects.toThrow(/cambió mientras/);  // doble envío
}));

it("sin líder en el proceso el visto bueno se omite; negar exige motivo; retirar cancela", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const [p] = await tx`SELECT p.id FROM procesos p WHERE p.activo AND NOT EXISTS (
    SELECT 1 FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso' WHERE up.proceso_id = p.id) LIMIT 1`;
  const [tipo] = await tx`SELECT id FROM tipos_documento WHERE sigla = 'FO'`;
  const r = await crearSolicitud(admin, { tipo: "crear", motivo: "solicitud_personal", justificacion: "Se necesita un formato nuevo.", procesoId: p.id, tipoDocumentoId: tipo.id, tituloPropuesto: "Formato de prueba" }, opc(tx));
  expect(r.etapa).toBe("aceptacion");
  const [e] = await tx`SELECT tipo FROM tramite_eventos WHERE tramite_id = ${r.tramiteId} ORDER BY id DESC LIMIT 1`;
  expect(e.tipo).toBe("visto_bueno_omitido");
  expect(await transicionar(admin, { tramiteId: r.tramiteId, accion: "retirar", etapaEsperada: "aceptacion", rondaEsperada: 0 }, opc(tx)))
    .toEqual({ etapa: "cancelado", ronda: 0 });
  const [t] = await tx`SELECT vence_en, cerrado_en FROM tramites WHERE id = ${r.tramiteId}`;
  expect(t.vence_en).toBeNull(); expect(t.cerrado_en).not.toBeNull();
}));
```

`tests/tramites-visibilidad.test.ts` (BD, `revertida`): con un trámite de modificación de
`GTH-PR-02` pedido por `lider.gth`, `obtenerTramite` devuelve el detalle para `lider.gth`
(participante), para un `admin_sgc` y para otro líder de GTH; y `null` para `lider.cex`,
`consulta`, `gerente` y `control.interno`. Con el trámite puesto en `publicado` por `UPDATE`
dentro de la transacción, `control.interno` sí lo ve y `consulta` no. `puedeVerTramite` se
prueba además como función pura con las mismas filas.

`tests/tramites-ui.test.tsx` (render estático, como `tests/cascaron.test.tsx`):
`PasosTramite` con etapa `revision` marca un solo `aria-current="step"`, y con tipo
`eliminar` pinta cinco pasos; `TablaTramites` con un trámite vencido muestra el texto
«Vencido hace 2 días» (no solo color). `tests/navegacion.test.ts`: `consulta` no ve
«Trámites» y sí lo ve con `participaEnTramites: true`; `gerencia` y `lider_proceso` la ven
siempre.

`tests/acciones-permisos.test.ts`: la lista de archivos pasa a incluir
`src/app/acciones-tramites.ts` con la misma regla, y el mínimo de archivos sube en uno.

- [ ] **Step 2:** Run: `npx vitest run tests/tramites-solicitud.test.ts tests/tramites-visibilidad.test.ts tests/tramites-ui.test.tsx tests/navegacion.test.ts tests/acciones-permisos.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Implementar el dominio:** `config-documental.ts`, `tramites-flujo.ts`,
  `flujo/solicitud.ts`, `tramites.ts` y `puedeVerTramite`. Correr los dos tests de BD hasta
  que pasen.

- [ ] **Step 4: Implementar acciones, navegación y pantallas** de **Produces**. Leer antes
  `node_modules/next/dist/docs/` sobre Server Actions y `notFound` (AGENTS.md).

- [ ] **Step 5:** Run: `npm run lint && npm test`, y el build simulado del CI
  (`DATABASE_URL=postgres://x:x@127.0.0.1:1/x DATABASE_URL_MIGRADOR=postgres://x:x@127.0.0.1:1/x npm run build`)
  — Expected: PASS. `tests/paginas-sesion.test.ts`, `tests/sin-main.test.ts`,
  `tests/colores-fijos.test.ts` y `tests/textos-fijos.test.ts` cubren solos las páginas nuevas.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13a): solicitud con visto bueno del líder, punto único de transiciones, bandeja y página del trámite"
```

---

### Tarea 7: Aceptación — duplicidad asistida, código sugerido y designación

**Files:**
- Create: `src/db/consultas/parecidos.ts`, `src/db/consultas/codigos.ts`,
  `src/db/consultas/flujo/aceptacion.ts`, `src/componentes/tramites/PanelAceptacion.tsx`,
  `tests/tramites-aceptacion.test.ts`
- Modify: `src/db/consultas/admin.ts` (`crearDocumentoEn`, `crearVersionBorradorEn`),
  `src/db/consultas/tramites-flujo.ts` (registro de manejadores),
  `src/db/consultas/tramites.ts` (datos para el panel), `src/lib/esquemas/tramites.ts`,
  `src/app/acciones-tramites.ts`, `src/app/(app)/tramites/[id]/page.tsx`,
  `tests/utiles/tramites.ts`

**Interfaces:**
- Consumes: `transicionar` y el contrato de manejadores (Tarea 6); `rolAprobador`,
  `validarDesignacion` (Tarea 3); `siguienteConsecutivo`, `generarCodigo`,
  `patronDesdeFormato` (Tarea 2); `obtenerConfigDocumental`.
- Produces (`src/db/consultas/admin.ts`): las dos transacciones existentes se parten en un
  núcleo que recibe la transacción y su envoltorio de siempre.
  - `export async function crearDocumentoEn(tx: TransactionSql, datos: DatosDocumento & { nivelAcceso?: "general" | "restringido"; numeroInicial?: number; relacionados?: number[] }, usuarioId: number): Promise<{ documentoId: number; versionId: number }>`
    (`crearDocumento` la llama dentro de su `sql.begin`).
  - `export async function crearVersionBorradorEn(tx: TransactionSql, documentoId: number, usuarioId: number): Promise<{ versionId: number; numero: number }>`
    — el número es el mayor entre las versiones **no descartadas**, más uno.
- Produces (`src/db/consultas/parecidos.ts`):
  - `export type Parecido = { documentoId: number; codigo: string; titulo: string; version: number; procesoId: number; nivel: "muy_parecido" | "parecido" };`
  - `export async function buscarParecidos(titulo: string, opciones?: { sql?: Cliente }): Promise<Parecido[]>`
    — documentos con versión vigente, comparando con `similarity()` de `pg_trgm` el título
    sin tildes ni mayúsculas: 0,6 o más es `muy_parecido`; 0,3 o más, `parecido`; hasta cinco,
    del más parecido al menos.
- Produces (`src/db/consultas/codigos.ts`):
  `export async function sugerirCodigo(p: { procesoId: number; tipoDocumentoId: number }, opciones?: { sql?: Cliente }): Promise<string | null>`
  — `null` si no hay `formato_codigo` válido; si lo hay, `generarCodigo` con
  `siguienteConsecutivo` sobre **todos** los códigos de `documentos`.
- Produces (`src/db/consultas/tramites.ts`):
  `export async function datosParaAceptar(tramiteId: number, opciones?: { sql?: Cliente }): Promise<{ parecidos: Parecido[]; codigoSugerido: string | null; plantilla: { codigo: string; version: number } | null; autoridad: Autoridad; usuarios: { id: number; nombre: string; cargo: string | null; rol: Rol }[] }>`
  (`usuarios` son los activos; el panel filtra los candidatos con las reglas puras).
- Produces (`src/lib/esquemas/tramites.ts`): `EsquemaAceptarCreacion`,
  `EsquemaAceptarModificacion`, `EsquemaAceptarEliminacion`, todos `.strict()`:
  - creación: `decision` (`nuevo` o `modificacion`), `documentoExistenteId?`,
    `tipoDocumentoId`, `principal` y `asociaciones` (como en `parsearAsociaciones`),
    `titulo`, `descripcion?`, `palabrasClave?`, `relacionados` (ids), `nivelAcceso`, `codigo`,
    `elaboradorId`, `revisorId`, `aprobadorId`, `venceElaboracion` (`yyyy-mm-dd`, hoy o
    después);
  - modificación: `tituloNuevo?`, `elaboradorId`, `revisorId`, `aprobadorId`,
    `venceElaboracion`;
  - eliminación: `aprobadorId`.
- Produces (`src/db/consultas/flujo/aceptacion.ts`), manejadores `aceptar` y `rechazar`:
  - `aceptar` en una **creación** con `decision: "nuevo"`: valida `validarDesignacion` con la
    autoridad del tipo; valida el código contra `obtenerPatronCodigo()`; crea el documento
    con `crearDocumentoEn` (que deja la versión 1 en `borrador`), sus asociaciones, sus
    relacionados y su nivel de acceso. Un código repetido se traduce a
    `ErrorTramite("Ese código ya existe")`. Devuelve `cambios` con `documentoId`,
    `versionId`, los tres responsables y `venceEn` (el fin del día de `venceElaboracion` en
    la zona), y `detalle` con `{ parecidos, decision, codigo, version: 1, clasificacion, plantilla, responsables }`.
  - `aceptar` con `decision: "modificacion"`: exige que el documento existente sea del mismo
    proceso propietario que la solicitud (si no,
    `ErrorTramite("Ese documento es de otro proceso: rechace la solicitud con su código")`);
    el trámite pasa a `tipo: "modificar"` con ese `documentoId` y sigue como una modificación.
  - `aceptar` en una **modificación**: si el documento tiene un borrador pendiente,
    `ErrorTramite("El documento tiene un borrador de carga pendiente: publíquelo o descártelo")`;
    crea la versión con `crearVersionBorradorEn`; guarda `tituloPropuesto` si `tituloNuevo`
    difiere del actual.
  - `aceptar` en una **eliminación**: valida la designación del aprobador (S3) y guarda en
    `versionId` la versión vigente.
  - `rechazar`: dato `motivo`; lo guarda en `motivoCierre`.
  - Avisos: `tramite.resuelto` al solicitante; `tramite.paso` al elaborador (o al aprobador,
    en una eliminación).
- Produces (acciones): `aceptarSolicitudAccion` y `rechazarSolicitudAccion`, ambas con
  `tramites.gestionar`.
- Produces (`PanelAceptacion`, cliente; maqueta 2 y spec §8.3): los cuatro bloques. El
  selector de aprobador se recalcula con `rolAprobador` al cambiar el elaborador; el de
  revisor excluye al elaborador. Si no hay candidatos, dice qué falta («No hay ningún
  usuario activo con el rol Gerencia») y desactiva «Aceptar». En una modificación muestra el
  código, el tipo y el proceso sin editarlos, y el campo «Título» con el actual. En una
  eliminación solo pide el aprobador.

- [ ] **Step 1: Test que falla** (`tests/tramites-aceptacion.test.ts`, BD, `revertida`)

```ts
it("acepta una creación: código sugerido, documento, versión 1 y responsables", () => revertida(sql, async (tx) => {
  const { admin, gerente, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Consentimiento informado de procedimientos menores" });
  const datos = await datosParaAceptar(tramiteId, { sql: tx });
  expect(datos.codigoSugerido).toBe("CEX-FO-01");                      // la demo no tiene formatos de CEX
  expect(datos.autoridad).toBe("operativo");
  const r = await transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
    datos: aceptarCreacion({ codigo: "CEX-FO-01", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId }) }, opc(tx));
  expect(r).toEqual({ etapa: "elaboracion", ronda: 1 });
  const [t] = await tx`SELECT t.documento_id, v.numero, v.estado, d.codigo FROM tramites t
    JOIN documento_versiones v ON v.id = t.version_id JOIN documentos d ON d.id = t.documento_id WHERE t.id = ${tramiteId}`;
  expect(t).toMatchObject({ numero: 1, estado: "borrador", codigo: "CEX-FO-01" });
  const [e] = await tx`SELECT detalle FROM tramite_eventos WHERE tramite_id = ${tramiteId} AND tipo = 'aceptar'`;
  expect(e.detalle).toMatchObject({ decision: "nuevo", codigo: "CEX-FO-01" });
  expect(Array.isArray(e.detalle.parecidos)).toBe(true);               // evidencia del PC-02, aunque esté vacía
  void gerente;
}));

it("aplica la separación: quien elabora no revisa, y si elabora un Admin SGC aprueba Gerencia", () => revertida(sql, async (tx) => {
  const { admin, gerente, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "FO", titulo: "Formato de prueba de separación" });
  const intento = (d: Partial<Record<"elaboradorId" | "revisorId" | "aprobadorId", number>>) =>
    transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
      datos: aceptarCreacion({ codigo: "CEX-FO-01", elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId, ...d }) }, opc(tx));
  await expect(tx.savepoint(() => intento({ revisorId: liderCex.usuarioId }))).rejects.toThrow("Quien elabora no puede revisar");
  await expect(tx.savepoint(() => intento({ elaboradorId: admin.usuarioId, revisorId: liderCex.usuarioId }))).rejects.toThrow("Quien aprueba debe tener el rol Gerencia");
  expect(await intento({ elaboradorId: admin.usuarioId, revisorId: liderCex.usuarioId, aprobadorId: gerente.usuarioId })).toEqual({ etapa: "elaboracion", ronda: 1 });
}));

it("una creación duplicada pasa a modificación solo dentro del mismo proceso", () => revertida(sql, async (tx) => {
  const { admin, liderCex, tramiteId } = await solicitudDeCreacion(tx, { proceso: "CEX", tipo: "GU", titulo: "Guía de Atención de Hipertensión Arterial" });
  const parecidos = await buscarParecidos("Guía de Atención de Hipertensión Arterial", { sql: tx });
  expect(parecidos[0]).toMatchObject({ codigo: "CEX-GU-01", nivel: "muy_parecido" });
  const [otro] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-PR-01'`;
  const base = { elaboradorId: liderCex.usuarioId, revisorId: admin.usuarioId, aprobadorId: admin.usuarioId };
  const convertir = (documentoExistenteId: number) => transicionar(admin, { tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
    datos: aceptarCreacion({ ...base, decision: "modificacion", documentoExistenteId, codigo: "CEX-GU-02" }) }, opc(tx));
  await expect(tx.savepoint(() => convertir(otro.id))).rejects.toThrow(/otro proceso/);
  await convertir(parecidos[0].documentoId);
  const [t] = await tx`SELECT t.tipo, v.numero FROM tramites t JOIN documento_versiones v ON v.id = t.version_id WHERE t.id = ${tramiteId}`;
  expect(t).toMatchObject({ tipo: "modificar", numero: 2 });
}));

it("una modificación abre la versión siguiente, con el plazo elegido y el aprobador de su autoridad", () => revertida(sql, async (tx) => {
  const admin = await sesionAdmin(tx);
  const lider = await sesionDe(tx, "lider.gth");
  const [doc] = await tx`SELECT id FROM documentos WHERE codigo = 'GTH-CA-01'`;          // v1 obsoleta, v2 vigente
  const m = await crearSolicitud(lider, { tipo: "modificar", motivo: "mejora", justificacion: "Se actualiza el alcance.", documentoId: doc.id }, opc(tx));
  const gerente = await sesionDe(tx, "gerente");
  await transicionar(admin, { tramiteId: m.tramiteId, accion: "aceptar", etapaEsperada: "aceptacion", rondaEsperada: 0,
    datos: { elaboradorId: lider.usuarioId, revisorId: admin.usuarioId, aprobadorId: gerente.usuarioId, venceElaboracion: "2026-11-20" } }, opc(tx));
  const [v] = await tx`SELECT v.numero, t.vence_en FROM tramites t JOIN documento_versiones v ON v.id = t.version_id WHERE t.id = ${m.tramiteId}`;
  expect(v.numero).toBe(3);                                                              // CA es estratégico: aprueba Gerencia
  expect(v.vence_en.toISOString()).toBe("2026-11-21T04:59:59.999Z");
}));
```

`solicitudDeCreacion(tx, …)` y `aceptarCreacion(parcial)` se añaden a
`tests/utiles/tramites.ts`: el primero crea un `admin_sgc` en la transacción, arma las
sesiones de `gerente` y `lider.cex`, y deja una solicitud de creación en `aceptacion`; el
segundo completa los campos obligatorios de `EsquemaAceptarCreacion` con valores válidos. Añadir los casos de
eliminación (`aceptar` lleva a `aprobacion`, `version_id` es la vigente, y con el
solicitante `admin_sgc` exige un aprobador de Gerencia) y de `rechazar` (cierra con
`motivo_cierre` y avisa al solicitante).

- [ ] **Step 2:** Run: `npx vitest run tests/tramites-aceptacion.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar** los núcleos de `admin.ts`, `parecidos.ts`, `codigos.ts`,
  `datosParaAceptar`, los esquemas, los manejadores y las acciones. `tests/publicar.test.ts`
  debe seguir pasando: `crearDocumento` y `crearVersionBorrador` no cambian de comportamiento
  salvo que el número siguiente ignora las descartadas.

- [ ] **Step 4: Implementar `PanelAceptacion`** y montarlo en la página cuando la etapa es
  `aceptacion` y la persona tiene `tramites.gestionar`.

- [ ] **Step 5:** Run: `npm run lint && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13a): aceptación de solicitudes con duplicidad asistida, código correlativo y designación de responsables"
```

**→ Punto de control 1** (controlador, `next start` sobre el build de producción): con
`lider.gth` pedir una modificación y con `lider.cex` una creación; con `admin` ver los
parecidos, el código sugerido y aceptar; comprobar la bandeja por rol, la entrada «Trámites»
para `consulta` (ausente), el aviso en la campana y la página a 390 px y en oscuro.

---

### Tarea 8: Elaboración — borrador del elaborador, control de cambios y envío con firma

**Files:**
- Create: `src/lib/recepcion-archivo.ts`, `src/db/consultas/tramites-archivos.ts`,
  `src/db/consultas/flujo/elaboracion.ts`, `src/app/api/tramites/[id]/archivos/route.ts`,
  `src/app/api/tramites/[id]/archivos/[archivoId]/route.ts`,
  `src/app/(app)/tramites/[id]/archivos/[archivoId]/[[...nombre]]/route.ts`,
  `src/componentes/tramites/PanelElaboracion.tsx`, `src/componentes/tramites/DialogoFirma.tsx`,
  `tests/tramites-elaboracion.test.ts`, `tests/tramites-archivos.test.ts`
- Modify: `tests/utiles/tramites.ts`, `src/app/admin/api/archivos/route.ts` (usa el núcleo extraído),
  `src/componentes/admin/ZonaCarga.tsx` (la dirección de subida pasa a ser una prop),
  `src/db/consultas/tramites-flujo.ts`, `src/app/acciones-tramites.ts`,
  `src/app/(app)/tramites/[id]/page.tsx`, `tests/handlers-permisos.test.ts`

**Interfaces:**
- Consumes: `transicionar`, `Manejador`, `obtenerTramite` (Tarea 6); `verificarParaFirmar`,
  `Verificador` (Tarea 5); `registrarArchivo`, `eliminarArchivoBorrador`,
  `obtenerVersionParaSubida` (`src/db/consultas/admin.ts`); `respuestaArchivo`,
  `respuesta404` (`src/lib/servir-archivo.ts`); `origenValido`; `Dialogo`, `Campo`, `Boton`.
- Produces (`src/lib/recepcion-archivo.ts`): el cuerpo actual del `POST` de
  `src/app/admin/api/archivos/route.ts` desde la comprobación de `content-length` hasta la
  respuesta 201, sin cambios de comportamiento:
  `export async function recibirArchivo(peticion: NextRequest, destino: { versionId: number; codigo: string; numero: number; rol: RolArchivo }, usuarioId: number): Promise<NextResponse>`.
  El handler del panel conserva sesión, permiso, `Origin`, límite, parámetros y estado de la
  versión, y luego la llama.
- Produces (`src/db/consultas/tramites-archivos.ts`):
  - `export type AutorizacionArchivo = { ok: true; versionId: number; codigo: string; numero: number } | { ok: false; estado: 404 | 409 };`
  - `export async function autorizarArchivoDeTramite(tramiteId: number, sesion: SesionFlujo, operacion: "leer" | "escribir", opciones?: { sql?: Cliente }): Promise<AutorizacionArchivo>`
    — `leer`: 404 si la persona no ve el trámite (spec §6.5), si el trámite ya no está en una
    etapa de trabajo o si no tiene versión. `escribir`: además 404 si la persona no es el
    elaborador, y 409 si el trámite es suyo pero no está en `elaboracion`.
  - `export async function archivoDeTramite(tramiteId: number, archivoId: number, opciones?: { sql?: Cliente }): Promise<ArchivoServible | null>`
    (solo archivos de la versión del trámite; nunca un acta).
  - `export async function guardarControlCambios(tramiteId: number, sesion: SesionFlujo, texto: string, opciones?: { sql?: Cliente }): Promise<void>`
    (solo el elaborador y solo en `elaboracion`; escribe `resumen_cambios`; auditoría
    `editar_version` con `documentoId` en el detalle).
- Produces (handlers):
  - `POST /api/tramites/[id]/archivos?rol=…`: sesión (401), `tramites.participar` (403),
    `origenValido` (403), límite de 30 por minuto y usuario (429), rol de archivo válido
    (400), `autorizarArchivoDeTramite(…, "escribir")` (404 o 409) y `recibirArchivo`.
  - `DELETE /api/tramites/[id]/archivos/[archivoId]`: las mismas comprobaciones en el mismo
    orden; el archivo debe ser de la versión del trámite; borra con `eliminarArchivoBorrador`
    y quita el archivo físico.
  - `GET /tramites/[id]/archivos/[archivoId]/…`: sesión (401), límite de 60 por minuto,
    `autorizarArchivoDeTramite(…, "leer")` y `archivoDeTramite` (404 si falla alguno); sirve
    el original con `respuestaArchivo`, **sin marca de agua** y con `Cache-Control: no-store`.
- Produces (`src/db/consultas/flujo/elaboracion.ts`), manejador `enviar_a_revision`: exige
  archivo principal («Falta el archivo principal»), control de cambios («Falta el control de
  cambios») y que toda observación `abierta` tenga respuesta («Hay observaciones sin
  responder»). Avisa `tramite.paso` al revisor.
- Produces (`transicionar`, paso 7 de la Tarea 6, se completa aquí): al registrar una firma
  distinta de `elaboro` en un trámite que no es una eliminación, la huella del archivo
  principal debe ser la que firmó el elaborador en la ronda en curso; si no,
  `ErrorTramite("El archivo cambió después de la firma de quien elaboró")`.
- Produces (acciones): `guardarControlCambiosAccion` y `enviarARevisionAccion`, las dos con
  `tramites.participar`. Las acciones que firman leen `clave` y `codigo` con `EsquemaFirma`,
  toman IP y agente de usuario como `contextoDePeticion()` de `src/app/acciones-cuenta.ts`, y
  si reciben un `ErrorFirma` con `sesionCerrada` devuelven el destino `/ingreso`.
- Produces (`DialogoFirma`, cliente, maqueta 4):
  `{ titulo: string; etiquetaBoton: string; resumen: { documento: string; version: number | null; huella: string | null }; accion: (estado: EstadoAccion, formData: FormData) => Promise<EstadoAccion>; ocultos: Record<string, string>; pideCodigo: boolean; children?: React.ReactNode }`.
  Usa `Dialogo`; campo `clave` (`type="password"`, `autoComplete="current-password"`) y, con
  `pideCodigo`, campo `codigo` (`inputMode="numeric"`, `autoComplete="one-time-code"`) con la
  ayuda «Código de su aplicación de autenticación o un código de recuperación»; el error del
  servidor se muestra con `role="alert"`; `children` son campos propios de la acción (el
  concepto). `pideCodigo` es `sesion.totpActivo`.
- Produces (`PanelElaboracion`, spec §9.1): enlace a la plantilla vigente del tipo, si hay;
  archivos del borrador con rol, tamaño y huella abreviada; `ZonaCarga` apuntando a
  `/api/tramites/<id>/archivos`; control de cambios; observaciones abiertas con su respuesta
  (el formulario llega en la Tarea 9); botón «Enviar a revisión», que abre `DialogoFirma`.
  Para quien no es el elaborador, el mismo bloque en solo lectura con la banda «EN TRÁMITE».
- Produces (`tests/utiles/tramites.ts`, se amplía con dos ayudantes):
  - `archivoPrincipal(tx, versionId): Promise<{ archivoId: number; hash: string; limpiar: () => Promise<void> }>`
    (escribe un PDF pequeño real en `zz-pruebas/<marca de tiempo>/` del almacén y registra la
    fila con su SHA-256 verdadero).
  - `tramiteEn(tx, etapa: EtapaTrabajo, o?: { codigo?: string; tipo?: TipoSolicitud; elaborador?: SesionFlujo; revisor?: SesionFlujo; aprobador?: SesionFlujo }): Promise<{ tramiteId: number; versionId: number | null; ronda: number; admin: SesionFlujo; elaborador: SesionFlujo; revisor: SesionFlujo; aprobador: SesionFlujo; limpiar: () => Promise<void> }>`
    — lleva un trámite (por defecto, modificación de `GTH-PR-02` pedida por `lider.gth`)
    hasta esa etapa **usando las funciones reales**. Acepta con
    `venceElaboracion: "2026-11-20"` y, donde hace falta un archivo, usa `archivoPrincipal`
    (`limpiar` borra lo que haya escrito en el almacén). En esta tarea llega hasta
    `revision`; las Tareas 9 y 10 lo extienden.

- [ ] **Step 1: Tests que fallan**

`tests/tramites-elaboracion.test.ts` (BD, `revertida`):

```ts
it("no se envía sin archivo principal ni sin control de cambios", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "elaboracion");
  const enviar = () => tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision",
    etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "x" } }, opc(tx)));
  await expect(enviar()).rejects.toThrow("Falta el archivo principal");
  const a = await archivoPrincipal(tx, t.versionId!);
  try {
    await expect(enviar()).rejects.toThrow("Falta el control de cambios");
    await guardarControlCambios(t.tramiteId, t.elaborador, "Se añade la inducción por servicio.", { sql: tx });
    expect(await enviar()).toEqual({ etapa: "revision", ronda: 1 });
    const [f] = await listarFirmas(t.tramiteId, { sql: tx });
    expect(f).toMatchObject({ firma: "elaboro", ronda: 1, hashSha256: a.hash, usuarioId: t.elaborador.usuarioId });
  } finally { await a.limpiar(); }
}));

it("si la firma falla, el trámite no avanza y no queda firma", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "elaboracion");
  const a = await archivoPrincipal(tx, t.versionId!);
  try {
    await guardarControlCambios(t.tramiteId, t.elaborador, "Cambios de prueba.", { sql: tx });
    const rechaza: Verificador = async () => ({ ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false });
    await expect(tx.savepoint(() => transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision",
      etapaEsperada: "elaboracion", rondaEsperada: 1, credenciales: { clave: "mala" } }, { ...opc(tx), verificar: rechaza })))
      .rejects.toBeInstanceOf(ErrorFirma);
    const [fila] = await tx`SELECT etapa FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.etapa).toBe("elaboracion");
    expect(await listarFirmas(t.tramiteId, { sql: tx })).toEqual([]);
  } finally { await a.limpiar(); }
}));
```

`tests/tramites-archivos.test.ts` (BD, `revertida`):

```ts
it("solo el elaborador escribe, y solo en elaboración", () => revertida(sql, async (tx) => {
  const consulta = await sesionDe(tx, "consulta");
  const t = await tramiteEn(tx, "elaboracion", { elaborador: consulta });
  const otro = await tramiteEn(tx, "elaboracion", { codigo: "GTH-PR-01" });
  const puede = (id: number, s: SesionFlujo, op: "leer" | "escribir") => autorizarArchivoDeTramite(id, s, op, { sql: tx });
  expect((await puede(t.tramiteId, consulta, "escribir")).ok).toBe(true);
  expect(await puede(otro.tramiteId, consulta, "escribir")).toEqual({ ok: false, estado: 404 });   // trámite ajeno
  expect(await puede(otro.tramiteId, consulta, "leer")).toEqual({ ok: false, estado: 404 });
  expect(await puede(t.tramiteId, t.revisor, "escribir")).toEqual({ ok: false, estado: 404 });     // lo ve, pero no elabora
  expect((await puede(t.tramiteId, t.revisor, "leer")).ok).toBe(true);
  await tx`UPDATE tramites SET etapa = 'revision' WHERE id = ${t.tramiteId}`;
  expect(await puede(t.tramiteId, consulta, "escribir")).toEqual({ ok: false, estado: 409 });     // suyo, fuera de elaboración
  await tx`UPDATE tramites SET etapa = 'publicado' WHERE id = ${t.tramiteId}`;
  expect(await puede(t.tramiteId, consulta, "leer")).toEqual({ ok: false, estado: 404 });          // cerrado: ya no por esta ruta
}));
```

En `tests/handlers-permisos.test.ts`, con la sesión simulada como en
`tests/archivos-origen.test.ts`: los dos handlers nuevos que escriben responden 401 sin
sesión y 403 con un `Origin` ajeno, y el `GET` responde 401 sin sesión.

- [ ] **Step 2:** Run: `npx vitest run tests/tramites-elaboracion.test.ts tests/tramites-archivos.test.ts tests/handlers-permisos.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Extraer `recibirArchivo`** y comprobar que nada cambió:
  Run: `npx vitest run tests/subida.test.ts tests/archivos-origen.test.ts tests/handlers-permisos.test.ts`
  — Expected: los casos heredados siguen pasando.

- [ ] **Step 4: Implementar** los dos ayudantes de `tests/utiles/tramites.ts`, `tramites-archivos.ts`, el manejador,
  la regla de la huella en `transicionar`, los tres handlers y las acciones.

- [ ] **Step 5: Implementar `DialogoFirma` y `PanelElaboracion`** y montarlos en la página.

- [ ] **Step 6:** Run: `npm run lint && npm test` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(f13a): elaboración - el designado sube el borrador, escribe el control de cambios y envía a revisión con su clave"
```

---

### Tarea 9: Revisión — lista de verificación, observaciones, devolución y concepto favorable

**Files:**
- Create: `src/db/consultas/revision.ts`, `src/db/consultas/flujo/revision.ts`,
  `src/componentes/tramites/ListaVerificacion.tsx`, `src/componentes/tramites/Observaciones.tsx`,
  `src/componentes/tramites/PanelRevision.tsx`, `tests/tramites-revision.test.ts`
- Modify: `src/db/consultas/tramites-flujo.ts`, `src/db/consultas/tramites.ts` (el detalle
  trae lista y observaciones), `src/lib/esquemas/tramites.ts`, `src/app/acciones-tramites.ts`,
  `src/app/(app)/tramites/[id]/page.tsx`, `src/componentes/tramites/PanelElaboracion.tsx`
  (responder observaciones), `tests/utiles/tramites.ts` (`tramiteEn` llega a `aprobacion`)

**Interfaces:**
- Consumes: Tareas 6 y 8; `lista_verificacion_items`, `tramite_verificaciones`,
  `tramite_observaciones` (Tarea 1); los ocho ítems de la semilla (Tarea 2).
- Produces (`src/db/consultas/revision.ts`):
  - `export type ItemVerificacion = { id: number; texto: string; critico: boolean; orden: number; activo: boolean };`
  - `export async function listarItemsVerificacion(opciones?: { sql?: Cliente; soloActivos?: boolean }): Promise<ItemVerificacion[]>`
  - `export type RespuestaItem = { itemId: number; texto: string; critico: boolean; resultado: "cumple" | "no_cumple" | "no_aplica" | null; nota: string | null };`
  - `export async function obtenerVerificacion(tramiteId: number, ronda: number, opciones?: { sql?: Cliente }): Promise<RespuestaItem[]>`
    — los ítems activos con la respuesta de esa ronda; si la ronda no tiene ninguna, propone
    las de la ronda anterior (sin guardarlas).
  - `export async function guardarVerificacion(tramiteId: number, sesion: SesionFlujo, respuestas: { itemId: number; resultado: "cumple" | "no_cumple" | "no_aplica"; nota?: string }[], opciones?: { sql?: Cliente }): Promise<void>`
    — solo el revisor y solo en `revision`; guarda para la ronda en curso, con el texto y la
    marca de crítico del ítem copiados.
  - `export type Observacion = { id: number; numero: number; ronda: number; origen: "revision" | "aprobacion"; texto: string; autor: string; respuesta: string | null; estado: "abierta" | "atendida" | "cerrada"; notaReapertura: string | null; creadoEn: Date };`
  - `export async function listarObservaciones(tramiteId: number, opciones?: { sql?: Cliente }): Promise<Observacion[]>`
  - `export async function crearObservacion(tramiteId: number, sesion: SesionFlujo, texto: string, opciones?: { sql?: Cliente }): Promise<number>`
    (solo el revisor en `revision`; numera de corrido dentro del trámite; origen `revision`).
  - `export async function crearObservacionesDeAprobacion(tx: TransactionSql, tramite: FilaTramite, autorId: number, textos: string[]): Promise<void>`
    (para el manejador `devolver_aprobacion` de la Tarea 10; origen `aprobacion`).
  - `export async function responderObservacion(observacionId: number, sesion: SesionFlujo, respuesta: string, opciones?: { sql?: Cliente }): Promise<void>`
    (solo el elaborador en `elaboracion`; pasa a `atendida`).
  - `export async function cerrarObservacion(observacionId: number, sesion: SesionFlujo, opciones?: { sql?: Cliente }): Promise<void>`
    y `export async function reabrirObservacion(observacionId: number, sesion: SesionFlujo, nota: string, opciones?: { sql?: Cliente }): Promise<void>`
    (solo el revisor en `revision`; cerrar exige estado `atendida`; reabrir la deja `abierta`).
  - Cada escritura deja su fila de `auditoria` (`entidad: "tramite"`, con el número de la
    observación en el detalle). Una acción fuera de su etapa o de su persona lanza
    `ErrorTramite`.
- Produces (`src/db/consultas/flujo/revision.ts`):
  - `devolver_revision`: exige al menos una observación `abierta` («Para devolver, escriba al
    menos una observación»). Avisa `tramite.devuelto` al elaborador. Detalle
    `{ observaciones: <números abiertos> }`.
  - `concepto_favorable`: dato `concepto` (5 a 2000). Exige las tres condiciones del spec
    §9.2, con estos mensajes: «Faltan ítems de la lista por responder»; «Hay un ítem crítico
    que no cumple»; «Hay observaciones sin cerrar». Detalle
    `{ concepto, lista: RespuestaItem[], observaciones: { total, cerradas } }`. Avisa
    `tramite.paso` al aprobador.
- Produces (acciones): `guardarVerificacionAccion`, `crearObservacionAccion`,
  `cerrarObservacionAccion`, `reabrirObservacionAccion`, `devolverRevisionAccion`,
  `conceptoFavorableAccion` (todas con `tramites.revisar`) y `responderObservacionAccion`
  (`tramites.participar`).
- Produces (componentes, maqueta 3 y spec §9.2 y §9.3):
  - `ListaVerificacion`: cada ítem es un `fieldset` con su `legend` y tres opciones de radio
    (Cumple, No cumple, No aplica); la marca «Crítico» va con texto; nota opcional; botón
    «Guardar avance». En solo lectura muestra el resultado como texto.
  - `Observaciones`: cada una con su número, su texto, quién la escribió, su estado con
    texto, la respuesta y la nota de reapertura; los formularios de crear, cerrar, reabrir y
    responder aparecen solo a quien corresponde.
  - `PanelRevision`: lista, observaciones y los botones «Devolver a elaboración» y «Dar
    concepto favorable» (este abre `DialogoFirma` con el campo «Concepto»).

- [ ] **Step 1: Test que falla** (`tests/tramites-revision.test.ts`, BD, `revertida`)

```ts
it("el concepto favorable exige lista completa, ningún crítico sin cumplir y observaciones cerradas", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "revision");
  try {
    const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
    const favorable = () => tx.savepoint(() => transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable",
      etapaEsperada: "revision", rondaEsperada: 1, datos: { concepto: "Cumple; listo para aprobación." }, credenciales: { clave: "x" } }, opc(tx)));
    const responder = (resultados: Record<number, "cumple" | "no_cumple" | "no_aplica">) => guardarVerificacion(t.tramiteId, t.revisor,
      items.filter((i) => resultados[i.id] ?? resultados[0]).map((i) => ({ itemId: i.id, resultado: resultados[i.id] ?? resultados[0] })), { sql: tx });

    await responder({ [items[0].id]: "cumple" });
    await expect(favorable()).rejects.toThrow("Faltan ítems de la lista por responder");
    await responder({ 0: "cumple", [items[0].id]: "no_cumple" });               // el primero es crítico
    await expect(favorable()).rejects.toThrow("Hay un ítem crítico que no cumple");
    await responder({ 0: "cumple", [items[3].id]: "no_cumple" });               // el cuarto no es crítico
    const n = await crearObservacion(t.tramiteId, t.revisor, "Falta el responsable en el numeral 5.2.", { sql: tx });
    await expect(favorable()).rejects.toThrow("Hay observaciones sin cerrar");

    expect(await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx)))
      .toEqual({ etapa: "elaboracion", ronda: 2 });
    const [fila] = await tx`SELECT vence_en FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.vence_en.toISOString()).toBe("2026-11-11T04:59:59.999Z");       // ajustes: 5 días

    await responderObservacion(n, t.elaborador, "Se agregó al jefe inmediato.", { sql: tx });
    await transicionar(t.elaborador, { tramiteId: t.tramiteId, accion: "enviar_a_revision", etapaEsperada: "elaboracion", rondaEsperada: 2, credenciales: { clave: "x" } }, opc(tx));

    const ronda2 = await obtenerVerificacion(t.tramiteId, 2, { sql: tx });
    expect(ronda2.find((r) => r.itemId === items[3].id)!.resultado).toBe("no_cumple");   // parte de la ronda anterior
    await guardarVerificacion(t.tramiteId, t.revisor, ronda2.map((r) => ({ itemId: r.itemId, resultado: r.resultado! })), { sql: tx });
    await cerrarObservacion(n, t.revisor, { sql: tx });
    const cierre = await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "concepto_favorable", etapaEsperada: "revision", rondaEsperada: 2,
      datos: { concepto: "Observaciones atendidas." }, credenciales: { clave: "x" } }, opc(tx));
    expect(cierre).toEqual({ etapa: "aprobacion", ronda: 2 });
    const firmas = await listarFirmas(t.tramiteId, { sql: tx });
    expect(firmas.map((f) => `${f.firma}:${f.ronda}`)).toEqual(["elaboro:1", "elaboro:2", "reviso:2"]);
    expect(new Set(firmas.filter((f) => f.ronda === 2).map((f) => f.hashSha256)).size).toBe(1);
  } finally { await t.limpiar(); }
}));

it("cada quien solo hace lo suyo, y una ronda cerrada no se edita", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "revision");
  try {
    await expect(tx.savepoint(() => crearObservacion(t.tramiteId, t.elaborador, "No debería poder.", { sql: tx }))).rejects.toBeInstanceOf(ErrorTramite);
    const n = await crearObservacion(t.tramiteId, t.revisor, "Observación de prueba.", { sql: tx });
    await expect(tx.savepoint(() => responderObservacion(n, t.elaborador, "Todavía no es mi turno.", { sql: tx }))).rejects.toBeInstanceOf(ErrorTramite);
    await expect(tx.savepoint(() => cerrarObservacion(n, t.revisor, { sql: tx }))).rejects.toBeInstanceOf(ErrorTramite);   // sigue abierta
    await transicionar(t.revisor, { tramiteId: t.tramiteId, accion: "devolver_revision", etapaEsperada: "revision", rondaEsperada: 1 }, opc(tx));
    const items = await listarItemsVerificacion({ sql: tx, soloActivos: true });
    await expect(tx.savepoint(() => guardarVerificacion(t.tramiteId, t.revisor, [{ itemId: items[0].id, resultado: "cumple" }], { sql: tx })))
      .rejects.toBeInstanceOf(ErrorTramite);                                                                              // ya no está en revisión
  } finally { await t.limpiar(); }
}));
```

Añadir un caso de `reabrirObservacion` (vuelve a `abierta` con su nota y bloquea el concepto
favorable) y otro de ítem desactivado (no se exige ni aparece en la ronda siguiente, pero la
respuesta guardada conserva su texto).

- [ ] **Step 2:** Run: `npx vitest run tests/tramites-revision.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar** `revision.ts`, los dos manejadores, las acciones y la extensión de
  `tramiteEn` hasta `aprobacion`.

- [ ] **Step 4: Implementar los tres componentes**, añadir el formulario de respuesta a
  `PanelElaboracion` y montar `PanelRevision` en la página. Un test de render estático en
  `tests/tramites-ui.test.tsx`: cada ítem de `ListaVerificacion` es un `fieldset` con `legend`
  y el ítem crítico lleva el texto «Crítico».

- [ ] **Step 5:** Run: `npm run lint && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13a): revisión con lista de verificación y observaciones numeradas; devolución y concepto favorable firmado"
```

---

### Tarea 10: Aprobación, publicación y eliminación

**Files:**
- Create: `src/lib/huella.ts`, `src/db/consultas/flujo/cierre.ts`,
  `src/componentes/tramites/PanelAprobacion.tsx`, `src/componentes/tramites/PanelPublicacion.tsx`,
  `tests/tramites-cierre.test.ts`, `tests/huella.test.ts`
- Modify: `src/db/consultas/admin.ts` (`aplicarPublicacion`, `anularVigenteEn`),
  `src/db/consultas/tramites-flujo.ts`, `src/lib/esquemas/tramites.ts`,
  `src/app/acciones-tramites.ts`, `src/app/(app)/tramites/[id]/page.tsx`,
  `tests/utiles/tramites.ts` (`tramiteEn` llega a `publicacion`), `tests/publicar.test.ts`

**Interfaces:**
- Consumes: Tareas 5 a 9; `resolverRutaAlmacen` (`src/lib/almacen.ts`); `listarFirmas`;
  `crearObservacionesDeAprobacion`; `lideresDeProceso`.
- Produces (`src/lib/huella.ts`):
  `export async function huellaDeArchivo(rutaRelativa: string): Promise<string>` — SHA-256 en
  hexadecimal, leyendo en streaming desde el almacén; lanza si la ruta no resuelve dentro del
  almacén o el archivo no existe.
- Produces (`src/db/consultas/admin.ts`):
  - `export async function aplicarPublicacion(tx: TransactionSql, versionId: number, origen: "plataforma" | "fuera", usuarioId: number): Promise<{ documentoId: number; numero: number; obsoletas: number[] }>`
    — lo que hoy hace `publicarVersion` desde el `UPDATE` que vuelve obsoleta la anterior:
    obsoleta → vigente (en ese orden), `publicado_en = now()`, `origen_aprobacion`,
    `documentos.actualizado_en` y la auditoría `publicar_version`. `publicarVersion` (camino
    directo) conserva sus comprobaciones y la llama con `"fuera"`.
  - `export async function anularVigenteEn(tx: TransactionSql, documentoId: number, usuarioId: number): Promise<{ versionId: number; numero: number }>`
    (el cuerpo de `anularVigente`, que pasa a llamarla).
- Produces (`src/db/consultas/flujo/cierre.ts`):
  - `aprobar`: dato `concepto` (5 a 2000), que va al detalle. Avisa `tramite.paso` a los
    `admin_sgc` activos.
  - `devolver_aprobacion`: dato `observaciones` (1 a 10 textos); las crea con origen
    `aprobacion`. Avisa `tramite.devuelto` al elaborador.
  - `negar_eliminacion`: dato `motivo`; avisa `tramite.resuelto` al solicitante.
  - `publicar` en crear y modificar (spec §11.1), dentro de la transacción:
    1. Exige las firmas `elaboro`, `reviso` y `aprobo` de la ronda en curso («Faltan firmas
       para publicar»).
    2. Compara `huellaDeArchivo(ruta)` del principal con su `hash_sha256`; si difieren,
       `ErrorTramite("El archivo en el almacén no coincide con el aprobado. No se publicó.")`.
    3. Copia a la versión `elaboro`, `reviso` y `aprobo` como `Nombre — Cargo` (solo el nombre
       si no hay cargo) y `fecha_elaboracion`, `fecha_revision` y `fecha_aprobacion` con el
       día de cada firma en la zona.
    4. `aplicarPublicacion(tx, versionId, "plataforma", usuarioId)`.
    5. Si el trámite trae `tituloPropuesto`, lo aplica a `documentos.titulo`.
    6. Avisa `tramite.cerrado` a los participantes y a los líderes de los procesos del
       documento. Detalle `{ version, obsoletas, huella }`.
  - `publicar` en una eliminación (spec §11.3): exige la firma `aprobo`; `anularVigenteEn`;
    avisos como arriba. Detalle `{ versionAnulada }`.
  - `aprobar_y_publicar`: el efecto de `aprobar` seguido del de `publicar`; como la firma
    `aprobo` se escribe en la misma transición, el paso 1 solo exige `elaboro` y `reviso`, y
    el paso 3 toma el nombre, el cargo y el día de quien actúa.
- Produces (acciones): `aprobarAccion`, `devolverAprobacionAccion`, `negarEliminacionAccion`
  (`tramites.aprobar`); `publicarTramiteAccion` y `aprobarYPublicarAccion`
  (`tramites.gestionar`).
- Produces (componentes): `PanelAprobacion` (lo revisado en solo lectura, campo «Concepto» y
  los botones «Aprobar», «Aprobar y publicar» solo si la persona tiene `tramites.gestionar`,
  «Devolver con observaciones» y, en una eliminación, «Negar la eliminación»);
  `PanelPublicacion` («Publicar» o «Eliminar el documento»). Los que firman usan
  `DialogoFirma`; el de eliminar dice «Esta acción retira el documento de circulación».

- [ ] **Step 1: Tests que fallan**

`tests/huella.test.ts`: `huellaDeArchivo` de un archivo escrito por el test coincide con
`createHash("sha256")` de sus bytes, y una ruta con `..` lanza.

`tests/tramites-cierre.test.ts` (BD, `revertida`):

```ts
it("aprobar y publicar en un solo acto deja la versión vigente con sus datos de control", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "aprobacion");                         // GTH-PR-02 es operativo: aprueba un admin_sgc
  try {
    const [antes] = await tx`SELECT v.id, v.numero FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = 'GTH-PR-02' AND v.estado = 'vigente'`;
    const r = await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar_y_publicar", etapaEsperada: "aprobacion", rondaEsperada: t.ronda,
      datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } }, opc(tx));
    expect(r.etapa).toBe("publicado");
    const [v] = await tx`SELECT estado, origen_aprobacion, publicado_en, elaboro, reviso, aprobo, fecha_aprobacion::text AS fecha
      FROM documento_versiones WHERE id = ${t.versionId}`;
    expect(v).toMatchObject({ estado: "vigente", origen_aprobacion: "plataforma", fecha: "2026-11-05" });
    expect(v.publicado_en).not.toBeNull();
    expect(v.elaboro).toMatch(/ — /);                                  // «Nombre — Cargo»
    const [anterior] = await tx`SELECT estado FROM documento_versiones WHERE id = ${antes.id}`;
    expect(anterior.estado).toBe("obsoleto");
    const [{ vigentes }] = await tx`SELECT count(*)::int AS vigentes FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
      WHERE d.codigo = 'GTH-PR-02' AND v.estado = 'vigente'`;
    expect(vigentes).toBe(1);
    const firmas = (await listarFirmas(t.tramiteId, { sql: tx })).filter((f) => f.ronda === t.ronda);
    expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo", "publico"]);
    expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
  } finally { await t.limpiar(); }
}));

it("un documento estratégico lo aprueba Gerencia y lo publica un Admin SGC", () => revertida(sql, async (tx) => {
  const gerente = await sesionDe(tx, "gerente");
  const t = await tramiteEn(tx, "aprobacion", { codigo: "GTH-CA-01", aprobador: gerente });
  try {
    const entrada = { tramiteId: t.tramiteId, etapaEsperada: "aprobacion", rondaEsperada: t.ronda, datos: { concepto: "Aprobado." }, credenciales: { clave: "x" } } as const;
    await expect(tx.savepoint(() => transicionar(gerente, { ...entrada, accion: "aprobar_y_publicar" }, opc(tx)))).rejects.toBeInstanceOf(ErrorTramite);
    expect((await transicionar(gerente, { ...entrada, accion: "aprobar" }, opc(tx))).etapa).toBe("publicacion");
    expect((await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx))).etapa).toBe("publicado");
  } finally { await t.limpiar(); }
}));

it("no publica si el archivo del almacén cambió", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "publicacion");
  try {
    await tx`UPDATE archivos SET hash_sha256 = ${"0".repeat(64)} WHERE version_id = ${t.versionId} AND rol = 'principal'`;
    await expect(tx.savepoint(() => transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx))))
      .rejects.toThrow(/no coincide|cambió después/);
    const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
    expect(v.estado).toBe("borrador");
  } finally { await t.limpiar(); }
}));

it("el aprobador devuelve, y el documento vuelve a pasar por revisión", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "aprobacion");
  try {
    const r = await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "devolver_aprobacion", etapaEsperada: "aprobacion", rondaEsperada: t.ronda,
      datos: { observaciones: ["Falta citar la resolución vigente."] } }, opc(tx));
    expect(r).toEqual({ etapa: "elaboracion", ronda: t.ronda + 1 });
    const [o] = await tx`SELECT origen, estado FROM tramite_observaciones WHERE tramite_id = ${t.tramiteId} ORDER BY id DESC LIMIT 1`;
    expect(o).toMatchObject({ origen: "aprobacion", estado: "abierta" });
  } finally { await t.limpiar(); }
}));

it("una eliminación aprobada deja el documento anulado, con su firma", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "aprobacion", { codigo: "GTH-PR-01", tipo: "eliminar" });
  try {
    await transicionar(t.aprobador, { tramiteId: t.tramiteId, accion: "aprobar", etapaEsperada: "aprobacion", rondaEsperada: 0, datos: { concepto: "Procede." }, credenciales: { clave: "x" } }, opc(tx));
    const r = await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: 0, credenciales: { clave: "x" } }, opc(tx));
    expect(r.etapa).toBe("eliminado");
    const [v] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
    expect(v.estado).toBe("anulado");
    expect((await listarFirmas(t.tramiteId, { sql: tx })).map((f) => f.firma)).toEqual(["aprobo", "publico"]);
  } finally { await t.limpiar(); }
}));
```

Añadir: un trámite de modificación con `titulo_propuesto` cambia `documentos.titulo` solo al
publicar; `negar_eliminacion` cierra en `rechazado` con su motivo.

`tests/publicar.test.ts`: los casos que prueban la regla de negocio 1 (publicar vuelve
obsoleta la anterior en la misma transacción) pasan a ejercitar `aplicarPublicacion`; no se
borra ninguno.

- [ ] **Step 2:** Run: `npx vitest run tests/tramites-cierre.test.ts tests/huella.test.ts tests/publicar.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Implementar** `huella.ts`, `aplicarPublicacion`, `anularVigenteEn`, los
  manejadores, las acciones y la extensión de `tramiteEn`.

- [ ] **Step 4: Implementar los dos paneles** y montarlos en la página.

- [ ] **Step 5:** Run: `npm run lint && npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13a): aprobación por autoridad, publicación y eliminación firmadas; lo aprobado es lo publicado"
```

---

### Tarea 11: Acta de aprobación y de eliminación

**Files:**
- Create: `src/lib/acta.ts`, `src/db/consultas/actas.ts`,
  `src/app/(app)/tramites/[id]/acta/route.ts`, `tests/acta.test.ts`
- Modify: `src/lib/alcance.ts` (`puedeVerVersion`), `src/db/consultas/documentos.ts` y
  `src/db/consultas/admin.ts` (las listas de archivos excluyen las actas y exponen el trámite
  de cada versión), `src/app/acciones-tramites.ts` (genera el acta tras publicar),
  `src/app/(app)/tramites/[id]/page.tsx`, `src/app/(app)/documentos/[codigo]/page.tsx`,
  `src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx`

**Interfaces:**
- Consumes: `listarFirmas`, `obtenerTramite`, `obtenerMarcaSegura`
  (`src/db/consultas/entidad.ts`), `resolverRutaAlmacen`, `zonaHoraria()`, los roles de acta
  de `archivos` (Tarea 1), `tests/utiles/pdf.ts` (`contieneTexto`).
- Produces (`src/lib/acta.ts`, sin BD):
  - `export type DatosActa = { clase: "aprobacion" | "eliminacion"; entidad: string; documento: { codigo: string; titulo: string; tipo: string; proceso: string }; version: number; solicitud: { numero: string; tipo: string; motivo: string; justificacion: string; solicitante: string; fecha: Date }; vistoBueno: string; aceptacion: { quien: string; fecha: Date; duplicidad: string | null }; controlCambios: string | null; firmas: { firma: string; nombre: string; cargo: string | null; fecha: Date; huella: string }[]; rondas: number; observaciones: { total: number; cerradas: number }; versionObsoleta: number | null; publicadoEn: Date; zona: string };`
  - `export async function generarActa(d: DatosActa): Promise<Uint8Array>` — PDF tamaño carta
    con `pdf-lib` y la fuente estándar: título «Acta de aprobación documental» o «Acta de
    eliminación documental»; entidad; documento y versión; solicitud; visto bueno;
    aceptación; control de cambios; tabla de firmas (firma, nombre y cargo, fecha y hora,
    huella completa); rondas y observaciones; versión que quedó obsoleta; pie «Firmas
    electrónicas con reingreso de clave (Ley 527 de 1999)», número de página y la fecha de
    `publicadoEn`. El texto largo se parte en líneas y continúa en otra página; un carácter
    que la fuente no codifica se cambia por `?`.
- Produces (`src/db/consultas/actas.ts`):
  - `export async function reunirDatosActa(tramiteId: number, opciones?: { sql?: Cliente }): Promise<DatosActa | null>`
    (`null` si el trámite no está `publicado` ni `eliminado`; las firmas son las de la última
    ronda).
  - `export async function asegurarActa(tramiteId: number, opciones?: { sql?: Cliente; generar?: (d: DatosActa) => Promise<Uint8Array> }): Promise<{ archivoId: number; ruta: string } | null>`
    (`generar` es `generarActa` por defecto; los tests lo sustituyen)
    — si la versión ya tiene su archivo de acta, lo devuelve; si no, genera el PDF, lo
    escribe en `actas/<número de solicitud>.pdf` del almacén y registra la fila de `archivos`
    con el rol `acta_aprobacion` o `acta_eliminacion`, su tamaño y su huella. Si otra petición
    la creó entre tanto (choque del índice único), devuelve la que quedó. No usa
    `registrarArchivo`, cuya traducción de errores es la del archivo principal.
- Produces (`src/lib/alcance.ts`):
  `export async function puedeVerVersion(versionId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>`
  — la tabla del spec §12 para versiones `vigente`, `obsoleto` y `anulado`.
- Produces (ruta `GET /tramites/[id]/acta`): sesión (401); el trámite debe estar `publicado` o
  `eliminado` y la persona debe pasar `puedeVerVersion` de su versión (si no, 404); llama a
  `asegurarActa` y sirve el PDF con `respuestaArchivo`, sin marca de agua.
- Produces (acciones): `publicarTramiteAccion` y `aprobarYPublicarAccion` llaman a
  `asegurarActa(id)` **después** de que `transicionar` termine, dentro de un `try/catch` que
  solo registra el error: un fallo del acta no deshace la publicación.
- Produces (pantallas): el enlace «Acta de aprobación» (o «Acta de eliminación») aparece en la
  página del trámite cerrado, en los datos de control de la ficha del portal cuando la versión
  vigente se aprobó en la plataforma (si no, la ficha muestra la nota «Aprobación registrada
  fuera de la plataforma»), y por versión en el detalle del panel. Las actas no
  salen en ninguna lista de archivos del documento ni por las rutas de archivos del portal y
  del panel.

- [ ] **Step 1: Test que falla** (`tests/acta.test.ts`)

```ts
const datos: DatosActa = { clase: "aprobacion", entidad: "ESE Hospital Nuestra Señora de Fátima de Suaza",
  documento: { codigo: "GTH-PR-02", titulo: "Procedimiento de Inducción y Reinducción", tipo: "Procedimiento", proceso: "Gestión del Talento Humano" },
  version: 3, solicitud: { numero: "SOL-2026-014", tipo: "Modificar", motivo: "Mejora del proceso", justificacion: "Se añade la inducción específica por servicio.", solicitante: "Diana Patricia Losada", fecha: new Date("2026-11-03T14:12:00Z") },
  vistoBueno: "Dado: quien pide es líder del proceso", aceptacion: { quien: "María Fernanda Perdomo", fecha: new Date("2026-11-04T13:30:00Z"), duplicidad: null },
  controlCambios: "Se añade la inducción específica por servicio y se actualiza el formato de evaluación.",
  firmas: [
    { firma: "Elaboró", nombre: "Diana Patricia Losada", cargo: "Coordinadora de Talento Humano", fecha: new Date("2026-11-12T16:40:00Z"), huella: "9f2c".repeat(16) },
    { firma: "Revisó", nombre: "María Fernanda Perdomo", cargo: "Líder de Calidad", fecha: new Date("2026-11-13T14:05:00Z"), huella: "9f2c".repeat(16) },
    { firma: "Aprobó", nombre: "Íñigo Nuñez Peñaloza", cargo: null, fecha: new Date("2026-11-13T14:06:00Z"), huella: "9f2c".repeat(16) },
    { firma: "Publicó", nombre: "María Fernanda Perdomo", cargo: "Líder de Calidad", fecha: new Date("2026-11-13T14:06:00Z"), huella: "9f2c".repeat(16) },
  ], rondas: 2, observaciones: { total: 2, cerradas: 2 }, versionObsoleta: 2, publicadoEn: new Date("2026-11-13T14:06:00Z"), zona: "America/Bogota" };

it("el acta trae documento, versión, firmantes con tildes y eñes, y huellas", async () => {
  const pdf = await generarActa(datos);
  for (const texto of ["Acta de aprobación documental", "GTH-PR-02", "SOL-2026-014", "Íñigo Nuñez Peñaloza", "Coordinadora de Talento Humano", "13/11/2026 09:06", "Ley 527 de 1999"]) {
    expect(await contieneTexto(pdf, texto)).toBe(true);
  }
  expect(await contieneTexto(pdf, "9f2c".repeat(16))).toBe(true);
});
it("un texto muy largo o con un carácter fuera de la fuente no rompe el acta", async () => {
  const pdf = await generarActa({ ...datos, controlCambios: "Cambio ✓ ".repeat(600), clase: "eliminacion" });
  expect(await contieneTexto(pdf, "Acta de eliminación documental")).toBe(true);
});

it("el acta se genera una sola vez y, si falla al publicar, se genera a pedido", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "publicacion");
  const rutas: string[] = [];
  try {
    await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx));
    const falla = async () => { throw new Error("fallo simulado"); };
    await expect(tx.savepoint(() => asegurarActa(t.tramiteId, { sql: tx, generar: falla }))).rejects.toThrow("fallo simulado");
    const [fila] = await tx`SELECT etapa FROM tramites WHERE id = ${t.tramiteId}`;
    expect(fila.etapa).toBe("publicado");                              // la publicación queda en pie
    const a = await asegurarActa(t.tramiteId, { sql: tx });
    const b = await asegurarActa(t.tramiteId, { sql: tx });
    rutas.push(a!.ruta);
    expect(b!.archivoId).toBe(a!.archivoId);
    const [archivo] = await tx`SELECT rol, mime FROM archivos WHERE id = ${a!.archivoId}`;
    expect(archivo).toMatchObject({ rol: "acta_aprobacion", mime: "application/pdf" });
  } finally {
    for (const r of rutas) await rm(resolverRutaAlmacen(r)!, { force: true });
    await t.limpiar();
  }
}));
```

Añadir: `reunirDatosActa` de un trámite abierto devuelve `null`; la ficha de `obtenerFichaDocumento`
no lista el acta entre los archivos; `puedeVerVersion` niega una versión obsoleta a `consulta`
y la concede a `control.interno`.

- [ ] **Step 2:** Run: `npx vitest run tests/acta.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar** `acta.ts`, `actas.ts`, `puedeVerVersion`, la ruta, la llamada tras
  publicar y los enlaces.

- [ ] **Step 4:** Run: `npm run lint && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): acta en PDF por cada versión publicada y por cada eliminación"
```

**→ Punto de control 2** (controlador, `next start` sobre el build de producción): recorrer un
trámite completo con los usuarios demo (pedir, aceptar, subir el borrador, enviar con clave,
devolver con dos observaciones, responder, concepto favorable, aprobar y publicar), abrir el
acta, comprobar la versión anterior obsoleta en el panel, una clave errada al firmar, el
segundo factor en la firma con una cuenta que lo tenga, y todo a 390 px y en oscuro.

---

### Tarea 12: Cancelar, reasignar, «Mis tareas» y vencimientos

**Files:**
- Create: `src/db/consultas/flujo/gestion.ts`, `src/db/consultas/vencimientos.ts`,
  `src/lib/vencimientos-disparo.ts`, `src/componentes/tramites/AccionesGestion.tsx`,
  `tests/tramites-gestion.test.ts`, `tests/vencimientos.test.ts`
- Modify: `src/lib/tareas.ts`, `src/db/consultas/tramites-flujo.ts`,
  `src/db/consultas/tramites.ts` (marca de responsable inactivo), `src/lib/esquemas/tramites.ts`,
  `src/app/acciones-tramites.ts`, `src/componentes/cascaron/Cascaron.tsx`,
  `src/componentes/tramites/TablaTramites.tsx`, `src/componentes/tramites/EncabezadoTramite.tsx`,
  `src/app/(app)/tramites/[id]/page.tsx`, `tests/tareas.test.ts`

**Interfaces:**
- Consumes: Tareas 6 a 10; `validarDesignacion`; `supervisoresDe`
  (`src/db/consultas/estructura.ts:214`); `estadoPlazo`.
- Produces (`src/db/consultas/flujo/gestion.ts`):
  - `cancelar`: dato `motivo`. En crear y modificar con versión en trámite, esa versión pasa a
    `descartado` (sus archivos se conservan). Avisa `tramite.cerrado` a los participantes.
  - `reasignar`: datos `{ papel: "elaborador" | "revisor" | "aprobador"; usuarioId?: number; venceEn?: string; motivo: string }`
    (al menos uno entre `usuarioId` y `venceEn`). Solo se reasigna un papel cuyo paso está
    pendiente: `elaborador` en `elaboracion`; `revisor` en `elaboracion` o `revision`;
    `aprobador` en cualquier etapa de trabajo hasta `aprobacion`. Aplica `validarDesignacion`
    con el conjunto resultante. Detalle `{ papel, de, a, venceEn, motivo }`. Avisa
    `tramite.reasignado` a quien entra y a quien sale.
- Produces (`src/db/consultas/flujo/gestion.ts`, escritura que no es una transición):
  `export async function corregirDatosDeControl(tramiteId: number, sesion: SesionFlujo, datos: { titulo?: string; codigo?: string; tipoDocumentoId?: number }, opciones?: { sql?: Cliente }): Promise<void>`
  — exige `tramites.gestionar` y que el trámite esté en `elaboracion` o `revision` (spec
  §8.6). En una **creación** cambia el título, el código (validado y único) o el tipo del
  documento, que todavía no ve nadie. En una **modificación** solo admite `titulo`, y lo
  guarda en `titulo_propuesto`; el documento vigente no cambia hasta publicar. Deja un evento
  `corregir_datos` con el antes y el después, y su fila de `auditoria`.
- Produces (`src/lib/tareas.ts`): `misTareas(sesion)` deja de devolver `[]`. Sale de
  `listarTramites(sesion, "por_hacer")`, con `modulo: "documentos"`, `enlace: "/tramites/<id>"`,
  `vence` y estos títulos: «Dar el visto bueno a SOL-…», «Aceptar SOL-…», «Elaborar
  \<código\> v\<n\>», «Ajustar \<código\> v\<n\>» (ronda mayor que 1), «Revisar \<código\>
  v\<n\>», «Aprobar \<código\> v\<n\>», «Aprobar la eliminación de \<código\>», «Publicar
  \<código\> v\<n\>», «Eliminar \<código\>». El `detalle` es el título del documento. La
  firma pasa a `misTareas(sesion: SesionFlujo)`.
- Produces (`src/db/consultas/vencimientos.ts`):
  - `export async function responsablesDe(tramite: FilaTramite, opciones?: { sql?: Cliente }): Promise<number[]>`
    — por etapa: líderes del proceso; todos los `admin_sgc` activos (aceptación y
    publicación); el elaborador; el revisor; el aprobador.
  - `export async function revisarVencimientos(opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ avisados: number; escalados: number }>`
    — por cada trámite abierto con `vence_en` anterior a `ahora` y `aviso_vencido_en` nulo:
    avisa `tramite.vencido` a sus responsables, con enlace, y marca `aviso_vencido_en`. Por
    cada uno con más de `escalamientoDias` días de vencido y `escalado_en` nulo: avisa
    `tramite.escalado` a los jefes de cada responsable (`supervisoresDe`), sin repetir, y
    marca `escalado_en`. El aviso de escalamiento dice el paso, el número de solicitud, el
    nombre del responsable y los días de vencido; **no lleva el título del documento ni
    enlace**.
- Produces (`src/lib/vencimientos-disparo.ts`):
  `export function dispararRevisionDeVencimientos(ahoraMs = Date.now()): void` — guarda en una
  variable del módulo la última vez; si pasaron menos de diez minutos, no hace nada; si no,
  llama a `revisarVencimientos()` sin esperar y registra cualquier error con `console.error`.
  `Cascaron` la llama en cada render. Es estado en memoria de la única instancia (piso 9).
- Produces (acciones): `cancelarTramiteAccion`, `reasignarTramiteAccion` y
  `corregirDatosTramiteAccion` (`tramites.gestionar`).
- Produces (interfaz): `AccionesGestion` en la página de un trámite abierto, para quien tiene
  `tramites.gestionar`: «Cancelar el trámite» (pide el motivo en un `Dialogo`), «Reasignar»
  (papel, persona y fecha límite) y, en `elaboracion` o `revision`, «Corregir datos del
  documento» (título; en una creación, también código y tipo). La bandeja y el encabezado añaden «(inactivo)» junto al
  nombre de un responsable desactivado.

- [ ] **Step 1: Tests que fallan**

`tests/tramites-gestion.test.ts` (BD, `revertida`):

```ts
it("cancelar descarta la versión y libera su número", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "elaboracion");
  const [v] = await tx`SELECT numero FROM documento_versiones WHERE id = ${t.versionId}`;
  await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "cancelar", etapaEsperada: "elaboracion", rondaEsperada: 1, datos: { motivo: "Se pidió por error." } }, opc(tx));
  const [vieja] = await tx`SELECT estado FROM documento_versiones WHERE id = ${t.versionId}`;
  expect(vieja.estado).toBe("descartado");
  const otro = await tramiteEn(tx, "elaboracion");                     // mismo documento: ya no hay trámite abierto
  const [nueva] = await tx`SELECT numero FROM documento_versiones WHERE id = ${otro.versionId}`;
  expect(nueva.numero).toBe(v.numero);                                 // la versión publicada seguirá siendo consecutiva
}));

it("un responsable desactivado no deja el trámite sin salida", () => revertida(sql, async (tx) => {
  const elaborador = await usuarioDePrueba(tx, { rol: "consulta" });
  const t = await tramiteEn(tx, "elaboracion", { elaborador });
  await tx`UPDATE usuarios SET activo = false WHERE id = ${elaborador.usuarioId}`;
  const enCurso = await listarTramites(t.admin, "en_curso", { sql: tx });
  expect(enCurso.some((x) => x.id === t.tramiteId)).toBe(true);
  const reasignar = (usuarioId: number) => transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "elaboracion", rondaEsperada: 1,
    datos: { papel: "elaborador", usuarioId, motivo: "Se retiró de la entidad." } }, opc(tx));
  await expect(tx.savepoint(() => reasignar(t.revisor.usuarioId))).rejects.toThrow("Quien elabora no puede revisar");
  const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
  expect(await reasignar(nuevo.usuarioId)).toEqual({ etapa: "elaboracion", ronda: 1 });
  const [fila] = await tx`SELECT elaborador_id FROM tramites WHERE id = ${t.tramiteId}`;
  expect(fila.elaborador_id).toBe(nuevo.usuarioId);
  const [aviso] = await tx`SELECT tipo FROM notificaciones WHERE usuario_id = ${nuevo.usuarioId} ORDER BY id DESC LIMIT 1`;
  expect(aviso.tipo).toBe("tramite.reasignado");
}));
```

Añadir a `tests/tramites-gestion.test.ts`: en una modificación, `corregirDatosDeControl`
con un título nuevo cambia `tramites.titulo_propuesto` y deja intacto `documentos.titulo`; con
`codigo` lanza `ErrorTramite`; y con el trámite en `aprobacion` lanza `ErrorTramite`.

`tests/tareas.test.ts` (BD, `revertida`; reemplaza el caso que hoy espera `[]`): con un
trámite en `revision`, `misTareas` del revisor trae una tarea «Revisar GTH-PR-02 v3» con su
enlace y su vencimiento, y la del elaborador y la de `consulta` no la traen; con el trámite en
`publicacion`, la traen todos los `admin_sgc`.

`tests/vencimientos.test.ts` (BD, `revertida`):

```ts
it("avisa una vez al responsable y, pasados los días, una vez a su jefe, sin título ni enlace", () => revertida(sql, async (tx) => {
  const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
  const elaborador = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
  const t = await tramiteEn(tx, "elaboracion", { elaborador });                // vence el 20/11 (15 días)
  // La función recorre todos los trámites abiertos: se silencian los demás (la demo trae vencidos desde la Tarea 15).
  await tx`UPDATE tramites SET aviso_vencido_en = now(), escalado_en = now() WHERE id <> ${t.tramiteId}`;
  const correr = (ahora: string) => revisarVencimientos({ sql: tx, ahora: new Date(ahora) });
  expect(await correr("2026-11-20T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });   // todavía a tiempo
  expect(await correr("2026-11-21T15:00:00Z")).toEqual({ avisados: 1, escalados: 0 });
  expect(await correr("2026-11-21T16:00:00Z")).toEqual({ avisados: 0, escalados: 0 });   // no se repite
  expect(await correr("2026-11-24T15:00:00Z")).toEqual({ avisados: 0, escalados: 1 });   // más de 3 días de vencido
  expect(await correr("2026-11-25T15:00:00Z")).toEqual({ avisados: 0, escalados: 0 });
  const [delJefe] = await tx`SELECT tipo, titulo, cuerpo, enlace FROM notificaciones WHERE usuario_id = ${jefe.usuarioId}`;
  expect(delJefe).toMatchObject({ tipo: "tramite.escalado", enlace: null });
  expect(`${delJefe.titulo} ${delJefe.cuerpo ?? ""}`).not.toMatch(/Inducci[oó]n/);       // sin el título del documento
  const [delElaborador] = await tx`SELECT tipo, enlace FROM notificaciones WHERE usuario_id = ${elaborador.usuarioId} AND tipo = 'tramite.vencido'`;
  expect(delElaborador.enlace).toBe(`/tramites/${t.tramiteId}`);
}));
it("una reasignación, como cualquier transición, limpia las marcas de aviso", () => revertida(sql, async (tx) => {
  const t = await tramiteEn(tx, "elaboracion");
  await revisarVencimientos({ sql: tx, ahora: new Date("2026-12-30T15:00:00Z") });
  const [antes] = await tx`SELECT aviso_vencido_en FROM tramites WHERE id = ${t.tramiteId}`;
  expect(antes.aviso_vencido_en).not.toBeNull();
  await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "reasignar", etapaEsperada: "elaboracion", rondaEsperada: 1,
    datos: { papel: "elaborador", venceEn: "2027-01-15", motivo: "Se amplía el plazo." } }, opc(tx));
  const [despues] = await tx`SELECT aviso_vencido_en, escalado_en FROM tramites WHERE id = ${t.tramiteId}`;
  expect([despues.aviso_vencido_en, despues.escalado_en]).toEqual([null, null]);
}));
```

Un test sin BD para `dispararRevisionDeVencimientos`: con `revisarVencimientos` simulada, dos
llamadas con menos de diez minutos entre ellas la invocan una vez; con más, dos; y un error de
la función no se propaga.

- [ ] **Step 2:** Run: `npx vitest run tests/tramites-gestion.test.ts tests/vencimientos.test.ts tests/tareas.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Implementar** los manejadores, `misTareas`, `vencimientos.ts`, el disparo y su
  llamada en `Cascaron`, las acciones y `AccionesGestion`.

- [ ] **Step 4:** Run: `npm run lint && npm test` — Expected: PASS (incluido
  `tests/inicio.test.tsx`, que pinta «Mis tareas»).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): cancelar y reasignar trámites; Mis tareas con los pasos pendientes; avisos de vencimiento y escalamiento al jefe"
```

---

### Tarea 13: Camino directo y datos del documento

**Files:**
- Create: `src/lib/esquemas/documentos.ts`, `tests/camino-directo.test.ts`
- Modify: `src/db/consultas/admin.ts`, `src/app/admin/acciones.ts`,
  `src/componentes/admin/FormularioDocumento.tsx`,
  `src/app/(app)/admin/(panel)/documentos/nuevo/page.tsx`,
  `src/app/(app)/admin/(panel)/documentos/[codigo]/page.tsx`,
  `src/app/(app)/admin/(panel)/documentos/[codigo]/editar/page.tsx`,
  `src/db/consultas/maestro.ts`, `src/lib/maestro-excel.ts`,
  `src/app/(app)/admin/(panel)/maestro/page.tsx`, `src/lib/bitacora-detalle.ts`,
  `tests/publicar.test.ts`, `tests/maestro.test.ts`, `tests/maestro-excel.test.ts`

**Interfaces:**
- Consumes: `obtenerConfigDocumental` (Tarea 6), `aplicarPublicacion` (Tarea 10),
  `crearDocumentoEn`, `crearVersionBorradorEn` (Tarea 7), `origen_aprobacion`, `descartado`,
  `nivel_acceso` (Tarea 1).
- Produces (`src/db/consultas/admin.ts`, spec §13 y §8.6). Todas las funciones del camino
  directo lanzan `Error("La carga de documentos ya aprobados está cerrada: use un trámite")`
  si `publicacionDirecta` es `false`:
  - `crearDocumento(datos: DatosDocumento & { numeroInicial?: number; nivelAcceso?: "general" | "restringido"; relacionados?: number[] }, usuarioId)`
    — `numeroInicial` (1 por defecto, entero de 1 a 999) es el número de la versión con la
    que entra.
  - `crearVersionBorrador(documentoId, usuarioId, numero?: number)` — solo si el documento
    **no tiene versión vigente** ni trámite abierto (sirve para registrar de nuevo tras
    deshacer una carga); con una vigente lanza
    `Error("Este documento ya tiene una versión vigente: el cambio se pide por trámite")`.
  - `publicarVersion(versionId, usuarioId)` — además de sus comprobaciones de hoy, falla con
    el mismo mensaje si el documento ya tiene una vigente, y con
    `Error("Este documento tiene un trámite abierto")` si lo tiene. Publica con
    `aplicarPublicacion(tx, versionId, "fuera", usuarioId)`.
  - `export async function deshacerCarga(documentoId: number, motivo: string, usuarioId: number): Promise<void>`
    — la versión vigente debe tener `origen_aprobacion = 'fuera'` (si no,
    `Error("Solo se deshace una carga registrada fuera de la plataforma")`) y el documento no
    debe tener trámite abierto; la versión pasa a `descartado`. Auditoría `deshacer_carga` con
    el motivo y el número de versión.
  - `export async function descartarBorrador(versionId: number, usuarioId: number): Promise<void>`
    — solo un `borrador` que no pertenece a un trámite abierto; pasa a `descartado`.
    Auditoría `descartar_borrador`.
  - `anularVigente` deja de exportarse para el panel (queda `anularVigenteEn`, que usa el
    trámite).
  - `editarMetadatos` se reemplaza por dos funciones:
    - `export async function editarCatalogo(documentoId: number, datos: { descripcion: string | null; palabrasClave: string | null; asociaciones: AsociacionEntrada[]; relacionados: number[]; nivelAcceso: "general" | "restringido" }, usuarioId: number): Promise<void>`
      — siempre permitido con `documentos.administrar`. Si el documento ya tiene alguna
      versión publicada, la asociación principal no puede cambiar
      (`Error("El proceso propietario no cambia: es parte del código")`). Reemplaza las
      relaciones del documento (`documento_relaciones`). Auditoría `editar_documento` con el
      antes y el después de lo que cambió.
    - `export async function editarControl(documentoId: number, datos: { codigo: string; titulo: string; tipoId: number }, usuarioId: number): Promise<void>`
      — el código y el tipo solo cambian si el documento no tiene ninguna versión publicada
      (`vigente`, `obsoleto` o `anulado`). El título cambia en ese mismo caso, o si la carga
      está abierta y la versión vigente es `fuera`. En cualquier otro caso,
      `Error("El título de un documento vigente se cambia con un trámite")`. Un documento con
      trámite abierto no admite `editarControl`: sus datos de control se corrigen desde el
      trámite (`corregirDatosDeControl`, Tarea 12).
- Produces (`src/app/admin/acciones.ts`): las acciones heredadas pasan de leer a mano a
  esquemas `zod` `.strict()` de `src/lib/esquemas/documentos.ts`. Desaparece `anularAccion`.
  Acciones nuevas, todas con `documentos.administrar`: `deshacerCargaAccion`,
  `descartarBorradorAccion`, `editarCatalogoAccion` y `editarControlAccion` (reemplazan a
  `editarDocumentoAccion`).
- Produces (pantallas, spec §13 y §15.5):
  - Alta («Registrar documento ya aprobado»): añade «Versión con la que entra», «Nivel de
    acceso» y «Documentos relacionados». Con la carga cerrada, la página muestra un
    `EstadoVacio` que explica que los documentos nuevos se piden por trámite y enlaza a
    `/tramites/nueva`.
  - Edición: dos formularios separados, «Datos de control» y «Datos de catálogo». El de
    control aparece deshabilitado, con la razón escrita, cuando §8.6 no permite editarlo.
    «Documentos relacionados» es una lista filtrable de documentos (código y título) con
    casillas.
  - Detalle: cada versión dice «Aprobada en la plataforma» o «Aprobación registrada fuera de
    la plataforma». Botones según el caso: «Deshacer carga» (pide el motivo), «Descartar
    borrador». Desaparecen «Anular documento» y, con una versión vigente, «Nueva versión
    (borrador)»; en su lugar, el enlace «Solicitar cambio».
- Produces (Listado Maestro): `FilaMaestro` gana `origenAprobacion: "plataforma" | "fuera" | null`.
  La página y el Excel añaden la columna **«Aprobación»** después de «Aprobó», con «En la
  plataforma» o «Fuera de la plataforma»; el Excel queda con trece columnas y la celda pasa
  por `neutralizarFormula`.

- [ ] **Step 1: Test que falla** (`tests/camino-directo.test.ts`, BD)

Estas funciones abren sus propias transacciones, como hoy: el test usa documentos con código
`ZZ-CD-<n>` y los limpia al final como `tests/publicar.test.ts` (aquí no hay firmas ni
historial). El actor es un `admin_sgc` creado con `asegurarAdmin`. Cada caso que cambia
`publicacion_directa` la restaura en `finally`.

```ts
it("registra un documento ya aprobado con su número real de versión", async () => {
  const { documentoId, versionId } = await crearDocumento({ ...base("ZZ-CD-01"), numeroInicial: 4 }, actorId);
  await prepararBorrador(versionId);                                  // archivo principal, aprobó y fecha
  await publicarVersion(versionId, actorId);
  const [v] = await sql`SELECT numero, estado, origen_aprobacion, publicado_en FROM documento_versiones WHERE id = ${versionId}`;
  expect(v).toMatchObject({ numero: 4, estado: "vigente", origen_aprobacion: "fuera" });
  expect(v.publicado_en).not.toBeNull();
  await expect(crearVersionBorrador(documentoId, actorId)).rejects.toThrow(/se pide por trámite/);
});

it("deshacer una carga conserva el código y libera el número", async () => {
  const { documentoId, versionId } = await crearDocumento({ ...base("ZZ-CD-02"), numeroInicial: 3 }, actorId);
  await prepararBorrador(versionId); await publicarVersion(versionId, actorId);
  await deshacerCarga(documentoId, "Se subió el archivo equivocado.", actorId);
  const [vieja] = await sql`SELECT estado FROM documento_versiones WHERE id = ${versionId}`;
  expect(vieja.estado).toBe("descartado");
  const nueva = await crearVersionBorrador(documentoId, actorId, 3);  // mismo número, mismo código
  await prepararBorrador(nueva.versionId); await publicarVersion(nueva.versionId, actorId);
  const [d] = await sql`SELECT d.codigo, v.numero FROM documentos d JOIN documento_versiones v ON v.documento_id = d.id AND v.estado = 'vigente' WHERE d.id = ${documentoId}`;
  expect(d).toMatchObject({ codigo: "ZZ-CD-02", numero: 3 });
});

it("un borrador heredado sobre un documento vigente no se publica: se descarta", async () => {
  const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-03"), actorId);
  await prepararBorrador(versionId); await publicarVersion(versionId, actorId);
  const [heredado] = await sql`INSERT INTO documento_versiones (documento_id, numero, estado, aprobo, fecha_aprobacion)
    VALUES (${documentoId}, 2, 'borrador', 'Gerente', '2026-01-01') RETURNING id`;   // como lo dejaría una base de sgc-suaza
  await prepararBorrador(heredado.id);
  await expect(publicarVersion(heredado.id, actorId)).rejects.toThrow(/se pide por trámite/);
  await descartarBorrador(heredado.id, actorId);
  const [v] = await sql`SELECT estado FROM documento_versiones WHERE id = ${heredado.id}`;
  expect(v.estado).toBe("descartado");
});

it("con la carga cerrada el camino directo no hace nada", async () => {
  await sql`INSERT INTO configuracion (clave, valor) VALUES ('publicacion_directa', '0') ON CONFLICT (clave) DO UPDATE SET valor = '0'`;
  try {
    await expect(crearDocumento(base("ZZ-CD-04"), actorId)).rejects.toThrow(/carga .* está cerrada/);
    const [doc] = await sql`SELECT id FROM documentos WHERE codigo = 'ZZ-CD-01'`;
    await expect(deshacerCarga(doc.id, "Motivo de prueba.", actorId)).rejects.toThrow(/carga .* está cerrada/);
  } finally {
    await sql`UPDATE configuracion SET valor = '1' WHERE clave = 'publicacion_directa'`;
  }
});

it("el título es dato de control; la descripción, los relacionados y el nivel de acceso son de catálogo", async () => {
  const { documentoId, versionId } = await crearDocumento(base("ZZ-CD-05"), actorId);
  await prepararBorrador(versionId); await publicarVersion(versionId, actorId);
  await editarControl(documentoId, { codigo: "ZZ-CD-05", titulo: "Título corregido", tipoId: tipoId }, actorId);   // cargado fuera y carga abierta
  await sql`UPDATE documento_versiones SET origen_aprobacion = 'plataforma' WHERE id = ${versionId}`;
  await expect(editarControl(documentoId, { codigo: "ZZ-CD-05", titulo: "Otro título", tipoId }, actorId)).rejects.toThrow(/se cambia con un trámite/);
  const [rel] = await sql`SELECT id FROM documentos WHERE codigo = 'SGC-FO-01'`;
  await editarCatalogo(documentoId, { descripcion: "Descripción nueva", palabrasClave: null, asociaciones: asociacionesDe("ZZ-CD-05"), relacionados: [rel.id], nivelAcceso: "restringido" }, actorId);
  const [d] = await sql`SELECT nivel_acceso, descripcion FROM documentos WHERE id = ${documentoId}`;
  expect(d).toMatchObject({ nivel_acceso: "restringido", descripcion: "Descripción nueva" });
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM documento_relaciones WHERE documento_id = ${documentoId}`;
  expect(n).toBe(1);
  await expect(deshacerCarga(documentoId, "No aplica.", actorId)).rejects.toThrow(/fuera de la plataforma/);
});
```

`base`, `prepararBorrador` y `asociacionesDe` son ayudantes del propio test. En
`tests/maestro.test.ts` y `tests/maestro-excel.test.ts`: la fila trae `origenAprobacion`, la
hoja tiene trece columnas con «Aprobación», y una versión de origen `fuera` dice «Fuera de la
plataforma».

- [ ] **Step 2:** Run: `npx vitest run tests/camino-directo.test.ts tests/maestro.test.ts tests/maestro-excel.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Implementar las consultas** y pasar las acciones a `zod`.
  `tests/publicar.test.ts` se ajusta donde publicaba una segunda versión por el camino directo
  (esos casos ya ejercitan `aplicarPublicacion` desde la Tarea 10).

- [ ] **Step 4: Implementar las pantallas** y la columna del Listado Maestro.

- [ ] **Step 5:** Run: `npm run lint && npm test`, y
  `grep -rn "anularAccion\|editarMetadatos\|editarDocumentoAccion" src` — Expected: PASS y sin
  resultados.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13a): el camino directo solo da de alta lo ya aprobado, con su versión real; deshacer una carga; datos de control y de catálogo; origen de la aprobación en el Listado Maestro"
```

---

### Tarea 14: Configuración documental y tipos de documento

**Files:**
- Create: `src/app/admin/acciones-config-documental.ts`,
  `src/app/(app)/admin/(panel)/configuracion-documental/page.tsx`,
  `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx`,
  `src/componentes/admin/config-documental/ListaItemsVerificacion.tsx`,
  `tests/config-documental.test.ts`
- Modify: `src/db/consultas/config-documental.ts`, `src/db/consultas/mapa-admin.ts`
  (`crearTipo`, `editarTipo`, `listarTipos`, `obtenerTipo`), `src/app/admin/acciones-mapa.ts`
  (`parsearTipo`), `src/componentes/admin/mapa/FormularioTipo.tsx`,
  `src/app/(app)/admin/(panel)/tipos/page.tsx`, `src/componentes/cascaron/navegacion.ts`,
  `src/componentes/cascaron/IconoNav.tsx` (ícono `configuracion`), `src/lib/bitacora-detalle.ts`,
  `tests/mapa-admin.test.ts`, `tests/navegacion.test.ts`

**Interfaces:**
- Consumes: `ConfigDocumental`, `obtenerConfigDocumental` (Tarea 6); `validarFormato`,
  `generarCodigo` (Tarea 2); `listarItemsVerificacion` (Tarea 9); `mutacion`.
- Produces (`src/db/consultas/config-documental.ts`):
  - `export async function guardarConfigDocumental(datos: { formatoCodigo: string; plazos: ConfigDocumental["plazos"]; escalamientoDias: number; publicacionDirecta: boolean }, actorId: number): Promise<void>`
    — valida el formato con `validarFormato` (lanza su mensaje), los plazos (enteros de 0 a
    365) y los días de escalamiento (enteros de 1 a 60); guarda las diez claves en una
    transacción; auditoría `editar_config_documental` con el antes y el después de las claves
    que cambiaron. Apagar o encender la publicación directa queda así en la bitácora.
  - `export async function crearItemVerificacion(datos: { texto: string; critico: boolean }, actorId: number): Promise<number>`,
    `editarItemVerificacion(id, datos, actorId)`, `moverItemVerificacion(id, direccion: "arriba" | "abajo", actorId)`
    y `alternarItemVerificacion(id, activo: boolean, actorId)`. Un ítem nunca se borra.
    Texto de 5 a 300 caracteres. Cada una audita.
- Produces (`src/db/consultas/mapa-admin.ts`): `DatosTipo` gana
  `autoridad: "estrategico" | "operativo"` y `plantillaDocumentoId: number | null`. La
  plantilla debe ser un documento con versión vigente (`Error("La plantilla debe ser un
  documento vigente")`). `listarTipos` y `obtenerTipo` devuelven los dos campos y el código de
  la plantilla.
- Produces (`src/app/admin/acciones-config-documental.ts`): `guardarConfigDocumentalAccion`,
  `crearItemVerificacionAccion`, `editarItemVerificacionAccion`, `moverItemVerificacionAccion`
  y `alternarItemVerificacionAccion`, todas con `mutacion(formData, "tramites.gestionar", …)`
  y esquemas `.strict()`.
- Produces (pantalla, spec §15.4): `/admin/configuracion-documental` con
  `exigirPermiso("tramites.gestionar")` y cuatro secciones:
  1. **Formato del código**, con la ayuda de los marcadores y un ejemplo que se recalcula al
     escribir (`generarCodigo` con proceso `SGC`, tipo `FO` y consecutivo 2).
  2. **Plazos** en días (siete campos) y **días para avisar al jefe**.
  3. **Publicación directa**: casilla «Permitir registrar documentos ya aprobados sin
     trámite», con el texto «Apáguela cuando termine la carga inicial. Desde ese momento todo
     documento nuevo y todo cambio pasan por un trámite.»
  4. **Lista de verificación**: ítems con su texto, la marca «Crítico», subir y bajar, y
     activar o desactivar; formulario para añadir.
- Produces (navegación): entrada
  `{ href: "/admin/configuracion-documental", etiqueta: "Configuración documental", icono: "configuracion", grupo: "documentos", permiso: "tramites.gestionar" }`
  después de «Tipos de documento».
- Produces (tipos): `FormularioTipo` añade «Quién aprueba» (dos opciones: «Gerencia
  (documento estratégico)» y «Administrador del SGC (documento operativo)») y «Plantilla»
  (lista de documentos vigentes, o «Sin plantilla»). La lista de tipos muestra las dos cosas.

- [ ] **Step 1: Test que falla** (`tests/config-documental.test.ts`, BD; restaura lo que
  cambia en `finally`; actor `zz_config_${Date.now()}` con rol `admin_sgc`)

```ts
it("guarda la configuración, valida y audita", async () => {
  const antes = await obtenerConfigDocumental();
  try {
    await guardarConfigDocumental({ ...aGuardar(antes), plazos: { ...antes.plazos, revision: 7 }, publicacionDirecta: false }, actorId);
    const despues = await obtenerConfigDocumental();
    expect(despues.plazos.revision).toBe(7);
    expect(despues.publicacionDirecta).toBe(false);
    const [a] = await sql`SELECT detalle FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'editar_config_documental' ORDER BY id DESC LIMIT 1`;
    expect(Object.keys(a.detalle.cambios).sort()).toEqual(["plazo_revision_dias", "publicacion_directa"]);
    await expect(guardarConfigDocumental({ ...aGuardar(antes), formatoCodigo: "{PROCESO}-{NN}" }, actorId)).rejects.toThrow(/TIPO/);
    await expect(guardarConfigDocumental({ ...aGuardar(antes), escalamientoDias: 0 }, actorId)).rejects.toThrow();
  } finally {
    await guardarConfigDocumental(aGuardar(antes), actorId);
  }
});
it("una clave ausente o inválida cae al valor por defecto", () => revertida(sql, async (tx) => {
  await tx`DELETE FROM configuracion WHERE clave = 'plazo_elaboracion_dias'`;
  await tx`UPDATE configuracion SET valor = 'abc' WHERE clave = 'plazo_revision_dias'`;
  const c = await obtenerConfigDocumental({ sql: tx });
  expect([c.plazos.elaboracion, c.plazos.revision]).toEqual([15, 5]);
}));
it("los ítems se crean, se ordenan y se desactivan, nunca se borran", async () => {
  const id = await crearItemVerificacion({ texto: "Ítem de prueba de la configuración", critico: true }, actorId);
  try {
    await moverItemVerificacion(id, "arriba", actorId);
    await alternarItemVerificacion(id, false, actorId);
    const todos = await listarItemsVerificacion();
    expect(todos.find((i) => i.id === id)).toMatchObject({ activo: false, critico: true });
    expect((await listarItemsVerificacion({ soloActivos: true })).some((i) => i.id === id)).toBe(false);
  } finally {
    await sql`DELETE FROM lista_verificacion_items WHERE id = ${id}`;   // sin respuestas: el test sí puede limpiar
  }
});
```

En `tests/mapa-admin.test.ts`: `editarTipo` guarda `autoridad` y `plantillaDocumentoId`, y
rechaza como plantilla un documento sin versión vigente. En `tests/navegacion.test.ts`: solo
`admin_sgc` ve «Configuración documental».

- [ ] **Step 2:** Run: `npx vitest run tests/config-documental.test.ts tests/mapa-admin.test.ts tests/navegacion.test.ts`
  — Expected: FAIL.

- [ ] **Step 3: Implementar** las consultas, las acciones, la pantalla, la entrada de
  navegación y los campos del tipo.

- [ ] **Step 4:** Run: `npm run lint && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): configuración documental (formato del código, plazos, publicación directa, lista de verificación) y autoridad y plantilla por tipo"
```

---

### Tarea 15: Semilla demo de trámites (segunda resiembra)

**Files:**
- Modify: `src/db/semillas/demo.ts`, `tests/esquema.test.ts` (conteos de la demo),
  `CONTEXT.md` solo si un test lo lee
- Create: `tests/semilla-tramites.test.ts`

**Interfaces:**
- Consumes: todo lo anterior. La semilla escribe con el rol dueño, por inserción directa: no
  llama a `transicionar`, pero deja las filas como las dejaría.
- Produces (demo, spec §18.2):
  - **Segundo Admin SGC de demostración:** usuario `coordinadora.sgc`, nombre «María
    Fernanda Perdomo», cargo «Líder de Calidad», rol `admin_sgc`, con la clave demo. Es quien
    figura como revisora en los documentos de la demo; con ella la demo tiene dos Admin SGC
    aunque no se corra `admin:asegurar`.
  - **Dos plantillas:** `SGC-FO-04` «Plantilla para procedimientos» y `SGC-FO-05` «Plantilla
    para formatos» (tipo Formato, vigentes, con PDF y editable `.docx`), enlazadas desde los
    tipos `PR` y `FO`.
  - **Cinco trámites**, con consecutivos 1 a 5 del año en que se siembra y con sus eventos, sus plazos y, donde aplica, sus
    firmas, su lista y sus observaciones:

    | Número (con el año de la siembra) | Qué pide | Etapa | Detalle |
    |---|---|---|---|
    | SOL-2026-001 | Modificar `GTH-CA-01` | `publicado` | Versión 3 publicada por trámite: elaboró `lider.gth`, revisó `coordinadora.sgc`, aprobó `gerente` (tipo estratégico), publicó `coordinadora.sgc`; la versión 2 queda obsoleta; origen `plataforma` |
    | SOL-2026-002 | Modificar `GTH-PR-02` | `revision`, ronda 2 | Elabora `lider.gth`, revisa y aprueba `coordinadora.sgc`; lista de la ronda 1 respondida; observación 1 cerrada y observación 2 atendida |
    | SOL-2026-003 | Modificar `GBS-PR-01`, pedida por `coordinadora.sgc` | `publicacion` | GBS no tiene líder: visto bueno omitido. Elaboró `consulta`, revisó `lider.gth` y aprobó `coordinadora.sgc` (tipo operativo elaborado por alguien que no es Admin SGC). Tiene las tres firmas y espera «Publicar», con el plazo vencido hace dos días |
    | SOL-2026-004 | Crear un formato en CEX, «Consentimiento informado de procedimientos menores», pedida por `lider.cex` | `aceptacion` | Visto bueno dado; vence hoy |
    | SOL-2026-005 | Eliminar `CEX-GU-01`, pedida por `coordinadora.sgc` | `visto_bueno` | Espera a `lider.cex` |

  - Los archivos de las versiones en trámite se generan con `generarPlaceholder`, y las
    firmas llevan la huella real de ese archivo. El acta de SOL-2026-001 no se siembra: se
    genera sola la primera vez que alguien la pide.
  - Las fechas se calculan desde el momento de sembrar (por ejemplo, «vence hoy» y «venció
    hace dos días»), no son fijas.
  - Totales de la demo después de esta tarea: 30 documentos; 34 versiones (28 vigentes, 2
    obsoletas, 3 en borrador, 1 anulada); 6 usuarios demo.

- [ ] **Step 1: Test que falla** (`tests/semilla-tramites.test.ts`, BD, solo lectura salvo el
  acta)

```ts
it("la demo trae cinco trámites en las etapas previstas", async () => {
  const filas = await sql`SELECT numero, consecutivo, tipo, etapa, ronda FROM tramites ORDER BY id LIMIT 5`;
  expect(filas.map((f) => `${f.consecutivo}:${f.tipo}:${f.etapa}:${f.ronda}`)).toEqual([
    "1:modificar:publicado:1", "2:modificar:revision:2", "3:modificar:publicacion:1", "4:crear:aceptacion:0", "5:eliminar:visto_bueno:0",
  ]);
  expect(filas.every((f) => /^SOL-\d{4}-00[1-5]$/.test(f.numero))).toBe(true);
});
it("el trámite publicado tiene sus cuatro firmas con una sola huella y la versión quedó en la plataforma", async () => {
  const [t] = await sql`SELECT id, version_id FROM tramites WHERE consecutivo = 1 ORDER BY id LIMIT 1`;
  const firmas = await listarFirmas(t.id);
  expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo", "publico"]);
  expect(new Set(firmas.map((f) => f.hashSha256)).size).toBe(1);
  const [v] = await sql`SELECT estado, origen_aprobacion, numero FROM documento_versiones WHERE id = ${t.version_id}`;
  expect(v).toMatchObject({ estado: "vigente", origen_aprobacion: "plataforma", numero: 3 });
  expect(await huellaDeArchivo((await sql`SELECT ruta FROM archivos WHERE version_id = ${t.version_id} AND rol = 'principal'`)[0].ruta)).toBe(firmas[0].hashSha256);
});
it("cada trámite sembrado se puede leer y seguir con las funciones reales", async () => {
  const admin = await sesionDe(sql, "coordinadora.sgc");
  for (const consecutivo of [2, 3, 4, 5]) {
    const [t] = await sql`SELECT id FROM tramites WHERE consecutivo = ${consecutivo} ORDER BY id LIMIT 1`;
    const d = await obtenerTramite(t.id, admin);
    expect(d).not.toBeNull();
    expect(d!.eventos.length).toBeGreaterThan(0);
  }
  const [pub] = await sql`SELECT id FROM tramites WHERE consecutivo = 3 ORDER BY id LIMIT 1`;
  expect((await obtenerTramite(pub.id, admin))!.acciones).toContain("publicar");
  expect((await misTareas(await sesionDe(sql, "lider.cex"))).some((x) => /Dar el visto bueno a SOL-\d{4}-005/.test(x.titulo))).toBe(true);
});
it("los tipos PR y FO tienen plantilla vigente", async () => {
  const filas = await sql`SELECT t.sigla, d.codigo FROM tipos_documento t JOIN documentos d ON d.id = t.plantilla_documento_id ORDER BY t.sigla`;
  expect(filas.map((f) => `${f.sigla}:${f.codigo}`)).toEqual(["FO:SGC-FO-05", "PR:SGC-FO-04"]);
});
```

- [ ] **Step 2:** Run: `npx vitest run tests/semilla-tramites.test.ts` — Expected: FAIL.

- [ ] **Step 3: Sembrar** lo de **Produces** en `demo.ts` y ajustar los tests que cuentan
  documentos, versiones o usuarios de la demo.

- [ ] **Step 4: Resembrar y verificar**

Run: `npm run db:seed && npm run admin:asegurar`
Run: `npm run lint && npm test`, y el build simulado del CI.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): semilla demo con trámites en cada etapa, un documento aprobado en la plataforma, plantillas y un segundo Admin SGC"
```

**→ Punto de control 3** (controlador, `next start` sobre el build de producción): la
demostración de §20 del spec, los trece pasos, en claro y oscuro y a 390 px, con capturas de
la bandeja, la aceptación, la revisión, la firma, el acta, la ficha con «Aprobado en la
plataforma», el Listado Maestro y la configuración documental. Los defectos van en una ola de
arreglos antes de la revisión final de la rama.

---

### Tarea 16: Documentación de cierre

**Files:**
- Create: `docs/manual/usuario/05-documentos-solicitar-elaborar-revisar-aprobar-y-publicar.md`
- Modify: `docs/manual/usuario/01-…md` a `04-…md` (solo donde esta entrega cambió la
  interfaz), `CONTEXT.md`, `PLAN.md` (fila 13A ✅), `AGENTS.md`, `README.md`

- [ ] **Step 1: Manual.** Capítulo 5, con el formato de los capítulos 1 a 4 y las cadenas de
  interfaz **copiadas del código**: pedir un cambio; el visto bueno; aceptar una solicitud
  (parecidos, código y responsables); elaborar y responder observaciones; revisar con la lista
  de verificación; firmar con la clave (y con el segundo factor); aprobar y publicar; el acta;
  eliminar un documento; cancelar y reasignar; vencimientos y avisos; registrar documentos ya
  aprobados, deshacer una carga y cerrar la carga; la configuración documental y los tipos;
  quién ve cada cosa. En los capítulos anteriores, corregir lo que cambió: «Procesos» en el
  formulario de usuarios, «Textos del mapa» sin el patrón del código, y los códigos de ejemplo.

- [ ] **Step 2: `CONTEXT.md`.** Cabecera con la fecha; punto de reanudación hacia la 13B;
  usuarios demo (seis) y totales de la demo; **«Qué probar y cómo (Fase 13A)»** con los trece
  pasos de §20 del spec, los usuarios, las claves y lo que debe verse en cada paso; tabla de
  decisiones (F13A-DC1 a DC28 del spec y las que surjan en la ejecución, cada una con su
  base); deuda técnica (lo diferido). `PLAN.md`: fila 13A con ✅ y la fecha.

- [ ] **Step 3: `AGENTS.md`**, reglas durables que salen de esta entrega:
  - Reglas de negocio 3 y 4: la visibilidad incluye el nivel de acceso y la participación en
    un trámite; toda acción del trámite lleva su permiso de matriz.
  - Toda transición de un trámite entra por `transicionar`; `firmas` y `tramite_eventos` son
    de solo inserción (se suman a `auditoria` y `accesos` en la regla 5 y en la convención de
    tests).
  - La visibilidad de documentos y de trámites se decide en `src/lib/alcance.ts`; la
    participación designada es la única excepción a `alcanceProcesos()`.
  - El camino directo solo da de alta documentos ya aprobados.
  - Estructura: `src/app/(app)/tramites`, `src/app/acciones-tramites.ts`,
    `src/db/consultas/flujo/`, `src/lib/tramites/`.

- [ ] **Step 4: Verificación completa**

Run: `npm run lint && npm test && npm run build`
Run: `docker compose -f docker-compose.dev.yml up -d --build --no-deps app` (nunca `down`, nunca
`-v`, nunca el servicio `bd`), y después `curl -s http://localhost:9081/api/salud` y
`docker compose -f docker-compose.dev.yml logs app --tail 20`.
Expected: `{"estado":"ok"}` y «Migraciones al día» con la 0004 aplicada sobre la base existente.

- [ ] **Step 5: Commit**

```bash
git add docs CONTEXT.md PLAN.md AGENTS.md README.md
git commit -m "docs: cierre de la Fase 13A - flujo documental (manual, CONTEXT.md, PLAN.md, AGENTS.md)"
```
