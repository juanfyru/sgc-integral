# Fase 12 — Nueva estructura visual (diseño)

Fecha: 2026-11-04. Estado: **aprobado por el usuario en conversación** (decisiones de §2); el
documento pasa por la revisión del constructor antes del plan.

## 0. Cómo leer este documento

Es el detalle de la Fase 12 del diseño maestro
`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` ("el spec maestro").
El spec maestro manda: §4.1 (piso de despliegue), §5.10 (configuración por instalación y
marca), §5.11 (sistema visual) y §8 Fase 12 (alcance, demostración, seguridad, manual). Aquí
se precisa lo que esas secciones dejan abierto y se fijan los valores que el constructor
necesita. Lo que no se nombra aquí ni en el spec maestro queda al constructor (§16).

Las reglas permanentes están en `AGENTS.md`; el estado vivo en `CONTEXT.md`. La maqueta de
la dirección C aprobada en el diseño maestro
(`.superpowers/brainstorm/2005-1793719552/content/direccion-visual-v3.html`, no versionada,
variante "C. Vivo") es la referencia visual: densidad, bordes finos sin sombras, barra
lateral de 216–240 px, barra superior de 46–56 px, cifras grandes con franja de estado.

## 1. Intención y porqué

La Fase 11 dejó la plataforma con sesión, roles y administración de usuarios, pero con la
cara de `sgc-suaza`: un portal con encabezado y un panel aparte con su propia cabecera, el
nombre "SGC Documental" y el hospital de Suaza escritos en el código. Las fases 13 a 17
añaden tres módulos (Documentos con flujo, Indicadores, Planes) y un tablero. Si cada módulo
se construye sobre la estructura vieja, habrá que rehacer todas las pantallas al final.

La Fase 12 construye **el cascarón definitivo** (barra lateral por módulos y rol, barra
superior con búsqueda global, campana y menú de usuario con tema), **el sistema de color de
tres capas** (marca configurable, módulo fijo, estado fijo) con **tema oscuro**, **la
pantalla de marca de la entidad** y **los componentes base**, y **migra todas las pantallas
existentes** a ese cascarón. Después de esta fase, ninguna pantalla nueva necesita inventar
su estructura, y otra entidad que instale la plataforma ve su propio nombre, logo y colores
sin tocar código.

El pulido fino (Lighthouse, recorrido por teclado completo, 390 px en cada vista) es de la
Fase 19; aquí se construye el sistema y se deja todo dentro de él sin regresiones.

## 2. Decisiones del usuario (2026-11-04)

1. **Inicio = "Mis tareas" arriba y el mapa de procesos debajo.** El mapa sigue siendo el
   centro del sistema documental; el bloque de tareas crece cuando lleguen los flujos
   (Fase 13).
2. **La entidad es la marca.** Logo y nombre de la entidad en la barra lateral, la pestaña
   del navegador y la pantalla de ingreso. "SGC Integral" aparece solo como nombre de la
   plataforma en la pantalla de ingreso y en el pie de la barra lateral. Sin campo "nombre
   del sistema".
3. **Índice único sobre `lower(usuario)`** en la migración de esta fase (decidido al cerrar
   la Fase 11, `CONTEXT.md` Deuda técnica).
4. Aprobó el resto del diseño tal como se le describió (cascarón, barra superior, color,
   pantalla de marca, migración), incluidas las decisiones de Claude de §17.

## 3. Metas, no metas y anti-metas

**Metas**

- Una sola estructura para toda la app autenticada, persistente al navegar entre el
  portal y la administración.
- Marca configurable desde el admin: nombre, sigla, lema, logo y dos colores, con
  validación de contraste AA que rechaza lo que falle y sugiere lo más cercano que pase.
- Tema claro, oscuro y según el sistema, guardado en el perfil, sin destello al cargar.
- Componentes base reutilizables (tabla, insignia de estado, tarjeta de cifra, encabezado
  de página, estado vacío, botón, campo, diálogo, gráfico de barras) con los tokens.
- Campana y "Mis tareas" montados con sus datos y acciones reales, aunque la Fase 12 no
  los alimente todavía.
- Todas las pantallas existentes (46 páginas) dentro del cascarón, sin textos fijos de
  Suaza ni de "SGC Documental" fuera de la semilla demo.

**No metas**

- Flujos documentales, indicadores, planes, tablero, reportes: fases 13 a 17.
- Correo, planificador, escalamiento: Fase 16.
- Pulido fino, Lighthouse, auditoría de accesibilidad y seguridad: Fase 19.
- Redibujar los formularios existentes: conservan su marcado; toman los tokens.
- Barra lateral plegable a íconos, atajos de teclado en listas, arrastrar y soltar.

**Anti-metas** (si pasa, la fase falló)

- Que una pantalla heredada deje de funcionar o pierda una función al migrar.
- Que el color sea la única señal de estado en algún lugar nuevo.
- Que un color elegido por el admin pueda romper el contraste o inyectar CSS.
- Que el logo pueda ejecutar algo: SVG, HTML o un archivo renombrado.
- Que el tema oscuro sea una inversión automática del claro.
- Que el cascarón se remonte al pasar del portal a la administración.

## 4. Restricciones

Rigen todas las de `AGENTS.md` (piso de despliegue, reglas de negocio, stack, convenciones,
reglas fijas de seguridad). Las propias de esta fase:

- **Cero dependencias en runtime** (piso 6): fuentes ya empaquetadas con `next/font`
  (Archivo, Geist, Geist Mono); íconos `lucide-react`; sin CDN. Ninguna librería nueva con
  binarios nativos; **sin `sharp`**: el logo no se recodifica.
- **Sin scripts inline nuevos**: el tema se resuelve en el servidor (atributo en `<html>`)
  y con CSS; la CSP actual (`script-src 'self' 'unsafe-inline'`, heredada) no se relaja ni
  se usa como excusa.
- **Las URL existentes se conservan** (spec maestro DC25). Los grupos de rutas cambian;
  las direcciones no.
- **Migraciones solo aditivas** (piso 11): la 0003 añade columna, tabla e índice; nada se
  renombra ni se borra.
- **Toda página autenticada llama su guard** (`exigirSesion`, `exigirPermiso`,
  `exigirSesionConPendientes`); el test estructural `tests/paginas-sesion.test.ts` se
  actualiza a la estructura nueva en el mismo commit que mueve los archivos.
- **Toda escritura nueva** pasa por `mutacion()` o `requerirSesion()` +
  `requerirPermiso()`, con esquema `zod` `.strict()` y `parsearFormulario`.
- **Accesibilidad no negociable**: teclado, foco visible, contraste AA, `aria-current`,
  `prefers-reduced-motion`, 390 px (el mapa en acordeón), impresión.

