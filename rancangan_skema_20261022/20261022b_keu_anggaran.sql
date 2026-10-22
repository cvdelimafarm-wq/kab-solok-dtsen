-- =====================================================================
-- 20261022b_keu_anggaran.sql
-- Lapis: modul anggaran (prefix keu_). Bergantung pada 20261022a.
-- Isi: tahun anggaran, pejabat bermasa berlaku (menggantikan lib/spjPejabat.ts),
--      POK/RKKS berversi (pohon 7 tingkat), SBM, RAB berversi, revisi anggaran,
--      RPD, transaksi (komitmen/realisasi) dengan penjaga pagu, view serapan.
-- Dasar: PMK 62/2023 jo 107/2024 jo 41/2026 (pasal rinci: isi admin).
-- =====================================================================

create table keu_tahun_anggaran (
  tahun       smallint primary key check (tahun between 2020 and 2100),
  satker_kode text not null default '019979',
  pagu_total  numeric(18,0) not null check (pagu_total >= 0),
  status      text not null default 'susun' check (status in ('susun','berjalan','ditutup')),
  dibuat_at   timestamptz not null default now()
);
comment on table keu_tahun_anggaran is 'Tahun anggaran satker. Satu baris per tahun.';

-- Pejabat pengelola keuangan dengan masa berlaku. Tidak ada dua pemegang aktif
-- untuk peran dan lingkup yang sama pada tanggal yang sama (exclusion constraint).
create table keu_pejabat (
  id            bigint generated always as identity primary key,
  tahun         smallint not null references keu_tahun_anggaran(tahun),
  peran         text not null check (peran in ('kpa','ppk','ppspm','bendahara','pp','operator_anggaran')),
  akun_id       bigint not null references sigap_akun(id),
  kegiatan_id   bigint references sigap_kegiatan(id),
  sk_nomor      text not null,
  sk_tanggal    date not null,
  berlaku_mulai date not null,
  berlaku_sampai date,
  dibuat_at     timestamptz not null default now(),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  exclude using gist (
    tahun with =, peran with =, (coalesce(kegiatan_id, 0)) with =,
    daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&
  )
);
comment on table keu_pejabat is 'Pejabat per peran dan masa berlaku (SK). Tanda tangan dokumen mengacu ke baris yang berlaku pada tanggal dokumen.';
create index keu_pejabat_akun_idx on keu_pejabat (akun_id);

create function keu_pejabat_aktif(p_peran text, p_tanggal date, p_kegiatan bigint default null)
returns bigint language sql stable set search_path = public, pg_temp
as $$
  select akun_id from keu_pejabat
  where peran = p_peran and p_tanggal between berlaku_mulai and coalesce(berlaku_sampai, 'infinity'::date)
    and (kegiatan_id is null or kegiatan_id = p_kegiatan)
  order by (kegiatan_id is null), berlaku_mulai desc
  limit 1
$$;

-- Versi POK (DIPA awal dan tiap revisi). Satu versi 'berlaku' per tahun.
create table keu_pok_versi (
  id             bigint generated always as identity primary key,
  tahun          smallint not null references keu_tahun_anggaran(tahun),
  nomor_revisi   smallint not null check (nomor_revisi >= 0),
  jenis          text not null check (jenis in ('dipa_awal','revisi')),
  tanggal_efektif date,
  sumber_berkas  text,
  hash_berkas    text check (hash_berkas is null or hash_berkas ~ '^[0-9a-f]{64}$'),
  status         text not null default 'draf' check (status in ('draf','berlaku','digantikan')),
  diimpor_oleh   bigint references sigap_akun(id),
  dibuat_at      timestamptz not null default now(),
  unique (tahun, nomor_revisi),
  check ((jenis = 'dipa_awal') = (nomor_revisi = 0)),
  check (status = 'draf' or (tanggal_efektif is not null and hash_berkas is not null))
);
create unique index keu_pok_versi_satu_berlaku on keu_pok_versi (tahun) where status = 'berlaku';
comment on table keu_pok_versi is 'Versi POK per tahun. Berkas RKKS diimpor, di-hash, lalu dibekukan; versi berlaku hanya satu.';

