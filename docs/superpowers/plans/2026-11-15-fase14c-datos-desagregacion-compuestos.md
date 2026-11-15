# Fase 14C — Datos compartidos, desagregación y compuestos: plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un indicador pueda mezclar variables propias con datos compartidos (reportados una sola vez por su
responsable) y con resultados de otros indicadores, y capturarse por las categorías de una dimensión, sin tareas falsas
para quien no debe nada, sin resultados cerrados distintos de sus datos y sin mostrar un restringido a quien no puede verlo.

**Architecture:** el origen se decide **por variable** (propia, dato compartido o resultado de otro indicador). Lo ajeno se
**copia** a `medicion_valores`, con su fracción exacta, por una **pasada de propagación** idempotente con la forma de
`tomarFotos` (una transacción por medición, por niveles, sin bloquear la fuente); `recalcularMedicion` sigue siendo el
único camino de cálculo. El total de un desagregado es la fila sin categoría, que escribe el sistema; el resultado de cada
categoría se calcula al leer. El cierre conoce las entradas de cada medición y la reapertura va en cascada. Quién ve un
componente es una función de `src/lib/alcance.ts` que todas las lecturas aplican.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript estricto, PostgreSQL 16 con Drizzle, `zod`, `exceljs`,
Vitest. **Sin dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-11-15-fase14c-datos-compartidos-desagregacion-compuestos-design.md` («el anexo»),
que amplía `docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md` («spec 14»),
`docs/superpowers/specs/2026-11-13-fase14a-rangos-e-importacion-design.md` («14A-C») y
`docs/superpowers/specs/2026-11-14-fase14b-automaticos-y-regulatorios-design.md` («anexo 14B»), y manda sobre los tres.
Lea el anexo entero, de los otros las secciones que cada tarea cite, y `AGENTS.md`, antes de empezar. La revisión contra
el código, con archivo y línea, está en `<espacio>/revision-dato-compartido.md`, `<espacio>/revision-desagregacion.md` y
`<espacio>/revision-compuestos.md`: úselas para saber dónde vive cada cosa. Las maquetas 9 a 15 están en
`<espacio>/pantallas-14c.html`.

## Global Constraints

- Trabajo en el worktree `F:\sgc-integral-f14c`, rama `fase-14c-datos-desagregacion-compuestos` (sale de `main`,
  `44d8b9f`). Nunca el código de `F:\sgc-integral`, su base `sgc` ni su `next dev` del 3002; sin Docker salvo el `psql`
  que crea y borra las bases de trabajo (Tareas 1 y 18), sin `.env.local` (no se lee ni se crea), sin `push` ni `merge`.
- `<espacio>` es `F:\sgc-integral-f14c\.superpowers\sdd\2026-11-15-fase14c-datos-desagregacion-compuestos` (ignorado por
  git). Todo comando que toque la base va por su guard, que carga el entorno de la base aparte `sgc_f14c`:
  `bash <espacio>/con-f14c.sh npx vitest run tests/x.test.ts`. Un servidor para los puntos de control va en otro puerto:
  `bash <espacio>/con-f14c.sh npx next dev -p 3014`.
- La migración nueva es `drizzle/0015_*`, generada con `npm run db:generate` (por el guard) y completada a mano con el SQL
  que Drizzle no genera. Las cinco tablas de la 14C se **alteran en su sitio**: no se quita ninguna tabla ni columna. Si
  `db:generate` se queda esperando una respuesta interactiva, deténgase y avise al controlador (puede hacer falta partirla
  en dos archivos, como la `0013` y la `0014`). No se tocan la `0011` a la `0014`. `src/db/esquema.ts` importa solo con
  rutas relativas.
- Sobre las tablas que la 14A y la 14B ya usan solo se añade (`AGENTS.md`, piso 11).
- **Un solo camino de cálculo:** solo `recalcularMedicion` escribe resultado, semáforo, `cumple`, meta aplicada y estado,
  y **no refresca valores por sí misma**. Los valores que nadie digita los escriben solo `tomarFotos`, `volverACalcular`,
  `propagar` (T11) y el total de un desagregado (T14).
- **Cada escritor toca lo suyo:** el de la persona solo escribe y borra variables propias; el del sistema escribe una
  variable ajena sin borrar las demás.
- **Las versiones aprobadas no cambian y su huella tampoco:** `tests/indicadores-ficha.test.ts` fija la de una ficha
  manual. Todo campo firmado nuevo se omite de la huella cuando es nulo, también dentro de `variables`. Las claves que hoy
  se firman nulas (`dimensionId`, `variableCompartidaId`, `indicadorOrigenId`, `toma`) no se quitan ni se renombran.
- **Orden de candados:** indicador (`FOR SHARE`, o `FOR UPDATE` quien lo cambia) → medición o periodo del dato
  (`FOR UPDATE`) → filas hijas, **dentro de un solo indicador por transacción**. La medición que depende lee su fuente sin
  candado. Solo el cierre y la reapertura en cascada bloquean varios indicadores, siempre por id ascendente y sus
  mediciones por `indicador_id, desde, id`.
- **Módulos livianos:** `en-curso.ts`, `constancias-soporte.ts`, `componentes.ts`, `propagacion.ts`, `dependencias.ts` y
  `datos-soporte.ts` no importan `lectura`, `fichas`, `aprobacion` ni `operacion`. Lo vigila `tests/indicadores-ciclos.test.ts`.
- **Para quien no puede ver un indicador, no existe:** ni su código, ni su nombre, ni su cifra, en ninguna pantalla,
  archivo, evento, aviso ni mensaje de error. Los mensajes que nombran otro indicador llevan su código solo si
  `puedeVerIndicador`; si no, el mismo mensaje sin código.
- Toda Server Action nueva pasa por `mutacion(formData, "<permiso>", fn)` (`tests/acciones-permisos.test.ts`); toda acción
  de bitácora nueva tiene su frase y su nombre en `src/lib/bitacora-detalle.ts` (`tests/bitacora-detalle.test.ts`); cada
  página nueva llama su guard (`tests/paginas-sesion.test.ts`); la ruta que recibe una subida va fuera del `matcher` de
  `src/proxy.ts`, con su caso en `tests/proxy-matcher.test.ts`. Cada test estructural se actualiza en la tarea que lo rompe.
- Ninguna fórmula ni texto de la persona llega a SQL. Fechas, periodos y plazos en `zonaHoraria()`; nunca una zona fija.
- Colores solo por token (`tests/colores-fijos.test.ts`); nada de `opacity` para atenuar; el estado nunca solo por color;
  ningún nombre de entidad en `src/` (`tests/textos-fijos.test.ts`). Pantallas nuevas con los componentes de
  `src/componentes/ui`, navegables por teclado y a 390 px. Sin librerías de gráficas: SVG y HTML propios.
- Tests contra la base: fichas aprobadas, cierres y lotes dentro de `revertida` (`tests/utiles/transaccion.ts`); usuarios
  con historia `zz_<algo>_${Date.now()}`; nunca `UPDATE` ni `DELETE` sobre tablas inmutables en una limpieza. Un test que
  corre una pasada silencia lo ajeno (`silenciarIndicadores`), y T11 le suma la propagación.
- Next.js de este repo no es el de memoria: antes de escribir una página, una acción o un handler, lea la guía que toque
  en `node_modules/next/dist/docs/`.
- Commits convencionales en español, terminados con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (la línea
  que fija `AGENTS.md`). Se confirma por ruta (`git add <archivo>`), nunca `git add -A`.
- Textos de la interfaz en español; los mensajes entre comillas de este plan son copia exacta.
- Mientras itera corra el test enfocado; antes de confirmar, los archivos de test que la tarea nombra y `npm run lint`.
  **No corra la suite completa** (tarda más de cinco minutos): la corre el controlador.

## Puntos de control del controlador (navegador: claro, oscuro y 390 px)

Después de las Tareas 8 (la ficha con orígenes y desagregación), 13 («Datos compartidos», reportar un dato y verlo puesto),
15 (el desagregado de punta a punta), 16 (cierre y reapertura en cascada) y 17 (el compuesto y lo que se oculta); y la
demostración de §10 del anexo en la Tarea 18.

## Review Focus

1. **Una ficha aprobada antes de esta entrega:** su huella no cambia y se puede volver a guardar; guardar un borrador con
   un dato o un componente no lo devuelve a «propia». Tests en T3 y T6.
2. **«Guardar sin reportar» en un mixto con el dato ya copiado:** no lo borra; y la propagación no borra lo digitado.
   Tests en T9 y T11.
3. **La aplicación no se usa durante semanas:** la propagación que no corrió se pone al día sola en la siguiente pasada
   y antes del cierre, y ninguna medición se cierra con un valor copiado distinto del de su fuente. Tests en T11 y T16.
4. **Dos personas guardan la misma rejilla a la vez:** cada una conserva lo suyo. Test en T14.
5. **Una sede creada tarde o desactivada a mitad del periodo, y un periodo viejo reabierto:** la lista de la medición es
   la de su periodo, no la de hoy. Tests en T3 y T14.
6. **Quien ve el compuesto y no su componente:** tampoco lo lee en el Excel, el impreso, un evento ni un mensaje de
   error. Tests en T7 y T17.
7. **Dos aprobaciones a la vez que cerrarían un ciclo:** van una detrás de otra (un candado las pone en fila) y la segunda ve la ficha que aprobó la primera; un ciclo dentro de un mismo bloque se rechaza con un mensaje legible. Tests en T7.
8. **Reabrir en cascada con un dependiente retirado o de otra periodicidad:** no aborta; lo deja y lo dice. Test en T16.

---

### Task 1: Base de trabajo, el corte del ciclo de imports y su prueba estática

**Files:**
- Create: `src/db/consultas/indicadores/en-curso.ts`, `tests/indicadores-ciclos.test.ts`
- Modify: `src/db/consultas/indicadores/operacion.ts`, `publicacion.ts`, `constancias-soporte.ts`; `.gitignore` (`almacen-f14c/`); `CONTEXT.md` (Paso 0)

**Interfaces:**
- Produces:
  - `constancias-soporte.ts`: `quitarConstanciasSinSoporte(tx: TransactionSql, indicadorId: number): Promise<number>` (movida tal cual desde `operacion.ts`).
  - `en-curso.ts`: `enCurso` (hoy privada en `operacion.ts`; se exporta con su firma de hoy) y `recalcularPorSoporte(tx: TransactionSql, indicadorId: number, c: { ahora: Date; actorId: number; activado: boolean }): Promise<number>` (movida tal cual). Importa solo `./mediciones` y `@/lib`.
  - `publicacion.ts` deja de importar `./operacion`; `operacion.ts` importa de los dos módulos lo que usa.
  - `tests/indicadores-ciclos.test.ts`: lee el texto de cada `.ts` de `src/db/consultas/indicadores/`, arma el grafo de sus imports relativos (`from "./x"`) y exporta nada; es la prueba que las demás tareas mantienen en verde. Constantes del test: `EXCEPCIONES = [["mediciones", "alertas"]]` (par anterior a la 14B) y `LIVIANOS = ["en-curso", "constancias-soporte", "impactos", "fichas-de-calculo"]`, lista que T6, T11, T13 y T16 amplían.

- [ ] **Step 0: Base de trabajo aparte (lo hace el controlador).** `git worktree add F:/sgc-integral-f14c -b fase-14c-datos-desagregacion-compuestos main`; en el worktree, `npm ci`; copie `.env.example` a `.env.f14c`, cambie el nombre de la base por `sgc_f14c` en `DATABASE_URL` y `DATABASE_URL_MIGRADOR` y añada `ALMACEN_RUTA=./almacen-f14c`. **No cambie `BD_APP_CLAVE`** (el rol `sgc_app` es de todo el servidor de base de datos). Mueva al worktree el anexo y este plan (están sin seguimiento en `F:\sgc-integral\docs\superpowers\`). Copie a `<espacio>` los tres informes y `decisiones-usuario.md` de `F:\sgc-integral\.superpowers\sdd\2026-11-15-fase14c\`, las plantillas de `de-la-14b\` y las maquetas (`F:\sgc-integral\.superpowers\brainstorm\1472-1794754437\content\pantallas-14c.html`). Añada `almacen-f14c/` a `.gitignore`. Corrija en `CONTEXT.md` el punto de reanudación: el worktree `F:\sgc-integral-f14b` y la base `sgc_f14b` se borraron el 2026-11-15; la base `sgc` ya tiene las quince migraciones y los privilegios de la 14B; la 14C está en curso en este worktree. Cree `<espacio>/con-f14c.sh`:

```bash
#!/usr/bin/env bash
# Corre una orden en el worktree de la 14C con el entorno de su base aparte. Nunca toca la base `sgc`.
set -euo pipefail
cd /f/sgc-integral-f14c
set -a; . ./.env.f14c; set +a
case "$DATABASE_URL $DATABASE_URL_MIGRADOR" in *"/sgc_f14c "*"/sgc_f14c") ;; *) echo "El entorno no apunta a sgc_f14c" >&2; exit 1 ;; esac
exec "$@"
```

```bash
docker exec sgc-integral-bd-1 psql -U sgc -d postgres -c 'CREATE DATABASE sgc_f14c OWNER sgc'
bash <espacio>/con-f14c.sh npm run db:preparar && bash <espacio>/con-f14c.sh npm run db:seed && bash <espacio>/con-f14c.sh npm run admin:asegurar
bash <espacio>/con-f14c.sh env SEMILLA_RECIEN=1 npm test
```

  Expected: «Migraciones al día» con quince migraciones; la suite en verde. Anote la línea base (archivos y pruebas) en `<espacio>/progress.md`. Confirme: `docs(f14c): anexo del spec y plan de la 14C`.

- [ ] **Step 1: Write the failing test** `tests/indicadores-ciclos.test.ts` (sin base; molde de `tests/colores-fijos.test.ts`, que lee archivos):
  - `no hay ciclos de imports en src/db/consultas/indicadores`: recorre el grafo y falla con el camino del primer ciclo que no esté en `EXCEPCIONES`. Hoy debe fallar con `publicacion → operacion → aprobacion → publicacion`.
  - `los módulos livianos no importan lectura, fichas, aprobacion ni operacion`: por cada nombre de `LIVIANOS` que exista, ni directa ni transitivamente.

- [ ] **Step 2: Run** `npx vitest run tests/indicadores-ciclos.test.ts`. Expected: FAIL en el primer caso, con ese camino.

- [ ] **Step 3: Mueva las tres funciones** sin cambiar una línea de su cuerpo: `quitarConstanciasSinSoporte` a `constancias-soporte.ts`; `enCurso` y `recalcularPorSoporte` a `en-curso.ts`. `moverFechasLimite` se queda en `operacion.ts` y toma `enCurso` de allí. Ajuste los imports de `publicacion.ts` y `operacion.ts`.

- [ ] **Step 4: Run** `npx vitest run tests/indicadores-ciclos.test.ts` y `bash <espacio>/con-f14c.sh npx vitest run tests/indicadores-operacion.test.ts tests/indicadores-aprobacion.test.ts tests/indicadores-constancias.test.ts tests/indicadores-automaticos.test.ts`; `npm run lint`. Expected: PASS, sin avisos.

- [ ] **Step 5: Commit** `refactor(f14c): deshace el ciclo de imports de la publicación y lo vigila una prueba`.

---

### Task 2: La migración `0015`

**Files:**
- Create: `drizzle/0015_*.sql` (generada + SQL a mano) y su `meta`; `tests/esquema-fase14c.test.ts`
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts`, `src/db/semillas/minima.ts` (el `TRUNCATE`), `src/lib/indicadores/tipos.ts` (`TIPOS_EVENTO`), `AGENTS.md` (regla 5, piso 10 y el párrafo de migraciones: dieciséis, `drizzle/0000` a `drizzle/0015`)
- Test: `tests/esquema-fase14.test.ts` (el conteo de tablas; `:172`, que inserta un origen «indicador» sin referencia; `:212-213`, que inserta en `dimensiones` sin orden), `tests/privilegios-bd.test.ts`, `tests/semilla-minima.test.ts`

