# Fase 13A — Flujo documental (diseño)

Fecha: 2026-11-05. Estado: **aprobado por el usuario en conversación** (decisiones de §2); el
documento pasa por la revisión del constructor antes del plan.

## 0. Cómo leer este documento

Es el detalle de la **primera de las tres entregas** en que el usuario partió la Fase 13 del
diseño maestro `docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` ("el spec
maestro"). El spec maestro manda: §5.1 (roles y separación de funciones), §5.3 (visibilidad
documental por rol), §5.5 (repositorio de evidencias), §5.6 (notificaciones y tareas), §5.9
(seguridad), §6.1 (módulo Documentación SGC) y §8 Fase 13. Aquí se precisa lo que esas
secciones dejan abierto y se registran **los cambios que el usuario hizo al diseño maestro el
2026-11-05**, después de contrastarlo con el procedimiento documentado del hospital
(Apéndice A). Donde este documento y el spec maestro difieren, manda este; §2 dice en qué.

Las reglas permanentes están en `AGENTS.md`; el estado vivo, en `CONTEXT.md`. Las maquetas
aprobadas (no versionadas) están en `.superpowers/brainstorm/403-1793892709/content/`:
`flujo-13a.html` (etapas, actores y evidencia) y `pantallas-13a.html` (bandeja, aceptación,
trámite en revisión, firma y acta). Son la referencia del **contenido** de cada pantalla; el
estilo es el sistema visual de la Fase 12.

Vocabulario de este documento:

- **Trámite:** el recorrido completo de una solicitud, desde que se pide hasta que se cierra.
- **Coordinador SGC:** como llama el hospital a quien tiene el rol `admin_sgc`. La interfaz
  sigue diciendo "Administrador del SGC" donde nombra el rol.
- **Huella:** el SHA-256 de un archivo (`archivos.hash_sha256`).
- **Firma:** una acción del trámite que exige reingresar la clave y queda en la tabla `firmas`.
- **Publicación directa:** el camino heredado en el que el Admin SGC crea, sube y publica sin
  trámite. Desde esta entrega es solo la carga de documentos ya aprobados (§13).

Las etiquetas entre corchetes dicen de quién es cada decisión: **[Usuario]**, **[Spec
maestro]** o **[Decisión de Claude]**. Las de Claude están reunidas en §23 para revisarlas de
una vez.

## 1. Intención y porqué

Hoy (Fases 0 a 12) el Admin SGC crea el documento, sube el archivo, escribe a mano quién
elaboró, revisó y aprobó, y publica. La aprobación ocurre fuera, en papel; la plataforma solo
registra el resultado. El hospital tiene un procedimiento documentado de control de documentos
con 13 actividades y 13 puntos de control (Apéndice A). El usuario fijó el objetivo de la fase
con estas palabras: «si se realiza por el sistema, la trazabilidad quede registrada y sea más
rápido de realizar».

La 13A lleva al sistema las actividades 1 a 8 de ese procedimiento: pedir, dar visto bueno,
aceptar (con verificación de duplicidad, código y responsables), elaborar, revisar con lista
de verificación, aprobar con firma y publicar con acta. Cada punto de control, del PC-01 al
PC-08, deja su evidencia sin formatos en papel: la solicitud reemplaza al SGC-FO-02 y la lista
de verificación al SGC-FO-03. Además aplica la visibilidad por rol del spec maestro §5.3 (en
trámite, obsoletos y restringidos) y deja lista la carga de los documentos ya aprobados.

Al cerrar esta entrega el hospital puede tramitar documentos reales de principio a fin. La
distribución (13B) y la vigencia, los externos y el normograma (13C) se apoyan en lo que aquí
se construye.

## 2. Decisiones del usuario (2026-11-05)

1. **La Fase 13 se entrega en tres partes** (13A, 13B y 13C), cada una con su spec, su plan,
   la prueba del usuario y su fusión, como la Fase 12. El mapa está en §5.
2. **Cambios al diseño maestro**, propuestos por Claude al contrastar el procedimiento del
   hospital y aceptados por número («acojo tu recomendación de incluir del 1 al 14 y la 16
   queda para la fase 16»). Los que construye la 13A:
   - **(1) Quién aprueba.** Cada tipo de documento es *estratégico* (aprueba Gerencia) u
     *operativo* (aprueba el Coordinador SGC). El líder de proceso no aprueba documentos.
     **Reemplaza la DC11 del spec maestro** («Gerencia o el líder según el tipo»).
   - **(2) Separación cuando elabora el Coordinador SGC.** Revisa otra persona y aprueba
     Gerencia.
   - **(3) Solicitud en dos momentos.** Visto bueno del líder del proceso (queda dado si él
     mismo la pide) y aceptación del Coordinador SGC. La solicitud lleva tipo (crear,
     modificar, eliminar) y motivo de una lista fija: cambio normativo, mejora del proceso, no
     conformidad, solicitud del personal, revisión anual.
   - **(4) Elabora cualquier funcionario designado**, no solo el líder o el Admin SGC.
   - **(5) Lista de verificación en la revisión**, con observaciones numeradas que el
     elaborador responde y el revisor cierra; no pasa a aprobación con un ítem crítico sin
     cumplir. Amplía el «concepto escrito» del spec maestro.
   - **(12) Duplicidad asistida** al aceptar una solicitud de creación.
   - **(13) Código correlativo automático.**
   - **(14) Plantilla vigente por tipo de documento.**
   - **(8) La copia digital controlada es la plataforma.** No se construye nada; el hospital
     ajusta el texto de su procedimiento («carpeta oficial»).

   Quedan para otras entregas: (6) revisión anual y (7) externos con verificación de vigencia,
   en la 13C; (9) verificación en puntos de uso, (10) recibido de la copia controlada y (11)
   evidencia de capacitación, en la 13B. **Rechazado:** (15) permiso individual para el
   auxiliar administrativo. **Aplazado a la Fase 16:** (16) vigencia en fecha futura; hasta
   entonces la versión rige desde el momento en que se publica.
3. **El flujo de siete etapas** de la maqueta `flujo-13a.html` (solicitud, visto bueno,
   aceptación, elaboración, revisión, aprobación, publicación), la eliminación por el mismo
   trámite y la cancelación, con estos seis supuestos de Claude aprobados («así está bien»):
   1. La clave se pide en **cuatro momentos**: elaboró, revisó, aprobó y publicó. **Amplía el
      spec maestro**, que solo la pedía al aprobar, publicar y dar de baja.
   2. **Plazos por defecto en días calendario:** visto bueno 3, aceptación 3, elaboración 15,
      revisión 5, aprobación 5, publicación 2. Configurables y ajustables por trámite.
   3. **Todo ajuste vuelve a revisión**; el sistema no juzga si el cambio fue sustancial.
   4. **El archivo se congela al enviarse a revisión:** lo aprobado es exactamente lo
      publicado, con la misma huella.
   5. **Aprobar y publicar en un solo acto** cuando quien aprueba es el Coordinador SGC: una
      vez la clave, dos firmas.
   6. **Paso vencido:** aviso en la campana al responsable y, a los 3 días, a su jefe.
4. **Convención de códigos** (cierra el pendiente heredado «convención oficial de códigos»):
   sigla del proceso, sigla del tipo y consecutivo de dos dígitos contado por proceso y tipo
   (`SGC-FO-02` es el segundo formato del proceso SGC). Los documentos de un subproceso llevan
   la sigla de su proceso. Tipos y autoridad de una instalación nueva: tabla de §18. «Si
   identifico uno nuevo lo creo»: los tipos siguen siendo datos editables.
5. **Carga de lo ya aprobado en papel:** uno por uno en la 13A; importación por lote en la
   Fase 20. Se carga **solo la versión vigente** de cada documento; las obsoletas se van
   acumulando con el uso.
6. **Las pantallas** de `pantallas-13a.html`, con cuatro supuestos de Claude aprobados
   («aprobadas»): los ítems de la lista de verificación de la maqueta son de ejemplo y el
   Coordinador SGC los edita; cada solicitud lleva un número con año y consecutivo
   (`SOL-2026-014`); el control de cambios se escribe en el sistema; la duplicidad muestra
   «muy parecido» o «parecido», sin porcentajes.
7. **Siete decisiones más** de Claude aprobadas («no hay cambios»): la plantilla de un tipo es
   un documento controlado del propio sistema; el Coordinador SGC puede reasignar un paso
   pendiente, con motivo; un solo trámite abierto por documento; los códigos no se
   reutilizan; una sola lista de verificación para todos los tipos, con «no aplica»; avisos en
   la campana por evento, y los de vencimiento se generan cuando alguien entra a la
   aplicación; el Listado Maestro distingue la aprobación hecha en la plataforma de la
   registrada fuera de ella.

## 3. Metas, no metas y anti-metas

**Metas**

- Un documento nuevo, un cambio o una eliminación recorren el trámite completo dentro del
  sistema, y cada paso deja quién, qué y cuándo.
- Cada punto de control del procedimiento, del PC-01 al PC-08, tiene su evidencia consultable
  (Apéndice A).
- Firma por reingreso de clave en cuatro momentos, con registro inmutable y un acta en PDF por
  cada versión publicada y por cada eliminación.
- La visibilidad documental depende del rol, de la participación en el trámite y del nivel de
  acceso del documento, y se comprueba en cada página, cada búsqueda y cada archivo.
- El Coordinador SGC registra los documentos ya aprobados en papel con su número real de
  versión, y cierra esa carga cuando termina.
- Cada persona ve lo que le toca en «Mis tareas», en la campana y en la bandeja de trámites.

**No metas**

- Listas de distribución, acuses de lectura, copias controladas y puntos de uso: 13B.
- Plazo de revisión, semáforo de vigencia, revisión anual, documentos externos, normograma,
  caracterización e indicadores del proceso documental: 13C.
- Correo, planificador real y vigencia en fecha futura: Fase 16.
- «Abrir acción» desde un documento: Fase 15.
- Importación por lote de los documentos ya aprobados: Fase 20.
- Edición del documento en línea, comparación entre versiones, firma con certificado digital.
- Varios revisores o varios aprobadores en un mismo trámite; aprobación por comité.

**Anti-metas** (si pasa, la entrega falló)

- Que una versión quede vigente sin las firmas de elaboró, revisó y aprobó, o con un archivo
  distinto del que se aprobó.
- Que quien elabora sea quien revisa o quien aprueba.
- Que alguien vea un borrador, una versión obsoleta o un documento restringido sin el permiso
  que corresponde: por la página, por la búsqueda o pidiendo el archivo por su dirección.
- Que el registro de firmas o el historial de un trámite se puedan cambiar o borrar.
- Que un trámite quede sin salida porque falta una persona: siempre hay reasignación o
  cancelación.
- Que cerrar la carga de documentos ya aprobados deje un camino para publicar sin trámite.
- Que el trámite sea más lento que el papel: ningún paso pide un dato que el sistema ya tiene.

## 4. Restricciones

Rigen todas las de `AGENTS.md` (piso de despliegue, reglas de negocio, stack, convenciones y
reglas fijas de seguridad). Las propias de esta entrega:

- **Sin dependencias npm nuevas.** `pdf-lib` (acta y marca de agua), `file-type`, `exceljs`
  y `otpauth` ya están.
- **Migración aplicable sobre una base de `sgc-suaza`** (piso 11): no se renombra ni se borra
  ninguna tabla ni columna heredada. Sí se permite ampliar la lista de un `CHECK` y sustituir
  una restricción única por un índice único parcial que los datos heredados ya cumplen (§16).
- **Una sola versión vigente** sigue reforzada por el índice único parcial heredado, y
  publicar sigue siendo una sola transacción (regla de negocio 1).
- **Sin planificador:** nada corre por reloj. Los vencimientos se revisan cuando alguien usa
  la aplicación (§14); el planificador es de la Fase 16.
