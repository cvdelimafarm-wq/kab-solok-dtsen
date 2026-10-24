"use client";

// app/sigap/revisi/page.tsx
//
// (24 Okt 2026) Jadwal dan pengesahan revisi (PPK): jendela usulan, tutup, terapkan, nyatakan sah (nomor + tanggal dokumen dasar), lewati/pulihkan;
// usulan RO yang menunggu pengesahan; tambahan pagu resmi (DJA/DJPb). Semua orang organik boleh melihat; tombol hanya untuk akun berwenang
// (kewenangan `jadwal` dan `sahkan`), dan yang memutuskan tetap basis data. Logika murni: lib/keu/revisi.ts.

import { useMemo, useState } from "react";
import TombolKembali from "@/app/components/TombolKembali";
import {
  aksiJadwalTersedia, argsJadwalAksi, argsTambahan, LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, LABEL_STATUS_USULAN, periksaSah, periksaTambahan,
  tambahanKosong, WARNA_STATUS_JADWAL, type AksiJadwal, type IsianTambahan,
} from "@/lib/keu/revisi";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import { useBacaKeu, useBoleh, useKirim } from "../ro/useKeu";

const kartu = "rounded-[20px] bg-white p-4 shadow-[0_4px_16px_rgba(15,42,82,0.08)]";
const kolom = "box-border min-h-[44px] w-full rounded-[12px] border-[1.5px] border-[#C5D0E2] bg-[#F8FBFF] px-3 text-[14px] font-semibold text-[#0F2A52]";
const label = "mb-1 block text-[12px] font-bold text-[#44546F]";
const tombol = "min-h-[44px] rounded-[12px] px-4 text-[13.5px] font-extrabold disabled:opacity-50";
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

type Jadwal = { jadwal_id: number; tahun: number; jenis: string; judul: string; buka: string; tutup: string; status: string; n_usulan: number | string; n_disetujui: number | string; n_proses: number | string; n_draf: number | string };
type Sah = { jadwal_id: number; versi_sistem: number | string; nomor_dokumen: string; tanggal_dokumen: string };
type Usulan = { id: number; ro_kode: string; status: string; catatan: string };
type Tambahan = { id: number; ro_kode: string; jumlah: number | string; jalur: string; nomor_dokumen: string; tanggal_dokumen: string; status: string; dipenuhi_total: number | string | null; sisa_penggenap: number | string | null; alasan_batal: string | null };

const tgl = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};
const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const Galat = ({ pesan }: { pesan: string | string[] | null }) => {
  const l = pesan === null ? [] : Array.isArray(pesan) ? pesan : [pesan];
  return l.length ? <ul role="alert" className="space-y-1 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{l.map((x) => <li key={x}>{x}</li>)}</ul> : null;
};

