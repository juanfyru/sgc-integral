# Rangos por ficha, códigos del hospital e importación de indicadores — plan de construcción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el semáforo de cada ficha se escriba con signo y valor por estado, que «Cumple» deje de ser «Bien», que los
subprocesos tengan sigla y las fichas nuevas el código `SIGLA-ID-NNN`, y que el Administrador del SGC importe fichas ya
aprobadas desde una plantilla Excel, con vista previa y con «Deshacer la importación».

**Architecture:** las reglas nuevas son funciones puras en `src/lib/indicadores/` (rangos, cumple, lectura y revisión de
la plantilla) que usan el servidor y los componentes de cliente; la base gana la migración `0012` (solo añade); el
cálculo sigue entrando por `recalcularMedicion`; la importación es un lote de solo inserción con eventos (`importado`,
`deshecho`) y su archivo en el almacén, y deshacer usa una excepción estrecha del trigger de versiones aprobadas.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript estricto, PostgreSQL 16 con Drizzle, `zod`, `exceljs`,
`file-type` (solo `fileTypeFromBuffer`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-fase14a-rangos-e-importacion-design.md` (amplía
`docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md`, «spec 14»). Lee los dos y `AGENTS.md` antes de empezar.

## Global Constraints

- Trabajo en el worktree `F:\sgc-integral-f14a`, rama `f14a-rangos-importacion`. Nunca `F:\sgc-integral`, su base `sgc`
  ni su `next dev` del 3002; sin Docker, sin `.env.local` (no se lee ni se crea), sin `push` ni `merge`.
- Todo comando que toque la base va por el guard del espacio de trabajo de este plan (`con-f14a.sh`, copia del de la
  14A; usa la base aparte `sgc_f14a`): `bash <espacio>/con-f14a.sh npx vitest run tests/x.test.ts`.
- La migración nueva es `drizzle/0012_*`, generada con `npm run db:generate` (por el guard) y completada a mano con el SQL
  que Drizzle no genera; se aplica a `sgc_f14a` con `bash <espacio>/con-f14a.sh npm run db:preparar`. No se toca la `0011`.
- `src/db/esquema.ts` importa solo con rutas relativas. Solo se añade: ninguna tabla ni columna heredada se renombra ni se
  borra (AGENTS.md, piso 11).
- Un solo camino de cálculo: solo `recalcularMedicion` escribe resultado, semáforo, `cumple`, meta aplicada y estado.
- Las versiones aprobadas no cambian: ningún `UPDATE` ni migración reescribe su regla; su huella no cambia (§T4).
- Toda Server Action nueva pasa por `mutacion(formData, "indicadores.administrar", fn)`; toda acción de bitácora nueva
  tiene su frase y su nombre de filtro en `src/lib/bitacora-detalle.ts`.
- Todo Excel que la app genera neutraliza fórmulas con `neutralizarFormula()` (`src/lib/celdas.ts`).
- De `file-type`, en `src/` solo `fileTypeFromBuffer` (F14A-R41).
- Colores solo por token (`tests/colores-fijos.test.ts`); nada de `opacity` para atenuar; el estado nunca solo por color.
- Tests contra la base: datos que puedan bloquear la base (fichas aprobadas, lotes, cierres) dentro de `revertida`
  (`tests/utiles/transaccion.ts`); usuarios con historia `zz_<algo>_${Date.now()}`; nunca `UPDATE`/`DELETE` sobre tablas
  inmutables en una limpieza.
- Los archivos del hospital (`F:\indicadores-importar\`, `INDICADORES_PROCESO_SGC_OK.xlsx`) nunca entran a un commit; los
  tests arman su plantilla sintética con `plantillaDeImportacion` (T8).
- Commits convencionales en español, terminados con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Textos de la interfaz en español; los mensajes entre comillas de este plan son copia exacta.

## Review Focus

1. **Una medición vieja leída con el código nuevo:** una medición escrita antes de la `0012` tiene `cumple` nulo; debe
   leerse como antes (Bien ⇔ cumple). Test en T3 (`cumpleDeFila`).
2. **La huella de una ficha aprobada antes de esta entrega:** añadir campos al contenido no puede cambiarla. Test en T4
   con una huella fija de un contenido sin rangos, nivel ni riesgo.
3. **Un cambio menor sobre una ficha con la regla vieja** (renombrarla) no puede volverse mayor por el modo del
   semáforo. Test en T4.
4. **Una meta de porcentaje escrita como fracción** (0,95) en la plantilla: la vista previa avisa. Test en T8.
5. **Dos importaciones o dos «deshacer» a la vez del mismo lote:** solo uno pasa; el otro recibe un mensaje legible, no
   un 23505 crudo. Test en T9 (importar dos veces) y T11 (deshacer dos veces).

---

### Task 1: Reglas puras de los rangos

**Files:**
- Create: `src/lib/indicadores/rangos.ts`
- Modify: `src/lib/indicadores/tipos.ts` (`MODOS_SEMAFORO`), `src/lib/indicadores/semaforo.ts`, `src/lib/indicadores/reporte.ts`
- Test: `tests/indicadores-rangos.test.ts` (nuevo), `tests/indicadores-semaforo.test.ts`

**Interfaces:**
- Produces (`rangos.ts`, sin Node ni BD, sin importar `semaforo.ts` en tiempo de ejecución):
  - `SIGNOS = [">=", ">", "<=", "<", "entre"] as const`; `type Signo`
  - `type FilaEnTexto = { signo: Signo; valor: string; hasta?: string }` (`hasta` solo con «entre»)
  - `type RangosEnTexto = { bien: FilaEnTexto[]; atencion: FilaEnTexto[]; critico: FilaEnTexto[] }` (lo que guarda el `jsonb`)
  - `type FilaDeRango = { signo: Signo; valor: Fraccion; hasta: Fraccion | null }`; `type Rangos = { bien: FilaDeRango[]; atencion: FilaDeRango[]; critico: FilaDeRango[] }`
  - `rangosDeTexto(t: RangosEnTexto): Rangos | null` (null si un número no se lee) y `rangosATexto(r: Rangos): RangosEnTexto`
  - `semaforoDeRangos(v: Fraccion, r: Rangos, tendencia: Tendencia): Semaforo`
  - `errorDeRangos(r: Rangos, tendencia: Tendencia, meta: Fraccion, metaMax: Fraccion | null): string | null`
  - `limiteDeRangos(r: Rangos, tendencia: Tendencia): Fraccion | null` (el borde de Crítico del lado mejor; `null` en constante)
  - `rangosDeLaRegla(meta: Fraccion, tendencia: "ascendente" | "descendente", pctAscendente: number, pctDescendente: number): Rangos`
- Produces (`semaforo.ts`): `Regla` gana `rangos?: Rangos | null`; `semaforoDe`, `limiteDeCritico`, `errorDeRegla` y
  `rangosEnPalabras` atienden `modo === "rangos"`; nuevas `cumpleMeta(v: Fraccion, r: Regla): boolean | null` y
  `rangosEquivalentes(r: Regla): Rangos | null` (de una regla `relativo` o `fijo`).
- Produces (`reporte.ts`): `ReglaEnTexto` gana `rangos?: RangosEnTexto | null`; `reglaDeTexto` lo convierte.
- Produces (`tipos.ts`): `MODOS_SEMAFORO = ["relativo", "fijo", "rangos"]`.

Reglas de evaluación (spec §3.3): se prueban las filas en orden Bien → Atención → Crítico y gana la primera que contiene
el valor (`>=` cerrado, `>` abierto, «entre» cerrado en sus dos extremos). Si ninguna lo contiene, el valor está en un
hueco entre dos filas vecinas sobre el eje (toma el color **peor** de las dos: Crítico > Atención > Bien) o más allá de la
fila de una punta (toma el de esa punta). En el eje, una fila de un solo signo del medio llega hasta donde empieza la
fila mejor que tiene al lado (spec §3.2). Orden sobre el eje de menor a mayor: ascendente Crítico, Atención, Bien;
descendente Bien, Atención, Crítico; constante Crítico (abajo), Atención (abajo), Bien, Atención (arriba), Crítico
(arriba); en constante, Atención y Crítico tienen hasta dos filas, una por lado.

Mensajes de `errorDeRangos` (copia exacta), en este orden de revisión:
- «Escriba el rango de Bien» · «Escriba el rango de Crítico»
- «Cada estado lleva una sola fila» (ascendente o descendente con más de una fila en un estado)
- «En «más es mejor», Bien va con ≥, > o «entre»» · «En «más es mejor», Crítico va con ≤, < o «entre»»
- «En «menos es mejor», Bien va con ≤, < o «entre»» · «En «menos es mejor», Crítico va con ≥, > o «entre»»
- «Para mantenerse en un rango, Bien va con «entre»» · «Para mantenerse en un rango, Atención y Crítico van a cada lado de Bien»
- «En «entre», el primer número no puede ser mayor que el segundo»
- `Los rangos de ${A} y ${B} se cruzan` (A, B: «Crítico», «Atención», «Bien», del peor al mejor)
- `El rango de ${A} queda dentro del de ${B}`
- `Entre ${A} y ${B} queda un hueco de más de una unidad`
- «La meta debe quedar dentro del rango de Bien» (también `metaMax` en constante)

`rangosEnPalabras` con rangos (copia exacta del formato): `Bien: ≥ 91 % · Atención: 41 a 90 % · Crítico: ≤ 40 %`;
cada fila es `≥ v`, `> v`, `≤ v`, `< v` o `a a b`, con `numeroExacto` y el sufijo de la unidad al final de la fila; dos
filas de un estado se unen con « y »; sin Atención, ese tramo no se escribe.

- [ ] **Step 1: Write the failing tests** en `tests/indicadores-rangos.test.ts` (con `const f = (t: string) => fraccion(t)!`):

```ts
const asc = { bien: [{ signo: ">=", valor: "91" }], atencion: [{ signo: "entre", valor: "41", hasta: "90" }], critico: [{ signo: "<=", valor: "40" }] };
it("el ejemplo del hospital, más es mejor, meta 100", () => {
  const r = rangosDeTexto(asc)!;
  expect(["95", "91", "90,5", "90", "41", "40,5", "40", "0", "105"].map((v) => semaforoDeRangos(f(v), r, "ascendente")))
    .toEqual(["bien", "bien", "atencion", "atencion", "atencion", "critico", "critico", "critico", "bien"]);
  expect(errorDeRangos(r, "ascendente", f("100"), null)).toBeNull();
});
it("menos es mejor sin Atención: Bien ≤ 30 · Crítico > 30", ...);       // 30→bien, 30,5→critico, 0→bien
it("menos es mejor con Atención: Bien ≤ 30 · Atención entre 31 y 45 · Crítico > 45", ...); // 30,5→atencion, 45→atencion, 45,5→critico
it("Atención de un solo signo: Bien ≥ 95 · Atención ≥ 85,5 · Crítico < 85,5", ...); // 95→bien, 94,99→atencion, 85,5→atencion, 85,49→critico; error null con meta 95
it("mantenerse en un rango", ...);  // Bien entre 85 y 95; Atención entre 80 y 84 y entre 96 y 100; Crítico < 80 y > 100; meta 85, metaMax 95:
                                    // 90→bien, 84,5→atencion, 82→atencion, 79→critico, 95,5→atencion, 101→critico
it("errores", () => {
  // con meta 100, ascendente:
  expect(err({ ...asc, atencion: [{ signo: "entre", valor: "41", hasta: "95" }] })).toBe("Los rangos de Atención y Bien se cruzan");
  expect(err({ ...asc, atencion: [{ signo: ">=", valor: "95" }] })).toBe("El rango de Atención queda dentro del de Bien");
  expect(err({ ...asc, atencion: [{ signo: "entre", valor: "60", hasta: "90" }] })).toBe("Entre Crítico y Atención queda un hueco de más de una unidad");
  expect(err({ ...asc, bien: [{ signo: "entre", valor: "91", hasta: "99" }] })).toBe("La meta debe quedar dentro del rango de Bien");
  expect(err({ ...asc, bien: [{ signo: "<=", valor: "91" }] })).toBe("En «más es mejor», Bien va con ≥, > o «entre»");
  expect(err({ ...asc, atencion: [{ signo: "entre", valor: "90", hasta: "41" }] })).toBe("En «entre», el primer número no puede ser mayor que el segundo");
  expect(err({ ...asc, bien: [] })).toBe("Escriba el rango de Bien");
});
it("límite de crítico", ...);  // asc → 40; con Crítico «< 41» → 41; desc «> 30» → 30; constante → null
it("la regla aprobada del hospital", () => {
  expect(rangosATexto(rangosDeLaRegla(f("95"), "ascendente", 90, 110))).toEqual({ bien: [{ signo: ">=", valor: "95" }], atencion: [{ signo: ">=", valor: "85.5" }], critico: [{ signo: "<", valor: "85.5" }] });
  expect(rangosATexto(rangosDeLaRegla(f("30"), "descendente", 90, 110))).toEqual({ bien: [{ signo: "<=", valor: "30" }], atencion: [{ signo: "<=", valor: "33" }], critico: [{ signo: ">", valor: "33" }] });
  expect(rangosATexto(rangosDeLaRegla(f("0"), "descendente", 90, 110))).toEqual({ bien: [{ signo: "<=", valor: "0" }], atencion: [], critico: [{ signo: ">", valor: "0" }] });
});
```

  En `tests/indicadores-semaforo.test.ts`: `cumpleMeta` (ascendente meta 100: 99,99 → false, 100 → true; descendente
  meta 30: 30 → true, 30,01 → false; constante 98–100: 97,99 → false, 99 → true; sin meta → null);
  `rangosEnPalabras({ ...regla, modo: "rangos", rangos }, pct)` → `"Bien: ≥ 91 % · Atención: 41 a 90 % · Crítico: ≤ 40 %"`;
  y equivalencia: para las reglas `asc`, `desc` y la constante con tolerancia que ya están en el archivo, `semaforoDe`
  con `{ modo: "rangos", rangos: rangosEquivalentes(regla) }` da lo mismo que la regla vieja en
  `["0","62,99","63","89,96","90","100","30","31","42,85","43","95","95,99","96","97","98","100","101","102","102,01","103"]`.

- [ ] **Step 2: Run the tests to verify they fail**
  Run: `npx vitest run tests/indicadores-rangos.test.ts tests/indicadores-semaforo.test.ts` (puros, sin guard)
  Expected: FAIL (`rangos.ts` no existe; `cumpleMeta` no está exportada).

- [ ] **Step 3: Implement** `rangos.ts` y los cambios de `semaforo.ts`, `reporte.ts` y `tipos.ts` con las firmas de arriba.
  `rangosEquivalentes`: ascendente → Bien `>= meta`, Atención `>= límite`, Crítico `< límite`; descendente → `<= meta`,
  `<= límite`, `> límite`; constante → Bien `entre meta y metaMax`, con tolerancia t > 0 Atención `entre meta−t y meta` y
  `entre metaMax y metaMax+t`, Crítico `< meta−t` y `> metaMax+t` (t = 0: sin Atención). Un «hueco de más de una unidad»
  es una distancia > 1 entre el borde de una fila y el de su vecina sobre el eje.

- [ ] **Step 4: Run the tests to verify they pass** (mismo comando) y `npm run lint`. Expected: PASS, lint limpio.

- [ ] **Step 5: Commit** — `feat(f14a): rangos del semáforo escritos por estado y «cumple» frente a la meta`

---

### Task 2: Migración 0012

**Files:**
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts`, `src/lib/subida.ts` (`CONTEXTOS_EVIDENCIA`), `AGENTS.md` (regla 5, piso 10 y el párrafo de migraciones)
- Create: `drizzle/0012_*.sql` (generada + SQL a mano), su `meta`
- Test: `tests/esquema-fase14a-importacion.test.ts` (nuevo), `tests/privilegios-bd.test.ts`

**Interfaces:**
- Produces (tablas y columnas, nombres exactos):
  - `importaciones_indicadores` (`id`, `cargado_por` FK `usuarios` RESTRICT, `cargado_en timestamptz default now()`): solo inserción (trigger `importaciones_indicadores_inmutable` con `sgc_impedir_modificacion()`).
  - `importacion_eventos` (`id`, `importacion_id` FK RESTRICT, `tipo text` CHECK `IN ('importado','deshecho')`, `usuario_id` FK, `metodo text`, `detalle jsonb not null default '{}'`, `creado_en`); índice único `(importacion_id, tipo)`; solo inserción (trigger `importacion_eventos_inmutable`).
  - `indicador_versiones`: `rangos jsonb`, `nivel text`, `riesgo_asociado text`, `importacion_id bigint` FK `importaciones_indicadores` RESTRICT, `aprobacion_previa_documento text`, `aprobacion_previa_por text`, `aprobacion_previa_fecha date`; el CHECK de `semaforo_modo` admite `'rangos'`; CHECK `indicador_versiones_rangos_con_modo`: `(semaforo_modo IS DISTINCT FROM 'rangos') = (rangos IS NULL)`; CHECK `indicador_versiones_importada_coherente`: `importacion_id IS NULL OR estado <> 'aprobada' OR (aprobacion_previa_documento IS NOT NULL AND aprobacion_previa_por IS NOT NULL AND aprobacion_previa_fecha IS NOT NULL)`.
  - `mediciones.cumple boolean` (nulo en las filas anteriores: se lee con `cumpleDeFila`, T3).
  - `subprocesos.sigla text` con índice único `subprocesos_sigla_unica` sobre `lower(sigla)` donde no es nula.
  - `archivos_contexto_valido` admite `'importacion_indicadores'`; `CONTEXTOS_EVIDENCIA` lo incluye.
  - `sgc_impedir_si_version_aprobada()` (`CREATE OR REPLACE`): igual que hoy, salvo un `DELETE` cuya versión aprobada tiene `importacion_id` y `importacion_id::text = current_setting('sgc.deshacer_importacion', true)`; vale para `indicador_versiones` (con `OLD`) y para sus hijas (leyendo la versión de `OLD.version_id`). `INSERT` y `UPDATE` siguen rechazados.
  - `roles-bd.ts`: el `REVOKE UPDATE, DELETE` suma `importaciones_indicadores` e `importacion_eventos`.

- [ ] **Step 1: Write the failing tests.** En `tests/esquema-fase14a-importacion.test.ts`, dentro de `revertida`:
  - las columnas existen (consulta a `information_schema.columns`);
  - `INSERT` de una versión con `semaforo_modo = 'rangos'` y `rangos` nulo → error de CHECK (`23514`); con `'relativo'` y `rangos` no nulo → `23514`;
  - una versión aprobada con `importacion_id` (lote y versión creados en la transacción: la versión se inserta en `borrador`, se le ponen sus hijas y después `UPDATE ... SET estado = 'aprobada'`): `DELETE` sin la marca → `42501`; con `set_config('sgc.deshacer_importacion', '<otro id>', true)` → `42501`; con su id → se borra (primero sus variables, después la versión); una versión aprobada **sin** `importacion_id` con la marca puesta → `42501`;
  - `UPDATE` y `DELETE` de `importaciones_indicadores` e `importacion_eventos` → rechazados por el trigger.
  En `tests/privilegios-bd.test.ts`, un caso por tabla nueva como los de `cierres_indicadores` (`sgc_app` sin `UPDATE` ni `DELETE`).

- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14a.sh npx vitest run tests/esquema-fase14a-importacion.test.ts tests/privilegios-bd.test.ts`. Expected: FAIL (columnas inexistentes).

- [ ] **Step 3: Implement** el esquema, `bash <espacio>/con-f14a.sh npm run db:generate`, el SQL a mano al final de la `0012` (función, triggers, CHECKs que Drizzle no exprese), `roles-bd.ts`, `subida.ts` y `AGENTS.md` (las dos tablas en la regla 5 y el piso 10; «Al cierre de esta entrega son trece (`drizzle/0000` a `drizzle/0012`); las tablas vacías de la 14B las puede rehacer la `0013`»). Aplica: `bash <espacio>/con-f14a.sh npm run db:preparar`.

- [ ] **Step 4: Run to verify they pass** (mismo comando), más `tests/esquema-fase14.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): migración 0012 - rangos, cumple, sigla de subprocesos y lotes de importación`

---

### Task 3: «Cumple» en el cálculo, la racha, el análisis y las alertas

**Files:**
- Modify: `src/lib/indicadores/calculo.ts`, `src/lib/indicadores/acumulado.ts`, `src/lib/indicadores/estados.ts`, `src/lib/indicadores/textos.ts`, `src/db/consultas/indicadores/mediciones.ts` (`versionesAprobadasDe`, `reglaDelPeriodo`, `recalcularMedicion`, `recalcularSiguientes`), `src/db/consultas/indicadores/alertas.ts`, `src/db/consultas/indicadores/metas.ts`, y los demás llamadores que el compilador señale
- Modify: `tests/utiles/indicadores.ts` (`OpcionesIndicadorDePrueba` gana `rangos?: RangosEnTexto`: con él, `semaforo_modo = 'rangos'`)
- Test: `tests/indicadores-analisis.test.ts`, `tests/indicadores-mediciones.test.ts`, `tests/indicadores-alertas.test.ts`, `tests/indicadores-metas-historicos.test.ts`, `tests/indicadores-textos.test.ts`, `tests/indicadores-acumulado.test.ts`

**Interfaces:**
- Consumes: `cumpleMeta`, `Regla.rangos`, `ReglaEnTexto.rangos` (T1); `mediciones.cumple`, `indicador_versiones.rangos` (T2).
- Produces:
  - `calcular(...)` y `acumulado(...)` devuelven también `cumple: boolean | null`.
  - `analisisExigido(m: { semaforo: Semaforo | null; cumple: boolean | null; repetido: boolean; historica: boolean; noAplica: boolean }): AnalisisExigido` — «ninguno» si histórica, «no aplica», sin semáforo o `cumple !== false`; «dos_partes» si Crítico o repetido; si no, «simple».
  - `esRepetido(anteriores: (boolean | null)[], actual: boolean | null, n: number): boolean` — cuenta `cumple === false`.
  - `cumpleDeFila(f: { cumple: boolean | null; semaforo: Semaforo | null }): boolean | null` — `f.cumple ?? (f.semaforo === null ? null : f.semaforo === "bien")` (las filas anteriores a la `0012`).
  - `fraseDeResultado(m: { resultado; semaforo; cumple: boolean | null; noAplica; motivo }, r, u)` y `resultadoFrenteAMeta(m: { resultado; semaforo; cumple: boolean | null }, r, u)`: «Cumple»/«No cumple» y «dentro del»/«fuera del» salen de `cumple`.
  - `textoValor(v, u, regla)`: la cifra mostrada tampoco contradice `cumpleMeta` (mismo algoritmo, la comparación de «coincide» exige igual semáforo **e** igual `cumple`).
  - `recalcularMedicion` escribe `cumple`; la racha lee `semaforo, cumple` de las anteriores y usa `cumpleDeFila`; `columnasCambiaron` y el disparo de `recalcularSiguientes` cuentan un cambio de `cumple`; el `detalle` del evento `recalculo` lleva `cumple` en `antes`/`despues` cuando cambia.
  - Nivel de alerta (`alertas.ts`): «critico» con Crítico o repetido; «atencion» con Atención **o** con Bien y `cumple === false`.
  - `programarMeta` con `modo = 'rangos'`: si `errorDeRangos(rangos, tendencia, meta, metaMax)` no es nulo, rechaza con ese mensaje («La meta debe quedar dentro del rango de Bien»).

- [ ] **Step 1: Write the failing tests.** Puros: `analisisExigido({ semaforo: "bien", cumple: false, repetido: false, historica: false, noAplica: false })` → `"simple"`; con `cumple: true` → `"ninguno"`; `esRepetido([false, false], false, 3)` → `true`; `cumpleDeFila({ cumple: null, semaforo: "atencion" })` → `false` y `({ cumple: null, semaforo: null })` → `null`; `fraseDeResultado` con `semaforo: "bien", cumple: false`, resultado 95 y meta 100 → `"No cumple: 95 % frente a una meta de 100 %."`; `textoValor(f("99,96"), { sufijo: " %", decimales: 0 }, reglaConRangos(meta 100, Bien ≥ 91))` → `"99,9 %"` (no «100 %»); `acumulado` devuelve `cumple`.
  Con la base (en `revertida`, con `indicadorDePrueba(tx, { rangos: { bien: [{ signo: ">=", valor: "91" }], atencion: [{ signo: "entre", valor: "41", hasta: "90" }], critico: [{ signo: "<=", valor: "40" }] }, meta: "100", periodicidad: "mensual", analiza: [idAnalista] })`):
  - reportar A = 95, B = 100 → `semaforo = 'bien'`, `cumple = false`, `estado = 'abierta'` (falta el análisis), y quien analiza recibe la alerta de nivel «atencion»; A = 105 → `cumple = true`, `estado = 'reportada'`, sin alerta;
  - tres meses seguidos en 95 → el tercero tiene `incumplimiento_repetido = true` y `requiere_accion = true`;
  - `programarMeta` del periodo con 85 → `"La meta debe quedar dentro del rango de Bien"`.

- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14a.sh npx vitest run tests/indicadores-analisis.test.ts tests/indicadores-mediciones.test.ts tests/indicadores-alertas.test.ts tests/indicadores-metas-historicos.test.ts tests/indicadores-textos.test.ts tests/indicadores-acumulado.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** con las firmas de arriba; el compilador guía a los demás llamadores (`lectura.ts`, `excel.ts`, `FichaImpresa.tsx`, `ResultadoEnVivo.tsx`, `PruebaFormula.tsx`): en esta tarea solo pasan `cumple`; lo que se ve cambia en T6.

- [ ] **Step 4: Run to verify they pass** (mismo comando) y **toda la carpeta de indicadores**: `bash <espacio>/con-f14a.sh npx vitest run tests/indicadores-*.test.ts tests/indicadores-*.test.tsx tests/graficas-indicadores.test.tsx` — las fichas viejas no cambian de color ni de análisis. `npm run lint`.

- [ ] **Step 5: Commit** — `feat(f14a): «cumple» frente a la meta decide el análisis, la racha y las alertas`

---

### Task 4: La ficha guarda rangos, nivel y riesgo asociado

**Files:**
- Modify: `src/lib/esquemas/indicadores.ts` (`EsquemaFicha`), `src/lib/indicadores/ficha.ts` (`ContenidoFicha`, `CAMPOS_MAYORES`, etiquetas, `huellaDeFicha`), `src/db/consultas/indicadores/fichas.ts` (`revisar`, `columnasDeContenido`, `CONTENIDO`, `contenidoDeVersion`, `valoresDeVersion`, `crearIndicador`, `guardarBorrador`, duplicar), `src/lib/indicadores/tipos.ts` (`DatosFicha` si vive ahí)
- Test: `tests/indicadores-ficha.test.ts`, `tests/indicadores-fichas.test.ts`

**Interfaces:**
- Consumes: `rangosDeTexto`, `errorDeRangos` (T1), `rangosEquivalentes` (T1), columnas de T2.
- Produces:
  - `EsquemaFicha`: `semaforoModo` admite `"rangos"`; `rangos: z.string().optional()` (el JSON de `RangosEnTexto`, validado con un `EsquemaRangos` estricto); `nivel: opcional("El nivel", 60)`; `riesgoAsociado: opcional("El riesgo asociado", 300)`.
  - `ContenidoFicha` gana `rangos: RangosEnTexto | null`, `nivel: string | null`, `riesgoAsociado: string | null`; `CAMPOS_MAYORES` suma `"rangos"`; etiquetas «Rangos del semáforo», «Nivel», «Riesgo asociado» (las dos últimas, cambio menor).
  - `huellaDeFicha`: quita `rangos`, `nivel` y `riesgoAsociado` del objeto firmado cuando son nulos (la huella de una versión anterior no cambia).
  - Reglas al guardar (mensajes exactos):
    - `crearIndicador` con meta y sin rangos → «Escriba los rangos del semáforo»; con `semaforoModo` `relativo` o `fijo` → el mismo mensaje.
    - `guardarBorrador` de un cambio cuya versión vigente usa `relativo` o `fijo`: puede conservar ese modo (con sus mismos números) solo si `tipoDeCambio(vigente, nuevo)` no es «mayor»; si es mayor y no trae rangos → «Un cambio mayor escribe los rangos del semáforo: complete Bien, Atención y Crítico».
    - Con rangos: `errorDeRangos` no nulo → ese mensaje, en el campo `ficha-rangos`.
    - «Crear a partir de este» de una ficha con la regla vieja: la copia lleva `rangosEquivalentes(regla)` y `semaforoModo = "rangos"`.

- [ ] **Step 1: Write the failing tests.** Puros (`indicadores-ficha.test.ts`): cambiar `rangos` → «mayor»; cambiar `nivel` o `riesgoAsociado` → «menor»; `huellaDeFicha` de un `ContenidoFicha` sin rangos, nivel ni riesgo es igual a la huella de ese mismo contenido calculada con el código de `main` (copia el valor hexadecimal en el test antes de cambiar el código). Con la base (`indicadores-fichas.test.ts`, en `revertida`): crear con rangos válidos → la versión tiene `semaforo_modo = 'rangos'` y el `jsonb`; crear con meta y sin rangos → «Escriba los rangos del semáforo»; abrir un cambio de una ficha `relativo` y cambiar solo el nombre → se guarda y `tipoDeCambio` es «menor»; cambiar la meta sin rangos → «Un cambio mayor escribe los rangos del semáforo: complete Bien, Atención y Crítico»; duplicar una `relativo` (meta 90, umbral 70) → la copia tiene Bien `>= 90`, Atención `>= 63`, Crítico `< 63`; `nivel` y `riesgoAsociado` se guardan y se leen en `contenidoDeVersion`.

- [ ] **Step 2: Run to verify they fail** — `bash <espacio>/con-f14a.sh npx vitest run tests/indicadores-ficha.test.ts tests/indicadores-fichas.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** con las reglas de arriba.

