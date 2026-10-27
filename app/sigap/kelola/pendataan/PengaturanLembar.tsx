"use client";

// app/sigap/kelola/pendataan/PengaturanLembar.tsx
//
// (27 Okt 2026) Pengaturan Lembar Pendataan PER KEGIATAN (tab 1 Persiapan). Agar kegiatan berbeda (Pascabencana, Updating, dst.) memakai Lembar yang sama dengan istilah sendiri:
//  - TOMBOL HASIL: nama, keterangan, warna, bentuk penanda di peta, pilihan alasan. Kategori di database tetap TIGA (terdampak / tidak terdampak / tidak ditemukan);
//    angka target, Monitoring, Supervisi dan Rekap tetap memakai istilah standar karena menghitung kategori yang sama.
//  - RADAR SEKITAR: nyala/mati, radius awal/terkecil/terbesar, pilihan cepat, kecepatan sapuan, tampilan awal, kepekaan gerak.
// Hanya mengubah TAMPILAN di HP PPL/PML (berlaku saat Sub SLS dibuka/disegarkan); data lapangan tidak tersentuh. Aturan dan pemeriksaan: lib/lembarKonfig.ts.
// Data: /api/portal/pendataan/konfig (izin bencana.admin: lihat / kelola); perubahan dicatat di jejak audit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { BTN, BTN_O, BTN_R, BTN_T, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { HASIL_KK, type HasilKk } from "@/lib/pendataan";
import { BATAS, BENTUK_HASIL, KONFIG_BAWAAN, LABEL_BENTUK, contohUpdating, galatKonfig, lencanaHasil, rapikanKonfig, salinBawaan, samaDenganBawaan, type BentukHasil, type KonfigHasil, type KonfigLembar, type KonfigRadar } from "@/lib/lembarKonfig";
import { IkonHasil } from "../../pendataan/PetaKk";

const API = "/api/portal/pendataan/konfig";

