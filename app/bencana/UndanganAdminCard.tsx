"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ------------------------------------------------------------------------
// (4 Okt 2026) Kartu admin "Undangan Konfirmasi" di tab Alokasi Petugas.
// Sisi publik: /undangan (1 link utk WA grup, verifikasi nama + NIK +
// email + tanggal lahir). API: /api/bencana/alokasi/undangan.
//
// 3 bagian:
//   1. Monitoring undangan  -- sudah dibaca/belum, WA pribadi (tier 2), buka kunci,
//      tolak manual (>= 24 jam sejak dibaca & belum menjawab).
//   2. Domisili jauh        -- threshold jarak manual otomatis memfilter PPL yg sudah
//      diplot; kartu hijau = bersedia menginap, merah = menolak.
//   3. Plot kosong karena penolakan -- + usulan cadangan & tombol lihat baris.
// ------------------------------------------------------------------------

type Tawaran = {
  kandidat_id: number;
  tawaran_id: number;
  status: "bersedia" | "tidak_bersedia" | null;
  catatan: string | null;
  dijawab_pada: string | null;
  dibuat_pada: string;
  pola_menginap: string | null;
  jadwal_pelatihan: string | null; // teks, mis. "7 Oktober 2026, 8 Oktober 2026"
  perkiraan_hari_libur: string[] | null;
  teman_menginap: string | null;
  alasan_kategori: string | null;
  bersedia_pulang_pergi: boolean | null;
  kecamatan: string | null;
  nagari: string | null;
};

type Baris = {
  id: number;
  nama: string;
  no_hp: string | null;
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
  alamat_detail?: string | null;
  status_kontak: "diterima" | "menolak" | null;
  sudah_konfirmasi: boolean;
  catatan_menolak: string | null;
  dijawab_at: string | null;
  jadwal_reguler: string | null;
  peran: "ppl" | "pml";
  jumlah_ppl: number;
  jumlah_plot: number;
  // (5 Okt 2026) PPL anggota tim yg tidak memegang Sub SLS (non-plot).
  non_plot?: boolean;
  jarak_maks_km: number | null;
  jarak_semua_riil: boolean;
  idsubsls_terjauh: string | null;
  kecamatan_terjauh: string | null;
  nagari_terjauh: string | null;
  dibaca_at: string | null;
  terakhir_masuk_at: string | null;
  wa_pribadi_at: string | null;
  wa_pribadi_jumlah: number;
  akun_dibuat_at: string | null;
  grup_wa_at: string | null; // waktu ditandai sudah masuk grup WA
  terkunci: boolean;
  tawaran: Tawaran | null;
};

type Cadangan = { id: number; nama: string; no_hp: string | null; nagari: string | null; kecamatan: string | null; nilai_kinerja: number | null; kedekatan: string };

type Status = "belum_dibuka" | "dibaca" | "bersedia" | "pulang_pergi" | "menolak";

const JAM_TOLAK = 24;
// Alamat resmi link undangan (tetap, tidak bergantung alamat tempat admin membuka halaman).
const URL_UNDANGAN = "https://bps-solokkab.up.railway.app/undangan";

function statusBaris(r: Baris): Status {
  if (r.tawaran) {
    if (r.tawaran.status === "bersedia") return "bersedia";
    if (r.tawaran.status === "tidak_bersedia") return r.tawaran.bersedia_pulang_pergi === true ? "pulang_pergi" : "menolak";
  } else {
    if (r.status_kontak === "menolak") return "menolak";
    if (r.status_kontak === "diterima") return "bersedia";
  }
  return r.dibaca_at ? "dibaca" : "belum_dibuka";
}

