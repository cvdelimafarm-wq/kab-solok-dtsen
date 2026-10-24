"use client";

// app/sigap/ro/[kode]/Kertas.tsx
//
// (24 Okt 2026) Tab "Kertas kerja" (papan 1 mockup): matriks Semula/Menjadi satu RO untuk satu jadwal revisi yang dibuka. Mengubah volume/harga,
// mengosongkan item, memasangkan (ganti akun/redaksi), menambah item baru, Dana penggenap, buku geseran, pemeriksaan R-xx, kecukupan KRO terhadap
// RAB, dan keputusan PPK per KRO. Semua aturan ditegakkan basis data (berkas SQL f); pesan penolakannya ditampilkan apa adanya.
// Logika murni: lib/keu/kk.ts. Menulis baris: keu_tulis (keu_kk_baris/keu_kk_geseran) atau fungsi keu_kk_* lewat gerbang.

import { useCallback, useEffect, useMemo, useState } from "react";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, type WarnaChip } from "@/lib/keu/revisi";
import {
  adaMerah, argsBaruTulis, argsKeputusan, argsPenggenap, bacaAngka, bolehHapus, bolehPasangkan, isianBaruKosong, kurangKro, LABEL_KEPUTUSAN, LABEL_PEMICU, LABEL_TINGKAT, n,
  periksaGeseran, periksaIsianBaru, periksaKeputusan, periksaPasangan, periksaPenggenap, sisaTerhadapPagu, susunKertas, totalKertas, uraianTerkunci, urutkanPeriksa,
  WARNA_KECUKUPAN, WARNA_TINGKAT, type BarisKk, type BarisPeriksa, type Geseran, type Kecukupan, type KeputusanKro,
} from "@/lib/keu/kk";
import { Catatan, Chip, Galat, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, Memuat, Potong, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { aksiKeu, tulisKeuKlien, useBacaKeu, useBoleh, useKirim } from "../useKeu";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; status: string; buka: string; tutup: string };
type AkunMaster = { kode: string; nama: string };
type Satuan = { kode: string };
type KeputusanRow = { kro: string; keputusan: KeputusanKro; jumlah: number | string | null; catatan: string };

const PESAN_IZIN: Record<string, string> = {
  jadwal: "Kertas kerja hanya dapat diubah saat jadwal dibuka atau terkumpul.",
  tutup: "Jendela usulan sudah ditutup; hanya PPK yang dapat mengubah kertas kerja.",
  hak: "Akun Anda tidak berwenang mengubah kertas kerja RO ini (ketua tim, admin RO, atau PPK).",
  usulan: "Usulan RO ini sedang diproses atau sudah disetujui; kertas kerja terkunci.",
};

function useIzin(ro: string, jadwal: number | null, ulang: number) {
  const [izin, setIzin] = useState<string | null>(null);
  useEffect(() => {
    let hidup = true;
    setIzin(null);
    if (jadwal === null) return;
    void aksiKeu<string>("keu_kk_izin", { p_ro: ro, p_jadwal: jadwal }).then((r) => { if (hidup) setIzin(r.ok ? String(r.data) : "hak"); });
    return () => { hidup = false; };
  }, [ro, jadwal, ulang]);
  return izin;
}

