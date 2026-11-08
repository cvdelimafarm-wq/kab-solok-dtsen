"use client";

// app/sigap/pelatihan/kelola/pengaturanKelas.tsx
//
// (8 Nov 2026) Tab "Tim & Peserta" > Pengaturan kelas: berapa kelas pelatihan ini, nama dan kuotanya, siapa peserta tiap kelas, siapa instrukturnya, dan siapa panitianya.
// Semua pilihan kelas di Adu Sigap, Monitoring, dan Instruktur mengikuti daftar ini. Pelatihan satu kelas tidak menampilkan "Semua Kelas".
// Langkah "Libatkan orang" menandai siapa saja yang ikut pelatihan ini (peserta, instruktur, panitia): tidak semua pegawai wajib ikut. API: /api/sigap/pelatihan/pengaturan-kelas.

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan, TD, TH } from "../../admin/ui";
import { Toast, useToast } from "../../admin/Toast";
import SelectCari from "@/app/components/SelectCari";

type Kelas = { nomor: number; nama: string; kuota: number | null; peserta: number; instruktur: { akun_id: number; nama: string }[] };
type Peserta = { penugasan_id: number; akun_id: number; nama: string; peran: string; kelas: number | null; sumber: string | null };
type Panitia = { akun_peran_id: number; akun_id: number; nama: string; peran: string; peran_nama: string; lingkup: "kegiatan" | "semua" };
type Data = { kegiatan_id: number; nama: string; kelas: Kelas[]; peserta: Peserta[]; tanpa_kelas: number; panitia: Panitia[]; peran_peserta: string[]; maks: number; boleh_kelola: boolean };

const URL_API = "/api/sigap/pelatihan/pengaturan-kelas";
const LABEL_PERAN: Record<string, string> = { ppl: "PPL", pml: "PML", korwil: "Korwil" };

