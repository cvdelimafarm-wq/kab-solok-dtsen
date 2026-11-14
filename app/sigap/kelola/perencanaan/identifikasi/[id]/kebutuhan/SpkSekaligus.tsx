"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/kebutuhan/SpkSekaligus.tsx
//
// (14 Nov 2026, Fase 6) SPK semua mitra yang siap, terbit sekaligus (keu_ident_spk_sekaligus). Pratinjau dulu (tanpa menulis), lalu terbit dengan satu
// tanggal dan satu penandatangan. Nomor diambil dari register Arsip "spk" (atomik; dokumen yang sama selalu mendapat nomor yang sama). Syarat, hak, dan
// pemeriksaan penandatangan tetap di keu_ident_dokumen_simpan. Mitra yang belum bernama atau belum berperan dilewati dan ditampilkan.

import { useState } from "react";
import { Catatan, Galat, kolom, label, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import { aksiKeu, useKirim } from "@/app/sigap/ro/useKeu";
import type { PratinjauSpk } from "@/lib/keu/bayarEvaluasi";
import { Bagian } from "../../Kontrol";

type CalonTtd = { akun_id: number; akun_nama: string; peran_kode: string; ro_kode: string | null };
const JABATAN_BAWAAN: Record<string, string> = { KETUA: "Ketua Tim", PPK: "Pejabat Pembuat Komitmen", KPA: "Kepala BPS Kabupaten Solok", TU: "Tata Usaha" };
const NAMA_PERAN_TTD: Record<string, string> = { KETUA: "Ketua tim", PPK: "PPK", KPA: "Kepala (KPA)", TU: "Tata Usaha" };

export default function SpkSekaligus({ identId, calon, final, hariIni, sesudah }: { identId: number; calon: CalonTtd[]; final: boolean; hariIni: string; sesudah: () => Promise<void> }) {
  const [pra, setPra] = useState<PratinjauSpk | null>(null);
  const [hasil, setHasil] = useState<PratinjauSpk | null>(null);
  const [tanggal, setTanggal] = useState(hariIni);
  const [ttd, setTtd] = useState<number | null>(null);
  const [jabatan, setJabatan] = useState("");
  const kirim = useKirim(sesudah);
  const siap = pra?.siap ?? [];
  const kurang = !tanggal ? "Isi tanggal SPK." : ttd === null ? "Pilih penandatangan." : jabatan.trim().length < 3 ? "Isi jabatan penandatangan." : null;
  return (
    <Bagian huruf="A2" judul="SPK mitra sekaligus">
      <p className="m-0 text-[13px] text-[#44546F]">
        Terbitkan SPK semua mitra yang sudah bernama dan berperan dalam satu langkah. Nomor diambil dari register SPK di menu Arsip; periksa angka awal register bila kantor sudah menerbitkan SPK di luar SIGAP tahun ini.
      </p>
      {!final && <Catatan>Identifikasi lanjutan belum Final; SPK dapat dilihat pratinjaunya tetapi belum dapat diterbitkan.</Catatan>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tombolKecil} disabled={kirim.mengirim} onClick={async () => {
          setHasil(null);
          await kirim.jalankan(async () => {
            const r = await aksiKeu<PratinjauSpk>("keu_ident_spk_sekaligus", { p_ident: identId, p_uji: true });
            if (r.ok) setPra(r.data);
            return r;
          });
        }}>{pra ? "Muat ulang pratinjau" : "Lihat SPK yang siap terbit"}</button>
      </div>
      {pra && (
        <div className="flex flex-col gap-2 text-[13px]">
          <p className="m-0">{siap.length} SPK siap terbit · {pra.sudah_terbit} sudah terbit · {pra.lewat.length} dilewati.</p>
          {pra.lewat.length > 0 && (
            <ul className="m-0 list-disc pl-5 text-[12.5px] text-[#8A6200]">
              {pra.lewat.map((l) => <li key={l.kode}>{l.nama || l.kode}: {l.alasan}</li>)}
            </ul>
          )}
          {siap.length > 0 && final && (
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className={label} htmlFor="spk-tgl">Tanggal SPK</label>
                <input id="spk-tgl" type="date" className={kolom} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="spk-ttd">Penandatangan</label>
                <select id="spk-ttd" className={kolom} value={ttd ?? ""} onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setTtd(v);
                  const c = calon.find((x) => x.akun_id === v);
                  if (c && jabatan.trim() === "") setJabatan(JABATAN_BAWAAN[c.peran_kode] ?? "");
                }}>
                  <option value="">Pilih</option>
                  {calon.map((c) => <option key={`${c.akun_id}-${c.peran_kode}`} value={c.akun_id}>{c.akun_nama} · {NAMA_PERAN_TTD[c.peran_kode] ?? c.peran_kode}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="spk-jab">Jabatan penandatangan</label>
                <input id="spk-jab" className={kolom} value={jabatan} onChange={(e) => setJabatan(e.target.value)} maxLength={120} />
              </div>
            </div>
          )}
          {siap.length > 0 && final && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={tombolUtama} disabled={kirim.mengirim || !!kurang} onClick={async () => {
                await kirim.jalankan(async () => {
                  const r = await aksiKeu<PratinjauSpk>("keu_ident_spk_sekaligus", { p_ident: identId, p_tanggal: tanggal, p_ttd_akun: ttd, p_ttd_jabatan: jabatan.trim(), p_uji: false });
                  if (r.ok) { setHasil(r.data); setPra(null); }
                  return r;
                });
              }}>Terbitkan {siap.length} SPK</button>
              {kurang && <span className="text-[12px] text-[#8A6200]">{kurang}</span>}
            </div>
          )}
        </div>
      )}
      {kirim.galat && <Galat pesan={kirim.galat} />}
      {hasil?.terbit && (
        <Catatan>
          {hasil.terbit.length} SPK terbit: {hasil.terbit.slice(0, 6).map((t) => `${t.nama} (${t.nomor})`).join(", ")}{hasil.terbit.length > 6 ? `, dan ${hasil.terbit.length - 6} lainnya` : ""}.
        </Catatan>
      )}
    </Bagian>
  );
}
