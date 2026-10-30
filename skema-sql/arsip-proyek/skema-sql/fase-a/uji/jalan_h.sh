#!/bin/bash
# rangkaian a-f + h + uji 40 (Fase D)
export PGHOST=/tmp/pgtest PGPORT=5544 PGUSER=postgres
cd "$(dirname "$0")" || exit 1
A=${1:-/home/claude/kk/stg/A}; B=${2:-/home/claude/kk/stg/B}
./jalan.sh semua "$A" "$B" || exit 1
for f in "$B/20261024h_keu_unggah_realisasi_skor.sql" "$B/20261024h_keu_unggah_realisasi_skor.sql" 40_uji_unggah_realisasi_skor.sql; do
  psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$f" > /tmp/uji_h.log 2>&1 || { grep -iE "error|gagal|context|detail" /tmp/uji_h.log | head -12; echo "GAGAL: $f"; exit 1; }
done
echo "LULUS: a-f + h (dua kali) + uji 40"
