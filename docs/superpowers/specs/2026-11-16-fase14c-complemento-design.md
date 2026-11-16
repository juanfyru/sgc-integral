# Fase 14C, complemento: el punto de miles, desde cuándo se exige el soporte y el periodo de un dato sin categorías

Anexo del 2026-11-16. Amplía el anexo de la 14C
(`docs/superpowers/specs/2026-11-15-fase14c-datos-compartidos-desagregacion-compuestos-design.md`) y manda sobre él donde
difieren. Recoge las tres entregas que el usuario aprobó al cerrar la 14C («P1 sí, P2 sí, P3 sí») y sus respuestas a las
preguntas de diseño del mismo día («1.2, 2.1, 3.1, 4.2»). Las marcas de origen: **[Usuario]** lo decidió el usuario;
**[Claude]** lo decidió quien escribe este anexo y el usuario lo revisa al aprobarlo.

## 1. Por qué

Tres cosas que la 14C dejó a medias y que pueden dar un dato equivocado o una carga injusta:

1. **El punto de miles.** En los formularios de los indicadores, «1.600» se guarda como 1,6 sin avisar. En los de los datos
   compartidos ya se rechaza (decisión 45 de la 14C). El caso más caro: una meta escrita «1.500» se firma en la ficha como
   1,5 y deja mal el color de todos los periodos hasta que se apruebe una versión nueva.
2. **Desde cuándo se exige el soporte.** El sistema sabe si un indicador exige soporte, pero no desde cuándo. Por eso la
   decisión 49 de la 14C tuvo que adivinar con el plazo de cada medición, y dejó casos raros: una medición reportada antes de
   activarse el soporte vuelve a pedirlo, ya vencida, si alguien le escribe un análisis; un soporte que sí se debía se
   perdona si el dato llega tarde; y el perdón depende de si el resultado cumple.
3. **El periodo de un dato que nace sin categorías.** Ocurre al poner en marcha una dimensión: las sedes se crean el 15 de
   noviembre y un indicador trimestral pide el dato de octubre, que nace sin ninguna (anexo de la 14C, §5.3: una categoría
   creada después de terminar el periodo entra en el siguiente). Nadie puede reportarlo hasta que quien administra pulse
   «Actualizar categorías» (decisión 44); mientras tanto su responsable recibe recordatorios, se le vence y se escala a su
   jefe, a quien administra nadie le avisa, y el indicador queda en «Falta un dato».

Lo que se busca: que ninguna cifra escrita por una persona se guarde distinta de lo que quiso decir, que la exigencia del
soporte sea exacta y la misma en cada pantalla, y que cada tarea le llegue a quien puede cumplirla.

## 2. Lo que decidió el usuario (2026-11-16)

| Pregunta | Respuesta | Qué significa |
|---|---|---|
| P1, alcance del punto de miles | **1.2** | Se rechaza en lo que se reporta cada periodo **y** en todas las cifras de la ficha, las metas programadas y los límites de captura de un dato. |
| P2, qué mediciones deben el soporte | **2.1** | Las que tenían su plazo de reporte en curso, o por venir, cuando se activó. |
| P2, fichas que ya lo exigen | **3.1** | Cuentan desde la última activación que registró la bitácora; sin rastro, desde la creación del indicador. |
| P3, periodo sin categorías | **4.2** | Aviso y tarea a quien administra; el responsable no carga con él mientras siga sin categorías; el cierre lo espera. |
| P2, cuándo se decide la deuda (tras la lectura del anexo) | **5.1** | Una vez por medición, al activarse el soporte o al nacer la medición, y se guarda: un cambio de plazo posterior no la cambia. La debe también la medición vencida y sin reportar al activarse, cuando se reporta. |

## 3. El punto de miles [Usuario, 1.2]

### 3.1 La regla

Un número **escrito por una persona** que tiene forma de miles con punto se rechaza: después de quitar los espacios de los
extremos, coincide con `^-?[1-9]\d{0,2}(\.\d{3})+$` («1.600», «12.500», «1.284.300», «-1.600»). El mensaje es el de los
datos: **«Escriba el valor sin puntos de miles (1731); para decimales use la coma (1,731)»**, precedido del nombre del campo
o de la variable cuando el formulario tiene varios (como hoy se nombra la variable en «… debe ser un número»).

