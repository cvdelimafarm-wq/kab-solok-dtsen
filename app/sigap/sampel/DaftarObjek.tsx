"use client";

// app/sigap/sampel/DaftarObjek.tsx
//
// (8 Nov 2026, D3) "Sampel saya" di HP untuk kegiatan MODEL 2/3. Model 2: objek dikelompokkan per wilayah (kecamatan/nagari/jorong/sub SLS menurut profil kegiatan);
// model 3: satu daftar (atau hanya beban bila baris berjumlah). PPL mencatat HASIL per objek: didata, menolak, tidak ditemukan (baris berjumlah: berapa yang didata).
// PML hanya melihat, dikelompokkan per PPL, dengan rekap. Aturan sebenarnya ditegakkan server; layar ini mencerminkannya dan menampilkan penolakan apa adanya.
// Mencatat hasil butuh sinyal (tanpa antrean luring).

import { useState } from "react";
import { LABEL_HASIL_OBJEK, judulObjek, kelompokPplObjek, kelompokWilayahObjek, persenHasil, teksHasil, type DataObjekSaya, type HasilObjek, type KelompokObjek, type ObjekSaya, type RekapHasilObjek } from "@/lib/sampelObjek";
import { tautanPetaSampel } from "@/lib/sampelSls";

const TOMBOL = "grid min-h-[40px] place-items-center rounded-[10px] px-3 text-[12.5px] font-bold disabled:opacity-50";
const WARNA_HASIL: Record<HasilObjek, string> = {
  didata: "bg-[#E8F6EE] text-[#13794B]",
  menolak: "bg-[#FFF4D6] text-[#8A6200]",
  tidak_ditemukan: "bg-[#FDE8E8] text-[#B42329]",
};
const URUT_HASIL: HasilObjek[] = ["didata", "menolak", "tidak_ditemukan"];

function Angka({ nilai, label }: { nilai: number; label: string }) {
  return (
    <div className="flex-1 rounded-[12px] bg-white px-2 py-2 text-center shadow-[0_3px_10px_rgba(15,42,82,.06)]">
      <div className="text-[18px] font-extrabold leading-none text-[#0F2A52]">{nilai}</div>
      <div className="mt-1 text-[10.5px] font-semibold text-[#6B7A90]">{label}</div>
    </div>
  );
}

function RekapBaris({ r }: { r: RekapHasilObjek }) {
  return (
    <span className="flex flex-wrap gap-x-2 text-[11.5px] font-semibold text-[#55657D]">
      <span>{r.objek} baris</span>
      {r.sampel !== r.objek && <span>{r.sampel} sampel</span>}
      <span className="text-[#13794B]">{r.didata} didata</span>
      {r.menolak > 0 && <span className="text-[#8A6200]">{r.menolak} menolak</span>}
      {r.tidak_ditemukan > 0 && <span className="text-[#B42329]">{r.tidak_ditemukan} tidak ditemukan</span>}
      <span>{r.belum} belum</span>
    </span>
  );
}

export type AksiObjek = { bisaCatat: boolean; sibuk: boolean; onCatat: (hasil: HasilObjek | null, jumlahDidata: number | null) => void };

