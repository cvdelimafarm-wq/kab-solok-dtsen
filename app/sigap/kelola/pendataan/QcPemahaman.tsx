"use client";

// app/sigap/kelola/pendataan/QcPemahaman.tsx
//
// (29 Okt 2026) QC Pemahaman PER SURVEI: komponen ini menerima `kegiatanId` (pemilih survei di page.tsx, ?k=). Pengaturan, bank soal, peserta, dan pantauan
// semuanya milik survei itu; opsi yang bisa berbeda antar survei: jam/hari rilis, soal per hari, wajib ulang, nilai lulus, undian acak/berurutan, urutan tampil,
// peserta (PML/PPL), dan rekap PML. Soal dapat diimpor dari Excel (templat tersedia). Cabang Kuesioner supervisi hanya untuk Pendataan Pascabencana.
// (26 Okt 2026) Isi tab "4 · QC Pemahaman" Kelola Pendataan: pengaturan QC Pemahaman Petugas (kuis harian wajib PML/PPL), bank soal, dan pantauan hari ini.
// Sub-pilihan (?sub=): Hari ini · Pengaturan · Bank soal. Semua data lewat /api/portal/qc/admin (izin bencana.admin: lihat / kelola).
// Tidak ada penghapusan permanen: soal dimatikan lewat saklar aktif; perubahan dicatat di sigap_audit oleh API.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import Sorot from "@/app/portal/qc/Sorot";
import { tglPanjang } from "../../admin/api";
import { BTN, BTN_G, BTN_O, BTN_R, BTN_T, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan } from "../../admin/ui";
import { hariRilisDari, labelStatusPpl, maksPercobaanDari, menitKeJam, jamKeMenit, nilaiLulusDari, ringkasStatusQc, teksHariRilis, wajibUlangDari, type QcPengaturan, type QcRekapTim } from "@/lib/sigapQc";
import { petaSoalDariBaris, templatSoal, type HasilPeta } from "@/lib/sigapQcImpor";
import { KEGIATAN_PENDATAAN, SUB_QC, SUB_QC_PEMAHAMAN } from "@/lib/sigapPendataanTab";
import { SubPilih, useSubTab } from "./useSubTab";
import KuesionerQc from "./KuesionerQc";
import DokumenPeriksaAdminPanel from "./DokumenPeriksaAdmin";
import TabelQc from "./TabelQc";
import { bacaPmlSendiri, type RincianQc } from "@/lib/sigapQcMonitor";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";

type Peng = QcPengaturan & { diubah_oleh: string | null; diubah_at: string };
type Soal = { id: string; paket: number; judul_paket: string; nomor: number; pertanyaan: string; opsi: Record<string, string>; kunci: string; penjelasan: string; kata_kunci: string[]; aktif: boolean };
type Data = {
  boleh_kelola: boolean;
  kegiatan_id: number;
  kegiatan_nama: string;
  sekarang: string;
  pengaturan: Peng | null;
  soal: Soal[];
  peserta: { pml: number; ppl: number; ppl_tanpa_pml: number; tanpa_notifikasi: string[] };
  hari: string | null;
  soal_hari: string[];
  susulan_at: string | null;
  rekap: QcRekapTim[];
  /** tiap percobaan petugas + soal yang salah (29 Okt 2026) */
  rincian?: RincianQc;
};

const API = "/api/portal/qc/admin";
const jam = (s: string | undefined) => menitKeJam(jamKeMenit(s) ?? 0);
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