Siguen valiendo como hoy: «1600», «1,6», «1.6», «0.125», «1600.5», «1,731». Un decimal de exactamente tres cifras con parte
entera de 1 a 999 se escribe con coma («2,375»): es el costo, el mismo que ya aceptó la decisión 45.

Hay **una sola regla** en todo el módulo [Claude]: la de los datos (`CON_PUNTO_DE_MILES` y `SIN_PUNTOS_DE_MILES`,
`src/db/consultas/indicadores/datos-periodos.ts`) pasa a un lugar común y la usan todos los lectores. La importación, que hoy
marca una meta ambigua con su propia expresión (`PUNTO_DE_MILES`, `src/lib/indicadores/importacion/revisar.ts`, que también
marca «0.125»), pasa a la misma expresión y conserva su mensaje propio, que sugiere las dos escrituras porque viene de un
archivo.

### 3.2 Dónde se aplica

- **Lo que se reporta cada periodo:** reportar (lo propio de un mixto y el indicador entero), la rejilla por categoría y los
  históricos (también el valor de un componente en el histórico de un compuesto). Vale también para el cálculo en vivo de la
  pantalla: el error se ve antes de enviar. Hoy todo esto pasa por `leerValor` (`src/lib/indicadores/reporte.ts`).
- **La ficha:** meta, máximo del rango, límite de crítico, tolerancia, mínimo y máximo del resultado, línea base, los valores
  de los rangos del semáforo (desde y hasta), los límites de captura de cada variable y los valores de la prueba de la
  fórmula. Hoy pasan por `numero()` (`src/lib/esquemas/indicadores.ts`) y el esquema de la prueba.
- **Las metas programadas** de un periodo (meta y máximo).
- **Los límites de captura de un dato compartido** (`src/lib/esquemas/indicadores-datos.ts`).
- **La importación:** la meta de cada fila, con la misma expresión (§3.1).

### 3.3 Lo que no cambia

- **Nada guardado se reinterpreta.** La regla es para lo que escribe una persona. Lo que el sistema guarda y pasa entre sus
  partes usa punto decimal («1.731» guardado es 1,731), así que el texto ya normalizado que pasan la semilla, las pruebas o
  el propio código no debe llegar a la regla; donde llegue, se pasa con coma o sin decimales. Quien construye busca en la
  semilla y en las pruebas los textos con tres decimales que hoy pasan por esos lectores.
- **La regla mira el texto tal como lo escribió la persona.** No basta con ponerla en el esquema del servidor: dos campos de
  la ficha viajan transformados. El editor de rangos cambia la coma por punto antes de armar su campo oculto
  (`EditorDeRangos.tsx`), así que un «2,375» bien escrito llegaría como «2.375»; y los límites de captura de cada variable
  viajan desde el estado del formulario, que trae el valor guardado con punto (`FormularioFicha.tsx`, `valoresDeVersion`).
  En esos dos se valida antes de transformar o se cambia el formulario para que envíe lo escrito; en todos, un valor
  guardado que nadie tocó tiene que llegar sin que la regla lo confunda. Los rangos que escribe el sistema (al duplicar,
  `rangosEquivalentes`; al importar, `rangosDeLaRegla`) y la meta normalizada de la importación (`numeroCanonico`) nunca
  pasan por la regla.
- **Un valor que la persona no tocó no se rechaza.** Todos los campos se rellenan hoy con coma decimal al corregir (`conComa`,
  `enCampo`, `numeroEs`); eso se conserva y se comprueba campo por campo.
- **El intérprete de fórmulas** (`src/lib/indicadores/formula/fraccion.ts`) no cambia.
- **Las pantallas de los indicadores** siguen mostrando las cifras sin punto de miles; solo las de los datos lo llevan
  (decisión 3 de la 14C).

### 3.4 Cómo se ve [Claude]

La ayuda **«Sin puntos de miles; use la coma para los decimales.»** va bajo los campos de valor de reportar, de la rejilla y
de los históricos, como en los datos. En la ficha y en las metas no se repite bajo cada cifra: basta el mensaje al rechazar,
porque la llena una sola persona y una vez.

## 4. Desde cuándo se exige el soporte

### 4.1 La fecha y la marca [Usuario, P2 y 5.1]

Dos columnas nuevas, en la migración `0017`:

- **`indicadores.soporte_obligatorio_desde`** (`timestamptz`): desde cuándo el indicador exige soporte. Es nula si no lo exige
  y tiene fecha si lo exige (un `CHECK` lo mantiene [Claude]). Es lo que se muestra y lo que audita.
- **`mediciones.debe_soporte`** (booleano, falso por omisión): si esa medición quedó obligada a llevar soporte. Es lo que
  decide (§4.2).

La fecha:

- **Activarlo** (pasar de no a sí) pone la hora de ese cambio: en «Datos de operación» (`cambiarOperacion`), en un borrador
  (`guardarBorrador`), al crear un indicador o al duplicarlo.
- **Desactivarlo** la borra. **Volver a activarlo** pone la fecha nueva; no se guardan los intervalos anteriores.
- Cuando `alPublicarVersion` apaga el soporte porque la versión aprobada no la mide nadie (un automático o un indicador sin
  variables propias, `publicacion.ts`), también la borra.
- Guardar sin cambiar el soporte no toca la fecha.

### 4.2 La regla [Usuario, 2.1 y 5.1]

Una medición **debe el soporte** si el indicador lo exige **y** la medición está marcada (`debe_soporte`). La marca se decide
**una sola vez**:

- **Al activarse el soporte**, en las mediciones en curso (sin cerrar y no históricas): quedan marcadas todas **salvo las
  que quien mide ya había reportado con su fecha límite pasada**. «Reportado» es que quien mide ya entregó lo suyo
  (`reportada_en`), también en un mixto que espera su dato; «fecha límite pasada» es `vence_en` anterior a la hora de la
  activación. Las demás (en plazo, o vencidas y sin reportar) lo deben.
- **Al nacer** una medición mientras el indicador exige soporte, nace marcada. Una histórica nunca se marca.
- **Al volver a activarlo** se decide otra vez, para las en curso, con la misma regla y la hora nueva. Desactivarlo no hace
  falta que toque las marcas: el indicador ya no lo exige.
- **Nada más la cambia:** ni un cambio del plazo del indicador, ni una fuente que llega, ni la racha, ni un análisis, ni una
  corrección.
- Siguen sin deberlo, como hoy: la medición histórica, la de un indicador automático y la de un indicador sin variables
  propias (nadie podría adjuntarlo; `alPublicarVersion` apaga el soporte).
- Ejemplo: septiembre vence el 10 de octubre y quien mide lo reportó el 3 sin soporte. Activado el 5 de octubre, lo debe
  (vuelve a abierta para pedirlo, como hoy); activado el 12, no lo debe. Si el 12 septiembre seguía sin reportar, lo debe
  y reportarlo exige adjuntarlo, como hoy.

Es la regla que rige desde la 14A («el soporte rige hacia adelante», F14A-R52), decidida en el momento de activar y guardada.
Con ella el sistema decide **lo mismo en cada recálculo, venga de quien venga** (una persona, la racha, una fuente que llega,
el cambio del soporte o un análisis), en cada pantalla y en el rechazo de un reporte sin soporte. Las piezas que hoy
aproximan la regla se retiran: la excepción de la racha y de la fuente para lo ya reportado y `esperabaElDato`
(`recalcularMedicion`, `src/db/consultas/indicadores/mediciones.ts`), la condición de plazo de `debeElSoporte`
(`src/db/consultas/indicadores/tareas.ts`) y su uso en `lista.ts`; `recalcularPorSoporte`
(`src/db/consultas/indicadores/en-curso.ts`) pasa a ser quien decide las marcas al activar.

### 4.3 Las fichas que ya exigen soporte [Usuario, 3.1]

La migración pone la fecha a cada indicador que hoy exige soporte:

- **La de la última fila de la bitácora** del indicador que lo deja exigiéndolo cuando antes no lo exigía, o que lo crea
  exigiéndolo. La bitácora ya guarda el antes y el después de la operación (`indicador_operacion`, y la operación en
  `indicador_creado` e `indicador_borrador_guardado`; quien construye confirma la forma de cada `detalle` y si
  `indicador_duplicado` la trae).
- **Sin ese rastro**, la creación del indicador (`indicadores.creado_en`).

