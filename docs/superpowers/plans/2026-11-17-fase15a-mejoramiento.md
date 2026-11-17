# Fase 15A — Mejoramiento: el hallazgo de punta a punta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que toda falla detectada en el hospital quede registrada como un hallazgo, recorra su camino (aceptación,
corrección, causa raíz, plan firmado, ejecución, verificación, eficacia y cierre) con la persona y la fecha de cada paso,
y que nadie verifique lo que ejecutó ni vea lo que no le corresponde.

**Architecture:** un módulo nuevo, «Mejoramiento», con el **hallazgo** como unidad y la **ronda** como cada intento de
resolverlo. Las reglas puras (días hábiles, orígenes, estados, tabla de transiciones, fechas de eficacia, huellas) viven en
`src/lib`; todo cambio de estado entra por una sola función, `transicionarHallazgo`, que escribe el evento, el vencimiento
del paso, la bitácora y los avisos. La visibilidad es una regla de `src/lib/alcance.ts` (alcance por proceso más
participación), que todas las lecturas y los archivos aplican. Las consultas son plantillas de postgres.js, como en el
resto del repositorio; Drizzle solo declara el esquema y genera la migración.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript estricto, PostgreSQL 16 con Drizzle (esquema y
migraciones) y postgres.js (consultas), `zod`, `exceljs`, Vitest. **Sin dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-11-17-fase15-planes-de-mejoramiento-design.md` («el spec»): §0 a §16 y §19 a §26
para esta entrega. Lea esas secciones enteras y `AGENTS.md` antes de empezar; de §17 y §18 (15B y 15C), solo lo que una
tarea cite. Las maquetas están en `<espacio>/pantallas-15-v2.html`. El spec manda; este plan lo argumenta. Donde el plan
fija un nombre que el spec dejó provisional, vale el del plan («Nombres fijos»).

## Global Constraints

- Trabajo en el worktree `F:\sgc-integral-f15a`, rama `fase-15a-mejoramiento` (sale de `main`). Nunca el código de
  `F:\sgc-integral`, su base `sgc` ni su `next dev` del 3002; sin Docker salvo el `psql` que crea y borra las bases de
  trabajo; sin `.env.local` (no se lee ni se crea); sin `push` ni `merge`.
- `<espacio>` es `F:\sgc-integral-f15a\.superpowers\sdd\2026-11-17-fase15a-mejoramiento` (ignorado por git). Todo comando
  que toque la base va por su guard, que carga el entorno de la base aparte `sgc_f15a`:
  `bash <espacio>/con-f15a.sh npx vitest run tests/x.test.ts`. Un servidor para los puntos de control va en otro puerto:
  `bash <espacio>/con-f15a.sh npx next dev -p 3015`.
- **Una sola migración nueva, `drizzle/0018_fase15a-mejoramiento.sql`,** generada con
  `npm run db:generate -- --name fase15a-mejoramiento` (por el guard) y completada a mano con el SQL que Drizzle no genera.
  Solo añade (piso 11 de `AGENTS.md`). Si `db:generate` se queda esperando una respuesta interactiva, deténgase y avise al
  controlador. No se tocan la `0000` a la `0017` (la `0017` tiene SQL reordenado a mano: compruebe que sigue igual después
  de generar). `src/db/esquema.ts` importa solo con rutas relativas. **Una columna que falte obligaría a una `0019`:**
  toda la estructura de la entrega va en la Tarea 2.
- **Lo de la 13B no se toca ni se reutiliza por nombre:** la tabla `hallazgos`, el contexto de archivo `hallazgo`, las
  rutas `api/hallazgos`, los prefijos de tarea `hallazgo:` y `validar:`, las acciones de bitácora `hallazgo_*`, la entidad
  de aviso `hallazgo` y el tipo `hallazgo.por_validar`. Todo lo de esta entrega usa los prefijos de «Nombres fijos».
- **Un solo camino cambia el estado:** solo `transicionarHallazgo` escribe `mejora_hallazgos.estado` y `.ronda`.
- **Quien ejecuta no verifica, sin excepción** (spec §11.1): se comprueba en el servidor y se repite dentro de la
  transacción.
- **Para quien no puede ver un hallazgo, no existe:** ni su código, ni su título, ni su conteo, en ninguna pantalla,
  archivo, aviso, tarea ni mensaje de error. La respuesta es la misma que si el identificador no existiera.
- **Plazos de este módulo en días hábiles** (`src/lib/dias-habiles.ts`); los recordatorios, el aviso al jefe y los dos
  meses de la espera, en días o meses calendario. Fechas siempre en `zonaHoraria()`; nunca una zona fija.
- **La fecha de fin original de una actividad no cambia nunca** después de aprobado el plan.
- Actos con firma: F13A-R4 (validador de solo lectura, `verificarParaFirmar` fuera de la transacción, todo repetido dentro
  con el hallazgo `FOR UPDATE`). El molde es `aprobarFichas` (`src/db/consultas/indicadores/aprobacion.ts:771`).
- Toda Server Action nueva pasa por `mutacion(formData, "<permiso literal>", fn)` (`tests/acciones-permisos.test.ts`); toda
  acción de bitácora nueva tiene su `case` en `describirEvento` y su entrada en `NOMBRE_DE_ACCION`
  (`src/lib/bitacora-detalle.ts`, `tests/bitacora-detalle.test.ts`); cada página nueva llama `exigirSesion()` en su propio
  texto (`tests/paginas-sesion.test.ts`); cada ruta que recibe una subida va fuera del `matcher` de `src/proxy.ts`, con su
  caso en `tests/proxy-matcher.test.ts`. Cada test estructural se actualiza en la tarea que lo rompe.
- `mutacion` muestra el `message` de cualquier error: los errores crudos de PostgreSQL (`23503`, `23505`, `42501`, `40P01`)
  se traducen a `ErrorMejora` con una frase legible **antes** de salir del dominio. Los mensajes de dominio son frases que
  ve la persona.
- Colores solo por token (`tests/colores-fijos.test.ts`); color del módulo, `mod-planes`; nada de `opacity` para atenuar;
  el estado nunca solo por color; ningún nombre de entidad en `src/` (`tests/textos-fijos.test.ts`); páginas sin `<main>`,
  sin `<h1>` propio y sin `mx-auto` (`tests/sin-main.test.ts`): `EncabezadoPagina` y los componentes de
  `src/componentes/ui`. Navegable por teclado y a 390 px. `"use client"` solo donde hay interacción, y ninguna función
  auxiliar en un archivo de cliente que un archivo de servidor importe (`tests/frontera-cliente.test.ts`).
- Todo formulario con texto libre del módulo lleva el aviso exacto: «No escriba nombres ni documentos de pacientes o de
  quien se quejó. Use el número del caso.» (constante `AVISO_SIN_PACIENTES`, Tarea 3).
- Tests contra la base: lo que no deba quedar va dentro de `revertida` (`tests/utiles/transaccion.ts`); usuarios con
  historia, `usuarioDePrueba` (`tests/utiles/tramites.ts`), que ya los nombra `zz_…_${Date.now()}`; nunca `UPDATE` ni
  `DELETE` sobre tablas de solo inserción en una limpieza; ningún test deja un hallazgo terminado fuera de una transacción
  que se revierte. `ahora` siempre inyectado en las opciones.
- Next.js de este repo no es el de memoria: antes de escribir una página, una acción o un handler, lea la guía que toque
  en `node_modules/next/dist/docs/`. `params` y `searchParams` son promesas.
- Commits convencionales en español, terminados con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (la línea que
  fija `AGENTS.md`). Se confirma por ruta (`git add <archivo>`), nunca `git add -A`.
- Textos de la interfaz en español con tildes; los mensajes entre comillas de este plan son copia exacta.
- Mientras itera corra el test enfocado; antes de confirmar, los archivos de test que la tarea nombra y `npm run lint`.
  **No corra la suite completa** (tarda más de cinco minutos): la corre el controlador.

## Nombres fijos

Cada tarea ve solo su texto: estos nombres no se cambian.

**Prefijos.** Tablas `mejora_*`. Permisos `mejora.*`. Claves de configuración `mej_*`. Acciones de bitácora
`mejora_<algo>` con entidad `mejora_hallazgo`, `mejora_actividad` o `mejora_reporte`. Tipos de aviso `mejora.<algo>` con
la misma entidad. Identificadores de tarea `mej-<paso>:<id>`. Archivos de prueba `tests/mejora-*.test.ts(x)`.

**Código.** Reglas puras en `src/lib/mejoramiento/`; días hábiles en `src/lib/dias-habiles.ts`; consultas en
`src/db/consultas/mejoramiento/`; acciones en `src/app/acciones-mejoramiento.ts` (configuración:
`src/app/admin/acciones-mejoramiento.ts`); páginas en `src/app/(app)/mejoramiento/`; componentes en
`src/componentes/mejoramiento/`; esquemas `zod` en `src/lib/esquemas/mejoramiento.ts`; utilidades de prueba en
`tests/utiles/mejoramiento.ts`.

**Error de dominio.** `ErrorMejora extends ErrorTramite` (`src/lib/mejoramiento/tipos.ts`).

**Valores** (todos `text` con `CHECK`, nunca `pgEnum`):

| Qué | Valores |
|---|---|
| `clase` | `no_conformidad`, `observacion`, `oportunidad` |
| `criticidad` | `alta`, `media`, `baja` (solo en `no_conformidad`; nula en las otras) |
| `origen` | `auditoria_interna`, `control_interno`, `revision_direccion`, `pamec`, `autoevaluacion`, `indicador`, `pqrsf`, `evento_adverso`, `riesgo_materializado`, `satisfaccion_usuario`, `control_documental`, `otro`, `auditoria_externa`, `ente_control` (externos: los dos últimos) |
| `estado` del hallazgo | `por_aceptar`, `rechazo`, `arbitraje`, `por_corregir`, `por_decidir`, `por_validar`, `por_formular`, `en_revision`, `en_aprobacion`, `en_ejecucion`, `por_verificar`, `en_espera`, `por_cerrar`, `cerrado`, `rechazado`, `anulado` (terminales: los tres últimos) |
| `resultado_cierre` | `eficaz`, `con_correccion`, `sin_accion` |
| `estado_plan` de la ronda | `borrador`, `enviado`, `aprobado` |
| tipo de acción | `correctiva`, `preventiva`, `mejora` |
| método de análisis | `cinco_porques`, `ishikawa`, `pareto` (15C), `otro` |
| estado de la actividad | `abierta`, `en_proceso`, `terminada`, `cancelada` |
| tipo de ajuste / estado | `reprogramar`, `agregar`, `cancelar` / `pendiente`, `aprobado`, `negado` |
| estado del reporte | `recibido`, `convertido`, `sumado`, `descartado` |
| criterios de eficacia | `no_recurrencia`, `mejora_indicador`, `reduccion_pqrs`, `otro` |
| firmas nuevas | `verifico`, `cerro` (se suman a `elaboro`, `reviso`, `aprobo`) |
| contextos de archivo | `mejora_hallazgo`, `mejora_ronda`, `mejora_actividad`, `mejora_reporte` |
| roles de archivo nuevos | `correccion`, `carga`, `analisis`, `verificacion` (más el `evidencia` que ya existe) |
| acciones de `transicionarHallazgo` | `registrar`, `aceptar`, `rechazar`, `retirar`, `sostener`, `confirmar_hallazgo`, `confirmar_rechazo`, `corregir`, `decidir_si`, `decidir_no`, `validar_correccion`, `devolver_correccion`, `enviar_plan`, `devolver_plan`, `revisar_plan`, `aprobar_plan`, `completar`, `verificar_implementacion`, `evaluar_eficaz`, `evaluar_no_eficaz`, `cerrar`, `anular`, `cargar`, `reclasificar`, `ajustar` |

**Código del hallazgo.** `HZ-AAAA-NNN`: `"HZ-" + anio + "-" + String(n).padStart(3, "0")`. El hallazgo 1.000 del año es
`HZ-2026-1000` (cuatro cifras): el patrón que valida un código es `^HZ-\d{4}-\d{3,}$`. El consecutivo sale de la tabla
`mejora_consecutivos` dentro de la transacción del registro; **no** de una secuencia (una transacción revertida quemaría
el número).

**Claves de configuración** (valor por omisión; los plazos, de 1 a 60; los recordatorios, de 1 a 365):
`mej_plazo_clasificar_dias` 3, `mej_plazo_aceptar_dias` 3, `mej_plazo_decision_dias` 3 (retirar o sostener, arbitrar,
decidir la acción correctiva, validar la corrección, decidir un ajuste, cerrar), `mej_plazo_correccion_dias` 3,
`mej_plazo_formular_dias` 10, `mej_plazo_reenviar_dias` 5, `mej_plazo_revisar_dias` 3, `mej_plazo_aprobar_dias` 3,
`mej_plazo_verificar_dias` 5, `mej_plazo_evaluar_dias` 5, `mej_recordatorio_alta_dias` 15, `mej_recordatorio_dias` 30,
`mej_formato_registro_documento_id`, `mej_formato_porques_documento_id`, `mej_formato_ishikawa_documento_id` (los tres,
`""` = sin documento).

**Rutas.** `/mejoramiento` (lista), `/mejoramiento/nuevo`, `/mejoramiento/[id]`, `/mejoramiento/[id]/formular`,
`/mejoramiento/[id]/imprimir`, `/mejoramiento/actividades`, `/mejoramiento/actividades/[id]`, `/mejoramiento/reportar`,
`/mejoramiento/reportes`, `/mejoramiento/excel` (GET), `/mejoramiento/archivos/[archivoId]/[[...nombre]]` (GET),
`/admin/mejoramiento`. Subidas (POST, fuera del `matcher`): `api/mejoramiento/hallazgos/[id]/archivos`,
`api/mejoramiento/rondas/[id]/archivos`, `api/mejoramiento/actividades/[id]/archivos`,
`api/mejoramiento/reportes/[id]/archivos`. `[id]` es el identificador numérico (`/^\d{1,15}$/`); el código se muestra, no
se usa en la ruta.

**Precisiones de este plan sobre el spec** (lo que el spec dejó al constructor y aquí queda decidido):

- Columnas que el spec no nombra: `mejora_hallazgos.aviso_evaluar_en` (el aviso de «ya se puede evaluar», distinto del de
  vencido) y `mejora_actividades.gerencia_en` (la escalada a Gerencia, distinta de `escalado_en`, que es el aviso al
  jefe). La tabla `mejora_consecutivos`, para el código.
- La corrección y la decisión van en columnas de `mejora_hallazgos`, no en tabla aparte.
- **Sin insignia de conteo en la barra lateral:** el spec no la pide.
- La acción de bitácora del Excel es `mejora_exporto_hallazgos` (el spec la llama `exporto_hallazgos`).
- **La carga de un hallazgo en curso va en dos pasos** (Tarea 20): primero los datos, después el escaneo. Mientras falte
  el escaneo, las actividades no llegan a sus responsables y no se puede verificar. Así el escaneo es obligatorio de verdad
  sin que un formulario tenga que subir un archivo de 25 MB por una Server Action.

## Puntos de control del controlador (navegador: claro, oscuro y 390 px)

Después de las Tareas 7 (la lista, registrar y la página del hallazgo, contra las maquetas 1 a 3), 10 (aceptar, rechazar,
corregir y el camino corto), 13 (formular, firmar y aprobar, contra las maquetas 4 y 5), 17 (la actividad, verificar,
evaluar y cerrar, contra las maquetas 6 y 7) y 21 (impresos y Excel); y la demostración de §24.1 del spec en la Tarea 22.

## Review Focus

1. **El rol Consulta no ve hallazgos ajenos.** `alcanceProcesos` le devuelve `{ todos: true }`: un filtro que se apoye
   en él le mostraría todo. Pruebas en la Tarea 6 (lista, detalle, conteos) y en la 9 (archivos).
2. **Un responsable desactivado a mitad del plan.** Su actividad no queda huérfana ni invisible: la ven los líderes del
   proceso con la marca «Responsable inactivo», la pasada les avisa a ellos y se puede reasignar. Pruebas en las Tareas
   14 y 19.
3. **Un proceso que queda sin líder con el hallazgo en curso.** El turno se calcula al leer, no se congela: lo que era
   del líder pasa al Admin SGC. Pruebas en las Tareas 6 y 19.
4. **Dos personas actúan a la vez sobre el mismo paso** (dos que verifican, dos que deciden un ajuste, dos envíos del
   plan): la segunda recibe «El hallazgo ya cambió: vuelva a cargar la página» y no queda una firma ni un evento de más.
   Pruebas en las Tareas 5, 13, 15 y 16.
5. **Una subida a una actividad terminada, o a un hallazgo terminado:** se rechaza con 409 y no queda el archivo en el
   almacén. Prueba en la Tarea 9.
6. **Una reclasificación mientras el líder tiene abierto el formulario de formular:** guardar el borrador responde con
   la frase del punto 4 y no escribe sobre un estado que ya no es «Por formular». Prueba en la Tarea 12.
7. **El hallazgo 1.000 del año y el cambio de año:** el código pasa a cuatro cifras sin romperse y el consecutivo
   reinicia en el año nuevo de la zona de la instalación. Prueba en la Tarea 5.
8. **Un día marcado hábil o no hábil después** no mueve un vencimiento ya guardado, y sí el siguiente que se calcule.
   Prueba en la Tarea 4.

---

### Task 1: Base de trabajo y días hábiles

**Files:**
- Create: `src/lib/dias-habiles.ts`, `tests/dias-habiles.test.ts`
- Modify: `.gitignore` (`almacen-f15a/`), `CONTEXT.md` (Paso 0)

**Interfaces:**
- Produces (módulo puro, sin imports de `@/db`):
  - `export type AjustesDeCalendario = { noHabiles: ReadonlySet<string>; habiles: ReadonlySet<string> }` (fechas `AAAA-MM-DD`) y `export const SIN_AJUSTES: AjustesDeCalendario`.
  - `export function festivosDeColombia(anio: number): string[]` (ordenados, sin repetidos).
  - `export function esHabil(dia: string, ajustes: AjustesDeCalendario): boolean`.
  - `export function sumarDiasHabiles(desde: Date, n: number, ajustes: AjustesDeCalendario, zona: string): Date` (el fin, en la zona, del n-ésimo día hábil posterior al día de `desde`).
  - `export function restarDiasHabiles(dia: string, n: number, ajustes: AjustesDeCalendario): string`.
  - `export function diasHabilesEntre(desde: Date, hasta: Date, ajustes: AjustesDeCalendario, zona: string): number` (los hábiles posteriores al día de `desde` hasta el día de `hasta`, incluido; negativo si `hasta` es anterior).

- [ ] **Step 0: Base de trabajo aparte (lo hace el controlador).** Este plan y la enmienda del spec ya están confirmados en `main`: el worktree sale de ese commit y los trae. `git worktree add F:/sgc-integral-f15a -b fase-15a-mejoramiento main`; en el worktree, `npm ci`; copie `.env.example` a `.env.f15a`, cambie el nombre de la base por `sgc_f15a` en `DATABASE_URL` y `DATABASE_URL_MIGRADOR` y añada `ALMACEN_RUTA=./almacen-f15a`. **No cambie `BD_APP_CLAVE`** (el rol `sgc_app` es de todo el servidor de base de datos). Copie a `<espacio>` las maquetas (`F:\sgc-integral\.superpowers\brainstorm\1893-1794928689\content\pantallas-15-v2.html`). Añada `almacen-f15a/` a `.gitignore`. Cree `<espacio>/con-f15a.sh`:

```bash
#!/usr/bin/env bash
# Corre una orden en el worktree de la 15A con el entorno de su base aparte. Nunca toca la base `sgc`.
set -euo pipefail
cd /f/sgc-integral-f15a
set -a; . ./.env.f15a; set +a
case "$DATABASE_URL $DATABASE_URL_MIGRADOR" in *"/sgc_f15a "*"/sgc_f15a") ;; *) echo "El entorno no apunta a sgc_f15a" >&2; exit 1 ;; esac
exec "$@"
```

```bash
docker exec sgc-integral-bd-1 psql -U sgc -d postgres -c 'CREATE DATABASE sgc_f15a OWNER sgc'
bash <espacio>/con-f15a.sh npm run db:preparar && bash <espacio>/con-f15a.sh npm run db:seed && bash <espacio>/con-f15a.sh npm run admin:asegurar
bash <espacio>/con-f15a.sh env SEMILLA_RECIEN=1 npm test
```

  Expected: «Migraciones al día» con dieciocho migraciones; la suite en verde. Anote la línea base (archivos y pruebas) en `<espacio>/progress.md`. Corrija en `CONTEXT.md` el punto de reanudación: la 15A está en curso en este worktree, contra `sgc_f15a`. Confirme: `docs(f15a): la 15A empieza en su worktree`.

- [ ] **Step 1: Write the failing test** `tests/dias-habiles.test.ts` (sin base). Las tres listas son el calendario publicado (spec, Apéndice C; fuente `festivos.com.co`): cópielas tal cual, no las recalcule.

```ts
const F2025 = ["2025-01-01","2025-01-06","2025-03-24","2025-04-17","2025-04-18","2025-05-01","2025-06-02","2025-06-23","2025-06-30","2025-07-20","2025-08-07","2025-08-18","2025-10-13","2025-11-03","2025-11-17","2025-12-08","2025-12-25"];
const F2026 = ["2026-01-01","2026-01-12","2026-03-23","2026-04-02","2026-04-03","2026-05-01","2026-05-18","2026-06-08","2026-06-15","2026-06-29","2026-07-13","2026-07-20","2026-08-07","2026-08-17","2026-10-12","2026-11-02","2026-11-16","2026-12-08","2026-12-25"];
const F2027 = ["2027-01-01","2027-01-11","2027-03-22","2027-03-25","2027-03-26","2027-05-01","2027-05-10","2027-05-31","2027-06-07","2027-07-05","2027-07-12","2027-07-20","2027-08-07","2027-08-16","2027-10-18","2027-11-01","2027-11-15","2027-12-08","2027-12-25"];
expect(festivosDeColombia(2025)).toEqual(F2025);   // 17 fechas: dos festivos caen el 30 de junio
expect(festivosDeColombia(2026)).toEqual(F2026);   // 19: lleva el 13 de julio (Ley 2578 de 2026)
expect(festivosDeColombia(2027)).toEqual(F2027);
expect(festivosDeColombia(2025)).not.toContain("2025-07-14"); // antes de 2026 no existe el festivo del 9 de julio
```

  Más casos, con `zona = "America/Bogota"` y `dia = (t) => new Date(`${t}T15:00:00Z`)`:
  - `esHabil`: sábado y domingo, falso; `"2026-11-16"` (festivo), falso; `"2026-11-17"`, verdadero; con `noHabiles = {"2026-11-17"}`, falso; con `habiles = {"2026-11-16"}`, verdadero; un sábado marcado «hábil» sigue siendo falso (la lista solo anula festivos).
  - `sumarDiasHabiles(dia("2026-11-04"), 10, SIN_AJUSTES, zona)` cae el `2026-11-19` (salta el festivo del 16) y es el fin de ese día en la zona (`fechaEnZona` del resultado y un milisegundo después ya es el 20).
  - El hecho del viernes `2026-11-06` y el del sábado `2026-11-07`, con 3 días, vencen los dos el miércoles `2026-11-11`.
  - Semana Santa: `sumarDiasHabiles(dia("2026-03-27"), 10, …)` cae el `2026-04-14`. Fin de año: desde `2026-12-23`, 5 días, cae el `2026-12-31`.
  - `restarDiasHabiles("2026-11-19", 10, SIN_AJUSTES)` da `"2026-11-04"`. `diasHabilesEntre(dia("2026-11-04"), dia("2026-11-19"), …)` da 10; con las fechas al revés, −10; el mismo día, 0.
  - Un hecho a las 23:30 de Bogotá (04:30Z del día siguiente) cuenta por su día en la zona.

- [ ] **Step 2: Run** `npx vitest run tests/dias-habiles.test.ts`. Expected: FAIL (el módulo no existe).

- [ ] **Step 3: Implemente `src/lib/dias-habiles.ts`.** La regla de los festivos es la del Apéndice C del spec: fijos; trasladados al lunes siguiente; los de la Pascua (Jueves y Viernes Santo sin traslado; Ascensión, Corpus Christi y Sagrado Corazón a 43, 64 y 71 días del domingo de Pascua); y, **solo si `anio >= 2026`**, el 9 de julio trasladado al lunes. El domingo de Pascua, por el cálculo gregoriano anónimo (Meeus). Use `fechaEnZona` y `finDeFecha` de `src/lib/tramites/plazos.ts` para pasar de instante a día y de día a fin del día; el día de la semana, con aritmética sobre la fecha en UTC, no con la zona de la máquina.

- [ ] **Step 4: Run** `npx vitest run tests/dias-habiles.test.ts && npm run lint`. Expected: PASS, sin avisos.

- [ ] **Step 5: Commit** `feat(f15a): días hábiles con los festivos de Colombia`.

---

### Task 2: La migración `0018`: esquema, triggers, privilegios y borrados que ya existen

**Files:**
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts` (el `REVOKE` literal, ~`:46`), `src/lib/tramites/tipos.ts` (`FIRMAS`, `ETIQUETA_FIRMA`), `src/db/consultas/firmas.ts` (`registrarFirma`), `src/lib/subida.ts` (`CONTEXTOS_EVIDENCIA`, `CONTEXTOS_CON_EXCEL`), `src/lib/recepcion-archivo.ts` (`DestinoEvidencia`), `src/db/semillas/minima.ts` (`limpiarTodo`), `src/db/consultas/indicadores/mediciones.ts` (`conDatos`, ~`:354`), `src/db/consultas/indicadores/importacion.ts` (`IMPIDE`, `revisarDeshacer`), `src/db/consultas/indicadores/operacion.ts` (`borrarIndicador`, ~`:638`), `src/db/consultas/normograma/lectura.ts` (`historiaDeNorma`, ~`:79`)
- Create: `drizzle/0018_fase15a-mejoramiento.sql` (y su snapshot), `tests/mejora-esquema.test.ts`
- Test: `tests/privilegios-bd.test.ts`, `tests/mejora-esquema.test.ts`

