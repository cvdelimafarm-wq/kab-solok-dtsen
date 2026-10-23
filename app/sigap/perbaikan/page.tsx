"use client";

// app/sigap/perbaikan/page.tsx
//
// (15 Okt 2026) Menu "Perbaiki administrasi" Transport Lokal -- permintaan user (mockup layar 4-5, rancangan: claude/rancangan-pengawasan-pml-perbaikan-administrasi.md).
// Daftar hari kerja yang masih bisa diperbaiki (jendela 24 jam), checklist kelengkapan per hari, dan tindakan satu per satu:
//   foto = unggah ulang (halaman kerja translok, bagian foto); laporan (kegiatan pendataan) = tandai status KK di Lembar Pendataan mode perbaikan;
//   "Tanggal ini saya tidak bekerja" = hari itu ditandai bukan hari kerja (tidak ada data dihapus).
// Sumber data = daftar kekurangan yang sama dengan kartu Beranda (/api/portal/kegiatan, jenis "perbaikan"); status kelengkapan ikut berubah otomatis.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { keAtas } from "@/app/portal/navigasi";
import TombolKembali from "@/app/components/TombolKembali";
import { apiPortal } from "@/app/portal/sesi";
import { tandaBasi, useData } from "@/app/portal/dataBersama";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";
import type { HariPerbaikan, Kekurangan } from "@/lib/sigapKekurangan";
import { hariWib } from "@/lib/sigapPengingat";
import { peringatanSekali, ucapanLengkap } from "@/lib/sigapPerbaikan";

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
function tglLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function jamLabel(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${p(d.getUTCHours())}.${p(d.getUTCMinutes())} WIB`;
}
const tambahQ = (href: string, q: string) => `${href}${href.includes("?") ? "&" : "?"}${q}`;

function Chip({ ok, teks }: { ok: boolean | null; teks: string }) {
  const kelas = ok === true ? "bg-[#E3F6EC] text-[#0B6B3F]" : ok === false ? "bg-[#FDE8E8] text-[#9B1C23]" : "bg-[#FFF4D6] text-[#8A6200]";
  return <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold ${kelas}`}>{teks}</span>;
}

