# Fase 15B — Mejoramiento: planes y enganches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que los hallazgos de un mismo evento se agrupen en un plan de mejoramiento con su SGC-FO-14 y su Excel para el
ente, y que un hallazgo se pueda abrir desde donde nace el problema (una medición en Crítico, un hallazgo de verificación,
un impacto de norma, un documento, un proceso o un indicador) y pida su cambio documental, sin que nadie vea lo que no le
corresponde.

**Architecture:** el **plan** es un agrupador sin recorrido propio. La pertenencia a un plan y el objetivo de un hallazgo
viven **fuera de la fila del hallazgo** (`mejora_clasificacion`), porque un hallazgo terminado no cambia y sí se
reclasifica. Cada enganche con otro módulo es un módulo **liviano** de `src/db/consultas/mejoramiento/` que el otro módulo
llama para leer; el único punto donde otro motor escribe algo de Mejoramiento es `crearSolicitud`, que valida antes de
insertar. Todo hallazgo sigue naciendo por `nacerHallazgo` y cambiando por `transicionarHallazgo`. Las consultas son
plantillas de postgres.js; Drizzle solo declara el esquema y genera la migración.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript estricto, PostgreSQL 16 con Drizzle (esquema y
migraciones) y postgres.js (consultas), `zod`, `exceljs`, Vitest. **Sin dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-11-18-fase15b-planes-y-enganches-design.md` («el anexo»), que amplía §17 de
`docs/superpowers/specs/2026-11-17-fase15-planes-de-mejoramiento-design.md` («el spec 15») y manda sobre él. Lea el anexo
entero, `AGENTS.md` y, del spec 15, las secciones que su tarea cite, antes de empezar. Las maquetas están en
`<espacio>/pantallas-15b.html`. El anexo manda; este plan lo argumenta. Donde el plan fija un nombre que el anexo dejó
provisional, vale el del plan («Nombres fijos»).

## Global Constraints

- Trabajo en el worktree `F:\sgc-integral-f15b`, rama `fase-15b-planes-enganches` (sale de `main`). Nunca el código de
  `F:\sgc-integral`, su base `sgc` ni su `next dev` del 3002; sin Docker salvo el `psql` que crea y borra las bases de
  trabajo; sin `.env.local` (no se lee ni se crea); sin `push` ni `merge`.
- `<espacio>` es `F:\sgc-integral-f15b\.superpowers\sdd\2026-11-18-fase15b-planes-enganches` (ignorado por git). Todo
  comando que toque la base va por su guard, que carga el entorno de la base aparte `sgc_f15b`:
  `bash <espacio>/con-f15b.sh npx vitest run tests/x.test.ts`. Un servidor para los puntos de control va en otro puerto:
  `bash <espacio>/con-f15b.sh npx next dev -p 3016` (la 3002, la 3015 y la 3016 comparten la cookie de `localhost`).
- **Una sola migración nueva, `drizzle/0019_fase15b-planes-enganches.sql`,** generada con
  `npm run db:generate -- --name fase15b-planes-enganches` (por el guard) y completada a mano con el SQL que Drizzle no
  genera. Solo añade (piso 11 de `AGENTS.md`). Si `db:generate` se queda esperando una respuesta interactiva, deténgase y
  avise al controlador. No se tocan la `0000` a la `0018` (la `0017` y la `0018` tienen SQL a mano: compruebe con
  `git diff` que siguen iguales después de generar). `src/db/esquema.ts` importa solo con rutas relativas. **Una columna
  que falte obligaría a una `0020`:** toda la estructura de la entrega va en la Tarea 1.
- **El trigger `sgc_impedir_si_hallazgo_terminado` no se toca ni gana excepciones.** Nada de esta entrega escribe en la
  fila de un hallazgo terminado ni en sus hijas.
- **Un solo camino crea y mueve un hallazgo:** solo `nacerHallazgo` inserta en `mejora_hallazgos` y solo
  `transicionarHallazgo` escribe su `estado` y su `ronda` (`tests/mejora-motor.test.ts`).
- **Los otros módulos cambian lo mínimo.** En Distribución (13B) no cambia ningún texto ni ninguna regla: gana un botón,
  un aviso y una línea. El motor del trámite (`transicionar`, `aplicarPublicacion`) no llama a Mejoramiento; solo
  `crearSolicitud` conoce la actividad. Las consultas de `src/db/consultas/indicadores/` no importan nada de
  Mejoramiento: lo llaman las páginas. `tests/mejora-ciclos.test.ts` y `tests/indicadores-ciclos.test.ts` siguen en verde.
- **Para quien no puede ver un hallazgo o un plan, no existe:** ni su código, ni su título, ni su conteo, ni un cero, en
  ninguna pantalla, archivo, aviso, tarea, historial ni mensaje de error. La respuesta es la misma que si el
  identificador no existiera.
- **El texto libre no va a la bitácora** (decisión 42 de la 15A): motivos, justificaciones y el objetivo escrito de un
  plan quedan en el historial del plan, en la fila de la marca o en el evento del hallazgo. El nombre del plan y el título
  del hallazgo sí van.
- Toda Server Action nueva pasa por `mutacion(formData, "<permiso literal>", fn)` (`tests/acciones-permisos.test.ts`); toda
  acción de bitácora nueva tiene su `case` en `describirEvento` y su entrada en `NOMBRE_DE_ACCION`
  (`src/lib/bitacora-detalle.ts`, `tests/bitacora-detalle.test.ts`); cada página nueva llama `exigirSesion()` en su propio
  texto (`tests/paginas-sesion.test.ts`); la ruta de subida nueva va fuera del `matcher` de `src/proxy.ts`, con su caso
  en `tests/proxy-matcher.test.ts`. Cada test estructural se actualiza en la tarea que lo rompe.
- `mutacion` muestra el `message` de cualquier error: los errores crudos de PostgreSQL (`23503`, `23505`, `42501`, `40P01`)
  se traducen con `legible()` (`src/db/consultas/mejoramiento/legible.ts`) **antes** de salir del dominio. Los mensajes de
  dominio son frases que ve la persona; el error es `ErrorMejora`.
- Colores solo por token (`tests/colores-fijos.test.ts`); color del módulo, `mod-planes`; nada de `opacity` para atenuar;
  el estado nunca solo por color; ningún nombre de entidad en `src/` (`tests/textos-fijos.test.ts`); páginas sin `<main>`,
  sin `<h1>` propio y sin `mx-auto` (`tests/sin-main.test.ts`): `EncabezadoPagina` y los componentes de
  `src/componentes/ui`. Navegable por teclado y a 390 px. `"use client"` solo donde hay interacción, y ninguna función
  auxiliar en un archivo de cliente que un archivo de servidor importe (`tests/frontera-cliente.test.ts`).
- Todo formulario con texto libre del módulo lleva `AVISO_SIN_PACIENTES` (ya existe).
- Tests contra la base: lo que no deba quedar va dentro de `revertida` (`tests/utiles/transaccion.ts`); usuarios con
  historia, `usuarioDePrueba`; nunca `UPDATE` ni `DELETE` sobre tablas de solo inserción en una limpieza; ningún test
  deja un hallazgo terminado, una ficha aprobada ni un cierre del mes fuera de una transacción que se revierte. `ahora`
  siempre inyectado en las opciones (`c(ahora, tx)` de `tests/utiles/mejoramiento.ts`).
- Para contar sentencias en un test use `contada(tx)`, que hoy es una función local de
  `tests/cascaron-consultas.test.ts`: la primera tarea que la necesite la mueve a `tests/utiles/sentencias.ts` y la
  exporta, sin cambiarla.
- Next.js de este repo no es el de memoria: antes de escribir una página, una acción o un handler, lea la guía que toque
  en `node_modules/next/dist/docs/`. `params` y `searchParams` son promesas.
- Commits convencionales en español, terminados con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (la línea que
  fija `AGENTS.md`). Se confirma por ruta (`git add <archivo>`), nunca `git add -A`.
- Textos de la interfaz en español con tildes; los mensajes entre comillas de este plan son copia exacta.
- Mientras itera corra el test enfocado; antes de confirmar, los archivos de test que la tarea nombra y `npm run lint`.
  **No corra la suite completa** (tarda más de diez minutos): la corre el controlador.

## Nombres fijos

Cada tarea ve solo su texto: estos nombres no se cambian.

**Prefijos,** los de la 15A: tablas `mejora_*`, permisos `mejora.*`, claves `mej_*`, acciones de bitácora `mejora_<algo>`,
avisos `mejora.<algo>`, tareas `mej-<paso>:<id>`, pruebas `tests/mejora-*.test.ts(x)`. Ojo: `tests/mejora-plan.test.ts` ya
existe y es del **plan de acción**; las del plan de mejoramiento se llaman `tests/mejora-planes*.test.ts`.

**Permiso nuevo:** `mejora.planes` (`admin_sgc`, `control_interno`).

**Tablas** (helpers `id()`, `ref()`, `refUsuario()`, `marca()`, `creado()` de `esquema.ts`; toda llave foránea `RESTRICT`
y con su índice completo; `text` con `CHECK`, nunca `pgEnum`):

| Tabla | Columnas |
|---|---|
| `mejora_plan_consecutivos` | `vigencia integer` llave primaria, `ultimo integer` |
| `mejora_planes` | `codigo` único; `vigencia`, `consecutivo` (únicos juntos); `nombre`; `origen` (los catorce); `fecha_evento date`; `objetivo_texto` (nulo); `objetivo_id` → `objetivos` (nulo); `fecha_limite_ente date` (nulo); `creado_por`, `creado_en`; `anulado_en`, `anulado_por`, `anulado_motivo` (nulos) |
| `mejora_clasificacion` | `hallazgo_id` llave primaria → `mejora_hallazgos`; `plan_id` → `mejora_planes` (nulo); `objetivo_id` → `objetivos` (nulo); `actualizado_por`, `actualizado_en`. `CHECK`: alguno de los dos no es nulo (la fila se borra cuando quedan los dos nulos). **Sin** el trigger del hallazgo terminado |
| `mejora_plan_eventos` (solo inserción) | `plan_id`; `hallazgo_id` (nulo); `tipo` (`creado`, `editado`, `anulado`, `entra`, `sale`, `archivo`, `archivo_quitado`, `respuesta`); `detalle jsonb` (`'{}'`); `usuario_id`; `creado_en`. **Sin** el trigger del hallazgo terminado |
| `mejora_plan_respuestas` | `plan_id`; `enviada_en date`; `archivo_id` → `archivos` (único); `registrada_por`, `registrada_en` |
| `mejora_plan_respuesta_hallazgos` | `respuesta_id`, `hallazgo_id` (llave primaria: las dos). **Sin** el trigger del hallazgo terminado |
| `mejora_marcas` (solo inserción) | `medicion_id` → `mediciones`; `indicador_id` → `indicadores`; `salida` (`hallazgo`, `ocurrencia`, `no_requiere`); `hallazgo_id` → `mejora_hallazgos` (nulo); `justificacion` (nula); `decidido_por`, `decidido_en`. `CHECK`: `no_requiere` lleva justificación y no lleva hallazgo; las otras dos, al revés. **Varias filas por medición** |
| `mejora_actividad_tramites` | `hallazgo_id`, `actividad_id` (llave compuesta a `mejora_actividades (id, hallazgo_id)`, como las demás hijas); `tramite_id` → `tramites` (**único**); `origen` (`pedido`, `enlazado`); `enlazado_por`, `enlazado_en`; `avisado_en` (nulo). **Con** el trigger del hallazgo terminado (`INSERT`, `UPDATE`, `DELETE`) |
| `mejora_hallazgos` (columnas nuevas) | `verificacion_hallazgo_id` → `hallazgos`; `impacto_id` → `impactos_normativos`; `impacto_indicador_id` → `impactos_indicadores`. Las tres nulas, con su índice completo y, aparte, un índice **único parcial** `WHERE estado NOT IN ('rechazado', 'anulado')` |
| `mejora_reportes` (columnas nuevas) | `documento_id` → `documentos`, `indicador_id` → `indicadores` (nulas) |

**Otros valores.** Contexto de archivo nuevo: `mejora_plan` (rol `evidencia`). Claves de configuración:
`mej_formato_plan_documento_id` (`""`), `mej_sugerir_hallazgos` (`3`, de 2 a 20), `mej_sugerir_meses` (`12`, de 1 a 60).
Tareas: `mej-marca:<medicionId>` y `mej-ente-plan:<planId>`. Aviso: `mejora.tramite_terminado` (entidad
`mejora_actividad`). Evento nuevo del hallazgo: `archivo_retirado`, `tramite_terminado`, `tramite_enlazado`,
`tramite_desenlazado`. Entidad de bitácora nueva: `mejora_plan`. Acciones de bitácora: `mejora_plan_crear`,
`mejora_plan_editar`, `mejora_plan_anular`, `mejora_plan_entra`, `mejora_plan_sale`, `mejora_plan_respuesta`,
`mejora_objetivo`, `mejora_marca`, `mejora_tramite_enlazado`, `mejora_tramite_desenlazado`, `mejora_archivo_retirado`,
`mejora_exporto_plan_ente`.

**Código del plan.** `PM-AAAA-NN`: `"PM-" + vigencia + "-" + String(n).padStart(2, "0")`; el cien es `PM-2026-100`. El
patrón que lo valida es `^PM-\d{4}-\d{2,}$`. El consecutivo sale de `mejora_plan_consecutivos` dentro de la transacción,
como `tomarCodigo` de la 15A; **no** de una secuencia.

**Rutas.** `/mejoramiento/planes`, `/mejoramiento/planes/nuevo`, `/mejoramiento/planes/[id]`,
`/mejoramiento/planes/[id]/editar`, `/mejoramiento/planes/[id]/anadir` (el selector de hallazgos),
`/mejoramiento/planes/[id]/imprimir?proceso=` (SGC-FO-14 de un plan), `/mejoramiento/planes/[id]/excel` (GET, el Excel
del ente), `/mejoramiento/consolidado?proceso=&anio=` (SGC-FO-14 consolidado),
`/mejoramiento/actividades/[id]/enlazar` (el selector de trámites). Subida (POST, fuera del `matcher`):
`api/mejoramiento/planes/[id]/archivos`. `[id]` es numérico (`/^\d{1,15}$/`).

**Parámetros de `/mejoramiento/nuevo`** (además de `derivado`, `reporte` y `modo`): `plan`, `documento`, `indicador`,
`proceso`, `medicion`, `verificacion`, `impacto`, `impactoIndicador`. **Campos ocultos** del formulario: `planId`,
`objetivoId`, `marcaMedicionId`, `verificacionHallazgoId`, `accionJustificacion`, `impactoId`, `impactoIndicadorId`.
**Parámetro de `/tramites/nueva`:** `actividad`; campo oculto `actividadId`.

**Mensajes de dominio** (copia exacta; cada tarea usa los suyos):

| Constante | Texto |
|---|---|
| `PLAN_NO_EXISTE` | «El plan no existe» |
| `PLAN_ANULADO` | «El plan está anulado» |
| `PLAN_CON_HALLAZGOS` | «Saque primero los hallazgos del plan» |
| `YA_EN_UN_PLAN` | «El hallazgo ya está en un plan» |
| `NO_CUENTA_PARA_PLAN` | «Un hallazgo anulado o rechazado no se añade a un plan» |
| `MOTIVO_CORTO` | «Escriba el motivo (al menos 10 caracteres)» |
| `OBJETIVO_INACTIVO` | «El objetivo ya no está activo» |
| `SIN_LISTOS` | «Ningún hallazgo del plan espera respuesta» |
| `LISTOS_CAMBIARON` | «Cambiaron los hallazgos listos para responder: revise la lista» |
| `OFICIO_DE_OTRA` | «Ese archivo ya es el oficio de otra respuesta» |
| `OFICIO_AJENO_AL_PLAN` | «Elija el oficio entre los archivos del plan» |
| `RESPONDA_DESDE_EL_PLAN` | «Este hallazgo está en un plan: registre la respuesta desde el plan» |
| `MARCA_YA_DECIDIDA` | «La acción de mejora de esta medición ya se decidió» |
| `MARCA_SIN_PENDIENTE` | «Esta medición todavía no pide decidir su acción de mejora» |
| `YA_TIENE_NO_CONFORMIDAD` | «Este hallazgo de verificación ya tiene una no conformidad» |
| `SIN_JUSTIFICAR_LA_ACCION` | «Escriba por qué esta falla necesita acción correctiva (al menos 10 caracteres)» |
| `IMPACTO_YA_TIENE_HALLAZGO` | «Este impacto ya tiene un hallazgo» |
| `ACTIVIDAD_NO_ADMITE` | «No se pudo enlazar la solicitud a la actividad: vuelva a la actividad y pídala de nuevo» |
| `TRAMITE_NO_SIRVE` | «Ese trámite no se puede enlazar a esta actividad» |
| `ARCHIVO_FIRMADO` | «Este archivo ya es parte de lo firmado y no se puede quitar» |
| `RETIRO_SIN_JUSTIFICAR` | «Escriba por qué se retira el archivo (al menos 10 caracteres)» |
| `NO_SE_RETIRA_POR_AQUI` | «Este archivo no se retira por datos personales» |

**Textos de pantalla fijos** (anexo): «Origen distinto: {origen}»; «Consolidado del proceso»; «Sin plan»; «Decidir la
acción de mejora de {código} {nombre}, {periodo}»; «Registrar la respuesta al ente del plan {código}»; «Este hallazgo se
reabrió una vez. Puede abrir una no conformidad para tratar la causa.» (con «{n} veces» si son más); «Este punto acumula
{n} hallazgos en {m} meses. Puede abrir una no conformidad para tratar la causa.»; «Este impacto está vencido y ya se
escaló. Puede abrir un hallazgo.»; «La corrección está en un hallazgo de verificación de Distribución»; «Pídale al líder
del proceso o al Administrador del SGC que lo solicite desde aquí»; «Lo que escriba aquí lo leerán quienes participan en
el trámite»; «Atiende una actividad de mejoramiento»; «Aprobado fuera de la plataforma».

**Precisiones de este plan sobre el anexo** (lo que el anexo dejó al constructor y aquí queda decidido):

- La clasificación es **una** tabla (`mejora_clasificacion`), con el plan y el objetivo.
- Los selectores (hallazgos para un plan, trámites para una actividad) son **páginas** con su formulario de búsqueda, no
  diálogos con una ruta JSON: no hay rutas `GET` nuevas que devuelvan datos, salvo el Excel.
- El oficio de una respuesta desde el plan se sube antes, como archivo del plan, y se **elige** en el formulario (como en
  la 15A): una Server Action no recibe el archivo.
- La unicidad de «una salida en vigor» por medición se serializa con
  `pg_advisory_xact_lock(hashtext('sgc.mejora.marca'), <medicionId>::int)`.
  Su prueba va en serie y comprueba que el candado es la primera sentencia: una medición marcada exige una ficha
  aprobada, que ningún test puede dejar confirmada fuera de una transacción revertida (`AGENTS.md`), así que no hay
  prueba con dos conexiones.
- «Ya estaba subido cuando el plan se envió por primera vez» se decide por el orden de las filas de `auditoria` (la
  subida del archivo frente al primer `mejora_enviar_plan` del hallazgo, o a su `mejora_cargar`), como `oficiosPosibles`.

## Puntos de control del controlador (navegador: claro, oscuro y 390 px)

Después de las Tareas 4 (la pestaña y la página del plan, contra las maquetas 1 y 2), 7 (el Excel del ente y el
SGC-FO-14, maquetas 3 y 4), 9 (la marca, maqueta 5), 11 (el hallazgo de verificación y el impacto, maqueta 6), 12 (el
cambio documental, maqueta 7) y 13 (las otras páginas, maqueta 8); y la demostración de §15.2 del anexo en la Tarea 16.

## Review Focus

1. **Un líder abre un plan que cruza procesos.** No puede deducir que hay más hallazgos: ni por las cifras, ni por el
   avance, ni por el historial, ni por la búsqueda global, ni por el selector, ni por un 403 donde otro recibe 404.
   Pruebas en las Tareas 4, 5 y 6.
2. **Dos personas deciden la misma marca** (una con ocurrencia y otra con «no requiere»): queda una sola salida en
   vigor y la segunda recibe `MARCA_YA_DECIDIDA`; cada salida toma el candado de la medición antes que nada. Prueba en
   la Tarea 8.
3. **El trámite enlazado termina cuando el hallazgo ya cerró.** Publicar no falla, la pasada no toca el enlace y nadie
   recibe un aviso. Prueba en la Tarea 12.
4. **Un hallazgo cambia de estado con el formulario de la respuesta al ente abierto.** No se registra nada y la pantalla
   pide revisar (`LISTOS_CAMBIARON`). Prueba en la Tarea 5.
5. **Parámetros forzados en `/mejoramiento/nuevo` y en `/tramites/nueva`:** un plan sin permiso, un documento restringido,
   una medición de un indicador que la persona no ve, un hallazgo de verificación ajeno, un impacto de otro proceso, una
   actividad terminada. La página los ignora sin decir por qué y el servidor no escribe el enlace. Pruebas en las Tareas
   3, 8, 10, 11 y 12.
6. **El rol Consulta en las páginas de un documento, un indicador, una norma y «Objetivos»:** ni lista, ni conteo, ni un
   cero; solo «Reportar». Prueba en la Tarea 13.
7. **La marca desaparece (un recálculo) con el formulario de registro abierto desde el panel:** el hallazgo se registra
   citando la medición y no se escribe ninguna salida. Prueba en la Tarea 8.
8. **Más de 50 hallazgos abiertos:** la lista pagina, las cifras cuentan todo, el Excel exporta todo y el número de
   consultas de una página no crece con las filas. Prueba en la Tarea 14.

---

### Task 1: Base de trabajo y la migración `0019`

**Files:**
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts` (el `REVOKE` literal), `src/lib/permisos.ts`, `src/lib/subida.ts`
  (`CONTEXTOS_EVIDENCIA`, `CONTEXTOS_CON_EXCEL`), `src/db/semillas/minima.ts` (`limpiarTodo`),
  `src/db/consultas/mejoramiento/config.ts` (`ConfigMejora`, `CONFIG_MEJORA_DEFECTO`, `CAMPOS_MEJORA`, `CAMPOS_FORMATO`),
  `src/db/consultas/indicadores/mediciones.ts` (`conDatos`, `citadoEnMejoramiento`),
  `src/db/consultas/indicadores/maestros.ts` (el borrado de un objetivo), `src/db/consultas/admin.ts`
  (`deshacerCargaEn`), `.gitignore` (`almacen-f15b/`), `CONTEXT.md` (Paso 0)
