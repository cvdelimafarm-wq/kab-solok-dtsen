"use client";

// app/sigap/akses/Pengguna.tsx
//
// (31 Okt 2026) Tab 👥 Pengguna di Kelola Peran & Akses: daftar akun dibagi dua -- "Mitra Kepka" (pool yang boleh dipekerjakan, ditandai per tahun)
// dan "Pegawai organik". Biodata ringkas (kecamatan, NIK/NIP disamarkan, kelengkapan lokasi, terakhir masuk). Penanda pool hanya untuk Mitra.
// Kelengkapan lokasi (domisili berkoordinat/terverifikasi) adalah bahan syarat jarak/domisili pada seleksi nanti.
// Tabel: judul kolom berfilter ala spreadsheet (KepalaKolom), Kecamatan dan Nagari dua kolom, klik nama untuk membuka tombol Reset PIN.
// Logika murni (saringan, ringkasan, lokasi): lib/penggunaPool.ts. Data: /api/sigap/pengguna.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Pesan, TabelKartu, TD, TH } from "../admin/ui";
import ResetPin from "../admin/ResetPin";
import DaftarPegawai from "./DaftarPegawai";
import KepalaKolom from "./KepalaKolom";
import { kapitalWilayah, tanggalIndo, tanggalWib, type BarisPegawai, type DaftarWilayah, type RingkasPegawai } from "@/lib/pegawaiOrganik";
import { ringkas, saring, statusLokasi, type AkunPengguna, type JenisPengguna, type Ringkasan } from "@/lib/penggunaPool";
import { jumlahSaringan, STATUS_AWAL, terapkan, type DefKolom, type StatusKolom } from "@/lib/saringKolom";

type Respons = {
  tahun: number; jenis: JenisPengguna; tabel_pool_siap: boolean; boleh_kelola: boolean; ringkasan: Ringkasan; akun: AkunPengguna[];
  profil_siap?: boolean; pegawai?: BarisPegawai[] | null; ringkasan_pegawai?: RingkasPegawai | null; wilayah?: DaftarWilayah | null;
};

const HALAMAN = 200;

