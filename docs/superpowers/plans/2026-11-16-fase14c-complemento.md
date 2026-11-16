# Complemento de la 14C — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rechazar el punto de miles en todos los formularios de los indicadores, decidir con exactitud qué mediciones deben el soporte obligatorio y convertir el periodo de un dato que nace sin categorías en tarea de quien administra.

**Architecture:** Una regla pura común para el punto de miles (`src/lib/indicadores/miles.ts`) que usan los lectores de lo que escribe una persona. El soporte obligatorio gana una fecha en el indicador y una marca por medición (migración `0017`); la marca se decide al activar y al nacer, y todo lector (recálculo, rechazo al reportar, tareas, lista, pasada, tabla, pantallas) pregunta lo mismo. El periodo vacío de un dato sale de lo que se le pide al responsable y entra como tarea y aviso de quien administra; el cierre lo espera.

**Tech Stack:** Next.js 16 (App Router), TypeScript estricto, PostgreSQL 16, Drizzle, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-fase14c-complemento-design.md` (amplía `docs/superpowers/specs/2026-11-15-fase14c-datos-compartidos-desagregacion-compuestos-design.md`). Leer los dos: el anexo manda; este plan lo argumenta.

## Global Constraints

- Worktree `F:\sgc-integral-f14c`, rama `f14c-complemento` (sale de `main` en `07cb1e6`). Toda orden que toque la base va por el guard: `bash .superpowers/sdd/2026-11-15-fase14c-datos-desagregacion-compuestos/con-f14c.sh <orden>` (base `sgc_f14c`). Nunca `F:\sgc-integral`, su base `sgc` ni el puerto 3002. Nunca leer ni crear `.env.local`.
- Sin `push` ni `merge`. Sin dependencias npm nuevas. Una sola migración nueva, `drizzle/0017_*`, que solo añade (regla 11 de `AGENTS.md`); `src/db/esquema.ts` no importa con `@/`.
- `BD_APP_CLAVE` no cambia: nunca `db:roles` ni `db:preparar` contra otra base que `sgc_f14c`.
- Tablas de solo inserción (`medicion_eventos`, `auditoria`, `variable_eventos`, …): nunca `UPDATE` ni `DELETE`, tampoco en pruebas. Una medición cerrada solo cambia por su reapertura (trigger `sgc_impedir_si_medicion_cerrada`).
- El estado, el resultado y el semáforo de una medición los escribe solo `recalcularMedicion` (`src/db/consultas/indicadores/mediciones.ts`).
- Mensaje del punto de miles, exacto: «Escriba el valor sin puntos de miles (1731); para decimales use la coma (1,731)». Ayuda, exacta: «Sin puntos de miles; use la coma para los decimales.». Expresión, exacta: `^-?[1-9]\d{0,2}(\.\d{3})+$`, sobre el texto sin los espacios de los extremos.
- Columnas nuevas, con estos nombres: `indicadores.soporte_obligatorio_desde` (`timestamptz`, nula) y `mediciones.debe_soporte` (`boolean NOT NULL DEFAULT false`).
- Tipo de aviso nuevo: `indicadores.dato_sin_categorias`.
- Commits convencionales en español, terminados en `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (regla del proyecto).
- Pruebas contra la base: usuarios `zz_<algo>_${Date.now()}`; lo que no deba quedar, dentro de `revertida` (`tests/utiles/transaccion.ts`); cierres del mes en un año lejano con `ahora` inyectado.
- Textos de interfaz en español con tildes; colores por tokens (`tests/colores-fijos.test.ts`); nada de nombres de entidad fijos (`tests/textos-fijos.test.ts`).

## Review Focus

1. **Un valor guardado con tres decimales que nadie tocó** (un rango o un límite de captura de 2,375 en la ficha): se reenvía al guardar el borrador y no puede rechazarse. Prueba en la Tarea 2.
2. **Un cambio de plazo del indicador después de activar el soporte** no cambia ninguna marca ni deja una medición vencida por un soporte que no se le pedía (caso 7 del anexo). Prueba en la Tarea 4.
3. **Reabrir una medición cerrada** (antes o después de la migración) no choca con el trigger de las cerradas ni cambia su marca: la cerrada antes de la migración, reabierta, no debe el soporte. Prueba en la Tarea 4.
4. **Dos pasadas a la vez** sobre el mismo dato: el aviso del periodo sin categorías sale una sola vez por persona (solo avisa quien lo creó). Prueba en la Tarea 6.
5. **El aviso y la tarea del periodo vacío** nombran el dato y el periodo, nunca un indicador, y no existen para un periodo que ya nadie pide. Prueba en la Tarea 6.

---

### Task 1: La regla común del punto de miles y lo que se reporta cada periodo

