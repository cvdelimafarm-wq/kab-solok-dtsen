#!/bin/bash
# rangkaian a-f + h + uji 40 + i + uji 41 (Fase E)
export PGHOST=/tmp/pgtest PGPORT=5544 PGUSER=postgres
cd "$(dirname "$0")" || exit 1
A=${1:-/home/claude/kk/stg/A}; B=${2:-/home/claude/kk/stg/B}
./jalan_h.sh "$A" "$B" || exit 1
for f in "$B/20261024i_keu_administrasi.sql" "$B/20261024i_keu_administrasi.sql" 41_uji_administrasi.sql; do
  psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$f" > /tmp/uji_i.log 2>&1 || { grep -iE "error|gagal|context|detail" /tmp/uji_i.log | head -12; echo "GAGAL: $f"; exit 1; }
done
psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$B/20261024z4_cek_kesehatan_keu_i.sql" -At | awk -F'|' '$1>=1 && $1<=8 && $3!="0" {print "P0 TIDAK NOL: "$0; bad=1} END{exit bad}' || { echo "GAGAL: z4"; exit 1; }
echo "LULUS: a-f + h + uji 40 + i (dua kali) + uji 41 + z4"
