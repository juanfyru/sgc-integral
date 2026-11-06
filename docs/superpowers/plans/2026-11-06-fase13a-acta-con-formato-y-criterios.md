# Fase 13A, adiciones: acta con formato y criterios que no cumplen. Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el acta salga sobre el formato controlado de la entidad, que un criterio en «No cumple» exija nota y confirmación del revisor y del aprobador con constancia en el acta, y que el acta la vea quien ve el trámite cerrado.

**Architecture:** `generarActa` sigue siendo pura y determinista, y recibe los bytes del formato. Los datos del formato y de los criterios se congelan en `detalle.acta` dentro de la transacción del cierre. Las reglas de criterios son validadores, que corren antes de firmar. El formato se elige en Configuración documental, con tres claves nuevas en `configuracion`, sin migración.

**Tech Stack:** Next.js 16 App Router, TypeScript estricto, PostgreSQL 16 con `postgres`, `pdf-lib` 1.17 (`embedPdf`, `drawPage`), `zod` 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-fase13a-acta-con-formato-y-criterios-design.md`. Complementa `docs/superpowers/specs/2026-11-05-fase13a-flujo-documental-design.md`.

## Global Constraints

- Node 24. TypeScript estricto, sin `any` salvo justificación puntual. Dominio, interfaz y código en español.
- **Sin dependencias npm nuevas y sin migración nueva.**
- Toda transición entra por `transicionar` (`src/db/consultas/tramites-flujo.ts`). Lo que puede fallar y solo lee va en un validador, que corre antes de pedir la firma y otra vez con la fila bloqueada. Un archivo de `src/db/consultas/flujo/` nunca importa `tramites-flujo.ts`.
- `firmas`, `tramite_eventos`, `auditoria` y `accesos` son de solo inserción. Nunca `DELETE` ni `UPDATE` sobre ellas, tampoco en un test.
- Sin formato y sin criterios, `generarActa` debe dar los mismos bytes que hoy.
- Si falta el formato o falla, ninguna publicación se bloquea ni se deshace.
- `src/db/esquema.ts` no cambia. Toda escritura pasa por `mutacion()` con su permiso.
- Colores por tokens, sin `opacity`, con los componentes de `src/componentes/ui`. Los formularios no se reinician tras un rechazo (`enviarSinReiniciar`, o el patrón de `FormularioSolicitud`).
- Tests de BD en `revertida` (`tests/utiles/transaccion.ts`). Los que no puedan, restauran en `finally`.
- Los archivos reales del hospital (`SGC-FO-*.docx`, `SGC-FO-*.pdf` en la raíz) nunca entran a un commit. Ya están en `.git/info/exclude`.
- Commits en español convencional, con el trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (`AGENTS.md`).

## Review Focus

1. **Una nota con solo espacios** en un criterio que no cumple no cuenta como nota: el concepto se rechaza. Test en la Tarea 2.
2. **Un PDF protegido con clave o dañado** elegido como formato se rechaza con un mensaje claro, sin error crudo, y si aparece en una versión nueva el acta sale con el diseño básico. Tests en las Tareas 1 y 4.
3. **Cinco criterios con notas de 2000 caracteres** sobre un formato con márgenes grandes pasan de página sin que el texto pise el encabezado ni el pie. Test en la Tarea 1.
4. **Publicar una versión nueva del propio formato** por trámite, o eliminarlo: el acta de esa publicación usa la versión recién publicada, y la de su eliminación sale con el diseño básico. Test en la Tarea 5.
5. **Márgenes escritos con coma** («5,5») se aceptan igual que con punto, y fuera de rango se rechazan con mensaje. Test en la Tarea 4.

---

### Tarea 1: Generar el acta sobre el formato y con los criterios

**Files:**
- Create: `src/lib/membrete-acta.ts`
- Modify: `src/lib/acta.ts`
- Test: `tests/acta.test.ts`

**Interfaces:**
- Produces (`src/lib/membrete-acta.ts`):
  - `export const TOLERANCIA_CARTA_PT = 3`
  - `export async function motivoMembreteNoUtilizable(bytes: Uint8Array): Promise<string | null>`: `null` si sirve. Mensajes: «El archivo del formato no se puede leer» (dañado o protegido con clave: `PDFDocument.load` falla), «El formato debe tener una sola página», «El formato debe ser tamaño carta».
- Produces (`src/lib/acta.ts`):
  - `export type CriterioActa = { texto: string; nota: string }`
  - `export type FormatoActa = { archivoId: number; hash: string; codigo: string; version: number; margenSuperiorCm: number; margenInferiorCm: number }`
  - `DatosActa` gana `noCumple?: CriterioActa[]`, `formato?: FormatoActa | null` y `ejemplo?: boolean`. Son opcionales: un `detalle.acta` anterior no los trae.
  - `export async function generarActa(d: DatosActa, membrete?: Uint8Array | null): Promise<Uint8Array>`

- [ ] **Step 1: Fijar la huella del acta de hoy, antes de tocar nada**

Con los `datos` de ejemplo que ya usa `tests/acta.test.ts`, calcula el SHA-256 de `generarActa` con el código actual y añade el test con ese valor literal:

```ts
it("sin formato y sin criterios, el acta es idéntica a la de antes", async () => {
  const bytes = await generarActa(datos);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("<huella calculada en este paso>");
});
```

Run: `npx vitest run tests/acta.test.ts`. Expected: PASS. Si la huella cambia entre dos corridas, detente: el resto del plan depende de que sea estable.

- [ ] **Step 2: Tests que fallan**

Ayudante del test: `formatoDePrueba(paginas = 1, tamano = [612, 792])`, que crea un PDF con `pdf-lib`.

```ts
it("con formato, cada página lleva el fondo y el resultado es determinista", async () => {
  const fondo = await formatoDePrueba();
  const d = { ...datos, formato: { archivoId: 1, hash: "x", codigo: "SGC-FO-06", version: 1, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 } };
  const a = await generarActa(d, fondo);
  const b = await generarActa(d, fondo);
  expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  expect(Buffer.from(a).equals(Buffer.from(await generarActa(datos)))).toBe(false);
});
it("el formato que no sirve deja el diseño básico, sin error", async () => {
  const d = { ...datos, formato: { archivoId: 1, hash: "x", codigo: "SGC-FO-06", version: 1, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 } };
  const basica = await generarActa({ ...d, formato: null });
  for (const malo of [await formatoDePrueba(2), await formatoDePrueba(1, [595, 842]), new Uint8Array([1, 2, 3])]) {
    expect(Buffer.from(await generarActa(d, malo)).equals(Buffer.from(basica))).toBe(true);
  }
});
it("motivoMembreteNoUtilizable explica cada caso", async () => {
  expect(await motivoMembreteNoUtilizable(await formatoDePrueba())).toBeNull();
  expect(await motivoMembreteNoUtilizable(await formatoDePrueba(1, [613, 791]))).toBeNull();          // tolerancia de 3 puntos
  expect(await motivoMembreteNoUtilizable(await formatoDePrueba(2))).toMatch(/una sola página/);
  expect(await motivoMembreteNoUtilizable(await formatoDePrueba(1, [595, 842]))).toMatch(/tamaño carta/);
  expect(await motivoMembreteNoUtilizable(new Uint8Array([1, 2, 3]))).toMatch(/no se puede leer/);
});
it("los criterios van en el acta, y sin ellos no aparece el bloque", async () => {
  const noCumple = [{ texto: "Es coherente con los demás documentos", nota: "Se ajustará con la guía." }];
  const con = await textoDelActa({ ...datos, noCumple });
  expect(con).toContain("Criterios que no cumplen, con concepto favorable");
  expect(con).toContain("Se ajustará con la guía.");
  expect(await textoDelActa({ ...datos, noCumple: [] })).not.toContain("Criterios que no cumplen");
});
it("cinco criterios con notas largas pasan de página dentro de los márgenes", async () => {
  const noCumple = Array.from({ length: 5 }, (_, i) => ({ texto: `Criterio ${i + 1}`, nota: "nota ".repeat(400) }));
  const d = { ...datos, noCumple, formato: { archivoId: 1, hash: "x", codigo: "F", version: 1, margenSuperiorCm: 8, margenInferiorCm: 6 } };
  const doc = await PDFDocument.load(await generarActa(d, await formatoDePrueba()));
  expect(doc.getPageCount()).toBeGreaterThan(1);
});
it("el ejemplo se distingue en cada página", async () => {
  expect(await textoDelActa({ ...datos, ejemplo: true })).toContain("EJEMPLO, SIN VALOR");
});
```

`textoDelActa` debe reutilizar la forma en que `tests/acta.test.ts` ya comprueba el texto de un PDF. Si ese archivo no tiene una, compara con `pdf-lib` y el texto sin comprimir, usando `useObjectStreams: false` solo dentro del ayudante, o lee los operadores de la página. Decide y dilo en el informe.

- [ ] **Step 3: Run** `npx vitest run tests/acta.test.ts`. Expected: FAIL en los casos nuevos.

- [ ] **Step 4: Implementar**

`motivoMembreteNoUtilizable` usa `PDFDocument.load` dentro de un `try`. En `generarActa`:

- `const fondo = membrete && d.formato && (await motivoMembreteNoUtilizable(membrete)) === null ? membrete : null`. Si hay formato sin fondo utilizable, `console.error` y diseño básico.
- La geometría deja de ser constante: `Hoja` recibe `{ arriba, abajo, fondo? }`. Con fondo, `arriba = ALTO - cm(margenSuperiorCm)` y `abajo = cm(margenInferiorCm) + 40`, con `cm = (x) => (x * 72) / 2.54`. Sin fondo, `arriba = ALTO - MARGEN` y `abajo = LIMITE_INFERIOR`, los valores de hoy.
- `Hoja.nueva()` dibuja el fondo primero: `pagina.drawPage(fondo, { x: 0, y: 0, width: ANCHO, height: ALTO })`, con la página de `doc.embedPdf(membrete, [0])`.
- Con fondo no se imprime el nombre de la entidad bajo el título: ya está en el encabezado.
- El pie (línea, base legal, «Página X de Y», generación) se dibuja, con fondo, en `cm(margenInferiorCm) + 24`, `+ 12` y `+ 1`; sin fondo, en las posiciones de hoy.
- `noCumple` con elementos: después de la sección **Firmas**, `h.titulo("Criterios que no cumplen, con concepto favorable")`, cada criterio con su nota, y una línea final con quien revisó y quien aprobó, tomados de `d.firmas` por su etiqueta («Revisó», «Aprobó»).
- `ejemplo: true`: cada página imprime «EJEMPLO, SIN VALOR», en negrita, en la parte alta del cuerpo.

- [ ] **Step 5: Run** `npx vitest run tests/acta.test.ts`. Expected: PASS, incluida la huella del Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/membrete-acta.ts src/lib/acta.ts tests/acta.test.ts
git commit -m "feat(f13a): el acta se genera sobre el formato de la entidad y lista los criterios que no cumplen"
```

