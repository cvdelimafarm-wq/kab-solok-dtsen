-- =====================================================================
-- 20261030b_qc_sumber_soal.sql
-- SIGAP - QC Pemahaman: SUMBER SOAL harian (30 Okt 2026)
--
-- Permintaan user: di pengaturan QC Pemahaman, selain undian dari seluruh bank soal, admin bisa (a) memilih PAKET tertentu atau (b) mencentang SOAL satu per satu.
-- Pengaturan baru pada sigap_qc_pengaturan:
--   sumber_soal    text      'semua' (bawaan = perilaku lama) | 'paket' | 'pilihan'
--   paket_pilihan  smallint[] paket yang dipakai bila sumber_soal = 'paket'
--   soal_pilihan   text[]    kode soal yang dipakai bila sumber_soal = 'pilihan'
-- Undian harian (sigap_qc_undi) kini hanya menarik dari KOLAM itu; "undi acak / berurutan" dan "soal per hari" tetap berlaku di dalam kolam.
-- Hari yang sudah diundi tidak berubah (sigap_qc_hari menyimpan soal_ids); pengaturan baru berlaku untuk hari berikutnya atau lewat Undi ulang (selama belum ada jawaban).
-- (30 Okt 2026) Ditambah pemeriksaan kecocokan HARI rilis vs TANGGAL periode: periode yang tidak memuat satu pun hari rilis ditolak.
-- Tidak ada data dihapus; kegiatan yang sudah ada tetap 'semua'.
--
-- Aman diulang (add column if not exists / create or replace). Jalankan oleh user (DDL produksi), SESUDAH 20261029c; lalu supabase/tests/78_uji_qc_sumber_soal.sql.
-- =====================================================================