**Interfaces:**
- Produces (nombres exactos):
  - La `0015` empieza (SQL a mano) con un bloque que se detiene si `variables_compartidas`, `variable_responsables`, `variable_valores`, `dimensiones` o `dimension_categorias` tienen filas: `RAISE EXCEPTION 'Las tablas de la 14C tienen filas: la migración no las rehace'`.
  - `variables_compartidas`: `periodicidad`, `consolidacion` y `plazo_reporte_dias` pasan a `NOT NULL`; `creado_por integer →usuarios`, `creado_en timestamptz NOT NULL DEFAULT now()`; CHECK `variables_compartidas_periodicidad_valida` (`periodicidad IN ('mensual','bimestral','trimestral','semestral','anual')`), `variables_compartidas_consolidacion_valida` (`consolidacion IN ('suma','ultimo','promedio')`), `variables_compartidas_plazo_valido` (`plazo_reporte_dias BETWEEN 0 AND 90`); el único `variables_compartidas_unica` se sustituye por el índice único `variables_compartidas_nombre_idx` sobre `(proceso_id, lower(nombre))`.
  - `variable_responsables`: `designado_por integer →usuarios`, `designado_en timestamptz NOT NULL DEFAULT now()`; índice `variable_responsables_usuario_idx (usuario_id)`.
  - `variable_valores` (**una fila es un periodo del dato**; `categoria_id` queda sin uso y siempre nula, como `aviso_previo_en` en `reportes_externos`): `desde timestamptz NOT NULL`, `hasta timestamptz NOT NULL`, `vence_en` pasa a `NOT NULL`, `por_categoria jsonb` (`{"<categoriaId>": "<valor>"}`; con dimensión, `valor` guarda la suma), `categorias jsonb` (la lista del periodo, forma de T3), `corregido boolean NOT NULL DEFAULT false`, `reabierto_por integer →usuarios`, `reabierto_en timestamptz`, `reapertura_justificacion text`, `escalado_en timestamptz`, `creado_en timestamptz NOT NULL DEFAULT now()`; CHECK `variable_valores_estado_valido` (`estado IN ('pendiente','reportado','cerrado')`); CHECK `variable_valores_reportado_coherente` (`estado <> 'reportado' OR (valor IS NOT NULL AND reportado_en IS NOT NULL)`); índice `variable_valores_estado_vence_idx (estado, vence_en)`.
  - `variable_eventos(id, valor_id integer NOT NULL →variable_valores, tipo text NOT NULL, usuario_id integer →usuarios, detalle jsonb NOT NULL DEFAULT '{}', creado_en timestamptz NOT NULL DEFAULT now())`; CHECK `variable_eventos_tipo_valido` (`tipo IN ('reporte','correccion','soporte','cierre','reapertura')`); índice `variable_eventos_valor_idx (valor_id, creado_en)`; trigger `variable_eventos_inmutable` con `sgc_impedir_modificacion()`.
  - `dimensiones`: `orden integer NOT NULL`, `activo boolean NOT NULL DEFAULT true`; el `UNIQUE(nombre)` se sustituye por el índice único `dimensiones_nombre_idx` sobre `(lower(nombre))`.
  - `dimension_categorias`: `creado_en timestamptz NOT NULL DEFAULT now()`, `desactivada_en timestamptz`; índice único `dimension_categorias_nombre_idx` sobre `(dimension_id, lower(nombre))`.
  - `indicador_versiones`: `dimension_nombre text`; CHECK `indicador_versiones_dimension_manual` (`dimension_id IS NULL OR origen_dato = 'manual'`); CHECK `indicador_versiones_dimension_coherente` (`(dimension_id IS NULL) = (dimension_nombre IS NULL)`).
  - `indicador_variables`: `dato_periodicidad text`, `origen_codigo text`, `origen_nombre text`; CHECK `indicador_variables_origen_coherente` (`(origen = 'compartida') = (variable_compartida_id IS NOT NULL) AND (origen = 'indicador') = (indicador_origen_id IS NOT NULL) AND (origen = 'indicador') = (toma IS NOT NULL)`); índices `indicador_variables_dato_idx (variable_compartida_id)` e `indicador_variables_origen_idx (indicador_origen_id)`.
  - `medicion_valores`: `valor_exacto text` (fracción «n/d», como `mediciones.resultado_exacto`); índice `medicion_valores_categoria_idx (categoria_id)`. **El índice único con `NULLS NOT DISTINCT` no se toca:** revise que la migración generada no lo recree.
  - `mediciones`: `categorias jsonb` (la lista de la medición, forma de T3), `categorias_en_critico integer`.
  - `archivos_contexto_valido` admite además `'dato_compartido'`.
  - `medicion_eventos_tipo_valido` admite además `'propagacion'` y `'categorias'`; `TIPOS_EVENTO` gana `"propagacion"` y `"categorias"`.
  - `roles-bd.ts`: el `REVOKE UPDATE, DELETE` suma `variable_eventos`. El `TRUNCATE` de `minima.ts` gana `variable_eventos`.
  - Dos cosas de §8 del anexo que **no** se crean, a propósito: `variable_valores` no lleva fracción exacta (un dato se digita con cuatro decimales como máximo y su suma por categorías también cabe; la fracción que hace falta es la del valor juntado, y esa va en `medicion_valores.valor_exacto`); e `indicadores` no gana un dato derivado de «nadie lo mide» (T9 lo lee de las variables de cada versión, en el mismo JSON que ya alimenta a `queFalta`).

- [ ] **Step 1: Write the failing tests** en `tests/esquema-fase14c.test.ts` (patrón de `tests/esquema-fase14b.test.ts`: `postgres` propio, `revertida`, `fallaCon`):
  - las columnas nuevas existen con su tipo; `variable_eventos` está en `information_schema.tables`;
  - `INSERT` en `indicador_variables` con `origen = 'compartida'` y `variable_compartida_id` nulo → `23514`; con `origen = 'indicador'` e `indicador_origen_id` puesto y `toma` nula → `23514`; con `origen = 'propia'` e `indicador_origen_id` puesto → `23514`; una propia con los tres nulos entra;
  - una versión con `origen_dato = 'automatico'` y `dimension_id` puesto → `23514`; con `dimension_id` y `dimension_nombre` nulo → `23514`;
  - dos dimensiones «Sede» y «sede» → `23505` (`dimensiones_nombre_idx`); dos categorías «Norte» y «NORTE» en la misma dimensión → `23505`; en dimensiones distintas, entran;
  - dos datos «Total facturado» y «total facturado» en el mismo proceso → `23505`; un dato con `periodicidad = 'semanal'` → `23514`; con `plazo_reporte_dias = 91` → `23514`;
  - un periodo de dato con `estado = 'reportado'` y `valor` nulo → `23514`; con `estado = 'otro'` → `23514`;
  - `UPDATE` y `DELETE` sobre `variable_eventos` → rechazados por el trigger (también como dueño del esquema);
  - un archivo con `contexto = 'dato_compartido'` entra; un evento de medición con `tipo = 'propagacion'` entra;
  - `medicion_valores` conserva su unicidad con `NULLS NOT DISTINCT`: dos filas con la misma medición y variable y `categoria_id` nulo → `23505`.

- [ ] **Step 2: Run** por el guard. Expected: FAIL (columnas y tabla inexistentes).

- [ ] **Step 3: Cambie `src/db/esquema.ts`**, corra `bash <espacio>/con-f14c.sh npm run db:generate` y complete a mano: el bloque de guarda al principio, los índices con `lower()`, el trigger de `variable_eventos` y los `CHECK` que Drizzle no exprese. Actualice `roles-bd.ts`, `minima.ts` y `TIPOS_EVENTO`.

- [ ] **Step 4: Run** `bash <espacio>/con-f14c.sh npm run db:preparar` (Expected: «Migraciones al día», dieciséis) y los tests de la tarea, con `tests/esquema-fase14.test.ts` ajustado (el conteo, el `INSERT` de `:172` con su `toma` y los de `:212-213` con `orden`), `tests/privilegios-bd.test.ts` (suma `variable_eventos`) y `tests/semilla-minima.test.ts`. `npm run lint`. Expected: PASS.

- [ ] **Step 5: Actualice `AGENTS.md`** (regla 5 y piso 10: `variable_eventos`; migraciones: dieciséis). **Commit** `feat(f14c): migración 0015 con las tablas de datos compartidos, dimensiones y compuestos`.

---

### Task 3: Las reglas puras

**Files:**
- Create: `src/lib/indicadores/origen.ts`, `cumplimiento.ts`, `grafo.ts`, `categorias.ts`, `propagacion.ts`
- Modify: `src/lib/indicadores/acumulado.ts` (exporta `juntar`), `periodos.ts` (`clavesFinas`), `ficha.ts`, `tipos.ts`
- Test: `tests/indicadores-origen.test.ts`, `tests/indicadores-cumplimiento.test.ts`, `tests/indicadores-grafo.test.ts`, `tests/indicadores-categorias.test.ts`, `tests/indicadores-periodos.test.ts`, `tests/indicadores-acumulado.test.ts`, `tests/indicadores-ficha.test.ts`

**Interfaces:**
- Produces (todo sin Node ni base):
  - `tipos.ts`: `TOMAS = ["valor", "cumplimiento"] as const` y `type Toma`; `MOTIVO_COMPONENTE_NO_APLICA = "Un componente no aplicó en el periodo"`; `MOTIVO_NADA_QUE_MEDIR = "No hubo nada que medir en el periodo"`; `MOTIVO_DATO_SIN_CATEGORIA = "El dato no trae esta categoría"`; `MOTIVO_TODAS_NO_APLICAN = "Ninguna categoría aplicó en el periodo"`; `COMPONENTE_OCULTO = "Indicador restringido"`; `VALOR_OCULTO = "No disponible"`; `RESULTADO_OCULTO = "Resultado de un indicador restringido"`; `MAXIMO_NIVELES = 5`.
  - `origen.ts`:
    - `type VariableConOrigen = { letra: string; origen: OrigenVariable }`
    - `letrasPropias(vs: readonly VariableConOrigen[]): string[]`; `letrasAjenas(vs): string[]` (compartida o indicador)
    - `alguienMide(v: { origenDato: OrigenDato; variables: readonly VariableConOrigen[] }): boolean` — manual y con alguna propia
    - `faltaSegunOrigen(d: { mide: boolean; reportada: boolean; faltanAjenas: boolean; analisisCompleto: boolean }): "reporte" | "dato" | "analisis"` — `mide && !reportada` → `"reporte"`; si no, `faltanAjenas || !reportada` → `"dato"`; si no, `!analisisCompleto` → `"analisis"`; si no, `"reporte"` (el caso de hoy: solo falta el soporte)
  - `acumulado.ts`: `export function juntar(consolidacion: Consolidacion, valores: Fraccion[]): Fraccion` (la de hoy, exportada) y `juntadoONada(consolidacion: Consolidacion, valores: readonly (Fraccion | null)[]): Fraccion | null` — `null` si la lista está vacía o falta alguno
  - `periodos.ts`: `clavesFinas(gruesa: string, fina: Periodicidad): string[]` — las claves de `fina` que forman el periodo `gruesa`, en orden; lanza si `!contiene(periodicidadDe(gruesa), fina)`
  - `cumplimiento.ts`: `porcentajeDeCumplimiento(d: { resultado: Fraccion; cumple: boolean | null; meta: Fraccion | null; tendencia: Tendencia }): Fraccion | null` — número de 0 a 100; `null` si `cumple` es `null`
  - `grafo.ts`: `type Aristas = ReadonlyMap<number, readonly number[]>` (indicador → sus componentes); `caminoDeCiclo(aristas: Aristas, desde: number): number[] | null`; `nivelesBajo(aristas: Aristas, desde: number): number` (0 si no toma a nadie); `alcanza(aristas: Aristas, desde: number, destinos: ReadonlySet<number>): boolean`; `porNiveles(aristas: Aristas, fuentes: readonly number[]): number[][]` (con las mismas aristas directas, indicador → sus componentes: quienes toman a las fuentes, después quienes toman a esos, nivel a nivel, hasta `MAXIMO_NIVELES` y sin repetir)
  - `categorias.ts`:
    - `type CategoriaDeMedicion = { id: number; nombre: string; orden: number; noAplica: string | null }`
    - `listaDelPeriodo(maestro: readonly { id: number; nombre: string; orden: number; activo: boolean; creadoEn: Date; desactivadaEn: Date | null }[], periodo: { desde: Date; hasta: Date }): CategoriaDeMedicion[]` — creadas antes de `hasta` y activas o desactivadas después de `desde`; por `orden`; `noAplica: null`
    - `type EstadoDeFila = "completa" | "sin_casos" | "no_aplica" | "incompleta"`
    - `estadoDeFila(c: CategoriaDeMedicion, valores: Readonly<Record<string, Fraccion>>, calculo: FichaDeCalculo): EstadoDeFila` — `sin_casos` cuando están todas las letras y la fórmula divide por cero
    - `totalDeCategorias(filas: readonly { categoria: CategoriaDeMedicion; valores: Readonly<Record<string, Fraccion>> }[], calculo: FichaDeCalculo): { clase: "total"; valores: Record<string, Fraccion> } | { clase: "faltan"; categorias: string[] } | { clase: "ninguna_aplica" }`
    - `resultadoDeCategoria(valores, calculo: FichaDeCalculo, regla: Regla): { resultado: Fraccion | null; semaforo: Semaforo | null; cumple: boolean | null }` (usa `calcular`)
    - `errorDeDesagregacion(d: { forma: Forma; formula: string | null }): string | null` — `"Una fórmula con min, max o abs no se puede desagregar"` si la fórmula libre usa una de esas funciones (por el árbol de `analizar`, no por texto)
  - `propagacion.ts`: `laFuenteMueveElPlazo(d: { pedia: boolean; pide: boolean; venceEn: Date; ahora: Date; plazoDias: number; zona: string }): Date | null` — la fecha nueva (`fechaLimite` desde `ahora` con el mismo plazo) si `!pedia && pide` y (`venceEn <= ahora` o `plazoDias === 0`); si no, `null`
  - `ficha.ts`: `VariableDeFicha` gana `datoPeriodicidad: string | null`, `origenCodigo: string | null`, `origenNombre: string | null`; `ContenidoFicha` gana `dimensionNombre: string | null`. `huellaDeFicha` omite `dimensionNombre` si es nulo y, dentro de cada variable, las tres claves nuevas si son nulas. `ESTRUCTURA_DE_VARIABLE` gana `datoPeriodicidad`; `DETALLE_DE_VARIABLE`, `origenCodigo` y `origenNombre`; `DEPENDE_DE.dimensionNombre = "dimensionId"`; `ETIQUETAS.dimensionNombre = "Desagregación"`.

- [ ] **Step 1: Write the failing tests** (valores exactos):
  - **huella** (`tests/indicadores-ficha.test.ts`): el contenido de `:44` con los cuatro campos nuevos en `null` da **la misma huella fijada en `:212`**; con `dimensionNombre: "Sede"` o con `origenNombre: "X"` en una variable, otra distinta; cambiar solo `origenNombre` es cambio `"menor"`; cambiar `datoPeriodicidad`, `"mayor"`; cambiar `dimensionNombre` con el mismo `dimensionId`, `"menor"`.
  - **origen**: `alguienMide` es `false` para una automática y para una manual con `[compartida, indicador]`; `true` con `[propia, compartida]`. `faltaSegunOrigen`: `{mide: true, reportada: false, faltanAjenas: true}` → `"reporte"`; `{mide: true, reportada: true, faltanAjenas: true}` → `"dato"`; `{mide: false, reportada: false, faltanAjenas: true}` → `"dato"`; `{mide: true, reportada: true, faltanAjenas: false, analisisCompleto: false}` → `"analisis"`; todo completo → `"reporte"`.
  - **juntar**: `juntadoONada("promedio", [2, 2, 3])` es exactamente `7/3`; con un `null` en la lista, `null`; lista vacía, `null`; `"ultimo"` devuelve el tercero.
  - **periodos**: `clavesFinas("2026-T1", "mensual")` → `["2026-01","2026-02","2026-03"]`; `clavesFinas("2026", "trimestral")` → `["2026-T1","2026-T2","2026-T3","2026-T4"]`; `clavesFinas("2026-S2", "bimestral")` → `["2026-B4","2026-B5","2026-B6"]`; `clavesFinas("2026-03", "mensual")` → `["2026-03"]`; `clavesFinas("2026-T1", "bimestral")` lanza.
  - **cumplimiento** (fracciones exactas): cumple → `100`; ascendente, resultado `60`, meta `90`, no cumple → exactamente `200/3`; descendente, resultado `8`, meta `5` → `125/2`; descendente con meta `0` y resultado `2` → `0`; ascendente con meta `0` → `0`; ascendente con resultado negativo → `0`; constante que no cumple → `0`; ascendente con «Bien · no alcanza la meta» (resultado `88`, meta `90`, `cumple: false`) → `880/9`, nunca `100`; `cumple: null` → `null`.
  - **grafo**: `1→[2], 2→[3], 3→[1]` → `caminoDeCiclo(…, 1)` = `[1,2,3,1]`; sin ciclo, `null`; una cadena de seis da `nivelesBajo` = `5`; `porNiveles` de `{2:[1], 3:[2], 4:[1]}` (2 toma a 1, 3 toma a 2, 4 toma a 1) desde `[1]` → `[[2,4],[3]]`; `alcanza` a través de dos saltos es `true`.
  - **categorías**: maestro con una creada el 20 de abril, una desactivada el 15 de febrero y una desactivada el 20 de diciembre anterior, periodo enero–marzo → entra la segunda, no la primera ni la tercera; el orden es el del maestro. `estadoDeFila` con `A=0, B=0` y la forma porcentaje → `"sin_casos"`; con `noAplica: "Cerrado por obras"` → `"no_aplica"`; con una letra sin valor → `"incompleta"`. `totalDeCategorias` con las seis filas de la maqueta 9 → `A=275, B=320`; con una incompleta → `faltan` con su nombre; con todas en «No aplica» → `ninguna_aplica`. `errorDeDesagregacion` con `max(A - B; 0)` → el mensaje; con `A / B * 100` → `null`.
  - **plazo**: `laFuenteMueveElPlazo` con `pedia: false, pide: true` y `venceEn` ayer → una fecha posterior a `ahora`; con `pedia: true` → `null`; con `venceEn` en el futuro y plazo 10 → `null`; con plazo 0 → fecha.

