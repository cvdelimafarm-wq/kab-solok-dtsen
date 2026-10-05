"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ------------------------------------------------------------------------
// (5 Okt 2026) Langkah 5 "Papan Tim" (keroyokan) -- permintaan user, mockup disetujui:
//  - Kartu per PML: PPL + alamat, daftar Sub SLS tim, skor TOTAL tim & rata-rata per PPL
//    (skor beban akhir), beban per PPL = Sub SLS private miliknya + (total keroyok / jml PPL).
//  - Penanda Sub SLS PRIVATE (dikerjakan 1 PPL) vs KEROYOK (seluruh PPL tim).
//  - Drag Sub SLS antar tim / ke "Belum diplot", drag PPL antar tim / ke "PPL tanpa tim",
//    pilih PPL utk Sub SLS private. Juga tombol "Pindahkan ke…" (utk HP / tanpa drag).
//  - Semua perubahan = DRAFT, baru dikirim sekaligus lewat "Simpan Perubahan"
//    (POST /api/bencana/alokasi/papan-tim). Data lama seluruhnya keroyok.
// ------------------------------------------------------------------------

type Mode = "private" | "keroyok";
type Sub = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk_total: number;
  skor: number;
  pml_id: number | null;
  ppl_id: number | null;
  ppl_nama: string | null;
  dipecah: boolean;
  pecahan: string[];
  mode_kerja: Mode;
};
type Ppl = { id: number; nama: string; nagari: string | null; kecamatan: string | null };
type Tim = { pml_id: number; pml_nama: string; pml_menolak: boolean; ppl: Ppl[]; subsls: Sub[] };
type DataPapan = { tim: Tim[]; belum_diplot: Sub[]; ppl_tanpa_tim: Ppl[]; nama_petugas: Record<string, string> };
type DraftSub = { pml_id: number | null; ppl_id: number | null; mode_kerja: Mode };

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
const judul = (s: string | null) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "");

function tone(v: number, ref: number): { cls: string; label: string } {
  if (!ref) return { cls: "bg-gray-100 text-ink/60", label: "" };
  const d = (v - ref) / ref;
  if (d > 0.3) return { cls: "bg-rust-100 text-rust-700", label: "jauh di atas rata-rata" };
  if (d > 0.15) return { cls: "bg-gold-100 text-gold-600", label: "di atas rata-rata" };
  if (d < -0.3) return { cls: "bg-violet-50 text-violet-700", label: "jauh di bawah rata-rata" };
  return { cls: "bg-moss-100 text-moss-700", label: "seimbang" };
}