**Files:**
- Create: `src/lib/indicadores/miles.ts`
- Modify: `src/lib/indicadores/reporte.ts` (`leerValor`, ~`:73`)
- Modify: `src/db/consultas/indicadores/datos-periodos.ts` (`CON_PUNTO_DE_MILES`, `SIN_PUNTOS_DE_MILES`, ~`:97-98`, y `leer`, ~`:429`)
- Modify: `src/componentes/indicadores/datos/ReportarDato.tsx` (`SIN_MILES`, ~`:23`)
- Modify: `src/lib/indicadores/importacion/revisar.ts` (`PUNTO_DE_MILES`, ~`:167`, `:334`)
- Modify: `src/componentes/indicadores/medicion/FormularioReporte.tsx`, `RejillaDeCategorias.tsx`, `EdicionDeHistoricos.tsx` (la ayuda)
- Test: `tests/indicadores-miles.test.ts` (nuevo, sin base), `tests/indicadores-reporte.test.tsx`, `tests/indicadores-rejilla.test.tsx`, el archivo de pruebas de `revisarLote` (búsquelo con `Grep "revisarLote" tests`)

**Interfaces:**
- Produces (en `src/lib/indicadores/miles.ts`, módulo puro, sin imports de `@/db`):
  - `export const SIN_PUNTOS_DE_MILES = "Escriba el valor sin puntos de miles (1731); para decimales use la coma (1,731)"`
  - `export const AYUDA_SIN_MILES = "Sin puntos de miles; use la coma para los decimales."`
  - `export function tienePuntoDeMiles(texto: string): boolean` (recorta y prueba la expresión de Global Constraints)
- `datos-periodos.ts` sigue exportando `SIN_PUNTOS_DE_MILES` (re-exportado desde `miles.ts`): hay pruebas que lo importan de ahí.

- [ ] **Step 1: Pruebas de la regla, en rojo**

```ts
// tests/indicadores-miles.test.ts
for (const t of ["1.600", "12.500", "1.284.300", "-1.600", " 1.600 "]) expect(tienePuntoDeMiles(t)).toBe(true);
for (const t of ["1600", "1,6", "1.6", "0.125", "1600.5", "1,731", "1.6000", "01.600", ""]) expect(tienePuntoDeMiles(t)).toBe(false);
```

En `tests/indicadores-reporte.test.tsx` (o donde ya se prueba `leerValor`): `leerValor("1.600", { nombre: "Casos", ... })` da `{ ok: false, error: "«Casos»: Escriba el valor sin puntos de miles (1731); para decimales use la coma (1,731)" }`; `leerValor("1,6", …)` y `leerValor("1600", …)` siguen bien. `calcularEnVivo` con «1.600» en una variable devuelve ese error para su letra.

En las pruebas de `revisarLote`: una meta «0.125» ya no sale como «ambigua»; una meta «1.500» sigue saliendo con el mensaje de hoy.

- [ ] **Step 2: Correrlas y ver el rojo**

Run: `bash .superpowers/sdd/2026-11-15-fase14c-datos-desagregacion-compuestos/con-f14c.sh npx vitest run tests/indicadores-miles.test.ts tests/indicadores-reporte.test.tsx`
Expected: FAIL (el módulo no existe; `leerValor` acepta «1.600»).

- [ ] **Step 3: Implementar**

`miles.ts` con lo de Interfaces. `leerValor` rechaza con `«${v.nombre}»: ${SIN_PUNTOS_DE_MILES}` **antes** de las demás comprobaciones. `datos-periodos.ts` usa `tienePuntoDeMiles` y conserva su mensaje (sin nombre en el valor único, con `${nombre}: ` por categoría). `revisar.ts` cambia su expresión por `tienePuntoDeMiles` y conserva su mensaje. `ReportarDato.tsx` usa `AYUDA_SIN_MILES`.

La ayuda: bajo cada campo de valor propio de `FormularioReporte` (por `aria-describedby`, sumándose a la que ya tenga); en la rejilla y en la tabla de los históricos, una sola vez sobre la tabla, con un `id` que cada campo de valor referencia en su `aria-describedby` (como la ayuda por categoría del dato, `Campo` con `tambienDescritoPor`).

- [ ] **Step 4: Los textos con tres decimales que pasan por `leerValor`**

Busque en `src/db/semillas/` y en `tests/` los valores que se pasan a `reportar`, `reportarLoMio`, `registrarHistoricos` o a la rejilla con forma `^-?[1-9]\d{0,2}\.\d{3}$` (`Grep`); los que existan pasan a coma («1,125») o a otra cifra, sin cambiar lo que la prueba afirma. Diga en el informe cuántos cambió.

- [ ] **Step 5: Correr el área**

