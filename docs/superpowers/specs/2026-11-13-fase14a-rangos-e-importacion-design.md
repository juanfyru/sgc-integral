# Fase 14A, entrega complementaria: rangos por ficha, códigos del hospital e importación de indicadores

Fecha: 2026-11-13. Rama: `f14a-rangos-importacion` (sale de `main` con la 14A fusionada). Este documento amplía el
spec de la Fase 14 (`docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md`, en adelante «spec 14») y manda
sobre él donde difieren. Va antes de la 14B.

Las marcas dicen de dónde sale cada cosa: **[Usuario]** es lo que decidió el usuario en la conversación del
2026-11-13 (con sus palabras entre comillas cuando importan); **[Claude]** es una decisión de diseño que el usuario
no tomó y puede revisar; **[Constructor]** queda a criterio de quien construya. Las bases van como en el resto del
proyecto: *ISO 9001* con su numeral, *Regulación* o *Práctica*.

## 1. Para qué

El hospital va a empezar a usar el módulo de Indicadores con lo que ya tiene: una matriz institucional de 258
indicadores de todos sus procesos y subprocesos, aprobada por el Gerente (`SGC-TI-002`, versión 1, 11/09/2026), y
fichas descritas dentro de las caracterizaciones y los procedimientos. Hoy la app no le sirve para eso por tres
razones:

1. **Los rangos del semáforo.** La app calcula el límite de Crítico con un porcentaje (70 % por defecto) y hace que
   Bien empiece justo en la meta. En el hospital «los rangos se definen a criterio del creador» de cada ficha, se
   escriben al crearla, y Bien puede empezar antes de la meta («crítico: 0 - 40, atención: 41 - 90, bien: 91 - 100,
   meta: 100»). [Usuario]
2. **Los códigos.** El hospital codifica con la sigla del subproceso (`CNT-ID-001`, Gestión Contable); la app propone
   `GRF-IND-01` con la sigla del proceso. Las fichas nuevas deben seguir el esquema del hospital. [Usuario]
3. **La carga inicial.** Digitar 258 fichas una por una no es viable. Hay que importarlas, sin aprobarlas de nuevo:
   «solo indicar que estos indicadores fueron aprobados previos a la implementación de SGC Integral». [Usuario]

Éxito: el Administrador del SGC descarga la plantilla, el hospital vuelca en ella su matriz, la importación deja los
indicadores aprobados (y los propuestos en borrador) con sus rangos, en su proceso y subproceso y con el código del
hospital, sin una sola alerta falsa; y cualquier ficha nueva se crea escribiendo sus propios rangos.

## 2. Metas, no metas y anti-metas

**Metas**

- Parte A: los rangos del semáforo se escriben en la ficha, estado por estado, con signo y valor (opción B de los
  bocetos, elegida por el usuario), y «Cumple» se separa del color.
- Parte B: los subprocesos ganan sigla y las fichas nuevas reciben el código `SIGLA-ID-NNN` del hospital.
- Parte C: importación de fichas desde una plantilla Excel que trae la app, con vista previa, sin aprobación en la app
  y con la marca de aprobación previa.

**No metas**

- Importar resultados (mediciones). La matriz no trae resultados (sus columnas de resultado, cumple y semáforo están
  vacías) y la carga masiva de mediciones sigue rechazada (spec 14, tema 8). Los periodos anteriores se digitan como
  históricos, como hoy. [Usuario, tema 8; Claude: no hay datos que importar]
- Leer los Word (caracterizaciones y procedimientos). Describen los indicadores en texto corrido y no siempre
  coinciden con la matriz (ejemplo: «Conciliaciones realizadas» es mensual en la matriz, trimestral en
  `CNT-PR-002` y «mensual/trimestral» en `CNT-PC-001`). Quedan como consulta del hospital al llenar la plantilla.
  [Claude]
- Cambiar los códigos de los **documentos**. Los del hospital también usan la sigla del subproceso (`CNT-PR-001`),
  pero eso es del módulo documental y queda como observación para otra fase (§11).
- Designar personas en la importación (solo cargos, §7.6) y enlazar normas del normograma (el referente normativo
  entra como texto).

**Anti-metas** (sería un fracaso aunque funcione)

