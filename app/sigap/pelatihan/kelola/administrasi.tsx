"use client";

// app/sigap/pelatihan/kelola/administrasi.tsx
//
// (8 Okt 2026) SIGAP > Kelola Pelatihan > tab "Administrasi" (mockup disetujui user). Panitia/instruktur kelas:
//  1) memantau status pengisian Transport Lokal peserta (segar tiap 15 detik),
//  2) memilih petugas (semua / sebagian) + menambah peserta manual dari gabungan Mitra & organik,
//  3) mencentang jenis dokumen: 6 jenis SPJ + Daftar Hadir, Form Daftar Hadir TTD basah, Laporan Pelatihan, Laporan Instruktur,
//  4) mencetak: PDF gabungan atau ZIP per petugas.
// API: /api/sigap/pelatihan/administrasi (lihat app/api/sigap/pelatihan/administrasi/route.ts).

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, bukaBlob, fetchJson, pesanGalat, SesiBerakhir, rupiah } from "../../admin/api";
import { BTN, BTN_G, BTN_O, BTN_R, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";

const URL_ADM = "/api/sigap/pelatihan/administrasi";

type Status = "belum" | "draft" | "sudah" | "terverifikasi";
type Peserta = {
  penugasan_id: number;
  akun_id: number;
  nama: string;
  jenis_akun: string;
  peran: string;
  kelas: number;
  manual: boolean;
  status: Status;
  hari: number;
  hari_lengkap: number;
  foto: number;
  foto_total: number;
  nominal: number;
  pulsa: string | null;
  pulsa_diubah: boolean;
};
type Ringkas = { nama: string; boleh_kelola: boolean; kelas: number[]; semua_kelas: boolean; kelas_bawaan: number | null; tanggal: string };
type DataPeserta = { kelas: number; stat: { peserta: number; belum: number; draft: number; sudah: number; terverifikasi: number; pulsa: number }; peserta: Peserta[] };
type Kandidat = { akun_id: number; nama: string; jenis: string; kecamatan: string | null };
type Narasi = { ringkasan: string | null; kendala: string | null; catatan: string | null };

const STATUS: Record<Status, { label: string; w: "bad" | "wait" | "ok" | "navy" }> = {
  belum: { label: "Belum diisi", w: "bad" },
  draft: { label: "Draft", w: "wait" },
  sudah: { label: "Sudah diisi", w: "ok" },
  terverifikasi: { label: "Terverifikasi", w: "navy" },
};

const DOK_SPJ: { k: string; label: string; ket: string }[] = [
  { k: "surat_tugas", label: "Surat Tugas", ket: "berkas unggahan admin" },
  { k: "kwitansi", label: "Kwitansi", ket: "tarif per hari, per kelompok tanggal" },
  { k: "visum", label: "Visum", ket: "rincian perjalanan" },
  { k: "laporan", label: "Laporan", ket: "bila diwajibkan kegiatan" },
  { k: "dokumentasi", label: "Dokumentasi", ket: "foto kegiatan petugas" },
  { k: "surat_pernyataan", label: "Surat Pernyataan Kendaraan Dinas", ket: "pernyataan tidak memakai kendaraan dinas" },
];
const DOK_PEL: { k: string; label: string; ket: string }[] = [
  { k: "daftar_hadir", label: "Daftar Hadir (otomatis)", ket: "dari presensi di lokasi pelatihan" },
  { k: "form_hadir", label: "Form Daftar Hadir TTD basah", ket: "kosong berisi nama peserta, untuk tanda tangan langsung" },
  { k: "laporan_pelatihan", label: "Laporan Pelatihan", ket: "angka otomatis + narasi panitia" },
  { k: "laporan_instruktur", label: "Laporan Pelatihan Instruktur", ket: "angka otomatis + catatan instruktur" },
];
const SPJ_KODE = new Set(DOK_SPJ.map((d) => d.k));

function CentangDok({ d, on, ubah }: { d: { k: string; label: string; ket: string }; on: boolean; ubah: () => void }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition ${on ? "border-[#1F6FD1] bg-[#E3EEFB]" : "border-[#E3E8EE] bg-white hover:bg-[#F8FAFC]"}`}>
      <input type="checkbox" className="mt-1" checked={on} onChange={ubah} />
      <span className="text-[13px]">
        <b className="block">{d.label}</b>
        <span className="text-[11.5px] text-[#7B8794]">{d.ket}</span>
      </span>
    </label>
  );
}

export default function Administrasi() {
  const [info, setInfo] = useState<Ringkas | null>(null);
  const [kelas, setKelas] = useState<number | null>(null);
  const [data, setData] = useState<DataPeserta | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat" | "peringatan"; teks: string } | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [dok, setDok] = useState<Set<string>>(new Set(["kwitansi", "visum", "dokumentasi"]));
  const [cari, setCari] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [tambah, setTambah] = useState(false);

  // --- cakupan & kelas ---
  useEffect(() => {
    if (!bacaSesi()) return;
    fetchJson<Ringkas>(`${URL_ADM}?bagian=ringkas`)
      .then((r) => {
        setInfo(r);
        setKelas(r.kelas_bawaan ?? r.kelas[0] ?? null);
      })
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      });
  }, []);

  const muat = useCallback(async () => {
    if (!kelas) return;
    try {
      const d = await fetchJson<DataPeserta>(`${URL_ADM}?bagian=peserta&kelas=${kelas}`);
      setData(d);
      setGalat(null);
      // pilihan yang sudah tidak ada (mis. peserta dikeluarkan) dibuang
      setSel((s) => new Set([...s].filter((id) => d.peserta.some((p) => p.penugasan_id === id))));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [kelas]);

  useEffect(() => {
    setData(null);
    setSel(new Set());
    if (!kelas) return;
    muat();
    const t = setInterval(muat, 15_000);
    return () => clearInterval(t);
  }, [kelas, muat]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.peserta ?? []).filter((p) => (!q || p.nama.toLowerCase().includes(q)) && (!fStatus || p.status === fStatus));
  }, [data, cari, fStatus]);

  const jenisSpj = [...dok].filter((k) => SPJ_KODE.has(k));
  const jumlahDok = dok.size;
  const dipilih = (data?.peserta ?? []).filter((p) => sel.has(p.penugasan_id));
  const belumLengkap = dipilih.filter((p) => p.status === "belum" || p.status === "draft").length;
  const butuhSpj = jenisSpj.length > 0;

  function urlCetak(ids: number[], jenis: string[], format: "gabungan" | "zip") {
    const q = new URLSearchParams({ bagian: "cetak", kelas: String(kelas), penugasan: ids.join(","), jenis: jenis.join(","), format });
    return `${URL_ADM}?${q.toString()}`;
  }

  async function cetakPdf() {
    setPesan(null);
    setSibuk("pdf");
    try {
      await bukaBlob(urlCetak([...sel], [...dok], "gabungan"));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
    }
  }

  async function lihatSatu(p: Peserta) {
    setPesan(null);
    try {
      const jenis = jenisSpj.length ? jenisSpj : DOK_SPJ.map((d) => d.k);
      await bukaBlob(urlCetak([p.penugasan_id], jenis, "gabungan"));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  async function unduhZip() {
    setPesan(null);
    setSibuk("zip");
    try {
      const s = bacaSesi();
      if (!s) throw new Error("Sesi berakhir. Silakan masuk kembali.");
      const res = await fetch(urlCetak([...sel], [...dok], "zip"), { headers: { Authorization: `Bearer ${s}` }, cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? `Gagal membuat ZIP (${res.status}).`);
      }
      const blob = await res.blob();
      const nama = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("Content-Disposition") ?? "")?.[1];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nama ? decodeURIComponent(nama) : `Administrasi_Pelatihan_Kelas${kelas}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      const dilewati = res.headers.get("X-Spj-Dilewati");
      if (dilewati && decodeURIComponent(dilewati) !== "[]") setPesan({ jenis: "peringatan", teks: "Sebagian dokumen dilewati karena datanya belum ada. Rinciannya ada di berkas _dokumen_dilewati.txt dalam ZIP." });
    } catch (e) {
      setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
    }
  }

  async function unduhPulsa() {
    setPesan(null);
    setSibuk("pulsa");
    try {
      const s = bacaSesi();
      if (!s) throw new Error("Sesi berakhir. Silakan masuk kembali.");
      const res = await fetch(`${URL_ADM}?bagian=pulsa_csv&kelas=${kelas}`, { headers: { Authorization: `Bearer ${s}` }, cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string })?.error ?? `Gagal menyiapkan CSV (${res.status}).`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Nomor_Pulsa_Pelatihan_Kelas${kelas}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (e) {
      setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
    }
  }

  async function keluarkan(p: Peserta) {
    if (!window.confirm(`Keluarkan ${p.nama} dari daftar administrasi kelas ini? (Data tidak dihapus; bisa ditambahkan lagi.)`)) return;
    try {
      await fetchJson(URL_ADM, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "keluarkan_peserta", penugasan_id: p.penugasan_id }) });
      setPesan({ jenis: "ok", teks: `${p.nama} dikeluarkan dari daftar administrasi.` });
      muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  const ubahDok = (k: string) => setDok((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const ubahSel = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const semuaTampil = tampil.length > 0 && tampil.every((p) => sel.has(p.penugasan_id));

  if (galat && !info) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!info) return <Memuat />;
  if (info.kelas.length === 0) return <Pesan jenis="peringatan">Anda belum ditetapkan pada kelas mana pun. Hubungi admin untuk menetapkan kelas Anda.</Pesan>;

  const st = data?.stat;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {pesan && <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>}

      <Kartu>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-[13px]">Kelas:</b>
          {info.kelas.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKelas(k)}
              className={`rounded-full px-3.5 py-1 text-[13px] font-bold transition ${kelas === k ? "bg-[#0F3D7A] text-white" : "bg-white text-[#55657D] ring-1 ring-[#CDD5DE] hover:bg-[#F8FAFC]"}`}
            >
              Kelas {k}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-[#7B8794]">
            {info.semua_kelas ? "Anda dapat mengakses semua kelas." : `Anda hanya mengakses Kelas ${info.kelas.join(", ")}.`}
          </span>
        </div>
      </Kartu>

      {/* 1. Monitoring */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        <KartuAngka label="Peserta kelas ini" nilai={st?.peserta ?? "…"} />
        <KartuAngka label="Belum diisi" nilai={st?.belum ?? "…"} warna="#B5352D" />
        <KartuAngka label="Draft (sebagian)" nilai={st?.draft ?? "…"} warna="#9A6200" />
        <KartuAngka label="Sudah diisi" nilai={st?.sudah ?? "…"} warna="#12816A" />
        <KartuAngka label="Terverifikasi" nilai={st?.terverifikasi ?? "…"} warna="#1F6FD1" />
        <KartuAngka label="Nomor pulsa terkonfirmasi" nilai={st ? `${st.pulsa}/${st.peserta}` : "…"} warna="#C2570C" />
      </div>

      {/* 2. Pilih petugas */}
      <Kartu
        judul="① Pilih petugas"
        ket={`${dipilih.length} dipilih · segar otomatis tiap 15 detik`}
        kanan={
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={BTN_O} disabled={sibuk === "pulsa"} onClick={unduhPulsa}>
              {sibuk === "pulsa" ? "Menyiapkan…" : "⬇ CSV nomor pulsa"}
            </button>
            {info.boleh_kelola && (
              <button type="button" className={BTN} onClick={() => setTambah(true)}>
                + Tambah peserta manual
              </button>
            )}
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap gap-2">
          <input className={`${INPUT} min-w-[180px] flex-1`} placeholder="Cari nama…" value={cari} onChange={(e) => setCari(e.target.value)} />
          <select className={INPUT} value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter status translok">
            <option value="">Semua status translok</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button type="button" className={BTN_O} onClick={() => setSel(new Set([...sel, ...tampil.map((p) => p.penugasan_id)]))}>Pilih semua (yang tampil)</button>
          <button type="button" className={BTN_O} onClick={() => setSel(new Set())}>Kosongkan</button>
        </div>
        {!data ? (
          <Memuat />
        ) : (
          <TabelKartu className="!shadow-none">
            <thead>
              <tr>
                <th className={`${TH} w-9`}>
                  <input type="checkbox" aria-label="Pilih semua yang tampil" checked={semuaTampil} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...tampil.map((p) => p.penugasan_id)]) : new Set([...sel].filter((id) => !tampil.some((p) => p.penugasan_id === id))))} />
                </th>
                <th className={TH}>Nama</th>
                <th className={TH}>Peran</th>
                <th className={TH}>Jenis</th>
                <th className={TH}>Status translok</th>
                <th className={TH}>Hari</th>
                <th className={TH}>Foto</th>
                <th className={TH}>Nominal</th>
                <th className={TH}>No. Pulsa</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((p) => (
                <tr key={p.penugasan_id}>
                  <td className={TD}><input type="checkbox" checked={sel.has(p.penugasan_id)} onChange={() => ubahSel(p.penugasan_id)} aria-label={`Pilih ${p.nama}`} /></td>
                  <td className={`${TD} font-semibold`}>
                    {p.nama} {p.manual && <Chip w="wait" title="Ditambahkan manual; hanya untuk administrasi">manual</Chip>}
                  </td>
                  <td className={TD}>{p.peran.toUpperCase()}</td>
                  <td className={TD}>{p.jenis_akun === "organik" ? "Organik" : "Mitra"}</td>
                  <td className={TD}><Chip w={STATUS[p.status].w}>{STATUS[p.status].label}</Chip></td>
                  <td className={`${TD} tabular-nums`}>{p.hari_lengkap}/{p.hari}</td>
                  <td className={`${TD} tabular-nums`}>{p.foto}/{p.foto_total}</td>
                  <td className={`${TD} tabular-nums`}>{rupiah(p.nominal)}</td>
                  <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>
                    {p.pulsa ? (
                      <>
                        {p.pulsa} {p.pulsa_diubah && <Chip w="wait" title="Nomor lain, khusus pulsa">lain</Chip>}
                      </>
                    ) : (
                      <Chip w="bad">belum</Chip>
                    )}
                  </td>
                  <td className={TD}>
                    <div className="flex gap-1.5">
                      <button type="button" className={BTN_O} onClick={() => lihatSatu(p)}>Lihat SPJ</button>
                      {info.boleh_kelola && p.manual && (
                        <button type="button" className={BTN_R} onClick={() => keluarkan(p)}>Keluarkan</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tampil.length === 0 && (
                <tr>
                  <td className={`${TD} text-center text-[#7B8794]`} colSpan={10}>Tidak ada peserta yang cocok.</td>
                </tr>
              )}
            </tbody>
          </TabelKartu>
        )}
        <p className="mt-1.5 text-[11.5px] text-[#7B8794]">Peserta bertanda “manual” hanya masuk administrasi kelas ini; tidak ikut tes, kuis, presensi, atau monitoring peserta.</p>
      </Kartu>

      {/* 3. Jenis dokumen */}
      <Kartu judul="② Pilih jenis dokumen" ket={`${jumlahDok} jenis dipilih`}>
        <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#7B8794]">SPJ Transport Lokal (6 jenis, per petugas)</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DOK_SPJ.map((d) => <CentangDok key={d.k} d={d} on={dok.has(d.k)} ubah={() => ubahDok(d.k)} />)}
        </div>
        <p className="mb-1.5 mt-3 text-[12px] font-semibold uppercase tracking-wide text-[#7B8794]">Kelengkapan pelatihan (per kelas)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DOK_PEL.map((d) => <CentangDok key={d.k} d={d} on={dok.has(d.k)} ubah={() => ubahDok(d.k)} />)}
        </div>
        {(dok.has("laporan_pelatihan") || dok.has("laporan_instruktur")) && kelas && <PanelNarasi kelas={kelas} bisaKelola={info.boleh_kelola} />}
      </Kartu>

      {/* 4. Cetak */}
      <Kartu judul="③ Cetak">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F8FAFC] px-3.5 py-3">
          <div>
            <b className="text-[14px]">{dipilih.length} petugas × {jumlahDok} jenis dokumen</b>
            {butuhSpj && belumLengkap > 0 && (
              <p className="text-[12.5px] text-[#9A6200]">
                {belumLengkap} petugas terpilih translok-nya belum lengkap (Belum diisi / Draft). Dokumen SPJ yang datanya belum ada akan dilewati dan dicatat dalam daftar “dilewati”.
              </p>
            )}
            {dok.size > 0 && dipilih.length === 0 && <p className="text-[12.5px] text-[#7B8794]">Centang minimal 1 petugas pada langkah ①.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_G} disabled={dipilih.length === 0 || jumlahDok === 0 || sibuk !== null} onClick={cetakPdf}>
              {sibuk === "pdf" ? "Menyiapkan…" : "Cetak PDF gabungan"}
            </button>
            <button type="button" className={BTN} disabled={dipilih.length === 0 || jumlahDok === 0 || sibuk !== null} onClick={unduhZip}>
              {sibuk === "zip" ? "Menyiapkan…" : "Unduh ZIP per petugas"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] text-[#7B8794]">
          PDF gabungan: dokumen pelatihan dulu (daftar hadir, laporan), lalu SPJ per petugas urut nama. ZIP: satu berkas per dokumen pelatihan dan satu PDF SPJ per petugas. SPJ memakai mesin yang sama dengan Verifikasi &amp; Kunci, jadi setelah dikunci hasil cetaknya memakai berkas beku. Proses dapat memakan waktu bila petugas banyak.
        </p>
      </Kartu>

      {tambah && kelas && (
        <ModalTambah
          kelas={kelas}
          tutup={() => setTambah(false)}
          setelah={(nama) => {
            setPesan({ jenis: "ok", teks: `${nama} ditambahkan sebagai peserta manual Kelas ${kelas}.` });
            muat();
          }}
        />
      )}
    </div>
  );
}

