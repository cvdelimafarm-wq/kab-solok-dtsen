-- skema-sql/20261113e_sigap_belajar_aturan.sql
--
-- (13 Nov 2026, keputusan B Iqbal 13 Nov sore) Kegiatan belajar dan mutu per waktu (mockup A4b): SATU sumber aturan.
-- Tiga waktu, masing-masing butir dicentang: pra pelatihan (pretest, Vanguard latihan pengisian kuesioner interaktif, lainnya);
-- saat pelatihan (pretest, Vanguard roleplay, posttest, kuis); saat pendataan (Vanguard roleplay, Vanguard latihan interaktif, kuis, QC/murajaah).
-- Tiap butir: wajib atau tidak, tenggat, memblokir tahap atau tidak. Pembatalan mencatat alasan, siapa, kapan.
--
-- Satu sumber, dua lainnya membaca:
--   * sigap_belajar_aturan = sumber. Pemicu menyalin keadaannya ke CERMIN LAMA yang masih dibaca layar lama:
--       sigap_pelatihan_aturan.vanguard_mode / vanguard_tenggat  <- pra_pelatihan.vanguard_latihan (wajib -> 'wajib', aktif tidak wajib -> 'opsional', mati/batal -> 'tidak_ada')
--       sigap_kegiatan_fitur 'vanguard'                          <- ada butir vanguard_latihan aktif dan tidak batal (waktu mana pun)
--       sigap_kegiatan_fitur 'vanguard_roleplay'                 <- ada butir vanguard_roleplay aktif dan tidak batal
--   * Layar lama yang MENGUBAH cermin (Kelola Pelatihan > Vanguard, centang fitur) diteruskan ke sumber oleh pemicu balik, jadi keduanya tidak pernah berbeda.
--     Penjaga `sigap.belajar_sinkron` mencegah pantulan.
--   * keu_ident.form.vanguard tetap NIAT perencanaan; dibaca hanya bila kegiatan belum punya aturan di tabel ini (lib/vanguardAkses.ts).
--   * Pretest, posttest, kuis, QC dicatat sebagai aturan di sini; pelaksanaannya tetap di modul masing-masing (belum disalin ke sigap_tes).
-- Kegiatan tanpa baris di tabel ini tidak disentuh pemicu (perilaku lama tetap).
-- Uji: supabase/tests/86_uji_belajar_aturan.sql (selalu rollback). Data Seruti TW IV: 20261113f (uji kering dulu).

begin;

create table if not exists sigap_belajar_aturan (
  id bigserial primary key,
  kegiatan_id bigint not null references sigap_kegiatan(id),
  waktu text not null check (waktu in ('pra_pelatihan', 'saat_pelatihan', 'saat_pendataan')),
  butir text not null check (butir in ('pretest', 'vanguard_latihan', 'lainnya', 'vanguard_roleplay', 'posttest', 'kuis', 'qc_murajaah')),
  aktif boolean not null default false,
  wajib boolean not null default false,
  tenggat date,
  blokir boolean not null default false,
  catatan text not null default '' check (char_length(catatan) <= 300),
  batal_alasan text check (batal_alasan is null or char_length(batal_alasan) between 5 and 300),
  batal_oleh text,
  batal_at timestamptz,
  diubah_oleh text not null default '',
  diubah_at timestamptz not null default now(),
  unique (kegiatan_id, waktu, butir),
  constraint sigap_belajar_batal_ck check ((batal_at is null) = (batal_alasan is null)),
  constraint sigap_belajar_butir_waktu_ck check (
    (waktu = 'pra_pelatihan' and butir in ('pretest', 'vanguard_latihan', 'lainnya')) or
    (waktu = 'saat_pelatihan' and butir in ('pretest', 'vanguard_roleplay', 'posttest', 'kuis')) or
    (waktu = 'saat_pendataan' and butir in ('vanguard_roleplay', 'vanguard_latihan', 'kuis', 'qc_murajaah')))
);
alter table sigap_belajar_aturan enable row level security;
revoke all on sigap_belajar_aturan from anon, authenticated;

-- Riwayat perubahan (siapa, kapan, dari apa ke apa)
create table if not exists sigap_belajar_aturan_jejak (
  id bigserial primary key,
  aturan_id bigint not null,
  kegiatan_id bigint not null,
  waktu text not null,
  butir text not null,
  sebelum jsonb,
  sesudah jsonb,
  oleh text not null default '',
  at timestamptz not null default now()
);
alter table sigap_belajar_aturan_jejak enable row level security;
revoke all on sigap_belajar_aturan_jejak from anon, authenticated;

