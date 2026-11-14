# Fase 14B — Lo que el sistema ya sabe y lo regulatorio: plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un indicador pueda ser de fuente automática (diez cálculos que toma el sistema, con su foto, su «No aplica» y
su «Volver a calcular»), que Vigencia y Distribución usen la meta de su ficha, que exista la página «Objetivos», que un
regulatorio lleve sus constancias de envío al ente y que un cambio de norma abra y resuelva impactos sobre los indicadores
que la citan.

**Architecture:** los cálculos son una lista fija y pura (`src/lib/indicadores/calculos/`); el sistema los toma con el
alcance del Administrador del SGC por la consulta que ya usa la pestaña de Vigencia y escribe la foto en
`medicion_valores`, la misma tabla de los valores digitados, para que `recalcularMedicion` siga siendo el único camino de
cálculo y ninguna lectura cambie. Un tercer estado de `queFalta` («dato») quita las tareas y avisos de quien no tiene nada
que digitar. Constancias e impactos viven en sus tablas, rehechas por las migraciones `0013` y `0014`, con sus propias pasadas de
vencimiento. Un gancho único, `alPublicarVersion`, reúne lo que pasa cuando una versión de ficha queda aprobada.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript estricto, PostgreSQL 16 con Drizzle, `zod`, `exceljs`,
Vitest. **Sin dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-11-14-fase14b-automaticos-y-regulatorios-design.md` («el anexo»), que amplía
`docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md` («spec 14») y
`docs/superpowers/specs/2026-11-13-fase14a-rangos-e-importacion-design.md` («14A-C») y manda sobre los dos. Lea el anexo
entero, del spec 14 las secciones que cada tarea cite, y `AGENTS.md`, antes de empezar. La revisión contra el código, con
archivo y línea, está en `<espacio>/revision-spec-contra-codigo.md`.

## Global Constraints

- Trabajo en el worktree `F:\sgc-integral-f14b`, rama `fase-14b-automaticos-regulatorios` (sale de `main`, `f04b70b`).
  Nunca el código de `F:\sgc-integral`, su base `sgc` ni su `next dev` del 3002; sin Docker salvo el `psql` que crea y
  borra las bases de trabajo (Tareas 1 y 13), sin `.env.local` (no se lee ni se crea), sin `push` ni `merge`.
- `<espacio>` es `F:\sgc-integral-f14b\.superpowers\sdd\2026-11-14-fase14b-automaticos-y-regulatorios` (ignorado por git). Todo comando que toque la base va
  por su guard, que carga el entorno de la base aparte `sgc_f14b`: `bash <espacio>/con-f14b.sh npx vitest run tests/x.test.ts`.
  Un servidor para los puntos de control va en otro puerto: `bash <espacio>/con-f14b.sh npx next dev -p 3013`.
- Las migraciones nuevas son `drizzle/0013_*` (lo que se añade y se rehace) y `drizzle/0014_*` (solo quita
  `calculo_fotos`), generadas con `npm run db:generate` (por el guard) en dos pasadas y completadas a mano con el SQL que
  Drizzle no genera. `drizzle-kit` pregunta de forma interactiva si algo «se creó o se renombró» cuando un mismo diff
  quita y añade tablas o columnas: por eso van en dos pasadas y no se quita ninguna columna. Si `db:generate` se queda
  esperando una respuesta, deténgase y avise al controlador. No se tocan la `0011` ni la `0012`. `src/db/esquema.ts` importa solo con rutas relativas.
- Sobre las tablas que la 14A ya usa solo se añade (AGENTS.md, piso 11). Solo se rehacen `reportes_externos` e
  `impactos_indicadores` y se quita `calculo_fotos`, las tres vacías. **No se tocan** `variables_compartidas`,
  `variable_responsables`, `variable_valores`, `dimensiones` ni `dimension_categorias`: son de la 14C.
- Un solo camino de cálculo: solo `recalcularMedicion` escribe resultado, semáforo, `cumple`, meta aplicada y estado; **no
  refresca valores por sí misma**. Los valores que nadie digita los escriben solo `tomarFotos` y `volverACalcular`.
- Las versiones aprobadas no cambian y su huella tampoco: `tests/indicadores-ficha.test.ts` fija la de una ficha manual.
- Los cálculos automáticos son la lista fija del registro: el formulario manda una clave y el servidor la valida contra
  él. Ninguna fórmula ni texto de la persona llega a SQL.
- La sesión de sistema (`rol: "admin_sgc"`, `usuarioId: 0`) se arma dentro de `tomarCalculo`, no se exporta y nunca sirve
  filas a una persona: solo cuenta.
- Toda Server Action nueva pasa por `mutacion(formData, "<permiso>", fn)` (`tests/acciones-permisos.test.ts`); toda acción
  de bitácora nueva tiene su frase y su nombre en `src/lib/bitacora-detalle.ts` (`tests/bitacora-detalle.test.ts`); cada
  página nueva llama su guard (`tests/paginas-sesion.test.ts`); la ruta que recibe una subida va fuera del `matcher` de
  `src/proxy.ts`, con su caso en `tests/proxy-matcher.test.ts`. Cada test estructural se actualiza en la tarea que lo rompe.
- Quien no puede ver un indicador recibe «no encontrado»; un restringido no aparece en la página «Objetivos», en las
  tareas, en los avisos ni en la sección «Indicadores» de un impacto. Los avisos de escalamiento no nombran el indicador.
- Orden de candados: indicador (`FOR SHARE`, o `FOR UPDATE` quien lo cambia) → medición o constancia (`FOR UPDATE`) →
  filas hijas. Crear impactos no toma candados explícitos sobre `indicadores` (su llave foránea toma
  `FOR KEY SHARE`, que puede cruzarse con quien guarda esa ficha: T12 lo vuelve un mensaje legible).
- Fechas, periodos y plazos en `zonaHoraria()`; nunca una zona fija.
- Colores solo por token (`tests/colores-fijos.test.ts`); nada de `opacity` para atenuar; el estado nunca solo por color;
  ningún nombre de entidad en `src/` (`tests/textos-fijos.test.ts`). Pantallas nuevas con los componentes de
  `src/componentes/ui`, navegables por teclado y a 390 px.
- Tests contra la base: fichas aprobadas, cierres y lotes dentro de `revertida` (`tests/utiles/transaccion.ts`); usuarios
  con historia `zz_<algo>_${Date.now()}`; nunca `UPDATE` ni `DELETE` sobre tablas inmutables en una limpieza.
- Next.js de este repo no es el de memoria: antes de escribir una página, una acción o un handler, lea la guía que toque
  en `node_modules/next/dist/docs/`.
- Commits convencionales en español, terminados con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (la línea
  que fija `AGENTS.md`).
- Textos de la interfaz en español; los mensajes entre comillas de este plan son copia exacta.

## Puntos de control del controlador (navegador: claro, oscuro y 390 px)

Después de las Tareas 4 (ficha automática), 7 (foto, «Falta un dato» y «Volver a calcular»), 9 (Vigencia, Distribución y
«Objetivos»), 11 (constancias) y 12 (impactos); y la demostración de §11 del anexo en la Tarea 13.

## Review Focus

1. **Una ficha manual aprobada antes de esta entrega:** su huella no cambia, y guardar un borrador de un automático no lo
   devuelve a manual. Tests en T3.
2. **La aplicación no se usa durante dos periodos:** la foto de estado no se le atribuye al periodo viejo, que queda «Sin
   dato». Test en T7.
3. **Dos fichas del mismo cálculo y alcance aprobadas en el mismo bloque:** una sola pasa y el mensaje es legible, no un
   `23505` crudo. Test en T3.
4. **Un periodo sin nada que medir frente a un conteo en cero:** el primero queda «No aplica» con su motivo; el segundo es
   un resultado 0. Test en T7.
5. **Un ente añadido a una ficha con años de historia, o importada:** no nace ninguna constancia vencida. Test en T10.
6. **«No afecta» sobre una norma derogada:** la ficha se vuelve a guardar citándola. Test en T12.
7. **Los impactos de documentos y de procesos de la 13C:** sus tareas, sus avisos y su resolución no cambian. Test en T12.

---

### Task 1: Base de trabajo y migraciones `0013` y `0014`

**Files:**
- Create: `drizzle/0013_*.sql` y `drizzle/0014_*.sql` (generadas + SQL a mano) y su `meta`; `tests/esquema-fase14b.test.ts`
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts`, `src/db/semillas/minima.ts` (el `TRUNCATE`), `src/lib/indicadores/tipos.ts` (`TIPOS_EVENTO`), `.gitignore` (`almacen-f14b/`), `AGENTS.md` (regla 5, piso 10 y el párrafo de migraciones)
- Test: `tests/esquema-fase14.test.ts`, `tests/privilegios-bd.test.ts`

**Interfaces:**
- Produces (nombres exactos):
  - `calculo_fotos`: **no existe**.
  - `reportes_externos(id, indicador_id →indicadores, periodo text, desde timestamptz, hasta timestamptz, vence_en timestamptz NOT NULL, ente text NOT NULL, estado text NOT NULL DEFAULT 'pendiente', fecha_envio date, radicado text, resultado_enviado text, resultado_detalle jsonb, nota text, registrada_por →usuarios, registrada_en timestamptz, corregida boolean NOT NULL DEFAULT false, aviso_previo_en timestamptz, aviso_vencido_en timestamptz, escalado_en timestamptz, creado_en timestamptz NOT NULL DEFAULT now())` (`aviso_previo_en` se conserva sin uso: quitarla haría preguntar a `drizzle-kit`); único `reportes_externos_unico (indicador_id, periodo)`; índice `reportes_externos_estado_vence_idx (estado, vence_en)`; CHECK `reportes_externos_estado_valido`: `estado IN ('pendiente','registrada')`; CHECK `reportes_externos_registrada_coherente`: `(estado = 'registrada') = (fecha_envio IS NOT NULL AND radicado IS NOT NULL AND registrada_por IS NOT NULL AND registrada_en IS NOT NULL)`.
  - `reporte_externo_eventos(id, reporte_id →reportes_externos, tipo text, usuario_id →usuarios NOT NULL, detalle jsonb NOT NULL DEFAULT '{}', creado_en)`; CHECK `tipo IN ('registro','correccion','soporte')`; índice `(reporte_id, creado_en)`; trigger `reporte_externo_eventos_inmutable` con `sgc_impedir_modificacion()`.
  - `impactos_indicadores(id, norma_cambio_id →norma_cambios, norma_id →normas, indicador_id →indicadores, estado text NOT NULL DEFAULT 'pendiente', vence_en timestamptz NOT NULL, aviso_vencido_en, escalado_en, resolucion text, version_id →indicador_versiones, nota text, resuelto_por →usuarios, resuelto_en timestamptz, creado_en timestamptz NOT NULL DEFAULT now())`; único `impactos_indicadores_unico (norma_cambio_id, indicador_id)`; índice `impactos_indicadores_indicador_idx (indicador_id, estado)`; CHECK `estado IN ('pendiente','resuelto')`; CHECK `resolucion IN ('no_afecta','nueva_version','retiro')`; CHECK `impactos_indicadores_resuelto_coherente`: `(estado = 'resuelto') = (resolucion IS NOT NULL AND resuelto_por IS NOT NULL AND resuelto_en IS NOT NULL)`.
  - `indicadores`: `calculo text`, `calculo_alcance text`, `ente_desde timestamptz`; CHECK `indicadores_calculo_coherente`: `(calculo IS NULL) = (calculo_alcance IS NULL)`; índice único (SQL a mano) `indicadores_calculo_unico` sobre `(calculo, calculo_alcance, (CASE WHEN calculo_alcance = 'proceso' THEN proceso_id ELSE 0 END)) WHERE estado = 'activo' AND calculo IS NOT NULL`.
  - `mediciones.foto_en timestamptz`.
  - `medicion_eventos_tipo_valido` admite además `'foto'`; `TIPOS_EVENTO` gana `"foto"`.
  - `indicador_versiones`: CHECK `indicador_versiones_automatica_coherente`: `(origen_dato = 'automatico') = (calculo IS NOT NULL AND calculo_alcance IS NOT NULL)`; CHECK `indicador_versiones_alcance_valido`: `calculo_alcance IN ('entidad','proceso','calidad','institucional','todos')`.
  - Índices: `firmas_indicador_version_idx` sobre `firmas(indicador_version_id)`, `medicion_observaciones_responde_idx` sobre `medicion_observaciones(responde_a)`, `mediciones_cierre_idx` sobre `mediciones(cierre_id)`.
  - La `0013` empieza (SQL a mano) con un bloque que se detiene si `reportes_externos` o `impactos_indicadores` tienen filas, y la `0014`, con el mismo bloque para `calculo_fotos`: `RAISE EXCEPTION 'Las tablas de la 14B tienen filas: la migración no las rehace'`.
  - `roles-bd.ts`: el `REVOKE UPDATE, DELETE` suma `reporte_externo_eventos`. El `TRUNCATE` de `minima.ts` pierde `calculo_fotos` y gana `reporte_externo_eventos`.

