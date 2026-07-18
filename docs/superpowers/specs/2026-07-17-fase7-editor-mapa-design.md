# Fase 7 — Editor del mapa y tablas maestras (diseño)

> Portal SGC ISO 9001:2015 · ESE Hospital Nuestra Señora de Fátima de Suaza.
> Reglas permanentes en `AGENTS.md`; estado vivo en `CONTEXT.md`; plan por fases en
> `PLAN.md` (§Fase 7). Este documento es el diseño validado con el usuario el
> 2026-07-17 antes de escribir el plan de implementación.

## 1. Objetivo y criterios de aceptación (de `PLAN.md`)

El admin agrega / renombra / reordena / desactiva macroprocesos, procesos y
subprocesos; cambia color e ícono; edita entradas/salidas/convenciones y textos
institucionales; y gestiona la tabla maestra de tipos de documento. El mapa ya es
100 % data-driven (Fases 3–4), así que la base está lista.

Criterios de aceptación:

- Crear un proceso nuevo desde el panel y verlo aparecer en el mapa público **sin
  despliegue**.
- **Desactivar ≠ borrar**: un nodo con dependientes (documentos / hijos) no se puede
  eliminar, solo desactivar.
- Todo cambio queda en la bitácora de auditoría (regla ISO 5).

## 2. Decisiones tomadas con el usuario (2026-07-17)

| # | Decisión | Elegido |
|---|---|---|
| 1 | Modelo de edición | **Listas CRUD + previsualización** (páginas tipo tabla como el panel de documentos; sin WYSIWYG). Accesible, poco JS, reusa el patrón existente. |
| 2 | Reordenar | **Botones ↑ / ↓** que disparan una Server Action que intercambia `orden` con el vecino. Accesible por teclado, casi sin JS. |
| 3 | Borrado | **Solo desactivar por defecto; borrar solo si el nodo está vacío** (sin hijos ni asociaciones). Reforzado por las FK `onDelete: "restrict"` ya existentes. |
| 4 | Guardar / preview | **En vivo** (cada cambio queda vivo al instante) **+ vista de previsualización admin** que muestra también los nodos inactivos (gris punteado, etiqueta "inactivo"). Sin sistema de borrador/staging del mapa (YAGNI). |
| 5 | Desactivar con docs vigentes | **Permitir con advertencia clara**: antes de desactivar se muestra la lista de documentos vigentes que dejarán de aparecer en el mapa (siguen vigentes y buscables). El admin confirma; queda en auditoría. |

## 3. Restricciones que hereda esta fase

- Regla ISO 4: **ninguna ruta de escritura sin sesión**. Todas las nuevas acciones y
  handlers empiezan por `requerirSesion()`; el test `guardia` se extiende para
  recorrer las rutas nuevas sin cookie y esperar rechazo.
- Regla ISO 8: el mapa **no se hardcodea** — ya vive en BD; esta fase solo agrega la
  edición. El render sigue 100 % data-driven.
- Accesibilidad no negociable: reordenar por botones reales (no drag&drop), foco
  visible, etiquetas ARIA, el ícono nunca como única señal.
- Server Components por defecto; `'use client'` solo donde haya interactividad
  (selector de color/ícono, XHR no aplica aquí).

## 4. Rutas nuevas (todas bajo el guard del panel `(panel)`)

```
/admin/mapa                          Macroprocesos agrupados por banda (↑↓, activar, editar, +nuevo)
/admin/mapa/macroprocesos/nuevo      Alta de macroproceso
/admin/mapa/macroprocesos/[id]       Editar macroproceso + lista de sus procesos
/admin/mapa/procesos/nuevo?macro=ID  Alta de proceso (padre por query)
/admin/mapa/procesos/[id]            Editar proceso + lista de sus subprocesos
/admin/mapa/subprocesos/nuevo?proc=ID  Alta de subproceso (padre por query)
/admin/mapa/subprocesos/[id]         Editar subproceso
/admin/mapa/perifericos              Entradas · salidas · convenciones (3 listas)
/admin/mapa/textos                   Textos institucionales (claves de configuracion)
/admin/mapa/vista-previa             El mapa REAL con nodos inactivos en gris/punteado
/admin/tipos                         Tabla maestra: tipos de documento
/admin/tipos/nuevo                   Alta de tipo de documento
/admin/tipos/[id]                    Editar tipo de documento
```

- Rutas admin por **id** (no slug) para robustez cuando el slug cambia.
- Nav del panel (`(panel)/layout.tsx`): `Documentos · Mapa · Tipos de documento · Ver
  portal público`.