- Que un periodo en verde se lea como cumplido cuando no alcanzó la meta.
- Que la importación deje 258 indicadores con reportes vencidos, avisos a los jefes o escalamientos por periodos
  que nadie podía reportar en la app.
- Que una ficha importada quede con criterios de evaluación que nadie aprobó (§7.5). *ISO 9001 §7.5.2 c).*
- Que una ficha ya aprobada cambie de color o de resultado por esta entrega: las versiones aprobadas no cambian
  (AGENTS.md, reglas inviolables 5).

## 3. Parte A — Rangos escritos en la ficha

### 3.1 Cumple y color son dos cosas

- **Cumple** quiere decir que el resultado alcanza la meta, y nada más: en ascendente, resultado ≥ meta; en
  descendente, resultado ≤ meta; en «mantenerse en un rango», meta ≤ resultado ≤ meta hasta. Se decide con la
  fracción exacta, como el semáforo hoy. [Usuario: «no cumple, porque no alcanza la meta»]
- **El color** (Bien, Atención, Crítico) sale de los rangos escritos en la ficha. [Usuario]
- Un periodo que **no cumple pide análisis y cuenta como incumplimiento** para la racha del incumplimiento repetido,
  aunque su color sea Bien. [Usuario: «sí, pide análisis y cuenta como incumplimiento»]
- Un periodo en Bien que no cumple **avisa a quien analiza y a quien hace seguimiento, como un Atención**; las
  alertas fuertes (líderes del proceso y Administrador del SGC) siguen siendo solo de Crítico. [Claude: se le pide
  análisis, así que alguien debe enterarse; no se escala más que un Atención]
- Hoy `cumple` se deriva de `semaforo === "bien"` (por ejemplo `src/lib/indicadores/excel.ts:129`, la tabla del año,
  la lectura). Esa equivalencia desaparece en toda la app: tabla del año, «Último resultado», lista, matriz, gráfica,
  acumulado del año, Excel, ficha impresa, reporte y página del proceso leen `cumple` de su propio cálculo.
- **Ningún verde engaña:** donde se muestre un periodo en Bien que no cumple, el texto lo dice, por ejemplo «Bien ·
  no alcanza la meta (100 %)», y su nombre accesible también. No basta con el color ni con el glifo (AGENTS.md,
  accesibilidad; WCAG 1.4.1). [Claude; la frase exacta, Constructor]
- La regla de que la cifra mostrada nunca contradice el veredicto (`textoValor`, AGENTS.md) vale ahora para los dos
  veredictos: un 99,96 que no cumple la meta 100 no se muestra «100».

### 3.2 Cómo se escriben los rangos (opción B)

El usuario comparó tres formas en bocetos y eligió la **B: signo y valor en cada fila**. [Usuario: «opción B»]

- La ficha muestra, a la vista y sin «Cambiar rangos», una fila por estado: **Bien**, **Atención** y **Crítico**.
  Cada fila tiene un signo (`≥`, `>`, `≤`, `<` o «entre») y uno o dos valores («entre» pide dos y **incluye los dos
  extremos**). [Usuario: forma B; Claude: «entre» incluye los extremos]
- **Una fila con un solo signo llega hasta el rango mejor que tiene al lado.** «Bien ≥ 91 · Atención ≥ 41 · Crítico
  < 41» quiere decir Atención de 41 a menos de 91: es la forma en que el hospital escribe su regla («Alerta ≥ 90 % de
  la meta») y la que usa la importación (§5.5). Las filas se guardan **tal como se escribieron** (signo y valores) y
  la huella va sobre ellas; los límites efectivos se deducen al evaluar. [Claude]
- **Atención es opcional en cualquier tendencia**: la casilla «Este indicador no usa Atención» quita esa fila.
  [Usuario: «en menos es mejor también puede existir el rango de atención, sino que en este indicador no aplica»]
- Ejemplos del usuario: más es mejor, «Bien ≥ 91 · Atención entre 41 y 90 · Crítico ≤ 40», meta 100; menos es mejor
  sin Atención, «Bien ≤ 30 · Crítico > 30».
- **Mantenerse en un rango** (tendencia constante): no hay casos conocidos, «pero pueden existir». Usa la misma forma:
  Bien «entre» dos valores, y Atención y Crítico pueden ir a cada lado (por debajo y por encima), con las mismas
  revisiones. Reemplaza la «tolerancia» de hoy para las fichas nuevas. [Usuario: que exista; Claude: la forma]