// ======================================================================
// Narasi laporan
// ======================================================================
function PanelNarasi({ kelas, bisaKelola }: { kelas: number; bisaKelola: boolean }) {
  const [jenis, setJenis] = useState<"pelatihan" | "instruktur">("pelatihan");
  const [semua, setSemua] = useState<{ pelatihan: Narasi; instruktur: Narasi } | null>(null);
  const [form, setForm] = useState<Narasi>({ ringkasan: "", kendala: "", catatan: "" });
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    setSemua(null);
    fetchJson<{ pelatihan: Narasi; instruktur: Narasi }>(`${URL_ADM}?bagian=narasi&kelas=${kelas}`)
      .then(setSemua)
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
      });
  }, [kelas]);
  useEffect(() => {
    if (semua) setForm({ ringkasan: semua[jenis].ringkasan ?? "", kendala: semua[jenis].kendala ?? "", catatan: semua[jenis].catatan ?? "" });
  }, [semua, jenis]);

  async function simpan() {
    setSibuk(true);
    setPesan(null);
    try {
      await fetchJson(URL_ADM, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "simpan_narasi", kelas, jenis, ...form }) });
      setSemua((s) => (s ? { ...s, [jenis]: { ringkasan: form.ringkasan || null, kendala: form.kendala || null, catatan: form.catatan || null } } : s));
      setPesan({ jenis: "ok", teks: "Narasi tersimpan." });
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  const label = jenis === "pelatihan"
    ? { ringkasan: "Ringkasan pelaksanaan (narasi tambahan)", kendala: "Kendala dan tindak lanjut", catatan: null as string | null }
    : { ringkasan: "Materi dan metode penyampaian", kendala: "Kendala dan saran", catatan: "Catatan / evaluasi instruktur" };

  return (
    <div className="mt-3 rounded-xl border border-[#E3E8EE] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[13px]">Narasi laporan Kelas {kelas}</b>
        <select className={INPUT} value={jenis} onChange={(e) => setJenis(e.target.value as "pelatihan" | "instruktur")} aria-label="Jenis laporan">
          <option value="pelatihan">Laporan Pelatihan</option>
          <option value="instruktur">Laporan Pelatihan Instruktur</option>
        </select>
      </div>
      <p className="mt-1 text-[12px] text-[#7B8794]">Angka (peserta, kehadiran, nilai tes) terisi otomatis dari data. Bagian narasi yang dikosongkan dicetak sebagai garis untuk ditulis tangan.</p>
      {!semua ? (
        <Memuat />
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block text-[12px] text-[#7B8794]">
            {label.ringkasan}
            <textarea className={`${INPUT} mt-0.5 min-h-[72px] w-full`} value={form.ringkasan ?? ""} disabled={!bisaKelola} maxLength={4000} onChange={(e) => setForm({ ...form, ringkasan: e.target.value })} />
          </label>
          {label.catatan && (
            <label className="block text-[12px] text-[#7B8794]">
              {label.catatan}
              <textarea className={`${INPUT} mt-0.5 min-h-[72px] w-full`} value={form.catatan ?? ""} disabled={!bisaKelola} maxLength={4000} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
            </label>
          )}
          <label className="block text-[12px] text-[#7B8794]">
            {label.kendala}
            <textarea className={`${INPUT} mt-0.5 min-h-[72px] w-full`} value={form.kendala ?? ""} disabled={!bisaKelola} maxLength={4000} onChange={(e) => setForm({ ...form, kendala: e.target.value })} />
          </label>
          {bisaKelola && (
            <button type="button" className={BTN} disabled={sibuk} onClick={simpan}>
              {sibuk ? "Menyimpan…" : "Simpan narasi"}
            </button>
          )}
        </div>
      )}
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
        </div>
      )}
      <PanelFoto kelas={kelas} bisaKelola={bisaKelola} />
    </div>
  );
}

