"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/ImporPetugas.tsx
//
// (6 Nov 2026, permintaan Iqbal) Impor daftar petugas dari template xlsx/csv pada Identifikasi lanjutan (induk daftar petugas).
// Alur: Unduh template (slot kosong sudah berisi peran dan status) -> isi nama -> unggah -> pratinjau (tidak mengubah apa pun) -> Oke impor.
// Aturan dan uji ada di lib/keu/imporPetugas.ts. Berkas dibaca di peramban; tidak ada yang dikirim ke server sebelum draf disimpan seperti biasa.

import { useEffect, useMemo, useRef, useState } from "react";
import { tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { NAMA_PERAN, NAMA_SUMBER, type IsiLanjutan } from "@/lib/keu/lanjutan";
import type { CalonNama } from "@/lib/keu/pilihNama";
import {
  BARIS_PETUNJUK, barisDariTabel, barisDaftarNama, barisTemplate, rencanaImpor, terapkanImpor, type BarisMentah, type HasilBaris,
} from "@/lib/keu/imporPetugas";
import type { Ubah } from "./Isian";

const MAKS_BERKAS = 2 * 1024 * 1024;
type Berkas = { nama: string; baris: BarisMentah[]; tanpaNama: number; galat: string | null };

export default function ImporPetugas({ isi, ubah, mati, organik, mitra, onSelesai }: {
  isi: IsiLanjutan; ubah: Ubah; mati: boolean; organik?: readonly CalonNama[] | null; mitra?: readonly CalonNama[] | null; onSelesai: (pesan: string) => void;
}) {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <button type="button" className={tombolKecil} disabled={mati} onClick={() => setBuka(true)}>Impor dari template</button>
      {buka && <ModalImpor isi={isi} ubah={ubah} organik={organik} mitra={mitra} onTutup={() => setBuka(false)} onSelesai={(p) => { setBuka(false); onSelesai(p); }} />}
    </>
  );
}

