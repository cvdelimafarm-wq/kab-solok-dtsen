"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone, emailFromPhone } from "@/lib/phone";
import BrandBps from "@/app/components/BrandBps";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [nomorHp, setNomorHp] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const phoneDigits = normalizePhone(nomorHp);
    const { error } = await supabase.auth.signInWithPassword({
      email: emailFromPhone(phoneDigits),
      password: pin,
    });

    setLoading(false);

    if (error) {
      setError("Nomor HP atau PIN salah. Coba lagi.");
      return;
    }

    // Arahkan sesuai peran: Operator Wali Nagari -> dashboard DTSEN; staf BPS/admin -> portal.
    // Kalau tadinya membuka halaman yang butuh login (?next=/...), kembali ke halaman itu.
    const next = new URLSearchParams(window.location.search).get("next");
    const nextAman = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    let tujuan = nextAman;
    if (!tujuan) {
      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = auth.user
        ? await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle()
        : { data: null };
      tujuan = profile?.role === "operator_nagari" ? "/dashboard" : "/";
    }

    router.push(tujuan);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-navy-700 to-navy-900 p-10 text-white lg:flex">
        <div>
          <BrandBps kotakPutih ukuran={40} className="text-sm font-semibold" teksClassName="text-white" />
          <h2 className="mt-10 text-3xl font-bold leading-tight">
            Portal Layanan
            <br />
            BPS Kabupaten Solok
          </h2>
          <p className="mt-3 max-w-sm text-sm text-navy-100">
            Masuk sekali, langsung diarahkan ke aplikasi sesuai peran Anda.
          </p>
          <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-navy-100">
            <li>Operator Wali Nagari: Dashboard Usulan DTSEN</li>
            <li>Staf &amp; admin BPS: Portal dan seluruh monitoring</li>
          </ul>
        </div>
        <p className="text-xs text-navy-100/70">&copy; BPS Kabupaten Solok</p>
      </aside>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <BrandBps className="text-sm font-medium text-navy-400" ukuran={36} />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-navy-900 lg:mt-0">Masuk</h1>
          <p className="mt-1 text-sm text-ink/60">Gunakan nomor HP dan PIN 6 digit Anda.</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div>
              <label htmlFor="nomor_hp" className="text-sm font-medium text-ink">
                Nomor HP
              </label>
              <input
                id="nomor_hp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="08xxxxxxxxxx"
                required
                value={nomorHp}
                onChange={(e) => setNomorHp(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
              />
            </div>
            <div>
              <label htmlFor="pin" className="text-sm font-medium text-ink">
                PIN (6 digit)
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 tracking-widest text-ink outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
              />
            </div>

            {error && <p className="rounded-lg bg-rust-100 px-3 py-2 text-sm text-rust-700">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-lg bg-navy-700 px-4 py-3 font-semibold text-white transition hover:bg-navy-600 disabled:opacity-60"
            >
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>

          <p className="mt-6 text-xs leading-relaxed text-ink/60">
            Belum punya PIN?{" "}
            <Link href="/atur-pin" className="font-semibold text-navy-400 hover:text-navy-700">
              Atur nomor HP &amp; PIN
            </Link>{" "}
            dengan kode aktivasi dari BPS Kabupaten Solok. Lupa PIN? Hubungi admin BPS.
          </p>
          <p className="mt-4 text-xs">
            <Link href="/" className="font-medium text-navy-400 hover:text-navy-700">
              ← Kembali ke portal
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
