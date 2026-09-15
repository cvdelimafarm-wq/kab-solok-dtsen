"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Halaman admin "Kelola Anomali" — TERPISAH dari /seruti (yang mobile-first
// utk PPL di lapangan). Halaman ini sengaja LEBAR (desktop-first) karena
// dipakai admin/BPS Kabupaten utk mengelola seluruh aturan anomali: import
// Excel, lihat semua aturan dlm 1 tabel lebar, dan edit langsung tiap baris
// tanpa perlu upload Excel ulang.
// ============================================================================

interface Pengaturan {
  kode: string;
  kelompok: string | null;
  ambang_batas: number | null;
  aktif: boolean;
  catatan: string | null;
  rekomendasi: string | null;
}
interface QMax {
  no_urut_komoditas: number;
  nama_komoditas: string | null;
  satuan: string | null;
  q_maksimum: number | null;
  catatan: string | null;
}
interface Kalori {
  no_urut_komoditas: number;
  nama_komoditas: string | null;
  satuan: string | null;
  kalori_per_satuan: number | null;
  catatan: string | null;
}

const EDIT_PIN = "3333";

export default function KelolaAnomaliPage() {
  const [supabase] = useState(() => createClient());

  const [pengaturan, setPengaturan] = useState<Pengaturan[]>([]);
  const [qmax, setQmax] = useState<QMax[]>([]);
  const [kalori, setKalori] = useState<Kalori[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const [aturanUploading, setAturanUploading] = useState(false);
  const [aturanMsg, setAturanMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // PIN edit — melihat aturan tetap bebas, tapi MENYIMPAN perubahan (termasuk
  // import Excel) butuh PIN dulu. Ini pengaman ringan sisi client (sesuai
  // halaman lain di app ini yang memang tanpa login sungguhan) — bukan
  // keamanan penuh, cuma pencegah perubahan tidak sengaja/asal-asalan.
  // Tersimpan per sesi browser (sessionStorage) supaya tidak perlu diulang
  // tiap ganti tab di halaman yang sama.
  const [pinInput, setPinInput] = useState("");
  const [pinOk, setPinOk] = useState(false);
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("kelola-anomali-pin-ok") === "1") {
      setPinOk(true);
    }
  }, []);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput === EDIT_PIN) {
      setPinOk(true);
      setPinError(false);
      sessionStorage.setItem("kelola-anomali-pin-ok", "1");
    } else {
      setPinError(true);
    }
  }

  const locked = !pinOk;

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, q, k] = await Promise.all([
      supabase.from("kp_anomali_pengaturan").select("*").order("kode"),
      supabase.from("kp_anomali_q_maksimum").select("*").order("no_urut_komoditas"),
      supabase.from("kp_anomali_kalori").select("*").order("no_urut_komoditas"),
    ]);
    if (p.error) setDebugError(`Gagal memuat aturan: ${p.error.message}`);
    else setDebugError(null);
    setPengaturan((p.data ?? []) as Pengaturan[]);
    setQmax((q.data ?? []) as QMax[]);
    setKalori((k.data ?? []) as Kalori[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleUploadAturan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked) return;
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("aturanFile") as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) return;
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    setAturanUploading(true);
    setAturanMsg(null);
    try {
      const res = await fetch("/api/anomali-kp/upload-aturan", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal upload aturan");
      const bagian: string[] = [];
      if (data.pengaturan) bagian.push(`${data.pengaturan} aturan/ambang batas`);
      if (data.qMaksimum) bagian.push(`${data.qMaksimum} batas maks. komoditas`);
      if (data.kalori) bagian.push(`${data.kalori} referensi kalori`);
      setAturanMsg({
        type: data.errors?.length ? "err" : "ok",
        text: `Sinkron: ${bagian.join(", ") || "tidak ada baris valid"}.${data.errors?.length ? " ⚠ " + data.errors.join(" | ") : ""}`,
      });
      form.reset();
      await loadAll();
    } catch (err: any) {
      setAturanMsg({ type: "err", text: err.message });
    } finally {
      setAturanUploading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1400px] px-6 py-6">
      <Link href="/seruti" className="text-xs text-navy-600 hover:underline">
        &larr; Kembali ke Seruti
      </Link>
      <p className="mt-1 font-sans text-[13px] font-black italic tracking-tight text-navy-900">
        BADAN PUSAT STATISTIK KABUPATEN SOLOK
      </p>
      <h1 className="mt-1 text-xl font-bold text-navy-900 sm:text-2xl">Kelola Aturan Anomali</h1>
      <p className="mt-1 text-sm text-ink/60">
        Import aturan lewat Excel, atau edit langsung tiap baris di bawah — perubahan langsung berlaku
        di pengecekan berikutnya, tanpa perlu upload ulang.
      </p>

      {/* ---------- Gerbang PIN utk edit ---------- */}
      <div className="mt-4 rounded-lg border border-line bg-white p-4">
        {pinOk ? (
          <p className="text-xs text-moss-700">
            &#128275; Mode edit aktif untuk sesi ini.{" "}
            <button
              onClick={() => {
                setPinOk(false);
                sessionStorage.removeItem("kelola-anomali-pin-ok");
              }}
              className="underline"
            >
              Kunci lagi
            </button>
          </p>
        ) : (
          <form onSubmit={handleUnlock} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-navy-900">Masukkan PIN untuk mengedit:</span>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              className="w-24 rounded-md border border-line px-2 py-1 text-sm"
              placeholder="PIN"
            />
            <button type="submit" className="rounded-md bg-navy-700 px-3 py-1 text-sm font-medium text-white hover:bg-navy-900">
              Buka
            </button>
            {pinError && <span className="text-xs text-rust-700">PIN salah.</span>}
            <span className="ml-1 text-xs text-ink/40">(Melihat aturan tetap bebas tanpa PIN — cuma menyimpan perubahan yang butuh PIN.)</span>
          </form>
        )}
      </div>

      {/* ---------- Import Excel ---------- */}
      <div className="mt-4 rounded-lg border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-navy-900">Import dari Excel</h2>
        <p className="mt-1 text-xs text-ink/60">
          Upload file <code className="rounded bg-navy-50 px-1 py-0.5">Draft_Aturan_Anomali_KP.xlsx</code> (atau
          versi yang sudah diedit) untuk sinkron massal. Baris yang tidak berubah tidak akan terpengaruh.
        </p>
        <form onSubmit={handleUploadAturan} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="file" name="aturanFile" accept=".xlsx" required disabled={locked} className="text-sm disabled:opacity-40" />
          <button
            type="submit"
            disabled={aturanUploading || locked}
            className="rounded-md bg-navy-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-navy-900 disabled:opacity-40"
            title={locked ? "Masukkan PIN dulu utk mengupload" : ""}
          >
            {aturanUploading ? "Memproses..." : "Upload & Sinkron"}
          </button>
        </form>
        {aturanMsg && (
          <p className={`mt-2 text-sm ${aturanMsg.type === "ok" ? "text-moss-700" : "text-rust-700"}`}>
            {aturanMsg.text}
          </p>
        )}
      </div>

      {debugError && (
        <p className="mt-3 rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">
          ⚠ {debugError}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-ink/40">Memuat...</p>
      ) : (
        <>
          {/* ---------- Tabel utama: Aturan per Kode ---------- */}
          <section className="mt-6">
            <h2 className="text-sm font-bold text-navy-900">
              Aturan per Kode Anomali <span className="font-normal text-ink/40">({pengaturan.length})</span>
            </h2>
            <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
                  <tr>
                    <th className="w-24 px-3 py-2 font-medium">Kode</th>
                    <th className="w-56 px-3 py-2 font-medium">Kelompok</th>
                    <th className="w-32 px-3 py-2 font-medium">Ambang Batas</th>
                    <th className="w-20 px-3 py-2 font-medium">Aktif</th>
                    <th className="px-3 py-2 font-medium">Rekomendasi PPL (Catatan BPS Kabupaten)</th>
                    <th className="px-3 py-2 font-medium">Catatan Admin</th>
                    <th className="w-20 px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {pengaturan.map((row) => (
                    <PengaturanRow key={row.kode} row={row} supabase={supabase} locked={locked} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- Tabel Batas Maksimum Konsumsi ---------- */}
          <section className="mt-6">
            <h2 className="text-sm font-bold text-navy-900">
              Batas Maksimum Konsumsi per Komoditas{" "}
              <span className="font-normal text-ink/40">({qmax.length})</span>
            </h2>
            <p className="mt-0.5 text-xs text-ink/50">
              Dipakai utk pengecekan konsumsi melebihi batas maksimum per komoditas (belum aktif —
              menunggu tabel ini terisi lengkap).
            </p>
            <QMaxTable rows={qmax} supabase={supabase} onReload={loadAll} locked={locked} />
          </section>

          {/* ---------- Tabel Referensi Kalori ---------- */}
          <section className="mt-6 mb-10">
            <h2 className="text-sm font-bold text-navy-900">
              Referensi Kalori (DKBM) <span className="font-normal text-ink/40">({kalori.length})</span>
            </h2>
            <p className="mt-0.5 text-xs text-ink/50">
              Dipakai utk KP-05/KP-06 (over/under kalori) — belum aktif, menunggu tabel ini terisi.
            </p>
            <KaloriTable rows={kalori} supabase={supabase} onReload={loadAll} locked={locked} />
          </section>
        </>
      )}
    </main>
  );
}