- **Las URL existentes se conservan** (spec maestro DC25).
- **Cada página nueva llama su guard** (`exigirSesion` o `exigirPermiso`) y cada acción nueva
  empieza por la sesión y la autorización; `tests/paginas-sesion.test.ts` y
  `tests/acciones-permisos.test.ts` se amplían a los archivos nuevos (§19).
- **Esquemas `zod` `.strict()`** leídos con `parsearFormulario` en la frontera de cada acción;
  los handlers que escriben verifican `Origin`.
- **Fechas y plazos en la zona de la instalación** (`zonaHoraria()`); la BD guarda
  `timestamptz`.
- **Accesibilidad no negociable:** teclado, foco visible, contraste AA en claro y oscuro,
  estado nunca solo por color, 390 px.
- **Tests contra la BD de desarrollo:** nunca `DELETE` ni `UPDATE` sobre `auditoria`,
  `accesos` ni las tablas inmutables nuevas; los datos de prueba llevan nombres únicos por
  corrida (§19).

## 5. Mapa de la Fase 13

| Entrega | Contenido | Pasos del procedimiento | Capítulo del manual |
|---|---|---|---|
| **13A** (este documento) | Solicitud, visto bueno, aceptación con duplicidad asistida, código correlativo y plantilla; elaboración; revisión con lista de verificación; aprobación por autoridad con firma; publicación con acta; eliminación por el trámite; visibilidad por rol y nivel de acceso; tareas y avisos; carga de lo ya aprobado; marca de agua con el nombre de quien descarga | 1 a 8 | «Documentos: solicitar, elaborar, revisar, aprobar y publicar» |
| **13B** | Listas de distribución y acuse de lectura con porcentaje; evidencia de capacitación; copias controladas con sello, recibido y recogida de las obsoletas; puntos de uso y su verificación con porcentaje de conformidad | 9 y 10 | «Copias controladas y acuses de lectura» |
| **13C** | Plazo de revisión (12 meses por defecto), semáforo documental y revisión anual con su informe; documentos externos con verificación de vigencia y su matriz; normograma institucional y por proceso; caracterización estructurada; indicadores del proceso documental | 11 y 13 | «Normograma» y la revisión anual |

De las adiciones del spec maestro §6.1: la 3 (concepto), la 4 (firma y acta), la 6 (nivel de
acceso), la 7 (baja con aprobación) y la 8 (marca de agua con usuario) son de la 13A; la 1
(copias controladas) y la 2 (acuse) son de la 13B; la 5 (externos) y la 12 (indicadores
documentales) son de la 13C. El paso 12 del procedimiento (acciones correctivas) es de la
Fase 15.

Lo que la 13A deja preparado para las siguientes: el evento de publicación y el de eliminación
(§11), a los que la 13B engancha la distribución; el motivo «revisión anual» de la solicitud,
que la 13C usa; y la tabla `archivos`, que no se generaliza aquí porque esta entrega no
necesita un dueño distinto de la versión (§16).

## 6. Actores, permisos y reglas de separación

### 6.1 Quién es quién

| En el procedimiento | En el sistema |
|---|---|
| Coordinador SGC | Usuarios con rol `admin_sgc` (puede haber más de uno) |
| Gerente | Usuarios con rol `gerencia` |
| Líder de proceso | Usuarios con rol `lider_proceso` asignados a ese proceso (`usuario_procesos`) |
| Responsable asignado | Cualquier usuario activo que el Coordinador SGC designe como elaborador |

Un trámite tiene cuatro **participantes**, guardados por persona en el propio trámite: el
**solicitante** (quien lo pide), el **elaborador**, el **revisor** y el **aprobador**. Los
tres últimos los designa el Coordinador SGC al aceptar. Ser participante da acceso a ese
trámite y a nada más: no cambia el rol del usuario ni su alcance por procesos.

### 6.2 Permisos nuevos en la matriz (`src/lib/permisos.ts`)

| Permiso | Roles | Qué concede |
|---|---|---|
| `tramites.solicitar` | `admin_sgc`, `lider_proceso` | Crear y retirar solicitudes. El líder, solo de procesos dentro de su alcance (`alcanceProcesos`) |
| `tramites.visto_bueno` | `lider_proceso` | Dar o negar el visto bueno de una solicitud de un proceso de su alcance |
| `tramites.participar` | Los cinco roles | Actuar como **elaborador designado**: subir el borrador, escribir el control de cambios, responder observaciones y enviar a revisión |
| `tramites.revisar` | `admin_sgc`, `lider_proceso` | Ser designado revisor y revisar |
| `tramites.aprobar` | `admin_sgc`, `gerencia` | Ser designado aprobador y aprobar |
| `tramites.gestionar` | `admin_sgc` | Aceptar o rechazar solicitudes, designar y reasignar responsables, cancelar, publicar, ejecutar la eliminación y editar la configuración documental (§15.4) |

Cada celda lleva su test, como el resto de la matriz. **Ninguna escritura queda sin permiso
de matriz** (regla de negocio 4): toda acción del trámite exige su permiso **y además** la
condición de persona que diga §7.2 (ser el elaborador, el revisor o el aprobador designado,
o ser líder del proceso propietario). `tramites.participar` lo tienen los cinco roles porque
el elaborador puede ser cualquier funcionario; existe para que la regla no tenga excepción y
para que el test estructural pueda exigir un permiso en cada acción [Decisión de Claude]. El
handler de subida acepta `documentos.administrar` (publicación directa) o
`tramites.participar` más ser el elaborador de ese trámite en la etapa `elaboracion`.

`documentos.administrar` sigue protegiendo la publicación directa (§13) y la edición de
metadatos. `documentos.ver_historial` no cambia.

### 6.3 Reglas de separación (se comprueban en el servidor al designar, al reasignar y al firmar)

- **S1. Quien elabora no aprueba.** [Spec maestro]
- **S2. Quien elabora no revisa.** [Usuario, punto 2]
- **S3. En una eliminación, quien la pide no la aprueba.** [Decisión de Claude: una
  eliminación no tiene elaborador, y sin esta regla el Coordinador SGC podría pedir, aprobar y
  ejecutar solo la baja de un documento operativo.]

El revisor y el aprobador **sí pueden ser la misma persona** (el procedimiento lo prevé en
los documentos operativos, que revisa y aprueba el Coordinador SGC). Publicar no es aprobar:
lo hace cualquier `admin_sgc`, también el que elaboró, revisó o aprobó (spec maestro DC27).

### 6.4 Quién puede ser designado

- **Elaborador:** cualquier usuario activo. Por defecto, el solicitante.
- **Revisor:** un usuario activo con `tramites.revisar`, distinto del elaborador (S2). Por
  defecto, el Coordinador SGC que acepta; si él es el elaborador, queda sin valor por defecto
  y debe elegir a otro.
- **Aprobador:** depende de la **autoridad del tipo de documento** (`tipos_documento`) y de
  quién origina el trámite:
  - tipo *estratégico*: un usuario activo con rol `gerencia`;
  - tipo *operativo*: un usuario activo con rol `admin_sgc`;
  - **excepción** [Usuario, punto 2]: si el elaborador tiene rol `admin_sgc`, aprueba un
    usuario con rol `gerencia`, sea cual sea el tipo y aunque haya otro `admin_sgc`. Lo mismo
    vale en una eliminación que pide un `admin_sgc` [Decisión de Claude, por S3].

  En todos los casos el aprobador es una persona distinta del elaborador (S1) y, en una
  eliminación, del solicitante (S3).

  Si hay un solo candidato, viene elegido. Si no hay ninguno, la solicitud no se puede aceptar
  y la pantalla dice qué falta (por ejemplo, «No hay ningún usuario activo con el rol
  Gerencia»).

### 6.5 Quién ve un trámite

La página de un trámite y los archivos de su borrador los ven:

1. sus cuatro participantes, sea cual sea su rol o su alcance;
2. todo `admin_sgc`;
3. los `lider_proceso` que tienen en su alcance alguno de los procesos del documento (el
   propietario o cualquiera donde aplica); en una solicitud de creación, el proceso declarado.

Cuando el trámite termina en publicación o en eliminación, lo ven además, en solo lectura,
quienes tienen `documentos.ver_historial` (Control Interno y la marca individual) y, si el
documento es restringido, cumplen también la regla de restringido de §12: es la evidencia de
cómo se aprobó cada versión. Un trámite rechazado o cancelado lo siguen viendo solo los de
la lista de arriba.

**Los archivos del trámite solo se sirven por su ruta mientras el trámite está abierto.** Al
cerrarse, la página conserva la solicitud, la lista de verificación, las observaciones, el
historial y el acta, pero cada archivo pasa a regirse por el estado de su versión (§12): la
versión publicada se consulta por la ficha, con su marca de agua; cuando quede obsoleta,
solo con `documentos.ver_historial`; y los archivos de una versión descartada los ve solo
quien tiene `tramites.gestionar`. Así un participante sin permiso de historial no conserva
un camino a una versión que dejó de estar vigente (regla de negocio 3).

Para cualquier otra persona el trámite no existe: la página responde como «no encontrada» y
el archivo con 404, sin revelar que hay un borrador.

La participación es la única excepción a «toda consulta pasa por `alcanceProcesos()`»
(`AGENTS.md`). La decisión de quién ve un trámite vive en el mismo módulo que esa regla
(`src/lib/alcance.ts`), no repartida en las consultas, y `AGENTS.md` la recoge al cerrar la
entrega.

## 7. El trámite: etapas y transiciones

### 7.1 Etapas

Un trámite está siempre en una etapa. Las de trabajo son `visto_bueno`, `aceptacion`,
`elaboracion`, `revision`, `aprobacion` y `publicacion`; las finales son `publicado`,
`eliminado`, `rechazado` y `cancelado`. Los nombres técnicos son provisionales (§22); los
textos de interfaz son los de la maqueta.

Crear y modificar recorren las seis etapas de trabajo. **Eliminar** salta elaboración y
revisión: `visto_bueno` → `aceptacion` → `aprobacion` → `publicacion` → `eliminado`.

### 7.2 Tabla de transiciones

| Desde | Acción | Quién | Hacia | Firma |
|---|---|---|---|---|
| — | Crear la solicitud | Quien tiene `tramites.solicitar` (el líder, en su alcance) | `visto_bueno`, o `aceptacion` si el visto bueno queda dado u omitido (§8.2) | — |
| `visto_bueno` | Dar el visto bueno | Un líder del proceso propietario | `aceptacion` | — |
| `visto_bueno` | Negar, con motivo | Un líder del proceso propietario | `rechazado` | — |
| `visto_bueno`, `aceptacion` | Retirar la solicitud | El solicitante | `cancelado` | — |
| `aceptacion` | Aceptar (§8.3) | `tramites.gestionar` | `elaboracion`; en una eliminación, `aprobacion` | — |
| `aceptacion` | Rechazar, con motivo | `tramites.gestionar` | `rechazado` | — |
| `elaboracion` | Enviar a revisión (§9.1) | El elaborador | `revision` | **Elaboró** |
| `revision` | Devolver con observaciones (§9.3) | El revisor | `elaboracion`, ronda siguiente | — |
| `revision` | Dar concepto favorable (§9.2) | El revisor | `aprobacion` | **Revisó** |
| `aprobacion` | Aprobar, con concepto | El aprobador | `publicacion` | **Aprobó** |
| `aprobacion` | Devolver con observaciones | El aprobador | `elaboracion`, ronda siguiente (no aplica en una eliminación) | — |
| `aprobacion` | Negar la eliminación, con motivo | El aprobador (solo en una eliminación) | `rechazado` | — |
| `publicacion` | Publicar (§11.1) o ejecutar la eliminación (§11.3) | `tramites.gestionar` | `publicado` o `eliminado` | **Publicó** |
| `aprobacion` | Aprobar y publicar en un solo acto (§10.4) | El aprobador, si tiene `tramites.gestionar` | `publicado` o `eliminado` | **Aprobó** y **Publicó** |
| Cualquiera de trabajo | Cancelar, con motivo | `tramites.gestionar` | `cancelado` | — |
| Cualquiera de trabajo | Reasignar un responsable o cambiar la fecha límite, con motivo | `tramites.gestionar` | La misma | — |

