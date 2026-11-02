"use client";

// app/sigap/pelatihan/PemilihPelatihan.tsx
//
// (3 Nov 2026) Pemilih pelatihan untuk peserta yang terdaftar di dua pelatihan aktif atau lebih (mis. Seruti TW IV 9 Nov dan SPDT NTP 20-21 Nov).
// Tampil hanya bila /api/sigap/pelatihan/info mengirim `pilihan` (>= 2). Memilih = membuka halaman yang sama dengan ?kegiatan=ID (disimpan juga
// di sessionStorage oleh kegiatanPelatihanAktif), sehingga seluruh data tab berganti ke pelatihan itu. Tanpa pilihan -> tidak menampilkan apa pun.

import { useInfoPelatihan } from "./infoPelatihan";
import { alamatGantiPelatihan } from "@/lib/sigapPelatihanNama";

function tglPendek(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][Number(m) - 1];
  return bln ? `${Number(d)} ${bln}` : "";
}

export function PemilihPelatihan() {
  const info = useInfoPelatihan();
  const pilihan = info?.pilihan;
  if (!info || !pilihan || pilihan.length < 2) return null;
  const ganti = (id: number) => {
    if (id === info.kegiatan_id || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem("sigap_pel_kegiatan", String(id));
    } catch {
      /* tanpa penyimpanan: ?kegiatan di alamat tetap cukup */
    }
    window.location.assign(alamatGantiPelatihan(window.location.pathname, window.location.search, id));
  };
  return (
    <div className="rounded-xl border border-[#D7DEE8] bg-white px-3 py-2 shadow-sm" data-testid="pemilih-pelatihan">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#5B6B7F]">Anda terdaftar di {pilihan.length} pelatihan</p>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Pilih pelatihan">
        {pilihan.map((p) => {
          const aktif = p.id === info.kegiatan_id;
          const tgl = p.tanggal_mulai ? (p.tanggal_selesai && p.tanggal_selesai !== p.tanggal_mulai ? `${tglPendek(p.tanggal_mulai)}–${tglPendek(p.tanggal_selesai)}` : tglPendek(p.tanggal_mulai)) : "";
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={aktif}
              onClick={() => ganti(p.id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-left text-[12.5px] leading-tight ${aktif ? "border-[#0F2A52] bg-[#0F2A52] text-white" : "border-[#C9D3E0] bg-[#F3F5F8] text-[#14202E] hover:bg-[#E6ECF4]"}`}
            >
              <span className="block max-w-[220px] truncate font-semibold">{p.nama.trim() || "Pelatihan"}</span>
              {tgl && <span className={`block text-[11px] ${aktif ? "text-blue-100" : "text-[#5B6B7F]"}`}>{tgl}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
