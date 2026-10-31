"use client";

// app/sigap/akses/DaftarPegawai.tsx
//
// (31 Okt 2026) Tabel "Daftar pegawai organik" di tab Pengguna. Urutan kolom: No, Nama, Kecamatan & Nagari domisili (dua kolom), NIP lama/baru, jabatan,
// tanggal lahir, usia, TMT, masa kerja, email, status, jenis kelamin, kecamatan kantor.
// - Judul kolom memakai standar tabel SIGAP (app/sigap/admin/KepalaKolom + lib/sigapTabelKolom): cari, urut, dan filter nilai per kolom.
// - Klik nama -> baris terbuka berisi tombol Reset PIN dan Edit (domisili & kecamatan kantor).
// - Usia dan masa kerja dihitung di layar dari tanggal lahir/TMT (tahun-bulan-hari) dan ikut bergerak tiap hari, bukan angka tersimpan.
// NIP disamarkan kecuali "Tampilkan NIP lengkap" (izin kelola, tercatat di audit).

import { Fragment, useEffect, useMemo, useState } from "react";
import { BTN, BTN_O, Chip, INPUT, Kartu, TabelKartu, TD, TH } from "../admin/ui";
import KepalaKolom from "../admin/KepalaKolom";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { durasi, saringPegawai, tanggalWib, teksDurasi, type BarisPegawai, type DaftarWilayah, type RingkasPegawai, type SaringanPegawai } from "@/lib/pegawaiOrganik";
import { adaSaring, nilaiBeda, terapkanTabel, type NilaiSel, type Saring, type Urut } from "@/lib/sigapTabelKolom";

type Props = {
  baris: BarisPegawai[];
  ringkasan: RingkasPegawai;
  memuat: boolean;
  bolehKelola: boolean;
  nipPenuh: boolean;
  onAlihNip: () => void;
  onMuat: () => void;
  onResetPin: (akunId: number, nama: string) => void;
  wilayah: DaftarWilayah | null;
  /** Simpan domisili/kecamatan kantor satu pegawai; melempar galat bila gagal (pesan ditampilkan di dialog). */
  onSimpan: (v: { profil_id: number; domisili_kecamatan: string | null; domisili_nagari: string | null; kantor_kecamatan: string | null; kantor_semua: boolean }) => Promise<void>;
};

type Isian = { kecamatan: string; nagari: string; kantor: string; semua: boolean };