Run: `… con-f14c.sh npx vitest run tests/indicadores-miles.test.ts tests/indicadores-reporte.test.tsx tests/indicadores-rejilla.test.tsx tests/indicadores-datos-periodos.test.ts tests/indicadores-mediciones.test.ts tests/indicadores-metas-historicos.test.ts` y el archivo de `revisarLote`.
Expected: PASS.

- [ ] **Step 6: Commit** — `feat(f14c): el punto de miles se rechaza en lo que se reporta cada periodo de un indicador`

---

### Task 2: Las cifras de la ficha, las metas programadas y los límites de un dato

**Files:**
- Modify: `src/lib/esquemas/indicadores.ts` (`numero`, ~`:67`; `EsquemaPrueba`, ~`:128-135`; sus usos, ~`:116-117`, `:146-147`, `:218-227`, `:534-537`)
- Modify: `src/lib/esquemas/indicadores-datos.ts` (~`:21-22`)
- Modify: `src/componentes/indicadores/ficha/EditorDeRangos.tsx` (~`:35`, `:82`, `:87`, `:227`)
- Modify: `src/componentes/indicadores/ficha/FormularioFicha.tsx` (límites de captura: estado ~`:422`, `limpia` ~`:127-128`, envío ~`:666`, campos ~`:1222`, `:1231`)
- Test: el archivo de pruebas de los esquemas de la ficha (búsquelo: `Grep "EsquemaFicha\|numero(" tests`), `tests/indicadores-formulario.test.tsx`

**Interfaces:**
- Consumes: `tienePuntoDeMiles`, `SIN_PUNTOS_DE_MILES` (Tarea 1).
- Produces: `numero(mensaje: string, campo: string)` — el segundo argumento nombra el campo en el rechazo: `` `${campo}: ${SIN_PUNTOS_DE_MILES}` ``. Nombres: «La meta», «El máximo del rango», «El límite de crítico», «La tolerancia», «El mínimo del resultado», «El máximo del resultado», «La línea base», «Los rangos del semáforo», «El mínimo de captura», «El máximo de captura»; en las metas programadas, «La meta» y «El máximo del rango»; en la prueba de la fórmula, «Los valores de la prueba».

- [ ] **Step 1: Pruebas en rojo**

Del esquema: con `meta: "1.500"` el error es «La meta: Escriba el valor sin puntos de miles (1731); para decimales use la coma (1,731)»; `meta: "1,5"` y `meta: "1500"` pasan y se guardan como «1.5» y «1500». Lo mismo para un valor de los rangos («Los rangos del semáforo: …»), un límite de captura de la ficha y de un dato, una meta programada y un valor de la prueba.

Del formulario (Review Focus 1), con `renderToStaticMarkup` de `FormularioFicha` sobre una versión guardada que tiene un rango con valor «2.375» y una variable con límite de captura «2.375»: el campo oculto de los rangos lleva «2,375» (no «2.375»), y lo que el formulario envía por cada límite de captura es «2,375». Con esos valores enviados tal cual, el esquema los acepta y los guarda como «2.375».

- [ ] **Step 2: Correrlas y ver el rojo**

Run: `… con-f14c.sh npx vitest run <archivo de esquemas> tests/indicadores-formulario.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`numero` rechaza con `tienePuntoDeMiles` antes de convertir. `EditorDeRangos` arma su campo oculto con el texto tal como se escribió (con coma); la conversión a punto la hace el esquema del servidor. `FormularioFicha` guarda los límites de captura en su estado con coma desde el principio (`conComa` al iniciar, no solo al pintar) y los envía tal como se escribieron. Los rangos que arma el sistema (`rangosEquivalentes` en `operacion.ts`, `rangosDeLaRegla` en `revisar.ts`) y la meta canónica de la importación no pasan por `numero`: compruébelo y dígalo en el informe.

- [ ] **Step 4: Correr el área**

Run: `… con-f14c.sh npx vitest run tests/indicadores-formulario.test.tsx tests/indicadores-ficha.test.ts tests/indicadores-fichas.test.ts tests/indicadores-rangos.test.ts tests/indicadores-datos.test.ts tests/indicadores-metas-historicos.test.ts tests/indicadores-importacion.test.ts` y el de esquemas (los nombres que no existan, dígalos).
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14c): las cifras de la ficha, las metas y los límites de un dato rechazan el punto de miles`

---

### Task 3: La migración `0017` y la fecha del soporte obligatorio

