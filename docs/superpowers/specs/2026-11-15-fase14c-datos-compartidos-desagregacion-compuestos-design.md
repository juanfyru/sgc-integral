# Fase 14C — Anexo al spec de la Fase 14: datos compartidos, desagregación y compuestos

Fecha: 2026-11-15. Estado: **decisiones del usuario tomadas el 2026-11-15** («1.2, 2.1, 3.1, 4.2, 5.1, 6.1, 7.1; las D
quedan»; «las maquetas están bien, sigue con la 5.1»; «sigue con 8.1»); el resto del documento espera su aprobación. Amplía el spec de la
Fase 14 (`docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md`, «spec 14»), su entrega complementaria
(`docs/superpowers/specs/2026-11-13-fase14a-rangos-e-importacion-design.md`, «14A-C») y el anexo de la 14B
(`docs/superpowers/specs/2026-11-14-fase14b-automaticos-y-regulatorios-design.md`, «anexo 14B»), y **manda sobre los tres
donde difieren**. Con esta entrega se cierra la Fase 14 del diseño maestro.

## 0. Cómo leer este documento

El anexo 14B dejó para este momento §14 (variables compartidas) y §18 (desagregación y compuestos) del spec 14, con una
lista de preguntas (su §12). El 2026-11-15 se volvió a revisar esas secciones contra el código, ahora con la 14B fusionada
(`main` en `44d8b9f`). Este anexo recoge lo que encontró la revisión, lo que decidió el usuario y lo que cambia de la letra
del spec 14. Lo que aquí no se menciona sigue como en el spec 14 y en el anexo 14B.

Marcas: **[Usuario, n]** es una decisión del usuario del 2026-11-15 (el número es el del tema); **[Usuario, Dn]** es una
de las dieciséis decisiones de Claude que el usuario aceptó ese día («las D quedan»); **[Claude, F14C-DCn]** es una
decisión de diseño que el usuario puede revisar (reunidas en §13, con su base: **ISO**, **ISO derivada**, **Regulación** o
**Práctica**); **⚠** marca lo que ajusta la letra de un punto aprobado; **[Constructor]** queda a criterio de quien
construya.

Vocabulario: **dato compartido** (o «dato») es una variable compartida del catálogo de §14; **periodo del dato** es su
valor para un periodo; **componente** es el indicador cuyo resultado toma una variable de otro; **compuesto** es el
indicador que tiene al menos una variable así; **variable propia** es la que digita quien mide el indicador; **variable
ajena** es la que no (un dato compartido o un componente); **mixto** es el indicador que tiene de las dos; **desagregado**
es el indicador que se captura por las categorías de una dimensión.

Las maquetas (no versionadas) están en `.superpowers/brainstorm/1472-1794754437/content/pantallas-14c.html`, numeradas del
9 al 15 para seguir a las de la Fase 14 (la 8 es la gráfica de un desagregado). El usuario las aprobó el 2026-11-15. Los
tres informes de la revisión contra el código, con archivo y línea, están en `.superpowers/sdd/2026-11-15-fase14c/`
(`revision-dato-compartido.md`, `revision-desagregacion.md`, `revision-compuestos.md`): el plan los usa para saber dónde
vive cada cosa.

## 1. Lo que encontró la revisión

1. **Nada de la 14C está construido.** Existen las cinco tablas vacías y las columnas `origen`,
   `variable_compartida_id`, `indicador_origen_id`, `toma`, `dimension_id` y `categoria_id`; nadie las escribe con un
   valor. Guardar una ficha devuelve toda variable a «propia» (el formulario y su esquema no conocen el origen de una
   variable ni la dimensión), aunque «Editar ficha» y «Crear a partir de este» sí copian esas columnas.
2. **«Quién digita» se decide por ficha entera.** La base común de la 14B pregunta en una docena de sitios si la versión
   es automática (la guarda de digitación, el soporte, `queFalta`, la lista, el cierre, la reapertura, «Reportes a tiempo»,
   las fotos, la publicación). Un indicador con un dato compartido o un componente es «manual»: heredaría la tarea de
   reportar, el vencido, el escalamiento y un formulario que deja digitar el valor ajeno.
3. **Los dos escritores de valores se pisan.** El de la persona borra toda letra que el formulario no manda; el del
   sistema borra todos los valores de la medición. En un indicador mixto cada uno borraría lo del otro. Y la llave del
   cálculo (`reportada_en`) no la puede girar nadie: reportar exige todas las letras.
4. **Un valor juntado o tomado no cabe exacto.** Los valores se guardan truncados a cuatro decimales y se leen con diez
   como máximo. Un promedio (7/3) o un cumplimiento (2/3) copiado así puede cambiar un «cumple» en el borde.
5. **El cierre y la reapertura no conocen dependencias.** El cierre bloquea por indicador, mira solo la fecha límite de la
   medición y no toca los datos; la reapertura es de una medición y rechaza un indicador retirado. Una medición cerrada
   no se recalcula (anexo 14B, §4).
6. **Marcar el compuesto como restringido no evita la fuga.** Quien ve un restringido es quien tiene asignado **su**
   proceso y **sus** designados; la audiencia del compuesto no es la del componente. El valor de cada variable se muestra
   hoy en la tabla del año, las gráficas por variable, el acumulado, el Excel del indicador, el impreso, la pantalla de
   reportar y el historial de «Corregida»; la ficha mostraría además el código y el nombre del componente.
7. **Nada congela qué categorías pide una medición.** Si la lista sale del maestro al leer, crear o desactivar una
   categoría cambia la completitud de toda medición abierta, y reabrir un periodo viejo pediría las categorías de hoy.
8. **«Sumar entre categorías» no tiene respaldo en la ficha.** «Cómo se junta» dice cómo pasa una variable a un periodo
   mayor, no entre categorías, y el intérprete admite `min`, `max` y `abs`.
9. **Solo dos consultas leen los valores de una medición, y las dos leen la fila sin categoría.** De ellas cuelgan la
   tabla del año, el acumulado, la matriz, los dos Excel, el impreso, las constancias y las gráficas: con el total escrito
   en esa fila, todo eso queda intacto.
10. **Hay un ciclo que el grafo de variables no ve:** «Objetivos cumplidos» lee otros indicadores por su objetivo, no por
    sus variables. Un compuesto que tome esa ficha y apunte a un objetivo de la misma clase se alimentaría a sí mismo.
11. **Las validaciones inversas no existen:** nada impide retirar, restringir o quitarle la meta a un indicador del que
    otro depende, y deshacer un lote con una ficha que otro indicador toma daría un error crudo de la base.
12. **El ciclo de imports de la 14B son tres funciones, no dos.** `publicacion.ts` importa de `operacion.ts` también
    `quitarConstanciasSinSoporte`; `CONTEXT.md` nombraba solo `recalcularPorSoporte` y `enCurso`.
13. **Las tablas de la 14C tienen referencias desde tablas en uso** (`indicador_variables`, `indicador_versiones`,
    `medicion_valores`): no se pueden tirar y recrear, se alteran en su sitio. Siguen sin `CHECK`, sin historial, sin
    marcas de escalamiento y sin unicidades que ignoren mayúsculas.

## 2. Decisiones del usuario (2026-11-15)

**Tema 1. El soporte de un dato compartido** («1.2»). El dato acepta su soporte (PDF, imagen o Excel), opcional; lo sube
quien lo reporta y lo ve quien ve los soportes de un indicador que lo usa. ⚠ Ajusta §14 («no tiene soportes propios»).
Exigir soporte por dato queda fuera.

**Tema 2. Después del cierre** («2.1»). Corregir o reportar tarde un dato cerrado, o reabrir la medición de un
componente, es una **reapertura en cascada**: el Administrador del SGC reabre con una justificación; la pantalla lista
antes todas las mediciones cerradas que lo usaron y al confirmar se reabren todas y quedan «Corregida». Las de
indicadores retirados no se tocan y se dice. El cierre del mes no cierra una medición cuyos datos no estén cerrados.
Confirma la letra de §14 y §18.2 (F14-DC35).

