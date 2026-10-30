-- =====================================================================
-- 20261025zc_keu_identifikasi_paralel.sql
-- SIGAP - Identifikasi survei, tahap 27a: penyesuaian sesuai keputusan "Skema Lengkap V1" (25 Okt 2026).
-- Dijalankan SESUDAH 20261025za. Aman diulang. Tanpa DELETE/DROP data.
--
--  1. Persetujuan: PPK dan Tata Usaha PARALEL (urutan bebas), KPA TERAKHIR sebagai pengesah (sebelumnya berurutan PPK, TU, KPA).
--     Kolom baru ok_ppk, ok_tu; `langkah` = jumlah persetujuan sejauh ini (0..2 selagi menunggu).
--  2. H-15: semua identifikasi wajib selesai H-15 (15 hari sebelum mulai pendataan paling awal). Revisi yang DIKIRIM sesudah H-15
--     hanya perlu KPA (kolom pasca_h15) dan dicatat di riwayat untuk evaluasi. Ambang pergeseran 7 hari dihapus: perubahan tanggal
--     tidak lagi boleh langsung lewat keu_ident_h15 (yang kini hanya menegaskan tanggal), melainkan lewat revisi.
--  3. Istilah: versi pertama = "identifikasi awal"; versi berikutnya = "terupdate". Nama status basis data `sah` tidak diubah.
-- =====================================================================

alter table keu_ident add column if not exists ok_ppk boolean not null default false;
alter table keu_ident add column if not exists ok_tu boolean not null default false;
alter table keu_ident add column if not exists pasca_h15 boolean not null default false;   -- pengiriman revisi ini dikirim sesudah H-15: hanya KPA

update keu_master_kewenangan set ket = 'PPK dan Tata Usaha menyetujui secara paralel, lalu KPA terakhir yang mengesahkan. Revisi yang dikirim sesudah H-15 hanya perlu KPA.' where kode = 'ident_setuju';
update keu_master_kewenangan set ket = 'Ketua tim dan PPK; admin RO menyusun, dikirim atas persetujuan ketua tim. Juga mengajukan revisi dan menegaskan tanggal periode H-15.' where kode = 'ident_susun';
update keu_master_kewenangan_peran set ket = 'paralel dengan Tata Usaha' where kewenangan_kode = 'ident_setuju' and peran_kode = 'PPK';
update keu_master_kewenangan_peran set ket = 'paralel dengan PPK' where kewenangan_kode = 'ident_setuju' and peran_kode = 'TU';
update keu_master_kewenangan_peran set ket = 'terakhir, mengesahkan' where kewenangan_kode = 'ident_setuju' and peran_kode = 'KPA';
update keu_master_peran set ket = replace(ket, 'sebagai langkah ketiga, sesudah PPK dan Tata Usaha.', 'sebagai pengesah terakhir, sesudah PPK dan Tata Usaha (paralel).') where kode = 'KPA';
update keu_master_peran set ket = replace(ket, 'sebagai langkah kedua, sesudah PPK.', 'bersama PPK (paralel), sebelum KPA.') where kode = 'TU';
update keu_master_peran set ket = replace(ket, 'sebagai langkah pertama.', 'bersama Tata Usaha (paralel), sebelum KPA.') where kode = 'PPK';