- [ ] **Step 4: Run to verify they pass**, más `tests/indicadores-aprobacion.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): la ficha guarda sus rangos, el nivel y el riesgo asociado`

---

### Task 5: El formulario de la ficha escribe los rangos

**Files:**
- Create: `src/componentes/indicadores/ficha/EditorDeRangos.tsx` (`'use client'`)
- Modify: `src/componentes/indicadores/ficha/FormularioFicha.tsx` (el bloque «Cambiar rangos», «Más opciones»), `VistaSemaforo.tsx`, `PruebaFormula.tsx`, `src/componentes/indicadores/admin/FormularioParametros.tsx`
- Test: `tests/indicadores-formulario.test.tsx`

**Interfaces:**
- Consumes: `RangosEnTexto`, `SIGNOS` (T1); `rangosEnPalabras`, `rangosEquivalentes` (T1); el contrato del formulario de T4 (`rangos` en JSON, `semaforoModo = "rangos"`, `nivel`, `riesgoAsociado`).
- Produces: `EditorDeRangos({ tendencia: Tendencia; inicial: RangosEnTexto | null; error: string | null; idError: string })` — una fila por estado con un `<select>` de signo (etiquetas «≥», «>», «≤», «<», «entre») y uno o dos campos numéricos con su `<label>`; la casilla «Este indicador no usa Atención»; en «Mantenerse en un rango», Atención y Crítico con «por debajo» y «por encima»; escribe `<input type="hidden" name="rangos">` (JSON) y `name="semaforoModo" value="rangos"`. El error va junto al editor con `aria-describedby` y el foco va a él (el patrón `errorDe` del formulario).

  En `FormularioFicha`: una ficha nueva o un borrador con rangos muestra `EditorDeRangos` a la vista (no dentro de «Cambiar rangos»); un borrador cuya regla es `relativo`/`fijo` muestra «Así quedará el semáforo» con la regla vieja y el botón «Escribir los rangos», que muestra el editor con `rangosEquivalentes(regla)`. «Más opciones» gana **Nivel** y **Riesgo asociado**. La **Prueba** dice «Cumple» o «No cumple» con `calcular(...).cumple`, además del color. Parámetros deja de mostrar «Umbral de atención (%)» (la columna se conserva).