**Tema 3. Variables que no se suman entre categorías** («3.1»). Se mantiene el 11.2: el total siempre se calcula sumando.
El formulario lo advierte y no deja desagregar una fórmula libre con `min`, `max` o `abs`.

**Tema 4. Una categoría en Crítico con el total en Bien** («4.2»). Informativo, pero a la vista: la lista y la tabla lo
marcan y el aviso de resultado lo dice; no exige análisis. ⚠ Amplía §18.1 («el color de cada categoría es informativo»).

**Tema 5. Quién ve el valor de un componente restringido** («5.1», confirmado después de ver la maqueta 15). A quien ve el
compuesto pero no el componente se le muestra el resultado del compuesto, y el componente aparece como «Indicador
restringido», sin cifra ni nombre. La regla del 11.4 (si un componente es restringido, el compuesto también) se conserva.
El usuario aceptó el residuo: si a la persona se le oculta un solo componente, puede despejarlo con el resultado y la
fórmula; lo advierten el formulario y la aprobación.

**Tema 6. Un componente «No aplica»** («6.1»). Contagio: el sistema marca el compuesto «No aplica» con su motivo. Una
forma de fórmula que promedie solo los componentes medidos queda para la Fase 17.

**Tema 7. Maquetas antes del anexo** («7.1»). Hechas y aprobadas (9 a 15).

**Tema 8. Quién aprueba un compuesto que toma un indicador restringido** («sigue con 8.1», tras la revisión de este
anexo). Lo aprueba siempre Gerencia, sea cual sea su clasificación: quien firma debe ver lo que firma, y Gerencia siempre
ve lo restringido. ⚠ Ajusta §7.6 del spec 14 (una ficha operativa la aprueba el líder de su proceso).

**Las «D»** («las D quedan»): las dieciséis decisiones presentadas ese día quedan aceptadas. Son F14C-DC1 a DC16 de §13 y
van citadas en el texto como [Usuario, Dn].

## 3. La base común, por variable

La 14B dejó la base para «lo que nadie digita» (anexo 14B, §4). La 14C la conserva y la lleva **de la ficha a la
variable**.

### 3.1 Quién pone cada variable

[Usuario, D1.] Cada variable de una ficha manual tiene un origen: **propia** (la digita quien mide), **dato compartido**
(la reporta el responsable del dato, una vez) o **resultado de otro indicador** (la escribe el sistema). Una ficha
automática sigue como en la 14B: todas sus variables son del cálculo.

| Qué falta en una medición abierta | Lo que se ve | Para quien mide |
|---|---|---|
| Alguna variable propia | Por reportar | Tarea «Reportar», aviso previo, vencido y escalamiento, como hoy |
| Las propias están (o no hay) y falta una ajena | Falta un dato | Nada: ni tarea, ni aviso, ni vencido, ni escalamiento (anexo 14B, §4) |
| Están todas y el resultado no cumple | Falta el análisis | Tarea de analizar, como hoy |

- **Reportar lo propio no espera a lo ajeno.** Quien mide reporta sus variables aunque el dato no haya llegado
  («Reportar lo mío», maqueta 14). El resultado se calcula cuando están todas.
- **«Reportar lo mío» es un reporte** [Claude, F14C-DC41]: cuenta para «Reportes a tiempo» y, como hoy, un cambio mayor
  no puede regir sobre ese periodo (spec 14, §7.6). Si el valor ajeno no llega nunca, la medición se cierra «Sin dato»,
  como la de un indicador que nadie reportó; la ficha nueva rige desde el periodo siguiente.
- **La variable ajena no se digita.** En la pantalla de reportar aparece ya puesta, con quién la reportó y cuándo (si es
  un dato) o de qué indicador sale (si es un componente), y no se puede cambiar desde ahí [Usuario, 4.1 del 2026-11-10].
  El servidor rechaza un valor para una variable ajena.
- **Cada escritor toca lo suyo** [Constructor, con esta regla]: el de la persona solo escribe y borra variables propias;
  el del sistema escribe una variable ajena sin borrar las demás.
- **Un indicador sin variables propias no lo mide nadie** [Usuario, D1], como un automático: sin cargo ni designados
  para medir, sin tarea de reportar, sin soporte obligatorio, sin prueba con valores al enviarlo, con «El sistema» donde
  iría quien reportó y fuera de «Reportes a tiempo». Al aprobarse una versión así se quitan los designados «mide» y se
  apaga el soporte obligatorio, como en una automática. Sí se analiza. No se le pueden subir soportes: su evidencia son
  los soportes de sus datos (§4.6) y de sus componentes.
- **«Reportes a tiempo»** [Claude, F14C-DC22] sigue midiendo a quien mide: en un mixto cuenta el primer reporte de la
  persona; un indicador sin variables propias queda fuera, como los automáticos. La puntualidad de los datos compartidos
  no la mide ese cálculo.

### 3.2 El valor ajeno se copia, exacto

- **Un solo lugar para los valores** (anexo 14B, F14B-DC1): el valor de un dato compartido (juntado a la periodicidad del
  indicador) y el de un componente se **copian** a la medición, en la misma tabla de los valores digitados, sin usuario.
  `recalcularMedicion` sigue siendo el único camino de cálculo y no refresca nada por sí misma.
- **Con su fracción exacta** [Claude, F14C-DC17]: junto al valor (que se sigue guardando con cuatro decimales, para
  mostrarlo) se guarda la fracción exacta cuando el valor no cabe en ellos (un promedio, un cumplimiento, un acumulado).
  Solo la escribe el sistema y el cálculo la prefiere. Así «cumple» se decide con la razón exacta, como manda `AGENTS.md`.
- **Quién lo reportó no se copia:** el nombre de quien reportó un dato se lee del propio dato al pintar.

### 3.3 Cuándo se copia: propagación por pasada

[Claude, F14C-DC27 ⚠ ajusta §18.2, que decía «en la misma transacción».] Cuando un dato se reporta o se corrige, o cuando
cambian el resultado, el «cumple» o la meta aplicada de la medición de un componente, la acción guarda lo suyo y, en
seguida, una **pasada de propagación** lleva el valor a cada medición abierta que lo espera: una transacción por medición,
la que falla se registra y se salta, y vuelve a intentarse sola. Es la forma de `tomarFotos`.

- La pasada corre: justo después de la acción que cambió la fuente; en la pasada de vencimientos (después de abrir
  periodos y de tomar fotos); y antes de clasificar, en el resumen y en el cierre del mes.
- Es **idempotente**: compara el valor copiado con el de la fuente y solo escribe si difieren.
- Va **por niveles**: primero las mediciones que dependen de la fuente, después las que dependen de esas, hasta cinco.
- No toca mediciones **históricas** [Usuario, D3] ni **cerradas** (§3.5).
- La medición que depende **no bloquea** la de su fuente: la lee sin candado. El orden de candados de la 14A no cambia
  (indicador → medición → hijas, dentro de un solo indicador por transacción).
- **El evento es del sistema** [Claude, F14C-DC26]: en el historial de la medición figura «El sistema», con qué dato o
  qué componente cambió y el antes y el después; nunca la persona que tocó la fuente, que quizá no puede ver ese
  indicador. Cuando la fuente es un componente, el evento guarda la referencia y no el nombre, y se pinta según quién
  mira (§6.5): quien no ve el componente lee «Cambió un componente», sin nombre ni cifras de esa variable.
- Reprogramar la meta de un componente también propaga [Claude, F14C-DC25]: cambia su cumplimiento aunque no cambien su
  resultado ni su color.
- Por qué no en la misma transacción: una dependiente que falla abortaría el reporte de alguien que no tiene nada que
  ver, y sostener el candado del origen mientras se pide el del compuesto se cruza con el cierre del mes.

### 3.4 El plazo, «No aplica» y el denominador cero