-- mulai pendataan paling awal pada suatu formulir (null bila tanpa pendataan atau jadwal belum lengkap)
create or replace function keu_ident_mulai_awal(p_form jsonb, p_tahun int)
returns date language plpgsql stable set search_path = public as $$
declare k text; w date[]; m date; t text;
begin
  if p_form is null or p_form ->> 'instrumen' = 'Tanpa pendataan' then return null; end if;
  if p_form ->> 'periode' = 'Tanpa periode' then
    t := nullif(btrim(coalesce(p_form #>> '{tunggal,mulai}', '')), '');
    return case when t ~ '^\d{4}-\d\d-\d\d$' then t::date end;
  end if;
  for k in select jsonb_array_elements_text(coalesce(p_form -> 'keList', '[]'::jsonb)) loop
    w := keu_ident_jendela(p_form, k, p_tahun);
    if w is not null and w[1] is not null and (m is null or w[1] < m) then m := w[1]; end if;
  end loop;
  return m;
end $$;
revoke execute on function keu_ident_mulai_awal(jsonb, int) from public, anon, authenticated;

-- peran yang sedang boleh menyetujui oleh akun ini: PPK/TU (paralel), KPA (terakhir, atau satu-satunya bila sesudah H-15)
create or replace function keu_ident_giliran(p_ok_ppk boolean, p_ok_tu boolean, p_pasca boolean, p_akun bigint)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_pasca then case when keu_ident_punya(p_akun, 'KPA') then 'KPA' end
    when keu_ident_punya(p_akun, 'PPK') and not p_ok_ppk then 'PPK'
    when keu_ident_punya(p_akun, 'TU') and not p_ok_tu then 'TU'
    when keu_ident_punya(p_akun, 'KPA') and p_ok_ppk and p_ok_tu then 'KPA'
  end
$$;
revoke execute on function keu_ident_giliran(boolean, boolean, boolean, bigint) from public, anon, authenticated;

-- alur: kirim | setuju_ketua | setujui | kembalikan | tarik | ajukan_revisi | batal_revisi | batal
create or replace function keu_ident_aksi(p_id bigint, p_aksi text, p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns text language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; v jsonb; ke text; v_cat text := btrim(coalesce(p_catatan, ''));
  v_peran text[] := array['PPK','TU','KPA']; v_nama text[] := array['PPK','Tata Usaha','KPA'];
  v_susun boolean; v_ketua boolean; v_ppk boolean; v_form_sah jsonb; v_balik text; P text; v_upd jsonb := '{}'::jsonb; a date[]; b date[];
  v_pasca boolean := false; v_telat boolean := false; v_h date; v_giliran text; v_cat2 text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_id for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_id using errcode = '23514'; end if;
  v_susun := keu_boleh(p_akun, 'ident_susun', i.ro_kode);
  v_ppk := keu_ident_punya(p_akun, 'PPK');
  v_ketua := keu_boleh(p_akun, 'setuju_ketua', i.ro_kode) or (v_ppk and not keu_ident_ketua_ada(i.ro_kode));
  v_balik := case when i.ver > 0 then 'revisi' else 'draf' end;
  select form into v_form_sah from keu_ident_versi where ident_id = i.id and ver = i.ver;
  perform set_config('keu.via_fungsi', '1', true);

  if p_aksi = 'kirim' then
    if i.status not in ('draf','revisi') then raise exception 'Hanya draf atau revisi yang dapat dikirim (status %)', i.status using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang mengirim identifikasi RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    if i.status = 'revisi' then
      if char_length(btrim(i.alasan_revisi)) < 10 then raise exception 'Alasan revisi wajib diisi, minimal 10 huruf' using errcode = '23514'; end if;
      if i.form is not distinct from v_form_sah then raise exception 'Belum ada perubahan dibanding versi sah' using errcode = '23514'; end if;
    end if;
    -- H-15: 15 hari sebelum mulai pendataan paling awal. Sesudahnya, revisi cukup disetujui KPA (dicatat untuk evaluasi).
    v_h := keu_ident_mulai_awal(case when i.ver > 0 then v_form_sah else i.form end, i.tahun);
    v_telat := v_h is not null and current_date >= v_h - 15;
    v_pasca := v_telat and i.ver > 0;
    ke := case when keu_boleh(p_akun, 'setuju_ketua', i.ro_kode) or v_ppk then 'menunggu_setuju' else 'menunggu_ketua' end;
    update keu_ident set status = ke, rev = (i.ver > 0), langkah = 0, ok_ppk = false, ok_tu = false, pasca_h15 = v_pasca, diajukan_oleh = p_akun, diajukan_at = now(),
           disetujui_ketua_oleh = case when ke = 'menunggu_setuju' then p_akun end, disetujui_ketua_at = case when ke = 'menunggu_setuju' then now() end,
           catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'kirim', i.status, ke, i.ver + 1, p_akun,
      case when i.ver > 0 then 'Revisi. Alasan: ' || btrim(i.alasan_revisi) else '' end
      || case when v_pasca then ' Dikirim sesudah H-15 (' || to_char(v_h - 15, 'DD/MM/YYYY') || '): hanya KPA yang menyetujui; dicatat untuk evaluasi.'
              when v_telat then ' Dikirim sesudah H-15 (' || to_char(v_h - 15, 'DD/MM/YYYY') || '): terlambat; dicatat untuk evaluasi.' else '' end);

  elsif p_aksi = 'setuju_ketua' then
    if i.status <> 'menunggu_ketua' then raise exception 'Identifikasi tidak menunggu ketua tim (status %)', i.status using errcode = '23514'; end if;
    if not v_ketua then raise exception 'Akun % bukan ketua tim RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    if p_akun = i.diajukan_oleh then raise exception 'Pengirim tidak menyetujui kirimannya sendiri sebagai ketua' using errcode = '42501'; end if;
    ke := 'menunggu_setuju';
    update keu_ident set status = ke, disetujui_ketua_oleh = p_akun, disetujui_ketua_at = now() where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'setuju_ketua', i.status, ke, i.ver + 1, p_akun, v_cat);

  elsif p_aksi = 'setujui' then
    if i.status <> 'menunggu_setuju' then raise exception 'Identifikasi tidak menunggu persetujuan (status %)', i.status using errcode = '23514'; end if;
    v_giliran := keu_ident_giliran(i.ok_ppk, i.ok_tu, i.pasca_h15, p_akun);
    if v_giliran is null or not keu_boleh(p_akun, 'ident_setuju') then
      raise exception 'Akun % tidak berwenang atau belum gilirannya (PPK dan Tata Usaha paralel, KPA terakhir%)', p_akun, case when i.pasca_h15 then '; sesudah H-15 hanya KPA' else '' end using errcode = '42501';
    end if;
    if v_giliran in ('PPK','TU') then
      ke := 'menunggu_setuju';
      update keu_ident set ok_ppk = (ok_ppk or v_giliran = 'PPK'), ok_tu = (ok_tu or v_giliran = 'TU'), langkah = langkah + 1 where id = i.id;
      insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'setujui', i.status, ke, i.ver + 1, p_akun, case v_giliran when 'PPK' then 'PPK' else 'Tata Usaha' end || ' menyetujui. ' || v_cat);
    else
      ke := 'sah';
      -- pembaruan H-15 dipertahankan hanya untuk periode yang jendelanya tidak berubah oleh versi baru
      if i.ver > 0 and v_form_sah is not null then
        for P in select k from jsonb_object_keys(i.upd) k loop
          a := keu_ident_jendela(v_form_sah, P, i.tahun); b := keu_ident_jendela(i.form, P, i.tahun);
          if a is not null and a = b then v_upd := v_upd || jsonb_build_object(P, i.upd -> P); end if;
        end loop;
      end if;
      insert into keu_ident_versi(ident_id, ver, form, alasan, rev) values (i.id, i.ver + 1, i.form, case when i.rev then i.alasan_revisi else '' end, i.rev);
      update keu_ident set status = 'sah', ver = i.ver + 1, langkah = 3, ok_ppk = false, ok_tu = false, pasca_h15 = false, rev = false, alasan_revisi = '', catatan_kembali = '', kembali_oleh = null, kembali_at = null, upd = v_upd where id = i.id;
      insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'setujui', i.status, 'sah', i.ver + 1, p_akun,
        'KPA mengesahkan' || case when i.ver = 0 then '; identifikasi awal v1' else '; identifikasi terupdate v' || (i.ver + 1) end || case when i.pasca_h15 then ' (sesudah H-15; dicatat untuk evaluasi)' else '' end);
    end if;

  elsif p_aksi = 'kembalikan' then
    if char_length(v_cat) < 5 then raise exception 'Catatan pengembalian wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if i.status = 'menunggu_ketua' and v_ketua then v_cat2 := 'Ketua tim';
    elsif i.status = 'menunggu_setuju' and keu_boleh(p_akun, 'ident_setuju') and keu_ident_giliran(i.ok_ppk, i.ok_tu, i.pasca_h15, p_akun) is not null then
      v_cat2 := case keu_ident_giliran(i.ok_ppk, i.ok_tu, i.pasca_h15, p_akun) when 'TU' then 'Tata Usaha' else keu_ident_giliran(i.ok_ppk, i.ok_tu, i.pasca_h15, p_akun) end;
    else raise exception 'Akun % tidak dapat mengembalikan identifikasi berstatus % pada giliran ini', p_akun, i.status using errcode = '42501'; end if;
    ke := v_balik;
    update keu_ident set status = ke, langkah = 0, ok_ppk = false, ok_tu = false, pasca_h15 = false, catatan_kembali = v_cat, kembali_oleh = v_cat2, kembali_at = now() where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'kembalikan', i.status, ke, i.ver + 1, p_akun, v_cat);

  elsif p_aksi = 'tarik' then
    if i.status not in ('menunggu_ketua','menunggu_setuju') or i.langkah > 0 then
      raise exception 'Hanya kiriman yang belum disetujui siapa pun yang dapat ditarik kembali' using errcode = '23514';
    end if;
    if not (p_akun = i.diajukan_oleh or v_ppk or keu_boleh(p_akun, 'setuju_ketua', i.ro_kode)) then
      raise exception 'Hanya pengirim, ketua tim, atau PPK yang dapat menarik kiriman' using errcode = '42501';
    end if;
    ke := v_balik;
    update keu_ident set status = ke, langkah = 0, ok_ppk = false, ok_tu = false, pasca_h15 = false where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'tarik', i.status, ke, i.ver + 1, p_akun, v_cat);

  elsif p_aksi = 'ajukan_revisi' then
    if i.status <> 'sah' then raise exception 'Revisi hanya dapat diajukan dari identifikasi yang sah (status %)', i.status using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang mengajukan revisi RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    ke := 'revisi';
    update keu_ident set status = ke, form = v_form_sah, alasan_revisi = '', langkah = 0, ok_ppk = false, ok_tu = false, pasca_h15 = false, catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'ajukan_revisi', i.status, ke, i.ver + 1, p_akun, 'Revisi dibuka dari versi v' || i.ver);

  elsif p_aksi = 'batal_revisi' then
    if i.status <> 'revisi' then raise exception 'Tidak ada revisi yang sedang disunting (status %)', i.status using errcode = '23514'; end if;
    if not v_susun then raise exception 'Akun % tidak berwenang membatalkan revisi RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
    ke := 'sah';
    update keu_ident set status = ke, form = v_form_sah, nama = coalesce(nullif(btrim(v_form_sah ->> 'nama'), ''), nama), alasan_revisi = '', langkah = 3, ok_ppk = false, ok_tu = false, pasca_h15 = false, catatan_kembali = '', kembali_oleh = null, kembali_at = null where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'batal_revisi', i.status, ke, i.ver, p_akun, 'Revisi dibatalkan; kembali ke versi v' || i.ver);

  elsif p_aksi = 'batal' then
    if i.ver > 0 or i.status <> 'draf' then raise exception 'Hanya draf yang belum pernah sah yang dapat dibatalkan' using errcode = '23514'; end if;
    if char_length(v_cat) < 5 then raise exception 'Alasan pembatalan wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    if not (v_susun or p_akun = i.dibuat_oleh) then raise exception 'Akun % tidak berwenang membatalkan identifikasi ini', p_akun using errcode = '42501'; end if;
    ke := 'dibatalkan';
    update keu_ident set status = ke where id = i.id;
    insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'batal', i.status, ke, 0, p_akun, v_cat);
  else
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;
  perform set_config('keu.via_fungsi', '', true);
  return ke;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_aksi(bigint, text, text, bigint) from public, anon, authenticated;

