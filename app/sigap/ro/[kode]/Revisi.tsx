"use client";

// app/sigap/ro/[kode]/Revisi.tsx
//
// (24 Okt 2026) Tab "Revisi" ruang kerja satu RO -- usulan revisi per RO (papan 9 dan 10 mockup). Satu kartu per jadwal revisi yang dibuka
// (atau yang sudah punya usulan RO ini): buat usulan, stepper Draf > Menunggu ketua tim > Menunggu PPK > Disetujui, tombol aksi sesuai hak,
// riwayat, dan pintu ke kertas kerja KRO. Hak hanya menentukan tombol yang tampil; keu_usulan_buat/keu_usulan_aksi di basis data yang memutuskan.
// Logika murni: lib/keu/usulan.ts.

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { n } from "@/lib/keu/kk";
import { kroDariRo } from "@/lib/keu/matriks";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, LABEL_STATUS_USULAN, statusTenggat, tglPanjang, WARNA_CHIP_STATUS_USULAN } from "@/lib/keu/revisi";
import {
  aksiUsulan, bolehBuatUsulan, jadwalTampil, jejakUsulan, keadaanLangkah, LABEL_AKSI_USULAN, LABEL_JEJAK_USULAN, LANGKAH_USULAN, periksaAlasanUsulan,
  teksGiliran, usulanJadwal, type AksiUsulan, type BarisJejakUsulan, type HakUsulan,
} from "@/lib/keu/usulan";
import { caps, Catatan, Chip, Galat, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, Memuat, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { useBacaKeu, useBoleh, useKirim } from "../useKeu";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; buka: string | null; tutup: string | null; status: string };
type Usulan = { id: number; jadwal_id: number; ro_kode: string; rab_id: number | null; status: string; catatan: string | null; diajukan_at: string | null; disetujui_ketua_at: string | null; disahkan_at: string | null; dibuat_at: string };
type Ringkas = { jadwal_id: number; ro_kode: string; total_semula: number | string; total_menjadi: number | string; selisih: number | string; n_berubah: number | string; n_baru: number | string; n_penggenap: number | string };

