-- =====================================================================
-- 20261029e_qc_relasi_pml_spdt_supervisor.sql
-- (29 Okt 2026) QC Pemahaman SPDT NTP: (1) relasi PML-PPL diambil dari daftar KK (sigap_spdt_kk), yang sama dengan Excel
-- "SPDT_NTP_untuk_Sigap.xlsx"; (2) Supervisor SPDT NTP tidak menjadi peserta QC.
--
-- Sebelumnya rekap QC membaca atasan dari bencana_petugas.atasan_id (relasi Pascabencana). Untuk SPDT NTP kolom itu kosong, sehingga
-- semua PPL tampil "Tanpa PML". Sekarang, bila PPL punya KK di sigap_spdt_kk, PML-nya = pml_akun_id pada KK itu. PPL yang pada
-- KK-nya ada di dua PML (Dana Nokeladio: Ayu Sepriani dan Megawati) muncul pada rekap KEDUA PML itu; sebagai peserta tetap SATU baris
-- (PML dengan KK terbanyak) agar status/penagihan/push tidak ganda. Kegiatan tanpa data KK (Pascabencana) tidak berubah.
--
-- Supervisor: akun yang memegang peran akun `supervisor_spdt_ntp` (lingkup kegiatan itu atau semua) tidak lagi menjadi peserta QC
-- kegiatan tersebut, walau masih punya penugasan PPL/PML (Faisal #200 dan Mailani #357 masih tercatat PPL karena sudah bersurat tugas).
-- Riwayat jawaban mereka tidak dihapus. Hasil QC dilihat Supervisor lewat tab "QC" di Lembar Pendataan SPDT NTP (kode terpisah).
--
-- Aman diulang (create or replace). Tidak mengubah tabel. Hanya service_role yang boleh memanggil.
-- =====================================================================

create or replace function sigap_qc_relasi(p_kegiatan bigint)
returns table(ppl_akun_id bigint, pml_akun_id bigint, pml_nama text, jumlah integer)
language sql stable security definer set search_path = public as $$
  with kk as (
    select k.ppl_akun_id, k.pml_akun_id, count(*)::integer as jumlah
      from sigap_spdt_kk k
     where k.kegiatan_id = p_kegiatan and k.ppl_akun_id is not null and k.pml_akun_id is not null
     group by k.ppl_akun_id, k.pml_akun_id),
  lama as (
    -- jalur lama (atasan petugas bencana) hanya untuk PPL yang TIDAK punya KK
    select a.id as ppl_akun_id, pa.id as pml_akun_id, 0 as jumlah
      from sigap_penugasan p
      join sigap_akun a on a.id = p.akun_id and a.aktif
      join bencana_petugas bp on bp.id = a.petugas_bencana_id
      join sigap_akun pa on pa.petugas_bencana_id = bp.atasan_id and pa.aktif
      join sigap_penugasan pp on pp.akun_id = pa.id and pp.kegiatan_id = p_kegiatan and pp.peran = 'pml' and pp.aktif
     where p.kegiatan_id = p_kegiatan and p.aktif and p.peran = 'ppl'
       and not exists (select 1 from kk where kk.ppl_akun_id = a.id))
  select r.ppl_akun_id, r.pml_akun_id, pa.nama, r.jumlah
    from (select * from kk union all select * from lama) r
    join sigap_akun pa on pa.id = r.pml_akun_id and pa.aktif
$$;

create or replace function sigap_qc_peserta(p_kegiatan bigint)
returns table(akun_id bigint, nama text, peran text, pml_akun_id bigint, pml_nama text)
language sql stable security definer set search_path = public as $$
  select p.akun_id, a.nama, p.peran, r.pml_akun_id, r.pml_nama
    from sigap_penugasan p
    join sigap_akun a on a.id = p.akun_id and a.aktif
    left join lateral (
      select x.pml_akun_id, x.pml_nama from sigap_qc_relasi(p_kegiatan) x
       where p.peran = 'ppl' and x.ppl_akun_id = p.akun_id
       order by x.jumlah desc, x.pml_akun_id limit 1) r on true
   where p.kegiatan_id = p_kegiatan and p.aktif and p.peran in ('pml', 'ppl')
     and p.peran = any (coalesce((select g.peran_peserta from sigap_qc_pengaturan g where g.kegiatan_id = p_kegiatan), array['pml','ppl']::text[]))
     and not exists (
       select 1 from sigap_akun_peran ap join sigap_peran sr on sr.id = ap.peran_id
        where ap.akun_id = p.akun_id and sr.kode = 'supervisor_spdt_ntp' and (ap.kegiatan_id is null or ap.kegiatan_id = p_kegiatan))
$$;

create or replace function sigap_qc_rekap(p_kegiatan bigint, p_tanggal date, p_pml bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hasil jsonb;
begin
  with pes as (select * from sigap_qc_peserta(p_kegiatan)),
  rel as (select * from sigap_qc_relasi(p_kegiatan)),
  pc as (
    select c.akun_id, count(*) as n, max(c.skor) as terbaik, bool_or(sigap_qc_lulus(p_kegiatan, c.benar, c.jumlah)) as lulus, bool_or(c.terlambat) as terlambat,
           max(c.skor) filter (where c.ke = 1) as awal, (select c1.salah from sigap_qc_percobaan c1
             where c1.kegiatan_id = p_kegiatan and c1.tanggal = p_tanggal and c1.akun_id = c.akun_id and c1.ke = 1) as salah_awal
      from sigap_qc_percobaan c where c.kegiatan_id = p_kegiatan and c.tanggal = p_tanggal group by c.akun_id),
  ppl as (
    -- PPL muncul pada SETIAP PML-nya (relasi KK); tanpa relasi = "Tanpa PML" (id 0)
    select coalesce(r.pml_akun_id, 0) as pml, r.pml_nama, q.akun_id, q.nama, coalesce(pc.n, 0) as n, pc.terbaik, pc.awal, coalesce(pc.lulus, false) as lulus,
           coalesce(pc.terlambat, false) as terlambat, coalesce(pc.salah_awal, '{}') as salah_awal
      from pes q left join rel r on r.ppl_akun_id = q.akun_id left join pc on pc.akun_id = q.akun_id
     where q.peran = 'ppl' and (p_pml is null or coalesce(r.pml_akun_id, 0) = p_pml)),
  grup as (
    select coalesce(p.pml, 0) as pml, max(p.pml_nama) as pml_nama from ppl p group by p.pml
    union
    select q.akun_id, q.nama from pes q where q.peran = 'pml' and (p_pml is null or q.akun_id = p_pml)),
  grup1 as (select g.pml, max(g.pml_nama) as pml_nama from grup g group by g.pml),
  salah as (
    select p.pml, s.id as soal_id, s.pertanyaan, s.penjelasan, s.opsi ->> s.kunci as kunci_teks, s.kunci, count(*) as jumlah, jsonb_agg(p.nama order by p.nama) as nama
      from ppl p cross join lateral unnest(p.salah_awal) as sid(x) join sigap_qc_soal s on s.id = sid.x
     group by p.pml, s.id, s.pertanyaan, s.penjelasan, s.opsi, s.kunci)
  select coalesce(jsonb_agg(jsonb_build_object(
           'pml_akun_id', g.pml,
           'pml_nama', coalesce(g.pml_nama, case when g.pml = 0 then 'Tanpa PML' else null end),
           'pml_sendiri', (select jsonb_build_object('percobaan', coalesce(pc.n, 0), 'skor_terbaik', pc.terbaik, 'lulus', coalesce(pc.lulus, false)) from pc where pc.akun_id = g.pml),
           'jumlah_ppl', (select count(*) from ppl p where p.pml = g.pml),
           'sudah', (select count(*) from ppl p where p.pml = g.pml and p.n > 0),
           'belum_mengisi', (select count(*) from ppl p where p.pml = g.pml and p.n = 0),
           'lulus', (select count(*) from ppl p where p.pml = g.pml and p.lulus),
           'rata_awal', (select round(avg(p.awal)) from ppl p where p.pml = g.pml and p.n > 0),
           'rata_terbaik', (select round(avg(p.terbaik)) from ppl p where p.pml = g.pml and p.n > 0),
           'ppl', (select coalesce(jsonb_agg(jsonb_build_object('akun_id', p.akun_id, 'nama', p.nama, 'percobaan', p.n, 'skor_awal', p.awal, 'skor_terbaik', p.terbaik,
                     'lulus', p.lulus, 'terlambat', p.terlambat, 'status', case when p.n = 0 then 'belum_mengisi' when p.lulus then 'lulus' else 'belum_100' end)
                     order by (p.n = 0) desc, p.terbaik nulls first, p.nama), '[]'::jsonb) from ppl p where p.pml = g.pml),
           'salah', (select coalesce(jsonb_agg(jsonb_build_object('soal_id', z.soal_id, 'pertanyaan', z.pertanyaan, 'kunci', z.kunci, 'kunci_teks', z.kunci_teks,
                     'penjelasan', z.penjelasan, 'jumlah', z.jumlah, 'nama', z.nama) order by z.jumlah desc, z.soal_id), '[]'::jsonb) from salah z where z.pml = g.pml)
         ) order by g.pml_nama nulls last), '[]'::jsonb)
    into v_hasil
    from grup1 g;
  return v_hasil;
end $$;

do $$
declare f text;
begin
  foreach f in array array['sigap_qc_relasi(bigint)', 'sigap_qc_peserta(bigint)', 'sigap_qc_rekap(bigint,date,bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
