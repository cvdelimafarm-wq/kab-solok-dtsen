-- skema-sql/20261114b_keu_ident_kursi_tugas.sql
--
-- (14 Nov 2026, Fase 2a) Status kursi tim per identifikasi: Rencana -> Sementara -> Final, ditambah "Ditugaskan" (sudah punya penugasan
-- SIGAP pada kegiatan yang tertaut ke identifikasi). Status dihitung di aplikasi (lib/keu/kursi.ts) dari identifikasi lanjutan versi hilir;
-- view ini hanya menyediakan penugasan aktif per akun pada kegiatan tertaut (tautan aktif = dilepas_at kosong). Hanya view: tidak mengubah data.

begin;

create or replace view keu_v_ident_kursi_tugas as
select t.ident_id, t.fungsi, t.kegiatan_id, g.nama as kegiatan_nama,
       p.id as penugasan_id, p.akun_id, p.peran, p.atasan_akun_id, (p.surat_tugas_id is not null) as ada_st, p.dikunci_at
  from keu_ident_kegiatan t
  join sigap_kegiatan g on g.id = t.kegiatan_id
  join sigap_penugasan p on p.kegiatan_id = t.kegiatan_id and p.aktif
 where t.dilepas_at is null;

revoke all on keu_v_ident_kursi_tugas from anon, authenticated;

commit;