// ============================================================================
// Baris tabel Aturan — dgn state lokal (dirty-tracking) & tombol Simpan.
// ============================================================================
function PengaturanRow({
  row,
  supabase,
  locked,
}: {
  row: Pengaturan;
  supabase: ReturnType<typeof createClient>;
  locked: boolean;
}) {
  const [kelompok, setKelompok] = useState(row.kelompok ?? "");
  const [ambang, setAmbang] = useState(row.ambang_batas?.toString() ?? "");
  const [aktif, setAktif] = useState(row.aktif);
  const [rekomendasi, setRekomendasi] = useState(row.rekomendasi ?? "");
  const [catatan, setCatatan] = useState(row.catatan ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");

  const dirty =
    kelompok !== (row.kelompok ?? "") ||
    ambang !== (row.ambang_batas?.toString() ?? "") ||
    aktif !== row.aktif ||
    rekomendasi !== (row.rekomendasi ?? "") ||
    catatan !== (row.catatan ?? "");

  async function handleSave() {
    if (locked) return;
    setSaving(true);
    const { error } = await supabase
      .from("kp_anomali_pengaturan")
      .update({
        kelompok: kelompok || null,
        ambang_batas: ambang.trim() === "" ? null : Number(ambang),
        aktif,
        rekomendasi: rekomendasi || null,
        catatan: catatan || null,
      })
      .eq("kode", row.kode);
    setSaving(false);
    setSaved(error ? "err" : "ok");
    if (!error) {
      row.kelompok = kelompok || null;
      row.ambang_batas = ambang.trim() === "" ? null : Number(ambang);
      row.aktif = aktif;
      row.rekomendasi = rekomendasi || null;
      row.catatan = catatan || null;
    }
    setTimeout(() => setSaved("idle"), 2000);
  }

  return (
    <tr className={`border-t border-line align-top ${!aktif ? "bg-line/20" : ""}`}>
      <td className="px-3 py-2 font-mono text-xs font-semibold text-navy-900">{row.kode}</td>
      <td className="px-3 py-2">
        <input
          value={kelompok}
          onChange={(e) => setKelompok(e.target.value)}
          disabled={locked}
          className="w-full rounded border border-line px-1.5 py-1 text-xs outline-none focus:border-navy-400 disabled:bg-line/30"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={ambang}
          onChange={(e) => setAmbang(e.target.value)}
          placeholder="-"
          disabled={locked}
          className="w-full rounded border border-line px-1.5 py-1 text-xs outline-none focus:border-navy-400 disabled:bg-line/30"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={aktif}
          onChange={(e) => setAktif(e.target.checked)}
          disabled={locked}
          className="h-4 w-4"
        />
      </td>
      <td className="px-3 py-2">
        <textarea
          value={rekomendasi}
          onChange={(e) => setRekomendasi(e.target.value)}
          rows={2}
          disabled={locked}
          className="w-full min-w-[260px] rounded border border-line px-1.5 py-1 text-xs outline-none focus:border-navy-400 disabled:bg-line/30"
        />
      </td>
      <td className="px-3 py-2">
        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={2}
          disabled={locked}
          className="w-full min-w-[220px] rounded border border-line px-1.5 py-1 text-xs text-ink/60 outline-none focus:border-navy-400 disabled:bg-line/30"
        />
      </td>
      <td className="px-3 py-2">
        <button
          onClick={handleSave}
          disabled={!dirty || saving || locked}
          title={locked ? "Masukkan PIN dulu utk menyimpan" : ""}
          className={`w-full rounded px-2 py-1 text-xs font-semibold text-white transition disabled:opacity-30 ${
            saved === "ok" ? "bg-moss-500" : saved === "err" ? "bg-rust-500" : "bg-navy-700 hover:bg-navy-900"
          }`}
        >
          {saving ? "..." : saved === "ok" ? "\u2713 OK" : saved === "err" ? "Gagal" : "Simpan"}
        </button>
      </td>
    </tr>
  );
}

// ============================================================================
// Tabel Q_Maksimum: edit, tambah baris baru, hapus.
// ============================================================================
function QMaxTable({
  rows,
  supabase,
  onReload,
  locked,
}: {
  rows: QMax[];
  supabase: ReturnType<typeof createClient>;
  onReload: () => void;
  locked: boolean;
}) {
  const [noBaru, setNoBaru] = useState("");
  const [namaBaru, setNamaBaru] = useState("");
  const [satuanBaru, setSatuanBaru] = useState("");
  const [qBaru, setQBaru] = useState("");
  const [busy, setBusy] = useState(false);

  async function tambah() {
    if (locked || !noBaru.trim() || !qBaru.trim()) return;
    setBusy(true);
    await supabase.from("kp_anomali_q_maksimum").insert({
      no_urut_komoditas: Number(noBaru),
      nama_komoditas: namaBaru || null,
      satuan: satuanBaru || null,
      q_maksimum: Number(qBaru),
    });
    setNoBaru("");
    setNamaBaru("");
    setSatuanBaru("");
    setQBaru("");
    setBusy(false);
    onReload();
  }

  async function hapus(no: number) {
    if (locked) return;
    await supabase.from("kp_anomali_q_maksimum").delete().eq("no_urut_komoditas", no);
    onReload();
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
          <tr>
            <th className="w-24 px-3 py-2 font-medium">No.Urut</th>
            <th className="px-3 py-2 font-medium">Nama Komoditas</th>
            <th className="w-28 px-3 py-2 font-medium">Satuan</th>
            <th className="w-32 px-3 py-2 font-medium">Q Maksimum</th>
            <th className="w-16 px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <QMaxRow key={r.no_urut_komoditas} row={r} supabase={supabase} onDelete={() => hapus(r.no_urut_komoditas)} locked={locked} />
          ))}
          <tr className="border-t border-line bg-navy-50/30">
            <td className="px-3 py-1.5">
              <input value={noBaru} onChange={(e) => setNoBaru(e.target.value)} placeholder="No." disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <input value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} placeholder="Nama komoditas" disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <input value={satuanBaru} onChange={(e) => setSatuanBaru(e.target.value)} placeholder="Kg" disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <input value={qBaru} onChange={(e) => setQBaru(e.target.value)} placeholder="200" disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <button onClick={tambah} disabled={busy || locked} title={locked ? "Masukkan PIN dulu" : ""} className="w-full rounded bg-moss-500 px-2 py-1 text-xs font-semibold text-white hover:bg-moss-700 disabled:opacity-40">
                + Tambah
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function QMaxRow({
  row,
  supabase,
  onDelete,
  locked,
}: {
  row: QMax;
  supabase: ReturnType<typeof createClient>;
  onDelete: () => void;
  locked: boolean;
}) {
  const [nama, setNama] = useState(row.nama_komoditas ?? "");
  const [satuan, setSatuan] = useState(row.satuan ?? "");
  const [q, setQ] = useState(row.q_maksimum?.toString() ?? "");
  const dirty = nama !== (row.nama_komoditas ?? "") || satuan !== (row.satuan ?? "") || q !== (row.q_maksimum?.toString() ?? "");

  async function save() {
    if (locked) return;
    await supabase
      .from("kp_anomali_q_maksimum")
      .update({ nama_komoditas: nama || null, satuan: satuan || null, q_maksimum: q.trim() === "" ? null : Number(q) })
      .eq("no_urut_komoditas", row.no_urut_komoditas);
    row.nama_komoditas = nama || null;
    row.satuan = satuan || null;
    row.q_maksimum = q.trim() === "" ? null : Number(q);
  }

  return (
    <tr className="border-t border-line">
      <td className="px-3 py-1.5 font-mono text-xs">{row.no_urut_komoditas}</td>
      <td className="px-3 py-1.5">
        <input value={nama} onChange={(e) => setNama(e.target.value)} disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
      </td>
      <td className="px-3 py-1.5">
        <input value={satuan} onChange={(e) => setSatuan(e.target.value)} disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
      </td>
      <td className="px-3 py-1.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
      </td>
      <td className="flex gap-1 px-3 py-1.5">
        <button onClick={save} disabled={!dirty || locked} title={locked ? "Masukkan PIN dulu" : ""} className="rounded bg-navy-700 px-2 py-1 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-30">
          Simpan
        </button>
        <button onClick={onDelete} disabled={locked} className="rounded bg-rust-500 px-2 py-1 text-xs font-semibold text-white hover:bg-rust-700 disabled:opacity-30">
          &times;
        </button>
      </td>
    </tr>
  );
}