// ======================================================================
// Lampiran foto kegiatan (dipakai Laporan Pelatihan & Laporan Instruktur kelas ini)
// ======================================================================
type FotoLap = { id: number; urut: number; keterangan: string | null; url: string | null };
const MAKS_FOTO = 8;

function PanelFoto({ kelas, bisaKelola }: { kelas: number; bisaKelola: boolean }) {
  const [foto, setFoto] = useState<FotoLap[] | null>(null);
  const [ket, setKet] = useState("");
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [progres, setProgres] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const d = await fetchJson<{ foto: FotoLap[] }>(`${URL_ADM}?bagian=foto&kelas=${kelas}`);
      setFoto(d.foto);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }, [kelas]);
  useEffect(() => {
    setFoto(null);
    muat();
  }, [muat]);

  async function unggah(files: FileList | null) {
    if (!files || files.length === 0) return;
    const s = bacaSesi();
    if (!s) return;
    setPesan(null);
    const sisa = MAKS_FOTO - (foto?.length ?? 0);
    const daftar = Array.from(files).slice(0, Math.max(0, sisa));
    let sukses = 0;
    for (let i = 0; i < daftar.length; i++) {
      setProgres(`Mengunggah ${i + 1} dari ${daftar.length}…`);
      const fd = new FormData();
      fd.append("kelas", String(kelas));
      fd.append("keterangan", ket);
      fd.append("file", daftar[i]);
      try {
        const res = await fetch(`${URL_ADM}/foto`, { method: "POST", headers: { Authorization: `Bearer ${s}` }, body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((j as { error?: string })?.error ?? `Gagal mengunggah (${res.status}).`);
        sukses++;
      } catch (e) {
        setPesan({ jenis: "galat", teks: `${daftar[i].name}: ${pesanGalat(e)}` });
        break;
      }
    }
    setProgres(null);
    if (sukses > 0) {
      setKet("");
      if (files.length > daftar.length) setPesan({ jenis: "galat", teks: `Maksimal ${MAKS_FOTO} foto per kelas; ${files.length - daftar.length} foto tidak diunggah.` });
      else setPesan({ jenis: "ok", teks: `${sukses} foto ditambahkan.` });
    }
    muat();
  }

  async function hapus(f: FotoLap) {
    if (!window.confirm("Hapus foto ini dari lampiran laporan?")) return;
    try {
      await fetchJson(`${URL_ADM}/foto?id=${f.id}`, { method: "DELETE" });
      muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  async function simpanKet(f: FotoLap, baru: string) {
    if ((f.keterangan ?? "") === baru.trim()) return;
    try {
      await fetchJson(`${URL_ADM}/foto`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id, keterangan: baru }) });
      setFoto((l) => (l ?? []).map((x) => (x.id === f.id ? { ...x, keterangan: baru.trim() || null } : x)));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  const penuh = (foto?.length ?? 0) >= MAKS_FOTO;
  return (
    <div className="mt-4 border-t border-[#EDF0F4] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[13px]">Lampiran foto kegiatan Kelas {kelas}</b>
        <span className="text-[12px] text-[#7B8794]">{foto ? `${foto.length}/${MAKS_FOTO} foto` : "memuat…"} · tercetak di halaman lampiran kedua laporan</span>
      </div>
      {bisaKelola && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className={`${INPUT} min-w-[200px] flex-1`} placeholder="Keterangan foto (opsional, berlaku untuk foto yang diunggah sekarang)" value={ket} maxLength={160} onChange={(e) => setKet(e.target.value)} />
          <label className={`${BTN} ${penuh || progres ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
            ⬆ Pilih foto…
            <input type="file" accept="image/*" multiple className="hidden" disabled={penuh || !!progres} onChange={(e) => { unggah(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      )}
      {progres && <p className="mt-1.5 text-[12.5px] text-[#1F6FD1]">{progres}</p>}
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
        </div>
      )}
      {foto && foto.length === 0 && <p className="mt-2 text-[12.5px] text-[#7B8794]">Belum ada foto. Tanpa foto, laporan dicetak tanpa halaman lampiran.</p>}
      {foto && foto.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {foto.map((f, i) => (
            <div key={f.id} className="overflow-hidden rounded-xl border border-[#E3E8EE] bg-white">
              {f.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={`Foto ${i + 1}`} className="h-28 w-full bg-[#F8FAFC] object-contain" />
              ) : (
                <div className="grid h-28 place-items-center bg-[#F8FAFC] text-[12px] text-[#7B8794]">tidak tampil</div>
              )}
              <div className="space-y-1 p-2">
                <input
                  className={`${INPUT} w-full !py-1 !text-[12px]`}
                  defaultValue={f.keterangan ?? ""}
                  placeholder={`Foto ${i + 1}: keterangan`}
                  maxLength={160}
                  disabled={!bisaKelola}
                  onBlur={(e) => simpanKet(f, e.target.value)}
                />
                {bisaKelola && (
                  <button type="button" className={`${BTN_R} w-full !py-1`} onClick={() => hapus(f)}>
                    Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================
// Tambah peserta manual
// ======================================================================
function ModalTambah({ kelas, tutup, setelah }: { kelas: number; tutup: () => void; setelah: (nama: string) => void }) {
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<Kandidat[] | null>(null);
  const [sudah, setSudah] = useState<{ akun_id: number; nama: string; kelas: number | null }[]>([]);
  const [peran, setPeran] = useState<Record<number, string>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);

  useEffect(() => {
    const teks = q.trim();
    if (teks.length < 2) {
      setHasil(null);
      return;
    }
    const t = setTimeout(() => {
      fetchJson<{ kandidat: Kandidat[]; sudah_peserta: { akun_id: number; nama: string; kelas: number | null }[] }>(`${URL_ADM}?bagian=kandidat&kelas=${kelas}&q=${encodeURIComponent(teks)}`)
        .then((r) => {
          setHasil(r.kandidat);
          setSudah(r.sudah_peserta);
        })
        .catch((e) => {
          if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q, kelas]);

  async function tambahkan(k: Kandidat) {
    setSibuk(k.akun_id);
    setGalat(null);
    try {
      await fetchJson(URL_ADM, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "tambah_peserta", kelas, akun_id: k.akun_id, peran: peran[k.akun_id] ?? "ppl" }) });
      setHasil((h) => (h ?? []).filter((x) => x.akun_id !== k.akun_id));
      setelah(k.nama);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={tutup}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <b className="text-[15px]">Tambah peserta manual · Kelas {kelas}</b>
          <button type="button" className={BTN_O} onClick={tutup}>Tutup</button>
        </div>
        <p className="mt-1 text-[12px] text-[#7B8794]">Sumber: gabungan seluruh akun Mitra dan organik yang aktif. Ketik minimal 2 huruf nama. Peserta manual hanya masuk administrasi (SPJ translok, daftar hadir, laporan), tidak ikut tes/kuis/presensi.</p>
        <input autoFocus className={`${INPUT} mt-2 w-full`} placeholder="Cari nama mitra / pegawai…" value={q} onChange={(e) => setQ(e.target.value)} />
        {galat && <div className="mt-2"><Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan></div>}
        <div className="mt-2">
          {hasil === null && q.trim().length < 2 && <p className="py-3 text-center text-[12.5px] text-[#7B8794]">Mulai mengetik untuk mencari.</p>}
          {hasil && hasil.length === 0 && <p className="py-3 text-center text-[12.5px] text-[#7B8794]">Tidak ada akun yang cocok{sudah.length ? " (yang cocok sudah menjadi peserta)" : ""}.</p>}
          {(hasil ?? []).map((k) => (
            <div key={k.akun_id} className="flex flex-wrap items-center gap-2 border-t border-[#E3E8EE] py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{k.nama}</p>
                <p className="text-[11.5px] text-[#7B8794]">{k.jenis === "organik" ? "Organik" : "Mitra"}{k.kecamatan ? ` · ${k.kecamatan}` : ""}</p>
              </div>
              <select className={INPUT} value={peran[k.akun_id] ?? "ppl"} onChange={(e) => setPeran({ ...peran, [k.akun_id]: e.target.value })} aria-label="Peran">
                <option value="ppl">PPL</option>
                <option value="pml">PML</option>
                <option value="korwil">Korwil</option>
              </select>
              <button type="button" className={BTN_G} disabled={sibuk !== null} onClick={() => tambahkan(k)}>{sibuk === k.akun_id ? "…" : "Tambahkan"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
