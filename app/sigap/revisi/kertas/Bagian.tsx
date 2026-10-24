"use client";

// app/sigap/revisi/kertas/Bagian.tsx
//
// (24 Okt 2026) Bagian kertas kerja yang dipakai halaman matriks KRO (/sigap/revisi/kertas): panel Ganti akun/redaksi (pasangan), item baru,
// Dana penggenap, buku geseran, pemeriksaan R-xx, serta kecukupan KRO dan keputusan PPK. Aturan ditegakkan basis data (berkas SQL f).
// Logika murni: lib/keu/kk.ts dan lib/keu/matriks.ts.

import { useEffect, useMemo, useState } from "react";
import { angka, rupiah } from "@/lib/keu/ro";
import type { WarnaChip } from "@/lib/keu/revisi";
import {
  adaMerah, argsBaruTulis, argsKeputusan, argsPenggenap, bacaAngka, isianBaruKosong, kurangKro, LABEL_KEPUTUSAN, LABEL_TINGKAT, n,
  periksaGeseran, periksaIsianBaru, periksaKeputusan, periksaPasangan, periksaPenggenap, urutkanPeriksa,
  WARNA_KECUKUPAN, WARNA_TINGKAT, type BarisKk, type BarisPeriksa, type Geseran, type Kecukupan, type KeputusanKro,
} from "@/lib/keu/kk";
import { Chip, Galat, judulKartu, kartu, kolom, label, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { tulisKeuKlien, useKirim } from "../../ro/useKeu";

export type AkunMaster = { kode: string; nama: string };
export type KeputusanRow = { kro: string; keputusan: KeputusanKro; jumlah: number | string | null; catatan: string };

const fmtSelisih = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${angka(Math.abs(v))}`);

// ---------------------------------------------------------------- panel pasangan
export function PanelPasangan({ b, jadwal, akun, sesudah, tutup }: { b: BarisKk; jadwal: number; akun: AkunMaster[]; sesudah: () => Promise<void>; tutup: () => void }) {
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
export function FormBaru({ jadwal, ro, komponen, akun, satuan, sesudah, awal, onTutup }: { jadwal: number; ro: string; komponen: string[]; akun: AkunMaster[]; satuan: string[]; sesudah: () => Promise<void>; awal?: { komponen: string; akun: string }; onTutup?: () => void }) {
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const [buka, setBuka] = useState(!!awal);
  const [v, setV] = useState({ ...isianBaruKosong(awal?.komponen ?? komponen[0] ?? ""), akun: awal?.akun ?? "" });
  const g = periksaIsianBaru(v, komponen, satuan);
  if (!buka) return <button type="button" className={`${tombolKecil} self-start`} onClick={() => setBuka(true)}>Tambah item baru</button>;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <div className={`${kartu} flex flex-col gap-2`}>
      <h3 className="text-[14px] font-bold text-[#0F2A52]">Item baru{awal ? ` di akun ${awal.akun}` : ""} · RO {ro}</h3>
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
        <button type="button" disabled={mengirim || g.length > 0} className={tombolUtama} onClick={() => void jalankan(() => tulisKeuKlien("keu_kk_baris", "insert", argsBaruTulis(jadwal, ro, v))).then((ok) => { if (ok) { setBuka(false); setV(isianBaruKosong(komponen[0] ?? "")); onTutup?.(); } })}>Tambahkan</button>
        <button type="button" className={tombolKecil} onClick={() => { setBuka(false); onTutup?.(); }}>Batal</button>
      </div>
    </div>
  );
}

export function FormPenggenap({ jadwal, ro, komponen, akun, sisa, sesudah }: { jadwal: number; ro: string; komponen: string[]; akun: AkunMaster[]; sisa: number; sesudah: () => Promise<void> }) {
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
export function KartuPeriksa({ p }: { p: BarisPeriksa[] }) {
  const u = urutkanPeriksa(p);
  const penting = u.filter((x) => x.tingkat !== "hijau");
  const hitung = (t: string) => u.filter((x) => x.tingkat === t).length;
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Pemeriksaan kesesuaian R-01 sampai R-17</h2>
        <div className="flex flex-wrap gap-1.5">
          <Chip warna="merah">{hitung("merah")} merah</Chip><Chip warna="kuning">{hitung("kuning")} kuning</Chip><Chip warna="hijau">{hitung("hijau")} hijau</Chip><Chip warna="biru">{hitung("info")} info</Chip>
        </div>
      </div>
      {adaMerah(p) ? <Chip warna="merah">Ada pemeriksaan yang memblokir penerapan</Chip> : <Chip warna="hijau">Tidak ada yang memblokir</Chip>}
      <p className="text-[12px] text-[#5B6B84]">Merah ditandai tidak sesuai dan perlu dikoreksi sebelum diajukan. Persetujuan dan penolakan hanya dicatat dari hasil resmi, tidak disimpulkan sistem. Pemeriksaan dihitung untuk seluruh kertas kerja jadwal ini (semua RO dan KRO).</p>
      {penting.length === 0 && <p className="text-[13px] text-[#5B6B84]">Semua pemeriksaan sesuai.</p>}
      <ul className="flex flex-col gap-1.5">
        {penting.map((x, i) => (
          <li key={`${x.kode}-${x.objek}-${i}`} className="flex flex-wrap items-start gap-2 text-[13px] text-[#1B2B4B]">
            <Chip warna={WARNA_TINGKAT[x.tingkat] ?? "abu"}>{x.kode} · {LABEL_TINGKAT[x.tingkat]}</Chip><span className="min-w-0 flex-1 break-words">{x.pesan}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KartuKecukupan({ jadwal, ro, kro, kec, keputusan, bolehPutus, sesudah }: { jadwal: number; ro: string; kro: string | null; kec: Kecukupan[]; keputusan: KeputusanRow[]; bolehPutus: boolean; sesudah: () => Promise<void> }) {
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
      <h2 className={judulKartu}>Kecukupan menurut RAB yang sudah disahkan dan keputusan PPK{kro ? ` · KRO ${kro}` : ""}</h2>
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

export function KartuGeseran({ jadwal, baris, geseran, bisaUbah, sesudah }: { jadwal: number; baris: BarisKk[]; geseran: Geseran[]; bisaUbah: boolean; sesudah: () => Promise<void> }) {
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
