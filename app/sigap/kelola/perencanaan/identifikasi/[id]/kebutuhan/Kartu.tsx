"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/kebutuhan/Kartu.tsx
//
// (26 Okt 2026, tahap 34) Kartu halaman Kebutuhan: rekrutmen mitra dan draf pengadaan. Hanya tampilan; aturan ada di lib/keu/rekrutmen.ts dan lib/keu/pengadaan.ts.
// Semuanya membaca identifikasi lanjutan (atau perkiraan dari identifikasi awal bila lanjutan belum ada); tidak ada yang tertulis dan tidak ada yang memblokir.

import { useState } from "react";
import Link from "next/link";
import { Catatan, Chip, Galat, kolom, label, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { tglIndo } from "@/lib/keu/identifikasi";
import { NAMA_AKUN } from "@/lib/keu/identifikasi";
import { NAMA_PERAN } from "@/lib/keu/lanjutan";
import { LABEL_MITRA, teksTenggat, type RingkasRekrutmen } from "@/lib/keu/rekrutmen";
import { ringkasPengadaan, sisaHariButuh, teksDraf, urutkanPengadaan, type ItemPengadaan } from "@/lib/keu/pengadaan";
import { LABEL_STATUS, URUTAN_STATUS, periksaCatatan, ringkasStatus, statusBerikut, statusButir, type CatatanStatus, type StatusPengadaan } from "@/lib/keu/statusPengadaan";
import { Bagian, Poin } from "../../Kontrol";

export const ID_KB = { rekrutmen: "kb-rekrutmen", pengadaan: "kb-pengadaan" } as const;

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const tautanKecil = "inline-flex min-h-[40px] items-center rounded-md border border-[#C5D0E2] bg-white px-3 text-[12.5px] font-semibold text-[#1F5FD1] hover:bg-[#EEF2F7]";

// ---------------------------------------------------------------------------------------------------------------------
export function KartuRekrutmen({ identId, r, dariAwal }: { identId: number; r: RingkasRekrutmen; dariAwal: boolean }) {
  return (
    <Bagian huruf="A" judul="Rekrutmen mitra" id={ID_KB.rekrutmen}>
      <Catatan>
        Kebutuhan mitra dibaca dari identifikasi lanjutan: jumlah per peran, sumber (langsung dari kepka atau lewat seleksi), dan nama yang sudah diisi. Tenggat SPK adalah hari
        mulai pelatihan pertama yang diikuti perannya, atau hari mulai pendataan bila tidak ada pelatihan. Halaman ini hanya menunjukkan keadaan; surat tugas atau SPK
        dibuat dan diterbitkan pada layar dokumen lanjutan.{dariAwal && " Lanjutan belum disimpan, jadi angka di bawah masih perkiraan dari identifikasi awal."}
      </Catatan>
      {!r.aktif ? <p className="m-0 text-[13px] text-[#5B6B84]">{r.catatan[0]}</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
            <Chip warna="biru">{r.total} mitra</Chip>
            <Chip warna="hijau">{r.spkTerbit} SPK terbit</Chip>
            {r.siapSpk > 0 && <Chip warna="biru">{r.siapSpk} siap atau konsep SPK</Chip>}
            {r.menungguSeleksi > 0 && <Chip warna="kuning">{r.menungguSeleksi} menunggu seleksi</Chip>}
            {r.menungguNama > 0 && <Chip warna="kuning">{r.menungguNama} menunggu nama atau peran</Chip>}
            {r.kurang > 0 && <Chip warna="kuning">{r.kurang} belum dicatat</Chip>}
            {r.baru > 0 && <Chip warna="abu">{r.baru} mitra baru</Chip>}
          </div>

          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[#DCE3EE] text-[#5B6B84]">
                  <th className="py-1.5 pr-2 font-semibold">Peran</th><th className="pr-2 text-right font-semibold">Kebutuhan</th><th className="pr-2 text-right font-semibold">Tercatat</th>
                  <th className="pr-2 text-right font-semibold">Kepka</th><th className="pr-2 text-right font-semibold">Seleksi</th><th className="pr-2 text-right font-semibold">SPK terbit</th><th className="font-semibold">Tenggat SPK</th>
                </tr>
              </thead>
              <tbody>
                {r.peran.map((p) => (
                  <tr key={p.kode} className="border-b border-[#EEF2F7] align-top">
                    <td className="py-1.5 pr-2 text-[#0F2A52]">{p.nama}{p.perkiraan && <span className="ml-1.5 rounded bg-[#FFF4D6] px-1 text-[11px] font-semibold text-[#8A6200]">≈</span>}</td>
                    <td className="pr-2 text-right tabular-nums">{p.target}</td>
                    <td className={`pr-2 text-right tabular-nums ${p.kurang > 0 || p.lebih > 0 ? "font-semibold text-[#8A6200]" : ""}`}>{p.tercatat}</td>
                    <td className="pr-2 text-right tabular-nums">{p.kepka}</td>
                    <td className="pr-2 text-right tabular-nums">{p.seleksi}</td>
                    <td className="pr-2 text-right tabular-nums">{p.spkTerbit}</td>
                    <td>{p.tenggat ? tglIndo(p.tenggat) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[#DCE3EE] text-[#5B6B84]">
                  <th className="py-1.5 pr-2 font-semibold">Mitra</th><th className="pr-2 font-semibold">Peran</th><th className="pr-2 font-semibold">Sumber</th><th className="pr-2 font-semibold">Status</th><th className="pr-2 font-semibold">Tenggat</th><th className="font-semibold">Dokumen</th>
                </tr>
              </thead>
              <tbody>
                {r.mitra.map((m) => (
                  <tr key={m.kode} className="border-b border-[#EEF2F7] align-top">
                    <td className="py-1.5 pr-2 text-[#0F2A52]">{m.nama || <span className="text-[#5B6B84]">(nama menyusul)</span>}{m.baru && <span className="ml-1.5 rounded bg-[#EEF2F7] px-1 text-[11px] font-semibold text-[#44546F]">baru</span>}<div className="text-[11.5px] text-[#5B6B84]">{m.kode}</div></td>
                    <td className="pr-2">{m.peran === "" ? "—" : NAMA_PERAN[m.peran]}</td>
                    <td className="pr-2">{m.sumber === "seleksi" ? "Seleksi" : "Kepka"}</td>
                    <td className="pr-2"><Chip warna={LABEL_MITRA[m.status].nada}>{LABEL_MITRA[m.status].teks}</Chip>{m.catatan && <div className="mt-0.5 text-[11.5px] text-[#5B6B84]">{m.catatan}</div>}</td>
                    <td className="pr-2"><Chip warna={m.nada}>{teksTenggat(m.tenggat, m.sisaHari)}</Chip></td>
                    <td>
                      {m.status === "siap_spk" || m.status === "spk_konsep" || m.status === "spk_terbit"
                        ? <Link className={tautanKecil} href={`/sigap/kelola/perencanaan/identifikasi/${identId}/lanjutan/dokumen?jenis=tugas&kunci=${encodeURIComponent(m.kode)}`}>{m.status === "spk_terbit" ? "Lihat SPK" : "Buka SPK"}</Link>
                        : <span aria-hidden className="text-[#8FA3C2]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.catatan.length > 0 && <Poin kelas="!text-[#5C4300]" butir={r.catatan} />}
          <div className="flex flex-wrap items-center gap-2">
            <Link className={tautanKecil} href={`/sigap/kelola/perencanaan/identifikasi/${identId}/lanjutan`}>Ubah daftar petugas pada lanjutan →</Link>
            <Link className={tautanKecil} href={`/sigap/kelola/perencanaan/identifikasi/${identId}/pelaksanaan`}>Penugasan di SIGAP →</Link>
          </div>
        </>
      )}
    </Bagian>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
function ChipButuh({ it, hariIni }: { it: ItemPengadaan; hariIni: string }) {
  const sisa = sisaHariButuh(it, hariIni);
  if (sisa === null) return <Chip warna="abu">tanggal belum ada</Chip>;
  if (sisa < 0) return <Chip warna="abu">sudah lewat {-sisa} hari</Chip>;
  if (sisa === 0) return <Chip warna="kuning">hari ini</Chip>;
  return <Chip warna={sisa <= 14 ? "kuning" : "biru"}>{sisa} hari lagi</Chip>;
}

/** Pelacakan satu butir: status terkini dan pengubah sebaris. Basis data yang memutuskan hak; galat ditampilkan apa adanya. */
export type PelacakanProps = {
  tersedia: boolean;
  peta: ReadonlyMap<string, CatatanStatus>;
  mengirim: boolean;
  galat: string | null;
  hapusGalat: () => void;
  catat: (it: Pick<ItemPengadaan, "id" | "uraian">, status: StatusPengadaan, rujukan: string, catatan: string) => Promise<boolean>;
};

function SelPelacakan({ it, p }: { it: ItemPengadaan; p: PelacakanProps }) {
  const [buka, setBuka] = useState(false);
  const cat = p.peta.get(it.id);
  const sekarang = statusButir(p.peta, it.id);
  const [status, setStatus] = useState<StatusPengadaan>(sekarang);
  const [rujukan, setRujukan] = useState(cat?.rujukan ?? "");
  const [catatan, setCatatan] = useState(cat?.catatan ?? "");
  const [salah, setSalah] = useState<string | null>(null);
  const mulai = () => { setStatus(statusBerikut(sekarang) ?? sekarang); setRujukan(cat?.rujukan ?? ""); setCatatan(cat?.catatan ?? ""); setSalah(null); p.hapusGalat(); setBuka(true); };
  const simpan = async () => {
    const g = periksaCatatan(status, rujukan, catatan);
    if (g) { setSalah(g); return; }
    setSalah(null);
    if (await p.catat(it, status, rujukan, catatan)) setBuka(false);
  };
  const info = LABEL_STATUS[sekarang];
  return (
    <div>
      <Chip warna={info.warna}>{info.teks}</Chip>
      {cat && cat.rujukan && <div className="mt-0.5 text-[11.5px] text-[#44546F]">{cat.rujukan}</div>}
      {cat && cat.catatan && <div className="text-[11.5px] text-[#5B6B84]">{cat.catatan}</div>}
      {cat && cat.oleh && cat.status !== "belum" && <div className="text-[11px] text-[#7A8AA3]">{cat.oleh}{cat.waktu ? `, ${tglIndo(cat.waktu.slice(0, 10))}` : ""}</div>}
      {!buka ? (
        <button type="button" className={`${tombolKecil} mt-1 !min-h-[32px] !px-2 !text-[12px]`} onClick={mulai}>Ubah status</button>
      ) : (
        <div className="mt-1.5 grid w-[220px] max-w-full gap-1.5 rounded-md border border-[#DCE3EE] bg-[#F7F9FC] p-2">
          <div>
            <label className={label} htmlFor={`st-${it.id}`}>Status</label>
            <select id={`st-${it.id}`} className={kolom} value={status} onChange={(e) => setStatus(e.target.value as StatusPengadaan)}>
              {URUTAN_STATUS.map((s) => <option key={s} value={s}>{LABEL_STATUS[s].teks}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`rj-${it.id}`}>Rujukan (nomor permintaan, SPK, atau kontrak)</label>
            <input id={`rj-${it.id}`} className={kolom} maxLength={100} value={rujukan} onChange={(e) => setRujukan(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor={`ct-${it.id}`}>Catatan{status === "batal" ? " (wajib: alasan pembatalan)" : ""}</label>
            <input id={`ct-${it.id}`} className={kolom} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </div>
          <Galat pesan={salah ?? p.galat} />
          <div className="flex gap-1.5">
            <button type="button" className={tombolUtama} disabled={p.mengirim} onClick={() => void simpan()}>{p.mengirim ? "Menyimpan..." : "Simpan"}</button>
            <button type="button" className={tombolKecil} disabled={p.mengirim} onClick={() => { setBuka(false); setSalah(null); p.hapusGalat(); }}>Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function KartuPengadaan({ identId, ro, judul, daftar, hariIni, dariAwal, halamanIni, pelacakan }: {
  identId: number; ro: string; judul: string; daftar: ItemPengadaan[]; hariIni: string; dariAwal: boolean; halamanIni: string; pelacakan: PelacakanProps;
}) {
  const [salinan, setSalinan] = useState<"" | "ok" | "gagal">("");
  const urut = urutkanPengadaan(daftar);
  const ringkas = ringkasPengadaan(daftar);
  const lacak = pelacakan.tersedia;
  const rs = ringkasStatus(daftar, pelacakan.peta);
  const salin = async () => {
    try { await navigator.clipboard.writeText(teksDraf(daftar, judul, ro)); setSalinan("ok"); } catch { setSalinan("gagal"); }
  };
  return (
    <Bagian huruf="B" judul="Draf pengadaan" id={ID_KB.pengadaan}>
      <Catatan>
        Daftar barang dan jasa yang perlu diadakan menurut identifikasi lanjutan. Nilai rupiah hanya muncul bila tarif sudah ada pada lembar kebijakan (tarif adalah batas tertinggi);
        selebihnya tampil dengan hal yang masih perlu dilengkapi. Metode dan nilai pengadaan ditentukan PPK atau pejabat pengadaan (cek aturan), bukan oleh halaman ini.
        {dariAwal && " Lanjutan belum disimpan, jadi tanggal, peserta, dan paket masih perkiraan dari identifikasi awal."}
      </Catatan>
      {daftar.length === 0 ? <p className="m-0 text-[13px] text-[#5B6B84]">Tidak ada kebutuhan pengadaan pada identifikasi ini.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
            <Chip warna="biru">{ringkas.jumlah} item</Chip>
            <Chip warna="hijau">{ringkas.siap} lengkap</Chip>
            {ringkas.perluDilengkapi > 0 && <Chip warna="kuning">{ringkas.perluDilengkapi} perlu dilengkapi</Chip>}
            {ringkas.perkiraan > 0 && <Chip warna="abu">{ringkas.perkiraan} masih Perkiraan</Chip>}
            <Chip warna={ringkas.denganNilai > 0 ? "biru" : "abu"}>{ringkas.denganNilai > 0 ? `${rp(ringkas.total)} dari ${ringkas.denganNilai} item bertarif` : "belum ada item bertarif"}</Chip>
            {lacak && rs.per.diajukan + rs.per.diproses > 0 && <Chip warna="biru">{rs.per.diajukan + rs.per.diproses} diajukan atau diproses</Chip>}
            {lacak && rs.per.selesai > 0 && <Chip warna="hijau">{rs.per.selesai} selesai</Chip>}
            {lacak && rs.per.batal > 0 && <Chip warna="merah">{rs.per.batal} dibatalkan</Chip>}
          </div>
          {lacak && rs.diajukanBelumLengkap > 0 && <Catatan>{rs.diajukanBelumLengkap} butir sudah diajukan atau diproses padahal draf masih memuat hal yang perlu dilengkapi; periksa kembali kelas pada lanjutan.</Catatan>}
          {lacak && rs.yatim.length > 0 && (
            <Catatan>
              Ada status tercatat untuk butir yang tidak lagi ada pada draf (mis. kelas dihapus atau diganti): {rs.yatim.map((y) => `${y.uraian} (${LABEL_STATUS[y.status].teks})`).join("; ")}. Catatan lama tetap tersimpan di riwayat identifikasi.
            </Catatan>
          )}
          {!lacak && !pelacakan.mengirim && <p className="m-0 text-[12.5px] text-[#5B6B84]">Pelacakan status pengadaan belum aktif di basis data; daftar tetap dapat dibaca dan disalin.</p>}
          <div className="min-w-0 overflow-x-auto">
            <table className={`w-full ${lacak ? "min-w-[980px]" : "min-w-[760px]"} border-collapse text-left text-[12.5px]`}>
              <thead>
                <tr className="border-b border-[#DCE3EE] text-[#5B6B84]">
                  <th className="py-1.5 pr-2 font-semibold">Barang atau jasa</th><th className="pr-2 font-semibold">Akun</th><th className="pr-2 text-right font-semibold">Volume</th>
                  <th className="pr-2 font-semibold">Dibutuhkan</th><th className="pr-2 text-right font-semibold">Perkiraan nilai</th><th className="pr-2 font-semibold">Kelengkapan</th>{lacak && <th className="font-semibold">Pelacakan</th>}
                </tr>
              </thead>
              <tbody>
                {urut.map((it) => (
                  <tr key={it.kunci} className="border-b border-[#EEF2F7] align-top">
                    <td className="py-1.5 pr-2 text-[#0F2A52]">
                      {it.uraian}{it.perkiraan && <span className="ml-1.5 rounded bg-[#FFF4D6] px-1 text-[11px] font-semibold text-[#8A6200]">≈</span>}
                      <div className="text-[11.5px] text-[#5B6B84]">{it.kelompok} · {it.jenis}{it.tempat ? ` · ${it.tempat}` : ""}{it.paket ? ` · paket ${it.paket}` : ""}</div>
                      {it.catatan.length > 0 && <div className="text-[11.5px] text-[#5B6B84]">{it.catatan.join(" ")}</div>}
                    </td>
                    <td className="pr-2 tabular-nums">{it.akun}<div className="text-[11.5px] text-[#5B6B84]">{NAMA_AKUN[it.akun] ?? "Akun belanja"}</div></td>
                    <td className="pr-2 text-right tabular-nums">{it.volume === null ? "—" : `${it.volume.toLocaleString("id-ID")} ${it.satuan}`}</td>
                    <td className="pr-2">{it.butuhMulai ? (it.butuhSelesai && it.butuhSelesai !== it.butuhMulai ? `${tglIndo(it.butuhMulai)} s.d. ${tglIndo(it.butuhSelesai)}` : tglIndo(it.butuhMulai)) : "—"}<div className="mt-0.5"><ChipButuh it={it} hariIni={hariIni} /></div></td>
                    <td className="pr-2 text-right tabular-nums">{it.nilai === null ? "—" : rp(it.nilai)}{it.tarif !== null && <div className="text-[11.5px] text-[#5B6B84]">tarif {rp(it.tarif)}</div>}</td>
                    <td className="pr-2">
                      {it.perlu.length === 0 ? <Chip warna="hijau">Lengkap</Chip> : <Chip warna="kuning">Perlu dilengkapi</Chip>}
                      {it.perlu.length > 0 && <div className="mt-0.5 text-[11.5px] text-[#5B6B84]">{it.perlu.join("; ")}</div>}
                    </td>
                    {lacak && <td><SelPelacakan key={`${it.id}-${statusButir(pelacakan.peta, it.id)}`} it={it} p={pelacakan} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={tombolKecil} onClick={() => void salin()}>Salin daftar sebagai teks</button>
            <Link className={tautanKecil} href={`/sigap/ro/${encodeURIComponent(ro)}?tab=rab&dari=${encodeURIComponent(halamanIni)}`}>RAB RO: usulan dan rencana realisasi →</Link>
            <Link className={tautanKecil} href={`/sigap/kelola/perencanaan/identifikasi/${identId}/lanjutan`}>Ubah kelas pada lanjutan →</Link>
            {salinan === "ok" && <span role="status" className="text-[12.5px] font-semibold text-[#14653A]">Daftar disalin.</span>}
            {salinan === "gagal" && <span role="alert" className="text-[12.5px] font-semibold text-[#7A1D22]">Peramban menolak menyalin; salin teks di bawah secara manual.</span>}
          </div>
          {salinan === "gagal" && <textarea readOnly aria-label="Draf pengadaan sebagai teks" rows={10} value={teksDraf(daftar, judul, ro)} onFocus={(e) => e.currentTarget.select()} className="box-border w-full rounded-md border border-[#C5D0E2] bg-[#F7F9FC] p-2 font-mono text-[12px] text-[#0F2A52]" />}
        </>
      )}
    </Bagian>
  );
}