export default function QcPemahaman({ kegiatanId = KEGIATAN_PENDATAAN }: { kegiatanId?: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [diperbarui, setDiperbarui] = useState<Date | null>(null);
  const daftarSub = kegiatanId === KEGIATAN_PENDATAAN ? SUB_QC : SUB_QC_PEMAHAMAN;
  const { sub, pilih } = useSubTab("qc", daftarSub);
  const terkini = useRef(kegiatanId);
  terkini.current = kegiatanId;

  const muat = useCallback(async () => {
    const k = kegiatanId;
    setMemuat(true);
    try {
      const hasil = await apiPortal<Data>(`${API}?k=${k}`);
      if (terkini.current !== k) return; // survei sudah berganti selagi memuat
      setD(hasil);
      setDiperbarui(new Date());
      setGalat(null);
    } catch (e) {
      if (terkini.current === k) setGalat(pesanGalat(e));
    } finally {
      setMemuat(false);
    }
  }, [kegiatanId]);
  useEffect(() => {
    setD(null);
    setInfo(null);
    setGalat(null);
    void muat();
  }, [muat]);

  // (29 Okt 2026) pantauan hari ini disegarkan sendiri tiap 60 detik selama layarnya terbuka, supaya angka tidak basi ketika petugas sedang mengisi
  useEffect(() => {
    if (sub !== "hari") return;
    const b = setInterval(() => {
      if (document.visibilityState === "visible") void muat();
    }, 60_000);
    return () => clearInterval(b);
  }, [sub, muat]);

  const kirim = useCallback(
    async (isi: Record<string, unknown>, ok: string | ((r: Record<string, unknown>) => string)) => {
      setInfo(null);
      setGalat(null);
      try {
        const r = await apiPortal<Record<string, unknown>>(API, { method: "POST", body: JSON.stringify({ ...isi, k: kegiatanId }) });
        setInfo(typeof ok === "function" ? ok(r) : ok);
        await muat();
        return r;
      } catch (e) {
        setGalat(pesanGalat(e));
        return null;
      }
    },
    [muat, kegiatanId]
  );

  // (27 Okt 2026) cabang Kuesioner supervisi punya data dan pesan sendiri: tidak menunggu / menampilkan galat QC Pemahaman
  if (sub === "kuesioner" && kegiatanId === KEGIATAN_PENDATAAN)
    return (
      <div className="space-y-3">
        <SubPilih daftar={daftarSub} aktif={sub} onPilih={pilih} label="Quality check" />
        <KuesionerQc />
      </div>
    );
  // (29 Okt 2026) Dokumen pemeriksaan: PDF scan unggahan PML (data dan pesan sendiri, tidak bergantung pada data QC Pemahaman)
  if (sub === "dokumen" && kegiatanId === KEGIATAN_PENDATAAN)
    return (
      <div className="space-y-3">
        <SubPilih daftar={daftarSub} aktif={sub} onPilih={pilih} label="Quality check" />
        <DokumenPeriksaAdminPanel kegiatanId={kegiatanId} />
      </div>
    );
  if (!d && !galat) return <Memuat />;
  return (
    <div className="space-y-3">
      <SubPilih daftar={daftarSub} aktif={sub} onPilih={pilih} label="Quality check" />
      {d && <p className="text-[12.5px] text-[#55657D]">QC Pemahaman untuk <b>{d.kegiatan_nama}</b>: pengaturan, bank soal, dan peserta di bawah milik survei ini saja.</p>}
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}
      {d && !d.boleh_kelola && <Pesan jenis="info">Anda dapat melihat saja. Mengubah pengaturan memerlukan izin kelola pendataan.</Pesan>}
      {d && sub === "hari" && <HariIni d={d} kirim={kirim} muat={muat} memuat={memuat} diperbarui={diperbarui} />}
      {d && sub === "pengaturan" && <Pengaturan d={d} kirim={kirim} />}
      {d && sub === "soal" && <BankSoal d={d} kirim={kirim} />}
    </div>
  );
}

type Kirim = (isi: Record<string, unknown>, ok: string | ((r: Record<string, unknown>) => string)) => Promise<Record<string, unknown> | null>;