---

### Tarea 2: Reglas de los criterios que no cumplen

**Files:**
- Create: `src/lib/tramites/criterios.ts`
- Modify: `src/db/consultas/revision.ts`, `src/db/consultas/flujo/revision.ts`, `src/db/consultas/flujo/cierre.ts`, `src/db/consultas/actas.ts`, `src/lib/esquemas/tramites.ts`
- Test: `tests/tramites-revision.test.ts`, `tests/tramites-cierre.test.ts`, `tests/acta-cierre.test.ts`, `tests/validacion.test.ts`

**Interfaces:**
- Consumes: `CriterioActa` (Tarea 1).
- Produces (`src/db/consultas/revision.ts`):
  `export type CriterioNoCumple = { itemId: number; texto: string; nota: string }` y
  `export async function criteriosNoCumplen(tramiteId: number, ronda: number, opciones?: { sql?: Cliente }): Promise<CriterioNoCumple[]>`: filas de la ronda con `resultado = 'no_cumple'` y no críticas, en el orden de la lista, con el texto guardado. `nota` es `""` si no hay.
- Produces (`src/lib/tramites/tipos.ts`, junto a `SIN_ITEMS_ACTIVOS`, porque también los leen componentes de cliente):
  - `export const LARGO_MIN_NOTA_CRITERIO = 5`
  - `export const FALTA_NOTA_CRITERIO = "Escriba una nota en cada criterio que no cumple"`
