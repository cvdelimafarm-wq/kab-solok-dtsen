"use client";

// app/sigap/admin/TabKegiatan.tsx
//
// (5 Okt 2026) Tab ⚙️ Kegiatan & Tarif -- mockup-sigap-admin layar 4 (permintaan user):
//  - Form data kegiatan (nama, kode anggaran, periode, satuan realisasi, aktif/selesai).
//  - Tabel peran / label jabatan / uraian / tarif per hari / maks hari (kosong = tanpa batas), tambah & ubah.
//  - kegiatanId = null -> mode "＋ Kegiatan baru" (hanya admin dgn lingkup semua kegiatan).
// Read-only bila boleh_kelola = false.

import { JENIS_KEGIATAN } from "@/lib/sigap";
import { useCallback, useEffect, useState } from "react";
import { aksi, ambil, fetchJson, pesanGalat, rupiah, SesiBerakhir } from "./api";
import { bandingPeriode, rentangTanggal, type PeriodeRencana } from "@/lib/sigapKelasIdent";
import { PanelRujukan } from "../pedia/komponen";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH } from "./ui";
import SelectCari from "@/app/components/SelectCari";

type Kegiatan = {
  id: number;
  kode: string;
  nama: string;
  kode_anggaran: string | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  satuan_realisasi: string | null;
  aktif: boolean;
  // (7 Okt 2026) jenis kegiatan & aturan isian
  jenis?: string;
  wajib_laporan?: boolean;
  jumlah_foto?: number;
  // (31 Okt 2026) target selesai pendataan (kolom sigap_kegiatan.target_selesai); tersedia = kolom sudah ada di database
  target_selesai?: string | null;
  target_selesai_tersedia?: boolean;
};
type Tarif = { id: number; peran: string; uraian_detail: string | null; tarif: number; label_jabatan: string | null; maks_hari_default: number | null };
type SlotPj = { jabatan: "pj" | "wakil_pj"; akun_id: number | null; nama: string | null };
type Data = { kegiatan: Kegiatan | null; tarif: Tarif[]; boleh_kelola: boolean; penanggung_jawab?: SlotPj[]; pj_tersedia?: boolean; boleh_atur_pj?: boolean };

