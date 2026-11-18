# Fase 15B — Anexo al spec de la Fase 15: planes y enganches

Fecha: 2026-11-18. Estado: **aprobado por el usuario el 2026-11-18** («aprobado el anexo, continuemos
con el plan de la 15B»), después de la revisión del constructor. Sus decisiones son los temas B1 a
B8, elegidas por número; las maquetas («están ok»); y C1 a C3, que salieron de esa revisión. Amplía §17 del
spec de la Fase 15 (`docs/superpowers/specs/2026-11-17-fase15-planes-de-mejoramiento-design.md`,
«spec 15») y **manda sobre él donde difieren**; §1 dice en qué. Sigue el plan de implementación.

## 0. Cómo leer este documento

El spec 15 dejó la entrega 15B «al nivel de lo ya decidido» (su §17), con su anexo por escribir al
empezarla. Este es ese anexo. Se escribió con la 15A fusionada (`main` en `5b3b887`, diecinueve
migraciones) y después de leer el código que la 15B toca. Lo que aquí no se menciona sigue como en
el spec 15, en las decisiones de la ejecución de la 15A (`CONTEXT.md`, «Decisiones adicionales (Fase
15A)») y en `AGENTS.md`.

Mandan, en este orden: este anexo; el spec 15; el spec maestro; los specs de la 13A, la 13B, la 13C
y la 14 donde se citan; y las reglas permanentes de `AGENTS.md`.

Marcas: **[Usuario, Bn.n]** es una decisión del usuario del 2026-11-18 (el número es el de la opción
que eligió); **[Usuario, n.n]**, una de las del spec 15 (su §2); **[Maquetas]**, lo que aprobó al
verlas; **[Claude, F15B-DCn]**, una decisión de diseño que el usuario puede revisar (reunidas en
§17, con su base: **ISO**, **ISO derivada**, **Regulación** o **Práctica**); **⚠** marca lo que
ajusta la letra de un punto aprobado del spec 15; **[Constructor]** queda a criterio de quien
construya.

Vocabulario, además del del spec 15:

- **Plan:** el plan de mejoramiento, el agrupador opcional de hallazgos (`PM-2026-02`). No es el
  **plan de acción** de un hallazgo (sus acciones y actividades).
- **Hallazgo que cuenta:** el que no está anulado ni rechazado. Es el que entra a las cifras, a los
  impresos y al Excel.
- **Quien ve todo:** quien tiene `mejora.ver_todo` (Admin SGC, Gerencia y Control Interno).
- **Consolidado:** el SGC-FO-14 de un proceso en un año, con plan o sin él.
- **Marca:** «Requiere acción de mejora» en una medición de un indicador. **Pendiente:** la marca
  que espera una decisión. **Salida:** esa decisión.
- **Terminó bien** (un trámite documental): publicó su versión o aplicó su eliminación.

Las maquetas (no versionadas) están en
`.superpowers/brainstorm/963-1795030914/content/pantallas-15b.html`: ocho pantallas (la pestaña
«Planes», la página del plan, el Excel para el ente, el SGC-FO-14, la marca del indicador, el
hallazgo de verificación y el impacto, el cambio documental y los hallazgos en las otras páginas).
Son la referencia del **contenido y el orden**; el acabado es el del sistema visual de la Fase 12.

## 1. Lo que cambia de la letra del spec 15

| Punto del spec 15 | Decía | Queda |
|---|---|---|
| §17.2 y §28 | El formato del ente espera la plantilla del ente | Lo diseña este anexo, con trece columnas (§4). «Efecto», «unidad de medida» y «cantidad» no existen. Si después llega una plantilla oficial distinta, se ajusta como complemento [Usuario, B1] |
| §19.3 | El plan y el objetivo, columnas de `mejora_hallazgos`; la actividad, una columna de `tramites` | La clasificación de un hallazgo (su plan y su objetivo) vive fuera de su fila (§3.3); el enlace entre una actividad y un trámite, en una tabla del módulo (§9.1) [Claude, F15B-DC3 y DC29] |
| §13.4 | La respuesta al ente se registra hallazgo por hallazgo | Un hallazgo que está en un plan se responde desde el plan, una vez para todos los que estén listos (§3.8) [Usuario, B2.7] |
| §17.3 | Es un pendiente toda medición que lleva la marca | Lo es desde que la medición tiene su análisis, o desde que su plazo se vence (§6.1) [Usuario, B4.2] |
| §17.4, con §8.4 y §8.5 | La no conformidad abierta desde un hallazgo de verificación sigue el recorrido | Aceptada, pasa directo a «Por formular»: no se escribe otra corrección ni se decide otra vez (§7.2) [Usuario, B5.1] |
| §17.4 | El botón y la sugerencia, en «la página del hallazgo de verificación» y en «la del punto» | El hallazgo de verificación no tiene página: van en su fila, donde Distribución lo muestra (§7.1) [Claude, F15B-DC21] |
| §17.5 | Cuenta el trámite pedido desde la actividad | Además se puede enlazar un trámite que ya existe (§9.3) [Usuario, B6.4] |
| §17.5 y §10.4 | Vale el trámite «ya publicado»; el cierre mira los trámites «del hallazgo» | Vale el que **terminó bien** (publicado, o eliminado en una eliminación); el cierre mira los de **la ronda que se cierra** (§9.4 y §9.6) [Claude, F15B-DC28 y DC31] |
| §17.5 | «Cuando el trámite publica, el sistema lo anota en la actividad» | El motor del trámite no llama a Mejoramiento: el estado se lee y el aviso sale en la pasada (§9.5) [Claude, F15B-DC30] |
| §17.6 | «Abrir hallazgo» en «la página de un impacto» sobre un indicador | Va en la página del indicador, junto a su revisión, que es donde se resuelve (§8) [Claude, F15B-DC25] |
| §17.6 y §17.7 | Documento, proceso e indicador | Además, la norma y la página «Objetivos» (§10) [Usuario, B7.1 y B7.2] |
| §16.2 | La lista muestra todo | Por omisión, los abiertos, con 50 por página (§11.1) [Usuario, B8.1] |
| §12.2 y decisión 9 de la 15A | Los adjuntos del análisis y la evidencia del registro se quitan hasta que el hallazgo termina | No se quitan desde que el plan de acción se envía, salvo el retiro por datos personales (§11.2) [Usuario, B8.4 y C2.1] |
| §6.2 | Ocho permisos | Nueve: `mejora.planes` (§3.2) [Claude, F15B-DC2] |

## 2. Decisiones del usuario (2026-11-18)

Tomadas una por una, con las opciones, la recomendación de Claude, su base y su porqué; el usuario
eligió por número.

**Tema B1. El formato del ente** («es mejor que diseñes uno, que tenga como mínimo los siguientes
componentes…»; «b1.5, b1.7, irían de la b1.10 a la b1.12»). No se espera ninguna plantilla: el
formato se diseña aquí. El usuario dio un ejemplo con once datos por fila (la auditoría, la vigencia,
el hallazgo, la acción, un plazo, la fecha de inicio, otro plazo, la fecha de terminación, el avance,
la observación y el responsable).

- B1.5 Los dos plazos del ejemplo son el mismo dato: una sola columna «Plazo», que calcula el
  sistema.
- B1.7 Una fila por actividad.
- B1.10 a B1.12 Además del mínimo: el código del hallazgo, la causa raíz y el estado de la
  actividad.

**Tema B2. El plan** («b2.1, b2.4, b2.7, b2.9, es importante indicar que un hallazgo puede tener
varias tareas»).

- B2.1 Un hallazgo entra, sale o cambia de plan en cualquier estado, también cerrado. Cada
  movimiento queda en el historial del plan y en la bitácora; sacar pide motivo. Del hallazgo no
  cambia nada.
- B2.4 Un hallazgo de otro origen o con otra fecha del ente entra igual: conserva lo suyo y la
  pantalla advierte la diferencia.
- B2.7 La respuesta al ente se registra una vez desde el plan y vale para todos sus hallazgos con
  plan de acción aprobado. La tarea del Admin SGC es una por plan. Un hallazgo suelto sigue como
  hoy.
- B2.9 El plan lleva archivos propios (el informe de la auditoría, el oficio del ente, el de
  respuesta), que solo abren el Admin SGC, Gerencia y Control Interno.
- **Varias tareas por hallazgo.** Un hallazgo tiene una o varias acciones y cada acción una o varias
  actividades (las «tareas»), cada una con su responsable, sus fechas, su avance y sus seguimientos
  (spec 15 §10). En el Excel del ente y en el SGC-FO-14 cada actividad es una fila, y el hallazgo se
  repite en cada una, sin celdas combinadas.

**Tema B3. El SGC-FO-14** («b3.1, b3.4, b3.7»).

- B3.1 El consolidado de un proceso en un año trae los hallazgos que estuvieron abiertos en algún
  momento de ese año: los registrados ese año y los que venían abiertos.
- B3.4 El consolidado es una sola hoja. «Código del plan» dice «Consolidado del proceso», «Fuente»
  marca los orígenes presentes, «Objetivo del plan» queda en blanco y cada fila dice su plan o «Sin
  plan».
- B3.7 Los hallazgos sin plan de acción aprobado salen, con una fila que dice en qué van.

**Tema B4. La marca de un indicador** («b4.2, b4.4»).

- B4.2 La marca es un pendiente desde que la medición tiene su análisis; si el plazo del análisis se
  vence sin que nadie lo escriba, desde ese día.
- B4.4 Cada marca nueva es un pendiente aunque el indicador ya tenga un hallazgo abierto. La
  pantalla propone añadirla como ocurrencia, y decide una persona.

**Tema B5. El hallazgo de verificación y el impacto de norma** («b5.1, b5.4»).

- B5.1 La no conformidad abierta desde un hallazgo de verificación nace como cualquier otra (el
  líder la acepta o la rechaza) y, aceptada, pasa directo a «Por formular»: la corrección es la del
  hallazgo de verificación, enlazada, y la acción correctiva queda decidida con la justificación que
  el Admin SGC escribe al abrirla.
- B5.4 La página de un impacto de norma sugiere abrir el hallazgo cuando el impacto está vencido, ya
  se avisó al jefe y sigue sin resolverse.

**Tema B6. El cambio documental desde una actividad** («b6.1, b6.4»).

- B6.1 El cambio lo pide quien ve la actividad y ya puede solicitar trámites. Al responsable que no
  puede, la página le dice a quién pedírselo.
- B6.4 A la actividad se le puede enlazar un trámite que ya existe.

**Tema B7. Las otras páginas** («b7.1, b7.2»).

- B7.1 «Objetivos» muestra, en cada objetivo, cuántos hallazgos abiertos apuntan a él.
- B7.2 La página de una norma muestra los hallazgos que la citan como requisito incumplido, sin
  botón.

**Tema B8. La deuda de la 15A** («b8.1, b8.4»).

- B8.1 La lista muestra por omisión solo los abiertos, con 50 por página.
- B8.4 Los archivos del análisis y la evidencia del registro no se quitan desde que el plan se envía
  con «Elaboró»; si se devuelve, los del análisis vuelven a poder quitarse hasta el reenvío.

**Tema C. Después de la revisión del constructor** («c1.1, c2.1, c3.1»).

- C1.1 Lo que nace de un enganche y termina rechazado o anulado libera su cupo: la marca vuelve a
  ser un pendiente, y el hallazgo de verificación o el impacto pueden abrir otro.
- C2.1 El Admin SGC puede retirar un archivo congelado «por datos personales», con justificación y
  con su rastro, mientras el hallazgo no ha terminado.
- C3.1 Un valor que se reporta después de la fecha límite deja la marca como pendiente en ese
  momento, sin análisis; no hay un plazo aparte.

