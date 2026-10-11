"use client";

// app/sigap/kelola/perencanaan/page.tsx
//
// (11 Okt 2026) Perencanaan kegiatan berbasis GSBPM per RO anggaran -- UJI COBA, permintaan user ("buatkan hierarkhynya dulu").
// Hierarki: RO anggaran -> kegiatan utama -> 6 tahap GSBPM -> (form identifikasi tahap: langkah berikut).
// Keputusan user 11 Okt: halaman uji coba di web (bukan mockup), hanya Admin Aplikasi (izin portal.kelola), data disimpan di
// browser dulu (localStorage, kunci sigap_uji_perencanaan_v1) sampai aturan disetujui -- tidak ada tabel/migrasi, modul lain tidak disentuh.
// Posisi hierarki ada di alamat (?ro=&keg=&tahap=) supaya tombol Back naik satu tingkat.
// Logika murni & uji: lib/perencanaanGsbpm.ts, lib/__tests__/perencanaanGsbpm.test.ts. Rancangan: claude/rancangan-identifikasi-gsbpm-ro.md.
// (11 Okt 2026, lanjutan) Tingkat RO punya 3 bagian (?bagian=): Kegiatan | Baris POK | Rencana realisasi -- permintaan user: daftar diambil dari POK
// (tempel dari Excel) supaya tidak ada yang terlewat; setiap baris ditautkan ke kegiatan (boleh >1 kegiatan, dengan alokasi), baris tanpa tautan
// ditandai "belum dipetakan"; RAB kegiatan = akumulasi alokasi; tiap alokasi punya rencana bayar per bulan. Logika: lib/perencanaanPok.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Bingkai from "../../kontrak/Bingkai";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, rupiah, SesiBerakhir, tglSedang } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH } from "../../admin/ui";
import {
  KUNCI_SIMPAN,
  TAHAP_GSBPM,
  aturTahapDipakai,
  bacaData,
  buatKegiatan,
  dataContoh,
  definisiTahap,
  duplikatKegiatan,
  idAcak,
  periksaKegiatan,
  periksaRo,
  pisahSubKomponen,
  rapikanKodeRo,
  ringkasKegiatan,
  statusTahap,
  type DataUji,
  type KegiatanUtama,
  type KodeTahap,
  type Ro,
} from "@/lib/perencanaanGsbpm";
import {
  BULAN_PENDEK,
  KOLOM_TEMPEL,
  anggaranKegiatan,
  bacaTempelanPok,
  gabungMuatan,
  matriksRencana,
  nilaiAlokasi,
  parseAngka,
  periksaAlokasiDetail,
  ringkasDetail,
  ringkasRo,
  type Alokasi,
  type DetailPok,
  type HasilTempel,
  type StatusDetail,
} from "@/lib/perencanaanPok";

type Bagian = "kegiatan" | "pok" | "rencana";
const BAGIAN: { kode: Bagian; label: string }[] = [
  { kode: "kegiatan", label: "Kegiatan" },
  { kode: "pok", label: "Baris POK" },
  { kode: "rencana", label: "Rencana realisasi" },
];
type Posisi = { ro: string | null; keg: string | null; tahap: KodeTahap | null; bagian?: Bagian };

function posisiDariAlamat(): Posisi {
  if (typeof window === "undefined") return { ro: null, keg: null, tahap: null };
  const q = new URLSearchParams(window.location.search);
  const t = q.get("tahap");
  const b = q.get("bagian");
  return {
    ro: q.get("ro"),
    keg: q.get("keg"),
    tahap: t && definisiTahap(t) ? (t as KodeTahap) : null,
    bagian: b === "pok" || b === "rencana" ? b : undefined,
  };
}

function alamat(p: Posisi): string {
  const q = new URLSearchParams();
  if (p.ro) q.set("ro", p.ro);
  if (p.keg) q.set("keg", p.keg);
  if (p.tahap) q.set("tahap", p.tahap);
  if (p.ro && !p.keg && p.bagian && p.bagian !== "kegiatan") q.set("bagian", p.bagian);
  const s = q.toString();
  return `/sigap/kelola/perencanaan${s ? `?${s}` : ""}`;
}

const sekarang = () => new Date().toISOString();

function rentang(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a || !b || a === b) return tglSedang(a ?? b);
  return `${tglSedang(a)} – ${tglSedang(b)}`;
}

