"use client";

// app/sigap/kelola/pendataan/Notifikasi.tsx
//
// (31 Okt 2026) Tab "3 · Notifikasi" (kode tab tetap `siaran`, alamat lama tetap hidup), PER KEGIATAN. Tiga sub-tab:
//   Otomatis  notifikasi yang dikirim sistem: pengingat Translok (jam, syarat foto), alur FASIH (khusus Pascabencana), status cron; terisi BAWAAN ketentuan umum
//   Manual    instruksi atau hal di luar ketentuan umum: Siaran ke seluruh petugas dan kirim ke satu petugas (komponen lama, dipindah apa adanya)
//   Riwayat   gabungan semua notifikasi non-QC untuk kegiatan ini (QC Pemahaman punya riwayat sendiri di tab QC)
// Aturan dan bawaan: lib/pushPengaturan.ts. Data: /api/portal/notifikasi-otomatis.

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { SUB_NOTIFIKASI, type KodeTabPendataan } from "@/lib/sigapPendataanTab";
import type { EntriRiwayat, KunciFasih, SetelanTranslok } from "@/lib/pushPengaturan";
import Siaran from "./Siaran";
import KirimSatu from "./KirimSatu";
import { SubPilih, useSubTab } from "./useSubTab";

type Denyut = { terakhir: string | null; status: "hidup" | "terlambat" | "mati" | "belum"; ringkasan: unknown };
type Data = {
  kegiatan_id: number;
  tabel_siap: boolean;
  pengaturan: { translok: SetelanTranslok; bawaan_translok: SetelanTranslok };
  fasih: { kunci: KunciFasih; label: string; ket: string; aktif: boolean }[] | null;
  denyut: { pengingat: Denyut; qc: Denyut };
  kesiapan: { push_siap: boolean; penerima: number; berlangganan: number };
  riwayat: EntriRiwayat[];
  boleh_kelola: boolean;
};

const kartu = "mt-4 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const kolom = "mt-1 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14px] text-[#1B2B4B]";
const judulKartu = "text-[15px] font-extrabold text-[#0F2A52]";
const ket = "mt-1 text-[12.5px] leading-snug text-[#55657D]";

function waktuTeks(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " WIB";
  } catch {
    return iso;
  }
}
function lalu(iso: string | null): string {
  if (!iso) return "belum pernah";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  if (m < 1440) return `${Math.round(m / 60)} jam lalu`;
  return `${Math.round(m / 1440)} hari lalu`;
}