- Create: `drizzle/0019_fase15b-planes-enganches.sql` (y su snapshot), `tests/mejora-esquema-15b.test.ts`
- Test: `tests/mejora-esquema-15b.test.ts`, `tests/mejora-esquema.test.ts`, `tests/privilegios-bd.test.ts`,
  `tests/permisos.test.ts`, `tests/mejora-config.test.ts`, `tests/semilla-minima.test.ts`

**Interfaces:**
- Produces: las tablas y columnas de «Nombres fijos»; `Permiso` admite `"mejora.planes"`; `ConfigMejora` gana
  `formatos.plan: number | null`, `sugerirHallazgos: number` y `sugerirMeses: number`; `CONTEXTOS_EVIDENCIA` incluye
  `"mejora_plan"`.

- [ ] **Step 0: Base de trabajo aparte (lo hace el controlador).** Este plan y el anexo ya están confirmados en `main`.
  `git worktree add F:/sgc-integral-f15b -b fase-15b-planes-enganches main`; en el worktree, `npm ci`; copie
  `.env.example` a `.env.f15b`, cambie el nombre de la base por `sgc_f15b` en `DATABASE_URL` y `DATABASE_URL_MIGRADOR` y
  añada `ALMACEN_RUTA=./almacen-f15b`. **No cambie `BD_APP_CLAVE`.** Copie a `<espacio>` las maquetas
  (`F:\sgc-integral\.superpowers\brainstorm\963-1795030914\content\pantallas-15b.html`). Añada `almacen-f15b/` a
  `.gitignore`. Cree `<espacio>/con-f15b.sh`:

```bash
#!/usr/bin/env bash
# Corre una orden en el worktree de la 15B con el entorno de su base aparte. Nunca toca la base `sgc`.
set -euo pipefail
cd /f/sgc-integral-f15b
set -a; . ./.env.f15b; set +a
case "$DATABASE_URL $DATABASE_URL_MIGRADOR" in *"/sgc_f15b "*"/sgc_f15b") ;; *) echo "El entorno no apunta a sgc_f15b" >&2; exit 1 ;; esac
exec "$@"
```

```bash
docker exec sgc-integral-bd-1 psql -U sgc -d postgres -c 'CREATE DATABASE sgc_f15b OWNER sgc'
bash <espacio>/con-f15b.sh npm run db:preparar && bash <espacio>/con-f15b.sh npm run db:seed && bash <espacio>/con-f15b.sh npm run admin:asegurar
bash <espacio>/con-f15b.sh env SEMILLA_RECIEN=1 npm test
```

  Expected: «Migraciones al día» con diecinueve migraciones; la suite en verde. Anote la línea base (archivos y pruebas)
  en `<espacio>/progress.md`. Corrija en `CONTEXT.md` el punto de reanudación: la 15B está en curso en este worktree,
  contra `sgc_f15b`. Confirme: `docs(f15b): la 15B empieza en su worktree`.

- [ ] **Step 1: Write the failing test** `tests/mejora-esquema-15b.test.ts` (con base, todo dentro de `revertida`; filas
  mínimas por SQL directo o con `hallazgoEn` de `tests/utiles/mejoramiento.ts`):
  - `las dos tablas de solo inserción rechazan UPDATE y DELETE también al dueño`: sobre una fila de `mejora_plan_eventos`
    y otra de `mejora_marcas`, con la conexión del migrador, código `42501`.
  - `un hallazgo cerrado se clasifica y se reclasifica`: con un hallazgo en `cerrado`, `INSERT`, `UPDATE` y `DELETE` en
    `mejora_clasificacion` pasan, y también un `INSERT` en `mejora_plan_eventos` con ese `hallazgo_id`.
  - `a lo sumo un plan por hallazgo`: la segunda fila de `mejora_clasificacion` del mismo hallazgo da `23505`.
  - `la clasificación no queda vacía`: con `plan_id` y `objetivo_id` nulos, `23514`.
  - `el enlace con un trámite es de un hallazgo en curso`: `INSERT` en `mejora_actividad_tramites` sobre un hallazgo
    `cerrado` da `42501`; el mismo trámite enlazado a dos actividades da `23505`.
  - `un origen, a lo sumo un hallazgo que cuente` (tres casos: `verificacion_hallazgo_id`, `impacto_id`,
    `impacto_indicador_id`): dos hallazgos `por_aceptar` con el mismo valor dan `23505`; con el primero en `anulado` o
    en `rechazado`, el segundo se inserta.
  - `la marca es coherente`: `no_requiere` con `hallazgo_id`, o `hallazgo` sin él, o `no_requiere` sin justificación,
    `23514`; dos filas de la misma medición se admiten.
  - `los borrados que ya existen conocen lo nuevo` (cuatro casos): una medición con una fila en `mejora_marcas` cuenta
    para `conDatos`; `citadoEnMejoramiento` es verdadero para un indicador con una marca o citado por un reporte; borrar
    un objetivo que tiene un plan o una clasificación responde con un error de dominio («El objetivo está en uso en
    Mejoramiento»), no con `23503`; `deshacerCargaEn` de un documento que cita un reporte responde con un error de
    dominio («Un reporte de mejoramiento cita este documento»), no con `23503`.

  En `tests/privilegios-bd.test.ts`, un `it` por cada tabla de solo inserción nueva. En `tests/permisos.test.ts`, la
  fila `mejora.planes`: sí para `admin_sgc` y `control_interno`, no para los otros tres. En `tests/mejora-config.test.ts`:
  las tres claves nuevas se leen con su valor por omisión y `mej_sugerir_hallazgos` fuera de 2 a 20 se rechaza.

- [ ] **Step 2: Run** `bash <espacio>/con-f15b.sh npx vitest run tests/mejora-esquema-15b.test.ts`. Expected: FAIL (las
  tablas no existen).

- [ ] **Step 3: Declare las tablas y las columnas en `src/db/esquema.ts`** (bloque nuevo al final, con el comentario de
  fase; las de solo inserción, con el comentario `// Solo-inserción (trigger en la migración 0019 y REVOKE en
  roles-bd.ts)`), añada `mejora_plan` al `CHECK` `archivos_contexto_valido` y genere:
  `bash <espacio>/con-f15b.sh npm run db:generate -- --name fase15b-planes-enganches`.

- [ ] **Step 4: Complete la migración a mano,** después de lo generado (cada sentencia termina en
  `;--> statement-breakpoint`):
  - `CREATE TRIGGER <tabla>_inmutable BEFORE UPDATE OR DELETE … EXECUTE FUNCTION sgc_impedir_modificacion();` para
    `mejora_plan_eventos` y `mejora_marcas`.
  - `CREATE TRIGGER mejora_actividad_tramites_hallazgo_terminado BEFORE INSERT OR UPDATE OR DELETE ON
    "mejora_actividad_tramites" FOR EACH ROW EXECUTE FUNCTION sgc_impedir_si_hallazgo_terminado();` (la función ya
    existe: **no** la redefina).
  - `INSERT INTO configuracion (clave, valor) VALUES ('mej_formato_plan_documento_id', ''), ('mej_sugerir_hallazgos',
    '3'), ('mej_sugerir_meses', '12') ON CONFLICT (clave) DO NOTHING`.
  - Compruebe que los tres índices únicos parciales salieron con su `WHERE`; si Drizzle no los generó así, escríbalos a
    mano y quítelos de lo generado.

- [ ] **Step 5: Lo que rodea al esquema.** `roles-bd.ts`: las dos tablas de solo inserción, en el `REVOKE UPDATE,
  DELETE`. `permisos.ts`: `"mejora.planes": ["admin_sgc", "control_interno"]`. `subida.ts`: `mejora_plan` en
  `CONTEXTOS_EVIDENCIA` y en `CONTEXTOS_CON_EXCEL`. `minima.ts`: las tablas nuevas en el `TRUNCATE` de `limpiarTodo`.
  `config.ts`: las tres claves, con sus rangos, y `plan` en `CAMPOS_FORMATO`. Los borrados: `conDatos` gana su `EXISTS`
  sobre `mejora_marcas.medicion_id`; `citadoEnMejoramiento`, uno sobre `mejora_marcas.indicador_id` y otro sobre
  `mejora_reportes.indicador_id`; el borrado de un objetivo (`maestros.ts`) y `deshacerCargaEn` (`admin.ts`), su
  comprobación previa con los dos mensajes del Step 1.

- [ ] **Step 6: Run** `bash <espacio>/con-f15b.sh npm run db:preparar` (Expected: «Migraciones al día», veinte) y
  `bash <espacio>/con-f15b.sh npx vitest run tests/mejora-esquema-15b.test.ts tests/mejora-esquema.test.ts
  tests/privilegios-bd.test.ts tests/permisos.test.ts tests/mejora-config.test.ts tests/semilla-minima.test.ts
  tests/indicadores-importacion.test.ts`; `npm run lint`. Expected: PASS. `tests/mejora-esquema.test.ts` exige un índice
  completo en cada llave foránea de `mejora_*`: si falla, falta un índice. Compruebe con `git diff drizzle/0017*
  drizzle/0018*` que no cambiaron.

- [ ] **Step 7: Commit** `feat(f15b): migración 0019, las tablas de planes, marcas y enlaces`.

---

### Task 2: El plan: reglas, escrituras, clasificación y alcance

**Files:**
- Create: `src/lib/mejoramiento/planes.ts`, `src/db/consultas/mejoramiento/planes.ts`,
  `src/db/consultas/mejoramiento/clasificacion.ts`, `tests/mejora-planes-reglas.test.ts`, `tests/mejora-planes.test.ts`
- Modify: `src/lib/esquemas/mejoramiento.ts` (`EsquemaPlan`), `src/lib/alcance.ts`, `src/lib/bitacora-detalle.ts`,
  `tests/utiles/mejoramiento.ts` (`planDeMejoraDePrueba`)
- Test: los dos nuevos, `tests/bitacora-detalle.test.ts`, `tests/mejora-alcance.test.ts`

**Interfaces:**
- Consumes: `bloquearHallazgo`, `hallazgoBase` (`flujo.ts`); `vistaCompletaDeHallazgo`, `filtroHallazgos` (`alcance.ts`);
  `contextoDeMejora`; `legible`; `sumarMeses` (`src/lib/vigencia/plazo.ts`).
- Produces, en `src/lib/mejoramiento/planes.ts` (puro):
  - `codigoDePlan(vigencia: number, n: number): string` y `PATRON_DE_PLAN: RegExp`.
  - `type EstadoDePlan = "sin_hallazgos" | "abierto" | "cerrado" | "anulado"`, `ETIQUETA_ESTADO_PLAN` («Sin hallazgos»,
    «Abierto», «Cerrado», «Anulado») y `estadoDePlan(p: { anulado: boolean; cuentan: number; abiertos: number }): EstadoDePlan`.
  - `avanceDePlan(avances: ReadonlyArray<number | null>): number | null`: el promedio simple, redondeado, de los no
    nulos; nulo si no hay ninguno.
  - `plazoEnTexto(inicio: string, fin: string): string` (anexo §4.3).
