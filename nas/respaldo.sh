#!/bin/sh
# Respaldo diario de la BD del SGC (pg_dump formato custom) + retención.
# Programado en el crontab de QTS — ver INSTALACION.md §Respaldos.
# Uso: respaldo.sh [carpeta_destino]   (default /share/sgc-respaldos)
set -eu

DESTINO="${1:-/share/sgc-respaldos}"
BD="${SGC_BD:-sgc-bd}"
USUARIO="${SGC_BD_USUARIO:-sgc}"
NOMBRE_BD="${SGC_BD_NOMBRE:-sgc}"
FECHA=$(date +%Y%m%d-%H%M)
ARCHIVO="$DESTINO/sgc-$FECHA.dump"

[ -d "$DESTINO" ] || { echo "No existe la carpeta de respaldos: $DESTINO" >&2; exit 1; }

docker exec "$BD" pg_dump -U "$USUARIO" -d "$NOMBRE_BD" -Fc > "$ARCHIVO"

# Verificación: no vacío y con formato restaurable (pg_restore lo puede listar).
[ -s "$ARCHIVO" ] || { echo "Respaldo VACIO: $ARCHIVO" >&2; exit 1; }
docker exec -i "$BD" pg_restore --list < "$ARCHIVO" > /dev/null

# Retención: eliminar dumps con más de 30 días.
find "$DESTINO" -name 'sgc-*.dump' -mtime +30 -type f -delete

echo "Respaldo OK: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"