export default function PerbaikanAdministrasi() {
  const router = useRouter();
  const dKeg = useData<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan");
  const [pen, setPen] = useState<number | null>(null);
  const [tidak, setTidak] = useState<{ pen: number; tanggal: string } | null>(null);
  const [proses, setProses] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const p = Number(q.get("p"));
      setPen(Number.isInteger(p) && p > 0 ? p : null);
    } catch {
      /* abaikan */
    }
  }, []);

  // ?tidak=<tgl> (dari tombol di modal): langsung membuka konfirmasi "tidak bekerja" untuk tanggal itu
  const daftar: Kekurangan[] = (dKeg.data?.kegiatan ?? []).flatMap((k) => k.kekurangan ?? []).filter((k) => k.jenis === "perbaikan" && (pen === null || k.penugasanId === pen));
  useEffect(() => {
    if (!dKeg.data) return;
    try {
      const t = new URLSearchParams(window.location.search).get("tidak");
      if (!t || tidak) return;
      const k = daftar.find((x) => x.hari?.some((h) => h.tanggal === t));
      if (k?.penugasanId) setTidak({ pen: k.penugasanId, tanggal: t });
    } catch {
      /* abaikan */
    }
  }, [dKeg.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function kirimTidakBekerja() {
    if (!tidak) return;
    setProses(true);
    setPesan(null);
    try {
      await apiPortal("/api/portal/perbaikan", { method: "POST", body: JSON.stringify({ aksi: "tidak_bekerja", penugasan_id: tidak.pen, tanggal: tidak.tanggal }) });
      tandaBasi("/api/portal/kegiatan");
      setTidak(null);
      await dKeg.muat();
    } catch (e) {
      setPesan(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal menyimpan. Coba lagi.");
    } finally {
      setProses(false);
    }
  }

  const memuat = !dKeg.data && !dKeg.galat;
  const lengkap = !!dKeg.data && daftar.length === 0;

  return (
    <main className="flex min-h-[calc(100dvh_-_var(--tinggi-banner,0px))] flex-col bg-[#F2F6FC] text-[#1B2B4B]">
      <header className="flex-none bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-3 pb-3 pt-2 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-2.5">
          <TombolKembali tema="gelap" className="max-w-[40%] flex-none" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16.5px] font-extrabold leading-[1.15]">Perbaiki administrasi</h1>
            <p className="truncate text-[11.5px] text-[#A9BCD8]">{lengkap ? "Semua lengkap" : daftar.length > 0 ? `${daftar.reduce((n, k) => n + (k.hari?.length ?? 0), 0)} hari kerja perlu dilengkapi` : "Transport Lokal"}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl flex-1 space-y-3 px-3 pb-24 pt-3">
        {dKeg.galat && !dKeg.data && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{dKeg.galat}</p>}
        {memuat && <div className="h-40 animate-pulse rounded-[20px] bg-white" aria-busy="true" />}

        {lengkap && (
          <section className="rounded-[20px] bg-white p-5 text-center shadow-[0_8px_22px_rgba(15,42,82,.08)]">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#E3F6EC] text-[28px] text-[#13794B]" aria-hidden>
              ✓
            </div>
            <h2 className="mt-3 text-[17px] font-extrabold">Administrasi lengkap</h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#3A4A66]">{ucapanLengkap(hariWib(Date.now()))}</p>
            <button type="button" onClick={() => keAtas(router, "/")} className="mt-4 min-h-[46px] w-full rounded-xl bg-[#1F5FD1] px-4 text-[15px] font-extrabold text-white">
              Kembali ke beranda
            </button>
          </section>
        )}

        {daftar.map((k) => (
          <section key={k.kode} className="space-y-2.5">
            <div className="rounded-[14px] border-l-4 border-[#E0A526] bg-[#FFF4D6] px-3 py-2.5 text-[12.5px] leading-snug text-[#5E4300]">
              <b>Kesempatan hanya sekali.</b> Berlaku sampai {k.batas ? jamLabel(k.batas) : "batas yang ditentukan"}. {peringatanSekali}
            </div>
            {(k.hari ?? []).map((h) => (
              <KartuHari key={h.tanggal} k={k} h={h} onTidak={() => setTidak({ pen: k.penugasanId ?? 0, tanggal: h.tanggal })} />
            ))}
          </section>
        ))}
        {pesan && !tidak && <p className="rounded-[14px] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{pesan}</p>}
      </div>

      {tidak && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0B1530]/60 p-0 sm:items-center sm:p-4" onClick={() => !proses && setTidak(null)}>
          <div role="dialog" aria-modal="true" aria-label="Konfirmasi tidak bekerja" className="w-full max-w-sm space-y-3 rounded-t-2xl bg-white px-5 py-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[17px] font-extrabold leading-snug">Tanggal {tglLabel(tidak.tanggal)} saya tidak bekerja?</h2>
            <p className="text-[13.5px] leading-relaxed text-[#3A4A66]">Hari itu ditandai bukan hari kerja dan tidak ikut dihitung di Kwitansi. Foto dan laporan yang sudah ada tidak dihapus. Setelah ditandai, hari ini tidak bisa dikembalikan sendiri.</p>
            {pesan && <p className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{pesan}</p>}
            <button type="button" disabled={proses} onClick={() => void kirimTidakBekerja()} className="min-h-[46px] w-full rounded-xl bg-[#B42329] px-4 text-[15px] font-extrabold text-white disabled:opacity-60">
              {proses ? "Menyimpan…" : "Ya, saya tidak bekerja"}
            </button>
            <button type="button" disabled={proses} onClick={() => setTidak(null)} className="min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-4 text-[14px] font-bold text-[#1E2A47]">
              Batal
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function KartuHari({ k, h, onTidak }: { k: Kekurangan; h: HariPerbaikan; onTidak: () => void }) {
  const kerja = k.hrefKerja ?? "/";
  const fotoKurang = h.fotoTotal - h.foto;
  const hrefFoto = tambahQ(kerja, `tab=hari_kerja&tgl=${h.tanggal}&fokus=foto`);
  const hrefLaporan = k.lewatKk ? `/sigap/pendataan?perbaikan=${k.penugasanId}&tgl=${h.tanggal}&utama=1` : tambahQ(kerja, `tab=hari_kerja&tgl=${h.tanggal}&fokus=laporan`);
  return (
    <article className="rounded-[18px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold">{tglLabel(h.tanggal)}</h2>
        <Chip ok={false} teks="Kurang" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Checklist kelengkapan">
        <Chip ok={true} teks="Hari kerja ✓" />
        <Chip ok={!h.laporan} teks={h.laporan ? "Laporan ✗" : "Laporan ✓"} />
        <Chip ok={fotoKurang === 0 ? true : h.foto === 0 ? false : null} teks={`Foto ${h.foto}/${h.fotoTotal}`} />
      </div>
      <div className="mt-3 space-y-2">
        {fotoKurang > 0 && (
          <a href={hrefFoto} className="flex min-h-[46px] w-full items-center justify-center rounded-xl bg-[#1F5FD1] px-4 text-[14.5px] font-extrabold text-white">
            Unggah foto yang kurang ({fotoKurang})
          </a>
        )}
        {h.laporan && (
          <a href={hrefLaporan} className="flex min-h-[46px] w-full items-center justify-center rounded-xl bg-[#E0A526] px-4 text-[14.5px] font-extrabold text-[#1E2A47]">
            {k.lewatKk ? "Isi laporan lewat daftar KK" : "Isi laporan"}
          </a>
        )}
        <button type="button" onClick={onTidak} className="min-h-[44px] w-full rounded-xl border border-[#CBD6E6] px-4 text-[13.5px] font-bold text-[#1E2A47]">
          Tanggal {h.tanggal.slice(8)} {BULAN[Number(h.tanggal.slice(5, 7)) - 1]} saya tidak bekerja
        </button>
      </div>
    </article>
  );
}