create table keu_pok_node (
  id        bigint generated always as identity primary key,
  versi_id  bigint not null references keu_pok_versi(id),
  induk_id  bigint references keu_pok_node(id),
  tingkat   text not null check (tingkat in ('program','kegiatan','kro','ro','komponen','subkomponen','akun')),
  kode      text not null,
  nama      text not null,
  pagu      numeric(18,0) not null default 0 check (pagu >= 0),
  unique nulls not distinct (versi_id, induk_id, kode),
  check ((tingkat = 'program') = (induk_id is null))
);
create index keu_pok_node_induk_idx on keu_pok_node (induk_id);
create index keu_pok_node_versi_tingkat_idx on keu_pok_node (versi_id, tingkat, kode);
comment on table keu_pok_node is 'Pohon POK: program > kegiatan > KRO > RO > komponen > subkomponen > akun. Detail ada di keu_pok_detail.';

create function keu_node_cek_hirarki() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_urut text[] := array['program','kegiatan','kro','ro','komponen','subkomponen','akun'];
        v_ind record;
begin
  if new.induk_id is null then return new; end if;
  select versi_id, tingkat into v_ind from keu_pok_node where id = new.induk_id;
  if v_ind.versi_id <> new.versi_id then
    raise exception 'Induk berada pada versi POK berbeda' using errcode = 'check_violation';
  end if;
  if array_position(v_urut, new.tingkat) <> array_position(v_urut, v_ind.tingkat) + 1 then
    raise exception 'Tingkat % tidak boleh berada di bawah %', new.tingkat, v_ind.tingkat using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger keu_node_hirarki_tr before insert or update of induk_id, tingkat, versi_id on keu_pok_node
  for each row execute function keu_node_cek_hirarki();

create table keu_pok_detail (
  id           bigint generated always as identity primary key,
  versi_id     bigint not null references keu_pok_versi(id),
  akun_node_id bigint not null references keu_pok_node(id),
  kunci_stabil text not null,
  uraian       text not null,
  volume       numeric(14,2) not null check (volume >= 0),
  satuan       text not null,
  harga_satuan numeric(16,0) not null check (harga_satuan >= 0),
  jumlah       numeric(18,0) generated always as (round(volume * harga_satuan)) stored,
  sumber_dana  text not null default 'RM',
  tanda_blokir boolean not null default false,
  unique (versi_id, kunci_stabil)
);
create index keu_pok_detail_akun_idx on keu_pok_detail (akun_node_id);
comment on table keu_pok_detail is 'Baris detail POK. kunci_stabil mengikat baris yang sama lintas versi revisi sehingga transaksi dan RAB tidak yatim.';
comment on column keu_pok_detail.tanda_blokir is 'Catatan khusus/blokir (tanda bintang). Transaksi ditolak selama true.';

-- Standar biaya masukan, bermasa berlaku. Tarif diisi dari ketentuan tahun berjalan.
create table keu_sbm (
  id            bigint generated always as identity primary key,
  tahun         smallint not null references keu_tahun_anggaran(tahun),
  kode          text not null,
  uraian        text not null,
  satuan        text not null,
  tarif         numeric(16,0) not null check (tarif >= 0),
  wilayah_kode  text,
  tkl_regulasi_id bigint references tkl_regulasi(id),
  status_isi    text not null default 'diisi_admin' check (status_isi in ('ilustrasi','diisi_admin','terverifikasi')),
  berlaku_mulai date not null,
  berlaku_sampai date,
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai),
  exclude using gist (
    tahun with =, kode with =, (coalesce(wilayah_kode, '')) with =,
    daterange(berlaku_mulai, coalesce(berlaku_sampai, 'infinity'::date), '[]') with &&
  )
);
comment on table keu_sbm is 'Standar biaya masukan per tahun. Angka diisi admin dari ketentuan resmi tahun berjalan, bukan konstanta kode.';

