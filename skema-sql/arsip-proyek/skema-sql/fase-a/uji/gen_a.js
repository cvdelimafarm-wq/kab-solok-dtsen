// Menghasilkan a_2_seed.sql dan b_dok.sql dari model mockup (window.KKA).
global.window = global;
require('../out/kk-adm-data.js');
require('../out/kk-adm.js');
const fs = require('fs');
const K = window.KKA;
const q = (s) => s === null || s === undefined ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => "array[" + a.map(q).join(',') + "]::text[]";
const b = (v) => v ? 'true' : 'false';
let o = [];
const P = (s) => o.push(s);

P('-- ---------------------------------------------------------------------');
P('-- Data awal (dihasilkan dari model mockup 24 Okt 2026). on conflict do nothing:');
P('-- aman diulang dan tidak menimpa perubahan yang sudah dibuat di Master.');
P('-- ---------------------------------------------------------------------');

// peran
const lingkup = { ADMIN: 'global', KPA: 'global', PPK: 'global', KETUA: 'ro', ADMINRO: 'ro', BEND: 'global', PBJ: 'ro', TU: 'global', RENC: 'global' };
const pk = Object.keys(K.PERAN);
P('insert into keu_master_peran(kode,nama,ket,lingkup,urut) values');
P(pk.map((k, i) => `(${q(k)},${q(K.PERAN[k].nama)},${q(K.PERAN[k].ket)},${q(lingkup[k])},${i + 1})`).join(',\n') + '\non conflict (kode) do nothing;');

// kewenangan
const pemberi = { verifikasi: 'sahkan' };
P('insert into keu_master_kewenangan(kode,nama,ket,pemberi_kode,urut) values');
P(K.KEWENANGAN.map((k, i) => `(${q(k.id)},${q(k.nama)},${q(k.ket || '')},${q(pemberi[k.id] || null)},${i + 1})`).join(',\n') + '\non conflict (kode) do nothing;');
const mat = [];
K.KEWENANGAN.forEach((k) => k.peran.forEach((p) => {
  const perlu = (k.id === 'verifikasi' && p === 'TU');
  mat.push(`(${q(k.id)},${q(p)},${b(perlu)})`);
}));
P('insert into keu_master_kewenangan_peran(kewenangan_kode,peran_kode,perlu_pemberian) values');
P(mat.join(',\n') + '\non conflict do nothing;');

// kelompok
P('insert into keu_master_kelompok(kode,nama,urut) values');
P(Object.keys(K.KELOMPOK).map((k, i) => `(${q(k)},${q(K.KELOMPOK[k])},${i + 1})`).join(',\n') + '\non conflict (kode) do nothing;');

// pola dok (7)
P('insert into keu_master_pola_dok(kode,nama,urut) values');
P(Object.keys(K.POLA).map((k, i) => `(${q(k)},${q(K.POLA[k].nama)},${i + 1})`).join(',\n') + '\non conflict (kode) do nothing;');

// akun
P('insert into keu_master_akun(kode,nama,pola_kode,aktif) values');
P(K.AKUN_M.map((a) => `(${q(a.kode)},${q(a.nama)},${q(a.pola)},${b(a.aktif !== false)})`).join(',\n') + '\non conflict (kode) do nothing;');

// satuan
P('insert into keu_master_satuan(kode,arti,pasti,urut) values');
P(K.SATUAN.map((s, i) => `(${q(s.kode)},${q(s.arti)},${b(s.pasti)},${i + 1})`).join(',\n') + '\non conflict (kode) do nothing;');
const al = [];
K.SATUAN.forEach((s) => { const set = new Set([s.kode].concat(s.alias)); set.forEach((a) => al.push(`(${q(String(a).toUpperCase())},${q(s.kode)})`)); });
P('insert into keu_master_satuan_alias(alias,satuan_kode) values');
P(al.join(',\n') + '\non conflict (alias) do nothing;');

