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

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    osmium-tool \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /data
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Extract Sumatra dari Geofabrik, dipotong ke bounding box Sumatera Barat
# (+ sedikit margin) spy pemrosesan jauh lebih cepat & ringan drpd
# memproses seluruh Sumatra. Ubah OSRM_BBOX kalau area kerja meluas ke
# provinsi lain. Format bbox: kiri(min lon),bawah(min lat),kanan(max
# lon),atas(max lat).
ENV OSRM_REGION_URL="https://download.geofabrik.de/asia/indonesia/sumatra-latest.osm.pbf"
ENV OSRM_BBOX="98.4,-3.5,101.9,0.8"
ENV OSRM_PROFILE="car"

EXPOSE 5000
ENTRYPOINT ["/entrypoint.sh"]
