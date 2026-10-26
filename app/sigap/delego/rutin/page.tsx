"use client";

// app/sigap/delego/rutin/page.tsx
//
// (26 Okt 2026, tahap 39) Pekerjaan berulang: templat yang membuat delegasi otomatis pukul 06:00 WIB pada hari jadwalnya (mingguan atau bulanan), mis. rekap mingguan,
// penyusunan laporan bulanan. Tiap penerima mendapat delegasi sendiri; delegasi yang sudah ada untuk periode yang sama tidak dibuat dua kali. Mengubah atau menonaktifkan
// templat tidak mengubah delegasi yang sudah dibuat. Jadwal dijalankan pg_cron (berkas 20261026j).

import { useEffect, useMemo, useState } from "react";
import { angka, tglPendek } from "@/lib/delego/hitung";
import { hitungTargetJenis, NAMA_HARI_PANJANG, periksaRutin, rutinBerikutnya, teksDurasi, teksJadwalRutin, type FormRutin } from "@/lib/delego/teknis";
import type { Rutin } from "@/lib/delego/tipe";
import { useBahan, useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import PemilihPenerima, { type Pilihan } from "../PemilihPenerima";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat, Peringatan, fmt } from "../ui";

const HARI: { n: number; label: string }[] = [
  { n: 1, label: "Sen" }, { n: 2, label: "Sel" }, { n: 3, label: "Rab" }, { n: 4, label: "Kam" }, { n: 5, label: "Jum" }, { n: 6, label: "Sab" }, { n: 7, label: "Min" },
];

const kosong = (hari: string): FormRutin => ({
  judul: "", kelompok: "", jenisId: "", jumlah: "", bobot: "1", frekuensi: "mingguan", hari: "1", durasi: "5", hk: [1, 2, 3, 4, 5], mulai: hari, berakhir: "", jumlahPenerima: 0,
});

