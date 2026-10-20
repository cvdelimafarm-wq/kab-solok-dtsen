"use client";

// app/sigap/kelola/pendataan/Siaran.tsx
//
// (13 Okt 2026) Siaran ke petugas pendataan (PML/PPL/korwil): kirim notifikasi push dan/atau tampilkan modal yang cukup dikonfirmasi satu kali.
// Pengiriman dua langkah (Kirim -> Ya, kirim) agar tidak terkirim tak sengaja. Modal otomatis berhenti tampil 14 hari sesudah dikirim.

import { useCallback, useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import EditorTeksKaya from "@/app/components/EditorTeksKaya";
import { ModalPengumuman } from "@/app/sigap/pelatihan/pengumumanUi";
import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH } from "@/lib/sigapPushUtil";
import { HARI_MODAL_SIARAN } from "@/lib/siaranPetugas";
import type { JenisPengumuman } from "@/lib/sigapPengumuman";

type Riwayat = { waktu: string; judul: string; oleh: string | null; akun: number; terkirim: number; modal: boolean; sudah_konfirmasi: number };
type Ringkas = { push_siap: boolean; penerima: number; berlangganan: number; riwayat: Riwayat[]; boleh_kirim: boolean };
type Hasil = { akun: number; tanpa_notifikasi: number; perangkat: number; terkirim: number; gagal: number; modal: boolean; push: boolean };