**Files:**
- Modify: `src/db/esquema.ts` (tabla `indicadores`, ~`:1627`; tabla `mediciones`)
- Create: `drizzle/0017_fase14c-soporte-desde.sql` y su `drizzle/meta` (con `npm run db:generate` por el guard, y el relleno añadido a mano al final del `.sql`)
- Modify: `src/db/consultas/indicadores/operacion.ts` (`cambiarOperacion`, ~`:276-337`; `duplicar`, ~`:420-424`)
- Modify: `src/db/consultas/indicadores/fichas.ts` (crear, ~`:767`; `guardarBorrador`, ~`:845-914`)
- Modify: `src/db/consultas/indicadores/publicacion.ts` (~`:102-108`)
- Test: `tests/indicadores-soporte-desde.test.ts` (nuevo)

**Interfaces:**
- Produces: las dos columnas de Global Constraints; el `CHECK` `indicadores_soporte_desde` (`(soporte_obligatorio AND soporte_obligatorio_desde IS NOT NULL) OR (NOT soporte_obligatorio AND soporte_obligatorio_desde IS NULL)`); en Drizzle, `soporteObligatorioDesde` y `debeSoporte`.
- Produces: el relleno de la migración, en dos `UPDATE` precedidos cada uno por la línea `-- relleno 0017` (la Tarea 3 los prueba leyéndolos del archivo).
- `DatosOperacion` (`src/lib/indicadores/tipos.ts:131`) **no cambia**: se compara y se guarda en la bitácora.

- [ ] **Step 1: Pruebas en rojo**

En `tests/indicadores-soporte-desde.test.ts`, dentro de `revertida`, con `ahora` inyectado:
- `cambiarOperacion` de no a sí deja `soporte_obligatorio_desde = ahora`; de sí a no, nula; de sí a sí (cambia solo el plazo), la fecha no se mueve.
- Crear un indicador con soporte obligatorio y `guardarBorrador` que lo activa ponen la fecha; duplicar uno que lo exige pone la hora de la duplicación.
- Aprobar una versión que nadie mide (sin variables propias) apaga el soporte y borra la fecha.
- Escribir `soporte_obligatorio = true` con la fecha nula viola el `CHECK` (`23514`).
- El relleno: con un indicador que exige soporte y una fila de bitácora `indicador_operacion` que lo pasó de no a sí el 12 de octubre de 2026, y otro sin rastro, creado el 1 de marzo, correr los `UPDATE` marcados `-- relleno 0017` (leídos del `.sql`) deja 12 de octubre y 1 de marzo; las mediciones en curso de esos indicadores quedan marcadas con la regla del anexo §4.3 (una reportada el 3 de octubre con fecha límite el 10, en un indicador con fecha 12 de octubre: sin marca; una sin reportar: con marca); una cerrada, sin marca y sin error.

- [ ] **Step 2: Correrlas y ver el rojo**

Run: `… con-f14c.sh npx vitest run tests/indicadores-soporte-desde.test.ts`
Expected: FAIL (no existen las columnas).

- [ ] **Step 3: Esquema y migración**

Las dos columnas y el `CHECK` en `esquema.ts`; `db:generate` por el guard; al final del `.sql`, los dos `UPDATE` del relleno: (1) la fecha de cada indicador que exige soporte: la `creado_en` de la última fila de `auditoria` del indicador cuyo `detalle` lo deja exigiéndolo sin haberlo exigido antes (`indicador_operacion` con `antes`/`despues`; `indicador_creado` y `indicador_borrador_guardado` con su `operacion`; confirme la forma de cada `detalle` y si `indicador_duplicado` la trae), o `indicadores.creado_en`; (2) la marca de las mediciones no cerradas y no históricas de esos indicadores: verdadera salvo las que tienen un primer reporte de persona anterior a la fecha **y** una fecha límite de reporte (el `venceAntes` del primer evento que lo lleve, o `vence_en`) anterior a la fecha. Aplíquela con `npm run db:migrate` por el guard.

- [ ] **Step 4: Los escritores de la fecha**

En los cinco sitios de Files: activar pone `ahora`, desactivar pone nula, sin cambio no toca. Mismo `UPDATE` que ya escribe `soporte_obligatorio`.

- [ ] **Step 5: Correr el área**

Run: `… con-f14c.sh npx vitest run tests/indicadores-soporte-desde.test.ts tests/indicadores-operacion.test.ts tests/indicadores-fichas.test.ts tests/indicadores-ficha.test.ts tests/indicadores-publicacion.test.ts tests/privilegios-bd.test.ts`
Expected: PASS (los que no existan, dígalos).

- [ ] **Step 6: Commit** — `feat(f14c): el indicador guarda desde cuándo exige soporte y la migración 0017 lo rellena`

---

### Task 4: La marca de cada medición y la regla única del soporte

