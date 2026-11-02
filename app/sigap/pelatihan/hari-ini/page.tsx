"use client";

// app/sigap/pelatihan/hari-ini/page.tsx
//
// (2 Nov 2026) Tab "Hari ini" pelatihan (tampilan 5 tab): kartu undangan (terima/tolak setelah membaca ketentuan), unduh surat undangan PDF, dan kartu Vanguard.
// Kartu kedatangan (hari pertama) dan absen sesi: AbsenPeserta.tsx; tab "Absen peserta" untuk pengelola: absen/page.tsx. Halaman ini hanya bermakna bila saklar tab_baru menyala; bila belum, peserta
// yang membukanya langsung tetap melihat undangan dan kartunya (tidak ada data yang rusak), sedangkan bilah tab tidak muncul.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { bukaBlob, fetchJson, pesanGalat } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Kartu, Memuat, Pesan } from "../../admin/ui";
import KartuVanguardHariIni from "../../KartuVanguardHariIni";
import AbsenPeserta from "../AbsenPeserta";
import { Kerangka } from "../komponen";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { lupakanBenderaTab } from "../TabPelatihan";
import { MAKS_ALASAN } from "@/lib/ketentuanPelatihan";
import type { StatusUndangan, TeksKartuUndangan } from "@/lib/ketentuanPelatihan";

type Data = {
  kegiatan_id: number;
  tab_baru: boolean;
  ketentuan: { butir: string[]; versi: number };
  undangan: { hari_tanggal: string; pukul: string; tempat: string; tanggal_iso: string; pdf: string };
  peserta: { peran: string; kelas: number | null } | null;
  respons: { respons: "terima" | "tolak"; alasan: string | null } | null;
  status: StatusUndangan;
  berubah: boolean;
  kartu: TeksKartuUndangan;
  kamera_href: string | null;
  boleh_lihat_kelola: boolean;
  boleh_kelola: boolean;
};

const NADA: Record<TeksKartuUndangan["nada"], { kotak: string; chip: string; tombol: string }> = {
  emas: { kotak: "border-[#F4D78A] bg-[#FFFBEF]", chip: "bg-[#FFF4D6] text-[#8A6200]", tombol: BTN },
  hijau: { kotak: "border-[#BFE5D0] bg-[#F3FBF7]", chip: "bg-[#E3F6EC] text-[#13794B]", tombol: BTN_O },
  merah: { kotak: "border-[#F0C4BF] bg-[#FFF6F5]", chip: "bg-[#FDE8E8] text-[#B42329]", tombol: BTN_O },
};

