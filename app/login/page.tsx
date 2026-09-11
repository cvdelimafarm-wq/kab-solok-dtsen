"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { normalizePhone, emailFromPhone } from "@/lib/phone";

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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-navy-400">
        BPS Kabupaten Solok
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-navy-900">
        Masuk ke dashboard
      </h1>
      <p className="mt-1 text-sm text-ink/60">
        Untuk Operator Wali Nagari dan petugas BPS.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label htmlFor="nomor_hp" className="text-sm font-medium text-ink">
            Nomor HP
          </label>
          <input
            id="nomor_hp"
            type="tel"
            inputMode="numeric"
            placeholder="08xxxxxxxxxx"
            required
            value={nomorHp}
            onChange={(e) => setNomorHp(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
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
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-ink tracking-widest outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>

        {error && (
          <p className="rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-md bg-navy-700 px-4 py-2.5 font-medium text-white transition hover:bg-navy-600 disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>

      <p className="mt-6 text-xs text-ink/50">
        Belum pernah atur PIN?{" "}
        <Link href="/atur-pin" className="font-medium text-navy-400 hover:text-navy-700">
          Atur nomor HP &amp; PIN di sini
        </Link>{" "}
        menggunakan kode aktivasi dari BPS Kabupaten Solok.
      </p>
    </main>
  );
}
