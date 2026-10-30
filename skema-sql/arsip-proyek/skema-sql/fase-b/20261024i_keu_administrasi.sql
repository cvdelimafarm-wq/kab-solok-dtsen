-- =====================================================================
-- 20261024i_keu_administrasi.sql
-- Kertas Kerja Revisi POK (SIGAP) - FASE E: Administrasi per item POK.
-- Bergantung pada 20261024a-f dan h. Aman diulang. Tanpa DELETE/DROP.
--
--  Tiap item POK berlaku punya daftar dokumen yang harus dilengkapi. Daftarnya berasal dari
--  Master dokumen (keu_master_dok): lembar skema subject matter (per akun dan uraian) atau pola
--  umum (per akun). Per item per dokumen dicatat statusnya:
--      belum -> draf (dibuat SIGAP) -> terunggah -> terverifikasi ; terunggah/terverifikasi -> belum (dikembalikan)
--  Aturan (papan 15, mockup kk-adm.js):
--    * Tab Administrasi RO dibuka oleh: ketua tim / admin RO RO itu, PPK, bendahara, atau akun yang
--      diberi akses Administrasi (keu_akses_adm, per RO atau semua RO).
--    * Mengunggah: akun yang bertindak sebagai salah satu pihak dokumen (Tim Kerja, PBJ, Bendahara,
--      Perencanaan, Tata Usaha, PPK); PPK boleh semua dokumen.
--    * Memverifikasi: PPK semua dokumen; bendahara hanya dokumen yang melibatkan Bendahara; pemegang
--      kewenangan 'verifikasi' (pemberian PPK, mis. Tata Usaha) sesuai lingkup pemberiannya.
--      Pengunggah tidak boleh memverifikasi unggahannya sendiri (kecuali PPK).
--    * Mengembalikan (alasan wajib): dokumen terunggah oleh yang berhak memverifikasi; dokumen yang sudah
--      terverifikasi hanya oleh PPK.
--  Berkas fisik disimpan di penyimpanan aplikasi; basis data hanya mencatat nama, hash, ukuran, lokasi.
--  Kunci item = kunci_stabil POK, sehingga catatan tetap menempel setelah revisi POK (lewat alias kunci).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
-- penggantian lembar dokumen untuk satu item (bila aturan otomatis keliru)
create table if not exists keu_adm_peta (
  id            bigint generated always as identity primary key,
  kunci_stabil  text not null,
  ro_kode       text not null references keu_ro(kode),
  sumber        text not null check (sumber in ('pola','skema')),
  kode          text not null,
  seksi_huruf   text not null default '',
  catatan       text not null default '',
  diatur_oleh   bigint references sigap_akun(id),
  dibatalkan_at timestamptz,
  dibuat_at     timestamptz not null default now(),
  diubah_at     timestamptz not null default now()
);
create unique index if not exists keu_adm_peta_aktif_uq on keu_adm_peta(kunci_stabil) where dibatalkan_at is null;

create table if not exists keu_adm_dok (
  id               bigint generated always as identity primary key,
  kunci_stabil     text not null,
  ro_kode          text not null references keu_ro(kode),
  dok_id           bigint not null references keu_master_dok(id),
  status           text not null default 'belum' check (status in ('belum','draf','terunggah','terverifikasi')),
  berkas_nama      text,
  berkas_hash      text,
  berkas_ukuran    bigint,
  berkas_path      text,
  diunggah_oleh    bigint references sigap_akun(id),
  diunggah_at      timestamptz,
  diverifikasi_oleh bigint references sigap_akun(id),
  diverifikasi_at  timestamptz,
  diubah_oleh      bigint references sigap_akun(id),
  catatan          text not null default '',
  dibuat_at        timestamptz not null default now(),
  diubah_at        timestamptz not null default now(),
  constraint adm_dok_unik unique (kunci_stabil, dok_id),
  constraint adm_dok_berkas check (
    (status in ('terunggah','terverifikasi')
       and length(btrim(coalesce(berkas_nama, ''))) >= 3
       and berkas_hash ~ '^[0-9a-f]{64}$'
       and berkas_ukuran > 0
       and length(btrim(coalesce(berkas_path, ''))) >= 3
       and diunggah_oleh is not null and diunggah_at is not null)
    or (status in ('belum','draf')
       and berkas_nama is null and berkas_hash is null and berkas_ukuran is null and berkas_path is null
       and diunggah_oleh is null and diunggah_at is null)),
  constraint adm_dok_verifikasi check (
    (status = 'terverifikasi' and diverifikasi_oleh is not null and diverifikasi_at is not null)
    or (status <> 'terverifikasi' and diverifikasi_oleh is null and diverifikasi_at is null))
);
create index if not exists keu_adm_dok_ro_idx on keu_adm_dok(ro_kode);
create index if not exists keu_adm_dok_dok_idx on keu_adm_dok(dok_id);