- Produces, en `src/db/consultas/mejoramiento/planes.ts`:
  - `type DatosDePlan = { nombre: string; origen: Origen; fechaEvento: string; vigencia: number; objetivoTexto?: string | null; objetivoId?: number | null; fechaLimiteEnte?: string | null }`.
  - `type PlanBase = { id: number; codigo: string; nombre: string; origen: Origen; vigencia: number; fechaEvento: string; objetivoTexto: string | null; objetivoId: number | null; fechaLimiteEnte: string | null; anulado: boolean }`.
  - `crearPlan(sesion: SesionFlujo, d: DatosDePlan, opciones?: OpcionesFlujo): Promise<{ id: number; codigo: string }>`.
  - `editarPlan(sesion, id: number, d: Omit<DatosDePlan, "vigencia">, opciones?): Promise<void>`.
  - `anularPlan(sesion, d: { planId: number; motivo: string }, opciones?): Promise<void>`.
  - `bloquearPlan(tx: TransactionSql, id: number): Promise<PlanBase>` (`FOR UPDATE`; lanza `PLAN_NO_EXISTE`).
  - `dejarEventoDePlan(tx, e: { planId: number; hallazgoId?: number | null; tipo: string; detalle?: Record<string, unknown>; usuarioId: number; ahora: Date }): Promise<void>`.
- Produces, en `src/db/consultas/mejoramiento/clasificacion.ts` (no importa `lectura.ts`):
  - `ponerEnPlan(sesion, d: { planId: number; hallazgoIds: number[]; conObjetivo?: boolean }, opciones?): Promise<void>`.
  - `sacarDelPlan(sesion, d: { hallazgoId: number; motivo: string }, opciones?): Promise<void>`.
  - `cambiarDePlan(sesion, d: { hallazgoId: number; planId: number; motivo: string; conObjetivo?: boolean }, opciones?): Promise<void>`.
  - `ponerObjetivo(sesion, d: { hallazgoId: number; objetivoId: number | null }, opciones?): Promise<void>`.
  - `clasificarAlNacer(tx: TransactionSql, sesion: SesionFlujo, hallazgoId: number, d: { planId: number | null; objetivoId: number | null }, ahora: Date): Promise<void>` (la usa la Tarea 3; con `planId` y sin `mejora.planes`, guarda solo el objetivo).
  - `type Clasificacion = { planId: number | null; planCodigo: string | null; planNombre: string | null; objetivoId: number | null; objetivo: string | null }` y `clasificacionDe(sql: Cliente, hallazgoIds: number[]): Promise<Map<number, Clasificacion>>`.
- Produces, en `src/lib/alcance.ts`: `filtroPlanes(sql, sujeto)` (fragmento para un `WHERE` sobre el alias `p`: con
  `mejora.ver_todo`, verdadero; si no, existe una clasificación de `p` cuyo hallazgo pasa `vistaCompletaDeHallazgo`) y
  `puedeVerPlan(planId: number, sujeto, opciones?): Promise<boolean>`.
- Produces, en `tests/utiles/mejoramiento.ts`: `planDeMejoraDePrueba(tx, sesion, cambios?: Partial<DatosDePlan>, ahora?: string): Promise<{ id: number; codigo: string }>`.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-planes-reglas.test.ts` (sin base):
  - `codigoDePlan(2026, 2)` es `"PM-2026-02"`; `codigoDePlan(2026, 100)`, `"PM-2026-100"`; los dos cumplen `PATRON_DE_PLAN`.
  - `estadoDePlan`: anulado manda; `cuentan: 0` → `sin_hallazgos`; `abiertos: 1` → `abierto`; `cuentan: 3, abiertos: 0` → `cerrado`.
  - `avanceDePlan([75, 30, null])` es `53`; `avanceDePlan([null])` y `avanceDePlan([])`, `null`.
  - `plazoEnTexto("2023-08-01", "2023-10-31")` es `"3 meses"`; `("2026-10-15", "2026-11-14")`, `"1 mes"`;
    `("2026-11-02", "2026-12-31")`, `"60 días"`; `("2026-12-01", "2026-12-01")`, `"1 día"`; `("2026-01-31", "2026-02-27")`
    (28 días, no es un mes exacto), `"28 días"`; `("2026-02-01", "2026-02-28")`, `"1 mes"`.

  `tests/mejora-planes.test.ts` (con base, en `revertida`, con `baseDeMejora(tx)`):
  - `crearPlan` como Control Interno da `PM-<vigencia>-01` y el siguiente de la misma vigencia, `-02`; otra vigencia
    empieza en `-01`; deja el evento `creado` y la bitácora `mejora_plan_crear` con el nombre y sin `objetivoTexto`.
  - `crearPlan` como líder o como Gerencia lanza por permiso.
  - La fecha del ente: obligatoria con origen `ente_control` («Escriba la fecha límite del ente»), opcional con
    `auditoria_externa`, y con un origen interno se guarda nula aunque llegue.
  - `editarPlan` deja el evento `editado` con el antes y el después de lo que cambió, y **no** cambia el origen, la
    fuente ni la fecha del ente de un hallazgo que ya está en el plan.
  - `anularPlan` con un hallazgo dentro lanza `PLAN_CON_HALLAZGOS`; vacío, con motivo de 9 caracteres, `MOTIVO_CORTO`;
    con motivo, queda anulado, y `editarPlan`, `ponerEnPlan` y un `crearPlan` posterior respetan que su código no se reutiliza.
  - `ponerEnPlan` con un hallazgo `cerrado`: entra, la fila del hallazgo no cambia (compare `to_jsonb(h)` antes y
    después) y queda el evento `entra`. Con uno `anulado`, `NO_CUENTA_PARA_PLAN`. Con uno que ya está en otro plan,
    `YA_EN_UN_PLAN`. En un plan anulado, `PLAN_ANULADO`.
  - `ponerEnPlan` con `conObjetivo` (por omisión, verdadero): el hallazgo sin objetivo recibe el del plan; el que ya
    tiene uno lo conserva; con `conObjetivo: false`, no lo recibe.
  - `sacarDelPlan` sin motivo, `MOTIVO_CORTO`; con motivo, deja el evento `sale` con el motivo en el evento y **sin** él
    en la bitácora; si el hallazgo tenía objetivo, la fila de clasificación queda con el objetivo; si no, se borra.
  - `cambiarDePlan` deja un evento `sale` en un plan y un `entra` en el otro, en una transacción.
  - `ponerObjetivo` sobre un hallazgo `cerrado` funciona y deja la bitácora `mejora_objetivo` con el antes y el después
    (id y enunciado); con un objetivo inactivo, `OBJETIVO_INACTIVO`; con `null`, lo quita.
  - `clasificarAlNacer` de un líder con `planId`: guarda solo el objetivo, sin lanzar.
  - `puedeVerPlan`: Gerencia, sí, también de un plan vacío; el líder de un proceso con un hallazgo dentro, sí; el líder
    de otro proceso, no; el responsable de una actividad de un hallazgo del plan (rol `consulta`), no; quien registró un
    hallazgo del plan, sí.

- [ ] **Step 2: Run** `bash <espacio>/con-f15b.sh npx vitest run tests/mejora-planes-reglas.test.ts tests/mejora-planes.test.ts`.
  Expected: FAIL (los módulos no existen).

- [ ] **Step 3: Implemente** los tres módulos y las dos funciones de `alcance.ts`. Toda escritura: `requerirPermiso(sesion,
  "mejora.planes")`, una transacción, `bloquearPlan` **antes** que cualquier fila de clasificación, `legible()` alrededor,
  `opciones.ahora` como la hora de todo lo escrito. Entidad de bitácora `mejora_plan`, con el id del plan. El consecutivo,
  con `INSERT … ON CONFLICT (vigencia) DO UPDATE SET ultimo = mejora_plan_consecutivos.ultimo + 1 RETURNING ultimo`.
  `EsquemaPlan` es `.strict()`: nombre de 5 a 200; `objetivoTexto` hasta 1.000; fechas y vigencia del 2000 al 2100. Las
  frases de las siete acciones de bitácora de planes y de `mejora_objetivo`, en `bitacora-detalle.ts`.

- [ ] **Step 4: Run** los dos tests, `tests/bitacora-detalle.test.ts`, `tests/mejora-alcance.test.ts` y `npm run lint`.
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): el plan de mejoramiento y la clasificación de un hallazgo`.

---

### Task 3: El registro gana «A qué se refiere», el objetivo y sus parámetros

**Files:**
- Create: `src/db/consultas/mejoramiento/prellenado.ts`, `tests/mejora-prellenado.test.ts`
- Modify: `src/app/(app)/mejoramiento/nuevo/page.tsx`, `src/componentes/mejoramiento/FormularioHallazgo.tsx`,
  `src/componentes/mejoramiento/FormularioCarga.tsx`, `src/lib/esquemas/mejoramiento.ts` (`EsquemaHallazgo`, y el de la
  carga), `src/db/consultas/mejoramiento/registro.ts` (`DatosDeHallazgo`, `registrarHallazgo`),
  `src/db/consultas/mejoramiento/carga.ts`, `src/db/consultas/mejoramiento/opciones.ts`, `src/app/acciones-mejoramiento.ts`,
  `src/lib/mejoramiento/rutas.ts`
- Test: `tests/mejora-prellenado.test.ts`, `tests/mejora-registro.test.ts`, `tests/mejora-pantallas.test.tsx`

**Interfaces:**
- Consumes: `clasificarAlNacer` (Tarea 2); las reglas de alcance de cada módulo: `filtroAcceso` (documentos),
  `puedeVerIndicador` (`alcance.ts`); `puede(sesion, "mejora.planes")`.
- Produces:
  - `DatosDeHallazgo` gana `planId?: number | null` y `objetivoId?: number | null` (los demás campos ocultos los añaden
    las Tareas 8, 10 y 11).
  - `type Prellenado = { valores: Partial<DatosDeHallazgo>; fijos: ReadonlyArray<keyof DatosDeHallazgo>; ocultos: Record<string, string>; rotulo: string | null }`
    (`rotulo` es la línea que el formulario muestra arriba: «Se registra dentro del plan PM-…», y las que añadan las
    tareas siguientes).
  - `type ParametrosDeRegistro = { plan?: string; documento?: string; indicador?: string; proceso?: string; medicion?: string; verificacion?: string; impacto?: string; impactoIndicador?: string }`.
  - `prellenadoDeRegistro(sesion: SesionFlujo, p: ParametrosDeRegistro, opciones?: Opciones): Promise<Prellenado>`. En
    esta tarea resuelve `plan`, `documento`, `indicador` y `proceso`; lo que no reconoce o no admite, lo ignora. Las
    Tareas 8, 10 y 11 le añaden su rama. Si llega más de uno de `medicion`, `verificacion`, `impacto` e
    `impactoIndicador`, se usa el primero de esa lista.
  - `rutaDeRegistro(p: ParametrosDeRegistro): string` en `rutas.ts`.
  - El formulario pinta la sección **«A qué se refiere»**: un documento (los que la persona ve), un indicador (activo o
    retirado, los que ve) y, con él, una de sus mediciones con resultado; y el campo **«Objetivo»** (los activos del
    maestro, opcional). Un campo de `fijos` se muestra y no se edita.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-prellenado.test.ts` (con base, en `revertida`):
  - `plan` de un plan que existe, como Control Interno: `valores` trae el origen del plan, su nombre como `fuente`, su
    `fechaLimiteEnte` y su `objetivoId`; `ocultos.planId` es su id; `fijos` está vacío; `rotulo` nombra el código.
  - `plan` como líder (sin `mejora.planes`), de un plan anulado, o con un id que no existe: `Prellenado` vacío, sin lanzar.
  - `documento` (por código) que la persona ve: `valores.documentoId` y `valores.procesoId` (el del documento); uno
    restringido que no ve, o un código que no existe: vacío.
  - `indicador` (por código) que ve: `valores.indicadorId` y su proceso; uno restringido que no ve: vacío.
  - `proceso` (por slug) donde puede registrar: `valores.procesoId`; un líder con un proceso que no lidera: vacío.
  - `documento` y `plan` juntos se combinan.

  En `tests/mejora-registro.test.ts`:
  - `registrarHallazgo` con `planId` como Control Interno: el hallazgo queda en el plan y el plan tiene su evento `entra`.
  - Con `planId` como líder: nace sin plan y sin error.
  - Con `objetivoId` como líder: queda con ese objetivo; con uno inactivo, `OBJETIVO_INACTIVO`.
  - Con `documentoId` de un documento que quien registra no ve: se rechaza con el mensaje que `revisarIdentificacion` ya
    da para un enlace que no existe (el mismo para «no existe» y «no lo ve»).

  En `tests/mejora-pantallas.test.tsx`: el formulario pinta «A qué se refiere» y «Objetivo»; un campo fijo aparece como
  texto con su campo oculto, no como control.

- [ ] **Step 2: Run** los tres. Expected: FAIL.

- [ ] **Step 3: Implemente.** La página lee `searchParams`, llama `prellenadoDeRegistro` y pasa `Prellenado` al
  formulario (el de registro y el de la carga). `registrarHallazgo` (y `cargarHallazgo`) llaman `clasificarAlNacer`
  después de `nacerHallazgo`, en la misma transacción. `revisarIdentificacion` valida ya los enlaces: añada la regla de
  alcance de quien registra para el documento, el indicador y la medición, con el mismo mensaje para «no existe» y «no lo
  ve». Las listas de «A qué se refiere» salen de `opciones.ts`, filtradas por lo que la persona ve.

- [ ] **Step 4: Run** los tres tests, `tests/mejora-carga.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): el registro gana a qué se refiere, el objetivo y sus parámetros`.

---

### Task 4: La pestaña «Planes», la página del plan y la clasificación en el hallazgo

**Files:**
- Create: `src/db/consultas/mejoramiento/planes-lectura.ts`; páginas `src/app/(app)/mejoramiento/planes/page.tsx`,
  `planes/nuevo/page.tsx`, `planes/[id]/page.tsx`, `planes/[id]/editar/page.tsx`, `planes/[id]/anadir/page.tsx`;
  componentes en `src/componentes/mejoramiento/planes/`: `ListaDePlanes.tsx`, `FormularioPlan.tsx`,
  `EncabezadoDelPlan.tsx`, `HallazgosDelPlan.tsx`, `DatosDelPlan.tsx`, `HistorialDelPlan.tsx`, `SelectorDeHallazgos.tsx`,
  `DialogoSacarDelPlan.tsx`, `DialogoAnularPlan.tsx`; `src/componentes/mejoramiento/SeccionClasificacion.tsx`;
  `tests/mejora-planes-lectura.test.ts`, `tests/mejora-planes-pantallas.test.tsx`
- Modify: `src/app/(app)/mejoramiento/_comun.ts` (`exigirPlan`), `src/componentes/mejoramiento/PestanasMejoramiento.tsx`,
  `src/app/(app)/mejoramiento/[id]/page.tsx`, `src/db/consultas/mejoramiento/lectura.ts` (`DetalleDeHallazgo.clasificacion`),
  `src/db/consultas/mejoramiento/busqueda.ts` y quien la llama en la búsqueda global, `src/app/acciones-mejoramiento.ts`,
  `src/lib/mejoramiento/rutas.ts`, `tests/paginas-sesion.test.ts` (admite `exigirPlan` como guarda de página)
- Test: los dos nuevos, `tests/mejora-busqueda.test.ts`, `tests/paginas-sesion.test.ts`, `tests/acciones-permisos.test.ts`

**Interfaces:**
- Consumes: Tarea 2 completa; `listarHallazgos` y `FilaDeHallazgo` (`lectura.ts`); `fechasMinimasDe`; `venceLaActividad`.
- Produces, en `planes-lectura.ts`:
  - `type PlanDeLaLista = { id: number; codigo: string; nombre: string; origen: Origen; vigencia: number; fechaEvento: string; fechaLimiteEnte: string | null; estado: EstadoDePlan; hallazgos: number; abiertos: number; conAlgoVencido: number; avance: number | null }`.
  - `listarPlanes(sesion, filtro: { q?: string; vigencia?: number; origen?: Origen; soloAbiertos?: boolean; anulados?: boolean }, opciones?): Promise<PlanDeLaLista[]>`.
  - `type FilaDelPlan = FilaDeHallazgo & { origenDistinto: boolean; cuenta: boolean }`.
  - `type EventoDelPlan = { tipo: string; en: Date; por: string; hallazgo: string | null; texto: string }`.
  - `type DetalleDePlan = PlanDeLaLista & { objetivoTexto: string | null; objetivo: string | null; objetivoId: number | null; anuladoMotivo: string | null; grupos: Array<{ procesoId: number; proceso: string; filas: FilaDelPlan[] }>; historial: EventoDelPlan[]; puede: { gestionar: boolean; verTodo: boolean; responder: boolean } }`.
  - `leerPlan(sesion, id: number, opciones?): Promise<DetalleDePlan | null>` (nulo si no existe o no lo ve).
  - `veAlgunPlan(sesion, opciones?): Promise<boolean>`.
  - `candidatosParaPlan(sesion, planId: number, filtro: { q?: string; proceso?: number; origen?: Origen; anio?: number }, opciones?): Promise<Array<{ id: number; codigo: string; titulo: string; proceso: string; origen: Origen; estado: string }>>` (hasta 50; solo con `mejora.planes`).
- Produces, en `_comun.ts`: `exigirPlan(id: string): Promise<{ sesion: SesionFlujo; plan: DetalleDePlan }>` (llama
  `notFound()` si el id no es numérico, no existe o no se ve).
- Produces, en `lectura.ts`: `DetalleDeHallazgo.clasificacion: { plan: { id: number; codigo: string; nombre: string; enlace: boolean } | null; objetivo: string | null; objetivoId: number | null; puedeClasificar: boolean }`.
- Produces, acciones (todas `mutacion(formData, "mejora.planes", …)`): `crearPlanAccion`, `editarPlanAccion`,
  `anularPlanAccion`, `ponerEnPlanAccion`, `sacarDelPlanAccion`, `cambiarDePlanAccion`, `ponerObjetivoAccion`.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-planes-lectura.test.ts` (con base, en `revertida`): un plan con
  tres hallazgos del proceso A (uno `cerrado`, uno con una actividad vencida, uno `anulado`) y dos del proceso B.
  - Gerencia: `listarPlanes` lo trae con `hallazgos: 4` (el anulado no cuenta), `abiertos: 3`, `conAlgoVencido: 1`;
    `leerPlan` trae dos grupos, el anulado con `cuenta: false`, y el historial entero.
  - El líder de A: `hallazgos: 2`, `abiertos: 1`; `leerPlan` trae **un** grupo; el historial no tiene ninguna línea de
    un hallazgo de B y sí la de creación; `puede.verTodo` es falso.
  - El líder de un proceso C: `listarPlanes` no lo trae y `leerPlan` da `null`. Un id que no existe da `null` también.
  - Un plan sin hallazgos: lo ve Control Interno (`estado: "sin_hallazgos"`) y no el líder de A.
  - `origenDistinto` es verdadero solo en el hallazgo cuyo origen no es el del plan.
  - El avance: con hallazgos de avance 75 y 30 y uno sin plan de acción aprobado, `53`.
  - Un plan anulado solo aparece con `anulados: true`.
  - `candidatosParaPlan`: no trae los que ya están en un plan, ni los anulados ni rechazados; como líder, lanza por permiso.
  - `leerHallazgo` de quien solo tiene una actividad: `clasificacion.plan.enlace` es `false` y trae el código y el nombre.

  `tests/mejora-busqueda.test.ts`: la búsqueda global encuentra un plan por su código y por su nombre para Gerencia y
  para el líder de A; no para el líder de C.

  `tests/mejora-planes-pantallas.test.tsx` (componentes): la lista pinta el estado con texto; la página del plan pinta
  «Origen distinto: Auditoría interna»; sin `puede.gestionar` no hay «Añadir hallazgos», «Editar» ni «Sacar»; sin
  `puede.verTodo` no hay «Excel para el ente»; `SeccionClasificacion` sin `puedeClasificar` no pinta botones.

