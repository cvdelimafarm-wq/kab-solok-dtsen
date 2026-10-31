"use client";

// app/sigap/kelola/anomali/page.tsx
//
// (31 Okt 2026) ANOMALI PETUGAS (admin): impor anomali dari Excel template SIGAP -> otomatis ditugaskan ke petugas untuk dikonfirmasi; antrean "perlu dicocokkan" untuk
// nama yang tidak ketemu/ambigu; rekap per petugas, per kode temuan, per sampel. Pilihan survei seperti Kelola Pendataan (?k=). API: /api/sigap/anomali. Logika: lib/sigapAnomali.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ambilRingkas, bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir, waktuWib, type KegiatanRingkas } from "../../admin/api";
import { BTN_G, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import Bingkai from "../../kontrak/Bingkai";
import PemilihSurvei, { namaSurvei } from "../pendataan/PemilihSurvei";
import { KEGIATAN_PENDATAAN, bacaKegiatanPendataan, urlKegiatanPendataan } from "@/lib/sigapPendataanTab";
import { LABEL_STATUS, labelPenyebab, petaBarisAnomali, templatAnomali, type HasilPetaAnomali, type RingkasTemuan, type StatusTemuan } from "@/lib/sigapAnomali";

const URL_API = "/api/sigap/anomali";

type Temuan = {
  id: number;
  batch_id: number;
  akun_id: number | null;
  pml_akun_id: number | null;
  petugas_nama: string;
  pml_nama: string;
  nama_asal: string;
  kode_temuan: string;
  id_sampel: string | null;
  periode: string | null;
  fase: string;
  keterangan: string | null;
  rincian: Record<string, string>;
  status: StatusTemuan;
  penyebab: string | null;
  catatan: string | null;
  dikonfirmasi_at: string | null;
};
type Usulan = { id: number; nama: string };
type PerluCocok = { nama_asal: string; jumlah: number; alasan: "ambigu" | "tidak_ketemu"; usulan: Usulan[] };
type Batch = { id: number; sumber: string; fase: string; periode: string | null; nama_berkas: string | null; total: number; cocok: number; perlu_cocok: number; duplikat: number; dibuat_at: string };
type Data = { kegiatan: { id: number; nama: string }; ringkas: RingkasTemuan; temuan: Temuan[]; perlu_cocok: PerluCocok[]; batch: Batch[] };

const NADA: Record<StatusTemuan, "ok" | "wait" | "bad"> = { dikonfirmasi: "ok", menunggu: "wait", perlu_cocok: "bad" };

export default function AnomaliAdmin() {
  const [kegId, setKegId] = useState<number>(KEGIATAN_PENDATAAN);
  const [daftar, setDaftar] = useState<KegiatanRingkas[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    const sinkron = () => setKegId(bacaKegiatanPendataan(new URLSearchParams(window.location.search).get("k")));
    sinkron();
    window.addEventListener("popstate", sinkron);
    return () => window.removeEventListener("popstate", sinkron);
  }, []);
  useEffect(() => {
    ambilRingkas()
      .then((r) => setDaftar(r.kegiatan))
      .catch(() => undefined);
  }, []);

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Data>(`${URL_API}?mode=admin&kegiatan=${kegId}`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) {
        setData(null);
        setGalat(pesanGalat(e));
      }
    }
  }, [kegId]);
  useEffect(() => {
    if (!bacaSesi()) return;
    setData(null);
    void muat();
  }, [muat]);

  const pilihKegiatan = (id: number) => {
    setKegId(id);
    window.history.replaceState(null, "", urlKegiatanPendataan(window.location.pathname, window.location.search, id));
  };
  const nama = namaSurvei(daftar, kegId);

  return (
    <Bingkai aktif="pendataan_kelola" kecil="SIGAP · Anomali Petugas" jejak={["Pelaksanaan", "Pendataan", "Anomali petugas"]} judul="Anomali Petugas" sub={`${nama} · impor anomali, antrean pencocokan nama, dan rekap konfirmasi petugas`}>
      <PemilihSurvei daftar={daftar} aktif={kegId} onPilih={pilihKegiatan} />
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!data && !galat && <Memuat />}
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <KartuAngka label="Temuan" nilai={data.ringkas.total} />
            <KartuAngka label="Menunggu konfirmasi" nilai={data.ringkas.menunggu} warna="#9A6200" />
            <KartuAngka label="Dikonfirmasi" nilai={data.ringkas.dikonfirmasi} warna="#1E7A4C" />
            <KartuAngka label="Perlu dicocokkan" nilai={data.ringkas.perlu_cocok} warna="#B42329" />
          </div>
          <KartuImpor kegiatanId={kegId} nama={nama} setelahImpor={muat} />
          {data.perlu_cocok.length > 0 && <KartuPerluCocok kegiatanId={kegId} daftar={data.perlu_cocok} setelah={muat} />}
          <KartuRekap temuan={data.temuan} />
          <KartuBatch batch={data.batch} />
        </div>
      )}
    </Bingkai>
  );
}

