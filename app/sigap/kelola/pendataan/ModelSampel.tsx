"use client";

// app/sigap/kelola/pendataan/ModelSampel.tsx
//
// (8 Nov 2026, D1+D2) Pemilih MODEL SAMPEL per kegiatan di tab 1 · Persiapan Kelola Pendataan, menggantikan pemasangan langsung AlokasiWilayah:
//   Model 1 = KK dari master, alokasi per sub SLS (AlokasiWilayah, perilaku sekarang);
//   Model 2 = daftar objek sampel dari pusat per wilayah (satu tingkat wilayah per kegiatan);
//   Model 3 = daftar sampel tanpa wilayah (hanya beban per PPL dan relasi PML).
// Model 2/3 ditetapkan lewat PROFIL VARIABEL (centang variabel yang ada pada daftar sampel + label 5 kolom bebas); profil menentukan templat unggah. Sebelum migrasi
// 20261108a dijalankan, komponen ini hanya menampilkan AlokasiWilayah seperti biasa (tanpa pemilih).

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { API_OBJEK_ADMIN, KATALOG_VARIABEL, KUNCI_BEBAS, MAKS_LABEL_BEBAS, ringkasProfil, validasiProfil, type DataObjekAdmin, type KelompokVariabel, type KunciBebas, type KunciVariabel, type ProfilSampel } from "@/lib/sampelObjek";
import { BTN, BTN_O, Kartu, Memuat, Pesan } from "../../admin/ui";
import AlokasiWilayah from "./AlokasiWilayah";
import ObjekSampel from "./ObjekSampel";

type Info = { jenis: "ok" | "galat" | "info" | "peringatan"; teks: string };
type Model = 1 | 2 | 3;

export const PILIHAN_MODEL: Record<Model, { judul: string; ket: string }> = {
  1: { judul: "Model 1 · dari master KK", ket: "Alokasi per sub SLS; sampel dipilih dari kerangka KK master (tag utama dan cadangan)." },
  2: { judul: "Model 2 · daftar sampel per wilayah", ket: "Daftar objek sampel dari pusat, dipetakan ke satu tingkat wilayah (kecamatan, nagari, jorong/SLS, atau sub SLS)." },
  3: { judul: "Model 3 · daftar sampel tanpa wilayah", ket: "Daftar sampel atau jumlahnya per PPL saja; tanpa wilayah, hanya beban dan relasi PML." },
};

const KELOMPOK: { kunci: KelompokVariabel; judul: string }[] = [
  { kunci: "wilayah", judul: "Wilayah (tingkat terdalam yang dicentang menjadi tingkat wilayah kegiatan)" },
  { kunci: "identitas", judul: "Identitas sampel" },
  { kunci: "lokasi", judul: "Lokasi" },
  { kunci: "jumlah", judul: "Jumlah" },
  { kunci: "petugas", judul: "Petugas" },
];

const AWAL: Record<2 | 3, KunciVariabel[]> = {
  2: ["nagari", "sls", "nama_sampel", "ppl", "pml"],
  3: ["jumlah", "ppl", "pml"],
};

