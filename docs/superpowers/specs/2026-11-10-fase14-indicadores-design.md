# Fase 14 — Indicadores (diseño)

Fecha: 2026-11-10. Estado: **aprobado por el usuario el 2026-11-10** («aprobado el spec»),
después de la revisión del constructor, cuyas seis preguntas y cinco choques con el código quedaron
resueltos en §6.1, §7.1, §7.4, §7.6, §7.7, §8.2, §8.8, §15 y §17.3 (F14-DC5, DC10, DC14, DC17,
DC18, DC26 y DC39 a DC42). Cubre las dos entregas de la fase (14A y 14B). Sigue, por entrega, el
plan de implementación.

## 0. Cómo leer este documento

Es el detalle de la **Fase 14** del diseño maestro
`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` ("el spec maestro"). Mandan,
en este orden: este documento; el spec maestro (§5.1 matriz de roles, §5.4 motor de acciones, §5.5
evidencias, §5.6 notificaciones y tareas, §5.11 sistema visual, §6.2 Indicadores, §8 Fase 14); los
specs de la 13A, la 13B y la 13C donde este los cita (firma por clave, tareas y avisos, alcance,
normograma e impactos, indicadores documentales); y las reglas permanentes de `AGENTS.md`. Donde
este documento y los anteriores difieran, manda este; §5.2 dice en qué.

El hospital **va a iniciar** la implementación de sus indicadores: no hay práctica previa ni
mediciones que respetar [Usuario, 2026-11-10]. El usuario entregó como guía el archivo
`INDICADORES_PROCESO_SGC_OK.xlsx` (en la raíz, sin seguimiento y excluido en `.git/info/exclude`:
nunca entra a un commit), con ocho fichas del proceso SGC, `SGC-IND-01` a `SGC-IND-08`. Es **una
propuesta del usuario para estructurar la ficha**, no un formato en uso; el Apéndice A la transcribe
campo por campo y dice dónde quedó cada uno.

Las maquetas (no versionadas) están en `.superpowers/brainstorm/85010-1794341073/content/`:

- `pantallas-14-v3.html`: la página de un indicador, el reporte de una medición, la lista, la
  matriz del año, el formulario de la ficha, la ficha impresa y un indicador desagregado. Son la
  referencia del **contenido** de cada pantalla. Su sección 1 (gráficas planas) quedó **superada**
  por el archivo siguiente.
- `estilo-graficas-v3.html`: los tres estilos de gráfica; el usuario eligió el **A, «Tubos»**. Es
  la referencia del **aspecto** de las gráficas (§11).

El estilo general de las pantallas es el sistema visual de la Fase 12.

Vocabulario de este documento:

- **Indicador:** una medida del desempeño de un proceso, con código propio (`SGC-IND-01`).
  **Ficha técnica:** su definición (qué mide, cómo se calcula, contra qué meta), versionada y
  aprobada con firma. **Versión de la ficha:** cada estado aprobado de esa definición.
- **Variable:** un dato que entra a la fórmula (el numerador, el denominador). Es **propia** del
  indicador, **compartida** (vive en el catálogo de su proceso y la usan varios indicadores),
  **automática** (la calcula el sistema) o el **resultado de otro indicador** (indicador
  compuesto).
- **Periodo:** el mes, bimestre, trimestre, semestre o año que se mide, según la **periodicidad**
  del indicador. **Plazo de reporte:** los días después del fin del periodo para reportarlo.
- **Medición:** el registro de un indicador en un periodo: sus valores, el **resultado**
  calculado, el **estado** del semáforo, el análisis, los soportes y las observaciones.
- **Semáforo:** «Bien» (cumple la meta), «Atención» o «Crítico», más los grises «Sin dato»,
  «No aplica» y «Sin meta». **Límite de crítico:** el valor que separa «Atención» de «Crítico».
- **Tendencia:** el sentido en que el indicador mejora: ascendente, descendente o constante.
- **Quien mide**, **quien analiza** y **quien hace seguimiento:** las tres funciones que el
  Administrador del SGC designa por indicador, persona por persona (§6).
- **Cierre del mes:** el acto del Administrador del SGC que deja inmodificables las mediciones
  de los periodos terminados (§9). **Histórico:** un periodo anterior a la aprobación de la ficha.
- **Acumulado del año:** el resultado del año calculado con los datos sumados, no con el promedio
  de los periodos.
- **Admin SGC**, **líder**, **firma**, **huella**, **norma**, **impacto**, **soporte**: como en los
  specs anteriores.

Las etiquetas entre corchetes dicen de quién es cada decisión: **[Usuario]** (con el número del
punto de §2), **[Spec maestro]** o **[Decisión de Claude]**. Las de Claude están reunidas en §28
para revisarlas de una vez, con su base: **ISO** (cláusula de ISO 9001:2015 que lo exige), **ISO
derivada** (la cláusula respalda el fin, el mecanismo es de Claude), **Regulación** o **Práctica**.

## 1. Intención y porqué

La Fase 13 dejó controlados los documentos. Falta saber si los procesos que esos documentos
describen **funcionan**: ISO 9001:2015 pide que cada proceso tenga sus criterios y métodos de
control, «incluyendo el seguimiento, las mediciones y los indicadores del desempeño» (4.4.1 c), y
que la organización determine qué mide, con qué método, cuándo mide y cuándo analiza (9.1.1), y que
analice y evalúe lo medido (9.1.3).

El objetivo de la fase, en una frase: **que cualquier persona del hospital pueda reportar un
indicador en un minuto y entender su resultado de un vistazo, y que un auditor pueda reconstruir
cada cifra hasta su ficha aprobada, su dato de origen y la persona que lo reportó.**

El usuario lo fijó como criterio de toda la fase: «se quiere hacer fácil su uso e interpretación
pero sin perder su rigor técnico» [Usuario, 2026-11-10]. Se aplica con tres reglas, que el usuario
leyó y no objetó [Interpretación aceptada]:

1. **El caso simple cabe en una pantalla.** Crear un indicador como los ocho del Excel es un solo
   formulario; lo avanzado (variables compartidas, desagregación, compuestos) aparece solo cuando
   se usa.
2. **Cada resultado se explica en una frase** («Cumple: 92 % frente a una meta de 90 %»), además
   del color.
3. **El rigor lo pone el sistema, no el usuario:** el acumulado por sumas, la versión de ficha que
   regía y el cierre se aplican solos, sin campos adicionales para quien reporta.

Lo que la Fase 14 deja listo para las siguientes: la marca **«requiere acción de mejora»** en cada
medición crítica, con su causa y su acción propuesta, que la Fase 15 convierte en acción formal del
motor único; el registro de **cálculos automáticos**, al que la 15 añade los suyos (acciones
eficaces, no conformidades cerradas a tiempo); los **objetivos** como maestro, que la 15 reutiliza
para los planes; las tareas y avisos que la 16 lleva al correo y al planificador; y los resultados
por periodo, la matriz del año y el Excel, que la 17 pone en el tablero, en los reportes con pie de
control y en el informe de revisión por la dirección.

## 2. Decisiones del usuario (2026-11-10)

Tomadas una por una en conversación, con las recomendaciones de Claude, su base y su porqué; el
usuario eligió por número. Los números (2.1, 3.9, 13.6…) son los de esa conversación y este
documento los cita así. Durante la sesión el usuario pidió que cada recomendación diga su porqué
(«para las próximas decisiones de múltiple respuesta realiza tu recomendación indicando el
porqué») y fijó el criterio de facilidad con rigor de §1.

**Tema 1. Punto de partida.** «Hasta el momento el hospital va a iniciar su implementación, te
puedes guiar de la ficha […] se tienen indicadores por proceso, subprocesos (procedimientos) […]
ejemplo el proceso de gestión de cartera tiene unos indicadores y uno de sus procedimientos o
subprocesos tienen otros». El Excel «se te compartió como guía para estructurar la ficha del
indicador, el cual se utilizará para crear los múltiples indicadores».

**Tema 2. A qué se ata un indicador** («voy con la opción 1 y del 2.1 al 2.4 entran»). Proceso
obligatorio y subproceso opcional del mapa, igual que los documentos; el procedimiento va como
enlace opcional a su documento vigente, más el punto de control.

- 2.1 La página del proceso muestra sus indicadores y, agrupados, los de sus subprocesos.
- 2.2 El líder del proceso alcanza los indicadores del proceso y de sus subprocesos; quien lleva
  el subproceso reporta como designado, sin ser líder.
- 2.3 Código `SIGLA-IND-NN`, consecutivo por proceso, propuesto por el sistema y editable.
- 2.4 Un indicador pertenece a un solo proceso; si dos procesos miden lo mismo, comparten
  variables, no el indicador.

**Tema 3. La ficha** («ok entran todos», 3.1 a 3.8; «también entran del 3.9 al 3.17»). Entran tal
cual del Excel: código, versión y fecha de emisión, nombre, proceso y subproceso, requisito,
objetivo, tipo, punto de control, fórmula, variables con su descripción, meta, unidad,
periodicidad, responsable, tendencia, fuente, tabla de seguimiento con análisis y gráfica.

- 3.1 Dos clasificaciones separadas, cada una en su maestro editable: «Tipo» (eficacia,
  eficiencia, efectividad) y «Clasificación» (estratégico, operativo, regulatorio).
- 3.2 La tendencia gobierna el semáforo, con tres valores: ascendente, descendente y constante.
- 3.3 La meta de la ficha es la meta base; cada periodo la hereda y se puede programar distinta.
- 3.4 El responsable es uno o varios cargos del catálogo de Estructura; las personas que reportan
  y hacen seguimiento se designan aparte.
- 3.5 «Requisito» es texto corto libre; un regulatorio lleva además la norma del normograma.
- 3.6 La unidad sale de una lista corta editable, con decimales por indicador.
- 3.7 La tabla muestra solo los periodos de la periodicidad y cierra con «Acumulado del año»,
  calculado con las sumas, en vez de «Promedio anual».
- 3.8 La ficha se imprime con el diseño del Excel, por la hoja de impresión del navegador.
- 3.9 La ficha (definición) se separa del registro de resultados: la ficha se versiona y se
  aprueba; la tabla de seguimiento es un registro que crece. Al imprimir salen juntas, con la
  versión de ficha que regía.
- 3.10 Variables como lista, no solo numerador y denominador; cada una con su descripción (qué
  incluye y qué excluye), su fuente y su unidad.
- 3.11 Rangos del semáforo escritos en la ficha.
- 3.12 Línea base y sustento de la meta.
- 3.13 Cuándo se mide: además de la periodicidad, el plazo de reporte y la fecha de inicio de
  medición.
- 3.14 Responsable de medir y responsable de analizar, como dos campos.
- 3.15 Objetivo que mide, tomado de un maestro corto de objetivos (de calidad e institucionales).
- 3.16 «Soporte obligatorio» como casilla por indicador.
- 3.17 Control de cambios al pie de la ficha.
- Fuera: 3.18, frecuencia de análisis distinta de la de medición.

**Tema 4. Cómo se reportan los datos** («opción 3 y entran del 4.1 al 4.6»). Mixto: la variable es
propia del indicador por omisión y se reporta con él; se marca «compartida» solo cuando otro
indicador la necesita, y entonces pasa al catálogo del proceso, tiene su propio responsable y se
reporta una sola vez.

- 4.1 El dato compartido aparece ya puesto, con quién lo reportó; si falta, el indicador queda
  «pendiente de dato» y se avisa al responsable de esa variable.
- 4.2 Cada variable dice cómo se junta al pasar a un periodo mayor: «se suma» (por omisión),
  «último valor» o «promedio».
- 4.3 Una variable mensual puede alimentar un indicador trimestral o anual, nunca al revés.
- 4.4 Validaciones al digitar: sin negativos, límites opcionales por indicador y una confirmación
  cuando el valor se aleja mucho del periodo anterior.
- 4.5 «No aplica en este periodo», con motivo, distinto de «sin dato»: cuenta como reportado,
  queda en gris y no genera recordatorios.
- 4.6 El Administrador del SGC cierra por mes, para toda la entidad: «cerrar hasta marzo» cierra
  las mediciones cuyo periodo terminó en marzo o antes, con un resumen previo de lo que falta;
  después, corregir o reportar tarde exige justificación.

**Tema 5. El recorrido de una medición** («opción 1 y entran del 5.1 al 5.6»). Sin validación: se
mide, se analiza, la medición queda reportada y se cierra con el mes; las observaciones no
bloquean.

- 5.1 Tres funciones designadas por indicador: quién mide, quién analiza y quién hace
  seguimiento. Al crear el indicador, «analiza» se llena con la misma persona que «mide»; el líder
  del proceso siempre puede hacer las dos.
- 5.2 Análisis obligatorio solo cuando no cumple la meta; si cumple, es opcional.
- 5.3 En rojo, el análisis tiene dos partes (causa de la desviación y acción propuesta) y la
  medición queda marcada «requiere acción de mejora» para la Fase 15.
- 5.4 Estados en palabras llanas: «por reportar», «falta un dato», «falta el análisis»,
  «reportada», «vencida» y «cerrada».
- 5.5 Observaciones sobre la medición: las escriben quien hace seguimiento, Gerencia, Control
  Interno y el Administrador del SGC; avisan al responsable, que puede responder; el resumen previo
  al cierre lista las que siguen sin respuesta; se pueden añadir después del cierre.
- 5.6 Antes del cierre, quien midió corrige libremente y cada cambio queda con antes y después;
  después del cierre, solo el Administrador del SGC reabre la medición, con justificación, y la
  tabla la muestra como «corregida».

**Tema 6. Los cálculos que ya hace la plataforma** («opción 2 y entran del 6.1 al 6.6»). Fuente
automática: al crear un indicador se elige si el dato «lo digita una persona» o «lo calcula el
sistema», y en el segundo caso se escoge uno de los cálculos; la ficha es normal, pero nadie digita.

- 6.1 Lista fija de cálculos, definida en el código; nadie escribe consultas desde la pantalla.
- 6.2 El sistema toma el valor al terminar el periodo y lo congela al cierre del mes; no se digita
  ni se corrige a mano.
- 6.3 Los cálculos «de estado» empiezan su serie el día en que se crea la ficha; hacia atrás
  quedan «sin dato». Hasta la Fase 16 la foto se toma en el primer uso de la aplicación después del
  fin del periodo.
- 6.4 La pestaña de Vigencia sigue como vista «a hoy»; la ficha es el registro formal por periodo;
  cuando un cálculo tiene ficha, su tarjeta enlaza a ella.
- 6.5 Una sola meta por indicador: si el cálculo tiene ficha, la tarjeta de Vigencia muestra la
  meta de la ficha; si no, sigue la de Configuración documental.
- 6.6 El cálculo puede ser de toda la entidad o de un solo proceso.

**Tema 7. Crear y cambiar la ficha** («opción 2 con 7.1 a 7.5»). Aprobación ligera dentro del
módulo, con firma por clave: el Administrador del SGC elabora, la ficha queda «por aprobar» y entra
en vigencia cuando el aprobador la firma; el impreso muestra «Elaboró» y «Revisó y aprobó» con
nombre, cargo y fecha reales.

- 7.1 Quién aprueba depende de la Clasificación y se configura en su maestro: Gerencia para
  estratégicos y regulatorios, el líder del proceso para operativos; si el aprobador resulta ser
  quien elaboró, aprueba Gerencia.
- 7.2 Cambio mayor y cambio menor; los dos crean versión y aparecen en el control de cambios.
  Mayor es lo que altera el número o su juicio (fórmula, variables, unidad, tendencia, meta base,
  rangos y periodicidad) y exige aprobación. Menor es redacción (nombre, objetivo, descripciones,
  fuente, requisito) y lo firma solo quien elabora. Las personas designadas y el plazo de reporte
  no son contenido de la ficha y no crean versión.
- 7.3 Aprobación en bloque: varias fichas «por aprobar» con una sola clave.
- 7.4 La meta de un periodo se programa antes de que ese periodo termine; cambiarla después exige
  justificación y queda marcada.
- 7.5 Un indicador no se borra: se retira con motivo; deja de pedir reportes y su historia sigue
  visible.
- Fuera por ahora: 7.6, que el líder prepare el borrador de las fichas de su proceso.
- Ya decidido en el spec maestro: la versión nueva rige desde el periodo que se indique y las
  mediciones anteriores conservan la versión con que se calcularon.

**Tema 8. Periodos anteriores** («opción 2 y entran del 8.1 al 8.4»). Historia opcional, digitada:
la fecha de inicio de medición puede ser anterior a la aprobación de la ficha; esos periodos son
«históricos». La carga masiva desde Excel sigue rechazada.

- 8.1 Se digitan en la «tabla del año», la misma que se imprime, una fila por periodo.
- 8.2 Quedan marcados «registro histórico», con quién los registró y cuándo; no generan tareas,
  recordatorios ni alertas, y el análisis es opcional; se puede adjuntar el Excel de origen como
  soporte.
- 8.3 Los registra el Administrador del SGC o quien mide, y se cierran con el siguiente cierre
  mensual, como cualquier periodo.
- 8.4 En los indicadores de fuente automática, los cálculos «de flujo» se llenan solos hacia atrás
  hasta el inicio de medición; los «de estado» no.

**Tema 9. Quién ve qué** («opción 3 y entran del 9.1 al 9.5»). Abierto con nivel de acceso, igual
que los documentos: el indicador es «general» por omisión y lo ve toda sesión; «restringido» lo ven
Administrador del SGC, Gerencia, Control Interno, los asignados a su proceso y sus designados.

- 9.1 De un indicador general, toda sesión ve la ficha vigente, la tabla de resultados con su
  semáforo, la gráfica y el análisis.
- 9.2 Los soportes y las observaciones los ven solo Administrador del SGC, Gerencia, Control
  Interno, el líder del proceso y los designados.
- 9.3 Quien no puede ver un restringido recibe «no encontrado», nunca «sin permiso»; tampoco
  aparece en listas, búsquedas, conteos ni en la página del proceso.
- 9.4 Las fichas en borrador o por aprobar las ven solo el Administrador del SGC y quien debe
  aprobarlas; las versiones anteriores de una ficha aprobada las ve quien ve el indicador.
- 9.5 Entrada «Indicadores» en la barra lateral para todos, con lista filtrable por proceso,
  clasificación, tipo y semáforo; los indicadores salen también en la búsqueda `Ctrl K`.

**Tema 10. Regulatorios** («opción 2 con 10.1 a 10.4»). Informativo más constancia de envío: por
cada periodo externo queda un registro de «reportado al ente» (fecha, número de radicado o
constancia y soporte adjunto), con su tarea y su vencimiento. No se generan archivos en el formato
del ente.

- 10.1 La norma es obligatoria si la Clasificación es «Regulatorio» y opcional en las demás;
  pueden ser varias, y solo se eligen normas vigentes o modificadas.
- 10.2 La ficha de la norma en el Normograma lista «Indicadores que exige».
- 10.3 Si la norma cambia de estado, se abre un «impacto» por cada indicador que la cita; el
  Administrador del SGC lo resuelve con «no afecta» y nota, con una versión nueva de la ficha o
  retirando el indicador.
