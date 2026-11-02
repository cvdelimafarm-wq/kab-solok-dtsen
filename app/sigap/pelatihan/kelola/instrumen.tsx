"use client";

// app/sigap/pelatihan/kelola/instrumen.tsx
//
// (2 Nov 2026) Kelola Pelatihan > Persiapan > Instrumen: unggah kuesioner, buku pedoman, dan PPT materi (dulu ada di halaman Instrumen peserta).
//  - Boleh lebih dari satu berkas sekaligus (pilih banyak atau seret ke kotak); setiap berkas punya status sendiri: menunggu, mengunggah (batang kemajuan), berhasil, atau gagal + alasan.
//  - Setiap jenis menampilkan status tegas: "N berkas terunggah" (hijau, bercentang) atau "Belum diunggah" (kuning), dan ringkasan tiga jenis di atas.
//  - Pelatihan yang dituju SELALU dibawa ke server (?kegiatan=): dulu unggahan tanpa penanda ini masuk ke pelatihan bawaan (PSP) sehingga daftar pelatihan lain tetap kosong.
// API: /api/sigap/pelatihan/instrumen (GET daftar, POST multipart unggah, POST json sembunyikan).

import { useCallback, useEffect, useRef, useState } from "react";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir, tglSedang, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, BTN_R, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";
import { JudulIkon } from "../instrumen/IkonInstrumen";
import { unduhBerkas } from "../instrumen/unduhBerkas";
import { GRUP_BERKAS, atributTerima, jenisIkonBerkas, periksaBerkas, ringkasJenis, ringkasSemua, ukuranTeks, type BerkasInstrumen, type JenisBerkas } from "@/lib/instrumenBerkas";

const URL_INSTRUMEN = "/api/sigap/pelatihan/instrumen";

type Daftar = { boleh_kelola: boolean; berkas: BerkasInstrumen[] };
type Antrean = { kunci: number; jenis: JenisBerkas; file: File; status: "menunggu" | "jalan" | "ok" | "gagal"; persen: number; pesan?: string };

