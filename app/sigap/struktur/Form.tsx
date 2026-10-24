"use client";

// app/sigap/struktur/Form.tsx
//
// (24 Okt 2026, tahap 16) Bagian 1 papan 16: tambah satu baris usulan pada level pilihan. Pilih level, pilih induk bertingkat (jalur POK berlaku atau usulan
// yang belum aktif), isi kode/uraian/volume/satuan/harga, pilih sumber dana. Jalur kewenangan dan pemeriksaan isian tampil langsung di kanan; tombol Simpan
// memanggil keu_struktur_usul (selalu menyimpan sebagai draf, kode sementara T-nnn dari basis data). Hak ditegakkan basis data.

import { useMemo, useState } from "react";
import {
  argsUsul, bolehKhusus, butuhHarga, butuhKode, butuhVolume, cariJalur, cekIsian, indukTerpilih, isianKosong, kewenanganPengusul, levelTampil, namaLevelPendek, NAMA_TINGKAT,
  nomorLevel, opsiInduk, rantaiInduk, rapikanPilihan, semuaLulus, SUMBER_DANA, teksKepastian, teksTenggat, warnaJalur, warnaKepastian,
  type Isian, type JalurMaster, type LevelStruktur, type NodeJalur, type UsulanStruktur,
} from "@/lib/keu/struktur";
import type { AliasSatuan, SatuanMaster, WaktuMaster } from "@/lib/keu/master";
import { caps, Chip, Galat, judulKartu, kartu, kolom, label, Tenang, tombolAktif, tombolKecil, tombolUtama } from "../keu-ui";
import { useBoleh, useKirim } from "../ro/useKeu";

type AkunRef = { kode: string; nama: string; aktif: boolean; pola_kode?: string };
type Sesudah = () => Promise<void>;

