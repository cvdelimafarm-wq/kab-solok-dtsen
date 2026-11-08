-- 20261108a_arsip_nomor_pengecualian.sql
-- (8 Nov 2026) Nomor di luar rangkaian (pengecualian) pada buku nomor surat.
-- Kasus: undangan Pelatihan Seruti TW IV bernomor 457 (tanggal 6 Nov 2026) terbit di luar rangkaian buku (surat_keluar 2026 berada di kisaran 1232-1637).
-- Nomor bertanda pengecualian tetap tercatat dan terlihat di Buku nomor, tetapi tidak ikut hitungan "nomor terlewat".
-- Aman diulang. Satu transaksi. JALANKAN SEBELUM DEPLOY KODE (kode membaca kolom baru).

begin;

alter table public.arsip_nomor add column if not exists pengecualian boolean not null default false;
alter table public.arsip_nomor add column if not exists alasan_pengecualian text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'arsip_nomor_pengecualian_alasan_ck') then
    alter table public.arsip_nomor add constraint arsip_nomor_pengecualian_alasan_ck
      check (not pengecualian or length(btrim(coalesce(alasan_pengecualian, ''))) >= 5);
  end if;
end $$;

-- Fungsi lama (9 parameter) diganti; hak akses sama seperti sebelumnya (hanya postgres dan service_role).
drop function if exists public.arsip_catat_luar(text, integer, date, text, text, bigint, bigint, text, text);

create or replace function public.arsip_catat_luar(
  p_jenis text, p_urut integer, p_tanggal date,
  p_perihal text default null, p_kka text default null, p_kegiatan bigint default null,
  p_oleh bigint default null, p_nama text default null, p_nomor text default null,
  p_pengecualian boolean default false, p_alasan_pengecualian text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  j       public.arsip_jenis%rowtype;
  v_kka   text;
  v_unit  text;
  v_tahun integer;
  v_nomor text;
  v_row   public.arsip_nomor%rowtype;
  v_peng  boolean := coalesce(p_pengecualian, false);
  v_alasan text := nullif(btrim(coalesce(p_alasan_pengecualian, '')), '');
begin
  select * into j from public.arsip_jenis where kode = p_jenis;
  if not found then raise exception 'Jenis dokumen "%" tidak dikenal.', p_jenis; end if;
  if p_urut is null or p_urut < 1 then raise exception 'Nomor urut harus bilangan bulat positif.'; end if;
  if p_tanggal is null then raise exception 'Tanggal surat wajib diisi.'; end if;
  if v_peng and (v_alasan is null or length(v_alasan) < 5) then raise exception 'Nomor pengecualian wajib beralasan (minimal 5 huruf).'; end if;
  v_tahun := extract(year from p_tanggal)::integer;

  select * into v_row from public.arsip_nomor where register = j.register and tahun = v_tahun and urut = p_urut and status = 'terpakai' and sumber <> 'impor';
  if found then
    raise exception 'Nomor urut % tahun % pada register ini sudah tercatat (%).', p_urut, v_tahun, v_row.nomor;
  end if;

  v_kka := nullif(btrim(coalesce(p_kka, '')), '');
  if v_kka is null then v_kka := j.kka_bawaan; end if;
  if position('{kka}' in j.format) > 0 and v_kka is null then
    raise exception 'Kode klasifikasi arsip wajib dipilih untuk jenis "%".', j.nama;
  end if;
  if position('{kka}' in j.format) = 0 then v_kka := null; end if;
  select nilai into v_unit from public.arsip_pengaturan where kunci = 'kode_unit';

  v_nomor := coalesce(nullif(btrim(coalesce(p_nomor, '')), ''), public.arsip_susun_nomor(j.format, j.keamanan, p_urut, v_unit, v_kka, v_tahun));

  -- Pengecualian tidak menaikkan penghitung: nomor berikutnya dari sistem tetap melanjutkan rangkaian buku.
  if not v_peng then
    insert into public.arsip_counter (register, tahun, terakhir) values (j.register, v_tahun, p_urut)
    on conflict (register, tahun) do update set terakhir = greatest(public.arsip_counter.terakhir, excluded.terakhir), diubah_at = now();
  end if;

  insert into public.arsip_nomor (jenis, register, tahun, urut, nomor, kka, tanggal, perihal, kegiatan_id, sumber, dibuat_oleh, dibuat_nama, pengecualian, alasan_pengecualian)
  values (j.kode, j.register, v_tahun, p_urut, v_nomor, v_kka, p_tanggal, nullif(btrim(coalesce(p_perihal, '')), ''), p_kegiatan, 'luar', p_oleh, p_nama, v_peng, case when v_peng then v_alasan else null end)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'nomor', v_row.nomor, 'urut', v_row.urut, 'tahun', v_row.tahun);
end $function$;

revoke all on function public.arsip_catat_luar(text, integer, date, text, text, bigint, bigint, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.arsip_catat_luar(text, integer, date, text, text, bigint, bigint, text, text, boolean, text) to service_role;

commit;

-- Verifikasi setelah dijalankan:
--   select column_name from information_schema.columns where table_name='arsip_nomor' and column_name in ('pengecualian','alasan_pengecualian');   -- 2 baris
--   select proacl::text from pg_proc where proname='arsip_catat_luar';                                                                              -- {postgres=X/postgres,service_role=X/postgres}
--   select count(*) from pg_proc where proname='arsip_catat_luar';                                                                                  -- 1 (tidak ada tumpang tindih)