**Files:**
- Modify: `src/db/consultas/indicadores/en-curso.ts` (`recalcularPorSoporte`)
- Modify: `src/db/consultas/indicadores/mediciones.ts` (el `INSERT` de `asegurarMediciones`, ~`:439`; `recalcularMedicion`, ~`:923-937`; los dos rechazos «Este indicador exige un soporte…», ~`:1309` y `:1392`)
- Modify: `tests/indicadores-propagacion.test.ts` (el bloque «el soporte obligatorio de una medición que espera su dato», que fijaba la regla aproximada)
- Test: `tests/indicadores-soporte-desde.test.ts`

**Interfaces:**
- Consumes: `mediciones.debe_soporte`, `indicadores.soporte_obligatorio_desde` (Tarea 3).
- Produces: la regla «debe el soporte» = `i.soporte_obligatorio AND m.debe_soporte` (más las excepciones de siempre: histórica, nadie mide, «No aplica»). `recalcularPorSoporte(tx, indicadorId, { ahora, actorId, activado })` conserva su firma: al activar, primero marca las en curso (`debe_soporte = NOT (reportada_en IS NOT NULL AND vence_en < ahora)`, sin cerradas ni históricas) y después las recalcula **todas**; al desactivar, recalcula todas sin tocar las marcas.

- [ ] **Step 1: Pruebas en rojo**

En `tests/indicadores-soporte-desde.test.ts`, con los ayudantes de `tests/indicadores-propagacion.test.ts` (`mixto`, `reportarLoMio`, `activarSoporte`, `reportarElDato`, `propagarA`, `fila`; muévalos a `tests/utiles/` si hace falta compartirlos), septiembre vence el 10 de octubre y quien mide reportó lo suyo el 5 (el `AHORA` del archivo):
- Caso 1: activado el 12, dato el 20 con resultado Crítico: `estado = "abierta"`, falta el análisis, `debe_soporte = false`, y no existe la tarea `medir:{id}` (sí la de analizar).
- Caso 2: activado el 12, dato el 20 que cumple, análisis opcional el 21 (`analizar`): `estado = "reportada"`.
- Caso 3: activado el 6 (en plazo), dato el 20 que cumple: `estado = "abierta"`, `debe_soporte = true`.
- Caso 5: activado el 6, desactivado el 8, activado el 12: `debe_soporte = false`.
- Caso 6: activado el 6 y desactivado el 8 con lo propio y el dato completos y sin soporte: `estado = "reportada"`.
- Caso 7 (Review Focus 2): activado el 12; el 1 de noviembre `cambiarOperacion` sube el plazo a 15 días: `debe_soporte` sigue en `false` y el estado no cambia.
- Caso 8: septiembre sin reportar al activarse el 12: `debe_soporte = true`, y `reportar` sin soporte el 20 lanza «Este indicador exige un soporte: adjúntelo antes de reportar».
- Nace marcada: con el soporte activo, la medición de octubre que abre `asegurarMediciones` tiene `debe_soporte = true`; una histórica, `false`.
- Review Focus 3: una medición cerrada sin marca (cerrada antes de activarse) se reabre (`reabrirEnCascada`) sin error y sin marca, y su recálculo la deja `reportada` sin soporte.

- [ ] **Step 2: Correrlas y ver el rojo**

Run: `… con-f14c.sh npx vitest run tests/indicadores-soporte-desde.test.ts`
Expected: FAIL en los casos 1, 2, 3, 7 y 8 y en «nace marcada».

- [ ] **Step 3: Implementar**

Marca al nacer en el `INSERT` (leyendo el soporte del indicador en la misma transacción; nunca en una histórica). `recalcularMedicion` decide `conSoporte` con la regla de Interfaces y retira `esperabaElDato` y la excepción de la racha y la fuente para lo ya reportado. Los dos rechazos de reportar usan la misma regla. `recalcularPorSoporte` como dice Interfaces.

- [ ] **Step 4: Las pruebas que fijaban la regla aproximada**

En `tests/indicadores-propagacion.test.ts`, el bloque de la decisión 49 pasa a afirmar la regla nueva (el caso «activado dentro del plazo… lo sigue debiendo si el dato llega en plazo» queda igual; «si el plazo pasa y el dato no ha llegado, el soporte deja de pedirse» pasa a: lo sigue debiendo). Diga en el informe cada afirmación que cambió y por qué.

- [ ] **Step 5: Correr el área**

