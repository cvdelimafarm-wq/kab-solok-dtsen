"use client";

// app/sigap/delego/penilaian/page.tsx
//
// (26 Okt 2026) Penilaian saya: skor kinerja (4 komponen), pembinaan yang dicatat untuk saya, dan penghargaan. Skor hanya menyarankan; penilaian formal oleh pejabat berwenang (cek aturan).

import { skorPenerima, tglPendek, TANGGA_PEMBINAAN } from "@/lib/delego/hitung";
import { useKonteksDelego } from "../konteks";
import { useSaya } from "../data";
import { Batang, Galat, Halaman, Info, Kartu, Kosong, Lencana, Memuat } from "../ui";

export default function Penilaian() {
  const { hari } = useKonteksDelego();
  const s = useSaya();
  const d = s.data;
  const skor = d ? skorPenerima(d.delegasi, d.laporan, d.penilaian, hari) : null;

  return (
    <Halaman judul="Penilaian saya" sub="Skor dihitung dari laporan harian dan penilaian pemberi delegasi">
      {s.memuat && !d && <Memuat />}
      {s.galat && !d && <Galat>{s.galat}</Galat>}
      {d && skor && (
        <div className="mx-auto grid grid-cols-1 max-w-3xl gap-4">
          <Kartu
            judul="Skor kinerja saya"
            kanan={
              <span className="text-[26px] font-bold text-[#0B524C]">
                {skor.total === null ? "–" : skor.total}
                <span className="text-[14px] font-medium text-[#3B4A57]"> / 100</span>
              </span>
            }
          >
            {skor.total === null ? (
              <p className="m-0 text-[14px] text-[#3B4A57]">Skor muncul setelah ada laporan harian dan hari kerja yang berlalu.</p>
            ) : (
              <div className="space-y-3">
                {skor.komponen.map((k) => (
                  <div key={k.kode} className="space-y-1">
                    <div className="flex justify-between text-[13.5px]">
                      <span>{k.nama}</span>
                      <span className="font-semibold">{k.nilai === null ? "belum dinilai" : `${k.nilai}%`}</span>
                    </div>
                    <Batang persen={k.nilai ?? 0} nada={k.nilai !== null && k.nilai < 60 ? "amber" : "hijau"} />
                  </div>
                ))}
              </div>
            )}
            <p className="m-0 mt-3 text-[12.5px] leading-snug text-[#3B4A57]">
              Skor adalah bahan percakapan, bukan penilaian resmi. Dapat dilihat oleh Anda dan pihak berwenang pada kegiatan ini (Ketua Tim, PPK, KPA). Penilaian formal tetap oleh pejabat berwenang (cek aturan).
            </p>
          </Kartu>

          <Kartu judul="Catatan pembinaan">
            {d.pembinaan.length === 0 ? (
              <p className="m-0 text-[14px] text-[#3B4A57]">Tidak ada catatan pembinaan.</p>
            ) : (
              <ul className="m-0 list-none space-y-3 p-0">
                {d.pembinaan.map((p) => (
                  <li key={p.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Lencana nada={p.status === "berjalan" ? "amber" : p.status === "selesai" ? "hijau" : "abu"}>
                        Langkah {p.langkah}: {TANGGA_PEMBINAAN[p.langkah - 1]?.nama}
                      </Lencana>
                      <span className="text-[12.5px] text-[#3B4A57]">{tglPendek(p.dibuat_at.slice(0, 10))} · {p.status}</span>
                    </div>
                    <p className="m-0 text-[14px] leading-snug">{p.alasan}</p>
                    {p.tinjau && <p className="m-0 text-[12.5px] text-[#3B4A57]">Ditinjau ulang {tglPendek(p.tinjau)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Kartu>

          <Kartu judul="Penghargaan">
            {d.penghargaan.length === 0 ? (
              <p className="m-0 text-[14px] text-[#3B4A57]">Belum ada penghargaan tercatat.</p>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0 text-[14px]">
                {d.penghargaan.map((h) => (
                  <li key={h.id}>
                    <b>{tglPendek(h.dibuat_at.slice(0, 10))}</b> · {h.alasan}
                  </li>
                ))}
              </ul>
            )}
          </Kartu>
          {d.delegasi.length === 0 && <Kosong>Penilaian muncul setelah Anda menerima delegasi.</Kosong>}
          <Info>Keberatan atas catatan atau skor dapat disampaikan langsung kepada Ketua Tim.</Info>
        </div>
      )}
    </Halaman>
  );
}
