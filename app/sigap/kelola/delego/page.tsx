import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

// (9 Okt 2026) /sigap/kelola/delego -- permintaan user: Delego masuk pola alamat /sigap/kelola/<modul>.
// Delego adalah aplikasi terpisah; halaman ini meneruskan ke tautan Delego yang diatur Admin Aplikasi
// (tabel portal_aplikasi, kode "delego", kolom href). Bila tautan belum diatur, tampilkan petunjuk.

export const dynamic = "force-dynamic";

async function tautanDelego(): Promise<string | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const { data } = await db.from("portal_aplikasi").select("href").eq("kode", "delego").maybeSingle();
  const href = (data?.href as string | null | undefined)?.trim();
  return href ? href : null;
}

export default async function KelolaDelego() {
  const href = await tautanDelego();
  if (href) redirect(href);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EEF2F8] px-4 text-[#13213A]">
      <div className="max-w-md rounded-2xl bg-white p-6 shadow-md">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#55657D]">Kelola · Delego</p>
        <h1 className="mt-1 text-[20px] font-extrabold">Tautan Delego belum diatur</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#55657D]">
          Admin Aplikasi dapat mengisi alamat Delego di menu Kelola Aplikasi. Setelah diisi, halaman ini langsung membuka Delego.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/sigap/kelola/aplikasi" className="rounded-xl bg-[#0F3D7A] px-4 py-2.5 text-[13.5px] font-extrabold text-white">
            Buka Kelola Aplikasi
          </Link>
          <Link href="/" className="rounded-xl bg-[#EEF1F5] px-4 py-2.5 text-[13.5px] font-bold text-[#55657D]">
            Ke Beranda
          </Link>
        </div>
      </div>
    </main>
  );
}
