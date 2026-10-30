#!/bin/bash
# Pelari uji migrasi keu_ (PostgreSQL uji; bukan produksi).
#   ./jalan.sh semua <folder-a-b-c-z> <folder-d-e-f-z2>   rangkaian lengkap: stub, migrasi, uji berselang-seling
#   ./jalan.sh berkas1.sql berkas2.sql ...                hanya berkas yang disebut, berurutan (setelah 00_stub.sql)
# Mencetak "LULUS" hanya bila semua berkas sukses. Kegagalan koneksi dilaporkan sebagai GAGAL.
export PGHOST=${PGHOST:-/tmp/pgtest} PGPORT=${PGPORT:-5544} PGUSER=${PGUSER:-postgres}
cd "$(dirname "$0")" || exit 1
psql -qc "select 1" >/dev/null 2>&1 || { echo "GAGAL: server Postgres uji tidak hidup"; exit 2; }
if [ "$1" = "semua" ]; then
  A="${2:?folder migrasi a/b/c}"; B="${3:?folder migrasi d/e/f}"
  set -- 00_stub.sql \
    "$A/20261024a_keu_master.sql" "$A/20261024b_keu_master_dokumen.sql" 10_uji_master_peran_hak.sql 11_uji_penjaga_audit_rls.sql \
    "$A/20261024c_keu_pok.sql" 20_uji_pok_struktur.sql 21_uji_pok_versi_alias_guard.sql \
    "$B/20261024d_keu_rab.sql" 30_uji_rab.sql \
    "$B/20261024e_keu_revisi.sql" 31_uji_jadwal_usulan_sah.sql \
    "$B/20261024f_keu_kertas_kerja.sql" 32_uji_kertas_kerja.sql \
    12_uji_rangkap_peran.sql \
    "$A/20261024z_cek_kesehatan_keu.sql" "$B/20261024z2_cek_kesehatan_keu_bdf.sql"
else
  set -- 00_stub.sql "$@"
fi
psql -q -c "drop database if exists kk_uji" -c "create database kk_uji" 2>&1 | grep -v NOTICE
LOG=$(mktemp)
for f in "$@"; do
  psql -q -d kk_uji -v ON_ERROR_STOP=1 -f "$f" >"$LOG" 2>&1 || { grep -iE "error|gagal|context" "$LOG" | head; echo "GAGAL: $f"; exit 1; }
done
echo "LULUS: $# berkas"