- [ ] **Step 1: Write the failing tests** (`renderToStaticMarkup`, como los vecinos): la ficha nueva muestra los tres `<select>` con `id` `rango-bien-signo`, `rango-atencion-signo`, `rango-critico-signo` y la casilla «Este indicador no usa Atención», y no muestra «Cambiar rangos»; un borrador `relativo` muestra «Escribir los rangos» y no el editor; la prueba con 95 y meta 100 (Bien ≥ 91) muestra «Bien» y «No cumple»; «Más opciones» tiene los campos `ficha-nivel` y `ficha-riesgoAsociado`; Parámetros no tiene «Umbral de atención (%)». Una función pura exportada del editor, `rangosDelEditor(estado): RangosEnTexto`, convierte el estado del editor (con «no usa Atención» marcado, `atencion: []`).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/indicadores-formulario.test.tsx` (por el guard si el archivo lee la base). Expected: FAIL.

- [ ] **Step 3: Implement.** 390 px: cada fila del editor en una columna; signo y números con `w-full` en móvil.

- [ ] **Step 4: Run to verify they pass**, más `tests/a11y-estructura.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): el formulario de la ficha escribe los rangos de Bien, Atención y Crítico`

---

### Task 6: Lo que se ve: «Bien · no alcanza la meta» y los rangos tal como se escribieron

**Files:**
- Modify: `src/componentes/indicadores/InsigniaSemaforo.tsx` (prop `cumple?: boolean | null`), sus llamadores (`ListaIndicadores.tsx`, `IndicadoresDelProceso.tsx`, `ResultadoPrincipal.tsx`, `medicion/TablaDelAnio.tsx`, `ficha/FichaImpresa.tsx`), `MatrizDelAnio.tsx` (glifo y leyenda), las gráficas de tubos (nombre accesible y tabla `sr-only`), `ficha/FichaTecnica.tsx`, `src/lib/indicadores/excel.ts`, y las lecturas que alimentan esas vistas (`lectura.ts`, `lista.ts`, `matriz.ts`, `impresion.ts`): cada fila o celda gana `cumple: boolean | null` leído con `cumpleDeFila`
- Test: `tests/indicadores-pantalla.test.tsx`, `tests/indicadores-impresion.test.tsx`, `tests/indicadores-excel.test.ts`, `tests/modulo-indicadores-vistas.test.tsx`, `tests/graficas-indicadores.test.tsx`

**Interfaces:**
- Consumes: `cumpleDeFila` (T3), `rangosEnPalabras` (T1), `nivel`/`riesgoAsociado` (T4).
- Produces: `InsigniaSemaforo` con `semaforo === "bien"` y `cumple === false` escribe «Bien · no alcanza la meta» (misma variante de color). En la matriz, esa celda lleva el glifo «✓*» (el de Bien es «✓»), su nombre accesible termina en «, no alcanza la meta» y la leyenda gana «✓* Bien, sin alcanzar la meta». La columna «Cumple» (tabla del año, ficha impresa, Excel) sale de `cumple`. La ficha técnica y la impresa muestran los rangos con `rangosEnPalabras` (para cualquier modo), **Nivel** y **Riesgo asociado** cuando los hay; la hoja «Ficha» del Excel, igual.

- [ ] **Step 1: Write the failing tests:** una fila de la tabla del año con Bien y `cumple: false` muestra «Bien · no alcanza la meta» y «No» en «Cumple»; la celda de la matriz muestra «✓*» y su `aria-label` termina en «, no alcanza la meta»; la ficha impresa de una ficha con rangos dice «Bien: ≥ 91 % · Atención: 41 a 90 % · Crítico: ≤ 40 %» y «Nivel: Proceso»; el Excel de resultados escribe «No» en «Cumple» para esa medición; la tabla `sr-only` de la gráfica dice «Bien, no alcanza la meta».

- [ ] **Step 2: Run to verify they fail** (por el guard). Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run to verify they pass**, más `tests/colores-fijos.test.ts`, `tests/a11y-estructura.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): ningún verde engaña - «Bien · no alcanza la meta» y los rangos como se escribieron`

---

### Task 7: Sigla de los subprocesos y código `SIGLA-ID-NNN`

**Files:**
- Modify: `src/lib/validaciones-mapa.ts`, `src/db/consultas/mapa-admin.ts` (`DatosSubproceso`, `crearSubproceso`, `editarSubproceso`, `listarSubprocesos`, `obtenerSubproceso`, `crearProceso`, `editarProceso`, `exigirSiglaLibre`), `src/app/admin/acciones-mapa.ts`, las páginas de subproceso de `src/app/(app)/admin/(panel)/mapa/subprocesos/`, `src/db/consultas/indicadores/fichas.ts` (`siguientes`, `codigoCon`, `proponerCodigo`, `opcionesDeFicha`, el cambio de proceso de `guardarBorrador`), `src/lib/indicadores/tipos.ts` (`OpcionesFicha.codigosPropuestos`), `FormularioFicha.tsx` (código propuesto)
- Test: `tests/validaciones-mapa.test.ts`, `tests/mapa-admin.test.ts`, `tests/indicadores-fichas.test.ts`, `tests/indicadores-formulario.test.tsx`

**Interfaces:**
- Produces:
  - `validarSiglaOpcional(v: string): string | null` (vacía → `null`; si no, `validarSigla`) y `exigirSiglaNoReservada(sigla: string): void` — «La sigla IND está reservada para los indicadores» / «La sigla ID está reservada para los indicadores»; vale para procesos, subprocesos y tipos de documento (`exigirSiglaLibre` rechaza también `ID`).
  - `DatosSubproceso` gana `sigla: string | null`; al crear o editar un proceso o un subproceso, una sigla igual (sin distinguir mayúsculas) a la de otro proceso o subproceso → `Ya hay un proceso o subproceso con la sigla ${SIGLA}` (también si el `23505` del índice único llega primero).
  - `asignarSiglaASubproceso(tx: TransactionSql, subprocesoId: number, sigla: string, usuarioId: number): Promise<void>` — con las mismas validaciones y la auditoría de `editar_subproceso`; la usa la importación (T9).
  - `codigoCon(sigla: string, n: number) => \`${sigla}-ID-${String(n).padStart(3, "0")}\``; `proponerCodigo(procesoId: number, subprocesoId?: number | null, opciones?)` usa la sigla del subproceso si tiene, si no la del proceso; el número es 1 + el mayor `NNN` de `SIGLA-ID-NNN` en `indicadores` (cualquier estado).
  - `OpcionesFicha.codigosPropuestos: { procesos: Record<number, string>; subprocesos: Record<number, string> }`; el formulario propone el del subproceso elegido con sigla, o el del proceso; al cambiar de proceso o de subproceso, un código que todavía es el propuesto (prefijo `SIGLA-ID-` o `SIGLA-IND-` de la elección anterior) se propone de nuevo.