- Produces (`src/lib/tramites/criterios.ts`, solo servidor: usa `node:crypto`, y ningún componente de cliente lo importa):
  - `export function huellaDeCriterios(criterios: { itemId: number; nota: string }[]): string`: SHA-256 en hexadecimal de `JSON.stringify(criterios.map((c) => [c.itemId, c.nota]))`.
  - `export function constanciaDeCriterios(criterios: { texto: string; nota: string }[]): { noCumple?: { texto: string; nota: string }[]; confirmoNoCumple?: true }`: `{}` sin criterios.
- Produces (esquema): `EsquemaConcepto` gana `confirmaNoCumple: z.string().regex(/^[0-9a-f]{64}$/).optional()`.
- Produces (evento): `concepto_favorable`, `aprobar` y `aprobar_y_publicar` llevan, solo si hay criterios, `noCumple: [{ texto, nota }]` y `confirmoNoCumple: true`.
- Produces (`congelarDatosActa`): con `clase === "aprobacion"`, `noCumple: [{ texto, nota }]`, de `tramite.ronda`.

El aprobador usa el mismo campo con huella que el revisor: el spec dice que no la necesita, pero un solo esquema y una sola comprobación son menos código, y no cambia lo que ve nadie.

- [ ] **Step 1: Tests que fallan**

En `tests/tramites-revision.test.ts`, con `tramiteEn(tx, "revision")` y un ayudante que guarda la lista con `guardarVerificacion`:

```ts
it("sin nota en un criterio que no cumple no hay concepto, y un verificador espía no se llama", ...);   // «Escriba una nota en cada criterio que no cumple»
it("una nota de solo espacios no cuenta", ...);
it("sin confirmación no hay concepto", ...);        // «Confirme que da concepto favorable a pesar de los criterios que no cumplen»
it("si la lista cambió, la confirmación vieja no sirve", ...);   // «La lista cambió mientras tenía abierto el diálogo. Recargue la página.»
it("con nota y confirmación pasa, y el evento lleva los criterios", ...);   // detalle.noCumple, detalle.confirmoNoCumple
it("sin criterios no se pide nada y el evento no cambia", ...);   // sin claves noCumple ni confirmoNoCumple
it("un ítem vuelto crítico durante la ronda bloquea", async () => { /* guardar no_cumple con nota, UPDATE lista_verificacion_items SET critico = true, y «Hay un ítem crítico que no cumple» */ });
it("una ronda nueva no arrastra la confirmación", ...);   // devolver, reenviar, y la huella anterior se rechaza si cambió
```

