"use client";

// app/sigap/delego/buat/page.tsx
//
// (26 Okt 2026; diperluas tahap 39) Buat delegasi. Ketua Tim mendelegasikan langsung ke wakil, pegawai, PML, dan PPL (setara, tanpa perantara).
// Asal pekerjaan: (a) identifikasi yang sah, (b) RO langsung, atau (c) "Pekerjaan tim" non-RO untuk pekerjaan teknis kantor (periksa dokumen, KAK, dsb.).
// Pekerjaan teknis memilih JENIS dari katalog (poin tetap per satuan) lalu mengisi jumlah; target total dan harian dihitung otomatis.
// Pekerjaan mendadak (insidental) selesai dalam satu hari dan boleh bertenggat jam. Daftar langkah (checklist) dan permintaan hasil/tinjau diatur per delegasi.
// Satu isian dapat dikirim ke banyak penerima: tiap penerima mendapat satu baris delegasi sendiri sehingga laporan dan skornya terpisah.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { angka, bebanDelegasiMinggu, bebanPerOrang, KAPASITAS_HARIAN, kapasitasMinggu, SASARAN_BEBAN, tambahHari } from "@/lib/delego/hitung";
import { bacaBarisLangkah, hitungTargetJenis, teksDurasi } from "@/lib/delego/teknis";
import type { Delegasi } from "@/lib/delego/tipe";
import { useBahan, useKirim } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import PemilihPenerima, { type Pilihan } from "../PemilihPenerima";
import { Galat, Halaman, Info, Kartu, Kosong, Medan, Peringatan, fmt } from "../ui";

const HARI: { n: number; label: string }[] = [
  { n: 1, label: "Sen" }, { n: 2, label: "Sel" }, { n: 3, label: "Rab" }, { n: 4, label: "Kam" }, { n: 5, label: "Jum" }, { n: 6, label: "Sab" }, { n: 7, label: "Min" },
];
const SEMUA_HARI = [1, 2, 3, 4, 5, 6, 7];

type Asal = "tim" | "ident" | "ro";