function jamSejak(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function waktuRingkas(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

// Alamat domisili petugas: detail (jika ada), Nagari, Kecamatan.
function alamatLengkap(r: Baris): string {
  const detail = r.alamat_detail?.trim();
  const nagari = r.alamat_nagari?.trim();
  const kec = r.alamat_kecamatan?.trim();
  return [detail, nagari ? `Nagari ${nagari}` : null, kec ? `Kec. ${kec}` : null].filter(Boolean).join(", ");
}

function nomorWa(hp: string | null): string | null {
  if (!hp) return null;
  let d = hp.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d.length >= 9 ? d : null;
}

const BADGE: Record<Status, { label: string; kelas: string }> = {
  belum_dibuka: { label: "Belum dibuka", kelas: "bg-slate-100 text-slate-700" },
  dibaca: { label: "Sudah dibaca", kelas: "bg-amber-100 text-amber-800" },
  bersedia: { label: "Bersedia", kelas: "bg-emerald-100 text-emerald-800" },
  pulang_pergi: { label: "Pulang-pergi", kelas: "bg-amber-100 text-amber-800" },
  menolak: { label: "Menolak", kelas: "bg-red-100 text-red-800" },
};

function DetailJawaban({ t }: { t: Tawaran }) {
  if (!t.status) return null;
  const tgl = (a: string[] | null) =>
    Array.isArray(a) && a.length ? a.map((x) => String(x).slice(8, 10) || String(x)).join(", ") : "-";
  if (t.status === "bersedia") {
    return (
      <div className="mt-1 space-y-0.5 text-[11px] text-slate-700">
        <p>Pola: {t.pola_menginap === "penuh" ? "menginap penuh selama pendataan" : t.pola_menginap === "pulang_akhir_pekan" ? "pulang saat akhir pekan" : (t.pola_menginap ?? "-")}</p>
        <p>Pelatihan: {t.jadwal_pelatihan ? String(t.jadwal_pelatihan) : "-"} · Perkiraan libur (tgl Okt): {tgl(t.perkiraan_hari_libur)}</p>
        {t.teman_menginap && <p>Teman menginap: {t.teman_menginap}</p>}
      </div>
    );
  }
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-slate-700">
      <p>
        Tidak bersedia menginap{t.alasan_kategori ? ` (${t.alasan_kategori})` : ""} ·{" "}
        {t.bersedia_pulang_pergi === true ? "tetap bersedia pulang-pergi" : t.bersedia_pulang_pergi === false ? "tidak bersedia pulang-pergi" : "pulang-pergi: -"}
      </p>
    </div>
  );
}

export default function UndanganAdminCard({
  onLihatBaris,
  onBerubah,
}: {
  onLihatBaris?: (pplId: number) => void;
  onBerubah?: () => void;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [bagian, setBagian] = useState<"monitor" | "jawaban" | "jauh" | "kosong">("monitor");
  const [rows, setRows] = useState<Baris[] | null>(null);
  const [cadangan, setCadangan] = useState<Record<number, Cadangan[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "semua">("semua");
  const [filterGrup, setFilterGrup] = useState<"semua" | "sudah" | "belum">("semua");
  const [hanyaNonPlot, setHanyaNonPlot] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [dipilih, setDipilih] = useState<Set<number>>(new Set());
  const [buatBusy, setBuatBusy] = useState(false);

  const muat = useCallback(async () => {
    try {
      const res = await fetch("/api/bencana/alokasi/undangan", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat data undangan.");
      setRows(json.data ?? []);
      setCadangan(json.cadangan ?? {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data undangan.");
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  async function kirim(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch("/api/bencana/alokasi/undangan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Aksi gagal.");
      return false;
    }
    return true;
  }

  async function aksiPetugas(aksi: "buka_kunci" | "tolak", r: Baris) {
    if (aksi === "tolak" && !window.confirm(`Tandai ${r.nama} MENOLAK? Plotnya akan ditandai kosong karena penolakan.`)) return;
    setBusyId(r.id);
    setError(null);
    setInfo(null);
    if (await kirim({ aksi, petugas_id: r.id })) {
      await muat();
      if (aksi === "tolak") onBerubah?.();
    }
    setBusyId(null);
  }

  async function tandaiGrupWa(r: Baris, bergabung: boolean) {
    setBusyId(r.id);
    setError(null);
    setInfo(null);
    if (await kirim({ aksi: "grup_wa", petugas_id: r.id, bergabung })) await muat();
    setBusyId(null);
  }

  async function kirimWaPribadi(r: Baris) {
    const no = nomorWa(r.no_hp);
    if (!no) {
      setError(`${r.nama}: nomor HP belum ada / tidak valid.`);
      return;
    }
    const link = URL_UNDANGAN;
    const menginap = !!r.tawaran;
    const teks = menginap
      ? `Halo ${r.nama}, dari BPS Kabupaten Solok. Ada tawaran pendataan bencana dengan skema menginap untuk Anda. Silakan buka ${link}, isi nama, NIK, email, dan tanggal lahir untuk membuka tawarannya. Terima kasih.`
      : `Halo ${r.nama}, dari BPS Kabupaten Solok. Mohon konfirmasi kesediaan Anda sebagai petugas pendataan bencana lewat ${link}. Isi nama, NIK, email, dan tanggal lahir untuk membuka undangan. Terima kasih.`;
    window.open(`https://wa.me/${no}?text=${encodeURIComponent(teks)}`, "_blank", "noopener,noreferrer");
    setBusyId(r.id);
    if (await kirim({ aksi: "wa_pribadi", petugas_id: r.id })) await muat();
    setBusyId(null);
  }

  async function salinLinkUndangan() {
    const link = URL_UNDANGAN;
    try {
      await navigator.clipboard.writeText(link);
      setInfo("Link undangan tersalin. Tempel di WA grup.");
    } catch {
      window.prompt("Salin manual link ini:", link);
    }
  }

  async function buatTawaran() {
    if (dipilih.size === 0) return;
    setBuatBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/bencana/alokasi/undangan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "buat_tawaran_jauh", petugas_ids: Array.from(dipilih) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal membuat tawaran.");
      setInfo(
        `${json.petugas_ditawari} petugas ditawari (${json.tawaran_dibuat} tawaran per nagari).` +
          (json.dilewati > 0 ? ` ${json.dilewati} dilewati (sudah ditawari / jarak belum ada).` : "")
      );
      setDipilih(new Set());
      await muat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat tawaran.");
    } finally {
      setBuatBusy(false);
    }
  }

  // (5 Okt 2026) PPL yg menolak tetap dipantau di sini walau sudah keluar tim & tanpa plot.
  const semua = useMemo(
    () => (rows ?? []).filter((r) => r.jumlah_plot > 0 || r.tawaran || r.peran === "pml" || r.non_plot || r.status_kontak === "menolak"),
    [rows]
  );
  const jmlNonPlot = useMemo(() => semua.filter((r) => r.non_plot).length, [semua]);
  const hitung = useMemo(() => {
    const h: Record<Status, number> = { belum_dibuka: 0, dibaca: 0, bersedia: 0, pulang_pergi: 0, menolak: 0 };
    for (const r of semua) h[statusBaris(r)]++;
    return h;
  }, [semua]);
  const jmlGrup = useMemo(() => semua.filter((r) => !!r.grup_wa_at).length, [semua]);
  const tampil = useMemo(
    () =>
      semua
        .filter((r) => filter === "semua" || statusBaris(r) === filter)
        .filter((r) => filterGrup === "semua" || (filterGrup === "sudah" ? !!r.grup_wa_at : !r.grup_wa_at))
        .filter((r) => !hanyaNonPlot || !!r.non_plot)
        .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [semua, filter, filterGrup, hanyaNonPlot]
  );
  const jauh = useMemo(
    () =>
      semua
        .filter((r) => r.jumlah_plot > 0 && r.jarak_maks_km != null && r.jarak_maks_km >= threshold)
        .sort((a, b) => (b.jarak_maks_km ?? 0) - (a.jarak_maks_km ?? 0)),
    [semua, threshold]
  );
  const belumDitawari = jauh.filter((r) => !r.tawaran);
  // Monitoring persetujuan & penolakan: dipisah per jawaban, terbaru di atas.
  const urutTerbaru = (a: Baris, b: Baris) => (b.dijawab_at ?? "").localeCompare(a.dijawab_at ?? "");
  const menyetujui = useMemo(() => semua.filter((r) => statusBaris(r) === "bersedia").sort(urutTerbaru), [semua]); // eslint-disable-line react-hooks/exhaustive-deps
  const menolakList = useMemo(
    () => semua.filter((r) => statusBaris(r) === "menolak" || statusBaris(r) === "pulang_pergi").sort(urutTerbaru),
    [semua] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const jenisLabel = (r: Baris) => (r.tawaran ? "Tawaran menginap" : r.peran === "pml" ? "PML" : "PPL reguler");
  const kosong = useMemo(() => semua.filter((r) => r.jumlah_plot > 0 && statusBaris(r) === "menolak"), [semua]);

  function toggle(id: number) {
    setDipilih((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function Aksi({ r }: { r: Baris }) {
    const st = statusBaris(r);
    const jam = jamSejak(r.dibaca_at);
    const bisaTolak = st === "dibaca" && jam != null && jam >= JAM_TOLAK;
    const busy = busyId === r.id;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {(st === "belum_dibuka" || st === "dibaca") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => kirimWaPribadi(r)}
            className={`rounded border px-2 py-1 text-[11px] font-medium disabled:opacity-50 ${
              st === "belum_dibuka" ? "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            💬 {r.wa_pribadi_jumlah > 0 ? "Kirim WA pribadi lagi" : "Kirim WA pribadi"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => tandaiGrupWa(r, !r.grup_wa_at)}
          title={r.grup_wa_at ? "Batalkan tanda sudah masuk grup WA" : "Tandai sudah masuk grup WA (cek di daftar anggota grup)"}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {r.grup_wa_at ? "↩ Batalkan tanda grup WA" : "✓ Tandai sudah masuk grup WA"}
        </button>
        {r.terkunci && (
          <button
            type="button"
            disabled={busy}
            onClick={() => aksiPetugas("buka_kunci", r)}
            className="rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            🔓 Buka kunci
          </button>
        )}
        {st === "dibaca" && (
          <button
            type="button"
            disabled={busy || !bisaTolak}
            onClick={() => aksiPetugas("tolak", r)}
            title={bisaTolak ? "Tandai menolak" : `Aktif setelah ${JAM_TOLAK} jam sejak dibaca`}
            className="rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✕ Tolak
          </button>
        )}
      </div>
    );
  }

  function Keterangan({ r }: { r: Baris }) {
    return (
      <p className="mt-1 text-[11px] text-slate-600">
        {r.dibaca_at ? `Dibaca ${waktuRingkas(r.dibaca_at)}` : "Belum membuka undangan"}
        {r.wa_pribadi_jumlah > 0 && ` · WA pribadi ${r.wa_pribadi_jumlah}x (terakhir ${waktuRingkas(r.wa_pribadi_at)})`}
        {r.akun_dibuat_at && ` · akun dibuat ${waktuRingkas(r.akun_dibuat_at)}`}
        {r.grup_wa_at && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">✓ Sudah masuk grup WA</span>}
        {r.terkunci && " · TERKUNCI (salah berulang)"}
        {!r.no_hp && " · nomor HP kosong"}
      </p>
    );
  }

  const bagianBtn = (k: typeof bagian, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setBagian(k)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium ${bagian === k ? "bg-blue-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {label} ({n})
    </button>
  );

  return (
    <section className="rounded-md border border-indigo-200 bg-white p-4">
      <button type="button" onClick={() => setTerbuka((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <div>
          <h2 className="font-medium text-blue-950">✉️ Undangan Konfirmasi (Link WA Grup)</h2>
          <p className="mt-1 text-xs text-ink/60">
            1 link undangan utk WA grup: petugas verifikasi nama, NIK, email &amp; tanggal lahir, lalu konfirmasi dan buat akun. Pantau siapa yang sudah membaca,
            kirim WA pribadi bagi yang belum, dan tawarkan menginap ke PPL berdomisili jauh.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {hitung.belum_dibuka > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{hitung.belum_dibuka} belum dibuka</span>}
          <span className="text-slate-400">{terbuka ? "▾" : "▸"}</span>
        </span>
      </button>

      {terbuka && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={salinLinkUndangan} className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100">
              📋 Salin Link Undangan
            </button>
            <button type="button" onClick={muat} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              ↻ Muat ulang
            </button>
            <span className="text-[11px] text-slate-500">Link sama untuk semua petugas; tidak memuat data pribadi.</span>
          </div>

          {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          {info && <p className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{info}</p>}
          {rows === null && !error && <p className="text-xs text-slate-500">Memuat…</p>}

          {rows !== null && (
            <>
              <div className="flex flex-wrap gap-2">
                {bagianBtn("monitor", "Monitoring", semua.length)}
                {bagianBtn("jawaban", "Persetujuan & penolakan", menyetujui.length + menolakList.length)}
                {bagianBtn("jauh", "Domisili jauh", jauh.length)}
                {bagianBtn("kosong", "Plot kosong karena penolakan", kosong.length)}
              </div>

              {bagian === "monitor" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(["semua", "belum_dibuka", "dibaca", "bersedia", "pulang_pergi", "menolak"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-blue-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        {f === "semua" ? `Semua (${semua.length})` : `${BADGE[f].label} (${hitung[f]})`}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-500">Grup WA:</span>
                    {(["semua", "sudah", "belum"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setFilterGrup(g)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${filterGrup === g ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        {g === "semua" ? "Semua" : g === "sudah" ? `Sudah masuk (${jmlGrup})` : `Belum masuk (${semua.length - jmlGrup})`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setHanyaNonPlot((v) => !v)}
                      title="PPL anggota tim yang tidak memegang Sub SLS (non-plot)"
                      className={`ml-2 rounded-full px-3 py-1 text-xs font-medium ${hanyaNonPlot ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}
                    >
                      PPL non-plot ({jmlNonPlot})
                    </button>
                  </div>
                  <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                    {tampil.length === 0 && <p className="text-xs text-slate-500">Tidak ada petugas pada filter ini.</p>}
                    {tampil.map((r) => {
                      const st = statusBaris(r);
                      return (
                        <div key={r.id} className="rounded-md border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-blue-950">{r.nama}</span>
                              <span
                                className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  r.peran === "pml" ? "bg-purple-100 text-purple-800" : "bg-sky-100 text-sky-800"
                                }`}
                              >
                                {r.peran === "pml" ? "PML" : "PPL"}
                              </span>
                              {r.non_plot && (
                                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title="Anggota tim, tidak memegang Sub SLS">
                                  NON-PLOT
                                </span>
                              )}
                              <span className="ml-2 text-[11px] text-slate-500">{r.tawaran ? "tawaran menginap" : r.peran === "pml" ? `konfirmasi PML (${r.jumlah_ppl} PPL)` : r.non_plot ? "anggota tim tanpa plot" : "konfirmasi biasa"}</span>
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${BADGE[st].kelas}`}>{BADGE[st].label}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600">
                            📍 {alamatLengkap(r) || <span className="italic text-slate-400">Alamat belum diisi</span>}
                          </p>
                          <Keterangan r={r} />
                          {r.tawaran && <DetailJawaban t={r.tawaran} />}
                          <div className="mt-2">
                            <Aksi r={r} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {bagian === "jawaban" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(
                      [
                        ["Diundang", semua.length, "bg-slate-50 text-slate-800"],
                        ["Bersedia", hitung.bersedia, "bg-emerald-50 text-emerald-800"],
                        ["Pulang-pergi", hitung.pulang_pergi, "bg-amber-50 text-amber-800"],
                        ["Menolak", hitung.menolak, "bg-red-50 text-red-800"],
                        ["Belum menjawab", hitung.belum_dibuka + hitung.dibaca, "bg-slate-50 text-slate-800"],
                      ] as [string, number, string][]
                    ).map(([label, n, kelas]) => (
                      <div key={label} className={`rounded-md border border-slate-200 px-3 py-2 ${kelas}`}>
                        <div className="text-[11px] font-medium">{label}</div>
                        <div className="text-lg font-bold">{n}</div>
                        {label !== "Diundang" && semua.length > 0 && <div className="text-[11px] opacity-75">{Math.round((n / semua.length) * 100)}%</div>}
                      </div>
                    ))}
                  </div>
                  {semua.length > 0 && (
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" title="Bersedia / pulang-pergi / menolak / belum menjawab">
                      <div className="bg-emerald-500" style={{ width: `${(hitung.bersedia / semua.length) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(hitung.pulang_pergi / semua.length) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(hitung.menolak / semua.length) * 100}%` }} />
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Rincian jenis undangan: {(["PPL reguler", "Tawaran menginap", "PML"] as const).map((j) => {
                      const sub = semua.filter((r) => jenisLabel(r) === j);
                      const ya = sub.filter((r) => statusBaris(r) === "bersedia").length;
                      const tdk = sub.filter((r) => statusBaris(r) === "menolak" || statusBaris(r) === "pulang_pergi").length;
                      return `${j}: ${sub.length} (bersedia ${ya}, menolak ${tdk})`;
                    }).join(" · ")}
                  </p>

                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-emerald-800">Menyetujui ({menyetujui.length})</h3>
                    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {menyetujui.length === 0 && <p className="text-xs text-slate-500">Belum ada yang menyetujui.</p>}
                      {menyetujui.map((r) => (
                        <div key={r.id} className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-blue-950">{r.nama}</span>
                            <span className="text-[11px] text-slate-600">
                              {jenisLabel(r)} · {r.dijawab_at ? waktuRingkas(r.dijawab_at) : "-"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            Pelatihan: {(r.tawaran?.jadwal_pelatihan ?? r.jadwal_reguler) || "-"}
                            {r.tawaran?.pola_menginap && ` · ${r.tawaran.pola_menginap === "penuh" ? "menginap penuh" : "pulang saat akhir pekan"}`}
                            {r.akun_dibuat_at ? " · akun sudah dibuat" : " · belum buat PIN"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-red-800">Menolak ({menolakList.length})</h3>
                    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {menolakList.length === 0 && <p className="text-xs text-slate-500">Belum ada yang menolak.</p>}
                      {menolakList.map((r) => {
                        const ppDia = statusBaris(r) === "pulang_pergi";
                        return (
                          <div key={r.id} className={`rounded-md border px-3 py-2 ${ppDia ? "border-amber-200 bg-amber-50/60" : "border-red-200 bg-red-50/60"}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium text-blue-950">{r.nama}</span>
                              <span className="text-[11px] text-slate-600">
                                {jenisLabel(r)} · {r.dijawab_at ? waktuRingkas(r.dijawab_at) : "-"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-700">
                              {ppDia ? "Tidak menginap, tetap bersedia pulang-pergi" : "Tidak bersedia"}
                              {r.tawaran?.alasan_kategori ? ` · kategori: ${r.tawaran.alasan_kategori}` : ""}
                            </p>
                            <p className="text-[11px] text-slate-600">Alasan: {r.tawaran?.catatan ?? r.catatan_menolak ?? "-"}</p>
                            {r.jumlah_plot > 0 && !ppDia && (
                              <p className="mt-0.5 text-[11px] font-medium text-red-700">
                                Masih memegang {r.jumlah_plot} Sub SLS: perlu diganti.{" "}
                                <button type="button" onClick={() => onLihatBaris?.(r.id)} className="underline">
                                  Lihat baris
                                </button>
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {bagian === "jauh" && (
                <div className="space-y-3">
                  <div className="rounded-md bg-slate-50 p-3">
                    <label className="text-xs font-medium text-slate-700">
                      Tampilkan PPL yang jarak rumah ke Sub SLS terjauhnya ≥{" "}
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={threshold}
                        onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))}
                        className="mx-1 w-16 rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                      km
                    </label>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {[5, 8, 10, 15].map((t) => (
                        <button key={t} type="button" onClick={() => setThreshold(t)} className={`rounded-full px-2.5 py-0.5 text-[11px] ${threshold === t ? "bg-blue-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>
                          {t} km
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Jarak memakai data Langkah 4 (rute jalan bila ada, selain itu perkiraan). Tanda ≈ berarti sebagian jarak masih perkiraan.
                    </p>
                  </div>

                  {belumDitawari.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDipilih(new Set(belumDitawari.map((r) => r.id)))}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Pilih semua yang belum ditawari ({belumDitawari.length})
                      </button>
                      <button
                        type="button"
                        disabled={dipilih.size === 0 || buatBusy}
                        onClick={buatTawaran}
                        className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                      >
                        {buatBusy ? "Membuat…" : `🏕️ Tawarkan menginap (${dipilih.size})`}
                      </button>
                    </div>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    {jauh.length === 0 && <p className="text-xs text-slate-500">Tidak ada PPL yang melewati threshold ini.</p>}
                    {jauh.map((r) => {
                      const st = r.tawaran ? statusBaris(r) : null;
                      const warna =
                        st === "bersedia"
                          ? "border-emerald-400 bg-emerald-50"
                          : st === "pulang_pergi"
                          ? "border-amber-400 bg-amber-50"
                          : st === "menolak"
                          ? "border-red-400 bg-red-50"
                          : st === "dibaca"
                          ? "border-amber-300 bg-amber-50"
                          : "border-slate-200 bg-white";
                      return (
                        <div key={r.id} className={`rounded-md border-2 p-3 ${warna}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {!r.tawaran && <input type="checkbox" checked={dipilih.has(r.id)} onChange={() => toggle(r.id)} />}
                                <span className="text-sm font-medium text-blue-950">{r.nama}</span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-600">
                                {r.jarak_semua_riil ? "" : "≈ "}
                                {r.jarak_maks_km?.toFixed(1)} km ke {r.nagari_terjauh ? `Nagari ${r.nagari_terjauh}` : "wilayah"}, Kec. {r.kecamatan_terjauh ?? "-"} · {r.jumlah_plot} Sub SLS
                              </p>
                              <p className="text-[11px] text-slate-500">Domisili: {[r.alamat_nagari, r.alamat_kecamatan].filter(Boolean).join(", ") || "-"}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${st ? BADGE[st].kelas : "bg-slate-100 text-slate-700"}`}>
                              {st ? (st === "bersedia" ? "Bersedia menginap" : st === "pulang_pergi" ? "Tidak menginap, bersedia pulang-pergi" : st === "menolak" ? "Menolak menginap" : BADGE[st].label) : "Belum ditawari"}
                            </span>
                          </div>
                          {r.tawaran && <Keterangan r={r} />}
                          {r.tawaran && <DetailJawaban t={r.tawaran} />}
                          {r.tawaran?.status === "tidak_bersedia" && r.tawaran.catatan && <p className={`mt-1 text-[11px] ${r.tawaran.bersedia_pulang_pergi ? "text-amber-800" : "text-red-700"}`}>Alasan: {r.tawaran.catatan}</p>}
                          {r.tawaran && (
                            <div className="mt-2">
                              <Aksi r={r} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {bagian === "kosong" && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    Petugas yang menolak tetapi masih tercatat memegang Sub SLS. Lepaskan dan ganti lewat Langkah 4 (tombol 💡 Saran di baris yang kosong), atau pakai usulan cadangan di bawah
                    (tidak mengubah plot otomatis).
                  </p>
                  {kosong.length === 0 && <p className="text-xs text-slate-500">Tidak ada plot kosong karena penolakan.</p>}
                  {kosong.map((r) => (
                    <div key={r.id} className="rounded-md border-2 border-red-300 bg-red-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium text-blue-950">{r.nama}</span>
                          <span className="ml-2 text-[11px] text-slate-600">
                            {r.jumlah_plot} Sub SLS{r.nagari_terjauh ? ` · ${r.nagari_terjauh}, Kec. ${r.kecamatan_terjauh}` : ""}
                          </span>
                        </div>
                        {onLihatBaris && (
                          <button type="button" onClick={() => onLihatBaris(r.id)} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                            Lihat baris di tabel
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-red-800">Alasan: {r.tawaran?.catatan ?? r.catatan_menolak ?? "-"}</p>
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-slate-700">Usulan cadangan:</p>
                        {(cadangan[r.id] ?? []).length === 0 ? (
                          <p className="text-[11px] text-slate-500">Belum ada calon dekat yang belum diplot; gunakan 💡 Saran di Langkah 4.</p>
                        ) : (
                          <ul className="mt-1 space-y-1">
                            {(cadangan[r.id] ?? []).map((c) => (
                              <li key={c.id} className="text-[11px] text-slate-700">
                                <b>{c.nama}</b> · {c.kedekatan}
                                {c.nilai_kinerja != null ? ` · nilai ${c.nilai_kinerja}` : ""}
                                {!c.no_hp ? " · HP kosong" : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