-- riwayat hanya bertambah
create table if not exists keu_adm_riwayat (
  id           bigint generated always as identity primary key,
  adm_id       bigint not null references keu_adm_dok(id),
  kunci_stabil text not null,
  ro_kode      text not null,
  dok_id       bigint not null references keu_master_dok(id),
  aksi         text not null check (aksi in ('draf','unggah','verifikasi','kembalikan')),
  dari_status  text not null,
  ke_status    text not null,
  oleh         bigint references sigap_akun(id),
  berkas_nama  text,
  berkas_hash  text,
  berkas_ukuran bigint,
  catatan      text not null default '',
  at           timestamptz not null default now()
);
create index if not exists keu_adm_riwayat_adm_idx on keu_adm_riwayat(adm_id, at);

-- ---------------------------------------------------------------------
-- 2. Penjaga tabel: perubahan hanya lewat fungsi alur (dari aplikasi)
-- ---------------------------------------------------------------------
create or replace function keu_adm_jaga()
returns trigger language plpgsql set search_path = public as $$
declare v_fungsi boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if keu_akun_sesi() is not null then
    if tg_op = 'DELETE' then
      raise exception 'Hapus permanen tidak diizinkan dari aplikasi (tabel %).', tg_table_name using errcode = '42501';
    end if;
    if not v_fungsi then
      raise exception 'Tabel % hanya dapat diubah melalui fungsi alur Administrasi.', tg_table_name using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function keu_adm_dok_cek()
returns trigger language plpgsql set search_path = public as $$
declare v_fungsi boolean := coalesce(current_setting('keu.via_fungsi', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.status <> 'belum' then
      raise exception 'Catatan dokumen baru harus berstatus belum' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.dok_id <> old.dok_id then
    raise exception 'Dokumen master pada catatan administrasi tidak dapat diganti' using errcode = '23514';
  end if;
  if (new.kunci_stabil <> old.kunci_stabil or new.ro_kode <> old.ro_kode) and not v_fungsi then
    raise exception 'Kunci item dan RO hanya dapat dipindah oleh fungsi alur (pengikatan ulang setelah revisi POK)' using errcode = '23514';
  end if;
  if new.status <> old.status and not (
       (old.status = 'belum'         and new.status in ('draf','terunggah'))
    or (old.status = 'draf'          and new.status = 'terunggah')
    or (old.status = 'terunggah'     and new.status in ('terverifikasi','belum'))
    or (old.status = 'terverifikasi' and new.status = 'belum')) then
    raise exception 'Perpindahan status % -> % tidak diizinkan', old.status, new.status using errcode = '23514';
  end if;
  new.diubah_at := now();
  return new;
end $$;

create or replace function keu_adm_peta_cek()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.kunci_stabil, new.ro_kode, new.sumber, new.kode, new.seksi_huruf)
       is distinct from (old.kunci_stabil, old.ro_kode, old.sumber, old.kode, old.seksi_huruf) then
    raise exception 'Pengaturan lembar tidak diubah; batalkan lalu buat yang baru' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from keu_master_dok m
                 where m.sumber = new.sumber and m.kode = new.kode and m.seksi_huruf = new.seksi_huruf and m.aktif) then
    raise exception 'Lembar dokumen % % % tidak ada (atau tidak aktif) di Master dokumen', new.sumber, new.kode, new.seksi_huruf using errcode = '23503';
  end if;
  new.diubah_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Penentuan lembar dokumen dari akun dan uraian (aturan dari mockup kk-adm.js, jenisKel)