const waktuWib = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).replace(".", ":")} WIB`;
};

/** Hak akun pada RO ini (rab, draf, setuju_ketua, sahkan). null = belum diketahui. */
export function useHakUsulan(kode: string): HakUsulan | null {
  const rab = useBoleh("rab", kode);
  const draf = useBoleh("draf", kode);
  const setuju = useBoleh("setuju_ketua", kode);
  const sahkan = useBoleh("sahkan", kode);
  return useMemo(() => (rab === null || draf === null || setuju === null || sahkan === null ? null : { rab, draf, setuju_ketua: setuju, sahkan }), [rab, draf, setuju, sahkan]);
}

/** Usulan RO ini + jadwal, dipakai tab Revisi dan lencana pada bilah tab (ringan: dua baca kecil). */
export function useUsulanRo(kode: string) {
  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 100, kolom: ["id", "tahun", "jenis", "judul", "buka", "tutup", "status"] }));
  const usulan = useBacaKeu<Usulan>(urlBaca("keu_revisi_usulan", { ro_kode: kode }, { urut: "-id", batas: 200, kolom: ["id", "jadwal_id", "ro_kode", "rab_id", "status", "catatan", "diajukan_at", "disetujui_ketua_at", "disahkan_at", "dibuat_at"] }));
  return { jadwal, usulan };
}

function Stepper({ status }: { status: string }) {
  const ks = keadaanLangkah(status);
  return (
    <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Alur usulan">
      {LANGKAH_USULAN.map((l, i) => {
        const k = ks[i];
        const kelas = k === "selesai" ? "border-[#14653A] bg-[#E6F6EC] text-[#14653A]" : k === "sekarang" ? (status === "dikembalikan" ? "border-[#B42329] bg-[#FDE8E8] text-[#B42329]" : "border-[#1F5FD1] bg-[#E3EEFF] text-[#1F5FD1]") : "border-[#DCE3EE] bg-white text-[#8794AA]";
        return (
          <li key={l.kode} aria-current={k === "sekarang" ? "step" : undefined} className={`flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold ${kelas}`}>
            <span aria-hidden="true">{k === "selesai" ? "✓" : i + 1}</span>
            {l.label}
            {k === "sekarang" && status === "dikembalikan" && <span className="font-normal"> (dikembalikan)</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Riwayat({ baris }: { baris: BarisJejakUsulan[] }) {
  if (baris.length === 0) return <p className="text-[12.5px] text-[#6B7A93]">Belum ada riwayat.</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {baris.map((b) => (
        <li key={b.id} className="rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#1B2B4B]">
          <span className="font-semibold">{LABEL_JEJAK_USULAN[b.aksi] ?? b.aksi}</span>
          {b.oleh_nama ? ` oleh ${b.oleh_nama}` : ""} <span className="text-[#6B7A93]">· {waktuWib(b.waktu)}</span>
          {b.dari && b.ke && b.dari !== b.ke && <span className="text-[#6B7A93]"> · {LABEL_STATUS_USULAN[b.dari] ?? b.dari} → {LABEL_STATUS_USULAN[b.ke] ?? b.ke}</span>}
          {b.catatan && <span className="mt-0.5 block text-[#44546F]">“{b.catatan}”</span>}
        </li>
      ))}
    </ul>
  );
}

function KartuJadwal({ j, u, hak, jejak, ringkas, kode, muat }: { j: Jadwal; u: Usulan | null; hak: HakUsulan; jejak: BarisJejakUsulan[]; ringkas: Ringkas | null; kode: string; muat: () => Promise<void> }) {
  const { kirim, mengirim, galat, hapusGalat } = useKirim(muat);
  const [pilih, setPilih] = useState<AksiUsulan | null>(null);
  const [catatan, setCatatan] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const aksi = u ? aksiUsulan(u.status, j.status, hak) : [];
  const kro = kroDariRo(kode);
  const tautMatriks = `/sigap/revisi/kertas?jadwal=${j.id}${kro ? `&kro=${encodeURIComponent(kro)}` : ""}&ro=${encodeURIComponent(kode)}&dari=${encodeURIComponent(`/sigap/ro/${encodeURIComponent(kode)}?tab=revisi`)}`;
  const tenggat = j.tutup ? statusTenggat(Math.ceil((new Date(`${j.tutup}T23:59:59+07:00`).getTime() - Date.now()) / 86400000)) : null;

  const jalan = async (a: AksiUsulan) => {
    if (!u) return;
    const c = periksaAlasanUsulan(a, catatan);
    setPesan(c);
    if (c) return;
    if (await kirim("keu_usulan_aksi", { p_usulan: u.id, p_aksi: a, p_catatan: catatan.trim() })) {
      setPilih(null);
      setCatatan("");
    }
  };
  const buat = () => kirim("keu_usulan_buat", { p_jadwal: j.id, p_ro: kode });

  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-label={`Usulan pada ${j.judul}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className={`${judulKartu} min-w-0`}>{j.judul}</h2>
          <Chip warna="biru">{LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis}</Chip>
          <Chip warna={j.status === "dibuka" ? "hijau" : "kuning"}>{LABEL_STATUS_JADWAL[j.status] ?? j.status}</Chip>
        </div>
        {u && <Chip warna={WARNA_CHIP_STATUS_USULAN[u.status] ?? "abu"}>{LABEL_STATUS_USULAN[u.status] ?? u.status}</Chip>}
      </div>
      <p className="text-[12.5px] text-[#5B6B84]">
        {j.buka ? `Dibuka ${tglPanjang(j.buka)}` : "Belum ada tanggal buka"}{j.tutup ? ` · tutup ${tglPanjang(j.tutup)}` : ""}
        {tenggat?.teks && j.status === "dibuka" ? ` (${tenggat.teks})` : ""}
      </p>

      {!u && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-[#44546F]">RO ini belum punya usulan pada jadwal ini.</p>
          {bolehBuatUsulan(j.status, false, hak) ? (
            <button type="button" disabled={mengirim} onClick={buat} className={`${tombolUtama} self-start`}>{mengirim ? "Membuat…" : "Buat usulan revisi RO ini"}</button>
          ) : j.status !== "dibuka" ? (
            <p className="text-[12.5px] text-[#6B7A93]">Usulan baru hanya dapat dibuat selama jadwal dibuka.</p>
          ) : (
            <p className="text-[12.5px] text-[#6B7A93]">Hanya ketua tim atau admin RO yang dapat membuat usulan.</p>
          )}
        </div>
      )}

      {u && (
        <>
          <Stepper status={u.status} />
          <p className="text-[13px] text-[#44546F]">{teksGiliran(u.status)}</p>
          {u.status === "dikembalikan" && u.catatan && <p className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">Dikembalikan: {u.catatan}</p>}
          {ringkas && (
            <div className={kisi}>
              <Kpi label="Jumlah Semula" nilai={rupiah(n(ringkas.total_semula))} />
              <Kpi label="Jumlah Menjadi" nilai={rupiah(n(ringkas.total_menjadi))} sub={`${n(ringkas.n_berubah)} baris berubah`} />
              <Kpi label="Selisih" nilai={rupiah(n(ringkas.selisih))} warna={n(ringkas.selisih) === 0 ? "hj" : "mr"} />
              <Kpi label="Item baru / penggenap" nilai={`${n(ringkas.n_baru)} / ${n(ringkas.n_penggenap)}`} />
            </div>
          )}
          {!ringkas && <p className="text-[12.5px] text-[#6B7A93]">Kertas kerja RO ini belum dimuat untuk jadwal ini. Buka matriks KRO lalu klik “Muat baris POK”.</p>}

          <div className="flex flex-wrap gap-2">
            {aksi.map((a) => (
              <button key={a} type="button" disabled={mengirim}
                onClick={() => { hapusGalat(); if (a === "kembalikan") { setPilih(a); setPesan(null); } else void jalan(a); }}
                className={a === "kembalikan" ? tombolBahaya : tombolUtama}>
                {mengirim && pilih === null ? "Memproses…" : LABEL_AKSI_USULAN[a]}
              </button>
            ))}
            <Link href={tautMatriks} className={`${tombolKecil} inline-flex items-center no-underline`}>Buka kertas kerja KRO{kro ? ` ${kro}` : ""}</Link>
            {u.rab_id && <Link href={`/sigap/ro/${encodeURIComponent(kode)}?tab=rab`} replace scroll={false} className={`${tombolKecil} inline-flex items-center no-underline`}>Lihat RAB</Link>}
          </div>
          {aksi.length === 0 && u.status !== "disetujui" && (
            <p className="text-[12.5px] text-[#6B7A93]">{j.status !== "dibuka" ? "Jadwal tidak sedang dibuka, sehingga usulan tidak dapat diproses." : "Tidak ada tindakan untuk akun Anda pada langkah ini."}</p>
          )}
          {pilih && (
            <div className="space-y-2 rounded-lg bg-[#F5F8FE] p-3">
              <label className={label} htmlFor={`alasan-${u.id}`}>Alasan pengembalian</label>
              <textarea id={`alasan-${u.id}`} className={`${kolom} py-2`} rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
              {pesan && <p role="alert" className="text-[13px] text-[#7A1D22]">{pesan}</p>}
              <div className="flex gap-2">
                <button type="button" disabled={mengirim} onClick={() => void jalan(pilih)} className={`${tombolUtama} flex-1 !bg-[#B42329] !border-[#B42329]`}>{mengirim ? "Memproses…" : LABEL_AKSI_USULAN[pilih]}</button>
                <button type="button" disabled={mengirim} onClick={() => { setPilih(null); setPesan(null); }} className={tombolKecil}>Batal</button>
              </div>
            </div>
          )}
          <Galat pesan={galat} />
          <details className="text-[13px]">
            <summary className={`${caps} cursor-pointer py-1`}>Riwayat usulan ({jejak.length})</summary>
            <div className="pt-2"><Riwayat baris={jejak} /></div>
          </details>
        </>
      )}
      {!u && <Galat pesan={galat} />}
    </section>
  );
}