export default function ModelSampel({ kegiatanId, nama }: { kegiatanId: number; nama: string }) {
  const [data, setData] = useState<DataObjekAdmin | null>(null);
  const [galatMuat, setGalatMuat] = useState(false);
  const [pilihan, setPilihan] = useState<Model | null>(null);
  const [variabel, setVariabel] = useState<KunciVariabel[]>([]);
  const [label, setLabel] = useState<Partial<Record<KunciBebas, string>>>({});
  const [sibuk, setSibuk] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [yakinKosong, setYakinKosong] = useState(false);

  const muat = useCallback(async () => {
    try {
      setData(await apiPortal<DataObjekAdmin>(`${API_OBJEK_ADMIN}?k=${kegiatanId}`));
      setGalatMuat(false);
    } catch {
      setGalatMuat(true);
    }
  }, [kegiatanId]);

  useEffect(() => {
    setData(null);
    setPilihan(null);
    setInfo(null);
    setYakinKosong(false);
    void muat();
  }, [muat]);

  const efektif: Model = pilihan ?? data?.model ?? 1;
  const kelola = data?.boleh_kelola === true && data.siap;
  const terpakai = (data?.rekap.objek ?? 0) > 0;

  // isi editor mengikuti model yang dipilih: profil tersimpan bila modelnya sama, selain itu bawaan
  useEffect(() => {
    if (efektif === 1) return;
    if (data?.profil && data.profil.model === efektif) {
      setVariabel([...data.profil.variabel]);
      setLabel({ ...data.profil.label_bebas });
    } else {
      setVariabel([...AWAL[efektif]]);
      setLabel({});
    }
  }, [efektif, data?.profil]);

  const profil: ProfilSampel | null = efektif === 1 ? null : { model: efektif, variabel, label_bebas: label };
  const masalah = useMemo(() => (profil ? validasiProfil(profil) : []), [profil]);
  const sama = !!profil && !!data?.profil && data.profil.model === profil.model && [...data.profil.variabel].sort().join() === [...profil.variabel].sort().join() && JSON.stringify(data.profil.label_bebas) === JSON.stringify(Object.fromEntries(Object.entries(label).filter(([k]) => variabel.includes(k as KunciVariabel))));

  function centang(k: KunciVariabel, nilai: boolean) {
    setVariabel((v) => (nilai ? (v.includes(k) ? v : [...v, k]) : v.filter((x) => x !== k)));
  }

  async function panggil(badan: Record<string, unknown>, sukses: string) {
    setSibuk(true);
    setInfo(null);
    try {
      await apiPortal(API_OBJEK_ADMIN, { method: "POST", body: JSON.stringify({ k: kegiatanId, ...badan }) });
      setInfo({ jenis: "ok", teks: sukses });
      setPilihan(null);
      setYakinKosong(false);
      await muat();
    } catch (e) {
      setInfo({ jenis: "galat", teks: e instanceof Error ? e.message : "Perubahan gagal disimpan." });
    } finally {
      setSibuk(false);
    }
  }

  // sebelum migrasi atau bila pemuatan gagal: perilaku lama (model 1 saja)
  if (galatMuat || (data && !data.siap)) return <AlokasiWilayah kegiatanId={kegiatanId} nama={nama} />;
  if (!data) return <Kartu judul="Model sampel"><Memuat /></Kartu>;

  return (
    <>
      <Kartu judul="Model sampel" ket={`Cara sampel ${nama} ditetapkan. Pilih sekali di awal; model tidak bisa diganti sesudah daftar sampel terunggah.`}>
        {info && <Pesan jenis={info.jenis}>{info.teks}</Pesan>}
        {!data.boleh_kelola && <Pesan jenis="info">Anda hanya dapat melihat; mengubah model memerlukan akses kelola.</Pesan>}
        {data.alokasi_model1_aktif && <Pesan jenis="info">Kegiatan ini sudah memakai alokasi model 1 (per sub SLS), sehingga model 2/3 tidak bisa dipilih.</Pesan>}

        <fieldset className="mt-2 grid gap-2 sm:grid-cols-3" disabled={!kelola || sibuk || terpakai || data.alokasi_model1_aktif}>
          {([1, 2, 3] as const).map((m) => (
            <label key={m} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-[12.5px] ${efektif === m ? "border-[#12305E] bg-[#F2F6FC]" : "border-[#DDE6F3] bg-white"}`}>
              <input type="radio" name={`model-sampel-${kegiatanId}`} className="mt-0.5 h-4 w-4 accent-[#12305E]" checked={efektif === m} onChange={() => setPilihan(m)} />
              <span>
                <b className="text-[#1B2B4B]">{PILIHAN_MODEL[m].judul}</b>
                <span className="mt-0.5 block text-[#55657D]">{PILIHAN_MODEL[m].ket}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {terpakai && (
          <div className="mt-2 text-[12.5px] text-[#55657D]">
            <p>
              Daftar sampel aktif: {data.rekap.objek} baris. Untuk mengganti model atau profil, kosongkan dahulu (riwayat dan hasil yang sudah tercatat tetap tersimpan).
            </p>
            {kelola && !yakinKosong && (
              <button type="button" className={`${BTN_O} mt-1.5`} disabled={sibuk} onClick={() => setYakinKosong(true)}>
                Kosongkan daftar sampel…
              </button>
            )}
            {kelola && yakinKosong && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#B42329]">Petugas tidak akan melihat sampel lagi sampai daftar baru diunggah. Lanjutkan?</span>
                <button type="button" className={BTN} disabled={sibuk} onClick={() => void panggil({ aksi: "kosongkan" }, "Daftar sampel dikosongkan.")}>
                  Ya, kosongkan
                </button>
                <button type="button" className={BTN_O} disabled={sibuk} onClick={() => setYakinKosong(false)}>
                  Batal
                </button>
              </div>
            )}
          </div>
        )}

        {efektif === 1 && data.model !== 1 && !terpakai && kelola && (
          <div className="mt-3">
            <Pesan jenis="info">Kembali ke model 1 menghapus profil variabel kegiatan ini.</Pesan>
            <button type="button" className={`${BTN} mt-1.5`} disabled={sibuk} onClick={() => void panggil({ aksi: "profil_hapus" }, "Kegiatan kembali memakai model 1.")}>
              Kembali ke model 1
            </button>
          </div>
        )}

        {profil && !terpakai && !data.alokasi_model1_aktif && (
          <div className="mt-3 rounded-xl border border-[#DDE6F3] p-3">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[#55657D]">Profil variabel · centang yang ada pada daftar sampel</p>
            <div className="mt-2 space-y-3">
              {KELOMPOK.map((g) => (
                <div key={g.kunci}>
                  <p className="text-[12px] font-semibold text-[#1B2B4B]">{g.judul}</p>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    {KATALOG_VARIABEL.filter((v) => v.kelompok === g.kunci).map((v) => (
                      <label key={v.kunci} className="flex items-start gap-2 text-[12.5px]">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#12305E]" disabled={!kelola || sibuk} checked={variabel.includes(v.kunci)} onChange={(e) => centang(v.kunci, e.target.checked)} />
                        <span>
                          <b className="text-[#1B2B4B]">{v.label}</b> <span className="text-[#6B7A90]">· {v.ket}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <p className="text-[12px] font-semibold text-[#1B2B4B]">Kolom bebas (teks, maksimal 5; beri label)</p>
                <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                  {KUNCI_BEBAS.map((b) => (
                    <div key={b} className="flex items-center gap-2 text-[12.5px]">
                      <input type="checkbox" className="h-4 w-4 accent-[#12305E]" disabled={!kelola || sibuk} checked={variabel.includes(b)} onChange={(e) => centang(b, e.target.checked)} aria-label={`Kolom bebas ${b.slice(5)}`} />
                      <input
                        type="text"
                        value={label[b] ?? ""}
                        maxLength={MAKS_LABEL_BEBAS}
                        placeholder={`Label kolom bebas ${b.slice(5)}`}
                        disabled={!kelola || sibuk || !variabel.includes(b)}
                        onChange={(e) => setLabel((l) => ({ ...l, [b]: e.target.value }))}
                        className="min-w-0 flex-1 rounded-md border border-[#CBD6E6] px-2 py-1 text-[12.5px] disabled:bg-[#F4F6FA]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {masalah.length > 0 ? (
              <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#B42329]">
                {masalah.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[12.5px] text-[#55657D]">{ringkasProfil(profil)}.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={BTN}
                disabled={!kelola || sibuk || masalah.length > 0 || sama}
                onClick={() => void panggil({ aksi: "profil", model: profil.model, variabel: profil.variabel, label_bebas: profil.label_bebas }, "Profil variabel tersimpan. Unduh templat lalu unggah daftar sampel.")}
              >
                {sibuk ? "Menyimpan…" : sama ? "Profil tersimpan" : "Simpan profil"}
              </button>
              {pilihan !== null && (
                <button type="button" className={BTN_O} disabled={sibuk} onClick={() => setPilihan(null)}>
                  Batal
                </button>
              )}
            </div>
          </div>
        )}
      </Kartu>

      {efektif === 1 && data.model === 1 && <AlokasiWilayah kegiatanId={kegiatanId} nama={nama} />}
      {data.profil && data.model === efektif && <ObjekSampel kegiatanId={kegiatanId} nama={nama} data={data} muat={muat} />}
    </>
  );
}
