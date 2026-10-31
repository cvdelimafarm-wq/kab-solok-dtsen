"use client";

// app/sigap/pelatihan/kuis-pra/page.tsx
//
// (31 Okt 2026) KUIS PRA PELATIHAN (peserta): soal dipilih per petugas menurut riwayat anomalinya; tinjauan + pembahasan sesudah dikirim.
// API: /api/sigap/kuis-pra. Logika: lib/sigapKuisPra.ts. Pengaturan oleh panitia: Kelola Pelatihan > tab Kuis Pra.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, keluar, keMasuk, pesanGalat, SesiBerakhir, urlPelatihan, waktuWib } from "../../admin/api";
import { BTN_G, BTN_O, Chip, HeaderAdmin, Kartu, Memuat, Pesan } from "../../admin/ui";
import TombolKembali from "@/app/components/TombolKembali";
import type { StatusKuisPra } from "@/lib/sigapKuisPra";

const URL_API = "/api/sigap/kuis-pra";
type Opsi = { kode: string; teks: string };
type Soal = { id: string; judul_paket: string; pertanyaan: string; kata_kunci: string[]; opsi: Opsi[] };
type Berjalan = { id: number; ke: number; soal: Soal[] };
type Data = {
  tersedia: boolean;
  pengaturan?: { jumlah_soal: number; maks_percobaan: number; nilai_lulus: number; wajib_lulus: boolean; buka_at: string | null; tutup_at: string | null };
  status?: StatusKuisPra;
  percobaan?: { ke: number; skor: number | null; selesai: boolean }[];
  berjalan?: Berjalan | null;
};
type Tinjau = Soal & { kunci: string; jawaban: string | null; benar: boolean; penjelasan: string };
type Hasil = { hasil: { benar: number; jumlah: number; skor: number; lulus: boolean; nilai_lulus: number }; status: StatusKuisPra; tinjau: Tinjau[] };

