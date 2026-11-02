-- 20261102zh_pelatihan_hierarki.sql
--
-- (2 Nov 2026) Pelatihan 5 tab, tahap A: hierarki pengguna pelatihan (instruktur > korwil > PML > PPL) per kegiatan. AMAN DIULANG. Dijalankan Iqbal sendiri.
-- Hanya server (service role) yang menulis dan membaca: RLS aktif tanpa kebijakan. Instruktur dan panitia TIDAK ada di tabel ini: dibatasi KELAS
-- (sigap_kuis_instruktur_kelas) atau izin Kelola Pelatihan. Tanpa tabel ini kode tetap jalan: tab Monitoring memberi tahu bahwa hierarki belum disusun.

create table if not exists sigap_pelatihan_hierarki (
  kegiatan_id     bigint      not null references sigap_kegiatan(id) on delete cascade,
  akun_id         bigint      not null references sigap_akun(id),
  peran_pelatihan text        not null check (peran_pelatihan in ('ppl','pml','korwil')),
  atasan_akun_id  bigint      references sigap_akun(id),
  sumber          text        not null default 'manual' check (sumber in ('salin_psp','salin_sampel','manual')),
  diubah_oleh     text,
  diubah_at       timestamptz not null default now(),
  primary key (kegiatan_id, akun_id),
  check (atasan_akun_id is null or atasan_akun_id <> akun_id)
);

create index if not exists sigap_pelatihan_hierarki_atasan_idx on sigap_pelatihan_hierarki (kegiatan_id, atasan_akun_id);

alter table sigap_pelatihan_hierarki enable row level security;

-- Salin awal untuk satu kegiatan pelatihan: setiap peserta aktif (penugasan PPL/PML/korwil, bukan Administrasi) dimasukkan; atasan diambil dari
-- bencana_petugas.atasan_id HANYA bila atasan itu juga peserta aktif (PML/korwil) pelatihan yang sama. Baris yang sudah ada (mis. dikoreksi manual) TIDAK diubah.
-- Peringatan: bencana_petugas.atasan_id berasal dari penugasan PSP Pascabencana; untuk kegiatan lain (mis. Seruti TW IV) hasilnya hanya titik awal
-- dan harus diperiksa (jumlah tanpa atasan ditampilkan di akhir). Mengembalikan jumlah baris baru.
create or replace function sigap_pelatihan_salin_hierarki(p_kegiatan bigint)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  with peserta as (
    select distinct on (p.akun_id) p.akun_id, p.peran
    from sigap_penugasan p
    where p.kegiatan_id = p_kegiatan
      and p.aktif
      and p.peran in ('ppl','pml','korwil')
      and (p.sumber is null or p.sumber <> 'administrasi')
    order by p.akun_id, case p.peran when 'korwil' then 0 when 'pml' then 1 else 2 end
  ),
  calon as (
    select pe.akun_id,
           pe.peran,
           (select a2.id
              from sigap_akun a
              join bencana_petugas bp on bp.id = a.petugas_bencana_id
              join sigap_akun a2 on a2.petugas_bencana_id = bp.atasan_id
              join peserta ps on ps.akun_id = a2.id and ps.peran in ('pml','korwil')
             where a.id = pe.akun_id and a2.id <> pe.akun_id
             limit 1) as atasan
    from peserta pe
  )
  insert into sigap_pelatihan_hierarki (kegiatan_id, akun_id, peran_pelatihan, atasan_akun_id, sumber, diubah_oleh)
  select p_kegiatan, c.akun_id, c.peran, c.atasan, case when c.atasan is null then 'manual' else 'salin_psp' end, 'salin awal'
  from calon c
  on conflict (kegiatan_id, akun_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Cara pakai (satu kegiatan, mis. Seruti TW IV = 7):
--   select sigap_pelatihan_salin_hierarki(7);
-- Periksa hasil:
--   select peran_pelatihan, count(*) as jumlah, count(atasan_akun_id) as punya_atasan from sigap_pelatihan_hierarki where kegiatan_id = 7 group by 1 order by 1;
-- Koreksi satu atasan (sementara, sebelum layar Kelola tersedia):
--   update sigap_pelatihan_hierarki set atasan_akun_id = <akun PML>, sumber = 'manual', diubah_oleh = 'iqbal', diubah_at = now() where kegiatan_id = 7 and akun_id = <akun PPL>;
-- Cek cepat (harus 1 dan 1):
--   select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'sigap_pelatihan_hierarki';
--   select count(*) from pg_proc where proname = 'sigap_pelatihan_salin_hierarki';
