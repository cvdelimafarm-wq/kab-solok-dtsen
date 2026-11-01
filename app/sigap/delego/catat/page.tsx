"use client";

// app/sigap/delego/catat/page.tsx
//
// (1 Nov 2026) Catat pekerjaan: pegawai mengusulkan pekerjaannya sendiri dan menautkannya ke kegiatan tim (atau Pekerjaan kantor) supaya alurnya tetap jelas
// seolah didelegasikan dari atas. Usulan berstatus "Usulan" (tidak membebani matriks, hanya bayangan) sampai Ketua Tim menyetujui. Satuan, volume, dan skor wajib;
// skor yang berbeda jauh dari pekerjaan sejenis (satuan sama) menampilkan peringatan kesetaraan dan wajib beralasan.

import Link from "next/link";
import { useMemo, useState } from "react";
import { angka, bulat, hariKerjaAntara, kapasitasPada, tambahHari, tglPendek } from "@/lib/delego/hitung";
import { bandingSkor, galatAlasanSkor } from "@/lib/delego/skor";
import { menitDariPoin } from "@/lib/delego/teknis";
import { NAMA_KELAS, type KelasPekerjaan } from "@/lib/delego/tipe";
import { rentangMinggu, susunRekap } from "@/lib/delego/rekap";
import { aksiKeu, useKatalogSkor, useRekap, useSaya, useTinjauBahan } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Batang, Galat, Halaman, Info, Kartu, Medan, Memuat, Peringatan, fmt } from "../ui";

const HARI = [
  { n: 1, t: "Sen" },
  { n: 2, t: "Sel" },
  { n: 3, t: "Rab" },
  { n: 4, t: "Kam" },
  { n: 5, t: "Jum" },
  { n: 6, t: "Sab" },
  { n: 7, t: "Min" },
];