**Las maquetas** («están ok»). Con ellas el usuario vio, además: que el avance de un plan es el
promedio de sus hallazgos con plan de acción aprobado, y que en el Excel del ente el hallazgo sin
plan de acción aprobado sale con una fila que dice en qué va.

En cada tema Claude listó además lo que daba «por decidido si no dice otra cosa». El usuario no
objetó ninguno, pero **son decisiones de Claude**, no suyas: están en §17, cada una con su número.

## 3. El plan de mejoramiento

### 3.1 Campos

[Usuario, 2.1 y 12.7; spec 15 §17.1.]

| Campo | Regla |
|---|---|
| Código | `PM-AAAA-NN`. `AAAA` es la **vigencia** del plan; `NN`, un consecutivo por vigencia, de dos cifras como mínimo (el cien sale `PM-2026-100`). Lo asigna el sistema dentro de la transacción, sin huecos por concurrencia, y nunca se reutiliza, tampoco el de un plan anulado [Claude, F15B-DC1] |
| Nombre | El evento, de 5 a 200 caracteres («Auditoría de cumplimiento vigencia 2025 · PVCFT 2026»). Es la columna «Auditoría o evento» del Excel del ente y lo que el plan propone como **fuente** a los hallazgos que se registran en él |
| Origen | Uno de los catorce (spec 15 §7.2) |
| Fecha del evento | Un día, del año 2000 al 2100 |
| Vigencia | Un año, del 2000 al 2100; por omisión, el de la fecha del evento. **No se edita** después de creado el plan: está en su código |
| Objetivo del plan | Texto opcional, hasta 1.000 caracteres |
| Objetivo | Opcional: uno del maestro `objetivos`, activo al elegirlo (§10.4) |
| Fecha límite del ente | Solo con origen externo: obligatoria en «Ente de control», opcional en «Auditoría externa», como en el hallazgo (spec 15 §13.4). Con origen interno no existe |
| Quién y cuándo lo creó | Los pone el sistema |

### 3.2 Crear, editar y anular

- **El permiso** [Claude, F15B-DC2]. Uno nuevo en la matriz, `mejora.planes`, para el Admin SGC y
  Control Interno (son quienes «crean y llenan» el plan, spec 15 §17.1), con su prueba por celda.
  Cubre: crear, editar y anular planes; poner, sacar y mover hallazgos; subir y quitar archivos del
  plan; y poner o cambiar el objetivo de un hallazgo (§10.4). La respuesta al ente sigue siendo del
  Admin SGC (`mejora.gestionar`, como en la 15A) y el Excel del ente, de quien ve todo.
- **Editar.** Todo menos el código y la vigencia. Cada edición deja su evento con el antes y el
  después. Editar un plan **no cambia ningún hallazgo**: lo que el plan propone se ofrece una vez,
  cuando el hallazgo entra (§3.4). El origen, la fuente y la fecha del ente, solo al registrar un
  hallazgo dentro del plan, porque después son parte de lo firmado; el objetivo, también a los que
  se añaden más tarde [Claude, F15B-DC4].
- **Anular.** Con motivo (al menos 10 caracteres) y solo si en ese momento no tiene ningún
  hallazgo: uno con hallazgos se vacía primero. Conserva su código y su historial; no recibe
  hallazgos, no se edita y no admite archivos; la lista lo muestra solo con su filtro. Un plan no
  se borra nunca [Claude, F15B-DC5].
- **No tiene recorrido ni firma.** Como dice el spec 15 (F15-DC32). Su «Aprobado por» es el de los
  planes de acción de sus hallazgos (§5.4).

### 3.3 La clasificación vive fuera del hallazgo ⚠

[Claude, F15B-DC3.] El spec 15 (§19.3) ponía el plan y el objetivo como columnas de
`mejora_hallazgos`. No puede ser: el trigger `sgc_impedir_si_hallazgo_terminado` rechaza todo
`UPDATE` de un hallazgo terminado, y el usuario decidió que un hallazgo cerrado entra, sale y cambia
de plan (B2.1). Tampoco se le abre una excepción al trigger: «un hallazgo terminado no cambia» se
queda sin excepciones.

Lo que debe cumplirse (los nombres y si es una tabla o dos son del constructor):

- El plan y el objetivo de un hallazgo se guardan **al lado**, en una tabla del módulo que no cuelga
  del trigger del hallazgo terminado. Ponerlos, cambiarlos o quitarlos no escribe en
  `mejora_hallazgos` ni en ninguna de sus hijas.
- **A lo sumo un plan por hallazgo**, garantizado por la base (una unicidad), no solo por el código.
- Llaves foráneas con `RESTRICT` hacia el hallazgo, el plan y el objetivo, cada una con su índice
  (lo exige `tests/mejora-esquema.test.ts`).
- **El historial del plan** es una tabla de **solo inserción** (trigger `sgc_impedir_modificacion` y
  `REVOKE` a `sgc_app`), con el plan, el hallazgo cuando el evento es de uno, el tipo, quién, cuándo
  y el detalle. Tampoco cuelga del trigger del hallazgo terminado: el movimiento de un hallazgo
  cerrado tiene que poder escribirse.
- **El rastro del objetivo** va a la bitácora (quién, cuándo, el antes y el después), no a
  `mejora_eventos`, que no admite filas de un hallazgo terminado.
- Ni el plan ni el objetivo entran a lo firmado: `huellaDePlan` no los incluye hoy y no debe
  incluirlos.

### 3.4 Entrar, salir y cambiar de plan

[Usuario, B2.1 y B2.4.] Lo hace quien tiene `mejora.planes`. El líder no elige plan.

**Tres caminos de entrada:**

1. **Al registrar.** «Registrar hallazgo en este plan», en la página del plan, lleva a
   `/mejoramiento/nuevo?plan=…`. El formulario llega con el origen del plan, su nombre como fuente,
   su fecha límite del ente y su objetivo, todos editables. El campo oculto lo vuelve a validar el
   registro dentro de su transacción (el plan existe, no está anulado y quien registra tiene
   `mejora.planes`); si no pasa, el hallazgo se registra sin plan y la página no dice por qué: es el
   patrón de `?revision=`. Vale igual para «Registrar un hallazgo ya en curso».
2. **«Añadir hallazgos»,** en la página del plan: un selector con los hallazgos que cuentan y no
   tienen plan (búsqueda por código o título; filtros por proceso, origen y año), varios a la vez,
   en una transacción y con un evento por hallazgo.
3. **Desde el hallazgo,** en su sección «Clasificación» (§10.4): «Poner en un plan», «Cambiar de
   plan» o «Sacar del plan».

**Reglas:**

- **En cualquier estado,** también cerrado. Uno anulado o rechazado no se añade; el que se anula o
  se rechaza estando en un plan se queda en él, marcado, y deja de contar [Claude, F15B-DC6].
- **El objetivo del plan se propone al que entra** (spec 15 §17.7): por los caminos 2 y 3, el
  hallazgo que no tiene objetivo recibe el del plan, salvo que quien lo añade lo desmarque; el que
  ya tiene uno lo conserva.
- **Sacar** pide motivo (al menos 10 caracteres). **Cambiar de plan** es salir de uno y entrar a
  otro en la misma transacción, con un motivo y un evento en cada plan.
- **Origen distinto.** El hallazgo conserva su origen y su fecha del ente; la fila lleva la marca
  «Origen distinto: …» [Maquetas]. Para cambiarlos está «Reclasificar», con sus reglas (spec 15
  §7.6).
- **No avisa a nadie:** es clasificación, no un turno [Claude, F15B-DC7].
- **Candados.** El plan se bloquea antes que la clasificación de sus hallazgos, y quien además
  escribe en un hallazgo (§3.8) toma el plan primero y los hallazgos después, por id. Anular un
  plan y añadirle un hallazgo a la vez no pueden cruzarse.

### 3.5 Estado, cifras y avance

Se calculan al leer; nada de esto se guarda, salvo «Anulado» [Claude, F15B-DC8].

- **Estado:** «Sin hallazgos» (no tiene ninguno que cuente); «Abierto» (alguno no ha terminado);
  «Cerrado» (todos terminaron); «Anulado».
- **Cifras** [Maquetas]: hallazgos (los que cuentan), abiertos, con algo vencido (la misma regla de
  la lista de hallazgos: una actividad vencida o el paso en curso vencido) y avance.
- **Avance del plan:** el promedio simple del avance de sus hallazgos que cuentan y tienen plan de
  acción aprobado en su ronda en curso (el avance de un hallazgo es el de la 15A, `avanceDeHallazgo`).
  Sin ninguno, «—».
- **Para quien no ve todo,** el estado, las cifras y el avance se calculan solo con los hallazgos
  que esa persona ve completos (§3.6).

### 3.6 Quién ve qué

[Usuario, 12.7.] Las reglas van en `src/lib/alcance.ts`, junto a las de los hallazgos (`filtroPlanes`
para un `WHERE` y `puedeVerPlan`; nombres provisionales).

| Quién | Qué ve |
|---|---|
| Quien ve todo | Todos los planes, también los vacíos y los anulados, completos: todos sus hallazgos, la respuesta al ente, los archivos, el historial entero y el Excel del ente |
| Quien ve **completo** al menos un hallazgo del plan (su líder, quien lo registró) | El plan con sus datos (código, nombre, origen, fechas, vigencia, objetivos), **solo esos hallazgos**, las cifras calculadas con ellos, las líneas del historial que son del plan o de esos hallazgos y el SGC-FO-14 de sus procesos. No ve el bloque de la respuesta al ente, los archivos del plan ni el Excel del ente. **Nada le dice que el plan tiene más hallazgos** |
| Quien ve un hallazgo solo por su actividad | No ve el plan. En el hallazgo lee el código y el nombre del plan, sin enlace [Claude, F15B-DC9] |
| Cualquier otro | Nada: «no encontrado» |

- La página del plan llama `exigirSesion()` y después su guarda (`exigirPlan`, en
  `app/(app)/mejoramiento/_comun.ts`), con la misma respuesta para un plan que no existe y para uno
  que la persona no ve.
- La pestaña «Planes» aparece para quien ve algún plan o tiene `mejora.planes`.
- La búsqueda global del cascarón encuentra planes por código y nombre, solo los que la persona ve.

### 3.7 Archivos del plan

[Usuario, B2.9; Claude, F15B-DC42.]

- **Un contexto de archivo nuevo,** el del plan (`mejora_plan`), que entra al `CHECK`
  `archivos_contexto_valido` (quince contextos) y a `CONTEXTOS_EVIDENCIA` (catorce). Admite los
  tipos de las demás evidencias del módulo.
- **Su ruta de subida** (`api/mejoramiento/planes/[id]/archivos`) va fuera del `matcher` de
  `src/proxy.ts`, con su caso en `tests/proxy-matcher.test.ts`, usa `recibirArchivo` y compara
  `content-length`, como las cuatro de la 15A.
- **Suben** quienes tienen `mejora.planes`. **Abren** quienes ven todo; los demás, 404. Se sirven
  siempre como descarga por la ruta de archivos del módulo, y `puedeAbrirArchivoDeMejora` gana el
  contexto.
- **Quitar:** quien lo subió o el Admin SGC, mientras el plan no esté anulado. El oficio de una
  respuesta registrada (§3.8) no se quita nunca: ya es evidencia.

### 3.8 La respuesta al ente, desde el plan ⚠

[Usuario, B2.7; spec 15 §13.4; decisión 29 de la 15A; Claude, F15B-DC41.] Hoy `registrarRespuestaAlEnte` responde un
hallazgo a la vez, con un oficio elegido entre los archivos de ese hallazgo.

