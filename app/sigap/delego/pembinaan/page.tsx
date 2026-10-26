"use client";

// app/sigap/delego/pembinaan/page.tsx
//
// (26 Okt 2026) Pembinaan, skor, dan penghargaan. Sistem hanya menyarankan langkah tangga; pemberi yang memutuskan dan mencatat.
// Langkah 5 (rujuk ke pejabat berwenang) tidak pernah disarankan otomatis dan hanya mencatat (cek aturan).
// Query: ?penerima=AKUN&ro=KODE&delegasi=ID membuka formulir pembinaan dengan isian awal.

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  hariTanpaLapor, ringkasHariIni, saranPembinaan, skorPenerima, statusLaporanHariIni, tglPendek, TANGGA_PEMBINAAN, tambahHari, BOBOT_SKOR,
} from "@/lib/delego/hitung";
import type { BahanTim, BobotSkor, Delegasi } from "@/lib/delego/tipe";
import { useBahan, useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { PilihRo, saringRo, useFilterRo } from "../tim";
import { Batang, Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat, fmt } from "../ui";

type Tab = "pembinaan" | "skor" | "penghargaan";
type Orang = { akun: number; nama: string; jenis: string; ro: string[]; delegasi: Delegasi[] };

function susunOrang(delegasi: Delegasi[]): Orang[] {
  const peta = new Map<number, Orang>();
  for (const d of delegasi) {
    if (d.status === "batal") continue;
    const o = peta.get(d.penerima_akun) ?? { akun: d.penerima_akun, nama: d.penerima_nama, jenis: d.penerima_jenis, ro: [], delegasi: [] };
    if (!o.ro.includes(d.ro_kode)) o.ro.push(d.ro_kode);
    o.delegasi.push(d);
    peta.set(d.penerima_akun, o);
  }
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama));
}

