# Capítulo 9. Planes de mejoramiento: hallazgos, acciones y verificación

Cuando algo no sale como lo pide un requisito, el hospital no lo esconde: lo registra, lo corrige,
busca por qué pasó, planea qué hacer para que no vuelva a pasar, lo hace, verifica que se hizo y,
después de un tiempo, comprueba que funcionó. Ese camino es un **hallazgo** con su **plan de
mejoramiento**, y es lo que piden el procedimiento SGC-PR-03 y la cláusula 10.2 de ISO 9001. Este
capítulo explica cómo se reporta y se registra un hallazgo, cómo avanza por cada paso, quién hace
cada cosa y qué formato del hospital reemplaza cada pantalla.

Antes de seguir, vea el Capítulo 3 (la barra lateral, **Mis tareas** y la campana) y el Capítulo 1
(la clave con que se firma). Las secciones 1 y 2 sirven a todos; las demás, a quien interviene en
cada paso.

## 1. Qué es un hallazgo y quién lo ve

### 1.1 Las ideas en una página

- **Hallazgo:** lo que se encontró, con su código `HZ-AAAA-NNN` (el año del registro y un
  consecutivo: `HZ-2026-014`). El código no se reutiliza nunca, tampoco el de un hallazgo rechazado
  o anulado.
- **Clase:** **No conformidad** (no se cumple un requisito), **Observación** (podría llegar a no
  cumplirse) u **Oportunidad de mejora** (algo que se puede hacer mejor). Solo la no conformidad
  lleva **criticidad**: **Alta** (seguridad del paciente, cumplimiento legal o continuidad del
  servicio), **Media** o **Baja**.
- **Origen:** de dónde salió (una auditoría interna, una PQRSF, un indicador, un ente de control…).
  Son catorce, fijos (sección 3.2).
- **Corrección:** lo que se hizo de inmediato para contener el problema. Solo en la no conformidad.
- **Acción correctiva:** lo que se hace para que no vuelva a pasar. Una no conformidad la lleva
  siempre si es de criticidad alta, si es reincidente o si su origen es externo; si no, la decide el
  Administrador del SGC.
- **Causa raíz:** por qué pasó, con un método (5 porqués o Ishikawa). La no conformidad la exige.
- **Plan de acción:** las **acciones** (A1, A2…), cada una con sus **actividades** (A1.1, A1.2…),
  y cada actividad con su responsable, su inicio y su fin. El plan se firma: **Elaboró**, **Revisó**
  y, cuando aplica, **Aprobó**.
- **Ronda:** cada intento de resolver el hallazgo. La ronda 1 nace con él. Si el plan no fue
  eficaz, se abre la ronda 2, con su propio análisis y su propio plan, y la ronda 1 queda congelada
  a la vista.
- **Verificar la implementación:** comprobar, actividad por actividad, que lo planeado se hizo.
- **Evaluar la eficacia:** comprobar, después de un tiempo, que el problema no volvió (o que el
  indicador mejoró). Se firma **Verificó**. Cerrar se firma **Cerró**.
- **Quien ejecuta no verifica:** quien fue responsable de una actividad, registró un seguimiento,
  terminó una actividad o registró la corrección no puede verificar ni evaluar ese hallazgo. No hay
  excepción.
- **Días hábiles:** los plazos de este módulo se cuentan de lunes a viernes, sin los festivos de
  Colombia ni los días que la entidad declare no hábiles (sección 10).
- **Reporte:** lo que cualquier persona del hospital envía cuando ve algo que podría ser una no
  conformidad. No es un hallazgo hasta que el Administrador del SGC lo convierte (sección 2).

### 1.2 Dónde está cada cosa

- **Mejoramiento**, en la barra lateral, en su propio grupo **Mejoramiento**, para toda persona con
  cuenta. Tiene las pestañas **Hallazgos** (para quien ve alguno o puede registrarlos), **Reportes
  recibidos** (Administrador del SGC, Gerencia y Control Interno), **Mis actividades** y **Mis
  reportes** (para todos).
- **Mis tareas**, en **Inicio**: aceptar, corregir, formular, revisar, aprobar, ejecutar su
  actividad, verificar, evaluar, cerrar, decidir un ajuste, clasificar un reporte.
- **Configuración de mejoramiento**, en el grupo **Administración**, solo para el Administrador del
  SGC (sección 10.3).
- En la búsqueda (`Ctrl K` y **Buscar documentos**), el grupo **Hallazgos**: por código o por
  título, solo los que usted puede ver.

### 1.3 Quién ve qué

| Quién | Qué ve |
|---|---|
| Administrador del SGC, Gerencia y Control Interno | Todos los hallazgos, completos, con todos sus archivos |
| Líder de proceso | Los hallazgos de sus procesos, completos |
| Quien registró un hallazgo | Ese hallazgo, completo |
| Responsable de una actividad | El hallazgo de su actividad, en texto (identificación, corrección, análisis, plan y estado). De los archivos, **solo los de su actividad** |
| Quien envió un reporte | Su reporte y en qué va («Recibido», «En trámite», «Cerrado» o «Descartado»); nunca el código ni el contenido del hallazgo |
| Cualquier otra persona | Nada: su dirección dice «Página no encontrada» |

Para quien no puede ver un hallazgo, ese hallazgo no existe: no sale en la lista, en la búsqueda,
en las cifras, en el Excel, en los avisos ni en un mensaje de error. Al líder y a los responsables,
un hallazgo que nació de un reporte les dice «Reportado por un funcionario»: el nombre de quien
reportó lo ven solo el Administrador del SGC, Gerencia y Control Interno. Así se cuida que reportar
no tenga consecuencias para quien reporta.

### 1.4 La lista

Barra lateral → **Mejoramiento** → **Hallazgos**. Arriba, seis cifras que son a la vez filtros:
**Abiertos**, **Con algo vencido** (alguna actividad vencida), **Esperan su decisión** (los que le
toca mover a usted), **En espera de eficacia**, **Por evaluar la eficacia** y **Reabiertos**.
Debajo, los filtros: **Buscar** (código o título), **Proceso**, **Origen**, **Clase**,
**Criticidad**, **Estado** y **Solo vencidos**; **Filtrar** los aplica y **Quitar** los borra.