- [ ] **Step 1: Write the failing tests:** `validarSiglaOpcional("")` → `null`, `("cnt")` → `"CNT"`; `exigirSiglaNoReservada("id")` lanza «La sigla ID está reservada para los indicadores»; crear un tipo de documento con sigla `ID` → rechazado; dar la sigla `CNT` a un subproceso y después a otro → «Ya hay un proceso o subproceso con la sigla CNT»; un subproceso con la sigla de un proceso existente → el mismo mensaje; `proponerCodigo` con un subproceso `CNT` → `"CNT-ID-001"`, con `CNT-ID-004` ya usado (aunque esté descartado) → `"CNT-ID-005"`; sin sigla en el subproceso → `"<sigla del proceso>-ID-001"`; un `GRF-IND-03` existente no cambia la numeración de `GRF-ID-`.

- [ ] **Step 2: Run to verify they fail** (por el guard). Expected: FAIL.

- [ ] **Step 3: Implement.** El campo «Sigla (opcional)» en el alta y la edición del subproceso, con ayuda «De 2 a 4 letras; da el código de sus indicadores (CNT-ID-001)».

- [ ] **Step 4: Run to verify they pass**, más `tests/acciones-permisos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): sigla de los subprocesos y código SIGLA-ID-NNN del hospital`