**Interfaces:**
- Produces: las tablas y columnas de abajo; `Firma` admite `"verifico" | "cerro"`; `registrarFirma(tx, f)` acepta `f.mejoraHallazgoId?: number | null` y lo escribe en `firmas.mejora_hallazgo_id`; `DestinoEvidencia` gana `rol?: string` (por omisión `"evidencia"`), que `recibirArchivo` pasa a `registrarArchivo`.

**Tablas** (helpers `id()`, `ref()`, `refUsuario()`, `marca()`, `creado()` de `esquema.ts`; toda llave foránea `RESTRICT`; restricciones nombradas `<tabla>_<campo>_valido` o `_coherente`). **Toda tabla hija lleva `hallazgo_id`**, aunque también tenga otra llave: el trigger del hallazgo terminado la usa.

- `dias_no_habiles`: `fecha date` única, `tipo` (`no_habil` | `habil`), `motivo`, `creado_por`, `creado_en`.
- `mejora_consecutivos`: `anio integer` llave primaria, `ultimo integer`.
- `mejora_hallazgos`: `codigo` único; `anio`, `consecutivo` (únicos juntos); `clase`; `origen`; `fuente`; `referencia_caso`; `detectado_en date`; `proceso_id` (obligatorio), `subproceso_id`; `criticidad` (con `CHECK`: no nula si y solo si `clase = 'no_conformidad'`); `titulo`; `descripcion`; `requisito_clausula`, `requisito_norma_id` → `normas`, `requisito_documento_id` → `documentos`; `documento_id`, `indicador_id`, `medicion_id` (los tres, opcionales); `riesgo`; `estado`; `ronda integer` (1); `registrado_por`, `registrado_en`; `reincidente_de`, `derivado_de` → `mejora_hallazgos`; `cargado boolean` (falso); corrección: `correccion_requerida boolean` (nulo = sin registrar), `correccion_descripcion`, `correccion_responsable_id`, `correccion_responsable_nombre`, `correccion_implementada_en date`, `correccion_registrada_por`, `correccion_registrada_en`; decisión: `accion_requerida boolean` (nulo = sin decidir), `accion_justificacion`, `accion_decidida_por`, `accion_decidida_en`, `validada_por`, `validada_en`; ente: `fecha_limite_ente date`, `respuesta_ente_en date`, `respuesta_ente_por`; paso: `vence_en`, `aviso_vencido_en`, `escalado_en`, `aviso_evaluar_en`; cierre: `cerrado_en`, `cerrado_por`, `resultado_cierre`, `lecciones`, `cambios_atendidos`, `anulado_motivo`. Índices: `(proceso_id, estado)`, `(estado, vence_en)`.
- `mejora_rondas`: `hallazgo_id`, `numero` (únicos juntos); `formular_antes_de`; `enviado_en` (la primera vez); `estado_plan`; `elaborado_por`; `revisado_por`, `revisado_en`; `aprobado_por`, `aprobado_en`, `aprobado_rol` (`admin_sgc` | `gerencia`), `aprobado_fuera` (texto: quién lo aprobó en papel); `requiere_recursos boolean` (falso), `nota_recursos`; `similares boolean`, `similares_detalle`; `cambios jsonb`; `criterios jsonb` (`'[]'`), `criterio_otro`, `indicador_eficacia_id` → `indicadores`, `fecha_evaluacion date`; `cierre_previsto`; `verificada_por`, `verificada_en`, `verificacion_metodos jsonb`, `verificacion_nota`; `evaluada_por`, `evaluada_en`, `resultado` (`eficaz` | `no_eficaz`), `evaluacion_desde date`, `evaluacion_hasta date`, `evaluacion_criterios jsonb`, `evaluacion_justificacion`.
- `mejora_analisis`: `hallazgo_id`, `ronda_id`, `orden`, `metodo`, `equipo`, `observaciones`, `contenido jsonb`.
- `mejora_causas`: `hallazgo_id`, `ronda_id`, `orden`, `texto`, `sin_accion_porque`.
- `mejora_acciones`: `hallazgo_id`, `ronda_id`, `orden`, `tipo`, `descripcion`, `recursos`, `indicador_cumplimiento`, `meta`.
- `mejora_accion_causas`: `hallazgo_id`, `accion_id`, `causa_id` (llave primaria: las dos últimas).
- `mejora_actividades`: `hallazgo_id`, `accion_id`, `orden`, `descripcion`, `responsable_id`, `inicio date`, `fin_original date` (nula hasta aprobar), `fin date`, `avance integer` (0 a 100), `estado`, `terminada_en`, `terminada_por`, `verificacion` (`conforme` | `devuelta`), `verificacion_nota`, `corregir_antes_de date`, `cancelada_en`, `reprogramaciones integer` (0), `gerencia_en` (cuándo se escaló a Gerencia), `aviso_vencido_en`, `escalado_en`, `recordatorio_en`. Índice: `(responsable_id, estado)`.
- `mejora_seguimientos` (solo inserción): `hallazgo_id`, `actividad_id`, `fecha date`, `realizado`, `avance`, `barreras`, `registrado_por`, `creado_en`.
- `mejora_ajustes`: `hallazgo_id`, `ronda_id`, `tipo`, `actividad_id` (opcional), `datos jsonb`, `causa`, `pedido_por`, `pedido_en`, `estado`, `decidido_por`, `decidido_en`, `nota`, `acta_numero`, `acta_fecha date`, `vence_en`, `aviso_vencido_en`. Índice único parcial: un `pendiente` por `actividad_id`.
- `mejora_ocurrencias` (solo inserción): `hallazgo_id`, `fecha date`, `descripcion`, `origen` (`registro` | `reporte` | `medicion`), `reporte_id` (opcional), `registrado_por`, `creado_en`.
- `mejora_eventos` (solo inserción): `hallazgo_id`, `ronda integer`, `tipo`, `detalle jsonb` (`'{}'`), `usuario_id` (opcional), `fuera boolean` (falso), `ocurrio_en`, `creado_en`.
- `mejora_reportes`: `reportado_por`, `reportado_en`, `descripcion`, `visto_en date`, `proceso_id` (opcional), `referencia_caso`, `estado`, `hallazgo_id` (opcional), `motivo_descarte`, `clasificado_por`, `clasificado_en`, `vence_en`, `aviso_vencido_en`, `escalado_en`.
- `mejora_reporte_eventos` (solo inserción): `reporte_id`, `tipo`, `detalle jsonb`, `usuario_id`, `creado_en`.
- `firmas`: columna `mejora_hallazgo_id` → `mejora_hallazgos` (nula) con su índice; `firmas_firma_valida` admite `verifico` y `cerro`; `firmas_tramite_coherente` admite `OR mejora_hallazgo_id IS NOT NULL`.
- `archivos`: `archivos_contexto_valido` admite los cuatro contextos; `archivos_rol_valido`, los cuatro roles.

- [ ] **Step 1: Write the failing test** `tests/mejora-esquema.test.ts` (con base, todo dentro de `revertida`; filas mínimas por SQL directo, con `sesionAdmin(tx)` como usuario):
  - `las tablas de solo inserción rechazan UPDATE y DELETE también al dueño`: sobre una fila de `mejora_eventos`, `mejora_seguimientos`, `mejora_ocurrencias` y `mejora_reporte_eventos`, con la conexión del migrador, espera el código `42501`.
  - `un hallazgo terminado no cambia`: con un hallazgo en `cerrado` (y otro en `rechazado`, y otro en `anulado`), `UPDATE mejora_hallazgos`, `INSERT`/`UPDATE`/`DELETE` en `mejora_rondas`, `mejora_acciones`, `mejora_actividades`, `mejora_ajustes` e `INSERT` en `mejora_eventos` y `mejora_seguimientos` dan `42501`.
  - `un hallazgo en curso sí cambia`: los mismos escritos sobre uno `en_ejecucion` pasan.
  - `la criticidad es de la no conformidad`: insertar una `observacion` con criticidad, o una `no_conformidad` sin ella, da `23514`.
  - `un solo ajuste pendiente por actividad`: el segundo `pendiente` da `23505`.
  - `una firma con hallazgo no necesita trámite`: `registrarFirma(tx, { tramiteId: null, versionId: null, mejoraHallazgoId, firma: "verifico", ronda: 1, … })` inserta; sin ninguno de los tres dueños, `23514`.
  - `los borrados que ya existen conocen a los hallazgos` (cuatro casos): una norma citada en `requisito_norma_id` hace verdadero `historiaDeNorma`; una medición citada en `medicion_id` cuenta para `conDatos`; `condicionDeDeshacer` de un lote con una ficha citada (por `indicador_id`, o como `indicador_eficacia_id` de una ronda) trae el impedimento `IMPIDE.mejoramiento`; `borrarIndicador` de un borrador citado responde con `ErrorIndicador`, no con `23503`.

  En `tests/privilegios-bd.test.ts`: un `it` por cada una de las cuatro tablas de solo inserción, con la forma de los que ya hay (L55-77).

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-esquema.test.ts`. Expected: FAIL (las tablas no existen).

- [ ] **Step 3: Declare las tablas en `src/db/esquema.ts`** (bloque nuevo al final, con el comentario de fase; las de solo inserción, con el comentario `// Solo-inserción (trigger en la migración 0018 y REVOKE en roles-bd.ts)`), cambie los dos `CHECK` de `firmas` y los dos de `archivos`, y genere: `bash <espacio>/con-f15a.sh npm run db:generate -- --name fase15a-mejoramiento`.

- [ ] **Step 4: Complete la migración a mano,** después de lo generado (cada sentencia termina en `;--> statement-breakpoint`):
  - `CREATE TRIGGER <tabla>_inmutable BEFORE UPDATE OR DELETE … EXECUTE FUNCTION sgc_impedir_modificacion();` para las cuatro tablas de solo inserción.
  - La función `sgc_impedir_si_hallazgo_terminado()`, copiada de `sgc_impedir_si_revision_cerrada` (`drizzle/0009_*.sql:17-49`), con `mejora_hallazgos` como padre, `hallazgo_id` como columna y `estado IN ('cerrado','rechazado','anulado')` como condición, con su `FOR SHARE`. Trigger `BEFORE UPDATE OR DELETE` en `mejora_hallazgos`; `BEFORE INSERT OR UPDATE OR DELETE` en `mejora_rondas`, `mejora_analisis`, `mejora_causas`, `mejora_acciones`, `mejora_accion_causas`, `mejora_actividades` y `mejora_ajustes`; `BEFORE INSERT` en `mejora_eventos`, `mejora_seguimientos` y `mejora_ocurrencias`.
  - `INSERT INTO configuracion (clave, valor) VALUES … ON CONFLICT (clave) DO NOTHING` con las quince claves `mej_*` y sus valores por omisión (molde: `drizzle/0011_*.sql:493`).

- [ ] **Step 5: Lo que rodea al esquema.** `roles-bd.ts`: las cuatro tablas de solo inserción, en el `REVOKE UPDATE, DELETE`. `tipos.ts`: `verifico` («Verificó») y `cerro` («Cerró») en `FIRMAS` y `ETIQUETA_FIRMA`. `firmas.ts`: el campo nuevo. `subida.ts`: los cuatro contextos en `CONTEXTOS_EVIDENCIA`, y los cuatro en `CONTEXTOS_CON_EXCEL` (una evidencia de mejoramiento puede ser un `.xlsx`). `recepcion-archivo.ts`: `rol`. `minima.ts`: las tablas nuevas en el `TRUNCATE` de `limpiarTodo`. Los cuatro borrados: `historiaDeNorma` gana su `OR EXISTS` sobre `mejora_hallazgos.requisito_norma_id`; `conDatos`, un `EXISTS` sobre `mejora_hallazgos.medicion_id`; `IMPIDE.mejoramiento = "la cita un hallazgo de mejoramiento"` con su `EXISTS` (por `indicador_id`, por la medición o por `mejora_rondas.indicador_eficacia_id`) y su `push` en `revisarDeshacer`; `borrarIndicador`, el mismo `EXISTS` junto al que ya tiene, con el mensaje «El indicador está citado en un hallazgo de mejoramiento».

- [ ] **Step 6: Run** `bash <espacio>/con-f15a.sh npm run db:preparar` (Expected: «Migraciones al día», diecinueve) y `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-esquema.test.ts tests/privilegios-bd.test.ts tests/semilla-minima.test.ts tests/indicadores-importacion.test.ts`; `npm run lint`. Expected: PASS. Compruebe con `git diff drizzle/0017*` que la `0017` no cambió.

- [ ] **Step 7: Commit** `feat(f15a): migración 0018, las tablas de mejoramiento y sus triggers`.

---

### Task 3: Reglas puras: permisos, orígenes, estados, transiciones y consecuencias

**Files:**
- Create: `src/lib/mejoramiento/tipos.ts`, `origenes.ts`, `reglas.ts`, `estados.ts`, `transiciones.ts`, `textos.ts`; `tests/mejora-reglas.test.ts`
- Modify: `src/lib/permisos.ts` (`Permiso`, `MATRIZ`), `tests/permisos.test.ts` (`ESPERADA`)

**Interfaces:**
- Produces:
  - `tipos.ts`: `ErrorMejora`; las listas `as const` de «Nombres fijos» con sus tipos (`Clase`, `Criticidad`, `Origen`, `EstadoHallazgo`, `ResultadoCierre`, `TipoAccion`, `MetodoAnalisis`, `EstadoActividad`, `AccionHallazgo`); `TERMINALES`; `HallazgoBase = { id: number; codigo: string; clase: Clase; criticidad: Criticidad | null; origen: Origen; estado: EstadoHallazgo; ronda: number; procesoId: number; reincidenteDe: number | null; correccionRequerida: boolean | null; accionRequerida: boolean | null; resultadoCierre: ResultadoCierre | null; registradoPor: number }`.
  - `origenes.ts`: `ORIGENES: ReadonlyArray<{ clave: Origen; etiqueta: string; externo: boolean }>` (los catorce, en el orden del spec §7.2), `esExterno(o: Origen): boolean`, `pideReferenciaDelCaso(o: Origen): boolean` (`pqrsf` y `evento_adverso`), `fuenteObligatoria(o: Origen, conMedicion: boolean): boolean`.
  - `reglas.ts`: `accionObligada(h: Pick<HallazgoBase, "clase" | "criticidad" | "origen" | "reincidenteDe">): boolean` (no conformidad reincidente, de criticidad alta o externa); `llevaPlanSiempre(h): boolean` (externo, u observación u oportunidad); `aceptadoVaA(clase: Clase): "por_corregir" | "por_formular"`; `apruebaGerencia(h: Pick<HallazgoBase, "clase" | "criticidad" | "origen">, x: { requiereRecursos: boolean; elaboroAdmin: boolean }): boolean`; `tipoPropuesto(clase: Clase): TipoAccion`.
  - `transiciones.ts`: `DESDE: Record<AccionHallazgo, readonly EstadoHallazgo[] | "nuevo" | "no_terminal">`; `type Rumbo = { nacioAceptado?: boolean; apruebaGerencia?: boolean; saltaRevision?: boolean; devolvioAlguna?: boolean; verificaAdmin?: boolean; quedaEn?: EstadoHallazgo }`; `destinoDe(accion: AccionHallazgo, h: Pick<HallazgoBase, "clase" | "criticidad" | "origen" | "reincidenteDe" | "estado" | "correccionRequerida">, rumbo: Rumbo): EstadoHallazgo`, que lanza `ErrorMejora(YA_CAMBIO)` si `h.estado` no está en `DESDE[accion]`; `YA_CAMBIO = "El hallazgo ya cambió: vuelva a cargar la página"`.
  - `estados.ts`: `etiquetaDeEstado(h: Pick<HallazgoBase, "estado" | "resultadoCierre" | "correccionRequerida">, x?: { yaSePuedeEvaluar?: boolean }): string`; `turnoDe(estado: EstadoHallazgo): "lideres" | "registrador" | "arbitro" | "admin" | "gerencia" | "responsables" | "verificadores" | "validadores" | null`; `pasosDelRecorrido(h: HallazgoBase): Array<{ clave: string; etiqueta: string; estado: "hecho" | "actual" | "falta" }>`.
  - `textos.ts`: `AVISO_SIN_PACIENTES` (el texto de Global Constraints), `ETIQUETA_CLASE`, `ETIQUETA_CRITICIDAD`, `ETIQUETA_TIPO_ACCION`.
  - `permisos.ts`: los ocho permisos del spec §6.2, con esa matriz.

- [ ] **Step 1: Write the failing tests** `tests/mejora-reglas.test.ts` (sin base):
  - `los catorce orígenes, en orden, y solo dos externos`: claves iguales a la fila `origen` de «Nombres fijos»; `esExterno` verdadero solo en `auditoria_externa` y `ente_control`.
  - `accionObligada`: verdadero para no conformidad con criticidad alta, con `reincidenteDe`, o externa; falso para una media interna sin reincidencia; falso para una observación.
  - `apruebaGerencia`: una prueba por cada una de las cuatro condiciones del spec §8.6 y otra con ninguna.
  - `destinoDe`, una prueba por fila de la tabla del spec §8.2, entre ellas: `aceptar` una no conformidad → `por_corregir`, una oportunidad → `por_formular`; `corregir` con acción obligada → `por_formular`, sin ella → `por_decidir`; `decidir_si` desde `por_decidir` y desde `por_validar` → `por_formular`; `enviar_plan` → `en_revision`, y con `saltaRevision` → `en_aprobacion`; `revisar_plan` con `apruebaGerencia` → `en_aprobacion`, sin ella → `en_ejecucion`; `verificar_implementacion` con `devolvioAlguna` → `en_ejecucion`, sin ella → `en_espera`; `evaluar_eficaz` con `verificaAdmin` → `cerrado`, sin él → `por_cerrar`; `evaluar_no_eficaz` → `por_formular`; `validar_correccion` → `cerrado`; `registrar` con `nacioAceptado` → el de `aceptadoVaA`, sin él → `por_aceptar`; `cargar`, `reclasificar` y `ajustar` → `rumbo.quedaEn`.
  - `ningún salto fuera de la tabla`: para cada acción y cada estado que no está en su `DESDE`, `destinoDe` lanza `YA_CAMBIO`; desde un terminal, toda acción lanza.
  - `etiquetaDeEstado`: `cerrado` + `eficaz` → «Cerrado · eficaz»; `con_correccion` → «Cerrado con corrección»; `sin_accion` → «Cerrado sin acción»; `por_validar` con `correccionRequerida: false` → «Por validar el cierre sin acción», con `true` → «Por validar la corrección»; `en_espera` → «En espera de eficacia», y con `yaSePuedeEvaluar` → «Por evaluar la eficacia»; los demás, los del spec §8.1.
  - `pasosDelRecorrido`: una oportunidad de mejora no tiene los pasos «Corrección» ni «Decisión»; una no conformidad por el camino corto termina en «Cierre» sin «Causa raíz».

  En `tests/permisos.test.ts`, las ocho filas en `ESPERADA`, con la matriz del spec §6.2.