- [ ] **Step 0: Base de trabajo aparte (lo hace el controlador).** `git worktree add F:/sgc-integral-f14b -b fase-14b-automaticos-regulatorios main`; en el worktree, `npm ci`; copie `.env.example` a `.env.f14b`, cambie el nombre de la base por `sgc_f14b` en `DATABASE_URL` y `DATABASE_URL_MIGRADOR` y añada `ALMACEN_RUTA=./almacen-f14b`. **No cambie `BD_APP_CLAVE`** (el rol `sgc_app` es de todo el servidor de base de datos). Mueva al worktree el anexo y este plan (están sin seguimiento en `F:\sgc-integral\docs\superpowers\`) y confírmelos: `docs(f14b): anexo del spec y plan de la 14B`. Cree `<espacio>/con-f14b.sh`:

```bash
#!/usr/bin/env bash
# Corre una orden en el worktree de la 14B con el entorno de su base aparte. Nunca toca la base `sgc`.
set -euo pipefail
cd /f/sgc-integral-f14b
set -a; . ./.env.f14b; set +a
case "$DATABASE_URL $DATABASE_URL_MIGRADOR" in *"/sgc_f14b "*"/sgc_f14b") ;; *) echo "El entorno no apunta a sgc_f14b" >&2; exit 1 ;; esac
exec "$@"
```

```bash
docker exec sgc-integral-bd-1 psql -U sgc -d postgres -c 'CREATE DATABASE sgc_f14b OWNER sgc'
bash <espacio>/con-f14b.sh npm run db:preparar && bash <espacio>/con-f14b.sh npm run db:seed && bash <espacio>/con-f14b.sh npm run admin:asegurar
bash <espacio>/con-f14b.sh env SEMILLA_RECIEN=1 npm test
```

  Expected: «Migraciones al día» con trece migraciones; la suite en verde. Anote la línea base (archivos y pruebas) en `<espacio>/progress.md`.

- [ ] **Step 1: Write the failing tests** en `tests/esquema-fase14b.test.ts` (patrón de `tests/esquema-fase14a-importacion.test.ts`: `postgres` propio, `revertida`, `fallaCon`):
  - `calculo_fotos` no está en `information_schema.tables`; las columnas nuevas de `indicadores`, `mediciones`, `reportes_externos` e `impactos_indicadores` existen con su tipo (`desde` y `hasta` de `reportes_externos` son `timestamp with time zone`);
  - `INSERT` de una versión con `origen_dato = 'automatico'` y `calculo` nulo → `23514`; con `'manual'` y `calculo = 'acuses'` → `23514`; con `calculo_alcance = 'otro'` → `23514`;
  - dos indicadores activos con `calculo = 'acuses'` y `calculo_alcance = 'entidad'` → `23505` (`indicadores_calculo_unico`); con `'proceso'` y procesos distintos, los dos entran; uno activo y uno retirado, entran;
  - `reportes_externos` con `estado = 'registrada'` sin radicado → `23514`; `impactos_indicadores` con `estado = 'resuelto'` sin resolución → `23514`;
  - `UPDATE` y `DELETE` de `reporte_externo_eventos` → rechazados por el trigger (`42501`);
  - `INSERT` en `medicion_eventos` con `tipo = 'foto'` entra.
  En `tests/privilegios-bd.test.ts`, el caso de `reporte_externo_eventos` como el de `importacion_eventos`. En `tests/esquema-fase14.test.ts`, la lista de tablas pierde `calculo_fotos` y gana `reporte_externo_eventos` (el total sigue en 24 más las dos de la `0012`, según cuente el archivo).

- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/esquema-fase14b.test.ts tests/privilegios-bd.test.ts`. Expected: FAIL (columnas inexistentes).

- [ ] **Step 3: Implement** en dos pasadas. **Primera:** todo lo que se añade y se rehace en `esquema.ts`, **sin quitar `calculoFotos`** (corrija de paso el comentario que dice «la migración 0012 puede rehacerlas»: son de la 14C y las rehace la `0015`); `bash <espacio>/con-f14b.sh npm run db:generate` → `0013`; añada su SQL a mano (el bloque de seguridad al principio; el índice único parcial, el trigger y los CHECK que Drizzle no exprese, al final). **Segunda:** quite `calculoFotos` de `esquema.ts`; `db:generate` otra vez → `0014`, que solo trae el `DROP TABLE`, con su bloque de seguridad delante. Después `roles-bd.ts`, `minima.ts`, `tipos.ts` y `AGENTS.md` («Al cierre de esta entrega son quince (`drizzle/0000` a `drizzle/0014`); las tablas vacías de la 14C las puede rehacer la `0015`»; `reporte_externo_eventos` en la regla 5 y en el piso 10). Aplique: `bash <espacio>/con-f14b.sh npm run db:preparar`.

- [ ] **Step 4: Run to verify they pass** (mismo comando), más `tests/esquema-fase14.test.ts`, `tests/esquema-fase14a-importacion.test.ts` y `npm run lint`. Expected: PASS, lint limpio.

- [ ] **Step 5: Commit** — `feat(f14b): migraciones 0013 y 0014 - fotos en la medición, constancias, impactos de indicadores y cálculo de la ficha vigente`

---

### Task 2: El registro de cálculos y las reglas puras

**Files:**
- Create: `src/lib/indicadores/calculos/registro.ts`, `src/lib/indicadores/calculos/reportes-a-tiempo.ts`, `src/lib/indicadores/objetivos.ts`
- Test: `tests/indicadores-calculos.test.ts` (nuevo)

**Interfaces:**
- Produces (`registro.ts`, sin Node ni BD: lo importa el formulario):
  - `CLAVES_DE_CALCULO = ["dentro_plazo", "vencidos", "aprobacion", "acuses", "conformidad_fecha", "conformidad_periodo", "externos", "etapas", "reportes_a_tiempo", "objetivos_cumplidos"] as const`; `type ClaveDeCalculo`.
  - `ALCANCES_DE_CALCULO = ["entidad", "proceso", "calidad", "institucional", "todos"] as const`; `type AlcanceDeCalculo`; `ETIQUETA_ALCANCE`: «Toda la entidad», «El proceso de la ficha», «Objetivos de calidad», «Objetivos institucionales», «Todos los objetivos».
  - `type VariableDeCalculo = { letra: "A" | "B"; nombre: string; descripcion: string; consolidacion: Consolidacion }`.
  - `type DefinicionDeCalculo = { clave: ClaveDeCalculo; nombre: string; clase: "estado" | "flujo"; forma: "porcentaje" | "razon" | "conteo"; variables: VariableDeCalculo[]; alcances: readonly AlcanceDeCalculo[]; tendencia: "ascendente" | "descendente"; reconstruible: boolean; sinDatos: string | null; unidadSugerida: "Porcentaje" | "Días" | "Número"; documental: Indicador | null; exigeMeta: boolean }` (`Indicador` es el tipo de `src/lib/indicadores-documentales/metas.ts`).
  - `CALCULOS: Record<ClaveDeCalculo, DefinicionDeCalculo>`, con la tabla de §5.1 del anexo (nombres de A y B, «Junta», alcances, tendencia y «Hacia atrás», copia exacta). `documental`: `dentro_plazo`, `vencidos`, `aprobacion`, `acuses`, `externos` y `etapas` llevan su misma clave; `conformidad_fecha` → `"conformidad"`; los demás, `null`. `exigeMeta` solo en `conformidad_fecha`. `unidadSugerida`: «Días» en `aprobacion`, «Número» en `vencidos`, «Porcentaje» en el resto.
  - `sinDatos` (copia exacta): `dentro_plazo` «No había documentos vigentes con fecha de revisión»; `vencidos` `null`; `aprobacion` «No se publicó ningún trámite en el periodo»; `acuses` «No se pidieron acuses de lectura en el periodo»; `conformidad_fecha` «Ningún punto de uso tenía una verificación cerrada»; `conformidad_periodo` «No se cerró ninguna verificación en el periodo»; `externos` «No había documentos externos vigentes con fecha de verificación»; `etapas` «No se cerró ninguna etapa con fecha límite en el periodo»; `reportes_a_tiempo` «Ninguna medición tenía su fecha límite en el periodo»; `objetivos_cumplidos` «Ningún objetivo tuvo medición en el periodo».
  - `calculoDe(clave: unknown): DefinicionDeCalculo | null`; `alcanceAdmitido(def: DefinicionDeCalculo, alcance: unknown): alcance is AlcanceDeCalculo`.
  - `fotoDe(def: DefinicionDeCalculo, v: { A: string; B?: string }): { noAplica: string } | { valores: Record<string, string> }` — «no aplica» con `def.sinDatos` cuando la forma tiene B y B es cero; un conteo nunca.