- [ ] **Step 2: Run** `npx vitest run tests/indicadores-origen.test.ts tests/indicadores-cumplimiento.test.ts tests/indicadores-grafo.test.ts tests/indicadores-categorias.test.ts tests/indicadores-periodos.test.ts tests/indicadores-acumulado.test.ts tests/indicadores-ficha.test.ts`. Expected: FAIL (módulos y funciones inexistentes).

- [ ] **Step 3: Implemente** los módulos. `porcentajeDeCumplimiento` trabaja con `Fraccion` (`dividir`, `multiplicar`) y acota comparando fracciones, sin pasar por `number`.

- [ ] **Step 4: Run** los mismos tests y `npm run lint`. Expected: PASS. La huella fijada de `:212` no se toca.

- [ ] **Step 5: Commit** `feat(f14c): reglas puras de origen, cumplimiento, grafo, categorías y huella`.

---

### Task 4: El catálogo de datos compartidos, en el servidor

**Files:**
- Create: `src/db/consultas/indicadores/datos.ts`, `src/lib/esquemas/indicadores-datos.ts`, `tests/indicadores-datos.test.ts`
- Modify: `src/lib/alcance.ts`, `src/app/admin/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`, `src/lib/esquemas/indicadores.ts` (`CODIGOS_RESERVADOS` gana `"datos"`, y el mensaje que los enumera a mano sale de la constante), `tests/utiles/indicadores.ts`

**Interfaces:**
- Consumes: T2 (tablas).
- Produces:
  - `indicadores-datos.ts`: `EsquemaDato` (`.strict()`): `procesoId`, `nombre` (1 a 150), `descripcion` (hasta 500), `fuente` (hasta 300), `unidad` (hasta 40), `periodicidad`, `consolidacion`, `capturaMin`, `capturaMax`, `admiteNegativos`, `plazoReporteDias` (0 a 90), `dimensionId` opcional; `EsquemaResponsablesDeDato` (`usuarioIds`, hasta 20, sin repetidos).
  - `datos.ts`:
    - `type DatoCompartido = { id: number; procesoId: number; proceso: string; nombre: string; descripcion: string | null; fuente: string | null; unidad: string | null; periodicidad: Periodicidad; consolidacion: Consolidacion; capturaMin: string | null; capturaMax: string | null; admiteNegativos: boolean; plazoReporteDias: number; dimensionId: number | null; dimension: string | null; activa: boolean; citado: boolean; responsables: { id: number; nombre: string; activo: boolean }[] }` (`citado`: alguna versión aprobada lo cita)
    - `guardarDato(sesion: SesionFlujo, d: z.infer<typeof EsquemaDato> & { id?: number }, opciones?: Opciones): Promise<{ id: number }>`
    - `designarResponsablesDeDato(sesion: SesionFlujo, d: { datoId: number; usuarioIds: number[] }, opciones?: Opciones): Promise<void>`
    - `cambiarEstadoDeDato(sesion: SesionFlujo, d: { datoId: number; activa: boolean }, opciones?: Opciones): Promise<void>`
    - `borrarDato(sesion: SesionFlujo, datoId: number, opciones?: Opciones): Promise<void>`
    - `listarDatos(sesion: SujetoVisibilidad, opciones?: { sql?: Cliente; soloActivos?: boolean }): Promise<DatoCompartido[]>` (solo los que la persona ve)
    - `datoPorId(sesion: SujetoVisibilidad, datoId: number, opciones?: { sql?: Cliente }): Promise<DatoCompartido | null>`
    - `datosParaFicha(sql: Cliente): Promise<{ id: number; nombre: string; proceso: string; periodicidad: Periodicidad; consolidacion: Consolidacion; dimensionId: number | null; dimension: string | null }[]>` (activos, para el formulario de la ficha, que es de quien administra)
  - `alcance.ts`: `filtroDatos(sql: Cliente, sujeto: SujetoVisibilidad)` para un `WHERE` sobre `variables_compartidas d` (quien tiene `indicadores.administrar`, `ROLES_VEN_RESTRINGIDO`, líder activo del proceso dueño, o responsable del dato); `puedeVerDato(datoId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>`; `puedeReportarDato(datoId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<Capacidad>` (responsable activo o líder del proceso dueño → `{ puede: true, sinMedidor: false }`; `admin_sgc` solo si no hay ninguno de los dos activo → `{ puede: true, sinMedidor: true }`); `responsablesDeDato(sql: Cliente, datoId: number): Promise<number[]>` (responsables activos; si no hay, líderes activos del proceso dueño; si no hay, los Admin SGC activos).
  - Mensajes: `"Ya hay un dato con ese nombre en ese proceso"`; `"Este dato ya lo cita una ficha aprobada: su periodicidad, cómo se junta y su dimensión no se pueden cambiar. Cree otro dato"`; `"Lo usa un indicador activo: cambie antes su ficha"` (al desactivar: lo cita una ficha vigente de un indicador activo, o la versión que rige una medición sin cerrar); `"Este dato ya tiene historia: desactívelo"` (al borrar uno citado o con periodos); `"Elija una dimensión activa"`.
  - Bitácora (nombres literales): `dato_compartido_guardado`, `dato_compartido_responsables`, `dato_compartido_activado`, `dato_compartido_desactivado`, `dato_compartido_borrado`.
  - Acciones en `src/app/admin/acciones-indicadores.ts`, todas con `mutacion(formData, "indicadores.administrar", …)`: `guardarDatoCompartido`, `designarResponsablesDelDato`, `cambiarEstadoDelDato`, `borrarDatoCompartido`.
  - `tests/utiles/indicadores.ts`: `datoDePrueba(tx: TransactionSql, d: { procesoId: number; nombre?: string; periodicidad?: Periodicidad; consolidacion?: Consolidacion; dimensionId?: number; plazoReporteDias?: number; responsables?: number[] }): Promise<number>` (inserta por SQL; lo usan T6 en adelante).

- [ ] **Step 1: Write the failing tests** (`tests/indicadores-datos.test.ts`, en `revertida`):
  - `guardarDato` sin `indicadores.administrar` lanza; crea con el plazo dado; un segundo «TOTAL FACTURADO» en el mismo proceso → `"Ya hay un dato con ese nombre en ese proceso"`; en otro proceso, entra;
  - con una versión **aprobada** que lo cita (insértela con `indicadorDePrueba` y un `UPDATE` de sus variables antes de aprobar, o por SQL en la transacción): cambiar la periodicidad, «cómo se junta» o la dimensión → el mensaje de «ya lo cita»; cambiar nombre, fuente, límites y plazo, sí; con solo un **borrador** que lo cita, todo se puede cambiar;
  - `cambiarEstadoDeDato` a inactivo con un indicador activo cuya vigente lo cita → `"Lo usa un indicador activo: cambie antes su ficha"`; sin ninguno, pasa y queda la entrada de bitácora;
  - `borrarDato` de uno citado → `"Este dato ya tiene historia: desactívelo"`; de uno nuevo, lo borra;
  - `puedeReportarDato`: responsable → `puede`; líder del proceso dueño → `puede`; un Admin SGC con responsable activo → no puede; el mismo sin responsable ni líder activo → `{ puede: true, sinMedidor: true }`; un usuario cualquiera → no;
  - `listarDatos` para un usuario de consulta que no es responsable → vacío; `datoPorId` → `null`; para Gerencia → lo ve.

- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente** `datos.ts`, las funciones de `alcance.ts`, las acciones y las frases de bitácora. `guardarDato` toma la fila `FOR UPDATE` al editar y comprueba «citado» dentro de la transacción.
- [ ] **Step 4: Run** `tests/indicadores-datos.test.ts`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts`, `tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): catálogo de datos compartidos con sus responsables`.

---

### Task 5: El maestro de dimensiones

**Files:**
- Create: `src/db/consultas/indicadores/dimensiones.ts`, `src/componentes/indicadores/admin/TablaDimensiones.tsx`, `tests/indicadores-dimensiones.test.ts`
- Modify: `src/lib/esquemas/indicadores-maestros.ts`, `src/app/admin/acciones-indicadores.ts`, `src/app/(app)/admin/(panel)/indicadores/page.tsx`, `src/lib/bitacora-detalle.ts`, `tests/utiles/indicadores.ts`

**Interfaces:**
- Consumes: T2.
- Produces:
  - `type Categoria = { id: number; dimensionId: number; nombre: string; orden: number; activo: boolean; usada: boolean }`; `type Dimension = { id: number; nombre: string; orden: number; activo: boolean; usada: boolean; categorias: Categoria[] }` (`usada` de una dimensión: alguna versión o algún dato la cita; de una categoría: algún `medicion_valores.categoria_id`, o aparece en `mediciones.categorias` o en `variable_valores.categorias`)
  - `listarDimensiones(opciones?: { sql?: Cliente; soloActivas?: boolean }): Promise<Dimension[]>`
  - `guardarDimension(sesion: SesionFlujo, d: { id?: number; nombre: string }, opciones?: Opciones): Promise<{ id: number }>`
  - `guardarCategoria(sesion: SesionFlujo, d: { id?: number; dimensionId: number; nombre: string }, opciones?: Opciones): Promise<{ id: number }>` (una nueva queda al final)
  - `moverCategoria(sesion: SesionFlujo, d: { id: number; sentido: "arriba" | "abajo" }, opciones?: Opciones): Promise<void>` (intercambia el `orden` con la vecina)
  - `cambiarEstadoDeDimension(sesion, d: { id: number; activo: boolean }, opciones?)`; `cambiarEstadoDeCategoria(sesion, d: { id: number; activo: boolean }, opciones?)` (al desactivar pone `desactivada_en = ahora`; al activar la deja en nulo)
  - `borrarDimension(sesion, id, opciones?)`; `borrarCategoria(sesion, id, opciones?)`
  - `maestroDeCategorias(sql: Cliente, dimensionId: number): Promise<{ id: number; nombre: string; orden: number; activo: boolean; creadoEn: Date; desactivadaEn: Date | null }[]>` (la entrada de `listaDelPeriodo`; lo usan T10 y T14)
  - Mensajes: `"Ya hay una dimensión con ese nombre"`; `"Ya hay una categoría con ese nombre en esta dimensión"`; `"Ya se usó: desactívela"`; `"Esta dimensión la usa una ficha vigente: no puede quedar sin categorías activas"`.
  - Bitácora (literales): `dimension_guardada`, `dimension_activada`, `dimension_desactivada`, `dimension_borrada`, `categoria_guardada`, `categoria_movida`, `categoria_activada`, `categoria_desactivada`, `categoria_borrada`.
  - Acciones con `mutacion(formData, "indicadores.administrar", …)`: `guardarDimensionDeIndicadores`, `guardarCategoriaDeDimension`, `moverCategoriaDeDimension`, `cambiarEstadoDeDimensionDeIndicadores`, `cambiarEstadoDeCategoriaDeDimension`, `borrarDimensionDeIndicadores`, `borrarCategoriaDeDimension`.
  - `tests/utiles/indicadores.ts`: `dimensionDePrueba(tx: TransactionSql, nombre: string, categorias: string[]): Promise<{ id: number; categorias: number[] }>` (por SQL; `creado_en` un año atrás, para que entren a cualquier periodo de prueba).

- [ ] **Step 1: Write the failing tests** (`tests/indicadores-dimensiones.test.ts`, en `revertida`): crear «Sede» y cuatro categorías: salen en el orden de creación; «SEDE» otra vez → su mensaje; «norte» repetida en la misma dimensión → su mensaje; `moverCategoria` la tercera `"arriba"` la deja segunda, y la primera `"arriba"` no cambia nada; desactivar una categoría pone `desactivada_en` y activarla lo quita; desactivar la última activa de una dimensión que usa una ficha vigente → su mensaje; borrar una categoría que aparece en `mediciones.categorias` → `"Ya se usó: desactívela"`; borrar una dimensión sin uso borra también sus categorías; sin `indicadores.administrar`, todas lanzan; cada acción deja su entrada de bitácora con el nombre.

- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente** `dimensiones.ts` (candado de tabla como en `maestros.ts` al crear y al mover), las acciones, las frases y `TablaDimensiones` en la página de Configuración de indicadores: una tabla de dimensiones y, anidada en cada una, sus categorías con «Subir», «Bajar», «Desactivar» y «Borrar» (botones con texto, no solo ícono; navegable por teclado; a 390 px las categorías pasan a lista).
- [ ] **Step 4: Run** `tests/indicadores-dimensiones.test.ts tests/acciones-permisos.test.ts tests/bitacora-detalle.test.ts tests/colores-fijos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): maestro de dimensiones y categorías`.

---

### Task 6: La ficha en el servidor: el origen de cada variable y la desagregación

**Files:**
- Create: `src/db/consultas/indicadores/componentes.ts`, `tests/indicadores-ficha-origenes.test.ts`
- Modify: `src/lib/esquemas/indicadores.ts`, `src/db/consultas/indicadores/fichas.ts`, `operacion.ts` (`duplicar`), `src/lib/indicadores/tipos.ts` (`OpcionesFicha`), `tests/indicadores-ciclos.test.ts` (`LIVIANOS` gana `"componentes"`)

**Interfaces:**
- Consumes: T3 (`grafo.ts`, `categorias.ts`, `ficha.ts`), T4 (`datosParaFicha`), T5 (`listarDimensiones`).
- Produces:
  - `EsquemaVariable` gana `origen: z.enum(["propia", "compartida", "indicador"]).default("propia")`, `datoId` (id opcional), `indicadorOrigenId` (id opcional) y `toma: z.enum(TOMAS).optional()`. `EsquemaFicha` gana `dimensionId` (id opcional). Los dos siguen `.strict()`.
  - `componentes.ts` (liviano):
    - `aristasDeComponentes(sql: Cliente, opciones?: { sustituir?: ReadonlyMap<number, readonly number[]> }): Promise<Map<number, number[]>>` — por cada indicador activo, los `indicador_origen_id` de su ficha vigente; `sustituir` reemplaza los de los indicadores que trae (el borrador que se guarda, o las fichas del bloque que se aprueba)
    - `fichasDeObjetivosCumplidos(sql: Cliente): Promise<Map<number, "calidad" | "institucional" | "todos">>` — indicadores activos cuyo cálculo vigente es `objetivos_cumplidos`, con su alcance
    - `type FichaConOrigenes = { indicadorId: number | null; periodicidad: Periodicidad; restringido: boolean; automatica: boolean; objetivoClase: "calidad" | "institucional" | null; dimensionId: number | null; conFuncionesNoSumables: boolean; variables: { letra: string; origen: OrigenVariable; datoId: number | null; indicadorOrigenId: number | null; toma: Toma | null; citaNueva: boolean }[] }`
    - `revisarOrigenes(tx: Cliente, f: FichaConOrigenes, opciones?: { sustituir?: ReadonlyMap<number, readonly number[]> }): Promise<string | null>` — el primer rechazo de la lista de abajo que aplique, o `null`. Es **una sola función** para guardar (aquí), enviar y aprobar (T7): lee el dato, el componente y la dimensión por SQL directo
    - `origenesDeVersion(tx: Cliente, versionId: number): Promise<FichaConOrigenes>` — lo mismo, leído de una versión guardada (`citaNueva` se decide contra la vigente del indicador)
  - Lo que hace el servidor al guardar (`revisar`, `conOrigen`, `revisarContraLaBase`, `columnasDeContenido`, `escribirHijos`):
    - **Dato compartido:** copia del catálogo a la fila de la variable `nombre`, `descripcion`, `fuente`, `unidad`, `consolidacion`, `captura_min`, `captura_max`, `admite_negativos` y `dato_periodicidad`; lo que mande el formulario para esos campos se ignora.
    - **Resultado de otro indicador:** escribe `indicador_origen_id`, `toma`, `origen_codigo` (el código del componente) y `origen_nombre` (el nombre de su ficha vigente); `consolidacion` queda `'ultimo'` (no se usa: T17).
    - **Desagregación:** escribe `dimension_id` y `dimension_nombre` siempre, también a nulo (hoy el `UPDATE` no los nombra y no se podría quitar).
    - Una ficha manual sin variables propias no exige cargo de medir.
  - Rechazos (mensajes exactos; `{L}` es la letra):
    - `"Elija un dato compartido activo para la variable {L}"` (sin dato, inexistente, o inactivo en una cita **nueva**; la que la vigente ya traía vale)
    - `"El dato «{nombre}» es {periodicidad}: el indicador debe medirse con esa periodicidad o con una que la contenga"`
    - `"Elija el indicador del que sale la variable {L} y qué se toma de él"`
    - `"El indicador de la variable {L} debe estar activo y tener ficha vigente"` (solo citas nuevas)
    - `"Un indicador no puede tomar su propio resultado"`
    - `"El indicador de la variable {L} se mide con una periodicidad más gruesa que la de esta ficha"`
    - `"No se puede tomar el cumplimiento de un indicador sin meta (variable {L})"`
    - `"Esta ficha toma un indicador restringido: debe ser restringida"`
    - `"Esta ficha cerraría un ciclo entre indicadores"`
    - `"Un indicador compuesto admite hasta cinco niveles"`
    - `"Esta ficha toma «Objetivos cumplidos»: no puede apuntar a un objetivo de esa misma clase"` (directamente o a través de otros compuestos: `alcanza`)
    - `"Un indicador que calcula el sistema no se desagrega"`; `"Un indicador desagregado no puede tomar el resultado de otro indicador"`; `"El dato «{nombre}» no está desagregado por {dimensión}"`; `"El dato «{nombre}» está desagregado por {dimensión}: desagregue el indicador por ella"`; `"Elija una dimensión activa"` (cita nueva); y el de `errorDeDesagregacion`.
  - `contenidoDeVersion` devuelve los campos nuevos (de las columnas de la versión, nunca del catálogo); `CONTENIDO` gana `dimension_nombre`; `COLUMNAS_VARIABLE`, las tres columnas nuevas; `valoresDeVersion` devuelve por variable `origen`, `datoId`, `indicadorOrigenId`, `toma`, y `dimensionId`.
  - `OpcionesFicha` gana `datos` (de `datosParaFicha`), `tomables: { id: number; codigo: string; nombre: string; periodicidad: Periodicidad; conMeta: boolean; restringido: boolean }[]` (activos con ficha vigente, sin el propio) y `dimensiones: { id: number; nombre: string }[]` (activas).
  - `duplicar` [anexo §6.7]: en la copia toda variable queda `'propia'`, con `variable_compartida_id`, `indicador_origen_id`, `toma`, `dato_periodicidad`, `origen_codigo` y `origen_nombre` en nulo, y conserva nombre, descripción y unidad; la dimensión se conserva si sigue activa y, si no, queda en nulo.

- [ ] **Step 1: Write the failing tests** (`tests/indicadores-ficha-origenes.test.ts`, en `revertida`, con `indicadorDePrueba`, `datoDePrueba` y `dimensionDePrueba`):
  - **ida y vuelta:** guardar un borrador con A propia, B dato compartido y C resultado de otro indicador (`toma: "cumplimiento"`) y leerlo con `fichaParaEditar` devuelve los tres orígenes y sus referencias; **guardarlo otra vez sin cambios no lo devuelve a «propia»**;
  - el dato manda: el formulario envía otro nombre y otra `consolidacion` para B y la fila queda con los del catálogo y con `dato_periodicidad`;
  - C queda con `origen_codigo` y `origen_nombre` del componente; renombrar el componente después no cambia `contenidoDeVersion` de la versión ya guardada;
  - cada rechazo de la lista de arriba, con su mensaje exacto: dato trimestral en ficha mensual; componente retirado en una cita nueva; a sí mismo; componente trimestral en ficha mensual; cumplimiento de uno sin meta; componente restringido en ficha general; ciclo (A toma B con la vigente de B tomando A); seis niveles; `objetivos_cumplidos` de calidad tomado a través de otro compuesto por una ficha cuyo objetivo es de calidad; dimensión en una automática; dimensión con una variable «indicador»; dato sin esa dimensión; dato con dimensión en ficha sin ella; fórmula `max(A - B; 0)` con dimensión;
  - **una cita vieja sigue valiendo:** se aprueba una ficha con un dato, se desactiva el dato (por SQL), se abre un cambio y se guarda sin tocar esa variable: pasa; cambiarla a **otro** dato inactivo, no;
  - una ficha manual con todas sus variables ajenas se guarda sin cargo de medir;
  - quitar la dimensión de un borrador que la tenía deja `dimension_id` y `dimension_nombre` en nulo;
  - **la huella de lo viejo:** `huellaDeFicha(await contenidoDeVersion(sql, id))` de una versión aprobada creada con `indicadorDePrueba` (sin nada de la 14C) es la que tiene guardada en `huella`;
  - `abrirCambio` sobre un compuesto aprobado copia orígenes y firmados, y su primer `guardarBorrador` sin cambios da `tipoDeCambio` «ninguno»;
  - `duplicar` un compuesto con un dato: la copia tiene tres variables `'propia'` con sus nombres y ninguna referencia;
  - `opcionesDeFicha` trae `datos`, `tomables` (sin el propio indicador, sin borradores) y `dimensiones`.

- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** `revisarContraLaBase` toma el dato y el componente `FOR KEY SHARE`, como hace con las normas, y llama `revisarOrigenes(tx, ficha, { sustituir: new Map([[indicadorId, componentesDelBorrador]]) })`, que arma el grafo con `aristasDeComponentes`. Los mensajes que nombran un componente o un dato solo los ve quien administra (el único que guarda fichas), así que aquí llevan nombre.
- [ ] **Step 4: Run** `tests/indicadores-ficha-origenes.test.ts tests/indicadores-fichas.test.ts tests/indicadores-ficha.test.ts tests/indicadores-operacion.test.ts tests/indicadores-importacion.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): la ficha guarda el origen de cada variable y su desagregación`.

---

### Task 7: Enviar, aprobar y lo que se bloquea

**Files:**
- Create: `tests/indicadores-compuestos-ficha.test.ts`
- Modify: `src/db/consultas/indicadores/componentes.ts`, `aprobacion.ts`, `publicacion.ts`, `operacion.ts` (`retirar`, `cambiarOperacion`), `importacion.ts` (`revisarDeshacer`, `IMPIDE`); `src/lib/alcance.ts` (`aprobadoresDeFicha`)
- Test: `tests/indicadores-aprobacion.test.ts`, `tests/indicadores-operacion.test.ts`, `tests/indicadores-importacion.test.ts`, `tests/indicadores-alcance.test.ts`

**Interfaces:**
- Consumes: T6 (`revisarOrigenes`, `origenesDeVersion`, `aristasDeComponentes`).
- Produces:
  - `componentes.ts`:
    - `type Toman = { indicadorId: number; codigo: string; toma: Toma; periodicidad: Periodicidad; restringido: boolean; enBorrador: boolean }`
    - `quienesToman(sql: Cliente, indicadorId: number, opciones?: { conBorradores?: boolean }): Promise<Toman[]>` — indicadores activos cuya ficha vigente lo cita, o con una medición sin cerrar regida por una versión que lo cita; con `conBorradores`, también los que lo citan en un borrador o una ficha por aprobar (`enBorrador: true`)
    - `cambieAntes(sujeto: SujetoVisibilidad, toman: readonly Toman[], opciones: { sql: Cliente }): Promise<string>` — `"Cambie antes el indicador que lo usa: {código}"` con el primero que la persona puede ver (`puedeVerIndicador`); si no ve ninguno, `"Cambie antes el indicador que lo usa"`
    - `componentesRestringidos(sql: Cliente, versionId: number): Promise<number[]>`
  - `aprobadoresDeFicha(versionId)` [anexo §6.1, decisión 8.1]: si `componentesRestringidos` no está vacío, devuelve los usuarios activos de Gerencia distintos de quien elaboró, sea cual sea `aprueba`. Lo demás, como hoy.
  - `validarEnvio` y `validarAprobacion` llaman `revisarOrigenes` sobre `origenesDeVersion` (un componente pudo retirarse, perder la meta o volverse restringido desde que se guardó) y, del lado del componente, rechazan con `cambieAntes` una versión que: no tiene meta y alguien toma su cumplimiento; o tiene una periodicidad que algún compuesto ya no contiene.
  - `aprobarFichas` arma el grafo con las fichas del bloque en lugar de las vigentes de sus indicadores (`sustituir`); un ciclo dentro del bloque → `"Esta aprobación cerraría un ciclo entre indicadores"`. La transacción que publica (también la del cambio menor en `enviarAAprobacion`) empieza con `SELECT pg_advisory_xact_lock(hashtext('sgc.indicadores.compuestos'))`: dos aprobaciones a la vez no pueden cerrar un ciclo.
  - `alPublicarVersion`: la rama que quita los designados «mide» y apaga el soporte obligatorio corre también para una versión manual **sin variables propias**. `Publicado` no cambia de forma.
  - Enviar una ficha sin variables propias no exige la prueba con valores.
  - `retirar`: con `quienesToman` no vacío → `cambieAntes`.
  - `cambiarOperacion`: pasar a `restringido` un indicador que toma algún compuesto general → `cambieAntes`; pasar a `general` uno con `componentesRestringidos` en su vigente → `"Este indicador toma un indicador restringido: no puede ser general"`.
  - `revisarDeshacer` y `condicionDeDeshacer`: motivo nuevo en `IMPIDE`, `"otra ficha toma el resultado de una ficha del lote"`, también si quien la toma es un borrador (`conBorradores`).

- [ ] **Step 1: Write the failing tests** (en `revertida`):
  - **aprobadores:** un compuesto operativo con un componente restringido → `aprobadoresDeFicha` son los de Gerencia y no el líder del proceso; el mismo con el componente general → el líder; si el componente pasa a restringido **después de enviar**, la lista cambia a Gerencia sin reenviar; el líder ya no puede aprobarla (`puedeAprobarFicha` es `false`).
  - **entre guardar y aprobar:** se guarda y se envía un compuesto; se retira el componente por SQL; `aprobarFichas` lanza `"El indicador de la variable A debe estar activo y tener ficha vigente"`.
  - **bloque:** dos fichas por aprobar, A toma B y B toma A, cada una válida contra la vigente de la otra → `"Esta aprobación cerraría un ciclo entre indicadores"` y ninguna queda aprobada.
  - **a la vez** (sin confirmar nada: `AGENTS.md` no deja fichas aprobadas fuera de una transacción revertida): con la transacción de `aprobarFichas` abierta dentro de `revertida`, una **segunda conexión** que pide `SELECT pg_try_advisory_xact_lock(hashtext('sgc.indicadores.compuestos'))` recibe `false`; al revertirse la primera, recibe `true`. Y el cambio menor de `enviarAAprobacion` toma el mismo candado. El ciclo en sí lo prueba el caso del bloque.
  - **del lado del componente:** un cambio mayor que le quita la meta a un indicador cuyo cumplimiento toma otro → `"Cambie antes el indicador que lo usa: {código}"` para quien administra; aprobado por un líder que no ve el compuesto (restringido, de otro proceso) → `"Cambie antes el indicador que lo usa"`, **sin código**. Un cambio mayor de mensual a trimestral en el componente de un compuesto mensual → lo mismo.
  - **nadie mide:** al aprobar un compuesto sin variables propias se quitan sus designados «mide», se apaga `soporte_obligatorio` y queda la entrada `indicador_medidores_quitados`; enviarlo no pide la prueba.
  - **retirar** un componente → el mensaje; retirar el compuesto primero y después el componente → pasa.
  - **nivel de acceso:** restringir un componente de un compuesto general → el mensaje; abrir un compuesto con componente restringido → `"Este indicador toma un indicador restringido: no puede ser general"`.
  - **deshacer un lote:** con un borrador que toma una ficha del lote → `revisarDeshacer` trae el motivo nuevo y `deshacerImportacion` no lanza un `23503`.

- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** Las validaciones van en el validador de solo lectura y se repiten dentro de la transacción, como manda F13A-R4.
- [ ] **Step 4: Run** los tests de la tarea y `tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): aprobación, bloqueos y aprobador de un indicador compuesto`.

---

### Task 8: El formulario de la ficha y la ficha técnica

**Files:**
- Create: `src/componentes/indicadores/ficha/OrigenDeVariable.tsx`, `src/componentes/indicadores/ficha/CampoDesagregacion.tsx`
- Modify: `src/componentes/indicadores/ficha/FormularioFicha.tsx`, `src/lib/indicadores/ficha-en-texto.ts`, la vista de «Por aprobar» y la de la ficha (donde hoy se pinta `origenEnTexto`), `src/lib/indicadores/tipos.ts`
- Test: `tests/indicadores-formulario.test.tsx`, `tests/indicadores-textos.test.ts`, `tests/indicadores-impresion.test.tsx`

**Interfaces:**
- Consumes: T6 (`OpcionesFicha.datos`, `.tomables`, `.dimensiones`; los campos de `EsquemaVariable` y `EsquemaFicha`).
- Produces:
  - `tipos.ts`: `NADIE_MIDE_AJENO = "Nadie: sus datos llegan de otras fuentes"`; `AVISO_DESAGREGACION = "El total se calcula sumando cada variable entre las categorías. Desagregue solo indicadores cuyas variables sean cantidades que se suman (casos, pacientes, pesos)"`; `avisoDeDeduccion = (nombre: string) => \`Quien vea este indicador podrá deducir el resultado de «${nombre}» si es el único componente que no puede ver\``.
  - `ficha-en-texto.ts`: `origenDeVariableEnTexto(v: VariableDeFicha): string | null` — propia → `null`; dato → `"Dato compartido · {Mensual…} · {se suma | último valor | promedio}"`; componente → `"Resultado de {código} {nombre}: su valor"` o `": su porcentaje de cumplimiento"`. `camposDeFicha` gana el campo «Desagregación» con `"Por {dimensionNombre}"` cuando hay dimensión.
  - En el formulario, por variable: un grupo de opciones «Propia», «Dato compartido», «Resultado de otro indicador» (por omisión «Propia»). Con dato: una lista de `datos` («{nombre} · {proceso} · {periodicidad}») y, en solo lectura, el nombre, la unidad y «cómo se junta» que vienen del catálogo. Con componente: la lista de `tomables` («{código} {nombre}») y «Su valor» / «Su porcentaje de cumplimiento»; «cómo se junta» no se muestra. En «Más opciones», «Desagregación» (ninguna o una de `dimensiones`) con `AVISO_DESAGREGACION` debajo.
  - Sin variables propias, donde iría el cargo que mide se lee `NADIE_MIDE_AJENO` y no se pide la prueba.
  - Con un componente restringido elegido, el formulario y la pantalla de aprobación muestran `avisoDeDeduccion(nombre)` (una `Insignia` de atención con texto, no solo color).

- [ ] **Step 1: Write the failing tests:** el formulario pinta los tres orígenes y, al elegir «Dato compartido», el nombre queda de solo lectura y sale la lista de datos; al elegir «Resultado de otro indicador» desaparece «cómo se junta»; con todas las variables ajenas se lee `NADIE_MIDE_AJENO`; con una dimensión elegida se lee `AVISO_DESAGREGACION`; con un tomable `restringido: true` elegido sale el aviso de deducción con su nombre. `origenDeVariableEnTexto` devuelve los tres textos exactos de arriba. La ficha impresa de un desagregado trae «Desagregación: Por Sede».
- [ ] **Step 2: Run** `npx vitest run tests/indicadores-formulario.test.tsx tests/indicadores-textos.test.ts tests/indicadores-impresion.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implemente** con los componentes de `src/componentes/ui` (`Campo`, `Insignia`, `Boton`); el grupo de opciones es un `fieldset` con su `legend` y se recorre con el teclado.
- [ ] **Step 4: Run** los mismos tests, `tests/colores-fijos.test.ts` y `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): el formulario de la ficha elige el origen de cada variable y la desagregación`.

**Punto de control del controlador:** crear en el navegador un mixto, un compuesto con un componente restringido y un desagregado; enviarlos y aprobarlos (claro, oscuro y 390 px).

---

### Task 9: La medición, variable por variable

**Files:**
- Create: `tests/indicadores-medicion-mixta.test.ts`
- Modify: `src/db/consultas/indicadores/mediciones.ts`, `tareas.ts`, `lectura.ts`, `lista.ts`, `soportes.ts`, `historicos.ts`, `calculos.ts`; `src/componentes/indicadores/medicion/FormularioReporte.tsx`, `DatosDelSistema.tsx`; `src/app/(app)/indicadores/[codigo]/reportar/[periodo]/page.tsx`
- Test: `tests/indicadores-tareas.test.ts`, `tests/indicadores-mediciones.test.ts`, `tests/indicadores-calculos-bd.test.ts`, `tests/indicadores-metas-historicos.test.ts`, `tests/indicadores-soportes.test.ts`, `tests/indicadores-reporte.test.tsx`

**Interfaces:**
- Consumes: T3 (`origen.ts`), T6 (fichas con orígenes).
- Produces:
  - `VariableDeVersion` gana `origen: OrigenVariable; datoId: number | null; datoPeriodicidad: Periodicidad | null; indicadorOrigenId: number | null; toma: Toma | null`. `VersionDeCalculo` gana `dimensionId: number | null`. `versionesAprobadasDe` los lee.
  - `mediciones.ts`: `mide(v: VersionDeCalculo): boolean` (envuelve `alguienMide`); `NADIE_LO_MIDE = "Este indicador no tiene datos propios: nadie lo digita"`; `noSeDigitaDesdeAqui = (nombre: string) => \`«${nombre}» no se digita desde aquí: llega de otra fuente\``.
  - `contextoDeMedicion(…, { digita?: boolean | "historico" })`: con `true` (por omisión) rechaza una automática (`NO_SE_DIGITA`) y una manual sin variables propias (`NADIE_LO_MIDE`); con `"historico"` rechaza solo la automática.
  - `planDeReporte`: exige todas las letras **propias**; una letra ajena con valor en el formulario → `noSeDigitaDesdeAqui`. En modo histórico exige y admite todas (anexo §3.6).
  - `escribirValores` (la persona): escribe, cambia y borra solo filas de variables propias; en modo histórico, de todas. Nunca toca una fila de variable ajena.
  - `reportar` pone `reportada_en` con las propias completas aunque falte una ajena («Reportar lo mío», F14C-DC41). `ResultadoDeReporte` (rama `ok`) gana `faltaDato: boolean`.
  - `recalcularMedicion` solo exige soporte obligatorio si `mide(version)`.
  - `tareas.ts`: el JSON de versiones de `columnasDePendiente` gana `'propias'` y `'ajenas'` (listas de letras); la fila gana `con_valor` (las letras con valor en la fila sin categoría). `queFalta` decide con `faltaSegunOrigen`; una automática entra como `mide: false` y `faltanAjenas: !reportada`.
  - `lectura.ts`: en `datosDeReporte`, cada variable gana `ajena: null | { clase: "dato" | "indicador"; fuenteId: number; nombre: string; valor: string | null; reporto: string | null; reportadoEn: Date | null; venceEn: Date | null }` (para un dato, quién lo reportó y cuándo se leen de `variable_valores`; `venceEn`, del periodo pendiente). `faltaDatoAjeno` sale de las letras. La pantalla la abre quien mide; en un indicador que nadie mide, quien analiza (como en una automática).
  - `soportes.ts`: subir y quitar rechazan con `NADIE_LO_MIDE` cuando `!mide`.
  - `historicos.ts`: usa `digita: "historico"`.
  - `calculos.ts` (`reportes_a_tiempo`): el denominador deja fuera las mediciones cuya versión no tiene variables propias; un mixto cuenta por su primer evento `reporte`, como hoy.
  - Pantalla (maqueta 14): la variable ajena aparece fija, con una `Insignia` «Dato compartido» o «De otro indicador», su valor y «Lo reportó {nombre} el {fecha}»; el botón dice «Reportar lo mío» mientras falte una ajena; el aviso: `"Falta un dato. «{nombre}» lo reporta {proceso}; vence el {fecha}. Usted ya puede reportar lo suyo: el resultado se calcula solo cuando el dato llegue."`; para un componente: `"Falta un dato. Sale de {código} {nombre}, que aún no tiene resultado."`.