- 10.4 Periodicidad externa propia, que puede ser distinta de la de medición, con plazo en días;
  la tarea le llega a quien mide; la constancia muestra el resultado del periodo externo calculado
  por el sistema.

**Tema 11. Reglas de lo ya acordado** («entran 11.1 a 11.5, con una sola dimensión en la 11.2»).

- 11.1 Catálogo de dimensiones de la entidad, con sus categorías; los indicadores las reutilizan.
- 11.2 Una sola dimensión por indicador en esta fase; se captura una fila por categoría y el total
  se calcula sumando.
- 11.3 Cada categoría muestra su propio color, con la misma meta del indicador; el total solo se
  calcula cuando todas las categorías están reportadas o marcadas «no aplica».
- 11.4 Una variable puede ser «resultado de otro indicador» del mismo periodo (su valor o su
  porcentaje de cumplimiento); se recalcula sola, no admite ciclos y, si un componente es
  restringido, el compuesto también lo es.
- 11.5 Tres niveles con nombre: «Bien», «Atención» y «Crítico», más los grises «Sin dato», «No
  aplica» y «Sin meta». El umbral de «Atención» nace en el 70 % de la meta, se configura para la
  entidad y se ajusta en cada ficha. Solo «Bien» cuenta como «cumple».

**Tema 12. Adiciones** («entran 12.1 a 12.7 y queda fuera la 12.8 para la fase 17»).

- 12.1 Formas de fórmula ya armadas: «Porcentaje», «Tasa», «Promedio o razón», «Conteo» o
  «Fórmula libre».
- 12.2 Duplicar una ficha («crear a partir de otra»), que nace como borrador en versión 1.
- 12.3 Matriz del año: indicadores en filas y periodos en columnas, cada celda con su valor y su
  color, para un proceso o para toda la entidad.
- 12.4 Comparación en palabras junto a cada resultado, con el periodo anterior y con el mismo
  periodo del año anterior, con su flecha.
- 12.5 Excel de resultados, por indicador y por proceso, con las celdas neutralizadas y registro
  en bitácora; la versión formal con pie de control sigue en la Fase 17.
- 12.6 Cálculo automático «Reportes a tiempo».
- 12.7 Página «Objetivos» y cálculo automático «Objetivos cumplidos»: un objetivo cuenta como
  cumplido en el periodo si todos sus indicadores medidos están en «Bien».
- Fuera, a la Fase 17: 12.8, informe del periodo por proceso.

**Tema 13. Recordatorios y alertas** («entran 13.1 a 13.8»), después de preguntar el usuario si
esta fase los revisaba. Van por la campana y «Mis tareas»; el correo llega en la Fase 16 con las
mismas reglas.

- 13.1 Tarea al terminar el periodo para quien mide, con su fecha límite; si el resultado no
  cumple, tarea de analizar para quien analiza.
- 13.2 Aviso previo, unos días antes del plazo (3 por omisión, configurable), a quien aún no ha
  reportado.
- 13.3 Aviso de vencido a quien mide y al líder del proceso; la medición pasa a «vencida».
- 13.4 Escalamiento al jefe inmediato de quien mide pasados los «días para avisar al jefe» que ya
  usa Documentos; el Administrador del SGC no recibe aviso: lo ve en la lista y en el resumen del
  cierre.
- 13.5 Avisos agrupados por persona, no uno por indicador.
- 13.6 Quién recibe la alerta según el color, en el momento de reportar: en «Atención», quien
  analiza y quienes hacen seguimiento; en «Crítico», además el líder del proceso y el Administrador
  del SGC; Gerencia, en los indicadores donde esté designada en seguimiento. El texto lo dice en
  palabras.
- 13.7 Si una corrección cambia el color, se avisa de nuevo a los mismos, diciendo que es una
  corrección.
- 13.8 Incumplimiento repetido: tres periodos seguidos sin alcanzar la meta, aunque sea en
  «Atención», se tratan como «Crítico» para la alerta y para la marca «requiere acción de mejora»;
  el número es configurable.

**Tema 14. Corte en entregas** («opción 2 con 14.1 a 14.3»). Dos entregas, 14A y 14B (§5.1).

- 14.1 Un solo spec para toda la fase, con el modelo de datos completo desde la 14A, y un plan,
  una rama, un PR y un recorrido del usuario por entrega.
- 14.2 La semilla demo usa los ocho indicadores del Excel (nombre, fórmula, meta y periodicidad;
  el archivo no entra al repositorio), más otros ficticios de cartera, urgencias y talento humano.
- 14.3 Maquetas en el navegador antes de escribir el spec.

**Gráficas.** Sobre las maquetas, el usuario pidió «algo más bonito estéticamente hablando, no tan
plano para las barras y las líneas, algo más moderno» y, entre tres estilos, eligió el **estilo A,
«Tubos»** («estilo A»). No respondió si la gráfica principal va en columnas, en línea o con las
dos: queda **siempre en columnas** [Decisión de Claude, F14-DC1; era la recomendación].

Se mantienen de decisiones anteriores: sin carga masiva de mediciones desde Excel [Spec maestro
§6.2, recomendación 7 rechazada]; sin permisos individuales por persona (cambio 15 de la 13A); el
correo y el planificador son de la Fase 16; la acción de mejora desde un resultado rojo, de la 15;
los reportes formales con pie de control y el tablero, de la 17.

## 3. Metas, no metas y anti-metas

**Metas**

- Cada indicador tiene una ficha con código, versión, fórmula, variables con su fuente, meta,
  rangos del semáforo, responsables y control de cambios, aprobada con firma verificable; la ficha
  impresa se parece a la que el usuario propuso.
- Crear un indicador de la forma común (numerador sobre denominador) toma un formulario y no exige
  escribir sintaxis.
- Quien mide digita los datos y ve al instante el resultado, el color y una frase que lo explica;
  ningún paso pide un dato que el sistema ya tiene.
- Todo resultado se puede reconstruir: qué versión de la ficha regía, qué valores entraron, quién
  los reportó y cuándo, qué se corrigió y por qué.
- El año completo de un proceso o de la entidad se lee en una pantalla (la matriz), y cada
  indicador en una gráfica con su meta.
- Los resultados que no cumplen tienen análisis; los críticos, causa y acción propuesta, y quedan
  marcados para la Fase 15.
- Reportar tarde, no reportar y desviarse de la meta generan tarea, aviso y escalamiento por los
  mecanismos que ya existen, sin correo ni planificador y sin llenar la campana.
- (14B) Un dato que usan varios indicadores se reporta una vez; lo que la plataforma ya sabe
  calcular no lo digita nadie; cada objetivo de calidad muestra sus indicadores; un regulatorio
  deja constancia de su envío al ente y se entera cuando su norma cambia.

**No metas**

- Correo, planificador y escalamiento por correo: Fase 16. Tablero gerencial, foto mensual,
  reportes con pie de control, informe del periodo por proceso (12.8) e informe de revisión por la
  dirección: Fase 17.
- Abrir la acción de mejora desde un resultado rojo: Fase 15. Esta fase deja la marca y el texto.
- Carga masiva de mediciones desde Excel [Spec maestro; Usuario, tema 8].
- Generar archivos en el formato de un ente (PISIS, SIHO) ni conectarse a sus plataformas
  [Usuario, tema 10].
- Validación de cada medición por un tercero antes del cierre [Usuario, tema 5].
- Que el líder prepare borradores de fichas (7.6) y una frecuencia de análisis distinta de la de
  medición (3.18): fuera por ahora.
- Más de una dimensión por indicador (11.2) y metas distintas por categoría (11.3).
- Consultas o cálculos automáticos definidos por el usuario desde la pantalla (6.1).
- Reactivar un indicador retirado: se crea otro a partir de él (§7.7).
- Que las fichas entren al Listado Maestro de documentos: su control vive en este módulo
  [Decisión de Claude, F14-DC6].

**Anti-metas** (si pasa, la entrega falló)

- Que un texto escrito por un usuario se ejecute como código, o que una fórmula hostil tumbe o
  cuelgue el servidor.
- Que el color o la palabra «cumple» contradiga la cifra que se muestra, o que el acumulado del año
  salga de promediar porcentajes.
- Que una ficha aprobada cambie sin versión nueva, o que una medición cerrada cambie sin
  reapertura justificada.
- Que un periodo no reportado se vea como cero, o que «no aplica» se confunda con «sin dato».
- Que el mismo dato compartido tenga dos valores en el mismo periodo.
- Que un indicador restringido, su nombre o su resultado aparezcan a quien no puede verlo: en una
  lista, un conteo, la búsqueda, una tarea, un aviso, la matriz, un Excel o un compuesto.
- Que un soporte con datos personales lo descargue quien solo puede ver el resultado.
- Que el primer día del mes amanezcan cien avisos sueltos en la campana de alguien.
- Que reportar un indicador sea más lento que llenar la celda del Excel.

## 4. Restricciones

Rigen todas las de `AGENTS.md`. Las propias de esta fase:

- **Sin dependencias npm nuevas.** `exceljs`, `zod` y `pdf-lib` ya están. `motion` (Framer Motion)
  figura en el stack de `AGENTS.md` pero **no está instalada**: las animaciones de las gráficas son
  CSS (§11) [Decisión de Claude, F14-DC23].
- **Migraciones aditivas**, aplicables sobre una base de `sgc-suaza` o de cualquier fase anterior:
  `0011` con la 14A y `0012` con la 14B (§19). Nada se renombra ni se borra; donde una restricción
  existente estorba, se amplía la lista de un `CHECK`.
- **Sin planificador.** Abrir los periodos, tomar las fotos de los cálculos automáticos, avisar y
  escalar ocurren en la revisión de vencimientos que ya existe y corre cuando alguien usa la
  aplicación, cada diez minutos como mucho (`dispararRevisionDeVencimientos`). Además, toda lectura
  que dependa de que un periodo esté abierto lo asegura ella misma (§8.1).
- **Una fórmula nunca se ejecuta como código.** Solo la evalúa el intérprete de §7.4; ni `eval`,
  ni `Function`, ni SQL armado con texto del usuario.
- **Cada página nueva llama su guard y cada acción empieza por la sesión y la autorización.** Las
  páginas del módulo siguen el patrón de la 13C (F13C-DC39): `exigirSesion()` y después la regla de
  alcance con `notFound()`. Las de administración (`/admin/indicadores`), `exigirPermiso`.
- **Toda escritura lleva un permiso de la matriz (§6.2) más la condición de persona** (estar
  designado, ser el aprobador, liderar el proceso), como en la distribución.
- **Las rutas que reciben una subida van fuera del `matcher` del proxy**, usan `recibirArchivo` y
  tienen su caso en `tests/proxy-matcher.test.ts`.
- **Toda firma sigue el patrón de la 13A** (F13A-R4): validador de solo lectura antes, la clave con
  `verificarParaFirmar` fuera de la transacción y las comprobaciones repetidas dentro con
  `FOR UPDATE`.
- **Fechas, periodos y plazos en la zona de la instalación** (`zonaHoraria()`); los periodos son
  del calendario (el año va de enero a diciembre) y los plazos, en días calendario.
- **El cumplimiento se decide con el valor exacto**, nunca con el redondeado que se muestra (regla
  de `AGENTS.md`, que aquí vale también para variables con decimales, §7.4).
- **Color:** los estados usan los tokens `estado-*`; el módulo, `mod-indicadores`; el color nunca
  va solo (texto o número al lado) y nada se atenúa con `opacity` sobre texto.
- **Accesibilidad no negociable** y 390 px: reportar una medición se hace también desde el celular.
- **Tests contra la BD de desarrollo**, con las reglas de `AGENTS.md`: usuarios `zz_*` únicos,
  nada de `DELETE` ni `UPDATE` sobre tablas inmutables, flujos en transacciones que se revierten;
  ningún test deja confirmado un cierre de mes.

## 5. Las dos entregas y la relación con el spec maestro

### 5.1 Reparto

Un solo spec; cada entrega tiene su plan, su rama, su PR, su demostración (§24) y su recorrido del
usuario [Usuario, 14.1]. **La Fase 14 del spec maestro se cierra cuando se fusiona la 14B.**

| Entrega | Qué incluye | Secciones |
|---|---|---|
| **14A — El indicador de punta a punta** | Maestros (tipo, clasificación, unidad, objetivos) y parámetros; ficha completa con formas de fórmula e intérprete, aprobación con firma, versiones, duplicar, retirar, nivel de acceso y norma enlazada; medición con validaciones, «no aplica», análisis, soportes, observaciones, históricos y metas por periodo; semáforo, frases y comparación; tareas, recordatorios, alertas y escalamiento; cierre del mes y reapertura; lista, página del indicador con gráficas, matriz del año, ficha impresa y Excel; indicadores en la página del proceso y en la búsqueda | §6 a §13, §16 (maestro), §17.1 |
| **14B — Datos compartidos, automáticos y avanzados** | Variables compartidas; fuente automática (los siete cálculos documentales, «Reportes a tiempo» y «Objetivos cumplidos») con su enlace a Vigencia; página «Objetivos»; constancias de envío al ente e impactos por cambio de norma; desagregación y compuestos | §14 a §18 |

Al cerrar la 14A el hospital ya puede cargar y medir indicadores como los de su Excel.

### 5.2 En qué se aparta del spec maestro

- **Quién administra la ficha.** El maestro dejó «administrar» solo en Admin SGC. Ahora el Admin
  SGC elabora y **aprueba Gerencia o el líder del proceso**, con firma [Usuario, tema 7].
- **Tres funciones designadas, no dos.** El maestro designaba quién reporta y quién hace
  seguimiento (`indicador_usuarios`); ahora son quién mide, quién analiza y quién hace seguimiento
  [Usuario, 3.14 y 5.1].
- **Dos clasificaciones.** El maestro `tipos_indicador` nacía con estratégico, operativo y
  regulatorio; ahora «Tipo» es eficacia, eficiencia o efectividad y «Clasificación» es la otra
  lista [Usuario, 3.1].
- **Variables.** El maestro las ponía todas en un catálogo por proceso; ahora son propias por
  omisión y compartidas solo cuando hace falta [Usuario, tema 4].
- **Alertas.** El maestro avisaba siempre al responsable, a seguimiento y al Admin SGC; ahora el
  destinatario depende del color [Usuario, 13.6].
- **Estados de la medición.** El maestro tenía «pendiente, reportada, cerrada»; se guardan esos
  tres y se muestran los seis de 5.4 (§8.5).
- **Meta.** El maestro programaba la meta por periodo; ahora la ficha trae una meta base que cada
  periodo hereda [Usuario, 3.3]. «Sin meta» sigue existiendo (§7.5).
- **Demostración del maestro (§8).** «Un indicador con dos variables compartidas» pasa a la 14B;
  el resto se reparte como dice §5.3.

### 5.3 Trazabilidad con el spec maestro §6.2 y §8

| Del spec maestro | Dónde queda | Entrega |
|---|---|---|
| 2.1 Ficha técnica | §7 | 14A |
| 2.2 Compuestos y por niveles | §7.4 (variables y fórmula), §18 | 14A y 14B |
| 2.3 Metas por periodo | §7.5, §8.9 | 14A |
| 2.4 Semaforización | §7.5, §8.3 | 14A |
| 2.5 Gráficas | §11; comparativo por categoría en §18 | 14A y 14B |
| 2.6 Alertas por desviación | §10.3 (campana; correo en la Fase 16) | 14A |
| 2.7 Recordatorios de reporte | §10.2 (campana; correo en la Fase 16) | 14A |
| 2.8 Análisis y evidencias | §8.4, §8.2 | 14A |
| 2.9 Permisos por indicador | §6 | 14A |
| Rec. 1 Rojo abre acción | §8.4: marca «requiere acción de mejora»; la acción, en la Fase 15 | 14A |
| Rec. 2 Variables compartidas | §14 | 14B |
| Rec. 3 Ficha versionada | §7.6 | 14A |
| Rec. 4 Cierre de periodo | §9 | 14A |
| Rec. 5 «Sin dato» no es cero | §8.5, §11 | 14A |
| Rec. 6 Regulatorios y normograma | §17 | 14A (norma) y 14B (constancias, impactos) |
| Demo: crear con dos variables compartidas y probar la fórmula | §24 | 14B (la prueba de fórmula, 14A) |
| Demo: programar metas; reportar dos periodos, uno en rojo; semáforo y gráfica con hueco | §24 | 14A |
| Demo: cerrar el periodo y corregir con justificación | §24 | 14A |
| Demo: regulatorio enlazado a una norma | §24 | 14A |
| Demo: un designado reporta sin ser líder | §24 | 14A |
| Seguridad: intérprete con entradas hostiles | §21, §23 | 14A |
| Manual: «Indicadores: ficha técnica, reporte y análisis» | §25 | 14A, ampliado en la 14B |

## 6. Actores, permisos y visibilidad

### 6.1 Quién es quién

| Persona | En el sistema |
|---|---|
| Administrador del SGC (`admin_sgc`) | Elabora y cambia las fichas, designa a las personas, programa metas, cierra el mes y reabre mediciones, mantiene los maestros y los parámetros, retira indicadores, registra históricos y deja observaciones. **No reporta** mediciones ordinarias salvo que esté designado o que el indicador no tenga a nadie activo que mida [Decisión de Claude, F14-DC10] |
| Gerencia (`gerencia`) | Aprueba las fichas que le tocan (§7.6); ve todo, también lo restringido; deja observaciones; recibe alertas donde esté designada en seguimiento |
| Control Interno (`control_interno`) | Ve todo, también lo restringido; deja observaciones |
| Líder de proceso (`lider_proceso`) | Aprueba las fichas operativas de sus procesos; mide y analiza cualquier indicador de sus procesos y de sus subprocesos; ve soportes y observaciones de ellos; recibe los avisos de vencido y las alertas críticas |
| Quien mide | Cualquier usuario activo designado: digita los datos, adjunta soportes, marca «no aplica», corrige antes del cierre, registra históricos y (14B) la constancia de envío. No cambia su rol |
| Quien analiza | Cualquier usuario activo designado: escribe el análisis y responde observaciones. Por omisión, la misma persona que mide |
| Quien hace seguimiento | Cualquier usuario activo designado: recibe las alertas y deja observaciones |
| Personal (cualquier sesión) | Ve los indicadores generales: ficha vigente, resultados, gráfica y análisis |

Una persona puede tener varias funciones en un indicador y cada función puede tener varias
personas. Si un indicador no tiene a nadie activo que mida, las tareas de medir van a los líderes
activos del proceso y, si tampoco hay, al Admin SGC (precedente F13A-DC2); lo mismo para analizar.
En ese último caso **el Admin SGC sí puede reportar y analizar**: la tarea dice «sin responsable:
designe a alguien» y el evento queda marcado (`sinMedidor`), como `propioCorrector` en los
hallazgos. En cuanto haya un designado o un líder activo, deja de poder.

### 6.2 Permisos nuevos en la matriz (`src/lib/permisos.ts`)