function BarisKelas({ k, boleh, sibuk, onSimpan, onHapus }: { k: Kelas; boleh: boolean; sibuk: boolean; onSimpan: (nomor: number, nama: string, kuota: string) => void; onHapus: (nomor: number) => void }) {
  const [nama, setNama] = useState(k.nama);
  const [kuota, setKuota] = useState(k.kuota === null ? "" : String(k.kuota));
  useEffect(() => {
    setNama(k.nama);
    setKuota(k.kuota === null ? "" : String(k.kuota));
  }, [k.nama, k.kuota]);
  const berubah = nama.trim() !== k.nama || kuota.trim() !== (k.kuota === null ? "" : String(k.kuota));
  const alasanKunci = k.peserta > 0 ? `Masih berisi ${k.peserta} peserta` : k.instruktur.length > 0 ? "Masih punya instruktur" : "";
  return (
    <li className="rounded-lg border border-[#DDE6F3] px-3 py-2.5" data-testid={`kelas-${k.nomor}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#EAF1FD] text-[13px] font-extrabold text-[#1F5FD1]">{k.nomor}</span>
        <input className={`${INPUT} min-w-[140px] flex-1`} value={nama} maxLength={60} disabled={!boleh || sibuk} onChange={(e) => setNama(e.target.value)} aria-label={`Nama kelas ${k.nomor}`} />
        <label className="flex items-center gap-1.5 text-[12.5px] text-[#5B6B84]">
          Kuota
          <input className={`${INPUT} w-[78px] text-center tabular-nums`} inputMode="numeric" placeholder="bebas" value={kuota} disabled={!boleh || sibuk} onChange={(e) => setKuota(e.target.value.replace(/[^0-9]/g, ""))} aria-label={`Kuota kelas ${k.nomor}`} />
        </label>
        <Chip w={k.kuota !== null && k.peserta > k.kuota ? "bad" : "mut"}>{k.peserta} peserta</Chip>
        {boleh && (
          <>
            <button type="button" className={BTN} disabled={!berubah || sibuk} onClick={() => onSimpan(k.nomor, nama, kuota)}>
              Simpan
            </button>
            <button type="button" className={BTN_O} disabled={sibuk || alasanKunci !== ""} title={alasanKunci || "Hapus kelas kosong ini"} onClick={() => onHapus(k.nomor)}>
              Hapus
            </button>
          </>
        )}
      </div>
      <p className="mt-1.5 pl-9 text-[12.5px] text-[#5B6B84]">
        Instruktur: {k.instruktur.length === 0 ? <span className="text-[#9A6200]">belum ada</span> : <b className="font-semibold text-[#1B2B4B]">{k.instruktur.map((i) => i.nama).join(", ")}</b>}
      </p>
    </li>
  );
}

type AkunCari = { id: number; nama: string; jenis: string | null; sebagai: string[] };

/** Langkah menandai siapa saja yang dilibatkan di pelatihan ini: cari akun, pilih sebagai peserta / instruktur / panitia. */
function KartuLibatkan({ d, sibuk, kirim }: { d: Data; sibuk: boolean; kirim: (body: Record<string, unknown>, pesanOk: (r: { nama?: string }) => string) => Promise<boolean> }) {
  const [q, setQ] = useState("");
  const [hasil, setHasil] = useState<AkunCari[]>([]);
  const [mencari, setMencari] = useState(false);
  const [akun, setAkun] = useState<AkunCari | null>(null);
  const [sebagai, setSebagai] = useState<"peserta" | "instruktur" | "panitia">("peserta");
  const [peran, setPeran] = useState(d.peran_peserta[0] ?? "");
  const [kelas, setKelas] = useState<number | "">("");
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (akun) return;
    const kata = q.trim();
    if (kata.length < 2) {
      setHasil([]);
      return;
    }
    let batal = false;
    setMencari(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetchJson<{ akun: AkunCari[] }>(urlPelatihan(`${URL_API}?cari=${encodeURIComponent(kata)}`));
        if (!batal) setHasil(r.akun);
      } catch (e) {
        if (!batal && !(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      } finally {
        if (!batal) setMencari(false);
      }
    }, 300);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [q, akun]);
  useEffect(() => {
    if (!peran && d.peran_peserta[0]) setPeran(d.peran_peserta[0]);
  }, [d.peran_peserta, peran]);

  const butuhKelas = sebagai === "instruktur";
  const bisa = !!akun && !sibuk && (sebagai !== "peserta" || !!peran) && (!butuhKelas || kelas !== "");

  async function libatkan(e: React.FormEvent) {
    e.preventDefault();
    if (!akun || !bisa) return;
    setGalat(null);
    const body: Record<string, unknown> = { aksi: "libatkan", akun_id: akun.id, sebagai };
    if (sebagai === "peserta") {
      body.peran = peran;
      body.kelas = kelas === "" ? null : kelas;
    }
    if (sebagai === "instruktur") body.kelas = kelas;
    if (sebagai === "panitia" && kelas !== "") body.kelas = kelas;
    const ket = sebagai === "peserta" ? "peserta" : sebagai === "instruktur" ? "instruktur" : "panitia";
    const ok = await kirim(body, () => `${akun.nama} dilibatkan sebagai ${ket}.`);
    if (ok) {
      setAkun(null);
      setQ("");
      setHasil([]);
    }
  }

  return (
    <Kartu judul="Libatkan orang di pelatihan ini" ket="Tidak semua pegawai wajib ikut. Tandai hanya yang dilibatkan: sebagai peserta, instruktur, atau panitia. Satu orang boleh punya lebih dari satu peran di pelatihan ini.">
      <form onSubmit={libatkan} className="flex flex-wrap items-start gap-2" data-testid="form-libatkan">
        <div className="relative min-w-[220px] flex-1">
          {akun ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#1F6FD1]/40 bg-[#E3EEFB] px-2.5 py-1.5 text-[13px]">
              <b className="flex-1 truncate">{akun.nama}</b>
              {akun.sebagai.length > 0 && <span className="text-[11px] text-[#4D5B6B]">{akun.sebagai.join(", ")}</span>}
              <button type="button" onClick={() => setAkun(null)} className="font-bold text-[#1F6FD1]" aria-label="Ganti akun">×</button>
            </div>
          ) : (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama pegawai atau mitra…" className={`${INPUT} w-full`} aria-label="Cari akun yang dilibatkan" />
          )}
          {!akun && q.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {mencari && hasil.length === 0 && <p className="px-3 py-2 text-[12px] text-[#7B8794]">Mencari…</p>}
              {!mencari && hasil.length === 0 && <p className="px-3 py-2 text-[12px] text-[#7B8794]">Tidak ditemukan.</p>}
              {hasil.map((a) => (
                <button key={a.id} type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-[#F2F6FC]" onClick={() => setAkun(a)}>
                  <span className="flex-1 truncate font-semibold text-[#1B2B4B]">{a.nama}</span>
                  <span className="text-[11px] text-[#7B8794]">{a.jenis}</span>
                  {a.sebagai.length > 0 && <Chip w="ok">{a.sebagai.join(", ")}</Chip>}
                </button>
              ))}
            </div>
          )}
        </div>
        <SelectCari className={INPUT} value={sebagai} onChange={(e) => setSebagai(e.target.value as typeof sebagai)} aria-label="Dilibatkan sebagai">
          <option value="peserta">Sebagai peserta</option>
          <option value="instruktur">Sebagai instruktur</option>
          <option value="panitia">Sebagai panitia</option>
        </SelectCari>
        {sebagai === "peserta" && (
          <SelectCari className={INPUT} value={peran} onChange={(e) => setPeran(e.target.value)} aria-label="Peran peserta">
            {d.peran_peserta.length === 0 && <option value="">Belum ada peran di tarif kegiatan</option>}
            {d.peran_peserta.map((r) => <option key={r} value={r}>{LABEL_PERAN[r] ?? r}</option>)}
          </SelectCari>
        )}
        {(
          <SelectCari className={INPUT} value={kelas} onChange={(e) => setKelas(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Kelas">
            <option value="">{sebagai === "peserta" ? "— belum berkelas —" : sebagai === "panitia" ? "Kelas administrasi (bawaan: kelas pertama)" : "Pilih kelas (wajib)"}</option>
            {d.kelas.map((k) => <option key={k.nomor} value={k.nomor}>{k.nama}</option>)}
          </SelectCari>
        )}
        <button type="submit" className={BTN} disabled={!bisa}>{sibuk ? "Menyimpan…" : "Libatkan"}</button>
      </form>
      {sebagai === "panitia" && <p className="mt-2 text-[12px] text-[#6B7A90]">Panitia Pelatihan hanya berlaku untuk pelatihan ini dan hak lain di aplikasi tidak berubah. Panitia ikut daftar peserta di Administrasi (dokumen yang sama); kelasnya menentukan di tab kelas mana ia muncul.</p>}
      {sebagai === "instruktur" && <p className="mt-2 text-[12px] text-[#6B7A90]">Instruktur masuk daftar tersendiri di Administrasi (dokumen yang sama dengan peserta).</p>}
      {galat && <div className="mt-2"><Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan></div>}
    </Kartu>
  );
}

export default function PengaturanKelasKelola({ bukaInstruktur }: { bukaInstruktur?: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const toast = useToast();
  const [jumlah, setJumlah] = useState(1);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState(""); // "" semua | "tanpa" | nomor kelas
  const [dipilih, setDipilih] = useState<Set<number>>(new Set());
  const [tujuan, setTujuan] = useState<number | "">("");
  const [konfirmasi, setKonfirmasi] = useState<"bagi" | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data>(urlPelatihan(URL_API));
      setD(r);
      setJumlah(r.kelas.length);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  async function kirim(body: Record<string, unknown>, pesanOk: (r: { berubah?: number; jumlah?: number; nama?: string; catatan?: string }) => string) {
    setSibuk(true);
    toast.tampil("simpan", "Menyimpan…");
    try {
      const r = await fetchJson<{ ok: boolean; berubah?: number; jumlah?: number; nama?: string; catatan?: string }>(urlPelatihan(URL_API), { method: "POST", body: JSON.stringify(body) });
      toast.tampil(r.catatan ? "galat" : "ok", r.catatan ? `${pesanOk(r)} ${r.catatan}` : pesanOk(r));
      await muat();
      return true;
    } catch (e) {
      toast.tampil("galat", e instanceof SesiBerakhir ? "Sesi berakhir, masuk kembali." : pesanGalat(e));
      await muat();
      return false;
    } finally {
      setSibuk(false);
    }
  }

  const nomorAda = useMemo(() => new Set((d?.kelas ?? []).map((k) => k.nomor)), [d]);
  const namaKelas = useMemo(() => new Map((d?.kelas ?? []).map((k) => [k.nomor, k.nama])), [d]);
  const tanpaKelas = (p: Peserta) => p.kelas == null || !nomorAda.has(p.kelas);
  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (d?.peserta ?? []).filter((p) => {
      if (q && !p.nama.toLowerCase().includes(q)) return false;
      if (saring === "tanpa") return tanpaKelas(p);
      if (saring !== "" && p.kelas !== Number(saring)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, cari, saring, nomorAda]);

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const boleh = d.boleh_kelola;
  const satuKelas = d.kelas.length === 1;
  const semuaTampakDipilih = baris.length > 0 && baris.every((p) => dipilih.has(p.penugasan_id));

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}

      {boleh && <KartuLibatkan d={d} sibuk={sibuk} kirim={kirim} />}

      <Kartu judul="Kelas pelatihan" ket={`${d.kelas.length} kelas · ${d.peserta.length} peserta aktif${d.tanpa_kelas > 0 ? ` · ${d.tanpa_kelas} belum berkelas` : ""}. Semua pilihan kelas di Adu Sigap, Monitoring, dan Instruktur mengikuti daftar ini.`}>
        {satuKelas && <p className="mb-3 rounded-lg bg-[#EAF1FD] px-3 py-2 text-[12.5px] text-[#1B3F7A]">Pelatihan ini hanya <b>1 kelas</b>, jadi Adu Sigap tidak menampilkan pilihan kelas maupun “Semua Kelas”; peserta langsung masuk ke kelas itu.</p>}
        {boleh && (
          <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="atur-jumlah">
            <span className="text-[13px] font-semibold text-[#1B2B4B]">Jumlah kelas</span>
            <button type="button" className={BTN_O} aria-label="Kurangi jumlah kelas" disabled={sibuk || jumlah <= 1} onClick={() => setJumlah((j) => Math.max(1, j - 1))}>−</button>
            <input className={`${INPUT} w-[64px] text-center tabular-nums`} type="number" min={1} max={d.maks} value={jumlah} onChange={(e) => setJumlah(Math.min(d.maks, Math.max(1, Number(e.target.value) || 1)))} aria-label="Jumlah kelas" />
            <button type="button" className={BTN_O} aria-label="Tambah jumlah kelas" disabled={sibuk || jumlah >= d.maks} onClick={() => setJumlah((j) => Math.min(d.maks, j + 1))}>＋</button>
            <button type="button" className={BTN} disabled={sibuk || jumlah === d.kelas.length} onClick={() => void kirim({ aksi: "atur_jumlah", jumlah }, (r) => `Jumlah kelas menjadi ${r.jumlah ?? jumlah}.`)}>
              Terapkan
            </button>
            <button type="button" className={BTN_O} disabled={sibuk || d.kelas.length >= d.maks} onClick={() => void kirim({ aksi: "tambah_kelas" }, () => "Kelas ditambahkan.")}>
              + Kelas baru
            </button>
            <span className="text-[12px] text-[#6B7A90]">Mengurangi hanya bisa untuk kelas yang kosong (tanpa peserta dan instruktur).</span>
          </div>
        )}
        <ul className="space-y-2" data-testid="daftar-kelas">
          {d.kelas.map((k) => (
            <BarisKelas
              key={k.nomor}
              k={k}
              boleh={boleh}
              sibuk={sibuk}
              onSimpan={(nomor, nama, kuota) => void kirim({ aksi: "ubah_kelas", nomor, nama, kuota: kuota === "" ? null : Number(kuota) }, () => `Kelas ${nomor} tersimpan.`)}
              onHapus={(nomor) => void kirim({ aksi: "hapus_kelas", nomor }, () => `Kelas ${nomor} dihapus.`)}
            />
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-[#6B7A90]">
          Instruktur kelas ditetapkan di bagian{" "}
          {bukaInstruktur ? (
            <button type="button" className="font-semibold text-[#1F5FD1] underline" onClick={bukaInstruktur}>Instruktur</button>
          ) : (
            <b>Instruktur</b>
          )}
          .
        </p>
      </Kartu>

      <Kartu judul="Peserta per kelas" ket="Pilih peserta lalu pindahkan sekaligus, atau ubah kelas satu per satu lewat pilihan di barisnya.">
        {!boleh && <p className="mb-2 text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat; mengubah kelas peserta butuh izin Kelola.</p>}
        {boleh && d.peserta.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="aksi-massal">
            {d.tanpa_kelas > 0 && (
              <>
                <span className="text-[12.5px] text-[#9A6200]">{d.tanpa_kelas} belum berkelas →</span>
                <SelectCari className={INPUT} value={tujuan} onChange={(e) => setTujuan(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Kelas tujuan">
                  <option value="">Pilih kelas</option>
                  {d.kelas.map((k) => <option key={k.nomor} value={k.nomor}>{k.nama}</option>)}
                </SelectCari>
                <button type="button" className={BTN} disabled={sibuk || tujuan === ""} onClick={() => void kirim({ aksi: "masukkan_semua", kelas: tujuan }, (r) => `${r.berubah ?? 0} peserta dimasukkan ke ${namaKelas.get(Number(tujuan)) ?? "kelas"}.`)}>
                  Masukkan semuanya
                </button>
              </>
            )}
            {d.kelas.length > 1 &&
              (konfirmasi === "bagi" ? (
                <span className="flex items-center gap-2 rounded-lg bg-[#FFF4E0] px-2.5 py-1.5 text-[12.5px] text-[#7A4B00]">
                  Semua peserta dibagi rata ke {d.kelas.length} kelas (urut nama); kelas lama diganti. Lanjutkan?
                  <button type="button" className={BTN} disabled={sibuk} onClick={() => { setKonfirmasi(null); void kirim({ aksi: "bagi_rata" }, (r) => `${r.berubah ?? 0} peserta dipindahkan.`); }}>Ya, bagi rata</button>
                  <button type="button" className={BTN_O} onClick={() => setKonfirmasi(null)}>Batal</button>
                </span>
              ) : (
                <button type="button" className={BTN_O} disabled={sibuk} onClick={() => setKonfirmasi("bagi")}>Bagi rata semua peserta</button>
              ))}
          </div>
        )}
        {d.peserta.length === 0 ? (
          <p className="text-[13px] text-[#6B7A90]">Belum ada peserta aktif di pelatihan ini. Tandai yang dilibatkan lewat kartu “Libatkan orang di pelatihan ini” di atas.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input className={`${INPUT} min-w-[150px] flex-1`} placeholder="Cari nama…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari peserta" />
              <SelectCari className={INPUT} value={saring} onChange={(e) => setSaring(e.target.value)} aria-label="Saring kelas">
                <option value="">Semua kelas</option>
                {d.tanpa_kelas > 0 && <option value="tanpa">Belum berkelas</option>}
                {d.kelas.map((k) => <option key={k.nomor} value={k.nomor}>{k.nama}</option>)}
              </SelectCari>
              {boleh && dipilih.size > 0 && (
                <span className="flex flex-wrap items-center gap-2" data-testid="pindah-terpilih">
                  <b className="text-[12.5px] text-[#1B2B4B]">{dipilih.size} dipilih →</b>
                  <SelectCari className={INPUT} value={tujuan} onChange={(e) => setTujuan(e.target.value === "" ? "" : Number(e.target.value))} aria-label="Pindahkan terpilih ke kelas">
                    <option value="">Pilih kelas</option>
                    {d.kelas.map((k) => <option key={k.nomor} value={k.nomor}>{k.nama}</option>)}
                  </SelectCari>
                  <button
                    type="button"
                    className={BTN}
                    disabled={sibuk || tujuan === ""}
                    onClick={async () => {
                      const ok = await kirim({ aksi: "pindah_peserta", penugasan_ids: [...dipilih], kelas: tujuan }, (r) => `${r.berubah ?? 0} peserta dipindahkan ke ${namaKelas.get(Number(tujuan)) ?? "kelas"}.`);
                      if (ok) setDipilih(new Set());
                    }}
                  >
                    Pindahkan
                  </button>
                  <button type="button" className={BTN_O} onClick={() => setDipilih(new Set())}>Kosongkan pilihan</button>
                </span>
              )}
            </div>
            <div className="max-h-[480px] overflow-auto rounded-lg border border-[#DDE6F3]">
              <table className="w-full min-w-[460px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {boleh && (
                      <th className={`${TH} w-9`}>
                        <input type="checkbox" aria-label="Pilih semua yang tampak" checked={semuaTampakDipilih} onChange={(e) => setDipilih((s) => { const n = new Set(s); for (const p of baris) e.target.checked ? n.add(p.penugasan_id) : n.delete(p.penugasan_id); return n; })} />
                      </th>
                    )}
                    <th className={TH}>Nama</th>
                    <th className={TH}>Peran</th>
                    <th className={TH}>Kelas</th>
                    {boleh && <th className={TH} />}
                  </tr>
                </thead>
                <tbody>
                  {baris.map((p) => (
                    <tr key={p.penugasan_id}>
                      {boleh && (
                        <td className={TD}>
                          <input type="checkbox" aria-label={`Pilih ${p.nama}`} checked={dipilih.has(p.penugasan_id)} onChange={(e) => setDipilih((s) => { const n = new Set(s); e.target.checked ? n.add(p.penugasan_id) : n.delete(p.penugasan_id); return n; })} />
                        </td>
                      )}
                      <td className={`${TD} font-semibold text-[#1B2B4B]`}>{p.nama}</td>
                      <td className={TD}>{LABEL_PERAN[p.peran] ?? p.peran}</td>
                      <td className={TD}>
                        {boleh ? (
                          <SelectCari
                            className={INPUT}
                            value={tanpaKelas(p) ? "" : p.kelas ?? ""}
                            disabled={sibuk}
                            aria-label={`Kelas ${p.nama}`}
                            onChange={(e) => void kirim({ aksi: "pindah_peserta", penugasan_ids: [p.penugasan_id], kelas: e.target.value === "" ? null : Number(e.target.value) }, () => `${p.nama} dipindahkan.`)}
                          >
                            <option value="">— belum berkelas —</option>
                            {d.kelas.map((k) => <option key={k.nomor} value={k.nomor}>{k.nama}</option>)}
                          </SelectCari>
                        ) : tanpaKelas(p) ? (
                          <Chip w="wait">belum berkelas</Chip>
                        ) : (
                          namaKelas.get(p.kelas as number)
                        )}
                      </td>
                      {boleh && (
                        <td className={TD}>
                          <button type="button" className={BTN_O} disabled={sibuk} title="Keluarkan dari pelatihan ini (data tidak dihapus, bisa dilibatkan lagi)" onClick={() => void kirim({ aksi: "keluarkan", sebagai: "peserta", penugasan_id: p.penugasan_id }, () => `${p.nama} dikeluarkan dari pelatihan.`)}>
                            Keluarkan
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {baris.length === 0 && (
                    <tr>
                      <td className={`${TD} text-[#6B7A90]`} colSpan={boleh ? 5 : 3}>Tidak ada peserta yang cocok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12px] text-[#6B7A90]">{baris.length} dari {d.peserta.length} peserta ditampilkan. Untuk pindah kelas disertai alasan dan bisa diurungkan, pakai tab Kendala.</p>
          </>
        )}
      </Kartu>

      <Kartu judul="Panitia" ket="Pemegang peran pengelola untuk pelatihan ini. Panitia melihat semua kelas; instruktur hanya kelasnya.">
        {d.panitia.length === 0 ? (
          <p className="text-[13px] text-[#9A6200]">Belum ada panitia yang ditetapkan untuk pelatihan ini.</p>
        ) : (
          <ul className="divide-y divide-[#E6ECF5] rounded-lg border border-[#DDE6F3]" data-testid="daftar-panitia">
            {d.panitia.map((p) => (
              <li key={`${p.akun_id}:${p.peran}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#1B2B4B]">{p.nama}</span>
                <Chip w={p.lingkup === "kegiatan" ? "ok" : "mut"}>{p.peran_nama}</Chip>
                {p.lingkup === "semua" && <span className="text-[11.5px] text-[#6B7A90]">semua kegiatan</span>}
                {boleh && p.lingkup === "kegiatan" && p.peran === "panitia_pelatihan" && (
                  <button type="button" className={BTN_O} disabled={sibuk} onClick={() => void kirim({ aksi: "keluarkan", sebagai: "panitia", akun_peran_id: p.akun_peran_id }, () => `${p.nama} tidak lagi menjadi panitia.`)}>
                    Cabut
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12.5px] text-[#6B7A90]">Tambah panitia lewat kartu “Libatkan orang di pelatihan ini”. Peran dengan lingkup semua kegiatan atau peran lain dikelola di Pengelolaan › Peran dan akses.</p>
      </Kartu>
      <Toast isi={toast.isi} onTutup={toast.tutup} />
    </div>
  );
}