- [ ] **Step 1: Write the failing tests** (`tests/indicadores-medicion-mixta.test.ts`, en `revertida`; los valores ajenos se insertan por SQL en `medicion_valores` con `reportado_por` nulo, porque la propagación llega en T11):
  - **reportar lo mío:** mixto A propia, B dato. `reportar` con solo A → `ok`, `faltaDato: true`, `reportada_en` puesto, sin resultado, estado `abierta`; `queFalta` → `"dato"`; `tareasDeIndicadores` de quien mide no trae esa medición; la pasada de vencimientos no la avisa ni la escala aunque haya vencido.
  - `reportar` con A y también B → `noSeDigitaDesdeAqui`. `reportar` sin A → `"Falta el valor de «…»"`, como hoy.
  - **el escritor de la persona no borra lo ajeno:** con B ya en `medicion_valores`, «Guardar sin reportar» con A vacía deja la fila de B intacta.
  - con B presente, `reportar` con A calcula el resultado, saca la alerta y, si no cumple, `queFalta` → `"analisis"`.
  - **`queFalta` en los tres casos** de un mixto y en uno sin variables propias: sin nada → `"dato"` (no `"reporte"`); con todo y sin análisis → `"analisis"`.
  - un indicador sin variables propias: `reportar` → `NADIE_LO_MIDE`; `marcarNoAplica` → `NADIE_LO_MIDE`; subir un soporte → `NADIE_LO_MIDE`; **`registrarHistoricos` sí pasa**, con todas sus letras, como quien administra y como líder del proceso.
  - `registrarHistoricos` de un mixto acepta A y B digitadas; en una automática sigue rechazando.
  - `soporte_obligatorio` no deja abierta una medición de un indicador que nadie mide.
  - `reportes_a_tiempo`: un indicador sin variables propias no entra al denominador; un mixto reportado a tiempo cuenta en el numerador aunque su dato haya llegado tarde.
  - `datosDeReporte` de un mixto trae `ajena` en B con el nombre de quien reportó el dato (inserte un `variable_valores` reportado) y `null` en A.
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** Recorra uno por uno los sitios que hoy preguntan `origenDato === "automatico"` (están listados en `<espacio>/revision-dato-compartido.md`, §4.B, y `<espacio>/revision-compuestos.md`, §3.1) y decida en cada uno si la pregunta es «¿es automática?» o «¿alguien la mide?».
- [ ] **Step 4: Run** los tests de la tarea, `tests/indicadores-vencimientos.test.ts`, `tests/indicadores-fotos.test.ts`, `tests/indicadores-automaticos.test.ts`, `tests/indicadores-cierre.test.ts` y `tests/indicadores-lectura.test.ts`; `npm run lint`. Expected: PASS: nada de la 14A ni de la 14B cambia para una ficha sin variables ajenas.
- [ ] **Step 5: Commit** `feat(f14c): la medición distingue lo propio de lo ajeno, variable por variable`.

---

### Task 10: Los periodos del dato: abrir, reportar, corregir y vencer

**Files:**
- Create: `src/db/consultas/indicadores/datos-periodos.ts`, `datos-vencidos.ts`, `tests/indicadores-datos-periodos.test.ts`, `tests/indicadores-datos-vencidos.test.ts`
- Modify: `pasada.ts`, `vencimientos.ts`, `constancias-vencidas.ts` e `impactos.ts` (la llave de `correrPaso`), `tareas.ts`, `src/lib/tareas.ts` (grupo nuevo), `src/lib/esquemas/indicadores-datos.ts`, `src/app/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`, `tests/utiles/indicadores.ts`

**Interfaces:**
- Consumes: T3 (`clavesFinas`, `listaDelPeriodo`), T4 (`puedeReportarDato`, `responsablesDeDato`), T5 (`maestroDeCategorias`), T9 (`VariableDeVersion.datoId`).
- Produces:
  - `pasada.ts`: la llave se generaliza: `PasoDeVencimiento<T extends { id: number; grupo: number }, R, C>` y `correrPaso` filtra por `grupo` (antes `indicadorId`); los pasos de hoy pasan su `indicadorId` como `grupo`, sin cambiar comportamiento.
  - `datos-periodos.ts`:
    - `type PeriodoDeDato = { id: number; datoId: number; periodo: string; desde: Date; hasta: Date; venceEn: Date; estado: "pendiente" | "reportado" | "cerrado"; valor: string | null; porCategoria: Record<string, string> | null; categorias: CategoriaDeMedicion[] | null; reporto: string | null; reportadoEn: Date | null; corregido: boolean }`
    - `asegurarPeriodosDeDatos(opciones?: { sql?: Cliente; ahora?: Date; datoIds?: readonly number[] }): Promise<{ abiertos: number; quitados: number }>` — abre (`ON CONFLICT DO NOTHING`) cada periodo **terminado** del dato que cae dentro de una medición ordinaria y sin cerrar de un indicador activo cuya **versión que rige ese periodo** lo cita (anexo §4.3). `vence_en` es `fechaLimite(hasta, plazo)`; si esa fecha ya pasó al abrirlo, `fechaLimite(ahora, plazo)` (no nacen vencidos). Con dimensión, fija `categorias` con `listaDelPeriodo`. Quita los `pendiente` sin eventos que ya ninguna medición necesita.
    - `periodosDeDato(sesion: SujetoVisibilidad, datoId: number, opciones?: { sql?: Cliente; ahora?: Date }): Promise<PeriodoDeDato[] | null>` (`null` si no ve el dato; del más reciente al más viejo)
    - `reportarDato(sesion: SesionFlujo, d: { periodoId: number; valor?: string; porCategoria?: Record<string, string>; confirmado?: boolean }, opciones?: Opciones): Promise<{ ok: true; corregido: boolean } | { ok: false; confirmar: string }>` — permiso `indicadores.medir` más `puedeReportarDato`; `pendiente` → `reportado` con evento `reporte`; `reportado` → corrección, con evento `correccion` (`{ antes, despues }`) y `corregido = true`; `cerrado` → `"El periodo está cerrado: lo reabre el Administrador del SGC"`. Valida como una variable (límites de captura, negativos, cuatro decimales) y pide confirmar cuando se aleja del periodo anterior más que `ind_variacion_confirmar_pct`. Con dimensión exige un valor por cada categoría de la lista y guarda la suma en `valor`. Con `sinMedidor`, el evento lleva `sinResponsable: true`.
    - `historialDeDato(sesion: SujetoVisibilidad, periodoId: number, opciones?: { sql?: Cliente }): Promise<{ tipo: string; quien: string | null; cuando: Date; detalle: Record<string, unknown> }[] | null>`
  - Bitácora (literales): `dato_reportado`, `dato_corregido`.
  - Acciones en `src/app/acciones-indicadores.ts`: `reportarDatoCompartido` con `mutacion(formData, "indicadores.medir", …)`.
  - Tareas: fuente nueva en `tareasDeIndicadores`, id `dato:{periodoId}`, título `"Reportar el dato {nombre}, {periodo en palabras}"`, enlace `/indicadores/datos/{datoId}`, para quien esté en `responsablesDeDato`; con `sinMedidor`, el detalle es `SIN_RESPONSABLE`. Grupo nuevo en `src/lib/tareas.ts`, prefijo `dato:`, título «Datos compartidos por reportar», enlace `/indicadores/datos`.
  - `datos-vencidos.ts`: `datosVencidos(c: { sql: Cliente; ahora: Date }): Promise<{ previos: number; vencidos: number; escalados: number }>` — tres pasos con `correrPaso` (aviso previo con `ind_aviso_previo_dias`, vencido, y escalamiento al jefe con `escalamiento_dias`), tipos de aviso `indicadores.dato_por_vencer`, `indicadores.dato_vencido` e `indicadores.dato_escalado`; el escalamiento no nombra el dato. La llama `revisarVencimientosDeIndicadores` después de `asegurarPeriodosDeDatos`.
  - `tests/utiles/indicadores.ts`: `periodoDeDatoDePrueba(tx, d: { datoId: number; periodo: string; valor?: string; estado?: "pendiente" | "reportado" | "cerrado"; ahora: Date }): Promise<number>`; `silenciarIndicadores` silencia también los periodos de datos.

- [ ] **Step 1: Write the failing tests** (en `revertida`, con `ahora` inyectado):
  - **qué se abre:** un mixto mensual aprobado en noviembre con un dato mensual → tras terminar noviembre se abre el periodo `2026-11` del dato y ningún otro anterior. Un indicador **anual** aprobado en noviembre con ese dato → se abren los meses de enero a octubre ya terminados, **ninguno vencido** (`vence_en` posterior a `ahora`). Un cambio mayor que añade el dato con «rige desde» septiembre (sin reportar) → se abren septiembre y octubre.
  - un periodo histórico del indicador no abre periodos del dato; un indicador retirado, tampoco.
  - un cambio mayor que quita el dato → el periodo pendiente sin eventos se quita; uno ya reportado se conserva.
  - **reportar:** el responsable reporta `1284300000` → `reportado`, evento `reporte`, bitácora `dato_reportado`; otro usuario → rechazo; un Admin SGC con responsable activo → rechazo; sin responsable ni líder activos → pasa y el evento trae `sinResponsable: true`.
  - **corregir antes del cierre:** segundo `reportarDato` con otro valor → `corregido: true`, evento `correccion` con el antes y el después; **sin justificación**.
  - un periodo `cerrado` → su mensaje. Un valor negativo sin «admite negativos», uno fuera de los límites, uno con cinco decimales → los mensajes de una variable. Un valor que se aleja del periodo anterior más que el parámetro → `{ ok: false, confirmar }`; con `confirmado`, pasa.
  - **con dimensión:** el periodo trae `categorias`; `reportarDato` sin el valor de una → rechazo; con todas, `valor` es la suma y `por_categoria` las guarda.
  - **tareas:** el responsable tiene «Reportar el dato Total facturado en el mes, noviembre de 2026»; al reportarlo desaparece; quien no responde por el dato no la tiene.
  - **vencimientos:** aviso previo a los días del parámetro, vencido al pasar la fecha, escalamiento al jefe sin el nombre del dato; cada uno una sola vez; un dato ya reportado no avisa.
  - `tests/indicadores-vencimientos.test.ts` y `tests/indicadores-constancias.test.ts` siguen en verde con la llave nueva de `correrPaso`.
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** `reportarDato` bloquea el periodo `FOR UPDATE`, relee y escribe; la condición de persona se comprueba dentro de la transacción. T11 engancha la propagación después.
- [ ] **Step 4: Run** los tests de la tarea, `tests/indicadores-vencimientos.test.ts tests/indicadores-vencimientos-fallos.test.ts tests/indicadores-constancias.test.ts tests/indicadores-impactos.test.ts tests/indicadores-tareas.test.ts tests/acciones-permisos.test.ts tests/bitacora-detalle.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): periodos de un dato compartido con sus tareas y vencimientos`.

---

### Task 11: La propagación de los datos compartidos

**Files:**
- Create: `src/db/consultas/indicadores/propagacion.ts`, `tests/indicadores-propagacion.test.ts`
- Modify: `src/db/consultas/indicadores/mediciones.ts` (`valor_exacto`; `sistema: "fuente"`), `lectura.ts` (`leerPeriodos` lee `valor_exacto`), `vencimientos.ts`, `cierre.ts` (`abrirPeriodosDelCierre`), `operacion.ts` (`moverFechasLimite`), `src/app/acciones-indicadores.ts` y `src/app/admin/acciones-indicadores.ts` (enganches), `src/lib/indicadores/historial.ts` (frase del evento), `tests/utiles/indicadores.ts`, `tests/indicadores-ciclos.test.ts` (`LIVIANOS` gana `"propagacion"`), `AGENTS.md`

**Interfaces:**
- Consumes: T3 (`juntadoONada`, `clavesFinas`, `laFuenteMueveElPlazo`, `MOTIVO_NADA_QUE_MEDIR`), T9, T10.
- Produces:
  - `mediciones.ts`: `ValorGuardado` gana `valor_exacto: unknown`; `elegirValores` usa la fracción de `valor_exacto` cuando no es nula (`deTexto`) y si no la de `valor`; las dos consultas que leen valores (`valoresPorLetra` y `leerPeriodos`) la traen. `recalcularMedicion` admite `sistema: "fuente"`: calcula con la versión congelada si la medición ya tenía resultado y con la que rige si no, y nunca reabre por falta de soporte.
  - `propagacion.ts` (liviano):
    - `valorDeDato(sql: Cliente, d: { datoId: number; consolidacion: Consolidacion; datoPeriodicidad: Periodicidad; periodo: string; categoriaId?: number }): Promise<{ estado: "listo"; valor: Fraccion; periodos: number[] } | { estado: "falta" }>` — junta con `juntadoONada` los periodos `clavesFinas(periodo, datoPeriodicidad)` que estén `reportado` o `cerrado` con valor
    - `type ValorAjeno = { estado: "listo"; valor: Fraccion } | { estado: "falta" } | { estado: "no_aplica"; fuenteId: number }`
    - `propagar(opciones?: { sql?: Cliente; ahora?: Date; indicadorIds?: readonly number[] }): Promise<{ escritas: number; noAplica: number; fallidas: number }>`
    - `propagarSinFallar(opciones?): Promise<void>` — la que llaman las acciones después de confirmar lo suyo: registra el error y no lo relanza (la pasada lo reintenta)
  - **Qué hace `propagar`** (anexo §3.3): toma las mediciones sin cerrar y no históricas de indicadores activos cuya versión que rige tiene variables ajenas (todas, o solo las de `indicadorIds`) y, por cada una, **en su propia transacción**: indicador `FOR SHARE`, medición `FOR UPDATE`, relee; calcula el `ValorAjeno` de cada variable ajena **leyendo la fuente sin candado** (en esta tarea, solo las de dato compartido; una variable tomada de otro indicador queda `falta` hasta T12); si nada difiere de lo copiado, no escribe. Si difiere:
    - escribe la fila de esa variable (sin categoría, `reportado_por` nulo): `valor` truncado a cuatro decimales y `valor_exacto` con la fracción cuando no cabe exacta en ellos; si la fuente dejó de tener valor, quita la fila;
    - si la versión no tiene variables propias y ya están todas, pone `reportada_en = ahora` y `reportada_por` nulo;
    - `recalcularMedicion(tx, id, { ahora, actorId: null, evento: "propagacion", sistema: "fuente", detalle: { fuentes: [{ letra, clase: "dato" | "indicador", id, antes, despues }] }, conElResultado })`;
    - si quedaron todos los valores y la fórmula divide por cero, marca «No aplica» con `MOTIVO_NADA_QUE_MEDIR`; si después deja de dividir por cero, la desmarca. Un «No aplica» puesto por una persona no se toca;
    - `conElResultado` mueve `vence_en` con `laFuenteMueveElPlazo` (anexo §3.4) y deja `venceEn` en el detalle del evento.
    La que falla se registra, cuenta en `fallidas` y no corta la pasada.
  - `moverFechasLimite` reconoce como «plazo movido» también el evento `propagacion` con `venceEn`, como el de `foto`.
  - Enganches: `revisarVencimientosDeIndicadores` (después de las fotos y de `asegurarPeriodosDeDatos`), `abrirPeriodosDelCierre`, y `propagarSinFallar` al final de las acciones que cambian una fuente: reportar, «No aplica» y quitarlo, registrar históricos, programar y quitar una meta, reabrir, «Volver a calcular», aprobar fichas, publicar un cambio menor y reportar un dato.
  - `historial.ts`: el evento `propagacion` se lee «El sistema actualizó «{variable}»: de {antes} a {despues}» (T17 lo oculta a quien no ve el componente).
  - `tests/utiles/indicadores.ts`: `silenciarIndicadores` deja también sin trabajo a la propagación.

