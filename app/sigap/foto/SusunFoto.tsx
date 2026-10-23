"use client";

// app/sigap/foto/SusunFoto.tsx
//
// (21 Okt 2026) Panel "Nomor foto" per hari untuk kegiatan bermode Kamera SIGAP.
//  - Menampilkan 5 nomor (terisi/kosong) beserta foto Kamera SIGAP-nya, dan foto CADANGAN (sudah terkirim tetapi belum bernomor atau tergeser).
//  - `otomatis` (dipakai pada hari izin susulan): begitu panel terbuka, foto cadangan LANGSUNG disusun ke nomor yang masih kosong
//    (urut waktu; bila foto lebih banyak dari nomor kosong, dipilih yang sepadan lalu sisanya jadi cadangan). Tidak pernah menimpa nomor terisi.
//  - Bila hasil susun tidak sesuai: ketuk nomor lain pada foto itu (pindah/tukar), atau pasang foto cadangan ke nomor pilihan.
// Tidak ada penghapusan foto di sini.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ambilFotoUrl, ambilJson } from "./klien";
import { labelFoto } from "@/lib/sigapLabelFoto";
import { LABEL_KEPERCAYAAN, WARNA_KEPERCAYAAN, type Kepercayaan } from "@/lib/sigapFoto";

type FotoRingkas = { id: number; kode: string; kepercayaan: Kepercayaan; diambil_at: string; tahan?: boolean };
type Nomor = { slot: number; terisi: boolean; sumber: string | null; susulan: boolean; foto: FotoRingkas | null; ditahan?: FotoRingkas | null };
type Keadaan = { boleh: boolean; susulan: boolean; alasan_tutup: string | null; jumlah: number; nomor: Nomor[]; kosong: number[]; saran: number | null; ditahan?: number[]; cadangan: FotoRingkas[] };
type HasilIsi = { ditempatkan: { foto_id: number; slot: number }[]; ditahan?: { foto_id: number; slot: number }[]; cadangan: number; gagal?: { foto_id: number; error: string }[] };

// (23 Okt 2026) tanggal hari ini (WIB) di sisi klien: kamera hanya bisa memotret SEKARANG, jadi tombol "Ganti foto" hanya untuk hari ini
const hariIniWibKlien = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

const jam = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(11, 16).replace(":", ".");

