"use client";

// app/sigap/admin/PanelSiaranPerbaikan.tsx
//
// (15 Okt 2026) Panel admin "Minta seluruh petugas memperbaiki administrasi" -- permintaan user (pagi ini langsung lewat modal + push).
// Dua langkah: (1) "Periksa dulu" = uji kering, hanya menampilkan siapa dan tanggal apa (tidak menulis, tidak mengirim);
// (2) "Kirim ke petugas" = memberi jendela perbaikan 24 jam + push, setelah konfirmasi. API: /api/sigap/admin/perbaikan-siaran.

import { useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, tglPanjang, tglPendek } from "./api";
import { BTN, BTN_O, Chip, Kartu, Pesan, TabelKartu, TD, TH } from "./ui";

type Baris = { penugasan_id: number; akun_id: number; nama: string; peran: string; tanggal: string[]; sudah_diberi: string[]; perangkat: boolean; sudah_push: boolean };
type Ringkas = { petugas_aktif: number; perlu: number; hari_total: number; tanpa_perangkat: number; sudah_diberi_sebelumnya: number };
type Hasil = { izin_ditulis: number; akun_push_ok: number; akun_push_gagal: number; perangkat_terkirim: number };
type Jawab = { ok: boolean; mode: "uji" | "kirim"; hari_ini: string; batas: string; push_siap: boolean; ringkas: Ringkas; rows: Baris[]; hasil: Hasil | null; terpotong?: boolean; gagal_hitung?: number };

