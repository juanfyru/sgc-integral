# Fase 14B — Anexo al spec de la Fase 14: revisión contra el código, corte en 14B y 14C y ajustes

Fecha: 2026-11-14. Estado: **decisiones del usuario tomadas el 2026-11-14** («1.1, 2.1, 3.1 y 3.2, 4.1 con 4.4, 5.1 y 5.3;
las D quedan»); el resto del documento espera su aprobación. Amplía el spec de la Fase 14
(`docs/superpowers/specs/2026-11-10-fase14-indicadores-design.md`, «spec 14») y su entrega complementaria
(`docs/superpowers/specs/2026-11-13-fase14a-rangos-e-importacion-design.md`, «14A-C»), y **manda sobre los dos donde
difieren**. Sigue el plan `docs/superpowers/plans/2026-11-14-fase14b-automaticos-y-regulatorios.md`.

## 0. Cómo leer este documento

El spec 14 pidió que el plan de la 14B empezara por revisar §14 a §18 contra el código (§19.5, §27). Esa revisión se
hizo el 2026-11-14 sobre `main` en `f04b70b`, con la 14A y la 14A-C ya fusionadas. Este anexo recoge lo que encontró, lo
que el usuario decidió y lo que cambia de la letra del spec 14. Lo que aquí no se menciona sigue como en el spec 14.

Marcas: **[Usuario, n]** es una decisión del usuario del 2026-11-14 (el número es el de esa conversación); **[Claude,
F14B-DCn]** es una decisión de diseño que el usuario puede revisar (están reunidas en §13, con su base: **ISO**, **ISO
derivada**, **Regulación** o **Práctica**); **⚠** marca lo que ajusta la letra de un punto aprobado; **[Constructor]**
queda a criterio de quien construya.

Vocabulario nuevo: **automático** es un indicador de fuente automática (§15 del spec 14); **foto** es el valor que el
sistema toma de un cálculo para un periodo; **cálculo de estado** se mide a una fecha y **cálculo de flujo**, sobre un
periodo; **constancia** es el registro del envío de un indicador a un ente (§17.2); **impacto** es la revisión que pide un
cambio de norma sobre un indicador que la cita (§17.3).

## 1. Lo que encontró la revisión

1. **El módulo supone que todo valor lo digita quien mide.** Los valores se leen de un solo lugar y solo se calcula si
   alguien «reportó»; toda medición abierta sin datos genera la tarea «Reportar», el aviso de vencido y el escalamiento
   al jefe de quien mide (`queFalta`, `esPendiente`), y el resumen del cierre nombra a quien «debía medir». Un automático,
   un indicador con dato compartido o un compuesto producirían tareas y avisos falsos.
2. **Guardar una ficha la devuelve a «manual».** El formulario, su esquema y la escritura no conocen el origen
   automático, la variable compartida, el indicador de origen ni la dimensión; duplicar y abrir un cambio sí los copian.
3. **La huella de la ficha ya firma los campos de la 14B, hoy nulos, y un test fija su valor.** Un campo firmado nuevo
   debe omitirse cuando es nulo para no cambiar la huella de lo ya aprobado.
4. **Una medición cerrada no se recalcula.** Cualquier cascada que la alcance abortaría la acción que la disparó.
5. **El informe de la revisión anual no usa el umbral de conformidad ni guarda veredicto:** solo el porcentaje. §15.4 y
   F14-DC39 decían lo contrario.
6. **Los cálculos de la 13C viven dentro de una sola consulta atada a la sesión**, no hay camino «de sistema», y la
   conformidad «del periodo» solo sale como texto. Los acuses de un periodo viejo no se reconstruyen (los pendientes de
   una versión reemplazada dejan de contarse) y los eventos del trámite solo guardan su fecha límite desde la 13C.
7. **Con la foto al terminar el periodo, «Objetivos cumplidos» y «Reportes a tiempo» saldrían siempre vacíos:** se
   calcularían el día 1, antes de que nadie reporte. Y un periodo sin nada que medir (denominador cero) dejaría la
   medición abierta sin que nadie pudiera marcarla.
8. **Las fichas del usuario no miden lo que el spec les asignó:** `SGC-IND-05` mide documentos conformes en un muestreo,
   no puntos de uso, y el denominador de `SGC-IND-03` es «objetivos definidos».
9. **Dos defectos en lo ya fusionado:** la página de impactos de la 13C responde «no encontrado» si el cambio de norma
   no tiene impactos de documentos o de proceso para ese proceso, y tras «No afecta» sobre una norma derogada la ficha no
   se puede volver a guardar (`revisarContraLaBase` rechaza toda norma citada que no esté vigente o modificada).
10. **«Se reporta a un ente» no es un estado definido** (tres campos opcionales sueltos, sin relación con la
    periodicidad de medición), y como esos campos son un cambio menor, «no se generan constancias para periodos
    anteriores a la aprobación» abriría todos los periodos externos de una ficha antigua, ya vencidos.
11. **Las ocho tablas de la 14B** no tienen `CHECK` de sus estados, les faltan marcas de escalamiento e historial, y
    `calculo_fotos` duplicaría lo que la medición ya guarda.
12. **Para la 14C:** marcar el compuesto como restringido no impide que alguien de su proceso vea el resultado de un
    componente restringido de otro proceso; un valor juntado o tomado de otro indicador no cabe exacto en los cuatro
    decimales con que se guardan los valores; nada congela qué categorías pide una medición desagregada (§12).

## 2. Decisiones del usuario (2026-11-14)

