"use client";

// app/sigap/seleksi/[id]/page.tsx
//
// (31 Okt 2026) Halaman Mitra untuk seleksi petugas (paket 3): ringkasan seleksi, pemeriksaan kelayakan diri, daftar sebagai PPL/PML, dan mundur.
// Paket 4: tes seleksi (dikerjakan di sini, dinilai server) dan hasil/konfirmasi setelah diumumkan.
// Tujuan tautan push ajakan dan pesan undangan. Belum masuk -> diarahkan masuk lalu kembali ke sini. Data: /api/sigap/seleksi-saya.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiPortal } from "@/app/portal/sesi";
import { bacaSesi } from "@/app/sigap/admin/api";
import { teksWaktuWib, type JendelaDaftar, type PutusanDaftar } from "@/lib/seleksiDaftar";
import type { HasilKelayakan } from "@/lib/seleksiSyarat";

type Data = {
  seleksi: { id: number; nama: string; kegiatan: string; status: string; jadwal_buka: string | null; jadwal_tutup: string | null; sisa_ppl: number; sisa_pml: number; syarat: { domisili: string | null; jarak_km: number | null } };
  tidak_berhak?: string;
  jendela?: JendelaDaftar;
  kelayakan?: HasilKelayakan;
  saya: { peran: string; status: string; mendaftar_at: string } | null;
  boleh?: { ppl: PutusanDaftar; pml: PutusanDaftar };
  tes?: { status: string; durasi_menit: number; buka: string | null; tutup: string | null; jumlah_soal: number; skor: number | null } | null;
  hasil?: {
    hasil: string | null; peringkat: number | null; skor: number | null; konfirmasi: string | null; ditugaskan: boolean; boleh_konfirmasi: boolean; alasan_konfirmasi: string | null;
    info_pelatihan: string | null; batas_konfirmasi: string | null;
  } | null;
};
type SoalMitra = { nomor: number; teks: string; opsi: { kode: string; teks: string }[] };