- **«Espera respuesta»** es una sola definición, la del acto de la 15A: un hallazgo de origen
  externo, sin terminar, sin respuesta registrada y con el plan de acción de su ronda en vigor
  aprobado.
- **Un hallazgo que está en un plan se responde desde el plan,** no desde su página: la página del
  hallazgo lo dice y enlaza al plan a quien puede verlo. Uno sin plan sigue como en la 15A.
- **El bloque «Respuesta al ente»** de la página del plan [Maquetas] aparece cuando el plan tiene
  algún hallazgo de origen externo. Dice cuáles están **listos** (esperan respuesta) y a cuáles les
  falta aprobar su plan de acción, con el estado de cada uno, y lista las respuestas ya registradas.
- **El acto** (Admin SGC, `mejora.gestionar`): la fecha de envío y el oficio, que es un archivo del
  plan (subido en ese momento o elegido entre los suyos que no sean ya el oficio de otra respuesta).
  Vale para todos los listos; tiene que haber al menos uno. La fecha de envío no es futura ni
  anterior al día en que se aprobó el más reciente de los planes de acción incluidos.
- **Se confirma lo que se vio.** El formulario envía la lista de hallazgos que mostró como listos; si
  al guardar, con todo bloqueado, no es la misma, no se registra nada y la pantalla pide revisar.
- **En una transacción:** el registro de la respuesta (el plan, la fecha, el oficio, quién, cuándo y
  los hallazgos incluidos); en cada hallazgo, lo mismo que escribe el acto de la 15A (la fecha y
  quién, su evento `respuesta_ente` y su fila de bitácora, ahora con el plan); y el evento del plan.
- **Los que faltan** se responden con otro registro cuando estén listos: un plan puede tener varias
  respuestas.
- **La tarea** es una por plan: «Registrar la respuesta al ente del plan PM-…», de quien tiene
  `mejora.gestionar`, mientras el plan tenga algún hallazgo listo con fecha límite del ente; vence
  en la más próxima de esas fechas. Los hallazgos que están en un plan dejan de dar la tarea propia
  de la 15A (`mej-ente`). Como en la 15A, la respuesta no tiene avisos de vencimiento propios: la
  tarea se ve vencida en «Mis tareas».
- **Si el hallazgo sale del plan** después, conserva su respuesta: es un dato del hallazgo. El
  registro del plan conserva que lo incluyó.
- **El oficio es un archivo del plan:** lo abren quienes ven todo (§3.7). El líder de un hallazgo
  respondido desde el plan ve en su hallazgo la fecha de la respuesta y quién la registró, no el
  oficio, que es un solo documento para todos los procesos del plan. (En un hallazgo suelto el
  oficio sigue siendo un archivo del hallazgo, como en la 15A.)

### 3.9 Pantallas y rutas

[Maquetas 1 y 2.]

| Ruta (provisional) | Qué es | Quién |
|---|---|---|
| `/mejoramiento/planes` | La pestaña «Planes»: código, plan, origen, vigencia, hallazgos, avance, fecha del ente y estado; búsqueda y filtros por vigencia, origen y «solo abiertos». Los anulados, con su filtro | Quien ve algún plan o tiene `mejora.planes` |
| `/mejoramiento/planes/nuevo` y `…/[id]/editar` | El formulario del plan | `mejora.planes` |
| `/mejoramiento/planes/[id]` | La página del plan: el encabezado con sus botones; las cifras; los hallazgos agrupados por proceso, cada grupo con su «SGC-FO-14 de este proceso»; los datos; la respuesta al ente; los archivos; y el historial | Quien ve el plan (§3.6), cada uno con lo suyo |

A 390 px la lista y los hallazgos del plan son tarjetas, como la lista de hallazgos.

### 3.10 Bitácora y avisos

- Toda escritura del plan pasa por `mutacion()` o `requerirPermiso()` y deja su fila en la bitácora,
  con su frase en `src/lib/bitacora-detalle.ts`. El nombre del plan va a la bitácora (es su nombre,
  como el título de un hallazgo); los motivos y el texto del objetivo del plan, no: quedan en el
  historial del plan (la misma regla de la decisión 42 de la 15A).
- Crear, editar, anular y mover hallazgos **no avisan a nadie.**

## 4. El Excel para el ente

[Usuario, B1; Maquetas 3; Claude, F15B-DC45.] Sale de la página del plan («Excel para el ente»). Lo exporta quien ve
todo. Una hoja, una tabla plana (una fila de títulos y los datos, para que el ente pueda copiarla a
su propio formato), con `exceljs`, `neutralizarFormula()` en cada celda de texto y su fila de
bitácora.

### 4.1 Las trece columnas

| # | Columna | De dónde sale |
|---|---|---|
| 1 | Auditoría o evento | El nombre del plan |
| 2 | Vigencia | La vigencia del plan |
| 3 | Hallazgo | El título y la descripción del hallazgo, como en el Excel de la lista |
| 4 | Acción de mejora | La acción y su actividad |
| 5 | Plazo | Calculado entre el inicio y la terminación (§4.3) |
| 6 | Fecha de inicio | El inicio de la actividad, `AAAA/MM/DD` |
| 7 | Fecha de terminación | El fin vigente de la actividad, `AAAA/MM/DD` |
| 8 | Avance (%) | El avance de la actividad, de 0 a 100 |
| 9 | Observaciones | Lo que dice el último seguimiento de la actividad («qué se hizo»); vacío si no tiene |
| 10 | Responsable | El cargo del responsable de la actividad; si no tiene cargo, su nombre |
| 11 | Código | El del hallazgo (`HZ-…`) |
| 12 | Causa raíz | Las causas que la acción ataca, como en el Excel de la lista |
| 13 | Estado | El de la actividad: abierta, en proceso, terminada o cancelada, o «Vencida» si lo está (spec 15 §10.2) |

### 4.2 Las filas

- **Los hallazgos del plan que cuentan,** por código.
- **Una fila por actividad** de un plan de acción aprobado, de todas las rondas, en el orden del
  plan de acción (ronda, acción, actividad); las canceladas salen, con su estado [Claude,
  F15B-DC10]. El hallazgo, su código y la causa se repiten en cada fila.
- **Por cada hallazgo sin plan de acción aprobado,** y por cada ronda nueva que todavía no lo tiene,
  una fila con las columnas 1 a 3 y la 11, y en «Observaciones» en qué va («Plan de acción en
  revisión», «Cerrado con corrección el …»), igual que en el SGC-FO-14 (§5.3) [Maquetas].

### 4.3 El plazo

[Usuario, B1.5; Claude, F15B-DC11.] El usuario decidió que lo calcula el sistema. La regla:

- Si del inicio al día siguiente de la terminación hay un número exacto de meses calendario,
  «N meses» («1 mes»): del 1 de agosto al 31 de octubre son «3 meses»; del 15 de octubre al 14 de
  noviembre, «1 mes».
- Si no, los días calendario contando los dos extremos, «N días»: del 2 de noviembre al 31 de
  diciembre son «60 días».

(La maqueta 3 mostraba «2 meses» en ese último caso; con datos reales dirá «60 días».)

## 5. El SGC-FO-14

[Usuario, 2.1, 8.6, 8.7 y B3; Documento del hospital, SGC-FO-14; Maquetas 4.] Un impreso por hoja de
estilos de impresión, en **horizontal**, como los de la 15A (F15-DC31).

### 5.1 Las dos formas

| Forma | Desde dónde | Qué hallazgos trae |
|---|---|---|
| **De un plan, por proceso** | «SGC-FO-14 de este proceso», en cada grupo de la página del plan | Los del plan que cuentan y son de ese proceso |
| **Consolidado** de un proceso en un año | La lista de hallazgos, cuando está filtrada por un proceso, y la sección «Mejoramiento» de la página de ese proceso (§10.1); el año se elige [Claude, F15B-DC43] | Los del proceso que cuentan y **estuvieron abiertos en algún momento de ese año**: registrados ese año o antes, y sin terminar o terminados ese año o después (los años, en la zona de la instalación). En un hallazgo cargado, la fecha de registro es la del registro en papel que se declaró al cargarlo [Usuario, B3.1] |

### 5.2 El encabezado

El nombre de la entidad (`obtenerMarca`) y, del formato, su código, su versión y su fecha de emisión
vigentes, tomados del documento que el Admin SGC elija para este impreso en la configuración del
módulo (una clave nueva, con el mecanismo de `encabezadoDeFormato`). Si no eligió ninguno, sale sin
esos tres datos.

| Campo del formato | De un plan | Consolidado [Usuario, B3.4] |
|---|---|---|
| Origen del plan | El origen del plan | «Consolidado del proceso» |
| Código del plan | `PM-…` | «Consolidado del proceso» |
| Macroproceso y proceso | Los del proceso del impreso | Igual |
| Responsable y cargo | Los líderes activos del proceso; si no tiene, lo dice | Igual |
| Periodo / vigencia | La vigencia del plan | El año elegido |
| Fecha de elaboración | La fecha en que se creó el plan | La del día en que se imprime |
| Fuente del hallazgo | Los catorce orígenes, marcados los que tienen sus filas | Igual |
| Objetivo del plan | El texto del plan y, si lo tiene, su objetivo del maestro | En blanco |

### 5.3 Las filas

Las columnas del formato (spec 15, Apéndice A.6), más dos que el formato no tiene [Maquetas]:
**«Plan»** (solo en el consolidado: el código del plan del hallazgo, o «Sin plan») y **«Estado»**
(las instrucciones del formato la piden y su tabla no la trae).

| Columna | De dónde sale |
|---|---|
| N° | El orden |
| Plan | Solo en el consolidado |
| Hallazgo / oportunidad de mejora | El código, el título y la clase; la ronda, cuando hay más de una |
| Causa raíz | Las causas que la acción ataca, y el método |
| Acción de mejora | La acción y su actividad |
| Tipo | AC, AP o AM (correctiva, preventiva, de mejora) |
| Responsable | El de la actividad, con su cargo |
| Recursos | Los de la acción |
| Fecha de inicio y fecha fin | Las de la actividad; el fin es el vigente, con la marca «Reprogramada» si la tiene |
| Indicador de cumplimiento y meta | Los de la acción |
| Seguimiento: fecha, % de avance, observaciones o evidencia | El **último** seguimiento de la actividad y cuántos archivos tiene. El historial completo ya sale en el SGC-FO-AC-01 [Claude, F15B-DC12] |
| Estado | El de la actividad, como en §4.1 |

- **Una fila por actividad** de un plan de acción aprobado, de todas las rondas.
- **El hallazgo sin plan de acción aprobado sale** [Usuario, B3.7] con una fila que trae el hallazgo
  y, a lo ancho, en qué va: la etiqueta de su estado («Por formular: plan de acción en
  formulación», «En revisión»…) o, si cerró por el camino corto, «Cerrado con corrección el …», con
  la descripción de la corrección, o «Cerrado sin acción el …». Lo mismo por cada ronda nueva que
  todavía no tiene plan aprobado.
- Los anulados y los rechazados no salen.

### 5.4 «Aprobación y control»

El plan no tiene firma propia (F15-DC32). El bloque lleva **una línea por hallazgo** con plan de
acción aprobado: quién lo elaboró (la firma «Elaboró» de la ronda en vigor) y quién lo aprobó
(«Aprobó», o «Revisó» cuando la revisión valió como aprobación), con cargo y fecha. En un hallazgo
cargado dice «Aprobado fuera de la plataforma», con el rol que se declaró al cargarlo. Al pie, las
convenciones de tipo, y quién lo imprimió y cuándo [Claude, F15B-DC13].

### 5.5 Quién lo imprime

[Claude, F15B-DC44.] Quien ve completos todos los hallazgos de ese impreso: quien ve todo, de cualquier proceso; un
líder, el de sus procesos. A los demás, «no encontrado». Un líder que imprime el SGC-FO-14 de un
plan ve solo su proceso, que es lo que el plan le muestra.