| Columna | Qué dice |
|---|---|
| **Código** | `HZ-…` |
| **Hallazgo** | El título, la clase y las marcas: **Prioridad alta** (origen externo), **Reabierto · ronda N**, **Reincidente**, **Cargado** (sección 11) y **Con algo vencido** |
| **Proceso**, **Origen**, **Criticidad** | Lo que dice su identificación |
| **En qué va** | El estado y quién tiene el turno («Formular la causa raíz y el plan · la líder del proceso») |
| **Avance** | El promedio del avance de las actividades, una vez aprobado el plan |
| **Vence** | La fecha del paso en curso, «quedan N días hábiles» o «Vencido hace N días» |

**Excel** baja la lista con los filtros que tenga puestos (sección 12) y **Registrar hallazgo**
abre el registro (sección 3). En un teléfono, cada fila es una tarjeta.

### 1.5 La página de un hallazgo

Pulse el código o el título. Arriba, el código, la clase, la criticidad y las marcas, el título y una
línea con el proceso, la fuente y quién lo registró; el botón **Imprimir** (sección 12). Debajo, el
**recorrido**: los pasos de ese hallazgo (Registro, Aceptado, Corrección, Decisión, Causa raíz, Plan
aprobado, Ejecución, Verificación, Eficacia y Cierre, o los del camino corto, sección 5) con su
fecha, el paso en que va y los que faltan.

Después, una sección por etapa, en el orden del formato SGC-FO-AC-01: **1. Identificación**,
**2. Corrección o contención**, **3. Causa raíz**, **4. Plan de acción**, **5. Seguimiento**,
**6. Verificación de eficacia** y **7. Cierre**. Las hechas se pliegan con su resumen en una línea;
la actual queda abierta; las que faltan no aparecen. Una ronda anterior aparece plegada con su
número y su resultado, por ejemplo **Ronda 1 · no eficaz**.

A la derecha (abajo, en un teléfono):

- **Lo que sigue:** lo que le toca hacer a usted, con su botón, o quién tiene el turno.
- **Fechas:** **Plan formulado** (y si fue a tiempo), **Cierre previsto** y **Reprogramaciones**.
- **Enlaces:** el hallazgo del que es reincidencia, el documento, el indicador, la norma. Lo que
  usted no puede ver sale sin nombre y sin enlace («un indicador»).
- **Ocurrencias:** las veces que el mismo problema volvió a pasar mientras el hallazgo seguía
  abierto (sección 3.4).
- **Historial:** cada paso, con quién y cuándo. Solo para quien ve el hallazgo completo.

## 2. Reportar una posible no conformidad

Cualquier persona con cuenta puede avisar de algo que vio: un formato desactualizado en un
consultorio, una nevera sin registro de temperatura, una muestra mal rotulada. No hace falta saber
de qué clase es ni a qué requisito falta: eso lo decide el Administrador del SGC.

### 2.1 Enviar el reporte

Barra lateral → **Mejoramiento** → **Mis reportes** → **Reportar**. Si usted no ve ningún hallazgo
ni puede registrarlos, **Mejoramiento** lo lleva directo a **Mis actividades** (si tiene alguna) o a
**Mis reportes**. La pantalla **Reportar una posible no conformidad** pide:

| Campo | Qué escribir |
|---|---|
| **¿Qué vio?** | Lo que pasó, dónde y cuándo, en sus palabras (de 10 a 2.000 caracteres) |
| **¿Cuándo lo vio?** | La fecha, de hoy hacia atrás |
| **¿En qué proceso?** | Si lo sabe; si no, déjelo en «No sé» |
| **Referencia del caso (si aplica)** | El radicado de la PQRSF o el código del evento, si lo tiene |

> **No escriba nombres ni documentos de pacientes o de quien se quejó. Use el número del caso.**
> El aviso está en todo formulario de este módulo. Si se refiere a una queja o a un evento adverso,
> escriba su radicado («PQRSF-2026-118», «EA-2026-031»), nunca el nombre ni el número de
> documento de una persona.

**Enviar el reporte.** El SGC le muestra **Lo que reportó** y le deja adjuntar hasta tres archivos
de evidencia (una foto, un PDF, un Excel; hasta 25 MB cada uno) mientras nadie lo ha clasificado.
Enviado, no se edita: si se equivocó, envíe otro.

### 2.2 Seguir lo que reportó

**Mis reportes** lista lo que usted envió, del más reciente al más antiguo, con su etiqueta:

| Etiqueta | Qué significa |
|---|---|
| **Recibido** | El Administrador del SGC todavía no lo clasifica (tiene 3 días hábiles) |
| **En trámite** | Se convirtió en un hallazgo, o se añadió a uno abierto, y ese hallazgo sigue su curso |
| **Cerrado** | El hallazgo terminó |
| **Descartado** | No era una no conformidad; se ve el motivo |

Recibe un aviso en la campana cuando lo clasifican y cuando el hallazgo termina. Nunca ve el código,
el título ni el contenido del hallazgo: lo que se analiza y se decide es del proceso.

### 2.3 Clasificar los reportes (Administrador del SGC)

**Mejoramiento** → **Reportes recibidos** (el número junto a la pestaña dice cuántos esperan). Cada
reporte dice qué se vio, cuándo, en qué proceso, quién lo reportó y sus archivos. Tiene tres
salidas:

- **Convertir en hallazgo:** abre el registro (sección 3) con lo del reporte ya copiado; usted
  completa la clase, el origen y lo demás. El plazo de formular cuenta desde la conversión.
- **Añadir como ocurrencia:** de un hallazgo abierto que ya trata ese problema. La pantalla sugiere
  los parecidos; también puede escribir el **Código del hallazgo abierto**.
- **Descartar:** con el motivo (al menos 10 caracteres). Quien reportó lo lee en **Mis reportes**.

Nada se borra: el reporte queda con su clasificación y su historia.

## 3. Registrar un hallazgo (clases, orígenes, parecidos y reincidencia)

Registran el Administrador del SGC, Control Interno y los líderes (estos, solo en sus procesos).
**Mejoramiento** → **Registrar hallazgo**.