- Produces (`reportes-a-tiempo.ts`, puro): `reportesATiempo(ms: readonly { venceEn: Date; primerReporteEn: Date | null }[]): { aTiempo: number; total: number }` (a tiempo: `primerReporteEn !== null && primerReporteEn <= venceEn`).
- Produces (`objetivos.ts`, puro):
  - `type EstadoDeObjetivo = "cumplido" | "no_cumplido" | "sin_medicion"`; `ETIQUETA_ESTADO_OBJETIVO`: «Cumplido», «No cumplido», «Sin medición».
  - `estadoDeObjetivo(cumplen: readonly (boolean | null)[]): EstadoDeObjetivo` — los `null` (sin meta) no cuentan; sin ninguno que cuente, `sin_medicion`; todos `true`, `cumplido`.
  - `objetivosCumplidos(objetivos: readonly (readonly (boolean | null)[])[]): { cumplidos: number; conMedicion: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("el registro tiene los diez cálculos del anexo", () => {
  expect(Object.keys(CALCULOS)).toEqual([...CLAVES_DE_CALCULO]);
  for (const c of Object.values(CALCULOS)) {
    expect(c.variables.map((v) => v.letra)).toEqual(c.forma === "conteo" ? ["A"] : ["A", "B"]);
    expect(c.sinDatos === null).toBe(c.forma === "conteo");
    expect(c.variables.every((v) => v.consolidacion === (c.clase === "estado" || c.clave === "objetivos_cumplidos" ? "ultimo" : "suma"))).toBe(true);
  }
});
it("alcances, tendencia y lo que se llena hacia atrás", () => {
  expect(CALCULOS.conformidad_fecha.alcances).toEqual(["entidad"]);
  expect(CALCULOS.conformidad_periodo.alcances).toEqual(["entidad"]);
  expect(CALCULOS.objetivos_cumplidos.alcances).toEqual(["calidad", "institucional", "todos"]);
  expect(CALCULOS.acuses.alcances).toEqual(["entidad", "proceso"]);
  expect(CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].tendencia === "descendente")).toEqual(["vencidos", "aprobacion"]);
  expect(CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].reconstruible)).toEqual(["aprobacion", "conformidad_periodo", "etapas", "reportes_a_tiempo", "objetivos_cumplidos"]);
  expect(CLAVES_DE_CALCULO.filter((k) => CALCULOS[k].clase === "estado")).toEqual(["dentro_plazo", "vencidos", "conformidad_fecha", "externos"]);
});
it("una clave o un alcance que no es del registro", () => {
  expect(calculoDe("constructor")).toBeNull(); expect(calculoDe("__proto__")).toBeNull(); expect(calculoDe(3)).toBeNull();
  expect(alcanceAdmitido(CALCULOS.acuses, "calidad")).toBe(false);
});
it("sin nada que medir es «no aplica»; un conteo en cero es un valor", () => {
  expect(fotoDe(CALCULOS.aprobacion, { A: "0", B: "0" })).toEqual({ noAplica: "No se publicó ningún trámite en el periodo" });
  expect(fotoDe(CALCULOS.aprobacion, { A: "63.5", B: "3" })).toEqual({ valores: { A: "63.5", B: "3" } });
  expect(fotoDe(CALCULOS.vencidos, { A: "0" })).toEqual({ valores: { A: "0" } });
});
it("reportes a tiempo", ...);   // en la fecha límite exacta cuenta; un milisegundo después, no; sin reporte, tarde; lista vacía → { aTiempo: 0, total: 0 }
it("estado de un objetivo", ...); // [] → sin_medicion; [null] → sin_medicion; [true, true] → cumplido; [true, false] → no_cumplido; [true, null] → cumplido
it("objetivos cumplidos", ...);   // [[true],[true,false],[],[null]] → { cumplidos: 1, conMedicion: 2 }
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/indicadores-calculos.test.ts` (puro, sin guard). Expected: FAIL (los módulos no existen).
- [ ] **Step 3: Implement** los tres módulos con las firmas de arriba.
- [ ] **Step 4: Run to verify they pass** (mismo comando) y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): registro de los diez cálculos automáticos y reglas de objetivos y reportes a tiempo`

---

### Task 3: La ficha automática en el servidor

**Files:**
- Create: `src/db/consultas/indicadores/publicacion.ts`; `tests/indicadores-automaticos.test.ts`
- Modify: `src/lib/esquemas/indicadores.ts` (`EsquemaFicha`), `src/db/consultas/indicadores/fichas.ts` (`revisar`, `columnasDeContenido`, `escribirHijos`, `valoresDeVersion`, `opcionesDeFicha`), `src/db/consultas/indicadores/aprobacion.ts` (`validarEnvio`, `enviarAAprobacion`, `validarAprobacion`, `aprobarFichas`), `src/db/consultas/indicadores/operacion.ts` (`designar`, `cambiarOperacion`, `duplicar`), `src/db/consultas/indicadores/mediciones.ts` (`VersionDeCalculo`, `versionesAprobadasDe`), `src/lib/indicadores/tipos.ts` (`OpcionesFicha`), `src/lib/bitacora-detalle.ts`, `tests/utiles/indicadores.ts`
- Test: `tests/indicadores-ficha.test.ts`, `tests/indicadores-fichas.test.ts`, `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Consumes: `CALCULOS`, `calculoDe`, `alcanceAdmitido` (T2); las columnas y el índice `indicadores_calculo_unico` (T1).
- Produces:
  - `EsquemaFicha` gana `origenDato: "manual" | "automatico"` (por omisión, `manual`), `calculo?: string`, `calculoAlcance?: string`. Con `automatico`, `cargosMedir` puede venir vacío y no se exige; con `manual` sigue «Elija al menos un cargo responsable de medir».
  - `revisar` con `automatico`: `calculoDe(d.calculo)` o «Elija el cálculo que hace el sistema»; `alcanceAdmitido` o «Ese cálculo no admite ese alcance»; **pisa** lo que venga del formulario con el registro: `forma`, `formula = formulaDeForma(def.forma)`, `factor = null`, `tendencia = def.tendencia` y `variables` (letra, nombre, descripción y consolidación del registro; `fuente: "La calcula el sistema"`; sin unidad ni límites de captura; `admiteNegativos: false`); `cargosMedir = []`, `mide = []`, `soporteObligatorio = false`; con `def.exigeMeta` y sin meta: «Este cálculo exige una meta: con ella se juzga la conformidad en Distribución».
  - `columnasDeContenido` escribe `origen_dato`, `calculo`, `calculo_alcance`; `escribirHijos` escribe `origen = 'automatica'` en un automático y `'propia'` en un manual; `valoresDeVersion` los devuelve.
  - `OpcionesFicha.calculos: { clave: ClaveDeCalculo; nombre: string; clase: "estado" | "flujo"; forma: string; tendencia: string; reconstruible: boolean; exigeMeta: boolean; unidadSugerida: string; alcances: { clave: AlcanceDeCalculo; etiqueta: string }[]; variables: VariableDeCalculo[] }[]`.
  - `VersionDeCalculo` gana `origenDato: "manual" | "automatico"` y `calculo: { clave: string; alcance: string } | null` (lo leen T5, T6 y T7).
  - `validarEnvio`: un automático no exige la prueba; exige que no haya otra ficha activa con su cálculo y alcance (con alcance `proceso`, en su proceso): «Ya hay una ficha activa para ese cálculo y alcance: *código*»; un cambio **mayor** a un cálculo no `reconstruible` exige que «rige desde» sea el periodo en curso de su periodicidad: «Un cálculo que no se llena hacia atrás rige desde el periodo en curso».
  - `validarAprobacion`: repite las dos y, además, rechaza un bloque en que dos fichas comparten cálculo y alcance (con `proceso`, el mismo proceso): «Las fichas *código A* y *código B* usan el mismo cálculo y alcance: solo una puede quedar activa». Para una versión **inicial** de un cálculo no `reconstruible` devuelve `rigeDesde = periodoQueContiene(periodicidad, ahora, zona).clave`. `aprobarFichas` escribe ese inicio en `indicadores.inicio_medicion` antes de aprobar la versión, llama `alPublicarVersion` después de la firma y **antes** de `quitarMedicionesDeOtraPeriodicidad` y `asegurarMediciones`, y convierte el `23505` de `indicadores_calculo_unico` (dos aprobaciones a la vez) en «Ya hay una ficha activa para ese cálculo y alcance». `enviarAAprobacion` llama `alPublicarVersion` en la rama del cambio menor.
  - `publicacion.ts`: `alPublicarVersion(tx: TransactionSql, d: { indicadorId: number; versionId: number; elaboradaPor: number | null; elaboradaEn: Date | null; actorId: number; ahora: Date }): Promise<void>`. En esta tarea: copia `calculo` y `calculo_alcance` de la versión a `indicadores` (nulos si es manual) y, si es automática, quita los designados «mide», pone `soporte_obligatorio = false` y, si quitó alguno, deja la acción de bitácora `indicador_medidores_quitados` (`{ codigo, cuantos }`; frase: «Quitó a *N* personas de «mide» en *código*: ahora lo calcula el sistema»). T10 y T12 le añaden lo suyo.
  - `designar` con `funcion: "mide"` sobre un indicador con `calculo`: «Este indicador lo calcula el sistema: nadie lo mide». `cambiarOperacion` con `soporteObligatorio: true` sobre uno con `calculo`: «Un indicador que calcula el sistema no lleva soporte».
  - `duplicar` sobre un automático: la copia nace con `origen_dato = 'manual'`, sin cálculo ni alcance, con sus variables en `origen = 'propia'` y sin designados «mide».
  - `tests/utiles/indicadores.ts`: `OpcionesIndicadorDePrueba` gana `calculo?: { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo }` (versión automática con las variables del registro y `indicadores.calculo` puesto).

- [ ] **Step 1: Write the failing tests** en `tests/indicadores-automaticos.test.ts` (con `revertida` y los ayudantes de `tests/utiles/indicadores.ts`; `crearIndicador`, `guardarBorrador`, `enviarAAprobacion` y `aprobarFichas` con `verificar` inyectado, como en `tests/indicadores-aprobacion.test.ts`):

```ts
it("una ficha automática toma del registro la forma, las variables y la tendencia", …);
//  crearIndicador con origenDato 'automatico', calculo 'acuses', calculoAlcance 'entidad', forma 'conteo', tendencia 'descendente' y
//  variables [{ letra: 'Z', … }] → la versión guarda forma 'porcentaje', formula 'A / B * 100', tendencia 'ascendente',
//  origen_dato 'automatico'; indicador_variables: A «Acuses confirmados» y B «Acuses confirmados y pendientes», origen 'automatica',
//  consolidacion 'suma'; sin filas en indicador_responsables con funcion 'medir' ni designados 'mide'
it("no exige la prueba ni un cargo de medir; un manual sí", …);
it("rechaza una clave que no es del registro y un alcance que el cálculo no admite", …);
//  calculo 'constructor' → «Elija el cálculo que hace el sistema»; 'conformidad_fecha' con 'proceso' → «Ese cálculo no admite ese alcance»
it("conformidad a la fecha exige meta", …);
it("guardar el borrador de un automático lo deja automático", …);           // Review Focus 1
it("a lo sumo una ficha activa por cálculo y alcance", …);
//  con una activa de 'etapas'/'entidad': enviar otra → «Ya hay una ficha activa para ese cálculo y alcance: <código>»;
//  con alcance 'proceso' en dos procesos distintos, las dos se aprueban
it("dos fichas del mismo cálculo aprobadas en el mismo bloque: no se aprueba ninguna y el mensaje es legible", …);  // Review Focus 3
it("un cálculo que no se llena hacia atrás empieza en el periodo en curso al aprobarse", …);
//  'dentro_plazo' mensual con inicio '2026-01', aprobada con ahora = 2026-11-14 → inicio_medicion y rige_desde '2026-11', ninguna medición abierta
it("uno que se llena hacia atrás conserva su inicio y abre sus históricos", …);   // 'etapas' con inicio '2026-08' → mediciones 08, 09 y 10 históricas
it("pasar de manual a un cálculo que no se llena hacia atrás rige desde el periodo en curso", …);
it("al aprobarse quita a quienes miden y lo deja en la bitácora; designar «mide» se rechaza", …);
it("«Crear a partir de este» sobre un automático nace manual", …);
it("soporte obligatorio no aplica", …);
```

  En `tests/indicadores-ficha.test.ts`: la huella fija de la ficha manual sigue igual (ya existe: no se toca) y `huellaDeFicha` de un contenido con `origenDato: "automatico"`, `calculo: "acuses"`, `calculoAlcance: "entidad"` difiere de la del mismo contenido con otro alcance. En `tests/bitacora-detalle.test.ts` la acción nueva tiene frase y nombre.

- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/indicadores-automaticos.test.ts tests/indicadores-ficha.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** con las firmas de arriba. La unicidad se comprueba leyendo `indicadores` (`estado = 'activo' AND calculo = … AND calculo_alcance = … AND (… <> 'proceso' OR proceso_id = …) AND id <> …`); el índice único es la garantía de fondo.
- [ ] **Step 4: Run to verify they pass** (mismo comando), más `tests/indicadores-fichas.test.ts`, `tests/indicadores-aprobacion.test.ts`, `tests/indicadores-operacion.test.ts`, `tests/indicadores-importacion.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): la ficha de fuente automática - el registro fija la forma, una sola por cálculo y alcance, nadie la mide`

---

### Task 4: El formulario y la ficha técnica de un automático

**Files:**
- Create: `src/componentes/indicadores/ficha/OrigenDelDato.tsx` (la sección nueva; `FormularioFicha.tsx` ya pasa de mil líneas)
- Modify: `src/componentes/indicadores/ficha/FormularioFicha.tsx`, `src/componentes/indicadores/ficha/FichaTecnica.tsx`, `src/lib/indicadores/ficha-en-texto.ts`, la página de impresión si lee la ficha en texto
- Test: `tests/indicadores-formulario.test.tsx`, `tests/indicadores-impresion.test.tsx`

