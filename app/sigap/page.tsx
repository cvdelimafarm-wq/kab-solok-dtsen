import Link from "next/link";
import BrandBps from "@/app/components/BrandBps";
import PanelSaya from "./PanelSaya";

// (5 Okt 2026) Beranda portal SIGAP -- kerangka modul hulu ke hilir (skema: claude/skema-portal-keuangan.md
// di project). Saat ini yg aktif baru Pelaksanaan > Transport Lokal (SPDT NTP & Pendataan Pascabencana).

type Modul = { ikon: string; judul: string; ket: string; href?: string; aktif?: boolean };
const KELOMPOK: { judul: string; modul: Modul[] }[] = [
  {
    judul: "Perencanaan",
    modul: [
      { ikon: "📘", judul: "RAB / POK", ket: "Impor Rincian Kertas Kerja Satker (SAKTI), pohon anggaran 8 tingkat." },
      { ikon: "🔁", judul: "Revisi Anggaran", ket: "Bandingkan versi RKKS, catat pengajuan & persetujuan revisi." },
    ],
  },
  {
    judul: "Pelaksanaan",
    modul: [
      { ikon: "🛵", judul: "Transport Lokal", ket: "Semua kegiatan: hari kerja, laporan harian, 5 foto, arsip & unduh SPJ, admin & verifikasi.", href: "/sigap/masuk", aktif: true },
      { ikon: "✈️", judul: "Perjalanan Dinas Luar Kota", ket: "SPD, uang harian, penginapan." },
      { ikon: "💵", judul: "Honor", ket: "Honor output mitra, pengajar, narasumber." },
      { ikon: "📦", judul: "Pengadaan", ket: "Terhubung dengan modul kontrak." },
    ],
  },
  {
    judul: "Monitoring & Integrasi",
    modul: [
      { ikon: "📊", judul: "Realisasi & Serapan", ket: "Pagu, realisasi, dan sisa per detail anggaran." },
      { ikon: "🔗", judul: "Delego", ket: "Kirim & tarik data penugasan dan realisasi." },
    ],
  },
];

export default function SigapBeranda() {
  return (
    <main className="min-h-screen bg-[#EEF2F8] pb-12 text-[#13213A]">
      <header className="bg-gradient-to-br from-[#0F3D7A] via-[#123B70] to-[#1E2A47] px-5 pb-14 pt-6 text-white">
        <div className="mx-auto max-w-5xl">
          <BrandBps className="text-blue-100" teksClassName="text-[12px] font-bold uppercase tracking-wider" ukuran={30} kotakPutih />
          <h1 className="mt-6 text-[40px] font-extrabold leading-none tracking-tight">SIGAP</h1>
          <p className="mt-2 max-w-xl text-[15px] text-blue-100">Sistem Informasi Gerak Anggaran &amp; Pertanggungjawaban — dari RAB, revisi, pelaksanaan, hingga SPJ.</p>
        </div>
      </header>
      <div className="relative z-10 mx-auto -mt-8 max-w-5xl space-y-6 px-4">
        {/* (5 Okt 2026) Menu sesuai peran akun yg masuk */}
        <PanelSaya />
        {KELOMPOK.map((k) => (
          <section key={k.judul}>
            <h2 className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#55657D]">{k.judul}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {k.modul.map((m) => {
                const isi = (
                  <div
                    className={`h-full rounded-2xl border bg-white p-4 shadow-sm transition ${
                      m.aktif ? "border-[#1E7A4C]/50 ring-1 ring-[#1E7A4C]/20 hover:-translate-y-0.5 hover:shadow-md" : "border-[#D5DDE8] opacity-80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl">{m.ikon}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.aktif ? "bg-[#DDF3E4] text-[#1E6B3A]" : "bg-[#EEF1F6] text-[#55657D]"}`}>
                        {m.aktif ? "AKTIF" : "SEGERA"}
                      </span>
                    </div>
                    <p className="mt-2 text-[15px] font-bold">{m.judul}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#55657D]">{m.ket}</p>
                  </div>
                );
                return m.href ? (
                  <Link key={m.judul} href={m.href} className="block">
                    {isi}
                  </Link>
                ) : (
                  <div key={m.judul}>{isi}</div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
