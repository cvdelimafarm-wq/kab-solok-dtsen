"use client";

// app/sigap/kelola/perencanaan/page.tsx
//
// (11 Okt 2026) Perencanaan kegiatan berbasis GSBPM per RO anggaran -- UJI COBA, permintaan user ("buatkan hierarkhynya dulu").
// Hierarki: RO anggaran -> kegiatan utama -> 6 tahap GSBPM -> (form identifikasi tahap: langkah berikut).
// Keputusan user 11 Okt: halaman uji coba di web (bukan mockup), hanya Admin Aplikasi (izin portal.kelola), data disimpan di
// browser dulu (localStorage, kunci sigap_uji_perencanaan_v1) sampai aturan disetujui -- tidak ada tabel/migrasi, modul lain tidak disentuh.
// Posisi hierarki ada di alamat (?ro=&keg=&tahap=) supaya tombol Back naik satu tingkat.
// Logika murni & uji: lib/perencanaanGsbpm.ts, lib/__tests__/perencanaanGsbpm.test.ts. Rancangan: claude/rancangan-identifikasi-gsbpm-ro.md.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Bingkai from "../../kontrak/Bingkai";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir, tglSedang } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
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

type Posisi = { ro: string | null; keg: string | null; tahap: KodeTahap | null };

function posisiDariAlamat(): Posisi {
  if (typeof window === "undefined") return { ro: null, keg: null, tahap: null };
  const q = new URLSearchParams(window.location.search);
  const t = q.get("tahap");
  return { ro: q.get("ro"), keg: q.get("keg"), tahap: t && definisiTahap(t) ? (t as KodeTahap) : null };
}

function alamat(p: Posisi): string {
  const q = new URLSearchParams();
  if (p.ro) q.set("ro", p.ro);
  if (p.keg) q.set("keg", p.keg);
  if (p.tahap) q.set("tahap", p.tahap);
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
  const sub = tahap ? `Tahap ${tahap.no} · GSBPM ${tahap.gsbpm} · ${keg?.nama}` : keg ? `RO ${ro?.kode} · ${ro?.nama}` : ro ? ro.nama : "RO anggaran → kegiatan utama → tahap GSBPM";

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
          <DaftarKegiatan data={data} ro={ro} simpan={simpan} pergi={pergi} />
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
  if (ro && keg) item.push({ label: keg.nama, ke: { ro: ro.id, keg: keg.id, tahap: null }, tingkat: "Kegiatan utama" });
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
      {data.ro.length === 0 && <p className="text-[13.5px] text-[#6B7A90]">Belum ada RO. Tambahkan RO dari POK, lalu kegiatan utama yang memakainya.</p>}
      <ul className="grid gap-2.5 md:grid-cols-2">
        {data.ro.map((r) => {
          const keg = data.kegiatan.filter((k) => k.roId === r.id);
          const bertaut = keg.filter((k) => k.subKomponen.length > 0).length;
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-[#DDE6F3] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#FBF1D6] px-2 py-0.5 font-mono text-[12.5px] font-bold text-[#6E4F0E]">{r.kode}</span>
                {r.program && <span className="text-[11.5px] text-[#6B7A90]">{r.program}</span>}
              </div>
              <p className="text-[14px] font-bold leading-snug text-[#14202E]">{r.nama}</p>
              <p className="text-[12.5px] text-[#4D5B6B]">
                {keg.length} kegiatan utama · {bertaut} bertaut anggaran
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={BTN} onClick={() => pergi({ ro: r.id, keg: null, tahap: null })}>
                  Buka RO →
                </button>
                {keg.length === 0 &&
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
  const [sub, setSub] = useState(awal.subKomponen.join(", "));
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
        Nama kegiatan utama
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
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#4D5B6B]">
        Tautan Sub Komponen / detail POK (pisahkan dengan koma)
        <input className={INPUT} value={sub} onChange={(e) => setSub(e.target.value)} placeholder="mis. 052.A, 052.B" />
      </label>
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
  const [tambah, setTambah] = useState(false);
  const [duplikat, setDuplikat] = useState<string | null>(null);
  const [hapus, setHapus] = useState<string | null>(null);
  const daftar = data.kegiatan.filter((k) => k.roId === ro.id);
  const namaAsal = (id: string | null) => (id ? data.kegiatan.find((k) => k.id === id)?.nama ?? null : null);

  return (
    <Kartu
      judul="Kegiatan utama"
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
      {daftar.length === 0 && <p className="text-[13.5px] text-[#6B7A90]">Belum ada kegiatan utama untuk RO ini.</p>}
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
                  {r.tautanAnggaran ? k.subKomponen.map((s) => <Chip key={s} w="navy">{s}</Chip>) : <Chip w="wait">Tautan anggaran belum diisi</Chip>}
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
                    <button type="button" className={BTN_R} onClick={() => simpan({ ...data, kegiatan: data.kegiatan.filter((x) => x.id !== k.id) })}>
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
                  catatan="Tahap yang dipakai dan jawaban identifikasi ikut tersalin. Ganti nama, periode, dan tautan anggaran."
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
              <dt className="text-[12px] text-[#6B7A90]">Tautan Sub Komponen / detail POK</dt>
              <dd className="flex flex-wrap gap-1.5 pt-0.5">{keg.subKomponen.length ? keg.subKomponen.map((s) => <Chip key={s} w="navy">{s}</Chip>) : <Chip w="wait">Belum diisi</Chip>}</dd>
            </div>
          </dl>
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