Y marca las mediciones en curso de esos indicadores con la regla de §4.2 aplicada a esa fecha: lo deben todas salvo las que
quien mide reportó antes de la fecha con su fecha límite anterior a ella (la fecha límite de su reporte, la de «Reportes a
tiempo»: el `venceAntes` del primer evento que lo lleve o `vence_en`). Las **cerradas** se quedan sin marca [Claude]: el
trigger de las cerradas no deja escribirlas, y una cerrada que se reabra no le debe a nadie un soporte que no se le pedía al
cerrarla. Las marcadas después de la migración conservan su marca al cerrarse.

**Migrar no recalcula ninguna medición** [Claude]: el estado lo escribe solo `recalcularMedicion` (regla de `AGENTS.md`), y
una migración no puede llamarlo. Cada medición se ajusta a la regla la próxima vez que algo la recalcule. Una medición
guardada «abierta» solo por un soporte que la regla nueva ya no le pide quedaría en un estado viejo hasta entonces: la prueba
sobre la copia de `sgc` (§6) cuenta cuántas hay; si hay alguna, se le dice al usuario antes de fusionar, con la salida
(recalcularlas una vez).

### 4.4 Cómo se ve [Claude]

- **La ficha técnica** (y su impreso) dice **«Sí: cada reporte lleva su soporte, desde el 12 de octubre de 2026»** donde hoy
  dice «Sí: cada reporte lleva su soporte».
- **La pantalla de reportar** (también la rejilla y la zona de soportes) solo dice «Este indicador exige un soporte:
  adjúntelo antes de reportar» cuando **esa medición** lo debe; en una que no lo debe, el soporte es opcional y lo dice como
  en un indicador sin soporte obligatorio. El servidor rechaza un reporte sin soporte con la misma regla.
- **Tareas, lista y tabla del año** dicen lo mismo: no puede volver a pasar que la tabla diga «Falta un dato» mientras la
  tarea dice «Reportar» por el soporte.
- **Un soporte que se debe mientras la medición espera su dato** [Claude] es tarea de quien mide como cualquier soporte que se
  debe: se puede adjuntar sin el dato, así que vence con la fecha límite de la medición y la pasada avisa y escala (hoy, bajo
  «Falta un dato», nada vence). La lista y la tarea dicen «Falta el soporte obligatorio», con vencido si corresponde, y la
  tabla del año añade «falta el soporte» bajo «Falta un dato».
- **Una medición tiene una sola fecha límite** [Claude]: si el dato llega tarde y el resultado pide análisis, el sistema
  recuenta esa fecha (decisión 48 de la 14C) y lo que todavía falte, el soporte incluido, vence con la fecha nueva. Lo que no
  depende del resultado es **si** se debe el soporte.

### 4.5 Casos que deben salir

Con septiembre que vence el 10 de octubre y un mixto que espera un dato (quien mide reportó lo suyo el 3, sin soporte):

1. Activado el 12 de octubre (plazo vencido), el dato llega el 20 y el resultado no cumple: pide análisis con plazo nuevo y
   **no** pide el soporte.
2. Activado el 12, el dato llega el 20 y cumple: queda reportada; si después alguien le escribe un análisis opcional, **sigue
   reportada** (hoy vuelve a abierta y aparece vencida).
3. Activado el 5 de octubre: **debe** el soporte aunque el dato llegue el 20 (hoy se perdona). Entre el 5 y el 10 tiene la
   tarea; si pasa el 10 sin adjuntarlo, sale vencida y la pasada avisa y escala, porque lo debía desde el 5 (§4.4).
4. Activado antes de septiembre: septiembre nace marcada y lo debe, como hoy.
5. Activado el 5, desactivado el 8 y vuelto a activar el 12: el 8 nadie lo debe; el 12 septiembre ya estaba reportado con su
   plazo vencido, así que no lo debe.
6. Desactivado: nadie lo debe; la que solo esperaba el soporte queda reportada, como hoy.
7. Activado el 12; el 1 de noviembre el plazo del indicador sube a 15 días: septiembre **sigue sin deberlo** (la marca no
   cambia con el plazo).
8. Septiembre sin reportar y vencido al activarse el 12: lo debe; reportarlo el 20 exige adjuntarlo, como hoy.
9. Un indicador que lo exigía antes de la migración: su fecha es la de la bitácora o, sin rastro, la de su creación, y sus
   mediciones en curso quedan marcadas con la regla de §4.3.

## 5. El periodo de un dato que nace sin categorías [Usuario, 4.2]

Un periodo **pendiente** de un dato con dimensión cuya lista de categorías está **vacía**. No cambia lo que entra en la lista
(anexo de la 14C, §5.3) ni el rechazo de reportarlo vacío (decisión 44).

