"use client";

// app/sigap/pelatihan/kelola/koreksi.tsx
//
// (6 Nov 2026) Tab Kendala, bagian kedua: KENDALA TES (tambah waktu / buka ulang / buka kunci), SOAL BERMASALAH (nonaktifkan + hitung ulang nilai),
// PINDAH KELAS / ATASAN, dan TAMBAH PESERTA MENDADAK. Semua lewat jendela pilihan (<= 2 klik + alasan), dampak ditampilkan sebelum diterapkan,
// setiap tindakan tercatat di Riwayat dan bisa diurungkan selama keadaannya belum berubah. API: /api/sigap/pelatihan/koreksi. SQL: 20261106a_pelatihan_koreksi.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Toast, useToast } from "../../admin/Toast";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import SelectCari from "@/app/components/SelectCari";

type StatusTes = "belum" | "mengerjakan" | "selesai" | "waktu_habis";
type Peserta = {
  akun_id: number;
  nama: string;
  peran: string;
  kelas: number | null;
  atasan_akun_id: number | null;
  atasan_nama: string | null;
  bawahan: number;
  kecamatan: string | null;
  tes: Record<string, { status: StatusTes; batas_at: string | null; selesai_at: string | null; skor: number | null; percobaan: number } | null>;
};
type Soal = { nomor: number; teks: string; kunci: string; bobot: number; aktif: boolean };
type Tes = { id: number; jenis: string; judul: string; buka_at: string; tutup_at: string; durasi_menit: number; aktif: boolean; soal: Soal[] };
type Riwayat = { id: number; jenis: string; label: string; akun_id: number | null; nama: string | null; alasan: string; ringkas: string; at: string; oleh_nama: string | null; dibatalkan_at: string | null; bisa_urung: boolean; alasan_tak_bisa: string | null };
type Papan = { tersedia: boolean; soal_siap: boolean; sekarang: string; tes: Tes[]; peserta: Peserta[]; kelas: number[]; riwayat: Riwayat[]; boleh_kelola: boolean };
type Dampak = { peserta_selesai: number; berubah: number; rata_sebelum: number | null; rata_sesudah: number | null; lulus_naik: number; lulus_turun: number; contoh: { akun_id: number; nama: string; sebelum: number | null; sesudah: number | null }[] };
type Kandidat = { akun_id: number; nama: string; kecamatan: string | null };
type Modal = { t: "tes"; akun_id: number; tes_id: number } | { t: "soal"; tes_id: number; nomor: number[] } | { t: "pindah"; akun_id: number } | { t: "tambah" } | null;

const URL_API = "/api/sigap/pelatihan/koreksi";
const LABEL_STATUS: Record<StatusTes, string> = { belum: "Belum mulai", mengerjakan: "Sedang mengerjakan", selesai: "Sudah selesai", waktu_habis: "Waktu habis (belum dinilai)" };
const PERAN: Record<string, number> = { ppl: 1, pml: 2, korwil: 3 };
const peranTeks = (p: string) => p.toUpperCase();
const ALASAN_CEPAT = ["HP mati / rusak", "Jaringan terputus", "Salah kirim", "Soal bermasalah", "Terlambat hadir"];

function waktu(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
}
const jam = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(":", ".") : "");
const angkaSkor = (n: number | null) => (n === null ? "—" : String(Math.round(n * 100) / 100));