## 5. El cascarón

### 5.1 Estructura de rutas y layouts

Un layout de Next conserva su estado al navegar entre las páginas que cuelgan de él. Hoy el
portal (`(portal)`) y el panel (`admin/(panel)`) son árboles hermanos: una barra lateral en
cada uno se remontaría al pasar de Inicio a Usuarios. Por eso **toda la app autenticada
cuelga de un solo grupo `(app)`**, cuyo layout monta el cascarón una vez:

```
src/app/layout.tsx                      html/body, fuentes, data-tema, variables de marca; sin cromo
src/app/(app)/layout.tsx                exigirSesion() + <Cascaron>            [antes (portal)/layout.tsx]
src/app/(app)/page.tsx                  Inicio: Mis tareas + mapa              [antes (portal)/page.tsx]
src/app/(app)/buscar|documentos|procesos|sin-acceso/…                          [antes (portal)/…]
src/app/(app)/admin/(panel)/layout.tsx  exigirEntradaPanel(); sin cabecera propia
src/app/(app)/admin/(panel)/**          las 33 páginas actuales, mismas URL
src/app/admin/acciones*.ts, comun.ts    SE QUEDAN donde están (los importa todo el panel por alias)
src/app/admin/api/**                    SE QUEDAN: handlers actuales + los nuevos del logo
src/app/(cuenta)/**                     pasos de la cuenta: <PantallaCentrada> con marca
src/app/ingreso/**                      ingreso y segundo factor: <PantallaCentrada> con marca
src/app/marca/logo/route.ts             NUEVO, público: sirve el logo configurado
src/app/api/buscar/route.ts             NUEVO, con sesión: resultados para Ctrl K
```

- Dos movimientos con `git mv`, sin cambiar contenido: `(portal)` → `(app)` y
  `admin/(panel)` → `(app)/admin/(panel)`. Dos carpetas `admin` en grupos distintos no
  chocan mientras ninguna URL se defina dos veces (`/admin/*` sale solo de `(app)`;
  `/admin/api/*` solo de `src/app/admin/api`). `AGENTS.md` (convención "Estructura") se
  actualiza en el mismo commit.
- `src/app/admin/ingreso/page.tsx` **se elimina**: solo redirigía a `/ingreso`, y
  `src/proxy.ts` ya hace esa redirección antes de llegar a la página. El test del proxy
  conserva el caso.
- El grupo `(panel)` sigue existiendo por su layout de guard (`exigirEntradaPanel`, capa dos
  del guard), que ya no dibuja nada: la cabecera "Administración SGC", su navegación y el
  botón "Salir" desaparecen porque el cascarón los reemplaza.
- `EncabezadoSitio.tsx` desaparece; `MenuUsuario.tsx` se rehace dentro del cascarón.
- El layout raíz no vuelve a leer la sesión para dibujar cromo: solo resuelve tema y marca.

### 5.2 Barra lateral

Fija a la izquierda a partir de 1024 px (ancho 240 px); por debajo, oculta y accesible desde
el botón de menú de la barra superior como cajón (`<dialog>` nativo con foco atrapado y
cierre con Escape y con el fondo). Contenido, de arriba abajo:

1. **Marca**: logo (si hay) o monograma con la sigla sobre el color secundario; nombre de
   la entidad en dos líneas máximo; sigla debajo en texto secundario. Enlaza a `/`.
2. **Inicio** (`/`), con el contador de "Mis tareas" cuando sea mayor que cero.
3. **Documentos** (grupo con el color del módulo Documentos en su ícono y en el indicador
   del elemento activo):
   - Buscar documentos (`/buscar`): todos.
   - Gestión de documentos (`/admin`): `documentos.ver_historial`.
   - Listado Maestro (`/admin/maestro`): `maestro.ver`.
   - Tipos de documento (`/admin/tipos`): `mapa.administrar`.
   - Mapa de procesos, editor (`/admin/mapa`): `mapa.administrar`.
4. **Administración** (grupo con el color de marca):
   - Entidad y marca (`/admin/entidad`): `entidad.administrar` (permiso nuevo, §7.4).
   - Estructura (`/admin/estructura`): `estructura.administrar`.
   - Usuarios (`/admin/usuarios`): `usuarios.administrar`.
   - Estadísticas (`/admin/estadisticas`): `estadisticas.ver`.
   - Bitácora (`/admin/bitacora`): `bitacora.ver`.
   - Accesos (`/admin/accesos`): `accesos.ver`.
   - Sesiones (`/admin/sesiones`): `sesiones.administrar`.
5. **Pie**: "SGC Integral · v<versión de package.json>".

Un grupo sin entradas visibles no se dibuja. La lista vive en un solo archivo
(`src/componentes/cascaron/navegacion.ts`, sucesor de `enlaces-panel.ts`) con `href`,
etiqueta, ícono, grupo y permiso; la barra lateral y la paleta de búsqueda la comparten. El
elemento activo se marca con `aria-current="page"` (ruta exacta para `/` y `/admin`;
prefijo para el resto). Los módulos de fases futuras (Indicadores, Planes, Tablero,
Reportes) **no aparecen** hasta que existan.

Para el rol consulta la barra muestra Inicio, Buscar documentos y el pie. Para el líder,
lo mismo (sus procesos van en Inicio).

### 5.3 Barra superior

Pegada arriba (sticky), 56 px, con borde inferior en el color de marca de 2 px (dirección
C). De izquierda a derecha: botón de menú (solo bajo 1024 px), espacio flexible, **botón de
búsqueda** con apariencia de campo ("Buscar… `Ctrl K`"; en móvil solo el ícono), **campana**
con contador, **menú de usuario** (nombre y rol; opciones: Mi cuenta, Tema con las tres
opciones como radio, Salir). Las **migas de pan se quedan dentro de cada página**
(`Migas.tsx` como hoy): no se abre un canal página → layout para pintarlas en la barra.

### 5.4 Búsqueda global (`Ctrl K`)

Paleta en `<dialog>` nativo, abierta con `Ctrl K` / `⌘ K` o con el botón. Un solo campo;
debajo, dos secciones:

- **Ir a**: entradas de navegación de §5.2 que coincidan con el texto, filtradas por el
  permiso del usuario (fuente: el mismo archivo `navegacion.ts`).
- **Documentos**: desde dos caracteres, con 200 ms de espera, `GET /api/buscar?q=…`
  devuelve hasta 8 resultados (código, título con resaltado, sigla del tipo, ruta de la
  ficha) usando `buscarDocumentos` con `limite: 8`. **Solo versiones vigentes**, igual que
  `/buscar` hoy: la visibilidad de lo no vigente por rol llega con la Fase 13 (spec maestro
  §5.3) y esta paleta no la adelanta. El handler usa `sesionDePeticion` (401/403) y un
  limitador en memoria de 60 peticiones por minuto por usuario (`crearLimitador`).
