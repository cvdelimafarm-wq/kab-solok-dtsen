"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Tab "Error Konsistensi" — katalog aturan validasi/konsistensi resmi BPS
// Pusat untuk kuesioner VSEN26 (Kor = "M" dan Kor+Modul = "KP"), diambil
// langsung dari metadata aplikasi client desktop BPS (Assets/Metadata*.xlsx).
// Total ±4.357 aturan (1.018 utk M, 3.339 utk KP).
//
// Ini BUKAN alat konfirmasi/validasi data seperti Konfirmasi PPL — ini alat
// BELAJAR: PPL menjelajah/mencari aturan, lalu menandai "Sudah Dibaca" per
// aturan. Tidak ada aksi setuju/tolak, tidak ada efek ke data survei sama
// sekali (read-only terhadap kp_konsistensi_rules; satu-satunya tulisan
// adalah baris "sudah dibaca" milik PPL ybs di kp_konsistensi_dibaca).
//
// Pesan asli dari BPS (kolom `message`) hampir semua berpola
// "<kondisi> tapi <isian bermasalah>" — dipecah otomatis (bukan ditulis
// ulang manual, krn ~4.357 baris) jadi dua blok "Kalau ... / Tapi ..."
// supaya lebih gampang dibaca tanpa mengubah arti aslinya.
// ============================================================================

type Kuesioner = "KP" | "M";

interface RuleRingkas {
  id: number;
  rule_id: number | null;
  field: string;
  halaman: number | null;
  level: string | null;
  is_fatal: boolean | null;
}

interface RuleDetail extends RuleRingkas {
  message: string | null;
  perlakuan: string | null;
}

const NAMA_PPL_KEY = "seruti-nama-ppl";

function levelBadgeClass(level: string | null): string {
  switch (level) {
    case "RT":
      return "bg-navy-700 text-white";
    case "ART":
      return "bg-rust-500 text-white";
    case "ARTB5A":
    case "ARTB5B":
      return "bg-gold-600 text-white";
    case "BALITA":
      return "bg-moss-500 text-white";
    default:
      return "bg-navy-400 text-white";
  }
}

// Pecah "<kondisi> tapi <masalah>" jadi dua bagian yang lebih gampang dibaca.
// Kalau polanya tidak ketemu (sebagian kecil baris memang bukan kalimat
// "if...but"), tampilkan apa adanya — tidak dipaksakan.
function pisahPesan(message: string | null): { kondisi: string; masalah: string } | null {
  if (!message) return null;
  const idx = message.toLowerCase().lastIndexOf(" tapi ");
  if (idx === -1) return null;
  const kondisi = message.slice(0, idx).trim();
  const masalah = message.slice(idx + 6).trim();
  if (!kondisi || !masalah) return null;
  return { kondisi, masalah };
}

