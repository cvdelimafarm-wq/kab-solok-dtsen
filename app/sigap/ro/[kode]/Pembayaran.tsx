"use client";

// app/sigap/ro/[kode]/Pembayaran.tsx
//
// (7 Nov 2026, langkah 3 rancangan Kebutuhan dan revisi) Tab Pembayaran: PJ Administrasi mencatat pembayaran di SIGAP (sementara manual), menutup baris RAB, dan
// menautkan bukti dukung/penatausahaan SPJ (tautan Drive). Pembayaran RESMI tetap lewat SAKTI; catatan ini catatan kerja yang kelak disinkronkan dengan SAKTI.
// Tabel keu_pembayaran (skema-sql/20261107d_catat_pembayaran.sql); hak bayar_catat (peran PJADM dan PPK). Logika murni di lib/keu/pembayaran.ts.

import { useCallback, useMemo, useState } from "react";
import { angka, rupiah } from "@/lib/keu/ro";
import { bacaJumlah, tampilJumlah } from "@/lib/keu/niat";
import {
  aktif, isiCatat, LABEL_JENIS_BAYAR, LABEL_STATUS_BAYAR, periksaIsian, periksaTautan, ringkasBayar, sisaBaris, usulTercermin,
  type BarisBayar, type IsianCatat, type JenisBayar,
} from "@/lib/keu/pembayaran";
import { Catatan, Chip, Galat, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label as labelKolom, Memuat, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { tulisKeuKlien, useAnggaranRo, useBoleh } from "../useKeu";

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const tgl = (t: string | null | undefined): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t ?? ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "-"; };

type Edit = { id: number; mode: "tautan" | "batal"; teks: string } | null;

