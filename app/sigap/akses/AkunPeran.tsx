"use client";

// app/sigap/akses/AkunPeran.tsx
//
// (5 Okt 2026) Tab 👤 Akun & Peran -- tabel akun-peran + lingkup kegiatan; form beri peran (cari akun,
// pilih peran, lingkup kegiatan wajib bila peran butuh_lingkup); cabut dgn konfirmasi. -- permintaan user.

import { useEffect, useMemo, useState } from "react";
import { aksi, ambil, pesanGalat, SesiBerakhir, waktuWib } from "../admin/api";
import { BTN, BTN_R, Chip, INPUT, Kartu, Pesan, TabelKartu, TD, TH } from "../admin/ui";
import type { DataAkses } from "./tipe";

type Akun = { id: number; nama: string; jenis: string; alamat_kecamatan: string | null };

export default function AkunPeranTab({ data, onMuatUlang }: { data: DataAkses; onMuatUlang: () => void | Promise<void> }) {
  const [cari, setCari] = useState("");
  const [fPeran, setFPeran] = useState<number | "">("");
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const kelola = data.boleh_kelola;
  const namaPeran = (id: number) => data.peran.find((p) => p.id === id)?.nama ?? `#${id}`;
  const kodePeran = (id: number) => data.peran.find((p) => p.id === id)?.kode ?? "";
  const namaKeg = (id: number | null) => (id == null ? "semua kegiatan" : data.kegiatan.find((k) => k.id === id)?.nama ?? `kegiatan #${id}`);
  const nAdmin = data.akun_peran.filter((x) => kodePeran(x.peran_id) === "admin_anggaran").length;

  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return [...data.akun_peran]
      .filter((x) => (!q || x.nama.toLowerCase().includes(q)) && (!fPeran || x.peran_id === fPeran))
      .sort((a, b) => a.nama.localeCompare(b.nama) || a.peran_id - b.peran_id);
  }, [data.akun_peran, cari, fPeran]);

  async function cabut(id: number, nama: string, peran: string, lingkup: string) {
    if (!window.confirm(`Cabut peran ${peran} (${lingkup}) dari ${nama}?`)) return;
    setBusy(id);
    setGalat(null);
    try {
      await aksi("cabut_peran", { akun_peran_id: id });
      setOk(`Peran ${peran} dicabut dari ${nama}.`);
      await onMuatUlang();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(null);
    }
  }

  const warnaPeran = (kode: string) => (kode === "admin_anggaran" ? "ok" : kode === "pj_kegiatan" ? "vio" : kode === "bendahara" ? "wait" : "navy");

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && (
        <Pesan jenis="ok" onTutup={() => setOk(null)}>
          {ok}
        </Pesan>
      )}
      {kelola && (
        <BeriPeran
          data={data}
          onTersimpan={async (pesan) => {
            setOk(pesan);
            await onMuatUlang();
          }}
        />
      )}
      <Kartu
        judul="Akun & peran"
        ket={`${data.akun_peran.length} pemberian peran · satu akun boleh punya beberapa peran`}
        kanan={
          <div className="flex flex-wrap items-center gap-2">
            <select value={fPeran} onChange={(e) => setFPeran(Number(e.target.value) || "")} className={INPUT} aria-label="Filter peran">
              <option value="">Semua peran</option>
              {data.peran.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari akun…" className={`${INPUT} w-44`} />
          </div>
        }
      />
      <TabelKartu>
        <thead>
          <tr>
            {["Akun", "Peran", "Lingkup", "Diberi oleh", "Sejak", ""].map((h, i) => (
              <th key={i} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className={`${TD} py-8 text-center text-[#6B7890]`}>
                Tidak ada data.
              </td>
            </tr>
          )}
          {rows.map((x) => {
            const kode = kodePeran(x.peran_id);
            const adminTerakhir = kode === "admin_anggaran" && nAdmin <= 1;
            return (
              <tr key={x.id}>
                <td className={`${TD} font-bold`}>{x.nama}</td>
                <td className={TD}>
                  <Chip w={warnaPeran(kode)}>{namaPeran(x.peran_id)}</Chip>
                </td>
                <td className={TD}>{namaKeg(x.kegiatan_id)}</td>
                <td className={`${TD} text-[#55627A]`}>{x.diberi_oleh ?? "–"}</td>
                <td className={`${TD} whitespace-nowrap text-[#55627A]`}>{waktuWib(x.dibuat_at)}</td>
                <td className={`${TD} text-right`}>
                  {kelola &&
                    (adminTerakhir ? (
                      <span className="text-[11px] font-semibold text-[#8592A8]" title="Admin terakhir tidak bisa dicabut, supaya sistem tidak terkunci.">
                        terkunci*
                      </span>
                    ) : (
                      <button type="button" className={BTN_R} disabled={busy !== null} onClick={() => cabut(x.id, x.nama, namaPeran(x.peran_id), namaKeg(x.kegiatan_id))}>
                        {busy === x.id ? "…" : "Cabut"}
                      </button>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TabelKartu>
      <p className="px-1 text-[11.5px] text-[#6B7890]">*Admin anggaran terakhir tidak bisa dicabut, supaya sistem tidak terkunci.</p>
    </div>
  );
}

// ---------------------------------------------------------------------- Form beri peran
function BeriPeran({ data, onTersimpan }: { data: DataAkses; onTersimpan: (pesan: string) => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<Akun[]>([]);
  const [mencari, setMencari] = useState(false);
  const [akun, setAkun] = useState<Akun | null>(null);
  const [peranId, setPeranId] = useState<number | "">("");
  const [kegId, setKegId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const peran = data.peran.find((p) => p.id === peranId) ?? null;

  // (5 Okt 2026) cari akun master dgn debounce 300 ms
  useEffect(() => {
    if (akun) return;
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
  }, [q, akun]);

  async function beri(e: React.FormEvent) {
    e.preventDefault();
    if (!akun) return setGalat("Pilih akun dari hasil pencarian.");
    if (!peran) return setGalat("Pilih peran.");
    if (peran.butuh_lingkup && !kegId) return setGalat(`Peran ${peran.nama} wajib dipilih kegiatannya.`);
    setBusy(true);
    setGalat(null);
    try {
      await aksi("beri_peran", { akun_id: akun.id, peran_id: peran.id, kegiatan_id: kegId || null });
      const keg = kegId ? data.kegiatan.find((k) => k.id === kegId)?.nama : "semua kegiatan";
      const pesan = `${akun.nama} kini berperan ${peran.nama} (${keg}).`;
      setAkun(null);
      setQ("");
      setKegId("");
      await onTersimpan(pesan);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Kartu judul="Beri peran ke akun">
      <form onSubmit={beri} className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-[220px] flex-1">
          {akun ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#0F3D7A]/40 bg-[#E8EEF8] px-2.5 py-1.5 text-[13px]">
              <b className="flex-1 truncate">{akun.nama}</b>
              <span className="text-[11px] text-[#55627A]">{akun.jenis}</span>
              <button type="button" onClick={() => setAkun(null)} className="font-bold text-[#0F3D7A]" aria-label="Ganti akun">
                ×
              </button>
            </div>
          ) : (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari akun dari master…" className={`${INPUT} w-full`} />
          )}
          {!akun && q.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {mencari && hasil.length === 0 && <p className="px-3 py-2 text-[12px] text-[#6B7890]">Mencari…</p>}
              {!mencari && hasil.length === 0 && <p className="px-3 py-2 text-[12px] text-[#6B7890]">Tidak ditemukan.</p>}
              {hasil.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAkun(a);
                    setHasil([]);
                  }}
                  className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left text-[12.5px] last:border-0 hover:bg-[#F6F8FB]"
                >
                  <b className="flex-1">{a.nama}</b>
                  <span className="text-[11px] text-[#6B7890]">
                    {a.jenis}
                    {a.alamat_kecamatan ? ` · ${a.alamat_kecamatan}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select
          value={peranId}
          onChange={(e) => {
            const id = Number(e.target.value) || "";
            setPeranId(id);
          }}
          className={INPUT}
          aria-label="Peran"
        >
          <option value="">Pilih peran…</option>
          {data.peran.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>
        <select value={kegId} onChange={(e) => setKegId(Number(e.target.value) || "")} className={`${INPUT} max-w-[260px]`} aria-label="Lingkup kegiatan">
          <option value="">{peran?.butuh_lingkup ? "Pilih kegiatan (wajib)…" : "Lingkup: semua kegiatan"}</option>
          {data.kegiatan.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama}
            </option>
          ))}
        </select>
        <button type="submit" className={BTN} disabled={busy || !akun || !peran || (peran.butuh_lingkup && !kegId)}>
          {busy ? "Menyimpan…" : "Beri peran"}
        </button>
      </form>
      {peran?.keterangan && <p className="mt-2 text-[11.5px] text-[#6B7890]">{peran.nama}: {peran.keterangan}</p>}
      {galat && (
        <div className="mt-2">
          <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>
        </div>
      )}
    </Kartu>
  );
}
