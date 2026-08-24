#!/bin/sh
# Restauración de la BD del SGC desde un dump de respaldo.sh. DESTRUYE la BD
# actual. Los ARCHIVOS de documentos NO están en el dump: restaurarlos desde
# el snapshot de la carpeta compartida — ver INSTALACION.md §Restauración.
# Uso: restaurar.sh /share/sgc-respaldos/sgc-AAAAMMDD-HHMM.dump
set -eu

DUMP="${1:?Uso: restaurar.sh /ruta/al/respaldo.dump}"
APP="${SGC_APP:-sgc-app}"
BD="${SGC_BD:-sgc-bd}"
USUARIO="${SGC_BD_USUARIO:-sgc}"
NOMBRE_BD="${SGC_BD_NOMBRE:-sgc}"

[ -s "$DUMP" ] || { echo "No existe o está vacío: $DUMP" >&2; exit 1; }

echo "Esto DESTRUYE la base de datos actual y la reemplaza con: $DUMP"
printf "Escriba SI (mayúsculas) para continuar: "
read -r CONFIRMA
[ "$CONFIRMA" = "SI" ] || { echo "Cancelado."; exit 1; }

docker stop "$APP"
docker exec "$BD" dropdb -U "$USUARIO" --if-exists "$NOMBRE_BD"
docker exec "$BD" createdb -U "$USUARIO" "$NOMBRE_BD"
docker exec -i "$BD" pg_restore -U "$USUARIO" -d "$NOMBRE_BD" --no-owner < "$DUMP"
docker start "$APP"

echo "Restauración completa. Verificar http://IP-DEL-NAS:9080 y /api/salud."
