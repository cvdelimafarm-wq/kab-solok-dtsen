-- =====================================================================
-- 20261025t_keu_lampiran_revisi.sql
-- Kertas Kerja Revisi POK (SIGAP) - papan 4 "Lampiran, tenggat, draf surat":
-- daftar lampiran usulan per jenis revisi (master) dan pencatatan "sudah ada / belum ada" per kertas kerja (jadwal).
-- Bergantung pada 20261024a-s. Aman diulang. Tanpa DELETE/DROP. Hanya menambah (tabel, fungsi, trigger).
--
--  1. keu_master_lampiran : 12 lampiran (L01-L12) dan ketentuannya pada empat jenis (pok, administrasi, dipa_djpb, dipa_dja).
--     Teks ketentuan diawali "Ya" = wajib, "Tidak" = tidak diperlukan, selain itu = bila berlaku (kondisional).
--  2. keu_kk_lampiran     : status per (jadwal, kode): belum | ada, nomor, tanggal, catatan. Diubah lewat fungsi saja.
--  3. keu_kk_lampiran_set : fungsi (kewenangan 'jadwal'), didaftarkan ke gerbang keu_jalankan.
-- =====================================================================

create table if not exists keu_master_lampiran (
  kode        text primary key check (kode ~ '^L[0-9]{2}$'),
  urut        int  not null,
  uraian      text not null check (length(btrim(uraian)) >= 3),
  dasar       text not null default '',
  pok         text not null default 'Tidak',
  administrasi text not null default 'Tidak',
  dipa_djpb   text not null default 'Tidak',
  dipa_dja    text not null default 'Tidak',
  aktif       boolean not null default true,
  diubah_at   timestamptz not null default now()
);
comment on table keu_master_lampiran is 'Lampiran usulan revisi per jenis (PMK 62/2023 Pasal 165, 172-174). Teks ketentuan: diawali Ya = wajib, Tidak = tidak diperlukan, lainnya = bila berlaku.';

insert into keu_master_lampiran (kode, urut, uraian, dasar, pok, administrasi, dipa_djpb, dipa_dja) values
 ('L01', 1,  'Data dalam Sistem Informasi (diunggah)', 'Pasal 173(5); 172(1)(a)1; 165(1)(e)1', 'Ya', 'Ya', 'Ya', 'Ya'),
 ('L02', 2,  'Surat usulan KPA', 'Pasal 172(1)(a); 165(1)(a)', 'Tidak (KPA memutuskan)', 'Ya', 'Ya, ke Kanwil', 'Ya, ke Eselon I'),
 ('L03', 3,  'Hasil reviu APIP atas RKA', 'Pasal 173(3)(b); 165(1)(c)-(d)', 'Perhatikan, catat tautan', 'Tidak', 'Bila diminta', 'LHR APIP bila pagu berubah, antar-Program menurunkan volume RO, atau ada Program, Kegiatan, KRO, atau RO baru'),
 ('L04', 4,  'Surat persetujuan pejabat Eselon I', 'Pasal 172(1)(a)2; 165(1)(e)2', 'Tidak', 'Tidak', 'Bila antar-Satker, antar-Kegiatan, atau Kegiatan baru', 'Surat pernyataan Eselon I (usulan disetujui, dokumen telah diteliti)'),
 ('L05', 5,  'Persetujuan Menteri atau Pimpinan Lembaga', 'Pasal 165(1)(e)2(c)', 'Tidak', 'Tidak', 'Tidak', 'Bila antar-Program (kecuali Belanja Operasional)'),
 ('L06', 6,  'Rencana kebutuhan BMN hasil penelaahan', 'Pasal 165(1)(e)4', 'Tidak', 'Tidak', 'Bila terkait pengadaan BMN (dokumen pendukung lain)', 'Bila menambah atau mengubah objek atau spesifikasi BMN'),
 ('L07', 7,  'Rekomendasi (clearance) Komdigi atau PANRB', 'Pasal 172(1)(a)3; 165(1)(e)5', 'Tidak', 'Tidak', 'Bila belanja TIK tertentu', 'Bila belanja TIK tertentu'),
 ('L08', 8,  'Surat pernyataan Eselon I untuk akun 526 berbasis proposal', 'Pasal 165(1)(e)6; Pasal 171(1)(a)4', 'Tidak', 'Tidak', 'Bila terkait', 'Bila terkait'),
 ('L09', 9,  'Surat pemberitahuan perubahan RKA (format Lampiran IV huruf B)', 'Pasal 174(1)(e)-(g)', 'Tidak', 'Bila ralat oleh K/L', 'Bila Pasal 174', 'Tidak'),
 ('L10', 10, 'Dokumen pendukung lain sesuai substansi', 'Pasal 172(1)(a)4; 165(1)(e)8', 'Ya', 'Ya', 'Ya', 'Ya'),
 ('L11', 11, 'Undangan dan berita acara penelaahan', 'Pasal 165(2) dan (9)', 'Tidak', 'Tidak', 'Tidak', 'Dicatat bila ada'),
 ('L12', 12, 'Dokumen asli diarsipkan KPA', 'Pasal 172(1)(b); 174(1)(d); 165(1)(f)', 'Ya', 'Ya', 'Ya', 'Ya')