- Son obligatorios cuando la ficha tiene meta. Sin meta, el indicador sigue «Sin meta», sin rangos ni colores.
- «Así quedará el semáforo» y la **Prueba** siguen: escriben los rangos en palabras y muestran el color y si cumple
  para los valores de ejemplo.

### 3.3 Cómo se evalúa un resultado

1. Se prueban los rangos en orden: Bien, luego Atención, luego Crítico; el primero que contiene el resultado da el
   color.
2. Un resultado que **cae entre dos rangos** toma el color del **peor** de los dos: con «Atención entre 41 y 90» y
   «Bien ≥ 91», un 90,5 es Atención, «porque no alcanza los 91». [Usuario]
3. Un resultado **más allá del rango de la punta** toma el color de esa punta: con «Bien entre 91 y 100», un 105 es
   Bien. Los valores imposibles se siguen controlando con los «límites del resultado» de la ficha. [Claude]
4. Todo con fracciones exactas (`Fraccion`), por el único camino de cálculo (`recalcularMedicion`).

### 3.4 Qué revisa el SGC al guardar

[Claude, salvo donde se indica; los mensajes exactos, Constructor]

- Los rangos van en el orden de la tendencia (en «más es mejor», Crítico abajo y Bien arriba; al revés en «menos es
  mejor»; en «mantenerse en un rango», Bien en medio) y no se cruzan más allá de compartir un extremo. «Cruzarse» se
  mide con lo escrito: «Atención entre 41 y 95» con «Bien ≥ 91» se rechaza (los dos dicen 91 a 95); «Atención ≥ 41»
  con «Bien ≥ 91» se acepta (§3.2: llega hasta donde empieza Bien). Cada fila, recortada por las mejores, tiene que
  dejar algo: «Atención ≥ 95» con «Bien ≥ 91» se rechaza.
- Un hueco entre dos rangos de **más de una unidad** se rechaza como error de digitación (de 40 a 60, sí; de 40 a 41,
  no). Con «entre 41 y 90» y «≤ 40», el hueco de 40 a 41 se acepta.
- **La meta cae dentro de Bien.** Bien puede empezar antes de la meta [Usuario: «hay casos en que bien empieza antes
  de la meta»], pero nunca después: si no, un resultado que cumple saldría en amarillo.
- Lo mismo para **una meta programada por periodo** (`Programar metas`): si queda fuera de Bien, se rechaza; los
  rangos no se mueven con la meta del periodo. Para otros rangos hace falta un cambio mayor.

### 3.5 Lo que ya existe

- Cambiar los rangos de una ficha aprobada sigue siendo **cambio mayor** (spec 14 §7.4).
- Las **versiones ya aprobadas conservan su regla** (relativa con umbral o «fijo» con límite de crítico), porque una
  versión aprobada no cambia (AGENTS.md). Pasan a la forma nueva con su siguiente cambio mayor, que parte de unos
  rangos equivalentes a su regla. Las fichas nuevas y los cambios mayores solo usan la forma B. [Claude]
- El **Umbral de atención (%)** de Parámetros deja de aplicarse a las fichas nuevas; la configuración lo deja de
  mostrar o lo rotula como «solo fichas anteriores». [Claude; cómo, Constructor]
- El semáforo, la frase, la gráfica (la punteada del límite), la matriz, el Excel y la ficha impresa leen la regla de
  la versión que rige el periodo, la vieja o la nueva. La ficha impresa y la página muestran los rangos **tal como se
  escribieron**: «Bien: ≥ 91 · Atención: 41 a 90 · Crítico: ≤ 40». [Claude]

## 4. Parte B — Sigla de los subprocesos y códigos del hospital

- Cada subproceso del mapa admite una **sigla** (opcional), que se edita en **Mapa de procesos** como la del proceso.
  Es única sin distinguir mayúsculas entre todas las siglas de procesos y subprocesos, con el mismo formato que la de
  un proceso, y `IND` e `ID` quedan reservadas. [Usuario: las fichas nuevas siguen el esquema del hospital; Claude:
  opcional y única]
