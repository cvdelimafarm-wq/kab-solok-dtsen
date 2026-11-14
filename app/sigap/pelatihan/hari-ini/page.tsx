"use client";

// app/sigap/pelatihan/hari-ini/page.tsx
//
// (2 Nov 2026) Tab "Hari ini" pelatihan (tampilan 5 tab): kartu undangan (terima/tolak setelah membaca ketentuan), unduh surat undangan PDF, dan kartu Vanguard.
// Kartu kedatangan (hari pertama) dan absen sesi: AbsenPeserta.tsx; tab "Absen peserta" untuk pengelola: absen/page.tsx. Halaman ini hanya bermakna bila saklar tab_baru menyala; bila belum, peserta
// yang membukanya langsung tetap melihat undangan dan kartunya (tidak ada data yang rusak), sedangkan bilah tab tidak muncul.
// (2 Nov 2026) Kartu nomor pulsa (redup) di bagian bawah.
// (2 Nov 2026) Bagi panitia / instruktur: kartu "Permintaan buka kunci (n)" (KartuIzinBuka.tsx), tampil hanya bila ada permintaan menunggu.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { bukaBlob, fetchJson, pesanGalat } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Kartu, Memuat, Pesan } from "../../admin/ui";
import KartuVanguardHariIni from "../../KartuVanguardHariIni";
import KartuRoleplayHariIni from "../../KartuRoleplayHariIni"; // (8 Nov 2026) Roleplaying by Vanguard (langkah 8)
import KartuAgendaSesi from "../KartuAgendaSesi"; // (9 Nov 2026) Agenda sesi: instruktur memulai/menyelesaikan Pretest dan Posttest kelasnya
import AbsenPeserta from "../AbsenPeserta";
import AbsenTanpaSinyal from "../AbsenTanpaSinyal"; // (14 Nov 2026) luring 3d
import KartuIzinBuka from "../KartuIzinBuka";
import { Kerangka } from "../komponen";
import { PulsaPeserta } from "../pulsa";
import { TeksBaris } from "../TeksBaris";
import { useInfoPelatihan } from "../infoPelatihan";
import { useDataPel } from "../dataPel";
import RingkasanPengelola from "../RingkasanPengelola"; // (3 Nov 2026) isi Hari ini untuk instruktur / panitia (bukan peserta)
import KartuKuis from "../KartuKuis"; // (3 Nov 2026) kartu kuis selalu tampil
import KartuJadwalPendataan from "../KartuJadwalPendataan"; // (3 Nov 2026) jadwal pendataan dari Identifikasi survei
import { tandaBasi } from "@/app/portal/dataBersama";
import { usePeranMasuk } from "../peranMasuk"; // (3 Nov 2026) "Masuk sebagai"
import { LABEL_PERAN } from "@/lib/peranMasuk";
import { useVanguardSaya } from "../../vanguardSaya"; // (3 Nov 2026) Vanguard didahulukan bila perlu perhatian
import type { JadwalPendataanKartu } from "@/lib/jadwalPendataanTampil";
import { bacaLangkahDariAlamat } from "@/lib/alurPelatihan";
import { judulPelatihan } from "@/lib/sigapPelatihanNama";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { lupakanBenderaTab } from "../TabPelatihan";
import { MAKS_ALASAN } from "@/lib/ketentuanPelatihan";
import type { StatusUndangan, TeksKartuUndangan } from "@/lib/ketentuanPelatihan";

type Data = {
  kegiatan_id: number;
  tab_baru: boolean;
  ketentuan: { butir: string[]; versi: number };
  undangan: { hari_tanggal: string; pukul: string; tempat: string; tanggal_iso: string; pdf: string };
  peserta: { peran: string; kelas: number | null } | null;
  /** (3 Nov 2026) jadwal pendataan dari Identifikasi survei yang tertaut; null = tidak ada / bukan peserta. */
  jadwal_pendataan?: JadwalPendataanKartu | null;
  /** (3 Nov 2026) tanggal kegiatan pelatihan (untuk linimasa Jadwal Anda); null = belum diisi */
  jadwal_pelatihan?: { mulai: string; selesai: string | null } | null;
  respons: { respons: "terima" | "tolak"; alasan: string | null } | null;
  /** (3 Nov 2026) jenis pengguna di mata hierarki: panitia / instruktur / peserta */
  pengguna?: "panitia" | "instruktur" | "peserta";
  /** (3 Nov 2026) gerbang undangan: peserta belum menerima undangan -> hanya kartu undangan yang tampil */
  terkunci_undangan?: boolean;
  /** (3 Nov 2026) akun ini sudah menolak undangan dan dikeluarkan dari pelatihan */
  ditolak?: boolean;
  status: StatusUndangan;
  berubah: boolean;
  kartu: TeksKartuUndangan;
  kamera_href: string | null;
  boleh_lihat_kelola: boolean;
  boleh_kelola: boolean;
};

