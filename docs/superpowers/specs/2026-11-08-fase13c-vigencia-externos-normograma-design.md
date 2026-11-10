# Fase 13C — Vigencia, externos y normograma (diseño)

Fecha: 2026-11-08. Estado: **aprobado por el usuario el 2026-11-08** («aprobado»), después de la
revisión del constructor, cuyas seis preguntas y cinco choques con el código quedaron resueltos en
§7.1, §8.3, §8.5, §8.8, §9.3, §9.5, §10.5, §11.3 y §12.3 (F13C-DC31 a DC39). Sigue el plan de
implementación.

## 0. Cómo leer este documento

Es el detalle de la **tercera y última de las tres entregas** en que el usuario partió la Fase 13
del diseño maestro `docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` ("el
spec maestro"). Mandan, en este orden: el spec de la 13A
(`2026-11-05-fase13a-flujo-documental-design.md`, "el spec 13A": §5 reparto, §6.5 y §12
visibilidad, §11 publicación y eliminación, §14 tareas y avisos, Apéndice A el procedimiento
del hospital), el spec de la 13B (`2026-11-07-fase13b-distribucion-puntos-de-uso-design.md`,
"el spec 13B": §6.4 quién ve qué, §9 acuses, §11 verificaciones, §12 tareas), el spec maestro
(§5.3 visibilidad, §5.6 notificaciones y tareas, §6.1 puntos 1.9 y 1.11, adiciones 5 y 12, §6.2
recomendación 6, §6.4 tablero y reportes, §8 Fase 13) y las reglas permanentes de `AGENTS.md`.
Donde este documento y los anteriores difieran, manda este; §2 y §5 dicen en qué.

El hospital tiene escritos el paso 11 (controlar la vigencia de los documentos externos y
actualizar la matriz SGC-MZ-03) y el paso 13 (revisión anual de los documentos del SGC, con el
registro SGC-RG-06 «por crear») de su procedimiento de control de documentos (spec 13A,
Apéndice A), pero **no los ha puesto en práctica**: el SGC está en implementación y no se ha
hecho ninguna revisión anual ni existe registro de ella [Usuario, 2026-11-08]. Esta entrega
diseña esa práctica desde cero y deja la evidencia de los puntos de control PC-11 y PC-13.

Las maquetas aprobadas (no versionadas) están en
`.superpowers/brainstorm/45247-1794173518/content/pantallas-13c.html`: la barra lateral, el
semáforo, la ficha con la ratificación y el bloque de externo, la revisión anual vista por el
Admin SGC y por el líder, el informe, la matriz de externos con la verificación, el normograma
con la ficha de una norma y la tarea de impacto, los indicadores y la página del proceso. Son la
referencia del **contenido** de cada pantalla; el estilo es el sistema visual de la Fase 12.

Vocabulario de este documento:

- **Plazo de revisión:** los meses que un documento vigente puede estar sin que alguien
  confirme que sigue adecuado (12 por defecto, por tipo, ajustable por documento). **Fecha
  base:** desde cuándo se cuenta (§7.1). **Próxima revisión:** la fecha base más el plazo, o la
  fecha fijada a mano.
- **Ratificación:** el acto firmado con clave por el que el líder del proceso, el Admin SGC o
  Gerencia confirma que un documento vigente sigue adecuado tal como está; reinicia el reloj sin
  versión nueva (§7.3).
- **Semáforo:** el estado de vigencia de cada documento: al día, atención, vencida, en trámite
  (§7.2).
- **Revisión anual:** la campaña institucional, una por año, en la que cada líder decide sobre
  cada documento vigente de sus procesos (ratificar, actualizar o eliminar) y que termina en el
  **informe** SGC-RG-06 (§9). **Decisión:** lo que el líder dejó registrado por documento.
- **Documento externo:** un documento que el hospital usa para operar y no escribió (guías de
  práctica clínica, manuales de equipos, lineamientos, normas técnicas); entra al Listado
  Maestro con **control propio**: emisor, **edición adoptada**, fecha de adopción, responsable
  técnico y **verificación de vigencia** periódica (§8). **Adopción:** el acto firmado por el
  que se toma una edición como la que rige en el hospital.
- **Norma:** una ley, decreto, resolución, circular o acuerdo que obliga al hospital; vive en
  el **normograma** con su estado y sus **relaciones** (modifica a, deroga a, reglamenta a) y se
  asocia a procesos, con el **requisito** que impone a cada uno, y a documentos (§10).
  **Impacto normativo:** la tarea que nace cuando una norma cambia de estado, para que el líder
  revise los documentos enlazados.
- **Indicador documental:** una de las siete medidas del desempeño del proceso documental, con
  su **meta** configurable (§11).
- **Coordinador SGC**, **Admin SGC**, **líder**, **trámite**, **firma**, **huella**,
  **audiencia**, **acuse**, **copia controlada**, **punto de uso**, **hallazgo**: como en los
  specs 13A y 13B.

Las etiquetas entre corchetes dicen de quién es cada decisión: **[Usuario]**, **[Spec
maestro]**, **[Spec 13A]**, **[Spec 13B]** o **[Decisión de Claude]**. Las de Claude están
reunidas en §23 para revisarlas de una vez, con su base (ISO, Regulación o Práctica).

## 1. Intención y porqué

La 13A dejó el documento aprobado y publicado dentro del sistema y la 13B dejó rastreado lo que
pasa con el papel y con las personas. Falta el tiempo: que ningún documento vigente envejezca sin
que alguien lo mire, que lo que el hospital usa y no escribió tenga la misma disciplina de
vigencia, que las normas que obligan estén escritas y que un cambio normativo no se entere nadie
por casualidad, y que todo eso se pueda medir.

El objetivo de la fase, en una frase: **que el hallazgo «documento desactualizado en
circulación» sea imposible también por el paso del tiempo y por el cambio de la ley, no solo
por una versión nueva mal controlada.** Un documento vigente tiene fecha de próxima revisión y
alguien con la tarea de ratificarlo o cambiarlo; un externo tiene quien verifique que su edición
sigue siendo la del emisor; una norma derogada abre la revisión de los documentos que la
implementaban; una vez al año el SGC entero se recorre y queda un informe; y siete indicadores
dicen cómo va el proceso documental.

Lo que la 13C deja listo para las fases siguientes: el catálogo de normas del que la Fase 14
toma «norma que lo exige» para los indicadores regulatorios; las funciones puras de los
indicadores documentales, que la 14 podrá exponer como fichas técnicas con fuente automática y la
17 pone en el tablero; el informe de revisión anual como entrada «cambios documentales» de la
revisión por la dirección (Fase 17); los Excel de normograma, externos e indicadores, que la 17
viste con pie de control; y las tareas y avisos nuevos que la Fase 16 llevará al correo y al
planificador.

## 2. Decisiones del usuario (2026-11-08)

Tomadas una por una en conversación, con las recomendaciones de Claude y su base; el usuario
eligió por número. Pidió además que cada bloque de opciones cierre con una recomendación explícita
(«la próxima vez cuando sean varias opciones incluye tu recomendación»); así se hizo desde el
tema 3. Punto de partida, en sus palabras: «como apenas está en implementación entonces no se ha
realizado una revisión anual, por lo tanto no hay registros del mismo»: no hay formato previo del
SGC-RG-06 ni práctica que respetar.

1. **Qué reinicia el reloj de revisión: la ratificación registrada** («opción 1», puntos 1.1 a
   1.5 aceptados sin objeción). El líder del proceso propietario o el Admin SGC (y Gerencia en los
   estratégicos) confirma con su clave que el documento sigue adecuado: queda como firma
   «Ratificó» con nota y huella, sin versión nueva, y la próxima revisión se recalcula. Si necesita
   cambios, abre la solicitud con el motivo «revisión anual» que ya existe. Fecha base: la
   publicación, o la fecha de aprobación registrada en los cargados fuera de la plataforma; el
   Admin SGC puede fijar «Próxima revisión» por documento, auditado y visible como tal. Tarea al
   líder en «atención»; vencido avisa y escala; vencido no bloquea la descarga. Solo la vigente se
   ratifica y no con trámite abierto. Dos precisiones de Claude aceptadas: sin líder, la tarea va
   al Admin SGC; la fecha fijada a mano se muestra como «fijada por X el …».
2. **Externos y normograma son dos registros con enlace** («opción 1 y del 2.1 al 2.6
   entran»). El normograma registra lo que obliga; los externos, lo que se consulta para operar y
   el hospital no escribió. Un externo es un documento del Maestro con tipo «Documento externo»
   (sigla `DE`) y marca de origen externo; adoptar una edición nueva deja obsoleta la anterior por
   el camino de publicar (copias por recoger, acuses). Datos de control: emisor, título original,
   edición, fechas de emisión y adopción, fuente oficial sin consultarla, responsable técnico,
   periodicidad de verificación (12 meses), archivo opcional y norma enlazada. Alta y adopción sin
   trámite, con clave («Adoptó»), por el Admin SGC o el líder para sus procesos. Verificación de
   vigencia como tarea periódica sin clave con tres resultados y registro inmutable. La pantalla
   «Documentos externos» es la matriz SGC-MZ-03, con Excel. El Maestro gana la columna «Origen»
   y los externos entran a los indicadores.
3. **Caracterización estructurada: no se construye nada** («creo que no es necesario realizar
   nada nuevo o que piensas?», con la opinión coincidente de Claude). El documento tipo CA sigue
   siendo la caracterización oficial del proceso; el 1.1 del spec maestro queda corregido (§5).
   Lo que de verdad importaba llega por otros caminos: el CA aparece entre los documentos del
   proceso y la página del proceso muestra «Normas aplicables» desde el normograma.
4. **Revisión anual como campaña con decisiones por documento y cierre con informe** («opción
   1 y del 4.1 al 4.7 entran»). El Admin SGC la abre con plazo (60 días por defecto); cada líder
   decide por documento (ratificar, actualizar, eliminar); lo sin decisión al cierre queda «sin
   revisar»; el cierre con clave genera el informe SGC-RG-06 en PDF sobre el membrete del acta, con
   las decisiones, responsables, fechas y el estado de los trámites al cierre. Una sola revisión
   abierta a la vez, prorrogable con motivo; lo revisado en los seis meses previos cuenta como
   «revisado recientemente»; los externos entran con su verificación; insumos junto a cada
   documento; Gerencia y Control Interno leen; tarea con conteo que vence con la campaña; el
   informe queda como insumo de la Fase 17.
5. **Normograma: el Admin SGC administra el catálogo y los líderes asocian; un cambio de
   estado abre el impacto documental** («sigue tu recomendación»: A1, B1 y 5.1 a 5.8). Campos
   con tipo de norma como maestro editable y emisor como texto con sugerencias; relaciones
   «modifica a», «deroga a» y «reglamenta a», que cambian el estado de la norma afectada; dos
   asociaciones (norma–proceso con el requisito, norma–documento); entrada propia «Normograma»
   para todo usuario con sesión, con lista, filtros, ficha, «Normas aplicables» en la página del
   proceso y Excel; normas en la búsqueda; la vigencia del normograma se confirma por proceso en la
   campaña anual; nada se borra, se retira con motivo. Descartado sin opción: un permiso
   individual para el líder de Jurídica (cambio 15 de la 13A, rechazado).
6. **Indicadores documentales en una página propia dentro de «Vigencia», con metas** («sigue
   con tu recomendación»: A1, B1 y 6.1 a 6.6). Siete indicadores: los cuatro de la adición 12, la
   conformidad en puntos de uso, los externos al día y las etapas del trámite cerradas en plazo;
   metas configurables con semáforo cumple / no cumple y valores por defecto; indicadores de
   estado a la fecha y de flujo por periodo; Excel; permiso nuevo para Admin SGC, Gerencia,
   Control Interno y líder; cálculo en funciones puras reutilizables por la Fase 14.
7. **Las maquetas** de `pantallas-13c.html`, con la **opción A** de la barra lateral («opción a,
   continua», y clic en A en el navegador): una entrada **«Vigencia»** con cuatro pestañas
   (Semáforo, Revisión anual, Externos, Indicadores) y una entrada **«Normograma»** aparte.
8. **Las cinco preguntas heredadas de la 13B entran todas** («entran las 5»): Excel de
   socializaciones; fecha de corrección ajustable al cerrar una verificación; catálogos de puntos
   de uso y listas en solo lectura para Gerencia y Control Interno; miembro «todos los usuarios
   activos» en las listas; cierre de hallazgos en dos pasos con validación automática por la
   siguiente verificación. Más las dos tareas pequeñas que van al plan sin preguntar (§12.6).

Se mantienen de decisiones anteriores: la plataforma es la copia digital controlada [Spec 13A
§2]; sin permisos individuales (cambio 15); el correo, el planificador y la vigencia en fecha
futura son de la Fase 16; los reportes formales con pie de control, de la 17; las acciones
correctivas desde un hallazgo, de la 15; la importación por lote, de la 20; la retención y
disposición final (adición 9) sigue rechazada.

## 3. Metas, no metas y anti-metas

**Metas**

- Todo documento vigente, interno o externo, tiene una próxima revisión calculada, un estado de
  vigencia visible donde se le mira (ficha, listas, Maestro, página del proceso) y alguien con la
  tarea de ratificarlo, cambiarlo o verificarlo antes de que venza.
- La ratificación deja quién, cuándo, nota y huella, en registro inmutable, sin versión nueva.
- Cada documento externo tiene emisor, edición adoptada, responsable técnico y una verificación
  periódica registrada; la matriz SGC-MZ-03 sale de los datos (PC-11).
- La revisión anual recorre todo el SGC con una decisión por documento y termina en el informe
  SGC-RG-06, congelado y firmado (PC-13).
- El normograma institucional y por proceso sale de los datos, con relaciones y estado; un cambio
  de estado abre la revisión de los documentos enlazados y deja constancia de cómo se resolvió.
- Siete indicadores del proceso documental con meta, por periodo y por proceso, calculados de los
  datos y exportables.
- Todo lo anterior entra por «Mis tareas» y la campana, sin planificador ni correo, con los mismos
  vencimientos y escalamientos de la 13A y la 13B, y sin avalancha de avisos el primer día.

**No metas**

- Correo, planificador y vigencia en fecha futura: Fase 16. Reportes con pie de control y foto
  mensual del tablero: Fase 17. Acciones correctivas desde un impacto o un hallazgo: Fase 15.
- Caracterización estructurada del proceso [Usuario, decisión 3]: el documento CA es la
  caracterización.
- Consultar fuentes legales externas, descargar normas de internet o detectar cambios normativos
  solos [Spec maestro 1.9]: la entidad registra; el sistema recuerda y propaga.
- Verificación periódica norma por norma como la de externos [Usuario, 5.7]: el normograma se
  confirma por proceso en la campaña anual.
- Alertas por desviación de los indicadores documentales: el semáforo se ve en la página; las
  alertas y el tablero son de la 16 y la 17.
- Serie mensual histórica de los indicadores de estado: necesita la foto mensual de la 17.
- Un trámite para registrar o adoptar un externo [Spec maestro, adición 5]: alta y adopción
  firmadas, sin elaboración ni revisión.
- Normas con nivel de acceso restringido: el normograma es de consulta para todo usuario con
  sesión.

**Anti-metas** (si pasa, la entrega falló)

- Que un documento vigente pase su fecha de revisión sin que nadie tenga la tarea ni reciba el
  aviso, o que un vencido deje de poder descargarse.
- Que el reloj de revisión se reinicie sin un acto firmado o una publicación; o que una fecha
  fijada a mano se confunda con una ratificación.
- Que una edición nueva de un externo quede vigente sin dejar obsoleta la anterior, sin recoger
  sus copias ni pedir acuses; o que un externo se adopte o se retire sin que quede quién y cuándo.
- Que una norma pase a derogada y los documentos que la implementan no queden marcados ni nadie
  reciba la tarea de revisarlos.
- Que el informe de la revisión anual se pueda cambiar después de firmado, o que una decisión
  registrada desaparezca.
- Que la carga inicial (unos 200 documentos aprobados en papel) amanezca con 200 avisos de
  vencimiento en la campana del Admin SGC.
- Que registrar una ratificación, una verificación o una norma sea más lento que la hoja de
  Excel: ningún paso pide un dato que el sistema ya tiene.

## 4. Restricciones

Rigen todas las de `AGENTS.md` y las de los specs 13A §4 y 13B §4. Las propias de esta entrega:

- **Sin dependencias npm nuevas.** `pdf-lib` (informe sobre el membrete), `exceljs` (Excel) y
  `zod` ya están.
- **Migración aditiva** (`0008`), aplicable sobre una base de `sgc-suaza`, de la 13A o de la 13B:
  tablas y columnas nuevas; donde una restricción existente estorba, se amplía la lista de un
  `CHECK` o se sustituye por otra que los datos existentes cumplen (`firmas.tramite_id`,
  `lista_miembros.referencia_id`, §15.1). Nada se renombra ni se borra.
- **Sin planificador:** los vencimientos de revisión, de verificación de externos, de impactos y
  de la campaña entran en la misma revisión de la 13A y la 13B, que corre cuando alguien usa la
  aplicación (§13.3).
- **Las URL existentes se conservan.** Las nuevas van bajo `/vigencia`, `/normograma` y
  `/api/{externos,normas}` (§14.5).
- **Cada página nueva llama su guard y cada acción empieza por la sesión y la autorización**;
  los tests estructurales se amplían a los archivos nuevos (§18). Toda escritura lleva un permiso
  de la matriz (§6.2) más, donde aplica, la condición de persona o de alcance.
- **Las rutas que reciben una subida van fuera del `matcher` del proxy** (`api/externos/…` y
  `api/normas/…`), con su caso en `tests/proxy-matcher.test.ts`.
- **Fechas y plazos en la zona de la instalación**; el plazo de revisión y el de verificación se
  cuentan en meses calendario; los demás plazos, en días calendario; todos se configuran en
  Configuración documental.
- **Toda firma sigue el patrón de la 13A** (F13A-R4): la clave se verifica fuera de la
  transacción, lo que puede fallar va antes en un validador de solo lectura, y los fallos cuentan
  para el bloqueo.
- **Accesibilidad no negociable** y 390 px: la verificación de un externo y la decisión de la
  revisión anual se hacen también desde el celular.
- **Tests contra la BD de desarrollo**: nunca `DELETE` ni `UPDATE` sobre las tablas inmutables;
  datos con nombre único por corrida; flujos dentro de transacciones que se revierten.

## 5. Mapa de la Fase 13 (reparto cerrado)

El reparto es el del spec 13A §5. Esta entrega cubre los pasos 11 y 13 del procedimiento y la
evidencia de PC-11 y PC-13, y cierra la Fase 13:

| Punto de control | Evidencia en el sistema | Dónde |
|---|---|---|
| PC-11 Control de documentos externos | Cada externo con emisor, edición, adopción firmada, responsable técnico, verificaciones registradas con fuente y resultado; la matriz es la pantalla «Externos» con su Excel; una edición nueva recoge copias y pide acuses («divulgación cuando impacta procesos») | §8 |
| PC-13 Revisión anual y actualización ejecutada | Campaña con decisión por documento, responsable y fecha; informe SGC-RG-06 congelado y firmado con el estado de los trámites al cierre («evidencia de ejecución») | §9 |

Correcciones al spec maestro que esta entrega formaliza, como la 13A hizo con la DC11:

- **1.1, caracterización estructurada: no se construye** [Usuario, decisión 3]. ISO 4.4.1 y
  4.4.2 a) piden determinar los procesos y mantener información documentada «en la medida
  necesaria», sin fijar la forma; el documento tipo CA ya cumple, y los enlaces que la justificaban
  (normas aplicables, indicadores) cuelgan directamente del proceso. El reporte «caracterización
  de proceso» de §6.4.2 pasa a ser el propio documento CA.