export default function PerencanaanKegiatan() {
  const [izin, setIzin] = useState<"memuat" | "boleh" | "tidak">("memuat");
  const [galat, setGalat] = useState<string | null>(null);
  const [data, setData] = useState<DataUji | null>(null);
  const [pos, setPos] = useState<Posisi>({ ro: null, keg: null, tahap: null });

  // Gerbang: hanya Admin Aplikasi (portal.kelola level kelola).
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    fetchJson<{ izin?: Record<string, { level: "lihat" | "kelola" }> }>("/api/sigap/saya")
      .then((s) => setIzin(s.izin?.["portal.kelola"]?.level === "kelola" ? "boleh" : "tidak"))
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      });
  }, []);

  // Data uji coba dari browser + posisi dari alamat (Back/Forward ikut).
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KUNCI_SIMPAN);
    } catch {
      raw = null;
    }
    setData(bacaData(raw));
    setPos(posisiDariAlamat());
    const onPop = () => setPos(posisiDariAlamat());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const simpan = useCallback((d: DataUji) => {
    setData(d);
    try {
      localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(d));
    } catch {
      setGalat("Browser menolak menyimpan data uji coba (penyimpanan penuh atau mode privat). Perubahan hanya bertahan sampai halaman ditutup.");
    }
  }, []);

  const pergi = useCallback((p: Posisi) => {
    window.history.pushState(null, "", alamat(p));
    setPos(p);
    window.scrollTo({ top: 0 });
  }, []);

  const ro = useMemo(() => (data && pos.ro ? data.ro.find((r) => r.id === pos.ro) ?? null : null), [data, pos.ro]);
  const keg = useMemo(() => (data && ro && pos.keg ? data.kegiatan.find((k) => k.id === pos.keg && k.roId === ro.id) ?? null : null), [data, ro, pos.keg]);
  const tahap = keg && pos.tahap ? definisiTahap(pos.tahap) : null;

  const jejak = ["Perencanaan kegiatan", ...(ro ? [ro.kode] : []), ...(keg ? [keg.nama] : []), ...(tahap ? [tahap.nama] : [])];
  const judul = tahap ? tahap.nama : keg ? keg.nama : ro ? `RO ${ro.kode}` : "Perencanaan kegiatan";
  const sub = tahap ? `Tahap ${tahap.no} · GSBPM ${tahap.gsbpm} · ${keg?.nama}` : keg ? `RO ${ro?.kode} · ${ro?.nama}` : ro ? ro.nama : "RO anggaran → kegiatan → tahap GSBPM";

  const kembalikanContoh = () => {
    simpan(dataContoh(sekarang()));
    pergi({ ro: null, keg: null, tahap: null });
  };

  let isi: React.ReactNode;
  if (galat && izin === "memuat") isi = <Pesan jenis="galat">{galat}</Pesan>;
  else if (izin === "memuat" || !data) isi = <Memuat />;
  else if (izin === "tidak")
    isi = (
      <Kartu judul="Hanya untuk Admin Aplikasi">
        <p className="text-[13.5px] text-[#4D5B6B]">Halaman uji coba perencanaan kegiatan saat ini hanya dapat dibuka Admin Aplikasi.</p>
        <Link href="/" className={`${BTN_O} mt-3`}>
          Ke Beranda
        </Link>
      </Kartu>
    );
  else
    isi = (
      <>
        <Pesan jenis="peringatan">
          <span className="font-bold">Uji coba.</span> Data di halaman ini hanya tersimpan di browser ini (belum ke database) dan tidak terlihat petugas. Form identifikasi per tahap
          menyusul.{" "}
          <button type="button" onClick={kembalikanContoh} className="font-bold underline">
            Kembalikan contoh awal
          </button>
        </Pesan>
        {galat && (
          <Pesan jenis="galat" onTutup={() => setGalat(null)}>
            {galat}
          </Pesan>
        )}
        <JejakHierarki ro={ro} keg={keg} tahap={tahap?.nama ?? null} pergi={pergi} />
        {!ro && pos.ro && <Pesan jenis="info">RO tidak ditemukan di data uji coba browser ini.</Pesan>}
        {ro && !keg && pos.keg && <Pesan jenis="info">Kegiatan tidak ditemukan di RO ini.</Pesan>}
        {!ro ? (
          <DaftarRo data={data} simpan={simpan} pergi={pergi} />
        ) : !keg ? (
          <TingkatRo data={data} ro={ro} bagian={pos.bagian ?? "kegiatan"} simpan={simpan} pergi={pergi} />
        ) : !tahap ? (
          <DetailKegiatan data={data} ro={ro} keg={keg} simpan={simpan} pergi={pergi} />
        ) : (
          <DetailTahap ro={ro} keg={keg} kode={tahap.kode} pergi={pergi} />
        )}
      </>
    );

  return (
    <Bingkai aktif="perencanaan" kecil="SIGAP · Perencanaan kegiatan · Uji coba" jejak={jejak} judul={judul} sub={sub}>
      {isi}
    </Bingkai>
  );
}

