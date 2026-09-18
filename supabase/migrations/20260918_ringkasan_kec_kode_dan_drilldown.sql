-- Perbaikan + fitur baru utk RPC penyisiran_ringkasan_identifikasi (panel
-- "Ringkasan Hasil Identifikasi" di tab Manajemen Target):
--
-- 1) BUG FIX: level='nagari' SEBELUMNYA dikelompokkan cuma pakai
--    nagari_kode polos (mis. "001") -- kode ini TIDAK unik lintas
--    kecamatan (banyak kecamatan sama2 punya nagari_kode "001", "002",
--    dst, krn penomoran nagari dimulai ulang per kecamatan). Akibatnya
--    view "Per Nagari" salah menggabungkan nagari yg BEDA kecamatan tp
--    kebetulan nomor lokalnya sama. Diperbaiki jadi kode gabungan
--    "kec_kode-nagari_kode" spy unik.
-- 2) Kolom baru kec_kode & kec_nama ikut dikembalikan (dulu cuma "kode"+
--    "nama") -- dipakai FE utk (a) fitur drill-down per kecamatan (klik
--    kecamatan utk unhide rincian nagari-nya, filter via parameter
--    p_kec_kode baru), dan (b) menampilkan nama kecamatan sbg keterangan
--    tambahan di view flat "Per Nagari" (krn nama nagari sendiri jg bisa
--    kebetulan sama antar-kecamatan, mis. "BATU BAJANJANG" ada di
--    kecamatan Tigo Lurah MAUPUN Lembang Jaya).
-- 3) Parameter baru p_kec_kode (opsional, default null) -- kalau diisi &
--    p_level='nagari', hasil difilter hanya nagari di dalam kecamatan
--    tsb. Dipakai endpoint GET .../target/ringkasan?level=nagari&kec=...
--    saat kecamatan di-unhide di panel Ringkasan.

drop function if exists public.penyisiran_ringkasan_identifikasi(text);

create function public.penyisiran_ringkasan_identifikasi(p_level text, p_kec_kode text default null)
returns table(
  kode text,
  kec_kode text,
  kec_nama text,
  nama text,
  ada_ppl bigint,
  ada_jorong bigint,
  ada_keduanya bigint,
  belum bigint,
  tidak_ada bigint,
  ragu bigint,
  total bigint
)
language sql
stable
as $function$
  select
    case p_level
      when 'nagari' then kec_kode || '-' || nagari_kode
      when 'subsls' then idsubsls
      else kec_kode
    end as kode,
    max(kec_kode) as kec_kode,
    max(kec_nama) as kec_nama,
    case p_level
      when 'nagari' then max(nagari_nama)
      when 'subsls' then max(sls_nama) || '-' || max(subsls_kode)
      else max(kec_nama)
    end as nama,
    count(*) filter (
      where identifikasi_ppl = 'ada' and ada_konfirmasi_ppl and not ada_konfirmasi_jorong
    ) as ada_ppl,
    count(*) filter (
      where identifikasi_ppl = 'ada' and ada_konfirmasi_jorong and not ada_konfirmasi_ppl
    ) as ada_jorong,
    count(*) filter (
      where identifikasi_ppl = 'ada' and ada_konfirmasi_ppl and ada_konfirmasi_jorong
    ) as ada_keduanya,
    count(*) filter (where identifikasi_ppl = 'belum') as belum,
    count(*) filter (where identifikasi_ppl = 'tidak_ada') as tidak_ada,
    count(*) filter (where identifikasi_ppl = 'ragu') as ragu,
    count(*) as total
  from penyisiran_usaha
  where (case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end) is not null
    and (case p_level when 'nagari' then nagari_kode when 'subsls' then idsubsls else kec_kode end) <> ''
    and (p_kec_kode is null or kec_kode = p_kec_kode)
  group by 1
  order by nama;
$function$;
