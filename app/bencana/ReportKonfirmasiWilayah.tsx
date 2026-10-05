"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

// ------------------------------------------------------------------------
// (4 Okt 2026) Kartu "Report Konfirmasi Petugas per Wilayah" -- BAGIAN ATAS tab
// Alokasi Petugas. Per kecamatan (bisa dibuka utk rincian nagari) wilayah TUGAS:
//   Ditawarkan (PPL | PML) · Belum Buka · Sudah Baca · Bersedia · Menolak ·
//   Jumlah minimum PPL (jika N hari kerja, default 20) · Selisih.
// Data: /api/bencana/alokasi/report-konfirmasi (definisi lengkap ada di route-nya).
// ------------------------------------------------------------------------

type StatusKonfirmasi = "belum_dibuka" | "dibaca" | "bersedia" | "pulang_pergi" | "menolak";
type Wil = { kecamatan: string; nagari: string; subsls: number };
type PetugasRep = { id: number; nama: string; peran: "ppl" | "pml"; status: StatusKonfirmasi; wilayah: Wil[] };
type Kebutuhan = { kecamatan: string; ppl_min: number; pml_min: number };
type WilSampel = { kecamatan: string; nagari: string; sampel: number; terplot: number };
type Respons = { hari_kerja: number; kebutuhan: Kebutuhan[]; petugas: PetugasRep[]; wilayah_sampel?: WilSampel[] };

type Hitung = {
  ppl: Set<number>;
  pml: Set<number>;
  belum: { ppl: number; pml: number };
  baca: { ppl: number; pml: number };
  bersedia: { ppl: number; pml: number };
  pp: { ppl: number; pml: number }; // bagian dari bersedia: hanya bersedia pulang-pergi
  menolak: { ppl: number; pml: number };
};

function kosongHitung(): Hitung {
  return {
    ppl: new Set(),
    pml: new Set(),
    belum: { ppl: 0, pml: 0 },
    baca: { ppl: 0, pml: 0 },
    bersedia: { ppl: 0, pml: 0 },
    pp: { ppl: 0, pml: 0 },
    menolak: { ppl: 0, pml: 0 },
  };
}

function tambah(h: Hitung, p: PetugasRep) {
  const set = p.peran === "ppl" ? h.ppl : h.pml;
  if (set.has(p.id)) return;
  set.add(p.id);
  const k = p.peran;
  if (p.status === "belum_dibuka") h.belum[k] += 1;
  else if (p.status === "dibaca") h.baca[k] += 1;
  else if (p.status === "menolak") h.menolak[k] += 1;
  else {
    h.bersedia[k] += 1;
    if (p.status === "pulang_pergi") h.pp[k] += 1;
  }
}