export default function PanelSiaranPerbaikan({ kegiatanId }: { kegiatanId: number }) {
  const [jawab, setJawab] = useState<Jawab | null>(null);
  const [sibuk, setSibuk] = useState<"uji" | "kirim" | null>(null);
  const [konfirm, setKonfirm] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "galat" | "ok" | "info" | "peringatan"; teks: string } | null>(null);

  async function jalan(mode: "uji" | "kirim") {
    setSibuk(mode);
    setPesan(null);
    try {
      const j = await fetchJson<Jawab>("/api/sigap/admin/perbaikan-siaran", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kegiatan_id: kegiatanId, mode }) });
      setJawab(j);
      if (mode === "kirim" && j.hasil) {
        setPesan({
          jenis: j.terpotong || j.gagal_hitung ? "peringatan" : "ok",
          teks: `Terkirim: ${j.hasil.izin_ditulis} hari diberi kesempatan 24 jam, notifikasi ke ${j.hasil.akun_push_ok} petugas (${j.hasil.perangkat_terkirim} perangkat)${j.hasil.akun_push_gagal ? `, ${j.hasil.akun_push_gagal} petugas gagal dikirimi notifikasi` : ""}.${j.terpotong ? " Waktu habis sebelum semua petugas diproses: tekan kirim sekali lagi (aman, tidak ada yang ganda)." : ""}${j.gagal_hitung ? ` ${j.gagal_hitung} petugas gagal dihitung; ulangi.` : ""}`,
        });
      } else if (!j.rows.length) {
        setPesan({ jenis: "ok", teks: `Tidak ada yang perlu diperbaiki sampai ${tglPanjang(j.batas)}.` });
      }
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(null);
      setKonfirm(false);
    }
  }

  const baru = jawab?.rows.filter((r) => r.tanggal.length > 0) ?? [];
  const sudahUji = !!jawab && jawab.mode === "uji";

  return (
    <Kartu judul="Minta seluruh petugas memperbaiki administrasi" ket="Satu kali per tanggal, berlaku 24 jam. Tidak ada data yang dihapus.">
      <p className="mb-3 text-[12.5px] leading-relaxed text-[#5B6B84]">
        Hari kerja yang sudah lewat dan belum lengkap (laporan/foto) diberi kesempatan memperbaiki 24 jam. Petugas menerima notifikasi dan jendela pengingat di aplikasi. Tanggal yang pernah diberi izin susulan tidak diberi lagi.
        Mulailah dengan <b>Periksa dulu</b> untuk melihat siapa saja yang akan menerima.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_O} disabled={!!sibuk} onClick={() => jalan("uji")}>
          {sibuk === "uji" ? "Memeriksa…" : "Periksa dulu"}
        </button>
        {sudahUji && baru.length > 0 && !konfirm && (
          <button type="button" className={BTN} disabled={!!sibuk || !jawab?.push_siap} onClick={() => setKonfirm(true)} title={jawab?.push_siap ? undefined : "Kunci VAPID belum dipasang di server"}>
            Kirim ke {jawab?.ringkas.perlu} petugas…
          </button>
        )}
      </div>

      {konfirm && jawab && (
        <div className="mt-3 rounded-lg border border-[#F0C4BF] bg-[#FFF8F7] p-3 text-[13px] text-[#1B2B4B]">
          <p className="font-semibold">Kirim sekarang?</p>
          <p className="mt-1 text-[12.5px]">
            {jawab.ringkas.hari_total} hari kerja milik {jawab.ringkas.perlu} petugas (sampai {tglPanjang(jawab.batas)}) diberi kesempatan memperbaiki selama 24 jam, lalu notifikasi dikirim. Kesempatan ini tidak bisa ditarik kembali dan tidak diberikan lagi untuk tanggal yang sama.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={BTN} disabled={!!sibuk} onClick={() => jalan("kirim")}>
              {sibuk === "kirim" ? "Mengirim…" : "Ya, kirim"}
            </button>
            <button type="button" className={BTN_O} disabled={!!sibuk} onClick={() => setKonfirm(false)}>
              Batal
            </button>
          </div>
        </div>
      )}

      {pesan && (
        <div className="mt-3">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>
            {pesan.teks}
          </Pesan>
        </div>
      )}

      {jawab && jawab.rows.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-[#5B6B84]">
            <Chip w="navy">{jawab.ringkas.perlu} petugas perlu</Chip>
            <Chip w="wait">{jawab.ringkas.hari_total} hari</Chip>
            {jawab.ringkas.tanpa_perangkat > 0 && <Chip w="mut" title="Belum mengaktifkan notifikasi; tetap melihat jendela pengingat saat membuka aplikasi">{jawab.ringkas.tanpa_perangkat} tanpa notifikasi</Chip>}
            {jawab.ringkas.sudah_diberi_sebelumnya > 0 && <Chip w="ok">{jawab.ringkas.sudah_diberi_sebelumnya} sudah diberi sebelumnya</Chip>}
            <span>· dinilai sampai {tglPanjang(jawab.batas)}</span>
          </div>
          <TabelKartu>
            <thead>
              <tr>
                <th className={TH}>Petugas</th>
                <th className={TH}>Peran</th>
                <th className={TH}>Tanggal diberi kesempatan</th>
                <th className={TH}>Notifikasi</th>
              </tr>
            </thead>
            <tbody>
              {jawab.rows.map((r) => (
                <tr key={r.penugasan_id}>
                  <td className={`${TD} font-semibold`}>{r.nama}</td>
                  <td className={TD}>{r.peran.toUpperCase()}</td>
                  <td className={TD}>
                    {r.tanggal.length > 0 ? r.tanggal.map((t) => tglPendek(t)).join(", ") : <span className="text-[#7B8794]">—</span>}
                    {r.sudah_diberi.length > 0 && <span className="ml-1 text-[12px] text-[#13794B]">(sudah diberi: {r.sudah_diberi.map((t) => tglPendek(t)).join(", ")})</span>}
                  </td>
                  <td className={TD}>{r.sudah_push ? <Chip w="ok">sudah dikirim</Chip> : r.perangkat ? <Chip w="navy">akan dikirim</Chip> : <Chip w="mut">tanpa perangkat</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </TabelKartu>
        </div>
      )}
    </Kartu>
  );
}