// ====================================================================== Hari ini
function HariIni({ d, kirim, muat, memuat, diperbarui }: { d: Data; kirim: Kirim; muat: () => Promise<void>; memuat: boolean; diperbarui: Date | null }) {
  const p = d.pengaturan;
  const sudah = d.rekap.reduce((a, t) => a + t.sudah, 0);
  const total = d.rekap.reduce((a, t) => a + t.jumlah_ppl, 0);
  const lulus = d.rekap.reduce((a, t) => a + t.lulus, 0);
  // PML dihitung terpisah dari PPL (hasil PML sendiri ada di tiap baris rekap)
  const pmlTotal = d.peserta.pml;
  const pmlSudah = d.rekap.filter((t) => (bacaPmlSendiri(t.pml_sendiri)?.percobaan ?? 0) > 0).length;
  const pmlLulus = d.rekap.filter((t) => bacaPmlSendiri(t.pml_sendiri)?.lulus).length;
  const [sibuk, setSibuk] = useState(false);
  const ke = async (isi: Record<string, unknown>, ok: string) => {
    setSibuk(true);
    await kirim(isi, ok);
    setSibuk(false);
  };
  return (
    <>
      <Kartu
        judul="Pantauan hari ini"
        ket={d.hari ? tglPanjang(d.hari) : "QC belum berjalan"}
        kanan={
          <span className="flex items-center gap-2">
            {diperbarui && <span className="text-[11.5px] text-[#6B7A90]">diperbarui {diperbarui.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB</span>}
            <button type="button" className={BTN_O} disabled={memuat} onClick={() => void muat()}>
              {memuat ? "Memuat…" : "Segarkan"}
            </button>
            {p?.aktif ? <Chip w="ok">Aktif</Chip> : <Chip w="mut">Nonaktif</Chip>}
          </span>
        }
      >
        {!p?.aktif && <p className="text-[13px] text-[#55657D]">QC Pemahaman {d.kegiatan_nama} belum diaktifkan. Siapkan bank soal, atur jadwal di sub Pengaturan, lalu nyalakan.</p>}
        {p?.aktif && (
          <p className="text-[13px] text-[#55657D]">
            Soal dirilis pukul <b>{jam(p.rilis_jam)}</b> ({teksHariRilis(hariRilisDari(p)).toLowerCase()}), batas pukul <b>{jam(p.batas_jam)}</b> WIB. Petugas yang belum selesai terkunci modal sampai mengisi
            {wajibUlangDari(p) ? ` (dan mengulang sampai ${nilaiLulusDari(p) >= 100 ? "nilai 100" : `nilai ${nilaiLulusDari(p)} ke atas`}, maksimal ${maksPercobaanDari(p)} percobaan)` : ` (satu percobaan; lulus bila nilai ${nilaiLulusDari(p)} ke atas)`}.
            {d.susulan_at && <> Hari ini ditandai <b>susulan</b>: tidak dihitung terlambat.</>}
          </p>
        )}
      </Kartu>
      <div className="grid gap-3 sm:grid-cols-4">
        <KartuAngka label="PML / PPL peserta" nilai={`${d.peserta.pml} / ${d.peserta.ppl}`} ket={d.peserta.ppl_tanpa_pml ? `${d.peserta.ppl_tanpa_pml} PPL belum punya PML` : "tiap PPL punya PML"} warna={d.peserta.ppl_tanpa_pml ? "#8A6200" : undefined} />
        <KartuAngka label="PPL sudah mengisi" nilai={total ? `${sudah}/${total}` : "-"} ket={`PML: ${pmlSudah}/${pmlTotal} sudah mengisi`} />
        <KartuAngka label="PPL lulus" nilai={total ? String(lulus) : "-"} ket={`PML lulus: ${pmlLulus}/${pmlTotal} · ${nilaiLulusDari(p) >= 100 ? "nilai 100" : `nilai ${nilaiLulusDari(p)} ke atas`}`} warna="#13794B" />
        <KartuAngka label="Tanpa notifikasi" nilai={String(d.peserta.tanpa_notifikasi.length)} ket="belum mengaktifkan push" warna={d.peserta.tanpa_notifikasi.length ? "#B42329" : undefined} />
      </div>
      {d.peserta.tanpa_notifikasi.length > 0 && (
        <details className="rounded-lg border border-[#DDE6F3] bg-white px-3.5 py-2.5 text-[13px]">
          <summary className="cursor-pointer font-bold text-[#0F2A52]">Siapa yang belum mengaktifkan notifikasi ({d.peserta.tanpa_notifikasi.length})</summary>
          <p className="mt-1.5 text-[#55657D]">{d.peserta.tanpa_notifikasi.join(", ")}. Mereka tetap terkunci modal, tetapi tidak menerima push. Di iPhone: Tambahkan ke Layar Utama lalu izinkan notifikasi.</p>
        </details>
      )}

      {d.rekap.length === 0 ? (
        <Kartu judul="Rekap per tim">
          <p className="text-[13px] text-[#55657D]">Belum ada soal yang dirilis pada hari ini.</p>
        </Kartu>
      ) : (
        <TabelQc rekap={d.rekap} rincian={d.rincian} maks={p ? maksPercobaanDari(p) : 4} nilaiLulus={nilaiLulusDari(p)} />
      )}

      {d.boleh_kelola && p && d.hari && (
        <Kartu judul="Tindakan hari ini" ket="hati-hati: berlaku untuk semua petugas">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={sibuk} className={BTN_O} onClick={() => ke({ aksi: "susulan", tanggal: d.hari, susulan: !d.susulan_at }, d.susulan_at ? "Tanda susulan dicabut." : "Hari ini ditandai susulan.")}>
              {d.susulan_at ? "Cabut tanda hari susulan" : "Tandai hari ini sebagai susulan"}
            </button>
            {d.soal_hari.length > 0 && d.rekap.every((t) => t.sudah === 0) && (
              <button type="button" disabled={sibuk} className={BTN_R} onClick={() => ke({ aksi: "undi_ulang", tanggal: d.hari }, "Soal hari ini diundi ulang.")}>
                Undi ulang soal hari ini
              </button>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-[#6B7A90]">
            Hari susulan = soal terlambat dirilis (mis. fitur baru dinyalakan malam hari): tidak ditandai terlambat, tetap memblokir, dan petugas diingatkan berkala sampai lulus. Undi ulang hanya bisa selama belum ada satu pun jawaban.
          </p>
        </Kartu>
      )}

      <Kartu judul="Uji notifikasi" ket="dikirim hanya ke perangkat Anda sendiri">
        <div className="flex flex-wrap gap-2">
          {(["rilis", "ingat", "rekap"] as const).map((j) => (
            <button
              key={j}
              type="button"
              className={BTN_O}
              disabled={sibuk}
              onClick={async () => {
                setSibuk(true);
                await kirim({ aksi: "contoh_push", jenis: j }, (r) => (Number(r.perangkat ?? 0) === 0 ? "Anda belum punya perangkat yang mengaktifkan notifikasi." : `Contoh terkirim ke ${r.terkirim ?? 0} dari ${r.perangkat ?? 0} perangkat Anda.`));
                setSibuk(false);
              }}
            >
              Contoh push {j === "rilis" ? "rilis soal" : j === "ingat" ? "pengingat" : "rekap PML"}
            </button>
          ))}
        </div>
      </Kartu>
    </>
  );
}

// ====================================================================== Pengaturan
function Pengaturan({ d, kirim }: { d: Data; kirim: Kirim }) {
  const p = d.pengaturan;
  const awal = (x: Peng | null) => ({
    aktif: x?.aktif ?? false,
    rilis_jam: jam(x?.rilis_jam ?? "19:00"),
    batas_jam: jam(x?.batas_jam ?? "20:00"),
    rekap_jam: jam(x?.rekap_jam ?? "07:00"),
    soal_per_hari: String(x?.soal_per_hari ?? 10),
    maks_ulang: String(x?.maks_ulang ?? 3),
    ingat_menit: (x?.ingat_menit ?? [30, 50]).join(", "),
    ingat_berkala_menit: String(x?.ingat_berkala_menit ?? 60),
    mulai: x?.mulai ?? "",
    akhir: x?.akhir ?? "",
    // (29 Okt 2026) opsi per survei; bawaan = perilaku QC Pascabencana
    wajib_ulang: x?.wajib_ulang ?? true,
    nilai_lulus: String(x?.nilai_lulus ?? 100),
    undi_acak: x?.undi_acak ?? true,
    acak_tampil: x?.acak_tampil ?? true,
    rekap_pml: x?.rekap_pml ?? true,
    hari_rilis: hariRilisDari(x),
    peran_pml: (x?.peran_peserta ?? ["pml", "ppl"]).includes("pml"),
    peran_ppl: (x?.peran_peserta ?? ["pml", "ppl"]).includes("ppl"),
  });
  const [f, setF] = useState(() => awal(p));
  // (27 Okt 2026) formulir berbeda dari yang tersimpan di server = ada perubahan yang BELUM berlaku
  const belumDisimpan = JSON.stringify(f) !== JSON.stringify(awal(p));
  // keadaan menurut pengaturan yang TERSIMPAN (yang dialami petugas sekarang), bukan isi formulir
  const status = p ? ringkasStatusQc(new Date(d.sekarang), p, !!d.susulan_at) : null;
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const gantiHari = (n: number) => setF((x) => ({ ...x, hari_rilis: x.hari_rilis.includes(n) ? x.hari_rilis.filter((h) => h !== n) : [...x.hari_rilis, n].sort((a, b) => a - b) }));
  const peranTeks = f.peran_pml && f.peran_ppl ? "PML dan PPL" : f.peran_pml ? "PML" : f.peran_ppl ? "PPL" : "(belum ada peserta)";
  const simpan = async () => {
    setSibuk(true);
    await kirim(
      {
        aksi: "pengaturan",
        data: {
          aktif: f.aktif,
          rilis_jam: f.rilis_jam,
          batas_jam: f.batas_jam,
          rekap_jam: f.rekap_jam,
          soal_per_hari: Number(f.soal_per_hari),
          maks_ulang: Number(f.maks_ulang),
          ingat_menit: f.ingat_menit
            .split(/[,\s]+/)
            .filter(Boolean)
            .map(Number),
          ingat_berkala_menit: Number(f.ingat_berkala_menit),
          mulai: f.mulai || null,
          akhir: f.akhir || null,
          wajib_ulang: f.wajib_ulang,
          nilai_lulus: Number(f.nilai_lulus),
          undi_acak: f.undi_acak,
          acak_tampil: f.acak_tampil,
          rekap_pml: f.rekap_pml,
          hari_rilis: f.hari_rilis,
          peran_peserta: [f.peran_pml ? "pml" : null, f.peran_ppl ? "ppl" : null].filter(Boolean),
        },
      },
      f.aktif ? "Tersimpan dan sudah berlaku sekarang. QC Pemahaman AKTIF." : "Tersimpan dan sudah berlaku sekarang. QC Pemahaman nonaktif: petugas tidak lagi melihat soal."
    );
    setSibuk(false);
  };
  const baris = "grid gap-1 sm:grid-cols-[220px_1fr] sm:items-center";
  const bisa = d.boleh_kelola;
  const soalAktif = d.soal.filter((s) => s.aktif).length;
  return (
    <Kartu judul={`Pengaturan QC Pemahaman · ${d.kegiatan_nama}`} ket={p?.diubah_oleh ? `terakhir diubah oleh ${p.diubah_oleh}` : "belum pernah disimpan"}>
      <div className="space-y-3">
        {status ? (
          <div role="status" className={`rounded-lg border px-3 py-2.5 ${status.status === "berjalan" || status.status === "susulan" ? "border-[#A8DDBF] bg-[#EAF7F0]" : status.status === "belum_mulai" ? "border-[#BFD0F0] bg-[#EAF1FF]" : "border-[#DDE6F3] bg-[#F8FAFC]"}`}>
            <p className="text-[13.5px] font-extrabold text-[#0F2A52]">Yang berlaku sekarang: {status.judul}</p>
            {status.baris.map((b) => (
              <p key={b} className="mt-0.5 text-[12.5px] leading-snug text-[#33455F]">{b}</p>
            ))}
            <p className="mt-1 text-[11.5px] text-[#6B7A90]">Ini keadaan pengaturan yang sudah tersimpan di server, bukan isi formulir di bawah.</p>
          </div>
        ) : (
          <div role="status" className="rounded-lg border border-[#DDE6F3] bg-[#F8FAFC] px-3 py-2.5 text-[12.5px] text-[#33455F]">Belum ada pengaturan tersimpan. QC belum berlaku.</div>
        )}
        <label className="flex items-center gap-2.5 rounded-lg border border-[#DDE6F3] bg-[#F8FAFC] px-3 py-2.5">
          <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.aktif} onChange={(e) => ubah("aktif", e.target.checked)} />
          <span className="text-[13.5px] font-bold text-[#0F2A52]">Aktifkan QC Pemahaman Petugas (modal wajib untuk {peranTeks} {d.kegiatan_nama})</span>
        </label>
        {f.aktif && !p?.aktif && <Pesan jenis="peringatan">Bila dinyalakan setelah jam batas hari ini, hari ini otomatis menjadi hari susulan (tanpa label terlambat) dan petugas langsung terkunci modal.</Pesan>}
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Peserta</span>
          <span className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] text-[#1B2B4B]">
              <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.peran_ppl} onChange={(e) => ubah("peran_ppl", e.target.checked)} />
              PPL
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#1B2B4B]">
              <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.peran_pml} onChange={(e) => ubah("peran_pml", e.target.checked)} />
              PML
            </label>
            <span className="text-[12.5px] text-[#6B7A90]">petugas aktif yang ditugaskan pada survei ini (peran lain, mis. supervisor, belum didukung)</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Hari rilis soal</span>
          <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Hari rilis soal">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                disabled={!bisa}
                aria-pressed={f.hari_rilis.includes(n)}
                onClick={() => gantiHari(n)}
                className={`min-h-[36px] min-w-[52px] rounded-full px-3 text-[12.5px] font-bold ${f.hari_rilis.includes(n) ? "bg-[#0F2A52] text-white" : "border border-[#DDE6F3] bg-white text-[#55657D]"}`}
              >
                {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][n - 1]}
              </button>
            ))}
            <span className="text-[12.5px] text-[#6B7A90]">{f.hari_rilis.length === 0 ? "pilih minimal satu hari" : teksHariRilis(f.hari_rilis)}</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Soal dirilis pukul (WIB)</span>
          <input type="time" className={`${INPUT} w-32`} disabled={!bisa} value={f.rilis_jam} onChange={(e) => ubah("rilis_jam", e.target.value)} />
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Batas pengisian pukul (WIB)</span>
          <input type="time" className={`${INPUT} w-32`} disabled={!bisa} value={f.batas_jam} onChange={(e) => ubah("batas_jam", e.target.value)} />
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Rekap ke PML</span>
          <span className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-[#1B2B4B]">
              <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.rekap_pml} onChange={(e) => ubah("rekap_pml", e.target.checked)} />
              Kirim rekap tim
            </label>
            <span className="text-[12.5px] text-[#6B7A90]">pukul</span>
            <input type="time" className={`${INPUT} w-32`} disabled={!bisa || !f.rekap_pml} value={f.rekap_jam} onChange={(e) => ubah("rekap_jam", e.target.value)} aria-label="Jam rekap PML" />
            <span className="text-[12.5px] text-[#6B7A90]">esok paginya</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Soal per hari</span>
          <input type="number" min={1} max={30} className={`${INPUT} w-24`} disabled={!bisa} value={f.soal_per_hari} onChange={(e) => ubah("soal_per_hari", e.target.value)} />
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Nilai minimal lulus</span>
          <span className="flex items-center gap-2">
            <input type="number" min={1} max={100} className={`${INPUT} w-24`} disabled={!bisa} value={f.nilai_lulus} onChange={(e) => ubah("nilai_lulus", e.target.value)} />
            <span className="text-[12.5px] text-[#6B7A90]">{Number(f.nilai_lulus) >= 100 ? "100 = semua jawaban harus benar" : `lulus bila nilai ${f.nilai_lulus || "…"} ke atas`}</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Wajib mengulang</span>
          <span className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-[#1B2B4B]">
              <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.wajib_ulang} onChange={(e) => ubah("wajib_ulang", e.target.checked)} />
              Petugas yang belum lulus wajib mengulang
            </label>
            <span className="flex items-center gap-2">
              <input type="number" min={0} max={10} className={`${INPUT} w-20`} disabled={!bisa || !f.wajib_ulang} value={f.maks_ulang} onChange={(e) => ubah("maks_ulang", e.target.value)} aria-label="Maksimal ulangan" />
              <span className="text-[12.5px] text-[#6B7A90]">{f.wajib_ulang ? `kali ulangan (total ${1 + Number(f.maks_ulang || 0)} percobaan)` : "tidak dipakai: hanya satu percobaan"}</span>
            </span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Pemilihan soal</span>
          <span className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[13px] text-[#1B2B4B]">
              <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.undi_acak} onChange={(e) => ubah("undi_acak", e.target.checked)} />
              Undi soal harian secara acak (bila dilepas: berurutan menurut paket dan nomor, yang paling lama tidak dipakai lebih dulu)
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#1B2B4B]">
              <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.acak_tampil} onChange={(e) => ubah("acak_tampil", e.target.checked)} />
              Acak urutan soal dan pilihan jawaban untuk tiap petugas (bila dilepas: urutan tetap)
            </label>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Pengingat setelah rilis (menit)</span>
          <span className="flex items-center gap-2">
            <input className={`${INPUT} w-40`} disabled={!bisa} value={f.ingat_menit} onChange={(e) => ubah("ingat_menit", e.target.value)} placeholder="30, 50" />
            <span className="text-[12.5px] text-[#6B7A90]">petugas yang belum selesai dan PML-nya diingatkan</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Pengingat berkala sesudah batas</span>
          <span className="flex items-center gap-2">
            <input type="number" min={0} max={720} className={`${INPUT} w-24`} disabled={!bisa} value={f.ingat_berkala_menit} onChange={(e) => ubah("ingat_berkala_menit", e.target.value)} />
            <span className="text-[12.5px] text-[#6B7A90]">menit sekali (0 = mati, 15-720); tidak dikirim pukul 23.00-05.59</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Periode (opsional)</span>
          <span className="flex flex-wrap items-center gap-2">
            <input type="date" className={INPUT} disabled={!bisa} value={f.mulai} onChange={(e) => ubah("mulai", e.target.value)} />
            <span className="text-[12.5px] text-[#6B7A90]">s.d.</span>
            <input type="date" className={INPUT} disabled={!bisa} value={f.akhir} onChange={(e) => ubah("akhir", e.target.value)} />
          </span>
        </div>
        <p className="text-[12.5px] text-[#6B7A90]">
          Bank soal {d.kegiatan_nama}: <b>{soalAktif}</b> butir aktif dari {new Set(d.soal.filter((s) => s.aktif).map((s) => s.paket)).size} paket. Tiap hari diundi {f.soal_per_hari || "…"} soal yang sama untuk semua petugas, setiap paket terwakili.
        </p>
        {bisa && (
          <div className="space-y-2">
            {belumDisimpan && <Pesan jenis="peringatan">Ada perubahan yang belum disimpan, jadi belum berlaku bagi petugas.</Pesan>}
            <button type="button" className={BTN_G} disabled={sibuk} onClick={simpan}>
              {sibuk ? "Menyimpan…" : "Simpan dan terapkan sekarang"}
            </button>
            <ul className="list-disc space-y-0.5 pl-5 text-[12px] leading-snug text-[#6B7A90]">
              <li>Menyimpan langsung berlaku. Tidak ada tahap draf. Modal petugas mengikuti pengaturan terbaru saat dibuka, termasuk untuk hari yang sedang berjalan.</li>
              <li>Notifikasi dikirim oleh Railway Cron yang berjalan tiap 5 menit, jadi jam baru dipakai mulai putaran berikutnya.</li>
              <li>Soal hari ini yang sudah diundi tidak berubah walau jumlah soal diganti. Undi ulang bisa di sub Hari ini selama belum ada yang menjawab.</li>
            </ul>
          </div>
        )}
      </div>
    </Kartu>
  );
}