on conflict (kode) do nothing;

create table if not exists keu_kk_lampiran (
  jadwal_id  bigint not null references keu_revisi_jadwal(id),
  kode       text   not null references keu_master_lampiran(kode),
  status     text   not null default 'belum' check (status in ('belum', 'ada')),
  nomor      text   not null default '' check (length(nomor) <= 120),
  tanggal    date,
  catatan    text   not null default '' check (length(catatan) <= 300),
  oleh       bigint references sigap_akun(id),
  waktu      timestamptz not null default now(),
  diubah_at  timestamptz not null default now(),
  primary key (jadwal_id, kode)
);
comment on table keu_kk_lampiran is 'Catatan kelengkapan lampiran usulan per kertas kerja (jadwal revisi). Hanya status; berkasnya sendiri diarsipkan KPA. Diubah lewat keu_kk_lampiran_set.';

create or replace function keu_kk_lampiran_set(p_jadwal bigint, p_kode text, p_status text, p_nomor text default '', p_tanggal date default null,
                                              p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare j keu_revisi_jadwal;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not keu_boleh(p_akun, 'jadwal') then raise exception 'Akun % tidak berwenang mencatat lampiran (kewenangan jadwal)', p_akun using errcode = '42501'; end if;
  if p_status is null or p_status not in ('belum', 'ada') then raise exception 'Status harus belum atau ada' using errcode = '22023'; end if;
  select * into j from keu_revisi_jadwal where id = p_jadwal;
  if not found then raise exception 'Jadwal % tidak ada', p_jadwal using errcode = 'P0002'; end if;
  if j.status = 'dilewati' then raise exception 'Jadwal % dilewati; pulihkan dulu', p_jadwal using errcode = '23514'; end if;
  if not exists (select 1 from keu_master_lampiran where kode = p_kode and aktif) then
    raise exception 'Lampiran % tidak dikenal', p_kode using errcode = 'P0002';
  end if;
  insert into keu_kk_lampiran(jadwal_id, kode, status, nomor, tanggal, catatan, oleh, waktu, diubah_at)
  values (p_jadwal, p_kode, p_status, left(btrim(coalesce(p_nomor, '')), 120), p_tanggal, left(btrim(coalesce(p_catatan, '')), 300), p_akun, now(), now())
  on conflict (jadwal_id, kode) do update
    set status = excluded.status, nomor = excluded.nomor, tanggal = excluded.tanggal, catatan = excluded.catatan,
        oleh = excluded.oleh, waktu = now(), diubah_at = now();
end $$;
revoke execute on function keu_kk_lampiran_set(bigint, text, text, text, date, text, bigint) from public, anon, authenticated;

create or replace function keu_lampiran_jaga() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if keu_akun_sesi() is not null then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    return old;
  end if;
  new.diubah_at := now();
  return new;
end $$;
revoke execute on function keu_lampiran_jaga() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_kk_lampiran'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update or delete on keu_kk_lampiran for each row execute function keu_lampiran_jaga();
    create trigger keu_t1_jaga before insert or update or delete on keu_kk_lampiran for each row execute function keu_jaga('jadwal');
    create trigger keu_t9_jejak after insert or update on keu_kk_lampiran for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_master_lampiran'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update or delete on keu_master_lampiran for each row execute function keu_lampiran_jaga();
    create trigger keu_t1_jaga before insert or update or delete on keu_master_lampiran for each row execute function keu_jaga('master');
  end if;
end $$;

alter table keu_master_lampiran enable row level security;
alter table keu_kk_lampiran enable row level security;
revoke all on table keu_master_lampiran, keu_kk_lampiran from anon, authenticated;
grant all on table keu_master_lampiran, keu_kk_lampiran to service_role;

-- Menambah fungsi ke daftar izin keu_jalankan tanpa menulis ulang seluruh fungsi (aman diulang).
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'keu_jalankan' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'keu_jalankan tidak ditemukan'; end if;
  if position('''keu_kk_lampiran_set''' in d) = 0 then
    d := replace(d, '''keu_pok_unggah_tandai'',', '''keu_kk_lampiran_set'',''keu_pok_unggah_tandai'',');
    if position('''keu_kk_lampiran_set''' in d) = 0 then raise exception 'Penambahan izin gagal: pola daftar tidak ditemukan'; end if;
    execute d;
  end if;
end $$;