const fmtJumlah = (v: number) => (v === 0 ? "0" : angka(v));
const warnaSelisih = (v: number) => (v > 0 ? "text-[#0B6B3F]" : v < 0 ? "text-[#9B1C23]" : "text-[#5B6B84]");
const fmtSelisih = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${angka(Math.abs(v))}`);

// ---------------------------------------------------------------- satu baris
function BarisKertas({ b, bisaUbah, sesudah, onPasang, sudahDipasang }: { b: BarisKk; bisaUbah: boolean; sesudah: () => Promise<void>; onPasang: (b: BarisKk) => void; sudahDipasang: boolean }) {
  const { jalankan, kirim, mengirim, galat } = useKirim(sesudah);
  const [vol, setVol] = useState(String(n(b.vol_menjadi)));
  const [harga, setHarga] = useState(String(n(b.harga_menjadi)));
  useEffect(() => { setVol(String(n(b.vol_menjadi))); setHarga(String(n(b.harga_menjadi))); }, [b.vol_menjadi, b.harga_menjadi]);
  const v = bacaAngka(vol), h = bacaAngka(harga);
  const berubah = v !== null && h !== null && (v !== n(b.vol_menjadi) || h !== n(b.harga_menjadi));
  const sel = n(b.selisih);
  return (
    <tr className={`border-t border-[#EEF2F7] align-top ${b.penggenap ? "bg-[#FFFBEB]" : b.baru ? "bg-[#F4F9FF]" : ""}`}>
      <td className="min-w-[200px] px-2.5 py-2">
        <div className="break-words font-semibold text-[#0F2A52]">{b.uraian_menjadi ?? b.uraian_semula}</div>
        {b.uraian_semula && b.uraian_menjadi && b.uraian_semula !== b.uraian_menjadi && <div className="text-[11.5px] text-[#7A8AA3]">semula: {b.uraian_semula}</div>}
        {b.akun_semula && b.akun_semula !== b.akun_menjadi && <div className="text-[11.5px] text-[#7A8AA3]">akun semula {b.akun_semula}</div>}
        <div className="mt-0.5 flex flex-wrap gap-1">
          {b.penggenap && <Chip warna="kuning">Dana penggenap</Chip>}
          {b.pemicu && <Chip warna="biru">{b.pemicu} · {LABEL_PEMICU[b.pemicu] ?? ""}</Chip>}
          {b.pindah_dari !== null && <Chip warna="ungu">Pasangan baru</Chip>}
          {b.pindah_ke !== null && <Chip warna="ungu">Dipasangkan</Chip>}
        </div>
        <Galat pesan={galat} />
      </td>
      <td className="whitespace-nowrap px-2.5 py-2 text-right text-[#44546F]">{b.detail_id === null ? "-" : `${angka(b.vol_semula)} ${b.sat_semula ?? ""}`}<div className="font-mono text-[11.5px]">{b.detail_id === null ? "" : fmtJumlah(n(b.jumlah_semula))}</div></td>
      <td className="px-2.5 py-2">
        {bisaUbah ? (
          <div className="flex min-w-[170px] flex-col gap-1">
            <div className="flex items-center gap-1"><input aria-label="Volume menjadi" inputMode="decimal" className={`${kolom} !min-h-[34px] !w-[70px] text-right`} value={vol} onChange={(e) => setVol(e.target.value)} /><span className="text-[12px] text-[#5B6B84]">{b.sat_menjadi}</span></div>
            <input aria-label="Harga satuan menjadi" inputMode="decimal" className={`${kolom} !min-h-[34px] text-right`} value={harga} onChange={(e) => setHarga(e.target.value)} />
          </div>
        ) : <span className="text-[#0F2A52]">{angka(b.vol_menjadi)} {b.sat_menjadi}<div className="text-[11.5px] text-[#5B6B84]">@ {angka(b.harga_menjadi)}</div></span>}
      </td>
      <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono font-semibold text-[#0F2A52]">{fmtJumlah(n(b.jumlah_menjadi))}</td>
      <td className={`whitespace-nowrap px-2.5 py-2 text-right font-mono font-semibold ${warnaSelisih(sel)}`}>{fmtSelisih(sel)}</td>
      <td className="px-2.5 py-2">
        {bisaUbah && (
          <div className="flex flex-wrap gap-1">
            {berubah && <button type="button" disabled={mengirim} className={`${tombolUtama} !min-h-[34px]`} onClick={() => void jalankan(() => tulisKeuKlien("keu_kk_baris", "update", { vol_menjadi: v, harga_menjadi: h }, { id: b.id }))}>Simpan</button>}
            {bolehPasangkan(b) && !sudahDipasang && <button type="button" disabled={mengirim} className={`${tombolKecil} !min-h-[34px]`} onClick={() => onPasang(b)}>Ganti akun/redaksi</button>}
            {n(b.vol_menjadi) > 0 && b.detail_id !== null && b.pindah_ke === null && <button type="button" disabled={mengirim} className={`${tombolKecil} !min-h-[34px]`} onClick={() => void jalankan(() => tulisKeuKlien("keu_kk_baris", "update", { vol_menjadi: 0 }, { id: b.id }))}>Kosongkan</button>}
            {bolehHapus(b) && <button type="button" disabled={mengirim} className={`${tombolBahaya} !min-h-[34px]`} onClick={() => void kirim("keu_kk_hapus_baris", { p_baris: b.id })}>Hapus</button>}
          </div>
        )}
        {bisaUbah && uraianTerkunci(b) && <p className="mt-1 text-[11px] text-[#7A8AA3]">Akun, redaksi, dan satuan item resmi terkunci.</p>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- panel pasangan
function PanelPasangan({ b, jadwal, akun, sesudah, tutup }: { b: BarisKk; jadwal: number; akun: AkunMaster[]; sesudah: () => Promise<void>; tutup: () => void }) {
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const [akunBaru, setAkunBaru] = useState("");
  const [uraianBaru, setUraianBaru] = useState("");
  const [vol, setVol] = useState(String(n(b.vol_menjadi)));
  const g = periksaPasangan(akunBaru, uraianBaru, bacaAngka(vol), b);
  return (
    <div className={`${kartu} flex flex-col gap-2 border-[#1F5FD1]`}>
      <h3 className="text-[14px] font-bold text-[#0F2A52]">Ganti akun atau redaksi: {b.uraian_semula}</h3>
      <p className="text-[12.5px] text-[#5B6B84]">Item resmi tidak diedit langsung. Sistem mengurangi volume item lama dan membuat item baru (pasangan) berisi salinan dengan akun/redaksi yang Anda isi. Jadwal {jadwal}.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className={label} htmlFor={`pa-${b.id}`}>Akun baru (kosong = tetap)</label>
          <select id={`pa-${b.id}`} className={kolom} value={akunBaru} onChange={(e) => setAkunBaru(e.target.value)}><option value="">Akun tetap ({b.akun_menjadi})</option>{akun.map((a) => <option key={a.kode} value={a.kode}>{a.kode} {a.nama.slice(0, 40)}</option>)}</select></div>
        <div><label className={label} htmlFor={`pu-${b.id}`}>Redaksi baru (kosong = tetap)</label><input id={`pu-${b.id}`} className={kolom} value={uraianBaru} onChange={(e) => setUraianBaru(e.target.value)} /></div>
        <div><label className={label} htmlFor={`pv-${b.id}`}>Volume yang dipindah (maks {n(b.vol_menjadi)})</label><input id={`pv-${b.id}`} inputMode="decimal" className={kolom} value={vol} onChange={(e) => setVol(e.target.value)} /></div>
      </div>
      <Galat pesan={g.length ? g : galat} />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={mengirim || g.length > 0} className={tombolUtama} onClick={() => void kirim("keu_kk_pasangkan", { p_lama: b.id, p_akun_baru: akunBaru || null, p_uraian_baru: uraianBaru || null, p_vol: bacaAngka(vol) }).then(tutup)}>Pasangkan</button>
        <button type="button" className={tombolKecil} onClick={tutup}>Batal</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tambah item baru dan penggenap
function FormBaru({ jadwal, ro, komponen, akun, satuan, sesudah }: { jadwal: number; ro: string; komponen: string[]; akun: AkunMaster[]; satuan: string[]; sesudah: () => Promise<void> }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const [buka, setBuka] = useState(false);
  const [v, setV] = useState(isianBaruKosong(komponen[0] ?? ""));
  const g = periksaIsianBaru(v, komponen, satuan);
  if (!buka) return <button type="button" className={`${tombolKecil} self-start`} onClick={() => setBuka(true)}>Tambah item baru</button>;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <div className={`${kartu} flex flex-col gap-2`}>
      <h3 className="text-[14px] font-bold text-[#0F2A52]">Item baru</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className={label} htmlFor="kb-k">Komponen</label><select id="kb-k" className={kolom} value={v.komponen} onChange={set("komponen")}>{komponen.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
        <div><label className={label} htmlFor="kb-a">Akun</label><select id="kb-a" className={kolom} value={v.akun} onChange={set("akun")}><option value="">Pilih akun…</option>{akun.map((a) => <option key={a.kode} value={a.kode}>{a.kode} {a.nama.slice(0, 40)}</option>)}</select></div>
        <div><label className={label} htmlFor="kb-u">Uraian</label><input id="kb-u" className={kolom} value={v.uraian} onChange={set("uraian")} /></div>
        <div><label className={label} htmlFor="kb-v">Volume</label><input id="kb-v" inputMode="decimal" className={kolom} value={v.vol} onChange={set("vol")} /></div>
        <div><label className={label} htmlFor="kb-s">Satuan</label><select id="kb-s" className={kolom} value={v.sat} onChange={set("sat")}><option value="">Pilih…</option>{satuan.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className={label} htmlFor="kb-h">Harga satuan (Rp)</label><input id="kb-h" inputMode="decimal" className={kolom} value={v.harga} onChange={set("harga")} /></div>
      </div>
      <Galat pesan={g.length ? g : galat} />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={mengirim || g.length > 0} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_kk_baris", "insert", argsBaruTulis(jadwal, ro, v))).then((ok) => { if (ok) { setBuka(false); setV(isianBaruKosong(komponen[0] ?? "")); } })}>Tambahkan</button>
        <button type="button" className={tombolKecil} onClick={() => setBuka(false)}>Batal</button>
      </div>
    </div>
  );
}

function FormPenggenap({ jadwal, ro, komponen, akun, sisa, sesudah }: { jadwal: number; ro: string; komponen: string[]; akun: AkunMaster[]; sisa: number; sesudah: () => Promise<void> }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const [buka, setBuka] = useState(false);
  const akun52 = useMemo(() => akun.filter((a) => /^52\d{4}$/.test(a.kode)), [akun]);
  const [ak, setAk] = useState("");
  const [kp, setKp] = useState(komponen[0] ?? "");
  const [jml, setJml] = useState("");
  useEffect(() => { if (buka && sisa > 0) setJml(String(sisa)); }, [buka, sisa]);
  const j = bacaAngka(jml);
  const g = periksaPenggenap(ak, kp, j, komponen);
  if (!buka) return <button type="button" className={`${tombolKecil} self-start`} onClick={() => setBuka(true)}>Tambah Dana penggenap</button>;
  return (
    <div className={`${kartu} flex flex-col gap-2`}>
      <h3 className="text-[14px] font-bold text-[#0F2A52]">Dana penggenap</h3>
      <p className="text-[12.5px] text-[#5B6B84]">Menampung pagu RO yang belum terpakai RAB agar jumlah RO tetap tepat sampai pagu resmi. Hanya akun 52xxxx; tidak boleh minus.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className={label} htmlFor="pg-a">Akun</label><select id="pg-a" className={kolom} value={ak} onChange={(e) => setAk(e.target.value)}><option value="">Pilih akun 52xxxx…</option>{akun52.map((a) => <option key={a.kode} value={a.kode}>{a.kode} {a.nama.slice(0, 40)}</option>)}</select></div>
        <div><label className={label} htmlFor="pg-k">Komponen</label><select id="pg-k" className={kolom} value={kp} onChange={(e) => setKp(e.target.value)}>{komponen.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
        <div><label className={label} htmlFor="pg-j">Jumlah (Rp)</label><input id="pg-j" inputMode="decimal" className={kolom} value={jml} onChange={(e) => setJml(e.target.value)} /></div>
      </div>
      <Galat pesan={g.length ? g : galat} />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={mengirim || g.length > 0} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_kk_baris", "insert", argsPenggenap(jadwal, ro, kp, ak, akun.find((a) => a.kode === ak)?.nama, j ?? 0))).then((ok) => { if (ok) setBuka(false); })}>Tambahkan penggenap</button>
        <button type="button" className={tombolKecil} onClick={() => setBuka(false)}>Batal</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pemeriksaan, kecukupan, keputusan
function KartuPeriksa({ p }: { p: BarisPeriksa[] }) {
  const u = urutkanPeriksa(p);
  const penting = u.filter((x) => x.tingkat !== "hijau");
  const hijau = u.length - penting.length;
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Pemeriksaan kesesuaian (R-xx)</h2>
        {adaMerah(p) ? <Chip warna="merah">Ada pemeriksaan yang memblokir penerapan</Chip> : <Chip warna="hijau">Tidak ada yang memblokir</Chip>}
      </div>
      <p className="text-[12px] text-[#5B6B84]">Pemeriksaan dihitung untuk seluruh kertas kerja jadwal ini (semua RO), bukan hanya RO ini.</p>
      {penting.length === 0 && <p className="text-[13px] text-[#5B6B84]">Semua pemeriksaan sesuai.</p>}
      <ul className="flex flex-col gap-1.5">
        {penting.map((x, i) => (
          <li key={`${x.kode}-${x.objek}-${i}`} className="flex flex-wrap items-start gap-2 text-[13px] text-[#1B2B4B]">
            <Chip warna={WARNA_TINGKAT[x.tingkat] ?? "abu"}>{x.kode} · {LABEL_TINGKAT[x.tingkat]}</Chip><span className="min-w-0 flex-1 break-words">{x.pesan}</span>
          </li>
        ))}
      </ul>
      {hijau > 0 && <p className="text-[12px] text-[#5B6B84]">{hijau} pemeriksaan lain sesuai.</p>}
    </section>
  );
}

function KartuKecukupan({ jadwal, ro, kro, kec, keputusan, bolehPutus, sesudah }: { jadwal: number; ro: string; kro: string | null; kec: Kecukupan[]; keputusan: KeputusanRow[]; bolehPutus: boolean; sesudah: () => Promise<void> }) {
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const dataKro = kro ? kec.filter((x) => x.kro === kro) : [];
  const kurang = kro ? kurangKro(kec, kro) : 0;
  const kep = keputusan.find((x) => x.kro === kro);
  const [pilih, setPilih] = useState<KeputusanKro>("semua");
  const [jml, setJml] = useState("");
  const [cat, setCat] = useState("");
  useEffect(() => { if (kep) { setPilih(kep.keputusan); setJml(kep.jumlah === null ? "" : String(kep.jumlah)); setCat(kep.catatan); } }, [kep]);
  const g = kro ? periksaKeputusan(pilih, jml, kurang) : [];
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Kecukupan POK terhadap RAB{kro ? ` · KRO ${kro}` : ""}</h2>
      {!kro && <p className="text-[13px] text-[#5B6B84]">RO sementara belum punya KRO.</p>}
      {kro && dataKro.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada RAB disetujui yang terhubung ke baris kertas kerja KRO ini, jadi kecukupan belum dapat dihitung.</p>}
      {dataKro.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Kelompok</th><th className="px-2.5 py-2 text-right">RAB</th><th className="px-2.5 py-2 text-right">POK menjadi</th><th className="px-2.5 py-2 text-right">Kebutuhan (K)</th><th className="px-2.5 py-2 text-right">Kurang</th><th className="px-2.5 py-2">Status</th></tr></thead>
            <tbody>{dataKro.map((x) => (
              <tr key={x.kelompok} className="border-t border-[#EEF2F7]"><td className="px-2.5 py-2 font-semibold">{x.kelompok}</td><td className="px-2.5 py-2 text-right">{angka(x.rab)}</td><td className="px-2.5 py-2 text-right">{angka(x.pok)}</td><td className="px-2.5 py-2 text-right">{angka(x.k)}</td><td className="px-2.5 py-2 text-right">{angka(x.kurang)}</td><td className="px-2.5 py-2"><Chip warna={(WARNA_KECUKUPAN[x.status] ?? "abu") as WarnaChip}>{x.status}</Chip></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {kro && kurang > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3">
          <p className="text-[13px] text-[#0F2A52]"><b>Buku selisih:</b> kekurangan KRO {rupiah(kurang)}. {kep ? <>Keputusan PPK: <b>{LABEL_KEPUTUSAN[kep.keputusan]}</b>{kep.jumlah !== null ? ` ${rupiah(kep.jumlah)}` : ""}{kep.catatan ? ` · ${kep.catatan}` : ""}.</> : "PPK belum memutuskan."}</p>
          {bolehPutus ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <div><label className={label} htmlFor="kp-p">Keputusan PPK</label><select id="kp-p" className={kolom} value={pilih} onChange={(e) => setPilih(e.target.value as KeputusanKro)}>{(Object.keys(LABEL_KEPUTUSAN) as KeputusanKro[]).map((k) => <option key={k} value={k}>{LABEL_KEPUTUSAN[k]}</option>)}</select></div>
                {pilih === "sebagian" && <div><label className={label} htmlFor="kp-j">Jumlah diterima (Rp)</label><input id="kp-j" inputMode="decimal" className={kolom} value={jml} onChange={(e) => setJml(e.target.value)} /></div>}
                <div><label className={label} htmlFor="kp-c">Catatan</label><input id="kp-c" className={kolom} value={cat} onChange={(e) => setCat(e.target.value)} /></div>
              </div>
              <Galat pesan={g.length ? g : galat} />
              <button type="button" disabled={mengirim || g.length > 0} className={`${tombolUtama} self-start`} onClick={() => void kirim("keu_kk_putuskan", argsKeputusan(jadwal, kro, pilih, jml, cat))}>Simpan keputusan</button>
            </>
          ) : <p className="text-[12px] text-[#5B6B84]">Hanya PPK yang memutuskan kekurangan per KRO.</p>}
        </div>
      )}
      <p className="text-[11.5px] text-[#7A8AA3]">RO {ro}. Faktor kebutuhan K dan toleransi diatur di Master (nilai sementara, menunggu keputusan PPK).</p>
    </section>
  );
}

function KartuGeseran({ jadwal, baris, geseran, bisaUbah, sesudah }: { jadwal: number; baris: BarisKk[]; geseran: Geseran[]; bisaUbah: boolean; sesudah: () => Promise<void> }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const [donor, setDonor] = useState("");
  const [penerima, setPenerima] = useState("");
  const [jml, setJml] = useState("");
  const [cat, setCat] = useState("");
  const peta = useMemo(() => new Map(baris.map((b) => [b.id, b])), [baris]);
  const nama = (id: number) => { const b = peta.get(id); return b ? `${b.akun_menjadi} ${(b.uraian_menjadi ?? b.uraian_semula ?? "").slice(0, 40)}` : `#${id}`; };
  const g = periksaGeseran(peta.get(Number(donor)), peta.get(Number(penerima)), jml);
  const aktif = geseran.filter((x) => !x.batal);
  const pilihan = baris.map((b) => <option key={b.id} value={b.id}>{nama(b.id)} ({fmtSelisih(n(b.selisih))})</option>);
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Buku geseran</h2>
      <p className="text-[12.5px] text-[#5B6B84]">Catatan siapa membiayai siapa. Angka sebenarnya ada di baris kertas kerja; geseran dalam kelompok belanja yang sama.</p>
      {aktif.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada geseran tercatat.</p>}
      <ul className="flex flex-col gap-1.5">
        {aktif.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8EDF5] px-3 py-2 text-[13px]">
            <span className="min-w-0 break-words">{nama(x.donor_id)} → {nama(x.penerima_id)}: <b>{rupiah(x.jumlah)}</b>{x.catatan ? ` · ${x.catatan}` : ""}</span>
            {bisaUbah && <button type="button" disabled={mengirim} className={`${tombolBahaya} !min-h-[34px]`} onClick={() => void jalankan(() => tulisKeuKlien("keu_kk_geseran", "update", { batal: true }, { id: x.id }))}>Batalkan</button>}
          </li>
        ))}
      </ul>
      {bisaUbah && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <div><label className={label} htmlFor="gs-d">Donor</label><select id="gs-d" className={kolom} value={donor} onChange={(e) => setDonor(e.target.value)}><option value="">Pilih…</option>{pilihan}</select></div>
            <div><label className={label} htmlFor="gs-p">Penerima</label><select id="gs-p" className={kolom} value={penerima} onChange={(e) => setPenerima(e.target.value)}><option value="">Pilih…</option>{pilihan}</select></div>
            <div><label className={label} htmlFor="gs-j">Jumlah (Rp)</label><input id="gs-j" inputMode="numeric" className={kolom} value={jml} onChange={(e) => setJml(e.target.value)} /></div>
            <div><label className={label} htmlFor="gs-c">Catatan</label><input id="gs-c" className={kolom} value={cat} onChange={(e) => setCat(e.target.value)} /></div>
          </div>
          <Galat pesan={donor && penerima && jml ? (g.length ? g : galat) : galat} />
          <button type="button" disabled={mengirim || g.length > 0} className={`${tombolKecil} self-start`} onClick={() => void jalankan(() => tulisKeuKlien("keu_kk_geseran", "insert", { jadwal_id: jadwal, donor_id: Number(donor), penerima_id: Number(penerima), jumlah: bacaAngka(jml), catatan: cat.trim() })).then((ok) => { if (ok) { setDonor(""); setPenerima(""); setJml(""); setCat(""); } })}>Catat geseran</button>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- tab
export function TabKertas({ kode }: { kode: string }) {
  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 100 }));
  const terbuka = useMemo(() => (jadwal.baris ?? []).filter((j) => j.status === "dibuka" || j.status === "terkumpul"), [jadwal.baris]);
  const [pilih, setPilih] = useState<number | null>(null);
  const jid = pilih ?? terbuka[0]?.id ?? null;
  const [ulang, setUlang] = useState(0);
  const izin = useIzin(kode, jid, ulang);
  const url = (t: string, extra: Record<string, string | number> = {}, opsi: { batas?: number; urut?: string } = {}) => (jid === null ? null : urlBaca(t, { jadwal_id: jid, ...extra }, { batas: 5000, ...opsi }));
  const baris = useBacaKeu<BarisKk>(url("keu_v_kk_baris", { ro_kode: kode }, { urut: "urut" }));
  const periksa = useBacaKeu<BarisPeriksa>(url("keu_v_kk_periksa"));
  const kec = useBacaKeu<Kecukupan>(url("keu_v_kk_kecukupan"));
  const geseran = useBacaKeu<Geseran>(url("keu_kk_geseran", {}, { urut: "id" }));
  const putus = useBacaKeu<KeputusanRow>(url("keu_kk_keputusan_kro"));
  const akun = useBacaKeu<AkunMaster>(urlBaca("keu_master_akun", { aktif: "true" }, { kolom: ["kode", "nama"], urut: "kode", batas: 3000 }));
  const sat = useBacaKeu<Satuan>(urlBaca("keu_master_satuan", { aktif: "true" }, { kolom: ["kode"], urut: "urut", batas: 200 }));
  const bolehSahkan = useBoleh("sahkan", null);
  const [pasang, setPasang] = useState<BarisKk | null>(null);

  const segarkan = useCallback(async () => {
    await Promise.all([baris.muat(), periksa.muat(), kec.muat(), geseran.muat(), putus.muat()]);
    setUlang((x) => x + 1);
  }, [baris, periksa, kec, geseran, putus]);
  const { kirim: muatBaris, mengirim: memuatBaris, galat: galatMuat } = useKirim(segarkan);

  const rows = baris.baris ?? [];
  const kertas = useMemo(() => susunKertas(rows), [rows]);
  const tot = useMemo(() => totalKertas(rows), [rows]);
  const sisa = sisaTerhadapPagu(rows);
  const komponen = useMemo(() => kertas.map((k) => k.komponen), [kertas]);
  const kro = rows[0]?.kro ?? (/^\d{4}\.[A-Z]{3}\.[A-Z0-9]{3}$/.test(kode) ? kode.slice(0, 8) : null);
  const bisaUbah = izin === "ok";

  if (jadwal.galat) return <Galat pesan={jadwal.galat} />;
  if (!jadwal.baris) return <Memuat />;
  if (terbuka.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className={`${kartu} flex flex-col gap-1`}><h2 className={judulKartu}>Kertas kerja revisi (Semula / Menjadi)</h2>
          <p className="text-[12.5px] text-[#5B6B84]">Kertas kerja hanya tersedia saat ada jadwal revisi yang dibuka atau terkumpul.</p></div>
        <Kosong teks="Belum ada jadwal revisi yang dibuka. PPK membuka jendela usulan lewat halaman Jadwal revisi." />
      </div>
    );
  }
  const j = terbuka.find((x) => x.id === jid)!;
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${kartu} flex flex-col gap-2`}>
        <h2 className={judulKartu}>Kertas kerja revisi (Semula / Menjadi)</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Semula = POK berlaku, tidak dapat diubah. Menjadi = usulan perubahan. Setiap RO harus tepat sampai pagu resmi; pagu KRO tetap pada Revisi POK.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className={label} htmlFor="kk-j">Jadwal revisi</label>
            <select id="kk-j" className={`${kolom} !w-auto max-w-full`} value={jid ?? ""} onChange={(e) => setPilih(Number(e.target.value))}>{terbuka.map((x) => <option key={x.id} value={x.id}>{x.judul}</option>)}</select></div>
          <Chip warna="biru">{LABEL_JENIS_JADWAL[j.jenis] ?? j.jenis}</Chip>
          <Chip warna={j.status === "dibuka" ? "hijau" : "kuning"}>{LABEL_STATUS_JADWAL[j.status] ?? j.status}</Chip>
          {izin === "ok" && <button type="button" disabled={memuatBaris} className={tombolKecil} onClick={() => void muatBaris("keu_kk_muat_ro", { p_jadwal: jid, p_ro: kode })}>{rows.length === 0 ? "Muat baris POK RO ini" : "Muat baris yang belum ada"}</button>}
        </div>
        <Galat pesan={galatMuat} />
        {izin && izin !== "ok" && <Catatan>{PESAN_IZIN[izin] ?? "Kertas kerja tidak dapat diubah."} Anda tetap dapat melihatnya.</Catatan>}
      </div>

      {baris.galat ? <Galat pesan={baris.galat} /> : !baris.baris ? <Memuat /> : rows.length === 0 ? (
        <Kosong teks={izin === "ok" ? "Kertas kerja RO ini masih kosong. Klik \"Muat baris POK RO ini\" untuk menyalin POK berlaku sebagai kolom Semula." : "Kertas kerja RO ini belum dimuat."} />
      ) : (
        <>
          <div className={kisi}>
            <Kpi label="Jumlah Semula" nilai={rupiah(tot.semula)} sub={`${rows.length} baris`} />
            <Kpi label="Jumlah Menjadi" nilai={rupiah(tot.menjadi)} sub={`${tot.nBerubah} baris berubah`} />
            <Kpi label="Selisih" nilai={fmtSelisih(tot.selisih)} sub={sisa === 0 ? "Tepat sampai pagu" : sisa > 0 ? `Pagu sisa ${rupiah(sisa)}` : `Melebihi pagu ${rupiah(-sisa)}`} warna={sisa === 0 ? "hj" : "mr"} />
            <Kpi label="Item baru / penggenap" nilai={`${tot.nBaru} / ${tot.nPenggenap}`} sub={tot.nPenggenap ? `penggenap ${rupiah(tot.totalPenggenap)}` : "tanpa penggenap"} />
          </div>
          {sisa > 0 && <Catatan>Pagu RO masih sisa {rupiah(sisa)}. Tambahkan Dana penggenap agar RO tepat sampai pagu resmi.</Catatan>}
          {sisa < 0 && <Galat pesan={`Jumlah Menjadi melebihi pagu RO sebesar ${rupiah(-sisa)}. Kurangi volume atau harga pada baris lain.`} />}
          {baris.terpotong && <Potong />}
          {pasang && jid !== null && <PanelPasangan b={pasang} jadwal={jid} akun={akun.baris ?? []} sesudah={segarkan} tutup={() => setPasang(null)} />}
          {kertas.map((k) => (
            <section key={k.komponen} className={`${kartu} flex flex-col gap-2`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className={judulKartu}>Komponen {k.komponen}</h2>
                <p className="text-[13px] text-[#44546F]">Semula {rupiah(k.semula)} · Menjadi {rupiah(k.menjadi)} · <span className={`font-semibold ${warnaSelisih(k.selisih)}`}>{fmtSelisih(k.selisih)}</span></p></div>
              {k.akun.map((a) => (
                <details key={a.akun} open className="rounded-lg border border-[#E8EDF5] bg-[#F9FBFE] px-3 py-1">
                  <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-[#0F2A52]">
                    <span><span className="font-mono">{a.akun}</span> · {a.baris.length} baris</span>
                    <span className="text-[12.5px] font-normal text-[#44546F]">Semula {rupiah(a.semula)} · Menjadi {rupiah(a.menjadi)} · <span className={`font-semibold ${warnaSelisih(a.selisih)}`}>{fmtSelisih(a.selisih)}</span></span>
                  </summary>
                  <div className="overflow-x-auto rounded-lg border border-[#DCE3EE] bg-white">
                    <table className="w-full min-w-[820px] text-left text-[12.5px]">
                      <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Uraian</th><th className="px-2.5 py-2 text-right">Semula</th><th className="px-2.5 py-2">Menjadi (volume, harga)</th><th className="px-2.5 py-2 text-right">Jumlah</th><th className="px-2.5 py-2 text-right">Selisih</th><th className="px-2.5 py-2">Aksi</th></tr></thead>
                      <tbody>{a.baris.map((b) => <BarisKertas key={b.id} b={b} bisaUbah={bisaUbah} sesudah={segarkan} onPasang={setPasang} sudahDipasang={b.pindah_ke !== null} />)}</tbody>
                    </table>
                  </div>
                </details>
              ))}
            </section>
          ))}
          {bisaUbah && jid !== null && (
            <div className="flex flex-col gap-2.5">
              <FormBaru jadwal={jid} ro={kode} komponen={komponen} akun={akun.baris ?? []} satuan={(sat.baris ?? []).map((s) => s.kode)} sesudah={segarkan} />
              <FormPenggenap jadwal={jid} ro={kode} komponen={komponen} akun={akun.baris ?? []} sisa={sisa} sesudah={segarkan} />
            </div>
          )}
          {jid !== null && <KartuGeseran jadwal={jid} baris={rows} geseran={geseran.baris ?? []} bisaUbah={bisaUbah} sesudah={segarkan} />}
          {jid !== null && <KartuKecukupan jadwal={jid} ro={kode} kro={kro} kec={kec.baris ?? []} keputusan={putus.baris ?? []} bolehPutus={bolehSahkan === true} sesudah={segarkan} />}
          <KartuPeriksa p={periksa.baris ?? []} />
        </>
      )}
    </div>
  );
}
