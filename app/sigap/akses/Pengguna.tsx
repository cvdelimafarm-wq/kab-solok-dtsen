"use client";

// app/sigap/akses/Pengguna.tsx
//
// (31 Okt 2026) Tab 👥 Pengguna di Kelola Peran & Akses: daftar akun dibagi dua -- "Mitra Kepka" (pool yang boleh dipekerjakan, ditandai per tahun)
// dan "Pegawai organik". Biodata ringkas (kecamatan, NIK/NIP disamarkan, kelengkapan lokasi, terakhir masuk). Penanda pool hanya untuk Mitra.
// Kelengkapan lokasi (domisili berkoordinat/terverifikasi) adalah bahan syarat jarak/domisili pada seleksi nanti.
// Logika murni (saringan, ringkasan, lokasi): lib/penggunaPool.ts. Data: /api/sigap/pengguna.

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Pesan, TabelKartu, TD, TH } from "../admin/ui";
import { daftarKecamatan, ringkas, saring, statusLokasi, type AkunPengguna, type FilterLokasi, type FilterPool, type JenisPengguna, type Ringkasan } from "@/lib/penggunaPool";

type Respons = { tahun: number; jenis: JenisPengguna; tabel_pool_siap: boolean; boleh_kelola: boolean; ringkasan: Ringkasan; akun: AkunPengguna[] };

const HALAMAN = 200;

export default function Pengguna() {
  const [jenis, setJenis] = useState<JenisPengguna>("mitra");
  const [tahun, setTahun] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<Respons | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [q, setQ] = useState("");
  const [fPool, setFPool] = useState<FilterPool>("semua");
  const [fLokasi, setFLokasi] = useState<FilterLokasi>("semua");
  const [fKec, setFKec] = useState("");
  const [hanyaAktif, setHanyaAktif] = useState(true);
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [tampil, setTampil] = useState(HALAMAN);
  const [noKepka, setNoKepka] = useState("");
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const d = await fetchJson<Respons>(`/api/sigap/pengguna?jenis=${jenis}&tahun=${tahun}`);
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setMemuat(false);
    }
  }, [jenis, tahun]);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    setPilih(new Set());
    setTampil(HALAMAN);
  }, [jenis, q, fPool, fLokasi, fKec, hanyaAktif]);

  const akun = useMemo(() => data?.akun ?? [], [data]);
  const kecamatan = useMemo(() => daftarKecamatan(akun), [akun]);
  const terlihat = useMemo(() => saring(akun, { q, pool: jenis === "mitra" ? fPool : "semua", lokasi: fLokasi, kecamatan: fKec, hanyaAktif }), [akun, q, fPool, fLokasi, fKec, hanyaAktif, jenis]);
  const ring = useMemo(() => data?.ringkasan ?? ringkas(akun), [data, akun]);
  const bolehKelola = data?.boleh_kelola === true && data.tabel_pool_siap && jenis === "mitra";

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

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {kpi(jenis === "mitra" ? "Akun Mitra" : "Pegawai organik", ring.total)}
        {jenis === "mitra" ? kpi(`Pool aktif ${tahun}`, ring.pool_aktif, "text-[#13794B]") : kpi("Akun aktif", ring.aktif, "text-[#13794B]")}
        {jenis === "mitra" ? kpi("Belum masuk pool", ring.belum_pool, ring.belum_pool > 0 ? "text-[#8A6200]" : undefined) : kpi("Tanpa titik domisili", ring.lokasi_belum, ring.lokasi_belum > 0 ? "text-[#8A6200]" : undefined)}
        {jenis === "mitra" ? kpi("Lokasi lengkap", `${ring.lokasi_terverifikasi + ring.lokasi_berkoordinat}/${ring.total}`) : kpi("Lokasi terverifikasi", ring.lokasi_terverifikasi)}
      </div>

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
          {jenis === "mitra" && (
            <select aria-label="Saring pool" className={INPUT} value={fPool} onChange={(e) => setFPool(e.target.value as FilterPool)}>
              <option value="semua">Semua status pool</option>
              <option value="aktif">Pool aktif</option>
              <option value="nonaktif">Pool nonaktif</option>
              <option value="belum">Belum masuk pool</option>
            </select>
          )}
          <select aria-label="Saring lokasi" className={INPUT} value={fLokasi} onChange={(e) => setFLokasi(e.target.value as FilterLokasi)}>
            <option value="semua">Semua lokasi</option>
            <option value="terverifikasi">Terverifikasi</option>
            <option value="berkoordinat">Berkoordinat</option>
            <option value="belum">Belum ada titik</option>
          </select>
          <select aria-label="Saring kecamatan" className={INPUT} value={fKec} onChange={(e) => setFKec(e.target.value)}>
            <option value="">Semua kecamatan</option>
            {kecamatan.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#44546F]">
            <input type="checkbox" checked={hanyaAktif} onChange={(e) => setHanyaAktif(e.target.checked)} />
            Hanya akun aktif
          </label>
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
              <th className={TH}>Nama</th>
              <th className={TH}>Kecamatan</th>
              <th className={TH}>{jenis === "mitra" ? "NIK" : "NIP"}</th>
              <th className={TH}>Lokasi</th>
              {jenis === "mitra" && <th className={TH}>Pool {tahun}</th>}
              <th className={TH}>Terakhir masuk</th>
            </tr>
          </thead>
          <tbody>
            {terlihat.slice(0, tampil).map((a) => (
              <tr key={a.id} className={a.aktif ? "" : "opacity-60"}>
                {bolehKelola && (
                  <td className={TD}>
                    <input type="checkbox" aria-label={`Pilih ${a.nama}`} checked={pilih.has(a.id)} onChange={() => alih(a.id)} />
                  </td>
                )}
                <td className={`${TD} font-semibold text-[#1B2B4B]`}>
                  {a.nama}
                  {!a.aktif && <span className="ml-1.5 text-[11px] font-bold text-[#B42329]">nonaktif</span>}
                </td>
                <td className={TD}>{a.alamat_kecamatan ?? "–"}</td>
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
            ))}
            {terlihat.length === 0 && (
              <tr>
                <td className={`${TD} text-center text-[#6B7A90]`} colSpan={7}>
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
    </div>
  );
}