function DialogUbah({ b, wilayah, onTutup, onSimpan }: { b: BarisPegawai; wilayah: DaftarWilayah | null; onTutup: () => void; onSimpan: Props["onSimpan"] }) {
  const [f, setF] = useState<Isian>({ kecamatan: b.domisili_kecamatan ?? "", nagari: b.domisili_nagari ?? "", kantor: b.kantor_kecamatan ?? "", semua: false });
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useTutupDenganBack(true, () => !sibuk && onTutup()); // Back HP menutup dialog (sama dengan Batal)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !sibuk && onTutup();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onTutup, sibuk]);

  // pilihan selalu memuat nilai yang sedang tersimpan agar tidak hilang diam-diam bila tidak ada di daftar wilayah
  const daftarKec = useMemo(() => {
    const d = wilayah?.kecamatan ?? [];
    return [f.kecamatan, f.kantor].reduce((a, v) => (v && !a.includes(v) ? [...a, v] : a), d);
  }, [wilayah, f.kecamatan, f.kantor]);
  const daftarNag = useMemo(() => {
    const d = (wilayah?.nagari ?? []).filter((n) => n.kecamatan === f.kecamatan).map((n) => n.nagari);
    return f.nagari && !d.includes(f.nagari) ? [...d, f.nagari] : d;
  }, [wilayah, f.kecamatan, f.nagari]);

  async function simpan() {
    setSibuk(true);
    setGalat(null);
    try {
      await onSimpan({ profil_id: b.profil_id as number, domisili_kecamatan: f.kecamatan || null, domisili_nagari: f.nagari || null, kantor_kecamatan: f.kantor || null, kantor_semua: f.semua });
      onTutup();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  }

  const label = "block text-[12.5px] font-semibold text-[#44546F]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => !sibuk && onTutup()}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-ubah-pegawai" className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="judul-ubah-pegawai" className="text-[16px] font-extrabold text-[#14202E]">
          Edit domisili & kantor
        </h2>
        <p className="text-[13px] text-[#55657D]">{b.nama}</p>
        <label className={label}>
          Kecamatan domisili
          <select className={`${INPUT} mt-1 w-full`} value={f.kecamatan} onChange={(e) => setF({ ...f, kecamatan: e.target.value, nagari: "" })}>
            <option value="">(kosong)</option>
            {daftarKec.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Nagari domisili
          <select className={`${INPUT} mt-1 w-full`} value={f.nagari} disabled={!f.kecamatan} onChange={(e) => setF({ ...f, nagari: e.target.value })}>
            <option value="">(kosong)</option>
            {daftarNag.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Kecamatan kantor
          <select className={`${INPUT} mt-1 w-full`} value={f.kantor} onChange={(e) => setF({ ...f, kantor: e.target.value })}>
            <option value="">(kosong)</option>
            {daftarKec.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#44546F]">
          <input type="checkbox" checked={f.semua} onChange={(e) => setF({ ...f, semua: e.target.checked })} />
          Terapkan kecamatan kantor ini ke semua pegawai
        </label>
        {galat && <p className="rounded-lg bg-[#FDECEA] px-3 py-2 text-[13px] font-semibold text-[#8A2B1D]">{galat}</p>}
        <div className="flex gap-2">
          <button type="button" className={`${BTN_O} flex-1`} onClick={onTutup} disabled={sibuk}>
            Batal
          </button>
          <button type="button" className={`${BTN} flex-1`} onClick={() => void simpan()} disabled={sibuk}>
            {sibuk ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "–" : v);
const teksJk = (b: BarisPegawai) => (b.jenis_kelamin === "L" ? "Laki-laki" : b.jenis_kelamin === "P" ? "Perempuan" : null);

/** Tanggal hari ini (WIB) menurut jam perangkat; diperbarui tiap menit supaya usia dan masa kerja ikut bergerak saat halaman dibiarkan terbuka. */
function useHariIni(): string {
  const [h, setH] = useState(() => tanggalWib(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setH(tanggalWib(Date.now())), 60_000);
    return () => clearInterval(t);
  }, []);
  return h;
}

const JUMLAH_KOLOM = 15;

type Kol = "nama" | "kec" | "nag" | "niplama" | "nipbaru" | "jabatan" | "lahir" | "usia" | "tmt" | "kerja" | "email" | "status" | "jk" | "kantor";
/** Kolom tabel (urutan tampil). `angka` = diurut dan disaring sebagai angka. Usia/Masa kerja: angka tahun penuh (tampilan sel tetap tahun-bulan-hari). */
const KOLOM: { id: Kol; label: string; angka: boolean }[] = [
  { id: "nama", label: "Nama Lengkap", angka: false },
  { id: "kec", label: "Kecamatan Domisili", angka: false },
  { id: "nag", label: "Nagari Domisili", angka: false },
  { id: "niplama", label: "NIP Lama", angka: false },
  { id: "nipbaru", label: "NIP Baru", angka: false },
  { id: "jabatan", label: "Kelompok/Jabatan", angka: false },
  { id: "lahir", label: "Tanggal Lahir", angka: false },
  { id: "usia", label: "Usia (th)", angka: true },
  { id: "tmt", label: "TMT Pengangkatan", angka: false },
  { id: "kerja", label: "Masa Kerja (th)", angka: true },
  { id: "email", label: "Email", angka: false },
  { id: "status", label: "Status", angka: false },
  { id: "jk", label: "Jenis Kelamin", angka: false },
  { id: "kantor", label: "Kecamatan Kantor", angka: false },
];

export default function DaftarPegawai({ baris, ringkasan, memuat, bolehKelola, nipPenuh, onAlihNip, onMuat, onResetPin, wilayah, onSimpan }: Props) {
  const [ubah, setUbah] = useState<BarisPegawai | null>(null);
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<NonNullable<SaringanPegawai["status"]>>("semua");
  const [saring, setSaring] = useState<Saring<Kol>>({});
  const [urut, setUrut] = useState<Urut<Kol>>(null);
  const hariIni = useHariIni();

  // Nilai sel untuk saringan/urut. Tanggal memakai bentuk ISO (urut benar); kosong = "" (tampil "(kosong)" di filter).
  const nilaiSel = useMemo<NilaiSel<BarisPegawai, Kol>>(
    () => (b, k) => {
      switch (k) {
        case "nama": return b.nama;
        case "kec": return b.domisili_kecamatan ?? "";
        case "nag": return b.domisili_nagari ?? "";
        case "niplama": return b.nip_lama ?? "";
        case "nipbaru": return b.nip_baru ?? "";
        case "jabatan": return b.jabatan ?? "";
        case "lahir": return b.lahir_iso ?? "";
        case "usia": return durasi(b.lahir_iso, hariIni)?.tahun ?? "";
        case "tmt": return b.tmt_iso ?? b.tmt_teks ?? "";
        case "kerja": return durasi(b.tmt_iso, hariIni)?.tahun ?? "";
        case "email": return b.email ?? "";
        case "status": return b.status ?? "";
        case "jk": return teksJk(b) ?? "";
        case "kantor": return b.kantor_kecamatan ?? "";
      }
    },
    [hariIni],
  );

  const awal = useMemo(() => saringPegawai(baris, { q, status }), [baris, q, status]);
  const terlihat = useMemo(() => terapkanTabel(awal, saring, urut, nilaiSel), [awal, saring, urut, nilaiSel]);
  const adaFilterKolom = adaSaring(saring) || urut !== null;
  const kepala = (k: (typeof KOLOM)[number]) => (
    <th key={k.id} className={TH}>
      <KepalaKolom id={k.id} label={k.label} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(awal, k.id, nilaiSel, k.angka)} />
    </th>
  );
  const kolomDi = (...id: Kol[]) => id.map((i) => kepala(KOLOM.find((k) => k.id === i) as (typeof KOLOM)[number]));

  return (
    <Kartu
      judul="Daftar pegawai organik"
      ket={`${ringkasan.daftar} pegawai di daftar · ${ringkasan.punya_akun} punya akun SIGAP · ${ringkasan.tanpa_akun} belum punya akun · ${ringkasan.akun_di_luar_daftar} akun di luar daftar${memuat ? " · memuat…" : ""}`}
      kanan={
        <div className="flex flex-wrap gap-2">
          {bolehKelola && (
            <button type="button" className={BTN_O} onClick={onAlihNip} disabled={memuat}>
              {nipPenuh ? "Samarkan NIP" : "Tampilkan NIP lengkap"}
            </button>
          )}
          <button type="button" className={BTN_O} onClick={onMuat} disabled={memuat}>
            Muat ulang
          </button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input aria-label="Cari pegawai" className={`${INPUT} min-w-[180px] flex-1`} placeholder="Cari nama, jabatan, email, wilayah…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Saring status" className={INPUT} value={status} onChange={(e) => setStatus(e.target.value as NonNullable<SaringanPegawai["status"]>)}>
          <option value="semua">Semua ({baris.length})</option>
          <option value="PNS">PNS ({ringkasan.pns})</option>
          <option value="PPPK">PPPK ({ringkasan.pppk})</option>
          <option value="tanpa_akun">Belum punya akun ({ringkasan.tanpa_akun})</option>
          <option value="luar_daftar">Akun di luar daftar ({ringkasan.akun_di_luar_daftar})</option>
        </select>
        {adaFilterKolom && (
          <button type="button" className={BTN_O} onClick={() => (setSaring({}), setUrut(null))}>
            Hapus saringan &amp; urutan kolom
          </button>
        )}
        <span className="text-[12px] font-semibold text-[#6B7A90]">
          {terlihat.length} dari {baris.length} baris
        </span>
      </div>

      <TabelKartu className="!shadow-none">
        <thead>
          <tr>
            <th className={TH}>No</th>
            {kolomDi("nama", "kec", "nag", "niplama", "nipbaru", "jabatan", "lahir", "usia", "tmt", "kerja", "email", "status", "jk", "kantor")}
          </tr>
        </thead>
        <tbody>
          {terlihat.map((b) => {
            const buka = terbuka === b.no;
            const adaAksi = bolehKelola && (b.akun_id !== null || b.profil_id !== null);
            const usia = durasi(b.lahir_iso, hariIni);
            const kerja = durasi(b.tmt_iso, hariIni);
            return (
              <Fragment key={`${b.no}-${b.nama}`}>
                <tr className={`${b.akun_aktif === false ? "opacity-60" : ""} ${buka ? "bg-[#F3F7FE]" : ""}`}>
                  <td className={TD}>{b.no}</td>
                  <td className={`${TD} font-semibold text-[#1B2B4B]`}>
                    <button
                      type="button"
                      aria-expanded={buka}
                      aria-label={`${buka ? "Tutup" : "Buka"} aksi untuk ${b.nama}`}
                      className="inline-flex items-start gap-1.5 text-left font-semibold text-[#1B2B4B] hover:text-[#1F5FD1]"
                      onClick={() => setTerbuka(buka ? null : b.no)}
                    >
                      <span aria-hidden className="mt-[3px] text-[10px] text-[#6B7A90]">
                        {buka ? "▾" : "▸"}
                      </span>
                      <span>{b.nama}</span>
                    </button>
                    {b.dalam_daftar && b.akun_id === null && <span className="ml-1.5"><Chip w="wait">Belum punya akun</Chip></span>}
                    {!b.dalam_daftar && <span className="ml-1.5"><Chip w="mut">Di luar daftar</Chip></span>}
                    {b.akun_aktif === false && <span className="ml-1.5 text-[11px] font-bold text-[#B42329]">nonaktif</span>}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{dash(b.domisili_kecamatan)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{dash(b.domisili_nagari)}</td>
                  <td className={`${TD} font-mono text-[12px]`}>{dash(b.nip_lama)}</td>
                  <td className={`${TD} font-mono text-[12px]`}>{dash(b.nip_baru)}</td>
                  <td className={TD}>{dash(b.jabatan)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{dash(b.tanggal_lahir)}</td>
                  <td className={`${TD} whitespace-nowrap`} title={usia ? `${usia.tahun} tahun ${usia.bulan} bulan ${usia.hari} hari` : undefined}>
                    {dash(teksDurasi(usia))}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{dash(b.tmt_teks)}</td>
                  <td className={`${TD} whitespace-nowrap`} title={kerja ? `${kerja.tahun} tahun ${kerja.bulan} bulan ${kerja.hari} hari` : undefined}>
                    {dash(teksDurasi(kerja, true))}
                  </td>
                  <td className={`${TD} text-[12px]`}>{dash(b.email)}</td>
                  <td className={TD}>{dash(b.status)}</td>
                  <td className={`${TD} whitespace-nowrap`}>{dash(teksJk(b))}</td>
                  <td className={`${TD} whitespace-nowrap`}>{dash(b.kantor_kecamatan)}</td>
                </tr>
                {buka && (
                  <tr className="bg-[#F3F7FE]">
                    <td className="border-t border-[#DDE6F3] px-3.5 py-2.5" colSpan={JUMLAH_KOLOM}>
                      <div className="flex flex-wrap items-center gap-2">
                        {bolehKelola && b.akun_id !== null && (
                          <button type="button" className={`${BTN_O} whitespace-nowrap`} onClick={() => onResetPin(b.akun_id as number, b.nama)}>
                            🔑 Reset PIN
                          </button>
                        )}
                        {bolehKelola && b.profil_id !== null && (
                          <button type="button" className={`${BTN_O} whitespace-nowrap`} aria-label={`Edit data ${b.nama}`} onClick={() => setUbah(b)}>
                            ✏️ Edit
                          </button>
                        )}
                        <span className="text-[12px] text-[#6B7A90]">
                          {!adaAksi
                            ? bolehKelola
                              ? "Tidak ada aksi untuk baris ini."
                              : "Mode lihat saja: tidak punya izin mengelola."
                            : b.akun_id === null
                              ? "Belum punya akun SIGAP, jadi PIN belum bisa direset."
                              : b.profil_id === null
                                ? "Akun di luar daftar kepegawaian, jadi data profil tidak bisa diedit."
                                : "Edit mengubah kecamatan, nagari domisili, dan kecamatan kantor."}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {terlihat.length === 0 && (
            <tr>
              <td className={`${TD} text-center text-[#6B7A90]`} colSpan={JUMLAH_KOLOM}>
                {memuat ? "Memuat…" : "Tidak ada pegawai yang cocok dengan saringan."}
              </td>
            </tr>
          )}
        </tbody>
      </TabelKartu>
      <p className="mt-3 text-[12px] text-[#6B7A90]">
        Klik nama untuk membuka tombol Reset PIN dan Edit. Klik judul kolom untuk mengurutkan atau menyaring nilainya. Usia dan masa kerja dihitung otomatis dari tanggal lahir dan TMT (bertambah seiring waktu).
        Domisili memakai isian profil; bila kosong memakai data akun. Kecamatan kantor bisa diterapkan ke semua pegawai lewat Edit.
      </p>
      {ubah && <DialogUbah b={ubah} wilayah={wilayah} onTutup={() => setUbah(null)} onSimpan={onSimpan} />}
    </Kartu>
  );
}
