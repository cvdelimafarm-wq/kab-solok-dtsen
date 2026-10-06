"use client";

// app/sigap/akses/LogLogin.tsx
//
// (6 Okt 2026) Tab "🕒 Log Login" -- permintaan user: cek kapan terakhir & berapa lama tiap pengguna login.
// Sumber: sigap_log_sesi (masuk = sesi baru; detak halaman tiap ±1 menit memperpanjang sesi, jeda > 30 menit
// = sesi baru). Durasi = perkiraan waktu aktif (mulai s.d. detak terakhir).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ambil, pesanGalat, SesiBerakhir, waktuWib } from "../admin/api";
import { BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TabelKartu, TD, TH } from "../admin/ui";

type Baris = {
  akun_id: number;
  nama: string;
  jenis: string;
  peran: string[];
  terakhir_masuk: string | null;
  terakhir_aktif: string | null;
  durasi_terakhir_detik: number;
  jumlah_sesi: number;
  total_detik: number;
  total_7hari_detik: number;
  perangkat: string | null;
  halaman: string | null;
};
type Sesi = { id: number; mulai_at: string; terakhir_aktif_at: string; halaman: string | null; perangkat: string | null; cara: string | null };
type Urut = "aktif" | "nama" | "total" | "sesi";

export function durasi(detik: number): string {
  if (detik < 60) return detik > 0 ? "< 1 mnt" : "–";
  const j = Math.floor(detik / 3600);
  const m = Math.round((detik % 3600) / 60);
  return j > 0 ? `${j} j ${m} mnt` : `${m} mnt`;
}
function relatif(iso: string | null): string {
  if (!iso) return "–";
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 120) return "baru saja";
  if (d < 3600) return `${Math.round(d / 60)} mnt lalu`;
  if (d < 86400) return `${Math.round(d / 3600)} jam lalu`;
  return `${Math.round(d / 86400)} hari lalu`;
}