- **Código propuesto de una ficha nueva:** `SIGLA-ID-NNN`, con la sigla del subproceso si la ficha tiene uno con
  sigla y, si no, la del proceso; el número es 1 + el más alto ya usado con ese prefijo, en cualquier estado (no se
  reusan), con tres cifras al menos (`CNT-ID-001`). Sigue siendo editable y único, y queda fijo desde la primera
  aprobación (spec 14 §7.1). [Claude: tres cifras y la regla del prefijo, tomadas de la matriz]
- **`ID` queda reservada** para los tipos de documento, igual que `IND` hoy (`exigirSiglaLibre`,
  `src/db/consultas/mapa-admin.ts:225`), para que `CNT-ID-001` no se confunda con un documento `CNT-PR-001`. La
  migración no falla si ya existiera un tipo con sigla `ID`: la reserva rige al crear o editar. [Claude]
- Los códigos `SIGLA-IND-NN` que ya existen siguen valiendo y no cambian.
- El formato de sigla de un proceso es de 2 a 4 letras (`src/lib/validaciones-mapa.ts:16`). Las 57 siglas de la
  matriz del hospital (`ADO`, `CNT`, `LAB`, `VAC`…) tienen tres letras: todas caben.

## 5. Parte C — La importación

### 5.1 Quién y dónde

**Configuración de indicadores → Importar**, para quien tiene `indicadores.administrar` (el Administrador del SGC).
Es una función de la app, no un script de una sola vez: sirve para la carga inicial y para otra entidad. [Usuario:
«retomar la creación de importar»; Claude: dónde y con qué permiso]

### 5.2 La plantilla

La app ofrece **Descargar la plantilla**: un `.xlsx` con una hoja «Indicadores» (una fila por indicador), listas
desplegables tomadas de los maestros y del mapa, y una hoja de instrucciones. El usuario pidió que se le indique si
hay que ajustar el formato de su matriz: **sí, el hospital copia sus filas a la plantilla** y separa lo que hoy viene
junto. [Usuario: «si es necesario ajustar el formato de excel para lograr la importación, me indicas»; Claude: la
plantilla]

Columnas [Claude; el orden, los nombres exactos y la hoja de instrucciones, Constructor]:

| Columna | Obligatoria | De dónde sale en la matriz del hospital |
|---|---|---|
| Código (`SIGLA-ID-NNN`) | Sí | «Código» |
| Nombre | Sí | «Nombre del indicador» |
| Proceso (sigla del mapa de la app) | Sí | Se deduce de «Proceso / subproceso» |
| Subproceso (nombre como en el mapa) | No | «Proceso / subproceso» |
| Tipo (lista) | Sí | «Tipo» |
| Clasificación (lista) | Sí | No está: la elige el hospital |
| Nivel (Estructura, Proceso, Resultado) | No | «Nivel» |
| Objetivo del indicador | No | No está (los Word lo traen en algunos casos) |
| Forma (Porcentaje, Tasa, Promedio o razón, Conteo, Fórmula libre) | Sí | Se deduce de «Fórmula» y «Unidad» |
| Variable A: nombre · Variable B: nombre | Según la forma | Se separan de «Fórmula» |
| Factor (100, 1.000, 10.000, 100.000) | En tasa | «Unidad» («Tasa x 1.000») |
| Cómo se junta A · Cómo se junta B (se suma, último valor, promedio) | No; por omisión, «se suma» | No está |
| Fórmula libre | En fórmula libre | «Fórmula» |
| Unidad (lista) | Sí | «Unidad» |
| Meta (número en la unidad: 95, no 0,95) · Meta hasta (solo «mantenerse en un rango») | Sí, salvo sin meta | «Meta» |
| Sentido (Ascendente, Descendente, Constante) | Sí | «Sentido» |
| Periodicidad | Sí | «Periodicidad» |
| Fuente | No | «Fuente» (va a cada variable) |
| Cargo responsable de medir | No | «Responsable de la medición» |
| Riesgo asociado | No | «Riesgo asociado» |
| Referente normativo | No | «Referente normativo» (va como requisito) |
| Inicio de medición (AAAA-MM) | No; por omisión, enero del año de la importación | No está |
| Estado (Aprobado, Propuesto) | Sí | «Propuesto» (Sí → Propuesto) |

