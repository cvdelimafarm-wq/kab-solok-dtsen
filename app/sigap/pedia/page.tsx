"use client";

// app/sigap/pedia/page.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- beranda ensiklopedia konsultasi -- permintaan user: kotak cari besar,
// kategori + jumlah entri, entri terbaru, entri paling sering dibuka. Pencarian full-text (Postgres
// tsvector indonesian + simple) atas judul, pertanyaan, jawaban, kesimpulan, tag & dasar hukum.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bacaSesi, keMasuk, pesanGalat, SesiBerakhir } from "../admin/api";
import { BTN, Memuat, Pesan } from "../admin/ui";
import Bingkai from "../kontrak/Bingkai";
import { ambilP, type Kartu } from "./api";
import { KartuEntri } from "./komponen";
import { useDetak } from "../useDetak";

type Kat = { id: number; kode: string; nama: string; induk_id: number | null; jumlah: number; deskripsi: string | null };
type Beranda = { kelola: boolean; total: number; perlu_ditinjau: number; kategori: Kat[]; terbaru: Kartu[]; populer: Kartu[] };

function bacaUrl() {
  if (typeof window === "undefined") return { q: "", kategori: "", tag: "" };
  const p = new URLSearchParams(window.location.search);
  return { q: p.get("q") ?? "", kategori: p.get("kategori") ?? "", tag: p.get("tag") ?? "" };
}