- Última fila: "Ver todos los resultados de «q»" → `/buscar?q=…`.

Teclado: flechas, Enter navega, Escape cierra y devuelve el foco al botón. Semántica
`combobox` + `listbox` con `aria-activedescendant`. Los resultados se pintan como texto
(nunca HTML); el resaltado reutiliza las marcas `⟦⟧` → `<mark>` de `TextoResaltado`.

### 5.5 Campana

Tabla `notificaciones` (§10) con consulta `src/db/consultas/notificaciones.ts`:
`crearNotificacion`, `contarNoLeidas`, `listarRecientes(usuarioId, 10)`,
`marcarLeida(id, usuarioId)`, `marcarTodasLeidas(usuarioId)`. El cascarón muestra el
contador de no leídas (tope "9+"). El desplegable lista las 10 más recientes (título,
tiempo relativo en la zona horaria de la instalación, no leída resaltada) y el botón
"Marcar todas como leídas". Pulsar una la marca leída y navega a su `enlace` (ruta interna
validada con `rutaInterna`). Acciones en `src/app/acciones-cuenta.ts`
(`marcarNotificacionLeidaAccion`, `marcarNotificacionesLeidasAccion`): `requerirSesion()`,
solo filas propias, `revalidatePath("/", "layout")`.

Estado vacío: "Sin notificaciones. Aquí verá los avisos del sistema y las tareas que le
asignen." La Fase 12 no genera notificaciones en producción; `crearNotificacion` existe
para la 13 y la semilla demo inserta un aviso de bienvenida por usuario demo (§12).

### 5.6 Inicio y "Mis tareas"

`src/lib/tareas.ts` define el tipo definitivo y la función que la Fase 13 alimentará:

```ts
export type Tarea = {
  id: string;                                  // "<fuente>:<id>", estable
  modulo: "documentos" | "indicadores" | "planes";
  titulo: string;                              // "Aprobar PR-GTH-012 v3"
  detalle: string | null;                      // "Inducción y reinducción"
  vence: Date | null;
  enlace: string;                              // ruta interna
};
export async function misTareas(sesion: Pick<SesionValida, "usuarioId" | "rol">): Promise<Tarea[]>;
```

En la Fase 12 devuelve `[]`. Inicio (`(app)/page.tsx`) muestra arriba el bloque "Mis
tareas" (`MisTareas.tsx` nuevo, en `src/componentes/inicio/`): lista con el color del módulo
como marca lateral, vencimiento como insignia de estado (vencida → crítico, vence hoy →
atención), o el estado vacío "No tiene tareas pendientes. Cuando un documento necesite su
revisión o aprobación, aparecerá aquí." Debajo, para el líder, "Mis procesos" como hoy; y
después el mapa (bandas en escritorio, acordeón bajo 1024 px), que ahora ocupa el ancho
del área de contenido. El `h1` de Inicio pasa a ser "Inicio" con el nombre de la entidad
como texto superior; "Mapa de Procesos" es el `h2` de su sección.

### 5.7 Tema claro, oscuro y según el sistema

- Preferencia en el perfil: columna `usuarios.tema` (`'claro' | 'oscuro' | 'sistema'`, por
  defecto `'claro'`), cargada en `SesionValida.tema`.
- Cookie `sgc_tema` (httpOnly, `SameSite=Lax`, un año, mismo valor) para que la pantalla de
  ingreso y los pasos de la cuenta respeten el último tema del dispositivo.
- El layout raíz escribe `<html data-tema="…">` con `temaEfectivo(sesion, cookie)`: sesión
  → perfil; sin sesión → cookie válida → `'claro'`. Un valor desconocido se trata como
  `'claro'`.
- CSS: los tokens oscuros se aplican a `[data-tema="oscuro"]` y, dentro de
  `@media (prefers-color-scheme: dark)`, a `[data-tema="sistema"]`. La variante `dark:` de
  Tailwind se redefine con `@custom-variant` sobre ese atributo. **Sin JavaScript**: no hay
  destello porque el atributo llega en el HTML del servidor (toda la app es
  `force-dynamic`).
- Acción `cambiarTemaAccion(formData)` en `acciones-cuenta.ts`: `requerirSesion()`,
  esquema `zod` con enum, actualiza perfil y cookie, `revalidatePath("/", "layout")`.
- El andamiaje `.dark` de shadcn (`globals.css`) se reemplaza por los tokens de §6; las 4
  clases `dark:` existentes se revisan.

### 5.8 Pantallas sin cascarón

Ingreso, verificación del segundo factor, aviso de datos, clave inicial, Mi cuenta y
segundo factor usan `PantallaCentrada` (`src/componentes/cascaron/PantallaCentrada.tsx`):
tarjeta centrada con logo o monograma, nombre de la entidad y, debajo del contenido,
"Plataforma SGC Integral" en texto pequeño. Los acentos (botón principal, foco, enlaces)
usan la marca. El tema aplica también aquí.

## 6. Sistema de color y tokens

### 6.1 Tres capas, en `src/app/globals.css`

Los nombres de shadcn (`--background`, `--card`, `--border`, `--foreground`,
`--muted-foreground`, `--primary`, `--ring`…) siguen siendo la API de Tailwind; la Fase 12
les da valores de las tres capas y añade los tokens propios.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--background` | `#f4f6f9` | `#0f1216` | fondo de página |
| `--card` / `--popover` | `#ffffff` | `#161a20` | paneles, tarjetas, barra lateral |
| `--border` | `#e2e6ec` | `#262c35` | bordes |
| `--linea-suave` | `#edf0f4` | `#1f242c` | separadores internos de tabla |
| `--foreground` | `#16181d` | `#e7eaef` | texto |
| `--muted-foreground` | `#5b6472` | `#9aa3b0` | texto secundario |
| `--texto-terciario` | `#8b94a3` | `#6b7483` | metadatos |
| `--mod-documentos` | `#2a78d6` | `#3987e5` | módulo Documentos |
| `--mod-indicadores` | `#1baf7a` | `#199e70` | módulo Indicadores (reservado) |
| `--mod-planes` | `#eb6834` | `#d95926` | módulo Planes (reservado) |
| `--estado-bien` | `#0ca30c` | `#2db52d` | estado bien |
| `--estado-atencion` | `#fab219` | `#fab219` | estado atención |
| `--estado-grave` | `#ec835a` | `#ec835a` | estado grave |
| `--estado-critico` | `#d03b3b` | `#e05555` | estado crítico |
| `--estado-sin-dato` | `#a3abb8` | `#6b7483` | sin dato |