- [ ] **Step 2: Run** `npx vitest run tests/mejora-reglas.test.ts tests/permisos.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente los seis archivos y la matriz.** `DESDE` es la columna «Desde» de la tabla del spec §8.2; `registrar` y `cargar` son `"nuevo"`, `anular` es `"no_terminal"`, `reclasificar` es `por_aceptar`, `rechazo`, `arbitraje`, `por_corregir`, `por_decidir`, `por_validar` y `por_formular`, y `ajustar`, `en_ejecucion` y `por_verificar`.

- [ ] **Step 4: Run** los dos archivos y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15a): reglas puras del hallazgo y permisos de mejoramiento`.

---

### Task 4: Configuración del módulo y calendario

**Files:**
- Create: `src/db/consultas/mejoramiento/config.ts`, `src/lib/mejoramiento/plazos.ts`, `src/app/admin/acciones-mejoramiento.ts`, `src/app/(app)/admin/(panel)/mejoramiento/page.tsx`, `src/componentes/mejoramiento/admin/FormularioPlazos.tsx`, `CalendarioDeLaEntidad.tsx`, `FormatosDeImpresos.tsx`; `tests/mejora-config.test.ts`
- Modify: `src/lib/esquemas/mejoramiento.ts` (nuevo), `src/componentes/cascaron/navegacion.ts` e `IconoNav.tsx` (entrada «Mejoramiento» del grupo `administracion`, permiso `mejora.gestionar`), `tests/navegacion.test.ts`, `src/db/semillas/minima.ts` (`sembrarBase`), `tests/semilla-minima.test.ts`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `AjustesDeCalendario`, `sumarDiasHabiles`, `restarDiasHabiles` (Tarea 1); las claves `mej_*` (Tarea 2).
- Produces:
  - `config.ts`: `type ConfigMejora = { plazos: { clasificar: number; aceptar: number; decision: number; correccion: number; formular: number; reenviar: number; revisar: number; aprobar: number; verificar: number; evaluar: number }; recordatorioAltaDias: number; recordatorioDias: number; formatos: { registro: number | null; porques: number | null; ishikawa: number | null } }`; `CONFIG_MEJORA_DEFECTO`; `obtenerConfigMejora(opciones?: { sql?: Cliente }): Promise<ConfigMejora>` (un valor ausente, no entero o fuera de rango cae al de omisión); `guardarConfigMejora(sesion: SesionFlujo, datos: ConfigMejora, opciones?: OpcionesFlujo): Promise<void>` (bitácora `mejora_config_guardada`, con el antes y el después de cada clave que cambió); `calendarioDeMejora(sql: Cliente): Promise<AjustesDeCalendario>`; `agregarDiaDeCalendario(sesion, d: { fecha: string; tipo: "no_habil" | "habil"; motivo: string }, opciones?)`, `quitarDiaDeCalendario(sesion, id: number, opciones?)` (bitácora `mejora_dia_agregado`, `mejora_dia_quitado`); `type ContextoMejora = { ahora: Date; zona: string; config: ConfigMejora; calendario: AjustesDeCalendario }` y `contextoDeMejora(sql: Cliente, ahora: Date): Promise<ContextoMejora>`.
  - `plazos.ts` (puro): `type Paso = keyof ConfigMejora["plazos"]`; `venceEn(paso: Paso, desde: Date, c: Pick<ContextoMejora, "config" | "calendario" | "zona">): Date`; `formularAntesDe(x: { registradoEn: Date; fechaLimiteEnte: string | null }, c): Date` (sin fecha del ente: `venceEn("formular", …)`; con ella: el fin del día que resulta de restarle `revisar + aprobar` días hábiles, y nunca antes del día del registro); `quedanDiasHabiles(vence: Date, c: Pick<ContextoMejora, "ahora" | "calendario" | "zona">): number`.

- [ ] **Step 1: Write the failing tests** `tests/mejora-config.test.ts` (con base, dentro de `revertida`):
  - `sin filas vale lo de omisión`; `un valor fuera de rango cae al de omisión` (escriba `mej_plazo_formular_dias = '0'` por SQL y lea 10).
  - `guardar exige mejora.gestionar` (un líder recibe `ErrorPermiso`) y `deja el antes y el después en la bitácora`.
  - `un formato debe ser un documento con versión vigente`: guardar el id de un documento sin vigente lanza «El documento elegido no tiene una versión vigente».
  - `el calendario sale de la tabla`: tras `agregarDiaDeCalendario` de un `no_habil` y de un `habil`, `calendarioDeMejora` los trae en su conjunto; marcar «hábil» un día que no es festivo calculado lanza «Ese día no es un festivo: no hay nada que anular»; una fecha repetida, «Ese día ya está en la lista».
  - `un día añadido después no mueve lo ya calculado` (Review Focus 8): `venceEn("formular", dia("2026-11-04"), c)` cae el 19; se añade el `2026-11-18` como no hábil; el valor ya calculado sigue siendo el 19 y un cálculo nuevo cae el 20.
  - `formularAntesDe` con fecha del ente `2026-11-30` y plazos 3 y 3 da el fin del `2026-11-20`; con una fecha del ente anterior al registro, el fin del día del registro.
  - `quedanDiasHabiles`: 5 cuando faltan cinco hábiles; negativo cuando ya venció.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-config.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente `config.ts` y `plazos.ts`.** Molde: `CAMPOS_PARAMETROS`, `obtenerParametros` y `guardarParametros` de `src/db/consultas/indicadores/maestros.ts:253-318` (un arreglo `CAMPOS_MEJORA` de `{ campo, clave, minimo, maximo }`, upsert dentro de `enTransaccion`). Los ids de documento se guardan como texto (`""` = nulo). Registre las quince claves en `sembrarBase` y en `tests/semilla-minima.test.ts`.

- [ ] **Step 4: La pantalla** `/admin/mejoramiento` (`exigirPermiso("mejora.gestionar")`), en tres bloques: los plazos (con la ayuda «En días hábiles») y los dos recordatorios («En días calendario»); el calendario de la entidad (la lista de días con su tipo y su motivo, el formulario para añadir uno y, en solo lectura, los festivos calculados del año en curso y del siguiente); y los tres formatos (un selector de documento vigente por impreso). Acciones `guardarConfigMejoraAccion`, `agregarDiaAccion`, `quitarDiaAccion`, las tres con `mutacion(formData, "mejora.gestionar", …)`. Entrada de navegación en el grupo de administración; ajuste `tests/navegacion.test.ts` (el largo de la lista del Admin SGC sube en uno).

- [ ] **Step 5: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-config.test.ts tests/semilla-minima.test.ts tests/navegacion.test.ts tests/acciones-permisos.test.ts tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): configuración de mejoramiento: plazos, calendario y formatos`.

---

### Task 5: El motor: `transicionarHallazgo`, el registro y el código

**Files:**
- Create: `src/db/consultas/mejoramiento/flujo.ts`, `registro.ts`, `avisos.ts`; `tests/utiles/mejoramiento.ts`; `tests/mejora-registro.test.ts`
- Modify: `src/lib/esquemas/mejoramiento.ts`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `destinoDe`, `Rumbo`, `YA_CAMBIO`, `accionObligada`, `aceptadoVaA`, `turnoDe` (Tarea 3); `ContextoMejora`, `contextoDeMejora`, `venceEn`, `formularAntesDe` (Tarea 4); `lideresDeProceso`, `adminsActivos` (`src/db/consultas/tramites.ts:318,346`).
- Produces:
  - `flujo.ts`: `bloquearHallazgo(tx: TransactionSql, id: number): Promise<HallazgoBase>` (`FOR UPDATE`; lanza `ErrorMejora("El hallazgo no existe")`); `type Paso_x = { rumbo?: Rumbo; detalle?: Record<string, unknown>; fuera?: boolean; ocurrioEn?: Date; acta?: { numero: string; fecha: string } | null }`; `nacerHallazgo(tx: TransactionSql, sesion: SesionFlujo, fila: FilaNueva, accion: "registrar" | "cargar", x: Paso_x, c: ContextoMejora): Promise<HallazgoBase>` (**la única función que inserta en `mejora_hallazgos`**; `FilaNueva` son las columnas de la identificación más `codigo`, `anio` y `consecutivo`); `transicionarHallazgo(tx: TransactionSql, sesion: SesionFlujo | null, h: HallazgoBase, accion: Exclude<AccionHallazgo, "registrar" | "cargar">, x: Paso_x, c: ContextoMejora): Promise<{ antes: EstadoHallazgo; despues: EstadoHallazgo; ronda: number }>` (**la única que cambia `estado` y `ronda`**); `dejarEvento(tx, e: { hallazgoId: number; ronda: number; tipo: string; detalle?: Record<string, unknown>; usuarioId: number | null; fuera?: boolean; ocurrioEn: Date }): Promise<void>`; `legible<T>(p: Promise<T>): Promise<T>` (traduce `23503`, `23505`, `42501` y `40P01` a `ErrorMejora`).
  - `avisos.ts`: `actuaPorElProceso(tx: Cliente, sesion: SesionFlujo, procesoId: number): Promise<boolean>` (es un líder activo de ese proceso, o es Admin SGC y el proceso no tiene ningún líder activo: la condición de persona de todo lo que «le toca al líder»); `quienTieneElTurno(tx: TransactionSql, h: HallazgoBase): Promise<number[]>` (resuelve `turnoDe` a usuarios activos: líderes del proceso o, si no hay, los Admin SGC; etc.) y `avisarDeMejora(tx, aviso: { tipo: string; titulo: string; hallazgoId: number }, destinatarios: Array<{ usuarioId: number; cuerpo: string }>): Promise<void>` (envuelve `avisarA` con `entidad: "mejora_hallazgo"` y el enlace `/mejoramiento/<id>`).
  - `registro.ts`: `type DatosDeHallazgo` (los campos del spec §7.1, más `reincidenteDe?: number | null` y `reporteId?: number | null`); `registrarHallazgo(sesion: SesionFlujo, d: DatosDeHallazgo, opciones?: OpcionesFlujo): Promise<{ id: number; codigo: string }>`; `tomarCodigo(tx: TransactionSql, anio: number): Promise<{ consecutivo: number; codigo: string }>`.
  - `tests/utiles/mejoramiento.ts`: `baseDeMejora(tx): Promise<{ admin: SesionFlujo; control: SesionFlujo; gerencia: SesionFlujo; lider: SesionFlujo; consulta: SesionFlujo; procesoId: number }>` (un proceso con su líder, creados con `usuarioDePrueba`); `datosDeHallazgo(procesoId: number, cambios?: Partial<DatosDeHallazgo>): DatosDeHallazgo`; `c(ahora: string): OpcionesFlujo` (con `firmaDePrueba`). Este archivo crece en las tareas siguientes con `hallazgoEn(tx, estado, …)`.

**Cómo nace un hallazgo.** `nacerHallazgo` calcula el estado con `destinoDe(accion, …, x.rumbo)`, inserta la fila ya con ese estado y `ronda = 1`, inserta la ronda 1 (con su `formular_antes_de`) y hace lo mismo que una transición de ahí en adelante (evento, vencimiento, bitácora, avisos).

**Qué hace `transicionarHallazgo`,** en este orden: **relee el estado de la fila con `FOR UPDATE`** y, si no es el de `h.estado`, lanza `YA_CAMBIO` sin escribir nada (quien la llama pudo leer `h` antes de que otra transacción lo cambiara); comprueba `DESDE` y calcula el destino con `destinoDe`; inserta el evento (`tipo` = la acción, con `antes`, `despues` y el `detalle`); actualiza `estado`, y con él `vence_en` (`venceEn` del paso que corresponde al estado nuevo: `aceptar` en `por_aceptar`; `decision` en `rechazo`, `arbitraje`, `por_decidir`, `por_validar` y `por_cerrar`; `correccion` en `por_corregir`; `mejora_rondas.formular_antes_de` de la ronda en curso en `por_formular`, **salvo cuando se llega por `devolver_plan`, que da `venceEn("reenviar", ahora)`**; `revisar` en `en_revision`; `aprobar` en `en_aprobacion`; `verificar` en `por_verificar`; nulo en `en_ejecucion`, `en_espera` y los terminales) y borra `aviso_vencido_en`, `escalado_en` y `aviso_evaluar_en`; registra la bitácora (`accion: "mejora_" + accion`, `entidad: "mejora_hallazgo"`); y avisa a `quienTieneElTurno` del estado nuevo con el tipo `mejora.turno`. El evento se inserta **antes** de cambiar el estado (el trigger rechaza hijos de un hallazgo terminado).

- [ ] **Step 1: Write the failing tests** `tests/mejora-registro.test.ts` (con base, dentro de `revertida`):
  - `Control Interno registra una no conformidad interna`: queda `por_aceptar`, con código `HZ-2026-001` si es el primero del año de `ahora`, su ronda 1 con `formular_antes_de` = `venceEn("formular", ahora)`, un evento `registrar`, una fila de bitácora `mejora_registrar` y un aviso `mejora.turno` a cada líder del proceso.
  - `el líder del proceso la registra y nace aceptada`: una no conformidad queda `por_corregir`; una oportunidad, `por_formular`.
  - `un líder no registra en un proceso ajeno`: `ErrorPermiso`. `el rol Consulta no registra`: `ErrorPermiso`.
  - `un origen externo nace aceptado y pide la fecha del ente`: `ente_control` sin `fechaLimiteEnte` lanza «Escriba la fecha límite de respuesta al ente»; con ella, `formular_antes_de` es el de `formularAntesDe`, y el registro avisa, además de a los líderes, a cada usuario de Gerencia y a cada Admin SGC (tipo `mejora.externo`).
  - `en un proceso sin líder nace aceptado y el turno es del Admin SGC`.
  - `validaciones`: no conformidad sin criticidad, «Elija la criticidad»; observación con criticidad, se ignora y queda nula; no conformidad sin ningún requisito, «Indique al menos un requisito incumplido»; `pqrsf` sin referencia del caso, «Escriba la referencia del caso»; `detectadoEn` en el futuro, «La fecha en que se detectó no puede ser futura»; un indicador en `borrador`, «Solo se puede enlazar un indicador activo o retirado»; una medición sin resultado, «Solo se puede enlazar una medición que ya tiene resultado».
  - `el consecutivo no deja huecos y reinicia con el año` (Review Focus 7): dos registros seguidos dan 001 y 002; con `mejora_consecutivos.ultimo = 999` del año, el siguiente es `HZ-2026-1000`; con `ahora` el `2027-01-01T04:00:00Z` (todavía 31 de diciembre en Bogotá) el código es de 2026, y a las `06:00:00Z` es `HZ-2027-001`.
  - `la segunda transición sobre un estado que ya cambió` (Review Focus 4): tras cambiar el estado, `transicionarHallazgo` con el `h` viejo lanza `YA_CAMBIO` y no deja evento.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-registro.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente `flujo.ts`, `avisos.ts` y `registro.ts`.** `tomarCodigo`: `INSERT INTO mejora_consecutivos (anio, ultimo) VALUES (${anio}, 1) ON CONFLICT (anio) DO UPDATE SET ultimo = mejora_consecutivos.ultimo + 1 RETURNING ultimo`. El año es el de `fechaEnZona(ahora, zona)`. `registrarHallazgo` valida con `EsquemaHallazgo` (`.strict()`), comprueba el permiso `mejora.registrar` y, si el rol es líder, que el proceso esté en su `alcanceProcesos`; todo dentro de `enTransaccion`, envuelto en `legible`.

- [ ] **Step 4: Bitácora.** En `src/lib/bitacora-detalle.ts`, una frase y un nombre por cada acción `mejora_<accion>` de «Nombres fijos» (las veinticinco), armadas con el `detalle` (el código del hallazgo va en `detalle.codigo`). Como el motor las arma con una variable, `tests/bitacora-detalle.test.ts` no las lee del código: añada **los veinticinco nombres, uno por uno** (`mejora_registrar`, `mejora_aceptar`, …, `mejora_ajustar`), a su lista `ACCIONES_ARMADAS` (`:348`), con el comentario de dónde se arman. Esa lista es de nombres, no de prefijos.

- [ ] **Step 5: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-registro.test.ts tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): el motor de transiciones y el registro de hallazgos`.

---

### Task 6: Alcance y lecturas

**Files:**
- Create: `src/db/consultas/mejoramiento/lectura.ts`, `tests/mejora-alcance.test.ts`
- Modify: `src/lib/alcance.ts`, `tests/utiles/mejoramiento.ts`

**Interfaces:**
- Consumes: `registrarHallazgo`, `baseDeMejora` (Tarea 5); `SujetoVisibilidad`, `alcanceProcesos` (`src/lib/alcance.ts`).
- Produces (en `src/lib/alcance.ts`, bloque «Mejoramiento (15A)»):
  - `filtroHallazgos(sql: Cliente, sujeto: SujetoVisibilidad): ReturnType<Cliente>` (fragmento para un `WHERE`; supone el alias **`h`** de `mejora_hallazgos`).
  - `participacionEnHallazgo(hallazgoId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<"completo" | "actividad" | null>`.
  - `puedeVerHallazgo(hallazgoId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>`.
- Produces (en `lectura.ts`):
  - `type FiltroDeLista = { q?: string; procesoId?: number; origen?: Origen; clase?: Clase; criticidad?: Criticidad; estado?: EstadoHallazgo | "abiertos" | "reabiertos" | "sin_accion"; soloVencidos?: boolean }`.
  - `listarHallazgos(sesion: SesionFlujo, filtro: FiltroDeLista, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ filas: FilaDeHallazgo[]; cifras: { abiertos: number; conAlgoVencido: number; esperanSuDecision: number; enEspera: number; reabiertos: number } }>`, con `FilaDeHallazgo = { id; codigo; titulo; clase; criticidad; origen; proceso: string; estado; etiqueta: string; marcas: string[]; turno: string; avance: number | null; vence: Date | null; prioridadAlta: boolean }`.
  - `leerHallazgo(sesion: SesionFlujo, id: number, opciones?: { sql?: Cliente; ahora?: Date }): Promise<DetalleDeHallazgo | null>` (nulo si no existe **o** si no lo ve); `DetalleDeHallazgo` lleva `ve: "completo" | "actividad"`, la identificación, la corrección, las rondas (cada una con análisis, causas, acciones, actividades y ajustes), las ocurrencias, los eventos y `loQueSigue` (qué acción le toca a quien mira, o quién tiene el turno).
  - `turnoEnTexto(tx: Cliente, h: HallazgoBase): Promise<string>` («La líder del proceso», «Administrador del SGC», «Gerencia», «Los responsables de las actividades», «Quien puede verificar»).

**La regla de `filtroHallazgos`** (spec §6.3): con `mejora.ver_todo`, `true`. Si no: `(sujeto.rol === "lider_proceso" y h.proceso_id` está entre sus procesos activos`)` **o** `h.registrado_por = usuario` **o** existe una actividad del hallazgo con `responsable_id = usuario` **o** existe un seguimiento del hallazgo con `registrado_por = usuario`. **No use `alcanceProcesos` para decidir el rol Consulta:** le devuelve `{ todos: true }`. `participacionEnHallazgo` da `"completo"` por las tres primeras vías (rol, líder, registrador) y `"actividad"` por las dos últimas.

- [ ] **Step 1: Write the failing tests** `tests/mejora-alcance.test.ts` (con base, dentro de `revertida`; dos procesos, cada uno con su líder; un hallazgo en cada uno):
  - `quien tiene mejora.ver_todo ve los dos` (Admin SGC, Gerencia, Control Interno).
  - `el líder ve solo el de su proceso`; `leerHallazgo` del otro devuelve `null`.
  - `el rol Consulta no ve ninguno` (Review Focus 1): `listarHallazgos` devuelve cero filas **y cifras en cero**; `leerHallazgo` devuelve `null`; `puedeVerHallazgo`, falso.
  - `quien lo registró lo ve completo aunque deje de liderar el proceso`.
  - `el responsable de una actividad ve ese hallazgo como "actividad"` (inserte la acción y la actividad por SQL: las acciones llegan en la Tarea 12) y no el otro.
  - `un identificador que no existe y uno que no se ve responden igual`: los dos, `null`.
  - `los filtros de la lista`: por proceso, origen, clase, criticidad y estado; `q` busca en el código y en el título sin distinguir tildes; `abiertos` excluye los terminales.
  - `el turno se calcula al leer` (Review Focus 3): con el hallazgo `por_aceptar`, al desactivar al único líder del proceso, `quienTieneElTurno` devuelve los Admin SGC y `turnoEnTexto`, «Administrador del SGC».
  - `los externos van primero`: en el orden por omisión, la fila con `prioridadAlta` precede a las demás.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-alcance.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** las tres funciones de alcance y `lectura.ts`. `listarHallazgos` hace una consulta con `WHERE ${filtroHallazgos(sql, sesion)}` y las cifras con el mismo filtro. El orden por omisión: `prioridadAlta` primero, luego los vencidos, luego por `vence_en` ascendente con los nulos al final.