- **Adición 5, «sin versionarlos como internos»:** se lee como «sin trámite», no como «sin
  versiones». Un externo tiene versiones (una por edición adoptada), así que el índice de una sola
  vigente, el Maestro, las copias controladas y los acuses funcionan igual que con los internos
  [Decisión de Claude].
- **§7 del spec maestro:** los campos de externo van en una tabla propia (`externos`) y no como
  columnas sueltas de `documentos`; «meses de revisión» sí va en `tipos_documento` y en
  `documentos` como dice allí.

Tres textos del procedimiento que el hospital ajusta por su cuenta: la **matriz SGC-MZ-03** pasa
a ser la pantalla «Externos» del sistema; el **SGC-RG-06** «por crear» es el informe que el sistema
genera al cerrar la revisión anual (si el hospital quiere ese código en el encabezado, registra un
formato con él y lo elige en Configuración documental, §9.5); y el paso 13 habla de «este
procedimiento»: el procedimiento de control de documentos es un documento más de la lista y se
revisa igual.

## 6. Actores, permisos y visibilidad

### 6.1 Quién es quién

| En el procedimiento | En el sistema |
|---|---|
| Coordinador SGC | `admin_sgc`: abre, prorroga y cierra la revisión anual; ratifica, registra y adopta externos, administra el normograma, resuelve impactos, fija próximas revisiones y metas, exporta |
| Líder de proceso | `lider_proceso`: ratifica los documentos de sus procesos, decide en la revisión anual, registra y adopta externos de sus procesos, asocia normas a sus procesos y resuelve sus impactos; ve el semáforo y los indicadores de su alcance |
| Gerencia | `gerencia`: ratifica los documentos de tipo estratégico; ve todo en solo lectura (semáforo, revisión anual e informe, externos, indicadores) |
| Control Interno | `control_interno`: ve todo en solo lectura |
| Responsables técnicos (paso 11) | Cualquier usuario activo designado como responsable técnico de un externo; verifica su vigencia. No cambia su rol |
| Personal | Cualquier usuario: consulta el normograma; recibe acuses cuando se adopta una edición nueva |

### 6.2 Permisos nuevos en la matriz (`src/lib/permisos.ts`)

| Permiso | Roles | Qué concede |
|---|---|---|
| `vigencia.ver` | `admin_sgc`, `gerencia`, `control_interno`, `lider_proceso` | Ver «Vigencia» y sus pestañas Semáforo, Revisión anual y Externos. El líder, solo lo de los procesos de su alcance |
| `documentos.ratificar` | `admin_sgc`, `gerencia`, `lider_proceso` | Ratificar un documento vigente: el líder, los de su alcance; Gerencia, solo los de tipo estratégico |
| `revision_anual.gestionar` | `admin_sgc` | Abrir, prorrogar y cerrar la revisión anual; fijar «Próxima revisión» a mano |
| `revision_anual.decidir` | `admin_sgc`, `lider_proceso` | Decidir por documento y confirmar el normograma de los procesos de su alcance |
| `externos.gestionar` | `admin_sgc`, `lider_proceso` | Registrar un externo, adoptar una edición, cambiar sus datos de control y designar su responsable técnico, para documentos de su alcance |
| `externos.verificar` | Los cinco roles | Registrar la verificación de vigencia de un externo **del que se es responsable técnico** (o con `externos.gestionar` sobre él) |
| `normograma.administrar` | `admin_sgc` | Crear y editar normas, cambiar su estado, registrar relaciones, adjuntar su PDF, retirar; tipos de norma |
| `normograma.procesos` | `admin_sgc`, `lider_proceso` | Asociar o quitar normas de los procesos de su alcance con su requisito, enlazar documentos de su alcance y resolver los impactos de sus procesos |
| `documentos.indicadores` | `admin_sgc`, `gerencia`, `control_interno`, `lider_proceso` | Ver y exportar los indicadores documentales; el líder, los de su alcance |

Cada celda lleva su test. `externos.verificar` lo tienen los cinco roles por la misma razón que
`distribucion.responder` (spec 13B §6.2): la regla de negocio 4 exige un permiso de matriz en toda
escritura, y el responsable técnico puede tener cualquier rol; la condición de persona se
comprueba en el servidor además del permiso. El normograma se **lee** sin permiso, como `/buscar`:
toda persona con sesión. Las metas de los indicadores y los demás parámetros de esta entrega se
editan en Configuración documental con `tramites.gestionar`, como los de la 13A y la 13B.

### 6.3 Reglas de separación

- **Quien usa el documento confirma que sigue sirviendo:** ratifica el líder del proceso
  propietario (o el Admin SGC; en los estratégicos también Gerencia) [Usuario, 1.4]. No se exige
  que sea distinto de quien elaboró o aprobó la versión: la ratificación no es una aprobación nueva,
  es la constancia de una revisión [Decisión de Claude].
- **Un documento con trámite abierto no se ratifica** ni recibe decisión distinta de «en trámite»
  en la revisión anual: el trámite ya es su revisión [Usuario, 1.5].
- **La verificación de un externo la registra su responsable técnico** sin clave; **adoptar o
  retirar** lo hace quien gestiona, y adoptar lleva clave [Usuario, 2.3 y 2.4].
- **El Admin SGC cambia el estado de una norma; el líder asocia y resuelve impactos** de sus
  procesos [Usuario, A1 y B1]. Quien resuelve «no afecta» escribe por qué.
- **Quien corrige un hallazgo no lo valida:** el responsable del punto marca «Corregido» y lo
  valida el Admin SGC o la siguiente verificación [Usuario, decisión 8, punto 5; spec maestro §5.4].

### 6.4 Quién ve qué

| Qué | Quién lo ve |
|---|---|
| Semáforo (estado de vigencia) | En la ficha, en Gestión de documentos, en el Maestro y en la página del proceso, quien ve el documento. La pestaña «Semáforo»: `vigencia.ver`; el líder, sus procesos |
| Ratificaciones | Quien ve la versión (bloque «Vigencia» de la ficha y bitácora) |
| Revisión anual | El Admin SGC, toda; cada líder, la de sus procesos y decide; Gerencia y Control Interno, toda en solo lectura. **El informe en PDF**, que lista todos los documentos: Admin SGC, Gerencia y Control Interno (los tres roles que ven lo restringido); los líderes ven la página de sus procesos y la sección de su proceso en pantalla [Decisión de Claude] |
| Externos | Como cualquier documento: la ficha, por nivel de acceso; la pestaña «Externos» (la matriz): `vigencia.ver`; el responsable técnico ve los suyos aunque no tenga `vigencia.ver` (`siResponsableTecnico`, como `siResponsable` en la 13B) |
| Normograma | Toda persona con sesión: lista, ficha, PDF adjunto y Excel. En la ficha de la norma, el enlace a un documento restringido solo lo ve quien ve el documento [Usuario, 5.5] |
| Impactos normativos | El líder del proceso afectado y el Admin SGC; el documento marcado dice «Revisión por cambio normativo» a quien ve el documento |
| Indicadores documentales | `documentos.indicadores`; el líder, sus procesos; los porcentajes por proceso de un proceso ajeno no se le muestran |

Para quien no puede ver algo, no existe: página «no encontrada» y archivo 404, como en la 13A y
la 13B. Las páginas de «Vigencia» y del normograma siguen el patrón de `exigirDistribucion` de la
13B (`exigirSesion` y después la regla de alcance, con `notFound()`), no el de `exigirPermiso`, que
redirige a `/sin-acceso` [Decisión de Claude]. Las reglas viven en `src/lib/alcance.ts` (una
función por entidad: `puedeVerRevisionAnual`, `puedeVerInformeAnual`, `puedeVerExterno`,
`puedeRatificar`, `puedeDecidirEn`, `puedeVerImpacto`).

## 7. Plazo de revisión, ratificación y semáforo

### 7.1 El plazo y la fecha base

- Cada **tipo de documento** tiene un plazo de revisión en meses (`meses_revision`, 12 por
  defecto; la semilla mínima y la migración lo ponen en 12 para todos los tipos). Cada
  **documento** puede fijar el suyo (`documentos.meses_revision`, opcional); si no, rige el del
  tipo [Spec maestro §6.1 y §7; Usuario, 1].
- La **fecha base** de un documento interno depende del **origen de la aprobación** de su
  versión vigente: aprobada **en la plataforma**, la fecha de publicación (`publicado_en`);
  aprobada **fuera de la plataforma**, la **fecha de aprobación** que se registró
  (`fecha_aprobacion`), **nunca la de la carga**: la carga directa también escribe `publicado_en`
  con la fecha en que se cargó, así que un `COALESCE` daría a los 200 documentos de la carga
  inicial un año de gracia que no tienen [Decisión de Claude, tras la revisión del constructor].
  Una **ratificación** posterior la reemplaza [Usuario, 1.1]. La de un externo es su última
  **verificación** o, si no hay, su adopción (§8.4).
- La **próxima revisión** es la fecha base más el plazo, salvo que el Admin SGC haya **fijado**
  una fecha a mano (§7.4). Publicar una versión o ratificar borra la fecha fijada.
- Los externos usan su propia periodicidad (`externos.verificacion_meses`, 12 por defecto,
  ajustable por documento) y el mismo semáforo.

### 7.2 El semáforo

| Estado | Cuándo | Dónde se ve |
|---|---|---|
| **Al día** | Próxima revisión a más de `revision_atencion_dias` (90) | Chip con punto verde |
| **Atención** | Faltan `revision_atencion_dias` o menos, o el documento tiene un **impacto normativo pendiente** (§10.5) | Chip ámbar con los días o la leyenda «revisión por cambio normativo» |
| **Vencida** | Pasó la próxima revisión | Chip rojo con «hace N días» |
| **En trámite** | El documento tiene un trámite abierto | Chip de marca con la etapa y el día; reemplaza a los anteriores en pantalla, el estado de vigencia sigue calculándose por debajo |

Se calcula al mostrarse, nunca se guarda (spec maestro DC14). Aparece en: la **ficha** del
documento (bloque «Vigencia», §7.3); **Gestión de documentos** (columna «Vigencia» y filtro por
estado); el **Listado Maestro** y su Excel (columnas «Próxima revisión» y «Vigencia»); la
**página del proceso** (resumen «N con revisión vencida · M en atención» y el punto de color junto
a cada documento); la pestaña **Semáforo** de «Vigencia» (§14.2); y las **tarjetas del mapa**
no cambian [Decisión de Claude: el mapa cuenta vigentes, y un vencido sigue vigente].

**Vencida no bloquea** [Usuario, 1.3]: el documento sigue vigente, buscable y descargable, con su
marca de agua de siempre; la señal es el chip. Una versión obsoleta, anulada o descartada no tiene
semáforo.

### 7.3 La ratificación

Desde el bloque «Vigencia» de la ficha (portal o panel) y desde las filas del Semáforo y de la
revisión anual, el botón **«Ratificar sin cambios»** aparece a quien puede (§6.2 y §6.3) sobre un
documento **vigente, interno y sin trámite abierto**. Abre el diálogo de firma de la 13A
(`DialogoFirma`): nota opcional (hasta 1000 caracteres), clave y, si tiene segundo factor, código.
Al confirmar:

1. Validador de solo lectura: el documento sigue vigente, sin trámite abierto, quien firma sigue
   pudiendo (alcance, tipo estratégico para Gerencia).
2. La clave se verifica fuera de la transacción (`verificarParaFirmar`; un fallo cuenta para el
   bloqueo y queda en `accesos` como `firma_fallo`, F13A-DC8).
