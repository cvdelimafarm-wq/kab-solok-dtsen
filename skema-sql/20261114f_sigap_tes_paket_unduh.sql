-- skema-sql/20261114f_sigap_tes_paket_unduh.sql
--
-- (14 Nov 2026, luring 3b-1) Catatan HP peserta yang sudah memegang paket soal tersandi (versi terbaru) -> instruktur/panitia melihat
-- "Siap tanpa sinyal: x dari y" dan siapa yang belum. Hanya menambah tabel; dibaca/ditulis lewat server (service role), RLS aktif tanpa kebijakan.

begin;

create table if not exists sigap_tes_paket_unduh (
  tes_id bigint not null references sigap_tes(id) on delete cascade,
  akun_id bigint not null,
  versi text not null,
  at timestamptz not null default now(),
  primary key (tes_id, akun_id)
);

alter table sigap_tes_paket_unduh enable row level security;

comment on table sigap_tes_paket_unduh is '(14 Nov 2026) Paket soal luring terakhir yang dipegang HP peserta (versi). Diperbarui tiap HP memeriksa paket.';

commit;
