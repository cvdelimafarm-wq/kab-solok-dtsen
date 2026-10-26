-- 20261026e: pemberi delegasi (Ketua, Admin) dapat melapor mewakili dari halaman Lapor harian.
-- Perubahan tunggal: kunci 'diwakili' pada keu_dlg_saya kini juga memuat delegasi pada RO yang boleh saya beri (keu_dlg_beri).
-- keu_dlg_lapor sudah mengizinkan pemberi; hanya daftar tampilannya yang kurang. Tidak ada tabel atau kewenangan baru. Aman dijalankan ulang.
-- Laporan tetap ditandai 'mewakili' dan tidak ada yang dihapus.

create or replace function keu_dlg_saya(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_hari date := keu_dlg_hari_ini(); r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  with s as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
     where d.penerima_akun = p_akun and (d.status in ('baru','berjalan','ditunda') or d.diubah_at > now() - interval '120 days')
  ), w as (
    select d.*, b.nama as dari_nama, a.nama as penerima_nama, a.jenis as penerima_jenis,
           (select coalesce(sum(l.poin), 0) from keu_dlg_laporan l where l.delegasi_id = d.id) as poin_total,
           (select count(*) from keu_dlg_laporan l where l.delegasi_id = d.id) as lapor_hari
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.penerima_akun left join sigap_akun b on b.id = d.dibuat_oleh
     where d.status in ('baru','berjalan') and d.penerima_akun <> p_akun
       and ((a.jenis = 'mitra' and keu_dlg_pml(p_akun, d.ro_kode)) or keu_dlg_beri(p_akun, d.ro_kode))
  )
  select jsonb_build_object(
    'hari_ini', v_hari,
    'akun', (select jsonb_build_object('id', x.id, 'nama', x.nama, 'jenis', x.jenis) from sigap_akun x where x.id = p_akun),
    'delegasi', (select coalesce(jsonb_agg(to_jsonb(s) order by s.tenggat, s.id), '[]'::jsonb) from s),
    'laporan', (select coalesce(jsonb_agg(to_jsonb(l) order by l.tanggal desc, l.id desc), '[]'::jsonb) from keu_dlg_laporan l
                 where l.tanggal >= v_hari - 35 and l.delegasi_id in (select id from s)),
    'diwakili', (select coalesce(jsonb_agg(to_jsonb(w) order by w.penerima_nama, w.id), '[]'::jsonb) from w),
    'laporan_diwakili', (select coalesce(jsonb_agg(to_jsonb(l) order by l.tanggal desc, l.id desc), '[]'::jsonb) from keu_dlg_laporan l
                 where l.tanggal >= v_hari - 35 and l.delegasi_id in (select id from w)),
    'tanggapan', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'delegasi_id', t.delegasi_id, 'laporan_id', t.laporan_id, 'isi', t.isi, 'dibuat_at', t.dibuat_at,
                    'dari_nama', u.nama) order by t.id desc), '[]'::jsonb)
                  from (select * from keu_dlg_tanggapan where delegasi_id in (select id from s) order by id desc limit 30) t left join sigap_akun u on u.id = t.dari_akun),
    'pembinaan', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id desc), '[]'::jsonb)
                  from (select id, ro_kode, delegasi_id, langkah, alasan, tinjau, status, catatan_tutup, dibuat_at from keu_dlg_pembinaan
                         where penerima_akun = p_akun order by id desc limit 20) b),
    'penghargaan', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc), '[]'::jsonb)
                  from (select id, ro_kode, delegasi_id, alasan, dibuat_at from keu_dlg_penghargaan where penerima_akun = p_akun order by id desc limit 20) h),
    'penilaian', (select coalesce(jsonb_agg(to_jsonb(n) order by n.periode desc), '[]'::jsonb)
                  from (select ro_kode, periode, kualitas, kepatuhan, catatan from keu_dlg_penilaian where penerima_akun = p_akun and periode >= v_hari - 400 order by periode desc limit 24) n)
  ) into r;
  return r;
end $$;
