// app/sigap/kelola/perencanaan/identifikasi/BatangItem.tsx
//
// (28 Okt 2026) Batang "satu item POK diisi beberapa survei": tiap survei satu warna, garis hitam = batas POK, bagian yang melewati batas diarsir dan
// diberi tepi merah, sisa POK yang belum terpakai berupa kotak putus-putus. Lebih jelas dari warna saja: tiap segmen berlabel angka, ada legenda
// dengan persentase, dan status ditulis dengan kata (bukan warna saja). Murni tampilan; data dari lib/keu/batangItem.ts. Gaya inline agar dapat dirender
// di mana pun (termasuk uji tangkapan layar) tanpa bergantung pada kelas Tailwind.

import type { CSSProperties } from "react";
import { PALET_BATANG, susunBatang, type Dasar, type HasilBatang, type KapasitasItem, type StatusBatang, type Sumbangan } from "@/lib/keu/batangItem";

const NADA: Record<StatusBatang, { latar: string; tepi: string; teks: string; label: string }> = {
  lebih: { latar: "#FDECEC", tepi: "#E5A3A3", teks: "#A12020", label: "Melebihi POK" },
  kurang: { latar: "#FFF4D6", tepi: "#E7C15A", teks: "#8A6200", label: "Belum terpakai penuh" },
  pas: { latar: "#E6F6EC", tepi: "#8FD0AA", teks: "#14653A", label: "Pas dengan POK" },
  kosong: { latar: "#EEF2F7", tepi: "#C5D0E2", teks: "#44546F", label: "Belum ada rincian" },
};
const angka = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);
const rp = (n: number | null) => (n === null ? "harga belum ada" : `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`);

export type PropsBatang = {
  judul: string; akun?: string; satuan: string; kap: KapasitasItem; sumbangan: Sumbangan[]; dasar?: Dasar;
  /** Hasil susunan siap pakai (bila pemanggil sudah menghitungnya); jika kosong dihitung dari kap dan sumbangan. */
  hasil?: HasilBatang;
};

export default function BatangItem({ judul, akun, satuan, kap, sumbangan, dasar = "volume", hasil }: PropsBatang) {
  const h = hasil ?? susunBatang(kap, sumbangan, dasar);
  const nada = NADA[h.status];
  const fmt = (n: number) => (h.dasar === "volume" ? `${angka(n)} ${satuan}` : rp(n));
  const ringkas = `${judul}: POK ${fmt(h.kapasitas)}, RAB ${fmt(h.total)}, ${nada.label.toLowerCase()}${h.lebih > 0 ? `, lebih ${fmt(h.lebih)}` : h.sisa > 0 ? `, sisa ${fmt(h.sisa)}` : ""}.`;
  const kotak: CSSProperties = { border: "1px solid #DCE3EE", borderRadius: 12, background: "#fff", padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 };
  return (
    <section style={kotak} aria-label={`Batang item ${judul}`}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 14, color: "#0F2A52" }}>{judul}</strong>
        {akun && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#44546F", background: "#EEF2F7", borderRadius: 999, padding: "2px 9px" }}>Akun {akun}</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: nada.teks, background: nada.latar, border: `1px solid ${nada.tepi}`, borderRadius: 999, padding: "2px 10px" }}>
          {h.status === "lebih" ? `Lebih ${fmt(h.lebih)}` : h.status === "kurang" ? `Sisa ${fmt(h.sisa)}` : nada.label}
        </span>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 16px", fontSize: 12.5, color: "#44546F" }}>
        <span>POK: <b style={{ color: "#0F2A52" }}>{fmt(h.kapasitas)}</b></span>
        <span>RAB (semua survei): <b style={{ color: h.status === "lebih" ? "#A12020" : "#0F2A52" }}>{fmt(h.total)}</b></span>
      </div>

      <div role="img" aria-label={ringkas} style={{ position: "relative", height: 62, paddingTop: 20 }}>
        <div style={{ position: "relative", height: 38, background: "#F3F6FA", borderRadius: 6, overflow: "visible" }}>
          {h.sisa > 0 && h.segmen.length > 0 && (
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${h.sisaKiri}%`, width: `${h.sisaLebar}%`, border: "1.5px dashed #9AA8C0", borderLeft: "none", borderRadius: "0 6px 6px 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#6B7A93" }}>
              {h.sisaLebar > 9 ? `sisa ${fmt(h.sisa)}` : ""}
            </div>
          )}
          {h.segmen.map((g, i) => {
            const warna = PALET_BATANG[g.warna % PALET_BATANG.length];
            const tampil = g.lebar > 8;
            return (
              <div key={g.id} title={`${g.nama}: ${fmt(g.nilai)} (${Math.round(g.bagian * 100)}%)`}
                style={{ position: "absolute", top: 0, bottom: 0, left: `${g.kiri}%`, width: `${g.lebar}%`, background: warna, borderRadius: i === 0 ? "6px 0 0 6px" : 0, borderRight: "1px solid rgba(255,255,255,.75)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap" }}>
                {tampil ? angka(h.dasar === "volume" ? g.volume : g.jumlah ?? 0) : ""}
                {g.lewat > 0 && (
                  <span aria-hidden style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${(g.lewat / g.lebar) * 100}%`, background: "repeating-linear-gradient(135deg, rgba(0,0,0,.45) 0 4px, rgba(0,0,0,.15) 4px 8px)", borderLeft: "2px solid #fff" }} />
                )}
              </div>
            );
          })}
          <div aria-hidden style={{ position: "absolute", top: -10, bottom: -6, left: `${h.garis}%`, borderLeft: "3px solid #111827", transform: "translateX(-1.5px)" }}>
            <span style={{ position: "absolute", top: -14, left: 0, transform: "translateX(-50%)", fontSize: 10.5, fontWeight: 800, color: "#111827", background: "#fff", padding: "0 4px", border: "1px solid #111827", borderRadius: 4, whiteSpace: "nowrap" }}>Batas POK {h.dasar === "volume" ? angka(h.kapasitas) : ""}</span>
          </div>
        </div>
      </div>

      {h.segmen.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }} aria-label="Sumbangan tiap survei">
          {h.segmen.map((g) => (
            <li key={g.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: "#1B2B4B" }}>
              <span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: PALET_BATANG[g.warna % PALET_BATANG.length], flex: "none", alignSelf: "center" }} />
              <span style={{ fontWeight: 700 }}>{g.nama}</span>
              <span style={{ color: "#44546F" }}>{angka(g.volume)} {satuan}</span>
              <span style={{ marginLeft: "auto", color: "#44546F", whiteSpace: "nowrap" }}>{rp(g.jumlah)} · {Math.round(g.bagian * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : <p style={{ margin: 0, fontSize: 12.5, color: "#6B7A93" }}>Belum ada survei yang mengisi item ini.</p>}

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.4, color: nada.teks, background: nada.latar, border: `1px solid ${nada.tepi}`, borderRadius: 8, padding: "6px 10px" }}>
        {h.status === "lebih" && <b>Selisih {fmt(h.lebih)}. </b>}{h.saran}
      </p>
    </section>
  );
}