Reglas que valen para toda la tabla:

- **Un solo punto de entrada.** Toda transición pasa por una misma función del servidor que,
  dentro de una transacción y con la fila del trámite bloqueada (`FOR UPDATE`), comprueba la
  sesión, la etapa esperada, la ronda esperada, que quien actúa es quien la tabla dice y las
  reglas de §6.3. Si la etapa o la ronda ya cambiaron (otra pestaña, doble envío), responde
  con un error de negocio y no escribe nada.
- **Cada transición deja tres rastros en la misma transacción:** el evento en el historial
  del trámite (§16), la fila de `auditoria` (regla de negocio 5) y, si la tabla lo indica, la
  firma (§10).
- **Devolver** vuelve a `elaboracion` y suma una **ronda**. Después de una devolución del
  aprobador, el documento pasa otra vez por revisión y por aprobación [Usuario, supuesto 3].
- **Cancelar** un trámite de crear o modificar deja su versión en trámite como `descartado`
  (§16.1) y conserva sus archivos como parte del historial. El documento vigente no cambia.
- **Reasignar** respeta §6.3 y §6.4, no borra lo ya firmado y avisa a quien entra y a quien
  sale. Solo se reasigna un paso pendiente; el solicitante no se cambia.
- **Un solo trámite abierto por documento** [Usuario]: mientras haya uno en una etapa de
  trabajo no se acepta otra solicitud sobre el mismo documento, y la publicación directa
  sobre ese documento queda bloqueada.

### 7.3 Plazos

Cada etapa de trabajo tiene una **fecha límite** que el sistema calcula al entrar en ella:
el momento de entrada más los días calendario configurados. Valores por defecto [Usuario,
supuesto 2]: visto bueno 3, aceptación 3, elaboración 15, revisión 5, aprobación 5,
publicación 2. Después de una devolución, la elaboración usa el plazo de **ajustes**, que
por defecto vale lo mismo que el de revisión (5 días) [Decisión de Claude].

El Coordinador SGC cambia los valores en la configuración documental (§15.4) y, en cada
trámite, puede fijar la fecha límite de elaboración al aceptar y cambiar la de la etapa en
curso con la acción de reasignar. La fecha límite vence al final de ese día en la zona de la
instalación.

## 8. Solicitud y aceptación (pasos 1 a 3 del procedimiento)

### 8.1 La solicitud

Campos:

- **Tipo:** crear, modificar o eliminar.
- **Motivo**, de la lista fija: cambio normativo, mejora del proceso, no conformidad,
  solicitud del personal, revisión anual.
- **Justificación:** texto obligatorio.
- En **crear**: proceso o subproceso propietario, tipo de documento propuesto y título
  propuesto.
- En **modificar** y **eliminar**: el documento. Debe tener versión vigente y no tener un
  trámite abierto. El proceso propietario sale de su asociación principal.

El líder solo puede pedir sobre procesos de su alcance; un `admin_sgc`, sobre cualquiera.
Desde la ficha de un documento vigente, quien puede pedir ve el botón «Solicitar cambio», que
abre la solicitud con el documento ya elegido.

Cada solicitud recibe al crearse un **número** con el año y un consecutivo anual de tres
dígitos como mínimo (`SOL-2026-014`), único, que la identifica en el historial, en el acta, en
la bitácora y en los avisos.

### 8.2 Visto bueno del líder

«Líder del proceso» es todo usuario activo con rol `lider_proceso` asignado al proceso
propietario (para un subproceso, a su proceso).

- Si quien pide es líder de ese proceso, el visto bueno **queda dado** en el momento de
  crear la solicitud, con su usuario y la hora.
- Si quien pide es un `admin_sgc` y el proceso tiene al menos un líder, el trámite entra en
  `visto_bueno` y cualquiera de esos líderes lo da o lo niega con motivo.
- Si el proceso no tiene ningún líder, el visto bueno **se omite** y queda escrito en el
  historial que no había a quién pedirlo [Decisión de Claude: no trabar el trámite].

### 8.3 Aceptación por el Coordinador SGC

Una sola pantalla (maqueta 2) con cuatro bloques:

1. **La solicitud**, en solo lectura.
2. **¿Ya existe un documento parecido?** Solo en una solicitud de creación. El sistema
   muestra hasta cinco documentos vigentes cuyo título o palabras clave se parecen al título
   propuesto, marcados «muy parecido» o «parecido», y el Coordinador SGC elige una de dos
   salidas:
   - *No es un duplicado: es un documento nuevo.*
   - *Es una modificación de un documento que ya existe:* elige cuál, y el mismo trámite pasa
     a ser de modificación de ese documento. Solo vale si ese documento es **del mismo
     proceso propietario** que la solicitud y no tiene otro trámite abierto: así el visto
     bueno ya dado sigue siendo del líder correcto. Si el parecido es de otro proceso, la
     solicitud se rechaza con el motivo y el código de ese documento, y el líder de ese
     proceso pide la modificación.

   La lista que vio (aunque esté vacía) y su decisión quedan en el evento de aceptación: es la
   evidencia del PC-02. La búsqueda usa lo que ya hay (`pg_trgm` y la búsqueda de texto); los
   umbrales los fija el constructor.
3. **Clasificación y código** (qué datos cambia un trámite: §8.6).
   - En una **creación:** tipo de documento, proceso o subproceso propietario, otros procesos
     donde aplica, título, descripción, palabras clave, documentos relacionados (los formatos
     que usa un procedimiento, `documento_relaciones`), nivel de acceso (general o
     restringido, §12) y el **código** (§8.4). Son los metadatos que hoy edita el panel, más
     los documentos relacionados, que hoy solo llena la semilla (el panel nunca tuvo ese
     selector; se añade en esta entrega). La descripción y las palabras clave alimentan la
     búsqueda.
   - En una **modificación:** el código, el tipo y el proceso propietario se muestran y no se
     editan; el único dato que el trámite puede cambiar es el **título**.

   La versión se muestra y no se edita: 1 en una creación; la siguiente a la última publicada
   en una modificación. El bloque muestra la **plantilla vigente** del tipo, si la tiene
   (§8.5).
4. **Responsables y fechas:** elaborador, revisor y aprobador según §6.4, y la fecha límite
   de elaboración.

Al **aceptar**, en una transacción: en una creación nace el documento con su código y sus
asociaciones; en creación y modificación nace la versión en trámite (estado `borrador`); el
trámite pasa a `elaboracion` y el evento guarda la clasificación, los responsables, la
plantilla que estaba vigente y el resultado de la duplicidad.

En una **eliminación** la pantalla solo muestra la solicitud y la designación del aprobador
(§6.4, con S3); al aceptar, el trámite pasa a `aprobacion`.

**Rechazar** exige un motivo, cierra el trámite y avisa al solicitante.

### 8.4 Código correlativo

- La configuración guarda el **formato del código** con tres marcadores: `{PROCESO}` (sigla
  del proceso propietario; en un subproceso, la de su proceso), `{TIPO}` (sigla del tipo) y
  `{NN}` (consecutivo con dos dígitos como mínimo; `{NNN}`, con tres). Valor de una
  instalación nueva y de la demo: `{PROCESO}-{TIPO}-{NN}` [Usuario].
- El sistema **propone** el siguiente consecutivo: el mayor que exista entre los códigos de
  ese proceso y ese tipo, más uno. Cuentan todos los documentos, también los eliminados y los
  de trámites cancelados: **un código nunca se reutiliza** [Usuario].
- El Coordinador SGC puede corregir el código propuesto. Se valida contra el formato y debe
  ser único. Dos aceptaciones simultáneas no pueden obtener el mismo código: la unicidad de
  `documentos.codigo` lo impide y la segunda recibe el consecutivo siguiente.
- La clave heredada `patron_codigo` (expresión regular) deja de editarse a mano: cuando hay
  formato, el patrón de validación **se deriva de él**. Una base sin formato (heredada de
  `sgc-suaza`) sigue validando con su `patron_codigo` y no propone código hasta que el
  Coordinador SGC fije el formato.
- El código y el tipo de un documento no cambian con una modificación.

### 8.5 Plantilla por tipo

Cada tipo de documento puede apuntar a **un documento del propio sistema** que es su
plantilla [Usuario]. La plantilla se controla como cualquier documento: tiene código,
versiones y su propio trámite cuando cambia. En la aceptación y en la elaboración el sistema
muestra el enlace a la versión vigente de esa plantilla, y el evento de aceptación guarda
cuál era (código y versión): es la evidencia de «plantilla vigente utilizada» del PC-03. Un
tipo sin plantilla no muestra nada.

### 8.6 Qué datos del documento cambia un trámite

El título, los procesos y el nivel de acceso viven en el documento, no en la versión, y el
portal los lee de ahí. Para que un trámite en curso no cambie lo que se ve de la versión
vigente, los datos se tratan en dos grupos [Decisión de Claude]:

- **Datos de control: código, tipo, proceso propietario y título.** Son parte de la
  identidad del documento.
  - En una **creación** se fijan al aceptar y el Coordinador SGC puede corregirlos mientras
    el trámite esté en `elaboracion` o `revision` (nadie ve todavía el documento). Desde
    `aprobacion` quedan fijos.
  - En una **modificación**, el código, el tipo y el proceso propietario **no cambian**:
    mover un documento a otro proceso es eliminarlo y crear otro. El **título** sí puede
    cambiar: el título nuevo se guarda en el trámite, lo ven quienes ven el trámite, aparece
    en el acta y **se aplica al documento en la transacción de publicar**. Hasta entonces el
    portal sigue mostrando el título de la versión vigente.
  - Fuera de un trámite, el título de un documento vigente no se edita. Única excepción: con
    la carga abierta (§13.3), el Coordinador SGC corrige el título de un documento cuya
    versión vigente se registró fuera de la plataforma, como corrección de digitación.
- **Datos de catálogo: descripción, palabras clave, otros procesos donde aplica, documentos
  relacionados y nivel de acceso.** No son parte del contenido aprobado. Quien tiene
  `documentos.administrar` los edita desde el panel en cualquier momento, con trámite abierto
  o sin él, y cada cambio queda en la bitácora. Un cambio de nivel de acceso rige de
  inmediato.

## 9. Elaboración, revisión y observaciones (pasos 4 a 6)

### 9.1 Elaboración

El elaborador trabaja sobre la versión en trámite:

- descarga la plantilla vigente, si el tipo la tiene;
- sube el archivo principal y, si aplica, el editable y los anexos, con la misma validación
  de siempre (lista blanca, magic bytes, 25 MB);
- escribe el **control de cambios** de la versión (`resumen_cambios`), obligatorio;
- responde cada observación abierta (§9.3).

Para **enviar a revisión** deben existir el archivo principal y el control de cambios, y
todas las observaciones abiertas deben tener respuesta. El envío es la firma **Elaboró**.

**Archivo congelado** [Usuario, supuesto 4]: fuera de la etapa `elaboracion` nadie puede
subir, reemplazar ni borrar archivos de la versión en trámite, ni cambiar el control de
cambios. Los datos de control del documento siguen §8.6: desde `aprobacion` quedan fijos.

**Los borradores intermedios no se conservan** [Decisión de Claude]: si el elaborador
reemplaza un archivo al ajustar, el anterior se borra, como hoy. De cada ronda quedan la
huella que firmó el elaborador (`firmas`), las respuestas de la lista y las observaciones;
el archivo que se conserva es el que se aprueba.

### 9.2 Revisión con lista de verificación

