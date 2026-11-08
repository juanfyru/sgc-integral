# Fase 13B — Distribución y puntos de uso (diseño)

Fecha: 2026-11-07. Estado: **aprobado por el usuario el 2026-11-07** («CONFIRMO»), después de la
revisión del constructor, cuyas cuatro preguntas quedaron resueltas en §8.2, §9.3, §9.4 y §11.4
(F13B-DC24 a DC27). Sigue el plan de implementación.

## 0. Cómo leer este documento

Es el detalle de la **segunda de las tres entregas** en que el usuario partió la Fase 13 del
diseño maestro `docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` ("el spec
maestro"). Mandan, en este orden: el spec de la 13A
(`2026-11-05-fase13a-flujo-documental-design.md`, "el spec 13A": §5 reparto, §6.5 y §12
visibilidad, §11 eventos de publicación y eliminación, §14 tareas y avisos, §16.2 `archivos`), el
spec maestro (§5.2 estructura, §5.3 visibilidad, §5.5 repositorio de evidencias, §5.6
notificaciones y tareas, §6.1 adiciones 1 y 2 y DC13, §8 Fase 13) y las reglas permanentes de
`AGENTS.md`. Donde este documento y los anteriores difieran, manda este; §2 dice en qué.

El hospital tiene escrito el paso 9 (distribuir copias controladas, comunicar y capacitar) y el
paso 10 (verificar en puntos de uso) de su procedimiento de control de documentos (spec 13A,
Apéndice A), pero **no los ha puesto en práctica todavía** [Usuario, 2026-11-07]. Esta entrega
diseña esa práctica desde cero, para que sea lo más amigable posible para quien la ejecuta, y
deja la evidencia de los puntos de control PC-09 y PC-10, y la parte física del PC-08.

Las maquetas aprobadas (no versionadas) están en
`.superpowers/brainstorm/29941-1794062962/content/pantallas-13b.html`: el sello, «Mis tareas» y
la tarea de acuse, la verificación en el celular, las copias por punto de uso, la ficha del
documento y la barra lateral. Son la referencia del **contenido** de cada pantalla; el estilo
es el sistema visual de la Fase 12.

Vocabulario de este documento:

- **Punto de uso:** un lugar del hospital donde se usan documentos en papel (Urgencias,
  Farmacia, Laboratorio, Archivo…), con una persona responsable. Catálogo propio (§7).
- **Copia controlada:** un ejemplar impreso de la versión vigente de un documento, numerado y
  sellado por el sistema, entregado a un punto de uso y rastreado hasta que se recoge (§8).
- **Recibido:** la confirmación del responsable del punto de que la copia llegó. **Recogida:**
  la confirmación de que la copia de una versión que dejó de estar vigente se retiró.
- **Audiencia:** las personas que deben enterarse de una versión publicada y confirmar su
  lectura (§9). **Lista de distribución:** un grupo nombrado de personas, por área, cargo,
  proceso o persona, que se suma a la audiencia de un documento.
- **Acuse:** la confirmación individual de lectura de una versión (§9.4). Reemplaza las actas
  de socialización en papel.
- **Jornada de socialización:** una reunión o capacitación sobre una o varias versiones, con
  asistentes y evidencia (§10).
- **Verificación:** la revisión de un punto de uso con la lista de chequeo que arma el
  sistema; cada «no conforme» abre un **hallazgo** (§11).
- **Coordinador SGC**, **Admin SGC**, **líder**, **trámite**, **huella**: como en el spec 13A.

Las etiquetas entre corchetes dicen de quién es cada decisión: **[Usuario]**, **[Spec
maestro]**, **[Spec 13A]** o **[Decisión de Claude]**. Las de Claude están reunidas en §22 para
revisarlas de una vez, con su base (ISO, Regulación o Práctica).

## 1. Intención y porqué

La 13A dejó el documento aprobado y publicado dentro del sistema. Falta lo que pasa después:
que el papel que circula en los servicios sea el vigente, que cada persona sepa qué cambió y lo
confirme, que la capacitación quede probada y que alguien verifique, con un número, que en los
puntos de uso no hay obsoletos. Hoy nada de eso existe en el hospital; los formatos SGC-RG-02
(registro de distribución) y las «evidencias de socialización» están previstos pero no se
diligencian.

El objetivo de la fase, en una frase: **que no pueda haber un obsoleto en un punto de uso sin
que el sistema lo sepa y alguien tenga la tarea de recogerlo, y que nadie tenga que enterarse
de un cambio por casualidad.** Lo digital ya está resuelto por la 13A: la plataforma es la
copia digital controlada (spec 13A §2, punto 8). Lo que esta entrega rastrea es lo físico y lo
humano: copias impresas, lecturas, capacitaciones y verificaciones.

Lo que la 13B deja listo para las siguientes entregas: los porcentajes de acuses y de
conformidad que la 13C convierte en indicadores documentales; los hallazgos de verificación que
la Fase 15 podrá convertir en acciones correctivas; `archivos` generalizado, que la Fase 14 usa
para las evidencias de mediciones; y las tareas y avisos que la Fase 16 llevará al correo.

## 2. Decisiones del usuario (2026-11-07)

Tomadas una por una en conversación, con las recomendaciones de Claude y su base; el usuario
eligió por número.

1. **Catálogo propio «Puntos de uso»** (opción 1 de 3), con nombre, sede opcional, procesos a
   los que sirve, responsable con cuenta y activo; lo edita el Admin SGC. Se descartó reusar
   las áreas de Estructura (organizativas, no lugares) y los subprocesos del mapa (mezclan qué
   se hace con dónde está el papel).
2. **Cómo nace una copia controlada** (seis puntos, todos aceptados): se emite desde la ficha
   del documento vigente eligiendo el punto; numeración **por documento y versión**; sello en
   cada página con texto fijo y **código QR** a la ficha; **solo documentos con principal en
   PDF**; emiten el **Admin SGC y el líder de proceso para sus procesos**; el PDF sellado **no
   se guarda** (se regenera desde el principal, cuya huella queda en el registro) y
   **reimprimir exige motivo** y queda en bitácora.
3. **La vida de la copia** (seis puntos, todos aceptados): estados emitida → recibida → por
   recoger → recogida, más anulada con motivo; **recibido por el responsable del punto desde
   «Mis tareas», sin clave**; plazo de recibido de 3 días con escalamiento; **recogida
   automática** al publicarse la versión nueva o ejecutarse la eliminación, en la misma
   transacción, con tarea al responsable del punto, que dice qué hizo con el papel;
   **reemplazo en un acto** desde la versión nueva; pantalla «Copias controladas» por documento
   y por punto.
4. **Listas de distribución y acuse** (seis puntos, todos aceptados): audiencia por defecto =
   las personas de los procesos del documento, resuelta al publicar y respetando el nivel de
   acceso; **listas nombradas** adicionales por área, cargo, proceso o persona, asignadas al
   documento como dato de catálogo; el **acuse es una tarea** que muestra qué cambió y se
   confirma **tras abrir el documento**, sin clave, en **tabla propia y auditada** (resuelve
   F12-D35); quienes firmaron quedan acusados por su firma; **plazo de 15 días** con
   escalamiento, porcentaje por documento, proceso y entidad, con Excel; la **eliminación
   avisa sin acuse**; **lectura obligatoria al ingresar al proceso**, como marca por documento.
5. **Socialización y capacitación** (seis puntos, todos aceptados): la marca «requiere
   socialización» se pone al aceptar la solicitud y genera, al publicar, la tarea de registrar
   la jornada (30 días); la **jornada** lleva fecha, modalidad, facilitador, versiones
   tratadas, asistentes del sistema, texto para asistentes sin cuenta, observaciones y
   evidencia adjunta; **la asistencia vale como acuse**; registran el Admin SGC y el líder para
   sus procesos; una jornada no se edita, se anula con motivo; la evidencia la ven Admin SGC,
   Control Interno, Gerencia y el líder del proceso; **`archivos` se generaliza** (versión o
   jornada como dueño), decisión de Claude que el usuario aceptó.
6. **Verificación en puntos de uso** (cinco puntos, todos aceptados): verifica el **Admin
   SGC** (Control Interno y Gerencia ven los resultados; el líder no verifica sus puntos);
   **periodicidad configurable de 90 días** con tarea calculada; **lista de chequeo generada
   por el sistema** (una fila por copia que debe estar, más tres ítems fijos), hecha para el
   celular; **hallazgo por cada «no conforme»** con acción inmediata, responsable y fecha de
   corrección; **resultado y porcentaje** con umbral configurable del 95 %, histórico y Excel;
   la verificación cerrada no se edita.
7. **Las maquetas** de `pantallas-13b.html`, aprobadas («está bien, continuemos»). No hubo
   clics en las dos opciones, así que Claude tomó las que recomendaba: **franja al pie de cada
   página** para el sello (no el cuño en la esquina) y **una sola entrada «Distribución»** con
   cuatro pestañas en la barra lateral (no cuatro entradas separadas).
8. **Tres supuestos de Claude del resumen final, aceptados**: el Admin SGC puede **pedir acuse
   de un vigente ya publicado**; Control Interno y Gerencia ven todo en solo lectura; la
   generalización de `archivos`.

Se mantienen de decisiones anteriores: la plataforma es la copia digital controlada y el
hospital ajusta el texto de su procedimiento [Usuario, spec 13A §2 punto 8]; **no hay permiso
individual para el auxiliar administrativo** (cambio 15, rechazado en la 13A): quien distribuye
en el sistema es el Admin SGC o el líder; el correo es de la Fase 16; los reportes formales con
pie de control, de la 17; los indicadores documentales, de la 13C; las acciones correctivas, de
la 15; la retención y disposición final (adición 9) sigue rechazada.

## 3. Metas, no metas y anti-metas

**Metas**

- Cada copia impresa que circula tiene número, punto de uso, responsable, recibido y, cuando
  su versión deja de estar vigente, una tarea de recogida y su cierre (PC-08 físico y PC-09).
- Cada persona de la audiencia de una versión publicada recibe una tarea que le dice qué
  cambió y confirma su lectura; el líder y el Admin SGC ven el porcentaje (PC-09, adición 2).
- Cada jornada de socialización o capacitación queda registrada con asistentes y evidencia, y
  cuenta como lectura para quienes asistieron (PC-09, cambio 11).
- El Admin SGC verifica cada punto de uso con una lista que arma el sistema, deja hallazgos
  con responsable y fecha, y obtiene el porcentaje de conformidad contra el 95 % (PC-10).
- Todo lo anterior entra por «Mis tareas» y la campana, sin planificador ni correo, con los
  mismos vencimientos y escalamientos de la 13A.
- El modelo de archivos admite dueños distintos de una versión, con la misma subida, la misma
  validación y el mismo control de acceso.

**No metas**

- Correo y planificador: Fase 16. Reportes formales con pie de control: Fase 17. Indicadores
  del proceso documental (porcentaje de acuses, de conformidad): 13C. Acciones correctivas
  desde un hallazgo: Fase 15.
- Copias digitales en puntos de uso: la plataforma es la copia digital; no se rastrean
  carpetas ni computadores.
- Firma con clave en el recibido, la recogida, el acuse o la jornada [Usuario, decisiones 3 y
  4]: son confirmaciones con la sesión, auditadas.
- Varios responsables por punto de uso, puntos jerárquicos (un punto dentro de otro) o
  importación por lote de puntos y listas: el catálogo es corto y se edita a mano.
- Retención y disposición final de las copias recogidas (adición 9, rechazada): el sistema
  registra «devuelta al SGC» o «destruida» y nada más.
- Acuse de lectura de documentos de la carga inicial de forma automática: solo si el Admin
  SGC lo pide (§9.5) o por la marca de lectura obligatoria al ingresar.

**Anti-metas** (si pasa, la entrega falló)

- Que una copia impresa de una versión que dejó de estar vigente siga en estado «recibida»
  sin que exista la tarea de recogerla.
- Que alguien pueda emitir una copia sellada de una versión no vigente, o de un archivo
  distinto del principal vigente.
- Que un acuse quede confirmado por alguien distinto de la persona, o sin haber abierto el
  documento; o que una persona reciba la tarea de acuse de un documento restringido que no
  puede ver.
- Que el porcentaje de conformidad se pueda mejorar editando una verificación cerrada.
- Que el acta de asistencia de una jornada, con nombres y firmas, la vea quien no debe.
- Que registrar la distribución sea más lento que el papel: ningún paso pide un dato que el
  sistema ya tiene (el punto trae su responsable, la copia trae su documento, la tarea trae
  qué cambió).

## 4. Restricciones

Rigen todas las de `AGENTS.md` y las del spec 13A §4. Las propias de esta entrega:

- **Sin dependencias npm nuevas.** `pdf-lib` (sello), `qrcode` (QR, ya en la Fase 11 para el
  TOTP) y `exceljs` (Excel) están.
- **Migración aditiva** (`0006`), aplicable sobre una base de `sgc-suaza` y sobre una de la
  13A: tablas y columnas nuevas; en `archivos`, quitar la obligatoriedad de `version_id` y
  añadir una restricción `CHECK` que los datos existentes cumplen (§14). Nada se renombra ni
  se borra.
- **Sin planificador:** los vencimientos de copias, acuses, socializaciones y hallazgos entran
  en la misma revisión de la 13A, que corre cuando alguien usa la aplicación (§12).
- **Las URL existentes se conservan.** Las nuevas van bajo `/distribucion`, `/acuses` y
  `/admin/…` (§13).
- **Cada página nueva llama su guard y cada acción empieza por la sesión y la autorización**;
  los tests estructurales se amplían a los archivos nuevos (§17). Toda escritura lleva un
  permiso de la matriz (§6.2) más, donde aplica, la condición de persona.
- **Las rutas que reciben una subida van fuera del `matcher` del proxy**, como
  `api/tramites/[id]/archivos` (F13A-R10), con su caso en `tests/proxy-matcher.test.ts`.
- **Fechas y plazos en la zona de la instalación**; los plazos son días calendario y se
  configuran en Configuración documental.
- **Accesibilidad no negociable**, y la verificación se diseña primero para 390 px: se hace de
  pie, con el celular, en el punto de uso.
- **Tests contra la BD de desarrollo**: nunca `DELETE` ni `UPDATE` sobre las tablas
  inmutables; datos con nombre único por corrida; flujos dentro de transacciones que se
  revierten (F13A-DC23).

## 5. Mapa de la Fase 13 (reparto actualizado)

El reparto es el del spec 13A §5. Esta entrega cubre los pasos 9 y 10 del procedimiento y la
evidencia de PC-09 y PC-10, más el retiro físico del PC-08 que la 13A dejó pendiente:

| Punto de control | Evidencia en el sistema | Dónde |
|---|---|---|
| PC-08 (parte física) | La copia de la versión que sale pasa a «por recoger» en la misma transacción que la publica o la elimina; el responsable confirma la recogida y el destino del papel | §8.4 |
| PC-09 Trazabilidad de distribución y divulgación | Copias con número, punto, responsable, recibido y huella del PDF impreso; audiencia resuelta al publicar; acuses con fecha y hora; jornadas con asistentes y evidencia | §8, §9, §10 |
| PC-10 Conformidad en puntos de uso | Verificaciones cerradas e inmutables, hallazgos con responsable y cierre, porcentaje contra el umbral | §11 |

Lo que se deja a otras entregas: PC-11 y PC-13 (13C), PC-12 (Fase 15). El capítulo del manual
pasa a llamarse «Distribución: copias controladas, acuses de lectura y puntos de uso» (§19); el
spec 13A §5 lo llamaba «Copias controladas y acuses de lectura».

El hospital ajusta por su cuenta dos textos de su procedimiento: el SGC-RG-02 «Registro de
distribución» pasa a ser el registro de copias del sistema, y las «evidencias de
socialización/capacitación» pasan a ser las jornadas registradas (§10).

## 6. Actores, permisos y visibilidad

### 6.1 Quién es quién

| En el procedimiento | En el sistema |
|---|---|
| Coordinador SGC | `admin_sgc`: administra el catálogo de puntos y las listas, emite, verifica, pide acuses, registra jornadas |
| Líder de proceso | `lider_proceso`: emite copias y registra jornadas de los documentos de sus procesos; ve la distribución de su alcance |
| Auxiliar administrativo | Sin permiso propio (cambio 15, rechazado). Si distribuye físicamente, lo hace con la copia que emitió el Admin SGC o el líder; el registro lo lleva el sistema |
| Responsable del punto de uso | Cualquier usuario activo designado en el catálogo; confirma recibidos y recogidas, y corrige hallazgos de su punto. No cambia su rol |
| Personal (audiencia) | Cualquier usuario: recibe tareas de acuse de los documentos de sus procesos y de las listas a las que pertenece |
| Gerencia y Control Interno | Ven toda la distribución en solo lectura |

### 6.2 Permisos nuevos en la matriz (`src/lib/permisos.ts`)

| Permiso | Roles | Qué concede |
|---|---|---|
| `distribucion.ver` | `admin_sgc`, `gerencia`, `control_interno`, `lider_proceso` | Ver la pantalla «Distribución» y sus pestañas. El líder, solo lo de los procesos de su alcance (`alcanceProcesos`) |
| `distribucion.gestionar` | `admin_sgc` | Catálogo de puntos de uso, listas de distribución, pedir acuses de un vigente, anular cualquier copia, cerrar cualquier hallazgo, cambiar la marca de socialización de un trámite, configuración de esta entrega |
| `copias.emitir` | `admin_sgc`, `lider_proceso` | Emitir, reimprimir y reemplazar copias de documentos de su alcance, y anular las que uno mismo emitió |
| `distribucion.responder` | Los cinco roles | Actuar como **responsable de un punto**: confirmar recibidos y recogidas y corregir hallazgos de sus puntos |
| `acuses.confirmar` | Los cinco roles | Confirmar la **propia** lectura |
| `socializaciones.registrar` | `admin_sgc`, `lider_proceso` | Registrar y anular jornadas de documentos de su alcance |
| `verificaciones.realizar` | `admin_sgc` | Abrir, llenar y cerrar verificaciones de puntos de uso |

Cada celda lleva su test. `distribucion.responder` y `acuses.confirmar` los tienen los cinco
roles por la misma razón que `tramites.participar` en la 13A (F13A-DC24): la regla de negocio 4
exige un permiso de matriz en toda escritura, y el responsable de un punto o el lector pueden
tener cualquier rol; la condición de persona (ser el responsable del punto, ser el destinatario
del acuse) se comprueba en el servidor además del permiso.

La **audiencia de un documento** (sus listas y la marca de lectura obligatoria al ingresar) es
un dato de catálogo (F13A-DC6) y se edita con `documentos.administrar`, que ya existe.

### 6.3 Reglas de separación

- **Quien verifica no es responsable de lo verificado.** El Admin SGC puede ser responsable de
  un punto (Archivo, por ejemplo); ese punto lo verifica otro `admin_sgc`, y si no hay otro,
  la verificación queda registrada con la marca «verificó su propio punto» [Decisión de
  Claude: no trabar una instalación con un solo Admin SGC; la marca es visible en la pantalla
  y en el Excel].
- **El líder no verifica** (ejecuta la distribución; spec maestro DC27).
- **El recibido lo da el responsable del punto**, no quien emite. Si son la misma persona, la
  copia nace recibida y el registro lo dice (§8.3).
- **El acuse es personal:** nadie confirma por otro; la asistencia a una jornada lo marca
  como «por asistencia», distinguible del acuse individual (§10.3).

### 6.4 Quién ve qué

| Qué | Quién lo ve |
|---|---|
| Catálogo de puntos de uso y listas | Admin SGC (edita); Gerencia y Control Interno (lectura); el líder ve los puntos de sus procesos; cualquier usuario ve el nombre del punto en sus propias tareas |
| Copias controladas | Admin SGC, Gerencia y Control Interno, todas; el líder, las de los documentos de su alcance; el responsable, las de sus puntos. Una copia de un documento **restringido** solo se emite a un punto cuyo responsable puede ver el documento (§8.1) |
| Acuses | Cada persona, los suyos. Los porcentajes y la lista de quién falta: Admin SGC, Gerencia y Control Interno, todo; el líder, los documentos de sus procesos |
| Jornadas | El resumen (fecha, modalidad, cuántos asistieron), quien ve el documento. La **evidencia adjunta y la lista de asistentes**: Admin SGC, Control Interno, Gerencia y los líderes de los procesos de las versiones tratadas [Usuario, decisión 5; Ley 1581 de 2012: datos de los asistentes] |
| Verificaciones y hallazgos | Admin SGC, Gerencia y Control Interno, todas; el líder, las de los puntos de sus procesos; el responsable, las de sus puntos y sus hallazgos |

Para quien no puede ver algo, no existe: página «no encontrada» y archivo 404, como en la 13A.
Las reglas viven junto a las demás en `src/lib/alcance.ts` (una función por entidad, al lado de
`puedeVerTramite`), no repartidas en las consultas.

## 7. Puntos de uso

Catálogo editable en **Administración → Puntos de uso**, con `distribucion.gestionar`, auditado.

| Campo | Qué es |
|---|---|
| Nombre | Obligatorio, único dentro de la sede («Urgencias», «Farmacia», «Consultorio de odontología») |
| Sede | Texto opcional («Sede principal», «Puesto de salud El Vergel»); sirve para agrupar y filtrar |
| Ubicación | Texto opcional de ayuda («segundo piso, junto a la estación de enfermería») |
| Procesos | Uno o varios procesos del mapa a los que sirve el punto. Dan el alcance del líder y sugieren los documentos a distribuir |
| Responsable | **Obligatorio**, un usuario activo. Recibe las tareas de recibido, recogida y corrección de hallazgos del punto |
| Activo | Un punto inactivo no recibe copias nuevas ni tareas de verificación |

Reglas:

- **Un punto no se desactiva con copias vivas** (emitidas, recibidas o por recoger): la pantalla
  dice cuáles faltan por recoger o anular. Un punto sin copias se desactiva libremente.
- **Cambiar el responsable** traslada las tareas pendientes al nuevo en el acto (son
  calculadas; §12) y queda en bitácora con el anterior y el nuevo. El sello de cada copia
  conserva el nombre de quien la recibió cuando se emitió (§8.2).
- **Un usuario responsable de puntos activos no se desactiva** en Usuarios hasta reasignar
  sus puntos; la pantalla de la persona los lista con enlace [Decisión de Claude: una tarea de
  recogida sin dueño rompe la cadena del PC-08].
- **El responsable nuevo de un punto debe poder ver los documentos restringidos** de los que el
  punto tenga copias vivas (la misma regla de la emisión, §8.1); si no, la pantalla pide
  recoger o anular esas copias antes [Decisión de Claude].
- Un punto se puede **crear desde un subproceso del mapa** con el nombre y el proceso
  prellenados (atajo de la pantalla; no hay vínculo permanente) [Decisión de Claude].

Hay **una sola instalación por entidad**, así que la sede es texto y no un catálogo más
(anti-meta: catálogos que nadie llena).

## 8. Copias controladas

### 8.1 Emisión

Desde la ficha del documento (portal o panel, según quién mira; §13.3), el botón **«Emitir
copia controlada»** aparece a quien tiene `copias.emitir` sobre ese documento y abre un diálogo:
punto de uso (los puntos de los procesos del documento primero, luego los demás activos),
nota opcional («para la carpeta del consultorio 2»). Al confirmar, en una transacción:

1. Se comprueba que la versión es la **vigente**, que su archivo principal es **PDF**
   (`archivos.mime = 'application/pdf'`), que el punto está activo y que, si el documento es
   **restringido**, su responsable puede verlo (`puedeAccederDocumento`); si no, el error dice
   «El responsable de <punto> no tiene acceso a este documento» [Decisión de Claude: la copia
   le daría acceso a quien no lo tiene; ISO 7.5.3.1 b)].