| Permiso | Roles | Qué concede |
|---|---|---|
| `indicadores.administrar` | `admin_sgc` | Crear, editar, enviar a aprobación, cambio menor, duplicar, retirar y borrar fichas; designar; cambiar datos de operación y nivel de acceso; programar metas; cerrar el mes y reabrir; registrar históricos; maestros y parámetros; (14B) catálogo de variables compartidas, dimensiones, objetivos y resolver impactos sobre indicadores |
| `indicadores.aprobar` | `gerencia`, `lider_proceso` | Aprobar o devolver una ficha **de la que se es el aprobador** (§7.6) |
| `indicadores.medir` | Los cinco roles | Reportar, analizar, corregir y adjuntar soportes en un indicador **donde se está designado para esa función**, o que se lidera; (14B) reportar un dato compartido del que se es responsable y registrar la constancia de envío |
| `indicadores.observar` | Los cinco roles | Dejar una observación: `admin_sgc`, `gerencia` y `control_interno` en cualquier indicador que vean; los demás, solo donde estén designados en seguimiento. Responderla: quien puede analizar |

Cada celda lleva su test. `indicadores.medir` e `indicadores.observar` los tienen los cinco roles
por la razón de `distribucion.responder` (spec 13B §6.2): toda escritura exige un permiso de
matriz, y la persona designada puede tener cualquier rol; la condición de persona se comprueba en
el servidor además del permiso. **Ver** no lleva permiso: lo decide §6.4. No hay permisos por
persona (cambio 15 de la 13A): las designaciones son condiciones de persona, como el responsable de
un punto de uso.

### 6.3 Reglas de separación

- **Quien elabora la ficha no la aprueba** [Spec maestro §5.1; Usuario, 7.1]. Elabora siempre un
  Admin SGC y aprueba Gerencia o un líder (§7.6), así que nunca son la misma persona; el servidor lo
  comprueba igual.
- **Quien corrige un dato cerrado no decide reabrirlo:** reabre el Admin SGC, corrige quien mide
  [Usuario, 5.6]. Si el Admin SGC es además quien mide ese indicador, puede hacer las dos cosas y
  el evento lo marca (`propioMedidor`), como `propioCorrector` en los hallazgos.
- **Quien cierra el mes no produce los datos:** el Admin SGC no reporta mediciones ordinarias salvo
  designación expresa o que nadie más pueda (§6.1, F14-DC10).
- **Un dato automático no lo toca nadie** [Usuario, 6.2]: ni quien mide ni el Admin SGC.

### 6.4 Quién ve qué

| Qué | Quién lo ve |
|---|---|
| Indicador **general** con ficha aprobada: ficha vigente, versiones anteriores y control de cambios, resultados, semáforo, gráficas, acumulado, análisis (con causa y acción propuesta), historial de la medición sin los soportes | Toda persona con sesión [Usuario, 9.1 y 9.4] |
| Indicador **restringido** (lo mismo) | `admin_sgc`, `gerencia`, `control_interno`; quien tiene asignado el proceso del indicador (`usuario_procesos`, proceso activo), con cualquier rol; y sus designados [Usuario, tema 9] |
| **Soportes** (archivos) y **observaciones** de una medición | `admin_sgc`, `gerencia`, `control_interno`; los líderes del proceso del indicador; y sus designados [Usuario, 9.2] |
| Ficha en **borrador** o **por aprobar** (también el borrador de una versión nueva de un indicador ya aprobado) | Quien tiene `indicadores.administrar` y, cuando está por aprobar, quien debe aprobarla [Usuario, 9.4] |
| Indicador **retirado** | Como cuando estaba activo, marcado «Retirado»; fuera de la lista por omisión (filtro) y de la matriz del año en que ya no se midió |
| Pestañas «Por aprobar» y «Cierre del mes» | La primera, quien administra o aprueba; la segunda, quien administra |
| (14B) Catálogo y valores de una variable compartida | `admin_sgc`, `gerencia`, `control_interno`, los líderes de su proceso y sus responsables; el valor aparece además en la tabla de cada indicador que la usa, a quien ve ese indicador |

Para quien no puede ver algo, **no existe**: página «no encontrada», archivo 404, y fuera de
listas, conteos, la barra de estados, la búsqueda, la matriz, la página del proceso, los Excel, las
tareas y los avisos [Usuario, 9.3]. Un compuesto con un componente restringido es restringido
(§18.2); un objetivo no cuenta ni nombra los indicadores que la persona no ve (§16).

Las reglas viven en `src/lib/alcance.ts`, una función por pregunta (`filtroIndicadores` para un
`WHERE`, `puedeVerIndicador`, `puedeVerSoportes`, `puedeMedir`, `puedeAnalizar`, `puedeObservar`,
`puedeAprobarFicha`). Dos **excepciones nombradas** a la regla «el líder solo alcanza sus procesos»
de `alcanceProcesos()`: la **lectura** de indicadores generales es de toda sesión, como el
normograma; y **la designación** en un indicador da alcance sobre él aunque la persona no lidere
el proceso, como la participación en un trámite.

## 7. La ficha técnica (14A)

### 7.1 Identidad y código

- Un indicador pertenece a **un proceso** (obligatorio) y, si aplica, a **un subproceso** de ese
  proceso [Usuario, tema 2 y 2.4]. El **proceso queda fijo** desde la primera aprobación, como el
  código: decide la sigla, el alcance, quién aprueba y quién ve un restringido; para moverlo de
  proceso se retira y se duplica. El subproceso sí se puede cambiar, como cambio menor de la ficha
  [Decisión de Claude, F14-DC40]. El **procedimiento** es un enlace opcional a un documento del
  proceso, más el **punto de control** como texto («PC-13»); la ficha muestra el código y el título
  del documento solo a quien puede verlo (F13C-R11).
- **Código** `SIGLA-IND-NN`: la sigla del proceso, `IND` y un consecutivo de dos cifras por
  proceso (cuenta también los retirados; al pasar de 99 sigue con tres). El sistema lo propone y se
  puede editar mientras el indicador no tenga una versión aprobada; después queda fijo
  [Usuario, 2.3; Decisión de Claude, F14-DC18]. Es único sin distinguir mayúsculas.
- La sigla `IND` queda **reservada**: «Tipos de documento» rechaza crearla, para que
  `SGC-IND-01` no se confunda con un documento `PROCESO-TIPO-NN` [Decisión de Claude, F14-DC7].
  Hoy ningún tipo la usa (`IN` es Instructivo).
- Estado del indicador: `borrador` (aún sin versión aprobada), `activo`, `retirado` o `descartado`
  (se envió a aprobación alguna vez y nunca se aprobó, §7.7).

### 7.2 Contenido de la ficha (lo que se versiona y se firma)

| Campo | Regla | Si cambia |
|---|---|---|
| Nombre | Obligatorio | Menor |
| Proceso (fijo, §7.1) y subproceso | El subproceso es opcional | Menor (el subproceso) |
| Objetivo del indicador (qué se quiere saber) | Obligatorio | Menor |
| Requisito (texto corto: «NTC ISO 9001:2015, numeral 9.2») | Opcional [3.5] | Menor |
| Tipo (maestro: eficacia, eficiencia, efectividad) | Obligatorio [3.1] | Menor |
| Clasificación (maestro: estratégico, operativo, regulatorio) | Obligatoria [3.1]; decide quién aprueba | **Mayor** |
| Objetivo que mide (maestro de objetivos, §16) | Opcional [3.15] | Menor |
| Procedimiento y punto de control | Opcionales | Menor |
| Norma o normas que lo exigen (§17.1) | Obligatoria si la clasificación lo pide [10.1] | Menor |
| Se reporta a un ente: destinatario, periodicidad externa y plazo (§17) | Opcionales; informativos en la 14A | Menor |
| Cómo se obtiene el dato: lo digita una persona o lo calcula el sistema (§15) | La segunda opción llega con la 14B | **Mayor** |
| Forma y fórmula (§7.4) | Obligatorias | **Mayor** |
| Variables: nombre, descripción (qué incluye y qué excluye), fuente y unidad [3.10] | Al menos una | Menor |
| Variables: cuántas son, de dónde sale cada una (propia, compartida, automática, otro indicador) y cómo se junta [4.2] | | **Mayor** |
| Variables: límites de captura y «admite negativos» [4.4] | Opcionales | Menor |
| Unidad del resultado (maestro) | Obligatoria [3.6] | **Mayor** |
| Decimales con que se muestra (0 a 4) | Por omisión, los de la unidad | Menor |
| Periodicidad | Obligatoria | **Mayor** |
| Tendencia | Obligatoria [3.2] | **Mayor** |
| Meta base | Opcional (§7.5) [3.3] | **Mayor** |
| Semáforo: modo y umbral o límites (§7.5) | Obligatorio si hay meta [3.11] | **Mayor** |
| Límites del resultado (por ejemplo, entre 0 y 100 %) | Opcionales [4.4] | Menor |
| Línea base (valor y periodo, o «sin línea base» con nota) y sustento de la meta | Obligatoria una de las dos formas [3.12] | Menor |
| Responsable de medir y responsable de analizar: uno o varios **cargos** de Estructura | Al menos un cargo en cada uno [3.4, 3.14] | Menor |
| Dimensión (§18.1) | Opcional; 14B | **Mayor** |

«Mayor» y «menor» los decide el sistema comparando el borrador con la versión vigente (función
pura), no quien edita [Usuario, 7.2].

**Una versión guarda los textos tal como se firmaron** [Decisión de Claude, F14-DC40]. El tipo, la
clasificación, la unidad, el objetivo, los cargos, las normas, el proceso y el subproceso son
catálogos que se editan después. Por eso la versión guarda, además de la referencia (para filtrar y
enlazar), **el nombre que tenía cada uno al firmar**; la huella de la firma (§7.6) se calcula sobre
esos textos, y la ficha de una versión, en pantalla y en el impreso, muestra siempre los textos
firmados. Renombrar un cargo o una unidad no cambia ninguna ficha aprobada; la lista y los filtros
usan el nombre de hoy.

### 7.3 Datos de operación (no se versionan ni se firman)

El usuario fijó que «las personas designadas y el plazo de reporte no son contenido de la ficha y
no crean versión» (7.2). Para que eso no reabra el defecto que 3.9 corrigió (un documento aprobado
que cambia sin cambiar de versión), estos datos **viven fuera de la ficha firmada**, se cambian con
`indicadores.administrar`, quedan en bitácora con antes y después, y la hoja impresa los muestra en
un bloque aparte, «Datos de operación», debajo de las firmas [Decisión de Claude, F14-DC2; ajusta
3.13 y 3.16]:

- **Personas designadas** para medir, analizar y hacer seguimiento [5.1]. Al crear el indicador,
  «analiza» se llena con la misma persona que «mide».
- **Plazo de reporte** en días después del fin del periodo (por omisión, el parámetro de la
  entidad: 10) [3.13].
- **Inicio de medición:** el primer periodo que se mide; puede ser anterior a la aprobación
  (históricos, §8.8) [3.13; tema 8].
- **Soporte obligatorio** (casilla) [3.16].
- **Nivel de acceso:** general o restringido [tema 9].

### 7.4 Variables y fórmula

**Formas** [Usuario, 12.1]. Al crear el indicador se elige cómo se calcula; las cuatro primeras
arman solas la fórmula y sus variables:

| Forma | Fórmula | Variables |
|---|---|---|
| Porcentaje | A ÷ B × 100 | A numerador, B denominador |
| Tasa | A ÷ B × factor (100, 1.000, 10.000 o 100.000) | A casos, B población |
| Promedio o razón | A ÷ B | A suma, B cantidad |
| Conteo | A | A |
| Fórmula libre | La escribe el Admin SGC | Hasta 26, de la A a la Z |

Las ocho fichas del Excel son la primera forma. La fórmula se guarda siempre como expresión del
intérprete (`A / B * 100`) y se **muestra en palabras**, con los nombres de las variables:
«(Auditorías ejecutadas ÷ Auditorías programadas) × 100».

**Intérprete** (`src/lib/indicadores/formula/`, funciones puras) [Spec maestro §6.2; Decisión de
Claude, F14-DC14]:

- Acepta números (con coma o punto decimal), las letras de variable, `+`, `−`, `×` y `÷` (también
  `*` y `/`), paréntesis, el menos delante de un valor y tres funciones: `min(a; b)`, `max(a; b)` y
  `abs(a)`. Los argumentos se separan con **punto y coma**, como en Excel en español, para que la
  coma siga siendo decimal: `max(A; 0,5)`. Nada más: sin potencias, comparaciones, texto ni nombres
  libres.
- Límites: 300 caracteres, 20 niveles de paréntesis, literales de hasta 15 cifras.
- **Calcula con fracciones exactas** de enteros (`BigInt`): no hay error de coma flotante y el
  cumplimiento se decide con el valor exacto. Si una cifra intermedia pasa de 200 dígitos, el
  resultado es «sin resultado».
- Nunca lanza una excepción por una entrada del usuario ni ejecuta nada: devuelve el valor o «sin
  resultado» con su motivo («división por cero», «falta la variable B», «cifra fuera de rango»).
- Al guardar la ficha: la fórmula solo usa variables declaradas y usa todas las declaradas. La
  **prueba con valores de ejemplo** es obligatoria antes de enviar a aprobación y muestra el
  resultado, el color y la frase.

**Valores.** Cada variable recibe un número de hasta 15 cifras y 4 decimales, no negativo salvo que
la ficha marque «admite negativos» [4.4]. Cada variable dice **cómo se junta** al pasar a un periodo
mayor [4.2]: «se suma» (por omisión: atenciones, recaudo), «último valor» (saldo de cartera, camas)
o «promedio».

**Validaciones al digitar** [4.4]: los límites de captura de cada variable y los límites del
resultado rechazan el valor con un mensaje; y si el resultado se aleja del periodo anterior más que
el parámetro de variación (30 % por omisión), se pide una confirmación («El resultado baja 23 puntos
frente al trimestre anterior. ¿Los datos son correctos?»), que no bloquea.

### 7.5 Meta y semáforo

La **meta base** es opcional [Decisión de Claude, F14-DC4]: un indicador que solo se vigila (un
conteo de nacimientos) puede no tenerla. Sin meta en la ficha ni programada para el periodo, la
medición queda **«Sin meta»** en gris, no genera alertas y su análisis es opcional [Spec maestro,
DC23; Usuario, 11.5]. Los ocho indicadores del Excel la tienen.

Con meta, la **tendencia** gobierna el semáforo [3.2]. `M` es la meta, `L` el límite de crítico:

| Tendencia | Bien (cumple) | Atención | Crítico | Modo «relativo a la meta» |
|---|---|---|---|---|
| Ascendente (mayor es mejor) | resultado ≥ M | L ≤ resultado < M | resultado < L | L = M × u |
| Descendente (menor es mejor) | resultado ≤ M | M < resultado ≤ L | resultado > L | L = M ÷ u |
| Constante (mantenerse en un rango) | M₁ ≤ resultado ≤ M₂ | fuera del rango, hasta la tolerancia T a cada lado | más allá de T | No aplica: siempre rangos fijos |

- `u` es el **umbral de atención**: 70 % por omisión (parámetro de la entidad, como en el Excel),
  ajustable en cada ficha entre 1 y 99 % [11.5].
- El semáforo tiene **dos modos** [Spec maestro]: «relativo a la meta» (el límite se mueve con la
  meta de cada periodo) o «rangos fijos» (el límite se escribe). En tendencia descendente con meta
  0 (cero eventos) el modo relativo no sirve y el formulario exige rangos fijos. En constante, la
  meta es un rango (puede ser un solo valor) con su tolerancia, que puede ser 0.
- La ficha **escribe los rangos en palabras** [3.11], con una función pura que usan el formulario,
  la página, el reporte y el impreso: «Bien desde 90 % · Atención de 63 a 89,9 % · Crítico por
  debajo de 63 %».
- Solo «Bien» cuenta como **cumple** [11.5]. Son tres niveles: el estado `grave` del sistema
  visual no se usa en este módulo.
- **La cifra nunca contradice el veredicto:** se compara el valor exacto; lo que se muestra se
  redondea a los decimales de la ficha y, si el redondeo llegara a contradecir el color (89,96 %
  con meta 90 se vería «90,0 %»), se muestra truncado, como hace `textoPorcentaje` en los
  indicadores documentales.

### 7.6 Versiones: elaborar, aprobar, cambiar

Estados de una versión: `borrador` → `por_aprobar` → `aprobada`; el aprobador puede **devolverla**
con nota (vuelve a `borrador`) y quien elabora puede **descartarla**. Un indicador tiene a lo sumo
un borrador o una versión por aprobar a la vez.

1. **Elaborar.** El Admin SGC llena el formulario (§12.4) y guarda el borrador, o lo **envía a
   aprobación** con su clave: queda la firma «Elaboró» [Usuario, tema 7].
2. **Quién aprueba** [7.1]. Lo dice la Clasificación (columna «aprueba» de su maestro, editable):
   `gerencia` para estratégicos y regulatorios, `lider` para operativos, como valores iniciales.
   Con `gerencia`, cualquier usuario activo de rol Gerencia; con `lider`, cualquier líder activo del
   proceso del indicador. Siempre alguien **distinto de quien elaboró**; si con `lider` no queda
   nadie (el proceso no tiene líder, o el único líder elaboró), aprueba Gerencia [Decisión de
   Claude, F14-DC19]. Se resuelve en el momento de aprobar, no al enviar.
3. **Aprobar** con clave: firma «Aprobó», la versión pasa a `aprobada`, el indicador a `activo` si
   era su primera versión, y rige desde el periodo indicado. **Devolver:** nota obligatoria, sin
   clave; avisa a quien elaboró.
4. **En bloque** [7.3]. La pestaña «Por aprobar» lista las fichas que la persona puede aprobar;
   selecciona varias y firma con una sola clave. Es todo o nada: si alguna ya no está por aprobar,
   no se firma ninguna y el mensaje dice cuál.
5. **Cambiar una ficha aprobada** [7.2]. «Editar ficha» crea un borrador con el contenido vigente;
   el **motivo del cambio** es obligatorio. Si el cambio es **menor**, quien elabora lo publica con
   su clave (firma «Elaboró») y rige de inmediato, sin tocar ninguna medición. Si es **mayor**, va a
   aprobación y **rige desde un periodo aún no reportado**: por omisión, el primero sin reporte; se
   puede correr hasta el periodo en curso, **nunca a uno que no ha empezado** (la vigencia en fecha
   futura es de la Fase 16). La validación rechaza un periodo con medición ya reportada [Decisión de
   Claude, F14-DC17]. Las mediciones anteriores conservan su versión [Spec maestro, rec. 3]. Así,
   **la ficha vigente es siempre la última versión aprobada**, y de ella parte cualquier cambio.
6. **Control de cambios** [3.17]: por versión, desde cuándo rige, si fue inicial, mayor o menor,
   qué campos cambiaron (lista generada), por qué, quién elaboró y quién aprobó, con sus fechas. Lo
   ve, con las versiones anteriores completas, quien ve el indicador [9.4].

Las firmas van en la tabla **`firmas`**, la misma de los documentos, con la versión de la ficha como
dueña (§19.1) y como huella el SHA-256 del contenido de §7.2 en forma canónica: una sola tabla de
firmas, de solo inserción, con nombre y cargo del firmante congelados [Decisión de Claude, F14-DC8].
Las tres firmas («Elaboró» al enviar, «Elaboró» de un cambio menor y «Aprobó») siguen F13A-R4.