alter table public.sigap_qc_pengaturan add column if not exists sumber_soal   text       not null default 'semua';
alter table public.sigap_qc_pengaturan add column if not exists paket_pilihan smallint[] not null default '{}';
alter table public.sigap_qc_pengaturan add column if not exists soal_pilihan  text[]     not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sigap_qc_pengaturan'::regclass and conname = 'sigap_qc_pengaturan_sumber_soal_cek') then
    alter table public.sigap_qc_pengaturan add constraint sigap_qc_pengaturan_sumber_soal_cek check (sumber_soal in ('semua', 'paket', 'pilihan'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Undian soal: dari kolam menurut sumber_soal
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_undi(p_kegiatan bigint, p_jumlah integer)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v_hasil text[]; v_acak boolean; v_sumber text; v_paket smallint[]; v_soal text[];
begin
  select coalesce(g.undi_acak, true), coalesce(g.sumber_soal, 'semua'), coalesce(g.paket_pilihan, '{}'), coalesce(g.soal_pilihan, '{}')
    into v_acak, v_sumber, v_paket, v_soal
    from sigap_qc_pengaturan g where g.kegiatan_id = p_kegiatan;
  v_acak := coalesce(v_acak, true);
  v_sumber := coalesce(v_sumber, 'semua');
  v_paket := coalesce(v_paket, '{}');
  v_soal := coalesce(v_soal, '{}');
  select coalesce(array_agg(id), '{}') into v_hasil from (
    select x.id from (
      select s.id, s.paket, s.nomor,
             coalesce((select max(h.tanggal) from sigap_qc_hari h where h.kegiatan_id = p_kegiatan and s.id = any (h.soal_ids)), date '1900-01-01') as terakhir,
             row_number() over (partition by s.paket order by
               coalesce((select max(h.tanggal) from sigap_qc_hari h where h.kegiatan_id = p_kegiatan and s.id = any (h.soal_ids)), date '1900-01-01'),
               (case when v_acak then random() else 0 end), s.nomor, s.id) as rn
      from sigap_qc_soal s
      where s.aktif and s.kegiatan_id = p_kegiatan
        -- kolam soal menurut "sumber soal": semua soal aktif, hanya paket terpilih, atau hanya soal yang dicentang
        and (v_sumber = 'semua' or (v_sumber = 'paket' and s.paket = any (v_paket)) or (v_sumber = 'pilihan' and s.id = any (v_soal)))
    ) x
    order by (case when x.rn = 1 then 0 else 1 end), x.terakhir, (case when v_acak then random() else 0 end), x.paket, x.nomor, x.id
    limit greatest(p_jumlah, 0)
  ) y;
  return v_hasil;
end $$;

-- ---------------------------------------------------------------------
-- Simpan pengaturan: + sumber_soal, paket_pilihan, soal_pilihan (salinan 20261029c dengan tambahan)
-- ---------------------------------------------------------------------
create or replace function public.sigap_qc_pengaturan_simpan(p_kegiatan bigint, p_data jsonb, p_oleh text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r sigap_qc_pengaturan%rowtype; v_menit integer[]; v_sel integer; v_aktif_lama boolean; v_now timestamp; v_hari smallint[]; v_peran text[]; v_paket smallint[]; v_soal text[];
begin
  if not exists (select 1 from sigap_kegiatan where id = p_kegiatan) then raise exception 'Kegiatan tidak ditemukan' using errcode = 'P0001'; end if;
  insert into sigap_qc_pengaturan (kegiatan_id) values (p_kegiatan) on conflict do nothing;
  select * into r from sigap_qc_pengaturan where kegiatan_id = p_kegiatan;
  v_aktif_lama := r.aktif;
  if p_data ? 'aktif'         then r.aktif := (p_data ->> 'aktif')::boolean; end if;
  if p_data ? 'rilis_jam'     then r.rilis_jam := (p_data ->> 'rilis_jam')::time; end if;
  if p_data ? 'batas_jam'     then r.batas_jam := (p_data ->> 'batas_jam')::time; end if;
  if p_data ? 'soal_per_hari' then r.soal_per_hari := (p_data ->> 'soal_per_hari')::smallint; end if;
  if p_data ? 'maks_ulang'    then r.maks_ulang := (p_data ->> 'maks_ulang')::smallint; end if;
  if p_data ? 'rekap_jam'     then r.rekap_jam := (p_data ->> 'rekap_jam')::time; end if;
  if p_data ? 'ingat_berkala_menit' then r.ingat_berkala_menit := (p_data ->> 'ingat_berkala_menit')::integer; end if;
  if p_data ? 'mulai'         then r.mulai := nullif(p_data ->> 'mulai', '')::date; end if;
  if p_data ? 'akhir'         then r.akhir := nullif(p_data ->> 'akhir', '')::date; end if;
  if p_data ? 'wajib_ulang'   then r.wajib_ulang := (p_data ->> 'wajib_ulang')::boolean; end if;
  if p_data ? 'nilai_lulus'   then r.nilai_lulus := (p_data ->> 'nilai_lulus')::smallint; end if;
  if p_data ? 'undi_acak'     then r.undi_acak := (p_data ->> 'undi_acak')::boolean; end if;
  if p_data ? 'acak_tampil'   then r.acak_tampil := (p_data ->> 'acak_tampil')::boolean; end if;
  if p_data ? 'rekap_pml'     then r.rekap_pml := (p_data ->> 'rekap_pml')::boolean; end if;
  if p_data ? 'sumber_soal'   then
    if (p_data ->> 'sumber_soal') not in ('semua', 'paket', 'pilihan') then raise exception 'Sumber soal harus semua, paket, atau pilihan' using errcode = 'P0001'; end if;
    r.sumber_soal := p_data ->> 'sumber_soal';
  end if;
  if p_data ? 'paket_pilihan' then
    select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into v_paket from jsonb_array_elements_text(p_data -> 'paket_pilihan') x;
    r.paket_pilihan := v_paket;
  end if;
  if p_data ? 'soal_pilihan'  then
    select coalesce(array_agg(distinct btrim(x) order by btrim(x)), '{}') into v_soal from jsonb_array_elements_text(p_data -> 'soal_pilihan') x where btrim(x) <> '';
    r.soal_pilihan := v_soal;
  end if;
  if p_data ? 'hari_rilis'    then
    select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into v_hari from jsonb_array_elements_text(p_data -> 'hari_rilis') x;
    if cardinality(v_hari) < 1 or not (v_hari <@ array[1,2,3,4,5,6,7]::smallint[]) then raise exception 'Hari rilis harus berisi minimal satu hari (1 Senin sampai 7 Minggu)' using errcode = 'P0001'; end if;
    r.hari_rilis := v_hari;
  end if;
  if p_data ? 'peran_peserta' then
    select coalesce(array_agg(distinct x order by x), '{}') into v_peran from jsonb_array_elements_text(p_data -> 'peran_peserta') x;
    if cardinality(v_peran) < 1 or not (v_peran <@ array['pml','ppl']::text[]) then raise exception 'Peserta harus berisi PML, PPL, atau keduanya' using errcode = 'P0001'; end if;
    r.peran_peserta := v_peran;
  end if;
  if p_data ? 'ingat_menit'   then
    select coalesce(array_agg(distinct x::integer order by x::integer), '{}') into v_menit from jsonb_array_elements_text(p_data -> 'ingat_menit') x;
    r.ingat_menit := v_menit;
  end if;
  if r.rilis_jam >= r.batas_jam then raise exception 'Jam batas harus sesudah jam rilis' using errcode = 'P0001'; end if;
  -- hari rilis harus cocok dengan tanggal periode: minimal satu hari rilis jatuh di dalam periode (30 Okt 2026)
  if r.mulai is not null and r.akhir is not null then
    if r.akhir < r.mulai then raise exception 'Tanggal akhir tidak boleh sebelum tanggal mulai' using errcode = 'P0001'; end if;
    if not exists (select 1 from generate_series(r.mulai::timestamp, least(r.akhir, r.mulai + 6)::timestamp, interval '1 day') g where extract(isodow from g)::smallint = any (r.hari_rilis)) then
      raise exception 'Periode tidak memuat satu pun hari rilis (hari rilis: %), jadi soal tidak akan pernah dirilis', array_to_string(r.hari_rilis, ',') using errcode = 'P0001';
    end if;
  end if;
  if r.nilai_lulus < 1 or r.nilai_lulus > 100 then raise exception 'Nilai lulus harus 1-100' using errcode = 'P0001'; end if;
  v_sel := (extract(epoch from (r.batas_jam - r.rilis_jam)) / 60)::integer;
  if exists (select 1 from unnest(r.ingat_menit) m where m < 1 or m >= v_sel) then
    raise exception 'Menit pengingat harus di antara jam rilis dan jam batas' using errcode = 'P0001';
  end if;
  if r.ingat_berkala_menit <> 0 and r.ingat_berkala_menit not between 15 and 720 then raise exception 'Pengingat berkala harus 0 (mati) atau 15-720 menit' using errcode = 'P0001'; end if;
  -- sumber soal: kolam yang dipilih harus ada isinya (paket terpilih punya soal aktif / soal yang dicentang milik kegiatan ini dan ada yang aktif)
  if r.sumber_soal = 'paket' then
    if cardinality(r.paket_pilihan) < 1 then raise exception 'Pilih minimal satu paket soal' using errcode = 'P0001'; end if;
    if not exists (select 1 from sigap_qc_soal where aktif and kegiatan_id = p_kegiatan and paket = any (r.paket_pilihan)) then
      raise exception 'Paket yang dipilih tidak punya soal aktif' using errcode = 'P0001';
    end if;
  elsif r.sumber_soal = 'pilihan' then
    if cardinality(r.soal_pilihan) < 1 then raise exception 'Centang minimal satu soal' using errcode = 'P0001'; end if;
    if exists (select 1 from unnest(r.soal_pilihan) i where not exists (select 1 from sigap_qc_soal s where s.id = i and s.kegiatan_id = p_kegiatan)) then
      raise exception 'Ada soal yang dicentang bukan milik kegiatan ini' using errcode = 'P0001';
    end if;
    if not exists (select 1 from sigap_qc_soal where aktif and kegiatan_id = p_kegiatan and id = any (r.soal_pilihan)) then
      raise exception 'Soal yang dicentang tidak ada yang aktif' using errcode = 'P0001';
    end if;
  end if;
  if r.aktif and (select count(*) from sigap_qc_soal where aktif and kegiatan_id = p_kegiatan) < 1 then raise exception 'Bank soal kegiatan ini kosong. Tambahkan atau impor soal dulu.' using errcode = 'P0001'; end if;
  update sigap_qc_pengaturan set aktif = r.aktif, rilis_jam = r.rilis_jam, batas_jam = r.batas_jam, soal_per_hari = r.soal_per_hari, maks_ulang = r.maks_ulang,
         rekap_jam = r.rekap_jam, ingat_menit = r.ingat_menit, ingat_berkala_menit = r.ingat_berkala_menit, mulai = r.mulai, akhir = r.akhir,
         wajib_ulang = r.wajib_ulang, nilai_lulus = r.nilai_lulus, undi_acak = r.undi_acak, acak_tampil = r.acak_tampil, hari_rilis = r.hari_rilis,
         peran_peserta = r.peran_peserta, rekap_pml = r.rekap_pml, sumber_soal = r.sumber_soal, paket_pilihan = r.paket_pilihan, soal_pilihan = r.soal_pilihan,
         diubah_oleh = p_oleh, diubah_at = now()
   where kegiatan_id = p_kegiatan;
  -- QC baru DINYALAKAN sesudah jam batas pada hari rilis (mis. fitur baru aktif malam hari): hari itu otomatis hari SUSULAN
  if r.aktif and not coalesce(v_aktif_lama, false) then
    v_now := now() at time zone 'Asia/Jakarta';
    if v_now::time >= r.batas_jam and extract(isodow from v_now::date)::smallint = any (r.hari_rilis)
       and (r.mulai is null or v_now::date >= r.mulai) and (r.akhir is null or v_now::date <= r.akhir)
       and not exists (select 1 from sigap_qc_percobaan where kegiatan_id = p_kegiatan and tanggal = v_now::date) then
      perform sigap_qc_hari_susulan(p_kegiatan, v_now::date, true);
    end if;
  end if;
  return to_jsonb((select x from sigap_qc_pengaturan x where x.kegiatan_id = p_kegiatan));
end $$;