function kirimBerkas(jenis: JenisBerkas, file: File, onKemajuan: (persen: number) => void): Promise<{ ok: boolean; pesan?: string }> {
  return new Promise((selesai) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", urlPelatihan(URL_INSTRUMEN));
    xhr.setRequestHeader("Authorization", `Bearer ${bacaSesi() ?? ""}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onKemajuan(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () => selesai({ ok: false, pesan: "Koneksi terputus. Periksa sinyal lalu coba lagi." });
    xhr.ontimeout = () => selesai({ ok: false, pesan: "Waktu habis. Coba lagi." });
    xhr.onload = () => {
      if (xhr.status === 401) {
        keMasuk();
        return selesai({ ok: false, pesan: "Sesi berakhir. Silakan masuk kembali." });
      }
      let j: { error?: string } = {};
      try {
        j = JSON.parse(xhr.responseText || "{}") as { error?: string };
      } catch {
        /* bukan JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) selesai({ ok: true });
      else selesai({ ok: false, pesan: j.error ?? `Gagal (${xhr.status}).` });
    };
    const fd = new FormData();
    fd.set("jenis", jenis);
    fd.set("judul", file.name.replace(/\.[^.]+$/, ""));
    fd.set("file", file);
    xhr.send(fd);
  });
}

function IkonBerkas({ nama }: { nama: string }) {
  const j = jenisIkonBerkas(nama);
  const warna: Record<typeof j, string> = { pdf: "bg-[#FDE8E8] text-[#B42329]", dokumen: "bg-[#E6EEFC] text-[#1F5FD1]", lembar: "bg-[#E3F6EC] text-[#13794B]", slide: "bg-[#FFF1D1] text-[#A86400]", arsip: "bg-[#EEF2F7] text-[#55657D]" };
  const teks: Record<typeof j, string> = { pdf: "PDF", dokumen: "DOC", lembar: "XLS", slide: "PPT", arsip: "FILE" };
  return <span className={`grid h-10 w-10 flex-none place-items-center rounded-[10px] text-[10.5px] font-extrabold ${warna[j]}`}>{teks[j]}</span>;
}

export default function InstrumenKelola() {
  const [data, setData] = useState<Daftar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [antrean, setAntrean] = useState<Antrean[]>([]);
  const [yakin, setYakin] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const nomor = useRef(0);
  const jalan = useRef(false);

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Daftar>(URL_INSTRUMEN));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  // antrean diproses satu per satu
  useEffect(() => {
    if (jalan.current) return;
    const berikut = antrean.find((a) => a.status === "menunggu");
    if (!berikut) return;
    jalan.current = true;
    setAntrean((l) => l.map((a) => (a.kunci === berikut.kunci ? { ...a, status: "jalan", persen: 0 } : a)));
    void kirimBerkas(berikut.jenis, berikut.file, (persen) => setAntrean((l) => l.map((a) => (a.kunci === berikut.kunci ? { ...a, persen } : a)))).then(async (h) => {
      setAntrean((l) => l.map((a) => (a.kunci === berikut.kunci ? (h.ok ? { ...a, status: "ok", persen: 100 } : { ...a, status: "gagal", pesan: h.pesan }) : a)));
      if (h.ok) await muat();
      jalan.current = false;
      setAntrean((l) => [...l]); // memicu efek ini lagi untuk berkas berikutnya
    });
  }, [antrean, muat]);

  function tambah(jenis: JenisBerkas, files: FileList | File[] | null) {
    if (!files) return;
    setInfo(null);
    const baru: Antrean[] = Array.from(files).map((file) => {
      const tolak = periksaBerkas(jenis, file.name, file.size);
      return { kunci: ++nomor.current, jenis, file, status: tolak ? "gagal" : "menunggu", persen: 0, pesan: tolak ?? undefined };
    });
    setAntrean((l) => [...l, ...baru]);
  }
  const ulangi = (kunci: number) => setAntrean((l) => l.map((a) => (a.kunci === kunci ? { ...a, status: "menunggu", persen: 0, pesan: undefined } : a)));
  const buang = (kunci: number) => setAntrean((l) => l.filter((a) => a.kunci !== kunci));
  const bersihkan = () => setAntrean((l) => l.filter((a) => a.status === "menunggu" || a.status === "jalan"));

  async function sembunyikan(b: BerkasInstrumen) {
    setSibuk(b.id);
    setYakin(null);
    try {
      await fetchJson(URL_INSTRUMEN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "sembunyikan", id: b.id }) });
      setInfo(`"${b.judul}" disembunyikan dari peserta.`);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  async function lihat(b: BerkasInstrumen) {
    setSibuk(b.id);
    setGalat(null);
    try {
      await unduhBerkas(b);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  if (!data && !galat) return <Memuat />;
  if (!data) return <Pesan jenis="galat">{galat}</Pesan>;
  const bisa = data.boleh_kelola;
  const ringkas = ringkasSemua(data.berkas);
  const berhasilBaru = antrean.filter((a) => a.status === "ok").length;
  const gagalBaru = antrean.filter((a) => a.status === "gagal").length;
  const sedang = antrean.some((a) => a.status === "menunggu" || a.status === "jalan");

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="ok" onTutup={() => setInfo(null)}>{info}</Pesan>}
      {!sedang && berhasilBaru > 0 && gagalBaru === 0 && <Pesan jenis="ok">✓ {berhasilBaru} berkas berhasil diunggah dan sudah tampil di halaman Instrumen peserta.</Pesan>}
      {!sedang && gagalBaru > 0 && <Pesan jenis="peringatan">{berhasilBaru > 0 ? `${berhasilBaru} berkas berhasil, ` : ""}{gagalBaru} berkas gagal. Lihat alasannya pada berkas di bawah.</Pesan>}

      <section aria-label="Ringkasan instrumen" className="rounded-[18px] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.08)] lg:rounded-[10px] lg:border lg:border-[#DDE6F3] lg:shadow-none">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-extrabold text-[#0F2A52]">Instrumen pelatihan</h3>
          <Chip w={ringkas.lengkap ? "ok" : "wait"}>{ringkas.terisi}/{ringkas.jenis.length} jenis sudah diunggah</Chip>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {ringkas.jenis.map((j) => (
            <div key={j.jenis} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${j.ada ? "border-[#BFE5CF] bg-[#F1FAF5]" : "border-[#F0DFA8] bg-[#FFFAEB]"}`}>
              <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-[14px] font-extrabold ${j.ada ? "bg-[#19A463] text-white" : "bg-[#F5C84C] text-[#5E4300]"}`} aria-hidden>
                {j.ada ? "✓" : "!"}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold text-[#0F2A52]">{j.judul}</span>
                <span className={`block text-[12px] font-semibold ${j.ada ? "text-[#13794B]" : "text-[#8A6200]"}`}>{j.teks}</span>
              </span>
            </div>
          ))}
        </div>
        {!bisa && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat. Mengunggah memerlukan izin kelola pelatihan.</p>}
      </section>

      {GRUP_BERKAS.map((g) => {
        const daftar = data.berkas.filter((b) => b.jenis === g.jenis);
        const r = ringkasJenis(data.berkas, g.jenis);
        const antreanIni = antrean.filter((a) => a.jenis === g.jenis);
        return (
          <Kartu key={g.jenis} judul={<JudulIkon kunci={g.jenis} teks={g.judul} />} ket={g.ket} kanan={<Chip w={r.ada ? "ok" : "wait"}>{r.ada ? `✓ ${r.teks}` : r.teks}</Chip>}>
            {daftar.length === 0 ? (
              <p className="rounded-lg bg-[#FFFAEB] px-3 py-2.5 text-[13px] text-[#8A6200]">{g.kosong}</p>
            ) : (
              <ul className="m-0 list-none space-y-2 p-0">
                {daftar.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[#BFE5CF] bg-[#F8FDFA] px-3 py-2.5">
                    <IkonBerkas nama={b.nama_file} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 break-words text-[13.5px] font-semibold leading-snug text-[#0F2A52]">{b.judul}</p>
                      <p className="m-0 text-[11.5px] text-[#6B7A90]">
                        <span className="font-bold text-[#13794B]">✓ Terunggah</span> · {b.nama_file.split(".").pop()?.toUpperCase()}
                        {b.ukuran ? ` · ${ukuranTeks(b.ukuran)}` : ""} · {tglSedang(b.diunggah_at)}
                      </p>
                    </div>
                    <button type="button" className={BTN_O} disabled={sibuk === b.id} onClick={() => void lihat(b)}>
                      {sibuk === b.id ? "Menyiapkan…" : "Buka"}
                    </button>
                    {bisa &&
                      (yakin === b.id ? (
                        <>
                          <button type="button" className={BTN_R} disabled={sibuk === b.id} onClick={() => void sembunyikan(b)}>
                            Ya, sembunyikan
                          </button>
                          <button type="button" className={BTN_O} onClick={() => setYakin(null)}>
                            Batal
                          </button>
                        </>
                      ) : (
                        <button type="button" className={BTN_R} disabled={sibuk === b.id} onClick={() => setYakin(b.id)}>
                          Sembunyikan
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}

            {bisa && (
              <div className="mt-3 border-t border-[#EDF0F4] pt-3">
                <label
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-[#B9C8E4] bg-[#F7FAFF] px-3 py-4 text-center hover:bg-[#EFF5FF]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    tambah(g.jenis, e.dataTransfer.files);
                  }}
                >
                  <span className="text-[13.5px] font-extrabold text-[#1F5FD1]">⬆ Pilih berkas (boleh lebih dari satu)</span>
                  <span className="text-[12px] text-[#6B7A90]">atau seret ke sini · {g.terima.join(", ")} · maks 100 MB per berkas</span>
                  <input
                    type="file"
                    multiple
                    accept={atributTerima(g)}
                    className="hidden"
                    onChange={(e) => {
                      tambah(g.jenis, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>

                {antreanIni.length > 0 && (
                  <ul className="m-0 mt-2.5 list-none space-y-1.5 p-0" aria-live="polite">
                    {antreanIni.map((a) => (
                      <li key={a.kunci} className={`rounded-xl border px-3 py-2 ${a.status === "ok" ? "border-[#BFE5CF] bg-[#F1FAF5]" : a.status === "gagal" ? "border-[#F2B8BA] bg-[#FFF3F3]" : "border-[#DDE6F3] bg-white"}`}>
                        <div className="flex items-center gap-2">
                          <IkonBerkas nama={a.file.name} />
                          <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-[13px] font-semibold text-[#0F2A52]">{a.file.name}</p>
                            <p className={`m-0 text-[12px] font-bold ${a.status === "ok" ? "text-[#13794B]" : a.status === "gagal" ? "text-[#B42329]" : "text-[#55657D]"}`}>
                              {a.status === "menunggu" && "Menunggu giliran…"}
                              {a.status === "jalan" && `Mengunggah… ${a.persen}%`}
                              {a.status === "ok" && "✓ Berhasil diunggah"}
                              {a.status === "gagal" && `✗ ${a.pesan ?? "Gagal."}`}
                              <span className="ml-1.5 font-normal text-[#6B7A90]">{ukuranTeks(a.file.size)}</span>
                            </p>
                          </div>
                          {a.status === "gagal" && !periksaBerkas(a.jenis, a.file.name, a.file.size) && (
                            <button type="button" className={BTN} onClick={() => ulangi(a.kunci)}>
                              Coba lagi
                            </button>
                          )}
                          {(a.status === "gagal" || a.status === "ok") && (
                            <button type="button" className="px-1.5 text-[18px] leading-none text-[#6B7A90]" aria-label={`Tutup status ${a.file.name}`} onClick={() => buang(a.kunci)}>
                              ×
                            </button>
                          )}
                        </div>
                        {(a.status === "jalan" || a.status === "menunggu") && (
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E1E9F6]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.persen}>
                            <div className="h-full rounded-full bg-[#1F5FD1] transition-all" style={{ width: `${a.persen}%` }} />
                          </div>
                        )}
                      </li>
                    ))}
                    {antreanIni.some((a) => a.status === "ok" || a.status === "gagal") && !sedang && (
                      <li className="list-none text-right">
                        <button type="button" className="text-[12px] font-semibold text-[#1F5FD1] underline" onClick={bersihkan}>
                          Bersihkan status
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </Kartu>
        );
      })}
    </div>
  );
}
