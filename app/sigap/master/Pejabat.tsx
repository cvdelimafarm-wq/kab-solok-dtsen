"use client";

// app/sigap/master/Pejabat.tsx
//
// (14 Nov 2026) Master > Pejabat penandatangan: SATU SUMBER nama pejabat yang dicetak di dokumen (Kepala/KPA, PPK, Bendahara
// Pengeluaran, Pejabat Pengadaan). Basis data: keu_pejabat (SQL 20261114s), berlaku per tanggal, tanpa hapus. Hak ubah = kewenangan
// "master" (Admin Aplikasi dan PPK), ditegakkan basis data. Logika murni: lib/pejabat.ts.

import { useMemo, useState } from "react";
import KepalaKolom from "../admin/KepalaKolom";
import { nilaiBeda, terapkanTabel, type NilaiSel, type Saring, type Urut } from "@/lib/sigapTabelKolom";
import { NAMA_JABATAN, nipBerspasi, periksaIsianPejabat, tanggalIndo, URUTAN_JABATAN, type KodeJabatan } from "@/lib/pejabat";
import { Catatan, Chip, Galat, judulKartu, kartu, kolom, label, Memuat, tombolKecil, tombolUtama } from "../keu-ui";
import { useBacaFungsi } from "../delego/data";
import { aksiKeu, useKirim } from "../ro/useKeu";

type BarisPejabat = {
  id: number; jabatan_kode: KodeJabatan; akun_id: number | null; akun_nama: string | null; nama: string; nip: string; jabatan_teks: string;
  sk_nomor: string; sk_tanggal: string | null; berlaku_mulai: string; berlaku_sampai: string | null; aktif_hari_ini: boolean; ket: string;
};
type Bahan = { boleh: boolean; hari_ini: string; pejabat: BarisPejabat[]; organik: { akun_id: number; nama: string }[] };

const JABATAN_BAWAAN: Record<KodeJabatan, string> = {
  KPA: "Kepala BPS Kabupaten Solok", PPK: "Pejabat Pembuat Komitmen", BEND: "Bendahara Pengeluaran", PP: "Pejabat Pengadaan",
};

type Form = { mode: "ganti" | "perbaiki"; jabatan: KodeJabatan; id: number | null; akun: string; nama: string; nip: string; jabatanTeks: string; skNomor: string; skTanggal: string; mulai: string };