export default function FormTambah({ level, jalur, waktu, node, usulan, akun, satuan, alias, sesudah }: {
  level: LevelStruktur[]; jalur: JalurMaster[]; waktu: WaktuMaster[]; node: NodeJalur[]; usulan: UsulanStruktur[]; akun: AkunRef[]; satuan: SatuanMaster[]; alias: AliasSatuan[]; sesudah: Sesudah;
}) {
  const tampil = useMemo(() => levelTampil(level), [level]);
  const [lvPilih, setLv] = useState("item");
  const [pilihan, setPilihan] = useState<Record<string, string>>({});
  const [isian, setIsian] = useState<Isian>(isianKosong());
  const [pesan, setPesan] = useState<string | null>(null);
  const { kirim, mengirim, galat, hapusGalat } = useKirim(sesudah);

  const lv = tampil.find((l) => l.kode === lvPilih) ?? tampil.find((l) => l.kode === "item") ?? tampil[tampil.length - 1];
  const kodeLv = lv?.kode ?? "item";
  const rantai = rantaiInduk(kodeLv);
  const pilihSah = useMemo(() => rapikanPilihan(kodeLv, pilihan, node, usulan), [kodeLv, pilihan, node, usulan]);
  const induk = useMemo(() => indukTerpilih(kodeLv, pilihSah, node, usulan), [kodeLv, pilihSah, node, usulan]);
  const kew = kewenanganPengusul(lv?.pengusul ?? "tim");
  const bolehTulis = useBoleh(kew, induk.roKode);

  const cek = useMemo(() => (lv ? cekIsian({ level: lv, induk, isian, node, usulan, akun, satuan, alias }) : []), [lv, induk, isian, node, usulan, akun, satuan, alias]);
  const lulus = semuaLulus(cek);
  const j = cariJalur(jalur, kodeLv, isian.sumber, isian.khusus);
  if (!lv) return null;

  const u = (p: Partial<Isian>) => { setPesan(null); hapusGalat(); setIsian((x) => ({ ...x, ...p })); };
  const ganti = (kode: string) => { setLv(kode); setPilihan({}); setIsian(isianKosong()); setPesan(null); hapusGalat(); };
  const pilihInduk = (t: string, v: string) => { setPesan(null); setPilihan({ ...pilihSah, [t]: v }); };

  const ketBoleh = bolehTulis === false
    ? (kew === "str_ppk" ? `Level ini diusulkan PPK (${lv.nama}). Masuk sebagai PPK untuk menyimpannya.` : "Hanya ketua tim, admin RO, atau PPK yang mengusulkan untuk RO ini.")
    : bolehTulis === null ? "Memeriksa kewenangan Anda..." : lulus ? "Siap disimpan sebagai draf usulan." : "Perbaiki butir bertanda merah.";
  const simpanOff = mengirim || bolehTulis !== true || !lulus || !j;

  const simpan = async () => {
    const ok = await kirim("keu_struktur_usul", argsUsul(kodeLv, induk, isian));
    if (ok) {
      setPesan(`Tersimpan sebagai draf usulan ${namaLevelPendek(lv.nama)}${butuhKode(kodeLv) ? ` ${isian.kode.trim().toUpperCase()}` : ""}. Jalur: ${j?.nama ?? "-"}. Lanjutkan (ajukan) dari daftar di bawah.`);
      setIsian((x) => ({ ...isianKosong(), sumber: x.sumber }));
    }
  };

  return (
    <div className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>1. Tambah satu baris pada level pilihan</h2>
        <span className="text-[12px] text-[#5B6B84]">Isi dari atas ke bawah; hasil pemeriksaan langsung tampil di kanan</span>
      </div>
      {pesan && <Tenang>{pesan}</Tenang>}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#DCE3EE] p-3">
          <div className="flex flex-col gap-1">
            <span className={caps}>Level yang ditambah</span>
            <div className="flex flex-wrap gap-1.5">
              {tampil.map((l) => <button key={l.kode} type="button" aria-pressed={l.kode === kodeLv} className={l.kode === kodeLv ? tombolAktif : tombolKecil} onClick={() => ganti(l.kode)}>{nomorLevel(level, l.kode)}. {namaLevelPendek(l.nama)}</button>)}
            </div>
            <span className="text-[12px] text-[#5B6B84]">Sebutan di laporan SAKTI: {lv.istilah_sakti}. Bentuk kode: {lv.format_ket}.</span>
          </div>

          {rantai.map((t, i) => {
            const opsi = opsiInduk(t, pilihSah, node, usulan);
            const terakhir = i === rantai.length - 1;
            const id = `ind-${t}`;
            return (
              <div key={t}>
                <label className={label} htmlFor={id}>{terakhir ? `Induk: ${NAMA_TINGKAT[t]}` : `${NAMA_TINGKAT[t]} (menyaring pilihan di bawahnya)`}</label>
                <select id={id} className={kolom} value={pilihSah[t] ?? ""} onChange={(e) => pilihInduk(t, e.target.value)}>
                  <option value="">{opsi.length ? `Pilih ${NAMA_TINGKAT[t]}` : `Tidak ada ${NAMA_TINGKAT[t]} pada pilihan di atas`}</option>
                  {opsi.map((o) => <option key={o.nilai} value={o.nilai}>{o.label}</option>)}
                </select>
              </div>
            );
          })}
          <div className="text-[12px] text-[#5B6B84]">Induk terpilih: <b className="text-[#1B2B4B]">{induk.teks}</b></div>

          <div className="flex flex-wrap gap-3">
            {butuhKode(kodeLv) && (
              <div className="min-w-[120px] flex-1">
                <label className={label} htmlFor="fk">Kode ({lv.format_ket.split(" (")[0]})</label>
                <input id="fk" className={`${kolom} font-mono`} maxLength={10} value={isian.kode} onChange={(e) => u({ kode: e.target.value.toUpperCase() })} />
              </div>
            )}
            <div className="min-w-[200px] flex-[2]">
              <label className={label} htmlFor="fu">Uraian</label>
              <input id="fu" className={kolom} maxLength={300} value={isian.uraian} onChange={(e) => u({ uraian: e.target.value })} />
            </div>
          </div>
          {butuhVolume(kodeLv) && (
            <div className="flex flex-wrap gap-3">
              <div className="min-w-[100px] flex-1"><label className={label} htmlFor="fv">Volume</label><input id="fv" className={kolom} inputMode="decimal" value={isian.volume} onChange={(e) => u({ volume: e.target.value.replace(/[^\d.,]/g, "").slice(0, 14) })} /></div>
              <div className="min-w-[100px] flex-1"><label className={label} htmlFor="fs">Satuan</label><input id="fs" className={kolom} maxLength={20} value={isian.satuan} onChange={(e) => u({ satuan: e.target.value })} /></div>
              {butuhHarga(kodeLv) && <div className="min-w-[140px] flex-1"><label className={label} htmlFor="fh">Harga satuan (Rp)</label><input id="fh" className={kolom} inputMode="decimal" value={isian.harga} onChange={(e) => u({ harga: e.target.value.replace(/[^\d.,]/g, "").slice(0, 16) })} /></div>}
            </div>
          )}
          {bolehKhusus(kodeLv) && (
            <div><button type="button" aria-pressed={isian.khusus} className={isian.khusus ? tombolAktif : tombolKecil} onClick={() => u({ khusus: !isian.khusus })}>Komponen Khusus (pemanfaatan atas keputusan Menteri atau Pimpinan Lembaga)</button></div>
          )}
          <div className="flex flex-col gap-1">
            <span className={caps}>Dari mana dananya</span>
            <div className="flex flex-wrap gap-1.5">
              {SUMBER_DANA.map((s) => <button key={s.kode} type="button" aria-pressed={isian.sumber === s.kode} className={isian.sumber === s.kode ? tombolAktif : tombolKecil} onClick={() => u({ sumber: s.kode })}>{s.nama}</button>)}
            </div>
          </div>
          <div><label className={label} htmlFor="fc">Catatan (opsional)</label><input id="fc" className={kolom} maxLength={300} value={isian.catatan} onChange={(e) => u({ catatan: e.target.value })} /></div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[#DCE3EE] p-3">
          <span className={caps}>Jalur kewenangan</span>
          {j ? (
            <>
              <div className="flex flex-wrap gap-1.5"><Chip warna={warnaJalur(j.jalur_kode)}>{j.nama}</Chip><Chip warna={warnaKepastian(j.kepastian)}>{teksKepastian(j.kepastian)}</Chip></div>
              <div className="text-[12.5px]"><b>Pemutus:</b> {j.pemutus}. <b>Tenggat:</b> {teksTenggat(waktu, j.tenggat_kode)}.</div>
              <div className="text-[12px] text-[#5B6B84]"><b>Dasar:</b> {j.dasar}</div>
              {(j.syarat ?? []).map((s) => <div key={s} className="text-[12px] text-[#5B6B84]">• {s}</div>)}
            </>
          ) : <Galat pesan={`Jalur untuk ${lv.nama} dengan sumber dana itu belum ada di Master jalur.`} />}
          <span className={`${caps} mt-1`}>Pemeriksaan isian</span>
          <ul className="flex flex-col gap-1.5">
            {cek.map((c, i) => <li key={i} className="flex items-start gap-2 text-[12.5px]"><Chip warna={c.ok ? "hijau" : "merah"}>{c.ok ? "Lulus" : "Perbaiki"}</Chip><span className="min-w-0 break-words">{c.t}</span></li>)}
          </ul>
          <Galat pesan={galat} />
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" disabled={simpanOff} className={tombolUtama} onClick={() => void simpan()}>{mengirim ? "Menyimpan..." : "Simpan sebagai baris usulan"}</button>
            <span className="text-[12px] text-[#5B6B84]">{ketBoleh}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