Cada estado tiene además `--estado-<x>-fondo` (tinte para insignias y celdas) y
`--estado-<x>-texto` (texto sobre ese tinte). Valores de partida del claro: fondos
`#e7f6e7`, `#fff5db`, `#fdeee8`, `#fbe7e7`, `#eef0f3`; del oscuro: `#163a16`, `#3d2f0a`,
`#3f2418`, `#3f1a1a`, `#242a33`. Los textos se fijan en el plan con la regla: **contraste
≥ 4.5 : 1 contra su fondo en cada tema**, verificada por un test con `contrasteWCAG`
(`src/lib/contraste.ts`); si un valor de partida no pasa, se ajusta hasta que pase. El
color de estado **nunca va solo**: la insignia lleva texto y, cuando hay espacio, ícono.

`--primary` = `var(--marca-relleno)`, `--primary-foreground` = `#ffffff`,
`--ring` = `var(--marca)`, `--radius` = `0.5rem` (dirección C: esquinas más discretas que
las actuales `0.625rem`).

### 6.2 Marca configurable: derivados y variante oscura

El admin configura **dos colores del tema claro**: `color_primario` y `color_secundario`
(hex `#rrggbb`). `src/lib/marca.ts` deriva en el servidor, con conversión a OKLCH en JS
puro, el juego completo y lo inyecta como `style` en `<html>` (solo tras validar el hex con
`/^#[0-9a-f]{6}$/i`, para que ningún valor pueda inyectar CSS).

La marca cumple **dos papeles distintos**, con tokens distintos, porque un mismo color no
puede servir de relleno con texto blanco y de texto sobre la superficie oscura a la vez
(un relleno legible con blanco es oscuro; un texto legible sobre `#161a20` es claro):

| Token | Papel | Claro | Oscuro |
|---|---|---|---|
| `--marca-relleno` | fondo del botón principal, del elemento activo de la barra lateral, de las franjas de marca; **siempre con texto `#ffffff`** | el primario | el primario, tal cual (P1 garantiza el blanco en los dos temas); borde de 1 px en `--marca` para separarlo de la superficie |
| `--marca-oscurecida` | hover de los rellenos y franja del lema | primario con L bajada 0.08 en OKLCH | igual (sigue legible con blanco) |
| `--marca` | texto, íconos, enlaces, borde activo, anillo de foco, indicador de módulo | el primario | primario con L subida hasta `contraste(·, #161a20) ≥ 4.5`, mismo tono y croma; tope L = 0.85 |
| `--marca-tinte` | fondo suave de fila o elemento activo secundario | `color-mix(in srgb, var(--marca) 10%, var(--background))` | ídem con los valores del tema |
| `--marca-2` | acentos secundarios (íconos, detalles) | el secundario | el secundario |
| `--marca-2-relleno` | fondo del monograma | el secundario si con blanco o con tinta `#16181d` llega a 4.5; si con ninguno llega, el secundario con L bajada hasta `contraste(·, #fff) ≥ 4.5` | igual |
| `--marca-2-contraste` | texto sobre `--marca-2-relleno` | `#ffffff` si `contraste(marca-2-relleno, #fff) ≥ 4.5`; si no, `#16181d` (cumple 4.5 por construcción) | igual |
| `--marca-2-texto` | el secundario usado como texto | L bajada hasta `contraste(·, --background) ≥ 4.5` | L subida hasta `contraste(·, #161a20) ≥ 4.5` |

El resultado para ambos temas se calcula una vez por petición (`cache()` de React) y las
variables oscuras se emiten con sufijo (`--marca-o`, `--marca-2-texto-o`…); `globals.css`
las enlaza bajo el selector del tema oscuro. El admin **no configura colores oscuros**: la
variante se deriva y se muestra en la vista previa de §7.3. Un test de propiedad recorre
una malla de tonos y luminosidades y comprueba que todos los derivados cumplen su regla.

### 6.3 Compatibilidad con las clases actuales

45 archivos usan `text-azul`, `bg-azul`, `bg-azul-profundo`, `ring-azul/20`,
`outline-azul`, `text-azul-tinta`, `text-verde`, `text-verde-texto`. Para no tocarlos
todos en esta fase, en `@theme inline` esos nombres pasan a ser **alias** de los tokens, y
se añade un nombre nuevo para el papel de texto:

| Nombre Tailwind | Apunta a | Nota |
|---|---|---|
| `azul` | `var(--marca-relleno)` | los 25 `bg-azul … text-white` heredados (`FormAccion`, los `Formulario*`, el botón de `/buscar`) siguen cumpliendo AA en los dos temas por P1 |
| `azul-profundo` | `var(--marca-oscurecida)` | hovers y el lema del mapa |
| `azul-tinta` | `var(--foreground)` | títulos: tinta del tema |
| `verde` | `var(--marca-2)` | acentos secundarios |
| `verde-texto` | `var(--marca-2-texto)` | ya es un papel de texto |
| `marca` (nuevo) | `var(--marca)` | texto, bordes e íconos en color de marca |

Un solo token no puede servir de relleno y de texto a la vez (§6.2), así que **las 22
clases `text-azul` heredadas (enlaces y títulos en color de marca) pasan a `text-marca`**
en el mismo commit de los alias, con un reemplazo mecánico verificado por `grep`: en
oscuro, `text-azul` sería el primario oscuro sobre superficie oscura. Los `border-azul`,
`outline-azul` y `ring-azul/…` ad hoc (indicadores de foco y de campo activo) se quedan
con el alias: el indicador de foco real es el anillo global `:focus-visible` de
`globals.css`, que ya usa `--ring` = `--marca`; la Fase 19 los retira al unificar los
campos con `Campo`. Las variantes con opacidad (`ring-azul/20`, `bg-azul/10`) siguen
funcionando porque Tailwind 4 las resuelve con `color-mix`.

### 6.4 Colores del mapa en oscuro

Las bandas (`macroprocesos.color`) son datos, no marca: se conservan. Sus tintes
`color-mix(in srgb, var(--color-banda) 12%, white)` pasan a mezclarse con
`var(--background)`; el texto sobre tinte sigue siendo
`color-mix(in srgb, var(--color-banda) 80%, black)` en claro y pasa a
`color-mix(in srgb, var(--color-banda) 70%, white)` en oscuro (ambos vía una clase
utilitaria `banda-texto` definida una vez en `globals.css`, en lugar de repetir el
`color-mix` en seis archivos). El texto blanco sobre banda oscurecida (F9-D5) no cambia.

## 7. Pantalla "Entidad y marca" (`/admin/entidad`)

### 7.1 Campos y validación

Dos formularios en la misma página: **datos y colores** (una acción) y **logo** (acciones
de subir y quitar).