2. Se asigna el **número**: el siguiente de esa versión (`max + 1` por `version_id`, con la
   fila de la versión bloqueada). Dos dígitos en pantalla y en el sello («N.º 02»).
3. Se guarda la copia con el punto, el responsable **en ese momento**, quien emite, la
   **huella del PDF principal** y la nota; estado `emitida`, o `recibida` si quien emite es el
   responsable (§8.3). Evento `emitida` en su historial, auditoría `copia_emitida`, aviso al
   responsable «Le entregarán la copia N.º 02 de GTH-PR-02 v2 en Urgencias» con enlace a la
   copia.
4. La respuesta abre el **PDF sellado** para imprimir (§8.2).

Si el principal no es PDF, el botón aparece desactivado con el texto «Para emitir copias
controladas el archivo principal debe ser PDF» [Usuario, decisión 2]. Sin versión vigente no
hay botón.

### 8.2 El sello

Un PDF nuevo generado al vuelo con `pdf-lib` a partir del principal, con **una franja al pie
de cada página** [Usuario, decisión 7, recomendación de Claude]:

- Fondo del **color primario de la marca** (ya validado para texto blanco, F12) y texto blanco:
  **«COPIA CONTROLADA N.º 02»** en negrita, seguido de «GTH-PR-02 v2 · Urgencias · Entregada
  a Luz Dary Ortiz, Enfermera Jefe · 12/11/2026». Nunca dice «no controlada» (spec maestro
  DC13). El nombre y el cargo son los del responsable al emitir; la fecha, la de emisión en la
  zona de la instalación.