// prioritas
P('insert into keu_master_prioritas(kode,nama,warna,urut) values');
P(K.PRIO.map((p, i) => `(${q(p.id)},${q(p.nama)},${q(p.cls)},${i + 1})`).join(',\n') + '\non conflict (kode) do nothing;');

// waktu
const W = [
  ['tahun_anggaran', '2026', null],
  ['jadwal_bawaan_revisi', null, null],
  ['tenggat_dipa_dja', null, '2026-10-30'],
  ['tenggat_dipa_djpb', null, '2026-11-30'],
  ['tenggat_pok', null, '2026-12-27'],
  ['unggah_realisasi', null, null],
  ['profil_penarikan', null, null],
  ['masa_penugasan', null, null]
];
P('insert into keu_master_waktu(kode,nama,nilai,nilai_tanggal,ket,urut) values');
P(W.map((w, i) => { const x = K.WAKTU[i]; return `(${q(w[0])},${q(x.nama)},${q(x.nilai)},${w[2] ? q(w[2]) + '::date' : 'null'},${q(x.ket)},${i + 1})`; }).join(',\n') + '\non conflict (kode) do nothing;');
const prof = [3, 5, 8, 9, 10, 11, 10, 10, 9, 9, 9, 7];
if (prof.reduce((a, c) => a + c, 0) !== 100) throw new Error('profil bukan 100');
P('insert into keu_master_profil_penarikan(bulan,persen) values');
P(prof.map((p, i) => `(${i + 1},${p})`).join(',') + '\non conflict (bulan) do nothing;');

// skor
P(`insert into keu_master_skor(id,bobot_penarikan,bobot_volume,bobot_cakupan,bobot_disiplin,ambang_baik,ambang_cukup)
values (1,${K.BOBOT0.penarikan},${K.BOBOT0.volume},${K.BOBOT0.cakupan},${K.BOBOT0.disiplin},${K.AMBANG0.baik},${K.AMBANG0.cukup})
on conflict (id) do nothing;`);

// level
const RE = { program: '^[A-Z]{2}$', kegiatan: '^[0-9]{4}$', kro: '^[A-Z]{3}$', ro: '^[A-Z0-9]{3}$', komponen: '^[0-9]{3}$', subkomp: '^[A-Z0-9]{1,2}$', akun: '^[0-9]{6}$', item: null };
// induk disisipkan setelah semua baris ada (FK diri sendiri berada dalam satu pernyataan: aman)
P('insert into keu_struktur_level(kode,no,nama,istilah_sakti,contoh,format_ket,format_re,induk_kode,pengusul,tampil) values');
P(K.LEVEL.map((l) => `(${q(l.id)},${l.no},${q(l.nama)},${q(l.sakti)},${q(l.contoh)},${q(l.fmt)},${q(RE[l.id])},${q(l.induk || null)},${q(l.pengusul)},${b(l.id !== 'subkomp')})`).join(',\n') + '\non conflict (kode) do nothing;');

// jalur
const tenggatKode = { pok: 'tenggat_pok', djpb: 'tenggat_dipa_djpb', dja: 'tenggat_dipa_dja' };
const J = [];
const seen = new Set();
function add(l, s, kh) {
  const key = [l, s, kh].join('|'); if (seen.has(key)) return; seen.add(key);
  const j = K.jalurTambah(l, s, kh);
  J.push(`(${q(l)},${q(s)},${b(kh)},${q(j.kode)},${q(j.nama)},${q(j.pemutus)},${q(j.dasar)},${q(j.kepastian)},${q(tenggatKode[j.kode])},${arr(j.syarat)})`);
}
K.LEVEL.forEach((l) => K.SUMBER.forEach((s) => add(l.id, s.id, false)));
['dalam', 'lintas'].forEach((s) => add('komponen', s, true));
P('insert into keu_master_jalur(level_kode,sumber,khusus,jalur_kode,nama,pemutus,dasar,kepastian,tenggat_kode,syarat) values');
P(J.join(',\n') + '\non conflict (level_kode,sumber,khusus) do nothing;');