**Tema 1. Corte en entregas** («1.1»). Dos entregas, primero lo automático y lo regulatorio. ⚠ Ajusta el 14.1 del
spec 14 (dos entregas, 14A y 14B): ahora son tres.

**Tema 2. Conformidad en puntos de uso** («2.1»). Una sola meta: si el cálculo «Conformidad en puntos de uso, a la
fecha» tiene ficha, Distribución y la tarjeta de Vigencia usan la meta de la ficha; el «umbral de conformidad» de
Configuración documental queda en solo lectura. Es la opción 1 de §15.4, que el spec 14 dejó para este momento.

**Tema 3. Qué es «cumplir»** («3.1 y 3.2»).

- 3.1 Un objetivo está «Cumplido» si todos sus indicadores medidos **alcanzan la meta**; un «Bien · no alcanza la meta»
  no lo da por cumplido. ⚠ Ajusta el 12.7 («están en Bien»), escrito antes de la 14A-C.
- 3.2 La tarjeta de Vigencia con ficha sigue diciendo «cumple» o «no cumple», frente a la meta de la ficha; los tres
  colores quedan en la ficha.

**Tema 4. Cuándo calcula el sistema un automático** («4.1 con 4.4»). ⚠ Ajusta el 6.2.

- 4.1 Los cálculos de **flujo** se toman al vencer el plazo de reporte del indicador (10 días por omisión; con plazo 0,
  al terminar el periodo); hasta el cierre del mes el Administrador del SGC puede «Volver a calcular». Los de
  **estado** siguen como en el spec 14: una sola vez, al terminar el periodo.
- 4.4 Un periodo sin nada que medir lo marca el sistema **«No aplica»** con su motivo, en vez de dejarlo «Sin dato».

**Tema 5. Las fichas `SGC-IND-03` y `SGC-IND-05`** («5.1 y 5.3»).

- 5.1 «Objetivos cumplidos» divide por los objetivos **con medición** en el periodo: «sin medición» no es «no cumplido».
- 5.3 `SGC-IND-05` se queda manual, como está; la conformidad en puntos de uso tiene su ficha aparte, automática.

**Las «D»** («las D quedan»): las once decisiones de Claude que cambian la letra del spec, presentadas ese día, quedan
aceptadas. Son F14B-DC1 a DC11 de §13.

## 3. El corte: 14B y 14C

Reemplaza la fila «14B» de §5.1 del spec 14. Un solo spec (el 14, con este anexo); cada entrega con su plan, su rama, su
PR, su demostración y su recorrido del usuario. **La Fase 14 del spec maestro se cierra cuando se fusiona la 14C.**

| Entrega | Qué incluye | Secciones del spec 14 | Migración |
|---|---|---|---|
| **14B — Lo que el sistema ya sabe y lo regulatorio** | La base común de §4; fuente automática con sus diez cálculos y su enlace a Vigencia y a Distribución; página «Objetivos»; constancias de envío al ente; impactos por cambio de norma sobre indicadores | §15, §16, §17.2, §17.3 | `0013` y `0014` |
| **14C — Datos compartidos, desagregación y compuestos** | Variables compartidas; maestro de dimensiones e indicadores desagregados; compuestos | §14, §18 | `0015` |

Las `0013` y `0014` rehacen solo las tablas vacías que usa la 14B (§10); las de la 14C (`variables_compartidas`,
`variable_responsables`, `variable_valores`, `dimensiones`, `dimension_categorias`) siguen vacías y sin uso, y la `0015`
puede rehacerlas con la misma salvedad de §19.5. Las preguntas que la revisión dejó para la 14C están en §12; se
deciden al planearla.

## 4. La base común (la carga la 14B y la reutiliza la 14C)

- **Un solo lugar para los valores** [Claude, F14B-DC1]. Lo que nadie digita lo escribe el sistema en
  `medicion_valores`, la misma tabla de los valores digitados, sin usuario (`reportado_por` nulo), y lo calcula
  `recalcularMedicion`, que sigue siendo el único camino de cálculo. Así la tabla del año, el acumulado, la matriz, el
  Excel, el impreso y el trigger de mediciones cerradas no cambian.
- **`recalcularMedicion` no refresca nada por sí misma:** calcula con los valores que la medición tiene. Cuándo se
  escribe un valor ajeno depende de su fuente: la foto de estado, una sola vez; la de flujo, en su momento y con
  «Volver a calcular», hasta el cierre; el dato compartido y el componente de un compuesto (14C), cuando la fuente
  cambia y al reabrir la dependiente.
- **«Falta un dato»** [Claude, F14B-DC3]. Una medición abierta que espera un valor que no digita quien la mide está en
  «Falta un dato» (el estado de §8.5 del spec 14, hoy sin uso): no genera la tarea «Reportar», ni el aviso previo, ni el
  de vencido, ni el escalamiento al jefe, y nunca se muestra «Vencida» por eso. Cuando el valor llega, se calcula el
  resultado, salen las alertas y, si no cumple la meta, la tarea de analizar, con las reglas de siempre.
- **Nadie mide un automático.** Las acciones que digitan (reportar, guardar sin reportar, «no aplica», registrar
  históricos, subir o quitar un soporte) rechazan una medición cuya ficha vigente en ese periodo es automática: «Este
  indicador lo calcula el sistema: sus datos no se digitan». Lo que antes iba a quien mide (el aviso de reapertura,
  «quién debía» en el resumen del cierre) va a quien analiza o dice «El sistema».
