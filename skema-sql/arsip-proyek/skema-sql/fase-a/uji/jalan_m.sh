#!/bin/bash
# rangkaian a-f + h + i + j + k + l + m dengan uji 40 sampai 45 (tampilan penugasan per RO)
export PGHOST=/tmp/pgtest PGPORT=5544 PGUSER=postgres
cd "$(dirname "$0")" || exit 1
A=${1:-/home/claude/kk/stg/A}; B=${2:-/home/claude/kk/stg/B}
./jalan_l.sh "$A" "$B" || exit 1
for f in "$B/20261024m_keu_v_penugasan_ro.sql" "$B/20261024m_keu_v_penugasan_ro.sql" 45_uji_penugasan_ro.sql; do
  psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$f" > /tmp/uji_m.log 2>&1 || { grep -iE "error|gagal|context|detail" /tmp/uji_m.log | head -12; echo "GAGAL: $f"; exit 1; }
done
psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$B/20261024z8_cek_kesehatan_keu_m.sql" -At | awk -F'|' '$1>=1 && $1<=4 && $3!="0" {print "P0 TIDAK NOL: "$0; bad=1} END{exit bad}' || { echo "GAGAL: z8"; exit 1; }
grep -q "LULUS 45" /tmp/uji_m.log || { echo "GAGAL: uji 45 tidak melapor lulus"; exit 1; }
echo "LULUS: a-f + h + i + j + k + l + uji 40-44 + m (dua kali) + uji 45 + z8"
