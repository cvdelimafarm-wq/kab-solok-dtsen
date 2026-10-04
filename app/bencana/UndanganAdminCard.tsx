"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ------------------------------------------------------------------------
// (4 Okt 2026) Kartu admin "Undangan Konfirmasi" di tab Alokasi Petugas.
// Sisi publik: /bencana/undangan (1 link utk WA grup, verifikasi nama + NIK +
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
  kecamatan: string | null;
  nagari: string | null;
};

type Baris = {
  id: number;
  nama: string;
  no_hp: string | null;
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
  status_kontak: "diterima" | "menolak" | null;
  sudah_konfirmasi: boolean;
  catatan_menolak: string | null;
  jumlah_plot: number;
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
  terkunci: boolean;
  tawaran: Tawaran | null;
};

type Cadangan = { id: number; nama: string; no_hp: string | null; nagari: string | null; kecamatan: string | null; nilai_kinerja: number | null; kedekatan: string };

type Status = "belum_dibuka" | "dibaca" | "bersedia" | "menolak";

const JAM_TOLAK = 24;

function statusBaris(r: Baris): Status {
  if (r.tawaran) {
    if (r.tawaran.status === "bersedia") return "bersedia";
    if (r.tawaran.status === "tidak_bersedia") return "menolak";
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
  menolak: { label: "Menolak", kelas: "bg-red-100 text-red-800" },
};

export default function UndanganAdminCard({
  onLihatBaris,
  onBerubah,
}: {
  onLihatBaris?: (pplId: number) => void;
  onBerubah?: () => void;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [bagian, setBagian] = useState<"monitor" | "jauh" | "kosong">("monitor");
  const [rows, setRows] = useState<Baris[] | null>(null);
  const [cadangan, setCadangan] = useState<Record<number, Cadangan[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "semua">("semua");
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

  async function kirimWaPribadi(r: Baris) {
    const no = nomorWa(r.no_hp);
    if (!no) {
      setError(`${r.nama}: nomor HP belum ada / tidak valid.`);
      return;
    }
    const link = `${window.location.origin}/bencana/undangan`;
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
    const link = `${window.location.origin}/bencana/undangan`;
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

  const semua = useMemo(() => (rows ?? []).filter((r) => r.jumlah_plot > 0 || r.tawaran), [rows]);
  const hitung = useMemo(() => {
    const h: Record<Status, number> = { belum_dibuka: 0, dibaca: 0, bersedia: 0, menolak: 0 };
    for (const r of semua) h[statusBaris(r)]++;
    return h;
  }, [semua]);
  const tampil = useMemo(
    () => semua.filter((r) => filter === "semua" || statusBaris(r) === filter).sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [semua, filter]
  );
  const jauh = useMemo(
    () =>
      semua
        .filter((r) => r.jumlah_plot > 0 && r.jarak_maks_km != null && r.jarak_maks_km >= threshold)
        .sort((a, b) => (b.jarak_maks_km ?? 0) - (a.jarak_maks_km ?? 0)),
    [semua, threshold]
  );
  const belumDitawari = jauh.filter((r) => !r.tawaran);
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
                {bagianBtn("jauh", "Domisili jauh", jauh.length)}
                {bagianBtn("kosong", "Plot kosong karena penolakan", kosong.length)}
              </div>

              {bagian === "monitor" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(["semua", "belum_dibuka", "dibaca", "bersedia", "menolak"] as const).map((f) => (
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
                  <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                    {tampil.length === 0 && <p className="text-xs text-slate-500">Tidak ada petugas pada filter ini.</p>}
                    {tampil.map((r) => {
                      const st = statusBaris(r);
                      return (
                        <div key={r.id} className="rounded-md border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-blue-950">{r.nama}</span>
                              <span className="ml-2 text-[11px] text-slate-500">{r.tawaran ? "tawaran menginap" : "konfirmasi biasa"}</span>
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${BADGE[st].kelas}`}>{BADGE[st].label}</span>
                          </div>
                          <Keterangan r={r} />
                          <div className="mt-2">
                            <Aksi r={r} />
                          </div>
                        </div>
                      );
                    })}
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
                              {st ? (st === "bersedia" ? "Bersedia menginap" : st === "menolak" ? "Menolak menginap" : BADGE[st].label) : "Belum ditawari"}
                            </span>
                          </div>
                          {r.tawaran && <Keterangan r={r} />}
                          {r.tawaran?.status === "tidak_bersedia" && r.tawaran.catatan && <p className="mt-1 text-[11px] text-red-700">Alasan: {r.tawaran.catatan}</p>}
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
