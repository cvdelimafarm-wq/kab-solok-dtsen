"use client";

// app/sigap/ro/[kode]/Tab.tsx
//
// (24 Okt 2026) Isi tab halaman RO (hanya baca): Ringkasan, Anggaran, Administrasi, Kekurangan RAB.
// Tiap tab mengambil datanya sendiri dan baru dimuat saat tab dibuka (hooks di app/sigap/ro/useKeu.ts, logika di lib/keu/ro.ts).

import { useMemo } from "react";
import { angka, persen, ringkasRo, rupiah, STATUS_ADM, STATUS_KEK, STATUS_RAB, urlBaca, WARNA_KATEGORI, type KomponenAnggaran } from "@/lib/keu/ro";
import { useAnggaranRo, useBacaKeu } from "../useKeu";

const kartu = "rounded-[20px] bg-white p-4 shadow-[0_4px_16px_rgba(15,42,82,0.08)]";
const Galat = ({ pesan }: { pesan: string }) => <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{pesan}</p>;
const Memuat = () => <div className="h-40 animate-pulse rounded-[20px] bg-white" aria-busy="true" />;
const Kosong = ({ teks }: { teks: string }) => <p className={`${kartu} text-[13.5px] text-[#5B6B84]`}>{teks}</p>;
const Potong = () => <p className="rounded-[14px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-bold text-[#8A6200]">Data terlalu banyak sehingga hanya sebagian yang ditampilkan.</p>;