- [ ] **Step 2: Run** los tres. Expected: FAIL.

- [ ] **Step 3: Implemente las lecturas.** Las cifras y el avance de un plan se calculan **solo con los hallazgos que
  pasan `vistaCompletaDeHallazgo`** para quien mira; «con algo vencido» usa la misma regla de `listarHallazgos`. Sin una
  consulta por hallazgo: las filas de un plan salen de una sola lectura por plan.

- [ ] **Step 4: Implemente las páginas y los componentes,** contra las maquetas 1 y 2. Cada página llama `exigirSesion()`
  en su texto y después `exigirPlan` o, las de alta y edición, `puede(sesion, "mejora.planes")` con `notFound()`. La
  pestaña «Planes» aparece si `veAlgunPlan` o si tiene `mejora.planes`. `planes/[id]/anadir` es el selector: un formulario
  `GET` de búsqueda y otro con casillas que envía `ponerEnPlanAccion` (la casilla «Poner el objetivo del plan a los que
  no tienen», marcada por omisión, solo si el plan tiene objetivo). La página del hallazgo gana `SeccionClasificacion`.
  A 390 px las tablas son tarjetas, como la lista de hallazgos.

- [ ] **Step 5: Run** los tests de la tarea, `tests/paginas-sesion.test.ts`, `tests/acciones-permisos.test.ts`,
  `tests/sin-main.test.ts`, `tests/colores-fijos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15b): la pestaña Planes, la página del plan y la clasificación del hallazgo`.

---

### Task 5: Los archivos del plan y la respuesta al ente desde el plan

**Files:**
- Create: `src/app/api/mejoramiento/planes/[id]/archivos/route.ts`, `src/db/consultas/mejoramiento/respuesta-plan.ts`,
  `src/componentes/mejoramiento/planes/ArchivosDelPlan.tsx`, `src/componentes/mejoramiento/planes/RespuestaAlEnte.tsx`,
  `tests/mejora-planes-archivos.test.ts`, `tests/mejora-respuesta-plan.test.ts`
- Modify: `src/db/consultas/mejoramiento/archivos.ts` (`DestinoDeMejora`, `ROLES_POR_DESTINO`, las carpetas,
  `autorizarSubida`, `exigirDestinoAbierto`, las reglas de quitar), `src/lib/alcance.ts` (`puedeAbrirArchivoDeMejora`),
  `src/proxy.ts`, `tests/proxy-matcher.test.ts`, `src/db/consultas/mejoramiento/registro.ts`
  (`registrarRespuestaAlEnte`), `src/db/consultas/mejoramiento/tareas.ts`, `src/lib/tareas.ts`,
  `src/componentes/mejoramiento/SeccionRespuestaAlEnte.tsx`, `src/db/consultas/mejoramiento/planes-lectura.ts`
  (`DetalleDePlan.archivos` y `.respuesta`), `src/app/(app)/mejoramiento/planes/[id]/page.tsx`,
  `src/app/acciones-mejoramiento.ts`, `src/lib/bitacora-detalle.ts`
- Test: los dos nuevos, `tests/proxy-matcher.test.ts`, `tests/mejora-tareas.test.ts`, `tests/mejora-ente-acciones.test.ts`,
  `tests/handlers-permisos.test.ts`

**Interfaces:**
- Consumes: `bloquearPlan`, `dejarEventoDePlan` (Tarea 2); `bloquearHallazgo`, `dejarEvento` (`flujo.ts`);
  `aprobacionEnVigor` (`registro.ts`); `recibirArchivo` y lo común de `src/app/api/mejoramiento/_subida.ts`.
- Produces, en `respuesta-plan.ts` (liviano: no importa `lectura.ts` ni `planes-lectura.ts`):
  - `esperaRespuesta(sql: Cliente)`: fragmento sobre el alias `h`, la definición única (anexo §3.8): origen externo, no
    terminal, `respuesta_ente_en IS NULL`, y su ronda en vigor con `estado_plan = 'aprobado' AND aprobado_en IS NOT NULL`.
  - `type RespuestaDelPlan = { listos: Array<{ id: number; codigo: string; fechaLimiteEnte: string | null }>; faltan: Array<{ id: number; codigo: string; estado: string }>; respuestas: Array<{ id: number; enviadaEn: string; por: string; oficio: { id: number; nombre: string }; hallazgos: string[] }>; vence: string | null; oficios: Array<{ id: number; nombre: string }> }`.
  - `respuestaDelPlan(sesion, planId: number, opciones?): Promise<RespuestaDelPlan | null>` (nulo sin `mejora.ver_todo`
    o si el plan no tiene ningún hallazgo de origen externo).
  - `registrarRespuestaDelPlan(sesion, d: { planId: number; enviadaEn: string; oficioId: number; vistos: number[] }, opciones?): Promise<void>`.
  - `planQueResponde(sql, hallazgoId: number): Promise<{ id: number; codigo: string } | null>`.
- Produces: `DestinoDeMejora` admite `{ clase: "plan"; id: number }`; `puedeAbrirArchivoDeMejora` admite el contexto
  `mejora_plan` (solo `mejora.ver_todo`).
- Produces, tarea: `mej-ente-plan:<planId>`, para quien tiene `mejora.gestionar`.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-planes-archivos.test.ts`:
  - Sube Control Interno; un líder del plan recibe `autorizarSubida` denegada con la misma respuesta que un plan que no existe.
  - `puedeAbrirArchivoDeMejora` de un archivo del plan: Gerencia sí; el líder de un hallazgo del plan, no.
  - En un plan anulado no se sube (`exigirDestinoAbierto` lanza `PLAN_ANULADO`).
  - Quien lo subió lo quita; otro Control Interno no; el Admin SGC sí; el oficio de una respuesta registrada, nadie.
  - Subir y quitar dejan sus eventos `archivo` y `archivo_quitado` en el plan.

  `tests/proxy-matcher.test.ts`: `api/mejoramiento/planes/5/archivos` (sola y con `?x=1`) queda fuera del proxy;
  `planes/5/archivos/7`, `planes/x/archivos` y `planes/5` siguen pasando por él.

  `tests/mejora-respuesta-plan.test.ts` (un plan de `ente_control` con: H1 y H2 «En ejecución», H3 «En revisión», H4
  cerrado con corrección, H5 de origen interno):
  - `respuestaDelPlan`: `listos` son H1 y H2; `faltan`, H3; `vence` es la menor fecha del ente de los listos.
  - `registrarRespuestaDelPlan` con `vistos: [H1, H2]`: los dos quedan con `respuesta_ente_en` y `respuesta_ente_por`,
    cada uno con su evento `respuesta_ente` (con `planId`) y su bitácora; el plan, con su evento `respuesta` y una fila
    en `mejora_plan_respuestas` con dos hallazgos. H3 no cambia.
  - Con `vistos: [H1]` (la lista cambió): `LISTOS_CAMBIARON` y no se escribe nada.
  - Sin listos: `SIN_LISTOS`. Con una fecha futura: `ENVIO_FUTURO`. Con una fecha anterior al día de la aprobación más
    reciente de los incluidos: el mensaje de `envioAntesDeAprobar`.
  - Con un archivo que no es del plan: `OFICIO_AJENO_AL_PLAN`; con el oficio de otra respuesta: `OFICIO_DE_OTRA`.
  - Como Control Interno (sin `mejora.gestionar`), lanza por permiso.
  - Después, H3 se aprueba y una segunda respuesta lo cubre: el plan tiene dos respuestas.
  - `registrarRespuestaAlEnte` (la de la 15A) sobre H1: `RESPONDA_DESDE_EL_PLAN`; sobre un hallazgo externo sin plan,
    funciona como antes.
  - Sacar H1 del plan después no borra su respuesta.
  - `leerHallazgo` de H1 ya respondido: su líder recibe la fecha de la respuesta y quién la registró, y **no** el nombre
    ni el enlace del oficio (es un archivo del plan); Gerencia, sí.

  `tests/mejora-tareas.test.ts`: con ese plan, el Admin SGC tiene **una** tarea `mej-ente-plan:<id>` («Registrar la
  respuesta al ente del plan PM-…»), que vence en la menor fecha de los listos, y **ninguna** `mej-ente:` de H1 ni H2; un
  hallazgo externo suelto sigue dando su `mej-ente:`; respondidos los dos, la tarea desaparece; Control Interno no la tiene.

- [ ] **Step 2: Run** los tests de la tarea. Expected: FAIL.

- [ ] **Step 3: Implemente los archivos del plan.** El handler copia el de `api/mejoramiento/reportes/[id]/archivos`
  (`recibirArchivo`, `content-length`, `origenValido`), con `autorizarSubida({ clase: "plan", id })`. Añada al `matcher`
  de `src/proxy.ts` `api/mejoramiento/planes/[0-9]+/archivos$` (con `[.]` donde haya un punto literal, como las demás).

- [ ] **Step 4: Implemente la respuesta.** `registrarRespuestaDelPlan`: `requerirPermiso(sesion, "mejora.gestionar")`;
  en una transacción, `bloquearPlan`, después cada hallazgo de `vistos` con `bloquearHallazgo` **por id ascendente**;
  relee los listos con todo bloqueado y los compara con `vistos` (mismos ids); escribe. `registrarRespuestaAlEnte`
  rechaza con `RESPONDA_DESDE_EL_PLAN` cuando `planQueResponde` devuelve un plan. La tarea `mej-ente` de `tareas.ts`
  excluye los hallazgos con plan (`NOT EXISTS` sobre `mejora_clasificacion` con `plan_id` no nulo), y la nueva sale de
  una sola consulta agrupada por plan. `SeccionRespuestaAlEnte` dice «La respuesta se registra desde el plan PM-…», con
  enlace solo si la persona ve el plan.

- [ ] **Step 5: Run** los tests de la tarea, `tests/mejora-archivos.test.ts`, `tests/handlers-permisos.test.ts`,
  `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15b): los archivos del plan y la respuesta al ente desde el plan`.

---

### Task 6: Las filas de un plan de acción y el Excel para el ente

**Files:**
- Create: `src/db/consultas/mejoramiento/filas-de-plan.ts`, `src/lib/mejoramiento/excel-ente.ts`,
  `src/app/(app)/mejoramiento/planes/[id]/excel/route.ts`, `tests/mejora-filas-de-plan.test.ts`,
  `tests/mejora-excel-ente.test.ts`
- Modify: `src/lib/bitacora-detalle.ts`, `src/componentes/mejoramiento/planes/EncabezadoDelPlan.tsx` (el botón)
- Test: los dos nuevos, `tests/handlers-permisos.test.ts`

**Interfaces:**
- Consumes: `plazoEnTexto` (Tarea 2); `venceLaActividad`; `neutralizarFormula` (`src/lib/celdas.ts`); el molde del Excel
  de la lista (`src/lib/mejoramiento/excel.ts` y `src/app/(app)/mejoramiento/excel/route.ts`).
- Produces, en `filas-de-plan.ts` (la lectura común del Excel del ente y del SGC-FO-14; **no recibe sesión:** quien la
  llama le pasa hallazgos que ya decidió que se ven):

```ts
export type FilaDePlanDeAccion = {
  hallazgo: { id: number; codigo: string; titulo: string; descripcion: string; clase: Clase; origen: Origen; procesoId: number; proceso: string; planCodigo: string | null };
  ronda: number;
  /** Cuántas rondas tiene el hallazgo: con más de una, el impreso dice la ronda. */
  rondas: number;
  accion: { numero: string; tipo: TipoAccion; descripcion: string; recursos: string | null; indicadorCumplimiento: string | null; meta: string | null; causas: string; metodo: string | null } | null;
  actividad: {
    id: number; descripcion: string; responsable: string; cargo: string | null;
    inicio: string; fin: string; reprogramada: boolean; avance: number;
    estado: "abierta" | "en_proceso" | "terminada" | "cancelada"; vencida: boolean;
    ultimoSeguimiento: { fecha: string; realizado: string } | null; archivos: number;
  } | null;
  /** Solo cuando `actividad` es nula: en qué va el hallazgo o la ronda (anexo §5.3). */
  enQueVa: string | null;
};
export async function filasDePlanDeAccion(sql: Cliente, hallazgoIds: number[], ahora: Date): Promise<FilaDePlanDeAccion[]>;
```

- Produces, en `excel-ente.ts` (puro): `COLUMNAS_DEL_ENTE: readonly string[]` (las trece, en este orden y con este texto:
  «Auditoría o evento», «Vigencia», «Hallazgo», «Acción de mejora», «Plazo», «Fecha de inicio», «Fecha de terminación»,
  «Avance (%)», «Observaciones», «Responsable», «Código», «Causa raíz», «Estado»);
  `estadoDeActividadEnTexto(a: { estado: string; vencida: boolean }): string` («Abierta», «En proceso», «Terminada»,
  «Cancelada», y «Vencida» cuando `vencida`); `filasDelEnte(plan: { nombre: string; vigencia: number }, filas: FilaDePlanDeAccion[]): Array<Array<string | number>>`.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-filas-de-plan.test.ts` (con base, en `revertida`):
  - Un hallazgo con una acción de dos actividades da dos filas, con el mismo `hallazgo` y la misma `accion`, en el orden
    del plan de acción.
  - Uno «Por formular» da una fila con `accion` y `actividad` nulas y `enQueVa` «Por formular: plan de acción en
    formulación»; uno «En revisión», «En revisión».
  - Uno cerrado con corrección: «Cerrado con corrección el {fecha larga}: {descripción de la corrección}»; uno cerrado
    sin acción: «Cerrado sin acción el {fecha larga}».
  - Uno con ronda 2 en borrador y ronda 1 con dos actividades: tres filas (dos de la ronda 1 y una de la ronda 2 con
    `enQueVa`), todas con `rondas: 2`.
  - Una actividad cancelada sale con `estado: "cancelada"`; una con el fin pasado y sin terminar, `vencida: true`.
  - `ultimoSeguimiento` es el más reciente; `archivos` cuenta los de la actividad; `cargo` es nulo si el responsable no
    tiene cargo; `causas` junta las que la acción ataca; `reprogramada` es verdadero con una reprogramación aprobada.
  - El orden: por código del hallazgo, ronda, acción y actividad.
  - Con cincuenta actividades, el número de consultas no pasa de seis (cuente con el cliente que cuenta sentencias de
    `tests/cascaron-consultas.test.ts`).

  `tests/mejora-excel-ente.test.ts`:
  - `filasDelEnte` (puro): la fila de una actividad trae las trece celdas, con las fechas como `2026/11/02`, el plazo de
    `plazoEnTexto`, el avance como número y el cargo en «Responsable» (el nombre si no hay cargo); la fila sin actividad
    trae las columnas 1 a 3 y la 11, `enQueVa` en «Observaciones» y las demás vacías.
  - Un título `=1+1` sale neutralizado (empieza por `'`).
  - La ruta: Gerencia recibe un `.xlsx` con una hoja y la fila de títulos de `COLUMNAS_DEL_ENTE`, y queda la bitácora
    `mejora_exporto_plan_ente`; el líder de un hallazgo del plan recibe **404**, igual que con un plan que no existe; sin
    sesión, 401.
  - Un hallazgo anulado del plan no sale.

