# Fase 15 — Planes de mejoramiento (diseño)

Fecha: 2026-11-17. Estado: **aprobado por el usuario el 2026-11-17** («aprobado el spec,
continuemos con el plan de la 15A»), después de la revisión del constructor. Su única pregunta para
el usuario quedó resuelta en el Tema 16 de §2; sus demás observaciones se corrigieron en §6.1, §7.1,
§7.6, §8.1 a §8.3, §8.5, §8.6, §11.3, §11.4, §13.2, §13.3, §15, §16.1 y §19. Cubre las tres
entregas de la fase (15A, 15B y 15C). La 15A va con detalle completo; la 15B y la 15C, al nivel de lo ya decidido,
y cada una tendrá su anexo cuando llegue su turno (la 15B, además, cuando llegue la plantilla del
ente de control). Sigue, por entrega, el plan de implementación.

## 0. Cómo leer este documento

Es el detalle de la **Fase 15** del diseño maestro
`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` («el spec maestro»). Mandan,
en este orden: este documento; el spec maestro (§5.1 matriz de roles, §5.4 motor único de acciones,
§5.5 evidencias, §5.6 notificaciones y tareas, §5.11 sistema visual, §6.3 Planes de mejoramiento,
§8 Fase 15); los specs de la 13A, la 13B, la 13C y la 14 donde este los cita (firma por clave,
tareas y avisos, alcance, hallazgos de puntos de uso, impactos, indicadores y cálculos automáticos);
y las reglas permanentes de `AGENTS.md`. Donde este documento y los anteriores difieran, manda
este; §5.2 dice en qué.

**Los documentos del hospital.** El usuario entregó siete formatos de su Sistema de Gestión de
Calidad, en `F:\plan_mejoramiento` (fuera del repositorio; nunca entran a un commit):

| Código | Nombre | Qué es |
|---|---|---|
| SGC-PR-03 | Acciones correctivas | El procedimiento: once actividades con sus puntos de control PC-01 a PC-11 |
| SGC-FO-AC-01 | Registro de no conformidad, corrección y acción correctiva | El registro de un hallazgo, en siete secciones |
| SGC-FO-AC-02 | Análisis de causa raíz, 5 porqués | Formato del método |
| SGC-FO-AC-03 | Análisis de causa raíz, Ishikawa | Formato del método |
| SGC-FO-AC-04 | Análisis de causa raíz, Pareto | Formato del método |
| SGC-FO-14 | Plan de mejoramiento | El plan, por proceso y vigencia |
| SGC-FO-28 | Informe de seguimiento al plan de mejoramiento | El informe consolidado trimestral |

El usuario los dio como ruta del desarrollo («estos nos pueden marcar la ruta para el desarrollo»).
Son formatos internos del SGC; **no** son la plantilla que se entrega a un ente de control, que
sigue pendiente (§28). El Apéndice A los transcribe campo por campo y dice dónde quedó cada uno, sin
los nombres propios de sus pies de página. El Apéndice B lista lo que el hospital debe ajustar en
sus textos.

**Las maquetas** (no versionadas) están en
`.superpowers/brainstorm/1893-1794928689/content/pantallas-15-v2.html`: siete pantallas de la 15A
(la lista, la página de un hallazgo, el registro, el análisis de causa raíz, el plan de acción, la
actividad para su responsable y la verificación con la eficacia). El usuario las aprobó («así está
bien, continuemos»). Son la referencia del **contenido y el orden** de cada pantalla; el acabado es
el del sistema visual de la Fase 12.

Vocabulario de este documento:

- **Hallazgo:** la unidad del módulo. Algo que se encontró y que hay que tratar. Tiene una
  **clase**: **no conformidad** (se incumple un requisito), **observación** (un riesgo de incumplir
  que todavía no es incumplimiento) u **oportunidad de mejora**. Tiene código propio
  (`HZ-2026-014`).
- **Hallazgo de verificación:** el hallazgo de un punto de uso de la Fase 13B (tabla `hallazgos`).
  Es otra cosa: conserva su ciclo y su nombre dentro de Distribución (§17.4).
- **Origen:** de dónde salió el hallazgo (una auditoría interna, un indicador, una PQRSF, un ente
  de control). Lista fija de catorce (§7.2). **Externo:** los orígenes «Auditoría externa» y «Ente
  de control».
- **Corrección:** lo que se hace de inmediato para contener la falla, sin atacar su causa.
- **Causa raíz** y **análisis:** por qué ocurrió, con uno de los métodos del procedimiento.
- **Plan de acción:** las **acciones** de un hallazgo (correctiva, preventiva o de mejora) y, debajo
  de cada una, sus **actividades**. La actividad lleva el responsable, las fechas, el avance, los
  **seguimientos** y las evidencias.
- **Ronda:** cada intento de resolver un hallazgo. La ronda 1 es la primera; si la evaluación de
  eficacia resulta «no eficaz», el hallazgo se reabre con la ronda 2, que tiene su propio análisis,
  su plan y su verificación.
- **Plan de mejoramiento** (o **plan**, a secas, en §17): el agrupador opcional de los hallazgos de
  un mismo evento (una auditoría, una visita). No confundir con el plan de acción.
- **Ajuste:** un cambio a un plan de acción ya aprobado (mover una fecha, añadir o cancelar una
  actividad). **Reprogramación:** el ajuste que mueve una fecha.
- **Verificación de la implementación:** comprobar que las actividades se hicieron (PC-08).
  **Evaluación de eficacia:** comprobar, después de una espera, que el problema no volvió (PC-09).
- **Día hábil:** lunes a viernes que no es festivo de Colombia ni día no hábil de la entidad (§13).
- **Admin SGC** (el «Coordinador SGC» de los documentos del hospital), **líder**, **firma**,
  **huella**, **norma**, **impacto**, **soporte**: como en los specs anteriores.

Las etiquetas entre corchetes dicen de quién es cada decisión: **[Usuario, n.n]** (con el número del
punto de §2), **[Maquetas]** (lo que el usuario aprobó al verlas), **[Spec maestro]**, **[Documento
del hospital]** (con el formato y la sección) o **[Decisión de Claude, F15-DCn]**. Las de Claude
están reunidas en §29 para revisarlas de una vez, con su base: **ISO** (cláusula de ISO 9001:2015
que lo exige), **ISO derivada** (la cláusula respalda el fin; el mecanismo es de Claude),
**Regulación** o **Práctica**.

## 1. Intención y porqué

Las fases 13 y 14 dejaron controlados los documentos y medidos los procesos. Falta lo que ISO
9001:2015 pide cuando algo sale mal: reaccionar ante la no conformidad, evaluar si hace falta
eliminar su causa, implementar la acción, **revisar su eficacia** y conservar la evidencia de todo
ello (10.2.1 y 10.2.2), además de mejorar de forma continua (10.3). El hospital ya lo tiene escrito
en su procedimiento SGC-PR-03; esta fase lo pone dentro de la plataforma.

El objetivo de la fase, en una frase: **que toda falla detectada en el hospital quede registrada,
que la persona a quien le toca el siguiente paso lo sepa y tenga fecha, y que un auditor pueda
seguir cada hallazgo desde su evidencia hasta la prueba de que la acción funcionó.**

Tres reglas ordenan el diseño. Son la continuación del criterio que el usuario fijó en la Fase 14
(«fácil su uso e interpretación pero sin perder su rigor técnico») [Decisión de Claude, F15-DC1]:

1. **Registrar es fácil; cerrar es exigente.** Cualquier funcionario reporta en un formulario
   corto. Cerrar exige evidencia, verificación de otra persona y, cuando hubo acción correctiva,
   una espera que el sistema hace cumplir.
2. **El caso simple cabe en una pantalla.** Una falla menor se cierra con su corrección validada.
   Una acción con un solo responsable es una fila. Lo avanzado (varias actividades, varios
   análisis, ajustes) aparece solo cuando se usa.
3. **El rigor lo pone el sistema, no el usuario:** los plazos en días hábiles, quién puede firmar
   cada acto, la fecha desde la que se puede evaluar la eficacia y la separación entre quien ejecuta
   y quien verifica se aplican solos.

Lo que la fase deja listo para las siguientes: las tareas y avisos de mejoramiento, que la Fase 16
lleva al correo; los hallazgos por estado, origen y proceso y los cuatro cálculos automáticos, que
la Fase 17 pone en el tablero; el origen «Revisión por la dirección», al que la Fase 17 conecta las
decisiones del informe de revisión; y el informe SGC-FO-28, que es una de las entradas de esa
revisión (ISO 9.3.2 c).

## 2. Decisiones del usuario (2026-11-17)

Tomadas una por una en conversación, con las recomendaciones de Claude, su base y su porqué; el
usuario eligió por número. Los números (2.1, 4.4, 13.9…) son los de esa conversación y este
documento los cita así.

**Tema 1. Punto de partida** («1.2, 1.5 existen 3 por el momento»). Los siete formatos del hospital
marcan la ruta. Existe además una plantilla del ente de control, que el usuario entregará (1.2).
Los formatos ya se usan: hoy hay tres hallazgos o planes abiertos en papel (1.5).

**Tema 2. La unidad y los niveles** («2.1, 2.4»).

- 2.1 El hallazgo es la unidad, con consecutivo propio. El plan es opcional: agrupa los hallazgos de
  un mismo evento y puede cruzar procesos. Un hallazgo suelto vive sin plan. El SGC-FO-14 sale del
  plan, por proceso, y también como reporte de un proceso en un año.
- 2.4 Toda acción tiene al menos una actividad. El responsable, las fechas, el avance, los
  seguimientos, las evidencias y los vencimientos viven solo en la actividad. El caso simple se
  llena en un solo formulario y se ve como una fila.

**Tema 3. Las listas** («entra de 3.1 a 3.8»).

- 3.1 Los orígenes son una lista fija en el código.
- 3.2 Son catorce (§7.2).
- 3.3 «Documento» y «proceso» dejan de ser orígenes: pasan a ser «a qué se refiere» el hallazgo.
- 3.4 Los externos no se rechazan, se responden, y nacen con prioridad alta.
- 3.5 Tres clases: no conformidad, observación y oportunidad de mejora.
- 3.6 Criticidad alta, media o baja, obligatoria en la no conformidad.
- 3.7 La corrección es una sección del hallazgo, no un tipo de acción.
- 3.8 Tres tipos de acción planificada: correctiva, preventiva y de mejora.

**Tema 4. Las reglas del recorrido** («4.1, 4.4, 4.7, 4.9»).

- 4.1 Hay camino corto. Tras la corrección, el Admin SGC decide si requiere acción correctiva, con
  justificación. El sistema obliga el «sí» cuando es reincidente, de criticidad alta o de origen
  externo. Con «no», se cierra cuando alguien distinto de quien corrigió valida la corrección. La
  observación y la oportunidad de mejora no llevan corrección.
- 4.4 El Admin SGC revisa siempre el plan. Gerencia aprueba cuando aplica: criticidad alta, origen
  externo, cuando el revisor marca «requiere recursos adicionales o tiene impacto institucional», o
  cuando el revisor es quien elaboró. Si no aplica, la revisión vale como aprobación.
- 4.7 Si no fue eficaz, se reabre el mismo hallazgo con una ronda nueva. Una «nueva no conformidad
  asociada» se registra solo si la verificación encuentra un problema distinto.
- 4.9 Tras un rechazo, quien registró puede retirarlo o sostenerlo. Si lo sostiene, decide el Admin
  SGC, o Gerencia cuando el Admin SGC fue quien lo registró. Esa decisión es definitiva.

**Tema 5. Quién hace qué** («entran 5.1 a 5.6 y la 5.8»).

- 5.1 Registran el Admin SGC y Control Interno, de cualquier proceso; el líder, de los suyos. El
  que registra el propio líder nace aceptado.
- 5.2 Cualquier funcionario puede reportar una posible no conformidad; el Admin SGC la clasifica y
  la convierte en hallazgo, o la descarta con su motivo.
- 5.3 La causa raíz y el plan los formula un líder del proceso. Si el proceso no tiene líder, los
  formula el Admin SGC, y entonces aprueba Gerencia.
- 5.4 La implementación y la eficacia las verifica el Admin SGC o Control Interno, siempre que esa
  persona no haya ejecutado ninguna actividad del hallazgo ni registrado su corrección. Si ninguno
  de los dos puede, verifica Gerencia. Sin excepción de «único administrador».
- 5.5 El Comité de Calidad y la «Alta Dirección» no son roles: sus decisiones las registra el Admin
  SGC o Gerencia, citando el número y la fecha del acta.
- 5.6 Firma con clave en cinco actos: «Elaboró», «Revisó», «Aprobó», «Verificó» y «Cerró».
- 5.8 Al cierre, Gerencia recibe un aviso, sin firmar.

**Tema 6. Plazos y días hábiles** («6.1, entra de 6.4 a 6.6»).

- 6.1 Días hábiles reales: lunes a viernes sin los festivos de Colombia, que el sistema calcula.
- 6.4 Días no hábiles propios de la entidad, en una lista que edita el Admin SGC.
- 6.5 Plazos de cada paso, configurables, en días hábiles (§13.3).
- 6.6 En un hallazgo externo, la fecha límite de respuesta se escribe al registrarlo y manda sobre
  los 10 días.

**Tema 7. La causa raíz** («7.1, entran 7.4 a 7.8»).

- 7.1 Los tres métodos (5 porqués, Ishikawa, Pareto) son formularios del sistema y cada uno se
  imprime en su formato.
- 7.4 «Otro método»: nombre, descripción y adjuntos.
- 7.5 Uno o más análisis por hallazgo.
- 7.6 Las causas raíz son una lista, y cada acción correctiva dice qué causa ataca.
- 7.7 Las dos preguntas de cierre del análisis son obligatorias. Al Admin SGC, cuando revisa, el
  sistema le muestra los hallazgos parecidos de otros procesos.
- 7.8 El análisis es obligatorio en la no conformidad con acción correctiva, y opcional en la
  observación y la oportunidad de mejora.

**Tema 8. El informe y los impresos** («8.1, entran 8.4 a 8.8»).

- 8.1 El informe SGC-FO-28 lo produce el sistema, en la última entrega: numerado, firmado, congelado
  y en PDF.
- 8.4 «Revisó» cita el acta del Comité. La decisión sobre cada acción atrasada se registra en el
  hallazgo y el informe la muestra.
- 8.5 Los dos porcentajes del informe salen de las mismas reglas que los cálculos automáticos.
- 8.6 Cada registro se imprime en su formato, en cualquier momento.
- 8.7 El encabezado del impreso lleva el código, la versión y la fecha de emisión vigentes del
  formato, tomados del documento registrado en la plataforma.
- 8.8 La matriz SGC-MZ-AC-01 es la lista de la plataforma, con filtros y Excel.

**Tema 9. El corte** («9.1»). Tres entregas: 15A, 15B y 15C (§5.1).

**Tema 10. Actividades y reprogramación** («entran 10.1 a 10.6, con la 10.7»).

- 10.1 El responsable de una actividad es cualquier usuario activo; serlo le da alcance sobre el
  hallazgo.
- 10.2 La «delegación» es la entrega de cada actividad a su responsable al aprobarse el plan. El
  líder o el Admin SGC pueden reasignarla, con motivo y sin aprobación.
- 10.3 El avance se escribe en cada seguimiento, de 0 a 100. El de la acción es el promedio simple
  de sus actividades; el del hallazgo, el de sus acciones. Si la plantilla del ente trae unidad de
  medida y cantidad, la actividad que las tenga registra la cantidad lograda.
- 10.4 Una actividad no se termina sin al menos un archivo de evidencia.
- 10.5 Recordatorio de seguimiento a los 15 días (criticidad alta) o 30 (las demás) sin seguimiento.
- 10.6 Al vencer avisa al responsable; a los días configurados, a su jefe. El Admin SGC puede
  «escalar a Gerencia» una actividad atrasada.
- 10.7 Todo cambio a un plan aprobado es un ajuste con justificación, que aprueba quien aprobó el
  plan. La fecha original se conserva y, mientras se decide, la actividad sigue vencida.

**Tema 11. Verificación, eficacia y reincidencia** («entran 11.1 a 11.5»).

- 11.1 Verificación de la implementación, actividad por actividad: conforme o devuelta.
- 11.2 El criterio de eficacia se define en el plan; si es «mejora del indicador», se enlaza un
  indicador de la plataforma.
- 11.3 «Eficaz» no se puede registrar antes de dos meses desde que terminó la última actividad, o de
  dos periodos del indicador enlazado, lo que sea mayor. «No eficaz», en cualquier momento. En la
  observación y la oportunidad no hay espera obligatoria.
- 11.4 El resultado lleva criterios, periodo, justificación y evidencia, con la firma «Verificó».
  Eficaz: el Admin SGC cierra con las lecciones aprendidas. No eficaz: ronda nueva, con 10 días
  hábiles.
- 11.5 Al registrar, el sistema muestra los parecidos del proceso y quien registra elige: es el
  mismo problema de uno abierto (se añade como **ocurrencia**), es reincidencia de uno cerrado
  (nace enlazado y obliga la acción correctiva) o es distinto.

**Tema 12. Visibilidad** («12.1, entran 12.4 a 12.7»).

- 12.1 Por alcance y participación. Lo ven completo el Admin SGC, Gerencia y Control Interno, los
  líderes de su proceso y quien lo registró. El responsable de una actividad ve el hallazgo al que
  pertenece. Nadie más. **Cambia la celda «Consulta: ver» de la matriz del spec maestro.**
- 12.4 Sin datos de pacientes ni de quejosos: el formulario lo advierte y pide la «referencia del
  caso».
- 12.5 El responsable de una actividad lee el texto del hallazgo, pero solo abre los archivos de su
  actividad.
- 12.6 Quien reportó ve su reporte y en qué estado va, no el contenido del hallazgo.
- 12.7 Un plan que cruza procesos le muestra a cada líder solo los hallazgos de los suyos.

**Tema 13. Enganches** («13.1, 13.3, entra de 13.5 a 13.11»).

- 13.1 La marca «Requiere acción de mejora» de una medición es un pendiente con tres salidas:
  hallazgo nuevo, ocurrencia de uno abierto, o «no requiere» (solo el Admin SGC). Mientras nadie
  decide, es tarea del Admin SGC.
- 13.3 El hallazgo de un punto de uso conserva su ciclo; desde él el Admin SGC abre una no
  conformidad cuando hace falta acción correctiva. Quedan enlazados y el SGC-FO-28 los cuenta
  aparte.
- 13.5 En Distribución siguen llamándose «hallazgos»; donde se cruzan con este módulo, «hallazgo de
  verificación».
- 13.6 «Abrir hallazgo» (o «Reportar») desde la página de un documento, un proceso y un indicador;
  cada página muestra sus hallazgos a quien puede verlos.
