"use client";

// app/sigap/kelola/master/OrangMaster.tsx
//
// (7 Nov 2026, tahap C4) Master > Mitra dan Pegawai: panel kesehatan master orang, HANYA BACA. Menghitung dan menunjuk kejanggalan (mitra tanpa pool, pool tak sah,
// organik tanpa profil, profil tanpa akun, nama kembar); perbaikan lewat Kelola Peran & Akses yang sudah ada. Tanpa NIK/NIP/HP/rekening. Logika: lib/masterOrang.ts.

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { API_MASTER_ORANG, TAUTAN_PENGGUNA, type DataMasterOrang, type TemuanOrang, type TingkatTemuan } from "@/lib/masterOrang";
import { BTN_O, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const WARNA: Record<TingkatTemuan, "bad" | "wait" | "mut"> = { perlu: "bad", cek: "wait", info: "mut" };
const LABEL: Record<TingkatTemuan, string> = { perlu: "Perlu ditindak", cek: "Perlu dicek", info: "Info" };

function Angka({ label, nilai, ket }: { label: string; nilai: number; ket?: string }) {
  return (
    <div className="rounded-xl border border-[#DDE6F3] bg-[#F9FBFE] px-3 py-2.5">
      <div className="text-[11.5px] font-semibold text-[#5B6B84]">{label}</div>
      <div className="text-[20px] font-extrabold leading-tight text-[#0F2A52]">{fmt(nilai)}</div>
      {ket && <div className="text-[11.5px] text-[#6B7A90]">{ket}</div>}
    </div>
  );
}

export function Temuan({ t }: { t: TemuanOrang }) {
  return (
    <details className="rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2.5 text-[12.5px]" open={t.tingkat === "perlu"}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold text-[#0F2A52]">
        <Chip w={WARNA[t.tingkat]}>{LABEL[t.tingkat]}</Chip>
        <span>{t.judul}</span>
        <Chip w="navy">{fmt(t.jumlah)}</Chip>
      </summary>
      <p className="mt-2 leading-relaxed text-[#5B6B84]">{t.ket}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {t.contoh.map((c, i) => (
          <li key={`${c.id ?? "x"}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-[#0F2A52]">
            <b>{c.nama}</b>
            <span className="text-[11.5px] text-[#6B7A90]">{c.ket}</span>
          </li>
        ))}
      </ul>
      {t.jumlah > t.contoh.length && <div className="mt-1.5 text-[11.5px] text-[#6B7A90]">Menampilkan {t.contoh.length} dari {fmt(t.jumlah)}; selebihnya terlihat di daftar pengguna.</div>}
    </details>
  );
}

export default function OrangMaster() {
  const [data, setData] = useState<DataMasterOrang | null>(null);
  const [galat, setGalat] = useState("");
  const muat = useCallback(async () => {
    try {
      setData(await apiPortal<DataMasterOrang>(API_MASTER_ORANG));
      setGalat("");
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Kesehatan master belum bisa dimuat.");
    }
  }, []);
  useEffect(() => { void muat(); }, [muat]);

  const perlu = data?.temuan.filter((t) => t.tingkat === "perlu").length ?? 0;
  return (
    <div className="flex flex-col gap-3.5">
      {galat && <Pesan>{galat}</Pesan>}
      {!data && !galat && <Memuat />}
      {data && !data.siap && <Pesan jenis="info">Data akun belum bisa dibaca.</Pesan>}
      {data?.siap && (
        <>
          <Kartu
            judul="Ringkasan master orang"
            ket={`Satu identitas = akun SIGAP · master mitra = pool Keputusan Kepala ${data.tahun} · master organik = profil pegawai`}
            kanan={<a href={TAUTAN_PENGGUNA}><span className={BTN_O}>Kelola pengguna</span></a>}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Angka label="Mitra aktif" nilai={data.ringkas.mitra_aktif} />
              <Angka label={`Pool mitra ${data.tahun}`} nilai={data.ringkas.pool_aktif} ket={data.ringkas.pool_nonaktif ? `${fmt(data.ringkas.pool_nonaktif)} nonaktif` : undefined} />
              <Angka label="Organik aktif" nilai={data.ringkas.organik_aktif} ket={data.ringkas.organik_magang ? `${fmt(data.ringkas.organik_magang)} magang` : undefined} />
              <Angka label="Profil pegawai" nilai={data.ringkas.profil_pegawai} />
              <Angka label="Akun nonaktif" nilai={data.ringkas.akun_nonaktif} />
              <Angka label="Belum pernah masuk" nilai={data.ringkas.belum_pernah_masuk} ket="akun aktif" />
            </div>
          </Kartu>

          <Kartu judul="Yang perlu dirapikan" ket={perlu > 0 ? `${perlu} hal perlu ditindak sebelum mitra bisa dipekerjakan dengan benar` : "Tidak ada yang mendesak"}>
            {data.temuan.length === 0 && <p className="text-[12.5px] text-[#6B7A90]">Tidak ada kejanggalan: setiap mitra aktif ada di pool, setiap organik punya profil, dan tidak ada nama kembar.</p>}
            <div className="flex flex-col gap-2">{data.temuan.map((t) => <Temuan key={t.kode} t={t} />)}</div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-[#6B7A90]">Panel ini hanya membaca. Perbaikan dilakukan di Kelola Peran &amp; Akses (tab Mitra Kepka dan Pegawai organik). Nomor identitas, nomor HP, dan rekening tidak ditampilkan di sini.</p>
          </Kartu>
        </>
      )}
    </div>
  );
}
