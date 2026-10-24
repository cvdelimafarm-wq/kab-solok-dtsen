"use client";

// app/sigap/struktur/Daftar.tsx
//
// (24 Okt 2026, tahap 16) Bagian 2 papan 16: baris usulan struktur dengan status, jalur, dan tombol alur (ajukan, setujui ketua tim, sahkan, kembalikan, nyatakan diusulkan,
// catat ditolak pusat, padankan manual, ubah isian, batalkan). Tombol hanya dinyalakan bila pengguna berhak (kewenangan diperiksa lewat keu_boleh); yang memutuskan basis data.

import { useMemo, useState } from "react";
import { urlBaca } from "@/lib/keu/ro";
import {
  aksiTersedia, argsUbah, butuhHarga, butuhKode, butuhVolume, isianDariUsulan, kandidatItem, kandidatSimpul, keteranganStatus, namaLevelPendek, periksaAlasan, periksaNomorDokumen,
  STATUS_USULAN, teksJumlah, teksKepastian, warnaKepastian, SUMBER_DANA,
  type AksiUsulan, type DetailPok, type Hak, type Isian, type LevelStruktur, type NodeJalur, type UsulanStruktur,
} from "@/lib/keu/struktur";
import { Catatan, Chip, Galat, judulKartu, kartu, kolom, label, tombolBahaya, tombolKecil, tombolUtama } from "../keu-ui";
import { useBacaKeu, useKirim } from "../ro/useKeu";

type Sesudah = () => Promise<void>;

function indukResmiDari(u: UsulanStruktur, semua: UsulanStruktur[]): string | null {
  if (u.induk_usulan_id === null) return u.induk;
  return semua.find((x) => x.id === u.induk_usulan_id)?.kode_resmi ?? null;
}

function PadanManual({ u, semua, node, sesudah, tutup }: { u: UsulanStruktur; semua: UsulanStruktur[]; node: NodeJalur[]; sesudah: Sesudah; tutup: () => void }) {
  const induk = indukResmiDari(u, semua);
  const akunNode = u.level === "item" ? node.find((n) => n.tingkat === "akun" && n.jalur === induk) : undefined;
  const detail = useBacaKeu<DetailPok>(u.level === "item" && akunNode ? urlBaca("keu_pok_detail", { akun_node_id: akunNode.node_id }, { batas: 500, kolom: ["kunci_stabil", "uraian", "volume", "satuan", "harga_satuan", "jumlah", "nomor_item"] }) : null);
  const kandidat = useMemo(() => (u.level === "item" ? kandidatItem(detail.baris ?? [], semua) : kandidatSimpul(u, induk, node, semua)), [u, induk, node, semua, detail.baris]);
  const [resmi, setResmi] = useState("");
  const { kirim, mengirim, galat } = useKirim(sesudah);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#B7CDF5] bg-[#F7FAFE] p-3">
      <label className={label} htmlFor={`pd-${u.id}`}>Padankan dengan {u.level === "item" ? "item" : namaLevelPendek(u.level_nama)} resmi di POK berlaku</label>
      {induk === null ? <Catatan>Usulan induk belum aktif. Padankan dulu usulan induknya.</Catatan> : (
        <select id={`pd-${u.id}`} className={kolom} value={resmi} onChange={(e) => setResmi(e.target.value)}>
          <option value="">{kandidat.length ? "Pilih padanan" : detail.memuat ? "Memuat..." : "Tidak ada padanan yang tersedia"}</option>
          {kandidat.map((k) => <option key={k.nilai} value={k.nilai}>{k.label}</option>)}
        </select>
      )}
      <Galat pesan={detail.galat} />
      <Galat pesan={galat} />
      <div className="flex gap-2">
        <button type="button" disabled={mengirim || !resmi} className={tombolUtama} onClick={async () => { if (await kirim("keu_struktur_padankan", { p_id: u.id, p_resmi: resmi })) tutup(); }}>{mengirim ? "Memadankan..." : "Padankan"}</button>
        <button type="button" disabled={mengirim} className={tombolKecil} onClick={tutup}>Tutup</button>
      </div>
    </div>
  );
}