---

### Task 8: La plantilla de importación: columnas, descarga, lectura y revisión

**Files:**
- Create: `src/lib/indicadores/importacion/columnas.ts` (puro), `src/lib/indicadores/importacion/revisar.ts` (puro), `src/lib/indicadores/importacion/plantilla.ts` (servidor, `exceljs`), `src/lib/indicadores/importacion/leer.ts` (servidor, `exceljs`)
- Test: `tests/indicadores-importacion-plantilla.test.ts` (nuevo, sin base)

**Interfaces:**
- Produces:
  - `ClaveColumna` y `COLUMNAS: readonly { clave: ClaveColumna; encabezado: string; obligatoria: boolean; lista: "procesos" | "subprocesos" | "tipos" | "clasificaciones" | "unidades" | "formas" | "factores" | "juntas" | "sentidos" | "periodicidades" | "estados" | null; ayuda: string }[]` con los encabezados exactos, en este orden: «Código», «Nombre», «Proceso (sigla)», «Subproceso», «Tipo», «Clasificación», «Nivel», «Objetivo del indicador», «Forma», «Variable A», «Variable B», «Factor», «Fórmula libre», «Cómo se junta A», «Cómo se junta B», «Unidad», «Meta», «Meta hasta», «Sentido», «Periodicidad», «Fuente», «Cargo responsable de medir», «Riesgo asociado», «Referente normativo», «Inicio de medición», «Estado» (obligatorias: Código, Nombre, Proceso, Tipo, Clasificación, Forma, Unidad, Meta, Sentido, Periodicidad, Estado). `MAXIMO_FILAS_IMPORTACION = 500`. Valores de lista: Forma «Porcentaje», «Tasa», «Promedio o razón», «Conteo», «Fórmula libre»; Cómo se junta «Se suma», «Último valor», «Promedio»; Sentido «Ascendente», «Descendente», «Constante»; Estado «Aprobado», «Propuesto».
  - `plantillaDeImportacion(listas: ListasDePlantilla): Promise<Buffer>` — hojas «Indicadores» (encabezados en la fila 1 y validación de lista en las filas 2 a 501 de cada columna con `lista`), «Instrucciones» (una fila por columna: encabezado, obligatoria, ayuda; la ayuda de «Cómo se junta» explica que una población, un inventario o un total del Listado Maestro va como «Último valor», spec §5.2) y «Listas» (oculta). `ListasDePlantilla = { procesos: string[]; subprocesos: string[]; tipos: string[]; clasificaciones: string[]; unidades: string[] }`. Toda celda escrita pasa por `neutralizarFormula`.
  - `leerPlantilla(bytes: Buffer): Promise<{ ok: true; filas: FilaLeida[] } | { ok: false; error: string }>`, `FilaLeida = { numero: number; celdas: Partial<Record<ClaveColumna, string>> }` (texto recortado; una celda combinada vacía es vacía; las filas vacías se saltan). Errores exactos: «El archivo no tiene la hoja «Indicadores»», `La hoja «Indicadores» no tiene la columna «${encabezado}»`, «La plantilla no tiene filas», «La plantilla tiene más de 500 filas».
  - `type ReglaDeImportacion = { pctAscendente: number; pctDescendente: number }` y `type Pendiente = { tipo: "subproceso" | "cargo" | "tipo" | "unidad"; texto: string }`.
  - `revisarLote(filas: FilaLeida[], c: Catalogos, corr: Correspondencias, regla: ReglaDeImportacion, anio: number): FilaRevisada[]` con
    `Catalogos = { procesos: { id: number; sigla: string; nombre: string }[]; subprocesos: { id: number; procesoId: number; nombre: string; sigla: string | null }[]; tipos: Catalogo[]; clasificaciones: Catalogo[]; unidades: (Catalogo & { sufijo: string; decimales: number })[]; cargos: Catalogo[]; codigosUsados: ReadonlySet<string> }` (`Catalogo = { id: number; nombre: string }`, códigos en minúsculas),
    `Correspondencias = { subprocesos: Record<string, number>; cargos: Record<string, number>; tipos: Record<string, number>; unidades: Record<string, number> }` (clave: el texto del archivo normalizado con `normalizar` de `src/lib/lote-usuarios.ts`),
    `FilaRevisada = { numero: number; codigo: string; ficha: FichaImportada | null; problemas: string[]; avisos: string[]; pendientes: Pendiente[] }` (una fila sin `problemas` ni `pendientes` tiene `ficha`),
    `FichaImportada = { codigo; nombre; procesoId; subprocesoId: number | null; tipoId; clasificacionId; nivel: string | null; proposito: string | null; forma: Forma; factor: number | null; formula: string; variables: { letra: "A" | "B"; nombre: string; fuente: string | null; consolidacion: Consolidacion }[]; unidadId; meta: string; metaMax: string | null; tendencia: Tendencia; periodicidad: Periodicidad; cargoId: number | null; riesgoAsociado: string | null; requisito: string | null; inicioMedicion: string; estado: "aprobado" | "propuesto"; rangos: RangosEnTexto; siglaParaSubproceso: string | null }`.
  - Reglas de `revisarLote`: los catálogos se emparejan por nombre normalizado (el subproceso también sin un sufijo final «(XXX)»: «Laboratorio Clínico (LAB)» → «laboratorio clinico»), o por la correspondencia elegida; lo que no se empareja va a `pendientes`. La fórmula sale de `formulaDeForma` (`src/lib/indicadores/formula/formas.ts`); «Fórmula libre» pasa por `analizar` y su error va a `problemas`. Los rangos, de `rangosDeLaRegla(meta, sentido, pctAscendente, pctDescendente)`; «Constante» → problema ««Mantenerse en un rango» no se importa: cree esa ficha en la app». «Inicio de medición» `AAAA-MM` (vacío: `${anio}-01`) se convierte en la clave del periodo que contiene ese mes con `periodoQueContiene`. La sigla del código (antes de `-ID-`) se ofrece en `siglaParaSubproceso` si el subproceso no tiene sigla y la del código no es la del proceso.
  - Problemas exactos: `El código ${c} se repite en las filas ${a} y ${b}`, `El código ${c} ya existe en la app`, `Falta «${encabezado}»`, `La meta «${t}» no es un número`, `«${t}» no es una forma: use Porcentaje, Tasa, Promedio o razón, Conteo o Fórmula libre` (y los análogos de Sentido, Periodicidad, Estado, Factor y Cómo se junta), `El inicio de medición «${t}» no es AAAA-MM`, y `«${encabezado}» pasa de ${n} caracteres` con los largos máximos de `EsquemaFicha` (nombre 200, requisito 120, objetivo 1000, y los demás que el esquema fije): un texto aprobado no se recorta. Aviso exacto (no bloquea): `La meta ${t} de un porcentaje parece una fracción: ¿quiso escribir ${t × 100}?` cuando la unidad tiene sufijo «%» y 0 < meta ≤ 1.