// ============================================================================
// Tabel Kalori — pola identik dgn QMaxTable.
// ============================================================================
function KaloriTable({
  rows,
  supabase,
  onReload,
  locked,
}: {
  rows: Kalori[];
  supabase: ReturnType<typeof createClient>;
  onReload: () => void;
  locked: boolean;
}) {
  const [noBaru, setNoBaru] = useState("");
  const [namaBaru, setNamaBaru] = useState("");
  const [satuanBaru, setSatuanBaru] = useState("");
  const [kalBaru, setKalBaru] = useState("");
  const [busy, setBusy] = useState(false);

  async function tambah() {
    if (locked || !noBaru.trim() || !kalBaru.trim()) return;
    setBusy(true);
    await supabase.from("kp_anomali_kalori").insert({
      no_urut_komoditas: Number(noBaru),
      nama_komoditas: namaBaru || null,
      satuan: satuanBaru || null,
      kalori_per_satuan: Number(kalBaru),
    });
    setNoBaru("");
    setNamaBaru("");
    setSatuanBaru("");
    setKalBaru("");
    setBusy(false);
    onReload();
  }

  async function hapus(no: number) {
    if (locked) return;
    await supabase.from("kp_anomali_kalori").delete().eq("no_urut_komoditas", no);
    onReload();
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
          <tr>
            <th className="w-24 px-3 py-2 font-medium">No.Urut</th>
            <th className="px-3 py-2 font-medium">Nama Komoditas</th>
            <th className="w-28 px-3 py-2 font-medium">Satuan</th>
            <th className="w-36 px-3 py-2 font-medium">Kalori/Satuan</th>
            <th className="w-16 px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <KaloriRow key={r.no_urut_komoditas} row={r} supabase={supabase} onDelete={() => hapus(r.no_urut_komoditas)} locked={locked} />
          ))}
          <tr className="border-t border-line bg-navy-50/30">
            <td className="px-3 py-1.5">
              <input value={noBaru} onChange={(e) => setNoBaru(e.target.value)} placeholder="No." disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <input value={namaBaru} onChange={(e) => setNamaBaru(e.target.value)} placeholder="Nama komoditas" disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <input value={satuanBaru} onChange={(e) => setSatuanBaru(e.target.value)} placeholder="Kg" disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <input value={kalBaru} onChange={(e) => setKalBaru(e.target.value)} placeholder="350" disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
            </td>
            <td className="px-3 py-1.5">
              <button onClick={tambah} disabled={busy || locked} title={locked ? "Masukkan PIN dulu" : ""} className="w-full rounded bg-moss-500 px-2 py-1 text-xs font-semibold text-white hover:bg-moss-700 disabled:opacity-40">
                + Tambah
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function KaloriRow({
  row,
  supabase,
  onDelete,
  locked,
}: {
  row: Kalori;
  supabase: ReturnType<typeof createClient>;
  onDelete: () => void;
  locked: boolean;
}) {
  const [nama, setNama] = useState(row.nama_komoditas ?? "");
  const [satuan, setSatuan] = useState(row.satuan ?? "");
  const [kal, setKal] = useState(row.kalori_per_satuan?.toString() ?? "");
  const dirty =
    nama !== (row.nama_komoditas ?? "") || satuan !== (row.satuan ?? "") || kal !== (row.kalori_per_satuan?.toString() ?? "");

  async function save() {
    if (locked) return;
    await supabase
      .from("kp_anomali_kalori")
      .update({ nama_komoditas: nama || null, satuan: satuan || null, kalori_per_satuan: kal.trim() === "" ? null : Number(kal) })
      .eq("no_urut_komoditas", row.no_urut_komoditas);
    row.nama_komoditas = nama || null;
    row.satuan = satuan || null;
    row.kalori_per_satuan = kal.trim() === "" ? null : Number(kal);
  }

  return (
    <tr className="border-t border-line">
      <td className="px-3 py-1.5 font-mono text-xs">{row.no_urut_komoditas}</td>
      <td className="px-3 py-1.5">
        <input value={nama} onChange={(e) => setNama(e.target.value)} disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
      </td>
      <td className="px-3 py-1.5">
        <input value={satuan} onChange={(e) => setSatuan(e.target.value)} disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
      </td>
      <td className="px-3 py-1.5">
        <input value={kal} onChange={(e) => setKal(e.target.value)} disabled={locked} className="w-full rounded border border-line px-1.5 py-1 text-xs disabled:bg-line/30" />
      </td>
      <td className="flex gap-1 px-3 py-1.5">
        <button onClick={save} disabled={!dirty || locked} title={locked ? "Masukkan PIN dulu" : ""} className="rounded bg-navy-700 px-2 py-1 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-30">
          Simpan
        </button>
        <button onClick={onDelete} disabled={locked} className="rounded bg-rust-500 px-2 py-1 text-xs font-semibold text-white hover:bg-rust-700 disabled:opacity-30">
          &times;
        </button>
      </td>
    </tr>
  );
}