### 5.1 El aviso

Cuando un periodo así **nace** (`asegurarDe`, `src/db/consultas/indicadores/datos-periodos.ts`), cada persona activa con
`indicadores.administrar` recibe un aviso en la campana, una sola vez por periodo. Propuesta de texto [Claude]: **«El periodo
octubre de 2026 del dato «…» no tiene categorías: actualícelas para que se pueda reportar»**, con enlace a la página del
dato. El aviso nombra el dato y el periodo, nunca un indicador.

### 5.2 La tarea de quien administra

Mientras la lista siga vacía, el periodo es tarea de quien administra en **Mis tareas**: **«Actualizar las categorías de
{dato}, {periodo}»**, con enlace a la página del dato, donde ya está el botón «Actualizar categorías». No vence ni escala
[Claude]: es configuración. Si la dimensión no tiene ninguna categoría activa, el detalle de la tarea lo dice (primero hay que
crearlas o activarlas en el maestro) [Claude].

### 5.3 El responsable mientras tanto

Mientras la lista siga vacía, el periodo **no es tarea de su responsable**: sin tarea, recordatorio, vencido ni escalamiento
(como «Falta un dato», que no es tarea de nadie). La página del dato lo sigue mostrando, con el aviso en lugar del formulario;
el texto pasa a decir que quien administra ya lo tiene pendiente [Claude]: **«Este periodo no tiene categorías: el
Administrador del SGC debe actualizarlas antes de reportarlo»**.

### 5.4 El cierre del mes

El cierre **no lo cierra «Sin dato»: lo espera**, como a un periodo que sigue en su plazo, y las mediciones que lo usan
esperan con él. El resumen del cierre lo cuenta aparte [Claude]: «n periodos de datos compartidos esperan que se actualicen
sus categorías: quedan para el siguiente cierre».

Si la dimensión **no tiene ninguna categoría activa** [Claude], no hay nada con qué actualizarlo y esperar no tendría fin: el
cierre lo cierra «Sin dato», como hoy, y el resumen dice por qué («su dimensión no tiene categorías activas»).

### 5.5 Al actualizar

En cuanto «Actualizar categorías» añade al menos una, el periodo vuelve a su responsable **con su plazo completo contado
desde ese día** [Claude] (el plazo no corre mientras no se puede reportar) y sus avisos empiezan de nuevo: nadie queda vencido
por lo que no podía hacer (F14C-DC42, por analogía). La fecha nueva queda en el evento de la actualización.

### 5.6 Casos que deben salir

Con un dato mensual de 10 días de plazo:

1. Sedes creadas el 15 de noviembre; un indicador trimestral por sede aprobado el 16 pide el dato de octubre: octubre nace
   vacío el 16 (con fecha límite el 26, porque no nace vencido), quien administra recibe el aviso y la tarea, y el
   responsable no tiene nada.
2. Pasa el 26 de noviembre sin actualizar: el responsable no recibe vencido ni escalamiento.
3. Quien administra actualiza el 30: el periodo pasa al responsable con fecha límite el 10 de diciembre (diez días desde el
   30); la tarea de quien administra desaparece.
4. Ningún cierre lo cierra «Sin dato» mientras siga vacío: el resumen lo cuenta aparte. Como el cuarto trimestre termina en
   diciembre, la medición del indicador que lo usa espera en el cierre de diciembre si octubre sigue vacío.
5. La dimensión no tiene categorías activas: «Actualizar categorías» no añade nada, la tarea sigue diciendo por qué y el
   cierre lo cierra «Sin dato» con su razón.
6. Un periodo que nadie pide (se conserva por su historia) no genera aviso ni tarea.

## 6. Migración y continuidad

Una sola migración, la `0017`: las dos columnas de §4.1, el `CHECK` de la fecha, la fecha de los que ya exigen soporte y las
marcas de sus mediciones en curso (§4.3). Solo añade (regla 11 de `AGENTS.md`): se puede aplicar sobre una base de
`sgc-suaza` y sobre la de la 14C. No cambia la huella de ninguna ficha: el soporte obligatorio es dato de operación, fuera del
contenido firmado. Al cierre, la prueba sobre una copia de `sgc` como en la 14C: conteos y huellas de todas las tablas antes y
después (las dos tablas que ganan una columna, comparadas sobre sus columnas de antes), la fecha que quedó en cada indicador
que exige soporte, cuántas mediciones quedaron marcadas y cuántas quedarían con un estado viejo (§4.3).

