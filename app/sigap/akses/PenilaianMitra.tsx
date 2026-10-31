"use client";

// app/sigap/akses/PenilaianMitra.tsx
//
// (31 Okt 2026) Tab ⭐ Penilaian Mitra di Kelola Peran & Akses. Matriks Mitra × kegiatan: tiap kegiatan baru menambah satu KOLOM penilaian, nilai 1-5 per Mitra
// (opsional catatan). Rata-rata semua kolom = rekam jejak Mitra (peringkat seleksi; bencana_petugas.nilai_kinerja diturunkan trigger SQL 20261031j).
// Klik nama = baris terbuka berisi catatan per kegiatan. Judul kolom memakai standar tabel SIGAP (admin/KepalaKolom + lib/sigapTabelKolom).
// Tambah kolom dan tempel nilai dari Excel dikerjakan di panel sebaris (bukan modal). Logika murni: lib/penilaianMitra.ts. Data: /api/sigap/penilaian-mitra.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir } from "../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Pesan, TabelKartu, TD, TH } from "../admin/ui";
import KepalaKolom from "../admin/KepalaKolom";
import { kapitalWilayah } from "@/lib/pegawaiOrganik";
import { adaSaring, nilaiBeda, terapkanTabel, type NilaiSel, type Saring, type Urut } from "@/lib/sigapTabelKolom";
import { MAKS_CATATAN, rataRata, type NilaiMitra } from "@/lib/penilaianMitra";

type Kolom = { id: number; kode: string; nama: string; kegiatan_id: number | null; urutan: number; dibuka: boolean };
type Mitra = { akun_id: number; nama: string; kecamatan: string | null; nagari: string | null; aktif: boolean; red_flag: boolean; rekomendasi_pml: boolean; nilai: Record<string, NilaiMitra> };
type Respons = { tabel_siap: boolean; boleh_kelola: boolean; kolom: Kolom[]; mitra: Mitra[]; kegiatan_tersedia: { id: number; nama: string }[] };
type LaporanTempel = {
  cocok: number; contoh: { nama: string; nilai: number }[]; tidak_cocok: { kunci: string; baris_ke: number }[]; jumlah_tidak_cocok: number;
  ambigu: { kunci: string; baris_ke: number }[]; jumlah_ambigu: number; galat_baris: { baris_ke: number; pesan: string }[]; jumlah_galat: number; disimpan: number;
};

const HALAMAN = 200;
const WARNA: Record<number, string> = { 1: "bg-[#FDE2E0] text-[#9B2C20]", 2: "bg-[#FDEBD3] text-[#8A4B0F]", 3: "bg-[#FFF4CC] text-[#7A5B00]", 4: "bg-[#DDF3E4] text-[#13794B]", 5: "bg-[#BFE8CF] text-[#0B5C37]" };
const kelasNilai = (n: number | null | undefined) => (n ? WARNA[Math.round(n)] ?? "" : "");