export function BarisObjek({ o, kolom, aksi }: { o: ObjekSaya; kolom: DataObjekSaya["kolom_atribut"]; aksi: AksiObjek }) {
  const berjumlah = o.nama_sampel == null && o.jumlah > 1;
  const [jumlah, setJumlah] = useState<string>(String(o.jumlah_didata ?? o.jumlah));
  const lat = typeof o.atribut.lat === "number" ? o.atribut.lat : null;
  const lng = typeof o.atribut.lng === "number" ? o.atribut.lng : null;
  const status = teksHasil(o);
  const didata = () => {
    const n = Number(jumlah);
    aksi.onCatat("didata", berjumlah ? (Number.isInteger(n) ? n : NaN) : null);
  };
  return (
    <li className="border-t border-[#EEF2F7] px-3 py-2.5 first:border-t-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-snug text-[#0F2A52]">
            {judulObjek(o)}
            {o.nama_sampel != null && o.jumlah > 1 && <span className="ml-1.5 text-[12px] font-semibold text-[#55657D]">({o.jumlah} sampel)</span>}
          </p>
          {kolom.map((k) => {
            const v = o.atribut[k.kunci];
            return v == null || v === "" ? null : (
              <p key={k.kunci} className="text-[12px] leading-snug text-[#55657D]">
                {k.judul}: {String(v)}
              </p>
            );
          })}
        </div>
        {status && o.hasil && <span className={`flex-none rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${WARNA_HASIL[o.hasil]}`}>{status}</span>}
      </div>

      {lat != null && lng != null && (
        <a href={tautanPetaSampel(lat, lng)} target="_blank" rel="noopener noreferrer" className={`${TOMBOL} mt-1.5 inline-grid bg-[#EAF1FC] text-[#1F5FD1] active:bg-[#DCE8FB]`} aria-label={`Arahkan ke ${judulObjek(o)}`}>
          Arahkan
        </a>
      )}

      {aksi.bisaCatat && (
        <div className="mt-2">
          {berjumlah && (
            <label className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-[#44546F]">
              Jumlah didata
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={o.jumlah}
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
                className="h-9 w-20 rounded-[8px] border border-[#CBD6E6] px-2 text-center text-[14px] font-bold text-[#0F2A52]"
                aria-label={`Jumlah didata, 1 sampai ${o.jumlah}`}
              />
              <span className="font-normal text-[#6B7A90]">dari {o.jumlah}</span>
            </label>
          )}
          <div className="flex flex-wrap gap-1.5">
            {URUT_HASIL.map((h) => (
              <button
                key={h}
                type="button"
                disabled={aksi.sibuk}
                onClick={() => (h === "didata" ? didata() : aksi.onCatat(h, null))}
                className={`${TOMBOL} ${o.hasil === h ? WARNA_HASIL[h] + " ring-2 ring-current" : "bg-[#EEF2F7] text-[#1B2B4B] active:bg-[#E0E7F1]"}`}
                aria-pressed={o.hasil === h}
              >
                {LABEL_HASIL_OBJEK[h]}
              </button>
            ))}
            {o.hasil && (
              <button type="button" disabled={aksi.sibuk} onClick={() => aksi.onCatat(null, null)} className={`${TOMBOL} bg-white text-[#55657D] ring-1 ring-[#CBD6E6] active:bg-[#F2F6FC]`}>
                Hapus catatan
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function KartuKelompok({ g, kolom, aksiDari, terbukaAwal, judulPenting = true }: { g: KelompokObjek; kolom: DataObjekSaya["kolom_atribut"]; aksiDari: (o: ObjekSaya) => AksiObjek; terbukaAwal: boolean; judulPenting?: boolean }) {
  return (
    <details className="overflow-hidden rounded-[18px] bg-white shadow-[0_3px_10px_rgba(15,42,82,.06)]" open={terbukaAwal}>
      <summary className="cursor-pointer list-none px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={`min-w-0 text-[14.5px] leading-snug text-[#0F2A52] ${judulPenting ? "font-extrabold" : "font-bold"}`}>{g.judul}</h3>
          <span className="flex-none text-[11.5px] font-bold text-[#1F5FD1]">{persenHasil(g.rekap)}%</span>
        </div>
        <RekapBaris r={g.rekap} />
      </summary>
      <ul>
        {g.objek.map((o) => (
          <BarisObjek key={o.id} o={o} kolom={kolom} aksi={aksiDari(o)} />
        ))}
      </ul>
    </details>
  );
}

export default function DaftarObjek({ data, luring, catat }: { data: DataObjekSaya; luring: boolean; catat: (objekId: number, hasil: HasilObjek | null, jumlahDidata: number | null) => Promise<void> }) {
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const berwilayah = !!data.profil.level;
  const ppl = data.peran === "ppl";
  const bisaCatat = ppl && !luring;

  async function kirim(o: ObjekSaya, hasil: HasilObjek | null, jumlahDidata: number | null) {
    if (sibuk) return;
    if (hasil === "didata" && o.nama_sampel == null && o.jumlah > 1 && (jumlahDidata == null || Number.isNaN(jumlahDidata) || jumlahDidata < 1 || jumlahDidata > o.jumlah)) {
      setPesan({ jenis: "galat", teks: `Jumlah didata harus bilangan bulat 1-${o.jumlah}.` });
      return;
    }
    setSibuk(true);
    setPesan(null);
    try {
      await catat(o.id, hasil, jumlahDidata);
      setPesan({ jenis: "ok", teks: hasil ? `${judulObjek(o)}: ${LABEL_HASIL_OBJEK[hasil]}.` : `Catatan ${judulObjek(o)} dihapus.` });
    } catch (e) {
      setPesan({ jenis: "galat", teks: e instanceof Error ? e.message : "Hasil gagal dicatat." });
    } finally {
      setSibuk(false);
    }
  }

  const aksiDari = (o: ObjekSaya): AksiObjek => ({ bisaCatat, sibuk, onCatat: (h, n) => void kirim(o, h, n) });
  const r = data.rekap;

  if (data.objek.length === 0) {
    return <p className="rounded-[18px] bg-white px-4 py-8 text-center text-[13.5px] leading-snug text-[#55657D]">Belum ada sampel yang dialokasikan kepada Anda pada kegiatan ini. Hubungi admin kegiatan bila ini keliru.</p>;
  }

  return (
    <section className="space-y-2.5" aria-label="Sampel saya">
      <div className="px-1">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">{ppl ? "Sampel saya" : "Sampel PPL saya"}</h2>
        <p className="text-[12px] leading-snug text-[#55657D]">
          {berwilayah ? "Dikelompokkan per wilayah. " : ""}
          {ppl ? "Catat hasil tiap sampel setelah didatangi." : "Hanya melihat; hasil dicatat oleh PPL."}
        </p>
      </div>
      {ppl && luring && <p className="rounded-[14px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-semibold text-[#8A6200]">Tidak tersambung. Mencatat hasil butuh sinyal; daftar di bawah adalah salinan terakhir.</p>}
      {pesan && (
        <p role="status" className={`rounded-[14px] px-3 py-2 text-[13px] font-semibold ${pesan.jenis === "ok" ? "bg-[#E8F6EE] text-[#13794B]" : "border-l-4 border-[#B42329] bg-[#FDE8E8] text-[#7A1D22]"}`}>
          {pesan.teks}
        </p>
      )}
      <div className="flex gap-2">
        <Angka nilai={r.sampel} label="Sampel" />
        <Angka nilai={r.sampel_didata} label="Didata" />
        <Angka nilai={r.menolak + r.tidak_ditemukan} label="Menolak/tdk ada" />
        <Angka nilai={r.belum} label="Belum" />
      </div>

      {ppl && kelompokWilayahObjek(data.objek, berwilayah).map((g, i, semua) => <KartuKelompok key={g.kunci} g={g} kolom={data.kolom_atribut} aksiDari={aksiDari} terbukaAwal={semua.length <= 2 || i === 0} />)}

      {!ppl &&
        kelompokPplObjek(data.objek, berwilayah).map((p) => (
          <section key={p.ppl_id ?? "-"} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-1 pt-1">
              <h2 className="min-w-0 truncate text-[14px] font-extrabold text-[#0F2A52]">{p.ppl_nama}</h2>
              <span className="flex-none text-[11.5px] font-semibold text-[#55657D]">
                {p.rekap.sampel} sampel · {persenHasil(p.rekap)}% ada hasil
              </span>
            </div>
            {p.kelompok.map((g) => (
              <KartuKelompok key={g.kunci} g={g} kolom={data.kolom_atribut} aksiDari={aksiDari} terbukaAwal={false} judulPenting={false} />
            ))}
          </section>
        ))}
    </section>
  );
}