-- Salin sumber ke cermin lama untuk satu kegiatan
create or replace function sigap_belajar_ke_cermin(p_kegiatan bigint) returns void
language plpgsql security definer set search_path to 'public' as $f$
declare v_lat record; v_vg boolean; v_rp boolean; v_mode text; v_lama text := coalesce(current_setting('sigap.belajar_sinkron', true), '');
begin
  if not exists (select 1 from sigap_belajar_aturan where kegiatan_id = p_kegiatan) then return; end if;
  perform set_config('sigap.belajar_sinkron', '1', true);
  select exists (select 1 from sigap_belajar_aturan where kegiatan_id = p_kegiatan and butir = 'vanguard_latihan' and aktif and batal_at is null) into v_vg;
  select exists (select 1 from sigap_belajar_aturan where kegiatan_id = p_kegiatan and butir = 'vanguard_roleplay' and aktif and batal_at is null) into v_rp;
  -- (20261113e2) baris "mati" tidak ditambahkan bila belum ada (bawaan fitur sudah mati)
  insert into sigap_kegiatan_fitur(kegiatan_id, fitur, aktif, diubah_oleh, diubah_at) select p_kegiatan, 'vanguard', v_vg, 'aturan belajar', now() where v_vg or exists (select 1 from sigap_kegiatan_fitur where kegiatan_id = p_kegiatan and fitur = 'vanguard')
    on conflict (kegiatan_id, fitur) do update set aktif = excluded.aktif, diubah_oleh = excluded.diubah_oleh, diubah_at = excluded.diubah_at where sigap_kegiatan_fitur.aktif is distinct from excluded.aktif;
  insert into sigap_kegiatan_fitur(kegiatan_id, fitur, aktif, diubah_oleh, diubah_at) select p_kegiatan, 'vanguard_roleplay', v_rp, 'aturan belajar', now() where v_rp or exists (select 1 from sigap_kegiatan_fitur where kegiatan_id = p_kegiatan and fitur = 'vanguard_roleplay')
    on conflict (kegiatan_id, fitur) do update set aktif = excluded.aktif, diubah_oleh = excluded.diubah_oleh, diubah_at = excluded.diubah_at where sigap_kegiatan_fitur.aktif is distinct from excluded.aktif;
  select * into v_lat from sigap_belajar_aturan where kegiatan_id = p_kegiatan and waktu = 'pra_pelatihan' and butir = 'vanguard_latihan';
  if found and exists (select 1 from sigap_kegiatan where id = p_kegiatan and jenis = 'pelatihan') then
    v_mode := case when not v_lat.aktif or v_lat.batal_at is not null then 'tidak_ada' when v_lat.wajib then 'wajib' else 'opsional' end;
    insert into sigap_pelatihan_aturan(kegiatan_id, vanguard_mode, vanguard_tenggat, diubah_oleh, diubah_at) values (p_kegiatan, v_mode, v_lat.tenggat, 'aturan belajar', now())
      on conflict (kegiatan_id) do update set vanguard_mode = excluded.vanguard_mode, vanguard_tenggat = excluded.vanguard_tenggat, diubah_oleh = excluded.diubah_oleh, diubah_at = excluded.diubah_at
      where sigap_pelatihan_aturan.vanguard_mode is distinct from excluded.vanguard_mode or sigap_pelatihan_aturan.vanguard_tenggat is distinct from excluded.vanguard_tenggat;
  end if;
  perform set_config('sigap.belajar_sinkron', v_lama, true);
end $f$;
revoke execute on function sigap_belajar_ke_cermin(bigint) from public, anon, authenticated;

create or replace function sigap_belajar_aturan_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
begin
  insert into sigap_belajar_aturan_jejak(aturan_id, kegiatan_id, waktu, butir, sebelum, sesudah, oleh)
    values (new.id, new.kegiatan_id, new.waktu, new.butir, case when tg_op = 'UPDATE' then to_jsonb(old) - 'id' - 'diubah_at' end, to_jsonb(new) - 'id' - 'diubah_at', new.diubah_oleh);
  if coalesce(current_setting('sigap.belajar_sinkron', true), '') <> '1' then perform sigap_belajar_ke_cermin(new.kegiatan_id); end if;
  return null;
end $f$;
drop trigger if exists sigap_belajar_aturan_t on sigap_belajar_aturan;
create trigger sigap_belajar_aturan_t after insert or update on sigap_belajar_aturan for each row execute function sigap_belajar_aturan_trg();