- Un **código QR** en la esquina inferior derecha, apoyado en la franja, con la dirección de la
  ficha del documento y la versión: `<url_publica>/documentos/GTH-PR-02?v=2`. La ficha lee `v`
  y, si no es la vigente, muestra «Esta copia es de la versión 2; la vigente es la 3» [Decisión
  de Claude]. La ficha exige sesión como todo lo demás.
- Medidas por defecto: franja de 1,0 cm de alto en el borde inferior, QR de 1,5 cm con su zona
  blanca. **Configurables** en Configuración documental (alto de la franja, tamaño del QR),
  como los márgenes del acta de la 13A, porque el pie de los formatos del hospital puede
  acercarse al borde. El plan incluye la prueba con los PDF reales del hospital que están en la
  raíz del repositorio sin seguimiento.
- El texto pasa por `textoParaFuente` (tildes y eñes) como la marca de agua y el acta.

La **dirección pública** de la plataforma no existe hoy en la configuración. Se añade la clave
`url_publica` en **Entidad y marca** («Dirección de la plataforma», `https://sgc.hospital.gov.co`
o `http://192.168.1.20:8443`), validada (esquema `http` o `https`, host, puerto opcional, sin
ruta). **Sin ella, el sello sale sin QR** y el diálogo de emisión lo avisa [Decisión de
Claude: una dirección tomada de la cabecera `Host` la controla el cliente y cambia cuando el
servidor cambie de nombre en la Fase 20; el papel debe sobrevivir a eso]. El manual dice que
el celular de quien verifica debe alcanzar la intranet.

**El PDF sellado no se guarda** [Usuario, decisión 2]: se regenera igual cada vez, y la copia
guarda la huella del principal con el que se emitió. Si el principal de esa versión cambiara
(no puede: la versión está publicada y sus archivos congelados), la ruta lo detectaría y se
negaría a imprimir.

**Ruta del PDF sellado:** `GET /distribucion/copias/[id]/pdf`, con `sesionDePeticion`,
autorización de `copias.emitir` sobre el documento (o `distribucion.ver` para Control Interno y
Gerencia, que pueden mirar qué se imprimió), **solo si la versión sigue vigente y la copia no
está recogida ni anulada**; `Cache-Control: no-store`; límite de ritmo por usuario como el del
acta de ejemplo.

**Ventana de impresión** [Decisión de Claude, tras la revisión del constructor]: la emisión
redirige a esa ruta, que sirve el PDF libremente durante **15 minutos** después de `emitida` y
después de cada `reimpresa`, y deja **un solo evento `impresa` por ventana**: el navegador
vuelve a pedir el archivo al recargar, al volver atrás o al abrir el visor, y eso no son
impresiones nuevas. Fuera de la ventana, la ruta no sirve el PDF y lleva a **«Reimprimir»**
(§8.5): un formulario `POST` a `/distribucion/copias/[id]/reimprimir` con el motivo, que
verifica `Origin`, registra `reimpresa` con el motivo en el historial y en la bitácora, y abre
una ventana nueva. Las descargas de quien solo tiene `distribucion.ver` quedan como
`consultada`, no `impresa`, y no abren ventana. Así «reimprimir exige motivo» se cumple en el
servidor y no solo en la interfaz.

### 8.3 Estados y transiciones

| De | A | Quién | Cómo |
|---|---|---|---|
| — | `emitida` | `copias.emitir` | §8.1 |
| — | `recibida` | `copias.emitir` | Al emitir, si quien emite es el responsable del punto: el historial dice «emitida y recibida por la misma persona» |
| `emitida` | `recibida` | Responsable del punto (`distribucion.responder`) | **Recibido** desde «Mis tareas» o la copia: «Confirmo que recibí la copia N.º 02 de GTH-PR-02 v2 en Urgencias». Sin clave. Fecha y hora; auditoría `copia_recibida` |
| `emitida`, `recibida` | `anulada` | Quien emitió, o `distribucion.gestionar` | Con motivo de una lista (emitida por error, extraviada, deteriorada) y texto opcional. Terminal. La reposición es **otra copia con otro número**: una copia, un papel [Usuario, decisión 2] |
| `emitida`, `recibida` | `por_recoger` | El sistema | Cuando su versión deja de estar vigente (§8.4). Guarda `por_recoger_en` y el plazo |
| `por_recoger` | `recogida` | Responsable del punto, o `distribucion.gestionar` | **Recogida**, con el **destino del papel**: devuelta al SGC, destruida en el punto, o **no se encontró**. Esta última cierra la copia y **abre un hallazgo** en el punto (§11.4) [Decisión de Claude: una copia perdida es «pérdida de registros», PC-12] |
| `por_recoger` | `recogida` | El sistema | Cuando una verificación encuentra la copia obsoleta y la retira en el acto (§11.4), o cuando se confirma un reemplazo (§8.5) |

Una copia `por_recoger` no se anula: se recoge. Una copia `recogida` o `anulada` **no se
reimprime** y su PDF sellado ya no se sirve.

Cada paso queda en **`copia_eventos`**, tabla de **solo inserción** (trigger y `REVOKE`, como
`tramite_eventos`): es el «registro de distribución completo» del PC-09 [Decisión de Claude;
ISO 7.5.3.1 b)]. La fila de la copia guarda el estado actual y las fechas de cada paso para
consultar sin recorrer el historial.

### 8.4 Recogida automática

**Donde una versión deja de ser vigente**, en la misma transacción, todas sus copias en
`emitida` o `recibida` pasan a `por_recoger`, con el plazo de recogida (5 días, configurable),
un evento en cada copia, un aviso al responsable de cada punto («Recoja la copia N.º 03 de
GBS-PR-01 v1 en Urgencias: la versión 2 es la vigente desde hoy») y, si la versión que entra es
la nueva vigente del mismo documento, la referencia a ella para ofrecer el reemplazo (§8.5).

Hay **tres lugares** donde una versión deja de ser vigente, y los tres llaman la misma función
(`marcarCopiasPorRecoger(tx, versionId, motivo)`) [Decisión de Claude: una sola regla]:

| Lugar | Motivo |
|---|---|
| `aplicarPublicacion` (`src/db/consultas/admin.ts`): la anterior pasa a obsoleta al publicar por trámite | «la versión N es la vigente» |
| `anularVigenteEn`: la vigente pasa a anulada al ejecutar una eliminación | «el documento fue eliminado» |
| `deshacerCarga`: una versión cargada por publicación directa pasa a descartada | «la carga se deshizo» |

Los dos primeros son el **evento de publicación y el de eliminación** del spec 13A §11, que esta
entrega engancha dentro de `publicarVersion` y `ejecutarEliminacion` (`flujo/cierre.ts`) a
través de esas funciones.

La tarea «Recoger la copia N.º 03 de GBS-PR-01 v1 en Urgencias» aparece al responsable en «Mis
tareas»; vencida, avisa al responsable y, a los 3 días, a su jefe (§12). El Admin SGC ve todas
las copias por recoger en la pestaña Copias controladas.