En `tests/tramites-cierre.test.ts`:

```ts
it("aprobar exige confirmar los criterios, antes de la firma", ...);   // «Confirme que aprueba a pesar de los criterios que no cumplen»; verificador espía sin llamar
it("aprobar y publicar también", ...);
it("una eliminación no pide confirmación", ...);
it("la confirmación del aprobador queda en su evento", ...);
it("el crítico sigue bloqueando aunque se confirme", ...);
```

En `tests/acta-cierre.test.ts`: tras publicar con un criterio, `detalle.acta.noCumple` trae `[{ texto, nota }]` con el texto guardado, aunque el ítem se edite después; un cierre sin criterios deja `noCumple: []`.

- [ ] **Step 2: Run** `npx vitest run tests/tramites-revision.test.ts tests/tramites-cierre.test.ts tests/acta-cierre.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`validarConcepto`: `criticos_sin_cumplir` cuenta las filas de la ronda con `resultado = 'no_cumple'` y `(r.critico OR i.critico)`, con `JOIN lista_verificacion_items i`. Después de la comprobación de observaciones:

```ts
const criterios = await criteriosNoCumplen(tramite.id, tramite.ronda, { sql });
if (criterios.length === 0) return;
if (criterios.some((c) => c.nota.trim().length < LARGO_MIN_NOTA_CRITERIO)) throw new ErrorTramite(FALTA_NOTA_CRITERIO);
exigirConfirmacion(datos, criterios, "Confirme que da concepto favorable a pesar de los criterios que no cumplen");
```

`exigirConfirmacion` vive en `flujo/revision.ts` y la exporta para `cierre.ts`: sin campo, el mensaje recibido; con huella distinta de `huellaDeCriterios(criterios)`, «La lista cambió mientras tenía abierto el diálogo. Recargue la página.». `validarAprobar` y `validarAprobarYPublicar` la llaman con «Confirme que aprueba a pesar de los criterios que no cumplen». En una eliminación no hay filas y no aplica.

`conceptoFavorable`, `aprobar` y `aprobarYPublicar` añaden al `detalle` lo que devuelve `constanciaDeCriterios(criterios)`. `aprobarYPublicar` la pone junto a `concepto`.

`congelarDatosActa` añade `noCumple` con `criteriosNoCumplen` y `tx`. `DatosCongelados` ya la hereda de `DatosActa`.

- [ ] **Step 4: Run** los mismos tests, y `npx vitest run tests/validacion.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): un criterio que no cumple exige nota y la confirmación del revisor y del aprobador"
```

---

### Tarea 3: Pantallas de los criterios

**Files:**
- Modify: `src/componentes/tramites/ListaVerificacion.tsx`, `src/componentes/tramites/PanelRevision.tsx`, `src/componentes/tramites/PanelAprobacion.tsx`, `src/componentes/tramites/HistorialTramite.tsx`, `src/app/(app)/tramites/[id]/page.tsx`, `src/app/acciones-tramites.ts`
- Create: `src/componentes/tramites/AvisoCriterios.tsx`
- Test: `tests/tramites-ui.test.tsx`, `tests/tramite-evidencia.test.tsx`, `tests/acciones-tramites.test.ts`

**Interfaces:**
- Consumes: `criteriosNoCumplen`, `huellaDeCriterios`, `LARGO_MIN_NOTA_CRITERIO`, `FALTA_NOTA_CRITERIO` (Tarea 2). `huellaDeCriterios` solo se llama en `page.tsx`, que es de servidor.
- Produces: `AvisoCriterios({ criterios, huella, titulo, confirmacion }: { criterios: { texto: string; nota: string }[]; huella: string; titulo: string; confirmacion: string })`: lista los criterios con su nota y una casilla obligatoria `name="confirmaNoCumple"` con `value={huella}`.

`PanelRevision` y `PanelAprobacion` ganan `criterios: { texto: string; nota: string }[]` y `huellaCriterios: string`. La página los calcula en el servidor, porque `huellaDeCriterios` usa `node:crypto`.

- [ ] **Step 1: Tests que fallan**

```ts
it("la nota dice que es obligatoria si no cumple y que saldrá en el acta", ...);
// ItemEditable: «Nota (obligatoria si no cumple)»; con resultado no_cumple, «Esta nota saldrá en el acta, visible para toda la entidad.»
it("sin criterios el diálogo de firma no cambia", ...);
it("con criterios, el revisor ve la lista y la casilla en singular y en plural", ...);
// «Doy concepto favorable a pesar de este criterio» / «a pesar de estos criterios»; value = huella
it("con una nota faltante el concepto queda desactivado y lo dice", ...);   // «Escriba una nota en cada criterio que no cumple»
it("el aprobador ve el aviso en Aprobar y en Aprobar y publicar", ...);
// «El revisor dio concepto favorable con 1 criterio que no cumple»; «Apruebo a pesar de este criterio»
it("en una eliminación no hay aviso", ...);
it("el historial dice cuántos criterios se aceptaron", ...);   // «con 1 criterio que no cumple, aceptado»
```

En `tests/tramite-evidencia.test.tsx`, la página real sobre `revertida`: un trámite en `aprobacion` con un criterio pinta el aviso y su huella. En `tests/acciones-tramites.test.ts`: `confirmaNoCumple` pasa por `EsquemaConcepto` y no llega a `EsquemaFirma`.

- [ ] **Step 2: Run** `npx vitest run tests/tramites-ui.test.tsx tests/tramite-evidencia.test.tsx tests/acciones-tramites.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