### 7.7 Duplicar, retirar y borrar

- **Duplicar** [12.2]: «Crear a partir de este» abre un indicador nuevo en borrador, versión 1, con
  el contenido de la ficha y los datos de operación del original; pide el proceso y propone el
  código. No copia mediciones ni metas programadas.
- **Retirar** [7.5]: el Admin SGC, con motivo obligatorio y sin clave. El indicador queda
  `retirado` con su fecha; no abre más periodos; sus mediciones abiertas sin ningún dato se quitan
  (no tienen historia) y las que tienen datos siguen su curso hasta el cierre; su borrador o su
  versión por aprobar se descarta; se avisa a los designados. Es definitivo: para volver a medirlo
  se duplica [Decisión de Claude, F14-DC18].
- **Borrar:** solo un indicador que **nunca se envió a aprobación** («borrar solo si vacío», D47).
  Enviarlo deja la firma «Elaboró» en `firmas`, que no admite borrado.
- **Descartar:** un indicador que se envió y nunca se aprobó (devuelto o abandonado) se descarta
  con motivo: queda `descartado`, visible solo para quien administra, y **su código sigue ocupado**
  [F14-DC18].

### 7.8 La ficha impresa

«Imprimir ficha» abre una página con hoja de estilos de impresión (sin PDF en el servidor), con el
diseño del Excel del usuario [3.8, 3.9] y la marca de la entidad (`obtenerMarca()`); maqueta 7:

1. Encabezado: logo, nombre de la entidad, «Ficha técnica de indicador», código, versión, vigente
   desde.
2. **Identificación** y **Estructura de medición**: el contenido de §7.2, con la fórmula y los
   rangos en palabras.
3. **Firmas:** «Elaboró» y «Revisó y aprobó», con nombre, cargo y fecha tomados de `firmas`.
4. **Control de cambios.**
5. **Datos de operación** (§7.3), rotulados como tales.
6. **Seguimiento y medición** del año elegido: una fila por periodo de la periodicidad (no doce
   meses fijos) [3.7] con sus variables, resultado, meta, «Cumple», semáforo y análisis; cada bloque
   dice con qué versión de la ficha se calculó [3.9]; cierra con el **Acumulado del año** (§8.10).
7. **Gráfica** del año, con relleno sólido y con el valor y el estado escritos en cada columna,
   para que se lea en blanco y negro.

No imprime soportes ni observaciones. La imprime quien ve el indicador («imprimir» no se separa de
«consultar», spec maestro §6.2).

## 8. La medición (14A)

### 8.1 Periodos y plazo

- Periodicidades: mensual, bimestral, trimestral, semestral y anual, del calendario. Claves:
  `AAAA-MM`, `AAAA-B1` a `B6`, `AAAA-T1` a `T4`, `AAAA-S1` y `S2`, `AAAA`. `periodoDe`
  (`src/lib/indicadores-documentales/periodo.ts`) gana el bimestre, que hoy no conoce.
- Hay **una medición por indicador y periodo**. Su fila se crea («el periodo se abre») cuando el
  periodo termina, para todo indicador activo cuyo inicio de medición no sea posterior. La abre la
  revisión de vencimientos y, además, la lista, la página del indicador, la matriz y «Mis tareas»
  lo aseguran antes de leer; la operación es idempotente [Decisión de Claude, F14-DC12].
- **No se reporta un periodo que no ha terminado** [Decisión de Claude, F14-DC11].
- La fecha límite es el fin del día, en la zona de la instalación, del último día del periodo más
  el plazo de reporte.
- Al aprobarse la primera versión se abren de una vez los periodos **históricos**: desde el inicio
  de medición hasta el último que terminó antes de la aprobación (§8.8).

### 8.2 Reportar

Maqueta 3. Lo hace quien puede medir (§6.1).

- Un campo por variable, con su nombre, su descripción y su fuente. El resultado, el color y la
  frase aparecen mientras se digita, calculados con la misma función pura que usa el servidor; el
  servidor recalcula siempre y es quien manda.
- Se aplican las validaciones de §7.4. Si el intérprete da «división por cero», el formulario
  ofrece **«No aplica en este periodo»**, que exige motivo (al menos 5 caracteres), cuenta como
  reportado, queda en gris, no pide análisis ni soporte y no genera recordatorios ni alertas [4.5].
- **Soportes** [Spec maestro 2.8]: uno o varios archivos por medición, por `recibirArchivo`
  (contexto `medicion`), de hasta 25 MB cada uno: PDF, imagen (PNG, JPG, WebP) o **Excel `.xlsx`**.
  Hoy `validarTipoEvidencia` solo admite PDF e imagen; se amplía para este contexto, porque el
  usuario aceptó adjuntar el Excel de origen (8.2). No se admite `.xls` (su contenedor es el mismo
  de un `.doc` y no se pueden distinguir), ni Word, comprimidos, SVG o HTML: un Excel viejo se
  guarda como `.xlsx` o como PDF [Decisión de Claude, F14-DC5]. Queda un riesgo conocido, el mismo
  que ya se aceptó en los documentos: la muestra de magic bytes no siempre distingue un `.xlsx` de
  un ZIP renombrado. Aquí se acota así: el soporte se sirve **siempre como descarga**, con su MIME y
  `nosniff`, solo a quien ve soportes (§6.4), con `no-store` y sin marca de agua. Con «soporte
  obligatorio», no se puede reportar sin al menos uno [3.16]. Antes del cierre, quien mide puede
  quitar un soporte (queda el evento); después, no.
- «Guardar sin reportar» conserva lo digitado y la medición sigue abierta.
- Cuando los datos quedan completos se calcula el resultado, se **congelan** en la medición la
  versión de la ficha, la meta y el límite aplicados, se registra el evento y salen las alertas
  (§10.3).
- **Un solo camino de cálculo:** una función (`recalcularMedicion`) es la única que escribe el
  resultado, el semáforo, la meta aplicada y el estado de una medición; reportar, corregir,
  reprogramar la meta y reabrir pasan por ella, con la fila bloqueada (`FOR UPDATE`).

### 8.3 Resultado, frase y comparación

- **Frase** [regla 2 de §1], función pura: «Cumple: 92 % frente a una meta de 90 %.»; «No cumple:
  60 % frente a una meta de 90 %.»; en descendente, «Cumple: 28 min frente a una meta de máximo 30
  min.»; en constante, «Cumple: 100 % dentro del rango de 98 a 100 %.»; «92 %, sin meta para este
  periodo.»; «No aplica: no había auditorías programadas.»; «Sin dato: no se reportó.».
- **Comparación** [12.4]: con el periodo anterior medido y con el mismo periodo del año anterior:
  «4 puntos más que en marzo; 2 menos que en abril de 2025». En porcentajes se habla de puntos; en
  lo demás, de la unidad («4 min menos»). La flecha dice hacia dónde fue el valor y el texto dice
  si eso es mejorar, según la tendencia («▼ baja 4 min · mejora»).
- La tabla conserva la columna **«Cumple»** (Sí o No) del Excel, además del estado.

### 8.4 Análisis

Lo escribe quien puede analizar (§6.1).

| Resultado | Análisis |
|---|---|
| Bien, o sin meta | Opcional [5.2] |
| Atención | Obligatorio (al menos 10 caracteres) [5.2] |
| Crítico, o incumplimiento repetido (§10.3) | Obligatorio en dos partes: **causa de la desviación** y **acción propuesta** [5.3] |
| No aplica | No se pide: basta el motivo |

En crítico la medición queda marcada **«Requiere acción de mejora»**: se ve como insignia, se
filtra en la lista y la Fase 15 la convierte en acción formal y enlaza la medición [Spec maestro,
rec. 1]. El análisis se puede editar hasta el cierre; cada edición deja su evento.

### 8.5 Estados

Se guardan tres (`abierta`, `reportada`, `cerrada`) y se muestran los del usuario [5.4], con una
función pura:

| Lo que se ve | Cuándo |
|---|---|
| Por reportar | Abierta, faltan datos que digita una persona y está dentro del plazo |
| Falta un dato | Abierta y falta un dato que no depende de quien abre el reporte: una variable compartida, automática o de otro indicador (14B) |
| Falta el análisis | Abierta, con los datos completos, no cumple y no tiene el análisis exigido |
| Vencida | Abierta y pasó la fecha límite; se muestra con lo que falta («Vencida · falta el análisis») |
| Reportada | Tiene los datos (o «no aplica») y el análisis exigido |
| Cerrada | La cerró un cierre del mes, con su resultado, «Sin dato» o «No aplica» |

Pasa sola de abierta a reportada cuando queda completa, y vuelve a abierta si una corrección la
deja sin el análisis que ahora exige. Marcas que acompañan al estado: «Histórico», «Corregida»,
«Requiere acción de mejora», «Meta ajustada después del periodo».

**«Sin dato» no es cero** [Spec maestro, rec. 5]: un periodo no reportado se muestra vacío y en
gris en la tabla, la matriz, el Excel y la gráfica (un hueco), y no entra a ningún acumulado.

### 8.6 Observaciones

[Usuario, 5.5.] Las escribe quien puede observar (§6.2): texto de hasta 2.000 caracteres, de solo
inserción, sin edición ni borrado. **Responde** quien puede analizar ese indicador (y el Admin SGC).
Una observación está «sin respuesta» hasta su primera respuesta. Avisa a quienes analizan; la
respuesta avisa a quien observó. Genera la tarea «Responder la observación» para quien analiza
[Decisión de Claude, F14-DC21]. No bloquea nada, se puede añadir después del cierre (no cambia el
dato) y el resumen del cierre lista las que siguen sin respuesta. Las ven los de §6.4.

### 8.7 Corrección

- **Antes del cierre** [5.6], quien puede medir cambia valores, «no aplica» y soportes. Cada cambio
  deja un evento con el antes y el después de los valores y del resultado, además de la bitácora;
  se recalcula, y si cambia el color sale el aviso de corrección (§10.3).
- **Después del cierre**, el Admin SGC **reabre** la medición con justificación (al menos 10
  caracteres, sin clave): vuelve a `reportada` (o a `abierta` si estaba sin dato), queda marcada
  «Corregida», se avisa a quien mide, y quien mide corrige o reporta tarde. Se cierra otra vez con
  el siguiente cierre del mes o cuando el Admin SGC pulse «Cerrar de nuevo» [Decisión de Claude,
  F14-DC31]. La tabla muestra «Corregida» con el historial: qué había, qué quedó, quién, cuándo y
  por qué.
- En un indicador de fuente automática (14B), reabrir solo deja cambiar el análisis [6.2].

### 8.8 Históricos

[Usuario, tema 8.] Es **histórico** todo periodo que terminó antes de aprobarse la primera versión
de la ficha; la regla es automática.

- Se digitan en la **tabla del año** de la página del indicador, en modo edición: una fila por
  periodo, una celda por variable, y se guardan varias filas a la vez [8.1]. Los registra el Admin
  SGC o quien puede medir [8.3].
- Quedan marcados «Registro histórico», con quién y cuándo. No generan tareas, recordatorios,
  alertas ni escalamiento; el análisis y el soporte son opcionales aunque el indicador exija
  soporte; el semáforo sí se calcula y se ve [8.2].
- Los rige la primera versión aprobada de la ficha.
- Su cierre lo define §9.
- Tres precisiones [Decisión de Claude, F14-DC41]:
  - **Su meta se programa sin justificación ni marca** mientras el histórico no esté cerrado: la
    regla «después del periodo» de §8.9 no les aplica, porque todos terminaron antes de existir la
    ficha.
  - **Un histórico crítico no lleva «Requiere acción de mejora»:** se ve en rojo, pero no es un
    pendiente de hoy para la Fase 15.
  - **No cuentan para el incumplimiento repetido** (§10.3), ni lo rompen: la racha empieza con las
    mediciones ordinarias. Así, digitar la historia después no cambia marcas ya puestas.

### 8.9 Metas por periodo

[Usuario, 3.3 y 7.4.] «Programar metas», en la página del indicador (Admin SGC): la tabla de los
periodos del año con la meta que heredan y un campo para cambiarla. Sin clave; queda en bitácora
con antes y después.

- **Antes de que el periodo termine:** libre.
- **Después de terminado y antes del cierre:** exige justificación (al menos 10 caracteres), deja
  la marca «Meta ajustada después del periodo» en la tabla, recalcula la medición y, si cambia el
  color, avisa como una corrección.
- **Después del cierre:** solo reabriendo la medición.
- En modo relativo el límite sigue a la meta nueva. En rangos fijos el límite es el de la ficha: si
  con la meta nueva queda del lado equivocado, se rechaza y hace falta una versión nueva.

### 8.10 Acumulado del año

[Usuario, 3.7.] Una función pura junta cada variable de los periodos medidos del año con su regla
(suma, último valor o promedio; «no aplica» y «sin dato» se saltan) y aplica la fórmula. **Nunca
promedia resultados.** Reglas [Decisión de Claude, F14-DC16]:

- Se juzga contra la meta del último periodo medido del año.
- Si falta algún periodo ya terminado, se rotula «Acumulado parcial: falta julio».
- Si en el año rigieron versiones con variables o fórmula distintas, cubre solo los periodos de la
  versión vigente y lo dice («Acumulado desde julio, versión 2»).

Es el mismo cálculo en la página, la matriz (columna «Año»), el impreso, el Excel y, en la 14B, el
resultado del periodo externo de un regulatorio.

## 9. Cierre del mes (14A)

[Usuario, 4.6; spec maestro, rec. 4.] Pestaña «Cierre del mes», solo para quien administra.

1. El Admin SGC elige el mes: por omisión, el siguiente al último cerrado; nunca uno que no ha
   terminado. «Cerrar hasta marzo» alcanza toda medición cuyo periodo terminó en marzo o antes.
2. **Resumen previo:** cuántas mediciones se van a cerrar y, por proceso, las reportadas, las que
   quedarán **sin dato** (con quién debía medir), las «no aplica», las que tienen datos pero les
   falta el análisis, las observaciones sin respuesta y dos grupos que **no se cierran**: las que
   siguen dentro de su plazo de reporte y los históricos sin registrar.
3. Confirma, **sin clave** [Decisión de Claude, F14-DC9: es una rutina mensual y cada medición se
   puede reabrir con justificación; la clave se reserva para lo que congela un documento].

Efecto, en una transacción: una fila del cierre (mes, quién, cuándo y los conteos del resumen) y
cada medición alcanzada pasa a `cerrada`: la reportada, con su resultado; la que no tiene datos,
como «Sin dato»; la que tiene datos y le falta el análisis, con su resultado y la marca «sin
análisis».

Dos precisiones que **ajustan la letra de 4.6 y de 8.3** [Decisión de Claude, F14-DC3]:

- **No se cierra una medición que aún está dentro de su plazo de reporte:** queda para el
  siguiente cierre. Si no, cerrar el 1 de abril dejaría «sin dato» lo que tenía plazo hasta el 10.
- **No se cierra un histórico sin registrar:** sigue abierto, sin tarea ni aviso, hasta que se
  registre; el histórico ya registrado sí se cierra con el cierre que lo alcance. Si no, el primer
  cierre bloquearía toda la historia por llenar y habría que reabrirla periodo por periodo, contra
  8.1.

Después del cierre, los valores, el resultado, el análisis y los soportes de una medición cerrada
**no cambian** (lo impide un trigger, §19.3); sí admite observaciones. Reportar tarde o corregir
pide la reapertura de §8.7. Un cierre no se deshace: se corrige medición por medición. En la 14B el
cierre congela también los valores de las variables compartidas y las fotos de los cálculos de esos
periodos.

## 10. Tareas, recordatorios y alertas (14A)

Todo va por «Mis tareas» y la campana; la Fase 16 lleva las mismas reglas al correo. Hasta entonces
el recordatorio lo ve quien entra a la plataforma [Usuario, tema 13].

### 10.1 «Mis tareas»

Calculadas del estado, con módulo `indicadores` (que `Tarea` y `MisTareas` ya admiten):

| Tarea | Para quién | Vence |
|---|---|---|
| «Reportar *código nombre*, *periodo*» | Quienes miden el indicador (§6.1) | Fecha límite |
| «Analizar *código nombre*, *periodo*» (datos completos, no cumple, sin análisis) | Quienes analizan | Fecha límite |
| «Responder la observación de *nombre* en *código*» | Quienes analizan | — |
| «Aprobar la ficha de *código*» | Quienes pueden aprobarla (§7.6) | — |
| «Ficha devuelta: *código*» | Quien la elaboró | — |

Con más de cinco tareas de un mismo tipo se agrupan en una («12 indicadores por reportar, 3
vencidos»), que lleva a la lista filtrada o a «Por aprobar» [13.5]. La entrada «Indicadores» de la
barra lateral lleva una insignia con las mediciones **vencidas** a cargo de la persona [Decisión de
Claude, F14-DC32]. Las tareas de la 14B están en §14, §17 y §18.

### 10.2 Recordatorios

Una pasada nueva, `revisarVencimientosDeIndicadores`, se suma a `revisarVencimientos`, con el
patrón de las anteriores: cada medición en su transacción corta, `FOR UPDATE SKIP LOCKED`, marcas
releídas bajo el candado y sin fila en `auditoria`. Hace cuatro cosas:

1. **Abre** los periodos que terminaron (§8.1).
2. **Aviso previo** [13.2]: cuando faltan los días del parámetro (3) para la fecha límite y la
   medición sigue abierta, un aviso por persona: «Tiene 4 indicadores por reportar antes del 10 de
   abril».
3. **Vencido** [13.3]: al pasar la fecha límite, un aviso agrupado por persona a quienes miden (o a
   quienes analizan, si lo que falta es el análisis) y otro, agrupado por proceso, a sus líderes.
4. **Escalamiento** [13.4]: pasados los «días para avisar al jefe» de Configuración documental
   (`escalamiento_dias`), un aviso a los jefes (`jefesDe`) de quienes miden: «2 reportes de
   indicadores a cargo de *nombre* siguen vencidos. Vencieron hace 5 días.», **sin código, nombre
   ni enlace** del indicador, que puede ser restringido [Decisión de Claude, F14-DC34]. El Admin SGC
   no recibe aviso.

Cada aviso se manda una vez (marcas en la medición). Los históricos y los «no aplica» no generan
nada.

### 10.3 Alertas de resultado

En la misma transacción del reporte, **cuando el resultado queda calculado**, aunque falte el
análisis: es justo lo que quien analiza necesita saber [Decisión de Claude, F14-DC30].

| Resultado | Reciben la alerta |
|---|---|
| Bien, sin meta o no aplica | Nadie |
| Atención | Quienes analizan y quienes hacen seguimiento |
| Crítico | Además, los líderes del proceso y los Admin SGC |

[Usuario, 13.6.] Gerencia la recibe donde esté designada en seguimiento. No se avisa a quien acaba
de reportar. El texto lo dice en palabras, con enlace al indicador: «Oportunidad de cita: 62 %
frente a una meta de 90 %, Crítico. Marzo de 2026».

- **Corrección** [13.7]: si un recálculo (por corregir datos, reprogramar la meta o reabrir) cambia
  el estado respecto del último alertado, se avisa a los destinatarios del estado anterior y del
  nuevo: «Corrección: … pasó de Crítico a Bien».