- **El plazo del análisis** [Usuario, D2]: si el valor ajeno que completa la medición llega después de su fecha límite (o
  el plazo es 0) y la medición pasa a pedir análisis, la fecha límite se cuenta otra vez desde ese día, con el mismo
  plazo. Es la regla de la foto de la 14B (`laFotoMueveElPlazo`), y el cambio de plazo del indicador la respeta igual.
- **Lo mismo cuando la fuente no completa sino que cambia** [Claude, F14C-DC42]: si una propagación (un dato corregido,
  la meta reprogramada de un componente, lo recalculado tras una reapertura en cascada) deja pidiendo análisis a una
  medición que no lo pedía, y su fecha límite ya pasó, la fecha se cuenta otra vez desde ese día. Vale cada vez que un
  cambio ajeno la hace pasar de no pedirlo a pedirlo; no cuando ya lo pedía. Así nadie amanece con un vencido y un
  escalamiento por algo que otro cambió.
- **«No aplica» de la medición** sigue siendo de quien mide, si el indicador tiene variables propias.
- **Cuando el sistema completa una medición y no hay nada que medir** [Claude, F14C-DC30] (la fórmula divide por cero),
  la marca «No aplica» con el motivo «No hubo nada que medir en el periodo», como la foto de un automático. Si los
  valores cambian después, se recalcula y la marca se va sola.

### 3.5 El cierre y la reapertura

[Usuario, 2.1; Usuario, D2; Claude, F14C-DC21.] La regla que ordena todo: **una medición cerrada tiene cerradas todas sus
entradas.** Tiene una sola excepción, que el usuario aceptó con la 2.1: la medición cerrada de un indicador **retirado**
no se reabre cuando su fuente se reabre y se corrige; queda como estaba, y la lista de la reapertura lo dice.

- **El cierre del mes cierra también los periodos de los datos** que terminaron en ese mes o antes, salvo los que siguen
  dentro de su plazo. Antes de clasificar abre los periodos del dato que falten, como abre los de las mediciones.
- **Una medición no se cierra** mientras espera un dato o un componente que sigue en plazo (anexo 14B, F14B-DC4), ni
  mientras alguno de los periodos del dato o de las mediciones del componente que usa no esté cerrado o cerrándose en ese
  mismo cierre. Queda para el cierre siguiente y el resumen lo dice.
- **Sus entradas son lo que su valor usó:** los periodos del dato que se juntaron y las mediciones del componente que
  entraron a su valor (§6.3). Un histórico del componente que nadie registró no es una entrada y no frena el cierre.
- **Si el dato venció y no llegó**, su periodo se cierra «Sin dato» y las mediciones que lo esperaban, también. El
  resumen del cierre nombra a quien debía: quien mide, si faltó lo propio; los responsables del dato, si faltó el dato;
  o el indicador componente, si faltó su resultado.
- Antes de clasificar, el resumen y el cierre corren la pasada de propagación, y dentro de la transacción del cierre se
  comprueba que lo copiado coincide con la fuente; la que no coincida, espera.
- **Reabrir en cascada.** Reabrir un periodo cerrado de un dato (también para reportarlo tarde) o la medición cerrada de
  un componente lo hace quien administra, con una justificación de al menos 10 caracteres y sin clave. Antes de confirmar
  la pantalla lista (maqueta 13):
  - las mediciones cerradas que usaron esa fuente, por la versión con que se calcularon, y las que dependen de esas,
    hasta cinco niveles: **se reabren todas**, quedan «Corregida», cada una con su evento, su aviso y su entrada de
    bitácora, que dicen que fue por la fuente. Si la fuente es un componente, el evento y el aviso lo nombran solo a
    quien puede verlo (§6.5); a los demás les dicen «por un cambio en un componente»;
  - las que **no se reabren** y quedan como están: las de un indicador retirado y las de otra periodicidad;
  - como dato, cuáles pertenecen a un periodo cuya constancia ya se registró ante el ente. La constancia no cambia
    (guarda lo que se envió, anexo 14B §8) [Claude, F14C-DC24].
- Al confirmar, la propagación recalcula lo reabierto con el valor de hoy de la fuente.
- **Cerrar de nuevo** sigue siendo por medición (y por periodo del dato), con el siguiente cierre del mes o con el botón;
  el botón respeta la regla de arriba: no cierra una medición cuya fuente sigue abierta.
- Reabrir solo la medición de un compuesto o de un mixto sigue como hoy: deja corregir lo propio y el análisis.

### 3.6 Históricos

[Usuario, D3; tema 8 del 2026-11-10.] Los periodos anteriores a la primera aprobación se digitan **completos en cada
indicador**, también la variable que es un dato compartido o un componente; en un desagregado, solo el total. La historia
no se comparte, no se propaga y no abre periodos del dato.

- «No se propaga» habla de la medición que recibe: una medición histórica nunca recibe un valor de la propagación. Un
  histórico **registrado** de un componente sí cuenta en el acumulado de ese componente (§6.3).
- **Un indicador sin variables propias también tiene históricos**, y en esto no es como un automático: los registra
  quien los registra hoy (quien administra o el líder del proceso), digitando todas sus variables. La guarda que
  rechaza digitar en un indicador que nadie mide deja pasar los históricos de una ficha manual.
- **Los históricos de un compuesto los registra quien ve todos sus componentes** [Claude, F14C-DC38]: nadie digita el
  valor de un indicador que no puede ver. A quien no ve alguno, la acción le responde, sin nombrarlo, que esos históricos
  los registra el Administrador del SGC.

## 4. Datos compartidos (ajustes a §14)

### 4.1 El catálogo

Cada dato pertenece a un proceso y lo puede usar un indicador de cualquier proceso. Lo mantiene quien tiene
`indicadores.administrar`. Tiene: nombre (único en su proceso, sin distinguir mayúsculas), descripción (qué incluye y qué
excluye), fuente, unidad, **periodicidad**, **cómo se junta** (se suma, último valor o promedio), límites de captura,
«admite negativos», **plazo de reporte** en días (por omisión el de la entidad, de 0 a 90), dimensión (opcional, §5.7),
sus **responsables** (personas, con quién y cuándo las designó) y activo.

- **Lo que se congela** [Usuario, D5; Claude, F14C-DC34]: desde que una versión aprobada de alguna ficha cita el dato, su
  periodicidad, su «cómo se junta» y su dimensión no se pueden cambiar. Si hace falta otra cosa, se crea otro dato. Lo
  demás (nombre, descripción, fuente, límites, plazo, responsables) se edita siempre.
- Se desactiva solo si ningún indicador activo lo usa: ni su ficha vigente lo cita, ni tiene una medición sin cerrar
  regida por una versión que lo cita. Con valores no se borra.

### 4.2 En la ficha

- En cada variable se elige el origen (§6.1 para el tercero). Con «Dato compartido» se elige uno activo del catálogo; el
  servidor copia a la variable el nombre, la descripción, la fuente, la unidad, el «cómo se junta», los límites y «admite
  negativos» del dato, y guarda además su periodicidad.
- **Qué se firma** [Usuario, D5]: la referencia al dato y los textos copiados (nombre, unidad, periodicidad, «cómo se
  junta»). Renombrar el dato en el catálogo no cambia una ficha aprobada, igual que con los demás catálogos. Todo campo
  firmado nuevo se omite de la huella cuando es nulo, también dentro de las variables, para no cambiar la huella de lo ya
  aprobado.
- Poner, quitar o cambiar el dato de una variable es un **cambio mayor**.
- **Periodicidad** [Usuario, 4.3 del 2026-11-10]: la del indicador es la del dato o una que la contiene.
- Solo una cita **nueva** exige un dato activo; la que la ficha vigente ya traía sigue valiendo (el patrón de las normas,
  anexo 14B F14B-DC11).

### 4.3 Los periodos del dato

- **Qué periodos se piden** [Usuario, D4; Claude, F14C-DC28]: los del dato que caen dentro de una medición ordinaria (no
  histórica) y sin cerrar de un indicador activo, cuando **la versión que rige ese periodo** cita el dato. En una ficha
  nueva, eso empieza en el periodo en curso al aprobarse: un indicador anual aprobado en noviembre pide los meses del
  año, uno mensual pide desde noviembre. En un cambio mayor que añade el dato y rige desde un periodo anterior sin
  reportar, se piden también los de ese tramo.
