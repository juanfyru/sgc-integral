# Instalación del SGC en el NAS — variante CON internet

Use esta guía **solo si el NAS tiene salida a internet**. Si no la tiene, use
`INSTALACION.md` (el flujo con archivo `.tar`). Todo lo demás — respaldos,
restauración, reseteo de clave — es igual en ambas y está en `INSTALACION.md`.

> Seguridad: el NAS solo necesita tráfico de **salida** (descargar imágenes,
> hora NTP, respaldos a la nube). **Nunca** abra puertos de entrada desde
> internet hacia el NAS: el portal es de intranet.

Los comandos se ejecutan por **SSH al NAS** como administrador. Donde diga
`IP-DEL-NAS`, ponga la IP real.

---

## 1. Requisitos (una sola vez)

- [ ] Acceso de administrador a QTS y **SSH habilitado** (Panel de control →
      Red y servicios de archivos → Telnet/SSH).
- [ ] **Container Station** instalado (App Center → buscar "Container
      Station" → Instalar; con internet se instala directo).
- [ ] **IP fija** para el NAS.
- [ ] Dos carpetas compartidas en QTS (Panel de control → Privilegios →
      Carpetas compartidas), sin papelera de red: `sgc-documentos` y
      `sgc-respaldos`.
- [ ] **Hora automática**: Panel de control → Sistema → Hora → sincronizar
      con servidor NTP (importante para la bitácora de auditoría).
- [ ] Un **token de GitHub para descargar la imagen** (el repositorio es
      privado). Lo crea el dueño de la cuenta `juanfyru`, una sola vez:
      1. Entrar a https://github.com/settings/tokens → "Generate new token
         (classic)".
      2. Nombre: `nas-sgc`. Vencimiento: "No expiration". Marcar **solo** la
         casilla `read:packages`.
      3. "Generate token" y guardar el texto `ghp_...` en el gestor de claves
         del área (se usa en el paso 2.2 y no se vuelve a mostrar).

## 2. Instalación

**2.1. Copiar los archivos de configuración.** Desde un PC, abrir
`\\IP-DEL-NAS\Container` en el Explorador, crear la carpeta `sgc` y copiar
dentro: `docker-compose.nas.yml`, `.env.nas.example` y la carpeta `nas/`
(están en el repositorio). No se necesita ningún `.tar`.

**2.2. Iniciar sesión en el registro de imágenes** (una sola vez; pega el
token cuando pida la contraseña):

```sh
docker login ghcr.io -u juanfyru
```

**2.3. Configurar variables:**

```sh
cd /share/Container/sgc
cp .env.nas.example .env
vi .env
```

Dejar así (lo demás del archivo, como está):

- `SGC_IMAGEN=ghcr.io/juanfyru/sgc-suaza`  ← **quitarle el `#` del inicio**
- `SGC_BD_CLAVE=` una clave larga y aleatoria (solo la usan los contenedores)
- `ADMIN_CLAVE=` una clave **temporal** para el primer ingreso del admin

**2.4. Descargar las imágenes y arrancar:**

```sh
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
docker logs -f sgc-app
```

En los logs debe aparecer, en orden: `[arranque] Esperando la base de datos…`
→ `Migraciones al día` → `Admin 'admin': creado` → `Listo: el servidor puede
arrancar`. (Ctrl+C sale de los logs.)

**2.5. Verificar:**

```sh
wget -qO- http://127.0.0.1:9080/api/salud
# {"estado":"ok","baseDeDatos":"conectada",...}
docker ps
# sgc-app y sgc-bd en estado "healthy"
```

Desde un PC: abrir `http://IP-DEL-NAS:9080` (se ve el mapa de procesos) y
entrar a `http://IP-DEL-NAS:9080/admin/ingreso` con el usuario y la clave del
`.env`.

**2.6. Retirar la clave temporal del admin** (la cuenta ya quedó guardada en
la base de datos):

```sh
vi .env          # dejar la línea así:  ADMIN_CLAVE=
docker compose -f docker-compose.nas.yml up -d
```

**2.7. Configurar respaldos** — igual que en la guía offline: seguir
`INSTALACION.md` §4 tal cual (script `respaldo.sh`, crontab de QTS y snapshot
diario de `sgc-documentos`). **Ventaja con internet:** en HBS 3 configure
además una sincronización de `sgc-respaldos` y `sgc-documentos` hacia un
destino FUERA del hospital (otro NAS remoto o un servicio de nube compatible)
— ese respaldo externo es el que salva la información si se pierde el equipo
completo.

Con esto la instalación queda terminada.

## 3. Actualizar a una versión nueva

Cuando el desarrollador publique una versión (cada cambio en `main` la
publica solo), actualizar son dos comandos:

```sh
cd /share/Container/sgc
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
```

Verificar después: `wget -qO- http://127.0.0.1:9080/api/salud`.

## 4. Volver a la versión anterior (rollback)

Cada versión queda publicada también con un tag de fecha (`AAAAMMDD-sha7`; se
ve en la página del repositorio → Packages, o preguntándole al desarrollador).
Para volver atrás:

```sh
cd /share/Container/sgc
vi .env                      # SGC_VERSION=20260826-a1b2c3d   (el tag anterior)
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
```

Para regresar a la última: `SGC_VERSION=latest` y repetir los dos comandos.

## 5. Lo que es igual que en la guía offline

Seguir `INSTALACION.md` directamente para:

- **§3** Acceso de los funcionarios (enlace por IP o proxy inverso de QTS con
  nombre y certificado).
- **§6** Restauración ante desastre (documentos + base de datos).
- **§7** Reseteo de la clave del administrador.
- **§8** Prueba de carga del día de instalación (criterio: RAM < 1.3 GB).
- **§9** Solución de problemas generales.

## 6. Problemas propios de esta variante

| Síntoma | Qué hacer |
|---|---|
| `docker login` dice "unauthorized" | El token está mal copiado, vencido, o no tiene la casilla `read:packages`. Crear uno nuevo (§1) y repetir el login. |
| `pull` dice "denied" o "not found" | Falta el login (§2.2) o `SGC_IMAGEN` quedó mal escrita en el `.env`: debe ser exactamente `ghcr.io/juanfyru/sgc-suaza`. |
| `pull` no conecta (timeout / lookup error) | El NAS no está saliendo a internet: revisar puerta de enlace y DNS en Panel de control → Red, y el firewall del hospital (necesita HTTPS de salida hacia `ghcr.io` y `*.docker.com`). |
| El NAS pierde internet más adelante | El sistema sigue funcionando normal (nada del portal depende de internet). Solo las ACTUALIZACIONES vuelven al flujo del `.tar` de `INSTALACION.md` §5, que funciona siempre. |
