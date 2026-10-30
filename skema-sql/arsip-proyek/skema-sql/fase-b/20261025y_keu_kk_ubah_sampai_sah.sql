-- 20261025y_keu_kk_ubah_sampai_sah.sql
--
-- (25 Okt 2026, tahap 26) Kertas kerja Revisi POK dan Revisi Administrasi tetap dapat diubah SAMPAI DISAHKAN (status 'diterapkan'), bukan hanya saat
-- 'dibuka'/'terkumpul'. Alasan: pengesahan yang riil dilakukan di SPAN dengan acuan kertas kerja; bila pagu pada POK resmi (PDF yang dilampirkan saat
-- Sahkan) berbeda dari kertas kerja, kertas kerja harus disesuaikan karena POK resmi yang dipakai. Revisi DIPA tidak berubah (tetap beku sejak diterapkan).
-- Hak tetap sama: pada status selain 'dibuka', hanya yang berwenang 'sahkan' (PPK) yang lolos (cabang 'tutup' untuk selain PPK).
-- Sudah diterapkan ke produksi (apply_migration) dan diverifikasi dengan pg_get_functiondef. Aman dijalankan ulang.

create or replace function public.keu_kk_izin(p_akun bigint, p_ro text, p_jadwal bigint)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_st text; v_jn text; v_us text;
begin
  select status, jenis into v_st, v_jn from keu_revisi_jadwal where id = p_jadwal;
  if v_st is null or not (v_st in ('dibuka','terkumpul') or (v_st = 'diterapkan' and v_jn in ('pok','administrasi'))) then return 'jadwal'; end if;
  if p_akun is null then return 'ok'; end if;
  if keu_boleh(p_akun, 'sahkan') then return 'ok'; end if;
  if not (keu_boleh(p_akun, 'rab', p_ro) or keu_boleh(p_akun, 'draf', p_ro)) then return 'hak'; end if;
  if v_st <> 'dibuka' then return 'tutup'; end if;
  select status into v_us from keu_revisi_usulan where jadwal_id = p_jadwal and ro_kode = p_ro;
  if v_us in ('menunggu_ketua','menunggu_ppk','disetujui') then return 'usulan'; end if;
  return 'ok';
end $function$;

create or replace function public.keu_kk_keputusan_cek()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_akun bigint := keu_akun_sesi(); v_st text; v_jn text; v_kurang numeric;
begin
  select status, jenis into v_st, v_jn from keu_revisi_jadwal where id = new.jadwal_id;
  if v_st is null or not (v_st in ('dibuka','terkumpul') or (v_st = 'diterapkan' and v_jn in ('pok','administrasi'))) then
    raise exception 'Keputusan hanya dapat dicatat saat jadwal dibuka, terkumpul, atau (revisi POK/administrasi) diterapkan dan belum sah.' using errcode = '23514';
  end if;
  new.diputuskan_oleh := coalesce(v_akun, new.diputuskan_oleh);
  new.diputuskan_at := now(); new.diubah_at := now();
  if new.keputusan in ('semua','sebagian') then
    select coalesce(sum(kurang), 0) into v_kurang from keu_v_kk_kecukupan where jadwal_id = new.jadwal_id and kro = new.kro;
    if v_kurang <= 0 then
      raise exception 'KRO % tidak memiliki kekurangan terhadap RAB; tidak ada yang perlu diterima.', new.kro using errcode = '23514';
    end if;
    if new.keputusan = 'sebagian' and new.jumlah > v_kurang then
      raise exception 'Jumlah diterima (%) melebihi kekurangan KRO % (%).', new.jumlah, new.kro, v_kurang using errcode = '23514';
    end if;
  end if;
  return new;
end $function$;

create or replace function public.keu_kk_tolak(p_alasan text, p_ro text)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if p_alasan = 'jadwal' then
    raise exception 'Kertas kerja hanya dapat diubah saat jadwal dibuka atau terkumpul (revisi POK/administrasi: sampai disahkan).' using errcode = '23514';
  elsif p_alasan = 'tutup' then
    raise exception 'Jendela usulan sudah ditutup; hanya PPK yang dapat mengubah kertas kerja.' using errcode = '42501';
  elsif p_alasan = 'hak' then
    raise exception 'Akun tidak berwenang mengubah kertas kerja RO %.', p_ro using errcode = '42501';
  elsif p_alasan = 'usulan' then
    raise exception 'Usulan RO % sedang diproses atau sudah disetujui; kertas kerja terkunci.', p_ro using errcode = '23514';
  end if;
end $function$;
