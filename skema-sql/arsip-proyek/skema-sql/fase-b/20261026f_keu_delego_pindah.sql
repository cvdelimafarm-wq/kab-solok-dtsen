-- =====================================================================
-- 20261026f_keu_delego_pindah.sql
-- SIGAP - Delego: "Terapkan usulan" pemerataan beban. Satu fungsi tulis baru: keu_dlg_pindah.
-- Bergantung pada 20261026c (tabel dan fungsi keu_dlg_*). Aman diulang. Tanpa DELETE/DROP TABLE.
--
-- Memindahkan sisa pekerjaan sebuah delegasi (baru/berjalan) ke penampung lain secara atomik:
--  * delegasi LAMA ditutup: status 'selesai' dan tenggat dipotong ke KEMARIN (riwayat laporan dan skor penerima lama tetap terhitung).
--    Bila delegasi lama baru mulai hari ini atau sesudahnya (belum ada pekerjaan sebelum hari ini): status 'batal' dengan alasan.
--  * delegasi BARU untuk penampung: salinan (judul, uraian, peran, target harian, bobot, hari kerja, identifikasi) mulai HARI INI (atau tanggal mulai lama
--    bila lebih akhir) sampai tenggat lama, status 'baru'. Bila ada target total, targetnya sisa (target total - poin yang sudah dilaporkan).
--  * penerima lama dan penampung diberi tahu lewat lonceng. Riwayat perubahan tercatat otomatis (keu_jejak).
-- Penolakan: bukan pemberi pada RO itu; delegasi bukan baru/berjalan; versi delegasi berubah sejak usulan dihitung (p_ver); penampung tidak sah
-- (sama dengan penerima lama, pemberi sendiri, tidak aktif, mitra pada peran bukan PML/PPL); penerima lama sudah melapor untuk hari ini atau sesudahnya;
-- target total sudah tercapai. Tidak ada yang dihapus.
-- =====================================================================