| Campo | Clave en `configuracion` | Regla `zod` |
|---|---|---|
| Nombre de la entidad | `nombre_entidad` | texto, 3–120 |
| Sigla | `sigla_entidad` | texto, 2–12, sin espacios al borde |
| Lema | `lema` | texto, 0–200 |
| Aviso de tratamiento de datos personales | `aviso_datos_personales` | texto, 0–5000 (ya existía) |
| Color primario | `color_primario` | `/^#[0-9a-f]{6}$/i`, normalizado a minúsculas |
| Color secundario | `color_secundario` | ídem |

Reglas de contraste al guardar (`validarMarca` en `src/lib/marca.ts`), **sobre el tema
claro**; el oscuro se deriva para cumplir por construcción (§6.2):

- **P1** `contraste(primario, #ffffff) ≥ 4.5` — el primario es el relleno del botón
  principal y del elemento activo de la barra lateral, siempre con texto blanco, en los
  dos temas. Un primario que pasa P1 tiene luminancia ≤ 0.18 y por eso contrasta también
  ≥ 4 : 1 con el fondo claro `#f4f6f9`: foco, bordes activos e indicador de módulo quedan
  cubiertos sin una regla aparte.
- **P2** `contraste(secundario, #f4f6f9) ≥ 3.0` — el monograma y los acentos secundarios
  son componentes de interfaz (AA, 1.4.11). El texto sobre el secundario lo resuelve
  `--marca-2-contraste` (blanco o tinta según contraste), así que el secundario puede ser
  claro.

Si falla, la acción devuelve el error con el valor medido y una **sugerencia**: el tono más
cercano que pasa, obtenido bajando L en OKLCH de 0.02 en 0.02 manteniendo tono y croma.
Formato del mensaje: «El color primario #9ecbff no tiene contraste suficiente con el texto
blanco (1,7:1; mínimo 4,5:1). Pruebe #4a74a3.» (el hex de la sugerencia lo calcula el
algoritmo; `#4a74a3` da 4,86:1 y sirve de ejemplo en el manual). El valor nuevo se guarda
solo si todo pasa; la vista previa del cliente (§7.3) muestra el mismo cálculo mientras se
escribe, pero **la validación que vale es la del servidor**.

### 7.2 Logo: subida, almacenamiento y servicio

- Entrada: `<input type="file" accept="image/png,image/jpeg,image/webp">` en un componente
  cliente que envía el archivo con `fetch` a **`POST /admin/api/entidad/logo`** (mismo
  camino que la subida de documentos en `/admin/api/archivos`, componente `ZonaCarga`).
  **No es una Server Action**: el tope de cuerpo de las acciones es 1 MB y no se toca
  (diseño de la Fase 6), y un logo cercano a 1 MB más el sobre multipart lo superaría con
  un error genérico. El handler usa `sesionDePeticion` (401), `puede(sesion,
  "entidad.administrar")` (403), `origenValido` (403) y rechaza con mensaje claro, **antes
  de leer el cuerpo**, un `Content-Length` mayor de 1 MB; después valida el tamaño real.
  Responde JSON `{ ok: true, version }` o `{ ok: false, error }`; el componente muestra el
  mensaje y refresca (`router.refresh()`). **`DELETE /admin/api/entidad/logo`** quita el
  logo con las mismas comprobaciones. Ambos se registran en `tests/handlers-permisos`.
- Validación (`validarLogo` en `src/lib/logo.ts`): tamaño ≤ **1 MB**; MIME por magic bytes
  con `validarTipo` restringido a `png`, `jpg`/`jpeg`, `webp` (nunca SVG: spec maestro
  DC19); dimensiones leídas de la cabecera del archivo con un lector propio para los tres
  formatos (PNG `IHDR`, JPEG `SOF0/2`, WebP `VP8/VP8L/VP8X`): mínimo **64 × 64**, máximo
  **2048 × 2048**. Sin recodificar.
- Almacenamiento: `almacen/marca/logo-<8 hex del SHA-256>.<ext>` vía `resolverRutaAlmacen`;
  claves `logo_ruta`, `logo_mime`, `logo_version` (= los 8 hex). Al guardar uno nuevo o al
  quitarlo, el archivo anterior se borra del almacén tras confirmar la transacción.
