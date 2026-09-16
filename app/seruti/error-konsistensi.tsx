"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Tab "Error Konsistensi" — VERSI 2 (rombak total dari versi katalog belajar
// sebelumnya, per arahan Bapak Iqbal 16/9): bukan lagi menjelajah katalog
// aturan yang abstrak, tapi menampilkan TEMUAN NYATA hasil evaluasi otomatis
// aturan konsistensi resmi BPS -- VSEN26.M (930/1.018) DAN VSEN26.KP
// (3.280/3.339, ditambahkan 16/9 setelah PPL upload lengkap 15 file DBF
// VSEN26.KP/VSEN26.M) -- terhadap DATA YANG SUDAH DIENTRI (tabel m1/mrt1/
// mrt2/.../t3-t12 — data DBF yang sama dipakai Anomali Cepat). Evaluasi
// jalan otomatis tiap kali ada upload/"Jalankan Ulang" baru
// (lib/runKonsistensiPipeline.ts utk M, lib/runKonsistensiPipelineKP.ts utk
// KP), hasilnya tersimpan bareng di kp_konsistensi_temuan (dibedakan lewat
// kolom kuesioner).
//
// PPL HANYA melihat temuan utk NKS yang jadi tanggung jawabnya sendiri —
// dicocokkan dari nama yang diisi terhadap kp_nks_jorong.nama_ppl (BUKAN
// dropdown pilih-NKS bebas seperti Konfirmasi PPL). Setiap temuan terikat
// NKS + nomor urut sampel (NURT) + nomor urut ART (kalau levelnya per-ART).
//
// Aksinya cuma SATU: "Tandai Sudah Dibaca" (bukan Sesuai/Perlu
// Koreksi/Salah Entry seperti Konfirmasi PPL) — tujuannya memaksa PPL
// membaca aturan yang relevan dgn sampelnya sendiri, bukan meminta
// keputusan/konfirmasi apa pun. Tidak ada efek ke data survei.
// ============================================================================

interface Temuan {
  id: number;
  rule_id: number;
  field: string;
  kuesioner: string | null;
  nks: string;
  nurt: string;
  art_no: number | null;
  nama_krt: string | null;
  message: string;
  perlakuan: string | null;
  level: string | null;
  is_fatal: boolean;
  status: "aktif" | "resolved";
  dibaca_at: string | null;
  dibaca_oleh: string | null;
  variabel: { name: string; value: unknown }[] | null;
}

type FilterKuesioner = "SEMUA" | "M" | "KP";

function kuesionerBadgeClass(kuesioner: string | null): string {
  return kuesioner === "KP" ? "bg-gold-500 text-white" : "bg-navy-400 text-white";
}

const NAMA_PPL_KEY = "seruti-nama-ppl";

function levelBadgeClass(level: string | null): string {
  switch (level) {
    case "RT":
      return "bg-navy-700 text-white";
    case "BALITA":
      return "bg-moss-500 text-white";
    default:
      return "bg-rust-500 text-white"; // ART (paling umum)
  }
}

function levelLabel(level: string | null, artNo: number | null): string {
  if (level === "RT") return "Tingkat Rumah Tangga";
  if (artNo != null) return `ART No. ${artNo}`;
  return level || "-";
}

// Pecah "<kondisi> tapi <masalah>" jadi dua bagian yang lebih gampang dibaca
// (sama seperti versi katalog sebelumnya — pesan asli BPS hampir semua
// berpola ini).
function pisahPesan(message: string | null): { kondisi: string; masalah: string } | null {
  if (!message) return null;
  const idx = message.toLowerCase().lastIndexOf(" tapi ");
  if (idx === -1) return null;
  const kondisi = message.slice(0, idx).trim();
  const masalah = message.slice(idx + 6).trim();
  if (!kondisi || !masalah) return null;
  return { kondisi, masalah };
}

// Format nilai variabel supaya gampang dibaca -- angka pakai pemisah ribuan
// ala Indonesia, kosong/null/NaN ditandai jelas "(kosong)" (bukan "0" atau
// "-") supaya PPL tidak salah kira isian itu benar-benar nol.
function fmtVarValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(kosong)";
  if (typeof v === "number") return Number.isNaN(v) ? "(kosong)" : v.toLocaleString("id-ID");
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (Array.isArray(v)) return v.length === 0 ? "(kosong)" : v.join(", ");
  return String(v);
}