function ModalKetentuan({ d, onTutup, onSelesai }: { d: Data; onTutup: () => void; onSelesai: () => void }) {
  const [setuju, setSetuju] = useState(false);
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const sudahTerima = d.status === "diterima";
  useTutupDenganBack(true, onTutup); // Back HP menutup modal ketentuan (penjaga Back, lib/__tests__/sigapBackGuard.test.ts)

  useEffect(() => {
    const tombol = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", tombol);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tombol);
      document.body.style.overflow = lama;
    };
  }, [onTutup]);

  async function jawab(respons: "terima" | "tolak") {
    setKirim(true);
    setGalat(null);
    try {
      await fetchJson("/api/sigap/pelatihan/ketentuan", { method: "POST", body: JSON.stringify({ aksi: "respons", respons, setuju, alasan }) });
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Ketentuan pelatihan" onClick={onTutup}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-white p-5 shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-extrabold text-[#0F2A52]">Ketentuan pelatihan</h2>
        <dl className="mt-3 rounded-xl bg-[#F3F6FB] p-3 text-[13.5px]">
          <div className="flex gap-3 py-1">
            <dt className="w-16 shrink-0 text-[#6B7A90]">Waktu</dt>
            <dd className="font-semibold">
              {d.undangan.hari_tanggal}
              {d.undangan.pukul ? `, ${d.undangan.pukul}` : ""}
            </dd>
          </div>
          <div className="flex gap-3 py-1">
            <dt className="w-16 shrink-0 text-[#6B7A90]">Tempat</dt>
            <dd className="font-semibold">{d.undangan.tempat || "Akan diinformasikan"}</dd>
          </div>
        </dl>
        {d.ketentuan.butir.length > 0 ? (
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
            {d.ketentuan.butir.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-[13px] text-[#6B7A90]">Belum ada ketentuan tambahan dari penanggung jawab.</p>
        )}
        {d.respons?.respons === "tolak" && d.respons.alasan && <p className="mt-3 text-[12.5px] text-[#7A1D22]">Alasan penolakan Anda: {d.respons.alasan}</p>}

        {d.peserta && !sudahTerima && !tolak && (
          <label className="mt-4 flex items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1F5FD1]" />
            <span>Saya sudah membaca dan menyetujui ketentuan pelatihan ini.</span>
          </label>
        )}
        {d.peserta && tolak && (
          <div className="mt-4">
            <label htmlFor="alasan-tolak" className="text-[13px] font-semibold">
              Alasan menolak
            </label>
            <textarea
              id="alasan-tolak"
              value={alasan}
              maxLength={MAKS_ALASAN}
              onChange={(e) => setAlasan(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#CBD6E6] p-2.5 text-[14px]"
              placeholder="Contoh: berhalangan karena tugas lain"
            />
          </div>
        )}
        {galat && (
          <div className="mt-3">
            <Pesan jenis="galat">{galat}</Pesan>
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_O} onClick={onTutup} disabled={kirim}>
            Tutup
          </button>
          {d.peserta && !sudahTerima && !tolak && (
            <>
              <button type="button" className={BTN_R} onClick={() => setTolak(true)} disabled={kirim}>
                Tolak
              </button>
              <button type="button" className={BTN} onClick={() => jawab("terima")} disabled={kirim || !setuju}>
                {kirim ? "Menyimpan…" : "Terima undangan"}
              </button>
            </>
          )}
          {d.peserta && tolak && (
            <>
              <button type="button" className={BTN_O} onClick={() => setTolak(false)} disabled={kirim}>
                Batal
              </button>
              <button type="button" className={BTN_R} onClick={() => jawab("tolak")} disabled={kirim || alasan.trim().length < 3}>
                {kirim ? "Menyimpan…" : "Kirim penolakan"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HalamanHariIni() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [buka, setBuka] = useState(false);
  const [unduh, setUnduh] = useState(false);
  const [galatPdf, setGalatPdf] = useState<string | null>(null);

  const muat = useCallback(() => {
    fetchJson<Data>("/api/sigap/pelatihan/ketentuan")
      .then((r) => {
        setD(r);
        setGalat(null);
      })
      .catch((e) => setGalat(pesanGalat(e)));
  }, []);
  useEffect(muat, [muat]);

  async function bukaPdf() {
    setUnduh(true);
    setGalatPdf(null);
    try {
      await bukaBlob("/api/sigap/pelatihan/undangan");
    } catch (e) {
      setGalatPdf(pesanGalat(e));
    } finally {
      setUnduh(false);
    }
  }

  const nada = d ? NADA[d.kartu.nada] : null;
  return (
    <Kerangka aktif="hari-ini" judul="Hari ini" sub={d ? `${d.undangan.hari_tanggal}${d.undangan.tempat ? ` · ${d.undangan.tempat}` : ""}` : undefined}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!d && !galat && <Memuat />}
      {d && !d.peserta && (
        <Pesan jenis="info">
          Akun Anda bukan peserta pelatihan ini, sehingga undangan pribadi tidak tersedia.{" "}
          {d.boleh_lihat_kelola && (
            <Link href="/sigap/kelola/pelatihan" className="font-bold text-[#1F5FD1] underline">
              Buka Kelola Pelatihan
            </Link>
          )}
        </Pesan>
      )}
      {d && d.peserta && nada && (
        <>
          <section className={`rounded-[18px] border p-4 ${nada.kotak}`} aria-label="Undangan pelatihan">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Undangan pelatihan</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${nada.chip}`}>{d.kartu.judul}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#3B4A60]">{d.kartu.ket}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={nada.tombol} onClick={() => setBuka(true)}>
                {d.kartu.tombol}
              </button>
              {d.undangan.pdf && (
                <button type="button" className={BTN_O} onClick={bukaPdf} disabled={unduh}>
                  {unduh ? "Menyiapkan…" : "Surat undangan (PDF)"}
                </button>
              )}
            </div>
            {galatPdf && (
              <div className="mt-2">
                <Pesan jenis="galat">{galatPdf}</Pesan>
              </div>
            )}
          </section>
          <KartuVanguardHariIni kegiatanId={d.kegiatan_id} />
          <AbsenPeserta />
          {!d.tab_baru && (
            <Kartu>
              <p className="text-[12.5px] text-[#6B7A90]">
                Tampilan lima tab belum diaktifkan untuk pelatihan ini.{" "}
                <Link href="/sigap/pelatihan" className="font-bold text-[#1F5FD1] underline">
                  Kembali ke Langkah pelatihan
                </Link>
              </p>
            </Kartu>
          )}
        </>
      )}
      {d && buka && (
        <ModalKetentuan
          d={d}
          onTutup={() => setBuka(false)}
          onSelesai={() => {
            setBuka(false);
            lupakanBenderaTab();
            muat();
          }}
        />
      )}
    </Kerangka>
  );
}