### 3.1 El formulario

| Campo | Regla |
|---|---|
| **Clase** | No conformidad, Observación u Oportunidad de mejora |
| **Origen** | Uno de los catorce (sección 3.2) |
| **Fuente: qué auditoría, visita o caso** | Una frase («Auditoría interna de cadena de frío»). Obligatoria |
| **Referencia del caso** | Obligatoria en «PQRSF» y en «Evento adverso o seguridad del paciente» |
| **Fecha en que se detectó** | De hoy hacia atrás |
| **Proceso** y **Subproceso (opcional)** | El líder solo ve sus procesos |
| **Criticidad** | Solo en la no conformidad: Alta, Media o Baja |
| **Título** | Una frase de hasta 150 caracteres: es como se nombra el hallazgo en las listas, las tareas y los avisos |
| **Descripción, con la evidencia objetiva** | Lo que se encontró, con lo que lo demuestra |
| **Requisito incumplido** | **Cláusula o requisito** (por ejemplo «ISO 9001: 8.5.1»), **Norma del normograma** o **Documento interno**. En la no conformidad, al menos uno |
| **Indicador al que se refiere (opcional)**, **Medición (opcional)** | Un indicador activo o retirado, y un periodo que ya tenga resultado |
| **Riesgo asociado (opcional)** | El código y el nombre del riesgo en la matriz del proceso |
| **Fecha límite de respuesta al ente** | Solo en los orígenes externos; obligatoria en «Ente de control» |

Antes de guardar, el formulario dice lo que va a pasar, sin que usted lo marque: «Llevará acción
correctiva y lo aprobará Gerencia.» (criticidad alta, reincidencia u origen externo) o «Este
hallazgo no se puede rechazar y lo aprobará Gerencia.» (origen externo). **Registrar el hallazgo**
lo guarda, le da su código y avisa a quien tiene el turno.

Dónde nace:

| Quién registra | Origen | Nace en |
|---|---|---|
| Administrador del SGC o Control Interno | Interno | **Por aceptar**: el líder del proceso lo acepta o lo rechaza |
| Un líder de ese proceso | Interno | Aceptado |
| Cualquiera que pueda registrar | Externo | Aceptado |
| Administrador del SGC o Control Interno | Interno, en un proceso sin líder activo | Aceptado: lo que le toca al líder lo hace el Administrador del SGC |

«Aceptado» lleva a **Por corregir** en la no conformidad y a **Por formular** en la observación y la
oportunidad de mejora.

### 3.2 Los catorce orígenes

Auditoría interna, Control Interno, Revisión por la dirección, PAMEC, Autoevaluación, Indicador,
PQRSF, Evento adverso o seguridad del paciente, Riesgo materializado, Satisfacción del usuario,
Control documental, Otro (la fuente dice cuál), y los dos **externos**: Auditoría externa y Ente de
control.

Un hallazgo de origen externo no se rechaza (se responde), lleva siempre plan de acción, lo aprueba
Gerencia, sale primero en la lista con la marca **Prioridad alta** y avisa también a Gerencia y al
Administrador del SGC. Con la fecha del ente, el plazo de formular sale de esa fecha (sección
10.2). Si el ente retira el hallazgo, se anula (sección 3.5).

### 3.3 Los parecidos y la reincidencia

Mientras usted escribe el título y la descripción, a la derecha aparecen los parecidos del proceso
(**Parecidos en Consulta Externa**, por ejemplo): hasta cinco hallazgos de ese mismo proceso que se
le parecen, abiertos o cerrados. Si alguno es lo mismo, elija una de las tres salidas:

1. **Es el mismo problema de HZ-…, que está abierto: se añade como ocurrencia**. No nace otro
   hallazgo: la fecha y la descripción del formulario quedan como una ocurrencia del que ya existe.
2. **Es reincidencia de HZ-…, que está cerrado**. El hallazgo nuevo queda enlazado al anterior,
   lleva la marca **Reincidente** y exige acción correctiva. Al formular, el SGC le muestra cómo se
   analizó y se resolvió la vez pasada.
3. **Es distinto: se registra como un hallazgo nuevo**.

Evitar el duplicado importa: dos hallazgos del mismo problema reparten la evidencia y cuentan dos
veces en el informe.

### 3.4 Las ocurrencias

Si el mismo problema vuelve a pasar mientras el hallazgo sigue abierto, no se registra otro: en la
página del hallazgo, **Ocurrencias** → **Añadir una ocurrencia** (fecha y descripción). Avisa a los
líderes del proceso y al Administrador del SGC; si el hallazgo está en espera de eficacia, avisa
además a quienes pueden verificarlo, y la evaluación la muestra. Una ocurrencia no se borra. Lo que
vuelve a pasar después del cierre no es una ocurrencia: es un hallazgo reincidente.

### 3.5 Editar, reclasificar, cambiar el proceso y anular

- **Editar:** mientras está **Por aceptar**, quien lo registró corrige cualquier campo, salvo el
  código.
- **Reclasificar** (solo el Administrador del SGC, con justificación): la clase, la criticidad, el
  origen con su fuente, el título, el requisito y la reincidencia, hasta que se envía el plan de la
  ronda 1. La descripción no se reescribe: se le añade una nota. Reclasificar puede cambiar el paso
  (por ejemplo, una observación que pasa a no conformidad vuelve a **Por corregir**).
- **Cambiar proceso** (Administrador del SGC): solo mientras está **Por aceptar**; avisa a los
  líderes del proceso nuevo.
- **Anular** (Administrador del SGC, con justificación): un registro hecho por error, un duplicado,
  un hallazgo que el ente retiró. Queda **Anulado**, con su código y su historia, y no cuenta en
  ningún cálculo.

## 4. El recorrido, paso a paso, y qué formato del hospital reemplaza cada pantalla

### 4.1 Los pasos y quién tiene el turno