- [ ] **Step 4: Run** el archivo y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15a): alcance de los hallazgos y sus lecturas`.

---

### Task 7: Navegación, la lista, registrar y la página del hallazgo

**Files:**
- Create: `src/app/(app)/mejoramiento/page.tsx`, `_comun.ts`, `nuevo/page.tsx`, `[id]/page.tsx`; `src/lib/mejoramiento/rutas.ts`; `src/app/acciones-mejoramiento.ts`; en `src/componentes/mejoramiento/`: `PestanasMejoramiento.tsx`, `ListaDeHallazgos.tsx`, `FiltrosDeHallazgos.tsx`, `FormularioHallazgo.tsx`, `Recorrido.tsx`, `SeccionIdentificacion.tsx`, `LoQueSigue.tsx`, `HistorialDelHallazgo.tsx`, `InsigniasDelHallazgo.tsx`; `tests/mejora-pantallas.test.tsx`
- Modify: `src/componentes/cascaron/navegacion.ts` (`GrupoNav`, `IconoNav`, el color de `GRUPOS`, `NAVEGACION`), `ContenidoBarra.tsx` (`ORDEN_GRUPOS`, `COLOR_ICONO`, `COLOR_INDICADOR`), `IconoNav.tsx` (`ICONOS`), `tests/navegacion.test.ts`, `tests/acciones-permisos.test.ts` (`ARCHIVOS_PANEL`)

**Interfaces:**
- Consumes: `listarHallazgos`, `leerHallazgo`, `FiltroDeLista` (Tarea 6); `registrarHallazgo` (Tarea 5); `pasosDelRecorrido`, `etiquetaDeEstado`, `ORIGENES`, `AVISO_SIN_PACIENTES` (Tarea 3); `quedanDiasHabiles` (Tarea 4).
- Produces:
  - `rutas.ts`: `rutaDeHallazgo(id: number): string`, `rutaDeActividad(id: number): string`, `rutaDeFormular(id: number): string`.
  - `_comun.ts`: `exigirHallazgo(sesion: SesionValida, segmento: string, opciones?: { ahora?: Date }): Promise<DetalleDeHallazgo>` (si el segmento no cumple `/^\d{1,15}$/` o `leerHallazgo` da `null`, `notFound()`). Recibe la sesión: la página llama `exigirSesion()`.
  - `acciones-mejoramiento.ts`: `registrarHallazgoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion>` (con `mutacion(formData, "mejora.registrar", …)`; devuelve `rutaDeHallazgo(id)` para navegar).
  - `PestanasMejoramiento({ activa, visibles })` (de servidor) y `pestanasVisibles(sesion, x: { veHallazgos: boolean }): Pestana[]` en el mismo archivo: «Hallazgos», «Reportes recibidos», «Mis actividades», «Mis reportes». Las tareas 14 y 18 llenan las suyas.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-pantallas.test.tsx` (sin base; componentes con datos de mentira):
  - `ListaDeHallazgos`: pinta el código, el título, la etiqueta de estado **con texto** (no solo color), el turno y «Vencida hace 4 días» o «quedan 5 días hábiles»; una fila con `prioridadAlta` lleva la insignia «Prioridad alta»; sin filas, el `EstadoVacio` «Aún no hay hallazgos».
  - `Recorrido`: marca un solo paso como actual (`aria-current="step"`), los anteriores como hechos y no es un control (ningún `button` ni `a`).
  - `FormularioHallazgo`: muestra `AVISO_SIN_PACIENTES`; al elegir «PQRSF» aparece «Referencia del caso»; al elegir una clase distinta de «No conformidad» desaparece «Criticidad»; al elegir «Ente de control» aparece «Fecha límite de respuesta al ente» y la nota «Este hallazgo no se puede rechazar y lo aprobará Gerencia»; con criticidad alta, la nota «Llevará acción correctiva y lo aprobará Gerencia».
  - `LoQueSigue`: a quien no tiene el turno le dice quién lo tiene («Tiene el turno: la líder del proceso»), sin botones.

  En `tests/navegacion.test.ts`: el grupo `mejoramiento` va entre `indicadores` y `administracion` (cambie la regla que hoy exige «indicadores» justo antes de «administracion»); la entrada «Mejoramiento» está en la lista exacta del rol Consulta y en las de los demás roles (los largos suben en uno).

- [ ] **Step 2: Run** `npx vitest run tests/mejora-pantallas.test.tsx tests/navegacion.test.ts`. Expected: FAIL.

- [ ] **Step 3: Navegación.** `GrupoNav` gana `"mejoramiento"`; el color de `GRUPOS`, `"mod-planes"`; `IconoNav`, `"mejoramiento"` (un ícono de `lucide-react`); la entrada `{ href: "/mejoramiento", etiqueta: "Mejoramiento", icono: "mejoramiento", grupo: "mejoramiento" }`, sin permiso (la ve toda sesión). En `ContenidoBarra.tsx`, las tres tablas de clases literales. **Sin insignia de conteo en la barra:** el spec no la pide.

- [ ] **Step 4: Las tres páginas** (cada una con `export const dynamic = "force-dynamic"` y `exigirSesion()` en su texto; `EncabezadoPagina`; pestañas con `border-mod-planes`):
  - `/mejoramiento`: las cifras como `TarjetaCifra` enlazadas a su filtro, los filtros (`searchParams`), `TablaDatos` y, bajo 640 px, tarjetas. A quien no ve ningún hallazgo, el `EstadoVacio` «No tiene hallazgos a la vista» con la acción «Reportar una posible no conformidad» (las tareas 14 y 18 lo cambian por una redirección).
  - `/mejoramiento/nuevo`: `exigirSesion()` y, sin `mejora.registrar`, `notFound()`. El formulario de la maqueta 3 (los parecidos llegan en la Tarea 8). El selector de proceso trae solo los del alcance de quien registra.
  - `/mejoramiento/[id]`: `exigirHallazgo`. El encabezado (código, insignias de clase, criticidad, «Reincidente», «Cargado», «Prioridad alta»), el `Recorrido`, la sección «1. Identificación» plegable, `LoQueSigue` y el historial (los eventos, con quién y cuándo). Las demás secciones las añaden las tareas 10 a 17. A quien lo ve como `"actividad"` no se le muestran los enlaces a archivos ni el historial.

- [ ] **Step 5: Run** `npx vitest run tests/mejora-pantallas.test.tsx tests/navegacion.test.ts tests/paginas-sesion.test.ts tests/acciones-permisos.test.ts tests/colores-fijos.test.ts tests/sin-main.test.ts tests/frontera-cliente.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): módulo Mejoramiento en la barra, lista, registro y página del hallazgo`.

**Punto de control 1 (controlador):** con `next dev -p 3015`, registrar un hallazgo como Control Interno, verlo en la lista y abrir su página, en claro, oscuro y 390 px, contra las maquetas 1 a 3.

---

### Task 8: Parecidos, reincidencia y ocurrencias; editar, reclasificar y anular

**Files:**
- Create: `src/db/consultas/mejoramiento/parecidos.ts`, `src/app/(app)/mejoramiento/parecidos/route.ts`, `src/componentes/mejoramiento/ParecidosDelProceso.tsx`, `Ocurrencias.tsx`, `DialogoReclasificar.tsx`, `DialogoAnular.tsx`; `tests/mejora-reincidencia.test.ts`
- Modify: `src/db/consultas/mejoramiento/registro.ts`, `lectura.ts`, `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `FormularioHallazgo.tsx`, `[id]/page.tsx`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `transicionarHallazgo`, `bloquearHallazgo`, `dejarEvento`, `avisarDeMejora` (Tarea 5); `filtroHallazgos` (Tarea 6); `accionObligada`, `aceptadoVaA` (Tarea 3).
- Produces:
  - `parecidos.ts`: `type HallazgoParecido = { id: number; codigo: string; titulo: string; etiqueta: string; abierto: boolean; cuando: Date }`; `parecidosDelProceso(sql: Cliente, x: { procesoId: number; texto: string; excluirId?: number }): Promise<HallazgoParecido[]>` (mismo proceso, no anulados ni rechazados, hasta 5; `similarity` sobre `lower(unaccent(titulo || ' ' || descripcion))`, umbral 0,3, como `src/db/consultas/parecidos.ts`); `parecidosDeOtrosProcesos(sql: Cliente, hallazgoId: number): Promise<Array<HallazgoParecido & { proceso: string }>>` (para la Tarea 13).
  - `registro.ts`: `registrarOcurrencia(sesion, d: { hallazgoId: number; fecha: string; descripcion: string; origen?: "registro" | "reporte" | "medicion"; reporteId?: number | null }, opciones?): Promise<void>`; `editarHallazgo(sesion, id: number, d: DatosDeHallazgo, opciones?)`; `reclasificarHallazgo(sesion, d: { hallazgoId: number; clase: Clase; criticidad: Criticidad | null; origen: Origen; fuente: string | null; titulo: string; requisitoClausula: string | null; requisitoNormaId: number | null; requisitoDocumentoId: number | null; reincidenteDe: number | null; fechaLimiteEnte: string | null; nota: string | null; justificacion: string }, opciones?)`; `anularHallazgo(sesion, d: { hallazgoId: number; justificacion: string }, opciones?)`; `cambiarProceso(sesion, d: { hallazgoId: number; procesoId: number; justificacion: string }, opciones?)`.
  - `registrarHallazgo` acepta `reincidenteDe` (un hallazgo `cerrado` del mismo proceso) y lo valida.

- [ ] **Step 1: Write the failing tests** `tests/mejora-reincidencia.test.ts` (con base, dentro de `revertida`):
  - `parecidosDelProceso` encuentra uno del mismo proceso con el texto parecido y con tildes distintas, no uno de otro proceso ni uno anulado.
  - `la ruta de parecidos responde 404 a quien no puede registrar en ese proceso` (un líder de otro proceso), y 401 sin sesión.
  - `una ocurrencia no crea un hallazgo`: el conteo de hallazgos no cambia; queda la fila en `mejora_ocurrencias`, un evento `ocurrencia` y un aviso `mejora.ocurrencia` a los líderes y al Admin SGC. Sobre un hallazgo `cerrado` lanza «El hallazgo ya terminó: regístrelo como reincidencia».
  - `la reincidencia solo enlaza un cerrado del mismo proceso`: con uno abierto, «Solo se marca reincidencia de un hallazgo cerrado»; con uno de otro proceso, «…del mismo proceso».
  - `editar`: quien lo registró, en `por_aceptar`, cambia el título y queda el evento `editado` con el antes y el después; en `por_corregir` lanza `YA_CAMBIO`; otra persona, `ErrorPermiso`.
  - `reclasificar`, una prueba por fila de la tabla del spec §7.6: no conformidad `por_decidir` → oportunidad queda `por_formular` y conserva la corrección; oportunidad `por_formular` → no conformidad sin corrección queda `por_corregir`; subir a criticidad alta en `por_validar` queda `por_formular`; origen a `ente_control` en `por_aceptar` queda aceptado; bajar la criticidad en `por_formular` no cambia el estado. Sin justificación de 10 caracteres, «La justificación debe tener al menos 10 caracteres». En `en_revision` lanza `YA_CAMBIO`. Un líder, `ErrorPermiso`.
  - `lo firmado no se reclasifica`: con el hallazgo de vuelta en `por_formular` tras una devolución del plan (`mejora_rondas.enviado_en` ya tiene fecha), o en la ronda 2, lanza «La identificación ya se firmó: no se puede reclasificar». `DESDE` deja pasar `por_formular`; esta guarda es de `reclasificarHallazgo`: solo con `ronda = 1` y `enviado_en` nulo.
  - `cambiarProceso` solo en `por_aceptar`, y avisa a los líderes del proceso nuevo.
  - `anular`: en cualquier estado no terminal queda `anulado` con su código; sus actividades sin terminar quedan `cancelada` (el `UPDATE` de las actividades va **antes** del cambio de estado); avisa a los líderes; un hallazgo anulado no aparece en las cifras de `listarHallazgos`. Anular uno `cerrado` lanza `YA_CAMBIO`.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-reincidencia.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** el dominio. `reclasificarHallazgo` calcula `quedaEn` con la tabla del spec §7.6 y llama `transicionarHallazgo(…, "reclasificar", { rumbo: { quedaEn }, detalle: { antes, despues, justificacion } })`; la nota se guarda en el evento (la descripción no se reescribe). Si el plazo de formular debe contarse de nuevo (el estado cambió a `por_formular`), actualice `mejora_rondas.formular_antes_de` desde `ahora` (spec §13.3) antes de transicionar.

- [ ] **Step 4: La interfaz.** `ParecidosDelProceso` (cliente): al salir del título o de la descripción con más de 15 caracteres y un proceso elegido, pide `GET /mejoramiento/parecidos?proceso=&q=` y, si hay resultados, muestra las tres salidas del spec §7.5 como botones de opción; la elegida viaja en el formulario (`relacion` = `ocurrencia:<id>` | `reincidencia:<id>` | `distinto`), y `registrarHallazgoAccion` llama `registrarOcurrencia` o `registrarHallazgo` según el caso. La página del hallazgo gana la lista de ocurrencias, «Añadir una ocurrencia», «Reclasificar» y «Anular» (los dos últimos, solo con `mejora.gestionar`).

- [ ] **Step 5: Run** el archivo, `tests/mejora-pantallas.test.tsx`, `tests/bitacora-detalle.test.ts`, `tests/acciones-permisos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): parecidos, reincidencia, ocurrencias, reclasificar y anular`.

---

### Task 9: Los archivos del módulo

**Files:**
- Create: `src/db/consultas/mejoramiento/archivos.ts`; las cuatro rutas de subida de «Nombres fijos» (`route.ts` cada una); `src/app/(app)/mejoramiento/archivos/[archivoId]/[[...nombre]]/route.ts`; `src/componentes/mejoramiento/ArchivosDe.tsx`; `tests/mejora-archivos.test.ts`
- Modify: `src/lib/alcance.ts`, `src/db/consultas/admin.ts` (`registrarArchivo`, ~`:785`), `src/proxy.ts` (`matcher`), `tests/proxy-matcher.test.ts`, `src/app/acciones-mejoramiento.ts`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `participacionEnHallazgo` (Tarea 6); `recibirArchivo`, `DestinoEvidencia` con `rol` (Tarea 2); `respuestaArchivo`, `respuesta404` (`src/lib/servir-archivo.ts`).
- Produces:
  - `alcance.ts`: `puedeAbrirArchivoDeMejora(archivo: { contexto: string; contextoId: number }, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>`.
  - `archivos.ts`: `type DestinoDeMejora = { contexto: "mejora_hallazgo"; id: number; rol: "evidencia" | "correccion" | "carga" } | { contexto: "mejora_ronda"; id: number; rol: "analisis" | "verificacion" } | { contexto: "mejora_actividad"; id: number } | { contexto: "mejora_reporte"; id: number }`; `autorizarSubida(sesion: SesionFlujo, destino: DestinoDeMejora, opciones?: { sql?: Cliente }): Promise<{ ok: true; carpeta: string } | { ok: false; estado: 403 | 404 | 409; error: string }>`; `exigirDestinoAbierto(tx: TransactionSql, contexto: string, contextoId: number, usuarioId: number): Promise<void>` (lo llama `registrarArchivo` dentro de su transacción); `archivoServible(sesion: SesionFlujo, archivoId: number, opciones?): Promise<ArchivoServible | null>`; `archivosDe(sql: Cliente, sesion: SesionFlujo, x: { contexto: string; contextoId: number }): Promise<Array<{ id: number; nombre: string; rol: string; tamano: number; mime: string }>>` (vacío para quien no puede abrirlos); `quitarArchivoDeMejora(sesion, archivoId: number, opciones?): Promise<void>`.

**Quién sube qué** (spec §6.3, §7 a §11):

| Destino | Quién | Mientras |
|---|---|---|
| Hallazgo, rol `evidencia` | Quien lo registró; el Admin SGC | No esté terminado |
| Hallazgo, rol `correccion` | Quien actúa por el proceso (`actuaPorElProceso`, Tarea 5) | `por_corregir` |
| Hallazgo, rol `carga` | Admin SGC | El hallazgo sea `cargado` y no esté terminado |
| Ronda, rol `analisis` | Quien actúa por el proceso | `por_formular` y la ronda sea la del hallazgo |
| Ronda, rol `verificacion` | Quien tiene `mejora.verificar` (la Tarea 16 lo cambia por `puedeVerificar`) | `por_verificar` o `en_espera` |
| Actividad | Su responsable | El hallazgo `en_ejecucion` y la actividad sin terminar ni cancelar |
| Reporte | Quien reportó | `recibido`, y menos de tres archivos |

**Quién abre qué:** los archivos del hallazgo y de la ronda, quien tiene participación `"completo"`; los de una actividad, esos y quien es su responsable o registró un seguimiento **en esa actividad**; los de un reporte, quien reportó y quien tiene `mejora.ver_todo`, y, convertido el reporte, quien ve completo el hallazgo. Los demás, 404.

- [ ] **Step 1: Write the failing tests** `tests/mejora-archivos.test.ts` (con base, dentro de `revertida`; los archivos, filas de `archivos` insertadas por SQL):
  - `autorizarSubida`, una prueba por fila de la tabla, con quien puede y con quien no (403), con un identificador que no existe o no se ve (404) y fuera de su «mientras» (409).
  - `subir a una actividad terminada o a un hallazgo terminado se rechaza` (Review Focus 5): `autorizarSubida` da 409 y `exigirDestinoAbierto` lanza `ErrorTramite` dentro de la transacción (el caso en que el estado cambia entre la autorización y el registro).
  - `el responsable de una actividad abre los archivos de la suya y ningún otro` (Review Focus 1): los de otra actividad del mismo hallazgo, los del registro y los de la ronda dan `null` en `archivoServible`; `archivosDe` le devuelve la lista vacía.
  - `el rol Consulta sin participación no abre nada`: `null`, igual que con un `archivoId` que no existe.
  - `quitar`: quien lo subió, mientras el paso sigue abierto; el Admin SGC, mientras el hallazgo no termine; nadie en un hallazgo terminado. Deja `eliminar_archivo` en la bitácora.

  En `tests/proxy-matcher.test.ts`: las cuatro rutas de subida, con y sin `?x=1`, en «queda fuera del proxy»; sus variantes (`/5/archivos/7`, `/x/archivos`, `/5`) y la ruta GET del archivo, en «sigue pasando».

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-archivos.test.ts tests/proxy-matcher.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente.** Las rutas de subida siguen el esqueleto de `src/app/api/mediciones/[id]/archivos/route.ts` en su mismo orden (sesión 401, permiso 403, `origenValido` 403, límite 429, id 404, `autorizarSubida`, `recibirArchivo`); el permiso de la matriz es `mejora.reportar` en la del reporte y `mejora.ejecutar` en las demás (los tienen los cinco roles: la regla es `autorizarSubida`). El rol viaja en `?rol=` y se valida contra la lista del destino. Carpetas: `mejoramiento/hallazgos/<id>`, `mejoramiento/rondas/<id>`, `mejoramiento/actividades/<id>`, `mejoramiento/reportes/<id>`. En `registrarArchivo`, una rama para los cuatro contextos que llama `exigirDestinoAbierto`, y el mensaje de `23505` «Ya hay un archivo con ese nombre». La ruta GET sirve siempre como descarga (`respuestaArchivo(archivo, true)`). En `src/proxy.ts`, las cuatro rutas en el `matcher`, con `[0-9]+` y los puntos como `[.]`.

- [ ] **Step 4: `ArchivosDe`** (lista con nombre, tamaño y etiqueta textual del tipo, más `ZonaCarga` cuando la persona puede subir): la usan las tareas siguientes. Póngala ya en la sección «1. Identificación».

- [ ] **Step 5: Run** los dos archivos, `tests/file-type-empaquetado.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): archivos de mejoramiento: subir, servir y quitar por alcance`.

---

### Task 10: Aceptación, rechazo, arbitraje, corrección y camino corto

**Files:**
- Create: `src/db/consultas/mejoramiento/recorrido.ts`; en `src/componentes/mejoramiento/pasos/`: `PasoAceptar.tsx`, `PasoTrasRechazo.tsx`, `PasoArbitrar.tsx`, `PasoCorregir.tsx`, `PasoDecidir.tsx`, `PasoValidar.tsx`; `SeccionCorreccion.tsx`; `tests/mejora-recorrido.test.ts`
- Modify: `src/lib/alcance.ts`, `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `LoQueSigue.tsx`, `[id]/page.tsx`, `lectura.ts` (`loQueSigue`), `tests/utiles/mejoramiento.ts`

**Interfaces:**
- Consumes: `transicionarHallazgo`, `bloquearHallazgo`, `quienTieneElTurno` (Tarea 5); `accionObligada` (Tarea 3); `archivosDe` (Tarea 9).
- Produces (en `recorrido.ts`; todas `(sesion: SesionFlujo, d, opciones?: OpcionesFlujo): Promise<void>`):
  - `aceptarHallazgo({ hallazgoId })`, `rechazarHallazgo({ hallazgoId, justificacion })`.
  - `retirarHallazgo({ hallazgoId })`, `sostenerHallazgo({ hallazgoId, replica })`.
  - `arbitrarHallazgo({ hallazgoId, confirma: "hallazgo" | "rechazo", nota, acta? })`.
  - `registrarCorreccion({ hallazgoId, requerida: boolean, descripcion, responsableId?: number | null, responsableNombre?: string | null, implementadaEn?: string | null })`.
  - `decidirAccionCorrectiva({ hallazgoId, requiere: boolean, justificacion, acta? })` (también cambia el «no» por «sí» desde `por_validar`).
  - `validarCorreccion({ hallazgoId })`, `devolverCorreccion({ hallazgoId, nota })`.
  - `alcance.ts`: `puedeValidarCorreccion(hallazgoId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>`.
  - `tests/utiles/mejoramiento.ts`: `hallazgoEn(tx, base, estado: "por_aceptar" | "rechazo" | "arbitraje" | "por_corregir" | "por_decidir" | "por_validar" | "por_formular", cambios?: Partial<DatosDeHallazgo>): Promise<HallazgoBase>` (lo lleva por el dominio, nunca por SQL).

**Reglas** (spec §8.3 a §8.5):
- Acepta o rechaza un líder del proceso que **no** lo registró; si el proceso no tiene líder activo, no existe ese paso (nació aceptado). Rechazar solo en origen interno, con justificación de al menos 10 caracteres.
- Retira o sostiene quien lo registró, o un Admin SGC en su lugar. Arbitra un Admin SGC; arbitra Gerencia si un Admin SGC lo registró o lo sostuvo. Un hallazgo confirmado en arbitraje no vuelve a `por_aceptar`.
- La corrección la registra un líder del proceso (o el Admin SGC si no hay líder). Con `requerida: true`: descripción, responsable (usuario activo, o un nombre), fecha de implementación no futura y **al menos un archivo** con rol `correccion` ya subido; sin él, «Adjunte la evidencia de la corrección». Con `requerida: false`: la justificación en `descripcion`. Tras registrarla, si `accionObligada`, el sistema deja `accion_requerida = true` y pasa a `por_formular`; si no, a `por_decidir`.
- `puedeValidarCorreccion`: Admin SGC o Control Interno que no registró la corrección ni es su responsable; **si no hubo corrección, tampoco quien decidió el «no»**; Gerencia, solo si ningún Admin SGC ni Control Interno activo cumple eso. Validada: `cerrado`, con `resultado_cierre = 'con_correccion'`, o `'sin_accion'` si `correccion_requerida` es falso.
- Al pasar a `por_formular` por `decidir_si` desde `por_validar` o por un arbitraje, `mejora_rondas.formular_antes_de` se cuenta de nuevo desde `ahora` (spec §13.3).

