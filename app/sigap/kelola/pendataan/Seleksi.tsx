"use client";

// app/sigap/kelola/pendataan/Seleksi.tsx
//
// (31 Okt 2026) Perekrutan petugas oleh PJ survei, di tab "1 · Persiapan" PER KEGIATAN. Dua jalur:
//   Penunjukan langsung  PJ memplot nama Mitra Kepka ke survei lewat tab 2 · Tim & Surat Tugas (di sini hanya penjelasan).
//   Seleksi              PJ merancang kebutuhan (PPL/PML, dikurangi yang sudah di-plot organik), wilayah sampel, syarat khusus (domisili, jarak),
//                        jadwal, ketentuan peringkat; layar menampilkan PRATINJAU kandidat (Mitra Kepka anggota pool) yang memenuhi syarat.
// Paket 4: setelah dibuka, panel PenilaianSeleksi (kertas kerja, tes, peringkat per wilayah, penetapan, pengumuman) tampil di bawah daftar pendaftar.
// Aturan murni: lib/seleksiSyarat.ts. Data: /api/sigap/seleksi.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import PenilaianSeleksi from "./PenilaianSeleksi";
import { SYARAT_BAWAAN, sisaKebutuhan, type HasilKelayakan, type JalurPerekrutan, type PeringkatLevel, type RingkasKelayakan, type SyaratSeleksi, type WilayahSeleksi } from "@/lib/seleksiSyarat";

type RingkasSeleksi = { id: number; nama: string; jalur: JalurPerekrutan; status: string; kebutuhan_ppl: number; kebutuhan_pml: number; sudah_ppl: number; sudah_pml: number; diubah_at: string };
type Daftar = { tabel_siap: boolean; boleh_kelola: boolean; seleksi: RingkasSeleksi[] };
type Kandidat = { id: number; nama: string; kecamatan: string | null; nagari: string | null; kelayakan: HasilKelayakan };
type Detail = {
  seleksi: {
    id: number; kegiatan_id: number; nama: string; jalur: JalurPerekrutan; status: string; kebutuhan_ppl: number; kebutuhan_pml: number; sudah_ppl: number; sudah_pml: number;
    syarat: SyaratSeleksi; jadwal_buka: string | null; jadwal_tutup: string | null; peringkat_level: PeringkatLevel; tampil_nilai: boolean; wilayah: WilayahSeleksi[];
    dibuka_at: string | null; ajakan_at: string | null; ajakan_jumlah: number;
  };
  pendaftar: { tabel_siap: boolean; daftar: { akun_id: number; nama: string; kecamatan: string | null; peran: string; status: string; mendaftar_at: string }[] };
  pratinjau: { tahun: number; pool_siap: boolean; ringkasan: RingkasKelayakan; kandidat: Kandidat[] };
  boleh_kelola: boolean;
};
type Form = {
  id: number | null; nama: string; jalur: JalurPerekrutan; kebutuhan_ppl: string; kebutuhan_pml: string; sudah_ppl: string; sudah_pml: string; syarat: SyaratSeleksi;
  jadwal_buka: string; jadwal_tutup: string; peringkat_level: PeringkatLevel; tampil_nilai: boolean; wilayah: WilayahSeleksi[]; status: string;
};

const kartu = "mt-4 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
const kolom = "mt-1 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14px] text-[#1B2B4B] disabled:bg-slate-100";
const judulKartu = "text-[15px] font-extrabold text-[#0F2A52]";
const ket = "mt-1 text-[12.5px] leading-snug text-[#55657D]";
const label = "block text-[12.5px] font-semibold text-[#44546F]";
const tombol = "inline-flex min-h-[40px] items-center justify-center rounded-[12px] bg-[#1F5FD1] px-4 text-[13.5px] font-bold text-white disabled:opacity-50";
const tombolPutih = "inline-flex min-h-[40px] items-center justify-center rounded-[12px] border border-[#CBD6E6] bg-white px-4 text-[13.5px] font-bold text-[#1B2B4B] disabled:opacity-50";

