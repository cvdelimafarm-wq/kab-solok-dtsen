"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NOMOR_SAMPEL_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const KUESIONER_OPTIONS = ["VSEN26.M", "VSEN26.KP", "VSERUTI26.INTI"];

interface JorongOption {
  jorong_id: string;
  nama_jorong: string;
}

export default function AnomaliCepatTab() {
  const supabase = createClient();
  const [jorongOptions, setJorongOptions] = useState<JorongOption[]>([]);
  const [jorongId, setJorongId] = useState("");
  const [nomorSampel, setNomorSampel] = useState("");
  const [namaKuesioner, setNamaKuesioner] = useState("");
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    async function loadJorong() {
      const { data } = await supabase
        .from("seruti_ppl")
        .select("jorong_id, jorong:jorong_id(nama_jorong)")
        .order("jorong_id");
      const mapped: JorongOption[] = (data ?? []).map((row: any) => ({
        jorong_id: row.jorong_id,
        nama_jorong: row.jorong?.nama_jorong ?? "-",
      }));
      mapped.sort((a, b) => a.nama_jorong.localeCompare(b.nama_jorong));
      setJorongOptions(mapped);
    }
    loadJorong();
  }, [supabase]);

  return (
    <div>
      <p className="text-sm text-ink/70">
        Unggah hasil scan kuesioner untuk pemeriksaan anomali cepat sebelum
        dokumen fisik dikumpulkan.
      </p>

      <div className="mt-4 grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink/50">
            Jorong
          </label>
          <select
            value={jorongId}
            onChange={(e) => setJorongId(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          >
            <option value="">Pilih Jorong</option>
            {jorongOptions.map((j) => (
              <option key={j.jorong_id} value={j.jorong_id}>
                {j.nama_jorong}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink/50">
            No. Urut Sampel
          </label>
          <select
            value={nomorSampel}
            onChange={(e) => setNomorSampel(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          >
            <option value="">Pilih Nomor</option>
            {NOMOR_SAMPEL_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink/50">
            Nama Kuesioner
          </label>
          <select
            value={namaKuesioner}
            onChange={(e) => setNamaKuesioner(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          >
            <option value="">Pilih Kuesioner</option>
            {KUESIONER_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowWarning(true)}
        className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-white px-4 py-12 text-center transition hover:border-navy-400"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-navy-400"
        >
          <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-medium text-navy-700">
          Klik untuk unggah scan kuesioner
        </span>
        <span className="text-xs text-ink/40">JPG, PNG, atau PDF</span>
      </button>

      {showWarning && (
        <div className="mt-3 rounded-lg border border-gold-400 bg-gold-100 px-4 py-3 text-sm text-gold-600">
          <p className="font-semibold">
            Mohon maaf, fitur Anomali Cepat sedang tidak tersedia untuk
            sementara waktu.
          </p>
          <p className="mt-1">
            Silakan serahkan dokumen kuesioner untuk dientri dan diolah
            langsung di Kantor BPS Kabupaten Solok.
          </p>
        </div>
      )}
    </div>
  );
}