- **Incumplimiento repetido** [13.8]: si esta medición y las anteriores medidas, hasta completar el
  número del parámetro (3), no alcanzan la meta, se trata como crítica para la alerta, para la marca
  «Requiere acción de mejora» y para el análisis en dos partes. **El color no cambia**: se añade la
  insignia «3 periodos sin cumplir». Los periodos «no aplica», «sin dato» e históricos ni cuentan
  ni rompen la racha [Decisión de Claude, F14-DC20].

### 10.4 Otros avisos y parámetros

Avisan también: una ficha enviada a aprobación (a quienes pueden aprobarla, agrupado si son varias),
aprobada o devuelta (a quien la elaboró); una observación y su respuesta; una medición reabierta (a
quienes miden); un indicador retirado (a sus designados); y una designación nueva (a la persona:
«Ahora mide SGC-IND-01»). Reportar un resultado que cumple no avisa a nadie (precedente F13C-DC3).
Ningún aviso lleva contenido de un soporte.

Parámetros, en «Configuración de indicadores» (§12.6), con su valor inicial: umbral de atención
(70 %), aviso previo (3 días), plazo de reporte por omisión (10 días), periodos de incumplimiento
repetido (3) y variación que pide confirmación (30 %).

## 11. Gráficas (14A)

El usuario eligió el **estilo A, «Tubos»** (`estilo-graficas-v3.html`). La gráfica principal va
**siempre en columnas** [Decisión de Claude, F14-DC1]: es la del Excel del usuario (columnas con la
meta como línea) y casi todos sus indicadores son trimestrales, semestrales o anuales, donde una
línea con cuatro, dos o un punto no dice nada.

**Piezas**

1. **Gráfica principal, por periodo.** Un tubo por periodo del rango elegido (el año en curso por
   omisión; también dos años o todo):
   - El tubo vacío (la pista) muestra la escala completa; el relleno, con volumen y brillo, llega
     hasta el resultado y lleva el color de su estado.
   - Un periodo «sin dato» o «no aplica» es un tubo vacío con «s. d.» o «n. a.» debajo; un periodo
     que aún no llega, un tubo más tenue.
   - El valor va escrito debajo de cada periodo.
   - La meta es una línea con su etiqueta («Meta 85 %»); el límite de crítico, una línea punteada
     con la suya. Si la meta cambia entre periodos, la línea es escalonada. En tendencia constante
     se dibuja la franja del rango. Sin meta, los tubos van en un tono neutro y no hay líneas.
2. **Acumulado del año:** un tubo acostado con la marca de la meta.
3. **Variables:** una gráfica pequeña por variable. Nunca dos escalas en una misma gráfica.
4. **En la lista:** la tendencia en miniatura por fila y, arriba, una barra con cuántos
   indicadores hay en cada estado.
5. **Matriz del año:** es una tabla, con el valor y una franja de color por celda (§12.7).
6. (14B) **Barras por categoría** de un indicador desagregado (§18.1).

**Reglas** (spec maestro §5.11 y las de este proyecto):

- SVG propio, sin librería. Una sola escala por gráfica.
- Los colores de estado solo significan estado. El texto nunca lleva el color del estado: el
  color va en la marca y el nombre del estado o el número, al lado.
- Toda gráfica tiene su **tabla equivalente** accesible. La tabla del año ya lo es para la
  principal.
- **Tarjeta al pasar el cursor y al enfocar con el teclado**, con el periodo, el valor, el estado y
  la meta; el área sensible es toda la columna, no solo el relleno. La tarjeta nunca es la única
  forma de leer un valor.
- **Animación de entrada en CSS**, una sola vez al cargar (los tubos crecen), desactivada con
  `prefers-reduced-motion`; sin animaciones que se repitan [F14-DC23].
- El volumen sale de un degradado horizontal sobre el token del estado. Se añaden a
  `src/app/globals.css` los tokens de brillo y de sombra de cada estado, con su valor claro y oscuro
  (`light-dark()`), validados en los dos temas; el tema oscuro se elige, no se invierte.
- **Al imprimir**, relleno sólido y el valor y el estado escritos en cada columna.
- A 390 px la gráfica muestra los periodos más recientes y permite desplazarla; los valores siguen
  legibles.

Los componentes van en `src/componentes/ui` y su geometría, en funciones puras con tests, como
`GraficoBarras` y `geometria.ts`.

## 12. Pantallas y navegación

Las maquetas de `pantallas-14-v3.html` son la referencia del contenido; los números de maqueta de
abajo son los de sus secciones.

### 12.1 Barra lateral

Un grupo nuevo, **«Indicadores»**, con el color del módulo (`mod-indicadores`, que ya existe en
`globals.css`), y **una sola entrada, «Indicadores»** (`/indicadores`), visible para toda sesión
[Usuario, 9.5], con pestañas, como «Vigencia» en la 13C. `GRUPOS`, `IconoNav` y los mapas de color
de `ContenidoBarra` ganan el módulo. Bajo «Administración», la entrada **«Configuración de
indicadores»** (`indicadores.administrar`).

Pestañas de «Indicadores», cada una solo para quien puede usarla y solo desde la entrega en que
existe: **Lista** · **Matriz del año** · Objetivos (14B) · Datos compartidos (14B) · **Por
aprobar** (con su número) · **Cierre del mes**.

### 12.2 Lista (`/indicadores`, maqueta 4)

- Arriba, la barra por estado y su lectura en texto («19 bien, 7 en atención, 3 críticos, 3 sin
  dato; 2 reportes vencidos»), contando solo lo que la persona ve.
- Filtros en una fila: proceso y subproceso, clasificación, tipo, estado del semáforo, estado del
  reporte (por reportar, vencida, requiere acción de mejora), «Donde participo», texto e «Incluir
  retirados».
- Columnas: código; indicador (nombre, proceso › subproceso, periodicidad y las marcas
  «Automático», «Restringido», «Retirado»); último periodo terminado; resultado; meta; estado;
  tendencia (miniatura, flecha y «mejora» o «empeora»); reporte.
- Botones: «Nuevo indicador» (quien administra) y «Excel».

### 12.3 Página del indicador (`/indicadores/[codigo]`, maqueta 2)

- Encabezado: código, nombre, una línea con proceso, periodicidad, tipo, clasificación y versión
  vigente. Botones según la persona: «Reportar *periodo*», «Imprimir ficha», «Excel»; y para quien
  administra: editar ficha, programar metas, designar personas, datos de operación, reabrir,
  duplicar y retirar.
- Pestaña **Resultados:** el último resultado en grande con su estado, su frase y su comparación;
  la gráfica principal; el acumulado del año; las variables; y la **tabla del año**, con selector
  de año y, para quien puede, el modo edición de históricos (§8.8). La columna de soportes solo se
  pinta a quien los ve.
- Pestaña **Ficha técnica:** el contenido de §7.2 en lectura, con la fórmula y los rangos en
  palabras, las firmas y, aparte, los datos de operación.
- Pestaña **Versiones:** el control de cambios y cada versión anterior completa.
- Pestaña **Observaciones** (con su número): solo para quien las ve (§6.4).

### 12.4 Formulario de la ficha (maqueta 6)

Un solo formulario para el caso común [regla 1 de §1]:

- Primero, «¿Cómo se calcula?»: las cinco formas de §7.4.
- A la vista: nombre, proceso y subproceso, código propuesto, objetivo, las variables con su
  nombre y su fuente, periodicidad, tendencia, meta y quién mide y quién analiza.
- **«Así quedará el semáforo»** escribe los rangos en palabras en cuanto hay meta, con «Cambiar
  rangos».
- **«Prueba»:** valores de ejemplo, con el resultado, el color y la frase.
- **«Más opciones»**, plegado: lo demás de §7.2 y §7.3. Los campos obligatorios que quedan ahí
  nacen con un valor por omisión que se puede cambiar: tipo «Eficacia», clasificación «Operativo»,
  «sin línea base: *año* es el año de referencia», los cargos de las personas designadas como
  responsables, el plazo y el inicio de medición del parámetro y del periodo en curso.
- Botones: «Guardar borrador» y «Enviar a aprobación» (pide la clave).

### 12.5 Reportar una medición (maqueta 3)

Como §8.2. Debe poder hacerse a 390 px y solo con teclado.

### 12.6 «Por aprobar», «Cierre del mes» y «Configuración de indicadores»

- **Por aprobar:** la lista de fichas que la persona puede aprobar, con qué cambió en cada una (o
  «nueva»), casillas de selección, «Aprobar las seleccionadas» (una clave) y «Devolver» por ficha.
  Quien administra ve además sus borradores y las devueltas.
- **Cierre del mes:** §9.
- **Configuración de indicadores** (`/admin/indicadores`, dentro del panel): los maestros **Tipos**,
  **Clasificaciones** (con «quién aprueba» y «exige norma»), **Unidades** (con su sufijo y sus
  decimales por omisión) y **Objetivos** (§16), cada uno con crear, editar, activar o desactivar y
  «borrar solo si vacío»; los **parámetros** de §10.4; y, en la 14B, **Dimensiones** (§18.1).

### 12.7 Matriz del año (`/indicadores/matriz`, maqueta 5)

[Usuario, 12.3.] Filtros: año, proceso y clasificación. Una fila por indicador visible que se midió
ese año, agrupadas por proceso; doce columnas de mes más «Año» (el acumulado). Un periodo que dura
varios meses ocupa sus celdas unidas. Cada celda lleva el valor y una franja con el color del
estado, y su nombre accesible lo dice entero («marzo: 86 %, Bien»); «s. d.» y «n. a.» en gris. La
celda enlaza a la medición. Se imprime bien y tiene «Excel».

### 12.8 Página del proceso y búsqueda

- **Página del proceso** [2.1]: una sección «Indicadores del proceso», después de los documentos,
  con los del proceso y, agrupados, los de cada subproceso (código, nombre, último resultado y
  estado), más el enlace a su matriz. La página del subproceso muestra los suyos. Solo los que la
  persona ve.
- **Búsqueda** [9.5]: la paleta `Ctrl K` y «Buscar documentos» ganan el grupo «Indicadores» (por
  código y nombre, sin tildes), acotado y filtrado por visibilidad, como se hizo con las normas.

### 12.9 Rutas nuevas

| Ruta | Qué es | Entrega |
|---|---|---|
| `/indicadores`, `/indicadores/matriz`, `/indicadores/por-aprobar`, `/indicadores/cierre` | Pestañas | 14A |
| `/indicadores/nuevo`, `/indicadores/[codigo]`, `…/editar`, `…/imprimir`, `…/reportar/[periodo]` | Ficha, página, impresión y reporte | 14A |
| `GET /indicadores/excel`, `GET /indicadores/[codigo]/excel` | Excel (§13) | 14A |
| `POST /api/mediciones/[id]/archivos` | Subida de un soporte; **fuera del `matcher`** | 14A |
| `GET /indicadores/[codigo]/soportes/[archivoId]/[[...nombre]]` | Sirve un soporte a quien lo ve; 404 a los demás | 14A |
| `/admin/indicadores` y sus subpáginas | Maestros y parámetros | 14A |
| `/indicadores/objetivos`, `/indicadores/datos`, `/indicadores/datos/[id]` | Objetivos y datos compartidos | 14B |
| `POST /api/reportes-externos/[id]/archivos` | Soporte de una constancia; **fuera del `matcher`** | 14B |

Los nombres exactos son del constructor (§26); las URL existentes no cambian.

## 13. Excel de resultados (14A)

[Usuario, 12.5.] Dos Excel, con `construirHoja` y `agregarHoja`
(`src/lib/distribucion/hoja-excel.ts`), encabezado institucional y toda celda de texto pasada por
`neutralizarFormula`:

- **De un indicador:** hoja «Ficha» (el contenido de §7.2 y los datos de operación) y hoja
  «Resultados *año*» (periodo, variables, resultado, meta, «Cumple», estado, análisis y marcas),
  con el acumulado. Bitácora `exporto_indicador`.
- **De la lista:** hoja «Resultados *año*», una fila por indicador visible con los filtros
  aplicados: código, nombre, proceso, subproceso, clasificación, tipo, unidad, meta, los doce meses
  y el año. Bitácora `exporto_resultados_indicadores`.

Ninguno trae soportes ni observaciones. Los descarga quien ve lo que exporta: «imprimir» no se
separa de «consultar» [Decisión de Claude, F14-DC22]. Sin sesión, 401; un indicador que la persona
no ve, 404. Llevan límite de ritmo. La versión formal con pie de control es de la Fase 17.

## 14. Variables compartidas (14B)

[Usuario, tema 4; spec maestro, rec. 2.]

- **Catálogo por proceso.** Cada variable compartida pertenece a un proceso (su dueño) y la puede
  usar un indicador de cualquier proceso [2.4]: «Total facturado en el mes», de Facturación, la
  usan un indicador de Facturación y otro de Cartera. Tiene nombre, descripción (qué incluye y qué
  excluye), fuente, unidad, **periodicidad propia**, cómo se junta, límites de captura, plazo de
  reporte y sus **responsables** (personas designadas). La mantiene el Admin SGC. La pestaña «Datos
  compartidos» lista cada una con su último valor, quién lo reportó y qué indicadores la usan.
- **En la ficha**, una variable se marca «compartida» eligiéndola del catálogo; es un cambio mayor.
- **Periodicidad** [4.3]: el indicador debe tener la misma periodicidad que la variable o una que
  la contenga (mensual en bimestral, trimestral, semestral o anual; bimestral en semestral o anual;
  trimestral en semestral o anual; semestral en anual). El valor para el periodo del indicador es
  la variable juntada con su regla; si falta alguno de sus periodos, el indicador queda «Falta un
  dato».
- **Reporte del dato:** al terminar cada periodo de la variable (si la usa algún indicador activo),
  sus responsables reciben la tarea «Reportar el dato *nombre*, *periodo*», con los mismos avisos
  previos, de vencido y de escalamiento de §10.2. Se reporta **una vez**; en cada indicador que la
  usa aparece ya puesta, con quién la reportó y sin poder cambiarla desde ahí [4.1].
- Cuando el dato llega, las mediciones que lo esperaban se recalculan y salen sus alertas.
- **Corrección:** antes del cierre, sus responsables; recalcula todas las mediciones abiertas que la
  usan, con su evento. Después del cierre, el Admin SGC reabre el dato con justificación, y con él
  las mediciones cerradas que lo usaron: la pantalla las lista antes de confirmar y todas quedan
  «Corregida» [Decisión de Claude, F14-DC35].
- Una variable compartida no tiene «no aplica» ni soportes propios: el «no aplica» y los soportes
  son de la medición del indicador.
- Deja de usarse desactivándola (solo si ningún indicador activo la usa); con valores, no se borra.

## 15. Fuente automática (14B)

[Usuario, tema 6, 12.6 y 12.7.]

### 15.1 El registro de cálculos

Una **lista fija en el código** (`src/lib/indicadores/calculos/`) [6.1]: cada cálculo declara su
clave, su nombre, su clase (`estado`: se mide a una fecha; `flujo`: se mide sobre un periodo), lo
que entrega (numerador y denominador, o un valor), su unidad y los alcances que admite. El
formulario solo manda la clave, y el servidor la valida contra el registro.

| Cálculo | Clase | Entrega | Origen |
|---|---|---|---|
| Documentos dentro de su plazo de revisión | Estado | Vigentes al día sobre vigentes con fecha | 13C, indicador 1 |
| Documentos con revisión vencida | Estado | Conteo | 13C, indicador 3 |
| Tiempo de aprobación | Flujo | Días sumados sobre trámites publicados | 13C, indicador 2 |
| Acuses de lectura confirmados | Flujo | Confirmados sobre confirmados más pendientes | 13C, indicador 4 |
| Conformidad en puntos de uso, a la fecha | Estado | Conformes sobre verificados (última verificación de cada punto) | 13C, indicador 5 |
| Conformidad en puntos de uso, del periodo | Flujo | Lo mismo, de las verificaciones cerradas en el periodo | 13C, indicador 5 |
| Externos verificados al día | Estado | Al día sobre externos vigentes | 13C, indicador 6 |
| Etapas del trámite cerradas en plazo | Flujo | En plazo sobre cerradas con fecha límite | 13C, indicador 7 |
| Reportes de indicadores a tiempo | Flujo | Mediciones reportadas dentro de su plazo sobre mediciones con fecha límite en el periodo (sin históricos) | Nuevo [12.6] |
| Objetivos cumplidos | Flujo | Objetivos cumplidos sobre objetivos con medición (§16) | Nuevo [12.7] |

Los ocho primeros reutilizan las **funciones puras** de la 13C, sin cálculos nuevos. Dos
precisiones que salen del código [Decisión de Claude, F14-DC42]:

- **Alcance.** Admiten «toda la entidad» o «un proceso» [6.6], igual que «Reportes a tiempo»,
  **salvo los dos de conformidad, que solo admiten «toda la entidad»**: la conformidad de los puntos
  de uso no se desglosa por proceso (`src/db/consultas/vigencia/indicadores.ts`).
- **Los toma el sistema, sobre todo.** Las consultas de la 13C exigen una sesión y filtran por
  ella. La foto no tiene sesión: cada cálculo gana un camino «de sistema» que cuenta **todos** los
  documentos, también los restringidos (entrega cifras, no nombres). Por eso el valor de la ficha
  puede no coincidir con lo que ve en la pestaña de Vigencia una persona con alcance limitado; para
  Admin SGC, Gerencia y Control Interno coincide.

La Fase 15 añadirá los suyos a este registro.

### 15.2 Un indicador de fuente automática

- En el formulario se elige «lo calcula el sistema», el cálculo y su alcance. La forma, las
  variables y la unidad las fija el cálculo y no se editan; la tendencia, la meta, los rangos y la
  periodicidad sí. Nadie se designa para medir; para analizar y hacer seguimiento, sí.
- **A lo sumo un indicador activo por cálculo y alcance** [Decisión de Claude, F14-DC24]: es lo que
  permite que la tarjeta de Vigencia sepa cuál es «su» ficha.
- **Nadie digita ni corrige el valor** [6.2]; «soporte obligatorio» no aplica; reabrir una medición
  solo deja cambiar el análisis.

### 15.3 La foto de cada periodo

- **De flujo:** el sistema calcula el valor cuando el periodo termina. Hasta el cierre del mes, el
  Admin SGC puede «Volver a calcular» (por ejemplo, tras acuses confirmados tarde); el cierre lo
  congela.
- **De estado:** se toma una sola vez, en la primera pasada de la revisión después del fin del
  periodo, y la medición dice cuándo («foto del 1 de abril, 7:12 a. m.»). No se vuelve a calcular.
  Su serie empieza en el primer periodo que termina después de aprobarse la ficha; hacia atrás,
  «Sin dato» [6.3; F13C-DC23]. Con el planificador de la Fase 16 la foto será a medianoche.
- **Hacia atrás** [8.4]: al aprobarse la ficha, los cálculos de flujo llenan solos los periodos
  desde el inicio de medición, marcados como históricos.
- Mientras la foto no exista, la medición está en «Falta un dato». Cuando llega, se calcula el
  resultado, salen las alertas y, si no cumple, la tarea de analizar.

