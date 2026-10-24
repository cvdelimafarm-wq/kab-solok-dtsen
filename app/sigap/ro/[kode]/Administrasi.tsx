"use client";

// app/sigap/ro/[kode]/Administrasi.tsx
//
// (24 Okt 2026) Tab Administrasi per item POK (papan 13): daftar item dengan status kelengkapan, dan -- bila item dibuka -- lembar dokumennya
// (per seksi): tandai draf SIGAP, unggah berkas, verifikasi, kembalikan (alasan wajib), unduh berkas, serta ganti/lepas lembar khusus item.
// Yang boleh melakukan tiap aksi ditentukan basis data (keu_adm_aksi); tombol hanya menurut status dan pesan penolakan ditampilkan apa adanya.
// Unggah berkas: POST /api/sigap/keu/adm-berkas (menyimpan ke penyimpanan, lalu keu_adm_aksi). Logika murni: lib/keu/adm.ts.

import { useCallback, useMemo, useRef, useState } from "react";
import { angka, STATUS_ADM, urlBaca } from "@/lib/keu/ro";
import type { WarnaChip } from "@/lib/keu/revisi";
import {
  aksiDokTersedia, alasanSah, LABEL_AKSI, MIN_ALASAN_KEMBALI, periksaBerkas, STATUS_DOK, susunDokumen, ukuranTeks, WARNA_DOK,
  type BarisDok, type DokTampil,
} from "@/lib/keu/adm";
import { bacaSesi } from "@/app/portal/sesi";
import { Catatan, Chip, Galat, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, Memuat, Potong, Progres, tombolAktif, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { aksiKeu, useBacaKeu, useKirim } from "../useKeu";

type ItemAdm = {
  detail_id: number; akun_kode: string; komponen_kode: string; nomor_item: string | null; uraian: string; jumlah: number | string;
  lembar_kode: string | null; seksi_huruf: string | null; asal: string | null;
  n_dok: number | string; n_belum: number | string; n_terverifikasi: number | string; status_item: string;
};
type RingkasAdm = { n_item: number | string; n_item_tanpa_dokumen: number | string; n_dok: number | string; n_belum: number | string; n_draf: number | string; n_terunggah: number | string; n_terverifikasi: number | string; persen_terverifikasi: number | string | null };
type MasterDok = { sumber: string; kode: string; seksi_huruf: string; seksi_judul: string };

const WARNA_ADM: Record<string, WarnaChip> = { lengkap: "hijau", diperiksa: "biru", berjalan: "kuning", belum: "abu", tanpa_dokumen: "abu" };
const FILTER_ADM: { kode: string; nama: string }[] = [{ kode: "", nama: "Semua" }, { kode: "belum", nama: "Belum dimulai" }, { kode: "berjalan", nama: "Berjalan" }, { kode: "diperiksa", nama: "Menunggu verifikasi" }, { kode: "lengkap", nama: "Lengkap" }, { kode: "tanpa_dokumen", nama: "Tanpa dokumen" }];
const waktu = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Mengunduh berkas lewat fetch ber-sesi (tag <a> tidak dapat mengirim header), lalu menyimpannya di peramban. */
async function unduh(admId: number, nama: string): Promise<string | null> {
  try {
    const sesi = bacaSesi();
    const res = await fetch(`/api/sigap/keu/adm-berkas?adm=${admId}`, { headers: sesi ? { Authorization: `Bearer ${sesi}` } : {} });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Gagal mengunduh (${res.status})`;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return null;
  } catch {
    return "Gagal mengunduh.";
  }
}

// ---------------------------------------------------------------- satu dokumen
function BarisDokumen({ d, detailId, sesudah }: { d: DokTampil; detailId: number; sesudah: () => Promise<void> }) {
  const { kirim, jalankan, mengirim, galat, hapusGalat } = useKirim(sesudah);
  const [kembali, setKembali] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const berkasRef = useRef<HTMLInputElement>(null);
  const aksi = aksiDokTersedia(d.status, d.gen);
  const args = (p_aksi: string, p_catatan = "") => ({ p_detail: detailId, p_dok: d.dokId, p_aksi, p_catatan });

  const unggah = (f: File | undefined) => {
    if (!f) return;
    hapusGalat();
    const salah = periksaBerkas(f.name, f.size);
    if (salah) { setGalatLokal(salah); return; }
    setGalatLokal(null);
    void jalankan(async () => {
      const sesi = bacaSesi();
      const form = new FormData();
      form.set("berkas", f); form.set("detail", String(detailId)); form.set("dok", String(d.dokId));
      try {
        const res = await fetch("/api/sigap/keu/adm-berkas", { method: "POST", body: form, headers: sesi ? { Authorization: `Bearer ${sesi}` } : {} });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 401) return { ok: false as const, pesan: "Sesi berakhir. Silakan masuk kembali." };
        return res.ok ? { ok: true as const, data: j } : { ok: false as const, pesan: j.error ?? `Gagal (${res.status})` };
      } catch {
        return { ok: false as const, pesan: "Gagal mengunggah." };
      }
    });
    if (berkasRef.current) berkasRef.current.value = "";
  };

  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-[#E8EDF5] bg-white px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 break-words text-[13px] text-[#0F2A52]"><b>{d.no}.</b> {d.uraian}</span>
        <Chip warna={WARNA_DOK[d.status] ?? "abu"}>{STATUS_DOK[d.status] ?? d.status}</Chip>
      </div>
      <p className="text-[12px] text-[#5B6B84]">
        {d.pihak.length > 0 ? `Pihak: ${d.pihak.join(", ")}` : ""}{d.pihak.length > 0 && d.ket ? " · " : ""}{d.ket}
      </p>
      {d.berkas && d.admId !== null && (
        <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-[#44546F]">
          <button type="button" className="font-semibold text-[#1F5FD1] underline" onClick={() => void unduh(d.admId as number, d.berkas as string).then((g) => setGalatLokal(g))}>{d.berkas}</button>
          <span>{ukuranTeks(d.ukuran)}</span>
          {d.diunggahAt && <span>· diunggah {waktu(d.diunggahAt)}</span>}
          {d.diverifikasiAt && <span>· diverifikasi {waktu(d.diverifikasiAt)}</span>}
        </p>
      )}
      {d.catatan && <p className="text-[12px] italic text-[#5B6B84]">Catatan: {d.catatan}</p>}
      <Galat pesan={galat ?? galatLokal} />
      {aksi.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {aksi.includes("draf") && <button type="button" disabled={mengirim} className={tombolKecil} onClick={() => void kirim("keu_adm_aksi", args("draf"))}>{LABEL_AKSI.draf}</button>}
          {aksi.includes("unggah") && (
            <>
              <input ref={berkasRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.odt,.ods" onChange={(e) => unggah(e.target.files?.[0])} />
              <button type="button" disabled={mengirim} className={d.status === "terunggah" ? tombolKecil : tombolUtama} onClick={() => berkasRef.current?.click()}>
                {mengirim ? "Memproses…" : d.status === "terunggah" ? "Ganti berkas" : LABEL_AKSI.unggah}
              </button>
            </>
          )}
          {aksi.includes("verifikasi") && <button type="button" disabled={mengirim} className={tombolUtama} onClick={() => void kirim("keu_adm_aksi", args("verifikasi"))}>{LABEL_AKSI.verifikasi}</button>}
          {aksi.includes("kembalikan") && !kembali && <button type="button" disabled={mengirim} className={tombolBahaya} onClick={() => setKembali(true)}>{LABEL_AKSI.kembalikan}</button>}
        </div>
      )}
      {kembali && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[#F0C9C9] bg-[#FFF7F7] p-2.5">
          <label className={label} htmlFor={`alasan-${d.dokId}`}>Alasan mengembalikan (minimal {MIN_ALASAN_KEMBALI} huruf)</label>
          <textarea id={`alasan-${d.dokId}`} rows={2} className={`${kolom} py-2`} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={mengirim || !alasanSah(alasan)} className={tombolBahaya} onClick={() => void kirim("keu_adm_aksi", args("kembalikan", alasan.trim())).then((ok) => { if (ok) { setKembali(false); setAlasan(""); } })}>Kembalikan dokumen</button>
            <button type="button" className={tombolKecil} onClick={() => { setKembali(false); setAlasan(""); }}>Batal</button>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- lembar khusus item
function GantiLembar({ detailId, sekarang, sesudah }: { detailId: number; sekarang: string; sesudah: () => Promise<void> }) {
  const master = useBacaKeu<MasterDok>(urlBaca("keu_master_dok", { aktif: "true" }, { kolom: ["sumber", "kode", "seksi_huruf", "seksi_judul"], urut: "kode", batas: 2000 }));
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState("");
  const opsi = useMemo(() => {
    const peta = new Map<string, string>();
    for (const m of master.baris ?? []) {
      const k = `${m.sumber}|${m.kode}|${m.seksi_huruf}`;
      if (!peta.has(k)) peta.set(k, `${m.sumber === "pola" ? "Pola umum" : "Lembar akun"} ${m.kode}${m.seksi_huruf ? ` seksi ${m.seksi_huruf}` : ""} (${m.seksi_judul})`);
    }
    return [...peta.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [master.baris]);
  if (!buka) return <button type="button" className={`${tombolKecil} self-start`} onClick={() => setBuka(true)}>Ganti lembar item ini</button>;
  const [sumber, kode, huruf] = pilih.split("|");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-2.5">
      <p className="text-[12px] text-[#5B6B84]">Lembar sekarang: {sekarang}. Bila lembar otomatis keliru, pilih lembar lain atau kembali ke aturan otomatis. Ditolak bila item sudah punya dokumen terunggah atau terverifikasi.</p>
      {master.galat ? <Galat pesan={master.galat} /> : (
        <select aria-label="Lembar dokumen" className={kolom} value={pilih} onChange={(e) => setPilih(e.target.value)}>
          <option value="">Pilih lembar…</option>
          {opsi.map(([k, nama]) => <option key={k} value={k}>{nama}</option>)}
        </select>
      )}
      <Galat pesan={galat} />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={mengirim || !pilih} className={tombolUtama} onClick={() => void kirim("keu_adm_peta_atur", { p_detail: detailId, p_sumber: sumber, p_kode: kode, p_huruf: huruf ?? "" }).then(() => setBuka(false))}>Pakai lembar ini</button>
        <button type="button" disabled={mengirim} className={tombolKecil} onClick={() => void kirim("keu_adm_peta_lepas", { p_detail: detailId }).then(() => setBuka(false))}>Kembali ke aturan otomatis</button>
        <button type="button" className={tombolKecil} onClick={() => setBuka(false)}>Tutup</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- panel dokumen satu item
function PanelDokumen({ item, sesudah }: { item: ItemAdm; sesudah: () => Promise<void> }) {
  const dok = useBacaKeu<BarisDok>(urlBaca("keu_v_adm_dokumen", { detail_id: item.detail_id }, { batas: 300 }));
  const muatUlang = useCallback(async () => { await dok.muat(); await sesudah(); }, [dok, sesudah]);
  const seksi = useMemo(() => (dok.baris ? susunDokumen(dok.baris) : null), [dok.baris]);
  const lembar = item.lembar_kode ? `${item.lembar_kode}${item.seksi_huruf ? ` seksi ${item.seksi_huruf}` : ""} (${item.asal === "khusus" ? "ditetapkan khusus" : "otomatis"})` : "belum ada";
  if (dok.galat) return <Galat pesan={dok.galat} />;
  if (!seksi) return <Memuat tinggi="h-20" />;
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-[#EEF2F7] pt-2.5">
      {seksi.length === 0 && <p className="text-[13px] text-[#5B6B84]">Item ini tidak memiliki daftar dokumen.</p>}
      {seksi.map((s) => (
        <section key={`${s.huruf}-${s.judul}`} className="flex flex-col gap-1.5">
          <h3 className="text-[12.5px] font-bold text-[#0F2A52]">{s.huruf ? `${s.huruf}. ` : ""}{s.judul}</h3>
          <ul className="flex flex-col gap-1.5">
            {s.dok.map((d) => <BarisDokumen key={d.dokId} d={d} detailId={item.detail_id} sesudah={muatUlang} />)}
          </ul>
        </section>
      ))}
      <GantiLembar detailId={item.detail_id} sekarang={lembar} sesudah={muatUlang} />
    </div>
  );
}

// ---------------------------------------------------------------- tab
export function TabAdministrasi({ kode }: { kode: string }) {
  const adm = useBacaKeu<ItemAdm>(urlBaca("keu_v_adm_item", { ro_kode: kode }, { urut: "akun_kode", batas: 5000, kolom: ["detail_id", "akun_kode", "komponen_kode", "nomor_item", "uraian", "jumlah", "lembar_kode", "seksi_huruf", "asal", "n_dok", "n_belum", "n_terverifikasi", "status_item"] }));
  const rk = useBacaKeu<RingkasAdm>(urlBaca("keu_v_adm_ringkas", { ro_kode: kode }, { batas: 1 }));
  const [saring, setSaring] = useState("");
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const segarkan = useCallback(async () => { await Promise.all([adm.muat(), rk.muat()]); }, [adm, rk]);

  if (adm.galat) return <Galat pesan={adm.galat} />;
  if (!adm.baris) return <Memuat />;
  if (adm.baris.length === 0) return <Kosong teks="RO ini belum punya item pada POK yang berlaku." />;
  const urut = [...adm.baris].sort((a, b) => a.komponen_kode.localeCompare(b.komponen_kode) || a.akun_kode.localeCompare(b.akun_kode) || (a.nomor_item ?? "~").localeCompare(b.nomor_item ?? "~") || a.uraian.localeCompare(b.uraian));
  const tampil = urut.filter((i) => !saring || i.status_item === saring);
  const k = rk.baris?.[0];
  const nMenunggu = k ? Number(k.n_terunggah) + Number(k.n_draf) : 0;
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${kartu} flex flex-col gap-1`}>
        <h2 className={judulKartu}>Administrasi: kelengkapan dokumen tiap item POK</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Buka satu item untuk melihat daftar dokumennya: unggah berkas, verifikasi, atau kembalikan. Hak tiap aksi mengikuti pihak dokumen; bila tidak berhak, sistem menolak dengan pesan.</p>
      </div>
      {k && (
        <div className={kisi}>
          <Kpi label="Item dengan lembar dokumen" nilai={angka(Number(k.n_item) - Number(k.n_item_tanpa_dokumen))} sub={`dari ${angka(k.n_item)} baris POK`} />
          <Kpi label="Dokumen terverifikasi" nilai={angka(k.n_terverifikasi)} sub={`dari ${angka(k.n_dok)} dokumen${k.persen_terverifikasi === null ? "" : ` (${angka(k.persen_terverifikasi)}%)`}`} warna="hj" />
          <Kpi label="Menunggu verifikasi" nilai={angka(nMenunggu)} sub="sudah diunggah atau draf" />
          <Kpi label="Belum ada" nilai={angka(k.n_belum)} sub="dokumen belum tersedia" warna={Number(k.n_belum) > 0 ? "mr" : undefined} />
        </div>
      )}
      <div className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>Item POK</h2>
          <span className="text-[12px] text-[#5B6B84]">{angka(tampil.length)} dari {angka(urut.length)} item</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_ADM.map((f) => <button key={f.kode} type="button" aria-pressed={saring === f.kode} onClick={() => setSaring(f.kode)} className={saring === f.kode ? tombolAktif : tombolKecil}>{f.nama}</button>)}
        </div>
        {adm.terpotong && <Potong />}
        {tampil.length === 0 && <p className="text-[13px] text-[#5B6B84]">Tidak ada item untuk filter ini.</p>}
        <ul className="grid items-start gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr))]">
          {tampil.map((i) => {
            const nd = Number(i.n_dok), tv = Number(i.n_terverifikasi), nb = Number(i.n_belum);
            const buka = terbuka === i.detail_id;
            return (
              <li key={i.detail_id} className={`flex min-w-0 flex-col gap-1.5 rounded-lg border bg-white px-3 py-2.5 ${buka ? "border-[#1F5FD1] [grid-column:1/-1]" : "border-[#DCE3EE]"}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-[13px] text-[#0F2A52]"><b className="font-mono">{i.akun_kode}</b> {i.nomor_item ? `${i.nomor_item}. ` : ""}{i.uraian}</span>
                  <span className="whitespace-nowrap font-mono text-[12px] text-[#44546F]">{angka(i.jumlah)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Chip warna={WARNA_ADM[i.status_item] ?? "abu"}>{STATUS_ADM[i.status_item] ?? i.status_item}</Chip>
                  {nd > 0 && <span className="text-[12px] text-[#5B6B84]">{angka(tv)} dari {angka(nd)} dokumen terverifikasi</span>}
                </div>
                {nd > 0 && <Progres hijau={(tv / nd) * 100} kuning={((nd - nb - tv) / nd) * 100} />}
                <button type="button" aria-expanded={buka} className={`${buka ? tombolAktif : tombolKecil} self-start`} onClick={() => setTerbuka(buka ? null : i.detail_id)}>
                  {buka ? "Tutup dokumen" : nd > 0 ? `Dokumen (${angka(nd)})` : "Lihat lembar"}
                </button>
                {buka && <PanelDokumen item={i} sesudah={segarkan} />}
              </li>
            );
          })}
        </ul>
      </div>
      <Catatan>Dokumen yang diperlukan tiap item ditentukan dari lembar kelengkapan menurut akun dan uraiannya. Tombol &quot;Tandai draf siap&quot; hanya menandai bahwa draf disiapkan; pembuatan isi dokumen otomatis oleh SIGAP belum tersedia, jadi berkas tetap diunggah. Dokumen terverifikasi hanya dapat dikembalikan oleh PPK.</Catatan>
    </div>
  );
}
