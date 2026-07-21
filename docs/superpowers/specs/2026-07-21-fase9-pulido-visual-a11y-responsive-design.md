# Fase 9 — Pulido visual, animaciones, accesibilidad y responsive

> Spec de diseño. Fecha: 2026-07-21. Estado: aprobado por el usuario (bloques 1–3).
> Fase anterior: 8 (Listado Maestro + estadísticas + bitácora), cerrada y pusheada.
> Referencia de alcance: `PLAN.md` §Fase 9.

## 1. Objetivo

Pasada completa de calidad visual y de accesibilidad sobre el portal, dejándolo listo
para el despliegue (Fase 10). Dos metas con el mismo peso ("ambos por igual", decisión
del usuario 2026-07-21):

1. **Sensación premium** (referencia: Linear, Vercel, Stripe Docs): que el portal se
   sienta un solo sistema pulido, no vistas sueltas.
2. **Accesibilidad y corrección** que cumpla los criterios duros del plan: Lighthouse
   a11y ≥ 95, navegación por teclado impecable, contraste AA, `prefers-reduced-motion`
   respetado, y recorrido en celular real sin fricción.

No introduce lógica de negocio nueva. No cambia el esquema de BD. No cambia reglas ISO.

## 2. Decisiones estructurales (tomadas en el brainstorming, 2026-07-21)

| # | Decisión | Porqué |
|---|---|---|
| F9-D1 | **Sin modo oscuro.** Se deja el andamiaje `.dark` de shadcn como está (tokens genéricos), sin toggle, sin persistencia y sin afinar a la marca. | Intranet de trabajo diurno, un solo admin, funcionarios de consulta. Afinar y verificar el oscuro en cada vista rinde menos que invertir ese esfuerzo en el modo claro. YAGNI. |
| F9-D2 | **Animación 100% CSS puro.** No se introduce Motion (Framer) pese a estar en el stack. | Frugal para el NAS (4 GB, offline): cero JS extra en páginas públicas. A esta escala (200 docs / 20 usuarios) CSS/keyframes alcanza. Consistente con D22. |
| F9-D3 | **Cobertura premium:** páginas públicas + vistas del panel cara-a-auditor (Maestro, Estadísticas, Bitácora). Los CRUD internos del admin (crear/editar documento, editor del mapa, tipos) reciben **solo** corrección de a11y/teclado/responsive, sin el pulido fino. | Mejor relación esfuerzo/valor: el pulido rinde donde lo ve un auditor o funcionario; los formularios de un solo usuario no necesitan la misma artesanía. |
| F9-D4 | La verificación de la fase es **manual/herramienta** (Lighthouse, teclado, celular real), no TDD de píxeles. Solo se automatizan aserciones de a11y estructural que no sean frágiles. | El grueso del criterio de aceptación se *ejecuta y se observa*; inventar tests de píxeles sería frágil y de bajo valor. |

## 3. Alcance por bloques

### Bloque A — Fundamentos visuales (tokens y primitivas)

Sin tocar la identidad ya aprobada (azul `#1b4e8e` / verde `#2e9b47`, tipografía
Archivo + Geist, lienzo frío `#f6f8fb`):

- **Tokens de elevación.** Hoy las `card` son planas (`oklch(1 0 0)` sin sombra). Definir
  2–3 niveles de sombra suave como CSS custom properties (`--sombra-1/2/3`) y aplicarlos
  con criterio: tarjetas del mapa, fichas de documento, tarjetas de resultado de búsqueda,
  tarjetas del dashboard. Sombra sutil y hospitalaria, sin drama.
- **Tokens de transición.** `--dur-rapida` (~120 ms), `--dur-media` (~220 ms) y una curva
  de salida compartida (`--ease-salida`), para que hover, foco y entradas usen los mismos
  tiempos y curvas. Un solo lenguaje de movimiento.
- **Ritmo y tipografía.** Afinar el ritmo vertical y la jerarquía (display vs. cuerpo) en
  las vistas premium; consistencia de radios (ya existe la escala `--radius`). Ajustes
  puntuales, no rediseño.

Ubicación: `src/app/globals.css` (bloque `@theme` / `:root`) y utilidades reutilizables.

### Bloque B — Movimiento con propósito (CSS puro, respeta `prefers-reduced-motion`)

El bloque global `@media (prefers-reduced-motion: reduce)` ya existe en `globals.css` y
neutraliza animaciones/transiciones; toda animación nueva queda cubierta por él.

- **Entradas escalonadas reutilizables.** Generalizar el patrón existente `.banda-animada`
  (keyframe `aparecer-banda` + `animation-delay: calc(var(--indice) * Nms)`) a una utilidad
  aplicable a grillas de tarjetas: resultados de búsqueda, subprocesos de un proceso,
  documentos de una ficha, tarjetas del panel. El índice lo fija el server component al
  mapear.
- **Microinteracciones.** Hover/press en tarjetas (lift sutil + borde tintado con la
  identidad), botones y enlaces; foco y hover comparten los tokens de transición del
  bloque A. Coherente con lo que ya hace `TarjetaProceso`.
- **Skeletons (no spinners).** Un componente `Skeleton` (shimmer por keyframes,
  desactivado bajo reduced-motion) y un `loading.tsx` por ruta en las superficies premium:
  `/` (mapa), `/procesos/[slug]`, `/procesos/[slug]/[sub]`, `/documentos/[codigo]`,
  `/buscar`, y `/admin/(panel)/maestro`, `/estadisticas`, `/bitacora`. Aprovecha el
  streaming del App Router.

