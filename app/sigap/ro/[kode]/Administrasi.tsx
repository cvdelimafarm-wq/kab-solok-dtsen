"use client";

// app/sigap/ro/[kode]/Administrasi.tsx
//
// (24 Okt 2026; ditata ulang 25 Okt 2026, tahap 21) Tab Administrasi per RO (papan 13): empat kartu ringkasan; di kiri daftar item POK per komponen
// (status kelengkapan, bilah progres, filter); di kanan item yang dipilih: jenis kelengkapan dan pilihan lembar/seksi, lalu tabel dokumen
// (No, Dokumen, Pihak, Keterangan, Status, Tindakan) dengan "Hanya bagian saya" dan penandaan draf massal.
// Hak tiap aksi ditegakkan basis data (keu_adm_aksi); tombol hanya ditawarkan bila keu_adm_boleh_unggah / keu_adm_boleh_verif menyatakan boleh
// dan pesan penolakan ditampilkan apa adanya. Unggah berkas: POST /api/sigap/keu/adm-berkas. Logika murni: lib/keu/adm.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { angka, STATUS_ADM, urlBaca } from "@/lib/keu/ro";
import type { WarnaChip } from "@/lib/keu/revisi";
import {
  alasanSah, alasanTanpaAksi, aksiUntukHak, bagianSaya, dapatDitandaiDraf, FILTER_ADM, jenisKelengkapan, kelompokKomponen, kunciPihak, LABEL_AKSI, MIN_ALASAN_KEMBALI,
  opsiLembar, periksaBerkas, ringkasDok, saringItem, STATUS_DOK, susunDokumen, teksRingkasDok, ukuranTeks, WARNA_DOK,
  type BarisDok, type BarisMasterDok, type DokTampil, type HakDok, type ItemAdm,
} from "@/lib/keu/adm";
import { bacaSesi } from "@/app/portal/sesi";
import { Catatan, Chip, Galat, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, Memuat, Potong, Progres, tombolAktif, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { aksiKeu, useBacaKeu, useKirim } from "../useKeu";

type RingkasAdm = { n_item: number | string; n_item_tanpa_dokumen: number | string; n_dok: number | string; n_belum: number | string; n_draf: number | string; n_terunggah: number | string; n_terverifikasi: number | string; persen_terverifikasi: number | string | null };
type InfoLembar = { detail_id: number; volume: number | string; satuan: string; alasan_aturan: string | null };
type InfoDetail = { id: number; harga_satuan: number | string };

const WARNA_ADM: Record<string, WarnaChip> = { lengkap: "hijau", diperiksa: "biru", berjalan: "kuning", belum: "abu", tanpa_dokumen: "abu" };
const waktu = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "");
const th = "px-2.5 py-2 text-left text-[11.5px] font-semibold text-[#5B6B84]";
const td = "px-2.5 py-2 align-top";

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

// ---------------------------------------------------------------- hak akun ini per kelompok pihak (disimpan selama tab terbuka)
function useHakCache(ro: string): { hak: Map<string, HakDok>; minta: (daftar: string[][]) => void } {
  const [hak, setHak] = useState<Map<string, HakDok>>(new Map());
  const diminta = useRef<Set<string>>(new Set());
  const hidup = useRef(true);
  useEffect(() => { hidup.current = true; return () => { hidup.current = false; }; }, []);
  const minta = useCallback((daftar: string[][]) => {
    for (const pihak of daftar) {
      const k = kunciPihak(pihak);
      if (diminta.current.has(k)) continue;
      diminta.current.add(k);
      void Promise.all([
        aksiKeu<boolean>("keu_adm_boleh_unggah", { p_ro: ro, p_pihak: pihak }),
        aksiKeu<boolean>("keu_adm_boleh_verif", { p_ro: ro, p_pihak: pihak }),
      ]).then(([u, v]) => {
        if (hidup.current) setHak((m) => new Map(m).set(k, { unggah: u.ok && u.data === true, verif: v.ok && v.data === true }));
      });
    }
  }, [ro]);
  return { hak, minta };
}

