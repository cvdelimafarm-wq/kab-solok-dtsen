"use client";

// (7 Okt 2026) Admin Aplikasi -- permintaan user: admin aplikasi (saat ini M. Iqbal Hadi, bisa ditambah/dikelola) di atas
// admin anggaran, admin per aplikasi (admin delego, admin dtsen, dll), dan periode "tgl selesai kegiatan + 7"
// yg dapat diedit admin anggaran. Admin Anggaran (tanpa peran Admin Aplikasi) hanya melihat bagian Periode.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiPortal, bacaSesi } from "../sesi";

type Pemegang = { akun_peran_id: number; akun_id: number; nama: string };
type Aplikasi = { kode: string; nama: string; uraian: string | null; href: string | null; aktif: boolean; peran_admin: string; nama_peran: string; admin: Pemegang[] };
type Kegiatan = {
  id: number;
  nama: string;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  hari_tenggang: number;
  dibuka_sampai: string | null;
  aktif: boolean;
  periode_diubah_oleh: string | null;
  pj: string[];
  periode: { status: string; ditutup: string | null; sisa_hari: number | null; dibuka_ulang: boolean };
};
type Data = { boleh_admin: boolean; hari_ini: string; admin_aplikasi: Pemegang[]; aplikasi: Aplikasi[]; kegiatan: Kegiatan[] };

const STATUS: Record<string, { label: string; kelas: string }> = {
  aktif: { label: "Aktif", kelas: "bg-[#E3F4EE] text-[#1E7A5E]" },
  tenggang: { label: "Tenggang", kelas: "bg-[#FDF1DC] text-[#8A5A0B]" },
  arsip: { label: "Arsip baca-saja", kelas: "bg-[#EDF1F5] text-[#4D5B6B]" },
  akan_datang: { label: "Akan datang", kelas: "bg-[#E8F1FC] text-[#1A5DB0]" },
  belum_diatur: { label: "Tgl selesai belum diatur", kelas: "bg-[#E8F1FC] text-[#1A5DB0]" },
};

const KARTU = "overflow-hidden rounded-xl border border-[#E3E8EE] bg-white";
const TH = "border-b border-[#E3E8EE] bg-[#F7F9FB] px-3.5 py-2.5 text-left text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#7B8794]";
const TD = "border-b border-[#EDF1F5] px-3.5 py-2.5 align-middle text-[13.5px]";
const TOMBOL = "rounded-md px-2.5 py-1 text-[13px] font-semibold text-[#1F6FD1] hover:bg-[#E8F1FC] disabled:opacity-50";

