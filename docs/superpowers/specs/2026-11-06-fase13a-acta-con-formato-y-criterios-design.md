# Fase 13A, adiciones antes de fusionar: acta con el formato de la entidad y criterios que no cumplen

**Estado:** diseño para aprobación del usuario. **Rama:** `fase-13a-flujo-documental`, sobre `e7a31d2`.

Complementa `docs/superpowers/specs/2026-11-05-fase13a-flujo-documental-design.md` («el spec de la 13A»). Donde difieran, manda este documento. Cambia en concreto: §9.2 (condiciones del concepto favorable), §10 (aprobar), §11.2 (acta), y las decisiones F13A-DC12 y F13A-R36.

## 1. Por qué

Al probar la fase, el usuario pidió tres cosas antes de fusionar:

1. **El acta debe salir en un formato de la entidad.** Hoy es un PDF con diseño fijo que solo toma el nombre de la entidad. Un registro del SGC debe llevar la identificación de un documento controlado.
2. **Un criterio que no cumple no puede pasar en silencio.** Hoy un ítem no crítico en «No cumple» permite el concepto favorable sin nota, sin aviso, y sin rastro en el acta. Con eso se debilita la evidencia del PC-05 y del PC-07.
3. **Quien participó en un trámite no debe perder el acceso a su acta.** Hoy, cuando la versión deja de estar vigente, el acta sale de su alcance.

## 2. Lo que decidió el usuario

| # | Decisión |
|---|---|
| U1 | Opción 1A: el formato se usa como **membrete PDF** de un documento controlado del SGC. El sistema imprime el acta en su espacio libre |
| U2 | Camino 1: **no se llena** el SGC-FO-015. Se crea un formato propio a partir de él: mismo encabezado y pie, otro título, otro código, cuerpo en blanco |
| U3 | **Un solo formato**, con título neutro, para el acta de aprobación y la de eliminación |
| U4 | Opción 2A: un criterio no crítico en «No cumple» no bloquea, pero se advierte y deja constancia. El crítico sigue bloqueando sin excepción |
| U5 | El **aprobador también confirma** expresamente, no solo ve el aviso |
| U6 | El acta se abre a **quien ve el trámite cerrado** (sustituye F13A-DC12 y F13A-R36) |
| U7 | El acta imprime **cada criterio con su nota**, y el campo advierte que será visible para toda la entidad |

Base: ISO 9001:2015 7.5.2 a) y c), 7.5.3.1 a), 7.5.3.2 c); PC-05 y PC-07 del procedimiento del hospital.

## 3. Alcance

**Entra:** las tres adiciones, con su configuración, su manual, sus pruebas y la semilla demo.

**No entra:**

- Llenar casillas de un formato, o usar un formato de varias páginas.
- Convertir Word a PDF en el servidor: exige LibreOffice o Chromium, prohibidos por el piso de despliegue.
- Un formato por tipo de documento.
- Cambiar el aspecto de las actas ya generadas.
- Reemitir un acta perdida tras un cambio del generador: sigue en la deuda técnica.

**No debe pasar:**

- Que falte el formato o falle y una publicación se bloquee o se deshaga.
- Que un criterio aceptado desaparezca de la evidencia.
- Que un archivo real de la entidad (nombres, firmas, NIT) entre al repositorio. El Word y el PDF del hospital están en la raíz de la carpeta, pero excluidos de git en `.git/info/exclude` [Decisión de Claude].

## 4. Formato del acta

### 4.1 Cómo llega el formato al sistema

1. **Preparación, fuera del sistema.** Se prepara en Word una copia del SGC-FO-015 con el cuerpo en blanco, el título «ACTA DE CONTROL DOCUMENTAL» y sin la casilla de número de página. Se guarda como PDF de **una página, tamaño carta**.
2. **Registro.** Se registra como documento del SGC por el camino normal: «Registrar documento ya aprobado» o un trámite. Así queda en el Listado Maestro, con versiones y control de cambios.
3. **Selección.** En **Configuración documental**, sección nueva **Formato del acta**: lista de documentos vigentes, **Espacio del encabezado** y **Espacio del pie** en centímetros, y **Ver acta de ejemplo**.

