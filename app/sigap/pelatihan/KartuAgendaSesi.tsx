"use client";

// app/sigap/pelatihan/KartuAgendaSesi.tsx
//
// (9 Nov 2026) Kartu "Agenda sesi" di tab Hari ini untuk INSTRUKTUR kelas: tombol Mulai / Selesai untuk Pretest dan Posttest kelasnya.
// Tampil HANYA bila akun ini instruktur sebuah kelas yang punya baris agenda (server yang memutuskan: GET /api/sigap/pelatihan/agenda);
// bagi akun lain (peserta, panitia, admin) kartu tidak digambar. Muat ulang otomatis tiap 5 detik. Peserta melihat "Menunggu instruktur memulai".

import { useCallback, useEffect, useRef, useState } from "react";
import { SesiBerakhir, fetchJson, pesanGalat } from "../admin/api";
import { BTN, BTN_G, BTN_O, BTN_R, Chip, Kartu, Pesan } from "../admin/ui";
import { jamWib } from "./komponen";
import { LABEL_STATUS_AGENDA, aksiTersedia, peringatanMulai, type AksiAgenda, type StatusAgenda } from "@/lib/sigapAgenda";

type Sesi = {
  id: number;
  tes_id: number;
  jenis: string;
  judul: string;
  kelas: number;
  durasi_menit: number;
  jendela_menit: number;
  status: StatusAgenda;
  mulai_at: string | null;
  tutup_at: string | null;
  jumlah_soal: number;
  mulai: number;
  selesai: number;
};
type Keadaan = { ada: false } | { ada: true; sekarang: string; sesi: Sesi[] };

const WARNA: Record<StatusAgenda, "wait" | "ok" | "mut"> = { menunggu: "wait", berjalan: "ok", selesai: "mut" };

export default function KartuAgendaSesi({ kegiatanId }: { kegiatanId: number }) {
  const url = `/api/sigap/pelatihan/agenda?kegiatan=${kegiatanId}`;
  const [k, setK] = useState<Keadaan | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  /** Tombol yang sedang meminta konfirmasi: `${tes_id}:${aksi}` */
  const [yakin, setYakin] = useState<string | null>(null);
  const terbang = useRef(false);

  const muat = useCallback(async () => {
    if (terbang.current) return;
    terbang.current = true;
    try {
      setK(await fetchJson<Keadaan>(url));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setK((lama) => lama ?? { ada: false });
    } finally {
      terbang.current = false;
    }
  }, [url]);

  useEffect(() => {
    void muat();
    const t = setInterval(() => { if (document.visibilityState === "visible") void muat(); }, 15000);
    const lihat = () => { if (document.visibilityState === "visible") void muat(); };
    document.addEventListener("visibilitychange", lihat);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", lihat); };
  }, [muat]);

  async function jalankan(s: Sesi, aksi: AksiAgenda) {
    setSibuk(s.tes_id);
    setGalat(null);
    setYakin(null);
    try {
      setK(await fetchJson<Keadaan>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tes_id: s.tes_id, aksi }) }));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  if (!k || !k.ada) return null;
  const semua = k.sesi.map((s) => ({ jenis: s.jenis, status: s.status }));
  const sekarangMs = new Date(k.sekarang).getTime();

  return (
    <Kartu judul="Agenda sesi kelas Anda" ket="Tes dimulai oleh Anda">
      <div id="langkah-agenda" className="space-y-3">
        {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
        {k.sesi.map((s) => {
          const aksi = aksiTersedia(s.status)[0];
          const kunci = `${s.tes_id}:${aksi}`;
          const peringatan = aksi === "mulai" ? peringatanMulai(s.jenis, semua) : null;
          const perluYakin = aksi === "selesai" || (aksi === "mulai" && !!peringatan) || aksi === "buka_lagi";
          const sisaMenit = s.tutup_at ? Math.max(0, Math.ceil((new Date(s.tutup_at).getTime() - sekarangMs) / 60_000)) : null;
          return (
            <div key={s.id} className="rounded-[14px] border border-[#DDE6F3] bg-[#F9FBFE] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-[14.5px] text-[#0F2A52]">{s.judul}</b>
                <Chip w={WARNA[s.status]}>{LABEL_STATUS_AGENDA[s.status]}</Chip>
                {s.kelas > 0 && <span className="text-[12px] text-[#6B7A90]">Kelas {s.kelas}</span>}
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-[#55657D]">
                {s.jumlah_soal} soal · {s.durasi_menit} menit per peserta · terbuka sampai 23.59 WIB hari yang sama
                {s.status === "berjalan" && s.mulai_at ? ` · dimulai ${jamWib(s.mulai_at)} WIB, jendela tutup ${s.tutup_at ? jamWib(s.tutup_at) : ""} WIB${sisaMenit !== null ? ` (sisa ${sisaMenit} menit)` : ""}` : ""}
                {s.status === "selesai" && s.mulai_at ? ` · dimulai ${jamWib(s.mulai_at)} WIB, jendela ditutup ${s.tutup_at ? jamWib(s.tutup_at) : ""} WIB` : ""}
              </p>
              {s.status !== "menunggu" && (
                <p className="mt-0.5 text-[12.5px] font-semibold text-[#0F2A52]">
                  {s.mulai} peserta sudah memulai · {s.selesai} selesai
                </p>
              )}
              {s.jumlah_soal === 0 && <p className="mt-1 text-[12.5px] text-[#8A6200]">Soal belum diunggah; peserta belum bisa mengerjakan.</p>}
              {aksi && (
                <div className="mt-2.5">
                  {yakin === kunci ? (
                    <div className="rounded-[12px] border border-[#F4D78A] bg-[#FFFBEF] p-2.5">
                      <p className="text-[12.5px] leading-snug text-[#5B4300]">
                        {peringatan ? `${peringatan} Tetap mulai ${s.judul}?` : aksi === "selesai" ? "Tutup jendela mulai? Peserta yang belum memulai tidak bisa memulai lagi; yang sedang mengerjakan tetap bisa menyelesaikan." : "Buka lagi jendela mulai dari sekarang?"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className={aksi === "selesai" ? BTN_R : BTN} disabled={sibuk !== null} onClick={() => void jalankan(s, aksi)}>
                          {aksi === "mulai" ? "Ya, mulai" : aksi === "selesai" ? "Ya, selesaikan" : "Ya, buka lagi"}
                        </button>
                        <button type="button" className={BTN_O} onClick={() => setYakin(null)}>
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`${aksi === "mulai" ? BTN_G : aksi === "selesai" ? BTN_R : BTN_O} min-h-[44px] px-4 text-[13.5px]`}
                      disabled={sibuk !== null || (aksi === "mulai" && s.jumlah_soal === 0)}
                      onClick={() => (perluYakin ? setYakin(kunci) : void jalankan(s, aksi))}
                    >
                      {sibuk === s.tes_id ? "Memproses…" : aksi === "mulai" ? `Mulai ${s.judul}` : aksi === "selesai" ? "Selesaikan sesi" : "Buka lagi"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[11.5px] leading-snug text-[#6B7A90]">Setelah Mulai, peserta kelas Anda bisa mengerjakan saat itu juga. Tiap peserta mendapat waktu yang sama sejak ia menekan Mulai di HP-nya; tes terbuka seharian (sampai 23.59 WIB hari yang sama) atau sampai Anda menekan Selesai.</p>
      </div>
    </Kartu>
  );
}
