# SGC Integral — ESE Hospital Nuestra Señora de Fátima de Suaza

Variante ampliada de **SGC Documental** (`sgc-suaza`), bifurcada el 2026-11-03
desde el commit `9644ceb`. Parte de las mismas funcionalidades y crece con
funcionalidades nuevas; la app original sigue su propio camino en su repo.

Portal de intranet para control de documentos del Sistema de Gestión de Calidad
(NTC ISO 9001:2015, numeral 7.5). La página de inicio reúne las tareas de cada
persona y el mapa de procesos institucional, interactivo y configurable. El
nombre, la sigla, el logo y los colores de la entidad se configuran desde la app
(Administración → Entidad y marca), con tema claro y oscuro.

- **Reglas permanentes del proyecto:** [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md)
- **Estado vivo:** [`CONTEXT.md`](CONTEXT.md)
- **Plan por fases:** [`PLAN.md`](PLAN.md)

## Desarrollo local

```bash
# Todo en Docker (app + Postgres):
docker compose -f docker-compose.dev.yml up --build
# → http://localhost:9081  (salud: http://localhost:9081/api/salud)

# O con hot reload:
docker compose -f docker-compose.dev.yml up -d bd
cp .env.example .env.local
npm install
npm run db:preparar     # migraciones (antes comprueba que no haya usuarios duplicados sin distinguir mayúsculas) + rol de BD de la app (sgc_app)
npm run db:seed         # semilla demo: mapa, documentos, estructura y usuarios de ejemplo
npm run admin:asegurar  # crea el admin (pide cambiar la clave al primer ingreso)
npm run dev
# → http://localhost:3002

# Semilla mínima (instalación nueva: solo tipos de documento y configuración,
# sin mapa, documentos ni usuarios). Ambas semillas BORRAN todo antes de sembrar:
npm run db:seed:minima

# Usuarios demo (clave común: Demo-SGC-2026-clave):
#   coordinadora.sgc (admin_sgc), gerente (gerencia), control.interno (control_interno),
#   lider.gth y lider.cex (lider_proceso, de GTH y CEX), consulta (consulta).

# Puertos elegidos para convivir con sgc-suaza en la misma máquina:
# Postgres 5435, app en Docker 9081, next dev 3002.
```

## Despliegue

El piso de despliegue está en el diseño maestro
(`docs/superpowers/specs/2026-11-03-sgc-integral-plataforma-design.md` §4) y en
`AGENTS.md`: un servidor por entidad (Windows con Docker Engine en WSL2, o
Linux), `docker compose` con tres contenedores (proxy Caddy con TLS, app y
PostgreSQL), imagen `linux/amd64` y `arm64` bajo demanda. El compose de
producción, el procedimiento de instalación y el de respaldo y restauración se
construyen en la **Fase 20**.

Hoy en cada push solo corren lint y build; la imagen `arm64` (GHCR + artefacto
`.tar.gz` para `docker load`) se construye a mano desde Actions ("Run
workflow"). `INSTALACION.md`, `INSTALACION_INTERNET.md`,
`docker-compose.nas.yml` y `nas/` son los archivos heredados de `sgc-suaza` y
quedan como registro hasta la Fase 20.
