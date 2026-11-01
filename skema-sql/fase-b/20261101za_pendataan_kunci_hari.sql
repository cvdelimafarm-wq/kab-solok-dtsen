-- 20261101za_pendataan_kunci_hari.sql  (1 Nov 2026)
-- Permintaan user: penandaan hasil KK dikunci per hari. Setelah harinya (WIB) lewat, penanda tidak bisa diganti, dikembalikan ke "belum",
-- atau diambil alih rekan, KECUALI lewat mekanisme revisit.
--
-- ATURAN (semua diputuskan di database; klien hanya mencerminkan):
--  1. KK belum punya hasil  -> selalu boleh (penandaan pertama, termasuk dari laporan perbaikan / antrean offline).
--  2. KK sudah punya hasil dan tanggal WIB penandaannya (status_at) < tanggal WIB hari ini -> TERKUNCI. Perubahan ditolak ('hari_terkunci').
--     Pengecualian a. Kiriman yang IDENTIK (hasil sama, petugas sama, status revisit sama) dianggap bukan perubahan: dicatat di log, tidak
--                      menggeser status_at / atribusi (tanggal capaian tetap).
--     Pengecualian b. REVISIT: p_revisit = true, hasil 'terdampak', KK berhasil lain 'terdampak' (tidak terdampak / tidak ditemukan), dan
--                      Sub SLS-nya sedang ditandai revisit aktif oleh admin (bencana_pendataan_revisit).
--     Pengecualian c. Masa tenggang offline 6 jam: kiriman yang waktu kejadiannya di tanggal WIB yang sama dengan penandaan lama dan
--                      tiba paling lambat 6 jam setelah kejadian tetap diterima (HP tanpa sinyal yang baru sempat mengirim lewat tengah malam).
--  3. Kiriman dengan waktu kejadian lebih lama dari penandaan terkini tidak mengubah apa pun (perilaku lama): hanya masuk log.
--  4. Tidak ada jalur lewat PML/admin. Perubahan data lama hanya lewat revisit, atau SQL oleh admin database.
--
-- Fungsi diganti dengan CREATE OR REPLACE (tanda tangan sama, hak akses tetap). Aman dijalankan ulang. Tidak mengubah data.
-- Urutan: jalankan blok 1 (pratinjau, hanya membaca) -> blok 2 (ganti fungsi) -> blok 3 (verifikasi).

-- ===== BLOK 1: PRATINJAU (hanya membaca) =====
-- Berapa KK yang akan terkunci begitu fungsi aktif, per tanggal penandaan.
select (status_at at time zone 'Asia/Jakarta')::date as hari_penandaan, count(*) as kk_terkunci
from public.bencana_pendataan_kk
where aktif and hasil is not null and (status_at at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date
group by 1 order by 1;

-- ===== BLOK 2: GANTI FUNGSI =====
create or replace function public.bencana_pendataan_catat(
  p_akun bigint, p_kk bigint, p_hasil text, p_alasan text, p_waktu timestamptz, p_kunci uuid,
  p_pos_lat double precision default null, p_pos_lng double precision default null, p_pos_akurasi real default null,
  p_revisit boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kk public.bencana_pendataan_kk%rowtype;
  v_waktu timestamptz;
  v_terkini boolean;
  v_baris bigint;
  v_revisit boolean;
  v_hari_kk date;
  v_hari_ini date;
begin
  if p_hasil not in ('terdampak', 'tidak_terdampak', 'tidak_ditemukan', 'belum') then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'hasil_tidak_dikenal');
  end if;
  select * into v_kk from public.bencana_pendataan_kk where id = p_kk and aktif for update;
  if not found then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'kk_tidak_ada');
  end if;
  if not exists (select 1 from public.bencana_pendataan_subsls_akun(p_akun) x where x = v_kk.idsubsls) then
    return jsonb_build_object('status', 'ditolak', 'alasan', 'bukan_wilayah_tim');
  end if;
  v_waktu := least(coalesce(p_waktu, now()), now());
  v_terkini := v_kk.status_at is null or v_waktu >= v_kk.status_at;
  -- revisit hanya bermakna untuk hasil 'terdampak'
  v_revisit := coalesce(p_revisit, false) and p_hasil = 'terdampak';

  -- (1 Nov 2026) KUNCI PER HARI. Hanya berlaku bila kiriman ini akan menjadi penanda terkini DAN KK sudah punya hasil.
  if v_terkini and v_kk.hasil is not null and v_kk.status_at is not null then
    v_hari_kk  := (v_kk.status_at at time zone 'Asia/Jakarta')::date;
    v_hari_ini := (now() at time zone 'Asia/Jakarta')::date;
    if v_hari_kk < v_hari_ini
       and not ((v_waktu at time zone 'Asia/Jakarta')::date = v_hari_kk and now() - v_waktu <= interval '6 hours') then
      if p_hasil = v_kk.hasil and v_kk.ppl_akun_id = p_akun and v_revisit = coalesce(v_kk.revisit, false) then
        v_terkini := false;  -- identik: bukan perubahan, tanggal capaian tidak bergeser
      elsif v_revisit and v_kk.hasil <> 'terdampak'
            and exists (select 1 from public.bencana_pendataan_revisit r where r.idsubsls = v_kk.idsubsls and r.aktif) then
        null;                -- revisit sah
      else
        return jsonb_build_object('status', 'ditolak', 'alasan', 'hari_terkunci');
      end if;
    end if;
  end if;

  insert into public.bencana_pendataan_log (kk_id, akun_id, hasil, alasan, waktu_kejadian, kunci, menjadi_terkini, pos_lat, pos_lng, pos_akurasi_m, revisit)
  values (p_kk, p_akun, p_hasil, nullif(btrim(p_alasan), ''), v_waktu, p_kunci, v_terkini, p_pos_lat, p_pos_lng, p_pos_akurasi, v_revisit)
  on conflict (kunci) do nothing
  returning id into v_baris;
  if v_baris is null then
    return jsonb_build_object('status', 'duplikat');
  end if;

  if v_terkini then
    update public.bencana_pendataan_kk set
      hasil = case when p_hasil = 'belum' then null else p_hasil end,
      alasan = case when p_hasil = 'belum' then null else nullif(btrim(p_alasan), '') end,
      ppl_akun_id = case when p_hasil = 'belum' then null else p_akun end,
      revisit = v_revisit,
      status_at = v_waktu,
      diperbarui_at = now()
    where id = p_kk;
  end if;
  return jsonb_build_object('status', 'tercatat', 'terkini', v_terkini, 'log_id', v_baris);
end $function$;

-- ===== BLOK 3: VERIFIKASI (hanya membaca) =====
-- a. Fungsi baru memuat kunci (harus true)
select position('hari_terkunci' in pg_get_functiondef(p.oid)) > 0 as kunci_aktif
from pg_proc p where proname = 'bencana_pendataan_catat';
-- b. Hak akses tetap (service_role harus bisa menjalankan)
select grantee, privilege_type from information_schema.routine_privileges where routine_name = 'bencana_pendataan_catat' order by 1;
