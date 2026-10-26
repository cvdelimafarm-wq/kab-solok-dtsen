"use client";

// app/sigap/delego/KerjaTeknis.tsx
//
// (26 Okt 2026, tahap 39) Bagian layar untuk pekerjaan teknis: penanda jenis/tenggat jam/hasil, daftar langkah (checklist), serta hasil kerja
// (serah oleh penerima, tinjau oleh pemberi). Dipakai di Delegasi saya (penerima) dan Rincian delegasi (pemberi). Hak ditegakkan basis data
// (keu_dlg_langkah_atur, keu_dlg_langkah_centang, keu_dlg_hasil_serah, keu_dlg_hasil_tinjau); tombol di sini hanya menyembunyikan yang pasti ditolak.

import { useState } from "react";
import { hariWib, tglPendek } from "@/lib/delego/hitung";
import { untukSimpan, muatDiBatas } from "@/lib/delego/bukti";
import { bolehSerahHasil, kemajuanLangkah, keadaanHasil, statusTenggatJam, type KeadaanHasil } from "@/lib/delego/teknis";
import type { Delegasi, HasilKerja, Langkah, StatusHasil } from "@/lib/delego/tipe";
import { DaftarButir, PenyuntingBukti, type ButirForm } from "./BuktiFoto";
import { useKirim } from "./data";
import { KELAS, type Nada } from "./merek";
import { Batang, Galat, Info, Kartu, Lencana, Medan, Peringatan } from "./ui";

const tglIso = (iso: string) => tglPendek(hariWib(new Date(iso)));

const NAMA_KEADAAN: Record<KeadaanHasil, { teks: string; nada: Nada }> = {
  tidak_perlu: { teks: "", nada: "abu" },
  belum: { teks: "Hasil belum diserahkan", nada: "abu" },
  menunggu_tinjau: { teks: "Hasil menunggu tinjau", nada: "biru" },
  perlu_revisi: { teks: "Perlu revisi", nada: "merah" },
  diterima: { teks: "Hasil diterima", nada: "hijau" },
  diserahkan: { teks: "Hasil diserahkan", nada: "hijau" },
};
const NAMA_STATUS_HASIL: Record<StatusHasil, { teks: string; nada: Nada }> = {
  diserahkan: { teks: "Menunggu tinjau", nada: "biru" },
  diterima: { teks: "Diterima", nada: "hijau" },
  revisi: { teks: "Perlu revisi", nada: "merah" },
};

