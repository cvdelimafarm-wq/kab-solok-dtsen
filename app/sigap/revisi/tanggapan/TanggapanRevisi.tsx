"use client";

// app/sigap/revisi/tanggapan/TanggapanRevisi.tsx
//
// (7 Nov 2026, tahap 4c) Tanggapan ketua tim dan wakil terhadap siklus revisi, satu pilihan per RO:
//   Ajukan sekarang  -> membuka kertas kerja revisi RO itu;
//   Ingatkan saya    -> pilih waktu (pintasan atau bebas); membuat butir Delego dan pengingat; boleh 2 kali;
//   Tidak mengusulkan -> tercatat (alasan opsional), dapat dibuka lagi sampai siklus ditutup.
// ModalTanggapanRevisi menutupi halaman Delego dan Revisi bila ada RO yang wajib ditanggapi (belum ditanggapi, atau pengingat sudah jatuh tempo),
// dan tidak dapat ditutup sebelum semuanya ditanggapi. Aturan sebenarnya ditegakkan basis data (20261107l); logika tampilan: lib/keu/siklusRevisi.ts.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HALAMAN_TANGGAPAN, bisaBukaLagi, kabarAksi, keadaanRo, labelTanggal, periksaWaktuBebas, pilihanTersedia, pintasanWaktu, tautKertas, teksSisaTunda, tglWib, yangWajib,
  type PilihanTanggapan, type TanggapanSaya,
} from "@/lib/keu/siklusRevisi";
import { caps, Chip, kolom, label, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { aksiKeu } from "../../ro/useKeu";

const JEDA_SEGAR_MS = 120_000;

/** Tanggapan RO milik akun ini pada siklus yang sedang dibuka (keu_tanggapan_saya). Menyegarkan tiap 2 menit dan saat tab kembali terlihat. */
export function useTanggapanSaya(aktif = true) {
  const [baris, setBaris] = useState<TanggapanSaya[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(async () => {
    const r = await aksiKeu<TanggapanSaya[]>("keu_tanggapan_saya", {});
    if (r.ok) { setBaris(Array.isArray(r.data) ? r.data : []); setGalat(null); }
    else { setGalat(r.pesan); setBaris((b) => b ?? []); }
  }, []);
  useEffect(() => {
    if (!aktif) return;
    void muat();
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void muat(); }, JEDA_SEGAR_MS);
    const lihat = () => { if (document.visibilityState === "visible") void muat(); };
    document.addEventListener("visibilitychange", lihat);
    return () => { window.clearInterval(iv); document.removeEventListener("visibilitychange", lihat); };
  }, [aktif, muat]);
  return { baris, galat, muat };
}

type Mode = null | "ingat" | "tidak";

