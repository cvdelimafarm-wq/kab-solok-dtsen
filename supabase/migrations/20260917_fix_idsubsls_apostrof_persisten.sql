-- Perbaikan PERMANEN utk artefak tanda kutip satu pada idsubsls (mis.
-- "'1303040001000202" -- 17 karakter, bukan 16), yang sebelumnya cuma
-- ditambal SEKALI lewat UPDATE manual (lihat
-- 20260917_ppl_akun_alokasi_idsls.sql) -- ternyata tambalan sekali itu
-- TIDAK cukup: begitu data diunggah ulang lewat tombol "Unggah Data" di
-- tab Penyisiran Usaha, kolom idsubsls kembali membawa tanda kutip apa
-- adanya dari file JSON sumber (artefak ekspor Excel di script Python),
-- karena fungsi upsert-nya menyalin nilai mentah tanpa dibersihkan.
--
-- Akibatnya: Sub SLS yang dialokasikan ke PPL (tabel ppl_alokasi_idsls,
-- idsubsls 16 digit BERSIH) berhenti cocok dgn penyisiran_usaha.idsubsls
-- (17 digit BERANTAKAN), sehingga tab "Identifikasi PPL" tampil KOSONG
-- utk SEMUA PPL setiap kali data diunggah ulang -- ditemukan lewat kasus
-- PPL "Rainaldi" (ppl_akun.id=248) yang daftar keluarganya hilang total
-- padahal alokasi & login-nya normal.
--
-- Perbaikan di sini dilakukan LANGSUNG di fungsi penyisiran_upsert_batch
-- (bukan cuma UPDATE sekali lagi) supaya membersihkan diri sendiri
-- (self-healing) setiap kali data diunggah, berapa kali pun.
--
-- Sudah diterapkan langsung ke database lewat MCP Supabase (termasuk
-- pembersihan ulang 32.427 baris yang sempat rusak lagi); file ini cuma
-- catatan riwayat migrasi di repo.

CREATE OR REPLACE FUNCTION public.penyisiran_upsert_batch(p_rows jsonb)
 RETURNS TABLE(baru integer, diperbarui integer)
 LANGUAGE plpgsql
AS $function$
declare
  v_item jsonb;
  v_ada boolean;
  v_baru int := 0;
  v_diperbarui int := 0;
  v_idsubsls text;
begin
  for v_item in select * from jsonb_array_elements(p_rows)
  loop
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
        sls_kode, sls_nama, subsls_kode, nama_kk, alamat, lat, lng,
        bukti_dutp, bukti_dtsen, bukti_pnm, pnm_sektor, pnm_subsektor,
        dtsen_lapangan_usaha, catatan_sensus
      ) values (
        v_item->>'id', v_idsubsls, v_item->>'kec_kode', v_item->>'kec_nama',
        v_item->>'nagari_kode', v_item->>'nagari_nama', v_item->>'sls_kode', v_item->>'sls_nama',
        v_item->>'subsls_kode', v_item->>'nama_kk', v_item->>'alamat',
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

update penyisiran_usaha set idsubsls = ltrim(idsubsls, '''') where idsubsls like '''%';