-- RAB berversi per RO dan kegiatan
create table keu_rab_versi (
  id             bigint generated always as identity primary key,
  kegiatan_id    bigint not null references sigap_kegiatan(id),
  ro_node_id     bigint not null references keu_pok_node(id),
  nomor          smallint not null check (nomor >= 1),
  status         text not null default 'draf' check (status in ('draf','diajukan','disetujui','dikunci','ditolak')),
  rentang_persen numeric(5,2) not null default 5 check (rentang_persen between 0 and 50),
  cadangan_persen numeric(5,2) not null default 5 check (cadangan_persen between 0 and 20),
  dibuat_oleh    bigint not null references sigap_akun(id),
  diajukan_at    timestamptz,
  disetujui_oleh bigint references sigap_akun(id),
  disetujui_at   timestamptz,
  catatan        text,
  dibuat_at      timestamptz not null default now(),
  unique (ro_node_id, nomor),
  check (disetujui_oleh is null or disetujui_oleh <> dibuat_oleh),
  check (status not in ('disetujui','dikunci') or (disetujui_oleh is not null and disetujui_at is not null)),
  check (status not in ('diajukan','disetujui','dikunci') or diajukan_at is not null)
);
comment on table keu_rab_versi is 'RAB berversi per RO. Pemisahan tugas: penyusun tidak boleh menyetujui versi sendiri. Versi dikunci tidak dapat diubah.';

create table keu_rab_baris (
  id            bigint generated always as identity primary key,
  rab_versi_id  bigint not null references keu_rab_versi(id),
  pok_detail_id bigint references keu_pok_detail(id),
  akun_kode     text not null check (akun_kode ~ '^[0-9]{6}$'),
  uraian        text not null,
  volume        numeric(14,2) not null check (volume >= 0),
  satuan        text not null,
  harga_satuan  numeric(16,0) not null check (harga_satuan >= 0),
  jumlah        numeric(18,0) generated always as (round(volume * harga_satuan)) stored,
  sbm_id        bigint references keu_sbm(id),
  catatan       text
);
create index keu_rab_baris_versi_idx on keu_rab_baris (rab_versi_id);
create index keu_rab_baris_detail_idx on keu_rab_baris (pok_detail_id);

create function keu_rab_cek_setuju() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_total numeric; v_pagu numeric;
begin
  if new.status in ('disetujui','dikunci') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select coalesce(sum(jumlah), 0) into v_total from keu_rab_baris where rab_versi_id = new.id;
    select pagu into v_pagu from keu_pok_node where id = new.ro_node_id;
    if v_total > v_pagu * (100 - new.cadangan_persen) / 100 then
      raise exception 'Total RAB % melebihi pagu RO % dikurangi cadangan % persen', v_total, v_pagu, new.cadangan_persen
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger keu_rab_setuju_tr before insert or update of status on keu_rab_versi
  for each row execute function keu_rab_cek_setuju();
create trigger keu_rab_beku_tr before update on keu_rab_versi
  for each row execute function tkl_beku_jika('status', 'dikunci');

create function keu_rab_baris_tolak_bila_beku() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_id bigint := coalesce(new.rab_versi_id, old.rab_versi_id); v_st text;
begin
  select status into v_st from keu_rab_versi where id = v_id;
  if v_st in ('diajukan','disetujui','dikunci') then
    raise exception 'Baris RAB tidak dapat diubah pada status %', v_st using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger keu_rab_baris_beku_tr before insert or update or delete on keu_rab_baris
  for each row execute function keu_rab_baris_tolak_bila_beku();