### 4.2 Configuración

Tres claves nuevas en `configuracion`, sin migración, leídas y guardadas por `obtenerConfigDocumental` y `guardarConfigDocumental`, que pasan de diez a trece claves:

| Clave | Valor | Por defecto |
|---|---|---|
| `formato_acta_documento_id` | id del documento, o vacío | Sin formato |
| `formato_acta_margen_superior_cm` | Decimal, de 0 a 12 | 5,5 |
| `formato_acta_margen_inferior_cm` | Decimal, de 0 a 12 | 3,5 |

Los dos valores por defecto salen de medir el formato real del hospital en Word: el cuerpo empieza a 5,3 cm del borde superior y termina a unos 3,2 cm del inferior. La suma de los dos márgenes no puede pasar de 16 cm.

Al guardar con un documento elegido, el servidor exige, con mensaje propio para cada caso:

- que tenga versión vigente;
- que sea de acceso general: el acta la ven personas sin acceso a un restringido;
- que su archivo principal sea PDF y se pueda leer;
- que tenga una sola página;
- que sea tamaño carta, con tolerancia de 3 puntos.

La lista ofrece los documentos vigentes de acceso general con principal PDF. El cambio queda en `editar_config_documental`, con el antes y el después, como las demás claves. El permiso es `tramites.gestionar`.

### 4.3 Qué versión usa cada acta

- `congelarDatosActa` añade a `detalle.acta` la clave `formato`: `{ archivoId, hash, codigo, version, margenSuperiorCm, margenInferiorCm }`, o `null`.
- Toma la versión **vigente en la transacción del cierre**. Si el formato se publica con una versión nueva, las actas siguientes la usan y las anteriores no cambian.
- Si en ese momento el documento no tiene versión vigente o ya no es de acceso general, se congela `formato: null` y el acta sale con el diseño básico. `editarCatalogo` no se bloquea por esto [Decisión de Claude: esa condición solo puede resolverse al congelar, para que el acta siga siendo determinista].
- Un `detalle.acta` anterior a este cambio no trae la clave y se trata como `null`.

### 4.4 Cómo se genera

`generarActa(datos, membrete?: Uint8Array | null)`, en `src/lib/acta.ts`, sigue siendo una función pura y determinista.

**Con membrete:**

- Cada página lleva primero el PDF del formato, con `embedPdf` y `drawPage`, escalado a la hoja de 612 por 792 puntos.
- El texto usa el espacio entre los dos márgenes. Los márgenes izquierdo y derecho siguen siendo los actuales.
- Arriba va «Acta de aprobación documental» o «Acta de eliminación documental». El nombre de la entidad no se repite: ya está en el encabezado.
- Las dos líneas de pie (base legal, «Página X de Y», generación) quedan dentro del cuerpo, encima del margen inferior.
- Si el texto no cabe, sigue en otra hoja con el mismo membrete.

**Sin membrete:** para los mismos datos, el PDF debe salir **idéntico byte a byte** al de hoy. Es la garantía de `asegurarActa` al regenerar.

**Si algo falla con el formato**, `reunirDatosActa` lee el archivo por `archivoId` y compara `hash`:

| Situación | Qué pasa |
|---|---|
| El archivo falta o su huella no coincide | La generación falla como hoy: la publicación se sostiene, queda una fila `acta_no_regenerable` en la bitácora, y el enlace reintenta. Nunca se usa otro archivo |
| El archivo está bien pero no sirve (dos páginas, otro tamaño, ilegible) | Sale el diseño básico, sin error para el usuario, y se registra con `console.error`. Es determinista: el archivo no cambia, así que el resultado tampoco |

La comprobación de §4.2 solo corre al guardar, y una versión nueva del formato podría no cumplir. Por eso la sección **Formato del acta** revisa al cargarse el documento elegido, incluida la lectura de su archivo y su huella, y avisa [Decisión de Claude]:

- Sin versión vigente, restringido, o un archivo que no sirve: «Las actas saldrán con el diseño básico».
- Archivo perdido o con otra huella: «No se podrán generar actas hasta restaurar el archivo del formato».

