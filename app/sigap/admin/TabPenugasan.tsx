"use client";

// app/sigap/admin/TabPenugasan.tsx
//
// (5 Okt 2026) Tab 👥 Penugasan & ST -- mockup-sigap-admin layar 3 (permintaan user):
//  - Tabel petugas (nama, peran, no ST, tujuan, periode, maks hari, file ST [lihat], aktif).
//  - "Ubah" membuka panel: ubah peran / maks hari / aktif + form Surat Tugas (nomor, tgl terbit, mulai,
//    selesai, tujuan dipisah koma).
//  - Tambah petugas: cari akun (debounce) -> peran -> maks hari -> Tambah.
//  - Kartu Unggah PDF Surat Tugas gabungan (./UnggahSt).
// Read-only bila boleh_kelola = false.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { aksi, ambil, bukaUrlAsync, fetchJson, pesanGalat, rentangPendek, SesiBerakhir } from "./api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TabelKartu, TD, TH } from "./ui";
import UnggahSt from "./UnggahSt";

export type StBaris = { id: number; nomor: string; tanggal_st: string | null; mulai: string | null; selesai: string | null; tujuan: string[]; ada_file: boolean };
export type BarisPen = {
  id: number;
  akun_id: number;
  peran: string;
  maks_hari: number | null;
  aktif: boolean;
  dikunci_at: string | null;
  nama: string;
  jenis: string;
  tarif: number;
  maks_efektif: number | null;
  st: StBaris | null;
};
type PeranOpsi = { peran: string; label_jabatan: string | null; tarif: number; maks_hari_default: number | null };
type Data = {
  kegiatan: { id: number; nama: string; tanggal_mulai: string | null; tanggal_selesai: string | null } | null;
  baris: BarisPen[];
  peran_opsi?: PeranOpsi[];
  boleh_kelola: boolean;
};
type Akun = { id: number; nama: string; jenis: string; alamat_kecamatan: string | null };

