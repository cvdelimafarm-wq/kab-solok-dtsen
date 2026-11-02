"use client";

// app/sigap/pelatihan/kelola/hariKerja.tsx
//
// (2 Nov 2026) Tab "Hari Kerja" di Kelola Pelatihan: matriks peserta x tanggal pelatihan. Admin dapat membuatkan hari kerja yang kosong, melepas, dan MEMINDAHKAN hari kerja
// dari kegiatan lain (1 orang, 1 tanggal = 1 kegiatan). Pemindahan selalu meminta konfirmasi. API: /api/sigap/pelatihan/hari-kerja. Aturan: lib/hariKerjaPelatihan.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";
import type { Aksi, BarisMatriks, RingkasHK, Sel } from "@/lib/hariKerjaPelatihan";
import { LABEL_AKSI } from "@/lib/hariKerjaPelatihan";

type Data = { kegiatan: { id: number; nama: string } | null; tanggal: string[]; hari_ini: string; matriks: BarisMatriks[]; ringkas: RingkasHK; boleh_kelola: boolean };
type Hasil = { ok: boolean; berhasil: number; dilewati: { akun_id: number; nama: string; tanggal: string; alasan: string }[] };

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (t: string) => {
  const [y, m, d] = t.split("-").map(Number);
  return `${d} ${BULAN[(m ?? 1) - 1]} ${y}`;
};
const NAMA_PERAN: Record<string, string> = { korwil: "Korwil", pml: "PML", ppl: "PPL" };

