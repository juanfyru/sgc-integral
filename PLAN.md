# PLAN.md — Plan por fases

Portal de control de documentos ISO 9001:2015 para la ESE Hospital Nuestra Señora de
Fátima de Suaza. Reglas permanentes en `CLAUDE.md`; estado vivo en `CONTEXT.md`.

> **SGC Integral** es la variante ampliada de `sgc-suaza`, bifurcada el 2026-11-03 en
> `9644ceb`. Las Fases 0–10 de abajo son **heredadas** (ya construidas y verificadas en
> el proyecto original). Las fases nuevas van en §Fases de la variante.

Principio rector: **cada fase termina en algo que el usuario puede VER y probar.**
Al cierre de cada fase: actualizar `CONTEXT.md` + commit + instrucciones de prueba.

---

## Arquitectura en una vista

```
[Funcionario, LAN/móvil]                    [Admin (1 persona)]
        │ sin login, solo lectura                  │ login (Argon2id + cookie httpOnly)
        ▼                                          ▼
   ┌─────────────────────────────────────────────────────┐
   │  Next.js standalone (contenedor ARM64, ≤768 MB)     │
   │  · Mapa interactivo data-driven (SVG/CSS grid)      │
   │  · Navegación mapa→macro→proceso→subproceso→doc     │
   │  · Búsqueda FTS español + pg_trgm + unaccent        │
   │  · Panel admin: carga, versionado, mapa, maestras   │
   │  · Sirve archivos desde fuera del webroot           │
   └────────────┬───────────────────────┬────────────────┘
                │ red interna Docker     │ bind mount
                ▼                        ▼
   ┌───────────────────────┐   ┌──────────────────────────┐
   │ PostgreSQL 16 ARM64   │   │ Carpeta compartida NAS   │
   │ (≤512 MB, volumen     │   │ /share/SGC-Documentos    │
   │ local, sin puerto     │   │ (archivos, respaldos     │
   │ al host)              │   │ pg_dump; snapshots QNAP) │
   └───────────────────────┘   └──────────────────────────┘

TLS + hostname (https://calidad.hospital.local): reverse proxy nativo de QTS.
CI: GitHub Actions → buildx linux/arm64 → GHCR + imagen .tar (despliegue offline).
```

## Decisión de diseño central: layout del mapa por bandas

**Elegida (validada por el usuario): bandas fijas + contenido configurable.**

- La **plantilla espacial** vive en el código: banda A (estratégicos) arriba, B
  (misionales) al centro, C (apoyo) abajo, D (evaluación y mejora) al pie; entradas a la
  izquierda, salidas a la derecha; PHVA y lema en posiciones fijas.
- El **contenido** vive en BD: macroprocesos (con su banda y orden), procesos,
  subprocesos, colores, íconos, estado activo, y las listas de entradas/salidas/
  convenciones. Todo editable desde el admin.
- Las tarjetas **fluyen automáticamente** dentro de cada banda (CSS grid). Agregar el
  proceso #8 a misionales no requiere tocar código: la banda reacomoda.
- Las **flechas conectan bandas, no tarjetas**: sobreviven a cualquier cambio de
  contenido. Se dibujan en SVG con las tres convenciones del mapa oficial (orientan y
  dirigen / interacción y soporte / evaluación y mejora continua).

Alternativas descartadas: editor drag & drop de posiciones libres (sobreingeniería, el
admin puede romper el diagrama) y bandas 100 % dinámicas (innecesario hoy; el campo
`banda` del macroproceso deja esa puerta abierta sin costo).

**Estrategia mobile: acordeón por macroproceso.** En viewport angosto las bandas se
apilan verticalmente como secciones colapsables (encabezado con color, ícono y conteo;
al expandir, la lista de procesos como filas táctiles). Se descarta zoom/pan: el texto
del mapa completo es ilegible en un celular y el paneo pierde el contexto. Entradas/
salidas/PHVA pasan a secciones secundarias al pie. El acordeón mantiene la misma fuente
de datos y la accesibilidad (son botones reales, no gráficos).

**Accesibilidad del mapa (ambas vistas):** cada tarjeta es un elemento enfocable con
nombre accesible ("Consulta Externa, proceso misional, 14 documentos vigentes"); orden
de tabulación = orden visual; las flechas decorativas van `aria-hidden`; el mapa
completo tiene un equivalente lineal (el propio acordeón sirve de fallback universal).

