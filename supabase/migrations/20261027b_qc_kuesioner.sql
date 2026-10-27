-- =====================================================================
-- 20261027b_qc_kuesioner.sql
-- SIGAP - Kuesioner Quality Check korwil (Lembar Supervisi) (27 Okt 2026)
--
-- Kuesioner QC diunggah admin dari berkas Excel "Kuesioner QC Korwil" (lembar "Kuesioner QC" + "Kriteria Penilaian"): aspek QC-1..n, tiap aspek
-- berisi pertanyaan T (tanya) / O (observasi) / N (angka) dengan nilai jawaban 1-3. Dua objek: 'petugas' (PML/PPL) dan 'kk' (keluarga).
-- Tiap unggahan membuat VERSI baru dan menonaktifkan versi lama (tidak ada penghapusan; lembar lama tetap merujuk versinya sendiri).
-- Kortim (kelompoknya) dan admin pendataan mengisi LEMBAR dari halaman Lembar Supervisi. Skor aspek dan kategori petugas dihitung aplikasi
-- (lib/sigapQcKuesioner.ts) dan disimpan di kolom `ringkas`.
-- Semua akses lewat API server (service_role); RLS aktif tanpa kebijakan. Aman diulang.
-- =====================================================================

create table if not exists public.sigap_qc_kuesioner (
  id           bigserial primary key,
  kegiatan_id  bigint not null references public.sigap_kegiatan(id),
  objek        text   not null check (objek in ('petugas', 'kk')),
  versi        integer not null check (versi >= 1),
  aktif        boolean not null default true,
  judul        text   not null default '',
  berkas_nama  text,
  struktur     jsonb  not null check (jsonb_typeof(struktur -> 'aspek') = 'array'),
  jumlah_aspek integer not null default 0,
  jumlah_soal  integer not null default 0,
  dibuat_oleh  text,
  dibuat_at    timestamptz not null default now(),
  unique (kegiatan_id, objek, versi)
);
-- hanya satu versi aktif per kegiatan + objek
create unique index if not exists sigap_qc_kuesioner_aktif_uq on public.sigap_qc_kuesioner (kegiatan_id, objek) where aktif;

create table if not exists public.sigap_qc_lembar (
  id                bigserial primary key,
  kuesioner_id      bigint not null references public.sigap_qc_kuesioner(id),
  kegiatan_id       bigint not null references public.sigap_kegiatan(id),
  objek             text   not null check (objek in ('petugas', 'kk')),
  kelompok          smallint,
  tanggal           date   not null,
  pemeriksa_akun_id bigint not null,
  subjek_akun_id    bigint,            -- petugas yang diperiksa (objek petugas) / PPL pendata KK (objek kk)
  kk_id             bigint,            -- bencana_pendataan_kk.id (objek kk)
  identitas         jsonb  not null default '{}'::jsonb,   -- {kecamatan, nagari, sls, jenis_qc}
  jawaban           jsonb  not null default '{}'::jsonb check (jsonb_typeof(jawaban) = 'object'),  -- {diperiksa:{QC-1:true}, jawab:{"1.1":"Semua"}}
  ringkas           jsonb  not null default '{}'::jsonb,   -- kesimpulan: skor per aspek, jumlah 1/2/3, kategori, qc_ulang, lengkap
  catatan           text   not null default '',            -- temuan utama
  tindak_lanjut     text   not null default '',
  tenggat           date,
  dibuat_at         timestamptz not null default now(),
  diubah_at         timestamptz not null default now(),
  check (objek <> 'kk' or kk_id is not null),
  check (objek <> 'petugas' or subjek_akun_id is not null)
);
create unique index if not exists sigap_qc_lembar_uq
  on public.sigap_qc_lembar (kuesioner_id, tanggal, pemeriksa_akun_id, coalesce(subjek_akun_id, 0), coalesce(kk_id, 0));
create index if not exists sigap_qc_lembar_kegiatan_idx on public.sigap_qc_lembar (kegiatan_id, tanggal desc);

alter table public.sigap_qc_kuesioner enable row level security;
alter table public.sigap_qc_lembar    enable row level security;
revoke all on public.sigap_qc_kuesioner, public.sigap_qc_lembar from anon, authenticated;
grant all on public.sigap_qc_kuesioner, public.sigap_qc_lembar to service_role;
grant usage, select on sequence public.sigap_qc_kuesioner_id_seq, public.sigap_qc_lembar_id_seq to service_role;

-- Unggah satu versi baru secara atomik: nonaktifkan versi lama lalu buat versi baru. p_struktur = {aspek:[{kode,judul,untuk,peran,kriteria,soal:[...]}]}
create or replace function public.sigap_qc_kuesioner_unggah(p_kegiatan bigint, p_objek text, p_judul text, p_berkas text, p_struktur jsonb, p_oleh text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_versi integer; v_id bigint; v_aspek integer; v_soal integer;
begin
  if p_objek not in ('petugas', 'kk') then raise exception 'Objek harus petugas atau kk' using errcode = 'P0001'; end if;
  if p_struktur is null or jsonb_typeof(p_struktur -> 'aspek') <> 'array' or jsonb_array_length(p_struktur -> 'aspek') = 0 then
    raise exception 'Kuesioner kosong' using errcode = 'P0001';
  end if;
  if not exists (select 1 from sigap_kegiatan where id = p_kegiatan) then raise exception 'Kegiatan tidak ditemukan' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('sigap_qc_kuesioner:' || p_kegiatan || ':' || p_objek));
  v_aspek := jsonb_array_length(p_struktur -> 'aspek');
  select coalesce(sum(jsonb_array_length(a -> 'soal')), 0)::integer into v_soal from jsonb_array_elements(p_struktur -> 'aspek') a;
  select coalesce(max(versi), 0) + 1 into v_versi from sigap_qc_kuesioner where kegiatan_id = p_kegiatan and objek = p_objek;
  update sigap_qc_kuesioner set aktif = false where kegiatan_id = p_kegiatan and objek = p_objek and aktif;
  insert into sigap_qc_kuesioner (kegiatan_id, objek, versi, aktif, judul, berkas_nama, struktur, jumlah_aspek, jumlah_soal, dibuat_oleh)
  values (p_kegiatan, p_objek, v_versi, true, coalesce(p_judul, ''), p_berkas, p_struktur, v_aspek, v_soal, p_oleh) returning id into v_id;
  return jsonb_build_object('id', v_id, 'versi', v_versi, 'aspek', v_aspek, 'soal', v_soal);
end $$;

-- Kembali ke versi lama (mengaktifkan lagi); tidak menghapus apa pun
create or replace function public.sigap_qc_kuesioner_aktifkan(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare k sigap_qc_kuesioner%rowtype;
begin
  select * into k from sigap_qc_kuesioner where id = p_id;
  if not found then raise exception 'Versi kuesioner tidak ditemukan' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('sigap_qc_kuesioner:' || k.kegiatan_id || ':' || k.objek));
  update sigap_qc_kuesioner set aktif = false where kegiatan_id = k.kegiatan_id and objek = k.objek and aktif and id <> p_id;
  update sigap_qc_kuesioner set aktif = true where id = p_id;
  return jsonb_build_object('id', p_id, 'versi', k.versi);
end $$;

revoke all on function public.sigap_qc_kuesioner_unggah(bigint, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.sigap_qc_kuesioner_aktifkan(bigint) from public, anon, authenticated;
grant execute on function public.sigap_qc_kuesioner_unggah(bigint, text, text, text, jsonb, text) to service_role;
grant execute on function public.sigap_qc_kuesioner_aktifkan(bigint) to service_role;