- [ ] **Step 1: Write the failing tests** `tests/mejora-recorrido.test.ts` (con base, dentro de `revertida`):
  - `aceptar`: no conformidad → `por_corregir`; oportunidad → `por_formular`. Quien lo registró, aunque lidere el proceso, no lo acepta (`ErrorPermiso`); un líder de otro proceso, tampoco.
  - `rechazar` un `ente_control` lanza «Un hallazgo de origen externo no se rechaza: se responde».
  - `rechazo sostenido y arbitraje`: registra Control Interno, rechaza el líder, sostiene Control Interno, arbitra el Admin SGC confirmando → `por_corregir`, y `formular_antes_de` es `venceEn("formular", ahoraDelArbitraje)`. Si registró el Admin SGC, él no arbitra (`ErrorPermiso`) y Gerencia sí. Si el Admin SGC sostuvo en lugar de Control Interno, arbitra Gerencia.
  - `corrección sin evidencia` lanza el mensaje; con evidencia y acción obligada (criticidad alta) → `por_formular` con `accion_requerida = true`; sin obligación → `por_decidir`.
  - `decidir no y validar`: el Admin SGC decide «no»; quien registró la corrección no la valida; Control Interno sí → `cerrado` / `con_correccion`.
  - `cierre sin acción` (spec, Tema 16): corrección `requerida: false` y decisión «no» → la etiqueta es «Por validar el cierre sin acción»; el Admin SGC que decidió no valida (`ErrorPermiso`); Control Interno valida → `cerrado` / `sin_accion`. Sin Control Interno activo y con un solo Admin SGC, valida Gerencia.
  - `cambiar el no por sí`: en `por_validar`, Gerencia exige la acción → `por_formular`, con el plazo contado desde ese acto.
  - `devolver la corrección` → `por_corregir`, y el evento lleva la nota.
  - `decidir sobre una obligada` no existe: `decidirAccionCorrectiva` en `por_formular` lanza `YA_CAMBIO`.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-recorrido.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente `recorrido.ts` y `puedeValidarCorreccion`.** Cada función: permiso de la matriz (spec §6.2), `enTransaccion`, `bloquearHallazgo`, condición de persona **dentro**, escritura de sus columnas y `transicionarHallazgo`. Las acciones: `mejora.formular` para aceptar, rechazar y corregir; `mejora.registrar` para retirar y sostener; `mejora.gestionar` o `mejora.aprobar` para arbitrar y decidir (dos acciones exportadas, una por permiso, que llaman la misma función del dominio); `mejora.verificar` para validar y devolver.

- [ ] **Step 4: La interfaz.** `loQueSigue` (en `leerHallazgo`) devuelve `{ paso, puede: boolean, turno: string }`; `LoQueSigue` pinta el formulario del paso a quien puede y, a los demás, quién tiene el turno. La sección «2. Corrección» en la página, con sus archivos. Cada formulario de texto libre lleva `AVISO_SIN_PACIENTES`.

- [ ] **Step 5: Run** el archivo, `tests/mejora-pantallas.test.tsx`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): aceptación, rechazo, arbitraje, corrección y camino corto`.

**Punto de control 2 (controlador):** aceptar, rechazar y arbitrar; corregir con evidencia; el camino corto y el cierre sin acción, con dos usuarios distintos.

---

### Task 11: El análisis de causa raíz

**Files:**
- Create: `src/lib/mejoramiento/analisis.ts`, `src/db/consultas/mejoramiento/analisis.ts`, `src/app/(app)/mejoramiento/[id]/formular/page.tsx`; en `src/componentes/mejoramiento/analisis/`: `PestanasDeMetodo.tsx`, `FormularioCincoPorques.tsx`, `FormularioIshikawa.tsx`, `FormularioOtroMetodo.tsx`, `CausasRaiz.tsx`, `PreguntasDeCierre.tsx`, `LaVezPasada.tsx`, `AnalisisEnLectura.tsx`; `tests/mejora-analisis.test.ts`
- Modify: `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `lectura.ts`, `[id]/page.tsx`

**Interfaces:**
- Consumes: `bloquearHallazgo`, `dejarEvento`, `YA_CAMBIO` (Tareas 3 y 5); `hallazgoEn` (Tarea 10).
- Produces:
  - `src/lib/mejoramiento/analisis.ts` (puro): `CATEGORIAS_6M = ["mano_de_obra", "metodo", "maquina", "material", "medicion", "medio_ambiente"] as const` con `ETIQUETA_6M`; `EsquemaCincoPorques` (`{ niveles: Array<{ respuesta: string; evidencia?: string }> }`, de 1 a 5, sin huecos), `EsquemaIshikawa` (`{ causas: Array<{ categoria; texto; confirmada: boolean; impacto?: "alto" | "medio" | "bajo"; requiereAccion?: boolean }> }`, con `impacto` obligatorio en las confirmadas), `EsquemaOtroMetodo` (`{ nombre: string; descripcion: string }`); `leerContenido(metodo: MetodoAnalisis, crudo: unknown): ContenidoDeAnalisis` (lanza `ErrorMejora` con el primer mensaje); `analisisCompleto(a: { metodo: MetodoAnalisis; contenido: unknown }): boolean`.
  - `src/db/consultas/mejoramiento/analisis.ts`: `puedeFormular(tx: Cliente, sesion: SesionFlujo, h: HallazgoBase): Promise<boolean>` (tiene `mejora.formular` y `actuaPorElProceso`, de la Tarea 5); `exigirBorrador(tx: TransactionSql, sesion, hallazgoId: number): Promise<{ h: HallazgoBase; rondaId: number }>` (bloquea; exige `por_formular`, `estado_plan = 'borrador'` y `puedeFormular`; si no, `YA_CAMBIO` o `ErrorPermiso`); `guardarAnalisis(sesion, d: { hallazgoId: number; analisisId?: number; metodo: MetodoAnalisis; equipo?: string; observaciones?: string; contenido: unknown }, opciones?): Promise<{ id: number }>`; `quitarAnalisis(sesion, d: { hallazgoId: number; analisisId: number }, opciones?)`; `guardarCausas(sesion, d: { hallazgoId: number; causas: Array<{ id?: number; texto: string; sinAccionPorque?: string | null }> }, opciones?)`; `responderPreguntas(sesion, d: { hallazgoId: number; similares: boolean; similaresDetalle?: string | null; cambios: { documentos: boolean; riesgos: boolean; controles: boolean; descripcion?: string | null } }, opciones?)`; `laVezPasada(sql: Cliente, hallazgoId: number): Promise<{ codigo: string; causas: string[]; acciones: string[] } | null>`.

- [ ] **Step 1: Write the failing tests** `tests/mejora-analisis.test.ts`:
  - Sin base: 5 porqués con un nivel es completo; con el nivel 2 lleno y el 1 vacío, «Los niveles van en orden, sin saltar ninguno»; con seis, se rechaza. Ishikawa sin ninguna causa confirmada no es completo; una confirmada sin impacto, «Indique el impacto de cada causa confirmada»; una categoría fuera de las seis, se rechaza. «Otro método» sin nombre, «Escriba el nombre del método». El método `pareto` lanza «El análisis de Pareto todavía no está disponible».
  - Con base: `guardarAnalisis` exige `por_formular`: en `por_corregir` lanza `YA_CAMBIO`; un líder de otro proceso, `ErrorPermiso`; el Admin SGC, `ErrorPermiso` si el proceso tiene líder y permitido si no lo tiene.
  - `dos análisis en la misma ronda` (un Ishikawa y unos 5 porqués) conviven y conservan su `orden`.
  - `guardarCausas` reemplaza la lista conservando los `id` que llegan (las acciones ya enlazadas no pierden su causa) y rechaza quitar una causa que una acción ataca: «Esa causa tiene acciones: quítelas antes».
  - `responderPreguntas`: `similares: true` sin detalle, «Diga cuáles»; alguna casilla de cambios marcada sin descripción, «Describa los cambios que se requieren».
  - `laVezPasada` de un reincidente devuelve las causas y las acciones de la última ronda del hallazgo anterior; de uno que no lo es, `null`.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-analisis.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** los dos módulos. El `contenido` se guarda tal como lo devuelve `leerContenido` (normalizado). Cada guardado deja un evento `analisis_guardado` (sin el contenido: solo método e id) y no cambia el estado.

- [ ] **Step 4: La página `/mejoramiento/[id]/formular`** (`exigirHallazgo`; sin `puedeFormular` o fuera de `por_formular`, `notFound()`), con dos pestañas, «Causa raíz» y «Plan de acción» (la segunda, en la Tarea 12): la maqueta 4. Una pestaña por método; «Añadir otro análisis»; a la derecha, `CausasRaiz`, `PreguntasDeCierre` y, si es reincidente, `LaVezPasada`. En la observación y la oportunidad, la nota «El análisis es opcional en esta clase de hallazgo». La página del hallazgo gana la sección «3. Causa raíz» en lectura (`AnalisisEnLectura`).

- [ ] **Step 5: Run** el archivo, `tests/mejora-pantallas.test.tsx`, `tests/paginas-sesion.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): análisis de causa raíz con 5 porqués, Ishikawa y otro método`.

---

### Task 12: El plan de acción en borrador, las fechas de eficacia y la huella

**Files:**
- Create: `src/lib/mejoramiento/eficacia.ts`, `src/lib/mejoramiento/huellas.ts`, `src/db/consultas/mejoramiento/plan.ts`, `indicador-de-eficacia.ts`; en `src/componentes/mejoramiento/plan/`: `FormularioPlan.tsx`, `TarjetaDeAccion.tsx`, `CriterioDeEficacia.tsx`, `PlanEnLectura.tsx`; `tests/mejora-eficacia.test.ts`, `tests/mejora-plan.test.ts`
- Modify: `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `formular/page.tsx`, `lectura.ts`, `[id]/page.tsx`

**Interfaces:**
- Consumes: `exigirBorrador`, `analisisCompleto` (Tarea 11); `venceEn`, `ContextoMejora` (Tarea 4); `sumarMeses` (`src/lib/vigencia/plazo.ts:33`), `fechaEnZona`, `finDeFecha` (`src/lib/tramites/plazos.ts`), `periodoQueContiene` (`src/lib/indicadores/periodos.ts`), `puedeVerIndicador`, `filtroIndicadores` (`src/lib/alcance.ts`), `versionVigente` (`src/db/consultas/indicadores/aprobacion.ts:162`).
- Produces:
  - `eficacia.ts` (puro; los días son `AAAA-MM-DD`): `fechaMinimaDeEficacia(x: { clase: Clase; r: string; fechaEvaluacion: string | null; periodicidad: Periodicidad | null }, zona: string): string`; `venceLaEvaluacion(minima: string, plazoReporteDias: number | null, c: Pick<ContextoMejora, "config" | "calendario" | "zona">): Date`; `cierrePrevisto(x: { clase: Clase; finPlaneado: string; fechaEvaluacion: string | null; periodicidad: Periodicidad | null; plazoReporteDias: number | null }, c): Date` (`venceLaEvaluacion` de la mínima planeada, más `decision` días hábiles).
  - `huellas.ts`: `type PlanFirmado` (la identificación, la corrección, los análisis, las causas, las dos preguntas, las acciones con sus actividades —el responsable por su id **y** por el nombre con que se firma— y el criterio de eficacia); `huellaDePlan(p: PlanFirmado): string` (SHA-256 de un JSON con las claves en orden fijo; molde: `huellaDeFicha`, `src/lib/indicadores/ficha.ts`).
  - `indicador-de-eficacia.ts` (liviano: lee por SQL, no importa `lectura` de indicadores): `indicadorDeEficacia(sql: Cliente, indicadorId: number): Promise<{ id: number; codigo: string; nombre: string; activo: boolean; periodicidad: Periodicidad; plazoReporteDias: number } | null>`; `indicadoresElegibles(sql: Cliente, sesion: SesionFlujo): Promise<Array<{ id: number; codigo: string; nombre: string; periodicidad: Periodicidad }>>` (activos, con ficha vigente, `filtroIndicadores`).
  - `plan.ts`: `guardarAccion(sesion, d: { hallazgoId: number; accionId?: number; tipo: TipoAccion; descripcion: string; causaIds: number[]; recursos?: string | null; indicadorCumplimiento?: string | null; meta?: string | null; actividades: Array<{ id?: number; descripcion: string; responsableId: number; inicio: string; fin: string }> }, opciones?): Promise<{ id: number }>`; `quitarAccion(sesion, d: { hallazgoId: number; accionId: number }, opciones?)`; `guardarCriterio(sesion, d: { hallazgoId: number; criterios: string[]; criterioOtro?: string | null; indicadorEficaciaId?: number | null; fechaEvaluacion?: string | null }, opciones?)`; `examinarPlan(sql: Cliente, hallazgoId: number, c: ContextoMejora): Promise<{ faltas: string[]; plan: PlanFirmado; huella: string; evaluableDesde: string | null }>`; `usuariosAsignables(sql: Cliente): Promise<Array<{ id: number; nombre: string; cargo: string | null }>>` (activos, con `cargos.nombre`).

**`fechaMinimaDeEficacia`** (spec §11.3): en la no conformidad, **el mayor** entre el día de `sumarMeses(r, 2)` y, si hay periodicidad, el día siguiente al `hasta` del **segundo** periodo que empieza después de `r` (el primero es el siguiente al periodo que contiene `r`: `periodoQueContiene(p, new Date(periodoQueContiene(p, r).hasta.getTime() + 1), zona)`). En la observación y la oportunidad: el mayor entre `fechaEvaluacion` y `r`. Se compara **por día**: `sumarMeses` devuelve el fin del día.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-eficacia.test.ts` (sin base, zona `America/Bogota`):
  - `el ejemplo del spec`: no conformidad, `r = "2026-12-05"`, mensual → `"2027-03-01"`; sin indicador → `"2027-02-05"`.
  - `r el primer día del mes` (`"2026-12-01"`, mensual): diciembre no empieza **después** de `r`; los dos periodos son enero y febrero → `"2027-03-01"`.
  - `r el último día del mes` (`"2026-11-30"`, mensual): diciembre y enero → `"2027-02-01"`.
  - `trimestral` con `r = "2026-12-05"`: los trimestres 1 y 2 de 2027 → `"2027-07-01"`. `anual`: 2027 y 2028 → `"2029-01-01"`.
  - `fin de mes corto`: `r = "2026-12-31"` sin indicador → `"2027-02-28"`.
  - `observación`: `fechaEvaluacion = "2027-01-15"` y `r = "2026-12-05"` → `"2027-01-15"`; con `r = "2027-02-01"` → `"2027-02-01"`.
  - `venceLaEvaluacion("2027-03-01", 10, c)` es el fin del quinto día hábil posterior al `2027-03-11`; con `null`, posterior al `2027-03-01`.
  - `huellaDePlan` no cambia al reordenar las claves del objeto, y cambia al cambiar una fecha, un responsable o el texto de una causa.

  `tests/mejora-plan.test.ts` (con base, dentro de `revertida`):
  - `el caso simple`: una acción con una actividad se guarda en una llamada; `fin_original` queda nula (se fija al aprobar).
  - `guardarAccion` rechaza: sin actividades, «Toda acción lleva al menos una actividad»; `inicio` posterior a `fin`, «El inicio no puede ser posterior al fin»; un responsable inactivo, «El responsable debe ser un usuario activo»; una causa de otra ronda, «Esa causa no es de este hallazgo».
  - `guardar con el hallazgo ya reclasificado` (Review Focus 6): tras reclasificar a oportunidad estando `por_decidir` (queda `por_formular`) el guardado pasa; tras `anular`, o con el hallazgo todavía en `por_decidir`, lanza `YA_CAMBIO` y no escribe ninguna fila.
  - `examinarPlan`, una falta por regla del spec §8.6: sin análisis completo (no conformidad), «Falta el análisis de causa raíz»; sin las dos preguntas, «Responda las dos preguntas de cierre del análisis»; sin ninguna acción correctiva, «El plan de una no conformidad lleva al menos una acción correctiva»; una acción correctiva sin causa, «La acción A1 no dice qué causa ataca»; una causa sin acción ni justificación, «La causa 2 no tiene acción ni justificación»; una actividad con `fin` anterior a hoy, «La actividad … termina en una fecha pasada»; sin criterio de eficacia, «Defina el criterio de eficacia»; `mejora_indicador` sin indicador, «Elija el indicador»; observación sin `fechaEvaluacion`, «Escriba la fecha de evaluación»; una `fechaEvaluacion` anterior al fin de la última actividad, «La evaluación no puede ser anterior al fin de la última actividad». En una oportunidad sin análisis, ninguna falta de análisis.
  - `examinarPlan` de un plan completo devuelve `faltas` vacío, la huella y `evaluableDesde` con la fecha de `fechaMinimaDeEficacia` sobre el mayor `fin`.
  - `el indicador elegible`: uno en borrador o retirado no aparece en `indicadoresElegibles`; uno restringido no aparece para quien no lo ve.

- [ ] **Step 2: Run** `npx vitest run tests/mejora-eficacia.test.ts` y `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-plan.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** los cuatro módulos. `guardarAccion` reemplaza las actividades de la acción conservando los `id` que llegan. Todo guardado pasa por `exigirBorrador`.

- [ ] **Step 4: La pestaña «Plan de acción»** (maqueta 5): una tarjeta por acción con sus actividades en filas; el tipo viene propuesto por `tipoPropuesto`; «Añadir otra actividad» y «Añadir otra acción»; `CriterioDeEficacia` con el aviso «Con este plan la eficacia se podrá evaluar desde el …» (de `examinarPlan`), y la lista de faltas antes del botón de enviar (el envío es la Tarea 13). La página del hallazgo gana la sección «4. Plan de acción» en lectura (`PlanEnLectura`: acción, actividades, responsable, fin, avance y estado).

- [ ] **Step 5: Run** los dos archivos, `tests/mejora-pantallas.test.tsx` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): plan de acción en borrador, fechas de eficacia y huella`.

---

### Task 13: Las firmas del plan: enviar, devolver, revisar y aprobar

**Files:**
- Create: `src/db/consultas/mejoramiento/aprobacion.ts`; en `src/componentes/mejoramiento/plan/`: `PanelDeFirmas.tsx`, `PasoEnviar.tsx`, `PasoRevisar.tsx`, `PasoAprobar.tsx`, `ParecidosDeOtrosProcesos.tsx`; `tests/mejora-aprobacion.test.ts`
- Modify: `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `formular/page.tsx`, `[id]/page.tsx`, `lectura.ts`, `tests/utiles/mejoramiento.ts`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `examinarPlan`, `huellaDePlan`, `cierrePrevisto`, `indicadorDeEficacia` (Tarea 12); `apruebaGerencia` (Tarea 3); `registrarFirma` con `mejoraHallazgoId` (Tarea 2); `verificarParaFirmar`, `CredencialesFirma` (`src/lib/firma.ts`); `adminsActivos` (`src/db/consultas/tramites.ts:346`); `parecidosDeOtrosProcesos` (Tarea 8); `separarFirma`, `destinoDeFirma`, `contextoDePeticion` (como en `src/app/acciones-indicadores.ts:73-149`).
- Produces (en `aprobacion.ts`):
  - `enviarPlan(sesion, d: { hallazgoId: number; credenciales: CredencialesFirma }, opciones?: OpcionesFlujo): Promise<void>` (firma `elaboro`).
  - `devolverPlan(sesion, d: { hallazgoId: number; observaciones: string }, opciones?): Promise<void>` (desde `en_revision`, el Admin SGC; desde `en_aprobacion`, Gerencia).
  - `firmarRevision(sesion, d: { hallazgoId: number; requiereRecursos: boolean; notaRecursos?: string | null; credenciales: CredencialesFirma }, opciones?): Promise<void>` (firma `reviso`).
  - `aprobarPlan(sesion, d: { hallazgoId: number; credenciales: CredencialesFirma }, opciones?): Promise<void>` (firma `aprobo`).
  - `firmasDeHallazgo(sql: Cliente, hallazgoId: number): Promise<Array<{ firma: Firma; ronda: number; nombre: string; cargo: string | null; cuando: Date; huella: string }>>`.
  - `tests/utiles/mejoramiento.ts`: `hallazgoEn` gana `"en_revision"`, `"en_aprobacion"` y `"en_ejecucion"`, y `planDePrueba(tx, base, hallazgoId, x?: { actividades?: number; responsableId?: number; fin?: string; indicadorId?: number })`.

**Lo que pasa al quedar aprobado** (función privada `dejarAprobado`, llamada por `firmarRevision` cuando no aplica Gerencia y por `aprobarPlan`; spec §8.6): `mejora_rondas.estado_plan = 'aprobado'`, `aprobado_por`, `aprobado_en` y `aprobado_rol` (`admin_sgc` o `gerencia`); `fin_original = fin` en cada actividad; `cierre_previsto` con `cierrePrevisto`; el evento de la transición lleva `detalle.plan` (el `PlanFirmado` completo) y `detalle.huella`; un aviso `mejora.actividad_asignada` a cada responsable (título «Tiene una actividad a su cargo», sin el contenido del hallazgo en el cuerpo: la descripción de la actividad y su fin); y, si el origen es externo, nada más aquí (la tarea de la respuesta al ente la calcula la Tarea 19).

- [ ] **Step 1: Write the failing tests** `tests/mejora-aprobacion.test.ts` (con base, dentro de `revertida`; firma con `firmaDePrueba`):
  - `enviar un plan con faltas` lanza la primera falta de `examinarPlan`. `enviar` uno completo: queda `en_revision`, `estado_plan = 'enviado'`, `enviado_en = ahora`, una firma `elaboro` con `ronda = 1`, `mejora_hallazgo_id` y la huella de `examinarPlan`.
  - `la clave equivocada no escribe nada`: con un verificador que falla, `ErrorFirma`, y ni firma ni evento ni cambio de estado.
  - `devolver` → `por_formular`, `estado_plan = 'borrador'`, `vence_en = venceEn("reenviar", ahora)`, y `enviado_en` **no cambia** al reenviar (es la primera vez la que mide «Planes formulados a tiempo»). El reenvío exige otra firma `elaboro`, con la huella nueva si el plan cambió.
  - `las cuatro condiciones de Gerencia`, una por prueba: criticidad alta; origen `auditoria_externa`; `requiereRecursos` marcado al revisar; y ninguna → tras `firmarRevision` queda `en_ejecucion` con `aprobado_rol = 'admin_sgc'`.
  - `cuando elabora un Admin SGC` (proceso sin líder): con otro Admin SGC activo, el envío queda `en_revision` y quien elaboró no puede firmar la revisión (`ErrorPermiso`); sin otro Admin SGC, el envío queda directo `en_aprobacion`, sin firma `reviso`.
  - `aprobar`: queda `en_ejecucion`; cada actividad tiene `fin_original = fin`; `cierre_previsto` es el de `cierrePrevisto`; el evento lleva `detalle.plan` y una huella igual a la de las tres firmas; cada responsable recibe su aviso. Un Admin SGC no aprueba (`ErrorPermiso`).
  - `dos envíos a la vez` (Review Focus 4): el segundo `enviarPlan` sobre el mismo hallazgo lanza `YA_CAMBIO` y queda una sola firma `elaboro`.
  - `el plan cambió entre el validador y la transacción`: si otra sesión guarda una acción después de verificada la clave, la transacción lo detecta (la huella de dentro no es la de fuera) y lanza `YA_CAMBIO`.
  - `un responsable desactivado antes de aprobar`: `aprobarPlan` lanza «El responsable de la actividad … ya no está activo: devuelva el plan».

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-aprobacion.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente `aprobacion.ts`** con el patrón de `aprobarFichas`: `validarX(sql, …)` de solo lectura; `verificar(sesion, credenciales, contexto, ahora)` **fuera** de la transacción; dentro, `bloquearHallazgo`, `validarX(tx, …)` otra vez, las escrituras, `registrarFirma` y `transicionarHallazgo`. El rumbo: `enviar_plan` con `saltaRevision` cuando elaboró un Admin SGC y no hay otro activo; `revisar_plan` con `apruebaGerencia` de `apruebaGerencia(h, { requiereRecursos, elaboroAdmin })`.

- [ ] **Step 4: La interfaz.** `PanelDeFirmas` (las tres firmas con su estado y su plazo, maqueta 5); `PasoEnviar` con `DialogoFirma` (`src/componentes/tramites/DialogoFirma.tsx`, con `pideCodigo={sesion.totpActivo}`); `PasoRevisar`: las causas sin acción, `ParecidosDeOtrosProcesos`, la casilla «Requiere recursos adicionales o tiene impacto institucional» con su nota, «Devolver con observaciones» y «Firmar la revisión»; `PasoAprobar`. Las acciones separan la clave con `separarFirma` y van con `mejora.formular`, `mejora.gestionar` y `mejora.aprobar`.

- [ ] **Step 5: Run** el archivo, `tests/mejora-pantallas.test.tsx`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): firmas del plan de acción y lo que queda congelado al aprobar`.