// ----------------------------------------------------------------------------------------------
function KartuImpor({ kegiatanId, nama, setelahImpor }: { kegiatanId: number; nama: string; setelahImpor: () => Promise<void> }) {
  const [sumber, setSumber] = useState("lain");
  const [fase, setFase] = useState("pra_pelatihan");
  const [periode, setPeriode] = useState("");
  const [berkas, setBerkas] = useState<string | null>(null);
  const [peta, setPeta] = useState<HasilPetaAnomali | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<string | null>(null);

  async function unduhTemplat() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(templatAnomali());
    ws["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Anomali");
    XLSX.writeFile(wb, "templat_anomali_petugas.xlsx");
  }

  async function pilih(f: File | undefined) {
    setGalat(null);
    setHasil(null);
    setPeta(null);
    setBerkas(null);
    if (!f) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const sheet = wb.SheetNames[0];
      if (!sheet) throw new Error("Berkas tidak punya lembar.");
      const baris = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet], { defval: "", raw: false });
      setBerkas(f.name);
      setPeta(petaBarisAnomali(baris, periode.trim() || undefined));
    } catch (e) {
      setGalat(`Berkas tidak bisa dibaca: ${pesanGalat(e)}`);
    }
  }

  async function impor() {
    if (!peta || peta.baris.length === 0) return;
    setSibuk(true);
    setGalat(null);
    try {
      const r = await fetchJson<{ total: number; baru: number; cocok: number; perlu_cocok: number; duplikat: number }>(URL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "impor", kegiatan_id: kegiatanId, sumber, fase, periode: periode.trim(), nama_berkas: berkas, baris: peta.baris }),
      });
      setHasil(`${r.baru} temuan baru: ${r.cocok} ditugaskan ke petugas, ${r.perlu_cocok} perlu dicocokkan${r.duplikat > 0 ? `; ${r.duplikat} dilewati karena sudah ada` : ""}.`);
      setPeta(null);
      setBerkas(null);
      await setelahImpor();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Kartu judul="Impor anomali" ket={`untuk ${nama} · template SIGAP baku`}>
      <p className="text-[12.5px] leading-snug text-[#55657D]">
        Excel hasil aplikasi lain (PANTAU, VSEN26.M, dan sebagainya) disesuaikan ke templat SIGAP: kolom <b>ID Anggota</b> (nama petugas atau ID akun), <b>Kode Temuan</b>, <b>ID Sampel</b>, <b>Periode</b>, <b>Keterangan</b>; kolom lain ikut tersimpan apa adanya.
        Setelah diunggah, temuan otomatis ditugaskan ke petugas yang namanya cocok untuk dikonfirmasi; nama yang tidak ketemu atau ambigu masuk antrean pencocokan di bawah. Mengunggah ulang berkas yang sama tidak menggandakan temuan.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#1B2B4B]">
          Sumber
          <select className={INPUT} value={sumber} onChange={(e) => setSumber(e.target.value)}>
            <option value="lain">Lainnya</option>
            <option value="pantau">PANTAU</option>
            <option value="vsen26m">VSEN26.M</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#1B2B4B]">
          Tahap
          <select className={INPUT} value={fase} onChange={(e) => setFase(e.target.value)}>
            <option value="pra_pelatihan">Pra pelatihan (anomali lama)</option>
            <option value="pemeriksaan">Pemeriksaan (survei berjalan)</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#1B2B4B]">
          Periode bawaan
          <input className={`${INPUT} w-[110px]`} value={periode} maxLength={40} placeholder="mis. 2026-09" onChange={(e) => setPeriode(e.target.value)} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={BTN_O} onClick={() => void unduhTemplat()}>
          Unduh templat Excel
        </button>
        <input type="file" accept=".xlsx,.xls,.csv" aria-label="Pilih berkas Excel anomali" className="text-[13px]" onChange={(e) => void pilih(e.target.files?.[0])} />
      </div>
      {berkas && peta && (
        <div className="mt-2.5 rounded-lg border border-[#DDE6F3] bg-[#F8FAFC] p-3 text-[13px] text-[#1B2B4B]">
          <p className="font-bold">
            {berkas}: {peta.baris.length} temuan siap diimpor
            {peta.galat.length > 0 ? `, ${peta.galat.length} baris bermasalah` : ""}
            {peta.dilewati > 0 ? `, ${peta.dilewati} baris kosong dilewati` : ""}.
          </p>
          {peta.kolomRincian.length > 0 && <p className="mt-1 text-[12.5px] text-[#55657D]">Kolom lain yang disimpan: {peta.kolomRincian.join(", ")}.</p>}
          {peta.galat.length > 0 && (
            <ul className="mt-1.5 max-h-36 list-disc space-y-0.5 overflow-y-auto pl-5 text-[12.5px] text-[#9B1C23]">
              {peta.galat.slice(0, 30).map((g) => (
                <li key={`${g.baris}-${g.pesan}`}>
                  {g.baris > 0 ? `Baris ${g.baris}: ` : ""}
                  {g.pesan}
                </li>
              ))}
              {peta.galat.length > 30 && <li>… dan {peta.galat.length - 30} lagi</li>}
            </ul>
          )}
          {peta.baris.length > 0 && peta.galat.length > 0 && <p className="mt-1.5 text-[12.5px] text-[#6B7A90]">Baris bermasalah tidak ikut diimpor. Perbaiki di Excel lalu pilih berkas lagi bila ingin semuanya masuk.</p>}
          <div className="mt-2 flex justify-end">
            <button type="button" className={BTN_G} disabled={sibuk || peta.baris.length === 0} onClick={impor}>
              {sibuk ? "Mengimpor…" : `Impor ${peta.baris.length} temuan`}
            </button>
          </div>
        </div>
      )}
      {galat && <p className="mt-2 text-[13px] font-bold text-[#B42329]">{galat}</p>}
      {hasil && (
        <div className="mt-2">
          <Pesan jenis="ok" onTutup={() => setHasil(null)}>{hasil}</Pesan>
        </div>
      )}
    </Kartu>
  );
}

