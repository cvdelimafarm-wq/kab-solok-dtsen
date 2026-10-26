"use client";

// app/sigap/delego/BuktiFoto.tsx
//
// (26 Okt 2026) Bukti foto laporan harian Delego (sisi layar). Foto dikecilkan di HP (sisi terpanjang 1600 px, JPEG) lalu diunggah ke
// /api/sigap/delego/bukti; yang tersimpan pada laporan hanya lokasi berkas. Menampilkan foto juga lewat rute itu (butuh sesi), jadi gambar diambil
// dengan fetch lalu dijadikan alamat blob. Logika murni: lib/delego/bukti.ts.

import { useEffect, useRef, useState } from "react";
import { bacaSesi } from "@/app/portal/sesi";
import { bacaDaftar, MAKS_BYTE, ukuranKecil } from "@/lib/delego/bukti";
import { tautanButir } from "@/lib/delego/teknis";

const KELAS_TOMBOL = "inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[#B8C4CC] bg-white px-3 text-[13px] font-semibold text-[#14212B] hover:bg-[#F1F5F4] disabled:opacity-60";

/** Mengecilkan foto di HP. Mengembalikan berkas JPEG, atau galat bila gambar tidak terbaca (mis. HEIC di peramban yang tidak mendukung). */
async function kecilkan(f: File): Promise<File | string> {
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const { w, h } = ukuranKecil(bmp.width, bmp.height);
    const kanvas = document.createElement("canvas");
    kanvas.width = w;
    kanvas.height = h;
    const g = kanvas.getContext("2d");
    if (!g) return "Peramban tidak dapat memproses foto.";
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((ok) => kanvas.toBlob(ok, "image/jpeg", 0.82));
    if (!blob) return "Foto gagal diproses.";
    return new File([blob], "bukti.jpg", { type: "image/jpeg" });
  } catch {
    return "Foto tidak terbaca. Pakai foto berformat JPG, PNG, atau WebP.";
  }
}

export type HasilUnggah = { ok: true; path: string } | { ok: false; pesan: string };

/** Mengecilkan lalu mengunggah satu foto bukti untuk delegasi `delegasi`. */
export async function unggahFoto(delegasi: number, f: File): Promise<HasilUnggah> {
  const kecil = await kecilkan(f);
  if (typeof kecil === "string") return { ok: false, pesan: kecil };
  if (kecil.size > MAKS_BYTE) return { ok: false, pesan: "Foto masih terlalu besar." };
  const sesi = bacaSesi();
  const form = new FormData();
  form.set("berkas", kecil);
  form.set("delegasi", String(delegasi));
  try {
    const res = await fetch("/api/sigap/delego/bukti", { method: "POST", body: form, headers: sesi ? { Authorization: `Bearer ${sesi}` } : {} });
    const j = (await res.json().catch(() => ({}))) as { data?: { path: string }; error?: string };
    if (res.status === 401) return { ok: false, pesan: "Sesi berakhir. Silakan masuk kembali." };
    if (!res.ok || !j.data) return { ok: false, pesan: j.error ?? `Gagal mengunggah (${res.status})` };
    return { ok: true, path: j.data.path };
  } catch {
    return { ok: false, pesan: "Tidak ada sambungan. Coba lagi saat sinyal ada." };
  }
}