**Interfaces:**
- Consumes: `OpcionesFicha.calculos` y los campos `origenDato`, `calculo`, `calculoAlcance` (T3).
- Produces (lo que se ve; textos exactos):
  - «Cómo se obtiene el dato», dos opciones: **«Lo digita una persona»** y **«Lo calcula el sistema»** (una ficha con versión aprobada lo conserva; cambiarlo es un cambio mayor y la ayuda lo dice).
  - Con «Lo calcula el sistema»: los selectores **«Cálculo»** y **«Alcance»** (solo los alcances del cálculo; con uno solo, ya elegido); un bloque de solo lectura «Lo pone el cálculo» con la fórmula en palabras, las variables con su nombre y su descripción y la tendencia; se **ocultan** el editor de variables, la forma, el factor, la fórmula libre, la prueba, «Cargos responsables de medir», «Quién mide» y «Soporte obligatorio»; la unidad nace en la sugerida si existe en el maestro.
  - El plazo se rotula **«Días de espera antes de calcular»** en un cálculo de flujo, con la ayuda «El sistema calcula el periodo cuando pasan estos días desde su fin. Con 0, al terminar el periodo.»; en uno de estado conserva su rótulo con la ayuda «Es la fecha límite del análisis. La foto se toma al terminar el periodo.».
  - En un cálculo que no se llena hacia atrás, el inicio de medición se reemplaza por el texto «Empieza en el periodo en curso cuando se apruebe.»; en uno que sí, la ayuda «El sistema calcula solo los periodos anteriores.».
  - Si el cálculo y el alcance elegidos ya tienen ficha activa, un aviso junto al selector: «Ya hay una ficha activa para ese cálculo y alcance.».
  - Ficha técnica, impreso y ficha en texto: «Cómo se obtiene el dato: Lo calcula el sistema · *nombre del cálculo* · *etiqueta del alcance*»; no muestran «Responsable de medir».
  - Los mensajes nuevos de T3 abren «Más opciones» junto a su campo (`campoDeMasOpciones`).

- [ ] **Step 1: Write the failing tests** (render con `@testing-library/react`, como los que ya tiene el archivo): al elegir «Lo calcula el sistema» aparecen «Cálculo» y «Alcance» y desaparecen «Variables», «Probar la fórmula» y «Quién mide»; con `conformidad_fecha` el alcance es «Toda la entidad» sin elección; con `aprobacion` el plazo se rotula «Días de espera antes de calcular»; con `dentro_plazo` no hay selector de inicio y sí el texto; el formulario envía `origenDato`, `calculo` y `calculoAlcance`; la ficha técnica de una automática dice «Lo calcula el sistema · Acuses de lectura confirmados · Toda la entidad».
- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/indicadores-formulario.test.tsx tests/indicadores-impresion.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, `npm run lint` y `tests/colores-fijos.test.ts`.
- [ ] **Step 5: Commit** — `feat(f14b): el formulario de la ficha elige «Lo calcula el sistema», el cálculo y su alcance`

---

### Task 5: «Falta un dato»: nadie mide un automático

**Files:**
- Modify: `src/db/consultas/indicadores/tareas.ts` (`columnasDePendiente`, `Falta`, `queFalta`, `deMediciones`), `src/db/consultas/indicadores/vencimientos.ts` (`leer`), `src/db/consultas/indicadores/lista.ts`, `src/db/consultas/indicadores/lectura.ts` (`filaDeMedicion`, `medicionParaReportar`), `src/db/consultas/indicadores/mediciones.ts` (`contextoDeMedicion`, `recalcularMedicion`), `src/db/consultas/indicadores/cierre.ts` (`resumenDeCierre`, `reabrirMedicion`), `src/db/consultas/indicadores/soportes.ts` (`autorizarSoporte`), los llamadores de `contextoDeMedicion` que el compilador señale, la pantalla de reportar (`src/app/(app)/indicadores/[codigo]/reportar/[periodo]/page.tsx` y su componente)
- Test: `tests/indicadores-tareas.test.ts`, `tests/indicadores-vencimientos.test.ts`, `tests/indicadores-mediciones.test.ts`, `tests/indicadores-cierre.test.ts`, `tests/indicadores-lectura.test.ts`, `tests/indicadores-soportes.test.ts`, `tests/indicadores-reporte.test.tsx`

**Interfaces:**
- Consumes: `VersionDeCalculo.origenDato` (T3).
- Produces:
  - `type Falta = "reporte" | "analisis" | "dato"`. `columnasDePendiente` lleva `origenDato` en el JSON de versiones. `queFalta`: sin datos (`reportada_en` nulo) y con la versión que rige el periodo automática → `"dato"`; lo demás, como hoy.
  - `"dato"` no es tarea (`deMediciones`), no entra a ningún paso de la pasada (`leer` la descarta: ni aviso previo, ni vencido, ni escalamiento) y no cuenta en la insignia.
  - Estado visible: `filaDeMedicion` pasa `faltaDatoAjeno: true` y **`vencida: false`** para una medición automática abierta sin datos; la lista dice «Falta un dato» y no la cuenta entre los vencidos.
  - `contextoDeMedicion` gana la opción `digita?: boolean` (por omisión `true`): con `true` y la versión que rige automática lanza `ErrorIndicador("Este indicador lo calcula el sistema: sus datos no se digitan")`. Pasan `digita: false` quienes no digitan: analizar, observar y responder, reabrir y las lecturas. `autorizarSoporte` responde 409 en una medición automática.
  - `recalcularMedicion`: en una versión automática `conSoporte` es siempre verdadero.
  - `resumenDeCierre`: en `sinDato`, una medición automática lleva `quien: ["El sistema"]`. `reabrirMedicion` de una automática avisa a `responsablesDeAnalizar`.
  - La pantalla de reportar de una medición automática es de solo lectura: «Este indicador lo calcula el sistema. Nadie digita sus datos.», los valores si ya hay foto, y el análisis para quien analiza.

- [ ] **Step 1: Write the failing tests** (añadidos a los archivos existentes; indicador con `calculo` del ayudante de T3, medición insertada por SQL):
  - tareas: una medición automática abierta sin datos no es tarea de nadie (ni de un líder del proceso, ni del Admin SGC de respaldo); con resultado que no cumple y sin análisis, la tarea «Analizar …» sale a quien analiza;
  - vencimientos: pasada con la fecha límite vencida y pasados los días de escalamiento → ningún aviso, ninguna marca (`aviso_previo_en`, `aviso_vencido_en` y `escalado_en` nulos);
  - mediciones: `reportar`, `marcarNoAplica` y `registrarHistoricos` sobre una automática → «Este indicador lo calcula el sistema: sus datos no se digitan»; sobre una medición **anterior** al cambio de manual a automático (la rige la versión manual), `reportar` funciona;
  - cierre: el resumen dice «El sistema»; reabrir avisa a quien analiza y no a quien «medía»;
  - lectura y lista: «Falta un dato», sin «Vencida»;
  - soportes: `autorizarSoporte` → 409.
- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/indicadores-tareas.test.ts tests/indicadores-vencimientos.test.ts tests/indicadores-mediciones.test.ts tests/indicadores-cierre.test.ts tests/indicadores-lectura.test.ts tests/indicadores-soportes.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, más `tests/indicadores-reporte.test.tsx`, `tests/indicadores-analisis.test.ts`, `tests/tareas.test.ts` y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): «Falta un dato» - un automático no genera tareas, vencidos ni escalamientos, y nadie lo digita`

---

### Task 6: Tomar un cálculo (el camino de sistema)

**Files:**
- Create: `src/db/consultas/indicadores/calculos.ts`; `tests/indicadores-calculos-bd.test.ts`
- Modify: `src/db/consultas/vigencia/indicadores.ts` y `src/lib/indicadores-documentales/metas.ts` (`ResultadoIndicadores` gana `conformidadDelPeriodo: Medicion`: el numerador y el denominador que hoy solo salen en un texto)
- Test: `tests/indicadores-documentales.test.ts`

**Interfaces:**
- Consumes: el registro (T2); `indicadoresDocumentales(sesion, { periodo, procesoId? }, { sql, ahora })` de la 13C.
- Produces:
  - `type PeticionDeCalculo = { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo; procesoId: number; indicadorId: number; periodo: { clave: string; desde: Date; hasta: Date }; ahora: Date }`.
  - `tomarCalculo(sql: Cliente, p: PeticionDeCalculo, memo?: Map<string, ResultadoIndicadores>): Promise<{ A: string; B?: string }>` — los valores crudos, en texto con punto decimal; quien llama decide «no aplica» con `fotoDe`.
  - Los ocho documentales: una llamada a `indicadoresDocumentales` con la sesión de sistema (constante privada del archivo), `periodo: p.periodo.clave` y `procesoId` solo con alcance `proceso`; `memo` reutiliza el resultado por `clave del periodo | procesoId` dentro de una pasada. De cada `IndicadorMedido` se toman `numerador` y `denominador` (en `vencidos`, A es su `valor`); `conformidad_periodo` sale de `conformidadDelPeriodo`.
  - `reportes_a_tiempo` (§5.2 del anexo): mediciones con `vence_en` dentro del periodo, no históricas, de la versión que rige manual y de su periodicidad, sin las que seguían sin reportar cuando el indicador se retiró antes de su fecha límite; con alcance `proceso`, `i.proceso_id = p.procesoId`; el primer reporte es `min(creado_en)` de sus eventos `reporte` o `no_aplica`. Cuenta con `reportesATiempo`.
  - `objetivos_cumplidos` (§5.2 del anexo): objetivos activos de la clase del alcance; indicadores activos cuya ficha vigente los apunta, salvo `p.indicadorId` y los que tienen `indicadores.calculo = 'objetivos_cumplidos'`; de cada uno, la última medición con `hasta` dentro del periodo, con `resultado_exacto` y sin «no aplica»; `cumpleDeFila` de cada una. Cuenta con `objetivosCumplidos`.

- [ ] **Step 1: Write the failing tests** en `tests/indicadores-calculos-bd.test.ts` (todo dentro de `revertida`, con datos sembrados en la transacción):
  - **cada uno de los ocho documentales da el numerador y el denominador que `indicadoresDocumentales` le da a un Administrador del SGC real** (usuario `zz_`), con y sin `procesoId`;
  - cuenta un documento restringido vencido que un líder de otro proceso no vería;
  - `conformidad_periodo`: dos verificaciones cerradas en el periodo, una conforme → `{ A: "1", B: "2" }`;
  - `reportes_a_tiempo`: una reportada a tiempo, una tarde, una nunca reportada, una «no aplica» a tiempo, una histórica y una de un automático, todas con fecha límite en el periodo → `{ A: "2", B: "4" }`; una corrección posterior de la reportada a tiempo no la vuelve tardía; con alcance `proceso` solo cuenta las de ese proceso; una de un indicador restringido cuenta;
  - `objetivos_cumplidos`: un objetivo con sus dos indicadores cumpliendo, otro con un «Bien» con `cumple = false`, otro sin mediciones en el periodo y otro de la otra clase → con `calidad`, `{ A: "1", B: "2" }`; el indicador que pide el cálculo no entra en su propia cuenta; un objetivo inactivo no cuenta; una medición con `cumple` nulo y semáforo «bien» (anterior a la `0012`) cuenta como cumplida.
  En `tests/indicadores-documentales.test.ts`: `conformidadDelPeriodo` coincide con el texto «en el periodo: …» de la tarjeta.
- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/indicadores-calculos-bd.test.ts`.
- [ ] **Step 3: Implement.** La sesión de sistema cumple `SesionFlujo` (`sesionId`, `usuarioId: 0`, `usuario`, `nombre: "El sistema"`, `rol: "admin_sgc"`, `verHistorial: true`).
- [ ] **Step 4: Run to verify they pass**, más `tests/indicadores-documentales.test.ts` completo y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): el sistema toma los diez cálculos, con el alcance del Administrador del SGC`

---

### Task 7: La foto y «Volver a calcular»

**Files:**
- Create: `src/db/consultas/indicadores/fotos.ts`; `src/lib/indicadores/fotos.ts` (reglas puras); `tests/indicadores-fotos.test.ts`
- Modify: `src/db/consultas/indicadores/vencimientos.ts` (`revisarVencimientosDeIndicadores`), `src/db/consultas/indicadores/cierre.ts` (`abrirPeriodosDelCierre`), `src/db/consultas/indicadores/lectura.ts` (`FilaDelAnio`), `src/lib/indicadores/historial.ts`, `src/app/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`, la tabla del año y la pantalla de reportar (muestran la foto y el botón), la lista (marca «Automático»)
- Test: `tests/indicadores-vencimientos.test.ts`, `tests/indicadores-cierre.test.ts`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Consumes: `tomarCalculo` (T6), `fotoDe` y `CALCULOS` (T2), `recalcularMedicion`, `versionesAprobadas`, `versionQueRigeEntre`.
- Produces (`src/lib/indicadores/fotos.ts`, puro):
  - `cuandoSeCalcula(m: { clase: "estado" | "flujo"; hasta: Date; venceEn: Date; historica: boolean }): Date` — flujo ordinario: `venceEn`; estado, o histórica: `hasta`.
  - `textoDeFoto(fotoEn: Date, zona: string): string` → «foto del 1 de abril, 7:12 a. m.»; `textoDeEspera(cuando: Date, zona: string): string` → «Se calcula el 10 de abril».
- Produces (`src/db/consultas/indicadores/fotos.ts`):
  - `tomarFotos(opciones: { sql: Cliente; ahora: Date; indicadorId?: number; maximoPorIndicador?: number }): Promise<{ tomadas: number; noAplica: number }>` (por omisión, 12 por indicador y pasada). Para cada medición **abierta**, sin `foto_en`, sin «no aplica», de un indicador activo, cuya versión que rige el periodo es automática y cuyo `cuandoSeCalcula` ya pasó:
    - de **estado**, solo la del periodo más reciente terminado del indicador; las anteriores se dejan como están;
    - una **histórica** solo si el cálculo es `reconstruible`;
    - `objetivos_cumplidos` y `reportes_a_tiempo` se toman **al final** de la pasada: leen otras mediciones, también las de automáticos que esa misma pasada acaba de fotografiar;
    - una transacción por medición, con el indicador `FOR SHARE` y la medición `FOR UPDATE`, todo releído bajo el candado; la que falla se registra y se salta;
    - escribe sus valores en `medicion_valores` (`reportado_por` nulo, `reportado_en = ahora`), `reportada_en = ahora`, `reportada_por` nulo y `foto_en = ahora`; si `fotoDe` dice «no aplica», no escribe valores y pone `no_aplica = true` con ese motivo;
    - `recalcularMedicion(tx, id, { ahora, actorId: null, evento: "foto", detalle: { calculo, alcance, valores | noAplica } })`.
  - `volverACalcular(sesion: SesionFlujo, medicionId: number, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ cambio: boolean }>` — exige `indicadores.administrar`; solo una medición con foto de un cálculo de **flujo**; rechaza la cerrada (el mensaje de siempre), la reabierta («La foto quedó congelada con el cierre: reabrirla solo deja cambiar el análisis») y la de estado («La foto de este cálculo se toma una sola vez»); reescribe los valores, o pone o quita «no aplica»; `recalcularMedicion` con evento `foto` y `detalle: { recalculo: true, antes, despues }`; si nada cambió, no deja evento ni bitácora; si cambió, acción `medicion_foto_recalculada` (`{ codigo, periodo, antes, despues }`; frase: «Volvió a calcular *código*, *periodo*: de *antes* a *después*»).
  - `revisarVencimientosDeIndicadores` llama `tomarFotos` después de abrir los periodos y antes de los avisos; `abrirPeriodosDelCierre` también, antes de clasificar. `tomarFotos` no se llama desde `asegurarMediciones`.
  - `FilaDelAnio` gana `automatica: boolean`, `fotoEn: Date | null` y `seCalcula: Date | null`. La tabla del año y la pantalla de reportar muestran «Calculado por el sistema · foto del …» o «Se calcula el …», y a quien administra, en un cálculo de flujo sin cerrar ni reabrir, el botón **«Volver a calcular»**. El historial de una medición dice «El sistema tomó la foto» y «Se volvió a calcular». La lista marca el indicador con la insignia «Automático».
  - Server Action `volverACalcularAccion` (`mutacion(formData, "indicadores.administrar", …)`).

- [ ] **Step 1: Write the failing tests** en `tests/indicadores-fotos.test.ts` (dentro de `revertida`; `tomarCalculo` se alimenta con datos sembrados o, donde el test lo diga, con un `vi.mock` del módulo `calculos`):

```ts
it("flujo: no se toma antes de vencer el plazo; después, una vez", …);
//  'etapas' mensual, plazo 10: con ahora = día 5 del mes siguiente → nada; con día 11 → valores A y B, reportada_en, foto_en, evento 'foto'
//  sin usuario, resultado calculado; otra pasada → { tomadas: 0, noAplica: 0 } y ningún evento más
it("estado: en la primera revisión después del fin del periodo", …);
it("estado: si pasaron dos periodos, la foto es solo del más reciente", …);                      // Review Focus 2
it("una histórica se calcula sola si el cálculo se llena hacia atrás", …);
it("sin nada que medir queda «No aplica» con el motivo del cálculo; un conteo en cero es un resultado 0", …);  // Review Focus 4
it("si el resultado no cumple la meta salen las alertas y la tarea de analizar", …);
it("no toca una medición cerrada ni la de un indicador retirado", …);
it("una medición anterior al cambio de manual a automático no recibe foto", …);
it("volver a calcular: cambia los valores y deja el antes y el después", …);
it("volver a calcular: rechaza la cerrada, la reabierta, la de estado y a quien no administra", …);
it("el cierre del mes toma antes las fotos pendientes", …);
it("«Objetivos cumplidos» se toma después de los demás automáticos de la misma pasada", …);
it("una medición fotografiada, sin usuario, sale en la tabla del año, la matriz, el Excel del indicador y el impreso", …);
//  tablaDelAnio, la consulta de la matriz, el Excel de `/indicadores/[codigo]/excel` y `impresion.ts`: con su resultado y sus valores A y B;
//  ninguna lectura puede perderla por unir con quien reportó (`reportada_por` y `reportado_por` son nulos por primera vez)
```

  En `tests/indicadores-vencimientos.test.ts`: la pasada completa toma la foto y, si no cumple, avisa a quien analiza en la misma pasada.
- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/indicadores-fotos.test.ts`.
- [ ] **Step 3: Implement.** Recuerde reiniciar `next dev` después de añadir la Server Action (memoria del proyecto: un 500 «reading 'apply'» es el manifiesto viejo).
- [ ] **Step 4: Run to verify they pass**, más `tests/indicadores-vencimientos.test.ts`, `tests/indicadores-cierre.test.ts`, `tests/indicadores-lectura.test.ts`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): la foto de cada periodo - el sistema calcula, marca «No aplica» y deja volver a calcular hasta el cierre`

---

### Task 8: Vigencia, Configuración documental y Distribución usan la meta de la ficha

**Files:**
- Create: `src/db/consultas/indicadores/fichas-de-calculo.ts` (lee solo tablas de indicadores, por SQL directo: no importa `calculos.ts`, `mediciones.ts`, Vigencia ni Distribución, que son quienes lo van a importar)
- Modify: `src/db/consultas/vigencia/indicadores.ts`, `src/lib/indicadores-documentales/metas.ts` (`IndicadorMedido`), el componente de tarjetas de `/vigencia/indicadores` y `src/lib/vigencia/indicadores-excel.ts`, `src/db/consultas/config-documental.ts`, `src/app/admin/acciones-config-documental.ts`, `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx`, `src/db/consultas/distribucion/verificaciones-resumen.ts`, el componente de estado de puntos de Distribución
- Create (test): `tests/vigencia-indicadores-ficha.test.ts`
- Test: `tests/indicadores-documentales.test.ts`, el test de Distribución que cubre `estadoDePuntos`

**Interfaces:**
- Consumes: `indicadores.calculo`, `calculo_alcance` (T1, T3); `indicador_versiones` e `indicador_metas` por SQL; `periodoQueContiene`; `puedeVerIndicador`.
- Produces (`fichas-de-calculo.ts`):
  - `type FichaActivaDelCalculo = { indicadorId: number; codigo: string; meta: string | null }` (no confundir con `fichaDeCalculo` de `src/lib/indicadores/reporte.ts`, que arma el árbol de la fórmula).
  - `fichaActivaDelCalculo(sql: Cliente, c: { clave: ClaveDeCalculo; alcance: AlcanceDeCalculo; procesoId: number | null; ahora: Date }): Promise<FichaActivaDelCalculo | null>` — la ficha activa de ese cálculo y alcance; `meta` es la que rige el **periodo en curso** de su periodicidad (la programada en `indicador_metas`, si la hay y la versión tiene meta; si no, la de la versión vigente).
  - `metaDeConformidad(umbralDeConfiguracion: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ umbral: number; ficha: string | null }>` — la de la ficha de `conformidad_fecha`/`entidad` si tiene meta; si no, `umbralDeConfiguracion` y `ficha: null`. `ficha` es el código **solo si `sujeto` puede ver ese indicador** (`puedeVerIndicador`); la meta se aplica igual.
  - `metasQueFijaUnaFicha(opciones?: { sql?: Cliente; ahora?: Date }): Promise<Partial<Record<"dentroPlazoPct" | "aprobacionDias" | "vencidos" | "acusesPct" | "externosPct" | "etapasPlazoPct" | "umbralConformidadPct", string>>>` — el código de la ficha de alcance `entidad` con meta, por campo de Configuración documental.
- Produces (13C y 13B, sin cambiar sus reglas):
  - `IndicadorMedido` gana `ficha: { codigo: string } | null`: el código, solo si la persona puede ver esa ficha (`puedeVerIndicador`); si no, `null`, y la meta se aplica igual. En `indicadoresDocumentales`, para cada tarjeta con `documental` en el registro y con ficha del alcance del filtro (sin proceso, `entidad`; con proceso, `proceso` de ese proceso) **con meta**: `meta` es la de la ficha y `cumple` se decide con ella y con las funciones de hoy (`cumplePorcentaje`, `cumple`). Sin ficha o sin meta, todo como hoy.
  - La tarjeta enlaza **«Ver ficha *código*»** cuando `ficha` no es nulo; el Excel añade la columna «Ficha» (vacía para quien no la ve).
  - `estadoDePuntos` e `historialVerificaciones` usan `metaDeConformidad(distribucion.umbralConformidadPct, sesion, …)`; el estado de puntos dice «Umbral *N* % · lo fija la ficha *código*» solo a quien puede ver esa ficha, y «Umbral *N* %» a los demás.
  - Configuración documental: un campo con ficha se muestra deshabilitado con «La fija la ficha *código*» y el guardado conserva el valor guardado de ese campo, venga lo que venga.

- [ ] **Step 1: Write the failing tests** en `tests/vigencia-indicadores-ficha.test.ts` (dentro de `revertida`):
  - sin ficha, `indicadoresDocumentales` da las metas de Configuración documental y `ficha: null` en las siete;
  - con una ficha activa de `etapas`/`entidad` con meta 80: la tarjeta «etapas» trae `meta: 80`, su `cumple` cambia con ella y `ficha.codigo`; con filtro de un proceso sigue la meta de Configuración (la ficha es de la entidad); con una ficha `etapas`/`proceso` de ese proceso, la del proceso;
  - una meta programada para el periodo en curso manda sobre la de la ficha;
  - una ficha restringida: para un usuario de rol Consulta `ficha` es `null` (su código no sale en la tarjeta ni en Distribución) y la meta se aplica igual;
  - `metaDeConformidad`: sin ficha, el umbral de Configuración; con la ficha de `conformidad_fecha` con meta 90, 90 y su código; `estadoDePuntos` y `historialVerificaciones` devuelven `umbral: 90` y su `cumple` cambia; la tarjeta «conformidad» de Vigencia dice lo mismo que Distribución;
  - el guardado de Configuración documental no cambia un campo que fija una ficha.
- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/vigencia-indicadores-ficha.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, más `tests/indicadores-documentales.test.ts`, los tests de Distribución y de Configuración documental que el cambio toque, y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): una sola meta - Vigencia, Distribución y Configuración documental usan la de la ficha del cálculo`