## 6. La marca «Requiere acción de mejora» de un indicador

[Usuario, 13.1, B4.2 y B4.4; spec 15 §17.3; Maquetas 5.] Hoy la marca (`mediciones.requiere_accion`)
la pone `recalcularMedicion` en cuanto la medición tiene resultado: cuando queda en Crítico o
cuando repite el incumplimiento. El análisis del líder llega después.

### 6.1 Qué es un pendiente ⚠

Una medición es un **pendiente** cuando se cumple todo esto [Usuario, B4.2; Claude, F15B-DC14]:

- es ordinaria (no histórica), de un indicador activo, y lleva la marca;
- no tiene una salida **en vigor**;
- y **ya se puede decidir**: la medición ya no pide análisis (lo tiene completo, o su ficha no lo
  exige: la misma regla con que hoy se decide si le falta el análisis), **o** su fecha límite ya
  pasó, **o** quedó cerrada en el cierre del mes.

Se calcula al leer; no se guarda. Además:

- **El valor que se reporta tarde** [Usuario, C3.1]. El indicador tiene una sola fecha límite, para
  reportar y para analizar. Si el valor llega después de ella, la marca es un pendiente desde ese
  momento, sin análisis: el panel lo dice, y el líder lo puede escribir todavía. No hay un plazo
  aparte.
- **Si un recálculo le quita la marca,** deja de ser un pendiente. Una salida ya registrada queda
  como historia y el hallazgo que nació sigue su curso (spec 15 §17.3).
- **Una medición tiene a lo sumo una salida en vigor** [Usuario, C1.1; Claude, F15B-DC15]. Está en
  vigor un «no requiere», y la que apunta a un hallazgo (nuevo, o el de la ocurrencia) **mientras
  ese hallazgo cuente**. Si ese hallazgo termina rechazado o anulado, la salida deja de estar en
  vigor y la marca vuelve a ser un pendiente: el Crítico no se queda sin acción y sin que nadie
  haya dicho «no requiere». La salida anterior queda como historia.
- Si la marca vuelve a una medición cuya salida sigue en vigor (una corrección, y otra después), no
  vuelve a ser un pendiente.
- **Sin fecha de corte.** Las mediciones que ya llevan la marca el día en que se instala la entrega
  son pendientes si cumplen lo de arriba [Claude, F15B-DC16].

### 6.2 Las tres salidas

| Salida | Quién | Qué pasa |
|---|---|---|
| **Hallazgo nuevo** | El Admin SGC; un líder del proceso del indicador | Lleva a `/mejoramiento/nuevo?medicion=…` (§10.3). El formulario llega con el origen «Indicador», el proceso y el subproceso del indicador, el indicador y la medición en «A qué se refiere», un título propuesto (el nombre del indicador y el periodo) y una descripción propuesta: la frase del resultado (el valor, la meta, el color y, si es el caso, que repite el incumplimiento). La clase y la criticidad las elige quien lo abre. El hallazgo que abre el líder nace aceptado, como siempre (spec 15 §7.4). La salida se escribe en la misma transacción en que nace el hallazgo |
| **Ocurrencia de uno abierto** | Los mismos | Se elige entre los hallazgos sin terminar que **citan el indicador** (§10.1), que la persona ve y a los que puede añadir ocurrencias (spec 15 §7.5). La ocurrencia nace con la fecha del último día del periodo, la frase del resultado como descripción y la medición como su origen. Avisa como toda ocurrencia: a los líderes y al Admin SGC y, si el hallazgo está en espera de eficacia, a quienes pueden verificarlo, como posible recurrencia [Claude, F15B-DC20] |
| **«No requiere»** | Solo el Admin SGC (`mejora.gestionar`) | Con justificación (al menos 10 caracteres). Es definitiva: si después se ve que sí hacía falta, se registra un hallazgo a mano que cite la medición |

[Usuario, B4.4.] Si hay algún hallazgo que sirva para la segunda salida, la pantalla la propone
primero, con ese hallazgo (el más reciente, si hay varios, y los demás para elegir). No la aplica
sola: decide la persona.

### 6.3 El hallazgo que se registra por fuera del panel

[Claude, F15B-DC17.] El panel no es la única puerta: con §10.3, quien registra un hallazgo puede
citar una medición.

- **Si la medición lleva la marca, no tiene salida y quien registra es de quienes pueden
  resolverla** (el Admin SGC, o un líder del proceso del indicador: los mismos de §6.2), el registro
  escribe la salida «hallazgo» en su misma transacción, sea ya un pendiente o espere todavía su
  análisis. Vale también cuando el Admin SGC convierte un reporte que la cita. Así quien puede
  decidir no abre un hallazgo y se queda, además, con la tarea de decidir.
- **Si registra otra persona** (Control Interno, o un líder de otro proceso), el hallazgo nace sin
  tocar el pendiente. Sigue siendo de quien debe decidir, y la pantalla se lo propone como
  ocurrencia de ese hallazgo (§6.2). Quién resuelve una marca no cambia respecto del spec 15.
- **La salida se escribe solo al nacer el hallazgo.** Editar uno «Por aceptar» no escribe ni quita
  salidas. La migración no rellena nada: un hallazgo de la 15A que ya cita una medición marcada no
  la resuelve. Y si la marca llega después de que un hallazgo ya cita la medición, nace el pendiente.
  En los tres casos, a quien decide la pantalla le propone ese hallazgo para la ocurrencia.

Cuando el formulario llega desde el panel y, al guardar, la medición ya tiene una salida en vigor (otra persona
decidió entre tanto), el registro se rechaza con su mensaje: abrir un segundo hallazgo sería
duplicar. Un registro a mano que cita una medición con una salida en vigor es un hallazgo más, sin
rechazo.

### 6.4 Dónde se guarda

[Spec 15 §17.3 y §19.4; F15-DC33.] En una tabla propia de **solo inserción** (`mejora_marcas`), una
fila por decisión: la medición, el indicador, la salida, el hallazgo (en las dos primeras), la
justificación (en la tercera), quién y cuándo. Lleva el trigger `sgc_impedir_modificacion` y el
`REVOKE` a `sgc_app`, y entra a `asegurarRolApp`, a `tests/privilegios-bd.test.ts` y a las listas
de `AGENTS.md`.

Una medición puede tener varias filas (la del hallazgo que se rechazó y la decisión que vino
después), pero **una sola en vigor**. Como «en vigor» depende del estado de otro registro, una
unicidad de la base no alcanza: lo garantiza el registro de la salida, que serializa las decisiones
de una misma medición dentro de su transacción y vuelve a comprobar antes de escribir. Su prueba va
en serie y comprueba que el candado se toma antes que nada: una medición marcada exige una ficha
aprobada, que ninguna prueba puede dejar confirmada.

Las guardas de borrado la conocen antes de que la llave foránea dé un error crudo: una medición con
salida cuenta como «con datos» (`conDatos`), y `citadoEnMejoramiento` (que usan `borrarIndicador` y
`condicionDeDeshacer`) la suma.

La justificación de un «no requiere» va en esa fila y se ve en la página del indicador; a la
bitácora va el acto, sin el texto.

### 6.5 La tarea y la pantalla

[Maquetas 5; Claude, F15B-DC18 y DC19.]

- **La tarea.** «Decidir la acción de mejora de {código} {nombre}, {periodo}», una por pendiente,
  de quien tiene `mejora.gestionar`, sin fecha límite. Lleva a la página del indicador. Se cuenta en
  SQL: no puede encarecer el cascarón (§11.3).
- **Sin aviso nuevo.** El Crítico ya avisó por las alertas del indicador.
- **El panel,** en la página del indicador, con el patrón de las revisiones por cambio de norma
  (`AvisoDeImpacto`: una sección bajo las pestañas, en todas las vistas). Un bloque por pendiente:
  el periodo, el resultado, la causa y la acción propuesta del análisis, y las salidas. Lo ven el
  Admin SGC (las tres salidas) y los líderes del proceso del indicador (las dos primeras). Nadie
  más.
- **«Todavía no es un pendiente».** A esas mismas personas, la medición marcada que espera su
  análisis les dice cuándo se pedirá la decisión: cuando tenga su análisis, o en su fecha límite.
- **Ya decidida.** Junto a la medición: «Hallazgo HZ-…» u «Ocurrencia de HZ-…», con su enlace,
  **solo a quien puede ver ese hallazgo**; los demás siguen viendo la marca como hoy, sin nada que
  diga que hay un hallazgo. «No requiere acción de mejora», con su justificación, quién y cuándo, lo
  ve quien ve el indicador.
- El Excel, el impreso, la matriz y la lista de indicadores no cambian.

### 6.6 En el hallazgo

- «A qué se refiere» muestra la medición con su estado de hoy (spec 15 §17.3).
- **Al formular** (spec 15 §9.4), el formulario del análisis muestra en solo lectura la causa y la
  acción propuesta que escribió quien analizó la medición enlazada, como punto de partida, a quien
  puede ver el indicador. Vale para todo hallazgo que cite una medición, no solo para el que nació
  del panel.
- **Indicador restringido:** su nombre y su enlace, solo a quien puede verlo. El formulario de
  registro advierte entonces que la descripción la leerán los responsables de las actividades.

## 7. El hallazgo de verificación de un punto de uso

[Usuario, 13.3, 13.5 y B5.1; spec 15 §17.4; Maquetas 6.]

### 7.1 Dónde va el botón ⚠

[Claude, F15B-DC21 y DC24.] El spec 15 habla de «la página del hallazgo de verificación» y de «la
del punto». **La primera no existe:** un hallazgo de verificación se atiende en la verificación que
lo abrió o en la copia (`enlaceDeHallazgo`) y se lista en `/distribucion/verificaciones`
(`TablaHallazgos`, que se filtra por punto). La del punto es la de su catálogo, que no muestra
hallazgos. No se crea una página nueva ni se toca el catálogo.

- **«Abrir no conformidad»** y la sugerencia van en la fila del hallazgo, en las tres vistas donde
  Distribución lo muestra: la lista de hallazgos, la verificación cerrada y la página de la copia.
- **Quién:** el Admin SGC (`mejora.gestionar`), si ve ese hallazgo de verificación.
- **Cuándo:** en cualquier estado del hallazgo de verificación (abierto, por validar o cerrado).
- **A lo sumo una que cuente** [Usuario, C1.1]: si la no conformidad que nació termina rechazada o
  anulada, se puede abrir otra. Lo garantiza la base, con una unicidad entre los hallazgos que
  cuentan.
- **Después,** la fila dice «No conformidad HZ-…» y en qué va, con enlace a quien puede verla. Los
  dos ciclos son independientes: cerrar uno no cierra el otro.

### 7.2 Cómo nace la no conformidad

[Usuario, B5.1; Claude, F15B-DC22.] Lleva a `/mejoramiento/nuevo?verificacion=…` (§10.3):

| Campo | Cómo llega |
|---|---|
| Clase | No conformidad, fija |
| Origen | «Control documental», fijo |
| Fuente | «Verificación del punto {punto}», editable |
| Documento | El del hallazgo de verificación, si lo tiene, en «A qué se refiere» |
| Descripción y fecha en que se detectó | Las del hallazgo de verificación; la descripción, editable |
| Proceso | Se elige entre los procesos del punto; si el punto no tiene ninguno, entre todos |
| Criticidad | Se elige |
| **Justificación de la acción correctiva** | Obligatoria (al menos 10 caracteres): por qué esta falla necesita tratar su causa |

- **Nace por `nacerHallazgo`,** con la regla de siempre: «Por aceptar» o, si el proceso no tiene
  líder activo, aceptada. El líder puede rechazarla, con su arbitraje (spec 15 §8.3).
