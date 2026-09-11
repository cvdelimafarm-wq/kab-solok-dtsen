import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VARIABEL_LABEL } from "@/lib/types";
import PrintButton from "./print-button";

export default async function SuratKeteranganPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: usulan } = await supabase
    .from("usulan")
    .select(
      "*, jorong:jorong_id(nama_jorong, wali_jorong_nama, nagari:nagari_id(nama_nagari, kecamatan))"
    )
    .eq("id", id)
    .maybeSingle<any>();

  if (!usulan) notFound();

  const { data: sk } = await supabase
    .from("surat_keterangan")
    .select("*")
    .eq("usulan_id", id)
    .maybeSingle();

  const variabelTerpenuhi = VARIABEL_LABEL.filter((v) => usulan[v.key]);
  const tanggal = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <div className="no-print mb-6 flex justify-end">
        <PrintButton />
      </div>

      <div className="border border-ink/20 p-10 text-sm leading-relaxed text-ink">
        <div className="text-center">
          <p className="font-semibold">PEMERINTAH NAGARI {usulan.jorong?.nagari?.nama_nagari?.toUpperCase()}</p>
          <p>KECAMATAN {usulan.jorong?.nagari?.kecamatan?.toUpperCase()}</p>
          <p>KABUPATEN SOLOK</p>
        </div>
        <hr className="my-4 border-ink" />

        <p className="text-center font-semibold underline">
          SURAT KETERANGAN
        </p>
        <p className="text-center">
          Nomor: {sk?.nomor_surat ?? "-"}
        </p>

        <p className="mt-6">
          Yang bertanda tangan di bawah ini, Wali Nagari {usulan.jorong?.nagari?.nama_nagari},
          menerangkan bahwa data berikut diusulkan oleh Wali Jorong{" "}
          {usulan.jorong?.wali_jorong_nama ?? usulan.jorong?.nama_jorong} untuk
          pemutakhiran Data Terpadu Sosial Ekonomi Nasional (DTSEN):
        </p>

        <table className="mt-4 w-full">
          <tbody>
            <tr>
              <td className="w-40 py-0.5 align-top">Nama</td>
              <td className="w-4 align-top">:</td>
              <td className="align-top">{usulan.nama_warga}</td>
            </tr>
            <tr>
              <td className="py-0.5 align-top">NIK</td>
              <td className="align-top">:</td>
              <td className="align-top">{usulan.nik}</td>
            </tr>
            <tr>
              <td className="py-0.5 align-top">No. Kartu Keluarga</td>
              <td className="align-top">:</td>
              <td className="align-top">{usulan.no_kk || "-"}</td>
            </tr>
            <tr>
              <td className="py-0.5 align-top">Alamat</td>
              <td className="align-top">:</td>
              <td className="align-top">{usulan.alamat || "-"}</td>
            </tr>
            <tr>
              <td className="py-0.5 align-top">Jorong</td>
              <td className="align-top">:</td>
              <td className="align-top">{usulan.jorong?.nama_jorong}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4">
          Berdasarkan pengamatan Wali Jorong, warga tersebut memenuhi{" "}
          {variabelTerpenuhi.length} dari 10 variabel penciri kemiskinan
          sebagai berikut:
        </p>
        <ol className="mt-2 list-decimal pl-5">
          {variabelTerpenuhi.length > 0 ? (
            variabelTerpenuhi.map((v) => <li key={v.key}>{v.label}</li>)
          ) : (
            <li className="list-none italic text-ink/60">
              Tidak ada variabel yang tercatat.
            </li>
          )}
        </ol>

        {usulan.catatan_wali_jorong && (
          <p className="mt-4">
            Catatan tambahan: {usulan.catatan_wali_jorong}
          </p>
        )}

        <p className="mt-6">
          Demikian surat keterangan ini dibuat untuk digunakan sebagai bahan
          pemeriksaan oleh Badan Pusat Statistik Kabupaten Solok.
        </p>

        <div className="mt-16 flex justify-end">
          <div className="text-center">
            <p>{usulan.jorong?.nagari?.nama_nagari}, {tanggal}</p>
            <p>Wali Nagari {usulan.jorong?.nagari?.nama_nagari}</p>
            <div className="h-20" />
            <p className="font-semibold underline">
              (..........................................)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