- Navegación jerárquica con migas (macro → proceso → subproceso), espejo de la pública.

## 5. Interacción por entidad del mapa

Las tres capas (macroproceso / proceso / subproceso) comparten patrón de lista:
filas con nombre + datos clave, **↑ ↓** (deshabilitadas en los extremos), **editar**,
**activar/desactivar**, y **Borrar solo si vacío**. "Nuevo" al pie.

- **Macroproceso**: nombre, letra (A–D), banda (select de las 4: estrategicos /
  misionales / apoyo / evaluacion), color (`type=color` + hex + muestras
  institucionales), ícono, slug. Borrable solo si no tiene procesos (activos o no).
- **Proceso**: nombre, sigla (mayúsculas 2–4, única global), ícono, descripción, slug.
  Borrable solo si no tiene subprocesos **ni** filas en `documento_proceso`. Ayuda:
  cambiar la sigla **no** reescribe códigos ya existentes (son strings inmutables); solo
  afecta referencias futuras.
- **Subproceso**: nombre, slug (único por proceso). Borrable solo si no tiene filas en
  `documento_proceso`.

### Reordenar (botones ↑ / ↓)
Server Action `mover(entidad, id, direccion)`: en una transacción intercambia el
`orden` de la fila con el del hermano inmediato (mismo padre / misma banda) en esa
dirección. Sin vecino (extremo) → no-op y el botón va deshabilitado. El orden abarca
activos e inactivos por igual (la lista admin los muestra todos).

### Activar / desactivar con advertencia de huérfanos
Al desactivar un nodo con documentos vigentes debajo, se expande —con el mismo patrón
`<details>` de publicar/anular— una advertencia con la **lista de códigos vigentes que
dejarán de aparecer en el mapa** (siguen vigentes y buscables). El botón de confirmar
va dentro del `<details>`. La consulta de huérfanos considera descendientes
(subprocesos de un proceso; procesos+subprocesos de un macroproceso). Reactivar no
requiere confirmación.

### Borrar (borrado duro, solo si vacío)
El botón **Borrar** solo se renderiza cuando la consulta de dependencias devuelve 0.
Las FK `onDelete: "restrict"` son la red de seguridad en BD; la UI no ofrece borrar lo
que tiene historia. El borrado se audita antes de ejecutarse (dentro de la transacción).

## 6. Tabla maestra: tipos de documento

`/admin/tipos`: CRUD con nombre (único), sigla (única, mayúsculas 2–4),
`esDiligenciable` (checkbox, pista de UI), ↑↓, activar/desactivar. Borrable solo si
ningún documento lo referencia (`documentos.tipoId` → `onDelete: "restrict"`).

## 7. Textos institucionales (`configuracion`)

`/admin/mapa/textos`: un formulario con las claves **conocidas**: `nombre_entidad`,
`subtitulo_mapa`, `lema`, `titulo_phva`, `texto_phva`, y **`patron_codigo`**. El patrón
se valida: debe compilar como `RegExp` (si no, error de negocio que conserva lo
escrito). No se permiten claves arbitrarias (YAGNI). Guardar hace `UPSERT` por clave.

## 8. Previsualización con inactivos

Todo cambio queda vivo al instante (`revalidatePath("/", "layout")` como en las
acciones existentes). `/admin/mapa/vista-previa` reusa el componente `MapaProcesos`
con un prop nuevo opcional `mostrarInactivos`:

- Nueva consulta `obtenerDatosMapaAdmin()` gemela de `obtenerDatosMapa()` **sin** los
  `WHERE activo`, con una bandera `activo` por nodo.
- Los nodos inactivos se pintan en gris punteado con etiqueta textual "inactivo".
- **El camino público (`obtenerDatosMapa` + render sin el prop) no se toca**: el prop
  es opcional y por defecto se comporta igual que hoy.

## 9. Capa de datos, acciones y reuso

- **Nuevo** `src/db/consultas/mapa-admin.ts`: CRUD de las 6 entidades
  (macroprocesos, procesos, subprocesos, elementos_perifericos, tipos_documento,
  configuracion) + `mover(...)` (swap transaccional) + toggles activar/desactivar +
  consultas de dependencias (para mostrar/ocultar Borrar) y de docs-vigentes-huérfanos
  (para la advertencia). Todo con `sql.begin` + `registrarAuditoria(tx, …)`.
- **Nuevo** `src/app/admin/acciones-mapa.ts`: las Server Actions, cada una envuelta en
  `mutacion(...)` (requerirSesion primero, errores de negocio que conservan lo escrito,
  `revalidatePath`, `redirect` fuera del try).