export default function LogLogin() {
  const [hari, setHari] = useState(30);
  const [rows, setRows] = useState<Baris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<Urut>("aktif");
  const [buka, setBuka] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, Sesi[]>>({});

  const muat = useCallback(async () => {
    try {
      const d = await ambil<{ rows: Baris[] }>("log_login", { hari });
      setRows(d.rows);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [hari]);
  useEffect(() => {
    muat();
  }, [muat]);

  async function bukaDetail(id: number) {
    setBuka((b) => (b === id ? null : id));
    if (detail[id]) return;
    try {
      const d = await ambil<{ sesi: Sesi[] }>("log_login", { akun_id: id });
      setDetail((x) => ({ ...x, [id]: d.sesi }));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const r = (rows ?? []).filter((x) => !q || x.nama.toLowerCase().includes(q));
    return [...r].sort((a, b) =>
      urut === "nama" ? a.nama.localeCompare(b.nama) : urut === "total" ? b.total_detik - a.total_detik : urut === "sesi" ? b.jumlah_sesi - a.jumlah_sesi : (b.terakhir_aktif ?? "").localeCompare(a.terakhir_aktif ?? "")
    );
  }, [rows, cari, urut]);

  const ringkas = useMemo(() => {
    const r = rows ?? [];
    const hariIni = r.filter((x) => x.terakhir_aktif && Date.now() - Date.parse(x.terakhir_aktif) < 86_400_000).length;
    const online = r.filter((x) => x.terakhir_aktif && Date.now() - Date.parse(x.terakhir_aktif) < 5 * 60_000).length;
    return { total: r.length, hariIni, online };
  }, [rows]);

  if (galat && !rows) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!rows) return <Memuat />;

  const SortTh = ({ k, children }: { k: Urut; children: React.ReactNode }) => (
    <th className={`${TH} cursor-pointer select-none hover:text-[#0F3D7A]`} onClick={() => setUrut(k)}>
      {children}
      {urut === k ? " ▾" : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      <Kartu
        judul="Log login & durasi pemakaian"
        ket={`${ringkas.total} akun aktif dalam ${hari} hari · ${ringkas.hariIni} dalam 24 jam · ${ringkas.online} sedang online`}
        kanan={
          <div className="flex flex-wrap items-center gap-2">
            <select value={hari} onChange={(e) => setHari(Number(e.target.value))} className={INPUT} aria-label="Rentang">
              <option value={1}>24 jam terakhir</option>
              <option value={7}>7 hari</option>
              <option value={30}>30 hari</option>
              <option value={90}>90 hari</option>
            </select>
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama…" className={`${INPUT} w-44`} />
            <button type="button" className={BTN_O} onClick={() => muat()}>
              Muat ulang
            </button>
          </div>
        }
      >
        <p className="text-[11.5px] text-[#6B7890]">
          Durasi = perkiraan waktu aktif (dari masuk s.d. aktivitas terakhir di halaman SIGAP). Jeda lebih dari 30 menit dihitung sebagai sesi baru. Pencatatan mulai 6 Okt 2026.
        </p>
      </Kartu>
      <TabelKartu>
        <thead>
          <tr>
            <SortTh k="nama">Nama</SortTh>
            <th className={TH}>Peran</th>
            <th className={TH}>Terakhir masuk</th>
            <SortTh k="aktif">Terakhir aktif</SortTh>
            <th className={TH}>Durasi sesi terakhir</th>
            <SortTh k="sesi">Sesi</SortTh>
            <th className={TH}>Total 7 hari</th>
            <SortTh k="total">Total {hari} hari</SortTh>
            <th className={TH}>Perangkat</th>
          </tr>
        </thead>
        <tbody>
          {tampil.length === 0 && (
            <tr>
              <td colSpan={9} className={`${TD} py-8 text-center text-[#6B7890]`}>
                Belum ada aktivitas tercatat pada rentang ini.
              </td>
            </tr>
          )}
          {tampil.map((r) => {
            const online = r.terakhir_aktif && Date.now() - Date.parse(r.terakhir_aktif) < 5 * 60_000;
            return (
              <Fragment key={r.akun_id}>
                <tr className="cursor-pointer hover:bg-[#F6F8FB]" onClick={() => bukaDetail(r.akun_id)}>
                  <td className={`${TD} font-semibold`}>
                    {online && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" title="Sedang online" />}
                    {r.nama}
                  </td>
                  <td className={TD}>
                    <span className="flex flex-wrap gap-1">
                      {r.peran.length ? r.peran.map((p) => <Chip key={p} w="navy">{p}</Chip>) : <Chip>{r.jenis || "–"}</Chip>}
                    </span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-[#55627A]`}>{r.terakhir_masuk ? waktuWib(r.terakhir_masuk) : "–"}</td>
                  <td className={`${TD} whitespace-nowrap`} title={r.terakhir_aktif ? waktuWib(r.terakhir_aktif) : ""}>
                    {relatif(r.terakhir_aktif)}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{durasi(r.durasi_terakhir_detik)}</td>
                  <td className={TD}>{r.jumlah_sesi}</td>
                  <td className={`${TD} whitespace-nowrap`}>{durasi(r.total_7hari_detik)}</td>
                  <td className={`${TD} whitespace-nowrap font-semibold`}>{durasi(r.total_detik)}</td>
                  <td className={`${TD} whitespace-nowrap text-[11.5px] text-[#55627A]`}>{r.perangkat ?? "–"}</td>
                </tr>
                {buka === r.akun_id && (
                  <tr>
                    <td colSpan={9} className="bg-[#F6F8FB] px-3 py-2">
                      {!detail[r.akun_id] ? (
                        <Memuat teks="Memuat sesi…" />
                      ) : (
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-left text-[11px] text-[#6B7890]">
                              <th className="py-1 pr-3">Mulai</th>
                              <th className="py-1 pr-3">Terakhir aktif</th>
                              <th className="py-1 pr-3">Durasi</th>
                              <th className="py-1 pr-3">Halaman terakhir</th>
                              <th className="py-1 pr-3">Perangkat</th>
                              <th className="py-1">Cara</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail[r.akun_id].map((x) => (
                              <tr key={x.id} className="border-t border-[#E3E8F0]">
                                <td className="py-1 pr-3 whitespace-nowrap">{waktuWib(x.mulai_at)}</td>
                                <td className="py-1 pr-3 whitespace-nowrap">{waktuWib(x.terakhir_aktif_at)}</td>
                                <td className="py-1 pr-3 whitespace-nowrap">{durasi(Math.round((Date.parse(x.terakhir_aktif_at) - Date.parse(x.mulai_at)) / 1000))}</td>
                                <td className="py-1 pr-3">{x.halaman ?? "–"}</td>
                                <td className="py-1 pr-3 whitespace-nowrap">{x.perangkat ?? "–"}</td>
                                <td className="py-1">{x.cara === "masuk" ? "masuk (nama + PIN)" : x.cara === "buat_pin" ? "buat PIN" : "lanjut (sesi tersimpan)"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </TabelKartu>
    </div>
  );
}
