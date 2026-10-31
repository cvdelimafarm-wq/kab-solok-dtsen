"use client";

// app/sigap/pelatihan/kelola/survei.tsx
//
// (31 Okt 2026) Kelola Pelatihan per SURVEI -- permintaan Iqbal: "dibuat seperti kelola pendataan, ada 1 kartu untuk 1 survei, dan saat masuk bisa pindah antar survei
// lewat dropdown survei". Halaman awal = satu kartu per survei (kegiatan induk); di dalam halaman kelola ada pemilih Survei (dan Pelatihan bila lebih dari satu).
// Data: /api/sigap/pelatihan/daftar (survei). Logika murni: lib/sigapPelatihanSurvei.ts.

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, tglSedang } from "../../admin/api";
import { BTN_G, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { ringkasSurvei, validasiPelatihanBaru, type PelatihanSurvei, type StatusPelatihan, type Survei } from "@/lib/sigapPelatihanSurvei";

export type DataSurvei = { survei: Survei[] };

/** Memuat daftar survei + pelatihan. `muat` memuat ulang (mis. setelah pelatihan baru dibuat). */
export function useDaftarSurvei() {
  const [data, setData] = useState<DataSurvei | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(async () => {
    try {
      const d = await fetchJson<DataSurvei>("/api/sigap/pelatihan/daftar");
      setData({ survei: d.survei ?? [] });
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    void muat();
  }, [muat]);
  return { data, galat, muat };
}

const STATUS: Record<StatusPelatihan | "kosong", { label: string; w: "ok" | "navy" | "mut" | "wait" }> = {
  berlangsung: { label: "Berlangsung", w: "ok" },
  akan_datang: { label: "Akan datang", w: "navy" },
  selesai: { label: "Selesai", w: "mut" },
  nonaktif: { label: "Nonaktif", w: "mut" },
  kosong: { label: "Belum ada pelatihan", w: "wait" },
};

function rentang(a: string | null, b: string | null) {
  if (!a && !b) return "Tanggal belum diatur";
  if (!b || a === b) return tglSedang(a ?? b);
  return `${tglSedang(a)} – ${tglSedang(b)}`;
}

/** Halaman awal: satu kartu untuk satu survei. */
export function HubSurvei({ data, galat, onPilih }: { data: DataSurvei | null; galat: string | null; onPilih: (s: Survei) => void }) {
  if (galat) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  if (data.survei.length === 0) return <Pesan jenis="info">Belum ada survei atau pelatihan yang bisa Anda kelola. Hubungi admin anggaran bila Anda panitia atau instruktur.</Pesan>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.survei.map((s) => {
        const r = ringkasSurvei(s);
        const st = STATUS[r.status];
        return (
          <li key={s.kode}>
            <button
              type="button"
              onClick={() => onPilih(s)}
              className={`flex h-full w-full flex-col gap-1.5 rounded-xl border bg-white p-3.5 text-left transition hover:border-[#9DBEEB] hover:shadow ${r.jumlah === 0 ? "border-dashed border-[#C9D4E8]" : "border-[#E3E8EE]"}`}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip w={st.w}>{st.label}</Chip>
                {r.jumlah > 1 && <Chip>{r.jumlah} pelatihan</Chip>}
              </span>
              <span className="text-[15px] font-bold leading-snug text-[#14202E]">{s.nama}</span>
              {r.jumlah > 0 ? (
                <>
                  <span className="text-[12.5px] text-[#4D5B6B]">
                    {rentang(r.mulai, r.selesai)} · {r.peserta} peserta
                  </span>
                  <ul className="mt-0.5 space-y-0.5 text-[12.5px] text-[#33455F]">
                    {s.pelatihan.slice(0, 3).map((p) => (
                      <li key={p.id} className="truncate">• {p.nama}</li>
                    ))}
                    {s.pelatihan.length > 3 && <li className="text-[#6B7A90]">+{s.pelatihan.length - 3} lainnya</li>}
                  </ul>
                </>
              ) : (
                <span className="text-[12.5px] text-[#4D5B6B]">Survei ini belum punya pelatihan.</span>
              )}
              <span className="mt-auto pt-1 text-[12.5px] font-semibold text-[#1F6FD1]">{r.jumlah > 0 ? "Kelola →" : "Buka →"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Pemilih Survei (dan Pelatihan bila lebih dari satu) di atas isi halaman kelola. */
export function PemilihSurveiPelatihan({
  daftar,
  survei,
  kegiatanId,
  onSurvei,
  onPelatihan,
  onDibuat,
}: {
  daftar: Survei[];
  survei: Survei | null;
  kegiatanId: number | null;
  onSurvei: (kode: string) => void;
  onPelatihan: (id: number) => void;
  /** Dipanggil setelah pelatihan baru dibuat (id pelatihan, kode survei); halaman memuat ulang daftar dan membukanya. */
  onDibuat: (id: number, kodeSurvei: string) => Promise<void>;
}) {
  const [formBuka, setFormBuka] = useState(false);
  useEffect(() => setFormBuka(false), [survei?.kode]);
  if (daftar.length === 0) return null;
  const kelas = "min-h-[40px] min-w-[220px] max-w-full flex-1 rounded-lg border border-[#C9D4E8] bg-white px-3 text-[14px] font-bold text-[#0F2A52] sm:flex-none";
  const banyak = (survei?.pelatihan.length ?? 0) > 1;
  return (
    <>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2.5">
      <label htmlFor="pilih-survei-pelatihan" className="text-[13px] font-extrabold text-[#0F2A52]">
        Survei
      </label>
      <select id="pilih-survei-pelatihan" value={survei?.kode ?? ""} onChange={(e) => onSurvei(e.target.value)} className={kelas}>
        {!survei && <option value="">Pilih survei…</option>}
        {daftar.map((s) => (
          <option key={s.kode} value={s.kode}>
            {s.nama}
            {s.pelatihan.length === 0 ? " (belum ada pelatihan)" : ""}
          </option>
        ))}
      </select>
      {banyak && survei && (
        <>
          <label htmlFor="pilih-pelatihan" className="ml-1 text-[13px] font-extrabold text-[#0F2A52]">
            Pelatihan
          </label>
          <select id="pilih-pelatihan" value={kegiatanId ?? ""} onChange={(e) => onPelatihan(Number(e.target.value))} className={kelas}>
            {survei.pelatihan.map((p: PelatihanSurvei) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>
        </>
      )}
      <span className="text-[12.5px] text-[#6B7A90]">Semua tab di bawah mengikuti survei{banyak ? " dan pelatihan" : ""} yang dipilih.</span>
      {survei?.boleh_buat && (
        <button type="button" className={`${BTN_O} ml-auto`} onClick={() => setFormBuka((x) => !x)} aria-expanded={formBuka}>
          ＋ Pelatihan baru
        </button>
      )}
    </div>
    {formBuka && survei && <FormPelatihanBaru survei={survei} onBatal={() => setFormBuka(false)} onDibuat={onDibuat} />}
    </>
  );
}

/** Formulir pelatihan baru di bawah survei (admin / PJ). Jadwal pretest/posttest bawaan dibuat TIDAK aktif sampai soal diunggah dan jadwal disetel. */
function FormPelatihanBaru({ survei, onBatal, onDibuat }: { survei: Survei; onBatal: () => void; onDibuat: (id: number, kodeSurvei: string) => Promise<void> }) {
  const [nama, setNama] = useState(`Pelatihan Petugas ${survei.nama}`);
  const [mulai, setMulai] = useState("");
  const [selesai, setSelesai] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const v = validasiPelatihanBaru({ nama, tanggal_mulai: mulai, tanggal_selesai: selesai });

  async function simpan() {
    if (!v.ok) {
      setGalat(v.error);
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      const r = await fetchJson<{ pelatihan: { id: number } }>("/api/sigap/pelatihan/buat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survei: survei.kode, ...v.data }),
      });
      await onDibuat(r.pelatihan.id, survei.kode);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Kartu judul={`Pelatihan baru · ${survei.nama}`} ket="dibuat di bawah survei ini">
      <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Nama pelatihan
          <input className={`${INPUT} mt-1 w-full`} value={nama} maxLength={120} onChange={(e) => setNama(e.target.value)} disabled={sibuk} />
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Mulai
          <input type="date" className={`${INPUT} mt-1 w-full`} value={mulai} onChange={(e) => setMulai(e.target.value)} disabled={sibuk} />
        </label>
        <label className="block text-[12.5px] font-bold text-[#1B2B4B]">
          Selesai (boleh kosong)
          <input type="date" className={`${INPUT} mt-1 w-full`} value={selesai} min={mulai || undefined} onChange={(e) => setSelesai(e.target.value)} disabled={sibuk} />
        </label>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[#6B7A90]">
        Pretest dan posttest dibuat otomatis dalam keadaan <b>tidak aktif</b> (buka pukul 07.00 hari pertama, tutup 22.00 hari terakhir, 15 menit); unggah soal dan setel jadwalnya di tab Soal &amp; Jadwal. Pengelola pelatihan pada survei ini otomatis mendapat akses ke pelatihan baru.
        Peserta ditambahkan lewat penugasan.
      </p>
      {galat && <p className="mt-2 text-[13px] font-bold text-[#B42329]">{galat}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={BTN_O} onClick={onBatal} disabled={sibuk}>
          Batal
        </button>
        <button type="button" className={BTN_G} onClick={simpan} disabled={sibuk || !v.ok} title={!v.ok ? v.error : undefined}>
          {sibuk ? "Membuat…" : "Buat pelatihan"}
        </button>
      </div>
    </Kartu>
  );
}

/** Isi halaman bila survei terpilih belum punya pelatihan. */
export function SurveiTanpaPelatihan({ nama, bolehBuat = false }: { nama: string; bolehBuat?: boolean }) {
  return (
    <Kartu judul={`${nama}: belum ada pelatihan`} ket="belum ada yang bisa dikelola">
      <p className="text-[13px] leading-relaxed text-[#33455F]">
        Survei ini belum memiliki pelatihan. Pelatihan dikelola sebagai kegiatan berjenis <b>pelatihan</b> di bawah survei, lengkap dengan soal pretest/posttest, jadwal, presensi, dan nilai akhir.
        {bolehBuat ? "Gunakan tombol “＋ Pelatihan baru” di atas untuk membuatnya; pelatihan itu langsung muncul di sini." : "Hanya admin atau PJ survei ini yang dapat membuat pelatihan; hubungi mereka bila pelatihannya perlu dibuat."} Pilih survei lain pada pilihan di atas untuk melanjutkan.
      </p>
    </Kartu>
  );
}