- **No nacen vencidos:** un periodo del dato que ya había terminado cuando empezó a pedirse cuenta su plazo desde ese día.
- Un cambio mayor que quita el dato deja de pedir los periodos pendientes que ya ninguna medición necesita. Las
  mediciones de un indicador retirado no piden nada ni reciben propagación.
- La fecha límite es el fin del periodo más el plazo del dato. Lo ya abierto no cambia de fecha si después cambia el
  plazo [Constructor: puede moverla para lo que sigue en plazo, como hace el indicador].
- Se abren solos, como las constancias de la 14B: en la pasada, en «Datos compartidos» y en la página del dato.
- Cuando ningún indicador activo usa ya el dato, los periodos pendientes que nadie reportó dejan de pedirse.

### 4.4 Reportar y corregir

- **Quién** [Usuario, D4; Claude, F14C-DC35]: sus responsables y los líderes del proceso dueño. El Administrador del SGC
  solo si es uno de sus responsables o si no hay ningún responsable ni líder activo; entonces la tarea dice «sin
  responsable: designe a alguien» y el evento queda marcado. Es la regla de quien mide (spec 14, §6.1 y §6.3, F14-DC10:
  quien cierra el mes no produce los datos). Los mismos corrigen antes del cierre. Si el Administrador reabre un dato
  cerrado y además es quien lo reporta, el evento lo marca, como en una medición. Es una escritura con el permiso
  `indicadores.medir` **más** la condición de persona.
- **Tarea** «Reportar el dato *nombre*, *periodo*», con aviso previo, de vencido y de escalamiento al jefe, con los
  parámetros de §10.2 del spec 14. Tiene su propia pasada de vencimientos.
- **Se reporta una vez** (maqueta 12): un valor, con las validaciones de una variable (límites, negativos, cuatro
  decimales) y la confirmación cuando se aleja mucho del periodo anterior. No tiene «no aplica».
- **Corregir antes del cierre** [Usuario, D6]: sus responsables, sin justificación. Cada cambio deja el antes y el
  después en el historial del dato.
- **Después del cierre:** §3.5.
- Al reportar o corregir corre la propagación (§3.3): las mediciones que lo esperaban se calculan y salen sus alertas.

### 4.5 Juntar

El valor para el periodo del indicador es el dato juntado con su regla sobre los periodos que lo componen. Solo se copia
cuando están **todos** [§14]; mientras falte alguno, la medición sigue en «Falta un dato». Con «promedio» se guarda la
fracción exacta (§3.2).

### 4.6 El soporte del dato

[Usuario, 1.2 ⚠.] Cada periodo del dato admite soportes (PDF, imagen o `.xlsx`, como los de una medición), opcionales.

- Los sube y los quita quien puede reportar el dato, mientras el periodo no esté cerrado.
- Los ve quien ve el dato (§4.7) y quien ve los soportes de algún indicador que lo usa (`puedeVerSoportes`). Los demás
  reciben 404. Se sirven siempre como descarga.
- Es un dueño nuevo de `archivos` (el décimo contexto), con su ruta de subida fuera del `matcher` del proxy y su caso en
  `tests/proxy-matcher.test.ts`, como los demás.

### 4.7 «Datos compartidos» y quién ve qué

- **Pestaña nueva** de Indicadores (maqueta 11) y **página del dato** (maqueta 12), en `/indicadores/datos`; `datos` pasa
  a ser un código de indicador reservado [Claude, F14C-DC23].
- **Quién las ve** (spec 14, §6.4): quien administra, Gerencia, Control Interno, los líderes del proceso dueño y los
  responsables del dato. Para los demás no existen. El valor aparece además en la tabla de cada indicador que lo usa, a
  quien ve ese indicador.
- **«Lo usan»** muestra solo los indicadores que la persona puede ver, sin decir si hay más [Usuario, D6].
- **El historial del dato** (qué había, qué quedó, quién, cuándo y, tras una reapertura, por qué) lo ve quien ve el
  dato. Es de **solo inserción**.

## 5. Desagregación (ajustes a §18.1)

### 5.1 El maestro

En Configuración de indicadores: **dimensiones** (nombre único sin distinguir mayúsculas, orden, activa) y sus
**categorías** (nombre único dentro de su dimensión, orden, activa).

- Las categorías **se pueden reordenar**: su orden es el de la rejilla y el de las barras.
- «Borrar solo si vacío»: una dimensión que ninguna ficha ni dato usó; una categoría que ninguna medición ni dato usó.
  Si no, se desactiva.
- Una dimensión desactivada deja de ofrecerse en fichas nuevas. No se puede dejar sin categorías activas una dimensión
  que usa una ficha vigente.
- Renombrar no cambia lo ya firmado ni lo ya medido (§5.2 y §5.3).

### 5.2 En la ficha

- Campo «Desagregación»: ninguna o **una** dimensión activa [Usuario, 11.2 del 2026-11-10]. Es un cambio mayor. La ficha
  firma la referencia y el **nombre** de la dimensión (el nombre, omitido de la huella cuando es nulo).
- **Cruces que se rechazan** [Usuario, D11; Usuario, 3.1]:
  - con una ficha automática;
  - con una variable que es resultado de otro indicador;
  - con un dato compartido que no tenga esa misma dimensión (y, al revés, un dato con dimensión solo lo usa un indicador
    desagregado por ella);
  - con una fórmula libre que use `min`, `max` o `abs`.
- El formulario advierte: «El total se calcula sumando cada variable entre las categorías. Desagregue solo indicadores
  cuyas variables sean cantidades que se suman (casos, pacientes, pesos)».
- Lo importado entra sin desagregar; desagregarlo después es un cambio mayor.

### 5.3 Qué categorías pide un periodo

[Usuario, D7; Claude, F14C-DC20.] Cada medición de un indicador desagregado guarda **su propia lista** de categorías (id,
nombre y orden), que se fija cuando la medición se abre.

- **Qué entra a la lista** [Claude, F14C-DC40, precisa la D7]: las categorías creadas antes de terminar el periodo que
  están activas al abrir la medición o que se desactivaron después de empezar el periodo (el maestro guarda cuándo se
  creó cada una y cuándo se desactivó por última vez). Así la sede que cerró a mitad del periodo sí se pide, la lista
  casi no depende del día en que alguien abre la medición (que es después de terminar el periodo) y la de un trimestre
  concuerda con las de sus meses.
- Una categoría creada después de terminar el periodo entra en el siguiente; una desactivada se sigue pidiendo en el
  periodo en que se desactivó y en los ya abiertos (se marca «No aplica» si corresponde).
- Una categoría que se desactivó y se volvió a activar cuenta como activa todo el tiempo: el maestro no guarda los
  intervalos. Si no operó en un periodo intermedio, esa fila se marca «No aplica».
- **«Actualizar categorías»**: en una medición abierta sin reportar, quien administra puede añadir a la lista las
  categorías que hoy están activas y no estaban. Es para la sede que se registró tarde, después de terminar un periodo
  en el que sí operó. Solo añade: nada sale de la lista, y lo que sobre se marca «No aplica». Deja su evento.
- Al aprobarse un cambio mayor que cambia la dimensión, las mediciones abiertas sin reportar de su tramo rehacen su
  lista y pierden los valores a medias de la dimensión anterior.
- Una medición reabierta conserva su lista. La historia se ve siempre con las categorías y los nombres de entonces.

### 5.4 Capturar

Maquetas 9 (escritorio) y 10 (390 px: una tarjeta por categoría y el total fijo abajo).

- Una fila por categoría de la lista y una celda por variable propia. Cada fila responde al instante con su resultado y
  su color.