| En qué va | Quién tiene el turno | Qué hace | Plazo |
|---|---|---|---|
| **Por aceptar** | Los líderes del proceso | Acepta o rechaza | 3 días hábiles |
| **Rechazado · por decidir** | Quien lo registró | Lo retira o lo sostiene | 3 |
| **En arbitraje** | El Administrador del SGC (Gerencia, si un Administrador del SGC lo registró o lo sostuvo) | Confirma el hallazgo o el rechazo | 3 |
| **Por corregir** | Los líderes del proceso | Registra la corrección (sección 5) | 3 |
| **Por decidir** | El Administrador del SGC | Decide si requiere acción correctiva | 3 |
| **Por validar la corrección** o **Por validar el cierre sin acción** | Quien puede validar | Valida o devuelve | 3 |
| **Por formular** | Los líderes del proceso | Analiza la causa y arma el plan (secciones 6 y 7) | 10, desde el registro |
| **En revisión** | El Administrador del SGC | Revisa y firma «Revisó», o devuelve | 3 |
| **En aprobación** | Gerencia | Firma «Aprobó», o devuelve | 3 |
| **En ejecución** | Los responsables de las actividades | Hacen y registran su avance (sección 8) | Las fechas del plan |
| **Por verificar** | Quien puede verificar | Verifica la implementación (sección 9) | 5 |
| **En espera de eficacia** | Nadie: se espera a que el plan muestre su efecto | — | Hasta la fecha mínima |
| **Por evaluar la eficacia** | Quien puede verificar | Evalúa y firma «Verificó» | 5 |
| **Por cerrar** | El Administrador del SGC | Escribe las lecciones aprendidas y firma «Cerró» | 3 |
| **Cerrado · eficaz**, **Cerrado con corrección**, **Cerrado sin acción**, **Rechazado**, **Anulado** | — | Terminó: ya no cambia | — |

Si el proceso no tiene líder activo, lo que le toca al líder lo hace el Administrador del SGC.
Cada paso avisa a quien recibe el turno y aparece en su **Mis tareas**; al vencer, la campana lo
dice y, a los días de escalamiento de **Configuración documental** (3, por omisión), se avisa a su
jefe, sin el contenido del hallazgo.

### 4.2 Aceptar, rechazar y arbitrar

El líder, en **Lo que sigue**: **Aceptar el hallazgo** o **Rechazar el hallazgo**, con **Por qué lo
rechaza (al menos 10 caracteres)**. Un hallazgo de origen externo no se rechaza. Rechazado, quien lo
registró lo **retira** (queda **Rechazado**; retirarlo no pide una razón propia, y el historial
conserva la justificación del rechazo) o lo **sostiene** con su réplica. Sostenido, lo arbitra el Administrador del SGC, o Gerencia si un
Administrador del SGC fue quien lo registró o lo sostuvo: nadie arbitra lo que ya defendió.
**Registrar el arbitraje** confirma el hallazgo (sigue como aceptado, con los 10 días de formular
contados desde el arbitraje) o confirma el rechazo, con una nota y, si se quiere, el acta del
Comité. Es definitivo. La campana avisa el resultado a quien lo registró y, si se confirmó el
rechazo, también a los líderes del proceso (si el hallazgo sigue, ellos reciben su turno); un retiro
se avisa a los líderes. Los avisos llevan el código y el título, nunca la nota.

### 4.3 Qué formato del hospital reemplaza cada pantalla

| Pantalla de la plataforma | Formato del hospital |
|---|---|
| La lista de **Hallazgos**, con su Excel | La matriz SGC-MZ-AC-01 y la matriz consolidada del SGC-FO-28 |
| **Reportar una posible no conformidad** y **Reportes recibidos** | La regla 1 del SGC-PR-03: toda no conformidad se registra |
| **Registrar hallazgo** y la sección **1. Identificación** | SGC-FO-AC-01, sección 1 |
| **2. Corrección o contención** | SGC-FO-AC-01, sección 2 |
| La pestaña **5 porqués** del análisis | SGC-FO-AC-02 |
| La pestaña **Ishikawa (6M)** del análisis | SGC-FO-AC-03 |
| **Causas raíz** y las dos preguntas | SGC-FO-AC-01, sección 3, y la conclusión del SGC-FO-AC-02 y 03 |
| **4. Plan de acción**, con sus firmas | SGC-FO-AC-01, sección 4, y las filas del SGC-FO-14 |
| La página de **Mis actividades** y sus seguimientos | SGC-FO-AC-01, sección 5, y el seguimiento del SGC-FO-14 |
| Verificar y evaluar (**6. Verificación de eficacia**) | SGC-FO-AC-01, sección 6 |
| **7. Cierre** | SGC-FO-AC-01, sección 7 |

El Pareto (SGC-FO-AC-04), el plan consolidado por proceso (SGC-FO-14) y el informe trimestral
(SGC-FO-28) llegan con las entregas siguientes de esta fase.

## 5. La corrección y el camino corto (incluido «Cerrado sin acción»)

### 5.1 Registrar la corrección

Solo en la no conformidad. La registra un líder del proceso (o el Administrador del SGC, si no hay
líder) en la sección **2. Corrección o contención**:

- **«Sí»** a **¿Requirió corrección?**: **Qué se hizo (al menos 10 caracteres)**, el
  **Responsable** (un usuario o, si no tiene cuenta, deje «Sin cuenta» y escriba su nombre), la
  **Fecha en que se implementó** y **al menos un archivo de evidencia**, que se sube en la misma
  sección antes de registrar.
- **«No»**: **Por qué no requiere corrección inmediata (al menos 10 caracteres)**.

**Registrar la corrección.** Si la acción correctiva es obligada (criticidad alta, reincidente o
externo), el hallazgo pasa directo a **Por formular**; si no, a **Por decidir**.

### 5.2 La decisión

El Administrador del SGC, en **Lo que sigue**: **¿Requiere acción correctiva?**, con su
**Justificación** y, si se quiere, el número y la fecha del acta del Comité. **Registrar la
decisión.** «Sí» lleva a **Por formular**; «No», al camino corto.

### 5.3 El camino corto: «Cerrado con corrección» y «Cerrado sin acción»

Con el «no», no hay plan: alguien que no participó valida lo hecho.

