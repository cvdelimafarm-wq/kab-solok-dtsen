-- Perbarui RPC upsert batch (dipanggil dari app/api/penyisiran/upload) supaya
-- ikut menyimpan kolom baru nama_anggota_keluarga -- lihat migrasi
-- 20260918_penyisiran_usaha_nama_anggota_keluarga.sql. Field ini OPSIONAL di
-- JSON (v_item->>'nama_anggota_keluarga' bisa null/tidak ada sama sekali
-- kalau diunggah dari versi script Python yg lebih lama) -- tidak masalah
-- krn frontend fallback ke nama_kk kalau kosong.
create or replace function public.penyisiran_upsert_batch(p_rows jsonb)
returns table(baru integer, diperbarui integer)
language plpgsql
as $function$
declare
  v_item jsonb;
  v_ada boolean;
  v_baru int := 0;
  v_diperbarui int := 0;
  v_idsubsls text;
begin
  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    -- idsubsls sering datang dgn awalan tanda kutip satu (artefak ekspor
    -- Excel di script Python sumbernya, mis. "'1303040001000202") --
    -- dibersihkan di sini SETIAP kali upsert supaya tidak perlu ditambal
    -- manual lewat SQL lagi tiap kali data diunggah ulang.
    v_idsubsls := ltrim(v_item->>'idsubsls', '''');

    select exists(
      select 1 from penyisiran_usaha where kode_identitas = (v_item->>'id')
    ) into v_ada;

    if v_ada then
      update penyisiran_usaha set
        idsubsls = v_idsubsls,
        kec_kode = v_item->>'kec_kode',
        kec_nama = v_item->>'kec_nama',
        nagari_kode = v_item->>'nagari_kode',
        nagari_nama = v_item->>'nagari_nama',
        sls_kode = v_item->>'sls_kode',
        sls_nama = v_item->>'sls_nama',
        subsls_kode = v_item->>'subsls_kode',
        nama_kk = v_item->>'nama_kk',
        nama_anggota_keluarga = v_item->>'nama_anggota_keluarga',
        alamat = v_item->>'alamat',
        lat = nullif(v_item->>'lat', '')::double precision,
        lng = nullif(v_item->>'lng', '')::double precision,
        bukti_dutp = coalesce((v_item->>'bukti_dutp')::boolean, false),
        bukti_dtsen = coalesce((v_item->>'bukti_dtsen')::boolean, false),
        bukti_pnm = coalesce((v_item->>'bukti_pnm')::boolean, false),
        pnm_sektor = v_item->>'pnm_sektor',
        pnm_subsektor = v_item->>'pnm_subsektor',
        dtsen_lapangan_usaha = v_item->>'dtsen_lapangan_usaha',
        catatan_sensus = v_item->>'catatan_sensus',
        updated_at = now()
      where kode_identitas = (v_item->>'id');
      v_diperbarui := v_diperbarui + 1;
    else
      insert into penyisiran_usaha (
        kode_identitas, idsubsls, kec_kode, kec_nama, nagari_kode, nagari_nama,
        sls_kode, sls_nama, subsls_kode, nama_kk, nama_anggota_keluarga, alamat, lat, lng,
        bukti_dutp, bukti_dtsen, bukti_pnm, pnm_sektor, pnm_subsektor,
        dtsen_lapangan_usaha, catatan_sensus
      ) values (
        v_item->>'id', v_idsubsls, v_item->>'kec_kode', v_item->>'kec_nama',
        v_item->>'nagari_kode', v_item->>'nagari_nama', v_item->>'sls_kode', v_item->>'sls_nama',
        v_item->>'subsls_kode', v_item->>'nama_kk', v_item->>'nama_anggota_keluarga', v_item->>'alamat',
        nullif(v_item->>'lat', '')::double precision, nullif(v_item->>'lng', '')::double precision,
        coalesce((v_item->>'bukti_dutp')::boolean, false),
        coalesce((v_item->>'bukti_dtsen')::boolean, false),
        coalesce((v_item->>'bukti_pnm')::boolean, false),
        v_item->>'pnm_sektor', v_item->>'pnm_subsektor',
        v_item->>'dtsen_lapangan_usaha', v_item->>'catatan_sensus'
      );
      v_baru := v_baru + 1;
    end if;
  end loop;

  return query select v_baru, v_diperbarui;
end;
$function$;