### 4.5 Ver acta de ejemplo

- `GET /admin/api/acta-ejemplo`, con `sesionDePeticion`, y `puede(sesion, "tramites.gestionar")`: 401 sin sesión, 403 sin permiso. Con el límite de ritmo de la ruta del acta.
- Usa lo **guardado**: primero se guarda, después se mira.
- Datos ficticios, con texto suficiente para dos páginas y el bloque de criterios. Cada página dice «EJEMPLO, SIN VALOR». No se guarda ni se audita, porque no escribe nada.
- Es lectura, y responde con `no-store` e `inline`.

## 5. Criterios que no cumplen

**Regla.** Un ítem con `resultado = 'no_cumple'` en la ronda en curso:

- crítico: bloquea con «Hay un ítem crítico que no cumple». Cuenta como crítico si lo marca la fila guardada **o** el ítem en la configuración actual, para que uno vuelto crítico durante la ronda no pase como no crítico [Decisión de Claude: cumple U4 y retira esa deuda de `CONTEXT.md`]. Esta comprobación solo corre en `validarConcepto`;
- no crítico: exige nota y confirmación del revisor y del aprobador.

### 5.1 Nota

- Se puede **guardar el avance** sin nota.
- `validarConcepto` rechaza, antes de pedir la firma, con «Escriba una nota en cada criterio que no cumple», si una fila `no_cumple` de la ronda tiene la nota vacía o con menos de 5 caracteres.
- La lista dice junto al campo «Obligatoria si no cumple». «Dar concepto favorable» se desactiva con ese aviso si falta alguna nota, igual que con cambios sin guardar.
- Con un ítem en «No cumple», la ayuda del campo añade: «Esta nota saldrá en el acta, visible para toda la entidad.» (U7). El acta no se puede corregir después, y su contenido lo abre cualquier persona con sesión mientras la versión esté vigente y sea de acceso general.

### 5.2 Confirmación del revisor

- El diálogo **Firmar como «Revisó»** lista los criterios con su nota y exige marcar **Doy concepto favorable a pesar de este criterio** (o «estos criterios»).
- Campo `confirmaNoCumple` en `EsquemaConcepto`, con una huella de los criterios mostrados. `validarConcepto` lo exige si hay criterios («Confirme que da concepto favorable a pesar de los criterios que no cumplen») y compara la huella con lo guardado. Si la lista cambió en otra pestaña rechaza con «La lista cambió mientras tenía abierto el diálogo. Recargue la página.», para que nadie acepte un criterio que no vio [Decisión de Claude]. El aprobador no la necesita: en su etapa la lista ya está cerrada.
- Si no hay criterios, el diálogo no cambia y el campo no se pide.

### 5.3 Confirmación del aprobador

- Los diálogos **Aprobar** y **Aprobar y publicar** muestran «El revisor dio concepto favorable con N criterios que no cumplen», la lista, y exigen marcar **Apruebo a pesar de este criterio** (o «estos criterios»).
- `validarAprobar` y `validarAprobarYPublicar` lo exigen con «Confirme que aprueba a pesar de los criterios que no cumplen».
- Si una misma persona revisa y aprueba, confirma en cada firma: son dos actos distintos.
- Una eliminación no tiene lista y no aplica.

### 5.4 Evidencia

- Los eventos `concepto_favorable`, `aprobar` y `aprobar_y_publicar` llevan, solo si hubo criterios, `noCumple: [{ texto, nota }]` y `confirmoNoCumple: true`. El texto es el guardado en la ronda.
- El historial del trámite lo dice: «con 1 criterio que no cumple, aceptado».
- La bitácora conserva esos datos, como el resto del detalle.

### 5.5 Acta

- `detalle.acta` gana `noCumple: [{ texto, nota }]`, de la ronda aprobada, congelado al cierre.
- El acta imprime, después de **Firmas**, el bloque **Criterios que no cumplen, con concepto favorable**: cada criterio con su nota, y una línea con quién dio el concepto y quién aprobó.
- Si no hay criterios, el bloque no aparece, y sin membrete el PDF queda idéntico al de hoy.