- [ ] **Step 2: Run** los dos. Expected: FAIL.

- [ ] **Step 3: Implemente `filasDePlanDeAccion`.** Una fila por actividad de un plan de acción **aprobado** (la
  actividad con `fin_original` no nula), de todas las rondas, las canceladas incluidas; por cada ronda sin plan aprobado,
  y por cada hallazgo sin ninguna, una fila sin actividad. `enQueVa` sale de la etiqueta del estado
  (`src/lib/mejoramiento/estados.ts`) y de `resultado_cierre`. Consultas por lote, no por hallazgo.

- [ ] **Step 4: Implemente `excel-ente.ts` y la ruta.** La ruta: `sesionDePeticion`, 401 sin sesión, **404** sin
  `mejora.ver_todo` o si el plan no existe; los hallazgos del plan que cuentan; `exceljs`; nombre del archivo
  `<codigo>-seguimiento-<AAAAMMDD>.xlsx`.

- [ ] **Step 5: Run** los dos tests, `tests/handlers-permisos.test.ts`, `tests/bitacora-detalle.test.ts` y `npm run lint`.
  Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15b): el Excel para el ente`.

---

### Task 7: El SGC-FO-14, de un plan y consolidado

**Files:**
- Create: `src/db/consultas/mejoramiento/fo14.ts`, `src/componentes/mejoramiento/impresos/PlanDeMejoramientoImpreso.tsx`,
  `src/app/(app)/mejoramiento/planes/[id]/imprimir/page.tsx`, `src/app/(app)/mejoramiento/consolidado/page.tsx`,
  `tests/mejora-fo14.test.ts`
- Modify: `src/db/consultas/mejoramiento/formatos.ts` (el formato `plan`), los formatos de
  `src/app/(app)/admin/(panel)/mejoramiento` (un cuarto selector, «SGC-FO-14 Plan de mejoramiento»),
  `src/app/admin/acciones-mejoramiento.ts`, `src/app/(app)/mejoramiento/page.tsx` (el botón del consolidado cuando la
  lista está filtrada por un proceso), `src/componentes/mejoramiento/planes/HallazgosDelPlan.tsx` (el botón de cada grupo)
- Test: `tests/mejora-fo14.test.ts`, `tests/mejora-impresos-pagina.test.tsx`, `tests/mejora-config.test.ts`

**Interfaces:**
- Consumes: `filasDePlanDeAccion` (Tarea 6); `leerPlan` (Tarea 4); `encabezadoDeFormato`, `lideresDelProceso`
  (`formatos.ts`); `vistaCompletaDeHallazgo`; `ORIGENES` (`src/lib/mejoramiento/origenes.ts`).
- Produces, en `fo14.ts`:

```ts
export type Fo14 = {
  forma: "plan" | "consolidado";
  formato: EncabezadoDelFormato | null;
  encabezado: {
    origenDelPlan: string; codigoDelPlan: string; macroproceso: string; proceso: string;
    responsables: Array<{ nombre: string; cargo: string | null }>;
    vigencia: number; elaboradoEl: string; fuentes: Origen[]; objetivo: string | null;
  };
  filas: FilaDePlanDeAccion[];
  aprobaciones: Array<{ codigo: string; elaboro: { nombre: string; cargo: string | null } | null; aprobo: { nombre: string; cargo: string | null; fecha: string } | null; fuera: { rol: string; fecha: string } | null }>;
};
export async function fo14DePlan(sesion: SesionFlujo, planId: number, procesoId: number, opciones?: Opciones): Promise<Fo14 | null>;
export async function fo14Consolidado(sesion: SesionFlujo, procesoId: number, anio: number, opciones?: Opciones): Promise<Fo14 | null>;
```

  Los dos devuelven `null` (y la página, `notFound()`) si la persona no ve **completos** todos los hallazgos del impreso:
  pasa quien tiene `mejora.ver_todo` y el líder activo de ese proceso.

- [ ] **Step 1: Write the failing test** `tests/mejora-fo14.test.ts` (con base, en `revertida`):
  - `fo14DePlan`: el encabezado trae el origen y el código del plan, su vigencia, su fecha de creación como
    `elaboradoEl`, y como objetivo el texto del plan y su objetivo del maestro; `fuentes` son los orígenes de los
    hallazgos de las filas; solo salen los hallazgos de ese proceso que cuentan.
  - `fo14Consolidado` de 2026: `origenDelPlan` y `codigoDelPlan` son «Consolidado del proceso»; `objetivo` es nulo;
    `elaboradoEl` es hoy; cada fila trae `hallazgo.planCodigo` o nulo (el impreso dirá «Sin plan»).
  - El año, en la zona de la instalación: entra uno registrado el 31 de diciembre de 2026 a las 23:30 de Bogotá y sin
    terminar; entra uno registrado en 2025 y cerrado el 1 de enero de 2026; **no** entra uno registrado en 2025 y cerrado
    el 31 de diciembre de 2025; **no** entra uno registrado el 1 de enero de 2027; un anulado y un rechazado, nunca.
  - Un hallazgo cargado en 2027 con registro en papel de 2026 entra en el consolidado de 2026 (su fecha de registro es
    la del evento `registrar` marcado `fuera`).
  - `aprobaciones`: una línea por hallazgo con plan de acción aprobado; cuando la revisión valió como aprobación,
    `aprobo` es quien firmó «Revisó»; en un cargado, `fuera` trae el rol declarado y la fecha, y `aprobo` es nulo.
  - `responsables`: los líderes activos del proceso; un proceso sin líder da la lista vacía.
  - El líder de otro proceso recibe `null`; el líder del proceso, el `Fo14`; un año fuera de 2000 a 2100, `null`.

  En `tests/mejora-impresos-pagina.test.tsx`: el impreso pinta la columna «Plan» solo en el consolidado, con «Sin plan»;
  la columna «Estado»; la fila sin actividad a lo ancho; «Reprogramada» junto al fin; las catorce fuentes con su marca;
  «Aprobado fuera de la plataforma»; y sin los tres datos del formato cuando `formato` es nulo.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente `fo14.ts`,** el impreso (horizontal: `@page { size: landscape }` en su hoja de estilos de
  impresión, como los impresos de la 15A) y las dos páginas. El impreso sigue la maqueta 4 y las columnas del anexo §5.3.
  El pie dice quién lo imprimió y cuándo.

- [ ] **Step 4: Run** los tests de la tarea, `tests/paginas-sesion.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): el SGC-FO-14, de un plan y consolidado`.

---

### Task 8: La marca de un indicador: pendientes, salidas y tarea

**Files:**
- Create: `src/lib/mejoramiento/marcas.ts`, `src/db/consultas/mejoramiento/marcas.ts`, `tests/mejora-marcas.test.ts`
- Modify: `src/db/consultas/mejoramiento/registro.ts` (`DatosDeHallazgo.marcaMedicionId`, `registrarHallazgo`,
  `registrarOcurrencia`), `src/db/consultas/mejoramiento/prellenado.ts` (la rama `medicion`),
  `src/lib/esquemas/mejoramiento.ts`, `src/db/consultas/mejoramiento/tareas.ts`, `src/lib/tareas.ts` (un grupo para
  `mej-marca:`), `src/lib/bitacora-detalle.ts`, `tests/utiles/mejoramiento.ts` (`medicionMarcada`)
- Test: `tests/mejora-marcas.test.ts`, `tests/mejora-prellenado.test.ts`, `tests/mejora-tareas.test.ts`,
  `tests/cascaron-consultas.test.ts`

**Interfaces:**
- Consumes: `registrarOcurrencia` (`registro.ts`); `puedeVerIndicador`, `filtroHallazgos`, `puedeVerHallazgo`
  (`alcance.ts`); `analisisExigido`, `analisisCompleto` (`src/lib/indicadores/estados.ts`); los textos de un periodo y de
  un valor (`src/lib/indicadores/textos.ts`). **Este módulo lee `mediciones` e `indicadores` por SQL: no importa nada de
  `src/db/consultas/indicadores/`.**
- Produces, en `src/lib/mejoramiento/marcas.ts` (puro): `tituloDeLaMarca(indicador: string, periodo: string): string`
  (hasta 150 caracteres) y `fraseDelResultado(m: { indicador: string; periodo: string; resultado: string; meta: string | null; semaforo: string | null; repetido: boolean }): string`.
- Produces, en `src/db/consultas/mejoramiento/marcas.ts`:
  - `salidaEnVigor(sql: Cliente)`: fragmento sobre el alias `m`: existe en `mejora_marcas` una fila de la medición con
    `salida = 'no_requiere'`, o con un hallazgo cuyo estado no es `rechazado` ni `anulado`.
  - `pendienteDeMarca(sql: Cliente, ahora: Date)`: fragmento sobre `m` (medición) e `i` (indicador), la definición del
    anexo §6.1.
  - `type MarcaDeMedicion = { medicionId: number; periodo: string; resultado: string; estado: "pendiente" | "espera_analisis"; esperaHasta: string | null; causa: string | null; accionPropuesta: string | null }`.
  - `marcasDelIndicador(sesion, indicadorId: number, opciones?): Promise<{ puede: { hallazgo: boolean; noRequiere: boolean }; marcas: MarcaDeMedicion[]; candidatos: Array<{ id: number; codigo: string; titulo: string; estado: string }> } | null>` (nulo para quien no puede ninguna salida).
  - `salidasVisibles(sesion, indicadorId: number, opciones?): Promise<Map<number, { texto: string; enlace: string | null; justificacion: string | null; por: string; en: Date }>>` (por medición; la que apunta a un hallazgo que la persona no ve **no está** en el mapa).
  - `puedeResolverMarca(sql: Cliente, sesion, indicador: { id: number; procesoId: number }): Promise<{ hallazgo: boolean; noRequiere: boolean }>`.
  - `resolverConOcurrencia(sesion, d: { medicionId: number; hallazgoId: number }, opciones?): Promise<void>`.
  - `resolverNoRequiere(sesion, d: { medicionId: number; justificacion: string }, opciones?): Promise<void>`.
  - `salidaAlNacer(tx: TransactionSql, sesion, d: { medicionId: number; hallazgoId: number; desdeElPanel: boolean }, ahora: Date): Promise<void>`.
- Produces: `DatosDeHallazgo.marcaMedicionId?: number | null` (el formulario llegó desde el panel); la rama `medicion` de
  `prellenadoDeRegistro` (fija `indicadorId` y `medicionId`; pone `origen: "indicador"`, el proceso y el subproceso del
  indicador, el título y la descripción propuestos, y `ocultos.marcaMedicionId`); la tarea `mej-marca:<medicionId>`.

- [ ] **Step 1: Write the failing test** `tests/mejora-marcas.test.ts` (con base, en `revertida`; `medicionMarcada(tx,
  { ahora, analizada, vence })` crea, con los ayudantes de `tests/utiles/indicadores.ts`, un indicador activo con una
  medición ordinaria en Crítico):
  - **El pendiente** (`pendienteDeMarca`, un caso por línea): con análisis completo, sí; sin análisis y con la fecha
    límite por delante, no (`marcasDelIndicador` la trae como `espera_analisis` con `esperaHasta`); sin análisis y con la
    fecha límite pasada, sí; reportada después de su fecha límite, sí desde ese momento; cerrada sin análisis, sí;
    histórica, nunca; de un indicador retirado, no; si un recálculo le quita la marca, deja de serlo; un caso por cada
    valor de `analisisExigido` que una medición marcada puede tener.
  - **Quién puede:** el Admin SGC, las tres; un líder del proceso del indicador, `hallazgo: true, noRequiere: false`;
    Control Interno, un líder de otro proceso y Gerencia, ninguna (`marcasDelIndicador` da `null`); el Admin SGC sobre un
    indicador que no ve no existe (el Admin SGC los ve todos: pruébelo con un líder y un indicador restringido de su
    proceso que no ve).
  - **Ocurrencia:** `resolverConOcurrencia` deja una fila en `mejora_ocurrencias` (origen `medicion`, la fecha del último
    día del periodo, la frase del resultado), una en `mejora_marcas` (`ocurrencia`) y la bitácora `mejora_marca`; avisa
    como `registrarOcurrencia`. Con un hallazgo terminado, con uno que no cita el indicador o con uno que la persona no
    ve, se rechaza con el mismo mensaje de `registrarOcurrencia` para un hallazgo que no existe. Sobre una medición que
    no es pendiente, `MARCA_SIN_PENDIENTE`.
  - **Candidatos:** entran los hallazgos sin terminar que citan el indicador por `indicador_id`, por una medición suya o
    como indicador de eficacia de una ronda, y que la persona ve; el más reciente va primero.
  - **No requiere:** con justificación de 9 caracteres se rechaza («Escriba la justificación (al menos 10 caracteres)»);
    con una válida deja la fila y la bitácora **sin** el texto; un líder lanza por permiso.
  - **Al nacer** (`registrarHallazgo` con `medicionId`): si registra el Admin SGC o el líder del proceso del indicador,
    queda la salida `hallazgo` en la misma transacción, también cuando la medición todavía espera su análisis; si
    registra Control Interno, **no** queda salida y la medición sigue pendiente, con ese hallazgo como primer candidato.
  - **Desde el panel** (`marcaMedicionId`): si la medición ya tiene una salida en vigor, `MARCA_YA_DECIDIDA` y no nace
    ningún hallazgo; si la marca desapareció, el hallazgo nace citando la medición y no se escribe ninguna salida.
  - **La salida en vigor:** con la salida `hallazgo` y ese hallazgo `anulado` (o rechazado y retirado), la medición vuelve
    a ser pendiente y admite otra salida; quedan dos filas en `mejora_marcas`. Con el hallazgo `cerrado`, no vuelve.
  - **Dos decisiones sobre la misma medición** (en serie, dentro de `revertida`: una medición marcada exige una ficha
    aprobada, que ningún test puede dejar confirmada): después de `resolverNoRequiere`, una `resolverConOcurrencia`
    recibe `MARCA_YA_DECIDIDA` y queda **una** fila. Y un caso que comprueba, con `contada(tx)`, que la **primera**
    sentencia de `resolverConOcurrencia` y de `resolverNoRequiere` es el candado de la medición, y que
    `registrarHallazgo` con `medicionId` lo toma antes de la sentencia que inserta el hallazgo.
  - **`salidasVisibles`:** quien ve el hallazgo recibe «Hallazgo HZ-…» con su enlace; quien no, no recibe esa medición en
    el mapa; el «no requiere» lo recibe todo el que ve el indicador, con la justificación.

  En `tests/mejora-prellenado.test.ts`: `medicion` de un pendiente, como Admin SGC: `fijos` trae `indicadorId` y
  `medicionId`, `valores.origen` es `"indicador"`, y `ocultos.marcaMedicionId` es el id; de una medición sin marca, de un
  indicador que la persona no ve o como Control Interno: vacío. En `tests/mejora-tareas.test.ts`: una tarea
  `mej-marca:<id>` por pendiente para el Admin SGC, con el título exacto, sin fecha; ninguna para el líder ni para
  Control Interno; desaparece al decidir. En `tests/cascaron-consultas.test.ts`: las tareas de marcas salen de una sola
  sentencia.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente.** «Ya no pide análisis» se decide con `analisisExigido` y `analisisCompleto`, las mismas
  reglas de `pideAnalisis`. Si para una medición marcada equivalen a una condición de SQL (por ejemplo
  `m.analizada_en IS NOT NULL`), úsela en `pendienteDeMarca` y déjelo probado con el caso por cada valor; si no, traiga
  las marcadas sin salida y decida en TypeScript. El candado de la medición es
  `SELECT pg_advisory_xact_lock(hashtext('sgc.mejora.marca'), ${medicionId}::int)` (la forma que ya usa
  `src/db/consultas/indicadores/lote-importacion.ts:17`). `resolverConOcurrencia` y `resolverNoRequiere` lo toman como
  primera sentencia de su transacción y vuelven a comprobar `salidaEnVigor` antes de insertar. `registrarHallazgo`,
  cuando llega `medicionId`, lo toma **antes** de `nacerHallazgo` y llama `salidaAlNacer` después, con `desdeElPanel`
  según `marcaMedicionId`. La justificación de un «no requiere» no va a la bitácora.

- [ ] **Step 4: Run** los tests de la tarea, `tests/mejora-registro.test.ts`, `tests/bitacora-detalle.test.ts`,
  `tests/indicadores-ciclos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): la marca de un indicador, sus tres salidas y su tarea`.

---

### Task 9: La marca en la página del indicador y en el hallazgo

**Files:**
- Create: `src/componentes/mejoramiento/marcas/PanelDeMarcas.tsx`, `src/componentes/mejoramiento/marcas/FormularioNoRequiere.tsx`,
  `tests/mejora-marcas-pantallas.test.tsx`
- Modify: `src/app/(app)/indicadores/[codigo]/page.tsx`, el componente que pinta cada periodo en esa página (para la línea
  «Ya decidida»), `src/app/acciones-mejoramiento.ts`, `src/db/consultas/mejoramiento/analisis.ts` y la página
  `src/app/(app)/mejoramiento/[id]/formular/page.tsx` (el punto de partida), `src/componentes/mejoramiento/FormularioHallazgo.tsx`
  (el aviso de indicador restringido), `src/db/consultas/mejoramiento/lectura.ts` y
  `src/componentes/mejoramiento/EnlacesDelHallazgo.tsx` (la medición con su estado de hoy)
- Test: `tests/mejora-marcas-pantallas.test.tsx`, `tests/mejora-analisis.test.ts`, `tests/mejora-registro.test.ts`,
  `tests/acciones-permisos.test.ts`

**Interfaces:**
- Consumes: `marcasDelIndicador`, `salidasVisibles`, `resolverConOcurrencia`, `resolverNoRequiere` (Tarea 8);
  `rutaDeRegistro` (Tarea 3); el patrón de `AvisoDeImpacto` y `FormularioNoAfecta` (`src/componentes/indicadores/`).
- Produces: `resolverMarcaConOcurrenciaAccion` (`mutacion(formData, "mejora.registrar", …)`) y
  `resolverMarcaNoRequiereAccion` (`mutacion(formData, "mejora.gestionar", …)`);
  `puntoDePartidaDeLaMedicion(sesion, hallazgoId: number, opciones?): Promise<{ periodo: string; causa: string | null; accionPropuesta: string | null } | null>`
  en `analisis.ts` (nulo si el hallazgo no cita una medición, si la medición no tiene análisis o si la persona no ve el
  indicador).

- [ ] **Step 1: Write the failing tests.** `tests/mejora-marcas-pantallas.test.tsx`:
  - El panel pinta un bloque por pendiente con el periodo, el resultado, la causa y la acción propuesta.
  - Con candidatos, «Añadir como ocurrencia de HZ-…» va primero, con la marca «Sugerido»; sin candidatos, no aparece.
  - Con `puede.noRequiere` falso, no hay «No requiere acción de mejora».
  - Una medición `espera_analisis` pinta «La decisión se pedirá cuando tenga su análisis, o el {fecha} si no lo tiene.» y
    ningún botón.
  - «Abrir un hallazgo nuevo» enlaza a `/mejoramiento/nuevo?medicion=<id>`.

  `tests/mejora-analisis.test.ts`: `puntoDePartidaDeLaMedicion` trae la causa y la acción propuesta para el líder que
  formula; da `null` para quien no ve el indicador y para un hallazgo sin medición.

  `tests/mejora-registro.test.ts`: «A qué se refiere» de un hallazgo que cita una medición muestra, a quien ve el
  indicador, la medición con su **estado de hoy** (su resultado y su color actuales, y que ya no lleva la marca si un
  recálculo se la quitó); a quien no lo ve, «un indicador», como hoy (anexo §6.6).

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente.** La página del indicador llama `marcasDelIndicador` y `salidasVisibles` (ella, no las
  consultas de Indicadores) y pinta `PanelDeMarcas` debajo de `AvisoDeImpacto`, en todas las vistas, contra la maqueta 5.
  La tarea de «Mis tareas» enlaza a esa sección. Junto a cada periodo decidido va la línea de `salidasVisibles`. El
  formulario del análisis muestra «Lo que dijo el análisis del indicador» en solo lectura. En el registro, si el
  indicador elegido es restringido, el aviso: «Este indicador es restringido: lo que escriba en la descripción lo leerán
  los responsables de las actividades.»

- [ ] **Step 4: Run** los tests de la tarea, `tests/paginas-sesion.test.ts`, `tests/frontera-cliente.test.ts` y
  `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): la marca en la página del indicador y el punto de partida del análisis`.

---

### Task 10: La no conformidad de un hallazgo de verificación

**Files:**
- Create: `src/db/consultas/mejoramiento/enganche-verificacion.ts`, `src/componentes/mejoramiento/enganches/NoConformidadDeVerificacion.tsx`,
  `tests/mejora-enganche-verificacion.test.ts`
- Modify: `src/db/consultas/mejoramiento/flujo.ts` (`FilaNueva`, `nacerHallazgo`, `aBase`, `hallazgoBase`),
  `src/lib/mejoramiento/tipos.ts` (`HallazgoBase.verificacionHallazgoId`), `src/lib/mejoramiento/reglas.ts` (`aceptadoVaA`),
  `src/lib/mejoramiento/transiciones.ts`, `src/lib/mejoramiento/reclasificar.ts` si usa `aceptadoVaA`,
  `src/db/consultas/mejoramiento/registro.ts`, `src/db/consultas/mejoramiento/prellenado.ts` (la rama `verificacion`),
  `src/lib/esquemas/mejoramiento.ts`, `src/lib/alcance.ts` (`ejecutaronEn`), `src/db/consultas/mejoramiento/lectura.ts`
  (la corrección enlazada y el enlace), `src/componentes/mejoramiento/SeccionCorreccion.tsx`, el impreso del
  SGC-FO-AC-01 (su sección 2), `src/lib/mejoramiento/huellas.ts` y quien arma el `PlanFirmado`,
  `src/componentes/distribucion/verificaciones/TablaHallazgos.tsx`, `ListaHallazgos.tsx` y las tres páginas que los usan
  (`/distribucion/verificaciones`, `/distribucion/verificaciones/[id]`, `/distribucion/copias/[id]`), el formulario de
  plazos de `/admin/mejoramiento` (los dos números)
- Test: el nuevo, `tests/mejora-reglas.test.ts`, `tests/mejora-verificacion.test.ts`, `tests/mejora-prellenado.test.ts`,
  `tests/mejora-plan.test.ts` (la huella), `tests/mejora-motor.test.ts`

**Interfaces:**
- Consumes: `filtroPuntos` (`alcance.ts`); la tabla `hallazgos` y `punto_uso_procesos`; `nacerHallazgo`;
  `obtenerConfigMejora` (`sugerirHallazgos`, `sugerirMeses`).
- Produces:
  - `FilaNueva` gana `verificacionHallazgoId?: number | null` y `accion?: { justificacion: string; decididaPor: number; decididaEn: Date } | null`
    (con `accion`, `nacerHallazgo` escribe `accion_requerida = true` y las tres columnas de la decisión).
  - `HallazgoBase.verificacionHallazgoId: number | null`.
  - `aceptadoVaA(h: Pick<HallazgoBase, "clase" | "verificacionHallazgoId">): "por_corregir" | "por_formular"`: una no
    conformidad con hallazgo de verificación va a `por_formular`.
  - `DatosDeHallazgo` gana `verificacionHallazgoId?: number | null` y `accionJustificacion?: string | null`.
  - En `enganche-verificacion.ts` (liviano):
    `engancheDeVerificacion(sesion, hallazgos: ReadonlyArray<{ id: number; puntoUsoId: number; reaperturas: number }>, opciones?): Promise<Map<number, { noConformidad: { id: number; codigo: string; estado: string; visible: boolean } | null; puedeAbrir: boolean; sugerir: { por: "reabierto"; veces: number } | { por: "acumula"; hallazgos: number; meses: number } | null }>>`;
    `correccionEnlazada(sesion, verificacionHallazgoId: number, opciones?): Promise<{ estado: string; nota: string | null; por: string | null; en: Date | null; enlace: string } | null>` (nulo para quien no ve ese hallazgo de verificación).
  - La rama `verificacion` de `prellenadoDeRegistro`: fija `clase` y `origen`; propone fuente, documento, descripción y
    fecha; `ocultos.verificacionHallazgoId`; el formulario pide entonces la justificación de la acción correctiva y
    ofrece solo los procesos del punto (todos, si el punto no tiene).

- [ ] **Step 1: Write the failing tests.** `tests/mejora-reglas.test.ts`: `aceptadoVaA` con una no conformidad y
  `verificacionHallazgoId` no nulo da `por_formular`; sin él, `por_corregir`; una observación, `por_formular` siempre.

  `tests/mejora-enganche-verificacion.test.ts` (con base, en `revertida`; un punto con un hallazgo de verificación
  abierto, corregido por su responsable):
  - Como Admin SGC, `registrarHallazgo` con `verificacionHallazgoId` y `accionJustificacion`: nace «Por aceptar», con
    `accion_requerida` verdadero, la justificación en la fila y en el evento, y **no** en la bitácora.
  - Sin justificación, o con 9 caracteres, `SIN_JUSTIFICAR_LA_ACCION`.
  - Con una clase u origen distintos forzados en el envío, se guardan `no_conformidad` y `control_documental`.
  - Con un proceso que no es del punto, se rechaza («Elija un proceso del punto de uso»).
  - Como Control Interno o como líder, se rechaza por permiso (`mejora.gestionar`).
  - El líder acepta: queda «Por formular», sin corrección propia (`correccion_requerida` nulo) y con el plazo de formular.
  - El recorrido que pinta la página de esa no conformidad no trae los pasos de la corrección ni de la decisión: del
    registro y la aceptación pasa a «Por formular» (maqueta 6).
  - Una segunda no conformidad del mismo hallazgo de verificación: `YA_TIENE_NO_CONFORMIDAD`; si la primera se anula, o
    el líder la rechaza y se retira, la segunda nace.
  - En un proceso sin líder nace ya en «Por formular».
  - `engancheDeVerificacion`: `puedeAbrir` es verdadero para el Admin SGC y falso para los demás; `noConformidad.visible`
    es falso para el responsable del punto que no ve el hallazgo; `sugerir` es `reabierto` con `reaperturas` 1, `acumula`
    con tres hallazgos del punto en los últimos doce meses (y no con dos, ni con tres si uno tiene trece meses), y nulo
    cuando ya hay una no conformidad que cuenta; con `mej_sugerir_hallazgos` en 2, sugiere con dos.
  - `correccionEnlazada`: quien ve el hallazgo de verificación recibe su estado, su nota, quién y cuándo; el líder del
    proceso que no ve el punto recibe `null`.

  `tests/mejora-prellenado.test.ts`: `verificacion` como Admin SGC trae `fijos` con `clase` y `origen` y
  `ocultos.verificacionHallazgoId`; como líder, como Control Interno, con un hallazgo de verificación que ya tiene una no
  conformidad que cuenta o con un id que no existe: vacío.

  `tests/mejora-verificacion.test.ts`: no puede verificar esa no conformidad quien corrigió el hallazgo de verificación
  (`corregido_por`), ni quien responde por él (`responsable_id`), ni quien lo corrigió antes de una reapertura (la
  bitácora de Distribución); sí otro Admin SGC que no hizo nada de eso.

  `tests/mejora-plan.test.ts`: la huella de un plan de un hallazgo **sin** `verificacionHallazgoId` es la misma de antes
  (fije el valor de un plan de prueba antes de tocar `huellas.ts` y compárelo después); la de uno **con** él cambia si
  cambia el identificador.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente el dominio.** `registrarHallazgo` con `verificacionHallazgoId`: exige `mejora.gestionar`, que
  la persona vea ese hallazgo de verificación (`filtroPuntos`), que no haya otra no conformidad que cuente (compruébelo
  antes; el índice único parcial es la garantía, y su `23505` sale por `legible()` como `YA_TIENE_NO_CONFORMIDAD`), y
  pasa a `nacerHallazgo` el identificador y `accion`. En `ejecutaronEn` (`alcance.ts`) entran los tres casos del anexo
  §7.3; el tercero se lee de `auditoria`, con la acción que deja `corregirHallazgo` de Distribución. En el `PlanFirmado`,
  la clave `verificacionHallazgoId` entra a `identificacion` **solo cuando no es nula** (anexo §7.2).

- [ ] **Step 4: Implemente las pantallas.** Las tres páginas de Distribución llaman `engancheDeVerificacion` con los
  hallazgos que ya listan y pasan el resultado a `TablaHallazgos` y `ListaHallazgos`, que pintan
  `NoConformidadDeVerificacion` en la fila: la sugerencia (texto de «Nombres fijos»), el botón «Abrir no conformidad»
  (enlace a `/mejoramiento/nuevo?verificacion=<id>`) o «No conformidad HZ-… · {estado}» con enlace si `visible`. En
  `/distribucion/verificaciones?punto=…`, la sugerencia del punto va además sobre la tabla. **Ningún otro texto ni regla
  de Distribución cambia.** La sección «Corrección» del hallazgo y la sección 2 del SGC-FO-AC-01 pintan
  `correccionEnlazada`, o «La corrección está en un hallazgo de verificación de Distribución». Contra la maqueta 6.

- [ ] **Step 5: Run** los tests de la tarea, `tests/mejora-motor.test.ts`, `tests/mejora-recorrido.test.ts`,
  `tests/mejora-impresos.test.tsx`, los de Distribución que toquen esas tres páginas y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15b): la no conformidad que nace de un hallazgo de verificación`.