create or replace function keu_dlg_pindah(p_id bigint, p_ke bigint, p_ver integer default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d keu_dlg_delegasi; a sigap_akun; v_hari date := keu_dlg_hari_ini(); v_mulai date; v_poin numeric; v_sisa numeric; v_baru bigint;
  v_dari text; v_ke text; v_pemberi text; v_status_lama text; v_alasan text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into d from keu_dlg_delegasi where id = p_id for update;
  if not found then raise exception 'Delegasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_dlg_beri(p_akun, d.ro_kode) then raise exception 'Akun % tidak berwenang memindahkan delegasi RO %', p_akun, d.ro_kode using errcode = '42501'; end if;
  if d.status not in ('baru','berjalan') then raise exception 'Hanya delegasi berstatus baru atau berjalan yang dapat dipindahkan (sekarang: %)', d.status using errcode = '23514'; end if;
  if p_ver is not null and p_ver <> d.ver then raise exception 'Delegasi sudah berubah sejak usulan dihitung. Muat ulang halaman, lalu coba lagi.' using errcode = '23514'; end if;
  if p_ke is null then raise exception 'Penampung wajib dipilih' using errcode = '23514'; end if;
  if p_ke = d.penerima_akun then raise exception 'Penampung sama dengan penerima sekarang' using errcode = '23514'; end if;
  if p_ke = p_akun then raise exception 'Pemberi tidak dapat mendelegasikan kepada dirinya sendiri' using errcode = '23514'; end if;
  select * into a from sigap_akun where id = p_ke and aktif;
  if not found then raise exception 'Penampung % tidak ditemukan atau tidak aktif', p_ke using errcode = '23514'; end if;
  if a.jenis = 'mitra' and d.peran_penerima not in ('pml','ppl') then raise exception 'Mitra hanya dapat berperan PML atau PPL (%)', a.nama using errcode = '23514'; end if;
  if d.tenggat < v_hari then raise exception 'Masa delegasi sudah lewat' using errcode = '23514'; end if;
  if exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id and l.tanggal >= v_hari) then
    raise exception 'Penerima lama sudah melapor untuk hari ini. Pindahkan besok, atau ubah delegasinya lewat menu Ubah.' using errcode = '23514';
  end if;
  select coalesce(sum(l.poin), 0) into v_poin from keu_dlg_laporan l where l.delegasi_id = d.id;
  if d.target_total is not null and d.target_total > 0 then
    v_sisa := d.target_total - v_poin;
    if v_sisa <= 0 then raise exception 'Target total delegasi sudah tercapai. Tandai selesai saja, tidak perlu dipindahkan.' using errcode = '23514'; end if;
  else
    v_sisa := null;
  end if;

  v_mulai := greatest(v_hari, d.mulai);
  select nama into v_dari from sigap_akun where id = d.penerima_akun;
  v_ke := a.nama;
  select nama into v_pemberi from sigap_akun where id = p_akun;
  v_alasan := 'Dipindahkan ke ' || left(coalesce(v_ke, '-'), 80) || ' (pemerataan beban kerja)';

  perform set_config('keu.via_fungsi', '1', true);
  if d.mulai >= v_hari then
    v_status_lama := 'batal'; -- belum ada pekerjaan sebelum hari ini: tidak ada riwayat yang perlu dipertahankan
    update keu_dlg_delegasi set status = 'batal', alasan = v_alasan, ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  else
    v_status_lama := 'selesai';
    update keu_dlg_delegasi set status = 'selesai', tenggat = v_hari - 1, alasan = v_alasan, ver = d.ver + 1, diubah_oleh = p_akun, diubah_at = now() where id = d.id;
  end if;

  insert into keu_dlg_delegasi(tahun, ident_id, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot,
                               hari_kerja, mulai, tenggat, status, dibuat_oleh, diubah_oleh)
  values (extract(year from v_mulai)::smallint, d.ident_id, d.ro_kode, d.judul, d.uraian, p_ke, d.peran_penerima, d.pj_bidang, d.satuan, v_sisa, d.target_harian, d.bobot,
          d.hari_kerja, v_mulai, d.tenggat, 'baru', p_akun, p_akun)
  returning id into v_baru;

  perform keu_dlg_notif(p_ke, 'delegasi_baru', d.ident_id, 'Delegasi baru: ' || d.judul,
    'Dari ' || coalesce(v_pemberi, 'pemberi delegasi') || ' (pemerataan beban dari ' || coalesce(v_dari, 'rekan') || '), tenggat ' || to_char(d.tenggat, 'DD-MM-YYYY') || '. Buka Delego untuk menerima.', p_akun);
  perform keu_dlg_notif(d.penerima_akun, 'delegasi_ubah', d.ident_id, 'Delegasi dipindahkan: ' || d.judul,
    'Pekerjaan ini dipindahkan ke ' || coalesce(v_ke, 'rekan') || ' mulai hari ini untuk pemerataan beban. Laporan yang sudah Anda kirim tetap tercatat.', p_akun);
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('lama', d.id, 'baru', v_baru, 'status_lama', v_status_lama, 'mulai_baru', v_mulai, 'target_total_baru', v_sisa);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

-- hanya dipanggil lewat gerbang (keu_jalankan), seperti fungsi keu_dlg_ lainnya
revoke execute on function keu_dlg_pindah(bigint, bigint, integer, bigint) from public, anon, authenticated;

-- daftarkan di daftar izin keu_jalankan
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_dlg_pindah''' in d) = 0 then
    d := replace(d, '''keu_dlg_buat'',', '''keu_dlg_pindah'',''keu_dlg_buat'',');
    if position('''keu_dlg_pindah''' in d) = 0 then raise exception 'Penambahan izin gagal: daftar keu_dlg_buat tidak ditemukan (jalankan 20261026c dulu)'; end if;
    execute d;
  end if;
end $$;