function DaftarUsulan({ jadwalId, bolehSahkan, sesudah }: { jadwalId: number; bolehSahkan: boolean; sesudah: () => Promise<void> }) {
  const u = useBacaKeu<Usulan>(urlBaca("keu_revisi_usulan", { jadwal_id: jadwalId }, { urut: "ro_kode", batas: 500, kolom: ["id", "ro_kode", "status", "catatan"] }));
  const { kirim, mengirim, galat, hapusGalat } = useKirim(async () => { await u.muat(); await sesudah(); });
  const [kembali, setKembali] = useState<{ id: number; catatan: string } | null>(null);
  if (u.galat) return <Galat pesan={u.galat} />;
  if (!u.baris) return <div className="h-12 animate-pulse rounded-[12px] bg-[#EEF2F7]" aria-busy="true" />;
  if (u.baris.length === 0) return <p className="text-[13px] text-[#5B6B84]">Belum ada usulan RO pada jadwal ini.</p>;
  return (
    <div className="space-y-2">
      <Galat pesan={galat} />
      <ul className="space-y-1.5">
        {u.baris.map((x) => (
          <li key={x.id} className="rounded-[12px] bg-[#F5F8FE] px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <a href={`/sigap/ro/${encodeURIComponent(x.ro_kode)}?tab=rab`} className="font-extrabold text-[#1F5FD1]">{x.ro_kode}</a>
              <span className="font-bold text-[#44546F]">{LABEL_STATUS_USULAN[x.status] ?? x.status}</span>
            </div>
            {x.status === "dikembalikan" && x.catatan && <p className="mt-1 text-[12.5px] text-[#5B6B84]">Catatan: {x.catatan}</p>}
            {bolehSahkan && x.status === "menunggu_ppk" && (
              kembali?.id === x.id ? (
                <div className="mt-2 space-y-2">
                  <label className={label} htmlFor={`kb-${x.id}`}>Alasan mengembalikan (minimal 5 huruf)</label>
                  <textarea id={`kb-${x.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={kembali.catatan} onChange={(e) => setKembali({ id: x.id, catatan: e.target.value })} />
                  <div className="flex gap-2">
                    <button type="button" disabled={mengirim || kembali.catatan.trim().length < 5} className={`${tombol} bg-[#B42329] text-white`} onClick={async () => { if (await kirim("keu_usulan_aksi", { p_usulan: x.id, p_aksi: "kembalikan", p_catatan: kembali.catatan.trim() })) setKembali(null); }}>Kembalikan</button>
                    <button type="button" className={`${tombol} bg-[#EEF2F7] text-[#44546F]`} onClick={() => setKembali(null)}>Batal</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={mengirim} className={`${tombol} bg-[#1F5FD1] text-white`} onClick={() => void kirim("keu_usulan_aksi", { p_usulan: x.id, p_aksi: "sahkan" })}>Sahkan usulan</button>
                  <button type="button" disabled={mengirim} className={`${tombol} border-[1.5px] border-[#C5D0E2] bg-white text-[#7A1D22]`} onClick={() => { hapusGalat(); setKembali({ id: x.id, catatan: "" }); }}>Kembalikan</button>
                </div>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KartuJadwal({ j, sah, bolehJadwal, bolehSahkan, sesudah }: { j: Jadwal; sah: Sah | undefined; bolehJadwal: boolean; bolehSahkan: boolean; sesudah: () => Promise<void> }) {
  const { kirim, mengirim, galat, hapusGalat } = useKirim(sesudah);
  const [buka, setBuka] = useState(false);
  const [dok, setDok] = useState<{ nomor: string; tanggal: string } | null>(null);
  const [salah, setSalah] = useState<string[]>([]);
  const aksi = bolehJadwal ? aksiJadwalTersedia(j.status, j.tutup, hariIni()) : [];

  const jalankan = async (a: AksiJadwal) => {
    hapusGalat(); setSalah([]);
    if (a === "sah") { setDok(dok ?? { nomor: "", tanggal: "" }); return; }
    await kirim("keu_jadwal_aksi", argsJadwalAksi(j.jadwal_id, a));
  };
  const kirimSah = async () => {
    if (!dok) return;
    const g = periksaSah(dok.nomor, dok.tanggal);
    setSalah(g);
    if (g.length) return;
    if (await kirim("keu_jadwal_aksi", argsJadwalAksi(j.jadwal_id, "sah", dok))) setDok(null);
  };

  return (
    <article className={kartu}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[14.5px] font-extrabold text-[#0F2A52]">{j.judul}</p>
          <p className="text-[12px] text-[#6B7A93]">{LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis} · buka {tgl(j.buka)} · tutup {tgl(j.tutup)}</p>
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${WARNA_STATUS_JADWAL[j.status] ?? "bg-[#EEF2F7] text-[#44546F]"}`}>{LABEL_STATUS_JADWAL[j.status] ?? j.status}</span>
      </div>
      <p className="mt-2 text-[12.5px] text-[#44546F]">
        {angka(j.n_usulan)} usulan · {angka(j.n_disetujui)} disetujui · {angka(j.n_proses)} diproses · {angka(j.n_draf)} draf
      </p>
      {sah && <p className="mt-1.5 rounded-[10px] bg-[#D9F0E3] px-3 py-1.5 text-[12.5px] font-bold text-[#0F5A32]">Sah versi {sah.versi_sistem}: {sah.nomor_dokumen} ({tgl(sah.tanggal_dokumen)})</p>}

      {aksi.length > 0 && !dok && (
        <div className="mt-3 flex flex-wrap gap-2">
          {aksi.map((a) => (
            <button key={a.aksi} type="button" disabled={mengirim} onClick={() => void jalankan(a.aksi)} className={`${tombol} ${a.berbahaya ? "border-[1.5px] border-[#C5D0E2] bg-white text-[#7A1D22]" : "bg-[#1F5FD1] text-white"}`}>{a.label}</button>
          ))}
        </div>
      )}
      {dok && (
        <div className="mt-3 space-y-2 rounded-[14px] bg-[#F5F8FE] p-3">
          <p className="text-[12.5px] text-[#44546F]">Sah dicatat dari dokumen resmi (DIPA/POK hasil revisi). Isi nomor dan tanggalnya.</p>
          <div><label className={label} htmlFor={`dn-${j.jadwal_id}`}>Nomor dokumen dasar</label><input id={`dn-${j.jadwal_id}`} className={kolom} maxLength={120} value={dok.nomor} onChange={(e) => setDok({ ...dok, nomor: e.target.value })} /></div>
          <div><label className={label} htmlFor={`dt-${j.jadwal_id}`}>Tanggal dokumen</label><input id={`dt-${j.jadwal_id}`} type="date" className={kolom} value={dok.tanggal} onChange={(e) => setDok({ ...dok, tanggal: e.target.value })} /></div>
          <Galat pesan={salah} />
          <div className="flex gap-2">
            <button type="button" disabled={mengirim} onClick={() => void kirimSah()} className={`${tombol} flex-1 bg-[#14653A] text-white`}>{mengirim ? "Menyimpan..." : "Nyatakan sah"}</button>
            <button type="button" className={`${tombol} bg-[#EEF2F7] text-[#44546F]`} onClick={() => { setDok(null); setSalah([]); }}>Batal</button>
          </div>
        </div>
      )}
      <div className="mt-2"><Galat pesan={galat} /></div>

      <button type="button" onClick={() => setBuka((x) => !x)} aria-expanded={buka} className="mt-3 min-h-[44px] text-[13px] font-extrabold text-[#1F5FD1]">{buka ? "Sembunyikan usulan" : "Lihat usulan RO"}</button>
      {buka && <DaftarUsulan jadwalId={j.jadwal_id} bolehSahkan={bolehSahkan} sesudah={sesudah} />}
    </article>
  );
}

function FormTambahan({ jadwal, tutup, sesudah }: { jadwal: Jadwal[]; tutup: () => void; sesudah: () => Promise<void> }) {
  const [v, setV] = useState<IsianTambahan>(tambahanKosong());
  const [salah, setSalah] = useState<string[]>([]);
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const dipa = jadwal.filter((j) => j.jenis === "dipa_dja" || j.jenis === "dipa_djpb").map((j) => ({ id: j.jadwal_id, jenis: j.jenis }));
  const cocok = jadwal.filter((j) => v.jalur && j.jenis === `dipa_${v.jalur}`);
  const simpan = async () => {
    const g = periksaTambahan(v, dipa);
    setSalah(g);
    if (g.length) return;
    if (await kirim("keu_tambahan_pagu_catat", argsTambahan(v))) tutup();
  };
  const u = (p: Partial<IsianTambahan>) => setV((x) => ({ ...x, ...p }));
  return (
    <section className={`${kartu} space-y-3`}>
      <h3 className="text-[14px] font-extrabold text-[#0F2A52]">Catat tambahan pagu resmi</h3>
      <div><label className={label} htmlFor="tp-ro">Kode RO</label><input id="tp-ro" className={kolom} placeholder="2906.BMA.005" maxLength={20} value={v.ro} onChange={(e) => u({ ro: e.target.value.toUpperCase() })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label} htmlFor="tp-jml">Jumlah (Rp)</label><input id="tp-jml" className={kolom} inputMode="numeric" value={v.jumlah} onChange={(e) => u({ jumlah: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} /></div>
        <div><label className={label} htmlFor="tp-jalur">Jalur</label>
          <select id="tp-jalur" className={kolom} value={v.jalur} onChange={(e) => u({ jalur: e.target.value as IsianTambahan["jalur"], jadwal: "" })}><option value="">Pilih</option><option value="dja">DJA</option><option value="djpb">DJPb</option></select></div>
      </div>
      <div><label className={label} htmlFor="tp-no">Nomor dokumen revisi</label><input id="tp-no" className={kolom} maxLength={120} value={v.nomor} onChange={(e) => u({ nomor: e.target.value })} /></div>
      <div><label className={label} htmlFor="tp-tg">Tanggal dokumen</label><input id="tp-tg" type="date" className={kolom} value={v.tanggal} onChange={(e) => u({ tanggal: e.target.value })} /></div>
      {cocok.length > 0 && (
        <div><label className={label} htmlFor="tp-jd">Jadwal revisi (opsional)</label>
          <select id="tp-jd" className={kolom} value={v.jadwal} onChange={(e) => u({ jadwal: e.target.value })}><option value="">Tanpa jadwal</option>{cocok.map((j) => <option key={j.jadwal_id} value={j.jadwal_id}>{j.judul}</option>)}</select></div>
      )}
      <div><label className={label} htmlFor="tp-cat">Catatan (opsional)</label><input id="tp-cat" className={kolom} maxLength={300} value={v.catatan} onChange={(e) => u({ catatan: e.target.value })} /></div>
      <Galat pesan={[...salah, ...(galat ? [galat] : [])]} />
      <div className="flex gap-2">
        <button type="button" disabled={mengirim} onClick={() => void simpan()} className={`${tombol} flex-1 bg-[#1F5FD1] text-white`}>{mengirim ? "Menyimpan..." : "Simpan"}</button>
        <button type="button" disabled={mengirim} onClick={tutup} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batal</button>
      </div>
    </section>
  );
}

export default function HalamanRevisi() {
  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_v_revisi_ringkas", {}, { urut: "-buka", batas: 200 }));
  const sah = useBacaKeu<Sah>(urlBaca("keu_revisi_sah", {}, { batas: 200, kolom: ["jadwal_id", "versi_sistem", "nomor_dokumen", "tanggal_dokumen"] }));
  const tambahan = useBacaKeu<Tambahan>(urlBaca("keu_v_tambahan_pagu", {}, { urut: "-id", batas: 200, kolom: ["id", "ro_kode", "jumlah", "jalur", "nomor_dokumen", "tanggal_dokumen", "status", "dipenuhi_total", "sisa_penggenap", "alasan_batal"] }));
  const bolehJadwal = useBoleh("jadwal", null) === true;
  const bolehSahkan = useBoleh("sahkan", null) === true;
  const muatSemua = async () => { await Promise.all([jadwal.muat(), sah.muat(), tambahan.muat()]); };
  const { kirim, mengirim, galat: galatKirim } = useKirim(muatSemua);

  const [formTambahan, setFormTambahan] = useState(false);
  const [batal, setBatal] = useState<{ id: number; alasan: string } | null>(null);
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));
  const [dari, setDari] = useState("1");
  const sahPer = useMemo(() => new Map((sah.baris ?? []).map((s) => [s.jadwal_id, s])), [sah.baris]);

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-16 pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <TombolKembali tema="gelap" className="max-w-[40%] flex-none" />
          <span className="truncate text-[12.5px] font-bold text-[#D3E0F5]">Kertas Kerja Revisi POK</span>
        </div>
        <h1 className="relative mx-auto mt-3 max-w-xl text-[20px] font-extrabold leading-tight tracking-[-0.3px]">Jadwal dan Pengesahan Revisi</h1>
        <p className="relative mx-auto mt-1.5 max-w-xl text-[12.5px] text-[#A9BCD8]">PPK membuka, menutup, dan menyatakan sah revisi. Semua pegawai dapat melihat.</p>
      </header>

      <div className="relative z-10 mx-auto -mt-10 max-w-xl space-y-3 px-3.5">
        {bolehJadwal && (
          <section className={`${kartu} space-y-2`} aria-labelledby="jud-bln">
            <h2 id="jud-bln" className="text-[14px] font-extrabold text-[#0F2A52]">Buat jadwal Revisi POK bulanan</h2>
            <p className="text-[12.5px] text-[#5B6B84]">Membuat jendela usulan tiap bulan: buka tanggal 10, tutup dua hari kemudian. Jadwal yang sudah ada tidak ditimpa.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label} htmlFor="bln-th">Tahun</label><input id="bln-th" inputMode="numeric" maxLength={4} className={kolom} value={tahun} onChange={(e) => setTahun(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
              <div><label className={label} htmlFor="bln-dr">Mulai bulan</label><select id="bln-dr" className={kolom} value={dari} onChange={(e) => setDari(e.target.value)}>{NAMA_BULAN.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></div>
            </div>
            <button type="button" disabled={mengirim || tahun.length !== 4} className={`${tombol} bg-[#1F5FD1] text-white`} onClick={() => void kirim("keu_jadwal_bulanan", { p_tahun: Number(tahun), p_dari: Number(dari), p_hari: 10 })}>Buat jadwal</button>
          </section>
        )}
        {galatKirim && <Galat pesan={galatKirim} />}

        <section aria-labelledby="jud-jadwal" className="space-y-2.5">
          <h2 id="jud-jadwal" className="px-1 text-[14px] font-extrabold text-[#0F2A52]">Jadwal revisi</h2>
          {jadwal.galat && <Galat pesan={jadwal.galat} />}
          {jadwal.memuat && <div className="h-24 animate-pulse rounded-[20px] bg-white" aria-busy="true" />}
          {jadwal.baris && jadwal.baris.length === 0 && <p className={`${kartu} text-[13px] text-[#5B6B84]`}>Belum ada jadwal revisi.{bolehJadwal ? " Buat jadwal bulanan di atas." : ""}</p>}
          {(jadwal.baris ?? []).map((j) => (
            <KartuJadwal key={j.jadwal_id} j={j} sah={sahPer.get(j.jadwal_id)} bolehJadwal={bolehJadwal} bolehSahkan={bolehSahkan} sesudah={muatSemua} />
          ))}
        </section>

        <section aria-labelledby="jud-tp" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 id="jud-tp" className="text-[14px] font-extrabold text-[#0F2A52]">Tambahan pagu resmi</h2>
            {bolehSahkan && !formTambahan && <button type="button" onClick={() => setFormTambahan(true)} className={`${tombol} bg-[#1F5FD1] text-white`}>Catat tambahan</button>}
          </div>
          {formTambahan && <FormTambahan jadwal={jadwal.baris ?? []} tutup={() => setFormTambahan(false)} sesudah={muatSemua} />}
          {tambahan.galat && <Galat pesan={tambahan.galat} />}
          {tambahan.baris && tambahan.baris.length === 0 && <p className={`${kartu} text-[13px] text-[#5B6B84]`}>Belum ada tambahan pagu yang dicatat.</p>}
          {(tambahan.baris ?? []).map((t) => (
            <article key={t.id} className={`${kartu} ${t.status === "dibatalkan" ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <a href={`/sigap/ro/${encodeURIComponent(t.ro_kode)}?tab=kekurangan`} className="text-[12px] font-extrabold tracking-wide text-[#1F5FD1]">{t.ro_kode}</a>
                  <p className="text-[14.5px] font-extrabold text-[#0F2A52]">{rupiah(t.jumlah)}</p>
                  <p className="break-words text-[12px] text-[#6B7A93]">{t.jalur.toUpperCase()} · {t.nomor_dokumen} · {tgl(t.tanggal_dokumen)}</p>
                </div>
                <span className="flex-none rounded-full bg-[#EEF2F7] px-2.5 py-1 text-[11.5px] font-extrabold text-[#44546F]">{t.status === "terbuka" ? "Menunggu keputusan" : t.status === "diputus" ? "Diputuskan" : "Dibatalkan"}</span>
              </div>
              {t.status === "diputus" && <p className="mt-1.5 text-[12.5px] text-[#44546F]">Dipenuhi {rupiah(t.dipenuhi_total)} · sisa penggenap {rupiah(t.sisa_penggenap)}</p>}
              {t.status === "dibatalkan" && t.alasan_batal && <p className="mt-1.5 text-[12.5px] text-[#5B6B84]">Alasan batal: {t.alasan_batal}</p>}
              {bolehSahkan && t.status === "terbuka" && (
                batal?.id === t.id ? (
                  <div className="mt-3 space-y-2">
                    <label className={label} htmlFor={`bt-${t.id}`}>Alasan membatalkan (minimal 5 huruf)</label>
                    <textarea id={`bt-${t.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={batal.alasan} onChange={(e) => setBatal({ id: t.id, alasan: e.target.value })} />
                    <div className="flex gap-2">
                      <button type="button" disabled={mengirim || batal.alasan.trim().length < 5} className={`${tombol} bg-[#B42329] text-white`} onClick={async () => { if (await kirim("keu_tambahan_pagu_batal", { p_id: t.id, p_alasan: batal.alasan.trim() })) setBatal(null); }}>Batalkan catatan</button>
                      <button type="button" className={`${tombol} bg-[#EEF2F7] text-[#44546F]`} onClick={() => setBatal(null)}>Kembali</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={`${tombol} mt-3 border-[1.5px] border-[#C5D0E2] bg-white text-[#7A1D22]`} onClick={() => setBatal({ id: t.id, alasan: "" })}>Batalkan (salah catat)</button>
                )
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
