import { redirect } from "next/navigation";

// (8 Okt 2026) Halaman "Menu Anda" lama dihapus (permintaan user: membingungkan dan tidak ada navigasi). Beranda tunggal ("/") kini menampilkan
// kegiatan sebagai ikon bulat berprogres (Layer 1). Alamat lama /sigap, termasuk tautan & aplikasi terpasang versi lama, diteruskan ke Beranda.
// PanelSaya.tsx tidak dipakai lagi (boleh dihapus).
export default function SigapLama() {
  redirect("/");
}