**Punto de control 3 (controlador):** formular con dos métodos, enviar con clave, devolver, reenviar, revisar y aprobar como Gerencia, contra las maquetas 4 y 5.

---

### Task 14: Las actividades: seguimientos, evidencia, terminar y reasignar

**Files:**
- Create: `src/db/consultas/mejoramiento/actividades.ts`; `src/app/(app)/mejoramiento/actividades/page.tsx`, `actividades/[id]/page.tsx`; en `src/componentes/mejoramiento/actividad/`: `PaginaDeActividad.tsx`, `FormularioSeguimiento.tsx`, `ListaDeSeguimientos.tsx`, `DialogoReasignar.tsx`, `MisActividades.tsx`; `tests/mejora-actividades.test.ts`
- Modify: `src/lib/alcance.ts`, `_comun.ts` (`exigirActividad`), `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `lectura.ts`, `[id]/page.tsx`, `mejoramiento/page.tsx` (la redirección), `PestanasMejoramiento.tsx`, `tests/utiles/mejoramiento.ts`

**Interfaces:**
- Consumes: `transicionarHallazgo`, `bloquearHallazgo`, `dejarEvento`, `avisarDeMejora` (Tarea 5); `archivosDe` (Tarea 9); `hallazgoEn(…, "en_ejecucion")` (Tarea 13).
- Produces:
  - `actividades.ts`: `type DetalleDeActividad` (la actividad, su acción, el encabezado del hallazgo, sus seguimientos, sus archivos, `esResponsable`, `responsableActivo`, `ajustePendiente`); `leerActividad(sesion: SesionFlujo, id: number, opciones?): Promise<DetalleDeActividad | null>` (nulo si no ve el hallazgo); `misActividades(sesion, opciones?): Promise<Array<{ id; descripcion; hallazgoCodigo; fin: string; avance: number; estado: EstadoActividad; vencida: boolean; devuelta: boolean }>>`; `registrarSeguimiento(sesion, d: { actividadId: number; fecha: string; realizado: string; avance: number; barreras?: string | null }, opciones?): Promise<{ id: number }>`; `terminarActividad(sesion, d: { actividadId: number }, opciones?): Promise<void>`; `reasignarActividad(sesion, d: { actividadId: number; responsableId: number; motivo: string }, opciones?): Promise<void>`; `avanceDeAccion(actividades: Array<{ avance: number; estado: EstadoActividad }>): number | null` y `avanceDeHallazgo(acciones: Array<number | null>): number | null` (puras, exportadas: el promedio simple sin las canceladas, redondeado).
  - `_comun.ts`: `exigirActividad(sesion: SesionValida, segmento: string): Promise<DetalleDeActividad>`.
  - `tests/utiles/mejoramiento.ts`: `terminarTodas(tx, base, hallazgoId, ahora: string)` (seguimiento, archivo y terminar por cada actividad) y `hallazgoEn(…, "por_verificar")`.

**Reglas** (spec §10.2 a §10.4): solo con el hallazgo `en_ejecucion`. El seguimiento lo registra el responsable de la actividad: fecha no futura, `realizado` de al menos 10 caracteres, avance entero de 0 a 100 y **no menor que el del anterior**, salvo que la actividad esté devuelta (`verificacion = 'devuelta'`). Pasa la actividad a `en_proceso` y actualiza `avance` y `recordatorio_en` (lo borra). Terminar exige `avance = 100` y al menos un archivo del contexto `mejora_actividad` de **esa** actividad; escribe `terminada_en`, `terminada_por` y borra `verificacion`, `verificacion_nota` y `corregir_antes_de`. Cuando no queda ninguna actividad del hallazgo en `abierta` ni `en_proceso`, llama `transicionarHallazgo(…, "completar")` en la misma transacción. Reasignar: un líder del proceso o el Admin SGC; actividad sin terminar; responsable nuevo activo y distinto; motivo de al menos 10 caracteres; aviso a los dos; y el evento `reasignada`, con esta forma exacta de `detalle`, que la Tarea 16 lee para saber quién **fue** responsable: `{ actividadId: number, antes: number, despues: number, motivo: string }` (`antes` y `despues` son ids de usuario).

- [ ] **Step 1: Write the failing tests** `tests/mejora-actividades.test.ts` (con base, dentro de `revertida`):
  - `avanceDeAccion` y `avanceDeHallazgo` (sin base): `[40, 100]` → 70; una cancelada no cuenta; todas canceladas → `null`.
  - `el responsable registra un seguimiento`: la actividad pasa a `en_proceso`, el avance sube y la fila de `mejora_seguimientos` queda; otra persona, aunque lidere el proceso, recibe `ErrorPermiso`.
  - `el avance no baja`: de 40 a 30 lanza «El avance no puede ser menor que el del seguimiento anterior (40 %)».
  - `terminar sin evidencia` lanza «Adjunte al menos un archivo de evidencia antes de terminar»; con avance 90, «Registre el avance en 100 % antes de terminar»; con las dos cosas, queda `terminada` con `terminada_en = ahora`.
  - `la última actividad lleva el hallazgo a por_verificar`, con `vence_en = venceEn("verificar", ahora)`; con una actividad `cancelada` y las demás terminadas, también.
  - `reasignar`: el anterior deja de verla en `misActividades` y el nuevo la ve; si el anterior registró un seguimiento, conserva la lectura del hallazgo (`participacionEnHallazgo` = `"actividad"`); si no registró ninguno, la pierde. Un responsable no se reasigna a sí mismo (`ErrorPermiso`).
  - `un responsable desactivado` (Review Focus 2): su actividad sigue en `leerHallazgo` para el líder, con `responsableActivo: false`, y `reasignarActividad` funciona.
  - `quien ve el hallazgo como "actividad"` recibe en `leerHallazgo` el texto (identificación, corrección, análisis, plan) y **ninguna** lista de archivos que no sea de su actividad.
  - `fuera de en_ejecucion` (hallazgo `en_espera`): `registrarSeguimiento` lanza `YA_CAMBIO`.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-actividades.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente `actividades.ts` y `exigirActividad`.** Orden de candados: el hallazgo (`bloquearHallazgo`) y después la actividad `FOR UPDATE`.

- [ ] **Step 4: Las páginas** (maqueta 6, pensada a 390 px): `/mejoramiento/actividades` («Mis actividades», toda sesión) y `/mejoramiento/actividades/[id]` (`exigirActividad`): qué hay que hacer, de qué acción y de qué hallazgo («Ver el hallazgo»), la barra de avance, `FormularioSeguimiento` con `AVISO_SIN_PACIENTES` y `ZonaCarga`, «Terminar» y la lista de seguimientos. Una actividad devuelta muestra la nota de quien verificó y la fecha para corregir. `/mejoramiento` redirige a «Mis actividades» a quien no ve ningún hallazgo completo y tiene alguna actividad. En la página del hallazgo, cada actividad enlaza a la suya, y las de un responsable inactivo llevan la insignia «Responsable inactivo» con «Reasignar».

- [ ] **Step 5: Run** el archivo, `tests/mejora-pantallas.test.tsx`, `tests/paginas-sesion.test.ts`, `tests/acciones-permisos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): actividades: seguimientos, evidencia, terminar y reasignar`.

---

### Task 15: Ajustes al plan aprobado y escalar a Gerencia

**Files:**
- Create: `src/db/consultas/mejoramiento/ajustes.ts`; en `src/componentes/mejoramiento/ajustes/`: `DialogoPedirAjuste.tsx`, `PasoDecidirAjuste.tsx`, `AjustesDelPlan.tsx`, `DialogoEscalar.tsx`; `tests/mejora-ajustes.test.ts`
- Modify: `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `lectura.ts`, `actividades.ts` (`ajustePendiente`), `[id]/page.tsx`, `PaginaDeActividad.tsx`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `transicionarHallazgo`, `bloquearHallazgo`, `dejarEvento`, `avisarDeMejora`, `legible` (Tarea 5); `venceEn` (Tarea 4); `adminsActivos`; `hallazgoEn(…, "en_ejecucion")`.
- Produces (en `ajustes.ts`):
  - `pedirAjuste(sesion, d: { hallazgoId: number; tipo: "reprogramar" | "agregar" | "cancelar"; actividadId?: number; finNuevo?: string; nueva?: { accionId?: number; accion?: { tipo: TipoAccion; descripcion: string; causaIds: number[] }; descripcion: string; responsableId: number; inicio: string; fin: string }; causa: string }, opciones?): Promise<{ id: number }>`.
  - `quienDecideAjustes(tx: Cliente, hallazgoId: number, pedidoPor: number): Promise<{ rol: "admin_sgc" | "gerencia"; usuarios: number[] }>`.
  - `decidirAjuste(sesion, d: { ajusteId: number; aprueba: boolean; nota?: string | null; acta?: { numero: string; fecha: string } | null }, opciones?): Promise<void>`.
  - `escalarAGerencia(sesion, d: { actividadId: number; nota: string }, opciones?): Promise<void>`; `responderEscalada(sesion, d: { actividadId: number; nota: string; acta?: { numero: string; fecha: string } | null }, opciones?): Promise<void>`.

**Reglas** (spec §10.6 y §10.7): con el hallazgo `en_ejecucion` o `por_verificar`. Pide: el responsable (solo `reprogramar` la suya), un líder del proceso o el Admin SGC; causa de al menos 10 caracteres; `finNuevo` de hoy en adelante; actividad sin terminar ni cancelar. Decide el rol de `mejora_rondas.aprobado_rol` de la ronda en curso (`gerencia` → cualquier usuario de Gerencia; `admin_sgc` → un Admin SGC); **quien pidió no decide**, y si lo pidió el único Admin SGC activo, decide Gerencia. Plazo: `venceEn("decision", ahora)`. Al aprobarse: `reprogramar` cambia `fin`, suma `reprogramaciones` y borra `aviso_vencido_en`, `escalado_en` y `gerencia_en`; `agregar` inserta la actividad (y la acción, si es nueva) con `fin_original = fin` y avisa a su responsable; `cancelar` deja la actividad `cancelada` con `cancelada_en`. Después llama `transicionarHallazgo(…, "ajustar", { rumbo: { quedaEn } })`, con `quedaEn` = `en_ejecucion` si quedó alguna actividad sin terminar, o `por_verificar` si no. **Nunca** toca `fin_original` de una actividad existente, `cierre_previsto` ni el evento con el plan congelado.

- [ ] **Step 1: Write the failing tests** `tests/mejora-ajustes.test.ts` (con base, dentro de `revertida`):
  - `quién pide`: el responsable reprograma la suya y no la de otro (`ErrorPermiso`); no puede `agregar` ni `cancelar`; un líder y el Admin SGC, los tres tipos. Causa corta, «La causa debe tener al menos 10 caracteres». `finNuevo` pasado, «La fecha nueva debe ser de hoy en adelante».
  - `un solo pendiente por actividad`: el segundo lanza «Ya hay un ajuste por decidir para esa actividad» (el `23505` del índice, traducido).
  - `quién decide`: plan aprobado por Gerencia → un Admin SGC recibe `ErrorPermiso` y Gerencia decide; plan aprobado por el Admin SGC → decide un Admin SGC; el Admin SGC que lo pidió no lo decide, y otro sí; si es el único Admin SGC activo, decide Gerencia.
  - `reprogramar aprobado`: `fin` cambia, `fin_original` no, `reprogramaciones = 1`, las marcas quedan nulas y la actividad deja de salir vencida en `misActividades`. **Mientras está pendiente sigue vencida.**
  - `agregar` con el hallazgo `por_verificar` lo devuelve a `en_ejecucion`; la actividad nueva tiene `fin_original = fin` y su responsable recibe el aviso.
  - `cancelar la última sin terminar` lleva a `por_verificar`; cancelar la única actividad no cancelada lanza «No se puede cancelar la única actividad del hallazgo».
  - `negar`: el ajuste queda `negado` con su nota y nada más cambia.
  - `lo congelado no cambia`: tras los tres ajustes, `cierre_previsto` es el mismo y el `detalle.plan` del evento de aprobación, idéntico byte a byte.
  - `dos decisiones a la vez` (Review Focus 4): la segunda lanza «Ese ajuste ya se decidió».
  - `escalar`: solo una actividad vencida («Solo se escala una actividad vencida»); deja `gerencia_en`, un evento `escalada` y un aviso `mejora.escalada` a cada usuario de Gerencia; no cambia ningún estado. `responderEscalada` deja el evento con la nota y el acta.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-ajustes.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente `ajustes.ts`.** Candados: el hallazgo, después el ajuste `FOR UPDATE`, después la actividad.

- [ ] **Step 4: La interfaz.** En la actividad, «Pedir ajuste de fecha» (maqueta 6, con la nota «Mientras se decide, la actividad sigue contando como vencida»); en la página del hallazgo, «Pedir un ajuste» (añadir o cancelar), la lista «Ajustes del plan» (qué se pidió, por qué, quién decidió y cuándo), `PasoDecidirAjuste` en «Lo que sigue» de quien decide, «Escalar a Gerencia» en una actividad vencida (solo `mejora.gestionar`) y la marca «Escalada a Gerencia el …». Acciones: `mejora.ejecutar` para pedir (la condición de persona la pone el dominio); `mejora.gestionar` y `mejora.aprobar` para decidir (dos acciones exportadas).