Una copia `emitida` que nunca se recibió también pasa a `por_recoger`: quien todavía tiene el
papel la cierra con destino «devuelta al SGC», y la pantalla lo sugiere para que «no se
encontró» no abra hallazgos falsos.

### 8.5 Reemplazo y reimpresión

- **Reemplazar.** En la ficha de la versión vigente nueva, si la anterior tenía copias ahora
  `por_recoger` y la nueva tiene principal en PDF, el botón **«Reemplazar las copias de la vN
  (k)»** emite una copia de la nueva por cada punto que tenía la anterior, con su número nuevo
  y el enlace `reemplaza_copia_id` a la vieja [Usuario, decisión 3]. El responsable de cada
  punto recibe **una sola tarea**: «Recibí la copia N.º 01 de la v2 y retiré la N.º 03 de la
  v1», que confirma el recibido de la nueva y la recogida de la vieja (destino obligatorio) en
  un acto. Si la nueva no tiene PDF, no hay reemplazo: las copias viejas se recogen y la
  pantalla lo explica.
- **Emitir una copia individual** en un punto que tiene una copia `por_recoger` del mismo
  documento ofrece marcarla como su reemplazo (misma tarea doble).
- **Reimprimir** una copia `emitida` o `recibida`: motivo obligatorio (deteriorada, ilegible,
  extraviada antes de entregar, otro con texto), evento `reimpresa` y auditoría. El sello es
  idéntico (mismo número, misma fecha de emisión). Si la copia física se perdió después de
  recibida, lo correcto es **anular** y emitir otra, y la pantalla lo sugiere.

### 8.6 Pantalla «Copias controladas»

Pestaña de «Distribución» (maqueta 4). Dos vistas: **por punto de uso** (lista de puntos con su
conteo y, al elegir uno, sus copias) y **por documento**. Filtros por estado: todas, por
recoger, sin recibido, anuladas. Columnas: número, documento y versión, entregada a (y quién
emitió, cuándo), estado con insignia de texto («Recibida 12 nov», «Sin recibido · 4 días»,
«Por recoger · 6 días»), acciones según permiso y estado. Cada copia tiene su página
(`/distribucion/copias/[id]`) con el historial completo, la huella del principal impreso, el
enlace al PDF sellado (si procede) y las verificaciones en que apareció. Excel de la vista
actual (`neutralizarFormula`, auditado `exporto_copias`).

## 9. Listas de distribución y acuse de lectura

### 9.1 Listas nombradas

Catálogo en **Administración → Listas de distribución**, `distribucion.gestionar`, auditado:
nombre único, descripción, activa, y **miembros** de cuatro tipos: un área (todos los usuarios
cuyo cargo pertenece a ella), un cargo (todos los usuarios con ese cargo), un proceso (todos
los asignados a él) o una persona. Una lista se **resuelve** a usuarios activos en el momento
del evento [Spec maestro §6.1]. La pantalla muestra cuántas personas resuelve hoy y quiénes.
La demo trae «Todo el hospital» (las cinco áreas) y «Personal asistencial».

### 9.2 La audiencia de un documento

Es un **dato de catálogo** del documento (F13A-DC6), editable siempre por quien administra:

- **Siempre:** las personas con alguno de los **procesos del documento** asignados (el
  propietario y aquellos donde aplica; una asociación a un subproceso cuenta por su proceso),
  incluidos los líderes. Es la misma regla de `filtroAcceso` [Usuario, decisión 4].
- **Además:** las **listas** que el Admin SGC le asigne (`documento_listas`).
- **Marca «lectura obligatoria al ingresar al proceso»** (`documentos.lectura_obligatoria_ingreso`,
  por defecto **apagada**) [Usuario, decisión 4; Decisión de Claude sobre el valor por defecto:
  encenderla en todo haría que cada persona nueva reciba decenas de tareas].

La audiencia **depende de que las personas tengan procesos asignados** (`usuario_procesos`,
que desde la 13A vale para cualquier rol). Una instalación que solo asigne procesos a los
líderes tendrá audiencias de dos personas: el manual y la pantalla de Usuarios lo dicen
(«Asigne a cada persona los procesos en los que trabaja, o use listas de distribución»), y la
demo asigna procesos a todos sus usuarios (§16).

### 9.3 Resolución al publicar

En la transacción de publicación (`publicarVersion`), después de que la versión queda vigente:

1. Se resuelve la audiencia: personas de los procesos ∪ miembros de las listas, **activas**,
   que **pueden ver el documento** (`filtroAcceso`: un restringido solo llega a quien tiene sus
   procesos o es Admin SGC, Gerencia o Control Interno).
2. Se crea un **acuse** por persona (`acuses`): versión, persona, origen `publicacion`,
   vencimiento a 15 días (configurable). Quienes firmaron **Elaboró, Revisó y Aprobó** nacen
   confirmados con modo `firma` [Usuario, decisión 4], y también quien publicó [Decisión de
   Claude: manejó el documento]; en los cuatro casos solo si están en la audiencia: un
   aprobador de Gerencia sin procesos asignados no recibe fila.
3. Se avisa a cada persona pendiente: «GTH-PR-02 v2 Inducción y reinducción: confirme su
   lectura», con enlace a su tarea. El aviso no lleva contenido del documento.
4. Si la versión anterior tenía acuses **pendientes**, pasan a `superado` [Decisión de Claude]:
   ya no cuentan en el porcentaje ni aparecen en «Mis tareas»; lo que hay que leer es la nueva.

Un acuse pendiente pasa a `retirado` cuando la persona se desactiva o **sale de la audiencia**:
se le quita el proceso, se la saca de la lista o la lista deja de estar asignada al documento,
o el documento pasa a restringido y ya no lo ve [Decisión de Claude: la audiencia es quién debe
conocer el documento hoy; una auxiliar trasladada de servicio no debe arrastrar lecturas de
donde ya no trabaja]. Se evalúa al editar la persona, la lista o el documento, por diferencia
entre la audiencia de antes y la de después (`editarUsuario` reescribe `usuario_procesos`
completo en cada edición, así que nada se cuelga de una inserción); si la persona vuelve a la
audiencia, puede recibir un acuse nuevo con las reglas de §9.5 (marca de lectura obligatoria al
ingresar o pedido del Admin SGC), nunca uno por cada vigente; la unicidad parcial lo permite.
Los porcentajes cuentan solo `pendiente` y `confirmado`.

### 9.4 La tarea de acuse

Página propia `/acuses/[id]` (maqueta 2), solo para su destinatario:

- **Qué cambió**: el control de cambios de la versión (`resumen_cambios`); si la versión no lo
  tiene (carga directa, o pedido manual sobre un documento heredado), «Versión N, vigente desde
  <fecha>» y, si es la primera, «Documento nuevo».
- **Por qué le llega**: «pertenece al proceso X» o «está en la lista Y».
- **Abrir el documento**: enlace a la ficha. El botón **«Confirmar lectura»** se habilita cuando
  existe una **vista o descarga de esa versión por esa persona** en `eventos_consulta` (la
  ficha ya la registra con `versionId`), comprobado también en el servidor [Usuario, decisión
  4].
- Casilla **«Confirmo que leí y entendí la versión N»** y el botón. Sin clave. Al confirmar:
  `confirmado_en`, modo `individual`, auditoría **`acuse_lectura`** con la versión y la persona.
  Esto es la evidencia que F12-D35 dejó pendiente: marcar una notificación como leída sigue sin
  auditarse; el acuse sí.
- A 390 px es una sola columna; es la pantalla que más gente va a usar.

`acuses` guarda el **estado actual** de cada persona frente a cada versión y cambia con el
tiempo (pendiente → confirmado, superado o retirado; una reversión si se anula la jornada que lo
confirmó, §10.2). La **evidencia** va aparte, en **`acuse_eventos`**, de **solo inserción**
(creado, confirmado con su modo, superado, retirado, revertido; persona, momento y detalle):
el mismo patrón de `copias_controladas` y `copia_eventos` [Decisión de Claude, tras la
revisión del constructor: una fila inmutable no admite la reversión ni el regreso de una
persona a la audiencia]. La unicidad (versión, persona) es **parcial**, sobre `pendiente` y
`confirmado`: quien salió y volvió tiene una fila nueva y las anteriores quedan como historia.
`sgc_app` no tiene `DELETE` en ninguna de las dos tablas.

### 9.5 Plazo, pedido manual, ingreso y eliminación

- **Plazo:** 15 días (`plazo_acuse_dias`). Vencido: aviso a la persona; a los 3 días más, al
  jefe (`supervisoresDe`), **un aviso por jefe** con los nombres de sus subalternos y el número
  de lecturas vencidas, **sin títulos ni enlaces** (F13A-DC27). Marcas `aviso_vencido_en` y
  `escalado_en` por acuse (§12).
- **Pedir acuse de un vigente** [Usuario, decisión 8]: desde la ficha, el Admin SGC
  (`distribucion.gestionar`) pulsa «Pedir acuse de lectura»: se crean acuses `solicitud_manual`
  para la audiencia actual que no tenga ya uno `pendiente` o `confirmado` de esa versión.
  Sirve tras la carga inicial y cuando se amplía la audiencia.
- **Lectura obligatoria al ingresar:** cuando a una persona se le asigna un proceso (crear o
  editar usuario, alta por lote), nacen acuses `ingreso_proceso` de las versiones vigentes de
  ese proceso con la marca, si no tiene ya uno pendiente o confirmado. El lote lo dice en su resumen («Se
  crearon N tareas de lectura»).
- **Eliminación:** aviso `distribucion.eliminado` a la audiencia («CEX-GU-01 Guía de atención
  dejó de aplicar: fue eliminado el <fecha>»), sin tarea [Usuario, decisión 4]. Los acuses
  pendientes de la versión anulada pasan a `superado`.

### 9.6 Porcentajes y pantalla «Acuses de lectura»

Pestaña de «Distribución». Tres niveles, con filtro de fechas (por defecto, el año en curso)
y de proceso:

- **Por versión:** confirmados / (pendientes + confirmados), con la lista de quién falta y
  desde cuándo (Admin SGC, Gerencia, Control Interno; el líder, en sus procesos).
- **Por proceso:** sobre los acuses de las versiones cuyo documento tiene ese proceso como
  propietario, publicadas en el periodo.
- **De la entidad:** sobre todos los del periodo.

La distinción `individual`, `asistencia` y `firma` se ve en la lista y en el Excel
(`exporto_acuses`). El indicador «porcentaje de acuses» de la 13C se calcula de estos datos.

## 10. Socialización y capacitación

### 10.1 Cuándo se exige

Al **aceptar** una solicitud de creación o modificación, el Coordinador SGC marca **«Requiere
socialización»** (casilla en el bloque de aceptación; `tramites.requiere_socializacion`). Se
puede cambiar hasta publicar, con `distribucion.gestionar`, desde la página del trámite
(`corregirDatosDeControl`), y queda en el historial [Usuario, decisión 5].