const FORM_BARU: Form = {
  id: null, nama: "", jalur: "seleksi", kebutuhan_ppl: "0", kebutuhan_pml: "0", sudah_ppl: "0", sudah_pml: "0", syarat: SYARAT_BAWAAN, jadwal_buka: "", jadwal_tutup: "",
  peringkat_level: "kabupaten", tampil_nilai: false, wilayah: [], status: "draft",
};

/** ISO UTC -> nilai input datetime-local dalam WIB. */
const isoKeLokal = (iso: string | null): string => (iso ? new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 16) : "");
/** Nilai input datetime-local (dianggap WIB) -> ISO UTC. Kosong/rusak -> "". */
const lokalKeIso = (v: string): string => {
  if (!v) return "";
  const t = Date.parse(`${v}:00+07:00`);
  return Number.isNaN(t) ? "" : new Date(t).toISOString();
};
const angka = (v: string): number => (v.trim() === "" ? Number.NaN : Number(v));

/** ISO -> "05 Nov 16.00 WIB". */
const waktuTeks = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " WIB";
  } catch {
    return iso;
  }
};

const LABEL_STATUS: Record<string, string> = { draft: "Draft", dibuka: "Dibuka", ditutup: "Ditutup", selesai: "Selesai", batal: "Dibatalkan" };

