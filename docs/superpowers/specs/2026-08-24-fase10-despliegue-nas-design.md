# Fase 10 — Despliegue en el NAS: paquete completo verificado en ensayo local

> Diseño aprobado por el usuario el 2026-08-24 (brainstorming de esta fecha).
> Estado real que condiciona la fase: **el usuario aún no tiene acceso al QNAP**
> (lo maneja otra área / falta permiso). La fase produce y verifica el paquete de
> despliegue; el estreno en el hardware real es un "día de instalación" posterior.

## 1. Objetivo

Dejar el proyecto **listo para instalarse en el QNAP TS-832PX sin el
desarrollador presente**: compose de producción, arranque del contenedor con
migraciones automáticas, flujo offline de imagen, respaldos con restauración
probada, prueba de carga y un `INSTALACION.md` que el área de sistemas pueda
ejecutar paso a paso. Todo verificado en un **ensayo local destructivo** que
simula el ciclo de vida completo (instalar → operar → respaldar → destruir →
restaurar → verificar).

## 2. Decisiones estructurales (tomadas en el brainstorming, 2026-08-24)

| # | Decisión | Porqué |
|---|---|---|
| F10-D1 | **Alcance sin NAS:** la fase cierra con el ensayo local completo + documentación; el criterio "RAM < 1.3 GB con 20 concurrentes" se mide localmente como cota de referencia y queda como **verificación vinculante del día de instalación** en el NAS real | El usuario no tiene acceso al QNAP todavía; posponer la fase entera bloquearía el proyecto sin necesidad |
| F10-D2 | **Arranque Opción B — script precompilado:** `scripts/arrancar.ts` → bundle `arrancar.js` con esbuild en el build de la imagen; el contenedor ejecuta `node arrancar.js && exec node server.js` | Semántica inequívoca: si la migración falla, el server **no arranca** y la restart policy reintenta con el error evidente en logs. `instrumentation.ts` (Opción A) no garantiza con nitidez que el server no acepte tráfico antes de migrar |
| F10-D3 | Migraciones en el arranque con **`migrate()` de drizzle-orm** (dependencia de runtime ya presente) leyendo la carpeta `drizzle/` copiada a la imagen | `drizzle-kit` es devDependency pesada y no debe viajar al NAS; `migrate()` es el mecanismo de producción oficial de Drizzle |
| F10-D4 | **`ADMIN_FORZAR_CLAVE=1`** como env var que `arrancar.js` pasa a `asegurarAdmin({ forzarClave: true })` | El camino "olvidé la clave" del NAS: `asegurar-admin.ts` es un script tsx que no existe en la imagen; un env var + recrear el contenedor es ejecutable por sistemas sin herramientas extra |
| F10-D5 | Límites de memoria con **`mem_limit`/`memswap_limit`** en el compose del NAS (no `deploy.resources` como en dev) | `deploy.resources` requiere versiones/modos específicos de compose; `mem_limit` lo respeta cualquier Container Station sin swarm |
| F10-D6 | Respaldo programado en el **crontab de QTS** que ejecuta `docker exec` sobre el contenedor de Postgres | Prohibido un tercer contenedor (presupuesto RAM); QTS trae cron persistente y es el mecanismo nativo del NAS |
| F10-D7 | El tar del CI lleva **doble tag**: `sgc-suaza:latest` + `sgc-suaza:AAAAMMDD-sha7`, y el artefacto se nombra con el sha | Rollback offline: conservar el tar anterior y volver atrás editando el tag en el compose, sin internet ni registry |
| F10-D8 | La prueba de carga **respeta los rate limits** públicos (mezcla mayoritaria de páginas, descargas bajo el límite por IP) | 20 usuarios humanos no son 20 bots; saturar el limitador mediría el 429, no la app |

## 3. Alcance por bloques

### Bloque A — Arranque del contenedor (migraciones + admin)

- `scripts/arrancar.ts` (fuente TS, español, testeable):
  1. Validar env obligatorias (`DATABASE_URL`; `ADMIN_USUARIO`/`ADMIN_NOMBRE`/`ADMIN_CLAVE`
     opcionales — sin ellas solo se omite el bootstrap del admin, con aviso).
  2. **Esperar la BD** con reintentos y backoff (función con reloj/inyección de
     dependencias, patrón `crearLimitador`): tope configurable, por defecto ~60 s;
     al agotarse, salir con código ≠ 0 y mensaje claro.
  3. Aplicar migraciones: `migrate(db, { migrationsFolder })` de
     `drizzle-orm/postgres-js/migrator`, carpeta `drizzle/` junto al bundle.
  4. `asegurarAdmin()` (reutiliza `src/db/consultas/admin.ts`), con
     `ADMIN_FORZAR_CLAVE=1` → `forzarClave: true` (F10-D4).
  5. Logs en español con prefijo `[arranque]`, éxito y fallo inequívocos.