export default function KuisPra() {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [jawaban, setJawaban] = useState<Record<string, string>>({});

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Data>(urlPelatihan(URL_API)));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void muat();
  }, [muat]);

  async function post(isi: Record<string, unknown>) {
    setSibuk(true);
    setGalat(null);
    try {
      return await fetchJson<Record<string, unknown>>(urlPelatihan(URL_API), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isi) });
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      return null;
    } finally {
      setSibuk(false);
    }
  }

  async function mulai() {
    setHasil(null);
    setJawaban({});
    if (await post({ aksi: "mulai" })) await muat();
  }
  async function kirim(b: Berjalan) {
    const r = (await post({ aksi: "jawab", percobaan_id: b.id, jawaban })) as unknown as Hasil | null;
    if (r) {
      setHasil(r);
      await muat();
    }
  }

  const st = data?.status;
  const p = data?.pengaturan;
  const berjalan = data?.berjalan ?? null;
  const terjawab = berjalan ? berjalan.soal.filter((s) => jawaban[s.id]).length : 0;

  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#14202E]">
      <HeaderAdmin kecil="SIGAP · Pelatihan" judul="Kuis pra pelatihan" onKeluar={keluar} kembali={<TombolKembali tema="gelap" induk="/sigap/pelatihan" />}>
        <p className="mt-1 text-[12.5px] text-blue-100">Soal disesuaikan dengan temuan anomali Anda sebelumnya.</p>
      </HeaderAdmin>
      <main className="mx-auto max-w-3xl space-y-3 px-3 pb-16 pt-4 sm:px-4">
        {galat && <Pesan jenis="galat">{galat}</Pesan>}
        {!data && !galat && <Memuat />}
        {data && !data.tersedia && <Pesan jenis="info">Kuis pra belum tersedia untuk Anda.</Pesan>}
        {data?.tersedia && p && st && (
          <>
            <Kartu judul="Ringkasan" ket={`${p.jumlah_soal} soal · nilai lulus ${p.nilai_lulus} · maksimal ${p.maks_percobaan} percobaan`} kanan={<ChipStatus s={st} />}>
              <ul className="space-y-0.5 text-[13px] text-[#33455F]">
                {p.buka_at && <li>Dibuka: {waktuWib(p.buka_at)} WIB</li>}
                {p.tutup_at && <li>Ditutup: {waktuWib(p.tutup_at)} WIB</li>}
                <li>Nilai terbaik Anda: <b>{st.terbaik ?? "belum ada"}</b> · sisa percobaan: <b>{st.sisa}</b></li>
              </ul>
              {st.status === "bisa_mulai" && (
                <div className="mt-3">
                  <button type="button" className={BTN_G} disabled={sibuk} onClick={mulai}>
                    {sibuk ? "Menyiapkan soal…" : st.keBerikut > 1 ? `Mulai percobaan ke-${st.keBerikut}` : "Mulai kuis"}
                  </button>
                </div>
              )}
              {st.status === "lulus" && <p className="mt-2 text-[13px] font-bold text-[#1E7A4C]">Anda sudah lulus kuis pra. Terima kasih.</p>}
              {st.status === "habis" && <p className="mt-2 text-[13px] font-bold text-[#B42329]">Kesempatan percobaan sudah habis. Hubungi panitia bila perlu.</p>}
            </Kartu>

            {berjalan && !hasil && (
              <Kartu judul={`Percobaan ke-${berjalan.ke}`} ket={`${terjawab} dari ${berjalan.soal.length} terjawab`}>
                <ol className="space-y-4">
                  {berjalan.soal.map((s, i) => (
                    <li key={s.id}>
                      <p className="text-[14px] font-semibold leading-snug">
                        {i + 1}. {s.pertanyaan}
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {s.opsi.map((o) => (
                          <label key={o.kode} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[13.5px] ${jawaban[s.id] === o.kode ? "border-[#1F6FD1] bg-[#E3EEFB]" : "border-[#E3E8EE] bg-white"}`}>
                            <input type="radio" name={s.id} className="mt-0.5" checked={jawaban[s.id] === o.kode} onChange={() => setJawaban((j) => ({ ...j, [s.id]: o.kode }))} />
                            <span>
                              <b>{o.kode}.</b> {o.teks}
                            </span>
                          </label>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] text-[#6B7A90]">{terjawab < berjalan.soal.length ? "Soal yang belum dijawab dihitung salah." : "Semua soal terjawab."}</span>
                  <button type="button" className={BTN_G} disabled={sibuk} onClick={() => void kirim(berjalan)}>
                    {sibuk ? "Mengirim…" : "Kirim jawaban"}
                  </button>
                </div>
              </Kartu>
            )}

            {hasil && (
              <Kartu judul={hasil.hasil.lulus ? "Lulus 🎉" : "Belum lulus"} ket={`${hasil.hasil.benar} dari ${hasil.hasil.jumlah} benar · nilai ${hasil.hasil.skor} (batas ${hasil.hasil.nilai_lulus})`} kanan={<Chip w={hasil.hasil.lulus ? "ok" : "wait"}>{hasil.hasil.lulus ? "Lulus" : "Belum lulus"}</Chip>}>
                <ol className="space-y-3">
                  {hasil.tinjau.map((s, i) => (
                    <li key={s.id} className={`rounded-lg border px-3 py-2 ${s.benar ? "border-[#BFE3CD] bg-[#F1FAF4]" : "border-[#F3C9CB] bg-[#FFF5F5]"}`}>
                      <p className="text-[13.5px] font-semibold">
                        {i + 1}. {s.pertanyaan}
                      </p>
                      <p className="mt-1 text-[12.5px]">
                        Jawaban Anda: <b>{s.jawaban ?? "tidak dijawab"}</b> · Kunci: <b>{s.kunci}</b> {s.benar ? "✓" : "✗"}
                      </p>
                      {s.penjelasan && <p className="mt-1 text-[12.5px] leading-snug text-[#33455F]">{s.penjelasan}</p>}
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className={BTN_O} onClick={() => setHasil(null)}>
                    Tutup tinjauan
                  </button>
                </div>
              </Kartu>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ChipStatus({ s }: { s: StatusKuisPra }) {
  const peta: Record<StatusKuisPra["status"], { t: string; w: "ok" | "wait" | "mut" | "bad" | "navy" }> = {
    nonaktif: { t: "Nonaktif", w: "mut" },
    belum_buka: { t: "Belum dibuka", w: "navy" },
    ditutup: { t: "Ditutup", w: "mut" },
    lulus: { t: "Lulus", w: "ok" },
    habis: { t: "Kesempatan habis", w: "bad" },
    lanjut: { t: "Sedang mengerjakan", w: "wait" },
    bisa_mulai: { t: "Siap dikerjakan", w: "wait" },
  };
  return <Chip w={peta[s.status].w}>{peta[s.status].t}</Chip>;
}
