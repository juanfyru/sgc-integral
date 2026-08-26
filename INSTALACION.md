# Instalación del SGC Documental en el NAS QNAP TS-832PX

Guía para el área de sistemas. No requiere al desarrollador ni acceso a
internet desde el NAS. Todos los comandos de consola se ejecutan por **SSH al
NAS** como administrador, salvo donde se indique otra cosa.

> Arquitectura: dos contenedores (aplicación + PostgreSQL) en Container
> Station. La aplicación escucha en el puerto **9080** del NAS. Los documentos
> viven en la carpeta compartida `sgc-documentos`; los datos de la base de
> datos en un volumen interno de Docker (nunca en carpeta compartida). Los
> respaldos diarios caen en la carpeta compartida `sgc-respaldos`.

---

## 1. Qué se necesita antes de empezar (checklist)

- [ ] Acceso de **administrador a QTS** (interfaz web del NAS).
- [ ] **Container Station** instalado (App Center → Container Station; sin
      internet, instalar el paquete `.qpkg` descargado desde otro equipo en
      https://www.qnap.com/es-es/app-center).
- [ ] **IP fija** para el NAS (reserva DHCP o IP estática). En esta guía se
      usa `IP-DEL-NAS` como marcador: reemplazarla siempre por la real.
- [ ] **SSH habilitado** (Panel de control → Red y servicios de archivos →
      Telnet/SSH → Permitir conexiones SSH).
- [ ] Dos **carpetas compartidas** creadas en QTS (Panel de control →
      Privilegios → Carpetas compartidas), ambas **sin papelera de red**:
      - `sgc-documentos` — archivos de los documentos del SGC.
      - `sgc-respaldos` — respaldos diarios de la base de datos.
- [ ] El **paquete de despliegue**, copiado desde el PC por SMB (ver §2):
      - `sgc-suaza-arm64-docker-<versión>.tar.gz` (imagen de la app; artefacto del CI)
      - `postgres-16-alpine-arm64.tar.gz` (imagen de la base de datos; se
        genera una vez desde un PC con Docker e internet, ver §2.2)
      - `docker-compose.nas.yml`
      - `.env.nas.example`
      - carpeta `nas/` (`respaldo.sh`, `restaurar.sh`)
      - carpeta `scripts/` (solo `carga.ts`, para la prueba del §8)

## 2. Instalación inicial

**2.1. Crear la carpeta de trabajo y copiar el paquete.** Desde un PC de la
LAN, abrir `\\IP-DEL-NAS\` en el Explorador y crear la carpeta
`Container\sgc` (dentro de la carpeta compartida `Container` que crea
Container Station; si no existe, crear una carpeta compartida `Container`).
Copiar ahí los archivos del paquete. Por SSH:

```sh
cd /share/Container/sgc
ls
# docker-compose.nas.yml  .env.nas.example  nas/  sgc-suaza-arm64-docker-<versión>.tar.gz
```

**2.2. Cargar las imágenes** (el NAS no tiene internet; entran por archivo).

La imagen de la **base de datos** se genera UNA vez, desde cualquier PC con
Docker e internet, y se copia al NAS junto al resto del paquete:

```sh
# En el PC (una sola vez):
docker pull --platform linux/arm64 postgres:16-alpine
docker save postgres:16-alpine | gzip > postgres-16-alpine-arm64.tar.gz
```

En el NAS, cargar ambas:

```sh
cd /share/Container/sgc
# gunzip con redirección: conserva el .tar.gz original (sirve para rollback)
gunzip < sgc-suaza-arm64-docker-<versión>.tar.gz > sgc-suaza-arm64-docker-<versión>.tar
docker load -i sgc-suaza-arm64-docker-<versión>.tar
gunzip < postgres-16-alpine-arm64.tar.gz > postgres-16-alpine-arm64.tar
docker load -i postgres-16-alpine-arm64.tar
docker images | grep -E "sgc-suaza|postgres"
# sgc-suaza debe listar dos tags (latest y AAAAMMDD-sha7) y postgres el 16-alpine
```

**2.3. Configurar variables.** Copiar el ejemplo y completarlo:

```sh
cp .env.nas.example .env
vi .env
```

Obligatorio:
- `SGC_BD_CLAVE`: clave larga y aleatoria para la base de datos (solo la usan
  los contenedores entre sí; guardarla en el gestor de claves del área).
- `ADMIN_CLAVE`: clave **temporal** del primer ingreso del administrador del
  SGC (se retira en 2.6).
- `SGC_DOCUMENTOS=/share/sgc-documentos` (ya es el valor por defecto).

**2.4. Levantar los servicios:**

```sh
docker compose -f docker-compose.nas.yml up -d
docker logs -f sgc-app
```

En los logs debe verse, en orden: `[arranque] Esperando la base de datos…` →
`Migraciones al día` → `Admin '<usuario>': creado` → `Listo: el servidor
puede arrancar` → el banner de Next.js. (Ctrl+C sale de los logs.)

**2.5. Verificar:**

```sh
wget -qO- http://127.0.0.1:9080/api/salud
# {"estado":"ok","baseDeDatos":"conectada",...}
docker ps
# sgc-app y sgc-bd con estado "healthy"
```

Desde un PC: abrir `http://IP-DEL-NAS:9080` (debe verse el mapa de procesos)
y entrar a `http://IP-DEL-NAS:9080/admin/ingreso` con `ADMIN_USUARIO` /
`ADMIN_CLAVE` del `.env`.

**2.6. Retirar la clave temporal del admin** (la cuenta ya quedó creada en la
base de datos; la variable era solo el arranque inicial):

```sh
cd /share/Container/sgc
vi .env        # dejar ADMIN_CLAVE= (vacía)
docker compose -f docker-compose.nas.yml up -d
docker logs --tail 20 sgc-app
# Debe decir: "[arranque] Bootstrap del admin omitido: falta ADMIN_CLAVE"
```

El login del admin sigue funcionando con la clave que se fijó en 2.3.

## 3. Acceso de los funcionarios

**Opción A (siempre funciona):** compartir la dirección
`http://IP-DEL-NAS:9080` (por ejemplo como acceso directo en los escritorios
o enlace en la intranet).

**Opción B (nombre amable + HTTPS, opcional):** si el hospital tiene DNS
interno, crear el registro `calidad.hospital.local → IP-DEL-NAS` y usar el
**proxy inverso nativo de QTS**: Panel de control → Servidores de
aplicaciones → Servidor proxy inverso → Agregar:

- Origen: HTTPS, nombre de host `calidad.hospital.local`, puerto 443 — QTS
  ocupa 443 con su propia consola: si avisa conflicto, usar 8443 y compartir
  `https://calidad.hospital.local:8443`.
- Destino: HTTP, `127.0.0.1`, puerto `9080`.
- Certificado: Panel de control → Seguridad → Certificado — el autofirmado de
  QTS (los navegadores avisarán la primera vez) o uno emitido por la CA
  interna del hospital si existe.

## 4. Respaldos

**4.1. Instalar los scripts:**

```sh
cd /share/Container/sgc
chmod +x nas/respaldo.sh nas/restaurar.sh
./nas/respaldo.sh          # prueba manual
# Respaldo OK: /share/sgc-respaldos/sgc-AAAAMMDD-HHMM.dump (...)
```

**4.2. Programarlo a diario (02:00) en el cron de QTS** (el crontab de QTS es
persistente solo si se edita su archivo de configuración):

```sh
echo "0 2 * * * /share/Container/sgc/nas/respaldo.sh >> /share/sgc-respaldos/respaldo.log 2>&1" >> /etc/config/crontab
crontab /etc/config/crontab
/etc/init.d/crond.sh restart
```

El script conserva 30 días de dumps y borra los más viejos.

**4.3. Snapshots de los documentos.** Los archivos de los documentos NO van
en el dump: los protege el snapshot de la carpeta compartida. En QTS:
Almacenamiento e instantáneas → Instantáneas → programar **instantánea diaria
de `sgc-documentos`** con retención de 30. Opcional pero recomendado: **HBS 3**
(Hybrid Backup Sync) copiando `sgc-documentos` y `sgc-respaldos` a un disco
USB externo o a otro equipo de la LAN.

**4.4. Verificación periódica (una vez al mes):**

```sh
ls -lh /share/sgc-respaldos | tail -5    # ¿hay dump de anoche?
tail -3 /share/sgc-respaldos/respaldo.log
```

## 5. Actualización de versión

1. Descargar del CI (GitHub Actions del repositorio, hecho por quien tenga
   acceso) el artefacto `sgc-suaza-arm64-docker-<versión-nueva>` y copiarlo a
   `/share/Container/sgc` por SMB. **Conservar el `.tar.gz` anterior** (es el
   camino de rollback).
2. Por SSH:

```sh
cd /share/Container/sgc
gunzip < sgc-suaza-arm64-docker-<versión-nueva>.tar.gz > sgc-suaza-arm64-docker-<versión-nueva>.tar
docker load -i sgc-suaza-arm64-docker-<versión-nueva>.tar
docker compose -f docker-compose.nas.yml up -d     # con SGC_VERSION=latest toma la recién cargada
docker logs --tail 20 sgc-app                      # "Migraciones al día ... Listo"
wget -qO- http://127.0.0.1:9080/api/salud
```

**Rollback:** cada `.tar` trae también un tag fijo `AAAAMMDD-sha7`
(`docker images | grep sgc-suaza` los lista). Para volver atrás:

```sh
vi .env             # SGC_VERSION=<tag-anterior>   (p. ej. 20260824-e324d2e)
docker compose -f docker-compose.nas.yml up -d
```

(Si la imagen anterior ya no está cargada, `docker load` del `.tar.gz`
conservado primero.)

## 6. Restauración ante desastre

Restaura **dos cosas**: la carpeta de documentos y la base de datos.

1. **Documentos:** restaurar la carpeta `sgc-documentos` desde la instantánea
   de QTS (Almacenamiento e instantáneas → Instantáneas → Revertir), o si se
   restaura desde una copia suelta, copiar el **CONTENIDO** de la copia dentro
   de la carpeta compartida (no la carpeta entera — anidarla deja los
   documentos invisibles para la aplicación):

```sh
cp -r /ruta/de/la/copia/. /share/sgc-documentos/
```

2. **Base de datos:**

```sh
cd /share/Container/sgc
./nas/restaurar.sh /share/sgc-respaldos/sgc-AAAAMMDD-HHMM.dump
# Pide escribir SI. Detiene la app, reemplaza la BD y la vuelve a arrancar.
```

3. **Verificar:** `http://IP-DEL-NAS:9080` muestra el mapa con sus documentos;
   el administrador entra con su clave de siempre (la del respaldo); descargar
   un PDF cualquiera (debe salir con la marca "COPIA NO CONTROLADA").

## 7. Reseteo de la clave del administrador

Si el administrador olvida su clave:

```sh
cd /share/Container/sgc
vi .env
#   ADMIN_CLAVE=una-clave-nueva-temporal
#   ADMIN_FORZAR_CLAVE=1
docker compose -f docker-compose.nas.yml up -d
docker logs --tail 5 sgc-app     # "[arranque] Admin '...': clave_actualizada"
```

Probar el ingreso con la clave nueva y **retirar ambas variables**:

```sh
vi .env                          # ADMIN_CLAVE=   y   ADMIN_FORZAR_CLAVE=
docker compose -f docker-compose.nas.yml up -d
```

## 8. Prueba de carga del día de instalación

Criterio de aceptación en el hardware real: **RAM total de los dos
contenedores < 1.3 GB con 20 usuarios concurrentes y errores < 1%**.

Desde un PC de la LAN con Node.js 24 instalado y el repositorio (o al menos
`scripts/carga.ts`):

```sh
npx tsx scripts/carga.ts http://IP-DEL-NAS:9080 60 20
```

Y a la vez, por SSH en el NAS, 2–3 veces durante el minuto:

```sh
docker stats --no-stream sgc-app sgc-bd
```

Referencia del ensayo local (x86): 2944 peticiones/60 s, 0 errores, p95 ≤
169 ms, RAM total ≈ 165 MiB — en el ARM del NAS las latencias serán mayores;
lo vinculante es el criterio de RAM y errores.

## 9. Solución de problemas

| Síntoma | Qué revisar |
|---|---|
| `sgc-app` se reinicia en bucle | `docker logs sgc-app` y buscar `[arranque] FALLO`. Casi siempre: `SGC_BD_CLAVE` cambiada con un volumen de BD ya inicializado (la BD conserva la clave con la que nació), o la BD no arranca. |
| `/api/salud` responde `estado: error` (503) | La BD no está sana: `docker ps` (¿`sgc-bd` healthy?) y `docker logs sgc-bd`. |
| Al levantar: "port is already allocated" (9080) | Otro servicio ocupa 9080. Cambiar el lado izquierdo de `ports` en `docker-compose.nas.yml` (p. ej. `"9081:3080"`) y actualizar los enlaces compartidos. |
| La ficha muestra el documento pero la descarga da 404 | La aplicación no ve los archivos: ¿`SGC_DOCUMENTOS` apunta a la carpeta correcta? ¿Los archivos están DIRECTO en la carpeta (no anidados en una subcarpeta, ver §6.1)? Permisos: la carpeta compartida debe permitir lectura/escritura (el contenedor corre como uid 1001; en QTS dar acceso RW a "Everyone" en esa carpeta compartida o al usuario mapeado). |
| Subir un archivo desde el admin falla | Permisos de ESCRITURA del bind mount (mismo punto anterior). |
| "Bootstrap del admin omitido" en los logs | Normal tras retirar `ADMIN_CLAVE` (§2.6). Solo es problema si aún no existe el admin: volver a §2.3. |