/** Deretan penanda ringkas: jenis, mendadak, tenggat jam, keadaan hasil, kemajuan langkah. Tidak menampilkan apa pun untuk delegasi biasa. */
export function Penanda({ d, hasil, langkah, sekarang }: { d: Delegasi; hasil?: HasilKerja[]; langkah?: Langkah[]; sekarang?: Date }) {
  const h = (hasil ?? []).filter((x) => x.delegasi_id === d.id).sort((a, z) => a.nomor - z.nomor);
  const l = (langkah ?? []).filter((x) => x.delegasi_id === d.id);
  const keadaan = keadaanHasil({ perlu_hasil: !!d.perlu_hasil, perlu_tinjau: !!d.perlu_tinjau }, h);
  const sudahTuntas = d.status === "selesai" || d.status === "batal" || keadaan === "diterima";
  const diserahkan = keadaan === "diserahkan" || keadaan === "menunggu_tinjau";
  const tj = statusTenggatJam(d, sekarang ?? new Date(), sudahTuntas ? true : diserahkan ? "hasil sudah diserahkan" : false);
  const km = kemajuanLangkah(l);
  const ada = d.jenis_nama || d.insidental || tj.tipe !== "tanpa" || keadaan !== "tidak_perlu" || km.total > 0;
  if (!ada) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {d.jenis_nama && <Lencana nada="abu">{d.jenis_nama}</Lencana>}
      {d.insidental && <Lencana nada="amber">Mendadak</Lencana>}
      {tj.tipe === "menjelang" && <Lencana nada="amber">{tj.teks}</Lencana>}
      {tj.tipe === "lewat" && <Lencana nada="merah">{tj.teks}</Lencana>}
      {(tj.tipe === "jauh" || tj.tipe === "tuntas") && <Lencana nada="abu">{tj.teks}</Lencana>}
      {keadaan !== "tidak_perlu" && <Lencana nada={NAMA_KEADAAN[keadaan].nada}>{NAMA_KEADAAN[keadaan].teks}</Lencana>}
      {km.total > 0 && <Lencana nada={km.selesai === km.total ? "hijau" : "abu"}>Langkah {km.selesai}/{km.total}</Lencana>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Langkah (checklist)
// ---------------------------------------------------------------------------------------------------------------------
type BarisLangkah = { id: number | null; judul: string };

export function PanelLangkah({ d, langkah, bolehAtur, bolehCentang, muat }: { d: Delegasi; langkah: Langkah[]; bolehAtur: boolean; bolehCentang: boolean; muat: () => Promise<void> }) {
  const daftar = langkah.filter((l) => l.delegasi_id === d.id).sort((a, z) => a.urut - z.urut || a.id - z.id);
  const km = kemajuanLangkah(daftar);
  const kirim = useKirim(muat);
  const [ubah, setUbah] = useState(false);
  const [baris, setBaris] = useState<BarisLangkah[]>([]);
  const aktifDelegasi = d.status === "baru" || d.status === "berjalan";
  const bolehUbahDaftar = bolehAtur && (aktifDelegasi || d.status === "ditunda");

  if (daftar.length === 0 && !bolehUbahDaftar) return null;

  const mulaiUbah = () => {
    setBaris(daftar.map((l) => ({ id: l.id, judul: l.judul })));
    setUbah(true);
  };
  const simpan = async () => {
    const bersih = baris.map((b) => ({ ...b, judul: b.judul.trim() })).filter((b) => b.judul !== "");
    const ok = await kirim.kirim("keu_dlg_langkah_atur", { p_delegasi: d.id, p_langkah: bersih.map((b) => (b.id ? { id: b.id, judul: b.judul } : b.judul)) });
    if (ok) setUbah(false);
  };
  const geser = (i: number, arah: -1 | 1) =>
    setBaris((x) => {
      const j = i + arah;
      if (j < 0 || j >= x.length) return x;
      const y = [...x];
      [y[i], y[j]] = [y[j], y[i]];
      return y;
    });
  const salahBaris = baris.some((b) => b.judul.trim() !== "" && (b.judul.trim().length < 2 || b.judul.trim().length > 150));

  return (
    <Kartu
      judul={`Langkah pengerjaan${km.total ? ` (${km.selesai}/${km.total})` : ""}`}
      kanan={bolehUbahDaftar && !ubah ? <button type="button" className={KELAS.tombolKecil} onClick={mulaiUbah}>{daftar.length ? "Atur langkah" : "Tambah langkah"}</button> : undefined}
    >
      {!ubah && km.total > 0 && <div className="mb-2"><Batang persen={km.persen} tinggi={6} /></div>}
      {!ubah && daftar.length === 0 && <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada langkah.</p>}
      {!ubah && daftar.length > 0 && (
        <ul className="m-0 list-none space-y-1 p-0">
          {daftar.map((l) => (
            <li key={l.id}>
              <label className={`flex min-h-[40px] items-start gap-2.5 rounded-lg px-1 py-1.5 text-[14px] ${bolehCentang && aktifDelegasi ? "cursor-pointer hover:bg-[#F1F7F6]" : ""}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[#0F6B63]"
                  checked={l.selesai}
                  disabled={!bolehCentang || !aktifDelegasi || kirim.mengirim}
                  onChange={(e) => void kirim.kirim("keu_dlg_langkah_centang", { p_langkah: l.id, p_selesai: e.target.checked })}
                />
                <span className={l.selesai ? "text-[#6B7783] line-through" : ""}>{l.judul}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {ubah && (
        <div className="space-y-2">
          <ul className="m-0 list-none space-y-2 p-0">
            {baris.map((b, i) => (
              <li key={b.id ?? `n${i}`} className="flex items-center gap-1.5">
                <input aria-label={`Langkah ${i + 1}`} className={KELAS.isian} maxLength={150} value={b.judul} onChange={(e) => setBaris((x) => x.map((y, j) => (j === i ? { ...y, judul: e.target.value } : y)))} />
                <button type="button" className={KELAS.tombolKecil} aria-label={`Naikkan langkah ${i + 1}`} disabled={i === 0} onClick={() => geser(i, -1)}>↑</button>
                <button type="button" className={KELAS.tombolKecil} aria-label={`Turunkan langkah ${i + 1}`} disabled={i === baris.length - 1} onClick={() => geser(i, 1)}>↓</button>
                <button type="button" className={KELAS.tombolKecil} aria-label={`Hapus langkah ${i + 1}`} onClick={() => setBaris((x) => x.filter((_, j) => j !== i))}>Hapus</button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={KELAS.tombolKecil} disabled={baris.length >= 20} onClick={() => setBaris((x) => [...x, { id: null, judul: "" }])}>+ Langkah</button>
          </div>
          {salahBaris && <Peringatan>Tiap langkah 2 sampai 150 huruf.</Peringatan>}
          {kirim.galat && <Galat>{kirim.galat}</Galat>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || salahBaris} onClick={() => void simpan()}>{kirim.mengirim ? "Menyimpan..." : "Simpan langkah"}</button>
            <button type="button" className={KELAS.tombolSekunder} disabled={kirim.mengirim} onClick={() => setUbah(false)}>Batal</button>
          </div>
          <p className="m-0 text-[12px] text-[#3B4A57]">Langkah yang dihapus disembunyikan, tidak dihapus permanen. Centang yang sudah ada tetap tersimpan.</p>
        </div>
      )}
      {!ubah && kirim.galat && <div className="mt-2"><Galat>{kirim.galat}</Galat></div>}
    </Kartu>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Hasil kerja
// ---------------------------------------------------------------------------------------------------------------------
export function PanelHasil({ d, hasil, sebagai, muat, bolehTinjau = true }: { d: Delegasi; hasil: HasilKerja[]; sebagai: "penerima" | "pemberi"; muat: () => Promise<void>; bolehTinjau?: boolean }) {
  const daftar = hasil.filter((h) => h.delegasi_id === d.id).sort((a, z) => a.nomor - z.nomor);
  const kirim = useKirim(muat);
  const [butir, setButir] = useState<ButirForm[]>([]);
  const [catatan, setCatatan] = useState("");
  const [tinjauCatatan, setTinjauCatatan] = useState("");

  if (!d.perlu_hasil) return null;
  const tampil = [...daftar].reverse();
  const menunggu = daftar.find((h) => h.status === "diserahkan") ?? null;
  const boleh = sebagai === "penerima" && bolehSerahHasil({ perlu_hasil: !!d.perlu_hasil, status: d.status }, daftar);
  const simpanBukti = untukSimpan(butir);
  const sahSerah = simpanBukti.length > 0 && muatDiBatas(simpanBukti) && catatan.length <= 500;
  const terakhir = daftar[daftar.length - 1];

  const serah = async () => {
    const ok = await kirim.kirim("keu_dlg_hasil_serah", { p_delegasi: d.id, p_butir: simpanBukti, p_catatan: catatan.trim() });
    if (ok) {
      setButir([]);
      setCatatan("");
    }
  };
  const tinjau = async (putusan: "diterima" | "revisi") => {
    if (!menunggu) return;
    const ok = await kirim.kirim("keu_dlg_hasil_tinjau", { p_hasil: menunggu.id, p_putusan: putusan, p_catatan: tinjauCatatan.trim() });
    if (ok) setTinjauCatatan("");
  };

  return (
    <Kartu judul={`Hasil kerja${daftar.length ? ` (${daftar.length} versi)` : ""}`}>
      <div className="space-y-3">
        {sebagai === "penerima" && terakhir?.status === "revisi" && boleh && (
          <Peringatan>
            <b>Pemberi meminta revisi.</b> {terakhir.catatan_tinjau || "Perbaiki hasil lalu serahkan lagi."}
          </Peringatan>
        )}
        {daftar.length === 0 && <p className="m-0 text-[13.5px] text-[#3B4A57]">{sebagai === "penerima" ? "Belum ada hasil yang Anda serahkan." : "Penerima belum menyerahkan hasil."}</p>}
        {tampil.map((h) => (
          <div key={h.id} className="rounded-lg border border-[#E3E8EE] bg-[#F9FBFB] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">Versi {h.nomor} · {tglIso(h.diserahkan_at)}</span>
              <Lencana nada={NAMA_STATUS_HASIL[h.status].nada}>{NAMA_STATUS_HASIL[h.status].teks}</Lencana>
            </div>
            {h.catatan && <p className="m-0 mt-1.5 whitespace-pre-line text-[13.5px] leading-snug">{h.catatan}</p>}
            <div className="mt-2"><DaftarButir butir={h.butir} ukuran={72} /></div>
            {h.status !== "diserahkan" && h.catatan_tinjau && (
              <p className={`m-0 mt-2 rounded-md px-2.5 py-1.5 text-[13px] leading-snug ${h.status === "revisi" ? "bg-[#FBE9E9] text-[#9B2C2C]" : "bg-[#F1F7F6] text-[#0B524C]"}`}>
                {h.ditinjau_nama ?? "Pemberi"}{h.ditinjau_at ? ` · ${tglIso(h.ditinjau_at)}` : ""}: {h.catatan_tinjau}
              </p>
            )}
          </div>
        ))}

        {sebagai === "pemberi" && bolehTinjau && menunggu && d.perlu_tinjau && (
          <div className="space-y-2 rounded-lg border-2 border-[#0F6B63] bg-white p-3">
            <div className="text-[14px] font-bold">Tinjau versi {menunggu.nomor}</div>
            <Medan label="Catatan" bantu="Wajib (minimal 5 huruf) bila meminta revisi; boleh kosong bila diterima.">
              <textarea className={KELAS.isian} rows={2} maxLength={500} value={tinjauCatatan} onChange={(e) => setTinjauCatatan(e.target.value)} placeholder="Mis. lengkapi lampiran kedua" />
            </Medan>
            {kirim.galat && <Galat>{kirim.galat}</Galat>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim} onClick={() => void tinjau("diterima")}>Terima hasil</button>
              <button type="button" className={KELAS.tombolSekunder} disabled={kirim.mengirim || tinjauCatatan.trim().length < 5} onClick={() => void tinjau("revisi")}>Minta revisi</button>
            </div>
            <p className="m-0 text-[12px] text-[#3B4A57]">Hasil diterima = delegasi otomatis selesai. Penerima mendapat notifikasi.</p>
          </div>
        )}
        {sebagai === "pemberi" && bolehTinjau && menunggu && !d.perlu_tinjau && <Info>Delegasi ini tidak memakai tinjau; hasil yang diserahkan langsung dihitung.</Info>}

        {boleh && (
          <div className="space-y-3 border-t border-[#E3E8EE] pt-3">
            <div className="text-[14px] font-bold">{daftar.length === 0 ? "Serahkan hasil kerja" : "Serahkan versi baru"}</div>
            <PenyuntingBukti
              delegasi={d.id}
              butir={butir}
              onUbah={setButir}
              mati={kirim.mengirim}
              wajib
              judul="Hasil (wajib, maksimal 5: tautan berkas, teks, atau foto)"
              teksBantu="Tempel tautan berkas (mis. Drive), tulis nama berkas, atau ambil foto. Foto dikecilkan otomatis dan baru tersimpan setelah Anda menekan Serahkan hasil."
            />
            <Medan label="Catatan untuk pemberi (opsional)">
              <textarea className={KELAS.isian} rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
            </Medan>
            {d.insidental && !d.perlu_tinjau && <Info>Pekerjaan mendadak: menyerahkan hasil sekaligus mencatat laporan hari ini dan menyelesaikan pekerjaan.</Info>}
            {d.perlu_tinjau && <Info>Hasil akan ditinjau pemberi. Bila diterima, delegasi selesai; bila perlu revisi, Anda mendapat catatannya.</Info>}
            {kirim.galat && <Galat>{kirim.galat}</Galat>}
            <button type="button" className={`${KELAS.tombolUtama} w-full`} disabled={kirim.mengirim || !sahSerah} onClick={() => void serah()}>
              {kirim.mengirim ? "Mengirim..." : "Serahkan hasil"}
            </button>
          </div>
        )}
        {sebagai === "penerima" && !boleh && menunggu && <Info>Hasil versi {menunggu.nomor} menunggu tinjau pemberi. Anda mendapat notifikasi setelah ditinjau.</Info>}
        {sebagai === "penerima" && !menunggu && kirim.galat && <Galat>{kirim.galat}</Galat>}
      </div>
    </Kartu>
  );
}
