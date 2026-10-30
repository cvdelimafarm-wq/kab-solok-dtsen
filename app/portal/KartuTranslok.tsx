"use client";

// app/portal/KartuTranslok.tsx
//
// (19 Okt 2026) Kartu Transport Lokal sendiri di Beranda (mockup alur per peran, disetujui): 5 langkah kecil, apa yang belum lengkap, dan SATU tombol ke
// bagian yang perlu dikerjakan. Dulu Transport Lokal hanya terlihat bila kebetulan menjadi kartu utama atau lewat tahap Pendataan (tugas terakhir).
// Muncul bila Transport Lokal belum selesai dan bukan kartu utama (lihat translokDariInduk di lib/sigapPrioritas.ts).
// (27 Okt 2026) Permintaan user: kotak langkah dan baris "yang belum lengkap" bisa DIKETUK dan membuka tempat yang sesuai (langkah 3 / baris foto ->
// lembar foto di bagian dokumentasi; baris laporan -> formulir laporan; langkah 2 -> Hari Kerja; langkah 1/4/5 -> Arsip). Langkah yang terkunci
// (tanpa tautan) tetap kotak biasa.

import Link from "next/link";
import type { KartuTranslokBeranda } from "@/lib/sigapPrioritas";
import type { StatusLangkah } from "@/lib/sigapKegiatan";

const LANGKAH: Record<StatusLangkah, string> = {
  selesai: "bg-[#E3F6EC] text-[#13794B]",
  mendesak: "bg-[#FDE8E8] text-[#B42329] ring-1 ring-[#D43A3A]",
  perlu: "bg-[#FFF4D6] text-[#8A6200] ring-1 ring-[#F4B400]",
  sekarang: "bg-[#FFF4D6] text-[#8A6200] ring-1 ring-[#F4B400]",
  berjalan: "bg-[#E6EEFC] text-[#1F5FD1]",
  menunggu: "bg-[#EEF2F7] text-[#6B7A90]",
  terkunci: "bg-[#EEF2F7] text-[#6B7A90]",
};
const NADA_KEK = { merah: "text-[#B42329]", emas: "text-[#8A6200]", biru: "text-[#1F5FD1]" } as const;

export default function KartuTranslok({ d }: { d: KartuTranslokBeranda }) {
  const { kegiatan: k, aktif, ke, total } = d;
  const kek = (k.kekurangan ?? []).slice(0, 2);
  const lebih = (k.kekurangan?.length ?? 0) - kek.length;
  const terkunci = !!aktif?.pesanKunci;
  const href = (!terkunci ? (k.kekurangan?.[0]?.href ?? aktif?.href) : null) ?? k.href ?? d.rute;
  const aksi = (!terkunci ? (k.kekurangan?.[0]?.aksi ?? aktif?.aksi) : null) ?? "Buka Transport Lokal";
  const mendesak = k.nada === "merah";
  return (
    <section className="rounded-[20px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]" aria-label="Transport Lokal">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-extrabold tracking-[0.14em] text-[#6B7A90]">TRANSPORT LOKAL</span>
        <span className="flex items-center gap-1.5">
          {mendesak && <span className="rounded-[9px] bg-[#FDE8E8] px-2 py-[2px] text-[10.5px] font-bold text-[#B42329]">Mendesak</span>}
          <span className="text-[10.5px] font-extrabold tracking-[0.1em] text-[#6B7A90]">LANGKAH {ke} DARI {total}</span>
        </span>
      </div>
      <h3 className="mt-1.5 text-[15px] font-extrabold leading-snug text-[#0F2A52]">{k.judul}</h3>
      <ol className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {(k.langkah ?? []).map((l) => {
          const isi = (
            <>
              {l.status === "selesai" && <span aria-hidden>✓</span>}
              <span className="line-clamp-2">{l.judul}</span>
            </>
          );
          const kelas = `flex min-h-[44px] flex-col items-center justify-center rounded-[10px] px-1 py-1 text-center text-[10px] font-bold leading-tight ${LANGKAH[l.status]}`;
          const bisa = !!l.href && !l.pesanKunci;
          return (
            <li key={l.kode} className="contents">
              {bisa ? (
                <Link href={l.href!} className={`${kelas} transition active:scale-[0.96] active:brightness-95`} aria-label={`${l.judul}: ${l.status}. Ketuk untuk membuka.`}>
                  {isi}
                </Link>
              ) : (
                <div className={kelas} aria-label={`${l.judul}: ${l.status}`}>
                  {isi}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {kek.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {kek.map((x) => (
            <li key={x.kode}>
              <Link href={x.href} className="flex min-h-[44px] items-center justify-between gap-3 rounded-[10px] bg-[#F5F8FE] px-3 py-2 text-[12.5px] transition active:bg-[#E6EEFC]" aria-label={`${x.judul}. ${x.ringkas}. Ketuk untuk melengkapi.`}>
                <span className="text-[#55657D]">{x.judul}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <b className={NADA_KEK[x.nada]}>{x.ringkas}</b>
                  <span aria-hidden className="text-[15px] font-bold text-[#8592A8]">›</span>
                </span>
              </Link>
            </li>
          ))}
          {lebih > 0 && (
            <li>
              {/* (30 Okt 2026) "+n lagi" kini bisa diketuk: membuka bagian berikutnya yang belum lengkap */}
              <Link href={k.kekurangan?.[kek.length]?.href ?? href} className="flex min-h-[44px] items-center gap-1 rounded-[10px] px-1 text-[12px] font-semibold text-[#1F5FD1] active:bg-[#F5F8FE]">
                +{lebih} lagi yang belum lengkap <span aria-hidden>›</span>
              </Link>
            </li>
          )}
        </ul>
      ) : (
        aktif && <p className="mt-3 rounded-[10px] bg-[#F5F8FE] px-3 py-2 text-[12.5px] leading-snug text-[#55657D]">{terkunci ? aktif.pesanKunci : aktif.ket}</p>
      )}
      <Link href={href} className="mt-3 inline-flex min-h-[46px] w-full items-center justify-center rounded-[13px] border-2 border-[#1F5FD1] bg-white px-4 text-[14px] font-extrabold text-[#1F5FD1] transition active:bg-[#EAF1FC]">
        {aksi}
      </Link>
    </section>
  );
}