function Mini({ id }: { id: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let batal = false;
    let u: string | null = null;
    ambilFotoUrl(id)
      .then((x) => {
        if (batal) URL.revokeObjectURL(x);
        else {
          u = x;
          setUrl(x);
        }
      })
      .catch(() => undefined);
    return () => {
      batal = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  if (!url) return <div className="h-16 w-16 flex-none animate-pulse rounded-lg bg-[#EEF2F7]" aria-label="Memuat foto" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Foto Kamera SIGAP" className="h-16 w-16 flex-none rounded-lg object-cover" />;
}

function Lencana({ k }: { k: Kepercayaan }) {
  return (
    <span className="inline-flex flex-none items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold leading-[1.4] text-white" style={{ background: WARNA_KEPERCAYAAN[k] }}>
      {LABEL_KEPERCAYAAN[k]}
    </span>
  );
}

function Pilihan({ label, jumlah, kecuali, sibuk, onPilih }: { label: string; jumlah: number; kecuali?: number; sibuk: boolean; onPilih: (n: number) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold text-[#55657D]">{label}</span>
      {Array.from({ length: jumlah }, (_, i) => i + 1)
        .filter((n) => n !== kecuali)
        .map((n) => (
          <button key={n} type="button" disabled={sibuk} onClick={() => onPilih(n)} aria-label={`${label} ${n}`} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#C9D3E6] bg-white text-sm font-extrabold text-[#0F2A52] disabled:opacity-50">
            {n}
          </button>
        ))}
    </div>
  );
}

export default function SusunFoto({
  kegiatanId,
  tanggal,
  jenis = null,
  otomatis = false,
  onBerubah,
}: {
  kegiatanId: number;
  tanggal: string;
  jenis?: string | null;
  otomatis?: boolean;
  onBerubah?: () => void | Promise<void>;
}) {
  const [k, setK] = useState<Keadaan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const sudahOtomatis = useRef(false);
  const etiket = labelFoto(jenis);

  const muat = useCallback(async () => {
    try {
      const d = await ambilJson<Keadaan>(`/api/sigap/foto/susun?kegiatan=${kegiatanId}&tanggal=${tanggal}`);
      setK(d);
      setGalat(null);
      return d;
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat nomor foto.");
      return null;
    }
  }, [kegiatanId, tanggal]);

  const kabari = useCallback(() => {
    void Promise.resolve(onBerubah?.()).catch(() => undefined);
  }, [onBerubah]);

  async function kirimAksi(badan: Record<string, unknown>) {
    return ambilJson<Record<string, unknown>>("/api/sigap/foto/susun", { method: "POST", body: { kegiatan_id: kegiatanId, tanggal, ...badan } });
  }

  async function isi() {
    setSibuk(true);
    setGalat(null);
    try {
      const r = (await kirimAksi({ aksi: "isi" })) as unknown as HasilIsi;
      const tahan = r.ditahan ?? [];
      if (r.ditempatkan.length || tahan.length) {
        const urut = [...r.ditempatkan].sort((a, b) => a.slot - b.slot).map((x) => x.slot).join(", ");
        const urutTahan = [...tahan].sort((a, b) => a.slot - b.slot).map((x) => x.slot).join(", ");
        setPesan(
          `${r.ditempatkan.length ? `${r.ditempatkan.length} foto Kamera SIGAP otomatis mengisi nomor ${urut}.` : ""}${tahan.length ? ` ${tahan.length} foto merah diberi nomor ${urutTahan} dan menunggu diperiksa PML/admin.` : ""}${r.cadangan ? ` ${r.cadangan} foto lain disimpan sebagai cadangan.` : ""} Bila tidak sesuai, ketuk nomor lain pada foto itu.`.trim()
        );
        kabari();
      } else if (r.gagal?.length) setGalat("Sebagian foto belum bisa dipasang. Coba lagi atau pasang manual.");
      else setPesan(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyusun foto.");
    } finally {
      await muat();
      setSibuk(false);
    }
  }

  async function aksiNomor(badan: Record<string, unknown>) {
    setSibuk(true);
    setGalat(null);
    setPesan(null);
    try {
      await kirimAksi(badan);
      kabari();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengubah nomor.");
    } finally {
      await muat();
      setSibuk(false);
    }
  }

  useEffect(() => {
    let batal = false;
    (async () => {
      const d = await muat();
      if (batal || !d || !otomatis || sudahOtomatis.current) return;
      if (d.boleh && d.cadangan.length > 0 && d.kosong.length > 0) {
        sudahOtomatis.current = true; // satu kali per pembukaan panel; sesudahnya petugas yang mengatur
        await isi();
      }
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muat, otomatis]);

  if (!k) return galat ? <div role="alert" className="rounded-xl bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galat}</div> : <div className="h-24 animate-pulse rounded-2xl bg-[#EEF2F7]" aria-label="Memuat nomor foto" />;
  if (k.nomor.every((n) => !n.terisi) && k.cadangan.length === 0 && !k.boleh) return null;

  const bisaUbah = k.boleh && !sibuk;
  const bisaKamera = bisaUbah && !k.susulan && tanggal === hariIniWibKlien();
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-[#C9D3E6] bg-white p-3" aria-label="Nomor foto Kamera SIGAP">
      <div>
        <div className="text-sm font-extrabold text-[#0F2A52]">Nomor foto {k.nomor.filter((n) => n.terisi).length}/{k.jumlah}</div>
        <p className="text-[11.5px] leading-relaxed text-[#3C4C68]">
          {k.susulan && otomatis ? "Foto Kamera SIGAP tanggal ini disusun otomatis ke nomor yang masih kosong. " : ""}
          Ketuk nomor lain pada sebuah foto untuk memindahkannya.{bisaKamera ? " Salah foto? Ketuk Ganti foto: kamera terbuka dan foto baru langsung menggantikan nomor itu (foto lama tersimpan sebagai cadangan)." : ""}
        </p>
      </div>

      {pesan && <div role="status" className="rounded-lg bg-[#E3F6EC] px-3 py-2 text-xs font-semibold text-[#0B6B3F]">{pesan}</div>}
      {galat && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{galat}</div>}
      {!k.boleh && k.alasan_tutup && <div className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs text-[#5E4300]">{k.alasan_tutup}</div>}

      <ol className="flex flex-col gap-2">
        {k.nomor.map((n) => (
          <li key={n.slot} className={`rounded-xl border px-3 py-2 ${n.terisi ? "border-[#C9D3E6] bg-[#F7F9FD]" : "border-dashed border-[#C9D3E6] bg-white"}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-extrabold ${n.terisi ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F7] text-[#0F2A52]"}`}>{n.slot}</span>
              {(n.foto ?? n.ditahan) && <Mini id={(n.foto ?? n.ditahan)!.id} />}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-[#0F2A52]">{etiket[n.slot - 1] ?? `Foto ${n.slot}`}</div>
                {n.terisi ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#3C4C68]">
                    {n.foto ? (
                      <>
                        <span>Kamera SIGAP · {jam(n.foto.diambil_at)} WIB</span>
                        <Lencana k={n.foto.kepercayaan} />
                      </>
                    ) : (
                      <span>Unggahan manual{n.susulan ? " · susulan" : ""}</span>
                    )}
                  </div>
                ) : n.ditahan ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold text-[#8A6200]">
                    <span>Dipesan foto {jam(n.ditahan.diambil_at)} WIB, menunggu diperiksa PML/admin</span>
                    <Lencana k={n.ditahan.kepercayaan} />
                  </div>
                ) : (
                  <div className="text-[11.5px] font-semibold text-[#8A6200]">Masih kosong</div>
                )}
              </div>
            </div>
            {n.terisi && bisaUbah && <Pilihan label="Pindah ke nomor" jumlah={k.jumlah} kecuali={n.slot} sibuk={sibuk} onPilih={(ke) => void aksiNomor({ aksi: "pindah", dari: n.slot, ke })} />}
            {n.terisi && bisaKamera && (
              <Link href={`/sigap/foto?kegiatan=${kegiatanId}&nomor=${n.slot}`} className="mt-2 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 border-[#0F2A52] bg-white px-3 text-[13px] font-extrabold text-[#0F2A52]">
                📷 Ganti foto {n.slot}
              </Link>
            )}
          </li>
        ))}
      </ol>

      {k.cadangan.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-extrabold text-[#0F2A52]">Foto cadangan ({k.cadangan.length})</div>
          <p className="text-[11.5px] leading-relaxed text-[#3C4C68]">Sudah terkirim dari Kamera SIGAP tetapi belum menempati nomor. Tetap tersimpan; pasang ke nomor yang sesuai.</p>
          {k.cadangan.map((f) => (
            <div key={f.id} className="rounded-xl border border-[#C9D3E6] bg-white px-3 py-2">
              <div className="flex items-center gap-3">
                <Mini id={f.id} />
                <div className="min-w-0 flex-1 text-[11.5px] text-[#3C4C68]">
                  <div className="text-[13px] font-bold text-[#0F2A52]">Foto {jam(f.diambil_at)} WIB</div>
                  <Lencana k={f.kepercayaan} />
                  {f.tahan && <div className="mt-1 text-[11px] font-semibold text-[#8A6200]">Foto merah: nomornya dipesan dulu, baru tercatat setelah diperiksa PML/admin.</div>}
                </div>
              </div>
              {bisaUbah && <Pilihan label="Pasang di nomor" jumlah={k.jumlah} sibuk={sibuk} onPilih={(slot) => void aksiNomor({ aksi: "pasang", foto_id: f.id, slot })} />}
            </div>
          ))}
          {bisaUbah && k.kosong.length > 0 && (
            <button type="button" onClick={() => void isi()} disabled={sibuk} className="min-h-[48px] rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-50">
              {sibuk ? "Menyusun…" : "Isi nomor kosong otomatis"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