3. Dentro de la transacción, con la fila del documento bloqueada: se repiten las comprobaciones;
   se **recalcula la huella del archivo principal en disco** y se compara con la registrada: si
   no coincide, la ratificación se rechaza («El archivo en disco no coincide con el registrado;
   avise al Administrador del SGC») y queda en la bitácora como `ratificacion_rechazada`
   [Decisión de Claude: la misma comprobación única que la publicación, F13A-DC11; no es la
   verificación periódica rechazada]; se inserta la **firma** «Ratificó» (`firmas` con
   `tramite_id` nulo, `version_id` de la vigente, huella, método, nombre y cargo copiados) y la
   fila de **`ratificaciones`** (versión, firma, nota, próxima revisión resultante, revisión anual
   si viene de una campaña); se borra la fecha fijada a mano; `documentos.actualizado_en` no
   cambia (no cambió el documento). Bitácora `documento_ratificado`.
4. Sin avisos: quien ratifica es quien tenía la tarea; el Admin SGC lo ve en el Semáforo y en la
   bitácora [Decisión de Claude].

La ficha muestra «Ratificado el 8 nov 2026 por Hernán D. Ceballos · próxima revisión 8 nov 2027»
y el historial de ratificaciones de la versión; el Listado Maestro, la última revisión (publicación
o ratificación) en «Última revisión». Si el documento sí necesita cambios, el botón de al lado es
**«Solicitar cambio»**, que ya existe, con el motivo «revisión anual» propuesto.

### 7.4 Próxima revisión fijada a mano

El Admin SGC (`revision_anual.gestionar`) puede fijar la «Próxima revisión» de un documento desde
su ficha en el panel («Ajustar», con fecha y nota obligatoria) y, en el Semáforo, sobre la
**selección filtrada** («Fijar próxima revisión a los 37 documentos filtrados»), para que la carga
inicial no amanezca toda en rojo [Usuario, 1.1; Decisión de Claude: la acción masiva]. Queda en
`documentos.proxima_revision_fijada` con quién y cuándo, auditado por documento, y se muestra
siempre como «fijada por María F. Perdomo el 3 nov 2026» en la ficha, el Semáforo y el Maestro,
nunca como ratificación. La fecha debe ser futura y a lo sumo el plazo del documento contado desde
hoy.

### 7.5 Tarea, avisos y escalamiento

- Al entrar en **atención** nace la tarea «Revisar la vigencia de GTH-PR-01 v1 · vence el 14 ago
  2026» para los líderes del proceso propietario, o para los Admin SGC si el proceso no tiene
  líder (F13A-DC2) [Usuario, 1.2]. La tarea lleva a la ficha, donde están «Ratificar sin cambios» y
  «Solicitar cambio». Desaparece al ratificar, al publicar una versión nueva o al abrir un trámite
  (pasa a ser tarea del trámite).
- Al **vencer** avisa al líder y a los Admin SGC, y a los días configurados (`escalamiento_dias`)
  escala al jefe del líder, con la mecánica de la 13A (§13.3). Los avisos de vencimiento se
  **agrupan por destinatario**: «7 documentos con revisión vencida en Gestión del Talento Humano»,
  un aviso por pasada y por persona, con enlace al Semáforo filtrado [Decisión de Claude, el
  precedente de F13B-DC21].
- **Mientras una revisión anual está abierta no se emiten avisos individuales de vencimiento**
  ni tareas «Revisar la vigencia» para los documentos que están en ella: la tarea de la campaña
  los cubre [Decisión de Claude: es la defensa principal contra la avalancha del primer día]. Los
  botones de la ficha y del Semáforo siguen activos, con la leyenda **«En revisión anual 2026»**
  al lado, y lo que se haga desde ahí cuenta como decisión de la campaña (§9.3): las dos reglas no
  compiten, una quita ruido y la otra evita hacer dos veces lo mismo.

### 7.6 Marca de cambio normativo

Un documento con un **impacto normativo pendiente** (§10.5) muestra «Revisión por cambio
normativo · Resolución 2003 de 2014 derogada» en el bloque «Vigencia» y entra en atención aunque
su fecha esté lejos. La marca se quita cuando el líder abre la solicitud con motivo «cambio
normativo» o registra «no afecta» con nota.

## 8. Documentos externos

### 8.1 Qué es un externo en el sistema

Un externo es una fila de **`documentos`** con `origen = 'externo'` [Usuario, 2.1], del tipo de
documento «Documento externo» (sigla `DE`, operativo, no diligenciable, que la migración y la
semilla mínima añaden), con código por la convención (`CEX-DE-01`), procesos donde aplica (uno
principal, los demás «también aplica») y nivel de acceso como los internos. Su **control propio**
vive en **`externos`** (§8.2) y cada **edición adoptada es una versión** de `documento_versiones`:
la vigente es la edición que rige; la anterior queda obsoleta con su banda. Así el índice de una
sola vigente, el Maestro, la búsqueda, las copias controladas, los acuses y las jornadas funcionan
sin tocar nada [Decisión de Claude, §5].

`documentos.origen` es la marca que manda: solo el camino de externos la pone, y el tipo `DE` es
un dato editable más; un documento con origen externo y otro tipo, o al revés, lo rechaza la
acción [Decisión de Claude]. Un externo no tiene trámite: la bandeja de trámites no lo lista y
«Solicitar cambio» no aparece en su ficha; en su lugar están «Adoptar edición nueva» y «Retirar».

### 8.2 Datos de control

| Dato | Dónde | Qué es |
|---|---|---|
| Entidad emisora | `externos` | Obligatoria («Ministerio de Salud y Protección Social», «B. Braun») |
| Título original | `externos` | Opcional, si difiere del título con que se registra |
| Fuente oficial | `externos` | Texto o dirección donde se verifica; el sistema **no la consulta** |
| Responsable técnico | `externos` | Un usuario activo; por defecto el líder del proceso propietario (o quien registra si no hay líder). Recibe la tarea de verificación |
| Periodicidad de verificación | `externos` | Meses, 12 por defecto (`externos_verificacion_meses`), de 1 a 60 |
| Norma enlazada | `norma_documentos` | Opcional; la misma tabla que enlaza normas y documentos internos (§10.3) |
| Edición adoptada | `documento_versiones.edicion_externa` | Texto libre («2017», «v2.0», «rev. 4.2»), obligatorio en cada versión de un externo |
| Fecha de emisión | `documento_versiones.fecha_edicion_externa` | La del emisor, opcional |
| Fecha de adopción | `documento_versiones.fecha_aprobacion` | La de la firma «Adoptó» |
| Qué cambió | `documento_versiones.resumen_cambios` | Obligatorio al adoptar una edición nueva; es lo que lee la audiencia en su acuse |
| Archivo | `archivos` | Principal (PDF o el formato que el emisor entregue) y anexos, opcionales pero recomendados; sin principal en PDF no hay copias controladas (regla de la 13B) |

### 8.3 Alta y adopción

**Registrar un documento externo** (`/vigencia/externos/nuevo`, con `externos.gestionar`): un
formulario con título, tipo fijo `DE`, proceso propietario (del alcance), otros procesos, nivel de
acceso, los datos de control de §8.2 y la primera edición. Crea el documento, la fila de
`externos` y la **versión 1 en borrador**, y lleva a la **página del externo**
(`/vigencia/externos/[id]`, §8.8), donde quien gestiona sube el principal y los anexos por `POST
/api/externos/[versionId]/archivos` (fuera del `matcher`, `recibirArchivo`, lista blanca, 25 MB,
`Origin`) y después pulsa **«Adoptar esta edición»**. El alta y la adopción **no dependen del
interruptor «Publicación directa»** ni de `exigirCargaAbierta`: usan `crearDocumentoEn` y
`registrarArchivo` sin esa compuerta, porque cerrar la carga inicial no puede impedir registrar
externos nuevos durante toda la vida de la instalación [Decisión de Claude, tras la revisión del
constructor]; `publicarVersion` (la carga directa) sigue rechazando los documentos de origen
externo.

**Adoptar** [Usuario, 2.3] es una firma: diálogo con clave (y código), que en una transacción
pone `aprobo` (nombre de quien adopta), `fecha_aprobacion` (hoy), `elaboro` y `reviso` nulos,
`origen_aprobacion = 'externo'`, registra la **firma «Adoptó»** (`firmas`, sin trámite, con la
huella del principal si lo hay o la huella de los datos de control si no) y llama
**`aplicarPublicacion(tx, versionId, 'externo', …)`**: la edición anterior queda obsoleta y
`alDejarDeSerVigente` recoge sus copias y supera sus acuses. **Los acuses de la audiencia** con el
«qué cambió» (`crearAcusesAlPublicar`) nacen al adoptar una **edición nueva** de un externo que
ya estaba vigente [Usuario, 2.1]; la **primera adopción** (el alta) **no los crea** salvo que quien
adopta marque la casilla «Pedir acuse de lectura a la audiencia», apagada por defecto: al pasar al
sistema la matriz SGC-MZ-03 actual, decenas de externos ya en uso no deben disparar «confirme su
lectura» a toda la planta, y el Admin SGC siempre puede pedir el acuse después (spec 13B §9.5)
[Decisión de Claude, tras la revisión del constructor; el precedente es la carga inicial de la
13B]. El diálogo de adopción lleva también la casilla **«Requiere socialización»** (apagada por
defecto), que crea la `socializaciones_requeridas` de la 13B con su tarea de 30 días a los líderes
[Decisión de Claude]. Bitácora `externo_adoptado`. Si la adopción sale de una verificación «hay
edición nueva» (§8.4), la verificación queda enlazada.

Es el **cuarto camino que publica**, junto al trámite, la carga de lo ya aprobado y la propia
adopción de ediciones siguientes: la regla de negocio 10 de `AGENTS.md` («el camino directo del
panel nunca publica sobre una versión vigente») sigue valiendo para la carga directa; la adopción
es un camino propio, con firma, que sí reemplaza la edición vigente, y se escribe así en
`AGENTS.md` (§15.4). `alDejarDeSerVigente` conserva sus tres llamadores: la adopción pasa por
`aplicarPublicacion` y el retiro por `anularVigenteEn`.

**Adoptar edición nueva** desde la ficha de un externo vigente crea la versión siguiente en
borrador con los campos de edición y el «qué cambió», admite el archivo nuevo y termina con la
misma firma. Mientras hay un borrador de edición pendiente no se abre otro; el borrador se puede
descartar (`descartado`, F13A-DC16).

**Cambiar los datos de control** (emisor, fuente, responsable técnico, periodicidad, norma
enlazada) es edición de catálogo con `externos.gestionar`, auditada con antes y después; cambiar
el responsable traslada la tarea pendiente (es calculada).

### 8.4 Verificación de vigencia

Cada externo tiene una **próxima verificación** (última verificación, o adopción, más la
periodicidad) y entra al semáforo con ella (§7.2). Al entrar en atención nace la tarea
«Verificar la vigencia de ATE-DE-01 · Manual de usuario, bomba de infusión» para el
**responsable técnico** [Usuario, 2.4]; vencida avisa y escala como las demás (§13.3).

La verificación es un formulario **sin clave** (`externos.verificar` más la condición de ser el
responsable técnico, o `externos.gestionar`): **fuente consultada** (obligatoria), **resultado**
y **nota**. Tres resultados:

- **Sigue vigente:** la fila queda registrada y la próxima verificación se recalcula desde hoy.
- **Hay una edición nueva:** la fila queda registrada con la referencia de la edición nueva en la
  nota y lleva a «Adoptar edición nueva» (§8.3), que puede hacer el mismo responsable si tiene
  `externos.gestionar` o, si no, el líder o el Admin SGC, que reciben la tarea «Adoptar la edición
  nueva de ATE-DE-01». Hasta que se adopte, el externo sigue vigente con la marca «edición nueva
  pendiente de adoptar» en atención.
- **Fue retirado o derogado:** la fila queda registrada y **retira** el externo (§8.5).

Cada verificación es una fila de **`externo_verificaciones`**, de **solo inserción** (quién,
cuándo, versión verificada, fuente, resultado, nota): es la evidencia del PC-11 («fuentes oficiales
verificadas»). Bitácora `externo_verificado`. La ficha muestra la última y el historial.

### 8.5 Retiro

Retirar un externo (desde la verificación con resultado «retirado o derogado», o desde el botón
«Retirar» de la ficha con `externos.gestionar` y motivo) anula la versión vigente por
`anularVigenteEn` con un **motivo nuevo `retirado`** para las copias por recoger (se amplía el
`CHECK` `copias_motivo_por_recoger_valido` y `MotivoPorRecoger`; el aviso dice «el documento
externo fue retirado», no «eliminado»): queda `anulado` con banda, fuera del portal y de la
búsqueda, las copias pasan a «por recoger», los acuses pendientes se superan y la audiencia recibe
«dejó de aplicar» sin tarea de acuse (como la eliminación de la 13A y la 13B). Sin clave: la
evidencia es la verificación o la fila de bitácora `externo_retirado` con el motivo [Decisión de
Claude: la eliminación de un interno exige aprobación porque es obra del hospital; retirar un
externo es constatar un hecho del emisor]. Un externo retirado se puede volver a registrar como
documento nuevo si vuelve a aplicar.

### 8.6 La pantalla «Externos» (matriz SGC-MZ-03) y su Excel

Pestaña `/vigencia/externos` con `vigencia.ver` (y para el responsable técnico, sus externos):
tabla con código, título y título original, emisor y edición, fecha de adopción, última
verificación (fecha, resultado, quién), próxima verificación, responsable técnico, estado del
semáforo y procesos; filtros por proceso, estado del semáforo, responsable y texto; botones
«Registrar documento externo» (quien gestiona) y «Descargar Excel». El Excel lleva el encabezado
institucional de siempre, una fila por externo con esas columnas más la fuente oficial, la norma
enlazada y las copias controladas vivas, celdas neutralizadas y fila `exporto_externos` en la
bitácora. El formato formal con pie de control llega en la 17.

### 8.7 El Listado Maestro

Gana la columna **«Origen»** (Interno / Externo) [Usuario, 2.6]; en los externos, «Aprobación» dice
**«Adoptado»** (`origen_aprobacion = 'externo'`), «Elaboró» y «Revisó» van vacíos y «Aprobó» es
quien adoptó; «Versión» muestra el número y, en una columna nueva «Edición», el texto de la
edición. Las columnas «Próxima revisión», «Última revisión» y «Vigencia» (§7.2) valen para todos.
El Excel sigue pasando por `neutralizarFormula`.

### 8.8 La página del externo

`/vigencia/externos/[id]` es la página de **control** de un externo, distinta de su ficha de
lectura (`/documentos/[codigo]`, que sigue siendo la del portal y muestra el bloque de §14.4):
datos de control con su edición, la **edición en borrador** si la hay (zona de carga, archivos,
«qué cambió», «Adoptar esta edición», «Descartar»), el historial de ediciones, las verificaciones
y las acciones de §8.3 a §8.5. La ve quien tiene `externos.gestionar` sobre el documento, su
responsable técnico y quien tiene `vigencia.ver` sobre el proceso (`puedeVerExterno`); una edición
en borrador no se sirve por la ficha de lectura (`puedeVerVersion` no sirve borradores) y el panel
de Gestión de documentos no es el camino, porque el líder no entra al panel [Decisión de Claude,
tras la revisión del constructor].

## 9. Revisión anual

### 9.1 La campaña