- **Estados de una fila** [Usuario, D8]: completa; **«Sin casos»**, cuando su fórmula divide por cero (la pone el
  sistema, sin motivo, y sus valores entran a la suma); o **«No aplica»**, marcada por la persona con un motivo (de 5 a
  500 caracteres), que no entra a la suma.
- **Guardar sin reportar** guarda lo que haya. Solo escribe las celdas que la persona cambió: dos personas pueden
  guardar partes distintas sin pisarse [Usuario, D9]. No hay responsables por categoría: mide quien mide el indicador.
- **Reportar** exige todas las filas completas, «Sin casos» o «No aplica». Si todas están «No aplica», la medición
  entera queda «No aplica» [Usuario, D8].
- Los límites de captura valen por celda. Los límites del resultado y la confirmación por variación valen solo para el
  total [Usuario, D10].
- El «No aplica» de toda la medición y el soporte siguen siendo de la medición, como hoy.
- Cada corrección deja en el historial la categoría y la variable que cambió, con su antes y su después, aunque el total
  no cambie.

### 5.5 El total

[Usuario, 11.2 y 11.3 del 2026-11-10; Claude, F14C-DC18.] El total de cada variable es la **suma** de las filas que no
están «No aplica». El sistema lo escribe en la medición, en la fila sin categoría, y `recalcularMedicion` calcula el
resultado, el color y «cumple» del total como en cualquier indicador. Por eso el semáforo, las alertas, el análisis, la
racha, la tabla del año, el acumulado, la matriz, los Excel, el impreso, «Objetivos» y la constancia al ente van **sobre
el total** sin cambiar.

### 5.6 Lo que se ve por categoría

- **Resultado, color y «cumple» de cada categoría** [Usuario, D10; Claude, F14C-DC19]: se calculan al leer, con la
  versión y la meta aplicada de esa medición. Llevan «Bien · no alcanza la meta» igual que el total, y la cifra nunca
  contradice el color.
- **Una categoría en Crítico** [Usuario, 4.2 ⚠; Claude, F14C-DC36]: la medición guarda cuántas categorías quedaron en
  Crítico. La lista y la tabla del año lo marcan («1 en Crítico», con el nombre de la dimensión a la vista); el aviso
  de resultado nombra las categorías; la pantalla de reportar lo dice (maqueta 9). No exige análisis, no cuenta para la
  racha y no pone «Requiere acción de mejora»: eso sigue sobre el total.
- **El aviso cuando el total no avisa** [Claude, F14C-DC39 ⚠ amplía §10.3 del spec 14, donde con Bien no se avisa a
  nadie]: si el total queda en Bien y alguna categoría queda en Crítico, sale un aviso informativo a
  quienes reciben los de Atención (quienes analizan y quienes hacen seguimiento): «*Indicador*: 85,9 %, Bien. En
  Crítico: Puesto de salud 3 (55 %). Octubre de 2026». Con el total en Atención o en Crítico, la alerta de siempre
  añade esa frase. Es un estado más para la «Corrección» de §10.3: si una corrección hace que aparezca o desaparezca,
  se avisa.
- **En la página del indicador:** una sección por categoría del periodo que se elija (por omisión, el último medido):
  barras acostadas con su color, la fila del total y la meta como línea (maqueta 8), con su tabla equivalente.
- **En el impreso:** el desglose del último periodo medido. **En el Excel del indicador:** una hoja nueva con todos los
  periodos del año por categoría; los nombres pasan por `neutralizarFormula`.
- El desglose lo ve quien ve el indicador.

### 5.7 Un dato compartido por categoría

[F14-DC27 del spec 14; Claude, F14C-DC33.] Un dato con dimensión se reporta con un valor por categoría, y cada periodo del
dato guarda su lista de categorías como una medición (§5.3). En el indicador desagregado manda la lista de la medición:
la variable toma en cada fila el valor del dato para esa categoría; si el dato es más fino, lo junta con los periodos en
que la categoría estaba en su lista. Con la regla de §5.3 las dos listas concuerdan; si aun así, con todos los periodos
del dato ya reportados, el dato no trae una categoría en ninguno, el sistema marca esa fila «No aplica» con el motivo
«El dato no trae esta categoría», porque en un indicador sin variables propias nadie más podría hacerlo.

## 6. Compuestos (ajustes a §18.2)

### 6.1 En la ficha

En una variable, el origen «Resultado de otro indicador» pide el indicador y qué se toma: su **valor** o su **porcentaje
de cumplimiento**. Es un cambio mayor.

- **Qué se puede tomar** [Usuario, D13]: un indicador activo con ficha vigente; también uno automático u otro compuesto.
  No uno en borrador: componente y compuesto no se aprueban en el mismo bloque (primero el componente). Solo una cita
  **nueva** exige esto; la que la ficha vigente ya traía sigue valiendo.
- **Se valida** al guardar (aviso temprano), al enviar y al aprobar (la garantía, dentro de la transacción):
  - no se toma a sí mismo, **sin ciclos** y con un máximo de **cinco niveles**, contando las fichas del mismo bloque de
    aprobación en lugar de las vigentes de sus indicadores;
  - la periodicidad del componente es la del compuesto o una más fina;
  - para tomar el cumplimiento, el componente tiene meta;
  - si un componente es restringido, el compuesto es restringido [Usuario, 11.4 del 2026-11-10];
  - un compuesto que toma, directamente o a través de otros compuestos, un indicador de «Objetivos cumplidos» no puede
    apuntar a un objetivo de esa misma clase [Usuario, D13]: cerraría un ciclo que las variables no muestran. El grafo
    cuenta esa arista;
  - un compuesto no es automático ni desagregado.
- **Qué se firma:** la referencia, qué se toma y, como texto, el código y el nombre del componente. Renombrar el
  componente no cambia la huella del compuesto.
- **Quién lo aprueba** [Usuario, 8.1 ⚠]: una ficha con algún componente restringido la aprueba **Gerencia**, sea cual sea
  su clasificación, y nunca quien la elaboró. Se resuelve al aprobar, no al enviar, como el resto de la regla de
  aprobadores (F14-DC19): si el componente pasa a restringido con la ficha ya enviada, la tarea, el aviso y «Por
  aprobar» pasan a Gerencia. Las demás fichas siguen como en §7.6 del spec 14.
- **Advertencia** [Usuario, 5.1]: al elaborar y al aprobar un compuesto con un componente restringido, la pantalla dice
  «Quien vea este indicador podrá deducir el resultado de «*componente*» si es el único componente que no puede ver».
- Una variable tomada no pregunta «cómo se junta»: §6.4.

### 6.2 El porcentaje de cumplimiento

[Usuario, D12; Usuario, 3.1 del 2026-11-14.] Función pura, con fracciones exactas, sobre la medición del componente: su
resultado, su «cumple», la meta que se le aplicó en ese periodo y la tendencia de la versión con que se calculó.

| Caso | Cumplimiento |
|---|---|
| La medición cumple su meta | 100 % |
| No cumple, «más es mejor» | resultado ÷ meta, acotado entre 0 y 100 % |
| No cumple, «menos es mejor» | meta ÷ resultado, acotado entre 0 y 100 % |
| No cumple, «mantenerse en un rango» | 0 % |
| No cumple y la razón no existe o es negativa (meta o resultado en cero o negativos) | 0 % |

Se entrega como un número de 0 a 100. «Bien · no alcanza la meta» no es 100 %: cumplir es alcanzar la meta.

### 6.3 El valor del periodo

- **Misma periodicidad:** el resultado exacto de la medición del componente en ese periodo, o su cumplimiento.
- **Componente más fino** [Usuario, D14]: su **acumulado propio** en el periodo del compuesto (spec 14, §8.10: se juntan
  sus variables y se aplica su fórmula; nunca se promedian resultados), saltando los periodos «No aplica». El
  cumplimiento de un acumulado se juzga contra la meta del último periodo medido, como el acumulado del año.