Run: `… con-f14c.sh npx vitest run tests/indicadores-soporte-desde.test.ts tests/indicadores-propagacion.test.ts tests/indicadores-mediciones.test.ts tests/indicadores-operacion.test.ts tests/indicadores-soportes.test.ts tests/indicadores-medicion-mixta.test.ts tests/indicadores-compuestos.test.ts tests/indicadores-desagregado.test.ts tests/indicadores-reapertura-cascada.test.ts tests/indicadores-cierre.test.ts tests/indicadores-ciclos.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit** — `feat(f14c): la deuda del soporte se decide una vez por medición y todo recálculo la respeta`

---

### Task 5: Lo que se ve: tareas, lista, pasada, tabla del año, pantallas y ficha técnica

**Files:**
- Modify: `src/db/consultas/indicadores/tareas.ts` (`columnasDePendiente`, `queFalta`, `debeElSoporte`, `deMediciones`)
- Modify: `src/db/consultas/indicadores/lista.ts` (~`:280-300`), `src/db/consultas/indicadores/vencimientos.ts` (`leer`, ~`:115`)
- Modify: `src/db/consultas/indicadores/lectura.ts` (`faltaSoporte`, ~`:1483`; `datosDeReporte`, ~`:260`, para `debeSoporte`)
- Modify: `src/componentes/indicadores/medicion/FormularioReporte.tsx` (~`:281-286`), `RejillaDeCategorias.tsx` (~`:370-373`), `Soportes.tsx` (~`:67`), `TablaDelAnio.tsx`
- Modify: `src/componentes/indicadores/ficha/FichaTecnica.tsx` (~`:205`), `src/lib/indicadores/ficha-en-texto.ts` (~`:261`) y quien les pasa los datos de operación
- Test: `tests/indicadores-soporte-desde.test.ts`, `tests/indicadores-reporte.test.tsx`, `tests/indicadores-tareas.test.ts`, `tests/indicadores-ficha.test.ts`

**Interfaces:**
- Consumes: la regla de la Tarea 4.
- Produces: `Pendiente.faltaSoporte` = reportada, alguien mide, `soporte_obligatorio`, `debe_soporte` y sin soporte; `debeElSoporte(p)` deja de mirar el plazo (firma `(p: Pick<Pendiente, "falta" | "faltaSoporte">) => boolean`). `DatosDeReporte.debeSoporte: boolean`. La ficha técnica y el impreso reciben `soporteDesde: Date | null` aparte de `DatosOperacion`.
- Texto exacto de la ficha: «Sí: cada reporte lleva su soporte, desde el {día} de {mes} de {año}» (fecha en la zona de la instalación, `zonaHoraria()`).

- [ ] **Step 1: Pruebas en rojo**

- Caso 3 del anexo, el 12 de octubre (dato sin llegar, plazo vencido el 10): la tarea `medir:{id}` existe con detalle «Falta el soporte obligatorio» y cuenta en `vencidas`; `listarIndicadores` la cuenta vencida; `revisarVencimientosDeIndicadores` le pone `aviso_vencido_en`; la fila de la tabla del año dice «Falta un dato» y además que falta el soporte.
- Una medición `abierta` con todo lo demás completo y `debe_soporte = false` (estado viejo): ninguna tarea `medir:`.
- `FormularioReporte` y la rejilla: con `debeSoporte: false` y soporte obligatorio en el indicador, no dicen «Este indicador exige un soporte: adjúntelo antes de reportar»; con `true`, sí.
- La ficha técnica de un indicador con fecha 12 de octubre de 2026 dice «Sí: cada reporte lleva su soporte, desde el 12 de octubre de 2026»; el impreso, lo mismo.

- [ ] **Step 2: Correrlas y ver el rojo**

Run: `… con-f14c.sh npx vitest run tests/indicadores-soporte-desde.test.ts tests/indicadores-reporte.test.tsx tests/indicadores-ficha.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`columnasDePendiente` añade `m.debe_soporte`. En `deMediciones`, la tarea por «reporte» de una medición ya reportada solo existe si `faltaSoporte`; la del soporte bajo «Falta un dato» existe siempre que se deba (sin mirar el plazo). La lista y la pasada tratan ese soporte como cualquier soporte que se debe: por reportar, vencido con la fecha límite de la medición, con aviso y escalamiento (la pasada deja de saltar `falta === "dato"` cuando `faltaSoporte`). La tabla del año decide `faltaSoporte` con la marca y el conteo de soportes, no con el estado. Las tres pantallas usan `debeSoporte`. La ficha técnica y el impreso, la fecha.

- [ ] **Step 4: Correr el área**

Run: `… con-f14c.sh npx vitest run tests/indicadores-soporte-desde.test.ts tests/indicadores-reporte.test.tsx tests/indicadores-rejilla.test.tsx tests/indicadores-tareas.test.ts tests/indicadores-vencimientos.test.ts tests/indicadores-lista.test.ts tests/indicadores-ficha.test.ts tests/indicadores-impresion.test.tsx tests/indicadores-paginas.test.tsx tests/modulo-indicadores-vistas.test.tsx tests/cascaron-consultas.test.ts tests/tareas.test.ts tests/indicadores-propagacion.test.ts`
Expected: PASS (los que no existan, dígalos).

- [ ] **Step 5: Commit** — `feat(f14c): tareas, lista, pasada, tabla y pantallas preguntan lo mismo por el soporte, y la ficha dice desde cuándo`