// ---------------------------------------------------------------- Jejak hierarki (bisa diklik)
function JejakHierarki({ ro, keg, tahap, pergi }: { ro: Ro | null; keg: KegiatanUtama | null; tahap: string | null; pergi: (p: Posisi) => void }) {
  const item: { label: string; ke: Posisi | null; tingkat: string }[] = [{ label: "Semua RO", ke: { ro: null, keg: null, tahap: null }, tingkat: "Anggaran" }];
  if (ro) item.push({ label: ro.kode, ke: { ro: ro.id, keg: null, tahap: null }, tingkat: "RO" });
  if (ro && keg) item.push({ label: keg.nama, ke: { ro: ro.id, keg: keg.id, tahap: null }, tingkat: "Kegiatan" });
  if (tahap) item.push({ label: tahap, ke: null, tingkat: "Tahap GSBPM" });
  return (
    <nav aria-label="Hierarki perencanaan" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E3E8EE] bg-white px-3 py-2 text-[12.5px]">
      {item.map((x, i) => {
        const akhir = i === item.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-[#9AA7B6]">›</span>}
            {akhir || !x.ke ? (
              <span className="min-w-0 truncate font-bold text-[#14202E]" aria-current="page">
                {x.label}
              </span>
            ) : (
              <button type="button" onClick={() => x.ke && pergi(x.ke)} className="min-w-0 truncate font-semibold text-[#1F5FD1] hover:underline">
                {x.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------- Tingkat 1: daftar RO
function DaftarRo({ data, simpan, pergi }: { data: DataUji; simpan: (d: DataUji) => void; pergi: (p: Posisi) => void }) {
  const [buka, setBuka] = useState(false);
  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [program, setProgram] = useState("054.01.GG");
  const [salah, setSalah] = useState<string | null>(null);
  const [hapus, setHapus] = useState<string | null>(null);

  const tambah = () => {
    const err = periksaRo({ kode, nama }, data.ro);
    if (err) return setSalah(err);
    const r: Ro = { id: idAcak("ro"), kode: rapikanKodeRo(kode), nama: nama.trim(), program: program.trim(), tahun: 2026 };
    simpan({ ...data, ro: [...data.ro, r] });
    setKode("");
    setNama("");
    setSalah(null);
    setBuka(false);
  };

  return (
    <Kartu
      judul="RO anggaran"
      ket={`TA 2026 · ${data.ro.length} RO`}
      kanan={
        <button type="button" className={BTN} onClick={() => setBuka((v) => !v)} aria-expanded={buka}>
          ＋ Tambah RO
        </button>
      }
    >
      {buka && (
        <div className="mb-3 grid gap-2 rounded-xl border border-[#DDE6F3] bg-[#F8FAFE] p-3 sm:grid-cols-[150px_minmax(0,1fr)_130px_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
            Kode RO
            <input className={INPUT} value={kode} onChange={(e) => setKode(e.target.value)} placeholder="2906.BMA.006" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
            Nama RO
            <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Publikasi/Laporan …" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
            Program
            <input className={INPUT} value={program} onChange={(e) => setProgram(e.target.value)} />
          </label>
          <button type="button" className={BTN} onClick={tambah}>
            Simpan
          </button>
          {salah && <p className="text-[12.5px] font-semibold text-[#B42329] sm:col-span-4">{salah}</p>}
        </div>
      )}
      {data.ro.length === 0 && <p className="text-[13.5px] text-[#6B7A90]">Belum ada RO. Tambahkan RO dari POK, lalu kegiatan yang memakainya.</p>}
      <ul className="grid gap-2.5 md:grid-cols-2">
        {data.ro.map((r) => {
          const keg = data.kegiatan.filter((k) => k.roId === r.id);
          const pokRo = data.pok.filter((d) => d.roId === r.id);
          const rr = ringkasRo(pokRo, data.alokasi);
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-[#DDE6F3] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#FBF1D6] px-2 py-0.5 font-mono text-[12.5px] font-bold text-[#6E4F0E]">{r.kode}</span>
                {r.program && <span className="text-[11.5px] text-[#6B7A90]">{r.program}</span>}
              </div>
              <p className="text-[14px] font-bold leading-snug text-[#14202E]">{r.nama}</p>
              <p className="text-[12.5px] text-[#4D5B6B]">
                {keg.length} kegiatan ·{" "}
                {pokRo.length === 0 ? "baris POK belum dimuat" : `${pokRo.length} baris POK · pagu ${rupiah(rr.pagu)}`}
              </p>
              {pokRo.length > 0 && (rr.belumBaris > 0 || rr.sebagianBaris > 0) && (
                <p className="text-[12.5px] font-semibold text-[#8A6200]">Belum dipetakan: {rupiah(rr.belumNilai)} ({rr.belumBaris + rr.sebagianBaris} baris)</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN} onClick={() => pergi({ ro: r.id, keg: null, tahap: null })}>
                  Buka RO →
                </button>
                {keg.length === 0 && pokRo.length === 0 &&
                  (hapus === r.id ? (
                    <>
                      <button type="button" className={BTN_R} onClick={() => simpan({ ...data, ro: data.ro.filter((x) => x.id !== r.id) })}>
                        Ya, hapus RO
                      </button>
                      <button type="button" className={BTN_O} onClick={() => setHapus(null)}>
                        Batal
                      </button>
                    </>
                  ) : (
                    <button type="button" className={BTN_O} onClick={() => setHapus(r.id)}>
                      Hapus
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Kartu>
  );
}

// ---------------------------------------------------------------- Form kegiatan (tambah / ubah / duplikat)
function FormKegiatan({
  awal,
  roPilihan,
  labelSimpan,
  onSimpan,
  onBatal,
  catatan,
}: {
  awal: { nama: string; mulai: string | null; selesai: string | null; subKomponen: string[]; roId: string };
  /** Bila ada: boleh pindah RO (duplikat). */
  roPilihan?: Ro[];
  labelSimpan: string;
  onSimpan: (v: { nama: string; mulai: string | null; selesai: string | null; subKomponen: string[]; roId: string }) => void;
  onBatal: () => void;
  catatan?: React.ReactNode;
}) {
  const [nama, setNama] = useState(awal.nama);
  const [mulai, setMulai] = useState(awal.mulai ?? "");
  const [selesai, setSelesai] = useState(awal.selesai ?? "");
  // (11 Okt 2026) tautan anggaran kini lewat tab Baris POK; isian Sub Komponen lama dipertahankan apa adanya
  const sub = awal.subKomponen.join(", ");
  const [roId, setRoId] = useState(awal.roId);
  const [salah, setSalah] = useState<string | null>(null);

  const kirim = () => {
    const v = { nama, mulai: mulai || null, selesai: selesai || null };
    const err = periksaKegiatan(v);
    if (err) return setSalah(err);
    onSimpan({ ...v, nama: nama.trim(), subKomponen: pisahSubKomponen(sub), roId });
  };

  return (
    <div className="grid gap-2 rounded-xl border border-[#DDE6F3] bg-[#F8FAFE] p-3">
      {catatan && <p className="text-[12.5px] text-[#4D5B6B]">{catatan}</p>}
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
        Nama kegiatan
        <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Susenas Maret terintegrasi Seruti Triwulan I 2026" />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
          Mulai
          <input type="date" className={INPUT} value={mulai} onChange={(e) => setMulai(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
          Selesai
          <input type="date" className={INPUT} value={selesai} onChange={(e) => setSelesai(e.target.value)} />
        </label>
        {roPilihan && roPilihan.length > 1 && (
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
            RO
            <select className={INPUT} value={roId} onChange={(e) => setRoId(e.target.value)}>
              {roPilihan.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.kode} · {r.nama}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {salah && <p className="text-[12.5px] font-semibold text-[#B42329]">{salah}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN} onClick={kirim}>
          {labelSimpan}
        </button>
        <button type="button" className={BTN_O} onClick={onBatal}>
          Batal
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Tingkat 2: kegiatan utama dalam satu RO
function DaftarKegiatan({ data, ro, simpan, pergi }: { data: DataUji; ro: Ro; simpan: (d: DataUji) => void; pergi: (p: Posisi) => void }) {
  const pokRo = data.pok.filter((d) => d.roId === ro.id);
  const [tambah, setTambah] = useState(false);
  const [duplikat, setDuplikat] = useState<string | null>(null);
  const [hapus, setHapus] = useState<string | null>(null);
  const daftar = data.kegiatan.filter((k) => k.roId === ro.id);
  const namaAsal = (id: string | null) => (id ? data.kegiatan.find((k) => k.id === id)?.nama ?? null : null);

  return (
    <Kartu
      judul="Kegiatan"
      ket={`${daftar.length} kegiatan memakai RO ini`}
      kanan={
        <button type="button" className={BTN} onClick={() => setTambah((v) => !v)} aria-expanded={tambah}>
          ＋ Tambah kegiatan
        </button>
      }
    >
      {tambah && (
        <div className="mb-3">
          <FormKegiatan
            awal={{ nama: "", mulai: null, selesai: null, subKomponen: [], roId: ro.id }}
            labelSimpan="Simpan kegiatan"
            onBatal={() => setTambah(false)}
            onSimpan={(v) => {
              const k = buatKegiatan(v, idAcak("keg"), sekarang());
              simpan({ ...data, kegiatan: [...data.kegiatan, k] });
              setTambah(false);
            }}
          />
        </div>
      )}
      {daftar.length === 0 && <p className="text-[13.5px] text-[#6B7A90]">Belum ada kegiatan untuk RO ini.</p>}
      <ul className="flex flex-col gap-2.5">
        {daftar.map((k) => {
          const r = ringkasKegiatan(k);
          const per = rentang(k.mulai, k.selesai);
          const asal = namaAsal(k.asalId);
          return (
            <li key={k.id} className="flex flex-col gap-2 rounded-xl border border-[#DDE6F3] p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-bold leading-snug text-[#14202E]">{k.nama}</p>
                  <p className="mt-0.5 text-[12.5px] text-[#4D5B6B]">
                    {per ?? "Periode belum diisi"}
                    {asal ? ` · duplikat dari ${asal}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const ang = anggaranKegiatan(k.id, pokRo, data.alokasi);
                    return ang.baris.length ? (
                      <Chip w="navy" title={`${ang.baris.length} baris POK; terjadwal ${rupiah(ang.terjadwal)}`}>
                        {rupiah(ang.total)} · {ang.baris.length} baris POK
                      </Chip>
                    ) : (
                      <Chip w="wait">Belum tertaut ke baris POK</Chip>
                    );
                  })()}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Tahap GSBPM">
                {TAHAP_GSBPM.map((t) => {
                  const s = statusTahap(k.tahap[t.kode]);
                  return (
                    <Chip key={t.kode} w={s === "sudah" ? "ok" : s === "belum" ? "navy" : "mut"} title={s === "tidak_dipakai" ? "Tidak dipakai" : s === "sudah" ? "Sudah diidentifikasi" : "Belum diidentifikasi"}>
                      {t.no}. {t.nama}
                      {s === "tidak_dipakai" ? " · –" : s === "sudah" ? " ✓" : ""}
                    </Chip>
                  );
                })}
              </div>
              <p className="text-[12px] text-[#6B7A90]">
                {r.dipakai} tahap dipakai · {r.teridentifikasi} dari {r.dipakai} sudah diidentifikasi
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN} onClick={() => pergi({ ro: ro.id, keg: k.id, tahap: null })}>
                  Buka kegiatan →
                </button>
                <button type="button" className={BTN_O} onClick={() => setDuplikat(duplikat === k.id ? null : k.id)} aria-expanded={duplikat === k.id}>
                  Duplikat
                </button>
                {hapus === k.id ? (
                  <>
                    <button type="button" className={BTN_R} onClick={() => simpan({ ...data, kegiatan: data.kegiatan.filter((x) => x.id !== k.id), alokasi: data.alokasi.filter((x) => x.kegiatanId !== k.id) })}>
                      Ya, hapus dari uji coba
                    </button>
                    <button type="button" className={BTN_O} onClick={() => setHapus(null)}>
                      Batal
                    </button>
                  </>
                ) : (
                  <button type="button" className={BTN_O} onClick={() => setHapus(k.id)}>
                    Hapus
                  </button>
                )}
              </div>
              {duplikat === k.id && (
                <FormKegiatan
                  awal={{ nama: `${k.nama} (salinan)`, mulai: null, selesai: null, subKomponen: [], roId: ro.id }}
                  roPilihan={data.ro}
                  labelSimpan="Buat duplikat"
                  catatan="Tahap yang dipakai dan jawaban identifikasi ikut tersalin. Tautan ke baris POK tidak ikut: atur di tab Baris POK."
                  onBatal={() => setDuplikat(null)}
                  onSimpan={(v) => {
                    const baru = duplikatKegiatan(k, v, idAcak("keg"), sekarang());
                    simpan({ ...data, kegiatan: [...data.kegiatan, baru] });
                    setDuplikat(null);
                    if (baru.roId !== ro.id) pergi({ ro: baru.roId, keg: null, tahap: null });
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Kartu>
  );
}

// ---------------------------------------------------------------- Tingkat 3: tahap GSBPM satu kegiatan
function DetailKegiatan({ data, ro, keg, simpan, pergi }: { data: DataUji; ro: Ro; keg: KegiatanUtama; simpan: (d: DataUji) => void; pergi: (p: Posisi) => void }) {
  const [ubah, setUbah] = useState(false);
  const ganti = (k: KegiatanUtama) => simpan({ ...data, kegiatan: data.kegiatan.map((x) => (x.id === k.id ? k : x)) });
  const per = rentang(keg.mulai, keg.selesai);
  const ang = anggaranKegiatan(keg.id, data.pok.filter((d) => d.roId === ro.id), data.alokasi);

  return (
    <>
      <Kartu
        judul="Data kegiatan"
        kanan={
          <button type="button" className={BTN_O} onClick={() => setUbah((v) => !v)} aria-expanded={ubah}>
            {ubah ? "Tutup" : "Ubah"}
          </button>
        }
      >
        {ubah ? (
          <FormKegiatan
            awal={{ nama: keg.nama, mulai: keg.mulai, selesai: keg.selesai, subKomponen: keg.subKomponen, roId: keg.roId }}
            labelSimpan="Simpan perubahan"
            onBatal={() => setUbah(false)}
            onSimpan={(v) => {
              ganti({ ...keg, nama: v.nama, mulai: v.mulai, selesai: v.selesai, subKomponen: v.subKomponen });
              setUbah(false);
            }}
          />
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-[12px] text-[#6B7A90]">RO</dt>
              <dd className="font-semibold text-[#14202E]">
                {ro.kode} · {ro.nama}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#6B7A90]">Periode</dt>
              <dd className="font-semibold text-[#14202E]">{per ?? "Belum diisi"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#6B7A90]">Anggaran (dari baris POK)</dt>
              <dd className="font-semibold text-[#14202E]">{ang.baris.length ? `${rupiah(ang.total)} · terjadwal ${rupiah(ang.terjadwal)}` : "Belum tertaut"}</dd>
            </div>
          </dl>
        )}
      </Kartu>

      <Kartu
        judul="Anggaran kegiatan"
        ket="Akumulasi alokasi dari baris POK"
        kanan={
          <button type="button" className={BTN_O} onClick={() => pergi({ ro: ro.id, keg: null, tahap: null, bagian: "pok" })}>
            Atur di Baris POK
          </button>
        }
      >
        {ang.baris.length === 0 ? (
          <p className="text-[13px] text-[#6B7A90]">Belum ada baris POK yang ditautkan ke kegiatan ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>Komponen</th>
                  <th className={TH}>Akun · uraian</th>
                  <th className={`${TH} text-right`}>Alokasi</th>
                  <th className={TH}>Rencana bayar</th>
                </tr>
              </thead>
              <tbody>
                {ang.baris.map(({ alokasi: a, detail: d }) => (
                  <tr key={a.id}>
                    <td className={TD}>{[d.komponen, d.subKomponen].filter(Boolean).join(".")}</td>
                    <td className={TD}>
                      <span className="font-mono text-[11.5px] text-[#6E4F0E]">{d.akun}</span> {d.uraian}
                    </td>
                    <td className={`${TD} text-right font-semibold`}>
                      {rupiah(a.nilai)}
                      {a.volume !== null && d.satuan ? <span className="block text-[11px] font-normal text-[#6B7A90]">{`${a.volume} ${d.satuan}`}</span> : null}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        {a.rencana.length === 0 ? <Chip w="wait">Belum dijadwalkan</Chip> : a.rencana.map((r, i) => <Chip key={i} w="mut">{`${BULAN_PENDEK[Number(r.bulan.slice(5, 7)) - 1]} ${rupiah(r.nilai)}`}</Chip>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kartu>

      <Kartu judul="Tahap GSBPM" ket="Nyalakan tahap yang dijalankan satker untuk kegiatan ini, lalu buka untuk identifikasi">
        <ol className="flex flex-col">
          {TAHAP_GSBPM.map((t, i) => {
            const isian = keg.tahap[t.kode];
            const s = statusTahap(isian);
            const akhir = i === TAHAP_GSBPM.length - 1;
            return (
              <li key={t.kode} className="flex gap-3">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-extrabold ${
                      s === "sudah" ? "bg-[#13794B] text-white" : s === "belum" ? "bg-[#0F2A52] text-white" : "border-2 border-[#CBD6E6] bg-white text-[#9AA7B6]"
                    }`}
                  >
                    {s === "sudah" ? "✓" : t.no}
                  </span>
                  {!akhir && <span className="w-0.5 flex-1 bg-[#DDE6F3]" aria-hidden />}
                </div>
                <div className={`mb-3 flex min-w-0 flex-1 flex-col gap-2 rounded-xl border p-3.5 ${s === "tidak_dipakai" ? "border-dashed border-[#CBD6E6] bg-[#FAFBFD]" : "border-[#DDE6F3] bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold text-[#14202E]">{t.nama}</span>
                    <span className="rounded-md bg-[#EEF3FA] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#33445C]">GSBPM {t.gsbpm}</span>
                    {t.wajib ? <Chip w="navy">Wajib</Chip> : t.kapan ? <span className="text-[11.5px] text-[#6B7A90]">{t.kapan}</span> : null}
                    <span className="flex-1" />
                    {s === "sudah" ? <Chip w="ok">Sudah diidentifikasi</Chip> : s === "belum" ? <Chip w="wait">Belum diidentifikasi</Chip> : <Chip w="mut">Tidak dipakai</Chip>}
                  </div>
                  <p className="text-[12.5px] text-[#4D5B6B]">{t.uraian}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className={BTN}
                      disabled={s === "tidak_dipakai"}
                      onClick={() => pergi({ ro: ro.id, keg: keg.id, tahap: t.kode })}
                      title={s === "tidak_dipakai" ? "Nyalakan tahap ini dulu" : undefined}
                    >
                      Buka tahap →
                    </button>
                    {!t.wajib && (
                      <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[#33445C]">
                        <input type="checkbox" className="h-4 w-4" checked={isian.dipakai} onChange={(e) => ganti(aturTahapDipakai(keg, t.kode, e.target.checked, sekarang()))} />
                        Dipakai untuk kegiatan ini
                      </label>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Kartu>
    </>
  );
}

// ---------------------------------------------------------------- Tingkat 4: satu tahap (form identifikasi menyusul)
function DetailTahap({ ro, keg, kode, pergi }: { ro: Ro; keg: KegiatanUtama; kode: KodeTahap; pergi: (p: Posisi) => void }) {
  const t = definisiTahap(kode)!;
  const dipakai = TAHAP_GSBPM.filter((x) => keg.tahap[x.kode]?.dipakai);
  const idx = dipakai.findIndex((x) => x.kode === kode);
  const seb = idx > 0 ? dipakai[idx - 1] : null;
  const ber = idx >= 0 && idx < dipakai.length - 1 ? dipakai[idx + 1] : null;

  return (
    <>
      {!keg.tahap[kode]?.dipakai && <Pesan jenis="info">Tahap ini sedang tidak dipakai untuk kegiatan ini. Nyalakan dari halaman kegiatan.</Pesan>}
      <Kartu judul="Identifikasi tahap" ket={`GSBPM ${t.gsbpm}`}>
        <p className="text-[13.5px] text-[#4D5B6B]">{t.uraian}</p>
        <div className="mt-3 rounded-xl border border-dashed border-[#CBD6E6] bg-[#FAFBFD] p-3.5">
          <p className="text-[12.5px] font-bold text-[#33445C]">Form identifikasi dibuat pada langkah berikut. Yang akan ditanyakan:</p>
          <ul className="mt-2 grid gap-1.5 text-[13px] text-[#14202E] sm:grid-cols-2">
            {t.identifikasi.map((x) => (
              <li key={x} className="flex gap-2">
                <span aria-hidden className="text-[#9AA7B6]">•</span>
                {x}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-[#6B7A90]">Dari jawaban ini akan diturunkan modul kerja dan paket administrasi per mata anggaran untuk tahap {t.nama.toLowerCase()}.</p>
        </div>
      </Kartu>
      <div className="flex flex-wrap justify-between gap-2">
        {seb ? (
          <button type="button" className={BTN_O} onClick={() => pergi({ ro: ro.id, keg: keg.id, tahap: seb.kode })}>
            ← {seb.no}. {seb.nama}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className={BTN_O} onClick={() => pergi({ ro: ro.id, keg: keg.id, tahap: null })}>
          Semua tahap
        </button>
        {ber ? (
          <button type="button" className={BTN_O} onClick={() => pergi({ ro: ro.id, keg: keg.id, tahap: ber.kode })}>
            {ber.no}. {ber.nama} →
          </button>
        ) : (
          <span />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Tingkat RO: 3 bagian
function TingkatRo({ data, ro, bagian, simpan, pergi }: { data: DataUji; ro: Ro; bagian: Bagian; simpan: (d: DataUji) => void; pergi: (p: Posisi) => void }) {
  const pokRo = data.pok.filter((d) => d.roId === ro.id);
  const rr = ringkasRo(pokRo, data.alokasi);
  return (
    <>
      <div role="tablist" aria-label="Bagian RO" className="flex flex-wrap gap-1 rounded-xl border border-[#E3E8EE] bg-white p-1">
        {BAGIAN.map((b) => (
          <button
            key={b.kode}
            type="button"
            role="tab"
            aria-selected={bagian === b.kode}
            onClick={() => pergi({ ro: ro.id, keg: null, tahap: null, bagian: b.kode })}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-[13px] ${bagian === b.kode ? "bg-[#E3EEFB] font-bold text-[#1F5FD1]" : "text-[#4D5B6B] hover:bg-[#F8FAFC]"}`}
          >
            {b.label}
            {b.kode === "pok" && pokRo.length > 0 && rr.belumBaris + rr.sebagianBaris > 0 && (
              <span className="rounded-full bg-[#FFF4D6] px-1.5 text-[11px] font-bold text-[#8A6200]" title="Baris belum/sebagian dipetakan">
                {rr.belumBaris + rr.sebagianBaris}
              </span>
            )}
          </button>
        ))}
      </div>
      {bagian === "kegiatan" && <DaftarKegiatan data={data} ro={ro} simpan={simpan} pergi={pergi} />}
      {bagian === "pok" && <PanelPok data={data} ro={ro} simpan={simpan} />}
      {bagian === "rencana" && <PanelRencana data={data} ro={ro} pergi={pergi} />}
    </>
  );
}

const STATUS_DETAIL: Record<StatusDetail, { label: string; w: "ok" | "wait" | "bad" | "navy" }> = {
  belum: { label: "Belum dipetakan", w: "bad" },
  sebagian: { label: "Sebagian", w: "wait" },
  penuh: { label: "Terpetakan", w: "ok" },
  lebih: { label: "Melebihi pagu", w: "bad" },
};

// ---------------------------------------------------------------- Baris POK: muat dari Excel + pemetaan
function PanelPok({ data, ro, simpan }: { data: DataUji; ro: Ro; simpan: (d: DataUji) => void }) {
  const pokRo = data.pok.filter((d) => d.roId === ro.id);
  const kegRo = data.kegiatan.filter((k) => k.roId === ro.id);
  const rr = ringkasRo(pokRo, data.alokasi);
  const [muatBuka, setMuatBuka] = useState(pokRo.length === 0);
  const [teks, setTeks] = useState("");
  const [pratinjau, setPratinjau] = useState<HasilTempel | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saring, setSaring] = useState<"semua" | StatusDetail>("semua");
  const [atur, setAtur] = useState<string | null>(null);
  const [hapus, setHapus] = useState<string | null>(null);

  const simpanMuatan = () => {
    if (!pratinjau || pratinjau.baris.length === 0) return;
    const g = gabungMuatan(data.pok, ro.id, pratinjau.baris, () => idAcak("pok"));
    simpan({ ...data, pok: g.detail });
    setInfo(
      `${g.ditambah} baris ditambah, ${g.diperbarui} diperbarui${g.tidakAdaDiMuatan ? `, ${g.tidakAdaDiMuatan} baris lama tidak ada di tempelan (tetap disimpan)` : ""}.`
    );
    setTeks("");
    setPratinjau(null);
    setMuatBuka(false);
  };

  const tampil = pokRo
    .map((d) => ({ d, r: ringkasDetail(d, data.alokasi) }))
    .filter((x) => saring === "semua" || x.r.status === saring)
    .sort((a, b) => `${a.d.komponen}.${a.d.subKomponen}.${a.d.akun}`.localeCompare(`${b.d.komponen}.${b.d.subKomponen}.${b.d.akun}`));
  const grup: { kunci: string; isi: typeof tampil }[] = [];
  for (const x of tampil) {
    const k = [x.d.komponen, x.d.subKomponen].filter(Boolean).join(".") || "Tanpa komponen";
    const g = grup.find((y) => y.kunci === k);
    if (g) g.isi.push(x);
    else grup.push({ kunci: k, isi: [x] });
  }
  const namaKeg = (id: string) => data.kegiatan.find((k) => k.id === id)?.nama ?? "?";

  return (
    <>
      {pokRo.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <KartuAngka label="Pagu baris POK dimuat" nilai={rupiah(rr.pagu)} ket={`${pokRo.length} baris`} />
          <KartuAngka label="Teralokasi ke kegiatan" nilai={rupiah(rr.teralokasi)} warna="#13794B" />
          <KartuAngka label="Belum dipetakan" nilai={rupiah(rr.belumNilai)} ket={`${rr.belumBaris} baris kosong · ${rr.sebagianBaris} sebagian`} warna={rr.belumNilai > 0 ? "#8A6200" : undefined} />
          <KartuAngka label="Melebihi pagu" nilai={rr.lebihBaris} ket="baris" warna={rr.lebihBaris > 0 ? "#B42329" : undefined} />
        </div>
      )}
      {info && (
        <Pesan jenis="ok" onTutup={() => setInfo(null)}>
          {info}
        </Pesan>
      )}
      <Kartu
        judul="Muat baris POK"
        ket="Tempel dari Excel RKKS/POK untuk RO ini"
        kanan={
          <button type="button" className={BTN_O} onClick={() => setMuatBuka((v) => !v)} aria-expanded={muatBuka}>
            {muatBuka ? "Tutup" : pokRo.length ? "Muat ulang / tambah" : "Buka"}
          </button>
        }
      >
        {muatBuka && (
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] text-[#4D5B6B]">
              Salin baris detail di Excel (tanpa baris judul pun boleh) dengan urutan kolom: <span className="font-semibold">{KOLOM_TEMPEL.join(" | ")}</span>. Jumlah boleh
              kosong bila volume dan harga satuan terisi. Memuat ulang tidak menghapus baris lama dan tidak menghilangkan pemetaan baris yang sama.
            </p>
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
              Tempelan
              <textarea
                className={`${INPUT} min-h-[140px] font-mono text-[12px]`}
                value={teks}
                onChange={(e) => {
                  setTeks(e.target.value);
                  setPratinjau(null);
                }}
                placeholder={"052\tA\t524113\tTransport lokal pencacah Susenas Maret\t120\tO-K\t170.000\t20.400.000"}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_O} disabled={!teks.trim()} onClick={() => setPratinjau(bacaTempelanPok(teks))}>
                Baca tempelan
              </button>
              {pratinjau && pratinjau.baris.length > 0 && (
                <button type="button" className={BTN} onClick={simpanMuatan}>
                  Simpan {pratinjau.baris.length} baris ke RO {ro.kode}
                </button>
              )}
            </div>
            {pratinjau && (
              <div className="rounded-xl border border-[#DDE6F3] bg-[#F8FAFE] p-3 text-[12.5px]">
                <p className="font-semibold text-[#14202E]">
                  Terbaca {pratinjau.baris.length} baris · pagu {rupiah(pratinjau.baris.reduce((s, b) => s + b.jumlah, 0))}
                  {pratinjau.galat.length ? ` · ${pratinjau.galat.length} baris ditolak` : ""}
                </p>
                {pratinjau.galat.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-5 text-[#B42329]">
                    {pratinjau.galat.slice(0, 15).map((g) => (
                      <li key={g.baris}>
                        Baris {g.baris}: {g.pesan}
                      </li>
                    ))}
                    {pratinjau.galat.length > 15 && <li>… dan {pratinjau.galat.length - 15} lainnya</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Kartu>

      {pokRo.length > 0 && (
        <Kartu
          judul="Pemetaan baris POK ke kegiatan"
          ket="Satu baris boleh dibagi ke beberapa kegiatan"
          kanan={
            <label className="flex items-center gap-2 text-[12.5px] text-[#4D5B6B]">
              Tampilkan
              <select className={INPUT} value={saring} onChange={(e) => setSaring(e.target.value as typeof saring)}>
                <option value="semua">Semua baris</option>
                <option value="belum">Belum dipetakan</option>
                <option value="sebagian">Sebagian</option>
                <option value="penuh">Terpetakan</option>
                <option value="lebih">Melebihi pagu</option>
              </select>
            </label>
          }
        >
          {kegRo.length === 0 && <Pesan jenis="info">Tambahkan kegiatan di tab Kegiatan dulu, lalu petakan baris POK ke kegiatan.</Pesan>}
          {grup.length === 0 && <p className="text-[13px] text-[#6B7A90]">Tidak ada baris dengan status ini.</p>}
          <div className="flex flex-col gap-3">
            {grup.map((g) => (
              <section key={g.kunci} className="overflow-hidden rounded-xl border border-[#DDE6F3]">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F5F8FE] px-3.5 py-2 text-[12.5px]">
                  <span className="font-bold text-[#14202E]">Komponen {g.kunci}</span>
                  <span className="text-[#4D5B6B]">{rupiah(g.isi.reduce((s, x) => s + x.d.jumlah, 0))}</span>
                </div>
                <ul>
                  {g.isi.map(({ d, r }) => {
                    const st = STATUS_DETAIL[r.status];
                    const alk = data.alokasi.filter((a) => a.detailId === d.id);
                    return (
                      <li key={d.id} className="border-t border-[#EEF2F7] px-3.5 py-2.5">
                        <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
                          <div className="min-w-[220px] flex-[3]">
                            <p className="text-[13px] text-[#14202E]">
                              <span className="font-mono text-[12px] font-bold text-[#6E4F0E]">{d.akun}</span> {d.uraian}
                            </p>
                            <p className="text-[11.5px] text-[#6B7A90]">
                              {d.volume !== null ? `${d.volume} ${d.satuan}` : "—"}
                              {d.harga !== null ? ` × ${rupiah(d.harga)}` : ""}
                            </p>
                          </div>
                          <div className="min-w-[120px] flex-1 text-right text-[13px]">
                            <p className="font-bold text-[#14202E]">{rupiah(d.jumlah)}</p>
                            {r.status !== "belum" && <p className="text-[11.5px] text-[#6B7A90]">teralokasi {rupiah(r.teralokasi)}</p>}
                          </div>
                          <div className="flex min-w-[220px] flex-[2] flex-wrap items-center gap-1.5">
                            <Chip w={st.w}>{st.label}</Chip>
                            {alk.map((a) => (
                              <Chip key={a.id} w="navy" title={rupiah(a.nilai)}>
                                {namaKeg(a.kegiatanId)}
                              </Chip>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button type="button" className={atur === d.id ? BTN_O : BTN} disabled={kegRo.length === 0} onClick={() => setAtur(atur === d.id ? null : d.id)} aria-expanded={atur === d.id}>
                              {atur === d.id ? "Tutup" : "Petakan"}
                            </button>
                            {alk.length === 0 &&
                              (hapus === d.id ? (
                                <>
                                  <button type="button" className={BTN_R} onClick={() => simpan({ ...data, pok: data.pok.filter((x) => x.id !== d.id) })}>
                                    Ya, hapus
                                  </button>
                                  <button type="button" className={BTN_O} onClick={() => setHapus(null)}>
                                    Batal
                                  </button>
                                </>
                              ) : (
                                <button type="button" className={BTN_O} onClick={() => setHapus(d.id)} title="Hapus baris dari uji coba">
                                  Hapus
                                </button>
                              ))}
                          </div>
                        </div>
                        {atur === d.id && (
                          <EditorAlokasi
                            d={d}
                            awal={alk}
                            kegiatan={kegRo}
                            tahun={ro.tahun}
                            onBatal={() => setAtur(null)}
                            onSimpan={(baru) => {
                              simpan({ ...data, alokasi: [...data.alokasi.filter((a) => a.detailId !== d.id), ...baru] });
                              setAtur(null);
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Kartu>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Editor alokasi satu baris POK (banyak kegiatan + rencana bayar)
type DrafAlokasi = { id: string; kegiatanId: string; volume: string; nilai: string; rencana: { bulan: string; nilai: string }[] };

function EditorAlokasi({
  d,
  awal,
  kegiatan,
  tahun,
  onSimpan,
  onBatal,
}: {
  d: DetailPok;
  awal: Alokasi[];
  kegiatan: KegiatanUtama[];
  tahun: number;
  onSimpan: (a: Alokasi[]) => void;
  onBatal: () => void;
}) {
  const pakaiVolume = d.harga !== null;
  const [draf, setDraf] = useState<DrafAlokasi[]>(() =>
    awal.length
      ? awal.map((a) => ({
          id: a.id,
          kegiatanId: a.kegiatanId,
          volume: a.volume !== null ? String(a.volume) : "",
          nilai: String(a.nilai),
          rencana: a.rencana.map((r) => ({ bulan: r.bulan, nilai: String(r.nilai) })),
        }))
      : [{ id: idAcak("alk"), kegiatanId: kegiatan.length === 1 ? kegiatan[0].id : "", volume: d.volume !== null ? String(d.volume) : "", nilai: String(d.jumlah), rencana: [] }]
  );
  const [salah, setSalah] = useState<string | null>(null);

  const jadi = (x: DrafAlokasi): Alokasi => ({
    id: x.id,
    detailId: d.id,
    kegiatanId: x.kegiatanId,
    volume: pakaiVolume ? parseAngka(x.volume) : null,
    nilai: nilaiAlokasi(d, pakaiVolume ? parseAngka(x.volume) : null, parseAngka(x.nilai)),
    rencana: x.rencana.map((r) => ({ bulan: r.bulan, nilai: parseAngka(r.nilai) ?? 0 })),
  });
  const hasil = draf.map(jadi);
  const total = hasil.reduce((s, a) => s + a.nilai, 0);
  const ubah = (i: number, v: Partial<DrafAlokasi>) => setDraf((x) => x.map((y, j) => (j === i ? { ...y, ...v } : y)));

  const tambah = () => {
    const sisa = d.jumlah - total;
    setDraf((x) => [
      ...x,
      {
        id: idAcak("alk"),
        kegiatanId: "",
        volume: pakaiVolume && sisa > 0 ? String(Math.floor((sisa / (d.harga as number)) * 1000) / 1000) : "",
        nilai: sisa > 0 ? String(Math.round(sisa)) : "",
        rencana: [],
      },
    ]);
  };

  const kirim = () => {
    const err = periksaAlokasiDetail(d, hasil, tahun);
    if (err) return setSalah(err);
    onSimpan(hasil);
  };

  return (
    <div className="mt-2.5 flex flex-col gap-2.5 rounded-xl border border-[#CBD6E6] bg-[#F8FAFE] p-3">
      <p className="text-[12.5px] text-[#4D5B6B]">
        Pagu baris {rupiah(d.jumlah)} · dialokasikan {rupiah(total)} · sisa <span className={d.jumlah - total < 0 ? "font-bold text-[#B42329]" : "font-bold"}>{rupiah(d.jumlah - total)}</span>
        {pakaiVolume ? ` · harga satuan ${rupiah(d.harga as number)} per ${d.satuan || "satuan"}` : ""}
      </p>
      {draf.map((x, i) => {
        const a = hasil[i];
        const terencana = a.rencana.reduce((s, r) => s + r.nilai, 0);
        return (
          <div key={x.id} className="flex flex-col gap-2 rounded-lg border border-[#DDE6F3] bg-white p-2.5">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
                Kegiatan
                <select className={INPUT} value={x.kegiatanId} onChange={(e) => ubah(i, { kegiatanId: e.target.value })}>
                  <option value="">Pilih kegiatan…</option>
                  {kegiatan.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama}
                    </option>
                  ))}
                </select>
              </label>
              {pakaiVolume ? (
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
                  Volume ({d.satuan || "satuan"}) → {rupiah(a.nilai)}
                  <input className={INPUT} inputMode="decimal" value={x.volume} onChange={(e) => ubah(i, { volume: e.target.value })} />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
                  Nilai (Rp)
                  <input className={INPUT} inputMode="numeric" value={x.nilai} onChange={(e) => ubah(i, { nilai: e.target.value })} />
                </label>
              )}
              <button type="button" className={BTN_R} onClick={() => setDraf((y) => y.filter((_, j) => j !== i))}>
                Hapus
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-[12px] font-semibold text-[#4D5B6B]">
                Rencana bayar · terjadwal {rupiah(terencana)}
                {a.nilai - terencana > 0.5 ? ` · belum dijadwalkan ${rupiah(a.nilai - terencana)}` : ""}
              </p>
              {x.rencana.map((r, ri) => (
                <div key={ri} className="flex flex-wrap items-center gap-2">
                  <input
                    type="month"
                    className={INPUT}
                    aria-label="Bulan bayar"
                    min={`${tahun}-01`}
                    max={`${tahun}-12`}
                    value={r.bulan}
                    onChange={(e) => ubah(i, { rencana: x.rencana.map((y, j) => (j === ri ? { ...y, bulan: e.target.value } : y)) })}
                  />
                  <input
                    className={`${INPUT} w-[150px]`}
                    inputMode="numeric"
                    aria-label="Nilai bayar (Rp)"
                    value={r.nilai}
                    onChange={(e) => ubah(i, { rencana: x.rencana.map((y, j) => (j === ri ? { ...y, nilai: e.target.value } : y)) })}
                  />
                  <button type="button" className={BTN_O} onClick={() => ubah(i, { rencana: x.rencana.filter((_, j) => j !== ri) })}>
                    Hapus
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className={BTN_O}
                  onClick={() => {
                    const sisa = a.nilai - terencana;
                    ubah(i, { rencana: [...x.rencana, { bulan: "", nilai: sisa > 0 ? String(Math.round(sisa)) : "" }] });
                  }}
                >
                  ＋ Rencana bayar
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {salah && <p className="text-[12.5px] font-semibold text-[#B42329]">{salah}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_O} onClick={tambah}>
          ＋ Kegiatan lain
        </button>
        <span className="flex-1" />
        <button type="button" className={BTN_O} onClick={onBatal}>
          Batal
        </button>
        <button type="button" className={BTN} onClick={kirim}>
          Simpan pemetaan
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Rencana realisasi: kegiatan x bulan
const ringkasRp = (n: number) => (n === 0 ? "–" : n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : rupiah(n));

function PanelRencana({ data, ro, pergi }: { data: DataUji; ro: Ro; pergi: (p: Posisi) => void }) {
  const pokRo = data.pok.filter((d) => d.roId === ro.id);
  const m = matriksRencana(pokRo, data.alokasi, data.kegiatan.filter((k) => k.roId === ro.id), ro.tahun);
  if (pokRo.length === 0)
    return (
      <Kartu judul="Rencana realisasi">
        <p className="text-[13px] text-[#6B7A90]">Muat baris POK dan petakan ke kegiatan dulu. Rencana realisasi disusun dari rencana bayar setiap alokasi.</p>
        <button type="button" className={`${BTN} mt-3`} onClick={() => pergi({ ro: ro.id, keg: null, tahap: null, bagian: "pok" })}>
          Ke Baris POK
        </button>
      </Kartu>
    );
  const terjadwal = m.baris.reduce((s, b) => s + b.terjadwal, 0);
  return (
    <Kartu judul="Rencana realisasi" ket={`TA ${ro.tahun} · terjadwal ${rupiah(terjadwal)} dari ${rupiah(m.total)}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-[12px]">
          <thead>
            <tr>
              <th className={TH}>Kegiatan</th>
              {BULAN_PENDEK.map((b) => (
                <th key={b} className={`${TH} text-right`}>
                  {b}
                </th>
              ))}
              <th className={`${TH} text-right`}>Alokasi</th>
              <th className={`${TH} text-right`}>Belum dijadwalkan</th>
            </tr>
          </thead>
          <tbody>
            {m.baris.map((b) => (
              <tr key={b.kunci} className={b.kunci === "__belum" ? "bg-[#FFF8E6]" : undefined}>
                <td className={`${TD} max-w-[260px]`}>
                  {b.kunci === "__belum" ? (
                    <span className="font-semibold text-[#8A6200]">{b.label}</span>
                  ) : (
                    <button type="button" className="text-left font-semibold text-[#1F5FD1] hover:underline" onClick={() => pergi({ ro: ro.id, keg: b.kunci, tahap: null })}>
                      {b.label}
                    </button>
                  )}
                </td>
                {b.perBulan.map((n, i) => (
                  <td key={i} className={`${TD} text-right tabular-nums`} title={n ? rupiah(n) : undefined}>
                    {ringkasRp(n)}
                  </td>
                ))}
                <td className={`${TD} text-right font-semibold tabular-nums`} title={rupiah(b.nilai)}>
                  {ringkasRp(b.nilai)}
                </td>
                <td className={`${TD} text-right tabular-nums ${b.belumDijadwalkan > 0.5 ? "font-semibold text-[#8A6200]" : ""}`} title={rupiah(b.belumDijadwalkan)}>
                  {ringkasRp(Math.max(0, b.belumDijadwalkan))}
                </td>
              </tr>
            ))}
            <tr>
              <td className={`${TD} font-bold`}>Total RO</td>
              {m.totalBulan.map((n, i) => (
                <td key={i} className={`${TD} text-right font-bold tabular-nums`} title={n ? rupiah(n) : undefined}>
                  {ringkasRp(n)}
                </td>
              ))}
              <td className={`${TD} text-right font-bold tabular-nums`} title={rupiah(m.total)}>
                {ringkasRp(m.total)}
              </td>
              <td className={`${TD} text-right font-bold tabular-nums`} title={rupiah(m.total - terjadwal)}>
                {ringkasRp(Math.max(0, m.total - terjadwal))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-[#6B7A90]">Angka dalam juta rupiah (arahkan kursor untuk nilai lengkap). Rencana bayar diatur per alokasi di tab Baris POK.</p>
    </Kartu>
  );
}