-- Revisi anggaran
create table keu_revisi (
  id            bigint generated always as identity primary key,
  tahun         smallint not null references keu_tahun_anggaran(tahun),
  jenis         text not null check (jenis in ('pagu','rincian','administratif')),
  status        text not null default 'draf'
                check (status in ('draf','diajukan','diperiksa','disetujui','terbit_dipa','ditolak','dibatalkan')),
  dari_versi_id bigint not null references keu_pok_versi(id),
  ke_versi_id   bigint references keu_pok_versi(id),
  jenjang_berwenang text,
  alasan        text not null check (length(btrim(alasan)) >= 20),
  pengaju_id    bigint not null references sigap_akun(id),
  pemeriksa_id  bigint references sigap_akun(id),
  penyetuju_id  bigint references sigap_akun(id),
  diajukan_at   timestamptz,
  disetujui_at  timestamptz,
  dibuat_at     timestamptz not null default now(),
  check (penyetuju_id is null or penyetuju_id <> pengaju_id),
  check (pemeriksa_id is null or pemeriksa_id <> pengaju_id),
  check (status not in ('disetujui','terbit_dipa') or (penyetuju_id is not null and disetujui_at is not null)),
  check (status <> 'terbit_dipa' or ke_versi_id is not null)
);
comment on column keu_revisi.jenjang_berwenang is 'Jenjang pemberi persetujuan (satker/kanwil/pusat): DIISI ADMIN dari teks PMK 62/2023 jo 107/2024 jo 41/2026 terbaru, bukan konstanta.';
comment on table keu_revisi is 'Pengajuan revisi anggaran. Tiga jenis menurut ringkasan JDIH Kemenkeu: perubahan pagu, perubahan rincian, administratif.';

create table keu_revisi_baris (
  id              bigint generated always as identity primary key,
  revisi_id       bigint not null references keu_revisi(id),
  kunci_stabil    text not null,
  uraian          text,
  jumlah_sebelum  numeric(18,0) not null default 0,
  jumlah_sesudah  numeric(18,0) not null default 0,
  selisih         numeric(18,0) generated always as (jumlah_sesudah - jumlah_sebelum) stored,
  alasan_baris    text,
  unique (revisi_id, kunci_stabil)
);

-- Rencana penarikan dana bulanan per RO
create table keu_rpd (
  id          bigint generated always as identity primary key,
  ro_node_id  bigint not null references keu_pok_node(id),
  bulan       smallint not null check (bulan between 1 and 12),
  rencana     numeric(18,0) not null check (rencana >= 0),
  diubah_oleh bigint references sigap_akun(id),
  diubah_at   timestamptz not null default now(),
  unique (ro_node_id, bulan)
);

-- Transaksi: komitmen -> realisasi. Penjaga pagu memakai kunci baris detail.
create table keu_transaksi (
  id             bigint generated always as identity primary key,
  pok_detail_id  bigint not null references keu_pok_detail(id),
  kegiatan_id    bigint not null references sigap_kegiatan(id),
  penugasan_id   bigint references sigap_penugasan(id),
  jenis          text not null check (jenis in ('komitmen','realisasi')),
  komitmen_id    bigint references keu_transaksi(id),
  jumlah         numeric(18,0) not null check (jumlah > 0),
  tanggal        date not null,
  bukti_ref      text,
  dicatat_oleh   bigint not null references sigap_akun(id),
  diverifikasi_oleh bigint references sigap_akun(id),
  diverifikasi_at timestamptz,
  dibatalkan_at  timestamptz,
  alasan_batal   text,
  dibuat_at      timestamptz not null default now(),
  check (komitmen_id is null or jenis = 'realisasi'),
  check (diverifikasi_oleh is null or diverifikasi_oleh <> dicatat_oleh),
  check ((dibatalkan_at is null) = (alasan_batal is null))
);
create index keu_transaksi_detail_idx on keu_transaksi (pok_detail_id) where dibatalkan_at is null;
create index keu_transaksi_kegiatan_idx on keu_transaksi (kegiatan_id, tanggal);
comment on table keu_transaksi is 'Komitmen dan realisasi. Realisasi yang menunjuk komitmen menggantikan komitmen itu dalam hitungan terpakai. Tidak ada hapus; batalkan dengan alasan.';

create function keu_terpakai(p_detail bigint, p_kecuali bigint default null)
returns numeric language sql stable set search_path = public, pg_temp
as $$
  select coalesce(sum(t.jumlah), 0) from keu_transaksi t
  where t.pok_detail_id = p_detail and t.dibatalkan_at is null
    and (p_kecuali is null or t.id <> p_kecuali)
    and not (t.jenis = 'komitmen' and exists (
          select 1 from keu_transaksi r where r.komitmen_id = t.id and r.dibatalkan_at is null))
