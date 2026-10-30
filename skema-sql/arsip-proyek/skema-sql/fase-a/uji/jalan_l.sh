#!/bin/bash
# rangkaian a-f + h + i + j + k + l dengan uji 40 sampai 44 (gerbang tulis)
export PGHOST=/tmp/pgtest PGPORT=5544 PGUSER=postgres
cd "$(dirname "$0")" || exit 1
A=${1:-/home/claude/kk/stg/A}; B=${2:-/home/claude/kk/stg/B}
./jalan_k.sh "$A" "$B" || exit 1
for f in "$B/20261024l_keu_tulis.sql" "$B/20261024l_keu_tulis.sql" 44_uji_tulis.sql; do
  psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$f" > /tmp/uji_l.log 2>&1 || { grep -iE "error|gagal|context|detail" /tmp/uji_l.log | head -12; echo "GAGAL: $f"; exit 1; }
done
psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$B/20261024z7_cek_kesehatan_keu_l.sql" -At | awk -F'|' '$1>=1 && $1<=5 && $3!="0" {print "P0 TIDAK NOL: "$0; bad=1} END{exit bad}' || { echo "GAGAL: z7"; exit 1; }
echo "LULUS: a-f + h + i + j + k + uji 40-43 + l (dua kali) + uji 44 + z7"
