"use client";

// app/sigap/korwil/KorwilLembarQc.tsx
//
// (27 Okt 2026) Lembar Supervisi > Lembar Quality Check. Korwil (kortim) -- atau admin pendataan -- mengisi Kuesioner QC Korwil untuk:
//  * Petugas: seorang PML/PPL dalam kelompok pada suatu tanggal; atau
//  * Keluarga (KK): satu KK hasil pendataan seorang PPL.
// Kuesioner (aspek QC-1..n, pertanyaan T/O/N) diunggah admin di Kelola Pendataan > QC > Kuesioner supervisi. Skor aspek = nilai terburuk, lalu kategori petugas
// (Baik / Cukup / Perlu pembinaan) dihitung langsung di layar dan disimpan. Satu lembar per (pemeriksa, tanggal, petugas, KK): mengirim lagi memperbarui.
// Data: /api/portal/qc/kuesioner (lib/portal/qcKuesioner.ts). Aturan hitung: lib/sigapQcKuesioner.ts (sama dengan di server).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { namaSingkatTampil } from "@/lib/namaTampil";
import {
  LABEL_SKOR,
  diperiksaBawaan,
  periksaJawaban,
  type AspekKuesioner,
  type Jawaban,
  type Kesimpulan,
  type NilaiSoal,
  type ObjekKuesioner,
  type SoalKuesioner,
  type StrukturKuesioner,
} from "@/lib/sigapQcKuesioner";

type Anggota = { akun_id: number; nama: string; peran: "pml" | "ppl"; pml_nama: string | null };
type Kuesioner = { id: number; objek: ObjekKuesioner; versi: number; judul: string; struktur: StrukturKuesioner };
type Identitas = { kecamatan: string; nagari: string; sls: string; jenis_qc: string };
type Lembar = {
  id: number;
  objek: ObjekKuesioner;
  tanggal: string;
  pemeriksa_akun_id: number;
  pemeriksa_nama: string;
  subjek_akun_id: number | null;
  subjek_nama: string | null;
  kk_id: number | null;
  kk_nama: string | null;
  identitas: Partial<Identitas>;
  jawaban: Partial<Jawaban>;
  ringkas: Partial<Kesimpulan>;
  catatan: string;
  tindak_lanjut: string;
  tenggat: string | null;
  versi: number;
  diubah_at: string;
};
type Kk = { id: number; nama_kk: string; idsubsls: string; hasil: string };
type Data = {
  kelompok: number;
  hari_ini: string;
  anggota: Anggota[];
  kuesioner: Record<ObjekKuesioner, Kuesioner | null>;
  lembar: Lembar[];
  bisa_isi: boolean;
  saya_akun_id: number;
  kk?: Kk[];
};