- 13.7 «Abrir hallazgo» desde un impacto de norma, con la norma como requisito incumplido.
- 13.8 Requisito incumplido: cláusula ISO, norma del normograma o documento interno.
- 13.9 «Pedir cambio documental» desde una actividad; al cerrar, si el análisis pidió cambios en
  documentos y no hay trámite publicado, se exige justificación.
- 13.10 Riesgo asociado: texto opcional; si el análisis pidió actualizar la matriz, el cierre lo
  comprueba igual.
- 13.11 El hallazgo puede apuntar a un objetivo del maestro; el plan propone el suyo.

**Tema 14. Cálculos automáticos** («entran 14.1 a 14.4, con la 14.5»). Cuatro cálculos (§18.3):
eficacia de las acciones, actividades cumplidas a tiempo, planes formulados a tiempo y hallazgos
cerrados a tiempo. «A tiempo» se juzga contra la fecha original del plan aprobado (14.5).

**Tema 15. Los que ya están abiertos** («15.1, entran 15.3 y 15.4»). «Registrar un hallazgo ya en
curso», solo para el Admin SGC, con sus fechas reales y lo hecho en papel marcado como «hecho fuera
de la plataforma» (15.1). No cuenta en «Planes formulados a tiempo» (15.3). Entra en la 15A (15.4).

**Tema 16. La no conformidad a la que no se le hace nada** («16.2»). Salió de la revisión del
constructor. Una no conformidad puede quedar sin corrección («no requiere corrección inmediata») y
sin acción correctiva («no requiere»). Se permite, con nombre propio: otra persona valida las dos
justificaciones y el hallazgo queda **«Cerrado sin acción»**, distinto de «Cerrado con corrección».
La lista y el informe SGC-FO-28 cuentan aparte cuántos cerraron así (§8.5).

**Las maquetas** («así está bien, continuemos»). Con ellas el usuario aprobó, además del contenido
de las siete pantallas: el nombre del módulo, **«Mejoramiento»**; el código `HZ-AAAA-NNN`, un
consecutivo por año común a las tres clases; los nombres de los estados (§8.1); y cómo se cuentan
los «dos ciclos de medición» (§11.3).

## 3. Metas, no metas y anti-metas

**Metas**

- Todo lo que el SGC-PR-03 pide queda como evidencia dentro del sistema: sus once actividades y sus
  puntos de control PC-01 a PC-11 (Apéndice A.7).
- Un hallazgo menor se registra y se cierra sin burocracia; uno crítico no se cierra sin su causa,
  su plan aprobado, su verificación y su espera.
- Nadie verifica lo que ejecutó. Lo comprueba el servidor, no la pantalla.
- Cada persona ve en «Mis tareas» lo que le toca, con su fecha en días hábiles.
- Los formatos del hospital salen del sistema ya diligenciados: nadie llena un Word en paralelo.
- La misma falla no vive en dos registros.

**No metas** (fuera de alcance, explícitamente)

- Módulo de gestión de riesgos: solo el texto del riesgo asociado [Spec maestro; Usuario, 13.10].
- Módulo de PQRSF, de eventos adversos o de seguridad del paciente: entran solo como origen, con la
  referencia del caso.
- Módulo de auditorías (programa, listas de chequeo, informe de auditoría): la auditoría entra como
  origen y como evento de un plan.
- Roles nuevos: el Comité de Calidad y la Alta Dirección no son roles [Usuario, 5.5].
- Correo: los avisos salen por la campana; el correo llega en la Fase 16.
- Tablero gerencial y catálogo de reportes: Fase 17. Aquí, la lista con su Excel, los impresos, el
  informe SGC-FO-28 y los reportes de cumplimiento de §18.4.
- Carga masiva de hallazgos desde Excel: los que ya están abiertos se registran uno por uno (§15).
- Editor de texto enriquecido: los campos largos son texto plano con saltos de línea.
- Diagrama de espina de pescado dibujado: el Ishikawa es una rejilla por categoría, como en su
  formato.

**Anti-metas** (sería un fracaso aunque «funcione»)

- Que un hallazgo se cierre como eficaz sin evaluación, o antes de la espera.
- Que quien ejecutó una actividad verifique el hallazgo, por cualquier camino.
- Que un funcionario sin alcance vea el contenido de un hallazgo, o sepa que existe.
- Que el nombre de un paciente o de quien se quejó termine en el texto porque el formulario lo
  pidió.
- Que una reprogramación aprobada mejore el indicador de cumplimiento.
- Que la misma falla exista como hallazgo de este módulo y como otra cosa, sin enlace.
- Que un plazo en días hábiles muestre una fecha distinta de la que un auditor calcula a mano.

## 4. Restricciones

Las del piso de despliegue y las reglas inviolables de `AGENTS.md`, sin excepción. En particular:

- **Sin dependencias npm nuevas.** Los festivos se calculan en una función propia; la gráfica del
  Pareto se dibuja en SVG como las de la Fase 14; el PDF del informe usa `pdf-lib`, ya instalada.
- **Sin servicios nuevos.** No hay planificador hasta la Fase 16: los vencimientos se revisan en la
  pasada que ya corre cuando alguien usa la aplicación (`revisarVencimientos`).
- **Migraciones aplicables sobre lo existente.** No se renombra ni se borra nada heredado. La tabla
  `hallazgos`, el contexto de archivo `hallazgo` y las rutas `api/hallazgos` son de la 13B y no se
  tocan: todo lo de esta fase usa el prefijo `mejora` (§19).
- **Toda escritura** pasa por `mutacion()` o `requerirPermiso()`, exige su permiso de matriz **más**
  la condición de persona, queda en la bitácora y, si el acto lleva firma, sigue F13A-R4 (validador
  de solo lectura antes, la clave fuera de la transacción, todo repetido dentro con la fila
  bloqueada).
- **Toda lectura** pasa por las reglas de `src/lib/alcance.ts`; quien no puede ver algo recibe «no
  encontrado».
- **La zona horaria** es la de la instalación (`zonaHoraria()`); los días hábiles se cuentan en ella.
- **Los módulos anteriores siguen en días calendario.** No se tocan [Usuario, 6.1].

## 5. Las tres entregas y la relación con el spec maestro

### 5.1 Las entregas

[Usuario, 9.1.] Cada una termina en algo que se recorre en el navegador (§24).

| Entrega | Qué entra |
|---|---|
| **15A. El hallazgo de punta a punta** | El recorrido completo de un hallazgo sin plan: registro con los catorce orígenes; reporte de cualquier funcionario; aceptación, rechazo y arbitraje; corrección y camino corto; causa raíz con 5 porqués, Ishikawa y «otro método»; plan de acción con acciones y actividades; firmas; ejecución con seguimientos, evidencias y ajustes; verificación, eficacia, cierre, reapertura y reincidencia; días hábiles; tareas y avisos; la lista con filtros y Excel; los impresos SGC-FO-AC-01 a 03; la carga de hallazgos en curso. §6 a §16 |
| **15B. Planes y enganches** | El plan que agrupa hallazgos, con su SGC-FO-14; el formato del ente; los objetivos; «abrir hallazgo» desde un documento, un proceso, un indicador crítico, un hallazgo de verificación y un impacto de norma; el cambio documental desde una actividad. §17 |
| **15C. Informe, Pareto y automáticos** | El informe SGC-FO-28 con firmas y PDF; el análisis de Pareto; los cuatro cálculos automáticos; los reportes de cumplimiento por plan, origen, área y proceso. §18 |

Cuatro datos que solo usa la 15C condicionan el esquema de la 15A, y por eso la 15A los guarda
desde el primer día aunque no los muestre todos [Decisión de Claude, F15-DC2]: la **fecha original**
de cada actividad y cuándo terminó de verdad; cuándo se **envió el plan** por primera vez en cada
ronda; el **cierre previsto** de cada ronda; y el **resultado de eficacia por ronda**. Sin eso, los
cálculos de la 15C no podrían reconstruirse hacia atrás.

### 5.2 Dónde manda este documento sobre el spec maestro

| Tema | Spec maestro | Este documento |
|---|---|---|
| Orígenes | Nueve fijos, entre ellos `documento` y `proceso` (§5.4) | Catorce; «documento» y «proceso» son referencias, no orígenes [Usuario, 3.2 y 3.3] |
| Tipos de acción | Cuatro: corrección, correctiva, preventiva, de mejora (§6.3, rec. 3) | Tres tipos de acción planificada; la corrección es una sección del hallazgo [Usuario, 3.7 y 3.8] |
| Jerarquía | Plan → hallazgos → acciones → actividades (§5.4) | El hallazgo es la unidad; el plan es opcional [Usuario, 2.1] |
| Causa raíz | Obligatoria antes de formular acciones; método libre (rec. 1) | Obligatoria solo cuando hay acción correctiva; tres métodos estructurados y «otro» [Usuario, 4.1, 7.1 y 7.8] |
| Aprobación | «Gerencia: ver, aprobar» (§5.1) | Gerencia aprueba cuando aplica; si no, vale la revisión del Admin SGC [Usuario, 4.4] |
| Visibilidad | «Consulta: ver» (§5.1) | El rol Consulta ve solo lo que reportó y las actividades a su cargo [Usuario, 12.1] |
| Plazos | Días calendario en toda la plataforma | Días hábiles en este módulo [Usuario, 6.1] |
| Reportes | Solo listados en la Fase 15; los formales, en la 17 (§6.3) | El informe SGC-FO-28 se produce en la 15C [Usuario, 8.1] |
| Riesgo asociado | «Texto o maestro pequeño» (rec. 6) | Texto [Usuario, 13.10] |
| Reincidencia | Se marca al registrar (rec. 4) | Tres salidas, con la «ocurrencia» [Usuario, 11.5] |
| Cálculos automáticos | El spec de la 14 nombró dos | Cuatro [Usuario, 14.1 a 14.4] |

Lo que el spec maestro dice y los documentos del hospital callan se conserva: la notificación al
líder, el rechazo solo hacia fuentes internas y la delegación de actividades.

## 6. Actores, permisos y visibilidad

### 6.1 Quién hace qué

| Acto | Quién | Condición de persona |
|---|---|---|
| Reportar una posible no conformidad | Cualquier usuario con sesión | — |
| Clasificar un reporte (convertir, añadir como ocurrencia o descartar) | Admin SGC | — |
| Registrar un hallazgo | Admin SGC, Control Interno, líder | El líder, solo de sus procesos |
| Aceptar o rechazar | Líder | Líder del proceso del hallazgo; no quien lo registró |
| Retirar o sostener tras un rechazo | Quien lo registró | Es su registro (el Admin SGC puede hacerlo por él) |
| Arbitrar un rechazo sostenido | Admin SGC; Gerencia | Gerencia, cuando un Admin SGC lo registró o lo sostuvo (§8.3) |
| Registrar la corrección | Líder; Admin SGC | Líder del proceso |
| Decidir si requiere acción correctiva | Admin SGC | — |
| Validar la corrección, o el cierre sin acción (camino corto) | Admin SGC, Control Interno; Gerencia | No registró la corrección ni fue su responsable; en el cierre sin acción, tampoco decidió el «no». Gerencia, solo si ninguno de los otros puede (§8.5) |
| Formular la causa raíz y el plan; firmar «Elaboró» | Líder; Admin SGC | Líder del proceso; el Admin SGC, solo si el proceso no tiene líder activo |
| Revisar; firmar «Revisó» | Admin SGC | No es quien elaboró |
| Aprobar; firmar «Aprobó» | Gerencia | Cuando aplica (§8.6) |
| Registrar seguimiento, terminar, pedir un ajuste | Cualquier usuario | Es el responsable de la actividad (pedir un ajuste, también el líder y el Admin SGC) |
| Reasignar una actividad | Líder; Admin SGC | Líder del proceso |
| Decidir un ajuste | Admin SGC; Gerencia | Quien aprobó el plan de esa ronda (§10.6) |
| Escalar a Gerencia | Admin SGC | — |
| Verificar la implementación; evaluar la eficacia; firmar «Verificó» | Admin SGC, Control Interno; Gerencia | No ejecutó ninguna actividad del hallazgo ni registró su corrección; Gerencia, solo si ningún Admin SGC ni Control Interno activo puede (§11.1) |
| Cerrar; firmar «Cerró» | Admin SGC | — |
| Editar; reclasificar; anular | Quien lo registró; Admin SGC | §7.6 |
| Registrar un hallazgo ya en curso | Admin SGC | §15 |
| Resolver la marca de un indicador | Admin SGC; líder | El líder, solo las dos primeras salidas (§17.3) |
| Configurar plazos, días no hábiles y formatos | Admin SGC | — |

«Líder del proceso» es cualquier usuario con rol líder asignado a ese proceso y activo
(`alcanceProcesos`). Si el proceso no tiene ninguno, lo que le toca al líder lo hace el Admin SGC
[Usuario, 5.3; Decisión de Claude, F15-DC3: se extiende a aceptar y a registrar la corrección, para
que un proceso sin líder no bloquee el recorrido].

### 6.2 Permisos de la matriz

[Decisión de Claude, F15-DC4.] Permisos nuevos en `src/lib/permisos.ts`, con su prueba por celda:

| Permiso | Admin SGC | Gerencia | Control Interno | Líder | Consulta |
|---|---|---|---|---|---|
| `mejora.reportar` | Sí | Sí | Sí | Sí | Sí |
| `mejora.ejecutar` | Sí | Sí | Sí | Sí | Sí |
| `mejora.registrar` | Sí | — | Sí | Sí | — |
| `mejora.formular` | Sí | — | — | Sí | — |
| `mejora.gestionar` | Sí | — | — | — | — |
| `mejora.aprobar` | — | Sí | — | — | — |
| `mejora.verificar` | Sí | Sí | Sí | — | — |
| `mejora.ver_todo` | Sí | Sí | Sí | — | — |

Como en Distribución, `mejora.reportar` y `mejora.ejecutar` los tienen los cinco roles y **no bastan
solos**: cada escritura exige además la condición de persona de §6.1, comprobada en el servidor y
repetida dentro de la transacción. Qué acto cubre cada permiso:

- `mejora.reportar`: reportar.
- `mejora.ejecutar`: registrar seguimientos, terminar la actividad y pedir la reprogramación de la
  propia.
- `mejora.registrar`: registrar un hallazgo, editarlo antes de la aceptación, añadir ocurrencias, y
  retirar o sostener tras un rechazo.
- `mejora.formular`: aceptar o rechazar, registrar la corrección, formular y enviar el análisis y el
  plan, reasignar actividades y pedir ajustes.
- `mejora.gestionar`: clasificar reportes, decidir la acción correctiva, revisar, arbitrar, decidir
  ajustes, escalar, cerrar, reclasificar, anular, cargar y configurar.
- `mejora.aprobar`: aprobar el plan, decidir los ajustes de los planes que aprobó Gerencia, arbitrar
  cuando le toca y exigir la acción correctiva (§8.5).
- `mejora.verificar`: validar la corrección, verificar la implementación y evaluar la eficacia.
- `mejora.ver_todo`: leer todos los hallazgos, los reportes recibidos y, en la 15C, los informes.

### 6.3 Quién ve qué

[Usuario, 12.1 y 12.4 a 12.7.] Las reglas viven en `src/lib/alcance.ts`, junto a las demás:
`filtroHallazgos` (para un `WHERE`), `puedeVerHallazgo`, `puedeAbrirArchivoDeHallazgo` y
`participacionEnHallazgo`.

| Quién | Qué ve |
|---|---|
| Admin SGC, Gerencia, Control Interno (`mejora.ver_todo`) | Todos los hallazgos, completos, con todos sus archivos |
| Líder | Los hallazgos de sus procesos activos, completos, con todos sus archivos |
| Quien registró el hallazgo | Ese hallazgo, completo |
| Responsable de una actividad (de cualquier ronda, también terminada o cancelada) | El hallazgo al que pertenece, en texto: identificación, corrección, análisis, plan y estado. De los archivos, **solo los de sus actividades** |
| Quien reportó (§7.3) | Su reporte y la etiqueta de estado del hallazgo que nació de él; nada de su contenido |
| Cualquier otro | Nada: «no encontrado» |

Es la **quinta excepción nombrada** a `alcanceProcesos()`: ser responsable de una actividad da
alcance sobre ese hallazgo sin liderar su proceso (junto a la participación en un trámite y las
tres de los indicadores).

Precisiones [Decisión de Claude, F15-DC5]:

- **La identidad de quien reportó** (§7.3) la ven solo quienes tienen `mejora.ver_todo`. Al líder
  y a los responsables de actividades el hallazgo les dice «Reportado por un funcionario». Base:
  Práctica (cultura de reporte no punitiva). Quien registra un hallazgo directamente sí aparece con
  su nombre.
- **Los enlaces** de un hallazgo (documento, indicador, medición, norma, trámite, hallazgo de
  verificación) se muestran con su nombre solo a quien puede ver lo enlazado, con la regla de
  alcance de ese módulo; a los demás, sin enlace y sin nombre («un indicador», «un documento
  restringido»).
- **Las listas, el Excel, la búsqueda y los conteos** aplican `filtroHallazgos`: nunca dicen cuántos
  hay fuera del alcance de quien mira.
- **El aviso al jefe** por una actividad vencida dice quién y desde cuándo, sin el texto de la
  actividad ni el código del hallazgo (§14.3).
- **La bitácora** la leen Admin SGC y Control Interno, como siempre.

### 6.4 Sin datos de pacientes

[Usuario, 12.4. Regulación: Ley 1581 de 2012, datos sensibles.] Todo formulario con texto libre de
este módulo (reporte, registro, corrección, análisis, seguimiento, verificación) lleva el aviso
«No escriba nombres ni documentos de pacientes o de quien se quejó. Use el número del caso.» En los
orígenes «PQRSF» y «Evento adverso o seguridad del paciente» el registro pide además la
**referencia del caso** (el radicado o el código del evento), obligatoria. El sistema no analiza
el texto: la regla es de diseño del formulario, no un filtro.

## 7. El hallazgo (15A)

### 7.1 Identificación

Los campos de la sección 1 del SGC-FO-AC-01, más lo que la plataforma ya sabe.