- **El cierre** [Claude, F14B-DC4 ⚠]. Antes de clasificar, el resumen y el cierre del mes toman las fotos que estén
  pendientes. Una medición cerrada nunca se recalcula en silencio. En la 14C, el cierre no alcanzará una medición que
  espera un dato que sigue dentro de su plazo.
- **Orden de candados.** Se conserva el de la 14A: indicador (`FOR SHARE`) → medición (`FOR UPDATE`) → filas hijas. Una
  constancia se bloquea después de su indicador; un impacto, solo su fila.

## 5. Fuente automática (ajustes a §15)

### 5.1 El registro de cálculos

Lista fija en `src/lib/indicadores/calculos/`. Cada cálculo declara su clave, nombre, clase, forma, variables (con su
nombre, su descripción y cómo se juntan en el acumulado del año), alcances, tendencia, si se llena hacia atrás y el
motivo con que se marca «No aplica» cuando no hay nada que medir.

| Clave | Nombre | Clase | Forma | A | B | Junta | Alcances | Tendencia | Hacia atrás |
|---|---|---|---|---|---|---|---|---|---|
| `dentro_plazo` | Documentos dentro de su plazo de revisión | Estado | Porcentaje | Documentos vigentes dentro de su plazo | Documentos vigentes con fecha de revisión | Último | Entidad, proceso | Ascendente | No |
| `vencidos` | Documentos con revisión vencida | Estado | Conteo | Documentos vigentes con la revisión vencida | — | Último | Entidad, proceso | Descendente | No |
| `aprobacion` | Tiempo de aprobación | Flujo | Promedio o razón | Días entre la aceptación y la publicación, sumados | Trámites publicados | Suma | Entidad, proceso | Descendente | Sí |
| `acuses` | Acuses de lectura confirmados | Flujo | Porcentaje | Acuses confirmados | Acuses confirmados y pendientes | Suma | Entidad, proceso | Ascendente | No |
| `conformidad_fecha` | Conformidad en puntos de uso, a la fecha | Estado | Porcentaje | Puntos conformes en su última verificación | Puntos verificados | Último | Entidad | Ascendente | No |
| `conformidad_periodo` | Conformidad en puntos de uso, del periodo | Flujo | Porcentaje | Verificaciones conformes cerradas | Verificaciones cerradas | Suma | Entidad | Ascendente | Sí |
| `externos` | Externos verificados al día | Estado | Porcentaje | Externos vigentes al día | Externos vigentes con fecha de verificación | Último | Entidad, proceso | Ascendente | No |
| `etapas` | Etapas del trámite cerradas en plazo | Flujo | Porcentaje | Etapas cerradas en plazo | Etapas cerradas con fecha límite | Suma | Entidad, proceso | Ascendente | Sí |
| `reportes_a_tiempo` | Reportes de indicadores a tiempo | Flujo | Porcentaje | Mediciones reportadas dentro de su plazo | Mediciones con fecha límite en el periodo | Suma | Entidad, proceso | Ascendente | Sí |
| `objetivos_cumplidos` | Objetivos cumplidos | Flujo | Porcentaje | Objetivos cumplidos | Objetivos con medición en el periodo | Último | De calidad, institucionales, todos | Ascendente | Sí |

- **La tendencia la fija el cálculo** [Claude, F14B-DC12 ⚠ ajusta §15.2, que la dejaba editable]: el sentido de los diez
  es inherente, y así la tarjeta de Vigencia y la ficha nunca juzgan al revés.
- **«Para un proceso» es el proceso de la propia ficha** [Claude, F14B-DC13]: no se elige otro. La ficha guarda el
  alcance como una clave (`entidad`, `proceso`, `calidad`, `institucional`, `todos`).
- **La unidad se elige del maestro**, como en cualquier ficha [Claude, F14B-DC14 ⚠ ajusta §15.2]: el maestro es de la
  entidad y el cálculo no puede fijar una de sus filas; el formulario propone «Porcentaje», «Días» o «Número».
- **«Tiempo de aprobación»** entrega los días sumados (con un decimal) y los trámites publicados: el resultado de la
  ficha es su razón exacta. La tarjeta de Vigencia sigue mostrando su promedio como hoy [Claude, F14B-DC15].
- **Hacia atrás (8.4)** [Claude, F14B-DC5 ⚠]: solo los cálculos que se reconstruyen fielmente. `acuses` no (un periodo
  viejo saldría casi en 100 %): su serie empieza al aprobarse la ficha, como la de un cálculo de estado. `etapas` se
  llena hacia atrás, y los periodos anteriores a la 13C quedan «No aplica» porque sus etapas no tienen fecha límite.

### 5.2 Los dos cálculos nuevos

**«Reportes de indicadores a tiempo»** [Claude, F14B-DC16]. Sobre las mediciones cuya fecha límite cae en el periodo:

- Denominador: las mediciones ordinarias (no históricas) de indicadores que alguien digita (los automáticos no cuentan),
  sin las de otra periodicidad que dejó un cambio mayor ni las que seguían sin reportar cuando el indicador se retiró
  antes de su fecha límite.
- Numerador: las que tuvieron su **primer** reporte o «no aplica» en su fecha límite o antes (lo dice el primer evento
  `reporte` o `no_aplica` de su historial, no la fecha de reporte, que una corrección puede borrar). Las nunca
  reportadas cuentan como tarde.
- Con alcance «proceso», solo las de indicadores de ese proceso. Cuenta también los restringidos.

**«Objetivos cumplidos»** [Usuario, 3.1 y 5.1; Claude, F14B-DC17]. Para el periodo que se calcula:

