"use client";

// app/sigap/kelola/pendataan/Siaran.tsx
//
// (13 Okt 2026) Siaran ke petugas pendataan (PML/PPL/korwil): kirim notifikasi push dan/atau tampilkan modal yang cukup dikonfirmasi satu kali.
// Pengiriman dua langkah (Kirim -> Ya, kirim) agar tidak terkirim tak sengaja. Modal otomatis berhenti tampil 14 hari sesudah dikirim.

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { ModalPengumuman } from "@/app/sigap/pelatihan/pengumumanUi";
import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH } from "@/lib/sigapPushUtil";
import { HARI_MODAL_SIARAN } from "@/lib/siaranPetugas";
import type { JenisPengumuman } from "@/lib/sigapPengumuman";

type Riwayat = { waktu: string; judul: string; oleh: string | null; akun: number; terkirim: number; modal: boolean; sudah_konfirmasi: number };
type Ringkas = { push_siap: boolean; penerima: number; berlangganan: number; riwayat: Riwayat[]; boleh_kirim: boolean };
type Hasil = { akun: number; tanpa_notifikasi: number; perangkat: number; terkirim: number; gagal: number; modal: boolean; push: boolean };

const AWAL = {
  judul: "Data keluarga sudah tersedia",
  isi: "Data keluarga sudah tersedia. PML silakan pilih 2 Sub SLS untuk didata hari ini, nanti kami assign ke FASIH. Upayakan pendataan awal ini dengan keroyokan: daftar keluarga akan di-assign ke salah satu akun PPL.",
  mJudul: "DATA KELUARGA SUDAH TERSEDIA",
  mIsi: "**Data keluarga sudah tersedia.**\n\n- PML silakan pilih **2 Sub SLS** untuk didata hari ini, nanti kami assign ke FASIH (pilih lewat kartu \"Plotting tim hari ini\" di Lembar Pendataan)\n- PPL bisa melihat pilihan dan statusnya di kartu yang sama\n- ==Upayakan pendataan awal ini dengan keroyokan==\n- ==Daftar keluarga akan di-assign ke salah satu akun PPL==",
};

const waktuTeks = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(".", ":") + " WIB";