export default function KoreksiKelola() {
  const [d, setD] = useState<Papan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [tesPilih, setTesPilih] = useState("");
  const [pesertaTes, setPesertaTes] = useState("");
  const [tesSoal, setTesSoal] = useState("");
  const [centang, setCentang] = useState<number[]>([]);
  const [pesertaPindah, setPesertaPindah] = useState("");
  const [sibuk, setSibuk] = useState<number | null>(null);
  const toast = useToast();

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Papan>(urlPelatihan(URL_API));
      setD(r);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  const tes = d?.tes ?? [];
  const peserta = d?.peserta ?? [];
  const boleh = !!d?.boleh_kelola && !!d?.tersedia;
  const tesDipilih = tes.find((t) => String(t.id) === tesPilih) ?? null;
  const tesSoalDipilih = tes.find((t) => String(t.id) === tesSoal) ?? null;

  // bawaan: tes pertama
  useEffect(() => {
    if (tes.length > 0) {
      setTesPilih((x) => (x && tes.some((t) => String(t.id) === x) ? x : String(tes[0].id)));
      setTesSoal((x) => (x && tes.some((t) => String(t.id) === x) ? x : String(tes[0].id)));
    }
  }, [tes]);
  useEffect(() => setCentang([]), [tesSoal]);

  const ringkasStatus = useMemo(() => {
    const hitung: Record<StatusTes, number> = { belum: 0, mengerjakan: 0, selesai: 0, waktu_habis: 0 };
    if (!tesDipilih) return hitung;
    for (const p of peserta) hitung[p.tes[tesDipilih.jenis]?.status ?? "belum"]++;
    return hitung;
  }, [peserta, tesDipilih]);

  async function urungkan(r: Riwayat) {
    setSibuk(r.id);
    toast.tampil("simpan", "Mengurungkan…");
    try {
      const h = await fetchJson<{ ringkas: string }>(urlPelatihan(URL_API), { method: "POST", body: JSON.stringify({ aksi: "urungkan", id: r.id }) });
      toast.tampil("ok", h.ringkas);
      await muat();
    } catch (e) {
      toast.tampil("galat", e instanceof SesiBerakhir ? "Sesi berakhir, masuk kembali." : pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  if (!d && !galat) return <Memuat />;

  const selesai = async (ringkas: string) => {
    setModal(null);
    setCentang([]);
    toast.tampil("ok", ringkas);
    await muat();
  };
  const gagal = (teks: string) => toast.tampil("galat", teks);

  return (
    <div className="mt-3 space-y-3" data-testid="panel-koreksi">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {d && !d.tersedia && <Pesan jenis="peringatan">Bagian ini belum aktif. Jalankan dulu SQL 20261106a_pelatihan_koreksi di Supabase, lalu muat ulang halaman ini.</Pesan>}
      {d && d.tersedia && !d.soal_siap && <Pesan jenis="peringatan">Menonaktifkan soal belum bisa dipakai: kolom “aktif” pada soal belum ada. Jalankan SQL 20261106a_pelatihan_koreksi.</Pesan>}

      <Kartu judul="Kendala tes" ket="Peserta tertahan: HP mati, jaringan putus, salah kirim. Tambah waktu bila ia masih mengerjakan, buka ulang bila sudah terkirim. Wajib beralasan; bisa diurungkan.">
        {tes.length === 0 ? (
          <p className="text-[13px] text-[#6B7A90]">Belum ada pretest/posttest pada pelatihan ini.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SelectCari className={`${INPUT} min-w-[10rem]`} value={tesPilih} onChange={(e) => setTesPilih(e.target.value)} aria-label="Pilih tes">
                {tes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.judul}
                  </option>
                ))}
              </SelectCari>
              <SelectCari className={`${INPUT} min-w-[18rem]`} value={pesertaTes} onChange={(e) => setPesertaTes(e.target.value)} aria-label="Pilih peserta">
                <option value="">Pilih peserta…</option>
                {peserta.map((p) => (
                  <option key={p.akun_id} value={p.akun_id}>
                    {p.nama}
                    {p.kelas != null ? ` · kelas ${p.kelas}` : ""} · {LABEL_STATUS[p.tes[tesDipilih?.jenis ?? ""]?.status ?? "belum"]}
                  </option>
                ))}
              </SelectCari>
              <button type="button" className={BTN} disabled={!boleh || !pesertaTes || !tesDipilih} onClick={() => setModal({ t: "tes", akun_id: Number(pesertaTes), tes_id: Number(tesPilih) })}>
                Tangani
              </button>
            </div>
            <p className="flex flex-wrap gap-1.5 text-[12px] text-[#6B7A90]" data-testid="ringkas-status-tes">
              <Chip w="wait">Mengerjakan {ringkasStatus.mengerjakan}</Chip>
              <Chip w={ringkasStatus.waktu_habis > 0 ? "bad" : "mut"}>Waktu habis, belum dinilai {ringkasStatus.waktu_habis}</Chip>
              <Chip w="ok">Selesai {ringkasStatus.selesai}</Chip>
              <Chip w="mut">Belum mulai {ringkasStatus.belum}</Chip>
            </p>
          </div>
        )}
      </Kartu>

      <Kartu judul="Soal bermasalah" ket="Kunci salah atau soal ambigu: nonaktifkan soalnya, lalu nilai semua peserta dihitung ulang dari jawaban yang tersimpan. Soal tidak dihapus; urungkan mengembalikan nilai semula.">
        {tes.length === 0 ? (
          <p className="text-[13px] text-[#6B7A90]">Belum ada tes.</p>
        ) : (
          <div className="space-y-2">
            <SelectCari className={`${INPUT} min-w-[10rem]`} value={tesSoal} onChange={(e) => setTesSoal(e.target.value)} aria-label="Pilih tes untuk soal">
              {tes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.judul}
                </option>
              ))}
            </SelectCari>
            {tesSoalDipilih && tesSoalDipilih.soal.length === 0 && <p className="text-[13px] text-[#6B7A90]">Tes ini belum punya soal.</p>}
            {tesSoalDipilih && tesSoalDipilih.soal.length > 0 && (
              <ul className="max-h-72 divide-y divide-[#E6ECF5] overflow-y-auto rounded-lg border border-[#DDE6F3]" data-testid="daftar-soal">
                {tesSoalDipilih.soal.map((s) => (
                  <li key={s.nomor}>
                    <label className={`flex items-start gap-2 px-3 py-2 text-[13px] ${s.aktif ? "cursor-pointer hover:bg-[#FAFCFF]" : "bg-[#F6F8FB] text-[#8795AB]"}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={!s.aktif || !boleh || !d?.soal_siap}
                        checked={centang.includes(s.nomor)}
                        onChange={(e) => setCentang((c) => (e.target.checked ? [...c, s.nomor] : c.filter((x) => x !== s.nomor)))}
                        aria-label={`Soal ${s.nomor}`}
                      />
                      <span className="w-7 shrink-0 font-semibold">{s.nomor}.</span>
                      <span className="min-w-0 flex-1 break-words">{s.teks.length > 140 ? `${s.teks.slice(0, 140)}…` : s.teks}</span>
                      <span className="shrink-0 text-[12px]">kunci {s.kunci}</span>
                      {!s.aktif && <Chip w="mut">Nonaktif</Chip>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className={BTN} disabled={!boleh || !d?.soal_siap || centang.length === 0 || !tesSoalDipilih} onClick={() => tesSoalDipilih && setModal({ t: "soal", tes_id: tesSoalDipilih.id, nomor: [...centang].sort((a, b) => a - b) })}>
              Nonaktifkan yang dipilih{centang.length > 0 ? ` (${centang.length})` : ""}…
            </button>
          </div>
        )}
      </Kartu>

      <Kartu judul="Pindah kelas atau atasan" ket="Satu jendela untuk keduanya. Dampak pada isi kelas dan jumlah bawahan ditampilkan sebelum diterapkan.">
        <div className="flex flex-wrap items-center gap-2">
          <SelectCari className={`${INPUT} min-w-[18rem]`} value={pesertaPindah} onChange={(e) => setPesertaPindah(e.target.value)} aria-label="Pilih peserta yang dipindah">
            <option value="">Pilih peserta…</option>
            {peserta.map((p) => (
              <option key={p.akun_id} value={p.akun_id}>
                {p.nama} · {peranTeks(p.peran)}
                {p.kelas != null ? ` · kelas ${p.kelas}` : ""}
                {p.atasan_nama ? ` · atasan ${p.atasan_nama}` : ""}
              </option>
            ))}
          </SelectCari>
          <button type="button" className={BTN} disabled={!boleh || !pesertaPindah} onClick={() => setModal({ t: "pindah", akun_id: Number(pesertaPindah) })}>
            Atur
          </button>
        </div>
      </Kartu>

      <Kartu judul="Tambah peserta mendadak" ket="Cari nama mitra, tentukan peran dan kelas. Peserta baru mewarisi pengaturan kelas (mode, jadwal) dan jatah hari sekelas, lalu menerima undangan di HP.">
        <button type="button" className={BTN} disabled={!boleh} onClick={() => setModal({ t: "tambah" })}>
          Tambah peserta…
        </button>
      </Kartu>

      <Kartu judul="Riwayat koreksi" ket="Terbaru di atas. Urungkan hanya bisa selama keadaannya belum berubah (mis. peserta belum melanjutkan tes).">
        {d && d.riwayat.length === 0 && <p className="text-[13px] text-[#6B7A90]">Belum ada koreksi.</p>}
        {d && d.riwayat.length > 0 && (
          <ul className="divide-y divide-[#E6ECF5] rounded-lg border border-[#DDE6F3]" data-testid="riwayat-koreksi">
            {d.riwayat.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-[#1B2B4B]">
                    <span className="font-semibold">{r.label}</span> · {r.ringkas}
                  </p>
                  <p className="text-[12px] text-[#6B7A90]">
                    {waktu(r.at)}
                    {r.oleh_nama ? ` · oleh ${r.oleh_nama}` : ""} · alasan: {r.alasan}
                    {!r.dibatalkan_at && !r.bisa_urung && r.alasan_tak_bisa ? ` · tidak bisa diurungkan: ${r.alasan_tak_bisa}` : ""}
                  </p>
                </div>
                {r.dibatalkan_at && <Chip w="mut">Diurungkan</Chip>}
                {boleh && r.bisa_urung && (
                  <button type="button" className={BTN_O} disabled={sibuk === r.id} onClick={() => void urungkan(r)}>
                    Urungkan
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kartu>

      {modal?.t === "tes" && d && <ModalTes papan={d} akunId={modal.akun_id} tesId={modal.tes_id} tutup={() => setModal(null)} selesai={selesai} galat={gagal} />}
      {modal?.t === "soal" && d && <ModalSoal papan={d} tesId={modal.tes_id} nomor={modal.nomor} tutup={() => setModal(null)} selesai={selesai} galat={gagal} />}
      {modal?.t === "pindah" && d && <ModalPindah papan={d} akunId={modal.akun_id} tutup={() => setModal(null)} selesai={selesai} galat={gagal} />}
      {modal?.t === "tambah" && d && <ModalTambah papan={d} tutup={() => setModal(null)} selesai={selesai} galat={gagal} />}
      <Toast isi={toast.isi} onTutup={toast.tutup} />
    </div>
  );
}

// ----------------------------------------------------------------------
// Kerangka jendela
// ----------------------------------------------------------------------
type PropJendela = { judul: string; sub?: string; tutup: () => void; sibuk: boolean; children: React.ReactNode; aksi: React.ReactNode; tes?: string };

function Jendela({ judul, sub, tutup, sibuk, children, aksi, tes }: PropJendela) {
  useTutupDenganBack(true, tutup); // Back HP / tombol Back menutup jendela ini (penjaga Back)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sibuk) tutup();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [tutup, sibuk]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label={judul} data-testid={tes ?? "modal-koreksi"} onMouseDown={(e) => e.target === e.currentTarget && !sibuk && tutup()}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3">
          <h3 className="text-[16px] font-bold text-[#1B2B4B]">{judul}</h3>
          {sub && <p className="text-[12.5px] text-[#6B7A90]">{sub}</p>}
        </div>
        <div className="space-y-3">{children}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={BTN_O} disabled={sibuk} onClick={tutup}>
            Batal
          </button>
          {aksi}
        </div>
      </div>
    </div>
  );
}

function KotakAlasan({ alasan, setAlasan }: { alasan: string; setAlasan: (s: string) => void }) {
  return (
    <div>
      <label className="block text-[12.5px] font-semibold text-[#5B6B84]">
        Alasan (wajib)
        <textarea className={`${INPUT} mt-1 w-full`} rows={2} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. HP peserta mati saat mengerjakan" data-testid="alasan" />
      </label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {ALASAN_CEPAT.map((a) => (
          <button key={a} type="button" className="rounded-full border border-[#DDE6F3] px-2.5 py-0.5 text-[12px] text-[#3B4A63] hover:bg-[#F5F8FE]" onClick={() => setAlasan(a)}>
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

async function kirim<T>(isi: Record<string, unknown>): Promise<T> {
  return fetchJson<T>(urlPelatihan(URL_API), { method: "POST", body: JSON.stringify(isi) });
}
const pesanKesalahan = (e: unknown) => (e instanceof SesiBerakhir ? "Sesi berakhir, masuk kembali." : pesanGalat(e));

type PropModal = { papan: Papan; tutup: () => void; selesai: (ringkas: string) => void | Promise<void>; galat: (teks: string) => void };

// ----------------------------------------------------------------------
// Kendala tes peserta
// ----------------------------------------------------------------------
function ModalTes({ papan, akunId, tesId, tutup, selesai, galat }: PropModal & { akunId: number; tesId: number }) {
  const p = papan.peserta.find((x) => x.akun_id === akunId);
  const tes = papan.tes.find((x) => x.id === tesId);
  const [menit, setMenit] = useState("15");
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  if (!p || !tes) return null;
  const s = p.tes[tes.jenis];
  const status: StatusTes = s?.status ?? "belum";
  const berjalan = status === "mengerjakan" || status === "waktu_habis";
  const layak = alasan.trim().length >= 3;

  async function terapkan() {
    if (!p || !tes || !layak) return;
    setSibuk(true);
    try {
      if (status === "belum") {
        await fetchJson(urlPelatihan("/api/sigap/pelatihan/izin-buka"), { method: "POST", body: JSON.stringify({ aksi: "buka", akun_id: p.akun_id, tahap: tes.jenis, alasan: alasan.trim() }) });
        await selesai(`${p.nama}: ${tes.judul} dibuka untuk hari ini (sampai 23.59 WIB).`);
        return;
      }
      const h = await kirim<{ ringkas: string }>({ aksi: berjalan ? "tambah_waktu" : "buka_ulang", akun_id: p.akun_id, tes_id: tes.id, menit: Number(menit), alasan: alasan.trim() });
      await selesai(h.ringkas);
    } catch (e) {
      galat(pesanKesalahan(e));
      setSibuk(false);
    }
  }

  const judulAksi = status === "belum" ? "Buka kunci hari ini" : berjalan ? "Tambah waktu" : "Buka ulang";
  return (
    <Jendela
      tes="modal-tes"
      judul={`${judulAksi}: ${p.nama}`}
      sub={`${tes.judul} · ${LABEL_STATUS[status]}${s?.skor != null ? ` · skor ${angkaSkor(s.skor)}` : ""}${s?.batas_at && berjalan ? ` · batas ${jam(s.batas_at)}` : ""}`}
      tutup={tutup}
      sibuk={sibuk}
      aksi={
        <button type="button" className={BTN} disabled={!layak || sibuk} onClick={() => void terapkan()}>
          {sibuk ? "Menerapkan…" : judulAksi}
        </button>
      }
    >
      {status === "belum" && <p className="rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#3B4A63]">Peserta belum memulai tes ini. Bila jadwal tes sudah ditutup atau tahapan sebelumnya mengunci, buka kunci memberi jendela tes pribadi sampai 23.59 WIB hari ini (tidak bisa diurungkan dari sini).</p>}
      {berjalan && (
        <p className="rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#3B4A63]">
          {status === "waktu_habis" ? "Waktunya sudah lewat tetapi belum dinilai; tambahan waktu dihitung dari sekarang." : "Tambahan waktu dihitung dari sisa waktunya."} Jawaban yang sudah tersimpan tetap.
        </p>
      )}
      {status === "selesai" && <p className="rounded-lg bg-[#FFF6E5] px-3 py-2 text-[12.5px] text-[#92400E]">Percobaan ini dibuka kembali: jawaban tersimpan tetap, skor {s?.skor != null ? `${angkaSkor(s.skor)} ` : ""}dikosongkan sementara dan dihitung lagi saat peserta mengirim. Urungkan hanya bisa sebelum ia mengubah jawaban.</p>}
      {status !== "belum" && (
        <label className="block text-[12.5px] font-semibold text-[#5B6B84]">
          Waktu tambahan
          <SelectCari className={`${INPUT} mt-1 w-full`} value={menit} onChange={(e) => setMenit(e.target.value)} aria-label="Waktu tambahan">
            {["5", "10", "15", "20", "30", "45", "60"].map((m) => (
              <option key={m} value={m}>
                {m} menit
              </option>
            ))}
          </SelectCari>
        </label>
      )}
      <KotakAlasan alasan={alasan} setAlasan={setAlasan} />
    </Jendela>
  );
}

// ----------------------------------------------------------------------
// Nonaktifkan soal
// ----------------------------------------------------------------------
function ModalSoal({ papan, tesId, nomor, tutup, selesai, galat }: PropModal & { tesId: number; nomor: number[] }) {
  const tes = papan.tes.find((x) => x.id === tesId);
  const [dampak, setDampak] = useState<Dampak | null>(null);
  const [galatPratinjau, setGalatPratinjau] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const r = await fetchJson<{ dampak: Dampak }>(urlPelatihan(`${URL_API}?pratinjau=soal&tes=${tesId}&nomor=${nomor.join(",")}`));
        if (!batal) setDampak(r.dampak);
      } catch (e) {
        if (!batal) setGalatPratinjau(pesanKesalahan(e));
      }
    })();
    return () => {
      batal = true;
    };
  }, [tesId, nomor]);

  if (!tes) return null;
  const layak = alasan.trim().length >= 3 && !!dampak && !sibuk;

  async function terapkan() {
    if (!layak) return;
    setSibuk(true);
    try {
      const h = await kirim<{ ringkas: string }>({ aksi: "nonaktif_soal", tes_id: tesId, nomor, alasan: alasan.trim() });
      await selesai(h.ringkas);
    } catch (e) {
      galat(pesanKesalahan(e));
      setSibuk(false);
    }
  }

  return (
    <Jendela
      tes="modal-soal"
      judul={`Nonaktifkan soal ${nomor.join(", ")}`}
      sub={tes.judul}
      tutup={tutup}
      sibuk={sibuk}
      aksi={
        <button type="button" className={BTN} disabled={!layak} onClick={() => void terapkan()}>
          {sibuk ? "Menghitung ulang…" : "Nonaktifkan & hitung ulang"}
        </button>
      }
    >
      <div className="rounded-lg border border-[#DDE6F3] px-3 py-2 text-[13px]" data-testid="pratinjau-soal">
        {!dampak && !galatPratinjau && <p className="text-[#6B7A90]">Menghitung dampak…</p>}
        {galatPratinjau && <p className="text-[#B91C1C]">{galatPratinjau}</p>}
        {dampak && (
          <>
            <p className="font-semibold text-[#1B2B4B]">
              {dampak.berubah} dari {dampak.peserta_selesai} peserta yang sudah selesai nilainya berubah.
            </p>
            {dampak.rata_sebelum !== null && dampak.rata_sesudah !== null && (
              <p className="text-[#3B4A63]">
                Rata-rata nilai resmi: {angkaSkor(dampak.rata_sebelum)} → <b>{angkaSkor(dampak.rata_sesudah)}</b>
              </p>
            )}
            {(dampak.lulus_naik > 0 || dampak.lulus_turun > 0) && (
              <p className="text-[#3B4A63]">
                Kelulusan: {dampak.lulus_naik} menjadi lulus, {dampak.lulus_turun} tidak lagi lulus.
              </p>
            )}
            {dampak.contoh.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[12.5px] text-[#5B6B84]">
                {dampak.contoh.map((c) => (
                  <li key={c.akun_id}>
                    {c.nama}: {angkaSkor(c.sebelum)} → {angkaSkor(c.sesudah)}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-[12px] text-[#6B7A90]">Peserta yang masih mengerjakan dinilai tanpa soal ini saat mengirim. Soal tidak dihapus; urungkan mengaktifkannya lagi dan memulihkan nilai.</p>
          </>
        )}
      </div>
      <KotakAlasan alasan={alasan} setAlasan={setAlasan} />
    </Jendela>
  );
}

// ----------------------------------------------------------------------
// Pindah kelas / atasan
// ----------------------------------------------------------------------
function ModalPindah({ papan, akunId, tutup, selesai, galat }: PropModal & { akunId: number }) {
  const p = papan.peserta.find((x) => x.akun_id === akunId);
  const [kelas, setKelas] = useState(p?.kelas != null ? String(p.kelas) : "");
  const [atasan, setAtasan] = useState(p?.atasan_akun_id != null ? String(p.atasan_akun_id) : "");
  const [ikut, setIkut] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const opsiKelas = useMemo(() => {
    const s = new Set<number>(papan.kelas);
    if (p?.kelas != null) s.add(p.kelas);
    const maks = Math.max(0, ...s);
    s.add(maks + 1);
    return [...s].sort((a, b) => a - b);
  }, [papan.kelas, p]);

  if (!p) return null;
  const kelasBaru = kelas === "" ? null : Number(kelas);
  const atasanBaru = atasan === "" ? null : Number(atasan);
  const kelasBerubah = kelasBaru !== p.kelas;
  const atasanBerubah = atasanBaru !== p.atasan_akun_id;
  const layak = (kelasBerubah || atasanBerubah) && alasan.trim().length >= 3 && !sibuk;
  const isiKelas = (k: number | null) => papan.peserta.filter((x) => x.kelas === k).length;
  const atasanLama = papan.peserta.find((x) => x.akun_id === p.atasan_akun_id) ?? null;
  const atasanTerpilih = papan.peserta.find((x) => x.akun_id === atasanBaru) ?? null;
  const peringatanPeran = atasanTerpilih && (PERAN[atasanTerpilih.peran] ?? 0) <= (PERAN[p.peran] ?? 0);

  async function terapkan() {
    if (!layak || !p) return;
    setSibuk(true);
    try {
      const h = await kirim<{ ringkas: string }>({ aksi: "pindah", akun_id: p.akun_id, ...(kelasBerubah ? { kelas: kelasBaru } : {}), ...(atasanBerubah ? { atasan_akun_id: atasanBaru } : {}), bawahan_ikut: kelasBerubah && ikut, alasan: alasan.trim() });
      await selesai(h.ringkas);
    } catch (e) {
      galat(pesanKesalahan(e));
      setSibuk(false);
    }
  }

  return (
    <Jendela
      tes="modal-pindah"
      judul={`Pindah kelas / atasan: ${p.nama}`}
      sub={`${peranTeks(p.peran)}${p.kelas != null ? ` · kelas ${p.kelas}` : " · tanpa kelas"}${p.atasan_nama ? ` · atasan ${p.atasan_nama}` : ""}${p.bawahan > 0 ? ` · ${p.bawahan} bawahan` : ""}`}
      tutup={tutup}
      sibuk={sibuk}
      aksi={
        <button type="button" className={BTN} disabled={!layak} onClick={() => void terapkan()}>
          {sibuk ? "Menerapkan…" : "Terapkan"}
        </button>
      }
    >
      <label className="block text-[12.5px] font-semibold text-[#5B6B84]">
        Kelas
        <SelectCari className={`${INPUT} mt-1 w-full`} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas baru">
          <option value="">Tanpa kelas</option>
          {opsiKelas.map((k) => (
            <option key={k} value={k}>
              Kelas {k}
              {papan.kelas.includes(k) ? "" : " (baru)"}
            </option>
          ))}
        </SelectCari>
      </label>
      <label className="block text-[12.5px] font-semibold text-[#5B6B84]">
        Atasan
        <SelectCari className={`${INPUT} mt-1 w-full`} value={atasan} onChange={(e) => setAtasan(e.target.value)} aria-label="Atasan baru">
          <option value="">Tanpa atasan</option>
          {papan.peserta
            .filter((x) => x.akun_id !== p.akun_id)
            .map((x) => (
              <option key={x.akun_id} value={x.akun_id}>
                {x.nama} · {peranTeks(x.peran)}
                {x.kelas != null ? ` · kelas ${x.kelas}` : ""} · {x.bawahan} bawahan
              </option>
            ))}
        </SelectCari>
      </label>
      {kelasBerubah && p.bawahan > 0 && (
        <label className="flex items-start gap-2 text-[13px] text-[#1B2B4B]">
          <input type="checkbox" className="mt-1" checked={ikut} onChange={(e) => setIkut(e.target.checked)} />
          <span>
            {p.bawahan} bawahan langsung ikut pindah ke {kelasBaru != null ? `kelas ${kelasBaru}` : "tanpa kelas"}
          </span>
        </label>
      )}
      {(kelasBerubah || atasanBerubah) && (
        <div className="rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#3B4A63]" data-testid="dampak-pindah">
          {kelasBerubah && (
            <p>
              Kelas {p.kelas ?? "—"} → {kelasBaru ?? "—"}: isi kelas asal {isiKelas(p.kelas)} → {isiKelas(p.kelas) - 1 - (ikut ? p.bawahan : 0)}, kelas tujuan {isiKelas(kelasBaru)} → {isiKelas(kelasBaru) + 1 + (ikut ? p.bawahan : 0)}.
            </p>
          )}
          {atasanBerubah && (
            <p>
              Atasan {atasanLama?.nama ?? "tanpa atasan"}
              {atasanLama ? ` (${atasanLama.bawahan} → ${atasanLama.bawahan - 1} bawahan)` : ""} → {atasanTerpilih?.nama ?? "tanpa atasan"}
              {atasanTerpilih ? ` (${atasanTerpilih.bawahan} → ${atasanTerpilih.bawahan + 1} bawahan)` : ""}.
            </p>
          )}
          {peringatanPeran && <p className="mt-1 text-[#92400E]">Perhatian: peran atasan ({peranTeks(atasanTerpilih!.peran)}) tidak lebih tinggi dari peran peserta ini ({peranTeks(p.peran)}).</p>}
        </div>
      )}
      <KotakAlasan alasan={alasan} setAlasan={setAlasan} />
    </Jendela>
  );
}

// ----------------------------------------------------------------------
// Tambah peserta mendadak
// ----------------------------------------------------------------------
function ModalTambah({ papan, tutup, selesai, galat }: PropModal) {
  const [kata, setKata] = useState("");
  const [kandidat, setKandidat] = useState<Kandidat[]>([]);
  const [calon, setCalon] = useState<Kandidat | null>(null);
  const [peran, setPeran] = useState("ppl");
  const [kelas, setKelas] = useState(papan.kelas.length > 0 ? String(papan.kelas[0]) : "");
  const [atasan, setAtasan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const nomor = useRef(0);

  useEffect(() => {
    if (calon) return;
    const q = kata.trim();
    if (q.length < 2) {
      setKandidat([]);
      return;
    }
    const n = ++nomor.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetchJson<{ kandidat: Kandidat[] }>(urlPelatihan(`${URL_API}?cari=${encodeURIComponent(q)}`));
        if (n === nomor.current) setKandidat(r.kandidat);
      } catch {
        if (n === nomor.current) setKandidat([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [kata, calon]);

  const layak = !!calon && alasan.trim().length >= 3 && !sibuk;
  const sekelas = papan.peserta.filter((x) => (kelas === "" ? x.kelas === null : x.kelas === Number(kelas))).length;

  async function terapkan() {
    if (!layak || !calon) return;
    setSibuk(true);
    try {
      const h = await kirim<{ ringkas: string }>({ aksi: "tambah_peserta", akun_id: calon.akun_id, peran, kelas: kelas === "" ? null : Number(kelas), atasan_akun_id: atasan === "" ? null : Number(atasan), alasan: alasan.trim() });
      await selesai(h.ringkas);
    } catch (e) {
      galat(pesanKesalahan(e));
      setSibuk(false);
    }
  }

  return (
    <Jendela
      tes="modal-tambah"
      judul="Tambah peserta mendadak"
      sub="Mitra aktif yang belum menjadi peserta dan belum menolak pelatihan ini."
      tutup={tutup}
      sibuk={sibuk}
      aksi={
        <button type="button" className={BTN} disabled={!layak} onClick={() => void terapkan()}>
          {sibuk ? "Menambahkan…" : "Tambahkan"}
        </button>
      }
    >
      {calon ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#BFD3F6] bg-[#F5F8FE] px-3 py-2">
          <span className="text-[13.5px] font-semibold text-[#1B2B4B]">{calon.nama}</span>
          {calon.kecamatan && <span className="text-[12px] text-[#6B7A90]">{calon.kecamatan}</span>}
          <button type="button" className="ml-auto text-[12.5px] text-[#1F5FD1] underline" onClick={() => setCalon(null)}>
            ganti
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input className={`${INPUT} w-full`} placeholder="Cari nama mitra (minimal 2 huruf)" value={kata} onChange={(e) => setKata(e.target.value)} autoFocus />
          {kandidat.length === 0 ? (
            <p className="text-[12.5px] text-[#6B7A90]">{kata.trim().length < 2 ? "Ketik minimal 2 huruf nama." : "Tidak ada mitra yang cocok."}</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto rounded-lg border border-[#DDE6F3] bg-white">
              {kandidat.map((k) => (
                <li key={k.akun_id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[#F5F8FE]" onClick={() => setCalon(k)}>
                    <span className="flex-1">{k.nama}</span>
                    <span className="text-[11.5px] text-[#6B7A90]">{k.kecamatan ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-[12.5px] font-semibold text-[#5B6B84]">
          Peran
          <SelectCari className={`${INPUT} mt-1 w-full`} value={peran} onChange={(e) => setPeran(e.target.value)} aria-label="Peran">
            <option value="ppl">PPL</option>
            <option value="pml">PML</option>
            <option value="korwil">Korwil</option>
          </SelectCari>
        </label>
        <label className="block text-[12.5px] font-semibold text-[#5B6B84]">
          Kelas
          <SelectCari className={`${INPUT} mt-1 w-full`} value={kelas} onChange={(e) => setKelas(e.target.value)} aria-label="Kelas">
            <option value="">Tanpa kelas</option>
            {papan.kelas.map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
          </SelectCari>
        </label>
      </div>
      <label className="block text-[12.5px] font-semibold text-[#5B6B84]">
        Atasan (opsional)
        <SelectCari className={`${INPUT} mt-1 w-full`} value={atasan} onChange={(e) => setAtasan(e.target.value)} aria-label="Atasan">
          <option value="">Belum ditentukan</option>
          {papan.peserta.map((x) => (
            <option key={x.akun_id} value={x.akun_id}>
              {x.nama} · {peranTeks(x.peran)}
              {x.kelas != null ? ` · kelas ${x.kelas}` : ""}
            </option>
          ))}
        </SelectCari>
      </label>
      <p className="rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#3B4A63]">
        Kelas {kelas === "" ? "—" : kelas} sekarang berisi {sekelas} peserta (jadi {sekelas + 1}). Mode, jadwal, dan jatah hari ikut kelas; ia perlu menerima undangan di HP sebelum bisa mengikuti tes.
      </p>
      <KotakAlasan alasan={alasan} setAlasan={setAlasan} />
    </Jendela>
  );
}
