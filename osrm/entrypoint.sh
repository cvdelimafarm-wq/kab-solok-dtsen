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

# Unduh dgn retry + backoff, DIPAKSA pakai IPv4 (-4), DAN otomatis coba
# sumber cadangan (OSRM_REGION_URL_FALLBACK) kalau sumber utama gagal
# total -- beberapa host (mis. Geofabrik) pernah terbukti tidak bisa
# dijangkau sama sekali dari jaringan Railway, jadi jangan cuma andalkan
# satu sumber. Loop retry per-sumber jg mencegah container crash-loop tiap
# detik kalau jaringan lagi bermasalah sesaat -- coba beberapa kali dgn
# jeda yg makin lama dulu sebelum pindah/menyerah.
unduh_dengan_retry() {
  local tujuan="$1"
  shift
  local daftar_url=("$@")
  local percobaan_per_sumber=3

  for url in "${daftar_url[@]}"; do
    [ -z "$url" ] && continue
    local percobaan=1
    while [ "$percobaan" -le "$percobaan_per_sumber" ]; do
      echo "[osrm] Percobaan unduh ke-$percobaan/$percobaan_per_sumber (paksa IPv4) dari $url ..."
      if curl -4 -fL --connect-timeout 15 --retry 1 -o "$tujuan" "$url"; then
        return 0
      fi
      echo "[osrm] Gagal konek -- tunggu $((percobaan * 15)) detik sebelum coba lagi ..."
      sleep $((percobaan * 15))
      percobaan=$((percobaan + 1))
    done
    echo "[osrm] Semua percobaan ke $url gagal -- coba sumber berikutnya kalau masih ada."
  done

  echo "[osrm] GAGAL mengunduh dari SEMUA sumber yang dicoba: ${daftar_url[*]}"
  echo "[osrm] Tes manual lewat tab Console di dashboard Railway, mis: curl -4 -v <url> -o /dev/null"
  return 1
}

if [ ! -f "${OSRM_BASE}.mldgr" ]; then
  echo "[osrm] Data terproses belum ada di $DATA_DIR -- memproses dari awal (sekali saja, hasilnya disimpan di volume)..."

  if [ ! -f "$RAW_PBF" ]; then
    echo "[osrm] Mengunduh extract OSM (sumber utama + cadangan kalau perlu) ..."
    unduh_dengan_retry "$RAW_PBF" "$OSRM_REGION_URL" "${OSRM_REGION_URL_FALLBACK:-}"
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
