// lib/portal/sanggahIdentifikasi.ts  (hanya server)
//
// (13 Okt 2026) Sanggahan hasil identifikasi -- permintaan user: "tombol sanggah. jika tidak terdampak namun nyatanya terdampak,
// log siapa yang menyanggah ditampilkan, admin atau PML bersangkutan bisa melihat dan dipush notifikasi".
// Tabel bencana_identifikasi_sanggah. Sanggahan hanya untuk Sub SLS yang SAAT INI berstatus "tidak terdampak". Status sanggahan dihitung di fungsi
// database: terbuka -> dikoreksi (Sub SLS diisi ulang jadi terdampak sesudah sanggahan) atau tetap (PML/admin menyatakan hasil dipertahankan).

import type { Db } from "@/lib/sigap";
import { kirimKeAkun } from "@/lib/sigapPush";
import { catatAudit } from "@/lib/sigapAkses";
import { gabungPenerima, rapikanNama } from "@/lib/rekapIdentifikasi";

export type Galat = { galat: string; status: number };
const ringkas = (s: string, maks: number) => (s.length > maks ? `${s.slice(0, maks - 1).trimEnd()}…` : s);

/** Path tujuan notifikasi: hanya "/sigap/…" tanpa query/hash; ditambah ?rekap=sanggah agar rekap langsung terbuka di daftar sanggahan. */
export function urlSanggah(x: unknown): string {
  const p = typeof x === "string" ? x.split(/[?#]/)[0].trim() : "";
  if (!p.startsWith("/sigap/") || p.startsWith("//") || p.length > 160 || /[\\\s\u0000-\u001f]/.test(p)) return "/sigap?rekap=sanggah";
  return `${p}?rekap=sanggah`;
}

/** Akun PML (pelaksana + pendamping) yang dialokasikan pada SLS dari Sub SLS ini. */
export async function akunPmlSubsls(db: Db, idsubsls: string): Promise<number[]> {
  const { data: al } = await db.from("bencana_identifikasi_alokasi").select("pml_pelaksana_id, pml_pendamping_id").eq("idsls", idsubsls.slice(0, 14));
  const petugas = [...new Set((al ?? []).flatMap((a) => [a.pml_pelaksana_id, a.pml_pendamping_id]).filter((x): x is number => typeof x === "number"))];
  if (!petugas.length) return [];
  const { data: ak } = await db.from("sigap_akun").select("id").in("petugas_bencana_id", petugas).eq("aktif", true);
  return (ak ?? []).map((a) => a.id as number);
}

/** Akun yang pernah menyimpan identifikasi Sub SLS ini (penyimpan terakhir + riwayat audit). */
export async function akunPengidentifikasi(db: Db, idsubsls: string): Promise<number[]> {
  const [{ data: h }, { data: au }] = await Promise.all([
    db.from("bencana_identifikasi_subsls").select("diisi_oleh_akun").eq("idsubsls", idsubsls).maybeSingle(),
    db.from("sigap_audit").select("akun_id").eq("aksi", "identifikasi_simpan").eq("detail->>idsubsls", idsubsls).limit(200),
  ]);
  return gabungPenerima([[h?.diisi_oleh_akun as number | null | undefined], (au ?? []).map((a) => a.akun_id as number | null)], null);
}

/** Akun admin: peran yang punya izin menu bencana.admin, atau peran admin aplikasi/bencana. */
export async function akunAdminBencana(db: Db): Promise<number[]> {
  const [{ data: iz }, { data: pr }] = await Promise.all([
    db.from("sigap_peran_izin").select("peran_id").eq("menu_kode", "bencana.admin"),
    db.from("sigap_peran").select("id").in("kode", ["admin_aplikasi", "admin_bencana"]),
  ]);
  const peranIds = [...new Set([...(iz ?? []).map((x) => x.peran_id as number), ...(pr ?? []).map((x) => x.id as number)])];
  if (!peranIds.length) return [];
  const { data: ap } = await db.from("sigap_akun_peran").select("akun_id").in("peran_id", peranIds);
  const akunIds = [...new Set((ap ?? []).map((x) => x.akun_id as number))];
  if (!akunIds.length) return [];
  const { data: ak } = await db.from("sigap_akun").select("id").in("id", akunIds).eq("aktif", true);
  return (ak ?? []).map((a) => a.id as number);
}

async function labelSubsls(db: Db, idsubsls: string): Promise<string> {
  const { data } = await db.from("bencana_wilayah").select("nagari, sls, sub_sls").eq("idsubsls", idsubsls).maybeSingle();
  return data ? `${rapikanNama(String(data.sls ?? ""))} · ${data.sub_sls} (Nagari ${rapikanNama(String(data.nagari ?? ""))})` : idsubsls;
}

/** Buat sanggahan baru + beri tahu pengidentifikasi, PML bersangkutan, dan admin. Kegagalan push TIDAK menggagalkan sanggahan. */
export async function buatSanggah(db: Db, akun: { id: number; nama?: string | null }, idsubsls: string, alasan: string, path: unknown): Promise<{ id: number; dikirim: number } | Galat> {
  if (!/^\d{16}$/.test(idsubsls)) return { galat: "Kode Sub SLS tidak sah.", status: 400 };
  const { data: sub } = await db.from("bencana_identifikasi_subsls").select("diisi_at, tidak_terdampak").eq("idsubsls", idsubsls).maybeSingle();
  if (!sub || !sub.diisi_at) return { galat: "Sub SLS ini belum diidentifikasi, jadi belum bisa disanggah.", status: 409 };
  if (sub.tidak_terdampak !== true) return { galat: "Sanggahan hanya untuk Sub SLS yang dinyatakan tidak terdampak.", status: 409 };

  const { data: baru, error } = await db.from("bencana_identifikasi_sanggah").insert({ idsubsls, penyanggah_akun_id: akun.id, alasan }).select("id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { galat: "Anda sudah menyanggah Sub SLS ini dan belum ditanggapi.", status: 409 };
    return { galat: "Sanggahan gagal disimpan. Coba lagi.", status: 500 };
  }
  await catatAudit(db, akun.id, "identifikasi_sanggah", { idsubsls, sanggah_id: baru.id }).catch(() => undefined);

  let dikirim = 0;
  try {
    const [peng, pml, admin, lbl] = await Promise.all([akunPengidentifikasi(db, idsubsls), akunPmlSubsls(db, idsubsls), akunAdminBencana(db), labelSubsls(db, idsubsls)]);
    const penerima = gabungPenerima([peng, pml, admin], akun.id);
    const nama = (akun.nama ?? "").trim() || "Seorang petugas";
    const h = await kirimKeAkun(db, penerima, {
      judul: "Sanggahan hasil identifikasi",
      isi: ringkas(`${nama} menyanggah ${lbl}: dinyatakan tidak terdampak, menurutnya terdampak. "${alasan.replace(/\s+/g, " ")}"`, 240),
      url: urlSanggah(path),
      tag: `sanggah-${idsubsls}`,
    });
    dikirim = h.terkirim;
  } catch (e) {
    console.error("[sanggah push]", e instanceof Error ? e.message : e);
  }
  return { id: baru.id as number, dikirim };
}

/** Tanggapi sanggahan: hanya admin atau PML bersangkutan. Hasil dipertahankan ("tetap"); penyanggah diberi tahu. */
export async function tanggapiSanggah(db: Db, akun: { id: number; nama?: string | null }, admin: boolean, id: number, tanggapan: string, path: unknown): Promise<{ ok: true } | Galat> {
  const { data: s } = await db.from("bencana_identifikasi_sanggah").select("id, idsubsls, penyanggah_akun_id, ditanggapi_at").eq("id", id).maybeSingle();
  if (!s) return { galat: "Sanggahan tidak ditemukan.", status: 404 };
  if (s.ditanggapi_at) return { galat: "Sanggahan ini sudah ditanggapi.", status: 409 };
  if (!admin && !(await akunPmlSubsls(db, s.idsubsls as string)).includes(akun.id)) return { galat: "Hanya admin atau PML bersangkutan yang dapat menanggapi sanggahan.", status: 403 };

  const { data: upd, error } = await db
    .from("bencana_identifikasi_sanggah")
    .update({ tanggapan, ditanggapi_oleh: akun.id, ditanggapi_at: new Date().toISOString(), hasil: "tetap" })
    .eq("id", id)
    .is("ditanggapi_at", null)
    .select("id");
  if (error) return { galat: "Tanggapan gagal disimpan. Coba lagi.", status: 500 };
  if (!upd || upd.length === 0) return { galat: "Sanggahan ini sudah ditanggapi.", status: 409 };
  await catatAudit(db, akun.id, "identifikasi_sanggah_tanggap", { idsubsls: s.idsubsls, sanggah_id: id }).catch(() => undefined);

  try {
    const lbl = await labelSubsls(db, s.idsubsls as string);
    const nama = (akun.nama ?? "").trim() || "PML";
    await kirimKeAkun(db, gabungPenerima([[s.penyanggah_akun_id as number]], akun.id), {
      judul: "Sanggahan Anda ditanggapi",
      isi: ringkas(`${nama} menanggapi sanggahan ${lbl}: hasil tetap tidak terdampak. "${tanggapan.replace(/\s+/g, " ")}"`, 240),
      url: urlSanggah(path),
      tag: `sanggah-${s.idsubsls}`,
    });
  } catch (e) {
    console.error("[tanggapi push]", e instanceof Error ? e.message : e);
  }
  return { ok: true };
}