export function BagianPejabat() {
  const bahan = useBacaFungsi<Bahan>("keu_pejabat_bahan", {}, { simpan: false });
  const { jalankan, mengirim, galat } = useKirim(bahan.muat);
  const [form, setForm] = useState<Form | null>(null);
  const [batal, setBatal] = useState<{ id: number; alasan: string } | null>(null);

  if (bahan.memuat && !bahan.data) return <Memuat tinggi="h-48" />;
  if (!bahan.data) return <Galat pesan={bahan.galat ?? "Data pejabat belum tersedia."} />;
  const d = bahan.data;
  const berlaku = new Map<KodeJabatan, BarisPejabat>();
  for (const p of d.pejabat) if (p.aktif_hari_ini) berlaku.set(p.jabatan_kode, p);
  const terakhir = new Map<KodeJabatan, number>();
  for (const p of d.pejabat) if (!terakhir.has(p.jabatan_kode)) terakhir.set(p.jabatan_kode, p.id); // urut: jabatan, mulai terbaru

  const bukaGanti = (j: KodeJabatan) =>
    setForm({ mode: "ganti", jabatan: j, id: null, akun: "", nama: "", nip: "", jabatanTeks: JABATAN_BAWAAN[j], skNomor: "", skTanggal: "", mulai: d.hari_ini });
  const bukaPerbaiki = (p: BarisPejabat) =>
    setForm({ mode: "perbaiki", jabatan: p.jabatan_kode, id: p.id, akun: p.akun_id ? String(p.akun_id) : "", nama: p.nama, nip: p.nip, jabatanTeks: p.jabatan_teks, skNomor: p.sk_nomor, skTanggal: p.sk_tanggal ?? "", mulai: p.berlaku_mulai });

  const kirimForm = async (f: Form) => {
    const ok = await jalankan(() =>
      f.mode === "ganti"
        ? aksiKeu("keu_pejabat_tetapkan", { p_jabatan: f.jabatan, p_akun_pejabat: f.akun ? Number(f.akun) : null, p_nama: f.nama, p_nip: f.nip, p_jabatan_teks: f.jabatanTeks, p_sk_nomor: f.skNomor, p_sk_tanggal: f.skTanggal || null, p_mulai: f.mulai })
        : aksiKeu("keu_pejabat_perbaiki", { p_id: f.id, p_nama: f.nama, p_nip: f.nip, p_jabatan_teks: f.jabatanTeks, p_sk_nomor: f.skNomor, p_sk_tanggal: f.skTanggal || null }),
    );
    if (ok) setForm(null);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>Pejabat yang berlaku hari ini</h2>
          <Chip warna="biru">{d.boleh ? "Anda dapat mengubah" : "Hanya Admin Aplikasi dan PPK yang mengubah"}</Chip>
        </div>
        <p className="max-w-[100ch] text-[12.5px] text-[#5B6B84]">
          Satu sumber untuk nama yang dicetak: kwitansi dan visum (Translok dan SIGAP), kontrak pengadaan, SPK dan dokumen identifikasi
          (Kepala dan PPK), serta undangan pelatihan. Dokumen membaca pejabat yang berlaku pada <b>tanggal dokumennya</b>. Dokumen yang sudah
          terbit tidak ikut berubah.
        </p>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
          {URUTAN_JABATAN.map((j) => {
            const p = berlaku.get(j);
            return (
              <div key={j} className="flex min-w-0 flex-col gap-1 rounded-lg border border-[#DCE3EE] p-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]">{NAMA_JABATAN[j]}</span>
                {p ? (
                  <>
                    <span className="break-words text-[14px] font-bold text-[#0F2A52]">{p.nama}</span>
                    <span className="font-mono text-[12px] text-[#44546F]">{p.nip ? `NIP ${nipBerspasi(p.nip)}` : "NIP belum diisi"}</span>
                    <span className="text-[12px] text-[#5B6B84]">{p.jabatan_teks}</span>
                    <span className="text-[12px] text-[#5B6B84]">Sejak {tanggalIndo(p.berlaku_mulai)}{p.sk_nomor ? ` · SK ${p.sk_nomor}${p.sk_tanggal ? `, ${tanggalIndo(p.sk_tanggal)}` : ""}` : " · SK belum diisi"}</span>
                  </>
                ) : (
                  <span className="text-[13px] font-semibold text-[#B42318]">Belum diatur. Dokumen yang memerlukannya tidak dapat dibuat.</span>
                )}
                {d.boleh && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p && <button type="button" className={tombolKecil} onClick={() => bukaPerbaiki(p)}>Perbaiki data</button>}
                    <button type="button" className={tombolKecil} onClick={() => bukaGanti(j)}>{p ? "Ganti pejabat" : "Tetapkan"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {form && <FormPejabat form={form} setForm={setForm} organik={d.organik} mengirim={mengirim} kirim={kirimForm} />}
        <Galat pesan={galat} />
        <Catatan>
          Halaman ini hanya mengatur nama yang dicetak. Kewenangan di aplikasi (siapa boleh mengesahkan RAB, menyetujui identifikasi, dan
          sebagainya) tetap diatur lewat penugasan peran.
        </Catatan>
      </section>

      <section className={`${kartu} flex flex-col gap-3`}>
        <h2 className={judulKartu}>Riwayat pejabat</h2>
        <TabelRiwayat
          baris={d.pejabat}
          bisaBatal={(p) => d.boleh && terakhir.get(p.jabatan_kode) === p.id && d.pejabat.filter((x) => x.jabatan_kode === p.jabatan_kode).length > 1}
          batal={(id) => setBatal({ id, alasan: "" })}
        />
        {batal && (
          <div className="flex flex-col gap-2 rounded-lg border border-[#F1C4C0] bg-[#FFF6F5] p-3">
            <label className={label} htmlFor="pj-alasan">Alasan membatalkan penetapan ini (minimal 10 huruf). Pejabat sebelumnya berlaku kembali.</label>
            <input id="pj-alasan" className={kolom} value={batal.alasan} onChange={(e) => setBatal({ ...batal, alasan: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={tombolUtama} disabled={mengirim || batal.alasan.trim().length < 10}
                onClick={async () => { if (await jalankan(() => aksiKeu("keu_pejabat_batal", { p_id: batal.id, p_alasan: batal.alasan }))) setBatal(null); }}>
                Batalkan penetapan
              </button>
              <button type="button" className={tombolKecil} onClick={() => setBatal(null)}>Tutup</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function FormPejabat({ form, setForm, organik, mengirim, kirim }: {
  form: Form; setForm: (f: Form | null) => void; organik: { akun_id: number; nama: string }[]; mengirim: boolean; kirim: (f: Form) => Promise<void>;
}) {
  const g = periksaIsianPejabat({ nama: form.nama, nip: form.nip, jabatan: form.jabatanTeks, mulai: form.mode === "ganti" ? form.mulai : undefined });
  const ubah = (x: Partial<Form>) => setForm({ ...form, ...x });
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-[#C5D0E2] bg-[#F7FAFF] p-3">
      <h3 className="text-[14px] font-bold text-[#0F2A52]">
        {form.mode === "ganti" ? `Tetapkan ${NAMA_JABATAN[form.jabatan]} baru` : `Perbaiki data ${NAMA_JABATAN[form.jabatan]}`}
      </h3>
      {form.mode === "ganti" && (
        <p className="text-[12px] text-[#5B6B84]">Pejabat sebelumnya otomatis berakhir sehari sebelum tanggal mulai. Dokumen bertanggal sebelumnya tetap memakai pejabat lama.</p>
      )}
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        {form.mode === "ganti" && (
          <div>
            <label className={label} htmlFor="pj-akun">Pegawai (akun SIGAP)</label>
            <select id="pj-akun" className={kolom} value={form.akun} onChange={(e) => {
              const a = organik.find((o) => String(o.akun_id) === e.target.value);
              ubah({ akun: e.target.value, nama: form.nama || (a?.nama ?? "") });
            }}>
              <option value="">Tanpa akun (pejabat dari luar)</option>
              {organik.map((o) => <option key={o.akun_id} value={o.akun_id}>{o.nama}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={label} htmlFor="pj-nama">Nama dengan gelar (seperti dicetak)</label>
          <input id="pj-nama" className={kolom} value={form.nama} onChange={(e) => ubah({ nama: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="pj-nip">NIP (18 angka)</label>
          <input id="pj-nip" inputMode="numeric" className={kolom} value={form.nip} onChange={(e) => ubah({ nip: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="pj-jab">Jabatan (seperti dicetak)</label>
          <input id="pj-jab" className={kolom} value={form.jabatanTeks} onChange={(e) => ubah({ jabatanTeks: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="pj-sk">Nomor SK</label>
          <input id="pj-sk" className={kolom} value={form.skNomor} onChange={(e) => ubah({ skNomor: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="pj-sktgl">Tanggal SK</label>
          <input id="pj-sktgl" type="date" className={kolom} value={form.skTanggal} onChange={(e) => ubah({ skTanggal: e.target.value })} />
        </div>
        {form.mode === "ganti" && (
          <div>
            <label className={label} htmlFor="pj-mulai">Mulai berlaku</label>
            <input id="pj-mulai" type="date" className={kolom} value={form.mulai} onChange={(e) => ubah({ mulai: e.target.value })} />
          </div>
        )}
      </div>
      {g.length > 0 && <Galat pesan={g} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tombolUtama} disabled={mengirim || g.length > 0} onClick={() => void kirim(form)}>
          {form.mode === "ganti" ? "Tetapkan pejabat" : "Simpan perbaikan"}
        </button>
        <button type="button" className={tombolKecil} onClick={() => setForm(null)}>Batal</button>
      </div>
    </div>
  );
}

type K = "jabatan" | "nama" | "nip" | "mulai" | "sampai" | "sk";
const KOLOM: { id: K; label: string }[] = [
  { id: "jabatan", label: "Jabatan" }, { id: "nama", label: "Nama" }, { id: "nip", label: "NIP" },
  { id: "mulai", label: "Mulai" }, { id: "sampai", label: "Sampai" }, { id: "sk", label: "SK" },
];
const nilai: NilaiSel<BarisPejabat, K> = (b, k) =>
  k === "jabatan" ? NAMA_JABATAN[b.jabatan_kode] : k === "nama" ? b.nama : k === "nip" ? b.nip : k === "mulai" ? b.berlaku_mulai : k === "sampai" ? (b.berlaku_sampai ?? "masih berlaku") : b.sk_nomor || "-";

function TabelRiwayat({ baris, bisaBatal, batal }: { baris: BarisPejabat[]; bisaBatal: (p: BarisPejabat) => boolean; batal: (id: number) => void }) {
  const [saring, setSaring] = useState<Saring<K>>({});
  const [urut, setUrut] = useState<Urut<K>>(null);
  const tampil = useMemo(() => terapkanTabel(baris, saring, urut, nilai), [baris, saring, urut]);
  return (
    <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
      <table className="w-full min-w-[640px] text-left text-[12.5px]">
        <thead className="bg-[#EEF3FB] text-[#44546F]">
          <tr>
            {KOLOM.map((k) => (
              <th key={k.id} className="px-2.5 py-2 font-semibold">
                <KepalaKolom id={k.id} label={k.label} saring={saring} setSaring={setSaring} urut={urut} setUrut={setUrut} opsi={() => nilaiBeda(baris, k.id, nilai, false)} />
              </th>
            ))}
            <th className="px-2.5 py-2" aria-label="Tindakan" />
          </tr>
        </thead>
        <tbody>
          {tampil.map((p) => (
            <tr key={p.id} className="border-t border-[#EEF2F7]">
              <td className="px-2.5 py-2">{NAMA_JABATAN[p.jabatan_kode]}</td>
              <td className="px-2.5 py-2 font-semibold text-[#0F2A52]">{p.nama}</td>
              <td className="px-2.5 py-2 font-mono">{p.nip ? nipBerspasi(p.nip) : "-"}</td>
              <td className="px-2.5 py-2">{tanggalIndo(p.berlaku_mulai)}</td>
              <td className="px-2.5 py-2">{p.berlaku_sampai ? tanggalIndo(p.berlaku_sampai) : <Chip warna="hijau">masih berlaku</Chip>}</td>
              <td className="px-2.5 py-2">{p.sk_nomor ? `${p.sk_nomor}${p.sk_tanggal ? `, ${tanggalIndo(p.sk_tanggal)}` : ""}` : "-"}</td>
              <td className="px-2.5 py-2 text-right">{bisaBatal(p) && <button type="button" className={tombolKecil} onClick={() => batal(p.id)}>Batalkan</button>}</td>
            </tr>
          ))}
          {tampil.length === 0 && (
            <tr><td colSpan={7} className="px-2.5 py-2 text-center text-[#5B6B84]">Tidak ada baris yang cocok dengan saringan.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
