"use client";

// app/sigap/sampel/WilayahSaya.tsx
//
// (7 Nov 2026) "Wilayah saya": sub SLS yang dialokasikan kepada PPL (atau semua PPL bawahan PML), lengkap dengan NKS (penanda), target sampel, dan daftar KK master
// sub SLS itu (nama, anggota ruta lain, patokan, Arahkan/Peta). Mengikuti gaya KartuSls.
// A2: PPL MENANDAI KK sebagai sampel utama/cadangan selama JENDELA RILIS (24 jam, dibuka Ketua tim) terbuka; sesudah terkunci PPL hanya mengisi hasil pendataan
// (didata, menolak, tidak ditemukan). PML hanya melihat. Aturan sebenarnya ditegakkan server; layar ini hanya mencerminkannya dan menampilkan penolakan apa adanya.

import { useEffect, useMemo, useState } from "react";
import { LABEL_MODEL, kodeSubslsPendek, type DataAlokasiSaya, type KkMaster, type WilayahAlokasi } from "@/lib/alokasiWilayah";
import { tautanLihatSampel, tautanPetaSampel } from "@/lib/sampelSls";
import { KET_JENDELA, LABEL_HASIL, formatSisa, selisihJam, sisaDetik, statusEfektif, type DataTagSub, type HasilTag, type InfoJendela, type PeranTag, type TagKk } from "@/lib/tagSampel";
import type { AksiTag, HasilMuatKk } from "./useAlokasi";
import PetaSampel, { adaKoordinat } from "./PetaSampel";
import { kunciPetaSaya } from "@/lib/petaKegiatan";
import {
  ALASAN_GANTI, LABEL_ALASAN, LABEL_STATUS_GANTI, MAKS_CATATAN, MIN_CATATAN_TOLAK, bisaMengajukanGanti, cadanganTersedia, menunggu as gantiMenunggu, periksaIsianGanti,
  type AlasanGanti, type GantiRow,
} from "@/lib/gantiSampel";

/** Waktu sekarang (ms) yang diperbarui berkala, untuk hitung mundur jendela. */
function useSekarang(selangMs = 30_000): number {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), selangMs);
    return () => clearInterval(t);
  }, [selangMs]);
  return n;
}

function BannerJendela({ jendela, selisihMs }: { jendela: InfoJendela | undefined; selisihMs: number }) {
  const sekarang = useSekarang();
  if (!jendela) return null;
  const status = statusEfektif(jendela, selisihMs, sekarang);
  const sisa = sisaDetik(jendela, selisihMs, sekarang);
  const warna = status === "terbuka" ? "bg-[#E8F6EE] text-[#13794B]" : status === "terkunci" ? "bg-[#EEF2F7] text-[#44546F]" : "bg-[#FFF4D6] text-[#8A6200]";
  return (
    <p role="status" className={`mt-1.5 rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold leading-snug ${warna}`}>
      {status === "terbuka" ? `${KET_JENDELA.terbuka} Sisa waktu ${formatSisa(sisa)}.` : KET_JENDELA[status]}
    </p>
  );
}

const LABEL_PERAN: Record<PeranTag, string> = { utama: "UTAMA", cadangan: "CADANGAN" };

export type AksiBaris = {
  /** boleh menandai/melepas (PPL, jendela terbuka, ada sinyal) */
  bisaTandai: boolean;
  /** boleh mengisi hasil (PPL, ada sinyal) */
  bisaHasil: boolean;
  sibuk: boolean;
  cadanganAda: boolean;
  utamaPenuh: boolean;
  cadanganPenuh: boolean;
  onTag: (peran: PeranTag) => void;
  onLepas: () => void;
  onHasil: (h: HasilTag | null) => void;
  /** tahap B (opsional): penggantian sampel utama dengan cadangan */
  ganti?: { bisa: boolean; keterangan: string | null; menunggu: boolean; onAjukan: () => void };
};

const TOMBOL = "grid min-h-[40px] place-items-center rounded-[10px] px-3 text-[12.5px] font-bold disabled:opacity-50";