export default function RutinHalaman() {
  const { hak, hari, pemberi, manajer } = useKonteksDelego();
  const bahan = useBahan({ aktif: manajer });
  const daftar = bahan.data?.rutin ?? [];
  const jenis = (hak.jenis ?? []).filter((j) => j.aktif);
  const namaJenis = (id: number) => (hak.jenis ?? []).find((j) => j.id === id);
  const kelompokBoleh = hak.beri_kelompok ?? [];
  const daftarKelompok = (hak.kelompok ?? []).filter((k) => k.aktif && kelompokBoleh.includes(k.kode));

  const [edit, setEdit] = useState<{ id: number | null } | null>(null);
  const [f, setF] = useState<FormRutin>(kosong(hari));
  const [uraian, setUraian] = useState("");
  const [pilih, setPilih] = useState<Pilihan[]>([]);
  const kirim = useKirim(bahan.muat);

  useEffect(() => {
    if (edit && edit.id === null && !f.kelompok && daftarKelompok.length === 1) setF((x) => ({ ...x, kelompok: daftarKelompok[0].kode }));
  }, [edit, f.kelompok, daftarKelompok]);

  const baru = () => {
    setF(kosong(hari));
    setUraian("");
    setPilih([]);
    setEdit({ id: null });
  };
  const ubah = (r: Rutin) => {
    setF({
      judul: r.judul, kelompok: r.ro_kode, jenisId: String(r.jenis_id), jumlah: String(angka(r.jumlah)), bobot: String(r.bobot), frekuensi: r.frekuensi, hari: String(r.hari),
      durasi: String(r.durasi_hari), hk: r.hari_kerja, mulai: r.mulai_berlaku, berakhir: r.berakhir ?? "", jumlahPenerima: r.penerima.length,
    });
    setUraian(r.uraian);
    setPilih(r.penerima.map((p) => ({ akun: p.akun, nama: p.nama ?? `Akun ${p.akun}`, jenis: "organik", peran: p.peran, pj: "" })));
    setEdit({ id: r.id });
  };

  const form: FormRutin = { ...f, jumlahPenerima: pilih.length };
  const galat = useMemo(() => (edit ? periksaRutin(form) : []), [edit, form]);
  const jn = jenis.find((j) => String(j.id) === f.jenisId) ?? namaJenis(Number(f.jenisId)) ?? null;
  const pps = jn ? angka(jn.poin_per_satuan) : 0;
  const jml = Number(f.jumlah.replace(",", "."));
  const hitung = jn && jml > 0 && Number(f.durasi) >= 1 ? hitungTargetJenis(pps, jml, f.mulai || hari, tambahDurasi(f.mulai || hari, Number(f.durasi) - 1), f.hk) : null;

  const simpan = async () => {
    if (!edit || galat.length > 0) return;
    const ok = await kirim.kirim("keu_dlg_rutin_simpan", {
      p_data: {
        ...(edit.id !== null ? { id: edit.id } : {}),
        judul: f.judul.trim(), uraian: uraian.trim(), kelompok: f.kelompok, jenis_id: Number(f.jenisId), jumlah: jml, bobot: Number(f.bobot),
        frekuensi: f.frekuensi, hari: Number(f.hari), durasi_hari: Number(f.durasi), hari_kerja: f.hk, mulai_berlaku: f.mulai, berakhir: f.berakhir || null,
        penerima: pilih.map((p) => ({ akun: p.akun, peran: p.peran })),
      },
    });
    if (ok) setEdit(null);
  };
  const alihAktif = (r: Rutin) => void kirim.kirim("keu_dlg_rutin_simpan", { p_data: { id: r.id, aktif: !r.aktif } });

  if (!pemberi) {
    return (
      <Halaman judul="Pekerjaan berulang">
        <Kosong>Hanya Ketua Tim (pemberi delegasi) yang mengatur pekerjaan berulang.</Kosong>
      </Halaman>
    );
  }

  return (
    <Halaman
      judul="Pekerjaan berulang"
      sub="Delegasi dibuat otomatis pukul 06:00 WIB pada hari jadwalnya"
      kanan={!edit && kelompokBoleh.length > 0 ? <button type="button" className={KELAS.tombolUtama} onClick={baru}>Tambah pekerjaan berulang</button> : undefined}
    >
      {kelompokBoleh.length === 0 && <Peringatan>Pekerjaan berulang dibuat untuk Pekerjaan tim. Hanya Ketua Tim yang dapat membuatnya.</Peringatan>}

      {edit && (
        <Kartu judul={edit.id === null ? "Pekerjaan berulang baru" : "Ubah pekerjaan berulang"}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Medan label="Judul" bantu="Tanggal periode otomatis ditambahkan pada judul delegasi."><input className={KELAS.isian} maxLength={150} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} placeholder="Rekap mingguan dokumen masuk" /></Medan>
              <Medan label="Pekerjaan tim">
                <select className={KELAS.isian} value={f.kelompok} onChange={(e) => { setF({ ...f, kelompok: e.target.value }); setPilih([]); }}>
                  <option value="">Pilih kelompok</option>
                  {daftarKelompok.map((k) => <option key={k.kode} value={k.kode}>{k.nama}</option>)}
                  {f.kelompok && !daftarKelompok.some((k) => k.kode === f.kelompok) && <option value={f.kelompok}>{f.kelompok}</option>}
                </select>
              </Medan>
              <Medan label="Jenis pekerjaan">
                <select className={KELAS.isian} value={f.jenisId} onChange={(e) => setF({ ...f, jenisId: e.target.value })}>
                  <option value="">Pilih jenis</option>
                  {jenis.map((j) => <option key={j.id} value={j.id}>{j.nama} · {fmt(angka(j.poin_per_satuan), 1)} poin/{j.satuan}</option>)}
                  {f.jenisId && !jenis.some((j) => String(j.id) === f.jenisId) && <option value={f.jenisId}>{namaJenis(Number(f.jenisId))?.nama ?? `Jenis ${f.jenisId}`} (nonaktif)</option>}
                </select>
              </Medan>
              <Medan label={`Jumlah per periode${jn ? ` (${jn.satuan})` : ""}`}><input className={KELAS.isian} inputMode="decimal" value={f.jumlah} onChange={(e) => setF({ ...f, jumlah: e.target.value })} placeholder="3" /></Medan>
            </div>
            <Medan label="Petunjuk (opsional)"><textarea className={KELAS.isian} rows={2} maxLength={1000} value={uraian} onChange={(e) => setUraian(e.target.value)} /></Medan>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Medan label="Pengulangan">
                <select className={KELAS.isian} value={f.frekuensi} onChange={(e) => setF({ ...f, frekuensi: e.target.value as "mingguan" | "bulanan", hari: "1" })}>
                  <option value="mingguan">Mingguan</option>
                  <option value="bulanan">Bulanan</option>
                </select>
              </Medan>
              <Medan label={f.frekuensi === "mingguan" ? "Hari" : "Tanggal"}>
                {f.frekuensi === "mingguan" ? (
                  <select className={KELAS.isian} value={f.hari} onChange={(e) => setF({ ...f, hari: e.target.value })}>
                    {HARI.map((h) => <option key={h.n} value={h.n}>{NAMA_HARI_PANJANG[h.n]}</option>)}
                  </select>
                ) : (
                  <select className={KELAS.isian} value={f.hari} onChange={(e) => setF({ ...f, hari: e.target.value })}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </Medan>
              <Medan label="Durasi (hari)" bantu="Tenggat = hari jadwal + durasi - 1."><input className={KELAS.isian} inputMode="numeric" value={f.durasi} onChange={(e) => setF({ ...f, durasi: e.target.value })} /></Medan>
              <Medan label="Bobot (1-5)"><select className={KELAS.isian} value={f.bobot} onChange={(e) => setF({ ...f, bobot: e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></Medan>
              <Medan label="Mulai berlaku"><input type="date" className={KELAS.isian} value={f.mulai} onChange={(e) => setF({ ...f, mulai: e.target.value })} /></Medan>
              <Medan label="Berakhir (opsional)"><input type="date" className={KELAS.isian} min={f.mulai} value={f.berakhir} onChange={(e) => setF({ ...f, berakhir: e.target.value })} /></Medan>
            </div>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1 text-[13px] font-semibold">Hari kerja</legend>
              <div className="flex flex-wrap gap-2">
                {HARI.map((h) => (
                  <label key={h.n} className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13.5px] ${f.hk.includes(h.n) ? "border-[#0F6B63] bg-[#E3F0EE] font-semibold" : "border-[#BCC6CE] bg-white"}`}>
                    <input type="checkbox" className="accent-[#0F6B63]" checked={f.hk.includes(h.n)} onChange={() => setF({ ...f, hk: f.hk.includes(h.n) ? f.hk.filter((y) => y !== h.n) : [...f.hk, h.n].sort() })} />
                    {h.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {hitung && (
              <Info>
                Tiap periode, setiap penerima mendapat {fmt(jml, 2)} {jn?.satuan} = <b>{fmt(hitung.total, 1)} poin</b> (sekitar {teksDurasi(hitung.total)}), kira-kira {fmt(hitung.harian, 1)} poin per hari kerja.
                {jn && (jn.perlu_hasil ? " Penerima menyerahkan hasil kerja" : " Dicatat lewat laporan harian") }{jn?.perlu_tinjau ? " dan Anda yang meninjau." : "."}
              </Info>
            )}

            <div>
              <div className="mb-2 text-[13px] font-semibold">Penerima{pilih.length ? ` (${pilih.length})` : ""}</div>
              <PemilihPenerima ro={f.kelompok} ident={null} pilih={pilih} setPilih={setPilih} tampilPj={false} />
            </div>

            {galat.length > 0 && <Peringatan><ul className="m-0 list-disc pl-5">{galat.map((g) => <li key={g}>{g}</li>)}</ul></Peringatan>}
            {kirim.galat && <Galat>{kirim.galat}</Galat>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || galat.length > 0} onClick={() => void simpan()}>{kirim.mengirim ? "Menyimpan..." : "Simpan"}</button>
              <button type="button" className={KELAS.tombolSekunder} disabled={kirim.mengirim} onClick={() => setEdit(null)}>Batal</button>
            </div>
          </div>
        </Kartu>
      )}

      {bahan.memuat && !bahan.data && <Memuat />}
      {bahan.galat && !bahan.data && <Galat>{bahan.galat}</Galat>}
      {bahan.data && daftar.length === 0 && !edit && <Kosong>Belum ada pekerjaan berulang. Tambahkan untuk pekerjaan yang datang rutin, mis. rekap mingguan atau laporan bulanan.</Kosong>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {daftar.map((r) => {
          const j = namaJenis(r.jenis_id);
          const lanjut = rutinBerikutnya(r, hari);
          return (
            <div key={r.id} className={`${KELAS.kartu} space-y-2 ${r.aktif ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{r.judul}</div>
                  <div className="mt-0.5 text-[13px] text-[#3B4A57]">{teksJadwalRutin(r)} · durasi {r.durasi_hari} hari</div>
                </div>
                <Lencana nada={r.aktif ? "hijau" : "abu"}>{r.aktif ? "Aktif" : "Nonaktif"}</Lencana>
              </div>
              <div className="text-[13px] text-[#33404B]">
                {fmt(angka(r.jumlah), 2)} {j?.satuan ?? "satuan"} {j ? `· ${j.nama}` : ""} · {r.penerima.map((p) => p.nama ?? `Akun ${p.akun}`).join(", ")}
              </div>
              <div className="text-[12.5px] text-[#3B4A57]">
                {r.aktif ? (lanjut ? `Berikutnya: ${tglPendek(lanjut)}` : "Tidak ada jadwal berikutnya (sudah berakhir)") : "Tidak berjalan"}
                {r.terakhir_jalan ? ` · terakhir ${tglPendek(r.terakhir_jalan)}` : ""}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className={KELAS.tombolKecil} disabled={!!edit || kirim.mengirim} onClick={() => ubah(r)}>Ubah</button>
                <button type="button" className={KELAS.tombolKecil} disabled={kirim.mengirim} onClick={() => alihAktif(r)}>{r.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
              </div>
            </div>
          );
        })}
      </div>
      {!edit && kirim.galat && <Galat>{kirim.galat}</Galat>}
    </Halaman>
  );
}

function tambahDurasi(t: string, n: number): string {
  const d = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10))) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}