- De cada indicador activo cuya ficha vigente apunta a un objetivo activo de la clase del alcance, se toma su **última
  medición cuyo periodo termina dentro del periodo**, con resultado y con meta (sin «no aplica», «sin dato» ni «sin
  meta»). No entran los indicadores cuya ficha vigente usa este mismo cálculo.
- Un objetivo está **cumplido** si todas esas mediciones alcanzan la meta (`cumple`; una medición anterior a la `0012`
  se lee como siempre, Bien ⇔ cumple).
- Numerador: objetivos cumplidos. Denominador: objetivos con al menos una medición tomada.
- Cuenta todos los indicadores, también los restringidos: entrega un conteo, no nombres.

La página «Objetivos» (§7) usa la misma regla sobre los indicadores que la persona ve.

### 5.3 La ficha automática

- En el formulario se elige **«Lo calcula el sistema»**, el cálculo y su alcance. La forma, la fórmula, las variables
  (con el nombre y la descripción del registro, que quedan firmados en la versión) y la tendencia las pone el cálculo y
  no se editan. La unidad, los decimales, la meta, los rangos, la periodicidad, los límites del resultado y el resto de la
  ficha, sí. No se piden la prueba con valores ni un cargo responsable de medir; el de analizar, sí.
- **Datos de operación:** nadie se designa para medir (al aprobarse una versión automática se quitan los designados
  «mide» que hubiera, y la bitácora lo dice); «soporte obligatorio» no aplica; el **plazo de reporte** es, para un
  cálculo de flujo, los días que el sistema espera después del fin del periodo para calcular, y en todos, la fecha
  límite del análisis.
- **A lo sumo una ficha activa por cálculo y alcance** (F14-DC24; con alcance «proceso», por proceso). Lo garantiza la
  base: el indicador guarda el cálculo y el alcance de su ficha vigente, con un índice único parcial sobre los activos
  [Claude, F14B-DC18]. Se comprueba al enviar y al aprobar: «Ya hay una ficha activa para ese cálculo y alcance:
  *código*». «Crear a partir de este» sobre un automático nace **manual**, con sus variables como propias.
- **Inicio de la serie** [Claude, F14B-DC19]. Un cálculo que no se llena hacia atrás empieza en el periodo en curso
  cuando se aprueba la ficha: el sistema fija ahí el inicio de medición y no quedan periodos anteriores por registrar.
  Uno que sí se llena hacia atrás respeta el inicio de medición de la ficha: sus periodos anteriores a la aprobación son
  históricos y los calcula el sistema en la primera revisión.
- **Pasar una ficha manual a automática** es un cambio mayor (el origen del dato ya lo es). Para un cálculo que no se
  llena hacia atrás, «rige desde» debe ser el periodo en curso; para los demás valen las reglas de F14-DC17. Las
  mediciones anteriores conservan su versión y sus datos digitados.

### 5.4 La foto

- **De estado:** en la primera revisión después del fin del periodo, y solo para el periodo más reciente que terminó:
  si la aplicación no se usó durante dos periodos, el anterior queda «Sin dato» (no se le atribuye una foto que no es
  suya) [Claude, F14B-DC20].
- **De flujo** [Usuario, 4.1]: en la primera revisión después de vencer el plazo de reporte de la medición. Hasta
  entonces la medición está en «Falta un dato» y la pantalla dice cuándo se calcula. Las históricas de un cálculo que se
  llena hacia atrás se calculan en la primera revisión, sin esperar.
- **Sin nada que medir** [Usuario, 4.4]: si el denominador es cero, el sistema marca la medición «No aplica» con el
  motivo del cálculo («No se publicó ningún trámite en el periodo»). Un conteo en cero es un valor, no «no aplica».
- La medición guarda cuándo se tomó («foto del 1 de abril, 7:12 a. m.») y su historial lo dice con un evento propio,
  sin usuario. Los valores quedan en la tabla del periodo como los de cualquier indicador, con «El sistema» donde iría
  quien reportó.
- **«Volver a calcular»** (quien administra, solo cálculos de flujo, hasta el cierre): toma otra vez el cálculo del
  periodo; si cambia, deja el evento con el antes y el después y sigue las reglas de una corrección (alertas si cambia
  el color). No vale sobre una medición cerrada ni sobre una reabierta: el cierre congeló su foto, y reabrirla solo
  deja cambiar el análisis (§15.2 del spec 14).
- La foto se toma en la revisión de vencimientos (después de abrir los periodos) y, antes de clasificar, en el resumen
  y en el cierre del mes. No cuelga de la apertura de periodos, que corre al leer y al aprobar.

### 5.5 El camino «de sistema»

[Claude, F14B-DC21.] Los ocho cálculos documentales los toma el sistema llamando la misma consulta de la pestaña de
Vigencia **con el alcance del Administrador del SGC**: cuenta todo, también lo restringido, y la cifra de la ficha es
por construcción la que ese rol ve en la tarjeta. Esa sesión de sistema se arma dentro de la función que toma el
cálculo, no se exporta y nunca sirve filas a una persona. La consulta de la 13C solo gana un dato en su resultado: la
conformidad del periodo con su numerador y su denominador (hoy sale solo en un texto).

⚠ Corrige §15.1: «para Admin SGC, Gerencia y Control Interno coincide» vale para el Administrador del SGC y para
Control Interno; en **acuses**, la tarjeta de Gerencia puede no coincidir con la ficha, porque esa cuenta le muestra solo
versiones vigentes.

## 6. Vigencia y Distribución (§15.4, opción 1, con los ajustes de la revisión)

