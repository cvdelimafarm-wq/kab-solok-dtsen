"use client";

// app/sigap/pelatihan/kelola/kuis.tsx
//
// (7 Okt 2026) SIGAP > Kelola Pelatihan > tab "Kuis Live" (gaya Kahoot):
//   - bank kuis: buat, unduh template Excel, unggah soal (.xlsx), lihat, salin, hapus
//   - buka ruang -> layar host (./kuisHost.tsx) yang dikendalikan admin; peserta gabung dari akun SIGAP (Langkah > Kuis Live)
//   - riwayat ruang + rekap per peserta (poin tambahan) + ekspor Excel
// Izin menu `pelatihan.kelola`: lihat = layar host & rekap, kelola = bank soal & kendali ruang.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DETIK_MAX, DETIK_MIN, HEADER_TEMPLATE_KUIS, PETUNJUK_TEMPLATE_KUIS, WARNA_OPSI, bacaBarisKuis, barisTemplateKuis, type SoalKuis } from "@/lib/sigapKuis";
import { MAKS_SOAL } from "@/lib/sigapTes";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "../../admin/api";
import { BTN, BTN_G, BTN_O, BTN_R, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import { LayarHost, URL_KUIS_ADMIN } from "./kuisHost";

type KuisRingkas = { id: number; judul: string; aktif: boolean; dibuat_at: string; diubah_at: string; jumlah_soal: number; total_detik: number };
type RuangRingkas = { id: number; kuis_id: number; status: "lobi" | "soal" | "jawaban" | "selesai"; soal_ke: number; dibuka_at: string; selesai_at: string | null; jumlah_peserta: number };
type Daftar = { sekarang: string; boleh_kelola: boolean; maks_soal: number; kuis: KuisRingkas[]; ruang: RuangRingkas[] };

const LABEL_STATUS: Record<string, string> = { lobi: "Lobi · menunggu peserta", soal: "Soal berjalan", jawaban: "Menampilkan jawaban", selesai: "Selesai" };
const menit = (d: number) => (d >= 60 ? `${Math.floor(d / 60)} mnt ${d % 60 ? `${d % 60} dtk` : ""}`.trim() : `${d} dtk`);

async function kirim<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(URL_KUIS_ADMIN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export default function KuisLive({ bisaKelolaAwal }: { bisaKelolaAwal?: boolean }) {
  const [data, setData] = useState<Daftar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [host, setHost] = useState<number | null>(null);
  const [rekap, setRekap] = useState<number | null>(null);
  const [judulBaru, setJudulBaru] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [hapusRuang, setHapusRuang] = useState<number | null>(null);

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Daftar>(`${URL_KUIS_ADMIN}?bagian=daftar`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat();
    if (host !== null) return; // layar host berjalan: daftar tidak perlu disegarkan
    const t = setInterval(muat, 8000);
    return () => clearInterval(t);
  }, [muat, host]);

  const bisaKelola = data?.boleh_kelola ?? bisaKelolaAwal ?? false;
  const aktif = data?.ruang.find((r) => r.status !== "selesai") ?? null;
  const kuisAktif = aktif ? data?.kuis.find((k) => k.id === aktif.kuis_id) : null;

  async function aksi(fn: () => Promise<unknown>, ok?: string) {
    setSibuk(true);
    setPesan(null);
    try {
      await fn();
      if (ok) setPesan({ jenis: "ok", teks: ok });
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  async function unduhTemplate() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(barisTemplateKuis());
    ws["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Soal");
    const wp = XLSX.utils.aoa_to_sheet(PETUNJUK_TEMPLATE_KUIS.map((t) => [t]));
    wp["!cols"] = [{ wch: 120 }];
    XLSX.utils.book_append_sheet(wb, wp, "Petunjuk");
    XLSX.writeFile(wb, "Template_Soal_Kuis_Live_Pelatihan_PSP.xlsx");
  }

  if (galat && !data) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;

  const riwayat = data.ruang.filter((r) => r.status === "selesai");
  const judulKuis = (id: number) => data.kuis.find((k) => k.id === id)?.judul ?? "Kuis";

  return (
    <div className="space-y-3">
      {host !== null && <LayarHost ruangId={host} bisaKelola={bisaKelola} onTutup={() => { setHost(null); muat(); }} />}
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {pesan && <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>}

      <Pesan jenis="info">
        <b>Adu Sigap</b> = kuis live bergaya Kahoot: Anda memegang layar host (proyektor) dan menekan <b>Lanjut</b>; peserta menjawab dari HP lewat <b>SIGAP › Pelatihan › Langkah › Adu Sigap</b> (otomatis dari akun, tanpa kode). Skor kuis dicatat sebagai <b>nilai tambahan</b> dan tidak mengubah nilai pretest/posttest.
      </Pesan>

      {aktif && (
        <Kartu judul="🔴 Ruang kuis sedang aktif" ket={kuisAktif?.judul} kanan={<Chip w="wait">{LABEL_STATUS[aktif.status]}</Chip>}>
          <p className="text-[13px] text-[#55657D]">
            Dibuka {waktuWib(aktif.dibuka_at)} · <b>{aktif.jumlah_peserta}</b> peserta bergabung{aktif.status !== "lobi" && aktif.soal_ke > 0 ? ` · soal ke-${aktif.soal_ke}/${kuisAktif?.jumlah_soal ?? "?"}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={BTN_G} onClick={() => setHost(aktif.id)}>🖥 Buka layar host</button>
            {bisaKelola && (
              <button type="button" className={BTN_R} disabled={sibuk} onClick={() => aksi(() => kirim({ aksi: "akhiri", ruang_id: aktif.id }), "Ruang kuis diakhiri.")}>
                Akhiri ruang
              </button>
            )}
          </div>
        </Kartu>
      )}

      <Kartu
        judul="Bank kuis"
        ket={`${data.kuis.length} kuis · maks. ${MAKS_SOAL} soal per kuis`}
        kanan={<button type="button" className={BTN_O} onClick={unduhTemplate}>⬇ Unduh template Excel</button>}
      >
        {bisaKelola && (
          <form
            className="mb-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const j = judulBaru.trim();
              if (!j) return;
              aksi(async () => {
                await kirim({ aksi: "buat_kuis", judul: j });
                setJudulBaru("");
              }, "Kuis dibuat. Unggah soalnya (template Excel) di kartu kuis.");
            }}
          >
            <input className={`${INPUT} min-w-[220px] flex-1`} placeholder="Judul kuis baru, mis. Kuis Penyegaran Materi PSP" maxLength={150} value={judulBaru} onChange={(e) => setJudulBaru(e.target.value)} aria-label="Judul kuis baru" />
            <button type="submit" className={BTN} disabled={sibuk || !judulBaru.trim()}>＋ Buat kuis</button>
          </form>
        )}
        {data.kuis.length === 0 && <p className="text-[13px] text-[#7B8794]">Belum ada kuis. Buat kuis, lalu unggah soal dari template Excel.</p>}
        <div className="space-y-3">
          {data.kuis.map((k) => (
            <KartuKuis key={k.id} kuis={k} bisaKelola={bisaKelola} ruangAktif={!!aktif} sudahDimainkan={data.ruang.some((r) => r.kuis_id === k.id)} sibuk={sibuk} aksi={aksi} bukaHost={(id) => setHost(id)} />
          ))}
        </div>
      </Kartu>

      <Kartu judul="Riwayat & rekap" ket={`${riwayat.length} sesi kuis selesai`}>
        {riwayat.length === 0 ? (
          <p className="text-[13px] text-[#7B8794]">Belum ada kuis yang selesai dimainkan.</p>
        ) : (
          <TabelKartu className="!shadow-none">
            <thead>
              <tr>
                <th className={TH}>Kuis</th>
                <th className={TH}>Dimulai (WIB)</th>
                <th className={TH}>Peserta</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id}>
                  <td className={`${TD} font-semibold`}>{judulKuis(r.kuis_id)}</td>
                  <td className={TD}>{waktuWib(r.dibuka_at)}</td>
                  <td className={`${TD} tabular-nums`}>{r.jumlah_peserta}</td>
                  <td className={`${TD} text-right`}>
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      <button type="button" className={BTN} onClick={() => setRekap(r.id)}>Rekap</button>
                      <button type="button" className={BTN_O} onClick={() => setHost(r.id)}>Podium</button>
                      {bisaKelola &&
                        (hapusRuang === r.id ? (
                          <>
                            <button type="button" className={BTN_R} disabled={sibuk} onClick={() => { setHapusRuang(null); if (rekap === r.id) setRekap(null); aksi(() => kirim({ aksi: "hapus_ruang", ruang_id: r.id }), "Riwayat dihapus."); }}>Ya, hapus</button>
                            <button type="button" className={BTN_O} onClick={() => setHapusRuang(null)}>Batal</button>
                          </>
                        ) : (
                          <button type="button" className={BTN_R} onClick={() => setHapusRuang(r.id)}>Hapus</button>
                        ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TabelKartu>
        )}
      </Kartu>

      {rekap !== null && <Rekap ruangId={rekap} onTutup={() => setRekap(null)} />}
    </div>
  );
}

// ======================================================================
// Satu kuis di bank
// ======================================================================
function KartuKuis({ kuis, bisaKelola, ruangAktif, sudahDimainkan, sibuk, aksi, bukaHost }: {
  kuis: KuisRingkas;
  bisaKelola: boolean;
  ruangAktif: boolean;
  sudahDimainkan: boolean;
  sibuk: boolean;
  aksi: (fn: () => Promise<unknown>, ok?: string) => Promise<void>;
  bukaHost: (ruangId: number) => void;
}) {
  const [pratinjau, setPratinjau] = useState<{ soal: SoalKuis[]; galat: string[]; nama: string } | null>(null);
  const [tersimpan, setTersimpan] = useState<SoalKuis[] | null>(null);
  const [lihat, setLihat] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [hapus, setHapus] = useState(false);
  const [ubahJudul, setUbahJudul] = useState<string | null>(null);
  const berkas = useRef<HTMLInputElement>(null);

  async function muatSoal() {
    try {
      const d = await fetchJson<{ soal: SoalKuis[] }>(`${URL_KUIS_ADMIN}?bagian=soal&kuis_id=${kuis.id}`);
      setTersimpan(d.soal);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }
  async function bacaBerkas(f: File | undefined) {
    if (!f) return;
    setPesan(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const nama = wb.SheetNames.find((n) => n.toLowerCase() === "soal") ?? wb.SheetNames[0];
      const baris = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nama], { header: 1, defval: "", blankrows: false });
      setPratinjau({ ...bacaBarisKuis(baris), nama: f.name });
    } catch {
      setPesan({ jenis: "galat", teks: "Berkas tidak dapat dibaca. Gunakan template .xlsx Adu Sigap yang diunduh dari halaman ini." });
    } finally {
      if (berkas.current) berkas.current.value = "";
    }
  }
  async function simpanSoal() {
    if (!pratinjau || pratinjau.galat.length > 0) return;
    await aksi(async () => {
      await kirim({ aksi: "simpan_soal", kuis_id: kuis.id, soal: pratinjau.soal });
      setPratinjau(null);
      setTersimpan(null);
      setLihat(false);
    }, `${pratinjau.soal.length} soal tersimpan di "${kuis.judul}".`);
  }
  async function bukaRuang() {
    await aksi(async () => {
      const r = await kirim<{ ruang_id: number }>({ aksi: "buka_ruang", kuis_id: kuis.id });
      bukaHost(r.ruang_id);
    });
  }

  return (
    <div className="rounded-xl border border-[#E3E8EE] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {ubahJudul === null ? (
          <p className="min-w-0 flex-1 text-[14px] font-bold">
            {kuis.judul}
            {bisaKelola && <button type="button" className="ml-2 text-[11.5px] font-semibold text-[#1F6FD1] hover:underline" onClick={() => setUbahJudul(kuis.judul)}>ubah judul</button>}
          </p>
        ) : (
          <form
            className="flex min-w-0 flex-1 gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const j = ubahJudul.trim();
              if (j) aksi(() => kirim({ aksi: "ubah_judul", kuis_id: kuis.id, judul: j }), "Judul diubah.").then(() => setUbahJudul(null));
            }}
          >
            <input className={`${INPUT} min-w-0 flex-1`} value={ubahJudul} maxLength={150} onChange={(e) => setUbahJudul(e.target.value)} aria-label="Judul kuis" />
            <button type="submit" className={BTN} disabled={sibuk}>Simpan</button>
            <button type="button" className={BTN_O} onClick={() => setUbahJudul(null)}>Batal</button>
          </form>
        )}
        {kuis.jumlah_soal > 0 ? <Chip w="ok">{kuis.jumlah_soal} soal · {menit(kuis.total_detik)}</Chip> : <Chip w="bad">Belum ada soal</Chip>}
        {sudahDimainkan && <Chip w="navy">pernah dimainkan</Chip>}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {bisaKelola && (
          <>
            <button type="button" className={BTN_G} disabled={sibuk || kuis.jumlah_soal === 0 || ruangAktif} title={ruangAktif ? "Akhiri ruang yang sedang aktif lebih dulu" : kuis.jumlah_soal === 0 ? "Unggah soal dulu" : undefined} onClick={bukaRuang}>
              ▶ Buka ruang kuis
            </button>
            <button type="button" className={BTN} disabled={sibuk || sudahDimainkan} title={sudahDimainkan ? "Kuis sudah pernah dimainkan: salin kuis lalu ubah salinannya" : undefined} onClick={() => berkas.current?.click()}>
              ⬆ Unggah soal (.xlsx)
            </button>
            <input ref={berkas} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => bacaBerkas(e.target.files?.[0])} />
          </>
        )}
        {bisaKelola && kuis.jumlah_soal > 0 && (
          <button type="button" className={BTN_O} onClick={() => { setLihat((v) => !v); if (!tersimpan) muatSoal(); }}>
            {lihat ? "Sembunyikan soal" : "Lihat soal"}
          </button>
        )}
        {bisaKelola && <button type="button" className={BTN_O} disabled={sibuk} onClick={() => aksi(() => kirim({ aksi: "duplikat_kuis", kuis_id: kuis.id }), "Kuis disalin.")}>⧉ Salin</button>}
        {bisaKelola &&
          (hapus ? (
            <>
              <button type="button" className={BTN_R} disabled={sibuk} onClick={() => aksi(() => kirim({ aksi: "hapus_kuis", kuis_id: kuis.id }), "Kuis dihapus.")}>Ya, hapus kuis ini</button>
              <button type="button" className={BTN_O} onClick={() => setHapus(false)}>Batal</button>
            </>
          ) : (
            <button type="button" className={BTN_R} onClick={() => setHapus(true)}>Hapus</button>
          ))}
      </div>
      {sudahDimainkan && bisaKelola && <p className="mt-1.5 text-[11.5px] text-[#9A6200]">Soal terkunci karena kuis sudah pernah dimainkan. Untuk mengubah soal, salin kuis ini.</p>}
      {bisaKelola && kuis.jumlah_soal === 0 && <p className="mt-1.5 text-[11.5px] text-[#7B8794]">Kolom template: {HEADER_TEMPLATE_KUIS.join(" · ")} (Detik {DETIK_MIN}–{DETIK_MAX}, kosong = 20).</p>}
      {pesan && (
        <div className="mt-2">
          <Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan>
        </div>
      )}

      {pratinjau && (
        <div className="mt-3 rounded-xl border border-[#CDD5DE] p-2.5">
          <p className="text-[12.5px] font-semibold">Pratinjau: {pratinjau.nama}</p>
          {pratinjau.galat.length > 0 ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-[#7F241E]">
              {pratinjau.galat.slice(0, 30).map((g, i) => (
                <li key={i}>{g}</li>
              ))}
              {pratinjau.galat.length > 30 && <li>… dan {pratinjau.galat.length - 30} kesalahan lain.</li>}
            </ul>
          ) : (
            <p className="mt-1 text-[12.5px] text-[#0E5E4E]">{pratinjau.soal.length} soal terbaca dengan benar. Simpan akan menimpa soal kuis ini.</p>
          )}
          {pratinjau.soal.length > 0 && <DaftarSoalKuis soal={pratinjau.soal} />}
          <div className="mt-2 flex gap-2">
            <button type="button" className={BTN_G} disabled={sibuk || pratinjau.galat.length > 0 || pratinjau.soal.length === 0} onClick={simpanSoal}>Simpan {pratinjau.soal.length} soal</button>
            <button type="button" className={BTN_O} onClick={() => setPratinjau(null)}>Batal</button>
          </div>
        </div>
      )}
      {lihat && tersimpan && !pratinjau && (
        <div className="mt-3 rounded-xl border border-[#E3E8EE] p-2.5">
          <DaftarSoalKuis soal={tersimpan} />
        </div>
      )}
    </div>
  );
}

function DaftarSoalKuis({ soal }: { soal: SoalKuis[] }) {
  return (
    <ol className="mt-2 max-h-[340px] space-y-2 overflow-y-auto pr-1">
      {soal.map((s) => (
        <li key={s.nomor} className="rounded-lg bg-[#F8FAFC] px-2.5 py-2 text-[12.5px]">
          <p className="font-semibold">
            {s.nomor}. {s.teks} <span className="font-normal text-[#7B8794]">({s.detik} detik)</span>
          </p>
          <ul className="mt-0.5">
            {s.opsi.map((o) => (
              <li key={o.kode} className={o.kode === s.kunci ? "font-bold text-[#0E5E4E]" : "text-[#55657D]"}>
                <span style={{ color: WARNA_OPSI[o.kode]?.bg }}>{WARNA_OPSI[o.kode]?.simbol}</span> {o.kode}. {o.teks} {o.kode === s.kunci && "✔"}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// ======================================================================
// Rekap satu ruang
// ======================================================================
type RekapPeserta = { akun_id: number; nama: string; jenis_akun: string; peran: string; kelas: number | null; ikut: boolean; poin: number | null; benar: number | null; menjawab: number | null; rata_waktu_ms: number | null; peringkat: number | null };
type RekapSoal = { nomor: number; teks: string; kunci: string; detik: number; menjawab: number; benar: number; persen_benar: number | null; sebaran: Record<string, number> };
type RekapData = { sekarang: string; ruang: { id: number; judul: string; status: string; dibuka_at: string; selesai_at: string | null }; jumlah_soal: number; peserta: RekapPeserta[]; soal: RekapSoal[] };

function Rekap({ ruangId, onTutup }: { ruangId: number; onTutup: () => void }) {
  const [d, setD] = useState<RekapData | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [jenis, setJenis] = useState("");
  const [kelas, setKelas] = useState("");
  const [tampil, setTampil] = useState<"ikut" | "semua" | "tidak">("ikut");
  const [cari, setCari] = useState("");

  const muat = useCallback(async () => {
    try {
      setD(await fetchJson<RekapData>(`${URL_KUIS_ADMIN}?bagian=rekap&ruang_id=${ruangId}`));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [ruangId]);
  useEffect(() => {
    setD(null);
    muat();
  }, [muat]);

  const baris = useMemo(
    () =>
      (d?.peserta ?? []).filter((p) => {
        if (tampil === "ikut" && !p.ikut) return false;
        if (tampil === "tidak" && p.ikut) return false;
        if (jenis && p.jenis_akun !== jenis) return false;
        if (kelas && String(p.kelas ?? "") !== kelas) return false;
        if (cari && !p.nama.toLowerCase().includes(cari.toLowerCase())) return false;
        return true;
      }),
    [d, jenis, kelas, tampil, cari]
  );

  async function ekspor() {
    if (!d) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const aoa: (string | number)[][] = [["Peringkat", "Nama", "Jenis", "Kelas", "Peran", "Ikut kuis", "Poin", "Benar", "Dijawab", "Jumlah soal", "% benar", "Rata-rata waktu jawab (dtk)"]];
    baris.forEach((p) =>
      aoa.push([p.peringkat ?? "", p.nama, p.jenis_akun === "organik" ? "Organik" : "Mitra", p.kelas ?? "", p.peran.toUpperCase(), p.ikut ? "Ya" : "Tidak", p.poin ?? "", p.benar ?? "", p.menjawab ?? "", d.jumlah_soal, p.benar != null && d.jumlah_soal ? Math.round((p.benar / d.jumlah_soal) * 1000) / 10 : "", p.rata_waktu_ms != null ? Math.round(p.rata_waktu_ms / 100) / 10 : ""])
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 10 }, { wch: 32 }, { wch: 9 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 9 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, "Peserta");
    const wa = XLSX.utils.aoa_to_sheet([["Soal", "Teks", "Kunci", "Detik", "Menjawab", "Benar", "% benar", "Sebaran jawaban"], ...d.soal.map((s) => [s.nomor, s.teks, s.kunci, s.detik, s.menjawab, s.benar, s.persen_benar ?? "", Object.entries(s.sebaran).map(([k, n]) => `${k}:${n}`).join("  ")])]);
    wa["!cols"] = [{ wch: 6 }, { wch: 70 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, wa, "Per soal");
    XLSX.writeFile(wb, `Rekap_Kuis_Live_${d.ruang.judul.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Kuis"}_${new Date().toISOString().slice(0, 10)}${jenis || kelas || cari || tampil !== "ikut" ? "_filter" : ""}.xlsx`);
  }

  const fmt = (n: number | null | undefined) => (n == null ? "—" : String(n).replace(".", ","));
  const nIkut = d?.peserta.filter((p) => p.ikut).length ?? 0;
  const rata = nIkut ? Math.round(((d?.peserta.filter((p) => p.ikut).reduce((a, p) => a + (p.poin ?? 0), 0) ?? 0) / nIkut) * 10) / 10 : null;

  return (
    <Kartu
      judul={`Rekap: ${d?.ruang.judul ?? "…"}`}
      ket={d ? `${nIkut} peserta ikut · rata-rata poin ${fmt(rata)} · ${d.jumlah_soal} soal` : undefined}
      kanan={
        <span className="flex gap-1.5">
          <button type="button" className={BTN_O} onClick={muat}>↻ Segarkan</button>
          <button type="button" className={BTN_O} onClick={ekspor} disabled={!d}>⬇ Ekspor Excel</button>
          <button type="button" className={BTN_O} onClick={onTutup}>✕ Tutup</button>
        </span>
      }
    >
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {!d && !galat && <Memuat />}
      {d && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter rekap">
            <select className={INPUT} value={tampil} onChange={(e) => setTampil(e.target.value as "ikut" | "semua" | "tidak")} aria-label="Keikutsertaan">
              <option value="ikut">Yang ikut kuis</option>
              <option value="tidak">Belum/tidak ikut</option>
              <option value="semua">Semua peserta pelatihan</option>
            </select>
            <select className={INPUT} value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Filter jenis">
              <option value="">Organik & Mitra</option>
              <option value="organik">Organik</option>
              <option value="mitra">Mitra</option>
            </select>
            <select className={INPUT} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Filter kelas">
              <option value="">Semua kelas</option>
              {[1, 2, 3, 4].map((k) => (
                <option key={k} value={k}>Kelas {k}</option>
              ))}
            </select>
            <input className={`${INPUT} min-w-[150px] flex-1`} placeholder="Cari nama…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari nama" />
          </div>
          <TabelKartu className="!shadow-none">
            <thead>
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Nama</th>
                <th className={TH}>Kls</th>
                <th className={TH}>Peran</th>
                <th className={TH}>Jenis</th>
                <th className={TH}>Poin</th>
                <th className={TH}>Benar</th>
                <th className={TH}>Rata waktu</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((p) => (
                <tr key={p.akun_id}>
                  <td className={`${TD} font-bold tabular-nums`}>{p.peringkat ?? "–"}</td>
                  <td className={`${TD} font-semibold`}>{p.nama}</td>
                  <td className={TD}>{p.kelas ?? "–"}</td>
                  <td className={TD}>{p.peran ? p.peran.toUpperCase() : "–"}</td>
                  <td className={TD}>{p.jenis_akun === "organik" ? "Organik" : "Mitra"}</td>
                  <td className={`${TD} font-bold tabular-nums`}>{p.ikut ? p.poin : <Chip>tidak ikut</Chip>}</td>
                  <td className={`${TD} tabular-nums`}>{p.ikut ? `${p.benar}/${d.jumlah_soal}` : "—"}</td>
                  <td className={`${TD} tabular-nums`}>{p.rata_waktu_ms != null ? `${fmt(Math.round(p.rata_waktu_ms / 100) / 10)} dtk` : "—"}</td>
                </tr>
              ))}
              {baris.length === 0 && (
                <tr>
                  <td className={`${TD} text-center text-[#7B8794]`} colSpan={8}>Tidak ada peserta yang cocok.</td>
                </tr>
              )}
            </tbody>
          </TabelKartu>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Per soal</p>
            <div className="space-y-1.5">
              {d.soal.map((s) => (
                <div key={s.nomor} className="rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <b className="w-7 shrink-0">{s.nomor}.</b>
                    <span className="min-w-0 flex-1 truncate" title={s.teks}>{s.teks}</span>
                    <span className="shrink-0 font-bold tabular-nums">{s.persen_benar == null ? "—" : `${fmt(s.persen_benar)}%`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E3E8EE]">
                    <div className="h-full rounded-full" style={{ width: `${s.persen_benar ?? 0}%`, background: (s.persen_benar ?? 0) < 50 ? "#C0392B" : "#1E7A4C" }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#7B8794]">Kunci {s.kunci} · sebaran {Object.entries(s.sebaran).map(([k, n]) => `${k}:${n}`).join("  ")} · {s.menjawab} menjawab</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Kartu>
  );
}