// (18 Okt 2026) Templat siaran. Urutan pertama = bawaan. Tombol/push membawa petugas langsung ke tujuan (?kolam=1 membuka mode Kolam wilayah, ?tab=wilayah membuka tab Batas).
type Templat = { nama: string; judul: string; isi: string; mJudul: string; mIsi: string; tLabel: string; tUrl: string; url: string; jenis: JenisPengumuman };
const TEMPLAT: Templat[] = [
  {
    // (20 Okt 2026) PENGUMUMAN malam 20 Okt: jendela susulan foto + laporan dibuka OTOMATIS Rabu 21 Okt 2026 06.00-10.00 WIB (pg_cron: sigap_buka_jendela_susulan_21okt).
    // Tanpa tombol: jendela belum ada malam ini, jadi menu Perbaiki administrasi masih kosong.
    nama: "Jendela susulan foto & laporan: PENGUMUMAN (21 Okt 2026, 06.00-10.00)",
    judul: "Besok 06.00–10.00: lengkapi foto yang terlewat",
    isi: "Rabu 21 Okt, 06.00–10.00 WIB: kesempatan sekali melengkapi foto dan laporan yang terlewat. Siapkan fotonya dari sekarang. Ketuk untuk membaca.",
    mJudul: "LENGKAPI FOTO YANG TERLEWAT",
    mIsi: "**Kesempatan melengkapi foto dan laporan yang terlewat.**\n\n==Dibuka besok, Rabu 21 Oktober 2026, pukul 06.00–10.00 WIB.== Setelah pukul 10.00 akses ditutup otomatis.\n\n- Berlaku untuk ==hari kerja sejak awal pendataan sampai 20 Oktober 2026== yang foto atau laporannya belum lengkap, termasuk hari ini bagi yang belum memakai Kamera SIGAP\n- ==Siapkan foto dari sekarang==: kumpulkan foto yang masih ada di galeri HP dan pastikan tanggal pengambilannya\n- Foto tanggal yang terlewat ==diunggah dari galeri== (bukan lewat kamera). Foto tanggal 21 Oktober dan seterusnya tetap lewat Kamera SIGAP\n- Laporan dilengkapi dengan menandai status KK di Lembar Pendataan (mode perbaikan), hanya untuk KK yang belum punya hasil\n- ==Kesempatan hanya sekali==. Tanggal yang masih belum lengkap setelah pukul 10.00 tidak masuk Kwitansi\n\nPukul 06.00, buka menu **Perbaiki administrasi** di aplikasi untuk memulai.",
    tLabel: "",
    tUrl: "",
    url: "/",
    jenis: "perhatian",
  },
  {
    // (20 Okt 2026) PEMBUKAAN pagi 21 Okt (kirim ~06.00, boleh push saja): jendela sudah aktif; tombol ke menu Perbaiki administrasi.
    nama: "Jendela susulan foto & laporan: SUDAH DIBUKA (kirim 06.00)",
    judul: "Dibuka sampai 10.00 WIB: lengkapi foto yang terlewat",
    isi: "Kesempatan sekali melengkapi foto dan laporan yang terlewat sudah dibuka sampai pukul 10.00 WIB hari ini. Ketuk untuk membuka Perbaiki administrasi.",
    mJudul: "JENDELA SUSULAN SUDAH DIBUKA",
    mIsi: "**Jendela melengkapi foto dan laporan sudah dibuka.**\n\n==Berlaku sampai pukul 10.00 WIB hari ini, hanya sekali.==\n\n- Foto tanggal yang terlewat diunggah dari galeri lewat menu **Perbaiki administrasi**\n- Laporan dilengkapi lewat Lembar Pendataan (mode perbaikan)\n- Setelah pukul 10.00 akses ditutup otomatis",
    tLabel: "Perbaiki administrasi",
    tUrl: "/sigap/perbaikan",
    url: "/sigap/perbaikan",
    jenis: "perhatian",
  },
  {
    // (20 Okt 2026) Perubahan target harian 45 -> 60 poin, berlaku mulai 20 Okt 2026 (tidak berlaku mundur; poin jarak tetap 1 per km). Modal tombolnya ke Lembar Pendataan (PML/PPL).
    nama: "Perubahan target harian (mulai 20 Okt 2026)",
    judul: "Target harian jadi 60 poin, berlaku 20 Okt 2026",
    isi: "Ketentuan ini mulai berlaku sejak 20 Oktober 2026: target harian naik dari 45 ke 60 poin (1 O-K). Poin jarak tetap 1 poin per km. Hari sebelumnya tidak berubah. Ketuk untuk melihat capaian Anda.",
    mJudul: "PERUBAHAN TARGET HARIAN",
    mIsi: "**Perubahan target harian.**\n\n==Ketentuan ini mulai berlaku sejak 20 Oktober 2026.==\n\n- **Target harian** naik dari 45 menjadi ==60 poin== (60 poin = 1 O-K)\n- **Poin jarak** tidak berubah: tetap 1 poin per km (maksimal 15 poin per hari)\n- **Poin KK** tidak berubah: terdampak 5 poin, tidak terdampak 1 poin\n- ==Tidak berlaku mundur==: hari 15–19 Oktober tetap dihitung dengan target lama (45 poin)\n- Kekurangan (hutang) dari hari sebelumnya tetap dibawa dan ditutup lebih dulu oleh poin hari berikutnya\n\nPantau capaian Anda lewat tombol **Capaian hari ini** di Lembar Pendataan.",
    tLabel: "Buka Lembar Pendataan",
    tUrl: "/sigap/pendataan",
    url: "/sigap/pendataan",
    jenis: "perhatian",
  },
  {
    // (19 Okt 2026) Briefing pendataan PSP via Zoom (Selasa 20 Okt 2026, 08.00-08.45 WIB). Tombol modal membuka Zoom; tombol "Salin tautan" muncul otomatis di bawahnya.
    nama: "Briefing pendataan PSP via Zoom (20 Okt 2026)",
    judul: "Briefing Pendataan PSP: Selasa 20 Okt, 08.00 WIB",
    isi: "Bapak/Ibu petugas PSP Pascabencana 2026, besok Selasa 20 Oktober 2026 pukul 08.00–08.45 WIB ada briefing pendataan via Zoom. Mohon hadir tepat waktu. Ketuk untuk membuka tautan.",
    mJudul: "Briefing Pendataan PSP Pascabencana 2026",
    mIsi: "Bapak/Ibu petugas Pendataan Status Pemulihan (PSP) Pascabencana Sumatera 2026, kami mengundang untuk mengikuti **briefing pendataan** secara daring via Zoom:\n\n- **Hari/tanggal:** Selasa, 20 Oktober 2026\n- **Waktu:** ==08.00 – 08.45 WIB==\n- **Peserta:** seluruh korwil, PML, dan PPL\n- **Tautan Zoom:** [Buka tautan briefing](https://telkomsel.zoom.us/j/98559750469?pwd=maxZ1XeIlIKK6iT5aDdiuXyaOFOw6d.1) (tanpa password)\n\nMohon bergabung tepat waktu. Terima kasih.",
    tLabel: "Buka tautan briefing",
    tUrl: "https://telkomsel.zoom.us/j/98559750469?pwd=maxZ1XeIlIKK6iT5aDdiuXyaOFOw6d.1",
    url: "/sigap/pendataan",
    jenis: "perhatian",
  },
  {
    nama: "Gantuang Ciri dinonaktifkan + Kolam wilayah",
    judul: "Sub SLS Gantuang Ciri dinonaktifkan",
    isi: "Seluruh Sub SLS Nagari Gantuang Ciri dinonaktifkan dan tidak bisa diajukan. Pilih Sub SLS di nagari lain. Tim yang Sub SLS-nya hampir habis bisa mengajukan tambahan lewat Kolam wilayah. Ketuk untuk membuka.",
    mJudul: "SUB SLS GANTUANG CIRI DINONAKTIFKAN",
    mIsi: "**Pembaruan pengajuan Sub SLS.**\n\n- ==Seluruh Sub SLS di Nagari Gantuang Ciri dinonaktifkan== dan tidak dapat diajukan untuk pendataan/FASIH. Silakan memilih Sub SLS di nagari lain\n- Sub SLS Gantuang Ciri ==dikeluarkan dari target tim==, jadi tidak ikut dihitung pada syarat 70% untuk Kolam wilayah\n- Tim yang ==jumlah Sub SLS-nya mulai habis== dapat mengajukan Sub SLS tambahan lewat ==Kolam wilayah== (tombol ungu di Lembar Pendataan)\n- Pengajuan lewat Kolam wilayah dilakukan oleh PML",
    tLabel: "Buka Kolam Wilayah",
    tUrl: "/sigap/pendataan?kolam=1",
    url: "/sigap/pendataan?kolam=1",
    jenis: "perhatian",
  },
  {
    nama: "Peta batas wilayah (tab Batas)",
    judul: "Peta batas wilayah kini ada di Lembar Pendataan",
    isi: "Tab baru \"Batas\" di Lembar Pendataan: lihat peta batas Sub SLS dan peta desa/nagari tempat Anda bertugas. Bisa dizoom, dan setelah dibuka sekali tersimpan di HP sehingga tetap bisa dilihat tanpa sinyal. Ketuk untuk membuka.",
    mJudul: "PETA BATAS WILAYAH TERSEDIA",
    mIsi: "**Tab baru \"Batas\" di Lembar Pendataan.**\n\n- Menampilkan ==peta batas Sub SLS== dan ==peta desa/nagari== untuk Sub SLS yang sedang dibuka\n- Bisa diperbesar (cubit atau ketuk dua kali) untuk melihat batas dan landmark\n- Peta yang sudah dibuka ==tersimpan di HP selama 20 hari==, jadi tetap bisa dilihat di lokasi yang sinyalnya lemah\n- Hanya peta yang Anda buka yang diunduh, jadi tidak boros kuota\n- Tab ini bisa dilihat oleh PML dan PPL tim yang bersangkutan",
    tLabel: "Buka Tab Batas",
    tUrl: "/sigap/pendataan?tab=wilayah",
    url: "/sigap/pendataan?tab=wilayah",
    jenis: "info",
  },
];
const AWAL = TEMPLAT[0];

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
  const [tLabel, setTLabel] = useState(AWAL.tLabel);
  const [tUrl, setTUrl] = useState(AWAL.tUrl);
  const [jenis, setJenis] = useState<JenisPengumuman>(AWAL.jenis);
  const [templat, setTemplat] = useState(0);
  const [urlPush, setUrlPush] = useState(AWAL.url);
  const [uji, setUji] = useState(false);
  const [hasilUji, setHasilUji] = useState<string | null>(null);
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
        body: JSON.stringify({ aksi: "siarkan", kirim_push: push, judul, isi, url: urlPush, modal: { aktif: modal, judul: mJudul, isi: mIsi, jenis, tombol_label: tLabel, tombol_url: tUrl } }),
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

  async function ujiPush() {
    if (uji) return;
    setUji(true);
    setHasilUji(null);
    setGalat(null);
    try {
      const h = await apiPortal<{ perangkat: number; terkirim: number; gagal: number }>("/api/portal/siaran-petugas", { method: "POST", body: JSON.stringify({ aksi: "uji", judul, isi, url: urlPush }) });
      setHasilUji(
        h.perangkat === 0
          ? "Tidak ada perangkat yang mengaktifkan notifikasi di akun Anda. Buka Beranda di HP Anda, ketuk \"Aktifkan notifikasi\", lalu coba lagi."
          : `Terkirim ke ${h.terkirim} dari ${h.perangkat} perangkat akun Anda${h.gagal ? ` (${h.gagal} gagal)` : ""}. Cek HP Anda.`
      );
    } catch (e) {
      setGalat(e instanceof Error && e.message !== "SESI_BERAKHIR" ? e.message : "Gagal mengirim uji. Periksa sambungan lalu coba lagi.");
    } finally {
      setUji(false);
    }
  }

  function pakaiTemplat(i: number) {
    const t = TEMPLAT[i] ?? TEMPLAT[0];
    setTemplat(i);
    setJudul(t.judul);
    setIsi(t.isi);
    setMJudul(t.mJudul);
    setMIsi(t.mIsi);
    setTLabel(t.tLabel);
    setTUrl(t.tUrl);
    setUrlPush(t.url);
    setJenis(t.jenis);
    setYakin(false);
    setHasil(null);
    setHasilUji(null);
  }

  const kolom = "mt-1 w-full rounded-[12px] border border-[#D9E3F2] bg-white px-3 py-2 text-[14px] text-[#1B2B4B]";
  const boleh = !!r?.boleh_kirim;
  const sah = (push || modal) && (!push || (judul.trim() && isi.trim())) && (!modal || (mJudul.trim() && mIsi.trim() && mIsi.length <= 2000));

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
      <label className="mt-3 block text-[12px] font-bold text-[#55657D]">
        Templat siaran
        <select value={templat} onChange={(e) => pakaiTemplat(Number(e.target.value))} className={`${kolom} min-h-[44px]`}>
          {TEMPLAT.map((t, i) => (
            <option key={t.nama} value={i}>
              {t.nama}
            </option>
          ))}
        </select>
      </label>
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
          {/* (21 Okt 2026) Editor visual bergaya Word; yang tersimpan tetap teks berpenanda yang sama (lib/teksKaya.ts) */}
          <div className="mt-2">
            <p className="text-[12px] font-bold text-[#55657D]">Isi modal (ketik langsung; blok teks lalu tekan tombol Tebal, Miring, Sorot, Subjudul, Poin, Nomor)</p>
            <EditorTeksKaya nilai={mIsi} onUbah={setMIsi} maks={2000} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block text-[12px] font-bold text-[#55657D]">
              Label tombol (kosongkan = tanpa tombol)
              <input value={tLabel} maxLength={60} onChange={(e) => setTLabel(e.target.value)} className={kolom} />
            </label>
            <label className="block text-[12px] font-bold text-[#55657D]">
              Tujuan (/sigap/… atau https://)
              <input value={tUrl} maxLength={200} onChange={(e) => setTUrl(e.target.value)} className={kolom} />
            </label>
          </div>
          <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#6B7A90]">Pratinjau</p>
          <div className="mt-1">
            <ModalPengumuman d={{ jenis, judul: mJudul, isi: mIsi, tombol_label: tLabel.trim() || null, tombol_url: tUrl.trim() || null }} posisi={1} jumlah={1} lanjut={() => undefined} sebagaiPratinjau />
          </div>
        </div>
      )}

      {boleh && push && (
        <div className="mt-4 rounded-[14px] bg-[#F5F8FE] p-3">
          <button type="button" disabled={uji || !judul.trim() || !isi.trim()} onClick={() => void ujiPush()} className="min-h-[46px] w-full rounded-[12px] bg-white text-[13.5px] font-extrabold text-[#1F5FD1] shadow-sm disabled:opacity-50">
            {uji ? "Mengirim uji…" : "Uji: kirim notifikasi ke akun saya saja"}
          </button>
          <p className="mt-1.5 text-[11.5px] leading-snug text-[#55657D]">Hanya ke perangkat akun Anda sendiri, tidak ke petugas. Saat &quot;masuk sebagai&quot; petugas, notifikasi asli tetap masuk ke HP petugas itu, bukan ke akun Anda. Modal tidak bisa diuji terpisah: modal tampil di Beranda semua petugas begitu siaran dikirim.</p>
          {hasilUji && <p role="status" className="mt-2 rounded-[10px] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#0F2A52]">{hasilUji}</p>}
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