Al **publicar**, si está marcada, nace una fila en `socializaciones_requeridas` (versión,
vence a 30 días, `plazo_socializacion_dias`) y la tarea **«Registrar la socialización de
GTH-PR-02 v2»** para los líderes del proceso propietario (si no hay, para los Admin SGC), con
aviso. Vencida, escala como las demás. Se cumple cuando una jornada que trata esa versión queda
registrada; si la versión deja de estar vigente antes, pasa a `superada`.

Sin la marca, igual se puede registrar una jornada de cualquier versión vigente u obsoleta
(una capacitación sobre lo que ya rige).

### 10.2 La jornada

`/distribucion/socializaciones/nueva`, con `socializaciones.registrar` sobre los documentos
tratados:

| Campo | Regla |
|---|---|
| Fecha | Obligatoria, no futura |
| Modalidad | Presencial, virtual, reunión de servicio, otra |
| Facilitador | Un usuario; por defecto quien registra |
| Documentos y versiones | Una o varias versiones (por defecto la vigente de cada documento elegido); al menos una |
| Asistentes | Personas del sistema, elegidas con buscador; cero o más |
| Asistentes sin cuenta | Texto libre opcional (estudiantes, contratistas, personal nuevo sin cuenta) |
| Observaciones | Texto opcional |
| Evidencia | Cero o más archivos: PDF o imagen (acta de asistencia firmada, fotos). **Sin SVG ni HTML** (spec maestro §5.5). Recomendado, no obligatorio: el registro con asistentes ya es evidencia; la pantalla marca «Sin acta adjunta» cuando falta [Decisión de Claude] |

Debe haber al menos un asistente del sistema o texto de asistentes sin cuenta.

La jornada **no se edita** [Usuario, decisión 5]: se **anula** con motivo (quien la registró o
`distribucion.gestionar`) y se registra otra. Anular revierte los acuses que concedió (§10.3):
vuelven a `pendiente`, con plazo nuevo desde la anulación, si la versión sigue vigente, o pasan
a `superado` si no; el evento `revertido` queda en `acuse_eventos`. Todo auditado
(`jornada_registrada`, `jornada_anulada`).

### 10.3 La asistencia vale como acuse

Al registrar la jornada, para cada asistente del sistema con un acuse **pendiente** de alguna
de las versiones tratadas, el acuse pasa a `confirmado` con modo `asistencia` y el enlace a la
jornada; la pantalla de acuses lo muestra como «por asistencia a la jornada del 14 nov»
[Usuario, decisión 5]. Un asistente sin acuse (no está en la audiencia) no gana ninguno.

### 10.4 Dónde se ve

- Pestaña **Socializaciones** de «Distribución»: lista con fecha, modalidad, documentos,
  asistentes (conteo) y evidencia; filtros por proceso y fechas; detalle con la lista de
  asistentes y los archivos para quien puede verlos (§6.4). Excel (`exporto_socializaciones`).
- **Ficha del documento**: bloque «Distribución y lectura» (maqueta 5) con «Socialización:
  requerida · jornada del 14 nov, reunión de servicio, 18 asistentes, acta adjunta» y el botón
  «Registrar otra»; quien no puede ver la evidencia ve solo la frase.
- **Página del trámite**: la marca y, cerrado, el estado de la socialización.

Los archivos de una jornada se sirven por `/distribucion/socializaciones/[id]/archivos/[archivoId]/[[...nombre]]`
con la regla de §6.4; se suben por `POST /api/socializaciones/[id]/archivos` (fuera del
`matcher`, `recibirArchivo`, `Origin`, lista blanca sin SVG ni HTML, 25 MB).

## 11. Verificación en puntos de uso

### 11.1 Cuándo

`verificacion_cada_dias` (90 por defecto). Un punto **activo** cuya última verificación cerrada
es más vieja que eso, o que nunca se verificó, aparece como tarea de los Admin SGC («Verificar
Farmacia: última hace 95 días» o «nunca verificado»), calculada al mostrarse. No hay rondas
como entidad [Decisión de Claude]: el porcentaje «actual» sale de la última verificación de
cada punto activo, y el histórico se filtra por fechas.

### 11.2 La lista de chequeo

`verificaciones.realizar` abre una verificación del punto (`/distribucion/verificaciones/nueva?punto=…`),
y **el sistema arma la lista** en ese momento (maqueta 3):

| Ítem | Origen |
|---|---|
| Por cada copia `recibida` (o `emitida`) del punto, de una versión vigente: **está**, **legible**, **es la versión vigente** | Las copias del punto |
| Por cada copia `por_recoger` del punto: **ya no está** (se retiró) | Las copias del punto |
| **Sin documentos obsoletos** a la vista | Fijo |
| **Sin copias no controladas** (impresiones sin sello) | Fijo |
| **El personal sabe consultar la plataforma** | Fijo |

Cada ítem se responde **conforme**, **no conforme** o **no aplica**, con nota opcional. Se puede
**guardar avance** y seguir (la señal del celular falla); hay una sola verificación abierta por
punto (índice único parcial). Los textos de los ítems se copian en la verificación: si el
catálogo cambia después, la evidencia no cambia.

Quien verifica puede **escanear el QR** de la copia para abrir la ficha y comparar la versión;
y puede añadir un ítem libre («Se encontró un instructivo sin código») que entra como hallazgo.

### 11.3 Cierre y resultado

**Cerrar verificación**: todos los ítems respondidos; se calcula `conforme` (ningún ítem «no
conforme»), se guarda `cerrada_en` y quien cerró, y la verificación queda **inmutable** (la
aplicación no ofrece edición y el trigger rechaza `UPDATE` sobre una verificación cerrada,
salvo nada: se cierran los hallazgos, no la verificación) [Usuario, decisión 6]. Si quien cierra
es el responsable del punto, queda la marca «verificó su propio punto» (§6.3). Una verificación
abierta se puede **descartar** con motivo (quien la abrió o `distribucion.gestionar`): queda
registrada como descartada, sin ningún efecto, y libera el punto para otra.

El **porcentaje de conformidad** = puntos conformes / puntos verificados, sobre la última
verificación cerrada de cada punto activo (estado actual) o sobre las cerradas en el periodo
(histórico); se compara con `umbral_conformidad_pct` (95) y se muestra con insignia de texto
(«86 %, por debajo del 95 %»). También **por ítem**: qué falla más (por ejemplo, «sin
documentos obsoletos» en 3 de 7 puntos).

### 11.4 Hallazgos

Cada ítem **no conforme** crea un **hallazgo al cerrar la verificación**, en la misma
transacción [Decisión de Claude, tras la revisión del constructor: mientras está abierta solo se
guardan respuestas, notas y fotos, y nada sale del punto; así un ítem corregido a «conforme»
antes de cerrar no deja hallazgos huérfanos ni copias recogidas que haya que deshacer]. El
hallazgo lleva punto, verificación, texto del ítem, copia o documento afectado si se identificó,
descripción, **retirado en el acto** (sí o no), **responsable** (el del punto) y **fecha de
corrección** (5 días, configurable, ajustable por el verificador). La **foto** se adjunta al
**ítem** mientras se verifica (archivo con dueño `verificacion_item`) y el hallazgo la muestra.
El responsable lo ve en «Mis tareas» («Corregir hallazgo en Farmacia: está la v1 de ATE-FO-02
junto a la v2») y lo **cierra con nota**; también puede cerrarlo `distribucion.gestionar`.
Vencido, avisa y escala como las demás tareas.

Efectos automáticos, también al cerrar:

- Si el ítem es «ya no está» de una copia `por_recoger` y se responde conforme, la copia pasa a
  `recogida` con destino «retirada en verificación». Si se responde no conforme con «retirado
  en el acto: sí», lo mismo, más el hallazgo.
- Una copia recogida con destino «no se encontró» (§8.3) abre un hallazgo sin verificación
  (origen `recogida`).

Cuando llegue el motor de acciones (Fase 15), un hallazgo podrá abrir una acción correctiva
(PC-12); aquí solo se registra y se cierra.

### 11.5 Pantalla «Verificaciones»

Pestaña de «Distribución»: **estado actual** por punto (última verificación, resultado,
hallazgos abiertos, «vence» de la siguiente), el porcentaje actual contra el umbral y el botón
**Verificar**; **historial** con filtros por punto, fechas y resultado; **hallazgos** abiertos y
cerrados. Excel de cada vista (`exporto_verificaciones`). La página de una verificación muestra
los ítems con sus respuestas, notas, fotos y hallazgos.

## 12. Tareas, avisos y vencimientos (extiende el spec 13A §14)

### 12.1 «Mis tareas»

`misTareas()` suma fuentes a la de los trámites, todas **calculadas** del estado (spec maestro
DC14), con `id` estable `<fuente>:<id>`:

| Tarea | Para quién | Vence |
|---|---|---|
| Recibir la copia N.º n de X vN en <punto> | Responsable del punto | Emisión + `plazo_recibido_dias` (3) |
| Recoger la copia N.º n de X vN en <punto> | Responsable del punto | `por_recoger_en` + `plazo_recogida_dias` (5) |
| Recibir la vN y retirar la vN-1 en <punto> (reemplazo) | Responsable del punto | La misma regla; una sola tarea |
| Confirmar lectura de X vN | Cada destinatario pendiente | Creación + `plazo_acuse_dias` (15) |
| Registrar la socialización de X vN | Líderes del proceso propietario, o los Admin SGC | Publicación + `plazo_socializacion_dias` (30) |
| Verificar <punto> | Los Admin SGC | Última cerrada + `verificacion_cada_dias` (90) |
| Corregir hallazgo en <punto> | Responsable del punto | Fecha de corrección |

«Mis tareas» agrupa por tipo cuando hay muchas («12 lecturas por confirmar») para que una
publicación masiva no entierre las demás [Decisión de Claude; detalle para el constructor].

### 12.2 Avisos

Tipos nuevos, con `crearNotificacion` dentro de la transacción del hecho: `distribucion.copia`
(emitida, al responsable), `distribucion.recoger` (al responsable), `distribucion.acuse` (a cada
destinatario), `distribucion.eliminado` (a la audiencia), `distribucion.socializar` (a los
líderes), `distribucion.hallazgo` (al responsable), y `distribucion.vencido` y
`distribucion.escalado` para la revisión. El aviso lleva código, versión, título y enlace a la
tarea; **el de escalamiento al jefe va sin título ni enlace** (F13A-DC27). Nadie se avisa a sí
mismo.

### 12.3 Vencimientos