// registri RO
P('insert into keu_ro(kode,nama) values');
P(window.KKA_RO.map((r) => `(${q(r.kode)},${q(r.nama)})`).join(',\n') + '\non conflict (kode) do nothing;');

fs.writeFileSync(__dirname + '/a_2_seed.sql', o.join('\n') + '\n');

// ------------------ migrasi b: dokumen ------------------
let d = [];
d.push(`-- =====================================================================
-- 20261024b_keu_master_dokumen.sql
-- Fase A2: master dokumen pertanggungjawaban belanja (pola per jenis akun
-- dan skema khusus per akun). Dari Daftar_Kelengkapan_Dokumen_Pertanggungjawaban_Belanja.xlsx
-- dan pola umum Master. Kolom gen = penanda "dapat dibuat SIGAP" (ILUSTRASI, perlu ditinjau).
-- Bergantung pada 20261024a. Aman diulang.
-- =====================================================================
create table if not exists keu_master_dok (
  id          bigint generated always as identity primary key,
  sumber      text not null check (sumber in ('pola','skema')),
  kode        text not null,            -- pola: kode pola (PEG,BRG,..); skema: kode akun atau nama skema (mis. Lembur)
  seksi_urut  smallint not null default 1,
  seksi_huruf text not null default '',
  seksi_judul text not null default '',
  no          smallint not null check (no > 0),
  uraian      text not null,
  pihak       text[] not null check (pihak <@ array['Tim Kerja','PBJ','Bendahara','Perencanaan','PPK','Tata Usaha']),
  ket         text not null default '',
  gen         boolean not null default false,
  aktif       boolean not null default true,
  dibuat_at   timestamptz not null default now(),
  diubah_at   timestamptz not null default now(),
  unique (sumber, kode, seksi_urut, no)
);
create index if not exists keu_master_dok_kode_idx on keu_master_dok(sumber, kode) where aktif;

do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_master_dok'::regclass and tgname = 'keu_t1_jaga') then
    create trigger keu_t1_jaga before insert or update or delete on keu_master_dok for each row execute function keu_jaga('master');
    create trigger keu_t2_sentuh before update on keu_master_dok for each row execute function keu_sentuh();
  end if;
end $$;
`);
const rows = [];
let n = 0;
Object.keys(K.POLA).forEach((pk2) => K.POLA[pk2].docs.forEach((x) => { n++; rows.push(`('pola',${q(pk2)},1,'','',${x.no},${q(x.uraian)},${arr(x.pihak)},${q(x.ket)},${b(x.gen)})`); }));
window.KKA_SKEMA.forEach((s) => s.seksi.forEach((sk, i) => sk.docs.forEach((x) => { n++; rows.push(`('skema',${q(s.kode)},${i + 1},${q(sk.huruf)},${q(sk.judul)},${x.no},${q(x.uraian)},${arr(x.pihak)},${q(x.ket)},${b(x.gen)})`); })));
d.push('insert into keu_master_dok(sumber,kode,seksi_urut,seksi_huruf,seksi_judul,no,uraian,pihak,ket,gen) values');
d.push(rows.join(',\n') + '\non conflict (sumber,kode,seksi_urut,no) do nothing;');
d.push(`
-- audit untuk tabel ini dipasang SETELAH data awal agar jejak tidak berisi ${n} baris pemuatan
do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.keu_master_dok'::regclass and tgname = 'keu_t9_jejak') then
    create trigger keu_t9_jejak after insert or update or delete on keu_master_dok for each row execute function keu_jejak();
  end if;
end $$;
alter table keu_master_dok enable row level security;
revoke all on table keu_master_dok from anon, authenticated;
grant all on table keu_master_dok to service_role;
`);
fs.writeFileSync(__dirname + '/b_dok.sql', d.join('\n'));
console.log('seed ok; dok rows', n);