// Label deskriptif field, KALAU ada pola yang dikenal (baris komoditas
// "R{n}K{c}" atau field hasil join ke data VSEN26.M "KOR_..."). Belum ada
// kamus label utk seluruh ribuan kode field mesin aturan BPS -- kalau tidak
// cocok pola manapun, cukup tampilkan kode field-nya saja (tanpa label
// tambahan), sesuai arahan "jika ada labelnya maka tambahkan labelnya".
function labelForVariabel(name: string): string | null {
  const rowMatch = /^R(\d+)K(\d+[A-Z]?)(\[.*\])?$/.exec(name);
  if (rowMatch) return `Baris komoditas No. ${rowMatch[1]}, Kolom ${rowMatch[2]}`;
  if (name.startsWith("KOR_")) return `Data VSEN26.M: ${name.slice(4)}`;
  return null;
}

export default function ErrorKonsistensiTab() {
  const [supabase] = useState(() => createClient());

  // ---------- identitas PPL (dipakai utk cari NKS tanggung jawabnya + menyimpan "sudah dibaca") ----------
  const [namaPpl, setNamaPpl] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NAMA_PPL_KEY);
      if (saved) setNamaPpl(saved);
    } catch {
      // localStorage tidak tersedia (mis. mode private) — abaikan, cukup input manual per sesi
    }
  }, []);
  function updateNamaPpl(v: string) {
    setNamaPpl(v);
    try {
      window.localStorage.setItem(NAMA_PPL_KEY, v);
    } catch {
      // abaikan
    }
  }

  const [nksSaya, setNksSaya] = useState<{ nks: string; nama_jorong: string | null }[] | null>(null);
  const [loadingNks, setLoadingNks] = useState(false);

  const [temuan, setTemuan] = useState<Temuan[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [hanyaBelumDibaca, setHanyaBelumDibaca] = useState(true);
  const [filterKuesioner, setFilterKuesioner] = useState<FilterKuesioner>("SEMUA");
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // ---------- daftar nama PPL (dropdown), diambil dari kp_nks_jorong ----------
  const [pplOptions, setPplOptions] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("kp_nks_jorong").select("nama_ppl");
      const unik = Array.from(new Set((data ?? []).map((r) => r.nama_ppl as string).filter(Boolean)));
      setPplOptions(unik.sort((a, b) => a.localeCompare(b)));
    })();
  }, [supabase]);

  // ---------- cari NKS tanggung jawab PPL ybs, dari nama yg dipilih ----------
  const loadNksSaya = useCallback(async () => {
    const nama = namaPpl.trim();
    if (!nama) {
      setNksSaya(null);
      return;
    }
    setLoadingNks(true);
    const { data } = await supabase
      .from("kp_nks_jorong")
      .select("nks, nama_jorong")
      .eq("nama_ppl", nama);
    setNksSaya((data ?? []) as { nks: string; nama_jorong: string | null }[]);
    setLoadingNks(false);
  }, [supabase, namaPpl]);

  useEffect(() => {
    loadNksSaya();
  }, [loadNksSaya]);

  // ---------- muat temuan aktif utk NKS-NKS itu ----------
  const loadTemuan = useCallback(async () => {
    if (!nksSaya || nksSaya.length === 0) {
      setTemuan([]);
      return;
    }
    setLoading(true);
    const nksList = nksSaya.map((n) => n.nks);
    const { data, error } = await supabase
      .from("kp_konsistensi_temuan")
      .select("*")
      .in("nks", nksList)
      .eq("status", "aktif")
      .order("nks", { ascending: true })
      .order("nurt", { ascending: true })
      .order("art_no", { ascending: true, nullsFirst: true })
      .range(0, 4999);
    if (error) {
      console.error("loadTemuan error:", error);
      setDebugError(`Gagal membaca temuan: ${error.message} (code: ${error.code})`);
    } else {
      setDebugError(null);
    }
    const list = (data ?? []) as Temuan[];
    setTemuan(list);
    setOpenGroups(new Set(list.map((t) => `${t.nks}|${t.nurt}`))); // default semua sampel terbuka
    setLoading(false);
  }, [supabase, nksSaya]);

  useEffect(() => {
    loadTemuan();
  }, [loadTemuan]);

  async function tandaiDibaca(id: number) {
    const nama = namaPpl.trim();
    if (!nama) return;
    const now = new Date().toISOString();
    setTemuan((prev) => prev.map((t) => (t.id === id ? { ...t, dibaca_at: now, dibaca_oleh: nama } : t)));
    await supabase
      .from("kp_konsistensi_temuan")
      .update({ dibaca_at: now, dibaca_oleh: nama })
      .eq("id", id);
  }

  async function batalkanDibaca(id: number) {
    setTemuan((prev) => prev.map((t) => (t.id === id ? { ...t, dibaca_at: null, dibaca_oleh: null } : t)));
    await supabase.from("kp_konsistensi_temuan").update({ dibaca_at: null, dibaca_oleh: null }).eq("id", id);
  }

  function toggleCard(id: number) {
    setOpenCards((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleGroup(g: string) {
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  }

  const jumlahM = useMemo(() => temuan.filter((t) => t.kuesioner !== "KP").length, [temuan]);
  const jumlahKp = useMemo(() => temuan.filter((t) => t.kuesioner === "KP").length, [temuan]);

  const temuanTersaring = useMemo(() => {
    if (filterKuesioner === "SEMUA") return temuan;
    if (filterKuesioner === "KP") return temuan.filter((t) => t.kuesioner === "KP");
    return temuan.filter((t) => t.kuesioner !== "KP"); // "M" -- termasuk baris lama tanpa kolom kuesioner
  }, [temuan, filterKuesioner]);

  const grouped = useMemo(() => {
    const map = new Map<string, Temuan[]>();
    for (const t of temuanTersaring) {
      const g = `${t.nks}|${t.nurt}`;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(t);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [temuanTersaring]);

  const total = temuanTersaring.length;
  const belumDibaca = temuanTersaring.filter((t) => !t.dibaca_at).length;
  const sudahDibaca = total - belumDibaca;
  const persen = total > 0 ? Math.round((sudahDibaca / total) * 100) : 0;

  const groupedTampil = grouped
    .map(([g, list]) => [g, hanyaBelumDibaca ? list.filter((t) => !t.dibaca_at) : list] as [string, Temuan[]])
    .filter(([, list]) => list.length > 0);

  const namaTrim = namaPpl.trim();

  return (
    <div className="space-y-3 pb-6">
      {/* ---------- Header ---------- */}
      <div>
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Error Konsistensi</h1>
        <p className="mt-0.5 text-xs text-ink/60 sm:text-sm">
          Temuan nyata dari aturan konsistensi resmi BPS VSEN26.M &amp; VSEN26.KP, dievaluasi otomatis terhadap data
          yang sudah Anda entri — hanya untuk NKS &amp; sampel yang jadi tanggung jawab Anda. Wajib dibaca, bukan
          dikonfirmasi/ditolak.
        </p>
      </div>

      {/* ---------- Identitas PPL ---------- */}
      <div className="rounded-lg border border-line bg-white p-3">
        <label className="text-xs font-semibold text-navy-900">Nama Anda (PPL)</label>
        <select
          value={namaPpl}
          onChange={(e) => updateNamaPpl(e.target.value)}
          className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
        >
          <option value="">-- Pilih Nama Anda --</option>
          {pplOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {namaTrim && !loadingNks && nksSaya && nksSaya.length > 0 && (
          <p className="mt-1.5 text-[11px] text-ink/50">
            NKS Anda: {nksSaya.map((n) => n.nks).join(", ")}
          </p>
        )}
      </div>

      {!namaTrim ? (
        <p className="rounded-lg border border-gold-400/60 bg-gold-100 p-3 text-xs text-gold-600">
          &#9888; Pilih nama Anda dulu di atas untuk melihat temuan konsistensi pada NKS yang jadi tanggung jawab
          Anda.
        </p>
      ) : loadingNks ? (
        <p className="py-6 text-center text-sm text-ink/40">Mencari NKS Anda...</p>
      ) : !nksSaya || nksSaya.length === 0 ? (
        <p className="rounded-lg border border-gold-400/60 bg-gold-100 p-3 text-xs text-gold-600">
          &#9888; &quot;{namaTrim}&quot; belum terdaftar sebagai PPL untuk NKS manapun di data BPS Kabupaten.
        </p>
      ) : (
        <>
          {debugError && (
            <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {debugError}</p>
          )}

          {/* ---------- Ringkasan progres ---------- */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <SummaryBox label="Total Temuan" value={total} className="bg-navy-50 text-navy-900" />
            <SummaryBox label="Belum Dibaca" value={belumDibaca} className="bg-gold-100 text-gold-600" />
            <SummaryBox label="Progres" value={`${persen}%`} className="bg-moss-100 text-moss-700" />
          </div>

          {/* ---------- Filter kuesioner (M / KP) ---------- */}
          <div>
            <label className="text-xs font-semibold text-navy-900">Jenis Kuesioner</label>
            <select
              value={filterKuesioner}
              onChange={(e) => setFilterKuesioner(e.target.value as FilterKuesioner)}
              className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            >
              <option value="SEMUA">Semua ({jumlahM + jumlahKp})</option>
              <option value="M">VSEN26.M ({jumlahM})</option>
              <option value="KP">VSEN26.KP ({jumlahKp})</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={hanyaBelumDibaca}
              onChange={(e) => setHanyaBelumDibaca(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Hanya tampilkan yang belum dibaca
          </label>

          {loading ? (
            <p className="py-6 text-center text-sm text-ink/40">Memuat temuan...</p>
          ) : total === 0 ? (
            <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-ink/50">
              &#127881; Tidak ada temuan konsistensi untuk NKS Anda saat ini.
            </p>
          ) : groupedTampil.length === 0 ? (
            <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-ink/50">
              &#127881; Semua temuan untuk NKS Anda sudah dibaca.
            </p>
          ) : (
            groupedTampil.map(([g, list]) => {
              const [nks, nurt] = g.split("|");
              const jorong = nksSaya.find((n) => n.nks === nks)?.nama_jorong;
              const totalGroup = (grouped.find(([gg]) => gg === g)?.[1] ?? []).length;
              const belumGroup = (grouped.find(([gg]) => gg === g)?.[1] ?? []).filter((t) => !t.dibaca_at).length;
              return (
                <div key={g} className="overflow-hidden rounded-lg border border-line bg-white">
                  <button
                    onClick={() => toggleGroup(g)}
                    className="flex w-full items-center justify-between gap-2 bg-navy-50 px-3 py-2.5 text-left"
                  >
                    <span className="text-xs font-bold uppercase tracking-wide text-navy-900 sm:text-sm">
                      NKS {nks} &middot; Sampel {nurt}
                      {jorong ? ` (${jorong})` : ""}{" "}
                      <span className="font-normal text-navy-400">
                        ({belumGroup}/{totalGroup} belum dibaca)
                      </span>
                    </span>
                    <Chevron open={openGroups.has(g)} />
                  </button>
                  {openGroups.has(g) && (
                    <div className="space-y-2 p-2">
                      {list.map((t) => (
                        <TemuanCard
                          key={t.id}
                          temuan={t}
                          isOpen={openCards.has(t.id)}
                          onToggle={() => toggleCard(t.id)}
                          onTandaiDibaca={() => tandaiDibaca(t.id)}
                          onBatalkanDibaca={() => batalkanDibaca(t.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

function SummaryBox({ label, value, className }: { label: string; value: number | string; className: string }) {
  return (
    <div className={`rounded-lg px-1.5 py-2 ${className}`}>
      <div className="text-lg font-bold leading-none sm:text-xl">{value}</div>
      <div className="mt-0.5 text-[10px] font-medium leading-none sm:text-[11px]">{label}</div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-ink/50 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function TemuanCard({
  temuan,
  isOpen,
  onToggle,
  onTandaiDibaca,
  onBatalkanDibaca,
}: {
  temuan: Temuan;
  isOpen: boolean;
  onToggle: () => void;
  onTandaiDibaca: () => void;
  onBatalkanDibaca: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const pisah = pisahPesan(temuan.message);
  const sudahDibaca = Boolean(temuan.dibaca_at);

  async function handleTandai() {
    setBusy(true);
    await onTandaiDibaca();
    setBusy(false);
  }
  async function handleBatal() {
    setBusy(true);
    await onBatalkanDibaca();
    setBusy(false);
  }

  return (
    <div className={`overflow-hidden rounded-lg border ${sudahDibaca ? "border-moss-500/40" : "border-line"}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-2.5 bg-white p-3 text-left">
        <span className={`mt-0.5 shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${levelBadgeClass(temuan.level)}`}>
          {temuan.field}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-ink/50">
              <span className={`mr-1 rounded px-1 py-0.5 text-[9px] font-bold ${kuesionerBadgeClass(temuan.kuesioner)}`}>
                {temuan.kuesioner === "KP" ? "KP" : "M"}
              </span>
              {levelLabel(temuan.level, temuan.art_no)}
              {temuan.nama_krt ? ` · ${temuan.nama_krt}` : ""}
              {temuan.is_fatal && <span className="ml-1 font-semibold text-rust-700">(wajib diperbaiki)</span>}
            </p>
            {sudahDibaca && (
              <span className="shrink-0 rounded-full bg-moss-100 px-2 py-0.5 text-[10px] font-semibold text-moss-700">
                &#10003; Dibaca
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-ink/80 sm:text-sm">{pisah ? pisah.masalah : temuan.message}</p>
        </div>
        <Chevron open={isOpen} />
      </button>

      {isOpen && (
        <div className="space-y-3 border-t border-line bg-paper/30 p-3">
          {/* Data yang dianalisis — semua variabel & nilai yang dipakai evaluasi
              aturan ini (dari lib/konsistensiEngine.ts collectFieldValues()),
              format mirip kartu Anomali Cepat tapi nama/kode variabel dibuat
              lebih gelap/jelas (font-semibold text-navy-900) sesuai arahan. */}
          {temuan.variabel && temuan.variabel.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-navy-900">Data yang dianalisis</p>
              <div className="overflow-hidden rounded-md border border-line">
                {temuan.variabel.map((v, i) => {
                  const label = labelForVariabel(v.name);
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs sm:text-sm ${
                        i > 0 ? "border-t border-line" : ""
                      } bg-white`}
                    >
                      <span className="font-semibold text-navy-900">
                        {label ?? v.name}
                        {label && <span className="ml-1 text-[10px] font-mono font-normal text-ink/40">({v.name})</span>}
                      </span>
                      <span className="text-right font-medium text-ink">{fmtVarValue(v.value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pisah ? (
            <div className="space-y-2">
              <div className="rounded-md border border-navy-100 bg-navy-50 p-2.5">
                <p className="text-xs font-bold text-navy-900">Kalau kondisi ini terjadi:</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/80 sm:text-sm">{pisah.kondisi}</p>
              </div>
              <div className="rounded-md border border-rust-100 bg-rust-100/40 p-2.5">
                <p className="text-xs font-bold text-rust-700">...maka seharusnya TIDAK begini:</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/80 sm:text-sm">{pisah.masalah}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-line bg-white p-2.5">
              <p className="text-xs leading-relaxed text-ink/80 sm:text-sm">{temuan.message}</p>
            </div>
          )}

          {temuan.perlakuan && (
            <div className="flex gap-2 rounded-md border border-navy-100 bg-navy-50 p-2.5">
              <span className="mt-0.5 shrink-0 text-navy-700">&#128214;</span>
              <div>
                <p className="text-xs font-bold text-navy-900">Perlakuan</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/80 sm:text-sm">{temuan.perlakuan}</p>
              </div>
            </div>
          )}

          {sudahDibaca ? (
            <div className="space-y-1.5">
              <p className="text-center text-[11px] text-ink/50">
                Ditandai dibaca oleh {temuan.dibaca_oleh}
                {temuan.dibaca_at ? ` · ${new Date(temuan.dibaca_at).toLocaleString("id-ID")}` : ""}
              </p>
              <button
                disabled={busy}
                onClick={handleBatal}
                className="w-full rounded-md border border-line py-2 text-xs font-semibold text-ink/60 transition hover:bg-paper/60 disabled:opacity-50"
              >
                Batalkan tanda dibaca
              </button>
            </div>
          ) : (
            <button
              disabled={busy}
              onClick={handleTandai}
              className="w-full rounded-md bg-navy-700 py-3 text-sm font-semibold text-white transition hover:bg-navy-900 disabled:opacity-50"
            >
              &#10003; Tandai Sudah Dibaca
            </button>
          )}
        </div>
      )}
    </div>
  );
}