El revisor ve el borrador sin marca de agua, el control de cambios, las observaciones y la
**lista de verificación** (maqueta 3):

- La lista es **una sola para todos los tipos** [Usuario] y la edita el Coordinador SGC
  (§15.4): cada ítem tiene texto, orden, la marca **crítico** y activo o inactivo. Un ítem con
  respuestas no se borra: se desactiva.
- El revisor responde cada ítem activo con **cumple**, **no cumple** o **no aplica**, y puede
  añadir una nota por ítem. Puede guardar el avance y volver después.
- Las respuestas se guardan **por ronda**, con el texto del ítem tal como estaba en ese
  momento, y dejan de poder cambiarse cuando la ronda se cierra.
- Una ronda nueva parte de las respuestas de la anterior.

Para dar **concepto favorable** deben cumplirse las tres condiciones: todos los ítems activos
tienen respuesta; ningún ítem crítico está en «no cumple»; no queda ninguna observación sin
cerrar. El revisor escribe además un **concepto** breve, obligatorio (spec maestro, adición
3). El concepto favorable es la firma **Revisó**.

### 9.3 Observaciones

Las observaciones son registros propios del trámite, **numerados** de corrido (1, 2, 3…)
[Usuario, punto 5]:

- Las crea el revisor durante la revisión, o el aprobador al devolver.
- Cada una pasa por tres estados: **abierta** (recién creada), **atendida** (el elaborador
  escribió su respuesta) y **cerrada** (quien la creó, o el revisor de la ronda, la da por
  resuelta). Si la respuesta no convence, el revisor la **reabre** con una nota y vuelve a
  estar abierta.
- Guardan quién la escribió, en qué ronda, quién respondió, quién cerró y cuándo.

**Devolver a elaboración** exige que haya al menos una observación abierta. Es la evidencia
del PC-05 y del PC-06: qué se observó, quién ajustó y cuándo se cerró cada punto.

## 10. Firma

### 10.1 Qué acciones firman

| Firma | Acción | Quién |
|---|---|---|
| **Elaboró** | Enviar a revisión | El elaborador |
| **Revisó** | Dar concepto favorable | El revisor |
| **Aprobó** | Aprobar el documento, o aprobar su eliminación | El aprobador |
| **Publicó** | Publicar la versión, o ejecutar la eliminación | Un `admin_sgc` |

[Usuario, supuesto 1. Amplía el spec maestro §5.1, que pedía la clave solo al aprobar, al
publicar y al dar de baja.]

### 10.2 Cómo se firma

La acción lleva en el mismo envío la **clave** del usuario y, si tiene segundo factor activo,
un **código** de su aplicación de autenticación o un código de recuperación, igual que en el
ingreso (maqueta 4). El servidor verifica las dos cosas antes de ejecutar la transición; si
fallan, la transición no ocurre.

**Los fallos cuentan como los del ingreso** [Decisión de Claude]: suben el mismo contador de
bloqueo de la cuenta (5 fallos, 15 minutos, duplicando), quedan en el registro de accesos con
un resultado propio (`firma_fallo`, o `bloqueo` cuando lo provoca) y, si la cuenta queda
bloqueada, la sesión se cierra. Una firma correcta reinicia el contador. Sin esto, quien
tuviera una sesión ajena abierta podría probar claves desde el diálogo de firma sin que la
cuenta se bloqueara nunca. La verificación corre bajo el candado por usuario que ya usa el
ingreso (`conCandado`), y el código de recuperación usado se consume.

La función existente `comprobarClaveActual` (desactivar el segundo factor, cambiar la clave)
no se toca: la firma es una verificación nueva, construida con las piezas del ingreso
(`verificarClave`, `verificarTotp`, `consumirCodigoRecuperacion`, `estadoTrasFallo`,
`guardarEstadoBloqueo`, `registrarAcceso`).

### 10.3 Qué queda registrado

Una fila en la tabla **`firmas`** por cada firma, escrita en la misma transacción que la
transición:

- el usuario, y su **nombre y cargo en ese momento** (copiados: el acta no debe cambiar si
  después cambia de cargo o de nombre);
- qué firma es (elaboró, revisó, aprobó, publicó), el trámite, la versión y la ronda;
- la **huella** del archivo principal de la versión en ese momento (en una eliminación, la
  del archivo principal de la versión vigente que se retira);
- fecha y hora (`timestamptz`);
- cómo se verificó (clave, o clave y segundo factor) y, si se conocen, la IP y el agente de
  usuario.

`firmas` es **de solo inserción**, igual que `auditoria` y `accesos`: `REVOKE UPDATE, DELETE`
para `sgc_app` en `src/db/roles-bd.ts`, trigger `BEFORE UPDATE OR DELETE` con
`sgc_impedir_modificacion()` en la migración y su caso en `tests/privilegios-bd.test.ts`
(deuda anotada en `CONTEXT.md`). El historial del trámite (§16) recibe el mismo trato
[Decisión de Claude].

Base legal: firma electrónica según la Ley 527 de 1999 [Spec maestro, adición 4].

### 10.4 Coherencia de la huella y firma doble

- Al firmar **Revisó**, **Aprobó** y **Publicó**, el servidor comprueba que la huella del
  archivo principal es la misma que firmó el elaborador en la ronda en curso. Como el archivo
  está congelado, solo puede diferir por un defecto; si difiere, la acción se rechaza.
- Al **publicar**, el servidor además vuelve a calcular la huella leyendo el archivo del
  almacén y se niega a publicar si no coincide con la registrada [Decisión de Claude: es una
  comprobación única en el momento que importa, no la verificación periódica que el usuario
  rechazó].
- **Aprobar y publicar en un solo acto** [Usuario, supuesto 5]: cuando el aprobador tiene
  `tramites.gestionar`, la pantalla le ofrece un solo botón que pide la clave una vez, escribe
  las dos firmas (Aprobó y Publicó) y deja el trámite cerrado, todo en una transacción. Puede
  también aprobar sin publicar y dejar la publicación para después.

## 11. Publicación, acta y eliminación (pasos 7 y 8)

### 11.1 Publicar

Es la transacción de siempre (regla de negocio 1), con estos añadidos, todos dentro de ella:

1. Comprueba que el trámite está en la etapa correcta, que existen las firmas Elaboró, Revisó
   y Aprobó de la ronda en curso con la misma huella, y la huella en disco (§10.4).
2. Pasa la versión vigente anterior a `obsoleto` y la versión en trámite a `vigente`.
3. **Copia a las columnas heredadas** de la versión el nombre y el cargo de quienes firmaron
   (`elaboro`, `reviso`, `aprobo`) y las fechas de esas firmas (`fecha_elaboracion`,
   `fecha_revision`, `fecha_aprobacion`). Así el `CHECK` heredado
   `versiones_vigente_con_aprobacion`, la ficha y el Listado Maestro siguen funcionando sin
   distinguir cómo se aprobó cada versión.
4. Marca la versión como **aprobada en la plataforma** y guarda el momento de la publicación,
   que es la fecha de entrada en vigencia [Usuario: la vigencia futura es de la Fase 16]. Si
   la modificación traía un título nuevo, lo aplica al documento (§8.6).
5. Escribe la firma Publicó, el evento, la auditoría y los avisos (§14.2), y cierra el
   trámite como `publicado`.

Este es el **evento de publicación** al que la 13B enganchará la distribución.

### 11.2 Acta

Por cada versión publicada por trámite el sistema genera un **acta de aprobación documental**
en PDF con `pdf-lib` (maqueta 4), con: la entidad; el documento (código, título, tipo,
proceso) y la versión; la solicitud (número, tipo, motivo, justificación, solicitante,
fecha); el visto bueno (quién y cuándo, o que quedó dado u omitido); la aceptación (quién,
cuándo y la decisión sobre duplicidad); el control de cambios; la tabla de firmas (firma,
nombre y cargo, fecha y hora, huella); el número de rondas y de observaciones; la versión que
quedó obsoleta; y un pie con la base legal, la paginación y la fecha de generación.

- El acta se guarda como **un archivo más de la versión**, con un rol propio, su huella y su
  ruta en el almacén. No aparece en la lista de archivos del documento: se ofrece como
  enlace «Acta de aprobación» junto a los datos de control.
- **La ve quien puede ver esa versión** [Decisión de Claude]. Se sirve tal cual, sin marca de
  agua: es un registro, no una copia del documento.
- Se genera justo después de confirmar la transacción. Todo su contenido sale de datos que ya
  no cambian (firmas, historial), así que **si la generación falla, la publicación no se
  deshace**: el enlace del acta la genera y la guarda la primera vez que alguien la pide. La
  fecha que imprime es la de la publicación, para que el resultado sea el mismo.
- Los textos pasan por la fuente estándar que ya usa la marca de agua; el constructor
  comprueba tildes, eñes y nombres largos.

### 11.3 Eliminar un documento

Recorre el trámite de §7 [Usuario; spec maestro, adición 7]. Al **ejecutar la eliminación**,
en una transacción: la versión vigente pasa a `anulado` (el estado que ya existe para esto),
se escriben la firma Publicó, el evento, la auditoría y los avisos, y el trámite se cierra
como `eliminado`. Se genera un **acta de eliminación** con las mismas reglas que la de
aprobación, guardada en la versión anulada.

El documento deja de verse en el portal, en la búsqueda y en el Listado Maestro de vigentes;
se conserva con su banda «ANULADO» para quien tiene `documentos.ver_historial` (reglas de
negocio 2 y 3). Su código no se reutiliza. Este es el **evento de eliminación** al que la 13B
enganchará el aviso a las listas y la recogida de copias.

La anulación directa que hoy hace el Admin SGC desde el panel desaparece (§13.1).

## 12. Visibilidad documental por rol

Aplica el spec maestro §5.3 y la adición 6. Hoy el portal sirve las versiones vigentes a
cualquier sesión, y el panel muestra todas las versiones, incluidos los borradores, a quien
tiene `documentos.ver_historial`. Desde esta entrega:

| Versión | Quién la ve | Por dónde |
|---|---|---|
| **Vigente, documento general** | Todo usuario con sesión | Portal, búsqueda, `Ctrl K`, panel |
| **Vigente, documento restringido** | `admin_sgc`, `gerencia`, `control_interno` y los usuarios de cualquier rol asignados a alguno de los procesos del documento | Los mismos lugares, para ellos; para los demás el documento no existe |
| **En trámite** (borrador de un trámite abierto) | Los de §6.5 | Solo la página del trámite y su ruta de archivos |
| **Borrador de publicación directa** | Quien tiene `documentos.administrar` | Panel |
| **Obsoleta o anulada** | Quien tiene `documentos.ver_historial` y, si el documento es restringido, además cumple la fila de restringido | Panel |
| **Descartada** (de un trámite cancelado o de una carga deshecha) | Quien tiene `tramites.gestionar` | La página del trámite o el panel |

Consecuencias que el constructor debe aplicar:

- **Una sola regla, en un solo lugar.** La pertenencia a los procesos del documento se
  calcula junto a `alcanceProcesos()` en `src/lib/alcance.ts` (procesos activos asignados al
  usuario, para cualquier rol), y todas las consultas la usan: ficha, documentos de proceso y
  de subproceso, relacionados, búsqueda `/buscar`, `/api/buscar`, conteos del mapa y las
  rutas de archivos. Ninguna consulta reescribe el filtro.
- **«Procesos del documento»** son el propietario y todos aquellos donde aplica
  (`documento_proceso`); una asociación a un subproceso cuenta por su proceso.
- **La búsqueda y `Ctrl K` siguen mostrando solo vigentes**, ahora filtrados por nivel de
  acceso. Lo no vigente se consulta en el panel con el permiso. Con esto se cierra el
  pendiente F12-DC14.