- **Nueva consulta admin del mapa** `obtenerDatosMapaAdmin()` en `src/db/consultas/mapa.ts`
  (junto a `obtenerDatosMapa`, para compartir tipos) para la vista previa.
- **Mejora puntual justificada por reuso**: extraer `mutacion`, `texto`, `textoONulo`,
  `idNumerico`, `valoresDeFormulario` de `acciones.ts` (hoy privados de ese archivo) a
  un `src/app/admin/comun.ts` compartido, sin cambiar su comportamiento. `acciones.ts`
  los reimporta. Es la única refactorización; no se toca nada más.

### Validaciones (server-side, con errores que conservan lo escrito)
- Color: `^#[0-9A-Fa-f]{6}$`.
- Sigla (proceso y tipo_documento): `^[A-Z]{2,4}$`, única.
- Slug: auto-generado del nombre (unaccent + kebab-case) en el alta; **estable al
  renombrar**; editable en "opciones avanzadas" con aviso de que rompe enlaces; formato
  `^[a-z0-9]+(-[a-z0-9]+)*$` y unicidad según la tabla (macro/proceso globales;
  subproceso por proceso).
- Ícono: validado contra el registro de `src/componentes/iconos.tsx` (se expone la lista
  de nombres registrados; un nombre no registrado se rechaza para mantener los datos
  limpios, aunque el render ya tiene fallback).
- Banda: una de las 4 permitidas (el CHECK de BD ya lo refuerza).

## 10. Auditoría (regla ISO 5)

Cada mutación inserta en `auditoria` dentro de la misma transacción, con:
- `accion`: `crear_*`, `editar_*`, `reordenar_*`, `activar_*`, `desactivar_*`,
  `borrar_*` (para macroproceso / proceso / subproceso / periferico / tipo_documento) y
  `editar_configuracion`.
- `entidad`: nombre de la tabla; `entidadId`: id de la fila.
- `detalle` (jsonb): campos cambiados / antes-después relevantes.

## 11. Tests (TDD, contra BD dev sembrada — patrón D19)

- **`mapa-admin`**: crear/editar cada entidad; swap de orden correcto y no-op en los
  extremos; desactivar/activar; borrado bloqueado con dependientes y permitido sin
  ellos; conteo de docs-vigentes-huérfanos correcto (incluyendo descendientes);
  unicidad de slug y sigla; `patron_codigo` inválido rechazado; UPSERT de configuracion.
- **`guardia`** (extender el existente): las nuevas rutas/acciones de escritura sin
  sesión → rechazadas.
- Autónomos donde sea posible (validaciones puras de slug/sigla/color/patrón podrían ir
  en un test sin BD si se extrae la validación a funciones puras).

## 12. Orden de construcción (una tarea = un commit en `main`)

1. `src/app/admin/comun.ts` — extracción de helpers compartidos (sin cambio de conducta).
2. **Tipos de documento** — el CRUD más simple; valida el patrón completo (lista, alta,
   edición, ↑↓, activar/desactivar, borrar-si-vacío, auditoría, guard, tests).
3. **Textos institucionales** — formulario de claves conocidas + `patron_codigo`.
4. **Periféricos** — entradas/salidas/convenciones (3 listas, mismo patrón).
5. **Macroprocesos** — con color/ícono/banda/slug, ↑↓, toggle, borrar-si-vacío.
6. **Procesos** — con sigla/ícono/descripción; **aquí se cumple el criterio de
   aceptación** ("crear un proceso y verlo en el mapa público sin despliegue").
7. **Subprocesos** — cierre de la jerarquía; advertencia de huérfanos en desactivar
   (aplica también a procesos/macroprocesos del paso anterior).
8. **Vista previa con inactivos** — `obtenerDatosMapaAdmin()` + prop `mostrarInactivos`.
9. **Nav + pulido** — enlaces del panel, migas, foco/ARIA, revisión de accesibilidad.

Cada paso es demostrable por separado. Al cierre de la fase: actualizar `CONTEXT.md`,
commit, y decir al usuario qué probar y cómo (metodología §6).

## 13. Fuera de alcance (YAGNI, explícito)

- Sistema de borrador/staging del mapa completo (se descartó en la decisión 4).
- Drag & drop de reordenamiento (decisión 2).
- Reasignación masiva de documentos al desactivar (se eligió advertir, no bloquear).
- Edición de la plantilla espacial (las 4 bandas son fijas por diseño, D1).
- Claves de configuracion arbitrarias más allá de las conocidas.