- `ItemEditable` guarda el resultado en un `useState` para mostrar la advertencia al elegir «No cumple». La etiqueta pasa a «Nota (obligatoria si no cumple)».
- `PanelRevision`: `impedimento` añade `FALTA_NOTA_CRITERIO` cuando algún criterio tiene nota corta, después de las comprobaciones actuales. `AvisoCriterios` va como `children` de `DialogoFirma`, encima del concepto.
- `AvisoCriterios` no reinicia la casilla tras una clave errada: `DialogoFirma` ya conserva sus `children`.
- `PanelAprobacion`: el mismo aviso en los dos diálogos. Visible también fuera del diálogo, encima del concepto de quien revisó, para que el aprobador lo vea antes de abrirlo.
- `separarFirma` y `OCULTOS` en `src/app/acciones-tramites.ts`: comprueba que `confirmaNoCumple` quede en los datos, no en la firma, y añádelo al `omitir` de `EsquemaFirma`.
- `HistorialTramite`: `cambiosDe` añade la línea cuando `detalle.noCumple` tiene elementos.
- `page.tsx`: `Revision` y `Cierre` piden `criteriosNoCumplen` y calculan la huella.

- [ ] **Step 4: Run** los mismos tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): el revisor y el aprobador ven y confirman los criterios que no cumplen"
```

---

### Tarea 4: Elegir el formato en Configuración documental

**Files:**
- Create: `src/db/consultas/formato-acta.ts`, `src/app/admin/api/acta-ejemplo/route.ts`
- Modify: `src/db/consultas/config-documental.ts`, `src/app/admin/acciones-config-documental.ts`, `src/componentes/admin/config-documental/FormularioConfigDocumental.tsx`, `src/app/(app)/admin/(panel)/configuracion-documental/page.tsx`, `src/lib/bitacora-detalle.ts`
- Test: `tests/config-documental.test.ts`, `tests/formato-acta.test.ts`, `tests/handlers-permisos.test.ts`

**Interfaces:**
- Consumes: `motivoMembreteNoUtilizable`, `generarActa` (Tarea 1).
- Produces (`src/db/consultas/formato-acta.ts`, sin importar `config-documental.ts`):
  - `export type ArchivoDeFormato = { archivoId: number; ruta: string; hash: string; codigo: string; version: number }`
  - `export async function archivoDeFormato(documentoId: number, opciones?: { sql?: Cliente }): Promise<ArchivoDeFormato | null>`: la versión vigente, de acceso general, con principal PDF.
  - `export type EstadoFormato = { estado: "sin_formato" } | { estado: "listo"; codigo: string; version: number } | { estado: "no_sirve"; motivo: string } | { estado: "perdido" }`
  - `export async function revisarFormatoActa(documentoId: number | null, opciones?: { sql?: Cliente }): Promise<EstadoFormato>`: lee el archivo, compara la huella con `hash_sha256` y llama `motivoMembreteNoUtilizable`. `perdido` si el archivo falta o su huella no coincide. `no_sirve` si no hay versión vigente, es restringido, no es PDF o no pasa el membrete, con mensajes propios.
  - `export async function documentosParaFormato(opciones?: { sql?: Cliente }): Promise<{ id: number; codigo: string; titulo: string }[]>`
- Produces (`config-documental.ts`):
  - `ConfigDocumental` gana `formatoActa: { documentoId: number | null; margenSuperiorCm: number; margenInferiorCm: number }`.
  - `CONFIG_DOCUMENTAL_DEFECTO.formatoActa = { documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 }`.
  - Claves: `formato_acta_documento_id`, `formato_acta_margen_superior_cm`, `formato_acta_margen_inferior_cm`. El valor se guarda con punto decimal.
  - `DatosConfigDocumental` gana `formatoActa`. `guardarConfigDocumentalEn` guarda trece claves.
- Produces (acción): tres campos más en `EsquemaConfigDocumental`: `formatoActaDocumentoId` (dígitos o vacío), `margenSuperiorCm` y `margenInferiorCm` (`/^\d{1,2}([.,]\d)?$/`, con la coma traducida a punto).
- Produces (ruta): `GET /admin/api/acta-ejemplo`.

- [ ] **Step 1: Tests que fallan**

En `tests/formato-acta.test.ts`, con un documento creado en `revertida` y su PDF escrito en una carpeta temporal de `ALMACEN_RUTA`:

```ts
it("sin documento elegido no hay nada que revisar", ...);   // { estado: "sin_formato" }
it("un PDF de una página, carta, general y vigente está listo", ...);
it("cada motivo se explica", ...);   // sin versión vigente; restringido; principal que no es PDF; dos páginas; A4; PDF dañado
it("el archivo perdido o cambiado no es lo mismo que uno que no sirve", ...);   // { estado: "perdido" } en los dos casos
it("la lista solo ofrece documentos que pueden servir", ...);
```

En `tests/config-documental.test.ts`:

```ts
it("guarda el formato y los márgenes, y lo audita", ...);   // cambios con las tres claves
it("rechaza un documento que no sirve, con el motivo", ...);
it("rechaza márgenes fuera de rango", ...);   // «El espacio del encabezado debe estar entre 0 y 12 cm»; suma > 16: «Entre los dos no pueden pasar de 16 cm»
it("elegir ningún formato deja la clave vacía", ...);
it("sin claves, cae a los valores por defecto", ...);
```

Actualiza el test que hoy afirma diez claves. En el test de la acción: «5,5» y «5.5» dan 5.5; «5,55» se rechaza.

Handlers: `/admin/api/acta-ejemplo` da 401 sin sesión, 403 sin `tramites.gestionar`, y 200 con `application/pdf`, `no-store` e `inline`. Tras esa petición, `archivos` y `auditoria` no tienen filas nuevas.

- [ ] **Step 2: Run** `npx vitest run tests/formato-acta.test.ts tests/config-documental.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