## 7. Lo que no se hace

- Mostrar punto de miles en las pantallas de los indicadores.
- Reinterpretar valores ya guardados.
- Guardar los intervalos de activación del soporte: solo la última.
- Cambiar qué categorías entran en la lista de un periodo (anexo de la 14C, §5.3).
- Avisar por correo (Fase 16).

Sería un fracaso aunque funcione: que se rechace un valor que la persona no tocó; que alguien quede vencido o escalado por un
soporte que no se le pedía o por un periodo que no podía reportar; que el aviso o la tarea nombren un indicador.

## 8. Lo que decidió quien escribe este anexo [Claude]

| Decisión | Porque | Base |
|---|---|---|
| Una sola regla y un solo mensaje para el punto de miles en todo el módulo; la importación usa la misma expresión y conserva su mensaje | Dos expresiones distintas ya daban resultados distintos («0.125») | Práctica |
| La ayuda «Sin puntos de miles…» bajo los campos que se reportan cada periodo, no bajo cada cifra de la ficha | La ficha la llena una persona una vez; repetida doce veces es ruido | Práctica |
| Desactivar borra la fecha; reactivar pone una nueva; sin intervalos | Con la marca por medición basta la última activación | Práctica |
| Las mediciones cerradas antes de la migración quedan sin marca | El trigger de las cerradas no deja escribirlas, y al reabrirse no deben lo que no se les pedía al cerrarlas | ISO 7.5.3 (lo cerrado no cambia) |
| Migrar no recalcula mediciones; la prueba sobre la copia cuenta las que quedarían con un estado viejo | El estado solo lo escribe `recalcularMedicion` y una migración no puede llamarlo | Práctica |
| Un soporte que se debe mientras falta el dato vence y escala como cualquier soporte | Se puede adjuntar sin el dato | Práctica |
| Una sola fecha límite por medición: lo que falte vence con ella | Dos fechas para una misma medición confundirían tareas y avisos | Práctica |
| Al actualizar las categorías, el plazo completo cuenta desde ese día | El plazo no corre mientras no se puede reportar | F14C-DC42, por analogía |
| Sin categorías activas en la dimensión, el cierre lo cierra «Sin dato» con su razón | Esperar no tendría fin | Práctica |
| La ficha técnica dice desde cuándo exige soporte | Quien audita ve desde cuándo rige el requisito | ISO 7.5.3 |
| La tarea de quien administra no vence ni escala | Es configuración, no una medición | Práctica |
| El texto del aviso en la página del dato dice que quien administra ya lo tiene pendiente | El aviso y la tarea de §5.1 y §5.2 ya se lo llevan | Práctica |
| El resumen del cierre cuenta aparte los periodos que esperan categorías | Quien cierra el mes es quien puede resolverlo | Práctica |
| La demo trae un indicador con soporte obligatorio activado a mitad de un plazo; no trae un dato por sede con un periodo vacío | Lo primero se ve en el recorrido; lo segundo exige una dimensión creada a destiempo y lo cubren las pruebas | Práctica |

## 9. Lo que queda a quien construye

Dónde vive la regla común del punto de miles y cómo se nombra el campo en cada mensaje; en qué funciones nacen las mediciones
y dónde se les pone la marca al nacer (todas las que crean mediciones, por un solo camino); la consulta que marca al activar; el tipo de aviso y su texto final; cómo
recoge la tarea de quien administra el fragmento de «periodo sin categorías» sin duplicar `periodoQueSePide`; la forma exacta
de la consulta de la migración contra la bitácora; y qué pruebas existentes cambian porque fijaban la regla aproximada de la
decisión 49.

## 10. Al cerrar

`AGENTS.md` (la regla del soporte obligatorio con su fecha, en lugar de la aproximación de la 14C; el punto de miles; el
periodo sin categorías), el capítulo 8 del manual (reportar, la ficha, los datos y el cierre), `CONTEXT.md` (hecho, qué probar
y cómo, avisos, decisiones y deuda) y `PLAN.md`. Las decisiones 44, 45 y 49 de la 14C quedan reemplazadas en lo que este
anexo cambia, y se dice así.