- **Aceptada, va a «Por formular»,** sin pasar por «Por corregir» ni por «Por decidir». Hoy
  `aceptadoVaA` mira solo la clase; gana este caso.
- **La acción correctiva queda requerida desde que nace:** la fila guarda la decisión, la
  justificación y quién la tomó (quien abre la no conformidad), con las columnas que ya existen.
- **La sección «Corrección»** de la página y del SGC-FO-AC-01 no tiene corrección propia: muestra
  la del hallazgo de verificación (en qué va, qué se corrigió, quién y cuándo), con su enlace, a
  quien puede ver ese hallazgo de verificación; a los demás, «La corrección está en un hallazgo de
  verificación de Distribución».
- **En lo firmado** [Claude, F15B-DC46]. El plan de acción congelado al enviarlo dice que la
  corrección es la del hallazgo de verificación, por su identificador, sin copiar su contenido: esa
  corrección puede llegar después de la firma. Los enlaces de origen nuevos (el hallazgo de
  verificación y los dos impactos de §8) entran a la identificación firmada **solo cuando el
  hallazgo los tiene**: uno sin ellos firma exactamente lo de hoy, y ninguna huella ya guardada
  cambia.

### 7.3 Quien corrigió no verifica

[Claude, F15B-DC23.] La lista cerrada de quién «ejecutó» (spec 15 §11.1, `ejecutaronEn`) gana tres
casos, todos del hallazgo de verificación enlazado:

- quien lo corrigió, según su fila (`corregido_por`);
- quien responde por él, según su fila (`responsable_id`; no el responsable de hoy del punto, si
  cambió y no ha hecho nada);
- quien lo corrigió antes de una reapertura: reabrir borra `corregido_por`, así que se lee de la
  bitácora, como la 15A cuenta la corrección que se devolvió.

Se lee en cada acto: quien lo corrija después de abierta la no conformidad tampoco la verifica.

### 7.4 La sugerencia

[Spec 15 §17.4; F15-DC34.] Al Admin SGC, en la fila de un hallazgo de verificación que todavía no
tiene no conformidad, cuando el hallazgo **se reabrió alguna vez** o cuando su punto **acumula tres
hallazgos en doce meses**. Los dos números se configuran en «Configuración de mejoramiento». La
lista de hallazgos filtrada por un punto lo dice además arriba. Es un aviso en pantalla: no es una
tarea ni manda nada a la campana.

En la 13B no cambia ningún texto ni ninguna regla. Fuera de Distribución se le llama «hallazgo de
verificación».

## 8. El impacto de norma

[Usuario, 13.7 y B5.4; spec 15 §17.6; Maquetas 6; Claude, F15B-DC25.]

- **Sobre un documento o un proceso** (`impactos_normativos`): «Abrir hallazgo» junto a cada
  impacto, en la página del cambio de norma (`/normograma/impactos/[cambioId]`). Lleva a
  `/mejoramiento/nuevo?impacto=…`.
- **Sobre un indicador** (`impactos_indicadores`) ⚠: el botón va en la página del indicador, junto
  a la revisión (`AvisoDeImpacto`), que es donde se resuelve. Lleva a
  `/mejoramiento/nuevo?impactoIndicador=…`. Ese panel muestra solo las revisiones pendientes: el
  hallazgo de la revisión de un indicador se abre **mientras está pendiente**.
- **Quién:** el Admin SGC y los líderes del proceso del impacto (en el de un indicador, el proceso
  del indicador). Control Interno puede registrar el hallazgo a mano, sin el enlace.
- **Cómo llega:** el origen «Control documental» y la norma como requisito incumplido, fijos; el
  proceso del impacto, fijo; el documento o el indicador en «A qué se refiere»; la fuente («Cambio
  de {norma}»), editable; la clase la elige la persona. Sigue el camino normal.
- **A lo sumo un hallazgo que cuente por impacto** [Usuario, C1.1], con una unicidad en la base
  entre los hallazgos que cuentan: si el que nació termina rechazado o anulado, se puede abrir otro.
  El de un documento o un proceso se abre en cualquier estado del impacto. El impacto se sigue resolviendo por sus propias
  reglas. Quedan enlazados en los dos sentidos, cada lado con su regla de visibilidad.
- **La sugerencia** [Usuario, B5.4]: «Este impacto está vencido y ya se escaló. Puede abrir un
  hallazgo.», a quien puede abrirlo, cuando el impacto está pendiente, su plazo pasó, ya se avisó
  al jefe (`escalado_en`) y no tiene hallazgo. Sin números que configurar, sin tarea y sin aviso.
- **La revisión anual** no lleva botón en esta entrega: lo que salga de ella se registra a mano,
  con origen «Control documental» [Claude, F15B-DC26].

## 9. El cambio documental desde una actividad

[Usuario, 13.9, 13.10, B6.1 y B6.4; spec 15 §17.5; Documento del hospital, SGC-PR-03 actividad 6 y
PC-06; Maquetas 7.]

### 9.1 El enlace ⚠

[Claude, F15B-DC29.] El spec 15 (§19.3) ponía en `tramites` la actividad de la que nace. Con varios
trámites por actividad y con trámites que se enlazan después, el enlace va en una tabla del módulo:
la actividad, su hallazgo, el trámite, cómo llegó («pedido» desde la actividad o «enlazado»
después), quién, cuándo y la marca de su aviso (§9.5).

- **Una actividad, varios trámites** (un procedimiento y sus dos formatos). **Un trámite, a lo sumo
  una actividad** (una unicidad).
- Cuelga del trigger del hallazgo terminado, como toda hija: a un hallazgo terminado no se le
  enlaza nada.
- La tabla `tramites` no cambia.

### 9.2 Pedir el cambio

[Usuario, B6.1; Claude, F15B-DC27.] «Pedir cambio documental», en la página de la actividad, para
quien cumple las tres cosas: **ve la actividad**; **tiene `tramites.solicitar`** (hoy, el Admin SGC
y los líderes); y la actividad es de un plan de acción aprobado, no está terminada ni cancelada, su
hallazgo no ha terminado y, si es una carga, ya tiene su formato firmado.

- Lleva a `/tramites/nueva?actividad=…`, con: el documento que el hallazgo cita, si cita alguno (y
  entonces el tipo «modificar»); el motivo, que ya existe en la lista de motivos de un trámite («No
  conformidad» si el hallazgo lo es, «Mejora» si no); y como justificación, la descripción de la
  actividad, editable.
- El formulario advierte: «Lo que escriba aquí lo leerán quienes participan en el trámite». El texto
  del hallazgo no se copia.
- La página ignora, sin decir por qué, una actividad que la persona no ve o que no admite el pedido.
- El campo oculto lo vuelve a validar `crearSolicitud` dentro de su transacción, **antes de insertar
  nada**. Si la actividad ya no vale (se terminó entre tanto, o el dato llegó forzado), **rechaza la
  solicitud entera** con un solo mensaje, el mismo para cualquier causa, y no escribe nada. Si vale,
  escribe el trámite y el enlace juntos. Así el trigger del hallazgo terminado nunca salta dentro de
  la transacción de un trámite.
- **Las reglas del trámite no cambian:** un líder solo solicita sobre los procesos que lidera. Sirven
  los tres tipos de trámite (crear, modificar y eliminar).
- **Al responsable que no puede solicitar** la página le dice: «Pídale al líder del proceso o al
  Administrador del SGC que lo solicite desde aquí».

### 9.3 Enlazar un trámite que ya existe

[Usuario, B6.4; Claude, F15B-DC32.] Para las mismas personas y con la actividad en el mismo estado.
El selector ofrece los trámites que la persona ve (`puedeVerTramite`), que no están enlazados a
ninguna actividad, que no terminaron mal (ni «rechazado» ni «cancelado») y que se solicitaron desde
el día en que se detectó el hallazgo.

Un enlace puesto así lo quita quien lo puso o el Admin SGC, mientras la actividad no esté terminada,
y deja su evento. El enlace de un trámite pedido desde la actividad no se quita.

### 9.4 Lo que vale como evidencia

[Spec 15 §10.4; F15-DC19; Claude, F15B-DC28.] Para terminar una actividad vale, además de un
archivo, **un trámite enlazado que terminó bien** (quedó «publicado» o «eliminado»). Basta uno, como
basta un archivo. En una actividad que la verificación devolvió vale lo posterior a la devolución
(decisión 22 de la 15A): un archivo, o un trámite que terminó bien después de ella.

Un trámite que termina mal queda enlazado, como historia, y no vale. Quien verifica ve todos los
trámites de la actividad, con el estado de cada uno. La publicación no termina la actividad: la
termina su responsable.

### 9.5 Cuando el trámite termina ⚠

[Claude, F15B-DC30.] El spec 15 dice que «cuando el trámite publica, el sistema lo anota en la
actividad». **El motor del trámite no llama a Mejoramiento:** ni publicar ni cancelar un trámite
escriben nada de este módulo, y una falla de aquí no puede tumbar una publicación.

- El estado del trámite **se lee** cada vez que se pinta la actividad o el hallazgo, o cuando se
  comprueba la evidencia o el cierre.
- **El aviso sale en la pasada** de vencimientos de mejoramiento, que gana un paso: por cada enlace
  **de un hallazgo sin terminar** cuyo trámite llegó a un estado final y todavía no se avisó, avisa
  al responsable de la actividad (que ya puede terminarla, o que el trámite terminó sin publicarse),
  deja el evento en el hallazgo y marca el enlace para no repetir. Vale lo de siempre: nada llega a
  un responsable de un plan sin aprobar o de una carga sin su formato.
- **De un hallazgo ya terminado el paso no hace nada:** ni avisa ni marca. El enlace, como toda
  hija, ya no cambia, y el estado del trámite se sigue leyendo.

### 9.6 Lo que comprueba el cierre

[Usuario, 13.9 y 13.10; spec 15 §17.5; Claude, F15B-DC31.] Al firmar «Cerró» (también cuando se
evalúa «eficaz» y se cierra en el mismo acto), con la segunda pregunta del análisis de **la ronda
que se cierra** (`mejora_rondas.cambios`):

| Lo que el análisis marcó | Lo que el cierre exige |
|---|---|
| Documentos, y la ronda tiene algún trámite enlazado que terminó bien | Nada más: la pantalla los lista y el evento del cierre los guarda |
| Documentos, y no tiene ninguno | La justificación |
| Matriz de riesgos o controles | Decir cómo se atendió, como hoy |
| Nada | Nada |

«Cómo se atendieron los cambios» deja de ser obligatorio en un solo caso: cuando lo único marcado es
«documentos» y hay un trámite que terminó bien. La huella de «Cerró» no cambia de forma.

### 9.7 Lo que se ve

Cada enlace se muestra con la regla de lo enlazado: el trámite, a quien puede verlo; la actividad y
el hallazgo, a quien puede verlos. La página del trámite dice «Atiende una actividad de
mejoramiento», con su enlace, solo a quien ve esa actividad.

## 10. Documento, proceso, indicador, norma y objetivos

[Usuario, 13.6, 13.11, B7.1 y B7.2; spec 15 §17.6 y §17.7; Maquetas 8.]

### 10.1 La sección «Mejoramiento»

En cuatro páginas, con los hallazgos que **citan** lo que la página muestra [Claude, F15B-DC33]:

| Página | Qué hallazgos la citan | Botón |
|---|---|---|
| Un documento | Los que se refieren a él y los que lo nombran como requisito incumplido | Sí |
| Un proceso (o un subproceso) | Los de ese proceso (o subproceso) | Sí; y el SGC-FO-14 consolidado, para quien puede imprimirlo (§5.5) |
| Un indicador | Los que se refieren a él o a una de sus mediciones, y los que lo usan como criterio de eficacia | Sí |
| Una norma | Los que la citan como requisito incumplido | No [Usuario, B7.2] |