export default function Buat() {
  const { hak, hari, jam, pemberi, manajer } = useKonteksDelego();
  const router = useRouter();
  const q = useSearchParams();
  const kelompokBoleh = hak.beri_kelompok ?? [];
  const daftarKelompok = (hak.kelompok ?? []).filter((k) => k.aktif && kelompokBoleh.includes(k.kode));
  const daftarJenis = (hak.jenis ?? []).filter((j) => j.aktif);

  const [asal, setAsal] = useState<Asal>(kelompokBoleh.length > 0 ? "tim" : "ident");
  const [ident, setIdent] = useState<number | null>(null);
  const [roBebas, setRoBebas] = useState("");
  const [kelompok, setKelompok] = useState("");
  const ro = asal === "ident" ? (ident ? hak.ident.find((i) => i.id === ident)?.ro_kode ?? "" : "") : asal === "ro" ? roBebas : kelompok;
  const [pilih, setPilih] = useState<Pilihan[]>([]);

  const [jenisId, setJenisId] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [judul, setJudul] = useState("");
  const [uraian, setUraian] = useState("");
  const [harian, setHarian] = useState(String(KAPASITAS_HARIAN));
  const [total, setTotal] = useState("");
  const [satuan, setSatuan] = useState("poin");
  const [bobot, setBobot] = useState("1");
  const [mulai, setMulai] = useState(hari);
  const [tenggat, setTenggat] = useState(tambahHari(hari, 13));
  const [hk, setHk] = useState<number[]>([1, 2, 3, 4, 5]);
  const [mendadak, setMendadak] = useState(false);
  const [jamTenggat, setJamTenggat] = useState("");
  const [perluHasil, setPerluHasil] = useState(false);
  const [perluTinjau, setPerluTinjau] = useState(false);
  const [langkahTeks, setLangkahTeks] = useState("");

  const jenis = daftarJenis.find((j) => String(j.id) === jenisId) ?? null;
  const pps = jenis ? angka(jenis.poin_per_satuan) : 0;

  useEffect(() => {
    const i = Number(q?.get("ident") ?? "");
    if (Number.isInteger(i) && i > 0 && hak.ident.some((x) => x.id === i)) {
      setAsal("ident");
      setIdent(i);
    }
  }, [q, hak.ident]);
  useEffect(() => {
    if (asal === "tim" && !kelompok && daftarKelompok.length === 1) setKelompok(daftarKelompok[0].kode);
  }, [asal, kelompok, daftarKelompok]);
  // penerima milik asal lama tidak berlaku bila asal berubah
  useEffect(() => setPilih([]), [ro]);

  const pilihJenis = (id: string) => {
    setJenisId(id);
    const j = daftarJenis.find((x) => String(x.id) === id) ?? null;
    if (j) {
      setPerluHasil(j.perlu_hasil);
      setPerluTinjau(j.perlu_tinjau);
      setLangkahTeks((j.langkah_bawaan ?? []).join("\n"));
      setJudul((x) => (x.trim() === "" ? j.nama : x));
    } else {
      setPerluHasil(false);
      setPerluTinjau(false);
      setLangkahTeks("");
    }
  };
  const gantiMendadak = (v: boolean) => {
    setMendadak(v);
    if (v) {
      setMulai(hari);
      setTenggat(hari);
      setHk(SEMUA_HARI);
      if (!jenis) setHarian("40");
    } else {
      setTenggat(tambahHari(hari, 13));
      setHk([1, 2, 3, 4, 5]);
      if (!jenis) setHarian("60");
    }
  };

  const bahan = useBahan({ aktif: manajer });
  const kirim = useKirim(async () => {});

  const hkPakai = mendadak ? SEMUA_HARI : hk;
  const jumlahAngka = Number(jumlah.replace(",", "."));
  const rentangSah = !!mulai && !!tenggat && tenggat >= mulai;
  const hitung = jenis && jumlahAngka > 0 && rentangSah ? hitungTargetJenis(pps, jumlahAngka, mulai, tenggat, hkPakai) : null;
  const th = jenis ? hitung?.harian ?? 0 : Number(harian);
  const contoh = useMemo(
    () => ({ status: "baru", mulai, tenggat, hari_kerja: hkPakai, target_harian: Number.isFinite(th) ? th : 0 }) as unknown as Delegasi,
    [mulai, tenggat, hkPakai, th],
  );
  const tambah = Number.isFinite(th) && rentangSah ? bebanDelegasiMinggu(contoh, hari) : 0;
  const beban = useMemo(() => new Map(bebanPerOrang(bahan.data?.delegasi ?? [], hari).map((o) => [o.akun, o])), [bahan.data, hari]);
  const l = useMemo(() => bacaBarisLangkah(langkahTeks), [langkahTeks]);

  const galatLokal = useMemo(() => {
    if (!ro) return asal === "tim" ? "Pilih Pekerjaan tim." : asal === "ident" ? "Pilih identifikasi." : "Pilih RO.";
    if (judul.trim().length < 3) return "Judul minimal 3 huruf.";
    if (jenis && !(jumlahAngka > 0)) return `Isi jumlah pekerjaan (${jenis.satuan}).`;
    if (pilih.length === 0) return "Pilih sedikitnya satu penerima.";
    if (!rentangSah) return "Tenggat tidak boleh sebelum tanggal mulai.";
    if (hkPakai.length === 0) return "Pilih sedikitnya satu hari kerja.";
    if (!jenis && !(th >= 0 && th <= 1000)) return "Target harian 0 sampai 1000.";
    if (jenis && hitung && hitung.harian > 1000) return "Beban harian melebihi 1000 poin: perpanjang tenggat atau kurangi jumlah.";
    if (jamTenggat && !/^([01]\d|2[0-3]):[0-5]\d$/.test(jamTenggat)) return "Jam tenggat berbentuk HH:MM.";
    if (jamTenggat && tenggat === hari && Number(jamTenggat.slice(0, 2)) + Number(jamTenggat.slice(3, 5)) / 60 <= jam) return "Jam tenggat hari ini sudah lewat.";
    if (perluTinjau && !perluHasil) return "Tinjau hasil hanya bermakna bila delegasi meminta hasil kerja.";
    if (l.galat) return l.galat;
    return null;
  }, [ro, asal, judul, jenis, jumlahAngka, pilih.length, rentangSah, hkPakai.length, th, hitung, jamTenggat, tenggat, hari, jam, perluTinjau, perluHasil, l.galat]);

  const simpan = async () => {
    if (galatLokal) return;
    const ok = await kirim.kirim("keu_dlg_buat", {
      p_data: {
        ...(asal === "ident" ? { ident_id: ident } : asal === "tim" ? { kelompok } : { ro_kode: ro }),
        judul: judul.trim(), uraian: uraian.trim(), bobot, mulai, tenggat,
        ...(mendadak ? { insidental: true } : { hari_kerja: hk }),
        ...(jamTenggat ? { tenggat_jam: jamTenggat } : {}),
        ...(jenis ? { jenis_id: jenis.id, jumlah: jumlahAngka } : { satuan: satuan.trim() || "poin", target_harian: harian, target_total: total.trim() === "" ? null : total }),
        perlu_hasil: perluHasil, perlu_tinjau: perluTinjau, langkah: l.langkah,
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
  const pilihAsal: { k: Asal; label: string; tampil: boolean }[] = [
    { k: "tim", label: "Pekerjaan tim", tampil: kelompokBoleh.length > 0 },
    { k: "ident", label: "Dari identifikasi", tampil: true },
    { k: "ro", label: "Per RO", tampil: true },
  ];

  return (
    <Halaman judul="Buat delegasi" sub="Langsung dari Ketua Tim ke wakil, pegawai, PML, dan PPL">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Kartu judul="1. Asal pekerjaan">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Asal pekerjaan">
                {pilihAsal.filter((a) => a.tampil).map((a) => (
                  <button key={a.k} type="button" role="radio" aria-checked={asal === a.k} onClick={() => setAsal(a.k)}
                    className={`min-h-[40px] rounded-lg border px-3 text-[13.5px] ${asal === a.k ? "border-[#0F6B63] bg-[#E3F0EE] font-semibold" : "border-[#BCC6CE] bg-white"}`}>
                    {a.label}
                  </button>
                ))}
              </div>
              {asal === "tim" && (
                <Medan label="Pekerjaan tim" bantu="Untuk pekerjaan teknis kantor yang tidak melekat pada satu RO (memeriksa dokumen, menyusun KAK, evaluasi, briefing).">
                  <select className={KELAS.isian} value={kelompok} onChange={(e) => setKelompok(e.target.value)}>
                    <option value="">Pilih kelompok</option>
                    {daftarKelompok.map((k) => <option key={k.kode} value={k.kode}>{k.nama}</option>)}
                  </select>
                </Medan>
              )}
              {asal === "ident" && (
                <Medan label="Identifikasi kebutuhan" bantu="Pilih identifikasi yang sudah disahkan sebagai asal pekerjaan ini.">
                  <select className={KELAS.isian} value={ident ?? ""} onChange={(e) => setIdent(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Pilih identifikasi</option>
                    {hak.ident.map((i) => (
                      <option key={i.id} value={i.id}>{i.nama} · {i.ro_kode}{i.lanjutan_final ? " · lanjutan final" : ""}</option>
                    ))}
                  </select>
                </Medan>
              )}
              {asal === "ro" && (
                <Medan label="RO">
                  <select className={KELAS.isian} value={roBebas} onChange={(e) => setRoBebas(e.target.value)}>
                    <option value="">Pilih RO</option>
                    {roSaja.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Medan>
              )}
              {ro && asal !== "tim" && <p className="m-0 text-[13px] text-[#3B4A57]">RO: <b>{ro}</b></p>}
            </div>
          </Kartu>

          <Kartu judul="2. Isi delegasi">
            <div className="space-y-3">
              <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-lg border border-[#E5B77E] bg-[#FCEFDD] px-3 py-2 text-[13.5px]">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0F6B63]" checked={mendadak} onChange={(e) => gantiMendadak(e.target.checked)} />
                <span><b>Pekerjaan mendadak</b> (selesai hari ini, boleh bertenggat jam). Pengingat otomatis dikirim 2 jam sebelum tenggat.</span>
              </label>

              {daftarJenis.length > 0 && (
                <Medan label="Jenis pekerjaan" bantu={jenis ? `${fmt(pps, 1)} poin per ${jenis.satuan} (sekitar ${teksDurasi(pps)}). ${jenis.uraian}` : "Pilih dari katalog supaya beban dihitung dengan ukuran tetap; atau kosongkan untuk mengisi poin langsung."}>
                  <select className={KELAS.isian} value={jenisId} onChange={(e) => pilihJenis(e.target.value)}>
                    <option value="">Lainnya (isi poin langsung)</option>
                    {daftarJenis.map((j) => <option key={j.id} value={j.id}>{j.nama} · {fmt(angka(j.poin_per_satuan), 1)} poin/{j.satuan}</option>)}
                  </select>
                </Medan>
              )}
              <Medan label="Judul"><input className={KELAS.isian} maxLength={200} value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="Contoh: Memeriksa dokumen pertanggungjawaban Oktober" /></Medan>
              <Medan label="Uraian dan petunjuk (opsional)"><textarea className={KELAS.isian} rows={3} maxLength={1000} value={uraian} onChange={(e) => setUraian(e.target.value)} /></Medan>

              {jenis ? (
                <div className="space-y-2">
                  <Medan label={`Jumlah (${jenis.satuan})`}>
                    <input type="number" inputMode="decimal" min={0} step="any" className={KELAS.isian} value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" />
                  </Medan>
                  {hitung && (
                    <Info>
                      {fmt(jumlahAngka, 2)} {jenis.satuan} × {fmt(pps, 1)} = <b>{fmt(hitung.total, 1)} poin</b> (sekitar {teksDurasi(hitung.total)}). Dibagi {hitung.hariKerja} hari kerja = <b>{fmt(hitung.harian, 1)} poin per hari</b>.
                    </Info>
                  )}
                  {hitung && hitung.harian > KAPASITAS_HARIAN && <Peringatan>Melebihi kapasitas {KAPASITAS_HARIAN} poin per hari. Perpanjang tenggat, kurangi jumlah, atau bagi ke beberapa penerima.</Peringatan>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Medan label={mendadak ? "Beban (poin)" : "Target harian"} bantu={`Kapasitas ${KAPASITAS_HARIAN} poin per hari kerja`}><input type="number" min={0} max={1000} className={KELAS.isian} value={harian} onChange={(e) => setHarian(e.target.value)} /></Medan>
                  <Medan label="Satuan"><input className={KELAS.isian} maxLength={30} value={satuan} onChange={(e) => setSatuan(e.target.value)} /></Medan>
                  {!mendadak && <Medan label="Target total (opsional)" bantu="Kosong = target harian × hari kerja"><input type="number" min={0} className={KELAS.isian} value={total} onChange={(e) => setTotal(e.target.value)} /></Medan>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Medan label="Bobot (1-5)"><select className={KELAS.isian} value={bobot} onChange={(e) => setBobot(e.target.value)}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></Medan>
                <Medan label="Jam tenggat (opsional, WIB)"><input type="time" className={KELAS.isian} value={jamTenggat} onChange={(e) => setJamTenggat(e.target.value)} /></Medan>
                <Medan label="Mulai"><input type="date" className={KELAS.isian} value={mulai} disabled={mendadak} onChange={(e) => setMulai(e.target.value)} /></Medan>
                <Medan label="Tenggat"><input type="date" className={KELAS.isian} min={mulai} value={tenggat} onChange={(e) => setTenggat(e.target.value)} /></Medan>
              </div>
              {!mendadak && (
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
                  <p className="m-0 mt-1 text-[12px] text-[#3B4A57]">Tanggal yang ditandai libur di Kalender libur otomatis tidak dihitung hari kerja (cek aturan libur daerah).</p>
                </fieldset>
              )}
            </div>
          </Kartu>

          <Kartu judul="3. Hasil kerja dan langkah">
            <div className="space-y-3">
              <label className="flex min-h-[40px] cursor-pointer items-start gap-2.5 text-[14px]">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0F6B63]" checked={perluHasil} onChange={(e) => { setPerluHasil(e.target.checked); if (!e.target.checked) setPerluTinjau(false); }} />
                <span><b>Penerima menyerahkan hasil kerja</b> (tautan berkas, teks, atau foto). Tanpa ini, pekerjaan dicatat lewat laporan harian saja.</span>
              </label>
              <label className={`flex min-h-[40px] items-start gap-2.5 text-[14px] ${perluHasil ? "cursor-pointer" : "opacity-50"}`}>
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0F6B63]" checked={perluTinjau} disabled={!perluHasil} onChange={(e) => setPerluTinjau(e.target.checked)} />
                <span><b>Saya tinjau hasilnya</b>: diterima atau diminta revisi. Delegasi selesai setelah hasil diterima.</span>
              </label>
              <Medan label="Langkah pengerjaan (opsional, satu langkah per baris)" bantu={`${l.langkah.length} langkah. Penerima mencentang langkah yang selesai.`}>
                <textarea className={KELAS.isian} rows={4} value={langkahTeks} onChange={(e) => setLangkahTeks(e.target.value)} placeholder={"Telaah bahan\nSusun draf\nFinalisasi"} />
              </Medan>
            </div>
          </Kartu>
        </div>

        <div className="space-y-4">
          <Kartu judul={`4. Penerima${pilih.length ? ` (${pilih.length})` : ""}`}>
            <PemilihPenerima
              ro={ro}
              ident={asal === "ident" ? ident : null}
              pilih={pilih}
              setPilih={setPilih}
              bebanOrang={(akun) => beban.get(akun)?.persen ?? null}
              infoBeban={(akun) => {
                if (!bahan.data) return null;
                const o = beban.get(akun);
                const sebelum = o?.persen ?? 0;
                const sesudah = Math.round(((o?.beban ?? 0) + tambah) / kapasitasMinggu(hari) * 100);
                return (
                  <p className={`m-0 mt-1.5 text-[12.5px] ${sesudah > SASARAN_BEBAN.max ? "font-semibold text-[#9B2C2C]" : "text-[#3B4A57]"}`}>
                    Beban minggu ini {sebelum}% → {fmt(sesudah)}%{sesudah > SASARAN_BEBAN.max ? " (melebihi sasaran)" : ""}
                  </p>
                );
              }}
            />
          </Kartu>

          <Kartu judul="5. Periksa dan kirim">
            <div className="space-y-3">
              <p className="m-0 text-[13.5px] text-[#33404B]">
                {pilih.length} penerima akan mendapat delegasi masing-masing dan notifikasi. Tambahan beban per orang minggu ini: {fmt(tambah)} poin.
              </p>
              {pilih.some((p) => p.jenis === "mitra") && <Info>Mitra tanpa ponsel dapat dilaporkan PML pada RO yang sama (ditandai &quot;diwakili&quot;).</Info>}
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
