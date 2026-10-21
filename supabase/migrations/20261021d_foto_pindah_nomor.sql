-- 20261021d_foto_pindah_nomor.sql
--
-- (21 Okt 2026) Memindahkan foto ke nomor lain pada hari yang sama (panel "Foto Kamera SIGAP" di kartu hari / izin susulan).
-- Latar: petugas salah memilih nomor (kasus penugasan 49: foto dikirim tanpa nomor atau tergeser foto lain). Sebelumnya nomor yang sudah
-- diterima tidak bisa diubah (mengganti = foto lama "dilepas"). Fungsi ini MEMINDAHKAN baris sigap_dokumentasi (tidak ada baris atau foto yang dihapus):
--   * nomor tujuan kosong  -> baris dipindah ke nomor itu;
--   * nomor tujuan terisi  -> isi kedua baris saling tukar (foto, berkas, sumber).
-- Tag foto (sigap_foto_tag.slot) ikut diperbarui. Kunci advisory sama dengan sigap_foto_tempatkan supaya aman dari tindihan.
-- Kelayakan tanggal/kunci/izin susulan diperiksa di route (cekAksesIsian), bukan di sini. Hanya service_role.

create or replace function public.sigap_foto_pindah_nomor(p_akun bigint, p_penugasan bigint, p_tanggal date, p_dari smallint, p_ke smallint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a public.sigap_dokumentasi%rowtype;
  b public.sigap_dokumentasi%rowtype;
  ada_b boolean;
begin
  if p_dari is null or p_ke is null or p_dari < 1 or p_dari > 5 or p_ke < 1 or p_ke > 5 then
    return jsonb_build_object('ok', false, 'error', 'slot_tidak_valid');
  end if;
  if p_dari = p_ke then
    return jsonb_build_object('ok', true, 'status', 'sama');
  end if;
  if not exists (select 1 from public.sigap_penugasan where id = p_penugasan and akun_id = p_akun and aktif) then
    return jsonb_build_object('ok', false, 'error', 'penugasan_tidak_valid');
  end if;

  -- kunci berurutan (kecil dulu) agar dua pemindahan bersamaan tidak saling menunggu
  perform pg_advisory_xact_lock(hashtextextended('sigapfoto:' || p_penugasan || ':' || p_tanggal || ':' || least(p_dari, p_ke), 0));
  perform pg_advisory_xact_lock(hashtextextended('sigapfoto:' || p_penugasan || ':' || p_tanggal || ':' || greatest(p_dari, p_ke), 0));

  select * into a from public.sigap_dokumentasi where penugasan_id = p_penugasan and tanggal = p_tanggal and slot = p_dari for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'asal_kosong');
  end if;
  select * into b from public.sigap_dokumentasi where penugasan_id = p_penugasan and tanggal = p_tanggal and slot = p_ke for update;
  ada_b := found;

  if ada_b then
    -- tukar ISI kedua baris (foto, berkas, sumber, penanda susulan), bukan nomornya: indeks unik (penugasan, tanggal, nomor) tidak bisa
    -- ditukar langsung tanpa nomor sementara, dan nomor hanya boleh 1-5.
    update public.sigap_dokumentasi set foto_id = b.foto_id, sumber = b.sumber, file_path = b.file_path, file_nama_asli = b.file_nama_asli,
           ukuran_byte = b.ukuran_byte, susulan = b.susulan, diunggah_at = b.diunggah_at where id = a.id;
    update public.sigap_dokumentasi set foto_id = a.foto_id, sumber = a.sumber, file_path = a.file_path, file_nama_asli = a.file_nama_asli,
           ukuran_byte = a.ukuran_byte, susulan = a.susulan, diunggah_at = a.diunggah_at where id = b.id;
    update public.sigap_foto_tag
       set dokumentasi_id = case when dokumentasi_id = a.id then b.id else a.id end,
           slot = case when dokumentasi_id = a.id then p_ke else p_dari end,
           diubah_at = now(), diubah_oleh = p_akun
     where dokumentasi_id in (a.id, b.id);
  else
    update public.sigap_dokumentasi set slot = p_ke where id = a.id;
    update public.sigap_foto_tag set slot = p_ke, diubah_at = now(), diubah_oleh = p_akun where dokumentasi_id = a.id;
  end if;

  insert into public.sigap_audit (akun_id, aksi, detail)
  values (p_akun, 'foto.nomor_dipindah', jsonb_build_object('penugasan_id', p_penugasan, 'tanggal', p_tanggal, 'dari', p_dari, 'ke', p_ke, 'tukar', ada_b,
                                                            'foto_a', a.foto_id, 'foto_b', case when ada_b then b.foto_id else null end));
  return jsonb_build_object('ok', true, 'status', case when ada_b then 'tukar' else 'pindah' end);
end $function$;

revoke all on function public.sigap_foto_pindah_nomor(bigint, bigint, date, smallint, smallint) from public, anon, authenticated;
grant execute on function public.sigap_foto_pindah_nomor(bigint, bigint, date, smallint, smallint) to service_role;