- [ ] **Step 1: Write the failing tests** (`tests/indicadores-propagacion.test.ts`, en `revertida`, `ahora` inyectado):
  - **el dato llega:** mixto con A reportada y el dato pendiente; `reportarDato` y `propagar` → B copiada con `reportado_por` nulo, resultado calculado, evento `propagacion` con `actorId` nulo, alerta de resultado emitida; segunda llamada a `propagar` → `escritas: 0` y ningún evento nuevo (**idempotente**).
  - **no borra lo digitado:** tras propagar, la fila de A sigue con su usuario.
  - **exacto:** dato mensual con «promedio», valores `2`, `2`, `3`, en un trimestral con fórmula `A / B * 100000`, B propia `7` y meta `33333`: `valor_exacto` es `7/3`, `valor` es `2.3333` y la medición **cumple** (con el truncado no cumpliría).
  - **faltan periodos:** con dos de tres meses reportados no copia nada y la medición sigue en «Falta un dato».
  - **corrección del dato:** `reportarDato` otra vez con otro valor y `propagar` → recalcula; si el color cambia sale el aviso de «Corrección».
  - **nadie mide:** indicador con sus dos variables de datos; al llegar el segundo, `reportada_en` queda puesto con `reportada_por` nulo; con B en cero queda «No aplica» con `MOTIVO_NADA_QUE_MEDIR`, y al corregir B a un valor mayor que cero se desmarca y se calcula.
  - **no toca:** una medición histórica, una cerrada y la de un indicador retirado.
  - **el plazo:** el dato llega después de la fecha límite y el resultado no cumple → `vence_en` posterior a `ahora` y `venceEn` en el evento; si cumple, no se mueve. Una corrección posterior que la deja pidiendo análisis con la fecha ya pasada la mueve otra vez; si ya lo pedía, no. `cambiarOperacion` con otro plazo conserva la fecha movida.
  - **una falla no corta:** con una medición cuya versión no se puede calcular, las demás se propagan y `fallidas` es 1.
  - **la pasada:** `revisarVencimientosDeIndicadores` propaga lo que nadie propagó, y el reporte de un dato desde su acción deja al día los indicadores que lo esperaban sin esperar a la pasada.
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** La forma es la de `tomarFotos` y `fotografiar` (`fotos.ts`): léalas antes.
- [ ] **Step 4: Run** el test de la tarea, `tests/indicadores-fotos.test.ts tests/indicadores-mediciones.test.ts tests/indicadores-lectura.test.ts tests/indicadores-operacion.test.ts tests/indicadores-vencimientos.test.ts tests/indicadores-cierre.test.ts tests/indicadores-medicion-mixta.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Actualice `AGENTS.md`** («Un solo camino de cálculo»: los escritores del sistema, la fracción exacta, la propagación, sus tres momentos y que no bloquea la fuente). **Commit** `feat(f14c): propagación de los datos compartidos a las mediciones que los esperan`.

---

### Task 12: La propagación de los componentes

**Files:**
- Create: `tests/indicadores-compuestos.test.ts`
- Modify: `src/db/consultas/indicadores/componentes.ts` (`valorDeComponente`), `propagacion.ts` (las variables tomadas, el contagio y los niveles), `src/lib/indicadores/historial.ts`

**Interfaces:**
- Consumes: T3 (`porcentajeDeCumplimiento`, `nivelesBajo`, `porNiveles`, `MOTIVO_COMPONENTE_NO_APLICA`), T6 (`aristasDeComponentes`), T11 (`propagar`, `ValorAjeno`).
- Produces:
  - `componentes.ts`: `valorDeComponente(sql: Cliente, d: { indicadorId: number; toma: Toma; periodo: string; desde: Date; hasta: Date }): Promise<{ estado: "listo"; valor: Fraccion; mediciones: number[]; desde: string | null } | { estado: "falta" } | { estado: "no_aplica" }>` (anexo §6.3):
    - misma periodicidad: la medición de ese periodo. Con resultado → `listo` (su `resultado_exacto`, o `porcentajeDeCumplimiento` con su `cumple`, su `meta_aplicada` y la tendencia de su versión); «No aplica» → `no_aplica`; lo demás → `falta`.
    - más fino: sus mediciones dentro de `[desde, hasta]`. Una **ordinaria** sin resultado ni «No aplica» → `falta`. Las **históricas sin registrar** se saltan. Todas «No aplica» → `no_aplica`. Si no, el `acumulado()` puro de las medidas de la versión que rige al final del tramo (lee valores con `elegirValores` y versiones con `versionesAprobadas`, **sin** `lectura.ts`); `desde` es la clave del primer periodo que entró cuando no es el primero del tramo. El cumplimiento de un acumulado va contra la meta aplicada del último periodo medido.
    - `mediciones` son los ids que entraron al valor (las «entradas» de T16).
  - `propagar` gana:
    - el `ValorAjeno` de una variable tomada de otro indicador sale de `valorDeComponente`;
    - **el orden:** recorre los indicadores por nivel de dependencia (`nivelesBajo` ascendente: primero quien solo toma indicadores simples), así una sola llamada deja al día a un compuesto de compuestos; con `indicadorIds`, trabaja esos y los que dependen de ellos (`porNiveles`);
    - **el contagio** (anexo §6.3, decisión 6.1): si algún componente está `no_aplica`, marca la medición «No aplica» con `MOTIVO_COMPONENTE_NO_APLICA` (el nombre no se guarda en el motivo: el id va en `detalle.componente` del evento) y `reportada_en` si no lo tenía; si era ese motivo y el componente ya aplica, la desmarca y recalcula. Un «No aplica» puesto por una persona no se toca.
  - La propagación corre también cuando cambia la **meta aplicada** de un componente (programar y quitar una meta ya están entre los enganches de T11): cambia su cumplimiento sin cambiar su resultado.

- [ ] **Step 1: Write the failing tests** (`tests/indicadores-compuestos.test.ts`, en `revertida`, `ahora` inyectado):
  - **misma periodicidad:** compuesto que toma el valor de X; al reportar X y propagar, el compuesto tiene el `resultado_exacto` de X. Con `toma: "cumplimiento"` y X en 60 frente a meta 90 → la fila copiada tiene `valor_exacto` `200/3`.
  - **la meta del componente:** reprogramar la meta de X (sin cambiar su resultado) y propagar → cambia el valor copiado y queda su evento `propagacion`.
  - **más fino:** X mensual en un compuesto trimestral: con marzo sin reportar no copia; con los tres, copia el acumulado de X (sus variables juntadas, no el promedio de sus resultados: caso con resultados 50 %, 100 % y 100 % cuyo acumulado es distinto de su promedio); un mes «No aplica» se salta.
  - **contagio:** los tres meses de X «No aplica» → el compuesto queda «No aplica» con `MOTIVO_COMPONENTE_NO_APLICA` y el id de X en el detalle del evento, no su nombre; al quitarle el «No aplica» a X, el compuesto se desmarca y se calcula. Un «No aplica» que puso quien mide el compuesto no se quita.
  - **históricos del componente:** con enero y febrero históricos sin registrar y marzo ordinario medido → copia con `desde: "2026-03"`; con enero histórico registrado, entra.
  - **cambio de fórmula del componente** a mitad del trimestre → el valor es el acumulado de los periodos de la versión que rige al final, con su `desde`.
  - **componente cerrado «Sin dato»** → el compuesto sigue en «Falta un dato».
  - **niveles:** C toma B y B toma A; un solo `propagar` tras reportar A deja al día a B y a C; con `indicadorIds: [A]`, también.
  - **mixto con componente:** un compuesto con una variable propia reportada y un componente sin resultado está en «Falta un dato», sin tarea para quien mide; al llegar el componente, se calcula.
  - **un automático como componente:** al tomarse su foto y correr la pasada, el compuesto queda al día.
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** `valorDeComponente` lee mediciones, valores y versiones con lo que ya exporta `mediciones.ts` y la función pura `acumulado()`; no importa `lectura.ts`.
- [ ] **Step 4: Run** los tests de la tarea, `tests/indicadores-propagacion.test.ts tests/indicadores-acumulado.test.ts tests/indicadores-fotos.test.ts tests/indicadores-objetivos.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): un compuesto toma el valor o el cumplimiento de sus componentes`.
---

### Task 13: «Datos compartidos»: la pestaña, la página del dato y su soporte

**Files:**
- Create: `src/app/(app)/indicadores/datos/page.tsx`, `src/app/(app)/indicadores/datos/[id]/page.tsx`, `src/app/(app)/indicadores/datos/_comun.ts`, `src/app/(app)/indicadores/datos/[id]/soportes/[archivoId]/route.ts`, `src/app/api/datos-compartidos/[id]/archivos/route.ts`, `src/db/consultas/indicadores/datos-soporte.ts`, `src/componentes/indicadores/datos/` (`TablaDeDatos.tsx`, `FichaDelDato.tsx`, `FormularioDato.tsx`, `ReportarDato.tsx`, `HistorialDelDato.tsx`), `tests/indicadores-datos-soporte.test.ts`, `tests/indicadores-datos-pantallas.test.tsx`
- Modify: `src/componentes/indicadores/PestanasIndicadores.tsx`, `src/proxy.ts`, `src/lib/subida.ts`, `src/db/consultas/admin.ts` (`registrarArchivo`), `src/lib/bitacora-detalle.ts`, `tests/proxy-matcher.test.ts`, `tests/paginas-sesion.test.ts`, `tests/indicadores-ciclos.test.ts` (`LIVIANOS` gana `"datos-soporte"`), `AGENTS.md`

**Interfaces:**
- Consumes: T4 (`listarDatos`, `datoPorId`, acciones del catálogo), T10 (`periodosDeDato`, `reportarDatoCompartido`, `historialDeDato`), T11.
- Produces:
  - `_comun.ts`: `exigirDato(id: string): Promise<{ sesion: Sesion; dato: DatoCompartido }>` — `exigirSesion()` y `notFound()` si `datoPorId` no lo devuelve. La página de la lista llama `exigirSesion()` y responde `notFound()` a quien no ve ningún dato ni tiene `indicadores.administrar`.
  - Pestaña «Datos compartidos» en `PESTANAS`, visible para quien ve algún dato o administra; su número es el de periodos por reportar de la persona. Las dos páginas llaman `asegurarPeriodosDeDatos` antes de leer, como las de indicadores llaman `asegurarMediciones`.
  - Lista (maqueta 11): por dato, su proceso y «cómo se junta», periodicidad, último valor con su periodo, quién lo reportó y cuándo, «Lo usan» (códigos de los indicadores **que la persona ve**, sin decir si hay más) y su estado («Reportado», «Por reportar · vence el …», «Vencido · desde el …»). Quien administra tiene «Nuevo dato».
  - Página del dato (maqueta 12): reportar el periodo pendiente más antiguo (con su rejilla de categorías si tiene dimensión), la ficha del dato, sus periodos con el antes y el después de cada corrección, y sus soportes. Quien administra edita el dato y sus responsables ahí mismo; lo congelado (anexo §4.1) aparece de solo lectura con su explicación.
  - `datos-soporte.ts` (liviano): `puedeVerSoporteDeDato(sql: Cliente, sujeto: SujetoVisibilidad, datoId: number): Promise<boolean>` — `puedeVerDato`, o `puedeVerSoportes` de algún indicador con una versión aprobada que cite el dato; `soporteDeDatoServible(sesion: SujetoVisibilidad, d: { datoId: number; archivoId: number }, opciones?): Promise<ArchivoServible | null>`.
  - `api/datos-compartidos/[id]/archivos` (`id` es el periodo del dato): `POST` con `sesionDePeticion`, `origenValido`, `recibirArchivo` y la comparación de `content-length`; 401 sin sesión, 404 si no ve el dato, 403 sin `puedeReportarDato`; rechaza un periodo `cerrado`; tipos de una medición (PDF, imagen o `.xlsx`, nunca `.xls`). `DELETE` quita uno con las mismas condiciones. Fuera del `matcher` de `src/proxy.ts`.
  - El `GET` del soporte: 404 a quien no pasa `puedeVerSoporteDeDato`; siempre como descarga.
  - `subida.ts`: `CONTEXTOS_EVIDENCIA` gana `"dato_compartido"`. `registrarArchivo`: rama `dato_compartido` (carpeta `datos-compartidos/<periodoId>`), que deja el evento `soporte` en `variable_eventos`. Bitácora: `dato_soporte_subido`, `dato_soporte_quitado`.

- [ ] **Step 1: Write the failing tests:**
  - `tests/proxy-matcher.test.ts`: `/api/datos-compartidos/7/archivos` queda fuera del `matcher`. `tests/paginas-sesion.test.ts`: las dos páginas nuevas llaman su guard.
  - subir un PDF como responsable → 201 y evento `soporte`; un `.xls` → rechazo; con el periodo cerrado → rechazo; sin `Origin` válido → rechazo; quien no ve el dato → 404; quien lo ve pero no responde por él → 403.
  - descargar: el responsable, sí; quien mide un indicador que usa el dato (y por eso ve sus soportes), sí; quien solo ve ese indicador general sin ver soportes → 404; siempre `Content-Disposition: attachment`.
  - la lista: un usuario de consulta sin datos → `notFound`; «Lo usan» de un dato que usan un indicador general y uno restringido muestra solo el general a quien no ve el otro, sin «y otros».
  - la página pinta el antes y el después de una corrección y quién la hizo.
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente** leyendo antes la guía de route handlers y de páginas de `node_modules/next/dist/docs/`. La ruta de subida sigue el molde de `api/mediciones/[id]/archivos`.
- [ ] **Step 4: Run** los tests de la tarea, `tests/colores-fijos.test.ts tests/textos-fijos.test.ts tests/bitacora-detalle.test.ts tests/indicadores-soportes.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Actualice `AGENTS.md`** (el décimo contexto de `archivos`, los nueve de `CONTEXTOS_EVIDENCIA`, la ruta de subida nueva, `datos` como código reservado y las páginas de «Datos compartidos» con su guard). **Commit** `feat(f14c): pestaña «Datos compartidos», página del dato y su soporte`.

**Punto de control del controlador:** crear un dato, designar a su responsable, reportarlo con soporte y verlo puesto en un indicador mensual y en uno trimestral; corregirlo y ver el historial (claro, oscuro y 390 px).

---

### Task 14: La medición desagregada, en el servidor

**Files:**
- Create: `src/db/consultas/indicadores/categorias.ts`, `tests/indicadores-desagregado.test.ts`
- Modify: `src/db/consultas/indicadores/mediciones.ts` (`abrirPeriodos`, `planDeReporte`, `escribirValores`, `reportar`, `recalcularMedicion`), `aprobacion.ts` (junto a `quitarMedicionesDeOtraPeriodicidad`), `propagacion.ts` (dato por categoría), `alertas.ts`; `src/lib/esquemas/indicadores.ts` (`EsquemaReporte`, `juntarValoresDeReporte`), `src/lib/indicadores/historial.ts`, `src/app/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`
- Test: `tests/indicadores-mediciones.test.ts`, `tests/indicadores-alertas.test.ts`, `tests/indicadores-propagacion.test.ts`