El Admin SGC (`revision_anual.gestionar`) abre la **revisión anual** desde la pestaña
`/vigencia/revision-anual`: año (el actual por defecto; una por año), plazo en días (60 por
defecto, `revision_anual_plazo_dias`) y la ventana de «revisado recientemente» en meses (6 por
defecto, `revision_anual_ventana_meses`). **Hay a lo sumo una abierta** (índice único parcial)
[Usuario, 4.1]. Al abrir, en una transacción:

1. Se crea la revisión con su `vence_en`.
2. Se toma la foto de **todos los documentos vigentes**, internos y externos, visibles o no, con
   su proceso propietario: una fila de `revision_anual_procesos` por proceso activo con al menos
   un vigente, y las decisiones automáticas: **«revisado recientemente»** para los que tienen
   fecha base dentro de la ventana [Usuario, 4.2] y **«en trámite»** para los que tienen un
   trámite abierto en ese momento (la decisión enlaza el trámite y se resuelve sola con su cierre)
   [Decisión de Claude]. Los documentos que se publiquen o registren **después** de abrir entran a
   la lista como «revisado recientemente» en el momento de publicarse; los externos adoptados
   después, igual.
3. Nace la tarea «Revisar los documentos de <proceso> (N pendientes)» para los líderes de cada
   proceso (o los Admin SGC si no tiene líder), que vence con la campaña, y el aviso
   `revision.abierta` a líderes, Gerencia y Control Interno.
4. Bitácora `revision_anual_abierta`.

**Prorrogar** (motivo obligatorio) mueve `vence_en`, avisa a los líderes con pendientes y queda en
bitácora. Mientras la revisión está abierta, los documentos de la lista no generan avisos
individuales de vencimiento (§7.5).

### 9.2 La lista y los insumos

La pestaña muestra al Admin SGC el avance por proceso (maqueta 4) y a cada líder la tabla de sus
procesos (maqueta 5). Junto a cada documento, los **insumos** [Usuario, 4.4], calculados al mostrar:
semáforo y última revisión; trámites del año; porcentaje de acuses de la versión vigente (la
consulta de la 13B); hallazgos abiertos o cerrados en el año que lo mencionan (copia o documento);
normas enlazadas que cambiaron de estado en el año; y consultas y descargas del año
(`eventos_consulta`). Ningún insumo exige calcular nada nuevo: todo sale de tablas que ya existen.

### 9.3 Las decisiones

Con `revision_anual.decidir` sobre el proceso [Usuario, 4]:

| Decisión | Qué hace |
|---|---|
| **Ratificar** | Abre el diálogo de ratificación de §7.3; la ratificación queda enlazada a la revisión y la fila de decisión apunta a ella. En un externo, ratificar es registrar la verificación «sigue vigente» (§8.4), sin clave, y la decisión apunta a la verificación [Usuario, 4.3] |
| **Actualizar** | Abre «Nueva solicitud» de modificación con el documento, el motivo «revisión anual» y la justificación prellenados y el enlace a la revisión; al enviarla, la solicitud nace con `tramites.revision_anual_id` y la decisión apunta al trámite. Si el documento **ya tiene un trámite abierto**, la decisión lo enlaza en vez de abrir otro (`tramites_uno_abierto_idx`) [Decisión de Claude]. En un **externo**, «Actualizar» es la verificación con resultado «hay edición nueva», que lleva a adoptar (§8.4); la decisión apunta a la verificación y, cuando se adopta, a la versión nueva |
| **Eliminar** | Lo mismo con una solicitud de eliminación. En un **externo**, es la verificación «fue retirado o derogado», que lo retira (§8.5) |
| **Revisado recientemente** / **En trámite** | Las pone el sistema al abrir o al publicar (§9.1) |
| **Sin revisar** | La pone el sistema al cerrar sobre lo que quedó sin decisión; nunca la elige una persona |

**Lo que se hace fuera de la página de la campaña también cuenta** [Decisión de Claude, tras la
revisión del constructor]: mientras hay una revisión abierta, una ratificación desde la ficha o el
Semáforo, una verificación de un externo o una solicitud de modificación o eliminación sobre un
documento de la lista registra la decisión que corresponde, a nombre de quien la hizo, aunque esa
persona no tenga `revision_anual.decidir` (Gerencia ratificando un estratégico, por ejemplo); así
el informe no cierra con «sin revisar» documentos que sí se revisaron y nadie hace dos veces lo
mismo.

Una decisión **queda fija** cuando produjo su ratificación, su verificación o su trámite fue
aceptado; antes de eso (un trámite retirado, rechazado o cancelado) el líder puede decidir de nuevo
y la fila se actualiza, con antes y después en la bitácora. Cerrada la revisión, un trigger impide
modificar sus filas [Decisión de Claude]. Decidir es también posible desde el celular: la tabla pasa
a tarjetas a 390 px.

### 9.4 El normograma del proceso

En la misma página, cada líder **confirma el normograma de su proceso** [Usuario, 5.7]: la lista
de normas asociadas con su estado, y los botones **«Sin novedad»** o **«Marcar cambios»** (nota
obligatoria: qué norma falta, cuál cambió). La confirmación queda en `revision_anual_procesos` con
quién y cuándo; «Marcar cambios» avisa a los Admin SGC, que actúan en el normograma (§10). Es un
paso de la tarea del líder: la campaña no se da por completa en un proceso hasta que todos sus
documentos tengan decisión y el normograma esté confirmado.

### 9.5 El cierre y el informe

El Admin SGC **cierra** la revisión con clave (diálogo de firma; se verifica fuera de la
transacción como toda firma). En una transacción: lo sin decisión pasa a «sin revisar»; se
**congelan** los datos del informe en `revisiones_anuales.informe` (jsonb, con el formato que se
usará) y se registra quién cerró, cuándo y con qué método. Bitácora `revision_anual_cerrada`; aviso
`revision.cerrada` a Gerencia, Control Interno y líderes. Las tareas de la campaña desaparecen.
Cerrada la revisión, `revisiones_anuales`, `revision_anual_procesos` y
`revision_anual_decisiones` quedan protegidas por trigger, como las verificaciones cerradas de la
13B.

El **PDF** se genera **al primer clic**, exactamente como el acta (`asegurarActa`, F13A-R17):
`generarInformeAnual(datos, membrete)` (`src/lib/informe-anual.ts`, un generador propio sobre el
mismo mecanismo de `generarActa`) produce los bytes desde el jsonb congelado, se escriben por
archivo temporal y `rename` como archivo con contexto `revision_anual` y su huella en `archivos`,
y una fila sin archivo se regenera solo si la huella coincide; si no, `informe_no_regenerable` en
la bitácora. La revisión no guarda columnas del archivo: el enlace es `archivos` [Decisión de
Claude, tras la revisión del constructor: generar el PDF dentro de la transacción de cierre es lo
que el acta evitó a propósito].

**El informe** (maqueta 6) lleva: entidad, año, fechas de apertura, prórrogas y cierre, quién
cerró; alcance (documentos, internos y externos, procesos); las cifras por decisión (ratificados,
revisados recientemente, por actualizar, por eliminar, en trámite, sin revisar); la tabla de
decisiones con documento, decisión, responsable, número de solicitud, plazo y **estado al cierre**
(publicado, en curso con su etapa, cancelado), que es la «evidencia de ejecución» del PC-13; los
cambios normativos del año con su impacto y la confirmación del normograma por proceso; acuses de
las versiones publicadas en el año, conformidad en puntos de uso y externos al día; y el pie con
quién firmó, fecha y hora y la huella. El texto se translitera como el acta (F13A-R33).

**Membrete.** El informe se imprime sobre el formato elegido en Configuración documental →
**Formato del informe de revisión anual** (`formato_informe_documento_id`, con sus espacios de
encabezado y pie); si no hay uno elegido, usa el **formato del acta** y sus espacios; sin formato,
el diseño básico [Usuario, supuesto aceptado en el playback; Decisión de Claude: el código que
sale en el encabezado es el del formato, así que si el hospital quiere «SGC-RG-06» allí registra
ese formato y lo elige]. El formato elegido se congela con el informe (`informe.formato`, como
`detalle.acta.formato`), y «Ver informe de ejemplo» funciona como «Ver acta de ejemplo».

**El informe parcial** (botón «Ver el informe parcial») se arma en pantalla en cualquier momento
con los mismos datos, sin PDF, sin firma ni huella [Usuario, supuesto aceptado].

### 9.6 Tareas y avisos

«Revisar los documentos de <proceso> (N pendientes)» para cada líder (o los Admin SGC), con el
conteo real de documentos sin decisión más uno si falta confirmar el normograma; vence con la
campaña; aviso al abrir y escalamiento al vencer con la mecánica de siempre, con marcas en
`revision_anual_procesos` [Usuario, 4.6]. «Adoptar la edición nueva de X» cuando una
verificación lo pide y quien verificó no gestiona (§8.4).

### 9.7 Quién ve

§6.4: el Admin SGC gestiona; cada líder decide sobre sus procesos; Gerencia y Control Interno ven
toda la revisión en solo lectura y el informe en PDF; los líderes no descargan el PDF
institucional. Las revisiones **cerradas** quedan listadas en la pestaña con su informe; la Fase
17 las toma como entrada «cambios documentales» de la revisión por la dirección [Usuario, 4.7].

## 10. Normograma

### 10.1 La norma

| Campo | Qué es |
|---|---|
| Tipo de norma | Del maestro editable `tipos_norma`, con semilla: Ley, Decreto, Resolución, Circular, Acuerdo, Norma técnica, Sentencia, Directiva, Otro [Usuario, 5.1] |
| Número y año | «3100» y «2019»; con el tipo forman el nombre «Resolución 3100 de 2019». Únicos por tipo, número y año |
| Fecha de expedición | Opcional |
| Entidad emisora | Texto obligatorio, con sugerencias de lo ya escrito en otras normas (sin catálogo aparte) [Usuario, 5.1] |
| Título o epígrafe | Obligatorio |
| Tema o resumen | Opcional; entra a la búsqueda |
| Estado | `vigente`, `modificada`, `derogada`, `retirada` (§10.7), con la fecha del estado |
| Enlace oficial | Texto o dirección de referencia; el sistema **no lo consulta** ni lo abre como hipervínculo activo hacia fuera (se muestra como texto copiable) [Decisión de Claude: cero salidas a internet desde la app, regla 6 del piso] |
| PDF adjunto | Opcional, en `archivos` con contexto `norma`; se sube por `POST /api/normas/[id]/archivos` (fuera del `matcher`, solo PDF, 25 MB, `Origin`) con `normograma.administrar`; se sirve a toda persona con sesión por `/normograma/[id]/archivos/[archivoId]/[[...nombre]]`, sin marca de agua (no es un documento del hospital) |
| Notas | Opcional |

### 10.2 Relaciones y estado

Tres relaciones entre normas [Usuario, 5.2]: **«modifica a»**, **«deroga a»** y **«reglamenta
a»**, con un detalle opcional («deroga los artículos 5 a 9»). Registrar «deroga a» pasa la norma
afectada a **derogada** y «modifica a» a **modificada** (si estaba vigente), con fecha igual a la
de expedición de la norma nueva, editable; «reglamenta a» no cambia estados. El estado también se
cambia a mano («Cambiar estado», con fecha y nota). Cada cambio de estado es una fila de
**`norma_cambios`**, de solo inserción (norma, estado anterior y nuevo, fecha, relación que lo
causó, quién, nota), y dispara el impacto de §10.5. Una relación registrada por error se elimina
con motivo (auditado); la norma afectada recupera su estado solo si el Admin SGC lo cambia a mano,
y los impactos que ya nacieron se resuelven como «no afecta» [Decisión de Claude: sin máquina de
deshacer].

### 10.3 Asociaciones

- **Norma–proceso** (`norma_procesos`): el proceso al que aplica y el **requisito** que le impone
  (texto: artículos o apartes aplicables y la obligación), con quién lo escribió y cuándo. Lo
  edita quien tiene `normograma.procesos` sobre el proceso: el Admin SGC para todos, el líder para
  los suyos [Usuario, A1 y 5.3].
- **Norma–documento** (`norma_documentos`): los documentos internos que la implementan y los
  externos que la referencian (§8.2): una sola tabla porque los externos son documentos. Lo edita
  quien tiene `normograma.procesos` sobre el proceso propietario del documento, y también el Admin
  SGC desde la ficha de la norma.

Las asociaciones se hacen desde la ficha de la norma («Asociar proceso», «Enlazar documento») y
desde la página del proceso («Normas aplicables → Asociar norma»), con búsqueda sobre el catálogo.

### 10.4 Quién mantiene

El Admin SGC administra el catálogo (`normograma.administrar`: normas, estado, relaciones, PDF,
tipos de norma); los líderes asocian y escriben requisitos de sus procesos y resuelven sus
impactos (`normograma.procesos`) [Usuario, A1]. Gestión Jurídica es un proceso más. Todo cambio
deja antes y después en la bitácora (`norma_creada`, `norma_editada`, `norma_estado`,
`norma_relacion`, `norma_asociada`, `norma_desasociada`, `norma_retirada`, `impacto_resuelto`…),
con frase legible en `bitacora-detalle.ts`.

### 10.5 Cambio normativo e impacto documental

Cuando una norma pasa a **modificada, derogada o retirada** [Usuario, B1], en la misma
transacción:

1. Por cada **documento enlazado** (interno o externo, con versión vigente) nace un **impacto**
   (`impactos_normativos`: cambio, documento, proceso propietario, estado `pendiente`, `vence_en` =
   hoy + `impacto_plazo_dias`, 15 por defecto). Por cada **proceso asociado sin documentos
   enlazados** nace un impacto de proceso (sin documento), para que el líder confirme que nada
   suyo cambia [Decisión de Claude].
2. Nace la tarea «Revisar el impacto de Resolución 2003 de 2014 (derogada) en Consulta Externa»
   para los líderes de cada proceso con impactos pendientes (o los Admin SGC), que agrupa los
   impactos de ese cambio y ese proceso; y el aviso `normograma.cambio` a los mismos.
3. Cada documento con impacto pendiente queda con la **marca «Revisión por cambio normativo»**
   en su semáforo (§7.6).

La página de la tarea (`/normograma/impactos/[cambioId]?proceso=…`) lista los documentos con su
versión vigente y, por cada uno, **«Abrir solicitud de cambio»** (nueva solicitud de modificación
con motivo «cambio normativo», justificación prellenada con la norma, y `tramites.impacto_id`) o
**«No afecta…»** (nota obligatoria de al menos 5 caracteres) [Decisión de Claude]; el impacto de
proceso solo admite «No afecta…» o «Abrir solicitud de creación». Si el documento ya tiene un
trámite abierto, se enlaza. Si el documento enlazado es un **externo**, en lugar de «Abrir
solicitud de cambio» está **«Verificar el externo»**: la verificación de §8.4 con sus tres
resultados resuelve el impacto (resolución `verificacion`, con la verificación enlazada), y quien
la registra es su responsable técnico o quien gestiona [Decisión de Claude, tras la revisión del
constructor]. El impacto pasa a `resuelto` con la resolución, quién y cuándo (bitácora
`impacto_resuelto`); vencido, avisa y escala como las demás tareas (§13.3). El Admin SGC puede
resolver cualquiera.

### 10.6 Pantallas

- **«Normograma»** (`/normograma`), entrada propia del grupo Documentos para toda persona con
  sesión [Usuario, 5.4]: lista con filtros (tipo, año, emisor, estado, proceso, texto), botones
  «Nueva norma» (quien administra) y «Excel institucional»; con `?proceso=<slug>`, el **normograma
  del proceso** con la columna del requisito y su Excel.
- **Ficha de la norma** (`/normograma/[id]`): datos, estado con su historial de cambios,
  relaciones en los dos sentidos («deroga a», «derogada por»), procesos con su requisito,
  documentos internos y externos enlazados (los restringidos solo a quien los ve), PDF, y las
  acciones de quien puede (editar, cambiar estado, relacionar, asociar, enlazar, retirar).
