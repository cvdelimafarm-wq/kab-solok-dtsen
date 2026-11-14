-- skema-sql/20261114v_keputusan_tercatat.sql
--
-- (14 Nov 2026) Lingkar keputusan, langkah berikut sesudah Ruang keputusan baca-saja (Fase 7, mockup C8; peta sumber data H1: "Keputusan
-- pimpinan: belum ada"): sinyal -> pilihan -> pemutus -> KEPUTUSAN TERCATAT (pilihan, alasan, siapa, kapan) -> butir kerja di Delego ->
-- evaluasi (apakah sinyalnya hilang).
--
--  - Tabel keu_keputusan, tanpa hapus (pembatalan beralasan). Tiap keputusan menempel pada satu sinyal lewat `sinyal_kunci`
--    (mis. 'gap:12:3', 'spk:7', 'esk:55', 'sanggah:9', 'usulan:44', 'catat:2026-11-09').
--  - keu_keputusan_catat: hanya Kepala/pemutus atau pemberi delegasi; alasan wajib (>= 10 huruf). Bila diminta, sekaligus menerbitkan
--    butir kerja lewat keu_dlg_buat (aturan, hak, dan pemberitahuan delegasi tetap milik keu_dlg_buat).
--  - keu_keputusan_evaluasi, keu_keputusan_batal, keu_keputusan_bahan (daftar, KPI, calon penerima, pekerjaan tim).
--  - keu_ruang_keputusan diganti dengan versi yang sama ditambah `kunci`, `ident_id`, dan keputusan terakhir pada tiap butir sinyal.
-- Sistem menyarankan, manusia memutuskan: tidak ada keputusan otomatis.

begin;

create table if not exists keu_keputusan (
  id               bigserial primary key,
  sinyal_kode      text not null check (sinyal_kode in ('naik_kepala','sanggah','gap_keras','spk','usulan','tanpa_catatan','lainnya')),
  sinyal_kunci     text not null check (char_length(sinyal_kunci) between 1 and 120),
  judul            text not null check (char_length(btrim(judul)) between 3 and 200),
  ringkas          text not null default '',
  ident_id         bigint references keu_ident(id),
  pilihan          text not null check (char_length(btrim(pilihan)) between 3 and 300),
  alasan           text not null check (char_length(btrim(alasan)) >= 10),
  pemutus_akun     bigint not null references sigap_akun(id),
  pemutus_peran    text not null default '',
  diputus_at       timestamptz not null default now(),
  delegasi_ids     bigint[] not null default '{}',
  evaluasi_hasil   text check (evaluasi_hasil in ('sinyal_hilang','masih_ada','lainnya')),
  evaluasi_catatan text,
  dievaluasi_oleh  bigint references sigap_akun(id),
  dievaluasi_at    timestamptz,
  dibatalkan_at    timestamptz,
  dibatalkan_oleh  bigint references sigap_akun(id),
  alasan_batal     text
);
create index if not exists keu_keputusan_kunci on keu_keputusan(sinyal_kunci) where dibatalkan_at is null;
comment on table keu_keputusan is 'Keputusan pimpinan atas sinyal Ruang keputusan: pilihan, alasan, pemutus, butir kerja, evaluasi. Tanpa hapus.';
alter table keu_keputusan enable row level security;
revoke all on table keu_keputusan from anon, authenticated, public;
grant all on table keu_keputusan to service_role;
revoke all on sequence keu_keputusan_id_seq from anon, authenticated, public;
grant usage, select on sequence keu_keputusan_id_seq to service_role;

create or replace function keu_keputusan_boleh(p_akun bigint) returns boolean language sql stable security definer set search_path = public as $f$
  select p_akun is not null and (keu_dlg_putus_ok(p_akun) or coalesce(keu_boleh(p_akun, 'delegasi_beri'), false))
$f$;
revoke execute on function keu_keputusan_boleh(bigint) from public, anon, authenticated;

-- Keputusan terakhir (belum dibatalkan) per kunci, ringkas untuk ditempel di sinyal.
create or replace function keu_keputusan_ringkas(p_kunci text) returns jsonb language sql stable security definer set search_path = public as $f$
  select jsonb_build_object('id', k.id, 'pilihan', k.pilihan, 'diputus_at', k.diputus_at, 'pemutus', a.nama,
           'butir', cardinality(k.delegasi_ids),
           'butir_selesai', (select count(*) from keu_dlg_delegasi d where d.id = any (k.delegasi_ids) and d.status in ('selesai','batal')),
           'evaluasi', k.evaluasi_hasil)
  from keu_keputusan k join sigap_akun a on a.id = k.pemutus_akun
  where k.sinyal_kunci = p_kunci and k.dibatalkan_at is null
  order by k.diputus_at desc limit 1
$f$;
revoke execute on function keu_keputusan_ringkas(text) from public, anon, authenticated;

create or replace function keu_keputusan_catat(
  p_sinyal text, p_kunci text, p_judul text, p_ringkas text, p_pilihan text, p_alasan text,
  p_ident bigint default null, p_butir jsonb default null, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $f$
declare v_id bigint; v_ids bigint[] := '{}'; v_peran text; r jsonb; v_data jsonb;
begin
  if not keu_keputusan_boleh(p_akun) then raise exception 'Keputusan dicatat oleh Kepala atau pemberi delegasi' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_alasan, ''))) < 10 then raise exception 'Alasan keputusan minimal 10 huruf' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(p_pilihan, ''))) < 3 then raise exception 'Tulis pilihan yang diambil' using errcode = '23514'; end if;
  v_peran := case when keu_dlg_putus_ok(p_akun) then 'Kepala/pemutus' else 'Pemberi delegasi' end;
  if p_butir is not null and jsonb_typeof(p_butir) = 'object' then
    v_data := p_butir;
    if p_ident is not null and not (v_data ? 'ident_id') and not (v_data ? 'kelompok') then v_data := v_data || jsonb_build_object('ident_id', p_ident); end if;
    if not (v_data ? 'uraian') then v_data := v_data || jsonb_build_object('uraian', left('Tindak lanjut keputusan: ' || btrim(p_pilihan) || '. Alasan: ' || btrim(p_alasan), 1000)); end if;
    r := keu_dlg_buat(v_data, p_akun);
    select coalesce(array_agg(x::bigint), '{}') into v_ids from jsonb_array_elements_text(coalesce(r -> 'dibuat', '[]'::jsonb)) x;
  end if;
  insert into keu_keputusan(sinyal_kode, sinyal_kunci, judul, ringkas, ident_id, pilihan, alasan, pemutus_akun, pemutus_peran, delegasi_ids)
  values (coalesce(nullif(p_sinyal, ''), 'lainnya'), btrim(p_kunci), btrim(p_judul), btrim(coalesce(p_ringkas, '')), p_ident,
          btrim(p_pilihan), btrim(p_alasan), p_akun, v_peran, v_ids)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'butir', to_jsonb(v_ids));