- **El panel deja de mostrar borradores a quien no administra** [Decisión de Claude, para
  cumplir §5.3]: la lista y el detalle de «Gestión de documentos» y la ruta de archivos del
  panel muestran los borradores solo a quien tiene `documentos.administrar`; Control Interno y
  la marca individual siguen viendo vigentes, obsoletas y anuladas. El Listado Maestro con
  alcance «todos» deja de listar documentos que solo tienen borrador o versión descartada.
- **Cada archivo se autoriza en cada petición**, con `Cache-Control: no-store` como hoy:
  - la ruta del portal sirve archivos de la versión vigente, con la regla de nivel de acceso;
  - la ruta del panel sirve obsoletas y anuladas con `documentos.ver_historial` (más la regla
    de restringido) y borradores de publicación directa con `documentos.administrar`;
  - una ruta nueva sirve los archivos de un trámite a quienes lo ven, solo mientras está
    abierto (§6.5).
- **Marca de agua** (spec maestro, adición 8 y DC13):
  - Todo PDF que sale por la ruta del portal lleva «COPIA NO CONTROLADA» y la leyenda con el
    **nombre de quien lo descarga** y la fecha, en la zona de la instalación (hoy la fecha
    usa la zona del proceso; se corrige aquí).
  - Los archivos de un trámite se sirven **sin marca**; la página del trámite muestra la
    banda «EN TRÁMITE».
  - El acta se sirve sin marca. La copia controlada numerada es de la 13B.
- La banda «OBSOLETO» / «ANULADO» del panel no cambia (regla de negocio 2).
- **Los procesos asignados valen para cualquier rol.** La regla de restringido se apoya en
  `usuario_procesos`, que hoy el formulario de usuarios presenta como «Procesos que lidera»
  y la demo solo llena para los líderes. El formulario pasa a decir «Procesos» y explica
  qué significa según el rol: para un líder, los que lidera; para los demás, los procesos a
  los que pertenece, que le dan acceso a sus documentos restringidos [Decisión de Claude].

## 13. Carga de los documentos ya aprobados (publicación directa)

### 13.1 Qué es desde ahora

El camino heredado del panel (crear documento, subir archivos, escribir quién elaboró, revisó
y aprobó, y publicar) queda como **carga de documentos aprobados fuera de la plataforma**
[Spec maestro, DC26]. Sigue exigiendo `documentos.administrar` y sigue auditado.

**Solo da de alta.** Sirve para registrar un documento que no tiene versión vigente: uno
nuevo en el sistema, o uno cuya carga se deshizo (§13.2). **Nunca publica una versión sobre
un documento que ya tiene una vigente:** la siguiente versión de un documento cargado pasa
por un trámite [Spec maestro, DC26]. La anulación directa desaparece: eliminar un documento
es siempre un trámite (§11.3).

### 13.2 Qué se le añade

- **Número real de versión** [Usuario]: al registrar un documento por este camino, el
  Coordinador SGC indica con qué versión entra (1 por defecto). Si el documento va en la
  versión 4, entra como versión 4. Solo se carga la versión vigente.
- **Marca de origen:** toda versión publicada por este camino queda como **«aprobación
  registrada fuera de la plataforma»**; las publicadas por trámite, como «aprobada en la
  plataforma». Todas las versiones que ya existen (en esta base y en una de `sgc-suaza`)
  nacen con la primera marca. La marca se ve en el detalle del panel, en los datos de control
  de la ficha y en el Listado Maestro (§15.5). Estas versiones no tienen acta ni firmas.
- **Descartar un borrador de carga** [Decisión de Claude]: hoy un borrador creado por error se
  queda para siempre. El Coordinador SGC puede descartarlo; pasa a `descartado` y conserva
  sus archivos.
- **Deshacer una carga** [Decisión de Claude]: al digitar 200 documentos habrá errores (un
  archivo equivocado, un número de versión o unos nombres mal escritos). Mientras la carga
  esté abierta, el Coordinador SGC puede deshacer la publicación de una versión marcada
  «fuera de la plataforma», con motivo: la versión pasa a `descartado`, conserva sus
  archivos, queda en la bitácora y deja libre su número. El documento queda sin versión
  vigente y **conserva su código**, listo para registrarlo de nuevo con los datos correctos.
  No aplica a versiones aprobadas en la plataforma.

### 13.3 Cerrar la carga

Una clave de configuración, **publicación directa**, activa por defecto. El Coordinador SGC
la apaga en la configuración documental (§15.4) cuando termina la carga inicial; el cambio
queda en la bitácora. Con la clave **apagada**, el servidor rechaza dar de alta, publicar y
deshacer por el camino directo, y el panel no muestra esos botones: todo documento nuevo y
todo cambio pasan por un trámite. Se puede volver a encender (por ejemplo, si aparece un
documento antiguo sin cargar), también auditado.

Un documento con un borrador de carga pendiente no admite que se acepte una solicitud sobre
él hasta que ese borrador se publique o se descarte. Un borrador heredado que esté sobre un
documento con versión vigente (posible en una base de `sgc-suaza`) no se puede publicar por
este camino: se descarta, y el cambio se pide por trámite.

### 13.4 Lo que queda para la Fase 20

La importación por lote (Excel con una fila por documento y carpeta de archivos nombrados por
código, con validación previa e informe) [Usuario]. La 13A deja el dato que esa herramienta
necesita: el número real de versión y la marca de origen.

## 14. Tareas, avisos y vencimientos

### 14.1 «Mis tareas»

`misTareas()` (`src/lib/tareas.ts`) deja de devolver una lista vacía. Se **calcula** del
estado de los trámites (spec maestro DC14), con el módulo `documentos`, el enlace a la página
del trámite y la fecha límite de la etapa:

| Tarea | Para quién |
|---|---|
| Dar el visto bueno a una solicitud | Los líderes del proceso propietario |
| Aceptar una solicitud | Todo `admin_sgc` |
| Elaborar, o ajustar tras una devolución | El elaborador |
| Revisar | El revisor |
| Aprobar un documento, o su eliminación | El aprobador |
| Publicar, o ejecutar una eliminación | Todo `admin_sgc` |

La pestaña «Por hacer» de la bandeja sale de la misma función: no hay dos cálculos.

### 14.2 Avisos en la campana

Cada transición crea sus avisos con `crearNotificacion`, **dentro de la misma transacción**
[Usuario, decisión 7]:

- al responsable de la etapa que empieza (o a todos los `admin_sgc`, o a los líderes del
  proceso, cuando la etapa es de ellos);
- al elaborador, cuando le devuelven;
- al solicitante, cuando su solicitud se acepta, se rechaza o se niega;
- a los participantes y a los líderes de los procesos del documento, cuando se publica, se
  elimina o se cancela;
- a quien entra y a quien sale, en una reasignación.

El aviso lleva el número de solicitud, el código y el título, y enlaza al trámite. Nunca lleva
contenido del documento. Nadie se avisa a sí mismo de lo que acaba de hacer.

### 14.3 Vencimientos y escalamiento, sin planificador

- Un paso está **vencido** cuando pasó su fecha límite. La bandeja y «Mis tareas» lo calculan
  al mostrarse, así que siempre están al día.
- Los **avisos** de vencimiento necesitan que algo los dispare. Hasta la Fase 16 lo hace una
  revisión que corre, como mucho cada diez minutos, cuando alguien con sesión carga una
  página del cascarón [Usuario, decisión 7]. Por cada paso vencido sin avisar, avisa al
  responsable; por cada paso con más de **3 días** de vencido sin escalar, avisa a su jefe
  (`supervisoresDe`: el jefe inmediato si está, o el superior del cargo) [Usuario, supuesto
  6; spec maestro DC22]. Los días de escalamiento son configurables.
- En los pasos que son de un grupo (visto bueno de los líderes; aceptación y publicación de
  los `admin_sgc`) el aviso va a cada miembro y el escalamiento a los jefes de cada uno, sin
  repetir destinatario. Si nadie tiene jefe, no se escala.
- **El jefe no gana acceso al trámite** [Decisión de Claude]. Su aviso dice qué paso, de qué
  solicitud, a cargo de quién y hace cuántos días venció, **sin el título del documento y
  sin enlace**: le basta para hablar con su subalterno y no revela nada de un borrador ni de
  un documento restringido.
- Cada aviso sale **una sola vez** por paso: el trámite guarda cuándo avisó y cuándo escaló
  la etapa en curso, y esas marcas se limpian al cambiar de etapa.
- La revisión nunca rompe la página que la disparó: si falla, lo deja en el registro del
  servidor y sigue. La Fase 16 cambia el disparador por el planificador sin tocar la regla.

## 15. Pantallas y navegación

Todas viven dentro del cascarón de la Fase 12 y usan sus componentes base (`EncabezadoPagina`,
`TablaDatos`, `Insignia`, `Boton`, `Campo`, `Dialogo`, `EstadoVacio`). Las maquetas fijan el
contenido; el diseño fino queda al constructor (§22).

### 15.1 Bandeja de trámites (`/tramites`)

Maqueta 1. Tres pestañas: **Por hacer** (las tareas de quien mira), **En curso** (los
trámites abiertos que puede ver) y **Cerrados** (publicados, eliminados, rechazados y
cancelados que puede ver). Columnas: solicitud, documento (código, título y qué versión o
«nuevo»), qué pide, etapa (con la ronda), responsable y vencimiento con insignia de texto: a
tiempo, vence hoy, vencido hace N días. El botón «Nueva solicitud» aparece con
`tramites.solicitar`.

La entrada **Trámites** va en el grupo Documentos de la barra lateral. La ven quienes tienen
`tramites.solicitar`, `tramites.gestionar` o `tramites.aprobar`, y cualquier usuario que
participe en algún trámite [Decisión de Claude: un elaborador con rol consulta necesita
llegar a su trámite, y los demás no necesitan una bandeja vacía].

### 15.2 Nueva solicitud (`/tramites/nueva`)

El formulario de §8.1. Con `?documento=<código>` llega con el documento elegido (botón
«Solicitar cambio» de la ficha).

### 15.3 Página del trámite (`/tramites/[id]`)

Maquetas 2 y 3. Una sola página, que muestra según la etapa y según quién la abre:

- **Encabezado:** código, título, versión en trámite, número de solicitud, qué pide, motivo,
  y la insignia de etapa con el día en que va.
- **Pasos:** las siete etapas (cinco en una eliminación), con las hechas, la actual y las
  pendientes. El estado se dice con texto, no solo con color.
- **La solicitud** y, en la etapa de aceptación, los bloques de §8.3.
- **Borrador:** archivos con su huella abreviada y el control de cambios; banda «EN TRÁMITE».
- **Lista de verificación** y **observaciones**, editables solo para quien corresponde.
- **Historial:** cada evento con fecha, hora, persona y qué hizo, incluidas las firmas.
- **Acciones:** solo las que la tabla de §7.2 permite a esa persona en esa etapa. Las que
  firman abren el diálogo de la maqueta 4, que muestra documento, versión y huella, y pide la
  clave y, si aplica, el código del segundo factor.

A 390 px la página queda en una columna y la bandeja en tarjetas.

### 15.4 Configuración documental

Una pantalla nueva del panel, con `tramites.gestionar`, que reúne:

- **Formato del código** (§8.4), con un ejemplo en vivo.
- **Plazos** en días de cada etapa, el de ajustes y los días de escalamiento (§7.3, §14.3).
- **Publicación directa:** encendida o apagada (§13.3), con una explicación de lo que cambia.
- **Lista de verificación:** crear, editar, ordenar, marcar crítico y activar o desactivar
  ítems (§9.2).

El campo «Patrón del código» sale de la pantalla «Textos del mapa»: lo reemplaza el formato.

En **Tipos de documento**, cada tipo gana dos campos: la **autoridad** (estratégico u
operativo, §6.4) y la **plantilla** (un documento vigente, opcional, §8.5).

### 15.5 Cambios en pantallas existentes

