"use client";

// app/sigap/pelatihan/kelola/pengumuman.tsx
//
// (8 Okt 2026) Kelola Pelatihan > tab "Pengumuman": atur modal pengumuman yang tampil di halaman Langkah peserta.
// Modal aktif tampil berurutan (antrian). Isi pesan = teks biasa + penanda **tebal**, ==sorot==, [teks](https://tautan), "- " daftar.
// Jenis (info/perhatian/penting), frekuensi (tiap dibuka / sekali per peserta), jadwal mulai-berakhir, sasaran kelas/peran, tombol tautan. Mockup disetujui user.

import { useCallback, useEffect, useRef, useState } from "react";
import { IKON_PENGUMUMAN, JENIS_PENGUMUMAN, LABEL_FREKUENSI, LABEL_JENIS_PENGUMUMAN, MAKS_ISI, MAKS_JUDUL, PERAN_SASARAN, type FrekuensiPengumuman, type JenisPengumuman, type Pengumuman } from "@/lib/sigapPengumuman";
import { fetchJson, pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { ModalPengumuman } from "../pengumumanUi";

const URL_API = "/api/sigap/pelatihan/admin/pengumuman";
const keInputWib = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16) : "");

type Form = {
  id: number | null;
  judul: string;
  jenis: JenisPengumuman;
  isi: string;
  tombol_label: string;
  tombol_url: string;
  frekuensi: FrekuensiPengumuman;
  sasaran_kelas: string;
  sasaran_peran: string;
  mulai_at: string;
  akhir_at: string;
  aktif: boolean;
};

const FORM_BARU: Form = { id: null, judul: "", jenis: "info", isi: "", tombol_label: "", tombol_url: "", frekuensi: "sekali", sasaran_kelas: "", sasaran_peran: "", mulai_at: "", akhir_at: "", aktif: false };

const dariBaris = (p: Pengumuman): Form => ({
  id: p.id,
  judul: p.judul,
  jenis: p.jenis,
  isi: p.isi,
  tombol_label: p.tombol_label ?? "",
  tombol_url: p.tombol_url ?? "",
  frekuensi: p.frekuensi,
  sasaran_kelas: p.sasaran_kelas != null ? String(p.sasaran_kelas) : "",
  sasaran_peran: p.sasaran_peran ?? "",
  mulai_at: keInputWib(p.mulai_at),
  akhir_at: keInputWib(p.akhir_at),
  aktif: p.aktif,
});

function statusModal(p: Pengumuman, sekarang: number): { w: "ok" | "wait" | "mut"; teks: string } {
  if (!p.aktif) return { w: "mut", teks: "Nonaktif" };
  if (p.mulai_at && sekarang < new Date(p.mulai_at).getTime()) return { w: "wait", teks: "Terjadwal" };
  if (p.akhir_at && sekarang >= new Date(p.akhir_at).getTime()) return { w: "mut", teks: "Berakhir" };
  return { w: "ok", teks: "Tampil" };
}