function tgl(iso: string | null): string {
  if (!iso) return "-";
  const b = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${b[m - 1]} ${y}`;
}

export default function AdminAplikasiPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!bacaSesi()) {
      window.location.replace(`/?lanjut=${encodeURIComponent("/portal/admin")}`);
      return;
    }
    try {
      setData(await apiPortal<Data>("/api/portal/admin"));
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return window.location.replace(`/?lanjut=${encodeURIComponent("/portal/admin")}`);
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  async function aksi(body: Record<string, unknown>, sukses: string) {
    setError(null);
    setPesan(null);
    try {
      await apiPortal("/api/portal/admin", { method: "POST", body: JSON.stringify(body) });
      setPesan(sukses);
      await muat();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
      return false;
    }
  }

  return (
    <main className="min-h-screen bg-[#F3F5F8] pb-16 text-[#14202E]">
      <header className="bg-[#0E2A47] px-4 py-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/" className="text-[13px] text-[#C9D6E6] hover:text-white">← Beranda portal</Link>
          <span className="flex items-center gap-4">
            {data?.boleh_admin && <Link href="/portal/admin/tahap" className="text-[13px] font-semibold text-[#F4B400] hover:underline">Atur tahap kegiatan →</Link>}
            <span className="text-[12.5px] font-bold italic tracking-wide">BPS KABUPATEN SOLOK</span>
          </span>
        </div>
        <div className="mx-auto mt-4 max-w-6xl">
          <p className="text-[12.5px] text-[#C9D6E6]">{data?.boleh_admin ? "Admin Aplikasi" : "Admin Anggaran"}</p>
          <h1 className="text-[24px] font-bold">{data?.boleh_admin ? "Aplikasi, admin & periode" : "Periode kegiatan"}</h1>
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-6xl space-y-5 px-4">
        {error && <p className="rounded-lg border-l-4 border-[#C2412D] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#8A2B1D]">{error}</p>}
        {pesan && <p className="rounded-lg border-l-4 border-[#1E7A5E] bg-[#E3F4EE] px-3 py-2 text-[13px] text-[#14532D]">{pesan}</p>}
        {!data && !error && <p className="text-[13.5px] text-[#7B8794]">Memuat…</p>}

        {data?.boleh_admin && (
          <>
            <section className={`${KARTU} flex flex-wrap items-center gap-4 p-5`}>
              <div className="min-w-[260px] flex-1">
                <h2 className="text-[15px] font-bold">Admin Aplikasi (tingkat tertinggi)</h2>
                <p className="mt-1 text-[13px] text-[#4D5B6B]">Mengelola semua aplikasi, menunjuk admin per aplikasi, dan melihat semua arsip. Minimal harus ada 1 orang.</p>
              </div>
              <DaftarPemegang
                pemegang={data.admin_aplikasi}
                minimal
                onCabut={(p) => confirm(`Cabut peran Admin Aplikasi dari ${p.nama}?`) && aksi({ aksi: "cabut_admin", akun_peran_id: p.akun_peran_id }, `Peran Admin Aplikasi ${p.nama} dicabut.`)}
                onTambah={(a) => aksi({ aksi: "tambah_admin", peran_kode: "admin_aplikasi", akun_id: a.id }, `${a.nama} ditambahkan sebagai Admin Aplikasi.`)}
              />
            </section>

            <section className={KARTU}>
              <div className="border-b border-[#E3E8EE] px-5 py-4">
                <h2 className="text-[15px] font-bold">Admin per aplikasi</h2>
                <p className="mt-1 text-[13px] text-[#4D5B6B]">Admin hanya mengelola aplikasinya sendiri. Pengguna biasa mendapat kartu dari peran & penugasan kegiatan.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr>
                      <th className={TH}>Aplikasi</th>
                      <th className={TH}>Peran admin</th>
                      <th className={TH}>Pemegang</th>
                      <th className={TH}>Tautan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.aplikasi.map((a) => (
                      <tr key={a.kode}>
                        <td className={TD}>
                          <strong>{a.nama}</strong>
                          {a.uraian && <div className="text-[12px] text-[#7B8794]">{a.uraian}</div>}
                        </td>
                        <td className={TD}>{a.nama_peran}</td>
                        <td className={TD}>
                          <DaftarPemegang
                            pemegang={a.admin}
                            onCabut={(p) => confirm(`Cabut peran ${a.nama_peran} dari ${p.nama}?`) && aksi({ aksi: "cabut_admin", akun_peran_id: p.akun_peran_id }, `Peran ${a.nama_peran} ${p.nama} dicabut.`)}
                            onTambah={(x) => aksi({ aksi: "tambah_admin", peran_kode: a.peran_admin, akun_id: x.id }, `${x.nama} ditunjuk sebagai ${a.nama_peran}.`)}
                          />
                        </td>
                        <td className={TD}>
                          <Tautan nilai={a.href} onSimpan={(href) => aksi({ aksi: "tautan_aplikasi", kode: a.kode, href }, `Tautan ${a.nama} disimpan.`)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {data && (
          <section className={KARTU}>
            <div className="border-b border-[#E3E8EE] px-5 py-4">
              <h2 className="text-[15px] font-bold">Periode kegiatan</h2>
              <p className="mt-1 text-[13px] text-[#4D5B6B]">
                Kartu petugas ditutup otomatis pada <strong>tanggal selesai + masa tenggang</strong> (bawaan 7 hari), lalu menjadi arsip baca-saja. Tanggal mulai/selesai diatur di Admin Transport Lokal &rsaquo; Kegiatan.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse">
                <thead>
                  <tr>
                    <th className={TH}>Kegiatan</th>
                    <th className={TH}>Selesai</th>
                    <th className={TH}>Tenggang</th>
                    <th className={TH}>Input ditutup</th>
                    <th className={TH}>Status petugas</th>
                    <th className={TH}>Buka ulang</th>
                  </tr>
                </thead>
                <tbody>
                  {data.kegiatan.length === 0 && (
                    <tr>
                      <td className={TD} colSpan={6}>Belum ada kegiatan.</td>
                    </tr>
                  )}
                  {data.kegiatan.map((k) => (
                    <BarisKegiatan key={k.id} k={k} hariIni={data.hari_ini} onAksi={aksi} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-[#E3E8EE] bg-[#F7F9FB] px-5 py-3 text-[12.5px] text-[#4D5B6B]">
              Tetap bisa mengubah setelah ditutup: <strong>Admin Aplikasi, Admin Anggaran, PJ Kegiatan, Bendahara</strong>. Setiap perubahan periode &amp; buka ulang tercatat di log audit.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function DaftarPemegang({
  pemegang,
  minimal,
  onCabut,
  onTambah,
}: {
  pemegang: Pemegang[];
  minimal?: boolean;
  onCabut: (p: Pemegang) => void;
  onTambah: (a: { id: number; nama: string }) => Promise<boolean>;
}) {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<{ id: number; nama: string; jenis: string }[]>([]);

  useEffect(() => {
    if (!buka || q.trim().length < 2) {
      setHasil([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await apiPortal<{ akun: { id: number; nama: string; jenis: string }[] }>(`/api/portal/admin?cari=${encodeURIComponent(q.trim())}`);
        setHasil(r.akun);
      } catch {
        setHasil([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, buka]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {pemegang.length === 0 && <span className="text-[13px] text-[#B4561E]">Belum ada</span>}
        {pemegang.map((p) => (
          <span key={p.akun_peran_id} className="inline-flex items-center gap-1 rounded-full bg-[#E8F1FC] py-1 pl-3 pr-1.5 text-[13px] font-semibold text-[#1A5DB0]">
            {p.nama}
            {!(minimal && pemegang.length <= 1) && (
              <button type="button" onClick={() => onCabut(p)} className="rounded-full px-1.5 text-[#4D5B6B] hover:bg-white" aria-label={`Cabut ${p.nama}`}>
                ×
              </button>
            )}
          </span>
        ))}
        <button type="button" onClick={() => setBuka((x) => !x)} className={TOMBOL}>
          {buka ? "Tutup" : "+ Tambah"}
        </button>
      </div>
      {buka && (
        <div className="max-w-sm rounded-lg border border-[#E3E8EE] bg-white p-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik minimal 2 huruf nama" className="h-9 w-full rounded-md border border-[#CDD5DE] px-2.5 text-[13.5px] outline-none focus:border-[#1F6FD1]" />
          <ul className="mt-1 max-h-56 overflow-auto">
            {hasil.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="flex w-full justify-between gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-[#F3F5F8]"
                  onClick={async () => {
                    if (await onTambah(a)) {
                      setBuka(false);
                      setQ("");
                    }
                  }}
                >
                  <span>{a.nama}</span>
                  <span className="text-[11.5px] text-[#7B8794]">{a.jenis}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tautan({ nilai, onSimpan }: { nilai: string | null; onSimpan: (href: string) => Promise<boolean> }) {
  const [ubah, setUbah] = useState(false);
  const [v, setV] = useState(nilai ?? "");
  if (!ubah)
    return (
      <div className="flex items-center gap-2">
        {nilai ? <code className="text-[12.5px] text-[#4D5B6B]">{nilai}</code> : <span className="text-[13px] text-[#B4561E]">Belum diatur</span>}
        <button type="button" className={TOMBOL} onClick={() => setUbah(true)}>Ubah</button>
      </div>
    );
  return (
    <div className="flex items-center gap-1.5">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="/jalur atau https://" className="h-8 w-44 rounded-md border border-[#CDD5DE] px-2 text-[13px] outline-none focus:border-[#1F6FD1]" />
      <button type="button" className={TOMBOL} onClick={async () => (await onSimpan(v)) && setUbah(false)}>Simpan</button>
    </div>
  );
}

function BarisKegiatan({ k, hariIni, onAksi }: { k: Kegiatan; hariIni: string; onAksi: (b: Record<string, unknown>, s: string) => Promise<boolean> }) {
  const [tenggang, setTenggang] = useState(String(k.hari_tenggang));
  const [sampai, setSampai] = useState(k.dibuka_sampai ?? "");
  const st = STATUS[k.periode.status] ?? STATUS.belum_diatur;
  const berubah = tenggang !== String(k.hari_tenggang);
  return (
    <tr>
      <td className={TD}>
        <strong>{k.nama}</strong>
        <div className="text-[12px] text-[#7B8794]">{k.pj.length ? `PJ: ${k.pj.join(", ")}` : "PJ belum ditunjuk"}{!k.aktif && " · nonaktif"}</div>
      </td>
      <td className={TD}>{tgl(k.tanggal_selesai)}</td>
      <td className={TD}>
        <div className="flex items-center gap-1.5">
          <input
            aria-label="Hari tenggang"
            inputMode="numeric"
            value={tenggang}
            onChange={(e) => setTenggang(e.target.value.replace(/\D/g, "").slice(0, 3))}
            className="h-8 w-14 rounded-md border border-[#CDD5DE] px-2 text-[13.5px] outline-none focus:border-[#1F6FD1]"
          />
          <span className="text-[13px]">hari</span>
          {berubah && (
            <button type="button" className={TOMBOL} onClick={() => onAksi({ aksi: "periode", kegiatan_id: k.id, hari_tenggang: Number(tenggang || 0) }, `Masa tenggang ${k.nama} disimpan.`)}>
              Simpan
            </button>
          )}
        </div>
      </td>
      <td className={TD}>{k.periode.dibuka_ulang ? `${tgl(k.periode.ditutup)} (dibuka ulang)` : tgl(k.periode.ditutup)}</td>
      <td className={TD}>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${st.kelas}`}>{st.label}</span>
      </td>
      <td className={TD}>
        <div className="flex flex-wrap items-center gap-1.5">
          <input type="date" min={hariIni} value={sampai} onChange={(e) => setSampai(e.target.value)} aria-label="Buka ulang sampai" className="h-8 rounded-md border border-[#CDD5DE] px-2 text-[13px] outline-none focus:border-[#1F6FD1]" />
          <button type="button" className={TOMBOL} disabled={!sampai || sampai === k.dibuka_sampai} onClick={() => onAksi({ aksi: "buka_ulang", kegiatan_id: k.id, sampai }, `${k.nama} dibuka ulang s.d. ${tgl(sampai)}.`)}>
            Buka ulang
          </button>
          {k.dibuka_sampai && (
            <button
              type="button"
              className={TOMBOL}
              onClick={async () => {
                if (await onAksi({ aksi: "buka_ulang", kegiatan_id: k.id, sampai: null }, `${k.nama} kembali mengikuti jadwal.`)) setSampai("");
              }}
            >
              Tutup kembali
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