«Cómo se junta» decide el acumulado del año (spec 14 §7.2; `src/lib/indicadores/acumulado.ts`) y, en una versión
aprobada, solo cambia con un cambio mayor. Por eso la hoja de instrucciones explica cuándo no se suma: una población,
un inventario o un total del Listado Maestro (algo que se cuenta en un momento) va como «último valor»; y la vista
previa muestra, en cada fila, cómo quedará el acumulado del año («suma de los periodos» o «el del último periodo»).
[Claude]

Lo que la matriz trae y la plantilla no pide: «N°», «Macroproceso», «Tablero del proceso» y las columnas de resultado,
cumple y semáforo (vacías).

### 5.3 El recorrido

1. **Subir** la plantilla llena. El archivo se valida por sus bytes, como todo `.xlsx` (AGENTS.md regla 6: solo
   `fileTypeFromBuffer`), con el mismo tope de tamaño que un soporte.
2. **Datos de la aprobación previa**, una vez para todo el lote: el documento que la aprobó (código y versión, por
   ejemplo `SGC-TI-002 v1`), quién aprobó (cargo y nombre) y la fecha (`11/09/2026`). [Usuario: «indicar que estos
   indicadores fueron aprobados previos a la implementación de SGC Integral»; Claude: los tres datos y que vayan por
   lote]
3. **La regla de rangos aprobada**, con los porcentajes de la matriz y sin escribirlos fila por fila: en ascendente,
   Atención desde el 90 % de la meta; en descendente, Atención hasta el 110 % de la meta (§5.5). Los dos valores son
   editables y quedan registrados con el lote.
4. **Vista previa:** una tabla con cada fila, lo que va a crear (código, nombre, proceso › subproceso, forma con su
   fórmula, meta, rangos en palabras, estado) y sus problemas. Nada se escribe todavía.
5. **Correspondencias:** lo que no coincide exactamente se resuelve una vez y vale para todas las filas que lo usen:
   un subproceso por nombre («Laboratorio Clínico» → «Laboratorio»), un cargo de la estructura, un tipo, una unidad.
   Si el código de una fila trae una sigla y su subproceso no tiene sigla, la vista previa ofrece dársela («CNT» a
   Gestión Contable). [Claude]
6. **Importar:** con las filas sin problemas, en una sola transacción: entra todo o nada. Pide la clave de quien
   importa (F13A-R4: validador de solo lectura antes, la clave fuera de la transacción, las comprobaciones repetidas
   dentro). [Claude: todo o nada y con clave; cómo se registra la firma, Constructor, §5.7]
7. **Resultado:** cuántas fichas aprobadas y cuántas en borrador se crearon, con enlace a la lista filtrada.

Problemas que bloquean una fila [Claude; la lista completa, Constructor]: un código repetido (en el archivo o ya
usado en la app, en cualquier estado), un proceso o subproceso sin correspondencia, una meta que no es número, una
fórmula que el intérprete no acepta, una forma que no cuadra con sus variables, una periodicidad o un sentido que no
existen. Una fila con problemas no se importa y la vista previa dice por qué; el resto sí puede importarse. Volver a
subir la misma plantilla no duplica nada: los códigos ya usados se reportan.

### 5.4 Fórmula y variables

Las formas de la ficha arman la fórmula como al crearla (spec 14 §7.3): un porcentaje es A ÷ B × 100 con A y B de la
plantilla; una tasa, con su factor; un promedio o razón, A ÷ B; un conteo, A; una fórmula libre pasa por el
intérprete (`src/lib/indicadores/formula/`, nunca `eval`). La plantilla separa la fórmula del hospital, «(N.° de
documentos con versión vigente publicada / N.° de documentos del Listado Maestro) x 100», en Variable A y Variable B:
la app no intenta leer la frase. [Claude]

### 5.5 Rangos de las fichas importadas

La matriz no trae rangos por indicador: trae la regla general que aprobó la Gerencia, «Semáforo ascendente: Cumple ≥
meta; Alerta ≥ 90 % de la meta; Crítico < 90 %. Descendente: Cumple ≤ meta; Alerta ≤ 110 %; Crítico > 110 %». Cada
ficha importada **toma esa regla escrita en la forma B**, para que ningún criterio quede sin aprobar; si un indicador
necesita rangos propios, se cambian después como cambio mayor, con aprobación en la app. [Usuario: «me sirve así, con
la regla aprobada»; *ISO 9001 §7.5.2 c)* y §9.1.1]