**Interfaces:**
- Consumes: T3 (`categorias.ts` puro), T5 (`maestroDeCategorias`), T9, T11.
- Produces:
  - `abrirPeriodos`: a una medición **ordinaria** cuya versión que rige tiene `dimensionId` le fija `categorias` con `listaDelPeriodo(maestroDeCategorias(…), { desde, hasta })`. Una histórica no lleva lista (se digita solo el total, anexo §3.6).
  - `EsquemaReporte` admite además `c_<categoriaId>_<letra>` (valor de una celda), `na_<categoriaId>` (`"1"`) y `motivo_<categoriaId>`; `juntarValoresDeReporte` los reúne en `filas`.
  - `DatosDeReportar` gana `filas?: { categoriaId: number; valores: Record<string, string | undefined>; noAplica?: string | null }[]`. En `valores`, `undefined` es «la celda no vino: no se toca» y `""` es «vaciarla».
  - Cómo se guarda una rejilla [anexo §5.4 y §5.5]:
    - cada celda de una variable propia es una fila de `medicion_valores` con su `categoria_id`; **solo se escriben las celdas que llegaron**;
    - el «No aplica» de una fila y su motivo viven en `mediciones.categorias[].noAplica` (motivo de 5 a 500 caracteres: `"Escriba el motivo de «No aplica» de {categoría}"`); ponerlo no borra los valores de esa fila, pero no entran a la suma;
    - reportar exige `totalDeCategorias(…).clase !== "faltan"`: si no, `"Faltan categorías por completar: {nombres}"`. Con `"total"`, el sistema escribe por cada letra la fila **sin categoría** con la suma (`reportado_por` nulo) y `reportada_en` queda puesto; con `"ninguna_aplica"`, la medición entera queda «No aplica» con `MOTIVO_TODAS_NO_APLICAN`;
    - «Guardar sin reportar» escribe las celdas y no escribe el total;
    - los límites de captura valen por celda; los del resultado y la confirmación por variación, sobre el total;
    - el detalle de los eventos `reporte` y `correccion` gana `categorias: { id: number; nombre: string; antes: Record<string, string | null>; despues: Record<string, string | null> }[]` con las celdas que cambiaron, aunque el total no cambie (entonces hay evento igual).
  - `recalcularMedicion` escribe `categorias_en_critico`: cuántas filas completas de la lista quedan en Crítico con `resultadoDeCategoria` (la meta aplicada y la versión de esa medición); nulo si no es desagregada.
  - `categorias.ts`:
    - `type FilaDeDesglose = { categoria: CategoriaDeMedicion; estado: EstadoDeFila; valores: Record<string, string | null>; resultado: string | null; semaforo: Semaforo | null; cumple: boolean | null }`
    - `type Desglose = { medicionId: number; periodo: string; dimension: string; filas: FilaDeDesglose[]; total: { valores: Record<string, string | null>; resultado: string | null; semaforo: Semaforo | null; cumple: boolean | null } | null; meta: string | null; enCritico: string[] }`
    - `desgloseDe(sql: Cliente, medicionId: number): Promise<Desglose | null>` (`null` si la medición no es desagregada; la visibilidad la comprueba quien llama). El resultado de cada fila se **calcula aquí**, con `textoValor` y la regla del periodo: nunca se guarda.
    - `actualizarCategorias(sesion: SesionFlujo, medicionId: number, opciones?: Opciones): Promise<{ agregadas: number }>` — `indicadores.administrar`; solo en una medición abierta sin reportar (`"Solo se actualizan las categorías de una medición abierta sin reportar"`); **añade** las categorías activas hoy que no estaban, nada sale; evento `categorias` y bitácora `medicion_categorias_actualizadas`.
    - `rehacerCategorias(tx: TransactionSql, indicadorId: number, rigeDesde: string): Promise<number>` — al aprobarse un cambio mayor que cambia la dimensión: en las mediciones abiertas sin reportar de su tramo rehace la lista y borra las celdas y el total que quedaron de la dimensión anterior.
  - Acción `actualizarCategoriasDeMedicion` con `mutacion(formData, "indicadores.administrar", …)`.
  - `propagar`, para un dato con dimensión en un desagregado [anexo §5.7]: por cada categoría de la lista de la medición copia `valorDeDato({ …, categoriaId })` a la celda de esa categoría (junta los periodos del dato en que la categoría estaba en su lista); si, con todos los periodos del dato ya reportados, ninguno la trae, marca esa fila con `noAplica: MOTIVO_DATO_SIN_CATEGORIA`; después escribe el total como en un reporte.
  - `alertas.ts` [anexo §5.6, F14C-DC39]: estado alertado nuevo `"bien_con_critico"` (total en Bien, cumpliendo, con `categorias_en_critico > 0`; `mediciones.alerta_estado` es texto sin `CHECK`, así que no pide migración), con los destinatarios de Atención; texto `"{Indicador}: {resultado}, Bien. En Crítico: {categoría} ({resultado}), … {Periodo}"`. Con el total en Atención o en Crítico, la alerta de siempre añade `" En Crítico: …"`. Entra a la regla de «Corrección» como un estado más.

- [ ] **Step 1: Write the failing tests** (`tests/indicadores-desagregado.test.ts`, en `revertida`; las seis sedes de la maqueta 9):
  - **la lista:** una medición abierta trae en `categorias` las activas en su periodo; una sede creada después de `hasta` no entra; una desactivada a mitad del periodo sí; una histórica queda con `categorias` nula.
  - **reportar la maqueta 9:** cinco filas con valores y una «No aplica» con motivo → `medicion_valores` tiene diez celdas con categoría y dos filas sin categoría (`A = 275`, `B = 320`, sin usuario); resultado `85,9 %`, Bien; `categorias_en_critico = 1`; `desgloseDe` devuelve 91 %, 86 %, 78 % (Atención), 55 % (Crítico), «sin_casos» y «no_aplica», y `enCritico: ["Puesto de salud 3"]`.
  - falta una fila → `"Faltan categorías por completar: Puesto de salud 2"` y nada queda reportado; «No aplica» sin motivo → su mensaje; todas «No aplica» → la medición queda «No aplica» con `MOTIVO_TODAS_NO_APLICAN`.
  - **dos personas:** una guarda sin reportar las celdas de dos sedes; otra, las de otras dos, sin enviar las primeras → las cuatro están guardadas.
  - **el total no lo pisa nadie:** tras reportar, «Guardar sin reportar» de una celda deja el total anterior hasta el siguiente reporte, y el escritor de la persona no borra la fila sin categoría.
  - **corregir una celda sin cambiar el total** (sumar uno en una sede y restar uno en otra) deja un evento `correccion` con las dos categorías, su antes y su después.
  - **la cifra y el color:** una categoría en «Bien · no alcanza la meta» (forma B) trae `semaforo: "bien"` y `cumple: false`.
  - **reabrir un periodo viejo** tras crear una sede nueva: la lista es la de entonces y el total se recalcula igual.
  - **históricos:** `registrarHistoricos` de un desagregado recibe solo el total de cada variable, como hoy; la medición queda con resultado, sin lista y sin celdas por categoría, y `desgloseDe` devuelve `null`.
  - **«Actualizar categorías»:** añade la sede que se registró tarde; en una reportada → su mensaje; no quita ninguna.
  - **cambio mayor de dimensión:** una abierta con celdas a medias queda con la lista nueva y sin celdas viejas; una reportada no se toca.
  - **dato por categoría:** desagregado trimestral con un dato mensual por sede: el total del trimestre suma los tres meses de cada sede; una sede creada en marzo se junta solo con marzo; una que el dato no trae en ningún mes queda «No aplica» con `MOTIVO_DATO_SIN_CATEGORIA`.
  - **el aviso:** total en Bien con una sede en Crítico → sale un aviso a quien analiza y a quien hace seguimiento, con el texto de arriba, y no a los líderes ni a los Admin SGC; total en Bien sin sedes en Crítico → nadie; una corrección que saca a la sede de Crítico → «Corrección». No exige análisis ni pone «Requiere acción de mejora».
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** `reportar` de un desagregado bloquea la medición como hoy y escribe celdas, lista y total en la misma transacción antes de `recalcularMedicion`.
- [ ] **Step 4: Run** los tests de la tarea, `tests/indicadores-mediciones.test.ts tests/indicadores-alertas.test.ts tests/indicadores-cierre.test.ts tests/indicadores-lectura.test.ts tests/indicadores-excel.test.ts tests/acciones-permisos.test.ts tests/bitacora-detalle.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS: la tabla del año, el acumulado, la matriz y los Excel de un desagregado salen del total sin cambios.
- [ ] **Step 5: Actualice `AGENTS.md`** (el total de un desagregado como escritor del sistema, la lista congelada en la medición y el aviso de una categoría en Crítico). **Commit** `feat(f14c): la medición de un indicador desagregado por categorías`.

---

### Task 15: Lo que se ve de un desagregado

**Files:**
- Create: `src/lib/indicadores/geometria-barras.ts`, `src/componentes/ui/BarrasAcostadas.tsx`, `src/componentes/indicadores/medicion/RejillaDeCategorias.tsx`, `src/componentes/indicadores/vistas/DesglosePorCategoria.tsx`, `tests/indicadores-rejilla.test.tsx`
- Modify: `src/componentes/indicadores/medicion/FormularioReporte.tsx`, `src/app/(app)/indicadores/[codigo]/reportar/[periodo]/page.tsx`, `src/componentes/indicadores/vistas/VistaResultados.tsx`, `src/componentes/indicadores/medicion/TablaDelAnio.tsx`, la lista (`lista.ts` y su componente), `src/componentes/indicadores/ficha/FichaImpresa.tsx`, `impresion.ts`, `lectura.ts`, `src/lib/indicadores/excel.ts`
- Test: `tests/graficas-indicadores.test.tsx`, `tests/indicadores-excel.test.ts`, `tests/indicadores-impresion.test.tsx`, `tests/indicadores-lectura.test.ts`

**Interfaces:**
- Consumes: T14 (`desgloseDe`, `Desglose`, `actualizarCategoriasDeMedicion`).
- Produces:
  - `geometria-barras.ts` (pura): `barrasAcostadas(filas: readonly { etiqueta: string; valor: number | null }[], meta: number | null): { filas: { etiqueta: string; ancho: number }[]; meta: number | null }` — anchos y posición de la meta en porcentaje de 0 a 100 sobre el mayor de los valores y la meta; un valor nulo da ancho 0.
  - `BarrasAcostadas` (`src/componentes/ui`): `{ titulo: string; filas: { etiqueta: string; valor: string; ancho: number; estado: EstadoDePunto; textoEstado: string; destacada?: boolean }[]; meta: { posicion: number; texto: string } | null }`. Una fila por categoría y la del total destacada, la meta como línea vertical (maqueta 8), el estado siempre con texto, y su **tabla equivalente** debajo. Sin librería.
  - `RejillaDeCategorias` (maquetas 9 y 10): en escritorio una tabla (una fila por categoría, una celda por variable propia, el resultado y el color de la fila al instante con `calcularEnVivo`, «No aplica» por fila con su motivo, «Sin casos» sola, y la fila del total); a 640 px o menos, una tarjeta por categoría y el total fijo abajo con los botones. Muestra «{n} en Crítico: {nombres}» y, mientras falte alguna, «Falta {n} categoría(s): {nombres}». Las variables ajenas de la fila van fijas, como en T9.
  - Página del indicador: sección «Por {dimensión}» con `BarrasAcostadas` del periodo que se elija con `?desglose=<periodo>` (por omisión el último medido) y un selector de periodo (formulario `GET`).
  - `lista.ts` y la tabla del año: `FilaDeLista` y la fila del año ganan `enCritico: number | null` y `dimension: string | null`; se pinta una `Insignia` «{n} en Crítico» con `aria-label` «{n} categorías de {dimensión} en Crítico».
  - `lectura.ts`: `desgloseDelAnio(sql: Cliente, indicadorId: number, anio: number): Promise<Desglose[]>`.
  - Excel del indicador: hoja nueva «Por categoría {año}» (Periodo, Categoría, una columna por variable, Resultado, Estado), con todos los periodos medidos del año; encabezados y nombres por `neutralizarFormula`.
  - Ficha impresa: sección «Por {dimensión} · {último periodo medido}» con la tabla de categorías.
  - Quien administra ve «Actualizar categorías» en una medición abierta sin reportar.

- [ ] **Step 1: Write the failing tests:** `barrasAcostadas` con las filas de la maqueta 8 y meta 85 → la meta en 85/91 del ancho y la fila de 91 en 100; un valor nulo → ancho 0. `BarrasAcostadas` pinta una fila por categoría, la del total y una tabla con los mismos datos. `RejillaDeCategorias` pinta una celda por categoría y variable con nombres `c_<id>_<letra>`, el campo de motivo al marcar «No aplica» y el aviso de la sede en Crítico. El Excel de un desagregado trae la hoja «Por categoría 2026» con una fila por periodo y categoría, y una categoría llamada `=SUMA(A1)` sale neutralizada. La ficha impresa trae el desglose del último periodo. La lista marca «1 en Crítico».
- [ ] **Step 2: Run** `npx vitest run tests/indicadores-rejilla.test.tsx tests/graficas-indicadores.test.tsx` y, por el guard, `tests/indicadores-excel.test.ts tests/indicadores-impresion.test.tsx tests/indicadores-lectura.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implemente** siguiendo las maquetas 8, 9 y 10 (`<espacio>/pantallas-14c.html` y `.superpowers/brainstorm/85010-1794341073/content/pantallas-14-v3.html`).
- [ ] **Step 4: Run** los mismos tests, `tests/colores-fijos.test.ts tests/textos-fijos.test.ts tests/paginas-sesion.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(f14c): rejilla de captura por categoría y desglose en la página, el impreso y el Excel`.

**Punto de control del controlador:** reportar un desagregado por sede en escritorio y a 390 px, con una sede «Sin casos» y otra «No aplica»; ver el total, la marca, las barras, el impreso y la hoja del Excel; desactivar una categoría y ver qué pide el periodo abierto y el siguiente.

---

### Task 16: El cierre conoce las entradas y la reapertura va en cascada

**Files:**
- Create: `src/db/consultas/indicadores/dependencias.ts`, `reapertura.ts`, `src/componentes/indicadores/cierre/ListaDeReapertura.tsx`, `tests/indicadores-cierre-entradas.test.ts`, `tests/indicadores-reapertura-cascada.test.ts`
- Modify: `src/db/consultas/indicadores/cierre.ts` (`abrirPeriodosDelCierre`, `clasificar`, `resumenDeCierre`, `cerrarMes`, `reabrirMedicion`, `cerrarDeNuevo`), `datos-periodos.ts`, `src/componentes/indicadores/cierre/DialogoReabrir.tsx` y la vista del resumen del cierre, la página del dato (T13), `src/app/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`, `tests/indicadores-ciclos.test.ts` (`LIVIANOS` gana `"dependencias"`), `AGENTS.md`

**Interfaces:**
- Consumes: T10, T11 (`valorDeDato`, `propagar`), T12 (`valorDeComponente`).
- Produces:
  - `dependencias.ts` (liviano):
    - `type Fuente = { clase: "dato"; periodoId: number } | { clase: "medicion"; medicionId: number }`
    - `entradasDe(sql: Cliente, medicionIds: readonly number[]): Promise<Map<number, { datos: number[]; mediciones: number[] }>>` — lo que el valor de cada medición usó (anexo §3.5): los periodos del dato que se juntan y las mediciones del componente que entran a su valor (`valorDeComponente(…).mediciones`), por la versión con que se calculó o, sin resultado, por la que rige
    - `type Dependiente = { medicionId: number; indicadorId: number; codigo: string; nombre: string; periodo: string; nivel: number; seReabre: boolean; porQueNo: "retirado" | "otra_periodicidad" | null; constanciaEn: Date | null }`
    - `dependientesDe(sql: Cliente, fuente: Fuente): Promise<Dependiente[]>` — las mediciones **cerradas** que tienen a la fuente entre sus entradas y las que dependen de esas, hasta `MAXIMO_NIVELES`, por nivel y código. `seReabre` es `false` para un indicador retirado y para una medición de otra periodicidad que la que rige
  - `cierre.ts`:
    - `abrirPeriodosDelCierre` llama además `asegurarPeriodosDeDatos` (antes de las fotos) y `propagar` (después).
    - El cierre **cierra los periodos de los datos** cuyo `hasta` cae en el mes o antes, salvo los `pendiente` que siguen en plazo: `estado = 'cerrado'`, `cierre_id` y evento `cierre`; el que venció sin valor se cierra sin valor («Sin dato»).
    - `clasificar` deja fuera («espera») la medición que: espera un dato o un componente que sigue en plazo; o tiene alguna entrada que no está cerrada ni se cierra en este mismo cierre; o cuyo valor copiado ya no coincide con el de su fuente (se comprueba dentro de la transacción con `valorDeDato` y `valorDeComponente`). **La espera se contagia hacia arriba:** si A espera, B (que toma A) también, y C (que toma B) también. El grupo «espera» se calcula por niveles hasta que no cambie (a lo sumo `MAXIMO_NIVELES` vueltas), con todo bloqueado.
    - Orden de candados: periodos de datos por id, después indicadores `FOR SHARE` por id y mediciones `FOR UPDATE` por `indicador_id, desde, id`, como hoy.
    - `ResumenDeCierre` gana `datos: { seCierran: number; sinDato: number; esperan: number }` y `esperanEntrada: { codigo: string; periodo: string; espera: string }[]`. En «Sin dato», quién debía es: quienes miden, si faltó lo propio; `"Los responsables del dato «{nombre}»"`, si faltó el dato; `"El indicador {código}"`, si faltó el resultado de un componente. (El resumen es de quien administra, que ve todo.)
    - `cerrarDeNuevo` rechaza con `"Su fuente sigue abierta: ciérrela primero"` si alguna entrada no está cerrada.
    - `reabrirMedicion` delega en `reabrirEnCascada` cuando la medición tiene dependientes cerrados.
  - `datos-periodos.ts`: `cerrarDeNuevoElDato(sesion: SesionFlujo, periodoId: number, opciones?: Opciones): Promise<void>` (un periodo reabierto vuelve a `cerrado` con el último cierre; evento `cierre`).
  - `reapertura.ts`:
    - `listaDeReapertura(sesion: SesionFlujo, fuente: Fuente, opciones?: Opciones): Promise<{ titulo: string; seReabren: Dependiente[]; noSeReabren: Dependiente[] }>` — `indicadores.administrar`
    - `reabrirEnCascada(sesion: SesionFlujo, d: { fuente: Fuente; justificacion: string }, opciones?: Opciones): Promise<{ reabiertas: number; sinTocar: number }>` — justificación de al menos 10 caracteres, sin clave; la fuente debe estar cerrada (`"Solo se reabre lo que está cerrado"`). En **una** transacción: bloquea la fuente y todos los dependientes en el orden de candados del cierre, vuelve a calcular la lista con todo bloqueado, reabre el periodo del dato (`reportado` si tiene valor, `pendiente` si no; `corregido`, quién, cuándo y por qué; evento `reapertura`) o la medición fuente, y cada dependiente con `seReabre` como lo hace hoy `reabrirMedicion` (el único `UPDATE` que el trigger admite, `corregida`, `recalcularMedicion` con el evento `reapertura` y `detalle.porFuente = { clase, id }`, su aviso `indicadores.reabierta` y su entrada de bitácora). Los que no se reabren no se tocan. Después de confirmar, `propagarSinFallar`.
    - Si quien reabre un dato es además quien lo reporta, el evento lleva `propioResponsable: true`.
  - Bitácora (literales): `dato_reabierto`, `dato_cerrado_de_nuevo`.
  - Acciones con `mutacion(formData, "indicadores.administrar", …)`: `reabrirDatoCompartido`, `cerrarDeNuevoElDatoCompartido`; la de reabrir una medición pasa a usar la cascada.
  - Pantalla (maqueta 13): el diálogo de reabrir, de un dato o de una medición, muestra antes de confirmar «Se reabren estas {n} mediciones cerradas y quedan «Corregida»» con su lista, «No se reabre» con su razón («indicador retirado: queda como está», «de otra periodicidad: queda como está») y, junto a la que corresponda, «Ya se reportó al ente el {fecha}». El botón dice «Reabrir el dato y {n} mediciones» o «Reabrir {n} mediciones».