- La lista trae **solo los que la persona ve** (`filtroHallazgos`), los abiertos primero, hasta
  diez, con «Ver todos» hacia la lista de Mejoramiento ya filtrada.
- **A quien no ve ninguno, la lista no le aparece:** ni vacía ni con un cero.

### 10.2 Los botones

[Usuario, 13.6.] **«Abrir hallazgo»** para quien puede registrar hallazgos del proceso propuesto (el
del documento o el del indicador): el Admin SGC, Control Interno y los líderes de ese proceso.
**«Reportar»** para los demás. Los dos llegan con el enlace puesto y el proceso propuesto; el origen
lo elige la persona.

[Claude, F15B-DC36.] Para que «Reportar» sirva, el reporte guarda el enlace: `mejora_reportes` gana
el documento y el indicador, opcionales. Se guardan solo si quien reporta puede verlos. «Reportes
recibidos» los muestra, y al convertir el reporte llegan al formulario de registro.

### 10.3 Lo que gana el formulario de registro

[Claude, F15B-DC34.] Hoy el formulario de registro no deja elegir «A qué se refiere»: el esquema
admite el documento, el indicador y la medición, pero ni un campo ni una dirección los pone (el
formulario de la carga sí ofrece el indicador y la medición). La 15B los vuelve campos del
formulario (un documento, un indicador y, con él, una de sus mediciones con
resultado), y añade estos parámetros a los que ya existen (`derivado`, `reporte` y `modo`):

| Parámetro | De dónde viene | Qué pone | Qué queda fijo |
|---|---|---|---|
| `plan` | La página del plan (§3.4) | El plan; y propone origen, fuente, fecha del ente y objetivo | Nada |
| `medicion` | El panel de la marca (§6.2) | Origen, proceso, indicador, medición, título y descripción | El indicador y la medición |
| `verificacion` | Un hallazgo de verificación (§7.2) | Clase, origen, fuente, documento, descripción y fecha | La clase y el origen |
| `impacto` e `impactoIndicador` | Un impacto de norma (§8) | Origen, norma, proceso, y el documento o el indicador | El origen, la norma y el proceso |
| `documento`, `indicador`, `proceso` | La sección «Mejoramiento» (§10.1) | El enlace y el proceso propuesto | Nada |

- **La página ignora, sin decir por qué,** lo que la persona no puede ver o no puede usar (un
  documento restringido, un plan sin permiso, un impacto de otro proceso): el patrón de `?revision=`.
- **El registro vuelve a validar** cada campo oculto dentro de su transacción, con la regla de
  alcance del módulo de cada cosa, y ahí escribe lo que corresponde (el plan, la salida de la marca,
  el enlace con el hallazgo de verificación o con el impacto).
- Lo que queda fijo no se puede cambiar en el formulario ni forzar en el envío.

### 10.4 El objetivo y la sección «Clasificación»

[Usuario, 13.11; Claude, F15B-DC35.] Un hallazgo puede apuntar a **un** objetivo del maestro
`objetivos` (de calidad o institucional).

- **Al registrar** lo elige quien registra, si quiere; dentro de un plan, llega propuesto el del
  plan.
- **Después** lo ponen, lo cambian o lo quitan quienes tienen `mejora.planes`, en cualquier estado,
  también cerrado: es clasificación, como el plan (§3.3), y su rastro va a la bitácora.
- Un objetivo que se desactiva se conserva en lo que ya lo tiene y no se puede elegir de nuevo.
  Borrarlo del maestro se rechaza, con su mensaje, si un plan o un hallazgo lo tienen.
- **La página del hallazgo gana la sección «Clasificación»:** su plan y su objetivo, con los botones
  de §3.4 para quien puede.

### 10.5 «Objetivos»

[Usuario, B7.1.] La página «Objetivos» de Indicadores muestra, en cada objetivo, cuántos hallazgos
**sin terminar** apuntan a él, con enlace a la lista de Mejoramiento filtrada por ese objetivo.
Cuenta solo los que la persona ve; si no ve ninguno, no dice nada. El conteo lo trae un módulo de
Mejoramiento que llama la página: las consultas de Indicadores no importan nada de Mejoramiento.

### 10.6 La lista y su Excel

La lista de hallazgos gana los filtros por **plan** y por **objetivo**, a la vista, y por documento,
indicador y norma, que solo llegan por enlace desde §10.1. Su Excel gana las columnas «Plan» y
«Objetivo».

## 11. Lo que la 15A dejó para esta entrega

### 11.1 La lista de hallazgos

[Usuario, B8.1; Claude, F15B-DC37.]

- **Por omisión muestra los que no han terminado.** El filtro se ve y se quita con un clic. Los
  terminados se ven eligiendo su estado, o «Todos».
- **Buscar por un código exacto** encuentra el hallazgo aunque esté terminado.
- **50 por página,** con el corte y el orden en la consulta (hoy se ordena en memoria).
- **Las cifras** de arriba siguen contando todo lo que la persona ve, no la página.
- **El turno de cada fila** se resuelve para la página entera, con un número de consultas que no
  crece con las filas, y con una prueba que lo acote (hoy es una consulta por hallazgo en varios
  estados).
- **El Excel** exporta todo lo que el filtro muestra, no solo la página.

### 11.2 Los archivos que ya se firmaron ⚠

[Usuario, B8.4; Claude, F15B-DC38.] Ajusta la decisión 9 de la 15A. Hoy el Admin SGC quita cualquier
archivo de un hallazgo sin terminar, y quien lo subió, mientras su destino siga abierto.

- **La evidencia del registro** (los archivos del hallazgo con rol de evidencia) **que ya estaba
  subida** cuando el plan de acción se envió por primera vez no se quita, por nadie (salvo el retiro
  de abajo): desde entonces
  la identificación es parte de lo firmado. Lo que se sube después se quita como hoy; el oficio de
  una respuesta al ente ya registrada, nunca (la regla de la 15A).
- **Los archivos del análisis** de la ronda en curso no se quitan mientras el plan esté enviado o
  aprobado. Si se devuelve y vuelve a «Por formular», se pueden quitar otra vez, como hoy, hasta el
  reenvío.
- **En un hallazgo cargado,** el plan llegó aprobado: los dos quedan congelados desde la carga.
- **Añadir sigue permitido** donde hoy lo está. Un hallazgo sin plan de acción (el camino corto)
  sigue como hoy.
- **Retirar por datos personales** [Usuario, C2.1; Regulación: Ley 1581 de 2012]. Es la salida para
  un archivo subido por error con datos de un paciente o de quien se quejó. El Admin SGC
  (`mejora.gestionar`) retira un archivo **de los que esta sección congela**, con justificación (al
  menos 10 caracteres) y mientras el hallazgo no ha terminado. El archivo sale del almacén y queda
  el rastro: su nombre, su tamaño, su huella, quién lo había subido, quién lo retiró, cuándo y por
  qué, en el historial del hallazgo; a la bitácora va el acto, sin la justificación. Ninguna huella
  firmada cambia: los archivos no entran a la huella del plan. La página dice, donde estaba el
  archivo, que se retiró y cuándo.
- **No alcanza** a lo que la 15A ya dejaba sin quitar (la evidencia de la corrección, la de una
  actividad terminada, la de la verificación y la evaluación, el oficio de una respuesta registrada,
  el formato firmado de una carga y los archivos de una ronda anterior): eso sigue como está
  [Claude, F15B-DC47].

### 11.3 Los menores que entran

[Claude, F15B-DC39.] De «Deuda técnica (Fase 15A)», entran los que esta entrega toca; cómo, lo decide
el constructor:

- una prueba que acote lo que cuestan las tareas de mejoramiento en el cascarón, ahora con las dos
  tareas nuevas (§3.8 y §6.5);
- `puedeAbrirArchivoDeMejora` mira que la actividad sea de un plan aprobado;
- la prueba estática del motor reconoce también un `UPDATE` con alias, con esquema o entre comillas,
  y la forma `SET (estado, ronda)`: esta entrega crea hallazgos desde otros módulos;
- cuando un Admin SGC retira o sostiene un hallazgo en lugar de quien lo registró, se avisa a quien
  lo registró.

Lo demás de esa lista sigue como deuda.

## 12. Permisos y seguridad

**La matriz** gana una fila, con su prueba por celda:

| Permiso | Admin SGC | Gerencia | Control Interno | Líder | Consulta |
|---|---|---|---|---|---|
| `mejora.planes` | Sí | — | Sí | — | — |

**Los actos nuevos.** Cada escritura pasa por `mutacion()` o `requerirPermiso()`, exige su permiso
**más** la condición de persona, comprobada en el servidor y repetida dentro de la transacción, y
deja su fila en la bitácora.

| Acto | Permiso | Condición de persona |
|---|---|---|
| Crear, editar o anular un plan; poner, sacar o mover hallazgos; archivos del plan; el objetivo de un hallazgo | `mejora.planes` | — |
| Registrar la respuesta al ente desde el plan | `mejora.gestionar` | — |
| Exportar el Excel del ente | `mejora.ver_todo` | — |
| Imprimir un SGC-FO-14 | (lectura) | Ve completos todos sus hallazgos (§5.5) |
| Resolver una marca con un hallazgo o una ocurrencia | `mejora.registrar` | Admin SGC, o líder del proceso del indicador; ve el indicador |
| Resolver una marca con «no requiere» | `mejora.gestionar` | Ve el indicador |
| Abrir la no conformidad de un hallazgo de verificación | `mejora.gestionar` | Ve ese hallazgo de verificación |
| Abrir un hallazgo desde un impacto | `mejora.registrar` | Admin SGC, o líder del proceso del impacto; ve el impacto |
| Pedir un cambio documental o enlazar un trámite | `tramites.solicitar` | Ve la actividad; ve el trámite que enlaza |
| Retirar un archivo congelado por datos personales | `mejora.gestionar` | El hallazgo no ha terminado (§11.2) |

- **Páginas:** las nuevas llaman `exigirSesion()` y después su guarda con `notFound()` (`exigirPlan`),
  nunca `exigirPermiso`; entran a `tests/paginas-sesion.test.ts`.
- **Acciones:** van en `src/app/acciones-mejoramiento.ts`, que ya vigila
  `tests/acciones-permisos.test.ts`.
- **La ruta de subida** del plan, fuera del `matcher`, con su caso (§3.7).
- **Ninguna ruta pública nueva.**
- **El texto libre no va a la bitácora** (decisión 42 de la 15A): los motivos, las justificaciones y
  el objetivo del plan quedan en el historial del plan, en la fila de la marca o en el evento del
  hallazgo.
- **Lo que no se ve no se cuenta:** ninguna cifra, lista, conteo ni historial dice lo que hay fuera
  del alcance de quien mira (§3.6, §6.5, §10.1 y §10.5).

## 13. Datos: la migración `0019`

Una sola, que solo añade [Claude, F15B-DC40]. Los nombres son provisionales.