export default function PenilaianMitra() {
  const [data, setData] = useState<Respons | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [q, setQ] = useState("");
  const [hanyaAktif, setHanyaAktif] = useState(true);
  const [sKol, setSKol] = useState<Saring<string>>({});
  const [urut, setUrut] = useState<Urut<string>>(null);
  const [tampil, setTampil] = useState(HALAMAN);
  const [terbuka, setTerbuka] = useState<number | null>(null);
  const [menyimpan, setMenyimpan] = useState<string | null>(null); // "akun:kolom" yang sedang disimpan
  const [panel, setPanel] = useState<"kolom" | "tempel" | null>(null);
  // tambah kolom
  const [kegiatanBaru, setKegiatanBaru] = useState("");
  const [namaBaru, setNamaBaru] = useState("");
  // tempel
  const [kolomTempel, setKolomTempel] = useState("");
  const [teks, setTeks] = useState("");
  const [laporan, setLaporan] = useState<LaporanTempel | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const d = await fetchJson<Respons>("/api/sigap/penilaian-mitra");
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    setTampil(HALAMAN);
  }, [q, hanyaAktif, sKol, urut]);

  const kolom = useMemo(() => data?.kolom ?? [], [data]);
  const bolehKelola = data?.boleh_kelola === true;

  const nilaiSel = useMemo<NilaiSel<Mitra, string>>(
    () => (m, k) => {
      if (k === "nama") return m.nama;
      if (k === "kec") return kapitalWilayah(m.kecamatan) ?? "";
      if (k === "nag") return kapitalWilayah(m.nagari) ?? "";
      if (k === "rata") return rataRata(Object.values(m.nilai).map((x) => x.n)) ?? "";
      if (k === "jml") return Object.keys(m.nilai).length;
      if (k === "tanda") return m.red_flag ? "Red flag" : m.rekomendasi_pml ? "Rekomendasi PML" : "";
      if (k.startsWith("k:")) return m.nilai[k.slice(2)]?.n ?? "";
      return "";
    },
    [],
  );

  const awal = useMemo(() => {
    const kata = q.trim().toLowerCase();
    return (data?.mitra ?? []).filter((m) => (!hanyaAktif || m.aktif) && (kata === "" || m.nama.toLowerCase().includes(kata)));
  }, [data, q, hanyaAktif]);
  const terlihat = useMemo(() => terapkanTabel(awal, sKol, urut, nilaiSel), [awal, sKol, urut, nilaiSel]);
  const adaFilter = adaSaring(sKol) || urut !== null;
  const ANGKA = (id: string) => id === "rata" || id === "jml" || id.startsWith("k:");
  const kepala = (id: string, label: string) => (
    <th key={id} className={TH}>
      <KepalaKolom id={id} label={label} saring={sKol} setSaring={setSKol} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(awal, id, nilaiSel, ANGKA(id))} />
    </th>
  );

  // ringkasan per kolom (dari seluruh Mitra, bukan hasil saringan)
  const ringkasKolom = useMemo(
    () =>
      kolom.map((k) => {
        const n = (data?.mitra ?? []).map((m) => m.nilai[String(k.id)]?.n).filter((x): x is number => typeof x === "number");
        return { id: k.id, terisi: n.length, rata: rataRata(n) };
      }),
    [kolom, data],
  );

  async function kirim<T>(badan: Record<string, unknown>): Promise<T> {
    return fetchJson<T>("/api/sigap/penilaian-mitra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(badan) });
  }

  /** Perbarui satu sel di state (tanpa memuat ulang 700+ baris). */
  function tempelLokal(akunId: number, kolomId: number, n: NilaiMitra | null) {
    setData((d) =>
      d
        ? {
            ...d,
            mitra: d.mitra.map((m) => {
              if (m.akun_id !== akunId) return m;
              const nilai = { ...m.nilai };
              if (n === null) delete nilai[String(kolomId)];
              else nilai[String(kolomId)] = n;
              return { ...m, nilai };
            }),
          }
        : d,
    );
  }

  async function simpanNilai(m: Mitra, k: Kolom, nilai: number | null, catatan?: string | null) {
    const tanda = `${m.akun_id}:${k.id}`;
    setMenyimpan(tanda);
    setGalat(null);
    try {
      const lama = m.nilai[String(k.id)];
      const cat = catatan === undefined ? lama?.c ?? null : catatan;
      await kirim({ aksi: "simpan_nilai", kolom_id: k.id, akun_id: m.akun_id, nilai, catatan: cat });
      tempelLokal(m.akun_id, k.id, nilai === null ? null : { n: nilai, c: cat && cat.trim() !== "" ? cat.trim() : null });
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMenyimpan(null);
    }
  }

  async function tambahKolom() {
    setSibuk(true);
    setGalat(null);
    try {
      await kirim({ aksi: "tambah_kolom", nama: namaBaru, kegiatan_id: kegiatanBaru ? Number(kegiatanBaru) : null });
      setOk("Kolom penilaian ditambahkan.");
      setNamaBaru("");
      setKegiatanBaru("");
      setPanel(null);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  async function ubahKolom(k: Kolom, ubah: { dibuka?: boolean; nama?: string }) {
    setGalat(null);
    try {
      await kirim({ aksi: "ubah_kolom", kolom_id: k.id, ...ubah });
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }

  async function tempel(simpan: boolean) {
    if (!kolomTempel) return setGalat("Pilih kolom penilaian dulu.");
    setSibuk(true);
    setGalat(null);
    try {
      const r = await kirim<LaporanTempel>({ aksi: "tempel", kolom_id: Number(kolomTempel), teks, simpan });
      setLaporan(r);
      if (simpan) {
        setOk(`${r.disimpan} nilai tersimpan.`);
        setTeks("");
        setLaporan(null);
        setPanel(null);
        await muat();
      }
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  if (data && !data.tabel_siap) {
    return <Pesan jenis="peringatan">Tabel penilaian Mitra belum dibuat. Jalankan SQL 20261031j_penilaian_mitra.sql, lalu muat ulang halaman ini.</Pesan>;
  }

  const jumlahKolomTabel = 3 + kolom.length + 3;

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && (
        <Pesan jenis="ok" onTutup={() => setOk(null)}>
          {ok}
        </Pesan>
      )}

      <Kartu
        judul="Penilaian Mitra"
        ket={`${terlihat.length} dari ${data?.mitra.length ?? 0} Mitra · ${kolom.length} kolom kegiatan${memuat ? " · memuat…" : ""}`}
        kanan={
          <div className="flex flex-wrap gap-2">
            {bolehKelola && (
              <>
                <button type="button" className={BTN} onClick={() => setPanel(panel === "kolom" ? null : "kolom")}>
                  + Kolom kegiatan
                </button>
                <button type="button" className={BTN_O} onClick={() => (setPanel(panel === "tempel" ? null : "tempel"), setKolomTempel((v) => v || String(kolom.find((k) => k.dibuka)?.id ?? "")))} disabled={kolom.length === 0}>
                  Tempel nilai dari Excel
                </button>
              </>
            )}
            <button type="button" className={BTN_O} onClick={() => void muat()} disabled={memuat}>
              Muat ulang
            </button>
          </div>
        }
      >
        <p className="mb-3 text-[12.5px] text-[#55657D]">
          Setiap kegiatan memiliki satu kolom penilaian (nilai 1–5). Rata-rata semua kolom menjadi rekam jejak Mitra pada seleksi berikutnya. Klik nama untuk melihat atau mengubah catatan per kegiatan.
        </p>

        {panel === "kolom" && bolehKelola && (
          <div className="mb-3 space-y-2 rounded-[12px] border border-[#DDE6F3] bg-[#F9FBFE] p-3">
            <div className="text-[13px] font-bold text-[#14202E]">Tambah kolom penilaian</div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[12.5px] font-semibold text-[#44546F]">
                Kegiatan (opsional)
                <select className={`${INPUT} mt-1 block min-w-[220px]`} value={kegiatanBaru} onChange={(e) => setKegiatanBaru(e.target.value)}>
                  <option value="">— tanpa kegiatan terdaftar —</option>
                  {(data?.kegiatan_tersedia ?? []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[200px] flex-1 text-[12.5px] font-semibold text-[#44546F]">
                Nama kolom {kegiatanBaru ? "(kosong = nama kegiatan)" : ""}
                <input className={`${INPUT} mt-1 block w-full`} value={namaBaru} maxLength={120} placeholder="mis. Sakernas TW IV 2026" onChange={(e) => setNamaBaru(e.target.value)} />
              </label>
              <button type="button" className={BTN} disabled={sibuk || (!kegiatanBaru && namaBaru.trim() === "")} onClick={() => void tambahKolom()}>
                {sibuk ? "Menambah…" : "Tambah kolom"}
              </button>
              <button type="button" className={BTN_O} onClick={() => setPanel(null)}>
                Batal
              </button>
            </div>
          </div>
        )}

        {panel === "tempel" && bolehKelola && (
          <div className="mb-3 space-y-2 rounded-[12px] border border-[#DDE6F3] bg-[#F9FBFE] p-3">
            <div className="text-[13px] font-bold text-[#14202E]">Tempel nilai dari Excel</div>
            <p className="text-[12px] text-[#6B7A90]">
              Salin dari Excel tanpa judul atau dengan judul: kolom 1 = NIK lengkap atau nama lengkap, kolom 2 = nilai 1–5, kolom 3 = catatan (opsional). Nilai yang sudah ada pada kolom itu ditimpa.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Kolom tujuan" className={INPUT} value={kolomTempel} onChange={(e) => (setKolomTempel(e.target.value), setLaporan(null))}>
                <option value="">Pilih kolom…</option>
                {kolom.filter((k) => k.dibuka).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
            <textarea aria-label="Isi tempelan" className={`${INPUT} h-32 w-full font-mono text-[12px]`} placeholder={"1303010101010001\t4\tcekatan\nAni Putri\t5"} value={teks} onChange={(e) => (setTeks(e.target.value), setLaporan(null))} />
            {laporan && (
              <div className="rounded-lg bg-white p-2.5 text-[12.5px] text-[#14202E]">
                <div className="font-bold">
                  {laporan.cocok} baris cocok · {laporan.jumlah_tidak_cocok} tidak cocok · {laporan.jumlah_ambigu} nama kembar · {laporan.jumlah_galat} baris tak sah
                </div>
                {laporan.contoh.length > 0 && <div className="mt-1 text-[#55657D]">Contoh: {laporan.contoh.map((c) => `${c.nama} (${c.nilai})`).join(", ")}</div>}
                {laporan.tidak_cocok.length > 0 && <div className="mt-1 text-[#8A4B0F]">Tidak cocok: {laporan.tidak_cocok.map((t) => `baris ${t.baris_ke} "${t.kunci}"`).join("; ")}</div>}
                {laporan.ambigu.length > 0 && <div className="mt-1 text-[#8A4B0F]">Nama kembar (pakai NIK): {laporan.ambigu.map((t) => `baris ${t.baris_ke} "${t.kunci}"`).join("; ")}</div>}
                {laporan.galat_baris.length > 0 && <div className="mt-1 text-[#9B2C20]">Tak sah: {laporan.galat_baris.map((t) => `baris ${t.baris_ke}: ${t.pesan}`).join("; ")}</div>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_O} disabled={sibuk || !teks.trim() || !kolomTempel} onClick={() => void tempel(false)}>
                Cek dulu
              </button>
              <button type="button" className={BTN} disabled={sibuk || !laporan || laporan.cocok === 0} onClick={() => void tempel(true)}>
                {sibuk ? "Menyimpan…" : laporan ? `Simpan ${laporan.cocok} nilai` : "Simpan"}
              </button>
              <button type="button" className={BTN_O} onClick={() => setPanel(null)}>
                Batal
              </button>
            </div>
          </div>
        )}

        {kolom.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {kolom.map((k, i) => (
              <div key={k.id} className="flex items-center gap-2 rounded-[12px] border border-[#DDE6F3] bg-white px-3 py-1.5 text-[12.5px]">
                <span className="font-bold text-[#14202E]">{k.nama}</span>
                <span className="text-[#6B7A90]">
                  {ringkasKolom[i]?.terisi ?? 0} dinilai{ringkasKolom[i]?.rata != null ? ` · rata-rata ${ringkasKolom[i].rata}` : ""}
                </span>
                {!k.dibuka && <Chip w="mut">Ditutup</Chip>}
                {bolehKelola && (
                  <button type="button" className="font-bold text-[#1F5FD1] hover:underline" onClick={() => void ubahKolom(k, { dibuka: !k.dibuka })}>
                    {k.dibuka ? "Tutup" : "Buka"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input aria-label="Cari Mitra" className={`${INPUT} min-w-[180px] flex-1`} placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#44546F]">
            <input type="checkbox" checked={hanyaAktif} onChange={(e) => setHanyaAktif(e.target.checked)} />
            Hanya akun aktif
          </label>
          {adaFilter && (
            <button type="button" className={BTN_O} onClick={() => (setSKol({}), setUrut(null))}>
              Hapus saringan &amp; urutan kolom
            </button>
          )}
        </div>

        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              {kepala("nama", "Nama")}
              {kepala("kec", "Kecamatan")}
              {kepala("nag", "Nagari")}
              {kolom.map((k) => kepala(`k:${k.id}`, k.nama))}
              {kepala("rata", "Rata-rata")}
              {kepala("jml", "Jml dinilai")}
              {kepala("tanda", "Penanda")}
            </tr>
          </thead>
          <tbody>
            {terlihat.slice(0, tampil).map((m) => {
              const buka = terbuka === m.akun_id;
              const rata = rataRata(Object.values(m.nilai).map((x) => x.n));
              return (
                <Fragment key={m.akun_id}>
                  <tr className={`${m.aktif ? "" : "opacity-60"} ${buka ? "bg-[#F3F7FE]" : ""}`}>
                    <td className={`${TD} font-semibold text-[#1B2B4B]`}>
                      <button type="button" aria-expanded={buka} aria-label={`${buka ? "Tutup" : "Buka"} catatan ${m.nama}`} className="inline-flex items-start gap-1.5 text-left font-semibold hover:text-[#1F5FD1]" onClick={() => setTerbuka(buka ? null : m.akun_id)}>
                        <span aria-hidden className="mt-[3px] text-[10px] text-[#6B7A90]">
                          {buka ? "▾" : "▸"}
                        </span>
                        <span>{m.nama}</span>
                      </button>
                      {!m.aktif && <span className="ml-1.5 text-[11px] font-bold text-[#B42329]">nonaktif</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{kapitalWilayah(m.kecamatan) ?? "–"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{kapitalWilayah(m.nagari) ?? "–"}</td>
                    {kolom.map((k) => {
                      const n = m.nilai[String(k.id)]?.n ?? null;
                      const tanda = `${m.akun_id}:${k.id}`;
                      const kunci = !bolehKelola || !k.dibuka;
                      return (
                        <td key={k.id} className={TD}>
                          <select
                            aria-label={`Nilai ${m.nama} untuk ${k.nama}`}
                            className={`rounded-lg border border-[#DDE6F3] px-2 py-1 text-[13px] font-bold outline-none focus:border-[#1F5FD1] disabled:opacity-70 ${kelasNilai(n) || "bg-white text-[#6B7A90]"}`}
                            value={n ?? ""}
                            disabled={kunci || menyimpan === tanda}
                            onChange={(e) => void simpanNilai(m, k, e.target.value === "" ? null : Number(e.target.value))}
                          >
                            <option value="">–</option>
                            {[1, 2, 3, 4, 5].map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className={TD}>{rata != null ? <span className={`rounded-md px-2 py-0.5 text-[12.5px] font-extrabold ${kelasNilai(rata)}`}>{rata}</span> : "–"}</td>
                    <td className={TD}>{Object.keys(m.nilai).length}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        {m.red_flag && <Chip w="bad">Red flag</Chip>}
                        {m.rekomendasi_pml && <Chip w="ok">Rekomendasi PML</Chip>}
                        {!m.red_flag && !m.rekomendasi_pml && "–"}
                      </div>
                    </td>
                  </tr>
                  {buka && (
                    <tr className="bg-[#F3F7FE]">
                      <td className="border-t border-[#DDE6F3] px-3.5 py-2.5" colSpan={jumlahKolomTabel}>
                        {kolom.length === 0 ? (
                          <span className="text-[12.5px] text-[#6B7A90]">Belum ada kolom kegiatan.</span>
                        ) : (
                          <div className="grid gap-2 md:grid-cols-2">
                            {kolom.map((k) => (
                              <CatatanSel key={`${m.akun_id}-${k.id}`} mitra={m} kolom={k} bolehKelola={bolehKelola} sibuk={menyimpan === `${m.akun_id}:${k.id}`} onSimpan={(c) => void simpanNilai(m, k, m.nilai[String(k.id)]?.n ?? null, c)} />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {terlihat.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#6B7A90]`} colSpan={jumlahKolomTabel}>
                  {memuat ? "Memuat…" : "Tidak ada Mitra yang cocok dengan saringan."}
                </td>
              </tr>
            )}
          </tbody>
        </TabelKartu>

        {terlihat.length > tampil && (
          <div className="mt-3 text-center">
            <button type="button" className={BTN_O} onClick={() => setTampil((n) => n + HALAMAN)}>
              Tampilkan {Math.min(HALAMAN, terlihat.length - tampil)} lagi (sisa {terlihat.length - tampil})
            </button>
          </div>
        )}
      </Kartu>
    </div>
  );
}

function CatatanSel({ mitra, kolom, bolehKelola, sibuk, onSimpan }: { mitra: Mitra; kolom: Kolom; bolehKelola: boolean; sibuk: boolean; onSimpan: (catatan: string | null) => void }) {
  const lama = mitra.nilai[String(kolom.id)];
  const [teks, setTeks] = useState(lama?.c ?? "");
  const berubah = (lama?.c ?? "") !== teks.trim();
  return (
    <div className="rounded-lg border border-[#DDE6F3] bg-white p-2">
      <div className="mb-1 flex items-center justify-between text-[12px] font-bold text-[#44546F]">
        <span>{kolom.nama}</span>
        <span className={`rounded px-1.5 py-0.5 ${kelasNilai(lama?.n)}`}>{lama ? `Nilai ${lama.n}` : "Belum dinilai"}</span>
      </div>
      {lama ? (
        <>
          <textarea aria-label={`Catatan ${mitra.nama} untuk ${kolom.nama}`} className={`${INPUT} h-16 w-full text-[12.5px]`} maxLength={MAKS_CATATAN} placeholder="Catatan (opsional)" value={teks} disabled={!bolehKelola || !kolom.dibuka} onChange={(e) => setTeks(e.target.value)} />
          {bolehKelola && kolom.dibuka && (
            <button type="button" className={`${BTN_O} mt-1`} disabled={!berubah || sibuk} onClick={() => onSimpan(teks.trim() === "" ? null : teks.trim())}>
              {sibuk ? "Menyimpan…" : "Simpan catatan"}
            </button>
          )}
        </>
      ) : (
        <p className="text-[12px] text-[#6B7A90]">Beri nilai pada tabel dulu, lalu catatan bisa ditulis di sini.</p>
      )}
    </div>
  );
}
