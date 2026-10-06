// app/api/sigap/pedia/register/route.ts
//
// (7 Okt 2026) SIGAP PEDIA -- ekspor buku register ke Excel (.xlsx) atau CSV -- permintaan user.
// GET ?format=xlsx|csv&tahun=&kategori=&kanal=&status=

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { aksesPedia, audit, galat } from "@/lib/pedia/server";
import { KANAL, SIFAT, STATUS } from "@/lib/pedia/umum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("Hanya pengelola.", 403);
  const q = req.nextUrl.searchParams;
  const { data: kats } = await s.db.from("pedia_kategori").select("id, kode, nama, induk_id");
  let qq = s.db.from("pedia_entri").select("*");
  if (Number(q.get("tahun"))) qq = qq.eq("tahun", Number(q.get("tahun")));
  if (q.get("status")) qq = qq.eq("status", q.get("status")!);
  if (q.get("kanal")) qq = qq.eq("kanal", q.get("kanal")!);
  if (q.get("kategori")) {
    const k = (kats ?? []).find((x) => x.kode === q.get("kategori"));
    const ids = k ? (k.induk_id ? [k.id] : (kats ?? []).filter((x) => x.induk_id === k.id).map((x) => x.id)) : [-1];
    qq = qq.in("kategori_id", ids.length ? ids : [-1]);
  }
  const { data: rows } = await qq.order("tahun").order("nomor_urut");
  const ids = (rows ?? []).map((r) => r.id as number);
  const { data: files } = ids.length ? await s.db.from("pedia_file").select("entri_id, jenis, tsa_status, dkim->>status").in("entri_id", ids) : { data: [] };
  const { data: regs } = ids.length ? await s.db.from("pedia_entri_regulasi").select("entri_id, pedia_regulasi(jenis, nomor, tahun)").in("entri_id", ids) : { data: [] };
  const wib = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().replace("T", " ").slice(0, 16) : "");

  const data = (rows ?? []).map((r) => {
    const sub = (kats ?? []).find((k) => k.id === r.kategori_id);
    const induk = sub?.induk_id ? (kats ?? []).find((k) => k.id === sub.induk_id) : null;
    const f = ((files ?? []) as unknown as { entri_id: number; jenis: string; tsa_status: string; status: string | null }[]).filter((x) => x.entri_id === r.id);
    const eml = f.filter((x) => x.jenis === "eml");
    return {
      "Nomor Registrasi": r.nomor_registrasi,
      Tahun: r.tahun,
      Kategori: induk ? `${induk.kode} ${induk.nama}` : "",
      "Sub-kategori": sub ? `${sub.kode} ${sub.nama}` : "",
      Kanal: `${KANAL[r.kanal] ?? r.kanal}${r.kanal_lain ? ` - ${r.kanal_lain}` : ""}`,
      "Nomor Tiket/Surat": r.nomor_tiket ?? "",
      "Tgl Diajukan": r.tgl_diajukan ?? "",
      "Tgl Dijawab": r.tgl_dijawab ?? "",
      Judul: r.judul,
      Kesimpulan: r.kesimpulan ?? "",
      Sifat: SIFAT[r.sifat] ?? r.sifat,
      Status: STATUS[r.status]?.label ?? r.status,
      "Perlu Ditinjau": r.perlu_ditinjau ? `Ya - ${r.alasan_tinjau ?? ""}` : "",
      "Dasar Hukum": ((regs ?? []) as unknown as { entri_id: number; pedia_regulasi: { jenis: string; nomor: string; tahun: number } }[])
        .filter((x) => x.entri_id === r.id)
        .map((x) => `${x.pedia_regulasi.jenis} ${x.pedia_regulasi.nomor}`)
        .join("; "),
      "Jumlah File": f.length,
      Timestamp: f.length ? (f.every((x) => x.tsa_status === "ok") ? "Lengkap" : `${f.filter((x) => x.tsa_status !== "ok").length} tertunda`) : "",
      DKIM: eml.length ? (eml.every((x) => x.status === "pass") ? "PASS" : eml.map((x) => (x.status ?? "none").toUpperCase()).join(", ")) : "",
      "Nota Dinas SRIKANDI": r.nota_dinas_srikandi ?? "",
      "Keputusan PPK": r.keputusan_ppk ?? "",
      Penanya: r.penanya_nama ?? "",
      Tim: r.tim ?? "",
      "Dibuat (WIB)": wib(r.dibuat_at),
      "Difinalkan (WIB)": wib(r.difinalkan_at),
      Pembatalan: r.status === "dibatalkan" ? `${r.dibatalkan_alasan ?? ""} (${r.dibatalkan_oleh ?? ""}, ${wib(r.dibatalkan_at)})` : "",
    };
  });
  const format = q.get("format") === "csv" ? "csv" : "xlsx";
  await audit(s, "ekspor_register", null, null, { format, jumlah: data.length });
  const ws = XLSX.utils.json_to_sheet(data);
  if (format === "csv") {
    const csv = "﻿" + XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="Register_SIGAP_PEDIA.csv"' } });
  }
  ws["!cols"] = Object.keys(data[0] ?? { a: 1 }).map((k) => ({ wch: Math.min(60, Math.max(12, k.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Register");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Register_SIGAP_PEDIA.xlsx"',
    },
  });
}