- [ ] **Step 1: Write the failing tests** (sin base): `plantillaDeImportacion` produce un libro con las hojas «Indicadores», «Instrucciones» y «Listas» y los 26 encabezados en orden; `leerPlantilla` de esa plantilla con dos filas escritas en el test devuelve sus celdas; un libro sin la hoja → «El archivo no tiene la hoja «Indicadores»»; `revisarLote` con catálogos sintéticos: una fila completa de porcentaje (meta 95, ascendente) → `ficha.formula === "A / B * 100"` y `ficha.rangos` = Bien `>= 95`, Atención `>= 85.5`, Crítico `< 85.5`; «Laboratorio Clínico (LAB)» se empareja con el subproceso «Laboratorio»; un subproceso desconocido → `pendientes` y `ficha === null`; código repetido en filas 2 y 5 → «El código CNT-ID-001 se repite en las filas 2 y 5»; meta 0,95 con unidad «Porcentaje» → el aviso «La meta 0,95 de un porcentaje parece una fracción: ¿quiso escribir 95?» y la fila sigue teniendo `ficha`; «Constante» → su problema; «Propuesto» → `estado: "propuesto"`; inicio vacío en una trimestral con `anio` 2026 → la clave del primer trimestre de 2026.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/indicadores-importacion-plantilla.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run to verify they pass** y `npm run lint` (incluye `tests/file-type-empaquetado.test.ts` y `tests/frontera-cliente.test.ts`: `plantilla.ts` y `leer.ts` no los importa ningún componente de cliente). Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): plantilla de importación de indicadores, lectura y revisión de filas`

---

### Task 9: Importar un lote (consultas, rutas y acciones)

**Files:**
- Create: `src/db/consultas/indicadores/importacion.ts`, `src/app/api/importaciones-indicadores/[id]/archivo/route.ts` (POST, subida), `src/app/(app)/admin/(panel)/indicadores/importar/plantilla/route.ts` (GET, plantilla), `src/app/(app)/admin/(panel)/indicadores/importar/[id]/archivo/route.ts` (GET, el Excel del lote, como descarga)
- Modify: `src/db/consultas/indicadores/fichas.ts` (extraer `escribirFichaNueva`), `src/lib/recepcion-archivo.ts` (contexto `importacion_indicadores`: solo `.xlsx`), `src/proxy.ts` (fuera del `matcher`), `src/app/admin/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`, `AGENTS.md` (lista de rutas de subida)
- Test: `tests/indicadores-importacion.test.ts` (nuevo), `tests/proxy-matcher.test.ts`, `tests/bitacora-detalle.test.ts`, `tests/acciones-permisos.test.ts`, `tests/paginas-sesion.test.ts`

**Interfaces:**
- Consumes: `revisarLote`, `leerPlantilla`, `plantillaDeImportacion` (T8); `asignarSiglaASubproceso` (T7); tablas de T2; `verificarParaFirmar` (`src/lib/firma.ts`).
- Produces (`importacion.ts`):
  - `crearLote(sesion: SesionFlujo, opciones?: Opciones): Promise<{ id: number }>` — exige `indicadores.administrar`; bitácora `preparo_importacion_indicadores`.
  - `autorizarArchivoDeLote(loteId: number, sesion): Promise<{ ok: true } | { ok: false; estado: 404 | 409 }>` — 409 si ya tiene archivo o ya se importó.
  - `estadoDeLote(sql, loteId): Promise<"sin_archivo" | "por_importar" | "importado" | "deshecho" | null>`.
  - `vistaPrevia(sesion, loteId, d: { correspondencias: Correspondencias; regla: ReglaDeImportacion }, opciones?): Promise<VistaPrevia | null>` — lee el archivo del almacén, `leerPlantilla` y `revisarLote` con los catálogos y los códigos usados; `VistaPrevia = { filas: FilaRevisada[]; pendientes: Pendiente[]; opciones: { subprocesos; cargos; tipos; unidades } }`.
  - `importarLote(sesion: SesionFlujo, loteId: number, d: { correspondencias; regla; aprobacionPrevia: { documento: string; aprobadoPor: string; fecha: string }; siglas: Record<number, string>; credenciales: CredencialesFirma }, opciones: OpcionesFlujo): Promise<{ aprobadas: number; borradores: number; omitidas: number }>` — F13A-R4: `validarImportacion` de solo lectura antes (mensajes: «El documento de la aprobación previa es obligatorio», «Quién aprobó es obligatorio», «La fecha de la aprobación previa no es válida», «Esta importación ya se hizo», «No hay filas para importar»), la clave con `verificarParaFirmar` fuera, y dentro de una transacción con `pg_advisory_xact_lock` del lote: revalida, asigna las siglas elegidas, y por cada fila sin problemas ni pendientes crea con `escribirFichaNueva` el indicador y su versión (en borrador, con sus hijas, `importacion_id`, `aprobacion_previa_*`, `semaforo_modo = 'rangos'`, `rangos`, `sustento_meta` = `Regla de ${documento}: Alerta ≥ ${pctAscendente} % de la meta (ascendente) y ≤ ${pctDescendente} % (descendente)`); las «aprobado» pasan a `estado = 'aprobada'`, `aprobada_en = ahora`, `aprobada_por` = quien importa, `rige_desde` = el inicio, el indicador a `activo` y `asegurarMediciones` (así lo terminado antes de la importación es histórico, spec §5.8); las «propuesto» quedan en borrador. Sin avisos. Inserta el evento `importado` (con `metodo` y `detalle`: códigos creados, regla, aprobación previa, correspondencias, huella del archivo) y la bitácora `importo_indicadores`. Un `23505` del evento → «Esta importación ya se hizo».
  - `escribirFichaNueva(tx: TransactionSql, sesion: SesionFlujo, d: DatosFicha, extra: { importacionId: number; aprobacionPrevia: { documento: string; aprobadoPor: string; fecha: string } | null } | null, ahora: Date): Promise<{ indicadorId: number; versionId: number; codigo: string }>` — lo que hoy hace `crearIndicador` dentro de su transacción; `crearIndicador` la llama con `extra = null`. Con `extra`, `proposito` puede ser nulo y una clasificación que exige norma no la exige (spec §5.6: rige en el siguiente cambio).
  - `datosDeFichaImportada(f: FichaImportada, regla: ReglaDeImportacion, documento: string): DatosFicha` — el `cargoId` entra como cargo responsable de **medir** y de **analizar**; la fuente de la fila va a cada variable; el referente normativo, a `requisito`; sin designados.
- Rutas: POST de subida como `api/mediciones/[id]/archivos` (sesión, `indicadores.administrar`, `origenValido`, limitador, `autorizarArchivoDeLote`, `recibirArchivo(peticion, { contexto: "importacion_indicadores", contextoId: id, carpeta: \`importaciones/${id}\` }, usuarioId)`); para ese contexto `recibirArchivo` acepta solo `.xlsx` y responde 415 «La importación recibe solo la plantilla en Excel (.xlsx)». GET de la plantilla y del archivo: `sesionDePeticion` y `puede(sesion, "indicadores.administrar")` (401/403), `Content-Disposition: attachment`.
- Acciones (`acciones-indicadores.ts` del panel): `crearLoteAccion`, `vistaPreviaAccion` (devuelve `VistaPrevia` como estado), `importarLoteAccion` (con `separarFirma` y `destinoDeFirma`, como `enviarAAprobacionAccion`).

- [ ] **Step 1: Write the failing tests** (`indicadores-importacion.test.ts`, todo en `revertida`, con `verificar` inyectado como en `indicadores-aprobacion.test.ts` y una plantilla sintética de `plantillaDeImportacion` llenada en el test): un lote con dos filas, una «Aprobado» (mensual, inicio `2026-01`) y una «Propuesto», importado con `ahora` = 2026-11-13 → la primera es `activo` con versión `aprobada`, `importacion_id`, `aprobacion_previa_documento = 'SGC-TI-002 v1'`, `rangos` de la regla, y sus mediciones de 2026-01 a 2026-10 son `historica = true`, sin tareas; la segunda queda en `borrador`; el evento `importado` existe; la bitácora tiene `importo_indicadores`; importar otra vez el mismo lote → «Esta importación ya se hizo»; una fila con código ya usado se omite (`omitidas = 1`) y el resto entra; sin documento → «El documento de la aprobación previa es obligatorio»; una sigla elegida (`CNT`) queda en el subproceso. En `proxy-matcher.test.ts`, el caso de `api/importaciones-indicadores/1/archivo` fuera del `matcher`; en `bitacora-detalle.test.ts`, las frases de `preparo_importacion_indicadores` e `importo_indicadores`.

- [ ] **Step 2: Run to verify they fail** (por el guard). Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run to verify they pass**, más `tests/indicadores-fichas.test.ts`, `tests/acciones-permisos.test.ts`, `tests/paginas-sesion.test.ts`, `tests/file-type-empaquetado.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): importar un lote de fichas aprobadas antes de SGC Integral`

---

### Task 10: Las pantallas de la importación

**Files:**
- Create: `src/app/(app)/admin/(panel)/indicadores/importar/page.tsx`, `src/app/(app)/admin/(panel)/indicadores/importar/[id]/page.tsx`, `src/componentes/indicadores/importacion/SubirPlantilla.tsx` (`'use client'`), `src/componentes/indicadores/importacion/FormularioImportacion.tsx` (`'use client'`), `src/componentes/indicadores/importacion/TablaVistaPrevia.tsx`
- Modify: `src/app/(app)/admin/(panel)/indicadores/page.tsx` (enlace «Importar indicadores»), `src/db/consultas/indicadores/importacion.ts` (`lotesRecientes(sesion: SujetoPermiso, opciones?): Promise<{ id: number; cargadoEn: Date; cargadoPor: string; estado: "sin_archivo" | "por_importar" | "importado" | "deshecho"; archivo: string | null; aprobadas: number; borradores: number }[]>`, los 50 más recientes)
- Test: `tests/indicadores-importacion-pantallas.test.tsx` (nuevo)

**Interfaces:**
- Consumes: acciones y consultas de T9.
- Produces: `/admin/indicadores/importar` (con `exigirPermiso("indicadores.administrar")`): «Descargar la plantilla», «Nueva importación» (`SubirPlantilla`: llama `crearLoteAccion`, sube el archivo a `/api/importaciones-indicadores/<id>/archivo` y navega al lote) y la lista de lotes con su estado. `/admin/indicadores/importar/[id]`: los datos de la aprobación previa (Documento, Quién aprobó, Fecha), la regla («Atención desde el __ % de la meta, en ascendente» con 90; «Atención hasta el __ % de la meta, en descendente» con 110), las correspondencias pendientes (un `<select>` por texto), la tabla de la vista previa (código, nombre, proceso › subproceso, fórmula, meta, rangos en palabras, cómo quedará el acumulado del año: «suma de los periodos» o «el del último periodo», estado, problemas y avisos) y «Importar N fichas» (diálogo con la clave). Después de importar: «Se importaron N fichas aprobadas y M en borrador» con enlace a la lista.

- [ ] **Step 1: Write the failing tests:** la página del lote con una vista previa sintética muestra los tres campos de la aprobación previa, los dos porcentajes con 90 y 110, un `<select>` por pendiente con su `<label>`, una fila con su problema y el botón «Importar 1 ficha»; la página sin permiso → la ruta llama `exigirPermiso` (lo vigila `tests/paginas-sesion.test.ts`).

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.

- [ ] **Step 3: Implement** (390 px: la tabla en `TablaDatos` con desplazamiento propio, el formulario en una columna).

- [ ] **Step 4: Run to verify they pass**, más `tests/paginas-sesion.test.ts`, `tests/a11y-estructura.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): pantallas de la importación con vista previa y correspondencias`

---

### Task 11: Deshacer la importación

**Files:**
- Modify: `src/db/consultas/indicadores/importacion.ts`, `src/app/admin/acciones-indicadores.ts`, `src/app/(app)/admin/(panel)/indicadores/importar/[id]/page.tsx`, `src/lib/bitacora-detalle.ts`
- Create: `src/componentes/indicadores/importacion/DialogoDeshacer.tsx`
- Test: `tests/indicadores-importacion.test.ts`, `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Produces:
  - `condicionDeDeshacer(sql: Cliente, loteId: number): Promise<{ puede: boolean; impiden: { codigo: string; motivo: string }[] }>` — motivos exactos: «tiene datos reportados» (alguna medición con valores, `no_aplica`, `reportada_en`, análisis, soportes, observaciones o eventos), «tiene personas designadas» (`indicador_designados`), «tiene una versión posterior» (otra versión del indicador sin `importacion_id`, en cualquier estado), «el lote no está importado» / «el lote ya se deshizo».
  - `deshacerImportacion(sesion: SesionFlujo, loteId: number, d: { motivo: string; credenciales: CredencialesFirma }, opciones: OpcionesFlujo): Promise<{ fichas: number }>` — exige `indicadores.administrar`; motivo de 10 a 500 caracteres («El motivo debe tener al menos 10 caracteres»); F13A-R4 (validador, clave fuera, revalidación dentro con `pg_advisory_xact_lock`); con impedimentos → `No se puede deshacer: ${codigo} ${motivo}` (el primero); dentro: `SELECT set_config('sgc.deshacer_importacion', ${String(loteId)}, true)`, borra en el orden de las FK las mediciones sin datos, las hijas de las versiones del lote, las versiones y los indicadores; inserta el evento `deshecho` (`detalle`: motivo y códigos) y la bitácora `deshizo_importacion_indicadores`. Un `23505` del evento → «Esta importación ya se deshizo». Las siglas que se dieron a los subprocesos quedan.
  - `deshacerImportacionAccion` y `DialogoDeshacer` (motivo y clave); la página del lote lo ofrece solo si `puede`, y si no, lista `impiden` («No se puede deshacer: CNT-ID-001 tiene datos reportados»).

- [ ] **Step 1: Write the failing tests** (en `revertida`): importar dos fichas y deshacer → no queda ninguna fila de esos indicadores, el lote tiene los eventos `importado` y `deshecho`, la bitácora `deshizo_importacion_indicadores`, y la misma plantilla se importa otra vez con los mismos códigos en un lote nuevo; con una medición reportada → `condicionDeDeshacer` da `puede: false` con «tiene datos reportados» y `deshacerImportacion` lanza «No se puede deshacer: CNT-ID-001 tiene datos reportados»; con una persona designada → «tiene personas designadas»; deshacer dos veces → «Esta importación ya se deshizo»; motivo corto → «El motivo debe tener al menos 10 caracteres».

- [ ] **Step 2: Run to verify they fail** (por el guard). Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run to verify they pass**, más `tests/esquema-fase14a-importacion.test.ts`, `tests/acciones-permisos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): deshacer una importación mientras ninguna ficha tenga datos ni designados`

---

### Task 12: La ficha importada dice de dónde viene su aprobación

**Files:**
- Modify: las lecturas de la ficha y de sus versiones (`aprobacion.ts`: `fichaDeVersion`, `versionesDe`; `impresion.ts`), `ficha/FichaTecnica.tsx`, `ficha/FichaImpresa.tsx`, `ficha/ControlDeCambios.tsx`, `src/lib/indicadores/excel.ts` (hoja «Ficha»)
- Test: `tests/indicadores-impresion.test.tsx`, `tests/indicadores-excel.test.ts`, `tests/indicadores-pantalla.test.tsx`

**Interfaces:**
- Consumes: columnas de T2 y el lote de T9.
- Produces: la lectura de una versión gana `importada: { documento: string; aprobadoPor: string; fecha: string; importadoPor: string; importadoEn: Date } | null`. Donde hoy van las firmas «Elaboró» y «Aprobó», una versión importada dice (copia exacta, fechas con el formateador de la app y `zonaHoraria()`):
  `Aprobada antes de la implementación de SGC Integral: ${documento}, aprobó ${aprobadoPor} el ${fecha}. Importó ${importadoPor} el ${importadoEn}.`
  En «Control de cambios», la versión importada dice «Importada» en lugar del aprobador. La hoja «Ficha» del Excel lleva la misma frase.

- [ ] **Step 1: Write the failing tests:** la ficha técnica y la impresa de una ficha importada (lote en `revertida`) muestran la frase con «SGC-TI-002 v1», «Gerente» y «11 sep 2026», y no muestran «Elaboró»; el Excel de la ficha la escribe en la hoja «Ficha»; «Control de cambios» dice «Importada».

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run to verify they pass** y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(f14a): la ficha importada dice que se aprobó antes de SGC Integral`