$$;

create function keu_transaksi_jaga_pagu() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare v_det record; v_kom numeric := 0; v_proyeksi numeric;
begin
  if new.dibatalkan_at is not null then return new; end if;
  select d.id, d.jumlah, d.tanda_blokir, v.status as status_versi into v_det
    from keu_pok_detail d join keu_pok_versi v on v.id = d.versi_id
    where d.id = new.pok_detail_id for update of d;
  if v_det.status_versi <> 'berlaku' then
    raise exception 'Baris POK berasal dari versi yang tidak berlaku; pindahkan ke versi berlaku' using errcode = 'check_violation';
  end if;
  if v_det.tanda_blokir then
    raise exception 'Baris POK diblokir (catatan khusus)' using errcode = 'check_violation';
  end if;
  if new.komitmen_id is not null then
    select jumlah into v_kom from keu_transaksi
      where id = new.komitmen_id and pok_detail_id = new.pok_detail_id and jenis = 'komitmen' and dibatalkan_at is null;
    if not found then
      raise exception 'Komitmen acuan tidak ditemukan pada baris yang sama' using errcode = 'check_violation';
    end if;
  end if;
  v_proyeksi := keu_terpakai(new.pok_detail_id, case when tg_op = 'UPDATE' then new.id end) - v_kom + new.jumlah;
  if v_proyeksi > v_det.jumlah then
    raise exception 'Melebihi pagu baris: pagu %, terpakai setelah transaksi %, lebih %', v_det.jumlah, v_proyeksi, v_proyeksi - v_det.jumlah
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger keu_transaksi_pagu_tr before insert or update of jumlah, pok_detail_id, dibatalkan_at, komitmen_id on keu_transaksi
  for each row execute function keu_transaksi_jaga_pagu();

-- View serapan (invoker: mengikuti RLS pemanggil)
create view keu_v_serapan with (security_invoker = true) as
select d.id as pok_detail_id, d.versi_id, d.kunci_stabil, d.uraian, d.jumlah as pagu,
       keu_terpakai(d.id) as terpakai,
       d.jumlah - keu_terpakai(d.id) as sisa,
       case when d.jumlah = 0 then null else round(100.0 * keu_terpakai(d.id) / d.jumlah, 1) end as persen
from keu_pok_detail d;

create view keu_v_selisih_pagu_node with (security_invoker = true) as
select n.id as node_id, n.versi_id, n.tingkat, n.kode, n.pagu,
       coalesce(c.jumlah_anak, 0) as jumlah_anak,
       n.pagu - coalesce(c.jumlah_anak, 0) as selisih
from keu_pok_node n
left join lateral (
  select sum(k.pagu) as jumlah_anak
  from keu_pok_node k where k.induk_id = n.id
) c on true
where n.tingkat <> 'akun';
comment on view keu_v_selisih_pagu_node is 'Deteksi POK tak konsisten: pagu induk harus sama dengan jumlah pagu anak (selisih 0).';

-- Jejak audit berantai pada objek keuangan
create trigger keu_rab_versi_jejak_tr after insert or update on keu_rab_versi
  for each row execute function tkl_catat_jejak();
create trigger keu_revisi_jejak_tr after insert or update on keu_revisi
  for each row execute function tkl_catat_jejak();
create trigger keu_transaksi_jejak_tr after insert or update on keu_transaksi
  for each row execute function tkl_catat_jejak();
create trigger keu_pejabat_jejak_tr after insert or update on keu_pejabat
  for each row execute function tkl_catat_jejak();

alter table keu_tahun_anggaran enable row level security;
alter table keu_pejabat        enable row level security;
alter table keu_pok_versi      enable row level security;
alter table keu_pok_node       enable row level security;
alter table keu_pok_detail     enable row level security;
alter table keu_sbm            enable row level security;
alter table keu_rab_versi      enable row level security;
alter table keu_rab_baris      enable row level security;
alter table keu_revisi         enable row level security;
alter table keu_revisi_baris   enable row level security;
alter table keu_rpd            enable row level security;
alter table keu_transaksi      enable row level security;