`guardarConfigDocumentalEn` valida los márgenes y, con documento elegido, llama `revisarFormatoActa(documentoId, { sql: tx })`: si no está `listo`, lanza su motivo; `perdido` lanza «El archivo del formato no se encuentra o cambió».

La ruta sigue el modelo de `src/app/admin/api/archivos/[archivoId]/route.ts`: `sesionDePeticion`, `puede(sesion, "tramites.gestionar")` y un límite de ritmo como el de la ruta del acta. Datos ficticios fijos, con `ejemplo: true`, dos criterios y texto suficiente para dos páginas. Con el formato guardado en estado `listo`, pasa sus bytes y márgenes; si no, el diseño básico.

La sección **Formato del acta** va en `FormularioConfigDocumental`, después de **Publicación directa**:

- lista **Documento del formato**, con la opción «Sin formato: diseño básico». Si el elegido ya no está en la lista, se incluye como en `FormularioTipo`;
- **Espacio del encabezado (cm)** y **Espacio del pie (cm)**, `type="number"` con `step="0.1"`;
- ayuda: «Un PDF de una página, tamaño carta, con el cuerpo en blanco. Guarde y use Ver acta de ejemplo para comprobar los espacios.»;
- enlace **Ver acta de ejemplo**, que abre en otra pestaña;
- aviso según `EstadoFormato`: `no_sirve`, «Las actas saldrán con el diseño básico.» con el motivo; `perdido`, «No se podrán generar actas hasta restaurar el archivo del formato.». Con `role="status"`, en tokens de estado, sin depender solo del color.

- [ ] **Step 4: Run** los mismos tests. Expected: PASS.

- [ ] **Step 5: Comprobar en navegador**, con una copia temporal de la BD y del almacén, que borras al terminar: elegir un PDF, guardar, **Ver acta de ejemplo**, un documento que no sirve, y márgenes con coma. Tema claro, oscuro y 390 px.

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(f13a): el formato del acta se elige en Configuración documental, con acta de ejemplo"
```

---

### Tarea 5: El cierre congela el formato y el acta lo usa

**Files:**
- Modify: `src/db/consultas/actas.ts`, `src/lib/bitacora-detalle.ts`
- Test: `tests/acta-cierre.test.ts`, `tests/bitacora-detalle.test.ts`

**Interfaces:**
- Consumes: `obtenerConfigDocumental`, `archivoDeFormato` (Tarea 4); `FormatoActa` y `generarActa` (Tarea 1).
- Produces:
  - `congelarDatosActa` añade `formato: FormatoActa | null`.
  - `asegurarActa`: la opción `generar` pasa a `(d: DatosActa, membrete: Uint8Array | null) => Promise<Uint8Array>`.

- [ ] **Step 1: Tests que fallan** (`tests/acta-cierre.test.ts`, en `revertida`)

```ts
it("el cierre congela la versión vigente del formato y sus márgenes", ...);
it("una versión nueva del formato no cambia un acta ya cerrada", ...);
it("sin formato, restringido o sin versión vigente, se congela null", ...);
it("publicar una versión nueva del propio formato usa esa versión", ...);
it("el acta de la eliminación del propio formato sale con el diseño básico", ...);
it("el formato perdido no deshace la publicación: no hay acta, queda en la bitácora y reintenta", ...);
// asegurarActa devuelve null, una fila acta_no_regenerable con motivo "formato", y tras restaurar el archivo devuelve el acta
it("con huella distinta no se usa otro archivo", ...);
it("un acta congelada antes de este cambio sigue saliendo", ...);   // detalle.acta sin formato ni noCumple
it("regenerar un acta con formato da los mismos bytes", ...);
```

En `tests/bitacora-detalle.test.ts`: la frase de `acta_no_regenerable` con `motivo: "formato"`.

- [ ] **Step 2: Run** `npx vitest run tests/acta-cierre.test.ts tests/bitacora-detalle.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