---

### Task 11: El hallazgo de un impacto de norma

**Files:**
- Create: `src/db/consultas/mejoramiento/enganche-impacto.ts`, `src/componentes/mejoramiento/enganches/HallazgoDeImpacto.tsx`,
  `tests/mejora-enganche-impacto.test.ts`
- Modify: `src/db/consultas/mejoramiento/flujo.ts` (`FilaNueva`, `nacerHallazgo`), `src/db/consultas/mejoramiento/registro.ts`,
  `src/db/consultas/mejoramiento/prellenado.ts` (las ramas `impacto` e `impactoIndicador`), `src/lib/esquemas/mejoramiento.ts`,
  `src/db/consultas/mejoramiento/lectura.ts` (el enlace con el impacto), `src/lib/mejoramiento/huellas.ts` y quien arma
  el `PlanFirmado`, `src/componentes/normograma/PaginaImpactos.tsx` y `src/app/(app)/normograma/impactos/[cambioId]/page.tsx`,
  `src/componentes/indicadores/AvisoDeImpacto.tsx` y `src/app/(app)/indicadores/[codigo]/page.tsx`
- Test: el nuevo, `tests/mejora-prellenado.test.ts`, `tests/mejora-plan.test.ts`

**Interfaces:**
- Consumes: `puedeVerImpacto` (el que usa `impactosDe`, `src/db/consultas/normograma/impactos.ts`); `impactosPendientesDe`
  (`src/db/consultas/indicadores/impactos.ts`); `puedeVerIndicador`.
- Produces:
  - `FilaNueva` y `DatosDeHallazgo` ganan `impactoId?: number | null` e `impactoIndicadorId?: number | null`.
  - En `enganche-impacto.ts` (liviano):
    `engancheDeImpactos(sesion, clase: "documento" | "indicador", ids: number[], opciones?): Promise<Map<number, { hallazgo: { id: number; codigo: string; estado: string; visible: boolean } | null; puedeAbrir: boolean; sugerir: boolean }>>`.
  - Las ramas `impacto` e `impactoIndicador` de `prellenadoDeRegistro`: fijan `origen` (`control_documental`),
    `requisitoNormaId` y `procesoId`; proponen el documento o el indicador y la fuente («Cambio de {norma}»).

