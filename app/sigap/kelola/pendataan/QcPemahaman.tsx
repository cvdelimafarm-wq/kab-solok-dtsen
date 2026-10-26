"use client";

// app/sigap/kelola/pendataan/QcPemahaman.tsx
//
// (26 Okt 2026) Isi tab "4 · QC Pemahaman" Kelola Pendataan: pengaturan QC Pemahaman Petugas (kuis harian wajib PML/PPL), bank soal, dan pantauan hari ini.
// Sub-pilihan (?sub=): Hari ini · Pengaturan · Bank soal. Semua data lewat /api/portal/qc/admin (izin bencana.admin: lihat / kelola).
// Tidak ada penghapusan permanen: soal dimatikan lewat saklar aktif; perubahan dicatat di sigap_audit oleh API.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import Sorot from "@/app/portal/qc/Sorot";
import { tglPanjang } from "../../admin/api";
import { BTN, BTN_G, BTN_O, BTN_R, BTN_T, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan } from "../../admin/ui";
import { labelStatusPpl, menitKeJam, jamKeMenit, type QcPengaturan, type QcRekapTim } from "@/lib/sigapQc";
import { SUB_QC } from "@/lib/sigapPendataanTab";
import { SubPilih, useSubTab } from "./useSubTab";

type Peng = QcPengaturan & { diubah_oleh: string | null; diubah_at: string };
type Soal = { id: string; paket: number; judul_paket: string; nomor: number; pertanyaan: string; opsi: Record<string, string>; kunci: string; penjelasan: string; kata_kunci: string[]; aktif: boolean };
type Data = {
  boleh_kelola: boolean;
  sekarang: string;
  pengaturan: Peng | null;
  soal: Soal[];
  peserta: { pml: number; ppl: number; ppl_tanpa_pml: number; tanpa_notifikasi: string[] };
  hari: string | null;
  soal_hari: string[];
  susulan_at: string | null;
  rekap: QcRekapTim[];
};

const API = "/api/portal/qc/admin";
const jam = (s: string | undefined) => menitKeJam(jamKeMenit(s) ?? 0);
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

export default function QcPemahaman() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { sub, pilih } = useSubTab("qc", SUB_QC);

  const muat = useCallback(async () => {
    try {
      setD(await apiPortal<Data>(API));
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);

  const kirim = useCallback(
    async (isi: Record<string, unknown>, ok: string | ((r: Record<string, unknown>) => string)) => {
      setInfo(null);
      setGalat(null);
      try {
        const r = await apiPortal<Record<string, unknown>>(API, { method: "POST", body: JSON.stringify(isi) });
        setInfo(typeof ok === "function" ? ok(r) : ok);
        await muat();
        return r;
      } catch (e) {
        setGalat(pesanGalat(e));
        return null;
      }
    },
    [muat]
  );

  if (!d && !galat) return <Memuat />;
  return (
    <div className="space-y-3">
      <SubPilih daftar={SUB_QC} aktif={sub} onPilih={pilih} label="QC Pemahaman" />
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}
      {d && !d.boleh_kelola && <Pesan jenis="info">Anda dapat melihat saja. Mengubah pengaturan memerlukan izin kelola pendataan.</Pesan>}
      {d && sub === "hari" && <HariIni d={d} kirim={kirim} />}
      {d && sub === "pengaturan" && <Pengaturan d={d} kirim={kirim} />}
      {d && sub === "soal" && <BankSoal d={d} kirim={kirim} />}
    </div>
  );
}

type Kirim = (isi: Record<string, unknown>, ok: string | ((r: Record<string, unknown>) => string)) => Promise<Record<string, unknown> | null>;