-- ---------------------------------------------------------------------
create or replace function keu_adm_tentukan(p_akun text, p_uraian text)
returns table(sumber text, kode text, seksi_huruf text, alasan text)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare u text := lower(coalesce(p_uraian, '')); h text := null; a text := btrim(coalesce(p_akun, '')); k text := btrim(coalesce(p_akun, ''));
begin
  if u ~ 'lembur' then
    k := 'Lembur'; h := '';
  elsif a = '521211' then
    h := case when u ~ 'konsumsi' then 'A'
              when u ~ 'spanduk|baliho|banner' then 'C'
              when u ~ 'pulsa|paket data|kuota' then 'D'
              when u ~ 'perlengkapan|atk|penggandaan|cetak|fotokopi|bahan' then 'B'
              else 'A' end;
  elsif a = '521213' then
    h := case when u ~ 'camat|kepala desa|kades|penunjuk jalan' then 'B'
              when u ~ 'inda|innas|pengajar|instruktur' then 'C'
              when u ~ 'pns bps|organik|pegawai' then 'E'
              when u ~ 'tim pelaksana|pokja|panitia' then 'A'
              else 'D' end;
  elsif a = '524113' then
    h := case when u ~ 'lebih dari 8|> ?8 jam|daerah sulit' then 'B' else 'A' end;
  elsif a in ('524114','524119') then
    h := case when u ~ 'fullboard|fullday|halfday|paket meeting|penyelenggaraan|hotel|ruang rapat' then 'B' else 'A' end;
  elsif a = '524111' then
    h := 'A';
  elsif a in ('521811','521219','522141','522151','522191') then
    h := '';
  end if;

  if h is not null and exists (select 1 from keu_master_dok m
                               where m.sumber = 'skema' and m.kode = k and m.seksi_huruf = h and m.aktif) then
    return query select 'skema'::text, k, h,
      case when k = 'Lembur' then 'uraian memuat kata lembur'
           when h = '' then 'akun ' || a else 'akun ' || a || ' dan uraian' end;
    return;
  end if;
  -- tanpa lembar subject matter: pola umum menurut akun
  return query
    select 'pola'::text, ak.pola_kode, ''::text, ('pola umum Master untuk akun ' || a)::text
    from keu_master_akun ak
    where ak.kode = a
      and exists (select 1 from keu_master_dok m where m.sumber = 'pola' and m.kode = ak.pola_kode and m.aktif);
end $$;

-- lembar satu detail POK: pengaturan khusus (peta) lebih dulu, lalu aturan otomatis
create or replace function keu_adm_lembar(p_detail bigint)
returns table(sumber text, kode text, seksi_huruf text, asal text, alasan text)
language plpgsql stable set search_path = public as $$
#variable_conflict use_column
declare d record; p record; j record;
begin
  select dt.kunci_stabil, dt.uraian into d from keu_pok_detail dt where dt.id = p_detail;
  if not found then return; end if;
  select pt.sumber, pt.kode, pt.seksi_huruf, pt.catatan into p
    from keu_adm_peta pt
    where pt.dibatalkan_at is null and keu_kunci_resolusi(pt.kunci_stabil) = d.kunci_stabil
    order by pt.id desc limit 1;
  if found then
    return query select p.sumber, p.kode, p.seksi_huruf, 'peta'::text,
                        case when p.catatan = '' then 'diatur khusus untuk item ini' else p.catatan end;
    return;
  end if;
  select * into j from keu_pok_detail_jalur(p_detail);
  return query select t.sumber, t.kode, t.seksi_huruf, case when t.sumber = 'pola' then 'pola' else 'aturan' end, t.alasan
               from keu_adm_tentukan(j.akun_kode, d.uraian) t;
end $$;

-- ---------------------------------------------------------------------
-- 4. Hak akses (definer; dipakai fungsi alur dan aplikasi)
-- ---------------------------------------------------------------------
-- tab Administrasi RO dapat dibuka
create or replace function keu_adm_buka(p_akun bigint, p_ro text, p_tgl date default current_date)
returns boolean language sql stable security definer set search_path = public as $$
  select p_akun is not null
     and exists (select 1 from sigap_akun a where a.id = p_akun and a.aktif)
     and (
       exists (select 1 from keu_penugasan t
               join keu_master_peran pr on pr.kode = t.peran_kode and pr.aktif
               where t.akun_id = p_akun and t.dibatalkan_at is null and t.masa @> p_tgl
                 and (t.peran_kode in ('PPK','BEND')
                      or (t.peran_kode in ('KETUA','ADMINRO') and t.ro_kode = p_ro)))
       or exists (select 1 from keu_akses_adm x
                  where x.akun_id = p_akun and x.dibatalkan_at is null and x.masa @> p_tgl
                    and (x.ro_kode is null or x.ro_kode = p_ro))
     )
$$;

-- daftar RO yang dapat dibuka akun (untuk daftar RO di aplikasi)
create or replace function keu_adm_ro_terbuka(p_akun bigint, p_tgl date default current_date)
returns table(ro_kode text) language sql stable security definer set search_path = public as $$
  select r.kode from keu_ro r
  where r.aktif and keu_adm_buka(p_akun, r.kode, p_tgl)
$$;