| Campo | Regla |
|---|---|
| Código | `HZ-AAAA-NNN`: el año del registro en la zona de la instalación y un consecutivo de tres cifras por año, común a las tres clases. Lo asigna el sistema dentro de la transacción del registro, sin huecos por concurrencia, y nunca se reutiliza, tampoco el de un hallazgo rechazado o anulado [Maquetas] |
| Clase | No conformidad, observación u oportunidad de mejora [Usuario, 3.5] |
| Origen | Uno de los catorce de §7.2 [Usuario, 3.1 y 3.2] |
| Fuente | Texto corto: qué auditoría, visita o caso (por ejemplo, «Auditoría interna del 3 de noviembre»). Obligatoria, salvo en el origen «Indicador» cuando lleva la medición enlazada [Spec maestro §5.4; Decisión de Claude, F15-DC6] |
| Referencia del caso | El radicado o el código del evento. Obligatoria en «PQRSF» y «Evento adverso o seguridad del paciente» [Usuario, 12.4] |
| Fecha en que se detectó | De hoy hacia atrás. La fecha y hora del registro las pone el sistema |
| Proceso | Obligatorio. Subproceso, opcional, como en documentos e indicadores |
| Criticidad | Alta, media o baja. Obligatoria en la no conformidad; no existe en las otras dos clases [Usuario, 3.6]. El formulario dice qué es alta: seguridad del paciente, cumplimiento legal o continuidad del servicio [Documento del hospital, SGC-FO-AC-01 sección 1] |
| Título | Una frase (hasta 150 caracteres) que nombra el hallazgo en las listas, los avisos y las tareas. La maqueta 3 no lo mostraba como campo aparte; las maquetas 1 y 2 lo usan [Decisión de Claude, F15-DC6] |
| Descripción | Detallada, con la evidencia objetiva (de 10 a 4.000 caracteres) |
| Requisito incumplido | Tres campos, al menos uno en la no conformidad y opcionales en las otras clases: cláusula de ISO 9001 (texto), norma del normograma (enlace) y documento interno (enlace) [Usuario, 13.8] |
| A qué se refiere | Enlaces opcionales: un documento, un indicador o una medición (solo una que ya tiene resultado). La 15B añade el hallazgo de verificación y el impacto de norma [Usuario, 3.3] |
| Riesgo asociado | Texto opcional (hasta 200 caracteres): el código y el nombre del riesgo en la matriz del proceso [Usuario, 13.10] |
| Evidencia | Archivos opcionales (los tipos que ya admite `src/lib/subida.ts` para evidencias) |
| Fecha límite del ente | Solo en los orígenes externos (§13.4) |

### 7.2 Los catorce orígenes

[Usuario, 3.1 a 3.4.] Lista fija en el código (`src/lib/mejoramiento/origenes.ts`), con su clave, su
etiqueta y si es externo. No es un maestro editable: de cada origen cuelgan reglas.

| # | Clave | Etiqueta | Externo |
|---|---|---|---|
| 1 | `auditoria_interna` | Auditoría interna | No |
| 2 | `control_interno` | Control Interno | No |
| 3 | `revision_direccion` | Revisión por la dirección | No |
| 4 | `pamec` | PAMEC | No |
| 5 | `autoevaluacion` | Autoevaluación | No |
| 6 | `indicador` | Indicador | No |
| 7 | `pqrsf` | PQRSF | No |
| 8 | `evento_adverso` | Evento adverso o seguridad del paciente | No |
| 9 | `riesgo_materializado` | Riesgo materializado | No |
| 10 | `satisfaccion_usuario` | Satisfacción del usuario | No |
| 11 | `control_documental` | Control documental | No |
| 12 | `otro` | Otro (la fuente dice cuál) | No |
| 13 | `auditoria_externa` | Auditoría externa | Sí |
| 14 | `ente_control` | Ente de control | Sí |

Reglas que cuelgan del origen:

- **Externo (13 y 14):** el hallazgo nace aceptado y no admite rechazo; lleva siempre plan de
  acción, sea cual sea su clase; lo aprueba Gerencia; lleva la marca **«Prioridad alta»**, que se
  ve en la lista y en la página y lo pone primero en el orden por omisión de la lista; su registro
  avisa también a Gerencia y al Admin SGC (§14.2); y su plazo de formulación sale de la fecha del
  ente (§13.4). Si el ente retira el
  hallazgo, la salida es anularlo (§7.6) [Usuario, 3.4 y 4.4; Decisión de Claude, F15-DC7: «siempre
  lleva plan» también en la observación y la oportunidad externas, para no añadir un estado
  «respondido sin acción»].
- **«Indicador»:** puede llevar la medición enlazada; lo abre la marca de §17.3 (15B) o se registra
  a mano.
- **«Control documental»:** es el de lo que detecta la propia plataforma (un hallazgo de
  verificación, un impacto de norma, la revisión anual).
- **«PQRSF» y «Evento adverso»:** piden la referencia del caso.

### 7.3 El reporte de un funcionario

[Usuario, 5.2 y 12.6.] Es una entidad aparte del hallazgo: no tiene código `HZ` hasta que el Admin
SGC lo convierte [Decisión de Claude, F15-DC8].

- **Quién y dónde.** Cualquier usuario con sesión, desde «Mejoramiento → Reportar» (la 15B añade
  el botón «Reportar» en la página de un documento, un proceso y un indicador, que llega con ese
  enlace puesto).
- **El formulario.** Qué vio (de 10 a 2.000 caracteres), cuándo, en qué proceso (opcional: «no
  sé»), hasta tres archivos de evidencia y, si aplica, la referencia del caso. Lleva el aviso de
  §6.4. Enviado, no se edita.
- **Qué hace el Admin SGC** («Reportes recibidos»), en 3 días hábiles: lo **convierte** en un
  hallazgo (se abre el registro de §7.4 con el reporte ya copiado; él completa la clase, el origen
  y lo demás), lo **añade como ocurrencia** de un hallazgo abierto (§7.5) o lo **descarta** con su
  motivo (al menos 10 caracteres). Nada se borra.
- **Qué ve quien reportó** («Mis reportes»): su reporte y una etiqueta: «Recibido», «En trámite»,
  «Cerrado» o «Descartado», con el motivo en el último caso. Nunca el contenido del hallazgo, ni su
  código. Recibe un aviso cuando el reporte se clasifica y cuando el hallazgo se cierra.
- **Qué ven los demás.** Los reportes los ven quienes tienen `mejora.ver_todo`. En el hallazgo que
  nace de un reporte, el nombre de quien reportó lo ven solo ellos (§6.3).

### 7.4 Registrar un hallazgo

Un solo formulario (maqueta 3). Lo que pasa al guardar, en una transacción: se asigna el código, se
guardan los archivos, se deja el evento `registrado`, la fila de bitácora, y los avisos.

El estado en que nace depende de quién registra y del origen:

| Quién registra | Origen | Nace |
|---|---|---|
| Admin SGC o Control Interno | Interno | «Por aceptar»: se avisa a los líderes del proceso |
| Un líder del proceso del hallazgo | Interno | Aceptado [Usuario, 5.1] |
| Cualquiera que pueda registrar | Externo | Aceptado [Usuario, 3.4] |
| Admin SGC o Control Interno | Interno, en un proceso sin líder activo | Aceptado [Decisión de Claude, F15-DC3] |

«Aceptado» lleva a «Por corregir» si es una no conformidad, o a «Por formular» si es una
observación o una oportunidad de mejora (§8).

Antes de guardar, el formulario dice las consecuencias de lo elegido, sin que nadie las marque: si
el hallazgo llevará acción correctiva obligada (reincidente, criticidad alta u origen externo) y si
lo aprobará Gerencia (criticidad alta u origen externo), y las fechas que resultan (§13).

### 7.5 Parecidos, reincidencia y ocurrencias

[Usuario, 11.5.] Al escribir el título y la descripción, el formulario muestra hasta cinco
hallazgos **del mismo proceso** que se les parecen, abiertos y cerrados (no los anulados ni los
rechazados), con el mismo mecanismo de la duplicidad de la 13A (`similarity` de `pg_trgm` sobre el
texto sin tildes; `src/db/consultas/parecidos.ts` es el modelo) [Decisión de Claude, F15-DC9]. Si
hay alguno, quien registra elige una de tres salidas:

1. **Es el mismo problema de uno abierto.** No nace otro hallazgo: se guarda una **ocurrencia** en
   el que ya existe (fecha, descripción, evidencia opcional, quién). Avisa a los líderes del
   proceso y al Admin SGC. Si ese hallazgo está en espera de eficacia, avisa además a quienes
   pueden verificarlo, como posible recurrencia, y la pantalla de evaluación la muestra (§11.4).
2. **Es reincidencia de uno cerrado.** Nace enlazado al anterior (`reincidente_de`), lleva la marca
   «Reincidente», obliga la acción correctiva (§8.5) y, al formular, le muestra al líder la causa y
   las acciones de la vez pasada.
3. **Es distinto.** Nace normal.

Precisiones [Decisión de Claude, F15-DC9]:

- Una ocurrencia la añade quien puede registrar hallazgos de ese proceso, desde el registro o
  desde la página del hallazgo, y el Admin SGC al clasificar un reporte o al resolver una marca de
  indicador (15B). No se añaden ocurrencias a un hallazgo terminado: lo que vuelve después del
  cierre es reincidencia.
- Las ocurrencias son de solo inserción y se ven en la página del hallazgo, con su fecha.
- El líder ve los parecidos de sus procesos, que es su alcance. Los de **otros** procesos se los
  muestra el sistema solo al Admin SGC cuando revisa el plan (§8.6) [Usuario, 7.7].

### 7.6 Editar, reclasificar y anular

[Decisión de Claude, F15-DC10.]

- **Editar.** Mientras el hallazgo está «Por aceptar», quien lo registró corrige cualquier campo de
  la identificación, salvo el código. Cada cambio deja su evento con el antes y el después.
- **Reclasificar.** Después, solo el Admin SGC, con justificación (al menos 10 caracteres): la
  clase, la criticidad, el origen con su fuente, el título, el requisito incumplido y la
  reincidencia (enlazarlo a un hallazgo cerrado del mismo proceso, o quitar el enlace). La
  descripción no se reescribe: se le añade una nota. Se puede hasta que se envía el plan de la
  ronda 1; desde entonces la identificación forma parte de lo firmado (§12). El proceso solo se
  cambia mientras está «Por aceptar», y vuelve a avisar a los líderes del proceso nuevo.
- **Qué arrastra reclasificar.** Las consecuencias se calculan otra vez (acción correctiva
  obligada, aprobación de Gerencia) y el estado puede cambiar, siempre por `transicionarHallazgo`:

  | Cambio | Estando en | Queda en |
  |---|---|---|
  | De no conformidad a observación u oportunidad | «Por corregir», «Por decidir» o «Por validar la corrección» | «Por formular»; la corrección registrada queda como historia |
  | De observación u oportunidad a no conformidad | «Por formular» | «Por corregir»; si ya tenía corrección registrada, «Por decidir», o «Por formular» si la acción correctiva es obligada |
  | La criticidad sube a alta, o se marca reincidente | «Por decidir» o «Por validar la corrección» | «Por formular» |
  | El origen pasa a externo | «Por aceptar», «Rechazado · por decidir» o «En arbitraje» | Aceptado (§7.4) |
  | El origen pasa a externo | «Por decidir» o «Por validar la corrección» | «Por formular» |
  | Cualquier otro | Cualquiera | El mismo |

  Bajar la criticidad, quitar la reincidencia o dejar de ser externo no devuelve el hallazgo a un
  paso anterior.
- **Anular.** El Admin SGC, con justificación, en cualquier estado no terminal: un registro hecho
  por error, un duplicado, un hallazgo que el ente retiró. Queda «Anulado», con su código y su
  historia; sus actividades sin terminar pasan a canceladas; se avisa a los líderes, a los
  responsables de actividades abiertas y a Gerencia si había aprobado. Un hallazgo anulado no
  cuenta en ningún cálculo ni en los totales del informe.

## 8. El recorrido (15A)

### 8.1 Estados

Se guardan dieciséis y se muestran con los nombres que el usuario vio en las maquetas [Maquetas;
Decisión de Claude, F15-DC11].

| Estado guardado | Lo que se ve | Quién tiene el turno |
|---|---|---|
| `por_aceptar` | Por aceptar | Los líderes del proceso |
| `rechazo` | Rechazado · por decidir | Quien lo registró |
| `arbitraje` | En arbitraje | Admin SGC, o Gerencia |
| `por_corregir` | Por corregir | Los líderes del proceso |
| `por_decidir` | Por decidir | Admin SGC |
| `por_validar` | «Por validar la corrección»; si no hubo corrección, «Por validar el cierre sin acción» | Quien puede validar (§8.5) |
| `por_formular` | Por formular | Los líderes del proceso |
| `en_revision` | En revisión | Admin SGC |
| `en_aprobacion` | En aprobación | Gerencia |
| `en_ejecucion` | En ejecución | Los responsables de las actividades |
| `por_verificar` | Por verificar | Quien puede verificar (§11.1) |
| `en_espera` | En espera de eficacia; desde la fecha mínima, «Por evaluar la eficacia» | Nadie; después, quien puede verificar |
| `por_cerrar` | Por cerrar | Admin SGC |
| `cerrado` | «Cerrado · eficaz», «Cerrado con corrección» o «Cerrado sin acción», según el resultado del cierre | — |
| `rechazado` | Rechazado | — |
| `anulado` | Anulado | — |

Lo que depende de la fecha **se calcula al leer, nunca se guarda**: «Por evaluar la eficacia»,
«Vencido hace N días» y «Con algo vencido» (alguna actividad vencida). Marcas que acompañan al
estado: «Reabierto · ronda N» (ronda mayor que 1, sin terminar), «Reincidente», «Cargado» (§15) y
«Con ajuste por decidir». Una función pura (`src/lib/mejoramiento/estados.ts`) da la etiqueta, la
marca y quién tiene el turno; la usan la lista, la página, las tareas, el Excel y los avisos.

### 8.2 Transiciones

Toda transición entra por una sola función, `transicionarHallazgo`
(`src/db/consultas/mejoramiento/flujo.ts`), como `transicionar` en los trámites: ningún otro código
cambia `estado` ni `ronda` [Decisión de Claude, F15-DC12]. La tabla es dato
(`src/lib/mejoramiento/transiciones.ts`), con su prueba por fila.

| Acción | Desde | Hacia | Firma |
|---|---|---|---|
| `registrar` | — | `por_aceptar`, o aceptado (§7.4) | — |
| `aceptar` | `por_aceptar` | `por_corregir` (no conformidad) o `por_formular` | — |
| `rechazar` | `por_aceptar` | `rechazo` | — |
| `retirar` | `rechazo` | `rechazado` | — |
| `sostener` | `rechazo` | `arbitraje` | — |
| `confirmar_hallazgo` | `arbitraje` | `por_corregir` o `por_formular` | — |
| `confirmar_rechazo` | `arbitraje` | `rechazado` | — |
| `corregir` | `por_corregir` | `por_decidir`, o `por_formular` si la acción correctiva es obligada | — |
| `decidir_si` | `por_decidir`, `por_validar` | `por_formular` | — |
| `decidir_no` | `por_decidir` | `por_validar` | — |
| `validar_correccion` | `por_validar` | `cerrado` (con corrección; sin acción, si no hubo corrección) | — |
| `devolver_correccion` | `por_validar` | `por_corregir` | — |
| `enviar_plan` | `por_formular` | `en_revision`, o `en_aprobacion` (§8.6) | Elaboró |
| `devolver_plan` | `en_revision`, `en_aprobacion` | `por_formular` | — |
| `revisar_plan` | `en_revision` | `en_aprobacion` si aplica Gerencia; si no, `en_ejecucion` | Revisó |
| `aprobar_plan` | `en_aprobacion` | `en_ejecucion` | Aprobó |
| `completar` (la hace el sistema al terminarse la última actividad) | `en_ejecucion` | `por_verificar` | — |
| `verificar_implementacion` | `por_verificar` | `en_espera`, o `en_ejecucion` si devolvió alguna actividad | — |
| `evaluar_eficaz` | `en_espera` | `por_cerrar`, o `cerrado` si verifica el Admin SGC | Verificó (y Cerró) |
| `evaluar_no_eficaz` | `en_espera` | `por_formular`, con la ronda siguiente | Verificó |
| `cerrar` | `por_cerrar` | `cerrado` (eficaz) | Cerró |
| `anular` | Cualquiera no terminal | `anulado` | — |
| `cargar` (§15) | — | `en_ejecucion`, o `por_verificar` si todas las actividades ya están terminadas | — |
| `reclasificar` (§7.6) | Hasta `por_formular` de la ronda 1 | El mismo, o el que dice la tabla de §7.6 | — |
| `ajustar` (al aprobarse un ajuste, §10.6) | `en_ejecucion`, `por_verificar` | El mismo; `en_ejecucion` si añade una actividad estando `por_verificar`; `por_verificar` si cancela la última actividad sin terminar | — |

Los seguimientos, las reasignaciones, las ocurrencias y el «escalar a Gerencia» no cambian el
estado: dejan su evento. La reclasificación y la aprobación de un ajuste sí pueden cambiarlo, y por
eso tienen su fila y pasan por la misma función. Quién puede ejecutar cada acción es §6.1.

### 8.3 Aceptación, rechazo y arbitraje

[Spec maestro §5.4; Usuario, 4.9.]

- **Aceptar o rechazar** (3 días hábiles): un líder del proceso. Rechazar exige justificación (al
  menos 10 caracteres) y solo existe en los orígenes internos.
- **Tras el rechazo** (3 días hábiles): quien registró lo **retira** (queda «Rechazado», con las dos
  razones a la vista) o lo **sostiene**, con su réplica.
- **Arbitraje** (3 días hábiles): decide el Admin SGC. Decide Gerencia cuando un Admin SGC registró
  el hallazgo [Usuario, 4.9] o lo sostuvo en lugar de quien lo registró [Decisión de Claude,
  F15-DC13: no arbitra quien ya tomó parte]. Confirma el hallazgo, que sigue su recorrido como
  aceptado, o confirma el rechazo. Es definitiva: un hallazgo confirmado no se vuelve a rechazar.
  Un rechazo solo existe en un proceso con líder: sin líder, el hallazgo nace aceptado (§7.4).

### 8.4 La corrección

[Usuario, 3.7; Documento del hospital, SGC-FO-AC-01 sección 2 y PC-02.] Solo en la no conformidad.
La registra un líder del proceso (o el Admin SGC, §6.1), en 3 días hábiles desde la aceptación
[Decisión de Claude, F15-DC14]:

- **«Sí requirió corrección»:** qué se hizo, quién fue el responsable (un usuario activo o, si no
  tiene cuenta, su nombre), la fecha en que se implementó y al menos un archivo de evidencia.
- **«No requiere corrección inmediata»:** la justificación (al menos 10 caracteres).

La corrección es del hallazgo, no de la ronda: se registra una sola vez.

### 8.5 La decisión y el camino corto

[Usuario, 4.1; Documento del hospital, SGC-PR-03 §5.2.]

- **Acción correctiva obligada.** Si el hallazgo es reincidente, de criticidad alta o de origen
  externo, no hay nada que decidir: registrada la corrección, pasa a «Por formular».
- **Si no es obligada,** el Admin SGC decide en 3 días hábiles, con justificación: «sí» (pasa a «Por
  formular») o «no» (pasa a «Por validar la corrección»). Puede citar el acta del Comité [Usuario,
  5.5].
- **Validar la corrección** (3 días hábiles): el Admin SGC o Control Interno, siempre que esa
  persona no haya registrado la corrección ni sea su responsable; si ninguno de los dos puede,
  Gerencia, con la misma regla de respaldo de §11.1. La valida (el hallazgo queda «Cerrado con
  corrección») o la devuelve con una nota (vuelve a «Por corregir»). Sin firma con clave: los cinco
  actos firmados son los de §12.