end $f$;
revoke execute on function keu_keputusan_catat(text, text, text, text, text, text, bigint, jsonb, bigint) from public, anon, authenticated;

create or replace function keu_keputusan_evaluasi(p_id bigint, p_hasil text, p_catatan text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $f$
begin
  if not keu_keputusan_boleh(p_akun) then raise exception 'Evaluasi keputusan oleh Kepala atau pemberi delegasi' using errcode = '42501'; end if;
  if p_hasil not in ('sinyal_hilang','masih_ada','lainnya') then raise exception 'Hasil evaluasi tidak dikenal' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_catatan, ''))) < 10 then raise exception 'Catatan evaluasi minimal 10 huruf' using errcode = '23514'; end if;
  update keu_keputusan set evaluasi_hasil = p_hasil, evaluasi_catatan = btrim(p_catatan), dievaluasi_oleh = p_akun, dievaluasi_at = now()
   where id = p_id and dibatalkan_at is null;
  if not found then raise exception 'Keputusan tidak ada atau sudah dibatalkan' using errcode = '23514'; end if;
  return jsonb_build_object('id', p_id);
end $f$;
revoke execute on function keu_keputusan_evaluasi(bigint, text, text, bigint) from public, anon, authenticated;

create or replace function keu_keputusan_batal(p_id bigint, p_alasan text, p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql security definer set search_path = public as $f$
declare k keu_keputusan;
begin
  select * into k from keu_keputusan where id = p_id and dibatalkan_at is null;
  if not found then raise exception 'Keputusan tidak ada atau sudah dibatalkan' using errcode = '23514'; end if;
  if not (k.pemutus_akun = p_akun or keu_dlg_putus_ok(p_akun)) then raise exception 'Hanya pemutus atau Kepala yang dapat membatalkan' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_alasan, ''))) < 10 then raise exception 'Alasan pembatalan minimal 10 huruf' using errcode = '23514'; end if;
  update keu_keputusan set dibatalkan_at = now(), dibatalkan_oleh = p_akun, alasan_batal = btrim(p_alasan) where id = p_id;
  return jsonb_build_object('id', p_id, 'catatan', 'Butir kerja yang sudah terbit tidak ikut dibatalkan; batalkan di Delego bila perlu.');