- **Ficha de documento (portal):** botón «Solicitar cambio» para quien puede pedir sobre ese
  documento; enlace «Acta de aprobación» si la versión vigente se aprobó en la plataforma, o
  la nota «Aprobación registrada fuera de la plataforma» si no; insignia «Acceso restringido»
  cuando aplica.
- **Gestión de documentos (panel):** en el detalle, cada versión dice su origen y enlaza a su
  acta y a su trámite; los botones del camino directo dependen de §13; aparecen «Deshacer carga» y «Descartar
  borrador».
- **Listado Maestro** (página y Excel): columna nueva **Aprobación**, con «En la plataforma»
  o «Fuera de la plataforma» [Usuario, decisión 7]. Las celdas del Excel siguen pasando por
  `neutralizarFormula`.
- **Inicio:** «Mis tareas» empieza a mostrar tareas (el componente ya existe).
- **Usuarios (panel):** el campo «Procesos que lidera» pasa a «Procesos» (§12).
- **Editar documento (panel):** el formulario separa los datos de control de los de
  catálogo según §8.6; el título solo se edita en los casos que esa sección permite.

## 16. Modelo de datos y migración 0004

Los nombres son provisionales; el plan fija columnas, índices y restricciones (§22). Siguen
las convenciones heredadas: `timestamptz`, claves foráneas con `restrict`, `CHECK` de estados
en la BD e índice por `proceso_id` en lo que se filtra por alcance.

### 16.1 Cambios a tablas existentes

| Tabla | Cambio |
|---|---|
| `tipos_documento` | `autoridad` (`estrategico` u `operativo`; por defecto `operativo`) y `plantilla_documento_id` (opcional, a `documentos`) |
| `documentos` | `nivel_acceso` (`general` o `restringido`; por defecto `general`) |
| `documento_versiones` | Origen de la aprobación (`plataforma` o `fuera`; por defecto `fuera`, que es lo cierto para todo lo heredado) y momento de publicación (nulo en lo heredado). El `CHECK` de `estado` admite además **`descartado`**. La unicidad de (`documento_id`, `numero`) pasa de restricción a **índice único parcial que excluye `descartado`** |
| `archivos` | El `CHECK` de `rol` admite dos roles de acta (aprobación y eliminación), con a lo sumo una de cada una por versión |
| `accesos` | El `CHECK` de `resultado` admite `firma_fallo` |
| `configuracion` | Claves nuevas: formato del código, siete plazos, días de escalamiento y publicación directa |

Por qué `descartado` y el índice parcial [Decisión de Claude]: la versión en trámite necesita
existir para colgarle archivos, y hoy toma su número al crearse. Si un trámite se cancela y
su versión conservara el número, la siguiente versión publicada dejaría un hueco (de la 2 a
la 4). Con `descartado` fuera de la unicidad, el número queda libre para el siguiente
trámite, las versiones publicadas son siempre consecutivas, y lo descartado se conserva como
historial. El índice «una sola vigente» y el `CHECK` `versiones_vigente_con_aprobacion` no
se tocan. Los datos heredados cumplen las restricciones nuevas sin transformación.

### 16.2 Tablas nuevas

| Tabla | Qué guarda |
|---|---|
| `tramites` | Una fila por solicitud: número, tipo, motivo, justificación, solicitante, proceso propietario (para el alcance), datos propuestos de una creación y título propuesto de una modificación (§8.6), documento y versión en trámite cuando existen, etapa, ronda, elaborador, revisor y aprobador, fecha límite de la etapa y sus marcas de aviso y escalamiento, y el motivo de cierre. **Índice único parcial: un solo trámite en etapa de trabajo por documento** |
| `tramite_eventos` | El historial: trámite, tipo de evento, persona, momento, ronda y un detalle (`jsonb`) con lo propio de cada evento (motivo, concepto, parecidos vistos, clasificación, plantilla, reasignación). **Solo inserción** |
| `firmas` | §10.3. **Solo inserción** |
| `tramite_observaciones` | §9.3: número dentro del trámite, ronda, origen (revisión o aprobación), texto, autor, respuesta, estado y quién y cuándo la respondió y la cerró |
| `tramite_verificaciones` | §9.2: respuesta de cada ítem por trámite y ronda, con el texto del ítem y su marca de crítico copiados |
| `lista_verificacion_items` | §9.2: texto, crítico, orden, activo |

`tramite_eventos` y `auditoria` no son lo mismo: la bitácora es el registro general de la
plataforma (quién hizo qué, para la vista de la Fase 18); el historial es el dato del que se
arman la página del trámite y el acta. Cada transición escribe en los dos.

La tabla `archivos` **no se generaliza en esta entrega** (spec maestro §5.5): todo archivo de
la 13A, incluida el acta, pertenece a una versión. El primer dueño distinto llega en la 13B
(evidencia de capacitación), y ahí se decide la forma.

### 16.3 Migración y roles

- Una migración nueva de Drizzle (`0004`), aditiva en tablas y columnas, con los cambios de
  restricción de §16.1 y los triggers de solo inserción de `firmas` y `tramite_eventos`
  (`sgc_impedir_modificacion()` ya existe desde la 0002).
- `asegurarRolApp` (`src/db/roles-bd.ts`) añade `firmas` y `tramite_eventos` a su `REVOKE
  UPDATE, DELETE`.
- `limpiarTodo` de las semillas añade las tablas nuevas a su `TRUNCATE`.
- En una base de `sgc-suaza`, la migración deja todos los tipos como operativos, todos los
  documentos como generales y todas las versiones como aprobadas fuera de la plataforma; el
  Coordinador SGC marca después los tipos estratégicos y fija el formato del código.

## 17. Seguridad

Riesgos del spec maestro §5.9 que toca esta entrega, y cómo se cubren:

| Riesgo | Cómo |
|---|---|
| 3. Aislamiento por alcance | La bandeja, la página del trámite y sus archivos aplican §6.5; la visibilidad de documentos aplica §12 desde un solo lugar. Tests que leen y escriben con cada rol, con un líder de otro proceso y con un participante fuera de su alcance (§19) |
| 4. Permisos solo en la interfaz | Toda transición pasa por el punto de entrada único de §7.2, que decide en el servidor. La interfaz solo oculta |
| 7 y 15. Validación y campos de más | Un esquema `zod` `.strict()` por acción; ninguna acción vuelca el formulario en un `UPDATE`. Las acciones heredadas de `src/app/admin/acciones.ts` que esta entrega modifica pasan a esquemas `zod` |
| 14. Identificadores predecibles | El número de trámite y el id de archivo no dan acceso a nada: cada petición se autoriza. Quien no puede ver recibe 404 |
| 20. Archivos | El borrador se sube por el handler existente, con su lista blanca, magic bytes, tope de 25 MB, nombre saneado y verificación de `Origin`; se le añade la autorización del elaborador (solo su trámite, solo en `elaboracion`). El acta la genera el servidor |

Además:

- **Firma con reautenticación** y bloqueo como en el ingreso (§10.2); límite de ritmo por
  usuario en las acciones del trámite.
- **Registros de solo inserción** en `firmas` y en el historial, por privilegios y por
  trigger (§10.3), con test.
- **Carreras:** transacción con la fila del trámite bloqueada y comprobación de etapa y ronda
  esperadas; la unicidad del trámite abierto por documento, del código y de la versión
  vigente las garantiza la BD.
- **Sin oráculos:** los errores de negocio no revelan si existe un documento restringido o
  un borrador. Los avisos con título y enlace solo llegan a quien puede ver el trámite; el
  de escalamiento al jefe va sin título ni enlace (§14.3).
- **Rutas:** toda página nueva llama su guard y todo handler nuevo usa `sesionDePeticion`,
  comprueba la autorización y, si escribe, `origenValido()`.
- **Sin `sql.raw` con entrada del usuario**, sin `dangerouslySetInnerHTML`: los textos
  (justificación, observaciones, conceptos) son texto plano y se pintan como texto.

## 18. Semillas

### 18.1 Semilla mínima (instalación nueva)

- **Tipos de documento y autoridad** [Usuario]:

  | Sigla | Tipo | Aprueba | Autoridad |
  |---|---|---|---|
  | PO | Política | Gerencia | estratégico |
  | MN | Manual | Gerencia | estratégico |
  | PL | Plan | Gerencia | estratégico |
  | CA | Caracterización | Gerencia | estratégico |
  | PR | Procedimiento | Coordinador SGC | operativo |
  | IN | Instructivo | Coordinador SGC | operativo |
  | PT | Protocolo | Coordinador SGC | operativo |
  | GU | Guía | Coordinador SGC | operativo |
  | FO | Formato | Coordinador SGC | operativo |
  | RG | Registro | Coordinador SGC | operativo |
  | MZ | Matriz | Coordinador SGC | operativo |

  «Formato» pasa de la sigla `FT` a `FO`. Formato, Registro y Matriz nacen como
  diligenciables [Decisión de Claude].
- **Formato del código:** `{PROCESO}-{TIPO}-{NN}`.
- **Plazos** de §7.3, escalamiento a 3 días y publicación directa encendida.
- **Lista de verificación inicial:** los ocho ítems de la maqueta 3, sacados del paso 5 del
  procedimiento, con los tres primeros marcados como críticos. El usuario no entregó el
  SGC-FO-03 real; el Coordinador SGC los ajusta en la configuración.
  1. Usa la plantilla vigente de su tipo.
  2. Código, versión y fecha en el encabezado.
  3. Tiene todas las secciones obligatorias.
  4. Es coherente con los demás documentos del SGC.
  5. Cumple los requisitos de ISO 9001:2015 que le aplican.
  6. Es aplicable a una institución de primer nivel.
  7. Cita la normativa vigente que le aplica.
  8. Define los registros que genera y su archivo.

### 18.2 Semilla demo

- **Adopta la convención del hospital** [Decisión de Claude]: los códigos pasan de
  `TIPO-PROCESO-NNN` a `PROCESO-TIPO-NN`, con consecutivo por proceso y tipo; el proceso
  «Sistema de Gestión de Calidad» cambia su sigla provisional `CAL` por `SGC` (la que usa el
  procedimiento del hospital; las demás siglas siguen siendo provisionales, D18). El plan
  lleva la tabla de equivalencias y el barrido de los tests que citan códigos de la demo
  (137 citas en 18 archivos, medidas el 2026-11-05).
- Los documentos que ya trae quedan como aprobados fuera de la plataforma, salvo los que se
  siembran por trámite.
- Añade lo necesario para la demostración de §20 con los usuarios demo actuales:
  - dos documentos que sirven de **plantilla** (para procedimientos y para formatos),
    enlazados desde sus tipos;
  - al menos un documento **restringido** que `consulta` no ve y `lider.gth` sí;
  - **trámites en distintas etapas**, como los de la maqueta 1: uno por aceptar (creación),
    uno en revisión en segunda ronda con observaciones, uno en publicación con el plazo
    vencido, uno esperando visto bueno y uno **publicado por trámite**, con sus cuatro firmas
    y su acta.
- **La base de desarrollo se vuelve a sembrar** en esta entrega (cambian los códigos). Se
  hace en una tarea señalada del plan y se le avisa antes al usuario, que ya perdió datos de
  prueba con la resiembra de la Fase 12.

## 19. Pruebas

- **Reglas puras, sin BD:** la tabla de transiciones completa (cada etapa, acción y actor,
  permitido o no); las reglas S1 a S3 y los candidatos de §6.4; el formato del código
  (generar, validar, derivar el patrón, siguiente consecutivo con huecos y al pasar de 99);
  la fecha límite en la zona de la instalación; la regla de visibilidad de §12 como función
  de rol, marca de historial, procesos asignados, nivel de acceso, estado y participación.