// ====================================================================== Hari ini
function HariIni({ d, kirim }: { d: Data; kirim: Kirim }) {
  const p = d.pengaturan;
  const sudah = d.rekap.reduce((a, t) => a + t.sudah, 0);
  const total = d.rekap.reduce((a, t) => a + t.jumlah_ppl, 0);
  const lulus = d.rekap.reduce((a, t) => a + t.lulus, 0);
  const [sibuk, setSibuk] = useState(false);
  const ke = async (isi: Record<string, unknown>, ok: string) => {
    setSibuk(true);
    await kirim(isi, ok);
    setSibuk(false);
  };
  return (
    <>
      <Kartu
        judul="Pantauan hari ini"
        ket={d.hari ? tglPanjang(d.hari) : "QC belum berjalan"}
        kanan={p?.aktif ? <Chip w="ok">Aktif</Chip> : <Chip w="mut">Nonaktif</Chip>}
      >
        {!p?.aktif && <p className="text-[13px] text-[#55657D]">QC Pemahaman belum diaktifkan. Atur jadwal di tab Pengaturan, lalu nyalakan.</p>}
        {p?.aktif && (
          <p className="text-[13px] text-[#55657D]">
            Soal dirilis pukul <b>{jam(p.rilis_jam)}</b>, batas pukul <b>{jam(p.batas_jam)}</b> WIB. Petugas yang belum selesai terkunci modal sampai mengisi (dan mengulang sampai 100, maksimal {1 + p.maks_ulang} percobaan).
            {d.susulan_at && <> Hari ini ditandai <b>susulan</b>: tidak dihitung terlambat.</>}
          </p>
        )}
      </Kartu>
      <div className="grid gap-3 sm:grid-cols-4">
        <KartuAngka label="PML / PPL peserta" nilai={`${d.peserta.pml} / ${d.peserta.ppl}`} ket={d.peserta.ppl_tanpa_pml ? `${d.peserta.ppl_tanpa_pml} PPL belum punya PML` : "tiap PPL punya PML"} warna={d.peserta.ppl_tanpa_pml ? "#8A6200" : undefined} />
        <KartuAngka label="PPL sudah mengisi" nilai={total ? `${sudah}/${total}` : "-"} ket="hari yang dipantau" />
        <KartuAngka label="PPL sudah nilai 100" nilai={total ? String(lulus) : "-"} warna="#13794B" />
        <KartuAngka label="Tanpa notifikasi" nilai={String(d.peserta.tanpa_notifikasi.length)} ket="belum mengaktifkan push" warna={d.peserta.tanpa_notifikasi.length ? "#B42329" : undefined} />
      </div>
      {d.peserta.tanpa_notifikasi.length > 0 && (
        <details className="rounded-lg border border-[#DDE6F3] bg-white px-3.5 py-2.5 text-[13px]">
          <summary className="cursor-pointer font-bold text-[#0F2A52]">Siapa yang belum mengaktifkan notifikasi ({d.peserta.tanpa_notifikasi.length})</summary>
          <p className="mt-1.5 text-[#55657D]">{d.peserta.tanpa_notifikasi.join(", ")}. Mereka tetap terkunci modal, tetapi tidak menerima push. Di iPhone: Tambahkan ke Layar Utama lalu izinkan notifikasi.</p>
        </details>
      )}

      {d.rekap.length === 0 ? (
        <Kartu judul="Rekap per tim">
          <p className="text-[13px] text-[#55657D]">Belum ada soal yang dirilis pada hari ini.</p>
        </Kartu>
      ) : (
        d.rekap.map((t) => (
          <Kartu
            key={t.pml_akun_id}
            judul={t.pml_nama || "PPL tanpa PML"}
            ket={`${t.sudah}/${t.jumlah_ppl} sudah mengisi · rata-rata awal ${t.rata_awal ?? "-"} · ${t.lulus} nilai 100`}
          >
            <ul className="divide-y divide-[#E3E8EE]">
              {t.ppl.map((x) => (
                <li key={x.akun_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate text-[13.5px] text-[#1B2B4B]">{x.nama}</span>
                  <span className="flex flex-none items-center gap-1.5">
                    {x.terlambat && <Chip w="wait">Terlambat</Chip>}
                    <Chip w={x.percobaan === 0 ? "bad" : x.lulus ? "ok" : "wait"}>{labelStatusPpl(x, (p?.maks_ulang ?? 3) + 1)}</Chip>
                  </span>
                </li>
              ))}
            </ul>
            {t.salah.length > 0 && (
              <div className="mt-2 rounded-lg bg-[#FFF8F7] px-3 py-2">
                <p className="text-[12.5px] font-bold text-[#B42329]">Soal yang dijawab salah (percobaan pertama)</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-[#1B2B4B]">
                  {[...t.salah]
                    .sort((a, b) => b.jumlah - a.jumlah)
                    .map((s) => (
                      <li key={s.soal_id}>
                        {s.pertanyaan} <b>({s.jumlah})</b>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </Kartu>
        ))
      )}

      {d.boleh_kelola && p && d.hari && (
        <Kartu judul="Tindakan hari ini" ket="hati-hati: berlaku untuk semua petugas">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={sibuk} className={BTN_O} onClick={() => ke({ aksi: "susulan", tanggal: d.hari, susulan: !d.susulan_at }, d.susulan_at ? "Tanda susulan dicabut." : "Hari ini ditandai susulan.")}>
              {d.susulan_at ? "Cabut tanda hari susulan" : "Tandai hari ini sebagai susulan"}
            </button>
            {d.soal_hari.length > 0 && d.rekap.every((t) => t.sudah === 0) && (
              <button type="button" disabled={sibuk} className={BTN_R} onClick={() => ke({ aksi: "undi_ulang", tanggal: d.hari }, "Soal hari ini diundi ulang.")}>
                Undi ulang soal hari ini
              </button>
            )}
          </div>
          <p className="mt-2 text-[12.5px] text-[#6B7A90]">
            Hari susulan = soal terlambat dirilis (mis. fitur baru dinyalakan malam hari): tidak ditandai terlambat, tetap memblokir, dan petugas diingatkan berkala sampai nilai 100. Undi ulang hanya bisa selama belum ada satu pun jawaban.
          </p>
        </Kartu>
      )}

      <Kartu judul="Uji notifikasi" ket="dikirim hanya ke perangkat Anda sendiri">
        <div className="flex flex-wrap gap-2">
          {(["rilis", "ingat", "rekap"] as const).map((j) => (
            <button
              key={j}
              type="button"
              className={BTN_O}
              disabled={sibuk}
              onClick={async () => {
                setSibuk(true);
                await kirim({ aksi: "contoh_push", jenis: j }, (r) => (Number(r.perangkat ?? 0) === 0 ? "Anda belum punya perangkat yang mengaktifkan notifikasi." : `Contoh terkirim ke ${r.terkirim ?? 0} dari ${r.perangkat ?? 0} perangkat Anda.`));
                setSibuk(false);
              }}
            >
              Contoh push {j === "rilis" ? "rilis soal" : j === "ingat" ? "pengingat" : "rekap PML"}
            </button>
          ))}
        </div>
      </Kartu>
    </>
  );
}

// ====================================================================== Pengaturan
function Pengaturan({ d, kirim }: { d: Data; kirim: Kirim }) {
  const p = d.pengaturan;
  const [f, setF] = useState(() => ({
    aktif: p?.aktif ?? false,
    rilis_jam: jam(p?.rilis_jam ?? "19:00"),
    batas_jam: jam(p?.batas_jam ?? "20:00"),
    rekap_jam: jam(p?.rekap_jam ?? "07:00"),
    soal_per_hari: String(p?.soal_per_hari ?? 10),
    maks_ulang: String(p?.maks_ulang ?? 3),
    ingat_menit: (p?.ingat_menit ?? [30, 50]).join(", "),
    ingat_berkala_menit: String(p?.ingat_berkala_menit ?? 60),
    mulai: p?.mulai ?? "",
    akhir: p?.akhir ?? "",
  }));
  const [sibuk, setSibuk] = useState(false);
  const ubah = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const simpan = async () => {
    setSibuk(true);
    await kirim(
      {
        aksi: "pengaturan",
        data: {
          aktif: f.aktif,
          rilis_jam: f.rilis_jam,
          batas_jam: f.batas_jam,
          rekap_jam: f.rekap_jam,
          soal_per_hari: Number(f.soal_per_hari),
          maks_ulang: Number(f.maks_ulang),
          ingat_menit: f.ingat_menit
            .split(/[,\s]+/)
            .filter(Boolean)
            .map(Number),
          ingat_berkala_menit: Number(f.ingat_berkala_menit),
          mulai: f.mulai || null,
          akhir: f.akhir || null,
        },
      },
      f.aktif ? "Pengaturan disimpan. QC Pemahaman AKTIF." : "Pengaturan disimpan. QC Pemahaman nonaktif."
    );
    setSibuk(false);
  };
  const baris = "grid gap-1 sm:grid-cols-[220px_1fr] sm:items-center";
  const bisa = d.boleh_kelola;
  const soalAktif = d.soal.filter((s) => s.aktif).length;
  return (
    <Kartu judul="Pengaturan QC Pemahaman" ket={p?.diubah_oleh ? `terakhir diubah oleh ${p.diubah_oleh}` : "belum pernah disimpan"}>
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 rounded-lg border border-[#DDE6F3] bg-[#F8FAFC] px-3 py-2.5">
          <input type="checkbox" className="h-5 w-5 accent-[#1F5FD1]" disabled={!bisa} checked={f.aktif} onChange={(e) => ubah("aktif", e.target.checked)} />
          <span className="text-[13.5px] font-bold text-[#0F2A52]">Aktifkan QC Pemahaman Petugas (modal wajib untuk PML dan PPL Pendataan Pascabencana)</span>
        </label>
        {f.aktif && !p?.aktif && <Pesan jenis="peringatan">Bila dinyalakan setelah jam batas hari ini, hari ini otomatis menjadi hari susulan (tanpa label terlambat) dan petugas langsung terkunci modal.</Pesan>}
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Soal dirilis pukul (WIB)</span>
          <input type="time" className={`${INPUT} w-32`} disabled={!bisa} value={f.rilis_jam} onChange={(e) => ubah("rilis_jam", e.target.value)} />
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Batas pengisian pukul (WIB)</span>
          <input type="time" className={`${INPUT} w-32`} disabled={!bisa} value={f.batas_jam} onChange={(e) => ubah("batas_jam", e.target.value)} />
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Rekap ke PML pukul (esok pagi)</span>
          <input type="time" className={`${INPUT} w-32`} disabled={!bisa} value={f.rekap_jam} onChange={(e) => ubah("rekap_jam", e.target.value)} />
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Soal per hari</span>
          <input type="number" min={1} max={30} className={`${INPUT} w-24`} disabled={!bisa} value={f.soal_per_hari} onChange={(e) => ubah("soal_per_hari", e.target.value)} />
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Ulangan jika belum 100</span>
          <span className="flex items-center gap-2">
            <input type="number" min={0} max={10} className={`${INPUT} w-24`} disabled={!bisa} value={f.maks_ulang} onChange={(e) => ubah("maks_ulang", e.target.value)} />
            <span className="text-[12.5px] text-[#6B7A90]">kali (total {1 + Number(f.maks_ulang || 0)} percobaan)</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Pengingat setelah rilis (menit)</span>
          <span className="flex items-center gap-2">
            <input className={`${INPUT} w-40`} disabled={!bisa} value={f.ingat_menit} onChange={(e) => ubah("ingat_menit", e.target.value)} placeholder="30, 50" />
            <span className="text-[12.5px] text-[#6B7A90]">petugas yang belum selesai dan PML-nya diingatkan</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Pengingat berkala sesudah batas</span>
          <span className="flex items-center gap-2">
            <input type="number" min={0} max={720} className={`${INPUT} w-24`} disabled={!bisa} value={f.ingat_berkala_menit} onChange={(e) => ubah("ingat_berkala_menit", e.target.value)} />
            <span className="text-[12.5px] text-[#6B7A90]">menit sekali (0 = mati, 15-720); tidak dikirim pukul 23.00-05.59</span>
          </span>
        </div>
        <div className={baris}>
          <span className="text-[13px] font-bold text-[#1B2B4B]">Periode (opsional)</span>
          <span className="flex flex-wrap items-center gap-2">
            <input type="date" className={INPUT} disabled={!bisa} value={f.mulai} onChange={(e) => ubah("mulai", e.target.value)} />
            <span className="text-[12.5px] text-[#6B7A90]">s.d.</span>
            <input type="date" className={INPUT} disabled={!bisa} value={f.akhir} onChange={(e) => ubah("akhir", e.target.value)} />
          </span>
        </div>
        <p className="text-[12.5px] text-[#6B7A90]">
          Bank soal aktif: <b>{soalAktif}</b> butir dari {new Set(d.soal.filter((s) => s.aktif).map((s) => s.paket)).size} paket. Tiap hari diundi {f.soal_per_hari || "…"} soal yang sama untuk semua petugas, setiap paket terwakili.
        </p>
        {bisa && (
          <button type="button" className={BTN_G} disabled={sibuk} onClick={simpan}>
            {sibuk ? "Menyimpan…" : "Simpan pengaturan"}
          </button>
        )}
      </div>
    </Kartu>
  );
}

// ====================================================================== Bank soal
const SOAL_BARU: Soal = { id: "", paket: 1, judul_paket: "", nomor: 1, pertanyaan: "", opsi: { A: "", B: "", C: "", D: "" }, kunci: "A", penjelasan: "", kata_kunci: [], aktif: true };

function BankSoal({ d, kirim }: { d: Data; kirim: Kirim }) {
  const [cari, setCari] = useState("");
  const [edit, setEdit] = useState<Soal | null>(null);
  const [baru, setBaru] = useState(false);
  const [impor, setImpor] = useState(false);
  const pakets = useMemo(() => {
    const m = new Map<number, { judul: string; soal: Soal[] }>();
    for (const s of d.soal) {
      if (cari && !`${s.id} ${s.pertanyaan} ${s.judul_paket}`.toLowerCase().includes(cari.toLowerCase())) continue;
      const g = m.get(s.paket) ?? { judul: s.judul_paket, soal: [] };
      g.soal.push(s);
      m.set(s.paket, g);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [d.soal, cari]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${INPUT} min-w-[200px] flex-1`} placeholder="Cari soal…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari soal" />
        {d.boleh_kelola && (
          <>
            <button type="button" className={BTN} onClick={() => { setEdit({ ...SOAL_BARU }); setBaru(true); }}>
              + Soal baru
            </button>
            <button type="button" className={BTN_O} onClick={() => setImpor(true)}>
              Impor banyak soal
            </button>
          </>
        )}
      </div>
      {pakets.length === 0 && <p className="text-[13px] text-[#55657D]">Tidak ada soal.</p>}
      {pakets.map(([paket, g]) => (
        <Kartu key={paket} judul={`Paket ${paket} · ${g.judul}`} ket={`${g.soal.filter((s) => s.aktif).length} aktif dari ${g.soal.length}`}>
          <ul className="divide-y divide-[#E3E8EE]">
            {g.soal.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className={`text-[13.5px] leading-snug ${s.aktif ? "text-[#1B2B4B]" : "text-[#8794A6] line-through"}`}>
                    <Sorot teks={s.pertanyaan} kata={s.kata_kunci} />
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#6B7A90]">
                    {s.id} · kunci {s.kunci} · {s.kata_kunci.length} kata kunci
                  </p>
                </div>
                <div className="flex flex-none items-center gap-1">
                  {d.boleh_kelola ? (
                    <>
                      <button type="button" className={BTN_T} onClick={() => { setEdit(s); setBaru(false); }}>
                        Ubah
                      </button>
                      <button type="button" className={BTN_T} onClick={() => void kirim({ aksi: "soal_aktif", id: s.id, aktif: !s.aktif }, s.aktif ? "Soal dinonaktifkan." : "Soal diaktifkan.")}>
                        {s.aktif ? "Matikan" : "Aktifkan"}
                      </button>
                    </>
                  ) : (
                    <Chip w={s.aktif ? "ok" : "mut"}>{s.aktif ? "Aktif" : "Nonaktif"}</Chip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Kartu>
      ))}
      {edit && <EditSoal awal={edit} baru={baru} kirim={kirim} onTutup={() => setEdit(null)} />}
      {impor && <ImporSoal kirim={kirim} onTutup={() => setImpor(false)} />}
    </>
  );
}

function Lapis({ judul, onTutup, children }: { judul: string; onTutup: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-[#0B1530]/60 p-0 sm:items-center sm:p-4" onClick={onTutup} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={judul} onClick={(e) => e.stopPropagation()} className="max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-[16px] font-extrabold text-[#0F2A52]">{judul}</h3>
          <button type="button" onClick={onTutup} className="text-[22px] font-bold leading-none text-[#6B7A90]" aria-label="Tutup">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditSoal({ awal, baru, kirim, onTutup }: { awal: Soal; baru: boolean; kirim: Kirim; onTutup: () => void }) {
  const [s, setS] = useState<Soal>(awal);
  const [kata, setKata] = useState(awal.kata_kunci.join("\n"));
  const [sibuk, setSibuk] = useState(false);
  const kataDaftar = kata.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  const simpan = async () => {
    setSibuk(true);
    const r = await kirim({ aksi: "soal", data: { ...s, paket: Number(s.paket), nomor: Number(s.nomor), judul_paket: s.judul_paket || `Paket ${s.paket}`, kata_kunci: kataDaftar } }, baru ? "Soal ditambahkan." : "Soal disimpan.");
    setSibuk(false);
    if (r) onTutup();
  };
  const f = "grid gap-1";
  return (
    <Lapis judul={baru ? "Soal baru" : `Ubah soal ${s.id}`} onTutup={onTutup}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={f}>
            <span className="text-[12.5px] font-bold text-[#1B2B4B]">Kode soal</span>
            <input className={INPUT} value={s.id} disabled={!baru} onChange={(e) => setS({ ...s, id: e.target.value })} placeholder="mis. LAT-14" />
          </label>
          <label className={f}>
            <span className="text-[12.5px] font-bold text-[#1B2B4B]">Paket (angka)</span>
            <input type="number" min={1} max={99} className={INPUT} value={s.paket} onChange={(e) => setS({ ...s, paket: Number(e.target.value) })} />
          </label>
          <label className={f}>
            <span className="text-[12.5px] font-bold text-[#1B2B4B]">Nomor urut</span>
            <input type="number" min={1} className={INPUT} value={s.nomor} onChange={(e) => setS({ ...s, nomor: Number(e.target.value) })} />
          </label>
        </div>
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Judul paket</span>
          <input className={INPUT} value={s.judul_paket} onChange={(e) => setS({ ...s, judul_paket: e.target.value })} />
        </label>
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Pertanyaan</span>
          <textarea rows={3} className={INPUT} value={s.pertanyaan} onChange={(e) => setS({ ...s, pertanyaan: e.target.value })} />
        </label>
        {(["A", "B", "C", "D"] as const).map((k) => (
          <label key={k} className="flex items-start gap-2">
            <input type="radio" name="kunci" className="mt-2.5 h-4 w-4 accent-[#13794B]" checked={s.kunci === k} onChange={() => setS({ ...s, kunci: k })} aria-label={`Jadikan ${k} jawaban benar`} />
            <span className="grid flex-1 gap-1">
              <span className="text-[12.5px] font-bold text-[#1B2B4B]">
                Pilihan {k} {s.kunci === k && <span className="text-[#13794B]">(jawaban benar)</span>}
              </span>
              <input className={INPUT} value={s.opsi[k] ?? ""} onChange={(e) => setS({ ...s, opsi: { ...s.opsi, [k]: e.target.value } })} />
            </span>
          </label>
        ))}
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Pembahasan</span>
          <textarea rows={3} className={INPUT} value={s.penjelasan} onChange={(e) => setS({ ...s, penjelasan: e.target.value })} />
        </label>
        <label className={f}>
          <span className="text-[12.5px] font-bold text-[#1B2B4B]">Kata kunci yang disorot (satu per baris)</span>
          <textarea rows={3} className={INPUT} value={kata} onChange={(e) => setKata(e.target.value)} placeholder={"surat tugas\nsub SLS"} />
        </label>
        <div className="rounded-lg bg-[#F8FAFC] p-3">
          <p className="text-[11.5px] font-extrabold uppercase tracking-wide text-[#6B7A90]">Pratinjau sorotan</p>
          <p className="mt-1 text-[14px] font-bold leading-snug text-[#0F2A52]">
            <Sorot teks={s.pertanyaan || "(pertanyaan)"} kata={kataDaftar} />
          </p>
          <p className="mt-1 text-[13px] leading-snug text-[#1B2B4B]">
            <Sorot teks={s.penjelasan || "(pembahasan)"} kata={kataDaftar} />
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_O} onClick={onTutup}>
            Batal
          </button>
          <button type="button" className={BTN_G} disabled={sibuk} onClick={simpan}>
            {sibuk ? "Menyimpan…" : "Simpan soal"}
          </button>
        </div>
      </div>
    </Lapis>
  );
}

function ImporSoal({ kirim, onTutup }: { kirim: Kirim; onTutup: () => void }) {
  const [teks, setTeks] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const jalan = async () => {
    setGalat(null);
    let arr: unknown;
    try {
      arr = JSON.parse(teks);
    } catch {
      setGalat("Teks bukan JSON yang sah.");
      return;
    }
    setSibuk(true);
    const r = await kirim({ aksi: "impor", soal: arr }, "Soal diimpor.");
    setSibuk(false);
    if (r) onTutup();
  };
  return (
    <Lapis judul="Impor banyak soal" onTutup={onTutup}>
      <p className="text-[12.5px] leading-snug text-[#55657D]">
        Tempel daftar JSON. Tiap butir: <code>{`{"id":"LAT-01","paket":1,"judul_paket":"…","pertanyaan":"…","opsi":{"A":"…","B":"…","C":"…","D":"…"},"kunci":"B","penjelasan":"…","kata_kunci":["…"]}`}</code>. Soal dengan kode yang sama akan diperbarui; tidak ada yang dihapus.
      </p>
      <textarea rows={12} className={`${INPUT} mt-2 w-full font-mono text-[12px]`} value={teks} onChange={(e) => setTeks(e.target.value)} aria-label="Daftar soal JSON" />
      {galat && <p className="mt-2 text-[13px] font-bold text-[#B42329]">{galat}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={BTN_O} onClick={onTutup}>
          Batal
        </button>
        <button type="button" className={BTN_G} disabled={sibuk || !teks.trim()} onClick={jalan}>
          {sibuk ? "Mengimpor…" : "Impor"}
        </button>
      </div>
    </Lapis>
  );
}
