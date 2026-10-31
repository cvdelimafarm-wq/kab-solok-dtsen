"use client";

// app/sigap/akses/DaftarPegawai.tsx
//
// (31 Okt 2026) Tabel "Daftar pegawai organik" di tab Pengguna. Urutan kolom: No, Nama, Kecamatan & Nagari domisili (dua kolom), NIP lama/baru, jabatan,
// tanggal lahir, usia, TMT, masa kerja, email, status, jenis kelamin, kecamatan kantor.
// - Judul kolom berfilter ala spreadsheet (KepalaKolom + lib/saringKolom.ts): urut naik/turun dan centang nilai.
// - Klik nama -> baris terbuka berisi tombol Reset PIN dan Edit (domisili & kecamatan kantor).
// - Usia dan masa kerja dihitung di layar dari tanggal lahir/TMT (tahun-bulan-hari) dan ikut bergerak tiap hari, bukan angka tersimpan.
// NIP disamarkan kecuali "Tampilkan NIP lengkap" (izin kelola, tercatat di audit).

import { Fragment, useEffect, useMemo, useState } from "react";
import { BTN, BTN_O, Chip, INPUT, Kartu, TabelKartu, TD, TH } from "../admin/ui";
import KepalaKolom from "./KepalaKolom";
import { durasi, saringPegawai, tanggalWib, teksDurasi, totalBulan, type BarisPegawai, type DaftarWilayah, type RingkasPegawai, type SaringanPegawai } from "@/lib/pegawaiOrganik";
import { jumlahSaringan, STATUS_AWAL, terapkan, type DefKolom, type StatusKolom } from "@/lib/saringKolom";

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

export default function DaftarPegawai({ baris, ringkasan, memuat, bolehKelola, nipPenuh, onAlihNip, onMuat, onResetPin, wilayah, onSimpan }: Props) {
  const [ubah, setUbah] = useState<BarisPegawai | null>(null);
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<NonNullable<SaringanPegawai["status"]>>("semua");
  const [kol, setKol] = useState<StatusKolom>(STATUS_AWAL);
  const hariIni = useHariIni();

  const kolom = useMemo<DefKolom<BarisPegawai>[]>(() => {
    const usia = (b: BarisPegawai) => durasi(b.lahir_iso, hariIni);
    const kerja = (b: BarisPegawai) => durasi(b.tmt_iso, hariIni);
    const tahun = (d: ReturnType<typeof durasi>) => (d ? `${d.tahun} th` : null);
    return [
      { id: "nama", label: "Nama Lengkap", nilai: (b) => b.nama },
      { id: "kec", label: "Kecamatan Domisili", nilai: (b) => b.domisili_kecamatan },
      { id: "nag", label: "Nagari Domisili", nilai: (b) => b.domisili_nagari },
      { id: "niplama", label: "NIP Lama", nilai: (b) => b.nip_lama },
      { id: "nipbaru", label: "NIP Baru", nilai: (b) => b.nip_baru },
      { id: "jabatan", label: "Kelompok/Jabatan", nilai: (b) => b.jabatan },
      { id: "lahir", label: "Tanggal Lahir", nilai: (b) => b.tanggal_lahir, urut: (b) => b.lahir_iso },
      { id: "usia", label: "Usia", nilai: (b) => tahun(usia(b)), urut: (b) => totalBulan(usia(b)) },
      { id: "tmt", label: "TMT Pengangkatan", nilai: (b) => b.tmt_teks, urut: (b) => b.tmt_iso },
      { id: "kerja", label: "Masa Kerja", nilai: (b) => tahun(kerja(b)), urut: (b) => totalBulan(kerja(b)) },
      { id: "email", label: "Email", nilai: (b) => b.email },
      { id: "status", label: "Status", nilai: (b) => b.status },
      { id: "jk", label: "Jenis Kelamin", nilai: teksJk },
      { id: "kantor", label: "Kecamatan Kantor", nilai: (b) => b.kantor_kecamatan },
    ];
  }, [hariIni]);

  const awal = useMemo(() => saringPegawai(baris, { q, status }), [baris, q, status]);
  const terlihat = useMemo(() => terapkan(awal, kolom, kol), [awal, kolom, kol]);
  const jmlSaringan = jumlahSaringan(kol);
  const kepala = (id: string) => <KepalaKolom<BarisPegawai> kolom={kolom} id={id} rows={awal} status={kol} onUbah={setKol} />;

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
        {(jmlSaringan > 0 || kol.urut) && (
          <button type="button" className={BTN_O} onClick={() => setKol(STATUS_AWAL)}>
            Hapus saringan kolom{jmlSaringan > 0 ? ` (${jmlSaringan})` : ""}
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
            {kepala("nama")}
            {kepala("kec")}
            {kepala("nag")}
            {kepala("niplama")}
            {kepala("nipbaru")}
            {kepala("jabatan")}
            {kepala("lahir")}
            {kepala("usia")}
            {kepala("tmt")}
            {kepala("kerja")}
            {kepala("email")}
            {kepala("status")}
            {kepala("jk")}
            {kepala("kantor")}
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