En `congelarDatosActa`:

```ts
const { formatoActa } = await obtenerConfigDocumental({ sql: tx });
const archivo = formatoActa.documentoId === null ? null : await archivoDeFormato(formatoActa.documentoId, { sql: tx });
```

`aplicarPublicacion` corre antes, así que un formato recién publicado ya es la versión vigente. No se lee el archivo: la transacción queda corta.

En `asegurarActa`, antes de generar:

- con `datos.formato`, lee `archivos.ruta` y `hash_sha256` por `archivoId`, lee el archivo y compara el SHA-256 de sus bytes con `formato.hash`;
- si falta o difiere: `console.error`, fila `acta_no_regenerable` con `detalle: { tramiteId, motivo: "formato", archivoId }` si hay `usuarioId`, y `return null`. El siguiente pedido reintenta;
- `generar(datos, membrete)`.

`reunirDatosActa` conserva `...congelado`: `formato` y `noCumple` pasan solos.

- [ ] **Step 4: Run** los mismos tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): cada acta congela su formato y se genera sobre esa versión"
```

---

### Tarea 6: El acta para quien ve el trámite cerrado

**Files:**
- Modify: `src/app/(app)/tramites/[id]/acta/route.ts`, `src/app/(app)/tramites/[id]/page.tsx`
- Test: `tests/acta-ruta.test.ts`, `tests/tramites-visibilidad.test.ts`

**Interfaces:**
- Consumes: `obtenerTramite(id, sesion)` (`src/db/consultas/tramites.ts`): devuelve `null` si `puedeVerTramite` no lo permite.

- [ ] **Step 1: Tests que fallan**

```ts
it("quien aprobó una versión ya obsoleta ve el acta, y no el archivo", ...);   // ruta del acta 200; archivo de la versión obsoleta 404
it("quien aprobó una eliminación ve el acta", ...);
it("consulta, sin participación, recibe 404 con la versión obsoleta", ...);
it("un líder sin alcance recibe 404", ...);
it("en un restringido, quien tiene historial sin alcance recibe 404", ...);
it("un trámite cancelado no tiene acta", ...);
it("quien ve la versión vigente sin ver el trámite sigue viendo el acta", ...);
```

En la página: el bloque del acta aparece para quien ve el trámite cerrado, aunque no vea la versión.

- [ ] **Step 2: Run** `npx vitest run tests/acta-ruta.test.ts tests/tramites-visibilidad.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

Ruta: `cierre` sigue viniendo de `versionDeActa`, que ya exige un trámite `publicado` o `eliminado`. Se responde 404 solo si no cumple `puedeVerVersion` **ni** `obtenerTramite(Number(id), sesion) !== null`. Comprueba primero `puedeVerVersion`, que es lo común y más barato. Revisa que el tipo de `sesion` en la ruta sirva como `SesionFlujo`.

Página: `verActa` deja de pedir `puedeVerVersion`: quien llegó hasta ahí ya pasó `obtenerTramite`. Actualiza el comentario de la línea anterior.

- [ ] **Step 4: Run** los mismos tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): el acta la ve también quien ve el trámite cerrado"
```

---

### Tarea 7: Semilla demo

**Files:**
- Create: `src/db/semillas/formato-acta-demo.ts`
- Modify: `src/db/semillas/demo.ts`
- Test: `tests/semilla-tramites.test.ts`, `tests/esquema.test.ts`

**Interfaces:**
- Consumes: `archivoDeFormato`, las claves de la Tarea 4, `constanciaDeCriterios` y `huellaDeCriterios` (Tarea 2).
- Produces: `export async function generarFormatoActaDemo(entidad: string): Promise<Uint8Array>`: PDF de una página, carta, con encabezado y pie ficticios dibujados con `pdf-lib` y el cuerpo en blanco. Encabezado hasta 4 cm, pie desde 3 cm del borde inferior. Título «ACTA DE CONTROL DOCUMENTAL», código `SGC-FO-06`, versión 1.

- [ ] **Step 1: Tests que fallan**

```ts
it("la demo trae el formato elegido, y sirve", async () => {
  const { formatoActa } = await obtenerConfigDocumental();
  expect(await revisarFormatoActa(formatoActa.documentoId)).toMatchObject({ estado: "listo", codigo: "SGC-FO-06", version: 1 });
});
it("el trámite publicado trae un criterio aceptado y el formato congelado", ...);
// en detalle.acta: formato.codigo === "SGC-FO-06" y noCumple con 1 elemento; concepto_favorable y aprobar con confirmoNoCumple
```

En `tests/esquema.test.ts`: 31 documentos; 35 versiones (29 vigentes, 2 obsoletas, 3 en borrador, 1 anulada). Ajusta los demás tests que cuenten la demo sin debilitarlos.

- [ ] **Step 2: Run** `npx vitest run tests/semilla-tramites.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar**