- **Con la BD de desarrollo, conectados como `sgc_app`:**
  - el recorrido completo de crear, de modificar (con una devolución del revisor y otra del
    aprobador) y de eliminar;
  - archivo congelado: subir o borrar fuera de `elaboracion` se rechaza;
  - firma: clave incorrecta no transiciona, suma al bloqueo, queda en accesos, y al quinto
    fallo cierra la sesión; con segundo factor exige el código; la firma doble escribe dos
    filas;
  - publicación: columnas heredadas copiadas, anterior obsoleta, una sola vigente, origen
    «plataforma», huella en disco distinta impide publicar;
  - cancelar libera el número de versión y la siguiente versión publicada es consecutiva;
  - un solo trámite abierto por documento; código único bajo aceptaciones simultáneas;
  - publicación directa: número real de versión y marca de origen; no publica sobre un
    documento que ya tiene versión vigente; deshacer una carga libera el número y conserva el
    código; y con la clave apagada el servidor rechaza cada acción del camino directo;
  - datos del documento (§8.6): un título nuevo no se ve en el portal hasta publicar; en una
    modificación no cambian el código, el tipo ni el proceso propietario;
  - `firmas` y el historial rechazan `UPDATE` y `DELETE`, también al dueño del esquema
    (`tests/privilegios-bd.test.ts`);
  - vencimientos con reloj inyectado: un aviso por paso, un escalamiento por paso, ninguno
    repetido.
- **Por rol** (spec maestro §5.9), para el trámite, sus archivos y los documentos
  restringidos: cada uno de los cinco roles, un líder de otro proceso, un participante que
  está fuera de su alcance y un usuario con la marca individual de historial. Quien no puede
  ver recibe «no encontrado».
- **Estructurales:** `tests/paginas-sesion.test.ts` cubre las páginas nuevas;
  `tests/acciones-permisos.test.ts` se amplía para exigir que toda acción del trámite entre
  por el punto único de §7.2; los tests de colores fijos, textos fijos y `<main>` siguen
  pasando. Los tests heredados que afirman que solo se sirven vigentes no se borran. Los que
  hoy prueban la regla de negocio 1 publicando directamente sobre una versión vigente
  pasan a probarla con la publicación por trámite: la garantía se conserva.
- **Salidas:** el acta se genera y contiene el código, la versión, los cuatro nombres y las
  huellas; la marca de agua lleva el nombre de quien descarga y la fecha en la zona de la
  instalación; el Excel del Listado Maestro trae la columna nueva.
- **Datos de prueba** [Decisión de Claude]: las funciones del trámite aceptan la transacción
  en la que deben correr (como ya hace `crearNotificacion`), para que los tests del flujo
  corran dentro de una transacción que se revierte y no dejen trámites, firmas ni documentos
  en la base de desarrollo. Lo que deba confirmarse (pruebas de handlers) usa nombres únicos
  por corrida y queda hasta la siguiente siembra, como los usuarios `zz_*`.

## 20. Demostración (criterios de cierre)

Con la demo sembrada y los usuarios `admin`, `gerente`, `control.interno`, `lider.gth`,
`lider.cex` y `consulta`:

1. `lider.gth` pide modificar un procedimiento de su proceso, con motivo y justificación; el
   visto bueno queda dado. Intenta pedir sobre un documento de otro proceso y no puede.
2. `lider.cex` pide crear un formato. El Coordinador SGC ve documentos parecidos, confirma
   que no es un duplicado, recibe el código siguiente de ese proceso y ese tipo, y designa
   responsables.
3. El elaborador descarga la plantilla, sube el borrador, escribe el control de cambios y
   envía a revisión con su clave.
4. El revisor diligencia la lista de verificación, deja dos observaciones y devuelve. El
   elaborador responde y reenvía. El revisor cierra las observaciones y da concepto favorable
   con su clave. Con un ítem crítico en «no cumple» el sistema no deja pasar.
5. En un documento operativo, el Coordinador SGC aprueba y publica en un solo acto. La
   versión anterior queda obsoleta, el Listado Maestro muestra la nueva como aprobada en la
   plataforma y el acta en PDF trae las cuatro firmas con la misma huella.
6. En un documento estratégico aprueba `gerente` con su clave y publica el Coordinador SGC.
   Cuando el Coordinador SGC es quien elabora un documento operativo, el sistema exige otro
   revisor y manda la aprobación a `gerente`.
7. Cinco claves erradas al firmar bloquean la cuenta, cierran la sesión y quedan en el
   registro de accesos.
8. `consulta` ve la versión nueva y no ve el trámite, el borrador ni la versión obsoleta;
   `control.interno` ve la obsoleta con su banda y el trámite cerrado. El PDF que descarga
   `consulta` lleva su nombre en la marca de agua.
9. Un documento restringido: `consulta` no lo encuentra en el proceso, en la búsqueda, con
   `Ctrl K` ni pidiendo el archivo por su dirección; `lider.gth` sí.
10. Se elimina un documento por trámite, con aprobación y acta; desaparece del portal y queda
    anulado en el panel.
11. El Coordinador SGC registra un documento aprobado en papel en su versión 4; entra vigente
    y marcado «fuera de la plataforma». Registra otro con un archivo equivocado, deshace esa
    carga y lo registra de nuevo con el mismo código. Intenta publicar directamente una
    versión sobre un documento vigente y el sistema lo remite al trámite. Apaga la
    publicación directa y los botones del camino directo desaparecen.
12. La bandeja muestra un paso vencido; el responsable recibe el aviso en la campana y «Mis
    tareas» lista lo pendiente de cada usuario. Se cancela un trámite y se reasigna otro.
13. `npm run lint`, `npm test`, `npm run build` y el CI en verde; la imagen del compose de
    desarrollo arranca y aplica la migración 0004.

## 21. Manual de usuario

Un capítulo nuevo, **«Documentos: solicitar, elaborar, revisar, aprobar y publicar»**, con el
formato de los capítulos 1 a 4 y las cadenas de interfaz copiadas del código: pedir un
cambio; el visto bueno; aceptar una solicitud; elaborar y responder observaciones; revisar
con la lista de verificación; firmar; aprobar y publicar; el acta; eliminar un documento;
cancelar y reasignar; registrar documentos ya aprobados y cerrar la carga; la configuración
documental y los tipos. Se corrige en los capítulos existentes lo que esta entrega cambie
(por ejemplo, el «Patrón del código» de «Textos del mapa»).

## 22. Lo que se deja al constructor

- Los nombres definitivos de tablas, columnas, índices y valores técnicos de etapa, evento y
  firma, y la forma exacta de guardar las respuestas de la lista de verificación.
- La organización del código: módulos de reglas puras, consultas, acciones y handlers, y si
  la autorización del elaborador entra en el handler de subida existente o en uno propio.
- Los umbrales y la consulta de documentos parecidos.
- El diseño de cada pantalla dentro del sistema visual de la Fase 12, y todos los textos de
  interfaz, avisos, estados vacíos y errores.
- La diagramación del acta y de la leyenda de la marca de agua.
- Dónde se engancha la revisión de vencimientos y cómo se limita a una vez cada diez minutos.
- El límite de ritmo de las acciones del trámite.
- El orden de las tareas, los tests concretos y los datos exactos de la demo.

## 23. Decisiones de Claude en este documento (para revisar de una vez)

| # | Decisión | Dónde | Por qué | Base |
|---|---|---|---|---|
| F13A-DC1 | En una eliminación, quien la pide no la aprueba (S3); si la pide un `admin_sgc`, aprueba Gerencia | §6.3, §6.4 | Sin elaborador, el Coordinador SGC podría pedir, aprobar y ejecutar solo una baja. Sigue la misma idea del punto 2 del usuario: lo que nace del Coordinador SGC lo aprueba Gerencia | Práctica (separación de funciones) |
| F13A-DC2 | El visto bueno se omite si el proceso no tiene líder | §8.2 | No trabar el trámite; queda escrito en el historial | Práctica |
| F13A-DC3 | El solicitante puede retirar su solicitud antes de la aceptación | §7.2 | Corregir un error propio sin ocupar al Coordinador SGC | Práctica |
| F13A-DC4 | Una creación duplicada se convierte en modificación dentro del mismo trámite, solo si el documento existente es del mismo proceso; si es de otro, se rechaza con la referencia | §8.3 | Es la «decisión de actualización del existente» del PC-02, sin pedir de nuevo y sin arrastrar el visto bueno de otro líder | Procedimiento del hospital, PC-02 |
| F13A-DC5 | El plazo de ajustes tras una devolución es el de revisión (5 días) | §7.3 | Ajustar es más corto que elaborar; configurable | Práctica |
| F13A-DC6 | El código, el tipo, el proceso propietario y el título son datos de control: cambian solo por trámite (el título se aplica al publicar) y quedan fijos desde la etapa de aprobación; en una modificación no cambian código, tipo ni propietario. La descripción, las palabras clave, los otros procesos, los relacionados y el nivel de acceso son datos de catálogo, editables siempre por quien administra | §8.6 | Un trámite en curso no debe cambiar lo que se ve de la versión vigente; lo que se aprueba es lo que se publica | ISO 7.5.3.2 c) |
| F13A-DC7 | El aprobador puede negar una eliminación | §7.2 | Una eliminación no tiene nada que devolver a elaboración | Práctica |
| F13A-DC8 | Los fallos de firma cuentan para el bloqueo de la cuenta, quedan en accesos como `firma_fallo` y cierran la sesión al bloquear | §10.2 | Impide adivinar la clave desde una sesión ajena abierta | Práctica (seguridad); spec maestro §5.1 |
| F13A-DC9 | Un código de recuperación también sirve para firmar | §10.2 | Igual que en el ingreso; quien perdió el teléfono no queda sin firmar | Práctica |
| F13A-DC10 | El historial del trámite es de solo inserción, como `firmas` | §10.3 | Es la evidencia de cada punto de control | ISO 7.5.3.1 b) |
| F13A-DC11 | Al publicar se vuelve a calcular la huella del archivo en disco | §10.4 | Comprobación única en el momento de publicar; no es la verificación periódica rechazada | ISO 7.5.3.1 b) |
| F13A-DC12 | El acta la ve quien ve la versión, sale sin marca de agua y se vuelve a generar si falta | §11.2 | Es el registro de la aprobación; sus datos ya no cambian | ISO 7.5.3.1 a) |
| F13A-DC13 | El panel deja de mostrar borradores a Control Interno y a la marca individual; el Listado Maestro «todos» deja de listar documentos que solo tienen borrador | §12 | El spec maestro §5.3 reserva lo que está en trámite a participantes, Admin SGC y líder | Spec maestro §5.3 |
| F13A-DC14 | La regla de documento restringido vale también para quien tiene la marca individual de historial | §12 | La marca da historial, no acceso a lo restringido | ISO 7.5.3.1 b) |
| F13A-DC15 | Control Interno y la marca individual ven en solo lectura los trámites cerrados por publicación o eliminación | §6.5 | Es el historial de cómo se aprobó cada versión | ISO 7.5.3.2 c) |
| F13A-DC16 | Estado `descartado` y unicidad parcial del número de versión | §16.1 | Versiones publicadas siempre consecutivas, con lo cancelado conservado | ISO 7.5.3.2 c) |
| F13A-DC17 | Descartar un borrador de carga | §13.2 | Hoy un borrador creado por error no tiene salida y bloquearía un trámite | Práctica |
| F13A-DC18 | El camino directo solo da de alta; la anulación directa desaparece; con la carga abierta se puede **deshacer una carga** (la versión pasa a descartada y el documento conserva su código para registrarlo bien) | §13.1, §13.2 | Corregir errores de digitación sin quemar el código oficial y sin dejar una puerta para saltarse el trámite | Spec maestro DC26 y adición 7 |
| F13A-DC19 | La entrada «Trámites» se ve por permiso o por participación | §15.1 | Un elaborador con rol consulta debe llegar a su trámite | Práctica |
| F13A-DC20 | `archivos` no se generaliza hasta la 13B | §16.2 | En la 13A todo archivo pertenece a una versión | Práctica |
| F13A-DC21 | La demo adopta la convención del hospital (`CAL` → `SGC`, `FT` → `FO`, códigos recodificados) y la base de desarrollo se vuelve a sembrar | §18.2 | La demo debe verse como el hospital; el código sugerido necesita códigos del mismo formato | Práctica |
| F13A-DC22 | Formato, Registro y Matriz nacen diligenciables | §18.1 | Son los tipos que se llenan; editable | Práctica |
| F13A-DC23 | Los tests del flujo corren en transacciones que se revierten | §19 | No acumular trámites y firmas imborrables en la base de desarrollo | Práctica |
| F13A-DC24 | `tramites.participar` para los cinco roles, y un permiso de matriz en cada acción del trámite | §6.2 | La regla de negocio 4 pide permiso de matriz en toda escritura; el elaborador puede ser cualquier funcionario | `AGENTS.md`, regla 4 |
| F13A-DC25 | Los borradores intermedios no se conservan; de cada ronda quedan la huella firmada, la lista y las observaciones | §9.1 | El papel tampoco guarda los borradores; conservarlos obliga a cambiar el índice de un principal por versión | Práctica |
| F13A-DC26 | Los archivos de un trámite solo se sirven por su ruta mientras está abierto; después rigen las reglas del estado de la versión | §6.5 | Un participante sin permiso de historial no debe conservar un camino a una versión que dejó de estar vigente | `AGENTS.md`, regla 3 |
| F13A-DC27 | El aviso de escalamiento al jefe va sin título ni enlace, y el jefe no gana acceso al trámite | §14.3 | Avisar sin revelar un borrador ni un documento restringido | ISO 7.5.3.1 b) |
| F13A-DC28 | En el formulario de usuarios, «Procesos que lidera» pasa a «Procesos» y vale para cualquier rol | §12 | Es el mecanismo del spec maestro para los documentos restringidos | Spec maestro §5.3 |

