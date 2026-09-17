-- RPC utk dropdown filter "Sub SLS" (mis. "JORONG USAK-01") pada tab
-- Penyisiran Usaha -- tahap filter ke-3 setelah Kecamatan & Nagari,
-- dipakai oleh app/api/penyisiran/subsls/route.ts.
--
-- WAJIB menerima kec+nagari SEKALIGUS (bukan nagari saja) -- nagari_kode
-- ternyata TIDAK unik lintas kecamatan (polanya berulang, sama seperti
-- sls_kode/subsls_kode yang sudah diketahui sebelumnya). Sempat dibuat
-- versi awal yang cuma difilter nagari_kode & ketahuan salah gabung Sub
-- SLS dari kecamatan lain yang kebetulan nagari_kode-nya sama persis --
-- makanya di sini konsisten dengan pola /api/penyisiran/list &
-- /api/penyisiran/markers yang selalu menggabungkan kec_kode+nagari_kode.
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase; file ini
-- cuma catatan riwayat migrasi di repo.

create or replace function penyisiran_subsls_list(p_kec text, p_nagari text)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('idsubsls', idsubsls, 'label', label, 'jumlah', jumlah) order by label),
    '[]'::jsonb
  )
  from (
    select idsubsls, (max(sls_nama) || '-' || max(subsls_kode)) as label, count(*) as jumlah
    from penyisiran_usaha
    where kec_kode = p_kec and nagari_kode = p_nagari and idsubsls is not null and idsubsls <> ''
    group by idsubsls
  ) s;
$$;