- **Sin corrección y sin acción correctiva** [Usuario, 16.2; ISO 10.2.1 a) y b); SGC-PR-03 §5.2 y
  actividad 2]. Si el líder registró «no requiere corrección inmediata» y el Admin SGC decidió
  «no», no hay corrección que validar: se validan **las dos justificaciones**. El estado guardado
  es el mismo (`por_validar`) y se muestra como «Por validar el cierre sin acción». Quien valida no
  puede ser quien registró el «no requiere corrección» **ni quien decidió el «no»**; el respaldo
  es el de §11.1. Validado, el hallazgo queda **«Cerrado sin acción»**. También se puede devolver
  (vuelve a «Por corregir») o exigirle la acción correctiva, como abajo. La lista lo filtra como
  un estado más, y el informe SGC-FO-28 lo cuenta en una línea aparte (§18.1).
- **Cambiar el «no» por «sí».** Mientras está «Por validar la corrección», el Admin SGC o Gerencia
  pueden exigir la acción correctiva, con justificación; pasa a «Por formular» (es el literal c del
  §5.2 del procedimiento: «así lo determine la Gerencia o el Comité»).
- **La observación y la oportunidad de mejora** no pasan por esta decisión: aceptadas, van directo a
  «Por formular».

### 8.6 Formular, revisar y aprobar

[Usuario, 4.4, 5.3 y 5.6; Documento del hospital, SGC-PR-03 actividades 3 y 4.]

**Formular.** Un líder del proceso arma el análisis (§9) y el plan (§10), que se guardan como
borrador las veces que haga falta. La causa raíz y el plan **se envían juntos**. Para enviar se
exige:

- en la no conformidad: al menos un análisis completo, al menos una causa raíz y las dos preguntas
  de cierre respondidas (en las otras clases el análisis es opcional, §9.5);
- al menos una acción, cada una con al menos una actividad, cada actividad con un responsable
  activo y con inicio no posterior a su fin, y con fin de hoy en adelante;
- en la no conformidad, al menos una acción de tipo **correctiva**: un plan con solo acciones
  preventivas o de mejora no cumple la acción correctiva que el hallazgo exige [Decisión de Claude,
  F15-DC15];
- cada acción correctiva enlazada al menos a una causa, y cada causa con al menos una acción o con
  la justificación de por qué no la requiere [Usuario, 7.6];
- el criterio de eficacia (§11.2).

Enviar pide la clave y deja la firma «Elaboró». El sistema guarda cuándo se envió el plan **por
primera vez** en la ronda: es lo que mide «Planes formulados a tiempo» (§18.3).

**Revisar** (3 días hábiles). El Admin SGC lee el análisis y el plan. La pantalla le muestra
además: las causas que quedaron sin acción; los hallazgos parecidos de **otros** procesos [Usuario,
7.7]; y, si es reincidente, lo que se hizo la vez pasada. Marca, si es el caso, «requiere recursos
adicionales o tiene impacto institucional», con una nota. Lo **devuelve** con observaciones (vuelve
a «Por formular», con 5 días hábiles para reenviarlo y una firma «Elaboró» nueva) o firma
«Revisó».

**Cuándo aprueba Gerencia.** Con cualquiera de estas cuatro condiciones [Usuario, 4.4]:

1. la no conformidad es de criticidad alta;
2. el origen es externo;
3. el revisor marcó «requiere recursos adicionales o tiene impacto institucional»;
4. quien elaboró es un Admin SGC.

Si no se cumple ninguna, la firma «Revisó» vale como aprobación y el hallazgo pasa a «En
ejecución».

La cuarta condición se aplica así [Decisión de Claude, F15-DC15]: cuando elabora un Admin SGC
(porque el proceso no tiene líder), revisa **otro** Admin SGC activo si lo hay; si no lo hay, el
envío pasa directo a «En aprobación», sin firma «Revisó». Nadie firma «Revisó» sobre lo que
elaboró.

**Aprobar** (3 días hábiles). Gerencia firma «Aprobó» o lo devuelve con observaciones.

**Lo que pasa al quedar aprobado,** por la firma «Aprobó» o por la «Revisó» que vale como
aprobación, en la misma transacción:

- el plan de la ronda queda congelado (§12.2) y se guarda qué rol lo aprobó;
- cada actividad guarda su **fecha de fin original**;
- se calcula y se guarda el **cierre previsto** de la ronda (§11.3);
- cada actividad se entrega a su responsable, con su aviso y su tarea (es la «delegación»)
  [Usuario, 10.2];
- en un hallazgo externo nace la tarea «Registrar la respuesta al ente» (§13.4).

### 8.7 Rondas

[Usuario, 4.7.] Cada ronda tiene su análisis, sus causas, sus acciones, sus actividades, su
criterio de eficacia, su verificación y su evaluación. La ronda 1 nace con el hallazgo. Una
evaluación «no eficaz» cierra la ronda en curso, que queda congelada y a la vista como «Ronda N ·
no eficaz», y abre la siguiente en «Por formular», con 10 días hábiles. La ronda nueva empieza
vacía; el formulario ofrece «Partir del análisis anterior», que lo copia como borrador. No hay
tope de rondas: el número se ve en la lista y en el informe.

## 9. Causa raíz (15A; el Pareto, en la 15C)

[Usuario, 7.1 y 7.4 a 7.8; Documento del hospital, SGC-PR-03 §5.3 y los formatos SGC-FO-AC-02 a
04.]

### 9.1 Un análisis

Cada ronda lleva uno o más análisis [Usuario, 7.5]. Cada análisis tiene un método, el equipo que lo
hizo (texto), sus observaciones y el contenido propio del método. El contenido se guarda
estructurado y validado con un esquema por método [Decisión de Claude, F15-DC16].

| Método | Contenido | Completo cuando |
|---|---|---|
| **5 porqués** | De uno a cinco niveles, en orden y sin huecos. Cada nivel: la respuesta y, opcional, la evidencia que la sostiene | Tiene al menos el primer nivel |
| **Ishikawa (6M)** | Causas posibles por categoría: mano de obra, método, máquina o equipo, material, medición y medio ambiente. Cada causa se marca confirmada o no. Las confirmadas llevan su impacto (alto, medio o bajo) y si requieren acción | Tiene al menos una causa confirmada |
| **Pareto** (15C) | §18.2 | — |
| **Otro método** | El nombre del método, su descripción y adjuntos opcionales. Para una lluvia de ideas o el Protocolo de Londres en un evento adverso [Usuario, 7.4] | Tiene nombre y descripción |

El formulario de 5 porqués recuerda que no siempre hacen falta los cinco: se detiene en una causa
sobre la que se pueda actuar (es la instrucción del formato).

### 9.2 Las causas raíz

[Usuario, 7.6.] Son una **lista de la ronda**, no un campo de cada análisis: una o más causas, cada
una en una frase. Las acciones correctivas del plan dicen cuál atacan. Una causa que no lleva
acción exige su justificación («no requiere acción porque…»).

### 9.3 Las dos preguntas de cierre

[Usuario, 7.7. ISO 10.2.1 b) 3, e) y f).] Son de la ronda y son obligatorias cuando el análisis lo
es:

1. **¿Hay no conformidades similares en otros procesos?** Sí, con cuáles (texto), o no.
2. **¿Se requieren cambios en documentos, riesgos o controles?** Se marca cada uno que aplique
   (documentos, matriz de riesgos, controles), con su descripción, o «no».

La segunda respuesta la retoma el cierre (§11.5).

### 9.4 Lo que el formulario muestra sin pedirlo

- Si el hallazgo es reincidente: la causa y las acciones del hallazgo anterior (§7.5).
- Si viene de una medición (15B): la causa y la acción propuesta que escribió quien analizó el
  indicador, como punto de partida.

### 9.5 Cuándo es obligatorio

[Usuario, 7.8.] En la no conformidad que lleva acción correctiva, siempre. En la observación y la
oportunidad de mejora es opcional: el plan se puede enviar sin análisis, sin causas y sin las dos
preguntas.

## 10. El plan de acción (15A)

### 10.1 Acciones

[Usuario, 2.4 y 3.8; Documento del hospital, SGC-FO-AC-01 sección 4 y SGC-FO-14.]

| Campo | Regla |
|---|---|
| Número | A1, A2… en el orden del plan |
| Tipo | Correctiva, preventiva o de mejora. El sistema propone el de la clase (no conformidad: correctiva; observación: preventiva; oportunidad: de mejora) y se puede cambiar |
| Descripción | Qué se va a hacer |
| Causa que ataca | Una o varias de la lista de §9.2. Obligatoria en la acción correctiva |
| Recursos necesarios | Texto, opcional |
| Indicador de cumplimiento y meta | Dos textos, como en las columnas del SGC-FO-14: cómo se sabrá que la acción se cumplió |

### 10.2 Actividades

[Usuario, 2.4, 10.1 y 10.2.] Toda acción tiene al menos una. La actividad lleva: la descripción, el
**responsable** (cualquier usuario activo), el **inicio** y el **fin**. El formulario del caso simple
es una fila por acción; «Añadir otra actividad» aparece debajo (maqueta 5).

Estados de la actividad [Decisión de Claude, F15-DC17]:

| Guardado | Lo que se ve |
|---|---|
| `abierta` | Abierta (sin seguimientos) |
| `en_proceso` | En proceso |
| `terminada` | Terminada; con la verificación, «Conforme» o «Devuelta» |
| `cancelada` | Cancelada |

Se calculan al leer: «Vencida hace N días» (sin terminar y con el fin vigente ya pasado) y la marca
«Reprogramada» (tiene al menos una reprogramación aprobada). Son las convenciones de estado del
SGC-FO-14 y el SGC-FO-28.

**Reasignar** [Usuario, 10.2]: un líder del proceso o el Admin SGC cambian el responsable de una
actividad sin terminar, con motivo (al menos 10 caracteres) y sin aprobación. Deja su evento y
avisa a los dos. El responsable anterior conserva la lectura del hallazgo solo si registró algún
seguimiento en él.

### 10.3 Seguimientos y avance

[Usuario, 10.3; Documento del hospital, SGC-FO-AC-01 sección 5.] El responsable registra
seguimientos: la fecha (de hoy hacia atrás), qué se hizo, el **avance** (un entero de 0 a 100), las
barreras (opcional) y archivos de evidencia (opcionales). Son de **solo inserción**: uno equivocado
se corrige con otro [Decisión de Claude, F15-DC18]. El avance de un seguimiento no puede ser menor
que el del anterior, salvo después de una devolución.

El avance de la acción es el promedio simple del avance de sus actividades no canceladas; el del
hallazgo, el promedio simple del de sus acciones; se muestra como entero [Usuario, 10.3].

### 10.4 Terminar una actividad

[Usuario, 10.4; Documento del hospital, PC-05 y riesgo R-03.] La termina su responsable, con el
avance en 100 y **al menos una evidencia**. Vale como evidencia un archivo de cualquier seguimiento
de esa actividad o, desde la 15B, un enlace que el sistema puede comprobar: el trámite documental
enlazado a la actividad, ya publicado (§17.5) [Decisión de Claude, F15-DC19: la maqueta 7 muestra
esa publicación, anotada por el sistema, como la evidencia de la actividad]. El sistema guarda
cuándo terminó de verdad.

Cuando la última actividad no cancelada del hallazgo queda terminada, el hallazgo pasa solo a «Por
verificar».

### 10.5 Recordatorio de seguimiento

[Usuario, 10.5.] Una actividad sin terminar y ya iniciada, sin seguimiento en 15 días (no
conformidad de criticidad alta) o en 30 (las demás), se lo recuerda a su responsable. Los días son
**calendario**, se cuentan desde el último seguimiento o, si no hay ninguno, desde el inicio de la
actividad, y los dos valores son configurables. El recordatorio se repite cada vez que vuelve a
cumplirse el plazo [Decisión de Claude, F15-DC20].

### 10.6 Ajustes al plan aprobado

[Usuario, 10.7; Documento del hospital, PC-07.] Un plan aprobado solo cambia por un **ajuste**.

| Tipo | Qué pide | Qué hace al aprobarse |
|---|---|---|
| Reprogramar | Una actividad sin terminar y su fecha de fin nueva, de hoy en adelante | Cambia el fin vigente, suma una reprogramación y borra las marcas de aviso. **La fecha de fin original no cambia nunca** |
| Añadir | Una actividad nueva, en una acción existente o en una acción nueva | La actividad entra con su fin como fecha original y se entrega a su responsable |
| Cancelar | Una actividad sin terminar | La actividad queda «Cancelada». No se puede cancelar la última actividad no cancelada del hallazgo |

Reglas [Decisión de Claude, F15-DC21]:

- **Quién lo pide:** el responsable (solo reprogramar la suya), un líder del proceso o el Admin SGC.
  Siempre con la causa (al menos 10 caracteres).
- **Quién lo decide** (3 días hábiles): el rol que aprobó el plan de esa ronda. Si lo aprobó
  Gerencia, cualquier usuario de Gerencia; si valió la revisión, un Admin SGC. **Quien pide no
  decide:** si lo pidió el único Admin SGC activo, decide Gerencia. Aprueba o niega, con nota, y
  puede citar el acta del Comité.
- **Mientras se decide,** la actividad sigue como está: si venció, sigue vencida [Usuario, 10.7].
  Solo hay un ajuste pendiente por actividad.
- **Cuándo se puede:** con el hallazgo «En ejecución» o «Por verificar». Añadir una actividad a un
  hallazgo «Por verificar» lo devuelve a «En ejecución». Cancelar la última actividad sin terminar
  lo lleva a «Por verificar».
- **Qué no toca:** el plan congelado, las fechas originales ni el cierre previsto (§11.3 y §12.2).
  El ajuste es un registro aparte, con su antes y su después, que la página y el impreso listan.

### 10.7 Escalar a Gerencia

[Usuario, 10.6; Documento del hospital, SGC-FO-28.] El Admin SGC escala una actividad vencida, con
una nota (al menos 10 caracteres). Avisa a Gerencia, deja su evento y la actividad muestra
«Escalada a Gerencia el…». Gerencia puede responder con una nota y citar el acta. No cambia ningún
estado; es la «Decisión Alta Dirección: Escalar» que el informe muestra [Usuario, 8.4].

## 11. Verificación, eficacia y cierre (15A)

### 11.1 Quién puede verificar

[Usuario, 5.4; Documento del hospital, SGC-PR-03 §5.6.] La regla es una sola función
(`puedeVerificar`, en `src/lib/alcance.ts`), que usan la verificación de la implementación y la
evaluación de eficacia, y que se repite dentro de la transacción:

- La persona tiene `mejora.verificar` y **no ejecutó** en ese hallazgo. «Ejecutó» es: ser o haber
  sido responsable de alguna de sus actividades, en cualquier ronda; haber registrado algún
  seguimiento; haber terminado alguna actividad; haber registrado la corrección o ser su
  responsable [Decisión de Claude, F15-DC22: la lista cerrada de qué es «ejecutar»].
- Pueden el Admin SGC y Control Interno. Gerencia solo cuando **ningún** Admin SGC ni Control
  Interno activo cumple lo anterior.
- **No hay excepción de «único administrador».** Si nadie puede, el acto se rechaza y la pantalla
  dice por qué; se resuelve dando el rol a otra persona.

La tarea de verificar le aparece a todos los que pueden; la hace el primero.

### 11.2 El criterio de eficacia

[Usuario, 11.2; Documento del hospital, SGC-PR-03 §5.5 y SGC-FO-AC-01 sección 6.] Se define al
formular, por ronda. Uno o más de:

- no recurrencia;
- mejora del indicador asociado, con el **indicador enlazado**;
- reducción de PQRS o eventos;
- otro, con su descripción.

En la observación y la oportunidad de mejora se define además la **fecha de evaluación**, que
escribe quien formula (no anterior al fin de la última actividad).

El indicador enlazado [Decisión de Claude, F15-DC23]:

- Se elige entre los indicadores activos, con ficha vigente, que quien formula puede ver.
- Su nombre y sus resultados se le muestran solo a quien puede ver ese indicador
  (`puedeVerIndicador`); a los demás, «un indicador», sin cifras.
- Si después se retira, la espera vuelve a ser la de dos meses y la evaluación lo dice: el
  criterio «mejora del indicador» ya no se puede marcar como evaluado.
- Si cambia de periodicidad, la fecha mínima se calcula con la que rija ese día.
- Si sus periodos están sin dato o «no aplica», el sistema lo muestra y no bloquea: quien verifica
  decide, con su justificación.

### 11.3 Las dos fechas

[Usuario, 11.3 y 14.5; Maquetas.] Son dos fechas distintas y no se mezclan [Decisión de Claude,
F15-DC24].

**La fecha mínima de eficacia** es la real. Se calcula al leer, nunca se guarda, y es la que impide
registrar «eficaz». Parte de **R**: el día en que terminó de verdad la última actividad no
cancelada de la ronda.

- En la no conformidad con acción correctiva es **la mayor** de dos: R más dos meses calendario
  (con `sumarMeses`), y, si hay indicador enlazado activo, el día siguiente al fin del **segundo
  periodo completo** del indicador que empieza después de R. Ejemplo: la última actividad termina
  el 5 de diciembre y el indicador es mensual; los periodos completos posteriores son enero y
  febrero; se evalúa desde el 1 de marzo [Maquetas]. Sin indicador sería el 5 de febrero.
- En la observación y la oportunidad de mejora es la fecha de evaluación del plan, o R si R es
  posterior.

**El cierre previsto** es la planeada. Se calcula una vez, al aprobarse el plan de la ronda, y se
guarda. Es la misma cuenta, pero partiendo del mayor **fin planeado** de las actividades aprobadas
en lugar de R, más el plazo de evaluar la eficacia (§11.4, que con indicador enlazado incluye los
días de su plazo de reporte) y el de cerrar. Contra ella se juzga «Hallazgos cerrados a tiempo»
(§18.3).

Qué mueve cada una:

| Hecho | Fecha mínima de eficacia | Cierre previsto |
|---|---|---|
| Una actividad se termina antes o después de su fin | Se mueve con R | No cambia |
| Una actividad devuelta se termina otra vez | Se mueve con R | No cambia |
| Un ajuste reprograma, añade o cancela | Se mueve con R (la cancelada sale de la cuenta) | No cambia |
| El indicador cambia de periodicidad o se retira | Se recalcula | No cambia |
| Se abre una ronda nueva | La ronda tiene la suya | La ronda tiene el suyo |

### 11.4 Verificar la implementación y evaluar la eficacia

**Verificar la implementación** (5 días hábiles desde que el hallazgo pasa a «Por verificar»)
[Usuario, 11.1; PC-08]. En un solo acto, quien verifica marca cada actividad terminada como
**conforme** o la **devuelve**, con su nota (al menos 10 caracteres) y una fecha para corregir (de
hoy en adelante), y marca cómo verificó (al menos una): revisión de evidencias, observación en
sitio, auditoría de seguimiento o entrevista. Puede añadir una nota y archivos.

