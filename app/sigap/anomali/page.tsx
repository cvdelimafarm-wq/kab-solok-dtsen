"use client";

// app/sigap/anomali/page.tsx
//
// (31 Okt 2026) TEMUAN ANOMALI SAYA (petugas PPL/PML/Mitra): temuan hasil impor admin yang ditugaskan ke akun ini, dikonfirmasi dengan penyebab baku + catatan.
// Tab "Tim saya" (hanya baca) muncul bila akun ini PML dari petugas yang punya temuan. API: /api/sigap/anomali. Logika: lib/sigapAnomali.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { HeaderAdmin, BTN_G, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan } from "../admin/ui";
import { bacaSesi, fetchJson, keluar, keMasuk, pesanGalat, SesiBerakhir, waktuWib } from "../admin/api";
import TombolKembali from "@/app/components/TombolKembali";
import { LABEL_STATUS, PENYEBAB, labelPenyebab, type RingkasTemuan, type StatusTemuan } from "@/lib/sigapAnomali";

const URL_API = "/api/sigap/anomali";

type Temuan = {
  id: number;
  akun_id: number | null;
  kegiatan_nama: string;
  petugas_nama: string;
  kode_temuan: string;
  kelompok: string | null;
  rekomendasi: string | null;
  makna: string | null;
  id_sampel: string | null;
  periode: string | null;
  keterangan: string | null;
  rincian: Record<string, string>;
  status: StatusTemuan;
  penyebab: string | null;
  catatan: string | null;
  dikonfirmasi_at: string | null;
};
type Data = { ringkas: RingkasTemuan; temuan: Temuan[] };
type Tab = "menunggu" | "selesai" | "tim";

export default function TemuanSaya() {
  const [saya, setSaya] = useState<Data | null>(null);
  const [tim, setTim] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("menunggu");

  const muat = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetchJson<Data>(`${URL_API}?mode=saya`), fetchJson<Data>(`${URL_API}?mode=tim`)]);
      setSaya(a);
      setTim(b);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void muat();
  }, [muat]);

  const daftar = useMemo(() => {
    if (!saya) return [];
    if (tab === "tim") return tim?.temuan ?? [];
    return saya.temuan.filter((t) => (tab === "menunggu" ? t.status === "menunggu" : t.status === "dikonfirmasi"));
  }, [saya, tim, tab]);

  const adaTim = (tim?.temuan.length ?? 0) > 0;
  const tabs: { k: Tab; label: string }[] = [
    { k: "menunggu", label: `Perlu konfirmasi${saya ? ` (${saya.ringkas.menunggu})` : ""}` },
    { k: "selesai", label: `Sudah${saya ? ` (${saya.ringkas.dikonfirmasi})` : ""}` },
    ...(adaTim ? [{ k: "tim" as Tab, label: `Tim saya (${tim?.temuan.length ?? 0})` }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#14202E]">
      <HeaderAdmin kecil="SIGAP · Anomali" judul="Temuan anomali saya" onKeluar={keluar} kembali={<TombolKembali tema="gelap" induk="/" />}>
        <p className="mt-1 text-[12.5px] text-blue-100">Konfirmasi penyebab tiap temuan agar kesalahan yang sama tidak terulang.</p>
      </HeaderAdmin>
      <main className="mx-auto max-w-3xl space-y-3 px-3 pb-16 pt-4 sm:px-4">
        {galat && <Pesan jenis="galat">{galat}</Pesan>}
        {!saya && !galat && <Memuat />}
        {saya && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((t) => (
                <button key={t.k} type="button" className={tab === t.k ? BTN_G : BTN_O} onClick={() => setTab(t.k)}>
                  {t.label}
                </button>
              ))}
            </div>
            {daftar.length === 0 && <Pesan jenis="info">{tab === "menunggu" ? "Tidak ada temuan yang perlu Anda konfirmasi. Terima kasih." : "Belum ada temuan di sini."}</Pesan>}
            {daftar.map((t) => (
              <KartuTemuan key={t.id} t={t} bisaIsi={tab !== "tim" && t.status === "menunggu"} setelah={muat} lihatPetugas={tab === "tim"} />
            ))}
          </>
        )}
      </main>
    </div>
  );
}

function KartuTemuan({ t, bisaIsi, setelah, lihatPetugas }: { t: Temuan; bisaIsi: boolean; setelah: () => Promise<void>; lihatPetugas: boolean }) {
  const [penyebab, setPenyebab] = useState("");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function kirim() {
    setSibuk(true);
    setGalat(null);
    try {
      await fetchJson(URL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "konfirmasi", id: t.id, penyebab, catatan }) });
      await setelah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  const rincian = Object.entries(t.rincian ?? {});
  return (
    <Kartu
      judul={`${t.kode_temuan}${t.kelompok ? ` · ${t.kelompok}` : ""}`}
      ket={`${t.kegiatan_nama}${t.periode ? ` · ${t.periode}` : ""}${lihatPetugas ? ` · ${t.petugas_nama}` : ""}`}
      kanan={<Chip w={t.status === "dikonfirmasi" ? "ok" : "wait"}>{LABEL_STATUS[t.status]}</Chip>}
    >
      <dl className="space-y-1 text-[13px]">
        {t.id_sampel && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-[#6B7A90]">Sampel</dt>
            <dd className="font-semibold">{t.id_sampel}</dd>
          </div>
        )}
        {t.keterangan && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-[#6B7A90]">Keterangan</dt>
            <dd>{t.keterangan}</dd>
          </div>
        )}
        {t.makna && (
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-[#6B7A90]">Maksud kode</dt>
            <dd>{t.makna}</dd>
          </div>
        )}
        {rincian.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-24 shrink-0 text-[#6B7A90]">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {t.rekomendasi && <p className="mt-2 rounded-lg bg-[#EEF4FD] px-3 py-2 text-[12.5px] leading-snug text-[#1B2B4B]">Yang perlu diperiksa: {t.rekomendasi}</p>}
      {bisaIsi ? (
        <div className="mt-3 space-y-2">
          <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
            Penyebab
            <select className={`${INPUT} mt-1 w-full`} value={penyebab} onChange={(e) => setPenyebab(e.target.value)} disabled={sibuk}>
              <option value="">Pilih penyebab…</option>
              {PENYEBAB.map((p) => (
                <option key={p.kode} value={p.kode}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
            Catatan (opsional)
            <textarea className={`${INPUT} mt-1 w-full`} rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} disabled={sibuk} />
          </label>
          {galat && <p className="text-[13px] font-bold text-[#B42329]">{galat}</p>}
          <div className="flex justify-end">
            <button type="button" className={BTN_G} disabled={sibuk || penyebab === ""} onClick={kirim}>
              {sibuk ? "Menyimpan…" : "Konfirmasi"}
            </button>
          </div>
        </div>
      ) : t.status === "dikonfirmasi" ? (
        <p className="mt-2 text-[13px]">
          <b>{labelPenyebab(t.penyebab)}</b>
          {t.catatan ? ` — ${t.catatan}` : ""}
          {t.dikonfirmasi_at && <span className="block text-[11.5px] text-[#7B8794]">{waktuWib(t.dikonfirmasi_at)}</span>}
        </p>
      ) : null}
    </Kartu>
  );
}
