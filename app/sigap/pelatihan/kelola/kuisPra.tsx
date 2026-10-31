"use client";

// app/sigap/pelatihan/kelola/kuisPra.tsx
//
// (31 Okt 2026) Tab "Kuis Pra" di Kelola Pelatihan: pengaturan (aktif, survei sumber anomali, bank soal, jumlah soal, percobaan, nilai lulus, jadwal) + rekap per peserta.
// Soal dipilih PER PETUGAS menurut riwayat anomalinya dari bank soal berkode KT-<KODE>-<urut>. API: /api/sigap/kuis-pra. Logika: lib/sigapKuisPra.ts.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN_G, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import type { PengaturanKuisPra, StatusKuisPra } from "@/lib/sigapKuisPra";

const URL_API = "/api/sigap/kuis-pra";
type Pengaturan = PengaturanKuisPra & { kegiatan_anomali_id: number | null; kegiatan_bank_id: number | null };
type Pilihan = { id: number; nama: string; jenis: string; soal_kt: number };
type Rekap = { akun_id: number; nama: string; anomali: number; percobaan: number; terbaik: number | null; lulus: boolean; status: StatusKuisPra["status"] };
type Data = { tabel_ada: boolean; boleh_ubah: boolean; kegiatan_id: number; pengaturan: Pengaturan; pilihan_kegiatan: Pilihan[]; rekap: Rekap[] };

/** ISO -> "YYYY-MM-DDTHH:mm" waktu WIB (nilai input datetime-local); kosong bila null. */
const keInputWib = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16) : "");
const dariInputWib = (s: string) => (s ? new Date(`${s}:00+07:00`).toISOString() : null);

const LABEL_STATUS: Record<StatusKuisPra["status"], { t: string; w: "ok" | "wait" | "mut" | "bad" | "navy" }> = {
  nonaktif: { t: "Nonaktif", w: "mut" },
  belum_buka: { t: "Belum dibuka", w: "navy" },
  ditutup: { t: "Ditutup", w: "mut" },
  lulus: { t: "Lulus", w: "ok" },
  habis: { t: "Kesempatan habis", w: "bad" },
  lanjut: { t: "Sedang mengerjakan", w: "wait" },
  bisa_mulai: { t: "Belum mengerjakan", w: "wait" },
};

export default function KuisPraKelola() {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Data>(urlPelatihan(`${URL_API}?mode=admin`)));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  if (galat) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  return (
    <div className="space-y-3">
      {!data.tabel_ada && <Pesan jenis="info">Tabel kuis pra belum ada di database. Jalankan SQL 20261031o_anomali_petugas.sql lalu 20261031p_kuis_pra.sql, kemudian muat ulang halaman.</Pesan>}
      <Pengaturan data={data} setelah={muat} />
      <RekapKuis rekap={data.rekap} />
    </div>
  );
}