export default function ErrorKonsistensiTab() {
  const [supabase] = useState(() => createClient());

  // ---------- identitas PPL (dipakai utk menyimpan status "sudah dibaca") ----------
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

  const [kuesioner, setKuesioner] = useState<Kuesioner>("KP");
  const [ringkas, setRingkas] = useState<RuleRingkas[]>([]);
  const [loadingRingkas, setLoadingRingkas] = useState(false);
  const [dibacaSet, setDibacaSet] = useState<Set<number>>(new Set());

  const [search, setSearch] = useState("");
  const [hanyaBelumDibaca, setHanyaBelumDibaca] = useState(false);

  const [openHalaman, setOpenHalaman] = useState<Set<number>>(new Set());
  const [detailByHalaman, setDetailByHalaman] = useState<Map<number, RuleDetail[]>>(new Map());
  const [loadingHalaman, setLoadingHalaman] = useState<Set<number>>(new Set());
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

  const [searchResults, setSearchResults] = useState<RuleDetail[] | null>(null);
  const [searching, setSearching] = useState(false);

  // ---------- muat daftar ringkas (kolom kecil saja) utk kuesioner terpilih ----------
  const loadRingkas = useCallback(async () => {
    setLoadingRingkas(true);
    const { data } = await supabase
      .from("kp_konsistensi_rules")
      .select("id, rule_id, field, halaman, level, is_fatal")
      .eq("kuesioner", kuesioner)
      .order("halaman", { ascending: true })
      .order("rule_id", { ascending: true })
      .range(0, 4999);
    setRingkas((data ?? []) as RuleRingkas[]);
    setDetailByHalaman(new Map());
    setOpenHalaman(new Set());
    setOpenCards(new Set());
    setLoadingRingkas(false);
  }, [supabase, kuesioner]);

  useEffect(() => {
    loadRingkas();
  }, [loadRingkas]);

  // ---------- muat status "sudah dibaca" milik PPL ybs (debounce ketikan nama) ----------
  const loadDibaca = useCallback(async () => {
    const nama = namaPpl.trim();
    if (!nama) {
      setDibacaSet(new Set());
      return;
    }
    const { data } = await supabase
      .from("kp_konsistensi_dibaca")
      .select("rule_id")
      .eq("nama_ppl", nama)
      .range(0, 9999);
    setDibacaSet(new Set((data ?? []).map((r) => r.rule_id as number)));
  }, [supabase, namaPpl]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadDibaca();
    }, 400);
    return () => clearTimeout(t);
  }, [loadDibaca]);

  // ---------- pencarian (aktif kalau input >= 2 karakter) ----------
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      let query = supabase
        .from("kp_konsistensi_rules")
        .select("id, rule_id, field, halaman, level, is_fatal, message, perlakuan")
        .eq("kuesioner", kuesioner)
        .order("halaman", { ascending: true })
        .limit(200);
      query = /^\d+$/.test(q)
        ? query.or(`rule_id.eq.${q},field.ilike.%${q}%,message.ilike.%${q}%`)
        : query.or(`field.ilike.%${q}%,message.ilike.%${q}%`);
      const { data } = await query;
      setSearchResults((data ?? []) as RuleDetail[]);
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search, kuesioner, supabase]);

  async function toggleHalaman(h: number) {
    setOpenHalaman((prev) => {
      const n = new Set(prev);
      if (n.has(h)) n.delete(h);
      else n.add(h);
      return n;
    });
    if (!detailByHalaman.has(h)) {
      setLoadingHalaman((prev) => new Set(prev).add(h));
      const { data } = await supabase
        .from("kp_konsistensi_rules")
        .select("id, rule_id, field, halaman, level, is_fatal, message, perlakuan")
        .eq("kuesioner", kuesioner)
        .eq("halaman", h)
        .order("rule_id", { ascending: true });
      setDetailByHalaman((prev) => new Map(prev).set(h, (data ?? []) as RuleDetail[]));
      setLoadingHalaman((prev) => {
        const n = new Set(prev);
        n.delete(h);
        return n;
      });
    }
  }

  function toggleCard(id: number) {
    setOpenCards((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function toggleDibaca(ruleId: number) {
    const nama = namaPpl.trim();
    if (!nama) return;
    const sudah = dibacaSet.has(ruleId);
    if (sudah) {
      setDibacaSet((prev) => {
        const n = new Set(prev);
        n.delete(ruleId);
        return n;
      });
      await supabase.from("kp_konsistensi_dibaca").delete().eq("rule_id", ruleId).eq("nama_ppl", nama);
    } else {
      setDibacaSet((prev) => new Set(prev).add(ruleId));
      await supabase
        .from("kp_konsistensi_dibaca")
        .upsert({ rule_id: ruleId, nama_ppl: nama }, { onConflict: "rule_id,nama_ppl", ignoreDuplicates: true });
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<number, RuleRingkas[]>();
    for (const r of ringkas) {
      const h = r.halaman ?? 0;
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [ringkas]);

  const totalRules = ringkas.length;
  const sudahDibacaCount = ringkas.filter((r) => dibacaSet.has(r.id)).length;
  const persen = totalRules > 0 ? Math.round((sudahDibacaCount / totalRules) * 100) : 0;

  const groupedTampil = grouped.filter(([, list]) => !hanyaBelumDibaca || list.some((r) => !dibacaSet.has(r.id)));
  const sedangCari = search.trim().length >= 2;

  return (
    <div className="space-y-3 pb-6">
      {/* ---------- Header ---------- */}
      <div>
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Error Konsistensi &ndash; Belajar Aturan Validasi</h1>
        <p className="mt-0.5 text-xs text-ink/60 sm:text-sm">
          Katalog resmi &plusmn;4.357 aturan konsistensi kuesioner VSEN26 (Kor &amp; Modul), diambil langsung dari
          aplikasi BPS Pusat. Bukan alat cek otomatis — jelajah/cari lalu tandai yang sudah Anda pelajari.
        </p>
      </div>

      {/* ---------- Kontrol ---------- */}
      <div className="space-y-2 rounded-lg border border-line bg-white p-3">
        <div>
          <label className="text-xs font-semibold text-navy-900">Nama Anda (PPL)</label>
          <input
            type="text"
            placeholder="Isi nama supaya progres belajar Anda tersimpan"
            value={namaPpl}
            onChange={(e) => updateNamaPpl(e.target.value)}
            className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-navy-900">Kuesioner</label>
            <select
              value={kuesioner}
              onChange={(e) => setKuesioner(e.target.value as Kuesioner)}
              className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-sm"
            >
              <option value="KP">VSEN26.KP (Kor + Modul)</option>
              <option value="M">VSEN26.M (Kor)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-navy-900">Cari</label>
            <input
              type="text"
              placeholder="Kode field / kata kunci..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 w-full rounded-md border border-line px-2.5 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            />
          </div>
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
      </div>

      {!namaPpl.trim() && (
        <p className="rounded-lg border border-gold-400/60 bg-gold-100 p-3 text-xs text-gold-600">
          &#9888; Isi nama Anda dulu di atas supaya tombol &quot;Sudah Dibaca&quot; bisa dipakai dan progres belajar
          Anda tersimpan.
        </p>
      )}

      {/* ---------- Ringkasan progres ---------- */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <SummaryBox label="Total Aturan" value={totalRules} className="bg-navy-50 text-navy-900" />
        <SummaryBox label="Sudah Dibaca" value={sudahDibacaCount} className="bg-moss-100 text-moss-700" />
        <SummaryBox label="Progres" value={`${persen}%`} className="bg-gold-100 text-gold-600" />
      </div>

      {loadingRingkas ? (
        <p className="py-6 text-center text-sm text-ink/40">Memuat daftar aturan...</p>
      ) : sedangCari ? (
        <div className="space-y-2">
          {searching ? (
            <p className="py-6 text-center text-sm text-ink/40">Mencari...</p>
          ) : !searchResults || searchResults.length === 0 ? (
            <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-ink/50">
              Tidak ada aturan yang cocok dengan pencarian &quot;{search}&quot;.
            </p>
          ) : (
            searchResults
              .filter((r) => !hanyaBelumDibaca || !dibacaSet.has(r.id))
              .map((r) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  isOpen={openCards.has(r.id)}
                  onToggle={() => toggleCard(r.id)}
                  sudahDibaca={dibacaSet.has(r.id)}
                  onToggleDibaca={() => toggleDibaca(r.id)}
                  disabledDibaca={!namaPpl.trim()}
                />
              ))
          )}
        </div>
      ) : groupedTampil.length === 0 ? (
        <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-ink/50">
          &#127881; Semua aturan untuk kuesioner ini sudah Anda baca.
        </p>
      ) : (
        groupedTampil.map(([h, list]) => {
          const total = list.length;
          const sudah = list.filter((r) => dibacaSet.has(r.id)).length;
          const isOpen = openHalaman.has(h);
          const detail = detailByHalaman.get(h);
          const isLoadingThis = loadingHalaman.has(h);
          const visibleDetail = detail ? (hanyaBelumDibaca ? detail.filter((r) => !dibacaSet.has(r.id)) : detail) : [];
          return (
            <div key={h} className="overflow-hidden rounded-lg border border-line bg-white">
              <button
                onClick={() => toggleHalaman(h)}
                className="flex w-full items-center justify-between gap-2 bg-navy-50 px-3 py-2.5 text-left"
              >
                <span className="text-xs font-bold uppercase tracking-wide text-navy-900 sm:text-sm">
                  Halaman {h || "-"} <span className="font-normal text-navy-400">({sudah}/{total} dibaca)</span>
                </span>
                <Chevron open={isOpen} />
              </button>
              {isOpen && (
                <div className="space-y-2 p-2">
                  {isLoadingThis ? (
                    <p className="py-3 text-center text-xs text-ink/40">Memuat...</p>
                  ) : visibleDetail.length === 0 ? (
                    <p className="py-3 text-center text-xs text-ink/50">
                      {hanyaBelumDibaca ? "Semua aturan di halaman ini sudah dibaca. \u{1F389}" : "Tidak ada aturan."}
                    </p>
                  ) : (
                    visibleDetail.map((r) => (
                      <RuleCard
                        key={r.id}
                        rule={r}
                        isOpen={openCards.has(r.id)}
                        onToggle={() => toggleCard(r.id)}
                        sudahDibaca={dibacaSet.has(r.id)}
                        onToggleDibaca={() => toggleDibaca(r.id)}
                        disabledDibaca={!namaPpl.trim()}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
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

function RuleCard({
  rule,
  isOpen,
  onToggle,
  sudahDibaca,
  onToggleDibaca,
  disabledDibaca,
}: {
  rule: RuleDetail;
  isOpen: boolean;
  onToggle: () => void;
  sudahDibaca: boolean;
  onToggleDibaca: () => void;
  disabledDibaca: boolean;
}) {
  const pisah = pisahPesan(rule.message);
  return (
    <div className={`overflow-hidden rounded-lg border ${sudahDibaca ? "border-moss-500/40" : "border-line"}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-2.5 bg-white p-3 text-left">
        <span className={`mt-0.5 shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${levelBadgeClass(rule.level)}`}>
          {rule.field}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-ink/50">
              Hal. {rule.halaman ?? "-"} &middot; No. {rule.rule_id ?? rule.id}
              {rule.level ? ` · ${rule.level}` : ""}
              {rule.is_fatal === false && <span className="ml-1 text-gold-600">(fleksibel)</span>}
            </p>
            {sudahDibaca && (
              <span className="shrink-0 rounded-full bg-moss-100 px-2 py-0.5 text-[10px] font-semibold text-moss-700">
                &#10003; Dibaca
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-ink/80 sm:text-sm">{pisah ? pisah.masalah : rule.message}</p>
        </div>
        <Chevron open={isOpen} />
      </button>

      {isOpen && (
        <div className="space-y-3 border-t border-line bg-paper/30 p-3">
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
              <p className="text-xs leading-relaxed text-ink/80 sm:text-sm">{rule.message}</p>
            </div>
          )}

          {rule.perlakuan && (
            <div className="flex gap-2 rounded-md border border-navy-100 bg-navy-50 p-2.5">
              <span className="mt-0.5 shrink-0 text-navy-700">&#128214;</span>
              <div>
                <p className="text-xs font-bold text-navy-900">Perlakuan</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/80 sm:text-sm">{rule.perlakuan}</p>
              </div>
            </div>
          )}

          <button
            disabled={disabledDibaca}
            onClick={onToggleDibaca}
            className={`w-full rounded-md py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              sudahDibaca
                ? "border border-moss-500 bg-moss-100 text-moss-700 hover:bg-moss-100/70"
                : "bg-navy-700 text-white hover:bg-navy-900"
            }`}
          >
            {sudahDibaca ? "✓ Sudah Dibaca — klik utk batalkan" : "✓ Tandai Sudah Dibaca"}
          </button>
        </div>
      )}
    </div>
  );
}