-- Pemicu balik: layar lama mengubah cermin -> sumber ikut (hanya untuk kegiatan yang sudah punya aturan di sumber)
create or replace function sigap_belajar_dari_cermin_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $f$
declare v_jenis text; v_waktu text; v_lama text := coalesce(current_setting('sigap.belajar_sinkron', true), '');
begin
  if v_lama = '1' then return null; end if;
  if not exists (select 1 from sigap_belajar_aturan where kegiatan_id = new.kegiatan_id) then return null; end if;
  select jenis into v_jenis from sigap_kegiatan where id = new.kegiatan_id;
  perform set_config('sigap.belajar_sinkron', '1', true);
  if tg_table_name = 'sigap_pelatihan_aturan' then
    insert into sigap_belajar_aturan(kegiatan_id, waktu, butir, aktif, wajib, tenggat, diubah_oleh)
      values (new.kegiatan_id, 'pra_pelatihan', 'vanguard_latihan', new.vanguard_mode <> 'tidak_ada', new.vanguard_mode = 'wajib', new.vanguard_tenggat, coalesce(new.diubah_oleh, ''))
      on conflict (kegiatan_id, waktu, butir) do update set aktif = excluded.aktif, wajib = excluded.wajib, tenggat = excluded.tenggat, diubah_oleh = excluded.diubah_oleh, diubah_at = now(),
        batal_alasan = case when excluded.aktif then null else sigap_belajar_aturan.batal_alasan end, batal_oleh = case when excluded.aktif then null else sigap_belajar_aturan.batal_oleh end,
        batal_at = case when excluded.aktif then null else sigap_belajar_aturan.batal_at end;
  elsif new.fitur in ('vanguard', 'vanguard_roleplay') then
    v_waktu := case when v_jenis = 'pelatihan' then case when new.fitur = 'vanguard' then 'pra_pelatihan' else 'saat_pelatihan' end else 'saat_pendataan' end;
    insert into sigap_belajar_aturan(kegiatan_id, waktu, butir, aktif, diubah_oleh)
      values (new.kegiatan_id, v_waktu, case when new.fitur = 'vanguard' then 'vanguard_latihan' else 'vanguard_roleplay' end, new.aktif, coalesce(new.diubah_oleh, ''))
      on conflict (kegiatan_id, waktu, butir) do update set aktif = excluded.aktif, diubah_oleh = excluded.diubah_oleh, diubah_at = now(),
        batal_alasan = case when excluded.aktif then null else sigap_belajar_aturan.batal_alasan end, batal_oleh = case when excluded.aktif then null else sigap_belajar_aturan.batal_oleh end,
        batal_at = case when excluded.aktif then null else sigap_belajar_aturan.batal_at end;
  end if;
  perform set_config('sigap.belajar_sinkron', v_lama, true);
  return null;
end $f$;
drop trigger if exists sigap_belajar_dari_aturan_t on sigap_pelatihan_aturan;
create trigger sigap_belajar_dari_aturan_t after insert or update of vanguard_mode, vanguard_tenggat on sigap_pelatihan_aturan for each row execute function sigap_belajar_dari_cermin_trg();
drop trigger if exists sigap_belajar_dari_fitur_t on sigap_kegiatan_fitur;
create trigger sigap_belajar_dari_fitur_t after insert or update of aktif on sigap_kegiatan_fitur for each row when (new.fitur in ('vanguard', 'vanguard_roleplay')) execute function sigap_belajar_dari_cermin_trg();

-- Baca: per kegiatan, dan per identifikasi (lewat tautan aktif) untuk halaman perencanaan (gerbang keu hanya membaca keu_*)
create or replace view sigap_v_belajar_aturan as
 select a.*, g.nama as kegiatan_nama, g.jenis as kegiatan_jenis from sigap_belajar_aturan a join sigap_kegiatan g on g.id = a.kegiatan_id;
revoke all on sigap_v_belajar_aturan from anon, authenticated;

create or replace view keu_v_ident_belajar as
 select t.ident_id, t.fungsi, a.kegiatan_id, g.nama as kegiatan_nama, a.waktu, a.butir, a.aktif, a.wajib, a.tenggat, a.blokir, a.catatan,
        a.batal_alasan, a.batal_oleh, a.batal_at, a.diubah_oleh, a.diubah_at
   from keu_ident_kegiatan t join sigap_belajar_aturan a on a.kegiatan_id = t.kegiatan_id join sigap_kegiatan g on g.id = a.kegiatan_id
  where t.dilepas_at is null;
revoke all on keu_v_ident_belajar from anon, authenticated;

commit;
