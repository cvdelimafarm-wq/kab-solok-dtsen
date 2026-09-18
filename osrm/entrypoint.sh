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

# Unduh dgn retry + backoff, DIPAKSA pakai IPv4 (-4). Beberapa jaringan cloud
# (termasuk Railway) kadang gagal konek IPv6 ke host yang dual-stack spt
# download.geofabrik.de ("Failed to connect ... Could not connect to
# server") -- curl akan coba IPv6 dulu & gagal sebelum sempat jatuh ke IPv4,
# jadi kita paksa IPv4 dari awal. Loop retry di sini jg mencegah container
# crash-loop tiap detik kalau jaringan lagi bermasalah sesaat -- coba
# beberapa kali dgn jeda yg makin lama dulu sebelum benar2 menyerah.
unduh_dengan_retry() {
  local url="$1"
  local tujuan="$2"
  local percobaan=1
  local maks_percobaan=5
  while [ "$percobaan" -le "$maks_percobaan" ]; do
    echo "[osrm] Percobaan unduh ke-$percobaan/$maks_percobaan (paksa IPv4) dari $url ..."
    if curl -4 -fL --connect-timeout 15 --retry 2 -o "$tujuan" "$url"; then
      return 0
    fi
    echo "[osrm] Gagal konek -- tunggu $((percobaan * 15)) detik sebelum coba lagi ..."
    sleep $((percobaan * 15))
    percobaan=$((percobaan + 1))
  done
  echo "[osrm] GAGAL mengunduh setelah $maks_percobaan percobaan. Kemungkinan jaringan Railway sedang tidak bisa menjangkau $url -- coba tes manual lewat tab Console di dashboard Railway: curl -4 -v $url -o /dev/null"
  return 1
}

if [ ! -f "${OSRM_BASE}.mldgr" ]; then
  echo "[osrm] Data terproses belum ada di $DATA_DIR -- memproses dari awal (sekali saja, hasilnya disimpan di volume)..."

  if [ ! -f "$RAW_PBF" ]; then
    echo "[osrm] Mengunduh extract OSM dari $OSRM_REGION_URL ..."
    unduh_dengan_retry "$OSRM_REGION_URL" "$RAW_PBF"
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
