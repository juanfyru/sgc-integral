# SGC Integral — ESE Hospital Nuestra Señora de Fátima de Suaza

Variante ampliada de **SGC Documental** (`sgc-suaza`), bifurcada el 2026-11-03
desde el commit `9644ceb`. Parte de las mismas funcionalidades y crece con
funcionalidades nuevas; la app original sigue su propio camino en su repo.

Portal de intranet para control de documentos del Sistema de Gestión de Calidad
(NTC ISO 9001:2015, numeral 7.5). La página de inicio es el mapa de procesos
institucional, interactivo y configurable.

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
npm run dev
# → http://localhost:3002

# Puertos elegidos para convivir con sgc-suaza en la misma máquina:
# Postgres 5435, app en Docker 9081, next dev 3002.
```

## Despliegue

El destino es un QNAP TS-832PX (**linux/arm64**, 4 GB RAM, sin salida a
internet). El CI construye la imagen ARM64 y la publica en GHCR y como
artefacto `.tar.gz` para carga offline (`docker load`). El procedimiento
completo está en `INSTALACION.md` (sin internet) e `INSTALACION_INTERNET.md`.
En esta variante la imagen ARM64 se construye a mano desde Actions
("Run workflow"); en cada push solo corren lint y build.
