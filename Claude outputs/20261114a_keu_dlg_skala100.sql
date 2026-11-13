-- skema-sql/20261114a_keu_dlg_skala100.sql
--
-- (14 Nov 2026, fase D) Delego pindah ke kapasitas 100 poin per hari dan membaca poin per satuan dari Master > Poin beban kerja.
--
-- Prinsip:
--  * Tidak berlaku mundur. Delegasi yang MULAI sebelum tanggal skala 100 tetap memakai skala 75 (salinan poin katalog lama).
--    Tanggal mulai skala 100 = keu_dlg_skala100_mulai() (usul 16 Nov 2026, Senin; PENGATURAN yang dapat diubah, satu tempat di SQL
--    dan satu tempat di lib/delego/skala.ts — keduanya harus sama).
--  * Tidak mengubah fungsi pembuat delegasi (keu_dlg_buat, keu_dlg_rutin_jalan, perintah, catat, pindah). Pemicu BEFORE INSERT
--    pada keu_dlg_delegasi mengganti poin_per_satuan salinan katalog (skala 75) dengan poin berlaku dari matriks (jenis × survei),
--    dan menyesuaikan target_total serta target_harian dengan faktor yang sama, sehingga JUMLAH satuan tetap sama.
--  * Pemicu hanya mengganti bila poin_per_satuan sama dengan poin katalog jenis itu (artinya salinan otomatis). Bila layar sudah
--    mengirim poin Master, hanya asalnya dicatat. Poin yang diisi sendiri oleh pemberi (berbeda dari keduanya) dibiarkan ("diisi").
--  * Survei ditentukan sama seperti keu_v_poin_laporan: pola survei dicocokkan dengan nama kegiatan / identifikasi + judul;
--    bila tidak cocok = "Umum". Bila sel survei kosong dipakai sel Umum; bila keduanya kosong dipakai katalog × 100/75.
--  * Kolom baru (menambah, tidak menimpa): poin_katalog (salinan poin katalog sebelum diganti), poin_sumber (asal poin).
--
-- Jalankan sesudah 20261113c dan 20261113d. Uji: supabase/tests/87_uji_skala100.sql (rollback).

begin;

create or replace function keu_dlg_skala100_mulai() returns date
language sql immutable as $f$ select date '2026-11-16' $f$;

alter table keu_dlg_delegasi add column if not exists poin_katalog numeric(8,2);
alter table keu_dlg_delegasi add column if not exists poin_sumber text not null default '';

-- Teks penentu survei sebuah delegasi (nama kegiatan / identifikasi + judul), sama dengan keu_v_poin_laporan
create or replace function keu_dlg_teks_survei(p_kegiatan bigint, p_ident bigint, p_judul text) returns text
language sql stable set search_path to 'public' as $f$
  select coalesce((select g.nama from sigap_kegiatan g where g.id = p_kegiatan), (select i.nama from keu_ident i where i.id = p_ident), '')
         || ' ' || coalesce(p_judul, '')
$f$;

-- Poin per satuan berlaku (skala 100) untuk satu jenis pada teks survei: { poin, sumber, survei_kode }
create or replace function keu_poin_untuk(p_jenis bigint, p_teks text) returns jsonb
language plpgsql stable set search_path to 'public' as $f$
declare v_sv bigint := keu_poin_survei_dari(p_teks); v_umum bigint; r record; j keu_dlg_jenis;
begin
  select id into v_umum from keu_poin_survei where kode = 'umum';
  select s.poin_berlaku, s.sumber_berlaku, v.kode into r
    from keu_poin_sel s join keu_poin_survei v on v.id = s.survei_id
   where s.jenis_id = p_jenis and s.survei_id = v_sv and s.poin_berlaku is not null;
  if found then return jsonb_build_object('poin', r.poin_berlaku, 'sumber', 'matriks:' || r.kode || ':' || r.sumber_berlaku, 'survei_kode', r.kode); end if;
  if v_umum is not null and v_umum <> v_sv then
    select s.poin_berlaku, s.sumber_berlaku into r from keu_poin_sel s where s.jenis_id = p_jenis and s.survei_id = v_umum and s.poin_berlaku is not null;
    if found then return jsonb_build_object('poin', r.poin_berlaku, 'sumber', 'matriks:umum:' || r.sumber_berlaku, 'survei_kode', 'umum'); end if;
  end if;
  select * into j from keu_dlg_jenis where id = p_jenis;
  if not found then return null; end if;
  return jsonb_build_object('poin', round(j.poin_per_satuan * 100 / 75, 2), 'sumber', 'katalog×100/75', 'survei_kode', null);