const NADA: Record<TeksKartuUndangan["nada"], { kotak: string; chip: string; tombol: string }> = {
  emas: { kotak: "border-[#F4D78A] bg-[#FFFBEF]", chip: "bg-[#FFF4D6] text-[#8A6200]", tombol: BTN },
  hijau: { kotak: "border-[#BFE5D0] bg-[#F3FBF7]", chip: "bg-[#E3F6EC] text-[#13794B]", tombol: BTN_O },
  merah: { kotak: "border-[#F0C4BF] bg-[#FFF6F5]", chip: "bg-[#FDE8E8] text-[#B42329]", tombol: BTN_O },
};

function ModalKetentuan({ d, onTutup, onSelesai }: { d: Data; onTutup: () => void; onSelesai: () => void }) {
  const [setuju, setSetuju] = useState(false);
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const sudahTerima = d.status === "diterima";
  useTutupDenganBack(true, onTutup); // Back HP menutup modal ketentuan (penjaga Back, lib/__tests__/sigapBackGuard.test.ts)

  useEffect(() => {
    const tombol = (e: KeyboardEvent) => e.key === "Escape" && onTutup();
    window.addEventListener("keydown", tombol);
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tombol);
      document.body.style.overflow = lama;
    };
  }, [onTutup]);

  async function jawab(respons: "terima" | "tolak") {
    setKirim(true);
    setGalat(null);
    try {
      await fetchJson("/api/sigap/pelatihan/ketentuan", { method: "POST", body: JSON.stringify({ aksi: "respons", respons, setuju, alasan }) });
      onSelesai();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setKirim(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Ketentuan pelatihan" onClick={onTutup}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-white p-5 shadow-2xl sm:rounded-[22px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-extrabold text-[#0F2A52]">Ketentuan pelatihan</h2>
        <dl className="mt-3 rounded-xl bg-[#F3F6FB] p-3 text-[13.5px]">
          <div className="flex gap-3 py-1">
            <dt className="w-16 shrink-0 text-[#6B7A90]">Waktu</dt>
            <dd className="font-semibold">
              {d.undangan.hari_tanggal}
              {d.undangan.pukul ? `, ${d.undangan.pukul}` : ""}
            </dd>
          </div>
          <div className="flex gap-3 py-1">
            <dt className="w-16 shrink-0 text-[#6B7A90]">Tempat</dt>
            <dd className="font-semibold">{d.undangan.tempat || "Akan diinformasikan"}</dd>
          </div>
        </dl>
        {d.ketentuan.butir.length > 0 ? (
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
            {d.ketentuan.butir.map((b, i) => (
              <li key={i}>
                <TeksBaris teks={b} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-[13px] text-[#6B7A90]">Belum ada ketentuan tambahan dari penanggung jawab.</p>
        )}
        {d.respons?.respons === "tolak" && d.respons.alasan && <p className="mt-3 text-[12.5px] text-[#7A1D22]">Alasan penolakan Anda: {d.respons.alasan}</p>}

        {d.peserta && !sudahTerima && !tolak && (
          <label className="mt-4 flex items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={setuju} onChange={(e) => setSetuju(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1F5FD1]" />
            <span>Saya sudah membaca dan menyetujui ketentuan pelatihan ini.</span>
          </label>
        )}
        {d.peserta && tolak && (
          <div className="mt-4">
            <Pesan jenis="peringatan">Dengan menolak, nama Anda dikeluarkan dari pelatihan ini dan kartunya hilang dari Beranda. Panitia akan mencari pengganti.</Pesan>
            <label htmlFor="alasan-tolak" className="text-[13px] font-semibold">
              Alasan menolak
            </label>
            <textarea
              id="alasan-tolak"
              value={alasan}
              maxLength={MAKS_ALASAN}
              onChange={(e) => setAlasan(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#CBD6E6] p-2.5 text-[14px]"
              placeholder="Contoh: berhalangan karena tugas lain"
            />
          </div>
        )}
        {galat && (
          <div className="mt-3">
            <Pesan jenis="galat">{galat}</Pesan>
          </div>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_O} onClick={onTutup} disabled={kirim}>
            Tutup
          </button>
          {d.peserta && !sudahTerima && !tolak && (
            <>
              <button type="button" className={BTN_R} onClick={() => setTolak(true)} disabled={kirim}>
                Tolak
              </button>
              <button type="button" className={BTN} onClick={() => jawab("terima")} disabled={kirim || !setuju}>
                {kirim ? "Menyimpan…" : "Terima undangan"}
              </button>
            </>
          )}
          {d.peserta && tolak && (
            <>
              <button type="button" className={BTN_O} onClick={() => setTolak(false)} disabled={kirim}>
                Batal
              </button>
              <button type="button" className={BTN_R} onClick={() => jawab("tolak")} disabled={kirim || alasan.trim().length < 3}>
                {kirim ? "Menyimpan…" : "Kirim penolakan"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HalamanHariIni() {
  // (3 Nov 2026) Lewat simpanan bersama (dataPel.ts): pindah ke tab ini langsung menampilkan data terakhir, lalu diperbarui di belakang (tab lain memakai jawaban yang sama untuk bilah).
  const { data: d, galat, muat: muatUlang } = useDataPel<Data>("/api/sigap/pelatihan/ketentuan");
  const [buka, setBuka] = useState(false);
  const [unduh, setUnduh] = useState(false);
  const [galatPdf, setGalatPdf] = useState<string | null>(null);

  const muat = useCallback(() => {
    void muatUlang();
  }, [muatUlang]);

  async function bukaPdf() {
    setUnduh(true);
    setGalatPdf(null);
    try {
      await bukaBlob("/api/sigap/pelatihan/undangan");
    } catch (e) {
      setGalatPdf(pesanGalat(e));
    } finally {
      setUnduh(false);
    }
  }

  // (3 Nov 2026) ?langkah=<kode> (dari ikon langkah di halaman lain): gulirkan ke kartunya setelah data tiba, lalu bersihkan alamat
  const peserta = !!d?.peserta;
  useEffect(() => {
    if (!peserta) return;
    const k = bacaLangkahDariAlamat(new URLSearchParams(window.location.search).get("langkah"));
    if (!k) return;
    window.history.replaceState(null, "", window.location.pathname);
    const gulir = () => document.getElementById(`langkah-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t1 = setTimeout(gulir, 400);
    const t2 = setTimeout(gulir, 1400); // kartu absen / kuis memuat sendiri; coba sekali lagi
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [peserta]);

  const nada = d ? NADA[d.kartu.nada] : null;
  // (3 Nov 2026) akun berperan ganda: isi Hari ini mengikuti peran yang dipilih di dropdown "Masuk sebagai" (tanpa peran ganda: seperti biasa)
  const pm = usePeranMasuk();
  const sebagaiPeserta = !!d?.peserta && (pm.peran === null || pm.peran === "peserta");
  const terkunciUndangan = sebagaiPeserta && pm.terkunci;
  const pratinjauPeserta = !!d && !d.peserta && pm.peran === "peserta"; // pengelola memilih Peserta padahal belum terdaftar sebagai peserta
  const sebagaiPengelola = !!d && !pratinjauPeserta && ((!d.peserta && !d.ditolak && d.pengguna !== "peserta") || (!!d.peserta && pm.peran !== null && pm.peran !== "peserta") || (!d.peserta && pm.peran !== null));
  const info = useInfoPelatihan();
  const vg = useVanguardSaya(sebagaiPeserta && !terkunciUndangan && d ? d.kegiatan_id : null); // terkunci: Vanguard belum dimuat
  return (
    <Kerangka aktif="hari-ini" geser judul="Hari ini" sub={d ? `${d.undangan.hari_tanggal}${d.undangan.tempat ? ` · ${d.undangan.tempat}` : ""}` : undefined}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!d && !galat && <Memuat />}
      {d && !d.peserta && d.ditolak && (
        <Kartu judul="Anda menolak undangan ini">
          <p className="m-0 text-[13.5px] leading-relaxed text-[#3B4A60]">
            Nama Anda sudah dikeluarkan dari pelatihan ini dan kartunya dihapus dari Beranda.
            {d.respons?.alasan ? ` Alasan Anda: ${d.respons.alasan}.` : ""} Bila keputusan berubah, hubungi panitia.
          </p>
        </Kartu>
      )}
      {d && !d.peserta && !d.ditolak && d.pengguna === "peserta" && <Pesan jenis="info">Akun Anda bukan peserta pelatihan ini.</Pesan>}
      {d && pratinjauPeserta && <Pesan jenis="info">Anda belum terdaftar sebagai peserta pelatihan ini, jadi tampilan peserta tidak ada isinya. Pilih peran lain di "Masuk sebagai", atau daftarkan diri Anda sebagai peserta di Kelola Pelatihan.</Pesan>}
      {d && sebagaiPengelola && <RingkasanPengelola bolehKelola={d.boleh_lihat_kelola} sebagai={pm.peran ? LABEL_PERAN[pm.peran] : undefined} />}
      {d && !terkunciUndangan && <KartuAgendaSesi kegiatanId={d.kegiatan_id} />}
      {/* (9 Nov 2026) instruktur/panitia/PJ: kartu Roleplaying by Vanguard (buka sesi, periksa, pemetaan). Sebelumnya hanya digambar di blok peserta, jadi akun pengelola tidak melihatnya. */}
      {d && !terkunciUndangan && sebagaiPengelola && <KartuRoleplayHariIni kegiatanId={d.kegiatan_id} />}
      {d && !terkunciUndangan && <KartuIzinBuka />}
      {d && sebagaiPeserta && nada && (
        <>
          {/* (3 Nov 2026) Vanguard yang perlu perhatian sekarang disorot dan didahulukan (di atas undangan); selain itu tetap di bawah undangan */}
          {vg.mendesak && !terkunciUndangan && <KartuVanguardHariIni kegiatanId={d.kegiatan_id} />}
          <section className={`rounded-[18px] border p-4 ${nada.kotak}`} aria-label="Undangan pelatihan">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Undangan pelatihan</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${nada.chip}`}>{d.kartu.judul}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#3B4A60]">{d.kartu.ket}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={nada.tombol} onClick={() => setBuka(true)}>
                {d.kartu.tombol}
              </button>
              {d.undangan.pdf && (
                <button type="button" className={BTN_O} onClick={bukaPdf} disabled={unduh}>
                  {unduh ? "Menyiapkan…" : "Surat undangan (PDF)"}
                </button>
              )}
            </div>
            {galatPdf && (
              <div className="mt-2">
                <Pesan jenis="galat">{galatPdf}</Pesan>
              </div>
            )}
          </section>
          {terkunciUndangan && <Pesan jenis="info">Bagian pelatihan lain terbuka setelah Anda menerima undangan ini.</Pesan>}
          {!terkunciUndangan && <KartuJadwalPendataan jadwal={d.jadwal_pendataan} pelatihan={d.jadwal_pelatihan ?? (d.undangan.tanggal_iso ? { mulai: d.undangan.tanggal_iso, selesai: null } : null)} peran={d.peserta?.peran ?? null} />}
          {!vg.mendesak && !terkunciUndangan && <KartuVanguardHariIni kegiatanId={d.kegiatan_id} />}
          {!terkunciUndangan && <AbsenTanpaSinyal />}
          {!terkunciUndangan && <AbsenPeserta />}
          {!terkunciUndangan && <KartuKuis />}
          {!terkunciUndangan && <KartuRoleplayHariIni kegiatanId={d.kegiatan_id} />}
          {/* (2 Nov 2026) nomor pulsa: dikonfirmasi sekali lewat pop-up; di sini hanya kartu redup di bagian bawah (permintaan user) */}
          {!terkunciUndangan && <PulsaPeserta tampilan="kartu" judul={judulPelatihan(info)} />}
          {!d.tab_baru && (
            <Kartu>
              <p className="text-[12.5px] text-[#6B7A90]">
                Tampilan lima tab belum diaktifkan untuk pelatihan ini.{" "}
                <Link href="/sigap/pelatihan" className="font-bold text-[#1F5FD1] underline">
                  Kembali ke Langkah pelatihan
                </Link>
              </p>
            </Kartu>
          )}
        </>
      )}
      {d && buka && (
        <ModalKetentuan
          d={d}
          onTutup={() => setBuka(false)}
          onSelesai={() => {
            setBuka(false);
            lupakanBenderaTab();
            // (3 Nov 2026) gerbang berubah: Beranda (kartu pelatihan) dan seluruh data pelatihan diambil ulang
            tandaBasi("/api/sigap/pelatihan");
            tandaBasi("/api/portal/induk");
            tandaBasi("/api/portal/beranda");
            muat();
          }}
        />
      )}
    </Kerangka>
  );
}