function judul(s: string): string {
  return s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

// (5 Okt 2026) terplot / sampel; merah kalau ada Sub SLS sampel yg belum punya PPL.
function SubSls({ terplot, sampel }: { terplot: number; sampel: number }) {
  if (sampel === 0) return <span className="text-ink/30">-</span>;
  const kurang = sampel - terplot;
  return (
    <span className={kurang > 0 ? "font-medium text-rust-700" : "text-moss-700"}>
      {terplot} / {sampel}
      {kurang > 0 && <span className="ml-1 text-[10px]">({kurang} belum)</span>}
    </span>
  );
}

function Sel({ n, tone }: { n: { ppl: number; pml: number }; tone?: string }) {
  return (
    <span className={tone ?? ""}>
      <b className={n.ppl === 0 ? "font-normal text-ink/30" : ""}>{n.ppl}</b>
      {n.pml > 0 && <span className="ml-1 text-[11px] text-ink/50">+{n.pml} PML</span>}
    </span>
  );
}

export default function ReportKonfirmasiWilayah() {
  const [terbuka, setTerbuka] = useState(true);
  const [hariInput, setHariInput] = useState(20);
  const [data, setData] = useState<Respons | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dibuka, setDibuka] = useState<Set<string>>(new Set());

  const muat = useCallback(async (hari: number) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bencana/alokasi/report-konfirmasi?hari_kerja=${hari}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error((json?.error as string) ?? "Gagal memuat report.");
      setData(json as Respons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat report.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    muat(20);
  }, [muat]);

  const { baris, total } = useMemo(() => {
    const kec = new Map<string, Hitung>();
    const nag = new Map<string, Map<string, Hitung>>();
    const tot = kosongHitung();
    for (const p of data?.petugas ?? []) {
      tambah(tot, p);
      for (const w of p.wilayah) {
        const hk = kec.get(w.kecamatan) ?? kosongHitung();
        tambah(hk, p);
        kec.set(w.kecamatan, hk);
        const nm = nag.get(w.kecamatan) ?? new Map<string, Hitung>();
        const hn = nm.get(w.nagari) ?? kosongHitung();
        tambah(hn, p);
        nm.set(w.nagari, hn);
        nag.set(w.kecamatan, nm);
      }
    }
    const kebutuhan = new Map((data?.kebutuhan ?? []).map((k) => [k.kecamatan, k]));
    // (5 Okt 2026) Seluruh wilayah sampel ikut tampil, juga nagari yg belum ada PPL terplot.
    const sampel = new Map<string, Map<string, WilSampel>>();
    for (const w of data?.wilayah_sampel ?? []) {
      const m = sampel.get(w.kecamatan) ?? new Map<string, WilSampel>();
      m.set(w.nagari, w);
      sampel.set(w.kecamatan, m);
    }
    const namaKec = Array.from(new Set([...kec.keys(), ...kebutuhan.keys(), ...sampel.keys()])).sort((a, b) => a.localeCompare(b, "id"));
    const baris = namaKec.map((k) => {
      const namaNagari = Array.from(new Set([...(nag.get(k)?.keys() ?? []), ...(sampel.get(k)?.keys() ?? [])]));
      const rincian = namaNagari
        .map((n) => ({ nagari: n, h: nag.get(k)?.get(n) ?? kosongHitung(), s: sampel.get(k)?.get(n) ?? null }))
        .sort((a, b) => a.nagari.localeCompare(b.nagari, "id"));
      const sub = Array.from(sampel.get(k)?.values() ?? []).reduce((acc, w) => ({ sampel: acc.sampel + w.sampel, terplot: acc.terplot + w.terplot }), { sampel: 0, terplot: 0 });
      return {
        kecamatan: k,
        h: kec.get(k) ?? kosongHitung(),
        min: kebutuhan.get(k)?.ppl_min ?? 0,
        sub,
        nagari: rincian,
      };
    });
    const minTotal = baris.reduce((s, b) => s + b.min, 0);
    return { baris, total: { h: tot, min: minTotal } };
  }, [data]);

  function toggle(k: string) {
    setDibuka((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  const hariDipakai = data?.hari_kerja ?? 20;

  function Selisih({ bersedia, min }: { bersedia: number; min: number }) {
    if (min === 0) return <span className="text-ink/30">-</span>;
    const d = bersedia - min;
    if (d >= 0) return <span className="font-medium text-moss-700">cukup{d > 0 ? ` (+${d})` : ""}</span>;
    return <span className="font-medium text-rust-700">kurang {-d}</span>;
  }

  return (
    <section className="rounded-md border border-blue-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium text-blue-950">Report Konfirmasi Petugas per Wilayah</h2>
          <p className="text-[11px] text-ink/50">
            Seluruh wilayah sampel (termasuk yang belum ada PPL terplot). &ldquo;Ditawarkan&rdquo; = PPL yang sudah diplot dan PML-nya.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1 text-ink/70">
            Minimum PPL jika
            <input
              type="number"
              min={1}
              max={24}
              value={hariInput}
              onChange={(e) => setHariInput(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
              className="w-14 rounded border border-blue-200 px-1.5 py-1 text-right"
            />
            hari kerja
          </label>
          <button
            type="button"
            onClick={() => muat(hariInput)}
            disabled={busy}
            className="rounded bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Memuat…" : "Muat ulang"}
          </button>
          <button type="button" onClick={() => setTerbuka((v) => !v)} className="rounded border border-blue-200 px-2.5 py-1 text-blue-900 hover:bg-blue-50">
            {terbuka ? "Sembunyikan" : "Tampilkan"}
          </button>
        </div>
      </div>

      {terbuka && (
        <>
          {error && <p className="mt-3 rounded bg-rust-50 px-3 py-2 text-sm text-rust-700">{error}</p>}
          {!data && !error && <p className="mt-3 text-sm text-ink/60">Memuat…</p>}
          {data && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-blue-100 bg-blue-50 text-left text-xs text-blue-900">
                    <th rowSpan={2} className="px-2 py-1.5 align-bottom">
                      Wilayah (Kecamatan / Nagari)
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">
                      Sub SLS Sampel
                      <div className="text-[10px] font-normal text-ink/50">terplot / sampel</div>
                    </th>
                    <th colSpan={2} className="px-2 py-1 text-center">
                      Ditawarkan
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">
                      Belum Buka
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">
                      Sudah Baca
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">
                      Bersedia
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">
                      Menolak
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">
                      Minimum PPL
                      <div className="text-[10px] font-normal text-ink/50">({hariDipakai} hari kerja)</div>
                    </th>
                    <th rowSpan={2} className="px-2 py-1.5 text-center align-bottom">
                      Bersedia vs Minimum
                    </th>
                  </tr>
                  <tr className="border-b border-blue-100 bg-blue-50 text-xs text-blue-900">
                    <th className="px-2 py-1 text-center">PPL</th>
                    <th className="px-2 py-1 text-center">PML</th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((b) => {
                    const buka = dibuka.has(b.kecamatan);
                    return (
                      <Fragment key={b.kecamatan}>
                        <tr className="border-b border-blue-50 hover:bg-blue-50/40">
                          <td className="px-2 py-1.5">
                            <button type="button" onClick={() => toggle(b.kecamatan)} className="flex items-center gap-1.5 text-left font-medium text-blue-950">
                              <span className="inline-block w-3 text-xs text-ink/50">{b.nagari.length > 0 ? (buka ? "▾" : "▸") : ""}</span>
                              {judul(b.kecamatan)}
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-center text-xs">
                            <SubSls terplot={b.sub.terplot} sampel={b.sub.sampel} />
                          </td>
                          <td className="px-2 py-1.5 text-center font-semibold">{b.h.ppl.size}</td>
                          <td className="px-2 py-1.5 text-center">{b.h.pml.size}</td>
                          <td className="px-2 py-1.5 text-center">
                            <Sel n={b.h.belum} tone="text-slate-700" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Sel n={b.h.baca} tone="text-amber-700" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Sel n={b.h.bersedia} tone="text-moss-700" />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Sel n={b.h.menolak} tone="text-rust-700" />
                          </td>
                          <td className="px-2 py-1.5 text-center font-semibold">{b.min}</td>
                          <td className="px-2 py-1.5 text-center text-xs">
                            <Selisih bersedia={b.h.bersedia.ppl} min={b.min} />
                          </td>
                        </tr>
                        {buka &&
                          b.nagari.map((n) => (
                            <tr key={`${b.kecamatan}|${n.nagari}`} className="border-b border-blue-50 bg-blue-50/30 text-[13px]">
                              <td className="py-1 pl-8 pr-2 text-ink/80">{judul(n.nagari)}</td>
                              <td className="px-2 py-1 text-center text-xs">
                                {n.s ? <SubSls terplot={n.s.terplot} sampel={n.s.sampel} /> : <span className="text-ink/30">-</span>}
                              </td>
                              <td className="px-2 py-1 text-center">{n.h.ppl.size}</td>
                              <td className="px-2 py-1 text-center">{n.h.pml.size}</td>
                              <td className="px-2 py-1 text-center">
                                <Sel n={n.h.belum} tone="text-slate-700" />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <Sel n={n.h.baca} tone="text-amber-700" />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <Sel n={n.h.bersedia} tone="text-moss-700" />
                              </td>
                              <td className="px-2 py-1 text-center">
                                <Sel n={n.h.menolak} tone="text-rust-700" />
                              </td>
                              <td className="px-2 py-1 text-center text-ink/30">-</td>
                              <td className="px-2 py-1 text-center text-ink/30">-</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                  <tr className="border-t-2 border-blue-200 bg-blue-50 font-semibold">
                    <td className="px-2 py-1.5">Total (tanpa ganda)</td>
                    <td className="px-2 py-1.5 text-center text-xs">
                      <SubSls terplot={baris.reduce((s, b) => s + b.sub.terplot, 0)} sampel={baris.reduce((s, b) => s + b.sub.sampel, 0)} />
                    </td>
                    <td className="px-2 py-1.5 text-center">{total.h.ppl.size}</td>
                    <td className="px-2 py-1.5 text-center">{total.h.pml.size}</td>
                    <td className="px-2 py-1.5 text-center">
                      <Sel n={total.h.belum} tone="text-slate-700" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Sel n={total.h.baca} tone="text-amber-700" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Sel n={total.h.bersedia} tone="text-moss-700" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Sel n={total.h.menolak} tone="text-rust-700" />
                    </td>
                    <td className="px-2 py-1.5 text-center">{total.min}</td>
                    <td className="px-2 py-1.5 text-center text-xs">
                      <Selisih bersedia={total.h.bersedia.ppl} min={total.min} />
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-relaxed text-ink/50">
                Belum Buka = belum pernah lolos verifikasi di halaman undangan · Sudah Baca = sudah membuka undangan tetapi belum menjawab · Bersedia
                {total.h.pp.ppl + total.h.pp.pml > 0 && ` (termasuk ${total.h.pp.ppl + total.h.pp.pml} orang yang hanya bersedia pulang-pergi)`}{" "}
                · Menolak. Angka kecil &ldquo;+n PML&rdquo; = jumlah PML dengan status yang sama. Petugas yang memegang Sub SLS di lebih dari satu
                wilayah dihitung di tiap wilayah; baris Total tidak menghitung ganda. Minimum PPL = kebutuhan per kecamatan dari perhitungan
                beban (kapasitas {hariDipakai} hari kerja); rincian nagari tidak punya minimum sendiri.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