- **La tarjeta de Vigencia** [Usuario, 3.2 y 6.5]. Para cada tarjeta, si su cálculo tiene una ficha activa con el
  alcance del filtro (la entidad, o el proceso elegido) y esa ficha tiene meta, la tarjeta usa **la meta que rige el
  periodo en curso de la ficha** (la programada, si la hay; si no, la de la ficha) y enlaza «Ver ficha *código*» a quien
  puede verla; a quien no puede ver esa ficha no se le muestra su código, ni en la tarjeta ni en Distribución. El veredicto sigue siendo «cumple» o «no cumple», con la razón exacta. Sin ficha, o con una ficha sin
  meta, todo sigue como en la 13C. El Excel de la pestaña usa lo mismo.
- **Configuración documental.** La meta de un cálculo con ficha de alcance «entidad» y con meta se muestra en solo
  lectura, «La fija la ficha *código*», y el guardado no la cambia. Vale también para el umbral de conformidad.
- **Conformidad en puntos de uso** [Usuario, 2.1]. Una función única, `metaDeConformidad()`, responde: la meta que rige
  el periodo en curso de la ficha activa del cálculo `conformidad_fecha`, si existe y tiene meta; si no, el umbral de
  Configuración documental. La usan los dos lectores de Distribución (el estado de los puntos a la fecha y el historial
  de verificaciones) y, por ellos, la tarjeta de Vigencia. La ficha de ese cálculo **exige meta**.
- ⚠ **El informe de la revisión anual queda fuera** [Claude, F14B-DC6]: no usa el umbral ni guarda veredicto. Se quitan
  ese renglón de §15.4 y de §20 y su prueba de §23.
- ⚠ La ficha del cálculo `conformidad_periodo` es solo un indicador: no gobierna nada de la tarjeta, cuyo renglón «en el
  periodo» sigue siendo informativo [Claude, F14B-DC22].
- La cifra de Distribución sigue truncada, como hoy; la de la ficha sigue la regla de `textoValor` (con un decimal por
  omisión en «Porcentaje»): son la misma medida con distinta precisión y ninguna contradice su veredicto.

## 7. Objetivos (§16)

- **Página «Objetivos»**: una pestaña de «Indicadores», para toda sesión. Selector de periodo (un año, un semestre o
  un trimestre; por omisión, el año en curso). Los objetivos activos, por clase, cada uno con sus indicadores (los que
  la persona ve: código, nombre, proceso, último resultado del periodo y su estado) y su propio estado: **«Cumplido»**
  si todos sus indicadores medidos alcanzan la meta, **«No cumplido»** si alguno no, **«Sin medición»** si ninguno se
  midió [Usuario, 3.1]. No dice si hay indicadores que la persona no ve.
- `objetivos` queda reservado como código de indicador, junto a `nuevo`, `matriz`, `por-aprobar`, `cierre` y `excel`.
- El cálculo es el de §5.2.

## 8. Constancias de envío (ajustes a §17.2)

- **«Se reporta a un ente» es un estado completo** [Claude, F14B-DC7 ⚠]. Una ficha que escribe el ente debe traer
  también la periodicidad externa y el plazo en días, y la periodicidad externa debe ser la de medición o una que la
  contenga (un mensual puede reportarse trimestral; nunca al revés). Una versión ya aprobada con el ente incompleto no
  genera constancias, y la ficha lo dice; se completa con un cambio menor.
- **Desde cuándo** [Claude, F14B-DC8 ⚠]. El indicador guarda desde cuándo su ficha vigente se reporta a ese ente con esa
  periodicidad y ese plazo (la publicación de la versión que lo puso o lo cambió). Nacen constancias solo para los
  periodos externos que **terminan después** de ese momento. Añadir el ente a una ficha antigua o importada no abre
  envíos vencidos. Una ficha que ya estaba aprobada con el ente completo antes de esta entrega empieza a contar desde
  la primera vez que el sistema la revisa: tampoco se le abren periodos anteriores.
- **Lo ya nacido no cambia.** Una constancia guarda el nombre del ente y su fecha límite de cuando nació. Si la ficha
  cambia de ente, de periodicidad externa o de plazo, las constancias existentes siguen como están y las nuevas siguen
  la regla nueva. Si la ficha deja de reportarse a un ente, o el indicador se retira, las pendientes **sin soporte**
  dejan de pedirse (se quitan); las registradas y las que ya tienen un soporte se conservan.
- **Quién** [Claude, F14B-DC9 ⚠]. La tarea «Registrar el reporte a *ente*, *periodo*» es de quien mide (con el respaldo
  de siempre: líderes y, sin ellos, el Administrador del SGC). Registran y corrigen quien puede medir el indicador **y
  quien administra indicadores**, sin clave (F14-DC33).
- **Registrar:** fecha de envío (no futura), radicado o número de constancia, al menos un soporte ya adjunto (PDF o
  imagen) y nota opcional. La pantalla muestra el **resultado del periodo externo** (el acumulado de §8.10 sobre los
  periodos de medición que contiene) y lo congela en la constancia, con su fracción exacta, su texto y qué periodos
  faltaban o no estaban cerrados; si es parcial, lo advierte y deja registrar.
- **Corregir** una constancia registrada exige justificación (10 caracteres o más) y no recalcula el resultado
  congelado. Un soporte de una constancia registrada no se quita.
- **Historial** [Claude, F14B-DC9]: el registro, cada corrección (con su antes y su después) y los soportes quedan en un
  registro de solo inserción (`reporte_externo_eventos`), que ve quien ve los soportes; además, la bitácora.