export default function Siaran() {
  const [r, setR] = useState<Ringkas | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [push, setPush] = useState(true);
  const [modal, setModal] = useState(true);
  const [judul, setJudul] = useState(AWAL.judul);
  const [isi, setIsi] = useState(AWAL.isi);
  const [mJudul, setMJudul] = useState(AWAL.mJudul);
  const [mIsi, setMIsi] = useState(AWAL.mIsi);
  const [jenis, setJenis] = useState<JenisPengumuman>("info");
  const [yakin, setYakin] = useState(false);
  const [kirim, setKirim] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);

  const muat = useCallback(async () => {
    try {
      setR(await apiPortal<Ringkas>("/api/portal/siaran-petugas?ringkas=1"));
      setGalat(null);
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal memuat ringkasan siaran.");
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);

  async function kirimSekarang() {
    if (kirim) return;
    setKirim(true);
    setGalat(null);
    setHasil(null);
    try {
      const h = await apiPortal<Hasil & { ok: boolean }>("/api/portal/siaran-petugas", {
        method: "POST",
        body: JSON.stringify({ aksi: "siarkan", kirim_push: push, judul, isi, url: "/sigap/pendataan", modal: { aktif: modal, judul: mJudul, isi: mIsi, jenis } }),
      });
      setHasil(h);
      setYakin(false);
      await muat();
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengirim siaran. Periksa sambungan lalu coba lagi.");
      setYakin(false);
    } finally {
      setKirim(false);
    }
  }

  const kolom = "mt-1 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14px] text-[#1B2B4B]";
  const boleh = !!r?.boleh_kirim;
  const sah = (push || modal) && (!push || (judul.trim() && isi.trim())) && (!modal || (mJudul.trim() && mIsi.trim()));

  return (
    <section className="mt-5 rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Siaran ke petugas pendataan</h2>
      <p className="mt-1 text-[12.5px] leading-snug text-[#55657D]">
        Kirim notifikasi ke HP seluruh petugas yang ditugaskan di Pendataan Pascabencana (korwil, PML, PPL) dan/atau munculkan modal di halaman tahap Pendataan. Modal cukup dikonfirmasi satu kali (&quot;Saya mengerti&quot;) lalu hilang, dan berhenti tampil otomatis {HARI_MODAL_SIARAN} hari kemudian.
      </p>
      {r && (
        <p className="mt-2 rounded-[12px] bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#55657D]">
          Penerima: <b>{r.penerima}</b> petugas · sudah mengaktifkan notifikasi: <b>{r.berlangganan}</b>. Sisanya hanya melihat modal saat membuka aplikasi.
          {!r.push_siap && <b className="mt-1 block text-[#B42329]">Kunci VAPID belum terpasang di server, notifikasi belum bisa dikirim.</b>}
        </p>
      )}
      {galat && <p className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}

      <label className="mt-3 flex items-center gap-2 text-[13.5px] font-bold text-[#0F2A52]">
        <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="h-5 w-5" /> Kirim notifikasi push
      </label>
      {push && (
        <div className="mt-2">
          <label className="block text-[12px] font-bold text-[#55657D]">
            Judul notifikasi ({judul.length}/{MAKS_JUDUL_PUSH})
            <input value={judul} maxLength={MAKS_JUDUL_PUSH} onChange={(e) => setJudul(e.target.value)} className={kolom} />
          </label>
          <label className="mt-2 block text-[12px] font-bold text-[#55657D]">
            Isi notifikasi ({isi.length}/{MAKS_ISI_PUSH})
            <textarea value={isi} maxLength={MAKS_ISI_PUSH} rows={4} onChange={(e) => setIsi(e.target.value)} className={kolom} />
          </label>
        </div>
      )}

      <label className="mt-4 flex items-center gap-2 text-[13.5px] font-bold text-[#0F2A52]">
        <input type="checkbox" checked={modal} onChange={(e) => setModal(e.target.checked)} className="h-5 w-5" /> Tampilkan modal (sekali konfirmasi)
      </label>
      {modal && (
        <div className="mt-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block text-[12px] font-bold text-[#55657D]">
              Judul modal
              <input value={mJudul} maxLength={120} onChange={(e) => setMJudul(e.target.value)} className={kolom} />
            </label>
            <label className="block text-[12px] font-bold text-[#55657D]">
              Jenis
              <select value={jenis} onChange={(e) => setJenis(e.target.value as JenisPengumuman)} className={`${kolom} min-h-[42px]`}>
                <option value="info">Info</option>
                <option value="perhatian">Perhatian</option>
                <option value="penting">Penting</option>
              </select>
            </label>
          </div>
          <label className="mt-2 block text-[12px] font-bold text-[#55657D]">
            Isi modal (**tebal**, ==sorot==, baris &quot;- &quot; = daftar)
            <textarea value={mIsi} maxLength={2000} rows={6} onChange={(e) => setMIsi(e.target.value)} className={kolom} />
          </label>
          <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">Pratinjau</p>
          <div className="mt-1">
            <ModalPengumuman d={{ jenis, judul: mJudul, isi: mIsi, tombol_label: null, tombol_url: null }} posisi={1} jumlah={1} lanjut={() => undefined} sebagaiPratinjau />
          </div>
        </div>
      )}

      {boleh ? (
        !yakin ? (
          <button type="button" disabled={!sah || kirim} onClick={() => { setYakin(true); setHasil(null); }} className="mt-4 min-h-[50px] w-full rounded-[14px] bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:bg-[#A9BCD8]">
            Kirim siaran…
          </button>
        ) : (
          <div className="mt-4 rounded-[14px] border border-[#F2D58A] bg-[#FFF6E0] p-3">
            <p className="text-[13px] font-bold text-[#6B4A0E]">
              Kirim ke {r?.penerima ?? "semua"} petugas pendataan sekarang? {push ? "Notifikasi" : ""}
              {push && modal ? " dan modal" : modal ? "Modal" : ""} tidak bisa ditarik kembali.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setYakin(false)} className="min-h-[46px] rounded-[12px] bg-white text-[13.5px] font-extrabold text-[#0F2A52] shadow-sm">
                Batal
              </button>
              <button type="button" disabled={kirim} onClick={() => void kirimSekarang()} className="min-h-[46px] rounded-[12px] bg-[#13794B] text-[13.5px] font-extrabold text-white disabled:bg-[#9FCDB5]">
                {kirim ? "Mengirim…" : "Ya, kirim"}
              </button>
            </div>
          </div>
        )
      ) : (
        r && <p className="mt-4 text-[12.5px] text-[#6B7A90]">Akun ini hanya boleh melihat riwayat; mengirim butuh izin kelola pendataan.</p>
      )}

      {hasil && (
        <p className="mt-3 rounded-[12px] bg-[#E3F6EC] px-3 py-2 text-[13px] font-semibold text-[#13794B]">
          Terkirim.{hasil.push ? ` Notifikasi masuk ke ${hasil.terkirim} perangkat (${hasil.akun - hasil.tanpa_notifikasi} petugas); ${hasil.tanpa_notifikasi} petugas belum mengaktifkan notifikasi${hasil.gagal ? `, ${hasil.gagal} perangkat gagal` : ""}.` : ""}
          {hasil.modal ? " Modal akan muncul saat petugas membuka halaman tahap Pendataan." : ""}
        </p>
      )}

      {r && r.riwayat.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">Riwayat siaran</p>
          <ul className="mt-1.5 overflow-hidden rounded-[14px] border border-[#EEF2F7]">
            {r.riwayat.map((x, i) => (
              <li key={i} className="border-t border-[#EEF2F7] px-3 py-2 first:border-t-0">
                <b className="block text-[13px] text-[#1B2B4B]">{x.judul}</b>
                <span className="block text-[11.5px] text-[#6B7A90]">
                  {waktuTeks(x.waktu)}
                  {x.oleh ? ` · ${x.oleh}` : ""} · {x.terkirim} perangkat{x.modal ? ` · ${x.sudah_konfirmasi}/${x.akun} sudah menekan "Saya mengerti"` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
