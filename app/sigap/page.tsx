import BrandBps from "@/app/components/BrandBps";
import PanelSaya from "./PanelSaya";
import PasangAplikasi from "@/app/components/PasangAplikasi";

// (5 Okt 2026) Beranda portal SIGAP. (7 Okt 2026) Permintaan user: halaman awal hanya menampilkan kartu yang
// AKTIF untuk akun yang masuk (mis. mitra pendataan bencana: Transport Lokal, Pelatihan & Undangan) --
// katalog modul "segera hadir" dihapus; kartu dibangun oleh PanelSaya sesuai peran & izin akun.

export default function SigapBeranda() {
  return (
    <main className="min-h-screen bg-[#EEF2F8] pb-12 text-[#13213A]">
      <header className="bg-gradient-to-br from-[#0F3D7A] via-[#123B70] to-[#1E2A47] px-5 pb-14 pt-6 text-white">
        <div className="mx-auto max-w-5xl">
          <BrandBps className="text-blue-100" teksClassName="text-[12px] font-bold uppercase tracking-wider" ukuran={30} kotakPutih />
          <h1 className="mt-6 text-[40px] font-extrabold leading-none tracking-tight">SIGAP</h1>
          <p className="mt-2 max-w-xl text-[15px] text-blue-100">Sistem Informasi Gerak Anggaran &amp; Pertanggungjawaban — dari RAB, revisi, pelaksanaan, hingga SPJ.</p>
          {/* (8 Okt 2026) PWA: tombol pasang aplikasi -- permintaan user */}
          <PasangAplikasi />
        </div>
      </header>
      <div className="relative z-10 mx-auto -mt-8 max-w-5xl space-y-6 px-4">
        {/* (5 Okt 2026) Menu sesuai peran akun yg masuk */}
        <PanelSaya />
      </div>
    </main>
  );
}