// ====================================================================== Bank soal
const SOAL_BARU: Soal = { id: "", paket: 1, judul_paket: "", nomor: 1, pertanyaan: "", opsi: { A: "", B: "", C: "", D: "" }, kunci: "A", penjelasan: "", kata_kunci: [], aktif: true };

function BankSoal({ d, kirim }: { d: Data; kirim: Kirim }) {
  const [cari, setCari] = useState("");
  const [edit, setEdit] = useState<Soal | null>(null);
  const [baru, setBaru] = useState(false);
  const [impor, setImpor] = useState(false);
  const pakets = useMemo(() => {
    const m = new Map<number, { judul: string; soal: Soal[] }>();
    for (const s of d.soal) {
      if (cari && !`${s.id} ${s.pertanyaan} ${s.judul_paket}`.toLowerCase().includes(cari.toLowerCase())) continue;
      const g = m.get(s.paket) ?? { judul: s.judul_paket, soal: [] };
      g.soal.push(s);
      m.set(s.paket, g);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [d.soal, cari]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} min-w-[200px] flex-1`} placeholder="Cari soal…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari soal" />
        {d.boleh_kelola && (
          <>
            <button type="button" className={BTN} onClick={() => { setEdit({ ...SOAL_BARU }); setBaru(true); }}>
              + Soal baru
            </button>
            <button type="button" className={BTN_O} onClick={() => setImpor(true)}>
              Impor banyak soal
            </button>
          </>
        )}
      </div>
      {pakets.length === 0 && (
        <Pesan jenis="info">
          {d.soal.length === 0
            ? `Bank soal ${d.kegiatan_nama} masih kosong. Tambah soal satu per satu, atau impor banyak soal dari Excel (unduh templat di jendela impor). QC baru bisa dinyalakan setelah ada soal.`
            : "Tidak ada soal yang cocok dengan pencarian."}
        </Pesan>
      )}
      {pakets.map(([paket, g]) => (
        <Kartu key={paket} judul={`Paket ${paket} · ${g.judul}`} ket={`${g.soal.filter((s) => s.aktif).length} aktif dari ${g.soal.length}`}>
          <ul className="divide-y divide-[#E3E8EE]">
            {g.soal.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className={`text-[13.5px] leading-snug ${s.aktif ? "text-[#1B2B4B]" : "text-[#8794A6] line-through"}`}>
                    <Sorot teks={s.pertanyaan} kata={s.kata_kunci} />
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#6B7A90]">
                    {s.id} · {s.opsi.C ? "4 pilihan" : "2 pilihan"} · kunci {s.kunci}
                    {s.opsi.C ? "" : ` (${s.opsi[s.kunci] ?? ""})`} · {s.kata_kunci.length} kata kunci
                  </p>
                </div>
                <div className="flex flex-none items-center gap-1">
                  {d.boleh_kelola ? (
                    <>
                      <button type="button" className={BTN_T} onClick={() => { setEdit(s); setBaru(false); }}>
                        Ubah
                      </button>
                      <button type="button" className={BTN_T} onClick={() => void kirim({ aksi: "soal_aktif", id: s.id, aktif: !s.aktif }, s.aktif ? "Soal dinonaktifkan." : "Soal diaktifkan.")}>
                        {s.aktif ? "Matikan" : "Aktifkan"}
                      </button>
                    </>
                  ) : (
                    <Chip w={s.aktif ? "ok" : "mut"}>{s.aktif ? "Aktif" : "Nonaktif"}</Chip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Kartu>
      ))}
      {edit && <EditSoal awal={edit} baru={baru} kirim={kirim} onTutup={() => setEdit(null)} />}
      {impor && <ImporSoal kirim={kirim} kegiatanId={d.kegiatan_id} onTutup={() => setImpor(false)} />}
    </>
  );
}

function Lapis({ judul, onTutup, children }: { judul: string; onTutup: () => void; children: React.ReactNode }) {
  useTutupDenganBack(true, onTutup); // (29 Okt 2026) Back HP menutup lapisan
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-[#0B1530]/60 p-0 sm:items-center sm:p-4" onClick={onTutup} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={judul} onClick={(e) => e.stopPropagation()} className="max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[16px] font-extrabold text-[#0F2A52]">{judul}</h3>
          <button type="button" onClick={onTutup} className="text-[22px] font-bold leading-none text-[#6B7A90]" aria-label="Tutup">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditSoal({ awal, baru, kirim, onTutup }: { awal: Soal; baru: boolean; kirim: Kirim; onTutup: () => void }) {
  const [s, setS] = useState<Soal>(awal);
  const [kata, setKata] = useState(awal.kata_kunci.join("\n"));
  const [sibuk, setSibuk] = useState(false);
  // (29 Okt 2026) soal 2 pilihan (Benar/Salah): hanya pilihan A dan B; C dan D tidak dikirim
  const [dua, setDua] = useState(!baru && !awal.opsi.C && !awal.opsi.D);
  const kodePilihan = dua ? (["A", "B"] as const) : (["A", "B", "C", "D"] as const);
  const ubahJenis = (benarSalah: boolean) => {
    setDua(benarSalah);
    setS((x) => {
      const opsi: Record<string, string> = benarSalah
        ? { A: x.opsi.A?.trim() ? x.opsi.A : "Benar", B: x.opsi.B?.trim() ? x.opsi.B : "Salah" }
        : { A: x.opsi.A ?? "", B: x.opsi.B ?? "", C: x.opsi.C ?? "", D: x.opsi.D ?? "" };
      return { ...x, opsi, kunci: benarSalah && x.kunci !== "A" && x.kunci !== "B" ? "A" : x.kunci };
    });
  };
  const kataDaftar = kata.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  const simpan = async () => {
    setSibuk(true);
    const r = await kirim({ aksi: "soal", data: { ...s, opsi: dua ? { A: s.opsi.A ?? "", B: s.opsi.B ?? "" } : s.opsi, paket: Number(s.paket), nomor: Number(s.nomor), judul_paket: s.judul_paket || `Paket ${s.paket}`, kata_kunci: kataDaftar } }, baru ? "Soal ditambahkan." : "Soal disimpan.");
    setSibuk(false);
    if (r) onTutup();
  };
  const f = "grid gap-1";
  return (
    <Lapis judul={baru ? "Soal baru" : `Ubah soal ${s.id}`} onTutup={onTutup}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={f}>
            <span className="text-[12.5px] font-bold text-[#1B2B4B]">Kode soal</span>
            <input className={INPUT} value={s.id} disabled={!baru} onChange={(e) => setS({ ...s, id: e.target.value })} placeholder="unik, mis. NTP-01" />
          </label>
          <label className={f}>
            <span className="text-[12.5px] font-bold text-[#1B2B4B]">Paket (angka)</span>
            <input type="number" min={1} max={99} className={INPUT} value={s.paket} onChange={(e) => setS({ ...s, paket: Number(e.target.value) })} />
          </label>
          <label className={f}>
            <span className="text-[12.5px] font-bold text-[#1B2B4B]">Nomor urut</span>
            <input type="number" min={1} className={INPUT} value={s.nomor} onChange={(e) => setS({ ...s, nomor: Number(e.target.value) })} />
          </label>
        </div>
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Judul paket</span>
          <input className={INPUT} value={s.judul_paket} onChange={(e) => setS({ ...s, judul_paket: e.target.value })} />
        </label>
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Pertanyaan</span>
          <textarea rows={3} className={INPUT} value={s.pertanyaan} onChange={(e) => setS({ ...s, pertanyaan: e.target.value })} />
        </label>
        <div role="group" aria-label="Jenis soal" className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Jenis soal</span>
          {([[false, "4 pilihan (A-D)"], [true, "Benar / Salah (2 pilihan)"]] as const).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={dua === v} onClick={() => ubahJenis(v)} className={`min-h-[36px] rounded-full px-3.5 text-[12.5px] font-bold ${dua === v ? "bg-[#0F2A52] text-white" : "border border-[#DDE6F3] bg-white text-[#55657D]"}`}>
              {l}
            </button>
          ))}
        </div>
        {kodePilihan.map((k) => (
          <label key={k} className="flex items-start gap-2">
            <input type="radio" name="kunci" className="mt-2.5 h-4 w-4 accent-[#13794B]" checked={s.kunci === k} onChange={() => setS({ ...s, kunci: k })} aria-label={`Jadikan ${k} jawaban benar`} />
            <span className="grid flex-1 gap-1">
              <span className="text-[12.5px] font-bold text-[#1B2B4B]">
                Pilihan {k} {s.kunci === k && <span className="text-[#13794B]">(jawaban benar)</span>}
              </span>
              <input className={INPUT} value={s.opsi[k] ?? ""} onChange={(e) => setS({ ...s, opsi: { ...s.opsi, [k]: e.target.value } })} />
            </span>
          </label>
        ))}
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Pembahasan</span>
          <textarea rows={3} className={INPUT} value={s.penjelasan} onChange={(e) => setS({ ...s, penjelasan: e.target.value })} />
        </label>
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Kata kunci yang disorot (satu per baris)</span>
          <textarea rows={3} className={INPUT} value={kata} onChange={(e) => setKata(e.target.value)} placeholder={"surat tugas\nsub SLS"} />
        </label>
        <div className="rounded-lg bg-[#F8FAFC] p-3">
          <p className="text-[11.5px] font-extrabold uppercase tracking-wide text-[#6B7A90]">Pratinjau sorotan</p>
          <p className="mt-1 text-[14px] font-bold leading-snug text-[#0F2A52]">
            <Sorot teks={s.pertanyaan || "(pertanyaan)"} kata={kataDaftar} />
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[#1B2B4B]">
            <Sorot teks={s.penjelasan || "(pembahasan)"} kata={kataDaftar} />
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_O} onClick={onTutup}>
            Batal
          </button>
          <button type="button" className={BTN_G} disabled={sibuk} onClick={simpan}>
            {sibuk ? "Menyimpan…" : "Simpan soal"}
          </button>
        </div>
      </div>
    </Lapis>
  );
}

function ImporSoal({ kirim, kegiatanId, onTutup }: { kirim: Kirim; kegiatanId: number; onTutup: () => void }) {
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [berkas, setBerkas] = useState<string | null>(null);
  const [peta, setPeta] = useState<HasilPeta | null>(null);

  const unduhTemplat = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(templatSoal());
    ws["!cols"] = [{ wch: 12 }, { wch: 7 }, { wch: 26 }, { wch: 8 }, { wch: 60 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 7 }, { wch: 50 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Soal");
    XLSX.writeFile(wb, "templat_soal_qc_pemahaman.xlsx");
  };

  const pilihBerkas = async (f: File | undefined) => {
    setGalat(null);
    setPeta(null);
    setBerkas(null);
    if (!f) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const nama = wb.SheetNames[0];
      if (!nama) throw new Error("Berkas tidak punya lembar.");
      const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nama], { defval: "", raw: false });
      setBerkas(f.name);
      setPeta(petaSoalDariBaris(baris, { kegiatanId }));
    } catch (e) {
      setGalat(`Berkas tidak bisa dibaca: ${pesanGalat(e)}`);
    }
  };

  const jalanExcel = async () => {
    if (!peta || peta.soal.length === 0) return;
    setSibuk(true);
    const r = await kirim({ aksi: "impor", soal: peta.soal }, (x) => `${x.diimpor ?? peta.soal.length} soal diimpor.`);
    setSibuk(false);
    if (r) onTutup();
  };
  return (
    <Lapis judul="Impor banyak soal" onTutup={onTutup}>
      <div className="space-y-3">
          <p className="text-[12.5px] leading-snug text-[#55657D]">
            Siapkan berkas Excel (lembar pertama): kolom <b>Kode</b> (boleh kosong, dibuat otomatis), <b>Paket</b>, <b>Judul Paket</b>, <b>Nomor</b>, <b>Pertanyaan</b>, <b>A</b>, <b>B</b>, <b>C</b>, <b>D</b>, <b>Kunci</b> (A-D), <b>Pembahasan</b>, <b>Kata Kunci</b> (pisahkan dengan titik koma). Soal Benar/Salah: kosongkan C dan D lalu isi Kunci dengan <b>Benar</b> atau <b>Salah</b> (A dan B boleh dikosongkan, otomatis Benar dan Salah). Soal dengan kode yang sama diperbarui; tidak ada yang dihapus. Maksimal 300 soal per impor.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BTN_O} onClick={() => void unduhTemplat()}>
              Unduh templat Excel
            </button>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void pilihBerkas(e.target.files?.[0])} aria-label="Pilih berkas Excel soal" className="text-[13px]" />
          </div>
          {berkas && peta && (
            <div className="rounded-lg border border-[#DDE6F3] bg-[#F8FAFC] p-3 text-[13px] text-[#1B2B4B]">
              <p className="font-bold">
                {berkas}: {peta.soal.length} soal siap diimpor
                {peta.galat.length > 0 ? `, ${peta.galat.length} baris bermasalah` : ""}
                {peta.dilewati > 0 ? `, ${peta.dilewati} baris kosong dilewati` : ""}.
              </p>
              {peta.galat.length > 0 && (
                <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-[12.5px] text-[#9B1C23]">
                  {peta.galat.slice(0, 30).map((g) => (
                    <li key={`${g.baris}-${g.pesan}`}>
                      {g.baris > 0 ? `Baris ${g.baris}: ` : ""}
                      {g.pesan}
                    </li>
                  ))}
                  {peta.galat.length > 30 && <li>… dan {peta.galat.length - 30} lagi</li>}
                </ul>
              )}
              {peta.soal.length > 0 && peta.galat.length > 0 && <p className="mt-1.5 text-[12.5px] text-[#6B7A90]">Baris yang bermasalah tidak ikut diimpor. Perbaiki di Excel lalu pilih berkas lagi bila ingin semuanya masuk.</p>}
            </div>
          )}
          {galat && <p className="text-[13px] font-bold text-[#B42329]">{galat}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_O} onClick={onTutup}>
              Batal
            </button>
            <button type="button" className={BTN_G} disabled={sibuk || !peta || peta.soal.length === 0} onClick={jalanExcel}>
              {sibuk ? "Mengimpor…" : peta && peta.soal.length > 0 ? `Impor ${peta.soal.length} soal` : "Impor"}
            </button>
          </div>
      </div>
    </Lapis>
  );
}