### 5.6 Rondas

Solo cuenta la ronda en curso. Si el documento vuelve a revisión, el revisor responde de nuevo. Las rondas anteriores quedan en la evidencia del trámite.

## 6. Acta para quien ve el trámite cerrado

- La ruta `/tramites/[id]/acta` y el bloque del acta en `/tramites/[id]` responden a quien cumple `puedeVerVersion` **o** `puedeVerTramite`, en un trámite `publicado` o `eliminado`.
- Por §6.5 del spec de la 13A eso incluye a los participantes, los `admin_sgc`, los líderes con alcance y quien tiene `documentos.ver_historial`, con la regla de restringido.
- Los **archivos** del documento no cambian: la versión sigue rigiéndose por su estado (F13A-DC26). El acta trae datos de control, no el contenido.
- Un trámite cancelado o rechazado no tiene acta. Quien no ve el trámite ni la versión sigue recibiendo 404.
- `publicar` no tiene persona designada, así que quien solo firmó «Publicó» no cuenta como participante. Mientras sea `admin_sgc` ve el trámite por su rol; si deja de serlo, sigue la regla general [Decisión de Claude: incluirlo abriría también la página del trámite].
- La ficha del portal no cambia.

## 7. Semilla demo

- Documento nuevo `SGC-FO-06`, «Acta de control documental», tipo Formato, vigente, con un PDF de una página generado por la semilla: encabezado y pie ficticios con el nombre de la entidad demo. **No se usa el archivo real.**
- La demo lo deja elegido en la configuración, con márgenes coherentes con ese PDF.
- SOL-…-001 lleva un criterio no crítico en «No cumple», con nota y confirmaciones, y su `detalle.acta` trae `formato` y `noCumple`.
- Totales de la demo: 31 documentos; 35 versiones (29 vigentes, 2 obsoletas, 3 en borrador, 1 anulada).
- `db:seed:minima` no trae formato: una instalación nueva sale con el diseño básico hasta configurarlo.

## 8. Pruebas

**Acta:**

- Sin membrete y sin criterios, bytes iguales a los de hoy para los mismos datos.
- Con membrete, determinista; texto que pasa a una segunda página; cuerpo respetando márgenes.
- Membrete de dos páginas o de otro tamaño: diseño básico. Archivo perdido o huella distinta: falla y la publicación se sostiene.
- `detalle.acta` antiguo, sin `formato` ni `noCumple`.

**Configuración:** cada rechazo de §4.2; márgenes fuera de rango; auditoría; aviso de formato sin versión utilizable; `/admin/api/acta-ejemplo` con 401, 403 y 200, sin escribir nada.

**Criterios:** nota faltante; confirmación faltante en revisor, aprobar y aprobar y publicar, con un verificador espía sin llamar; sin criterios, nada cambia; crítico sigue bloqueando; una eliminación no pide confirmación; eventos y acta con los criterios; una ronda nueva no arrastra la confirmación.

**Visibilidad:** quien aprobó una versión ya obsoleta ve el acta y no el archivo; quien aprobó una eliminación ve el acta; `consulta` sin participación recibe 404; líder sin alcance recibe 404; restringido.

**Navegador**, sobre una copia temporal de la BD y del almacén: registrar el PDF real del formato, elegirlo, **Ver acta de ejemplo**, y publicar un trámite con un criterio en «No cumple» recorriendo las dos confirmaciones, en claro, en oscuro y a 390 px.

## 9. Documentación

- Manual, capítulo 5: **Formato del acta**, las confirmaciones, que la nota sale en el acta, y quién ve el acta (§9 hoy dice lo contrario).
- `CONTEXT.md`: decisiones nuevas, R36 resuelta, «Qué probar y cómo», y los totales de la demo.
- `AGENTS.md`: en la regla de visibilidad, el acta sigue a la versión o al trámite cerrado.

## 10. Lo que queda a criterio de quien construye

- Redacción de ayudas y mensajes que este documento no fija.
- Tamaños de letra y distribución del bloque de criterios.
- Nombre exacto de las funciones nuevas.
- La forma del aviso de §4.4 en la pantalla.