// ---------------------------------------------------------------- satu dokumen (baris tabel)
function BarisDokumen({ d, detailId, hak, sesudah }: { d: DokTampil; detailId: number; hak: HakDok | undefined; sesudah: () => Promise<void> }) {
  const { kirim, jalankan, mengirim, galat, hapusGalat } = useKirim(sesudah);
  const [kembali, setKembali] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [galatLokal, setGalatLokal] = useState<string | null>(null);
  const berkasRef = useRef<HTMLInputElement>(null);
  const aksi = aksiUntukHak(d.status, d.gen, hak);
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
    <tr className="border-t border-[#E7ECF4]">
      <td className={`${td} font-mono text-[12px] text-[#44546F]`}>{d.no}</td>
      <td className={td}>
        <span className="break-words">{d.uraian}</span>
        {d.gen && d.status === "belum" && <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-[#E3EEFF] px-2 text-[11px] font-semibold text-[#1F5FD1]">dapat dibuat SIGAP</span>}
      </td>
      <td className={td}>
        {d.pihak.length === 0 ? "" : d.pihak.map((p) => <span key={p} className="mr-1 inline-block whitespace-nowrap rounded-full bg-[#E8EDF5] px-2 text-[11px] font-semibold text-[#34445F]">{p}</span>)}
      </td>
      <td className={`${td} text-[12px] text-[#5B6B84]`}>{d.ket}</td>
      <td className={td}>
        <Chip warna={WARNA_DOK[d.status] ?? "abu"}>{STATUS_DOK[d.status] ?? d.status}</Chip>
        {d.berkas && d.admId !== null && (
          <div className="mt-1 flex flex-col gap-0.5 text-[12px] text-[#44546F]">
            <button type="button" className="w-fit max-w-[220px] break-all text-left font-semibold text-[#1F5FD1] underline" onClick={() => void unduh(d.admId as number, d.berkas as string).then((g) => setGalatLokal(g))}>{d.berkas}</button>
            <span>{ukuranTeks(d.ukuran)}{d.diunggahAt ? ` · diunggah ${waktu(d.diunggahAt)}` : ""}{d.diverifikasiAt ? ` · diverifikasi ${waktu(d.diverifikasiAt)}` : ""}</span>
          </div>
        )}
        {d.catatan && <div className="mt-1 text-[12px] italic text-[#5B6B84]">Catatan: {d.catatan}</div>}
      </td>
      <td className={td}>
        <div className="flex flex-col gap-1.5">
          {aksi.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {aksi.includes("draf") && <button type="button" disabled={mengirim} className={`${tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`} onClick={() => void kirim("keu_adm_aksi", args("draf"))}>{LABEL_AKSI.draf}</button>}
              {aksi.includes("unggah") && (
                <>
                  <input ref={berkasRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.odt,.ods" onChange={(e) => unggah(e.target.files?.[0])} />
                  <button type="button" disabled={mengirim} className={`${d.status === "terunggah" ? tombolKecil : tombolUtama} !min-h-[32px] !px-2.5 !text-[12px]`} onClick={() => berkasRef.current?.click()}>
                    {mengirim ? "Memproses…" : d.status === "terunggah" ? "Ganti berkas" : LABEL_AKSI.unggah}
                  </button>
                </>
              )}
              {aksi.includes("verifikasi") && <button type="button" disabled={mengirim} className={`${tombolUtama} !min-h-[32px] !px-2.5 !text-[12px]`} onClick={() => void kirim("keu_adm_aksi", args("verifikasi"))}>{LABEL_AKSI.verifikasi}</button>}
              {aksi.includes("kembalikan") && !kembali && <button type="button" disabled={mengirim} className={`${tombolBahaya} !min-h-[32px] !px-2.5 !text-[12px]`} onClick={() => setKembali(true)}>{LABEL_AKSI.kembalikan}</button>}
            </div>
          ) : <span className="text-[12px] text-[#5B6B84]">{alasanTanpaAksi(d.status, hak)}</span>}
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
          <Galat pesan={galat ?? galatLokal} />
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- pilihan lembar dan seksi
function PilihLembar({ item, master, sesudah }: { item: ItemAdm; master: BarisMasterDok[]; sesudah: () => Promise<void> }) {
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const opsi = useMemo(() => opsiLembar(master), [master]);
  const sekarang = opsi.find((o) => o.kode === item.lembar_kode && o.sumber === (item.sumber ?? ""));
  const atur = (sumber: string, kode: string, huruf: string) => void kirim("keu_adm_peta_atur", { p_detail: item.detail_id, p_sumber: sumber, p_kode: kode, p_huruf: huruf });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-[#5B6B84]">{item.lembar_kode ? "Ubah lembar" : "Pakai lembar"}</span>
        {opsi.map((o) => {
          const on = sekarang?.kode === o.kode && sekarang.sumber === o.sumber;
          return (
            <button key={`${o.sumber}|${o.kode}`} type="button" aria-pressed={on} disabled={mengirim} onClick={() => atur(o.sumber, o.kode, o.seksi[0]?.huruf ?? "")}
              className={`inline-flex min-h-[28px] items-center rounded-full border px-2.5 text-[12px] disabled:opacity-50 ${on ? "border-[#B7CDF5] bg-[#E3EEFF] font-semibold text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>{o.nama}</button>
          );
        })}
        {item.asal === "khusus" && (
          <button type="button" disabled={mengirim} className={`${tombolKecil} !min-h-[28px] !px-2.5 !text-[12px]`} onClick={() => void kirim("keu_adm_peta_lepas", { p_detail: item.detail_id })}>Kembali ke aturan otomatis</button>
        )}
      </div>
      {sekarang && sekarang.seksi.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-[#5B6B84]">Seksi</span>
          {sekarang.seksi.map((s) => {
            const on = s.huruf === (item.seksi_huruf ?? "");
            return (
              <button key={s.huruf || s.judul} type="button" aria-pressed={on} disabled={mengirim} onClick={() => atur(sekarang.sumber, sekarang.kode, s.huruf)}
                className={`inline-flex min-h-[28px] items-center rounded-full border px-2.5 text-[12px] disabled:opacity-50 ${on ? "border-[#B7CDF5] bg-[#E3EEFF] font-semibold text-[#1F5FD1]" : "border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>{s.huruf ? `${s.huruf}. ` : ""}{s.judul.slice(0, 34)}</button>
            );
          })}
        </div>
      )}
      <p className="text-[12px] text-[#5B6B84]">Bila lembar otomatis keliru, pilih lembar lain. Ditolak bila item sudah punya dokumen terunggah atau terverifikasi.</p>
      <Galat pesan={galat} />
    </div>
  );
}

// ---------------------------------------------------------------- panel kanan: satu item
export function PanelItem({ item, master, hak, minta, sesudah }: { item: ItemAdm; master: BarisMasterDok[]; hak: Map<string, HakDok>; minta: (daftar: string[][]) => void; sesudah: () => Promise<void> }) {
  const dok = useBacaKeu<BarisDok>(urlBaca("keu_v_adm_dokumen", { detail_id: item.detail_id }, { batas: 300 }));
  const info = useBacaKeu<InfoLembar>(urlBaca("keu_v_adm_lembar", { detail_id: item.detail_id }, { batas: 1, kolom: ["detail_id", "volume", "satuan", "alasan_aturan"] }));
  const harga = useBacaKeu<InfoDetail>(urlBaca("keu_pok_detail", { id: item.detail_id }, { batas: 1, kolom: ["id", "harga_satuan"] }));
  const [saya, setSaya] = useState(false);
  const [pesan, setPesan] = useState("");
  const [massal, setMassal] = useState(false);
  const muatUlang = useCallback(async () => { await dok.muat(); await info.muat(); await sesudah(); }, [dok, info, sesudah]);
  const seksi = useMemo(() => (dok.baris ? susunDokumen(dok.baris) : null), [dok.baris]);
  const semuaDok = useMemo(() => (seksi ? seksi.flatMap((s) => s.dok) : []), [seksi]);
  useEffect(() => {
    const peta = new Map<string, string[]>();
    for (const d of semuaDok) if (d.pihak.length) peta.set(kunciPihak(d.pihak), d.pihak);
    if (peta.size) minta([...peta.values()]);
  }, [semuaDok, minta]);
  const tampil = saya ? bagianSaya(semuaDok, hak) : semuaDok;
  const bisaMassal = dapatDitandaiDraf(semuaDok, hak);
  const r = ringkasDok(semuaDok);
  const li = info.baris?.[0];
  const hg = harga.baris?.[0];

  const tandaiSemua = async () => {
    setMassal(true); setPesan("");
    let ok = 0; const gagal: string[] = [];
    for (const d of bisaMassal) {
      const h = await aksiKeu("keu_adm_aksi", { p_detail: item.detail_id, p_dok: d.dokId, p_aksi: "draf", p_catatan: "" });
      if (h.ok) ok++; else gagal.push(`${d.no}. ${h.pesan}`);
    }
    setMassal(false);
    setPesan(`${ok} dokumen ditandai draf siap.${gagal.length ? ` Gagal ${gagal.length}: ${gagal.slice(0, 3).join("; ")}` : ""} Setiap dokumen tetap diunggah bertanda tangan lalu diverifikasi.`);
    await muatUlang();
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className={`${kartu} flex flex-col gap-2.5`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className={`${judulKartu} min-w-0 break-words`}><span className="font-mono">{item.akun_kode}</span> {item.nomor_item ? `${item.nomor_item}. ` : ""}{item.uraian}</h2>
          <span className="whitespace-nowrap font-mono text-[13px] font-bold text-[#0F2A52]">Rp {angka(item.jumlah)}</span>
        </div>
        <p className="text-[12px] text-[#5B6B84]">
          {li ? `${angka(li.volume)} ${li.satuan}` : ""}{li && hg ? ` × Rp ${angka(hg.harga_satuan)}` : ""}{li ? ", " : ""}komponen {item.komponen_kode}.
        </p>
        {item.lembar_kode ? (
          <div className="flex flex-wrap items-center gap-2">
            <Chip warna="biru">{item.sumber === "pola" ? `Pola umum ${item.lembar_kode}` : `Lembar ${item.lembar_kode}${item.seksi_huruf ? `, seksi ${item.seksi_huruf}` : ""}`}</Chip>
            <span className="text-[12px] text-[#5B6B84]">Dasar penentuan: {item.asal === "khusus" ? "ditetapkan khusus untuk item ini" : (li?.alasan_aturan ?? "aturan otomatis menurut akun dan uraian")}</span>
          </div>
        ) : (
          <Catatan>Tidak ada lembar kelengkapan untuk akun {item.akun_kode} pada daftar yang ada (mis. belanja pegawai atau belanja modal). Item ini tidak memiliki daftar dokumen. Bila perlu, pilih lembar di bawah.</Catatan>
        )}
        {item.sumber === "pola" && <Catatan>Item ini tidak punya lembar dari subject matter, jadi daftar dokumennya dibuat dari pola umum menurut akun (Master dokumen). Pola dapat diganti di bawah.</Catatan>}
        <PilihLembar item={item} master={master} sesudah={muatUlang} />
      </section>

      {item.lembar_kode && (
        <section className={`${kartu} flex flex-col gap-2.5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={judulKartu}>Dokumen yang diperlukan ({semuaDok.length})</h2>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={saya} onClick={() => setSaya(!saya)} className={`${saya ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>Hanya bagian saya</button>
              <button type="button" disabled={bisaMassal.length === 0 || massal} onClick={() => void tandaiSemua()} className={`${tombolUtama} !min-h-[32px] !px-2.5 !text-[12px]`}>
                {massal ? "Memproses…" : `Tandai draf siap untuk semua yang dapat dibuat SIGAP (${bisaMassal.length})`}
              </button>
            </div>
          </div>
          {dok.galat ? <Galat pesan={dok.galat} /> : !seksi ? <Memuat tinggi="h-20" /> : (
            <>
              <p className="text-[12px] text-[#5B6B84]">{teksRingkasDok(r)}</p>
              {semuaDok.length === 0 ? <p className="text-[13px] text-[#5B6B84]">Item ini tidak memiliki daftar dokumen.</p> : tampil.length === 0 ? <p className="text-[13px] text-[#5B6B84]">Tidak ada dokumen yang menjadi bagian Anda pada item ini.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-[13px]">
                    <thead><tr className="bg-[#F4F7FB]"><th className={th}>No</th><th className={th}>Dokumen</th><th className={th}>Pihak</th><th className={th}>Keterangan</th><th className={th}>Status</th><th className={th}>Tindakan</th></tr></thead>
                    <tbody>
                      {seksi.map((s) => {
                        const baris = s.dok.filter((d) => tampil.includes(d));
                        if (baris.length === 0) return null;
                        return [
                          seksi.length > 1 && <tr key={`s-${s.huruf}-${s.judul}`} className="bg-[#F9FBFE]"><td colSpan={6} className="px-2.5 py-1.5 text-[12px] font-bold text-[#0F2A52]">{s.huruf ? `${s.huruf}. ` : ""}{s.judul}</td></tr>,
                          ...baris.map((d) => <BarisDokumen key={d.dokId} d={d} detailId={item.detail_id} hak={hak.get(kunciPihak(d.pihak))} sesudah={muatUlang} />),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {pesan && <Catatan>{pesan}</Catatan>}
          <p className="text-[12px] text-[#5B6B84]">Status mengikuti urutan Belum, Draf SIGAP, Terunggah, Terverifikasi. Hanya pihak yang bertanggung jawab (kolom Pihak) dan PPK yang dapat mengunggah dokumen bagian itu; verifikasi oleh PPK, bendahara untuk dokumen bendahara, atau pihak lain yang diberi wewenang. Pembuatan isi dokumen otomatis oleh SIGAP belum tersedia: &quot;Tandai draf siap&quot; hanya menandai bahwa draf disiapkan, dan berkas tetap diunggah.</p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tab
export function TabAdministrasi({ kode }: { kode: string }) {
  const adm = useBacaKeu<ItemAdm>(urlBaca("keu_v_adm_item", { ro_kode: kode }, { urut: "akun_kode", batas: 5000, kolom: ["detail_id", "akun_kode", "komponen_kode", "nomor_item", "uraian", "jumlah", "sumber", "lembar_kode", "seksi_huruf", "asal", "n_dok", "n_belum", "n_terverifikasi", "status_item"] }));
  const rk = useBacaKeu<RingkasAdm>(urlBaca("keu_v_adm_ringkas", { ro_kode: kode }, { batas: 1 }));
  const master = useBacaKeu<BarisMasterDok>(urlBaca("keu_master_dok", { aktif: "true" }, { kolom: ["sumber", "kode", "seksi_huruf", "seksi_judul", "seksi_urut"], urut: "kode", batas: 2000 }));
  const [saring, setSaring] = useState("");
  const [terpilih, setTerpilih] = useState<number | null>(null);
  const segarkan = useCallback(async () => { await Promise.all([adm.muat(), rk.muat()]); }, [adm, rk]);

  const { hak, minta } = useHakCache(kode);

  const baris = adm.baris ?? [];
  const tampil = useMemo(() => saringItem(baris, saring), [baris, saring]);
  const kelompok = useMemo(() => kelompokKomponen(tampil), [tampil]);
  const item = baris.find((i) => i.detail_id === terpilih) ?? null;

  if (adm.galat) return <Galat pesan={adm.galat} />;
  if (!adm.baris) return <Memuat />;
  if (adm.baris.length === 0) return <Kosong teks="RO ini belum punya item pada POK yang berlaku." />;
  const k = rk.baris?.[0];
  const nMenunggu = k ? Number(k.n_terunggah) + Number(k.n_draf) : 0;
  const nDenganLembar = k ? Number(k.n_item) - Number(k.n_item_tanpa_dokumen) : 0;
  return (
    <div className="flex flex-col gap-3.5">
      {k && (
        <div className={kisi}>
          <Kpi label="Item dengan lembar dokumen" nilai={angka(nDenganLembar)} sub={`dari ${angka(k.n_item)} baris POK${baris.some((i) => i.sumber === "pola") ? "; sisanya pola umum" : ""}`} />
          <Kpi label="Dokumen terverifikasi" nilai={angka(k.n_terverifikasi)} sub={`dari ${angka(k.n_dok)} dokumen${k.persen_terverifikasi === null ? "" : ` (${angka(k.persen_terverifikasi)}%)`}`} warna="hj" />
          <Kpi label="Menunggu verifikasi" nilai={angka(nMenunggu)} sub="sudah diunggah atau draf" />
          <Kpi label="Belum ada" nilai={angka(k.n_belum)} sub="dokumen belum tersedia" warna={Number(k.n_belum) > 0 ? "mr" : undefined} />
        </div>
      )}

      <div className="grid items-start gap-3.5 min-[1100px]:[grid-template-columns:minmax(300px,420px)_minmax(0,1fr)]">
        <section className={`${kartu} flex min-w-0 flex-col gap-2.5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={judulKartu}>Item POK</h2>
            <span className="text-[12px] text-[#5B6B84]">{angka(tampil.length)} dari {angka(baris.length)} item</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_ADM.map((f) => <button key={f.kode} type="button" aria-pressed={saring === f.kode} onClick={() => setSaring(f.kode)} className={`${saring === f.kode ? tombolAktif : tombolKecil} !min-h-[32px] !px-2.5 !text-[12px]`}>{f.nama}</button>)}
          </div>
          {adm.terpotong && <Potong />}
          {tampil.length === 0 && <p className="text-[13px] text-[#5B6B84]">Tidak ada item untuk filter ini.</p>}
          <div className="flex max-h-[900px] flex-col gap-1.5 overflow-y-auto pr-0.5">
            {kelompok.map((g) => (
              <div key={g.komponen} className="flex flex-col gap-1.5">
                <div className="px-0.5 pt-1.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">{g.label}</div>
                {g.item.map((i) => {
                  const nd = Number(i.n_dok), tv = Number(i.n_terverifikasi), nb = Number(i.n_belum);
                  const pil = i.detail_id === terpilih;
                  return (
                    <button key={i.detail_id} type="button" aria-pressed={pil} onClick={() => setTerpilih(pil ? null : i.detail_id)}
                      className={`flex w-full min-w-0 flex-col gap-1 rounded-lg border px-2.5 py-2 text-left ${pil ? "border-[#B7CDF5] bg-[#F3F8FE]" : "border-[#DCE3EE] bg-white hover:bg-[#F7FAFE]"}`}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-[13px] text-[#0F2A52]"><b className="font-mono">{i.akun_kode}</b> {i.nomor_item ? `${i.nomor_item}. ` : ""}{i.uraian.slice(0, 54)}</span>
                        <span className="whitespace-nowrap font-mono text-[12px] text-[#44546F]">{angka(i.jumlah)}</span>
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-1.5">
                        <Chip warna={WARNA_ADM[i.status_item] ?? "abu"}>{STATUS_ADM[i.status_item] ?? i.status_item}</Chip>
                        <span className="text-[12px] text-[#5B6B84]">{jenisKelengkapan(i)}</span>
                      </span>
                      {nd > 0 && <Progres hijau={(tv / nd) * 100} kuning={((nd - nb - tv) / nd) * 100} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {item ? (
          <PanelItem key={item.detail_id} item={item} master={master.baris ?? []} hak={hak} minta={minta} sesudah={segarkan} />
        ) : (
          <section className={`${kartu} flex flex-col gap-2`}>
            <h2 className={judulKartu}>Pilih satu item POK di sebelah kiri</h2>
            <p className="text-[12.5px] text-[#5B6B84]">Daftar dokumen mengikuti jenis kelengkapan item: akun, uraian, dan hasil identifikasi kegiatan. Di sana Anda dapat mengunggah berkas, memverifikasi, atau mengembalikan dokumen; hak tiap aksi mengikuti pihak dokumen, dan bila bukan bagian Anda, tombolnya tidak tampil.</p>
          </section>
        )}
      </div>
      <Catatan>Dokumen yang diperlukan tiap item ditentukan dari lembar kelengkapan menurut akun dan uraiannya. Dokumen terverifikasi hanya dapat dikembalikan oleh PPK.</Catatan>
    </div>
  );
}