---

### Task 13: Demo, documentación y verificación

**Files:**
- Modify: `src/db/semillas/indicadores-demo-fichas.ts` (o el archivo de la semilla que corresponda), `tests/semilla-indicadores.test.ts` (las cifras sembradas), `CONTEXT.md`, `AGENTS.md`, `docs/manual/usuario/08-indicadores.md`, `PLAN.md`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Semilla.** La demo da la sigla `CNT` a «Gestión Contable» y siembra, por las funciones del dominio: una ficha nueva con rangos `CNT-ID-001` («Oportunidad en el cierre contable», mensual, Bien `>= 91` · Atención `entre 41 y 90` · Crítico `<= 40`, meta 100) con un periodo reportado en 95 (verde que no cumple, con su análisis) y otro en 100; y un lote importado pequeño (dos fichas, una aprobada y una propuesta, con aprobación previa «SGC-TI-002 v1», «Gerente», 2026-09-11), con la firma de la demo (`firmaDeLaDemo`). Ajusta `SEMBRADO`/las cifras de `tests/semilla-indicadores.test.ts` y añade los casos: `CNT-ID-001` tiene un periodo `semaforo = 'bien'` con `cumple = false`; la ficha importada tiene `importacion_id`.

- [ ] **Step 2: Documentación.**
  - `CONTEXT.md`, arriba de la 14A: «Entrega complementaria de la 14A: rangos, códigos e importación» con «Hecho», «Qué probar y cómo» (los ocho pasos de spec §8, sobre la demo y sus usuarios), «Avisos para el usuario» (migración `0012` y `npm run db:preparar`; la plantilla y cómo pasar la matriz del hospital; la regla del 90 % y el 110 %; `ID` reservada; las fichas aprobadas antes conservan su regla hasta su próximo cambio mayor), «Decisiones adicionales» (las quince de spec §9, una línea cada una con su porqué) y la deuda que quede.
  - `AGENTS.md`: en «Un solo camino de cálculo» y en «El cumplimiento de un porcentaje…», que «cumple» es alcanzar la meta y Bien puede empezar antes; en «La ficha de un indicador», el código `SIGLA-ID-NNN`, la sigla de los subprocesos, `ID` reservada, la importación (aprobación previa, regla de rangos, históricos, deshacer y su excepción estrecha del trigger); la ruta de subida nueva (si T9 no la dejó).
  - Manual, capítulo 8: §2.3 (Bien que no alcanza la meta), §6.1 (los rangos con signo y valor; Nivel y Riesgo asociado; el código del hospital), §6.9 (Parámetros sin el umbral; la sigla del subproceso en el mapa) y una sección nueva §6.10 «Importar indicadores» (descargar la plantilla, pasar la matriz, vista previa, correspondencias, importar con la clave, deshacer).
  - `PLAN.md`: la fila de la entrega complementaria en la tabla de fases, antes de la 14B.

- [ ] **Step 3: Verificación final** (por el guard, después del último commit de código):
  `npm run lint`; resembrar (`npm run db:seed` y `npm run admin:asegurar`); `SEMILLA_RECIEN=1 npm test`; `env -u DATABASE_URL -u DATABASE_URL_MIGRADOR npm run build`; resembrar otra vez. Expected: lint limpio, todos los tests en verde (el saltado de siempre de ratificaciones), build en verde.

- [ ] **Step 4: Commit** — `docs(f14a): rangos, códigos e importación - semilla, manual, CONTEXT y AGENTS`