- **Vence, avisa y escala** como una medición: aviso de vencido a quienes tienen la tarea y a los líderes del proceso,
  y escalamiento al jefe pasados los «días para avisar al jefe», sin nombrar el indicador. Sin aviso previo. Las
  constancias vencidas a cargo de la persona cuentan en la insignia de «Indicadores».
- **Se ve** en la página del indicador, vista «Reportes al ente» (aparece si la ficha se reporta a un ente o si el
  indicador tiene constancias): periodo, fecha límite, estado, cuándo se envió, radicado, resultado enviado y quién lo
  registró; el soporte y el historial, a quien ve soportes. En la lista, las marcas «Envío pendiente» y «Envío
  vencido». El soporte se sube por `POST /api/reportes-externos/[id]/archivos` (fuera del `matcher`) y se sirve por la
  ruta de soportes del indicador, siempre como descarga y con 404 a quien no ve soportes.

## 9. Impactos por cambio de norma (ajustes a §17.3)

- **Nacen** en la misma transacción del cambio de estado de la norma (modificada, derogada o retirada), uno por cada
  indicador **activo** cuya ficha vigente la cita, con el mismo plazo que los de la 13C y un aviso a los
  Administradores del SGC activos, salvo a quien hizo el cambio. No bloquean el indicador.
- **Dónde se resuelven** [Claude, F14B-DC10 ⚠]. En la **página del indicador**: mientras hay un impacto pendiente, la
  página muestra «Revisión por cambio normativo» a quien ve el indicador, con la norma, su estado nuevo y la fecha
  límite; quien administra tiene ahí las tres salidas. La tarea «Revisar *código* por el cambio de *norma*» es de quien
  administra indicadores y enlaza a esa página. La página de impactos de la 13C gana la sección «Indicadores» **en
  lectura**, con los indicadores que la persona ve, cuando esa página existe para el proceso.
- **Las tres salidas:**
  - **«No afecta»**, con nota de 5 caracteres o más.
  - **Versión nueva de la ficha** [Claude, F14B-DC23]: lo resuelve la primera versión del indicador que se **envió**
    (o se publicó, si es un cambio menor) **después de nacer el impacto**, en el momento en que queda aprobada. Queda
    enlazada, y figura como quien resolvió el Administrador que la elaboró. Una versión que ya estaba por aprobar cuando
    cambió la norma no lo resuelve.
  - **Retiro** del indicador: resuelve todos sus impactos pendientes.
- **Vencen, avisan y escalan** con las reglas de los impactos de la 13C, en su propia pasada: aviso de vencido a los
  Administradores del SGC y escalamiento a sus jefes, sin nombrar el indicador.
- **Una ficha puede seguir citando una norma que ya citaba** [Claude, F14B-DC11; corrige la 14A]: solo una cita nueva
  exige norma vigente o modificada. La ficha muestra la norma derogada marcada, como ya dice §17.1. Al **aprobar**, una
  versión que cita por primera vez una norma que dejó de estar vigente o modificada mientras esperaba se rechaza: «La
  norma *nombre* ya no está vigente: devuelva la ficha».
- Una norma ya «modificada» que se modifica otra vez no abre impactos nuevos: es la regla de la 13C (el estado no
  cambia) y no se toca.
- Los impactos de documentos y de procesos de la 13C no cambian: ni su creación, ni sus tareas, ni su resolución.

## 10. Datos: las migraciones `0013` y `0014`

Aditivas sobre lo que la 14A usa; rehacen solo tablas de la 14B, vacías y sin uso (comprobado en la propia migración:
si alguna tuviera filas, se detiene). Son dos archivos por una razón práctica: la herramienta que genera las
migraciones pregunta de forma interactiva cuando un mismo cambio quita una tabla y crea otra, así que la `0013` trae
todo lo que se añade y se rehace, y la `0014` solo quita `calculo_fotos`.

| Qué | Cambio |
|---|---|
| `calculo_fotos` | ⚠ **Se quita** (en la `0014`) [Claude, F14B-DC2]: la foto vive en la medición |
| `reportes_externos` | Se rehace: `desde` y `hasta` como `timestamptz`; `ente` (el nombre de cuando nació); `estado` con `CHECK` (`pendiente`, `registrada`); `resultado_enviado` (texto) y `resultado_detalle` (`jsonb`); `corregida`; `escalado_en`; `creado_en`; índice por (estado, `vence_en`). Conserva `aviso_previo_en`, sin uso (las constancias no tienen aviso previo) |
| `reporte_externo_eventos` | Nueva, de **solo inserción** (trigger y `REVOKE`): constancia, tipo (`registro`, `correccion`, `soporte`), quién, detalle (`jsonb`), cuándo |
| `impactos_indicadores` | Se rehace: `CHECK` de `estado` (`pendiente`, `resuelto`) y de `resolucion` (`no_afecta`, `nueva_version`, `retiro`), coherencia entre los dos, `creado_en`, índice por (indicador, estado) |
| `indicadores` | Columnas nuevas `calculo`, `calculo_alcance` (los de la ficha vigente; índice único parcial sobre los activos) y `ente_desde` |
| `mediciones` | Columna nueva `foto_en` |
| `medicion_eventos` | El `CHECK` del tipo admite `foto` |
| `indicador_versiones` | `CHECK`: automática ⇔ con cálculo y alcance; el alcance, de su lista. Las filas existentes lo cumplen |
| Índices que la 14A dejó como deuda | `firmas(indicador_version_id)`, `medicion_observaciones(responde_a)`, `mediciones(cierre_id)` |

