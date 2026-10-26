"use client";

// app/sigap/delego/buat/page.tsx
//
// (26 Okt 2026) Buat delegasi. Ketua Tim mendelegasikan langsung ke wakil, pegawai, PML, dan PPL (setara, tanpa perantara).
// Asal bisa dari identifikasi yang sah (calon dari lanjutan final ditandai) atau langsung per RO. Satu isian dapat dikirim ke banyak penerima:
// tiap penerima mendapat satu baris delegasi sendiri sehingga laporan dan skornya terpisah. Mitra hanya berperan PML atau PPL.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { bebanDelegasiMinggu, bebanPerOrang, KAPASITAS_HARIAN, SASARAN_BEBAN, tambahHari } from "@/lib/delego/hitung";
import { NAMA_PERAN, type Delegasi, type JenisAkun, type PeranDelegasi } from "@/lib/delego/tipe";
import { useBahan, useCalon, useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat, Peringatan, fmt } from "../ui";

type Pilihan = { akun: number; nama: string; jenis: JenisAkun; peran: PeranDelegasi; pj: string };

const HARI: { n: number; label: string }[] = [
  { n: 1, label: "Sen" }, { n: 2, label: "Sel" }, { n: 3, label: "Rab" }, { n: 4, label: "Kam" }, { n: 5, label: "Jum" }, { n: 6, label: "Sab" }, { n: 7, label: "Min" },
];

const peranAwal = (jenis: JenisAkun, petunjuk?: string | null): PeranDelegasi => {
  const p = (petunjuk ?? "").toLowerCase();
  if (/\bpml\b/.test(p)) return "pml";
  if (/\bppl\b/.test(p)) return "ppl";
  if (jenis === "mitra") return "ppl";
  if (/wakil/.test(p)) return "wakil";
  return "pegawai";
};

