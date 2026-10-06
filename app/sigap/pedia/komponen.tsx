"use client";

// app/sigap/pedia/komponen.tsx
//
// (7 Okt 2026) SIGAP PEDIA -- komponen bersama: kartu entri, badge, panel "Rujukan SIGAP PEDIA".

import Link from "next/link";
import { useEffect, useState } from "react";
import { Chip } from "../admin/ui";
import { KANAL, SIFAT, STATUS, tanggalIndo } from "@/lib/pedia/umum";
import { ambilP, type Kartu } from "./api";
import { SesiBerakhir } from "../admin/api";

export function BadgeTinjau({ alasan }: { alasan?: string | null }) {
  return (
    <span title={alasan ?? "Regulasi rujukan berubah/dicabut — perlu ditinjau"} className="inline-flex items-center gap-1 rounded-full bg-[#FBE5E2] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#B5352D]">
      ⚠ Perlu ditinjau
    </span>
  );
}

export function BadgeSifat({ sifat }: { sifat: string }) {
  return <Chip w={sifat === "mengikat" ? "navy" : "mut"}>{SIFAT[sifat] ?? sifat}</Chip>;
}

export function KartuEntri({ e, href, tampilStatus = false }: { e: Kartu; href: string; tampilStatus?: boolean }) {
  return (
    <Link href={href} className="block rounded-[10px] border border-[#E3E8EE] bg-white p-4 transition hover:border-[#CDD5DE] hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#7B8794]">
        <span className="font-mono font-semibold text-[#4D5B6B]">{e.nomor_registrasi}</span>
        <span>·</span>
        <span>{e.kategori ? `${e.kategori.kode} ${e.kategori.nama}` : "–"}</span>
        <span>·</span>
        <span>{KANAL[e.kanal] ?? e.kanal}</span>
        {e.tgl_dijawab && <span>· dijawab {tanggalIndo(e.tgl_dijawab)}</span>}
      </div>
      <h3 className="mt-1 text-[15px] font-semibold leading-snug text-[#14202E]">{e.judul}</h3>
      {e.kesimpulan && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-[#4D5B6B]">{e.kesimpulan}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <BadgeSifat sifat={e.sifat} />
        {tampilStatus && <Chip w={STATUS[e.status]?.w ?? "mut"}>{STATUS[e.status]?.label ?? e.status}</Chip>}
        {e.perlu_ditinjau && <BadgeTinjau alasan={e.alasan_tinjau} />}
        {e.tag.slice(0, 5).map((t) => (
          <span key={t} className="rounded-full bg-[#F3F5F8] px-2 py-0.5 text-[11.5px] text-[#4D5B6B]">
            #{t}
          </span>
        ))}
      </div>
    </Link>
  );
}

/** Panel kecil "Rujukan SIGAP PEDIA" utk halaman kegiatan / SPJ / paket kontrak. */
export function PanelRujukan({ jenis, refId, kelola = false }: { jenis: "kegiatan" | "penugasan" | "kontrak_paket"; refId: number; kelola?: boolean }) {
  const [entri, setEntri] = useState<Kartu[] | null>(null);
  useEffect(() => {
    let batal = false;
    // tanpa akses baca SIGAP PEDIA -> panel tidak ditampilkan (entri tetap null)
    ambilP<{ entri: Kartu[] }>({ bagian: "rujukan", jenis, ref: refId })
      .then((d) => !batal && setEntri(d.entri))
      .catch((e) => void (e instanceof SesiBerakhir));
    return () => {
      batal = true;
    };
  }, [jenis, refId]);
  if (entri === null) return null;
  return (
    <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-3.5">
      <div className="flex items-center gap-2">
        <span aria-hidden>📚</span>
        <h3 className="text-[14px] font-semibold">Rujukan SIGAP PEDIA</h3>
        <span className="text-[12px] text-[#7B8794]">{entri.length} entri</span>
        <div className="flex-1" />
        {kelola && entri.length > 0 && (
          <a href={`/sigap/pedia/kelola?tautan_jenis=${jenis}&tautan_ref=${refId}`} className="text-[12px] font-semibold text-[#1F6FD1] hover:underline">
            Register & Paket Bukti →
          </a>
        )}
      </div>
      {entri.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-[#7B8794]">Belum ada konsultasi resmi yang ditautkan.</p>
      ) : (
        <ul className="mt-2 divide-y divide-[#EDF0F4]">
          {entri.map((e) => (
            <li key={e.id} className="py-1.5">
              <Link href={`/sigap/pedia/${e.id}`} className="block text-[13px] hover:text-[#1F6FD1]">
                <span className="font-mono text-[11.5px] text-[#7B8794]">{e.nomor_registrasi}</span> <span className="font-semibold">{e.judul}</span>
                {e.perlu_ditinjau && <span className="ml-1 text-[11.5px] font-semibold text-[#B5352D]">⚠ perlu ditinjau</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type Detail = {
  kelola: boolean;
  entri: Record<string, unknown> & {
    id: number;
    nomor_registrasi: string;
    judul: string;
    pertanyaan: string | null;
    jawaban: string | null;
    kesimpulan: string | null;
    kanal: string;
    kanal_lain: string | null;
    nomor_tiket: string | null;
    sifat: string;
    status: string;
    perlu_ditinjau: boolean;
    alasan_tinjau: string | null;
    tgl_diajukan: string | null;
    tgl_dijawab: string | null;
    penanya_nama: string | null;
    tim: string | null;
    nota_dinas_srikandi: string | null;
    keputusan_ppk: string | null;
    dibatalkan_alasan: string | null;
    difinalkan_at: string | null;
    difinalkan_oleh: string | null;
    dibuat_at: string;
    dibuat_oleh: string | null;
  };
  kategori: { id: number; kode: string; nama: string } | null;
  induk: { kode: string; nama: string } | null;
  tag: string[];
  regulasi: { id: number; jenis: string; nomor: string; tahun: number; judul: string | null; status: string; diubah_oleh_teks: string | null; pasal: string | null }[];
  tautan: { id: number; jenis: string; ref_id: number | null; ref_teks: string | null; label: string; href: string | null }[];
  file: Record<string, unknown>[];
  digantikan_oleh: { id: number; nomor_registrasi: string; status: string }[];
  menggantikan: { id: number; nomor_registrasi: string } | null;
  verifikasi_terakhir: { id: number; at: string; oleh: string | null; semua_cocok: boolean; hasil: unknown } | null;
  terkait: Kartu[];
};

export function BlokTeks({ judul, isi, sorot = false }: { judul: string; isi: string | null; sorot?: boolean }) {
  return (
    <section className={`rounded-[10px] border p-4 ${sorot ? "border-[#1F6FD1]/30 bg-[#E3EEFB]/50" : "border-[#E3E8EE] bg-white"}`}>
      <h2 className="text-[13px] font-semibold text-[#4D5B6B]">{judul}</h2>
      <div className={`mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed ${sorot ? "font-medium text-[#14202E]" : "text-[#14202E]"}`}>{isi || <span className="text-[#7B8794]">–</span>}</div>
    </section>
  );
}

export function DasarHukum({ regulasi }: { regulasi: Detail["regulasi"] }) {
  return (
    <section className="rounded-[10px] border border-[#E3E8EE] bg-white p-4">
      <h2 className="text-[13px] font-semibold text-[#4D5B6B]">Dasar hukum</h2>
      {regulasi.length === 0 ? (
        <p className="mt-1 text-[13px] text-[#7B8794]">–</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {regulasi.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-1.5 text-[13.5px]">
              <Link href={`/sigap/pedia?q=${encodeURIComponent(`${r.jenis} ${r.nomor}`)}`} className="font-semibold hover:text-[#1F6FD1]">
                {r.jenis} {r.nomor}
              </Link>
              {r.pasal && <span className="text-[#4D5B6B]">{r.pasal}</span>}
              {r.judul && <span className="text-[#7B8794]">— {r.judul}</span>}
              <Chip w={r.status === "berlaku" ? "ok" : r.status === "diubah" ? "wait" : "bad"}>
                {r.status}
                {r.diubah_oleh_teks ? ` oleh ${r.diubah_oleh_teks}` : ""}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