- Si devuelve alguna, esas actividades vuelven a «En proceso» con su nota y su fecha para corregir
  (su fecha de fin original no cambia), y el hallazgo vuelve a «En ejecución».
- Con todas conformes, el hallazgo pasa a «En espera de eficacia». No lleva firma con clave: queda
  quién y cuándo.

**Evaluar la eficacia** [Usuario, 11.3 y 11.4; PC-09]. La tarea aparece en la fecha mínima y vence
5 días hábiles después. Con indicador enlazado, antes de esos 5 días se suman los días calendario
del plazo de reporte del indicador (`indicadores.plazo_reporte_dias`), para que el resultado del
segundo periodo ya esté reportado [Decisión de Claude, F15-DC24]. La
pantalla muestra, sin que nadie lo busque: el criterio del plan; los resultados del indicador
enlazado, desde dos periodos antes de R hasta el último medido, marcados «antes», «durante» y
«después»; y las ocurrencias registradas después de R. Quien verifica registra los criterios que
evaluó, el periodo evaluado, el resultado, la justificación (al menos 20 caracteres) y, si quiere,
archivos. Firma «Verificó».

- **«Eficaz»** solo se puede registrar desde la fecha mínima. Si hay ocurrencias posteriores a R, el
  formulario lo advierte y pide confirmarlo.
- **«No eficaz»** se puede registrar en cualquier momento de la espera.
- Lo que la pantalla mostró (los resultados del indicador y las ocurrencias) queda **congelado** en
  la verificación, para que el registro diga con qué se decidió.
- Si quien verifica encontró un problema **distinto**, lo registra como otro hallazgo, enlazado a
  este («derivado de») [Usuario, 4.7].

### 11.5 Cerrar y reabrir

[Usuario, 4.7, 5.6, 5.8 y 11.4; PC-10.]

- **Eficaz.** El Admin SGC cierra (3 días hábiles): escribe las **lecciones aprendidas** (al menos
  10 caracteres) y firma «Cerró». Si la segunda pregunta del análisis dijo que se requerían cambios
  en documentos, riesgos o controles, el cierre pide decir cómo se atendió cada uno; la 15B lo
  comprueba además contra el trámite enlazado (§17.5). Si quien evaluó la eficacia es el Admin SGC,
  evalúa y cierra en el mismo acto, con una sola clave y las dos firmas.
- **Al cerrar:** avisos a los líderes del proceso, a quien lo registró y a Gerencia, que no firma
  [Usuario, 5.8]; quien reportó ve «Cerrado».
- **No eficaz.** Se abre la ronda siguiente (§8.7) y se avisa a los líderes.
- **Un hallazgo cerrado, rechazado o anulado no cambia.** Lo que vuelva a pasar después es otro
  hallazgo, reincidente (§7.5).

## 12. Firmas, huellas e inmutabilidad (15A)

### 12.1 Los cinco actos firmados

[Usuario, 5.6.] Con el mecanismo de los documentos y los indicadores: `verificarParaFirmar` fuera
de la transacción, un validador de solo lectura antes y todo repetido dentro con el hallazgo
bloqueado (F13A-R4). Las firmas van en `firmas`, con el hallazgo como dueño, la `ronda` del hallazgo
y dos valores nuevos, `verifico` y `cerro` (§19).

| Firma | Quién | Qué cubre su huella |
|---|---|---|
| Elaboró | Quien envía el plan | El plan de la ronda: la identificación del hallazgo, la corrección, los análisis, las causas, las dos preguntas, las acciones con sus actividades (el responsable, por el nombre con que se firmó) y el criterio de eficacia |
| Revisó | Admin SGC | La misma huella |
| Aprobó | Gerencia | La misma huella |
| Verificó | Quien evalúa la eficacia | La evaluación: el resultado, los criterios, el periodo, la justificación y lo congelado de §11.4, más la huella del plan |
| Cerró | Admin SGC | Las lecciones aprendidas, el resultado y la huella de la evaluación |

La huella es el SHA-256 de un texto canónico (`huellaDePlan`, `huellaDeEvaluacion` y
`huellaDeCierre`, en `src/lib/mejoramiento/huellas.ts`), como `huellaDeFicha` en los indicadores
[Decisión de Claude, F15-DC25]. Entre el envío y la aprobación el plan no se edita: una devolución
exige otra firma «Elaboró», con la huella nueva.

### 12.2 Qué queda congelado

- **El plan aprobado.** El evento de aprobación guarda la copia completa del plan firmado
  (`detalle.plan`) con su huella, como el acta en los trámites. Los ajustes posteriores cambian las
  filas vivas y dejan su propio evento; la copia no se toca.
- **La evaluación.** El evento guarda lo que la pantalla mostró.
- **El hallazgo terminado.** Un trigger rechaza `UPDATE` y `DELETE` sobre un hallazgo en `cerrado`,
  `rechazado` o `anulado`, y sobre sus filas hijas, y la inserción de hijas nuevas
  (`sgc_impedir_si_hallazgo_terminado`), como el de la revisión anual cerrada. El evento del acto
  que lo termina se escribe en esa misma transacción, antes de cambiar el estado.
- **De solo inserción** (trigger que rechaza `UPDATE` y `DELETE` también al dueño del esquema, más
  el `REVOKE` de `sgc_app`): los eventos del hallazgo, los eventos de un reporte, los seguimientos
  y las ocurrencias.

Lo «hecho fuera de la plataforma» de un hallazgo cargado (§15) no lleva firma del sistema: es un
evento con esa marca.

## 13. Días hábiles y plazos (15A)

### 13.1 Qué es un día hábil

[Usuario, 6.1 y 6.4.] De lunes a viernes, salvo:

- **los festivos de Colombia,** que el sistema calcula con la regla de la ley (Ley 51 de 1983): los
  de fecha fija, los que se trasladan al lunes siguiente y los que dependen de la Pascua. No hay
  tabla que mantener ni consulta a internet. La regla está en el Apéndice C;
- **los días no hábiles de la entidad,** una lista (fecha y motivo) que edita el Admin SGC en la
  configuración del módulo. Sirve para un día cívico o un cierre institucional, y para un festivo
  nuevo que cree una ley mientras se actualiza la plataforma.

El sábado no es hábil [Decisión de Claude, F15-DC26].

### 13.2 Cómo se cuenta

[Decisión de Claude, F15-DC26.] Una función pura (`src/lib/dias-habiles.ts`), con el reloj y la
zona inyectados:

- El día del hecho no cuenta, sea hábil o no: el plazo de N días hábiles vence **al final del
  N-ésimo día hábil posterior al hecho**, en la zona de la instalación. Un hecho del sábado con un
  plazo de 3 días vence el miércoles, igual que uno del viernes.
- Hay tres operaciones: sumar días hábiles a una fecha, restarlos, y contar los que hay entre dos
  fechas («quedan 5 días hábiles»).
- Un día no hábil añadido o quitado después **no mueve** los vencimientos ya calculados: valen para
  lo que se calcule desde entonces.

Las pruebas de los festivos se escriben contra el calendario oficial publicado de al menos tres
años, no contra una lista de memoria (Apéndice C).

### 13.3 Los plazos

[Usuario, 6.5.] En días hábiles, configurables por el Admin SGC, de 1 a 60.

| Paso | Por omisión | Corre desde | De dónde sale |
|---|---|---|---|
| Formular la causa raíz y el plan | 10 | El registro del hallazgo | SGC-PR-03 §5.4 |
| Clasificar un reporte | 3 | El reporte | [Usuario, 6.5] |
| Aceptar o rechazar | 3 | El registro | [Usuario, 6.5] |
| Revisar el plan | 3 | El envío | [Usuario, 6.5] |
| Aprobar el plan | 3 | La revisión | [Usuario, 6.5] |
| Verificar la implementación | 5 | El momento en que el hallazgo pasa a «Por verificar» | [Usuario, 6.5] |
| Pasos de una sola decisión: retirar o sostener, arbitrar, decidir la acción correctiva, validar la corrección, decidir un ajuste, cerrar | 3 | El paso anterior | [Usuario, 6.5] |
| Registrar la corrección | 3 | La aceptación | [Decisión de Claude, F15-DC14] |
| Reenviar un plan devuelto | 5 | La devolución | [Decisión de Claude, F15-DC14] |
| Evaluar la eficacia | 5 | La fecha mínima de eficacia, más el plazo de reporte del indicador enlazado si lo hay (§11.4) | [Decisión de Claude, F15-DC14] |

El plazo de formular tiene reglas propias [Usuario, 6.5; Decisión de Claude, F15-DC27]:

- Se fija al registrar y **no se corre** por lo que tarden la aceptación, la corrección o la
  primera decisión: el procedimiento lo cuenta desde el registro. Si el hallazgo llega a «Por
  formular» con ese plazo ya pasado, nace vencido, y así lo mide «Planes formulados a tiempo».
- **Se cuenta de nuevo, desde ese acto,** cuando el plan se vuelve exigible por un acto posterior
  que no depende del líder: la decisión de un arbitraje; la exigencia de la acción correctiva
  después de un «no» (§8.5); una reclasificación que cambia el estado (§7.6); y la reapertura, en
  una ronda nueva. Sin esto, esos hallazgos nacerían vencidos y contarían en contra de quien no
  tuvo los 10 días.
- En un hallazgo que nació de un reporte, «el registro» es el momento en que el Admin SGC lo
  convirtió en hallazgo.

Las fechas de las actividades no son plazos: las escribe quien formula. Los recordatorios de
seguimiento (§10.5), el aviso al jefe (§14.3) y los dos meses de la espera (§11.3) van en días o
meses **calendario**.

### 13.4 La fecha del ente

[Usuario, 6.6; Documento del hospital, SGC-PR-03 §5.8.] En el origen «Ente de control» la **fecha
límite de respuesta** es obligatoria; en «Auditoría externa», opcional. Cuando existe [Decisión de
Claude, F15-DC28]:

- **Reemplaza los 10 días.** El plan debe enviarse a revisión antes de esa fecha menos los plazos de
  revisar y de aprobar (en días hábiles), para que llegue aprobado a tiempo. Si esa cuenta da una
  fecha anterior al registro, vence el mismo día del registro y el formulario lo advierte.
- **Nace una tarea** para el Admin SGC al aprobarse el plan: «Registrar la respuesta al ente», que
  vence en la fecha del ente. Se cumple registrando la fecha de envío y el oficio (un archivo).
- El formato en que se responde llega con la plantilla del ente, en la 15B (§17.2).

## 14. Tareas, avisos y vencimientos (15A)

Extiende lo de los specs 13A §14, 13B §12 y 14 §10. «Mis tareas» se calcula del estado; los avisos
se guardan en `notificaciones`; el correo llega en la Fase 16.

### 14.1 Tareas

Módulo `planes` de `Tarea` (ya previsto en `src/lib/tareas.ts`). Las calcula
`tareasDeMejoramiento`, que `misTareas` suma a las demás.

| Tarea | Para quién | Vence |
|---|---|---|
| Clasificar el reporte de… | Admin SGC | Plazo de clasificar |
| Aceptar o rechazar HZ-… | Líderes del proceso | Plazo del paso |
| Decidir sobre el rechazo de HZ-… | Quien lo registró | Plazo del paso |
| Arbitrar el rechazo de HZ-… | Admin SGC, o Gerencia | Plazo del paso |
| Registrar la corrección de HZ-… | Líderes del proceso | Plazo del paso |
| Decidir si HZ-… requiere acción correctiva | Admin SGC | Plazo del paso |
| Validar la corrección de HZ-… | Quien puede validarla | Plazo del paso |
| Formular la causa raíz y el plan de HZ-… | Líderes del proceso | Plazo de formular |
| Revisar el plan de HZ-… | Admin SGC | Plazo del paso |
| Aprobar el plan de HZ-… | Gerencia | Plazo del paso |
| La actividad, por su descripción | Su responsable | Su fin vigente, o su fecha para corregir |
| Decidir el ajuste de HZ-… | Quien lo decide (§10.6) | Plazo del paso |
| Verificar la implementación de HZ-… | Quien puede verificar | Plazo del paso |
| Evaluar la eficacia de HZ-… | Quien puede verificar | Aparece en la fecha mínima; plazo de evaluar |
| Cerrar HZ-… | Admin SGC | Plazo del paso |
| Registrar la respuesta al ente de HZ-… | Admin SGC | La fecha del ente |

Cuando el proceso no tiene líder, las tareas del líder son del Admin SGC (§6.1). El título de una
tarea nunca lleva el contenido del hallazgo: lleva su código y, para quien tiene alcance, su título.

### 14.2 Avisos

[Usuario, su punto 3.2: «con avisos en cada etapa».] Cada transición avisa a quien recibe el turno.
Además:

- al registrar: a los líderes del proceso; si el origen es externo, también a Gerencia y al Admin
  SGC (en la Fase 16 ese aviso sale además de inmediato por correo, como dice el spec maestro
  §5.6);
- al aprobarse el plan: a cada responsable, por su actividad;
- una ocurrencia, una reasignación, un ajuste pedido y decidido, una devolución, una escalada, la
  reapertura y el cierre: a quienes §7 a §11 dicen.

Los tipos llevan el prefijo `mejora.`. El texto de un aviso a quien no tiene alcance sobre el
hallazgo (el jefe) no lleva su contenido.

### 14.3 Vencimientos

La pasada `revisarVencimientosDeMejoramiento` se suma a `revisarVencimientos` después de la de
indicadores, con los mismos pasos idempotentes y sus marcas (`aviso_vencido_en`, `escalado_en`):

1. **Pasos vencidos** de un hallazgo y de un reporte: avisa a quien tiene el turno.
2. **Actividades vencidas:** avisa al responsable [Usuario, 10.6].
3. **Escalamiento:** a los días de `escalamiento_dias` (el valor que ya comparten los demás
   módulos, en días calendario), avisa a los jefes por jerarquía (`jefesDe`), con quién y desde
   cuándo, sin el contenido [Usuario, 10.6].
4. **Recordatorios de seguimiento** (§10.5).
5. **Eficacia por evaluar:** al llegar la fecha mínima, avisa a quienes pueden verificar.

Cada cambio de paso, cada reprogramación aprobada y cada devolución borran las marcas del paso
anterior.

## 15. Registrar un hallazgo ya en curso (15A)

[Usuario, 15.1, 15.3 y 15.4.] Para los hallazgos que el hospital tramitó en papel antes de la
plataforma, y para los de cualquier entidad que la instale con hallazgos abiertos. Solo el Admin
SGC, desde «Registrar hallazgo → Ya está en curso».

Tiene **un solo punto de entrada: el plan ya aprobado por fuera** [Decisión de Claude, F15-DC29].
Un hallazgo que todavía no tiene plan aprobado no necesita carga: se registra por el camino normal,
con su fecha de detección real.

Lo que se registra:

- la identificación de §7.1, con la fecha real de registro en papel;
- la corrección (o que no la requirió), con su fecha;
- el método de análisis y las causas raíz; el contenido estructurado del método es opcional;
- las acciones y sus actividades, con sus fechas, su avance actual y, las ya terminadas, la fecha
  en que terminaron;
- el criterio de eficacia;
- quién aprobó el plan (nombre y cargo, como texto), en qué fecha y **qué rol lo aprobó**: Gerencia
  o el Coordinador SGC;
- **el formato firmado, escaneado** (obligatorio): es la evidencia de lo hecho por fuera.

Lo que pasa:

- El hallazgo recibe su código `HZ` del año en que se carga y entra «En ejecución», o «Por
  verificar» si todas sus actividades ya están terminadas.
- Cada paso hecho en papel queda como un evento marcado **«hecho fuera de la plataforma»**, con su
  fecha real y sin firma del sistema. El plan aprobado por fuera queda congelado igual (§12.2).
- La fecha de fin original de cada actividad es la que se carga, y el cierre previsto se calcula
  con la fecha de aprobación que se declaró.
- Los ajustes de ese plan los decide el rol que se declaró (§10.6); si el hallazgo es de criticidad
  alta o de origen externo, Gerencia en todo caso.
- Queda la marca **«Cargado»** en la lista, en la página, en el impreso y en la bitácora.
- Desde ahí sigue el recorrido normal: las actividades se entregan a sus responsables, y la
  verificación, la eficacia y el cierre se hacen en la plataforma, con sus firmas.
- No cuenta en «Planes formulados a tiempo»; en los demás cálculos cuenta con sus fechas reales
  [Usuario, 15.3].

## 16. Pantallas, navegación e impresos (15A)

### 16.1 Navegación y rutas

[Maquetas; Decisión de Claude, F15-DC30.] Un grupo nuevo en la barra lateral, **«Mejoramiento»**,
con su color de módulo: el token `mod-planes`, que la Fase 12 ya dejó en `src/app/globals.css` para
este módulo. La entrada la ve toda sesión, porque todos pueden reportar.

| Ruta | Qué es | Quién |
|---|---|---|
| `/mejoramiento` | La lista de hallazgos (maqueta 1) | Quien ve algún hallazgo; los demás van a «Mis actividades» o a «Mis reportes» |
| `/mejoramiento/nuevo` | Registrar (maqueta 3) y «Ya está en curso» (§15) | `mejora.registrar` |
| `/mejoramiento/[id]` | La página del hallazgo (maqueta 2) | Quien lo ve (§6.3) |
| `/mejoramiento/[id]/formular` | Análisis y plan (maquetas 4 y 5) | Quien formula |
| `/mejoramiento/[id]/imprimir` | Los impresos (§16.4) | Quien lo ve completo |
| `/mejoramiento/actividades` | «Mis actividades» | Toda sesión |
| `/mejoramiento/actividades/[id]` | La actividad (maqueta 6) | Su responsable y quien ve el hallazgo completo |
| `/mejoramiento/reportar` y `/mejoramiento/reportes` | Reportar, «Mis reportes» y «Reportes recibidos» | Toda sesión; lo recibido, `mejora.ver_todo` |
| `/admin/mejoramiento` | Configuración: plazos, días no hábiles y formatos | `mejora.gestionar` |

Cada página llama `exigirSesion()` y después su regla de alcance con `notFound()` (el patrón de
`exigirIndicador`: aquí, `exigirHallazgo` y `exigirActividad` en `app/(app)/mejoramiento/_comun.ts`),
nunca `exigirPermiso`; la de configuración sí va con `exigirPermiso`. Las acciones van en
`src/app/acciones-mejoramiento.ts` (las de configuración, en `src/app/admin/acciones-mejoramiento.ts`),
las consultas en `src/db/consultas/mejoramiento/`, las reglas puras en `src/lib/mejoramiento/` y los
componentes en `src/componentes/mejoramiento/`.

### 16.2 Las pantallas

Las siete maquetas son la referencia. Lo que cada una debe cumplir:

1. **La lista.** Cifras arriba (abiertos, con algo vencido, esperan la decisión de quien mira, en
   espera de eficacia, reabiertos), que son a la vez filtros. Filtros por proceso, origen, clase,
   criticidad, estado y «solo vencidos»; búsqueda por código y título. Columnas: código, hallazgo
   (título, clase y marcas), proceso, origen, criticidad, en qué va (con quién tiene el turno),
   avance y vence. En 390 px cada fila es una tarjeta.
2. **La página del hallazgo.** El recorrido arriba: los pasos de esa clase y ese camino, con los
   hechos, el actual y los que faltan; no es un control de navegación. Debajo, una sección por
   etapa en el orden del SGC-FO-AC-01: las hechas, plegadas con su resumen en una línea; la actual,
   abierta; las que faltan no aparecen. Las rondas anteriores, plegadas. A la derecha: «Lo que
   sigue» (la acción que le toca a quien mira, o quién tiene el turno), las fechas (plan formulado,
   cierre previsto, reprogramaciones), los enlaces y las ocurrencias. Arriba, «Imprimir» e
   «Historial» (los eventos, con quién y cuándo).
3. **Registrar.** §7.4, con los parecidos a la derecha.
4. **El análisis.** Una pestaña por método; lo común (causas y las dos preguntas) a la derecha.
5. **El plan.** Una tarjeta por acción con sus actividades; abajo, el criterio de eficacia con la
   fecha que resulta (el aviso «se podrá evaluar desde…») y las firmas con sus plazos.
6. **La actividad.** Pensada para el teléfono: qué hay que hacer, de qué hallazgo es, el avance, el
   formulario de seguimiento, «Pedir ajuste de fecha» y «Terminar».
7. **Verificar y evaluar.** §11.4.

La búsqueda global del cascarón encuentra hallazgos por código y título, solo los que la persona ve
[Decisión de Claude, F15-DC30].

### 16.3 Excel de la lista

[Usuario, 8.8.] «Excel» exporta lo que la lista muestra con sus filtros, con una fila por actividad
y las columnas de la matriz consolidada del SGC-FO-28 (Apéndice A.6), más el código y la ronda.
Pasa por `neutralizarFormula()` y queda en la bitácora (`exporto_hallazgos`).

### 16.4 Impresos

[Usuario, 8.6 y 8.7; Decisión de Claude, F15-DC31.] Por hoja de estilos de impresión
(`window.print`), como la ficha de un indicador. En la 15A:

| Impreso | Contenido |
|---|---|
| SGC-FO-AC-01 | El hallazgo completo, en sus siete secciones, con todas sus rondas, sus ajustes y sus firmas (quién, cargo, fecha y huella corta) |
| SGC-FO-AC-02 | Un análisis de 5 porqués |
| SGC-FO-AC-03 | Un análisis de Ishikawa |

Un análisis de «otro método» se imprime en una hoja sin código de formato.

**El encabezado** lleva el nombre de la entidad (`obtenerMarca`) y, del formato, el **código**, la
**versión** y la **fecha de emisión** vigentes. Salen del documento que el Admin SGC eligió para
ese impreso en la configuración del módulo, que debe tener una versión vigente. Si no eligió
ninguno, o el elegido dejó de tener versión vigente, el impreso sale sin esos tres datos. El pie
dice quién lo imprimió y cuándo. Lo imprime quien ve el hallazgo completo; el responsable de una
actividad no.

## 17. Planes y enganches (15B)

Al nivel de lo ya decidido. Su anexo se escribe al empezar la entrega, con la plantilla del ente.

### 17.1 El plan

[Usuario, 2.1 y 12.7; Decisión de Claude, F15-DC32.]

- **Qué es.** El agrupador de los hallazgos de un mismo evento: una auditoría, la visita de un
  ente, un ciclo PAMEC, una revisión por la dirección. Puede cruzar procesos. Un hallazgo pertenece
  a lo sumo a un plan, y puede no pertenecer a ninguno.
- **Sus campos.** Código `PM-AAAA-NN` (el `PM-` es el del SGC-FO-14), nombre del evento, origen (el
  que heredan por omisión sus hallazgos), fecha del evento, vigencia (el año), objetivo del plan
  (texto), objetivo del maestro (opcional, §17.7) y, si es externo, la fecha límite del ente, que
  propone a sus hallazgos.
- **Quién lo crea y lo llena.** El Admin SGC y Control Interno. Un hallazgo entra al plan al
  registrarlo o después; los tres que hoy están abiertos, cargados en la 15A, se agrupan aquí
  [Usuario, 15.4].
- **No tiene recorrido propio.** Su estado y su avance salen de sus hallazgos: está abierto mientras
  alguno no haya terminado. No lleva una aprobación aparte: el «Aprobado por» del SGC-FO-14 muestra
  las aprobaciones de sus hallazgos. Si la plantilla del ente exige una firma del plan completo, lo
  decide el anexo.
- **Quién lo ve.** Quienes tienen `mejora.ver_todo`, completo. Un líder ve el plan con solo los
  hallazgos de sus procesos, sin que nada le diga si hay otros [Usuario, 12.7]. Un plan sin ningún
  hallazgo visible para la persona no existe para ella.

### 17.2 El SGC-FO-14 y el formato del ente

- **SGC-FO-14** [Usuario, 2.1 y 8.6]: se imprime desde el plan, **por proceso** (el encabezado del
  formato tiene un solo proceso), y también como reporte de **un proceso en un año**, con todos sus
  hallazgos, tengan plan o no. Una fila por actividad, con las columnas del Apéndice A.6.
- **El formato del ente** [Usuario, 1.2]: un Excel con las columnas de la plantilla, cuando llegue
  (§28). Los campos «efecto», «unidad de medida» y «cantidad» de la recomendación 5 del spec
  maestro existen solo si la plantilla los trae; si trae unidad y cantidad, la actividad que las
  tenga registra la cantidad lograda en cada seguimiento y el sistema calcula el avance [Usuario,
  10.3].

### 17.3 La marca «Requiere acción de mejora» de un indicador

[Usuario, 13.1; Decisión de Claude, F15-DC33.]

- **Qué es un pendiente.** Toda medición ordinaria (no histórica) de un indicador activo que lleva
  la marca y que todavía no tiene una salida registrada.
- **Las tres salidas.** Abrir un **hallazgo nuevo** (origen «Indicador», el proceso del indicador,
  la medición enlazada, la frase del resultado en la descripción, y la causa y la acción propuesta
  del análisis como punto de partida de §9.4); añadirla como **ocurrencia** de un hallazgo abierto
  enlazado al mismo indicador; o **«no requiere»**, con justificación.
- **Quién.** El Admin SGC, las tres. Un líder del proceso del indicador, las dos primeras; el «no
  requiere» no, porque es su propio indicador. El hallazgo que abre el líder nace aceptado.
- **La tarea.** «Decidir la acción de mejora de [indicador], [periodo]», del Admin SGC, sin fecha
  límite.
- **Dónde se guarda.** En una tabla propia, una fila por medición: una medición cerrada no admite
  cambios (`sgc_impedir_si_medicion_cerrada`), así que la salida no puede escribirse en ella.
- **Si un recálculo quita el Crítico.** La marca desaparece de la medición y, con ella, el
  pendiente. Una salida ya registrada queda como historia, y el hallazgo que nació sigue su curso:
  su página muestra el estado de hoy de la medición.
- **«Deshacer la importación»** de un lote de indicadores: un hallazgo que cita una ficha del lote
  es un motivo más de `condicionDeDeshacer`. Esa comprobación entra ya en la 15A (§19.4); la 15B le
  suma la salida de una marca.
- **Indicador restringido.** El enlace y el nombre del indicador se muestran solo a quien puede
  verlo (§6.3). El formulario advierte que lo que se escriba en la descripción lo leerán los
  responsables de las actividades.

### 17.4 El hallazgo de verificación de un punto de uso

[Usuario, 13.3 y 13.5; Decisión de Claude, F15-DC34.]

- Conserva su tabla, su ciclo (corregir y validar) y su nombre dentro de Distribución. Vale como el
  registro de esa falla y de su corrección: es el camino corto de §8.5, ya hecho.
- Desde su página, el Admin SGC pulsa **«Abrir no conformidad»**: llega al registro con el origen
  «Control documental», el documento, la descripción y el enlace puestos; él elige el proceso
  entre los del punto. Quedan enlazados en los dos sentidos. Un hallazgo de verificación abre a lo
  sumo una no conformidad.
- **La sugerencia.** La página del hallazgo de verificación y la del punto lo sugieren cuando el
  hallazgo se reabrió alguna vez o cuando el punto acumula tres hallazgos en doce meses (los dos
  números, configurables). Es un aviso en pantalla, no una tarea.
- Fuera de Distribución se le llama «hallazgo de verificación». En la 13B no cambia ningún texto.
- El informe SGC-FO-28 los cuenta en una línea aparte (§18.1).

### 17.5 El cambio documental desde una actividad

[Usuario, 13.9 y 13.10; Documento del hospital, SGC-PR-03 actividad 6, PC-06 y riesgo R-04.]

- En una actividad, **«Pedir cambio documental»** lleva a `/tramites/nueva?actividad=…`, con el
  documento (si el hallazgo lo cita) y la justificación ya puestos. El campo oculto lo vuelve a
  validar `crearSolicitud` dentro de su transacción, y la página no dice por qué ignoró un valor que
  no admite: es el patrón de `?revision=` y `?impacto=`. Lo ve quien tiene `tramites.solicitar`.
- El trámite y la actividad quedan enlazados. Cuando el trámite publica, el sistema lo anota en la
  actividad, y esa publicación vale como su evidencia (§10.4).
- **En el cierre.** Si la segunda pregunta del análisis marcó «documentos» y el hallazgo no tiene
  ningún trámite enlazado ya publicado, cerrar exige justificación. Si marcó «matriz de riesgos» o
  «controles», el cierre pide decir cómo se atendió. La justificación queda en el evento de cierre.

### 17.6 Documento, proceso, indicador e impacto de norma

[Usuario, 13.6 y 13.7.]

- La página de un documento, la de un proceso y la de un indicador llevan **«Abrir hallazgo»** para
  quien puede registrar hallazgos de ese proceso, y **«Reportar»** para los demás. Llegan con el
  enlace puesto; el origen lo elige la persona.
- Cada una de esas páginas muestra, a quien puede verlos, los hallazgos que la citan (abiertos
  primero). Es la «vista filtrada» del punto 1.10 del spec maestro. A quien no ve ninguno, la
  sección no le aparece.
- La página de un impacto de norma, sobre un documento o sobre un indicador, lleva **«Abrir
  hallazgo»** para el Admin SGC y los líderes del proceso: origen «Control documental», con la
  norma como requisito incumplido. El impacto se sigue resolviendo por sus propias reglas.

### 17.7 Objetivos

[Usuario, 13.11; su punto 3.6.] El hallazgo puede apuntar a **un** objetivo del maestro que ya
existe (`objetivos`, de calidad o institucional). El plan propone el suyo a los hallazgos que
entran. La lista y los reportes de §18.4 filtran por objetivo, que es lo que Control Interno
necesita para su seguimiento por proceso.

## 18. Informe, Pareto y automáticos (15C)

Al nivel de lo ya decidido. Su anexo se escribe al empezar la entrega.

### 18.1 El informe SGC-FO-28

[Usuario, 8.1, 8.4 y 8.5; Documento del hospital, SGC-PR-03 §5.9 y PC-11; Decisión de Claude,
F15-DC35.]

- **Abrirlo.** El Admin SGC abre el informe de un periodo: desde y hasta, el tipo de seguimiento
  (trimestral, semestral, anual o extraordinario) y los procesos (todos, por omisión). Recibe su
  número, consecutivo por año.
- **Lo que llena el sistema,** con los datos a la fecha «hasta»:
  - el **resumen ejecutivo**: las filas del formato (acciones correctivas, oportunidades de mejora,
    hallazgos de auditoría interna, de auditoría externa, de revisión por la dirección, riesgos
    materializados, planes derivados de indicadores, PQRS y satisfacción del usuario), con total,
    cumplidas, en proceso y vencidas; el porcentaje de cumplimiento global y el de eficacia, con las
    fórmulas de §18.3; y, aparte, los hallazgos de verificación de puntos de uso y las no
    conformidades cerradas sin acción en el periodo [Usuario, 16.2];
  - la **matriz consolidada**, una fila por actividad, con las diecisiete columnas del Apéndice A.6;
  - el **detalle de lo vencido o atrasado**, con la causa, la fecha original, la fecha propuesta y
    la decisión (la del ajuste o la escalada, que ya están en el hallazgo).
- **Lo que escribe el Admin SGC:** el análisis de eficacia y tendencias (las siete preguntas del
  formato, cada una con su resultado, su análisis y su decisión), las conclusiones y las
  recomendaciones para la Alta Dirección.
- **Las firmas.** «Elaboró», el Admin SGC; «Aprobó», Gerencia; las dos con clave. «Revisó» no es un
  paso: es el número y la fecha del acta del Comité [Usuario, 8.4].
- **Congelado.** Al firmarse «Aprobó», el contenido queda congelado y el PDF se genera al primer
  pedido, sobre el formato institucional, con el mecanismo del informe de la revisión anual
  (`asegurarInforme`). Un informe aprobado no se modifica; uno equivocado se reemplaza con otro
  extraordinario.
- **Quién lo ve.** El Admin SGC, Gerencia y Control Interno; los demás, «no encontrado».

### 18.2 El análisis de Pareto

[Usuario, 7.1; Documento del hospital, SGC-FO-AC-04; Decisión de Claude, F15-DC37.] Un cuarto método
de §9.1: el periodo de análisis, la fuente de los datos y de dos a treinta causas o categorías de
falla, cada una con su frecuencia (un entero mayor que cero). El sistema las ordena de mayor a
menor, calcula el porcentaje relativo y el acumulado, marca como **vitales** las primeras cuya suma
alcanza el 80 % (la que cruza el 80 % queda dentro) y dibuja la gráfica de barras con la línea del
acumulado, en SVG. Quien analiza puede cambiar la marca de una causa. Se imprime en el SGC-FO-AC-04.

### 18.3 Los cuatro cálculos automáticos

[Usuario, 14.1 a 14.5 y 8.5; Decisión de Claude, F15-DC36.] Se añaden al registro de la 14B
(`CALCULOS`), que pasa de diez a catorce. Todos son porcentajes de flujo, ascendentes, para la
entidad o para un proceso, y se reconstruyen hacia atrás. Los toma `tomarCalculo`, con la sesión de
sistema; la consulta de cada uno vive en un módulo liviano de Mejoramiento, que el informe usa
también: **una sola fórmula** para el indicador y para el SGC-FO-28.

| Clave | Nombre | B (el total) | A (los que cuentan) | Sin datos |
|---|---|---|---|---|
| `eficacia_acciones` | Eficacia de las acciones | Evaluaciones de eficacia registradas en el periodo (una por ronda evaluada) | Las que resultaron eficaces | No se evaluó la eficacia de ningún hallazgo en el periodo |
| `actividades_a_tiempo` | Actividades cumplidas a tiempo | Actividades de planes aprobados cuya fecha de fin **original** cae en el periodo | Las que se terminaron en esa fecha o antes | Ninguna actividad tenía su fin en el periodo |
| `planes_a_tiempo` | Planes de acción formulados a tiempo | Rondas cuyo plazo de formular cae en el periodo, de hallazgos que requieren plan | Las que enviaron el plan por primera vez dentro del plazo | Ningún plan tenía su plazo en el periodo |
| `hallazgos_a_tiempo` | Hallazgos cerrados a tiempo | Rondas con plan aprobado cuyo cierre previsto cae en el periodo | Las que se cerraron como eficaces en esa fecha o antes | Ningún hallazgo tenía su cierre previsto en el periodo |

Precisiones:

- **Nunca cuentan** los hallazgos anulados ni los rechazados.
- **La unidad es la ronda** en tres de los cuatro: una ronda que resultó no eficaz cuenta en
  `eficacia_acciones` como no eficaz y en `hallazgos_a_tiempo` como no cerrada a tiempo, y la ronda
  siguiente se mide aparte, con sus propias fechas.
- **Una reprogramación aprobada no cuenta como a tiempo** [Usuario, 14.5]: se juzga contra la fecha
  original.
- **Una actividad cancelada** sale de `actividades_a_tiempo` si se canceló antes de su fecha
  original; si se canceló después, cuenta como no cumplida a tiempo.
- **Una actividad devuelta** se juzga con la fecha en que terminó la última vez.
- **Un hallazgo cargado** (§15) no cuenta en `planes_a_tiempo` [Usuario, 15.3].
- **«Requiere plan»** es: la no conformidad con acción correctiva (decidida u obligada), y la
  observación y la oportunidad aceptadas.

### 18.4 Reportes de cumplimiento

[Su punto 3.5; Spec maestro §6.3.] Una pestaña «Cumplimiento» con una tabla que se agrupa por plan,
por origen, por proceso, por área o por objetivo: hallazgos abiertos, cerrados y con algo vencido;
actividades cumplidas, en proceso y vencidas; y los porcentajes de §18.3. Con su Excel. El **área**
es la del cargo del responsable de la actividad [Spec maestro §6.3]. La versión formal con pie de
control llega con el catálogo de la Fase 17.

## 19. Modelo de datos y migraciones

Los nombres son provisionales; los definitivos, los índices y los `CHECK` son del constructor
(§26). Todo lo nuevo lleva el prefijo `mejora_`, porque `hallazgos` es de la 13B [Decisión de
Claude, F15-DC38].

### 19.1 Tablas nuevas de la 15A

| Tabla | Qué guarda |
|---|---|
| `dias_no_habiles` | Fecha (única) y motivo |
| `mejora_reportes` | El reporte de un funcionario: quién, cuándo, texto, proceso opcional, referencia, estado (`recibido`, `convertido`, `sumado`, `descartado`), el hallazgo que nació o al que se sumó, el motivo del descarte, su vencimiento y sus marcas de aviso |
| `mejora_reporte_eventos` | Solo inserción: lo que pasó con un reporte |
| `mejora_hallazgos` | La identificación de §7.1; `estado`, `ronda`; quién y cuándo lo registró; `reincidente_de`, `derivado_de`; si requiere acción correctiva, con su justificación; la corrección (qué, quién, cuándo, quién la validó); `cargado`; la fecha del ente y su respuesta; el vencimiento del paso en curso y sus marcas de aviso; el cierre (cuándo, quién, resultado, lecciones) |
| `mejora_rondas` | Una por ronda: **su plazo de formular** (cada ronda tiene el suyo, §13.3); cuándo se envió el plan por primera vez; quién y qué rol lo aprobó, y cuándo; la marca de recursos o impacto; las dos preguntas de cierre del análisis; el criterio de eficacia, el indicador enlazado y la fecha de evaluación; el **cierre previsto**; la verificación de la implementación (quién, cuándo, cómo); la evaluación (quién, cuándo, resultado, periodo, justificación) |
| `mejora_analisis` | Uno o más por ronda: método, equipo, observaciones y el contenido del método |
| `mejora_causas` | La lista de causas raíz de la ronda, con la justificación de la que no lleva acción |
| `mejora_acciones` | Tipo, descripción, recursos, indicador de cumplimiento y meta; y su enlace a las causas que ataca |
| `mejora_actividades` | Descripción, responsable, inicio, **fin original**, fin vigente, avance, estado, cuándo terminó de verdad, la verificación (conforme o devuelta, nota, fecha para corregir), el número de reprogramaciones y sus marcas de aviso y de recordatorio |
| `mejora_seguimientos` | Solo inserción: fecha, qué se hizo, avance, barreras, quién |
| `mejora_ajustes` | Tipo, actividad, lo pedido, la causa, quién y cuándo lo pidió, el estado (`pendiente`, `aprobado`, `negado`), quién y cuándo lo decidió, la nota y el acta |
| `mejora_ocurrencias` | Solo inserción: fecha, descripción, quién, y de dónde vino (registro, reporte o medición) |
| `mejora_eventos` | Solo inserción: todo lo que le pasa a un hallazgo, con su ronda, su tipo y su `detalle` (el antes y el después, la copia congelada del plan o de la evaluación, la marca «hecho fuera») |

