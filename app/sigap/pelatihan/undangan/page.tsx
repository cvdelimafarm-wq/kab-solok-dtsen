"use client";

// app/sigap/pelatihan/undangan/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- tab "Undangan": undangan pribadi (nama, peran, kelas, jadwal, tempat,
// pakaian, ketentuan transpor lokal 5 foto) + unduh PDF. Pilihan user: "Halaman undangan pribadi + unduh PDF".

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bukaBlob, fetchJson, pesanGalat } from "../../admin/api";
import { BTN, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Kerangka, peranLabel, useHub } from "../komponen";

function Baris({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-[#EDF0F4] py-2 text-[13.5px] last:border-0">
      <dt className="w-24 shrink-0 text-[#7B8794]">{k}</dt>
      <dd className="min-w-0 flex-1 font-semibold">{v}</dd>
    </div>
  );
}

export default function HalamanUndangan() {
  const { data, galat } = useHub();
  const [unduh, setUnduh] = useState(false);
  const [galatPdf, setGalatPdf] = useState<string | null>(null);
  const u = data?.undangan;

  // (7 Okt 2026) Langkah Pelatihan: halaman Undangan dibuka -> langkah 1 tercatat selesai (sekali per muat).
  const sudahCatat = useRef(false);
  useEffect(() => {
    if (!data?.peserta || sudahCatat.current) return;
    sudahCatat.current = true;
    fetchJson("/api/sigap/pelatihan/langkah", { method: "POST", body: JSON.stringify({ kode: "undangan" }) }).catch(() => {});
  }, [data]);

  async function bukaPdf() {
    setUnduh(true);
    setGalatPdf(null);
    try {
      await bukaBlob("/api/sigap/pelatihan/undangan");
    } catch (e) {
      setGalatPdf(pesanGalat(e));
    } finally {
      setUnduh(false);
    }
  }

  return (
    <Kerangka aktif="undangan" nama={data?.nama} judul="Undangan Pelatihan" sub={u ? `Nomor surat: ${u.nomor}` : undefined}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!data && !galat && <Memuat />}
      {data && u && !data.peserta && (
        <Pesan jenis="info">
          Akun Anda tidak terdaftar sebagai peserta pelatihan, sehingga undangan pribadi tidak tersedia.{" "}
          {data.boleh_lihat_kelola && (
            <Link href="/sigap/pelatihan/kelola" className="font-bold text-[#1F6FD1] underline">
              Buka Kelola Pelatihan
            </Link>
          )}
        </Pesan>
      )}
      {data && u && data.peserta && (
        <>
          <Kartu judul="Undangan Anda" ket={`Batang Barus, ${u.tanggal_surat}`}>
            <dl>
              <Baris k="Nama" v={data.nama} />
              <Baris k="Peran" v={peranLabel(data.peserta.peran)} />
              <Baris k="Kelas" v={data.peserta.kelas ? `Kelas ${data.peserta.kelas}` : "Menunggu pembagian kelas"} />
              <Baris k="Hari/Tanggal" v={u.hari_tanggal} />
              <Baris k="Pukul" v={u.pukul} />
              <Baris k="Tempat" v={u.tempat} />
            </dl>
            <p className="mt-2 rounded-lg bg-[#F6F8FB] px-3 py-2 text-[12.5px] leading-relaxed text-[#55657D]">
              <b>Pakaian:</b> {u.pakaian}
            </p>
          </Kartu>

          <Kartu judul="Ketentuan transpor lokal" className="border-l-4 border-l-[#D9971F]">
            <p className="text-[13px] leading-relaxed">
              Seluruh peserta dibayarkan transpor lokal sehingga <b>wajib melampirkan 5 foto ber-time stamp</b>:
            </p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[13px]">
              <li>saat akan berangkat,</li>
              <li>saat sampai di lokasi,</li>
              <li>saat mengikuti kegiatan,</li>
              <li>saat akan pulang, dan</li>
              <li>saat tiba kembali di domisili.</li>
            </ol>
            <p className="mt-2 text-[13px]">Seluruh foto diunggah lewat SIGAP, menu Transport Lokal.</p>
            {data.peserta && (
              <Link href="/sigap" className="mt-2 inline-block text-[13px] font-bold text-[#1F6FD1] underline">
                Buka menu Transport Lokal di portal
              </Link>
            )}
          </Kartu>

          <Kartu judul="Jadwal" ket={u.hari_tanggal}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="border-b border-[#CDD5DE] bg-[#F8FAFC] px-2.5 py-2 text-left text-[12px] font-semibold text-[#4D5B6B]">Waktu (WIB)</th>
                    <th className="border-b border-[#CDD5DE] bg-[#F8FAFC] px-2.5 py-2 text-left text-[12px] font-semibold text-[#4D5B6B]">Materi</th>
                    <th className="border-b border-[#CDD5DE] bg-[#F8FAFC] px-2.5 py-2 text-left text-[12px] font-semibold text-[#4D5B6B]">Ket.</th>
                  </tr>
                </thead>
                <tbody>
                  {u.jadwal.map((j, i) => (
                    <tr key={i} className="border-t border-[#EDF0F4] align-top">
                      <td className="whitespace-nowrap px-2.5 py-2 font-semibold tabular-nums">{j.waktu}</td>
                      <td className="px-2.5 py-2">
                        {j.materi.map((m, k) => (
                          <div key={k}>{m}</div>
                        ))}
                      </td>
                      <td className="px-2.5 py-2 text-[#55657D]">{j.ket}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12.5px] text-[#55657D]">
              Pretest dan posttest (masing-masing 15 menit) dikerjakan lewat menu{" "}
              <Link href="/sigap/pelatihan" className="font-bold text-[#1F6FD1] underline">
                Pelatihan
              </Link>
              .
            </p>
          </Kartu>

          <Kartu judul="Ketentuan lain">
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
              {u.ketentuan.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </Kartu>

          {galatPdf && <Pesan jenis="galat">{galatPdf}</Pesan>}
          <button type="button" onClick={bukaPdf} disabled={unduh} className={`${BTN} w-full !py-3 !text-[14px]`}>
            {unduh ? "Menyiapkan PDF…" : "⬇ Unduh PDF Undangan"}
          </button>
          <p className="text-center text-[11.5px] text-[#7B8794]">
            {u.ttd.jabatan}, {u.ttd.nama}
          </p>
        </>
      )}
    </Kerangka>
  );
}