function UbahIsian({ u, sesudah, tutup }: { u: UsulanStruktur; sesudah: Sesudah; tutup: () => void }) {
  const [i, setI] = useState<Isian>(isianDariUsulan(u));
  const [salah, setSalah] = useState<string[]>([]);
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const p = (x: Partial<Isian>) => setI((v) => ({ ...v, ...x }));
  const simpan = async () => {
    const g: string[] = [];
    if (i.uraian.trim().length < 3) g.push("Uraian minimal 3 huruf.");
    setSalah(g);
    if (g.length) return;
    if (await kirim("keu_struktur_ubah", argsUbah(u, i))) tutup();
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#B7CDF5] bg-[#F7FAFE] p-3">
      <div className="flex flex-wrap gap-3">
        {butuhKode(u.level) && <div className="min-w-[110px] flex-1"><label className={label} htmlFor={`uk-${u.id}`}>Kode</label><input id={`uk-${u.id}`} className={`${kolom} font-mono`} maxLength={10} value={i.kode} onChange={(e) => p({ kode: e.target.value.toUpperCase() })} /></div>}
        <div className="min-w-[200px] flex-[2]"><label className={label} htmlFor={`uu-${u.id}`}>Uraian</label><input id={`uu-${u.id}`} className={kolom} maxLength={300} value={i.uraian} onChange={(e) => p({ uraian: e.target.value })} /></div>
      </div>
      {butuhVolume(u.level) && (
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[90px] flex-1"><label className={label} htmlFor={`uv-${u.id}`}>Volume</label><input id={`uv-${u.id}`} className={kolom} inputMode="decimal" value={i.volume} onChange={(e) => p({ volume: e.target.value.replace(/[^\d.,]/g, "") })} /></div>
          <div className="min-w-[90px] flex-1"><label className={label} htmlFor={`us-${u.id}`}>Satuan</label><input id={`us-${u.id}`} className={kolom} maxLength={20} value={i.satuan} onChange={(e) => p({ satuan: e.target.value })} /></div>
          {butuhHarga(u.level) && <div className="min-w-[130px] flex-1"><label className={label} htmlFor={`uh-${u.id}`}>Harga satuan (Rp)</label><input id={`uh-${u.id}`} className={kolom} inputMode="decimal" value={i.harga} onChange={(e) => p({ harga: e.target.value.replace(/[^\d.,]/g, "") })} /></div>}
        </div>
      )}
      <div>
        <label className={label} htmlFor={`ud-${u.id}`}>Sumber dana</label>
        <select id={`ud-${u.id}`} className={kolom} value={i.sumber} onChange={(e) => p({ sumber: e.target.value })}>{SUMBER_DANA.map((s) => <option key={s.kode} value={s.kode}>{s.nama}</option>)}</select>
      </div>
      <div><label className={label} htmlFor={`uc-${u.id}`}>Catatan</label><input id={`uc-${u.id}`} className={kolom} maxLength={300} value={i.catatan} onChange={(e) => p({ catatan: e.target.value })} /></div>
      <Galat pesan={[...salah, ...(galat ? [galat] : [])]} />
      <div className="flex gap-2">
        <button type="button" disabled={mengirim} className={tombolUtama} onClick={() => void simpan()}>{mengirim ? "Menyimpan..." : "Simpan perubahan"}</button>
        <button type="button" disabled={mengirim} className={tombolKecil} onClick={tutup}>Batal</button>
      </div>
    </div>
  );
}