export default function Buat() {
  const { hak, hari, pemberi, manajer } = useKonteksDelego();
  const router = useRouter();
  const q = useSearchParams();
  const [ident, setIdent] = useState<number | null>(null);
  const [roBebas, setRoBebas] = useState("");
  const ro = ident ? hak.ident.find((i) => i.id === ident)?.ro_kode ?? "" : roBebas;
  const [cari, setCari] = useState("");
  const [cariTunda, setCariTunda] = useState("");
  const [pilih, setPilih] = useState<Pilihan[]>([]);

  const [judul, setJudul] = useState("");
  const [uraian, setUraian] = useState("");
  const [harian, setHarian] = useState(String(KAPASITAS_HARIAN));
  const [total, setTotal] = useState("");
  const [satuan, setSatuan] = useState("poin");
  const [bobot, setBobot] = useState("1");
  const [mulai, setMulai] = useState(hari);
  const [tenggat, setTenggat] = useState(tambahHari(hari, 13));
  const [hk, setHk] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    const i = Number(q?.get("ident") ?? "");
    if (Number.isInteger(i) && i > 0 && hak.ident.some((x) => x.id === i)) setIdent(i);
  }, [q, hak.ident]);
  useEffect(() => {
    const t = setTimeout(() => setCariTunda(cari.trim()), 300);
    return () => clearTimeout(t);
  }, [cari]);
  // daftar pilihan milik RO lama tidak berlaku bila RO berubah
  useEffect(() => setPilih([]), [ro]);

  const calon = useCalon(ro || null, ident, cariTunda);
  const bahan = useBahan({ aktif: manajer });
  const kirim = useKirim(async () => {});

  const th = Number(harian);
  const contoh = useMemo(
    () => ({ status: "baru", mulai, tenggat, hari_kerja: hk, target_harian: Number.isFinite(th) ? th : 0 }) as unknown as Delegasi,
    [mulai, tenggat, hk, th],
  );
  const tambah = Number.isFinite(th) && mulai && tenggat && tenggat >= mulai ? bebanDelegasiMinggu(contoh, hari) : 0;
  const beban = useMemo(() => new Map(bebanPerOrang(bahan.data?.delegasi ?? [], hari).map((o) => [o.akun, o])), [bahan.data, hari]);

  const sudah = (akun: number) => pilih.some((p) => p.akun === akun);
  const tambahPilih = (akun: number, nama: string, jenis: JenisAkun, petunjuk?: string | null) => {
    if (sudah(akun)) return;
    setPilih((x) => [...x, { akun, nama, jenis, peran: peranAwal(jenis, petunjuk), pj: "" }]);
  };
  const ubah = (akun: number, p: Partial<Pilihan>) => setPilih((x) => x.map((y) => (y.akun === akun ? { ...y, ...p } : y)));

  const galatLokal = useMemo(() => {
    if (!ro) return "Pilih identifikasi atau RO.";
    if (judul.trim().length < 3) return "Judul minimal 3 huruf.";
    if (pilih.length === 0) return "Pilih sedikitnya satu penerima.";
    if (!tenggat || tenggat < mulai) return "Tenggat tidak boleh sebelum tanggal mulai.";
    if (hk.length === 0) return "Pilih sedikitnya satu hari kerja.";
    if (!(th >= 0 && th <= 1000)) return "Target harian 0 sampai 1000.";
    return null;
  }, [ro, judul, pilih.length, tenggat, mulai, hk.length, th]);

  const simpan = async () => {
    if (galatLokal) return;
    const ok = await kirim.kirim("keu_dlg_buat", {
      p_data: {
        ...(ident ? { ident_id: ident } : { ro_kode: ro }),
        judul: judul.trim(), uraian: uraian.trim(), satuan: satuan.trim() || "poin", target_harian: harian, target_total: total.trim() === "" ? null : total,
        bobot, mulai, tenggat, hari_kerja: hk,
        penerima: pilih.map((p) => ({ akun: p.akun, peran: p.peran, pj_bidang: p.pj.trim() })),
      },
    });
    if (ok) router.push("/sigap/delego/papan");
  };

  if (!pemberi) {
    return (
      <Halaman judul="Buat delegasi">
        <Kosong>Akun ini tidak berwenang mendelegasikan. Hubungi Ketua Tim atau admin anggaran.</Kosong>
      </Halaman>
    );
  }

  const roSaja = hak.beri_ro;
  return (
    <Halaman judul="Buat delegasi" sub="Langsung dari Ketua Tim ke wakil, pegawai, PML, dan PPL">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Kartu judul="1. Asal pekerjaan">
            <div className="space-y-3">
              <Medan label="Identifikasi kebutuhan (opsional)" bantu="Pilih bila pekerjaan ini berasal dari satu identifikasi yang sudah disahkan.">
                <select className={KELAS.isian} value={ident ?? ""} onChange={(e) => setIdent(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Tanpa identifikasi (pilih RO langsung)</option>
                  {hak.ident.map((i) => (
                    <option key={i.id} value={i.id}>{i.nama} · {i.ro_kode}{i.lanjutan_final ? " · lanjutan final" : ""}</option>
                  ))}
                </select>
              </Medan>
              {!ident && (
                <Medan label="RO">
                  <select className={KELAS.isian} value={roBebas} onChange={(e) => setRoBebas(e.target.value)}>
                    <option value="">Pilih RO</option>
                    {roSaja.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Medan>
              )}
              {ident && <p className="m-0 text-[13px] text-[#3B4A57]">RO: <b>{ro}</b></p>}
            </div>
          </Kartu>

          <Kartu judul="2. Isi delegasi">
            <div className="space-y-3">
              <Medan label="Judul"><input className={KELAS.isian} maxLength={200} value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Contoh: Pencacahan blok sensus 1 sampai 3" /></Medan>
              <Medan label="Uraian dan petunjuk (opsional)"><textarea className={KELAS.isian} rows={3} maxLength={1000} value={uraian} onChange={(e) => setUraian(e.target.value)} /></Medan>
              <div className="grid grid-cols-2 gap-3">
                <Medan label="Target harian" bantu={`Kapasitas ${KAPASITAS_HARIAN} poin per hari kerja`}><input type="number" min={0} max={1000} className={KELAS.isian} value={harian} onChange={(e) => setHarian(e.target.value)} /></Medan>
                <Medan label="Satuan"><input className={KELAS.isian} maxLength={30} value={satuan} onChange={(e) => setSatuan(e.target.value)} /></Medan>
                <Medan label="Target total (opsional)" bantu="Kosong = target harian × hari kerja"><input type="number" min={0} className={KELAS.isian} value={total} onChange={(e) => setTotal(e.target.value)} /></Medan>
                <Medan label="Bobot (1-5)"><select className={KELAS.isian} value={bobot} onChange={(e) => setBobot(e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></Medan>
                <Medan label="Mulai"><input type="date" className={KELAS.isian} value={mulai} onChange={(e) => setMulai(e.target.value)} /></Medan>
                <Medan label="Tenggat"><input type="date" className={KELAS.isian} min={mulai} value={tenggat} onChange={(e) => setTenggat(e.target.value)} /></Medan>
              </div>
              <fieldset className="m-0 border-0 p-0">
                <legend className="mb-1 text-[13px] font-semibold">Hari kerja</legend>
                <div className="flex flex-wrap gap-2">
                  {HARI.map((h) => (
                    <label key={h.n} className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13.5px] ${hk.includes(h.n) ? "border-[#0F6B63] bg-[#E3F0EE] font-semibold" : "border-[#BCC6CE] bg-white"}`}>
                      <input type="checkbox" className="accent-[#0F6B63]" checked={hk.includes(h.n)} onChange={() => setHk((x) => (x.includes(h.n) ? x.filter((y) => y !== h.n) : [...x, h.n].sort()))} />
                      {h.label}
                    </label>
                  ))}
                </div>
                <p className="m-0 mt-1 text-[12px] text-[#3B4A57]">Hari libur nasional belum dikecualikan otomatis; atur lewat hari kerja atau tenggat (cek aturan).</p>
              </fieldset>
            </div>
          </Kartu>
        </div>

        <div className="space-y-4">
          <Kartu judul={`3. Penerima${pilih.length ? ` (${pilih.length})` : ""}`}>
            {!ro ? (
              <p className="m-0 text-[13.5px] text-[#3B4A57]">Pilih identifikasi atau RO terlebih dulu.</p>
            ) : (
              <div className="space-y-4">
                {pilih.length > 0 && (
                  <ul className="m-0 list-none space-y-2 p-0">
                    {pilih.map((p) => {
                      const o = beban.get(p.akun);
                      const sebelum = o?.persen ?? 0;
                      const sesudah = Math.round(((o?.beban ?? 0) + tambah) / (KAPASITAS_HARIAN * 5) * 100);
                      return (
                        <li key={p.akun} className="rounded-lg border border-[#D5DCE2] bg-[#F9FBFB] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[14px] font-semibold">{p.nama}{p.jenis === "mitra" && <span className="text-[12px] font-normal text-[#3B4A57]"> · mitra</span>}</span>
                            <button type="button" className={KELAS.tombolKecil} onClick={() => setPilih((x) => x.filter((y) => y.akun !== p.akun))} aria-label={`Hapus ${p.nama} dari daftar`}>Lepas</button>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <select aria-label={`Peran ${p.nama}`} className={KELAS.isian} value={p.peran} onChange={(e) => ubah(p.akun, { peran: e.target.value as PeranDelegasi })}>
                              {(p.jenis === "mitra" ? (["pml", "ppl"] as const) : (["wakil", "pegawai", "pml", "ppl"] as const)).map((r) => <option key={r} value={r}>{NAMA_PERAN[r]}</option>)}
                            </select>
                            <input aria-label={`PJ bidang ${p.nama}`} className={KELAS.isian} maxLength={80} placeholder="PJ bidang (opsional)" value={p.pj} onChange={(e) => ubah(p.akun, { pj: e.target.value })} />
                          </div>
                          {bahan.data && (
                            <p className={`m-0 mt-1.5 text-[12.5px] ${sesudah > SASARAN_BEBAN.max ? "font-semibold text-[#9B2C2C]" : "text-[#3B4A57]"}`}>
                              Beban minggu ini {sebelum}% → {fmt(sesudah)}%{sesudah > SASARAN_BEBAN.max ? " (melebihi sasaran)" : ""}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {calon.memuat && !calon.data && <Memuat />}
                {calon.galat && !calon.data && <Galat>{calon.galat}</Galat>}
                {calon.data && (
                  <>
                    {ident && (
                      <div>
                        <div className={KELAS.labelKecil}>Dari lanjutan identifikasi</div>
                        {calon.data.lanjutan.filter((c) => c.akun_id !== hak.akun.id).length === 0 ? (
                          <p className="m-0 mt-1 text-[13px] text-[#3B4A57]">Belum ada petugas pada lanjutan final identifikasi ini.</p>
                        ) : (
                          <ul className="m-0 mt-1 list-none space-y-1 p-0">
                            {calon.data.lanjutan.filter((c) => c.akun_id !== hak.akun.id).map((c, i) => (
                              <li key={`${c.nama}-${i}`} className="flex items-center justify-between gap-2 text-[13.5px]">
                                <span className="min-w-0 truncate">{c.nama} <span className="text-[#3B4A57]">{c.peran ? `· ${c.peran}` : ""}</span></span>
                                {c.akun_id ? (
                                  <button type="button" className={KELAS.tombolKecil} disabled={sudah(c.akun_id)} onClick={() => tambahPilih(c.akun_id as number, c.nama, c.jenis === "mitra" ? "mitra" : "organik", `${c.peran ?? ""} ${c.jenis ?? ""}`)}>{sudah(c.akun_id) ? "Dipilih" : "Pilih"}</button>
                                ) : (
                                  <Lencana nada="amber">Belum punya akun</Lencana>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div>
                      <div className={KELAS.labelKecil}>Pegawai organik</div>
                      <ul className="m-0 mt-1 max-h-48 list-none space-y-1 overflow-y-auto p-0">
                        {calon.data.organik.filter((c) => c.id !== hak.akun.id).map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                            <span className="min-w-0 truncate">{c.nama}{beban.get(c.id) ? <span className="text-[12px] text-[#3B4A57]"> · beban {beban.get(c.id)?.persen}%</span> : null}</span>
                            <button type="button" className={KELAS.tombolKecil} disabled={sudah(c.id)} onClick={() => tambahPilih(c.id, c.nama, "organik")}>{sudah(c.id) ? "Dipilih" : "Pilih"}</button>
                          </li>
                        ))}
                        {calon.data.organik.length === 0 && <li className="text-[13px] text-[#3B4A57]">Tidak ada pegawai organik aktif.</li>}
                      </ul>
                    </div>
                  </>
                )}
                <div>
                  <label className="block space-y-1">
                    <span className={KELAS.labelKecil}>Cari mitra atau akun lain</span>
                    <input className={KELAS.isian} placeholder="Ketik minimal 2 huruf nama" value={cari} onChange={(e) => setCari(e.target.value)} />
                  </label>
                  {calon.data && cariTunda.length >= 2 && (
                    <ul className="m-0 mt-2 max-h-48 list-none space-y-1 overflow-y-auto p-0">
                      {calon.data.cari.filter((c) => c.id !== hak.akun.id).map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                          <span className="min-w-0 truncate">{c.nama} <span className="text-[12px] text-[#3B4A57]">· {c.jenis}{c.kecamatan ? ` · ${c.kecamatan}` : ""}</span></span>
                          <button type="button" className={KELAS.tombolKecil} disabled={sudah(c.id)} onClick={() => tambahPilih(c.id, c.nama, c.jenis)}>{sudah(c.id) ? "Dipilih" : "Pilih"}</button>
                        </li>
                      ))}
                      {calon.data.cari.length === 0 && <li className="text-[13px] text-[#3B4A57]">Tidak ditemukan.</li>}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Kartu>

          <Kartu judul="4. Periksa dan kirim">
            <div className="space-y-3">
              <p className="m-0 text-[13.5px] text-[#33404B]">
                {pilih.length} penerima akan mendapat delegasi masing-masing dan notifikasi. Tambahan beban per orang minggu ini: {fmt(tambah)} poin.
              </p>
              {pilih.some((p) => p.jenis === "mitra") && <Info>Mitra tanpa ponsel dapat dilaporkan PML pada RO yang sama (ditandai "diwakili").</Info>}
              {galatLokal && <Peringatan>{galatLokal}</Peringatan>}
              {kirim.galat && <Galat>{kirim.galat}</Galat>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={KELAS.tombolUtama} disabled={kirim.mengirim || !!galatLokal} onClick={() => void simpan()}>{kirim.mengirim ? "Menyimpan..." : `Buat ${pilih.length || ""} delegasi`.replace("  ", " ")}</button>
                <Link href="/sigap/delego/papan" className={KELAS.tombolSekunder}>Batal</Link>
              </div>
            </div>
          </Kartu>
        </div>
      </div>
    </Halaman>
  );
}