| Qué | Cambio |
|---|---|
| `mejora_planes` | **Nueva:** los campos de §3.1, el consecutivo por vigencia con su unicidad, quién y cuándo lo creó, y la anulación (cuándo, quién y el motivo) |
| La clasificación de un hallazgo | **Nueva** (§3.3): el hallazgo (único), su plan y su objetivo, quién y cuándo. No cuelga del trigger del hallazgo terminado |
| `mejora_plan_eventos` | **Nueva, de solo inserción** (trigger y `REVOKE`): el plan, el hallazgo si aplica, el tipo, quién, cuándo y el detalle |
| Las respuestas al ente de un plan | **Nueva** (§3.8): el plan, la fecha de envío, el oficio, quién, cuándo y los hallazgos que incluyó |
| `mejora_marcas` | **Nueva, de solo inserción** (§6.4): una fila por decisión, no por medición |
| El enlace entre una actividad y un trámite | **Nueva** (§9.1), con el trigger del hallazgo terminado |
| `mejora_hallazgos` | Tres columnas opcionales: el hallazgo de verificación, el impacto sobre un documento y el impacto sobre un indicador de los que nació. Se escriben solo al nacer. Cada una, con una unicidad **entre los hallazgos que cuentan** (parcial: deja fuera los rechazados y los anulados) y, aparte, su índice completo |
| `mejora_reportes` | El documento y el indicador, opcionales (§10.2) |
| `archivos` | El `CHECK` del contexto admite el del plan |
| `configuracion` | El documento del SGC-FO-14 (§5.2) y los dos números de la sugerencia (§7.4, con 3 y 12) |

- **Las dos tablas de solo inserción** entran al piso 10 y a la regla 5 de `AGENTS.md`, a
  `asegurarRolApp`, a `tests/privilegios-bd.test.ts`, al vaciado de las semillas y a la lista de
  tablas que piden usuarios únicos por corrida en las pruebas.
- **Cada llave foránea nueva de `mejora_*`** lleva un índice completo cuya primera columna es la de
  la llave (`tests/mejora-esquema.test.ts`). Una unicidad parcial no cuenta para esa regla: donde la
  hay, va además el índice completo.
- **Las llaves van con `RESTRICT`,** y cada borrado que ya existe y pueda topar con una nueva
  comprueba antes y responde con su mensaje, no con un error crudo: un objetivo que tiene un plan o
  un hallazgo; un documento o un indicador que cita un reporte; una medición con salida (§6.4).
- **No cambia ninguna huella:** nada de lo que se añade entra a lo firmado.
- Se prueba sobre una copia de la base `sgc`, como las anteriores: mismos conteos y mismas huellas
  en lo que no toca.

## 14. Lo que no entra

**No metas:**

- «Efecto», «unidad de medida» y «cantidad», y el avance calculado por cantidad.
- Una plantilla oficial de un ente: si llega, es un complemento.
- Firma, aprobación o recorrido propios del plan.
- Que un líder ponga o saque hallazgos de un plan.
- La ocurrencia automática de una marca.
- Una página propia para el hallazgo de verificación.
- Un botón desde la revisión anual.
- La salida de una marca en el Excel, el impreso, la matriz o la lista de indicadores.
- Avisos de vencimiento de la respuesta al ente.
- El informe SGC-FO-28, el Pareto, los cuatro cálculos automáticos y la pestaña «Cumplimiento»: son
  de la 15C. El correo, de la Fase 16.

**Anti-metas** (sería un fracaso aunque funcione):

- Que un líder sepa, por una cifra, una línea del historial, un archivo o el Excel, que el plan
  tiene hallazgos de otros procesos.
- Que la fila de un hallazgo cerrado cambie por entrar a un plan o recibir un objetivo.
- Que quien puede decidir una marca abra un hallazgo para esa medición y le siga quedando la tarea
  de decidir.
- Que la misma corrección se escriba en Distribución y otra vez en Mejoramiento.
- Que una publicación de un documento falle por algo de Mejoramiento.
- Que quien no puede ver un hallazgo sepa que existe por la página de un indicador, un documento,
  una norma, un objetivo o un trámite.
- Que el SGC-FO-14 o el Excel del ente dejen por fuera un hallazgo que cuenta.
- Que una ficha, un plan de acción o una evaluación ya firmados cambien de huella por esta entrega.

## 15. Semilla, demostración y documentos

### 15.1 La demo

Sobre la de la 15A, por las funciones del dominio y con `ahora` inyectado, nunca por SQL sobre las
tablas `mejora_*`, y con la pasada de vencimientos de mejoramiento al final, a la hora de la
siembra. Los datos exactos son del constructor; debe quedar:

- **Un plan de un ente** con hallazgos de dos procesos: uno ya cerrado, uno de otro origen, uno sin
  plan de acción aprobado y dos listos para responder; con un archivo y una respuesta ya registrada
  para uno de ellos.
- **Un plan interno** con hallazgos y **uno sin ninguno.**
- **Marcas:** una pendiente con su análisis (con un hallazgo abierto del mismo indicador, para ver
  la sugerencia), una que todavía espera el análisis, una resuelta con un hallazgo y una con «no
  requiere».
- **Una no conformidad abierta desde un hallazgo de verificación,** en «Por formular», y otro
  hallazgo de verificación con la sugerencia a la vista.
- **Un impacto de norma** vencido y escalado, con su sugerencia.
- **Una actividad con dos trámites,** uno que terminó bien y otro en curso, y un hallazgo listo para
  cerrar cuyo análisis marcó «documentos».
- **Objetivos** en un plan y en hallazgos sueltos.

`HALLAZGOS_DE_LA_DEMO` y `tests/semilla-mejoramiento.test.ts` se actualizan; sembrada la demo, otra
pasada no tiene nada nuevo que avisar.

### 15.2 Demostración (criterios de cierre)

Con la demo recién sembrada, el usuario debe poder:

1. Como Control Interno, crear un plan de una auditoría, registrar en él un hallazgo (ver que llegan
   el origen, la fuente y el objetivo) y añadirle dos que ya existen, uno de ellos cerrado.
2. Ver la marca «Origen distinto» en un hallazgo de otro origen. Sacar un hallazgo con su motivo y
   verlo en el historial del plan.
3. Como líder de uno de los procesos, abrir el plan: ver solo sus hallazgos y sus cifras, sin
   archivos ni Excel. Pedir la dirección de un plan sin hallazgos suyos: «no encontrado».
4. Como Admin SGC, subir el informe de la auditoría al plan y registrar la respuesta al ente una
   vez; ver cuáles hallazgos quedaron respondidos y cuáles faltan, y que la tarea es una sola.
5. Exportar el Excel para el ente: trece columnas, una fila por actividad, el hallazgo de dos tareas
   en dos filas, y el plazo calculado.
6. Imprimir el SGC-FO-14 de un proceso desde el plan y el consolidado de ese proceso en el año, con
   un hallazgo sin plan y otro «en formulación».
7. Como Admin SGC, ver en «Mis tareas» «Decidir la acción de mejora de…»; en la página del indicador,
   añadirla como ocurrencia del hallazgo sugerido. En otra, abrir un hallazgo nuevo y ver la causa y
   la acción propuesta del análisis al formular. En otra, «no requiere».
8. Ver una medición marcada que todavía no pide decisión porque le falta el análisis.
9. Como líder de ese indicador, ver solo las dos primeras salidas. Como usuario de consulta, ver la
   marca y ninguna pista del hallazgo.
10. Desde un hallazgo de verificación, «Abrir no conformidad»; como líder, aceptarla y verla en «Por
    formular», con la corrección enlazada. Comprobar que quien corrigió el hallazgo de verificación
    no puede verificarla.
11. Desde un impacto de norma vencido y escalado, ver la sugerencia y abrir el hallazgo, con la norma
    como requisito incumplido.
12. En una actividad, pedir un cambio documental y enlazar un trámite que ya existe. Como responsable
    sin permiso, ver a quién pedírselo. Terminar la actividad con un trámite publicado como evidencia.
13. Cerrar un hallazgo cuyo análisis pidió cambios en documentos: con trámite publicado, sin
    justificación; sin él, el cierre la pide.
14. En la página de un documento, un proceso, un indicador y una norma, ver sus hallazgos; como
    consulta, ver «Reportar» y ninguna lista. En «Objetivos», ver el conteo y llegar a la lista
    filtrada.
15. En la lista, ver solo los abiertos, quitar el filtro, pasar de página y encontrar uno cerrado por
    su código. Intentar quitar un archivo del análisis de un plan ya enviado: se rechaza. Como Admin
    SGC, retirarlo «por datos personales» y ver el rastro en el historial.
16. Anular el hallazgo que resolvió una marca y ver que la tarea de decidir vuelve. Rechazar la no
    conformidad de un hallazgo de verificación, retirarla, y ver que se puede abrir otra.

### 15.3 Documentos

- **Manual:** el capítulo 9 (`docs/manual/usuario/09-mejoramiento.md`) gana «Planes de
  mejoramiento», «El formato para el ente», «El SGC-FO-14», «Decidir la acción de mejora de un
  indicador», «Abrir un hallazgo desde otros módulos» y «El cambio documental de una actividad», y
  ajusta «La lista» y «Archivos».
- **`CONTEXT.md` y `PLAN.md`,** al cierre.
- **Los ajustes a los textos del hospital** (Apéndice B del spec 15) ganan tres: la tabla del
  SGC-FO-14 no trae la columna «Estado» que sus instrucciones piden; el SGC-FO-14 dice «código del
  plan» por proceso y vigencia, y en la plataforma el `PM-` es el del plan de un evento, así que el
  consolidado de un proceso no lleva código; y su lista de fuentes (nueve) se imprime con los catorce
  orígenes.

### 15.4 Cambios a `AGENTS.md`

- Piso 10 y regla 5: `mejora_plan_eventos` y `mejora_marcas`, en las dos listas, y en la de las
  pruebas contra la base.
- Estructura: dónde viven los planes, y los parámetros del registro.
- La clasificación de un hallazgo vive fuera de su fila, y por qué.
- `mejora.planes`, y las reglas de alcance de un plan.
- `archivos`: el contexto del plan, quién lo abre y su ruta de subida.
- La respuesta al ente desde el plan, y el orden de candados (el plan antes que sus hallazgos).
- La marca: qué es un pendiente, las tres salidas, la salida en vigor, y quién la resuelve al
  registrar por fuera del panel.
- La no conformidad que nace de un hallazgo de verificación, y el caso nuevo de «quien ejecuta no
  verifica».
- El enlace entre una actividad y un trámite: que el motor del trámite no llama a Mejoramiento, y
  que el aviso sale en la pasada.
- Lo que comprueba el cierre.
- Los archivos congelados desde el envío del plan, y el retiro por datos personales.
- El número de migraciones.

## 16. Pruebas y lo que queda al constructor

**Estas no pueden faltar,** además de las de cada pieza:

- La matriz de `mejora.planes`, celda por celda.
- Un hallazgo cerrado entra, sale y cambia de plan sin que cambie su fila; un segundo plan para el
  mismo hallazgo se rechaza en la base.
- El plan para un líder: solo sus hallazgos en la lista, las cifras, el historial y el impreso; 404
  en los archivos y en el Excel; «no encontrado» en un plan sin hallazgos suyos.
- `mejora_plan_eventos` y `mejora_marcas` rechazan `UPDATE` y `DELETE`, también al dueño del
  esquema.
- La respuesta al ente desde el plan: vale solo para los listos, se rechaza si la lista cambió, y
  deja en cada hallazgo lo mismo que el acto de la 15A; la tarea es una por plan.
- El plazo del Excel en sus bordes (un mes exacto, fin de mes, un día) y el Excel con un hallazgo de
  varias actividades, uno sin plan aprobado y uno anulado.
- El consolidado en el borde del año: registrado el 31 de diciembre, cerrado el 1 de enero, en la
  zona de la instalación.
- El pendiente en cada caso de §6.1 (con análisis, sin análisis y en plazo, sin análisis y vencido,
  reportada tarde, cerrada, histórica, indicador retirado, marca que se va y vuelve, y el hallazgo
  de su salida que termina rechazado o anulado: el pendiente vuelve).
- Las tres salidas, con quién puede cada una; un hallazgo registrado a mano que cita la medición
  resuelve el pendiente si lo registra quien puede resolverlo, y no si lo registra otra persona; dos
  decisiones sobre la misma medición dejan una sola salida en vigor.
