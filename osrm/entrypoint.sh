#!/usr/bin/env bash
# osrm/entrypoint.sh
#
# Dijalankan tiap container start. Kalau data yang SUDAH DIPROSES belum
# ada di /data (volume persisten), unduh extract OSM, potong ke bounding
# box (OSRM_BBOX), lalu jalankan pipeline osrm-extract -> osrm-partition
# -> osrm-customize (algoritma MLD). Kalau sudah ada (restart/redeploy
# berikutnya), langsung lompat ke osrm-routed -- TIDAK diproses ulang.
#
# RIWAYAT BUG PENTING (crash-loop "no edges remaining after parsing"):
# pernah kejadian NYATA di Railway -- unduhan region-full.osm.pbf
# TERPUTUS di tengah jalan (curl tetap exit 0/"sukses" krn koneksi
# ditutup server dgn cara yg tidak selalu terdeteksi curl sbg error),
# TEPAT sesudah blok node selesai ditulis tapi SEBELUM blok way (PBF
# menyimpan node dulu, baru way, baru relation) -- hasilnya file TIDAK
# KOSONG & headernya kelihatan valid, tapi isinya cuma "2.272.000 node,
# 0 way, 0 relation" (persis spt di log Railway). osrm-extract lalu
# selalu crash ("There are no edges remaining after parsing") krn tanpa
# way memang tidak ada edge graf jalan -- container restart, ENTRYPOINT
# CUMA CEK "file sudah ada" (lolos, krn memang ada & tidak kosong) -> file
# rusak yg SAMA dipakai LAGI -> crash lagi -> berulang TANPA HENTI, file
# rusak tidak pernah diunduh ulang. Diperbaiki dgn: (1) pbf_valid() skrg
# baca ISI LENGKAP file (bukan cuma header) & mensyaratkan jumlah way > 0,
# (2) unduh & potong SELALU ke file SEMENTARA dulu, baru divalidasi &
# di-rename (mv, atomik) ke nama akhir SESUDAH lolos -- supaya file yg
# "curl-nya sukses tapi isinya rusak/terputus" TIDAK PERNAH nyangkut di
# nama akhir & dipakai ulang.
set -euo pipefail

DATA_DIR="/data"
RAW_PBF="$DATA_DIR/region-full.osm.pbf"
CLIPPED_PBF="$DATA_DIR/region.osm.pbf"
OSRM_BASE="$DATA_DIR/region.osrm"

mkdir -p "$DATA_DIR"

# Cek apakah file .osm.pbf BENAR-BENAR valid -- bukan cuma "ada & tidak
# kosong", tapi bisa dibaca UTUH sampai selesai & punya minimal 1 way.
# PAKAI `osmium fileinfo -e` (--extended, WAJIB baca SELURUH file, bukan
# cuma header spt osmium fileinfo polos) + `-g data.count.ways` (ambil
# ANGKA jumlah way langsung, machine-readable, lihat man osmium-fileinfo(1)
# bagian VARIABLES -- jauh lebih tahan-error drpd nge-grep teks manusia
# "Number of ways: N" yg formatnya bisa berubah antar versi osmium) --
# `-F pbf` dipasang eksplisit supaya tidak bergantung sniffing dari nama
# file (perlu krn file SEMENTARA di bawah sengaja diberi akhiran
# ".mengunduh", bukan ".osm.pbf").
pbf_valid() {
  local f="$1"
  [ -s "$f" ] || return 1
  local jumlah_way
  jumlah_way=$(osmium fileinfo -e -F pbf -g data.count.ways "$f" 2>/dev/null) || return 1
  case "$jumlah_way" in
    '' | *[!0-9]*)
      echo "[osrm] $f: osmium tidak mengembalikan angka way yang valid ('$jumlah_way') -- dianggap TIDAK valid."
      return 1
      ;;
  esac
  if [ "$jumlah_way" -eq 0 ]; then
    echo "[osrm] $f terbaca tapi 0 way -- kemungkinan unduhan/potongan terputus di tengah jalan -- dianggap TIDAK valid."
    return 1
  fi
  return 0
}