export function BarisKk({ k, no, tag, aksi }: { k: KkMaster; no: number; tag: TagKk | undefined; aksi: AksiBaris }) {
  const kunci = aksi.bisaTandai && !(tag?.hasil);
  return (
    <li className="flex items-start gap-2.5 border-t border-[#EEF2F7] px-3 py-2.5 first:border-t-0">
      <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-[#EEF2F7] text-[11px] font-bold text-[#44546F]">{no}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-snug text-[#0F2A52]">
          {k.nama_kk}
          {tag && <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10.5px] font-extrabold ${tag.peran === "utama" ? "bg-[#DCE8FB] text-[#1F5FD1]" : "bg-[#EDE3FB] text-[#6B3FB8]"}`}>{LABEL_PERAN[tag.peran]}</span>}
        </p>
        {k.anggota_lain && <p className="text-[12px] leading-snug text-[#55657D]">Anggota ruta lain: {k.anggota_lain}</p>}
        {k.patokan && <p className="text-[12px] leading-snug text-[#55657D]">Patokan: {k.patokan}</p>}
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {!adaKoordinat(k) && <span className="w-full text-[11.5px] font-semibold text-[#8A6200]">Koordinat tidak tersedia untuk KK ini</span>}
          {adaKoordinat(k) && (
            <>
              <a href={tautanPetaSampel(k.lat, k.lng)} target="_blank" rel="noopener noreferrer" className={`${TOMBOL} bg-[#EAF1FC] text-[#1F5FD1] active:bg-[#DCE8FB]`} aria-label={`Arahkan ke ${k.nama_kk}`}>
                Arahkan
              </a>
              <a href={tautanLihatSampel(k.lat, k.lng)} target="_blank" rel="noopener noreferrer" className={`${TOMBOL} border border-[#DCE5F2] bg-white text-[#44546F] active:bg-[#F1F5FC]`} aria-label={`Lihat peta ${k.nama_kk}`}>
                Peta
              </a>
            </>
          )}
          {kunci && tag?.peran !== "utama" && (
            <button type="button" disabled={aksi.sibuk || aksi.utamaPenuh} onClick={() => aksi.onTag("utama")} className={`${TOMBOL} bg-[#1F5FD1] text-white active:bg-[#1A4FB0]`} aria-label={`Jadikan ${k.nama_kk} sampel utama`}>
              Jadikan utama
            </button>
          )}
          {kunci && aksi.cadanganAda && tag?.peran !== "cadangan" && (
            <button type="button" disabled={aksi.sibuk || aksi.cadanganPenuh} onClick={() => aksi.onTag("cadangan")} className={`${TOMBOL} border border-[#C9B5EE] bg-white text-[#6B3FB8] active:bg-[#F5EFFD]`} aria-label={`Jadikan ${k.nama_kk} sampel cadangan`}>
              Jadikan cadangan
            </button>
          )}
          {kunci && tag && (
            <button type="button" disabled={aksi.sibuk} onClick={aksi.onLepas} className={`${TOMBOL} border border-[#F0C4C6] bg-white text-[#B42329] active:bg-[#FDE8E8]`} aria-label={`Lepas tag ${k.nama_kk}`}>
              Lepas
            </button>
          )}
        </span>
        {tag?.peran === "utama" && (aksi.bisaHasil || tag.hasil) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-semibold text-[#55657D]">Hasil:</span>
            {(["didata", "menolak", "tidak_ditemukan"] as HasilTag[]).map((h) => (
              <button key={h} type="button" disabled={!aksi.bisaHasil || aksi.sibuk} onClick={() => aksi.onHasil(tag.hasil === h ? null : h)} aria-pressed={tag.hasil === h} className={`${TOMBOL} ${tag.hasil === h ? "bg-[#13794B] text-white" : "border border-[#DCE5F2] bg-white text-[#44546F] active:bg-[#F1F5FC]"}`}>
                {LABEL_HASIL[h]}
              </button>
            ))}
          </span>
        )}
        {tag?.peran === "utama" && aksi.ganti && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {aksi.ganti.menunggu ? (
              <span className="rounded-full bg-[#FFF4D6] px-2.5 py-1 text-[11.5px] font-extrabold text-[#8A6200]">Penggantian menunggu PML</span>
            ) : aksi.ganti.bisa ? (
              <button type="button" disabled={aksi.sibuk} onClick={aksi.ganti.onAjukan} className={`${TOMBOL} border border-[#C9B5EE] bg-white text-[#6B3FB8] active:bg-[#F5EFFD]`} aria-label={`Ganti ${k.nama_kk} dengan cadangan`}>
                Ganti dengan cadangan
              </button>
            ) : (
              aksi.ganti.keterangan && <span className="text-[11.5px] text-[#55657D]">{aksi.ganti.keterangan}</span>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

const tglPendek = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Satu pengajuan penggantian beserta tombol sesuai peran (PML: setujui/tolak; pengaju: batalkan). */
export function BarisGanti({
  g, bisaPutus, bisaBatal, sibuk, onPutus, onBatal,
}: {
  g: GantiRow;
  bisaPutus: boolean;
  bisaBatal: boolean;
  sibuk: boolean;
  onPutus: (setuju: boolean, catatan: string) => void;
  onBatal: () => void;
}) {
  const [tolak, setTolak] = useState(false);
  const [cat, setCat] = useState("");
  const warna = g.status === "disetujui" ? "bg-[#E8F6EE] text-[#13794B]" : g.status === "menunggu" ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#EEF2F7] text-[#44546F]";
  return (
    <li className="border-t border-[#EEF2F7] px-3.5 py-2 first:border-t-0">
      <p className="text-[13px] font-bold leading-snug text-[#0F2A52]">
        {g.utama_nama} <span aria-hidden="true">→</span> {g.cadangan_nama}
        <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10.5px] font-extrabold ${warna}`}>{LABEL_STATUS_GANTI[g.status]}</span>
      </p>
      <p className="text-[12px] leading-snug text-[#55657D]">
        {LABEL_ALASAN[g.alasan]}
        {g.catatan ? ` · ${g.catatan}` : ""} · diajukan {g.diajukan_nama ?? "PPL"} {tglPendek(g.diajukan_at)}
      </p>
      {g.status !== "menunggu" && g.diputus_nama && g.status !== "dibatalkan" && (
        <p className="text-[12px] leading-snug text-[#55657D]">
          Diputus {g.putus_sebagai === "admin" ? "admin" : "PML"} {g.diputus_nama} {tglPendek(g.diputus_at)}
          {g.catatan_putus ? ` · ${g.catatan_putus}` : ""}
        </p>
      )}
      {g.status === "menunggu" && (bisaPutus || bisaBatal) && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {bisaPutus && !tolak && (
            <>
              <button type="button" disabled={sibuk} onClick={() => onPutus(true, "")} className={`${TOMBOL} bg-[#13794B] text-white`} aria-label={`Setujui penggantian ${g.utama_nama}`}>
                Setujui
              </button>
              <button type="button" disabled={sibuk} onClick={() => setTolak(true)} className={`${TOMBOL} border border-[#F0C4C6] bg-white text-[#B42329]`} aria-label={`Tolak penggantian ${g.utama_nama}`}>
                Tolak…
              </button>
            </>
          )}
          {bisaPutus && tolak && (
            <span className="flex w-full flex-wrap items-center gap-1.5">
              <input value={cat} onChange={(e) => setCat(e.target.value)} maxLength={MAKS_CATATAN} placeholder="Alasan penolakan (wajib)" aria-label="Alasan penolakan" className="min-h-[44px] min-w-0 flex-1 rounded-[12px] border border-[#DCE5F2] bg-[#F7FAFF] px-3 text-[14px] text-[#0F2A52] outline-none focus:border-[#1F5FD1]" />
              <button type="button" disabled={sibuk || cat.trim().length < MIN_CATATAN_TOLAK} onClick={() => onPutus(false, cat)} className={`${TOMBOL} bg-[#B42329] text-white`}>
                Kirim penolakan
              </button>
              <button type="button" disabled={sibuk} onClick={() => setTolak(false)} className={`${TOMBOL} border border-[#DCE5F2] bg-white text-[#44546F]`}>
                Batal
              </button>
            </span>
          )}
          {bisaBatal && (
            <button type="button" disabled={sibuk} onClick={onBatal} className={`${TOMBOL} border border-[#DCE5F2] bg-white text-[#44546F]`} aria-label={`Batalkan pengajuan ${g.utama_nama}`}>
              Batalkan pengajuan
            </button>
          )}
        </span>
      )}
    </li>
  );
}

/** Formulir pengajuan: pilih cadangan pengganti, alasan baku, catatan. */
export function FormGanti({
  utama, pilihan, sibuk, onKirim, onTutup,
}: {
  utama: KkMaster;
  pilihan: ReadonlyArray<{ kk_id: number; nama: string }>;
  sibuk: boolean;
  onKirim: (cadangan: number, alasan: AlasanGanti, catatan: string) => void;
  onTutup: () => void;
}) {
  const [cad, setCad] = useState<number | null>(pilihan.length === 1 ? pilihan[0].kk_id : null);
  const [alasan, setAlasan] = useState<AlasanGanti | "">("");
  const [catatan, setCatatan] = useState("");
  const galat = periksaIsianGanti(alasan, catatan, cad);
  return (
    <div className="mx-3 mt-2 rounded-[14px] border border-[#C9B5EE] bg-[#FAF7FE] p-3" role="group" aria-label={`Ganti ${utama.nama_kk} dengan cadangan`}>
      <p className="text-[13px] font-extrabold text-[#0F2A52]">Ganti {utama.nama_kk} dengan cadangan</p>
      <label className="mt-2 block text-[12px] font-semibold text-[#44546F]">
        Cadangan pengganti
        <select value={cad ?? ""} onChange={(e) => setCad(e.target.value ? Number(e.target.value) : null)} className="mt-1 min-h-[44px] w-full rounded-[12px] border border-[#DCE5F2] bg-white px-3 text-[14px] text-[#0F2A52]">
          <option value="">Pilih cadangan…</option>
          {pilihan.map((p) => (
            <option key={p.kk_id} value={p.kk_id}>
              {p.nama}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-[12px] font-semibold text-[#44546F]">
        Alasan
        <select value={alasan} onChange={(e) => setAlasan(e.target.value as AlasanGanti | "")} className="mt-1 min-h-[44px] w-full rounded-[12px] border border-[#DCE5F2] bg-white px-3 text-[14px] text-[#0F2A52]">
          <option value="">Pilih alasan…</option>
          {ALASAN_GANTI.map((a) => (
            <option key={a.kode} value={a.kode}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-[12px] font-semibold text-[#44546F]">
        Catatan{alasan === "lainnya" ? " (wajib)" : " (boleh kosong)"}
        <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={MAKS_CATATAN} rows={2} className="mt-1 w-full rounded-[12px] border border-[#DCE5F2] bg-white px-3 py-2 text-[14px] text-[#0F2A52]" />
      </label>
      {galat && (cad || alasan) && <p className="mt-1 text-[11.5px] text-[#8A6200]">{galat}</p>}
      <span className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" disabled={sibuk || !!galat} onClick={() => cad && alasan && onKirim(cad, alasan, catatan.trim())} className={`${TOMBOL} bg-[#6B3FB8] text-white`}>
          Ajukan ke PML
        </button>
        <button type="button" disabled={sibuk} onClick={onTutup} className={`${TOMBOL} border border-[#DCE5F2] bg-white text-[#44546F]`}>
          Batal
        </button>
      </span>
    </div>
  );
}

type Sudah = { dt: DataTagSub; selisih: number };

function KartuWilayah({
  w, tampilPpl, terbukaAwal, peran, cadanganKonfig, muatKk, aksiTag, kunciDasar = null,
}: {
  w: WilayahAlokasi;
  tampilPpl: boolean;
  terbukaAwal: boolean;
  peran: "ppl" | "pml";
  cadanganKonfig: number;
  muatKk: (id: string) => Promise<HasilMuatKk>;
  aksiTag?: (a: AksiTag) => Promise<void>;
  /** (8 Nov 2026) kunci berkas peta jalan tim di peta mini; null = tanpa latar */
  kunciDasar?: number | null;
}) {
  const [buka, setBuka] = useState(terbukaAwal);
  const [kk, setKk] = useState<KkMaster[] | null>(null);
  const [salinan, setSalinan] = useState(false);
  const [galat, setGalat] = useState("");
  const [cari, setCari] = useState("");
  const [lihat, setLihat] = useState<"semua" | "sampel">("semua");
  const [peta, setPeta] = useState(false);
  const [dipilih, setDipilih] = useState<number | null>(null);
  const [formGanti, setFormGanti] = useState<KkMaster | null>(null);
  const [td, setTd] = useState<Sudah | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const sekarang = useSekarang();

  const muatUlang = async () => {
    const r = await muatKk(w.idsubsls);
    setKk(r.kk);
    setSalinan(r.salinan);
    setTd(r.tag ? { dt: r.tag, selisih: r.salinan ? 0 : selisihJam(r.tag.jendela.sekarang) } : null);
    setGalat("");
  };

  useEffect(() => {
    if (!buka || kk !== null) return;
    let batal = false;
    muatKk(w.idsubsls)
      .then((r) => {
        if (batal) return;
        setKk(r.kk);
        setSalinan(r.salinan);
        setTd(r.tag ? { dt: r.tag, selisih: r.salinan ? 0 : selisihJam(r.tag.jendela.sekarang) } : null);
        setGalat("");
      })
      .catch((e) => {
        if (!batal) setGalat(e instanceof Error ? e.message : "Daftar KK belum bisa dimuat.");
      });
    return () => {
      batal = true;
    };
  }, [buka, kk, w.idsubsls, muatKk]);

  const tagPerKk = useMemo(() => new Map((td?.dt.tag ?? []).map((t) => [t.kk_id, t])), [td]);
  const nUtama = (td?.dt.tag ?? []).filter((t) => t.peran === "utama").length;
  const nCad = (td?.dt.tag ?? []).filter((t) => t.peran === "cadangan").length;
  const target = td?.dt.target ?? w.target;
  const jatahCad = td?.dt.cadangan ?? cadanganKonfig;
  // (11 Nov 2026) SAMPEL DITETAPKAN DARI BERKAS: tag hasil unggah Excel pembagian (via "unggah") langsung menjadi daftar kerja PPL dan PML. Tanpa jendela penandaan,
  // tanpa tombol Jadikan utama/cadangan/Lepas, dan daftar KK lengkap tidak ditampilkan (hanya sampel). Hasil pendataan dan penggantian lewat PML tetap bisa.
  const ditetapkan = (td?.dt.tag ?? []).some((t) => t.via === "unggah");
  const statusJendela = td ? statusEfektif(td.dt.jendela, td.selisih, sekarang) : "belum";
  const status = ditetapkan ? "terkunci" : statusJendela;
  const bisaTandai = peran === "ppl" && !salinan && !!aksiTag && status === "terbuka" && !ditetapkan;
  const bisaHasil = peran === "ppl" && !salinan && !!aksiTag;
  const gantiDaftar: GantiRow[] = td?.dt.ganti ?? [];
  const bolehGanti = td?.dt.boleh_ganti ?? true;
  const bisaPutus = peran === "pml" && !salinan && !!aksiTag;
  const bisaAjukan = peran === "ppl" && !salinan && !!aksiTag;
  const pilihanCadangan = useMemo(() => {
    const nama = new Map((kk ?? []).map((k) => [k.id, k.nama_kk]));
    return cadanganTersedia(td?.dt.tag ?? [], gantiDaftar).map((t) => ({ kk_id: t.kk_id, nama: nama.get(t.kk_id) ?? `KK ${t.kk_id}` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kk, td]);


  const kkDipilih = dipilih !== null ? (kk ?? []).find((k) => k.id === dipilih) ?? null : null;
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (kk ?? []).filter((k) => (lihat === "semua" && !ditetapkan ? true : tagPerKk.has(k.id)) && (!q || k.nama_kk.toLowerCase().includes(q) || (k.anggota_lain ?? "").toLowerCase().includes(q)));
  }, [kk, cari, lihat, tagPerKk, ditetapkan]);

  const aksiUntuk = (k: KkMaster): AksiBaris => ({
    bisaTandai,
    bisaHasil,
    sibuk,
    cadanganAda: jatahCad > 0,
    utamaPenuh: nUtama >= target && tagPerKk.get(k.id)?.peran !== "utama",
    cadanganPenuh: nCad >= jatahCad && tagPerKk.get(k.id)?.peran !== "cadangan",
    onTag: (p) => void kirim({ aksi: "tag", s: w.idsubsls, kk: k.id, peran: p }),
    onLepas: () => void kirim({ aksi: "lepas", kk: k.id }),
    onHasil: (h) => void kirim({ aksi: "hasil", kk: k.id, hasil: h }),
    ganti: bisaAjukan && tagPerKk.get(k.id)?.peran === "utama"
      ? (() => {
          const tg = tagPerKk.get(k.id);
          const c = bisaMengajukanGanti({ tag: tg, jendela: status, bolehGanti, daftar: gantiDaftar, tag_sub: td?.dt.tag ?? [] });
          return { bisa: c.bisa, keterangan: c.alasan, menunggu: gantiMenunggu(gantiDaftar).some((x) => x.utama_kk_id === k.id), onAjukan: () => setFormGanti(k) };
        })()
      : undefined,
  });

  async function kirim(a: AksiTag) {
    if (!aksiTag || sibuk) return;
    setSibuk(true);
    setPesan("");
    try {
      await aksiTag(a);
      setFormGanti(null);
      await muatUlang();
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Aksi gagal. Coba lagi.");
      try {
        await muatUlang();
      } catch {
        /* tetap pakai tampilan sebelumnya */
      }
    } finally {
      setSibuk(false);
    }
  }

  const ringkasTag = td ? `Utama ${nUtama}/${target}${jatahCad > 0 ? ` · Cadangan ${nCad}/${jatahCad}` : ""}` : w.tag ? `Utama ${w.tag.utama}/${w.target}${cadanganKonfig > 0 ? ` · Cadangan ${w.tag.cadangan}/${cadanganKonfig}` : ""}${w.tag.hasil > 0 ? ` · Hasil ${w.tag.hasil}` : ""}` : null;

  return (
    <section className="overflow-hidden rounded-[18px] bg-white shadow-[0_6px_18px_rgba(15,42,82,.07)]">
      <button type="button" onClick={() => setBuka((b) => !b)} aria-expanded={buka} className="flex w-full items-center gap-2 px-3.5 py-3 text-left active:bg-[#F7FAFF]">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#6B7A90]">
            Sub SLS{w.nks ? ` · NKS ${w.nks}` : ""}
            {tampilPpl && w.ppl_nama ? ` · ${w.ppl_nama}` : ""}
          </p>
          <p className="break-all font-mono text-[13.5px] font-bold text-[#0F2A52]" title={w.idsubsls}>
            {kodeSubslsPendek(w.idsubsls)}
          </p>
          <p className="mt-0.5 text-[12px] text-[#55657D]">
            {w.nagari} · {w.sls}
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#44546F]">
            Target {w.target} sampel{ditetapkan ? "" : ` · ${w.jumlah_kk > 0 ? `${w.jumlah_kk} KK di daftar` : "daftar KK belum ada"}`}
          </p>
          {ringkasTag && <p className="mt-0.5 text-[12px] font-bold text-[#1F5FD1]">{ringkasTag}</p>}
        </div>
        <span aria-hidden="true" className="flex-none text-[#6B7A90]">
          {buka ? "▴" : "▾"}
        </span>
      </button>
      {buka && (
        <div className="border-t border-[#EEF2F7]">
          {salinan && <p className="bg-[#FFF4D6] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#8A6200]">Tidak tersambung. Menampilkan salinan terakhir di HP; menandai sampel butuh sinyal.</p>}
          {galat && <p className="px-3.5 py-3 text-[13px] text-[#7A1D22]">{galat}</p>}
          {!galat && kk === null && <p className="px-3.5 py-3 text-[13px] text-[#55657D]" aria-busy="true">Memuat daftar KK…</p>}
          {kk !== null && kk.length === 0 && <p className="px-3.5 py-3 text-[13px] text-[#55657D]">Daftar KK sub SLS ini belum ada di master. Hubungi admin kegiatan.</p>}
          {td && ditetapkan && <p className="px-3.5 pt-2 text-[11.5px] font-semibold text-[#13794B]">Sampel sudah ditetapkan dari daftar pembagian. Langsung kerjakan dan isi hasilnya.</p>}
          {td && !ditetapkan && <p className="px-3.5 pt-2 text-[11.5px] font-semibold text-[#55657D]">{status === "terbuka" ? `Penandaan dibuka · sisa ${formatSisa(sisaDetik(td.dt.jendela, td.selisih, sekarang))}` : KET_JENDELA[status]}</p>}
          {(gantiDaftar.length > 0 || formGanti) && (
            <div className="mt-2">
              <p className="px-3.5 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[#6B7A90]">Penggantian sampel{gantiMenunggu(gantiDaftar).length > 0 ? ` · ${gantiMenunggu(gantiDaftar).length} menunggu` : ""}</p>
              <ul>
                {gantiDaftar.slice(0, 8).map((g) => (
                  <BarisGanti
                    key={g.id}
                    g={g}
                    sibuk={sibuk}
                    bisaPutus={bisaPutus}
                    bisaBatal={bisaAjukan && g.diajukan_oleh != null && g.status === "menunggu"}
                    onPutus={(setuju, catatan) => void kirim({ aksi: "ganti_putus", id: g.id, setuju, catatan })}
                    onBatal={() => void kirim({ aksi: "ganti_batal", id: g.id })}
                  />
                ))}
              </ul>
              {formGanti && (
                <FormGanti
                  utama={formGanti}
                  pilihan={pilihanCadangan}
                  sibuk={sibuk}
                  onTutup={() => setFormGanti(null)}
                  onKirim={(cadangan, alasan, catatan) => void kirim({ aksi: "ganti_ajukan", utama: formGanti.id, cadangan, alasan, catatan })}
                />
              )}
            </div>
          )}
          {bisaTandai && nUtama >= target && <p className="px-3.5 pt-1 text-[11.5px] text-[#55657D]">Sampel utama sudah penuh ({nUtama}/{target}). Lepas satu bila ingin menggantinya.</p>}
          {pesan && <p role="alert" className="mx-3 mt-2 rounded-[10px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-2.5 py-1.5 text-[12.5px] text-[#7A1D22]">{pesan}</p>}
          {kk !== null && kk.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5">
                {kk.length > 12 && !ditetapkan && (
                  <input type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama KK…" aria-label="Cari nama KK" className="min-h-[44px] min-w-0 flex-1 rounded-[12px] border border-[#DCE5F2] bg-[#F7FAFF] px-3 text-[14px] text-[#0F2A52] outline-none focus:border-[#1F5FD1]" />
                )}
                <span className="flex gap-1" role="tablist" aria-label="Tampilan sampel">
                  {([false, true] as const).map((p) => (
                    <button key={String(p)} type="button" role="tab" aria-selected={peta === p} onClick={() => { setPeta(p); setDipilih(null); }} className={`min-h-[40px] rounded-[10px] px-3.5 text-[12.5px] font-bold ${peta === p ? "bg-[#1F5FD1] text-white" : "bg-[#EAF1FC] text-[#1F5FD1]"}`}>
                      {p ? "Peta" : "Daftar"}
                    </button>
                  ))}
                </span>
                {tagPerKk.size > 0 && !ditetapkan && (
                  <span className="flex gap-1" role="group" aria-label="Tampilan daftar">
                    {(["semua", "sampel"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setLihat(v)} aria-pressed={lihat === v} className={`min-h-[40px] rounded-[10px] px-3 text-[12.5px] font-bold ${lihat === v ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F7] text-[#44546F]"}`}>
                        {v === "semua" ? "Semua" : `Sampel (${tagPerKk.size})`}
                      </button>
                    ))}
                  </span>
                )}
              </div>
              {peta && <PetaSampel idsubsls={w.idsubsls} kk={kk} tag={tagPerKk} hanyaBertag={ditetapkan} kunciDasar={kunciDasar} terpilih={dipilih} onPilih={setDipilih} />}
              {!peta && <ol>
                {tampil.map((k, i) => (
                  <BarisKk
                    key={k.id}
                    k={k}
                    no={i + 1}
                    tag={tagPerKk.get(k.id)}
                    aksi={aksiUntuk(k)}
                  />
                ))}
                {tampil.length === 0 && <li className="px-3.5 py-3 text-[13px] text-[#55657D]">Tidak ada KK yang cocok dengan pencarian.</li>}
              </ol>}
              {peta && kkDipilih && (
                <div role="dialog" aria-label={`KK ${kkDipilih.nama_kk}`} className="fixed inset-x-0 bottom-[var(--bar-bawah,0px)] z-[55] mx-auto max-h-[70vh] max-w-xl overflow-y-auto rounded-t-[22px] bg-white pb-3 pt-1.5 shadow-[0_-12px_36px_rgba(15,42,82,.25)]">
                  <div className="flex items-center justify-between px-3.5">
                    <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-[#D5DDEA]" />
                    <button type="button" onClick={() => setDipilih(null)} aria-label="Tutup kartu KK" className="absolute right-2 top-1.5 grid h-9 w-9 place-items-center rounded-full text-[18px] text-[#55657D] active:bg-[#F1F5FC]">✕</button>
                  </div>
                  <ul>
                    <BarisKk k={kkDipilih} no={Math.max(1, tampil.findIndex((x) => x.id === kkDipilih.id) + 1)} tag={tagPerKk.get(kkDipilih.id)} aksi={aksiUntuk(kkDipilih)} />
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function WilayahSaya({
  data,
  muatKk,
  luring,
  aksiTag,
  selisihMs = 0,
}: {
  data: DataAlokasiSaya;
  muatKk: (id: string) => Promise<HasilMuatKk>;
  luring: boolean;
  aksiTag?: (a: AksiTag) => Promise<void>;
  selisihMs?: number;
}) {
  const peran = data.peran;
  const model = data.konfig.dengan_updating ? "dengan" : "tanpa";
  const kunciDasar = kunciPetaSaya(data.kegiatan.id, peran, data.saya.id);
  const grup = useMemo(() => {
    const m = new Map<number, { nama: string; sub: WilayahAlokasi[] }>();
    for (const w of data.wilayah) {
      const id = w.ppl_akun_id ?? 0;
      const g = m.get(id) ?? { nama: w.ppl_nama ?? "PPL", sub: [] };
      g.sub.push(w);
      m.set(id, g);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].nama.localeCompare(b[1].nama));
  }, [data.wilayah]);
  const totalTarget = data.wilayah.reduce((s, w) => s + w.target, 0);
  if (data.wilayah.length === 0) return null;
  const cad = data.konfig.cadangan_per_sls ?? 0;

  return (
    <section className="space-y-2" aria-label="Wilayah saya">
      <div className="px-1 pt-1">
        <h2 className="text-[14px] font-extrabold text-[#0F2A52]">Wilayah {peran === "pml" ? "PPL saya" : "saya"}</h2>
        <p className="text-[11.5px] font-semibold text-[#55657D]">
          {data.wilayah.length} sub SLS · target {totalTarget} sampel · {LABEL_MODEL[model].judul.toLowerCase()}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-[#55657D]">{data.wilayah.some((w) => (w.tag?.utama ?? 0) > 0) ? "Sampel utama dan cadangan sudah dibagikan ke tiap PPL. Buka sub SLS untuk melihat daftarnya." : model === "dengan" ? "Lakukan updating di FASIH lebih dulu; penandaan sampel dibuka setelah updating." : "Tanpa updating: sampel utama dan cadangan langsung ditandai dari daftar KK ini."}</p>
        {!data.wilayah.some((w) => (w.tag?.utama ?? 0) > 0) && <BannerJendela jendela={data.jendela} selisihMs={selisihMs} />}
        {luring && <p className="mt-1 rounded-[10px] bg-[#FFF4D6] px-2.5 py-1.5 text-[12px] font-semibold text-[#8A6200]">Tidak tersambung. Menampilkan data terakhir yang tersimpan di HP.</p>}
      </div>
      {peran === "ppl" && data.wilayah.map((w, i) => <KartuWilayah key={w.id} w={w} tampilPpl={false} terbukaAwal={data.wilayah.length <= 2 && i === 0} peran="ppl" cadanganKonfig={cad} muatKk={muatKk} aksiTag={aksiTag} kunciDasar={kunciDasar} />)}
      {peran === "pml" &&
        grup.map(([id, g]) => (
          <div key={id} className="space-y-2">
            <p className="px-1 pt-1 text-[13px] font-extrabold text-[#0F2A52]">{g.nama}</p>
            {g.sub.map((w) => (
              <KartuWilayah key={w.id} w={w} tampilPpl={false} terbukaAwal={false} peran="pml" cadanganKonfig={cad} muatKk={muatKk} aksiTag={aksiTag} kunciDasar={kunciDasar} />
            ))}
          </div>
        ))}
    </section>
  );
}