## Modelo de datos (se detalla y propone formalmente en Fase 2)

Entidades previstas — Drizzle + migraciones versionadas:

**Mapa configurable**
- `macroprocesos`: nombre, letra (A–D), banda, orden, color, ícono, slug, activo.
- `procesos`: macroproceso_id, nombre, **sigla** (para códigos, ej. GTH), orden, ícono,
  slug, activo, descripción.
- `subprocesos`: proceso_id, nombre, orden, slug, activo.
- `elementos_perifericos`: tipo (`entrada` | `salida` | `convencion`), texto, ícono,
  orden, activo. Lema y textos institucionales en `configuracion` (clave-valor).

**Documentos (control ISO 7.5)**
- `tipos_documento` (tabla maestra configurable): nombre, sigla (PR, FT, MN…), orden,
  es_diligenciable (pista de UI), activo.
- `documentos`: código (único, estable entre versiones), título, tipo_id, descripción,
  palabras_clave, columna `tsv` generada para FTS.
- `documento_versiones`: documento_id, número de versión, **estado** (`borrador` |
  `vigente` | `obsoleto` | `anulado`), fechas de elaboración/revisión/aprobación,
  elaboró/revisó/**aprobó**, resumen de cambios.
  **Índice único parcial: un solo `vigente` por documento** (la regla de negocio central
  se refuerza en la BD, no solo en código).
- `archivos`: version_id, **rol** (`principal` | `editable` | `anexo`), ruta, nombre
  original saneado, tamaño, **mime detectado por magic bytes**, extensión, hash SHA-256.
  (Una versión puede publicar PDF de lectura + Word/Excel diligenciable a la vez.)
- `documento_proceso` (unión M:N): documento_id + (proceso_id **o** subproceso_id,
  exactamente uno, con CHECK) + `es_principal`.
  **Exactamente una asociación principal por documento** (índice único parcial). La
  principal define propietario y evita doble conteo en el Listado Maestro; las demás son
  de uso/consulta y se muestran como "También aplica aquí".

**Operación**
- `usuarios` (admin) y `sesiones`.
- `auditoria`: usuario, acción, entidad, entidad_id, detalle (jsonb), timestamp.
- `eventos_consulta`: tipo (`vista` | `descarga`), documento/versión, IP, user-agent,
  timestamp (D8 — trazabilidad sin login).
- `busquedas`: término, cantidad de resultados, timestamp (las búsquedas con 0
  resultados dicen a calidad qué documentación falta).

**Regla de conteo (D10):** las tarjetas del mapa muestran documentos **vigentes** que
aplican al nodo (asociación principal o secundaria), **incluyendo sus descendientes**.
El Listado Maestro cuenta cada documento **una vez**, por su asociación principal.

## Fases

> Fases 0–10: heredadas de `sgc-suaza` (completas al bifurcar).

### Fase 0 — Planeación ✅ (esta sesión)
**Entregable:** `CLAUDE.md`, `CONTEXT.md`, `PLAN.md`; mapa validado; stack cerrado.
**Criterios de aceptación:** visto bueno del usuario a los tres archivos.

### Fase 1 — Esqueleto que corre en ARM64
**Entregable demostrable:** página "hola" de Next.js standalone + Postgres, ambos en
Docker Compose local; GitHub Actions construyendo la imagen `linux/arm64` y publicando
a GHCR **más el artefacto `.tar`** para despliegue offline.
**Alcance:** repo GitHub (cuenta personal), Next.js + TS estricto + Tailwind + shadcn/ui,
Dockerfile multi-stage ARM64, `docker-compose.dev.yml`, healthchecks, fuentes
self-hosted, cabeceras de seguridad base.
**Criterios de aceptación:**
- `docker buildx build --platform linux/arm64` termina en verde en CI y sube imagen + tar.
- La app corre local con compose; `/api/salud` responde e incluye conectividad a la BD.
- Ninguna petición de la página sale a internet (verificado con la pestaña Network).

### Fase 2 — Esquema de BD + seed del mapa real
**Entregable demostrable:** migraciones aplicadas; seed con el mapa validado (Apéndice A)
y ~25 documentos ficticios verosímiles (incluyendo los casos M:N: formato de acta y
formato de informe asociados a varios procesos); consultas de verificación listas.
**Antes de codificar:** proponer el esquema Drizzle completo (DDL) al usuario — regla
"proponer antes de construir".
**Criterios de aceptación:**
- Índices únicos parciales (una versión vigente; una asociación principal) probados con
  tests que intentan violarlos y fallan.
- FTS en español + `unaccent` + `pg_trgm` operativos (query de prueba: "consulta esterna"
  encuentra Consulta Externa).
- El usuario revisa el seed renderizado como texto/tabla y lo aprueba.

### Fase 3 — El mapa de procesos interactivo (corazón del producto) ⭐
**Entregable demostrable:** la página de inicio ES el mapa, reconstruido desde BD:
cuatro bandas, entradas/salidas, PHVA, convenciones, lema, colores institucionales.
Hover eleva la tarjeta y muestra el conteo de documentos vigentes; clic navega con
transición suave a la vista del proceso (placeholder). Acordeón funcional en mobile.
**Está temprano a propósito:** es el mayor riesgo técnico y de diseño; se valida antes
de invertir en el resto.
**Criterios de aceptación:**
- El mapa se reconoce de inmediato como el mapa oficial de las carteleras.
- 100 % data-driven: desactivar un proceso en BD lo quita del render sin tocar código.
- Navegable por teclado con foco visible; `prefers-reduced-motion` respetado.
- Usable en un celular (acordeón) y en la pantalla del hospital.
- Veredicto del usuario: "esto no parece software del Estado".

### Fase 4 — Navegación en profundidad
**Entregable demostrable:** recorrido completo Mapa → Macroproceso → Proceso →
Subproceso → Documento con datos del seed.
**Alcance:** vista de proceso (caracterización, documentos propios, sección "También
aplica aquí" visualmente distinguible, tarjetas de subprocesos con conteo, **toggle
"incluir subprocesos"**); vista de subproceso (documentos agrupados por tipo); ficha de
documento (metadatos de control, vista previa PDF embebida, descarga, **formatos y
anexos vinculados**, chips navegables de todos los procesos donde aplica); breadcrumbs
persistentes; navegación lateral entre hermanos; mini-mapa indicador de posición;
íconos de formato por MIME (colores convencionales, etiqueta textual + tamaño,
`aria-label`, fallback genérico, señal diligenciable vs. solo lectura).
**Criterios de aceptación:**
- Desde cualquier documento se llega a cualquier otro sin volver al inicio.
- El formato de acta aparece en todos sus procesos, distinguido como secundario donde
  no es propio, y su ficha muestra todos los chips.
- Los archivos servidos desde fuera del webroot con `Content-Type`/`Content-Disposition`
  correctos; sin path traversal (test).

### Fase 5 — Búsqueda + filtros facetados
**Entregable demostrable:** barra prominente siempre accesible, resultados instantáneos
(debounce), filtros combinables (tipo, proceso, subproceso, fechas), resaltado de
coincidencias.
**Criterios de aceptación:**
- `GTH` (parcial de código) trae todo talento humano; tolera errores de tipeo y acentos.
- Solo aparecen documentos vigentes.
- Vacío elegante: sugerencias, nunca un callejón sin salida.
- Cada búsqueda queda registrada (término + cantidad de resultados).
- Rate limiting activo en búsqueda y descargas.

### Fase 6 — Auth + panel admin: carga y versionado
**Entregable demostrable:** login del admin; carga drag & drop multiarchivo; formulario
de metadatos con validación fuerte (patrón de código configurable — pendiente la
convención definitiva del usuario, ver `CONTEXT.md`); **publicar nueva versión en un
clic** con obsolescencia automática de la anterior en transacción; el admin ve
obsoletos/borradores con marca visual inequívoca.
**Criterios de aceptación:**
- Auditoría explícita de rutas: ninguna escritura sin sesión (test automatizado que
  recorre las rutas de mutación sin cookie y espera 401/403).
- Validación de subida por extensión **y** magic bytes; ejecutables rechazados.
- Publicar versión nueva → la anterior queda obsoleta e invisible al público,
  verificado en la misma demo.
- Argon2id funcionando en la imagen ARM64 (verificar el prebuild en CI).

### Fase 7 — Editor del mapa
**Entregable demostrable:** el admin agrega/renombra/reordena/desactiva macroprocesos,
procesos y subprocesos; cambia color e ícono; edita entradas/salidas/convenciones;
vista previa antes de guardar. Gestión de tablas maestras (tipos de documento).
**Criterios de aceptación:**
- Crear un proceso nuevo desde el panel y verlo aparecer en el mapa público sin
  despliegue.
- Desactivar ≠ borrar: un proceso con documentos no se puede eliminar, solo desactivar.
- Todo cambio queda en la bitácora.

### Fase 8 — Listado Maestro + estadísticas + bitácora
**Entregable demostrable:** **Listado Maestro de Documentos generado desde la BD**
(el entregable que exige la norma y hoy se hace a mano), exportable a Excel (`exceljs`)
y PDF (estilos de impresión); dashboard de estadísticas (más vistos, más descargados,
**búsquedas sin resultados**); vista de bitácora con filtros.
**Criterios de aceptación:**
- El Listado Maestro cuenta cada documento una vez (asociación principal), con código,
  título, tipo, versión vigente, fechas, responsables y proceso propietario.
- El Excel abre limpio en el Excel del hospital.
- La bitácora responde "¿por qué desapareció este formato?" con quién/qué/cuándo.

### Fase 9 — Pulido visual, animaciones, accesibilidad, responsive
**Entregable demostrable:** pasada completa de calidad visual (referencia: Linear,
Vercel, Stripe Docs): microinteracciones, entradas escalonadas, skeletons (no spinners),
modo oscuro opcional, tipografía y espaciado afinados; auditoría de accesibilidad.
**Criterios de aceptación:**
- Lighthouse accesibilidad ≥ 95 en las vistas principales; navegación completa por
  teclado verificada a mano; contraste AA.
- `prefers-reduced-motion` desactiva toda animación no esencial.
- Recorrido completo en un celular real sin fricción.

### Fase 10 — Despliegue en el NAS + respaldos + documentación
**Entregable demostrable:** el sistema corriendo en el QNAP real en
`https://calidad.hospital.local` (reverse proxy + TLS nativos de QTS).
**Alcance:** `docker-compose.yml` para Container Station (límites de memoria, red
interna, Postgres sin puerto al host, volumen local para datos de PG, bind mount de la
carpeta compartida para archivos); procedimiento de despliegue offline (tar → SMB →
`docker load`); cron con `pg_dump` a la carpeta compartida + snapshots QNAP + Hybrid
Backup Sync; migraciones en el arranque; healthchecks y restart policy.
**Criterios de aceptación:**
- **Restauración probada**: destruir los contenedores y volúmenes en un entorno de
  prueba y reconstruir todo desde el respaldo, documentando cada paso. Un respaldo no
  verificado no es un respaldo.
- `INSTALACION.md`: paso a paso reproducible por el área de sistemas sin el
  desarrollador.
- Consumo de RAM total de los contenedores < 1.3 GB bajo carga de prueba (20
  concurrentes simulados).

## Fases de la variante SGC Integral

Diseño maestro de la ampliación:
`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` (**aprobado** por
el usuario el 2026-11-03). Su §8 fija alcance, demostración, criterios de seguridad y capítulo del
manual de cada fase; su §4.2 lista las reglas heredadas de `AGENTS.md` que quedan
superadas (hardware del NAS, reglas de negocio 3 y 4, "un solo admin"). Orden aprobado
por el usuario el 2026-11-03. Cada fase respeta la metodología de `AGENTS.md`:
propuesta → spec en `docs/superpowers/specs/` → plan en `docs/superpowers/plans/` →
ejecución → cierre con `CONTEXT.md` actualizado e instrucciones de prueba. La seguridad
no es una fase: cada una trae sus criterios; la 19 es la auditoría final contra los 20
riesgos del usuario.

El usuario partió la Fase 13 en tres entregas el 2026-11-05 (13A, 13B y 13C), cada una con su
spec, su plan, su prueba y su fusión; el reparto y los cambios al diseño maestro están en
`docs/superpowers/specs/2026-11-05-fase13a-flujo-documental-design.md` (§2 y §5).

| Fase | Nombre | Entrega demostrable |
|---|---|---|
| 11 | Fundación de acceso ✅ (2026-11-03) | Usuarios con cinco roles y procesos asignados (una por una y por lote desde plantilla), cargos con jerarquía, login en toda la app, clave temporal y cambio obligatorio, bloqueo, TOTP opcional, registro de accesos, roles de BD de mínimo privilegio y bitácora inmutable; Next actualizado; `AGENTS.md` reescrito para el nuevo piso |
| 12 | Nueva estructura visual ✅ (2026-11-04) | Cascarón tipo Linear por rol (barra lateral por módulos, búsqueda `Ctrl K`, campana, tema claro/oscuro), marca configurable por entidad con validación AA, componentes base; pantallas existentes migradas |
| 13A | Documentación SGC: flujo documental ✅ (2026-11-06) | Solicitud con visto bueno del líder, aceptación con duplicidad asistida, código correlativo y plantilla; elaboración; revisión con lista de verificación; aprobación por autoridad con firma por clave; publicación con acta PDF; eliminación por el mismo trámite; visibilidad por rol y nivel de acceso; tareas y avisos; carga de lo ya aprobado; marca de agua con el nombre de quien descarga |
| 13B | Documentación SGC: distribución y puntos de uso ✅ (2026-11-07) | Listas de distribución y acuse de lectura con porcentaje, evidencia de capacitación; copias controladas con sello, recibido y recogida de las obsoletas; puntos de uso y su verificación con porcentaje de conformidad |
| 13C | Documentación SGC: vigencia, externos y normograma ✅ (2026-11-09) | Plazo de revisión, semáforo documental con ratificación y revisión anual con informe firmado; documentos externos con adopción por edición, verificación de vigencia y su matriz; normograma institucional y por proceso con impactos normativos; indicadores del proceso documental; lo heredado de la 13B. La caracterización estructurada no se construyó (decisión del usuario, spec 13C §5): el documento tipo CA la cumple |
| 14 | Indicadores | Ficha técnica versionada, variables compartidas, fórmula con intérprete propio, metas y semáforo por periodo, mediciones con análisis y evidencias, gráficas, cierre de periodo, "sin dato", regulatorios ligados al normograma, permisos por indicador |
| 15 | Planes de mejoramiento | Motor único de acciones: planes, hallazgos con máquina de estados, causa raíz, cuatro tipos de acción, actividades con evidencias, verificación de eficacia, reincidencia, formato Contraloría/Supersalud, objetivos institucionales; "abrir acción" desde documento, proceso e indicador |
| 16 | Notificaciones y planificador | Planificador en la app, cola de correo con reintentos, resumen diario e inmediatas, escalamiento al supervisor, recordatorios, verificación de correo, "olvidé mi clave" |
| 17 | Tablero gerencial y reportes | Tablero por rol con cuatro franjas y matriz de pendientes, foto mensual, informe de revisión por la dirección, catálogo de reportes Excel/PDF con pie de control |
| 18 | Trazabilidad, exportación y respaldos | Bitácora unificada, historial antes/después, exportación completa, respaldo diario cifrado desde la app, vigilancia de 26 h, restauración probada |
| 19 | Pulido, accesibilidad y auditoría de seguridad | Tabla de los 20 riesgos con evidencia, Lighthouse a11y, teclado, 390 px, claro y oscuro, dependencias y cabeceras |
| 20 | Despliegue y documentación | Compose de producción (proxy, app, bd) en Windows (WSL2) o Linux, reinicio sin intervención, TLS, SMTP real, ensayo de actualización desde un respaldo de `sgc-suaza`; manual de usuario, manual técnico y procedimiento de respaldo y restauración |

## Riesgos principales y mitigación

| Riesgo | Mitigación |
|---|---|
| Dependencia nativa sin binario ARM64 descubierta tarde | CI construye ARM64 desde Fase 1; toda dependencia nueva con binarios (`@node-rs/argon2`, `sharp` si se usa) se verifica en CI antes de adoptarla |
| El mapa no "se siente" como el oficial | Fase 3 adelantada; iterar con el usuario antes de construir encima |
| 4 GB de RAM insuficientes | Límites explícitos, prueba de carga en Fase 10, sin servicios extra; Next standalone es frugal a esta escala (200 docs / 20 usuarios) |
| Convención de códigos llega tarde | Patrón validador configurable en BD; se ajusta sin migración cuando el usuario la entregue |
| NAS sin internet complica el despliegue | Artefacto `.tar` desde Fase 1; `INSTALACION.md` cubre el flujo offline completo |

---

## Apéndice A — Seed del mapa (validado por el usuario, 2026-07-15)

**A. Procesos Estratégicos** (banda superior, verde)
1. **Gestión Estratégica**: Gestión Directiva; Gestión Gerencial
2. **Sistema de Gestión de Calidad**: (sin subprocesos)
3. **SOGCS**: Sistema Único de Habilitación; PAMEC; Seguridad del Paciente
4. **Gestión del Riesgo**: (sin subprocesos)

**B. Procesos Misionales (Asistenciales)** (banda central, azul)
1. **Atención al Usuario**: Acceso a los Servicios; Gestión de la Experiencia y
   Satisfacción del Usuario; Participación Ciudadana
2. **Consulta Externa**: Medicina General; Medicina Especializada; Odontología; Psicología
3. **PYM**: Vacunación; Promoción de la Salud; Atención Integral del Riesgo; Gestión de
   la Salud Pública
4. **Apoyo Diagnóstico**: Laboratorio; Imágenes no Ionizantes; Toma de Citologías
5. **Apoyo Terapéutico**: Farmacia; Fisioterapia
6. **Atención Inmediata**: Urgencias; Transporte Asistencial Básico; Atención del Parto
7. **Internación**: Hospitalización Adulto y Pediátrico

**C. Procesos de Apoyo** (banda inferior, azul)
1. **Gestión de Bienes y Servicios**: Gestión Contractual; Gestión de Compras; Almacén;
   Mantenimiento; Apoyo Logístico; Gestión Ambiental
2. **Gestión del Talento Humano**: Planeación del TH; Ingreso; Desarrollo; Retiro;
   Gestión del Conocimiento; Seguridad y Salud en el Trabajo; Docencia Servicio
3. **Gestión de Recursos Financieros**: Gestión Presupuestal; Gestión de Facturación;
   Gestión Tesorería; Gestión Contable; Gestión de Costos; Gestión de Cuentas Médicas;
   Gestión de Cartera
4. **Gestión Jurídica**: Asesoría Jurídica; Defensa Judicial y Extrajudicial
5. **Gestión de la Información y las Comunicaciones**: Gestión de Sistemas de
   Información; Soporte Técnico e Infraestructura TI; Seguridad de la Información;
   Gestión de Estadística y Análisis de Datos; Mercadeo Institucional y Comunicaciones
6. **Gestión Documental**: Administración de Documentos; Gestión de Archivo

**D. Procesos de Evaluación y Mejora** (banda al pie)
1. **Sistema de Control Interno**: MECI
2. **Autoevaluación Institucional**: Auditorías

**Entradas del Sistema:** Necesidades y expectativas de los usuarios · Normatividad
vigente del sector salud · Requisitos de entes de control · Recursos (humanos,
financieros, tecnológicos, infraestructura) · Información (epidemiológica, guías
clínicas, evidencia científica)

**Salidas del Sistema:** Servicios de salud (seguros, oportunos, de calidad) · Seguridad
del paciente · Calidad técnica · Oportunidad en la atención · Satisfacción del usuario ·
Cumplimiento normativo · Resultados en salud · Rentabilidad social

**PHVA:** Planear · Hacer · Verificar · Actuar — "Mejora Continua: retroalimentación que
fortalece todos los procesos de la organización"

**Convenciones:** Orientan y dirigen (flecha verde sólida) · Interacción y soporte
(flecha doble azul) · Evaluación y mejora continua (flecha punteada)

**Lema:** "Comprometidos con la vida y el bienestar de nuestra comunidad"

**Tokens de color de partida** (derivados de la imagen; se calibran en Fase 3 contra
contraste AA): azul institucional oscuro ≈ `#1B4E8E` (títulos, misionales/apoyo), verde
institucional ≈ `#2E9B47` (estratégicos, acentos), con neutros fríos de fondo.