# Unduh dgn retry + backoff, DIPAKSA pakai IPv4 (-4), DAN otomatis coba
# sumber cadangan (OSRM_REGION_URL_FALLBACK) kalau sumber utama gagal
# total -- beberapa host (mis. Geofabrik) pernah terbukti tidak bisa
# dijangkau sama sekali dari jaringan Railway, jadi jangan cuma andalkan
# satu sumber. Loop retry per-sumber jg mencegah container crash-loop tiap
# detik kalau jaringan lagi bermasalah sesaat -- coba beberapa kali dgn
# jeda yg makin lama dulu sebelum pindah/menyerah.
#
# Diunduh ke file SEMENTARA ("$tujuan.mengunduh") dulu, BARU di-pbf_valid()
# & di-mv (atomik) ke nama akhir SESUDAH lolos -- kalau curl "sukses"
# (exit 0) tapi isinya ternyata rusak/terputus (lihat pbf_valid di atas),
# file sementara dibuang & retry LANJUT ke percobaan/sumber berikutnya,
# bukan cuma berhenti krn menganggap curl exit 0 = selesai.
unduh_dengan_retry() {
  local tujuan="$1"
  shift
  local daftar_url=("$@")
  local percobaan_per_sumber=3
  local sementara="${tujuan}.mengunduh"

  for url in "${daftar_url[@]}"; do
    [ -z "$url" ] && continue
    local percobaan=1
    while [ "$percobaan" -le "$percobaan_per_sumber" ]; do
      echo "[osrm] Percobaan unduh ke-$percobaan/$percobaan_per_sumber (paksa IPv4) dari $url ..."
      rm -f "$sementara"
      if curl -4 -fL --connect-timeout 15 --retry 1 -o "$sementara" "$url" && pbf_valid "$sementara"; then
        mv -f "$sementara" "$tujuan"
        return 0
      fi
      echo "[osrm] Gagal konek ATAU hasil unduhan tidak valid/terputus -- buang, tunggu $((percobaan * 15)) detik sebelum coba lagi ..."
      rm -f "$sementara"
      sleep $((percobaan * 15))
      percobaan=$((percobaan + 1))
    done
    echo "[osrm] Semua percobaan ke $url gagal -- coba sumber berikutnya kalau masih ada."
  done

  echo "[osrm] GAGAL mengunduh data VALID dari SEMUA sumber yang dicoba: ${daftar_url[*]}"
  echo "[osrm] Tes manual lewat tab Console di dashboard Railway, mis: curl -4 -v <url> -o /dev/null"
  return 1
}

if [ ! -f "${OSRM_BASE}.mldgr" ]; then
  echo "[osrm] Data terproses belum ada di $DATA_DIR -- memproses dari awal (sekali saja, hasilnya disimpan di volume)..."

  if [ -f "$RAW_PBF" ] && ! pbf_valid "$RAW_PBF"; then
    echo "[osrm] $RAW_PBF ada tapi rusak/kosong (sisa percobaan gagal sebelumnya) -- hapus, unduh ulang."
    rm -f "$RAW_PBF"
  fi
  if [ ! -f "$RAW_PBF" ]; then
    echo "[osrm] Mengunduh extract OSM (sumber utama + cadangan kalau perlu) ..."
    unduh_dengan_retry "$RAW_PBF" "$OSRM_REGION_URL" "${OSRM_REGION_URL_FALLBACK:-}"
  fi

  if [ -f "$CLIPPED_PBF" ] && ! pbf_valid "$CLIPPED_PBF"; then
    echo "[osrm] $CLIPPED_PBF ada tapi rusak/kosong -- hapus, potong ulang dari $RAW_PBF."
    rm -f "$CLIPPED_PBF"
  fi
  if [ ! -f "$CLIPPED_PBF" ]; then
    echo "[osrm] Memotong extract ke bounding box $OSRM_BBOX (strategi 'simple' -- paling hemat memori) ..."
    # Strategi default osmium extract (complete_ways) butuh RAM sebanding dgn
    # ID node TERTINGGI di file SUMBER (bukan cuma luas area yg dipotong) --
    # jadi tetap bisa OOM ("Killed" oleh OS) meski file sumbernya kecil.
    # Strategi "simple" cuma 1x pass & jauh lebih hemat memori; konsekuensinya
    # jalan yg persis motong garis bbox bisa jadi tidak reference-complete,
    # tapi tidak masalah krn OSRM_BBOX kita sudah dikasih margin di luar
    # Sumbar, jadi jalan-jalan penting di dalam wilayah kerja tetap utuh.
    #
    # Ditulis ke file SEMENTARA dulu (".mengunduh", format output dipaksa
    # eksplisit lewat -f pbf krn ekstensinya bukan .osm.pbf) & divalidasi
    # (pbf_valid) SEBELUM dipakai -- kalau proses osmium extract sendiri
    # terhenti di tengah jalan (mis. container kena OOM-kill/restart
    # Railway PAS lg motong), file .osm.pbf akhir tidak pernah kebentuk
    # dgn isi setengah jadi.
    CLIPPED_SEMENTARA="${CLIPPED_PBF}.mengunduh"
    rm -f "$CLIPPED_SEMENTARA"
    osmium extract --bbox "$OSRM_BBOX" --strategy simple --overwrite -f pbf -o "$CLIPPED_SEMENTARA" "$RAW_PBF"
    if ! pbf_valid "$CLIPPED_SEMENTARA"; then
      echo "[osrm] Hasil potongan tidak valid (0 way) -- kemungkinan $RAW_PBF sendiri rusak/tidak lengkap."
      echo "[osrm] Hapus $RAW_PBF & file potongan sementara supaya restart berikutnya unduh ulang dari awal, lalu keluar (gagal) sekarang."
      rm -f "$CLIPPED_SEMENTARA" "$RAW_PBF"
      exit 1
    fi
    mv -f "$CLIPPED_SEMENTARA" "$CLIPPED_PBF"
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