- [ ] **Step 1: Write the failing test** `tests/mejora-enganche-impacto.test.ts` (con base, en `revertida`):
  - Un impacto sobre un documento: `puedeAbrir` es verdadero para el Admin SGC y para el líder del proceso del impacto;
    falso para Control Interno, para el líder de otro proceso y para Gerencia.
  - `registrarHallazgo` con `impactoId`: nace con el origen `control_documental`, la norma del impacto como
    `requisito_norma_id`, el proceso del impacto y su documento; forzar otro proceso u otro origen no los cambia; sigue
    el camino normal (un líder que registra el de su proceso lo deja aceptado, en «Por corregir» si es no conformidad).
  - Un segundo hallazgo del mismo impacto: `IMPACTO_YA_TIENE_HALLAZGO`; con el primero anulado, nace.
  - Se abre con el impacto pendiente y con el impacto resuelto.
  - `sugerir` es verdadero solo si el impacto está pendiente, su `vence_en` pasó, `escalado_en` no es nulo y no tiene un
    hallazgo que cuente (cuatro casos, uno por condición que falta).
  - Un impacto sobre un indicador: lo mismo, con el proceso del indicador y `impactoIndicadorId`; `engancheDeImpactos`
    recibe solo revisiones pendientes (las que la página muestra), y con una resuelta el registro se rechaza con el mismo
    mensaje que un impacto que no existe.
  - El impacto no cambia de estado por abrirle un hallazgo.
  - Con un impacto de un proceso que la persona no lidera, el registro se rechaza igual que con un id que no existe.

  `tests/mejora-prellenado.test.ts`: `impacto` como líder del proceso del impacto trae `fijos` con `origen`,
  `requisitoNormaId` y `procesoId`; como líder de otro proceso, como Control Interno o con un impacto que ya tiene un
  hallazgo que cuenta: vacío. Lo mismo con `impactoIndicador`.

  `tests/mejora-plan.test.ts`: la huella de un plan de un hallazgo sin impacto no cambia.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente.** `registrarHallazgo` valida el impacto dentro de su transacción (existe, la persona puede
  abrirlo, no tiene un hallazgo que cuente) y lo pasa a `nacerHallazgo`. `PaginaImpactos` y `AvisoDeImpacto` reciben el
  mapa de `engancheDeImpactos` desde su página y pintan `HallazgoDeImpacto`: la sugerencia (texto de «Nombres fijos»),
  «Abrir hallazgo» (enlace a `/mejoramiento/nuevo?impacto=<id>` o `?impactoIndicador=<id>`) o «Hallazgo HZ-… · {estado}»
  con enlace si `visible`. En el `PlanFirmado`, las dos claves entran solo cuando no son nulas. Contra la maqueta 6.

- [ ] **Step 4: Run** los tests de la tarea, `tests/mejora-motor.test.ts`, los del normograma y de indicadores que cubren
  esas dos páginas y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): abrir un hallazgo desde un impacto de norma`.

---

### Task 12: El cambio documental desde una actividad

**Files:**
- Create: `src/db/consultas/mejoramiento/tramites-enlace.ts`, `src/app/(app)/mejoramiento/actividades/[id]/enlazar/page.tsx`,
  `src/componentes/mejoramiento/actividad/CambioDocumental.tsx`, `tests/mejora-tramites.test.ts`
- Modify: `src/db/consultas/tramites-flujo.ts` (`DatosSolicitud.actividadId`, `crearSolicitud`),
  `src/lib/esquemas/tramites.ts` (`EsquemaSolicitud`), `src/componentes/tramites/FormularioSolicitud.tsx`
  (`ocultosDeSolicitud` y el aviso), `src/app/(app)/tramites/nueva/page.tsx`, `src/app/acciones-tramites.ts`,
  `src/app/(app)/tramites/[id]/page.tsx` (la línea «Atiende una actividad de mejoramiento»),
  `src/db/consultas/mejoramiento/actividades.ts` (`terminarActividad`, `leerActividad`),
  `src/app/(app)/mejoramiento/actividades/[id]/page.tsx`, `src/db/consultas/mejoramiento/verificacion.ts`
  (`exigirLoDelCierre`, `cerrarHallazgo`, `evaluarEficacia`), `src/componentes/mejoramiento/SeccionCierre.tsx`,
  `src/db/consultas/mejoramiento/vencimientos.ts` (un paso), `src/app/acciones-mejoramiento.ts`, `src/lib/bitacora-detalle.ts`
- Test: el nuevo, `tests/mejora-actividades.test.ts`, `tests/mejora-verificacion.test.ts`, `tests/mejora-vencimientos.test.ts`,
  `tests/mejora-ciclos.test.ts`, los de trámites que cubren `crearSolicitud` y `/tramites/nueva`

**Interfaces:**
- Consumes: `puedeVerActividad`, `cargaResuelta`, `puedeVerTramite` (`alcance.ts`); `listarTramites` (`src/db/consultas/tramites.ts`);
  `ETAPAS_FINALES` (`src/lib/tramites/tipos.ts`); `correrPaso` (`src/db/consultas/indicadores/pasada.ts`); `avisarA`
  (`src/db/consultas/avisar.ts`).
- Produces, en `tramites-enlace.ts` (**liviano:** no importa `flujo.ts`, `lectura.ts`, `actividades.ts`, `admin.ts` ni
  `tramites-flujo.ts`; escribe sus eventos por SQL):
  - `TERMINO_BIEN = ["publicado", "eliminado"] as const`.
  - `validarActividadParaTramite(tx: TransactionSql, sesion: SesionFlujo, actividadId: number): Promise<{ hallazgoId: number }>`
    (toma el hallazgo `FOR SHARE`; lanza `ACTIVIDAD_NO_ADMITE`, el mismo mensaje para toda causa).
  - `enlazarAlCrear(tx, d: { actividadId: number; hallazgoId: number; tramiteId: number; usuarioId: number; ahora: Date }): Promise<void>` (origen `pedido`).
  - `enlazarTramite(sesion, d: { actividadId: number; tramiteId: number }, opciones?): Promise<void>` (origen `enlazado`).
  - `quitarEnlace(sesion, d: { enlaceId: number }, opciones?): Promise<void>`.
  - `type TramiteEnlazado = { enlaceId: number; tramiteId: number; origen: "pedido" | "enlazado"; etapa: string; terminoBien: boolean; terminoEn: Date | null; documento: string | null; tipo: string; visible: boolean; seQuita: boolean }`.
  - `tramitesDeActividades(sql: Cliente, sesion, actividadIds: number[]): Promise<Map<number, TramiteEnlazado[]>>`.
  - `datosParaPedir(sesion, actividadId: number, opciones?): Promise<{ actividadId: number; documentoCodigo: string | null; motivo: "no_conformidad" | "mejora"; justificacion: string } | null>`.
  - `candidatosParaEnlazar(sesion, actividadId: number, q: string | undefined, opciones?): Promise<Array<{ id: number; documento: string; tipo: string; etapa: string; solicitadoEn: Date }>>`.
  - `tramitesQueTerminaronBien(sql: Cliente, hallazgoId: number, ronda: number): Promise<Array<{ tramiteId: number; documento: string | null }>>`.
  - `actividadDelTramite(sesion, tramiteId: number, opciones?): Promise<{ actividadId: number } | null>` (nulo para quien no ve la actividad).
- Produces: `DatosSolicitud.actividadId?: number | null`; acciones `enlazarTramiteAccion` y `quitarEnlaceDeTramiteAccion`
  (`mutacion(formData, "tramites.solicitar", …)`); el paso de la pasada y el aviso `mejora.tramite_terminado`.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-tramites.test.ts` (con base, en `revertida`; un hallazgo «En
  ejecución» con una actividad de un responsable con rol `consulta`):
  - `crearSolicitud` con `actividadId`, como líder del proceso: nacen el trámite y el enlace (`pedido`), con el evento
    `tramite_enlazado` en el hallazgo.
  - Con una actividad terminada, cancelada, de un borrador (sin `fin_original`), de un hallazgo terminado, de una carga
    sin su formato, que la persona no ve, o con un id que no existe: `ACTIVIDAD_NO_ADMITE` en los siete casos, y **no**
    queda ningún trámite (cuente `tramites` antes y después).
  - Sin `actividadId`, `crearSolicitud` hace exactamente lo de antes.
  - `datosParaPedir`: trae el documento que el hallazgo cita, el motivo `no_conformidad` para una no conformidad y
    `mejora` para una observación, y la descripción de la actividad como justificación (nunca el título ni la
    descripción del hallazgo); da `null` para el responsable sin `tramites.solicitar` y para quien no ve la actividad.
  - `enlazarTramite`: un trámite en curso que la persona ve y solicitado después de la detección, se enlaza; uno ya
    enlazado a cualquier actividad, uno `rechazado` o `cancelado`, uno solicitado antes de la fecha en que se detectó el
    hallazgo, o uno que la persona no ve, `TRAMITE_NO_SIRVE` (el mismo mensaje en los cuatro casos: no dice que otra
    actividad, que quizá la persona no ve, ya lo tiene).
  - `quitarEnlace`: quita uno `enlazado` quien lo puso o el Admin SGC; uno `pedido`, nadie; con la actividad terminada,
    nadie.
  - `tramitesDeActividades`: `visible` es falso para quien no pasa `puedeVerTramite` (y entonces `documento` es nulo).
  - **Publicar un trámite enlazado a un hallazgo ya cerrado no falla** (cierre el hallazgo y publique después por el
    motor del trámite).

  `tests/mejora-actividades.test.ts`: `terminarActividad` sin archivos y con un trámite enlazado `publicado` pasa; con el
  trámite en curso o `cancelado`, `SIN_EVIDENCIA_PARA_TERMINAR`; con uno `eliminado`, pasa; en una actividad devuelta,
  vale un trámite que terminó bien **después** de la devolución y no uno anterior.

  `tests/mejora-verificacion.test.ts` (los cuatro casos del anexo §9.6, sobre `cerrarHallazgo` y sobre `evaluarEficacia`
  cuando cierra): marcó solo «documentos» y la ronda tiene un trámite que terminó bien: cierra sin `cambiosAtendidos` y
  el evento guarda los trámites; marcó «documentos» y no tiene ninguno: `CAMBIOS_SIN_ATENDER`; marcó «riesgos» o
  «controles» (con o sin trámite): lo pide; no marcó nada: no lo pide. Un trámite de una actividad de **otra** ronda no
  cuenta.

  `tests/mejora-vencimientos.test.ts`: la pasada avisa una vez al responsable cuando el trámite enlazado termina (bien o
  mal, con dos textos distintos), deja el evento `tramite_terminado` y marca `avisado_en`; una segunda pasada no avisa;
  con el hallazgo terminado, no avisa ni toca el enlace; con una carga sin su formato, tampoco.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente el enlace.** En `crearSolicitud`, con `datos.actividadId`: `validarActividadParaTramite`
  **antes del `INSERT` del trámite**, y `enlazarAlCrear` después, en la misma transacción. La página `/tramites/nueva`
  lee `?actividad=`, llama `datosParaPedir` y, si da `null`, lo ignora sin decir por qué; el formulario lleva el campo
  oculto `actividadId` y el aviso («Lo que escriba aquí lo leerán quienes participan en el trámite»). Compruebe que
  `tests/mejora-ciclos.test.ts` sigue en verde y que `npm run build` no avisa de un ciclo.

- [ ] **Step 4: Implemente la actividad, la evidencia, el cierre y la pasada.** La página de la actividad pinta
  `CambioDocumental` (maqueta 7): los trámites, «Pedir cambio documental» y «Enlazar un trámite que ya existe» para quien
  cumple las tres condiciones del anexo §9.2, o el texto de a quién pedírselo. `enlazar/page.tsx` es el selector (un
  formulario `GET` de búsqueda y un botón por trámite). `exigirLoDelCierre` recibe los trámites de la ronda
  (`tramitesQueTerminaronBien`). El paso de la pasada usa `correrPaso`, solo sobre hallazgos sin terminar.

- [ ] **Step 5: Run** los tests de la tarea, `tests/acciones-permisos.test.ts`, `tests/paginas-sesion.test.ts`,
  `tests/bitacora-detalle.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15b): el cambio documental desde una actividad`.

---

### Task 13: Los hallazgos en las otras páginas, «Reportar» con su enlace y «Objetivos»

**Files:**
- Create: `src/db/consultas/mejoramiento/citas.ts`, `src/componentes/mejoramiento/enganches/SeccionMejoramiento.tsx`,
  `tests/mejora-citas.test.ts`
- Modify: `src/app/(app)/documentos/[codigo]/page.tsx`, `src/app/(app)/procesos/[slug]/page.tsx`,
  `src/app/(app)/procesos/[slug]/[sub]/page.tsx`, `src/app/(app)/indicadores/[codigo]/page.tsx`,
  `src/app/(app)/normograma/[id]/page.tsx` (o `FichaNorma.tsx`), `src/app/(app)/indicadores/objetivos/page.tsx` y su
  componente, `src/app/(app)/mejoramiento/reportar/page.tsx`, `src/db/consultas/mejoramiento/reportes.ts`
  (`enviarReporte`, `reportesRecibidos`, `leerReporte`), `src/lib/esquemas/mejoramiento.ts`,
  `src/db/consultas/mejoramiento/prellenado.ts` y `nuevo/page.tsx` (el reporte trae su enlace),
  `src/lib/mejoramiento/filtro.ts`, `src/db/consultas/mejoramiento/lectura.ts` (`FiltroDeLista`, `listarHallazgos`,
  `filasParaExcel`), `src/componentes/mejoramiento/FiltrosDeHallazgos.tsx`, `src/lib/mejoramiento/excel.ts`
- Test: el nuevo, `tests/mejora-reportes.test.ts`, `tests/mejora-excel.test.ts`, `tests/mejora-registro.test.ts`

**Interfaces:**
- Consumes: `filtroHallazgos`; `clasificacionDe` (Tarea 2); `rutaDeRegistro` (Tarea 3); la ruta del consolidado (Tarea 7).
- Produces, en `citas.ts` (liviano: no importa `lectura.ts`):
  - `type Cita = { documentoId: number } | { procesoId: number } | { subprocesoId: number } | { indicadorId: number } | { normaId: number }`.
  - `hallazgosQueCitan(sesion, que: Cita, opciones?): Promise<{ filas: Array<{ id: number; codigo: string; titulo: string; estado: string; terminado: boolean; como: string }>; hayMas: boolean }>`
    (hasta diez, los no terminados primero; `como` dice cómo lo cita: «Se refiere a este documento», «Lo cita como
    requisito incumplido», «Lo usa como criterio de eficacia», «Cita una de sus mediciones»).
  - `puedeRegistrarEn(sql: Cliente, sesion, procesoId: number): Promise<boolean>`.
  - `abiertosPorObjetivo(sesion, opciones?): Promise<Map<number, number>>` (sin terminar, que cuentan y que la persona ve).
- Produces: `FiltroDeLista` gana `plan?: number`, `objetivo?: number`, `documento?: number`, `indicador?: number` y
  `norma?: number`; `enviarReporte` admite `documentoId?` e `indicadorId?`; el Excel de la lista gana, al final, las
  columnas «Plan» y «Objetivo».

- [ ] **Step 1: Write the failing tests.** `tests/mejora-citas.test.ts` (con base, en `revertida`):
  - Documento: trae el hallazgo que se refiere a él y el que lo nombra como requisito, cada uno con su `como`.
  - Indicador: trae los tres modos (por `indicador_id`, por una medición suya, como indicador de eficacia de una ronda).
  - Proceso y subproceso: los de ese proceso; los de ese subproceso.
  - Norma: los que la citan como requisito.
  - El orden: los no terminados primero; con once, `filas` trae diez y `hayMas` es verdadero.
  - El líder de otro proceso y el usuario de consulta reciben `filas: []` y `hayMas: false`, también cuando hay
    hallazgos que no ven.
  - `puedeRegistrarEn`: Admin SGC y Control Interno, cualquier proceso; el líder, solo los suyos; consulta y Gerencia, no.
  - `abiertosPorObjetivo`: cuenta los no terminados que cuentan y apuntan al objetivo; para el líder, solo los suyos;
    para consulta, el mapa viene vacío; un objetivo sin hallazgos visibles no está en el mapa.

  `tests/mejora-reportes.test.ts`: `enviarReporte` con `documentoId` de un documento que quien reporta ve lo guarda; con
  uno restringido que no ve, lo guarda nulo, sin error; `reportesRecibidos` lo trae; al convertir, el prellenado del
  reporte trae `documentoId` y el proceso del documento.

  `tests/mejora-excel.test.ts` y `tests/mejora-registro.test.ts`: `listarHallazgos` filtra por `plan`, por `objetivo`,
  por `documento`, por `indicador` (los tres modos) y por `norma`; el Excel trae «Plan» y «Objetivo» como últimas columnas.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente `citas.ts`** y la sección. `SeccionMejoramiento` recibe las filas, `hayMas`, el enlace a la
  lista filtrada y el botón que toca: «Abrir hallazgo» (`rutaDeRegistro`) si `puedeRegistrarEn` el proceso propuesto;
  «Reportar» (`/mejoramiento/reportar?documento=…`, `?indicador=…` o `?proceso=…`) si no; en la norma, ninguno. **Con
  `filas` vacío no pinta la lista** (ni un encabezado ni un cero), solo el botón. Contra la maqueta 8.

