# Fase 8 — Listado Maestro + estadísticas + bitácora (diseño)

> Portal SGC Documental — ESE Hospital Nuestra Señora de Fátima de Suaza.
> Reglas permanentes en `AGENTS.md`; estado vivo en `CONTEXT.md`; plan en `PLAN.md` §Fase 8.
> Diseño aprobado por el usuario el 2026-07-18.

## Objetivo

Cerrar el bloque de **reportes y observabilidad** del panel admin en una sola fase con
demo integral. Tres subsistemas:

1. **Listado Maestro de Documentos** — el entregable que exige ISO 9001 (7.5) y hoy se
   hace a mano; generado desde la BD, exportable a Excel y PDF.
2. **Dashboard de estadísticas** — más vistos, más descargados, búsquedas sin resultados.
3. **Bitácora** — vista filtrable de la auditoría que responde "¿por qué desapareció
   este formato?".

Todo bajo el guard de admin existente (dos capas: `proxy.ts` optimista +
`requerirSesion`/`validarSesion` real en el layout del panel). Público sin acceso.

## Decisiones tomadas en el brainstorming (2026-07-18)

| # | Decisión | Porqué |
|---|---|---|
| B1 | Las tres partes en **una sola fase**, demo integral | Cierra el bloque de reportes completo; el usuario lo prefirió sobre tramos separados |
| B2 | Listado Maestro: **solo vigentes por defecto**, con filtro opcional en pantalla para incluir anulados/borradores; el export respeta el filtro activo | La vista por defecto es la que exporta el auditor (documentos en circulación); el filtro da inventario completo cuando el admin lo necesita |
| B3 | Export **con encabezado institucional** (nombre del hospital, título, fecha/hora, total) tanto en Excel como en PDF | Presentable para auditoría |
| B4 | Dashboard: **Top-N + mini-gráficos SVG puro** + selector de rango | Vistoso sin librería de gráficos (frugal en el NAS); encaja con el pulido de Fase 9 |
| B5 | Bitácora: **filtros (acción/entidad/fecha/texto) + `detalle` renderizado legible** | Responde directo a "¿por qué desapareció?" sin mostrar JSON crudo |

## Arquitectura

Tres vistas nuevas en `src/app/admin/(panel)/`, cada una con su capa de datos aislada.
Server Components por defecto; filtros server-driven por `searchParams` (mismo patrón que
`/buscar` de la Fase 5). Islas cliente mínimas solo donde hay interacción real.

| Vista | Ruta | Consulta nueva |
|---|---|---|
| Listado Maestro | `/admin/maestro` | `src/db/consultas/maestro.ts` |
| Estadísticas | `/admin/estadisticas` | `src/db/consultas/estadisticas.ts` |
| Bitácora | `/admin/bitacora` | `src/db/consultas/bitacora.ts` |

Se agregan tres entradas al nav del panel en `src/app/admin/(panel)/layout.tsx`:
"Listado Maestro", "Estadísticas", "Bitácora".

**Dependencia nueva:** `exceljs` (runtime, JS puro, sin binarios nativos → ARM64 seguro;
ya previsto en D7). Verificar que el build de imagen ARM64 sigue verde tras añadirla.

## 1. Listado Maestro

### Consulta `src/db/consultas/maestro.ts`

`obtenerListadoMaestro(opciones: { incluir: "vigentes" | "todos" })` devuelve una fila
por documento, **contada una sola vez por su asociación principal** (D6):

- `incluir: "vigentes"` (defecto): solo documentos que tienen una versión en estado
  `vigente`. La fila describe esa versión vigente.
- `incluir: "todos"`: incluye documentos sin versión vigente (solo borrador, o anulados);
  la fila describe la versión más reciente relevante y su estado.

**Columnas de cada fila:**

- Código
- Título
- Tipo (nombre)
- Versión vigente (número entero)
- Estado
- Fecha elaboración
- Fecha revisión
- Fecha aprobación
- Elaboró
- Revisó
- Aprobó
- Proceso propietario (nombre del proceso de la asociación principal; si la principal
  apunta a un subproceso, el nombre del subproceso y su proceso padre)

La asociación principal se obtiene de `documento_proceso WHERE es_principal` (índice único
parcial garantiza exactamente una). El proceso propietario puede colgar de `proceso_id`
directo o de `subproceso_id`; resolver ambos casos.

### Página `/admin/maestro`

Server Component. Lee `?incluir=` de `searchParams` (defecto `vigentes`). Renderiza:

- Bloque de encabezado institucional (nombre del hospital, "Listado Maestro de
  Documentos", fecha/hora de generación, total de documentos). En pantalla se muestra
  discreto; en impresión es el encabezado del reporte.
- Control de filtro (link a `?incluir=todos` / `?incluir=vigentes`) — server-driven.
- Tabla con todas las columnas.
- Botones de export: "Descargar Excel" (link al route handler con el filtro actual) y
  "Imprimir / Guardar PDF" (isla cliente que dispara `window.print()`).

### Export Excel

`src/lib/maestro-excel.ts` — **función pura** `construirExcelMaestro(filas, meta)` que
recibe las filas y los metadatos (nombre del hospital, fecha/hora, total, alcance del
filtro) y devuelve un `Buffer` (o `ArrayBuffer`). Sin acceso a BD ni a `Date.now()` dentro
(la fecha llega como parámetro para que el test sea determinista). Contenido:

- Filas superiores: nombre del hospital, título del listado, fecha/hora de generación,
  alcance ("Documentos vigentes" / "Todos"), total de documentos.
- Fila de encabezados de columna en negrita, con `autoFilter` y anchos ajustados.
- Una fila por documento.

Route handler `src/app/admin/maestro/excel/route.ts` (GET): `requerirSesion` como primera
línea; lee `?incluir=`; llama la consulta y `construirExcelMaestro`; responde con
`Content-Type` de xlsx y `Content-Disposition: attachment` con nombre saneado
(`listado-maestro-YYYYMMDD.xlsx`). Registra en auditoría la emisión
(`accion: "exporto_maestro"`, `entidad: "listado_maestro"`, `entidadId: null`,
`detalle: { formato: "excel", incluir }`).

### Export PDF

Sin route separado: la propia página `/admin/maestro` lleva estilos de impresión
(variantes `print:` de Tailwind). En impresión se ocultan el nav del panel y los
controles; se muestra el encabezado institucional; la tabla ocupa la hoja. El botón
"Imprimir / Guardar PDF" es una isla cliente que llama `window.print()`. Sin
Puppeteer/Chromium (regla del NAS). La emisión PDF, al ser `window.print` del lado
cliente, no pasa por el servidor; no se audita (a diferencia del Excel). Si se quiere
auditar el PDF, se hará como mejora futura, no en esta fase.

## 2. Dashboard de estadísticas

### Consulta `src/db/consultas/estadisticas.ts`

`obtenerEstadisticas(opciones: { rango: "7" | "30" | "90" | "todo" })` con un reloj
inyectable (parámetro `ahora: Date`) para tests deterministas — mismo patrón que
`crearLimitador` de la Fase 5. Devuelve:

- **KPIs del periodo:** total de eventos `vista` y total `descarga` (de
  `eventos_consulta` filtrado por `creado_en` dentro del rango).
- **Top-10 más vistos:** documentos ordenados por conteo de `vista` en el periodo, con
  código y título (join a `documentos`).
- **Top-10 más descargados:** ídem con `descarga`.
- **Búsquedas sin resultados:** términos de `busquedas` con `cantidad_resultados = 0` en
  el periodo, agrupados por término (normalizado) con su conteo de veces, ordenados
  desc, **Top-10**.
- **Serie temporal:** conteo de consultas (`vista` + `descarga`) **por día** dentro del
  rango, para el mini-gráfico. Para `rango: "todo"` se mantiene la granularidad por día
  (el histórico es corto a esta escala: 200 documentos / 20 usuarios).

### Página `/admin/estadisticas`

Server Component. Lee `?rango=` (defecto `30`). Renderiza:

- Selector de rango (links server-driven `?rango=7|30|90|todo`).
- Tarjetas KPI (total vistas, total descargas).
- Mini-gráfico de barras de la serie temporal.
- Tres listas: más vistos, más descargados, búsquedas sin resultados. Las dos primeras
  enlazan a la ficha pública del documento (`/documentos/[codigo]`).

### Componente de gráfico

`src/componentes/admin/estadisticas/GraficoBarras.tsx` — **SVG puro, sin librería**.
Recibe la serie `{ fecha, conteo }[]` y dibuja barras. Accesible: `role="img"` con
`aria-label` que resume el gráfico, y una tabla equivalente visualmente oculta
(`sr-only`) con los valores. Respeta `prefers-reduced-motion` (sin animación de entrada
o mínima). Puede ser Server Component (SVG estático) si no necesita interacción; se
mantiene sin `'use client'` salvo que se agregue tooltip.

## 3. Bitácora

### Consulta `src/db/consultas/bitacora.ts`

`obtenerBitacora(filtros: { accion?, entidad?, desde?, hasta?, texto?, pagina })`
devuelve las filas de `auditoria` (join a `usuarios` para el nombre), más reciente
primero, paginadas (tamaño fijo de **50 filas por página**). Filtros:

- `accion`: valor exacto de la columna `accion`.
- `entidad`: valor exacto de la columna `entidad`.
- `desde`/`hasta`: rango sobre `creado_en`.
- `texto`: coincidencia en `entidad_id` (numérico) o dentro de `detalle` (jsonb, búsqueda
  por texto sobre su representación) — para localizar por código de documento.

También expone las listas de valores distintos de `accion` y `entidad` presentes en la
tabla, para poblar los selectores de filtro sin hardcodear.

### Renderizado legible del detalle

`src/lib/bitacora-detalle.ts` — **función pura** `describirEvento({ accion, entidad,
entidadId, detalle })` que devuelve una frase en español legible ("Publicó la versión 2
de PR-GTH-001", "Desactivó el proceso Vigilancia Epidemiológica", "Emitió el Listado
Maestro (Excel, vigentes)"). Unit-testeable con un caso por cada `accion` conocida.
Fallback genérico y seguro para acciones no mapeadas (nunca rompe, nunca vuelca JSON
crudo al usuario). El contenido del `detalle` se trata como texto, nunca como HTML.

### Página `/admin/bitacora`

Server Component. Lee filtros de `searchParams`. Renderiza:

- Controles de filtro (selectores de acción/entidad poblados desde la consulta, inputs de
  fecha en un form GET, campo de texto).
- Tabla paginada: quién (nombre de usuario, o "sistema" si `usuario_id` es null) · qué
  (frase de `describirEvento`) · cuándo (fecha/hora legible).
- Controles de paginación server-driven (links `?pagina=`).

## Auditoría de esta fase

- La **emisión del Listado Maestro en Excel** se registra en `auditoria`
  (`accion: "exporto_maestro"`). Es un evento de trazabilidad valioso para ISO y barato.
- Las vistas de estadísticas y bitácora son **solo lectura**; no se auditan (leer un
  reporte no es una acción controlada).

## Estrategia de pruebas (TDD)

Tests nuevos, mismo estilo que las fases previas (Vitest; los de BD corren contra la BD
dev sembrada, los puros son autónomos):

- **`maestro` (BD):** cuenta cada documento una sola vez por asociación principal; solo
  vigentes por defecto; `incluir: "todos"` amplía a anulados/borradores; el proceso
  propietario se resuelve tanto desde `proceso_id` como desde `subproceso_id`.
- **`maestro-excel` (puro):** `construirExcelMaestro` produce un workbook con el
  encabezado institucional y una fila por documento con los valores correctos; se verifica
  parseándolo de vuelta con exceljs.
- **`estadisticas` (BD):** orden Top-N correcto por vistas y por descargas; filtrado por
  rango con reloj inyectado; búsquedas sin resultados agrupadas por término con conteo;
  serie temporal por día.
- **`bitacora` (BD):** combinaciones de filtros (acción, entidad, rango, texto) y
  paginación; listas de valores distintos para los selectores.
- **`bitacora-detalle` (puro):** un caso por cada `accion` conocida → frase esperada;
  fallback seguro para acción desconocida; el detalle nunca se interpreta como HTML.
- **`guardia` (extender):** las rutas nuevas (`/admin/maestro`, `/admin/maestro/excel`,
  `/admin/estadisticas`, `/admin/bitacora`) exigen sesión; sin cookie devuelven
  redirección/401 como las demás rutas del panel.

## Fuera de alcance (YAGNI en esta fase)

- Exportar estadísticas o bitácora a Excel/PDF (solo el Listado Maestro se exporta).
- Gráficos interactivos con tooltip/zoom (mini-gráficos estáticos bastan; el pulido es
  Fase 9).
- Auditar la emisión PDF (es `window.print` del lado cliente).
- Purga/retención de la bitácora (es solo-inserción por diseño; la retención es tema de
  Fase 10 / operación).

## Criterios de aceptación (de PLAN.md §Fase 8)

- El Listado Maestro cuenta cada documento una vez (asociación principal), con código,
  título, tipo, versión vigente, fechas, responsables y proceso propietario. ✅ cubierto
  por la consulta `maestro` y su test.
- El Excel abre limpio en el Excel del hospital. ✅ exceljs con encabezado institucional y
  anchos ajustados; test parsea el workbook.
- La bitácora responde "¿por qué desapareció este formato?" con quién/qué/cuándo. ✅ vista
  filtrable + `describirEvento` legible + búsqueda por código.
</content>
</invoke>