- **Hubo corrección:** el hallazgo queda **Por validar la corrección**. La valida el Administrador
  del SGC o Control Interno que no la registró ni fue su responsable (Gerencia solo si ninguno de
  ellos puede). **Validar la corrección** lo deja **Cerrado con corrección**; **Devolver la
  corrección**, con una nota, lo devuelve a **Por corregir**, y la corrección nueva pide un archivo
  de evidencia nuevo.
- **No hubo corrección:** el hallazgo queda **Por validar el cierre sin acción**: se validan las dos
  justificaciones, la de no corregir y la de no requerir acción. No puede validarlo quien escribió
  el «no requiere corrección» **ni quien decidió el «no»**. **Validar el cierre sin acción** lo deja
  **Cerrado sin acción**.
- Los dos cierres avisan, como el cierre eficaz, a los líderes del proceso, a quien lo registró y a
  Gerencia: «Se cerró HZ-…: cerrado con corrección» o «…: cerrado sin acción».
- **Exigir la acción correctiva:** mientras espera la validación, el Administrador del SGC o
  Gerencia pueden cambiar el «no» por «sí», con su justificación: el hallazgo pasa a **Por
  formular**, con sus 10 días contados desde ese momento.

La observación y la oportunidad de mejora no pasan por la corrección ni por la decisión: aceptadas,
van a **Por formular**.

## 6. La causa raíz

### 6.1 Formular

El líder del proceso, desde **Lo que sigue** → **Formular el análisis y el plan**. La pantalla tiene
dos partes, **Causa raíz** y **Plan de acción**, que se guardan como borrador las veces que haga
falta y **se envían juntas**. En la no conformidad el análisis es obligatorio; en la observación y la
oportunidad de mejora, opcional.

### 6.2 Los métodos

Elija el método en sus pestañas; puede hacer más de un análisis (**Añadir un análisis con otro
método**). Cada uno lleva el **Equipo que hizo el análisis** y sus **Observaciones**.

- **5 porqués:** un porqué por nivel, cada uno con su respuesta y, si la tiene, su evidencia
  («Planilla del mes»). No siempre hacen falta los cinco: deténgase en una causa sobre la que se
  pueda actuar. **Quitar el último nivel** quita uno.
- **Ishikawa (6M):** las causas posibles en sus seis categorías (Mano de obra, Método, Máquina o
  equipo, Material, Medición y Medio ambiente). Marque las confirmadas y, de cada confirmada, su
  impacto (Alto, Medio o Bajo) y si requiere acción. Se dibuja el diagrama.
- **Otro método:** su nombre y su descripción; los adjuntos van en **Adjuntos del análisis**.

El Pareto llega en la entrega 15C. **Guardar el análisis** deja el borrador.

### 6.3 Las causas raíz y las dos preguntas

Debajo de los métodos, lo común a todos:

- **Causas raíz:** una frase por causa («El procedimiento de cadena de frío no asigna el registro de
  temperatura al turno de noche»). **Guardar las causas.** Cada acción correctiva dirá qué causa
  ataca; una causa sin acción necesita su justificación.
- **¿Hay no conformidades similares en otros procesos?** y **¿Se requieren cambios en documentos,
  riesgos o controles?** Si marca un cambio, descríbalo: al cerrar se pedirá decir cómo se atendió.
  **Guardar las respuestas.**

Si el hallazgo es **Reincidente**, el SGC le muestra, sin que lo pida: «Este hallazgo reincide: así
se analizó y se resolvió el anterior.», con sus causas y sus acciones. Úselo: si la vez pasada la
acción fue una charla y volvió a pasar, la causa era otra.

## 7. El plan de acción y sus firmas

### 7.1 Las acciones y las actividades

En **Plan de acción**, una tarjeta por acción:

| Campo | Regla |
|---|---|
| **Tipo de acción** | Correctiva, Preventiva o De mejora. El SGC propone el de la clase; una no conformidad lleva al menos una correctiva |
| Qué se va a hacer | La descripción de la acción |
| Causas que ataca | Obligatoria en la correctiva |
| **Recursos necesarios**, **Indicador de cumplimiento**, **Meta** | Opcionales: cómo se sabrá que la acción se cumplió |
| Las actividades | Cada una con su descripción, su **Responsable** (cualquier usuario activo, aunque no lidere el proceso), su **Inicio** y su **Fin**, de hoy en adelante |

**Añadir otra actividad** y **Añadir otra acción** aparecen cuando hacen falta: el caso simple es
una acción con una actividad.

### 7.2 El criterio de eficacia

**Criterio de eficacia:** cómo se sabrá que las acciones fueron eficaces, uno o más de **No
recurrencia**, **Mejora del indicador asociado** (con el indicador, uno activo que usted pueda
ver), **Reducción de PQRS o eventos** u **Otro** (con su descripción). En la observación y la
oportunidad de mejora, además, la **Fecha de evaluación**, no anterior al fin de la última
actividad. Debajo, el SGC dice desde cuándo se podrá evaluar con ese plan («Con este plan, la
eficacia se podría evaluar desde…», sección 9.3). **Guardar el criterio.**

### 7.3 Enviar y firmar

Arriba, el SGC lista lo que falta («Falta esto:»), o dice que el análisis y el plan tienen todo lo
que se pide. **Enviar a revisión** (o **Enviar a aprobación**, si no hay quien revise) pide su
clave: es la firma **Elaboró**. Desde ahí el plan no se edita.

| Firma | Quién | Cuándo |
|---|---|---|
| **Elaboró** | Quien formula | Al enviar |
| **Revisó** | El Administrador del SGC que no lo elaboró | Al revisarlo |
| **Aprobó** | Gerencia | Cuando aplica (abajo) |

**Revisar** (Administrador del SGC): la pantalla le muestra el plan, las causas sin acción, los
hallazgos parecidos de **otros** procesos y, si es reincidente, lo que se hizo la vez pasada.
Marca, si es el caso, **Requiere recursos adicionales o tiene impacto institucional**, con su nota.
**Firmar la revisión** (con clave) o **Devolver con observaciones**: vuelve a **Por formular**, con
5 días hábiles para reenviarlo y una firma «Elaboró» nueva.