end $f$;

-- Daftar poin berlaku semua jenis aktif untuk satu teks (pratinjau di layar Buat delegasi; hanya membaca)
create or replace function keu_poin_untuk_daftar(p_teks text default '', p_akun bigint default keu_akun_sesi()) returns jsonb
language sql stable set search_path to 'public' as $f$
  select coalesce(jsonb_agg(jsonb_build_object('jenis_id', j.id, 'poin_katalog', j.poin_per_satuan) || coalesce(keu_poin_untuk(j.id, p_teks), '{}'::jsonb) order by j.urut, j.id), '[]'::jsonb)
    from keu_dlg_jenis j where j.aktif
$f$;

-- Pemicu: delegasi baru yang mulai pada/sesudah tanggal skala 100 membaca poin dari matriks
create or replace function keu_dlg_skala100_t() returns trigger
language plpgsql set search_path to 'public' as $f$
declare v_kat numeric; v jsonb; v_baru numeric; v_f numeric;
begin
  if new.jenis_id is null or new.poin_per_satuan is null or coalesce(new.mulai, current_date) < keu_dlg_skala100_mulai() then return new; end if;
  select poin_per_satuan into v_kat from keu_dlg_jenis where id = new.jenis_id;
  v := keu_poin_untuk(new.jenis_id, keu_dlg_teks_survei(new.kegiatan_id, new.ident_id, new.judul));
  v_baru := (v ->> 'poin')::numeric;
  if v_baru is null or v_baru <= 0 then return new; end if;
  if new.poin_per_satuan = v_baru then
    -- layar sudah mengirim poin Master (Catat pekerjaan, Perintah): cukup catat asalnya
    new.poin_katalog := v_kat;
    if new.poin_sumber = '' then new.poin_sumber := v ->> 'sumber'; end if;
  elsif v_kat is not null and new.poin_per_satuan = v_kat then
    -- salinan katalog skala 75 dari fungsi pembuat: ganti dengan poin Master, target ikut berskala (jumlah satuan tetap)
    v_f := v_baru / new.poin_per_satuan;
    new.poin_katalog := new.poin_per_satuan;
    new.poin_per_satuan := v_baru;
    new.poin_sumber := v ->> 'sumber';
    new.target_harian := least(1000, round(new.target_harian * v_f, 2));
    if new.target_total is not null then new.target_total := round(new.target_total * v_f, 2); end if;
  elsif new.poin_sumber = '' then
    -- poin diisi sendiri oleh pemberi, atau disalin dari delegasi asal: biarkan
    new.poin_sumber := 'diisi';
  end if;
  return new;
end $f$;

drop trigger if exists keu_dlg_skala100 on keu_dlg_delegasi;
create trigger keu_dlg_skala100 before insert on keu_dlg_delegasi for each row execute function keu_dlg_skala100_t();

revoke execute on function keu_dlg_skala100_t() from public, anon, authenticated;
revoke execute on function keu_poin_untuk(bigint, text) from public, anon, authenticated;
revoke execute on function keu_poin_untuk_daftar(text, bigint) from public, anon, authenticated;
revoke execute on function keu_dlg_teks_survei(bigint, bigint, text) from public, anon, authenticated;

-- Izin gerbang keu_jalankan: tambah keu_poin_untuk_daftar (sisa definisi tidak berubah)
do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_poin_untuk_daftar''' in d) = 0 then
    d := replace(d, '''keu_poin_usul_simpan''];', '''keu_poin_usul_simpan'',''keu_poin_untuk_daftar''];');
    if position('''keu_poin_untuk_daftar''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