end $f$;
revoke execute on function keu_keputusan_batal(bigint, text, bigint) from public, anon, authenticated;

create or replace function keu_keputusan_bahan(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path = public as $f$
declare v_hari date := keu_dlg_hari_ini(); v_bln date := date_trunc('month', keu_dlg_hari_ini())::date;
begin
  if not keu_keputusan_boleh(p_akun) then raise exception 'Ruang keputusan untuk Kepala dan pemberi delegasi' using errcode = '42501'; end if;
  return jsonb_build_object(
    'hari_ini', v_hari,
    'pemutus', keu_dlg_putus_ok(p_akun),
    'keputusan', coalesce((select jsonb_agg(x order by x.diputus_at desc) from (
        select k.id, k.sinyal_kode, k.sinyal_kunci, k.judul, k.ringkas, k.ident_id, k.pilihan, k.alasan, k.pemutus_peran, a.nama as pemutus,
               k.pemutus_akun = p_akun as milik_saya, k.diputus_at, k.evaluasi_hasil, k.evaluasi_catatan, k.dievaluasi_at,
               cardinality(k.delegasi_ids) as butir,
               (select count(*) from keu_dlg_delegasi d where d.id = any (k.delegasi_ids) and d.status in ('selesai','batal'))::int as butir_selesai,
               (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'judul', d.judul, 'status', d.status, 'tenggat', d.tenggat, 'penerima', pa.nama) order by d.id), '[]'::jsonb)
                  from keu_dlg_delegasi d join sigap_akun pa on pa.id = d.penerima_akun where d.id = any (k.delegasi_ids)) as butir_isi
          from keu_keputusan k join sigap_akun a on a.id = k.pemutus_akun
         where k.dibatalkan_at is null order by k.diputus_at desc limit 300) x), '[]'::jsonb),
    'ringkas', jsonb_build_object(
        'bulan_ini', (select count(*) from keu_keputusan where dibatalkan_at is null and diputus_at >= v_bln),
        'tanpa_tindak_lanjut', (select count(*) from keu_keputusan k where k.dibatalkan_at is null and cardinality(k.delegasi_ids) > 0
                                  and exists (select 1 from keu_dlg_delegasi d where d.id = any (k.delegasi_ids) and d.status not in ('selesai','batal'))),
        'tunggu_evaluasi', (select count(*) from keu_keputusan k where k.dibatalkan_at is null and k.evaluasi_hasil is null
                              and (cardinality(k.delegasi_ids) = 0 or not exists (select 1 from keu_dlg_delegasi d where d.id = any (k.delegasi_ids) and d.status not in ('selesai','batal'))))),
    'organik', coalesce((select jsonb_agg(jsonb_build_object('akun_id', a.id, 'nama', a.nama) order by a.nama)
                           from sigap_akun a where a.aktif and a.jenis = 'organik' and a.id <> p_akun), '[]'::jsonb),
    'kelompok', coalesce((select jsonb_agg(jsonb_build_object('kode', k.kode, 'nama', k.nama) order by k.urut, k.nama)
                            from keu_dlg_kelompok k where k.aktif and keu_dlg_beri(p_akun, k.kode)), '[]'::jsonb));
