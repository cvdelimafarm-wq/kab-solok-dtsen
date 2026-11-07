"use client";

// app/sigap/kelola/master/BatasShapefile.tsx
//
// (7 Nov 2026, tahap C2) Master > Batas wilayah: unggah shapefile (zip .shp/.dbf/.prj, atau GeoJSON) di BROWSER -- diurai, koordinat diubah ke WGS84, diperiksa, dan
// dibandingkan dengan versi yang sedang dipakai sebelum disimpan. Setelah disimpan sebagai versi baru (belum aktif), Ketua mengaktifkannya; versi lama tidak dihapus
// dan bisa diaktifkan kembali. Tanpa versi aktif aplikasi memakai berkas bawaan. Server memeriksa ulang isi (lib/portal/batasVersi.ts, SQL 20261107i).
// Logika murni: lib/batasUnggah.ts dan lib/batasBerkas.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { API_MASTER_BATAS } from "@/lib/masterWilayah";
import { JALUR_BATAS, NAMA_MANIFEST_BATAS, bacaBerkasBatas, bacaManifestBatas, type FiturBatas } from "@/lib/batasSubsls";
import { bandingkan, siapkanFitur, tebakKolom, type PilihanKolom, type TingkatMasalah } from "@/lib/batasUnggah";
import { bacaBerkasUnggahan, type HasilBaca } from "@/lib/batasBerkas";
import type { DataBatasVersi, VersiBatas } from "@/lib/portal/batasVersi";
import { BTN, BTN_G, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
/** 202611081530 -> "8 Nov 2026 15.30" */
const labelVersi = (v: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (!m) return v;
  const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${bln} ${m[1]} ${m[4]}.${m[5]}`;
};
const WARNA: Record<TingkatMasalah, "bad" | "wait" | "mut"> = { GALAT: "bad", PERINGATAN: "wait", INFO: "mut" };

/** Versi yang sedang dipakai aplikasi (sebagai pembanding): manifest + semua berkas kecamatan dari alamat yang sama dengan peta di HP. */
async function muatVersiBerjalan(): Promise<FiturBatas[] | null> {
  try {
    const rm = await fetch(`${JALUR_BATAS}/${NAMA_MANIFEST_BATAS}`, { cache: "no-store" });
    if (!rm.ok) return null;
    const m = bacaManifestBatas(await rm.json());
    if (!m) return null;
    const semua: FiturBatas[] = [];
    for (const kec of Object.values(m.kecamatan)) {
      const r = await fetch(`${JALUR_BATAS}/${encodeURIComponent(kec.berkas)}?v=${encodeURIComponent(m.versi)}`);
      if (!r.ok) return null;
      const b = bacaBerkasBatas(await r.json());
      if (!b) return null;
      semua.push(...b.fitur);
    }
    return semua;
  } catch {
    return null;
  }
}

type PilihKolom = { kunci: keyof PilihanKolom; label: string; wajib: boolean };
const KOLOM_PILIH: PilihKolom[] = [
  { kunci: "id", label: "Kolom kode sub SLS (16 digit)", wajib: true },
  { kunci: "nama", label: "Kolom nama SLS", wajib: false },
  { kunci: "kode", label: "Kolom kode sub SLS pendek (01, 02, …)", wajib: false },
];

export default function BatasShapefile() {
  const [data, setData] = useState<DataBatasVersi | null>(null);
  const [galat, setGalat] = useState("");
  const [info, setInfo] = useState("");
  const [hasil, setHasil] = useState<HasilBaca | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [kolom, setKolom] = useState<PilihanKolom>({ id: "", nama: "", kode: "" });
  const [lama, setLama] = useState<FiturBatas[] | null>(null);
  const [lamaMuat, setLamaMuat] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [paham, setPaham] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState<string | "bawaan" | null>(null);
  const [semuaTemuan, setSemuaTemuan] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const muat = useCallback(async () => {
    try {
      setData(await apiPortal<DataBatasVersi>(API_MASTER_BATAS));
      setGalat("");
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Riwayat batas belum bisa dimuat.");
    }
  }, []);
  useEffect(() => { void muat(); }, [muat]);

  const pilihBerkas = async (daftar: FileList | null) => {
    if (!daftar || daftar.length === 0) return;
    setMembaca(true);
    setInfo("");
    setHasil(null);
    setPaham(false);
    setSemuaTemuan(false);
    try {
      const masuk = await Promise.all(Array.from(daftar).map(async (f) => ({ nama: f.name, data: await f.arrayBuffer() })));
      const h = await bacaBerkasUnggahan(masuk);
      setHasil(h);
      setKolom(tebakKolom(h.kolom, h.fitur.map((f) => f.atribut)));
      setLamaMuat(true);
      setLama(await muatVersiBerjalan());
      setLamaMuat(false);
    } catch (e) {
      setHasil({ jenis: "shapefile", namaAsal: "", kolom: [], fitur: [], sistem: "", catatan: [], galat: [e instanceof Error ? e.message : "Berkas tidak terbaca."] });
    } finally {
      setMembaca(false);
      if (input.current) input.current.value = "";
    }
  };

  const siap = useMemo(() => (hasil && hasil.fitur.length > 0 ? siapkanFitur(hasil.fitur, kolom) : null), [hasil, kolom]);
  const banding = useMemo(() => (siap && lama ? bandingkan(siap.fitur, lama) : null), [siap, lama]);
  const jumlahGalat = (siap?.masalah.filter((m) => m.tingkat === "GALAT").length ?? 0) + (hasil?.galat.length ?? 0);
  const jumlahPeringatan = siap?.masalah.filter((m) => m.tingkat === "PERINGATAN").length ?? 0;
  const kecamatan = useMemo(() => new Set((siap?.fitur ?? []).map((f) => f.id.slice(0, 7))).size, [siap]);
  const perluPaham = !!banding && banding.hilang.length > 0;
  const bolehSimpan = !!siap && siap.fitur.length > 0 && jumlahGalat === 0 && (!perluPaham || paham) && !menyimpan && !lamaMuat;

  const simpan = async () => {
    if (!siap || !hasil) return;
    setMenyimpan(true);
    setGalat("");
    try {
      const r = await apiPortal<{ versi: string; jumlah_subsls: number }>(API_MASTER_BATAS, {
        method: "POST",
        body: JSON.stringify({
          aksi: "simpan", fitur: siap.fitur, namaAsal: hasil.namaAsal.slice(0, 300), catatan,
          ringkas: { baru: banding?.baru.length ?? 0, hilang: banding?.hilang.length ?? 0, berubah: banding?.berubah.length ?? 0, sama: banding?.sama ?? 0, sistem: hasil.sistem, jenis: hasil.jenis },
        }),
      });
      setInfo(`Versi ${labelVersi(r.versi)} tersimpan (${fmt(r.jumlah_subsls)} sub SLS). Belum dipakai peta sampai diaktifkan di Riwayat versi.`);
      setHasil(null);
      setCatatan("");
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Versi belum bisa disimpan.");
    } finally {
      setMenyimpan(false);
    }
  };

  const aktifkan = async (versi: string | null) => {
    setMenyimpan(true);
    setGalat("");
    try {
      await apiPortal(API_MASTER_BATAS, { method: "POST", body: JSON.stringify({ aksi: "aktifkan", versi }) });
      setInfo(versi ? `Versi ${labelVersi(versi)} kini dipakai peta (HP memuat ulang batas saat berikutnya dibuka).` : "Kembali memakai berkas bawaan aplikasi.");
      setKonfirmasi(null);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Versi belum bisa diaktifkan.");
    } finally {
      setMenyimpan(false);
    }
  };

  const temuan = siap?.masalah ?? [];
  const tampilTemuan = semuaTemuan ? temuan : temuan.filter((m) => m.tingkat !== "INFO").slice(0, 40);

  return (
    <div className="flex flex-col gap-3.5">
      {galat && <Pesan>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo("")}>{info}</Pesan>}
      {data && !data.siap && <Pesan jenis="info">Penyimpanan versi batas belum aktif di basis data (SQL 20261107i belum dijalankan). Pemeriksaan berkas di bawah tetap bisa dicoba, tetapi belum bisa disimpan.</Pesan>}

      <Kartu judul="Unggah shapefile batas" ket="Diurai di peramban ini; tidak ada yang tersimpan sebelum Anda menekan Simpan">
        <p className="mb-2.5 text-[12.5px] leading-relaxed text-[#5B6B84]">
          Pilih <b>zip shapefile</b> (berisi .shp, .dbf, .prj) atau berkas <b>GeoJSON</b> (boleh zip berisi satu GeoJSON per sub SLS). Sistem koordinat UTM atau bujur-lintang dikenali dari .prj dan diubah ke WGS84.
          Satu baris = satu sub SLS dengan kolom kode 16 digit.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" multiple accept=".zip,.shp,.dbf,.prj,.geojson,.json" className="hidden" onChange={(e) => void pilihBerkas(e.target.files)} />
          <button type="button" className={BTN} disabled={membaca || menyimpan} onClick={() => input.current?.click()}>{membaca ? "Membaca…" : "Pilih berkas"}</button>
          {hasil && <button type="button" className={BTN_O} disabled={menyimpan} onClick={() => { setHasil(null); setPaham(false); }}>Batalkan</button>}
        </div>

        {membaca && <div className="mt-3"><Memuat teks="Membaca dan memeriksa berkas…" /></div>}

        {hasil && !membaca && (
          <div className="mt-3.5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Chip w="navy">{hasil.jenis === "shapefile" ? "Shapefile" : "GeoJSON"}</Chip>
              <span className="text-[#5B6B84]">{hasil.namaAsal || "—"}</span>
              {hasil.sistem && <Chip w="mut">{hasil.sistem}</Chip>}
            </div>
            {hasil.galat.map((g, i) => <Pesan key={i}>{g}</Pesan>)}
            {hasil.catatan.map((c, i) => <Pesan key={i} jenis="info">{c}</Pesan>)}

            {hasil.fitur.length > 0 && (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  {KOLOM_PILIH.map((k) => (
                    <label key={k.kunci} className="flex flex-col gap-1 text-[12px] font-semibold text-[#5B6B84]">
                      {k.label}{k.wajib ? " *" : ""}
                      <select className={INPUT} value={kolom[k.kunci]} onChange={(e) => { setKolom({ ...kolom, [k.kunci]: e.target.value }); setPaham(false); }}>
                        <option value="">{k.wajib ? "— pilih —" : "— tidak dipakai —"}</option>
                        {hasil.kolom.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  ))}
                </div>

                {siap && (
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <Chip w="ok">{fmt(siap.fitur.length)} sub SLS sah</Chip>
                    <Chip w="navy">{kecamatan} kecamatan</Chip>
                    {jumlahGalat > 0 && <Chip w="bad">{fmt(jumlahGalat)} galat</Chip>}
                    {jumlahPeringatan > 0 && <Chip w="wait">{fmt(jumlahPeringatan)} peringatan</Chip>}
                    <Chip w="mut">dari {fmt(hasil.fitur.length)} baris</Chip>
                  </div>
                )}

                {lamaMuat && <Memuat teks="Mengambil versi yang sedang dipakai untuk dibandingkan…" />}
                {siap && !lamaMuat && !lama && <Pesan jenis="info">Versi yang sedang dipakai tidak terbaca, jadi perbandingan dilewati.</Pesan>}
                {banding && (
                  <div className="rounded-xl border border-[#DDE6F3] bg-[#F9FBFE] p-3 text-[12.5px]">
                    <div className="mb-1.5 font-bold text-[#0F2A52]">Dibanding versi yang sedang dipakai</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip w="ok">{fmt(banding.baru.length)} baru</Chip>
                      <Chip w={banding.hilang.length ? "bad" : "mut"}>{fmt(banding.hilang.length)} hilang</Chip>
                      <Chip w={banding.berubah.length ? "wait" : "mut"}>{fmt(banding.berubah.length)} berubah (luas &gt; 2% atau bergeser &gt; 5 m)</Chip>
                      <Chip w="mut">{fmt(banding.sama)} tetap</Chip>
                    </div>
                    {banding.hilang.length > 0 && (
                      <div className="mt-2 text-[#8A6200]">
                        Sub SLS yang hilang dari berkas ini tidak punya batas lagi di peta. Contoh: {banding.hilang.slice(0, 5).map((i) => `…${i.slice(-8)}`).join(", ")}{banding.hilang.length > 5 ? ", …" : ""}
                        <label className="mt-1.5 flex items-start gap-2 font-semibold">
                          <input type="checkbox" checked={paham} onChange={(e) => setPaham(e.target.checked)} className="mt-0.5" />
                          <span>Saya paham {fmt(banding.hilang.length)} sub SLS akan kehilangan batas bila versi ini diaktifkan.</span>
                        </label>
                      </div>
                    )}
                    {banding.berubah.length > 0 && (
                      <div className="mt-2 text-[#5B6B84]">
                        Perubahan terbesar: {banding.berubah.slice().sort((a, b) => Math.abs(b.luasPersen) - Math.abs(a.luasPersen)).slice(0, 3).map((b) => `…${b.id.slice(-8)} (${b.luasPersen > 0 ? "+" : ""}${b.luasPersen}%)`).join(", ")}
                      </div>
                    )}
                  </div>
                )}

                {temuan.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-[#DDE6F3]">
                    <table className="w-full border-collapse text-[12.5px]">
                      <thead><tr><th className={TH}>Tingkat</th><th className={TH}>Sub SLS</th><th className={TH}>Temuan</th></tr></thead>
                      <tbody>
                        {tampilTemuan.map((m, i) => (
                          <tr key={i}>
                            <td className={TD}><Chip w={WARNA[m.tingkat]}>{m.tingkat}</Chip></td>
                            <td className={`${TD} font-mono text-[11.5px]`}>{m.id}</td>
                            <td className={TD}>{m.pesan}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center justify-between border-t border-[#DDE6F3] px-3 py-2 text-[12px] text-[#6B7A90]">
                      <span>{tampilTemuan.length < temuan.length ? `Menampilkan ${tampilTemuan.length} dari ${fmt(temuan.length)} temuan` : `${fmt(temuan.length)} temuan`}</span>
                      {temuan.some((m) => m.tingkat === "INFO") && <button type="button" className="font-bold text-[#1F5FD1]" onClick={() => setSemuaTemuan((x) => !x)}>{semuaTemuan ? "Sembunyikan info" : "Tampilkan semua (termasuk info)"}</button>}
                    </div>
                  </div>
                )}

                <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#5B6B84]">
                  Catatan versi (opsional)
                  <input className={INPUT} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. pemutakhiran batas Kecamatan Kubung" />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={BTN_G} disabled={!bolehSimpan} onClick={() => void simpan()}>{menyimpan ? "Menyimpan…" : "Simpan sebagai versi baru"}</button>
                  {!bolehSimpan && jumlahGalat > 0 && <span className="text-[12px] text-[#B42329]">Perbaiki galat dulu; berkas dengan galat tidak bisa disimpan.</span>}
                  {!bolehSimpan && jumlahGalat === 0 && perluPaham && !paham && <span className="text-[12px] text-[#8A6200]">Centang pernyataan di atas untuk melanjutkan.</span>}
                </div>
              </>
            )}
          </div>
        )}
      </Kartu>

      <Kartu judul="Riwayat versi" ket="Versi lama tidak dihapus; aktifkan kembali kapan saja">
        {!data && !galat && <Memuat />}
        {data && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr><th className={TH}>Versi</th><th className={TH}>Dibuat oleh</th><th className={TH}>Berkas asal</th><th className={TH}>Sub SLS</th><th className={TH}>Perubahan</th><th className={TH}>Status</th><th className={TH}></th></tr>
              </thead>
              <tbody>
                {data.versi.map((v: VersiBatas) => {
                  const r = v.ringkas as { baru?: number; hilang?: number; berubah?: number };
                  return (
                    <tr key={v.versi}>
                      <td className={TD}><b>{labelVersi(v.versi)}</b>{v.catatan && <div className="text-[11.5px] text-[#6B7A90]">{v.catatan}</div>}</td>
                      <td className={TD}>{v.dibuat_oleh || "—"}</td>
                      <td className={TD}>{v.nama_asal || "—"}<div className="text-[11.5px] text-[#6B7A90]">{kb(v.ukuran_byte)}</div></td>
                      <td className={TD}>{fmt(v.jumlah_subsls)} · {v.jumlah_kec} kec.</td>
                      <td className={`${TD} text-[11.5px] text-[#5B6B84]`}>{r.baru || r.hilang || r.berubah ? `${r.baru ?? 0} baru, ${r.hilang ?? 0} hilang, ${r.berubah ?? 0} berubah` : "—"}</td>
                      <td className={TD}>{v.aktif ? <Chip w="ok">Dipakai</Chip> : <Chip w="mut">Arsip</Chip>}</td>
                      <td className={TD}>
                        {!v.aktif && (konfirmasi === v.versi ? (
                          <span className="inline-flex gap-1.5"><button type="button" className={BTN} disabled={menyimpan} onClick={() => void aktifkan(v.versi)}>Ya, aktifkan</button><button type="button" className={BTN_O} onClick={() => setKonfirmasi(null)}>Batal</button></span>
                        ) : (
                          <button type="button" className={BTN_O} disabled={menyimpan} onClick={() => setKonfirmasi(v.versi)}>Aktifkan</button>
                        ))}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className={TD}><b>Bawaan aplikasi</b>{data.bawaan?.versi && <div className="text-[11.5px] text-[#6B7A90]">versi {data.bawaan.versi}</div>}</td>
                  <td className={TD}>—</td>
                  <td className={TD}>public/peta/batas</td>
                  <td className={TD}>{data.bawaan?.dibaca ? `${fmt(data.bawaan.poligon)} · ${data.bawaan.kecamatan} kec.` : "—"}</td>
                  <td className={TD}>—</td>
                  <td className={TD}>{data.aktif ? <Chip w="mut">Cadangan</Chip> : <Chip w="ok">Dipakai</Chip>}</td>
                  <td className={TD}>
                    {data.aktif && (konfirmasi === "bawaan" ? (
                      <span className="inline-flex gap-1.5"><button type="button" className={BTN} disabled={menyimpan} onClick={() => void aktifkan(null)}>Ya, kembalikan</button><button type="button" className={BTN_O} onClick={() => setKonfirmasi(null)}>Batal</button></span>
                    ) : (
                      <button type="button" className={BTN_O} disabled={menyimpan} onClick={() => setKonfirmasi("bawaan")}>Kembalikan ke bawaan</button>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
            {data.versi.length === 0 && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Belum ada versi unggahan; peta memakai berkas bawaan.</p>}
          </div>
        )}
      </Kartu>
    </div>
  );
}
