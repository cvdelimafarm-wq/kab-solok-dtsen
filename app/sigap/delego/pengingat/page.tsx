"use client";

// app/sigap/delego/pengingat/page.tsx
//
// (14 Nov 2026, Fase 4d) Pengingat dan eskalasi: satu halaman aturan. Menampilkan semua jadwal pengingat Delego dan putaran terakhirnya,
// serta setelan eskalasi (batas penjelasan, push kedua, batas jawab, naik ke Kepala, usulan menggantung, saran pembinaan, jam tenang,
// ringkasan pagi) dan setelan mutu saat tinjau (bobot faktor pengakuan dan ambang kewajaran). Hanya Kepala/pemutus yang dapat mengubah.
// Nilai awal adalah USUL dan dapat diubah (keu_dlg_eskalasi_atur, keu_dlg_mutu_atur).

import { useEffect, useState } from "react";
import { jadwalWib, galatSetelanEskalasi, galatSetelanMutu, ARTI_JADWAL, type BahanPengingat } from "@/lib/delego/pengingat";
import { useKirim, usePengingatBahan } from "../data";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Kartu, Lencana, Medan, Memuat } from "../ui";

const waktu = (t: string | null) => (t ? new Date(t).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "belum pernah");

function Angka({ label, bantu, nilai, ubah, min, max, langkah = 1, mati }: { label: string; bantu?: string; nilai: number; ubah: (n: number) => void; min: number; max: number; langkah?: number; mati: boolean }) {
  return (
    <Medan label={label} bantu={bantu}>
      <input type="number" className={KELAS.isian} inputMode="decimal" min={min} max={max} step={langkah} value={Number.isFinite(nilai) ? nilai : ""} disabled={mati} onChange={(e) => ubah(Number(e.target.value))} />
    </Medan>
  );
}

function Sakelar({ label, bantu, nyala, ubah, mati }: { label: string; bantu?: string; nyala: boolean; ubah: (b: boolean) => void; mati: boolean }) {
  return (
    <label className="flex items-start gap-2 text-[13.5px]">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={nyala} disabled={mati} onChange={(e) => ubah(e.target.checked)} />
      <span>
        <b>{label}</b>
        {bantu && <span className="block text-[12.5px] text-[#3B4A57]">{bantu}</span>}
      </span>
    </label>
  );
}

type Esk = NonNullable<BahanPengingat["eskalasi"]>;
type Mutu = NonNullable<BahanPengingat["mutu"]>;