// ----------------------------------------------------------------------------------------------
function KartuPerluCocok({ kegiatanId, daftar, setelah }: { kegiatanId: number; daftar: PerluCocok[]; setelah: () => Promise<void> }) {
  const [akun, setAkun] = useState<Usulan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    fetchJson<{ akun: Usulan[] }>(`${URL_API}?mode=akun&kegiatan=${kegiatanId}`)
      .then((r) => setAkun(r.akun))
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      });
  }, [kegiatanId]);
  return (
    <Kartu judul="Perlu dicocokkan" ket={`${daftar.length} nama · pilihan Anda diingat untuk impor berikutnya`}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      <ul className="divide-y divide-[#EDF0F4]">
        {daftar.map((d) => (
          <BarisCocok key={d.nama_asal} kegiatanId={kegiatanId} d={d} akun={akun} setelah={setelah} />
        ))}
      </ul>
    </Kartu>
  );
}

function BarisCocok({ kegiatanId, d, akun, setelah }: { kegiatanId: number; d: PerluCocok; akun: Usulan[] | null; setelah: () => Promise<void> }) {
  const [cari, setCari] = useState("");
  const [pilih, setPilih] = useState<number | "">("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const opsi = useMemo(() => {
    const c = cari.trim().toLowerCase();
    return (akun ?? []).filter((a) => c === "" || a.nama.toLowerCase().includes(c)).slice(0, 40);
  }, [akun, cari]);

  async function cocokkan(akunId: number) {
    setSibuk(true);
    setGalat(null);
    try {
      await fetchJson(URL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "cocokkan", kegiatan_id: kegiatanId, nama_asal: d.nama_asal, akun_id: akunId, simpan_alias: true }) });
      await setelah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[14px] text-[#14202E]">{d.nama_asal}</b>
        <Chip w={d.alasan === "ambigu" ? "wait" : "bad"}>{d.alasan === "ambigu" ? "lebih dari satu akun" : "tidak ketemu"}</Chip>
        <span className="text-[12.5px] text-[#6B7A90]">{d.jumlah} temuan</span>
      </div>
      {d.usulan.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="text-[12px] text-[#6B7A90]">Usulan:</span>
          {d.usulan.map((u) => (
            <button key={u.id} type="button" className={BTN_O} disabled={sibuk} onClick={() => void cocokkan(u.id)}>
              {u.nama}
            </button>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input className={`${INPUT} w-[160px]`} value={cari} placeholder="Cari akun…" onChange={(e) => setCari(e.target.value)} aria-label={`Cari akun untuk ${d.nama_asal}`} />
        <select className={`${INPUT} min-w-[200px]`} value={pilih} onChange={(e) => setPilih(e.target.value === "" ? "" : Number(e.target.value))} aria-label={`Pilih akun untuk ${d.nama_asal}`} disabled={!akun}>
          <option value="">{akun ? "Pilih akun…" : "Memuat akun…"}</option>
          {opsi.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nama} (#{a.id})
            </option>
          ))}
        </select>
        <button type="button" className={BTN_G} disabled={sibuk || pilih === ""} onClick={() => pilih !== "" && void cocokkan(pilih)}>
          {sibuk ? "Menyimpan…" : "Cocokkan"}
        </button>
      </div>
      {galat && <p className="mt-1 text-[12.5px] font-bold text-[#B42329]">{galat}</p>}
    </li>
  );
}

// ----------------------------------------------------------------------------------------------
type Lihat = "petugas" | "kode" | "sampel" | "daftar";
const LIHAT: { k: Lihat; label: string }[] = [
  { k: "petugas", label: "Per petugas" },
  { k: "kode", label: "Per kode temuan" },
  { k: "sampel", label: "Per sampel" },
  { k: "daftar", label: "Daftar temuan" },
];

function KartuRekap({ temuan }: { temuan: Temuan[] }) {
  const [lihat, setLihat] = useState<Lihat>("petugas");
  const [status, setStatus] = useState<"semua" | StatusTemuan>("semua");
  const [cari, setCari] = useState("");
  const t = useMemo(() => {
    const c = cari.trim().toLowerCase();
    return temuan.filter((x) => (status === "semua" || x.status === status) && (c === "" || `${x.petugas_nama} ${x.nama_asal} ${x.kode_temuan} ${x.id_sampel ?? ""}`.toLowerCase().includes(c)));
  }, [temuan, status, cari]);

  const kelompok = useMemo(() => {
    const kunci = (x: Temuan) => (lihat === "petugas" ? x.petugas_nama || `${x.nama_asal} (belum cocok)` : lihat === "kode" ? x.kode_temuan : x.id_sampel || "(tanpa id sampel)");
    const m = new Map<string, { n: number; menunggu: number; dikonfirmasi: number; ekstra: Set<string> }>();
    for (const x of t) {
      const k = kunci(x);
      const g = m.get(k) ?? { n: 0, menunggu: 0, dikonfirmasi: 0, ekstra: new Set<string>() };
      g.n++;
      if (x.status === "dikonfirmasi") g.dikonfirmasi++;
      else g.menunggu++;
      g.ekstra.add(lihat === "petugas" ? x.kode_temuan : lihat === "kode" ? x.petugas_nama || x.nama_asal : `${x.kode_temuan}`);
      m.set(k, g);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  }, [t, lihat]);

  return (
    <Kartu judul="Rekap temuan" ket={`${t.length} dari ${temuan.length} temuan`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {LIHAT.map((l) => (
          <button key={l.k} type="button" className={lihat === l.k ? BTN_G : BTN_O} onClick={() => setLihat(l.k)}>
            {l.label}
          </button>
        ))}
        <select className={`${INPUT} ml-auto`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter status">
          <option value="semua">Semua status</option>
          {(Object.keys(LABEL_STATUS) as StatusTemuan[]).map((s) => (
            <option key={s} value={s}>
              {LABEL_STATUS[s]}
            </option>
          ))}
        </select>
        <input className={`${INPUT} w-[160px]`} value={cari} placeholder="Cari…" onChange={(e) => setCari(e.target.value)} aria-label="Cari temuan" />
      </div>
      {t.length === 0 ? (
        <p className="text-[13px] text-[#7B8794]">Belum ada temuan yang cocok dengan filter.</p>
      ) : lihat === "daftar" ? (
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <th className={TH}>Petugas</th>
              <th className={TH}>Kode</th>
              <th className={TH}>Sampel</th>
              <th className={TH}>Periode</th>
              <th className={TH}>Status</th>
              <th className={TH}>Penyebab</th>
            </tr>
          </thead>
          <tbody>
            {t.slice(0, 300).map((x) => (
              <tr key={x.id}>
                <td className={`${TD} font-semibold`}>
                  {x.petugas_nama || x.nama_asal}
                  {x.pml_nama && <span className="block text-[11px] font-normal text-[#7B8794]">PML {x.pml_nama}</span>}
                </td>
                <td className={TD}>{x.kode_temuan}</td>
                <td className={TD}>{x.id_sampel ?? "–"}</td>
                <td className={TD}>{x.periode ?? "–"}</td>
                <td className={TD}>
                  <Chip w={NADA[x.status]}>{LABEL_STATUS[x.status]}</Chip>
                </td>
                <td className={TD} title={x.catatan ?? undefined}>
                  {labelPenyebab(x.penyebab) || "–"}
                  {x.dikonfirmasi_at && <span className="block text-[11px] text-[#7B8794]">{waktuWib(x.dikonfirmasi_at)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </TabelKartu>
      ) : (
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <th className={TH}>{lihat === "petugas" ? "Petugas" : lihat === "kode" ? "Kode temuan" : "Sampel"}</th>
              <th className={TH}>Temuan</th>
              <th className={TH}>Menunggu</th>
              <th className={TH}>Dikonfirmasi</th>
              <th className={TH}>{lihat === "petugas" ? "Kode" : lihat === "kode" ? "Petugas" : "Kode pada sampel ini"}</th>
            </tr>
          </thead>
          <tbody>
            {kelompok.slice(0, 300).map(([k, g]) => (
              <tr key={k}>
                <td className={`${TD} font-semibold`}>{k}</td>
                <td className={`${TD} tabular-nums`}>{g.n}</td>
                <td className={`${TD} tabular-nums`}>{g.menunggu}</td>
                <td className={`${TD} tabular-nums`}>{g.dikonfirmasi}</td>
                <td className={`${TD} text-[12px] text-[#55657D]`}>
                  {Array.from(g.ekstra).slice(0, 6).join(", ")}
                  {g.ekstra.size > 6 ? ` +${g.ekstra.size - 6}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </TabelKartu>
      )}
    </Kartu>
  );
}

function KartuBatch({ batch }: { batch: Batch[] }) {
  if (batch.length === 0) return null;
  return (
    <Kartu judul="Riwayat impor" ket={`${batch.length} terakhir`}>
      <TabelKartu className="!shadow-none">
        <thead>
          <tr>
            <th className={TH}>Waktu</th>
            <th className={TH}>Berkas</th>
            <th className={TH}>Sumber / tahap</th>
            <th className={TH}>Baris</th>
            <th className={TH}>Cocok</th>
            <th className={TH}>Perlu cocok</th>
            <th className={TH}>Dilewati</th>
          </tr>
        </thead>
        <tbody>
          {batch.map((b) => (
            <tr key={b.id}>
              <td className={TD}>{waktuWib(b.dibuat_at)}</td>
              <td className={TD}>{b.nama_berkas ?? "–"}</td>
              <td className={TD}>
                {b.sumber} · {b.fase === "pemeriksaan" ? "pemeriksaan" : "pra pelatihan"}
              </td>
              <td className={`${TD} tabular-nums`}>{b.total}</td>
              <td className={`${TD} tabular-nums`}>{b.cocok}</td>
              <td className={`${TD} tabular-nums`}>{b.perlu_cocok}</td>
              <td className={`${TD} tabular-nums`}>{b.duplikat}</td>
            </tr>
          ))}
        </tbody>
      </TabelKartu>
    </Kartu>
  );
}