---

### Task 6: El periodo de un dato que nace sin categorías

**Files:**
- Modify: `src/db/consultas/indicadores/datos-periodos.ts` (`asegurarDe`, ~`:200-250`; un fragmento nuevo junto a `periodoQueSePide`, ~`:109`; `tareasDeDatos`, ~`:633`; `actualizarCategoriasDelDato`, ~`:557`)
- Modify: `src/db/consultas/indicadores/datos-vencidos.ts` (~`:80`), `src/db/consultas/indicadores/datos.ts` (~`:246`)
- Modify: `src/db/consultas/indicadores/tareas.ts` (`tareasDeIndicadores`)
- Modify: `src/db/consultas/indicadores/cierre.ts` (`periodosDeDatosDelCierre` y el resumen) y la página del cierre (`src/app/(app)/indicadores/cierre/page.tsx`)
- Modify: `src/lib/indicadores/tipos.ts` (`PERIODO_SIN_CATEGORIAS`)
- Test: `tests/indicadores-datos-periodos.test.ts` (el bloque de la ola final «nace sin categorías» y uno nuevo), `tests/indicadores-cierre-entradas.test.ts`

**Interfaces:**
- Produces: `periodoSinCategorias(sql: Cliente)` = `(vv.categorias IS NOT NULL AND jsonb_array_length(vv.categorias) = 0)`; lo que se le pide al responsable pasa a ser `periodoQueSePide AND NOT periodoSinCategorias` en la tarea, los recordatorios, el vencido, el escalamiento y el número de la pestaña.
- Produces: `tareasDeCategoriasPendientes(sql: Cliente, sesion: SujetoVisibilidad): Promise<Tarea[]>` (solo con `indicadores.administrar`): id `categorias-dato:{periodoId}`, título «Actualizar las categorías de {dato}, {periodo}», detalle «Nadie puede reportarlo hasta que tenga categorías» o, si la dimensión no tiene ninguna activa, «Su dimensión no tiene categorías activas: créelas o actívelas primero», `vence: null`, enlace `/indicadores/datos/{datoId}`.
- Produces: el aviso `indicadores.dato_sin_categorias` a cada usuario activo de `adminsActivos` (`src/db/consultas/tramites`), título «El periodo {periodo} del dato «{dato}» no tiene categorías: actualícelas para que se pueda reportar», enlace a la página del dato.
- Produces: en el resumen del cierre, `datos.esperanCategorias` y `datos.sinCategoriasActivas` (números).
- `PERIODO_SIN_CATEGORIAS` pasa a «Este periodo no tiene categorías: el Administrador del SGC debe actualizarlas antes de reportarlo».

- [ ] **Step 1: Pruebas en rojo**

Con la puesta en marcha que ya usa el bloque «nace sin categorías» (categorías creadas el 15 de noviembre, trimestral aprobado el 16, dato mensual de 10 días):
- Caso 1: `asegurarPeriodosDeDatos` el 16 deja octubre vacío con fecha límite el 26; cada administrador activo tiene una notificación `indicadores.dato_sin_categorias` cuyo título nombra el dato y «octubre de 2026» y no contiene el código de ningún indicador (Review Focus 5); `tareasDeCategoriasPendientes` de un administrador trae la tarea; `tareasDeDatos` del responsable no trae nada.
- Review Focus 4: correr `asegurarPeriodosDeDatos` otra vez no crea otra notificación.
- Caso 2: el 27, `datosVencidos` no marca ni escala ese periodo.
- Caso 3: `actualizarCategoriasDelDato` el 30 (con una categoría activa) deja la fecha límite en `fechaLimite(30 nov, 10)`, borra las marcas de aviso, guarda `venceEn` en el evento, y la tarea pasa al responsable y desaparece la de quien administra.
- Caso 4: el resumen del cierre del mes que alcanza octubre cuenta el periodo en `datos.esperanCategorias` y no lo cierra; `cerrarMes` lo deja pendiente.
- Caso 5: con todas las categorías de la dimensión desactivadas, la tarea dice «Su dimensión no tiene categorías activas: créelas o actívelas primero» y el cierre lo cierra «Sin dato», contado en `datos.sinCategoriasActivas`.
- Caso 6: un periodo vacío con `se_pide = false` no da tarea a nadie.

- [ ] **Step 2: Correrlas y ver el rojo**