export default function Pembinaan() {
  const { hari, jam, bolehBeri, hak, muatHak } = useKonteksDelego();
  const bobot = hak.bobot ?? BOBOT_SKOR;
  const q = useSearchParams();
  const f = useFilterRo();
  const b = useBahan();
  const kirim = useKirim(b.muat);
  const [tab, setTab] = useState<Tab>("pembinaan");

  // formulir pembinaan
  const [penerima, setPenerima] = useState("");
  const [roForm, setRoForm] = useState("");
  const [langkah, setLangkah] = useState(1);
  const [alasan, setAlasan] = useState("");
  const [tinjau, setTinjau] = useState("");
  const [delegasiForm, setDelegasiForm] = useState("");
  const [formBuka, setFormBuka] = useState(false);

  useEffect(() => {
    const p = q?.get("penerima");
    if (p && /^\d+$/.test(p)) {
      setPenerima(p);
      setRoForm(q?.get("ro") ?? "");
      setDelegasiForm(q?.get("delegasi") ?? "");
      setFormBuka(true);
    }
  }, [q]);

  const delegasi = saringRo(b.data, f.ro);
  const orang = useMemo(() => susunOrang(delegasi), [delegasi]);
  const data: BahanTim | null = b.data;

  const baris = useMemo(
    () =>
      orang.map((o) => {
        const aktif = o.delegasi.filter((d) => d.status === "baru" || d.status === "berjalan");
        const hutang = aktif.reduce((s, d) => s + ringkasHariIni(d, data?.laporan ?? [], hari).hutangKemarin, 0);
        const tanpa = aktif.reduce((m, d) => Math.max(m, hariTanpaLapor(d, data?.laporan ?? [], hari)), 0);
        const lewat = aktif.some((d) => statusLaporanHariIni(d, data?.laporan ?? [], hari, jam) === "perlu_pengingat");
        const berjalan = (data?.pembinaan ?? []).filter((p) => p.penerima_akun === o.akun && p.status === "berjalan");
        const terakhir = berjalan.reduce<number | null>((m, p) => (m === null || p.langkah > m ? p.langkah : m), null);
        const saran = saranPembinaan({ hutang, hariTanpaLapor: tanpa, belumLaporLewatPengingat: lewat, langkahTerakhir: terakhir });
        const skor = skorPenerima(o.delegasi, data?.laporan ?? [], (data?.penilaian ?? []).filter((n) => n.penerima_akun === o.akun), hari, bobot);
        return { o, hutang, tanpa, terakhir, saran, skor, berjalan };
      }),
    [orang, data, hari, jam, bobot],
  );

  const bukaForm = (akun: number, ro: string, lk?: number, al?: string) => {
    setPenerima(String(akun));
    setRoForm(ro);
    if (lk) setLangkah(lk);
    if (al) setAlasan(al);
    setFormBuka(true);
    setTab("pembinaan");
  };

  const catat = async () => {
    const ok = await kirim.kirim("keu_dlg_bina", {
      p_penerima: Number(penerima), p_ro: roForm, p_langkah: langkah, p_alasan: alasan.trim(),
      ...(tinjau ? { p_tinjau: tinjau } : {}), ...(delegasiForm ? { p_delegasi: Number(delegasiForm) } : {}),
    });
    if (ok) {
      setAlasan(""); setTinjau(""); setDelegasiForm(""); setFormBuka(false);
    }
  };

  const orangForm = orang.find((o) => String(o.akun) === penerima);
  const roPilihan = (orangForm?.ro ?? []).filter((r) => bolehBeri(r));
  const delegasiPilihan = (orangForm?.delegasi ?? []).filter((d) => d.ro_kode === roForm);

  return (
    <Halaman judul="Pembinaan dan skor" sub="Sistem menyarankan; pemberi delegasi yang memutuskan dan mencatat" kanan={<PilihRo {...f} />}>
      <div role="tablist" aria-label="Bagian" className="flex gap-1 rounded-xl bg-[#E3F0EE] p-1">
        {([["pembinaan", "Pembinaan"], ["skor", "Skor"], ["penghargaan", "Penghargaan"]] as const).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-[40px] flex-1 rounded-lg px-3 text-[14px] font-semibold ${tab === k ? "bg-white text-[#0B524C] shadow-sm" : "text-[#33404B]"}`}>
            {t}
          </button>
        ))}
      </div>
      {b.memuat && !b.data && <Memuat />}
      {b.galat && !b.data && <Galat>{b.galat}</Galat>}

      {data && tab === "pembinaan" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Kartu judul="Tangga pembinaan">
              <ol className="m-0 list-none space-y-1.5 p-0 text-[13.5px]">
                {TANGGA_PEMBINAAN.map((t) => (
                  <li key={t.langkah}><b>{t.langkah}. {t.nama}.</b> <span className="text-[#3B4A57]">{t.ket}</span></li>
                ))}
              </ol>
            </Kartu>
            <Kartu judul={`Penerima (${baris.length})`}>
              {baris.length === 0 && <Kosong>Belum ada penerima delegasi.</Kosong>}
              <ul className="m-0 list-none divide-y divide-[#EEF1F4] p-0">
                {baris.map(({ o, hutang, tanpa, terakhir, saran, berjalan }) => (
                  <li key={o.akun} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-semibold">{o.nama}{o.jenis === "mitra" && <span className="text-[12.5px] font-normal text-[#3B4A57]"> · mitra</span>}</div>
                        <div className="text-[12.5px] text-[#3B4A57]">Hutang {fmt(Math.round(hutang))} poin · {tanpa} hari kerja tanpa laporan{terakhir ? ` · langkah ${terakhir} berjalan` : ""}</div>
                      </div>
                      {saran && o.ro.some((r) => bolehBeri(r)) ? (
                        <button type="button" className={KELAS.tombolKecilUtama} onClick={() => bukaForm(o.akun, o.ro.find((r) => bolehBeri(r)) ?? o.ro[0], saran.langkah, saran.alasan)}>
                          Saran: langkah {saran.langkah}
                        </button>
                      ) : o.ro.some((r) => bolehBeri(r)) ? (
                        <button type="button" className={KELAS.tombolKecil} onClick={() => bukaForm(o.akun, o.ro.find((r) => bolehBeri(r)) ?? o.ro[0])}>Catat pembinaan</button>
                      ) : null}
                    </div>
                    {saran && <p className="m-0 text-[12.5px] text-[#6B3A04]">Alasan saran: {saran.alasan}</p>}
                    {berjalan.map((p) => (
                      <TutupBaris key={p.id} id={p.id} langkah={p.langkah} alasan={p.alasan} tinjau={p.tinjau} tanggal={p.dibuat_at} boleh={bolehBeri(p.ro_kode)} muat={b.muat} />
                    ))}
                  </li>
                ))}
              </ul>
            </Kartu>
          </div>

          <div className="space-y-4">
            {formBuka && (
              <Kartu judul="Catat pembinaan">
                <div className="space-y-3">
                  <Medan label="Penerima">
                    <select className={KELAS.isian} value={penerima} onChange={(e) => { setPenerima(e.target.value); setRoForm(""); setDelegasiForm(""); }}>
                      <option value="">Pilih penerima</option>
                      {orang.filter((o) => o.ro.some((r) => bolehBeri(r))).map((o) => <option key={o.akun} value={o.akun}>{o.nama}</option>)}
                    </select>
                  </Medan>
                  <Medan label="RO">
                    <select className={KELAS.isian} value={roForm} onChange={(e) => { setRoForm(e.target.value); setDelegasiForm(""); }}>
                      <option value="">Pilih RO</option>
                      {roPilihan.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Medan>
                  <Medan label="Langkah">
                    <select className={KELAS.isian} value={langkah} onChange={(e) => setLangkah(Number(e.target.value))}>
                      {TANGGA_PEMBINAAN.map((t) => <option key={t.langkah} value={t.langkah}>{t.langkah}. {t.nama}</option>)}
                    </select>
                  </Medan>
                  {langkah === 5 && <Info>Langkah ini hanya mencatat rujukan. Tindak lanjut formal oleh pejabat berwenang (cek aturan).</Info>}
                  <Medan label="Delegasi terkait (opsional)">
                    <select className={KELAS.isian} value={delegasiForm} onChange={(e) => setDelegasiForm(e.target.value)} disabled={!roForm}>
                      <option value="">Tidak spesifik</option>
                      {delegasiPilihan.map((d) => <option key={d.id} value={d.id}>{d.judul}</option>)}
                    </select>
                  </Medan>
                  <Medan label="Alasan dan kesepakatan" bantu="5 sampai 500 huruf">
                    <textarea className={KELAS.isian} rows={4} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} />
                  </Medan>
                  <Medan label="Tinjau ulang (opsional)">
                    <input type="date" className={KELAS.isian} min={hari} value={tinjau} onChange={(e) => setTinjau(e.target.value)} />
                  </Medan>
                  {kirim.galat && <Galat>{kirim.galat}</Galat>}
                  <div className="flex gap-2">
                    <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || !penerima || !roForm || alasan.trim().length < 5} onClick={() => void catat()}>{kirim.mengirim ? "Menyimpan..." : "Catat"}</button>
                    <button type="button" className={KELAS.tombolSekunder} onClick={() => { setFormBuka(false); kirim.hapusGalat(); }}>Tutup</button>
                  </div>
                </div>
              </Kartu>
            )}
            <Kartu judul="Riwayat pembinaan">
              {data.pembinaan.length === 0 ? (
                <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada catatan.</p>
              ) : (
                <ul className="m-0 list-none space-y-2.5 p-0 text-[13.5px]">
                  {data.pembinaan.filter((p) => !f.ro || p.ro_kode === f.ro).slice(0, 20).map((p) => (
                    <li key={p.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{p.penerima_nama}</b>
                        <Lencana nada={p.status === "berjalan" ? "amber" : p.status === "selesai" ? "hijau" : "abu"}>Langkah {p.langkah} · {p.status}</Lencana>
                      </div>
                      <div className="text-[#33404B]">{p.alasan}</div>
                      <div className="text-[12px] text-[#3B4A57]">{tglPendek(p.dibuat_at.slice(0, 10))}{p.dicatat_nama ? ` oleh ${p.dicatat_nama}` : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
          </div>
        </div>
      )}

      {data && tab === "skor" && <TabSkor baris={baris} data={data} hari={hari} muat={b.muat} bolehBeri={bolehBeri} bobot={bobot} bisaUbahBobot={hak.semua} muatHak={muatHak} />}
      {data && tab === "penghargaan" && <TabHargai orang={orang} data={data} roFilter={f.ro} bolehBeri={bolehBeri} muat={b.muat} />}
    </Halaman>
  );
}

function TutupBaris({ id, langkah, alasan, tinjau, tanggal, boleh, muat }: { id: number; langkah: number; alasan: string; tinjau: string | null; tanggal: string; boleh: boolean; muat: () => Promise<void> }) {
  const kirim = useKirim(muat);
  const [buka, setBuka] = useState(false);
  const [catatan, setCatatan] = useState("");
  const tutup = (status: "selesai" | "dibatalkan") => kirim.kirim("keu_dlg_bina_tutup", { p_id: id, p_status: status, p_catatan: catatan.trim() });
  return (
    <div className="rounded-lg bg-[#F1F7F6] p-2.5 text-[13px]">
      <div><b>Langkah {langkah} berjalan</b> sejak {tglPendek(tanggal.slice(0, 10))}{tinjau ? ` · tinjau ${tglPendek(tinjau)}` : ""}</div>
      <div className="text-[#33404B]">{alasan}</div>
      {boleh && !buka && <button type="button" className={`${KELAS.tombolKecil} mt-2`} onClick={() => setBuka(true)}>Tutup catatan</button>}
      {boleh && buka && (
        <div className="mt-2 space-y-2">
          <textarea className={KELAS.isian} rows={2} maxLength={300} placeholder="Catatan penutup (opsional)" aria-label="Catatan penutup" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          {kirim.galat && <Galat>{kirim.galat}</Galat>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim} onClick={() => void tutup("selesai")}>Selesai, membaik</button>
            <button type="button" className={KELAS.tombolKecil} disabled={kirim.mengirim} onClick={() => void tutup("dibatalkan")}>Batalkan catatan</button>
            <button type="button" className={KELAS.tombolKecil} onClick={() => setBuka(false)}>Lipat</button>
          </div>
        </div>
      )}
    </div>
  );
}

type BarisSkor = { o: Orang; skor: ReturnType<typeof skorPenerima> };

function TabSkor({ baris, data, hari, muat, bolehBeri, bobot, bisaUbahBobot, muatHak }: { baris: BarisSkor[]; data: BahanTim; hari: string; muat: () => Promise<void>; bolehBeri: (r: string) => boolean; bobot: BobotSkor; bisaUbahBobot: boolean; muatHak: () => Promise<void> }) {
  const kirim = useKirim(muat);
  const [pilih, setPilih] = useState<{ akun: number; ro: string } | null>(null);
  const [kualitas, setKualitas] = useState("80");
  const [kepatuhan, setKepatuhan] = useState("80");
  const [catatan, setCatatan] = useState("");
  const periode = `${hari.slice(0, 7)}-01`;
  const simpan = async () => {
    if (!pilih) return;
    const ok = await kirim.kirim("keu_dlg_nilai", { p_penerima: pilih.akun, p_ro: pilih.ro, p_periode: periode, p_kualitas: Number(kualitas), p_kepatuhan: Number(kepatuhan), p_catatan: catatan.trim() });
    if (ok) { setPilih(null); setCatatan(""); }
  };
  const awal = tambahHari(hari, -34);
  return (
    <div className="space-y-4">
      <Info>Skor adalah bahan percakapan, bukan penilaian resmi. Dihitung dari laporan {tglPendek(awal)} sampai kemarin; kualitas dan kepatuhan dari penilaian bulanan pemberi. Terlihat oleh yang berwenang pada RO terkait (Ketua Tim, ADMINRO, PPK, KPA). Bobot diatur Ketua Tim di kartu di bawah (awal sama rata, cek aturan).</Info>
      <KartuBobot bobot={bobot} bisaUbah={bisaUbahBobot} muatHak={muatHak} />
      {baris.length === 0 && <Kosong>Belum ada penerima delegasi.</Kosong>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {baris.map(({ o, skor }) => (
          <Kartu key={o.akun} judul={o.nama} kanan={<span className="text-[22px] font-bold text-[#0B524C]">{skor.total === null ? "–" : skor.total}<span className="text-[12px] font-medium text-[#3B4A57]"> / 100</span></span>}>
            <div className="space-y-2">
              {skor.komponen.map((k) => (
                <div key={k.kode}>
                  <div className="flex justify-between text-[13px]"><span>{k.nama}</span><span className="font-semibold">{k.nilai === null ? "belum ada data" : `${k.nilai}%`}</span></div>
                  <Batang persen={k.nilai ?? 0} nada={k.nilai !== null && k.nilai < 60 ? "amber" : "hijau"} tinggi={6} />
                </div>
              ))}
            </div>
            {o.ro.filter((r) => bolehBeri(r)).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {o.ro.filter((r) => bolehBeri(r)).map((r) => (
                  <button key={r} type="button" className={KELAS.tombolKecil} onClick={() => setPilih({ akun: o.akun, ro: r })}>Nilai bulan ini · {r}</button>
                ))}
              </div>
            )}
            {pilih?.akun === o.akun && (
              <div className="mt-3 space-y-2 border-t border-[#E3E8EE] pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <Medan label="Kualitas data (0-100)"><input type="number" min={0} max={100} className={KELAS.isian} value={kualitas} onChange={(e) => setKualitas(e.target.value)} /></Medan>
                  <Medan label="Kepatuhan (0-100)"><input type="number" min={0} max={100} className={KELAS.isian} value={kepatuhan} onChange={(e) => setKepatuhan(e.target.value)} /></Medan>
                </div>
                <textarea className={KELAS.isian} rows={2} maxLength={300} placeholder="Catatan (opsional)" aria-label="Catatan penilaian" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
                {kirim.galat && <Galat>{kirim.galat}</Galat>}
                <div className="flex gap-2">
                  <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim} onClick={() => void simpan()}>Simpan penilaian {pilih.ro}</button>
                  <button type="button" className={KELAS.tombolSekunder} onClick={() => setPilih(null)}>Batal</button>
                </div>
              </div>
            )}
          </Kartu>
        ))}
      </div>
      {data.penilaian.length === 0 && <p className="m-0 text-[12.5px] text-[#3B4A57]">Belum ada penilaian bulanan; skor memakai komponen yang datanya sudah ada.</p>}
    </div>
  );
}

function KartuBobot({ bobot, bisaUbah, muatHak }: { bobot: BobotSkor; bisaUbah: boolean; muatHak: () => Promise<void> }) {
  const kirim = useKirim(muatHak);
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState({ ketepatan: String(bobot.ketepatan), capaian: String(bobot.capaian), kualitas: String(bobot.kualitas), kepatuhan: String(bobot.kepatuhan) });
  const jumlah = (Object.values(isi) as string[]).reduce((s, v) => s + (Number(v) || 0), 0);
  const NAMA: Record<keyof BobotSkor, string> = { ketepatan: "Ketepatan lapor", capaian: "Capaian terhadap target", kualitas: "Kualitas data", kepatuhan: "Kepatuhan prosedur" };
  const simpan = async () => {
    const ok = await kirim.kirim("keu_dlg_bobot_atur", { p_data: { ketepatan: Number(isi.ketepatan), capaian: Number(isi.capaian), kualitas: Number(isi.kualitas), kepatuhan: Number(isi.kepatuhan) } });
    if (ok) setBuka(false);
  };
  return (
    <Kartu
      judul="Bobot skor"
      kanan={bisaUbah && !buka ? <button type="button" className={KELAS.tombolKecil} onClick={() => { setIsi({ ketepatan: String(bobot.ketepatan), capaian: String(bobot.capaian), kualitas: String(bobot.kualitas), kepatuhan: String(bobot.kepatuhan) }); setBuka(true); }}>Ubah bobot</button> : undefined}
    >
      {!buka ? (
        <div className="grid grid-cols-2 gap-2 text-[13px] md:grid-cols-4">
          {(Object.keys(NAMA) as (keyof BobotSkor)[]).map((k) => (<div key={k}><div className="text-[#3B4A57]">{NAMA[k]}</div><b className="text-[18px] text-[#0B524C]">{bobot[k]}%</b></div>))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(Object.keys(NAMA) as (keyof BobotSkor)[]).map((k) => (
              <Medan key={k} label={NAMA[k]}><input type="number" min={0} max={100} className={KELAS.isian} value={isi[k]} onChange={(e) => setIsi({ ...isi, [k]: e.target.value })} /></Medan>
            ))}
          </div>
          <div className={`text-[13px] font-semibold ${jumlah === 100 ? "text-[#0B524C]" : "text-[#9B2C2C]"}`}>Jumlah {jumlah} dari 100{jumlah !== 100 ? " (harus tepat 100)" : ""}</div>
          {kirim.galat && <Galat>{kirim.galat}</Galat>}
          <div className="flex gap-2">
            <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || jumlah !== 100} onClick={() => void simpan()}>Simpan bobot</button>
            <button type="button" className={KELAS.tombolSekunder} onClick={() => setBuka(false)}>Batal</button>
          </div>
          <p className="m-0 text-[12px] text-[#3B4A57]">Berlaku untuk semua orang dan dihitung ulang seketika, termasuk skor masa lalu. Komponen yang belum ada datanya tetap dikeluarkan dan bobot sisanya dinormalkan.</p>
        </div>
      )}
    </Kartu>
  );
}

function TabHargai({ orang, data, roFilter, bolehBeri, muat }: { orang: Orang[]; data: BahanTim; roFilter: string; bolehBeri: (r: string) => boolean; muat: () => Promise<void> }) {
  const kirim = useKirim(muat);
  const [penerima, setPenerima] = useState("");
  const [ro, setRo] = useState("");
  const [alasan, setAlasan] = useState("");
  const o = orang.find((x) => String(x.akun) === penerima);
  const roPilihan = (o?.ro ?? []).filter((r) => bolehBeri(r));
  const catat = async () => {
    const ok = await kirim.kirim("keu_dlg_hargai", { p_penerima: Number(penerima), p_ro: ro, p_alasan: alasan.trim() });
    if (ok) { setAlasan(""); setPenerima(""); setRo(""); }
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Kartu judul="Penghargaan tercatat">
        {data.penghargaan.filter((h) => !roFilter || h.ro_kode === roFilter).length === 0 ? (
          <p className="m-0 text-[13.5px] text-[#3B4A57]">Belum ada penghargaan.</p>
        ) : (
          <ul className="m-0 list-none space-y-2.5 p-0 text-[13.5px]">
            {data.penghargaan.filter((h) => !roFilter || h.ro_kode === roFilter).slice(0, 30).map((h) => (
              <li key={h.id}><b>{h.penerima_nama}</b> · {tglPendek(h.dibuat_at.slice(0, 10))}<div className="text-[#33404B]">{h.alasan}</div></li>
            ))}
          </ul>
        )}
      </Kartu>
      <Kartu judul="Beri penghargaan">
        <div className="space-y-3">
          <Medan label="Penerima">
            <select className={KELAS.isian} value={penerima} onChange={(e) => { setPenerima(e.target.value); setRo(""); }}>
              <option value="">Pilih penerima</option>
              {orang.filter((x) => x.ro.some((r) => bolehBeri(r))).map((x) => <option key={x.akun} value={x.akun}>{x.nama}</option>)}
            </select>
          </Medan>
          <Medan label="RO">
            <select className={KELAS.isian} value={ro} onChange={(e) => setRo(e.target.value)}>
              <option value="">Pilih RO</option>
              {roPilihan.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Medan>
          <Medan label="Alasan" bantu="Penerima mendapat notifikasi"><textarea className={KELAS.isian} rows={3} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} /></Medan>
          {kirim.galat && <Galat>{kirim.galat}</Galat>}
          <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || !penerima || !ro || alasan.trim().length < 5} onClick={() => void catat()}>{kirim.mengirim ? "Menyimpan..." : "Catat penghargaan"}</button>
        </div>
      </Kartu>
    </div>
  );
}