- Ascendente, meta 95: **Bien ≥ 95 · Atención ≥ 85,5 · Crítico < 85,5**.
- Descendente, meta 30: **Bien ≤ 30 · Atención ≤ 33 · Crítico > 33**.
- Si el porcentaje deja Atención vacía (meta 0 en descendente, que hay cinco en la matriz), la ficha queda sin
  Atención: **Bien ≤ 0 · Crítico > 0**. [Claude]
- «Mantenerse en un rango» no aparece en la matriz; si una fila lo trae, la vista previa la bloquea: sus rangos se
  escriben en la app. [Claude]
- El sustento de la meta de cada ficha dice de dónde salen sus rangos («Regla de la matriz SGC-TI-002 v1: Alerta ≥
  90 % de la meta»). [Claude]

### 5.6 Cargos, normas, nivel y riesgo

- El cargo responsable de medir se empareja con un cargo de la estructura y entra como cargo responsable de medir y de
  analizar. No se designan personas: hasta que el Administrador las designe, miden los líderes del proceso (spec 14
  §8.1). [Claude]
- El referente normativo entra como texto del requisito. Una ficha «Regulatoria» importada no exige norma enlazada
  hasta su siguiente cambio (la exigencia rige al editar). [Claude]
- **Nivel** y **Riesgo asociado** se vuelven campos de texto de la ficha (opcionales también al crear una), porque
  estaban en la matriz aprobada y la app no los tenía. Forman parte del contenido firmado de las fichas nuevas.
  [Claude]

### 5.7 Lo que queda de cada ficha importada

- Estado «Aprobado» → indicador activo con una **versión aprobada** de origen **importado**, con su huella calculada
  como cualquier versión aprobada (`huellaDeFicha`), los datos de la aprobación previa del lote y la fecha de
  importación. Estado «Propuesto» → borrador normal, que sigue el camino de aprobación de la app. [Usuario: sin
  aprobación en la app; Claude: los propuestos en borrador]
- La ficha (página, ficha impresa y Excel) dice **«Aprobada antes de la implementación de SGC Integral»** con el
  documento, quién aprobó y la fecha, y quién la importó y cuándo, en lugar de las firmas «Elaboró» y «Aprobó». El
  control de cambios la muestra como su primera versión. [Usuario; la redacción, Constructor]
- Queda constancia de quién importó con su clave en un **registro del lote** (quién, cuándo, método de la clave,
  archivo y su huella, porcentajes de la regla, datos de la aprobación previa, códigos creados), no en filas de
  `firmas`: una firma no se borra (FK `RESTRICT` y solo inserción) y eso impediría deshacer el lote (§5.9). Cada ficha
  dice quién la importó y cuándo leyendo su lote. El registro del lote no se modifica ni se borra, tampoco al
  deshacerlo: deshacer le añade su propio evento. [Claude, por §5.9]
- El Excel subido se guarda como soporte del lote (fuera del webroot, en el almacén, con su huella), con un contexto
  nuevo de `archivos` y su regla de acceso (solo quien administra indicadores). [Claude]
- Una entrada de bitácora por lote (`importo_indicadores`) con lo creado, con su frase legible en
  `src/lib/bitacora-detalle.ts` (lo exige `tests/bitacora-detalle.test.ts`). [Claude: el nombre]
- La aprobación previa no cuenta como «aprobación en la plataforma» para ningún indicador documental de la 13C.

### 5.8 Los periodos de antes de la importación

Para una ficha importada, los periodos que **terminaron antes de la fecha de la importación** son históricos (no la
fecha de la aprobación previa): no generan tareas, recordatorios, alertas, escalamiento ni la marca «Requiere acción
de mejora», y se digitan con «Registrar históricos», como hoy (spec 14 §8.8). El primer periodo que termina después
de la importación es el primero ordinario. Así la carga de septiembre a hoy no amanece vencida. [Claude: la anti-meta
de §2]

### 5.9 Deshacer la importación