const HASIL_KK: Record<string, string> = { terdampak: "Terdampak", tidak_terdampak: "Tidak terdampak", tidak_ditemukan: "Tidak ditemukan" };
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const tglPendek = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
const KOTAK = "rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const SELECT = "h-[44px] w-full rounded-[12px] border border-[#CBD6E6] bg-white px-3 text-[14px] text-[#1B2B4B]";
const WARNA_NILAI: Record<NilaiSoal, string> = { 1: "border-[#13794B] bg-[#13794B] text-white", 2: "border-[#C98900] bg-[#C98900] text-white", 3: "border-[#B42329] bg-[#B42329] text-white" };
const WARNA_SKOR: Record<NilaiSoal, string> = { 1: "bg-[#E3F6EC] text-[#13794B]", 2: "bg-[#FFF4D6] text-[#8A6200]", 3: "bg-[#FDE8E8] text-[#B42329]" };
const WARNA_KATEGORI: Record<string, string> = { Baik: "bg-[#E3F6EC] text-[#13794B]", Cukup: "bg-[#FFF4D6] text-[#8A6200]", "Perlu pembinaan": "bg-[#FDE8E8] text-[#B42329]", "Belum dinilai": "bg-[#EEF2F7] text-[#5B6B84]" };
const IDENTITAS_KOSONG: Identitas = { kecamatan: "", nagari: "", sls: "", jenis_qc: "" };

export default function KorwilLembarQc({ kelompok }: { kelompok: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [objek, setObjek] = useState<ObjekKuesioner>("petugas");
  const [subjek, setSubjek] = useState<number | null>(null);
  const [kkId, setKkId] = useState<number | null>(null);
  const [kkDaftar, setKkDaftar] = useState<Kk[]>([]);
  const [tanggal, setTanggal] = useState("");
  const [diperiksa, setDiperiksa] = useState<Record<string, boolean>>({});
  const [jawab, setJawab] = useState<Record<string, string | number>>({});
  const [identitas, setIdentitas] = useState<Identitas>(IDENTITAS_KOSONG);
  const [catatan, setCatatan] = useState("");
  const [tindak, setTindak] = useState("");
  const [tenggat, setTenggat] = useState("");
  const [galatSoal, setGalatSoal] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState(false);
  const kkTertunda = useRef<number | null>(null);

  const muat = useCallback(
    async (ppl?: number | null) => {
      try {
        const r = await apiPortal<Data>(`/api/portal/qc/kuesioner?kelompok=${kelompok}${ppl ? `&ppl=${ppl}` : ""}`);
        setD(r);
        if (ppl) {
          setKkDaftar(r.kk ?? []);
          if (kkTertunda.current != null) {
            setKkId(kkTertunda.current);
            kkTertunda.current = null;
          }
        }
        setGalat(null);
      } catch (e) {
        if (e instanceof Error && e.message === "SESI_BERAKHIR") return;
        setGalat(pesanGalat(e));
      }
    },
    [kelompok],
  );

  // ganti kelompok: mulai dari awal
  useEffect(() => {
    setD(null);
    setSubjek(null);
    setKkId(null);
    setKkDaftar([]);
    setInfo(null);
    void muat();
  }, [kelompok, muat]);
  useEffect(() => {
    if (d && !tanggal) setTanggal(d.hari_ini);
  }, [d, tanggal]);

  // KK dipilih dari daftar PPL: ambil daftar saat PPL dipilih
  useEffect(() => {
    setKkId(null);
    setKkDaftar([]);
    if (objek === "kk" && subjek) void muat(subjek);
  }, [objek, subjek, muat]);

  const ku = d?.kuesioner[objek] ?? null;
  const struktur = ku?.struktur ?? null;
  const calon = useMemo(() => (d ? d.anggota.filter((a) => (objek === "kk" ? a.peran === "ppl" : a.akun_id !== d.saya_akun_id)) : []), [d, objek]);
  const peranSubjek = d?.anggota.find((a) => a.akun_id === subjek)?.peran ?? null;
  const ada = useMemo(() => {
    if (!d || !ku || !subjek || !tanggal) return null;
    return d.lembar.find((l) => l.objek === objek && l.versi === ku.versi && l.tanggal === tanggal && l.subjek_akun_id === subjek && (objek === "petugas" || l.kk_id === kkId) && l.pemeriksa_akun_id === d.saya_akun_id) ?? null;
  }, [d, ku, objek, subjek, kkId, tanggal]);
  const kunciAda = ada ? `${ada.id}:${ada.diubah_at}` : "baru";

  // isi formulir: dari lembar yang sudah ada, atau awal (aspek dicentang menurut peran petugas)
  useEffect(() => {
    if (!struktur) return;
    if (ada) {
      setDiperiksa({ ...diperiksaBawaan(struktur, null), ...(ada.jawaban.diperiksa ?? {}) });
      setJawab({ ...(ada.jawaban.jawab ?? {}) });
      setIdentitas({ ...IDENTITAS_KOSONG, ...ada.identitas });
      setCatatan(ada.catatan);
      setTindak(ada.tindak_lanjut);
      setTenggat(ada.tenggat ?? "");
    } else {
      setDiperiksa(diperiksaBawaan(struktur, objek === "kk" ? "ppl" : peranSubjek));
      setJawab({});
      setIdentitas(IDENTITAS_KOSONG);
      setCatatan("");
      setTindak("");
      setTenggat("");
    }
    setGalatSoal({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objek, subjek, kkId, tanggal, kunciAda, struktur]);

  const siap = !!d && !!ku && !!subjek && !!tanggal && (objek === "petugas" || !!kkId);
  const hasil = useMemo(() => (struktur ? periksaJawaban(struktur, { diperiksa, jawab }) : null), [struktur, diperiksa, jawab]);
  const kes = hasil?.kesimpulan ?? null;

  async function simpan() {
    if (!d || !struktur || !siap || !hasil) return;
    setGalatSoal(hasil.galat);
    if (Object.keys(hasil.galat).length > 0) {
      setGalat(hasil.galat["_"] ?? "Ada jawaban yang belum benar. Periksa yang berwarna merah.");
      return;
    }
    setSibuk(true);
    setGalat(null);
    setInfo(null);
    try {
      await apiPortal(`/api/portal/qc/kuesioner`, {
        method: "POST",
        body: JSON.stringify({ kelompok, objek, tanggal, subjek_akun_id: subjek, kk_id: objek === "kk" ? kkId : null, jawaban: hasil.jawaban, identitas, catatan, tindak_lanjut: tindak, tenggat: tenggat || null }),
      });
      setInfo(ada ? "Lembar diperbarui." : "Lembar tersimpan.");
      await muat(objek === "kk" ? subjek : null);
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  function bukaLembar(l: Lembar) {
    setObjek(l.objek);
    setTanggal(l.tanggal);
    setSubjek(l.subjek_akun_id);
    if (l.objek === "kk") {
      // PPL sama: daftar KK sudah ada, pilih langsung; PPL lain: pilih KK setelah daftarnya selesai dimuat (lihat muat)
      if (objek === "kk" && l.subjek_akun_id === subjek) setKkId(l.kk_id);
      else kkTertunda.current = l.kk_id;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!d) {
    return galat ? (
      <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>
    ) : (
      <div className={KOTAK} aria-busy="true">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-24 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    );
  }

  const nonaktif = !d.bisa_isi;
  return (
    <div className="space-y-3">
      {galat && <p role="alert" className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
      {info && <p role="status" className="rounded-[14px] border-l-4 border-[#13794B] bg-[#E3F6EC] px-3 py-2 text-[13px] text-[#0F6340]">{info}</p>}
      {nonaktif && <p className="rounded-[14px] border-l-4 border-[#1F5FD1] bg-white px-3 py-2 text-[13px]">Anda dapat melihat saja. Mengisi lembar hanya untuk korwil kelompok ini atau admin pendataan.</p>}

      <section className={KOTAK}>
        <div role="group" aria-label="Objek pemeriksaan" className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-[#EEF2F7] p-1">
          {(
            [
              ["petugas", "Petugas"],
              ["kk", "Keluarga (KK)"],
            ] as [ObjekKuesioner, string][]
          ).map(([k, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={objek === k}
              onClick={() => {
                setObjek(k);
                setSubjek(null);
              }}
              className={`h-[44px] rounded-[11px] text-[13.5px] font-extrabold ${objek === k ? "bg-white text-[#0F2A52] shadow-sm" : "text-[#52627A]"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {!ku ? (
          <p className="mt-3 text-[13px] text-[#6B7A90]">Kuesioner {objek === "kk" ? "keluarga (KK)" : "petugas"} belum diunggah. Admin mengunggahnya di Kelola Pendataan, tab QC, Kuesioner supervisi.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            <p className="text-[11.5px] text-[#6B7A90]">
              {ku.judul || "Kuesioner quality check"} · versi {ku.versi} · {ku.struktur.aspek.length} aspek
            </p>
            <label className="block text-[12.5px] font-bold text-[#52627A]">
              {objek === "kk" ? "PPL pendata" : "Petugas yang diperiksa"}
              <select className={`${SELECT} mt-1`} value={subjek ?? ""} onChange={(e) => setSubjek(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Pilih…</option>
                {calon.map((a) => (
                  <option key={a.akun_id} value={a.akun_id}>
                    {namaSingkatTampil(a.nama)} · {a.peran.toUpperCase()}
                    {a.pml_nama ? ` (PML ${namaSingkatTampil(a.pml_nama)})` : ""}
                  </option>
                ))}
              </select>
            </label>
            {objek === "kk" && subjek && (
              <label className="block text-[12.5px] font-bold text-[#52627A]">
                Keluarga (KK) yang diperiksa
                <select className={`${SELECT} mt-1`} value={kkId ?? ""} onChange={(e) => setKkId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{kkDaftar.length ? "Pilih…" : "PPL ini belum punya KK terdata"}</option>
                  {kkDaftar.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kk} · {HASIL_KK[k.hasil] ?? k.hasil} · {k.idsubsls.slice(-6)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-[12.5px] font-bold text-[#52627A]">
              Tanggal QC
              <input type="date" className={`${SELECT} mt-1`} value={tanggal} max={d.hari_ini} onChange={(e) => setTanggal(e.target.value)} />
            </label>
            {siap && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["kecamatan", "Kecamatan"],
                    ["nagari", "Nagari"],
                    ["sls", "SLS / jorong"],
                    ["jenis_qc", "Jenis QC"],
                  ] as [keyof Identitas, string][]
                ).map(([k, t]) => (
                  <label key={k} className="block text-[12px] font-bold text-[#52627A]">
                    {t}
                    <input value={identitas[k]} disabled={nonaktif} maxLength={k === "sls" ? 120 : 80} onChange={(e) => setIdentitas((x) => ({ ...x, [k]: e.target.value }))} placeholder={k === "jenis_qc" ? "mis. QC awal" : ""} className="mt-1 h-[44px] w-full rounded-[12px] border border-[#CBD6E6] bg-white px-3 text-[14px] font-normal" />
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {siap && struktur && kes && (
        <>
          {struktur.aspek.map((a) => (
            <KartuAspek
              key={a.kode}
              a={a}
              periksa={diperiksa[a.kode] === true}
              skor={kes.aspek.find((x) => x.kode === a.kode)?.skor ?? null}
              jawab={jawab}
              galat={galatSoal}
              nonaktif={nonaktif}
              onPeriksa={(v) => setDiperiksa((x) => ({ ...x, [a.kode]: v }))}
              onUbah={(no, v) => setJawab((j) => ({ ...j, [no]: v }))}
            />
          ))}

          <section className={KOTAK}>
            <h3 className="mb-2 text-[14px] font-extrabold text-[#0F2A52]">Kesimpulan</h3>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {(
                [
                  ["Sesuai", kes.sesuai],
                  ["Perlu perbaikan", kes.perlu_perbaikan],
                  ["Tidak sesuai", kes.tidak_sesuai],
                  ["Diperiksa", kes.diperiksa],
                ] as [string, number][]
              ).map(([t, v]) => (
                <div key={t} className="rounded-[12px] bg-[#F5F8FE] px-1 py-2">
                  <b className="block text-[18px] text-[#0F2A52]">{v}</b>
                  <small className="text-[10.5px] leading-tight text-[#6B7A90]">{t}</small>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-bold text-[#52627A]">Kategori petugas</span>
              <span className={`rounded-[9px] px-2.5 py-1 text-[12.5px] font-extrabold ${WARNA_KATEGORI[kes.kategori]}`}>{kes.kategori}</span>
              {kes.qc_ulang && <span className="rounded-[9px] bg-[#FDE8E8] px-2.5 py-1 text-[12px] font-bold text-[#B42329]">QC ulang diperlukan (paling lambat 3 hari kerja)</span>}
              {!kes.lengkap && kes.diperiksa > 0 && <span className="text-[11.5px] text-[#8A6200]">Belum semua pertanyaan dijawab.</span>}
            </div>
            <div className="mt-3 space-y-2.5">
              <label className="block text-[12.5px] font-bold text-[#52627A]">
                Temuan utama
                <textarea rows={3} maxLength={2000} disabled={nonaktif} value={catatan} onChange={(e) => setCatatan(e.target.value)} className="mt-1 w-full rounded-[12px] border border-[#CBD6E6] bg-white px-3 py-2 text-[14px] font-normal" />
              </label>
              <label className="block text-[12.5px] font-bold text-[#52627A]">
                Tindak lanjut
                <textarea rows={3} maxLength={2000} disabled={nonaktif} value={tindak} onChange={(e) => setTindak(e.target.value)} className="mt-1 w-full rounded-[12px] border border-[#CBD6E6] bg-white px-3 py-2 text-[14px] font-normal" />
              </label>
              <label className="block text-[12.5px] font-bold text-[#52627A]">
                Tenggat tindak lanjut
                <input type="date" disabled={nonaktif} value={tenggat} onChange={(e) => setTenggat(e.target.value)} className={`${SELECT} mt-1 font-normal`} />
              </label>
              {!nonaktif && (
                <button type="button" disabled={sibuk} onClick={() => void simpan()} className="h-[48px] w-full rounded-[14px] bg-[#1F5FD1] text-[14.5px] font-extrabold text-white active:bg-[#1A4FB8] disabled:opacity-50">
                  {sibuk ? "Menyimpan…" : ada ? "Perbarui lembar" : "Simpan lembar"}
                </button>
              )}
              {ada && <p className="text-[11.5px] text-[#1F5FD1]">Lembar ini sudah Anda isi ({tglPendek(ada.diubah_at.slice(0, 10))}). Menyimpan akan memperbaruinya.</p>}
            </div>
          </section>
        </>
      )}

      <section className={KOTAK}>
        <h3 className="mb-2 text-[14px] font-extrabold text-[#0F2A52]">Lembar kelompok {kelompok}</h3>
        {d.lembar.length === 0 ? (
          <p className="text-[13px] text-[#6B7A90]">Belum ada lembar yang diisi.</p>
        ) : (
          <ul className="divide-y divide-[#EEF2F7]">
            {d.lembar.slice(0, 60).map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => bukaLembar(l)} className="flex min-h-[52px] w-full flex-col items-start justify-center gap-0.5 py-2 text-left">
                  <span className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold text-[#1B2B4B]">
                    {l.objek === "kk" ? `KK ${l.kk_nama ?? ""}` : "Petugas"} · {l.subjek_nama ? namaSingkatTampil(l.subjek_nama) : "-"}
                    {l.ringkas.kategori && <span className={`rounded-[8px] px-1.5 py-0.5 text-[11px] font-extrabold ${WARNA_KATEGORI[l.ringkas.kategori] ?? ""}`}>{l.ringkas.kategori}</span>}
                  </span>
                  <span className="text-[11.5px] text-[#6B7A90]">
                    {tglPendek(l.tanggal)} · oleh {namaSingkatTampil(l.pemeriksa_nama)}
                    {l.ringkas.diperiksa != null ? ` · ${l.ringkas.diperiksa} aspek (${l.ringkas.sesuai ?? 0}/${l.ringkas.perlu_perbaikan ?? 0}/${l.ringkas.tidak_sesuai ?? 0})` : ""}
                    {l.ringkas.lengkap === false ? " · belum lengkap" : ""} · versi {l.versi}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KartuAspek({ a, periksa, skor, jawab, galat, nonaktif, onPeriksa, onUbah }: { a: AspekKuesioner; periksa: boolean; skor: NilaiSoal | null; jawab: Record<string, string | number>; galat: Record<string, string>; nonaktif: boolean; onPeriksa: (v: boolean) => void; onUbah: (no: string, v: string | number) => void }) {
  return (
    <section className={KOTAK}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-extrabold leading-tight text-[#0F2A52]">
            {a.kode} · {a.judul}
          </h3>
          <p className="text-[11.5px] text-[#6B7A90]">Untuk: {a.untuk || "PML & PPL"}</p>
        </div>
        {periksa && skor && <span className={`rounded-[9px] px-2 py-1 text-[11.5px] font-extrabold ${WARNA_SKOR[skor]}`}>{skor} · {LABEL_SKOR[skor]}</span>}
        <div role="group" aria-label={`Diperiksa ${a.kode}`} className="flex gap-1">
          {([true, false] as const).map((v) => (
            <button key={String(v)} type="button" disabled={nonaktif} aria-pressed={periksa === v} onClick={() => onPeriksa(v)} className={`h-[40px] rounded-[10px] border px-3 text-[12.5px] font-bold ${periksa === v ? "border-[#0F2A52] bg-[#0F2A52] text-white" : "border-[#CBD6E6] bg-white text-[#52627A]"}`}>
              {v ? "Diperiksa" : "Tidak"}
            </button>
          ))}
        </div>
      </div>
      {periksa && (
        <>
          {skor && a.kriteria[skor - 1] && <p className="mt-1.5 text-[11.5px] italic text-[#6B7A90]">{a.kriteria[skor - 1]}</p>}
          <div className="mt-3 space-y-3">
            {a.soal.map((s) => (
              <Pertanyaan key={s.no} s={s} nilai={jawab[s.no]} galat={galat[s.no]} nonaktif={nonaktif} onUbah={(v) => onUbah(s.no, v)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const JENIS_TEKS = { T: "Tanya", O: "Observasi", N: "Angka" } as const;

function Pertanyaan({ s, nilai, galat, nonaktif, onUbah }: { s: SoalKuesioner; nilai: string | number | null | undefined; galat?: string; nonaktif: boolean; onUbah: (v: string | number) => void }) {
  return (
    <div className={`rounded-[14px] border p-2.5 ${galat ? "border-[#B42329] bg-[#FFF6F6]" : "border-[#E6EDF8]"}`}>
      <p className="text-[13.5px] font-semibold text-[#1B2B4B]">
        <span className="text-[#6B7A90]">{s.no}</span> <span className="rounded bg-[#EEF2F7] px-1 text-[10.5px] font-bold text-[#5B6B84]">{JENIS_TEKS[s.jenis]}</span> {s.teks}
      </p>
      {s.kunci && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11.5px] font-bold text-[#13794B]">Lihat kunci jawaban</summary>
          <p className="mt-0.5 rounded-lg bg-[#E3F6EC] px-2 py-1 text-[12px] text-[#0F6340]">{s.kunci}</p>
        </details>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.jenis === "N" ? (
          <input type="number" inputMode="decimal" min={0} disabled={nonaktif} value={nilai == null ? "" : String(nilai)} onChange={(e) => onUbah(e.target.value)} className="h-[44px] w-full rounded-[12px] border border-[#CBD6E6] px-3 text-[14px]" />
        ) : (
          s.opsi.map((o) => (
            <button key={o.teks} type="button" disabled={nonaktif} aria-pressed={nilai === o.teks} onClick={() => onUbah(o.teks)} className={`min-h-[44px] flex-1 rounded-[12px] border px-3 text-[13px] font-bold ${nilai === o.teks ? WARNA_NILAI[o.nilai] : "border-[#CBD6E6] bg-white text-[#1B2B4B]"}`}>
              {o.teks}
            </button>
          ))
        )}
      </div>
      {galat && <p className="mt-1 text-[11.5px] font-bold text-[#B42329]">{galat}</p>}
    </div>
  );
}