**Gerencia aprueba** cuando se cumple cualquiera de cuatro condiciones: la no conformidad es de
criticidad alta; el origen es externo; el revisor marcó «requiere recursos o tiene impacto»; o lo
elaboró un Administrador del SGC (porque el proceso no tiene líder). Si no se cumple ninguna, la
revisión vale como aprobación. Cuando lo elabora un Administrador del SGC, lo revisa otro; si no hay
otro activo, pasa directo a Gerencia. **Aprobar el plan** (con clave) o **Devolver el plan**.

Al quedar aprobado, el plan se congela tal como se firmó, cada actividad guarda su **fecha de fin
original** (que no cambia nunca), se calcula el **cierre previsto** y cada responsable recibe su
actividad («Tiene una actividad a su cargo»).

## 8. Mi actividad: seguimientos, evidencia y ajustes

### 8.1 Mis actividades

**Mejoramiento** → **Mis actividades**, o la tarea en **Mis tareas**. Usted no necesita liderar el
proceso: si es responsable de una actividad, la ve con el hallazgo al que pertenece. La pantalla
está pensada para el teléfono: qué hay que hacer, de qué acción y hallazgo es, su fin, su avance y
si está vencida («Vencida hace N días»).

### 8.2 Registrar un seguimiento

**Registrar seguimiento:** la **Fecha**, **Qué se hizo (al menos 10 caracteres)**, el **Avance (%)**
y, si las hay, las **Barreras (opcional)**. **Guardar seguimiento.** El avance no puede bajar del
seguimiento anterior. Un seguimiento no se borra ni se edita: uno equivocado se corrige con otro.
Si pasan 15 días (en una no conformidad de criticidad alta) o 30 (en las demás) sin un seguimiento,
el SGC se lo recuerda.

Suba la evidencia en la zona de carga de la actividad: un PDF, una imagen o un Excel, de hasta
25 MB. Como responsable, usted abre los archivos de su actividad, pero no los del registro del
hallazgo ni los de otras actividades.

### 8.3 Terminar

**Terminar** pide el avance en 100 % y **al menos un archivo de evidencia**; sin ellos, el SGC dice
qué falta. **Sí, terminarla** la cierra. Cuando termina la última actividad de la ronda, el hallazgo
pasa solo a **Por verificar**.

Si quien verifica le devuelve la actividad, la ve **Devuelta**, con su nota y la fecha para
corregirla. Para terminarla otra vez hace falta un seguimiento y un archivo nuevos, posteriores a la
devolución: «Registre un seguimiento de lo que corrigió antes de terminarla».

### 8.4 Pedir un ajuste de fecha, y los demás ajustes

Un plan aprobado solo cambia por un **ajuste**, con su causa:

- El responsable: **Pedir ajuste de fecha** en su actividad, con la **Fecha nueva** (de hoy en
  adelante) y la **Causa del retraso (al menos 10 caracteres)**. La **Fecha original** se conserva
  siempre.
- El líder del proceso o el Administrador del SGC, además, desde la página del hallazgo, **Pedir un
  ajuste** del plan: **Pedir que se añada** una actividad (en una acción del plan o en una acción
  nueva) o **Pedir que se cancele** una sin terminar (no la última).

Lo decide quien aprobó el plan (Gerencia, si lo aprobó Gerencia; si valió la revisión, un
Administrador del SGC), en 3 días hábiles: **Aprobar el ajuste** o **Negar el ajuste**, con su nota.
Quien pide no decide. **Mientras se decide, la actividad sigue contando como vencida**: el ajuste no
la saca del vencimiento hasta que se aprueba. Una fecha nueva que ya pasó no se aprueba: se niega y
se pide otra. Aprobada, la actividad lleva la marca «Reprogramada»; su fecha de fin original no
cambia, y contra ella se juzga si se cumplió a tiempo.

### 8.5 Reasignar y escalar

- **Reasignar la actividad** (líder del proceso o Administrador del SGC): el **Responsable nuevo** y
  el **Motivo (al menos 10 caracteres)**, sin aprobación. Avisa a los dos.
- **Escalar a Gerencia** (Administrador del SGC): una actividad vencida, con su nota. Gerencia puede
  **Responder la escalada**, con su nota. No cambia ningún estado: es la «Decisión de la Alta
  Dirección» del informe.

## 9. Verificar, evaluar la eficacia y cerrar

### 9.1 Quién puede verificar

Pueden el Administrador del SGC y Control Interno que **no ejecutaron** en ese hallazgo: no fueron
responsables de ninguna actividad (en ninguna ronda), no registraron seguimientos, no terminaron
actividades, no registraron la corrección ni fueron su responsable. Gerencia, solo si ningún
Administrador del SGC ni Control Interno activo puede. Si nadie puede, el SGC lo dice y no deja: se
resuelve dando el rol a otra persona. Quien solo figuró en un plan que nunca se aprobó no cuenta
como ejecutor.

### 9.2 Verificar la implementación

Con el hallazgo **Por verificar**, **Lo que sigue** → **Ir a verificar** lleva a la sección **5.
Seguimiento**. Marque cada actividad **Conforme** o **Devuelta**; la devuelta lleva su nota (al menos
10 caracteres) y **Corregir a más tardar el** (de hoy en adelante). Marque **Cómo se verificó (al
menos uno)**: Revisión de evidencias, Observación en sitio, Auditoría de seguimiento o Entrevista.
Puede añadir una **Nota de la verificación (opcional)** y archivos. **Guardar la verificación.**

- Con alguna devuelta, esas actividades vuelven a **En proceso** y el hallazgo a **En ejecución**.
- Con todas conformes, el hallazgo pasa a **En espera de eficacia**.

No se verifica mientras haya un ajuste por decidir: decídalo antes.

### 9.3 La espera y la fecha mínima

La eficacia no se mide el día en que termina el plan: hay que esperar a que muestre su efecto. La
**fecha mínima** se cuenta desde el día en que terminó de verdad la última actividad:

- En la no conformidad, **la mayor** de dos: dos meses calendario después y, si el plan enlazó un
  indicador, el día siguiente al segundo periodo completo del indicador. Ejemplo: la última
  actividad termina el 5 de diciembre y el indicador es mensual; los periodos completos que siguen
  son enero y febrero: se evalúa desde el 1 de marzo. Sin indicador, desde el 5 de febrero.
