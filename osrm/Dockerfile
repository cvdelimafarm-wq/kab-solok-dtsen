# osrm/Dockerfile
#
# Server OSRM (Open Source Routing Machine) self-hosted -- dipakai
# lib/jarakJalan.ts di aplikasi utama utk menghitung jarak JALAN (bukan
# garis lurus) dari lokasi rumah petugas ke centroid tiap SLS, tab
# "Perencanaan Lapangan". Lihat osrm/README.md utk cara deploy ke Railway
# sbg SERVICE TERPISAH dari aplikasi Next.js utama.
#
# Data OSM diunduh & diproses SEKALI SAJA saat container pertama kali
# start (lihat entrypoint.sh) -- hasilnya disimpan di /data, yang WAJIB
# di-mount sbg Volume Railway supaya tidak perlu diproses ulang tiap
# redeploy/restart (prosesnya bisa makan waktu beberapa menit).

FROM ghcr.io/project-osrm/osrm-backend:latest

# osmium-tool -- dipakai HANYA utk `osmium fileinfo` (cek file .osm.pbf
# valid/tidak di entrypoint.sh, lihat pbf_valid()) -- streaming, aman.
# osmctools (`osmconvert`) -- dipakai utk MEMOTONG file ke bounding box
# (bbox), MENGGANTIKAN `osmium extract` yg SEBELUMNYA dipakai di sini.
# Alasan gantinya (dikonfirmasi lewat github.com/osmcode/osmium-tool
# issue #234 & dokumentasi resmi osmium-extract MEMORY USAGE): strategi
# `simple` `osmium extract` butuh RAM MINIMAL = (ID node TERTINGGI di
# seluruh file sumber) / 8 byte -- BUKAN sebanding luas wilayah yg
# dipotong. ID node tertinggi di OpenStreetMap (per Sep 2026 sekitar
# 14,19 milyar, lihat taginfo.openstreetmap.org/taginfo/stats, angka ini
# terus NAIK tiap tahun) berarti minimal ~1,65 GB RAM HANYA utk satu
# bitmap ini -- persis penyebab container di-OOM-kill ("Killed") terus-
# menerus di Railway walau file sumbernya (extract 1 provinsi) kecil.
# `osmconvert` pakai hash table dgn alokasi TETAP (default ~600 MB total,
# lihat man osmconvert -- --hash-memory), TIDAK bergantung ID tertinggi
# OSM, jadi jauh lebih hemat & tidak akan memburuk lagi di masa depan.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    osmium-tool \
    osmctools \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /data
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Sumber utama: extract PROVINSI Sumatera Barat dari mirror OpenStreetMap.fr
# (jauh lebih kecil & cepat drpd extract seluruh Sumatra/Indonesia, dan
# sudah pas dgn wilayah kerja kita). Dipotong lagi ke OSRM_BBOX di bawah
# (sedikit margin) supaya tetap mencakup jalan di perbatasan provinsi.
#
# Sumber CADANGAN: extract Sumatra dari Geofabrik -- dicoba otomatis oleh
# entrypoint.sh kalau sumber utama gagal total. (Catatan: pada percobaan
# awal, download.geofabrik.de terbukti TIDAK BISA dijangkau sama sekali
# dari jaringan Railway -- "Failed to connect ... Could not connect to
# server", bukan soal IPv4/IPv6 -- kemungkinan IP Railway diblokir dari
# sisi Geofabrik. Makanya OpenStreetMap.fr dijadikan sumber UTAMA, bukan
# cadangan. Baris Geofabrik tetap disimpan sbg percobaan kedua siapa tahu
# nanti sudah tidak diblokir lagi.)
#
# Kalau area kerja meluas ke luar Sumatera Barat, lihat osrm/README.md
# Bagian 6 -- perlu ganti OSRM_REGION_URL ke extract yg lebih luas (mis.
# Sumatra penuh atau Indonesia penuh) SEKALIGUS perbesar OSRM_BBOX.
ENV OSRM_REGION_URL="https://download.openstreetmap.fr/extracts/asia/indonesia/west_sumatra-latest.osm.pbf"
ENV OSRM_REGION_URL_FALLBACK="https://download.geofabrik.de/asia/indonesia/sumatra-latest.osm.pbf"
ENV OSRM_BBOX="98.4,-3.5,101.9,0.8"
ENV OSRM_PROFILE="car"

EXPOSE 5000
ENTRYPOINT ["/entrypoint.sh"]