export function TabPembayaran({ kode }: { kode: string }) {
  const ang = useAnggaranRo(kode);
  const boleh = useBoleh("bayar_catat", kode);
  const [galat, setGalat] = useState<string[]>([]);
  const [peringatan, setPeringatan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [edit, setEdit] = useState<Edit>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [jenis, setJenis] = useState<JenisBayar>("bayar");
  const [tanggal, setTanggal] = useState("");
  const [jumlahTeks, setJumlahTeks] = useState("");
  const [menutup, setMenutup] = useState(true);
  const [tercerminManual, setTercerminManual] = useState<boolean | null>(null);
  const [nomorRef, setNomorRef] = useState("");
  const [tautan, setTautan] = useState("");
  const [catatan, setCatatan] = useState("");

  const butir = useMemo(() => new Map((ang.anggaran ?? []).flatMap((k) => k.akun.flatMap((a) => a.item)).map((i) => [i.kunci, i] as const)), [ang.anggaran]);
  const bayarAktif = useMemo(() => ang.bayar.filter(aktif), [ang.bayar]);
  const opsi = useMemo(() => {
    return ang.barisRab
      .filter((b) => b.pok_kunci && butir.has(b.pok_kunci))
      .map((b) => {
        const i = butir.get(b.pok_kunci as string)!;
        const sisa = sisaBaris(b.jumlah, bayarAktif.filter((x) => x.rab_baris_id !== null && Number(x.rab_baris_id) === Number(b.baris_id)));
        return { b, i, sisa, id: Number(b.baris_id) };
      })
      .sort((x, y) => x.i.akun.localeCompare(y.i.akun) || x.i.uraian.localeCompare(y.i.uraian) || x.id - y.id);
  }, [ang.barisRab, butir, bayarAktif]);
  const terpilih = opsi.find((o) => o.id === target) ?? null;
  const ringkas = useMemo(() => ringkasBayar(ang.bayar, ang.antrean), [ang.bayar, ang.antrean]);
  const tercermin = tercerminManual ?? usulTercermin(tanggal || ang.hariIni, ang.sampaiTanggal);
  const bisa = boleh === true;

  const pilih = useCallback((id: number) => {
    const o = opsi.find((x) => x.id === id);
    setTarget(id); setJenis("bayar"); setTanggal(ang.hariIni); setJumlahTeks(o ? tampilJumlah(o.sisa) : ""); setMenutup(true);
    setTercerminManual(null); setNomorRef(""); setTautan(""); setCatatan(""); setGalat([]); setPeringatan([]);
    if (typeof window !== "undefined") window.requestAnimationFrame(() => document.getElementById("form-bayar")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [opsi, ang.hariIni]);

  const kirim = useCallback(async () => {
    if (!terpilih || !ang.rab) return;
    const f: IsianCatat = { jenis, tanggal, jumlah: bacaJumlah(jumlahTeks), menutup, tercermin, nomorRef, tautan, catatan };
    const p = periksaIsian(f, terpilih.sisa, ang.hariIni);
    setPeringatan(p.peringatan);
    if (p.galat.length > 0) { setGalat(p.galat); return; }
    setGalat([]); setSibuk(true);
    const h = await tulisKeuKlien("keu_pembayaran", "insert", isiCatat({ ro: kode, rabId: ang.rab.rab_id, itemId: Number(terpilih.b.item_id), barisId: terpilih.id, pokKunci: terpilih.b.pok_kunci as string }, f));
    if (!h.ok) setGalat([h.pesan]);
    else { await ang.muatBayar(); setTarget(null); setPeringatan([]); }
    setSibuk(false);
  }, [terpilih, ang, jenis, tanggal, jumlahTeks, menutup, tercermin, nomorRef, tautan, catatan, kode]);

  const ubah = useCallback(async (id: number, data: Record<string, unknown>) => {
    setSibuk(true); setGalat([]);
    const h = await tulisKeuKlien("keu_pembayaran", "update", data, { id });
    if (!h.ok) setGalat([h.pesan]);
    else { await ang.muatBayar(); setEdit(null); }
    setSibuk(false);
  }, [ang]);

  if (ang.galat) return <Galat pesan={ang.galat} />;
  if (!ang.anggaran) return <Memuat />;

  const kepala = (
    <div className={`${kartu} flex flex-col gap-1`}>
      <h2 className={judulKartu}>Pembayaran: catatan PJ Administrasi</h2>
      <p className="m-0 text-[12.5px] text-[#5B6B84]">
        Pembayaran resmi tetap lewat SAKTI. Di sini PJ Administrasi mencatat pembayaran lebih dulu (sementara manual), menutup baris RAB yang sudah dibayar, dan menautkan bukti dukung
        atau penatausahaan SPJ (tautan Google Drive). Catatan yang belum tampak di realisasi SAKTI tetap dihitung sebagai kebutuhan; setelah tercermin tidak dihitung lagi.
      </p>
    </div>
  );
  if (!ang.bayarTersedia) {
    return (
      <div className="flex flex-col gap-3.5">
        {kepala}
        <p className="m-0 rounded-md bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">Catatan pembayaran belum tersedia karena tabelnya belum ada di basis data (berkas 20261107d_catat_pembayaran.sql belum dijalankan).</p>
      </div>
    );
  }
  if (!ang.rab) return <div className="flex flex-col gap-3.5">{kepala}<Kosong teks="RO ini belum punya RAB, jadi belum ada baris yang dapat dibayar." /></div>;

  const namaBaris = (id: number | string | null): string => {
    const o = id === null ? undefined : opsi.find((x) => x.id === Number(id));
    return o ? (o.b.ket || "(tanpa keterangan)") : "(baris RAB sudah tidak ada pada RAB yang tampil)";
  };
  const uraianButir = (k: string) => { const i = butir.get(k); return i ? `${i.akun} ${i.uraian}` : k; };

  return (
    <div className="flex flex-col gap-3.5">
      {kepala}
      <div className={kisi}>
        <Kpi label="Jatuh tempo belum dicatat" nilai={rupiah(ringkas.jumlahTunggak)} warna={ringkas.nTunggak > 0 ? "mr" : "hj"} sub={ringkas.nTunggak > 0 ? `${angka(ringkas.nTunggak)} baris RAB` : "tidak ada yang menunggak"} />
        <Kpi label="Dicatat, belum tampak di SAKTI" nilai={rupiah(ringkas.jumlahBelumTercermin)} warna={ringkas.nBelumTercermin > 0 ? "kn" : undefined} sub={`${angka(ringkas.nBelumTercermin)} catatan`} />
        <Kpi label="Tanpa bukti dukung" nilai={angka(ringkas.nTanpaBukti)} warna={ringkas.nTanpaBukti > 0 ? "kn" : "hj"} sub="catatan pembayaran tanpa tautan Drive" />
      </div>
      <Galat pesan={galat} />
      {boleh === false && <Catatan>Hanya PJ Administrasi dan PPK yang dapat mencatat pembayaran. Anda dapat melihat catatan yang ada.</Catatan>}

      {ang.antrean.length > 0 && (
        <section className={`${kartu} flex flex-col gap-2`} aria-label="Jatuh tempo belum dicatat">
          <h3 className="m-0 text-[14px] font-bold text-[#0F2A52]">Jatuh tempo belum dicatat ({angka(ang.antrean.length)})</h3>
          <p className="m-0 text-[12px] text-[#5B6B84]">Baris RAB yang minggu cairnya sudah lewat tetapi belum ada catatan pembayarannya. Paling lama menunggak di atas.</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {ang.antrean.slice(0, 50).map((t) => (
              <li key={t.baris_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F3D9A8] bg-[#FFFBF0] px-3 py-2">
                <div className="min-w-0 flex-1 text-[12.5px] text-[#1B2B4B]">
                  <div className="break-words font-semibold">{uraianButir(t.pok_kunci)}</div>
                  <div className="text-[#5B6B84]">{t.ket || "(tanpa keterangan)"} · seharusnya cair s.d. {tgl(t.tertua)} · terlambat {angka(t.hari)} hari</div>
                </div>
                <span className="text-[13px] font-bold text-[#8A6200]">{rupiah(t.tunggak)}</span>
                {bisa && <button type="button" className={tombolKecil} onClick={() => pilih(t.baris_id)}>Catat</button>}
              </li>
            ))}
          </ul>
          {ang.antrean.length > 50 && <p className="m-0 text-[12px] text-[#5B6B84]">Menampilkan 50 teratas dari {angka(ang.antrean.length)}.</p>}
        </section>
      )}

      {bisa && (
        <section id="form-bayar" className={`${kartu} flex flex-col gap-3`} aria-label="Catat pembayaran">
          <h3 className="m-0 text-[14px] font-bold text-[#0F2A52]">Catat pembayaran</h3>
          <div>
            <label htmlFor="by-baris" className={labelKolom}>Baris RAB</label>
            <select id="by-baris" className={kolom} value={target ?? ""} onChange={(e) => (e.target.value ? pilih(Number(e.target.value)) : setTarget(null))}>
              <option value="">Pilih baris RAB…</option>
              {opsi.map((o) => (
                <option key={o.id} value={o.id}>{`${o.i.akun} ${o.i.uraian.slice(0, 60)} · ${(o.b.ket || "tanpa keterangan").slice(0, 50)} · sisa ${angka(o.sisa)}`}</option>
              ))}
            </select>
          </div>
          {terpilih && (
            <>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Jenis catatan">
                {(["bayar", "batal"] as const).map((j) => (
                  <button key={j} type="button" role="radio" aria-checked={jenis === j} onClick={() => setJenis(j)} className={jenis === j ? "min-h-[40px] rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 text-[13px] font-semibold text-[#1F5FD1]" : tombolKecil}>
                    {LABEL_JENIS_BAYAR[j]}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
                <div>
                  <label htmlFor="by-tgl" className={labelKolom}>Tanggal {jenis === "bayar" ? "pembayaran" : "keputusan"}</label>
                  <input id="by-tgl" type="date" max={ang.hariIni} className={kolom} value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
                </div>
                {jenis === "bayar" && (
                  <div>
                    <label htmlFor="by-jml" className={labelKolom}>Jumlah dibayar (Rp)</label>
                    <input id="by-jml" inputMode="numeric" className={`${kolom} text-right`} value={jumlahTeks} onChange={(e) => setJumlahTeks(e.target.value)} onBlur={() => { const n = bacaJumlah(jumlahTeks); setJumlahTeks(n === null ? "" : tampilJumlah(n)); }} />
                    <p className="m-0 mt-1 text-[11.5px] text-[#5B6B84]">Sisa RAB baris ini {rupiah(terpilih.sisa)}</p>
                  </div>
                )}
                <div>
                  <label htmlFor="by-ref" className={labelKolom}>No. SPM / kuitansi (opsional)</label>
                  <input id="by-ref" className={kolom} value={nomorRef} maxLength={100} onChange={(e) => setNomorRef(e.target.value)} />
                </div>
              </div>
              {jenis === "bayar" && (
                <>
                  <div>
                    <label htmlFor="by-taut" className={labelKolom}>Tautan Drive bukti dukung / SPJ (opsional, boleh menyusul)</label>
                    <input id="by-taut" type="url" inputMode="url" placeholder="https://drive.google.com/…" className={kolom} value={tautan} maxLength={500} onChange={(e) => setTautan(e.target.value)} aria-invalid={periksaTautan(tautan) !== null} />
                    {periksaTautan(tautan) && <p className="m-0 mt-1 text-[12px] text-[#9B1C23]">{periksaTautan(tautan)}</p>}
                  </div>
                  <label className="flex min-h-[40px] items-center gap-2 text-[13px] text-[#1B2B4B]">
                    <input type="checkbox" checked={menutup} onChange={(e) => setMenutup(e.target.checked)} className="h-4 w-4" />
                    Baris RAB ini selesai (tidak ada pembayaran lanjutan). Matikan bila dibayar bertahap.
                  </label>
                  <label className="flex min-h-[40px] items-center gap-2 text-[13px] text-[#1B2B4B]">
                    <input type="checkbox" checked={tercermin} onChange={(e) => setTercerminManual(e.target.checked)} className="h-4 w-4" />
                    Sudah tampak di realisasi SAKTI{ang.sampaiTanggal ? ` (unggahan s.d. ${ang.sampaiTanggal})` : ""}. Bila ya, hanya menutup baris RAB dan tidak dihitung dua kali.
                  </label>
                </>
              )}
              <div>
                <label htmlFor="by-cat" className={labelKolom}>{jenis === "batal" ? "Alasan tidak jadi dibayar (wajib)" : "Catatan (opsional)"}</label>
                <input id="by-cat" className={kolom} value={catatan} maxLength={500} onChange={(e) => setCatatan(e.target.value)} />
              </div>
              {peringatan.length > 0 && <Catatan>{peringatan.join(" ")}</Catatan>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={tombolUtama} disabled={sibuk} onClick={() => void kirim()}>{sibuk ? "Menyimpan…" : jenis === "bayar" ? "Simpan pembayaran" : "Simpan, tutup baris"}</button>
                <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => { setTarget(null); setGalat([]); setPeringatan([]); }}>Batal</button>
              </div>
            </>
          )}
        </section>
      )}

      <section className={`${kartu} flex flex-col gap-2`} aria-label="Catatan pembayaran">
        <h3 className="m-0 text-[14px] font-bold text-[#0F2A52]">Catatan pembayaran ({angka(ringkas.nAktif)})</h3>
        {ang.bayar.length === 0 && <p className="m-0 text-[13px] text-[#5B6B84]">Belum ada catatan pembayaran untuk RO ini.</p>}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ang.bayar.map((b: BarisBayar) => {
            const id = Number(b.id);
            const batalnya = !aktif(b);
            const bayarJ = b.jenis === "bayar";
            const sedangEdit = edit?.id === id ? edit : null;
            return (
              <li key={id} className={`rounded-lg border px-3 py-2 ${batalnya ? "border-[#E3E8F0] bg-[#F7F9FC] opacity-75" : "border-[#DCE3EE] bg-white"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-[#0F2A52]">{tgl(b.tanggal)}</span>
                  <Chip warna={batalnya ? "abu" : bayarJ ? "biru" : "kuning"}>{batalnya ? "Dibatalkan" : LABEL_JENIS_BAYAR[b.jenis as JenisBayar] ?? b.jenis}</Chip>
                  {bayarJ && !batalnya && <Chip warna={b.status === "tercermin" ? "hijau" : "kuning"}>{LABEL_STATUS_BAYAR[b.status as keyof typeof LABEL_STATUS_BAYAR] ?? b.status}</Chip>}
                  {bayarJ && <span className={`ml-auto text-[14px] font-bold ${batalnya ? "text-[#8A97AD] line-through" : "text-[#0F2A52]"}`}>{rupiah(num(b.jumlah))}</span>}
                </div>
                <div className="mt-1 break-words text-[12.5px] text-[#1B2B4B]">{uraianButir(b.pok_kunci)}</div>
                <div className="text-[12px] text-[#5B6B84]">
                  {namaBaris(b.rab_baris_id)} · {bayarJ ? (b.menutup ? "baris RAB selesai" : "dibayar bertahap") : "baris RAB ditutup tanpa pembayaran"}
                  {b.nomor_ref ? ` · ${b.nomor_ref}` : ""}{b.catatan ? ` · ${b.catatan}` : ""}{batalnya && b.alasan_batal ? ` · dibatalkan: ${b.alasan_batal}` : ""}
                </div>
                {bayarJ && !batalnya && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px]">
                    {b.tautan && periksaTautan(b.tautan) === null
                      ? <a href={b.tautan} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F5FD1] underline">Buka bukti dukung</a>
                      : <span className="rounded bg-[#FFF4D6] px-2 py-0.5 text-[#8A6200]">Belum ada bukti dukung</span>}
                  </div>
                )}
                {bisa && !batalnya && !sedangEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {bayarJ && <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => setEdit({ id, mode: "tautan", teks: b.tautan ?? "" })}>{b.tautan ? "Ubah tautan" : "Tautkan bukti"}</button>}
                    {bayarJ && <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => void ubah(id, { status: b.status === "tercermin" ? "dicatat" : "tercermin" })}>{b.status === "tercermin" ? "Kembalikan ke dicatat" : "Tandai tercermin di SAKTI"}</button>}
                    <button type="button" className={tombolBahaya} disabled={sibuk} onClick={() => setEdit({ id, mode: "batal", teks: "" })}>Batalkan catatan</button>
                  </div>
                )}
                {sedangEdit && (
                  <div className="mt-2 flex flex-col gap-2">
                    <label htmlFor={`ed-${id}`} className={labelKolom}>{sedangEdit.mode === "tautan" ? "Tautan Drive (kosongkan untuk menghapus)" : "Alasan pembatalan (wajib, minimal 5 huruf)"}</label>
                    <input id={`ed-${id}`} className={kolom} value={sedangEdit.teks} maxLength={500} onChange={(e) => setEdit({ ...sedangEdit, teks: e.target.value })} />
                    {sedangEdit.mode === "tautan" && periksaTautan(sedangEdit.teks) && <p className="m-0 text-[12px] text-[#9B1C23]">{periksaTautan(sedangEdit.teks)}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button" className={sedangEdit.mode === "batal" ? tombolBahaya : tombolUtama}
                        disabled={sibuk || (sedangEdit.mode === "tautan" ? periksaTautan(sedangEdit.teks) !== null : sedangEdit.teks.trim().length < 5)}
                        onClick={() => void ubah(id, sedangEdit.mode === "tautan" ? { tautan: sedangEdit.teks.trim() || null } : { dibatalkan_at: new Date().toISOString(), alasan_batal: sedangEdit.teks.trim() })}
                      >
                        {sedangEdit.mode === "tautan" ? "Simpan tautan" : "Batalkan catatan ini"}
                      </button>
                      <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => setEdit(null)}>Tutup</button>
                    </div>
                    {sedangEdit.mode === "batal" && <p className="m-0 text-[12px] text-[#5B6B84]">Catatan yang dibatalkan tidak dihitung lagi dan barisnya kembali terbuka. Koreksi jumlah atau tanggal dilakukan dengan membatalkan lalu mencatat ulang.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
