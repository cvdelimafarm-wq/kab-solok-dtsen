-- 20261102zg_keu_delego_sinkron_verifikasi.sql
-- Delego, tahap 5 (2 Nov 2026). Dijalankan SETELAH zb, zc, zd, zf. Idempoten (create or replace).
-- Memperluas keu_dlg_sinkron (zc) dengan sumber baru: dokumen administrasi berstatus "terunggah" menunggu verifikasi -> butir "Memverifikasi dokumen ..."
-- untuk tiap akun yang berhak memverifikasi (aturan keu_adm_boleh_verif). Sumber lama (revisi, dokumen draf, pengadaan) tidak berubah.
-- Catatan: tabel mitra_* (pembayaran honor mitra) BELUM ada di produksi, jadi belum ada sumbernya; tambahkan saat modul itu terpasang.
create or replace function keu_dlg_sinkron(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hari date := keu_dlg_hari_ini(); v_hk smallint[] := keu_dlg_hk(null); v_t date; v_n int := 0; v_dibuat int := 0; v_ditutup int := 0; k record; v_aktif int := 0;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false) or keu_dlg_putus_ok(p_akun)) then
    raise exception 'Hanya pemberi delegasi tingkat tim atau Kepala yang menyinkronkan' using errcode = '42501';
  end if;
  v_t := v_hari;
  while keu_dlg_hitung_hk(v_hari, v_t, v_hk) < 2 and v_n < 14 loop v_t := v_t + 1; v_n := v_n + 1; end loop;

  create temp table if not exists tmp_dlg_sinkron (sj text, sid text, sv text, ro text, penerima bigint, judul text, uraian text, poin numeric) on commit drop;
  delete from tmp_dlg_sinkron;

  -- revisi anggaran: penyusun
  insert into tmp_dlg_sinkron
  select 'revisi', r.id::text, 'susun', r.ro_kode, coalesce(r.diajukan_oleh, r.dibuat_oleh), 'Menyusun revisi anggaran RO ' || r.ro_kode,
         'Revisi berstatus ' || r.status || '. Butir ini otomatis dari modul Revisi dan tertutup sendiri saat revisi diajukan.', 10
    from keu_revisi_usulan r where r.status in ('draf','dikembalikan') and r.ro_kode is not null;
  -- revisi anggaran: persetujuan Ketua Tim
  insert into tmp_dlg_sinkron
  select 'revisi', r.id::text, 'ketua_' || w, r.ro_kode, w, 'Menyetujui revisi anggaran RO ' || r.ro_kode,
         'Revisi menunggu persetujuan Ketua Tim. Butir otomatis dari modul Revisi.', 4
    from keu_revisi_usulan r cross join lateral keu_dlg_ketua_ro(r.ro_kode) w where r.status = 'menunggu_ketua' and r.ro_kode is not null;
  -- dokumen administrasi yang sedang disiapkan
  insert into tmp_dlg_sinkron
  select 'adm', d.id::text, 'lengkapi', d.ro_kode, d.diubah_oleh, 'Melengkapi dokumen administrasi ' || coalesce(nullif(d.kunci_stabil, ''), d.id::text),
         'Dokumen berstatus draf. Butir otomatis dari modul Administrasi dan tertutup sendiri saat berkas diunggah.', 3
    from keu_adm_dok d where d.status = 'draf' and d.ro_kode is not null and d.diubah_oleh is not null;
  -- dokumen administrasi yang sudah diunggah dan menunggu verifikasi: satu butir untuk tiap akun yang BERHAK memverifikasinya menurut aturan modul Administrasi
  -- (keu_adm_boleh_verif: PPK untuk semua; pemegang pemberian verifikasi; Bendahara hanya untuk dokumen berpihak Bendahara). Pengunggah tidak diberi butir verifikasinya sendiri.
  insert into tmp_dlg_sinkron
  select 'adm', d.id::text, 'verif_' || c.akun_id, d.ro_kode, c.akun_id,
         'Memverifikasi dokumen ' || left(coalesce(nullif(m.uraian, ''), d.kunci_stabil), 120),
         'Dokumen sudah diunggah dan menunggu verifikasi. Butir otomatis dari modul Administrasi dan tertutup sendiri saat dokumen terverifikasi atau dikembalikan.', 3
    from keu_adm_dok d
    join keu_master_dok m on m.id = d.dok_id
    cross join lateral (
      select t.akun_id from keu_penugasan t where t.dibatalkan_at is null and t.masa @> current_date and t.peran_kode in ('PPK', 'BEND')
      union
      select g.akun_id from keu_pemberian g where g.kewenangan_kode = 'verifikasi' and g.dibatalkan_at is null and g.masa @> current_date
    ) c
   where d.status = 'terunggah' and d.ro_kode is not null and c.akun_id is distinct from d.diunggah_oleh
     and keu_adm_boleh_verif(c.akun_id, d.ro_kode, m.pihak);
  -- pengadaan hasil identifikasi yang diajukan
  insert into tmp_dlg_sinkron
  select 'pengadaan', p.id::text, 'ketua_' || w, i.ro_kode, w, 'Menindaklanjuti pengadaan: ' || left(p.item, 120),
         'Pengadaan berstatus diajukan. Butir otomatis dari Identifikasi dan tertutup sendiri saat statusnya berubah.', 5
    from keu_ident_pengadaan p join keu_ident i on i.id = p.ident_id cross join lateral keu_dlg_ketua_ro(i.ro_kode) w
   where p.status = 'diajukan' and i.ro_kode is not null;

  -- hanya akun organik yang aktif
  delete from tmp_dlg_sinkron t where not exists (select 1 from sigap_akun a where a.id = t.penerima and a.aktif and a.jenis = 'organik');
  select count(*) into v_aktif from tmp_dlg_sinkron;

  perform set_config('keu.via_fungsi', '1', true);
  for k in select t.* from tmp_dlg_sinkron t
            where not exists (select 1 from keu_dlg_delegasi d where d.sumber_jenis = t.sj and d.sumber_id = t.sid and d.sumber_varian = t.sv)
  loop
    insert into keu_dlg_delegasi(tahun, ident_id, ro_kode, judul, uraian, penerima_akun, peran_penerima, pj_bidang, satuan, target_total, target_harian, bobot, hari_kerja, mulai, tenggat,
                                 status, dibuat_oleh, perlu_hasil, perlu_tinjau, kelas, kegiatan_id, mode_tutup, sumber_jenis, sumber_id, sumber_varian)
    values (extract(year from v_hari)::smallint, null, k.ro, k.judul, k.uraian, k.penerima, 'pegawai', '', 'paket', k.poin, round(k.poin / greatest(keu_dlg_hitung_hk(v_hari, v_t, v_hk), 1), 2), 1, v_hk, v_hari, v_t,
            'baru', p_akun, false, false, 'proses', null, 'sumber', k.sj, k.sid, k.sv);
    v_dibuat := v_dibuat + 1;
  end loop;
  -- tutup otomatis butir yang sumbernya sudah tidak aktif
  update keu_dlg_delegasi d set status = 'selesai', alasan = left(coalesce(nullif(d.alasan, ''), '') || ' Selesai otomatis: sumber di modul asal sudah berubah.', 500), diubah_at = now()
   where d.sumber_jenis in ('revisi','adm','pengadaan') and d.status in ('baru','berjalan')
     and not exists (select 1 from tmp_dlg_sinkron t where t.sj = d.sumber_jenis and t.sid = d.sumber_id and t.sv = d.sumber_varian);
  get diagnostics v_ditutup = row_count;
  perform set_config('keu.via_fungsi', '', true);
  return jsonb_build_object('dibuat', v_dibuat, 'ditutup', v_ditutup, 'sumber_aktif', v_aktif);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;