Todo lo que puede decir «acta del Comité» (decisiones, ajustes, escaladas, arbitrajes) guarda el
número y la fecha como dos campos opcionales de su evento.

### 19.2 Cambios a tablas existentes, en la 15A

- **`firmas`:** una columna nueva para el hallazgo dueño de la firma (nula en las demás); `verifico`
  y `cerro` entran al `CHECK` de `firma`; y el `CHECK` `firmas_tramite_coherente` admite la firma
  con hallazgo. La `ronda` es la del hallazgo.
- **`archivos`:** tres contextos nuevos en `archivos_contexto_valido`, con el hallazgo, la actividad
  o el reporte como dueño (`mejora_hallazgo`, `mejora_actividad` y `mejora_reporte`). El `rol` del
  archivo distingue, dentro del hallazgo, la evidencia del registro, la de la corrección, la del
  análisis, la de la verificación y el escaneo de una carga: esos valores nuevos entran al `CHECK`
  cerrado `archivos_rol_valido`. El contexto `hallazgo` sigue siendo el de la 13B.
- **`configuracion`:** las claves de los plazos, de los recordatorios y del documento de cada
  impreso.

### 19.3 Tablas de la 15B y la 15C

- 15B: `mejora_planes`; en `mejora_hallazgos`, el plan, el objetivo, el hallazgo de verificación y
  el impacto enlazados; en `mejora_actividades`, el trámite enlazado y, si la plantilla los trae,
  la unidad y la cantidad; `mejora_marcas` (la salida de la marca de una medición, una fila por
  medición, de solo inserción); en `tramites`, la actividad de la que nace.
- 15C: `mejora_informes` (el periodo, los textos, las firmas y el contenido congelado) y sus
  eventos; los cuatro cálculos entran al registro, sin tabla nueva.

### 19.4 Inmutabilidad y privilegios

- De solo inserción, con el trigger `sgc_impedir_modificacion` y el `REVOKE` de `UPDATE` y `DELETE`
  a `sgc_app`: `mejora_eventos`, `mejora_reporte_eventos`, `mejora_seguimientos` y
  `mejora_ocurrencias` (15A); `mejora_marcas` y los eventos de un informe (15B y 15C). Cada una
  entra a `asegurarRolApp` y a `tests/privilegios-bd.test.ts`.
- `sgc_impedir_si_hallazgo_terminado` sobre `mejora_hallazgos` y sus hijas (§12.2).
- Un informe aprobado no cambia (15C), con el patrón de la revisión anual cerrada.
- Las llaves foráneas hacia usuarios, procesos, indicadores, documentos y normas van con
  `RESTRICT`: un hallazgo nunca queda huérfano ni borra nada ajeno.
- **Los borrados que ya existen conocen a los hallazgos desde la 15A.** Esas llaves nacen en la
  15A, así que en la misma entrega: `condicionDeDeshacer` gana su motivo (un hallazgo cita una ficha
  del lote, como referencia, como medición o como indicador de eficacia); el borrado de una norma
  la da por usada si un hallazgo la cita; y el constructor revisa los demás borrados de documentos,
  indicadores, mediciones y normas. Ninguno debe llegar a la persona como un error crudo de llave
  foránea: cada uno comprueba antes y responde con su mensaje.

### 19.5 Migraciones

Una por entrega, a partir de la `0018` (15A). Cada una se prueba sobre una copia de la base del
usuario, como las anteriores: mismos conteos y mismas huellas en lo que no toca.

## 20. Cambios a `AGENTS.md`

Al cierre de cada entrega, con lo que esa entrega haya construido:

- **Piso 10 y regla 5:** las tablas nuevas de solo inserción, en las dos listas; el trigger del
  hallazgo terminado, junto a los de la revisión anual, la medición y la ficha.
- **Estructura:** dónde vive el módulo (rutas, acciones, consultas, reglas puras, componentes) y la
  advertencia de nombres: `hallazgos`, el contexto `hallazgo` y `api/hallazgos` son de la 13B; lo
  de esta fase es `mejora`.
- **Alcance:** la quinta excepción nombrada (ser responsable de una actividad) y las funciones
  nuevas de `src/lib/alcance.ts`.
- **Seguridad:** `src/app/acciones-mejoramiento.ts` y `src/app/admin/acciones-mejoramiento.ts` en la
  lista de `tests/acciones-permisos.test.ts`; las páginas del módulo con su guarda
  (`exigirHallazgo`, `exigirActividad`), admitidas en `tests/paginas-sesion.test.ts`; las rutas de
  subida nuevas, fuera del `matcher`, con su caso en `tests/proxy-matcher.test.ts`.
- **`archivos`:** los contextos nuevos y la regla de acceso de cada uno.
- **Firmas:** las firmas de un hallazgo y qué cubre cada huella.
- **Reglas nuevas, cada una con su párrafo:** toda transición de un hallazgo entra por
  `transicionarHallazgo`; los plazos de este módulo van en días hábiles y los de los demás no; la
  fecha de fin original de una actividad no cambia nunca; quien ejecuta no verifica, sin excepción;
  las dos fechas de §11.3.
- **Tests contra la BD de desarrollo:** las tablas nuevas, en la lista de las que exigen usuarios
  únicos por corrida; ningún test deja un hallazgo terminado ni un informe aprobado fuera de una
  transacción que se revierte.
- **Cálculos (15C):** el registro pasa a catorce.

## 21. Seguridad

Riesgos 3, 4, 7, 15 y 20 del spec maestro §5.9.

| Riesgo | Qué se hace |
|---|---|
| 3. Aislamiento por alcance | `filtroHallazgos` en toda lista, conteo, Excel y búsqueda; `exigirHallazgo` en toda página; pruebas con cada rol, con un líder de otro proceso, con el responsable de una actividad de otro hallazgo y con quien reportó |
| 4. Escritura sin permiso | Cada acción con su permiso de matriz **y** su condición de persona, repetida dentro de la transacción; `tests/acciones-permisos.test.ts` |
| 7 y 15. Entradas | Esquemas `zod` estrictos en cada acción; el contenido de cada método de análisis, validado con su esquema; los identificadores de ruta con `idNumerico()` |
| 20. Archivos | `recibirArchivo`, MIME por los bytes, fuera del `matcher`, siempre como descarga; el acceso es el del dueño: el responsable de una actividad solo abre los de su actividad (§6.3); los demás reciben 404 |
| Separación ejecuta y verifica | `puedeVerificar`, comprobado en el servidor y repetido en la transacción; prueba con quien registró un seguimiento, con quien fue responsable y ya no lo es, con quien registró la corrección y con un Admin SGC único |
| Firma | F13A-R4 en los cinco actos; la clave se verifica fuera de la transacción |
| Datos sensibles | §6.4; ningún aviso, tarea ni mensaje de error lleva el contenido de un hallazgo a quien no tiene alcance |
| Fuga por diferencias | Quien no ve un hallazgo recibe la misma respuesta que si no existiera, también al adivinar su código o el identificador de una actividad o de un archivo |
| Excel | `neutralizarFormula()` en toda celda de texto |

## 22. Semillas

La demo siembra por las funciones del dominio, con el reloj inyectado, nunca por SQL directo sobre
los hallazgos. Hallazgos verosímiles de un hospital, sin nombres de pacientes, que cubren el
recorrido:

- uno «Por aceptar», uno rechazado y sostenido «En arbitraje», y uno «Rechazado»;
- una no conformidad menor «Cerrada con corrección» y otra «Cerrada sin acción»;
- una de criticidad alta y reincidente «En ejecución», con tres actividades, una vencida y con un
  ajuste por decidir (el caso de las maquetas);
- una «Por formular» a punto de vencer y otra «En revisión»;
- una de origen «Ente de control» «En aprobación», con su fecha del ente;
- una «En espera de eficacia», con indicador enlazado, y una «Cerrada · eficaz»;
- una oportunidad de mejora «Reabierta · ronda 2»;
- una cargada (§15);
- dos reportes de funcionarios: uno por clasificar y uno convertido.

Los días no hábiles de la demo traen uno de ejemplo. La 15B añade un plan con hallazgos en dos
procesos y una marca de indicador sin resolver; la 15C, un informe aprobado y otro en borrador. La
semilla mínima trae los plazos por omisión y nada más.

## 23. Pruebas

- **Días hábiles:** los festivos de tres años contra el calendario oficial; sumar, restar y contar;
  Semana Santa y el fin de año; un día no hábil de la entidad; la zona de la instalación.
- **Transiciones:** una prueba por fila de la tabla de §8.2 y una por cada salto que la tabla no
  permite; ningún otro código cambia `estado`.
- **Permisos y condición de persona:** la matriz por celda; cada acción con el rol correcto sin la
  condición, y al revés.
- **Cierre sin acción:** sin corrección y con decisión «no» queda «Cerrado sin acción»; no valida
  quien registró el «no requiere corrección» ni quien decidió el «no».
- **Camino corto:** obligada y no obligada; validar no puede quien corrigió; cambiar el «no» por
  «sí».
- **Aprobación:** las cuatro condiciones de Gerencia, una por una y ninguna; el Admin SGC que
  elabora, con y sin otro Admin SGC.
- **Análisis:** cada método, completo e incompleto; causas sin acción; las dos preguntas; lo
  opcional en observación y oportunidad.
- **Actividades:** seguimientos de solo inserción; terminar sin evidencia; el avance que no baja;
  reasignar; recordatorios.
- **Ajustes:** los tres tipos; quien pide no decide; la fecha original que no cambia; el pendiente
  único.
- **Verificación y eficacia:** `puedeVerificar` con cada forma de haber ejecutado; devolver una
  actividad; «eficaz» antes de la fecha mínima se rechaza; «no eficaz» en cualquier momento; el
  ejemplo del 5 de diciembre; el indicador retirado, con otra periodicidad y sin dato; lo congelado.
- **Las dos fechas:** cada fila de la tabla de §11.3.
- **Rondas:** reabrir, la ronda anterior congelada, los plazos de la nueva.
- **Firmas:** las huellas; una devolución exige otra «Elaboró»; la clave equivocada no escribe nada.
- **Visibilidad:** cada fila de §6.3, en la página, la lista, el Excel, la búsqueda, los archivos y
  los avisos; la identidad de quien reportó.
- **Reincidencia:** las tres salidas; la ocurrencia que avisa a quien verifica.
- **Reportes de funcionarios:** convertir, sumar, descartar; lo que ve quien reportó.
- **Carga:** el escaneo obligatorio; los eventos «hecho fuera»; sin firma del sistema.
- **Inmutabilidad:** las tablas de solo inserción y el hallazgo terminado, también con el dueño del
  esquema; `tests/privilegios-bd.test.ts`.
- **Vencimientos:** la pasada es idempotente; el aviso al jefe sin contenido.
- **Los de siempre:** `paginas-sesion`, `acciones-permisos`, `proxy-matcher`, `colores-fijos`,
  `textos-fijos` y `bitacora-detalle` con lo nuevo.
- **15B y 15C:** las listan sus anexos; en la 15C, que el informe y el cálculo den la misma cifra.

## 24. Demostración (criterios de cierre)

### 24.1 Entrega 15A

Con la demo recién sembrada:

1. Como Control Interno, registrar una no conformidad de auditoría interna en un proceso con líder;
   ver los parecidos y marcarla reincidente de una cerrada.
2. Como líder de ese proceso, aceptarla y registrar la corrección con su evidencia. Ver que pasa
   directo a «Por formular» y que el plazo dice «quedan N días hábiles».
3. Hacer el análisis con 5 porqués y un Ishikawa; escribir dos causas; responder las dos preguntas.
4. Formular dos acciones, una con dos actividades, con responsables que no lideran el proceso;
   elegir «mejora del indicador» y ver la fecha desde la que se podrá evaluar; enviar con la clave.
5. Como Admin SGC, ver los parecidos de otros procesos, devolver el plan una vez, y firmar «Revisó»
   al reenvío. Como Gerencia, firmar «Aprobó».
6. Como responsable de una actividad (rol Consulta), verla en «Mis tareas», registrar dos
   seguimientos, intentar terminar sin evidencia (se rechaza), terminar con evidencia. Comprobar
   que no puede abrir los archivos del registro.
7. Pedir un ajuste de fecha en otra actividad; ver que sigue vencida; aprobarlo como Gerencia; ver
   la fecha original intacta y la marca «Reprogramada».
8. Como Admin SGC, responsable de una de las actividades, intentar verificar (se rechaza). Como
   Control Interno, devolver una actividad y, corregida, dar todas por conformes.
9. Intentar registrar «eficaz» antes de la fecha (se rechaza). Con el reloj adelantado, evaluar con
   los resultados del indicador a la vista, firmar «Verificó» y, como Admin SGC, cerrar con las
   lecciones aprendidas. Ver el aviso de Gerencia.
10. Otro hallazgo: evaluarlo «no eficaz» y ver la ronda 2, con la ronda 1 plegada.
11. Una no conformidad menor: decidir «no requiere acción correctiva» y validarla con otra persona;
    queda «Cerrada con corrección». Otra, sin corrección: quien decidió el «no» no puede validarla;
    validada por otra persona, queda «Cerrada sin acción».
12. Un hallazgo que el líder rechaza: sostenerlo y arbitrarlo.
13. Uno de «Ente de control»: no ofrece rechazo, pide la fecha del ente y lo aprueba Gerencia.
14. Como rol Consulta, reportar una posible no conformidad; como Admin SGC, convertirla; como quien
    reportó, ver «En trámite» y nada más.
15. «Registrar un hallazgo ya en curso» con un escaneo; ver la marca «Cargado».
16. Añadir un día no hábil y ver que un plazo nuevo lo salta. Imprimir el SGC-FO-AC-01 y un
    análisis; exportar el Excel de la lista.
17. Como líder de otro proceso, pedir la dirección de un hallazgo ajeno: «no encontrado».

### 24.2 Entrega 15B

El plan de una auditoría con hallazgos en dos procesos y el SGC-FO-14 de cada uno; un líder ve solo
los suyos. Un hallazgo abierto desde un indicador crítico, con la causa y la acción propuesta ya
puestas; otra marca resuelta como ocurrencia y otra como «no requiere». Una no conformidad abierta
desde un hallazgo de verificación. Una actividad que pide un cambio documental, y el cierre que lo
comprueba. El Excel en el formato del ente.

### 24.3 Entrega 15C

El informe del trimestre: sus cifras, sus textos, las dos firmas y el PDF; un informe aprobado no se
edita. Una ficha automática de «Eficacia de las acciones» que toma su valor, igual a la cifra del
informe. Un Pareto que ordena, calcula y dibuja. La pestaña «Cumplimiento» por origen y por
proceso.

## 25. Manual de usuario

Capítulo 9, «Planes de mejoramiento: hallazgos, acciones y verificación» [Spec maestro §8], en
`docs/manual/usuario/09-mejoramiento.md`. Por entrega: en la 15A, reportar, registrar, el
recorrido, la causa raíz, el plan, mi actividad, verificar, evaluar y cerrar, los plazos en días
hábiles, y qué formato del hospital reemplaza cada pantalla; en la 15B, planes y enganches; en la
15C, el informe y los indicadores. Con una sección «Qué cambia en sus formatos» (Apéndice B).

## 26. Lo que se deja al constructor

- Los nombres definitivos de tablas, columnas, índices y `CHECK`; si la corrección va en la tabla del
  hallazgo o aparte; cómo se guarda el contenido de cada método de análisis.
- Las rutas exactas, los nombres de las acciones y de los eventos de bitácora, y sus frases.
- El diseño de cada pantalla y de cada impreso dentro del sistema visual, y todos los textos de
  interfaz, avisos, estados vacíos y errores.
- El umbral de los parecidos y su consulta.
- Cómo se reparte la 15A en tareas, sus pruebas y los datos exactos de la semilla.
- Si la pasada de vencimientos reutiliza `correrPaso` de indicadores o lo sube a un lugar común.
- La forma del texto canónico de cada huella.

## 27. Riesgos

| Riesgo | Mitigación |
|---|---|
| El recorrido resulta pesado y la gente deja de registrar | El camino corto; el reporte de un formulario; el caso simple en una fila; la demostración mide cuántos pasos toma una no conformidad menor |
| Un festivo mal calculado mueve vencimientos | Pruebas contra el calendario oficial de tres años; los días no hábiles de la entidad como corrección inmediata |
| La 15A es grande | El corte en tres entregas; la 15A no incluye planes, enganches, informe ni Pareto |
| Datos de pacientes en texto libre | §6.4; visibilidad por alcance; la referencia del caso |
| La plantilla del ente pide campos que el modelo no tiene | La 15B espera a la plantilla; la actividad ya es el nivel donde irían unidad y cantidad |
| Espera de eficacia muy larga con indicadores semestrales o anuales | El formulario muestra la fecha antes de enviar el plan |
| Un solo Admin SGC y nadie más que pueda verificar | Control Interno y, en último caso, Gerencia; el sistema dice por qué no deja |
| Dos nociones de «hallazgo» | Prefijo `mejora` en todo el código; «hallazgo de verificación» en pantalla; advertencia en `AGENTS.md` |

## 28. Pendientes del usuario

Ninguno bloquea la 15A.

- **La plantilla del ente de control** (Contraloría, Supersalud o Secretaría de Salud
  Departamental), y de qué ente es. La necesita la 15B.
- **Los tres casos abiertos,** con sus formatos diligenciados: para probar la carga y para que la
  demo se parezca a la realidad.
- **La matriz SGC-MZ-AC-01,** si existe: la lista de la plataforma la reemplaza.
- **Registrar los siete formatos como documentos** en la plataforma, para que los impresos lleven
  su código y su versión vigentes (§16.4).
- **Los ajustes a los textos del hospital** del Apéndice B.