Run: `… con-f14c.sh npx vitest run tests/indicadores-datos-periodos.test.ts tests/indicadores-cierre-entradas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

El aviso solo cuando el `INSERT` de `asegurarDe` devolvió la fila (`RETURNING id`) y su lista es `[]`, en la misma transacción. La tarea de quien administra entra en `tareasDeIndicadores` junto a las demás. El cierre espera el periodo vacío si la dimensión tiene alguna categoría activa; si no, lo cierra «Sin dato». `actualizarCategoriasDelDato`: si la lista estaba vacía y añadió alguna, recuenta la fecha límite desde `ahora` con el plazo del dato y limpia las marcas de aviso (como el periodo que vuelve a pedirse en `asegurarDe`). La página del cierre muestra las dos cuentas nuevas con las frases del anexo §5.4.

- [ ] **Step 4: Correr el área**

Run: `… con-f14c.sh npx vitest run tests/indicadores-datos-periodos.test.ts tests/indicadores-cierre-entradas.test.ts tests/indicadores-cierre.test.ts tests/indicadores-datos-pantallas.test.tsx tests/indicadores-datos.test.ts tests/indicadores-tareas.test.ts tests/cascaron-consultas.test.ts tests/indicadores-paginas.test.tsx tests/bitacora-detalle.test.ts tests/indicadores-ciclos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14c): el periodo de un dato sin categorías es tarea y aviso de quien administra, y el cierre lo espera`

---

### Task 7: La demo y los documentos

**Files:**
- Modify: la semilla de la 14C (`src/db/semillas/indicadores-demo-14c.ts`) o la de la 14A, por las funciones del dominio con `ahora` inyectado
- Modify: `tests/semilla-indicadores-14c.test.ts` (o el de la semilla que toque)
- Modify: `docs/manual/usuario/08-indicadores.md`, `AGENTS.md`, `CONTEXT.md` («Hecho», «Qué probar y cómo», «Avisos para el usuario», «Decisiones adicionales» y «Deuda técnica» de un bloque nuevo «Complemento de la 14C»), `PLAN.md`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: La demo**

Un indicador mensual de la demo con soporte obligatorio activado con `cambiarOperacion` a mitad del plazo de un mes, para que el recorrido vea las dos caras: un mes que lo debe (en plazo al activarlo) y uno reportado y vencido que no. Elija uno que no cambie lo que afirman los demás `tests/semilla-*.test.ts`; si alguno cambia, dígalo. Una afirmación en el test de semilla: la fecha del indicador y las dos marcas, detrás de la guarda de «la demo ya se usó» (como el resto del archivo).

- [ ] **Step 2: Documentos**

El manual: el punto de miles (reportar, ficha, metas, datos), desde cuándo se exige el soporte y qué mediciones lo deben (con el ejemplo del anexo), el periodo sin categorías (tarea y aviso de quien administra, el cierre que espera) y la tabla de mensajes. `AGENTS.md`: la regla del soporte con su fecha y su marca en lugar de la aproximación de la 14C (busque `debeElSoporte`, `esperabaElDato` y «rige hacia adelante»), el punto de miles y el periodo sin categorías. `CONTEXT.md` y `PLAN.md`: el bloque del complemento, con «Qué probar y cómo» por la demo; **no** escriba «Verificación de cierre» (la escribe el controlador). Las decisiones 44, 45 y 49 de la 14C se marcan reemplazadas en lo que el anexo cambia.

- [ ] **Step 3: Verificar**

Run: resiembra por el guard (`npm run db:seed` y `npm run admin:asegurar`), después `… con-f14c.sh env SEMILLA_RECIEN=1 npx vitest run tests/semilla-*.test.ts` y `npm run lint`.
Expected: semillas en verde sin saltos; lint limpio.

- [ ] **Step 4: Commit** — `docs(f14c): demo, manual, AGENTS, CONTEXT y PLAN del complemento de la 14C`

---

## Al cerrar (lo hace quien coordina, no una tarea)

- Revisión final de toda la rama y, si deja hallazgos, una sola ola de corrección.
- Con la demo recién sembrada: `SEMILLA_RECIEN=1` suite completa (debe salir 0; la línea base es la de `main` en `07cb1e6`: 276 archivos, 6987 en verde y 1 saltada), `npm run lint` y `npm run build` sin `DATABASE_URL`.
- La `0017` sobre una copia de `sgc` (como en la 14C: `pg_dump` de solo lectura, restaurada en `sgc_f14c_copia`, borrada al terminar): conteos y huellas de todas las tablas antes y después (`indicadores` y `mediciones` comparadas sobre sus columnas de antes), la fecha que quedó en cada indicador que exige soporte, cuántas mediciones quedaron marcadas y **cuántas quedarían con un estado viejo** (abierta solo por un soporte que ya no deben, o reportada sin el soporte que deben). Si hay alguna, se le dice al usuario antes de fusionar (anexo §4.3).
- El recorrido en el navegador de lo que trae la demo y de «Qué probar y cómo» del complemento; «Verificación de cierre» en `CONTEXT.md` con sus cifras.