export default function TabKegiatan({
  kegiatanId,
  bolehBuat,
  onTersimpan,
  onBatalBaru,
}: {
  kegiatanId: number | null;
  bolehBuat: boolean;
  onTersimpan: (id: number) => void | Promise<void>;
  onBatalBaru?: () => void;
}) {
  const [data, setData] = useState<Data | null>(kegiatanId ? null : { kegiatan: null, tarif: [], boleh_kelola: bolehBuat });
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!kegiatanId) return;
    try {
      setData(await ambil<Data>("kegiatan", { kegiatan_id: kegiatanId }));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [kegiatanId]);
  useEffect(() => {
    muat();
  }, [muat]);

  if (galat && !data) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!data) return <Memuat />;

  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {/* (7 Okt 2026) Rujukan SIGAP PEDIA yg ditautkan ke kegiatan ini */}
      {kegiatanId && <PanelRujukan jenis="kegiatan" refId={kegiatanId} kelola={data.boleh_kelola} />}
      {!data.boleh_kelola && <Pesan jenis="info">Mode lihat saja — Anda tidak punya izin mengelola kegiatan ini.</Pesan>}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <FormKegiatan
          key={data.kegiatan?.id ?? "baru"}
          k={data.kegiatan}
          kelola={data.boleh_kelola}
          onTersimpan={async (id) => {
            await onTersimpan(id);
            await muat();
          }}
          onBatal={onBatalBaru}
        />
        {kegiatanId ? (
          <div className="space-y-3">
            <TabelTarif kegiatanId={kegiatanId} tarif={data.tarif} kelola={data.boleh_kelola} onBerubah={muat} />
            {data.pj_tersedia && <KartuPenanggungJawab kegiatanId={kegiatanId} slot={data.penanggung_jawab ?? []} boleh={!!data.boleh_atur_pj} onBerubah={muat} />}
          </div>
        ) : (
          <Kartu judul="Peran, tarif & maks hari">
            <p className="text-[12.5px] text-[#7B8794]">Simpan data kegiatan terlebih dahulu, lalu atur peran &amp; tarifnya di sini.</p>
          </Kartu>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- Penanggung jawab (PJ) dan Wakil PJ
// (6 Nov 2026) Dua slot per kegiatan; boleh kosong dan diisi belakangan. Mengisi slot memberi peran PJ Kegiatan pada kegiatan ini (wakil = hak sama dengan PJ);
// mengosongkan atau mengganti mencabut peran yang dibuat slot itu. Peran yang diberikan lewat Kelola Peran & Akses tidak disentuh.
const NAMA_SLOT: Record<SlotPj["jabatan"], string> = { pj: "Penanggung Jawab (PJ)", wakil_pj: "Wakil PJ" };
type AkunCari = { id: number; nama: string; jenis: string; alamat_kecamatan: string | null };

function KartuPenanggungJawab({ kegiatanId, slot, boleh, onBerubah }: { kegiatanId: number; slot: SlotPj[]; boleh: boolean; onBerubah: () => void | Promise<void> }) {
  const [ubah, setUbah] = useState<SlotPj["jabatan"] | null>(null);
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<AkunCari[]>([]);
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  useEffect(() => {
    const kata = q.trim();
    if (!ubah || kata.length < 2) {
      setHasil([]);
      return;
    }
    let batal = false;
    const t = setTimeout(async () => {
      try {
        const d = await ambil<{ akun: AkunCari[] }>("cari_akun", { q: kata });
        if (!batal) setHasil(d.akun);
      } catch (e) {
        if (!batal && !(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
      }
    }, 300);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [q, ubah]);

  async function simpan(jabatan: SlotPj["jabatan"], akunId: number | null) {
    setBusy(true);
    setPesan(null);
    try {
      await aksi("atur_pj", { kegiatan_id: kegiatanId, jabatan, akun_id: akunId });
      setUbah(null);
      setQ("");
      setHasil([]);
      setPesan({ jenis: "ok", teks: akunId === null ? `${NAMA_SLOT[jabatan]} dikosongkan.` : `${NAMA_SLOT[jabatan]} diisi.` });
      await onBerubah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Kartu judul="Penanggung jawab" ket="Slot boleh dikosongkan dan diisi belakangan. Pengisi mendapat peran PJ Kegiatan pada kegiatan ini.">
      <div className="space-y-2" data-testid="kartu-pj">
        {pesan && <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>}
        {slot.map((x) => (
          <div key={x.jabatan} className="rounded-lg border border-[#DDE6F3] p-2.5" data-testid={`slot-${x.jabatan}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-[#5B6B84]">{NAMA_SLOT[x.jabatan]}</span>
              {x.akun_id !== null ? <Chip w="ok">{x.nama ?? `Akun #${x.akun_id}`}</Chip> : <Chip w="mut">Belum diisi</Chip>}
              {boleh && ubah !== x.jabatan && (
                <span className="ml-auto flex gap-1.5">
                  <button type="button" className={BTN_O} onClick={() => { setUbah(x.jabatan); setQ(""); setPesan(null); }} disabled={busy}>
                    {x.akun_id === null ? "Isi nama" : "Ganti"}
                  </button>
                  {x.akun_id !== null && (
                    <button type="button" className={BTN_O} onClick={() => simpan(x.jabatan, null)} disabled={busy}>
                      Kosongkan
                    </button>
                  )}
                </span>
              )}
            </div>
            {boleh && ubah === x.jabatan && (
              <div className="mt-2 space-y-1.5">
                <input className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama akun (min. 2 huruf)" autoFocus />
                {hasil.length > 0 && (
                  <ul className="max-h-48 overflow-auto rounded-lg border border-[#DDE6F3]">
                    {hasil.map((a) => (
                      <li key={a.id}>
                        <button type="button" className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-[#F3F7FD]" onClick={() => simpan(x.jabatan, a.id)} disabled={busy}>
                          <span>{a.nama}</span>
                          <span className="text-[11.5px] text-[#7B8794]">{a.alamat_kecamatan ?? a.jenis}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className={BTN_O} onClick={() => { setUbah(null); setQ(""); }} disabled={busy}>
                  Batal
                </button>
              </div>
            )}
          </div>
        ))}
        {!boleh && <p className="text-[12px] text-[#7B8794]">Hanya pengelola akses untuk kegiatan ini yang dapat mengisi slot.</p>}
      </div>
    </Kartu>
  );
}

// ---------------------------------------------------------------------- Usulan periode dari perencanaan
// (1 Nov 2026) Pelatihan yang tertaut ke identifikasi: periode kegiatan diusulkan dari kelas pada perencanaan. Hanya mengisi form; tetap perlu menekan Simpan.
// Tidak tertaut / tanpa tanggal kelas / tidak berizin melihat kelas -> panel tidak tampil.
function UsulanPeriode({ kegiatanId, mulai, selesai, onTerapkan }: { kegiatanId: number; mulai: string; selesai: string; onTerapkan: (p: PeriodeRencana) => void }) {
  const [rencana, setRencana] = useState<PeriodeRencana | null>(null);
  useEffect(() => {
    let batal = false;
    fetchJson<{ tersambung: boolean; periode_rencana: PeriodeRencana | null }>(`/api/sigap/pelatihan/kelas?mode=admin&kegiatan=${kegiatanId}`)
      .then((r) => { if (!batal) setRencana(r.tersambung ? r.periode_rencana : null); })
      .catch(() => { if (!batal) setRencana(null); });
    return () => { batal = true; };
  }, [kegiatanId]);
  if (!rencana) return null;
  const banding = bandingPeriode(rencana, { mulai, selesai });
  return (
    <div className="rounded-lg border border-[#D6E2F5] bg-[#F3F7FD] p-2 text-[12px] leading-snug text-[#34455F] sm:col-start-2" data-testid="usulan-periode">
      <strong>Usulan dari perencanaan:</strong> {rentangTanggal(rencana.mulai, rencana.selesai)} ({rencana.hari} hari, dari jadwal kelas pada identifikasi).{" "}
      {banding === "sama" ? (
        <span className="font-semibold text-[#1B7F4B]">Periode di atas sudah sama.</span>
      ) : (
        <>
          Hari presensi mengikuti periode kegiatan.{" "}
          <button type="button" className={BTN_O} onClick={() => onTerapkan(rencana)} data-testid="terapkan-periode">
            Terapkan ke periode
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------- Form kegiatan
function FormKegiatan({ k, kelola, onTersimpan, onBatal }: { k: Kegiatan | null; kelola: boolean; onTersimpan: (id: number) => void | Promise<void>; onBatal?: () => void }) {
  const [nama, setNama] = useState(k?.nama ?? "");
  const [kode, setKode] = useState("");
  const [kodeAnggaran, setKodeAnggaran] = useState(k?.kode_anggaran ?? "");
  const [mulai, setMulai] = useState(k?.tanggal_mulai ?? "");
  const [selesai, setSelesai] = useState(k?.tanggal_selesai ?? "");
  const [targetSelesai, setTargetSelesai] = useState(k?.target_selesai ?? "");
  const [satuan, setSatuan] = useState(k?.satuan_realisasi ?? "ruta");
  const [aktif, setAktif] = useState(k?.aktif ?? true);
  // (7 Okt 2026) jenis kegiatan menentukan bawaan wajib laporan & jumlah foto (tetap bisa diubah) -- permintaan user
  const [jenis, setJenis] = useState<string>(k?.jenis ?? "pendataan");
  const [wajibLaporan, setWajibLaporan] = useState<boolean>(k?.wajib_laporan ?? true);
  const [jumlahFoto, setJumlahFoto] = useState<string>(String(k?.jumlah_foto ?? 5));
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const baru = !k;

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!nama.trim()) return setPesan({ jenis: "galat", teks: "Nama kegiatan wajib diisi." });
    if (mulai && selesai && mulai > selesai) return setPesan({ jenis: "galat", teks: "Tanggal mulai melewati tanggal selesai." });
    if (mulai && targetSelesai && targetSelesai < mulai) return setPesan({ jenis: "galat", teks: "Target selesai pendataan lebih awal daripada tanggal mulai." });
    setBusy(true);
    setPesan(null);
    try {
      const r = await aksi<{ ok: boolean; id: number }>("simpan_kegiatan", {
        id: k?.id,
        nama: nama.trim(),
        kode: baru ? kode.trim() || undefined : undefined,
        kode_anggaran: kodeAnggaran.trim(),
        tanggal_mulai: mulai || null,
        tanggal_selesai: selesai || null,
        satuan_realisasi: satuan.trim(),
        aktif,
        jenis,
        wajib_laporan: wajibLaporan,
        jumlah_foto: Number(jumlahFoto) || 5,
        ...(k?.target_selesai_tersedia ? { target_selesai: targetSelesai || null } : {}),
      });
      setPesan({ jenis: "ok", teks: baru ? "Kegiatan baru dibuat." : "Data kegiatan disimpan." });
      await onTersimpan(r.id);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setBusy(false);
    }
  }

  const label = "text-[11.5px] font-bold text-[#7B8794]";
  return (
    <Kartu judul={baru ? "Kegiatan baru" : "Data kegiatan"} ket={k ? `kode: ${k.kode}` : undefined}>
      <form onSubmit={simpan}>
        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[130px_1fr]">
          <span className={label}>Nama</span>
          <input value={nama} onChange={(e) => setNama(e.target.value)} className={INPUT} disabled={!kelola} placeholder="mis. SPDT NTP 2026" />
          {baru && (
            <>
              <span className={label}>Kode (opsional)</span>
              <input value={kode} onChange={(e) => setKode(e.target.value)} className={INPUT} placeholder="otomatis dari nama bila kosong" />
            </>
          )}
          <span className={label}>Kode anggaran</span>
          <input value={kodeAnggaran} onChange={(e) => setKodeAnggaran(e.target.value)} className={`${INPUT} font-mono text-[12px]`} disabled={!kelola} placeholder="054.01.GG.2903.BMA.008.052.A.524113" />
          <span className={label}>Periode</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} className={INPUT} disabled={!kelola} aria-label="Tanggal mulai" />
            <span>–</span>
            <input type="date" value={selesai} onChange={(e) => setSelesai(e.target.value)} className={INPUT} disabled={!kelola} aria-label="Tanggal selesai" />
          </div>
          {k && k.jenis === "pelatihan" && kelola && (
            <UsulanPeriode kegiatanId={k.id} mulai={mulai} selesai={selesai} onTerapkan={(p) => { setMulai(p.mulai); setSelesai(p.selesai); }} />
          )}
          <span className={label}>Target selesai pendataan</span>
          <div>
            <input type="date" value={targetSelesai} onChange={(e) => setTargetSelesai(e.target.value)} className={INPUT} disabled={!kelola || !k?.target_selesai_tersedia} aria-label="Target selesai pendataan" />
            <p className="mt-1 text-[11.5px] leading-snug text-[#7B8794]">
              Batas penyelesaian pendataan (bukan akhir masa lapangan). Dipakai peringatan realisasi di Beranda: realisasi dibandingkan dengan sisa hari kerja sampai tanggal ini. Kosong = memakai tanggal selesai periode.
              {k && !k.target_selesai_tersedia && " Kolom ini belum ada di database; jalankan skema-sql/fase-b/20261031b_target_selesai_pendataan.sql dulu."}
              {!k && " Dapat diisi setelah kegiatan disimpan."}
            </p>
          </div>
          <span className={label}>Satuan realisasi</span>
          <input value={satuan} onChange={(e) => setSatuan(e.target.value)} className={INPUT} disabled={!kelola} placeholder="ruta" />
          <span className={label}>Jenis kegiatan</span>
          <SelectCari
            value={jenis}
            onChange={(e) => {
              const j = JENIS_KEGIATAN.find((x) => x.kode === e.target.value);
              setJenis(e.target.value);
              if (j) {
                setWajibLaporan(j.wajib_laporan);
                setJumlahFoto(String(j.jumlah_foto));
              }
            }}
            className={INPUT}
            disabled={!kelola}
          >
            {JENIS_KEGIATAN.map((j) => (
              <option key={j.kode} value={j.kode}>
                {j.label}
              </option>
            ))}
          </SelectCari>
          <span className={label}>Isian petugas</span>
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={wajibLaporan} onChange={(e) => setWajibLaporan(e.target.checked)} disabled={!kelola} /> Wajib laporan harian
            </label>
            <label className="flex items-center gap-1.5">
              Foto per hari
              <input
                inputMode="numeric"
                value={jumlahFoto}
                onChange={(e) => setJumlahFoto(e.target.value.replace(/\D/g, "").slice(0, 2))}
                className={`${INPUT} w-14`}
                disabled={!kelola}
                aria-label="Jumlah foto per hari"
              />
            </label>
          </div>
          <span className={label}>Status</span>
          <SelectCari value={aktif ? "1" : "0"} onChange={(e) => setAktif(e.target.value === "1")} className={INPUT} disabled={!kelola}>
            <option value="1">Aktif</option>
            <option value="0">Selesai</option>
          </SelectCari>
        </div>
        {kelola && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className={BTN} disabled={busy}>
              {busy ? "Menyimpan…" : baru ? "Buat kegiatan" : "Simpan"}
            </button>
            {baru && onBatal && (
              <button type="button" className={BTN_O} onClick={onBatal}>
                Batal
              </button>
            )}
          </div>
        )}
      </form>
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>
            {pesan.teks}
          </Pesan>
        </div>
      )}
    </Kartu>
  );
}

// ---------------------------------------------------------------------- Tabel peran & tarif
type IsiTarif = { peran: string; label_jabatan: string; uraian_detail: string; tarif: string; maks: string };
const kosong: IsiTarif = { peran: "", label_jabatan: "", uraian_detail: "", tarif: "", maks: "" };

function TabelTarif({ kegiatanId, tarif, kelola, onBerubah }: { kegiatanId: number; tarif: Tarif[]; kelola: boolean; onBerubah: () => void | Promise<void> }) {
  const [ubah, setUbah] = useState<string | null>(null); // kode peran yg diubah, "__baru" = tambah
  const [isi, setIsi] = useState<IsiTarif>(kosong);
  const [busy, setBusy] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  function mulaiUbah(t: Tarif | null) {
    setPesan(null);
    if (!t) {
      setUbah("__baru");
      setIsi(kosong);
      return;
    }
    setUbah(t.peran);
    setIsi({ peran: t.peran, label_jabatan: t.label_jabatan ?? "", uraian_detail: t.uraian_detail ?? "", tarif: String(t.tarif ?? ""), maks: t.maks_hari_default != null ? String(t.maks_hari_default) : "" });
  }

  async function simpan() {
    const tarifN = Number(isi.tarif.replace(/[^\d]/g, ""));
    if (!isi.peran.trim()) return setPesan({ jenis: "galat", teks: "Kode peran wajib diisi (mis. ppl, pml, koseka)." });
    if (!isi.tarif.trim() || !Number.isFinite(tarifN)) return setPesan({ jenis: "galat", teks: "Tarif per hari wajib diisi (angka)." });
    const m = isi.maks.trim();
    if (m && (!/^\d+$/.test(m) || Number(m) < 1)) return setPesan({ jenis: "galat", teks: "Maks hari harus bilangan bulat ≥ 1 (kosong = tanpa batas)." });
    setBusy(true);
    setPesan(null);
    try {
      await aksi("simpan_tarif", {
        kegiatan_id: kegiatanId,
        peran: isi.peran.trim(),
        tarif: tarifN,
        label_jabatan: isi.label_jabatan.trim(),
        uraian_detail: isi.uraian_detail.trim(),
        maks_hari_default: m === "" ? null : Number(m),
      });
      setPesan({ jenis: "ok", teks: `Peran ${isi.peran.trim().toUpperCase()} disimpan.` });
      setUbah(null);
      await onBerubah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setBusy(false);
    }
  }

  const baris = (key: string) => (
    <tr key={key} className="bg-[#F8FAFC]">
      <td className={TD}>
        <input value={isi.peran} onChange={(e) => setIsi({ ...isi, peran: e.target.value })} className={`${INPUT} w-24`} placeholder="ppl" disabled={ubah !== "__baru"} aria-label="Kode peran" />
      </td>
      <td className={TD}>
        <input value={isi.label_jabatan} onChange={(e) => setIsi({ ...isi, label_jabatan: e.target.value })} className={`${INPUT} w-full min-w-[160px]`} placeholder="PPL SPDT NTP 2026" aria-label="Label jabatan" />
        <input value={isi.uraian_detail} onChange={(e) => setIsi({ ...isi, uraian_detail: e.target.value })} className={`${INPUT} mt-1 w-full min-w-[160px]`} placeholder="Uraian detail (opsional)" aria-label="Uraian detail" />
      </td>
      <td className={TD}>
        <input value={isi.tarif} onChange={(e) => setIsi({ ...isi, tarif: e.target.value })} inputMode="numeric" className={`${INPUT} w-28`} placeholder="58472" aria-label="Tarif per hari" />
      </td>
      <td className={TD}>
        <input value={isi.maks} onChange={(e) => setIsi({ ...isi, maks: e.target.value })} inputMode="numeric" className={`${INPUT} w-24`} placeholder="tanpa batas" aria-label="Maks hari" />
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        <button type="button" className={BTN} onClick={simpan} disabled={busy}>
          {busy ? "…" : "Simpan"}
        </button>{" "}
        <button type="button" className={BTN_O} onClick={() => setUbah(null)} disabled={busy}>
          Batal
        </button>
      </td>
    </tr>
  );

  return (
    <Kartu
      judul="Peran, tarif & maks hari"
      kanan={
        kelola && ubah !== "__baru" ? (
          <button type="button" className={BTN_O} onClick={() => mulaiUbah(null)}>
            ＋ Peran (mis. Koseka)
          </button>
        ) : undefined
      }
    >
      <div className="overflow-x-auto rounded-xl border border-[#EDF0F4]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={TH}>Peran</th>
              <th className={TH}>Label jabatan (di dokumen)</th>
              <th className={TH}>Tarif/hari</th>
              <th className={TH}>Maks hari</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {tarif.length === 0 && ubah !== "__baru" && (
              <tr>
                <td colSpan={5} className={`${TD} py-6 text-center text-[#7B8794]`}>
                  Belum ada peran. Tambahkan minimal satu (mis. PPL, PML) agar petugas bisa ditugaskan.
                </td>
              </tr>
            )}
            {tarif.map((t) =>
              ubah === t.peran ? (
                baris(t.peran)
              ) : (
                <tr key={t.peran}>
                  <td className={`${TD} font-bold`}>{t.peran.toUpperCase()}</td>
                  <td className={TD}>
                    {t.label_jabatan || "–"}
                    {t.uraian_detail && <p className="text-[11px] text-[#7B8794]">{t.uraian_detail}</p>}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{rupiah(Number(t.tarif))}</td>
                  <td className={`${TD} whitespace-nowrap`}>{t.maks_hari_default != null ? `${t.maks_hari_default} hari` : <Chip>tanpa batas</Chip>}</td>
                  <td className={`${TD} text-right`}>
                    {kelola && (
                      <button type="button" className={BTN_O} onClick={() => mulaiUbah(t)} disabled={ubah !== null}>
                        Ubah
                      </button>
                    )}
                  </td>
                </tr>
              )
            )}
            {ubah === "__baru" && baris("__baru")}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-[#7B8794]">Maks hari per petugas bisa ditimpa per orang di tab Penugasan. Kode peran tidak bisa diubah setelah dibuat.</p>
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>
            {pesan.teks}
          </Pesan>
        </div>
      )}
    </Kartu>
  );
}