-- penegasan tanggal periode (H-15). Tanggal TIDAK boleh bergeser dari jendela pada versi berlaku: perubahan tanggal lewat revisi
-- (persetujuan seperti identifikasi awal; sesudah H-15 oleh KPA). Fungsi ini hanya menegaskan tanggal (Perkiraan menjadi Fix).
create or replace function keu_ident_h15(p_id bigint, p_periode text, p_mulai date, p_selesai date, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  i keu_ident; f jsonb; w date[]; gm int; gs int; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select * into i from keu_ident where id = p_id for update;
  if not found then raise exception 'Identifikasi % tidak ada', p_id using errcode = '23514'; end if;
  if not keu_boleh(p_akun, 'ident_susun', i.ro_kode) then raise exception 'Akun % tidak berwenang menegaskan periode RO %', p_akun, i.ro_kode using errcode = '42501'; end if;
  if i.ver < 1 then raise exception 'Penegasan periode baru dapat dilakukan sesudah identifikasi awal disahkan' using errcode = '23514'; end if;
  select form into f from keu_ident_versi where ident_id = i.id and ver = i.ver;
  if f ->> 'instrumen' = 'Tanpa pendataan' or f ->> 'periode' = 'Tanpa periode' then
    raise exception 'Identifikasi ini tidak memiliki pendataan berperiode' using errcode = '23514';
  end if;
  if not (f -> 'keList') ? p_periode then raise exception 'Periode % tidak ada pada versi yang berlaku', p_periode using errcode = '23514'; end if;
  if p_mulai is null or p_selesai is null or p_selesai < p_mulai then raise exception 'Tanggal belum lengkap atau selesai sebelum mulai' using errcode = '23514'; end if;
  w := keu_ident_jendela(f, p_periode, i.tahun);
  if w is null then raise exception 'Jendela pendataan % belum dapat dihitung', p_periode using errcode = '23514'; end if;
  gm := p_mulai - w[1]; gs := p_selesai - w[2];
  if gm <> 0 or gs <> 0 then
    raise exception 'Tanggal bergeser % hari (mulai) dan % hari (selesai); perubahan tanggal harus lewat revisi identifikasi (disetujui seperti identifikasi awal; sesudah H-15 oleh KPA)', gm, gs using errcode = '23514';
  end if;
  r := jsonb_build_object('mulai', p_mulai, 'selesai', p_selesai, 'geser_mulai', 0, 'geser_selesai', 0, 'oleh', p_akun, 'at', now());
  perform set_config('keu.via_fungsi', '1', true);
  update keu_ident set upd = upd || jsonb_build_object(p_periode, r) where id = i.id;
  insert into keu_ident_riwayat(ident_id, aksi, dari, ke, ver, oleh, catatan) values (i.id, 'h15', i.status, i.status, i.ver, p_akun,
    p_periode || ': pendataan ' || to_char(p_mulai, 'DD/MM/YYYY') || ' s.d. ' || to_char(p_selesai, 'DD/MM/YYYY') || ' (tanggal ditegaskan)');
  perform set_config('keu.via_fungsi', '', true);
  return r;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_ident_h15(bigint, text, date, date, bigint) from public, anon, authenticated;

-- tampilan: kolom baru ditambahkan di ujung; teks "menunggu" mengikuti alur paralel
create or replace view keu_v_ident with (security_invoker = true) as
select i.id, i.tahun, i.ro_kode, i.nama, i.status, i.rev, i.ver, i.langkah, i.form,
       (select v.form from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver) as form_sah,
       (select v.disahkan_at from keu_ident_versi v where v.ident_id = i.id and v.ver = i.ver) as sah_at,
       i.alasan_revisi, i.catatan_kembali, i.kembali_oleh, i.kembali_at, i.upd,
       i.dibuat_oleh, i.diajukan_oleh, i.diajukan_at, i.disetujui_ketua_oleh, i.disetujui_ketua_at, i.dibuat_at, i.diubah_at,
       case i.status when 'draf' then 'penyusun' when 'revisi' then 'penyusun (revisi)' when 'menunggu_ketua' then 'ketua tim'
         when 'menunggu_setuju' then case
           when i.pasca_h15 then 'KPA'
           when not i.ok_ppk and not i.ok_tu then 'PPK dan Tata Usaha'
           when not i.ok_ppk then 'PPK' when not i.ok_tu then 'Tata Usaha' else 'KPA' end end as menunggu,
       i.ok_ppk, i.ok_tu, i.pasca_h15
from keu_ident i;
revoke all on keu_v_ident from anon, authenticated, public;
grant select on keu_v_ident to service_role;