- **Dockerfile**: en la etapa builder, `npx esbuild scripts/arrancar.ts --bundle
  --platform=node --format=cjs --external:@node-rs/argon2 --outfile=arrancar.js`;
  la etapa runner copia `arrancar.js` y `drizzle/`. `@node-rs/argon2` se resuelve
  del `node_modules` que el standalone ya copia (el smoke test ARM64 existente lo
  sigue cubriendo). CMD: `["sh", "-c", "node arrancar.js && exec node server.js"]`
  (con `exec`, `node server.js` recibe las señales de parada de Docker).
- El compose de **dev no cambia** (las migraciones en dev siguen siendo
  `npm run db:migrate`, como hasta hoy).

### Bloque B — Compose de producción y variables

- `docker-compose.nas.yml`:
  - `app`: imagen `sgc-suaza:<tag>` (cargada por `docker load`), `ports:
    "9080:3080"`, `env_file: .env`, bind mount de la carpeta compartida de
    documentos (p. ej. `/share/sgc-documentos`) → `ALMACEN_RUTA`, healthcheck
    `wget -qO- http://127.0.0.1:3080/api/salud` (busybox wget de alpine),
    `mem_limit: 768m`, `restart: unless-stopped`, `depends_on: bd
    (service_healthy)`.
  - `bd`: `postgres:16-alpine`, **sin `ports`** (regla inviolable 6), volumen
    Docker **local** `bd_datos` (jamás carpeta SMB — regla 4), healthcheck
    `pg_isready`, `mem_limit: 512m`, `restart: unless-stopped`.
  - Red interna implícita del compose; solo `app` publica puerto (regla 5:
    9080 en el host, QTS ocupa 8080/443).
- `.env.nas.example`: cada variable documentada con comentario — `DATABASE_URL`
  (host `bd`, credenciales a elegir por sistemas), `POSTGRES_*`,
  `ADMIN_USUARIO/NOMBRE/CLAVE` (con la instrucción de **retirar `ADMIN_CLAVE`
  tras el primer arranque** y recrear el contenedor), `ALMACEN_RUTA`,
  `NEXT_TELEMETRY_DISABLED=1`.

### Bloque C — CI: tag versionado para rollback offline

- En `ci.yml`, el paso del tar etiqueta `sgc-suaza:latest` **y**
  `sgc-suaza:<AAAAMMDD>-<sha7>`; el artefacto pasa a llamarse
  `sgc-suaza-arm64-docker-<sha7>` (F10-D7). `docker load` restaura ambos tags.

### Bloque D — Respaldos y restauración

- `nas/respaldo.sh` (POSIX sh, corre en QTS): `docker exec` + `pg_dump -Fc` →
  `/share/sgc-respaldos/sgc-AAAAMMDD-HHMM.dump`; verificación inmediata con
  `pg_restore --list`; retención: borrar dumps > 30 días; salida con código de
  error y mensaje si algo falla (visible en el correo de cron de QTS si está
  configurado).
- `nas/restaurar.sh`: parar `app` → `dropdb`/`createdb` → `pg_restore` →
  levantar `app` (el arranque re-verifica migraciones). Pide confirmación
  explícita antes de tocar nada.
- Los **archivos del almacén no van en el dump**: los cubren los snapshots QNAP
  de la carpeta compartida (+ Hybrid Backup Sync opcional a destino externo).
  La restauración completa = dump + carpeta de documentos; `INSTALACION.md` lo
  deja explícito y el ensayo local lo prueba con ambos.
- Programación: entrada de crontab de QTS documentada (método persistente
  oficial: editar `/etc/config/crontab` + `crontab /etc/config/crontab` +
  reiniciar crond), diaria 02:00.

### Bloque E — Ensayo local destructivo (la "restauración probada")

Con Docker Desktop local, usando `docker-compose.nas.yml` con overrides mínimos
de ensayo (`docker-compose.ensayo.yml`: build local x86 en vez de imagen cargada,
rutas Windows para el bind mount):

1. Levantar desde cero → `arrancar.js` migra y crea el admin → seed de datos.
2. Operar: login admin, publicar un documento, descargar un PDF (estampado).
3. Respaldar con la lógica de `respaldo.sh` + copia de la carpeta de documentos.
4. **Destruir contenedores y volúmenes** (`docker compose down -v`).
5. Restaurar con `restaurar.sh` + carpeta → verificar: conteos de documentos
   iguales, login admin funciona, el PDF descarga igual, bitácora intacta.
6. Anotar la evidencia (comandos y resultados) en la sección de verificación del
   plan; los scripts que corran en el ensayo son los mismos que van al NAS
   (adaptación mínima de rutas permitida y documentada).