---

### Task 9: La página «Objetivos»

**Files:**
- Create: `src/db/consultas/indicadores/objetivos.ts`, `src/app/(app)/indicadores/objetivos/page.tsx`, `src/componentes/indicadores/Objetivos.tsx`; `tests/indicadores-objetivos.test.ts`
- Modify: `src/componentes/indicadores/PestanasIndicadores.tsx`, `src/lib/esquemas/indicadores.ts` (`CODIGOS_RESERVADOS` y su mensaje)
- Test: `tests/paginas-sesion.test.ts`, `tests/modulo-indicadores-vistas.test.tsx`, `tests/indicadores-fichas.test.ts`

**Interfaces:**
- Consumes: `estadoDeObjetivo`, `ETIQUETA_ESTADO_OBJETIVO` (T2); `filtroIndicadores`; `cumpleDeFila`; `textoValor`.
- Produces:
  - `periodosDeObjetivos(ahora: Date, zona: string): { clave: string; etiqueta: string }[]` — del año en curso y del anterior: el año, sus dos semestres y sus cuatro trimestres, del más reciente al más antiguo, sin los que no han empezado.
  - `type ObjetivoLeido = { id: number; clase: "calidad" | "institucional"; enunciado: string; estado: EstadoDeObjetivo; indicadores: { codigo: string; nombre: string; proceso: string; periodo: string | null; resultado: string | null; semaforo: Semaforo | null; cumple: boolean | null }[] }`.
  - `objetivosDelPeriodo(sesion: SujetoVisibilidad, periodo: string, opciones?: { sql?: Cliente; ahora?: Date }): Promise<ObjetivoLeido[]>` — objetivos activos, por clase y orden; de cada uno, los indicadores activos **que la persona ve** cuya ficha vigente lo apunta; de cada indicador, su última medición con `hasta` dentro del periodo (con resultado y sin «no aplica»); el estado, con `estadoDeObjetivo` sobre esos.
  - `/indicadores/objetivos`: `exigirSesion()`; `?periodo=` inválido es el año en curso; pestaña **«Objetivos»**, después de «Matriz del año», para toda sesión. Cada objetivo, una tarjeta con su enunciado, su estado en una `Insignia` con texto, y su tabla de indicadores (código enlazado, nombre, proceso, periodo, resultado con su insignia de semáforo y la salvedad «no alcanza la meta»); un objetivo sin indicadores visibles dice «Sin indicadores que mostrar». Sin objetivos: `EstadoVacio` «Aún no hay objetivos: se crean en Configuración de indicadores».
  - `CODIGOS_RESERVADOS` gana `"objetivos"`; el mensaje: «`«nuevo», «matriz», «por-aprobar», «cierre», «excel» y «objetivos» son nombres reservados: elija otro código`».