- La salida no se le muestra a quien no ve el hallazgo.
- La no conformidad desde un hallazgo de verificación: nace por el motor, aceptada va a «Por
  formular», una segunda se rechaza mientras la primera cuente y se admite si terminó rechazada o
  anulada, y quien corrigió no verifica.
- Un hallazgo que cuente por impacto; la sugerencia en sus cuatro condiciones.
- `crearSolicitud` con una actividad: el trámite y el enlace se escriben juntos; con una actividad
  que no vale, la solicitud se rechaza y no se escribe nada. El paso de la pasada no toca el enlace
  de un hallazgo terminado.
- Terminar con un trámite que terminó bien, y no con uno en curso o cancelado; el cierre en los
  cuatro casos de §9.6.
- Publicar un trámite enlazado a un hallazgo ya terminado no falla.
- La lista: el filtro por omisión, las páginas, el código exacto de un terminado y el número de
  consultas de una página.
- Los archivos congelados en cada estado de §11.2; el retiro por datos personales deja su rastro,
  solo lo hace el Admin SGC, no alcanza a lo que la 15A ya congelaba y no cambia ninguna huella.
- La `0019` sobre una copia de la base `sgc`; las huellas fijadas de un plan de acción y de una
  evaluación no cambian.
- Las reglas de `AGENTS.md` para pruebas contra la base valen igual: nada terminado ni confirmado
  fuera de una transacción revertida, y `ahora` en las opciones.

**Queda al constructor:** los nombres definitivos de tablas, columnas, índices, rutas, acciones,
eventos y avisos, y las frases de la bitácora; si la clasificación es una tabla o dos; el diseño de
cada pantalla dentro del sistema visual y de las maquetas, y sus textos, salvo los que este anexo
fija entre comillas; el selector de hallazgos y el de trámites, con sus límites de ritmo; dónde se
pinta exactamente cada salida y cada enlace; cómo se reparte la entrega en tareas; y los datos
exactos de la demo.

## 17. Decisiones de Claude en este anexo (para revisar de una vez)

En cada tema de la conversación Claude listó lo que daba por decidido; el usuario no objetó ninguno.
Esas llevan «(dicha)». Las demás salieron al escribir el anexo con el código a la vista. ⚠ = ajusta
la letra de un punto aprobado del spec 15.

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F15B-DC1 | El año del código `PM-` es la vigencia del plan (dicha) | §3.1 | Es como el hospital nombra sus planes | Práctica |
| F15B-DC2 | Un permiso nuevo, `mejora.planes`, para el Admin SGC y Control Interno | §3.2 | Ningún permiso de la 15A los reúne a los dos y solo a ellos | Práctica |
| F15B-DC3 ⚠ | El plan y el objetivo de un hallazgo se guardan fuera de su fila | §3.3 | El trigger rechaza todo cambio en un hallazgo terminado, y no se le abren excepciones | ISO derivada de 7.5.3 |
| F15B-DC4 | Editar un plan no cambia sus hallazgos (dicha) | §3.2 | Lo que propone se copia solo al registrar; lo firmado no se toca | Práctica |
| F15B-DC5 | Un plan se anula solo vacío, con motivo, y no se borra (dicha) | §3.2 | Su código no se reutiliza | Práctica |
| F15B-DC6 | Un hallazgo anulado o rechazado no se añade; el que lo queda estando en un plan, se conserva sin contar | §3.4 | No se pierde el rastro ni se infla el plan | Práctica |
| F15B-DC7 | Mover hallazgos y editar el plan no avisan a nadie | §3.4, §3.10 | Es clasificación, no un turno | Práctica |
| F15B-DC8 | El estado y las cifras del plan se calculan al leer; el avance es el promedio de sus hallazgos con plan de acción aprobado (el avance, dicho con las maquetas) | §3.5 | Como en los hallazgos (F15-DC11) | Práctica |
| F15B-DC9 | Quien ve un hallazgo solo por su actividad no ve el plan | §3.6 | El plan lista hallazgos que esa persona no lee completos | Regulación (Ley 1581 de 2012); Práctica |
| F15B-DC10 | El Excel y el SGC-FO-14 traen las actividades de todas las rondas, y las canceladas con su estado | §4.2, §5.3 | Una ronda nueva no puede borrar del informe lo ya hecho | ISO derivada de 10.2.2 |
| F15B-DC11 | El plazo: meses si son exactos; si no, días | §4.3 | Nunca contradice las fechas | Práctica |
| F15B-DC12 | El SGC-FO-14 lleva el último seguimiento (dicha) | §5.3 | El formato tiene una casilla; el historial sale en el SGC-FO-AC-01 | Documento del hospital |
| F15B-DC13 | «Aprobación y control» es una línea por hallazgo (dicha) | §5.4 | El plan no tiene firma propia | Práctica |
| F15B-DC14 | «Ya se puede decidir» incluye la medición cerrada y la que no exige análisis; el pendiente se calcula al leer | §6.1 | Sin eso, una marca así no se decidiría nunca | Práctica |
| F15B-DC15 | Una medición tiene a lo sumo una salida en vigor; la garantiza el registro, no una unicidad | §6.1, §6.4 | «En vigor» depende del estado del hallazgo (C1.1) | Práctica |
| F15B-DC16 | Sin fecha de corte para las marcas anteriores (dicha) | §6.1 | Hoy es una; no merece una regla | Práctica |
| F15B-DC17 | El hallazgo que registra por fuera del panel quien puede resolver la marca, también la resuelve; el de otra persona, no | §6.3 | Quien decide no se queda con la tarea después de abrir el hallazgo, y no cambia quién resuelve | Práctica |
| F15B-DC18 | Sin aviso nuevo; se decide en la página del indicador (dicha) | §6.5 | El Crítico ya avisó | Práctica |
| F15B-DC19 | El enlace de la salida, solo a quien ve el hallazgo; el «no requiere», a quien ve el indicador (dicha) | §6.5 | Quien no tiene alcance no sabe que el hallazgo existe | Regulación (Ley 1581 de 2012) |
| F15B-DC20 | Sirven para la ocurrencia los hallazgos sin terminar que citan el indicador de cualquiera de las tres formas; lleva la fecha del fin del periodo | §6.2 | La recurrencia en la espera de eficacia es justo el caso | ISO derivada de 10.2.1 d) |
| F15B-DC21 ⚠ | El botón y la sugerencia van en la fila del hallazgo de verificación; no se crea su página | §7.1 | Esa página no existe y en la 13B no se cambia nada | Práctica |
| F15B-DC22 | La acción correctiva se escribe al nacer; la corrección se muestra enlazada; el proceso se elige entre los del punto | §7.2 | Es lo que hace cumplir B5.1 | ISO derivada de 10.2.1 |
| F15B-DC23 | Quien corrigió el hallazgo de verificación, o responde por él, no verifica (dicha) | §7.3 | Es la regla 5.4 del usuario, con la corrección en otro módulo | ISO derivada de 10.2.1 d) |
| F15B-DC24 | Se abre en cualquier estado; los ciclos son independientes (dicha). «Una vez» quedó en «una que cuente» (C1.1) | §7.1 | Un hallazgo reabierto no está cerrado | Práctica |
| F15B-DC25 ⚠ | Un botón por impacto y, en la página del indicador, por revisión de indicador; proceso fijo; camino normal (dicha). «Uno por impacto» quedó en «uno que cuente» (C1.1) | §8 | Cada impacto tiene su documento y su proceso | Práctica |
| F15B-DC26 | Sin botón desde la revisión anual (dicha) | §8 | El spec 15 no lo pide | Práctica |
| F15B-DC27 | El motivo del trámite sale de la clase; la justificación, de la actividad, con su advertencia (dicha) | §9.2 | Quien participa en el trámite puede no ver el hallazgo | Regulación (Ley 1581 de 2012) |
| F15B-DC28 | Varios trámites por actividad, de cualquier tipo; vale el que terminó bien (dicha) | §9.4 | Un cambio suele tocar varios documentos | Práctica |
| F15B-DC29 ⚠ | El enlace con el trámite va en una tabla del módulo | §9.1 | Varios por actividad y enlazados después; `tramites` no cambia | Práctica |
| F15B-DC30 ⚠ | El motor del trámite no llama a Mejoramiento: el estado se lee y el aviso sale en la pasada | §9.5 | Una falla de aquí no puede tumbar una publicación | Práctica |
| F15B-DC31 | El cierre no pide texto cuando solo se marcó «documentos» y hay un trámite que terminó bien | §9.6 | El enlace ya es la evidencia | ISO derivada de 10.2.1 f) |
| F15B-DC32 | Qué trámites se enlazan y quién quita un enlace | §9.3 | Uno anterior al hallazgo no puede ser su respuesta | Práctica |
| F15B-DC33 | Qué hallazgos «citan» cada cosa; hasta diez; la lista no aparece vacía (dicha, en parte) | §10.1 | Un cero también dice algo | Práctica |
| F15B-DC34 | El formulario de registro gana «A qué se refiere» y sus parámetros | §10.3 | Hoy ningún campo los pone | Práctica |
| F15B-DC35 | El objetivo es clasificación: lo cambia `mejora.planes` en cualquier estado (dicha) | §10.4 | El mismo criterio de B2.1 | Práctica |
| F15B-DC36 | El reporte guarda el documento y el indicador (dicha) | §10.2 | Sin eso «Reportar» pierde el enlace | Práctica |
| F15B-DC37 | La lista: el filtro a la vista, el código exacto, y el orden y el turno resueltos por página | §11.1 | Es lo que hace útil a B8.1 | Práctica |
| F15B-DC38 ⚠ | El detalle de los archivos congelados: tampoco el Admin SGC; los cargados, desde la carga | §11.2 | Precisa B8.4 | ISO derivada de 7.5.3 |
| F15B-DC39 | Cuáles menores de la 15A entran | §11.3 | Los que esta entrega toca | Práctica |
| F15B-DC40 | Una sola migración, la `0019` | §13 | Como la 15A (su decisión 8) | Práctica |
| F15B-DC41 | La respuesta desde el plan: una definición de «espera respuesta», se confirma lo que se vio, varias respuestas y el oficio como archivo del plan | §3.8 | Precisa B2.7 | Práctica |
| F15B-DC42 | Los archivos del plan los suben quienes tienen `mejora.planes`; el oficio de una respuesta no se quita | §3.7 | Precisa B2.9 | ISO derivada de 9.2.2 f) |
| F15B-DC43 | El consolidado se imprime desde la lista y desde la página del proceso; su fecha de elaboración es la del día | §5.1, §5.2 | No hay plan del que tomarla | Práctica |
| F15B-DC44 | Imprime un SGC-FO-14 quien ve completos todos sus hallazgos (dicha) | §5.5 | El impreso no puede salir a medias | Práctica |
| F15B-DC45 | El Excel del ente es una tabla plana que exporta quien ve todo (dicha) | §4 | El ente la copia a su propio formato | Práctica |
| F15B-DC46 | En la no conformidad de un hallazgo de verificación se firma la referencia a esa corrección, no su contenido; los enlaces de origen nuevos entran a lo firmado solo cuando existen | §7.2 | La corrección puede llegar después de la firma, y ninguna huella guardada debe cambiar | ISO derivada de 7.5.3 |
| F15B-DC47 | El retiro por datos personales vale solo para lo que esta entrega congela, no para lo que la 15A ya dejaba sin quitar | §11.2 | Es lo que el usuario decidió en C2.1; lo otro tiene sus propias reglas (decisión 9 de la 15A) y quitarlo deshace una evidencia ya usada | Regulación (Ley 1581 de 2012); Práctica |
