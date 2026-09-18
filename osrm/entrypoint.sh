#!/usr/bin/env bash
# osrm/entrypoint.sh
#
# Dijalankan tiap container start. Kalau data yang SUDAH DIPROSES belum
# ada di /data (volume persisten), unduh extract OSM, potong ke bounding
# box (OSRM_BBOX), lalu jalankan pipeline osrm-extract -> osrm-partition
# -> osrm-customize (algoritma MLD). Kalau sudah ada (restart/redeploy
# berikutnya), langsung lompat ke osrm-routed -- TIDAK diproses ulang.
set -euo pipefail

DATA_DIR="/data"
RAW_PBF="$DATA_DIR/region-full.osm.pbf"
CLIPPED_PBF="$DATA_DIR/region.osm.pbf"
OSRM_BASE="$DATA_DIR/region.osrm"

mkdir -p "$DATA_DIR"

if [ ! -f "${OSRM_BASE}.mldgr" ]; then
  echo "[osrm] Data terproses belum ada di $DATA_DIR -- memproses dari awal (sekali saja, hasilnya disimpan di volume)..."

  if [ ! -f "$RAW_PBF" ]; then
    echo "[osrm] Mengunduh extract OSM dari $OSRM_REGION_URL ..."
    curl -fL --retry 3 -o "$RAW_PBF" "$OSRM_REGION_URL"
  fi

  if [ ! -f "$CLIPPED_PBF" ]; then
    echo "[osrm] Memotong extract ke bounding box $OSRM_BBOX ..."
    osmium extract --bbox "$OSRM_BBOX" --overwrite -o "$CLIPPED_PBF" "$RAW_PBF"
  fi

  echo "[osrm] osrm-extract (profil $OSRM_PROFILE) ..."
  osrm-extract -p "/opt/${OSRM_PROFILE}.lua" "$CLIPPED_PBF"

  echo "[osrm] osrm-partition ..."
  osrm-partition "$OSRM_BASE"

  echo "[osrm] osrm-customize ..."
  osrm-customize "$OSRM_BASE"

  echo "[osrm] Pemrosesan selesai -- membersihkan file mentah utk hemat disk."
  rm -f "$RAW_PBF"
else
  echo "[osrm] Data terproses SUDAH ADA di $DATA_DIR -- langsung menjalankan server (tidak memproses ulang)."
fi

PORT_UTK_OSRM="${PORT:-5000}"
echo "[osrm] Menjalankan osrm-routed di port $PORT_UTK_OSRM ..."
exec osrm-routed --algorithm mld --max-table-size 1000 --port "$PORT_UTK_OSRM" "$OSRM_BASE"