- **Qué se espera y qué no** [Claude, F14C-DC37]: se espera a que todos los periodos **ordinarios** del componente en
  ese tramo tengan resultado o «No aplica». Sus periodos **históricos** cuentan si alguien los registró y se saltan si
  no: nadie los debe, y el compuesto no puede esperar lo que no se le pide a nadie. Y si en ese tramo el componente
  cambió de fórmula o de variables, su acumulado cubre solo los periodos de la versión que rige al final, como dice
  §8.10. En los dos casos el valor es el acumulado del componente tal como él lo calcula, y junto a la variable se lee
  desde cuándo («acumulado de junio a diciembre»), a quien puede ver el componente.
- **Componente sin resultado todavía:** el compuesto está en «Falta un dato».
- **Componente «No aplica»** [Usuario, 6.1] (o todos sus periodos, si es más fino): el sistema marca el compuesto «No
  aplica». El motivo se guarda sin nombrar al componente y se pinta según quién mira: «*componente* no aplicó en el
  periodo» para quien lo ve y «Un componente no aplicó en el periodo» para quien no [Claude, F14C-DC29]. Si el componente
  deja de estar «No aplica», la propagación lo quita.
- **Componente cerrado «Sin dato»:** el compuesto sigue en «Falta un dato» y se cierra «Sin dato» (§3.5).

### 6.4 El acumulado del año

[Usuario, D14.] En el acumulado de un compuesto, cada variable tomada vale el **acumulado propio del componente** en ese
mismo tramo (su valor, o su cumplimiento contra la meta del último periodo medido); las propias se juntan con su regla.
Nunca se suman ni se promedian resultados. Si el acumulado del componente es parcial, el del compuesto lo es y lo dice.
Es el mismo cálculo en la página, la matriz, el impreso, el Excel y el resultado del periodo externo de una constancia.
Lo que se digitó para una variable tomada en un histórico del compuesto (§3.6) sirve solo para el resultado de ese
periodo: en el acumulado, la variable tomada sale siempre del componente.

### 6.5 Quién ve un componente restringido

[Usuario, 5.1; tema 9.3 del 2026-11-10: «para quien no puede verlo, no existe».] Regla única, en `src/lib/alcance.ts`:
**el valor y el nombre de una variable tomada los ve quien puede ver el componente** (`puedeVerIndicador`). A quien ve el
compuesto pero no el componente (maqueta 15):

- se le muestra el **resultado** del compuesto, su color, su análisis y sus demás variables;
- la variable aparece como **«Indicador restringido»** y su valor como **«No disponible»** en: la tabla del año, las
  gráficas por variable, los valores del acumulado, el Excel del indicador, el impreso, la pantalla de reportar, el
  historial de «Corregida» (el antes y el después de esa letra) y la ficha en todas sus formas (vista, impresa, hoja del
  Excel y control de cambios), que dice «Resultado de un indicador restringido» sin código ni nombre;
- ningún mensaje le nombra el componente: ni el motivo de «No aplica» (§6.3), ni los eventos y avisos de la propagación
  y de la reapertura en cascada (§3.3 y §3.5), ni las validaciones de §6.6;
- en sentido contrario, la página de un indicador no dice qué compuestos lo toman a quien no puede verlos.

Lo que el ocultamiento no tapa, y el usuario aceptó: con un solo componente oculto, su valor se despeja del resultado y de
la fórmula. Por eso la advertencia de §6.1. La bitácora la ven Administrador del SGC y Control Interno, que ven todo
[Constructor: confirmarlo al construir].

### 6.6 Lo que se bloquea

[Usuario, D15.] Con el mensaje «Cambie antes el indicador que lo usa» (con su código solo para quien puede verlo):

- **retirar** un indicador que alimenta a un compuesto activo (lo cita su ficha vigente, o la versión que rige alguna de
  sus mediciones sin cerrar);
- **restringir** un indicador que alimenta a un compuesto general, y **abrir** (pasar a general) un compuesto con un
  componente restringido;
- aprobar un **cambio mayor** del componente que le quita la meta cuando alguien toma su cumplimiento, que lo pasa a una
  periodicidad más gruesa que la de un compuesto, o que lo vuelve compuesto cerrando un ciclo;
- **deshacer un lote de importación** si otra ficha, aunque sea un borrador, toma una ficha del lote (motivo nuevo de
  `condicionDeDeshacer`).

Como entre guardar y aprobar el componente puede retirarse, perder la meta o volverse restringido, enviar y aprobar el
compuesto vuelven a mirarlo.

### 6.7 Lo demás

- **«Crear a partir de este»** [Usuario, D16] sobre un compuesto o sobre una ficha con datos compartidos: la copia nace
  con variables propias (conservan nombre, descripción y unidad), como la copia de un automático.
- **Objetivos:** un compuesto cuenta para su objetivo como cualquier indicador; ligarlo o no lo decide quien elabora.
- **Constancias e impactos por cambio de norma:** sin cambios; la constancia de un compuesto congela el acumulado de §6.4.

## 7. La primera tarea: el ciclo de imports

Antes de colgar nada de `alPublicarVersion`, se deshace el ciclo `publicacion → operacion → aprobacion → publicacion`
[Claude, F14C-DC32]: `quitarConstanciasSinSoporte` pasa a `constancias-soporte.ts`, y `enCurso` y `recalcularPorSoporte`,
a un módulo liviano nuevo, sin cambiar comportamiento. Queda una **prueba estática** que impide ciclos nuevos entre los
archivos de `src/db/consultas/indicadores/`; el par `mediciones ↔ alertas`, anterior a la 14B, queda como excepción
nombrada o se deshace [Constructor]. Los módulos nuevos de la 14C (propagación, datos, compuestos) son livianos: no
importan `lectura`, `fichas`, `aprobacion` ni `operacion`.

## 8. Datos: la migración `0015`

Aditiva sobre lo que la 14A y la 14B usan. Las cinco tablas de la 14C se **alteran en su sitio** (tienen referencias
desde tablas en uso), con la guarda de la `0013`: si alguna tuviera filas, la migración se detiene. Puede acabar en dos
archivos si la herramienta lo exige, como pasó con la `0013` y la `0014` [Claude, F14C-DC31]. Nombres provisionales.

| Qué | Cambio |
|---|---|
| `variables_compartidas` | Periodicidad, «cómo se junta» y plazo obligatorios y con `CHECK`; unicidad por proceso y nombre sin distinguir mayúsculas; quién y cuándo la creó |
| `variable_responsables` | Quién y cuándo designó; índice por usuario |
| `variable_valores` | `desde`, `hasta` y `vence_en` obligatorios; `estado` con `CHECK` (`pendiente`, `reportado`, `cerrado`) y su coherencia; fracción exacta; la lista de categorías del periodo (si el dato tiene dimensión); «corregido» y datos de la reapertura; `escalado_en`; `creado_en`; índice por (estado, `vence_en`) |
| `variable_eventos` | **Nueva**, de **solo inserción** (trigger y `REVOKE`): periodo del dato, tipo, quién (nulo si es el sistema), detalle (`jsonb`), cuándo |
| `dimensiones` | Orden y activa; unicidad sin distinguir mayúsculas |
| `dimension_categorias` | Unicidad dentro de la dimensión sin distinguir mayúsculas; índice por dimensión; cuándo se creó y cuándo se desactivó (§5.3) |
| `indicador_versiones` | Nombre firmado de la dimensión; `CHECK`: una automática no lleva dimensión |
| `indicador_variables` | Periodicidad del dato citado; código y nombre firmados del componente; `CHECK` de coherencia entre el origen, sus referencias y lo que toma; índices por dato y por componente |
| `medicion_valores` | Fracción exacta; índice por categoría. La unicidad con `NULLS NOT DISTINCT` se conserva (está escrita a mano en la `0011`: revisar la migración generada) |
| `mediciones` | La lista de categorías de la medición; cuántas categorías quedaron en Crítico |
| `indicadores` | [Constructor] un dato derivado de la ficha vigente para saber por SQL que nadie lo mide, si hace falta, como `calculo` |
| `archivos` | El `CHECK` del contexto admite el del dato compartido |
| `medicion_eventos` | [Constructor] el `CHECK` del tipo, si la propagación necesita uno propio |

