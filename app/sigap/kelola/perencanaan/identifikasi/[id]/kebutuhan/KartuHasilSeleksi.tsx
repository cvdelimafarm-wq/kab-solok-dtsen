"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/kebutuhan/KartuHasilSeleksi.tsx
//
// (1 Nov 2026) Kartu "Hasil seleksi Mitra" di halaman Rekrutmen dan pengadaan: seleksi pada kegiatan yang tertaut ke identifikasi ini, hasilnya (mendaftar, lulus, bersedia,
// ditugaskan), dan perbandingan dengan Mitra bersumber seleksi pada lanjutan. HANYA BACA; nama petugas tetap diisi PJ pada identifikasi lanjutan.
// Tidak tampil bila identifikasi belum tertaut, pemanggil tidak berizin, atau tidak ada rencana seleksi. API: /api/sigap/seleksi?aksi=terisi. Aturan: lib/seleksiHasil.ts.

import { useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { Chip } from "@/app/sigap/keu-ui";
import type { RingkasRekrutmen } from "@/lib/keu/rekrutmen";
import { bandingkanSeleksi, type HitungPeran } from "@/lib/seleksiHasil";
import type { HasilSeleksiIdent } from "@/lib/portal/seleksiHasil";

const STATUS: Record<string, { t: string; w: "hijau" | "kuning" | "biru" | "abu" }> = {
  draft: { t: "Draft", w: "abu" },
  dibuka: { t: "Pendaftaran dibuka", w: "biru" },
  ditutup: { t: "Ditutup", w: "kuning" },
  selesai: { t: "Selesai", w: "hijau" },
};

function Sel({ h }: { h: HitungPeran }) {
  if (h.kebutuhan === 0 && h.pendaftar === 0) return <span className="text-[#7B8794]">–</span>;
  return (
    <span className="text-[12.5px] leading-snug">
      <b>{h.kebutuhan}</b> (sisa {h.sisa})
      <br />
      <span className="text-[#55657D]">
        {h.pendaftar} daftar · {h.lulus} lulus · {h.bersedia} bersedia{h.menolak > 0 ? ` · ${h.menolak} menolak` : ""} · {h.ditugaskan} ditugaskan
      </span>
    </span>
  );
}

export default function KartuHasilSeleksi({ identId, r }: { identId: number; r: RingkasRekrutmen }) {
  const [d, setD] = useState<HasilSeleksiIdent | null>(null);
  useEffect(() => {
    let batal = false;
    apiPortal<HasilSeleksiIdent>(`/api/sigap/seleksi?aksi=terisi&ident_id=${identId}`)
      .then((x) => !batal && setD(x))
      .catch(() => undefined); // kartu hanya bantuan; tanpa izin atau gagal = tidak tampil
    return () => {
      batal = true;
    };
  }, [identId]);

  const rencana = useMemo(() => {
    const n = { ppl: 0, pml: 0 };
    for (const m of r.mitra) if (m.sumber === "seleksi" && (m.peran === "ppl" || m.peran === "pml")) n[m.peran]++;
    return n;
  }, [r.mitra]);
  const banding = useMemo(() => (d ? bandingkanSeleksi(rencana, d.ditugaskan) : []), [d, rencana]);

  if (!d || !d.tersambung || d.kegiatan.length === 0) return null;
  if (d.seleksi.length === 0 && rencana.ppl + rencana.pml === 0) return null;

  return (
    <section className="rounded-xl border border-[#DCE3EE] bg-white p-4 text-[#1B2B4B]" id="kb-hasil-seleksi" data-testid="kartu-hasil-seleksi">
      <h3 className="text-[15px] font-extrabold text-[#0F2A52]">Hasil seleksi Mitra</h3>
      <p className="mt-0.5 text-[12.5px] text-[#55657D]">Dibaca dari seleksi pada kegiatan yang tertaut ({d.kegiatan.map((k) => k.nama).join(", ")}). Nama Mitra yang lolos diisi pada identifikasi lanjutan.</p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {banding.map((b) => (
          <span key={b.peran} className="rounded-lg bg-[#F1F5FB] px-2.5 py-1.5 text-[12.5px]">
            <b>{b.peran.toUpperCase()}</b>: direncanakan lewat seleksi {b.direncanakan}, sudah ditugaskan {b.ditugaskan}{" "}
            {b.kurang > 0 ? <Chip warna="kuning">kurang {b.kurang}</Chip> : b.lebih > 0 ? <Chip warna="biru">lebih {b.lebih}</Chip> : b.direncanakan > 0 ? <Chip warna="hijau">terpenuhi</Chip> : null}
          </span>
        ))}
      </div>

      {d.seleksi.length === 0 ? (
        <p className="mt-2.5 text-[13px] text-[#55657D]">Belum ada rancangan seleksi pada kegiatan tertaut. PJ merancangnya di Kelola Pendataan, tab 1 · Persiapan, bagian Perekrutan petugas.</p>
      ) : (
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E3E9F2] text-[11.5px] uppercase tracking-wide text-[#7B8794]">
                <th className="py-1.5 pr-2 font-semibold">Seleksi</th>
                <th className="py-1.5 pr-2 font-semibold">Status</th>
                <th className="py-1.5 pr-2 font-semibold">PPL</th>
                <th className="py-1.5 font-semibold">PML</th>
              </tr>
            </thead>
            <tbody>
              {d.seleksi.map((s) => (
                <tr key={s.id} className="border-b border-[#EEF2F7] align-top last:border-0">
                  <td className="py-2 pr-2 font-semibold">
                    {s.nama}
                    <span className="block text-[11.5px] font-normal text-[#7B8794]">{s.jalur === "seleksi" ? "Seleksi" : "Penunjukan langsung"}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <Chip warna={(STATUS[s.status] ?? STATUS.draft).w}>{(STATUS[s.status] ?? { t: s.status }).t}</Chip>
                  </td>
                  <td className="py-2 pr-2">
                    <Sel h={s.ppl} />
                  </td>
                  <td className="py-2">
                    <Sel h={s.pml} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
