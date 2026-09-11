"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL!;

interface NagariOption {
  id: string;
  nama_nagari: string;
  kecamatan: string;
}

export default function AturPinPage() {
  const router = useRouter();
  const supabase = createClient();

  const [nagariList, setNagariList] = useState<NagariOption[]>([]);
  const [nagariId, setNagariId] = useState("");
  const [kodeAktivasi, setKodeAktivasi] = useState("");
  const [nomorHp, setNomorHp] = useState("");
  const [pin, setPin] = useState("");
  const [pinUlang, setPinUlang] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadNagari() {
      const { data } = await supabase
        .from("nagari")
        .select("id, nama_nagari, kecamatan")
        .order("nama_nagari");
      setNagariList(data ?? []);
      setLoadingList(false);
    }
    loadNagari();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nagariId) {
      setError("Pilih Nagari terlebih dahulu.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("PIN harus 6 digit angka.");
      return;
    }
    if (pin !== pinUlang) {
      setError("PIN dan konfirmasi PIN tidak sama.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/setup-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nagari_id: nagariId,
          kode_aktivasi: kodeAktivasi,
          nomor_hp: nomorHp,
          pin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan PIN.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet Anda.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16 text-center">
        <div className="rounded-md bg-moss-100 px-4 py-6">
          <p className="font-medium text-moss-700">PIN berhasil diatur</p>
          <p className="mt-2 text-sm text-moss-700/80">
            Sekarang Anda bisa masuk dengan nomor HP dan PIN yang baru saja
            dibuat.
          </p>
        </div>
        <button
          onClick={() => router.push("/login")}
          className="mt-6 rounded-md bg-navy-700 px-4 py-2.5 font-medium text-white hover:bg-navy-600"
        >
          Ke halaman masuk
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-navy-400">
        BPS Kabupaten Solok
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-navy-900">
        Atur akun Operator Nagari
      </h1>
      <p className="mt-1 text-sm text-ink/60">
        Kode aktivasi didapat dari Surat Edaran resmi BPS Kabupaten Solok.
        Setelah PIN dibuat, gunakan nomor HP dan PIN ini untuk masuk
        selanjutnya.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium text-ink">Nagari</label>
          <select
            required
            value={nagariId}
            onChange={(e) => setNagariId(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          >
            <option value="">
              {loadingList ? "Memuat daftar Nagari..." : "Pilih Nagari"}
            </option>
            {nagariList.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nama_nagari} ({n.kecamatan})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-ink">
            Kode Aktivasi
          </label>
          <input
            required
            value={kodeAktivasi}
            onChange={(e) => setKodeAktivasi(e.target.value.toUpperCase())}
            placeholder="Dari Surat Edaran BPS"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 uppercase outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-ink">Nomor HP</label>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="08xxxxxxxxxx"
            required
            value={nomorHp}
            onChange={(e) => setNomorHp(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink">
            Buat PIN (6 digit)
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 tracking-widest outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink">Ulangi PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            required
            value={pinUlang}
            onChange={(e) => setPinUlang(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 tracking-widest outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
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
          {loading ? "Menyimpan..." : "Simpan & selesai"}
        </button>
      </form>
    </main>
  );
}