export default function PapanTim({ onBerubah }: { onBerubah?: () => void }) {
  const [data, setData] = useState<DataPapan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cari, setCari] = useState("");
  const [draftAtasan, setDraftAtasan] = useState<Record<number, number | null>>({});
  const [draftSub, setDraftSub] = useState<Record<string, DraftSub>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const res = await fetch("/api/bencana/alokasi/papan-tim", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat Papan Tim.");
      setData(json as DataPapan);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat Papan Tim.");
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  // ---- Indeks data server ----
  const idx = useMemo(() => {
    const subs = new Map<string, Sub>();
    const ppl = new Map<number, { p: Ppl; atasan: number | null }>();
    if (data) {
      for (const t of data.tim) {
        t.subsls.forEach((s) => subs.set(s.idsubsls, s));
        t.ppl.forEach((p) => ppl.set(p.id, { p, atasan: t.pml_id }));
      }
      data.belum_diplot.forEach((s) => subs.set(s.idsubsls, s));
      data.ppl_tanpa_tim.forEach((p) => ppl.set(p.id, { p, atasan: null }));
    }
    return { subs, ppl, timIds: new Set((data?.tim ?? []).map((t) => t.pml_id)) };
  }, [data]);

  const atasanEf = useCallback(
    (id: number) => (Object.prototype.hasOwnProperty.call(draftAtasan, id) ? draftAtasan[id] : idx.ppl.get(id)?.atasan ?? null),
    [draftAtasan, idx]
  );
  const subEf = useCallback(
    (s: Sub): DraftSub => draftSub[s.idsubsls] ?? { pml_id: s.pml_id, ppl_id: s.ppl_id, mode_kerja: s.mode_kerja },
    [draftSub]
  );

  // ---- Susunan efektif (server + draft) ----
  const papan = useMemo(() => {
    if (!data) return null;
    const tim = data.tim.map((t) => {
      const ppl = Array.from(idx.ppl.values())
        .filter((x) => atasanEf(x.p.id) === t.pml_id)
        .map((x) => x.p)
        .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
      const subs = Array.from(idx.subs.values())
        .filter((s) => subEf(s).pml_id === t.pml_id)
        .sort((a, b) => a.nagari.localeCompare(b.nagari, "id") || a.sls.localeCompare(b.sls, "id") || a.sub_sls.localeCompare(b.sub_sls));
      const total = subs.reduce((a, s) => a + s.skor, 0);
      const n = ppl.length;
      const keroyok = subs.filter((s) => subEf(s).mode_kerja === "keroyok").reduce((a, s) => a + s.skor, 0);
      const perPpl = new Map<number, number>();
      for (const p of ppl) {
        const priv = subs.filter((s) => subEf(s).mode_kerja === "private" && subEf(s).ppl_id === p.id).reduce((a, s) => a + s.skor, 0);
        perPpl.set(p.id, priv + (n > 0 ? keroyok / n : 0));
      }
      return { ...t, ppl, subs, total, rata: n > 0 ? total / n : total, perPpl };
    });
    const belum = Array.from(idx.subs.values()).filter((s) => {
      const pml = subEf(s).pml_id;
      return pml == null || !idx.timIds.has(pml);
    });
    const tanpaTim = Array.from(idx.ppl.values())
      .filter((x) => atasanEf(x.p.id) == null)
      .map((x) => x.p)
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    const totalSemua = tim.reduce((a, t) => a + t.total, 0);
    const jmlPpl = tim.reduce((a, t) => a + t.ppl.length, 0);
    return { tim, belum, tanpaTim, ref: jmlPpl > 0 ? totalSemua / jmlPpl : 0, jmlPpl };
  }, [data, idx, atasanEf, subEf]);

  // ---- Daftar perubahan ----
  const perubahan = useMemo(() => {
    const ppl = Object.entries(draftAtasan)
      .map(([id, a]) => ({ petugas_id: Number(id), atasan_id: a }))
      .filter((u) => (idx.ppl.get(u.petugas_id)?.atasan ?? null) !== u.atasan_id);
    const subsls = Object.entries(draftSub)
      .map(([id, d]) => ({ idsubsls: id, ...d }))
      .filter((d) => {
        const s = idx.subs.get(d.idsubsls);
        return !!s && (s.pml_id !== d.pml_id || s.ppl_id !== d.ppl_id || s.mode_kerja !== d.mode_kerja);
      });
    return { ppl, subsls };
  }, [draftAtasan, draftSub, idx]);
  const jmlPerubahan = perubahan.ppl.length + perubahan.subsls.length;
  const adaPrivateTanpaPpl = (papan?.tim ?? []).some((t) =>
    t.subs.some((s) => {
      const d = subEf(s);
      return d.mode_kerja === "private" && (!d.ppl_id || !t.ppl.some((p) => p.id === d.ppl_id));
    })
  );

  // ---- Aksi draft ----
  function setSub(s: Sub, patch: Partial<DraftSub>) {
    setDraftSub((prev) => ({ ...prev, [s.idsubsls]: { ...subEf(s), ...patch } }));
  }
  function pindahSub(id: string, ke: number | null) {
    const s = idx.subs.get(id);
    if (!s || s.dipecah) return;
    if ((subEf(s).pml_id ?? null) === ke) return;
    if (ke == null && !window.confirm(`Lepas ${judul(s.sls)} (${s.sub_sls}) dari tim? Sub SLS kembali belum diplot.`)) return;
    setSub(s, { pml_id: ke, ppl_id: null, mode_kerja: "keroyok" });
  }
  function pindahPpl(id: number, ke: number | null) {
    if (atasanEf(id) === ke) return;
    const lama = atasanEf(id);
    setDraftAtasan((prev) => ({ ...prev, [id]: ke }));
    // Aturan: Sub SLS milik PPL ini di tim lama tetap di tim lama, PPL dilepas & private -> keroyok.
    setDraftSub((prev) => {
      const next = { ...prev };
      for (const s of idx.subs.values()) {
        const d = next[s.idsubsls] ?? { pml_id: s.pml_id, ppl_id: s.ppl_id, mode_kerja: s.mode_kerja };
        if (d.ppl_id === id && d.pml_id === lama && d.pml_id !== ke) next[s.idsubsls] = { ...d, ppl_id: null, mode_kerja: "keroyok" };
      }
      return next;
    });
  }
  function batal() {
    setDraftAtasan({});
    setDraftSub({});
    setInfo(null);
  }
  async function simpan() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/bencana/alokasi/papan-tim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(perubahan),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Gagal menyimpan (kode HTTP ${res.status}).`);
      setDraftAtasan({});
      setDraftSub({});
      setInfo(`${jmlPerubahan} perubahan tersimpan. Skor jarak Sub SLS yg PPL-nya berubah sudah dihitung ulang.`);
      await muat();
      onBerubah?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Drag & drop ----
  function onDragStart(e: React.DragEvent, payload: { jenis: "sub"; id: string } | { jenis: "ppl"; id: number }) {
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  }
  function dropProps(kunci: string, ke: number | null, terima: "sub" | "ppl" | "keduanya") {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(kunci);
      },
      onDragLeave: () => setDragOver((v) => (v === kunci ? null : v)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        try {
          const d = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (d.jenis === "sub" && terima !== "ppl") pindahSub(d.id, ke);
          if (d.jenis === "ppl" && terima !== "sub") pindahPpl(d.id, ke);
        } catch {
          /* bukan payload papan */
        }
      },
    };
  }

  if (error && !data) return <p className="rounded bg-rust-100 px-3 py-2 text-sm text-rust-700">{error}</p>;
  if (!papan || !data) return <p className="text-sm text-ink/60">Memuat Papan Tim…</p>;

  const q = cari.trim().toLowerCase();
  const timTampil = papan.tim.filter(
    (t) =>
      !q ||
      t.pml_nama.toLowerCase().includes(q) ||
      t.ppl.some((p) => p.nama.toLowerCase().includes(q)) ||
      t.subs.some((s) => s.nagari.toLowerCase().includes(q) || s.sls.toLowerCase().includes(q))
  );
  const opsiTim = papan.tim.map((t) => ({ id: t.pml_id, nama: t.pml_nama }));
  const semuaSub = papan.tim.flatMap((t) => t.subs);

  type TimEf = NonNullable<typeof papan>["tim"][number];
  function KartuSub({ s, t }: { s: Sub; t?: TimEf }) {
    const d = subEf(s);
    const berubah = !!draftSub[s.idsubsls] && (s.pml_id !== d.pml_id || s.ppl_id !== d.ppl_id || s.mode_kerja !== d.mode_kerja);
    const priv = d.mode_kerja === "private";
    const pplValid = !!d.ppl_id && !!t?.ppl.some((p) => p.id === d.ppl_id);
    const namaAwal = d.ppl_id ? data!.nama_petugas[String(d.ppl_id)] ?? null : null;
    return (
      <div
        draggable={!s.dipecah}
        onDragStart={(e) => onDragStart(e, { jenis: "sub", id: s.idsubsls })}
        className={`mb-1.5 rounded-lg border border-l-[5px] p-2 ${priv ? "border-l-moss-500" : "border-l-amber-500"} ${
          berubah ? "border-orange-300 bg-orange-50/60" : "border-line bg-white"
        } ${s.dipecah ? "" : "cursor-grab"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold text-ink">
            {judul(s.sls)} ({s.sub_sls})
          </p>
          {t && !s.dipecah && (
            <span className="inline-flex shrink-0 overflow-hidden rounded-full border border-line text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setSub(s, { mode_kerja: "private" })}
                className={`px-2 py-0.5 ${priv ? "bg-moss-500 text-white" : "bg-white text-ink/50"}`}
              >
                PRIVATE
              </button>
              <button
                type="button"
                onClick={() => setSub(s, { mode_kerja: "keroyok" })}
                className={`px-2 py-0.5 ${!priv ? "bg-amber-500 text-white" : "bg-white text-ink/50"}`}
              >
                KEROYOK
              </button>
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-ink/60">
          Nagari {judul(s.nagari)} · {s.kk_total.toLocaleString("id-ID")} KK · skor <b className="text-ink">{fmt(s.skor)}</b>
          {berubah && <span className="ml-1 font-semibold text-orange-600">· belum disimpan</span>}
        </p>
        {s.dipecah ? (
          <p className="mt-0.5 text-[11px] text-indigo-700">✂️ Dipecah: {s.pecahan.join(", ") || "-"} (kelola di Langkah 4)</p>
        ) : t && priv ? (
          <select
            value={d.ppl_id ?? ""}
            onChange={(e) => setSub(s, { ppl_id: e.target.value ? Number(e.target.value) : null })}
            className={`mt-1 w-full rounded border px-1.5 py-1 text-[12px] ${pplValid ? "border-line" : "border-2 border-rust-500"}`}
          >
            <option value="">— pilih PPL (wajib utk private) —</option>
            {t.ppl.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-0.5 text-[11px] text-amber-700">
            {t ? "Dikerjakan bersama seluruh PPL tim" : "Belum punya tim"}
            {namaAwal ? ` · PPL awal: ${namaAwal}` : ""}
          </p>
        )}
        {!s.dipecah && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value === "") return;
              pindahSub(s.idsubsls, e.target.value === "lepas" ? null : Number(e.target.value));
            }}
            className="mt-1 rounded border border-line bg-white px-1 py-0.5 text-[10.5px] text-blue-800"
            aria-label="Pindahkan Sub SLS ke tim lain"
          >
            <option value="">Pindahkan ke…</option>
            {t && <option value="lepas">— Belum diplot (lepas dari tim) —</option>}
            {opsiTim
              .filter((o) => o.id !== d.pml_id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  Tim {o.nama}
                </option>
              ))}
          </select>
        )}
      </div>
    );
  }

  function KartuPpl({ p, nilai }: { p: Ppl; nilai?: number }) {
    const berubah = Object.prototype.hasOwnProperty.call(draftAtasan, p.id) && (idx.ppl.get(p.id)?.atasan ?? null) !== draftAtasan[p.id];
    const tn = nilai != null ? tone(nilai, papan!.ref) : null;
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, { jenis: "ppl", id: p.id })}
        className={`mb-1.5 flex cursor-grab items-center justify-between gap-2 rounded-lg border p-2 ${
          berubah ? "border-orange-300 bg-orange-50/60" : "border-line bg-gray-50/60"
        }`}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">
            {p.nama}
            {berubah && <span className="ml-1 text-[10px] font-semibold text-orange-600">• dipindah</span>}
          </p>
          <p className="text-[11px] text-ink/60">
            {[p.nagari ? `Nagari ${judul(p.nagari)}` : null, p.kecamatan ? `Kec. ${judul(p.kecamatan)}` : null].filter(Boolean).join(", ") || "Alamat belum diisi"}
          </p>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value === "") return;
              pindahPpl(p.id, e.target.value === "lepas" ? null : Number(e.target.value));
            }}
            className="mt-1 rounded border border-line bg-white px-1 py-0.5 text-[10.5px] text-blue-800"
            aria-label="Pindahkan PPL ke tim lain"
          >
            <option value="">Pindahkan ke…</option>
            <option value="lepas">— PPL tanpa tim —</option>
            {opsiTim
              .filter((o) => o.id !== atasanEf(p.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  Tim {o.nama}
                </option>
              ))}
          </select>
        </div>
        {nilai != null && tn && (
          <span title={`Beban: private + bagian keroyok · ${tn.label}`} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tn.cls}`}>
            {fmt(nilai)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium text-blue-950">Langkah 5 — Papan Tim (Keroyokan)</h2>
          <p className="text-xs text-ink/60">
            Skor = skor beban akhir. Rata-rata/PPL = total tim ÷ jumlah PPL. Beban per PPL = Sub SLS private miliknya + (total keroyok ÷ jumlah PPL).
            Seret PPL/Sub SLS antar kartu atau pakai &quot;Pindahkan ke…&quot;. Tersimpan setelah &quot;Simpan Perubahan&quot;.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {jmlPerubahan > 0 && <span className="text-xs font-semibold text-orange-600">{jmlPerubahan} perubahan belum disimpan</span>}
          <button type="button" onClick={batal} disabled={busy || jmlPerubahan === 0} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            Batalkan
          </button>
          <button
            type="button"
            onClick={simpan}
            disabled={busy || jmlPerubahan === 0 || adaPrivateTanpaPpl}
            title={adaPrivateTanpaPpl ? "Ada Sub SLS PRIVATE yg belum dipilih PPL-nya (kotak merah)" : ""}
            className="rounded-md bg-blue-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Menyimpan…" : "Simpan Perubahan"}
          </button>
        </div>
      </div>

      {error && <p className="rounded bg-rust-100 px-3 py-2 text-xs text-rust-700">⚠ {error}</p>}
      {info && <p className="rounded bg-moss-100 px-3 py-2 text-xs text-moss-700">✓ {info}</p>}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md border border-line bg-white px-2.5 py-1">
          Tim <b>{papan.tim.length}</b>
        </span>
        <span className="rounded-md border border-line bg-white px-2.5 py-1">
          PPL dalam tim <b>{papan.jmlPpl}</b>
        </span>
        <span className="rounded-md border border-line bg-white px-2.5 py-1">
          Keroyok / Private <b>{semuaSub.filter((s) => subEf(s).mode_kerja === "keroyok").length}</b> /{" "}
          <b>{semuaSub.filter((s) => subEf(s).mode_kerja === "private").length}</b>
        </span>
        <span className="rounded-md border border-line bg-white px-2.5 py-1">
          Rata-rata beban/PPL (semua tim) <b>{fmt(papan.ref)}</b>
        </span>
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari PML / PPL / nagari / jorong…"
          className="ml-auto w-64 rounded-md border border-line px-2.5 py-1 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-ink/60">
        <span>
          <span className="text-moss-700">▌</span> Private (1 PPL)
        </span>
        <span>
          <span className="text-amber-500">▌</span> Keroyok (seluruh tim)
        </span>
        <span className="rounded-full bg-moss-100 px-1.5 text-moss-700">seimbang</span>
        <span className="rounded-full bg-gold-100 px-1.5 text-gold-600">+15–30%</span>
        <span className="rounded-full bg-rust-100 px-1.5 text-rust-700">&gt; +30%</span>
        <span className="rounded-full bg-violet-50 px-1.5 text-violet-700">&lt; −30%</span>
      </div>

      <div className="grid items-start gap-3 md:grid-cols-[250px_1fr]">
        {/* Kolom kiri: Belum diplot & PPL tanpa tim */}
        <div className="space-y-3">
          <div {...dropProps("belum", null, "sub")} className={`rounded-xl border bg-white ${dragOver === "belum" ? "ring-2 ring-blue-700" : "border-line"}`}>
            <div className="rounded-t-xl bg-slate-700 px-3 py-2 text-white">
              <p className="text-sm font-semibold">Belum diplot ({papan.belum.length})</p>
              <p className="text-[11px] text-slate-200">Seret Sub SLS ke sini = lepas dari tim</p>
            </div>
            <div className="max-h-[480px] overflow-y-auto p-2">
              {papan.belum.length === 0 ? <p className="py-2 text-center text-[11px] text-ink/40">kosong</p> : papan.belum.map((s) => <KartuSub key={s.idsubsls} s={s} />)}
            </div>
          </div>
          <div {...dropProps("tanpatim", null, "ppl")} className={`rounded-xl border bg-white ${dragOver === "tanpatim" ? "ring-2 ring-blue-700" : "border-line"}`}>
            <div className="rounded-t-xl bg-slate-700 px-3 py-2 text-white">
              <p className="text-sm font-semibold">PPL tanpa tim ({papan.tanpaTim.length})</p>
              <p className="text-[11px] text-slate-200">Seret ke kartu PML untuk bergabung</p>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {papan.tanpaTim.length === 0 ? <p className="py-2 text-center text-[11px] text-ink/40">kosong</p> : papan.tanpaTim.map((p) => <KartuPpl key={p.id} p={p} />)}
            </div>
          </div>
        </div>

        {/* Kartu tim */}
        <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {timTampil.map((t) => {
            const kunci = `tim-${t.pml_id}`;
            const tnTim = tone(t.rata, papan.ref);
            return (
              <div key={t.pml_id} {...dropProps(kunci, t.pml_id, "keduanya")} className={`overflow-hidden rounded-xl border bg-white ${dragOver === kunci ? "ring-2 ring-blue-700" : "border-line"}`}>
                <div className="bg-blue-950 px-3 py-2.5 text-white">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[15px] font-semibold">PML: {t.pml_nama}</p>
                    <p className="text-[11px] text-blue-200">
                      {t.ppl.length} PPL · {t.subs.length} Sub SLS
                    </p>
                  </div>
                  {t.pml_menolak && <p className="mt-0.5 text-[11px] font-semibold text-violet-200">PML menolak — menunggu PML pengganti (Langkah 4)</p>}
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div className="rounded-md bg-white/10 px-2 py-1 text-[10.5px] text-blue-100">
                      Skor total tim<b className="block text-[15px] text-white">{fmt(t.total)}</b>
                    </div>
                    <div className="rounded-md bg-white/10 px-2 py-1 text-[10.5px] text-blue-100">
                      Rata-rata per PPL
                      <b className="block text-[15px] text-white">
                        {fmt(t.rata)} <span className={`ml-1 rounded-full px-1.5 align-middle text-[10px] ${tnTim.cls}`}>{tnTim.label || "-"}</span>
                      </b>
                    </div>
                  </div>
                </div>
                <div className="border-b border-line p-2">
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink/50">PPL</p>
                  {t.ppl.length === 0 ? (
                    <p className="rounded border border-dashed border-line py-2 text-center text-[11px] text-ink/40">belum ada PPL — seret ke sini</p>
                  ) : (
                    t.ppl.map((p) => <KartuPpl key={p.id} p={p} nilai={t.perPpl.get(p.id) ?? 0} />)
                  )}
                </div>
                <div className="max-h-[520px] overflow-y-auto p-2">
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-ink/50">Sub SLS tim</p>
                  {t.subs.length === 0 ? (
                    <p className="rounded border border-dashed border-line py-2 text-center text-[11px] text-ink/40">belum ada Sub SLS — seret ke sini</p>
                  ) : (
                    t.subs.map((s) => <KartuSub key={s.idsubsls} s={s} t={t} />)
                  )}
                </div>
              </div>
            );
          })}
          {timTampil.length === 0 && <p className="text-sm text-ink/50">Tidak ada tim yang cocok dengan pencarian.</p>}
        </div>
      </div>
    </div>
  );
}