function Angka({ label, nilai, sub }: { label: string; nilai: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[#6B7A93]">{label}</p>
      <p className="break-words text-[16px] font-extrabold text-[#0F2A52]">{nilai}</p>
      {sub && <p className="text-[12px] text-[#6B7A93]">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Ringkasan
type Skor = { total: number | string | null; kategori: string | null; ada_rab_sah: boolean; n_penarikan: number | string | null; n_volume: number | string | null; n_cakupan: number | string | null; n_disiplin: number | string | null; sampai_bulan: number | string };
type KekRo = { n_terbuka: number | string; jumlah_terbuka: number | string };
type AdmRo = { persen_terverifikasi: number | string | null; n_dok: number | string; n_belum: number | string };

export function TabRingkasan({ kode }: { kode: string }) {
  const ang = useAnggaranRo(kode);
  const skor = useBacaKeu<Skor>(urlBaca("keu_v_skor_ro", { ro_kode: kode }, { urut: "-sampai_bulan", batas: 1 }));
  const kek = useBacaKeu<KekRo>(urlBaca("keu_v_kekurangan_ro", { ro_kode: kode }, { batas: 1 }));
  const adm = useBacaKeu<AdmRo>(urlBaca("keu_v_adm_ringkas", { ro_kode: kode }, { batas: 1 }));
  const r = useMemo(() => (ang.anggaran ? ringkasRo(ang.anggaran, skor.baris?.[0], kek.baris?.[0], adm.baris?.[0]) : null), [ang.anggaran, skor.baris, kek.baris, adm.baris]);

  if (ang.galat) return <Galat pesan={ang.galat} />;
  if (!r) return <Memuat />;
  return (
    <div className="space-y-3">
      <section className={kartu}>
        <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#44546F]">Anggaran</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <Angka label="Pagu POK berlaku" nilai={rupiah(r.pok)} sub={`${angka(r.nItem)} item`} />
          <Angka label="Realisasi" nilai={rupiah(r.realisasi)} sub={`${persen(r.realisasi, r.pok)} dari pagu${ang.sampaiTanggal ? ` · s.d. ${ang.sampaiTanggal}` : ""}`} />
          <Angka label="Jumlah RAB" nilai={rupiah(r.rabJumlah)} sub={ang.rab ? `RAB ${ang.rab.status.replace(/_/g, " ")}` : "Belum ada RAB"} />
          <Angka label="Item sudah ber-RAB" nilai={`${angka(r.nItemBerRab)} / ${angka(r.nItem)}`} />
        </div>
      </section>

      <section className={kartu}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#44546F]">Skor</h2>
          {r.skor?.kategori && <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${WARNA_KATEGORI[r.skor.kategori] ?? "bg-[#EEF2F7] text-[#44546F]"}`}>{r.skor.kategori}</span>}
        </div>
        {r.skor ? (
          <p className="mt-2 text-[22px] font-extrabold text-[#0F2A52]">{r.skor.total === null ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(r.skor.total)}</p>
        ) : (
          <p className="mt-2 text-[13.5px] text-[#5B6B84]">Skor muncul setelah RO punya RAB yang disahkan.</p>
        )}
        <p className="mt-1 text-[12px] text-[#6B7A93]">Rumus skor masih sementara dan menunggu keputusan PPK.</p>
      </section>

      <section className={kartu}>
        <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#44546F]">Kekurangan RAB</h2>
        <p className="mt-2 text-[14px] font-bold text-[#0F2A52]">
          {r.kekurangan.nTerbuka > 0 ? `${angka(r.kekurangan.nTerbuka)} catatan terbuka · ${rupiah(r.kekurangan.jumlahTerbuka)}` : "Tidak ada catatan terbuka"}
        </p>
      </section>

      <section className={kartu}>
        <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#44546F]">Administrasi</h2>
        <p className="mt-2 text-[14px] font-bold text-[#0F2A52]">
          {r.administrasi.nDok > 0 ? `${r.administrasi.persenVerifikasi === null ? "-" : angka(r.administrasi.persenVerifikasi)}% dokumen terverifikasi · ${angka(r.administrasi.nBelum)} belum diunggah (dari ${angka(r.administrasi.nDok)})` : "Belum ada dokumen yang dipetakan"}
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Anggaran
function BarisItem({ i }: { i: KomponenAnggaran["akun"][number]["item"][number] }) {
  return (
    <li className="border-t border-[#EEF2F7] py-2.5">
      <p className="break-words text-[13.5px] font-bold leading-snug text-[#0F2A52]">{i.nomor_item ? `${i.nomor_item}. ` : ""}{i.uraian}</p>
      <p className="mt-0.5 text-[12px] text-[#6B7A93]">{angka(i.volume)} {i.satuan}</p>
      <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[12.5px]">
        <div><dt className="text-[#6B7A93]">POK</dt><dd className="font-extrabold text-[#0F2A52]">{angka(i.pok)}</dd></div>
        <div><dt className="text-[#6B7A93]">Realisasi</dt><dd className="font-extrabold text-[#0F2A52]">{angka(i.realisasi)}</dd></div>
        <div><dt className="text-[#6B7A93]">RAB</dt><dd className="font-extrabold text-[#0F2A52]">{i.rab === null ? "-" : angka(i.rab)}</dd></div>
      </dl>
      {i.statusRab && <p className="mt-1 text-[11.5px] font-bold text-[#44546F]">{STATUS_RAB[i.statusRab] ?? i.statusRab}</p>}
    </li>
  );
}

export function TabAnggaran({ kode }: { kode: string }) {
  const ang = useAnggaranRo(kode);
  if (ang.galat) return <Galat pesan={ang.galat} />;
  if (!ang.anggaran) return <Memuat />;
  if (ang.anggaran.length === 0) return <Kosong teks="RO ini belum punya item pada POK yang berlaku." />;
  return (
    <div className="space-y-3">
      {ang.terpotong && <Potong />}
      {ang.sampaiTanggal && <p className="text-[12px] text-[#6B7A93]">Realisasi sampai {ang.sampaiTanggal}.</p>}
      {ang.anggaran.map((k) => (
        <section key={k.komponen} className={kartu}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[14px] font-extrabold text-[#0F2A52]">Komponen {k.komponen}</h2>
            <p className="text-[12.5px] font-extrabold text-[#1F5FD1]">{rupiah(k.pok)}</p>
          </div>
          {k.akun.map((a) => (
            <details key={a.akun} className="mt-2 rounded-[14px] bg-[#F5F8FE] px-3 py-1">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-extrabold text-[#0F2A52]">
                <span>Akun {a.akun}</span>
                <span className="text-[12.5px] text-[#44546F]">{rupiah(a.pok)}</span>
              </summary>
              <p className="pb-1 text-[12px] text-[#6B7A93]">Realisasi {rupiah(a.realisasi)} ({persen(a.realisasi, a.pok)}) · RAB {rupiah(a.rab)}</p>
              <ul>{a.item.map((i) => <BarisItem key={i.detail_id} i={i} />)}</ul>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Administrasi
type ItemAdm = { detail_id: number; nomor_item: string | null; uraian: string; jumlah: number | string; n_dok: number | string; n_belum: number | string; n_terverifikasi: number | string; status_item: string };
const WARNA_ADM: Record<string, string> = { lengkap: "bg-[#E3F6EC] text-[#0B6B3F]", diperiksa: "bg-[#E6EFFD] text-[#1F4EA8]", berjalan: "bg-[#FFF4D6] text-[#8A6200]", belum: "bg-[#EEF2F7] text-[#44546F]", tanpa_dokumen: "bg-[#EEF2F7] text-[#6B7A93]" };

export function TabAdministrasi({ kode }: { kode: string }) {
  const adm = useBacaKeu<ItemAdm>(urlBaca("keu_v_adm_item", { ro_kode: kode }, { urut: "nomor_item", batas: 5000, kolom: ["detail_id", "nomor_item", "uraian", "jumlah", "n_dok", "n_belum", "n_terverifikasi", "status_item"] }));
  if (adm.galat) return <Galat pesan={adm.galat} />;
  if (!adm.baris) return <Memuat />;
  if (adm.baris.length === 0) return <Kosong teks="RO ini belum punya item pada POK yang berlaku." />;
  return (
    <div className="space-y-2.5">
      {adm.terpotong && <Potong />}
      <p className="text-[12px] text-[#6B7A93]">Hanya untuk melihat. Mengunggah dan memverifikasi dokumen belum tersedia di halaman ini.</p>
      <ul className="space-y-2.5">
        {adm.baris.map((i) => (
          <li key={i.detail_id} className={kartu}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-[13.5px] font-bold leading-snug text-[#0F2A52]">{i.nomor_item ? `${i.nomor_item}. ` : ""}{i.uraian}</p>
              <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-extrabold ${WARNA_ADM[i.status_item] ?? "bg-[#EEF2F7] text-[#44546F]"}`}>{STATUS_ADM[i.status_item] ?? i.status_item}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-[#6B7A93]">
              {rupiah(i.jumlah)}{Number(i.n_dok) > 0 ? ` · ${angka(i.n_terverifikasi)} dari ${angka(i.n_dok)} dokumen terverifikasi` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- Kekurangan RAB
type Kek = { id: number; akun_kode: string; uraian: string; jumlah: number | string; prioritas_nama: string | null; prioritas_urut: number | string | null; alasan: string | null; status: string; terbuka: boolean; kali_ditunda: number | string | null };

export function TabKekurangan({ kode }: { kode: string }) {
  const kek = useBacaKeu<Kek>(urlBaca("keu_v_kekurangan", { ro_kode: kode }, { urut: "prioritas_urut", batas: 2000, kolom: ["id", "akun_kode", "uraian", "jumlah", "prioritas_nama", "prioritas_urut", "alasan", "status", "terbuka", "kali_ditunda"] }));
  if (kek.galat) return <Galat pesan={kek.galat} />;
  if (!kek.baris) return <Memuat />;
  if (kek.baris.length === 0) return <Kosong teks="Belum ada catatan kekurangan RAB untuk RO ini." />;
  const terbuka = kek.baris.filter((k) => k.terbuka);
  const jumlah = terbuka.reduce((a, k) => a + Number(k.jumlah), 0);
  return (
    <div className="space-y-2.5">
      {kek.terpotong && <Potong />}
      <p className="text-[13px] font-bold text-[#0F2A52]">{terbuka.length} catatan terbuka · {rupiah(jumlah)}</p>
      <ul className="space-y-2.5">
        {kek.baris.map((k) => (
          <li key={k.id} className={`${kartu} ${k.terbuka ? "" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-[13.5px] font-bold leading-snug text-[#0F2A52]">{k.uraian}</p>
              <span className="flex-none rounded-full bg-[#EEF2F7] px-2.5 py-1 text-[11px] font-extrabold text-[#44546F]">{STATUS_KEK[k.status] ?? k.status}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-[#6B7A93]">Akun {k.akun_kode} · {rupiah(k.jumlah)}{k.prioritas_nama ? ` · ${k.prioritas_nama}` : ""}{Number(k.kali_ditunda) > 0 ? ` · ditunda ${k.kali_ditunda}×` : ""}</p>
            {k.alasan && <p className="mt-1 break-words text-[12.5px] text-[#44546F]">{k.alasan}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