- [ ] **Step 1: Write the failing tests** en `tests/indicadores-objetivos.test.ts`: un objetivo con dos indicadores que cumplen → «cumplido»; con uno en Bien y `cumple = false` → «no_cumplido»; con mediciones solo fuera del periodo → «sin_medicion»; un usuario de rol Consulta no recibe el indicador restringido y el estado se calcula **sin él** (con solo el restringido incumpliendo, para Consulta el objetivo sale «cumplido» o «sin_medicion» según lo que vea, y para el Admin SGC «no_cumplido»); un objetivo inactivo no sale; `periodosDeObjetivos` con `ahora` 2026-11-14 empieza por «2026» y no trae «2027». `crearIndicador` con código `objetivos` se rechaza con el mensaje nuevo. Render de la pestaña y de una tarjeta en `tests/modulo-indicadores-vistas.test.tsx`.
- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/indicadores-objetivos.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, más `tests/paginas-sesion.test.ts`, `tests/a11y-estructura.test.ts` si lista páginas, `tests/colores-fijos.test.ts` y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): página «Objetivos» - cada objetivo con sus indicadores y si se cumplió en el periodo`

---

### Task 10: Constancias de envío: reglas, registro y vencimientos

**Files:**
- Create: `src/lib/indicadores/constancias.ts`, `src/db/consultas/indicadores/constancias.ts`, `src/db/consultas/indicadores/constancias-vencidas.ts`; `tests/indicadores-constancias.test.ts`
- Modify: `src/db/consultas/indicadores/fichas.ts` (`revisar`), `src/db/consultas/indicadores/publicacion.ts`, `src/db/consultas/indicadores/operacion.ts` (`retirar`), `src/db/consultas/indicadores/tareas.ts`, `src/db/consultas/indicadores/vencimientos.ts`, `src/lib/tareas.ts` (`GRUPOS`), `src/app/acciones-indicadores.ts`, `src/lib/esquemas/indicadores.ts`, `src/lib/bitacora-detalle.ts`, `src/db/semillas/indicadores-demo-fichas.ts` (el regulatorio de la demo nace hoy con el plazo del ente vacío: désele uno, o la semilla deja de sembrar)
- Test: `tests/indicadores-tareas.test.ts`, `tests/indicadores-vencimientos.test.ts`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Consumes: `contiene`, `periodosTerminados`, `periodoQueContiene`, `fechaLimiteDeReporte` (`periodos.ts`); `acumulado` (`acumulado.ts`) y `leerPeriodos` (`lectura.ts`); `puedeMedir`, `responsableDe`, `responsablesDeMedir`, `sinResponsable`; `avisarA`, `jefesDe`; `alPublicarVersion` (T3).
- Produces (`src/lib/indicadores/constancias.ts`, puro):
  - `errorDeEnte(d: { ente?: string; periodicidadExterna?: Periodicidad; plazoExternoDias?: number; periodicidad: Periodicidad }): string | null`, en este orden: con periodicidad externa o plazo y sin ente, «Escriba el ente al que se reporta»; con ente y sin periodicidad externa, «Diga con qué periodicidad se reporta al ente»; con ente y sin plazo, «Diga el plazo del ente en días»; con periodicidad externa que no contiene a la de medición, «La periodicidad del ente debe ser la de medición o una que la contenga». `revisar` lo aplica al guardar.
  - `enteCompleto(v: { ente: string | null; periodicidadExterna: string | null; plazoExternoDias: number | null }): boolean`.
- Produces (`publicacion.ts`): `alPublicarVersion` compara el ente, la periodicidad externa y el plazo de la versión que se publica con los de la versión aprobada anterior: si la nueva tiene el ente completo y algo cambió (o la anterior no lo tenía), `indicadores.ente_desde = ahora`; si la nueva no lo tiene completo, `ente_desde = NULL` y se borran las constancias `pendiente` sin eventos del indicador. `retirar` borra también las pendientes sin eventos.
- Produces (`constancias.ts`):
  - `asegurarConstancias(opciones: { sql: Cliente; ahora: Date; indicadorId?: number }): Promise<number>` — idempotente. Un indicador activo cuya vigente tiene el ente completo **y una periodicidad externa que contiene a la de medición** (`enteCompleto` y `contiene`) y que aún no tiene `ente_desde` (se aprobó antes de esta entrega) lo recibe aquí, `ente_desde = ahora`: no se le abren periodos anteriores. Después, para cada indicador activo con `ente_desde` y esa misma condición, una fila `pendiente` por cada periodo de la periodicidad externa con `hasta > ente_desde` y ya terminado, con `ente` (el de la vigente), `vence_en = fechaLimiteDeReporte(periodo, plazoExternoDias, zona)`; `ON CONFLICT DO NOTHING`. La llaman `revisarVencimientosDeIndicadores` (después de abrir periodos) y la lectura de la página del indicador.
  - `puedeRegistrarConstancia(indicadorId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>` — quien ve el indicador y puede medirlo (`puedeMedir`) o tiene `indicadores.administrar`.
  - `resultadoDelPeriodoExterno(sql: Cliente, indicadorId: number, periodo: string, ahora: Date): Promise<{ texto: string | null; exacto: string | null; parcial: boolean; faltan: string[]; sinCerrar: string[] }>` — el acumulado de §8.10 sobre los periodos de medición que el periodo externo contiene; `faltan` son las etiquetas de los periodos sin dato y `sinCerrar`, las de los que no están cerrados; `parcial` si alguna de las dos no está vacía.
  - `registrarConstancia(sesion: SesionFlujo, d: { reporteId: number; fechaEnvio: string; radicado: string; nota?: string }, opciones?): Promise<void>` — permiso `indicadores.medir` y `puedeRegistrarConstancia`; indicador `FOR SHARE` y constancia `FOR UPDATE`; solo una `pendiente` («La constancia ya está registrada: corríjala»); `fechaEnvio` no futura en la zona («La fecha de envío no puede ser futura»); radicado de 1 a 100 caracteres («Escriba el radicado o número de constancia»); al menos un soporte («Adjunte al menos un soporte antes de registrar»); guarda `resultado_enviado` y `resultado_detalle` (`{ exacto, parcial, faltan, sinCerrar }`); evento `registro`; bitácora `constancia_registrada` (`{ codigo, periodo, ente, radicado, fechaEnvio, resultado }`).
  - `corregirConstancia(sesion, d: { reporteId: number; fechaEnvio: string; radicado: string; nota?: string; justificacion: string }, opciones?): Promise<void>` — solo una `registrada`; justificación de 10 a 500 caracteres («La justificación debe tener al menos 10 caracteres»); no toca el resultado congelado; `corregida = true`; evento `correccion` con `{ justificacion, antes, despues }`; bitácora `constancia_corregida`.
  - `type Constancia = { id: number; periodo: string; etiqueta: string; ente: string; venceEn: Date; estado: "pendiente" | "registrada"; vencida: boolean; fechaEnvio: string | null; radicado: string | null; resultadoEnviado: string | null; parcial: boolean; nota: string | null; registradaPor: string | null; registradaEn: Date | null; corregida: boolean }`; `constanciasDe(sesion: SujetoVisibilidad, indicadorId: number, opciones?): Promise<Constancia[] | null>` (`null` a quien no ve el indicador; de la más reciente a la más antigua).
  - `tareasDeConstancias(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]>` — las `pendiente` de indicadores activos que la persona ve y de las que es responsable de medir (`responsableDe(…, "mide")`): id `constancia:<id>`, título «Registrar el reporte a *ente*: *código*, *periodo*», vence `vence_en`, enlace a `/indicadores/<código>?vista=reportes`. `tareasDeIndicadores` las suma y cuenta las vencidas en `vencidas`. `GRUPOS` gana el prefijo `constancia:` («*N* reportes al ente por registrar», enlace `/indicadores?envio=pendiente&participo=1`).
- Produces (`constancias-vencidas.ts`): `constanciasVencidas(c: { sql: Cliente; ahora: Date; zona: string; escalamientoDias: number }): Promise<{ avisados: number; escalados: number }>` — dos pasos con la mecánica de `vencimientos.ts` (candidatas por marca nula, releídas con `FOR UPDATE SKIP LOCKED`, lo que puede fallar antes del candado): **vencido** (`aviso_vencido_en`), un aviso `indicadores.envio_vencido` por persona a quienes tienen la tarea («Tiene *N* reportes al ente con el plazo vencido») y otro por proceso a sus líderes; **escalamiento** (`escalado_en`), pasados `escalamientoDias`, aviso `indicadores.envio_escalado` a los jefes de quien tiene la tarea, **sin código, nombre ni enlace** («*N* reportes al ente a cargo de *nombre* siguen vencidos»); lo que el Admin SGC tiene de respaldo no se escala. `revisarVencimientosDeIndicadores` la llama después de sus tres pasos y suma sus cuentas.
- Produces (acciones): `registrarConstanciaAccion` y `corregirConstanciaAccion` (`mutacion(formData, "indicadores.medir", …)`; la condición de persona la exige la consulta), con sus esquemas `.strict()`.

- [ ] **Step 1: Write the failing tests** en `tests/indicadores-constancias.test.ts` (dentro de `revertida`):

```ts
it("el ente va completo y su periodicidad contiene a la de medición", …);   // los cuatro mensajes de errorDeEnte; mensual → trimestral vale; trimestral → mensual no; bimestral → trimestral no
it("añadir el ente a una ficha con años de historia no abre constancias vencidas", …);   // Review Focus 5
//  indicador con inicio 2024-01 y mediciones; cambio menor que pone el ente (trimestral, 15 días) publicado el 2026-11-14 →
//  ente_desde = ahora; asegurarConstancias con ahora = 2026-11-14 → 0; con ahora = 2027-01-02 → 1 (2026-T4), vence el 2027-01-15
it("una ficha importada tampoco", …);
it("una ficha aprobada antes de esta entrega con el ente completo empieza a contar desde que el sistema la ve", …);
//  versión aprobada por SQL con ente, trimestral y plazo, ente_desde nulo → asegurarConstancias pone ente_desde = ahora y no crea ninguna;
//  con una periodicidad externa que no contiene a la de medición, ni ente_desde ni constancias
it("asegurarConstancias es idempotente y guarda el ente y la fecha límite de cuando nació", …);
it("cambiar el ente no toca las constancias que ya existen; las nuevas llevan el nombre nuevo", …);
it("quitar el ente o retirar el indicador quita las pendientes sin soporte y conserva las registradas", …);
it("registrar: fecha no futura, radicado, soporte y resultado congelado", …);
//  con 3 meses reportados (2 cerrados): resultado_enviado con la unidad, resultado_detalle.parcial true y sinCerrar con el mes abierto
it("registra quien mide y quien administra; quien solo ve el indicador, no", …);
it("corregir exige justificación, no cambia el resultado y deja el antes y el después", …);
it("la tarea es de quien mide, con su respaldo, y cuenta en la insignia cuando vence", …);
it("vencido: un aviso por persona y otro al líder; escalamiento al jefe sin nombrar el indicador", …);
it("una constancia de un indicador restringido no le sale a quien no lo ve", …);
```

- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/indicadores-constancias.test.ts`.
- [ ] **Step 3: Implement.** En el test de «registrar», el soporte se inserta por SQL en `archivos` (`contexto = 'reporte_externo'`): la subida es de T11.
- [ ] **Step 4: Run to verify they pass**, más `tests/indicadores-tareas.test.ts`, `tests/indicadores-vencimientos.test.ts`, `tests/indicadores-fichas.test.ts` (la demo y los tests que guardan un ente incompleto se ajustan aquí), `tests/tareas.test.ts`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): constancias de envío al ente - nacen desde que la ficha se reporta, se registran con su resultado y vencen`

---

### Task 11: Constancias de envío: soporte, vista «Reportes al ente» y marcas en la lista

**Files:**
- Create: `src/app/api/reportes-externos/[id]/archivos/route.ts`, `src/componentes/indicadores/vistas/ReportesAlEnte.tsx`
- Modify: `src/proxy.ts` (`matcher`), `src/db/consultas/admin.ts` (`registrarArchivo`), `src/db/consultas/indicadores/soportes.ts` (`soporteServible`), `src/db/consultas/indicadores/constancias.ts`, `src/app/(app)/indicadores/[codigo]/page.tsx` y `_vistas.ts` (vista `reportes`), `src/db/consultas/indicadores/lista.ts` (`FilaDeLista`, `FiltroDeLista`), `src/componentes/indicadores/ListaIndicadores.tsx`, `src/app/acciones-indicadores.ts`, `AGENTS.md` (subidas fuera del `matcher`)
- Test: `tests/proxy-matcher.test.ts`, `tests/indicadores-constancias.test.ts`, `tests/indicadores-soportes.test.ts`, `tests/handlers-permisos.test.ts` (si lista handlers), `tests/indicadores-pantalla.test.tsx`, `tests/indicadores-consulta.test.ts`

**Interfaces:**
- Consumes: `puedeRegistrarConstancia`, `constanciasDe`, `registrarConstancia`, `corregirConstancia` (T10); `recibirArchivo`; `puedeVerSoportes`.
- Produces:
  - `POST /api/reportes-externos/[id]/archivos`, calcado de `api/mediciones/[id]/archivos`: 401 sin sesión; 403 sin `indicadores.medir` o con `Origin` ajeno; 404 si la constancia no existe o la persona no ve su indicador; 403 si lo ve y no puede registrar; 409 si el indicador no está activo; `recibirArchivo(peticion, { contexto: "reporte_externo", contextoId, carpeta: \`reportes-externos/${id}\` }, usuarioId)` (PDF o imagen: el tipo por omisión). Fuera del `matcher`, con su caso en `tests/proxy-matcher.test.ts`.
  - `autorizarSoporteDeConstancia(reporteId: number, sesion: SujetoVisibilidad, opciones?): Promise<{ ok: true } | { ok: false; estado: 403 | 404 | 409 }>` y `bloquearParaSoporteDeConstancia(tx: TransactionSql, reporteId: number): Promise<void>` (indicador `FOR SHARE` y activo, constancia `FOR UPDATE`); `registrarArchivo` gana la rama `reporte_externo`, que bloquea así y deja el evento `soporte` (`{ nombre, accion: "subido" }`).
  - `quitarSoporteDeConstancia(sesion: SesionFlujo, d: { archivoId: number }, opciones?): Promise<void>` — solo de una `pendiente` («Un soporte de una constancia registrada no se quita»); evento `soporte` con `accion: "quitado"`; acción de bitácora `constancia_soporte_quitado`. Server Action `quitarSoporteDeConstanciaAccion`.
  - `soporteServible` sirve también un archivo `reporte_externo` de una constancia del indicador `codigo`, con la misma regla (`puedeVerIndicador` y `puedeVerSoportes`; si no, `null` y el handler responde 404), siempre como descarga.
  - `soportesDeConstancias(sesion, indicadorId, opciones?): Promise<Map<number, Soporte[]> | null>` e `historialDeConstancias(sesion, indicadorId, opciones?): Promise<Map<number, { tipo: string; quien: string; cuando: Date; texto: string }[]> | null>`: `null` a quien no ve soportes.
  - Vista **«Reportes al ente»** (`?vista=reportes`): aparece si la ficha vigente tiene ente o el indicador tiene constancias; un parámetro que la vista no admite es «no encontrada». Si la ficha tiene el ente incompleto: «Complete el ente, su periodicidad y su plazo en la ficha para llevar las constancias.». Tabla (`TablaDatos`): periodo, fecha límite, estado (`Insignia`: «Pendiente», «Vencida», «Registrada», «Registrada · corregida»), enviado el, radicado, resultado enviado (con «parcial» si lo fue) y quién lo registró; a quien ve soportes, los archivos y el historial; a quien puede registrar, el formulario de **«Registrar el envío»** (zona de carga, fecha, radicado, nota; muestra antes el resultado del periodo y, si es parcial, «El resultado es parcial: falta *…* / no están cerrados *…*. Puede registrarlo así.») y **«Corregir»** con su justificación.
  - Lista: `FilaDeLista` gana `envio: "pendiente" | "vencido" | null` (la constancia pendiente más antigua del indicador); la fila lo dice con una insignia de texto («Envío pendiente», «Envío vencido»); `FiltroDeLista` gana `envio?: "pendiente"`.

- [ ] **Step 1: Write the failing tests:** en `tests/proxy-matcher.test.ts`, la ruta nueva queda fuera del `matcher`; en `tests/indicadores-constancias.test.ts`, `autorizarSoporteDeConstancia` (404 a quien no ve el indicador, 403 a quien lo ve y no registra, 409 con el indicador retirado), el evento `soporte`, `quitarSoporteDeConstancia` (de una pendiente sí; de una registrada no) y `historialDeConstancias` (`null` para un rol Consulta sin designación); en `tests/indicadores-soportes.test.ts`, `soporteServible` de un archivo `reporte_externo` (lo recibe quien ve soportes; `null` quien solo ve el indicador; `null` con el código de otro indicador); en `tests/indicadores-consulta.test.ts`, `envio` de la lista y su filtro; render de la vista con una pendiente, una vencida y una registrada corregida.
- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/proxy-matcher.test.ts tests/indicadores-constancias.test.ts tests/indicadores-soportes.test.ts tests/indicadores-consulta.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, más `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts`, `tests/paginas-sesion.test.ts`, `tests/colores-fijos.test.ts` y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): el soporte de la constancia, la vista «Reportes al ente» y las marcas de envío en la lista`

---

### Task 12: Impactos por cambio de norma sobre los indicadores

**Files:**
- Create: `src/db/consultas/indicadores/impactos.ts`, `src/componentes/indicadores/AvisoDeImpacto.tsx`; `tests/indicadores-impactos.test.ts`
- Modify: `src/db/consultas/normograma/normas.ts` (`cambiarEstadoEn`), `src/db/consultas/indicadores/publicacion.ts`, `src/db/consultas/indicadores/operacion.ts` (`retirar`, `borrarIndicador`), `src/db/consultas/indicadores/fichas.ts` (`revisarContraLaBase`), `src/db/consultas/indicadores/aprobacion.ts` (`validarAprobacion`), `src/db/consultas/indicadores/importacion.ts` (`revisarDeshacer`), `src/db/consultas/indicadores/tareas.ts`, `src/db/consultas/indicadores/vencimientos.ts`, `src/lib/tareas.ts` (`GRUPOS`), `src/app/(app)/indicadores/[codigo]/page.tsx`, `src/componentes/normograma/PaginaImpactos.tsx` y la página `normograma/impactos/[cambioId]`, `src/app/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`
- Test: `tests/indicadores-fichas.test.ts`, `tests/indicadores-aprobacion.test.ts`, `tests/indicadores-importacion.test.ts`, `tests/normograma-pantallas.test.tsx`, los tests de impactos y de tareas de la 13C (sin cambios: deben seguir en verde), `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Consumes: `cambiarEstadoEn(tx, sesion, d, c: { ahora; plazoDias })` y `crearImpactos` (13C; `fechaLimite(ahora, plazoDias, zona)` es su plazo); `adminsActivos`; `alPublicarVersion` (T3); `filtroIndicadores`.
- Produces (`impactos.ts`):
  - `crearImpactosDeIndicadores(tx: TransactionSql, d: { cambioId: number; normaId: number; usuarioId: number; ahora: Date; plazoDias: number }): Promise<number>` — una fila `pendiente` por cada indicador `activo` cuya versión aprobada de mayor número cita la norma, con `vence_en` como los de la 13C; **sin candados explícitos sobre `indicadores`**; un aviso `indicadores.impacto` a los Administradores del SGC activos, salvo a `usuarioId` («*N* indicadores citan *norma*, que pasó a *estado*: revise cada ficha», enlace `/indicadores?impacto=1`). `cambiarEstadoEn` la llama junto a `crearImpactos` cuando el estado nuevo abre impactos, y devuelve además `impactosDeIndicadores: number`.
  - `type ImpactoDeIndicador = { id: number; norma: string; estadoNuevo: string; fecha: string; venceEn: Date; vencido: boolean }`; `impactosPendientesDe(sesion: SujetoVisibilidad, indicadorId: number, opciones?): Promise<ImpactoDeIndicador[]>` (vacío a quien no ve el indicador).
  - `resolverImpactoNoAfecta(sesion: SesionFlujo, d: { impactoId: number; nota: string }, opciones?): Promise<void>` — `indicadores.administrar`; nota de 5 a 500 caracteres («La nota debe tener al menos 5 caracteres»); impacto `FOR UPDATE` y `pendiente` («Ese impacto ya está resuelto»); bitácora `impacto_indicador_resuelto` (`{ codigo, norma, resolucion, nota }`).
  - `resolverImpactosPorVersion(tx, d: { indicadorId: number; versionId: number; elaboradaPor: number | null; elaboradaEn: Date | null; actorId: number; ahora: Date }): Promise<number>` — resuelve con `nueva_version` los pendientes del indicador con `creado_en < elaboradaEn`; `resuelto_por` es `elaboradaPor` (o `actorId` si falta). La llama `alPublicarVersion`.
  - `resolverImpactosPorRetiro(tx, d: { indicadorId: number; usuarioId: number; ahora: Date }): Promise<number>` — la llama `retirar`.
  - `tareasDeImpactosDeIndicadores(sql: Cliente, sesion: SesionFlujo): Promise<Tarea[]>` — a quien tiene `indicadores.administrar`: id `impacto-indicador:<id>`, título «Revisar *código* por el cambio de *norma*», vence `vence_en`, enlace `/indicadores/<código>?vista=ficha`. `tareasDeIndicadores` las suma; `GRUPOS` gana el prefijo `impacto-indicador:` («*N* indicadores por revisar por un cambio de norma», enlace `/indicadores?impacto=1`), y `FiltroDeLista` gana `impacto?: true`.
  - `impactosDeIndicadoresVencidos(c: { sql: Cliente; ahora: Date; escalamientoDias: number }): Promise<{ avisados: number; escalados: number }>` — con la mecánica de `impactosVencidos` de la 13C: aviso de vencido a los Administradores del SGC activos y escalamiento a sus jefes, sin nombrar el indicador. `revisarVencimientosDeIndicadores` la llama.
  - `indicadoresDelCambio(sesion: SujetoVisibilidad, cambioId: number, procesoId: number, opciones?): Promise<{ codigo: string; nombre: string; estado: "pendiente" | "resuelto"; resolucion: string | null }[]>` — los del proceso que la persona ve (`filtroIndicadores`).
- Produces (otras piezas):
  - `revisarContraLaBase`: una norma que la versión vigente ya citaba (`actual.normaIds`) se acepta en cualquier estado; solo las **nuevas** exigen vigente o modificada (mismo mensaje de hoy). `opcionesDeFicha` ya las ofrece.
  - `validarAprobacion`: una versión que cita por primera vez una norma que ya no está vigente ni modificada se rechaza: «La norma *nombre* ya no está vigente: devuelva la ficha *código*».
  - Un `40P01` (interbloqueo entre quien cambia el estado de la norma y quien guarda una ficha que la cita) no llega crudo a la persona: la acción que cambia el estado de la norma y las que guardan la ficha lo convierten en «Otra persona estaba cambiando esa norma o esa ficha al mismo tiempo: inténtelo de nuevo».
  - `revisarDeshacer` gana los motivos «tiene revisiones por cambio de norma» (filas en `impactos_indicadores`) y «tiene reportes al ente» (filas en `reportes_externos`); `borrarIndicador` rechaza con «El indicador tiene revisiones por cambio de norma o reportes al ente: no se puede borrar» si existen.
  - Página del indicador: con impactos pendientes, `AvisoDeImpacto` a quien ve el indicador: **«Revisión por cambio normativo»**, «*norma* pasó a *estado* el *fecha*. Hay que revisar esta ficha antes del *fecha límite*.»; a quien administra, **«No afecta»** (pide la nota) y la frase «También se resuelve al aprobar una versión nueva de la ficha o al retirar el indicador.». Server Action `resolverImpactoNoAfectaAccion` (`mutacion(formData, "indicadores.administrar", …)`).
  - Página de impactos de la 13C: cuando existe, gana la sección **«Indicadores»** en lectura (código enlazado, nombre y «Pendiente», «No afecta», «Versión nueva» o «Retirado»), con `indicadoresDelCambio`; sin indicadores visibles, la sección no aparece.

- [ ] **Step 1: Write the failing tests** en `tests/indicadores-impactos.test.ts` (dentro de `revertida`; norma e indicador regulatorio con los ayudantes de `tests/utiles/normograma.ts` y `tests/utiles/indicadores.ts`):

```ts
it("derogar una norma abre un impacto por cada indicador activo cuya ficha vigente la cita", …);
//  no para un borrador que la cita, ni para un retirado; el plazo es el de los impactos de la 13C; avisa a los Admin SGC salvo a quien hizo el cambio
it("los impactos de documentos y de procesos de la 13C nacen igual que antes", …);          // Review Focus 7: mismas filas, mismas tareas y avisos
it("«No afecta» exige nota y lo resuelve; la ficha se vuelve a guardar citando la norma derogada", …);   // Review Focus 6
it("una cita nueva de una norma derogada se sigue rechazando", …);
it("una versión enviada después del impacto lo resuelve al aprobarse, a nombre de quien la elaboró", …);
it("un cambio menor publicado después del impacto lo resuelve al publicarse", …);
it("una versión que ya estaba por aprobar cuando cambió la norma no lo resuelve", …);
it("aprobar una versión que cita por primera vez una norma que dejó de estar vigente se rechaza", …);
it("retirar el indicador resuelve sus impactos", …);
it("la tarea es de quien administra indicadores; vence, avisa y escala sin nombrar el indicador", …);
it("el aviso de la página lo ve quien ve el indicador; un restringido no sale en la sección de la 13C para quien no lo ve", …);
it("un lote importado con una revisión por cambio de norma no se puede deshacer", …);
```

- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npx vitest run tests/indicadores-impactos.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass**, más todos los tests de normograma (`tests/normograma-*.test.*`), `tests/vigencia-tareas.test.ts`, `tests/indicadores-fichas.test.ts`, `tests/indicadores-aprobacion.test.ts`, `tests/indicadores-importacion.test.ts`, `tests/indicadores-operacion.test.ts`, `tests/tareas.test.ts`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`.
- [ ] **Step 5: Commit** — `feat(f14b): un cambio de norma abre una revisión en cada indicador que la cita, y se resuelve en su página`

---

### Task 13: Demo, manual, documentos y verificación

**Files:**
- Create: `src/db/semillas/indicadores-demo-14b.ts`; `docs/manual/usuario/` (las secciones nuevas del capítulo 8)
- Modify: `src/db/semillas/indicadores-demo.ts` y sus archivos de fichas y agenda, `tests/semilla-indicadores.test.ts`, `tests/semilla-indicadores-calendario.test.ts`, el capítulo 7 del manual, `AGENTS.md`, `CONTEXT.md`, `PLAN.md`

**Interfaces:**
- Consumes: todo lo anterior, por las funciones del dominio y con `ahora` inyectado (como `indicadores-demo-agenda.ts`).
- Produces (la demo de §11 del anexo):
  - `SGC-IND-03` con una versión 2, cambio mayor a «Objetivos cumplidos» de calidad, que rige desde su último semestre terminado sin reportar, y con ese periodo ya calculado por `tomarFotos` (ajuste la agenda de la demo para que ese semestre quede sin reportar en la versión manual).
  - Una ficha nueva del proceso SGC, «Conformidad en puntos de uso» (`conformidad_fecha`, toda la entidad, meta 90, mensual), aprobada con `ahora` en el mes anterior a la siembra y con ese mes ya fotografiado.
  - `CEX-IND-01`, que desde T10 nace con el ente completo: una constancia registrada con radicado y un PDF de soporte y otra vencida. Si con las fechas de la demo no han terminado dos periodos externos desde su aprobación, ajuste su agenda.
  - `SGC-IND-05` no cambia. Ningún impacto de indicador sembrado.
  - «Qué probar y cómo (Fase 14B)» de `CONTEXT.md` dice con qué ficha de la demo se ve cada paso de §11 del anexo; lo que un paso necesite y la demo no tenga (un automático «No aplica», uno en «Falta un dato») se siembra aquí.

- [ ] **Step 1: Write the failing tests** en `tests/semilla-indicadores.test.ts` (leen el estado y saltan con aviso si la demo ya avanzó; `SEMILLA_RECIEN=1` lo exige): la ficha vigente de `SGC-IND-03` es automática con `objetivos_cumplidos` y `calidad` y tiene una medición con `foto_en`; existe una ficha activa con `conformidad_fecha` y una medición con `foto_en`; `SGC-IND-05` sigue manual; `CEX-IND-01` tiene una constancia registrada con soporte y una pendiente con `vence_en` anterior a la siembra; no hay filas en `impactos_indicadores`; `metaDeConformidad()` devuelve 90 y el código de la ficha.
- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14b.sh npm run db:seed && bash <espacio>/con-f14b.sh npm run admin:asegurar && bash <espacio>/con-f14b.sh env SEMILLA_RECIEN=1 npx vitest run tests/semilla-indicadores.test.ts`.
- [ ] **Step 3: Implement** la semilla.
- [ ] **Step 4: Documentos.**
  - Manual, capítulo 8: «Indicadores que calcula el sistema» (los diez cálculos en palabras, cuándo se calcula cada uno, «No aplica» puesto por el sistema, «Falta un dato», «Volver a calcular», que el valor de la ficha puede no coincidir con la tarjeta de Vigencia de quien tiene alcance limitado), «Objetivos», «Reportes al ente» y «Cuando cambia una norma». Capítulo 7: la tarjeta con la meta de la ficha y «Ver ficha», el umbral de conformidad en solo lectura, y la sección «Indicadores» de la página de impactos.
  - `AGENTS.md`: lo que lista §11 del anexo («Cambios a `AGENTS.md`»), en las secciones que ya existen (regla 5, piso 10, estructura, seguridad de rutas, Server Actions, «un solo camino de cálculo», tests).
  - `CONTEXT.md`: sección «Hecho (Fase 14B)», «Qué probar y cómo (Fase 14B)» con los seis pasos de §11 del anexo, «Avisos para el usuario», «Decisiones adicionales (Fase 14B)» (F14B-DC1 a DC23 y las resoluciones de la ejecución) y «Deuda técnica»; el punto de reanudación corregido (la 14A y la 14A-C están en `main`; sigue la 14C con la `0015`; lo que §12 del anexo deja para ella).
  - `PLAN.md`: la fila de la 14B y la nueva de la 14C.
- [ ] **Step 5: Verificación de cierre** (pegue la salida en `<espacio>/progress.md`):
  - `bash <espacio>/con-f14b.sh npm run db:seed && bash <espacio>/con-f14b.sh npm run admin:asegurar && bash <espacio>/con-f14b.sh env SEMILLA_RECIEN=1 npm test` → en verde, sin más saltos que la línea base;
  - `npm run lint` → limpio; `npm run build` sin `DATABASE_URL` → en verde;
  - las `0013` y `0014` sobre una copia de una base de `main` recién sembrada (`createdb` de la copia, `db:preparar` con el entorno apuntando a ella, y borrarla): de trece a quince migraciones, los indicadores y las mediciones intactos;
  - el recorrido de §11 del anexo en el navegador (claro, oscuro y 390 px), paso por paso.
- [ ] **Step 6: Commit** — `feat(f14b): demo con dos automáticos y constancias; manual, AGENTS, CONTEXT y PLAN al cierre de la 14B`