- **Página del proceso** (`/procesos/[slug]`): sección «Normas aplicables (N)» con las primeras
  y el enlace al normograma del proceso; «Asociar norma» para quien puede [Usuario, 5.4].
- **Búsqueda** [Usuario, 5.6]: `/buscar` y `Ctrl K` ganan el grupo «Normas» (número, título, tema y
  emisor, con `tsv` propio y `unaccent`), hasta 4 en la paleta.
- **Tipos de norma**: sección de la página del normograma para quien administra (crear, renombrar,
  ordenar, desactivar), como los ítems de la lista de verificación.
- **Excel** institucional y por proceso: tipo, número, año, fecha, emisor, título, tema, estado y
  su fecha, relaciones, procesos (y requisito en el de proceso), documentos y externos enlazados,
  enlace; encabezado institucional, celdas neutralizadas, bitácora `exporto_normograma`.

### 10.7 Retiro y auditoría

Nada se borra [Usuario, 5.8]: una norma registrada por error o que dejó de aplicar al hospital se
**retira** con motivo (estado `retirada`, fuera de las listas y de la búsqueda, visible en su
ficha y en el historial); retirar también dispara impactos si tiene documentos enlazados. Una
norma sin asociaciones ni historia sí se puede borrar («borrar solo si vacío», D47). Las
asociaciones se quitan con registro en bitácora.

### 10.8 Preparado para la Fase 14

Las normas tienen id estable y estado: la Fase 14 toma «norma que lo exige» de este catálogo para
los indicadores regulatorios (spec maestro §6.2, recomendación 6) con una FK a `normas`, y el
cambio de estado de una norma podrá avisar a los indicadores que la citan.

## 11. Indicadores del proceso documental

### 11.1 Los siete indicadores

| # | Indicador | Definición | Tipo |
|---|---|---|---|
| 1 | Documentos dentro de su plazo de revisión | Vigentes (internos y externos) con próxima revisión posterior a la fecha de corte, sobre vigentes | Estado |
| 2 | Tiempo de aprobación | Promedio y mediana de días entre la aceptación y la publicación de los trámites publicados en el periodo; también desde la solicitud | Flujo |
| 3 | Documentos con revisión vencida | Conteo, con la lista y el desglose por proceso | Estado |
| 4 | Acuses de lectura confirmados | Confirmados sobre confirmados más pendientes, de las versiones publicadas en el periodo (la consulta de la 13B) | Flujo |
| 5 | Conformidad en puntos de uso | El porcentaje actual de la 13B (última verificación de cada punto activo) y, por periodo, el de las verificaciones cerradas en él | Estado y flujo |
| 6 | Externos verificados al día | Externos vigentes con próxima verificación posterior a la fecha de corte, sobre externos vigentes | Estado |
| 7 | Etapas del trámite cerradas en plazo | Etapas cerradas en el periodo cuya fecha de cierre no superó su fecha límite, sobre etapas cerradas | Flujo |

Para el indicador 7, `transicionar` empieza a guardar en el `detalle` del evento de cada
transición la **fecha límite de la etapa que cierra** (`venceEn`), que hoy no queda en ningún
sitio (el trámite solo guarda la actual); el indicador cuenta desde esta entrega y muestra «sin
dato» para periodos anteriores [Decisión de Claude, tras verificarlo en el código].

### 11.2 Metas y semáforo

Metas configurables en Configuración documental → **Indicadores documentales**, con valores por
defecto [Usuario, B1]: dentro del plazo ≥ 95 %; aprobación ≤ 30 días; vencidos = 0; acuses ≥
90 %; conformidad ≥ 95 % (la clave `umbral_conformidad_pct` que ya existe); externos al día ≥
95 %; etapas en plazo ≥ 90 %. Cada tarjeta dice **cumple** o **no cumple** con la insignia de
estado (texto siempre, nunca solo color). Sin meta válida, «sin meta» en gris, como en la Fase 14.

### 11.3 Periodo y foto

Los indicadores de **estado** (1, 3, 6 y el actual del 5) se calculan **a la fecha de hoy**, sin
reconstruir fechas de corte pasadas (las fechas fijadas a mano de otros momentos solo viven en la
bitácora, y recomponer el semáforo de hace tres meses sería frágil); los de **flujo** (2, 4, 7 y el
periódico del 5) por el periodo elegido: mes, trimestre, semestre o año, el año en curso por
defecto [Usuario, 6.3; Decisión de Claude, tras la revisión del constructor: el alcance de la fecha
de corte]. La serie mensual histórica de los de estado llega con la foto mensual del tablero de la
Fase 17.

### 11.4 Pantalla y Excel

`/vigencia/indicadores` (maqueta 9): filtros de periodo y proceso; las siete tarjetas con valor,
meta y cumplimiento; gráfico de barras de vencidos por proceso (`GraficoBarras`, con su tabla
equivalente); tabla «dentro del plazo por proceso»; «Descargar Excel» con las cifras por proceso y
el detalle de los vencidos, encabezado institucional, celdas neutralizadas y bitácora
`exporto_indicadores` [Usuario, 6.4].

### 11.5 Permiso y alcance

`documentos.indicadores` [Usuario, 6.5]; el líder solo ve sus procesos y los totales de ellos; el
filtro de proceso le ofrece solo los suyos; Consulta no ve la entrada.

### 11.6 Funciones puras

El cálculo vive en `src/lib/indicadores-documentales/` como funciones puras sobre filas ya leídas
(entrada: listas de documentos con fechas, trámites con sus eventos, acuses, verificaciones; salida:
valor, numerador, denominador, cumplimiento), con sus tests sin BD; las consultas solo traen las
filas. Así la Fase 14 puede exponerlos como indicadores con fuente automática si el usuario lo
decide entonces [Usuario, 6.6].

## 12. Lo heredado de la 13B

### 12.1 Excel de socializaciones

Ruta `/distribucion/socializaciones/excel` con `distribucion.ver`, construida con `hoja-excel.ts`
(cuarto constructor): fecha, modalidad, facilitador, documentos y versiones, asistentes con cuenta
(conteo y nombres solo para quien ve la lista, §6.4 de la 13B), asistentes sin cuenta (conteo),
evidencia adjunta (sí/no), observaciones, estado (vigente/anulada con motivo); encabezado
institucional, celdas neutralizadas, bitácora `exporto_socializaciones` (ya prevista en la deuda).
De paso, `acuses-excel.ts` migra a `hoja-excel.ts` [Usuario, decisión 8, punto 1].

### 12.2 Fecha de corrección ajustable

Al cerrar una verificación, cada ítem no conforme muestra la fecha de corrección propuesta (hoy +
`plazo_correccion_dias`) y el verificador puede cambiarla por hallazgo, entre mañana y hoy + 365
días; queda en `hallazgos.vence_en` y en el detalle de la bitácora del cierre [Usuario, punto 2].

### 12.3 Catálogos en solo lectura

Las páginas `/admin/puntos-uso`, `/admin/puntos-uso/[id]`, `/admin/listas-distribucion` y
`/admin/listas-distribucion/[id]` se abren con `distribucion.ver` y se pintan **sin botones ni
formularios** para quien no tiene `distribucion.gestionar`; el líder ve los puntos de sus procesos
(`filtroPuntos`) y las listas completas (son de la entidad); las dos entradas de la barra se
muestran con `distribucion.ver` [Usuario, punto 3]. Las acciones siguen exigiendo
`distribucion.gestionar`. Como el líder no entra al panel (`exigirEntradaPanel` exige
`panel.entrar` o la marca de historial), las dos carpetas **salen del grupo `admin/(panel)`** a un
grupo hermano `admin/(catalogos)` con un layout propio sin guard de panel: las URL no cambian (los
grupos no las afectan), cada página llama su propio guard (`exigirSesion` más la regla de
alcance, con `notFound()`), y `tests/paginas-sesion.test.ts` cubre el grupo nuevo [Decisión de
Claude, tras la revisión del constructor].

### 12.4 Miembro «todos los usuarios activos»

Un tipo de miembro más en `lista_miembros` (`todos`, sin referencia): la lista resuelve a toda la
planta activa en el momento del evento, respetando el nivel de acceso del documento; la lista
«Todo el hospital» de la demo pasa a ese tipo [Usuario, punto 4]. El retiro de acuses por
diferencia (F13B-DC26) lo trata como «todos los activos»: desactivar una cuenta la retira.

### 12.5 Cierre de hallazgos en dos pasos

| Paso | Quién | Qué pasa |
|---|---|---|
| Corregir | El responsable del punto (`distribucion.responder` + condición) | Marca **«Corregido»** con nota (y foto opcional al hallazgo, contexto `hallazgo` en `archivos`); el hallazgo pasa a **`por_validar`**; tarea «Validar la corrección del hallazgo en <punto>» para los Admin SGC |
| Validar | Admin SGC (`verificaciones.realizar`) | **«Validar»** cierra (`cerrado`, `validacion = 'admin'`) o **«Reabrir»** con nota devuelve a `abierto` con fecha nueva; bitácora en los dos casos |
| Validación automática | El sistema, al cerrar la siguiente verificación del punto | Si esa verificación cerrada no trae un ítem no conforme sobre la misma copia o el mismo documento del hallazgo, los hallazgos `por_validar` de ese punto pasan a `cerrado` con `validacion = 'verificacion'` y la verificación enlazada; si lo trae, se reabren con la nota «sigue no conforme en la verificación del …» |

[Usuario, punto 5; Decisión de Claude: la regla exacta de la validación automática.] Los
hallazgos `por_validar` no cuentan como abiertos en la conformidad ni en las tareas del
responsable; «Corregir hallazgo» desaparece de «Mis tareas» del responsable al marcar «Corregido».
El Admin SGC puede seguir cerrando directamente un hallazgo con `distribucion.gestionar` (la
excepción que ya existe), y queda como `validacion = 'admin'`.

### 12.6 Dos tareas pequeñas para el plan

- El aviso «Se emitieron N copias» de **Reemplazar** no llega a verse porque la ficha se vuelve a
  pintar y desmonta el formulario: el resultado pasa a la URL (`?aviso=reemplazadas&n=2`) y la
  ficha lo muestra en un `role="status"`.
- Los conteos de `/distribucion/copias` del líder (`conteosPorPunto`) deben incluir las copias que
  emitió en puntos de otros procesos, como ya hace la tabla (`documentoEnAlcance`).

## 13. Tareas, avisos y vencimientos (extiende los specs 13A §14 y 13B §12)

### 13.1 «Mis tareas»

`misTareas()` suma fuentes, todas **calculadas** del estado, con `id` estable:

| Tarea | Para quién | Vence | Fuente |
|---|---|---|---|
| Revisar la vigencia de X vN | Líderes del proceso propietario, o los Admin SGC | La próxima revisión | `vigencia:<documentoId>`; solo en atención o vencida y **solo si no hay revisión anual abierta que lo incluya** |
| Verificar la vigencia de X (externo) | El responsable técnico | La próxima verificación | `externo:<documentoId>`; en atención o vencida |
| Adoptar la edición nueva de X | Quien gestiona el externo (líderes del proceso o Admin SGC) | 15 días desde la verificación | `adopcion:<verificacionId>` |
| Revisar los documentos de <proceso> (N pendientes) | Líderes del proceso, o los Admin SGC | El cierre de la campaña | `revision:<revisionId>:<procesoId>` |
| Revisar el impacto de <norma> en <proceso> | Líderes del proceso, o los Admin SGC | `vence_en` del impacto | `impacto:<cambioId>:<procesoId>` |
| Validar la corrección del hallazgo en <punto> | Los Admin SGC | `plazo_correccion_dias` desde «Corregido» | `validar:<hallazgoId>` |

«Mis tareas» agrupa también estas cuando son muchas («12 documentos por revisar en Gestión del
Talento Humano» → la pestaña Semáforo filtrada), con el mismo umbral de la 13B. Pasa de seis
fuentes a diez: §22 registra el riesgo de rendimiento.

### 13.2 Avisos

Tipos nuevos, con `crearNotificacion` dentro de la transacción del hecho: `vigencia.vencida`
(agrupado por persona y proceso), `vigencia.escalado`, `externos.vencida`, `externos.edicion_nueva`,
`externos.retirado` (a la audiencia, sin tarea), `revision.abierta`, `revision.prorrogada`,
`revision.cerrada`, `revision.normograma_cambios` (a los Admin SGC), `normograma.cambio` (a los
líderes afectados), `normograma.impacto_vencido`, `hallazgo.por_validar`. El aviso lleva código,
título y enlace; el de escalamiento al jefe va sin título ni enlace (F13A-DC27). Nadie se avisa a sí
mismo. No hay aviso al ratificar ni al verificar «sigue vigente» (§7.3).

### 13.3 Vencimientos

`revisarVencimientos` gana cuatro fuentes con la misma mecánica (transacción corta por fila o por
grupo, `SKIP LOCKED`, sin `auditoria`, un aviso por jefe con sus subalternos agrupados):

| Fuente | Marcas | Se reinician |
|---|---|---|
| Documentos con revisión vencida | `documentos.revision_aviso_en`, `revision_escalado_en` | Al ratificar, publicar o fijar la fecha a mano |
| Externos con verificación vencida | `externos.aviso_vencido_en`, `escalado_en` | Al verificar o adoptar |
| Impactos pendientes vencidos | `impactos_normativos.aviso_vencido_en`, `escalado_en` | No aplica (se resuelven) |
| Campaña vencida por proceso | `revision_anual_procesos.aviso_vencido_en`, `escalado_en` | Al prorrogar |

Los avisos de documentos vencidos van **agrupados**: por pasada, un aviso por persona y proceso con
el conteo, no uno por documento [Decisión de Claude]; y **se omiten mientras el documento está en
una revisión anual abierta** (§7.5). El disparo sigue siendo el del cascarón, cada diez minutos
como mucho; la Fase 16 lo cambia por el planificador sin tocar la regla.

## 14. Pantallas y navegación

Todas dentro del cascarón, con los componentes base de la Fase 12 y `EncabezadoPagina`; las
maquetas fijan el contenido y el diseño fino queda al constructor (§21).

### 14.1 Barra lateral

Opción A [Usuario, decisión 7]: una entrada **«Vigencia»** en el grupo Documentos, visible con
`vigencia.ver` o `documentos.indicadores`, y también al **responsable técnico de algún externo
vigente** (`siResponsableTecnico`), que ve solo la pestaña Externos con los suyos; con el conteo
de vencidos de su alcance como insignia. Una entrada **«Normograma»** en el mismo grupo, para todo
usuario con sesión. Total: 20 entradas. La paleta `Ctrl K` las conoce porque salen de
`navegacion.ts`. Las entradas «Puntos de uso» y «Listas de distribución» pasan a mostrarse con
`distribucion.ver` (§12.3).

### 14.2 «Vigencia» (`/vigencia`)

Cuatro pestañas, cada una con su ruta y su guard: `/vigencia/semaforo` (§7.2, con tarjetas de
conteo, filtros por estado, proceso e interno/externo, la tabla con última y próxima revisión,
«Ratificar» y «Solicitar cambio» por fila, «Fijar próxima revisión» sobre el filtro para el Admin
SGC y Excel), `/vigencia/revision-anual` (§9: la abierta, o la última cerrada y el botón de abrir;
`/vigencia/revision-anual/[id]` para las cerradas con su informe en `/vigencia/revision-anual/[id]/informe`),
`/vigencia/externos` (§8.6, con `/vigencia/externos/nuevo`) y `/vigencia/indicadores` (§11.4).
`/vigencia` redirige a la primera pestaña que la persona puede ver. A 390 px las tablas pasan a
tarjetas.