## 24. Riesgos

| Riesgo | Mitigación |
|---|---|
| La entrega es grande (unas 18 tareas) | Orden con puntos de control en navegador; nada de la 13B ni de la 13C entra; las reglas puras y la migración van primero |
| Cambiar la visibilidad rompe algo que hoy funciona | Una sola regla en un solo lugar; tests por rol antes de tocar las consultas; los tests heredados de «solo vigentes» siguen pasando |
| Recodificar la demo rompe tests | Tarea propia al principio, con tabla de equivalencias y la suite completa en verde antes de construir encima |
| Cuatro firmas estorban | Acto doble para el Coordinador SGC; el diálogo dice qué se firma; el bloqueo es el mismo del ingreso y lo levanta el Admin SGC como hoy |
| Dos pestañas o un doble envío duplican una transición | Fila del trámite bloqueada y comprobación de etapa y ronda esperadas |
| Una instalación con un solo Coordinador SGC | S2 exige otro revisor cuando él elabora: un líder designado. La pantalla lo dice; la advertencia de «dos Admin SGC» de la Fase 11 sigue |
| Tildes, eñes o nombres largos en el PDF del acta | Prueba con los textos reales de la demo |
| La migración sobre una base heredada | Las restricciones nuevas se prueban contra los datos actuales; la Fase 20 la ensaya con un respaldo de `sgc-suaza` |
| Sin planificador, un aviso de vencimiento espera a que alguien entre | La bandeja y «Mis tareas» se calculan al mostrarse; el planificador llega en la Fase 16 |

## Apéndice A — Procedimiento del hospital y su evidencia en el sistema

### A.1 El procedimiento, como lo entregó el usuario (2026-11-05)

| N° | Fase | Actividad | Responsable | Documento o registro | Punto de control | Criterio de aceptación |
|---|---|---|---|---|---|---|
| 1 | Planear | Identificar la necesidad de crear, modificar o eliminar un documento del SGC por cambio normativo, mejora de proceso, no conformidad o solicitud del personal. | Líder de Proceso / Coordinador SGC | SGC-FO-02 Solicitud de creación/modificación/eliminación | PC-01: Justificación documentada | Solicitud diligenciada, con justificación clara, fecha, firma y aprobación del líder del proceso. |
| 2 | Planear | Revisar el listado maestro de documentos vigentes para verificar existencia de documento relacionado y evitar duplicidad. | Coordinador SGC | SGC-RG-01 (o SGC-MZ-01) Listado maestro de documentos | PC-02: No duplicidad | Evidencia de consulta al listado maestro y confirmación de no duplicidad (o decisión de actualización del existente). |
| 3 | Planear | Definir estructura, contenido y responsables según plantilla del SGC. Asignar código correlativo según clasificación. | Coordinador SGC / Líder de Proceso | Plantillas SGC vigentes (procedimiento/instructivo/formato) | PC-03: Plantilla y codificación oficial | Documento clasificado correctamente, código único asignado, versión definida, responsable identificado y plantilla vigente utilizada. |
| 4 | Hacer | Elaborar el borrador del documento con objetivo, alcance, responsables, definiciones, actividades y registros asociados. | Líder de Proceso / Responsable asignado | Borrador del documento | PC-04: Completitud de secciones | Borrador contiene todas las secciones obligatorias, identificación (código, versión, fecha) y control de cambios inicial. |
| 5 | Hacer | Someter el borrador a revisión técnica y de calidad (coherencia con SGC, requisitos ISO 9001:2015, codificación, aplicabilidad a primer nivel, archivo y normativa). | Coordinador SGC | SGC-FO-03 Lista de verificación documental / Control de cambios | PC-05: Revisión técnica y de calidad | Lista de verificación diligenciada; no hay hallazgos críticos; se registran observaciones y responsables de ajuste. |
| 6 | Hacer | Ajustar el documento según observaciones. Si hay cambios sustanciales, repetir revisión (paso 5). | Líder de Proceso / Responsable asignado | Documento ajustado + Control de cambios | PC-06: Cierre de observaciones | Observaciones atendidas y cerradas con evidencia en control de cambios/lista de verificación; si hubo cambios sustanciales, existe nueva revisión registrada. |
| 7 | Hacer | Aprobar formalmente el documento según autoridad: operativos (Coordinador SGC) y estratégicos (Gerencia). | Coordinador SGC / Gerente | Documento con firmas / Acta / Control de cambios aprobado | PC-07: Aprobación por autoridad competente | Aprobación formal registrada (firma/acta); se define fecha de entrada en vigencia y estado «Vigente». |
| 8 | Hacer | Actualizar el listado maestro con código, título, versión, fecha de emisión y ubicación. Retirar/identificar obsoleto si aplica. | Coordinador SGC | SGC-RG-01 (o SGC-MZ-01) Listado maestro actualizado | PC-08: Maestro actualizado y obsoleto controlado | Listado maestro actualizado; documento obsoleto identificado como «No vigente/Obsoleto», retirado del punto de uso y del repositorio de vigentes. |
| 9 | Hacer | Distribuir copias controladas a puntos de uso (físicas con sello «COPIA CONTROLADA» o digitales en carpeta oficial). Comunicar cambios al personal y capacitar si aplica. | Coordinador SGC / Auxiliar Administrativo / Líder de Proceso | SGC-RG-02 Registro de distribución; evidencias de socialización/capacitación | PC-09: Trazabilidad de distribución y divulgación | Registro de distribución completo (quién, dónde, qué versión, fecha y firma/confirmación); comunicación enviada y evidencia de socialización cuando aplique. |
| 10 | Verificar | Verificar en puntos de uso control de versiones y disponibilidad de documentos vigentes (físicos/digitales). | Coordinador SGC | Listas de chequeo; reportes de hallazgos | PC-10: Conformidad en puntos de uso | Resultado de verificación documentado; ≥ 95 % de puntos conformes; sin documentos no controlados o con plan de corrección inmediato. |
| 11 | Verificar | Controlar vigencia de documentos externos aplicables (resoluciones, guías, manuales de equipos) y actualizar matriz. | Coordinador SGC + Responsables técnicos | SGC-MZ-03 Matriz de documentos externos | PC-11: Control de documentos externos | Matriz actualizada; fuentes oficiales verificadas; versión/fecha vigente; evidencias de actualización y divulgación cuando impacta procesos. |
| 12 | Actuar | Implementar acciones correctivas cuando se detecten no conformidades en control documental (obsoletos en uso, pérdida de registros, incumplimiento de distribución, fallas de acceso/archivo). | Coordinador SGC / Líder de Proceso | SGC-RG-05 Plan de acciones correctivas y preventivas / Plan de mejora | PC-12: Cierre y eficacia de acciones | Acciones implementadas en plazo; cierre documentado; verificación de eficacia realizada (no reincidencia / mejora en verificación). |
| 13 | Actuar | Realizar revisión anual de este procedimiento y de los documentos del SGC para identificar oportunidades de mejora, actualizar por cambios normativos o ajustar por lecciones aprendidas. | Coordinador SGC con apoyo de líderes de proceso | SGC-RG-06 Acta/Informe de revisión anual de documentos del SGC (por crear); insumo para Revisión por la Dirección, cuando aplique | PC-13: Revisión anual y actualización ejecutada | Revisión anual documentada en el registro por crear; decisiones de actualización con responsables y fechas; evidencia de ejecución (documentos actualizados, publicados y divulgados). |

Dos detalles del texto que el hospital debe ajustar por su cuenta: el listado maestro aparece
con dos códigos (SGC-RG-01 o SGC-MZ-01), y la «carpeta oficial» de copias digitales del paso 9
pasa a ser la plataforma (§2, punto 8).

### A.2 Evidencia de cada punto de control

| Punto de control | Evidencia en el sistema | Entrega |
|---|---|---|
| PC-01 Justificación documentada | Solicitud numerada con solicitante, tipo, motivo, justificación y fecha; visto bueno del líder con usuario y hora (§8.1, §8.2) | 13A |
| PC-02 No duplicidad | Documentos parecidos que el sistema mostró y la decisión del Coordinador SGC, en el evento de aceptación (§8.3) | 13A |
| PC-03 Plantilla y codificación oficial | Tipo, código generado con el formato oficial, versión, responsables designados y plantilla vigente, en el evento de aceptación (§8.3 a §8.5) | 13A |
| PC-04 Completitud de secciones | Borrador con su huella, control de cambios y firma Elaboró; ítems de la lista de verificación sobre secciones e identificación (§9.1, §9.2) | 13A |
| PC-05 Revisión técnica y de calidad | Respuestas de la lista por ronda, observaciones numeradas con autor y fecha, bloqueo por ítem crítico y firma Revisó (§9.2, §9.3) | 13A |
| PC-06 Cierre de observaciones | Respuesta del elaborador y cierre del revisor en cada observación; cada devolución es una ronda registrada (§9.3) | 13A |
| PC-07 Aprobación por autoridad competente | Firma Aprobó de la autoridad del tipo, firma Publicó, fecha de publicación como entrada en vigencia y acta en PDF (§10, §11) | 13A |
| PC-08 Maestro actualizado y obsoleto controlado | Publicación en una transacción: la anterior queda obsoleta, con su banda y fuera del portal; el Listado Maestro sale de los datos (§11.1). El retiro físico del punto de uso es de la 13B | 13A y 13B |
| PC-09 Trazabilidad de distribución y divulgación | Copias controladas con recibido, listas de distribución, acuses y evidencia de capacitación | 13B |
| PC-10 Conformidad en puntos de uso | Verificación de puntos de uso con porcentaje de conformidad | 13B |
| PC-11 Control de documentos externos | Documentos externos y normograma con verificación de vigencia | 13C |
| PC-12 Cierre y eficacia de acciones | Motor de acciones | Fase 15 |
| PC-13 Revisión anual y actualización ejecutada | Revisión anual con su informe | 13C |
