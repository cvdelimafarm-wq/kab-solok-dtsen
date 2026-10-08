"use client";

// app/sigap/pelatihan/kelola/notifikasi.tsx
//
// (8 Okt 2026) Kelola Pelatihan > tab "Notifikasi": panitia mengirim notifikasi push ke HP peserta (muncul walau aplikasi ditutup).
// Penerima dipilih lewat sasaran cepat (belum Posttest / belum Pretest / belum presensi hari ini / kelas / semua) lalu boleh dicentang manual.
// Hanya peserta yang SUDAH mengaktifkan notifikasi di HP-nya yang menerima; yang belum ditandai. Tidak ada kiriman otomatis: harus menekan Kirim + konfirmasi.

import { useCallback, useEffect, useMemo, useState } from "react";
import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH, type PesertaPush, type RiwayatPush, type StatusTesPush } from "@/lib/sigapPushUtil";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../../admin/api";
import { BTN, BTN_G, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";

const URL_API = "/api/sigap/pelatihan/admin/push";

type Data = { boleh_kelola: boolean; server_siap: boolean; hari: string; sekarang: string; peserta: PesertaPush[]; riwayat: RiwayatPush[] };
type Sasaran = "belum_posttest" | "belum_pretest" | "belum_presensi" | "belum_pasang" | "belum_notif" | "semua" | "kelas_1" | "kelas_2" | "kelas_3" | "kelas_4" | "kosong";

const OPSI_SASARAN: { k: Sasaran; label: string }[] = [
  { k: "belum_posttest", label: "Belum mengerjakan Posttest" },
  { k: "belum_pretest", label: "Belum mengerjakan Pretest" },
  { k: "belum_presensi", label: "Belum presensi hari ini" },
  { k: "belum_pasang", label: "Belum memasang aplikasi (tindak lanjut lewat WhatsApp)" },
  { k: "belum_notif", label: "Belum mengaktifkan notifikasi" },
  { k: "kelas_1", label: "Semua peserta Kelas 1" },
  { k: "kelas_2", label: "Semua peserta Kelas 2" },
  { k: "kelas_3", label: "Semua peserta Kelas 3" },
  { k: "kelas_4", label: "Semua peserta Kelas 4" },
  { k: "semua", label: "Semua peserta" },
  { k: "kosong", label: "Pilih manual (kosongkan dulu)" },
];

const cocokSasaran = (s: Sasaran, p: PesertaPush): boolean => {
  if (s === "belum_posttest") return p.posttest === "belum";
  if (s === "belum_pretest") return p.pretest === "belum";
  if (s === "belum_presensi") return !p.presensi_hari_ini;
  if (s === "belum_pasang") return !p.aplikasi.terpasang;
  if (s === "belum_notif") return p.notif === 0;
  if (s === "semua") return true;
  if (s === "kosong") return false;
  return p.kelas === Number(s.slice(6));
};

const TEMPLATE: { label: string; judul: string; isi: string; url: string }[] = [
  { label: "Posttest belum dikerjakan", judul: "Posttest belum Anda kerjakan", isi: "Segera kerjakan Posttest di SIGAP Pelatihan sebelum ditutup.", url: "/sigap/pelatihan/tes/posttest" },
  { label: "Pretest belum dikerjakan", judul: "Pretest belum Anda kerjakan", isi: "Segera kerjakan Pretest di SIGAP Pelatihan sebelum ditutup.", url: "/sigap/pelatihan/tes/pretest" },
  { label: "Presensi belum tercatat", judul: "Presensi hari ini belum tercatat", isi: "Lakukan presensi di lokasi pelatihan dengan lokasi (GPS) HP aktif.", url: "/sigap/pelatihan" },
  { label: "Ada kegiatan terlewat", judul: "Ada kegiatan pelatihan yang terlewat", isi: "Buka SIGAP untuk melihat kegiatan yang terlewat. Bila ada kendala, hubungi panitia.", url: "/sigap/pelatihan" },
];

const TUJUAN: { url: string; label: string }[] = [
  { url: "/sigap/pelatihan", label: "Langkah Pelatihan" },
  { url: "/sigap/pelatihan/tes/posttest", label: "Posttest" },
  { url: "/sigap/pelatihan/tes/pretest", label: "Pretest" },
  { url: "/", label: "Beranda portal" },
];

const warnaTes: Record<StatusTesPush, "ok" | "wait" | "bad"> = { selesai: "ok", mengerjakan: "wait", belum: "bad" };
const labelTes: Record<StatusTesPush, string> = { selesai: "Selesai", mengerjakan: "Mengerjakan", belum: "Belum" };

export default function NotifikasiKelola() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sasaran, setSasaran] = useState<Sasaran>("belum_posttest");
  const [dipilih, setDipilih] = useState<Set<number>>(new Set());
  const [judul, setJudul] = useState(TEMPLATE[0].judul);
  const [isi, setIsi] = useState(TEMPLATE[0].isi);
  const [url, setUrl] = useState(TEMPLATE[0].url);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  const muat = useCallback(async (pakaiSasaran?: Sasaran) => {
    try {
      const x = await fetchJson<Data>(URL_API);
      setD(x);
      setGalat(null);
      if (pakaiSasaran) setDipilih(new Set(x.peserta.filter((p) => cocokSasaran(pakaiSasaran, p)).map((p) => p.akun_id)));
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat("belum_posttest");
  }, [muat]);

  function pilihSasaran(s: Sasaran) {
    setSasaran(s);
    setKonfirmasi(false);
    if (d) setDipilih(new Set(d.peserta.filter((p) => cocokSasaran(s, p)).map((p) => p.akun_id)));
  }

  const terpilih = useMemo(() => (d?.peserta ?? []).filter((p) => dipilih.has(p.akun_id)), [d, dipilih]);
  const adaNotif = terpilih.filter((p) => p.notif > 0);
  const tanpaNotif = terpilih.length - adaNotif.length;
  const totalNotif = (d?.peserta ?? []).filter((p) => p.notif > 0).length;
  const totalPasang = (d?.peserta ?? []).filter((p) => p.aplikasi.terpasang).length;
  const bisaKirim = !!d?.boleh_kelola && d.server_siap && adaNotif.length > 0 && judul.trim() !== "" && isi.trim() !== "";

  async function kirim() {
    setSibuk(true);
    setHasil(null);
    try {
      const r = await fetchJson<{ ok: boolean; akun: number; tanpa_notifikasi: number; perangkat: number; terkirim: number; gagal: number }>(URL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "kirim", akun_ids: terpilih.map((p) => p.akun_id), judul, isi, url }),
      });
      setHasil({ jenis: r.terkirim > 0 ? "ok" : "galat", teks: `Terkirim ke ${r.terkirim} perangkat dari ${r.perangkat} yang terdaftar (${r.akun} peserta dipilih${r.tanpa_notifikasi ? `, ${r.tanpa_notifikasi} belum mengaktifkan notifikasi` : ""}${r.gagal ? `, ${r.gagal} gagal` : ""}).` });
      setKonfirmasi(false);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setHasil({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  if (!d) return galat ? <Pesan jenis="galat">{galat}</Pesan> : <Memuat />;

  return (
    <div className="space-y-3">
      {!d.server_siap && (
        <Pesan jenis="peringatan">
          Pengiriman belum aktif: kunci VAPID belum dipasang di server (Railway: VAPID_PUBLIC_KEY dan VAPID_PRIVATE_KEY). Daftar di bawah tetap bisa dilihat.
        </Pesan>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <KartuAngka label="Peserta" nilai={d.peserta.length} />
        <KartuAngka label="Aplikasi terpasang" nilai={totalPasang} ket={`${d.peserta.length - totalPasang} belum`} warna="#1E7A4C" />
        <KartuAngka label="Notifikasi aktif" nilai={totalNotif} ket={`${d.peserta.length - totalNotif} belum`} warna="#1E7A4C" />
        <KartuAngka label="Penerima terpilih" nilai={terpilih.length} ket={`${adaNotif.length} akan menerima`} warna="#1F5FD1" />
        <KartuAngka label="Tanpa notifikasi" nilai={tanpaNotif} ket="tidak akan menerima" warna={tanpaNotif ? "#B5352D" : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Kartu judul="Pesan" ket="muncul di HP walau aplikasi ditutup">
          <div className="space-y-2.5">
            <div>
              <p className="mb-1 text-[12px] font-semibold text-[#55657D]">Isi cepat</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE.map((t) => (
                  <button key={t.label} type="button" className={`${BTN_O} !px-2.5 !py-1`} onClick={() => { setJudul(t.judul); setIsi(t.isi); setUrl(t.url); setKonfirmasi(false); }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-[12px] font-semibold text-[#55657D]">
              Judul <span className="font-normal text-[#7B8794]">({judul.length}/{MAKS_JUDUL_PUSH})</span>
              <input className={`${INPUT} mt-1 w-full`} maxLength={MAKS_JUDUL_PUSH} value={judul} onChange={(e) => { setJudul(e.target.value); setKonfirmasi(false); }} />
            </label>
            <label className="block text-[12px] font-semibold text-[#55657D]">
              Isi <span className="font-normal text-[#7B8794]">({isi.length}/{MAKS_ISI_PUSH})</span>
              <textarea className={`${INPUT} mt-1 w-full`} rows={3} maxLength={MAKS_ISI_PUSH} value={isi} onChange={(e) => { setIsi(e.target.value); setKonfirmasi(false); }} />
            </label>
            <label className="block text-[12px] font-semibold text-[#55657D]">
              Saat diketuk, buka
              <select className={`${INPUT} mt-1 w-full`} value={url} onChange={(e) => setUrl(e.target.value)}>
                {TUJUAN.map((t) => (
                  <option key={t.url} value={t.url}>{t.label}</option>
                ))}
              </select>
            </label>
            <div>
              <p className="mb-1 text-[12px] font-semibold text-[#55657D]">Pratinjau di HP</p>
              <div className="flex items-start gap-2.5 rounded-xl bg-[#EEF2F8] p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-lg bg-white" />
                <div className="min-w-0">
                  <p className="text-[11px] text-[#7B8794]">SIGAP · sekarang</p>
                  <p className="truncate text-[13.5px] font-bold text-[#14202E]">{judul || "Judul notifikasi"}</p>
                  <p className="line-clamp-3 whitespace-pre-line text-[12.5px] text-[#4D5B6B]">{isi || "Isi notifikasi"}</p>
                </div>
              </div>
            </div>
          </div>
        </Kartu>

        <Kartu judul="Penerima" ket={`hari ini ${d.hari}`}>
          <label className="block text-[12px] font-semibold text-[#55657D]">
            Sasaran cepat
            <select className={`${INPUT} mt-1 w-full`} value={sasaran} onChange={(e) => pilihSasaran(e.target.value as Sasaran)}>
              {OPSI_SASARAN.map((o) => (
                <option key={o.k} value={o.k}>{o.label}</option>
              ))}
            </select>
          </label>
          <p className="mt-1.5 text-[12px] text-[#7B8794]">Centang atau hapus centang pada tabel untuk menyesuaikan. Peserta yang belum mengaktifkan notifikasi di HP-nya tidak akan menerima.</p>

          {hasil && <div className="mt-2"><Pesan jenis={hasil.jenis}>{hasil.teks}</Pesan></div>}

          {d.boleh_kelola ? (
            konfirmasi ? (
              <div className="mt-3 rounded-xl border border-[#F0D58A] bg-[#FFF8E1] p-3 text-[13px] text-[#7A4F00]">
                <p className="font-bold">Kirim notifikasi ini sekarang?</p>
                <p className="mt-0.5">&ldquo;{judul}&rdquo; akan dikirim ke {adaNotif.length} peserta{tanpaNotif ? ` (${tanpaNotif} lainnya belum mengaktifkan notifikasi)` : ""}. Pesan yang sudah terkirim tidak dapat ditarik.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className={BTN_G} disabled={sibuk} onClick={kirim}>{sibuk ? "Mengirim…" : "Ya, kirim sekarang"}</button>
                  <button type="button" className={BTN_O} disabled={sibuk} onClick={() => setKonfirmasi(false)}>Batal</button>
                </div>
              </div>
            ) : (
              <button type="button" className={`${BTN} mt-3 w-full !py-2.5 !text-[13.5px]`} disabled={!bisaKirim} onClick={() => setKonfirmasi(true)}>
                🔔 Kirim ke {adaNotif.length} peserta
              </button>
            )
          ) : (
            <p className="mt-3 text-[12.5px] text-[#7B8794]">Anda hanya punya izin melihat; mengirim memerlukan izin kelola.</p>
          )}
          {d.boleh_kelola && !bisaKirim && !konfirmasi && (
            <p className="mt-1 text-[12px] text-[#B5352D]">
              {!d.server_siap ? "Kunci VAPID belum dipasang di server." : adaNotif.length === 0 ? "Belum ada penerima yang mengaktifkan notifikasi." : "Lengkapi judul dan isi."}
            </p>
          )}
        </Kartu>
      </div>

      <TabelKartu>
        <thead>
          <tr>
            <th className={TH}>
              <input type="checkbox" aria-label="Pilih semua" checked={d.peserta.length > 0 && dipilih.size === d.peserta.length} onChange={(e) => { setSasaran("kosong"); setDipilih(e.target.checked ? new Set(d.peserta.map((p) => p.akun_id)) : new Set()); setKonfirmasi(false); }} />
            </th>
            <th className={TH}>Nama</th>
            <th className={TH}>Kelas</th>
            <th className={TH}>Aplikasi</th>
            <th className={TH}>Terakhir dibuka</th>
            <th className={TH}>Notifikasi</th>
            <th className={TH}>Pretest</th>
            <th className={TH}>Posttest</th>
            <th className={TH}>Presensi hari ini</th>
          </tr>
        </thead>
        <tbody>
          {d.peserta.map((p) => (
            <tr key={p.akun_id} className={dipilih.has(p.akun_id) ? "bg-[#F3F8FF]" : ""}>
              <td className={TD}>
                <input
                  type="checkbox"
                  aria-label={`Pilih ${p.nama}`}
                  checked={dipilih.has(p.akun_id)}
                  onChange={(e) => {
                    setDipilih((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(p.akun_id);
                      else n.delete(p.akun_id);
                      return n;
                    });
                    setKonfirmasi(false);
                  }}
                />
              </td>
              <td className={`${TD} font-semibold`}>{p.nama}<span className="ml-1.5 text-[11px] font-normal uppercase text-[#7B8794]">{p.peran}</span></td>
              <td className={TD}>{p.kelas ?? "–"}</td>
              <td className={TD}>
                {p.aplikasi.terpasang ? <Chip w="ok">Terpasang{p.aplikasi.platform && p.aplikasi.platform !== "lain" ? ` · ${p.aplikasi.platform === "ios" ? "iPhone" : "Android"}` : ""}</Chip> : p.aplikasi.terakhir_browser_at ? <Chip w="wait">Baru lewat browser</Chip> : <Chip w="mut">Belum</Chip>}
              </td>
              <td className={`${TD} whitespace-nowrap text-[12px] text-[#4D5B6B]`}>{p.aplikasi.terakhir_aplikasi_at ? waktuWib(p.aplikasi.terakhir_aplikasi_at) : "–"}</td>
              <td className={TD}>{p.notif > 0 ? <Chip w="ok">Aktif{p.notif > 1 ? ` (${p.notif} HP)` : ""}</Chip> : <Chip w="mut">Belum</Chip>}</td>
              <td className={TD}><Chip w={warnaTes[p.pretest]}>{labelTes[p.pretest]}</Chip></td>
              <td className={TD}><Chip w={warnaTes[p.posttest]}>{labelTes[p.posttest]}</Chip></td>
              <td className={TD}>{p.presensi_hari_ini ? <Chip w="ok">Tercatat</Chip> : <Chip w="bad">Belum</Chip>}</td>
            </tr>
          ))}
        </tbody>
      </TabelKartu>

      <Kartu judul="Riwayat pengiriman" ket="20 terakhir">
        {d.riwayat.length === 0 ? (
          <p className="text-[12.5px] text-[#7B8794]">Belum ada notifikasi yang dikirim.</p>
        ) : (
          <div className="space-y-1.5">
            {d.riwayat.map((r) => (
              <div key={r.id} className="rounded-lg border border-[#E3E8EE] px-3 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[13px]">{r.judul}</b>
                  <Chip w={r.terkirim > 0 ? "ok" : "bad"}>{r.terkirim} terkirim</Chip>
                  {r.gagal > 0 && <Chip w="bad">{r.gagal} gagal</Chip>}
                  <span className="text-[#7B8794]">{r.jumlah_akun} peserta · {waktuWib(r.dibuat_at)}{r.oleh ? ` · ${r.oleh.split(",")[0]}` : ""}</span>
                </div>
                <p className="mt-0.5 text-[#4D5B6B]">{r.isi}</p>
              </div>
            ))}
          </div>
        )}
      </Kartu>
    </div>
  );
}
