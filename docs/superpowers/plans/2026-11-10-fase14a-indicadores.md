# Fase 14A — Indicadores, el indicador de punta a punta: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el hospital pueda crear un indicador con su ficha técnica aprobada con firma,
reportarlo periodo a periodo, ver su resultado con semáforo, frase y gráfica, cerrar el mes y
corregir con justificación, con tareas, recordatorios y alertas en la campana.

**Architecture:** Un módulo nuevo, «Indicadores», sobre lo que dejó la Fase 13. Las reglas puras
(intérprete de fórmulas con fracciones exactas, periodos, semáforo, textos, acumulado) viven en
`src/lib/indicadores/`; las consultas, en `src/db/consultas/indicadores/`; la visibilidad, en
`src/lib/alcance.ts`; las acciones, en `src/app/acciones-indicadores.ts`; las páginas, en
`src/app/(app)/indicadores/`. Una sola función, `recalcularMedicion`, escribe el resultado y el
estado de una medición. Las tareas entran por `misTareas()` y los vencimientos por la revisión de
la 13A. La migración `0011` crea todas las tablas de la fase, también las que la 14B usará.

**Tech Stack:** Next.js 16.4 (App Router, Server Actions, route handlers), TypeScript estricto,
PostgreSQL 16 con `postgres` (SQL etiquetado) y Drizzle para el esquema y las migraciones, `zod` 4,
`exceljs`, Tailwind 4 con los componentes de `src/componentes/ui`, gráficas en SVG propio con
animación CSS, Vitest. **Sin dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md` («el spec»). Este plan
cubre la **entrega 14A** (spec §5.1): §6 a §13, el maestro de objetivos de §16 y §17.1. La 14B
(§14, §15, §16 página y cálculo, §17.2, §17.3, §18) tiene su propio plan. Las decisiones del spec se
citan como F14-DCn y los puntos del usuario por su número (3.9, 13.6…).

## Avisos para quien ejecuta

- **La base y el `next dev` del usuario no se tocan** (precedente F13C-R20): su recorrido de la 13C
  sigue pendiente sobre `main`. Todo el plan corre contra una base aparte, `sgc_f14a`, en el mismo
  contenedor `bd` de desarrollo, con su propio almacén (`ALMACEN_RUTA=./almacen-f14a`, ignorado por
  git) y con `DATABASE_URL` y `DATABASE_URL_MIGRADOR` apuntando a ella en el entorno del proceso
  (los valores de desarrollo están en `CONTEXT.md`, punto 3). Si hace falta un servidor para los
  puntos de control, va en otro puerto (`npx next dev -p 3012`). La Tarea 1 la crea y la siembra.
- **«Indicadores» ya nombra cosas de la 13C que NO son este módulo:** la ruta
  `/vigencia/indicadores`, el permiso `documentos.indicadores`,
  `src/db/consultas/vigencia/indicadores.ts`, `src/lib/indicadores-documentales/` y la acción de
  bitácora `exporto_indicadores`. Este módulo vive en `/indicadores`, `indicadores.*`,
  `src/db/consultas/indicadores/` y `src/lib/indicadores/`. No se renombra ni se mueve nada de la
  13C; solo `periodoDe` gana el bimestre (Tarea 4).
- **Next.js de este repo no es el de memoria:** antes de escribir una página, una acción o un
  handler, lea la guía que toque en `node_modules/next/dist/docs/` (regla de `AGENTS.md`).
- **Puntos de control en navegador del controlador** (claro, oscuro y 390 px), con las maquetas de
  `.superpowers/brainstorm/85010-1794341073/content/` (`pantallas-14-v3.html` para el contenido y
  `estilo-graficas-v3.html`, estilo A, para las gráficas): después de las Tareas 7 (ficha y
  aprobación), 10 (reporte y análisis), 12 (cierre), 15 (lista, página y matriz) y 16 (impresión), y
  la demostración de §24 del spec en la Tarea 19.
- **El Excel del usuario** (`INDICADORES_PROCESO_SGC_OK.xlsx`, en la raíz, excluido en
  `.git/info/exclude`) sirve de referencia para la ficha impresa y la semilla; **nunca entra a un
  commit**. La semilla toma de él solo nombre, fórmula, meta y periodicidad (spec, Apéndice A).
- **Cada test estructural se actualiza en la tarea que lo rompe:** `permisos`, `privilegios-bd`,
  `acciones-permisos`, `paginas-sesion`, `proxy-matcher`, `navegacion` (el total de entradas del
  Admin SGC pasa de 20 a 21 en la Tarea 5 y a 22 en la 6) y `bitacora-detalle` (cada acción nueva
  lleva su frase y su nombre en la misma tarea que la introduce).
- **Las tablas de la 14B** nacen en la `0011` y quedan vacías: en esta entrega solo se prueba que
  existen. La `0012` puede rehacerlas (spec §19.5).
- No se lee `.env.local`. No se detiene ni se borra el servicio `bd` ni su volumen. No se hace
  `push` ni `merge` sin que el usuario lo pida. Todo en la rama `fase-14a-indicadores` (ya existe,
  con el spec).

## Global Constraints

- Node 24. TypeScript estricto, sin `any` salvo justificación puntual. Dominio, interfaz y código
  en español.
- **Sin dependencias npm nuevas.** `motion` no está instalada: las animaciones son CSS y respetan
  `prefers-reduced-motion` (F14-DC23).
- **Migración `0011` aditiva**, aplicable sobre una base de `sgc-suaza` o de cualquier fase
  anterior: nada se renombra ni se borra; `firmas_tramite_coherente` y `archivos_contexto_valido`
  se sustituyen por reglas que las filas existentes cumplen (spec §19.1).
- **Una fórmula solo se evalúa con el intérprete** de `src/lib/indicadores/formula/`: nunca `eval`,
  `Function` ni SQL armado con texto del usuario. Gramática cerrada: números con coma o punto
  decimal, letras `A` a `Z`, `+ - * /` (también `−`, `×`, `÷`), paréntesis, menos unario y
  `min(a; b)`, `max(a; b)`, `abs(a)` con **punto y coma** entre argumentos. Límites: 300 caracteres,
  20 niveles, literales de 15 cifras, 200 dígitos en una cifra intermedia (F14-DC14).
- **El veredicto se decide con la fracción exacta** (`Fraccion`, `bigint`), nunca con el número
  redondeado; lo que se muestra nunca contradice el color (spec §7.5).
- **Un solo camino de cálculo:** solo `recalcularMedicion` (Tarea 9) escribe `resultado`,
  `semaforo`, la meta aplicada y `estado` de una medición.
- **Toda escritura exige sesión y un permiso de la matriz** (`indicadores.administrar`,
  `indicadores.aprobar`, `indicadores.medir`, `indicadores.observar`) **más la condición de
  persona** (designado para esa función, aprobador, líder del proceso), comprobada en el servidor
  con las funciones de `src/lib/alcance.ts`. Las Server Actions del módulo viven en
  `src/app/acciones-indicadores.ts` y las de sus maestros en `src/app/admin/acciones-indicadores.ts`,
  cada una con `mutacion(formData, "<permiso>", fn)`.
- **Toda firma sigue F13A-R4:** validador de solo lectura, clave con `verificarParaFirmar` fuera de
  la transacción, comprobaciones repetidas dentro con `FOR UPDATE`. Las firmas de una ficha usan
  `registrarFirma` con `tramiteId: null`, `versionId: null`, `ronda: 0`, `indicadorVersionId` y los
  valores `elaboro` y `aprobo` que ya existen.
- **Toda consulta nueva recibe la conexión como última opción** (`opciones?: { sql?: Cliente;
  ahora?: Date }`, por defecto `obtenerSql()` y `new Date()`); los tests corren dentro de
  `revertida` (`tests/utiles/transaccion.ts`). Los errores de negocio son `ErrorIndicador`
  (extiende `ErrorTramite`); un choque `23505` se traduce a `ErrorIndicador`.
- Esquemas `zod` `.strict()` en `src/lib/esquemas/indicadores.ts`, leídos con `parsearFormulario`;
  un `id` de ruta se lee con `idNumerico()` y `omitir: ["id"]`.
- **Páginas:** cada una llama `exigirSesion()` y después su regla de alcance con `notFound()`
  (F13C-DC39); las de `/admin/indicadores`, dentro de `(panel)`, `exigirPermiso("indicadores.administrar")`.
  **Handlers:** `sesionDePeticion` (401), autorización (404 para lo que la persona no ve) y, si
  escriben, `origenValido()`. La subida `api/mediciones/[id]/archivos` va fuera del `matcher` de
  `src/proxy.ts`, con los puntos como `[.]`, y con su caso en `tests/proxy-matcher.test.ts`.
- **Quien no puede ver un indicador recibe «no encontrado»** y no lo encuentra en listas, conteos,
  la barra de estados, la búsqueda, la matriz, la página del proceso, los Excel, las tareas ni los
  avisos (spec §6.4). Los soportes y las observaciones tienen su propia regla, más estricta.
- **`medicion_eventos` y `medicion_observaciones` son de solo inserción**; una medición cerrada y
  una versión aprobada no se modifican (triggers). Nunca `UPDATE` ni `DELETE` sobre ellas ni sobre
  las demás tablas inmutables, tampoco en la limpieza de un test. Ningún test deja confirmado un
  cierre de mes ni una ficha aprobada fuera de una transacción revertida.
- Fechas, periodos y plazos en la zona de la instalación (`zonaHoraria()`); periodos del calendario;
  plazos en días calendario; la BD guarda `timestamptz`, `date` y las claves de periodo como texto
  (`2026-03`, `2026-B2`, `2026-T1`, `2026-S1`, `2026`).
- Sin `dangerouslySetInnerHTML`; nombres, análisis y observaciones son texto plano; las tarjetas de
  las gráficas escriben con `textContent`. Todo Excel pasa por `neutralizarFormula`.
- Interfaz dentro del cascarón, con los componentes de `src/componentes/ui` y clases de token
  (`mod-indicadores`, `estado-bien|atencion|critico|sin-dato`); nunca colores fijos de Tailwind ni
  hex en `app` o `componentes`. El color nunca va solo ni tiñe texto. Tres niveles: el estado
  `grave` no se usa aquí. Teclado, foco visible, AA en claro y oscuro, 390 px (reportar se hace
  también en el celular).
- Ningún nombre de entidad fuera de `src/db/semillas/demo.ts` y sus semillas hermanas; la marca
  sale de `obtenerMarca()`.
- Todos los archivos con finales de línea LF. Commits convencionales en español con el trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Review Focus

1. **Un periodo que cruza el cambio de año en la zona de la instalación.** El 1 de enero a las
   00:30 de Bogotá (05:30 UTC) diciembre, el bimestre 6, el trimestre 4, el semestre 2 y el año ya
   terminaron y enero no; el 31 de diciembre a las 23:30 de Bogotá (04:30 UTC del día 1) ninguno ha
   terminado. Abrir periodos no crea filas de más ni de menos. Test en la Tarea 4 (reglas) y en la 9
   (`asegurarMediciones`).
2. **Meta 0, resultado 0 y denominador 0.** En descendente con meta 0 el modo relativo se rechaza al
   guardar la ficha y con rangos fijos un resultado 0 es «Bien»; un denominador 0 da «sin
   resultado: división por cero» y ofrece «No aplica», nunca un 0 ni un error. Test en las Tareas 4
   y 9.
3. **La persona designada para medir se desactiva.** Sus tareas pasan a los líderes activos del
   proceso y, si no hay, al Admin SGC, que entonces sí puede reportar y deja la marca `sinMedidor`;
   al designar a alguien, deja de poder. Test en las Tareas 2 y 13.
4. **Dos pestañas a la vez:** reportar la misma medición, aprobar la misma ficha o cerrar el mismo
   mes dos veces. La segunda aprobación falla con «La ficha ya no está por aprobar»; el segundo
   cierre, con «Ese mes ya está cerrado»; el segundo reporte no duplica eventos ni alertas. Test en
   las Tareas 7, 9 y 12.
5. **Un restringido asomándose en un agregado.** La barra de estados y los conteos de la lista, la
   matriz, la sección de la página del proceso, el título de una tarea agrupada («12 indicadores por
   reportar») y la búsqueda no cuentan ni nombran lo que la persona no ve. Test en las Tareas 13,
   15 y 17.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `drizzle/0011_*.sql`, `src/db/esquema.ts`, `src/db/roles-bd.ts`, `src/db/semillas/minima.ts` | Tablas, `CHECK`, triggers, privilegios, `TRUNCATE`, maestros y parámetros sembrados | 1 |
| `src/lib/permisos.ts`, `src/lib/indicadores/tipos.ts`, `src/lib/alcance.ts`, `src/db/consultas/firmas.ts`, `src/lib/subida.ts`, `tests/utiles/indicadores.ts` | Permisos, tipos del módulo, reglas de alcance, firma de ficha, contexto `medicion` | 2 |
| `src/lib/indicadores/formula/{fraccion,analizar,evaluar,formas}.ts` | Intérprete de fórmulas con fracciones exactas | 3 |
| `src/lib/indicadores/{periodos,semaforo,textos,calculo,acumulado,estados,ficha}.ts`, `src/lib/indicadores-documentales/periodo.ts` | Reglas puras | 4 |
| `src/db/consultas/indicadores/maestros.ts`, `src/app/admin/acciones-indicadores.ts`, `src/app/(app)/admin/(panel)/indicadores/**`, `src/db/consultas/mapa-admin.ts` (sigla `IND`), navegación | Maestros, parámetros, «Configuración de indicadores» | 5 |
| `src/db/consultas/indicadores/fichas.ts`, `src/lib/esquemas/indicadores.ts`, `src/app/acciones-indicadores.ts`, `src/app/(app)/indicadores/{page,nuevo,_comun}`, `…/[codigo]/editar`, `src/componentes/indicadores/{PestanasIndicadores,FormularioFicha}.tsx`, navegación | Ficha en borrador, formulario, entrada «Indicadores» | 6 |
| `src/db/consultas/indicadores/aprobacion.ts`, `src/app/(app)/indicadores/por-aprobar`, `…/[codigo]/page.tsx` (pestañas Ficha técnica y Versiones) | Enviar, aprobar, devolver, en bloque, cambio mayor y menor, control de cambios | 7 |
| `src/db/consultas/indicadores/operacion.ts`, componentes de administración de la página | Designados, datos de operación, duplicar, retirar, descartar, borrar | 8 |
| `src/db/consultas/indicadores/{mediciones,alertas}.ts`, `…/[codigo]/reportar/[periodo]`, pestaña Resultados (tabla del año) | Abrir periodos, `recalcularMedicion`, reportar, «no aplica», corregir | 9 |
| `src/db/consultas/indicadores/{analisis,observaciones,metas,historicos}.ts`, componentes | Análisis, observaciones, metas por periodo, históricos | 10 |
| `src/app/api/mediciones/[id]/archivos/route.ts`, `…/[codigo]/soportes/[archivoId]/[[...nombre]]/route.ts`, `src/db/consultas/indicadores/soportes.ts`, `src/proxy.ts` | Soportes | 11 |
| `src/db/consultas/indicadores/cierre.ts`, `src/app/(app)/indicadores/cierre` | Cierre del mes y reapertura | 12 |
| `src/db/consultas/indicadores/{tareas,vencimientos,alertas}.ts`, `src/lib/tareas.ts`, `src/lib/tareas-peticion.ts`, `src/db/consultas/vencimientos.ts`, cascarón | Tareas, recordatorios, escalamiento, alertas, insignia | 13 |
| `src/app/globals.css`, `src/componentes/ui/{GraficoTubos,TuboAcumulado,MiniTubos,Tendencia,BarraEstados}.tsx`, `src/componentes/ui/geometria-tubos.ts` | Gráficas en estilo «Tubos» | 14 |
| `src/db/consultas/indicadores/lectura.ts`, `src/app/(app)/indicadores/{page,matriz}`, `…/[codigo]/page.tsx` (Resultados y Observaciones), `src/componentes/indicadores/*` | Lista completa, página del indicador, matriz del año | 15 |
| `…/[codigo]/imprimir`, `src/app/(app)/indicadores/excel`, `…/[codigo]/excel`, `src/lib/indicadores/excel.ts` | Ficha impresa y los dos Excel | 16 |
| `src/app/(app)/procesos/**`, `src/app/api/buscar/route.ts`, `src/app/(app)/buscar/page.tsx`, `src/lib/busqueda-rapida.ts`, `src/componentes/normograma/*` | Página del proceso, búsqueda, «Indicadores que exige» | 17 |
| `src/db/semillas/indicadores-demo.ts`, `src/db/semillas/demo.ts`, `tests/semilla-indicadores.test.ts` | Demo de la 14A | 18 |
| `docs/manual/usuario/08-*.md`, `CONTEXT.md`, `AGENTS.md`, `PLAN.md`, `README.md` | Documentación de cierre y verificación final | 19 |

---

### Tarea 1: Migración 0011, esquema, roles, privilegios y base de trabajo

**Files:**
- Create: `drizzle/0011_fase14-indicadores.sql` (con `npm run db:generate -- --name fase14-indicadores`, más SQL a mano), `tests/esquema-fase14.test.ts`
- Modify: `src/db/esquema.ts`, `src/db/roles-bd.ts:46` (el `REVOKE`), `src/db/semillas/minima.ts` (`limpiarTodo` y `sembrarBase`), `tests/privilegios-bd.test.ts:50`, `.gitignore` (`almacen-f14a/`)

**Interfaces:**
- Consumes: `sgc_impedir_modificacion()` (`drizzle/0002_fase11-acceso.sql:80`); los helpers privados `id`, `ref`, `refUsuario`, `marca`, `creado` de `src/db/esquema.ts`; `revertida` (`tests/utiles/transaccion.ts`); el patrón de `tests/esquema-fase13c.test.ts` (`fallaCon`, `sentenciaDeMigracion`).
- Produces (nombres definitivos de BD; todo el plan los usa). Tipos: `text` salvo que se diga; `→` es FK `restrict`; `num` es `numeric` sin precisión (llega como texto); `ts` es `timestamptz`.
  - `tipos_indicador(id, nombre, orden int, activo bool)`; único `lower(nombre)`.
  - `clasificaciones_indicador(id, nombre, aprueba, exige_norma bool, orden int, activo bool)`; `CHECK aprueba IN ('gerencia','lider')`; único `lower(nombre)`.
  - `unidades_indicador(id, nombre, sufijo, decimales int, orden int, activo bool)`; `CHECK decimales BETWEEN 0 AND 4`; único `lower(nombre)`.
  - `objetivos(id, clase, enunciado, orden int, activo bool)`; `CHECK clase IN ('calidad','institucional')`.
  - `indicadores(id, codigo, proceso_id →procesos, estado, nivel_acceso, plazo_reporte_dias int, inicio_medicion, soporte_obligatorio bool, baja_por →usuarios, baja_en ts, baja_motivo, creado_por →usuarios, creado_en ts)`; `estado IN ('borrador','activo','retirado','descartado')` por omisión `borrador`; `nivel_acceso IN ('general','restringido')` por omisión `general`; `plazo_reporte_dias BETWEEN 0 AND 90` por omisión 10; `indicadores_baja_coherente`: `(estado IN ('retirado','descartado')) = (baja_por IS NOT NULL AND baja_en IS NOT NULL AND baja_motivo IS NOT NULL)`; índice único `indicadores_codigo_unico` sobre `lower(codigo)`; índice `indicadores_proceso_idx`.
  - `indicador_versiones(id, indicador_id →, numero int, estado, tipo_cambio, motivo_cambio, rige_desde, nombre, proposito, requisito, tipo_id →, tipo_nombre, clasificacion_id →, clasificacion_nombre, objetivo_id →objetivos, objetivo_nombre, proceso_nombre, subproceso_id →subprocesos, subproceso_nombre, procedimiento_documento_id →documentos, punto_control, origen_dato, calculo, calculo_alcance, forma, factor int, formula, unidad_id →, unidad_nombre, unidad_sufijo, decimales int, periodicidad, tendencia, meta num, meta_max num, semaforo_modo, umbral_atencion_pct int, limite_critico num, tolerancia num, resultado_min num, resultado_max num, linea_base_valor num, linea_base_periodo, linea_base_nota, sustento_meta, ente, periodicidad_externa, plazo_externo_dias int, dimension_id →dimensiones, prueba jsonb, nota_devolucion, huella, elaborada_por →usuarios, elaborada_en ts, aprobada_por →usuarios, aprobada_en ts, creado_por →usuarios, creado_en ts, actualizado_en ts)`. `estado IN ('borrador','por_aprobar','aprobada','descartada')`; `tipo_cambio IN ('inicial','mayor','menor')`; `origen_dato IN ('manual','automatico')` por omisión `manual`; `forma IN ('porcentaje','tasa','razon','conteo','libre')`; `periodicidad IN ('mensual','bimestral','trimestral','semestral','anual')`; `tendencia IN ('ascendente','descendente','constante')`; `semaforo_modo IN ('relativo','fijo')`; `decimales BETWEEN 0 AND 4`; `umbral_atencion_pct BETWEEN 1 AND 99`; `indicador_versiones_aprobada_coherente`: `estado <> 'aprobada' OR (elaborada_por IS NOT NULL AND huella IS NOT NULL AND rige_desde IS NOT NULL AND (tipo_cambio = 'menor' OR aprobada_por IS NOT NULL))`. Único `(indicador_id, numero)`. Índice único parcial `indicador_versiones_un_borrador_idx` sobre `(indicador_id) WHERE estado IN ('borrador','por_aprobar')`.
  - `indicador_variables(id, version_id →, letra, nombre, descripcion, fuente, unidad, consolidacion, origen, variable_compartida_id →variables_compartidas, indicador_origen_id →indicadores, toma, captura_min num, captura_max num, admite_negativos bool, orden int)`; `consolidacion IN ('suma','ultimo','promedio')` por omisión `suma`; `origen IN ('propia','compartida','automatica','indicador')` por omisión `propia`; `toma IN ('valor','cumplimiento')`; `letra ~ '^[A-Z]$'`; único `(version_id, letra)`.
  - `indicador_responsables(id, version_id →, cargo_id →cargos, cargo_nombre, funcion)`; `funcion IN ('medir','analizar')`; único `(version_id, cargo_id, funcion)`.
  - `indicador_normas(id, version_id →, norma_id →normas, norma_nombre)`; único `(version_id, norma_id)`.
  - `indicador_designados(id, indicador_id →, usuario_id →usuarios, funcion, creado_por →usuarios, creado_en ts)`; `funcion IN ('mide','analiza','seguimiento')`; único `(indicador_id, usuario_id, funcion)`; índice por `usuario_id`.
  - `indicador_metas(id, indicador_id →, periodo, meta num, meta_max num, justificacion, tardia bool, programada_por →usuarios, programada_en ts)`; único `(indicador_id, periodo)`.
  - `cierres_indicadores(id, mes date, cerrado_por →usuarios, cerrado_en ts, resumen jsonb)`; `mes` único (el último día del mes).
  - `mediciones(id, indicador_id →, version_id →indicador_versiones, periodo, desde ts, hasta ts, vence_en ts, estado, historica bool, no_aplica bool, no_aplica_motivo, resultado_exacto, resultado num, semaforo, meta_aplicada num, meta_max_aplicada num, limite_aplicado num, requiere_accion bool, incumplimiento_repetido bool, analisis, causa, accion_propuesta, reportada_por →usuarios, reportada_en ts, analizada_por →usuarios, analizada_en ts, corregida bool, meta_tardia bool, sin_analisis bool, cierre_id →cierres_indicadores, reabierta_por →usuarios, reabierta_en ts, reabierta_motivo, aviso_previo_en ts, aviso_vencido_en ts, escalado_en ts, alerta_estado)`; `estado IN ('abierta','reportada','cerrada')` por omisión `abierta`; `semaforo IN ('bien','atencion','critico')`; `resultado_exacto` es la fracción como `"n/d"`; único `(indicador_id, periodo)`; índices `(estado, vence_en)` y `(indicador_id, hasta)`.
  - `medicion_valores(id, medicion_id →, variable_id →indicador_variables, categoria_id →dimension_categorias, valor num, no_aplica bool, no_aplica_motivo, reportado_por →usuarios, reportado_en ts)`; índice único `medicion_valores_unico_idx` sobre `(medicion_id, variable_id, categoria_id)` con `NULLS NOT DISTINCT` (SQL a mano, como `lista_miembros_unico_idx`).
  - `medicion_eventos(id, medicion_id →, tipo, usuario_id →usuarios, detalle jsonb, creado_en ts)`; `tipo IN ('reporte','correccion','analisis','no_aplica','meta','soporte','cierre','reapertura','recalculo','historico')`. **Solo inserción.**
  - `medicion_observaciones(id, medicion_id →, usuario_id →usuarios, texto, responde_a →medicion_observaciones, creado_en ts)`. **Solo inserción.**
  - Tablas de la 14B, tal como las describe el spec §19.3, sin más restricciones que sus FK y su unicidad: `variables_compartidas`, `variable_responsables`, `variable_valores`, `calculo_fotos`, `dimensiones`, `dimension_categorias`, `reportes_externos`, `impactos_indicadores`.
  - `firmas`: columna `indicador_version_id →indicador_versiones`; `firmas_tramite_coherente` pasa a `tramite_id IS NOT NULL OR firma IN ('ratifico','adopto') OR indicador_version_id IS NOT NULL`.
  - `archivos`: `archivos_contexto_valido` admite además `'medicion'` y `'reporte_externo'`.
  - Triggers: `medicion_eventos_inmutable`, `medicion_observaciones_inmutable` y `cierres_indicadores_inmutable` (`sgc_impedir_modificacion()`); función `sgc_impedir_si_medicion_cerrada()` con `mediciones_cerrada_inmutable` (`BEFORE UPDATE OR DELETE`) y `medicion_valores_cerrada_inmutable` (`BEFORE INSERT OR UPDATE OR DELETE`); función `sgc_impedir_si_version_aprobada()` con `indicador_versiones_aprobada_inmutable` (`BEFORE UPDATE OR DELETE`) y `indicador_variables_aprobada_inmutable`, `indicador_responsables_aprobada_inmutable`, `indicador_normas_aprobada_inmutable` (`BEFORE INSERT OR UPDATE OR DELETE`). Todos lanzan `42501`.
  - `configuracion`: `ind_umbral_atencion_pct` (70), `ind_aviso_previo_dias` (3), `ind_plazo_reporte_dias` (10), `ind_incumplimiento_periodos` (3), `ind_variacion_confirmar_pct` (30).
  - Siembra de la migración, solo si el maestro está vacío: tipos (Eficacia, Eficiencia, Efectividad); clasificaciones (Estratégico, `gerencia`, no exige norma; Operativo, `lider`, no; Regulatorio, `gerencia`, sí); unidades (Porcentaje ` %` 1; Número sin sufijo 0; Días ` días` 1; Horas ` h` 1; Minutos ` min` 0; Tasa por mil ` por mil` 1; Pesos ` pesos` 0).

- [ ] **Step 0: Base de trabajo aparte**

Copie `.env.example` a `.env.f14a` (git ya ignora `.env*`), cambie el nombre de la base por
`sgc_f14a` en `DATABASE_URL` y `DATABASE_URL_MIGRADOR`, y añada `ALMACEN_RUTA=./almacen-f14a` (la
plantilla no la trae). **No cambie `BD_APP_CLAVE`:** el rol `sgc_app` es de todo el servidor de base
de datos, no de una base, y `db:roles` le sincroniza la clave; con otro valor, el `next dev` del
usuario perdería su conexión. Añada `almacen-f14a/` a `.gitignore`. Todas las órdenes del plan
corren con ese entorno cargado:

```bash
docker compose -f docker-compose.dev.yml exec -T bd psql -U sgc -d postgres -c 'CREATE DATABASE sgc_f14a OWNER sgc'
set -a; . ./.env.f14a; set +a
npm run db:preparar && npm run db:seed && npm run admin:asegurar
```

Expected: «Migraciones al día» con diez migraciones y la demo de la 13C sembrada en `sgc_f14a`.
`SEMILLA_RECIEN=1 npm test` en verde antes de tocar nada (línea base: 4722 pruebas, 1 saltada).

- [ ] **Step 1: Tests que fallan** en `tests/esquema-fase14.test.ts` (patrón de `tests/esquema-fase13c.test.ts`: `postgres` propio, `fallaCon`, `revertida`, `sentenciaDeMigracion`)

```ts
const TABLAS_14A = ["tipos_indicador", "clasificaciones_indicador", "unidades_indicador", "objetivos", "indicadores",
  "indicador_versiones", "indicador_variables", "indicador_responsables", "indicador_normas", "indicador_designados",
  "indicador_metas", "mediciones", "medicion_valores", "medicion_eventos", "medicion_observaciones", "cierres_indicadores"];
const TABLAS_14B = ["variables_compartidas", "variable_responsables", "variable_valores", "calculo_fotos", "dimensiones",
  "dimension_categorias", "reportes_externos", "impactos_indicadores"];

it("existen las 24 tablas de la fase", …);               // information_schema.tables; las de la 14B, solo esto
it("indicadores: estado, nivel de acceso, plazo y baja coherente", …);
//  estado 'otro' → 23514; nivel_acceso 'otro' → 23514; plazo_reporte_dias 91 → 23514;
//  estado 'retirado' sin baja_motivo → 23514; dos códigos 'SGC-IND-01' y 'sgc-ind-01' → 23505
it("una versión: listas cerradas y un solo borrador o por aprobar por indicador", …);
//  forma 'otra', periodicidad 'semanal', tendencia 'lateral', decimales 5, umbral 100 → 23514;
//  segundo borrador del mismo indicador → 23505; 'aprobada' sin huella → 23514; 'aprobada' menor sin aprobada_por → pasa
it("variables: letra de la A a la Z, única por versión", …);            // 'a', 'AB' → 23514; repetida → 23505
it("una medición por indicador y periodo; un valor por variable y categoría, también sin categoría", …);  // 23505 y 23505
it("firmas admite una firma de ficha sin trámite y sigue exigiendo dueño", …);
//  firma 'elaboro' con indicador_version_id y tramite_id nulo → pasa; 'elaboro' sin trámite ni versión de ficha → 23514
it("archivos admite los contextos medicion y reporte_externo", …);      // 'otro' → 23514
it("los triggers existen", …);                                          // lista exacta de los nueve nombres de Produces
it("medicion_eventos, medicion_observaciones y cierres_indicadores no admiten UPDATE ni DELETE", …);   // 42501
it("una medición cerrada no cambia, salvo la reapertura", …);
//  UPDATE resultado → 42501; DELETE → 42501; INSERT/UPDATE/DELETE en medicion_valores → 42501;
//  UPDATE estado='reportada', reabierta_por, reabierta_en=now(), reabierta_motivo → pasa, y después sí admite cambios
it("una versión aprobada no cambia, ni sus variables, responsables y normas", …);   // UPDATE, DELETE e INSERT hijo → 42501
it("la migración siembra los tres maestros y los cinco parámetros solo si faltan", …);  // sentenciaDeMigracion sobre tablas temporales
```

Y en `tests/privilegios-bd.test.ts:50`, la lista gana `"medicion_eventos"` y `"medicion_observaciones"`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/esquema-fase14.test.ts tests/privilegios-bd.test.ts`
Expected: FAIL con `relation "indicadores" does not exist`.

- [ ] **Step 3: Esquema y migración**

Declare las tablas de Produces en `src/db/esquema.ts` (un bloque «Grupo: indicadores (Fase 14)», con
los helpers existentes y rutas relativas), genere con `npm run db:generate -- --name
fase14-indicadores` y añada a mano, al final de `drizzle/0011_fase14-indicadores.sql`, cada
sentencia con `--> statement-breakpoint` salvo la última: el índice `medicion_valores_unico_idx` con
`NULLS NOT DISTINCT`; los tres triggers de `sgc_impedir_modificacion()`; la siembra de los tres
maestros (`INSERT … SELECT … FROM (VALUES …) WHERE NOT EXISTS (SELECT 1 FROM "<tabla>")`, como la
0009); los cinco parámetros (`INSERT INTO "configuracion" … ON CONFLICT ("clave") DO NOTHING`); y
estas dos funciones con sus triggers:

```sql
CREATE OR REPLACE FUNCTION sgc_impedir_si_medicion_cerrada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  estado_medicion text;
BEGIN
  IF TG_TABLE_NAME = 'mediciones' THEN
    IF OLD.estado = 'cerrada' THEN
      -- El único cambio que admite una medición cerrada es su reapertura.
      IF TG_OP = 'UPDATE' AND NEW.estado IN ('abierta', 'reportada')
         AND NEW.reabierta_por IS NOT NULL AND NEW.reabierta_motivo IS NOT NULL
         AND NEW.reabierta_en IS DISTINCT FROM OLD.reabierta_en THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'La medición % está cerrada y no admite cambios (%)', OLD.id, TG_OP USING ERRCODE = '42501';
    END IF;
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT estado INTO estado_medicion FROM mediciones WHERE id = OLD.medicion_id FOR SHARE;
      IF estado_medicion = 'cerrada' THEN
        RAISE EXCEPTION 'La medición % está cerrada y no admite cambios en % (%)', OLD.medicion_id, TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      SELECT estado INTO estado_medicion FROM mediciones WHERE id = NEW.medicion_id FOR SHARE;
      IF estado_medicion = 'cerrada' THEN
        RAISE EXCEPTION 'La medición % está cerrada y no admite cambios en % (%)', NEW.medicion_id, TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
```

`sgc_impedir_si_version_aprobada()` tiene la misma forma: sobre `indicador_versiones`, rechaza
`UPDATE` y `DELETE` si `OLD.estado = 'aprobada'`; sobre las tres tablas hijas, busca el estado de la
versión por `version_id` (`OLD` en `UPDATE`/`DELETE`, `NEW` en `INSERT`/`UPDATE`, con `FOR SHARE`) y
rechaza si es `'aprobada'`. Mensaje: «La versión % de la ficha está aprobada y no admite cambios».

- [ ] **Step 4: Roles y semilla mínima**

`src/db/roles-bd.ts:46`: añada `medicion_eventos, medicion_observaciones` al `REVOKE UPDATE, DELETE`.
`src/db/semillas/minima.ts`: las 24 tablas entran al `TRUNCATE` de `limpiarTodo`, y `sembrarBase`
inserta los tres maestros y los cinco parámetros con los mismos valores de la migración.

- [ ] **Step 5: Aplicar y verificar**

Run: `npm run db:preparar && npx vitest run tests/esquema-fase14.test.ts tests/privilegios-bd.test.ts tests/esquema-fase13c.test.ts`
Expected: «Migraciones al día» con once migraciones; PASS. Después `npm run lint`: limpio.

- [ ] **Step 6: Commit**

```bash
git add drizzle src/db tests/esquema-fase14.test.ts tests/privilegios-bd.test.ts .gitignore
git commit -m "feat(f14a): migración 0011, esquema de indicadores, triggers y privilegios"
```

### Tarea 2: Permisos, tipos del módulo, alcance, firma de ficha y contexto de archivos

**Files:**
- Create: `src/lib/indicadores/tipos.ts`, `tests/utiles/indicadores.ts`, `tests/indicadores-alcance.test.ts`
- Modify: `src/lib/permisos.ts`, `tests/permisos.test.ts` (`ESPERADA`), `src/lib/alcance.ts`, `src/db/consultas/firmas.ts:20`, `src/lib/subida.ts`, `tests/subida.test.ts`

**Interfaces:**
- Consumes: las tablas de la Tarea 1; `SujetoVisibilidad`, `ROLES_VEN_RESTRINGIDO`, `alcanceProcesos` (`src/lib/alcance.ts`); `lideresDeProceso`, `adminsActivos` (`src/db/consultas/tramites.ts`); `ErrorTramite` (`src/db/consultas/flujo/contrato.ts`); `usuarioDePrueba`, `sesionAdmin` (`tests/utiles/tramites.ts`).
- Produces:
  - `Permiso` gana `"indicadores.administrar"` (`admin_sgc`), `"indicadores.aprobar"` (`gerencia`, `lider_proceso`), `"indicadores.medir"` y `"indicadores.observar"` (los cinco roles).
  - `src/lib/indicadores/tipos.ts`: `ESTADOS_INDICADOR`, `ESTADOS_VERSION`, `TIPOS_CAMBIO`, `FORMAS`, `PERIODICIDADES`, `TENDENCIAS`, `MODOS_SEMAFORO`, `CONSOLIDACIONES`, `ORIGENES_VARIABLE`, `FUNCIONES_DESIGNADO = ["mide", "analiza", "seguimiento"]`, `FUNCIONES_CARGO = ["medir", "analizar"]`, `SEMAFOROS = ["bien", "atencion", "critico"]`, `ESTADOS_MEDICION`, `TIPOS_EVENTO` (los del `CHECK`), cada uno `as const` con su tipo (`Forma`, `Periodicidad`, `Tendencia`, `ModoSemaforo`, `Consolidacion`, `FuncionDesignado`, `FuncionCargo`, `Semaforo`, `EstadoMedicion`, `TipoEvento`…); `ETIQUETA_SEMAFORO: Record<Semaforo, string>` («Bien», «Atención», «Crítico»); `class ErrorIndicador extends ErrorTramite`.
  - `registrarFirma(tx, f)` acepta `indicadorVersionId?: number | null` (opcional: los llamadores actuales no cambian).
  - `CONTEXTOS_EVIDENCIA` gana `"medicion"` y `"reporte_externo"`; `validarTipoEvidencia(nombre, muestra, opciones?: { soloPdf?: boolean; conExcel?: boolean })`: con `conExcel` admite además `xlsx` (nunca `xls`); `ERROR_SOPORTE = "El soporte debe ser PDF, imagen (PNG, JPG, WebP) o Excel (.xlsx)"`.
  - En `src/lib/alcance.ts` (todas con `opciones?: { sql?: Cliente }`):
    - `filtroIndicadores(sql: Cliente, sujeto: SujetoVisibilidad)`: fragmento para un `WHERE` sobre `indicadores i`; verdadero si `i.nivel_acceso = 'general'`, o el rol está en `ROLES_VEN_RESTRINGIDO`, o la persona tiene asignado `i.proceso_id` (proceso activo), o está en `indicador_designados`.
    - `puedeVerIndicador(indicadorId: number, sujeto, opciones?): Promise<boolean>` (activo o retirado y pasa el filtro; un `borrador` o `descartado`, solo con `indicadores.administrar`).
    - `puedeVerSoportes(indicadorId, sujeto, opciones?): Promise<boolean>`: `admin_sgc`, `gerencia`, `control_interno`, líder del proceso (rol `lider_proceso` con el proceso asignado) o designado en cualquier función.
    - `type Capacidad = { puede: boolean; sinMedidor: boolean }`.
    - `puedeMedir(indicadorId, sujeto, opciones?): Promise<Capacidad>`: designado `mide` activo, o líder del proceso; el `admin_sgc` solo si está designado o si no hay ningún designado `mide` activo ni líder activo (`sinMedidor: true`).
    - `puedeAnalizar(indicadorId, sujeto, opciones?): Promise<Capacidad>`: igual con la función `analiza`.
    - `puedeObservar(indicadorId, sujeto, opciones?): Promise<boolean>`: ve el indicador y es `admin_sgc`, `gerencia`, `control_interno` o designado `seguimiento`.
    - `aprobadoresDeFicha(versionId: number, opciones?): Promise<number[]>`: según `clasificaciones_indicador.aprueba` de la versión: usuarios activos de rol `gerencia`, o líderes activos del proceso; nunca quien elaboró; si con `lider` no queda nadie, los de `gerencia` (F14-DC19).
    - `puedeAprobarFicha(versionId, sujeto, opciones?): Promise<boolean>`.
    - `responsablesDeMedir(indicadorId, opciones?): Promise<number[]>` y `responsablesDeAnalizar(indicadorId, opciones?): Promise<number[]>`: designados activos de la función; si no hay, líderes activos; si no hay, Admin SGC activos (los destinatarios de tareas y avisos).
  - `tests/utiles/indicadores.ts`: `indicadorDePrueba(tx, o?: { procesoId?: number; nivelAcceso?: "general" | "restringido"; estado?: "borrador" | "activo"; periodicidad?: Periodicidad; tendencia?: Tendencia; meta?: string | null; umbralPct?: number; clasificacion?: "Estratégico" | "Operativo" | "Regulatorio"; inicioMedicion?: string; aprobadaEn?: Date; soporteObligatorio?: boolean; mide?: number[]; analiza?: number[]; seguimiento?: number[]; elaboradaPor?: number }): Promise<{ id: number; codigo: string; versionId: number; variables: { A: number; B: number }; procesoId: number }>` (inserta por SQL un indicador de forma «porcentaje» con su versión, aprobada salvo `estado: "borrador"`).

- [ ] **Step 1: Tests que fallan**

`tests/permisos.test.ts`, en `ESPERADA`:

```ts
"indicadores.administrar": ["admin_sgc"],
"indicadores.aprobar": ["gerencia", "lider_proceso"],
"indicadores.medir": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
"indicadores.observar": ["admin_sgc", "gerencia", "control_interno", "lider_proceso", "consulta"],
```

`tests/indicadores-alcance.test.ts` (cada caso dentro de `revertida`, con `usuarioDePrueba` e `indicadorDePrueba`):

```ts
it("un general lo ve toda sesión; un restringido, los tres roles que ven todo, el asignado a su proceso y el designado", …);
//  restringido de GTH: admin_sgc, gerencia, control_interno → true; lider_proceso de GTH → true; consulta asignado a GTH → true;
//  consulta designado en seguimiento sin proceso → true; lider_proceso de CEX → false; consulta sin nada → false
it("filtroIndicadores da el mismo resultado en un WHERE que puedeVerIndicador uno por uno", …);
it("un borrador solo lo ve quien administra", …);
it("soportes: los tres roles, el líder del proceso y los designados; no el consulta asignado al proceso", …);
it("mide el designado y el líder del proceso; el Admin SGC solo designado", …);
//  puedeMedir(admin) con un designado activo → { puede: false, sinMedidor: false }
it("si el designado se desactiva y hay líder, el Admin SGC sigue sin poder; sin designado ni líder, puede con sinMedidor", …);
//  → { puede: true, sinMedidor: true }; al designar a alguien activo vuelve a { puede: false, sinMedidor: false }
it("responsablesDeMedir: designados activos; si no, líderes activos; si no, Admin SGC activos", …);
it("observa quien ve el indicador y es de los tres roles o designado en seguimiento", …);
it("aprueba Gerencia lo estratégico y lo regulatorio, y el líder lo operativo; nunca quien elaboró", …);
it("operativo en un proceso sin líder: aprueba Gerencia", …);
it("registrarFirma guarda una firma de ficha sin trámite ni versión de documento", …);
//  { tramiteId: null, versionId: null, ronda: 0, firma: "elaboro", indicadorVersionId } → fila con indicador_version_id
```

En el test de `validarTipoEvidencia`: con `{ conExcel: true }` un `.xlsx` pasa; `.xls`, `.docx` y
`.zip` dan `ERROR_SOPORTE`; sin la opción, el `.xlsx` sigue dando el error de evidencia de siempre.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/permisos.test.ts tests/indicadores-alcance.test.ts`
Expected: FAIL (`indicadores.administrar` no existe en `Permiso`; `filtroIndicadores` no existe).

- [ ] **Step 3: Permisos y tipos** (`src/lib/permisos.ts`, `src/lib/indicadores/tipos.ts`)

Las cuatro entradas en `Permiso` y `MATRIZ`; las constantes y tipos de Produces, con los mismos
valores de los `CHECK` de la Tarea 1.

- [ ] **Step 4: `registrarFirma` y `validarTipoEvidencia`**

`indicadorVersionId` entra al `INSERT` de `registrarFirma` (nulo si falta). `validarTipoEvidencia`
con `conExcel` añade `xlsx` a las extensiones permitidas y usa `ERROR_SOPORTE`.

- [ ] **Step 5: Las funciones de `src/lib/alcance.ts` y `tests/utiles/indicadores.ts`**

Una consulta por función, con SQL etiquetado. «Líder del proceso» es rol `lider_proceso`, activo,
con el proceso en `usuario_procesos` y el proceso activo, como `lideresDeProceso`. Amplíe el
comentario de cabecera de `alcance.ts` con las dos excepciones nombradas (spec §6.4): la lectura de
indicadores generales es de toda sesión y la designación da alcance sin liderar el proceso.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/permisos.test.ts tests/indicadores-alcance.test.ts tests/firma.test.ts tests/acta.test.ts tests/acta-cierre.test.ts tests/subida.test.ts && npm run lint`
Expected: PASS; el acta no cambia (sus tests siguen en verde).

- [ ] **Step 7: Commit**

```bash
git add src/lib src/db/consultas/firmas.ts tests
git commit -m "feat(f14a): permisos, tipos y reglas de alcance de indicadores"
```

### Tarea 3: Intérprete de fórmulas

**Files:**
- Create: `src/lib/indicadores/formula/fraccion.ts`, `analizar.ts`, `evaluar.ts`, `formas.ts`, `tests/indicadores-formula.test.ts`, `tests/indicadores-formula-hostil.test.ts`

**Interfaces:**
- Consumes: `Forma` (`src/lib/indicadores/tipos.ts`).
- Produces:
  - `fraccion.ts`: `type Fraccion = { n: bigint; d: bigint }` (siempre reducida, `d > 0`); `CERO`, `UNO`, `CIEN`; `fraccion(texto: string): Fraccion | null` (acepta `12`, `0,5`, `0.5`, `-3,25`; `null` si no es un número, o pasa de 15 cifras enteras o de 10 decimales); `entero(n: number | bigint): Fraccion`; `sumar`, `restar`, `multiplicar(a, b): Fraccion`; `dividir(a, b): Fraccion | null` (`null` si `b` es cero); `comparar(a, b): -1 | 0 | 1`; `esNegativa(a): boolean`; `fueraDeRango(a): boolean` (más de `LIMITE_DIGITOS = 200` en `n` o `d`); `aTexto(a): string` (`"n/d"`) y `deTexto(t): Fraccion`; `aDecimal(a, decimales: number, modo: "redondear" | "truncar"): string` (con punto, sin exponente).
  - `analizar.ts`: `MAX_CARACTERES = 300`, `MAX_PROFUNDIDAD = 20`, `MAX_CIFRAS = 15`; `type Nodo = { t: "num"; v: Fraccion } | { t: "var"; letra: string } | { t: "neg"; a: Nodo } | { t: "op"; op: "+" | "-" | "*" | "/"; a: Nodo; b: Nodo } | { t: "fn"; fn: "min" | "max" | "abs"; args: Nodo[] }`; `analizar(formula: string): { ok: true; arbol: Nodo; variables: string[] } | { ok: false; error: string }` (`variables` ordenadas y sin repetir).
  - `evaluar.ts`: `type Motivo = "division_por_cero" | "falta_variable" | "fuera_de_rango"`; `evaluar(arbol: Nodo, valores: Record<string, Fraccion | undefined>): { ok: true; valor: Fraccion } | { ok: false; motivo: Motivo; variable?: string }`; `TEXTO_MOTIVO: Record<Motivo, string>` («división por cero», «falta una variable», «cifra fuera de rango»).
  - `formas.ts`: `FACTORES_TASA = [100, 1000, 10000, 100000]`; `formulaDeForma(forma: Exclude<Forma, "libre">, factor?: number): string` (`"A / B * 100"`, `"A / B * 1000"`, `"A / B"`, `"A"`); `letrasDeForma(forma: Exclude<Forma, "libre">): string[]`; `enPalabras(formula: string, nombres: Record<string, string>): string` (`"(Auditorías ejecutadas ÷ Auditorías programadas) × 100"`).

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-formula.test.ts`

```ts
const f = (t: string) => fraccion(t)!;
const valor = (formula: string, v: Record<string, string> = {}) => {
  const a = analizar(formula);
  if (!a.ok) throw new Error(a.error);
  return evaluar(a.arbol, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, f(x)])));
};

it("fraccion lee coma y punto y rechaza lo que no es un número", () => {
  expect(comparar(f("0,5"), f("0.5"))).toBe(0);
  expect(aTexto(f("-3,25"))).toBe("-13/4");
  for (const malo of ["", "1,2,3", "1e9", "0x10", "12a", "1234567890123456", "0,12345678901"]) expect(fraccion(malo)).toBeNull();
});
it("un tercio por tres da uno exacto", () => {
  expect(comparar(multiplicar(dividir(entero(1), entero(3))!, entero(3)), UNO)).toBe(0);
});
it("precedencia, paréntesis y menos unario", () => {
  expect(valor("2 + 3 * 4")).toEqual({ ok: true, valor: f("14") });
  expect(valor("(2 + 3) * 4")).toEqual({ ok: true, valor: f("20") });
  expect(valor("-A + 1", { A: "3" })).toEqual({ ok: true, valor: f("-2") });
});
it("las formas del spec", () => {
  expect(valor(formulaDeForma("porcentaje"), { A: "3", B: "5" })).toEqual({ ok: true, valor: f("60") });
  expect(valor(formulaDeForma("tasa", 1000), { A: "2", B: "400" })).toEqual({ ok: true, valor: f("5") });
  expect(analizar("A ÷ B × 100")).toEqual(analizar("A / B * 100"));
  expect(analizar("A / B * 100")).toMatchObject({ ok: true, variables: ["A", "B"] });
});
it("min, max y abs, con punto y coma entre argumentos y coma decimal", () => {
  expect(valor("max(A; 0,5)", { A: "0,2" })).toEqual({ ok: true, valor: f("0,5") });
  expect(valor("min(A; B)", { A: "7", B: "4" })).toEqual({ ok: true, valor: f("4") });
  expect(valor("abs(A - B)", { A: "4", B: "7" })).toEqual({ ok: true, valor: f("3") });
});
it("sin resultado, con su motivo", () => {
  expect(valor("A / B", { A: "1", B: "0" })).toEqual({ ok: false, motivo: "division_por_cero" });
  expect(valor("A / B", { A: "1" })).toEqual({ ok: false, motivo: "falta_variable", variable: "B" });
  expect(valor(Array(15).fill("999999999999999").join(" * "))).toEqual({ ok: false, motivo: "fuera_de_rango" });
});
it("aDecimal redondea o trunca, sin exponente", () => {
  expect(aDecimal(f("89,96"), 1, "redondear")).toBe("90.0");
  expect(aDecimal(f("89,96"), 1, "truncar")).toBe("89.9");
  expect(aDecimal(dividir(entero(1), entero(3))!, 2, "redondear")).toBe("0.33");
});
it("la fórmula en palabras", () => {
  expect(enPalabras("A / B * 100", { A: "Auditorías ejecutadas", B: "Auditorías programadas" }))
    .toBe("(Auditorías ejecutadas ÷ Auditorías programadas) × 100");
});
```

Y en `tests/indicadores-formula-hostil.test.ts`:

```ts
const HOSTILES = [
  "", "   ", "()", "A +", "* A", "A B", "A ** 2", "A ^ 2", "A % 2", "A == B", "A > B", "A ? B : C",
  "constructor", "__proto__", "process", "eval(1)", "Function(1)", "A.b", "A[0]", "A(1)", "max(A)", "abs(A; B)",
  "max(A, B)", "min()", ";", "A;B", "\"x\"", "'x'", "`x`", "${A}", "1e9", "0x10", "Ａ + 1", "A ＋ 1", "a + 1",
  "A\u0000B", "A‮B", "//", "/* */", "A + 1234567890123456",
];
it.each(HOSTILES)("rechaza %j sin lanzar", (s) => {
  expect(() => analizar(s)).not.toThrow();
  expect(analizar(s).ok).toBe(false);
});
it("límites de longitud y de profundidad, con mensaje", () => {
  expect(analizar("1+".repeat(150) + "1")).toEqual({ ok: false, error: "La fórmula no puede pasar de 300 caracteres" });
  expect(analizar("(".repeat(21) + "A" + ")".repeat(21))).toEqual({ ok: false, error: "La fórmula tiene demasiados niveles de paréntesis" });
  expect(analizar("(".repeat(20) + "A" + ")".repeat(20)).ok).toBe(true);
});
it("analizar y evaluar la peor fórmula admitida toma menos de 50 ms", () => {
  const peor = Array(18).fill("999999999999999").join("*");
  const t = performance.now();
  const a = analizar(peor);
  if (a.ok) evaluar(a.arbol, {});
  expect(performance.now() - t).toBeLessThan(50);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-formula.test.ts tests/indicadores-formula-hostil.test.ts`
Expected: FAIL (los módulos no existen).

- [ ] **Step 3: `fraccion.ts`**

Fracción de `bigint` siempre reducida (máximo común divisor) y con denominador positivo. `fraccion`
valida con una expresión regular anclada (`^-?\d{1,15}([.,]\d{1,10})?$`) antes de construir.

- [ ] **Step 4: `analizar.ts`**

Antes de nada: rechazar por longitud; normalizar `−`, `×` y `÷` a `-`, `*` y `/`; rechazar todo
carácter fuera de dígitos, `A-Z`, `a-z` (solo para `min`, `max`, `abs`), `+ - * / ( ) ; , .` y
espacio. Descenso recursivo sobre esta gramática, con un contador de profundidad que sube en cada
paréntesis, llamada y menos unario:

```
expresion := termino (("+" | "-") termino)*
termino   := factor (("*" | "/") factor)*
factor    := "-" factor | numero | letra | funcion "(" expresion (";" expresion)* ")" | "(" expresion ")"
numero    := digitos (("," | ".") digitos)?        -- hasta 15 cifras
letra     := "A".."Z"                              -- exactamente una; "AB" o "a" son error
funcion   := "min" | "max" | "abs"                 -- min y max, dos argumentos; abs, uno
```

Errores en español, uno por causa (carácter no admitido, nombre no reconocido, falta un paréntesis,
«Separe los argumentos con punto y coma», número de argumentos, expresión incompleta). El árbol es
datos puros: ningún nodo guarda funciones ni se indexa con texto del usuario.

- [ ] **Step 5: `evaluar.ts` y `formas.ts`**

`evaluar` recorre el árbol; después de cada operación comprueba `fueraDeRango`; `min` y `max` con
`comparar`. `enPalabras` reconstruye la expresión desde el árbol, con `÷`, `×`, los nombres de las
variables y paréntesis alrededor de una división que va seguida de una multiplicación.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-formula.test.ts tests/indicadores-formula-hostil.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/indicadores/formula tests/indicadores-formula.test.ts tests/indicadores-formula-hostil.test.ts
git commit -m "feat(f14a): intérprete de fórmulas con fracciones exactas"
```

### Tarea 4: Reglas puras de periodos, semáforo, textos, cálculo, acumulado, estados y ficha

**Files:**
- Create: `src/lib/indicadores/periodos.ts`, `semaforo.ts`, `textos.ts`, `calculo.ts`, `acumulado.ts`, `estados.ts`, `ficha.ts`, `tests/indicadores-periodos.test.ts`, `tests/indicadores-semaforo.test.ts`, `tests/indicadores-textos.test.ts`, `tests/indicadores-acumulado.test.ts`, `tests/indicadores-ficha.test.ts`
- Modify: `src/lib/indicadores-documentales/periodo.ts` (el bimestre), su test

**Interfaces:**
- Consumes: `Fraccion` y sus operaciones, `Nodo`, `analizar`, `evaluar`, `Motivo` (Tarea 3); `Periodo`, `periodoDe` (`src/lib/indicadores-documentales/periodo.ts`); `fechaEnZona`, `finDeFecha` (`src/lib/tramites/plazos.ts`); los tipos de la Tarea 2.
- Produces:
  - `periodoDe(clave, zona)` acepta además `AAAA-B1` a `AAAA-B6` (etiqueta «primer bimestre de 2026»).
  - `periodos.ts`: `periodicidadDe(clave: string): Periodicidad | null`; `periodoQueContiene(p: Periodicidad, instante: Date, zona: string): Periodo`; `periodosTerminados(p: Periodicidad, desdeClave: string, ahora: Date, zona: string): Periodo[]` (desde esa clave, incluida, hasta el último que terminó antes de `ahora`; vacío si ninguno); `anterior(clave: string): string`; `mismoDelAnioAnterior(clave: string): string`; `clavesDelAnio(p: Periodicidad, anio: number): string[]`; `mesesDe(clave: string): [number, number]` (primer y último mes, 1 a 12); `fechaLimiteDeReporte(periodo: Periodo, plazoDias: number, zona: string): Date` (fin del día del último día del periodo más el plazo); `contiene(mayor: Periodicidad, menor: Periodicidad): boolean`.
  - `semaforo.ts`: `type Regla = { tendencia: Tendencia; meta: Fraccion | null; metaMax: Fraccion | null; modo: ModoSemaforo | null; umbralPct: number | null; limite: Fraccion | null; tolerancia: Fraccion | null }`; `limiteDeCritico(r: Regla): Fraccion | null`; `semaforoDe(resultado: Fraccion, r: Regla): Semaforo | null` (`null` es «sin meta»); `errorDeRegla(r: Regla): string | null`; `rangosEnPalabras(r: Regla, u: Unidad): string | null`.
  - `textos.ts`: `type Unidad = { sufijo: string; decimales: number }`; `textoValor(v: Fraccion, u: Unidad, regla?: Regla): string` (coma decimal; con `regla`, nunca contradice el veredicto); `textoMeta(r: Regla, u: Unidad): string` («≥ 90 %», «≤ 30 min», «98 a 100 %», «sin meta»); `fraseDeResultado(m: { resultado: Fraccion | null; semaforo: Semaforo | null; noAplica: boolean; motivo: string | null }, r: Regla, u: Unidad): string`; `comparacion(actual: Fraccion, previo: { valor: Fraccion; etiqueta: string } | null, anioAnterior: { valor: Fraccion; etiqueta: string } | null, tendencia: Tendencia, u: Unidad): { texto: string; flecha: "sube" | "baja" | "igual"; mejora: boolean | null } | null`.
  - `calculo.ts`: `type FichaDeCalculo = { arbol: Nodo; letras: string[]; resultadoMin: Fraccion | null; resultadoMax: Fraccion | null }`; `calcular(f: FichaDeCalculo, valores: Record<string, Fraccion | undefined>, regla: Regla): { completo: boolean; resultado: Fraccion | null; sinResultado: Motivo | null; semaforo: Semaforo | null; fueraDeLimites: boolean }` (la usan el servidor y el formulario del cliente); `variacionExcesiva(actual: Fraccion, previo: Fraccion | null, pct: number): boolean`.
  - `acumulado.ts`: `type PeriodoMedido = { clave: string; versionId: number; noAplica: boolean; valores: Record<string, Fraccion> | null }`; `acumulado(periodos: PeriodoMedido[], f: { versionId: number; calculo: FichaDeCalculo; consolidacion: Record<string, Consolidacion>; esperados: string[]; regla: Regla }): { resultado: Fraccion | null; valores: Record<string, Fraccion>; semaforo: Semaforo | null; faltan: string[]; desde: string | null; sinResultado: Motivo | null }`.
  - `estados.ts`: `type EstadoVisible = "por_reportar" | "falta_dato" | "falta_analisis" | "reportada" | "cerrada"`; `estadoVisible(m: { estado: EstadoMedicion; vence: Date; historica: boolean; datosCompletos: boolean; faltaDatoAjeno: boolean; faltaAnalisis: boolean }, ahora: Date): { estado: EstadoVisible; vencida: boolean }`; `analisisExigido(m: { semaforo: Semaforo | null; repetido: boolean; historica: boolean; noAplica: boolean }): "ninguno" | "simple" | "dos_partes"`; `esRepetido(anteriores: (Semaforo | null)[], actual: Semaforo | null, n: number): boolean` (`anteriores` del más reciente al más antiguo, ya sin «no aplica», «sin dato» ni históricos); `ETIQUETA_ESTADO: Record<EstadoVisible, string>`.
  - `ficha.ts`: `type ContenidoFicha` (los campos de la versión de la Tarea 1 que son contenido, más `variables`, `responsables` y `normas`, con los nombres firmados); `CAMPOS_MAYORES: readonly string[]`; `tipoDeCambio(vigente: ContenidoFicha, nuevo: ContenidoFicha): "mayor" | "menor" | "ninguno"`; `camposCambiados(vigente, nuevo): string[]` (etiquetas legibles); `huellaDeFicha(c: ContenidoFicha): string` (SHA-256 en hexadecimal del JSON con claves ordenadas).

- [ ] **Step 1: Tests que fallan** (sin base de datos; `zona = "America/Bogota"`, `f = (t) => fraccion(t)!`)

`tests/indicadores-periodos.test.ts`:

```ts
it("periodoDe conoce el bimestre", () => {
  const b = periodoDe("2026-B1", zona)!;
  expect(b.etiqueta).toBe("primer bimestre de 2026");
  expect(b.hasta.toISOString()).toBe("2026-03-01T04:59:59.999Z");
  expect(periodoDe("2026-B7", zona)).toBeNull();
});
it("el periodo que contiene un instante", () => {
  expect(periodoQueContiene("trimestral", new Date("2026-05-15T12:00:00Z"), zona).clave).toBe("2026-T2");
  expect(periodoQueContiene("bimestral", new Date("2026-05-15T12:00:00Z"), zona).clave).toBe("2026-B3");
});
it("el cambio de año, en la zona de la instalación", () => {      // Review Focus 1
  const yaEsEnero = new Date("2027-01-01T05:30:00Z");               // 00:30 del 1 de enero en Bogotá
  const aunDiciembre = new Date("2027-01-01T04:30:00Z");            // 23:30 del 31 de diciembre en Bogotá
  const claves = (p: Periodicidad, desde: string, ahora: Date) => periodosTerminados(p, desde, ahora, zona).map((x) => x.clave);
  expect(claves("mensual", "2026-11", yaEsEnero)).toEqual(["2026-11", "2026-12"]);
  expect(claves("mensual", "2026-11", aunDiciembre)).toEqual(["2026-11"]);
  for (const [p, clave] of [["bimestral", "2026-B6"], ["trimestral", "2026-T4"], ["semestral", "2026-S2"], ["anual", "2026"]] as const) {
    expect(claves(p, clave, yaEsEnero)).toEqual([clave]);
    expect(claves(p, clave, aunDiciembre)).toEqual([]);
  }
});
it("anterior, mismo periodo del año anterior, claves y meses", () => {
  expect([anterior("2026-01"), anterior("2026-B1"), anterior("2026-T1"), anterior("2026-S1"), anterior("2026")])
    .toEqual(["2025-12", "2025-B6", "2025-T4", "2025-S2", "2025"]);
  expect(mismoDelAnioAnterior("2026-S2")).toBe("2025-S2");
  expect(clavesDelAnio("bimestral", 2026)).toEqual(["2026-B1", "2026-B2", "2026-B3", "2026-B4", "2026-B5", "2026-B6"]);
  expect([mesesDe("2026-03"), mesesDe("2026-B2"), mesesDe("2026-T2"), mesesDe("2026-S2"), mesesDe("2026")])
    .toEqual([[3, 3], [3, 4], [4, 6], [7, 12], [1, 12]]);
});
it("la fecha límite es el fin del día, diez días después del fin del periodo", () => {
  expect(fechaLimiteDeReporte(periodoDe("2026-03", zona)!, 10, zona).toISOString()).toBe("2026-04-11T04:59:59.999Z");
});
it("qué periodicidad contiene a cuál", () => {
  expect(contiene("trimestral", "mensual")).toBe(true);
  expect(contiene("semestral", "bimestral")).toBe(true);
  expect(contiene("trimestral", "bimestral")).toBe(false);
  expect(contiene("mensual", "anual")).toBe(false);
  expect(contiene("anual", "anual")).toBe(true);
});
```

`tests/indicadores-semaforo.test.ts`:

```ts
const asc: Regla = { tendencia: "ascendente", meta: f("90"), metaMax: null, modo: "relativo", umbralPct: 70, limite: null, tolerancia: null };
const desc: Regla = { ...asc, tendencia: "descendente", meta: f("30") };
const pct: Unidad = { sufijo: " %", decimales: 1 };

it("ascendente, relativo a la meta, con los bordes exactos", () => {
  expect(comparar(limiteDeCritico(asc)!, f("63"))).toBe(0);
  expect(["90", "89,96", "63", "62,99"].map((v) => semaforoDe(f(v), asc))).toEqual(["bien", "atencion", "atencion", "critico"]);
});
it("descendente: el límite es la meta dividida por el umbral", () => {
  expect(["30", "31", "42,85", "43"].map((v) => semaforoDe(f(v), desc))).toEqual(["bien", "atencion", "atencion", "critico"]);
});
it("meta 0 en descendente", () => {                                   // Review Focus 2
  expect(errorDeRegla({ ...desc, meta: f("0") })).toBe("Con meta 0 en tendencia descendente, escriba los rangos del semáforo");
  const fijo: Regla = { ...desc, meta: f("0"), modo: "fijo", umbralPct: null, limite: f("2") };
  expect(errorDeRegla(fijo)).toBeNull();
  expect(["0", "1", "2", "3"].map((v) => semaforoDe(f(v), fijo))).toEqual(["bien", "atencion", "atencion", "critico"]);
});
it("constante: un rango con tolerancia", () => {
  const cte: Regla = { tendencia: "constante", meta: f("98"), metaMax: f("100"), modo: "fijo", umbralPct: null, limite: null, tolerancia: f("2") };
  expect(["99", "97", "95", "101", "103"].map((v) => semaforoDe(f(v), cte))).toEqual(["bien", "atencion", "critico", "atencion", "critico"]);
});
it("sin meta no hay semáforo, y un límite del lado equivocado se rechaza", () => {
  expect(semaforoDe(f("50"), { ...asc, meta: null, modo: null, umbralPct: null })).toBeNull();
  expect(errorDeRegla({ ...asc, modo: "fijo", umbralPct: null, limite: f("95") })).toBe("El límite de crítico debe quedar por debajo de la meta");
});
it("los rangos, en palabras", () => {
  expect(rangosEnPalabras(asc, pct)).toBe("Bien desde 90 % · Atención de 63 a 89,9 % · Crítico por debajo de 63 %");
  expect(rangosEnPalabras({ ...asc, meta: null, modo: null, umbralPct: null }, pct)).toBeNull();
});
```

`tests/indicadores-textos.test.ts`:

```ts
it("la cifra nunca contradice el veredicto y no lleva ceros de relleno", () => {
  expect(textoValor(f("89,96"), pct, asc)).toBe("89,9 %");          // redondeado sería 90 % y diría «cumple»
  expect(textoValor(f("92"), pct)).toBe("92 %");
  expect(textoValor(dividir(entero(250), entero(3))!, pct)).toBe("83,3 %");
});
it("la frase de cada caso", () => {
  const min: Unidad = { sufijo: " min", decimales: 0 };
  expect(fraseDeResultado({ resultado: f("92"), semaforo: "bien", noAplica: false, motivo: null }, asc, pct)).toBe("Cumple: 92 % frente a una meta de 90 %.");
  expect(fraseDeResultado({ resultado: f("60"), semaforo: "critico", noAplica: false, motivo: null }, asc, pct)).toBe("No cumple: 60 % frente a una meta de 90 %.");
  expect(fraseDeResultado({ resultado: f("28"), semaforo: "bien", noAplica: false, motivo: null }, desc, min)).toBe("Cumple: 28 min frente a una meta de máximo 30 min.");
  expect(fraseDeResultado({ resultado: f("92"), semaforo: null, noAplica: false, motivo: null }, { ...asc, meta: null }, pct)).toBe("92 %, sin meta para este periodo.");
  expect(fraseDeResultado({ resultado: null, semaforo: null, noAplica: true, motivo: "no había auditorías programadas" }, asc, pct)).toBe("No aplica: no había auditorías programadas.");
  expect(fraseDeResultado({ resultado: null, semaforo: null, noAplica: false, motivo: null }, asc, pct)).toBe("Sin dato: no se reportó.");
});
it("la comparación dice hacia dónde fue el valor y si eso es mejorar", () => {
  expect(comparacion(f("60"), { valor: f("83"), etiqueta: "el segundo trimestre" }, null, "ascendente", pct))
    .toEqual({ texto: "23 puntos menos que en el segundo trimestre", flecha: "baja", mejora: false });
  expect(comparacion(f("34"), { valor: f("38"), etiqueta: "septiembre" }, { valor: f("32"), etiqueta: "octubre de 2025" }, "descendente", { sufijo: " min", decimales: 0 }))
    .toEqual({ texto: "4 min menos que en septiembre; 2 min más que en octubre de 2025", flecha: "baja", mejora: true });
  expect(comparacion(f("60"), null, null, "ascendente", pct)).toBeNull();
});
```

`tests/indicadores-acumulado.test.ts`:

```ts
const porcentaje = (): FichaDeCalculo => { const a = analizar("A / B * 100"); if (!a.ok) throw new Error(); return { arbol: a.arbol, letras: ["A", "B"], resultadoMin: null, resultadoMax: f("100") }; };

it("calcular: resultado, semáforo, límites y división por cero", () => {
  expect(calcular(porcentaje(), { A: f("3"), B: f("5") }, asc)).toMatchObject({ completo: true, semaforo: "critico", sinResultado: null, fueraDeLimites: false });
  expect(calcular(porcentaje(), { A: f("3") }, asc)).toMatchObject({ completo: false, resultado: null });
  expect(calcular(porcentaje(), { A: f("3"), B: f("0") }, asc)).toMatchObject({ completo: true, resultado: null, sinResultado: "division_por_cero", semaforo: null });
  expect(calcular(porcentaje(), { A: f("6"), B: f("5") }, asc).fueraDeLimites).toBe(true);
});
it("variación que pide confirmación", () => {
  expect(variacionExcesiva(f("60"), f("83"), 30)).toBe(false);       // 27,7 %
  expect(variacionExcesiva(f("50"), f("83"), 30)).toBe(true);
  expect(variacionExcesiva(f("50"), null, 30)).toBe(false);
  expect(variacionExcesiva(f("5"), f("0"), 30)).toBe(true);
});
it("el acumulado sale de las sumas, no del promedio de los porcentajes", () => {
  const p = (clave: string, A: string, B: string): PeriodoMedido => ({ clave, versionId: 1, noAplica: false, valores: { A: f(A), B: f(B) } });
  const r = acumulado([p("2026-T1", "5", "5"), p("2026-T2", "5", "6"), p("2026-T3", "3", "5")],
    { versionId: 1, calculo: porcentaje(), consolidacion: { A: "suma", B: "suma" }, esperados: ["2026-T1", "2026-T2", "2026-T3"], regla: asc });
  expect(comparar(r.resultado!, f("81,25"))).toBe(0);                // 13 / 16; el promedio daría 81,1
  expect(r).toMatchObject({ semaforo: "atencion", faltan: [], desde: "2026-T1" });
});
it("último valor y promedio; «no aplica» se salta; lo que falta se nombra; otra versión no entra", () => {
  // consolidación 'ultimo' con 100, 120, 90 → 90; 'promedio' → 310/3;
  // un periodo noAplica no cuenta; esperados con una clave sin periodo → faltan: [esa clave];
  // un periodo con versionId 1 y dos con versionId 2, f.versionId = 2 → solo los dos últimos y desde = el primero de ellos
});
```

`tests/indicadores-ficha.test.ts`: `tipoDeCambio` da `"menor"` al cambiar nombre, propósito,
requisito, tipo, objetivo, subproceso, decimales, un cargo, la descripción o la fuente de una
variable, sus límites de captura, la línea base o una norma; `"mayor"` al cambiar clasificación,
forma, fórmula, cuántas variables hay, el origen o la consolidación de una, unidad, periodicidad,
tendencia, meta, modo, umbral, límite o tolerancia; `"ninguno"` si son iguales. `camposCambiados`
devuelve las etiquetas legibles ordenadas (`["Meta", "Nombre"]`). `huellaDeFicha` no depende del
orden de las claves, tiene 64 caracteres hexadecimales y cambia si cambia un nombre firmado (el
cargo «Líder de Calidad» por «Coordinador de Calidad»). Y los de `estados.ts`:

```ts
it("qué análisis se exige", () => {
  const m = { repetido: false, historica: false, noAplica: false };
  expect(analisisExigido({ ...m, semaforo: "bien" })).toBe("ninguno");
  expect(analisisExigido({ ...m, semaforo: null })).toBe("ninguno");
  expect(analisisExigido({ ...m, semaforo: "atencion" })).toBe("simple");
  expect(analisisExigido({ ...m, semaforo: "critico" })).toBe("dos_partes");
  expect(analisisExigido({ ...m, semaforo: "atencion", repetido: true })).toBe("dos_partes");
  expect(analisisExigido({ ...m, semaforo: "critico", historica: true })).toBe("ninguno");
  expect(analisisExigido({ ...m, semaforo: "critico", noAplica: true })).toBe("ninguno");
});
it("incumplimiento repetido: N periodos seguidos sin «Bien»", () => {
  expect(esRepetido(["atencion", "critico"], "atencion", 3)).toBe(true);
  expect(esRepetido(["bien", "atencion"], "atencion", 3)).toBe(false);
  expect(esRepetido(["atencion"], "atencion", 3)).toBe(false);
  expect(esRepetido(["atencion", "atencion"], "bien", 3)).toBe(false);
});
it("el estado que se muestra", () => {
  const base = { estado: "abierta" as const, vence: new Date("2026-04-10T23:59:59Z"), historica: false, datosCompletos: false, faltaDatoAjeno: false, faltaAnalisis: false };
  const antes = new Date("2026-04-05T12:00:00Z"), despues = new Date("2026-04-12T12:00:00Z");
  expect(estadoVisible(base, antes)).toEqual({ estado: "por_reportar", vencida: false });
  expect(estadoVisible(base, despues)).toEqual({ estado: "por_reportar", vencida: true });
  expect(estadoVisible({ ...base, faltaDatoAjeno: true }, antes).estado).toBe("falta_dato");
  expect(estadoVisible({ ...base, datosCompletos: true, faltaAnalisis: true }, despues)).toEqual({ estado: "falta_analisis", vencida: true });
  expect(estadoVisible({ ...base, historica: true }, despues).vencida).toBe(false);
  expect(estadoVisible({ ...base, estado: "reportada" }, despues)).toEqual({ estado: "reportada", vencida: false });
  expect(estadoVisible({ ...base, estado: "cerrada" }, despues)).toEqual({ estado: "cerrada", vencida: false });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-periodos.test.ts tests/indicadores-semaforo.test.ts tests/indicadores-textos.test.ts tests/indicadores-acumulado.test.ts tests/indicadores-ficha.test.ts`
Expected: FAIL (los módulos no existen; `periodoDe("2026-B1")` da `null`).

- [ ] **Step 3: `periodoDe` con bimestre y `periodos.ts`**

En `periodo.ts` la expresión regular gana `B([1-6])` y la etiqueta `«<ordinal> bimestre de <año>»`
(los ordinales llegan hasta «sexto»); los tests existentes de ese archivo siguen en verde.
`periodos.ts` se apoya en `periodoDe` para todo: un periodo «terminó» cuando `hasta < ahora`.

- [ ] **Step 4: `semaforo.ts` y `textos.ts`**

Las tablas del spec §7.5, con `comparar` sobre fracciones. `textoValor` redondea a los decimales de
la unidad con `aDecimal`, quita los ceros finales, pone coma decimal y, si hay `regla` y el número
redondeado caería en otro nivel del semáforo que el valor exacto, usa el truncado. En porcentajes la
comparación habla de «puntos»; en lo demás, de la unidad.

- [ ] **Step 5: `calculo.ts`, `acumulado.ts`, `estados.ts` y `ficha.ts`**

`calcular` es la única entrada al intérprete para una medición y no usa nada de Node: la importa
también el formulario del cliente. `huellaDeFicha` usa `node:crypto`, así que `ficha.ts` no se
importa desde componentes cliente.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-periodos.test.ts tests/indicadores-semaforo.test.ts tests/indicadores-textos.test.ts tests/indicadores-acumulado.test.ts tests/indicadores-ficha.test.ts tests/indicadores-documentales.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/indicadores src/lib/indicadores-documentales/periodo.ts tests
git commit -m "feat(f14a): reglas puras de periodos, semáforo, textos, acumulado y ficha"
```

### Tarea 5: Maestros, parámetros y «Configuración de indicadores»

**Files:**
- Create: `src/db/consultas/indicadores/maestros.ts`, `src/app/admin/acciones-indicadores.ts`, `src/lib/esquemas/indicadores-maestros.ts`, `src/app/(app)/admin/(panel)/indicadores/page.tsx`, `src/componentes/indicadores/admin/{TablaMaestro,FormularioParametros}.tsx`, `tests/indicadores-maestros.test.ts`
- Modify: `src/db/consultas/mapa-admin.ts:224,246` (`crearTipo`, `editarTipo` rechazan la sigla `IND`), `src/componentes/cascaron/navegacion.ts`, `src/componentes/cascaron/IconoNav.tsx`, `tests/navegacion.test.ts` (20 → 21), `src/lib/bitacora-detalle.ts`, `tests/mapa-admin.test.ts`

**Interfaces:**
- Consumes: `indicadores.administrar`; `ErrorIndicador`; el patrón de `src/db/consultas/normograma/tipos-norma.ts` (crear, editar, activar, «borrar solo si vacío»); `registrarAuditoria`.
- Produces:
  - `type Maestro = "tipos" | "clasificaciones" | "unidades" | "objetivos"`; `listarMaestro(m: Maestro, opciones?: { sql?; soloActivos?: boolean }): Promise<FilaMaestro[]>`; `guardarEnMaestro(sesion: SesionFlujo, m: Maestro, d: DatosMaestro, opciones?): Promise<{ id: number }>` (crea si `d.id` falta); `activarEnMaestro(sesion, m, id: number, activo: boolean, opciones?)`; `borrarDeMaestro(sesion, m, id, opciones?)` (rechaza si alguna versión lo usa).
  - `type ParametrosIndicadores = { umbralAtencionPct: number; avisoPrevioDias: number; plazoReporteDias: number; incumplimientoPeriodos: number; variacionConfirmarPct: number }`; `PARAMETROS_DEFECTO` (70, 3, 10, 3, 30); `obtenerParametros(opciones?: { sql? }): Promise<ParametrosIndicadores>` (un valor inválido cae al de omisión); `guardarParametros(sesion, p, opciones?)`. Rangos: umbral 1 a 99; aviso 0 a 30; plazo 0 a 90; incumplimiento 2 a 12; variación 5 a 500.
  - Entrada de navegación `{ href: "/admin/indicadores", etiqueta: "Configuración de indicadores", icono: "indicadores-config", grupo: "administracion", permiso: "indicadores.administrar" }`.
  - Acciones de bitácora: `indicador_maestro_guardado`, `indicador_maestro_activado`, `indicador_maestro_borrado`, `indicador_parametros_guardados`.

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-maestros.test.ts` (dentro de `revertida`)

```ts
it("los tres maestros nacen sembrados", …);
//  listarMaestro("tipos") → Eficacia, Eficiencia, Efectividad; "clasificaciones" → Estratégico (gerencia), Operativo (lider), Regulatorio (gerencia, exige norma)
it("crear, editar, desactivar; nombre repetido sin distinguir mayúsculas", …);
//  guardarEnMaestro(admin, "tipos", { nombre: "eficacia" }) → ErrorIndicador("Ya existe «Eficacia»")
//  activarEnMaestro(…, false) → deja de salir con { soloActivos: true }
it("una clasificación dice quién aprueba y si exige norma; una unidad, su sufijo y sus decimales", …);  // aprueba "otro" y decimales 5 → ErrorIndicador
it("un objetivo es de calidad o institucional", …);
it("borrar solo si ninguna ficha lo usa", …);
//  usado por una versión → ErrorIndicador("No se puede borrar: lo usa algún indicador. Desactívelo."); sin uso → borra
it("solo administra quien tiene indicadores.administrar", …);      // lider_proceso → ErrorPermiso
it("parámetros: valores de omisión, rangos y valor inválido en la base", …);
//  obtenerParametros() → { umbralAtencionPct: 70, avisoPrevioDias: 3, plazoReporteDias: 10, incumplimientoPeriodos: 3, variacionConfirmarPct: 30 }
//  guardarParametros con umbral 100 → ErrorIndicador; con configuracion.valor = 'abc' → cae a 70
it("la sigla IND no se puede usar en un tipo de documento", …);
//  crearTipo y editarTipo con "IND" o "ind" → error "La sigla IND está reservada para los indicadores"
```

En `tests/navegacion.test.ts`: el total del Admin SGC pasa a 21 y la entrada
`/admin/indicadores` existe con `permiso: "indicadores.administrar"` en el grupo `administracion`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-maestros.test.ts tests/navegacion.test.ts`
Expected: FAIL (`@/db/consultas/indicadores/maestros` no existe; total 20).

- [ ] **Step 3: `maestros.ts` y los esquemas**

Un mapa `Maestro → { tabla, columnas, etiqueta }` con nombres de tabla fijos en el código (nunca
texto del usuario en un identificador). `borrarDeMaestro` comprueba el uso en `indicador_versiones`
(`tipo_id`, `clasificacion_id`, `unidad_id`, `objetivo_id`). Los parámetros se leen de
`configuracion` con `WHERE clave = ANY(...)`, como `obtenerConfigDocumental`.

- [ ] **Step 4: Sigla reservada**

`crearTipo` y `editarTipo` (`src/db/consultas/mapa-admin.ts`) rechazan la sigla `IND` sin distinguir
mayúsculas, antes de escribir.

- [ ] **Step 5: Acciones, página y navegación**

`src/app/admin/acciones-indicadores.ts` (`"use server"`): `guardarEnMaestroAccion`,
`activarEnMaestroAccion`, `borrarDeMaestroAccion`, `guardarParametrosAccion`, todas con
`mutacion(formData, "indicadores.administrar", …)`. La página `/admin/indicadores`
(`exigirPermiso("indicadores.administrar")`, `EncabezadoPagina` «Configuración de indicadores») pinta
cinco secciones: Tipos, Clasificaciones, Unidades, Objetivos y Parámetros. La entrada va en
`NAVEGACION` después de «Configuración documental»; el ícono `indicadores-config` es
`SlidersHorizontal` de `lucide-react`.

- [ ] **Step 6: Bitácora**

Un `case` en `describirEvento` y una entrada en `NOMBRE_DE_ACCION` por cada una de las cuatro
acciones de Produces (por ejemplo, «Guardó la unidad «Minutos» de indicadores»).

- [ ] **Step 7: Correr**

Run: `npx vitest run tests/indicadores-maestros.test.ts tests/navegacion.test.ts tests/bitacora-detalle.test.ts tests/acciones-permisos.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat(f14a): maestros y parámetros de indicadores"
```

### Tarea 6: La ficha en borrador, el formulario y la entrada «Indicadores»

**Files:**
- Create: `src/db/consultas/indicadores/fichas.ts`, `src/lib/esquemas/indicadores.ts`, `src/app/acciones-indicadores.ts`, `src/app/(app)/indicadores/page.tsx`, `src/app/(app)/indicadores/_comun.ts`, `src/app/(app)/indicadores/nuevo/page.tsx`, `src/app/(app)/indicadores/[codigo]/editar/page.tsx`, `src/componentes/indicadores/PestanasIndicadores.tsx`, `src/componentes/indicadores/ficha/{FormularioFicha,SelectorForma,VistaSemaforo,PruebaFormula}.tsx`, `tests/indicadores-fichas.test.ts`, `tests/indicadores-formulario.test.tsx`
- Modify: `src/componentes/cascaron/navegacion.ts` (grupo `indicadores`), `src/componentes/cascaron/ContenidoBarra.tsx:22-23` (color `mod-indicadores`), `src/componentes/cascaron/IconoNav.tsx`, `tests/navegacion.test.ts` (21 → 22), `tests/acciones-permisos.test.ts` (lista fija), `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: Tareas 1 a 5 (`ContenidoFicha`, `huellaDeFicha`, `analizar`, `formulaDeForma`, `errorDeRegla`, `rangosEnPalabras`, `calcular`, `listarMaestro`, `obtenerParametros`, `filtroIndicadores`, `puedeVerIndicador`).
- Produces:
  - `EsquemaFicha` (zod estricto) y `type DatosFicha = z.infer<typeof EsquemaFicha>`: `procesoId`, `subprocesoId?`, `codigo?`, `nombre` (1 a 200), `proposito` (1 a 1000), `requisito?` (120), `tipoId`, `clasificacionId`, `objetivoId?`, `procedimientoDocumentoId?`, `puntoControl?` (60), `forma`, `factor?`, `formula?` (solo con `libre`), `variables` (lista de `{ letra, nombre (150), descripcion? (500), fuente? (300), unidad? (40), consolidacion, capturaMin?, capturaMax?, admiteNegativos }`), `unidadId`, `decimales`, `periodicidad`, `tendencia`, `meta?`, `metaMax?`, `semaforoModo?`, `umbralAtencionPct?`, `limiteCritico?`, `tolerancia?`, `resultadoMin?`, `resultadoMax?`, `lineaBaseValor?`, `lineaBasePeriodo?`, `lineaBaseNota?`, `sustentoMeta?` (500), `cargosMedir` e `cargosAnalizar` (listas de ids, al menos uno cada una), `normaIds` (lista), `ente?` (150), `periodicidadExterna?`, `plazoExternoDias?`, `motivoCambio?` (500), y los datos de operación `plazoReporteDias`, `inicioMedicion`, `soporteObligatorio`, `nivelAcceso`, `mide` y `analiza` (listas de usuarios). El formulario manda `variables` y las listas como JSON en un campo oculto.
  - `type DatosOperacion = { plazoReporteDias: number; inicioMedicion: string; soporteObligatorio: boolean; nivelAcceso: "general" | "restringido" }` (en `src/lib/indicadores/tipos.ts`).
  - `proponerCodigo(procesoId: number, opciones?): Promise<string>` (`SIGLA-IND-NN`).
  - `crearIndicador(sesion, d: DatosFicha, opciones?): Promise<{ indicadorId: number; versionId: number; codigo: string }>` (crea el indicador en `borrador` y su versión 1 con los nombres firmados; valida fórmula, regla, norma exigida y periodicidades).
  - `guardarBorrador(sesion, versionId: number, d: DatosFicha, opciones?): Promise<void>` (solo en `borrador`).
  - `abrirCambio(sesion, indicadorId: number, opciones?): Promise<{ versionId: number }>` (borrador con el contenido vigente; si ya hay uno, lo devuelve).
  - `contenidoDeVersion(sql: Cliente, versionId: number): Promise<ContenidoFicha>`.
  - `fichaParaEditar(sesion, codigo: string, opciones?): Promise<{ indicadorId; versionId; estado: EstadoVersion; contenido: ContenidoFicha; operacion: DatosOperacion; vigente: ContenidoFicha | null } | null>`.
  - `listarIndicadoresBasico(sesion, opciones?): Promise<{ id; codigo; nombre; proceso; estado; versionEstado }[]>` (lo que la persona ve; quien administra ve además los borradores). La Tarea 15 la reemplaza por la lista completa.
  - `exigirIndicador(sesion, codigo: string): Promise<{ id: number; codigo: string; estado: EstadoIndicador }>` en `_comun.ts` (`notFound()` si no lo ve).
  - `PestanasIndicadores({ activa, visibles })`, con `type PestanaIndicadores = "lista" | "matriz" | "por-aprobar" | "cierre"` y `pestanasVisibles(sujeto, opciones: { aprueba: boolean }): PestanaIndicadores[]`. En esta tarea solo devuelve `"lista"`; cada tarea añade su pestaña cuando su página existe (la 7, `por-aprobar` para quien administra o aprueba; la 12, `cierre` para quien administra; la 15, `matriz` para todos).
  - `GrupoNav` gana `"indicadores"` (`{ etiqueta: "Indicadores", color: "mod-indicadores" }`), antes de `administracion`; entrada `{ href: "/indicadores", etiqueta: "Indicadores", icono: "indicadores", grupo: "indicadores" }` (sin permiso: toda sesión).
  - Acciones (`src/app/acciones-indicadores.ts`): `crearIndicadorAccion`, `guardarBorradorAccion`, `abrirCambioAccion`, todas con `mutacion(formData, "indicadores.administrar", …)`.
  - Bitácora: `indicador_creado`, `indicador_borrador_guardado`, `indicador_cambio_abierto`.

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-fichas.test.ts` (dentro de `revertida`; `datos(parcial)` arma un `DatosFicha` de forma «porcentaje» válido para el proceso SGC)

```ts
it("propone SIGLA-IND-NN, contando también los retirados", …);
//  sin indicadores en el proceso → "<SIGLA>-IND-01"; con uno activo y uno retirado → "-03"
it("crea el indicador en borrador con su versión 1, sus variables y los nombres firmados", …);
//  indicadores.estado = 'borrador'; versión { numero: 1, estado: 'borrador', tipo_cambio: 'inicial', forma: 'porcentaje', formula: 'A / B * 100' };
//  variables A y B; tipo_nombre, clasificacion_nombre, unidad_nombre, unidad_sufijo, proceso_nombre y cargo_nombre copiados del catálogo;
//  indicador_designados con 'mide' y 'analiza'; plazo, inicio, soporte y nivel de acceso guardados en indicadores
it("valida la fórmula libre contra sus variables", …);
//  formula "A / C" con variables A y B → ErrorIndicador("La fórmula usa la variable C, que no está declarada")
//  formula "A" con variables A y B → ErrorIndicador("La variable B no se usa en la fórmula")
//  formula "A ** 2" → el mensaje del intérprete
it("valida la regla del semáforo", …);                               // meta 0, descendente, relativo → el mensaje de errorDeRegla
it("un regulatorio debe citar una norma vigente o modificada", …);
//  clasificación Regulatorio sin normaIds → ErrorIndicador("Un indicador regulatorio debe citar al menos una norma")
//  una norma derogada → ErrorIndicador("Solo se pueden citar normas vigentes o modificadas")
it("el subproceso es del proceso y el código es único sin distinguir mayúsculas", …);
it("solo quien administra crea y edita", …);                         // lider_proceso → ErrorPermiso
it("guardarBorrador solo sobre un borrador", …);
it("abrirCambio copia la ficha vigente en un borrador con el número siguiente, una sola vez", …);
it("contenidoDeVersion da siempre la misma huella y no depende del nombre actual del catálogo", …);
//  renombrar el cargo en `cargos` no cambia huellaDeFicha(await contenidoDeVersion(tx, versionId))
it("la lista básica muestra lo que la persona ve", …);
//  consulta no ve borradores ni un restringido ajeno; quien administra ve los borradores
```

`tests/indicadores-formulario.test.tsx` (render estático, como `tests/indicadores-pantalla.test.tsx`):
con la forma «Porcentaje» hay dos variables, A y B; con meta 80, tendencia ascendente y umbral 70,
«Así quedará el semáforo» dice `Bien desde 80 % · Atención de 56 a 79,9 % · Crítico por debajo de
56 %`; «Más opciones» está plegado y trae tipo «Eficacia» y clasificación «Operativo»; todo control
tiene su etiqueta.

En `tests/navegacion.test.ts`: total 22; la entrada `/indicadores` la ve toda sesión y pertenece al
grupo `indicadores`, que va antes de `administracion`. En `tests/acciones-permisos.test.ts`:
`src/app/acciones-indicadores.ts` entra a la lista fija.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-fichas.test.ts tests/indicadores-formulario.test.tsx tests/navegacion.test.ts`
Expected: FAIL.

- [ ] **Step 3: `EsquemaFicha`** en `src/lib/esquemas/indicadores.ts`

Estricto; los números llegan como texto y se validan con `fraccion` (un `refine` por campo: «La
meta debe ser un número»); `variables`, `cargosMedir`, `cargosAnalizar`, `normaIds`, `mide` y
`analiza` se leen de campos ocultos con JSON (`z.string().transform(JSON.parse).pipe(...)`, con un
tope de 26 variables y 20 elementos por lista).

- [ ] **Step 4: `fichas.ts`**

`crearIndicador` y `guardarBorrador` comparten un validador: fórmula (la de la forma con
`formulaDeForma`, o la libre con `analizar`), variables declaradas contra usadas, `errorDeRegla`,
norma exigida, subproceso del proceso, cargos y usuarios activos. Todo en una transacción, con
`registrarAuditoria`. Los nombres firmados se copian de los catálogos al guardar. `23505` sobre
`indicadores_codigo_unico` se traduce a `ErrorIndicador`.

- [ ] **Step 5: Acciones, páginas y formulario**

`src/app/acciones-indicadores.ts` (`"use server"`) con las tres acciones. `/indicadores` (lista
básica en `TablaDatos`, `PestanasIndicadores`), `/indicadores/nuevo` y
`/indicadores/[codigo]/editar` (`exigirSesion` y `notFound()` si no administra). `FormularioFicha`
(cliente) sigue la maqueta 6 de `pantallas-14-v3.html` y la sección §12.4 del spec: selector de
forma, campos a la vista, `VistaSemaforo` (usa `rangosEnPalabras`), `PruebaFormula` (usa `calcular`
y `fraseDeResultado`; guarda los valores de ejemplo en el campo `prueba`) y «Más opciones» en un
`<details>`.

- [ ] **Step 6: Navegación y bitácora**

`GrupoNav`, `GRUPOS` y los dos mapas de color de `ContenidoBarra` ganan `indicadores` con
`mod-indicadores`; el ícono `indicadores` es `Gauge`. Frases de las tres acciones de bitácora.

- [ ] **Step 7: Correr**

Run: `npx vitest run tests/indicadores-fichas.test.ts tests/indicadores-formulario.test.tsx tests/navegacion.test.ts tests/acciones-permisos.test.ts tests/paginas-sesion.test.ts tests/bitacora-detalle.test.ts tests/colores-fijos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat(f14a): ficha de indicador en borrador, formulario y entrada en la barra"
```

### Tarea 7: Aprobación con firma, versiones y control de cambios

**Files:**
- Create: `src/db/consultas/indicadores/aprobacion.ts`, `src/app/(app)/indicadores/por-aprobar/page.tsx`, `src/app/(app)/indicadores/[codigo]/page.tsx`, `src/componentes/indicadores/ficha/{FichaTecnica,ControlDeCambios,DialogoEnviar,ListaPorAprobar}.tsx`, `tests/indicadores-aprobacion.test.ts`
- Modify: `src/app/acciones-indicadores.ts`, `src/lib/esquemas/indicadores.ts`, `src/lib/bitacora-detalle.ts`, `src/lib/tramites/tipos.ts` (solo si `Firma` necesita tipos; los valores `elaboro` y `aprobo` ya existen)

**Interfaces:**
- Consumes: `contenidoDeVersion`, `huellaDeFicha`, `tipoDeCambio`, `camposCambiados` (Tareas 4 y 6); `aprobadoresDeFicha`, `puedeAprobarFicha` (Tarea 2); `registrarFirma` con `indicadorVersionId`; `verificarParaFirmar`, `ErrorFirma`, `OpcionesFlujo`, `CredencialesFirma`; `avisarA`; `periodoQueContiene`, `periodosTerminados` (Tarea 4); `DialogoFirma`.
- Produces:
  - `enviarAAprobacion(sesion, d: { versionId: number; rigeDesde?: string; credenciales: CredencialesFirma }, opciones?: OpcionesFlujo): Promise<{ codigo: string; menor: boolean }>`: firma «Elaboró»; si el cambio es menor queda `aprobada` de inmediato; si no, `por_aprobar` y avisa a los aprobadores. `rigeDesde` solo aplica a un cambio mayor (por omisión, `rigeDesdePorOmision`); la versión inicial rige desde el inicio de medición.
  - `aprobarFichas(sesion, d: { versionIds: number[]; credenciales: CredencialesFirma }, opciones?: OpcionesFlujo): Promise<{ aprobadas: number }>` (todo o nada, F14-DC36).
  - `devolverFicha(sesion, d: { versionId: number; nota: string }, opciones?): Promise<void>` (nota de 5 a 1000).
  - `descartarBorrador(sesion, versionId: number, opciones?): Promise<void>`.
  - `fichasPorAprobar(sesion, opciones?): Promise<FichaPorAprobar[]>` (`{ versionId; codigo; nombre; proceso; tipoCambio; cambios: string[]; elaboro: string; enviadaEn: Date }`).
  - `versionesDe(indicadorId: number, opciones?): Promise<VersionResumen[]>` (`{ id; numero; tipoCambio; rigeDesde; motivo; cambios: string[]; elaboro; elaboradaEn; aprobo; aprobadaEn }`).
  - `versionVigente(sql: Cliente, indicadorId: number): Promise<{ id: number; numero: number } | null>` (la última `aprobada`).
  - `versionQueRige(sql: Cliente, indicadorId: number, periodo: string): Promise<number | null>` (la `aprobada` de mayor número cuyo `rige_desde` no es posterior al periodo; para los históricos, la primera). **Un cambio menor guarda el `rige_desde` de la versión que reemplaza**: como tiene número mayor, rige para los mismos periodos; las mediciones ya calculadas conservan la versión que congelaron.
  - `rigeDesdePorOmision(sql: Cliente, indicadorId: number, periodicidad: Periodicidad, ahora: Date): Promise<string>` (el primer periodo sin reporte; nunca uno que no ha empezado, F14-DC17).
  - Acciones: `enviarAAprobacionAccion` (`indicadores.administrar`), `aprobarFichasAccion` y `devolverFichaAccion` (`indicadores.aprobar`), `descartarBorradorAccion`.
  - Avisos: `indicadores.por_aprobar`, `indicadores.aprobada`, `indicadores.devuelta`.
  - Bitácora: `indicador_enviado`, `indicador_aprobado`, `indicador_devuelto`, `indicador_cambio_menor`, `indicador_borrador_descartado`.

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-aprobacion.test.ts` (dentro de `revertida`; firma con `{ sql: tx, ahora, verificar: firmaDePrueba }` y la clave `"ok"`)

```ts
it("enviar firma «Elaboró» sobre la huella de la ficha y deja la versión por aprobar", …);
//  firmas: { firma: 'elaboro', tramite_id: null, version_id: null, ronda: 0, indicador_version_id, hash_sha256: huellaDeFicha(contenido) }
//  versión { estado: 'por_aprobar', huella }; aviso 'indicadores.por_aprobar' a cada aprobador
it("no se envía sin haber probado la fórmula, ni con la clave mala", …);
//  prueba nula → ErrorIndicador("Pruebe la fórmula con valores de ejemplo antes de enviarla")
//  clave "mala" → ErrorFirma y ni firma ni cambio de estado
it("aprueba Gerencia un estratégico: firma «Aprobó», versión aprobada, indicador activo, rige desde el inicio de medición", …);
it("un operativo lo aprueba el líder del proceso; sin líder, Gerencia; nunca quien elaboró ni un líder de otro proceso", …);
//  quien no puede → ErrorIndicador("La ficha no existe o no le corresponde aprobarla")
it("en bloque es todo o nada", …);                                   // Review Focus 4
//  tres por aprobar, la segunda aprobada entre tanto → ErrorIndicador("La ficha <código> ya no está por aprobar") y cero firmas 'aprobo' nuevas
it("aprobar dos veces la misma ficha", …);                           // la segunda → el mismo mensaje
it("devolver exige nota, vuelve a borrador y avisa a quien elaboró", …);
it("un cambio menor lo publica quien elabora, sin aprobador, y no toca las mediciones", …);
//  abrirCambio + nombre distinto + enviar → { menor: true }; versión 2 { estado: 'aprobada', tipo_cambio: 'menor', aprobada_por: null };
//  las mediciones existentes conservan version_id = versión 1
it("un cambio mayor va a aprobación y rige desde un periodo sin reporte", …);
//  meta distinta → { menor: false }; rigeDesde con medición reportada → ErrorIndicador("Ese periodo ya tiene una medición reportada");
//  rigeDesde de un periodo que no ha empezado → ErrorIndicador("Una versión no puede regir desde un periodo que no ha empezado")
it("versionQueRige y versionVigente", …);
//  v1 rige 2026-T1, v2 (mayor) rige 2026-T3: T2 → v1, T3 y T4 → v2; con solo v1 y un histórico anterior → v1; vigente → v2
it("el control de cambios dice qué cambió y por qué", …);            // versionesDe → [{ numero: 2, cambios: ["Meta"], motivo }, { numero: 1, tipoCambio: "inicial" }]
it("descartar el borrador de un cambio deja la ficha vigente como estaba", …);
it("la ficha no nombra el procedimiento enlazado a quien no puede ver ese documento", …);   // F13C-R11: un restringido ajeno no aparece ni se cuenta
it("el proceso y el código quedan fijos desde la primera aprobación", …);                  // F14-DC18 y DC40
//  guardarBorrador sobre el borrador de un cambio con otro procesoId u otro codigo →
//  ErrorIndicador("El proceso y el código quedan fijos desde la primera aprobación"); el subproceso sí se cambia, como cambio menor
it("un cambio menor rige para los mismos periodos que la versión que reemplaza", …);
//  v1 rige 2026-T1; cambio menor → v2 con rige_desde '2026-T1'; versionQueRige(…, "2026-T2") → v2
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-aprobacion.test.ts`
Expected: FAIL (`@/db/consultas/indicadores/aprobacion` no existe).

- [ ] **Step 3: `aprobacion.ts`**

Cada firma sigue el orden de `ratificar` (`src/db/consultas/vigencia/ratificaciones.ts:113`):
validador de solo lectura (`validarEnvio`, `validarAprobacion`), `verificar` fuera de la
transacción, y dentro `FOR UPDATE` sobre la versión, la validación repetida, `registrarFirma` y el
cambio de estado. `aprobarFichas` bloquea las versiones en orden de `id` y, si alguna no está
`por_aprobar` o la persona no es su aprobadora, lanza antes de firmar ninguna. Al aprobar la primera
versión, `indicadores.estado` pasa a `activo`. El tipo de cambio lo decide `tipoDeCambio` contra
`versionVigente`; `"ninguno"` se rechaza con «No hay cambios que enviar».

- [ ] **Step 4: Acciones**

`enviarAAprobacionAccion`, `aprobarFichasAccion`, `devolverFichaAccion`, `descartarBorradorAccion`,
con `separarFirma` y `contextoDePeticion` como en `ratificarAccion`
(`src/app/acciones-vigencia.ts:54-82`); un `ErrorFirma` con sesión cerrada redirige a `/ingreso`.

- [ ] **Step 5: Pantallas**

`/indicadores/por-aprobar`: visible para quien administra o aprueba (`notFound()` si no);
`ListaPorAprobar` (cliente) con casillas, «Aprobar las seleccionadas» en un `DialogoFirma` y
«Devolver» por ficha; quien administra ve además sus borradores y las devueltas con su nota.
`/indicadores/[codigo]/page.tsx` con `exigirIndicador` y las pestañas internas `?vista=ficha`
(`FichaTecnica`: el contenido en lectura, fórmula con `enPalabras`, rangos con `rangosEnPalabras`,
firmas tomadas de `firmas`, y aparte los datos de operación) y `?vista=versiones`
(`ControlDeCambios` y cada versión anterior completa). `DialogoEnviar` muestra el tipo de cambio,
pide el motivo y, si es mayor, «Rige desde».

- [ ] **Step 6: Bitácora** de las cinco acciones.

- [ ] **Step 7: Correr**

Run: `npx vitest run tests/indicadores-aprobacion.test.ts tests/acta.test.ts tests/acta-cierre.test.ts tests/firma.test.ts tests/bitacora-detalle.test.ts tests/acciones-permisos.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit y punto de control**

```bash
git add src tests
git commit -m "feat(f14a): aprobación de fichas con firma, versiones y control de cambios"
```

Punto de control del controlador en navegador: crear un indicador «Porcentaje», probarlo, enviarlo,
aprobarlo como `gerente`, hacer un cambio menor y uno mayor, y ver el control de cambios.

### Tarea 8: Designados, datos de operación, duplicar, retirar, descartar y borrar

**Files:**
- Create: `src/db/consultas/indicadores/operacion.ts`, `src/componentes/indicadores/admin/{DialogoDesignar,DialogoOperacion,DialogoRetirar,MenuAdministrar}.tsx`, `tests/indicadores-operacion.test.ts`
- Modify: `src/app/acciones-indicadores.ts`, `src/lib/esquemas/indicadores.ts`, `src/app/(app)/indicadores/[codigo]/page.tsx`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `crearIndicador`, `contenidoDeVersion`, `proponerCodigo`, `DatosOperacion` (Tarea 6); `versionVigente` (Tarea 7); `avisarA`.
- Produces:
  - `designar(sesion, d: { indicadorId: number; funcion: FuncionDesignado; usuarioIds: number[] }, opciones?): Promise<void>` (reemplaza la lista de esa función; usuarios activos; avisa a los nuevos).
  - `cambiarOperacion(sesion, d: { indicadorId: number } & DatosOperacion, opciones?): Promise<void>` (el inicio de medición no puede dejar fuera una medición con datos).
  - `duplicar(sesion, d: { indicadorId: number; procesoId: number }, opciones?): Promise<{ codigo: string }>`.
  - `retirar(sesion, d: { indicadorId: number; motivo: string }, opciones?): Promise<void>` (motivo de 5 a 500; quita las mediciones abiertas sin ningún dato; descarta su borrador).
  - `descartarIndicador(sesion, d: { indicadorId: number; motivo: string }, opciones?): Promise<void>` (solo `borrador` que alguna vez se envió).
  - `borrarIndicador(sesion, indicadorId: number, opciones?): Promise<void>` (solo `borrador` que nunca se envió: sin filas en `firmas`).
  - `designadosDe(indicadorId, opciones?): Promise<Record<FuncionDesignado, { id: number; nombre: string; activo: boolean }[]>>`.
  - Acciones con `indicadores.administrar`: `designarAccion`, `cambiarOperacionAccion`, `duplicarAccion`, `retirarAccion`, `descartarIndicadorAccion`, `borrarIndicadorAccion`.
  - Avisos: `indicadores.designacion`, `indicadores.retirado`.
  - Bitácora: `indicador_designados`, `indicador_operacion`, `indicador_duplicado`, `indicador_retirado`, `indicador_descartado`, `indicador_borrado`.

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-operacion.test.ts` (dentro de `revertida`)

```ts
it("designar reemplaza la lista de una función, avisa a los nuevos y deja antes y después en la bitácora", …);
//  usuario inactivo → ErrorIndicador("Solo se puede designar a usuarios activos"); aviso 'indicadores.designacion' con "Ahora mide <código>"
it("los datos de operación se cambian sin versión nueva", …);
//  plazo 91 → ErrorIndicador; la versión vigente y su huella no cambian
it("el inicio de medición no puede dejar fuera una medición con datos", …);
//  mover de 2026-01 a 2026-04 con marzo reportado → ErrorIndicador("Hay mediciones con datos antes de ese periodo")
it("duplicar crea un borrador en versión 1 con el mismo contenido y el código del proceso destino", …);
//  sin mediciones ni indicador_metas; estado 'borrador'
it("retirar exige motivo, quita las mediciones abiertas sin datos, conserva las que tienen datos y descarta el borrador", …);
//  estado 'retirado' con baja_por, baja_en y baja_motivo; aviso 'indicadores.retirado' a los designados
it("un indicador enviado y nunca aprobado se descarta y conserva su código", …);
//  descartarIndicador → estado 'descartado'; crear otro con ese código → ErrorIndicador("Ya existe un indicador con el código …")
it("borrar solo lo que nunca se envió", …);
//  con una firma 'elaboro' → ErrorIndicador("Este indicador ya se envió a aprobación: descártelo"); sin firmas → borra el indicador y su versión
it("solo quien administra", …);                                       // lider_proceso → ErrorPermiso en las seis
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-operacion.test.ts`
Expected: FAIL.

- [ ] **Step 3: `operacion.ts`**

Cada función: `puede(sesion, "indicadores.administrar")` o `ErrorPermiso`, transacción, `FOR UPDATE`
sobre el indicador, cambio y `registrarAuditoria` con antes y después. `retirar` borra solo
mediciones `abierta` sin filas en `medicion_valores`, sin análisis y sin eventos.

- [ ] **Step 4: Acciones y menú de administración**

Las seis acciones. En la página del indicador, para quien administra, `MenuAdministrar` con «Editar
ficha», «Designar personas», «Datos de operación», «Crear a partir de este», «Retirar», y
«Descartar» o «Borrar» según el caso; cada una abre su `Dialogo`.

- [ ] **Step 5: Bitácora** de las seis acciones.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-operacion.test.ts tests/bitacora-detalle.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(f14a): designados, datos de operación, duplicar, retirar y descartar"
```

### Tarea 9: Abrir periodos, `recalcularMedicion`, reportar, «no aplica» y corregir

**Files:**
- Create: `src/db/consultas/indicadores/mediciones.ts`, `src/db/consultas/indicadores/alertas.ts` (solo el enganche), `src/app/(app)/indicadores/[codigo]/reportar/[periodo]/page.tsx`, `src/componentes/indicadores/medicion/{FormularioReporte,ResultadoEnVivo,TablaDelAnio}.tsx`, `tests/indicadores-mediciones.test.ts`, `tests/indicadores-reporte.test.tsx`
- Modify: `src/app/acciones-indicadores.ts`, `src/lib/esquemas/indicadores.ts`, `src/app/(app)/indicadores/[codigo]/page.tsx` (pestaña Resultados con la tabla del año), `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `periodosTerminados`, `fechaLimiteDeReporte`, `anterior` (Tarea 4); `calcular`, `variacionExcesiva`, `FichaDeCalculo`, `Regla`, `semaforoDe`, `analisisExigido`, `esRepetido`, `estadoVisible` (Tarea 4); `fraccion`, `aTexto`, `aDecimal` (Tarea 3); `versionQueRige` (Tarea 7); `puedeMedir` (Tarea 2); `obtenerParametros` (Tarea 5).
- Produces:
  - `asegurarMediciones(opciones?: { sql?: Cliente; ahora?: Date; indicadorId?: number }): Promise<number>`: crea, con `ON CONFLICT DO NOTHING`, la medición de cada periodo terminado de cada indicador `activo` desde su inicio de medición; marca `historica` las de periodos que terminaron antes de la primera aprobación; devuelve cuántas creó.
  - `type Recalculo = { medicionId: number; indicadorId: number; antes: Semaforo | null; despues: Semaforo | null; estado: EstadoMedicion; resultado: Fraccion | null; repetido: boolean; historica: boolean }`.
  - `recalcularMedicion(tx: TransactionSql, medicionId: number, c: { ahora: Date; actorId: number | null; evento: TipoEvento; detalle?: Record<string, unknown> }): Promise<Recalculo>`: bloquea la fila (`FOR UPDATE`), lee valores, versión y meta (la programada o la base), calcula con `calcular`, congela `version_id`, meta y límite, decide `estado`, `requiere_accion` e `incumplimiento_repetido`, inserta el evento con antes y después y llama `alRecalcular(tx, recalculo, c)`.
  - `alertas.ts`: `alRecalcular(tx: TransactionSql, r: Recalculo, c: { ahora: Date; actorId: number | null }): Promise<void>` (en esta tarea no hace nada; la Tarea 13 la implementa).
  - `type ResultadoDeReporte = { ok: true; estado: EstadoMedicion; semaforo: Semaforo | null } | { ok: false; confirmar: string }`.
  - `reportar(sesion, d: { medicionId: number; valores: Record<string, string>; parcial: boolean; confirmado: boolean }, opciones?): Promise<ResultadoDeReporte>` (sirve para reportar, guardar sin reportar y corregir antes del cierre; exige el soporte si es obligatorio y el reporte no es parcial).
  - `marcarNoAplica(sesion, d: { medicionId: number; motivo: string }, opciones?): Promise<void>` (motivo de 5 a 500) y `quitarNoAplica(sesion, medicionId, opciones?)`.
  - `medicionParaReportar(sesion, codigo: string, periodo: string, opciones?): Promise<DatosDeReporte | null>` (`null` si no puede medir o no existe).
  - `tablaDelAnio(sesion, indicadorId: number, anio: number, opciones?): Promise<FilaDelAnio[]>` (una fila por periodo de la periodicidad, con valores, resultado, meta, estado visible y marcas; sin soportes).
  - `contarSoportes(sql: Cliente, medicionId: number): Promise<number>` (filas de `archivos` con contexto `medicion`; la usan `reportar` y `recalcularMedicion` para el soporte obligatorio).
  - Acciones con `indicadores.medir`: `reportarAccion`, `marcarNoAplicaAccion`, `quitarNoAplicaAccion`.
  - Bitácora: `medicion_reportada`, `medicion_corregida`, `medicion_no_aplica`.

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-mediciones.test.ts` (dentro de `revertida`; `ind` es un `indicadorDePrueba` trimestral de forma «porcentaje», meta 90, umbral 70, inicio `2025-T3`, aprobado el 15 de enero de 2026, con un `mide` de rol Consulta: sus dos trimestres de 2025 son históricos y los de 2026, ordinarios)

```ts
it("abre los periodos terminados, marca los históricos y es idempotente", async () => {
  const ahora = new Date("2026-10-05T15:00:00Z");
  expect(await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id })).toBe(5);
  //  2025-T3 y 2025-T4 con historica = true; 2026-T1, T2 y T3 con historica = false; 2026-T3 vence el 2026-10-11T04:59:59.999Z; sin 2026-T4
  expect(await asegurarMediciones({ sql: tx, ahora, indicadorId: ind.id })).toBe(0);
});
it("el cambio de año no abre un periodo de más ni de menos", …);       // Review Focus 1: a las 05:30Z del 1 de enero crea 2026-T4; a las 04:30Z, no
it("un borrador, un descartado o un retirado no abren periodos", …);
it("reportar calcula, congela la versión y la meta, y deja el evento", …);
//  valores { A: "3", B: "5" } → resultado_exacto '60/1', resultado 60, semaforo 'critico', meta_aplicada 90, limite_aplicado 63,
//  version_id = ind.versionId, requiere_accion true, estado 'abierta' (falta el análisis); medicion_eventos: un 'reporte' con antes y después
it("un resultado que cumple queda reportado de una vez", …);          // { A: "5", B: "5" } → estado 'reportada', semaforo 'bien'
it("guardar sin reportar conserva lo digitado y no calcula", …);      // parcial: true con solo A → sin resultado, estado 'abierta'
it("validaciones al digitar", …);
//  "abc" → ErrorIndicador("«Auditorías ejecutadas» debe ser un número"); "-1" → ("… no puede ser negativo");
//  con captura_max 10 en A, "11" → ErrorIndicador("«Auditorías ejecutadas» no puede pasar de 10");
//  { A: "6", B: "5" } con resultadoMax 100 → ErrorIndicador("El resultado (120 %) queda fuera de los límites del indicador")
it("un salto grande pide confirmación antes de escribir", …);
//  T2 en 83,3 %; T3 { A: "2", B: "5" } sin confirmar → { ok: false, confirmar: "El resultado baja 43,3 puntos frente al segundo trimestre de 2026. ¿Los datos son correctos?" } y ningún valor guardado;
//  con confirmado: true → { ok: true, … }
it("denominador 0: no hay cero ni error, se ofrece «No aplica»", …);  // Review Focus 2
//  { A: "0", B: "0" } → ErrorIndicador("No se puede calcular: división por cero. Si no hubo casos, marque «No aplica en este periodo».")
it("«No aplica» exige motivo, cuenta como reportado y se puede quitar", …);
//  motivo "x" → ErrorIndicador; ok → { no_aplica: true, estado: 'reportada', semaforo: null }; quitarNoAplica → 'abierta'
it("soporte obligatorio: no se reporta sin él, salvo parcial o «no aplica»", …);
//  sin filas en archivos (contexto 'medicion') → ErrorIndicador("Este indicador exige un soporte: adjúntelo antes de reportar")
it("mide el designado y el líder; los demás no", …);
//  consulta sin designación sobre un general → ErrorPermiso; sobre un restringido que no ve → ErrorIndicador("La medición no existe")
it("el Admin SGC reporta solo si nadie más puede, y queda marcado", …);   // Review Focus 3: evento con detalle.sinMedidor = true
it("corregir antes del cierre deja el antes y el después, y puede volver a pedir el análisis", …);
//  de { A: "5", B: "5" } a { A: "4", B: "5" } → evento 'correccion' { antes: { A: "5", resultado: "100" }, despues: { A: "4", resultado: "80" } }; estado 'abierta'
it("reportar dos veces lo mismo no duplica el evento", …);            // Review Focus 4: un solo evento
it("una medición cerrada no se reporta", …);                          // ErrorIndicador("La medición está cerrada: pida al Administrador del SGC que la reabra")
it("la meta programada del periodo manda sobre la de la ficha", …);   // indicador_metas con 50 → 60 % es 'bien'
it("tres periodos seguidos sin cumplir: incumplimiento repetido", …);
//  2026-T1 y T2 en 'atencion' y T3 en 'atencion' → incumplimiento_repetido y requiere_accion en true, y el semáforo sigue 'atencion';
//  con solo T2 y T3 en 'atencion' y los dos históricos de 2025 en 'critico', no hay racha: los históricos no cuentan
it("la tabla del año trae un renglón por periodo de la periodicidad", …);   // trimestral: cuatro filas; el periodo que no ha terminado, "por venir"
```

`tests/indicadores-reporte.test.tsx`: `FormularioReporte` pinta un campo por variable con su nombre,
su descripción y su fuente; `ResultadoEnVivo` con 3 y 5 muestra `60 %`, «Crítico» y «No cumple: 60 %
frente a una meta de 90 %.»; hay un control «No aplica en este periodo».

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-mediciones.test.ts tests/indicadores-reporte.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `asegurarMediciones`**

Por cada indicador `activo` (o el pedido): `versionQueRige` del primer periodo da la periodicidad;
`periodosTerminados` desde `inicio_medicion`; un `INSERT … ON CONFLICT (indicador_id, periodo) DO
NOTHING` por lote. `historica` es `hasta < aprobada_en` de la versión 1. Si la periodicidad cambió
con una versión mayor, los periodos desde su `rige_desde` usan la nueva.

- [ ] **Step 4: `recalcularMedicion` y el enganche de alertas**

Con la fila bloqueada: arma `FichaDeCalculo` y `Regla` de `versionQueRige` (meta de `indicador_metas`
si existe; si no, la de la versión), llama `calcular`, decide con `analisisExigido` y `esRepetido`
(las anteriores ordinarias medidas del mismo indicador, en orden descendente, hasta
`incumplimientoPeriodos - 1`) y escribe: `resultado_exacto` (`aTexto`), `resultado` (`aDecimal` a 10
decimales), `semaforo`, las tres columnas de meta aplicada, `requiere_accion`,
`incumplimiento_repetido` y `estado` (`reportada` si hay datos o «no aplica», el análisis exigido
está y, si es obligatorio, hay soporte; si no, `abierta`). Si nada cambió respecto de lo guardado, no
inserta evento ni llama `alRecalcular`. En `alertas.ts`, `alRecalcular` existe y no hace nada todavía.

- [ ] **Step 5: `reportar`, «no aplica», lecturas y acciones**

`reportar` valida fuera de la transacción lo que puede (números, límites de captura, permiso con
`puedeMedir`) y dentro repite el permiso, escribe `medicion_valores` y llama `recalcularMedicion`
con evento `reporte` la primera vez y `correccion` después. La confirmación por variación se decide
con `variacionExcesiva` contra **la medición anterior que tenga resultado, sea histórica o no** (spec
§7.4: es una ayuda contra el error de digitación, no una alerta). Acciones `reportarAccion`,
`marcarNoAplicaAccion`, `quitarNoAplicaAccion`.

- [ ] **Step 6: Pantallas**

`/indicadores/[codigo]/reportar/[periodo]` (`exigirSesion`; `notFound()` si
`medicionParaReportar` da `null`), con `FormularioReporte` (cliente, maqueta 3): calcula en vivo con
`calcular` y `fraseDeResultado`, muestra la confirmación por variación, y funciona a 390 px y con
teclado. En la página del indicador, la vista por omisión pasa a `?vista=resultados` con
`TablaDelAnio` y el botón «Reportar *periodo*» para quien puede medir.

- [ ] **Step 7: Bitácora** de las tres acciones.

- [ ] **Step 8: Correr**

Run: `npx vitest run tests/indicadores-mediciones.test.ts tests/indicadores-reporte.test.tsx tests/bitacora-detalle.test.ts tests/acciones-permisos.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src tests
git commit -m "feat(f14a): periodos, cálculo único de la medición y reporte"
```

### Tarea 10: Análisis, observaciones, metas por periodo e históricos

**Files:**
- Create: `src/db/consultas/indicadores/analisis.ts`, `observaciones.ts`, `metas.ts`, `historicos.ts`, `src/componentes/indicadores/medicion/{FormularioAnalisis,Observaciones,DialogoMetas,EdicionDeHistoricos}.tsx`, `tests/indicadores-analisis.test.ts`, `tests/indicadores-metas-historicos.test.ts`
- Modify: `src/app/acciones-indicadores.ts`, `src/lib/esquemas/indicadores.ts`, `src/app/(app)/indicadores/[codigo]/page.tsx`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `recalcularMedicion` (Tarea 9); `puedeAnalizar`, `puedeObservar`, `puedeVerSoportes`, `responsablesDeAnalizar` (Tarea 2); `analisisExigido` (Tarea 4); `avisarA`.
- Produces:
  - `analizar(sesion, d: { medicionId: number; analisis?: string; causa?: string; accionPropuesta?: string }, opciones?): Promise<void>` (mínimo 10 caracteres en lo exigido; con `dos_partes` pide `causa` y `accionPropuesta`; pasa por `recalcularMedicion` con evento `analisis`).
  - `observar(sesion, d: { medicionId: number; texto: string }, opciones?): Promise<{ id: number }>` y `responder(sesion, d: { observacionId: number; texto: string }, opciones?): Promise<{ id: number }>` (texto de 1 a 2000); `observacionesDe(sesion, medicionId, opciones?): Promise<Observacion[] | null>` (`null` si no las ve); `sinRespuesta(sql, filtro: { hasta?: Date }): Promise<number>`.
  - `programarMeta(sesion, d: { indicadorId: number; periodo: string; meta: string; metaMax?: string; justificacion?: string }, opciones?): Promise<void>` (reglas de spec §8.9 y F14-DC41; recalcula la medición si existe).
  - `metasDelAnio(indicadorId, anio, opciones?): Promise<{ periodo: string; heredada: string | null; programada: string | null; tardia: boolean; cerrada: boolean }[]>`.
  - `registrarHistoricos(sesion, d: { indicadorId: number; filas: { periodo: string; valores: Record<string, string> }[] }, opciones?): Promise<{ registrados: number }>` (solo mediciones `historica` abiertas; Admin SGC o quien mide).
  - Acciones: `analizarAccion` (`indicadores.medir`), `observarAccion` y `responderAccion` (`indicadores.observar`), `programarMetaAccion` (`indicadores.administrar`), `registrarHistoricosAccion` (`indicadores.medir`).
  - Avisos: `indicadores.observacion`, `indicadores.respuesta`.
  - Bitácora: `medicion_analizada`, `medicion_observada`, `medicion_observacion_respondida`, `indicador_meta_programada`, `medicion_historica_registrada`.

- [ ] **Step 1: Tests que fallan** (dentro de `revertida`)

`tests/indicadores-analisis.test.ts`:

```ts
it("en «Atención» el análisis es obligatorio y deja la medición reportada", …);
//  analisis de 9 caracteres → ErrorIndicador("Escriba el análisis (al menos 10 caracteres)"); válido → estado 'reportada', analizada_por, evento 'analisis'
it("en «Crítico» pide causa y acción propuesta", …);
//  sin accionPropuesta → ErrorIndicador("En un resultado crítico escriba la causa de la desviación y la acción propuesta");
//  con las dos → 'reportada' y requiere_accion sigue en true
it("si cumple, el análisis es opcional y no cambia el estado", …);
it("analiza el designado para analizar y el líder; quien solo mide, no", …);
it("editar el análisis antes del cierre deja antes y después", …);
it("observan los tres roles y quien hace seguimiento; responde quien analiza", …);
//  consulta sin designación → ErrorPermiso; aviso 'indicadores.observacion' a responsablesDeAnalizar; la respuesta avisa 'indicadores.respuesta' al autor
it("una observación no se edita ni se borra, y se puede añadir a una medición cerrada", …);   // UPDATE y DELETE → 42501
it("las observaciones solo las ve quien ve soportes", …);            // observacionesDe para un consulta sobre un general → null
it("sinRespuesta cuenta las observaciones que nadie ha respondido", …);
```

`tests/indicadores-metas-historicos.test.ts`:

```ts
it("la meta de un periodo que no ha terminado se programa libremente", …);       // sin marca; bitácora con antes y después
it("después de terminado exige justificación, deja la marca y recalcula", …);
//  sin justificacion → ErrorIndicador("Ese periodo ya terminó: escriba la justificación del cambio de meta");
//  con ella → indicador_metas.tardia y mediciones.meta_tardia en true, semáforo recalculado, evento 'meta'
it("con rangos fijos, una meta que deja el límite del lado equivocado se rechaza", …);
//  ErrorIndicador("Con esa meta el límite de crítico queda del lado equivocado: hace falta una versión nueva de la ficha")
it("no se programa la meta de una medición cerrada", …);
it("un histórico programa su meta sin justificación ni marca", …);    // F14-DC41
it("los históricos se registran por lote, en la tabla del año", …);
//  tres filas → { registrados: 3 }; cada una con semáforo calculado, estado 'reportada', evento 'historico' y quién lo registró
it("un histórico crítico no lleva «Requiere acción», no pide análisis ni soporte y no cuenta para la racha", …);   // F14-DC41
it("solo se registran así los periodos históricos, y solo el Admin SGC o quien mide", …);
//  un periodo ordinario → ErrorIndicador("Ese periodo no es histórico: repórtelo por «Reportar»")
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-analisis.test.ts tests/indicadores-metas-historicos.test.ts`
Expected: FAIL.

- [ ] **Step 3: `analisis.ts` y `observaciones.ts`**

`analizar` escribe los tres textos y llama `recalcularMedicion` con evento `analisis` (es quien pasa
la medición a `reportada`). `observar` y `responder` solo insertan; `responder` exige
`puedeAnalizar` o `indicadores.administrar`. `observacionesDe` devuelve cada observación con sus
respuestas, autor y fecha.

- [ ] **Step 4: `metas.ts` e `historicos.ts`**

`programarMeta`: periodo válido para la periodicidad de la versión que rige; «terminado» es `hasta <
ahora`; si la medición existe y no es histórica, exige la justificación (10 a 500) y marca;
después, `recalcularMedicion` con evento `meta`. `registrarHistoricos`: una transacción; por fila,
valida como `reportar`, escribe valores y recalcula con evento `historico`.

- [ ] **Step 5: Acciones y componentes**

Las cinco acciones. `FormularioAnalisis` dentro de la pantalla de reporte y de la página del
indicador: un campo si se exige el simple, dos («Causa de la desviación», «Acción propuesta») si se
exigen las dos partes, con el aviso «No escriba nombres de pacientes ni de funcionarios» (spec §21).
`Observaciones` (lista y formulario), `DialogoMetas` (tabla de periodos del año con la meta heredada
y un campo) y `EdicionDeHistoricos` (la tabla del año en modo edición, una celda por variable).

- [ ] **Step 6: Bitácora** de las cinco acciones.

- [ ] **Step 7: Correr**

Run: `npx vitest run tests/indicadores-analisis.test.ts tests/indicadores-metas-historicos.test.ts tests/indicadores-mediciones.test.ts tests/bitacora-detalle.test.ts tests/acciones-permisos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit y punto de control**

```bash
git add src tests
git commit -m "feat(f14a): análisis, observaciones, metas por periodo e históricos"
```

Punto de control del controlador: como `jefe.urgencias` reportar un periodo que queda crítico,
escribir causa y acción, dejar una observación como `control.interno`, responderla y registrar
históricos en la tabla del año.

### Tarea 11: Soportes de una medición

**Files:**
- Create: `src/app/api/mediciones/[id]/archivos/route.ts`, `src/app/(app)/indicadores/[codigo]/soportes/[archivoId]/[[...nombre]]/route.ts`, `src/db/consultas/indicadores/soportes.ts`, `src/componentes/indicadores/medicion/Soportes.tsx`, `tests/indicadores-soportes.test.ts`
- Modify: `src/proxy.ts:48` (el `matcher`), `tests/proxy-matcher.test.ts`, `src/lib/recepcion-archivo.ts` (usa `conExcel` en el contexto `medicion`), `src/db/consultas/admin.ts:762` (`registrarArchivo`: la medición no puede estar cerrada), `src/app/acciones-indicadores.ts`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `puedeMedir`, `puedeVerSoportes` (Tarea 2); `contarSoportes` (Tarea 9); `recibirArchivo`, `evidenciaServible`, `respuestaArchivo`, `respuesta404`; `peticionDeSubida` (`tests/utiles/distribucion.ts`).
- Produces:
  - `autorizarSoporte(medicionId: number, sesion, opciones?): Promise<{ ok: true; indicadorId: number } | { ok: false; estado: 403 | 404 | 409 }>` (404 si no ve el indicador; 403 si lo ve y no puede medir; 409 si la medición está cerrada).
  - `soportesDe(sesion, medicionId, opciones?): Promise<{ id: number; nombre: string; mime: string; tamano: number }[] | null>` (`null` si no ve soportes).
  - `quitarSoporte(sesion, d: { archivoId: number }, opciones?): Promise<void>` (antes del cierre; evento `soporte`; si el indicador exige soporte y era el último, la medición vuelve a `abierta` por `recalcularMedicion`).
  - `POST /api/mediciones/[id]/archivos` (401, 403 por permiso u origen, 429, 404, 409, y luego `recibirArchivo` con `{ contexto: "medicion", contextoId, carpeta: "mediciones/<id>" }`); `GET /indicadores/[codigo]/soportes/[archivoId]/…` (401; 404 a quien no ve soportes; siempre como descarga).
  - Acción `quitarSoporteAccion` (`indicadores.medir`). Bitácora: `medicion_soporte_quitado` (la subida ya audita `subir_archivo`).

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-soportes.test.ts` (peticiones con `peticionDeSubida`; cada caso deja el almacén como lo encontró) y en `tests/proxy-matcher.test.ts`

```ts
it("POST: 401 sin sesión, 403 con origen ajeno, 404 a quien no ve el indicador, 403 a quien lo ve y no mide, 409 si está cerrada", …);
it("POST: guarda un PDF y un .xlsx en mediciones/<id> y deja el evento", …);
//  201; archivos { contexto: 'medicion', contexto_id, rol: 'evidencia' }; medicion_eventos 'soporte' { accion: "subido", nombre }
it("POST: rechaza .xls, .docx, .zip y .svg", …);                     // 415 con ERROR_SOPORTE
it("GET: 401 sin sesión; 404 a quien no ve soportes aunque vea el indicador; 200 como descarga a quien sí", …);
//  Content-Disposition: attachment; X-Content-Type-Options: nosniff; Cache-Control: no-store
it("GET: un archivo de otra medición o de otro indicador en la dirección da 404", …);
it("quitar un soporte antes del cierre lo borra y deja el evento; después del cierre, no", …);
```

`tests/proxy-matcher.test.ts`: `/api/mediciones/5/archivos` (con y sin querystring) queda fuera del
`matcher`; `/api/mediciones/5/archivos/7`, `/api/mediciones/x/archivos` y `/api/mediciones/5` siguen
dentro.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-soportes.test.ts tests/proxy-matcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: `soportes.ts`, `recibirArchivo` y `registrarArchivo`**

`recibirArchivo` pasa `conExcel: true` a `validarTipoEvidencia` cuando el contexto es `medicion`.
`registrarArchivo` (`src/db/consultas/admin.ts:762`) exige, para `medicion`, que la medición no
esté `cerrada` (como ya hace con `hallazgo`) e inserta el evento `soporte`.

- [ ] **Step 4: Los dos handlers y el `matcher`**

El POST copia el orden de `src/app/api/hallazgos/[id]/archivos/route.ts` con el permiso
`indicadores.medir` y `autorizarSoporte`. El GET copia el de la foto de un hallazgo
(`…/hallazgos/[id]/archivos/[archivoId]/[[...nombre]]/route.ts`) con `puedeVerSoportes` y siempre
como descarga. En `src/proxy.ts:48`, la exclusión `api/mediciones/[0-9]+/archivos$`.

- [ ] **Step 5: Componente y acción**

`Soportes` en la pantalla de reporte (subir, lista con formato y tamaño, quitar) y, en lectura, en
la tabla del año para quien ve soportes. `quitarSoporteAccion`. Frase de `medicion_soporte_quitado`.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-soportes.test.ts tests/proxy-matcher.test.ts tests/handlers-permisos.test.ts tests/indicadores-mediciones.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(f14a): soportes de una medición"
```

### Tarea 12: Cierre del mes y reapertura

**Files:**
- Create: `src/db/consultas/indicadores/cierre.ts`, `src/app/(app)/indicadores/cierre/page.tsx`, `src/componentes/indicadores/cierre/{ResumenDeCierre,DialogoReabrir}.tsx`, `tests/indicadores-cierre.test.ts`
- Modify: `src/app/acciones-indicadores.ts`, `src/lib/esquemas/indicadores.ts`, `src/app/(app)/indicadores/[codigo]/page.tsx`, `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `asegurarMediciones`, `recalcularMedicion` (Tarea 9); `sinRespuesta` (Tarea 10); `responsablesDeMedir` (Tarea 2); `avisarA`.
- Produces:
  - `type ResumenDeCierre = { mes: string; yaCerrado: boolean; aCerrar: number; reportadas: number; sinDato: { codigo: string; nombre: string; proceso: string; periodo: string; quien: string[] }[]; noAplica: number; sinAnalisis: number; observacionesSinRespuesta: number; enPlazo: number; historicosSinRegistrar: number }`.
  - `mesPorOmision(opciones?): Promise<string | null>` (`AAAA-MM`: el siguiente al último cerrado o, sin cierres, el mes anterior al actual; `null` si no ha terminado ninguno).
  - `resumenDeCierre(sesion, mes: string, opciones?): Promise<ResumenDeCierre>`.
  - `cerrarMes(sesion, mes: string, opciones?): Promise<{ cierreId: number; cerradas: number }>` (rechaza un mes sin terminar o ya cerrado; no alcanza las mediciones dentro de su plazo ni los históricos sin registrar, F14-DC3).
  - `reabrirMedicion(sesion, d: { medicionId: number; justificacion: string }, opciones?): Promise<void>` (10 a 1000 caracteres; vuelve a `reportada` o a `abierta`; marca `corregida`; evento `reapertura`; avisa a quienes miden).
  - `cerrarDeNuevo(sesion, medicionId: number, opciones?): Promise<void>` (la reabierta vuelve a `cerrada` con el último cierre).
  - `cierres(opciones?): Promise<{ mes: string; cerradoPor: string; cerradoEn: Date; cerradas: number }[]>`.
  - Acciones con `indicadores.administrar`: `cerrarMesAccion`, `reabrirMedicionAccion`, `cerrarDeNuevoAccion`.
  - Aviso: `indicadores.reabierta`. Bitácora: `indicadores_mes_cerrado`, `medicion_reabierta`, `medicion_cerrada_de_nuevo`.

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-cierre.test.ts` (todo dentro de `revertida`: ningún test deja un cierre confirmado; `ahora` es el 20 de abril de 2026)

```ts
it("el resumen de marzo cuenta cada grupo", …);
//  una reportada, una sin datos y vencida, una «no aplica», una con datos y sin análisis, una observación sin respuesta,
//  una dentro de su plazo (plazo de 30 días) y un histórico sin registrar →
//  { aCerrar: 4, reportadas: 1, noAplica: 1, sinAnalisis: 1, observacionesSinRespuesta: 1, enPlazo: 1, historicosSinRegistrar: 1 }
//  y sinDato = [{ codigo, periodo: "2026-03", quien: [nombre de quien mide] }]
it("cerrar deja cada medición como corresponde", …);
//  reportada → 'cerrada' con cierre_id; sin datos → 'cerrada' sin resultado; con datos y sin análisis → 'cerrada' con sin_analisis = true;
//  dentro de su plazo → sigue 'abierta'; histórico sin registrar → sigue 'abierta'; histórico registrado → 'cerrada';
//  un evento 'cierre' por medición cerrada; cierres_indicadores.resumen con los conteos
it("«cerrar hasta marzo» alcanza también enero y febrero", …);
it("no se cierra un mes sin terminar ni dos veces el mismo", …);     // Review Focus 4
//  "2026-04" → ErrorIndicador("Ese mes no ha terminado"); marzo otra vez → ErrorIndicador("Ese mes ya está cerrado")
it("solo quien administra", …);                                       // lider_proceso → ErrorPermiso
it("después del cierre no se reporta, no se analiza, no se cambia la meta ni se quita un soporte; sí se observa", …);
it("reabrir exige justificación, vuelve a reportada (o a abierta si no tenía datos), marca «corregida» y avisa a quien mide", …);
//  justificacion de 9 caracteres → ErrorIndicador; evento 'reapertura' { justificacion }; aviso 'indicadores.reabierta'
it("si quien reabre es además quien mide, el evento lo marca", …);    // detalle.propioMedidor = true
it("la reabierta se corrige y se cierra de nuevo, a mano o con el siguiente cierre", …);
it("solo se reabre lo cerrado", …);
it("mesPorOmision: el siguiente al último cerrado; sin cierres, el mes anterior al actual", …);
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-cierre.test.ts`
Expected: FAIL.

- [ ] **Step 3: `cierre.ts`**

`cerrarMes`: `asegurarMediciones` primero; en una transacción, inserta el cierre (un `23505` es
«Ese mes ya está cerrado») y hace un solo `UPDATE … RETURNING` sobre las mediciones con `hasta <=
fin del mes`, `estado <> 'cerrada'`, `vence_en < ahora` y no (`historica` sin valores ni «no
aplica»); marca `sin_analisis` donde faltaba; inserta los eventos `cierre` en lote; guarda el
resumen. `reabrirMedicion` hace el `UPDATE` que el trigger admite (`estado`, `reabierta_por`,
`reabierta_en`, `reabierta_motivo`, `corregida = true`, `cierre_id = NULL`).

- [ ] **Step 4: Acciones y pantalla**

Las tres acciones. `/indicadores/cierre` (`notFound()` si no administra): selector de mes
(`mesPorOmision`), `ResumenDeCierre` con los grupos del spec §9 y sus dos avisos («no se cierran»),
confirmación en un `Dialogo` sin clave, y la lista de cierres anteriores. En la página del
indicador, quien administra ve «Reabrir» en las filas cerradas y «Cerrar de nuevo» en las
reabiertas; la fila muestra «Corregida» con su historial (antes, después, quién, cuándo, por qué).

- [ ] **Step 5: Bitácora** de las tres acciones.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-cierre.test.ts tests/indicadores-mediciones.test.ts tests/indicadores-analisis.test.ts tests/indicadores-soportes.test.ts tests/bitacora-detalle.test.ts tests/paginas-sesion.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit y punto de control**

```bash
git add src tests
git commit -m "feat(f14a): cierre del mes y reapertura con justificación"
```

Punto de control del controlador: leer el resumen, cerrar un mes, comprobar que una medición
cerrada no se corrige, reabrirla, corregirla y verla «Corregida».

### Tarea 13: Tareas, recordatorios, escalamiento, alertas e insignia

**Files:**
- Create: `src/db/consultas/indicadores/tareas.ts`, `src/db/consultas/indicadores/vencimientos.ts`, `tests/indicadores-tareas.test.ts`, `tests/indicadores-vencimientos.test.ts`, `tests/indicadores-alertas.test.ts`
- Modify: `src/db/consultas/indicadores/alertas.ts` (`alRecalcular`), `src/lib/tareas.ts` (fuente nueva y `GRUPOS`), `src/lib/tareas-peticion.ts`, `src/db/consultas/vencimientos.ts:122-127`, `src/componentes/cascaron/{Cascaron,BarraLateral,ContenidoBarra}.tsx`, sus tests

**Interfaces:**
- Consumes: `asegurarMediciones`, `Recalculo` (Tarea 9); `responsablesDeMedir`, `responsablesDeAnalizar`, `aprobadoresDeFicha`, `filtroIndicadores` (Tarea 2); `obtenerParametros` (Tarea 5); `avisarA`, `jefesDe`, `lideresDeProceso`, `adminsActivos`; `fraseDeResultado` (Tarea 4); `Tarea`, `agruparTareas`.
- Produces:
  - `tareasDeIndicadores(sesion: SesionFlujo, opciones?: { sql?; ahora? }): Promise<{ tareas: Tarea[]; vencidas: number }>`: ids `medir:<medicionId>`, `analizar:<medicionId>`, `observacion:<observacionId>`, `ficha:<versionId>` y `ficha-devuelta:<versionId>`; `modulo: "indicadores"`.
  - `misTareas` devuelve además `vencidasIndicadores: number`; `GRUPOS` gana `medir:` («N indicadores por reportar», enlace `/indicadores?reporte=por-reportar&participo=1`), `analizar:` («N indicadores por analizar», `/indicadores?reporte=falta-analisis&participo=1`) y `ficha:` («N fichas por aprobar», `/indicadores/por-aprobar`).
  - `tareasDePeticion` expone `vencidasIndicadores`; `ContenidoBarra` gana la prop `vencidasIndicadores?: number` y pinta la insignia en `/indicadores` (texto oculto « reportes vencidos»).
  - `revisarVencimientosDeIndicadores(opciones: { sql: Cliente; ahora: Date; config: ConfigDocumental }): Promise<{ avisados: number; escalados: number }>`: abre periodos, aviso previo, vencido y escalamiento (spec §10.2); `revisarVencimientos` la suma.
  - `alRecalcular` implementada: alerta por color, de corrección y por incumplimiento repetido (spec §10.3).
  - Tipos de aviso: `indicadores.por_vencer`, `indicadores.vencido`, `indicadores.escalado`, `indicadores.alerta`, `indicadores.correccion`.

- [ ] **Step 1: Tests que fallan** (dentro de `revertida`)

`tests/indicadores-tareas.test.ts`:

```ts
it("quien mide tiene la tarea de reportar, con su fecha límite y su enlace", …);
//  { id: `medir:${medicionId}`, modulo: "indicadores", titulo: "Reportar <código> <nombre>, tercer trimestre de 2026",
//    vence: vence_en, enlace: "/indicadores/<codigo>/reportar/2026-T3" }
it("si el designado se desactiva, la tarea pasa al líder; sin líder, al Admin SGC con «Sin responsable: designe a alguien»", …);   // Review Focus 3
it("quien analiza tiene la tarea cuando el resultado no cumple y falta el análisis", …);   // `analizar:${medicionId}`
it("una observación sin respuesta es tarea de quien analiza; una ficha por aprobar, de quien puede aprobarla; una devuelta, de quien la elaboró", …);
it("no generan tarea los históricos, los «no aplica», las mediciones cerradas ni los indicadores retirados", …);
it("más de cinco se agrupan, contando solo las de la persona", …);    // Review Focus 5
//  seis `medir:` propias, dos vencidas, y otras de un restringido ajeno → una tarea "6 indicadores por reportar, 2 vencidos"
//  con enlace "/indicadores?reporte=por-reportar&participo=1"; `total` cuenta las seis
it("vencidasIndicadores cuenta las mediciones vencidas a cargo de la persona", …);
```

`tests/indicadores-vencimientos.test.ts`:

```ts
it("la pasada abre los periodos que terminaron", …);
it("aviso previo: una vez, agrupado por persona, cuando faltan los días del parámetro", …);
//  dos mediciones que vencen el 10 de abril, ahora = 8 de abril → un aviso 'indicadores.por_vencer'
//  "Tiene 2 indicadores por reportar antes del 10 de abril"; aviso_previo_en marcado; la segunda pasada no avisa
it("vencido: un aviso por persona a quienes miden y otro por proceso a sus líderes", …);   // 'indicadores.vencido'; aviso_vencido_en
it("si lo que falta es el análisis, el aviso de vencido va a quien analiza", …);
it("escalamiento: pasados los días de Configuración documental, al jefe y sin nombrar el indicador", …);
//  'indicadores.escalado' { titulo: "Reportes de indicadores vencidos", enlace: null,
//    cuerpo: "2 reportes de indicadores a cargo de <nombre> siguen vencidos. Vencieron hace 5 días." }; el Admin SGC no recibe
it("nada para históricos, «no aplica» ni cerradas; cada aviso sale una sola vez", …);
```

`tests/indicadores-alertas.test.ts`:

```ts
it("«Atención» avisa a quien analiza y a quien hace seguimiento, no a quien reportó", …);
//  'indicadores.alerta' "<nombre>: 83,3 % frente a una meta de 90 %, Atención. Segundo trimestre de 2026"; enlace "/indicadores/<codigo>"
it("«Crítico» avisa además a los líderes del proceso y a los Admin SGC", …);
it("«Bien», «sin meta», «no aplica» y los históricos no avisan", …);
it("una corrección que cambia el color avisa a los de antes y a los de ahora", …);
//  'indicadores.correccion' "Corrección: <nombre> pasó de Crítico a Bien. Segundo trimestre de 2026"; sin cambio de color, nada
it("el incumplimiento repetido se alerta como crítico aunque el color sea «Atención»", …);
it("alerta_estado guarda el último estado alertado", …);
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-tareas.test.ts tests/indicadores-vencimientos.test.ts tests/indicadores-alertas.test.ts`
Expected: FAIL.

- [ ] **Step 3: `tareas.ts`, `misTareas` y la insignia**

`tareasDeIndicadores` hace una consulta por tipo de tarea, acotada al usuario (designación, liderazgo
o respaldo, con el mismo criterio de `responsablesDeMedir` y `responsablesDeAnalizar` expresado en
SQL) y con `filtroIndicadores`. **Solo lee:** se calcula en cada página del cascarón y no abre
periodos. Los abre la pasada de vencimientos que el propio cascarón dispara (`after()`, cada diez
minutos como mucho) y las páginas del módulo; así la tarea aparece, a lo sumo, en la carga siguiente.
Esto ajusta la letra del spec §8.1, que ponía también a «Mis tareas» a asegurar la apertura: anótelo
en «Decisiones adicionales (Fase 14A)» de `CONTEXT.md`. `misTareas` la suma a su `Promise.all` y devuelve
`vencidasIndicadores`; `GRUPOS` gana los tres prefijos. `tareasDePeticion`, `Cascaron`,
`BarraLateral` y `ContenidoBarra` llevan el número hasta la entrada `/indicadores`, con el mismo
marcado de la insignia de `/vigencia` y el texto oculto « reportes vencidos».

- [ ] **Step 4: `vencimientos.ts`**

Con el patrón de `revisarProceso` (`src/db/consultas/vigencia/vencimientos.ts:35-130`): candidatos
por marca nula, cada grupo en su `enTransaccion` con `FOR UPDATE SKIP LOCKED`, marcas releídas bajo
el candado, `avisarA` y `jefesDe`. Agrupa por persona el previo y el vencido, y por proceso el de
los líderes. `revisarVencimientos` la llama después de la de vigencia y suma su resultado.

- [ ] **Step 5: `alRecalcular`**

Si `r.historica`, nada. «Nivel de alerta» es `critico` si `r.despues === "critico"` o `r.repetido`;
`atencion` si `r.despues === "atencion"`; ninguno en lo demás. Si el nivel es distinto del
`alerta_estado` guardado: con `antes` nulo es una alerta nueva (`indicadores.alerta`); si no, una
corrección (`indicadores.correccion`) a los destinatarios del nivel anterior y del nuevo. Nunca se
avisa a `c.actorId`. Guarda `alerta_estado`. El texto usa `fraseDeResultado` y la etiqueta del periodo.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-tareas.test.ts tests/indicadores-vencimientos.test.ts tests/indicadores-alertas.test.ts tests/tareas.test.ts tests/vencimientos.test.ts tests/cascaron.test.tsx tests/indicadores-mediciones.test.ts && npm run lint`
Expected: PASS (los tests existentes de tareas, vencimientos y cascarón siguen en verde).

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(f14a): tareas, recordatorios, escalamiento y alertas de indicadores"
```

### Tarea 14: Gráficas en estilo «Tubos»

**Files:**
- Create: `src/componentes/ui/geometria-tubos.ts`, `src/componentes/ui/GraficoTubos.tsx`, `TuboAcumulado.tsx`, `MiniTubos.tsx`, `Tendencia.tsx`, `BarraEstados.tsx`, `TarjetaDeTubo.tsx` (cliente), `tests/geometria-tubos.test.ts`, `tests/graficas-indicadores.test.tsx`
- Modify: `src/app/globals.css` (tokens de brillo y sombra por estado, animación y regla de impresión), `tests/contraste.test.ts` (los tokens nuevos, en claro y oscuro)

**Interfaces:**
- Consumes: los tokens `--estado-{bien|atencion|critico|sin-dato}` y `--mod-indicadores` de `globals.css`; `calcularBarras` y el patrón de `GraficoBarras.tsx` (figura con su tabla `sr-only`).
- Produces:
  - Tokens: `--estado-bien-brillo`, `--estado-bien-sombra`, y lo mismo para `atencion` y `critico`, con `light-dark()`; `--tubo-pista`; `--tubo-neutro`.
  - `geometria-tubos.ts`: `type PuntoDeSerie = { clave: string; etiqueta: string; valor: number | null; texto: string; estado: "bien" | "atencion" | "critico" | "sin-meta" | "sin-dato" | "no-aplica" | "futuro"; nombreEstado: string }`; `escala(valores: number[], referencias: number[], esPorcentaje: boolean): { min: number; max: number; marcas: number[] }`; `calcularTubos(serie: PuntoDeSerie[], g: { ancho: number; alto: number; margen: { izq: number; der: number; arriba: number; abajo: number } }, e: { min: number; max: number }): { x: number; ancho: number; yRelleno: number; altoRelleno: number; centro: number }[]`; `yDe(valor: number, …): number`.
  - `GraficoTubos({ serie, titulo, meta, limite, rango, unidad, columnas })`: `meta?: { valor: number; texto: string } | { porPeriodo: (number | null)[]; texto: string }`, `limite?: { valor: number; texto: string }`, `rango?: { min: number; max: number }`, `columnas: readonly [string, string, string]` (encabezados de la tabla equivalente).
  - `TuboAcumulado({ valor, texto, estado, meta })`, `MiniTubos({ titulo, serie })`, `Tendencia({ valores, estadoFinal, descripcion })`, `BarraEstados({ bien, atencion, critico, sinDato })`.

- [ ] **Step 1: Tests que fallan**

`tests/geometria-tubos.test.ts`:

```ts
it("la escala de un porcentaje va de 0 a 100 y crece en pasos de 25 si algo la pasa", () => {
  expect(escala([88, 91, 58], [85, 59.5], true)).toEqual({ min: 0, max: 100, marcas: [0, 50, 100] });
  expect(escala([120], [100], true)).toEqual({ min: 0, max: 125, marcas: [0, 62.5, 125] });
});
it("la escala de otra unidad deja aire sobre el mayor valor o referencia", () => {
  expect(escala([28, 44], [30, 42.86], false)).toEqual({ min: 0, max: 50, marcas: [0, 25, 50] });
});
it("un tubo por punto, de ancho fijo y centrado en su franja; sin valor, sin relleno", () => {
  const t = calcularTubos(doce, { ancho: 540, alto: 214, margen: { izq: 34, der: 100, arriba: 18, abajo: 36 } }, { min: 0, max: 100 });
  expect(t).toHaveLength(12);
  expect(t.every((x) => x.ancho <= 24)).toBe(true);
  expect(t[6].altoRelleno).toBe(0);                                   // julio, sin dato
  expect(t[1].altoRelleno).toBeGreaterThan(t[7].altoRelleno);         // 91 contra 58
});
```

`tests/graficas-indicadores.test.tsx` (render estático):

```ts
it("GraficoTubos: una figura con nombre, un tubo por periodo, la meta, el límite y su tabla equivalente", …);
//  role="img" con aria-label; 12 pistas; el relleno lleva la clase de su estado (tubo-bien, tubo-atencion, tubo-critico, tubo-neutro);
//  «s. d.» bajo el periodo sin dato y «n. a.» bajo el «no aplica»; «Meta 85 %» y «Crítico < 59,5 %»;
//  una tabla sr-only con una fila por periodo: periodo, valor y nombre del estado
it("cada columna se enfoca con el teclado y dice su valor y su estado", …);   // tabIndex 0 y aria-label "marzo: 86 %, Bien"
it("sin meta, los tubos van en neutro y no hay líneas", …);
it("TuboAcumulado, MiniTubos, Tendencia y BarraEstados llevan su texto", …);
//  BarraEstados → "19 bien, 7 en atención, 3 críticos, 3 sin dato"; Tendencia → aria-label con la descripción
it("la hoja de estilos apaga la animación con prefers-reduced-motion y usa relleno sólido al imprimir", …);
//  globals.css contiene las dos reglas para .tubo-relleno
it("ningún componente de gráfica usa un color fijo", …);            // sin hex ni clases bg-/text-/fill- de color fijo
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/geometria-tubos.test.ts tests/graficas-indicadores.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Tokens y hoja de estilos**

En `src/app/globals.css`: los seis tokens de brillo y sombra con `light-dark()` (más claro y más
oscuro que su `--estado-*`), `--tubo-pista` y `--tubo-neutro`; las clases `tubo-bien`,
`tubo-atencion`, `tubo-critico` y `tubo-neutro` pintan el relleno con un `linear-gradient(to right,
brillo, base, sombra)` aplicado por `fill: url(#…)` o por `background` según el elemento; la
animación `tubo-crecer` (una vez, 0,75 s, con retardo por columna) va dentro de `@media
(prefers-reduced-motion: no-preference)`; en `@media print` el relleno es el color base sólido y se
muestran el valor y el estado escritos sobre cada columna. Valide los tokens nuevos en claro y oscuro
con el test de contraste existente.

- [ ] **Step 4: `geometria-tubos.ts`**

Funciones puras sobre números (los componentes convierten las fracciones con `aDecimal` antes).

- [ ] **Step 5: Componentes**

`GraficoTubos` es un Server Component que pinta el SVG (referencia: `estilo-graficas-v3.html`,
estilo A, columna izquierda) y su tabla `sr-only`; `TarjetaDeTubo` (cliente) añade la tarjeta al
pasar el cursor y al enfocar, escribiendo con `textContent`, con el área sensible en toda la franja
del periodo. La meta lleva su etiqueta en el margen derecho; el límite de crítico, línea punteada.
Los otros cuatro son Server Components sin estado.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/geometria-tubos.test.ts tests/graficas-indicadores.test.tsx tests/colores-fijos.test.ts tests/contraste.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(f14a): gráficas de indicadores en estilo tubos"
```

### Tarea 15: Lista completa, página del indicador y matriz del año

**Files:**
- Create: `src/db/consultas/indicadores/lectura.ts`, `src/app/(app)/indicadores/matriz/page.tsx`, `src/componentes/indicadores/{ListaIndicadores,FiltrosIndicadores,ResultadoPrincipal,MatrizDelAnio,InsigniaSemaforo}.tsx`, `tests/indicadores-lectura.test.ts`, `tests/modulo-indicadores-vistas.test.tsx`
- Modify: `src/app/(app)/indicadores/page.tsx`, `src/app/(app)/indicadores/[codigo]/page.tsx` (Resultados completa y pestaña Observaciones), `src/db/consultas/indicadores/fichas.ts` (retira `listarIndicadoresBasico`)

**Interfaces:**
- Consumes: `asegurarMediciones`, `tablaDelAnio` (Tarea 9); `acumulado`, `comparacion`, `fraseDeResultado`, `textoValor`, `textoMeta`, `estadoVisible`, `mesesDe`, `clavesDelAnio` (Tarea 4); `filtroIndicadores`, `puedeVerSoportes` (Tarea 2); los componentes de la Tarea 14; `observacionesDe`, `soportesDe` (Tareas 10 y 11); `designadosDe` (Tarea 8).
- Produces:
  - `type FiltroDeLista = { procesoId?: number; subprocesoId?: number; clasificacionId?: number; tipoId?: number; semaforo?: Semaforo | "sin-dato"; reporte?: "por-reportar" | "falta-analisis" | "vencida" | "requiere-accion"; participo?: boolean; texto?: string; retirados?: boolean }`; `filtroDeConsulta(q: Record<string, string | string[] | undefined>): FiltroDeLista`.
  - `listarIndicadores(sesion, filtro: FiltroDeLista, opciones?): Promise<{ filas: FilaDeLista[]; resumen: { bien: number; atencion: number; critico: number; sinDato: number; vencidos: number } }>` (`FilaDeLista`: `id`, `codigo`, `nombre`, `proceso`, `subproceso`, `periodicidad`, `restringido`, `retirado`, `periodo`, `resultado`, `meta`, `semaforo`, `tendencia` (últimos valores), `flecha`, `mejora`, `reporte`).
  - `obtenerIndicador(sesion, codigo: string, opciones?): Promise<VistaDeIndicador | null>` (ficha vigente, operación, último resultado con frase y comparación, permisos de la persona: `puedeMedir`, `puedeAnalizar`, `puedeObservar`, `veSoportes`, `administra`).
  - `type ResumenAcumulado = { texto: string | null; semaforo: Semaforo | null; valores: Record<string, string>; rotulo: string | null }` (`rotulo` es «Acumulado parcial: falta julio» o «Acumulado desde julio, versión 2» cuando aplica).
  - `resultadosDelAnio(sesion, indicadorId: number, anio: number, opciones?): Promise<{ filas: FilaDelAnio[]; acumulado: ResumenAcumulado; serie: PuntoDeSerie[]; variables: { letra: string; nombre: string; serie: PuntoDeSerie[] }[]; anios: number[] }>`.
  - `matrizDelAnio(sesion, f: { anio: number; procesoId?: number; clasificacionId?: number }, opciones?): Promise<{ procesos: { id: number; nombre: string; filas: { codigo: string; nombre: string; celdas: CeldaDeMatriz[]; anio: CeldaDeMatriz }[] }[] }>` (`CeldaDeMatriz`: `desdeMes`, `hastaMes`, `texto`, `estado`, `nombre`, `enlace`).

- [ ] **Step 1: Tests que fallan**

`tests/indicadores-lectura.test.ts` (dentro de `revertida`):

```ts
it("la lista trae el último periodo terminado de cada indicador, con su resultado, su meta, su estado y su tendencia", …);
it("los conteos y la barra de estados solo cuentan lo que la persona ve", …);    // Review Focus 5
//  un restringido crítico de otro proceso: para un consulta ajeno no aparece ni suma en `resumen.critico`; para el Admin SGC sí
it("filtros: proceso, clasificación, tipo, semáforo, estado del reporte, «donde participo», texto sin tildes y retirados", …);
//  texto "auditorias" encuentra «Auditorías»; los retirados solo con retirados: true
it("obtenerIndicador dice qué puede hacer la persona", …);
//  consulta sobre un general → { puedeMedir: false, puedeObservar: false, veSoportes: false, administra: false }; restringido ajeno → null
it("los resultados del año: filas, acumulado, serie para la gráfica y una serie por variable", …);
//  con 5/5, 5/6 y 3/5: acumulado 81,25 % en «Atención»; serie de cuatro puntos con el cuarto en estado "futuro"; anios con los años que tienen mediciones
it("la matriz: una celda por periodo con sus meses, y la columna del año", …);
//  trimestral → celdas { desdeMes: 1, hastaMes: 3 }, …; mensual → doce; anual → { desdeMes: 1, hastaMes: 12 }; nombre "marzo: 86 %, Bien"
it("la matriz agrupa por proceso y deja fuera lo restringido ajeno y lo que no se midió ese año", …);
```

`tests/modulo-indicadores-vistas.test.tsx` (render estático): `ListaIndicadores` pinta la barra de
estados con su lectura en texto y una `InsigniaSemaforo` con texto en cada fila; `ResultadoPrincipal`
pinta el valor, el estado, la frase y la comparación; `MatrizDelAnio` usa `colSpan={3}` para un
trimestre, escribe «s. d.» y «n. a.» y da nombre accesible a cada celda; la página del indicador no
pinta la columna de soportes ni la pestaña Observaciones a quien no las ve; `a11y-estructura` para
las tres páginas.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-lectura.test.ts tests/modulo-indicadores-vistas.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `lectura.ts`**

`listarIndicadores`: una consulta con `LATERAL` para la última medición terminada de cada indicador
y otra para los últimos seis valores (la tendencia), siempre con `filtroIndicadores`; `resumen` se
calcula sobre las mismas filas filtradas por visibilidad, antes de aplicar el filtro de semáforo.
Antes de leer, `asegurarMediciones`. `resultadosDelAnio` arma `PuntoDeSerie` desde `tablaDelAnio` y
calcula el acumulado con `acumulado`. `matrizDelAnio` usa `mesesDe` para ubicar cada celda.

- [ ] **Step 4: Lista y matriz**

`/indicadores` con `EncabezadoPagina`, `PestanasIndicadores`, `BarraEstados`, `FiltrosIndicadores`
(un `<form method="get">`, una fila) y `ListaIndicadores` (maqueta 4); `EstadoVacio` cuando no hay
ninguno. `/indicadores/matriz` (maqueta 5) con filtros de año, proceso y clasificación, leyenda con
texto y cada celda enlazada a su medición.

- [ ] **Step 5: Página del indicador**

Vista `resultados` completa (maqueta 2): `ResultadoPrincipal`, `GraficoTubos` con selector de rango
(año, dos años, todo), `TuboAcumulado` con su rótulo («Acumulado parcial: falta julio» cuando
aplique), `MiniTubos` por variable y la tabla del año con selector de año, las marcas («Histórico»,
«Corregida», «Requiere acción de mejora», «Meta ajustada después del periodo», «3 periodos sin
cumplir») y, para quien ve soportes, su columna. Vista `observaciones` para quien las ve.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-lectura.test.ts tests/modulo-indicadores-vistas.test.tsx tests/indicadores-fichas.test.ts tests/paginas-sesion.test.ts tests/colores-fijos.test.ts tests/textos-fijos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit y punto de control**

```bash
git add src tests
git commit -m "feat(f14a): lista, página del indicador y matriz del año"
```

Punto de control del controlador (claro, oscuro y 390 px): la lista con sus filtros, la página de un
indicador con la gráfica de tubos y el hueco de un periodo sin dato, y la matriz de un proceso y de
toda la entidad, comparadas con las maquetas.

### Tarea 16: Ficha impresa y Excel de resultados

**Files:**
- Create: `src/app/(app)/indicadores/[codigo]/imprimir/page.tsx`, `src/componentes/indicadores/ficha/FichaImpresa.tsx`, `src/lib/indicadores/excel.ts`, `src/app/(app)/indicadores/excel/route.ts`, `src/app/(app)/indicadores/[codigo]/excel/route.ts`, `tests/indicadores-excel.test.ts`, `tests/indicadores-impresion.test.tsx`
- Modify: `src/app/globals.css` (reglas `@media print` de la ficha), `src/lib/bitacora-detalle.ts`

**Interfaces:**
- Consumes: `obtenerIndicador`, `resultadosDelAnio`, `listarIndicadores`, `matrizDelAnio` (Tarea 15); `versionesDe` (Tarea 7); `designadosDe` (Tarea 8); `construirHoja`, `agregarHoja`, `MetaHoja` (`src/lib/distribucion/hoja-excel.ts`); `neutralizarFormula`; `obtenerMarcaSegura`; `crearLimitador`; `GraficoTubos` en modo impresión.
- Produces:
  - `construirExcelDeIndicador(v: VistaDeIndicador, r: { anio: number; filas: FilaDelAnio[]; acumulado: ResumenAcumulado }, meta: MetaHoja): Promise<Buffer>` (hojas «Ficha» y «Resultados <año>»).
  - `construirExcelDeResultados(m: Awaited<ReturnType<typeof matrizDelAnio>>, anio: number, meta: MetaHoja): Promise<Buffer>` (una fila por indicador, doce meses y el año).
  - `GET /indicadores/[codigo]/excel?anio=` y `GET /indicadores/excel?…filtros`: 401 sin sesión, 404 si no lo ve, 429.
  - Bitácora: `exporto_ficha_indicador` y `exporto_matriz_indicadores` (nombres que no se confunden con `exporto_indicadores` de la 13C).

- [ ] **Step 1: Tests que fallan**

`tests/indicadores-excel.test.ts` (lee el libro generado con `exceljs`):

```ts
it("el Excel de un indicador trae la hoja «Ficha» y la hoja «Resultados 2026», con el acumulado", …);
//  «Resultados 2026»: una fila por periodo (periodo, cada variable, resultado, meta, «Cumple», estado, análisis, marcas) y la fila «Acumulado del año»
it("el Excel de resultados trae una fila por indicador visible, doce meses y el año", …);       // «s. d.» y «n. a.» como texto
it("neutraliza las fórmulas", …);                                     // un nombre "=SUMA(A1)" queda con un apóstrofo delante
it("no trae soportes ni observaciones", …);
it("GET: 401 sin sesión, 404 si la persona no ve el indicador, 200 con el tipo de Excel y no-store", …);
it("cada descarga queda en la bitácora", …);                          // 'exporto_ficha_indicador' { codigo, anio } y 'exporto_matriz_indicadores' { anio, filtros }
```

`tests/indicadores-impresion.test.tsx` (render estático de `FichaImpresa`):

```ts
it("sigue el orden de la ficha del usuario", …);
//  encabezado (nombre de la entidad de la marca, «Ficha técnica de indicador», código, versión, vigente desde) → Identificación →
//  Estructura de medición (fórmula y rangos en palabras) → firmas → Control de cambios → Datos de operación → Seguimiento y medición → gráfica
it("las firmas son las de la tabla firmas: nombre, cargo y fecha", …);   // «Elaboró» y «Revisó y aprobó»
it("los datos de operación van después de las firmas, rotulados como tales", …);
it("la tabla trae solo los periodos de la periodicidad, dice con qué versión se calculó y cierra con el acumulado", …);
it("no imprime soportes ni observaciones, ni el nombre de la entidad escrito en el código", …);
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-excel.test.ts tests/indicadores-impresion.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `excel.ts` y los dos handlers**

Con `construirHoja` y `agregarHoja`; `MetaHoja` con el nombre de la entidad (`obtenerMarcaSegura`),
la fecha y el detalle de filtros. Los handlers copian el orden de
`src/app/(app)/vigencia/indicadores/excel/route.ts`: `sesionDePeticion` (401), visibilidad (404),
`crearLimitador` de 10 por minuto (429), `registrarAuditoria` y la respuesta con `no-store`.

- [ ] **Step 4: Ficha impresa**

`/indicadores/[codigo]/imprimir?anio=` (`exigirIndicador`): `FichaImpresa` con el diseño de la
maqueta 7 y del Excel del usuario, clases de impresión en `globals.css` (márgenes, saltos de página
que no parten una fila, colores de impresión) y un botón «Imprimir» que llama `window.print()` y no
se imprime. La gráfica usa `GraficoTubos` en su modo de impresión.

- [ ] **Step 5: Bitácora** de las dos acciones, y los botones «Imprimir ficha» y «Excel» en la página del indicador, la lista y la matriz.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-excel.test.ts tests/indicadores-impresion.test.tsx tests/handlers-permisos.test.ts tests/bitacora-detalle.test.ts tests/textos-fijos.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit y punto de control**

```bash
git add src tests
git commit -m "feat(f14a): ficha impresa y Excel de resultados de indicadores"
```

Punto de control del controlador: la vista previa de impresión de `SGC-IND-01`, al lado de la hoja
`IND-01` del Excel del usuario, en una y dos páginas.

### Tarea 17: Página del proceso, búsqueda e «Indicadores que exige»

**Files:**
- Create: `src/componentes/indicadores/IndicadoresDelProceso.tsx`, `src/db/consultas/indicadores/busqueda.ts`, `tests/indicadores-proceso-busqueda.test.ts`
- Modify: `src/app/(app)/procesos/[slug]/page.tsx`, `src/app/(app)/procesos/[slug]/[sub]/page.tsx`, `src/app/api/buscar/route.ts`, `src/lib/busqueda-rapida.ts`, `src/componentes/cascaron/Buscador.tsx`, `src/app/(app)/buscar/page.tsx`, `src/db/consultas/normograma/lectura.ts`, `src/componentes/normograma/FichaNorma.tsx` (o el componente de la ficha de la norma)

**Interfaces:**
- Consumes: `filtroIndicadores` (Tarea 2); `listarIndicadores` (Tarea 15); `buscarNormas` y `GrupoNormas` como patrón.
- Produces:
  - `indicadoresDeProceso(sesion, procesoId: number, opciones?): Promise<{ propios: FilaDeProceso[]; porSubproceso: { subprocesoId: number; nombre: string; filas: FilaDeProceso[] }[] }>` y `indicadoresDeSubproceso(sesion, subprocesoId, opciones?)` (`FilaDeProceso`: `codigo`, `nombre`, `resultado`, `semaforo`, `periodo`).
  - `buscarIndicadores(q: string, sesion, limite: number, opciones?): Promise<{ codigo: string; nombre: string; proceso: string }[]>`; `INDICADORES_EN_LA_PALETA = 4`, `INDICADORES_EN_LA_BUSQUEDA = 5`; `ResultadoRapido.grupo` gana `"indicador"`.
  - `indicadoresQueExige(sesion, normaId: number, opciones?): Promise<{ codigo: string; nombre: string; proceso: string }[]>` (indicadores activos cuya versión vigente cita la norma, visibles para la persona).

- [ ] **Step 1: Tests que fallan** en `tests/indicadores-proceso-busqueda.test.ts` (dentro de `revertida`)

```ts
it("la página del proceso lista sus indicadores y, agrupados, los de sus subprocesos", …);
it("no cuenta ni nombra un restringido que la persona no ve, ni un borrador", …);        // Review Focus 5
it("la búsqueda encuentra por código y por nombre, sin tildes, con tope", …);
//  buscarIndicadores("sgc-ind-01", …) y ("auditorias", …) → el mismo indicador; tope 4 en la paleta y 5 en «Buscar»
it("la búsqueda no devuelve restringidos ajenos, borradores ni descartados", …);
it("/api/buscar devuelve el grupo «indicador» después de documentos y normas", …);
it("la ficha de una norma lista los indicadores activos que la citan y que la persona ve", …);
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/indicadores-proceso-busqueda.test.ts`
Expected: FAIL.

- [ ] **Step 3: Página del proceso**

`indicadoresDeProceso` e `indicadoresDeSubproceso` en `lectura.ts`. `IndicadoresDelProceso` va
después de «Documentos del proceso» en `procesos/[slug]/page.tsx` (cada fila: código, nombre,
último resultado e `InsigniaSemaforo`; un enlace «Ver la matriz del proceso») y en la página del
subproceso. Si no hay ninguno visible, la sección no se pinta.

- [ ] **Step 4: Búsqueda**

`buscarIndicadores` con `unaccent(...) ILIKE` sobre el código y el nombre de la versión vigente y
`filtroIndicadores`. `/api/buscar` y la página «Buscar» lo añaden como hicieron con `buscarNormas`;
`gruposDeResultados` y `Buscador` ganan el grupo «Indicadores».

- [ ] **Step 5: «Indicadores que exige»**

`indicadoresQueExige` y una sección con ese título en la ficha de la norma, que no se pinta si la
lista queda vacía.

- [ ] **Step 6: Correr**

Run: `npx vitest run tests/indicadores-proceso-busqueda.test.ts tests/busqueda-fase5.test.ts tests/normas.test.ts tests/cascaron.test.tsx && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "feat(f14a): indicadores en la página del proceso, la búsqueda y la norma"
```

### Tarea 18: Semilla demo de la 14A

**Files:**
- Create: `src/db/semillas/indicadores-demo.ts`, `tests/semilla-indicadores.test.ts`
- Modify: `src/db/semillas/demo.ts:709-712` (llama `sembrarIndicadores` después de `sembrarVigencia`), `src/db/semillas/minima.ts` (`sembrarBase`: maestros y parámetros), `tests/semilla-minima.test.ts`

**Interfaces:**
- Consumes: todas las funciones del dominio de las Tareas 5 a 12; `ContextoDistribucion`, `momentoHace`, `sesionDe`, `firmaDeLaDemo` y `FIRMA` de las semillas existentes.
- Produces: `sembrarIndicadores(sql: Sql, c: ContextoDistribucion): Promise<void>`, que deja lo que dice el spec §22 pasando por las funciones del dominio.

- [ ] **Step 1: Tests que fallan** en `tests/semilla-indicadores.test.ts` (lee el estado de la demo; con `exigirDemo` salta con aviso si ya avanzó y `SEMILLA_RECIEN=1` lo vuelve fallo)

```ts
it("están los ocho indicadores del proceso SGC, aprobados por Gerencia", …);   // SGC-IND-01 a SGC-IND-08, activos, con firmas 'elaboro' y 'aprobo'
it("hay un indicador de urgencias medido por alguien de rol Consulta, uno restringido, uno regulatorio con su norma y uno de cartera en su subproceso", …);
it("hay una ficha por aprobar, un borrador, un retirado y uno con versión 2", …);
it("2026 tiene históricos, un «Bien», un «Atención» con análisis, un «Crítico» con causa y acción, un sin dato, una vencida y un «no aplica»", …);
it("hay una meta programada, una observación sin respuesta, un cierre y una medición reabierta y corregida", …);
it("hay tres objetivos de calidad y dos institucionales", …);
```

Y en el test de la semilla mínima: tras `db:seed:minima` existen los tres maestros y los cinco
parámetros, y ningún indicador.

- [ ] **Step 2: Correr y ver que fallan**

Run: `SEMILLA_RECIEN=1 npx vitest run tests/semilla-indicadores.test.ts`
Expected: FAIL (no hay indicadores).

- [ ] **Step 3: `sembrarIndicadores`**

Todo pasa por las funciones del dominio, con `momentoHace` para las fechas y `firmaDeLaDemo` para
las firmas, como `sembrarVigencia`. Elabora `coordinadora.sgc`; aprueba `gerente` (y `lider.gth` lo
operativo de GTH). Los ocho del SGC, de forma «Porcentaje», tendencia ascendente y umbral 70:

| Código | Nombre | Numerador / denominador | Meta | Periodicidad | Tipo |
|---|---|---|---|---|---|
| `SGC-IND-01` | Cumplimiento del Programa de Auditorías Internas | Auditorías internas ejecutadas / programadas | 90 | Trimestral | Eficacia |
| `SGC-IND-02` | Eficacia de Acciones Correctivas | Acciones correctivas eficaces / evaluadas | 80 | Trimestral | Eficacia |
| `SGC-IND-03` | Cumplimiento de Objetivos de Calidad | Objetivos de calidad cumplidos / definidos | 80 | Semestral | Eficacia |
| `SGC-IND-04` | Cumplimiento de la Revisión por la Dirección | Revisiones realizadas / programadas | 100 | Anual | Eficacia |
| `SGC-IND-05` | Control de Información Documentada | Documentos conformes / revisados | 90 | Trimestral | Eficiencia |
| `SGC-IND-06` | Cumplimiento del Plan de Capacitación en Calidad | Capacitaciones ejecutadas / programadas | 80 | Trimestral | Eficacia |
| `SGC-IND-07` | Gestión de Riesgos y Oportunidades | Acciones de riesgo implementadas / planificadas | 70 | Trimestral | Eficacia |
| `SGC-IND-08` | Oportunidad de Cierre de No Conformidades | No conformidades cerradas a tiempo / con plazo vencido o cerradas | 75 | Trimestral | Efectividad |

Los demás: `AIN-IND-01` «Tiempo de espera en triage II» (subproceso Urgencias, mensual, minutos,
forma «Promedio o razón», descendente, meta 30; mide `jefe.urgencias`); `GTH-IND-01` «Rotación de
personal» (trimestral, descendente, meta 5 %, **restringido**; mide `lider.gth`); `GTH-IND-02`
«Cumplimiento del plan de capacitación institucional», **por aprobar**; `CEX-IND-01` «Oportunidad en
la asignación de cita de medicina general» (**regulatorio**, cita la Resolución 256 de 2016,
mensual, días, descendente, meta 3; mide `lider.cex`); `GRF-IND-01` «Recaudo de cartera corriente»
(subproceso Gestión de Cartera, mensual), en **borrador**; y uno más del SGC **retirado**. Los
estados de las mediciones, las metas, la observación, el cierre y la reapertura, como dice el spec
§22; `SGC-IND-01` lleva en 2026 los valores de la maqueta (5/5, 5/6, 3/5).

- [ ] **Step 4: Engancharla y resembrar la base de trabajo**

`demo.ts` la llama después de `sembrarVigencia`. Con el entorno de `sgc_f14a`:
`npm run db:seed && npm run admin:asegurar`.

- [ ] **Step 5: Correr todo**

Run: `SEMILLA_RECIEN=1 npm test`
Expected: PASS, sin saltos nuevos.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f14a): semilla demo de indicadores"
```

### Tarea 19: Documentación de cierre, verificación final y demostración

**Files:**
- Create: `docs/manual/usuario/08-indicadores.md`
- Modify: `AGENTS.md`, `CONTEXT.md`, `PLAN.md`, `README.md`, `docs/manual/usuario/03-*.md` (barra lateral y tareas)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el capítulo 8 del manual, `AGENTS.md` con lo de la 14A del spec §20, `CONTEXT.md` con «Hecho (Fase 14A)», «Qué probar y cómo (Fase 14A)» y las decisiones, y el recorrido de §24 hecho.

- [ ] **Step 1: Manual de usuario**

`docs/manual/usuario/08-indicadores.md`, «Indicadores: ficha técnica, reporte y análisis», con las
secciones por persona y los cinco puntos en lenguaje llano del spec §25; el capítulo 3 se corrige
donde la barra lateral y «Mis tareas» cambiaron.

- [ ] **Step 2: `AGENTS.md`**

Solo lo de la 14A del spec §20: las dos tablas de solo inserción (regla de negocio 5 y piso 10); la
inmutabilidad de mediciones cerradas y versiones aprobadas; las reglas nuevas de fórmulas, de un
solo camino de cálculo y del veredicto con el valor exacto; las dos excepciones de alcance; la
estructura del módulo y el aviso de los nombres de la 13C que no son este módulo; `acciones-indicadores.ts`
en la lista de Server Actions; `api/mediciones/[id]/archivos` fuera del `matcher`; los contextos de
`archivos`; las firmas de ficha; la sigla `IND`; la ficha firmada con sus nombres congelados; los
históricos; la fila «Animación» del stack (CSS, sin `motion`); y la regla de tests (ningún cierre de
mes ni ficha aprobada fuera de una transacción revertida).

- [ ] **Step 3: `CONTEXT.md`, `PLAN.md` y `README.md`**

`CONTEXT.md`: cabecera y «Punto de reanudación» (la 14A lista para el recorrido; sigue la 14B),
«Qué probar y cómo (Fase 14A)» con los pasos de §24 del spec sobre la demo, «Hecho (Fase 14A)»,
«Decisiones adicionales (Fase 14A)» (las F14-DCn y las resoluciones de la ejecución que cambien lo
que el usuario ve), los avisos (la base `sgc_f14a`, cómo resembrar la suya) y la deuda técnica que
quede. `PLAN.md`: la fila 14 partida en 14A (hecha) y 14B. `README.md`: el módulo nuevo.

- [ ] **Step 4: Verificación final**

```bash
npm run lint
SEMILLA_RECIEN=1 npm test                 # con la demo recién sembrada en sgc_f14a
env -u DATABASE_URL -u DATABASE_URL_MIGRADOR npm run build
```

Expected: lint limpio; todas las pruebas en verde y sin saltos nuevos; build en verde sin URL de
base, como el CI.

**La imagen se prueba en un contenedor aparte, nunca con `docker compose … up app`:** el servicio
`app` de `docker-compose.dev.yml` es el del usuario (puerto 9081) y tiene fija la base `sgc`;
reconstruirlo aplicaría la `0011` a su base. En su lugar:

```bash
docker build -t sgc-integral:f14a .
docker run --rm -d --name sgc-f14a-app --network sgc-integral_default -p 9082:3080 \
  -e DATABASE_URL=… -e DATABASE_URL_MIGRADOR=… -e BD_APP_CLAVE=… -e APP_SECRETO=… -e ZONA_HORARIA=America/Bogota \
  sgc-integral:f14a
docker logs sgc-f14a-app && curl -s http://localhost:9082/api/salud
docker stop sgc-f14a-app
```

Las cuatro variables llevan los mismos valores del servicio `app` de `docker-compose.dev.yml`, con
`sgc_f14a` en lugar de `sgc` en las dos URL (dentro de la red del compose, el host es `bd:5432`;
confirme el nombre de la red con `docker network ls`). Expected: el registro dice «Migraciones al
día» y `/api/salud` responde `{"estado":"ok"}`.

Además, aplique las migraciones sobre **una copia** de la base del usuario (un `pg_dump` de `sgc`,
que solo la lee, restaurado en `sgc_f14a_copia`): `db:preparar` contra la copia termina sin error y
los maestros y los parámetros quedan sembrados.

- [ ] **Step 5: Demostración**

Recorra en navegador, contra `sgc_f14a`, los veinte pasos de la 14A del spec §24, en claro, oscuro
y 390 px, y la pantalla de reporte solo con teclado. Anote en `CONTEXT.md` lo que no salga como dice
el spec.

- [ ] **Step 6: Commit**

```bash
git add docs AGENTS.md CONTEXT.md PLAN.md README.md
git commit -m "docs: cierre de la Fase 14A - manual, reglas y verificación final"
```

No se hace `push` ni `merge`: el usuario hace su recorrido y decide.

## Cobertura

**Demostración de la 14A (spec §24)**

| Paso del spec | Tarea |
|---|---|
| 1. Crear «Porcentaje», ver el semáforo, probar, enviar | 6, 7 |
| 2. «Fórmula libre» y fórmula mal escrita | 3, 6 |
| 3. Aprobar en bloque y devolver | 7 |
| 4. Ficha impresa frente al Excel | 16 |
| 5. Históricos en la tabla del año | 10 |
| 6. Un designado de rol Consulta reporta | 2, 9 |
| 7. Crítico con causa y acción; Atención; cumple | 9, 10, 13 |
| 8. «No aplica» | 9 |
| 9. Página del indicador, gráfica con hueco, acumulado, variables | 14, 15 |
| 10. Meta de un periodo futuro y de uno terminado | 10 |
| 11. Observación, respuesta y quién no la ve | 10, 11 |
| 12. Matriz del año y los dos Excel | 15, 16 |
| 13. Cierre, reapertura y «Corregida» | 12 |
| 14. Cambio mayor y cambio menor | 7 |
| 15. Indicador restringido | 2, 8, 15, 17 |
| 16. Regulatorio, su norma e «Indicadores que exige» | 6, 17 |
| 17. Vencido, aviso agrupado y escalamiento | 13 |
| 18. Retirar, duplicar y descartar | 8 |
| 19. Renombrar un cargo no cambia la ficha firmada | 6 |
| 20. Soporte `.xls` o Word rechazado, `.xlsx` aceptado | 2, 11 |

**Pruebas (spec §23)**

| Grupo del spec | Tarea |
|---|---|
| Intérprete y entradas hostiles | 3 |
| Reglas puras | 4, 14 (geometría) |
| Consultas y flujo | 5 a 12 |
| Lo que salió de la revisión del constructor | 6, 7, 8, 9, 10, 11 |
| Vencimientos | 13 |
| Visibilidad | 2, 9, 10, 11, 13, 15, 17 |
| Estructurales | 1 (`esquema`, `privilegios-bd`), 2 (`permisos`), 5 y 6 (`navegacion`, `acciones-permisos`), 11 (`proxy-matcher`), cada tarea (`bitacora-detalle`, `paginas-sesion`, `handlers-permisos`, `colores-fijos`, `textos-fijos`) |
| Pantallas | 6, 9, 14, 15, 16 |
| Excel | 16 |
| Semilla | 18 |
| 14B | Fuera de este plan |

**Review Focus:** 1 → Tareas 4 y 9; 2 → 4 y 9; 3 → 2, 9 y 13; 4 → 7, 9 y 12; 5 → 13, 15 y 17.