Para un lote importado por error (metas escritas 0,95 en vez de 95, un sentido al revés, un porcentaje de la regla
equivocado), existe **Deshacer la importación**. [Usuario: «sí, inclúyelo con esa condición»; *Práctica:* como
«deshacer la carga» de los documentos (`deshacerCarga`); *ISO 9001 §7.5.3:* la trazabilidad queda en la bitácora y en
el registro del lote]

- **Condición** [Usuario]: ninguna ficha del lote tiene **datos reportados** ni **personas designadas**. El
  Constructor la traduce a filas, con este alcance mínimo [Claude]: ninguna medición del lote con valores, «no aplica»,
  análisis, soportes u observaciones (los históricos registrados también son datos); ninguna fila en
  `indicador_designados`; ninguna versión nueva después de la importada (ni borrador de cambio). Abrir periodos sin
  datos no impide deshacer.
- **Es del lote entero**, no ficha por ficha: si una sola ficha ya tiene datos, el botón no se ofrece y la pantalla
  dice cuáles lo impiden. [Claude]
- Lo hace quien tiene `indicadores.administrar`, con **motivo** (al menos 10 caracteres) y su **clave** (F13A-R4).
- **Borra** las fichas del lote (indicadores, versiones, variables, responsables, normas y mediciones sin datos) y
  **libera sus códigos**: un código de un lote deshecho no cuenta como usado. Las tablas inmutables no se tocan: si
  algo del lote ya dejó una fila en una de ellas, la condición no se cumple. [Claude]
- El trigger `sgc_impedir_si_version_aprobada` impide hoy borrar una versión aprobada. La excepción para el lote
  deshecho es la **más estrecha posible**: solo versiones de origen importado, solo dentro de la función que deshace
  y con la condición comprobada en la misma transacción con las filas bloqueadas; ningún otro camino la usa. Cómo se
  arma (por ejemplo, una marca de transacción que el trigger lee), Constructor, con su test de que un `DELETE`
  directo sigue rechazado. [Claude]
- Queda: el evento «deshecho» en el registro del lote (quién, cuándo, motivo), una entrada de bitácora
  (`deshizo_importacion_indicadores`, con su frase en `src/lib/bitacora-detalle.ts`) y el Excel subido como soporte.
- Después de deshacer, la misma plantilla corregida se puede importar otra vez con los mismos códigos.

## 6. Datos

[Claude; el esquema exacto, Constructor]

- Una migración nueva, **`0012`**: sigla de `subprocesos`; los rangos de la forma B en `indicador_versiones` (columnas
  o `jsonb`, con un `semaforo_modo` nuevo en su `CHECK`); nivel y riesgo asociado; origen de la versión y datos de la
  aprobación previa; el lote de importación (quién, cuándo, archivo, huella, porcentajes, resumen) con sus eventos
  (importado, deshecho), de solo inserción; el contexto nuevo de `archivos`; y la excepción estrecha del trigger de
  versiones aprobadas para deshacer (§5.9). Solo añade (AGENTS.md, piso 11).
- La 14B tenía reservada la `0012` para rehacer sus tablas vacías (spec 14 §19.5): pasa a la `0013`. `AGENTS.md`
  (párrafo de migraciones) y `PLAN.md` se actualizan.
- Las tablas nuevas que guarden evidencia van con trigger de solo inserción y sin `UPDATE`/`DELETE` para `sgc_app`
  (`src/db/roles-bd.ts`, `tests/privilegios-bd.test.ts`), y con su caso en las reglas 5 y el piso 10 de `AGENTS.md`.

## 7. Restricciones que no cambian

Las de `AGENTS.md` y el spec 14, en particular:

- Un solo camino de cálculo (`recalcularMedicion`) para el color y para «cumple»; la racha y su recálculo en cascada
  (`recalcularSiguientes`) cuentan «no cumple», no «no es Bien».
- Las versiones aprobadas no cambian (`sgc_impedir_si_version_aprobada`): ninguna migración reescribe su regla.
- El Excel que genera la app neutraliza fórmulas (`neutralizarFormula`), también la plantilla que se descarga.
- Las acciones nuevas pasan por `mutacion()` con su permiso (`tests/acciones-permisos.test.ts`); el handler de la
  subida va fuera del `matcher` de `src/proxy.ts`, usa `recibirArchivo` y compara `content-length`, con su caso en
  `tests/proxy-matcher.test.ts`.