- En la observación y la oportunidad de mejora, la fecha de evaluación del plan, o el día en que
  terminó la última actividad si es posterior.

Mientras tanto la página dice **En espera de eficacia** y «Se puede registrar desde el…». Desde la
fecha mínima dice **Por evaluar la eficacia**, avisa a quienes pueden verificar y les crea la tarea,
que vence 5 días hábiles después (más el plazo de reporte del indicador, si lo hay).

El **cierre previsto** es otra fecha: la que se planeó al aprobar el plan, con las fechas de fin
planeadas. No cambia, y contra ella se mide si el hallazgo se cerró a tiempo.

### 9.4 Evaluar la eficacia

**Lo que sigue** → **Ir a evaluar** lleva a la sección **6. Verificación de eficacia**. La pantalla
muestra, sin que nadie lo busque, el criterio del plan, los resultados del indicador enlazado (desde
dos periodos antes de que terminara el plan hasta el último medido, marcados «antes», «durante» y
«después») y las ocurrencias registradas desde entonces. Registre los **Criterios que evaluó**, el
**Periodo evaluado** (desde y **Hasta**), el **Resultado** y la **Justificación y evidencia objetiva
(al menos 20 caracteres)**.

- **Eficaz** solo se puede marcar desde la fecha mínima; antes, el botón dice desde cuándo. Si hubo
  ocurrencias, pide confirmarlas.
- **No eficaz: se reabre con una ronda nueva**, en cualquier momento de la espera.

**Firmar «Verificó»** (con clave). Lo que la pantalla mostró queda congelado con la evaluación: el
registro dice con qué se decidió. Si quien evalúa es el Administrador del SGC y el resultado es
eficaz, evalúa y cierra en el mismo acto: **Firmar «Verificó» y «Cerró»**, con una sola clave.

Si al verificar encontró un problema **distinto**, regístrelo como otro hallazgo: queda enlazado a
este.

### 9.5 Cerrar y reabrir

- **Eficaz:** el hallazgo queda **Por cerrar**. El Administrador del SGC escribe las **Lecciones
  aprendidas (al menos 10 caracteres)** y, si el análisis pidió cambios en documentos, riesgos o
  controles, **Cómo se atendieron los cambios**. **Firmar «Cerró».** Queda **Cerrado · eficaz** y
  avisa a los líderes del proceso, a quien lo registró y a Gerencia. El visto bueno de Gerencia del
  formato es ese aviso, no una firma.
- **No eficaz:** la ronda queda congelada y a la vista, plegada como **Ronda 1 · no eficaz** (con su
  número), y se abre la siguiente en **Por formular**, con 10 días hábiles. La lista lo marca
  **Reabierto · ronda 2**.

Un hallazgo cerrado, rechazado o anulado no cambia más. Lo que vuelva a pasar es otro hallazgo,
reincidente.

## 10. Los plazos en días hábiles y el calendario de la entidad

### 10.1 Cómo se cuentan

Los plazos de este módulo son **días hábiles**: de lunes a viernes, sin los festivos de Colombia y
sin los días que la entidad declare no hábiles. El día del hecho no cuenta: un plazo de 3 días que
empieza un viernes (o un sábado) vence al final del miércoles siguiente. Los festivos los calcula el
SGC con la regla de la ley, sin consultar internet. La lista y las tareas dicen «quedan N días
hábiles».

Son **días calendario**, en cambio: los recordatorios de seguimiento (15 y 30 días), el aviso al
jefe (escalamiento) y los dos meses de la espera de eficacia. Las fechas de las actividades no son
plazos: las escribe quien formula.

### 10.2 El plazo de formular y la fecha del ente

El plazo de formular (10 días hábiles) se cuenta **desde el registro** y no se corre por lo que
tarden la aceptación, la corrección o la primera decisión: así lo dice el procedimiento. Se cuenta
de nuevo cuando el plan se vuelve exigible por un acto que no depende del líder: el arbitraje, la
exigencia de la acción correctiva después de un «no», una reclasificación y una ronda nueva. En un
hallazgo que nació de un reporte, el registro es la conversión.

Con la **Fecha límite de respuesta al ente**, el plan debe enviarse antes de esa fecha menos los
plazos de revisar y de aprobar, para que llegue aprobado a tiempo. Aprobado, el Administrador del
SGC tiene la tarea **Registrar la respuesta al ente**: suba el oficio en la página del hallazgo,
elíjalo, escriba la **Fecha en que se envió la respuesta** y **Registrar la respuesta al ente**.

### 10.3 Configuración de mejoramiento (Administrador del SGC)

Barra lateral → **Administración** → **Configuración de mejoramiento**:

- **Los plazos**, de 1 a 60 días hábiles, uno por paso (cada uno dice desde qué corre), y los dos
  recordatorios de seguimiento, de 1 a 365 días calendario. **Guardar los plazos.** Un cambio vale
  para lo que se calcule desde entonces: no mueve los plazos ya puestos.
- **Días del calendario de la entidad:** **Añadir un día**, con su **Fecha**, su **Tipo** (**No
  hábil**, para un día cívico o un cierre institucional; o **Hábil (anula un festivo)**, para un
  festivo que una ley o una sentencia quitó) y su **Motivo**; **Quitar** lo borra. Debajo, en solo
  lectura, los **Festivos de Colombia que calcula el sistema**. Un día añadido o quitado no mueve los
  vencimientos ya calculados.
- **Los formatos de los impresos:** el documento de la plataforma que es cada formato (el registro
  SGC-FO-AC-01, el de 5 porqués y el de Ishikawa). **Guardar los formatos.**

## 11. Registrar un hallazgo ya en curso

Para los hallazgos que el hospital tramitó en papel antes de la plataforma. Solo el Administrador
del SGC: **Registrar hallazgo** → **Ya está en curso** → **Registrar un hallazgo ya en curso**.
Sirve solo para un hallazgo con **el plan ya aprobado por fuera**; uno que todavía no tiene plan
aprobado se registra por el camino normal, con su fecha de detección real.

