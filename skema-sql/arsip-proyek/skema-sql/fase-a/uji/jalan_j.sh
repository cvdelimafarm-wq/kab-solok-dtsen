#!/bin/bash
# rangkaian a-f + h + i + j dengan uji 40, 41, 42 (Fase F)
export PGHOST=/tmp/pgtest PGPORT=5544 PGUSER=postgres
cd "$(dirname "$0")" || exit 1
A=${1:-/home/claude/kk/stg/A}; B=${2:-/home/claude/kk/stg/B}
./jalan_i.sh "$A" "$B" || exit 1
for f in "$B/20261024j_keu_kekurangan.sql" "$B/20261024j_keu_kekurangan.sql" 42_uji_kekurangan.sql; do
  psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$f" > /tmp/uji_j.log 2>&1 || { grep -iE "error|gagal|context|detail" /tmp/uji_j.log | head -12; echo "GAGAL: $f"; exit 1; }
done
psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$B/20261024z5_cek_kesehatan_keu_j.sql" -At | awk -F'|' '$1>=1 && $1<=9 && $3!="0" {print "P0 TIDAK NOL: "$0; bad=1} END{exit bad}' || { echo "GAGAL: z5"; exit 1; }
psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$A/20261024z_cek_kesehatan_keu.sql" -At | awk -F'|' '$1==4 {print $0; split($3,a," dari "); if (a[1]!=a[2]) bad=1} END{exit bad}' || { echo "GAGAL: z (jumlah tabel)"; exit 1; }
echo "LULUS: a-f + h + i + uji 40-41 + j (dua kali) + uji 42 + z5"
