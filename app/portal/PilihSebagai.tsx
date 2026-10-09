"use client";

// (10 Okt 2026) "Masuk sebagai" -- permintaan user: "akun M. Iqbal Hadi adalah akun super, ketika masuk menggunakan akun ini ada dropdown
// tampilkan sebagai siapa (seluruh akun yang ada di sistem)". Dipakai di halaman Masuk (sesudah PIN akun super benar) dan di spanduk
// "Anda melihat sebagai ..." (Ganti akun). Daftar & pemilihan lewat /api/sigap/masuk (aksi daftar_sebagai / masuk_sebagai), yang menolak
// akun non-super. Daftar bisa dicari (nama), disaring (Semua / PML / PPL / Peserta pelatihan / Pegawai / Mitra).

import { useEffect, useMemo, useState } from "react";

export type AkunSebagai = { id: number; nama: string; jenis: string | null; peran: string | null; peserta: boolean };
export type HasilSebagai = { sesi: string; sampai: string; token: string; id: number; nama: string; aktor: string; sendiri: boolean };

type Saring = "semua" | "pml" | "ppl" | "peserta" | "pegawai" | "mitra";
const SARINGAN: { k: Saring; t: string }[] = [
  { k: "semua", t: "Semua" },
  { k: "pml", t: "PML" },
  { k: "ppl", t: "PPL" },
  { k: "peserta", t: "Peserta pelatihan" },
  { k: "pegawai", t: "Pegawai" },
  { k: "mitra", t: "Mitra" },
];
const MAKS_TAMPIL = 60;

function ket(a: AkunSebagai): string {
  const dasar = a.jenis === "organik" ? "Pegawai" : "Mitra";
  const peran = a.peran === "pml" ? " · PML" : a.peran === "ppl" ? " · PPL" : "";
  return `${dasar}${peran}${a.peserta ? " · peserta pelatihan" : ""}`;
}

