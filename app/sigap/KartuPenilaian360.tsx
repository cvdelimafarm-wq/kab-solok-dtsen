"use client";

// app/sigap/KartuPenilaian360.tsx
//
// (10 Nov 2026) Kartu "Penilaian 360 tim" di tab Hari ini (Pendataan Bencana): setiap anggota menilai rekan satu timnya (kinerja, kedisiplinan,
// membangun tim, kerja sama, komunikasi; skala 1-5 + catatan). Aturan dan penyimpanan: lib/penilaian360.ts, app/api/sigap/penilaian360/route.ts.
// Tampil HANYA bila akun anggota tim atau pemegang izin rekap; server yang memutuskan. Gagal memuat = tidak tampil.
// Nilai tentang diri sendiri tidak pernah ditampilkan; rekap per orang hanya untuk admin (bolehRekap).

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { CATATAN_MAKS, KRITERIA, LABEL_SKOR, type KodeKriteria, type PeranTim, type Skor } from "@/lib/penilaian360";

type Anggota = { akun_id: number; nama: string; peran: PeranTim; sudah: boolean; skor: Skor | null; catatan: string | null };
type Kemajuan = { total: number; sudah: number; sisa: number; lengkap: boolean };
type Keadaan =
  | { ada: false; bolehRekap: boolean }
  | { ada: true; bolehRekap: boolean; kelompok: number; lintas: boolean; anggota: Anggota[]; kemajuan: Kemajuan };
type Rekap = {
  rekap: { akun_id: number; nama: string; peran: PeranTim | null; kelompok: number | null; penilai: number; rata: number; per: Skor }[];
  belum: { akun_id: number; nama: string; kelompok: number | null; sisa: number }[];
  jumlahOrang: number;
};

const NAMA_PERAN: Record<PeranTim, string> = { kortim: "Ketua tim", pml: "PML", ppl: "PPL" };
const WARNA_SKOR = ["", "#C2362B", "#D9822B", "#8A7A00", "#2E7D32", "#0F8A4F"];
const kosong = (): Partial<Record<KodeKriteria, number>> => ({});