### 14.3 «Normograma» (`/normograma`)

§10.6: lista con filtros, `/normograma/nueva`, `/normograma/[id]`, `/normograma/[id]/editar`,
`/normograma/[id]/archivos/[archivoId]/[[...nombre]]`, `/normograma/excel`,
`/normograma/impactos/[cambioId]`, y la sección de tipos de norma para quien administra.

### 14.4 Cambios en pantallas existentes

- **Ficha del documento (portal y panel):** bloque **«Vigencia»** (maqueta 3) con el semáforo,
  plazo, última y próxima revisión, la fecha fijada a mano si la hay, la marca de cambio normativo,
  el historial de ratificaciones y los botones «Ratificar sin cambios», «Solicitar cambio» y, para
  el Admin SGC, «Ajustar» plazo y fecha. En un externo, el bloque **«Documento externo»** (emisor,
  edición, adoptó, fuente, norma, responsable) y el de vigencia con «Registrar verificación»,
  «Adoptar edición nueva» y «Retirar»; sin «Solicitar cambio». La sección de normas enlazadas.
- **Gestión de documentos:** columna «Vigencia» y filtro; «Registrar documento externo» junto a
  «Registrar documento ya aprobado».
- **Listado Maestro** (página y Excel): columnas «Origen», «Edición», «Última revisión», «Próxima
  revisión» y «Vigencia» (§8.7).
- **Página del proceso:** «Normas aplicables (N)», el resumen de vigencia y el punto de color
  junto a cada documento (maqueta 10).
- **Nueva solicitud:** admite `?motivo=` y `?revision=`/`?impacto=` para llegar prellenada y
  enlazada; la página del trámite muestra «Abierto desde la revisión anual 2026» o «Abierto por el
  cambio de Resolución 2003 de 2014».
- **Tipos de documento:** campo «Plazo de revisión (meses)».
- **Configuración documental:** secciones **Vigencia** (días de atención, plazo y ventana de la
  campaña, periodicidad por defecto de externos, plazo de los impactos, formato del informe con
  sus espacios y «Ver informe de ejemplo») e **Indicadores documentales** (las siete metas).
- **Inicio:** «Mis tareas» con las fuentes nuevas.
- **Buscar y `Ctrl K`:** grupo «Normas».
- **Verificación de un punto:** fecha de corrección por hallazgo al cerrar (§12.2); **hallazgo:**
  «Corregido», «Validar», «Reabrir» (§12.5). **Puntos de uso y listas:** solo lectura (§12.3);
  **lista:** miembro «Todos los usuarios activos» (§12.4). **Socializaciones:** «Descargar Excel».
- **Bitácora:** frases legibles para todas las acciones nuevas.

### 14.5 Páginas y rutas nuevas

| Ruta | Qué | Quién |
|---|---|---|
| `/vigencia`, `/vigencia/semaforo`, `/vigencia/semaforo/excel` | Semáforo y su Excel | `vigencia.ver` |
| `/vigencia/revision-anual`, `/vigencia/revision-anual/[id]`, `/vigencia/revision-anual/[id]/informe` | La campaña, las cerradas y el informe PDF | `vigencia.ver`; el informe, §6.4 |
| `/vigencia/externos`, `/vigencia/externos/nuevo`, `/vigencia/externos/excel` | La matriz, el alta y su Excel | `vigencia.ver` o responsable técnico; alta con `externos.gestionar` |
| `/vigencia/externos/[id]` | La página de control de un externo: edición en borrador, adopción, verificaciones, historial (§8.8) | `puedeVerExterno` |
| `/admin/puntos-uso…`, `/admin/listas-distribucion…` (mismas URL, grupo `admin/(catalogos)`) | Catálogos en solo lectura para quien no gestiona (§12.3) | `distribucion.ver` |
| `/vigencia/indicadores`, `/vigencia/indicadores/excel` | Indicadores y su Excel | `documentos.indicadores` |
| `/normograma`, `/normograma/nueva`, `/normograma/[id]`, `/normograma/[id]/editar`, `/normograma/excel` | El normograma | Toda sesión; escrituras con sus permisos |
| `/normograma/[id]/archivos/[archivoId]/[[...nombre]]` | El PDF de una norma | Toda sesión |
| `/normograma/impactos/[cambioId]` | La tarea de impacto de un proceso | Líder del proceso o Admin SGC |
| `/distribucion/socializaciones/excel` | Excel de jornadas | `distribucion.ver` |
| `POST /api/externos/[versionId]/archivos`, `DELETE …/[archivoId]` | Archivos de una edición en borrador | `externos.gestionar`; fuera del `matcher` |
| `POST /api/normas/[id]/archivos`, `DELETE …/[archivoId]` | PDF de una norma | `normograma.administrar`; fuera del `matcher` |
| `POST /api/hallazgos/[id]/archivos` | Foto de la corrección | `distribucion.responder` + condición; fuera del `matcher` |

Las Server Actions van en `src/app/acciones-vigencia.ts` (ratificar, fijar fecha, externos,
revisión anual, decisiones, indicadores) y `src/app/acciones-normograma.ts`; las dos entran a la
lista de `tests/acciones-permisos.test.ts` y a la regla de `AGENTS.md`.

## 15. Modelo de datos y migración 0008

Nombres provisionales (§21); convenciones heredadas: `timestamptz`, FK `restrict`, `CHECK` de
estados en BD, índices por lo que filtra el alcance.

### 15.1 Cambios a tablas existentes

| Tabla | Cambio |
|---|---|
| `tipos_documento` | `meses_revision` (entero, 12 por defecto, `CHECK` 1 a 120); la migración lo fija en 12 en todos los tipos existentes; tipo nuevo «Documento externo» (`DE`) si no existe |
| `documentos` | `origen` (`interno` por defecto, `CHECK` interno/externo), `meses_revision` (opcional, 1 a 120), `proxima_revision_fijada` (fecha), `fijada_por`, `fijada_en`, `fijada_nota`, `revision_aviso_en`, `revision_escalado_en` |
| `documento_versiones` | `edicion_externa` (texto), `fecha_edicion_externa` (fecha); `origen_aprobacion` admite **`externo`** (se amplía el `CHECK`); `versiones_vigente_con_aprobacion` no cambia: la adopción llena `aprobo` y `fecha_aprobacion` |
| `firmas` | `tramite_id` **deja de ser obligatoria**; `firma` admite **`ratifico`** y **`adopto`**; `CHECK` nuevo: `tramite_id IS NOT NULL OR firma IN ('ratifico', 'adopto')`. Las filas existentes cumplen; `listarFirmas(tramiteId)` y el acta no cambian (filtran por trámite) |
| `tramites` | `revision_anual_id` y `impacto_id` (opcionales, FK) |
| `lista_miembros` | `tipo` admite **`todos`**; `referencia_id` **deja de ser obligatoria** con `CHECK` (`tipo = 'todos'` ⇔ `referencia_id IS NULL`); la unicidad pasa a índice único con `NULLS NOT DISTINCT` |
| `hallazgos` | `estado` admite **`por_validar`**; `corregido_en`, `corregido_por`, `nota_correccion`, `validacion` (`admin`/`verificacion`, nula), `validacion_verificacion_id`, `reaperturas` (entero, 0) |
| `archivos` | `contexto` admite **`norma`**, **`revision_anual`** y **`hallazgo`**; la ruta física sigue `almacen/<contexto>/<id>/<nombre>` |
| `copias_controladas` | `motivo_por_recoger` admite **`retirado`** (se amplía `copias_motivo_por_recoger_valido`) para el retiro de un externo (§8.5) |
| `configuracion` | Claves: `revision_atencion_dias` (90), `revision_anual_plazo_dias` (60), `revision_anual_ventana_meses` (6), `externos_verificacion_meses` (12), `impacto_plazo_dias` (15), `formato_informe_documento_id` (vacío), `formato_informe_margen_superior_cm`, `formato_informe_margen_inferior_cm` (5,5 y 3,5), `meta_dentro_plazo_pct` (95), `meta_aprobacion_dias` (30), `meta_vencidos` (0), `meta_acuses_pct` (90), `meta_externos_pct` (95), `meta_etapas_plazo_pct` (90); `umbral_conformidad_pct` ya existe y hace de meta 5 |

### 15.2 Tablas nuevas

| Tabla | Qué guarda |
|---|---|
| `ratificaciones` | Versión, firma (FK a `firmas`), nota, próxima revisión resultante, revisión anual (opcional), `creado_en`. **Solo inserción** |
| `externos` | Documento (único), entidad emisora, título original, fuente oficial, responsable técnico, `verificacion_meses`, `aviso_vencido_en`, `escalado_en`, `edicion_nueva_pendiente_desde` (opcional). La próxima verificación no se guarda: se calcula de la última verificación o la adopción más los meses (§7.2) |
| `externo_verificaciones` | Documento, versión verificada, quién, `creado_en`, fuente consultada, resultado (`vigente`, `edicion_nueva`, `retirado`), nota, revisión anual (opcional). **Solo inserción** |
| `revisiones_anuales` | Año (único), estado (`abierta`, `cerrada`), plazo, ventana, abierta por y cuándo, `vence_en`, prórrogas (`jsonb`: fecha, motivo, quién), cerrada por, cuándo y método de firma, `informe` (`jsonb` congelado, con el formato usado). El PDF vive en `archivos` con contexto `revision_anual` (§9.5). **Índice único parcial: una abierta** |
| `revision_anual_procesos` | Revisión, proceso, conteos congelados al cierre, normograma confirmado (quién, cuándo, resultado `sin_novedad`/`cambios`, nota), `aviso_vencido_en`, `escalado_en` |
| `revision_anual_decisiones` | Revisión, documento, versión al abrir, decisión (`ratificar`, `actualizar`, `eliminar`, `reciente`, `en_tramite`, `sin_revisar`), quién y cuándo, `ratificacion_id`, `verificacion_id`, `tramite_id`, insumos congelados (`jsonb`). Única por (revisión, documento) |
| `tipos_norma` | Nombre único, orden, activo |
| `normas` | Tipo, número, año, fecha de expedición, entidad emisora, título, tema, estado (`vigente`, `modificada`, `derogada`, `retirada`), `estado_en`, enlace oficial, notas, `tsv`, creado por y cuándo, actualizado. Única por (tipo, número, año) |
| `norma_relaciones` | Norma, norma afectada, tipo (`modifica`, `deroga`, `reglamenta`), detalle, quién, `creado_en`. Única por (norma, afectada, tipo) |
| `norma_cambios` | Norma, estado anterior y nuevo, fecha del estado, relación causante (opcional), quién, nota, `creado_en`. **Solo inserción** |
| `norma_procesos` | Norma, proceso, requisito, quién y cuándo (creado y actualizado). Única por (norma, proceso) |
| `norma_documentos` | Norma, documento, quién, `creado_en`. Única por (norma, documento) |
| `impactos_normativos` | Cambio, norma, documento (opcional), proceso, estado (`pendiente`, `resuelto`), `vence_en`, `aviso_vencido_en`, `escalado_en`, resolución (`solicitud`, `no_afecta`, `verificacion`), `tramite_id`, `verificacion_id`, nota, resuelto por y cuándo |

`ratificaciones`, `externo_verificaciones` y `norma_cambios` se añaden al `REVOKE UPDATE, DELETE`
de `asegurarRolApp` y llevan el trigger `sgc_impedir_modificacion()`; un trigger nuevo protege las
revisiones anuales cerradas con sus procesos y decisiones. Todas las tablas nuevas entran al
`TRUNCATE` de `limpiarTodo`.

### 15.3 Migración

Una migración `0008`, aditiva. Sobre una base de `sgc-suaza`, de la 13A o de la 13B no hay datos que
transformar, salvo tres valores por defecto que la propia migración escribe: `meses_revision = 12`
en los tipos, `origen = 'interno'` en los documentos y el tipo `DE` si falta. Las columnas de
vigencia de los documentos existentes quedan nulas: el semáforo se calcula desde la fecha de
aprobación, así que **una base real amanece con muchos vencidos**; §22 y el manual lo tratan. La
Fase 20 la ensaya con un respaldo real, como las demás.

### 15.4 Cambios a `AGENTS.md`

- Regla de negocio 5: `ratificaciones`, `externo_verificaciones` y `norma_cambios` entran a la lista
  de tablas de solo inserción, y al privilegio del rol `sgc_app` (piso 10).
- Regla de negocio 10: se añade que **la adopción de una edición de un documento externo** es el
  único camino sin trámite que publica sobre una versión vigente, siempre con firma «Adoptó», y que
  pasa por `aplicarPublicacion`; la carga directa sigue sin poder hacerlo.
- Regla «una versión deja de ser vigente solo por…»: sin cambio (la adopción y el retiro usan los
  tres llamadores), con una frase que lo diga.
- Rutas de subida fuera del `matcher`: `api/externos/[versionId]/archivos`, `api/normas/[id]/archivos`,
  `api/hallazgos/[id]/archivos`.
- Server Actions: `src/app/acciones-vigencia.ts` y `src/app/acciones-normograma.ts` en la lista de
  archivos que `tests/acciones-permisos.test.ts` revisa.
- Firmas sin trámite: `firmas.tramite_id` es nula en «Ratificó» y «Adoptó»; toda firma sigue
  pasando por `verificarParaFirmar` fuera de la transacción.

Cambios de tipos que el plan presupuesta (no bloquean, pero existen): `registrarFirma` acepta
`tramiteId: number | null` y usa `ronda = 0` en las firmas sin trámite; la unión `Firma` y
`ETIQUETA_FIRMA` (`src/lib/tramites/tipos.ts`) ganan `ratifico` («Ratificó») y `adopto`
(«Adoptó»), sin que el acta las muestre porque filtra por trámite; `aplicarPublicacion` tipa el
origen como `"plataforma" | "fuera" | "externo"`; `MotivoPorRecoger` y `ETIQUETA_MOTIVO_POR_RECOGER`
ganan `retirado`; `DatosSolicitud` gana `revisionAnualId` e `impactoId` opcionales.

## 16. Seguridad

Riesgos del spec maestro §5.9 que toca esta entrega:

| Riesgo | Cómo |
|---|---|
| 3. Aislamiento por alcance | Las pestañas de Vigencia, las decisiones, los impactos, las acciones de externos y los indicadores aplican §6.4 desde `alcance.ts`; el líder solo alcanza sus procesos; el responsable técnico, sus externos; tests con cada rol, un líder de otro proceso y un responsable de otro externo |
| 4. Permisos solo en la interfaz | Toda acción exige permiso de matriz más alcance o condición de persona en el servidor; los catálogos en solo lectura ocultan y además las acciones rechazan |
| 7 y 15. Validación | Un esquema `zod` `.strict()` por acción (`src/lib/esquemas/vigencia.ts`, `normograma.ts`); fechas acotadas (la próxima revisión fijada, la de corrección); el enlace oficial se guarda y se muestra como texto |
| 14. Identificadores predecibles | El id de una norma, una revisión, un impacto o un externo no da acceso: cada petición se autoriza y quien no puede ver recibe 404 |
| 20. Archivos | Los PDF de normas, los archivos de ediciones y las fotos de corrección entran por `recibirArchivo` con lista blanca, magic bytes, 25 MB, nombre saneado, `Origin` y rutas fuera del `matcher`; se sirven con el control de acceso del dueño y `no-store`. El informe lo genera el servidor; nunca se sube |