### 15.4 Vigencia

[6.4, 6.5.] La pestaña **Vigencia → Indicadores** sigue como vista «a hoy». Para cada tarjeta, si
el cálculo tiene un indicador activo con el alcance del filtro (la entidad o el proceso elegido):

- la tarjeta usa **la meta y la tendencia de la ficha**, no la de Configuración documental, y
  enlaza «Ver ficha *código*» a quien puede verla;
- en Configuración documental, la meta de ese cálculo se muestra en solo lectura: «La fija la
  ficha *código*».

Sin indicador, todo sigue como en la 13C. Así cada indicador tiene una sola meta.

**La conformidad en puntos de uso es el caso delicado** [F14-DC39]. Su meta de hoy,
`umbral_conformidad_pct`, no solo pinta la tarjeta: decide el «cumple» que muestra **Distribución**
y el que entra al informe de la revisión anual, dos cosas ya fusionadas que el punto 6.5 del
usuario no mencionaba. Fue la única pregunta que la revisión del constructor dejó para el usuario,
con dos caminos:

- **Opción 1, una sola meta:** cuando el cálculo tiene ficha, Distribución y el informe anual
  pasan a usar la meta de la ficha.
- **Opción 2, dos cifras con nombre distinto:** Distribución y el informe anual conservan su
  «umbral de conformidad»; la meta de la ficha vale solo para el indicador y para la tarjeta de
  Vigencia. Nada de la 13B ni de la 13C cambia, pero el mismo porcentaje puede decir «cumple» en
  una pantalla y «no cumple» en otra si las dos cifras difieren.

El usuario aprobó el spec sin elegir expresamente entre las dos: **queda la opción 1**, que era la
recomendada y la que el documento describía. Es de la 14B; si prefiere la 2, se cambia al planear
esa entrega sin tocar nada de la 14A. Con la opción 1:

- Una función única, `metaDeConformidad()`, responde: la meta de la ficha activa del cálculo
  **«a la fecha»** para el periodo en curso, si existe; si no, el umbral de Configuración
  documental. Distribución, la tarjeta de Vigencia y el informe anual la usan en vez de leer el
  umbral directamente.
- La ficha del cálculo **«del periodo»** gobierna solo la cifra por periodo de la tarjeta.
- Un informe anual ya cerrado no cambia: congeló su cifra y su veredicto.

Es el único punto en que un módulo anterior pasa a depender de este.

## 16. Objetivos (maestro en la 14A, página y cálculo en la 14B)

- **Maestro** (14A) [3.15]: cada objetivo tiene su clase (de calidad o institucional), su
  enunciado, su orden y si está activo. Lo mantiene el Admin SGC en «Configuración de indicadores»,
  con «borrar solo si vacío». La ficha puede apuntar a **un** objetivo. La Fase 15 reutiliza este
  maestro para los planes (son los «objetivos institucionales» del spec maestro §6.3).
- **Página «Objetivos»** (14B) [12.7]: los objetivos activos, por clase; cada uno con sus
  indicadores (último resultado y estado) y su propio estado en el periodo elegido: «Cumplido» si
  todos sus indicadores medidos están en «Bien», «No cumplido» si alguno no, «Sin medición» si
  ninguno se midió. La página **usa solo los indicadores que la persona ve** y no dice si hay otros
  (F13C-R11).
- **Cálculo «Objetivos cumplidos»** (14B) [12.7; Decisión de Claude, F14-DC25], con alcance «de
  calidad», «institucionales» o «todos»:
  - De cada indicador activo ligado a un objetivo se toma su última medición cuyo periodo termina
    dentro del periodo que se calcula, sin contar «no aplica», «sin dato» ni «sin meta».
  - Un objetivo está cumplido si todas esas mediciones están en «Bien».
  - Numerador: objetivos cumplidos. Denominador: objetivos con al menos una medición tomada.
  - Usa **todos** los indicadores, también los restringidos: entrega un conteo, no nombres. El
    indicador que usa este cálculo no entra en su propia cuenta.

Con esto, el IND-03 del usuario («Cumplimiento de Objetivos de Calidad») se alimenta solo.

## 17. Regulatorios (norma enlazada en la 14A; constancias e impactos en la 14B)

### 17.1 Norma que lo exige (14A)

[Usuario, 10.1 y 10.2.] La Clasificación tiene la casilla «exige norma», marcada en «Regulatorio».
La ficha enlaza **una o varias** normas del Normograma; al elegir solo se ofrecen las vigentes y
las modificadas. Es obligatoria cuando la clasificación la exige y opcional en las demás. La ficha
muestra cada norma con su estado (una que después pasó a derogada se ve marcada, con texto). La
ficha de la norma, en el Normograma, gana la sección **«Indicadores que exige»**, con los que la
persona ve.

Si el indicador «se reporta a un ente», la ficha guarda el destinatario (texto con sugerencias de
los ya usados), la periodicidad externa y el plazo en días. En la 14A son informativos.

### 17.2 Constancia de envío (14B)

[Usuario, 10.4.] Para un indicador que se reporta a un ente:

- Al terminar cada **periodo externo** nace una constancia pendiente, con fecha límite (el fin del
  periodo más el plazo). No se generan para periodos anteriores a la aprobación de la ficha.
- Quienes miden reciben la tarea «Registrar el reporte a *ente*, *periodo*», con el aviso de
  vencido y el escalamiento de §10.2.
- **Registrar:** fecha de envío (no futura), número de radicado o constancia, al menos un soporte
  (PDF o imagen) y una nota opcional. Sin clave [Decisión de Claude, F14-DC33].
- La pantalla muestra el **resultado del periodo externo** calculado por el sistema (el acumulado
  de §8.10 sobre ese periodo) y lo congela en la constancia; si alguno de sus periodos no está
  cerrado, lo advierte.
- Corregir una constancia registrada exige justificación y queda en bitácora.
- En la página del indicador, la sección «Reportes al ente» lista cada periodo con su fecha
  límite, cuándo se envió, el radicado, el resultado enviado y quién lo registró; el soporte, a
  quien ve soportes. En la lista, las marcas «Envío pendiente» y «Envío vencido».

### 17.3 Impacto por cambio de norma (14B)

[Usuario, 10.3.] Cuando una norma pasa a modificada, derogada o retirada, se abre además **un
impacto por cada indicador activo cuya ficha vigente la cita**. Van en una **tabla propia**
(`impactos_indicadores`, §19.3), no en `impactos_normativos` [Decisión de Claude, F14-DC26]: allí
la tarea, el aviso y el derecho a resolver van por cambio y proceso y son del líder, el proceso es
obligatorio, y un impacto de documento suprime el de proceso (`normograma/impactos.ts`,
`normograma/vencidos.ts`); meter ahí los indicadores cambiaría reglas de la 13C que funcionan. Se
crean en la misma transacción del cambio de estado, con el mismo plazo. La tarea es del **Admin
SGC** (la ficha es suya), y lo resuelve de una de tres formas:

- **«No afecta»**, con nota de al menos 5 caracteres.
- **Versión nueva de la ficha:** el impacto se resuelve cuando esa versión se aprueba y queda
  enlazada.
- **Retiro** del indicador.

Mientras está pendiente, la página del indicador muestra «Revisión por cambio normativo» a quien lo
ve. Vence, avisa y escala **con las mismas reglas** que los demás impactos, en su propia pasada de
vencimientos. La página del impacto (`/normograma/impactos/[cambioId]`) gana la sección
«Indicadores», que lee de la tabla nueva: el Admin SGC resuelve y el líder del proceso la ve en
lectura. Los impactos de documentos y de procesos de la 13C no cambian.

## 18. Desagregación y compuestos (14B)

### 18.1 Desagregación

[Usuario, 11.1 a 11.3.]

- **Maestro de dimensiones** de la entidad («Sede», «Servicio», «Régimen», «Pagador»), cada una
  con sus categorías (nombre, orden, activa). Lo mantiene el Admin SGC; «borrar solo si vacío». Una
  categoría desactivada deja de pedirse desde entonces y su historia se conserva.
- La ficha elige **una sola dimensión** [11.2]; es un cambio mayor.
- **Captura:** una fila por categoría activa, con una celda por variable; una fila se puede marcar
  «no aplica» con su motivo; se puede guardar a medias.
- **Cálculo:** cada categoría tiene su resultado y su color, con la misma meta del indicador. El
  **total** aplica la fórmula a las variables **sumadas** entre categorías, y solo se calcula cuando
  todas las categorías están reportadas o marcadas «no aplica» [11.3].
- El semáforo, las alertas, el análisis y la matriz van sobre el **total**; el color de cada
  categoría es informativo.
- **Se ve** en la tabla del periodo por categoría y en la gráfica de barras por categoría (maqueta
  8), con la meta como línea; la gráfica principal sigue siendo la del total por periodo.
- No se combina con la fuente automática. Una variable compartida que use un indicador desagregado
  debe estar declarada con esa misma dimensión y se reporta por categoría [Decisión de Claude,
  F14-DC27].

### 18.2 Compuestos

[Usuario, 11.4.] Una variable puede ser **«resultado de otro indicador»**: se elige el indicador y
qué se toma, su **valor** o su **porcentaje de cumplimiento**.

- **Porcentaje de cumplimiento** (función pura): en ascendente, resultado ÷ meta; en descendente,
  meta ÷ resultado (con resultado 0, 100 %); en constante, 100 % dentro del rango y 0 % fuera.
  **Acotado entre 0 y 100 %**, para que un indicador sobresaliente no tape a uno que falla
  [Decisión de Claude, F14-DC28]. De un indicador sin meta no se puede tomar el cumplimiento.
- **Periodo:** el mismo. El indicador de origen debe tener la misma periodicidad o una más fina; si
  es más fina, se toma su acumulado en el periodo del compuesto (§8.10).
- **Se recalcula solo** cuando cambia el origen, en la misma transacción y en orden de dependencia.
  **Sin ciclos:** se valida al guardar la ficha, con un máximo de cinco niveles.
- Mientras el origen no tenga resultado, el compuesto está en «Falta un dato».
- **Restricción:** si un componente es restringido, el compuesto debe serlo. Se valida al guardar,
  y no se puede pasar a restringido un indicador que alimenta a un compuesto general sin cambiar
  antes el compuesto.
- No se puede **retirar** un indicador que alimenta a un compuesto activo sin cambiar antes el
  compuesto.
- Reabrir una medición cerrada que alimentó a un compuesto reabre también la del compuesto, como
  con los datos compartidos (§14).
- Un compuesto puede mezclar variables propias con resultados de otros indicadores.

## 19. Modelo de datos y migraciones

Nombres provisionales (§26). Convenciones heredadas: `timestamptz`, FK `restrict`, `CHECK` de
estados en la base, índices por lo que filtra el alcance (`proceso_id`), `src/db/esquema.ts` sin
importar con `@/`.

### 19.1 Cambios a tablas existentes

| Tabla | Cambio |
|---|---|
| `firmas` | Columna nueva `indicador_version_id` (FK opcional). `firmas_tramite_coherente` se sustituye por una regla que las filas existentes cumplen: `tramite_id IS NOT NULL OR firma IN ('ratifico','adopto') OR indicador_version_id IS NOT NULL`. Las firmas de una ficha usan los valores `elaboro` y `aprobo` que ya existen, con `tramite_id` y `version_id` nulos y `ronda = 0`. `listarFirmas(tramiteId)` y el acta no cambian: filtran por trámite |
| `archivos` | `contexto` admite `medicion` y `reporte_externo` (se amplía `archivos_contexto_valido`); carpetas `mediciones/<id>` y `reportes-externos/<id>`. `CONTEXTOS_EVIDENCIA` gana los dos y `validarTipoEvidencia` una opción que admite `.xlsx` para `medicion` (§8.2). `registrarArchivo` exige que la medición no esté cerrada |
| `configuracion` | Claves `ind_umbral_atencion_pct` (70), `ind_aviso_previo_dias` (3), `ind_plazo_reporte_dias` (10), `ind_incumplimiento_periodos` (3) e `ind_variacion_confirmar_pct` (30). `escalamiento_dias` se reutiliza |
| `tipos_documento` | Sin cambio de esquema: la acción rechaza la sigla `IND` (§7.1) |

### 19.2 Tablas nuevas que usa la 14A

| Tabla | Qué guarda |
|---|---|
| `tipos_indicador` | Nombre único, orden, activo |
| `clasificaciones_indicador` | Nombre único, `aprueba` (`gerencia` o `lider`), `exige_norma`, orden, activo |
| `unidades_indicador` | Nombre único, sufijo, decimales por omisión, orden, activo |
| `objetivos` | Clase (`calidad` o `institucional`), enunciado, orden, activo |
| `indicadores` | Código (único sin distinguir mayúsculas), proceso (fijo tras la primera aprobación), estado (`borrador`, `activo`, `retirado`, `descartado`); datos de operación: nivel de acceso (`general`, `restringido`), plazo de reporte, inicio de medición, soporte obligatorio; retiro o descarte (quién, cuándo, motivo); creado por y cuándo. Índice por proceso |
| `indicador_versiones` | Indicador, número, estado (`borrador`, `por_aprobar`, `aprobada`, `descartada`), tipo de cambio (`inicial`, `mayor`, `menor`), motivo, rige desde (periodo); el contenido de §7.2 en columnas, con el subproceso; **por cada catálogo citado, la referencia y el nombre firmado** (tipo, clasificación, unidad con su sufijo, objetivo, proceso, subproceso); la prueba (`jsonb`); nota de devolución; huella del contenido; elaborada y aprobada por y cuándo. Única por (indicador, número). **Índice único parcial: un borrador o por aprobar por indicador** |
| `indicador_variables` | Versión, letra, nombre, descripción, fuente, unidad, cómo se junta (`suma`, `ultimo`, `promedio`), origen (`propia`, `compartida`, `automatica`, `indicador`), variable compartida, indicador de origen y qué toma (`valor`, `cumplimiento`), límites de captura, admite negativos, orden. Única por (versión, letra) |
| `indicador_responsables` | Versión, cargo y su nombre firmado, función (`medir`, `analizar`). Única |
| `indicador_normas` | Versión, norma y su nombre firmado. Única |
| `indicador_designados` | Indicador, usuario, función (`mide`, `analiza`, `seguimiento`), quién y cuándo. Única por los tres; índice por usuario |
| `indicador_metas` | Indicador, periodo, meta (y rango), justificación, «después del periodo», quién y cuándo. Única por (indicador, periodo) |
| `mediciones` | Indicador, versión aplicada, periodo (clave, desde, hasta), `vence_en`, estado (`abierta`, `reportada`, `cerrada`), histórica, no aplica y su motivo, resultado exacto (numerador y denominador de la fracción) y resultado redondeado, semáforo (`bien`, `atencion`, `critico` o nulo), meta y límite aplicados, requiere acción, incumplimiento repetido, análisis, causa, acción propuesta, quién reportó y quién analizó y cuándo, corregida, cierre, reapertura (quién, cuándo, justificación), marcas de aviso (`aviso_previo_en`, `aviso_vencido_en`, `escalado_en`) y último estado alertado. **Única por (indicador, periodo)**; índices por estado y por `vence_en` |
| `medicion_valores` | Medición, variable, categoría (opcional), valor (`numeric`), «no aplica» de la categoría y su motivo, quién y cuándo. Única por (medición, variable, categoría) con `NULLS NOT DISTINCT` |
| `medicion_eventos` | Medición, tipo (`reporte`, `correccion`, `analisis`, `no_aplica`, `meta`, `soporte`, `cierre`, `reapertura`, `recalculo`), quién (nulo si lo hizo el sistema), cuándo y detalle (`jsonb`: antes, después, justificación). **Solo inserción** |
| `medicion_observaciones` | Medición, quién, cuándo, texto, a cuál responde (opcional). **Solo inserción** |
| `cierres_indicadores` | Mes (**único**), quién, cuándo, resumen (`jsonb`) |

### 19.3 Tablas nuevas que usa la 14B

| Tabla | Qué guarda |
|---|---|
| `variables_compartidas` | Proceso, nombre, descripción, fuente, unidad, periodicidad, cómo se junta, límites, admite negativos, plazo de reporte, dimensión (opcional), activa. Única por (proceso, nombre) |
| `variable_responsables` | Variable, usuario. Única |
| `variable_valores` | Variable, periodo, categoría (opcional), valor, estado (`pendiente`, `reportado`, `cerrado`), `vence_en`, quién y cuándo, marcas de aviso, cierre. Única por (variable, periodo, categoría) |
| `calculo_fotos` | Cálculo (clave), alcance (proceso, clase de objetivo o nulo para la entidad), periodo, numerador y denominador o valor, tomada en, histórica, cierre. Única por (cálculo, alcance, periodo) |
| `dimensiones` y `dimension_categorias` | Nombre único; categorías con nombre, orden y activa |
| `reportes_externos` | Indicador, periodo externo (clave, desde, hasta), `vence_en`, estado (`pendiente`, `registrada`), fecha de envío, radicado, resultado enviado, nota, quién y cuándo, marcas de aviso. Única por (indicador, periodo) |
| `impactos_indicadores` | Cambio de la norma (`norma_cambios`), norma, indicador, estado (`pendiente`, `resuelto`), `vence_en`, `aviso_vencido_en`, `escalado_en`, resolución (`no_afecta`, `nueva_version`, `retiro`), versión que lo resolvió, nota, resuelto por y cuándo. Única por (cambio, indicador) |

### 19.4 Inmutabilidad

[Decisión de Claude, F14-DC13.]

- `medicion_eventos` y `medicion_observaciones` son de **solo inserción**: llevan el trigger
  `sgc_impedir_modificacion()`, entran al `REVOKE UPDATE, DELETE` de `asegurarRolApp` y a la lista
  de `tests/privilegios-bd.test.ts`. Hacen falta además de la bitácora porque el historial de una
  medición lo ve quien ve el indicador, y la bitácora solo la ven dos roles.
- **Una medición cerrada no cambia:** un trigger nuevo (`sgc_impedir_si_medicion_cerrada`) rechaza
  modificar o borrar sus valores, su resultado y su análisis, e insertar valores en ella. El único
  cambio que admite es la reapertura, que deja quién, cuándo y por qué.
- **Una versión aprobada no cambia:** otro trigger rechaza modificar o borrar el contenido de una
  versión `aprobada` y sus variables, responsables y normas.
- Un cierre de mes no se modifica ni se borra.
- Todas las tablas nuevas entran al `TRUNCATE` de `limpiarTodo`.

### 19.5 Migraciones

[Usuario, 14.1; Decisión de Claude, F14-DC29.] La **`0011`**, de la 14A, crea **todas** las tablas
y cambios de §19.1 a §19.4, también las de §19.3, que quedan vacías hasta la 14B: así el modelo
nace completo y la 14B no altera lo que construyó la 14A. Siembra los tres maestros y las claves de
configuración si están vacíos (precedente F13C-R2), para que una base de `sgc-suaza` o de la 13C no
quede sin tipos. La **`0012`** queda para lo que el plan de la 14B necesite ajustar. No hay datos
que transformar. La Fase 20 las ensaya sobre un respaldo real.

