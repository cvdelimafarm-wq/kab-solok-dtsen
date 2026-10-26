"use client";

// app/sigap/delego/libur/page.tsx
//
// (26 Okt 2026) Kalender libur Delego. Tanggal libur aktif tidak dihitung hari kerja: tidak ada target, hutang, beban, kewajiban lapor, maupun pengingat 18:00.
// Isian bawaan 2026 dan 2027 dari SKB 3 Menteri (cek aturan; bila ada perubahan atau libur daerah, tambah atau nonaktifkan di sini).
// Cuti bersama aktif secara bawaan karena ASN libur; nonaktifkan per tanggal bila tim tetap bekerja. Tidak ada penghapusan: libur dinonaktifkan.
// Hanya pemberi tingkat tim (hak.semua) yang dapat mengubah; yang lain melihat saja.

import { useMemo, useState } from "react";
import { tglPendek } from "@/lib/delego/hitung";
import type { LiburDelegasi } from "@/lib/delego/tipe";
import { useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan } from "../ui";

const NAMA_JENIS: Record<LiburDelegasi["jenis"], string> = { nasional: "Libur nasional", cuti_bersama: "Cuti bersama", lainnya: "Lainnya" };

export default function KalenderLibur() {
  const { hak, hari, muatHak } = useKonteksDelego();
  const kirim = useKirim(muatHak);
  const bisaUbah = hak.semua;
  const semua = hak.libur ?? [];
  const tahunAda = useMemo(() => [...new Set(semua.map((l) => l.tanggal.slice(0, 4)))].sort(), [semua]);
  const [tahun, setTahun] = useState(() => (tahunAda.includes(hari.slice(0, 4)) ? hari.slice(0, 4) : (tahunAda[0] ?? hari.slice(0, 4))));
  const [tgl, setTgl] = useState("");
  const [nama, setNama] = useState("");

  const daftar = semua.filter((l) => l.tanggal.startsWith(tahun));
  const aktifN = daftar.filter((l) => l.aktif).length;

  const ubah = (l: LiburDelegasi, aktif: boolean) => kirim.kirim("keu_dlg_libur_atur", { p_tanggal: l.tanggal, p_nama: l.nama, p_jenis: l.jenis, p_aktif: aktif });
  const tambah = async () => {
    const ok = await kirim.kirim("keu_dlg_libur_atur", { p_tanggal: tgl, p_nama: nama.trim(), p_jenis: "lainnya", p_aktif: true });
    if (ok) {
      setTgl("");
      setNama("");
      if (tgl.slice(0, 4) !== tahun) setTahun(tgl.slice(0, 4));
    }
  };

  return (
    <Halaman
      judul="Kalender libur"
      sub="Tanggal libur tidak dihitung hari kerja: tanpa target, hutang, beban, kewajiban lapor, dan pengingat."
      kanan={
        <select className={`${KELAS.isian} !w-auto`} value={tahun} onChange={(e) => setTahun(e.target.value)} aria-label="Tahun">
          {(tahunAda.length ? tahunAda : [tahun]).map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      }
    >
      <Info>
        Isian bawaan mengikuti SKB 3 Menteri tentang hari libur nasional dan cuti bersama (cek aturan). Cuti bersama ikut dihitung libur; nonaktifkan bila tim tetap bekerja.
        {!bisaUbah && " Anda dapat melihat daftar ini; perubahan dilakukan Ketua Tim."}
      </Info>

      {bisaUbah && (
        <Kartu judul="Tambah tanggal libur (mis. libur daerah)">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
            <Medan label="Tanggal"><input type="date" className={KELAS.isian} value={tgl} onChange={(e) => setTgl(e.target.value)} /></Medan>
            <Medan label="Nama libur"><input className={KELAS.isian} maxLength={100} value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Libur pilkada" /></Medan>
            <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || !tgl || nama.trim().length < 3} onClick={() => void tambah()}>Tambahkan</button>
          </div>
        </Kartu>
      )}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}

      <Kartu judul={`Libur ${tahun}`} kanan={<span className="text-[12.5px] font-semibold text-[#3B4A57]">{aktifN} aktif dari {daftar.length}</span>}>
        {daftar.length === 0 ? (
          <Kosong>Belum ada tanggal libur untuk {tahun}.</Kosong>
        ) : (
          <ul className="m-0 list-none divide-y divide-[#E1E6EA] p-0">
            {daftar.map((l) => (
              <li key={l.tanggal} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className={`text-[14px] font-semibold ${l.aktif ? "" : "text-[#6B7783] line-through"}`}>{tglPendek(l.tanggal)} · {l.nama}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[#3B4A57]">
                    <Lencana nada={l.jenis === "cuti_bersama" ? "amber" : l.jenis === "nasional" ? "hijau" : "biru"}>{NAMA_JENIS[l.jenis]}</Lencana>
                    {l.tanggal < hari && <span>sudah lewat</span>}
                  </div>
                </div>
                {bisaUbah ? (
                  <label className="inline-flex min-h-[40px] items-center gap-2 text-[13.5px]">
                    <input type="checkbox" checked={l.aktif} disabled={kirim.mengirim} onChange={(e) => void ubah(l, e.target.checked)} />
                    {l.aktif ? "Libur" : "Bukan libur"}
                  </label>
                ) : (
                  <Lencana nada={l.aktif ? "hijau" : "abu"}>{l.aktif ? "Libur" : "Bukan libur"}</Lencana>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kartu>
      <p className="m-0 text-[12.5px] text-[#3B4A57]">Perubahan tidak mengubah laporan yang sudah dikirim. Hutang dan skor dihitung ulang memakai kalender saat ini.</p>
    </Halaman>
  );
}