type Keg = { id: number; nama: string; punya_kk: boolean; tersimpan: boolean; diubah_oleh: string | null; diubah_at: string | null };
type Data = { boleh_kelola: boolean; kegiatan: Keg[]; konfig: Record<string, KonfigLembar> };

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
function tgl(iso: string): string {
  const w = new Date(Date.parse(iso) + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(w.getUTCDate())}/${p(w.getUTCMonth() + 1)}/${w.getUTCFullYear()} ${p(w.getUTCHours())}.${p(w.getUTCMinutes())}`;
}

const NAMA_KATEGORI: Record<HasilKk, { judul: string; ket: string }> = {
  terdampak: { judul: "Hasil 1 · kategori “terdampak”", ket: "Kategori ini dihitung sebagai “terdampak” di target dan Monitoring." },
  tidak_terdampak: { judul: "Hasil 2 · kategori “tidak terdampak”", ket: "Kategori ini dihitung sebagai “tidak terdampak” di target dan Monitoring." },
  tidak_ditemukan: { judul: "Hasil 3 · kategori “tidak ditemukan”", ket: "Selalu tersedia supaya KK tidak pernah buntu. Dihitung sebagai “tidak ditemukan”." },
};

const LABEL = "block text-[11.5px] font-bold text-[#52627A]";

/** Isian angka bulat: teks bebas diketik, nilai sah langsung masuk ke draf. */
function Angka({ nilai, onUbah, label, min, maks, satuan }: { nilai: number; onUbah: (n: number) => void; label: string; min: number; maks: number; satuan?: string }) {
  const [t, setT] = useState(String(nilai));
  useEffect(() => setT(String(nilai)), [nilai]);
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          value={t}
          aria-label={label}
          onChange={(e) => {
            setT(e.target.value);
            const n = Number(e.target.value.trim());
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onUbah(Math.round(n));
          }}
          onBlur={() => setT(String(nilai))}
          className={`${INPUT} w-[92px]`}
          title={`${min} sampai ${maks}`}
        />
        {satuan && <span className="text-[12px] text-[#6B7A90]">{satuan}</span>}
      </span>
    </label>
  );
}

/** Daftar baris teks (alasan): satu per baris. */
function DaftarBaris({ nilai, onUbah, label, maks }: { nilai: string[]; onUbah: (v: string[]) => void; label: string; maks: number }) {
  const [t, setT] = useState(nilai.join("\n"));
  const terakhir = useRef(JSON.stringify(nilai));
  useEffect(() => {
    if (JSON.stringify(nilai) !== terakhir.current) {
      terakhir.current = JSON.stringify(nilai);
      setT(nilai.join("\n"));
    }
  }, [nilai]);
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <textarea
        value={t}
        rows={Math.min(8, Math.max(3, nilai.length + 1))}
        onChange={(e) => {
          setT(e.target.value);
          const baris = e.target.value.split("\n").map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
          terakhir.current = JSON.stringify(baris);
          onUbah(baris);
        }}
        placeholder="Satu alasan per baris. Kosongkan bila tidak perlu alasan."
        className={`${INPUT} mt-0.5 w-full`}
      />
      <span className="text-[11px] text-[#8A96A8]">
        Maksimal {maks} pilihan, tiap pilihan {BATAS.alasanPanjang} huruf. PPL boleh juga tidak memilih alasan.
      </span>
    </label>
  );
}

function Warna({ nilai, onUbah, label }: { nilai: string; onUbah: (v: string) => void; label: string }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(nilai) ? nilai : "#000000"} onChange={(e) => onUbah(e.target.value.toUpperCase())} className="h-[34px] w-[44px] cursor-pointer rounded border border-[#CBD6E6] bg-white p-0.5" aria-label={label} />
        <code className="text-[11.5px] text-[#6B7A90]">{nilai}</code>
      </span>
    </label>
  );
}

function Teks({ nilai, onUbah, label, maks, ket }: { nilai: string; onUbah: (v: string) => void; label: string; maks: number; ket?: string }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input type="text" value={nilai} maxLength={maks + 20} onChange={(e) => onUbah(e.target.value)} className={`${INPUT} mt-0.5 w-full`} />
      {ket && <span className="text-[11px] text-[#8A96A8]">{ket}</span>}
    </label>
  );
}

function KartuHasil({ h, k, draf, ubah, boleh }: { h: HasilKk; k: KonfigHasil; draf: KonfigLembar; ubah: (p: Partial<KonfigHasil>) => void; boleh: boolean }) {
  const [latar, teks, label] = lencanaHasil(draf, h);
  const peta = { terdampak: draf.hasil.terdampak.bentuk, tidak_terdampak: draf.hasil.tidak_terdampak.bentuk, tidak_ditemukan: draf.hasil.tidak_ditemukan.bentuk };
  const wajib = h === "tidak_ditemukan";
  const satuDidata = draf.hasil.terdampak.aktif && draf.hasil.tidak_terdampak.aktif;
  const bolehMati = !wajib && satuDidata;
  return (
    <fieldset disabled={!boleh} className="rounded-lg border border-[#DDE6F3] bg-white p-3">
      <legend className="px-1 text-[13px] font-extrabold text-[#0F2A52]">{NAMA_KATEGORI[h].judul}</legend>
      <p className="-mt-1 mb-2 text-[11.5px] text-[#6B7A90]">{NAMA_KATEGORI[h].ket}</p>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-[#F5F8FE] px-3 py-2">
        <span className="text-[11.5px] font-bold text-[#52627A]">Contoh tampilan</span>
        <span className="inline-flex min-h-[40px] items-center gap-2 rounded-[14px] border-2 border-[#D9E3F2] bg-white px-3 py-1">
          <IkonHasil hasil={h} warna="#2A78D6" ukuran={22} peta={peta} />
          <span className="text-[13px] font-extrabold text-[#0F2A52]">
            {k.label || "(nama kosong)"}
            {k.subteks && <small className="block text-[11px] font-medium text-[#6B7A90]">{k.subteks}</small>}
          </span>
        </span>
        <span className="rounded-full px-2 py-[2px] text-[11px] font-extrabold" style={{ background: latar, color: teks }}>
          {label}
        </span>
        <span className="h-2 w-16 rounded-full" style={{ background: k.warna }} title="warna bilah" />
      </div>

      <label className={`mb-3 flex items-center gap-2 text-[13px] font-bold ${bolehMati || !k.aktif ? "text-[#0F2A52]" : "text-[#8A96A8]"}`}>
        <input type="checkbox" checked={k.aktif} disabled={wajib || (k.aktif && !bolehMati)} onChange={(e) => ubah({ aktif: e.target.checked })} className="h-4 w-4" />
        Tombol ini dipakai pada kegiatan ini
        {wajib && <Chip w="mut">selalu aktif</Chip>}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Teks label="Nama tombol" nilai={k.label} maks={BATAS.label} onUbah={(v) => ubah({ label: v })} ket="Tampil di tombol hasil dan pesan “Tersimpan: …”." />
        <Teks label="Nama singkat" nilai={k.label_pendek} maks={BATAS.label} onUbah={(v) => ubah({ label_pendek: v })} ket="Kartu saring, legenda peta, radar, Monitoring di HP PPL." />
        <Teks label="Nama di daftar KK" nilai={k.label_pil} maks={BATAS.label} onUbah={(v) => ubah({ label_pil: v })} ket="Lencana kecil di sebelah nama KK (pendek)." />
        <Teks label="Keterangan di bawah tombol" nilai={k.subteks} maks={BATAS.subteks} onUbah={(v) => ubah({ subteks: v })} ket="Boleh dikosongkan." />
        <Warna label="Warna bilah progres" nilai={k.warna} onUbah={(v) => ubah({ warna: v })} />
        <label className="block">
          <span className={LABEL}>Bentuk penanda di peta</span>
          <select value={k.bentuk} onChange={(e) => ubah({ bentuk: e.target.value as BentukHasil })} className={`${INPUT} mt-0.5 w-full`}>
            {BENTUK_HASIL.map((b) => (
              <option key={b} value={b}>
                {LABEL_BENTUK[b]}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-[#8A96A8]">Warna titik di peta tetap warna PPL; yang membedakan hasil adalah bentuknya.</span>
        </label>
        <Warna label="Latar lencana" nilai={k.pil_latar} onUbah={(v) => ubah({ pil_latar: v })} />
        <Warna label="Teks lencana" nilai={k.pil_teks} onUbah={(v) => ubah({ pil_teks: v })} />
      </div>
      <div className="mt-3">
        <DaftarBaris label="Pilihan alasan (muncul setelah KK ditandai)" nilai={k.alasan} onUbah={(v) => ubah({ alasan: v })} maks={BATAS.alasanJumlah} />
      </div>
    </fieldset>
  );
}

export default function PengaturanLembar() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [kid, setKid] = useState<number>(1);
  const [draf, setDraf] = useState<KonfigLembar>(salinBawaan());
  const [asal, setAsal] = useState<string>(JSON.stringify(KONFIG_BAWAAN));
  const [sibuk, setSibuk] = useState(false);
  const [konfirmasiBawaan, setKonfirmasiBawaan] = useState(false);
  const [pilihanTeks, setPilihanTeks] = useState("");

  const muat = useCallback(async () => {
    try {
      setD(await apiPortal<Data>(API));
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);

  // ganti kegiatan / data baru -> draf mengikuti pengaturan tersimpan
  useEffect(() => {
    if (!d) return;
    const k = d.konfig[String(kid)] ?? KONFIG_BAWAAN;
    setDraf(salin(k));
    setAsal(JSON.stringify(k));
    setKonfirmasiBawaan(false);
  }, [d, kid]);

  useEffect(() => {
    setPilihanTeks(draf.radar.radius_pilihan.join(", "));
    // hanya saat draf diganti dari luar (ganti kegiatan / contoh); ketikan pengguna mengisi pilihanTeks sendiri
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asal, kid]);

  const kegiatan = d?.kegiatan.find((k) => k.id === kid) ?? null;
  const galatDraf = useMemo(() => galatKonfig(draf), [draf]);
  const berubah = JSON.stringify(draf) !== asal;
  const bolehKelola = !!d?.boleh_kelola;

  const ubahHasil = (h: HasilKk, p: Partial<KonfigHasil>) => setDraf((x) => ({ ...x, hasil: { ...x.hasil, [h]: { ...x.hasil[h], ...p } } }));
  const ubahRadar = (p: Partial<KonfigRadar>) => setDraf((x) => ({ ...x, radar: { ...x.radar, ...p } }));

  async function simpan(konfig: KonfigLembar | null) {
    setSibuk(true);
    setInfo(null);
    setGalat(null);
    try {
      await apiPortal(API, { method: "POST", body: JSON.stringify({ kegiatan_id: kid, konfig: konfig ? rapikanKonfig(konfig) : null }) });
      setInfo(konfig ? "Pengaturan tersimpan. PPL dan PML memakainya saat Lembar Pendataan dibuka atau disegarkan." : "Dikembalikan ke tampilan bawaan.");
      await muat();
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
      setKonfirmasiBawaan(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}

      {d && (
        <Kartu
          judul="Pengaturan Lembar Pendataan"
          ket="Istilah tombol hasil dan variabel radar sekitar untuk setiap kegiatan. Hanya mengubah tampilan di HP PPL/PML."
          kanan={kegiatan ? kegiatan.tersimpan ? <Chip w="ok">Diatur khusus</Chip> : <Chip w="mut">Tampilan bawaan</Chip> : undefined}
        >
          {!bolehKelola && <Pesan jenis="info">Anda dapat melihat saja. Mengubah pengaturan memerlukan izin kelola pendataan.</Pesan>}

          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[220px]">
              <span className={LABEL}>Kegiatan</span>
              <select value={kid} onChange={(e) => setKid(Number(e.target.value))} className={`${INPUT} mt-0.5 w-full`}>
                {d.kegiatan.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                    {k.tersimpan ? " · diatur khusus" : ""}
                  </option>
                ))}
              </select>
            </label>
            {bolehKelola && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_O} onClick={() => setDraf(salin(contohUpdating()))} title="Mengisi isian dengan contoh istilah untuk kegiatan Updating; belum disimpan sampai Anda menekan Simpan">
                  Isi dengan contoh Updating
                </button>
                <button type="button" className={BTN_O} onClick={() => setDraf(salinBawaan())} title="Mengisi isian dengan tampilan Pascabencana; belum disimpan sampai Anda menekan Simpan">
                  Isi dengan tampilan Pascabencana
                </button>
              </div>
            )}
          </div>
          {kegiatan?.diubah_at && (
            <p className="mt-1.5 text-[11.5px] text-[#6B7A90]">
              Terakhir diubah {tgl(kegiatan.diubah_at)}
              {kegiatan.diubah_oleh ? ` oleh ${kegiatan.diubah_oleh}` : ""}.
            </p>
          )}
          {kegiatan && !kegiatan.punya_kk && <p className="mt-1.5 text-[11.5px] text-[#8A6200]">Kegiatan ini belum punya daftar KK. Pengaturan tetap bisa disiapkan lebih dulu.</p>}
          <p className="mt-2 rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12px] leading-snug text-[#52627A]">
            Kategori hasil yang tersimpan tetap tiga (terdampak, tidak terdampak, tidak ditemukan). Yang berganti hanya nama, warna, bentuk dan alasan di layar, jadi angka target, Monitoring, Supervisi dan Rekap tetap
            memakai istilah standar. Pilih kategori yang artinya paling dekat untuk tiap istilah baru.
          </p>
        </Kartu>
      )}

      {d && (
        <>
          <div className="space-y-3">
            {HASIL_KK.map((h) => (
              <KartuHasil key={h} h={h} k={draf.hasil[h]} draf={draf} ubah={(p) => ubahHasil(h, p)} boleh={bolehKelola} />
            ))}
          </div>

          <Kartu judul="Radar sekitar" ket="Hitung KK di sekitar PPL selagi bergerak (sudah dan belum didata). Dipantau hanya di HP PPL; lokasi tidak dikirim ke server.">
            <fieldset disabled={!bolehKelola} className="space-y-3">
              <label className="flex items-center gap-2 text-[13px] font-bold text-[#0F2A52]">
                <input type="checkbox" checked={draf.radar.aktif} onChange={(e) => ubahRadar({ aktif: e.target.checked })} className="h-4 w-4" />
                Radar sekitar tersedia pada kegiatan ini
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <Angka label="Radius awal" nilai={draf.radar.radius_awal} onUbah={(n) => ubahRadar({ radius_awal: n })} min={BATAS.radarMin} maks={BATAS.radarMaks} satuan="meter" />
                <Angka label="Radius terkecil" nilai={draf.radar.radius_min} onUbah={(n) => ubahRadar({ radius_min: n })} min={BATAS.radarMin} maks={BATAS.radarMaks} satuan="meter" />
                <Angka label="Radius terbesar" nilai={draf.radar.radius_maks} onUbah={(n) => ubahRadar({ radius_maks: n })} min={BATAS.radarMin} maks={BATAS.radarMaks} satuan="meter" />
              </div>
              <label className="block max-w-[420px]">
                <span className={LABEL}>Pilihan cepat radius (pisahkan dengan koma, maksimal {BATAS.pilihanJumlah})</span>
                <input
                  type="text"
                  value={pilihanTeks}
                  onChange={(e) => {
                    setPilihanTeks(e.target.value);
                    const n = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x)).map(Math.round);
                    ubahRadar({ radius_pilihan: n });
                  }}
                  className={`${INPUT} mt-0.5 w-full`}
                  aria-label="Pilihan cepat radius"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-4">
                <Angka label="Putaran sapuan" nilai={draf.radar.putar_detik} onUbah={(n) => ubahRadar({ putar_detik: n })} min={BATAS.putar[0]} maks={BATAS.putar[1]} satuan="detik" />
                <Angka label="Gerak minimal" nilai={draf.radar.gerak_minimal_m} onUbah={(n) => ubahRadar({ gerak_minimal_m: n })} min={BATAS.gerak[0]} maks={BATAS.gerak[1]} satuan="meter" />
                <Angka label="Jeda pembaruan" nilai={draf.radar.jeda_detik} onUbah={(n) => ubahRadar({ jeda_detik: n })} min={BATAS.jeda[0]} maks={BATAS.jeda[1]} satuan="detik" />
                <label className="block">
                  <span className={LABEL}>Tampilan awal</span>
                  <select value={draf.radar.tampilan_awal} onChange={(e) => ubahRadar({ tampilan_awal: e.target.value === "rincian" ? "rincian" : "radar" })} className={`${INPUT} mt-0.5 w-full`}>
                    <option value="radar">Radar (animasi)</option>
                    <option value="rincian">Rincian (angka)</option>
                  </select>
                </label>
              </div>
              <p className="text-[11.5px] text-[#6B7A90]">
                Hitungan diperbarui bila PPL bergeser sekurang-kurangnya “gerak minimal” atau sudah lewat “jeda pembaruan”. Nilai kecil lebih peka tetapi lebih boros baterai. Radius pilihan PPL di HP-nya disimpan sendiri dan
                tetap dalam rentang terkecil sampai terbesar.
              </p>
            </fieldset>
          </Kartu>

          {galatDraf.length > 0 && (
            <Pesan jenis="peringatan">
              <p className="font-bold">Belum bisa disimpan:</p>
              <ul className="mt-1 list-disc pl-4">
                {galatDraf.slice(0, 8).map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </Pesan>
          )}

          {bolehKelola && (
            <div className="sticky bottom-2 z-[2] flex flex-wrap items-center gap-2 rounded-xl border border-[#DDE6F3] bg-white/95 px-3 py-2 shadow-[0_6px_18px_rgba(15,42,82,.12)]">
              <button type="button" className={BTN} disabled={sibuk || !berubah || galatDraf.length > 0} onClick={() => void simpan(draf)}>
                {sibuk ? "Menyimpan…" : "Simpan pengaturan"}
              </button>
              <button
                type="button"
                className={BTN_T}
                disabled={sibuk || !berubah}
                onClick={() => {
                  const k = d.konfig[String(kid)] ?? KONFIG_BAWAAN;
                  setDraf(salin(k));
                  setPilihanTeks(k.radar.radius_pilihan.join(", "));
                }}
              >
                Batalkan perubahan
              </button>
              {kegiatan?.tersimpan &&
                (konfirmasiBawaan ? (
                  <>
                    <button type="button" className={BTN_R} disabled={sibuk} onClick={() => void simpan(null)}>
                      Ya, kembalikan ke bawaan
                    </button>
                    <button type="button" className={BTN_T} onClick={() => setKonfirmasiBawaan(false)}>
                      Tidak
                    </button>
                  </>
                ) : (
                  <button type="button" className={BTN_T} disabled={sibuk} onClick={() => setKonfirmasiBawaan(true)}>
                    Kembalikan ke tampilan bawaan
                  </button>
                ))}
              {berubah && <span className="text-[12px] text-[#8A6200]">Ada perubahan yang belum disimpan.</span>}
              {!berubah && samaDenganBawaan(draf) && <span className="text-[12px] text-[#6B7A90]">Sama dengan tampilan bawaan (Pascabencana).</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