Una salvedad expresa a «nada se renombra ni se borra»: las tablas de §19.3 se diseñan aquí antes de
planear la 14B, que es la mitad menos validada (tres de los cinco choques con el código que halló
la revisión eran suyos). **Mientras sigan vacías y sin uso, la `0012` puede rehacerlas** (cambiar o
quitar columnas, o la tabla entera); las tablas de §19.2, que la 14A ya usa, solo admiten cambios
aditivos.

## 20. Cambios a `AGENTS.md`

- **Regla de negocio 5 y piso 10:** `medicion_eventos` y `medicion_observaciones` entran a la lista
  de tablas de solo inserción y a los privilegios de `sgc_app`. Las mediciones cerradas y las
  versiones aprobadas de una ficha son inmutables por trigger, como las revisiones anuales cerradas.
- **Regla nueva — fórmulas:** una fórmula solo se evalúa con el intérprete de
  `src/lib/indicadores/formula/`; nunca `eval`, `Function` ni SQL armado con texto del usuario.
- **Regla nueva — un solo camino de cálculo:** solo `recalcularMedicion` escribe el resultado, el
  semáforo, la meta aplicada y el estado de una medición.
- **Regla nueva — el veredicto con el valor exacto:** la que ya existe para porcentajes se extiende
  a todo indicador: el semáforo compara la fracción exacta; lo mostrado nunca lo contradice.
- **Alcance:** las dos excepciones nombradas de §6.4 (lectura de indicadores generales y
  designación) y las funciones nuevas de `src/lib/alcance.ts`.
- **Estructura:** `app/(app)/indicadores`, `app/acciones-indicadores.ts`,
  `src/db/consultas/indicadores/` y `src/lib/indicadores/` (reglas puras: fórmula, periodos,
  semáforo, textos, acumulado, cálculos); la configuración, en `app/(app)/admin/(panel)/indicadores`.
- **Server Actions:** `src/app/acciones-indicadores.ts` entra a la lista fija de
  `tests/acciones-permisos.test.ts`.
- **Subidas fuera del `matcher`:** `api/mediciones/[id]/archivos` y, en la 14B,
  `api/reportes-externos/[id]/archivos`.
- **`archivos`:** los contextos pasan de seis a ocho; el soporte de una medición se lee con la
  regla de soportes de §6.4, no con la de quien ve el indicador.
- **Firmas sin trámite:** las de una ficha («Elaboró», «Aprobó») usan `indicador_version_id`.
- **Sigla reservada:** `IND` no es un tipo de documento.
- **Ficha firmada:** una versión guarda los nombres de los catálogos como se firmaron; renombrar un
  cargo, una unidad o un proceso no cambia una ficha aprobada. Un indicador enviado a aprobación no
  se borra: se descarta.
- **Históricos:** no generan tareas, avisos ni la marca «Requiere acción de mejora», y no cuentan
  para el incumplimiento repetido.
- **Cálculos automáticos (14B):** lista fija en `src/lib/indicadores/calculos/`; los toma el
  sistema, sin sesión y sobre todos los documentos; una foto de estado no se recalcula.
- **Impactos (14B):** los de indicadores van en `impactos_indicadores`; las reglas de
  `impactos_normativos` no cambian.
- **Conformidad (14B, opción 1 de §15.4):** el párrafo que hoy describe
  `conformidad()` y su umbral gana la función única `metaDeConformidad()`, que Distribución, la
  tarjeta de Vigencia y el informe anual usan en vez de leer el umbral.
- **Stack:** se corrige la fila «Animación»: `motion` no está instalada; las animaciones son CSS.
- **Tests:** ningún test deja confirmado un cierre de mes ni una ficha aprobada fuera de una
  transacción que se revierte.

## 21. Seguridad

Riesgos del spec maestro §5.9 que toca la fase:

| Riesgo | Cómo |
|---|---|
| 3. Aislamiento por alcance | Toda consulta del módulo pasa por `filtroIndicadores`; un restringido no aparece en lista, conteos, barra de estados, búsqueda, matriz, página del proceso, Excel, tareas, avisos, objetivos ni compuestos. Tests con los cinco roles, un líder de otro proceso, un designado y un no designado |
| 4. Permisos solo en la interfaz | Cada acción exige el permiso de matriz y la condición de persona en el servidor (designado para esa función, aprobador, líder); la interfaz solo oculta |
| 6. SQL concatenado | Los cálculos automáticos son una lista fija en el código; el formulario manda una clave que se valida contra el registro. Ninguna fórmula llega a SQL |
| 7 y 15. Validación | Un esquema `zod` `.strict()` por acción (`src/lib/esquemas/indicadores.ts`); números, periodos y fechas acotados; el periodo se valida contra la periodicidad del indicador; ningún campo no declarado |
| 8. HTML sin filtrar | Nombres, análisis y observaciones son texto plano; las tarjetas de las gráficas escriben con `textContent` |
| 14. Identificadores predecibles | El código de un indicador o el id de una medición no dan acceso: cada petición se autoriza y quien no puede ver recibe 404 |
| 20. Archivos | Los soportes entran por `recibirArchivo` (lista blanca, magic bytes, 25 MB, nombre saneado, `Origin`, ruta fuera del `matcher`); se sirven solo a quien ve soportes, siempre como descarga, con `nosniff` y `no-store`. `.xlsx` solo en el contexto `medicion`; nunca `.xls`, Word, SVG ni HTML. Riesgo residual declarado: un ZIP renombrado a `.xlsx` puede pasar la muestra (§8.2) |

Además:

- **El intérprete** es la superficie nueva más delicada: gramática cerrada, límites de longitud, de
  profundidad y de tamaño de cifra, tiempo lineal, ningún acceso a objetos del entorno. Sus pruebas
  de entradas hostiles (§23) son criterio de cierre de la 14A.
- Las firmas de la ficha siguen F13A-R4 y sus fallos cuentan para el bloqueo de la cuenta.
- Límite de ritmo por usuario en las acciones, los Excel y las subidas.
- Los avisos de escalamiento no nombran el indicador; ningún aviso lleva contenido de un soporte.
- El análisis es visible para toda sesión en un indicador general: el formulario lo dice junto al
  campo («No escriba nombres de pacientes ni de funcionarios»), y el manual lo repite. Los datos
  personales van en el soporte, que sí está protegido.
- El trigger de mediciones cerradas y el de versiones aprobadas protegen la evidencia aunque
  alguien entre con otro rol de base de datos.

## 22. Semillas

**Mínima:** los tres tipos (eficacia, eficiencia, efectividad); las tres clasificaciones
(estratégico y regulatorio, aprueba Gerencia; operativo, aprueba el líder; «exige norma» en
regulatorio); las unidades (porcentaje, número, días, horas, minutos, tasa por mil, pesos); los
parámetros. Sin objetivos, indicadores, dimensiones ni variables: son de la entidad.

**Demo de la 14A** (sobre la de la 13C):

- **Los ocho indicadores del Excel del usuario**, `SGC-IND-01` a `SGC-IND-08`, con su nombre, su
  fórmula, su meta y su periodicidad [14.2]; elaborados por `coordinadora.sgc` y aprobados por
  `gerente` (SGC no tiene líder con ese rol: aprueba Gerencia, como en el Excel).
- Otros ficticios y verosímiles: uno de **urgencias** en minutos, descendente y mensual, medido
  por `jefe.urgencias` (rol Consulta: es el designado que reporta sin ser líder); uno de **talento
  humano** restringido; uno de **cartera**, atado al subproceso «Gestión de Cartera»; y uno
  **regulatorio** de consulta externa enlazado a la Resolución 256 de 2016, que ya está en el
  normograma de la demo.
- Tres objetivos de calidad y dos institucionales, ficticios, con algunos indicadores ligados.
- Estados para el recorrido: una ficha **por aprobar** y un **borrador**; un indicador **retirado**;
  uno con **versión 2** (un cambio mayor y uno menor en su control de cambios); 2026 con periodos
  **históricos** registrados; mediciones en **Bien**, en **Atención** con análisis y en **Crítico**
  con causa, acción propuesta y la marca; una **sin dato**, una **vencida** y una **no aplica**;
  una meta programada distinta de la base; una **observación** de `control.interno` sin respuesta;
  un **cierre** de un mes anterior y una medición **reabierta y corregida**.

**Demo de la 14B:** una variable compartida mensual usada por dos indicadores de distinta
periodicidad; `SGC-IND-05` y `SGC-IND-03` pasados a fuente automática (conformidad en puntos de uso
y objetivos cumplidos); la dimensión «Sede» con cuatro categorías ficticias y un indicador
desagregado; un compuesto («Índice de desempeño del SGC»); y el regulatorio con una constancia
registrada y otra pendiente.

Los tests de semilla nuevos leen el estado y saltan con aviso si la demo ya avanzó;
`SEMILLA_RECIEN=1` lo exige. Ningún nombre de la entidad fuera de `semillas/demo.ts`.

## 23. Pruebas

Como en la Fase 13: reglas puras sin base de datos; flujos contra la base de desarrollo en
transacciones que se revierten; usuarios `zz_*`; nada de `DELETE` ni `UPDATE` en tablas inmutables.

- **Intérprete:** precedencia y paréntesis; coma y punto decimal; fracciones exactas (un tercio por
  tres da uno); las tres funciones; «sin resultado» por división por cero, variable faltante y
  cifra fuera de rango. **Entradas hostiles:** anidamiento profundo, cadenas largas, literales
  enormes, caracteres Unicode parecidos a operadores, identificadores como `constructor` o
  `__proto__`, intentos de llamar funciones no declaradas, espacios y caracteres de control; en
  todos, respuesta acotada en tiempo y sin excepción.
- **Reglas puras:** periodos y bimestre, con sus bordes en la zona; fecha límite; semáforo en las
  tres tendencias y los dos modos, con sus bordes exactos y la meta 0; rangos en palabras; frases y
  comparación; la cifra que no contradice el veredicto; acumulado con las tres formas de juntar,
  con huecos y con cambio de versión; cambio mayor o menor; estado visible; incumplimiento
  repetido; quién aprueba; agrupación de tareas y avisos; geometría de las gráficas.
- **Consultas y flujo:** crear, enviar, aprobar, devolver, en bloque (todo o nada), cambio menor y
  mayor con «rige desde»; firmas en `firmas` sin tocar el acta; duplicar, retirar, borrar solo si
  vacío; abrir periodos (idempotente, concurrente); reportar con validaciones, «no aplica»,
  soporte obligatorio; analizar según el color; observar y responder; corregir antes del cierre;
  programar metas antes y después del periodo; históricos por tabla; cierre con sus dos
  excepciones; reapertura; los dos triggers; alertas por color, de corrección y por incumplimiento
  repetido.
- **Lo que salió de la revisión del constructor**, una prueba por regla:
  - «rige desde» rechaza un periodo ya reportado y uno que no ha empezado;
  - renombrar un cargo, una unidad o un tipo no cambia la ficha aprobada ni su huella, y el proceso
    no se puede cambiar después de la primera aprobación;
  - un indicador enviado y nunca aprobado no se borra, se descarta y conserva su código; uno que
    nunca se envió sí se borra;
  - el Admin SGC reporta solo si está designado o si nadie más puede, y entonces queda `sinMedidor`;
  - el intérprete separa argumentos con punto y coma y lee `0,5` y `0.5` como el mismo número;
  - un `.xls`, un `.docx` y un `.zip` se rechazan como soporte; un `.xlsx` y un PDF se aceptan, y el
    soporte se sirve como descarga;
  - un histórico programa su meta sin justificación, no lleva «Requiere acción de mejora» y no
    cuenta para el incumplimiento repetido.
- **Vencimientos:** cada medición avisa una vez de previo, una de vencida y escala una vez;
  agrupación por persona; nada para históricos ni «no aplica»; el escalamiento sin nombre.
- **Visibilidad:** general y restringido con los cinco roles, un líder de otro proceso, un
  designado y un asignado al proceso; soportes y observaciones; borradores; 404 en páginas,
  archivos y Excel; nada restringido en lista, conteos, búsqueda, matriz, página del proceso,
  tareas ni avisos.
- **Estructurales, ampliados:** `permisos` (veinte celdas nuevas), `paginas-sesion`,
  `acciones-permisos` (un archivo nuevo), `handlers-permisos`, `proxy-matcher` (una ruta en la 14A y
  otra en la 14B), `privilegios-bd` (dos tablas), `navegacion` (el grupo y sus entradas),
  `bitacora-detalle` (una frase por acción nueva), `textos-fijos`, `colores-fijos`, `esquema`
  (índices, `CHECK`, triggers).
- **Pantallas:** render de la página del indicador en sus estados, del reporte a 390 px, de la
  matriz, de la ficha impresa y de las gráficas (con su tabla equivalente y sin animación con
  `prefers-reduced-motion`); `a11y-estructura` para las páginas nuevas; contraste de los tokens
  nuevos en claro y oscuro.
- **Excel:** las dos descargas, con celdas neutralizadas y sin restringidos ajenos.
- **14B:** dato compartido reportado una vez y juntado en un periodo mayor; reapertura en cascada;
  cada cálculo del registro contra datos sembrados en la transacción; foto de estado una sola vez y
  de flujo recalculable hasta el cierre; un indicador por cálculo y alcance; la meta única en
  Vigencia; objetivos cumplidos; constancias y su vencimiento; impacto por cambio de norma con sus
  tres resoluciones, en `impactos_indicadores`, **sin que cambien** las tareas, los avisos ni la
  resolución de los impactos de documentos y procesos de la 13C; los cálculos tomados por el
  sistema cuentan también los documentos restringidos; los dos de conformidad rechazan el alcance
  «un proceso»; con la opción 1 de §15.4, la meta de conformidad que usan Distribución y el
  informe anual con ficha y sin ella, y que un informe ya cerrado no cambia; desagregación (total
  solo cuando está completo); compuestos (ciclos, recálculo, restricción heredada).
- **Semilla:** la demo deja los estados de §22 y la mínima los maestros y los parámetros.

## 24. Demostración (criterios de cierre)

Cada entrega cierra con lint limpio, `SEMILLA_RECIEN=1 npm test` en verde sobre la demo recién
sembrada, `npm run build` sin URL de base, la imagen del compose arrancando con «Migraciones al
día», la migración aplicada sobre una copia de la base de `main`, el recorrido en navegador (claro,
oscuro y 390 px) y `CONTEXT.md`, `AGENTS.md`, `PLAN.md` y el manual actualizados.

**14A — el usuario debe poder:**

1. Entrar como `coordinadora.sgc`, crear un indicador de la forma «Porcentaje» en un solo
   formulario, ver «Así quedará el semáforo», probar la fórmula y enviarlo a aprobación con su
   clave.
2. Crear otro con «Fórmula libre» y comprobar que una fórmula mal escrita se rechaza con un
   mensaje claro.
3. Entrar como `gerente`, ver la tarea, aprobar dos fichas en bloque con una sola clave y devolver
   una con nota.
4. Abrir la ficha impresa y compararla con la del Excel: encabezado, identificación, estructura,
   firmas reales, control de cambios, datos de operación, tabla del año y gráfica.
5. Registrar los periodos históricos de un indicador en la tabla del año y ver que no generan
   tareas.
6. Entrar como `jefe.urgencias` (rol Consulta), ver su tarea y **reportar sin ser líder**: digitar,
   ver el resultado, el color y la frase al instante.
7. Reportar un periodo que queda en **Crítico**: el sistema pide causa y acción propuesta, marca
   «Requiere acción de mejora» y avisa al líder y al Admin SGC; uno en **Atención** pide solo el
   análisis; uno que cumple no pide nada.
8. Marcar un periodo «No aplica» con motivo y ver que no es «sin dato».
9. Ver la página del indicador: la frase, la comparación con el periodo anterior, la gráfica de
   tubos **con el hueco del periodo sin dato**, la meta, el acumulado del año y las variables; pasar
   el cursor por una columna.
10. Programar la meta de un periodo futuro y la de uno ya terminado (pide justificación y queda
    marcada).
11. Dejar una observación como `control.interno`, responderla como quien analiza y ver que un
    usuario de rol Consulta no ve ni la observación ni el soporte.
12. Ver la **matriz del año** de un proceso y de toda la entidad, y descargar los dos Excel.
13. Hacer el **cierre del mes**: leer el resumen, cerrar, comprobar que una medición cerrada ya no
    se puede corregir, reabrirla con justificación, corregirla y verla «Corregida» con su antes y
    su después.
14. Cambiar la meta base de una ficha (cambio mayor: versión 2, con aprobación) y corregir una
    tilde del nombre (cambio menor: sin aprobador); ver las dos en el control de cambios y que las
    mediciones viejas conservan su versión.
15. Marcar un indicador como **restringido** y comprobar que para `consulta` no existe (ni en la
    lista ni en la búsqueda ni por su dirección), y que un asignado a su proceso sí lo ve.
16. Abrir el indicador **regulatorio**, ver su norma y, en el Normograma, «Indicadores que exige».
17. Dejar vencer un reporte (con la fecha del sistema de pruebas o un indicador sembrado) y ver el
    aviso agrupado, la marca «Vencida» y el escalamiento al jefe sin nombre del indicador.
18. Retirar un indicador y duplicar otro; descartar una ficha devuelta y comprobar que su código
    sigue ocupado.
19. Renombrar un cargo en Estructura y ver que la ficha aprobada sigue mostrando el nombre con que
    se firmó.
20. Intentar adjuntar un `.xls` o un Word como soporte (se rechaza) y un `.xlsx` (se acepta).

**14B — el usuario debe poder:**

1. Crear un indicador **con dos variables compartidas**, reportar cada dato una sola vez como su
   responsable y verlo ya puesto en dos indicadores de distinta periodicidad.
2. Pasar `SGC-IND-05` a fuente automática, ver que nadie digita, que la medición trae la fecha de
   su foto y que la tarjeta de Vigencia muestra la meta de la ficha y enlaza a ella.
3. Ver la página «Objetivos» y `SGC-IND-03` alimentado por «Objetivos cumplidos».
4. Registrar la constancia de envío de un regulatorio con su radicado y su soporte, y ver otra
   vencida.
5. Cambiar el estado de una norma citada y resolver el impacto sobre el indicador.
6. Reportar un indicador desagregado por sede y ver el color de cada sede y el total.
7. Ver un compuesto recalcularse al corregir uno de sus componentes.

## 25. Manual de usuario

Capítulo 8, **«Indicadores: ficha técnica, reporte y análisis»**, escrito con la 14A fresca y
ampliado con la 14B, con una sección por persona: cualquiera (leer un indicador: la frase, los tres
colores y los tres grises, la gráfica, el acumulado); quien mide (reportar, «no aplica», soportes,
corregir, históricos); quien analiza (análisis, causa y acción, responder observaciones); quien
hace seguimiento, Gerencia y Control Interno (alertas, observaciones, matriz, aprobar fichas); y el
Administrador del SGC (crear y cambiar fichas, formas y fórmula libre, designar, programar metas,
cerrar el mes y reabrir, retirar, maestros y parámetros).

