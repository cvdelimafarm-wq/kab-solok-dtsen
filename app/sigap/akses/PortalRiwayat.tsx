"use client";

// app/sigap/akses/PortalRiwayat.tsx
//
// (5 Okt 2026) Tab 🧭 Daftar Portal & Menu (read-only) dan 🕘 Riwayat (audit: waktu WIB, oleh, aksi,
// detail ringkas) -- halaman Kelola Peran & Akses, permintaan user.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ambil, pesanGalat, SesiBerakhir, waktuWib } from "../admin/api";
import { BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TabelKartu, TD, TH } from "../admin/ui";
import { ikonPortal, kelompokPortal, type DataAkses } from "./tipe";

export function DaftarPortal({ data }: { data: DataAkses }) {
  const grup = kelompokPortal(data.menu);
  const peranMenu = (kode: string) =>
    data.izin
      .filter((i) => i.menu_kode === kode)
      .map((i) => ({ nama: data.peran.find((p) => p.id === i.peran_id)?.nama ?? `#${i.peran_id}`, level: i.level }));
  return (
    <div className="space-y-3">
      <Kartu judul="🚌 Transport Lokal (petugas)">
        <p className="text-[12.5px] text-[#4D5B6B]">Isi laporan, foto, hari kerja &amp; arsip SPJ. Tampil otomatis bagi akun yang punya penugasan aktif — tidak diatur lewat peran.</p>
      </Kartu>
      {grup.map((g) => (
        <Kartu key={g.portal} judul={`${ikonPortal(g.portal)} ${g.portal}`} ket={`${g.menu.length} menu`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className={TH}>Menu</th>
                  <th className={TH}>Kode</th>
                  <th className={TH}>Keterangan</th>
                  <th className={TH}>Peran yang punya akses</th>
                </tr>
              </thead>
              <tbody>
                {g.menu.map((m) => (
                  <tr key={m.kode}>
                    <td className={`${TD} font-bold`}>{m.nama}</td>
                    <td className={`${TD} font-mono text-[11.5px] text-[#4D5B6B]`}>{m.kode}</td>
                    <td className={`${TD} text-[#4D5B6B]`}>{m.keterangan ?? "–"}</td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        {peranMenu(m.kode).map((x) => (
                          <Chip key={x.nama} w={x.level === "kelola" ? "ok" : "navy"}>
                            {x.nama} · {x.level === "kelola" ? "Kelola" : "Lihat"}
                          </Chip>
                        ))}
                        {peranMenu(m.kode).length === 0 && <span className="text-slate-400">–</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Kartu>
      ))}
      <Kartu judul="📊 RAB/POK · Revisi · Perjadin · Honor">
        <p className="text-[12.5px] text-[#7B8794]">Menyusul — menunya otomatis muncul di sini saat modulnya dibuat.</p>
      </Kartu>
    </div>
  );
}

// ---------------------------------------------------------------------- Riwayat
type Audit = { id: number; akun_id: number | null; aksi: string; detail: Record<string, unknown> | null; waktu: string; oleh: string };

const LABEL_AKSI: Record<string, string> = {
  izin_susulan: "Izin susulan",
  tambah_penugasan: "Tambah petugas",
  ubah_penugasan: "Ubah penugasan",
  simpan_st: "Simpan Surat Tugas",
  unggah_st_gabungan: "Unggah PDF ST gabungan",
  simpan_kegiatan: "Simpan kegiatan",
  simpan_tarif: "Simpan peran & tarif",
  kunci: "Verifikasi & kunci SPJ",
  buka_kunci: "Buka kunci SPJ",
  buat_peran: "Buat/ubah peran",
  simpan_izin: "Ubah izin peran",
  beri_peran: "Beri peran",
  cabut_peran: "Cabut peran",
};

function ringkasDetail(d: Record<string, unknown> | null): string {
  if (!d) return "–";
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      let s = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (s.length > 60) s = s.slice(0, 57) + "…";
      return `${k}: ${s}`;
    })
    .join(" · ");
}

export function Riwayat() {
  const [rows, setRows] = useState<Audit[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [fAksi, setFAksi] = useState("");

  const muat = useCallback(async () => {
    try {
      const d = await ambil<{ riwayat: Audit[] }>("riwayat");
      setRows(d.riwayat);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);

  const daftarAksi = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.aksi))).sort(), [rows]);
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!fAksi || r.aksi === fAksi) && (!q || r.oleh.toLowerCase().includes(q) || JSON.stringify(r.detail ?? {}).toLowerCase().includes(q)));
  }, [rows, cari, fAksi]);

  if (galat && !rows) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!rows) return <Memuat />;

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      <Kartu
        judul="Riwayat aksi admin"
        ket="200 aksi terakhir"
        kanan={
          <div className="flex flex-wrap items-center gap-2">
            <select value={fAksi} onChange={(e) => setFAksi(e.target.value)} className={INPUT} aria-label="Filter aksi">
              <option value="">Semua aksi</option>
              {daftarAksi.map((a) => (
                <option key={a} value={a}>
                  {LABEL_AKSI[a] ?? a}
                </option>
              ))}
            </select>
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama / detail…" className={`${INPUT} w-44`} />
            <button type="button" className={BTN_O} onClick={() => muat()}>
              Muat ulang
            </button>
          </div>
        }
      />
      <TabelKartu>
        <thead>
          <tr>
            <th className={TH}>Waktu (WIB)</th>
            <th className={TH}>Oleh</th>
            <th className={TH}>Aksi</th>
            <th className={TH}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {tampil.length === 0 && (
            <tr>
              <td colSpan={4} className={`${TD} py-8 text-center text-[#7B8794]`}>
                Belum ada riwayat.
              </td>
            </tr>
          )}
          {tampil.map((r) => (
            <tr key={r.id}>
              <td className={`${TD} whitespace-nowrap text-[#4D5B6B]`}>{waktuWib(r.waktu)}</td>
              <td className={`${TD} whitespace-nowrap font-semibold`}>{r.oleh}</td>
              <td className={`${TD} whitespace-nowrap`}>
                <Chip w={r.aksi.includes("kunci") ? "vio" : r.aksi.includes("cabut") ? "bad" : "navy"}>{LABEL_AKSI[r.aksi] ?? r.aksi}</Chip>
              </td>
              <td className={`${TD} max-w-[520px] text-[11.5px] text-[#4D5B6B]`} title={JSON.stringify(r.detail ?? {}, null, 1)}>
                {ringkasDetail(r.detail)}
              </td>
            </tr>
          ))}
        </tbody>
      </TabelKartu>
    </div>
  );
}