export function TabRevisi({ kode }: { kode: string }) {
  const { jadwal, usulan } = useUsulanRo(kode);
  const jejak = useBacaKeu<BarisJejakUsulan>(urlBaca("keu_v_usulan_jejak", { ro_kode: kode }, { urut: "-id", batas: 500 }));
  const ringkas = useBacaKeu<Ringkas>(urlBaca("keu_v_kk_ringkas", { ro_kode: kode }, { batas: 100 }));
  const hak = useHakUsulan(kode);
  const muat = useCallback(async () => {
    await Promise.all([jadwal.muat(), usulan.muat(), jejak.muat(), ringkas.muat()]);
  }, [jadwal, usulan, jejak, ringkas]);

  const tampil = useMemo(() => (jadwal.baris && usulan.baris ? jadwalTampil(jadwal.baris, usulan.baris) : null), [jadwal.baris, usulan.baris]);
  const galat = jadwal.galat ?? usulan.galat;
  if (galat) return <Galat pesan={galat} />;
  if (!tampil || !hak) return <Memuat tinggi="h-40" />;

  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-1`}>
        <h2 className={judulKartu}>Usulan revisi RO ini</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Admin RO mengajukan, ketua tim menyetujui, PPK mengesahkan, lalu Kepala (KPA) menerima laporan. Ketua tim yang mengajukan langsung ke PPK; PPK yang merangkap ketua tim langsung menyetujui. Pengaju tidak dapat menyetujui usulannya sendiri.</p>
      </section>
      {tampil.length === 0 && <Kosong teks="Belum ada jadwal revisi yang dibuka. PPK membuka jendela usulan lewat halaman Jadwal revisi." />}
      {tampil.map((j) => {
        const u = usulanJadwal(usulan.baris ?? [], j.id, kode);
        return (
          <KartuJadwal key={j.id} j={j} u={u} hak={hak} kode={kode} muat={muat}
            jejak={u ? jejakUsulan(jejak.baris ?? [], u.id) : []}
            ringkas={(ringkas.baris ?? []).find((r) => r.jadwal_id === j.id && r.ro_kode === kode) ?? null} />
        );
      })}
      {jejak.galat && <Catatan>Riwayat usulan belum dapat dimuat: {jejak.galat}</Catatan>}
    </div>
  );
}