`revisarVencimientos` (`src/db/consultas/vencimientos.ts`) gana fuentes: copias (`emitida`
vencida → responsable y quien emitió; `por_recoger` vencida → responsable), acuses (vencidos →
la persona), socializaciones requeridas (→ líderes), hallazgos (→ responsable). Misma mecánica:
marcas `aviso_vencido_en` y `escalado_en` en cada fila, transacción corta con `SKIP LOCKED`, sin
`auditoria` (lo hace el sistema, F13A-R22), **un aviso por jefe** con sus subalternos agrupados
(`jefesDe`), y para los acuses la revisión va **por versión**, no fila a fila, para que una
publicación a 40 personas no sean 40 transacciones. El disparo sigue siendo el del cascarón
(`dispararRevisionDeVencimientos`), cada diez minutos como mucho; la Fase 16 lo cambia por el
planificador sin tocar la regla.

## 13. Pantallas y navegación

Todas dentro del cascarón, con los componentes base de la Fase 12 y `EncabezadoPagina`; las
maquetas fijan el contenido y el diseño fino queda al constructor (§21).

### 13.1 Barra lateral

Una entrada **«Distribución»** en el grupo Documentos [Usuario, decisión 7], visible con
`distribucion.ver` y también a quien es **responsable de algún punto activo** (`siResponsable`,
como `siParticipa` de la 13A), que ve solo sus puntos [Decisión de Claude]. Dos entradas en
Administración: **«Puntos de uso»** y **«Listas de distribución»**, con `distribucion.gestionar`.
La paleta `Ctrl K` las conoce porque salen de `navegacion.ts`.

### 13.2 «Distribución» (`/distribucion`)

Cuatro pestañas, cada una con su ruta: `/distribucion/copias` (§8.6), `/distribucion/acuses`
(§9.6), `/distribucion/socializaciones` (§10.4), `/distribucion/verificaciones` (§11.5). El
encabezado lleva «Emitir copia controlada» para quien puede. A 390 px las tablas pasan a
tarjetas, como la bandeja de trámites.

### 13.3 Cambios en pantallas existentes

- **Ficha del documento (portal, `/documentos/[codigo]`)**: bloque «Distribución y lectura»
  (maqueta 5) para quien tiene `distribucion.ver` o `copias.emitir` sobre el documento:
  audiencia, acuses de la vigente con porcentaje y «Ver quién falta», socialización, copias de
  la vigente y las por recoger de la anterior, botones «Emitir copia controlada»,
  «Reemplazar…», «Registrar socialización» y, para el Admin SGC, «Pedir acuse de lectura» y
  «Cambiar» audiencia. Los demás usuarios ven la ficha como hoy, más la frase de la jornada si
  hubo. Con `?v=N` de un QR, el aviso de versión (§8.2).
- **Ficha del panel (`/admin/documentos/[codigo]`)**: el mismo bloque, con la edición de la
  audiencia en «Editar documento» (listas y la marca de lectura obligatoria al ingresar).
- **Página del trámite**: casilla «Requiere socialización» en la aceptación; con el trámite
  cerrado, el estado de la distribución de la versión publicada (acuses, socialización, copias)
  con enlace.
- **Inicio**: «Mis tareas» con las fuentes nuevas, agrupadas.
- **Configuración documental**: sección «Distribución»: plazos de recibido (3), recogida (5),
  acuse (15), socialización (30) y corrección de hallazgos (5); verificación cada N días (90);
  umbral de conformidad (95 %); alto de la franja y tamaño del QR del sello.
- **Entidad y marca**: «Dirección de la plataforma» (`url_publica`).
- **Usuarios**: nota sobre los procesos y la audiencia; bloqueo al desactivar a un responsable
  de puntos activos; al cambiar procesos, los acuses de ingreso.
- **Bitácora**: frases legibles para las acciones nuevas (`bitacora-detalle.ts`).

### 13.4 Páginas nuevas

| Ruta | Qué | Quién |
|---|---|---|
| `/distribucion`, `/distribucion/{copias,acuses,socializaciones,verificaciones}` | Las cuatro pestañas | `distribucion.ver` o responsable |
| `/distribucion/copias/[id]` | Una copia: historial, acciones | Quien puede verla (§6.4) |
| `/distribucion/copias/[id]/pdf` | El PDF sellado | §8.2 |
| `/distribucion/copias/[id]/reimprimir` (`POST`) | Reimpresión con motivo | `copias.emitir` |
| `/distribucion/socializaciones/nueva`, `/[id]`, `/[id]/archivos/[archivoId]/[[...nombre]]` | Jornadas y su evidencia | §10 |
| `/distribucion/verificaciones/nueva`, `/[id]`, `/[id]/archivos/[archivoId]/[[...nombre]]` | Verificación (celular) y las fotos de sus ítems | §11 |
| `/acuses/[id]` | La tarea de acuse | Su destinatario |
| `/admin/puntos-uso`, `/nuevo`, `/[id]` | Catálogo de puntos | `distribucion.gestionar` |
| `/admin/listas-distribucion`, `/nueva`, `/[id]` | Catálogo de listas | `distribucion.gestionar` |
| `POST /api/socializaciones/[id]/archivos`, `POST /api/verificaciones/[id]/items/[itemId]/archivos`, `DELETE …/[archivoId]` | Subidas de evidencia, fuera del `matcher` | §10, §11 |

## 14. Modelo de datos y migración 0006

Nombres provisionales (§21); convenciones heredadas: `timestamptz`, FK `restrict`, `CHECK` de
estados en BD, índices por lo que filtra el alcance.

### 14.1 Cambios a tablas existentes

| Tabla | Cambio |
|---|---|
| `archivos` | `contexto` (`version`, `jornada`, `verificacion_item`; por defecto `version`) y `contexto_id`; `version_id` **deja de ser obligatoria**; `CHECK`: con `contexto = 'version'`, `version_id` no nula y `contexto_id` nula; con otro contexto, al revés. Los roles válidos ganan `evidencia`. Las filas heredadas quedan como `version` sin tocarlas. La ruta física de los contextos nuevos es `almacen/<contexto>/<id>/<nombre>` (spec maestro §5.5); las existentes no cambian |
| `documentos` | `lectura_obligatoria_ingreso` (booleano, por defecto falso) |
| `tramites` | `requiere_socializacion` (booleano, por defecto falso) |
| `configuracion` | Claves: `plazo_recibido_dias`, `plazo_recogida_dias`, `plazo_acuse_dias`, `plazo_socializacion_dias`, `plazo_correccion_dias`, `verificacion_cada_dias`, `umbral_conformidad_pct`, `sello_franja_cm`, `sello_qr_cm`, `url_publica` |

### 14.2 Tablas nuevas

| Tabla | Qué guarda |
|---|---|
| `puntos_uso` | Nombre, sede, ubicación, responsable, activo, orden. Único (sede, nombre) sin distinguir mayúsculas |
| `punto_uso_procesos` | Punto ↔ proceso |
| `copias_controladas` | Versión, número (único por versión), punto, responsable al emitir (y su nombre y cargo copiados para el sello), quien emitió, huella del principal, nota, estado (`emitida`, `recibida`, `por_recoger`, `recogida`, `anulada`), fechas de cada paso, destino de la recogida, motivo de anulación, `reemplaza_copia_id`, `vence_en`, `aviso_vencido_en`, `escalado_en` |
| `copia_eventos` | Historial: copia, tipo (`emitida`, `impresa`, `consultada`, `reimpresa`, `recibida`, `por_recoger`, `recogida`, `anulada`), persona (nula si el sistema), momento, detalle `jsonb`. **Solo inserción** |
| `listas_distribucion` | Nombre único, descripción, activa |
| `lista_miembros` | Lista, tipo (`area`, `cargo`, `proceso`, `usuario`), id referido |
| `documento_listas` | Documento ↔ lista |
| `acuses` | Versión, persona, origen (`publicacion`, `solicitud_manual`, `ingreso_proceso`), estado (`pendiente`, `confirmado`, `superado`, `retirado`), modo (`individual`, `asistencia`, `firma`), `jornada_id`, `confirmado_en`, `vence_en`, `aviso_vencido_en`, `escalado_en`, motivo del retiro. **Índice único parcial (versión, persona) sobre `pendiente` y `confirmado`** |
| `acuse_eventos` | Historial del acuse: tipo (`creado`, `confirmado`, `superado`, `retirado`, `revertido`), persona (nula si el sistema), momento, detalle `jsonb` (modo, jornada, motivo). **Solo inserción** |
| `jornadas` | Fecha, modalidad, facilitador, observaciones, asistentes sin cuenta, quien registró, `anulada_en`, motivo |
| `jornada_versiones` | Jornada ↔ versión |
| `jornada_asistentes` | Jornada ↔ usuario |
| `socializaciones_requeridas` | Versión (única), `vence_en`, marcas de aviso, `cumplida_en`, `jornada_id`, `superada_en` |
| `verificaciones` | Punto, estado (`abierta`, `cerrada`, `descartada`), quien abrió, `abierta_en`, `cerrada_en`, quien cerró, `conforme`, marca «propio punto», motivo del descarte, textos copiados del punto y del responsable. **Índice único parcial: una abierta por punto** |
| `verificacion_items` | Verificación, orden, origen (`copia`, `copia_por_recoger`, `fijo`, `libre`), `copia_id`, texto, respuesta (`conforme`, `no_conforme`, `no_aplica`, nula), nota; sus fotos son archivos con dueño `verificacion_item` |
| `hallazgos` | Punto, origen (`verificacion`, `recogida`), `verificacion_id`, `item_id`, `copia_id`, `documento_id`, descripción, retirado en el acto, responsable, `vence_en`, estado (`abierto`, `cerrado`), cierre (quién, cuándo, nota), marcas de aviso |

`copia_eventos` y `acuse_eventos` se añaden al `REVOKE UPDATE, DELETE` de `asegurarRolApp`;
todas las tablas nuevas, al `TRUNCATE` de `limpiarTodo`. Los triggers de solo inserción usan
`sgc_impedir_modificacion()` (existe desde la 0002); uno nuevo protege las verificaciones
cerradas y sus ítems.

### 14.3 Migración

Una migración `0006`, aditiva, con los cambios de `archivos` de §14.1. Sobre una base de
`sgc-suaza` o de la 13A no hay datos que transformar: no hay puntos, copias ni acuses; todo
archivo existente es de una versión. La Fase 20 la ensaya con un respaldo real, como las demás.

## 15. Seguridad

Riesgos del spec maestro §5.9 que toca esta entrega:

| Riesgo | Cómo |
|---|---|
| 3. Aislamiento por alcance | Las cuatro pestañas, las fichas y las rutas de archivos y PDF aplican §6.4 desde `alcance.ts`; el líder solo alcanza sus procesos; el responsable, sus puntos; tests con cada rol y con un responsable de otro punto |
| 4. Permisos solo en la interfaz | Toda acción exige permiso de matriz más condición de persona en el servidor; la interfaz solo oculta |
| 7 y 15. Validación | Un esquema `zod` `.strict()` por acción; nada vuelca un formulario en un `UPDATE` |
| 14. Identificadores predecibles | El id de una copia, un acuse o una jornada no da acceso: cada petición se autoriza y quien no puede ver recibe 404 |
| 20. Archivos | La evidencia entra por `recibirArchivo` con la lista blanca (PDF e imágenes; nunca SVG ni HTML), magic bytes, 25 MB, nombre saneado, `Origin`, rutas fuera del `matcher`; se sirve con el control de acceso del dueño y `no-store`. El PDF sellado lo genera el servidor desde el principal, nunca desde un archivo subido para eso |

Además: el QR no lleva secretos (la ficha exige sesión); `url_publica` se valida para que el
sello no pueda imprimir una dirección ajena; la reimpresión verifica `Origin` y queda en
bitácora; límite de ritmo por usuario en el PDF sellado y en las acciones de esta entrega;
`copia_eventos` y `acuse_eventos` son de solo inserción por trigger y privilegios, y las
verificaciones cerradas son inmutables; sin oráculos: la emisión sobre un restringido a un
punto cuyo responsable no lo ve dice qué falta (§8.1), porque quien emite ya ve el documento y
el mensaje no revela nada a quien no lo ve; y nunca llega una tarea de acuse de un restringido
a quien no puede verlo.

## 16. Semillas

**Mínima:** las claves de configuración con sus valores por defecto y `url_publica` vacía; sin
puntos ni listas (son de la entidad).

**Demo** (sobre la de la 13A; se resiembra la base de desarrollo):

- `usuario_procesos` para **todos** los usuarios demo que no lo tenían: `consulta` → AIN y CEX;
  `gerente` y `control.interno` quedan sin procesos (ven todo por rol). Dos usuarios nuevos con
  rol `consulta`: `jefe.urgencias` (Enfermera Jefe, AIN) y `regente.farmacia` (cargo nuevo
  «Regente de Farmacia», ATE).
- Siete **puntos de uso**: Urgencias (`jefe.urgencias`), Farmacia (`regente.farmacia`),
  Laboratorio y Vacunación (`consulta`), Odontología (`lider.cex`), Talento Humano
  (`lider.gth`), Archivo (`coordinadora.sgc`), con sus procesos.
- Dos **listas**: «Todo el hospital» (las cinco áreas) y «Personal asistencial» (Subgerencia
  Científica). `GTH-CA-01` con la lista «Todo el hospital» y lectura obligatoria al ingresar.
- **Copias** de `GTH-CA-01` v3 (publicada por SOL-2026-001): Talento Humano recibida, Urgencias
  emitida sin recibido hace 4 días; una copia de la v2 en Archivo **por recoger** desde la
  publicación de la v3; una copia anulada por error. Los eventos con fechas coherentes con las
  firmas del trámite.
- **Acuses** de `GTH-CA-01` v3 para su audiencia, con parte confirmada (individual y por firma),
  parte pendiente y uno vencido; una **jornada** del 14 de octubre sobre esa versión con cuatro
  asistentes (acuses por asistencia) y un PDF de acta generado por la semilla.
- **Verificaciones**: Farmacia cerrada y conforme hace 95 días (aparece como vencida);
  Urgencias cerrada hace 20 días con un hallazgo abierto («copia no controlada de AIN-FO-01»).
- `tests/semilla-tramites.test.ts` y el nuevo test de semilla leen el estado y saltan con aviso
  si la demo ya avanzó; `SEMILLA_RECIEN=1` lo exige.

## 17. Pruebas

Como en la 13A: reglas puras sin BD; flujos contra la BD de desarrollo en transacciones que se
revierten; usuarios de prueba `zz_*`; nada de `DELETE` en las tablas inmutables.

- **Reglas puras:** estados y transiciones de la copia; numeración por versión; resolución de
  audiencia (procesos, listas, nivel de acceso, firmantes, inactivos); estados del acuse
  (`superado`, `retirado`); texto del sello y contenido del QR; cálculo del porcentaje de
  conformidad y de acuses; generación de la lista de chequeo; plazos y vencimientos de cada
  fuente.
- **Consultas y flujo:** emisión (vigente, PDF, punto activo, restringido), recibido (solo el
  responsable; mismo emisor), recogida automática en los tres lugares (`aplicarPublicacion`,
  `anularVigenteEn`, `deshacerCarga`), reemplazo en un acto, reimpresión con motivo, anulación;
  acuses al publicar y `superado` de la versión anterior, pedido manual sin duplicar, ingreso al
  proceso, eliminación sin tarea, retiro al salir de la audiencia; jornada que confirma por
  asistencia y anulación que revierte; ventana de impresión y reimpresión con motivo;
  verificación abierta única, descarte, efectos solo al cerrar (hallazgos, fotos del ítem,
  recogida), cierre inmutable; «no se encontró» abre hallazgo.
- **Visibilidad:** cada pestaña, cada ficha y cada ruta de archivo o PDF con los cinco roles, un
  líder de otro proceso, un responsable de otro punto y una persona ajena a la audiencia; 404
  en todos los caminos.
- **Estructurales, ampliados:** `permisos` (celdas nuevas), `paginas-sesion`,
  `acciones-permisos`, `handlers-permisos`, `proxy-matcher` (rutas de subida nuevas),
  `privilegios-bd` (`copia_eventos`, `acuse_eventos`), `navegacion` (entradas nuevas y `siResponsable`),
  `textos-fijos`, `colores-fijos`, `esquema` (índices y `CHECK` nuevos; `archivos` con los dos
  contextos).
- **PDF:** el sello sobre un PDF de una y de varias páginas, con y sin `url_publica`, con tildes
  y nombres largos; la franja y el QR dentro de la página; prueba manual con los PDF reales
  del hospital.
- **Semilla:** la demo deja los estados de §16 y la mínima las claves.
- **Pantallas:** render de la tarea de acuse (botón deshabilitado sin vista), de la lista de
  chequeo a 390 px y de la ficha con el bloque nuevo; `a11y-estructura` para las páginas nuevas.

## 18. Demostración (criterios de cierre)

Con la base recién sembrada y `npm run dev`:

1. **Puntos de uso (`coordinadora.sgc`).** Crear «Sala de partos» desde el subproceso Atención
   del Parto, con `jefe.urgencias` de responsable. Intentar desactivar Urgencias: lo impide por
   sus copias vivas.
2. **Emitir (`lider.gth`).** En `GTH-PR-01`, emitir una copia para Talento Humano: se abre el PDF
   con la franja «COPIA CONTROLADA N.º 01 · GTH-PR-01 v1 · Talento Humano · Entregada a …» y el
   QR en cada página; la copia nace recibida porque el líder es el responsable. Emitir otra para
   Urgencias: queda «Sin recibido». En un documento con principal en Word, el botón explica que
   falta el PDF. En `GTH-FO-01` (restringido), emitir para Farmacia es rechazado: su responsable
   no lo ve.
3. **Recibido (`jefe.urgencias`).** «Mis tareas» → «Recibir la copia N.º 02 de GTH-PR-01 v1 en
   Urgencias» → confirmar. La copia queda recibida; la bitácora dice quién y cuándo.
4. **Publicar y recoger.** Tramitar y publicar la v2 de `GTH-PR-01` (atajo: el camino de la 13A
   con `coordinadora.sgc` aprobando y publicando). Debe verse: las dos copias de la v1 «Por
   recoger», la tarea de `jefe.urgencias` y de `lider.gth`, y el botón «Reemplazar las copias de
   la v1 (2)». Pulsarlo como `lider.gth`: nacen dos copias de la v2; `jefe.urgencias` confirma
   «Recibí la v2 y retiré la v1» con destino «devuelta al SGC».
5. **QR.** Escanear el QR de la copia de la v1 con el celular en la red del hospital: la ficha
   dice «Esta copia es de la versión 1; la vigente es la 2». Sin `url_publica`, el sello sale sin
   QR y el diálogo lo avisa.
6. **Acuse (`consulta`).** Tras publicar la v2, `consulta` (si está en la audiencia) o cualquier
   persona de GTH abre «Confirmar lectura de GTH-PR-01 v2»: el botón está desactivado hasta
   abrir el documento; después confirma. Como `lider.gth`, la ficha muestra «Acuses: 1 de N» y
   «Ver quién falta». `gerente` ve el porcentaje de la entidad en Distribución.
7. **Lista y pedido manual (`coordinadora.sgc`).** Asignar «Todo el hospital» a `SGC-PR-01` y
   pulsar «Pedir acuse de lectura»: cada usuario activo recibe la tarea; repetir no duplica.
   Marcar lectura obligatoria al ingresar y asignar el proceso SGC a un usuario nuevo: nace su
   acuse.
8. **Socialización (`lider.gth`).** La tarea «Registrar la socialización de GTH-PR-01 v2» (si la
   aceptación la marcó) → registrar la jornada con tres asistentes y un PDF de acta: los
   acuses de los asistentes quedan «por asistencia»; `consulta` ve la frase de la jornada pero
   no el acta; `control.interno` sí. Anular la jornada: los acuses vuelven a pendiente.
9. **Verificación (`coordinadora.sgc`, en el celular o a 390 px).** «Verificar Farmacia» (vencida
   hace 95 días): responder la lista, marcar un «no conforme» con foto, cerrar: «Punto no
   conforme», hallazgo para `regente.farmacia` con fecha; el porcentaje actual baja del 95 % y
   la insignia lo dice. `regente.farmacia` cierra el hallazgo desde «Mis tareas». Intentar
   editar la verificación cerrada: no hay cómo, y el trigger lo impide.
10. **Eliminación.** Ejecutar la eliminación de un documento con copias (atajo de la 13A): copias
    por recoger y aviso «dejó de aplicar» a la audiencia, sin tarea de acuse.
11. **Vencimientos.** Bajar los plazos a 1 día en Configuración documental, adelantar la fecha de
    una copia sin recibido y de un acuse (o esperar): la revisión avisa al responsable y a la
    persona; con el escalamiento en 1, el jefe recibe un aviso sin títulos.
12. **Excel.** Descargar el Excel de copias, acuses y verificaciones: encabezado institucional,
    celdas neutralizadas, fila en bitácora.
13. **Verificación técnica:** `npm run lint`, `npm test` (con `SEMILLA_RECIEN=1`), `npm run build`
    sin URL de base, compose reconstruido con «Migraciones al día» (siete migraciones) y
    `/api/salud` en verde; la 0006 aplicada sobre una copia con la demo de `main` y sobre una
    con el esquema de `sgc-suaza`.

    *Nota del cierre:* son ocho migraciones desde la 0007 (`0007_fase13b-item-retirado.sql`, la marca
    «Retirado en el acto» de los ítems de la verificación).

## 19. Manual de usuario