export function BarisTanggapan({ t, sesudah, onKabar, kompak }: { t: TanggapanSaya; sesudah: () => void | Promise<void>; onKabar?: (k: string) => void; kompak?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [tgl, setTgl] = useState("");
  const [jam, setJam] = useState("");
  const [lokal, setLokal] = useState<string | null>(null);
  const pilihan = pilihanTersedia(t);
  const keadaan = keadaanRo(t);
  const sekarang = new Date();
  const pintas = useMemo(() => pintasanWaktu(new Date(), t.tutup), [t.tutup, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const jalan = async (p: PilihanTanggapan | "buka", fungsi: string, args: Record<string, unknown>) => {
    setSibuk(true); setGalat(null);
    const r = await aksiKeu<{ ingat_at?: string | null; peringatan?: string | null; ada_kurang?: boolean }>(fungsi, { p_jadwal: t.jadwal_id, p_ro: t.ro_kode, ...args });
    setSibuk(false);
    if (!r.ok) { setGalat(r.pesan); await sesudah(); return false; }
    const kabar = kabarAksi(p, t.ro_kode, r.data ?? null);
    if (onKabar) onKabar(kabar); else setLokal(kabar);
    setMode(null); setAlasan(""); setTgl(""); setJam("");
    await sesudah();
    return true;
  };

  const ingatPada = (iso: string) => void jalan("ingat", "keu_tanggapan_ingat", { p_waktu: iso });
  const periksa = tgl && jam ? periksaWaktuBebas(tgl, jam, sekarang, t.tutup) : null;

  return (
    <div className={`flex flex-col gap-2 rounded-xl border border-[#DCE3EE] bg-white ${kompak ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-mono text-[14px] text-[#0F2A52]">{t.ro_kode}</b>
        <Chip warna={keadaan.warna}>{keadaan.teks}</Chip>
        {t.ada_kurang && t.status === "tidak" && <Chip warna="kuning">Ada butir kurang belum terdanai</Chip>}
      </div>
      {t.status === "tidak" && t.alasan && <p className="text-[12.5px] text-[#5B6B84]">Alasan: {t.alasan}</p>}
      {lokal && <p className="rounded-md bg-[#EAF6EF] px-3 py-2 text-[12.5px] text-[#14653A]" role="status">{lokal}</p>}

      {pilihan.length > 0 && mode === null && (
        <>
          <div className="flex flex-wrap gap-2">
            {pilihan.includes("ajukan") && (
              <button type="button" className={tombolUtama} disabled={sibuk} onClick={() => void jalan("ajukan", "keu_tanggapan_ajukan", {}).then((ok) => { if (ok) router.push(tautKertas(t)); })}>
                Ajukan sekarang
              </button>
            )}
            {pilihan.includes("ingat") && <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => { setGalat(null); setMode("ingat"); }}>Ingatkan saya</button>}
            {pilihan.includes("tidak") && <button type="button" className={tombolBahaya} disabled={sibuk} onClick={() => { setGalat(null); setMode("tidak"); }}>Tidak mengusulkan revisi</button>}
          </div>
          {t.status !== "belum" || t.tunda_kali > 0 ? <p className="text-[12px] text-[#5B6B84]">{teksSisaTunda(t)}</p> : null}
        </>
      )}

      {mode === "ingat" && (
        <div className="flex flex-col gap-2 rounded-lg bg-[#F5F8FE] p-3">
          <span className={caps}>Ingatkan saya pada</span>
          <div className="flex flex-wrap gap-2">
            {pintas.map((p) => (
              <button key={p.kunci} type="button" className={tombolKecil} disabled={sibuk} onClick={() => ingatPada(p.iso)}>
                {p.label}
                <span className="ml-1 font-normal text-[#5B6B84]">({new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(p.iso))})</span>
              </button>
            ))}
            {pintas.length === 0 && <span className="text-[12.5px] text-[#5B6B84]">Siklus segera ditutup; pilih tanggal dan jam sendiri atau tanggapi sekarang.</span>}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[150px] flex-1"><label className={label} htmlFor={`tg-${t.jadwal_id}-${t.ro_kode}`}>Tanggal</label>
              <input id={`tg-${t.jadwal_id}-${t.ro_kode}`} type="date" className={kolom} value={tgl} min={tglWib(sekarang)} max={t.tutup} onChange={(e) => setTgl(e.target.value)} /></div>
            <div className="min-w-[120px] flex-1"><label className={label} htmlFor={`jm-${t.jadwal_id}-${t.ro_kode}`}>Jam (WIB)</label>
              <input id={`jm-${t.jadwal_id}-${t.ro_kode}`} type="time" className={kolom} value={jam} onChange={(e) => setJam(e.target.value)} /></div>
            <button type="button" className={tombolUtama} disabled={sibuk || !periksa || !periksa.ok} onClick={() => periksa && periksa.ok && ingatPada(periksa.iso)}>Ingatkan</button>
            <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => setMode(null)}>Batal</button>
          </div>
          {periksa && !periksa.ok && <p className="text-[12.5px] font-semibold text-[#B42329]">{periksa.pesan}</p>}
          {periksa && periksa.ok && periksa.peringatan && <p className="text-[12.5px] font-semibold text-[#8A6200]">{periksa.peringatan}</p>}
          <p className="text-[12px] text-[#5B6B84]">Dibuat butir pengingat di Delego dengan tenggat sesuai waktu ini. {teksSisaTunda(t)}</p>
        </div>
      )}

      {mode === "tidak" && (
        <div className="flex flex-col gap-2 rounded-lg bg-[#FDF3F3] p-3">
          <p className="text-[13px] text-[#1B2B4B]">RO ini tidak mengusulkan revisi pada siklus ini. Tercatat atas nama Anda dan dapat dibuka kembali sampai siklus ditutup ({labelTanggal(t.tutup)}).</p>
          <div><label className={label} htmlFor={`al-${t.jadwal_id}-${t.ro_kode}`}>Alasan (opsional, maks. 300 huruf)</label>
            <textarea id={`al-${t.jadwal_id}-${t.ro_kode}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={alasan} onChange={(e) => setAlasan(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={tombolUtama} disabled={sibuk} onClick={() => void jalan("tidak", "keu_tanggapan_tidak", { p_alasan: alasan.trim() || null })}>Ya, tidak mengusulkan</button>
            <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => setMode(null)}>Batal</button>
          </div>
        </div>
      )}

      {bisaBukaLagi(t) && mode === null && (
        <div><button type="button" className={tombolKecil} disabled={sibuk} onClick={() => void jalan("buka", "keu_tanggapan_buka_lagi", {})}>Buka kembali</button></div>
      )}
      {t.status === "ajukan" && !t.sudah_usulan && t.masih_buka && (
        <div><Link href={tautKertas(t)} className={`${tombolKecil} inline-flex items-center no-underline`}>Buka kertas kerja</Link></div>
      )}
      {galat && <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
    </div>
  );
}

/** Modal pemblokir: tampil di halaman Delego dan Revisi selama ada RO yang wajib ditanggapi. Tidak tampil di halaman Tanggapan itu sendiri. */
export function ModalTanggapanRevisi() {
  const jalur = usePathname();
  const dihalaman = jalur === HALAMAN_TANGGAPAN;
  const { baris, muat } = useTanggapanSaya(!dihalaman);
  const [kabar, setKabar] = useState<string[]>([]);
  const wajib = useMemo(() => yangWajib(baris ?? []), [baris]);
  if (dihalaman || (wajib.length === 0 && kabar.length === 0)) return null;
  const tutupBoleh = wajib.length === 0;
  const jadwal = wajib[0];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="mdl-rev-judul">
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-[20px] bg-[#F5F8FE] p-4 shadow-xl">
        <b id="mdl-rev-judul" className="text-[17px] font-extrabold leading-snug text-[#0F2A52]">
          {tutupBoleh ? "Tanggapan tercatat" : "Siklus revisi menunggu tanggapan Anda"}
        </b>
        {jadwal && (
          <p className="text-[13.5px] leading-snug text-[#1B2B4B]">
            {jadwal.judul}: pengumpulan sampai <b>{labelTanggal(jadwal.tutup)}</b>. Pilih satu tanggapan untuk tiap RO di bawah. Anda dapat meminta diingatkan nanti (paling banyak 2 kali).
          </p>
        )}
        {kabar.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {kabar.map((k, i) => <li key={i} className="rounded-md bg-[#EAF6EF] px-3 py-2 text-[12.5px] text-[#14653A]" role="status">{k}</li>)}
          </ul>
        )}
        {wajib.map((t) => (
          <BarisTanggapan key={`${t.jadwal_id}-${t.ro_kode}`} t={t} kompak sesudah={muat} onKabar={(k) => setKabar((x) => [...x, k].slice(-6))} />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={HALAMAN_TANGGAPAN} className="text-[13px] font-semibold text-[#1F5FD1] underline">Lihat semua RO saya</Link>
          {tutupBoleh && <button type="button" className={tombolUtama} onClick={() => setKabar([])}>Tutup</button>}
        </div>
      </div>
    </div>
  );
}