- `SGC-FO-06`, «Acta de control documental», tipo Formato, proceso SGC, en la lista de documentos de `demo.ts`, con `v1Vigente(CALIDAD, ...)`. Su principal usa `generarFormatoActaDemo` y no `generarPlaceholder`: `archivoDemo` gana un parámetro opcional con los bytes, y la huella guardada es la de esos bytes.
- La configuración de la demo guarda las tres claves, con márgenes 4,2 y 3,2 cm, **antes** de `sembrarTramites`, porque `congelarDatosActa` las lee.
- SOL-…-001: `responderLista` con un ítem no crítico en `no_cumple`, con nota, y `darConcepto` y el paso de aprobar con la constancia.
- `db:seed:minima` no cambia.

Resiembra con `npm run db:seed && npm run admin:asegurar`.

- [ ] **Step 4: Run** `$env:SEMILLA_RECIEN=1; npx vitest run tests/semilla-tramites.test.ts tests/esquema.test.ts`, en PowerShell. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(f13a): la demo trae un formato de acta y un criterio aceptado"
```

---

### Tarea 8: Documentación y verificación final

**Files:**
- Modify: `docs/manual/usuario/05-documentos-solicitar-elaborar-revisar-aprobar-y-publicar.md`, `CONTEXT.md`, `AGENTS.md`, `README.md` si queda falso

- [ ] **Step 1: Manual, capítulo 5.** Con las cadenas copiadas del código:
  - cómo preparar el formato en Word, guardarlo como PDF, registrarlo y elegirlo, con **Ver acta de ejemplo** y qué significan los dos avisos;
  - la nota obligatoria, que sale en el acta visible para toda la entidad;
  - las confirmaciones del revisor y del aprobador;
  - quién ve el acta: §9 hoy dice lo contrario;
  - el resumen de mensajes de la sección 16.

- [ ] **Step 2: `CONTEXT.md`.**
  - Tabla de decisiones: U1 a U7 del spec y las seis decisiones de Claude, con base y costo. F13A-R36 resuelta y DC12 sustituida. R35 sigue como decisión del usuario.
  - Quita de la deuda «un ítem vuelto crítico después no bloquea».
  - Totales de la demo y usuarios.
  - «Qué probar y cómo»: corrige el paso 3 («haga clic en el enlace `SGC-FO-05, versión 1`»), y añade los pasos del formato, de los criterios y del acta.

- [ ] **Step 3: `AGENTS.md`.** En la regla de visibilidad: el acta se sirve a quien ve su versión o el trámite cerrado. Una línea: el formato del acta se congela en `detalle.acta` y `generarActa` no cambia sus bytes sin formato. Sé breve.

- [ ] **Step 4: Verificación completa**

Run: `npm run lint`, `$env:SEMILLA_RECIEN=1; npm test` sobre base recién sembrada, y el build sin `DATABASE_URL`, como el CI.
Run: `docker compose -f docker-compose.dev.yml up -d --build --no-deps app`: nunca `down`, nunca `-v`, nunca `bd`. Después `curl -s http://localhost:9081/api/salud`.
Expected: `{"estado":"ok"}`, y todo en verde.

- [ ] **Step 5: Comprobar con el formato real**, sobre una copia temporal de la BD y del almacén, que borras al terminar:
  - registrar `F:\sgc-integral\SGC-FO-0XX Acta_Control_Documental.pdf`, elegirlo con 5,5 y 3,5 cm, y **Ver acta de ejemplo**;
  - un trámite con un criterio en «No cumple» hasta publicar, con las dos confirmaciones, y leer el acta;
  - un acta en dos páginas, sin que el texto pise el encabezado ni el pie;
  - quien aprobó una versión ya obsoleta abre el acta y no el archivo.

  Tema claro, oscuro y 390 px. Las capturas van al scratchpad. Ningún archivo del hospital entra a un commit: revisa `git status` antes de cada `git add`.

- [ ] **Step 6: Deja `sgc` resembrada y sana.** Run: `npm run db:seed && npm run admin:asegurar`.

- [ ] **Step 7: Commit**

```bash
git add docs CONTEXT.md AGENTS.md README.md
git commit -m "docs: adiciones de la Fase 13A - formato del acta y criterios que no cumplen"
```