const kartu = "rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const tombol = "inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] bg-[#1F5FD1] px-4 text-[14.5px] font-bold text-white disabled:opacity-50";
const tombolPutih = "inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] border border-[#CBD6E6] bg-white px-4 text-[14.5px] font-bold text-[#1B2B4B] disabled:opacity-50";

export default function HalamanSeleksi() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [soal, setSoal] = useState<SoalMitra[] | null>(null);
  const [batas, setBatas] = useState<string | null>(null);
  const [jawab, setJawab] = useState<Record<string, string>>({});
  const [sisa, setSisa] = useState<number | null>(null);
  const jawabRef = useRef<Record<string, string>>({});
  const mengirim = useRef(false);

  const muat = useCallback(async () => {
    try {
      setD(await apiPortal<Data>(`/api/sigap/seleksi-saya?id=${id}`));
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
      setGalat(e instanceof Error ? e.message : "Gagal memuat seleksi.");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      setGalat("Tautan seleksi tidak sah.");
      return;
    }
    if (!bacaSesi()) {
      window.location.replace(`/?lanjut=${encodeURIComponent(`/sigap/seleksi/${id}`)}`);
      return;
    }
    void muat();
  }, [id, muat]);

  async function kirim(body: Record<string, unknown>, pesanOk: string) {
    setSibuk(true);
    setInfo(null);
    setGalat(null);
    try {
      await apiPortal("/api/sigap/seleksi-saya", { method: "POST", body: JSON.stringify({ id, ...body }) });
      setInfo(pesanOk);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memproses.");
    } finally {
      setSibuk(false);
    }
  }

  async function mulaiTes() {
    setSibuk(true);
    setInfo(null);
    setGalat(null);
    try {
      const r = await apiPortal<{ batas_at: string; soal: SoalMitra[] }>("/api/sigap/seleksi-saya", { method: "POST", body: JSON.stringify({ id, aksi: "mulai_tes" }) });
      jawabRef.current = {};
      setJawab({});
      setSoal(r.soal);
      setBatas(r.batas_at);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memulai tes.");
    } finally {
      setSibuk(false);
    }
  }

  const kirimTes = useCallback(async () => {
    if (mengirim.current) return;
    mengirim.current = true;
    setSibuk(true);
    try {
      const r = await apiPortal<{ terlambat: boolean; skor: number | null; benar: number | null; total: number }>("/api/sigap/seleksi-saya", { method: "POST", body: JSON.stringify({ id, aksi: "kirim_tes", jawaban: jawabRef.current }) });
      setSoal(null);
      setBatas(null);
      setSisa(null);
      setInfo(r.terlambat ? "Waktu habis; jawaban terlambat tidak dihitung." : r.skor !== null ? `Tes selesai. Nilai Anda ${r.skor} (${r.benar}/${r.total} benar).` : "Tes selesai. Jawaban Anda tersimpan.");
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengirim jawaban.");
    } finally {
      mengirim.current = false;
      setSibuk(false);
    }
  }, [id, muat]);

  useEffect(() => {
    if (!batas) return;
    const hitung = () => {
      const detik = Math.floor((Date.parse(batas) - Date.now()) / 1000);
      setSisa(Math.max(0, detik));
      if (detik <= 0) void kirimTes();
    };
    hitung();
    const t = setInterval(hitung, 1000);
    return () => clearInterval(t);
  }, [batas, kirimTes]);

  const terdaftar = d?.saya?.status === "terdaftar";
  const tutup = teksWaktuWib(d?.seleksi.jadwal_tutup ?? null);

  return (
    <main className="min-h-screen bg-[#EEF2F8] px-4 pb-16 pt-6 text-[#14202E]">
      <div className="mx-auto max-w-[560px] space-y-3">
        <a href="/" className="text-[13px] font-bold text-[#1F5FD1]">← Beranda</a>
        {galat && <p role="alert" className="rounded-[14px] bg-[#FDE8E8] px-3.5 py-3 text-[13.5px] text-[#B42329]">{galat}</p>}
        {info && <p className="rounded-[14px] bg-[#E3F6EC] px-3.5 py-3 text-[13.5px] text-[#13794B]">{info}</p>}
        {!d && !galat && <p className="py-10 text-center text-[14px] text-[#55657D]">Memuat…</p>}

        {d && (
          <>
            <section className={kartu}>
              <p className="text-[11.5px] font-bold uppercase tracking-wider text-[#7B8794]">Seleksi petugas</p>
              <h1 className="mt-1 text-[19px] font-extrabold text-[#0F2A52]">{d.seleksi.nama}</h1>
              <p className="text-[13.5px] text-[#55657D]">{d.seleksi.kegiatan}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                <div className="rounded-[12px] bg-[#F5F8FE] px-3 py-2"><dt className="text-[11.5px] font-semibold text-[#6B7A90]">Dibutuhkan PPL</dt><dd className="text-[18px] font-extrabold">{d.seleksi.sisa_ppl}</dd></div>
                <div className="rounded-[12px] bg-[#F5F8FE] px-3 py-2"><dt className="text-[11.5px] font-semibold text-[#6B7A90]">Dibutuhkan PML</dt><dd className="text-[18px] font-extrabold">{d.seleksi.sisa_pml}</dd></div>
              </dl>
              {tutup && <p className="mt-3 text-[13px] text-[#44546F]">Pendaftaran ditutup <b>{tutup}</b>.</p>}
              {(d.seleksi.syarat.domisili || d.seleksi.syarat.jarak_km) && (
                <p className="mt-2 text-[12.5px] text-[#55657D]">
                  Syarat khusus:{d.seleksi.syarat.domisili ? ` domisili ${d.seleksi.syarat.domisili === "nagari" ? "senagari" : "sekecamatan"} dengan wilayah sampel` : ""}
                  {d.seleksi.syarat.domisili && d.seleksi.syarat.jarak_km ? ";" : ""}
                  {d.seleksi.syarat.jarak_km ? ` jarak rumah ke wilayah sampel terdekat paling jauh ${d.seleksi.syarat.jarak_km} km` : ""}.
                </p>
              )}
            </section>

            {d.tidak_berhak ? (
              <section className={kartu}><p className="text-[14px] text-[#B42329]">{d.tidak_berhak}</p></section>
            ) : (
              <section className={`${kartu} space-y-3`}>
                {d.kelayakan && (
                  <p className={`rounded-[12px] px-3 py-2.5 text-[13.5px] ${d.kelayakan.status === "memenuhi" ? "bg-[#E3F6EC] text-[#13794B]" : d.kelayakan.status === "perlu_lokasi" ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#FDE8E8] text-[#B42329]"}`}>
                    {d.kelayakan.status === "memenuhi"
                      ? `Anda memenuhi syarat${d.kelayakan.jarak_km !== null ? ` (wilayah terdekat ${d.kelayakan.jarak_km} km)` : ""}.`
                      : d.kelayakan.status === "perlu_lokasi"
                        ? `Lokasi Anda belum lengkap: ${d.kelayakan.alasan.join("; ")}.`
                        : `Belum memenuhi syarat: ${d.kelayakan.alasan.join("; ")}.`}
                  </p>
                )}

                {terdaftar ? (
                  <>
                    <p className="rounded-[12px] bg-[#E6EEFC] px-3 py-2.5 text-[13.5px] font-semibold text-[#1F5FD1]">Anda terdaftar sebagai {d.saya?.peran.toUpperCase()}.</p>
                    {d.jendela?.buka && (
                      <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => { if (window.confirm("Mundur dari seleksi ini?")) void kirim({ aksi: "mundur" }, "Anda mundur dari seleksi."); }}>
                        Mundur dari seleksi
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {d.saya?.status === "mundur" && <p className="text-[12.5px] text-[#55657D]">Anda sebelumnya mundur. Anda dapat mendaftar lagi selama pendaftaran dibuka.</p>}
                    {d.boleh && (
                      <>
                        {(["ppl", "pml"] as const).map((p) => (
                          <div key={p}>
                            <button type="button" className={d.boleh![p].boleh ? tombol : tombolPutih} disabled={sibuk || !d.boleh![p].boleh} onClick={() => void kirim({ aksi: "daftar", peran: p }, `Anda terdaftar sebagai ${p.toUpperCase()}.`)}>
                              Daftar sebagai {p.toUpperCase()}
                            </button>
                            {!d.boleh![p].boleh && d.boleh![p].alasan && <p className="mt-1 text-[12px] text-[#6B7A90]">{d.boleh![p].alasan}</p>}
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </section>
            )}

            {terdaftar && soal && (
              <section className={`${kartu} space-y-3`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-[16px] font-extrabold text-[#0F2A52]">Tes seleksi</h2>
                  <span className={`rounded-full px-3 py-1 text-[13px] font-extrabold ${sisa !== null && sisa <= 60 ? "bg-[#FDE8E8] text-[#B42329]" : "bg-[#E6EEFC] text-[#1F5FD1]"}`} aria-live="polite">
                    {sisa === null ? "–" : `${Math.floor(sisa / 60)}:${String(sisa % 60).padStart(2, "0")}`}
                  </span>
                </div>
                {soal.map((x) => (
                  <fieldset key={x.nomor} className="rounded-[12px] border border-[#DDE6F3] p-3">
                    <legend className="px-1 text-[13px] font-bold text-[#44546F]">Soal {x.nomor}</legend>
                    <p className="mb-2 whitespace-pre-line text-[14px]">{x.teks}</p>
                    <div className="space-y-1.5">
                      {x.opsi.map((o) => (
                        <label key={o.kode} className={`flex cursor-pointer items-start gap-2 rounded-[10px] px-2.5 py-2 text-[13.5px] ${jawab[String(x.nomor)] === o.kode ? "bg-[#E6EEFC]" : "bg-[#F5F8FE]"}`}>
                          <input
                            type="radio"
                            name={`soal-${x.nomor}`}
                            checked={jawab[String(x.nomor)] === o.kode}
                            onChange={() => {
                              jawabRef.current = { ...jawabRef.current, [String(x.nomor)]: o.kode };
                              setJawab(jawabRef.current);
                            }}
                          />
                          <span><b>{o.kode}.</b> {o.teks}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <p className="text-[12.5px] text-[#55657D]">Terjawab {Object.keys(jawab).length} dari {soal.length} soal. Jawaban dikirim otomatis saat waktu habis.</p>
                <button type="button" className={tombol} disabled={sibuk} onClick={() => { if (window.confirm("Kirim jawaban sekarang? Tes tidak dapat diulang.")) void kirimTes(); }}>
                  Kirim jawaban
                </button>
              </section>
            )}

            {terdaftar && !soal && d.tes && d.tes.status !== "tidak_ada" && (
              <section className={`${kartu} space-y-2`}>
                <h2 className="text-[16px] font-extrabold text-[#0F2A52]">Tes seleksi</h2>
                <p className="text-[13.5px] text-[#44546F]">
                  {d.tes.jumlah_soal} soal · {d.tes.durasi_menit} menit · dikerjakan satu kali
                  {d.tes.buka && d.tes.tutup ? ` · dibuka ${teksWaktuWib(d.tes.buka)} sampai ${teksWaktuWib(d.tes.tutup)}` : ""}.
                </p>
                {d.tes.status === "belum_buka" && <p className="rounded-[12px] bg-[#FFF4D6] px-3 py-2 text-[13.5px] text-[#8A6200]">Tes belum dibuka.</p>}
                {d.tes.status === "terlewat" && <p className="rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[13.5px] text-[#B42329]">Waktu tes sudah ditutup dan Anda belum mengerjakan.</p>}
                {d.tes.status === "selesai" && <p className="rounded-[12px] bg-[#E3F6EC] px-3 py-2 text-[13.5px] text-[#13794B]">Tes sudah Anda kerjakan{d.tes.skor !== null ? `. Nilai: ${d.tes.skor}` : ""}.</p>}
                {(d.tes.status === "buka" || d.tes.status === "mengerjakan") && (
                  <button type="button" className={tombol} disabled={sibuk} onClick={() => { if (d.tes?.status === "mengerjakan" || window.confirm(`Mulai tes sekarang? Waktu ${d.tes?.durasi_menit} menit langsung berjalan dan tes tidak dapat diulang.`)) void mulaiTes(); }}>
                    {d.tes.status === "mengerjakan" ? "Lanjutkan tes" : "Mulai tes"}
                  </button>
                )}
              </section>
            )}

            {terdaftar && d.hasil && (
              <section className={`${kartu} space-y-2.5`}>
                <h2 className="text-[16px] font-extrabold text-[#0F2A52]">Hasil seleksi</h2>
                <p className={`rounded-[12px] px-3 py-2.5 text-[15px] font-extrabold ${d.hasil.hasil === "lulus" ? "bg-[#E3F6EC] text-[#13794B]" : d.hasil.hasil === "cadangan" ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#F1F3F7] text-[#44546F]"}`}>
                  {d.hasil.hasil === "lulus" ? "Selamat, Anda lulus" : d.hasil.hasil === "cadangan" ? "Anda masuk daftar cadangan" : "Anda belum lulus pada seleksi ini"}
                </p>
                {(d.hasil.peringkat !== null || d.hasil.skor !== null) && (
                  <p className="text-[13px] text-[#55657D]">{d.hasil.peringkat !== null ? `Peringkat ${d.hasil.peringkat}` : ""}{d.hasil.peringkat !== null && d.hasil.skor !== null ? " · " : ""}{d.hasil.skor !== null ? `Skor akhir ${d.hasil.skor}` : ""}</p>
                )}
                {d.hasil.hasil === "lulus" && (
                  <>
                    {d.hasil.info_pelatihan && <p className="whitespace-pre-line rounded-[12px] bg-[#F5F8FE] px-3 py-2 text-[13.5px]">{d.hasil.info_pelatihan}</p>}
                    {d.hasil.konfirmasi ? (
                      <p className="rounded-[12px] bg-[#E6EEFC] px-3 py-2.5 text-[13.5px] font-semibold text-[#1F5FD1]">
                        {d.hasil.konfirmasi === "bersedia" ? (d.hasil.ditugaskan ? "Anda menyatakan bersedia dan sudah tercatat dalam penugasan kegiatan." : "Anda menyatakan bersedia.") : "Anda menyatakan tidak bersedia."}
                      </p>
                    ) : null}
                    {d.hasil.batas_konfirmasi && !d.hasil.konfirmasi && <p className="text-[12.5px] text-[#55657D]">Konfirmasi paling lambat {teksWaktuWib(d.hasil.batas_konfirmasi)}.</p>}
                    {d.hasil.boleh_konfirmasi ? (
                      <div className="space-y-2">
                        <button type="button" className={tombol} disabled={sibuk} onClick={() => void kirim({ aksi: "konfirmasi", bersedia: true }, "Terima kasih, kesediaan Anda tercatat.")}>
                          Saya bersedia mengikuti kegiatan{d.hasil.info_pelatihan ? " dan jadwal pelatihan" : ""}
                        </button>
                        <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => { if (window.confirm("Yakin tidak bersedia? Kursi Anda dapat diberikan kepada cadangan.")) void kirim({ aksi: "konfirmasi", bersedia: false }, "Pernyataan tidak bersedia tercatat."); }}>
                          Saya tidak bersedia
                        </button>
                      </div>
                    ) : (
                      !d.hasil.konfirmasi && d.hasil.alasan_konfirmasi && <p className="text-[12.5px] text-[#B42329]">{d.hasil.alasan_konfirmasi}</p>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