-- akun bertindak sebagai salah satu pihak dokumen (hak mengunggah / membuat draf)
create or replace function keu_adm_boleh_unggah(p_akun bigint, p_ro text, p_pihak text[], p_tgl date default current_date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_ada boolean;
begin
  if not keu_adm_buka(p_akun, p_ro, p_tgl) then return false; end if;
  select exists (
    select 1 from keu_penugasan t
    where t.akun_id = p_akun and t.dibatalkan_at is null and t.masa @> p_tgl
      and (
        t.peran_kode = 'PPK'
        or (t.peran_kode in ('KETUA','ADMINRO') and t.ro_kode = p_ro and 'Tim Kerja' = any(p_pihak))
        or (t.peran_kode = 'PBJ' and (t.ro_kode is null or t.ro_kode = p_ro) and 'PBJ' = any(p_pihak))
        or (t.peran_kode = 'BEND' and 'Bendahara' = any(p_pihak))
        or (t.peran_kode = 'RENC' and 'Perencanaan' = any(p_pihak))
        or (t.peran_kode = 'TU' and 'Tata Usaha' = any(p_pihak))
      )
  ) or ('Tim Kerja' = any(p_pihak) and exists (
    select 1 from keu_akses_adm x
    where x.akun_id = p_akun and x.dibatalkan_at is null and x.masa @> p_tgl and x.ro_kode = p_ro
  )) into v_ada;
  return v_ada;
end $$;

-- hak memverifikasi (dan mengembalikan dokumen terunggah)
create or replace function keu_adm_boleh_verif(p_akun bigint, p_ro text, p_pihak text[], p_tgl date default current_date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_ppk boolean; v_bend boolean; v_pem boolean;
begin
  if not keu_adm_buka(p_akun, p_ro, p_tgl) then return false; end if;
  select exists (select 1 from keu_penugasan t where t.akun_id = p_akun and t.peran_kode = 'PPK'
                   and t.dibatalkan_at is null and t.masa @> p_tgl),
         exists (select 1 from keu_penugasan t where t.akun_id = p_akun and t.peran_kode = 'BEND'
                   and t.dibatalkan_at is null and t.masa @> p_tgl)
    into v_ppk, v_bend;
  if v_ppk then return true; end if;
  v_pem := keu_boleh(p_akun, 'verifikasi', p_ro, p_tgl)
           and exists (select 1 from keu_pemberian g
                       where g.akun_id = p_akun and g.kewenangan_kode = 'verifikasi' and g.dibatalkan_at is null
                         and g.masa @> p_tgl and (g.ro_kode is null or g.ro_kode = p_ro));
  if v_pem then return true; end if;
  return v_bend and 'Bendahara' = any(p_pihak);
end $$;

-- ---------------------------------------------------------------------
-- 5. Fungsi alur
-- ---------------------------------------------------------------------
-- 5a. aksi pada satu dokumen satu item: draf | unggah | verifikasi | kembalikan
--     p_berkas (untuk unggah): {"nama": "...", "hash": "<sha256 hex>", "ukuran": 12345, "path": "bucket/..."}
create or replace function keu_adm_aksi(p_detail bigint, p_dok bigint, p_aksi text, p_berkas jsonb default null,
                                        p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare
  d record; j record; lm record; m record; a keu_adm_dok%rowtype;
  v_cat text := btrim(coalesce(p_catatan, ''));
  v_dari text; v_ke text; v_ppk boolean;
  v_nama text; v_hash text; v_uk bigint; v_path text;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if p_aksi not in ('draf','unggah','verifikasi','kembalikan') then
    raise exception 'Aksi % tidak dikenal', p_aksi using errcode = '22023';
  end if;
  select dt.id, dt.kunci_stabil into d
    from keu_pok_detail dt join keu_pok_versi pv on pv.id = dt.versi_id and pv.status = 'berlaku'
    where dt.id = p_detail;
  if not found then raise exception 'Item % bukan bagian dari POK yang berlaku', p_detail using errcode = '23514'; end if;
  select * into j from keu_pok_detail_jalur(p_detail);
  select * into lm from keu_adm_lembar(p_detail);
  if not found then raise exception 'Item ini belum punya lembar dokumen (akun % tanpa pola di Master)', j.akun_kode using errcode = '23514'; end if;
  select * into m from keu_master_dok md
    where md.id = p_dok and md.aktif and md.sumber = lm.sumber and md.kode = lm.kode and md.seksi_huruf = lm.seksi_huruf;
  if not found then raise exception 'Dokumen % bukan bagian dari kelengkapan item ini', p_dok using errcode = '23514'; end if;
  if not keu_adm_buka(p_akun, j.ro_kode) then
    raise exception 'Akun % tidak memiliki akses Administrasi pada RO %', p_akun, j.ro_kode using errcode = '42501';
  end if;

  perform set_config('keu.via_fungsi', '1', true);
  select * into a from keu_adm_dok x
    where x.dok_id = p_dok and (x.kunci_stabil = d.kunci_stabil or keu_kunci_resolusi(x.kunci_stabil) = d.kunci_stabil)
    order by (x.kunci_stabil = d.kunci_stabil) desc, x.id limit 1 for update;
  if not found then
    insert into keu_adm_dok(kunci_stabil, ro_kode, dok_id, diubah_oleh) values (d.kunci_stabil, j.ro_kode, p_dok, p_akun)
    returning * into a;
  elsif a.kunci_stabil <> d.kunci_stabil or a.ro_kode <> j.ro_kode then
    update keu_adm_dok set kunci_stabil = d.kunci_stabil, ro_kode = j.ro_kode where id = a.id returning * into a;
  end if;
  v_dari := a.status;
  select exists (select 1 from keu_penugasan t where t.akun_id = p_akun and t.peran_kode = 'PPK'
                   and t.dibatalkan_at is null and t.masa @> current_date) into v_ppk;

  if p_aksi = 'draf' then
    if not m.gen then raise exception 'Dokumen "%" tidak dapat dibuat SIGAP; unggah berkasnya', m.uraian using errcode = '23514'; end if;
    if not keu_adm_boleh_unggah(p_akun, j.ro_kode, m.pihak) then
      raise exception 'Akun % bukan pihak dokumen "%"', p_akun, m.uraian using errcode = '42501';
    end if;
    if a.status not in ('belum','draf') then
      raise exception 'Draf hanya dapat dibuat untuk dokumen yang belum diunggah (status %)', a.status using errcode = '23514';
    end if;
    v_ke := 'draf';
    update keu_adm_dok set status = 'draf', diubah_oleh = p_akun, catatan = v_cat where id = a.id;

  elsif p_aksi = 'unggah' then
    if not keu_adm_boleh_unggah(p_akun, j.ro_kode, m.pihak) then
      raise exception 'Akun % bukan pihak dokumen "%"', p_akun, m.uraian using errcode = '42501';
    end if;
    if a.status = 'terverifikasi' then
      raise exception 'Dokumen sudah terverifikasi; PPK harus mengembalikannya dulu' using errcode = '23514';
    end if;
    if p_berkas is null or jsonb_typeof(p_berkas) <> 'object' then
      raise exception 'Data berkas wajib diisi (nama, hash, ukuran, path)' using errcode = '23514';
    end if;
    v_nama := btrim(coalesce(p_berkas ->> 'nama', ''));
    v_hash := lower(coalesce(p_berkas ->> 'hash', ''));
    v_path := btrim(coalesce(p_berkas ->> 'path', ''));
    begin v_uk := (p_berkas ->> 'ukuran')::bigint; exception when others then v_uk := null; end;
    if length(v_nama) < 3 then raise exception 'Nama berkas tidak sah' using errcode = '23514'; end if;
    if v_hash !~ '^[0-9a-f]{64}$' then raise exception 'Hash berkas harus SHA-256 (64 heksadesimal)' using errcode = '23514'; end if;
    if v_uk is null or v_uk <= 0 then raise exception 'Ukuran berkas tidak sah' using errcode = '23514'; end if;
    if length(v_path) < 3 then raise exception 'Lokasi berkas tidak sah' using errcode = '23514'; end if;
    v_ke := 'terunggah';
    update keu_adm_dok set status = 'terunggah', berkas_nama = v_nama, berkas_hash = v_hash, berkas_ukuran = v_uk,
           berkas_path = v_path, diunggah_oleh = p_akun, diunggah_at = now(), diubah_oleh = p_akun, catatan = v_cat
     where id = a.id;

  elsif p_aksi = 'verifikasi' then
    if a.status <> 'terunggah' then
      raise exception 'Hanya dokumen terunggah yang dapat diverifikasi (status %)', a.status using errcode = '23514';
    end if;
    if not keu_adm_boleh_verif(p_akun, j.ro_kode, m.pihak) then
      raise exception 'Akun % tidak berwenang memverifikasi dokumen "%"', p_akun, m.uraian using errcode = '42501';
    end if;
    if a.diunggah_oleh = p_akun and not v_ppk then
      raise exception 'Pengunggah tidak boleh memverifikasi unggahannya sendiri (kecuali PPK)' using errcode = '42501';
    end if;
    v_ke := 'terverifikasi';
    update keu_adm_dok set status = 'terverifikasi', diverifikasi_oleh = p_akun, diverifikasi_at = now(),
           diubah_oleh = p_akun, catatan = v_cat
     where id = a.id;

  else -- kembalikan
    if a.status not in ('terunggah','terverifikasi') then
      raise exception 'Hanya dokumen terunggah atau terverifikasi yang dapat dikembalikan (status %)', a.status using errcode = '23514';
    end if;
    if a.status = 'terverifikasi' and not v_ppk then
      raise exception 'Dokumen yang sudah terverifikasi hanya dapat dikembalikan oleh PPK' using errcode = '42501';
    end if;
    if not keu_adm_boleh_verif(p_akun, j.ro_kode, m.pihak) then
      raise exception 'Akun % tidak berwenang mengembalikan dokumen "%"', p_akun, m.uraian using errcode = '42501';
    end if;
    if length(v_cat) < 5 then raise exception 'Alasan pengembalian wajib diisi (minimal 5 huruf)' using errcode = '23514'; end if;
    v_ke := 'belum';
    update keu_adm_dok set status = 'belum', berkas_nama = null, berkas_hash = null, berkas_ukuran = null, berkas_path = null,
           diunggah_oleh = null, diunggah_at = null, diverifikasi_oleh = null, diverifikasi_at = null,
           diubah_oleh = p_akun, catatan = v_cat
     where id = a.id;
  end if;

  insert into keu_adm_riwayat(adm_id, kunci_stabil, ro_kode, dok_id, aksi, dari_status, ke_status, oleh,
                              berkas_nama, berkas_hash, berkas_ukuran, catatan)
  values (a.id, d.kunci_stabil, j.ro_kode, p_dok, p_aksi, v_dari, v_ke, p_akun,
          case when p_aksi in ('unggah') then v_nama else a.berkas_nama end,
          case when p_aksi in ('unggah') then v_hash else a.berkas_hash end,
          case when p_aksi in ('unggah') then v_uk else a.berkas_ukuran end,
          v_cat);
  perform set_config('keu.via_fungsi', '', true);
  return a.id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_adm_aksi(bigint, bigint, text, jsonb, text, bigint) from public, anon, authenticated;

-- 5b. mengatur lembar khusus satu item (bila aturan otomatis keliru)
create or replace function keu_adm_peta_atur(p_detail bigint, p_sumber text, p_kode text, p_huruf text default '',
                                             p_catatan text default '', p_akun bigint default keu_akun_sesi())
returns bigint language plpgsql security definer set search_path = public as $$
declare d record; j record; v_id bigint;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select dt.id, dt.kunci_stabil into d
    from keu_pok_detail dt join keu_pok_versi pv on pv.id = dt.versi_id and pv.status = 'berlaku' where dt.id = p_detail;
  if not found then raise exception 'Item % bukan bagian dari POK yang berlaku', p_detail using errcode = '23514'; end if;
  select * into j from keu_pok_detail_jalur(p_detail);
  if not (keu_boleh(p_akun, 'sahkan') or keu_boleh(p_akun, 'rab', j.ro_kode) or keu_boleh(p_akun, 'draf', j.ro_kode)) then
    raise exception 'Akun % tidak berwenang mengatur lembar dokumen RO %', p_akun, j.ro_kode using errcode = '42501';
  end if;
  if exists (select 1 from keu_adm_dok x
             where x.status in ('terunggah','terverifikasi')
               and (x.kunci_stabil = d.kunci_stabil or keu_kunci_resolusi(x.kunci_stabil) = d.kunci_stabil)) then
    raise exception 'Item sudah punya dokumen terunggah atau terverifikasi; kembalikan dulu sebelum mengganti lembar' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_adm_peta set dibatalkan_at = now()
   where dibatalkan_at is null and keu_kunci_resolusi(kunci_stabil) = d.kunci_stabil;
  insert into keu_adm_peta(kunci_stabil, ro_kode, sumber, kode, seksi_huruf, catatan, diatur_oleh)
  values (d.kunci_stabil, j.ro_kode, p_sumber, p_kode, coalesce(p_huruf, ''), btrim(coalesce(p_catatan, '')), p_akun)
  returning id into v_id;
  perform set_config('keu.via_fungsi', '', true);
  return v_id;
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_adm_peta_atur(bigint, text, text, text, text, bigint) from public, anon, authenticated;

-- 5c. mencabut pengaturan khusus (kembali ke aturan otomatis)
create or replace function keu_adm_peta_lepas(p_detail bigint, p_akun bigint default keu_akun_sesi())
returns void language plpgsql security definer set search_path = public as $$
declare d record; j record;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  select dt.id, dt.kunci_stabil into d
    from keu_pok_detail dt join keu_pok_versi pv on pv.id = dt.versi_id and pv.status = 'berlaku' where dt.id = p_detail;
  if not found then raise exception 'Item % bukan bagian dari POK yang berlaku', p_detail using errcode = '23514'; end if;
  select * into j from keu_pok_detail_jalur(p_detail);
  if not (keu_boleh(p_akun, 'sahkan') or keu_boleh(p_akun, 'rab', j.ro_kode) or keu_boleh(p_akun, 'draf', j.ro_kode)) then
    raise exception 'Akun % tidak berwenang mengatur lembar dokumen RO %', p_akun, j.ro_kode using errcode = '42501';
  end if;
  if exists (select 1 from keu_adm_dok x
             where x.status in ('terunggah','terverifikasi')
               and (x.kunci_stabil = d.kunci_stabil or keu_kunci_resolusi(x.kunci_stabil) = d.kunci_stabil)) then
    raise exception 'Item sudah punya dokumen terunggah atau terverifikasi; kembalikan dulu sebelum mengganti lembar' using errcode = '23514';
  end if;
  perform set_config('keu.via_fungsi', '1', true);
  update keu_adm_peta set dibatalkan_at = now()
   where dibatalkan_at is null and keu_kunci_resolusi(kunci_stabil) = d.kunci_stabil;
  perform set_config('keu.via_fungsi', '', true);
exception when others then
  perform set_config('keu.via_fungsi', '', true);
  raise;
end $$;
revoke execute on function keu_adm_peta_lepas(bigint, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. View
-- ---------------------------------------------------------------------
-- item POK berlaku beserta lembar dokumennya
create or replace view keu_v_adm_lembar with (security_invoker = true) as
with p as (
  select distinct on (x.kk) x.kk, x.sumber, x.kode, x.seksi_huruf
  from (select keu_kunci_resolusi(pt.kunci_stabil) as kk, pt.id, pt.sumber, pt.kode, pt.seksi_huruf
        from keu_adm_peta pt where pt.dibatalkan_at is null) x
  order by x.kk, x.id desc
)
select dt.id as detail_id, pv.tahun, j.ro_kode, j.komponen_kode, j.akun_kode, dt.kunci_stabil, dt.nomor_item,
       dt.uraian, dt.volume, dt.satuan, dt.jumlah,
       coalesce(p.sumber, t.sumber) as sumber, coalesce(p.kode, t.kode) as lembar_kode,
       coalesce(p.seksi_huruf, t.seksi_huruf) as seksi_huruf,
       case when p.kk is not null then 'peta' when t.sumber = 'pola' then 'pola' when t.sumber is not null then 'aturan' end as asal,
       t.alasan as alasan_aturan
from keu_pok_detail dt
join keu_pok_versi pv on pv.id = dt.versi_id and pv.status = 'berlaku'
cross join lateral keu_pok_detail_jalur(dt.id) j
left join p on p.kk = dt.kunci_stabil
left join lateral keu_adm_tentukan(j.akun_kode, dt.uraian) t on true;
comment on view keu_v_adm_lembar is 'Item POK berlaku dan lembar dokumen yang dipakainya (peta khusus, aturan skema, atau pola umum). sumber kosong = tanpa lembar.';

-- satu baris per item per dokumen yang harus dilengkapi
create or replace view keu_v_adm_dokumen with (security_invoker = true) as
with a as (
  select distinct on (y.kunci_now, y.dok_id) y.*
  from (select keu_kunci_resolusi(x.kunci_stabil) as kunci_now, x.* from keu_adm_dok x) y
  order by y.kunci_now, y.dok_id, y.diubah_at desc, y.id desc
)
select l.detail_id, l.tahun, l.ro_kode, l.komponen_kode, l.akun_kode, l.kunci_stabil, l.nomor_item,
       l.uraian as uraian_item, l.jumlah, l.sumber, l.lembar_kode, l.seksi_huruf, l.asal,
       m.id as dok_id, m.seksi_urut, m.seksi_judul, m.no, m.uraian as uraian_dok, m.pihak, m.ket, m.gen,
       a.id as adm_id, coalesce(a.status, 'belum') as status,
       a.berkas_nama, a.berkas_hash, a.berkas_ukuran, a.berkas_path,
       a.diunggah_oleh, a.diunggah_at, a.diverifikasi_oleh, a.diverifikasi_at, a.catatan
from keu_v_adm_lembar l
join keu_master_dok m on m.sumber = l.sumber and m.kode = l.lembar_kode and m.seksi_huruf = l.seksi_huruf and m.aktif
left join a on a.kunci_now = l.kunci_stabil and a.dok_id = m.id;
comment on view keu_v_adm_dokumen is 'Daftar dokumen kelengkapan per item POK berlaku, dengan status (belum bila belum ada catatan).';

create or replace view keu_v_adm_item with (security_invoker = true) as
select l.detail_id, l.tahun, l.ro_kode, l.komponen_kode, l.akun_kode, l.kunci_stabil, l.nomor_item, l.uraian, l.jumlah,
       l.sumber, l.lembar_kode, l.seksi_huruf, l.asal,
       count(d.dok_id) as n_dok,
       count(*) filter (where d.status = 'belum') as n_belum,
       count(*) filter (where d.status = 'draf') as n_draf,
       count(*) filter (where d.status = 'terunggah') as n_terunggah,
       count(*) filter (where d.status = 'terverifikasi') as n_terverifikasi,
       case when count(d.dok_id) = 0 then 'tanpa_dokumen'
            when count(*) filter (where d.status = 'terverifikasi') = count(d.dok_id) then 'lengkap'
            when count(*) filter (where d.status in ('belum','draf')) = 0 then 'diperiksa'
            when count(*) filter (where d.status <> 'belum') > 0 then 'berjalan'
            else 'belum' end as status_item
from keu_v_adm_lembar l
left join keu_v_adm_dokumen d on d.detail_id = l.detail_id
group by l.detail_id, l.tahun, l.ro_kode, l.komponen_kode, l.akun_kode, l.kunci_stabil, l.nomor_item, l.uraian, l.jumlah,
         l.sumber, l.lembar_kode, l.seksi_huruf, l.asal;
comment on view keu_v_adm_item is 'Kelengkapan administrasi per item POK berlaku: lengkap | diperiksa (semua terunggah, sebagian belum diverifikasi) | berjalan | belum | tanpa_dokumen.';

create or replace view keu_v_adm_ringkas with (security_invoker = true) as
select i.tahun, i.ro_kode,
       count(*) as n_item,
       count(*) filter (where i.status_item = 'lengkap') as n_item_lengkap,
       count(*) filter (where i.status_item = 'tanpa_dokumen') as n_item_tanpa_dokumen,
       sum(i.jumlah) as jumlah_item,
       sum(i.jumlah) filter (where i.status_item = 'lengkap') as jumlah_lengkap,
       sum(i.n_dok) as n_dok,
       sum(i.n_belum) as n_belum, sum(i.n_draf) as n_draf, sum(i.n_terunggah) as n_terunggah, sum(i.n_terverifikasi) as n_terverifikasi,
       case when sum(i.n_dok) = 0 then null else round(100.0 * sum(i.n_terverifikasi) / sum(i.n_dok), 1) end as persen_terverifikasi
from keu_v_adm_item i
group by i.tahun, i.ro_kode;
comment on view keu_v_adm_ringkas is 'Ringkasan administrasi per RO (POK berlaku).';

-- ---------------------------------------------------------------------
-- 7. Trigger, RLS, hak
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_adm_peta'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_adm_peta for each row execute function keu_adm_peta_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_adm_peta for each row execute function keu_adm_jaga();
    create trigger keu_t9_jejak after insert or update on keu_adm_peta for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_adm_dok'::regclass and tgname = 'keu_t0_cek') then
    create trigger keu_t0_cek before insert or update on keu_adm_dok for each row execute function keu_adm_dok_cek();
    create trigger keu_t1_jaga before insert or update or delete on keu_adm_dok for each row execute function keu_adm_jaga();
    create trigger keu_t9_jejak after insert or update on keu_adm_dok for each row execute function keu_jejak();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_adm_riwayat'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_adm_riwayat for each row execute function keu_adm_jaga();
    create trigger keu_t2_catat before update or delete on keu_adm_riwayat for each row execute function keu_catat_saja();
  end if;
end $$;

do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relname in ('keu_adm_peta','keu_adm_dok','keu_adm_riwayat')
  loop
    execute format('alter table %I enable row level security', r.relname);
    execute format('revoke all on table %I from anon, authenticated', r.relname);
    execute format('grant all on table %I to service_role', r.relname);
  end loop;
end $$;
revoke execute on function keu_adm_buka(bigint, text, date), keu_adm_ro_terbuka(bigint, date),
                           keu_adm_boleh_unggah(bigint, text, text[], date), keu_adm_boleh_verif(bigint, text, text[], date)
  from public, anon, authenticated;
revoke execute on function keu_adm_tentukan(text, text), keu_adm_lembar(bigint), keu_adm_jaga(), keu_adm_dok_cek(), keu_adm_peta_cek()
  from public, anon, authenticated;
grant execute on function keu_adm_tentukan(text, text), keu_adm_lembar(bigint) to service_role;
revoke all on keu_v_adm_lembar, keu_v_adm_dokumen, keu_v_adm_item, keu_v_adm_ringkas from anon, authenticated;
grant select on keu_v_adm_lembar, keu_v_adm_dokumen, keu_v_adm_item, keu_v_adm_ringkas to service_role;
