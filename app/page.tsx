import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BrandBps from "@/app/components/BrandBps";
import LogoutButton from "@/app/dashboard/logout-button";
import { DESKRIPSI_PORTAL, NAMA_PORTAL } from "@/lib/halaman";

// Portal: pintu masuk semua aplikasi BPS Kabupaten Solok. Tiap aplikasi tetap
// memakai mekanisme akses masing-masing (login Supabase untuk DTSEN; link unik
// untuk Wali Jorong & petugas bencana; login personal untuk penyisiran).
type Kartu = {
  ikon: string;
  judul: string;
  uraian: string;
  href: string;
  label: string;
  tag: string;
  perluLogin?: boolean;
};

export default async function PortalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let nama: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("nama")
      .eq("id", user.id)
      .maybeSingle();
    nama = profile?.nama ?? user.email ?? null;
  }

  const kartu: Kartu[] = [
    {
      ikon: "🏘️",
      judul: "Usulan Update Data DTSEN",
      uraian:
        "Operator Wali Nagari menerbitkan surat keterangan, BPS memeriksa dan menetapkan status akhir.",
      href: user ? "/dashboard" : "/login?next=/dashboard",
      label: user ? "Buka dashboard" : "Masuk untuk membuka",
      tag: "Perlu login",
      perluLogin: true,
    },
    {
      ikon: "🌊",
      judul: "Pendataan Bencana",
      uraian: "Identifikasi wilayah terdampak, undangan petugas, lokasi tugas, dan monitoring alokasi.",
      href: "/bencana",
      label: "Buka halaman",
      tag: "Akses sesuai tautan",
    },
    {
      ikon: "📈",
      judul: "Seruti",
      uraian: "Progres lapangan Seruti per wilayah dan petugas, serta pemeriksaan kualitas data.",
      href: "/seruti",
      label: "Buka Seruti",
      tag: "Akses sesuai peran",
    },
    {
      // (5 Okt 2026) Portal SIGAP ditambahkan ke menu utama -- permintaan user.
      ikon: "💼",
      judul: "SIGAP — Anggaran & SPJ",
      uraian: "Transport lokal petugas (laporan harian, foto, arsip SPJ), admin anggaran, serta kelola peran & akses.",
      href: "/sigap",
      label: "Buka SIGAP",
      tag: "Login nama + PIN",
    },
    {
      ikon: "🧭",
      judul: "Penyisiran Usaha SE2026",
      uraian: "Checklist petugas lapangan, identifikasi PPL, dan monitoring penyisiran.",
      href: "/penyisiran",
      label: "Buka penyisiran",
      tag: "Login petugas",
    },
  ];

  return (
    <main className="min-h-screen bg-paper">
      <section className="bg-gradient-to-br from-navy-700 to-navy-900 px-6 pb-20 pt-8 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-start justify-between gap-4">
            <BrandBps
              kotakPutih
              ukuran={36}
              className="text-sm font-semibold"
              teksClassName="text-white"
            />
            {user && (
              <div className="text-right text-xs text-navy-100">
                <p className="font-medium text-white">{nama}</p>
                <LogoutButton className="mt-0.5 text-xs font-medium text-gold-100 hover:text-white" />
              </div>
            )}
          </div>
          <h1 className="mt-10 text-3xl font-bold leading-tight sm:text-4xl">{NAMA_PORTAL}</h1>
          <p className="mt-3 max-w-xl text-sm text-navy-100 sm:text-base">{DESKRIPSI_PORTAL}</p>
          {!user && (
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-gold-400 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-600"
            >
              Masuk dengan Nomor HP &amp; PIN →
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto -mt-12 grid max-w-4xl gap-4 px-6 sm:grid-cols-2">
        {kartu.map((k) => (
          <Link
            key={k.judul}
            href={k.href}
            className="group rounded-xl border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-navy-50 text-xl">{k.ikon}</span>
            <h2 className="mt-3 text-base font-semibold text-navy-700">{k.judul}</h2>
            <p className="mt-1 text-sm text-ink/70">{k.uraian}</p>
            <div className="mt-4 flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  k.perluLogin ? "bg-gold-100 text-gold-600" : "bg-moss-100 text-moss-700"
                }`}
              >
                {k.tag}
              </span>
              <span className="text-sm font-semibold text-navy-400 group-hover:text-navy-700">{k.label} →</span>
            </div>
          </Link>
        ))}
      </section>

      <p className="mx-auto max-w-4xl px-6 pb-12 pt-6 text-xs text-ink/60">
        Wali Jorong dan petugas bencana membuka aplikasi lewat tautan unik dari BPS Kabupaten Solok, tanpa perlu login di
        sini. Petugas bencana yang belum mendaftar dapat membuka{" "}
        <Link href="/undangan" className="font-medium text-navy-400 hover:text-navy-700">
          halaman pendaftaran petugas
        </Link>
        .
      </p>
    </main>
  );
}