/** Mengambil foto (butuh sesi) dan memberi alamat blob; null selama memuat, "galat" bila gagal. */
function useAlamatFoto(path: string): string | null | "galat" {
  const [alamat, setAlamat] = useState<string | null | "galat">(null);
  useEffect(() => {
    let batal = false;
    let url: string | null = null;
    setAlamat(null);
    (async () => {
      try {
        const sesi = bacaSesi();
        const res = await fetch(`/api/sigap/delego/bukti?path=${encodeURIComponent(path)}`, { headers: sesi ? { Authorization: `Bearer ${sesi}` } : {} });
        if (!res.ok) throw new Error(String(res.status));
        url = URL.createObjectURL(await res.blob());
        if (batal) URL.revokeObjectURL(url);
        else setAlamat(url);
      } catch {
        if (!batal) setAlamat("galat");
      }
    })();
    return () => {
      batal = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);
  return alamat;
}

/** Gambar mini; mengetuk membukanya di tab baru. */
export function FotoBukti({ path, ket, ukuran = 72 }: { path: string; ket?: string; ukuran?: number }) {
  const alamat = useAlamatFoto(path);
  const kotak = { width: ukuran, height: ukuran } as const;
  if (alamat === null) return <span className="inline-block animate-pulse rounded-lg bg-[#E1E6EA]" style={kotak} aria-label="Memuat foto" />;
  if (alamat === "galat") return <span className="inline-flex items-center justify-center rounded-lg border border-dashed border-[#B8C4CC] px-1 text-center text-[11px] text-[#6B7783]" style={kotak}>Foto tidak dapat dimuat</span>;
  return (
    <a href={alamat} target="_blank" rel="noreferrer" title={ket || "Foto bukti"} className="inline-block overflow-hidden rounded-lg border border-[#B8C4CC]" style={kotak}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={alamat} alt={ket || "Foto bukti"} className="h-full w-full object-cover" />
    </a>
  );
}

/** Daftar bukti suatu laporan: foto sebagai gambar mini, teks lama sebagai tulisan. Tidak menampilkan apa pun bila kosong. */
export function DaftarBukti({ bukti, ukuran = 72 }: { bukti: unknown[] | null | undefined; ukuran?: number }) {
  const daftar = bacaDaftar(bukti);
  if (daftar.length === 0) return null;
  const foto = daftar.filter((b) => b.path);
  const teks = daftar.filter((b) => !b.path);
  return (
    <div className="mt-1 space-y-1">
      {foto.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {foto.map((b, i) => (<FotoBukti key={`${b.path}-${i}`} path={b.path as string} ket={b.ket} ukuran={ukuran} />))}
        </div>
      )}
      {teks.length > 0 && <div className="text-[12.5px] text-[#3B4A57]">Bukti: {teks.map((b) => b.teks).join("; ")}</div>}
    </div>
  );
}

/** Butir hasil kerja: foto sebagai gambar mini, tautan http/https dapat diklik, teks lain apa adanya. */
export function DaftarButir({ butir, ukuran = 72 }: { butir: unknown[] | null | undefined; ukuran?: number }) {
  const daftar = bacaDaftar(butir);
  if (daftar.length === 0) return null;
  return (
    <ul className="m-0 list-none space-y-1.5 p-0">
      {daftar.map((b, i) => {
        const url = b.path ? null : tautanButir(b.teks);
        return (
          <li key={`${b.path ?? b.teks}-${i}`} className="text-[13px]">
            {b.path ? (
              <div className="flex items-center gap-2">
                <FotoBukti path={b.path} ket={b.ket} ukuran={ukuran} />
                {b.ket && <span className="text-[#33404B]">{b.ket}</span>}
              </div>
            ) : url ? (
              <a href={url} target="_blank" rel="noreferrer noopener" className="break-all font-semibold text-[#0B524C] underline">{url}</a>
            ) : (
              <span className="break-words text-[#33404B]">{b.teks}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type ButirForm = { ket: string; path: string | null };

/** Penyunting bukti pada formulir Lapor: foto (ambil atau pilih), keterangan tiap butir, dan tautan/teks. */
export function PenyuntingBukti({ delegasi, butir, onUbah, maks = 5, mati, judul, teksBantu, wajib }: { delegasi: number; butir: ButirForm[]; onUbah: (b: ButirForm[]) => void; maks?: number; mati?: boolean; judul?: string; teksBantu?: string; wajib?: boolean }) {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const galeri = useRef<HTMLInputElement>(null);
  const sisa = maks - butir.length;

  async function tambahFoto(files: FileList | null) {
    if (!files || files.length === 0) return;
    setGalat(null);
    setSibuk(true);
    let baru = [...butir];
    for (const f of Array.from(files).slice(0, Math.max(0, maks - baru.length))) {
      const h = await unggahFoto(delegasi, f);
      if (!h.ok) {
        setGalat(h.pesan);
        break;
      }
      baru = [...baru.filter((b) => b.ket !== "" || b.path !== null), { ket: "", path: h.path }];
      onUbah(baru);
    }
    setSibuk(false);
    if (kamera.current) kamera.current.value = "";
    if (galeri.current) galeri.current.value = "";
  }

  const ubahKet = (i: number, ket: string) => onUbah(butir.map((b, j) => (j === i ? { ...b, ket } : b)));
  const buang = (i: number) => onUbah(butir.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="text-[13px] font-semibold">{judul ?? `Bukti (${wajib ? "wajib, " : "opsional, "}maksimal ${maks})`}</div>
      {butir.map((b, i) => (
        <div key={i} className="flex items-start gap-2">
          {b.path && <FotoBukti path={b.path} ket={b.ket} ukuran={56} />}
          <input
            className="min-h-[40px] w-full rounded-lg border border-[#B8C4CC] bg-white px-3 text-[14px]"
            value={b.ket}
            maxLength={120}
            disabled={mati}
            placeholder={b.path ? "Keterangan foto (opsional)" : "Nama berkas atau tautan bukti"}
            onChange={(e) => ubahKet(i, e.target.value)}
          />
          <button type="button" className={KELAS_TOMBOL} aria-label={`Lepas bukti ${i + 1}`} disabled={mati} onClick={() => buang(i)}>Lepas</button>
        </div>
      ))}
      <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void tambahFoto(e.target.files)} />
      <input ref={galeri} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void tambahFoto(e.target.files)} />
      {sisa > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={KELAS_TOMBOL} disabled={mati || sibuk} onClick={() => kamera.current?.click()}>{sibuk ? "Mengunggah..." : "Ambil foto"}</button>
          <button type="button" className={KELAS_TOMBOL} disabled={mati || sibuk} onClick={() => galeri.current?.click()}>Pilih dari galeri</button>
          <button type="button" className={KELAS_TOMBOL} disabled={mati || sibuk} onClick={() => onUbah([...butir, { ket: "", path: null }])}>+ Tulis nama atau tautan</button>
        </div>
      )}
      {galat && <p role="alert" className="m-0 text-[12.5px] text-[#B42329]">{galat}</p>}
      <p className="m-0 text-[12px] text-[#3B4A57]">{teksBantu ?? "Foto dikecilkan otomatis sebelum diunggah. Foto baru tersimpan pada laporan setelah Anda menekan Kirim laporan."}</p>
    </div>
  );
}