## 29. Decisiones de Claude en este documento (para revisar de una vez)

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F15-DC1 | Tres reglas de diseño: registrar es fácil y cerrar es exigente; el caso simple en una pantalla; el rigor lo pone el sistema | §1 | Continúan el criterio que el usuario fijó en la Fase 14 | Práctica |
| F15-DC2 | La 15A guarda desde el primer día lo que la 15C mide | §5.1 | Sin eso los cálculos no se reconstruyen hacia atrás | Práctica |
| F15-DC3 | En un proceso sin líder activo, el Admin SGC hace lo del líder, y el hallazgo nace aceptado | §6.1, §7.4 | Un proceso sin líder no debe bloquear el recorrido | Práctica |
| F15-DC4 | Ocho permisos nuevos, con prefijo `mejora` | §6.2 | Desagregan la celda del spec maestro | Práctica |
| F15-DC5 | La identidad de quien reportó la ven solo los roles de control; los enlaces, solo quien puede ver lo enlazado; los conteos nunca dicen lo que hay fuera del alcance | §6.3 | Cultura de reporte no punitiva; no filtrar por el borde | Práctica; Regulación (Ley 1581 de 2012) |
| F15-DC6 | El hallazgo lleva un título corto y una «fuente» obligatoria | §7.1 | Las listas, las tareas y los avisos necesitan una frase; la fuente es la del spec maestro | Práctica |
| F15-DC7 | Un hallazgo externo lleva siempre plan, sea cual sea su clase | §7.2 | Evita un estado «respondido sin acción»; si el ente lo retira, se anula | Práctica |
| F15-DC8 | El reporte de un funcionario es una entidad aparte, sin código `HZ` | §7.3 | Un reporte descartado no gasta consecutivo ni entra a ningún cálculo | Práctica |
| F15-DC9 | Los parecidos se buscan con `pg_trgm`, como en la 13A; reglas de las ocurrencias | §7.5 | Reutiliza lo probado | Práctica |
| F15-DC10 | Editar antes de aceptar; reclasificar hasta enviar el plan; anular con justificación | §7.6 | Lo firmado no cambia; un error de registro necesita salida sin borrar | ISO derivada de 7.5.3 |
| F15-DC11 | Dieciséis estados guardados; lo que depende de la fecha se calcula al leer | §8.1 | Igual que la vigencia y las mediciones | Práctica |
| F15-DC12 | Una sola función cambia el estado de un hallazgo | §8.2 | Igual que `transicionar` en los trámites | Práctica |
| F15-DC13 | Gerencia arbitra también cuando un Admin SGC sostuvo el hallazgo en lugar de quien lo registró | §8.3 | No arbitra quien ya tomó parte | Práctica |
| F15-DC14 | Plazos de registrar la corrección (3), reenviar un plan devuelto (5) y evaluar la eficacia (5) | §8.4, §13.3 | Un paso sin plazo no vence y nadie lo reclama | Práctica |
| F15-DC15 | Cuando elabora un Admin SGC, revisa otro; si no hay otro, pasa directo a Gerencia. El plan de una no conformidad lleva al menos una acción correctiva | §8.6 | Nadie firma «Revisó» sobre lo que elaboró; una acción correctiva exigida no se cumple con una de mejora | ISO derivada de 10.2; separación de funciones del spec maestro |
| F15-DC16 | El contenido de cada método se guarda estructurado y validado | §9.1 | Es lo que permite imprimirlo en su formato | Práctica |
| F15-DC17 | Cuatro estados guardados de la actividad; «vencida» y «reprogramada» se calculan | §10.2 | Las convenciones del SGC-FO-14 sin guardar lo que depende de la fecha | Práctica |
| F15-DC18 | Los seguimientos son de solo inserción y el avance no baja | §10.3 | Trazabilidad del avance | ISO derivada de 10.2.2 |
| F15-DC19 | Vale como evidencia un archivo o un enlace que el sistema comprueba | §10.4 | La publicación de un documento ya es evidencia verificable | Práctica |
| F15-DC20 | El recordatorio de seguimiento va en días calendario y se repite | §10.5 | Es una frecuencia de reporte, no un plazo | Práctica |
| F15-DC21 | Reglas de los ajustes: quién pide, quién decide, cuándo, y que quien pide no decide | §10.6 | Coherencia con la regla 10.7 del usuario | Práctica |
| F15-DC22 | Lista cerrada de qué es «ejecutar» para efectos de verificar | §11.1 | La regla debe poder probarse | ISO derivada de 10.2.1 d) |
| F15-DC23 | Reglas del indicador enlazado cuando se retira, cambia o no tiene dato | §11.2 | El indicador vive su propia vida | Práctica |
| F15-DC24 | Dos fechas: la mínima de eficacia (real) y el cierre previsto (planeado y congelado) | §11.3 | Una bloquea; la otra mide | Práctica |
| F15-DC25 | Qué cubre la huella de cada firma | §12.1 | Igual que la ficha de un indicador | ISO derivada de 7.5.3 |
| F15-DC26 | El sábado no es hábil; el día del hecho no cuenta; un día no hábil nuevo no mueve lo ya calculado | §13.1, §13.2 | La forma usual de contar términos; no reescribir vencimientos | Regulación (Ley 51 de 1983); Práctica |
| F15-DC27 | El plazo de formular no se corre por la aceptación, la corrección ni la primera decisión; se cuenta de nuevo cuando el plan se vuelve exigible por un arbitraje, una exigencia posterior de acción correctiva, una reclasificación o una ronda nueva; el «registro» de un reporte es su conversión | §13.3 | Lectura literal del procedimiento, sin vencerle el plazo a quien no tuvo los 10 días | Documento del hospital; Práctica |
| F15-DC28 | La fecha del ente reemplaza los 10 días y da una tarea de respuesta | §13.4 | El plan debe llegar aprobado a esa fecha | Práctica |
| F15-DC29 | La carga tiene un solo punto de entrada: el plan ya aprobado por fuera. Al cargar se declara qué rol lo aprobó, y ese rol decide sus ajustes | §15 | Lo anterior a eso se registra por el camino normal; un nombre en texto no alcanza para saber quién decide un ajuste | Práctica |
| F15-DC30 | Grupo «Mejoramiento» en la barra, sus rutas y la búsqueda global | §16.1, §16.2 | Estructura del spec maestro §9 | Práctica |
| F15-DC31 | Impresos por hoja de estilos de impresión | §16.4 | Como la ficha de un indicador; el PDF se reserva al informe | Práctica |
| F15-DC32 | El plan no tiene recorrido ni aprobación propios | §17.1 | Su estado sale de sus hallazgos | Práctica |
| F15-DC33 | La salida de una marca va en tabla propia; reglas del recálculo y de deshacer una importación | §17.3 | Una medición cerrada no admite cambios | Práctica |
| F15-DC34 | La sugerencia de abrir una no conformidad desde un punto de uso | §17.4 | Tres hallazgos en doce meses o una reapertura | Práctica |
| F15-DC35 | Mecánica del informe: número, congelado al aprobarse, PDF al primer pedido, quién lo ve | §18.1 | El mismo mecanismo de la revisión anual | Práctica |
| F15-DC36 | La unidad de tres cálculos es la ronda; reglas de lo cancelado y lo devuelto | §18.3 | Cada plan se juzga con sus fechas | Práctica |
| F15-DC37 | Son vitales las causas que suman hasta el 80 %, con la que lo cruza | §18.2 | La regla del formato, hecha precisa | Práctica |
| F15-DC38 | Prefijo `mejora` y tres contextos de archivo | §19 | `hallazgos` y `hallazgo` ya son de la 13B | Práctica |

## Apéndice A — Los formatos del hospital y dónde quedó cada campo

### A.1 SGC-PR-03, generalidades (§5)

| Regla del procedimiento | Dónde quedó |
|---|---|
| 1. Toda no conformidad se registra en el SGC-FO-AC-01, sin excepción | §7.4; el reporte de cualquier funcionario, §7.3 |
| 2. La acción correctiva aplica si hay recurrencia, si es crítica o si lo determina la Gerencia o el Comité | §8.5 |
| 3. Causa raíz con al menos uno de tres métodos | §9 |
| 4. 10 días hábiles para formular el plan, desde el registro | §13.3 |
| 5. Toda acción con responsable, plazo y criterio de eficacia | §10 y §11.2 |
| 6. No verifica la eficacia quien implementó | §11.1 |
| 7. Solo se cierra con la eficacia verificada, tras dos ciclos de medición o dos meses, lo que sea mayor | §11.3 |
| 8. Los hallazgos de entes externos tienen prioridad alta y plazo según la norma | §7.2 y §13.4 |
| 9. Informe consolidado trimestral a Gerencia y al Comité | §18.1 |

### A.2 SGC-FO-AC-01

| Sección | Campos | Dónde quedó |
|---|---|---|
| 1. Identificación | Consecutivo, fecha de registro, clasificación, proceso afectado, responsable del proceso, fuente, criticidad, requisito incumplido, descripción | §7.1. «Clasificación» es la clase; el responsable del proceso son sus líderes |
| 2. Corrección o contención | Si la requiere, fecha, descripción, responsable, evidencia | §8.4 |
| 3. Causa raíz | Metodología, causas, si hay similares en otros procesos, si se requieren cambios en el SGC | §9 |
| 4. Plan de acción | Acción, responsable, recursos, fechas, indicador de eficacia; Elaboró, Revisó, Aprobó | §10, §11.2 y §12. El responsable y las fechas viven en la actividad |
| 5. Seguimiento | Acción, fecha, actividades realizadas, avance, barreras, responsable | §10.3 |
| 6. Verificación de eficacia | Fecha, periodo, quién, criterios, resultado, justificación | §11.4 |
| 7. Cierre | Decisión, fecha, lecciones aprendidas, justificación si se reabre; cierre autorizado, visto bueno del Gerente, verificación | §11.5. El visto bueno del Gerente es un aviso [Usuario, 5.8]; la «nueva NC asociada» es el hallazgo derivado |

### A.3 SGC-FO-AC-02, 5 porqués

Información general (hallazgo, fecha, proceso, responsable, equipo, descripción): sale del hallazgo
y del análisis. Los cinco niveles con su respuesta y su evidencia: §9.1. La conclusión (causas,
causas comunes con otros procesos, cambios requeridos, observaciones): §9.2 y §9.3. Las firmas
(realizó, validó, visto bueno): las de §12 sobre el plan, que incluye el análisis.

### A.4 SGC-FO-AC-03, Ishikawa

Las seis categorías con sus causas posibles y la marca de confirmada: §9.1. La priorización de las
confirmadas (categoría, impacto, relación con la causa raíz, si requiere acción): el impacto y
«requiere acción» van en cada causa confirmada; la relación con la causa raíz es la lista de §9.2.
La conclusión y las firmas, como en A.3.

### A.5 SGC-FO-AC-04, Pareto

El periodo, el total de eventos, las causas con su frecuencia, los porcentajes, la clasificación
vital o trivial, la interpretación, la fuente de los datos y la gráfica: §18.2. El total y los
porcentajes los calcula el sistema.

### A.6 SGC-FO-14 y SGC-FO-28

**SGC-FO-14.** Encabezado: origen del plan, código, macroproceso, proceso, responsable y cargo,
vigencia, fecha de elaboración, fuente del hallazgo, objetivo: §17.1 (el macroproceso, el
responsable y su cargo salen del proceso de cada impreso). Filas: número, hallazgo u oportunidad,
causa raíz, acción, tipo, responsable, recursos, inicio, fin, indicador de cumplimiento, meta y
seguimiento (fecha, avance, observaciones o evidencia): una fila por actividad. Sus convenciones de
tipo (AC, AP, AM) son los tres tipos de §10.1; «OB, observación» es una clase, no un tipo. Sus
convenciones de estado, §10.2.

**SGC-FO-28.** Identificación (periodo, fecha, número, tipo de seguimiento, responsable, procesos):
§18.1. El resumen ejecutivo, el análisis de eficacia y tendencias, el detalle de lo vencido, las
conclusiones, las recomendaciones y el control del informe: §18.1. La matriz consolidada tiene
diecisiete columnas, que son también las del Excel de la lista (§16.3):

| # | Columna | De dónde sale |
|---|---|---|
| 1 | N° | El orden |
| 2 | Proceso | El hallazgo |
| 3 | Fuente u origen | El origen |
| 4 | Tipo de acción | El tipo de la acción |
| 5 | Código del hallazgo | `HZ-…` |
| 6 | Descripción del hallazgo | El título y la descripción |
| 7 | Causa raíz identificada | Las causas que la acción ataca, y el método |
| 8 | Acción formulada | La acción y su actividad |
| 9 | Responsable | El de la actividad, con su cargo |
| 10 | Fecha de inicio | La de la actividad |
| 11 | Fecha límite | El fin vigente; el Excel añade el fin original |
| 12 | Avance | El de la actividad |
| 13 | Estado | El de la actividad (§10.2) |
| 14 | Evidencia de implementación | Cuántos archivos y el último seguimiento |
| 15 | Evaluación de eficacia y criterio | El resultado de la ronda y su criterio |
| 16 | Observaciones o causa del retraso | Las barreras del último seguimiento y la causa del ajuste |
| 17 | Decisión de la Alta Dirección | La del ajuste (reprogramar), la escalada (escalar) o el cierre (cerrar) |

### A.7 Evidencia de los puntos de control del SGC-PR-03

| Punto de control | Evidencia en el sistema | Entrega |
|---|---|---|
| PC-01 Registro completo y clasificado | El hallazgo con su origen, requisito, evidencia, clase y criticidad; quién lo registró y cuándo | 15A |
| PC-02 Corrección implementada | La corrección con su responsable, su fecha y su evidencia, antes del plan | 15A |
| PC-03 Causas raíz sustentadas | Los análisis con su método, las causas y las dos preguntas | 15A (Pareto, 15C) |
| PC-04 Plan aprobado | El plan congelado, con las firmas Elaboró, Revisó y Aprobó y su huella | 15A |
| PC-05 Evidencia de ejecución | Los seguimientos y los archivos de cada actividad; no se termina sin evidencia | 15A |
| PC-06 Documentos y riesgos actualizados | El trámite documental enlazado y publicado; la comprobación del cierre | 15B |
| PC-07 Cumplimiento del cronograma | Las fechas originales y vigentes, los ajustes aprobados con su causa, los avisos y la escalada | 15A |
| PC-08 Implementación verificada | La verificación actividad por actividad, con quién, cuándo y cómo | 15A |
| PC-09 Eficacia demostrada | La evaluación con su criterio, su periodo, lo congelado y la firma Verificó, después de la espera | 15A |
| PC-10 Cierre autorizado | La firma Cerró con las lecciones aprendidas; o la ronda nueva | 15A |
| PC-11 Reporte institucional | El informe SGC-FO-28 firmado y en PDF | 15C |

## Apéndice B — Para ajustar en los textos del hospital

No bloquea el desarrollo. Son diferencias entre los formatos, o entre ellos y lo que el usuario
decidió para la plataforma.

1. **Fuentes.** Las listas de fuentes del SGC-FO-14 (nueve), del SGC-FO-AC-01 (siete) y del
   SGC-FO-28 (once códigos) no coinciden. La plataforma usa los catorce orígenes de §7.2.
2. **Tipos de acción.** El SGC-FO-14 usa AC, AP, AM y OB; el SGC-FO-28, AC, OM y AP. La plataforma
   usa correctiva, preventiva y de mejora; la observación es una clase de hallazgo.
3. **Estados.** «Abierta» es «en ejecución» en el SGC-FO-14 y «sin iniciar» en el SGC-FO-28. La
   plataforma usa los de §10.2.
4. **SGC-PR-03.** Tiene dos secciones numeradas 11; su §9 llama al SGC-FO-AC-02 «5 Porqués /
   Ishikawa» y no lista el SGC-FO-AC-03 ni el SGC-FO-AC-04; su §8 (diagrama de flujo) y su §10
   (indicadores del procedimiento) están vacíos. Los cuatro cálculos de §18.3 pueden llenar el §10.
5. **SGC-FO-28.** Cita el literal f) de ISO 10.2.1 para la evaluación de eficacia; el literal que la
   pide es el d).
6. **Criticidad.** El SGC-PR-03 habla de no conformidad «mayor o crítica» y el SGC-FO-AC-01 de
   criticidad alta, media o baja. La plataforma usa la segunda; el campo «Clasificación» del formato
   es la clase.
7. **Quién evalúa la eficacia.** La actividad 9 del SGC-PR-03 dice «Líder SGC + Responsable de
   Proceso», y su §5.6 dice que no puede evaluarla quien implementó. La plataforma aplica el §5.6.
8. **Visto bueno del Gerente en el cierre** (SGC-FO-AC-01 sección 7): en la plataforma es un aviso,
   no una firma.
9. **«Nueva NC asociada» al reabrir** (SGC-FO-AC-01 sección 7): en la plataforma se reabre el mismo
   hallazgo con otra ronda; un problema distinto es un hallazgo derivado.
10. **Reprogramación «aprobada por Alta Dirección»** (SGC-FO-28): en la plataforma la aprueba quien
    aprobó el plan.
11. **La matriz SGC-MZ-AC-01** que cita el procedimiento es la lista de la plataforma.
12. **Cierre sin acción.** El SGC-FO-AC-01 no tiene dónde decir que una no conformidad se cerró sin
    corrección y sin acción correctiva. La plataforma lo registra como «Cerrado sin acción», con
    las dos justificaciones y quien las validó; conviene que el procedimiento lo nombre.
13. **Códigos.** El SGC-FO-14 y el SGC-FO-28 siguen la forma `SGC-FO-NN`; los cuatro de acción
    correctiva, `SGC-FO-AC-NN`. Conviene unificarlos antes de registrarlos como documentos.

## Apéndice C — Los festivos de Colombia

La regla (Ley 51 de 1983), que el sistema calcula para cualquier año:

- **De fecha fija:** 1 de enero, 1 de mayo, 20 de julio, 7 de agosto, 8 de diciembre y 25 de
  diciembre.
- **Se trasladan al lunes siguiente cuando no caen en lunes:** 6 de enero, 19 de marzo, 29 de junio,
  15 de agosto, 12 de octubre, 1 de noviembre y 11 de noviembre.
- **Dependen de la Pascua:** el Jueves Santo (tres días antes del domingo de Pascua) y el Viernes
  Santo (dos días antes), sin traslado; y, trasladados al lunes, la Ascensión (43 días después del
  domingo de Pascua), el Corpus Christi (64 días después) y el Sagrado Corazón (71 días después).

Con esa regla, los dieciocho festivos de 2026 son: 1 y 12 de enero; 23 de marzo; 2 y 3 de abril; 1 y
18 de mayo; 8, 15 y 29 de junio; 20 de julio; 7 y 17 de agosto; 12 de octubre; 2 y 16 de noviembre;
8 y 25 de diciembre. **Esta lista sale de aplicar la regla; antes de usarla como caso de prueba, el
constructor la contrasta, junto con la de otros dos años, con un calendario oficial publicado.**