Además: las firmas «Ratificó» y «Adoptó» y el cierre de la revisión siguen F13A-R4 (clave fuera de
la transacción, validador de solo lectura antes, fallos que bloquean); la huella del archivo se
recalcula al ratificar y al adoptar; límite de ritmo por usuario en las acciones y los Excel; los
Excel neutralizan fórmulas; `ratificaciones`, `externo_verificaciones` y `norma_cambios` son de
solo inserción por trigger y privilegios, y las revisiones cerradas son inmutables; el informe en
PDF solo lo descargan los tres roles que ven lo restringido (§6.4); un aviso de impacto o de
vencimiento no lleva contenido del documento; la pestaña Normograma, abierta a todo usuario, no
muestra nada de documentos restringidos a quien no los ve; la verificación de un externo no
permite escribir un enlace que la interfaz abra hacia internet.

## 17. Semillas

**Mínima:** el tipo «Documento externo» (`DE`), `meses_revision = 12` en los tipos, los tipos de
norma, las claves de configuración con sus valores por defecto; sin normas, externos ni
revisiones (son de la entidad).

**Demo** (sobre la de la 13B; se resiembra la base de desarrollo):

- `meses_revision` 12 en los tipos; `proxima_revision_fijada` en una parte de los documentos
  cargados «fuera» para que el semáforo muestre una mezcla real: unos **vencidos** (entre ellos
  `GTH-PR-01` y `AIN-FO-01`), unos en **atención** (`SGC-PR-01` con fecha fijada por la
  coordinadora), la mayoría al día; dos **ratificaciones** de meses atrás (`lider.gth`,
  `lider.cex`).
- Cuatro **externos**: `CEX-DE-01` Guía de práctica clínica de hipertensión arterial (MinSalud,
  2017; responsable `lider.cex`; verificada hace 9 meses), `ATE-DE-01` manual de usuario de una
  bomba de infusión (fabricante, rev. 4.2; responsable `regente.farmacia`; **verificación
  vencida**), `SOG-DE-01` Resolución 3100 de 2019 como texto de trabajo (enlazada a su norma;
  responsable `coordinadora.sgc`) y `GTH-DE-01` estándares mínimos del SG-SST (enlazado a la
  Resolución 0312 de 2019; responsable `lider.gth`); con PDF generado por la semilla y una edición
  obsoleta en uno de ellos.
- **Normograma:** unas doce normas colombianas reales con tipo, emisor, título y tema (Ley 100 de
  1993, Ley 1438 de 2011, Decreto 780 de 2016, Resolución 3100 de 2019, Resolución 2003 de 2014
  **derogada** por la 3100, Resolución 256 de 2016, Resolución 1995 de 1999, Ley 1581 de 2012, Ley
  527 de 1999, Decreto 1072 de 2015, Resolución 0312 de 2019, Ley 594 de 2000), asociadas a procesos
  con un requisito escrito y enlazadas a documentos de la demo; la derogación registrada como
  cambio con **un impacto pendiente** en un proceso (CEX) y otro resuelto «no afecta» en SOG. El
  contenido de las normas es ilustrativo: la entidad registra las suyas.
- Una **revisión anual 2026 abierta** hace una semana, con decisiones en dos procesos (GTH
  completo con normograma confirmado; CEX a medias, con una solicitud enlazada), un proceso sin
  líder (AIN) y los demás pendientes; sin revisión cerrada (no hay informe en la demo, se genera en
  el recorrido).
- Metas por defecto; la lista «Todo el hospital» pasa al tipo «todos los usuarios activos»; el
  hallazgo abierto de Urgencias queda tal cual (para probar los dos pasos).
- `tests/semilla-tramites.test.ts` y los tests de semilla nuevos leen el estado y saltan con aviso
  si la demo ya avanzó; `SEMILLA_RECIEN=1` lo exige.

## 18. Pruebas

Como en la 13A y la 13B: reglas puras sin BD; flujos contra la BD de desarrollo en transacciones
que se revierten; usuarios de prueba `zz_*`; nada de `DELETE` en las tablas inmutables.

- **Reglas puras:** fecha base y próxima revisión (publicado, fuera, ratificado, fijada, externo);
  estado del semáforo con sus umbrales y la marca normativa; las siete definiciones de los
  indicadores con casos borde (sin trámites, sin acuses, división por cero → sin dato) y su
  cumplimiento contra la meta; la agrupación de avisos; la regla de la validación automática de
  hallazgos; la resolución de un miembro «todos»; el texto del informe.
- **Consultas y flujo:** ratificar (quién puede, vigente, sin trámite, huella en disco, firma sin
  trámite, fecha fijada borrada, decisión de campaña enlazada); fijar fecha a mano (futura, acotada,
  masiva); alta y adopción de un externo (origen y tipo coherentes, borrador único, firma «Adoptó»,
  `aplicarPublicacion` con `externo`, copias por recoger, acuses con «qué cambió»); verificación con
  los tres resultados, inmutabilidad, tarea de adopción; retiro con `anularVigenteEn`; abrir una
  revisión (una abierta, foto, recientes, en trámite, tareas), decidir (ratificar, actualizar con y
  sin trámite abierto, eliminar, cambiar antes de fijarse, no después), confirmar normograma,
  prorrogar, cerrar (sin revisar, informe congelado, trigger, regeneración solo con la huella);
  normas (única, relaciones que cambian estado, `norma_cambios`, impactos por documento y por
  proceso, resolución con solicitud y «no afecta», marca en el semáforo, retiro, borrar solo si
  vacío); indicadores con datos sembrados en la transacción; `transicionar` guarda `venceEn` en el
  evento; Excel de socializaciones, fecha de corrección por hallazgo, catálogos en solo lectura,
  hallazgo `por_validar` con validación manual, reapertura y automática.
- **Visibilidad:** cada pestaña, la ficha de una norma con un documento restringido, el informe
  PDF, un impacto y un externo con los cinco roles, un líder de otro proceso y un responsable
  técnico de otro externo; 404 en todos los caminos.
- **Vencimientos:** cada fuente nueva avisa una vez y escala una vez; agrupación por persona; sin
  avisos individuales con la revisión abierta; los externos y los impactos por su cuenta.
- **Estructurales, ampliados:** `permisos` (nueve celdas nuevas), `paginas-sesion`,
  `acciones-permisos` (dos archivos nuevos), `handlers-permisos`, `proxy-matcher` (tres rutas de
  subida), `privilegios-bd` (tres tablas inmutables), `navegacion` (dos entradas,
  `siResponsableTecnico`, catálogos con `distribucion.ver`), `textos-fijos`, `colores-fijos`,
  `esquema` (índices y `CHECK` nuevos: firmas sin trámite, origen externo, `todos`, `por_validar`,
  contextos de archivos, una revisión abierta).
- **PDF:** el informe sobre el membrete del acta, sobre uno propio y sin formato, con una, dos y
  tres hojas; el acta sigue idéntica byte a byte con sus datos de siempre (las firmas sin trámite
  no la tocan).
- **Semilla:** la demo deja los estados de §17 y la mínima las claves y el tipo `DE`.
- **Pantallas:** render del bloque «Vigencia» en sus cuatro estados, de la tabla de decisiones a
  390 px, de la ficha de una norma y de las tarjetas de indicadores; `a11y-estructura` para las
  páginas nuevas.

## 19. Demostración (criterios de cierre)

Con la base recién sembrada y `npm run dev`:

1. **Semáforo (`coordinadora.sgc`).** Vigencia → Semáforo: las tarjetas con los conteos y la lista
   con «Vencida hace N días», «Vence en N días», «Al día» y «En trámite». Filtrar vencidos de la
   carga inicial y **fijar próxima revisión** a todos: cada uno dice «fijada por …» y la bitácora
   tiene una fila por documento. Devolver uno al estado anterior quitando la fecha.
2. **Ratificar (`lider.gth`).** En la ficha de `GTH-PR-01` (vencido), «Ratificar sin cambios» con
   nota y clave: la ficha dice «Ratificado el … por …», la próxima revisión queda a 12 meses, la
   tarea desaparece y el Maestro muestra la última revisión. Con una clave errada, «Clave o código
   incorrectos». En un documento con trámite abierto no hay botón. Como `gerente`, ratificar
   `SGC-MN-01` (estratégico) sí; `GTH-PR-02` (operativo) no aparece.
3. **Externo nuevo (`lider.cex`).** Vigencia → Externos → «Registrar documento externo»: una guía
   del Ministerio con edición «2021», responsable `consulta`; en la página del externo, subir el
   PDF y «Adoptar esta edición» con clave, sin marcar «Pedir acuse de lectura». Debe verse:
   `CEX-DE-02` vigente en el Maestro con «Origen: Externo» y «Aprobación: Adoptado», sin
   «Solicitar cambio» y **sin acuses** (es un alta); «Pedir acuse de lectura» desde la ficha, como
   en la 13B, sí los crea. Apagar «Publicación directa» en Configuración documental: registrar otro
   externo sigue siendo posible.
4. **Verificación (`regente.farmacia`, en el celular o a 390 px).** Mis tareas → «Verificar la
   vigencia de ATE-DE-01» (vencida): fuente, «Hay una edición nueva», nota. La tarea «Adoptar la
   edición nueva de ATE-DE-01» llega a `coordinadora.sgc`, que adopta la rev. 5.0 con un PDF nuevo:
   la rev. 4.2 queda obsoleta con banda, las copias de Farmacia pasan a «por recoger» y la audiencia
   recibe el acuse con «qué cambió». Como `consulta` (sin ser responsable), abrir la verificación de
   otro externo: «Página no encontrada».
5. **Retiro.** En `GTH-DE-01`, registrar una verificación «Fue retirado o derogado»: el documento
   queda anulado, fuera del portal y de la búsqueda, y la audiencia recibe «dejó de aplicar».
6. **Normograma (`coordinadora.sgc`).** Normograma → «Nueva norma»: una resolución nueva que
   **deroga** a la Resolución 1995 de 1999 (enlazada a `AIN-PR-01`). Debe verse: la 1995 en
   «Derogada» con la fecha, el cambio en su historial, `AIN-PR-01` con «Revisión por cambio
   normativo» en atención y la tarea «Revisar el impacto de … en Atención Inmediata» en Mis tareas
   de `coordinadora.sgc` (AIN no tiene líder). Resolverla: «Abrir solicitud de cambio» deja la
   solicitud con motivo «cambio normativo» y el enlace a la norma; el impacto de otro documento,
   «No afecta…» con nota. Como `consulta`, abrir el normograma y la ficha de la 3100: ve todo menos
   el enlace a `GTH-FO-01` (restringido). Como `lider.gth`, en la página de GTH «Normas aplicables →
   Asociar norma» con un requisito.
7. **Revisión anual, líder (`lider.cex`).** Mis tareas → «Revisar los documentos de Consulta Externa
   (N pendientes)»: la tabla con los insumos; ratificar uno (clave), «Actualizar» otro (nace la
   solicitud con motivo «revisión anual» y el trámite dice «Abierto desde la revisión anual 2026»),
   «Eliminar» otro, y el externo `CEX-DE-01` con «Ratificar» (verificación sin clave). Confirmar el
   normograma «Sin novedad». Los que ya estaban en trámite aparecen «En trámite».
8. **Revisión anual, Admin (`coordinadora.sgc`).** El avance por proceso; **prorrogar** 15 días con
   motivo (los líderes con pendientes reciben aviso); abrir otra revisión: no se puede. Decidir por
   AIN (sin líder). **Cerrar y generar informe** con clave: lo sin decisión queda «sin revisar»; el
   PDF se abre sobre el membrete del acta con las cifras, la tabla de decisiones con su estado al
   cierre, los cambios normativos y la firma; volver a abrirlo da el mismo archivo. Como `gerente`,
   ver la revisión cerrada y el informe; como `lider.gth`, la página de GTH sin el PDF institucional.
   Elegir en Configuración documental un formato propio para el informe y «Ver informe de ejemplo».
9. **Indicadores (`gerente`).** Vigencia → Indicadores: las siete tarjetas con meta y
   cumple/no cumple, el gráfico de vencidos por proceso y el Excel. Como `lider.gth`, solo GTH.
   Cambiar una meta en Configuración documental y ver el cambio de color y texto.
10. **Herencia de la 13B.** Excel de Socializaciones; cerrar una verificación cambiando la fecha de
    corrección de un hallazgo; como `gerente`, abrir Puntos de uso y Listas sin botones; crear una
    lista con «Todos los usuarios activos» y pedir acuse: `admin` (sin cargo) también recibe la
    tarea; como `jefe.urgencias`, «Corregido» en el hallazgo de Urgencias (pasa a «por validar» y la
    tarea de validar llega a los Admin SGC); como `coordinadora.sgc`, «Reabrir» con nota y después
    verificar Urgencias conforme: el hallazgo se cierra solo con «validado por la verificación
    del …». El aviso «Se emitieron N copias» de Reemplazar se ve; los conteos de copias del líder
    incluyen las de otros puntos.
11. **Vencimientos.** Bajar días de atención, plazo de impactos y escalamiento a 1 en Configuración
    documental; la revisión avisa a los responsables con un solo aviso agrupado por proceso y, con
    una revisión anual abierta, no avisa por los documentos de la campaña; el jefe recibe un aviso
    sin títulos. Devolver los valores.
12. **Verificación técnica:** `npm run lint`, `npm test` (con `SEMILLA_RECIEN=1`), `npm run build`
    sin URL de base, compose reconstruido con «Migraciones al día» (nueve migraciones) y
    `/api/salud` en verde; la 0008 aplicada sobre una copia con la demo de `main` y sobre una con el
    esquema de `sgc-suaza`, con los tests de esquema en verde contra ellas; el acta de SOL-2026-001
    idéntica antes y después.

## 20. Manual de usuario

Capítulo 7, «Vigencia, revisión anual, documentos externos y normograma», escrito con la
funcionalidad fresca, con una sección por actor: cualquier persona (consultar el normograma, qué
significa el semáforo de un documento), el responsable técnico (verificar un externo), el líder
(ratificar, decidir en la revisión anual, confirmar su normograma, registrar y adoptar externos,
asociar normas y resolver impactos, leer sus indicadores), Gerencia y Control Interno (leer todo,
el informe) y el Administrador del SGC (fijar fechas tras la carga inicial, abrir, prorrogar y
cerrar la revisión, administrar el normograma, configurar metas y plazos, elegir el formato del
informe). Incluye los tres ajustes al texto del procedimiento (§5), la advertencia de que la carga
inicial amanece con vencidos y cómo tratarla (fijar fechas y abrir la revisión), y qué pasa con un
documento restringido en el normograma. Los capítulos 3 (barra lateral y tareas), 5 (motivos de la
solicitud y trámites enlazados) y 6 (catálogos en solo lectura, miembro «todos», hallazgos en dos
pasos, Excel de socializaciones, fecha de corrección) se corrigen donde esta entrega los deje
falsos.

## 21. Lo que se deja al constructor

- Los nombres definitivos de tablas, columnas, índices, estados, tipos de evento y claves de
  configuración; la forma del `jsonb` de insumos y del informe congelado.
- La organización del código: reglas puras (`src/lib/vigencia/`, `src/lib/normograma/`,
  `src/lib/indicadores-documentales/`), consultas (`src/db/consultas/vigencia/`,
  `src/db/consultas/normograma/`), acciones (`src/app/acciones-vigencia.ts`,
  `src/app/acciones-normograma.ts`), esquemas `zod`, componentes (`src/componentes/vigencia/`,
  `src/componentes/normograma/`); cómo se reutilizan `DialogoFirma`, `recibirArchivo`,
  `servir-archivo`, `hoja-excel` y el mecanismo del acta para el informe.
- La geometría del informe sobre el membrete (tablas, saltos de hoja, continuación con el mismo
  encabezado), dentro de los espacios configurados; la transliteración como la del acta.
