-- =====================================================================
-- 20261029d_qc_soal_benar_salah.sql
-- SIGAP - QC Pemahaman: soal 2 pilihan (Benar/Salah) di samping soal 4 pilihan (29 Okt 2026)
--
-- Sebelumnya setiap soal wajib punya pilihan A-D (constraint tabel + validasi). Kini soal boleh hanya berisi A dan B (mis. Benar/Salah):
--   * constraint sigap_qc_soal_opsi_check: A dan B wajib; C dan D berpasangan (keduanya ada atau keduanya tidak); kunci harus salah satu pilihan yang ada
--   * sigap_qc_soal_simpan: validasi yang sama
--   * sigap_qc_soal_untuk: urutan pilihan soal 2 pilihan TIDAK diacak (Benar selalu di atas); soal 4 pilihan tetap mengikuti acak_tampil
--   * sigap_qc_jawab: jawaban harus salah satu pilihan soal itu (sebelumnya sekadar A-D)
-- Semua soal yang sudah ada (4 pilihan) lolos constraint baru, perilaku QC Pascabencana tidak berubah. Aman diulang. Hak eksekusi: hanya service_role.
-- =====================================================================

alter table public.sigap_qc_soal drop constraint if exists sigap_qc_soal_opsi_check;
alter table public.sigap_qc_soal add constraint sigap_qc_soal_opsi_check check (
  jsonb_typeof(opsi) = 'object'
  and opsi ?& array['A', 'B']
  and ((opsi ? 'C') = (opsi ? 'D'))
  and (opsi ? kunci)
);

create or replace function public.sigap_qc_soal_untuk(p_akun bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb; v_ids text[]; v_tgl date; v_ke integer; v_acak boolean;
begin
  st := sigap_qc_status(p_akun);
  if not coalesce((st ->> 'aktif')::boolean, false) or not coalesce((st ->> 'perlu')::boolean, false) then
    raise exception 'Tidak ada soal QC yang perlu dikerjakan' using errcode = 'P0001';
  end if;
  v_tgl := (st ->> 'tanggal')::date;
  v_acak := coalesce((st ->> 'acak_tampil')::boolean, true);
  v_ids := sigap_qc_hari_pastikan((st ->> 'kegiatan_id')::bigint, v_tgl);
  v_ke := (st ->> 'percobaan')::integer + 1;
  return jsonb_build_object(
    'tanggal', v_tgl, 'ke', v_ke, 'kegiatan_id', st -> 'kegiatan_id', 'kegiatan_nama', st -> 'kegiatan_nama', 'maks_percobaan', st -> 'maks_percobaan',
    'nilai_lulus', st -> 'nilai_lulus', 'wajib_ulang', st -> 'wajib_ulang',
    'batas_at', st -> 'batas_at', 'lewat_batas', st -> 'lewat_batas', 'susulan', st -> 'susulan',
    'soal', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'paket', s.paket, 'judul_paket', s.judul_paket, 'pertanyaan', s.pertanyaan, 'kata_kunci', to_jsonb(s.kata_kunci),
               'opsi', (select jsonb_agg(jsonb_build_object('kode', o.key, 'teks', o.value #>> '{}')
                                         order by (case when v_acak and (s.opsi ? 'C') then md5(p_akun || ':' || v_tgl || ':' || v_ke || ':' || s.id || ':' || o.key) else o.key end))
                          from jsonb_each(s.opsi) o))
             order by (case when v_acak then md5(p_akun || ':' || v_tgl || ':' || v_ke || ':' || s.id) else lpad(s.paket::text, 3, '0') || lpad(s.nomor::text, 5, '0') || s.id end)), '[]'::jsonb)
        from sigap_qc_soal s where s.id = any (v_ids)));
end $$;