`reporte_externo_eventos` entra a la regla 5 y al piso 10 de `AGENTS.md`, al `REVOKE` de `sgc_app` y a
`tests/privilegios-bd.test.ts`. Todas las tablas nuevas entran al `TRUNCATE` de las semillas. Quince migraciones en
total (`drizzle/0000` a `drizzle/0014`).

## 11. Semilla, demostración y documentos

**Demo de la 14B** (sobre la de la 14A-C; reemplaza la parte de §22 que le toca):

- `SGC-IND-03` pasa a fuente automática («Objetivos cumplidos», de calidad) con un cambio mayor, y tiene al menos un
  periodo calculado por el sistema, con su foto.
- `SGC-IND-05` sigue manual [Usuario, 5.3]. Una ficha nueva, «Conformidad en puntos de uso», automática
  (`conformidad_fecha`, toda la entidad), aprobada y con un periodo fotografiado.
- El regulatorio `CEX-IND-01` con su ente completo, una constancia registrada (con radicado y soporte) y otra vencida.
- Ningún impacto de indicador sembrado: el recorrido lo provoca.

**Demostración de la 14B — el usuario debe poder** (reemplaza los puntos 2 a 5 de §24, «14B»):

1. Crear una ficha con «Lo calcula el sistema», ver que la forma, las variables y la tendencia vienen puestas y que no
   se designa a nadie para medir; enviarla y aprobarla. Intentar otra con el mismo cálculo y alcance: se rechaza.
2. Abrir la ficha de «Conformidad en puntos de uso»: nadie digita, la medición trae la fecha de su foto, y en
   **Vigencia → Indicadores** la tarjeta muestra la meta de la ficha y enlaza a ella; en **Distribución** el umbral es
   el de la ficha, y en **Configuración documental** está en solo lectura.
3. Ver `SGC-IND-03` alimentado por «Objetivos cumplidos» y, como Administrador del SGC, «Volver a calcular» un periodo
   sin cerrar. Ver la pestaña **Objetivos** con «Cumplido», «No cumplido» y «Sin medición».
4. Ver un automático de un periodo sin nada que medir marcado «No aplica» por el sistema, y uno que aún no se calcula
   en «Falta un dato», sin tarea ni aviso para nadie.
5. Registrar la constancia de envío de `CEX-IND-01` con su radicado y su soporte, ver el resultado congelado, corregirla
   con justificación y ver otra vencida en «Mis tareas» y en la lista.
6. Derogar una norma que cita un indicador: ver la tarea y el aviso «Revisión por cambio normativo»; resolver un
   impacto con «No afecta» y otro con una versión nueva; comprobar que la ficha se puede guardar citando la norma
   derogada.

Los puntos 1, 6 y 7 de §24 «14B» (dos variables compartidas, desagregado y compuesto) son de la 14C.

**Documentos:** el capítulo 8 del manual gana «Indicadores que calcula el sistema», «Objetivos», «Reportes al ente» y
«Cuando cambia una norma»; el capítulo 7 corrige la pestaña Indicadores de Vigencia y la página de impactos;
`AGENTS.md`, `CONTEXT.md` (que además quedó atrasado: dice `0012` y que la 14A no está fusionada) y `PLAN.md`.

**Cambios a `AGENTS.md`** (sobre §20 del spec 14): el registro de cálculos y la sesión de sistema; «un automático no lo
digita nadie» y el estado «Falta un dato»; la foto y sus momentos; `metaDeConformidad()` en Distribución (sin el informe
anual); `reporte_externo_eventos` en las tablas de solo inserción; la subida `api/reportes-externos/[id]/archivos`; los
impactos de indicadores en su tabla y resueltos en la página del indicador; `impactos_indicadores` y
`reportes_externos` en `condicionDeDeshacer`; quince migraciones y la `0015` para las tablas de la 14C.

## 12. Lo que queda para la 14C (se decide al planearla)

- **Dato compartido:** copiar a la medición el valor juntado (y guardar su fracción exacta) o leerlo al vuelo; qué se
  firma de la variable y qué se congela del catálogo cuando ya se usa (periodicidad, cómo se junta, dimensión); el plazo
  de la variable frente al del indicador; el dato que llega a una medición ya cerrada; quién responde sin responsable
  activo; el historial del dato; «qué indicadores la usan» frente a un restringido; la reapertura en cascada con
  indicadores retirados.
- **Desagregación:** qué categorías pide un periodo (hace falta una foto por medición); el «no aplica» de una categoría;
  variables que no se pueden sumar entre categorías; si la categoría lleva «no alcanza la meta», límites y variación;
  históricos, Excel e impreso por categoría; la gráfica de barras por categoría.
- **Compuestos:** el «porcentaje de cumplimiento» en «mantenerse en un rango» (por 3.1, cumplir es alcanzar la meta: 100 %
  si cumple, 0 % si no), con meta cero o negativa y con un origen sin meta o «no aplica»; el acumulado anual de un
  compuesto; qué se firma del origen; **la fuga por audiencia** (quién ve el valor de un componente restringido); el
  compuesto cerrado con el origen abierto; ciclos entre fichas del mismo bloque de aprobación; las validaciones inversas
  (retirar, restringir, cambiar la meta o la periodicidad de un origen).
- De esta entrega hereda: el lugar único de los valores, «Falta un dato», el evento de sistema y el orden de candados.

## 13. Decisiones de Claude en este anexo (para revisar de una vez)