export default function Seleksi({ kegiatanId, nama }: { kegiatanId: number; nama: string }) {
  const [daftar, setDaftar] = useState<Daftar | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState("");
  const [hasilCari, setHasilCari] = useState<WilayahSeleksi[]>([]);
  const [mencari, setMencari] = useState(false);

  const muatDaftar = useCallback(async () => {
    try {
      setDaftar(await apiPortal<Daftar>(`/api/sigap/seleksi?kegiatan_id=${kegiatanId}`));
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal memuat seleksi.");
    }
  }, [kegiatanId]);

  useEffect(() => {
    if (buka) void muatDaftar();
  }, [buka, muatDaftar]);

  const bukaSeleksi = useCallback(async (id: number) => {
    setSibuk(true);
    try {
      const d = await apiPortal<Detail>(`/api/sigap/seleksi?id=${id}`);
      setDetail(d);
      const s = d.seleksi;
      setForm({
        id: s.id, nama: s.nama, jalur: s.jalur, kebutuhan_ppl: String(s.kebutuhan_ppl), kebutuhan_pml: String(s.kebutuhan_pml), sudah_ppl: String(s.sudah_ppl), sudah_pml: String(s.sudah_pml),
        syarat: s.syarat, jadwal_buka: isoKeLokal(s.jadwal_buka), jadwal_tutup: isoKeLokal(s.jadwal_tutup), peringkat_level: s.peringkat_level, tampil_nilai: s.tampil_nilai, wilayah: s.wilayah, status: s.status,
      });
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal membuka seleksi.");
    } finally {
      setSibuk(false);
    }
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const draft = form?.status === "draft";
  const bolehUbah = (detail?.boleh_kelola ?? daftar?.boleh_kelola ?? false) && draft;

  async function cariWilayah() {
    if (cari.trim().length < 2) return;
    setMencari(true);
    try {
      const d = await apiPortal<{ wilayah: WilayahSeleksi[] }>(`/api/sigap/seleksi?aksi=cari_wilayah&q=${encodeURIComponent(cari.trim())}`);
      setHasilCari(d.wilayah);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Pencarian gagal.");
    } finally {
      setMencari(false);
    }
  }
  const tambahWilayah = (ws: WilayahSeleksi[]) =>
    setForm((f) => {
      if (!f) return f;
      const ada = new Set(f.wilayah.map((w) => w.kode));
      return { ...f, wilayah: [...f.wilayah, ...ws.filter((w) => !ada.has(w.kode))] };
    });

  async function simpan() {
    if (!form) return;
    setSibuk(true);
    setGalat(null);
    setInfo(null);
    try {
      const r = await apiPortal<{ ok: boolean; id: number }>("/api/sigap/seleksi", {
        method: "POST",
        body: JSON.stringify({
          aksi: "simpan", id: form.id, kegiatan_id: kegiatanId, nama: form.nama, jalur: form.jalur,
          kebutuhan_ppl: angka(form.kebutuhan_ppl), kebutuhan_pml: angka(form.kebutuhan_pml), sudah_ppl: angka(form.sudah_ppl), sudah_pml: angka(form.sudah_pml),
          syarat: form.syarat, jadwal_buka: lokalKeIso(form.jadwal_buka) || null, jadwal_tutup: lokalKeIso(form.jadwal_tutup) || null,
          peringkat_level: form.peringkat_level, tampil_nilai: form.tampil_nilai, wilayah: form.wilayah,
        }),
      });
      setInfo("Rancangan tersimpan.");
      await muatDaftar();
      await bukaSeleksi(r.id);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  }

  async function batalkan() {
    if (!form?.id || !window.confirm(`Batalkan seleksi "${form.nama}"? Seleksi yang dibatalkan tidak dapat diubah lagi.`)) return;
    setSibuk(true);
    try {
      await apiPortal("/api/sigap/seleksi", { method: "POST", body: JSON.stringify({ aksi: "batal", id: form.id }) });
      setForm(null);
      setDetail(null);
      setInfo("Seleksi dibatalkan.");
      await muatDaftar();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal membatalkan.");
    } finally {
      setSibuk(false);
    }
  }

  async function ubahStatus(aksi: "buka" | "tutup") {
    if (!form?.id) return;
    const t = aksi === "buka" ? `Buka pendaftaran "${form.nama}"? Rancangan tidak dapat diubah lagi setelah dibuka.` : `Tutup pendaftaran "${form.nama}"?`;
    if (!window.confirm(t)) return;
    setSibuk(true);
    setGalat(null);
    try {
      await apiPortal("/api/sigap/seleksi", { method: "POST", body: JSON.stringify({ aksi, id: form.id }) });
      setInfo(aksi === "buka" ? "Pendaftaran dibuka." : "Pendaftaran ditutup.");
      await muatDaftar();
      await bukaSeleksi(form.id);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengubah status.");
    } finally {
      setSibuk(false);
    }
  }

  async function kirimAjakan() {
    if (!form?.id) return;
    const n = detail?.pratinjau.ringkasan.memenuhi ?? 0;
    if (!window.confirm(`Kirim notifikasi ajakan ke Mitra yang memenuhi syarat dan belum mendaftar (maksimal ${n} orang)?`)) return;
    setSibuk(true);
    setGalat(null);
    try {
      const r = await apiPortal<{ sasaran: number; berlangganan: number; tanpa_push: number; terkirim: number }>("/api/sigap/seleksi", { method: "POST", body: JSON.stringify({ aksi: "ajakan", id: form.id }) });
      setInfo(`Ajakan dikirim: sasaran ${r.sasaran} Mitra, ${r.berlangganan} punya notifikasi aktif (${r.terkirim} perangkat terkirim). ${r.tanpa_push} Mitra belum berlangganan notifikasi: kirim pesan undangan lewat WhatsApp.`);
      await bukaSeleksi(form.id);
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal mengirim ajakan.");
    } finally {
      setSibuk(false);
    }
  }

  async function salinUndangan() {
    if (!form?.id) return;
    try {
      const r = await apiPortal<{ teks: string }>(`/api/sigap/seleksi?aksi=undangan&id=${form.id}`);
      try {
        await navigator.clipboard.writeText(r.teks);
        setInfo("Pesan undangan disalin. Tempel ke WhatsApp atau grup.");
      } catch {
        window.prompt("Salin pesan undangan berikut:", r.teks);
      }
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyusun pesan.");
    }
  }

  const sisaPpl = form ? sisaKebutuhan(angka(form.kebutuhan_ppl), angka(form.sudah_ppl)) : 0;
  const sisaPml = form ? sisaKebutuhan(angka(form.kebutuhan_pml), angka(form.sudah_pml)) : 0;
  const kandidatTampil = useMemo(() => (detail?.pratinjau.kandidat ?? []).slice(0, 120), [detail]);

  return (
    <section className={kartu}>
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setBuka((b) => !b)} aria-expanded={buka}>
        <span>
          <span className={judulKartu}>Perekrutan petugas · penunjukan langsung atau seleksi</span>
          <span className={`${ket} block`}>Mitra yang boleh dipekerjakan hanya Mitra Kepka anggota pool (tab Pengguna di Peran &amp; Akses). {nama}</span>
        </span>
        <span className="text-[13px] font-bold text-[#1F5FD1]">{buka ? "Tutup" : "Buka"}</span>
      </button>

      {buka && (
        <div className="mt-3 space-y-3">
          {galat && <p role="alert" className="rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#B42329]">{galat}</p>}
          {info && <p className="rounded-[12px] bg-[#E3F6EC] px-3 py-2 text-[13px] text-[#13794B]">{info}</p>}
          {daftar && !daftar.tabel_siap && <p className="rounded-[12px] bg-[#FFF4D6] px-3 py-2 text-[13px] text-[#8A6200]">Tabel seleksi belum dibuat (SQL 20261031f_seleksi.sql).</p>}

          {!form && daftar?.tabel_siap && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-[#55657D]">{daftar.seleksi.length === 0 ? "Belum ada rancangan untuk kegiatan ini." : `${daftar.seleksi.length} rancangan`}</p>
                {daftar.boleh_kelola && (
                  <button type="button" className={tombol} onClick={() => { setForm(FORM_BARU); setDetail(null); setInfo(null); }}>
                    Rancang baru
                  </button>
                )}
              </div>
              {daftar.seleksi.map((s) => (
                <button key={s.id} type="button" className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#DDE6F3] px-3 py-2.5 text-left hover:bg-[#F5F8FE]" onClick={() => void bukaSeleksi(s.id)}>
                  <span>
                    <span className="block text-[14px] font-bold text-[#0F2A52]">{s.nama}</span>
                    <span className="block text-[12px] text-[#55657D]">
                      {s.jalur === "seleksi" ? "Seleksi" : "Penunjukan langsung"} · PPL {s.kebutuhan_ppl} (sisa {sisaKebutuhan(s.kebutuhan_ppl, s.sudah_ppl)}) · PML {s.kebutuhan_pml} (sisa {sisaKebutuhan(s.kebutuhan_pml, s.sudah_pml)})
                    </span>
                  </span>
                  <span className="rounded-[9px] bg-[#EEF2F7] px-2 py-[3px] text-[11px] font-bold text-[#5B6B84]">{LABEL_STATUS[s.status] ?? s.status}</span>
                </button>
              ))}
            </>
          )}

          {form && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-extrabold text-[#0F2A52]">{form.id ? "Rancangan seleksi" : "Rancangan baru"} {!draft && <span className="ml-1 text-[12px] text-[#8A6200]">({LABEL_STATUS[form.status] ?? form.status}: tidak dapat diubah)</span>}</h3>
                <button type="button" className={tombolPutih} onClick={() => { setForm(null); setDetail(null); }}>
                  Kembali ke daftar
                </button>
              </div>

              <div>
                <label className={label} htmlFor="sel-nama">Nama seleksi</label>
                <input id="sel-nama" className={kolom} value={form.nama} disabled={!bolehUbah} maxLength={120} onChange={(e) => set("nama", e.target.value)} placeholder="mis. Seleksi PPL Seruti TW IV" />
              </div>

              <fieldset className="flex flex-wrap gap-4" disabled={!bolehUbah}>
                <legend className={label}>Jalur perekrutan</legend>
                <label className="flex items-center gap-1.5 text-[13.5px]"><input type="radio" name="jalur" checked={form.jalur === "penunjukan"} onChange={() => set("jalur", "penunjukan")} /> Penunjukan langsung</label>
                <label className="flex items-center gap-1.5 text-[13.5px]"><input type="radio" name="jalur" checked={form.jalur === "seleksi"} onChange={() => set("jalur", "seleksi")} /> Seleksi</label>
              </fieldset>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {(["kebutuhan_ppl", "kebutuhan_pml", "sudah_ppl", "sudah_pml"] as const).map((k) => (
                  <div key={k}>
                    <label className={label} htmlFor={`sel-${k}`}>{k === "kebutuhan_ppl" ? "Kebutuhan PPL" : k === "kebutuhan_pml" ? "Kebutuhan PML" : k === "sudah_ppl" ? "PPL sudah di-plot organik" : "PML sudah di-plot organik"}</label>
                    <input id={`sel-${k}`} type="number" min={0} className={kolom} value={form[k]} disabled={!bolehUbah} onChange={(e) => set(k, e.target.value)} />
                  </div>
                ))}
              </div>
              <p className={ket}>Yang diseleksi: <b>{sisaPpl}</b> PPL dan <b>{sisaPml}</b> PML (kebutuhan dikurangi yang sudah di-plot pegawai organik).</p>

              {form.jalur === "penunjukan" ? (
                <p className="rounded-[12px] bg-[#EEF3FB] px-3 py-2.5 text-[13px] text-[#44546F]">
                  Penunjukan langsung: PJ memplot nama Mitra Kepka ke kegiatan ini lewat tab <b>2 · Tim &amp; Surat Tugas</b> (Penugasan). Peringatan beban penuh atau bentrok jadwal mengikuti peta beban tugas Delego (menyusul).
                </p>
              ) : (
                <>
                  <div className="rounded-[14px] border border-[#DDE6F3] p-3">
                    <h4 className="text-[13.5px] font-extrabold text-[#0F2A52]">Syarat khusus (centang yang diterapkan)</h4>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="flex items-center gap-2 text-[13.5px] font-semibold">
                          <input type="checkbox" disabled={!bolehUbah} checked={form.syarat.domisili.aktif} onChange={(e) => set("syarat", { ...form.syarat, domisili: { ...form.syarat.domisili, aktif: e.target.checked } })} />
                          Domisili di wilayah sampel
                        </label>
                        <select aria-label="Tingkat domisili" className={kolom} disabled={!bolehUbah || !form.syarat.domisili.aktif} value={form.syarat.domisili.level} onChange={(e) => set("syarat", { ...form.syarat, domisili: { ...form.syarat.domisili, level: e.target.value === "nagari" ? "nagari" : "kecamatan" } })}>
                          <option value="kecamatan">Sekecamatan dengan wilayah sampel</option>
                          <option value="nagari">Senagari dengan wilayah sampel</option>
                        </select>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-[13.5px] font-semibold">
                          <input type="checkbox" disabled={!bolehUbah} checked={form.syarat.jarak.aktif} onChange={(e) => set("syarat", { ...form.syarat, jarak: { ...form.syarat.jarak, aktif: e.target.checked } })} />
                          Jarak rumah ke wilayah sampel terdekat
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px]">Paling jauh</span>
                          <input aria-label="Jarak maksimum km" type="number" min={1} max={200} className={`${kolom} !mt-1 !w-[90px]`} disabled={!bolehUbah || !form.syarat.jarak.aktif} value={form.syarat.jarak.maks_km} onChange={(e) => set("syarat", { ...form.syarat, jarak: { ...form.syarat.jarak, maks_km: Number(e.target.value) || 1 } })} />
                          <span className="text-[13px]">km (garis lurus)</span>
                        </div>
                      </div>
                    </div>
                    <p className={ket}>Mitra yang titik domisili atau nagarinya belum tercatat tidak ditolak: mereka masuk golongan <b>perlu melengkapi lokasi</b>.</p>
                  </div>

                  <div className="rounded-[14px] border border-[#DDE6F3] p-3">
                    <h4 className="text-[13.5px] font-extrabold text-[#0F2A52]">Wilayah sampel ({form.wilayah.length})</h4>
                    {bolehUbah && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input aria-label="Cari wilayah" className={`${kolom} !mt-0 min-w-[200px] flex-1`} placeholder="Cari nagari, jorong, atau kecamatan…" value={cari} onChange={(e) => setCari(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void cariWilayah(); }} />
                        <button type="button" className={tombolPutih} disabled={mencari || cari.trim().length < 2} onClick={() => void cariWilayah()}>{mencari ? "Mencari…" : "Cari"}</button>
                        {hasilCari.length > 0 && <button type="button" className={tombol} onClick={() => tambahWilayah(hasilCari)}>Tambah semua ({hasilCari.length})</button>}
                      </div>
                    )}
                    {hasilCari.length > 0 && bolehUbah && (
                      <ul className="mt-2 max-h-[200px] overflow-y-auto rounded-[12px] border border-[#EEF2F7]">
                        {hasilCari.map((w) => (
                          <li key={w.kode} className="flex items-center justify-between gap-2 border-b border-[#EEF2F7] px-2.5 py-1.5 text-[12.5px] last:border-b-0">
                            <span>{w.nama} <span className="text-[#7B8794]">· {w.kecamatan}{w.lat === null ? " · tanpa koordinat" : ""}</span></span>
                            <button type="button" className="font-bold text-[#1F5FD1]" onClick={() => tambahWilayah([w])}>Tambah</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {form.wilayah.length > 0 && (
                      <div className="mt-2 max-h-[260px] overflow-auto rounded-[12px] border border-[#EEF2F7]">
                        <table className="w-full text-[12.5px]">
                          <thead className="bg-[#F5F8FE] text-left text-[#5B6B84]"><tr><th className="px-2 py-1.5">Wilayah</th><th className="px-2 py-1.5">Sampel</th><th className="px-2 py-1.5">PPL</th><th className="px-2 py-1.5">PML</th><th className="px-2 py-1.5" /></tr></thead>
                          <tbody>
                            {form.wilayah.map((w) => (
                              <tr key={w.kode} className="border-t border-[#EEF2F7]">
                                <td className="px-2 py-1.5">{w.nama}{w.lat === null && <span className="ml-1 text-[11px] text-[#8A6200]">tanpa koordinat</span>}</td>
                                {(["jumlah_sampel", "kebutuhan_ppl", "kebutuhan_pml"] as const).map((k) => (
                                  <td key={k} className="px-2 py-1.5">
                                    <input aria-label={`${k} ${w.nama}`} type="number" min={0} className="w-[64px] rounded-[8px] border border-[#D9E3F2] px-1.5 py-1" disabled={!bolehUbah} value={w[k]} onChange={(e) => set("wilayah", form.wilayah.map((x) => (x.kode === w.kode ? { ...x, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x)))} />
                                  </td>
                                ))}
                                <td className="px-2 py-1.5 text-right">{bolehUbah && <button type="button" className="font-bold text-[#B42329]" onClick={() => set("wilayah", form.wilayah.filter((x) => x.kode !== w.kode))}>Hapus</button>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className={label} htmlFor="sel-buka">Seleksi dibuka (WIB)</label>
                      <input id="sel-buka" type="datetime-local" className={kolom} disabled={!bolehUbah} value={form.jadwal_buka} onChange={(e) => set("jadwal_buka", e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="sel-tutup">Seleksi ditutup (WIB)</label>
                      <input id="sel-tutup" type="datetime-local" className={kolom} disabled={!bolehUbah} value={form.jadwal_tutup} onChange={(e) => set("jadwal_tutup", e.target.value)} />
                    </div>
                    <div>
                      <label className={label} htmlFor="sel-peringkat">Peringkat dihitung per</label>
                      <select id="sel-peringkat" className={kolom} disabled={!bolehUbah} value={form.peringkat_level} onChange={(e) => set("peringkat_level", e.target.value as PeringkatLevel)}>
                        <option value="kabupaten">Kabupaten (satu peringkat)</option>
                        <option value="kecamatan">Per kecamatan</option>
                        <option value="nagari">Per nagari</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 self-end pb-2 text-[13.5px] font-semibold">
                      <input type="checkbox" disabled={!bolehUbah} checked={form.tampil_nilai} onChange={(e) => set("tampil_nilai", e.target.checked)} />
                      Tampilkan nilai dan peringkat kepada peserta
                    </label>
                  </div>
                </>
              )}

              {bolehUbah && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={tombol} disabled={sibuk} onClick={() => void simpan()}>{sibuk ? "Menyimpan…" : "Simpan rancangan"}</button>
                  {form.id && <button type="button" className={`${tombolPutih} !text-[#B42329]`} disabled={sibuk} onClick={() => void batalkan()}>Batalkan seleksi</button>}
                </div>
              )}

              {detail && form.id && form.jalur === "seleksi" && detail.boleh_kelola && (
                <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#DDE6F3] bg-[#F9FBFE] p-3">
                  <span className="mr-auto text-[13px] font-semibold text-[#44546F]">Pendaftaran: {LABEL_STATUS[detail.seleksi.status] ?? detail.seleksi.status}</span>
                  {detail.seleksi.status === "draft" && <button type="button" className={tombol} disabled={sibuk} onClick={() => void ubahStatus("buka")}>Buka pendaftaran</button>}
                  {detail.seleksi.status === "dibuka" && (
                    <>
                      <button type="button" className={tombol} disabled={sibuk} onClick={() => void kirimAjakan()}>Kirim ajakan (notifikasi)</button>
                      <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => void salinUndangan()}>Salin pesan undangan</button>
                      <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => void ubahStatus("tutup")}>Tutup pendaftaran</button>
                    </>
                  )}
                  {detail.seleksi.status === "ditutup" && <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => void salinUndangan()}>Salin pesan undangan</button>}
                  {detail.seleksi.ajakan_at && <span className="w-full text-[12px] text-[#6B7A90]">Ajakan terakhir {waktuTeks(detail.seleksi.ajakan_at)} ({detail.seleksi.ajakan_jumlah}x). Jeda minimal 10 menit antar ajakan.</span>}
                </div>
              )}

              {detail && form.jalur === "seleksi" && (
                <div className="rounded-[14px] border border-[#DDE6F3] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[13.5px] font-extrabold text-[#0F2A52]">Pratinjau kandidat (Mitra Kepka pool {detail.pratinjau.tahun})</h4>
                    <button type="button" className={tombolPutih} disabled={sibuk} onClick={() => form.id && void bukaSeleksi(form.id)}>Muat ulang</button>
                  </div>
                  {!detail.pratinjau.pool_siap && <p className="mt-2 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">Tabel pool belum dibuat (SQL 20261031e): semua Mitra aktif dihitung sebagai calon.</p>}
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {[["Calon", detail.pratinjau.ringkasan.total, "text-[#0F2A52]"], ["Memenuhi syarat", detail.pratinjau.ringkasan.memenuhi, "text-[#13794B]"], ["Perlu melengkapi lokasi", detail.pratinjau.ringkasan.perlu_lokasi, "text-[#8A6200]"], ["Tidak memenuhi", detail.pratinjau.ringkasan.tidak, "text-[#B42329]"]].map(([l, n, w]) => (
                      <div key={String(l)} className="rounded-[12px] border border-[#DDE6F3] px-3 py-2"><div className="text-[11.5px] font-semibold text-[#6B7A90]">{l}</div><div className={`text-[20px] font-extrabold ${w}`}>{n}</div></div>
                    ))}
                  </div>
                  <p className={ket}>Pratinjau memakai rancangan yang TERSIMPAN. Penerima push ajakan nanti = yang memenuhi syarat; yang perlu melengkapi lokasi dapat diminta mengisi lokasi dulu.</p>
                  <div className="mt-2 max-h-[320px] overflow-auto rounded-[12px] border border-[#EEF2F7]">
                    <table className="w-full text-[12.5px]">
                      <thead className="bg-[#F5F8FE] text-left text-[#5B6B84]"><tr><th className="px-2 py-1.5">Nama</th><th className="px-2 py-1.5">Kecamatan</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Terdekat</th></tr></thead>
                      <tbody>
                        {kandidatTampil.map((c) => (
                          <tr key={c.id} className="border-t border-[#EEF2F7]">
                            <td className="px-2 py-1.5 font-semibold">{c.nama}</td>
                            <td className="px-2 py-1.5">{c.kecamatan ?? "–"}</td>
                            <td className="px-2 py-1.5" title={c.kelayakan.alasan.join("; ")}>{c.kelayakan.status === "memenuhi" ? "Memenuhi" : c.kelayakan.status === "perlu_lokasi" ? "Perlu lokasi" : "Tidak"}</td>
                            <td className="px-2 py-1.5">{c.kelayakan.jarak_km !== null ? `${c.kelayakan.jarak_km} km · ${c.kelayakan.wilayah_terdekat}` : "–"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {detail.pratinjau.kandidat.length > kandidatTampil.length && <p className={ket}>Menampilkan {kandidatTampil.length} dari {detail.pratinjau.kandidat.length} calon (urut: memenuhi syarat dahulu).</p>}
                </div>
              )}

              {detail && form.jalur === "seleksi" && (
                <div className="rounded-[14px] border border-[#DDE6F3] p-3">
                  <h4 className="text-[13.5px] font-extrabold text-[#0F2A52]">Pendaftar ({detail.pendaftar.daftar.filter((x) => x.status === "terdaftar").length})</h4>
                  {!detail.pendaftar.tabel_siap ? (
                    <p className="mt-2 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">Tabel pendaftar belum dibuat (SQL 20261031g_seleksi_daftar.sql).</p>
                  ) : detail.pendaftar.daftar.length === 0 ? (
                    <p className={ket}>Belum ada yang mendaftar.</p>
                  ) : (
                    <div className="mt-2 max-h-[260px] overflow-auto rounded-[12px] border border-[#EEF2F7]">
                      <table className="w-full text-[12.5px]">
                        <thead className="bg-[#F5F8FE] text-left text-[#5B6B84]"><tr><th className="px-2 py-1.5">Nama</th><th className="px-2 py-1.5">Kecamatan</th><th className="px-2 py-1.5">Peran</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Mendaftar</th></tr></thead>
                        <tbody>
                          {detail.pendaftar.daftar.map((x) => (
                            <tr key={x.akun_id} className={`border-t border-[#EEF2F7] ${x.status === "mundur" ? "opacity-60" : ""}`}>
                              <td className="px-2 py-1.5 font-semibold">{x.nama}</td>
                              <td className="px-2 py-1.5">{x.kecamatan ?? "–"}</td>
                              <td className="px-2 py-1.5">{x.peran.toUpperCase()}</td>
                              <td className="px-2 py-1.5">{x.status === "terdaftar" ? "Terdaftar" : "Mundur"}</td>
                              <td className="px-2 py-1.5">{waktuTeks(x.mendaftar_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {detail && form.id && form.jalur === "seleksi" && detail.seleksi.status !== "draft" && detail.seleksi.status !== "batal" && (
                <PenilaianSeleksi key={`${form.id}-${detail.seleksi.status}`} seleksiId={form.id} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