export default function HariKerjaKelola() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ aksi: Aksi; h: Hasil } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [yakin, setYakin] = useState<string | null>(null); // kunci tindakan yang menunggu konfirmasi kedua

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data>("/api/sigap/pelatihan/hari-kerja");
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

  async function jalankan(kunci: string, aksi: Aksi, badan: Record<string, unknown>) {
    setSibuk(kunci);
    setYakin(null);
    setHasil(null);
    try {
      const h = await fetchJson<Hasil>("/api/sigap/pelatihan/hari-kerja", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi, ...badan }) });
      setHasil({ aksi, h });
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  const namaPer = useMemo(() => new Map((d?.matriks ?? []).map((b) => [b.peserta.akun_id, b.peserta.nama])), [d]);

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const { ringkas } = d;
  const kelola = d.boleh_kelola;

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {hasil && (
        <Pesan jenis={hasil.h.dilewati.length ? "peringatan" : "ok"} onTutup={() => setHasil(null)}>
          {hasil.h.berhasil} hari kerja {LABEL_AKSI[hasil.aksi]}.
          {hasil.h.dilewati.length > 0 && (
            <>
              {" "}
              {hasil.h.dilewati.length} dilewati:
              <ul className="mt-1 list-disc pl-5">
                {hasil.h.dilewati.slice(0, 12).map((x, i) => (
                  <li key={i}>
                    {x.nama || namaPer.get(x.akun_id)} · {tgl(x.tanggal)}: {x.alasan}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Pesan>
      )}

      <Kartu
        judul="Hari kerja peserta"
        ket={d.kegiatan ? `${d.kegiatan.nama} · ${d.tanggal.length === 1 ? tgl(d.tanggal[0]) : d.tanggal.length ? `${tgl(d.tanggal[0])} – ${tgl(d.tanggal[d.tanggal.length - 1])}` : "tanggal belum diatur"}` : undefined}
      >
        <p className="mb-3 text-[12.5px] text-[#6B7A90]">
          Satu orang hanya boleh punya satu kegiatan pada satu tanggal. Hari kerja ini dipakai untuk laporan, foto, dan pembayaran transport lokal peserta. Hari yang sudah berisi laporan/foto/izin susulan, hari uji coba, dan tanggal yang sudah lewat tidak diubah dari sini.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip w="ok">Sudah ada: {ringkas.ada}</Chip>
          <Chip w={ringkas.kosong ? "wait" : "mut"}>Kosong: {ringkas.kosong}</Chip>
          <Chip w={ringkas.lain + ringkas.terkunci_lain ? "bad" : "mut"} title="Tanggal itu dipakai kegiatan lain">
            Dipakai kegiatan lain: {ringkas.lain + ringkas.terkunci_lain}
          </Chip>
          <span className="text-[12.5px] text-[#6B7A90]">
            {ringkas.lengkap} dari {ringkas.peserta} peserta sudah lengkap
          </span>
        </div>

        {kelola && (ringkas.bisa_buat > 0 || ringkas.bisa_pindah > 0) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#F5F8FE] p-2.5">
            {ringkas.bisa_buat > 0 && (
              <button type="button" className={BTN} disabled={sibuk !== null} onClick={() => void jalankan("semua-buat", "buat", { semua: true })}>
                {sibuk === "semua-buat" ? "Memproses…" : `Buatkan semua yang kosong (${ringkas.bisa_buat})`}
              </button>
            )}
            {ringkas.bisa_pindah > 0 &&
              (yakin === "semua-pindah" ? (
                <>
                  <button type="button" className={BTN_R} disabled={sibuk !== null} onClick={() => void jalankan("semua-pindah", "pindah", { semua: true })}>
                    {sibuk === "semua-pindah" ? "Memproses…" : `Ya, pindahkan ${ringkas.bisa_pindah} hari kerja ke pelatihan`}
                  </button>
                  <button type="button" className={BTN_O} onClick={() => setYakin(null)}>
                    Batal
                  </button>
                </>
              ) : (
                <button type="button" className={BTN_O} disabled={sibuk !== null} onClick={() => setYakin("semua-pindah")}>
                  Pindahkan semua dari kegiatan lain ({ringkas.bisa_pindah})
                </button>
              ))}
            <span className="text-[12px] text-[#6B7A90]">
              {ringkas.bisa_pindah > 0 ? "Memindahkan = melepas hari itu dari kegiatan lain, lalu memasangnya di pelatihan ini." : "Hanya hari yang kosong yang dibuatkan."}
            </span>
          </div>
        )}

        {d.matriks.length === 0 ? (
          <p className="text-[13px] text-[#6B7A90]">Belum ada peserta aktif atau tanggal pelatihan belum diatur.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#DDE6F3]">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={TH}>Peserta</th>
                  {d.tanggal.map((t) => (
                    <th key={t} className={TH}>
                      {tgl(t)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.matriks.map((b) => (
                  <tr key={b.peserta.akun_id}>
                    <td className={TD}>
                      <div className="font-semibold text-[#0F2A52]">{b.peserta.nama}</div>
                      <div className="text-[11.5px] text-[#6B7A90]">{NAMA_PERAN[b.peserta.peran] ?? b.peserta.peran}</div>
                    </td>
                    {b.sel.map((s) => (
                      <td key={s.tanggal} className={TD}>
                        <SelHK b={b} s={s} kelola={kelola} sibuk={sibuk} yakin={yakin} setYakin={setYakin} jalankan={jalankan} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kartu>
    </div>
  );
}

function SelHK({
  b,
  s,
  kelola,
  sibuk,
  yakin,
  setYakin,
  jalankan,
}: {
  b: BarisMatriks;
  s: Sel;
  kelola: boolean;
  sibuk: string | null;
  yakin: string | null;
  setYakin: (k: string | null) => void;
  jalankan: (kunci: string, aksi: Aksi, badan: Record<string, unknown>) => Promise<void>;
}) {
  const kunci = `${b.peserta.akun_id}|${s.tanggal}`;
  const item = { item: [{ akun_id: b.peserta.akun_id, tanggal: s.tanggal }] };
  const ket = s.alasan ? <div className="mt-1 text-[11px] text-[#6B7A90]">{s.alasan}</div> : null;
  if (s.status === "ada")
    return (
      <div>
        <Chip w="ok">Ada{s.berisi ? " · berisi" : ""}</Chip>
        {kelola && s.bisa_lepas && (
          <div className="mt-1.5">
            <button type="button" className={BTN_O} disabled={sibuk !== null} onClick={() => void jalankan(kunci, "lepas", item)}>
              {sibuk === kunci ? "…" : "Lepas"}
            </button>
          </div>
        )}
        {ket}
      </div>
    );
  if (s.status === "kosong")
    return (
      <div>
        <Chip w="wait">Kosong</Chip>
        {kelola && s.bisa_buat && (
          <div className="mt-1.5">
            <button type="button" className={BTN} disabled={sibuk !== null} onClick={() => void jalankan(kunci, "buat", item)}>
              {sibuk === kunci ? "…" : "Buatkan"}
            </button>
          </div>
        )}
        {ket}
      </div>
    );
  return (
    <div>
      <Chip w="bad" title="Tanggal ini dipakai kegiatan lain">
        Dipakai: {s.kegiatan_nama}
      </Chip>
      {kelola && s.bisa_pindah && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {yakin === kunci ? (
            <>
              <button type="button" className={BTN_R} disabled={sibuk !== null} onClick={() => void jalankan(kunci, "pindah", item)}>
                {sibuk === kunci ? "…" : "Ya, pindahkan"}
              </button>
              <button type="button" className={BTN_O} onClick={() => setYakin(null)}>
                Batal
              </button>
            </>
          ) : (
            <button type="button" className={BTN_O} disabled={sibuk !== null} onClick={() => setYakin(kunci)}>
              Pindahkan ke pelatihan
            </button>
          )}
        </div>
      )}
      {ket}
    </div>
  );
}