export default function PengumumanKelola() {
  const [daftar, setDaftar] = useState<Pengumuman[] | null>(null);
  const [bisaKelola, setBisaKelola] = useState(false);
  const [sekarang, setSekarang] = useState(Date.now());
  const [form, setForm] = useState<Form>(FORM_BARU);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const isiRef = useRef<HTMLTextAreaElement>(null);

  const muat = useCallback(async (pilihId?: number | null) => {
    try {
      const d = await fetchJson<{ boleh_kelola: boolean; sekarang: string; daftar: Pengumuman[] }>(URL_API);
      setDaftar(d.daftar);
      setBisaKelola(d.boleh_kelola);
      setSekarang(new Date(d.sekarang).getTime());
      setGalat(null);
      if (pilihId !== undefined) {
        const p = pilihId === null ? null : d.daftar.find((x) => x.id === pilihId);
        setForm(p ? dariBaris(p) : FORM_BARU);
      }
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    muat();
  }, [muat]);
  // pilih modal pertama saat daftar pertama kali tiba
  const awal = useRef(true);
  useEffect(() => {
    if (daftar && awal.current) {
      awal.current = false;
      if (daftar[0]) setForm(dariBaris(daftar[0]));
    }
  }, [daftar]);

  const ubah = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function sisip(aksi: "tebal" | "sorot" | "tautan" | "daftar") {
    const ta = isiRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const pilihan = ta.value.slice(s, e) || "teks";
    const ganti = { tebal: `**${pilihan}**`, sorot: `==${pilihan}==`, tautan: `[${pilihan}](https://)`, daftar: `${s > 0 && ta.value[s - 1] !== "\n" ? "\n" : ""}- ${pilihan}` }[aksi];
    const baru = ta.value.slice(0, s) + ganti + ta.value.slice(e);
    ubah("isi", baru);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + ganti.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function simpan() {
    setSibuk(true);
    setPesan(null);
    try {
      const r = await fetchJson<{ ok: boolean; id: number }>(URL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aksi: "simpan",
          id: form.id,
          judul: form.judul,
          jenis: form.jenis,
          isi: form.isi,
          tombol_label: form.tombol_label,
          tombol_url: form.tombol_url,
          frekuensi: form.frekuensi,
          sasaran_kelas: form.sasaran_kelas === "" ? null : Number(form.sasaran_kelas),
          sasaran_peran: form.sasaran_peran || null,
          mulai_at: form.mulai_at || null,
          akhir_at: form.akhir_at || null,
          aktif: form.aktif,
        }),
      });
      setPesan({ jenis: "ok", teks: form.aktif ? "Tersimpan. Modal ini aktif dan tampil bagi peserta sesuai jadwal & sasaran." : "Tersimpan (nonaktif: belum tampil bagi peserta)." });
      await muat(r.id);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setSibuk(false);
    }
  }

  async function geser(i: number, arah: -1 | 1) {
    if (!daftar) return;
    const j = i + arah;
    if (j < 0 || j >= daftar.length) return;
    const ids = daftar.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await fetchJson(URL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "urut", ids }) });
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  async function hidupMati(p: Pengumuman, aktif: boolean) {
    try {
      await fetchJson(URL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "aktif", id: p.id, aktif }) });
      await muat(form.id === p.id ? p.id : undefined);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setPesan({ jenis: "galat", teks: pesanGalat(e) });
    }
  }

  if (!daftar) return galat ? <Pesan jenis="galat">{galat}</Pesan> : <Memuat />;
  const nTampil = daftar.filter((p) => statusModal(p, sekarang).teks === "Tampil").length;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Kartu judul="Daftar pengumuman" ket={`${nTampil} modal sedang tampil bagi peserta`}>
        {galat && <Pesan jenis="galat">{galat}</Pesan>}
        <div className="space-y-1.5">
          {daftar.length === 0 && <p className="text-[12.5px] text-[#7B8794]">Belum ada pengumuman. Klik &quot;+ Pengumuman baru&quot;.</p>}
          {daftar.map((p, i) => {
            const st = statusModal(p, sekarang);
            return (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${form.id === p.id ? "border-[#1F6FD1] bg-[#F3F8FF]" : "border-[#E3E8EE] bg-white"}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setForm(dariBaris(p)); setPesan(null); }}>
                  <span aria-hidden>{IKON_PENGUMUMAN[p.jenis]}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{i + 1}. {p.judul || "(tanpa judul)"}</span>
                </button>
                <Chip w={st.w}>{st.teks}</Chip>
                {bisaKelola && (
                  <>
                    <button type="button" className={`${BTN_O} !px-2 !py-0.5`} onClick={() => hidupMati(p, !p.aktif)} title={p.aktif ? "Matikan" : "Aktifkan"}>
                      {p.aktif ? "Matikan" : "Aktifkan"}
                    </button>
                    <button type="button" className={`${BTN_O} !px-2 !py-0.5`} disabled={i === 0} onClick={() => geser(i, -1)} aria-label="Naikkan urutan">↑</button>
                    <button type="button" className={`${BTN_O} !px-2 !py-0.5`} disabled={i === daftar.length - 1} onClick={() => geser(i, 1)} aria-label="Turunkan urutan">↓</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {bisaKelola && (
          <button type="button" className={`${BTN_O} mt-2`} onClick={() => { setForm(FORM_BARU); setPesan(null); }}>
            + Pengumuman baru
          </button>
        )}
        <p className="mt-2 text-[11.5px] leading-relaxed text-[#7B8794]">
          Modal yang <b>Tampil</b> muncul satu per satu (urutan di atas) setiap peserta membuka halaman Langkah, dengan penunjuk &quot;1 dari n&quot;. Tidak ada penghapusan permanen: matikan modal yang tidak dipakai.
        </p>
      </Kartu>

      <Kartu judul={form.id ? "Ubah pengumuman" : "Pengumuman baru"} ket={form.id ? `#${form.id}` : undefined}>
        <fieldset disabled={!bisaKelola} className="space-y-2">
          <label className="block text-[12px] text-[#7B8794]">
            Judul
            <input type="text" className={`${INPUT} mt-0.5 w-full`} maxLength={MAKS_JUDUL} value={form.judul} placeholder="mis. PERHATIAN" onChange={(e) => ubah("judul", e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-[#7B8794]">
              Jenis tampilan
              <select className={`${INPUT} mt-0.5 w-full`} value={form.jenis} onChange={(e) => ubah("jenis", e.target.value as JenisPengumuman)}>
                {JENIS_PENGUMUMAN.map((j) => (
                  <option key={j} value={j}>
                    {IKON_PENGUMUMAN[j]} {LABEL_JENIS_PENGUMUMAN[j]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-[12.5px]">
              <input type="checkbox" checked={form.aktif} onChange={(e) => ubah("aktif", e.target.checked)} /> Aktif (tampil bagi peserta)
            </label>
          </div>

          <div>
            <p className="text-[12px] text-[#7B8794]">Isi pesan</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              <button type="button" className={BTN_O} onClick={() => sisip("tebal")}><b>B</b>&nbsp;Tebal</button>
              <button type="button" className={BTN_O} onClick={() => sisip("sorot")}><mark style={{ background: "#FFE680", padding: "0 3px", borderRadius: 3 }}>Sorot</mark></button>
              <button type="button" className={BTN_O} onClick={() => sisip("tautan")}>🔗 Tautan</button>
              <button type="button" className={BTN_O} onClick={() => sisip("daftar")}>• Daftar</button>
            </div>
            <textarea ref={isiRef} className={`${INPUT} mt-1 min-h-[120px] w-full`} maxLength={MAKS_ISI} value={form.isi} onChange={(e) => ubah("isi", e.target.value)} />
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#7B8794]">
              Pilih kata lalu klik tombol, atau ketik: <code>**tebal**</code>, <code>==sorot==</code>, <code>[teks](https://tautan)</code>; awal baris <code>- </code> = daftar. Baris kosong = paragraf baru. Tautan hanya https://.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-[#7B8794]">
              Tombol tautan: label (opsional)
              <input type="text" className={`${INPUT} mt-0.5 w-full`} maxLength={60} value={form.tombol_label} placeholder="📍 Buka Google Maps" onChange={(e) => ubah("tombol_label", e.target.value)} />
            </label>
            <label className="text-[12px] text-[#7B8794]">
              Tombol tautan: alamat (https://…)
              <input type="text" className={`${INPUT} mt-0.5 w-full`} value={form.tombol_url} placeholder="https://" onChange={(e) => ubah("tombol_url", e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[12px] text-[#7B8794] sm:col-span-1">
              Frekuensi tampil
              <select className={`${INPUT} mt-0.5 w-full`} value={form.frekuensi} onChange={(e) => ubah("frekuensi", e.target.value as FrekuensiPengumuman)}>
                <option value="sekali">{LABEL_FREKUENSI.sekali}</option>
                <option value="tiap">{LABEL_FREKUENSI.tiap}</option>
              </select>
            </label>
            <label className="text-[12px] text-[#7B8794]">
              Sasaran kelas
              <select className={`${INPUT} mt-0.5 w-full`} value={form.sasaran_kelas} onChange={(e) => ubah("sasaran_kelas", e.target.value)}>
                <option value="">Semua kelas</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    Kelas {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-[#7B8794]">
              Sasaran peran
              <select className={`${INPUT} mt-0.5 w-full`} value={form.sasaran_peran} onChange={(e) => ubah("sasaran_peran", e.target.value)}>
                <option value="">Semua peran</option>
                {PERAN_SASARAN.map((r) => (
                  <option key={r} value={r}>
                    Hanya {r.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-[#7B8794]">
              Tampil mulai (WIB, kosong = langsung)
              <input type="datetime-local" className={`${INPUT} mt-0.5 w-full`} value={form.mulai_at} onChange={(e) => ubah("mulai_at", e.target.value)} />
            </label>
            <label className="text-[12px] text-[#7B8794]">
              Berakhir (WIB, kosong = tanpa batas)
              <input type="datetime-local" className={`${INPUT} mt-0.5 w-full`} value={form.akhir_at} onChange={(e) => ubah("akhir_at", e.target.value)} />
            </label>
          </div>
        </fieldset>
        {form.frekuensi === "sekali" && <p className="mt-1.5 text-[11.5px] text-[#7B8794]">&quot;Sekali per peserta&quot;: setelah ditutup, tidak muncul lagi di browser itu, kecuali panitia mengubah/mengaktifkan ulang modalnya.</p>}
        {pesan && <div className="mt-2"><Pesan jenis={pesan.jenis} onTutup={() => setPesan(null)}>{pesan.teks}</Pesan></div>}
        {bisaKelola && (
          <button type="button" className={`${BTN} mt-2`} disabled={sibuk} onClick={simpan}>
            {sibuk ? "Menyimpan…" : "Simpan pengumuman"}
          </button>
        )}

        <div className="mt-4 border-t border-[#EDF0F4] pt-3">
          <p className="mb-1.5 text-[12.5px] font-semibold">Pratinjau (seperti di HP peserta)</p>
          <ModalPengumuman
            d={{ jenis: form.jenis, judul: form.judul, isi: form.isi, tombol_label: form.tombol_label.trim() || null, tombol_url: form.tombol_url.trim() || null }}
            posisi={1}
            jumlah={1}
            lanjut={() => undefined}
            sebagaiPratinjau
          />
        </div>
      </Kartu>
    </div>
  );
}
