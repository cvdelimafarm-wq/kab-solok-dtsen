-- 64_bersihkan_data_uji_fiktif.sql (2 Nov 2026)
-- Membatalkan (status 'batal', BUKAN menghapus) delegasi uji "UJI Fiktif ..." dan "UJI usulan ..." yang masih berjalan di produksi, supaya tidak mengotori
-- Beranda tim, matriks Beban, dan Monitoring. Semuanya belum punya laporan sehingga tidak ada riwayat kinerja yang terpengaruh.
-- Jalankan di SQL Editor (bukan lewat aplikasi). Hasil: jumlah baris yang dibatalkan.
with u as (
  update keu_dlg_delegasi d
     set status = 'batal', alasan = left(coalesce(nullif(d.alasan, ''), '') || ' Dibatalkan: data uji.', 500), diubah_at = now()
   where d.status in ('baru', 'berjalan', 'usulan')
     and (d.judul like 'UJI Fiktif%' or d.judul like 'UJI usulan%')
     and not exists (select 1 from keu_dlg_laporan l where l.delegasi_id = d.id)
  returning d.id
)
select count(*) as dibatalkan from u;