function FormEskalasi({ awal, boleh, kirim }: { awal: Esk; boleh: boolean; kirim: ReturnType<typeof useKirim> }) {
  const [f, setF] = useState(awal);
  useEffect(() => setF(awal), [awal]);
  const g = galatSetelanEskalasi(f);
  const set = <K extends keyof Esk>(k: K) => (v: Esk[K]) => setF({ ...f, [k]: v });
  const mati = !boleh;
  return (
    <Kartu judul="Eskalasi dan jam tenang">
      <div className="space-y-3">
        <Sakelar label="Eskalasi lewat tenggat aktif" bantu="Bila mati, tidak ada permintaan penjelasan, push kedua, atau naik ke Kepala." nyala={f.aktif} ubah={set("aktif")} mati={mati} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Angka label="Penerima menjelaskan dalam (jam)" nilai={f.jam_jelas} ubah={set("jam_jelas")} min={1} max={168} mati={mati} />
          <Angka label="Push kedua setelah (hari kerja)" bantu="0 = tanpa push kedua." nilai={f.hk_push2} ubah={set("hk_push2")} min={0} max={10} mati={mati} />
          <Angka label="Pimpinan menjawab paling lambat (hari kerja)" nilai={f.hk_jawab} ubah={set("hk_jawab")} min={1} max={10} mati={mati} />
          <Angka label="Naik ke Kepala setelah (hari kerja)" nilai={f.hk_kepala} ubah={set("hk_kepala")} min={1} max={15} mati={mati} />
          <Angka label="Usulan pegawai dijawab dalam (hari kerja)" nilai={f.hk_usulan} ubah={set("hk_usulan")} min={1} max={15} mati={mati} />
          <Angka label="Saran pembinaan bila lewat tenggat (kali per 30 hari)" bantu="Hanya saran, bukan otomatis." nilai={f.kali_bina} ubah={set("kali_bina")} min={1} max={20} mati={mati} />
          <Angka label="Jam tenang mulai (WIB)" nilai={f.jam_tenang_mulai} ubah={set("jam_tenang_mulai")} min={0} max={23} mati={mati} />
          <Angka label="Jam tenang selesai (WIB)" bantu="Eskalasi tidak mengirim push di antara dua jam ini." nilai={f.jam_tenang_selesai} ubah={set("jam_tenang_selesai")} min={0} max={23} mati={mati} />
        </div>
        <Sakelar label="Ringkasan pagi 07.15 WIB" bantu="Satu notifikasi per pegawai di hari kerja: pekerjaan hari ini, lewat tenggat, laporan perlu revisi. Bawaan mati." nyala={f.ringkasan_pagi} ubah={set("ringkasan_pagi")} mati={mati} />
        <div className="text-[12px] text-[#3B4A57]">Terakhir diubah {waktu(f.diubah_at)}{f.diubah_nama ? ` oleh ${f.diubah_nama}` : " (nilai awal usulan)"}.</div>
        {boleh && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={KELAS.tombolKecilUtama}
              disabled={kirim.mengirim || !!g}
              onClick={() =>
                void kirim.kirim("keu_dlg_eskalasi_atur", {
                  p_data: { aktif: f.aktif, jam_jelas: f.jam_jelas, hk_push2: f.hk_push2, hk_jawab: f.hk_jawab, hk_kepala: f.hk_kepala, hk_usulan: f.hk_usulan, kali_bina: f.kali_bina, jam_tenang_mulai: f.jam_tenang_mulai, jam_tenang_selesai: f.jam_tenang_selesai, ringkasan_pagi: f.ringkasan_pagi },
                })
              }
            >
              Simpan setelan eskalasi
            </button>
            {g && <span className="text-[12.5px] text-[#8A4605]">{g}</span>}
          </div>
        )}
      </div>
    </Kartu>
  );
}

function FormMutu({ awal, boleh, kirim }: { awal: Mutu; boleh: boolean; kirim: ReturnType<typeof useKirim> }) {
  const n = (x: number | string) => Number(x);
  const [f, setF] = useState({ w_kualitas: n(awal.w_kualitas), w_disiplin: n(awal.w_disiplin), w_tepat: n(awal.w_tepat), tepat_terlambat: n(awal.tepat_terlambat), ambang_jumlah_kali: n(awal.ambang_jumlah_kali), ambang_poin_laporan: n(awal.ambang_poin_laporan), ambang_kecepatan_kali: n(awal.ambang_kecepatan_kali) });
  useEffect(() => setF({ w_kualitas: n(awal.w_kualitas), w_disiplin: n(awal.w_disiplin), w_tepat: n(awal.w_tepat), tepat_terlambat: n(awal.tepat_terlambat), ambang_jumlah_kali: n(awal.ambang_jumlah_kali), ambang_poin_laporan: n(awal.ambang_poin_laporan), ambang_kecepatan_kali: n(awal.ambang_kecepatan_kali) }), [awal]);
  const g = galatSetelanMutu(f);
  const set = (k: keyof typeof f) => (v: number) => setF({ ...f, [k]: v });
  const mati = !boleh;
  return (
    <Kartu judul="Mutu saat tinjau">
      <div className="space-y-3">
        <div className="text-[13px] text-[#3B4A57]">Poin diakui = poin laporan × faktor pengakuan. Faktor = bobot kualitas × nilai/5 + bobot kedisiplinan × nilai/5 + bobot ketepatan waktu × ketepatan.</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Angka label="Bobot kualitas (%)" nilai={f.w_kualitas} ubah={set("w_kualitas")} min={0} max={100} mati={mati} />
          <Angka label="Bobot kedisiplinan (%)" nilai={f.w_disiplin} ubah={set("w_disiplin")} min={0} max={100} mati={mati} />
          <Angka label="Bobot ketepatan waktu (%)" nilai={f.w_tepat} ubah={set("w_tepat")} min={0} max={100} mati={mati} />
          <Angka label="Ketepatan bila laporan terlambat (0 sampai 1)" nilai={f.tepat_terlambat} ubah={set("tepat_terlambat")} min={0} max={1} langkah={0.05} mati={mati} />
          <Angka label="Tanda: jumlah lebih dari (× target harian)" nilai={f.ambang_jumlah_kali} ubah={set("ambang_jumlah_kali")} min={0.1} max={100} langkah={0.1} mati={mati} />
          <Angka label="Tanda: poin satu laporan lebih dari" nilai={f.ambang_poin_laporan} ubah={set("ambang_poin_laporan")} min={1} max={10000} mati={mati} />
          <Angka label="Tanda: laju lebih dari (× laju wajar)" bantu="Laju wajar 100 poin per 450 menit." nilai={f.ambang_kecepatan_kali} ubah={set("ambang_kecepatan_kali")} min={0.1} max={100} langkah={0.1} mati={mati} />
        </div>
        <div className="text-[12px] text-[#3B4A57]">Terakhir diubah {waktu(awal.diubah_at)}{awal.diubah_nama ? ` oleh ${awal.diubah_nama}` : " (nilai awal usulan 50/25/25)"}.</div>
        {boleh && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim || !!g} onClick={() => void kirim.kirim("keu_dlg_mutu_atur", { p_data: f })}>
              Simpan setelan mutu
            </button>
            {g && <span className="text-[12.5px] text-[#8A4605]">{g}</span>}
          </div>
        )}
      </div>
    </Kartu>
  );
}