### Bloque C — Accesibilidad (criterio duro)

- **Anillo de foco global y sistemático.** Un `:focus-visible` consistente (anillo ~2px
  con offset, color `--ring` institucional, contraste AA) para todo elemento interactivo,
  reemplazando los ~40 usos ad-hoc dispersos. Nunca `outline: none` sin reemplazo visible.
- **Enlace "Saltar al contenido"** al inicio de cada layout (público y panel), visible al
  recibir foco por teclado, que salta al `<main>`.
- **Auditoría de teclado, vista por vista.** Operar todo sin ratón:
  - Toggle "incluir subprocesos" del mapa/proceso (server-driven por links ✓).
  - Acordeón móvil del mapa (`<details>/<summary>` nativos ✓ — solo verificar).
  - Campo de búsqueda con debounce (que el foco no se pierda al re-renderizar).
  - Descargas de la ficha y el visor PDF (D31: el overlay de activación no debe atrapar
    el foco del teclado ni la navegación de la página).
  - Tablas del panel, filtros y **paginación de la bitácora** (conserva filtros ✓).
  - Confirmaciones por `<details>` de publicar/anular.
- **Contraste AA de tokens.** Validar los pares reales y ajustar los que no lleguen a
  4.5:1 (texto normal) o 3:1 (texto grande / componentes):
  - `muted-foreground #55677f` sobre lienzo `#f6f8fb`.
  - Texto sobre bandas derivadas con `color-mix` (D20).
  - Badges de estado y la marca OBSOLETO/ANULADO.
- **ARIA existente (solo verificar, no rehacer):** SVG del mapa con roles/labels (Fase 3),
  gráfico de barras con tabla equivalente `sr-only` (Fase 8), íconos de formato con
  etiqueta textual + tamaño (regla no negociable). Confirmar que siguen correctos.

### Bloque D — Responsive / celular real

- **Barrido a 360–390 px** de cada vista premium. El mapa ya colapsa a acordeón (D9); el
  foco está en vistas de contenido y tablas.
- **Tablas de escritorio.** Maestro y Bitácora tienen muchas columnas. Por tabla, decidir
  según legibilidad entre: (a) contenedor con **scroll horizontal accesible** con
  indicación visual de que hay más, o (b) **reflow a tarjetas apiladas** en móvil. Se elige
  por tabla; ambas opciones son válidas.
- **Objetivos táctiles ≥ 44 px** en enlaces, botones, controles de filtro y paginación.
- **Encabezado y buscador** (`EncabezadoSitio`, form GET global) usables con una mano.

### Bloque E — Deuda técnica

- **`npm audit` moderado.** Revisar los avisos (transitivos del scaffold/tooling), aplicar
  `npm audit fix` donde sea seguro, y documentar en `CONTEXT.md` los que queden (con la
  razón) si resolverlos rompiera el build. Confirmar `lint` + `build` + tests verdes
  después.

## 4. Estrategia de pruebas

- **Automatizado donde aporta y no es frágil:** presencia del enlace "saltar al contenido"
  en los layouts; existencia de `loading.tsx` en las rutas premium; que el `Skeleton`
  respete `prefers-reduced-motion`; función(es) pura(s) nueva(s) con su test si alguna
  geometría lo amerita.
- **No se inventan tests de píxeles.** El grueso del criterio es manual/herramienta.
- **Cero regresión:** los 161 tests actuales siguen verdes. Los 5 rojos preexistentes del
  seed (docs manuales `PR-GTH-990/991` que inflan el conteo de vigentes) siguen siendo los
  conocidos; **no borrar `PR-GTH-991`**.

## 5. Verificación antes de cerrar la fase

1. `npm run lint` y `npm run build` limpios.
2. Suite de tests sin regresión (161 verdes; 5 rojos preexistentes documentados).
3. **Lighthouse a11y ≥ 95** en las 8 vistas principales (inicio/mapa, proceso, subproceso,
   ficha, buscar, Maestro, Estadísticas, Bitácora) — se capturan los números.
4. **Barrido de teclado** completo en navegador real (Playwright) y se reporta.
5. **Recorrido móvil** automatizado (Playwright viewport ~390 px) + **guion para el celular
   real del usuario** (criterio de aceptación que confirma el usuario).
6. `CONTEXT.md` actualizado con el cierre de la Fase 9 y las decisiones F9-D1..D4, más un
   commit de cierre descriptivo.

## 6. Orden de ejecución

Plan TDD por tareas, **un commit por tarea en `main`**, en un orden que deja algo
demostrable pronto:

1. Fundamentos: tokens de elevación/transición + anillo de foco global + skip-link.
2. Movimiento: utilidad de entrada escalonada + microinteracciones + `Skeleton` +
   `loading.tsx` por ruta premium.
3. A11y: barrido de teclado + contraste AA + ajustes de tokens.
4. Responsive: barrido móvil + tablas del panel (scroll/reflow) + objetivos táctiles.
5. Deuda técnica: `npm audit`.
6. Verificación final: Lighthouse, teclado, móvil; actualizar `CONTEXT.md`; commit de
   cierre.

## 7. Fuera de alcance (explícito)

- Modo oscuro (F9-D1).
- Motion/Framer (F9-D2).
- Pulido fino de los CRUD internos del admin (F9-D3): solo reciben a11y/teclado/responsive.
- Convención oficial de códigos (`patron_codigo`): sigue pendiente del usuario, no bloquea.
- Despliegue, respaldos y documentación de instalación: Fase 10.
- Cambios de esquema de BD o de reglas de negocio ISO.