export default function Catat() {
  const { hari } = useKonteksDelego();
  const kat = useKatalogSkor();
  const bahan = useTinjauBahan();
  const saya = useSaya();
  const rekapSaya = useRekap(hari, tambahHari(hari, 55));
  const [tautan, setTautan] = useState<string>("kantor"); // "kantor" atau id kegiatan
  const [kelompok, setKelompok] = useState("");
  const [judul, setJudul] = useState("");
  const [uraian, setUraian] = useState("");
  const [jenisId, setJenisId] = useState("");
  const [satuan, setSatuan] = useState("");
  const [volume, setVolume] = useState("");
  const [skor, setSkor] = useState("");
  const [alasan, setAlasan] = useState("");
  const [mulai, setMulai] = useState(hari);
  const [tenggat, setTenggat] = useState(tambahHari(hari, 4));
  const [hk, setHk] = useState<number[]>([1, 2, 3, 4, 5]);
  const [kelas, setKelas] = useState<KelasPekerjaan | "">("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [berhasil, setBerhasil] = useState<string | null>(null);

  const d = kat.data;
  const jenisSiap = useMemo(() => (d ? d.jenis.filter((j) => j.aktif && j.skor_status === "disetujui") : []), [d]);
  const pilihJenis = (id: string) => {
    setJenisId(id);
    const j = jenisSiap.find((x) => String(x.id) === id);
    if (j) {
      setSatuan(j.satuan);
      setSkor(String(angka(j.poin_per_satuan)));
      setAlasan("");
    }
  };

  const vol = angka(volume.replace(",", "."));
  const pps = angka(skor.replace(",", "."));
  const total = Math.round(vol * pps * 100) / 100;
  const nhk = mulai && tenggat && tenggat >= mulai ? hariKerjaAntara(mulai, tenggat, hk) : 0;
  const perHari = nhk > 0 ? total / nhk : 0;
  const kap = kapasitasPada(mulai || hari);
  const persenHari = kap > 0 ? (perHari / kap) * 100 : 0;
  const banding = useMemo(() => (d ? bandingSkor(d.jenis, satuan, pps) : null), [d, satuan, pps]);
  const galatAlasan = banding ? galatAlasanSkor(banding, alasan) : null;

  // beban Anda pada rentang yang sama SEBELUM usulan ini (delegasi, lapangan, pelatihan, ketersediaan)
  const sebelum = useMemo(() => {
    if (!saya.data || !rekapSaya.data || !mulai || !tenggat || tenggat < mulai) return null;
    const dari = mulai < hari ? hari : mulai;
    const sampai = tenggat > tambahHari(hari, 55) ? tambahHari(hari, 55) : tenggat;
    if (sampai < dari) return null;
    const nama: Record<number, string> = {};
    for (const l of rekapSaya.data.lapangan) nama[l.kegiatan_id] = l.kegiatan;
    const h = susunRekap({ orang: [{ akun: saya.data.akun.id, nama: saya.data.akun.nama }], delegasi: saya.data.delegasi, lapangan: rekapSaya.data.lapangan.filter((l) => l.akun === saya.data!.akun.id), ketersediaan: rekapSaya.data.ketersediaan.filter((k) => k.akun === saya.data!.akun.id), dari, sampai, namaKegiatan: nama });
    const b = h.baris[0];
    return b && b.kapasitas > 0 ? { persen: Math.round((b.total / b.kapasitas) * 100), kapasitas: b.kapasitas } : null;
  }, [saya.data, rekapSaya.data, mulai, tenggat, hari]);
  const persenSesudah = sebelum && total > 0 ? Math.round(sebelum.persen + (total / sebelum.kapasitas) * 100) : null;
  const kurang = [judul.trim().length < 3 ? "nama pekerjaan (min. 3 huruf)" : null, satuan.trim() === "" ? "satuan" : null, !(vol > 0) ? "volume" : null, !(pps > 0) ? "skor per satuan" : null, nhk <= 0 ? "jadwal (tenggat dan hari kerja)" : null, galatAlasan ? "alasan skor" : null].filter(Boolean);

  const lengkap = judul.trim().length >= 3 && satuan.trim() !== "" && vol > 0 && pps > 0 && nhk > 0 && !galatAlasan && (tautan !== "kantor" || kelompok !== "" || (d?.kelompok.length ?? 0) > 0);

  async function kirim() {
    setMengirim(true);
    setGalat(null);
    setBerhasil(null);
    const data: Record<string, unknown> = {
      judul: judul.trim(),
      uraian: uraian.trim(),
      satuan: satuan.trim(),
      volume: vol,
      poin_per_satuan: pps,
      skor_alasan: alasan.trim(),
      mulai,
      tenggat,
      hari_kerja: hk,
    };
    if (tautan === "kantor") data.kelompok = kelompok || d?.kelompok[0]?.kode;
    else data.kegiatan_id = Number(tautan);
    if (jenisId) data.jenis_id = Number(jenisId);
    data.kelas = kelas || "langsung"; // usulan pegawai adalah pekerjaan kerja, bukan kehadiran lapangan (itu dari penugasan)
    const r = await aksiKeu<{ poin_total: number; hari_kerja: number }>("keu_dlg_usul", { p_data: data });
    setMengirim(false);
    if (!r.ok) {
      setGalat(r.pesan);
      return;
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    setBerhasil(`Usulan terkirim: ${fmt(angka(r.data.poin_total), 1)} poin selama ${r.data.hari_kerja} hari kerja. Ketua Tim akan meninjau; Anda mendapat notifikasi.`);
    setJudul("");
    setUraian("");
    setJenisId("");
    setSatuan("");
    setVolume("");
    setSkor("");
    setAlasan("");
    await bahan.muat();
  }

  const usulanSaya = bahan.data?.saya.usulan.filter((u) => u.status === "usulan") ?? [];

  return (
    <Halaman judul="Catat pekerjaan" sub="Usulkan pekerjaan Anda sendiri. Tautkan ke kegiatan tim supaya jelas asal delegasinya; Ketua Tim menyetujui.">
      {kat.memuat && !d && <Memuat />}
      {kat.galat && !d && <Galat>{kat.galat}</Galat>}
      {d && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            {berhasil && <Info>{berhasil}</Info>}
            <Kartu judul="Tautkan dengan kegiatan tim">
              <div className="space-y-3">
                <Medan label="Pekerjaan ini bagian dari" bantu="Pilih kegiatan bila pekerjaan ini bagian dari kegiatan tim. Pilih Pekerjaan kantor bila tidak ada kegiatannya.">
                  <select className={KELAS.isian} value={tautan} onChange={(e) => setTautan(e.target.value)}>
                    <option value="kantor">Pekerjaan kantor (tanpa kegiatan tim)</option>
                    {d.kegiatan.map((k) => (
                      <option key={k.id} value={String(k.id)}>
                        {k.nama} · {k.ro_kode}
                      </option>
                    ))}
                  </select>
                </Medan>
                {tautan === "kantor" && d.kelompok.length > 0 && (
                  <Medan label="Kelompok pekerjaan kantor">
                    <select className={KELAS.isian} value={kelompok} onChange={(e) => setKelompok(e.target.value)}>
                      {d.kelompok.map((k) => (
                        <option key={k.kode} value={k.kode}>
                          {k.nama}
                        </option>
                      ))}
                    </select>
                  </Medan>
                )}
                {d.kegiatan.length === 0 && <Info>Tidak ada kegiatan tim yang bisa ditautkan saat ini. Usulan dicatat sebagai Pekerjaan kantor.</Info>}
              </div>
            </Kartu>

            <Kartu judul="Pekerjaan">
              <div className="space-y-3">
                <Medan label="Nama pekerjaan">
                  <input className={KELAS.isian} value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={200} placeholder="Mis. Memeriksa dokumen Seruti desa A" />
                </Medan>
                <Medan label="Uraian (boleh dikosongkan)">
                  <textarea className={KELAS.isian} rows={2} value={uraian} onChange={(e) => setUraian(e.target.value)} maxLength={1000} />
                </Medan>
                <Medan label="Jenis dari katalog (opsional)" bantu="Memilih jenis mengisi satuan dan skor otomatis. Jenis yang belum ada dapat diajukan di Katalog skor.">
                  <select className={KELAS.isian} value={jenisId} onChange={(e) => pilihJenis(e.target.value)}>
                    <option value="">Tidak memakai katalog</option>
                    {jenisSiap.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nama} · {fmt(angka(j.poin_per_satuan), 1)} poin per {j.satuan}
                      </option>
                    ))}
                  </select>
                </Medan>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Medan label="Satuan">
                    <input className={KELAS.isian} value={satuan} onChange={(e) => setSatuan(e.target.value)} maxLength={30} placeholder="dokumen" disabled={!!jenisId} />
                  </Medan>
                  <Medan label="Volume">
                    <input className={KELAS.isian} inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="20" />
                  </Medan>
                  <Medan label="Skor beban per satuan (poin)">
                    <input className={KELAS.isian} inputMode="decimal" value={skor} onChange={(e) => setSkor(e.target.value)} placeholder="9" />
                  </Medan>
                </div>
                {banding && pps > 0 && satuan.trim() !== "" && (
                  <div className="space-y-2">
                    {banding.peringatan ? <Peringatan>{banding.pesan}</Peringatan> : <Info>{banding.pesan}</Info>}
                    {banding.setara.filter((s) => String(s.id) !== jenisId).length > 0 && (
                      <div className="text-[12.5px] text-[#3B4A57]">
                        Setara dengan:{" "}
                        {banding.setara.filter((s) => String(s.id) !== jenisId).map((s) => `${s.nama} (${fmt(s.poin, 1)} poin per ${s.satuan}, sekitar ${fmt(s.menit, 0)} menit)`).join("; ") || "belum ada lainnya"}
                      </div>
                    )}
                    {banding.perluAlasan && (
                      <Medan label="Alasan skor" bantu={galatAlasan ?? "Jelaskan mengapa skor ini berbeda dari pekerjaan sejenis."}>
                        <textarea className={KELAS.isian} rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={300} />
                      </Medan>
                    )}
                  </div>
                )}
                <Medan label="Jenis urusan (opsional)" bantu="Bila dikosongkan, dicatat sebagai Pekerjaan langsung. Kehadiran lapangan dan pelatihan tidak perlu dicatat di sini: sudah otomatis dari penugasan kegiatan.">
                  <select className={KELAS.isian} value={kelas} onChange={(e) => setKelas(e.target.value as KelasPekerjaan | "")}>
                    <option value="">Otomatis</option>
                    {(Object.keys(NAMA_KELAS) as KelasPekerjaan[]).map((k) => (
                      <option key={k} value={k}>
                        {NAMA_KELAS[k]}
                      </option>
                    ))}
                  </select>
                </Medan>
              </div>
            </Kartu>

            <Kartu judul="Jadwal">
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Medan label="Mulai">
                    <input type="date" className={KELAS.isian} value={mulai} onChange={(e) => setMulai(e.target.value)} />
                  </Medan>
                  <Medan label="Tenggat">
                    <input type="date" className={KELAS.isian} value={tenggat} min={mulai} onChange={(e) => setTenggat(e.target.value)} />
                  </Medan>
                </div>
                <div>
                  <div className="mb-1 text-[13px] font-semibold">Hari kerja</div>
                  <div className="flex flex-wrap gap-2">
                    {HARI.map((h) => {
                      const on = hk.includes(h.n);
                      return (
                        <button
                          key={h.n}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setHk((x) => (on ? x.filter((n) => n !== h.n) : [...x, h.n].sort()))}
                          className={`min-h-[40px] min-w-[48px] rounded-lg border px-3 text-[13.5px] font-semibold ${on ? "border-[#0F6B63] bg-[#0F6B63] text-white" : "border-[#BCC6CE] bg-white text-[#14212B]"}`}
                        >
                          {h.t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Kartu>

            {galat && <Galat>{galat}</Galat>}
            {kurang.length > 0 && <p className="m-0 text-[12.5px] text-[#8A4605]">Belum lengkap: {kurang.join(", ")}.</p>}
            <button type="button" className={`${KELAS.tombolUtama} w-full`} disabled={!lengkap || mengirim} onClick={() => void kirim()}>
              {mengirim ? "Mengirim..." : "Kirim usulan ke Ketua Tim"}
            </button>
          </div>

          <aside className="space-y-3">
            <Kartu judul="Pratinjau dampak beban">
              {total > 0 && nhk > 0 ? (
                <div className="space-y-2 text-[13.5px]">
                  <div className="flex justify-between">
                    <span>Total</span>
                    <b>{fmt(total, 1)} poin</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Hari kerja</span>
                    <b>{nhk} hari</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Per hari</span>
                    <b>{fmt(bulat(perHari, 1), 1)} poin</b>
                  </div>
                  <Batang persen={persenHari} nada={persenHari > 100 ? "merah" : persenHari > 80 ? "amber" : "hijau"} />
                  <div className="text-[12.5px] text-[#3B4A57]">
                    {fmt(Math.round(persenHari), 0)}% dari kapasitas {kap} poin per hari. Setara sekitar {fmt(menitDariPoin(perHari), 0)} menit kerja per hari. Tidak termasuk pekerjaan lain Anda.
                  </div>
                  {sebelum && persenSesudah !== null && (
                    <div className={`rounded-lg px-3 py-2 text-[13px] leading-snug ${persenSesudah > 100 ? "bg-[#FBE9E9] text-[#9B2C2C]" : "bg-[#F1F7F6] text-[#0B524C]"}`}>
                      Beban Anda pada rentang ini: <b>{sebelum.persen}%</b> sekarang, <b>{persenSesudah}%</b> bila usulan ini disetujui.{persenSesudah > 100 ? " Melebihi kapasitas." : ""}
                    </div>
                  )}
                  {tenggat < mulai && <Galat>Tenggat tidak boleh sebelum tanggal mulai.</Galat>}
                  <div className="text-[12.5px] text-[#3B4A57]">
                    {tglPendek(mulai)} sampai {tglPendek(tenggat)}
                  </div>
                </div>
              ) : (
                <p className="m-0 text-[13.5px] text-[#3B4A57]">Isi satuan, volume, skor, dan jadwal untuk melihat dampaknya pada beban harian Anda.</p>
              )}
            </Kartu>
            <Kartu judul={`Usulan saya yang menunggu (${usulanSaya.length})`}>
              {usulanSaya.length === 0 ? (
                <p className="m-0 text-[13.5px] text-[#3B4A57]">Tidak ada usulan yang menunggu persetujuan.</p>
              ) : (
                <ul className="m-0 list-none space-y-2 p-0 text-[13.5px]">
                  {usulanSaya.map((u) => (
                    <li key={u.id}>
                      <div className="font-semibold">{u.judul}</div>
                      <div className="text-[12.5px] text-[#3B4A57]">
                        {u.kegiatan_nama ?? "Pekerjaan kantor"} · {fmt(angka(u.target_total), 1)} poin
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/sigap/delego/saya" className={`${KELAS.tombolKecil} mt-3`}>
                Buka Delegasi saya
              </Link>
            </Kartu>
          </aside>
        </div>
      )}
    </Halaman>
  );
}