export default function Notifikasi({ kegiatanId, namaKegiatan, adaQc, onBukaTab }: { kegiatanId: number; namaKegiatan: string; adaQc: boolean; onBukaTab: (t: KodeTabPendataan) => void }) {
  const { sub, pilih } = useSubTab("siaran", SUB_NOTIFIKASI);
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      setD(await apiPortal<Data>(`/api/portal/notifikasi-otomatis?k=${kegiatanId}`));
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal memuat pengaturan notifikasi.");
    }
  }, [kegiatanId]);
  useEffect(() => {
    void muat();
  }, [muat]);

  return (
    <div className="space-y-1">
      <SubPilih daftar={SUB_NOTIFIKASI} aktif={sub} onPilih={pilih} label="Notifikasi" />
      {galat && sub !== "manual" && <p className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
      {sub === "otomatis" && d && <Otomatis d={d} kegiatanId={kegiatanId} adaQc={adaQc} onBukaTab={onBukaTab} onUbah={muat} />}
      {sub === "otomatis" && !d && !galat && <p className="mt-4 text-[13px] text-[#6B7A90]">Memuat…</p>}
      {sub === "manual" && (
        <>
          <Siaran key={kegiatanId} kegiatanId={kegiatanId} namaKegiatan={namaKegiatan} />
          <KirimSatu key={`k${kegiatanId}`} kegiatanId={kegiatanId} />
        </>
      )}
      {sub === "riwayat" && d && <Riwayat riwayat={d.riwayat} />}
      {sub === "riwayat" && !d && !galat && <p className="mt-4 text-[13px] text-[#6B7A90]">Memuat…</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------- Otomatis
function Otomatis({ d, kegiatanId, adaQc, onBukaTab, onUbah }: { d: Data; kegiatanId: number; adaQc: boolean; onBukaTab: (t: KodeTabPendataan) => void; onUbah: () => Promise<void> }) {
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const boleh = d.boleh_kelola;

  async function kirim(body: Record<string, unknown>, sukses: string): Promise<boolean> {
    setPesan(null);
    try {
      await apiPortal("/api/portal/notifikasi-otomatis", { method: "POST", body: JSON.stringify({ kegiatan: kegiatanId, ...body }) });
      setPesan({ ok: true, teks: sukses });
      await onUbah();
      return true;
    } catch (e) {
      setPesan({ ok: false, teks: e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menyimpan." });
      return false;
    }
  }

  return (
    <>
      {!d.tabel_siap && (
        <p className="mt-3 rounded-[12px] border border-[#F2D58A] bg-[#FFF6E0] px-3 py-2 text-[13px] text-[#6B4A0E]">
          Tabel pengaturan belum dibuat. Notifikasi tetap berjalan dengan pengaturan bawaan di bawah; untuk mengubahnya jalankan <b>skema-sql/fase-b/20261031d_push_pengaturan.sql</b> di Supabase.
        </p>
      )}
      {pesan && (
        <p role="status" className={`mt-3 rounded-[12px] border-l-4 px-3 py-2 text-[13px] ${pesan.ok ? "border-[#1E8A4C] bg-[#E6F6EC] text-[#14532D]" : "border-[#B42329] bg-[#FDE8E8] text-[#7A1D22]"}`}>
          {pesan.teks}
        </p>
      )}
      <Kesiapan d={d} />
      <PengingatTranslok key={JSON.stringify(d.pengaturan.translok)} s={d.pengaturan.translok} bawaan={d.pengaturan.bawaan_translok} boleh={boleh} kirim={kirim} />
      {d.fasih && (
        <section className={kartu}>
          <h2 className={judulKartu}>Alur FASIH (Pendataan Pascabencana)</h2>
          <p className={ket}>Notifikasi yang dikirim sistem saat PML mengajukan atau admin memproses daftar KK FASIH. Bawaan: menyala semua.</p>
          <ul className="mt-2 divide-y divide-[#EEF2F7]">
            {d.fasih.map((f) => (
              <li key={f.kunci} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <b className="block text-[13.5px] text-[#1B2B4B]">{f.label}</b>
                  <span className="block text-[12px] text-[#6B7A90]">{f.ket}</span>
                </div>
                <Saklar nyala={f.aktif} disabled={!boleh} label={f.label} onUbah={(v) => void kirim({ kunci: f.kunci, aktif: v }, v ? "Dinyalakan." : "Dimatikan.")} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={kartu}>
        <h2 className={judulKartu}>QC Pemahaman</h2>
        <p className={ket}>
          Push rilis soal dan pengingat kuis diatur di tab QC (jam rilis, pengingat, ulangan). {adaQc ? "" : "QC belum diaktifkan untuk kegiatan ini. "}
          Denyut cron QC: <b>{teksDenyut(d.denyut.qc)}</b>.
        </p>
        {adaQc && (
          <button type="button" onClick={() => onBukaTab("qc")} className="mt-2 min-h-[42px] rounded-[12px] border border-[#DDE6F3] bg-white px-4 text-[13.5px] font-extrabold text-[#0F2A52]">
            Buka tab QC
          </button>
        )}
      </section>
      <section className={kartu}>
        <h2 className={judulKartu}>Menyusul</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-[#55657D]">
          <li>Pengingat H-1 mulai pendataan atau pelatihan (14.00) dan terima kasih H+1 pelatihan</li>
          <li>Pesan penyemangat (target masih rendah) dan apresiasi kerja hari ini, otomatis berhenti bila petugas sudah menerima banyak notifikasi hari itu</li>
          <li>Kuis mingguan di luar jadwal pendataan</li>
        </ul>
        <p className="mt-2 text-[12px] text-[#6B7A90]">Penghitung notifikasi per petugas per hari sudah mulai mencatat sejak SQL dijalankan, jadi batas hariannya langsung siap dipakai.</p>
      </section>
    </>
  );
}

function teksDenyut(x: Denyut): string {
  if (x.status === "belum") return "belum pernah jalan";
  return `${x.status === "hidup" ? "hidup" : x.status === "terlambat" ? "terlambat" : "tidak berjalan"} (terakhir ${lalu(x.terakhir)})`;
}

function Kesiapan({ d }: { d: Data }) {
  const k = d.kesiapan;
  const p = d.denyut.pengingat;
  const warna = p.status === "hidup" ? "bg-[#E6F6EC] text-[#14532D]" : p.status === "belum" ? "bg-[#FFF6E0] text-[#6B4A0E]" : "bg-[#FDE8E8] text-[#7A1D22]";
  return (
    <section className={kartu}>
      <h2 className={judulKartu}>Kesiapan</h2>
      <p className={ket}>
        Petugas bertugas: <b>{k.penerima}</b> · sudah mengaktifkan notifikasi: <b>{k.berlangganan}</b>
        {k.penerima > k.berlangganan ? ` · belum: ${k.penerima - k.berlangganan}` : ""}
      </p>
      {!k.push_siap && <p className="mt-2 text-[12.5px] font-bold text-[#B42329]">Kunci VAPID belum terpasang di server, notifikasi belum bisa dikirim.</p>}
      <p className={`mt-2 rounded-[12px] px-3 py-2 text-[12.5px] ${warna}`}>
        Cron pengingat Translok: <b>{teksDenyut(p)}</b>.
        {p.status === "belum" && " Buat satu cron di Railway: POST /api/sigap/pengingat-push?slot=auto, jadwal */5 * * * *, header Authorization: Bearer <SIGAP_CRON_SECRET>."}
        {(p.status === "terlambat" || p.status === "mati") && " Periksa cron di Railway: seharusnya berjalan tiap 5 menit."}
      </p>
    </section>
  );
}

function Saklar({ nyala, disabled, label, onUbah }: { nyala: boolean; disabled?: boolean; label: string; onUbah: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={nyala}
      aria-label={label}
      disabled={disabled}
      onClick={() => onUbah(!nyala)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${nyala ? "bg-[#1F5FD1]" : "bg-[#C9D3E3]"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${nyala ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------- Translok
function PengingatTranslok({ s, bawaan, boleh, kirim }: { s: SetelanTranslok; bawaan: SetelanTranslok; boleh: boolean; kirim: (b: Record<string, unknown>, ok: string) => Promise<boolean> }) {
  const [aktif, setAktif] = useState(s.aktif);
  const [f, setF] = useState({ jam1: s.jam1, jam2: s.jam2, jam3: s.jam3, foto1: String(s.foto1), foto2: String(s.foto2), jarak_jam: String(s.jarak_jam) });
  const [proses, setProses] = useState(false);
  const ubah = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const berubah = aktif !== s.aktif || f.jam1 !== s.jam1 || f.jam2 !== s.jam2 || f.jam3 !== s.jam3 || f.foto1 !== String(s.foto1) || f.foto2 !== String(s.foto2) || f.jarak_jam !== String(s.jarak_jam);

  async function simpan() {
    if (proses) return;
    setProses(true);
    await kirim({ kunci: "translok", aktif, nilai: { jam1: f.jam1, jam2: f.jam2, jam3: f.jam3, foto1: Number(f.foto1), foto2: Number(f.foto2), jarak_jam: Number(f.jarak_jam) } }, "Pengaturan pengingat Translok tersimpan.");
    setProses(false);
  }
  async function pakaiBawaan() {
    if (proses) return;
    setProses(true);
    await kirim({ aksi: "bawaan" }, "Dikembalikan ke bawaan.");
    setProses(false);
  }

  return (
    <section className={kartu}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={judulKartu}>Pengingat Translok</h2>
          <p className={ket}>
            Hanya untuk petugas yang <b>hari ini hari Translok-nya</b> (libur tidak pernah diingatkan). Setiap pengingat berisi hal terpenting yang belum dilengkapi hari itu.
          </p>
        </div>
        <Saklar nyala={aktif} disabled={!boleh} label="Pengingat Translok" onUbah={setAktif} />
      </div>
      <div className={`mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 ${aktif ? "" : "opacity-50"}`}>
        <label className="block text-[12px] font-bold text-[#55657D]">
          Pengingat 1 · jam
          <input type="time" step={300} value={f.jam1} onChange={ubah("jam1")} disabled={!boleh || !aktif} className={kolom} />
          <span className="mt-1 block font-normal text-[#6B7A90]">Dikirim bila foto kurang dari</span>
          <input type="number" min={1} max={10} value={f.foto1} onChange={ubah("foto1")} disabled={!boleh || !aktif} className={kolom} />
        </label>
        <label className="block text-[12px] font-bold text-[#55657D]">
          Pengingat 2 · jam
          <input type="time" step={300} value={f.jam2} onChange={ubah("jam2")} disabled={!boleh || !aktif} className={kolom} />
          <span className="mt-1 block font-normal text-[#6B7A90]">Dikirim bila foto kurang dari</span>
          <input type="number" min={1} max={10} value={f.foto2} onChange={ubah("foto2")} disabled={!boleh || !aktif} className={kolom} />
        </label>
        <label className="block text-[12px] font-bold text-[#55657D]">
          Pengingat terakhir · jam
          <input type="time" step={300} value={f.jam3} onChange={ubah("jam3")} disabled={!boleh || !aktif} className={kolom} />
          <span className="mt-1 block font-normal text-[#6B7A90]">Dikirim bila hari ini belum lengkap (paling lambat 22.45)</span>
        </label>
      </div>
      <label className={`mt-3 block max-w-[220px] text-[12px] font-bold text-[#55657D] ${aktif ? "" : "opacity-50"}`}>
        Jarak minimal antar pengingat (jam)
        <input type="number" min={1} max={12} value={f.jarak_jam} onChange={ubah("jarak_jam")} disabled={!boleh || !aktif} className={kolom} />
      </label>
      <p className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-2 text-[12.5px] leading-snug text-[#55657D]">
        Bawaan: {bawaan.jam1} (foto kurang dari {bawaan.foto1}) · {bawaan.jam2} (kurang dari {bawaan.foto2}) · {bawaan.jam3} (belum lengkap), jarak minimal {bawaan.jarak_jam} jam. Jumlah foto yang disyaratkan tidak melebihi jumlah foto kegiatan. Tidak ada kiriman pukul 23.00–05.59 WIB.
      </p>
      {boleh ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void simpan()} disabled={!berubah || proses} className="min-h-[44px] rounded-[12px] bg-[#1F5FD1] px-4 text-[13.5px] font-extrabold text-white disabled:opacity-50">
            {proses ? "Menyimpan…" : "Simpan"}
          </button>
          <button type="button" onClick={() => void pakaiBawaan()} disabled={proses} className="min-h-[44px] rounded-[12px] border border-[#DDE6F3] bg-white px-4 text-[13.5px] font-extrabold text-[#0F2A52] disabled:opacity-50">
            Kembalikan semua ke bawaan
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-[#6B7A90]">Akun ini hanya boleh melihat; mengubah butuh izin kelola pendataan.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------- Riwayat
function Riwayat({ riwayat }: { riwayat: EntriRiwayat[] }) {
  return (
    <section className={kartu}>
      <h2 className={judulKartu}>Riwayat notifikasi</h2>
      <p className={ket}>Gabungan siaran manual, pengingat Translok, dan alur FASIH untuk kegiatan ini. Riwayat QC Pemahaman ada di tab QC.</p>
      {riwayat.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#6B7A90]">Belum ada notifikasi tercatat.</p>
      ) : (
        <ul className="mt-2 overflow-hidden rounded-[14px] border border-[#EEF2F7]">
          {riwayat.map((x, i) => (
            <li key={i} className="border-t border-[#EEF2F7] px-3 py-2 first:border-t-0">
              <span className="inline-block rounded-full bg-[#EEF3FB] px-2 py-0.5 text-[11px] font-extrabold text-[#2D4A7A]">{x.label}</span>
              <b className="mt-1 block text-[13px] text-[#1B2B4B]">{x.judul}</b>
              <span className="block text-[11.5px] text-[#6B7A90]">
                {waktuTeks(x.waktu)} · {x.akun} petugas · {x.terkirim} perangkat diterima{x.gagal > 0 ? ` · ${x.gagal} gagal` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
