"use client";

import { use, useEffect, useState } from "react";
import { VARIABEL_LABEL } from "@/lib/types";

const FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL!;

interface JorongInfo {
  nama_jorong: string;
  nama_nagari: string;
  kecamatan: string;
}

export default function WaliJorongFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [info, setInfo] = useState<JorongInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nik, setNik] = useState("");
  const [noKk, setNoKk] = useState("");
  const [namaWarga, setNamaWarga] = useState("");
  const [alamat, setAlamat] = useState("");
  const [catatan, setCatatan] = useState("");
  const [variabel, setVariabel] = useState<Record<string, boolean>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadInfo() {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/jorong-info`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "Tautan tidak valid.");
        } else {
          setInfo(data);
        }
      } catch {
        setLoadError("Gagal memuat data. Periksa koneksi internet Anda.");
      } finally {
        setLoading(false);
      }
    }
    loadInfo();
  }, [token]);

  function toggleVariabel(key: string) {
    setVariabel((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const variabelPayload: Record<string, boolean> = {};
    VARIABEL_LABEL.forEach((v, i) => {
      variabelPayload[`v${String(i + 1).padStart(2, "0")}`] =
        variabel[v.key] ?? false;
    });

    try {
      const res = await fetch(`${FUNCTIONS_URL}/submit-usulan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          nik,
          no_kk: noKk,
          nama_warga: namaWarga,
          alamat,
          catatan_wali_jorong: catatan,
          variabel: variabelPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Gagal mengirim usulan.");
      } else {
        setSuccess(true);
      }
    } catch {
      setSubmitError("Gagal mengirim. Periksa koneksi internet Anda.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-ink/60">Memuat...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16 text-center">
        <p className="rounded-md bg-rust-100 px-4 py-3 text-rust-700">
          {loadError}
        </p>
        <p className="mt-4 text-sm text-ink/60">
          Hubungi Operator Wali Nagari untuk mendapatkan tautan yang benar.
        </p>
      </main>
    );
  }

  if (success) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16 text-center">
        <div className="rounded-md bg-moss-100 px-4 py-6">
          <p className="font-medium text-moss-700">Usulan berhasil dikirim</p>
          <p className="mt-2 text-sm text-moss-700/80">
            Data warga sudah diteruskan ke Operator Wali Nagari {info?.nama_nagari}{" "}
            untuk diproses.
          </p>
        </div>
        <button
          onClick={() => {
            setSuccess(false);
            setNik("");
            setNoKk("");
            setNamaWarga("");
            setAlamat("");
            setCatatan("");
            setVariabel({});
          }}
          className="mt-6 rounded-md bg-navy-700 px-4 py-2.5 font-medium text-white hover:bg-navy-600"
        >
          Usulkan warga lain
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-10">
      <p className="text-sm font-medium text-navy-400">
        {info?.kecamatan} &middot; {info?.nama_nagari}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-navy-900">
        {info?.nama_jorong}
      </h1>
      <p className="mt-2 text-sm text-ink/70">
        Isi lembar identifikasi berikut untuk mengusulkan update data DTSEN
        satu warga.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-ink">
              NIK <span className="text-rust-500">*</span>
            </label>
            <input
              required
              inputMode="numeric"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">
              Nomor Kartu Keluarga
            </label>
            <input
              inputMode="numeric"
              value={noKk}
              onChange={(e) => setNoKk(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">
              Nama warga <span className="text-rust-500">*</span>
            </label>
            <input
              required
              value={namaWarga}
              onChange={(e) => setNamaWarga(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink">Alamat</label>
            <textarea
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            />
          </div>
        </section>

        <section>
          <h2 className="font-medium text-navy-900">
            Variabel penciri kemiskinan
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Centang kondisi yang sesuai dengan keadaan warga saat ini.
          </p>
          <ol className="mt-4 flex flex-col gap-2">
            {VARIABEL_LABEL.map((v, i) => (
              <li key={v.key}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-white px-3 py-3 transition hover:border-navy-400">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-medium text-navy-600">
                    {i + 1}
                  </span>
                  <input
                    type="checkbox"
                    checked={variabel[v.key] ?? false}
                    onChange={() => toggleVariabel(v.key)}
                    className="mt-1 h-4 w-4 shrink-0 accent-navy-700"
                  />
                  <span className="text-sm text-ink">{v.label}</span>
                </label>
              </li>
            ))}
          </ol>
        </section>

        <div>
          <label className="text-sm font-medium text-ink">
            Catatan tambahan
          </label>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            placeholder="Opsional - kondisi lain yang perlu diketahui Operator Nagari"
          />
        </div>

        {submitError && (
          <p className="rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-navy-700 px-4 py-3 font-medium text-white transition hover:bg-navy-600 disabled:opacity-60"
        >
          {submitting ? "Mengirim..." : "Kirim usulan"}
        </button>
      </form>
    </main>
  );
}
