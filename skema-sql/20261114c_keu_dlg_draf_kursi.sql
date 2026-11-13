-- skema-sql/20261114c_keu_dlg_draf_kursi.sql
--
-- (14 Nov 2026, Fase 2b) Draf delegasi per kursi (mockup A6). HANYA MEMBACA: menyusun usulan butir kerja untuk pegawai ORGANIK (termasuk PPPK)
-- yang duduk di kursi Final identifikasi dan punya penugasan pada kegiatan tertaut yang belum selesai. Mitra tidak masuk Delego (keputusan Iqbal 13 Nov);
-- butir mitra nanti di Hari Ini (Fase 2c). Pembuatan delegasi tetap lewat keu_dlg_buat yang sudah ada (hak, pemicu skala 100, jejak), dipanggil layar.
--
-- Resep (dapat diubah; satu tempat):
--   pendataan · PML organik  -> "Memeriksa dokumen" (periksa_dokumen), jumlah = target sampel alokasi wilayah PML itu pada kegiatan.
--   pelatihan · instruktur   -> "Mengajar pelatihan" (mengajar_pelatihan), jumlah = JP instruktur pada kelas identifikasi lanjutan.
--   peran lain (supervisor, PPL/entri organik, panitia) -> belum ada resep; ditampilkan dengan keterangan, tidak dibuat.
-- Keputusan Iqbal 13 Nov: butir berjenis MENGGANTIKAN blok hari lapangan kegiatan yang sama (lib/delego/rekap.ts), bukan menambah.
-- Status lanjutan dibaca dari versi hilir (sama dengan tahap 5/6); bila belum Final, daftar kosong dengan alasan.

begin;

create or replace function keu_dlg_draf_kursi(p_ident bigint, p_akun bigint default keu_akun_sesi()) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
declare
  l keu_ident_lanjutan; v_status text; v_isi jsonb; v_hari date := (now() at time zone 'Asia/Jakarta')::date; i keu_ident; v_hasil jsonb := '[]'::jsonb; r record;
  v_jenis bigint; v_jnama text; v_sat text; v_jml numeric; v_resep text; v_ada bigint; v_pps jsonb; v_judul text;