export default function PilihSebagai({
  sesi,
  namaSaya,
  onPilih,
  onBatal,
}: {
  /** sesi akun super (asli) untuk memanggil API */
  sesi: string;
  namaSaya: string;
  onPilih: (h: HasilSebagai) => void;
  onBatal?: () => void;
}) {
  const [daftar, setDaftar] = useState<AkunSebagai[] | null>(null);
  const [q, setQ] = useState("");
  const [saring, setSaring] = useState<Saring>("semua");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);

  async function panggil(badan: Record<string, unknown>) {
    const res = await fetch("/api/sigap/masuk", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sesi}` }, body: JSON.stringify(badan) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(res.status === 401 ? "Sesi Anda berakhir. Keluar lalu masuk lagi." : (j.error ?? `Gagal (${res.status})`));
    return j;
  }

  useEffect(() => {
    let batal = false;
    panggil({ aksi: "daftar_sebagai" })
      .then((j) => !batal && setDaftar(j.akun as AkunSebagai[]))
      .catch((e) => !batal && setGalat(e instanceof Error ? e.message : "Gagal memuat daftar akun."));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tampil = useMemo(() => {
    if (!daftar) return [];
    const k = q.trim().toLowerCase();
    return daftar.filter((a) => {
      if (k && !a.nama.toLowerCase().includes(k)) return false;
      if (saring === "pml") return a.peran === "pml";
      if (saring === "ppl") return a.peran === "ppl";
      if (saring === "peserta") return a.peserta;
      if (saring === "pegawai") return a.jenis === "organik";
      if (saring === "mitra") return a.jenis !== "organik";
      return true;
    });
  }, [daftar, q, saring]);

  async function pilih(a: AkunSebagai) {
    setGalat(null);
    setSibuk(a.id);
    try {
      const j = await panggil({ aksi: "masuk_sebagai", akun_id: a.id });
      onPilih({ sesi: j.sesi, sampai: j.sampai, token: j.token ?? "", id: a.id, nama: j.nama ?? a.nama, aktor: j.aktor ?? namaSaya, sendiri: !!j.sendiri });
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal masuk sebagai akun itu.");
      setSibuk(null);
    }
  }

  return (
    <div className="flex w-full max-w-[460px] flex-col gap-3 rounded-[14px] border border-[#E3E8EE] bg-white p-6 text-[#14202E]" role="dialog" aria-labelledby="judul-sebagai">
      <div>
        <h2 id="judul-sebagai" className="text-[20px] font-bold">Masuk sebagai siapa?</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#4D5B6B]">
          Akun super: tampilan dan aksi mengikuti akun yang dipilih (persis seperti petugas itu). Aksi tersimpan atas nama akun tersebut.
        </p>
      </div>

      <button type="button" disabled={sibuk !== null} onClick={() => onPilih({ sesi, sampai: "", token: "", id: 0, nama: namaSaya, aktor: namaSaya, sendiri: true })} className="min-h-[46px] rounded-lg bg-[#1F5FD1] px-4 text-[14.5px] font-semibold text-white transition hover:bg-[#1A4FB8] disabled:opacity-60">
        Akun saya sendiri ({namaSaya})
      </button>

      <div className="flex flex-col gap-2 border-t border-[#E3E8EE] pt-3">
        <label htmlFor="cari-sebagai" className="text-[12.5px] font-semibold text-[#4D5B6B]">…atau lihat sebagai akun lain</label>
        <input id="cari-sebagai" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama petugas" autoComplete="off" className="h-11 w-full rounded-lg border border-[#CDD5DE] bg-white px-3 text-[14.5px] outline-none focus:border-[#1F5FD1] focus:ring-4 focus:ring-[#1F5FD1]/10" />
        <div className="flex flex-wrap gap-1.5">
          {SARINGAN.map((s) => (
            <button key={s.k} type="button" onClick={() => setSaring(s.k)} aria-pressed={saring === s.k} className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${saring === s.k ? "border-[#1F5FD1] bg-[#E8F0FD] text-[#1F5FD1]" : "border-[#CDD5DE] bg-white text-[#4D5B6B]"}`}>
              {s.t}
            </button>
          ))}
        </div>
      </div>

      {galat && <p className="rounded-lg border-l-4 border-[#C2412D] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#8A2B1D]" role="alert">{galat}</p>}

      <div className="max-h-[300px] overflow-y-auto rounded-lg border border-[#E3E8EE]" role="listbox" aria-label="Daftar akun">
        {!daftar && !galat && <p className="p-3 text-[13px] text-[#4D5B6B]">Memuat daftar akun…</p>}
        {daftar && tampil.length === 0 && <p className="p-3 text-[13px] text-[#4D5B6B]">Tidak ada akun yang cocok.</p>}
        {tampil.slice(0, MAKS_TAMPIL).map((a) => (
          <button key={a.id} type="button" role="option" aria-selected={false} disabled={sibuk !== null} onClick={() => pilih(a)} className="flex w-full flex-col items-start gap-0.5 border-b border-[#EEF1F5] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[#F3F7FE] disabled:opacity-60">
            <span className="text-[14px] font-semibold">{a.nama}{sibuk === a.id ? " …" : ""}</span>
            <span className="text-[11.5px] text-[#5B6B84]">{ket(a)}</span>
          </button>
        ))}
        {daftar && tampil.length > MAKS_TAMPIL && <p className="p-3 text-[12px] text-[#5B6B84]">Menampilkan {MAKS_TAMPIL} dari {tampil.length} akun. Ketik nama untuk menyaring.</p>}
      </div>

      {onBatal && (
        <button type="button" onClick={onBatal} className="min-h-[40px] rounded-lg border border-[#CDD5DE] bg-white px-4 text-[13.5px] font-semibold text-[#4D5B6B]">
          Tutup
        </button>
      )}
    </div>
  );
}