- Servicio: `GET /marca/logo` (**ruta pública**, añadida a `RUTAS_PUBLICAS` del proxy porque
  la pantalla de ingreso lo muestra sin sesión). Lee `logo_ruta` y `logo_mime` de la
  configuración, resuelve con `resolverRutaAlmacen` y responde con `Content-Type` del MIME
  guardado, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline;
  filename="logo.<ext>"` y `Cache-Control: public, max-age=86400`. Sin logo configurado,
  404. El cascarón pide `/marca/logo?v=<logo_version>` para invalidar la caché al cambiar.
- Auditoría: `subir_logo` con `{ nombre, bytes, mime, ancho, alto }`, `quitar_logo`.
- Favicon: sigue siendo el estático; derivarlo del logo queda fuera (Fase 19).

### 7.3 Vista previa y mensajes

A la derecha del formulario, una vista previa estática (componente cliente) con una
mini barra lateral y un botón en claro y en oscuro, que recalcula los derivados al
escribir (misma función `derivarMarca`, importable en el cliente porque es pura) y pinta
bajo cada color las razones P1 y P2 con "cumple" o "no cumple" y el valor medido, y el texto de contraste que le toca al monograma. Los textos
de error del servidor se muestran junto al campo.

### 7.4 Permiso y auditoría

Permiso nuevo **`entidad.administrar`** → `admin_sgc`, en `src/lib/permisos.ts`, con su fila
en `tests/permisos.test.ts` (test por celda) y su entrada en `navegacion.ts`. La página
llama `exigirPermiso("entidad.administrar")`. Guardar datos y colores audita
`editar_configuracion` con las claves tocadas (acción existente).

### 7.5 Reorganización de "Textos institucionales"

`CLAVES_TEXTO` de `src/db/consultas/mapa-admin.ts` se parte: `nombre_entidad`, `lema` y
`aviso_datos_personales` pasan a la pantalla de entidad (`src/db/consultas/entidad.ts`,
con `obtenerMarca()` cacheada por petición y `guardarEntidad()`); `/admin/mapa/textos`
conserva `subtitulo_mapa`, `titulo_phva`, `texto_phva` y `patron_codigo` con el título
"Textos del mapa y código de documentos". Mismo permiso `mapa.administrar` para esa página.

## 8. Componentes base (`src/componentes/ui/`)

HTML nativo + Tailwind con los tokens; shadcn sigue solo como hoja base. Cada componente
tiene un test de render con `react-dom/server` (texto, roles ARIA, clases de estado) donde
aporte algo.

| Componente | Qué resuelve |
|---|---|
| `EncabezadoPagina` | `h1`, descripción, acciones a la derecha, migas opcionales; único patrón de cabecera de página |
| `TablaDatos` | `<table>` con `<caption>` oculto, encabezado pegajoso, filas con hover, columnas numéricas con `tabular-nums`, estado vacío con texto, contenedor con desplazamiento horizontal en móvil |
| `Insignia` | insignia de estado con texto siempre e ícono opcional; variantes `bien`, `atencion`, `grave`, `critico`, `sin-dato`, más `modulo` (color de módulo). `EstadoBadge` se reemplaza: vigente→bien, borrador→atención, anulado→crítico, obsoleto→sin dato |
| `TarjetaCifra` | etiqueta, valor grande, detalle, franja superior con el estado (dirección C) |
| `EstadoVacio` | ícono, título, texto que dice qué hacer, acción opcional |
| `Boton` | primario (marca), secundario, peligro, fantasma; tamaños; estado pendiente |
| `Campo` | etiqueta, control, ayuda y error con `aria-describedby` |
| `Dialogo` | `<dialog>` nativo con foco atrapado, Escape, cierre al fondo, devolución del foco; lo usan la paleta y el cajón de la barra lateral |
| `GraficoBarras` | el existente (`admin/estadisticas/`) movido aquí; relleno con `--mod-documentos`; sin otro cambio de API |

Los formularios existentes **no se reescriben** con `Campo` ni `Boton` (Fase 19); los
nuevos de esta fase sí los usan.

## 9. Migración de las pantallas existentes

Inventario: 46 páginas (6 del portal, 4 de cuenta, 3 de ingreso, 33 del panel), 8 archivos
con `<table>`, 3 con `max-w-[1500px]`, 45 con clases `azul`/`verde`. Reglas:

1. **El cascarón manda el espacio exterior.** El área de contenido tiene `padding` propio y
   ancho máximo de 1400 px centrado; las páginas quitan sus envoltorios
   `mx-auto max-w-[1500px]` y `max-w-6xl`. Una página puede acotar su propio ancho (un
   formulario a `max-w-2xl`), no centrarse contra el cascarón.
2. **Cabecera de página**: cada página con `h1` usa `EncabezadoPagina`; las migas siguen
   donde están. "Administración SGC" y "Ver portal público" desaparecen.
3. **Listas del panel** (`/admin`, usuarios, sesiones, accesos, bitácora, maestro) →
   `TablaDatos`. El Listado Maestro conserva su hoja de impresión.
4. **`EstadoBadge` → `Insignia`** en la lista del panel, la ficha de documento y la
   búsqueda.
5. **Estadísticas** → `TarjetaCifra` + `GraficoBarras`.
6. **Inicio** según §5.6; **proceso, subproceso y ficha** toman la clase `banda-texto`
   (§6.4); el mapa se revisa a 1024, 1280 y 1440 px con la barra lateral.
7. **Textos fijos**: "SGC Documental", "ESE Hospital Nuestra Señora de Fátima", "Hospital
   de Suaza" salen de `layout.tsx` (título y descripción), `ingreso/page.tsx`,
   `maestro/excel/route.ts` (campo `hospital` del encabezado del Excel), `maestro/page.tsx`
   (encabezado de impresión), `EncabezadoSitio.tsx` (se elimina) y `placeholders.ts` (PDF
   de muestra: toma el nombre configurado al sembrar). Un test recorre `src/` y falla si
   esas cadenas aparecen fuera de `src/db/semillas/demo.ts`.
8. **Título del navegador**: `generateMetadata` en el layout raíz: por defecto
   «<nombre_entidad> · SGC», plantilla «%s · <sigla_entidad>».
9. **Impresión**: `@media print` oculta barra lateral, barra superior y botón de menú; el
   contenido ocupa todo el ancho. Se verifica con el Listado Maestro.
10. **Tema oscuro**: cada página migrada se revisa en oscuro (recorrido del controlador con
    capturas) buscando fondos blancos fijos (`bg-white`), textos `text-gray-*` y bordes
    `border-gray-*` heredados, que pasan a tokens.
11. Las `loading.tsx` existentes se ajustan al ancho nuevo; los `Skeleton` toman `--muted`.

## 10. Modelo de datos y migración 0003 (`drizzle/0003_fase12-visual.sql`)

- `usuarios.tema text NOT NULL DEFAULT 'claro'` con `CHECK (tema IN ('claro','oscuro','sistema'))`.
- Tabla `notificaciones`: `id` identity, `usuario_id` bigint NOT NULL → `usuarios(id)` ON
  DELETE RESTRICT, `tipo text NOT NULL`, `titulo text NOT NULL`, `cuerpo text`,
  `enlace text`, `entidad text`, `entidad_id bigint`, `leida_en timestamptz`,
  `creado_en timestamptz NOT NULL DEFAULT now()`; índice `(usuario_id, leida_en, creado_en DESC)`.
  No es inmutable: `leida_en` se actualiza; `sgc_app` la alcanza por los privilegios por
  defecto de `asegurarRolApp`.
- `CREATE UNIQUE INDEX usuarios_usuario_lower_unico ON usuarios (lower(usuario))`.
  **Comprobación previa** en `scripts/arrancar.ts` y en `db:migrate`: antes de migrar, si
  `SELECT lower(usuario) FROM usuarios GROUP BY 1 HAVING count(*) > 1` devuelve filas, el
  arranque se detiene con el mensaje «Hay cuentas duplicadas sin distinguir mayúsculas:
  admin, Admin. Renombre o desactive una antes de actualizar.» (desactivar no basta para el
  índice: hay que renombrar; el mensaje lo dice).
- Claves nuevas de `configuracion` (texto): `sigla_entidad`, `color_primario`,
  `color_secundario`, `logo_ruta`, `logo_mime`, `logo_version`. La tabla no cambia.
- `src/db/esquema.ts` recoge columna, tabla e índice (importaciones relativas).

## 11. Seguridad

Riesgo 8 del spec maestro (HTML sin filtrar) y los que esta fase toca:

- **Logo**: solo PNG, JPEG y WebP por magic bytes; sin SVG; servido con el MIME detectado y
  `nosniff`; ruta por `resolverRutaAlmacen`; tamaño y dimensiones acotados; nunca dentro
  del webroot. Un SVG renombrado `.png` o un PNG de 3 MB se rechazan con mensaje claro. La
  subida va por handler con sesión, permiso y `Origin` verificados y `Content-Length`
  acotado antes de leer el cuerpo.
- **Colores**: hex estricto antes de llegar a `style`; sin él, un valor con `;` o `url(`
  podría inyectar CSS en `<html>`.
- **Tema**: enum estricto en la acción y al leer la cookie.
- **Búsqueda**: `/api/buscar` exige sesión completa, aplica la visibilidad por rol y limita
  a 60/min por usuario; los resultados son texto.
- **Notificaciones**: las acciones operan solo sobre filas del propio usuario (`WHERE
  usuario_id = sesion.usuarioId`); `enlace` pasa por `rutaInterna` antes de redirigir.
- **Permisos**: `entidad.administrar` en la matriz con test por celda; `/admin/entidad` con
  `exigirPermiso`; las acciones con `mutacion`.
- **Ruta pública nueva**: solo `/marca/logo`; el test del proxy lo fija.
- **Origin**: las acciones de formulario heredan la verificación de `mutacion`.

## 12. Semillas y recursos

- `semilla:minima`: `nombre_entidad` "Entidad sin configurar", `sigla_entidad` "SGC",
  `color_primario` `#1b4e8e`, `color_secundario` `#2e9b47`, sin logo, `lema` vacío.
- `semilla:demo`: Suaza (nombre actual, sigla "HNSF", lema actual, los mismos colores), logo
  demo copiado de `src/db/semillas/recursos/logo-demo.png` (PNG propio de 256 × 256,
  monograma; no es el escudo real, pendiente §11 del spec maestro) al almacén, y una
  notificación "Bienvenida al SGC Integral" por usuario demo (así la campana se demuestra).
- Las dos semillas siguen vaciando la base; crean la carpeta `almacen/marca` si falta.

## 13. Pruebas

Además de los tests de cada componente y función citados arriba:

- Estructurales: `paginas-sesion` (rutas `(app)`), `acciones-permisos` (acciones nuevas),
  `acciones-cuenta-cache` (las nuevas que redirigen revalidan), `handlers-permisos`
  (`/api/buscar` 401/403/200 y solo vigentes; `POST`/`DELETE /admin/api/entidad/logo`
  401/403 por permiso y por `Origin`, 413 por `Content-Length`, 200; `/marca/logo` 404/200
  y `nosniff`), `proxy-matcher` (`/marca/logo` pública; `/admin/ingreso` redirige),
  `permisos` (celda nueva), textos fijos (§9.7).
- Color: parseo hex, conversión OKLCH ida y vuelta, `contrasteWCAG` de P1 y P2, sugerencia
  que pasa, derivados que cumplen su regla (`--marca` oscuro ≥ 4.5 sobre `#161a20`;
  `--marca-relleno` ≥ 4.5 con blanco en los dos temas; `--marca-2-contraste` ≥ 4.5 sobre `--marca-2-relleno`, no sobre
  `--marca-2`; `--marca-2-texto` ≥ 4.5 sobre su fondo) en una malla de 12 tonos × 5
  luminosidades × 3 cromas; textos de estado ≥ 4.5 sobre sus fondos en ambos temas.
- Logo: acepta PNG/JPEG/WebP válidos; rechaza SVG renombrado, PDF, 1 MB + 1 byte, 32 × 32
  y 4096 × 4096; lector de dimensiones contra archivos pequeños de prueba en `tests/recursos/`.
- Tema: `temaEfectivo` con sesión, con cookie, con cookie inválida; la acción rechaza
  `"azul"`.
- Notificaciones (BD): crear, contar, listar 10, marcar propias, no marcar ajenas.
- Entidad (BD): guardar con colores válidos; rechazar P1 y P2 por separado con el
  mensaje y la sugerencia; auditoría con las claves.
- `misTareas` devuelve `[]` con el tipo (asegura la firma para la Fase 13).
- Migración 0003: `tema` con CHECK, `notificaciones` con FK RESTRICT, índice único
  insensible a mayúsculas (insertar `ZZ_X` tras `zz_x` falla), comprobación previa con
  duplicados simulados en una transacción que se revierte.
- Recorrido del controlador (Playwright, imagen de producción en 9081): la demostración de
  §14 completa, en claro y oscuro, con capturas de Inicio, un proceso, una ficha, la lista
  de usuarios, el Listado Maestro (pantalla e impresión) y la pantalla de entidad.

## 14. Demostración (criterios de cierre)

1. Como Admin SGC, en Entidad y marca cambiar nombre, sigla, lema, logo y los dos colores;
   la barra lateral, la pestaña del navegador, la pantalla de ingreso y el encabezado del
   Excel del Listado Maestro muestran los valores nuevos.
2. Intentar el primario `#9ecbff`: rechazado con la razón medida (contraste con el texto
   blanco) y una sugerencia; la sugerencia se acepta y los botones siguen con texto blanco
   legible en claro y en oscuro.
3. Subir un SVG renombrado `.png` y un PNG de 3 MB: ambos rechazados con mensaje claro.
4. Cambiar el tema a oscuro, salir y volver a entrar: sigue oscuro y la pantalla de ingreso
   también; "según el sistema" obedece al sistema operativo; no hay destello al cargar.
5. Entrar con `gerente`, `control.interno`, `lider.gth` y `consulta`: la barra lateral
   muestra solo lo permitido; `consulta` ve Inicio y Buscar; `lider.gth` ve "Mis procesos"
   en Inicio; `/admin/entidad` para `control.interno` → `/sin-acceso`.
6. `Ctrl K`: «induc» lista documentos y Enter abre la ficha; «usuarios» ofrece la sección
   solo a quien tiene permiso; Escape cierra y devuelve el foco.
7. La campana de un usuario demo muestra 1; abrir, marcar leída, el contador baja a 0.
8. Inicio muestra "Mis tareas" vacío con su texto y el mapa debajo; a 390 px, el acordeón
   y el cajón de navegación.
9. Imprimir el Listado Maestro: sin barra lateral ni superior.
10. `npm run lint`, `npm test`, `npm run build` y el CI en verde; la imagen del compose dev
    arranca y migra sobre la base de la Fase 11 sin resembrar.

## 15. Manual de usuario

- `docs/manual/usuario/03-conocer-la-plataforma.md`: la barra lateral y qué ve cada rol,
  Inicio y "Mis tareas", búsqueda con `Ctrl K`, la campana, Mi cuenta y el tema, cómo se
  ve en el celular, imprimir.
- `docs/manual/usuario/04-configurar-la-marca-de-la-entidad.md`: nombre, sigla y lema;
  elegir colores y qué significa el contraste (con ejemplos de rechazo); preparar y subir
  el logo (formatos, tamaño, fondo transparente recomendado); dónde se ve cada cosa;
  Textos del mapa. Formato del capítulo 1 (encabezado, numeración, tratamiento de usted).

## 16. Lo que se deja al constructor

- Nombres de archivo y división interna de los componentes del cascarón; si el cajón móvil
  reutiliza `Dialogo`.
- La sintaxis exacta de `@custom-variant` para el atributo `data-tema` y la organización de
  los bloques oscuros en `globals.css`.
- El algoritmo OKLCH (conversión y pasos) y los hex definitivos de los textos de estado,
  siempre que los tests de contraste pasen.
- El lector de dimensiones de imagen (propio) y los archivos de prueba.
- El orden de las tareas, las pruebas de render y los datos de la semilla demo.
- Cómo se obtiene la versión para el pie de la barra lateral.
- El estilo exacto de cada página migrada dentro de §9.

## 17. Decisiones de Claude en este documento (para revisar de una vez)

| # | Decisión | Dónde | Por qué |
|---|---|---|---|
| F12-DC1 | Un solo grupo `(app)` con el cascarón; `(portal)` desaparece; `admin/(panel)` se mueve dentro | §5.1 | Un layout compartido conserva la barra lateral al navegar; dos árboles la remontan |
| F12-DC2 | `admin/ingreso/page.tsx` se elimina | §5.1 | El proxy ya redirige; la página era redundante |
| F12-DC3 | Las migas se quedan en la página, no en la barra superior | §5.3 | Evita un canal página → layout en el cliente |
| F12-DC4 | Barra lateral por módulos (Documentos, Administración); la cabecera "Administración SGC" y "Ver portal público" desaparecen | §5.2 | Spec maestro §5.11: el color de módulo dice dónde estás; ya no hay portal público |
| F12-DC5 | Los módulos de fases futuras no aparecen hasta existir | §5.2 | Un enlace muerto confunde a un funcionario |
| F12-DC6 | Tema por defecto `claro`; `data-tema` en SSR; "sistema" por media query; sin script | §5.7 | Dirección C es clara; sin destello ni `unsafe-inline` nuevo |
| F12-DC7 | La variante oscura de la marca se deriva; el admin no configura colores oscuros | §6.2 | Un admin de hospital no debe calibrar ocho colores |
| F12-DC8 | P1 (primario legible con blanco) y P2 (secundario visible sobre el fondo) con sugerencia del tono más cercano que pasa | §7.1 | Spec maestro §5.10 pide rechazar; la sugerencia evita el ensayo y error; P1 deja seguros los 26 `text-white` heredados |
| F12-DC9 | Logo sin recodificar: magic bytes, 1 MB, 64–2048 px, `/marca/logo` público con `nosniff` | §7.2 | Sin `sharp`; la imagen con MIME correcto y `nosniff` no ejecuta nada |
| F12-DC23 | La marca tiene dos papeles con tokens distintos: `--marca-relleno` (fondo, siempre texto blanco, igual en los dos temas) y `--marca` (texto e íconos, aclarada en oscuro) | §6.2 | Un relleno legible con blanco es oscuro y un texto legible sobre `#161a20` es claro: ningún color cumple ambos; sin esta separación los botones fallan AA en oscuro por construcción |
| F12-DC24 | El logo se sube y se quita por route handler (`/admin/api/entidad/logo`), no por Server Action | §7.2 | El tope de 1 MB de las acciones no se toca (Fase 6); el handler puede rechazar un archivo grande por `Content-Length` con mensaje claro |
| F12-DC10 | Alias de `azul`/`verde` a los tokens de marca y `text-azul` → `text-marca` mecánico; el resto del renombrado en F19 | §6.3 | 45 archivos toman la marca con un solo cambio de texto; los enlaces siguen legibles en oscuro |
| F12-DC11 | Tintes del mapa mezclados con la superficie y clase `banda-texto` | §6.4 | Funcionan en oscuro y dejan de repetir el `color-mix` |
| F12-DC12 | `notificaciones` nace ahora con `crearNotificacion`; la demo siembra una bienvenida | §5.5, §12 | DC21 del spec maestro; la campana se demuestra con datos reales |
| F12-DC13 | `misTareas` devuelve `[]` con el tipo definitivo | §5.6 | La Fase 13 solo añade fuentes |
| F12-DC14 | `/api/buscar`: 8 resultados, 60/min por usuario, solo vigentes como `/buscar` | §5.4 | Reutiliza `buscarDocumentos` sin modo nuevo; la visibilidad de lo no vigente por rol es de la Fase 13 |
| F12-DC15 | "Textos institucionales" se parte en Entidad y marca / Textos del mapa | §7.5 | Nombre, lema y aviso son de la entidad, no del mapa |
| F12-DC16 | Comprobación previa de duplicados antes de la migración 0003 | §10 | Una base heredada con `admin` y `Admin` no debe dejar el contenedor en bucle de arranque |
| F12-DC17 | Componentes propios con HTML nativo y `<dialog>`; shadcn solo como hoja base | §8 | Menos capas; `<dialog>` resuelve foco y Escape |
| F12-DC18 | Listas y insignias migran; los formularios conservan su marcado | §8, §9 | Donde más se ve el sistema con menos riesgo; F19 unifica |
| F12-DC19 | Pie de la barra lateral "SGC Integral · versión" | §5.2 | Decisión 2 del usuario: el producto en el pie |
| F12-DC20 | Permiso nuevo `entidad.administrar` (admin_sgc) | §7.4 | La marca es de la entidad, no del mapa |
| F12-DC21 | Título «<nombre> · SGC», plantilla «%s · <sigla>» | §9.8 | La pestaña identifica a la entidad, como decidió el usuario |
| F12-DC22 | `--radius` baja a `0.5rem` | §6.1 | Dirección C: esquinas discretas, bordes en vez de cajas |

## 18. Riesgos

- **La migración se desborda.** Mitigación: primero tokens y alias (toda la app cambia de
  color sin tocar páginas), luego el cascarón, luego página por página con la lista de §9
  como checklist; lo que no sea cascarón, tabla, insignia o texto fijo, a la Fase 19.
- **El mapa en oscuro o con menos ancho.** Mitigación: §6.4 y revisión a tres anchos; si
  una banda no cabe, el grid de tarjetas ya es `auto-fill`.
- **Mover 40 archivos rompe importaciones y tests.** Mitigación: una sola tarea de
  movimiento con `git mv`, sin cambios de contenido, con los tests estructurales ajustados
  en el mismo commit y la suite verde antes de seguir.
- **`<dialog>` y `color-mix`.** Soportados por Chrome, Edge, Firefox y Safari actuales;
  `color-mix` ya se usa en la app. El hospital usa navegadores actuales (spec maestro §4).
- **Un color de marca extremo** (muy claro o casi negro). Un primario claro falla P1 y se
  rechaza con sugerencia; uno casi negro pasa P1 y en oscuro `--marca` lo aclara hasta el
  tope L = 0.85 (el test de malla cubre los extremos); un secundario claro pasa con texto
  de tinta en el monograma.
- **Base heredada con usuarios duplicados.** F12-DC16 detiene el arranque con el mensaje;
  el manual técnico de la Fase 20 lo documenta.