export default function Pengguna() {
  const [jenis, setJenis] = useState<JenisPengguna>("mitra");
  const [tahun, setTahun] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<Respons | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [q, setQ] = useState("");
  const [kol, setKol] = useState<StatusKolom>(STATUS_AWAL); // saringan/urutan judul kolom
  const [terbuka, setTerbuka] = useState<number | null>(null); // baris yang dibuka (tombol Reset PIN)
  const [hanyaAktif, setHanyaAktif] = useState(true);
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [tampil, setTampil] = useState(HALAMAN);
  const [noKepka, setNoKepka] = useState("");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [nipPenuh, setNipPenuh] = useState(false);
  const [resetPin, setResetPin] = useState<{ id: number; nama: string } | null>(null); // dialog Reset PIN (sama dengan tab Log Login)

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const d = await fetchJson<Respons>(`/api/sigap/pengguna?jenis=${jenis}&tahun=${tahun}${jenis === "organik" && nipPenuh ? "&nip=penuh" : ""}`);
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMemuat(false);
    }
  }, [jenis, tahun, nipPenuh]);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    setKol(STATUS_AWAL);
    setTerbuka(null);
  }, [jenis]);

  useEffect(() => {
    setPilih(new Set());
    setTampil(HALAMAN);
  }, [jenis, q, kol, hanyaAktif]);

  const akun = useMemo(() => data?.akun ?? [], [data]);
  const awal = useMemo(() => saring(akun, { q, hanyaAktif }), [akun, q, hanyaAktif]);
  const kolom = useMemo<DefKolom<AkunPengguna>[]>(() => {
    const lokasi = (a: AkunPengguna) => {
      const l = statusLokasi(a);
      return l === "terverifikasi" ? "Terverifikasi" : l === "berkoordinat" ? "Berkoordinat" : "Belum ada";
    };
    const pool = (a: AkunPengguna) => (a.pool ? (a.pool.status === "aktif" ? "Pool aktif" : "Nonaktif") : "Belum masuk pool");
    const terakhir = (a: AkunPengguna) => (a.terakhir_masuk_at ? tanggalIndo(tanggalWib(Date.parse(a.terakhir_masuk_at))) : "Belum pernah");
    return [
      { id: "nama", label: "Nama", nilai: (a) => a.nama },
      { id: "kec", label: "Kecamatan", nilai: (a) => kapitalWilayah(a.alamat_kecamatan) },
      { id: "nag", label: "Nagari", nilai: (a) => kapitalWilayah(a.alamat_nagari) },
      { id: "id", label: jenis === "mitra" ? "NIK" : "NIP", nilai: (a) => (jenis === "mitra" ? a.nik : a.nip) },
      { id: "lokasi", label: "Lokasi", nilai: lokasi },
      { id: "pool", label: `Pool ${tahun}`, nilai: pool },
      { id: "masuk", label: "Terakhir masuk", nilai: terakhir, urut: (a) => a.terakhir_masuk_at },
    ];
  }, [jenis, tahun]);
  const terlihat = useMemo(() => terapkan(awal, kolom, kol), [awal, kolom, kol]);
  const jmlSaringan = jumlahSaringan(kol);
  const kepala = (id: string) => <KepalaKolom<AkunPengguna> kolom={kolom} id={id} rows={awal} status={kol} onUbah={setKol} />;
  const ring = useMemo(() => data?.ringkasan ?? ringkas(akun), [data, akun]);
  const bolehKelola = data?.boleh_kelola === true && data.tabel_pool_siap && jenis === "mitra";
  const bolehResetPin = data?.boleh_kelola === true;
  const jumlahKolom = (bolehKelola ? 1 : 0) + (jenis === "mitra" ? 7 : 6);
  const pakaiProfil = jenis === "organik" && data?.profil_siap === true && !!data.pegawai && !!data.ringkasan_pegawai;

  const semuaTerpilih = terlihat.length > 0 && terlihat.every((a) => pilih.has(a.id));
  const alihSemua = () => setPilih(semuaTerpilih ? new Set() : new Set(terlihat.map((a) => a.id)));
  const alih = (id: number) =>
    setPilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function setPool(status: "aktif" | "nonaktif") {
    if (pilih.size === 0) return;
    const aksiTeks = status === "aktif" ? "masukkan ke pool" : "nonaktifkan dari pool";
    if (!window.confirm(`${pilih.size} akun akan di-${aksiTeks} tahun ${tahun}. Lanjutkan?`)) return;
    setSibuk(true);
    setGalat(null);
    try {
      const ids = Array.from(pilih);
      let diproses = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const r = await fetchJson<{ ok: boolean; diproses: number }>("/api/sigap/pengguna", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aksi: "set_pool", akun_ids: ids.slice(i, i + 500), tahun, status, no_kepka: noKepka, catatan }),
        });
        diproses += r.diproses;
      }
      setOk(`${diproses} akun ${status === "aktif" ? "masuk pool" : "dinonaktifkan dari pool"} tahun ${tahun}.`);
      setPilih(new Set());
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  const kpi = (label: string, nilai: number | string, warna = "text-[#0F2A52]") => (
    <div className="rounded-[14px] border border-[#DDE6F3] bg-white px-3.5 py-2.5">
      <div className="text-[11.5px] font-semibold text-[#6B7A90]">{label}</div>
      <div className={`text-[22px] font-extrabold ${warna}`}>{nilai}</div>
    </div>
  );

  const chipLokasi = (a: AkunPengguna) => {
    const l = statusLokasi(a);
    return l === "terverifikasi" ? <Chip w="ok">Terverifikasi</Chip> : l === "berkoordinat" ? <Chip w="navy">Berkoordinat</Chip> : <Chip w="wait">Belum ada</Chip>;
  };
  const chipPool = (a: AkunPengguna) => (a.pool ? a.pool.status === "aktif" ? <Chip w="ok">Pool aktif</Chip> : <Chip w="mut">Nonaktif</Chip> : <Chip w="wait">Belum masuk pool</Chip>);

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && (
        <Pesan jenis="ok" onTutup={() => setOk(null)}>
          {ok}
        </Pesan>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={jenis === "mitra" ? BTN : BTN_O} onClick={() => setJenis("mitra")}>
          Mitra Kepka
        </button>
        <button type="button" className={jenis === "organik" ? BTN : BTN_O} onClick={() => setJenis("organik")}>
          Pegawai organik
        </button>
        {jenis === "mitra" && (
          <label className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-[#44546F]">
            Pool tahun
            <input aria-label="Tahun pool" type="number" min={2020} max={2100} className={`${INPUT} w-[84px]`} value={tahun} onChange={(e) => setTahun(Number(e.target.value) || tahun)} />
          </label>
        )}
      </div>

      {data && jenis === "mitra" && !data.tabel_pool_siap && (
        <Pesan jenis="peringatan">Tabel pool Mitra belum dibuat (SQL 20261031e_mitra_pool.sql). Daftar tetap tampil; penanda pool aktif setelah SQL dijalankan.</Pesan>
      )}

      {data && jenis === "organik" && !data.profil_siap && (
        <Pesan jenis="peringatan">Profil kepegawaian belum dibuat (SQL 20261031h_pegawai_profil.sql). Daftar akun tetap tampil; kolom NIP baru, jabatan, status, dan lainnya muncul setelah SQL dijalankan.</Pesan>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpi(jenis === "mitra" ? "Akun Mitra" : "Pegawai organik", ring.total)}
        {jenis === "mitra" ? kpi(`Pool aktif ${tahun}`, ring.pool_aktif, "text-[#13794B]") : kpi("Akun aktif", ring.aktif, "text-[#13794B]")}
        {jenis === "mitra" ? kpi("Belum masuk pool", ring.belum_pool, ring.belum_pool > 0 ? "text-[#8A6200]" : undefined) : kpi("Tanpa titik domisili", ring.lokasi_belum, ring.lokasi_belum > 0 ? "text-[#8A6200]" : undefined)}
        {jenis === "mitra" ? kpi("Lokasi lengkap", `${ring.lokasi_terverifikasi + ring.lokasi_berkoordinat}/${ring.total}`) : kpi("Lokasi terverifikasi", ring.lokasi_terverifikasi)}
      </div>

      {pakaiProfil && data?.pegawai && data.ringkasan_pegawai && (
        <DaftarPegawai
          baris={data.pegawai}
          ringkasan={data.ringkasan_pegawai}
          memuat={memuat}
          bolehKelola={bolehResetPin}
          nipPenuh={nipPenuh}
          onAlihNip={() => setNipPenuh((v) => !v)}
          onMuat={() => void muat()}
          onResetPin={(id, nama) => setResetPin({ id, nama })}
          wilayah={data.wilayah ?? null}
          onSimpan={async (v) => {
            const r = await fetchJson<{ ok: boolean; diubah_semua: number }>("/api/sigap/pengguna", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "ubah_profil_pegawai", ...v }) });
            setOk(r.diubah_semua > 0 ? `Tersimpan; kecamatan kantor ${r.diubah_semua} pegawai diseragamkan.` : "Domisili dan kecamatan kantor tersimpan.");
            await muat();
          }}
        />
      )}

      {!pakaiProfil && (
      <Kartu
        judul={jenis === "mitra" ? "Daftar Mitra Kepka" : "Daftar pegawai organik"}
        ket={`${terlihat.length} dari ${akun.length} akun${memuat ? " · memuat…" : ""}`}
        kanan={
          <button type="button" className={BTN_O} onClick={() => void muat()} disabled={memuat}>
            Muat ulang
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input aria-label="Cari nama" className={`${INPUT} min-w-[180px] flex-1`} placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#44546F]">
            <input type="checkbox" checked={hanyaAktif} onChange={(e) => setHanyaAktif(e.target.checked)} />
            Hanya akun aktif
          </label>
          {(jmlSaringan > 0 || kol.urut) && (
            <button type="button" className={BTN_O} onClick={() => setKol(STATUS_AWAL)}>
              Hapus saringan kolom{jmlSaringan > 0 ? ` (${jmlSaringan})` : ""}
            </button>
          )}
        </div>

        {bolehKelola && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-[#DDE6F3] bg-[#F9FBFE] p-2.5">
            <span className="text-[12.5px] font-semibold text-[#44546F]">{pilih.size} dipilih</span>
            <input aria-label="Nomor Kepka" className={`${INPUT} w-[170px]`} placeholder="No. Kepka (opsional)" value={noKepka} onChange={(e) => setNoKepka(e.target.value)} maxLength={80} />
            <input aria-label="Catatan" className={`${INPUT} min-w-[160px] flex-1`} placeholder="Catatan (opsional)" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={300} />
            <button type="button" className={BTN} disabled={sibuk || pilih.size === 0} onClick={() => void setPool("aktif")}>
              Masukkan ke pool {tahun}
            </button>
            <button type="button" className={BTN_O} disabled={sibuk || pilih.size === 0} onClick={() => void setPool("nonaktif")}>
              Nonaktifkan
            </button>
          </div>
        )}

        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              {bolehKelola && (
                <th className={TH}>
                  <input type="checkbox" aria-label="Pilih semua yang terlihat" checked={semuaTerpilih} onChange={alihSemua} />
                </th>
              )}
              {kepala("nama")}
              {kepala("kec")}
              {kepala("nag")}
              {kepala("id")}
              {kepala("lokasi")}
              {jenis === "mitra" && kepala("pool")}
              {kepala("masuk")}
            </tr>
          </thead>
          <tbody>
            {terlihat.slice(0, tampil).map((a) => {
              const buka = terbuka === a.id;
              return (
                <Fragment key={a.id}>
                  <tr className={`${a.aktif ? "" : "opacity-60"} ${buka ? "bg-[#F3F7FE]" : ""}`}>
                    {bolehKelola && (
                      <td className={TD}>
                        <input type="checkbox" aria-label={`Pilih ${a.nama}`} checked={pilih.has(a.id)} onChange={() => alih(a.id)} />
                      </td>
                    )}
                    <td className={`${TD} font-semibold text-[#1B2B4B]`}>
                      <button
                        type="button"
                        aria-expanded={buka}
                        aria-label={`${buka ? "Tutup" : "Buka"} aksi untuk ${a.nama}`}
                        className="inline-flex items-start gap-1.5 text-left font-semibold text-[#1B2B4B] hover:text-[#1F5FD1]"
                        onClick={() => setTerbuka(buka ? null : a.id)}
                      >
                        <span aria-hidden className="mt-[3px] text-[10px] text-[#6B7A90]">
                          {buka ? "▾" : "▸"}
                        </span>
                        <span>{a.nama}</span>
                      </button>
                      {!a.aktif && <span className="ml-1.5 text-[11px] font-bold text-[#B42329]">nonaktif</span>}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{kapitalWilayah(a.alamat_kecamatan) ?? "–"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{kapitalWilayah(a.alamat_nagari) ?? "–"}</td>
                    <td className={`${TD} font-mono text-[12px]`}>{(jenis === "mitra" ? a.nik : a.nip) ?? "–"}</td>
                    <td className={TD}>{chipLokasi(a)}</td>
                    {jenis === "mitra" && (
                      <td className={TD} title={a.pool?.catatan ?? undefined}>
                        {chipPool(a)}
                        {a.pool?.no_kepka && <span className="ml-1.5 text-[11px] text-[#6B7A90]">{a.pool.no_kepka}</span>}
                      </td>
                    )}
                    <td className={`${TD} text-[12px] text-[#6B7A90]`}>{a.terakhir_masuk_at ? waktuWib(a.terakhir_masuk_at) : "belum pernah"}</td>
                  </tr>
                  {buka && (
                    <tr className="bg-[#F3F7FE]">
                      <td className="border-t border-[#DDE6F3] px-3.5 py-2.5" colSpan={jumlahKolom}>
                        <div className="flex flex-wrap items-center gap-2">
                          {bolehResetPin ? (
                            <button type="button" className={`${BTN_O} whitespace-nowrap`} onClick={() => setResetPin({ id: a.id, nama: a.nama })}>
                              🔑 Reset PIN
                            </button>
                          ) : (
                            <span className="text-[12px] text-[#6B7A90]">Mode lihat saja: tidak punya izin mengelola.</span>
                          )}
                          {a.pool?.catatan && <span className="text-[12px] text-[#6B7A90]">Catatan pool: {a.pool.catatan}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {terlihat.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#6B7A90]`} colSpan={jumlahKolom}>
                  {memuat ? "Memuat…" : "Tidak ada akun yang cocok dengan saringan."}
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
        {jenis === "mitra" && ring.lokasi_belum > 0 && (
          <p className="mt-3 text-[12px] text-[#6B7A90]">
            {ring.lokasi_belum} akun Mitra belum punya titik domisili. Syarat jarak/domisili pada seleksi hanya berlaku bagi akun berkoordinat; sisanya perlu melengkapi lokasi.
          </p>
        )}
      </Kartu>
      )}

      {resetPin && <ResetPin url="/api/sigap/admin" akunId={resetPin.id} nama={resetPin.nama} tutup={() => setResetPin(null)} />}
    </div>
  );
}
