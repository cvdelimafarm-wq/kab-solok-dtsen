-- 20261011b_pendataan_kk_kolom_sumber.sql
--
-- (11 Okt 2026) Unggah daftar KK dari ekspor FASIH-SM (CSV "1303 - Pendataan"): ID penugasan FASIH menjadi kunci unggah ulang, nomor urut DTSEN
-- dan status keberadaan awal disimpan sebagai keterangan. NIK, Nomor KK, tanggal lahir, dan pendapatan TIDAK disimpan (dibuang di peramban sebelum dikirim).
alter table public.bencana_pendataan_kk
  add column if not exists sumber_id        text,
  add column if not exists no_urut          integer,
  add column if not exists keberadaan_awal  smallint;

alter table public.bencana_pendataan_kk drop constraint if exists kk_sumber_panjang;
alter table public.bencana_pendataan_kk add constraint kk_sumber_panjang check (sumber_id is null or length(sumber_id) between 1 and 64);

-- unggah ulang ekspor yang sama memperbarui baris yang sama, bukan menggandakan (hanya baris aktif; unggahan yang dibatalkan boleh diunggah ulang)
create unique index if not exists bencana_pendataan_kk_sumber_uq on public.bencana_pendataan_kk (kegiatan_id, sumber_id) where aktif and sumber_id is not null;

comment on column public.bencana_pendataan_kk.sumber_id is 'ID penugasan di sumber (ASSIGNMENT_ID FASIH-SM); kunci unggah ulang. Kosong untuk unggahan dari templat Excel.';
comment on column public.bencana_pendataan_kk.no_urut is 'Nomor urut keluarga di Sub SLS menurut Kode_Identitas sumber (mis. "... - DTSEN - 15" = 15); membantu petugas mengenali KK.';
comment on column public.bencana_pendataan_kk.keberadaan_awal is 'Kode Keberadaan_Keluarga pada pendataan sumber (1 ditemukan, 2 baru, 5 tidak dapat ditemui sampai akhir, 6 keluarga khusus).';