Se carga, por bloques en el orden del SGC-FO-AC-01: la identificación, con la **Fecha en que se
registró en papel**; la corrección (**Sí requirió corrección** o **No requiere corrección
inmediata**), con su fecha; el método del análisis y las causas raíz; las acciones y sus
actividades, con sus fechas, su avance de hoy y, las terminadas, el día en que terminaron; el
criterio de eficacia; y quién aprobó el plan (**Nombre de quien aprobó el plan**, **Su cargo**,
**Fecha en que se aprobó** y qué rol lo aprobó: **Gerencia** o **El Coordinador del SGC**; los
ajustes de su plan los decide ese rol, y Gerencia en todo caso si es de criticidad alta o externo).
**Cargar el hallazgo.**

Después, la página del hallazgo le pide **el formato firmado escaneado** («Aún no se ha subido el
formato firmado.»). Es obligatorio: **sin él, las actividades no llegan a sus responsables**, nadie
puede registrar seguimientos ni terminar actividades, no se verifica y la pasada de vencimientos no
lo cuenta. Mientras tanto sí se puede reasignar una actividad mal cargada o anular una carga
equivocada. Hasta subirlo, cada Administrador del SGC tiene en **Mis tareas** «Adjuntar el formato
firmado de HZ-…» (sin fecha límite), y en la lista el turno dice «El Administrador del SGC: falta el
formato firmado». Al subir el formato, cada responsable recibe su actividad.

El hallazgo recibe su código del año en que se carga y queda **En ejecución** (o **Por verificar**,
si todo está terminado), con la marca **Cargado**. Cada paso hecho en papel queda en el historial
como «hecho fuera de la plataforma», con su fecha real y sin firma del sistema. Quien carga no
cuenta como ejecutor: puede verificarlo después. Desde ahí sigue el recorrido normal.

## 12. Imprimir y exportar

- **Imprimir**, en la página del hallazgo (para quien lo ve completo): el **SGC-FO-AC-01** con sus
  siete secciones, todas sus rondas, sus ajustes y sus firmas (nombre, cargo, fecha y huella corta).
  Debajo, **También puede imprimir:** cada análisis en su formato, el SGC-FO-AC-02 (5 porqués) o el
  SGC-FO-AC-03 (Ishikawa); uno de otro método sale en una hoja sin código. El encabezado lleva el
  código, la versión y la fecha de emisión del formato que el Administrador del SGC eligió en la
  configuración; si no eligió ninguno, sale sin ellos. Un hallazgo cargado dice en cada paso en
  papel «hecho fuera de la plataforma». Imprima con la vista de impresión del navegador; sale claro
  aunque usted use el tema oscuro.
- **Excel**, en la lista: lo que la lista muestra con sus filtros, una fila por actividad, con las
  columnas de la matriz consolidada del SGC-FO-28 más el código del hallazgo y la ronda
  (`hallazgos-AAAAMMDD.xlsx`). Solo trae lo que usted puede ver, y la descarga queda en la
  bitácora.

## 13. Qué cambia en sus formatos

Lo que conviene ajustar en los textos del procedimiento y los formatos para que digan lo mismo que
la plataforma. Ninguno impide usarla.

1. **Fuentes.** El SGC-FO-14 (nueve), el SGC-FO-AC-01 (siete) y el SGC-FO-28 (once) no listan las
   mismas fuentes. La plataforma usa los catorce orígenes de la sección 3.2.
2. **Tipos de acción.** El SGC-FO-14 usa AC, AP, AM y OB; el SGC-FO-28, AC, OM y AP. La plataforma
   usa correctiva, preventiva y de mejora; la observación es una clase de hallazgo, no un tipo de
   acción.
3. **Estados.** «Abierta» es «en ejecución» en el SGC-FO-14 y «sin iniciar» en el SGC-FO-28. La
   plataforma usa Abierta (sin seguimientos), En proceso, Terminada y Cancelada, más «Vencida» y
   «Reprogramada», que se calculan.
4. **SGC-PR-03.** Tiene dos secciones numeradas 11; su §9 llama al SGC-FO-AC-02 «5 Porqués /
   Ishikawa» y no lista el SGC-FO-AC-03 ni el SGC-FO-AC-04; su §8 (diagrama de flujo) y su §10
   (indicadores del procedimiento) están vacíos. Los indicadores de la entrega 15C pueden llenar el
   §10.
5. **SGC-FO-28.** Cita el literal f) de ISO 10.2.1 para la evaluación de eficacia; el literal que la
   pide es el d).
6. **Criticidad.** El SGC-PR-03 habla de no conformidad «mayor o crítica»; el SGC-FO-AC-01, de
   criticidad alta, media o baja. La plataforma usa la segunda, y el campo «Clasificación» del
   formato es la clase.
7. **Quién evalúa la eficacia.** La actividad 9 del SGC-PR-03 dice «Líder SGC + Responsable de
   Proceso», y su §5.6 dice que no puede evaluarla quien implementó. La plataforma aplica el §5.6:
   quien ejecutó no verifica.
8. **Visto bueno del Gerente en el cierre** (SGC-FO-AC-01, sección 7): en la plataforma es un
   aviso, no una firma.
9. **«Nueva NC asociada» al reabrir** (SGC-FO-AC-01, sección 7): en la plataforma se reabre el mismo
   hallazgo con otra ronda; un problema distinto es otro hallazgo, enlazado.
10. **Reprogramación «aprobada por Alta Dirección»** (SGC-FO-28): en la plataforma la aprueba quien
    aprobó el plan.
11. **La matriz SGC-MZ-AC-01** que cita el procedimiento es la lista de **Hallazgos** de la
    plataforma.
12. **Cierre sin acción.** El SGC-FO-AC-01 no tiene dónde decir que una no conformidad se cerró sin
    corrección y sin acción correctiva. La plataforma lo registra como **Cerrado sin acción**, con
    las dos justificaciones y quien las validó; conviene que el procedimiento lo nombre.
13. **Códigos.** El SGC-FO-14 y el SGC-FO-28 siguen la forma `SGC-FO-NN`; los cuatro de acción
    correctiva, `SGC-FO-AC-NN`. Conviene unificarlos antes de registrarlos como documentos.