export default function TabPenugasan({ kegiatanId }: { kegiatanId: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [nonaktif, setNonaktif] = useState(false);
  const [ubahId, setUbahId] = useState<number | null>(null);

  const muat = useCallback(async () => {
    try {
      setData(await ambil<Data>("penugasan", { kegiatan_id: kegiatanId }));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [kegiatanId]);
  useEffect(() => {
    muat();
  }, [muat]);

  const opsiPeran = useMemo(() => {
    const dari = (data?.peran_opsi ?? []).map((p) => p.peran);
    return dari.length ? dari : Array.from(new Set((data?.baris ?? []).map((b) => b.peran)));
  }, [data]);
  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (data?.baris ?? []).filter((b) => (nonaktif || b.aktif) && (!q || b.nama.toLowerCase().includes(q) || (b.st?.nomor ?? "").toLowerCase().includes(q)));
  }, [data, cari, nonaktif]);

  async function lihatSt(stId: number) {
    try {
      await bukaUrlAsync(async () => (await fetchJson<{ url: string | null }>(`/api/sigap/admin/st-pdf?surat_tugas_id=${stId}`)).url);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }

  if (galat && !data) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!data) return <Memuat />;
  const kelola = data.boleh_kelola;
  const nAktif = data.baris.filter((b) => b.aktif).length;
  const nTanpaSt = data.baris.filter((b) => b.aktif && !b.st).length;
  const nTanpaFile = data.baris.filter((b) => b.aktif && b.st && !b.st.ada_file).length;

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && (
        <Pesan jenis="ok" onTutup={() => setOk(null)}>
          {ok}
        </Pesan>
      )}
      {!kelola && <Pesan jenis="info">Mode lihat saja — Anda tidak punya izin mengelola penugasan kegiatan ini.</Pesan>}

      {kelola && (
        <div className="grid gap-3 lg:grid-cols-2">
          <TambahPetugas
            kegiatanId={kegiatanId}
            opsi={data.peran_opsi ?? opsiPeran.map((p) => ({ peran: p, label_jabatan: null, tarif: 0, maks_hari_default: null }))}
            onTambah={async (nama) => {
              setOk(`${nama} ditambahkan ke kegiatan.`);
              await muat();
            }}
          />
          <UnggahSt kegiatanId={kegiatanId} baris={data.baris} onSelesai={muat} />
        </div>
      )}

      <Kartu
        judul="Petugas kegiatan"
        ket={`${nAktif} aktif · ${nTanpaSt} belum ada ST · ${nTanpaFile} ST belum berfile`}
        kanan={
          <div className="flex flex-wrap items-center gap-2">
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / no. ST…" className={`${INPUT} w-48`} />
            <label className="flex items-center gap-1.5 text-[12px] font-semibold text-[#4D5B6B]">
              <input type="checkbox" checked={nonaktif} onChange={(e) => setNonaktif(e.target.checked)} /> tampilkan nonaktif
            </label>
          </div>
        }
      />

      <TabelKartu>
        <thead>
          <tr>
            {["Petugas", "Peran", "No. ST", "Tujuan", "Periode", "Maks hari", "File ST", "Status", ""].map((h, i) => (
              <th key={i} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && (
            <tr>
              <td colSpan={9} className={`${TD} py-8 text-center text-[#7B8794]`}>
                Belum ada petugas{cari ? " yang cocok" : ""}.
              </td>
            </tr>
          )}
          {baris.map((b) => (
            <Fragment key={b.id}>
              <tr className={`${b.aktif ? "" : "opacity-60"} ${ubahId === b.id ? "bg-[#F8FAFC]" : ""}`}>
                <td className={`${TD} font-bold`}>
                  {b.nama}
                  {b.jenis === "organik" && <span className="ml-1 text-[10.5px] font-semibold text-[#7B8794]">(organik)</span>}
                  {b.dikunci_at && <span className="ml-1" title="SPJ dikunci">🔒</span>}
                </td>
                <td className={TD}>{b.peran.toUpperCase()}</td>
                <td className={`${TD} whitespace-nowrap`}>{b.st ? b.st.nomor : <Chip w="wait">belum ada ST</Chip>}</td>
                <td className={`${TD} max-w-[180px] truncate`} title={b.st?.tujuan.join(", ")}>
                  {b.st?.tujuan.join(", ") || "–"}
                </td>
                <td className={`${TD} whitespace-nowrap`}>{b.st && (b.st.mulai || b.st.selesai) ? rentangPendek(b.st.mulai, b.st.selesai) : <span className="text-[#7B8794]">periode kegiatan</span>}</td>
                <td className={`${TD} whitespace-nowrap`}>{b.maks_hari != null ? b.maks_hari : <span className="text-[#7B8794]">{b.maks_efektif != null ? `${b.maks_efektif} (default)` : "– (tanpa batas)"}</span>}</td>
                <td className={TD}>
                  {b.st?.ada_file ? (
                    <button type="button" onClick={() => lihatSt(b.st!.id)} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
                      PDF ✓ lihat
                    </button>
                  ) : (
                    <Chip>–</Chip>
                  )}
                </td>
                <td className={TD}>{b.aktif ? <Chip w="ok">aktif</Chip> : <Chip>nonaktif</Chip>}</td>
                <td className={`${TD} whitespace-nowrap text-right`}>
                  <button type="button" className={BTN_O} onClick={() => setUbahId(ubahId === b.id ? null : b.id)}>
                    {ubahId === b.id ? "Tutup" : kelola ? (b.st ? "Ubah" : "Isi ST") : "Detail"}
                  </button>
                </td>
              </tr>
              {ubahId === b.id && (
                <tr>
                  <td colSpan={9} className="border-t border-[#EDF0F4] bg-[#F8FAFC] px-3 py-3">
                    <PanelUbah
                      b={b}
                      kelola={kelola}
                      opsiPeran={opsiPeran}
                      onTersimpan={async (pesan) => {
                        setOk(pesan);
                        await muat();
                      }}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </TabelKartu>
    </div>
  );
}

// ---------------------------------------------------------------------- Panel ubah penugasan + ST
function PanelUbah({ b, kelola, opsiPeran, onTersimpan }: { b: BarisPen; kelola: boolean; opsiPeran: string[]; onTersimpan: (pesan: string) => void | Promise<void> }) {
  const [peran, setPeran] = useState(b.peran);
  const [maks, setMaks] = useState(b.maks_hari != null ? String(b.maks_hari) : "");
  const [aktif, setAktif] = useState(b.aktif);
  const [nomor, setNomor] = useState(b.st?.nomor ?? "");
  const [tglSt, setTglSt] = useState(b.st?.tanggal_st ?? "");
  const [mulai, setMulai] = useState(b.st?.mulai ?? "");
  const [selesai, setSelesai] = useState(b.st?.selesai ?? "");
  const [tujuan, setTujuan] = useState((b.st?.tujuan ?? []).join(", "));
  const [busy, setBusy] = useState<"pen" | "st" | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const opsi = opsiPeran.includes(b.peran) ? opsiPeran : [b.peran, ...opsiPeran];

  async function simpanPen() {
    const m = maks.trim();
    if (m && (!/^\d+$/.test(m) || Number(m) < 1)) return setGalat("Maks hari harus bilangan bulat ≥ 1 (kosong = default kegiatan).");
    setBusy("pen");
    setGalat(null);
    try {
      await aksi("ubah_penugasan", { penugasan_id: b.id, peran, maks_hari: m === "" ? null : Number(m), aktif });
      await onTersimpan(`Penugasan ${b.nama} disimpan.`);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(null);
    }
  }
  async function simpanSt() {
    if (!nomor.trim()) return setGalat("Nomor ST wajib diisi.");
    if (mulai && selesai && mulai > selesai) return setGalat("Tanggal mulai melewati tanggal selesai.");
    setBusy("st");
    setGalat(null);
    try {
      await aksi("simpan_st", {
        penugasan_id: b.id,
        nomor_st: nomor.trim(),
        tanggal_st: tglSt || null,
        tanggal_mulai: mulai || null,
        tanggal_selesai: selesai || null,
        tujuan: tujuan
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      await onTersimpan(`Surat Tugas ${b.nama} disimpan.`);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(null);
    }
  }

  const label = "text-[11px] font-bold text-[#7B8794]";
  return (
    <div className="space-y-2">
      {galat && (
        <Pesan onTutup={() => setGalat(null)}>
          {galat}
        </Pesan>
      )}
      <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="mb-2 text-[12.5px] font-extrabold">Penugasan</p>
          <div className="grid grid-cols-[90px_1fr] items-center gap-2">
            <span className={label}>Peran</span>
            <select value={peran} onChange={(e) => setPeran(e.target.value)} className={INPUT} disabled={!kelola}>
              {opsi.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
            <span className={label}>Maks hari</span>
            <input value={maks} onChange={(e) => setMaks(e.target.value)} inputMode="numeric" placeholder={b.maks_efektif != null && b.maks_hari == null ? `default ${b.maks_efektif}` : "kosong = default"} className={INPUT} disabled={!kelola} />
            <span className={label}>Status</span>
            <select value={aktif ? "1" : "0"} onChange={(e) => setAktif(e.target.value === "1")} className={INPUT} disabled={!kelola}>
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </div>
          {kelola && (
            <button type="button" onClick={simpanPen} className={`${BTN} mt-2.5`} disabled={busy !== null}>
              {busy === "pen" ? "Menyimpan…" : "Simpan penugasan"}
            </button>
          )}
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="mb-2 text-[12.5px] font-extrabold">Surat Tugas {b.st ? "" : <Chip w="wait">belum ada</Chip>}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-0.5 sm:col-span-2">
              <span className={label}>Nomor ST</span>
              <input value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder="mis. B-1285/13030/VS.330/2026" className={INPUT} disabled={!kelola} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={label}>Tanggal terbit</span>
              <input type="date" value={tglSt} onChange={(e) => setTglSt(e.target.value)} className={INPUT} disabled={!kelola} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className={label}>Mulai</span>
                <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} className={INPUT} disabled={!kelola} />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={label}>Selesai</span>
                <input type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} className={INPUT} disabled={!kelola} />
              </label>
            </div>
            <label className="flex flex-col gap-0.5 sm:col-span-2">
              <span className={label}>Tujuan (kecamatan, pisahkan dengan koma)</span>
              <input value={tujuan} onChange={(e) => setTujuan(e.target.value)} placeholder="mis. Bukit Sundi, Gunung Talang" className={INPUT} disabled={!kelola} />
            </label>
          </div>
          {kelola && (
            <button type="button" onClick={simpanSt} className={`${BTN} mt-2.5`} disabled={busy !== null}>
              {busy === "st" ? "Menyimpan…" : b.st ? "Simpan perubahan ST" : "Simpan ST"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- Tambah petugas
function TambahPetugas({ kegiatanId, opsi, onTambah }: { kegiatanId: number; opsi: PeranOpsi[]; onTambah: (nama: string) => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<Akun[]>([]);
  const [mencari, setMencari] = useState(false);
  const [pilih, setPilih] = useState<Akun | null>(null);
  const [peran, setPeran] = useState(opsi[0]?.peran ?? "");
  const [maks, setMaks] = useState("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!peran && opsi[0]) setPeran(opsi[0].peran);
  }, [opsi, peran]);

  // (5 Okt 2026) cari akun master dgn debounce 300 ms
  useEffect(() => {
    if (pilih) return;
    const kata = q.trim();
    if (kata.length < 2) {
      setHasil([]);
      return;
    }
    let batal = false;
    setMencari(true);
    const t = setTimeout(async () => {
      try {
        const d = await ambil<{ akun: Akun[] }>("cari_akun", { q: kata });
        if (!batal) setHasil(d.akun);
      } catch (e) {
        if (!batal && !(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      } finally {
        if (!batal) setMencari(false);
      }
    }, 300);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [q, pilih]);

  const defaultMaks = opsi.find((o) => o.peran === peran)?.maks_hari_default ?? null;

  async function tambah() {
    if (!pilih) return setGalat("Pilih akun dari hasil pencarian.");
    if (!peran) return setGalat("Pilih peran (atur dulu di tab Kegiatan & Tarif bila belum ada).");
    const m = maks.trim();
    if (m && (!/^\d+$/.test(m) || Number(m) < 1)) return setGalat("Maks hari harus bilangan bulat ≥ 1.");
    setBusy(true);
    setGalat(null);
    try {
      await aksi("tambah_penugasan", { kegiatan_id: kegiatanId, akun_id: pilih.id, peran, maks_hari: m === "" ? null : Number(m) });
      const nama = pilih.nama;
      setPilih(null);
      setQ("");
      setMaks("");
      setHasil([]);
      await onTambah(nama);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Kartu judul="Tambah petugas ke kegiatan">
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-[200px] flex-1">
          {pilih ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#1F6FD1]/40 bg-[#E3EEFB] px-2.5 py-1.5 text-[13px]">
              <b className="flex-1 truncate">{pilih.nama}</b>
              <span className="text-[11px] text-[#4D5B6B]">{pilih.jenis}</span>
              <button type="button" onClick={() => setPilih(null)} className="font-bold text-[#1F6FD1]" aria-label="Ganti akun">
                ×
              </button>
            </div>
          ) : (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama dari master petugas…" className={`${INPUT} w-full`} />
          )}
          {!pilih && q.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {mencari && hasil.length === 0 && <p className="px-3 py-2 text-[12px] text-[#7B8794]">Mencari…</p>}
              {!mencari && hasil.length === 0 && <p className="px-3 py-2 text-[12px] text-[#7B8794]">Tidak ditemukan.</p>}
              {hasil.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setPilih(a);
                    setHasil([]);
                  }}
                  className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-[12.5px] last:border-0 hover:bg-[#F8FAFC]"
                >
                  <b className="flex-1">{a.nama}</b>
                  <span className="text-[11px] text-[#7B8794]">
                    {a.jenis}
                    {a.alamat_kecamatan ? ` · ${a.alamat_kecamatan}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select value={peran} onChange={(e) => setPeran(e.target.value)} className={INPUT} aria-label="Peran">
          {opsi.length === 0 && <option value="">(belum ada peran)</option>}
          {opsi.map((o) => (
            <option key={o.peran} value={o.peran}>
              {o.peran.toUpperCase()}
            </option>
          ))}
        </select>
        <input value={maks} onChange={(e) => setMaks(e.target.value)} inputMode="numeric" placeholder={defaultMaks ? `Maks hari (default ${defaultMaks})` : "Maks hari (kosong = default)"} className={`${INPUT} w-44`} />
        <button type="button" onClick={tambah} className={BTN} disabled={busy || !pilih || !peran}>
          {busy ? "Menambah…" : "＋ Tambah"}
        </button>
      </div>
      {opsi.length === 0 && <p className="mt-2 text-[11.5px] text-amber-800">Kegiatan ini belum punya peran/tarif. Atur di tab ⚙️ Kegiatan &amp; Tarif.</p>}
      {galat && (
        <div className="mt-2">
          <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-[#7B8794]">Bila akun sudah pernah ditugaskan di kegiatan ini, datanya diperbarui dan diaktifkan kembali.</p>
    </Kartu>
  );
}
