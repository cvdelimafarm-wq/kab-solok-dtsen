// app/sigap/akses/tipe.ts
//
// (5 Okt 2026) Tipe data bagian=akses (app/api/sigap/admin) utk halaman Kelola Peran & Akses -- permintaan user.

export type Peran = { id: number; kode: string; nama: string; keterangan: string | null; butuh_lingkup: boolean; sistem: boolean };
export type Menu = { kode: string; portal: string; nama: string; keterangan: string | null; urutan: number };
export type Izin = { peran_id: number; menu_kode: string; level: "lihat" | "kelola" };
export type AkunPeran = { id: number; akun_id: number; peran_id: number; kegiatan_id: number | null; diberi_oleh: string | null; dibuat_at: string; nama: string };
export type DataAkses = {
  peran: Peran[];
  menu: Menu[];
  izin: Izin[];
  akun_peran: AkunPeran[];
  kegiatan: { id: number; nama: string }[];
  boleh_kelola: boolean;
};

/** Ikon per portal (tampilan saja; portal baru otomatis tampil dgn ikon umum). */
export function ikonPortal(portal: string): string {
  const p = portal.toLowerCase();
  if (p.includes("transport")) return "🛡";
  if (p.includes("akses")) return "🔐";
  if (p.includes("rab") || p.includes("pok")) return "📘";
  if (p.includes("revisi")) return "🔁";
  if (p.includes("perjalanan") || p.includes("perjadin")) return "✈️";
  if (p.includes("honor")) return "💵";
  return "📂";
}

/** Kelompokkan menu per portal, urut sesuai `urutan` menu pertama tiap portal. */
export function kelompokPortal(menu: Menu[]): { portal: string; menu: Menu[] }[] {
  const out: { portal: string; menu: Menu[] }[] = [];
  for (const m of [...menu].sort((a, b) => a.urutan - b.urutan)) {
    const g = out.find((x) => x.portal === m.portal);
    if (g) g.menu.push(m);
    else out.push({ portal: m.portal, menu: [m] });
  }
  return out;
}