begin
  select * into i from keu_ident where id = p_ident;
  if not found then raise exception 'Identifikasi % tidak ada', p_ident using errcode = '23514'; end if;
  select * into l from keu_ident_lanjutan where ident_id = p_ident order by ver desc limit 1;
  if not found then return jsonb_build_object('siap', false, 'alasan', 'Identifikasi lanjutan belum disimpan.', 'butir', '[]'::jsonb); end if;
  v_status := case when l.ver_hilir is not null and l.isi_hilir is not null then coalesce(l.status_hilir, l.status) else l.status end;
  v_isi := case when l.ver_hilir is not null and l.isi_hilir is not null then l.isi_hilir else l.isi end;
  if v_status is distinct from 'final' then
    return jsonb_build_object('siap', false, 'alasan', 'Identifikasi lanjutan versi yang dipakai modul lain belum Final; kursi masih Sementara.', 'butir', '[]'::jsonb);
  end if;

  for r in
    select t.fungsi, g.id as kegiatan_id, g.nama as kegiatan_nama, g.tanggal_mulai, g.tanggal_selesai, p.akun_id, a.nama, p.peran
      from keu_ident_kegiatan t
      join sigap_kegiatan g on g.id = t.kegiatan_id
      join sigap_penugasan p on p.kegiatan_id = g.id and p.aktif
      join sigap_akun a on a.id = p.akun_id
     where t.ident_id = p_ident and t.dilepas_at is null and a.jenis = 'organik'
       and coalesce(g.tanggal_selesai, g.tanggal_mulai, v_hari) >= v_hari
     order by t.fungsi, p.peran, a.nama
  loop
    v_jenis := null; v_jml := null; v_resep := ''; v_jnama := null; v_sat := null; v_ada := null;
    if r.fungsi = 'pendataan' and r.peran = 'pml' then
      select id, nama, satuan into v_jenis, v_jnama, v_sat from keu_dlg_jenis where kode = 'periksa_dokumen' and aktif;
      select coalesce(sum(w.target_sampel), 0) into v_jml from sigap_alokasi_wilayah w where w.kegiatan_id = r.kegiatan_id and w.pml_akun_id = r.akun_id and w.nonaktif_at is null;
      v_resep := 'Sampel alokasi wilayah PML ini';
      if v_jml = 0 then v_resep := 'Belum ada alokasi wilayah untuk PML ini'; end if;
    elsif r.fungsi = 'pelatihan' and r.peran = 'instruktur' then
      select id, nama, satuan into v_jenis, v_jnama, v_sat from keu_dlg_jenis where kode = 'mengajar_pelatihan' and aktif;
      select coalesce(sum((x ->> 'jam')::numeric), 0) into v_jml
        from jsonb_array_elements(coalesce(v_isi -> 'kelas', '[]'::jsonb)) k, jsonb_array_elements(coalesce(k -> 'instruktur', '[]'::jsonb)) x
       where (x ->> 'akun') ~ '^\d+$' and (x ->> 'akun')::bigint = r.akun_id;
      v_resep := 'JP instruktur pada kelas identifikasi lanjutan';
      if v_jml = 0 then v_resep := 'JP instruktur belum tercatat di kelas'; end if;
    else
      v_resep := 'Belum ada resep untuk peran ini; hari lapangan tetap dihitung penuh';
    end if;
    v_judul := coalesce(v_jnama, initcap(r.peran)) || ' ' || r.kegiatan_nama;
    if v_jenis is not null then
      select d.id into v_ada from keu_dlg_delegasi d
       where d.penerima_akun = r.akun_id and d.kegiatan_id = r.kegiatan_id and d.jenis_id = v_jenis and d.status <> 'batal' limit 1;
      -- poin pratinjau sama dengan yang akan dipakai delegasi: Master bila mulai >= 16 Nov (pemicu skala 100), selain itu katalog skala 75
      v_pps := case when greatest(coalesce(r.tanggal_mulai, v_hari), v_hari) >= keu_dlg_skala100_mulai() then keu_poin_untuk(v_jenis, i.nama || ' ' || v_judul) else (select jsonb_build_object('poin', j.poin_per_satuan, 'sumber', 'katalog skala 75') from keu_dlg_jenis j where j.id = v_jenis) end;
    else
      v_pps := null;
    end if;
    v_hasil := v_hasil || jsonb_build_object(
      'fungsi', r.fungsi, 'kegiatan_id', r.kegiatan_id, 'kegiatan_nama', r.kegiatan_nama, 'akun_id', r.akun_id, 'nama', r.nama, 'peran', r.peran,
      'jenis_id', v_jenis, 'jenis_nama', v_jnama, 'satuan', v_sat, 'jumlah', v_jml, 'resep', v_resep, 'judul', v_judul,
      'mulai', greatest(coalesce(r.tanggal_mulai, v_hari), v_hari), 'tenggat', greatest(coalesce(r.tanggal_selesai, r.tanggal_mulai, v_hari), v_hari),
      'poin_per_satuan', v_pps -> 'poin', 'poin_sumber', v_pps -> 'sumber', 'sudah_delegasi_id', v_ada,
      'siap_buat', v_jenis is not null and coalesce(v_jml, 0) > 0 and v_ada is null);
  end loop;
  return jsonb_build_object('siap', true, 'alasan', '', 'ident_ver', l.ver, 'ro_kode', i.ro_kode, 'butir', v_hasil);
end $f$;

revoke execute on function keu_dlg_draf_kursi(bigint, bigint) from public, anon, authenticated;

-- Izin gerbang keu_jalankan: tambah keu_dlg_draf_kursi (sisa definisi tidak berubah)
do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_dlg_draf_kursi''' in d) = 0 then
    d := replace(d, '''keu_poin_untuk_daftar''];', '''keu_poin_untuk_daftar'',''keu_dlg_draf_kursi''];');
    if position('''keu_dlg_draf_kursi''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