function Pengaturan({ data, setelah }: { data: Data; setelah: () => Promise<void> }) {
  const p = data.pengaturan;
  const [aktif, setAktif] = useState(p.aktif);
  const [anomali, setAnomali] = useState<number | "">(p.kegiatan_anomali_id ?? "");
  const [bank, setBank] = useState<number | "">(p.kegiatan_bank_id ?? "");
  const [jumlah, setJumlah] = useState(String(p.jumlah_soal));
  const [maks, setMaks] = useState(String(p.maks_percobaan));
  const [lulus, setLulus] = useState(String(p.nilai_lulus));
  const [wajib, setWajib] = useState(p.wajib_lulus);
  const [buka, setBuka] = useState(keInputWib(p.buka_at));
  const [tutup, setTutup] = useState(keInputWib(p.tutup_at));
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const bisa = data.boleh_ubah && data.tabel_ada;
  const bankPilihan = data.pilihan_kegiatan.filter((k) => k.soal_kt > 0);

  async function simpan() {
    setSibuk(true);
    setPesan(null);
    try {
      await fetchJson(urlPelatihan(URL_API), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "simpan_pengaturan", aktif, kegiatan_anomali_id: anomali === "" ? null : anomali, kegiatan_bank_id: bank === "" ? null : bank, jumlah_soal: Number(jumlah), maks_percobaan: Number(maks), nilai_lulus: Number(lulus), wajib_lulus: wajib, buka_at: dariInputWib(buka), tutup_at: dariInputWib(tutup) }),
      });
      setPesan({ jenis: "ok", teks: "Pengaturan kuis pra tersimpan." });
      await setelah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Kartu judul="🧠 Kuis pra pelatihan" ket="soal dipilih per petugas menurut riwayat anomalinya" kanan={aktif ? <Chip w="ok">aktif</Chip> : <Chip w="mut">nonaktif</Chip>}>
      <p className="mb-2 text-[12.5px] leading-snug text-[#55657D]">
        Petugas mengerjakan kuis sebelum pelatihan. Soal diambil dari bank soal berkode <b>KT-</b> sesuai kode temuan anomali petugas itu (yang paling sering muncul lebih dulu); bila temuannya sedikit atau tidak ada, sisanya diisi soal umum dari bank. Setelah lulus, kuis tidak bisa diulang; selama belum lulus petugas boleh mengulang sampai batas percobaan (soal berbeda tiap percobaan).
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-[13px] font-bold sm:col-span-2">
          <input type="checkbox" checked={aktif} disabled={!bisa} onChange={(e) => setAktif(e.target.checked)} />
          Kuis pra aktif (tampil bagi peserta)
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Anomali diambil dari survei
          <select className={`${INPUT} mt-1 w-full`} value={anomali} disabled={!bisa} onChange={(e) => setAnomali(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">(tanpa riwayat: soal acak dari bank)</option>
            {data.pilihan_kegiatan.filter((k) => k.jenis !== "pelatihan").map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Bank soal (kegiatan pemilik soal KT-)
          <select className={`${INPUT} mt-1 w-full`} value={bank} disabled={!bisa} onChange={(e) => setBank(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Pilih bank soal…</option>
            {bankPilihan.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama} ({k.soal_kt} soal)
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Jumlah soal per percobaan
          <input type="number" min={1} max={30} className={`${INPUT} mt-1 w-full`} value={jumlah} disabled={!bisa} onChange={(e) => setJumlah(e.target.value)} />
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Percobaan maksimal
          <input type="number" min={1} max={10} className={`${INPUT} mt-1 w-full`} value={maks} disabled={!bisa} onChange={(e) => setMaks(e.target.value)} />
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Nilai lulus
          <input type="number" min={0} max={100} className={`${INPUT} mt-1 w-full`} value={lulus} disabled={!bisa} onChange={(e) => setLulus(e.target.value)} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-[13px] font-bold">
          <input type="checkbox" checked={wajib} disabled={!bisa} onChange={(e) => setWajib(e.target.checked)} />
          Wajib lulus (penanda di rekap)
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Dibuka (WIB)
          <input type="datetime-local" className={`${INPUT} mt-1 w-full`} value={buka} disabled={!bisa} onChange={(e) => setBuka(e.target.value)} />
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Ditutup (WIB)
          <input type="datetime-local" className={`${INPUT} mt-1 w-full`} value={tutup} disabled={!bisa} onChange={(e) => setTutup(e.target.value)} />
        </label>
      </div>
      {bisa && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className={BTN_G} disabled={sibuk || bank === ""} onClick={simpan} title={bank === "" ? "Pilih bank soal" : undefined}>
            {sibuk ? "Menyimpan…" : "Simpan pengaturan"}
          </button>
        </div>
      )}
      {!data.boleh_ubah && <p className="mt-2 text-[12px] text-[#7B8794]">Anda hanya dapat melihat pengaturan ini.</p>}
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
        </div>
      )}
    </Kartu>
  );
}

function RekapKuis({ rekap }: { rekap: Rekap[] }) {
  const [cari, setCari] = useState("");
  const t = rekap.filter((r) => cari.trim() === "" || r.nama.toLowerCase().includes(cari.trim().toLowerCase()));
  const lulus = rekap.filter((r) => r.lulus).length;
  return (
    <Kartu judul="Rekap peserta" ket={`${rekap.length} peserta · ${lulus} lulus`} kanan={<input className={`${INPUT} w-[160px]`} value={cari} placeholder="Cari nama…" onChange={(e) => setCari(e.target.value)} aria-label="Cari peserta" />}>
      {rekap.length === 0 ? (
        <p className="text-[13px] text-[#7B8794]">Belum ada peserta pada pelatihan ini.</p>
      ) : (
        <TabelKartu className="!shadow-none">
          <thead>
            <tr>
              <th className={TH}>Nama</th>
              <th className={TH}>Temuan anomali</th>
              <th className={TH}>Percobaan</th>
              <th className={TH}>Nilai terbaik</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {t.map((r) => (
              <tr key={r.akun_id}>
                <td className={`${TD} font-semibold`}>{r.nama}</td>
                <td className={`${TD} tabular-nums`}>{r.anomali}</td>
                <td className={`${TD} tabular-nums`}>{r.percobaan}</td>
                <td className={`${TD} tabular-nums`}>{r.terbaik ?? "–"}</td>
                <td className={TD}>
                  <Chip w={LABEL_STATUS[r.status].w}>{LABEL_STATUS[r.status].t}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </TabelKartu>
      )}
      <div className="mt-1.5 text-right">
        <button type="button" className={BTN_O} onClick={() => setCari("")} hidden={cari === ""}>
          Hapus pencarian
        </button>
      </div>
    </Kartu>
  );
}