end $f$;
revoke execute on function keu_keputusan_bahan(bigint) from public, anon, authenticated;

-- Ruang keputusan: versi Fase 7 + kunci, ident_id, dan keputusan terakhir per butir sinyal.
create or replace function keu_ruang_keputusan(p_akun bigint default keu_akun_sesi())
returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
declare v_hari date := keu_dlg_hari_ini(); v_senin date := date_trunc('week', keu_dlg_hari_ini())::date; r jsonb;
begin
  if p_akun is null then raise exception 'Akun pelaku wajib diketahui' using errcode = '42501'; end if;
  if not (keu_dlg_putus_ok(p_akun) or coalesce(keu_boleh(p_akun, 'delegasi_beri', null), false)) then
    raise exception 'Ruang keputusan untuk Kepala dan pemberi delegasi' using errcode = '42501';
  end if;
  with sinyal as (
    select 'naik_kepala' as kode, 'Lewat tenggat naik ke Kepala' as judul, 'merah' as nada, '/sigap/delego/tinjau' as tautan, 1 as urut, null::text as kunci,
           coalesce(jsonb_agg(jsonb_build_object('teks', d.judul, 'sub', a.nama || ' · tenggat ' || to_char(e.tenggat, 'DD-MM-YYYY'),
             'kunci', 'esk:' || e.id, 'keputusan', keu_keputusan_ringkas('esk:' || e.id)) order by e.mulai_at), '[]'::jsonb) as isi
      from keu_dlg_eskalasi e join keu_dlg_delegasi d on d.id = e.delegasi_id join sigap_akun a on a.id = e.penerima_akun
     where e.ditutup_at is null and e.status = 'naik_kepala'
    union all
    select 'sanggah', 'Sanggahan menunggu putusan', 'merah', '/sigap/delego/monitor', 2, null,
           coalesce(jsonb_agg(jsonb_build_object('teks', d.judul, 'sub', a.nama || ' · diajukan ' || to_char(s.diajukan_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY'),
             'kunci', 'sanggah:' || s.id, 'keputusan', keu_keputusan_ringkas('sanggah:' || s.id)) order by s.diajukan_at), '[]'::jsonb)
      from keu_dlg_sanggah s join keu_dlg_delegasi d on d.id = s.delegasi_id join sigap_akun a on a.id = d.penerima_akun
     where s.status = 'menunggu_putusan'
    union all
    select 'gap_keras', 'Temuan Gap keras', 'amber', '/sigap/kelola/perencanaan/identifikasi', 3, null,
           coalesce(jsonb_agg(jsonb_build_object('teks', i.nama, 'sub', g.n_keras || ' temuan keras · versi ' || g.ver, 'tautan', '/sigap/kelola/perencanaan/identifikasi/' || i.id || '/gap',
             'kunci', 'gap:' || i.id || ':' || g.ver, 'ident_id', i.id, 'keputusan', keu_keputusan_ringkas('gap:' || i.id || ':' || g.ver)) order by g.dibuat_at desc), '[]'::jsonb)
      from keu_gap g join keu_ident i on i.id = g.ident_id
     where g.n_keras > 0 and g.ver = (select max(x.ver) from keu_gap x where x.ident_id = g.ident_id)
    union all
    select 'spk', 'SPK mitra belum terbit', 'amber', '/sigap/kelola/perencanaan/identifikasi', 4, null,
           coalesce(jsonb_agg(jsonb_build_object('teks', x.nama, 'sub', x.belum || ' dari ' || x.mitra || ' mitra belum ber-SPK', 'tautan', '/sigap/kelola/perencanaan/identifikasi/' || x.id || '/kebutuhan',
             'kunci', 'spk:' || x.id, 'ident_id', x.id, 'keputusan', keu_keputusan_ringkas('spk:' || x.id))), '[]'::jsonb)
      from (select i.id, i.nama,
                   (select count(*) from jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) p where p ->> 'status' = 'Mitra') as mitra,
                   (select count(*) from jsonb_array_elements(coalesce(l.isi -> 'petugas', '[]'::jsonb)) p
                     where p ->> 'status' = 'Mitra' and not exists (select 1 from keu_ident_dokumen dd where dd.ident_id = i.id and dd.jenis = 'tugas' and dd.kunci = p ->> 'id' and dd.status = 'terbit')) as belum
              from keu_ident i join keu_ident_lanjutan l on l.ident_id = i.id where i.status = 'sah') x
     where x.belum > 0
    union all
    select 'usulan', 'Usulan pegawai menggantung', 'amber', '/sigap/delego/tinjau', 5, null,
           coalesce(jsonb_agg(jsonb_build_object('teks', d.judul, 'sub', a.nama || ' · ' || keu_dlg_hk_lewat((d.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) || ' hari kerja',
             'kunci', 'usulan:' || d.id, 'keputusan', keu_keputusan_ringkas('usulan:' || d.id)) order by d.usulan_at), '[]'::jsonb)
      from keu_dlg_delegasi d join sigap_akun a on a.id = d.usulan_oleh
     where d.status = 'usulan' and keu_dlg_hk_lewat((d.usulan_at at time zone 'Asia/Jakarta')::date, v_hari) > 3
    union all
    select 'tanpa_catatan', 'Pegawai belum mencatat pekerjaan pekan ini', 'abu', '/sigap/delego/rapor', 6, 'catat:' || v_senin,
           coalesce(jsonb_agg(jsonb_build_object('teks', a.nama, 'sub', 'belum ada laporan Delego sejak ' || to_char(v_senin, 'DD-MM-YYYY')) order by a.nama), '[]'::jsonb)
      from sigap_akun a
     where a.aktif and a.jenis = 'organik'
       and not exists (select 1 from keu_dlg_laporan l join keu_dlg_delegasi d on d.id = l.delegasi_id where d.penerima_akun = a.id and l.tanggal >= v_senin)
  )
  select jsonb_build_object('hari_ini', v_hari, 'pemutus', keu_dlg_putus_ok(p_akun),
    'sinyal', coalesce((select jsonb_agg(jsonb_build_object('kode', s.kode, 'judul', s.judul, 'nada', s.nada, 'tautan', s.tautan, 'jumlah', jsonb_array_length(s.isi), 'isi', s.isi,
                 'kunci', s.kunci, 'keputusan', case when s.kunci is null then null else keu_keputusan_ringkas(s.kunci) end) order by s.urut) from sinyal s), '[]'::jsonb))
    into r;
  return r;
end $f$;
revoke execute on function keu_ruang_keputusan(bigint) from public, anon, authenticated;

do $$
declare d text := pg_get_functiondef('keu_jalankan'::regproc);
begin
  if position('''keu_keputusan_catat''' in d) = 0 then
    d := replace(d, '''keu_pejabat_batal''];', '''keu_pejabat_batal'',''keu_keputusan_bahan'',''keu_keputusan_catat'',''keu_keputusan_evaluasi'',''keu_keputusan_batal''];');
    if position('''keu_keputusan_catat''' in d) = 0 then raise exception 'Daftar izin keu_jalankan tidak dikenali; migrasi dihentikan'; end if;
    execute d;
  end if;
end $$;

commit;