export default function KartuPenilaian360({ kegiatanId }: { kegiatanId: number }) {
  const [data, setData] = useState<Keadaan | null>(null);
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState<Anggota | null>(null);
  const [isi, setIsi] = useState<Partial<Record<KodeKriteria, number>>>(kosong());
  const [catatan, setCatatan] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [rekap, setRekap] = useState<Rekap | null>(null);
  const [lihatRekap, setLihatRekap] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const r = await apiPortal<Keadaan>(`/api/sigap/penilaian360?kegiatan=${kegiatanId}`);
        if (!batal) setData(r);
      } catch { /* gagal memuat = kartu tidak tampil */ }
    })();
    return () => { batal = true; };
  }, [kegiatanId]);

  const mulaiNilai = useCallback((a: Anggota) => {
    setPilih(a);
    setIsi(a.skor ? { ...a.skor } : kosong());
    setCatatan(a.catatan ?? "");
    setGalat(null);
  }, []);

  const kirim = useCallback(async () => {
    if (!pilih) return;
    setSimpan(true);
    setGalat(null);
    try {
      const r = await apiPortal<Keadaan>("/api/sigap/penilaian360", { method: "POST", body: JSON.stringify({ kegiatan: kegiatanId, dinilai: pilih.akun_id, skor: isi, catatan }) });
      setData((lama) => ({ ...r, bolehRekap: lama?.bolehRekap ?? false }) as Keadaan);
      setPilih(null);
    } catch (e) {
      if (!(e instanceof Error && e.message === "SESI_BERAKHIR")) setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally { setSimpan(false); }
  }, [pilih, isi, catatan, kegiatanId]);

  const muatRekap = useCallback(async () => {
    setLihatRekap((v) => !v);
    if (rekap) return;
    try { setRekap(await apiPortal<Rekap>(`/api/sigap/penilaian360?kegiatan=${kegiatanId}&rekap=1`)); } catch { setGalat("Gagal memuat rekap."); }
  }, [rekap, kegiatanId]);

  if (!data || (!data.ada && !data.bolehRekap)) return null;
  const lengkapIsi = KRITERIA.every((k) => typeof isi[k.kode] === "number");

  return (
    <section id="penilaian-360" className="scroll-mt-24 rounded-[18px] border border-[#CFE0F5] bg-white p-3.5 shadow-[0_4px_14px_rgba(18,49,95,.10)]" aria-label="Penilaian 360 tim">
      <button type="button" onClick={() => setBuka((v) => !v)} aria-expanded={buka} className="flex w-full items-center gap-3 text-left">
        <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] bg-[#EAF1FB] text-[20px]" aria-hidden>🤝</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-extrabold leading-snug text-[#12315F]">Penilaian 360 tim</b>
          <span className="block text-[12.5px] leading-snug text-[#55657D]">
            {data.ada
              ? data.kemajuan.lengkap ? "Semua rekan sudah Anda nilai · nilai bisa diubah" : `${data.kemajuan.sudah} dari ${data.kemajuan.total} rekan sudah Anda nilai`
              : "Rekap penilaian antaranggota tim"}
          </span>
        </span>
        {data.ada && !data.kemajuan.lengkap && <span className="flex-none rounded-full bg-[#FFC000] px-2.5 py-[3px] text-[11px] font-extrabold text-[#111]">Sisa {data.kemajuan.sisa}</span>}
        <span aria-hidden className="flex-none text-[#12315F]">{buka ? "▲" : "▼"}</span>
      </button>

      {data.ada && (
        <div className="mt-2.5 h-[6px] overflow-hidden rounded-full bg-[#E3ECF8]" aria-hidden>
          <div className="h-full rounded-full bg-[#0F8A4F]" style={{ width: `${data.kemajuan.total ? Math.round((data.kemajuan.sudah / data.kemajuan.total) * 100) : 0}%` }} />
        </div>
      )}

      {buka && (
        <div className="mt-3">
          <p className="mb-2 text-[12px] leading-snug text-[#55657D]">
            Nilailah rekan satu tim secara jujur dan adil. Penilaian bersifat rahasia: rekan yang dinilai tidak melihatnya, hanya admin yang melihat rekap.
            {data.ada && data.lintas && " Sebagai koordinator lintas tim, Anda menilai ketua tim dan PML."}
          </p>

          {data.ada && !pilih && (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {data.anggota.map((a) => (
                <li key={a.akun_id}>
                  <button type="button" onClick={() => mulaiNilai(a)} className="flex min-h-[48px] w-full items-center gap-2 rounded-[12px] border border-[#D5E1F2] bg-[#F7FAFE] px-3 py-2 text-left active:opacity-90">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-bold text-[#12315F]">{a.nama}</b>
                      <span className="block text-[11.5px] text-[#6B7A90]">{NAMA_PERAN[a.peran]}</span>
                    </span>
                    <span className={`flex-none rounded-full px-2.5 py-[3px] text-[11px] font-extrabold ${a.sudah ? "bg-[#E3F6EC] text-[#0F5C38]" : "bg-[#FFF0DC] text-[#8A4B00]"}`}>{a.sudah ? "Sudah · ubah" : "Belum"}</span>
                  </button>
                </li>
              ))}
              {data.anggota.length === 0 && <li className="text-[12.5px] text-[#6B7A90]">Belum ada rekan satu tim yang terdaftar.</li>}
            </ul>
          )}

          {data.ada && pilih && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <button type="button" onClick={() => setPilih(null)} className="min-h-[40px] rounded-[10px] border border-[#D5E1F2] bg-white px-3 text-[13px] font-bold text-[#12315F]">← Daftar</button>
                <span className="min-w-0 flex-1"><b className="block truncate text-[14px] text-[#12315F]">{pilih.nama}</b><span className="text-[11.5px] text-[#6B7A90]">{NAMA_PERAN[pilih.peran]}</span></span>
              </div>
              {KRITERIA.map((k) => (
                <fieldset key={k.kode} className="mb-2.5 border-0 p-0">
                  <legend className="mb-1 p-0 text-[13px] font-extrabold text-[#12315F]">{k.label}</legend>
                  <span className="mb-1 block text-[11.5px] leading-snug text-[#6B7A90]">{k.tanya}</span>
                  <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={k.label}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const aktif = isi[k.kode] === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={aktif}
                          onClick={() => setIsi((s) => ({ ...s, [k.kode]: n }))}
                          className="min-h-[44px] rounded-[10px] border-2 text-[15px] font-extrabold"
                          style={aktif ? { background: WARNA_SKOR[n], borderColor: WARNA_SKOR[n], color: "#fff" } : { background: "#fff", borderColor: "#C9D6E8", color: "#12315F" }}
                        >{n}</button>
                      );
                    })}
                  </div>
                  <span className="mt-0.5 block min-h-[16px] text-[11.5px] font-bold text-[#55657D]">{isi[k.kode] ? LABEL_SKOR[isi[k.kode] as number] : ""}</span>
                </fieldset>
              ))}
              <label className="block text-[13px] font-extrabold text-[#12315F]" htmlFor="catatan-360">Catatan (opsional)</label>
              <textarea
                id="catatan-360"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value.slice(0, CATATAN_MAKS))}
                rows={3}
                placeholder="Contoh: selalu tepat waktu dan mau membantu rekan"
                className="mt-1 w-full rounded-[10px] border border-[#C9D6E8] p-2 text-[14px]"
              />
              <span className="block text-right text-[11px] text-[#6B7A90]">{catatan.length}/{CATATAN_MAKS}</span>
              {galat && <p role="alert" className="my-1 text-[12.5px] font-bold text-[#C2362B]">{galat}</p>}
              <button type="button" disabled={!lengkapIsi || simpan} onClick={() => void kirim()} className="mt-1 inline-flex min-h-[46px] w-full items-center justify-center rounded-[12px] bg-[#12315F] px-4 text-[14px] font-extrabold text-white disabled:opacity-40">
                {simpan ? "Menyimpan…" : lengkapIsi ? "Simpan penilaian" : "Isi semua kriteria dulu"}
              </button>
            </div>
          )}

          {data.bolehRekap && (
            <div className="mt-3 border-t border-[#E3ECF8] pt-2.5">
              <button type="button" onClick={() => void muatRekap()} className="min-h-[44px] w-full rounded-[12px] border border-[#12315F] bg-white px-3 text-[13.5px] font-extrabold text-[#12315F]">
                {lihatRekap ? "Tutup rekap admin" : "Rekap penilaian (admin)"}
              </button>
              {lihatRekap && !rekap && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Memuat rekap…</p>}
              {lihatRekap && rekap && (
                <div className="mt-2">
                  <p className="mb-1 text-[11.5px] text-[#6B7A90]">Rata-rata skala 1-5 dari semua penilai. K = Kinerja, D = Kedisiplinan, T = Membangun tim, W = Kerja sama, M = Komunikasi.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="text-left text-[#55657D]">
                          <th className="p-1">Nama</th><th className="p-1">Kel</th><th className="p-1">n</th>
                          <th className="p-1">K</th><th className="p-1">D</th><th className="p-1">T</th><th className="p-1">W</th><th className="p-1">M</th><th className="p-1">Rata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rekap.rekap.map((r) => (
                          <tr key={r.akun_id} className="border-t border-[#EEF3FA]">
                            <td className="p-1 font-bold text-[#12315F]">{r.nama}</td><td className="p-1">{r.kelompok ?? "Semua"}</td><td className="p-1">{r.penilai}</td>
                            <td className="p-1">{r.per.kinerja}</td><td className="p-1">{r.per.kedisiplinan}</td><td className="p-1">{r.per.tim}</td><td className="p-1">{r.per.kerjasama}</td><td className="p-1">{r.per.komunikasi}</td>
                            <td className="p-1 font-extrabold">{r.rata}</td>
                          </tr>
                        ))}
                        {rekap.rekap.length === 0 && <tr><td colSpan={9} className="p-2 text-[#6B7A90]">Belum ada penilaian masuk.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <p className="mb-1 mt-2.5 text-[12.5px] font-extrabold text-[#12315F]">Belum selesai menilai ({rekap.belum.length} dari {rekap.jumlahOrang} orang)</p>
                  <ul className="m-0 list-none p-0 text-[12px] text-[#55657D]">
                    {rekap.belum.map((b) => <li key={b.akun_id}>{b.nama} · {b.kelompok ? `Kel ${b.kelompok}` : "Lintas kelompok"} · sisa {b.sisa}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