export default function SigapPedia() {
  const [data, setData] = useState<Beranda | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [saring, setSaring] = useState({ q: "", kategori: "", tag: "" });
  const [hasil, setHasil] = useState<Kartu[] | null>(null);
  const [memuatCari, setMemuatCari] = useState(false);
  const [sesiDetak] = useState(() => (typeof window === "undefined" ? null : bacaSesi()));
  useDetak({ sesi: sesiDetak }, "sigap pedia");

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    const u = bacaUrl();
    setQ(u.q);
    setSaring(u);
    ambilP<Beranda>({ bagian: "beranda" })
      .then(setData)
      .catch((e) => !(e instanceof SesiBerakhir) && setGalat(pesanGalat(e)));
  }, []);

  const cari = useCallback(async (s: { q: string; kategori: string; tag: string }) => {
    const url = new URL(window.location.href);
    for (const k of ["q", "kategori", "tag"] as const) (s[k] ? url.searchParams.set(k, s[k]) : url.searchParams.delete(k));
    window.history.replaceState(null, "", url.toString());
    if (!s.q && !s.kategori && !s.tag) return setHasil(null);
    setMemuatCari(true);
    try {
      const d = await ambilP<{ hasil: Kartu[] }>({ bagian: "cari", q: s.q, kategori: s.kategori, tag: s.tag });
      setHasil(d.hasil);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMemuatCari(false);
    }
  }, []);
  useEffect(() => {
    if (data) cari(saring);
  }, [saring, data, cari]);

  const induk = useMemo(() => (data?.kategori ?? []).filter((k) => !k.induk_id), [data]);
  const sub = (id: number) => (data?.kategori ?? []).filter((k) => k.induk_id === id);
  const namaSaring = saring.kategori ? data?.kategori.find((k) => k.kode === saring.kategori)?.nama : null;

  return (
    <Bingkai
      aktif="pedia"
      kecil="SIGAP · SIGAP PEDIA"
      jejak={["Referensi", "SIGAP PEDIA"]}
      judul="SIGAP PEDIA"
      sub="Ensiklopedia konsultasi resmi (HAI-DJPb, KPPN, Biro Keuangan BPS, dll). Cari dulu sebelum bertanya — jawabannya mungkin sudah ada."
      kanan={(gelap) =>
        data?.kelola ? (
          <Link href="/sigap/kelola/pedia" className={gelap ? "rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20" : BTN}>
            Register & arsip bukti
          </Link>
        ) : null
      }
    >
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}

      {/* Kotak cari besar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaring((s) => ({ ...s, q: q.trim() }));
        }}
        className="rounded-[10px] border border-[#E3E8EE] bg-white p-4"
      >
        <label htmlFor="cari-pedia" className="text-[13px] font-semibold text-[#14202E]">
          Cari pertanyaan, jawaban, tag, atau dasar hukum
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="cari-pedia"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='mis. visum, "pulang pergi", PMK 113, uang harian'
            className="h-12 min-w-0 flex-1 rounded-lg border border-[#CDD5DE] bg-white px-4 text-[15px] outline-none focus:border-[#1F6FD1] focus:ring-2 focus:ring-[#1F6FD1]/15"
          />
          <button type="submit" className="h-12 rounded-lg bg-[#1F6FD1] px-5 text-[14px] font-semibold text-white hover:bg-[#1A5DB0]">
            Cari
          </button>
        </div>
        {(saring.q || saring.kategori || saring.tag) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
            {saring.q && <span className="rounded-full bg-[#E3EEFB] px-2.5 py-0.5 text-[#1F6FD1]">&quot;{saring.q}&quot;</span>}
            {saring.kategori && <span className="rounded-full bg-[#E3EEFB] px-2.5 py-0.5 text-[#1F6FD1]">{saring.kategori} {namaSaring}</span>}
            {saring.tag && <span className="rounded-full bg-[#E3EEFB] px-2.5 py-0.5 text-[#1F6FD1]">#{saring.tag}</span>}
            <button
              type="button"
              className="text-[#1F6FD1] hover:underline"
              onClick={() => {
                setQ("");
                setSaring({ q: "", kategori: "", tag: "" });
              }}
            >
              Hapus saringan
            </button>
          </div>
        )}
      </form>

      {!data ? (
        <Memuat />
      ) : hasil !== null || memuatCari ? (
        <section className="space-y-2.5">
          <h2 className="text-[15px] font-semibold">{memuatCari ? "Mencari…" : `${hasil?.length ?? 0} entri ditemukan`}</h2>
          {!memuatCari && hasil?.length === 0 && (
            <div className="rounded-[10px] border border-[#E3E8EE] bg-white p-6 text-center text-[13.5px] text-[#4D5B6B]">
              Belum ada jawaban resmi untuk kata kunci ini. Bila Anda mengajukan pertanyaan ke HAI-DJPb/KPPN, teruskan jawabannya ke Admin Anggaran agar dicatat di SIGAP PEDIA.
            </div>
          )}
          <div className="grid gap-2.5 lg:grid-cols-2">
            {(hasil ?? []).map((e) => (
              <KartuEntri key={e.id} e={e} href={`/sigap/pedia/${e.id}`} />
            ))}
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-2.5">
              <h2 className="text-[15px] font-semibold">Entri terbaru</h2>
              {data.terbaru.length === 0 && (
                <div className="rounded-[10px] border border-[#E3E8EE] bg-white p-6 text-center text-[13.5px] text-[#4D5B6B]">Belum ada entri. Pengelola dapat menambahkan dari menu Register & arsip bukti.</div>
              )}
              {data.terbaru.map((e) => (
                <KartuEntri key={e.id} e={e} href={`/sigap/pedia/${e.id}`} />
              ))}
            </section>
            <aside className="space-y-3">
              <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
                <p className="text-[12px] text-[#7B8794]">Total entri</p>
                <p className="text-[22px] font-bold">{data.total}</p>
                {data.perlu_ditinjau > 0 && <p className="text-[12px] font-semibold text-[#B5352D]">{data.perlu_ditinjau} perlu ditinjau</p>}
              </section>
              {data.populer.length > 0 && (
                <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
                  <h2 className="text-[14px] font-semibold">Paling sering dibuka</h2>
                  <ol className="mt-2 space-y-1.5">
                    {data.populer.map((e, i) => (
                      <li key={e.id} className="flex gap-2 text-[13px]">
                        <span className="w-4 text-right text-[#7B8794]">{i + 1}.</span>
                        <Link href={`/sigap/pedia/${e.id}`} className="hover:text-[#1F6FD1]">
                          {e.judul}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </aside>
          </div>

          <section className="space-y-2.5">
            <h2 className="text-[15px] font-semibold">Kategori</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {induk.map((k) => (
                <div key={k.id} className="rounded-[10px] border border-[#E3E8EE] bg-white p-3.5">
                  <button type="button" onClick={() => setSaring({ q: "", tag: "", kategori: k.kode })} className="flex w-full items-baseline gap-2 text-left">
                    <span className="font-mono text-[12px] font-semibold text-[#1F6FD1]">{k.kode}</span>
                    <span className="flex-1 text-[14px] font-semibold hover:text-[#1F6FD1]">{k.nama}</span>
                    <span className="rounded-full bg-[#F3F5F8] px-2 text-[12px] font-semibold text-[#4D5B6B]">{k.jumlah}</span>
                  </button>
                  <ul className="mt-1.5 space-y-0.5">
                    {sub(k.id).map((s) => (
                      <li key={s.id}>
                        <button type="button" onClick={() => setSaring({ q: "", tag: "", kategori: s.kode })} className="flex w-full gap-2 text-left text-[12.5px] text-[#4D5B6B] hover:text-[#1F6FD1]">
                          <span className="w-12 shrink-0 font-mono text-[11.5px] text-[#7B8794]">{s.kode}</span>
                          <span className="flex-1">{s.nama}</span>
                          {s.jumlah > 0 && <span className="text-[11.5px] text-[#7B8794]">{s.jumlah}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </Bingkai>
  );
}