- [ ] **Step 1: Write the failing tests** (en `revertida`, en un año lejano del pasado y con `ahora` inyectado, cerrando antes lo que esté abierto, como manda `AGENTS.md` para los cierres):
  - **el cierre cierra los datos:** un dato reportado de marzo queda `cerrado` con «cerrar hasta marzo»; uno pendiente que sigue en plazo, no; uno vencido sin valor se cierra sin valor.
  - **espera en plazo:** un mixto reportado que espera un dato en plazo no se cierra y el resumen lo cuenta en `esperanEntrada`.
  - **«Sin dato» y quién debía:** con el dato vencido, la medición se cierra «Sin dato» y el resumen dice `"Los responsables del dato «…»"`; con un componente cerrado sin dato, `"El indicador {código}"`.
  - **la regla:** un compuesto ya calculado cuyo componente sigue abierto y en plazo **no se cierra**; al cerrar el componente en el cierre siguiente, se cierran los dos.
  - **en cadena:** C toma B y B toma A, los tres calculados; A sigue en plazo → no se cierra ninguno de los tres y `esperanEntrada` trae a B y a C; cuando A ya no está en plazo, un solo `cerrarMes` cierra los tres.
  - **lo que nadie propagó:** se corrige el componente y no corre `propagar`; `cerrarMes` propaga antes de clasificar y el compuesto se cierra con el valor nuevo.
  - **un histórico sin registrar del componente** no frena el cierre del compuesto.
  - **la lista:** reabrir un dato de marzo usado por un mensual, por un trimestral y por un compuesto que toma al mensual → `seReabren` trae los tres, con niveles 1, 1 y 2; con el trimestral retirado → va a `noSeReabren` con `"retirado"`; con una constancia registrada del trimestre → `constanciaEn` puesta.
  - **la cascada:** `reabrirEnCascada` deja el dato `reportado` y `corregido`, las mediciones reabiertas y «Corregida», un evento `reapertura` con `porFuente` en cada una, un aviso a quien mide o analiza cada una y una entrada de bitácora por cada una; **el retirado no cambia y nada lanza**; la constancia no cambia.
  - tras corregir el dato reabierto y propagar, las reabiertas tienen el resultado nuevo.
  - justificación de nueve caracteres → rechazo; sin `indicadores.administrar` → rechazo; fuente sin cerrar → su mensaje.
  - **reportar tarde:** un dato cerrado sin valor se reabre, queda `pendiente`, se reporta y las mediciones que se cerraron «Sin dato» tienen resultado.
  - **cerrar de nuevo:** una medición reabierta con su dato aún abierto → `"Su fuente sigue abierta: ciérrela primero"`; tras `cerrarDeNuevoElDato`, pasa.
  - reabrir la medición de un componente desde su página reabre también el compuesto.
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** `clasificar` sigue bloqueando todo de una vez; lo nuevo son la consulta de entradas y el grupo «espera», que se calcula en memoria, por niveles y hasta punto fijo, antes del `UPDATE` que cierra.
- [ ] **Step 4: Run** los tests de la tarea, `tests/indicadores-cierre.test.ts tests/indicadores-constancias.test.ts tests/indicadores-fotos.test.ts tests/acciones-permisos.test.ts tests/bitacora-detalle.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Actualice `AGENTS.md`** («una medición cerrada tiene cerradas sus entradas», con su excepción del retirado; el cierre cierra los datos; la reapertura en cascada y su orden de candados). **Commit** `feat(f14c): el cierre conoce las entradas y la reapertura va en cascada`.

**Punto de control del controlador:** cerrar un mes con un dato y un compuesto; reabrir el dato, ver la lista, confirmar y ver las «Corregida»; reportar tarde un dato cerrado sin valor.

---

### Task 17: Lo que se ve de un compuesto y lo que se oculta

**Files:**
- Create: `tests/indicadores-ocultamiento.test.ts`, `tests/indicadores-acumulado-compuesto.test.ts`
- Modify: `src/lib/alcance.ts`, `src/lib/indicadores/acumulado.ts`, `src/lib/indicadores/historial.ts`, `src/lib/indicadores/ficha-en-texto.ts`, `src/lib/indicadores/excel.ts`; `src/db/consultas/indicadores/lectura.ts`, `cierre.ts` (`historialDeCorregidas`), `impresion.ts`, `historicos.ts`, `matriz.ts`, `constancias.ts`, `reapertura.ts` (el texto del aviso); los componentes que pintan variables (`TablaDelAnio.tsx`, `VistaResultados.tsx`, `FormularioReporte.tsx`, `DatosDelSistema.tsx`, `FichaImpresa.tsx`, la vista de la ficha y su control de cambios), la página del indicador; `AGENTS.md`

**Interfaces:**
- Consumes: T3 (las constantes de ocultamiento), T12 (`valorDeComponente`).
- Produces:
  - `alcance.ts`: `componentesVisibles(sql: Cliente, sujeto: SujetoVisibilidad, indicadorIds: readonly number[]): Promise<Set<number>>` — los de esa lista que pasan `filtroIndicadores`, en una consulta. **Es la única regla** de quién ve un componente (anexo §6.5).
  - `acumulado.ts`: `acumulado(periodos, f, fijos?: Readonly<Record<string, Fraccion | null>>)` — las letras de `fijos` no se juntan de los periodos: valen lo que se les da; con una en `null`, no hay resultado. `lectura.ts` llena `fijos` con `valorDeComponente` sobre el tramo que el acumulado cubre (anexo §6.4): **nunca suma ni promedia resultados**. Si el del componente trae `desde`, el acumulado del compuesto se rotula parcial. Es el mismo en la página, la matriz, el impreso, el Excel y `resultadoDelPeriodoExterno`.
  - `lectura.ts`: toda función que entrega variables de un periodo (`datosDeReporte`, la fila de la tabla del año, `resultadosDelAnio`, las series de «Sus variables», los valores reunidos del acumulado) marca `oculta: true` en la variable tomada de un componente que la persona no ve, con `nombre: COMPONENTE_OCULTO`, su texto en `VALOR_OCULTO` y sus números en nulo. El resultado, el color y el análisis del compuesto no se tocan.
  - `historial.ts` y `historialDeCorregidas`: en los eventos, el antes y el después de una letra oculta no se pintan; un evento `propagacion` de un componente oculto se lee «El sistema actualizó un componente»; una reapertura con `porFuente` de un componente oculto, «por un cambio en un componente». Con el componente visible llevan su código y su nombre.
  - El motivo `MOTIVO_COMPONENTE_NO_APLICA` se pinta `"{código} {nombre} no aplicó en el periodo"` a quien ve el componente (el id va en el detalle del evento) y tal cual a quien no.
  - `ficha-en-texto.ts`: `origenDeVariableEnTexto(v, visibles?: ReadonlySet<number>)` devuelve `RESULTADO_OCULTO` para un componente fuera de `visibles`, y el nombre de esa variable sale como `COMPONENTE_OCULTO`; lo usan la vista de la ficha, el control de cambios, la ficha impresa y la hoja «Ficha» del Excel.
  - `historicos.ts` (F14C-DC38): `registrarHistoricos` de un compuesto rechaza a quien no ve alguno de sus componentes: `"Este indicador toma el resultado de un indicador que usted no puede ver: sus históricos los registra el Administrador del SGC"`.
  - Pantalla de reportar: un componente oculto aparece como `COMPONENTE_OCULTO` sin cifra, y su aviso es `"Falta un dato de un componente."`.
  - Página del indicador: «Lo toman», con los compuestos que lo usan **que la persona ve**; si no ve ninguno, la sección no existe.
  - El aviso de la reapertura en cascada (T16) nombra la fuente solo a quien puede verla.

- [ ] **Step 1: Write the failing tests** (en `revertida`; un compuesto restringido del proceso P1 que toma un restringido R del proceso P2 y uno general G; `ana` está asignada a P1 y no ve R; `gerente` ve todo):
  - `componentesVisibles` para `ana` trae G y no R; para `gerente`, los dos.
  - **cada camino, para `ana`:** la tabla del año, las series de variables, los valores del acumulado y `datosDeReporte` traen la variable de R con `oculta: true`, `COMPONENTE_OCULTO` y `VALOR_OCULTO`, y **ni el código ni el nombre ni la cifra de R aparecen en la salida serializada** (busque el código, el nombre y el valor en `JSON.stringify` del resultado); la de G sale completa; el resultado del compuesto sale.
  - el Excel del indicador y la ficha impresa generados para `ana` no contienen el código, el nombre ni el valor de R en ninguna celda ni texto; para `gerente`, sí.
  - la ficha en texto y el control de cambios para `ana` dicen `RESULTADO_OCULTO`.
  - el historial de «Corregida» y el de eventos para `ana` no traen el antes ni el después de esa letra; el evento de propagación dice «El sistema actualizó un componente».
  - con R «No aplica», el compuesto queda «No aplica» y `ana` lee `"Un componente no aplicó en el periodo"`; `gerente`, el nombre de R.
  - la página de R, vista por alguien de P2 que no ve el compuesto, no trae «Lo toman».
  - **la bitácora** (el anexo §6.5 lo dejó por confirmar): compruebe en `src/lib/permisos.ts` qué roles la leen; si alguno no está en `ROLES_VEN_RESTRINGIDO` ni tiene `indicadores.administrar`, las frases de las acciones de esta entrega no llevan el nombre ni la cifra de un componente (solo ids), y un test lo fija. Si todos ven lo restringido, déjelo escrito en el informe.
  - `registrarHistoricos` del compuesto como `ana` → su mensaje; como quien administra, pasa.
  - **acumulado de un compuesto:** con un componente cuyos resultados mensuales son 50 %, 100 % y 100 % y cuyo acumulado del trimestre es otro número, el acumulado del compuesto usa **ese** número y no 250 ni el promedio; con el acumulado del componente parcial, el del compuesto se rotula parcial; con «toma cumplimiento», va contra la meta del último periodo medido del componente.
  - el periodo externo de una constancia de un compuesto congela ese mismo acumulado.
  - una ficha sin componentes y las de la 14A y la 14B no cambian en nada (los tests de lectura, Excel e impresión de antes siguen en verde).
- [ ] **Step 2: Run** por el guard. Expected: FAIL.
- [ ] **Step 3: Implemente.** El ocultamiento va **en las lecturas**, no en los componentes: lo que no debe verse no llega al navegador.
- [ ] **Step 4: Run** los tests de la tarea, `tests/indicadores-lectura.test.ts tests/indicadores-excel.test.ts tests/indicadores-impresion.test.tsx tests/indicadores-acumulado.test.ts tests/indicadores-constancias.test.ts tests/indicadores-cierre.test.ts tests/indicadores-metas-historicos.test.ts tests/indicadores-alcance.test.ts tests/indicadores-ciclos.test.ts`; `npm run lint`. Expected: PASS.
- [ ] **Step 5: Actualice `AGENTS.md`** (la regla de quién ve un componente y dónde se aplica; el acumulado de un compuesto). **Commit** `feat(f14c): el compuesto en la lectura y el ocultamiento de un componente restringido`.

**Punto de control del controlador:** entrar con una cuenta que ve el compuesto y no su componente y recorrer la página, la pantalla de reportar, la ficha, el impreso y el Excel; corregir un componente y ver el compuesto recalcularse; intentar retirar un componente.

---

### Task 18: Demo, manual, documentos y verificación

**Files:**
- Create: `src/db/semillas/indicadores-demo-14c.ts`, `tests/semilla-indicadores-14c.test.ts`
- Modify: `src/db/semillas/indicadores-demo.ts`, `indicadores-demo-agenda.ts` (un tipo de paso para la rejilla y otro para reportar un dato), `demo.ts`; el capítulo 8 de `docs/manual/`; `AGENTS.md`, `CONTEXT.md`, `PLAN.md`

**Interfaces:**
- Consumes: todas las tareas anteriores. La semilla siembra **por las funciones del dominio** con `ahora` inyectado (`guardarDato`, `guardarDimension`, `guardarBorrador`, enviar y aprobar, `reportar`, `reportarDato`, `propagar`, `cerrarMes`), nunca por SQL directo sobre tablas de mediciones.
- Produces (la demo de §10 del anexo; nombres ficticios, sin el de ninguna entidad):
  - un **dato compartido mensual** con dos responsables, usado por un indicador mensual mixto y por uno trimestral; periodos reportados (uno corregido y uno con soporte) y uno pendiente;
  - la dimensión **«Sede»** con cuatro categorías y un **indicador desagregado** con dos periodos medidos: uno con el total en Bien y una sede en Crítico; otro con una sede «Sin casos» y otra «No aplica»;
  - un **compuesto** general, «Índice de desempeño del SGC», que toma el cumplimiento de indicadores del SGC; y otro **restringido** que toma el indicador restringido de talento humano de la demo, con una cuenta de la demo que ve el compuesto y no el componente;
  - un mes cerrado que incluye un periodo del dato.

- [ ] **Step 1: Write the failing tests** (`tests/semilla-indicadores-14c.test.ts`; leen el estado y saltan con aviso si la demo ya avanzó, como los demás de semilla; con `SEMILLA_RECIEN=1` un salto es un fallo): existen el dato con sus dos responsables y sus periodos en los tres estados; los dos indicadores que lo usan tienen el valor copiado y un resultado; el desagregado tiene `categorias_en_critico = 1` en un periodo y una fila «Sin casos» y otra «No aplica» en el otro; el compuesto general tiene resultado y sus valores copiados coinciden con sus componentes; el restringido no es visible para la cuenta de consulta y su componente no lo es para la cuenta del compuesto; hay un periodo del dato `cerrado`.
- [ ] **Step 2: Run** `bash <espacio>/con-f14c.sh env SEMILLA_RECIEN=1 npx vitest run tests/semilla-indicadores-14c.test.ts`. Expected: FAIL.
- [ ] **Step 3: Escriba la semilla** y engánchela después de la de la 14B. `bash <espacio>/con-f14c.sh npm run db:seed && bash <espacio>/con-f14c.sh npm run admin:asegurar`.
- [ ] **Step 4: Run** el test de semilla y los demás `tests/semilla-*.test.ts`. Expected: PASS.
- [ ] **Step 5: Manual y documentos.** Capítulo 8 del manual: secciones nuevas «Datos compartidos», «Indicadores por sede o por servicio» e «Indicadores compuestos», y el ajuste de «Cierre del mes» (el cierre espera, cierra los datos y la reapertura va en cascada). `AGENTS.md`: lo que §10 del anexo lista y aún no esté (repase la lista entera). `CONTEXT.md`: la sección de la Fase 14C («Hecho», «Qué probar y cómo» con el recorrido de §10 del anexo, «Decisiones adicionales», «Avisos para el usuario») y el punto de reanudación. `PLAN.md`: la 14C y el cierre de la Fase 14. **Commit** `docs(f14c): demo, manual y documentos de la 14C`.
- [ ] **Step 6: Verificación del controlador.**
  - `bash <espacio>/con-f14c.sh env SEMILLA_RECIEN=1 npm test`: en verde, sin `FAIL` ni `stderr`, comparado con la línea base del Paso 0.
  - `npm run lint` limpio; `npm run build` **sin** `DATABASE_URL`, en verde.
  - La `0015` sobre una copia de la base `sgc` de `main`: `pg_dump` de solo lectura de `sgc`, restaurar en `sgc_f14c_copia`, `db:preparar` contra la copia (de quince a dieciséis migraciones), y comprobar los mismos conteos de indicadores, versiones, mediciones y valores y **las mismas huellas** de versiones y de mediciones; borrar la copia. La base `sgc` solo se lee.
  - El recorrido de §10 del anexo en el navegador (claro, oscuro y 390 px), punto por punto.
  - Revisión final de toda la rama por un revisor nuevo, y su ola de corrección.
  - `CONTEXT.md` con lo verificado y sus cifras. **Commit** `docs(f14c): CONTEXT.md con la verificación de cierre`.