Incluye, en lenguaje llano: por qué el acumulado del año no es el promedio de los periodos; qué
cambia respecto del Excel (solo los periodos de la periodicidad, la ficha separada del registro,
los rangos escritos); qué es un cambio mayor y uno menor; que el recordatorio solo se ve al entrar
hasta que exista el correo; y la advertencia de no escribir datos personales en el análisis. Los
capítulos 3 (barra lateral y tareas) y 7 (pestaña Indicadores de Vigencia, impactos) se corrigen
donde la fase los deje falsos.

## 26. Lo que se deja al constructor

- Los nombres definitivos de tablas, columnas, índices, estados, tipos de evento y de aviso, claves
  de configuración, rutas y componentes; la forma de los `jsonb`.
- La organización del código dentro de lo que dice §20, y cómo se reutilizan `DialogoFirma`,
  `recibirArchivo`, `servir-archivo`, `hoja-excel`, `avisarA`, `jefesDe` y `agruparTareas`.
- La implementación del intérprete (analizador, representación de la fracción, límites exactos)
  dentro de §7.4, y cómo se guarda el resultado exacto.
- El diseño de cada pantalla dentro del sistema visual y de las maquetas, los textos de interfaz,
  estados vacíos y errores; si reportar es una página o un diálogo; cómo se pliega «Más opciones».
- La geometría de las gráficas, sus tokens de brillo y sombra y su comportamiento con muchos
  periodos y a 390 px, dentro de §11.
- La consulta de la lista y de la matriz, sus índices y su paginación; cómo se asegura la apertura
  de periodos sin repetir trabajo en cada lectura.
- El umbral exacto de la confirmación por variación y cómo se calcula en unidades que no son
  porcentaje.
- El detalle de «rige desde» cuando cambia la periodicidad a mitad de año.
- Los límites de ritmo, las sugerencias de destinatario y la búsqueda de indicadores.
- El orden de las tareas de cada plan, los tests concretos y los datos exactos de la demo.

## 27. Riesgos

| Riesgo | Mitigación |
|---|---|
| La 14A es grande | El plan va por capas con punto de control en navegador: migración y maestros; intérprete y reglas puras; ficha y aprobación; medición; cierre; tareas y avisos; gráficas y pantallas; Excel, semilla y manual. Las reglas puras, primero |
| Una fórmula con casos no previstos, o usada para atacar | Gramática cerrada, fracciones exactas, límites, «sin resultado» explícito y pruebas hostiles como criterio de cierre; la prueba obligatoria al guardar |
| El primer día del mes se abren todos los periodos y llueven avisos | Tareas y avisos agrupados por persona (§10); el aviso previo sale días antes del plazo, no al abrir |
| Nadie usa la aplicación el día del corte y los periodos no se abren | Toda lectura asegura la apertura (§8.1); la foto de un cálculo de estado guarda su hora real; la Fase 16 lo vuelve exacto |
| El aprobador no firma y las fichas se quedan «por aprobar» | Aprobación en bloque, tarea y aviso; el Admin SGC ve la lista y a quién le toca |
| Se cierra el mes con mediciones a medias | El resumen previo las lista; no se cierran las que están en plazo ni los históricos sin registrar; la reapertura con justificación lo corrige |
| Alguien escribe datos personales en el análisis, que es visible para todos | Aviso junto al campo y en el manual; los soportes, que sí llevan datos, están protegidos |
| El acumulado confunde cuando cambian versión o metas a mitad de año | Reglas explícitas y rótulo que dice qué cubre (§8.10) |
| La matriz y la lista se vuelven lentas con cientos de indicadores | Consultas acotadas por índice, último periodo por indicador en una sola consulta, paginación en la lista; se mide en el punto de control |
| `misTareas` gana más fuentes | Consultas acotadas por usuario e índice; `React.cache` por petición, como en la 13C |
| Las firmas de fichas rompen algo del acta | El acta filtra por `tramite_id`; test que comprueba que su huella no cambia |
| Dos pestañas aprueban, reportan o cierran a la vez | Fila bloqueada con `FOR UPDATE` y estado esperado, unicidad por (indicador, periodo) y por mes |
| (14B) Un cálculo de estado no tiene historia | Se dice «Sin dato» hacia atrás y se muestra la fecha de la foto |
| (14B) Las tablas de la 14B se diseñan antes de planearla | La `0012` puede rehacerlas mientras sigan vacías (§19.5); el plan de la 14B empieza por revisar §14 a §18 contra el código, como hizo esta revisión |
| (14B) Con la opción 1 de §15.4, Distribución pasa a depender de Indicadores | Una función única con su valor por omisión (el umbral de hoy); sin ficha, nada cambia; un informe anual cerrado conserva lo que congeló; pruebas con ficha y sin ella |
| (14B) Los impactos de indicadores rompen los de documentos y procesos | Tabla propia; las consultas de la 13C no se tocan y una prueba lo fija |
| Un soporte `.xlsx` que en realidad es un comprimido | Se sirve siempre como descarga, con `nosniff`, solo a quien ve soportes; no se admite `.xls` |
| (14B) Corregir un dato compartido o un componente mueve muchas mediciones | La pantalla lista lo que se reabre antes de confirmar; cada medición afectada deja su evento |

## 28. Decisiones de Claude en este documento (para revisar de una vez)

Base: **ISO** (la cláusula lo exige), **ISO derivada** (la cláusula respalda el fin; el mecanismo
es de Claude), **Regulación** o **Práctica**. Las marcadas ⚠ ajustan la letra de un punto que el
usuario aceptó.

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F14-DC1 | La gráfica principal va siempre en columnas | §11 | El usuario eligió el estilo y no la forma; es la del Excel y la que sirve con pocos periodos | Práctica |
| F14-DC2 ⚠ | El plazo de reporte, el inicio de medición, «soporte obligatorio», el nivel de acceso y las personas son datos de operación: fuera de la ficha firmada y, en el impreso, en un bloque aparte (ajusta 3.13 y 3.16 para respetar 7.2) | §7.3 | Si se imprimieran dentro de la ficha firmada, la versión aprobada cambiaría sin cambiar de versión, que es lo que 3.9 corrigió | ISO derivada de 7.5.3.2 c) |
| F14-DC3 ⚠ | El cierre no alcanza las mediciones que siguen en su plazo de reporte ni los históricos sin registrar (ajusta 4.6 y 8.3) | §9 | Cerrar el 1 de abril dejaría «sin dato» lo que tenía plazo hasta el 10, y el primer cierre bloquearía toda la historia por llenar | Práctica |
| F14-DC4 | La meta base es opcional; sin meta, «Sin meta» en gris, sin alertas | §7.5 | Hay indicadores que solo se vigilan; reconcilia 3.3 con el «Sin meta» de 11.5 y del spec maestro | Práctica |
| F14-DC5 ⚠ | El soporte de una medición admite PDF, imagen y Excel `.xlsx`; no `.xls`, Word, comprimidos, SVG ni HTML; se sirve siempre como descarga (ajusta 8.2: el Excel viejo se guarda como `.xlsx` o PDF) | §8.2 | El usuario aceptó adjuntar el Excel de origen; `.xls` comparte contenedor con `.doc` y no se distinguen; aquí sube cualquier designado, no solo quien administra | Spec maestro §5.5 |
| F14-DC6 | Las fichas no entran al Listado Maestro de documentos | §3 | Su código, su versión, sus firmas y su control de cambios viven en el módulo; la lista con su Excel hace de listado de indicadores | ISO derivada de 7.5.3 |
| F14-DC7 | La sigla `IND` queda reservada en Tipos de documento | §7.1 | `SGC-IND-01` no debe confundirse con un documento `PROCESO-TIPO-NN` | Práctica |
| F14-DC8 | Las firmas de una ficha van en `firmas`, con la huella del contenido de la versión | §7.6, §19.1 | Una sola tabla de firmas, de solo inserción, con nombre y cargo congelados (precedente F13C-DC27) | ISO derivada de 7.5.2 c); Ley 527 de 1999 |
| F14-DC9 | El cierre del mes no pide clave | §9 | Es rutina mensual y reversible por reapertura justificada; la clave se reserva para lo que congela un documento | Práctica |
| F14-DC10 | El Admin SGC no reporta mediciones ordinarias salvo que esté designado o que el indicador no tenga a nadie activo que mida; en ese caso reporta con la marca `sinMedidor` | §6.1, §6.3 | Quien cierra el mes no debería producir los datos que cierra, pero un indicador sin responsable no puede quedar bloqueado (precedente F13A-DC2) | ISO derivada de 9.1.1 b) |
| F14-DC11 | No se reporta un periodo que no ha terminado | §8.1 | El dato de un periodo no existe antes de su fin | Práctica |
| F14-DC12 | Cada medición es una fila que se crea al terminar el periodo; toda lectura lo asegura | §8.1 | Da dónde colgar tareas, marcas de aviso y «sin dato» sin planificador | Práctica |
| F14-DC13 | `medicion_eventos` y `medicion_observaciones` de solo inserción; mediciones cerradas y versiones aprobadas inmutables por trigger | §19.4 | Son la evidencia de 9.1.1; el historial debe verlo quien ve el indicador, no solo quien ve la bitácora | ISO derivada de 7.5.3.1 b) |
| F14-DC14 | El intérprete calcula con fracciones exactas y solo admite cuatro operaciones, paréntesis y `min`, `max`, `abs`; los argumentos se separan con punto y coma | §7.4 | Sin error de coma flotante, el color nunca contradice la cifra; menos gramática es menos superficie; la coma queda libre para los decimales | ISO derivada de 9.1.1 b); seguridad |
| F14-DC15 | Reglas del semáforo en descendente y en constante; con meta 0 en descendente, rangos fijos | §7.5 | El Excel solo define el caso ascendente | Práctica |
| F14-DC16 | El acumulado se juzga contra la meta del último periodo medido, se rotula «parcial» si faltan periodos y cubre solo la versión vigente si cambió el cálculo | §8.10 | Evita un acumulado que mezcle fórmulas o se juzgue contra una meta que ya no rige | ISO derivada de 9.1.1 b) |
| F14-DC17 ⚠ | Un cambio mayor rige desde un periodo aún no reportado y nunca desde uno que no ha empezado (acota «desde el periodo que se indique») | §7.6 | No recalcula lo ya medido; sin fecha futura, la ficha vigente es siempre la última aprobada; la vigencia en fecha futura es de la Fase 16 | ISO derivada de 7.5.3.2 c) |
| F14-DC18 | El código queda fijo tras la primera aprobación; el retiro es definitivo; se borra solo lo que nunca se envió a aprobación, y lo enviado y nunca aprobado se descarta conservando su código | §7.1, §7.7 | El código identifica la evidencia; un retirado que revive confunde su historia; una firma ya puesta no se borra | Práctica (D47) |
| F14-DC19 | Sin líder disponible distinto de quien elaboró, aprueba Gerencia; el aprobador puede devolver con nota | §7.6 | No se traba un proceso sin líder; coincide con el Excel, donde aprueba el Gerente | Spec maestro §5.1 |
| F14-DC20 | El incumplimiento repetido no cambia el color: añade insignia, alerta crítica y análisis en dos partes; «no aplica» y «sin dato» ni cuentan ni rompen la racha | §10.3 | El color debe seguir diciendo el resultado del periodo | Práctica |
| F14-DC21 | Una observación genera tarea para quien analiza | §8.6 | Sin tarea, una observación sin respuesta solo se vería en el resumen del cierre | Práctica |
| F14-DC22 | El Excel lo descarga quien ve lo que exporta; lo que no ve, 404 | §13 | «Imprimir» no se separa de «consultar» (spec maestro) | Práctica |
| F14-DC23 | Las animaciones son CSS; `motion` no está instalada y no se añade | §4, §11 | Sin dependencias nuevas; `AGENTS.md` la lista por error | Stack |
| F14-DC24 | A lo sumo un indicador activo por cálculo y alcance | §15.2 | Es lo que hace posible «una sola meta» (6.5) | Práctica |
| F14-DC25 | «Objetivos cumplidos» toma la última medición de cada indicador dentro del periodo y cuenta también los restringidos; la página «Objetivos» usa solo lo que la persona ve | §16 | El conteo no revela nombres; la página no puede nombrar ni insinuar lo restringido | Regla de negocio 3 |
| F14-DC26 | Los impactos sobre indicadores van en una tabla propia, con las mismas reglas de plazo y escalamiento, y los resuelve el Admin SGC | §17.3 | La ficha es del Admin SGC; `impactos_normativos` reparte tarea y resolución por proceso al líder, y mezclarlos cambiaría reglas de la 13C | Práctica |
| F14-DC27 | La desagregación no se combina con la fuente automática; un dato compartido de un desagregado lleva la misma dimensión | §18.1 | Mantiene una sola forma de captura por indicador | Práctica |
| F14-DC28 | El porcentaje de cumplimiento que toma un compuesto se acota entre 0 y 100 % | §18.2 | Un sobresaliente no debe tapar a uno que falla | Práctica |
| F14-DC29 | La migración `0011` crea todas las tablas de la fase; la `0012` queda para ajustes de la 14B | §19.5 | Es la lectura literal de 14.1 | Práctica |
| F14-DC30 | La alerta sale cuando el resultado queda calculado, aunque falte el análisis | §10.3 | Quien analiza necesita saberlo para analizar | Práctica |
| F14-DC31 | Una medición reabierta se cierra con el siguiente cierre o con «Cerrar de nuevo» | §8.7 | No deja abierta indefinidamente una corrección | Práctica |
| F14-DC32 | La insignia de «Indicadores» cuenta las mediciones vencidas a cargo de la persona | §10.1 | Igual que la de Vigencia | Práctica |
| F14-DC33 | La constancia de envío no pide clave; corregirla exige justificación | §17.2 | Registra un hecho ocurrido fuera, con su soporte | Práctica |
| F14-DC34 | El aviso de escalamiento no nombra el indicador | §10.2 | El jefe puede no tener acceso a un restringido (precedente de la 13A) | Regla de negocio 3 |
| F14-DC35 | Reabrir un dato compartido o un componente reabre las mediciones cerradas que lo usaron, listándolas antes | §14, §18.2 | El resultado cerrado no puede quedar distinto de sus datos | ISO derivada de 9.1.1 b) |
| F14-DC36 | La aprobación en bloque es todo o nada | §7.6 | Una firma no debe quedar a medias | Práctica |
| F14-DC37 | En un desagregado, semáforo, alertas y análisis van sobre el total; el color por categoría es informativo | §18.1 | Evita multiplicar alertas y análisis por categoría | Práctica |
| F14-DC38 | «Conformidad en puntos de uso» se ofrece en dos cálculos: a la fecha y del periodo | §15.1 | El indicador 5 de la 13C tiene las dos formas | Spec 13C §11.1 |
| F14-DC39 | Con ficha del cálculo de conformidad «a la fecha», Distribución, la tarjeta de Vigencia y el informe anual toman de ella la meta, por una función única (opción 1 de §15.4). Se le preguntó al usuario, que aprobó el spec sin elegir expresamente: queda la recomendada, revisable al planear la 14B | §15.4 | Es llevar «una sola meta» (6.5) hasta Distribución, donde el umbral de conformidad hoy decide el «cumple». Cambia dos pantallas ya fusionadas | Usuario, 6.5 |
| F14-DC40 | Cada versión guarda los textos de los catálogos tal como se firmaron, y la huella va sobre ellos; el proceso queda fijo tras la primera aprobación y el subproceso es un cambio menor | §7.1, §7.2 | Renombrar un cargo o una unidad no puede cambiar una ficha aprobada; el proceso decide alcance, aprobador y acceso | ISO derivada de 7.5.3.2 c) |
| F14-DC41 | Los históricos programan su meta sin justificación, no llevan «Requiere acción de mejora» y no cuentan para el incumplimiento repetido | §8.8 | Todos terminaron antes de existir la ficha; digitar historia no debe crear pendientes ni cambiar marcas ya puestas | Práctica |
| F14-DC42 | Los cálculos automáticos los toma el sistema sobre todos los documentos, también los restringidos; los dos de conformidad solo admiten «toda la entidad» | §15.1 | La foto no tiene sesión y entrega cifras, no nombres; la conformidad no se desglosa por proceso en el código | Práctica |

## Apéndice A — La ficha propuesta por el usuario y dónde quedó cada campo

Transcripción de `INDICADORES_PROCESO_SGC_OK.xlsx` (ocho hojas, `IND-01` a `IND-08`, todas del
proceso «Sistema de Gestión de Calidad», versión 1, emitidas el 13/02/2026, elaboradas por el
Coordinador SGC, revisadas y aprobadas por el Gerente).

| En el Excel | En la plataforma |
|---|---|
| Encabezado: entidad, «Ficha técnica de indicador», código `SGC-IND-0X`, versión, fecha de emisión | Marca de la entidad; código (§7.1); número de versión y «vigente desde» (§7.6) |
| Nombre del indicador | Nombre |
| Proceso asociado | Proceso y subproceso (§7.1) |
| Requisito ISO («NTC ISO 9001:2015, numeral 9.2») | Requisito, texto libre [3.5] |
| Objetivo del indicador | Objetivo |
| Tipo de indicador: eficacia, eficiencia, efectividad | Tipo; la Clasificación es otra lista [3.1] |
| Punto de control («PC-13») | Punto de control, más el enlace opcional al procedimiento |
| Fórmula («(Auditorías ejecutadas / Auditorías programadas) × 100») | Forma «Porcentaje»; se guarda `A / B * 100` y se muestra en palabras (§7.4) |
| Descripción de variables: numerador y denominador | Lista de variables, cada una con descripción, fuente y unidad [3.10] |
| Meta («≥ 90 %») | Meta base 90 con tendencia ascendente (§7.5) |
| Unidad («Porcentaje») | Unidad del maestro |
| Periodicidad (trimestral, semestral, anual) | Periodicidad |
| Responsable («Coordinador SGC», «Gerente / Coordinador SGC») | Cargos responsables de medir y de analizar; las personas se designan aparte [3.4, 3.14] |
| Tendencia («Ascendente», «Constante (100 %)») | Tendencia: ascendente, descendente o constante [3.2] |
| Fuente («Programa de Auditorías Internas, informes…») | Fuente de cada variable [3.10] |
| Tabla «Seguimiento y medición, año 2026», con doce filas mensuales | Tabla del año con solo los periodos de la periodicidad [3.7] |
| Columnas numerador, denominador, resultado, meta, cumple, semáforo, análisis | Las mismas (§8) |
| Semáforo de la celda: verde si alcanza la meta, amarillo desde el 70 % de la meta, rojo por debajo | Modo «relativo a la meta» con umbral de atención 70 %, escrito en la ficha [3.11, 11.5] |
| «Promedio anual»: suma del numerador, suma del denominador y **promedio de los porcentajes** | «Acumulado del año», calculado con las sumas [3.7] |
| Representación gráfica: columnas del resultado y línea de la meta | Gráfica de tubos con la meta como línea (§11) |
| Elaborado por, revisado por, aprobado por | Firmas «Elaboró» y «Revisó y aprobó», con nombre, cargo y fecha (§7.6) |
| (No está) | Clasificación, objetivo que mide, línea base, rangos escritos, plazo de reporte, inicio de medición, soporte obligatorio, nivel de acceso, norma, control de cambios |