- [ ] **Step 5: Run** el archivo, `tests/mejora-pantallas.test.tsx`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): ajustes al plan aprobado y escalada a Gerencia`.

---

### Task 16: Verificar la implementación, evaluar la eficacia, cerrar y reabrir

**Files:**
- Create: `src/db/consultas/mejoramiento/verificacion.ts`, `tests/mejora-verificacion.test.ts`
- Modify: `src/lib/alcance.ts`, `src/lib/mejoramiento/huellas.ts`, `src/db/consultas/mejoramiento/flujo.ts` (la ronda nueva), `src/db/consultas/mejoramiento/archivos.ts` (el rol `verificacion` pasa a exigir `puedeVerificar`, con su caso en `tests/mejora-archivos.test.ts`), `src/lib/esquemas/mejoramiento.ts`, `tests/utiles/mejoramiento.ts`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `fechaMinimaDeEficacia`, `venceLaEvaluacion`, `indicadorDeEficacia` (Tarea 12); `registrarFirma` (Tarea 2); `transicionarHallazgo` (Tarea 5); `hallazgoEn(…, "por_verificar")` (Tarea 14); `tablaDelAnio` (`src/db/consultas/indicadores/lectura.ts:749`) o `basesDe` con `leerPeriodos` (`:627`, `:660`), para leer resultados por periodo.
- Produces:
  - `alcance.ts`: `puedeVerificar(hallazgoId: number, sujeto: SujetoVisibilidad, opciones?: { sql?: Cliente }): Promise<boolean>`; `quienesVerifican(sql: Cliente, hallazgoId: number): Promise<number[]>`.
  - `huellas.ts`: `huellaDeEvaluacion(e: { huellaDelPlan: string; resultado: string; criterios: string[]; desde: string; hasta: string; justificacion: string; visto: unknown }): string`; `huellaDeCierre(c: { huellaDeLaEvaluacion: string; resultado: string; lecciones: string; cambiosAtendidos: string | null }): string`.
  - `flujo.ts`: `transicionarHallazgo` acepta `x.nuevaRonda?: boolean`: con él, suma uno a `mejora_hallazgos.ronda` e inserta la fila de `mejora_rondas` con `formular_antes_de = venceEn("formular", ahora)`.
  - `verificacion.ts`: `METODOS_DE_VERIFICACION = ["evidencias", "observacion", "auditoria", "entrevista"] as const`; `verificarImplementacion(sesion, d: { hallazgoId: number; actividades: Array<{ id: number; conforme: boolean; nota?: string | null; corregirAntesDe?: string | null }>; metodos: string[]; nota?: string | null }, opciones?): Promise<void>`; `fechaMinimaDe(sql: Cliente, hallazgoId: number, zona: string): Promise<{ minima: string; r: string; indicador: { id: number; codigo: string; nombre: string; periodicidad: Periodicidad; plazoReporteDias: number } | null; indicadorRetirado: boolean } | null>` (nulo si la ronda no está en espera); `datosDeEvaluacion(sesion, hallazgoId: number, opciones?): Promise<{ minima: string; yaSePuede: boolean; criterios: string[]; indicador: { codigo: string; nombre: string; filas: Array<{ periodo: string; etiqueta: string; resultado: string | null; semaforo: string | null; momento: "antes" | "durante" | "despues" }> } | null; ocurrencias: Array<{ fecha: string; descripcion: string }> }>`; `evaluarEficacia(sesion, d: { hallazgoId: number; resultado: "eficaz" | "no_eficaz"; criterios: string[]; desde: string; hasta: string; justificacion: string; confirmaOcurrencias?: boolean; lecciones?: string | null; cambiosAtendidos?: string | null; credenciales: CredencialesFirma }, opciones?): Promise<void>`; `cerrarHallazgo(sesion, d: { hallazgoId: number; lecciones: string; cambiosAtendidos?: string | null; credenciales: CredencialesFirma }, opciones?): Promise<void>`.
  - `tests/utiles/mejoramiento.ts`: `hallazgoEn` gana `"en_espera"`, `"por_cerrar"` y `"cerrado"`.

**`puedeVerificar`** (spec §11.1): la persona tiene `mejora.verificar` y **no ejecutó**: no es ni fue responsable de ninguna actividad del hallazgo (en cualquier ronda), no registró ningún seguimiento, no terminó ninguna actividad, no registró la corrección ni es su responsable. Para saber quién **fue** responsable se leen los eventos `reasignada` (`detalle.antes`). Admin SGC y Control Interno, con eso; Gerencia, solo si **ningún** Admin SGC ni Control Interno activo lo cumple. `quienesVerifican` devuelve a quienes pueden.

**Verificar** (spec §11.4): en `por_verificar`; un acto con todas las actividades terminadas decididas; al menos un método. Devolver una: nota de al menos 10 caracteres y `corregirAntesDe` de hoy en adelante; la actividad vuelve a `en_proceso` con `verificacion = 'devuelta'`, su nota y su fecha, y `terminada_en` nulo; el hallazgo, a `en_ejecucion`. Todas conformes: `verificada_por`, `verificada_en`, los métodos y la nota en la ronda; el hallazgo, a `en_espera`. Sin firma con clave.

**Evaluar** (spec §11.4 y §11.5): en `en_espera`; `puedeVerificar`; justificación de al menos 20 caracteres; firma `verifico` (F13A-R4) con `huellaDeEvaluacion`; el evento guarda en `detalle.visto` lo que `datosDeEvaluacion` mostró. «Eficaz» solo si el día de hoy en la zona es igual o posterior a `minima`; con ocurrencias posteriores a R exige `confirmaOcurrencias`; el criterio `mejora_indicador` no se puede marcar como evaluado si el indicador se retiró. Si quien evalúa tiene el rol Admin SGC, `lecciones` es obligatoria y el mismo acto cierra, con una segunda firma `cerro` (rumbo `verificaAdmin`); si no, pasa a `por_cerrar`. «No eficaz», en cualquier momento: la ronda queda con `resultado = 'no_eficaz'` y se abre la siguiente (`nuevaRonda`).

**Cerrar:** en `por_cerrar`; `mejora.gestionar`; lecciones de al menos 10 caracteres; si `mejora_rondas.cambios` marcó documentos, riesgos o controles, `cambiosAtendidos` de al menos 10 caracteres; firma `cerro` con `huellaDeCierre`; `cerrado_en`, `cerrado_por`, `resultado_cierre = 'eficaz'`; avisos `mejora.cerrado` a los líderes del proceso, a quien lo registró y a cada usuario de Gerencia. Todas las columnas del cierre se escriben **antes** de la transición.

- [ ] **Step 1: Write the failing tests** `tests/mejora-verificacion.test.ts` (con base, dentro de `revertida`):
  - `puedeVerificar`, una prueba por forma de haber ejecutado: el responsable actual; quien lo fue y lo reasignaron; quien registró un seguimiento; quien registró la corrección; el responsable de la corrección. Un Admin SGC y un Control Interno que no ejecutaron, sí. Un líder, no (no tiene el permiso). Gerencia, no mientras otro pueda, y sí cuando ninguno puede.
  - `nadie puede`: con el único Admin SGC como responsable y sin Control Interno ni Gerencia activos, `verificarImplementacion` lanza «Nadie puede verificar este hallazgo: quienes tienen el rol participaron en su ejecución».
  - `verificar`: falta decidir una actividad, «Marque cada actividad como conforme o devuélvala»; sin método, «Indique cómo verificó»; devolver una → esa actividad `en_proceso` con su nota y su fecha, `fin_original` intacto, y el hallazgo `en_ejecucion`; todas conformes → `en_espera`.
  - `eficaz antes de la fecha` lanza «La eficacia se puede evaluar desde el 5 de febrero de 2027» (con `r = 2026-12-05` y sin indicador); el mismo día 5, pasa.
  - `no eficaz en cualquier momento`: la ronda 1 queda `no_eficaz`, el hallazgo `por_formular` con `ronda = 2`, la ronda 2 con `formular_antes_de = venceEn("formular", ahora)` y `estado_plan = 'borrador'`; las filas de la ronda 1 no cambian; una firma `verifico` con `ronda = 1`.
  - `eficaz por Control Interno` → `por_cerrar` con su firma `verifico`; `cerrarHallazgo` del Admin SGC → `cerrado` / `eficaz`, firma `cerro`, y avisos a los líderes, al registrador y a Gerencia. Sin lecciones, «Escriba las lecciones aprendidas».
  - `eficaz por el Admin SGC` cierra en el mismo acto, con las dos firmas y una sola verificación de la clave.
  - `el análisis pidió cambios`: con `cambios.documentos = true`, cerrar sin `cambiosAtendidos` lanza «Diga cómo se atendieron los cambios que el análisis pidió».
  - `ocurrencias posteriores`: «Eficaz» sin `confirmaOcurrencias` lanza «Hay 1 ocurrencia posterior a la implementación: confírmelo para registrar la eficacia».
  - `el indicador`: con uno mensual enlazado, `fechaMinimaDe` da el `2027-03-01`; retirado, `2027-02-05` e `indicadorRetirado: true`, y marcar `mejora_indicador` lanza «El indicador se retiró: evalúe con otro criterio»; si su ficha vigente pasa a trimestral, la mínima se recalcula; con sus periodos sin dato, `datosDeEvaluacion` los trae con `resultado: null` y no bloquea.
  - `lo congelado`: el evento de la evaluación lleva `detalle.visto` con las filas del indicador (`antes`, `durante`, `despues`) y las ocurrencias.
  - `dos evaluaciones a la vez` (Review Focus 4): la segunda lanza `YA_CAMBIO` y queda una sola firma `verifico`.
  - `un hallazgo cerrado no cambia`: `registrarOcurrencia` y `pedirAjuste` lanzan una frase legible, nunca el `42501` crudo.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-verificacion.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** `puedeVerificar`, `quienesVerifican`, las dos huellas, `nuevaRonda` y `verificacion.ts`. R es el mayor `terminada_en` de las actividades no canceladas de la ronda, pasado a día con `fechaEnZona`. Las filas del indicador van desde dos periodos antes del que contiene R hasta el último medido.

- [ ] **Step 4: Run** el archivo, `tests/mejora-aprobacion.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15a): verificación de la implementación, eficacia, cierre y rondas`.

---

### Task 17: La interfaz de verificar, evaluar y cerrar; las rondas y el hallazgo derivado

**Files:**
- Create: en `src/componentes/mejoramiento/pasos/`: `PasoVerificar.tsx`, `PasoEvaluar.tsx`, `PasoCerrar.tsx`; `SeccionVerificacion.tsx`, `SeccionCierre.tsx`, `RondaAnterior.tsx`, `FechasDelHallazgo.tsx`, `EnlacesDelHallazgo.tsx`
- Modify: `src/app/acciones-mejoramiento.ts`, `src/db/consultas/mejoramiento/registro.ts` (`derivadoDe`), `lectura.ts`, `[id]/page.tsx`, `nuevo/page.tsx`, `FormularioHallazgo.tsx`, `tests/mejora-pantallas.test.tsx`, `tests/mejora-registro.test.ts`

**Interfaces:**
- Consumes: `verificarImplementacion`, `datosDeEvaluacion`, `evaluarEficacia`, `cerrarHallazgo`, `puedeVerificar` (Tarea 16); `firmasDeHallazgo` (Tarea 13); `puedeVerIndicador`.
- Produces: `registrarHallazgo` acepta `derivadoDe?: number | null` (un hallazgo que quien registra puede ver); `/mejoramiento/nuevo?derivado=<id>` llega con el proceso y el enlace puestos; `leerHallazgo` trae `rondasAnteriores`, `fechas: { planFormulado: { cuando: Date; aTiempo: boolean } | null; cierrePrevisto: Date | null; evaluableDesde: string | null; reprogramaciones: { aprobadas: number; pedidas: number } }` y `enlaces` (cada uno con su nombre **solo si la persona puede verlo**; si no, `{ visible: false, clase: "indicador" | "documento" | "norma" }`).

- [ ] **Step 1: Write the failing tests.** En `tests/mejora-pantallas.test.tsx`:
  - `PasoVerificar`: una fila por actividad con «Conforme» y «Devolver»; al elegir «Devolver» aparecen la nota y la fecha; los cuatro métodos como casillas.
  - `PasoEvaluar`: antes de la fecha mínima, «Eficaz» está deshabilitado con el texto «Se puede registrar desde el …» y «No eficaz» está disponible; pinta la tabla del indicador con «antes», «durante» y «después» **como texto**; con ocurrencias posteriores, la casilla de confirmación; lleva `AVISO_SIN_PACIENTES`.
  - `PasoEvaluar` para un Admin SGC pide además las lecciones aprendidas; para Control Interno, no.
  - `RondaAnterior`: «Ronda 1 · no eficaz», plegada, con su causa, su plan y su evaluación en lectura.
  - `EnlacesDelHallazgo`: un indicador que la persona no ve sale como «un indicador», sin código, sin nombre y sin enlace.

  En `tests/mejora-registro.test.ts`: `derivadoDe` de un hallazgo que quien registra no ve lanza «El hallazgo de origen no existe»; con uno que ve, queda enlazado y la página de los dos lo muestra.

- [ ] **Step 2: Run** `npx vitest run tests/mejora-pantallas.test.tsx` y `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-registro.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** (maqueta 7 y la columna derecha de la maqueta 2). Las acciones `verificarImplementacionAccion`, `evaluarEficaciaAccion` (con `separarFirma`) y `cerrarHallazgoAccion`, con `mejora.verificar` y `mejora.gestionar`. La página del hallazgo queda completa: las secciones 1 a 7 en el orden del SGC-FO-AC-01 (las hechas, plegadas con su resumen de una línea; la actual, abierta; las que faltan no aparecen), las rondas anteriores plegadas, y a la derecha «Lo que sigue», las fechas, los enlaces y las ocurrencias. En la evaluación, «Registrar un hallazgo distinto» lleva a `/mejoramiento/nuevo?derivado=<id>`.

- [ ] **Step 4: Run** los dos archivos, `tests/acciones-permisos.test.ts`, `tests/colores-fijos.test.ts`, `tests/frontera-cliente.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15a): pantallas de verificar, evaluar y cerrar, rondas anteriores y hallazgo derivado`.

**Punto de control 4 (controlador):** un hallazgo sembrado a mano en `en_ejecucion`: registrar seguimientos como rol Consulta, terminar, verificar como Control Interno (devolver una), y ver la pantalla de evaluar con «Eficaz» deshabilitado; contra las maquetas 6 y 7.

---

### Task 18: Los reportes de funcionarios

**Files:**
- Create: `src/db/consultas/mejoramiento/reportes.ts`; `src/app/(app)/mejoramiento/reportar/page.tsx`, `reportes/page.tsx`; en `src/componentes/mejoramiento/reportes/`: `FormularioReporte.tsx`, `MisReportes.tsx`, `ReportesRecibidos.tsx`, `ClasificarReporte.tsx`; `tests/mejora-reportes.test.ts`
- Modify: `src/db/consultas/mejoramiento/registro.ts` (`reporteId`), `lectura.ts` (`reportadoPor`), `verificacion.ts` y `recorrido.ts` (el aviso a quien reportó al cerrar), `src/app/acciones-mejoramiento.ts`, `nuevo/page.tsx`, `mejoramiento/page.tsx`, `PestanasMejoramiento.tsx`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `registrarHallazgo`, `registrarOcurrencia` (Tareas 5 y 8); `venceEn` (Tarea 4); `autorizarSubida` para `mejora_reporte` (Tarea 9).
- Produces (en `reportes.ts`):
  - `enviarReporte(sesion, d: { descripcion: string; vistoEn: string; procesoId?: number | null; referenciaCaso?: string | null }, opciones?): Promise<{ id: number }>`.
  - `misReportes(sesion, opciones?): Promise<Array<{ id: number; cuando: Date; descripcion: string; etiqueta: "Recibido" | "En trámite" | "Cerrado" | "Descartado"; motivo: string | null }>>` (**sin** código ni título del hallazgo).
  - `reportesRecibidos(sesion, opciones?): Promise<Array<{ id; cuando; reportadoPor: string; descripcion; proceso: string | null; estado; vence: Date }>>` (`mejora.ver_todo`).
  - `leerReporte(sesion, id: number, opciones?)` (quien reportó o `mejora.ver_todo`; si no, `null`).
  - `descartarReporte(sesion, d: { reporteId: number; motivo: string }, opciones?)`; `sumarReporte(sesion, d: { reporteId: number; hallazgoId: number }, opciones?)` (lo añade como ocurrencia con `origen: "reporte"`).
  - `registrarHallazgo` con `reporteId` (solo `mejora.gestionar`) deja el reporte `convertido` con su `hallazgo_id`, en la misma transacción.
  - `leerHallazgo`: `reportadoPor: string | null` (el nombre, solo con `mejora.ver_todo`) y `naceDeUnReporte: boolean`.

- [ ] **Step 1: Write the failing tests** `tests/mejora-reportes.test.ts` (con base, dentro de `revertida`):
  - `cualquier rol reporta`, también Consulta; queda `recibido`, con `vence_en = venceEn("clasificar", ahora)` y un aviso `mejora.reporte_recibido` a cada Admin SGC. Descripción de menos de 10 caracteres, «Cuente qué vio, en al menos 10 caracteres».
  - `quien reportó ve su reporte y nada del hallazgo` (Review Focus 1): tras convertirlo, `misReportes` trae «En trámite» y ningún campo con el código ni el título; `leerHallazgo` del hallazgo, para quien reportó, es `null`; `puedeVerHallazgo`, falso.
  - `convertir`: solo `mejora.gestionar`; el plazo de formular corre desde la conversión, no desde el reporte; quien reportó recibe el aviso «Su reporte fue recibido y está en trámite», sin enlace al hallazgo.
  - `la identidad de quien reportó`: `leerHallazgo` para el líder trae `reportadoPor: null` y `naceDeUnReporte: true`; para el Admin SGC, el nombre.
  - `sumar a un hallazgo abierto`: una ocurrencia con `origen = 'reporte'` y el reporte `sumado`. `descartar` sin motivo de 10 caracteres se rechaza; con él, queda `descartado` y quien reportó lee el motivo.
  - `un reporte clasificado no se clasifica dos veces`: «Ese reporte ya se clasificó».
  - `al cerrarse el hallazgo`, la etiqueta pasa a «Cerrado» y quien reportó recibe un aviso.
  - `otro funcionario no ve reportes ajenos`: `leerReporte` da `null`.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-reportes.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** `reportes.ts` y los cambios de `registro.ts` y `lectura.ts`. Cada paso de un reporte deja su fila en `mejora_reporte_eventos`.

- [ ] **Step 4: Las páginas.** `/mejoramiento/reportar` (toda sesión): el formulario con `AVISO_SIN_PACIENTES` y, enviado, hasta tres archivos. `/mejoramiento/reportes`: «Mis reportes» para todos y, con `mejora.ver_todo`, «Reportes recibidos»; clasificar (solo `mejora.gestionar`) ofrece «Convertir en hallazgo» (lleva a `/mejoramiento/nuevo?reporte=<id>`, con la descripción, el proceso y la referencia copiados), «Añadir a un hallazgo abierto» (con los parecidos del proceso) y «Descartar». `/mejoramiento` redirige a «Mis reportes» a quien no ve hallazgos ni tiene actividades. En la página del hallazgo, «Reportado por un funcionario» o el nombre, según quién mira.

- [ ] **Step 5: Run** el archivo, `tests/mejora-pantallas.test.tsx`, `tests/paginas-sesion.test.ts`, `tests/acciones-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): reportes de funcionarios y su clasificación`.

---

### Task 19: Tareas, avisos y la pasada de vencimientos

**Files:**
- Create: `src/db/consultas/mejoramiento/tareas.ts`, `vencimientos.ts`; `tests/mejora-tareas.test.ts`, `tests/mejora-vencimientos.test.ts`
- Modify: `src/lib/tareas.ts` (`misTareas`, `GRUPOS`), `src/db/consultas/vencimientos.ts` (`revisarVencimientos`), `src/db/consultas/mejoramiento/registro.ts` (`registrarRespuestaAlEnte`), `src/app/acciones-mejoramiento.ts`, `[id]/page.tsx`, `tests/utiles/mejoramiento.ts`

**Interfaces:**
- Consumes: `quienTieneElTurno` (Tarea 5); `quienesVerifican`, `fechaMinimaDe` (Tarea 16); `quienDecideAjustes` (Tarea 15); `venceLaEvaluacion` (Tarea 12); `jefesDe`, `avisarA` (`src/db/consultas/avisos-vencimiento.ts`); `estadoPlazo` (`src/lib/tramites/plazos.ts`); `Tarea` (`src/lib/tareas.ts:23`, módulo `"planes"`).
- Produces:
  - `tareas.ts`: `tareasDeMejoramiento(sesion: SesionFlujo, opciones?: { sql?: Cliente; ahora?: Date }): Promise<{ tareas: Tarea[] }>`.
  - `vencimientos.ts`: `revisarVencimientosDeMejoramiento(opciones: { sql: Cliente; ahora: Date; config: ConfigDocumental }): Promise<{ avisados: number; escalados: number }>`.
  - `registro.ts`: `registrarRespuestaAlEnte(sesion, d: { hallazgoId: number; enviadaEn: string }, opciones?): Promise<void>` (`mejora.gestionar`; exige al menos un archivo del hallazgo subido después de aprobado el plan: «Adjunte el oficio de respuesta»).
  - `tests/utiles/mejoramiento.ts`: `silenciarMejoramiento(tx: TransactionSql): Promise<void>` (deja sin nada que avisar lo que ya exista: pone las marcas de aviso en lo sembrado, dentro de la transacción del test).

**Las tareas** (spec §14.1). Identificador, título y a quién:

| Identificador | Título | De quién |
|---|---|---|
| `mej-clasificar:<reporte>` | Clasificar un reporte de mejoramiento | Admin SGC |
| `mej-aceptar:<id>` | Aceptar o rechazar HZ-… | Líderes del proceso |
| `mej-rechazo:<id>` | Decidir sobre el rechazo de HZ-… | Quien lo registró |
| `mej-arbitrar:<id>` | Arbitrar el rechazo de HZ-… | Admin SGC, o Gerencia |
| `mej-corregir:<id>` | Registrar la corrección de HZ-… | Líderes del proceso |
| `mej-decidir:<id>` | Decidir si HZ-… requiere acción correctiva | Admin SGC |
| `mej-validar:<id>` | Validar la corrección de HZ-… (o «el cierre sin acción de») | Quien puede validarla |
| `mej-formular:<id>` | Formular la causa raíz y el plan de HZ-… | Líderes del proceso |
| `mej-revisar:<id>` | Revisar el plan de HZ-… | Admin SGC (no quien elaboró) |
| `mej-aprobar:<id>` | Aprobar el plan de HZ-… | Gerencia |
| `mej-actividad:<actividad>` | La descripción de la actividad | Su responsable |
| `mej-ajuste:<ajuste>` | Decidir un ajuste de HZ-… | Quien lo decide |
| `mej-verificar:<id>` | Verificar la implementación de HZ-… | Quien puede verificar |
| `mej-evaluar:<id>` | Evaluar la eficacia de HZ-… | Quien puede verificar, desde la fecha mínima |
| `mej-cerrar:<id>` | Cerrar HZ-… | Admin SGC |
| `mej-ente:<id>` | Registrar la respuesta al ente de HZ-… | Admin SGC, con el plan aprobado y sin respuesta |

El `detalle` es el título del hallazgo (quien tiene la tarea lo ve); en la de una actividad, el código. `vence`: `vence_en` del hallazgo; en la actividad, `corregir_antes_de` si está devuelta, o `fin`; en `mej-evaluar`, `venceLaEvaluacion`; en `mej-ente`, el fin de `fecha_limite_ente`. Cuando el proceso no tiene líder activo, las del líder son del Admin SGC. La actividad de un responsable **inactivo** es tarea de los líderes del proceso, con el título «Reasignar: …».