`variable_eventos` entra a la regla 5 y al piso 10 de `AGENTS.md`, al `REVOKE` de `sgc_app` y a
`tests/privilegios-bd.test.ts`; al `TRUNCATE` de las semillas y al conteo de `tests/esquema-fase14.test.ts`. Un test de
esquema inserta hoy un origen «indicador» sin referencia: el `CHECK` nuevo obliga a tocarlo.

## 9. Lo que no entra

**No metas:** responsables por categoría; metas distintas por categoría; una segunda dimensión; variables que no se suman
entre categorías; el desglose por categoría en los históricos; soporte obligatorio por dato; «no aplica» de un dato;
historia compartida o propagada; medir la puntualidad de los datos; una forma de fórmula que promedie solo los componentes
medidos (Fase 17); desagregar un automático o un compuesto.

**Anti-metas** (sería un fracaso aunque funcione): una tarea, un vencido o un escalamiento para quien no debe nada; un
resultado cerrado distinto de sus datos, salvo el de un indicador retirado (§3.5); el nombre o la cifra de un restringido
a la vista de quien no puede verlo; un
total en verde que esconde una categoría en rojo sin ninguna señal; una ficha ya aprobada cuya huella cambia por esta
entrega.

## 10. Semilla, demostración y documentos

**Demo de la 14C** (sobre la de la 14B; es la parte de §22 del spec 14 que quedaba):

- Un **dato compartido mensual** con dos responsables, usado por un indicador mensual y otro trimestral, con periodos
  reportados (uno corregido, uno con soporte) y uno pendiente; uno de los dos indicadores es mixto.
- La dimensión **«Sede»** con cuatro categorías ficticias y un **indicador desagregado** con periodos medidos: en uno, el
  total en Bien con una sede en Crítico; en otro, una sede «Sin casos» y otra «No aplica».
- Un **compuesto** («Índice de desempeño del SGC») que toma el cumplimiento de indicadores del SGC, y otro, restringido,
  que toma un indicador restringido de otro proceso, para ver el ocultamiento con una cuenta de la demo que ve el
  compuesto y no el componente.
- Un mes cerrado que incluya un periodo del dato, para el recorrido de la reapertura.

**Demostración — el usuario debe poder:**

1. Crear un dato compartido con su responsable; crear un indicador con una variable propia y ese dato, enviarlo y
   aprobarlo. Reportar lo propio y ver «Falta un dato», sin tarea ni vencido para quien mide.
2. Como responsable del dato, verlo en «Mis tareas», reportarlo una vez con su soporte y verlo ya puesto en dos
   indicadores de distinta periodicidad, con su resultado calculado y su alerta.
3. Corregir el dato antes del cierre y ver el antes y el después en su historial y el recálculo en los indicadores.
4. Cerrar el mes; reabrir el dato cerrado, ver la lista previa y, al confirmar, las mediciones «Corregida».
5. Crear una dimensión con sus categorías y un indicador desagregado; reportarlo por sede en escritorio y a 390 px, con
   una sede «Sin casos» y otra «No aplica»; ver el total, la marca de la sede en Crítico, las barras por categoría y la
   hoja nueva del Excel.
6. Desactivar una categoría y ver que el periodo abierto la sigue pidiendo y el siguiente no.
7. Ver un compuesto recalcularse solo al corregir uno de sus componentes, y quedar «No aplica» cuando un componente no
   aplica.
8. Entrar con una cuenta que ve el compuesto restringido y no su componente: «Indicador restringido», sin cifra, en la
   página, el Excel y el impreso.
9. Intentar retirar un componente y ver el bloqueo.
10. Comprobar que una ficha aprobada antes de esta entrega conserva su huella y se puede volver a guardar.

**Documentos:** el capítulo 8 del manual gana «Datos compartidos», «Indicadores por sede o por servicio» e «Indicadores
compuestos», y ajusta «Cierre del mes»; `AGENTS.md`, `CONTEXT.md` (que además dice que falta aplicar la `0013` y la `0014`
a la base `sgc`, y que siguen ahí el worktree y la base de la 14B: ya no) y `PLAN.md`.

**Cambios a `AGENTS.md`:** el origen por variable y «un indicador sin variables propias no lo mide nadie»; cada escritor
toca lo suyo; el valor ajeno copiado con su fracción exacta; la propagación por pasada, sus tres momentos y que no bloquea
la fuente; «una medición cerrada tiene cerradas sus entradas» y la reapertura en cascada; `variable_eventos` en las tablas
de solo inserción; el contexto de `archivos` del dato compartido y su ruta de subida fuera del `matcher`; `datos` como
código reservado; la regla de quién ve un componente en `alcance.ts`; que un compuesto con un componente restringido lo
aprueba Gerencia; la lista de categorías congelada en la medición y el total que escribe el sistema; el aviso de una
categoría en Crítico con el total en Bien; el motivo nuevo de `condicionDeDeshacer`; la prueba estática de ciclos; y el
número de migraciones.

## 11. Pruebas

Además de las de cada pieza, estas no pueden faltar: la huella fijada de una ficha aprobada no cambia; un `cumple` de borde
con un promedio juntado y con un cumplimiento de 2/3 se decide con la fracción exacta; `queFalta` en los tres casos de un
mixto y en un indicador sin variables propias; ninguno de los dos escritores borra lo del otro; la propagación es
idempotente y salta históricas y cerradas; el cierre no cierra una medición con una entrada abierta; la reapertura en
cascada lista y reabre por niveles y deja fuera a un retirado; cada camino de §6.5 para quien no ve el componente (también
el Excel, el impreso y los eventos); un compuesto con un componente restringido lo aprueba Gerencia y no el líder; la
lista de categorías de un periodo con una sede creada tarde, una desactivada a mitad y «Actualizar categorías»; el aviso
con el total en Bien y una categoría en Crítico, y su «Corrección»; cada bloqueo de §6.6; un ciclo dentro de un mismo
bloque de aprobación y el de «Objetivos cumplidos» a través de otro compuesto; el soporte de un dato
responde 404 a quien no puede verlo; `variable_eventos` rechaza `UPDATE` y `DELETE`; la `0015` sobre una copia de la base
`sgc` conserva conteos y huellas. Las reglas de `AGENTS.md` para pruebas contra la base valen igual: nada de fichas
aprobadas, cierres ni lotes confirmados fuera de una transacción revertida.

## 12. Lo que queda al constructor

Los nombres definitivos de tablas, columnas, índices, tipos de evento y de aviso; la forma de los `jsonb`; dónde vive el
«No aplica» de una fila de categoría; los nombres y el corte de los módulos livianos; si hace falta un dato derivado en
`indicadores`; el diseño de las pantallas dentro del sistema visual y de las maquetas 8 a 15, y sus textos, salvo los que
este anexo fija entre comillas; el componente de barras acostadas, con su tabla equivalente; los límites de ritmo; el
mensaje legible si dos acciones se interbloquean; y los datos exactos de la demo.

## 13. Decisiones de Claude en este anexo (para revisar de una vez)