- [ ] **Step 4: Colóquela** en las cinco páginas (cada página llama a `citas.ts`; las consultas de los otros módulos no
  lo importan). En la del proceso, además, «SGC-FO-14 del proceso» hacia `/mejoramiento/consolidado?proceso=…&anio=<año
  actual>` para quien tiene `mejora.ver_todo` o lidera ese proceso. En «Objetivos», junto a cada objetivo con conteo,
  «{n} hallazgos abiertos» («1 hallazgo abierto») con enlace a `/mejoramiento?objetivo=<id>`.

- [ ] **Step 5: Run** los tests de la tarea, `tests/paginas-sesion.test.ts`, `tests/indicadores-ciclos.test.ts`,
  `tests/mejora-ciclos.test.ts` y `npm run lint`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(f15b): los hallazgos en las páginas de documentos, procesos, indicadores, normas y objetivos`.

---

### Task 14: La lista: los abiertos por omisión, las páginas y el turno por página; los menores

**Files:**
- Modify: `src/lib/mejoramiento/filtro.ts`, `src/db/consultas/mejoramiento/lectura.ts` (`listarHallazgos`,
  `resolverTurno`, `filasParaExcel`), `src/app/(app)/mejoramiento/page.tsx`, `src/componentes/mejoramiento/ListaDeHallazgos.tsx`,
  `src/componentes/mejoramiento/FiltrosDeHallazgos.tsx`, `src/app/(app)/mejoramiento/excel/route.ts`,
  `src/lib/alcance.ts` (`puedeAbrirArchivoDeMejora`), `tests/mejora-motor.test.ts`,
  `src/db/consultas/mejoramiento/recorrido.ts` (los avisos de retirar y sostener), `tests/cascaron-consultas.test.ts`
- Create: `tests/mejora-lista.test.ts`
- Test: el nuevo, `tests/mejora-excel.test.ts`, `tests/mejora-archivos.test.ts`, `tests/mejora-motor.test.ts`,
  `tests/mejora-recorrido.test.ts`, `tests/cascaron-consultas.test.ts`, `tests/mejora-pantallas.test.tsx`

**Interfaces:**
- Produces:
  - `TAMANO_DE_PAGINA = 50` (`filtro.ts`); `FiltroDeLista.pagina?: number`; `FiltroDeLista.estado` admite `"todos"`, y
    **sin `estado` en la dirección vale `"abiertos"`**.
  - `listarHallazgos(sesion, filtro, opciones?): Promise<{ filas: FilaDeHallazgo[]; cifras: CifrasDeLista; total: number; pagina: number; paginas: number }>`
    (hoy no devuelve `total`, `pagina` ni `paginas`: actualice a quien la llama, también `candidatosParaPlan` y
    `leerPlan` de la Tarea 4 si la usan).
  - `filasParaExcel` exporta **todas** las filas del filtro, sin página.

- [ ] **Step 1: Write the failing tests.** `tests/mejora-lista.test.ts` (con base, en `revertida`; cree 55 hallazgos
  abiertos y 3 terminados en un proceso de prueba y filtre por él):
  - Sin `estado`: `total` es 55, `filas` trae 50, `paginas` es 2; con `pagina: 2`, trae 5; con `pagina: 9`, la última.
  - Con `estado: "todos"`, `total` es 58; con `estado: "cerrado"`, los cerrados.
  - Buscar el código exacto de un terminado (`q: "HZ-2026-…"`) lo encuentra **sin** cambiar el estado.
  - `cifras` cuenta lo mismo en la página 1 y en la 2 (todo lo visible, no la página).
  - El orden es el mismo que antes de esta tarea (fije el orden de diez hallazgos de prueba con el código actual y
    compárelo después): la prioridad alta primero, y lo demás como estaba.
  - `filasParaExcel` con el filtro por omisión trae las actividades de los 55.
  - **El costo:** con 50 filas repartidas en «Por aceptar», «En arbitraje», «Por validar la corrección», «En revisión» y
    «Por verificar», `listarHallazgos` no pasa de **veinte** sentencias (cuente con el cliente de
    `tests/cascaron-consultas.test.ts`), y con 10 filas en esos mismos estados usa **las mismas**.

  `tests/mejora-archivos.test.ts`: el responsable de una actividad de un **borrador** (sin `fin_original`) no abre los
  archivos de esa actividad. `tests/mejora-motor.test.ts`: la prueba reconoce `UPDATE mejora_hallazgos AS h SET estado`,
  `UPDATE "mejora_hallazgos" SET`, `UPDATE public.mejora_hallazgos SET` y `SET (estado, ronda) = (…)` (añada cuatro
  textos de ejemplo que deben fallar y uno que no). `tests/mejora-recorrido.test.ts`: cuando un Admin SGC retira o
  sostiene un hallazgo que registró otra persona, esa persona recibe el aviso. `tests/cascaron-consultas.test.ts`: deje
  de simular las tareas de mejoramiento y acote las sentencias reales del cascarón para un Admin SGC con la demo sembrada.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente.** El orden y el corte van en la consulta (`ORDER BY` y `LIMIT`/`OFFSET` con `count(*)
  OVER ()`). El turno se resuelve **por lote**: una consulta por cada clase de turno para todos los hallazgos de la
  página (los responsables, los árbitros, los validadores, los verificadores y los revisores), no una por hallazgo; el
  resultado debe ser idéntico al de `resolverTurno` de hoy (el test de orden y los de `tests/mejora-pantallas.test.tsx`
  lo cubren). La lista muestra el filtro por omisión como una insignia «Solo abiertos» que se quita con un clic, y la
  paginación al pie con «Anterior» y «Siguiente» y «Página 1 de 2».

- [ ] **Step 4: Run** los tests de la tarea y `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): la lista muestra los abiertos, pagina y resuelve el turno por página`.

---

### Task 15: Los archivos que ya se firmaron y el retiro por datos personales

**Files:**
- Modify: `src/db/consultas/mejoramiento/archivos.ts` (las reglas de quitar, `archivosQuitables`, `archivosDe`),
  `src/componentes/mejoramiento/ArchivosDe.tsx`, `src/db/consultas/mejoramiento/lectura.ts` (los retiros de cada
  sección), `src/app/acciones-mejoramiento.ts`, `src/lib/bitacora-detalle.ts`
- Create: `src/componentes/mejoramiento/DialogoRetirarArchivo.tsx`, `tests/mejora-archivos-congelados.test.ts`
- Test: el nuevo, `tests/mejora-archivos.test.ts`, `tests/mejora-plan.test.ts`

**Interfaces:**
- Consumes: `bloquearHallazgo`, `dejarEvento` (`flujo.ts`); el almacén (`src/lib/almacen.ts`).
- Produces, en `archivos.ts`:
  - `estaCongelado(sql: Cliente, archivo: { id: number; contexto: string; contextoId: number; rol: string }): Promise<boolean>`
    (anexo §11.2: la evidencia del registro subida antes del primer envío del plan, o antes de la carga; y un archivo de
    análisis de la ronda en curso con el plan `enviado` o `aprobado`).
  - `retirarPorDatosPersonales(sesion, d: { archivoId: number; justificacion: string }, opciones?): Promise<void>`.
  - `ArchivoDeMejora` gana `congelado: boolean`; `archivosDe` trae además
    `retirados: Array<{ nombre: string; en: Date }>` de ese destino.
- Produces: `retirarArchivoAccion` (`mutacion(formData, "mejora.gestionar", …)`).

- [ ] **Step 1: Write the failing test** `tests/mejora-archivos-congelados.test.ts` (con base, en `revertida`):
  - **Evidencia del registro:** antes de enviar el plan, quien la subió y el Admin SGC la quitan; después del primer
    envío, ninguno (`ARCHIVO_FIRMADO`); un archivo subido **después** del envío sí se quita; tras una devolución del
    plan, la que estaba antes del primer envío sigue sin quitarse.
  - **Archivos del análisis:** en «Por formular», se quitan; con el plan enviado («En revisión») o aprobado («En
    ejecución»), no, tampoco el Admin SGC; devuelto el plan, otra vez sí; reenviado, otra vez no.
  - **Un hallazgo cargado:** la evidencia y los archivos del análisis subidos antes de la carga no se quitan nunca.
  - **Camino corto** (sin plan): la evidencia se quita como hoy.
  - **Añadir** sigue permitido en todos los casos donde hoy lo está.
  - **El retiro:** el Admin SGC retira un archivo congelado con una justificación válida: el archivo deja de servirse
    (404) y de estar en el almacén; queda el evento `archivo_retirado` con el nombre, el tamaño, la huella, el rol y
    quién lo había subido, y la justificación **solo en el evento**; la bitácora `mejora_archivo_retirado` no trae la
    justificación; `archivosDe` lo lista en `retirados`.
  - Con 9 caracteres, `RETIRO_SIN_JUSTIFICAR`. Como Control Interno o como líder, lanza por permiso.
  - Sobre un archivo que **no** está congelado, sobre la evidencia de una actividad terminada, sobre el formato firmado
    de una carga, sobre el oficio de una respuesta registrada o sobre un archivo de una ronda anterior:
    `NO_SE_RETIRA_POR_AQUI`.
  - Con el hallazgo terminado, se rechaza (el mensaje de `legible()` para un hallazgo terminado).

  `tests/mejora-plan.test.ts`: retirar un archivo no cambia la huella del plan enviado.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implemente.** «Ya estaba subido» se decide **por el orden de la bitácora, no por relojes** (los tests
  inyectan `ahora` y `archivos.creado_en` usa el reloj de la base): es el mecanismo de `oficiosPosibles`
  (`registro.ts:724`). Un archivo ya estaba si su fila `subir_archivo` de `auditoria` tiene un id menor que el de la
  primera fila `mejora_enviar_plan` de ese hallazgo; en un cargado, menor que el de su `mejora_cargar`. El retiro: una
  transacción con `bloquearHallazgo`, el evento por `dejarEvento` (la justificación en `soloEnElEvento`), el borrado de la
  fila de `archivos` y, **después de confirmar**, el del archivo en el almacén (si ese borrado falla, se registra y no
  deshace nada: el archivo ya no se sirve). `ArchivosDe` pinta «Retirar por datos personales» solo para el Admin SGC y
  solo en un archivo congelado, y la línea «Se retiró un archivo el {fecha}» por cada retirado.

- [ ] **Step 4: Run** los tests de la tarea, `tests/bitacora-detalle.test.ts`, `tests/acciones-permisos.test.ts` y
  `npm run lint`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(f15b): los archivos firmados no se quitan, salvo el retiro por datos personales`.

---

### Task 16: Semilla demo, manual, `AGENTS.md`, `CONTEXT.md` y cierre

**Files:**
- Modify: `src/db/semillas/mejoramiento-demo.ts` (y, si hace falta un impacto vencido o un trámite que enlazar, la
  semilla que los siembra), `tests/semilla-mejoramiento.test.ts`, `docs/manual/usuario/09-mejoramiento.md`, `AGENTS.md`,
  `CONTEXT.md`, `PLAN.md`
- Test: `tests/semilla-mejoramiento.test.ts`, y la suite completa (el controlador)

**Interfaces:**
- Consumes: todo lo anterior. La semilla siembra **por las funciones del dominio**, con `ahora` inyectado y las firmas de
  `firmaDeLaDemo`; nunca por SQL sobre las tablas `mejora_*`.

- [ ] **Step 1: Write the failing test.** En `tests/semilla-mejoramiento.test.ts`, detrás de su guarda de siempre, los
  casos del anexo §15.1:
  - un plan de `ente_control` con hallazgos de dos procesos: uno cerrado, uno de otro origen, uno sin plan de acción
    aprobado y dos que esperaban respuesta, con un archivo y una respuesta ya registrada para uno de ellos (queda uno
    listo, con su tarea `mej-ente-plan:`);
  - un plan interno con hallazgos y un plan sin ninguno;
  - una marca pendiente con su análisis en un indicador que ya tiene un hallazgo abierto (la tarea `mej-marca:` del Admin
    SGC existe), una que espera el análisis, una resuelta con un hallazgo y una con «no requiere»;
  - una no conformidad «Por formular» que nació de un hallazgo de verificación, y otro hallazgo de verificación con la
    sugerencia a la vista;
  - un impacto de norma vencido y escalado, sin hallazgo;
  - una actividad con dos trámites enlazados, uno que terminó bien y otro en curso, y un hallazgo «Por cerrar» cuyo
    análisis marcó «documentos»;
  - un objetivo en un plan y en dos hallazgos sueltos;
  - sembrada la demo, otra pasada de `revisarVencimientosDeMejoramiento` a la hora de la siembra no avisa nada nuevo.

- [ ] **Step 2: Run** `bash <espacio>/con-f15b.sh npm run db:seed && bash <espacio>/con-f15b.sh env SEMILLA_RECIEN=1 npx
  vitest run tests/semilla-mejoramiento.test.ts`. Expected: FAIL.

- [ ] **Step 3: Amplíe la semilla.** Las fechas se cuentan desde el reloj de la siembra, como en la 15A (lo que debe
  quedar «vencido» o «listo» lo está el día que se siembre). Si el impacto vencido, el hallazgo de verificación reabierto
  o el trámite publicado no existen ya en la demo, siémbrelos con las funciones de su módulo y su `ahora`, sin tocar las
  cifras que otros tests de semilla comprueban; si alguna cambia, corrija ese test en esta tarea y dígalo en el informe.
  Actualice `HALLAZGOS_DE_LA_DEMO`. Vuelva a correr el test: PASS.

- [ ] **Step 4: Documentos.** El manual gana las seis secciones del anexo §15.3 y ajusta «La lista» y «Archivos».
  `AGENTS.md`, lo del anexo §15.4 (cada regla nueva, con su párrafo y en el estilo del archivo), y veinte migraciones.
  `CONTEXT.md`: «Hecho (Fase 15B)», «Qué probar y cómo (Fase 15B)» (los dieciséis pasos del anexo §15.2, con las cuentas
  de la demo), «Decisiones adicionales (Fase 15B)» (del registro de la ejecución) y «Deuda técnica (Fase 15B)».
  `PLAN.md`: la fila de la 15B. Los tres ajustes a los textos del hospital, en el capítulo 9 del manual.

- [ ] **Step 5: Verificación de cierre (el controlador).** Con la demo recién sembrada:
  `bash <espacio>/con-f15b.sh env SEMILLA_RECIEN=1 npm test`, `npm run lint` y `npm run build` (sin `DATABASE_URL`). La
  `0019` sobre una copia de la base `sgc` (`pg_dump` una vez, restaurada en `sgc_f15b_copia0019`, migrada desde el
  worktree y borrada): mismos conteos y mismas huellas en lo que no toca. El recorrido del anexo §15.2 en el navegador, a
  1280 px y en claro, más oscuro y 390 px en las pantallas nuevas. La revisión final de toda la rama.

- [ ] **Step 6: Commit** `docs(f15b): la demo, el manual, AGENTS.md y CONTEXT.md al cierre de la 15B`.

---

## Cobertura del anexo (auto-revisión)

| Anexo | Tarea |
|---|---|
| §3.1 a §3.3 El plan, crear, editar, anular, la clasificación | 1, 2 |
| §3.4 Entrar, salir y cambiar de plan | 2 (dominio), 3 (al registrar), 4 (pantallas) |
| §3.5, §3.6, §3.9, §3.10 Estado, cifras, quién ve qué, pantallas, bitácora | 2, 4 |
| §3.7 Archivos del plan | 5 |
| §3.8 La respuesta al ente desde el plan | 5 |
| §4 El Excel para el ente (y el plazo) | 2 (`plazoEnTexto`), 6 |
| §5 El SGC-FO-14 | 6 (las filas), 7 |
| §6.1 a §6.4 La marca: pendiente, salidas, por fuera del panel, dónde se guarda | 1, 8 |
| §6.5 y §6.6 La tarea, el panel, el hallazgo | 8, 9 |
| §7 El hallazgo de verificación | 1, 10 |
| §8 El impacto de norma | 1, 11 |
| §9 El cambio documental | 1, 12 |
| §10.1 y §10.2 La sección «Mejoramiento» y los botones | 13 |
| §10.3 Lo que gana el formulario de registro | 3 (y las ramas de 8, 10 y 11) |
| §10.4 El objetivo y «Clasificación» | 2, 3, 4 |
| §10.5 y §10.6 «Objetivos», la lista y su Excel | 13 |
| §11.1 La lista | 14 |
| §11.2 Los archivos que ya se firmaron y el retiro | 15 |
| §11.3 Los menores | 5 y 8 (el costo de las tareas), 14 |
| §12 Permisos y seguridad | 1 (la matriz), cada tarea (sus actos) |
| §13 La migración `0019` | 1 |
| §15 Semilla, demostración y documentos | 16 |
| §16 Pruebas | cada tarea (su lista) |