**La pasada** (spec §14.3), con `correrPaso` (`src/db/consultas/indicadores/pasada.ts:38`) o la misma forma, y sus marcas:
1. Pasos vencidos de un hallazgo, de un reporte y de un ajuste: aviso `mejora.vencido` a quien tiene el turno; marca `aviso_vencido_en`.
2. Actividades vencidas (sin terminar y con `fin`, o `corregir_antes_de`, ya pasado): aviso `mejora.actividad_vencida` al responsable; si está inactivo, a los líderes del proceso.
3. Escalamiento, cuando `estadoPlazo(vence, ahora, zona).dias > config.escalamientoDias`: a los jefes (`jefesDe`), con `tipo: "mejora.escalado"`, `enlace: null`, `entidad: "usuario"`, título «Una actividad de mejoramiento sigue vencida» o «Un paso de mejoramiento sigue vencido» y cuerpo «A cargo de {nombres}. Venció hace N días.» **Sin código, sin título y sin enlace.** Sin jefe a quien avisar no se pone la marca.
4. Recordatorio de seguimiento: actividad `abierta` o `en_proceso`, ya iniciada, cuando pasaron `recordatorioAltaDias` (no conformidad de criticidad alta) o `recordatorioDias` días calendario desde el mayor entre su inicio, su último seguimiento y `recordatorio_en`; aviso `mejora.recordatorio`; marca `recordatorio_en`.
5. Eficacia por evaluar: hallazgo `en_espera` con la fecha mínima cumplida y `aviso_evaluar_en` nulo: aviso `mejora.por_evaluar` a `quienesVerifican`; y, vencida `venceLaEvaluacion`, el paso 1.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-tareas.test.ts` (con base, dentro de `revertida`):
  - Una prueba por fila de la tabla: quien tiene el turno recibe la tarea con su identificador, su título, su `vence` y `modulo: "planes"`, y otra persona del mismo rol sin la condición no la recibe.
  - `el proceso sin líder` (Review Focus 3): la tarea `mej-formular` es de los Admin SGC.
  - `el responsable inactivo` (Review Focus 2): su actividad es tarea de los líderes, «Reasignar: …».
  - `mej-evaluar` no existe antes de la fecha mínima y sí desde ella.
  - `misTareas` las trae junto a las demás y, si `tareasDeMejoramiento` lanza, devuelve las otras (tolerancia, como con indicadores).
  - `un hallazgo cargado sin su escaneo` no da tareas de actividad (lo cumple la Tarea 20: deje esta prueba marcada `it.todo` con ese nombre y actívela allí).

  `tests/mejora-vencimientos.test.ts` (con base, dentro de `revertida`, tras `silenciarMejoramiento`, `silenciarIndicadores` y los silenciadores de los demás módulos):
  - `la pasada es idempotente`: la primera avisa una vez por paso vencido y la segunda, cero.
  - `el aviso al jefe no lleva contenido`: ni el código, ni el título, ni la descripción de la actividad, y `enlace` nulo; se escala solo pasados los días de `escalamientoDias`.
  - `sin jefe no se marca`: la fila sigue siendo candidata en la pasada siguiente.
  - `el recordatorio`: a los 15 días en una no conformidad de criticidad alta y a los 30 en las demás; se repite a los 15 siguientes; un seguimiento lo reinicia.
  - `una transición borra las marcas del paso anterior`.
  - `la actividad con un ajuste pendiente sigue avisando como vencida`; aprobado el ajuste, deja de hacerlo.
  - `revisarVencimientos` suma lo de mejoramiento a su total.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-tareas.test.ts tests/mejora-vencimientos.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** `tareas.ts` (una consulta por grupo de tareas, cada una con su condición de persona en SQL), `vencimientos.ts` y las dos integraciones: en `misTareas`, la llamada con su `.catch` que registra y devuelve vacío, y los prefijos `mej-…:` en `GRUPOS`; en `revisarVencimientos`, la suma después de la de indicadores. **Sin insignia en la barra.**

- [ ] **Step 4: «Registrar la respuesta al ente»** en la página de un hallazgo externo con el plan aprobado (fecha de envío y el oficio), con `mutacion(formData, "mejora.gestionar", …)`.

- [ ] **Step 5: Run** los dos archivos, `tests/tareas-tolerancia.test.ts`, `tests/vencimientos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): tareas, avisos y vencimientos de mejoramiento`.

---

### Task 20: Registrar un hallazgo ya en curso

**Files:**
- Create: `src/db/consultas/mejoramiento/carga.ts`, `src/componentes/mejoramiento/FormularioCarga.tsx`, `tests/mejora-carga.test.ts`
- Modify: `src/db/consultas/mejoramiento/archivos.ts` (`exigirDestinoAbierto`: el escaneo confirma la carga), `tareas.ts`, `actividades.ts` (`misActividades`), `verificacion.ts`, `ajustes.ts` (`quienDecideAjustes`), `lectura.ts`, `src/app/acciones-mejoramiento.ts`, `src/lib/esquemas/mejoramiento.ts`, `nuevo/page.tsx`, `[id]/page.tsx`, `tests/mejora-tareas.test.ts`

**Interfaces:**
- Consumes: `tomarCodigo`, `nacerHallazgo`, `dejarEvento` (Tarea 5); `cierrePrevisto`, `huellaDePlan`, `examinarPlan` (Tarea 12); `leerContenido` (Tarea 11).
- Produces (en `carga.ts`):
  - `type DatosDeCarga = DatosDeHallazgo & { registradoEnPapel: string; correccion: { requerida: boolean; descripcion: string; implementadaEn?: string | null }; analisis: { metodo: MetodoAnalisis; causas: string[]; contenido?: unknown }; acciones: Array<{ tipo: TipoAccion; descripcion: string; causas: number[]; recursos?: string | null; indicadorCumplimiento?: string | null; meta?: string | null; actividades: Array<{ descripcion: string; responsableId: number; inicio: string; fin: string; avance: number; terminadaEn?: string | null }> }>; criterios: string[]; criterioOtro?: string | null; indicadorEficaciaId?: number | null; fechaEvaluacion?: string | null; aprobacion: { nombre: string; cargo: string; fecha: string; rol: "gerencia" | "admin_sgc" } }`.
  - `cargarHallazgo(sesion, d: DatosDeCarga, opciones?): Promise<{ id: number; codigo: string }>`.
  - `cargaConfirmada(sql: Cliente, hallazgoId: number): Promise<boolean>` (existe un archivo del hallazgo con rol `carga`).

**Reglas** (spec §15): solo `mejora.gestionar`. Un solo punto de entrada: el plan ya aprobado por fuera. En una transacción: el hallazgo con `cargado = true` y el código del año **de la carga**; la corrección; la ronda 1 con el análisis, las causas, las acciones y las actividades (`fin_original = fin`; las terminadas, con su `terminada_en` y `avance = 100`, sin exigir archivo), `estado_plan = 'aprobado'`, `aprobado_en` = la fecha declarada, `aprobado_rol` = el rol declarado (o `gerencia` si la criticidad es alta o el origen es externo), `aprobado_fuera` = «{nombre}, {cargo}», `enviado_en` **nulo**, y `cierre_previsto` calculado con la fecha de aprobación declarada; un evento por cada paso hecho en papel (`registrar`, `corregir`, `aprobar_plan`), con `fuera = true`, `ocurrio_en` = su fecha real y, en el de la aprobación, `detalle.plan` y su huella; **ninguna fila en `firmas`**; y el nacimiento por `nacerHallazgo(…, "cargar", { rumbo: { quedaEn } })`, en `en_ejecucion`, o en `por_verificar` si todas las actividades están terminadas. **El escaneo es obligatorio:** mientras `cargaConfirmada` sea falso, la página dice «Falta el formato firmado», las actividades no dan tareas ni avisos a sus responsables, y `verificarImplementacion` lanza «Adjunte primero el formato firmado de la carga». Al subirse el primer archivo con rol `carga`, se deja el evento `carga_confirmada` y se avisa a cada responsable.

- [ ] **Step 1: Write the failing tests** `tests/mejora-carga.test.ts` (con base, dentro de `revertida`):
  - `solo el Admin SGC carga`: Control Interno recibe `ErrorPermiso`.
  - `entra en ejecución con sus fechas reales`: estado `en_ejecucion`, `cargado = true`, código del año de `ahora`; tres eventos con `fuera = true` y `ocurrio_en` en las fechas declaradas; cero filas en `firmas`; `fin_original = fin` en cada actividad; `enviado_en` nulo.
  - `con todas las actividades terminadas entra en por_verificar`.
  - `el rol que decide los ajustes es el declarado`: con `rol: "admin_sgc"` y criticidad media, `quienDecideAjustes` da `admin_sgc`; con criticidad alta, `gerencia` aunque se declare lo contrario.
  - `sin escaneo no avanza`: `misActividades` del responsable no trae la actividad, `tareasDeMejoramiento` tampoco (active aquí el `it.todo` de la Tarea 19), y `verificarImplementacion` lanza su mensaje. Subido el escaneo (una fila de `archivos` con rol `carga`, por `registrarArchivo`), queda el evento `carga_confirmada`, cada responsable recibe su aviso y las tareas aparecen.
  - `las fechas se validan`: una `aprobacion.fecha` futura, o anterior a `registradoEnPapel`, se rechaza; una actividad terminada sin `terminadaEn`, también.
  - `sigue el recorrido normal`: tras el escaneo, seguimientos, verificación, evaluación y cierre funcionan, con sus firmas del sistema.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-carga.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente** `carga.ts` y los cinco puntos donde la carga sin confirmar se respeta.

- [ ] **Step 4: La interfaz.** En `/mejoramiento/nuevo`, con `mejora.gestionar`, la opción «Ya está en curso» (`?modo=en-curso`): `FormularioCarga`, por bloques (identificación, corrección, análisis, plan, aprobación en papel), con la nota «Lo que se hizo en papel quedará marcado como hecho fuera de la plataforma, sin firma del sistema». Guardado, lleva a la página del hallazgo, que pide el escaneo. La marca «Cargado» en la lista y en la página.

- [ ] **Step 5: Run** el archivo, `tests/mejora-tareas.test.ts`, `tests/mejora-pantallas.test.tsx`, `tests/acciones-permisos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15a): registro de hallazgos ya en curso`.

---

### Task 21: Impresos, Excel de la lista y búsqueda global

**Files:**
- Create: `src/app/(app)/mejoramiento/[id]/imprimir/page.tsx`; en `src/componentes/mejoramiento/impresos/`: `EncabezadoDeFormato.tsx`, `RegistroImpreso.tsx`, `CincoPorquesImpreso.tsx`, `IshikawaImpreso.tsx`, `OtroMetodoImpreso.tsx`; `src/db/consultas/mejoramiento/formatos.ts`, `busqueda.ts`; `src/lib/mejoramiento/excel.ts`; `src/app/(app)/mejoramiento/excel/route.ts`; `tests/mejora-impresos.test.tsx`, `tests/mejora-excel.test.ts`, `tests/mejora-busqueda.test.ts`
- Modify: `lectura.ts` (`filasParaExcel`), `src/lib/busqueda-rapida.ts` (`grupo`, `gruposDeResultados`), `src/app/api/buscar/route.ts`, `src/componentes/cascaron/Buscador.tsx`, `src/app/(app)/buscar/page.tsx`, `src/app/globals.css` (si hace falta una clase de impresión nueva), `src/lib/bitacora-detalle.ts`, `[id]/page.tsx`, `mejoramiento/page.tsx`

**Interfaces:**
- Consumes: `leerHallazgo`, `listarHallazgos`, `FiltroDeLista`, `filtroHallazgos` (Tarea 6); `firmasDeHallazgo` (Tarea 13); `obtenerConfigMejora` (Tarea 4); `obtenerMarcaSegura` (`src/db/consultas/entidad.ts:54`); `agregarHoja`, `Columna`, `MetaHoja` (`src/lib/distribucion/hoja-excel.ts`); `neutralizarFormula` (`src/lib/celdas.ts:7`); `BotonImprimir` y las clases `.ficha-*` (`src/app/globals.css:564-597`).
- Produces:
  - `formatos.ts`: `encabezadoDeFormato(sql: Cliente, cual: "registro" | "porques" | "ishikawa"): Promise<{ codigo: string; version: number; emitidoEn: Date } | null>` (del documento elegido en la configuración; `null` si no hay ninguno o no tiene versión vigente).
  - `excel.ts`: `construirExcelDeHallazgos(filas: FilaDeExcel[], meta: MetaHoja): Promise<Buffer>`; `lectura.ts`: `filasParaExcel(sesion, filtro: FiltroDeLista, opciones?): Promise<FilaDeExcel[]>` (una fila por actividad; un hallazgo sin actividades, una fila).
  - `busqueda.ts`: `buscarHallazgos(q: string, sesion: SesionFlujo, limite: number, opciones?): Promise<Array<{ id: number; codigo: string; titulo: string; etiqueta: string }>>`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/mejora-impresos.test.tsx` (sin base): `RegistroImpreso` pinta las siete secciones con los títulos del SGC-FO-AC-01, en orden (identificación; corrección o contención; análisis de causa raíz; plan de acción; seguimiento; verificación de eficacia; cierre); cada ronda; los ajustes; y cada firma con nombre, cargo, fecha y los 12 primeros caracteres de su huella. `EncabezadoDeFormato` con datos pinta «Código», «Versión» y «Fecha de emisión»; con `null`, ninguno de los tres. El pie dice «Impreso el … por …». Un hallazgo cargado lleva «Cargado: tramitado antes fuera de la plataforma». `OtroMetodoImpreso` no lleva código de formato.
  - `tests/mejora-excel.test.ts`: las columnas son, en orden, código, ronda y las diecisiete de la matriz del SGC-FO-28 (spec, Apéndice A.6), más «Fin original» junto a «Fecha límite»; una fila por actividad; un título `=1+1` sale neutralizado; con base: respeta `filtroHallazgos` (el líder de otro proceso recibe un libro sin filas), aplica los filtros y deja `mejora_exporto_hallazgos` en la bitácora con los filtros (el spec §16.3 la llama `exporto_hallazgos`; aquí lleva el prefijo del módulo, para no confundirla con lo de la 13B).
  - `tests/mejora-busqueda.test.ts` (con base): `buscarHallazgos` encuentra por código y por título sin distinguir tildes, **solo** los que la persona ve; para el rol Consulta sin participación, vacío.
  - Con base, en `tests/mejora-impresos.test.tsx` o en `tests/mejora-config.test.ts`: `encabezadoDeFormato` devuelve el código y la versión vigente del documento elegido, y `null` cuando ese documento deja de tener versión vigente.

- [ ] **Step 2: Run** `npx vitest run tests/mejora-impresos.test.tsx` y `bash <espacio>/con-f15a.sh npx vitest run tests/mejora-excel.test.ts tests/mejora-busqueda.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente.** La página `/mejoramiento/[id]/imprimir` (`exigirHallazgo`; a quien lo ve como `"actividad"`, `notFound()`): por omisión el registro completo; con `?analisis=<id>`, ese análisis en su formato; `EncabezadoPagina` y los botones dentro de `print:hidden`; el molde es `src/app/(app)/indicadores/[codigo]/imprimir/page.tsx`. La ruta del Excel sigue el esqueleto de `src/app/(app)/indicadores/excel/route.ts` (401 sin sesión, límite de 10 por minuto, `Cache-Control: no-store`). La búsqueda global toca cuatro sitios: `grupo: "hallazgo"` y `gruposDeResultados`, `api/buscar/route.ts`, `Buscador.tsx` (un `GrupoPaleta titulo="Hallazgos"`) y `buscar/page.tsx`.

- [ ] **Step 4: Run** los tres archivos, `tests/paginas-sesion.test.ts`, `tests/sin-main.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15a): impresos SGC-FO-AC-01 a 03, Excel de la lista y hallazgos en la búsqueda`.

**Punto de control 5 (controlador):** registrar los formatos como documentos, elegirlos en la configuración e imprimir un hallazgo y sus dos análisis (vista previa de impresión, una y varias páginas); abrir el Excel.

---

### Task 22: Semilla demo, manual, `AGENTS.md`, `CONTEXT.md` y cierre

**Files:**
- Create: `src/db/semillas/mejoramiento-demo.ts`, `tests/semilla-mejoramiento.test.ts`, `docs/manual/usuario/09-mejoramiento.md`
- Modify: `src/db/semillas/demo.ts` (`sembrarDemo`), `tests/vencimientos.test.ts`, `tests/indicadores-vencimientos.test.ts`, `tests/vigencia-vencimientos.test.ts`, `tests/semilla-tramites.test.ts` (los cuatro comparan totales exactos de `revisarVencimientos`: añádales `silenciarMejoramiento`), `AGENTS.md`, `CONTEXT.md`, `PLAN.md`

**Interfaces:**
- Consumes: todas las funciones del dominio de las tareas 5 a 20; `ContextoDistribucion`, `sesionDe`, `momentoHace` (`src/db/semillas/distribucion-demo.ts`); `firmaDeLaDemo` (`src/db/semillas/vigencia-demo.ts:52`); `silenciarMejoramiento` (Tarea 19).
- Produces: `sembrarMejoramiento(ctx: ContextoDistribucion): Promise<void>`, llamada en `sembrarDemo` después de `sembrarIndicadores`.

**La demo** (spec §22). Por las funciones del dominio, con `ahora` inyectado en cada paso; nunca por SQL directo sobre las tablas `mejora_*`. Usuarios: `coordinadora.sgc`, `gerente`, `control.interno`, `lider.cex`, `lider.gth`, `consulta`, `jefe.urgencias`, `regente.farmacia`. Sin nombres de pacientes. Catorce hallazgos y dos reportes:

| Queda en | Qué es |
|---|---|
| «Por aceptar» | No conformidad de auditoría interna, en GTH |
| «En arbitraje» | Rechazada por `lider.gth` y sostenida por `control.interno` |
| «Rechazado» | Otra, retirada |
| «Cerrado con corrección» | Menor, en CEX |
| «Cerrado sin acción» | Menor, sin corrección, validada por `control.interno` |
| «En ejecución», el caso de las maquetas | Criticidad alta y reincidente, en ATE; tres actividades (una de `consulta`, una vencida de `jefe.urgencias` con un ajuste por decidir, una de `coordinadora.sgc`); plan aprobado por `gerente` |
| «Por formular», a punto de vencer | En CEX. La semilla lo registra **ocho días hábiles atrás** (cuenta hacia atrás con `restarDiasHabiles`, no con días calendario), para que siempre le queden dos, caiga donde caiga un festivo |
| «En revisión» | Con 5 porqués e Ishikawa |
| «En aprobación» | De `ente_control`, con su fecha del ente |
| «En espera de eficacia», todavía no evaluable | Con el indicador mensual `CEX-ID-001` enlazado |
| «Por evaluar la eficacia» | Sembrado con fechas pasadas, para que la fecha mínima ya se haya cumplido |
| «Cerrado · eficaz» | Verificado por `control.interno` y cerrado por `coordinadora.sgc` |
| «Reabierto · ronda 2» | Una oportunidad de mejora cuya ronda 1 resultó no eficaz |
| «Cargado» | Con su escaneo (un PDF mínimo generado por la semilla) |

Los dos reportes, de `consulta`: uno por clasificar y uno convertido. Un día no hábil de ejemplo en el calendario de la entidad. Al final, la semilla corre `revisarVencimientosDeMejoramiento` a la hora de la siembra: **sembrada la demo, la pasada no tiene nada nuevo que avisar.**

- [ ] **Step 1: Write the failing test** `tests/semilla-mejoramiento.test.ts` (con base; molde `tests/semilla-indicadores.test.ts`, con `exigirDemo`): un hallazgo en cada fila de la tabla (por su etiqueta de `etiquetaDeEstado`); los dos reportes; el hallazgo de las maquetas tiene tres actividades, una vencida y un ajuste `pendiente`; el «a punto de vencer» no está vencido y vence dentro de los próximos cinco días hábiles (la prueba no fija la cifra); el «por evaluar» tiene `fechaMinimaDe(...).minima` anterior o igual a hoy y el «en espera», posterior; el cargado tiene su archivo con rol `carga` y ninguna firma del plan; ninguna descripción, corrección ni seguimiento de la demo contiene la palabra «cédula» ni un número de seis a diez cifras seguidas (`/\b\d{6,10}\b/`); una segunda pasada de vencimientos, dentro de `revertida`, avisa cero.

- [ ] **Step 2: Run** `bash <espacio>/con-f15a.sh npm run db:seed && bash <espacio>/con-f15a.sh env SEMILLA_RECIEN=1 npx vitest run tests/semilla-mejoramiento.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implemente la semilla.** Cada hallazgo, una función corta que encadena los pasos del dominio con su hora (`momentoHace`); si un paso cae en el futuro, lance un error, como hace la semilla de indicadores. Añada `silenciarMejoramiento` a los cuatro tests de totales.

- [ ] **Step 4: Run** de nuevo el Step 2. Expected: PASS. Corra también `bash <espacio>/con-f15a.sh env SEMILLA_RECIEN=1 npx vitest run tests/vencimientos.test.ts tests/indicadores-vencimientos.test.ts tests/vigencia-vencimientos.test.ts tests/semilla-tramites.test.ts tests/semilla-minima.test.ts`. Expected: PASS.

- [ ] **Step 5: El manual.** `docs/manual/usuario/09-mejoramiento.md`, «Planes de mejoramiento: hallazgos, acciones y verificación», con el estilo de los capítulos 7 y 8: 1. Qué es un hallazgo y quién lo ve; 2. Reportar una posible no conformidad; 3. Registrar un hallazgo (clases, orígenes, parecidos y reincidencia); 4. El recorrido, paso a paso, y qué formato del hospital reemplaza cada pantalla; 5. La corrección y el camino corto (incluido «Cerrado sin acción»); 6. La causa raíz; 7. El plan de acción y sus firmas; 8. Mi actividad: seguimientos, evidencia y ajustes; 9. Verificar, evaluar la eficacia y cerrar; 10. Los plazos en días hábiles y el calendario de la entidad; 11. Registrar un hallazgo ya en curso; 12. Imprimir y exportar; 13. Qué cambia en sus formatos (el Apéndice B del spec).

- [ ] **Step 6: `AGENTS.md`,** con lo que el spec §20 lista y esta entrega construyó: las cuatro tablas de solo inserción en el piso 10, la regla 5 y la sección de tests; el trigger `sgc_impedir_si_hallazgo_terminado`; la estructura del módulo y la advertencia de nombres con la 13B; la quinta excepción nombrada a `alcanceProcesos()` y las funciones nuevas de `alcance.ts` (con la advertencia de que `alcanceProcesos` da `todos: true` al rol Consulta); los dos archivos de acciones, las guardas de página y las cuatro rutas de subida; los cuatro contextos de archivo y su regla de acceso; las firmas `verifico` y `cerro` y qué cubre cada huella; y las reglas nuevas, cada una con su párrafo (`transicionarHallazgo`, días hábiles y calendario, la fecha de fin original, quien ejecuta no verifica, las dos fechas de eficacia, la carga). La cuenta de migraciones pasa a diecinueve.

- [ ] **Step 7: `CONTEXT.md` y `PLAN.md`.** En `CONTEXT.md`: el punto de reanudación; «Hecho (Fase 15A)»; «Qué probar y cómo (Fase 15A)» (los diecisiete pasos de §24.1 del spec, sobre los hallazgos de la demo: los pasos 9 y 10 se recorren sobre el «Por evaluar la eficacia» ya sembrado, porque en el navegador no hay reloj que adelantar); «Decisiones adicionales (Fase 15A)» (toda decisión tomada al construir que no esté en el spec); «Avisos para el usuario (Fase 15A)» (aplicar la `0018` a la base `sgc`; registrar los siete formatos como documentos y elegirlos en la configuración; los pendientes del spec §28). En `PLAN.md`, la fila 15A.

- [ ] **Step 8: Verificación de cierre (controlador).** Con la demo recién sembrada en `sgc_f15a`:
  - `bash <espacio>/con-f15a.sh env SEMILLA_RECIEN=1 npm test`: en verde, sin `FAIL` ni `stderr`. Anote archivos y pruebas frente a la línea base.
  - `npm run lint`: limpio. `npm run build` **sin** `DATABASE_URL`: en verde.
  - La `0018` sobre una copia de la base `sgc` del usuario (`pg_dump` de solo lectura; la copia se borra después): de dieciocho a diecinueve migraciones, con los mismos conteos y las mismas huellas en documentos, trámites, indicadores, mediciones y firmas.
  - El recorrido de §24.1 del spec en el navegador (`next dev -p 3015`), en claro, oscuro y 390 px, con cada rol.
  - `git status` limpio y ningún archivo de `F:\plan_mejoramiento` ni de la raíz en un commit.

- [ ] **Step 9: Commit** `docs(f15a): semilla demo, manual, AGENTS.md y CONTEXT.md al cierre de la 15A`. **Sin `merge` ni `push`:** lo decide el usuario después de su recorrido.

---

## Cobertura del spec (auto-revisión)

| Spec | Tarea |
|---|---|
| §6.1 a §6.3, permisos y visibilidad | 3 (matriz), 6 (alcance y lecturas), 9 (archivos), 18 (identidad de quien reporta) |
| §6.4, sin datos de pacientes | 3 (`AVISO_SIN_PACIENTES`), 5 (referencia del caso), y cada formulario |
| §7.1, §7.2, §7.4 | 3 y 5 |
| §7.3, reportes | 18 |
| §7.5, parecidos y ocurrencias; §7.6 | 8 |
| §8.1, §8.2 | 3 (tabla), 5 (motor) |
| §8.3 a §8.5, con el cierre sin acción | 10 |
| §8.6, §12 | 12 (huella), 13 (firmas y lo congelado), 16 (Verificó y Cerró) |
| §8.7, rondas | 16 y 17 |
| §9 | 11 (el Pareto, en la 15C) |
| §10.1 a §10.4 | 12 y 14 |
| §10.5 | 19 |
| §10.6, §10.7 | 15 |
| §11 | 12 (fechas), 16 (dominio), 17 (pantallas) |
| §13 | 1 (regla), 2 (tabla), 4 (configuración y plazos), 5 (vencimiento del paso), 19 (respuesta al ente) |
| §14 | 19 |
| §15 | 20 |
| §16.1, §16.2 | 7 y las pantallas de cada tarea |
| §16.3, §16.4 | 21 |
| §19 | 2 |
| §20, §25 | 22 |
| §21 | Cada tarea, con sus pruebas de permiso, alcance y archivos |
| §22, §24.1 | 22 |
| §23 | Las pruebas de cada tarea |