- Nada de colores fijos ni de `opacity` para atenuar; la marca «no alcanza la meta» va en texto.
- Los tests no dejan confirmada una ficha aprobada ni un lote de importación: los hacen dentro de una transacción que
  se revierte; los usuarios de prueba con historia usan nombres `zz_…_${Date.now()}`.
- Los archivos del hospital (`F:\indicadores-importar\`, `INDICADORES_PROCESO_SGC_OK.xlsx`) nunca entran a un commit;
  los tests arman su propia plantilla sintética.

## 8. Demostración (qué probar)

1. Crear una ficha nueva con «Bien ≥ 91 · Atención entre 41 y 90 · Crítico ≤ 40» y meta 100; reportar 95 (verde,
   «no cumple», pide análisis), 90,5 (Atención) y 105 (Bien, cumple).
2. Crear una de «menos es mejor» sin Atención («Bien ≤ 30 · Crítico > 30») y ver la racha con dos periodos en 31.
3. Intentar rangos cruzados, con un hueco de 40 a 60 o con la meta fuera de Bien: el SGC lo rechaza junto al campo.
4. Dar la sigla CNT a Gestión Contable y crear una ficha en ese subproceso: propone `CNT-ID-001`.
5. Descargar la plantilla, llenarla con unas filas de la matriz (una con un subproceso de nombre distinto, una
   propuesta, una con código repetido), ver la vista previa, resolver la correspondencia e importar con la clave.
6. Ver una ficha importada: «Aprobada antes de la implementación de SGC Integral», sus rangos de la regla, sin tareas
   vencidas, con los periodos anteriores como históricos «Por registrar».
7. Deshacer el lote con motivo y clave: las fichas desaparecen, los códigos quedan libres, la bitácora lo cuenta, y la
   misma plantilla corregida entra otra vez. Con una ficha del lote ya reportada, el botón no se ofrece.
8. Las fichas de la demo de la 14A siguen con su color de siempre.

La semilla demo gana una ficha con rangos en forma B y un lote importado pequeño. [Claude]

## 9. Decisiones de Claude que el usuario puede revisar

1. Bien que no cumple avisa como Atención (no escala a líderes ni al Administrador).
2. «Entre» incluye sus dos extremos; más allá de la punta manda el rango de la punta.
3. Hueco de más de una unidad entre rangos: error.
4. Las metas programadas por periodo deben caer dentro de Bien; los rangos no se mueven con ellas.
5. Las versiones aprobadas conservan su regla vieja; la forma B rige para fichas nuevas y cambios mayores.
6. «Mantenerse en un rango» usa la forma B con Atención y Crítico a cada lado.
7. Sigla de subproceso opcional y única; código `SIGLA-ID-NNN` con tres cifras; `ID` reservada.
8. Plantilla propia en lugar de leer la matriz tal cual; la aprobación previa y la regla de rangos van por lote.
9. Importación todo o nada para las filas sin problemas, con clave.
10. Periodos terminados antes de la importación: históricos.
11. Nivel y riesgo asociado como campos de texto de la ficha.
12. No se designan personas al importar; los cargos sí.
13. Una fila de Atención con un solo signo llega hasta donde empieza Bien; las filas se guardan como se escribieron.
14. «Cómo se junta» cada variable es una columna opcional de la plantilla, «se suma» por omisión, con su explicación y
    su efecto en la vista previa.
15. Deshacer es del lote entero; la constancia de quién importó va en un registro del lote (no en `firmas`) para que
    deshacer sea posible; la excepción al trigger de versiones aprobadas es la más estrecha posible.

## 10. Lo que queda al constructor

El esquema exacto de la `0012`, el diseño de las pantallas (con las reglas de accesibilidad y de 390 px de siempre),
los textos de los mensajes, el formato de la plantilla (orden de columnas, hoja de instrucciones, validaciones de
datos), cómo se arma la excepción del trigger para deshacer (§5.9), y la partición en tareas del plan.

## 11. Observación fuera de alcance

Los documentos del hospital también se codifican con la sigla del subproceso (`CNT-PC-001`, `CNT-PR-001`), mientras
que la app arma los códigos de documento con la del proceso. Con la sigla de los subprocesos de la Parte B, alinear el
código documental es una decisión aparte para cuando el usuario la pida.
