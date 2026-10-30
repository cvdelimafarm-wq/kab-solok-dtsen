#!/bin/bash
# rangkaian a-f + h + i + j + k + l + m + n dengan uji 40 sampai 48 (tampilan rincian dan jejak RAB)
export PGHOST=/tmp/pgtest PGPORT=5544 PGUSER=postgres
cd "$(dirname "$0")" || exit 1
A=${1:-/home/claude/kk/stg/A}; B=${2:-/home/claude/kk/stg/B}
./jalan_m.sh "$A" "$B" || exit 1
for f in "$B/20261024n_keu_v_rab_baris.sql" "$B/20261024n_keu_v_rab_baris.sql" 46_uji_rab_baris.sql 47_uji_alur_editor_rab.sql 48_uji_layar_ppk_realisasi.sql; do
  psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$f" > /tmp/uji_n.log 2>&1 || { grep -iE "error|gagal|context|detail" /tmp/uji_n.log | head -12; echo "GAGAL: $f"; exit 1; }
done
psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$B/20261024z9_cek_kesehatan_keu_n.sql" -At | awk -F'|' '$1>=1 && $1<=4 && $3!="0" {print "P0 TIDAK NOL: "$0; bad=1} END{exit bad}' || { echo "GAGAL: z9"; exit 1; }
grep -q "LULUS 48" /tmp/uji_n.log || { echo "GAGAL: uji 47 tidak melapor lulus"; exit 1; }
echo "LULUS: a-f + h + i + j + k + l + m + uji 40-45 + n (dua kali) + uji 46-48 + z9"