Capítulo 6, «Distribución: copias controladas, acuses de lectura y puntos de uso», escrito con
la funcionalidad fresca, con una sección por actor: el responsable de un punto (recibir,
recoger, corregir), cualquier persona (confirmar una lectura), el líder (emitir, reemplazar,
socializar, ver su porcentaje) y el Administrador del SGC (catálogos, verificar, pedir acuses,
configurar). Incluye la recomendación de asignar procesos a todo el personal, el requisito de
`url_publica` y del celular en la intranet para el QR, y los dos ajustes al texto del
procedimiento (§5). Los capítulos 2 (Usuarios: procesos y audiencia), 3 (barra lateral y tareas)
y 5 (aceptación con la marca de socialización, estado del trámite cerrado) se corrigen donde
esta entrega los deje falsos.

## 20. Lo que se deja al constructor

- Los nombres definitivos de tablas, columnas, índices, estados y tipos de evento; la forma de
  copiar los textos de los ítems en la verificación; si los hallazgos de recogida comparten
  tabla con los de verificación (aquí se asume que sí).
- La organización del código: módulos de reglas puras (`src/lib/distribucion/`), consultas
  (`src/db/consultas/distribucion/`), acciones (`src/app/acciones-distribucion.ts`) y handlers;
  cómo se generaliza `archivos` en `subida.ts`, `recepcion-archivo.ts` y `servir-archivo.ts` sin
  cambiar el camino de las versiones.
- La geometría exacta del sello (posición de la franja y del QR, tamaño de letra, recorte de
  nombres largos) dentro de las medidas configurables, probada con los PDF reales.
- El diseño de cada pantalla dentro del sistema visual, los textos de interfaz, estados vacíos
  y errores; la agrupación de «Mis tareas».
- Cómo se marca «abrió el documento» para habilitar el acuse (la consulta sobre
  `eventos_consulta` o un marcador propio), siempre comprobado en el servidor.
- Los límites de ritmo, el orden de las tareas del plan, los tests concretos y los datos
  exactos de la demo.

## 21. Riesgos

| Riesgo | Mitigación |
|---|---|
| La entrega es grande (seis módulos) | El plan va por módulos independientes con punto de control en navegador cada uno: catálogo y copias; acuses y listas; socialización y `archivos`; verificación; configuración y pantallas; semilla y manual. Las reglas puras y la migración, primero |
| La franja tapa el pie de los formatos del hospital | Medidas configurables; prueba con los PDF reales antes de cerrar la tarea del sello |
| El QR no se puede escanear (muy pequeño, sin red) | 1,5 cm por defecto y configurable; la ficha es el respaldo (el papel dice código y versión); el manual pide intranet en el celular |
| Audiencias vacías por falta de procesos asignados | Aviso en Usuarios y en el manual; la demo asigna procesos a todos; las listas cubren el resto |
| Avalancha de tareas tras una publicación a todo el hospital | Agrupación en «Mis tareas»; revisión de vencimientos por versión; un aviso por jefe |
| Generalizar `archivos` rompe el camino de las versiones | Las filas heredadas no cambian; `version_id` sigue en todas las consultas existentes; tests heredados de archivos en verde antes de añadir contextos |
| Doble recibido o doble recogida por dos pestañas | Fila de la copia bloqueada y comprobación del estado esperado, como en los trámites |
| Una verificación que se queda abierta | Una abierta por punto; la pantalla permite retomarla o descartarla sin cerrar (queda registrada como descartada, con motivo) |
| El Admin SGC único verifica sus propios puntos | Permitido con marca visible; la alternativa (Control Interno verifica) queda abierta sin migración |

## 22. Decisiones de Claude en este documento (para revisar de una vez)

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F13B-DC1 | Sello en franja al pie y una sola entrada «Distribución», al no haber clics en las opciones | §8.2, §13.1 | Eran las recomendadas: la franja no tapa el encabezado; la barra ya tiene trece entradas | Práctica |
| F13B-DC2 | Una copia de un documento restringido solo se emite a un punto cuyo responsable puede verlo | §8.1 | La copia daría acceso a quien no lo tiene | ISO 7.5.3.1 b) |
| F13B-DC3 | `url_publica` en Entidad y marca; sin ella el sello sale sin QR | §8.2 | La cabecera `Host` la controla el cliente y cambia en la Fase 20; el papel debe sobrevivir | Práctica (seguridad) |
| F13B-DC4 | El QR lleva la versión y la ficha avisa si no es la vigente | §8.2 | Convierte el QR en verificación de vigencia frente al papel | ISO 7.5.3.2 c) |
| F13B-DC5 | Medidas del sello configurables, con valores por defecto | §8.2 | El pie de los formatos del hospital puede acercarse al borde | Práctica |
| F13B-DC6 | `copia_eventos` y `acuse_eventos` de solo inserción; `acuses` guarda el estado actual con unicidad parcial; verificación cerrada inmutable | §8.3, §9.4, §11.3 | Son la evidencia de PC-09 y PC-10; una fila inmutable no admite la reversión ni el regreso a la audiencia (revisión del constructor) | ISO 7.5.3.1 b) |
| F13B-DC7 | Una copia recogida con destino «no se encontró» abre un hallazgo | §8.3 | Es la «pérdida de registros» que el procedimiento trata como no conformidad | PC-12 del procedimiento |
| F13B-DC8 | Una sola función marca las copias por recoger en los tres lugares donde una versión deja de ser vigente, incluido `deshacerCarga` | §8.4 | Una regla, tres llamadas; el tercero es fácil de olvidar | Regla de negocio 1 y 2 |
| F13B-DC9 | Los cuatro firmantes nacen acusados por firma solo si están en la audiencia; quien publicó también | §9.3 | Manejaron el documento; un aprobador sin procesos no recibe fila | Práctica |
| F13B-DC10 | Los acuses pendientes pasan a `superado` cuando la versión deja de estar vigente; a `retirado` cuando la persona se desactiva o pierde la visibilidad; no cuentan en el porcentaje | §9.3 | Lo que hay que leer es la versión vigente; un inactivo no debe hundir el porcentaje | Práctica |
| F13B-DC11 | «Lectura obligatoria al ingresar» apagada por defecto | §9.2 | Encendida en todo, cada persona nueva recibiría decenas de tareas | Práctica |
| F13B-DC12 | La tarea de acuse sin control de cambios muestra «Versión N, vigente desde…» | §9.4 | Las versiones cargadas o heredadas no lo tienen | Práctica |
| F13B-DC13 | La evidencia de la jornada es recomendada, no obligatoria; la pantalla marca «Sin acta adjunta» | §10.2 | El registro con asistentes ya es evidencia; exigir el archivo haría que no se registre | ISO 7.2 d) |
| F13B-DC14 | Anular una jornada revierte los acuses que concedió | §10.2 | Un acuse no puede apoyarse en una jornada anulada | ISO 7.5.3.1 b) |
| F13B-DC15 | Sin entidad «ronda»: el porcentaje actual sale de la última verificación de cada punto activo | §11.1 | Más simple y siempre al día; el histórico se filtra por fechas | Práctica |
| F13B-DC16 | El Admin SGC único puede verificar su propio punto, con marca visible | §6.3 | No trabar una instalación con un solo Admin SGC | Práctica (spec maestro DC9) |
| F13B-DC17 | Un punto con copias vivas no se desactiva; un usuario responsable de puntos activos no se desactiva hasta reasignarlos | §7 | Una tarea de recogida sin dueño rompe la cadena del PC-08 | Práctica |
| F13B-DC18 | Crear un punto desde un subproceso del mapa, como atajo sin vínculo permanente | §7 | Los servicios ya están escritos en el mapa | Práctica |
| F13B-DC19 | «Distribución» visible también al responsable de un punto, limitada a sus puntos | §13.1 | Un responsable con rol consulta debe llegar a sus copias | Práctica (F13A-DC19) |
| F13B-DC20 | `archivos` con `contexto` y `contexto_id`, `version_id` opcional y `CHECK`; filas heredadas intactas | §14.1 | Una sola tabla y un solo flujo de subida | Spec maestro §5.5 |
| F13B-DC21 | Revisión de vencimientos por versión para los acuses y un aviso por jefe | §12.3 | Una publicación a 40 personas no debe ser 40 transacciones ni 40 avisos al mismo jefe | Práctica |
| F13B-DC22 | «Mis tareas» agrupa por tipo cuando hay muchas | §12.1 | Que una publicación masiva no entierre las demás tareas | Práctica |
| F13B-DC23 | La verificación abierta se puede descartar con motivo, sin cerrarla | §11.3, §21 | Una abierta por punto no debe trabar la siguiente | Práctica |
| F13B-DC24 | Ventana de impresión de 15 minutos tras emitir o reimprimir, con un solo evento `impresa` por ventana; las descargas de quien solo ve quedan como `consultada` | §8.2 | La emisión redirige a un `GET` que el navegador repite; «reimprimir exige motivo» debe cumplirse en el servidor | Práctica |
| F13B-DC25 | Los hallazgos y la recogida en verificación ocurren al cerrar; la foto se adjunta al ítem | §11.4 | Un ítem corregido antes de cerrar no deja hallazgos huérfanos; la evidencia se escribe una vez | ISO 7.5.3.1 b) |
| F13B-DC26 | Un acuse pendiente se retira al salir de la audiencia, evaluado por diferencia al editar la persona, la lista o el documento | §9.3 | La audiencia es quién debe conocer el documento hoy; el porcentaje no arrastra a quien ya no pertenece | ISO 7.5.3.2 a) |
| F13B-DC27 | El responsable nuevo de un punto con copias vivas de un restringido debe poder verlo; anular una copia lo hace quien la emitió o quien gestiona | §7, §8.3 | Misma regla de la emisión; permiso de matriz más condición de persona | ISO 7.5.3.1 b) |

## Apéndice A — Evidencia de los puntos de control que cubre esta entrega

| Punto de control | Criterio del procedimiento | Evidencia en el sistema |
|---|---|---|
| PC-08 Maestro actualizado y obsoleto controlado (parte física) | «retirado del punto de uso» | La copia pasa a «por recoger» en la transacción que obsoleta o anula la versión; recogida confirmada con destino y fecha; verificación que la encuentra la cierra |
| PC-09 Trazabilidad de distribución y divulgación | «quién, dónde, qué versión, fecha y firma/confirmación; comunicación enviada y evidencia de socialización» | Copia con número, punto, responsable, versión, huella, fecha de emisión y recibido confirmado; audiencia resuelta al publicar con aviso a cada persona; acuses con fecha y hora, individuales o por asistencia; jornadas con asistentes y evidencia adjunta |
| PC-10 Conformidad en puntos de uso | «resultado documentado; ≥ 95 % de puntos conformes; sin documentos no controlados o con plan de corrección inmediato» | Verificaciones cerradas e inmutables con cada ítem; porcentaje contra el umbral; hallazgos con «retirado en el acto», responsable, fecha y cierre |
