-- (9 Okt 2026) PENJAGA: hanya peserta pelatihan (penugasan aktif kegiatan 3 = 94 nama) yang boleh masuk plot / tim bencana
-- -- permintaan user: "seluruh petugas di luar 94 nama jangan ada di plot baik sekarang maupun akan datang".
-- Jalankan SENDIRI di Supabase SQL Editor (pembuatan trigger pada bencana_alokasi_subsls menggantung bila lewat MCP).
-- Urutan: jalankan 20261009v (lepas yang sudah ada) lalu file ini; urutan terbalik pun aman.
--
-- Cara kerja:
--   * Sumber kebenaran = sigap_penugasan (kegiatan_id=3, aktif) -> sigap_akun.petugas_bencana_id.
--     Bila daftar 94 berubah (tambah/ganti peserta), penjaga ikut otomatis.
--   * INSERT/UPDATE ppl_id/pml_id di bencana_alokasi_subsls ditolak bila petugasnya bukan peserta.
--   * Mengisi atasan_id di bencana_petugas ditolak bila petugas ATAU atasannya bukan peserta
--     (mengosongkan atasan_id selalu boleh; baris lama tidak diperiksa ulang).
--   * Skrip/SQL plotting masa depan yang memasukkan non-peserta akan GAGAL dengan pesan jelas.
-- Rollback: drop trigger alokasi_hanya_peserta on public.bencana_alokasi_subsls;
--           drop trigger atasan_hanya_peserta on public.bencana_petugas;

create or replace function public.bencana_peserta_pelatihan(pid bigint)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.sigap_penugasan p
    join public.sigap_akun a on a.id = p.akun_id
    where p.kegiatan_id = 3 and p.aktif and a.petugas_bencana_id = pid
  );
$$;

create or replace function public.trg_alokasi_hanya_peserta()
returns trigger language plpgsql as $$
begin
  if new.ppl_id is not null and not public.bencana_peserta_pelatihan(new.ppl_id) then
    raise exception 'Petugas % bukan peserta pelatihan (94 nama) -- tidak boleh masuk plot', new.ppl_id using errcode = 'check_violation';
  end if;
  if new.pml_id is not null and not public.bencana_peserta_pelatihan(new.pml_id) then
    raise exception 'PML % bukan peserta pelatihan (94 nama) -- tidak boleh masuk plot', new.pml_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists alokasi_hanya_peserta on public.bencana_alokasi_subsls;
create trigger alokasi_hanya_peserta
  before insert or update of ppl_id, pml_id on public.bencana_alokasi_subsls
  for each row execute function public.trg_alokasi_hanya_peserta();

create or replace function public.trg_atasan_hanya_peserta()
returns trigger language plpgsql as $$
begin
  if new.atasan_id is not null and (tg_op = 'INSERT' or new.atasan_id is distinct from old.atasan_id) then
    if not public.bencana_peserta_pelatihan(new.id) then
      raise exception 'Petugas % (%) bukan peserta pelatihan (94 nama) -- tidak boleh dipasang ke tim/PML', new.id, new.nama using errcode = 'check_violation';
    end if;
    if not public.bencana_peserta_pelatihan(new.atasan_id) then
      raise exception 'PML % bukan peserta pelatihan (94 nama) -- tidak boleh memimpin tim', new.atasan_id using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists atasan_hanya_peserta on public.bencana_petugas;
create trigger atasan_hanya_peserta
  before insert or update of atasan_id on public.bencana_petugas
  for each row execute function public.trg_atasan_hanya_peserta();

-- Verifikasi: harus 2 baris trigger.
select tgname, tgrelid::regclass as tabel from pg_trigger where tgname in ('alokasi_hanya_peserta','atasan_hanya_peserta');