create or replace function public.sigap_qc_jawab(p_akun bigint, p_jawaban jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st jsonb; v_keg bigint; v_tgl date; v_ids text[]; v_ke integer; v_jml integer; v_benar integer; v_salah text[]; v_simpan jsonb; v_late boolean;
begin
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then raise exception 'Jawaban tidak valid' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('sigap_qc_jawab:' || p_akun));
  st := sigap_qc_status(p_akun);
  if not coalesce((st ->> 'aktif')::boolean, false) or not coalesce((st ->> 'perlu')::boolean, false) then
    raise exception 'Tidak ada soal QC yang perlu dikerjakan' using errcode = 'P0001';
  end if;
  v_keg := (st ->> 'kegiatan_id')::bigint; v_tgl := (st ->> 'tanggal')::date;
  v_ids := sigap_qc_hari_pastikan(v_keg, v_tgl);
  v_ke := (st ->> 'percobaan')::integer + 1;
  v_late := coalesce((st ->> 'lewat_batas')::boolean, false);  -- hari susulan: tidak pernah terlambat

  select count(*),
         count(*) filter (where (p_jawaban ->> s.id) = s.kunci),
         coalesce(array_agg(s.id order by s.id) filter (where (p_jawaban ->> s.id) is distinct from s.kunci), '{}'),
         jsonb_object_agg(s.id, p_jawaban ->> s.id)
    into v_jml, v_benar, v_salah, v_simpan
    from sigap_qc_soal s where s.id = any (v_ids);
  if v_jml = 0 then raise exception 'Soal hari ini tidak ditemukan' using errcode = 'P0001'; end if;
  if exists (select 1 from sigap_qc_soal s where s.id = any (v_ids) and not (s.opsi ? coalesce(p_jawaban ->> s.id, ''))) then
    raise exception 'Semua soal wajib dijawab' using errcode = 'P0001';
  end if;

  insert into sigap_qc_percobaan (kegiatan_id, tanggal, akun_id, ke, jawaban, salah, benar, jumlah, skor, terlambat)
  values (v_keg, v_tgl, p_akun, v_ke, v_simpan, v_salah, v_benar, v_jml, round(100.0 * v_benar / v_jml), v_late);
  return sigap_qc_tinjau(p_akun, v_tgl, v_ke, v_keg);
end $$;

create or replace function public.sigap_qc_soal_simpan(p_data jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text := btrim(p_data ->> 'id'); v_opsi jsonb; v_kata text[]; v_keg bigint := nullif(p_data ->> 'kegiatan_id', '')::bigint;
begin
  if v_id is null or v_id = '' then raise exception 'Kode soal wajib diisi' using errcode = 'P0001'; end if;
  if v_keg is null or not exists (select 1 from sigap_kegiatan where id = v_keg) then raise exception 'Kegiatan soal wajib diisi' using errcode = 'P0001'; end if;
  if exists (select 1 from sigap_qc_soal where id = v_id and kegiatan_id <> v_keg) then
    raise exception 'Kode soal % sudah dipakai kegiatan lain. Pakai kode lain.', v_id using errcode = 'P0001';
  end if;
  v_opsi := p_data -> 'opsi';
  if v_opsi is null or jsonb_typeof(v_opsi) <> 'object' or not (v_opsi ?& array['A','B']) then
    raise exception 'Pilihan A dan B wajib diisi' using errcode = 'P0001';
  end if;
  if (v_opsi ? 'C') <> (v_opsi ? 'D') then
    raise exception 'Pilihan C dan D harus diisi bersama, atau dikosongkan keduanya (soal 2 pilihan)' using errcode = 'P0001';
  end if;
  if not (v_opsi ? upper(coalesce(p_data ->> 'kunci', ''))) then
    raise exception 'Kunci jawaban tidak ada di pilihan soal' using errcode = 'P0001';
  end if;
  if p_data ? 'kata_kunci' then
    select coalesce(array_agg(btrim(x) order by btrim(x)), '{}') into v_kata
      from (select distinct x from jsonb_array_elements_text(p_data -> 'kata_kunci') x where btrim(x) <> '') t;
  end if;
  insert into sigap_qc_soal (id, kegiatan_id, paket, judul_paket, nomor, pertanyaan, opsi, kunci, penjelasan, kata_kunci, aktif)
  values (v_id, v_keg, (p_data ->> 'paket')::smallint, coalesce(p_data ->> 'judul_paket', 'Paket ' || (p_data ->> 'paket')), coalesce((p_data ->> 'nomor')::smallint, 1),
          p_data ->> 'pertanyaan', v_opsi, upper(p_data ->> 'kunci'), coalesce(p_data ->> 'penjelasan', ''), coalesce(v_kata, '{}'), coalesce((p_data ->> 'aktif')::boolean, true))
  on conflict (id) do update set paket = excluded.paket, judul_paket = excluded.judul_paket, nomor = excluded.nomor, pertanyaan = excluded.pertanyaan,
     opsi = excluded.opsi, kunci = excluded.kunci, penjelasan = excluded.penjelasan,
     kata_kunci = case when p_data ? 'kata_kunci' then excluded.kata_kunci else sigap_qc_soal.kata_kunci end,
     aktif = case when p_data ? 'aktif' then excluded.aktif else sigap_qc_soal.aktif end, diubah_at = now();
  return jsonb_build_object('id', v_id);
end $$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('sigap_qc_soal_simpan', 'sigap_qc_soal_untuk', 'sigap_qc_jawab') loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