- El diseño de cada pantalla dentro del sistema visual, los textos de interfaz, estados vacíos y
  errores; cómo se agrupan las tareas nuevas; cómo se muestra la fecha de corte en indicadores.
- La consulta exacta del semáforo (una vista o una función SQL reutilizada por la ficha, las
  listas, el Maestro, la página del proceso y los indicadores) y sus índices.
- Las sugerencias de emisor (consulta `DISTINCT` acotada), la búsqueda de normas en `/buscar` y
  la paleta, y los límites de ritmo.
- Cómo decide `siResponsableTecnico` y cómo redirige `/vigencia` según lo que la persona pueda ver.
- El orden de las tareas del plan, los tests concretos y los datos exactos de la demo.

## 22. Riesgos

| Riesgo | Mitigación |
|---|---|
| La entrega es grande (seis módulos más la herencia) | El plan va por módulos independientes con punto de control en navegador cada uno: migración, semáforo y ratificación; externos; normograma e impactos; revisión anual e informe; indicadores; herencia de la 13B; pantallas, semilla y manual. Las reglas puras y la migración, primero |
| La carga inicial amanece toda vencida y el Admin SGC recibe cientos de avisos | Fecha fijable en masa (§7.4); avisos agrupados por persona y proceso (§13.3); sin avisos individuales con la revisión anual abierta (§7.5); el manual propone abrir la primera revisión anual al terminar la carga |
| `misTareas` pasa de seis fuentes a diez y se calcula en cada render | Cada fuente es una consulta acotada por índice; las de vigencia y externos filtran por fecha; se mide en el punto de control y, si hace falta, se cachea por petición (ya hay deuda registrada en `CONTEXT.md`) |
| Firmas sin trámite rompen algo del acta | Las consultas del acta filtran por `tramite_id`; test que compara el acta de la demo byte a byte antes y después; `CHECK` que exige trámite salvo en «Ratificó» y «Adoptó» |
| La adopción publica sobre una vigente fuera del trámite y alguien la confunde con la carga directa | Camino propio, con firma, solo para `origen = 'externo'`; `publicarVersion` sigue rechazando documentos externos; la regla queda escrita en `AGENTS.md` |
| El informe no cabe o pisa el membrete | Mismo mecanismo y las mismas medidas configurables del acta; «Ver informe de ejemplo»; prueba con el formato real del hospital antes de cerrar la tarea |
| Normas mal registradas (número, año, duplicados) | Unicidad por tipo, número y año; sugerencias de emisor; retiro con motivo; borrar solo si vacío |
| Un cambio normativo genera impactos a decenas de procesos | Una tarea por cambio y proceso, no por documento; «No afecta…» en un gesto; el impacto de proceso sin documentos es una sola fila |
| El indicador 7 no tiene historia | Guarda `venceEn` desde ahora y dice «sin dato» antes; las demás fechas ya existen |
| El líder decide por error y no puede corregir | La decisión se cambia hasta que produce firma, verificación o trámite aceptado; después, el camino es el trámite o una nueva ratificación en la siguiente revisión |
| Dos pestañas cierran la revisión o adoptan la misma edición a la vez | Fila bloqueada con `FOR UPDATE` y estado esperado, como en los trámites y las copias |

## 23. Decisiones de Claude en este documento (para revisar de una vez)

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F13C-DC1 | La ratificación no exige separación respecto a quien elaboró o aprobó la versión | §6.3 | Es la constancia de una revisión, no una aprobación nueva; exigirla trabaría a los procesos pequeños | Práctica |
| F13C-DC2 | Al ratificar se recalcula la huella del archivo en disco y, si no coincide, se rechaza y queda en la bitácora | §7.3 | La misma comprobación única que la publicación (F13A-DC11); confirma que lo que circula es lo aprobado | ISO 7.5.3.1 b) |
| F13C-DC3 | Ratificar y verificar «sigue vigente» no generan avisos | §7.3, §13.2 | Quien actúa es quien tenía la tarea; el Admin SGC lo ve en el Semáforo y la bitácora; evita ruido | Práctica |
| F13C-DC4 | Fijar «Próxima revisión» también sobre la selección filtrada del Semáforo, auditado por documento | §7.4 | La carga inicial son unos 200 documentos; uno por uno no se haría | Práctica |
| F13C-DC5 | Las tarjetas del mapa no cambian con el semáforo | §7.2 | El mapa cuenta vigentes y un vencido sigue vigente; la señal está en la página del proceso | Práctica |
| F13C-DC6 | Avisos de vencimiento agrupados por persona y proceso, y silenciados para los documentos dentro de una revisión anual abierta | §7.5, §13.3 | Defensa contra la avalancha del primer día; el precedente de F13B-DC21 | Práctica |
| F13C-DC7 | Adición 5 «sin versionarlos como internos» = sin trámite; los externos tienen versiones (una por edición) | §5, §8.1 | Así funcionan sin cambios el índice de una vigente, el Maestro, las copias y los acuses | Reglas de negocio 1 y 2 |
| F13C-DC8 | `documentos.origen` es la marca que manda; el tipo `DE` es un dato editable más; la acción rechaza incoherencias | §8.1 | Dos columnas no pueden decir cosas distintas | Práctica |
| F13C-DC9 | Los campos de externo van en una tabla `externos`, no como columnas de `documentos` (se aparta de §7 del spec maestro) | §5, §15.2 | Una tabla por concepto; `documentos` no gana ocho columnas nulas en los internos | Práctica |
| F13C-DC10 | La adopción es un camino propio que publica con `aplicarPublicacion('externo')` y firma «Adoptó»; la regla 10 de `AGENTS.md` se amplía | §8.3, §15.4 | La carga directa sigue sin publicar sobre una vigente; reemplazar una edición es la esencia del externo | ISO 7.5.3.2; regla de negocio 1 |
| F13C-DC11 | Retirar un externo no exige clave: la evidencia es la verificación o la bitácora con motivo | §8.5 | Eliminar un interno exige aprobación porque es obra del hospital; retirar un externo constata un hecho del emisor | Práctica |
| F13C-DC12 | Los documentos con trámite abierto al abrir la campaña quedan «en trámite» y los publicados o adoptados después entran como «revisado recientemente» | §9.1 | La lista debe cubrir todo lo vigente sin pedirle al líder decidir sobre lo que ya está en cambio | Práctica |
| F13C-DC13 | «Actualizar» sobre un documento con trámite abierto enlaza ese trámite en vez de abrir otro | §9.3 | `tramites_uno_abierto_idx` lo impediría y el trámite en curso ya es la actualización | Regla de negocio 9 |
| F13C-DC14 | Una decisión se puede cambiar hasta que produce firma, verificación o trámite aceptado; cerrada la revisión, un trigger protege sus filas | §9.3, §9.5 | Corregir un clic sin perder evidencia; el informe firmado no puede cambiar | ISO 7.5.3.1 b); Ley 527 de 1999 |
| F13C-DC15 | El informe en PDF lo descargan solo Admin SGC, Gerencia y Control Interno; los líderes ven su proceso en pantalla | §6.4, §9.7 | El informe lista títulos de documentos restringidos de todos los procesos | ISO 7.5.3.1 b) |
| F13C-DC16 | El informe se imprime sobre el formato elegido para él o, si no hay, sobre el del acta; el código del encabezado es el del formato | §9.5 | Si el hospital quiere «SGC-RG-06» en el encabezado, registra ese formato y lo elige; el sistema no inventa códigos | Práctica (F13A-AU1) |
| F13C-DC17 | Un cambio de estado de una norma abre un impacto por documento enlazado y uno por proceso asociado sin documentos | §10.5 | El líder debe confirmar también que nada suyo cambia; es la evidencia del «se evaluó» | ISO 4.2, 7.5.3.2 b) |
| F13C-DC18 | «No afecta» exige nota de al menos 5 caracteres | §10.5 | Una resolución sin razón no sirve en auditoría | ISO 7.5.3.2 c) |
| F13C-DC19 | El enlace oficial de una norma se guarda y se muestra como texto, no como hipervínculo activo | §10.1 | Cero salidas a internet desde la app; el servidor puede no tener salida | Piso de despliegue, regla 6 |
| F13C-DC20 | El PDF de una norma se sirve sin marca de agua a toda persona con sesión | §10.1 | No es un documento del hospital ni una copia controlada | Práctica |
| F13C-DC21 | Una relación registrada por error se elimina con motivo; el estado se corrige a mano y los impactos nacidos se resuelven «no afecta» | §10.2 | Sin máquina de deshacer: lo que pasó queda en la bitácora | Práctica |
| F13C-DC22 | `transicionar` guarda la fecha límite de la etapa que cierra en el `detalle` del evento; el indicador 7 cuenta desde esta entrega | §11.1 | Hoy ningún registro conserva el plazo que regía al cerrar una etapa | Práctica |
| F13C-DC23 | Indicadores de estado solo a la fecha de hoy, sin fecha de corte pasada, y de flujo por periodo; la serie mensual de los de estado llega con la Fase 17 | §11.3 | Reconstruir el semáforo de un mes pasado sin planificador es frágil (las fechas fijadas a mano de entonces solo viven en la bitácora); la foto mensual lo resuelve | Práctica |
| F13C-DC24 | Regla de la validación automática: la siguiente verificación cerrada del punto valida los hallazgos «por validar» que no vuelven a salir, y reabre los que sí | §12.5 | El verificador ya miró el punto; pedirle un clic más por hallazgo es redundante | ISO 10.2.1 c) |
| F13C-DC25 | La foto de la corrección de un hallazgo se adjunta al hallazgo (contexto `hallazgo`) y es opcional | §12.5 | La nota ya es evidencia; exigir foto haría que no se marque | Práctica (F13B-DC13) |
| F13C-DC26 | Miembro «todos» como `tipo = 'todos'` con `referencia_id` nula y `CHECK`; `referencia_id` deja de ser obligatoria | §12.4, §15.1 | Un centinela (0) ensuciaría las consultas que hacen `JOIN` por referencia | Práctica |
| F13C-DC27 | `firmas.tramite_id` deja de ser obligatoria con un `CHECK` que lo exige salvo en «Ratificó» y «Adoptó» | §15.1 | Una tabla de firmas; las consultas del acta filtran por trámite y no cambian (el precedente de `archivos.version_id`, F13B-DC20) | Práctica |
| F13C-DC28 | Las revisiones anuales cerradas, con sus procesos y decisiones, son inmutables por trigger; `ratificaciones`, `externo_verificaciones` y `norma_cambios` son de solo inserción | §9.5, §15.2 | Son la evidencia de PC-11 y PC-13 | ISO 7.5.3.1 b); regla de negocio 5 |
| F13C-DC29 | «Vigencia» se muestra también al responsable técnico de un externo, limitada a la pestaña Externos con los suyos | §14.1 | Un responsable con rol Consulta debe llegar a su matriz (el precedente de F13B-DC19) | Práctica |
| F13C-DC30 | Las entradas «Puntos de uso» y «Listas de distribución» se muestran con `distribucion.ver`, y las páginas se pintan sin edición para quien no gestiona | §12.3, §14.1 | Es la vista de solo lectura que la 13B dejó pendiente, sin duplicar páginas | Spec 13B §6.4 |
| F13C-DC31 | La fecha base de un documento aprobado fuera de la plataforma es su `fecha_aprobacion`, nunca su `publicado_en`; la fórmula ramifica por `origen_aprobacion` | §7.1 | La carga directa también escribe `publicado_en` con la fecha de carga: un `COALESCE` daría un año de gracia a toda la carga inicial, contra la decisión 1 del usuario (revisión del constructor, C1) | Práctica |
| F13C-DC32 | Las carpetas `puntos-uso` y `listas-distribucion` salen de `admin/(panel)` a un grupo `admin/(catalogos)` sin guard de panel, con las mismas URL | §12.3 | El líder no tiene `panel.entrar` ni la marca de historial: con `distribucion.ver` aterrizaría en `/sin-acceso` (revisión del constructor, C2) | Práctica |
| F13C-DC33 | Página propia de control del externo (`/vigencia/externos/[id]`) para el borrador de edición, la adopción y las verificaciones | §8.8 | El líder no entra al panel y la ficha de lectura no sirve borradores (revisión del constructor, C3) | Práctica |
| F13C-DC34 | El alta de un externo no crea acuses salvo casilla explícita; la edición nueva sí; «Requiere socialización» es una casilla del diálogo de adopción | §8.3 | Pasar la matriz SGC-MZ-03 al sistema no debe disparar «confirme su lectura» a toda la planta; el precedente es la carga inicial de la 13B (revisión del constructor, P1 y P5) | Práctica |
| F13C-DC35 | El alta y la adopción de externos no dependen de «Publicación directa» ni de `exigirCargaAbierta`; `publicarVersion` rechaza los externos | §8.3 | Cerrar la carga inicial no puede impedir registrar externos durante toda la vida de la instalación (revisión del constructor, P3) | PC-11 |
| F13C-DC36 | En la revisión anual y en los impactos, un externo se decide o se resuelve por su verificación («sigue vigente», «hay edición nueva», «retirado»), nunca por solicitud | §9.3, §10.5 | Un externo no tiene trámite; sin esto el líder no podría completar un proceso con externos (revisión del constructor, P2) | Práctica |
| F13C-DC37 | Mientras hay una revisión abierta, las ratificaciones, verificaciones y solicitudes hechas fuera de la página de la campaña registran la decisión del documento a nombre de quien las hizo | §9.3 | El informe no debe cerrar con «sin revisar» lo que sí se revisó, ni nadie hacer dos veces lo mismo (revisión del constructor, P4) | Práctica |
| F13C-DC38 | El PDF del informe se genera al primer clic desde el jsonb congelado, como el acta, y vive en `archivos`; la revisión no guarda columnas del archivo | §9.5 | Generar el PDF dentro de la transacción de cierre es lo que el acta evitó a propósito (revisión del constructor, C5) | Práctica (F13A-R17) |
| F13C-DC39 | Las páginas de Vigencia y del normograma usan el patrón `exigirSesion` + alcance + `notFound()` de la 13B, no `exigirPermiso` | §6.4 | Quien no puede ver algo recibe «no encontrado», nunca «sin permiso» (regla de negocio 3); `exigirPermiso` redirige a `/sin-acceso` | Spec 13A §6.5 |

## Apéndice A — Evidencia de los puntos de control que cubre esta entrega

| Punto de control | Criterio del procedimiento | Evidencia en el sistema |
|---|---|---|
| PC-11 Control de documentos externos | «Matriz actualizada; fuentes oficiales verificadas; versión/fecha vigente; evidencias de actualización y divulgación cuando impacta procesos» | La pantalla «Externos» y su Excel son la matriz, siempre al día porque sale de los datos; cada verificación con fecha, quién, fuente consultada y resultado en registro inmutable; la edición adoptada con su fecha y la firma «Adoptó»; al adoptar una edición nueva, la anterior queda obsoleta, las copias controladas pasan a «por recoger» y la audiencia recibe el acuse con «qué cambió» |
| PC-13 Revisión anual y actualización ejecutada | «Revisión anual documentada en el registro por crear; decisiones de actualización con responsables y fechas; evidencia de ejecución (documentos actualizados, publicados y divulgados)» | La revisión anual con fechas de apertura, prórrogas y cierre; una decisión por documento con quién y cuándo; las solicitudes enlazadas con su número, responsable y plazo; el informe SGC-RG-06 congelado y firmado con el estado de cada trámite al cierre (publicado, en curso, cancelado) y los acuses de las versiones publicadas; las ratificaciones firmadas con huella; el normograma confirmado por proceso |