DC1 a DC11 son las «D» que el usuario aceptó el 2026-11-14. ⚠ = ajusta la letra de un punto aprobado.

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F14B-DC1 | Lo que nadie digita lo escribe el sistema en la tabla de valores de la medición | §4 | Tabla del año, acumulado, matriz, Excel e impreso no cambian | Práctica |
| F14B-DC2 ⚠ | Se quita `calculo_fotos` (§19.3); la foto vive en la medición, con su hora | §10 | Duplicaba lo que el cierre ya protege | Práctica |
| F14B-DC3 | «Falta un dato»: sin tarea, vencido ni escalamiento para quien mide; un automático solo tiene tarea de analizar | §4 | Evita avisos falsos | ISO derivada de 9.1.1 |
| F14B-DC4 ⚠ | El cierre toma antes las fotos pendientes; una cerrada nunca se recalcula en silencio; en la 14C no alcanzará una medición que espera un dato en plazo | §4 | Un resultado cerrado no puede quedar distinto de sus datos | ISO derivada de 7.5.3.2 |
| F14B-DC5 ⚠ | Hacia atrás (8.4) solo lo que se reconstruye fielmente; la serie de acuses empieza al aprobarse la ficha | §5.1 | Un periodo viejo de acuses saldría casi en 100 % | ISO derivada de 9.1.1 b) |
| F14B-DC6 ⚠ | El informe de la revisión anual queda fuera de §15.4 | §6 | No usa el umbral ni guarda veredicto | Corrección del spec |
| F14B-DC7 ⚠ | «Se reporta a un ente» exige ente, periodicidad externa y plazo, y la externa contiene a la de medición | §8 | Sin eso no hay periodos enteros que acumular | Práctica |
| F14B-DC8 ⚠ | Las constancias nacen solo para periodos que terminan después de ponerle el ente a la ficha | §8 | Una ficha antigua o importada no amanece con envíos vencidos | Práctica (anti-meta de la 14A-C) |
| F14B-DC9 ⚠ | Registra la constancia quien mide y también quien administra; su historial es de solo inserción | §8 | En muchos hospitales quien envía al ente es Calidad; el antes y el después debe verlo quien ve el soporte | ISO derivada de 7.5.3 |
| F14B-DC10 ⚠ | El impacto sobre un indicador se resuelve en la página del indicador; la de la 13C lo muestra en lectura | §9 | Esa página solo existe por proceso con impactos de la 13C | Práctica |
| F14B-DC11 | Una ficha puede seguir citando una norma que ya citaba; solo las citas nuevas exigen norma vigente o modificada | §9 | Tras «No afecta» la ficha no se podía volver a guardar | Práctica |
| F14B-DC12 ⚠ | La tendencia de un automático la fija el cálculo | §5.1 | El sentido de los diez es inherente; la tarjeta y la ficha no pueden juzgar al revés | Práctica |
| F14B-DC13 | «Para un proceso» es el proceso de la propia ficha | §5.1 | El proceso ya está firmado y fijo tras la primera aprobación | Práctica |
| F14B-DC14 ⚠ | La unidad de un automático se elige del maestro | §5.1 | El maestro es de la entidad; el cálculo no puede fijar una de sus filas | Práctica |
| F14B-DC15 | «Tiempo de aprobación» entrega días sumados y trámites; la tarjeta sigue con su promedio | §5.1 | La ficha decide con la razón exacta | Regla de `AGENTS.md` |
| F14B-DC16 | Definición de «Reportes a tiempo»: primer reporte o «no aplica» en la fecha límite o antes; sin históricos ni automáticos | §5.2 | La fecha de reporte se puede borrar con una corrección; el historial no | Práctica |
| F14B-DC17 | «Objetivos cumplidos» usa el objetivo de la ficha vigente y excluye a los indicadores que usan ese mismo cálculo | §5.2 | El objetivo es un cambio menor; evita que dos fichas se cuenten entre sí | Práctica |
| F14B-DC18 | La unicidad por cálculo y alcance la garantiza un índice único, con el cálculo de la vigente guardado en el indicador | §5.3 | Como «una sola vigente»: en la base, no solo en el código | Práctica |
| F14B-DC19 | Un cálculo que no se llena hacia atrás empieza en el periodo en curso al aprobarse; pasar de manual a automático rige desde el periodo en curso | §5.3 | No quedan periodos que nadie puede registrar | Usuario, 6.3 |
| F14B-DC20 | La foto de estado es solo del periodo más reciente que terminó | §5.4 | No se atribuye a un periodo una foto tomada un periodo después | ISO derivada de 9.1.1 b) |
| F14B-DC21 | Los cálculos documentales los toma el sistema con el alcance del Administrador del SGC, por la misma consulta de Vigencia | §5.5 | La cifra de la ficha y la de la tarjeta son la misma por construcción; la 13C casi no cambia | Práctica |
| F14B-DC22 ⚠ | La ficha de «conformidad del periodo» no gobierna la tarjeta | §6 | El renglón «en el periodo» no tiene veredicto hoy | Práctica |
| F14B-DC23 | Resuelve un impacto la primera versión enviada después de nacer el impacto, al aprobarse; figura quien la elaboró | §9 | Una versión anterior al cambio no es una respuesta a él | Práctica |

## 14. Lo que queda al constructor

Los nombres definitivos de columnas, índices, tipos de evento y de aviso; la forma de los `jsonb`; el diseño de las
pantallas dentro del sistema visual (formulario de la ficha automática, vista «Reportes al ente», aviso de impacto,
pestaña «Objetivos») y sus textos, salvo los que este anexo y el plan fijan entre comillas; cuántas fotos históricas
toma una revisión por indicador; los límites de ritmo; y los datos exactos de la demo.