function BarisUsulan({ u, level, hak, semua, node, sesudah }: { u: UsulanStruktur; level: LevelStruktur | undefined; hak: Hak; semua: UsulanStruktur[]; node: NodeJalur[]; sesudah: Sesudah }) {
  const st = STATUS_USULAN[u.status] ?? { nama: u.status, warna: "abu" as const };
  const aksi = aksiTersedia(u, level, hak);
  const [buka, setBuka] = useState<AksiUsulan["kode"] | null>(null);
  const [teks, setTeks] = useState("");
  const [salah, setSalah] = useState<string[]>([]);
  const { kirim, mengirim, galat, hapusGalat } = useKirim(sesudah);
  const tutup = () => { setBuka(null); setTeks(""); setSalah([]); hapusGalat(); };
  const aktif = aksi.find((a) => a.kode === buka);
  const ket = keteranganStatus(u);
  const tanpaForm = (a: AksiUsulan) => !a.butuhAlasan && !a.butuhNomor && a.kode !== "padankan" && a.kode !== "ubah";

  const jalankan = async (a: AksiUsulan) => {
    if (a.kode === "ajukan" || a.kode === "setuju_ketua" || a.kode === "sahkan") return void (await kirim("keu_struktur_aksi", { p_id: u.id, p_aksi: a.kode }));
    if (a.kode === "usulkan") {
      const g = periksaNomorDokumen(u, teks);
      setSalah(g);
      if (g.length) return;
      if (await kirim("keu_struktur_usulkan", { p_id: u.id, p_nomor_dokumen: teks.trim() || null })) tutup();
      return;
    }
    const g = periksaAlasan(teks);
    setSalah(g);
    if (g.length) return;
    const ok = a.kode === "tolak_pusat" ? await kirim("keu_struktur_tolak_pusat", { p_id: u.id, p_alasan: teks.trim() }) : await kirim("keu_struktur_aksi", { p_id: u.id, p_aksi: a.kode, p_catatan: teks.trim() });
    if (ok) tutup();
  };

  return (
    <div className={`flex flex-col gap-2 rounded-[10px] border border-[#DCE3EE] bg-white px-3 py-2.5 ${["dibatalkan", "ditolak_pusat"].includes(u.status) ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip warna="biru">{u.kode_sementara}</Chip>
          <b className="text-[13.5px] text-[#0F2A52]">{namaLevelPendek(u.level_nama)}</b>
          <span className="font-mono text-[13px] font-semibold text-[#1B2B4B]">{u.kode ?? "-"}</span>
          <span className="min-w-0 break-words text-[12.5px] text-[#5B6B84]">{u.uraian}</span>
        </div>
        <Chip warna={st.warna}>{st.nama}</Chip>
      </div>
      <div className="break-words text-[12px] text-[#5B6B84]">
        Induk {u.induk ?? "-"}. Jalur: {u.jalur_nama ?? u.jalur_kode}{u.kepastian !== "catatan" ? ` (${teksKepastian(u.kepastian).toLowerCase()})` : ""}.{teksJumlah(u)}{u.kode_resmi ? ` Kode resmi: ${u.kode_resmi}${u.cara_padan ? ` (${u.cara_padan === "sama" ? "kode sama" : "dipadankan manual"})` : ""}.` : ""}{u.nomor_dokumen ? ` Surat usulan: ${u.nomor_dokumen}.` : ""}
      </div>
      {u.status === "perlu_dipadankan" && <Catatan>{ket}</Catatan>}
      {u.status !== "perlu_dipadankan" && ket && <div className="text-[12px] text-[#5B6B84]">{ket}</div>}
      <Galat pesan={galat} />
      {aksi.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {aksi.map((a) => (
            <button
              key={a.kode}
              type="button"
              disabled={mengirim || !a.boleh}
              title={a.ket || undefined}
              className={a.utama ? tombolUtama : a.kode === "batal" ? tombolBahaya : tombolKecil}
              onClick={() => (tanpaForm(a) ? void jalankan(a) : (setBuka(buka === a.kode ? null : a.kode), setTeks(""), setSalah([])))}
            >
              {a.nama}
            </button>
          ))}
          {aksi.find((a) => !a.boleh && a.ket)?.ket && <span className="text-[12px] text-[#5B6B84]">{aksi.find((a) => !a.boleh && a.ket)?.ket}</span>}
        </div>
      )}
      {aktif && (aktif.butuhAlasan || aktif.butuhNomor) && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#B7CDF5] bg-[#F7FAFE] p-3">
          <label className={label} htmlFor={`al-${u.id}`}>{aktif.butuhNomor ? (u.jalur_kode === "pok" ? "Nomor surat/dokumen (opsional)" : `Nomor surat usulan ke ${u.jalur_kode.toUpperCase()}`) : "Alasan (minimal 5 huruf)"}</label>
          {aktif.butuhNomor ? <input id={`al-${u.id}`} className={kolom} maxLength={120} value={teks} onChange={(e) => setTeks(e.target.value)} /> : <textarea id={`al-${u.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={teks} onChange={(e) => setTeks(e.target.value)} />}
          <Galat pesan={salah} />
          <div className="flex gap-2">
            <button type="button" disabled={mengirim} className={aktif.kode === "batal" || aktif.kode === "tolak_pusat" ? tombolBahaya : tombolUtama} onClick={() => void jalankan(aktif)}>{mengirim ? "Menyimpan..." : aktif.nama}</button>
            <button type="button" disabled={mengirim} className={tombolKecil} onClick={tutup}>Kembali</button>
          </div>
        </div>
      )}
      {buka === "padankan" && <PadanManual u={u} semua={semua} node={node} sesudah={sesudah} tutup={tutup} />}
      {buka === "ubah" && <UbahIsian u={u} sesudah={sesudah} tutup={tutup} />}
    </div>
  );
}

export default function DaftarUsulan({ usulan, level, hak, node, boleh, cocok, sesudah, galatBaca }: {
  usulan: UsulanStruktur[]; level: LevelStruktur[]; hak: Hak; node: NodeJalur[]; boleh: boolean; cocok: () => Promise<{ ok: boolean; pesan: string }>; sesudah: Sesudah; galatBaca: string | null;
}) {
  const [hasil, setHasil] = useState<{ ok: boolean; pesan: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const adaMenunggu = usulan.some((u) => ["sah", "diusulkan", "perlu_dipadankan"].includes(u.status));
  return (
    <div className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>2. Baris usulan struktur</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[#5B6B84]">Kode sementara berganti kode resmi setelah POK resmi terbit</span>
          {boleh && adaMenunggu && (
            <button type="button" disabled={sibuk} className={tombolKecil} onClick={async () => { setSibuk(true); setHasil(null); setHasil(await cocok()); setSibuk(false); }}>
              {sibuk ? "Mencocokkan..." : "Cocokkan dengan POK berlaku"}
            </button>
          )}
        </div>
      </div>
      {hasil && <div role="status" className={`text-[12.5px] ${hasil.ok ? "text-[#14653A]" : "text-[#B42329]"}`}>{hasil.pesan}</div>}
      <Galat pesan={galatBaca} />
      {usulan.length === 0 && !galatBaca && <p className="text-[13px] text-[#5B6B84]">Belum ada baris usulan. Simpan satu dari bagian 1, mis. Item baru di Distribusi atau Akun baru.</p>}
      {usulan.map((u) => <BarisUsulan key={u.id} u={u} level={level.find((l) => l.kode === u.level)} hak={hak} semua={usulan} node={node} sesudah={sesudah} />)}
    </div>
  );
}