export default function PengingatEskalasi() {
  const b = usePengingatBahan();
  const kirim = useKirim(b.muat);
  const d = b.data;
  return (
    <Halaman judul="Pengingat dan eskalasi" sub="Semua aturan pengingat Delego di satu tempat. Saluran: push dan lonceng.">
      {b.memuat && !d && <Memuat />}
      {b.galat && !d && <Galat>{b.galat}</Galat>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      {d && (
        <>
          {!d.boleh_ubah && <Info>Hanya Kepala yang dapat mengubah setelan. Anda dapat melihat aturan yang berlaku.</Info>}
          {d.boleh_ubah && <Info>Nilai awal adalah usulan yang belum diputuskan. Ubah bila perlu; perubahan berlaku pada putaran berikutnya.</Info>}
          <Kartu judul={`Jadwal pengingat (${d.jadwal.length})`}>
            <ul className="m-0 list-none divide-y divide-[#EEF2F5] p-0">
              {d.jadwal.map((j) => {
                const a = ARTI_JADWAL[j.nama];
                // jadwal tetap berjalan, tetapi fungsi tidak mengirim apa pun bila setelannya mati
                const matiSetelan = (j.nama === "delego-ringkasan-0715" && !d.eskalasi?.ringkasan_pagi) || (["delego-eskalasi-15m", "delego-usulan-0900"].includes(j.nama) && d.eskalasi?.aktif === false);
                return (
                  <li key={j.nama} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold">{a?.judul ?? j.nama}</div>
                      <div className="text-[12.5px] text-[#3B4A57]">{a?.arti ?? ""}</div>
                      <div className="text-[12.5px] text-[#3B4A57]">{jadwalWib(j.jadwal)} · terakhir jalan {waktu(j.terakhir)}</div>
                    </div>
                    <Lencana nada={!j.aktif || matiSetelan ? "abu" : j.gagal_terakhir ? "merah" : "hijau"}>{!j.aktif ? "Mati" : matiSetelan ? "Mati di setelan" : j.gagal_terakhir ? "Gagal terakhir" : "Aktif"}</Lencana>
                  </li>
                );
              })}
            </ul>
          </Kartu>
          {d.eskalasi && <FormEskalasi awal={d.eskalasi} boleh={d.boleh_ubah} kirim={kirim} />}
          {d.mutu && <FormMutu awal={d.mutu} boleh={d.boleh_ubah} kirim={kirim} />}
        </>
      )}
    </Halaman>
  );
}