DC1 a DC16 son las «D» que el usuario aceptó el 2026-11-15. ⚠ = ajusta la letra de un punto aprobado.

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F14C-DC1 | Quién digita se decide por variable; un indicador sin variables propias no lo mide nadie | §3.1 | Evita tareas y vencidos falsos en un mixto | ISO derivada de 9.1.1 |
| F14C-DC2 | El valor ajeno que llega tarde mueve el plazo del análisis; si venció y no llegó, «Sin dato» y el cierre nombra a quien lo debía | §3.4, §3.5 | El análisis no puede nacer vencido por algo ajeno | Práctica (regla de la foto, 14B) |
| F14C-DC3 | Los históricos se digitan completos en cada indicador; en un desagregado, solo el total | §3.6 | La historia es opcional y digitada (tema 8) | Práctica |
| F14C-DC4 | El dato tiene plazo propio y se pide desde el periodo en curso; sin responsable, el líder del proceso dueño y después quien administra | §4.3, §4.4 | Un dato no amanece con periodos vencidos ni sin dueño | Práctica (F14B-DC8) |
| F14C-DC5 | La ficha firma nombre, unidad, periodicidad y «cómo se junta» del dato; esos dos y la dimensión se congelan en el catálogo | §4.1, §4.2 | Editar el catálogo cambiaría el cálculo de una ficha aprobada | ISO derivada de 7.5.3.2 |
| F14C-DC6 | Antes del cierre el dato se corrige sin justificación y con historial inmutable; «Lo usan» muestra solo lo visible | §4.4, §4.7 | Como la corrección de una medición (§8.7); tema 9.3 | ISO derivada de 7.5.3 |
| F14C-DC7 | Las categorías de un periodo se fijan al abrir su medición; «Actualizar categorías» en una sin reportar | §5.3 | Reabrir un periodo viejo no puede pedir las categorías de hoy | ISO derivada de 7.5.3.2 |
| F14C-DC8 | «Sin casos» la pone el sistema; el «No aplica» de una fila pide motivo; todas «No aplica» deja la medición «No aplica» | §5.4 | Una sede sin casos no puede bloquear a las demás | Práctica (4.4 de la 14B) |
| F14C-DC9 | Sin responsables por categoría; guardar no pisa lo de otro | §5.4 | Mide quien mide el indicador | Práctica |
| F14C-DC10 | Cada categoría lleva color y «no alcanza la meta»; desglose en la página, el impreso y el Excel; lo demás, sobre el total | §5.5, §5.6 | Ningún verde engaña, tampoco por categoría | 14A-C §3.1 |
| F14C-DC11 | No se desagrega un automático ni un compuesto; con dato compartido, misma dimensión; lo importado entra sin desagregar | §5.2 | La suma entre categorías no tiene sentido para un valor tomado o una foto | Práctica |
| F14C-DC12 | Cumplimiento: 100 % si cumple; si no, la razón acotada; 0 % en rango o sin razón | §6.2 | Cumplir es alcanzar la meta (3.1 de la 14B) | Usuario, 3.1 |
| F14C-DC13 | Se toma un activo con ficha vigente, también automático o compuesto; no un borrador; el ciclo oculto de «Objetivos cumplidos» se impide | §6.1 | Sin vigente no hay contra qué validar | Práctica |
| F14C-DC14 | De un componente más fino, su acumulado; el acumulado del compuesto usa el de cada componente | §6.3, §6.4 | §8.10: nunca se promedian resultados | Spec 14, §8.10 |
| F14C-DC15 | Se bloquea retirar, restringir, quitar la meta o engrosar la periodicidad de un componente, y deshacer un lote que otro toma | §6.6 | Un compuesto no puede quedar esperando algo que no llegará | Práctica |
| F14C-DC16 | «Crear a partir de este» copia con variables propias | §6.7 | La copia va a otro proceso y no se revalida | Práctica (copia de un automático) |
| F14C-DC17 | La fracción exacta se guarda junto al valor | §3.2 | Cuatro decimales cambian un «cumple» en el borde | Regla de `AGENTS.md` |
| F14C-DC18 | El total de un desagregado lo escribe el sistema en la fila sin categoría | §5.5 | Todo lo que lee valores queda intacto | Práctica (F14B-DC1) |
| F14C-DC19 | El resultado por categoría se calcula al leer | §5.6 | Sus entradas ya están congeladas; no ensancha el único camino de cálculo | Práctica |
| F14C-DC20 | La lista de categorías vive en la medición, con sus nombres | §5.3 | La protege el trigger de cerradas y guarda el nombre de entonces | Práctica |
| F14C-DC21 | Una medición cerrada tiene cerradas sus entradas; el cierre cierra también los datos | §3.5 | Un resultado cerrado no puede quedar distinto de sus datos | ISO derivada de 7.5.3.2 |
| F14C-DC22 | «Reportes a tiempo» cuenta el reporte de la persona en un mixto y excluye a los que nadie mide | §3.1 | Mide a quien mide | Práctica (F14B-DC16) |
| F14C-DC23 | `/indicadores/datos`; `datos` es código reservado | §4.7 | La ruta fija taparía un indicador con ese código | Práctica |
| F14C-DC24 | Una constancia registrada no cambia al reabrir; la lista lo señala | §3.5 | Guarda lo que se envió | Anexo 14B, §8 |
| F14C-DC25 | Reprogramar la meta de un componente propaga | §3.3 | Cambia su cumplimiento sin cambiar su resultado | Práctica |
| F14C-DC26 | El evento de la propagación es del sistema | §3.3 | No pone en el historial a alguien que quizá no ve ese indicador | Usuario, 9.3 |
| F14C-DC27 ⚠ | La propagación va por pasada, no en la misma transacción | §3.3 | Aísla fallos y no cruza candados con el cierre | Práctica |
| F14C-DC28 | Qué periodos del dato se piden; no nacen vencidos | §4.3 | Precisa la D4 para un indicador anual o trimestral | Práctica |
| F14C-DC29 | El motivo del «No aplica» por contagio se guarda sin nombre y se pinta según quién mira | §6.3 | El motivo no puede revelar un restringido | Usuario, 5.1 |
| F14C-DC30 | Si el sistema completa una medición y la fórmula divide por cero, «No aplica» | §3.4 | Nadie más puede marcarla | Usuario, 4.4 de la 14B |
| F14C-DC31 | La `0015` altera en su sitio y puede ser dos archivos | §8 | Hay referencias desde tablas en uso | Práctica |
| F14C-DC32 | El corte del ciclo son tres funciones y deja una prueba estática | §7 | Con dos, el ciclo sigue vivo | Práctica |
| F14C-DC33 | Un dato por categoría se junta con los periodos en que la categoría estaba | §5.7 | Una sede nueva no puede dejar el trimestre sin calcular | Práctica |
| F14C-DC34 | Lo congelado del catálogo queda congelado para siempre desde la primera versión aprobada que lo cita | §4.1 | Los periodos viejos se calcularon con eso | ISO derivada de 7.5.3.2 |
| F14C-DC35 | El dato lo reportan sus responsables y los líderes del proceso dueño; el Administrador del SGC, solo si es responsable o no hay nadie más, con marca | §4.4 | Quien cierra el mes no produce los datos (F14-DC10) | ISO derivada de 9.1.1 b) |
| F14C-DC36 | La medición guarda cuántas categorías quedaron en Crítico | §5.6 | La lista y los avisos lo dicen sin recalcular | Práctica |
| F14C-DC37 | El valor tomado de un componente más fino es su acumulado tal como él lo calcula: los históricos sin registrar se saltan y un cambio de fórmula lo acorta, y se dice desde cuándo | §6.3 | El compuesto no puede esperar lo que no se le pide a nadie | Spec 14, §8.10 |
| F14C-DC38 | Los históricos de un compuesto los registra quien ve todos sus componentes | §3.6 | Nadie digita el valor de un indicador que no puede ver | Usuario, 5.1 |
| F14C-DC39 ⚠ | Con el total en Bien y una categoría en Crítico sale un aviso informativo a quienes reciben los de Atención | §5.6 | Es lo que la maqueta 9 prometió; §10.3 no avisaba con Bien | ISO derivada de 9.1.3 |
| F14C-DC40 | La lista de un periodo son las categorías activas en algún momento de ese periodo | §5.3 | No depende del día en que se abre la medición; la sede que cerró a mitad del periodo sí se pide | Práctica (precisa la D7) |
| F14C-DC41 | «Reportar lo mío» es un reporte: un cambio mayor no rige sobre ese periodo | §3.1 | Conserva la regla de «rige desde» sin descartar lo que la persona ya entregó | Spec 14, §7.6 |
| F14C-DC42 | Un cambio ajeno que deja pidiendo análisis a una medición con la fecha ya pasada mueve su fecha límite | §3.4 | Extiende la D2 a la corrección, a la meta reprogramada y a la cascada | Práctica |