### Bloque F — Prueba de carga

- `scripts/carga.ts` (tsx, devDependency, sin librerías nuevas): 20 clientes
  concurrentes con `fetch` nativo, mezcla realista (mapa 30%, proceso/subproceso
  25%, ficha 20%, búsqueda 15%, descarga de PDF estampado 10% — sin exceder los
  rate limits por IP, F10-D8), duración configurable (por defecto 60 s), reporte
  de p50/p95/errores por ruta.
- Medición de RAM en paralelo con `docker stats --no-stream` muestreado.
- Localmente: cota de referencia con la imagen x86. En el NAS: mismo script
  desde un PC de la LAN, criterio vinculante **RAM total < 1.3 GB** (queda como
  paso del día de instalación en `INSTALACION.md`).

### Bloque G — INSTALACION.md (raíz del repo)

Secciones, en este orden:
1. **Qué pedir antes de empezar** (checklist para sistemas): acceso admin a QTS,
   Container Station instalado, IP fija del NAS, dos carpetas compartidas
   (`sgc-documentos`, `sgc-respaldos`), SSH habilitado, este repo o el paquete
   de archivos (`tar` de la imagen + `docker-compose.nas.yml` + `.env` +
   `nas/*.sh`).
2. **Instalación inicial**: copiar por SMB → `docker load -i` → preparar `.env`
   desde `.env.nas.example` → `docker compose -f docker-compose.nas.yml up -d` →
   verificar `/api/salud` y el mapa → primer login → **retirar `ADMIN_CLAVE` del
   `.env` y recrear el contenedor**.
3. **Acceso de los funcionarios**: por IP (`http://IP:9080`) siempre funciona;
   sección opcional: reverse proxy nativo de QTS + TLS (autofirmado o CA del
   hospital) con nombre `calidad.hospital.local` si hay DNS interno.
4. **Respaldos**: instalar `respaldo.sh`, crontab QTS, snapshots de la carpeta
   compartida, HBS opcional; cómo verificar que el respaldo de anoche existe.
5. **Actualización de versión**: nuevo tar → `docker load` → `up -d`;
   **rollback**: tar anterior + tag en compose.
6. **Restauración ante desastre**: `restaurar.sh` + carpeta de documentos.
7. **Reseteo de clave del admin**: `ADMIN_FORZAR_CLAVE=1` + recrear contenedor
   (y retirarla después).
8. **Prueba de carga del día de instalación** (criterio < 1.3 GB) y **solución
   de problemas** (contenedor reinicia en bucle → logs de `[arranque]`; BD no
   sana → healthcheck; puerto ocupado; permisos del bind mount).

## 4. Estrategia de pruebas

- **Unitarias (Vitest, TDD):** la lógica testeable del arrancador se extrae a
  `src/lib/arranque.ts` — espera con reintentos/backoff (reloj inyectable),
  validación de env, decisión `forzarClave` — y se prueba sin BD.
  El script `arrancar.ts` queda como cascarón que conecta piezas probadas.
- **Integración:** el ensayo local (Bloque E) ejercita el camino completo real:
  migración sobre BD vacía, bootstrap del admin, respaldo y restauración.
- **CI:** el build ARM64 existente valida que el Dockerfile modificado (esbuild
  + copia de `drizzle/`) compila para `linux/arm64`.

## 5. Verificación antes de cerrar la fase

1. Ensayo local destructivo completo (Bloque E) ejecutado con evidencia.
2. Prueba de carga local ejecutada y reportada (cota de referencia).
3. `npm test`, `npm run lint`, `npm run build` limpios; CI verde con el tar de
   doble tag descargable.
4. Lectura de `INSTALACION.md` "con ojos de sistemas": cada comando copiable y
   ejecutable tal cual, sin pasos implícitos.
5. `CONTEXT.md` actualizado + commit por tarea, como siempre.

## 6. Orden de ejecución propuesto

1. Bloque A (arranque) — es la dependencia de todo lo demás.
2. Bloque B (compose NAS + env).
3. Bloque C (CI doble tag).
4. Bloque D (scripts de respaldo/restauración).
5. Bloque E (ensayo local destructivo).
6. Bloque F (prueba de carga).
7. Bloque G (INSTALACION.md, escrito al final con los comandos ya probados).

## 7. Fuera de alcance (explícito)

- TLS dentro del contenedor (lo da el reverse proxy nativo de QTS).
- Monitoreo con servicios adicionales (Prometheus/Grafana) — presupuesto de RAM.
- Auto-actualización de imágenes (no hay internet en el NAS).
- Réplicas o alta disponibilidad de Postgres.
- El despliegue físico en el QNAP real (día de instalación, cuando haya acceso).
- Migración de documentos reales (pendiente de que el usuario los entregue).