function ModalImpor({ isi, ubah, organik, mitra, onTutup, onSelesai }: {
  isi: IsiLanjutan; ubah: Ubah; organik?: readonly CalonNama[] | null; mitra?: readonly CalonNama[] | null; onTutup: () => void; onSelesai: (pesan: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;
  useTutupDenganBack(true, onTutup);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") tutupRef.current(); };
    document.addEventListener("keydown", k);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", k);
  }, []);

  const [berkas, setBerkas] = useState<Berkas | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const rencana = useMemo(() => (berkas && !berkas.galat ? rencanaImpor(isi, berkas.baris, organik, mitra) : null), [berkas, isi, organik, mitra]);
  const daftarKosong = !(organik && organik.length > 0) && !(mitra && mitra.length > 0);

  const unduh = async () => {
    setGalat(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const lembar = (baris: string[][], lebar: number[]) => { const ws = XLSX.utils.aoa_to_sheet(baris); ws["!cols"] = lebar.map((wch) => ({ wch })); return ws; };
      XLSX.utils.book_append_sheet(wb, lembar(barisTemplate(isi), [38, 16, 12, 24]), "Petugas");
      XLSX.utils.book_append_sheet(wb, lembar(BARIS_PETUNJUK, [120]), "Petunjuk");
      XLSX.utils.book_append_sheet(wb, lembar(barisDaftarNama(organik, mitra), [42, 12, 36]), "Daftar nama");
      XLSX.writeFile(wb, "template-petugas.xlsx");
    } catch { setGalat("Template tidak dapat dibuat. Muat ulang halaman lalu coba lagi."); }
  };

  const baca = async (f: File | undefined) => {
    setGalat(null); setBerkas(null);
    if (!f) return;
    if (f.size > MAKS_BERKAS) { setGalat("Berkas lebih dari 2 MB."); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setGalat("Gunakan berkas .xlsx atau .csv (template dari tombol Unduh template)."); return; }
    setSibuk(true);
    try {
      const XLSX = await import("xlsx");
      const wb = /\.csv$/i.test(f.name) ? XLSX.read(await f.text(), { type: "string" }) : XLSX.read(await f.arrayBuffer(), { type: "array" });
      const nama = wb.SheetNames.find((n) => n.trim().toLowerCase() === "petugas") ?? wb.SheetNames[0];
      const ws = nama ? wb.Sheets[nama] : undefined;
      if (!ws) { setGalat("Berkas tidak berisi lembar."); return; }
      const tabel = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
      const { baris, galat: g, tanpaNama } = barisDariTabel(tabel);
      setBerkas({ nama: f.name, baris, tanpaNama, galat: g });
    } catch { setGalat("Berkas tidak dapat dibaca. Pastikan berkas xlsx atau csv yang utuh."); }
    finally { setSibuk(false); }
  };

  const impor = () => {
    if (!rencana || rencana.ringkas.masuk === 0) return;
    // ubah() menerapkan perubahan belakangan (pembaruan state), jadi hasilnya dihitung lebih dulu pada salinan untuk pesan; hasilnya sama karena penerapan deterministik.
    const r = terapkanImpor(JSON.parse(JSON.stringify(isi)) as IsiLanjutan, rencana.hasil);
    ubah((g) => { terapkanImpor(g, rencana.hasil); });
    const s = rencana.ringkas;
    onSelesai(
      `Impor selesai: ${s.masuk} petugas masuk (${r.diisi} mengisi slot kosong, ${r.ditambah} baris baru).`
      + (r.peranDiaktifkan.length > 0 ? ` Peran ${r.peranDiaktifkan.map((k) => NAMA_PERAN[k]).join(", ")} diaktifkan.` : "")
      + (s.takTertaut > 0 ? ` ${s.takTertaut} nama belum tertaut ke akun SIGAP; pilih ulang dari daftar pada tabel.` : "")
      + (s.lewati > 0 ? ` ${s.lewati} baris dilewati.` : "")
      + " Data masih Draf sampai disimpan.",
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0E2A47]/45 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onTutup(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="h-impor-petugas" className="flex max-h-[92vh] w-full max-w-[860px] flex-col gap-3 overflow-y-auto rounded-t-xl border border-[#DCE3EE] bg-white p-4 shadow-xl outline-none sm:rounded-xl">
        <h2 id="h-impor-petugas" className="m-0 text-[16px] font-bold text-[#0F2A52]">Impor daftar petugas dari template</h2>
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13px] leading-snug text-[#44546F]">
          <li>Unduh template. Slot yang masih kosong sudah berisi peran dan status; tinggal isi nama (lembar “Daftar nama” memuat penulisan nama yang benar).</li>
          <li>Unggah berkas yang sudah diisi, lalu periksa pratinjau di bawah. Tidak ada yang berubah sebelum Anda memilih Oke.</li>
        </ol>
        {daftarKosong && <p className="m-0 text-[12.5px] text-[#8A6200]">Daftar pegawai dan mitra belum termuat, jadi nama yang diimpor belum akan tertaut ke akun SIGAP.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={tombolKecil} onClick={unduh}>Unduh template</button>
          <label className={`${tombolKecil} cursor-pointer`}>
            Pilih berkas…
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="Berkas template petugas" onChange={(e) => { void baca(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {berkas && <span className="text-[12.5px] text-[#44546F]">{berkas.nama}</span>}
          {sibuk && <span className="text-[12.5px] text-[#44546F]">Membaca…</span>}
        </div>
        {galat && <p role="alert" className="m-0 text-[12.5px] font-semibold text-[#B42318]">{galat}</p>}
        {berkas?.galat && <p role="alert" className="m-0 text-[12.5px] font-semibold text-[#B42318]">{berkas.galat}</p>}
        {rencana?.galat && <p role="alert" className="m-0 text-[12.5px] font-semibold text-[#B42318]">{rencana.galat}</p>}
        {rencana && !rencana.galat && (
          <>
            <p className="m-0 text-[13px] text-[#1B2B4B]">
              <strong>{rencana.ringkas.masuk} petugas akan masuk</strong> ({rencana.ringkas.isiSlot} mengisi slot kosong, {rencana.ringkas.tambah} baris baru; {rencana.ringkas.tertaut} tertaut ke akun, {rencana.ringkas.takTertaut} belum tertaut)
              {rencana.ringkas.lewati > 0 ? `; ${rencana.ringkas.lewati} baris dilewati` : ""}
              {berkas && berkas.tanpaNama > 0 ? `; ${berkas.tanpaNama} baris tanpa nama diabaikan` : ""}.
            </p>
            <PratinjauImpor hasil={rencana.hasil} />
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={tombolKecil} onClick={onTutup}>Batalkan</button>
          <button type="button" className={tombolUtama} disabled={!rencana || !!rencana.galat || rencana.ringkas.masuk === 0} onClick={impor}>
            {rencana && rencana.ringkas.masuk > 0 ? `Oke, impor ${rencana.ringkas.masuk} petugas` : "Oke, impor"}
          </button>
        </div>
      </div>
    </div>
  );
}

const LABEL: Record<HasilBaris["tindakan"], string> = { isi_slot: "Isi slot kosong", tambah: "Tambah baris", lewati: "Dilewati" };

function PratinjauImpor({ hasil }: { hasil: HasilBaris[] }) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table aria-label="Pratinjau impor petugas" className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] text-[#5B6B84]">
            <th className="py-1 pr-2">Baris</th><th className="py-1 pr-2">Nama</th><th className="py-1 pr-2">Peran</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Sumber mitra</th><th className="py-1 pr-2">Hasil</th>
          </tr>
        </thead>
        <tbody>
          {hasil.map((h) => (
            <tr key={h.baris} className={`border-t border-[#EEF2F7] align-top ${h.tindakan === "lewati" ? "bg-[#FFF5F4]" : ""}`}>
              <td className="py-1.5 pr-2 text-[#5B6B84]">{h.baris}</td>
              <td className="py-1.5 pr-2 font-semibold text-[#1B2B4B]">{h.nama || "—"}</td>
              <td className="py-1.5 pr-2">{h.peran ? NAMA_PERAN[h.peran] : "—"}</td>
              <td className="py-1.5 pr-2">{h.status || "—"}</td>
              <td className="py-1.5 pr-2">{h.status === "Mitra" ? NAMA_SUMBER[h.sumber] ?? h.sumber : "—"}</td>
              <td className="py-1.5 pr-2">
                <span className={h.tindakan === "lewati" ? "font-semibold text-[#B42318]" : "font-semibold text-[#1B7A3E]"}>{LABEL[h.tindakan]}</span>
                {h.tindakan === "lewati" && <span className="block text-[11.5px] text-[#B42318]">{h.alasan}</span>}
                {h.tindakan !== "lewati" && h.tertaut && <span className="block text-[11.5px] text-[#1B7A3E]">✓ Tertaut ke akun SIGAP</span>}
                {h.catatan.map((c) => <span key={c} className="block text-[11.5px] text-[#8A6200]">{c}</span>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
