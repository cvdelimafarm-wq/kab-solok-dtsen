// app/api/sigap/pedia/route.ts
//
// (7 Okt 2026) SIGAP PEDIA -- API ensiklopedia & penatausahaan -- permintaan user.
// Baca: pegawai organik (atau izin pedia.baca). Tulis: izin pedia.kelola (Admin Anggaran).
// Tidak ada DELETE: entri dibatalkan; kategori dinonaktifkan; file & audit append-only (dijaga trigger DB).
//
// GET ?bagian=beranda | cari&q=&kategori=&tag= | detail&id= | register&... | master | tag&q= | rekap
//            | rujukan&jenis=&ref= | referensi | audit&id=
// POST { aksi: buat | ubah | status | finalkan | batalkan | koreksi | tinjau | tautan_tambah
//              | kategori_simpan | regulasi_simpan }

import { NextRequest, NextResponse } from "next/server";
import { aksesPedia, audit, cobaUlangTsa, galat, type Db, type SesiPedia } from "@/lib/pedia/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Kat = { id: number; kode: string; nama: string; induk_id: number | null; deskripsi: string | null; urutan: number; aktif: boolean };
type EntriRingkas = {
  id: number;
  nomor_registrasi: string;
  judul: string;
  kesimpulan: string | null;
  kategori_id: number;
  kanal: string;
  kanal_lain: string | null;
  nomor_tiket: string | null;
  sifat: string;
  status: string;
  perlu_ditinjau: boolean;
  alasan_tinjau: string | null;
  tgl_diajukan: string | null;
  tgl_dijawab: string | null;
  tahun: number;
  dibuat_at: string;
  menggantikan_id: number | null;
};
const KOLOM_RINGKAS =
  "id, nomor_registrasi, judul, kesimpulan, kategori_id, kanal, kanal_lain, nomor_tiket, sifat, status, perlu_ditinjau, alasan_tinjau, tgl_diajukan, tgl_dijawab, tahun, dibuat_at, menggantikan_id";

const FIELD_ENTRI = [
  "kategori_id",
  "kanal",
  "kanal_lain",
  "nomor_tiket",
  "tgl_diajukan",
  "tgl_dijawab",
  "sifat",
  "judul",
  "pertanyaan",
  "jawaban",
  "kesimpulan",
  "url_tiket",
  "nota_dinas_srikandi",
  "keputusan_ppk",
  "penanya_akun_id",
  "penanya_nama",
  "tim",
] as const;

async function semuaKategori(db: Db): Promise<Kat[]> {
  const { data } = await db.from("pedia_kategori").select("id, kode, nama, induk_id, deskripsi, urutan, aktif").order("urutan").order("kode");
  return (data ?? []) as Kat[];
}

/** Lengkapi kartu entri: kategori, tag. */
async function kartu(db: Db, rows: EntriRingkas[], kats?: Kat[]) {
  if (!rows.length) return [];
  const k = kats ?? (await semuaKategori(db));
  const ids = rows.map((r) => r.id);
  const { data: et } = await db.from("pedia_entri_tag").select("entri_id, pedia_tag(nama)").in("entri_id", ids);
  const tagPer = new Map<number, string[]>();
  for (const x of (et ?? []) as unknown as { entri_id: number; pedia_tag: { nama: string } | null }[]) {
    if (!x.pedia_tag) continue;
    tagPer.set(x.entri_id, [...(tagPer.get(x.entri_id) ?? []), x.pedia_tag.nama]);
  }
  return rows.map((r) => {
    const sub = k.find((x) => x.id === r.kategori_id);
    const induk = sub?.induk_id ? k.find((x) => x.id === sub.induk_id) : null;
    return { ...r, kategori: sub ? { kode: sub.kode, nama: sub.nama } : null, induk: induk ? { kode: induk.kode, nama: induk.nama } : null, tag: tagPer.get(r.id) ?? [] };
  });
}

async function labelTautan(db: Db, t: { jenis: string; ref_id: number | null; ref_teks: string | null }[]) {
  const keg = t.filter((x) => x.jenis === "kegiatan" && x.ref_id).map((x) => x.ref_id!);
  const pen = t.filter((x) => x.jenis === "penugasan" && x.ref_id).map((x) => x.ref_id!);
  const kon = t.filter((x) => x.jenis === "kontrak_paket" && x.ref_id).map((x) => x.ref_id!);
  const [{ data: k }, { data: p }, { data: c }] = await Promise.all([
    keg.length ? db.from("sigap_kegiatan").select("id, nama").in("id", keg) : Promise.resolve({ data: [] as { id: number; nama: string }[] }),
    pen.length ? db.from("sigap_penugasan").select("id, peran, sigap_akun(nama), sigap_kegiatan(nama)").in("id", pen) : Promise.resolve({ data: [] as unknown[] }),
    kon.length ? db.from("kontrak_paket").select("id, nama, nomor_urut, tahun").in("id", kon) : Promise.resolve({ data: [] as { id: number; nama: string; nomor_urut: number; tahun: number }[] }),
  ]);
  return t.map((x) => {
    let label = x.ref_teks ?? "";
    let href: string | null = null;
    if (x.jenis === "kegiatan") {
      label = (k ?? []).find((y) => y.id === x.ref_id)?.nama ?? `Kegiatan #${x.ref_id}`;
      href = `/sigap/admin?kegiatan=${x.ref_id}&tab=kegiatan`;
    } else if (x.jenis === "penugasan") {
      const y = ((p ?? []) as unknown as { id: number; peran: string; sigap_akun: { nama: string } | null; sigap_kegiatan: { nama: string } | null }[]).find((z) => z.id === x.ref_id);
      label = y ? `SPJ ${y.sigap_akun?.nama ?? "?"} (${y.peran.toUpperCase()}) · ${y.sigap_kegiatan?.nama ?? ""}` : `Penugasan #${x.ref_id}`;
    } else if (x.jenis === "kontrak_paket") {
      const y = (c ?? []).find((z) => z.id === x.ref_id);
      label = y ? `Paket ${y.tahun} No ${y.nomor_urut} · ${y.nama}` : `Paket #${x.ref_id}`;
      href = `/sigap/kontrak/${x.ref_id}`;
    }
    return { ...x, label: label || x.jenis, href };
  });
}

function ambilField(b: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of FIELD_ENTRI) {
    if (!(k in b)) continue;
    const v = b[k];
    if (k === "kategori_id" || k === "penanya_akun_id") out[k] = v ? Number(v) : null;
    else if (k === "tgl_diajukan" || k === "tgl_dijawab") out[k] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    else out[k] = typeof v === "string" ? v.trim() || null : v ?? null;
  }
  return out;
}

async function simpanRelasi(s: SesiPedia, entriId: number, b: Record<string, unknown>) {
  const db = s.db;
  if (Array.isArray(b.tag)) {
    const nama = Array.from(new Set((b.tag as unknown[]).map((t) => String(t).toLowerCase().trim()).filter(Boolean))).slice(0, 30);
    if (nama.length) await db.from("pedia_tag").upsert(nama.map((n) => ({ nama: n })), { onConflict: "nama", ignoreDuplicates: true });
    const { data: tags } = nama.length ? await db.from("pedia_tag").select("id, nama").in("nama", nama) : { data: [] as { id: number; nama: string }[] };
    const { data: lama } = await db.from("pedia_entri_tag").select("tag_id").eq("entri_id", entriId);
    const mau = new Set((tags ?? []).map((t) => t.id));
    const ada = new Set((lama ?? []).map((t) => t.tag_id as number));
    const hapus = [...ada].filter((x) => !mau.has(x));
    const tambah = [...mau].filter((x) => !ada.has(x));
    if (hapus.length) await db.from("pedia_entri_tag").delete().eq("entri_id", entriId).in("tag_id", hapus);
    if (tambah.length) await db.from("pedia_entri_tag").insert(tambah.map((tag_id) => ({ entri_id: entriId, tag_id })));
  }
  if (Array.isArray(b.regulasi)) {
    const mau = (b.regulasi as { regulasi_id: number; pasal?: string | null }[]).filter((r) => r && r.regulasi_id);
    const { data: lama } = await db.from("pedia_entri_regulasi").select("regulasi_id, pasal").eq("entri_id", entriId);
    const idMau = new Set(mau.map((r) => Number(r.regulasi_id)));
    const hapus = (lama ?? []).filter((r) => !idMau.has(r.regulasi_id as number)).map((r) => r.regulasi_id as number);
    if (hapus.length) await db.from("pedia_entri_regulasi").delete().eq("entri_id", entriId).in("regulasi_id", hapus);
    for (const r of mau) {
      const l = (lama ?? []).find((x) => x.regulasi_id === Number(r.regulasi_id));
      if (!l) await db.from("pedia_entri_regulasi").insert({ entri_id: entriId, regulasi_id: Number(r.regulasi_id), pasal: r.pasal?.trim() || null });
      else if ((l.pasal ?? null) !== (r.pasal?.trim() || null)) await db.from("pedia_entri_regulasi").update({ pasal: r.pasal?.trim() || null }).eq("entri_id", entriId).eq("regulasi_id", Number(r.regulasi_id));
    }
  }
  if (Array.isArray(b.tautan)) {
    const mau = (b.tautan as { jenis: string; ref_id?: number | null; ref_teks?: string | null }[]).filter((t) => t && t.jenis && (t.ref_id || t.ref_teks));
    const { data: lama } = await db.from("pedia_tautan").select("id, jenis, ref_id, ref_teks").eq("entri_id", entriId);
    const kunci = (t: { jenis: string; ref_id?: number | null; ref_teks?: string | null }) => `${t.jenis}|${t.ref_id ?? 0}|${(t.ref_teks ?? "").trim()}`;
    const kMau = new Set(mau.map(kunci));
    const kAda = new Set((lama ?? []).map(kunci));
    const hapus = (lama ?? []).filter((t) => !kMau.has(kunci(t))).map((t) => t.id as number);
    if (hapus.length) await db.from("pedia_tautan").delete().in("id", hapus);
    const tambah = mau.filter((t) => !kAda.has(kunci(t)));
    if (tambah.length)
      await db.from("pedia_tautan").insert(tambah.map((t) => ({ entri_id: entriId, jenis: t.jenis, ref_id: t.ref_id ? Number(t.ref_id) : null, ref_teks: t.ref_teks?.trim() || null, dibuat_oleh: s.nama })));
  }
  await db.rpc("pedia_segarkan_cari", { p_entri: entriId });
}

// ======================================================================== GET
export async function GET(req: NextRequest) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  const { db } = s;
  const q = req.nextUrl.searchParams;
  const bagian = q.get("bagian") ?? "beranda";
  const perluKelola = () => (s.kelola ? null : galat("Menu ini khusus pengelola (Admin Anggaran).", 403));

  try {
    if (bagian === "beranda") {
      const kats = await semuaKategori(db);
      const { data: es } = await db.from("pedia_entri").select(KOLOM_RINGKAS).neq("status", "dibatalkan").order("id", { ascending: false });
      const rows = (es ?? []) as EntriRingkas[];
      const jml = new Map<number, number>();
      for (const e of rows) {
        jml.set(e.kategori_id, (jml.get(e.kategori_id) ?? 0) + 1);
        const induk = kats.find((k) => k.id === e.kategori_id)?.induk_id;
        if (induk) jml.set(induk, (jml.get(induk) ?? 0) + 1);
      }
      const { data: st } = await db.from("pedia_statistik").select("entri_id, dibuka").order("dibuka", { ascending: false }).limit(20);
      const populerId = (st ?? []).map((x) => x.entri_id as number);
      const populer = populerId.map((id) => rows.find((r) => r.id === id)).filter(Boolean).slice(0, 6) as EntriRingkas[];
      return NextResponse.json({
        kelola: s.kelola,
        nama: s.nama,
        total: rows.length,
        perlu_ditinjau: rows.filter((r) => r.perlu_ditinjau).length,
        kategori: kats.filter((k) => k.aktif).map((k) => ({ ...k, jumlah: jml.get(k.id) ?? 0 })),
        terbaru: await kartu(db, rows.slice(0, 8), kats),
        populer: await kartu(db, populer, kats),
      });
    }

    if (bagian === "cari") {
      const teks = (q.get("q") ?? "").trim().slice(0, 200);
      const katKode = q.get("kategori");
      const tag = q.get("tag");
      const kats = await semuaKategori(db);
      let ids: number[] | null = null;
      let skor = new Map<number, number>();
      if (teks) {
        const { data, error } = await db.rpc("pedia_cari_entri", { q: teks, batas: 200 });
        if (error) return galat(error.message, 500);
        const r = (data ?? []) as { entri_id: number; skor: number }[];
        ids = r.map((x) => x.entri_id);
        skor = new Map(r.map((x) => [x.entri_id, x.skor]));
      }
      if (tag) {
        const { data: t } = await db.from("pedia_tag").select("id").eq("nama", tag.toLowerCase()).maybeSingle();
        const { data: et } = t ? await db.from("pedia_entri_tag").select("entri_id").eq("tag_id", t.id) : { data: [] as { entri_id: number }[] };
        const tIds = (et ?? []).map((x) => x.entri_id as number);
        ids = ids ? ids.filter((x) => tIds.includes(x)) : tIds;
      }
      let qq = db.from("pedia_entri").select(KOLOM_RINGKAS).neq("status", "dibatalkan");
      if (ids) qq = qq.in("id", ids.length ? ids : [-1]);
      if (katKode) {
        const k = kats.find((x) => x.kode === katKode);
        const daftar = k ? (k.induk_id ? [k.id] : kats.filter((x) => x.induk_id === k.id).map((x) => x.id)) : [-1];
        qq = qq.in("kategori_id", daftar.length ? daftar : [-1]);
      }
      const { data } = await qq.order("id", { ascending: false }).limit(200);
      let rows = (data ?? []) as EntriRingkas[];
      if (teks) rows = rows.sort((a, b) => (skor.get(b.id) ?? 0) - (skor.get(a.id) ?? 0));
      if (teks) await audit(s, "cari", null, null, { q: teks, hasil: rows.length });
      return NextResponse.json({ hasil: await kartu(db, rows, kats) });
    }

    if (bagian === "tag") {
      const t = (q.get("q") ?? "").toLowerCase().trim();
      let qq = db.from("pedia_tag").select("nama").order("nama").limit(15);
      if (t) qq = qq.ilike("nama", `%${t}%`);
      const { data } = await qq;
      return NextResponse.json({ tag: (data ?? []).map((x) => x.nama) });
    }

    if (bagian === "detail") {
      const id = Number(q.get("id"));
      const { data: e } = await db.from("pedia_entri").select("*").eq("id", id).maybeSingle();
      if (!e) return galat("Entri tidak ditemukan.", 404);
      if (e.status === "dibatalkan" && !s.kelola) return galat("Entri ini sudah dibatalkan.", 404);
      const kats = await semuaKategori(db);
      const [{ data: et }, { data: er }, { data: ta }, { data: files }, { data: ganti }, { data: ver }] = await Promise.all([
        db.from("pedia_entri_tag").select("tag_id, pedia_tag(nama)").eq("entri_id", id),
        db.from("pedia_entri_regulasi").select("regulasi_id, pasal, pedia_regulasi(id, jenis, nomor, tahun, judul, status, diubah_oleh_teks)").eq("entri_id", id),
        db.from("pedia_tautan").select("id, jenis, ref_id, ref_teks").eq("entri_id", id),
        db
          .from("pedia_file")
          .select(
            s.kelola
              ? "id, induk_file_id, jenis, nama_asli, mime, ukuran, sha256, tsa_status, tsa_nama, tsa_gen_time, tsa_serial, tsa_percobaan, tsa_galat, email, dkim, diunggah_oleh, dibuat_at"
              : "id, jenis, nama_asli, ukuran, tsa_status, tsa_gen_time, dkim->>status, dkim->>domain"
          )
          .eq("entri_id", id)
          .order("id"),
        db.from("pedia_entri").select("id, nomor_registrasi, status").eq("menggantikan_id", id),
        s.kelola ? db.from("pedia_verifikasi").select("id, at, oleh, semua_cocok, hasil").eq("entri_id", id).order("id", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      ]);
      const tagIds = ((et ?? []) as { tag_id: number }[]).map((x) => x.tag_id);
      // entri terkait: sub-kategori sama atau tag sama
      const { data: tTag } = tagIds.length ? await db.from("pedia_entri_tag").select("entri_id").in("tag_id", tagIds).neq("entri_id", id) : { data: [] as { entri_id: number }[] };
      const { data: rel } = await db
        .from("pedia_entri")
        .select(KOLOM_RINGKAS)
        .neq("status", "dibatalkan")
        .neq("id", id)
        .or(`kategori_id.eq.${e.kategori_id}${(tTag ?? []).length ? `,id.in.(${Array.from(new Set((tTag ?? []).map((x) => x.entri_id))).join(",")})` : ""}`)
        .order("id", { ascending: false })
        .limit(6);
      let menggantikan = null;
      if (e.menggantikan_id) menggantikan = (await db.from("pedia_entri").select("id, nomor_registrasi").eq("id", e.menggantikan_id).maybeSingle()).data;
      // statistik dibuka + audit "lihat"
      const { data: stt } = await db.from("pedia_statistik").select("dibuka").eq("entri_id", id).maybeSingle();
      await db.from("pedia_statistik").upsert({ entri_id: id, dibuka: ((stt?.dibuka as number) ?? 0) + 1, terakhir_dibuka: new Date().toISOString() });
      await audit(s, "lihat", id);
      const sub = kats.find((k) => k.id === e.kategori_id);
      const induk = sub?.induk_id ? kats.find((k) => k.id === sub.induk_id) : null;
      const isi = s.kelola ? e : Object.fromEntries(Object.entries(e).filter(([k]) => !["url_tiket", "dibuat_oleh_id"].includes(k)));
      return NextResponse.json({
        kelola: s.kelola,
        entri: isi,
        kategori: sub ? { id: sub.id, kode: sub.kode, nama: sub.nama } : null,
        induk: induk ? { kode: induk.kode, nama: induk.nama } : null,
        tag: ((et ?? []) as unknown as { pedia_tag: { nama: string } | null }[]).map((x) => x.pedia_tag?.nama).filter(Boolean),
        regulasi: ((er ?? []) as unknown as { pasal: string | null; pedia_regulasi: Record<string, unknown> }[]).map((x) => ({ ...x.pedia_regulasi, pasal: x.pasal })),
        tautan: await labelTautan(db, (ta ?? []) as { jenis: string; ref_id: number | null; ref_teks: string | null }[]),
        file: files ?? [],
        digantikan_oleh: ganti ?? [],
        menggantikan,
        verifikasi_terakhir: (ver ?? [])[0] ?? null,
        terkait: await kartu(db, (rel ?? []) as EntriRingkas[], kats),
      });
    }

    if (bagian === "rujukan") {
      const jenis = q.get("jenis") ?? "";
      const ref = Number(q.get("ref"));
      const { data: t } = await db.from("pedia_tautan").select("entri_id").eq("jenis", jenis).eq("ref_id", ref);
      const ids = (t ?? []).map((x) => x.entri_id as number);
      if (!ids.length) return NextResponse.json({ entri: [] });
      const { data } = await db.from("pedia_entri").select(KOLOM_RINGKAS).in("id", ids).neq("status", "dibatalkan").order("id", { ascending: false });
      return NextResponse.json({ entri: await kartu(db, (data ?? []) as EntriRingkas[]) });
    }

    // ---------------- khusus pengelola
    const tolak = perluKelola();
    if (tolak) return tolak;

    if (bagian === "register") {
      const kats = await semuaKategori(db);
      let qq = db.from("pedia_entri").select(KOLOM_RINGKAS);
      const tahun = Number(q.get("tahun"));
      if (tahun) qq = qq.eq("tahun", tahun);
      if (q.get("status")) qq = qq.eq("status", q.get("status")!);
      if (q.get("kanal")) qq = qq.eq("kanal", q.get("kanal")!);
      if (q.get("tinjau") === "1") qq = qq.eq("perlu_ditinjau", true);
      const kk = q.get("kategori");
      if (kk) {
        const k = kats.find((x) => x.kode === kk);
        const daftar = k ? (k.induk_id ? [k.id] : kats.filter((x) => x.induk_id === k.id).map((x) => x.id)) : [-1];
        qq = qq.in("kategori_id", daftar.length ? daftar : [-1]);
      }
      if (q.get("tautan_jenis") && q.get("tautan_ref")) {
        const { data: t } = await db.from("pedia_tautan").select("entri_id").eq("jenis", q.get("tautan_jenis")!).eq("ref_id", Number(q.get("tautan_ref")));
        const ids = (t ?? []).map((x) => x.entri_id as number);
        qq = qq.in("id", ids.length ? ids : [-1]);
      }
      const { data } = await qq.order("tahun", { ascending: false }).order("nomor_urut", { ascending: false }).limit(2000);
      const rows = (data ?? []) as EntriRingkas[];
      const ids = rows.map((r) => r.id);
      const { data: fs } = ids.length ? await db.from("pedia_file").select("entri_id, jenis, tsa_status, dkim->>status").in("entri_id", ids) : { data: [] };
      const ring = new Map<number, { file: number; tsa_ok: number; tsa_pending: number; dkim_pass: number; dkim_lain: number }>();
      for (const f of (fs ?? []) as unknown as { entri_id: number; jenis: string; tsa_status: string; status: string | null }[]) {
        const r = ring.get(f.entri_id) ?? { file: 0, tsa_ok: 0, tsa_pending: 0, dkim_pass: 0, dkim_lain: 0 };
        r.file++;
        if (f.tsa_status === "ok") r.tsa_ok++;
        else r.tsa_pending++;
        if (f.jenis === "eml") {
          if (f.status === "pass") r.dkim_pass++;
          else r.dkim_lain++;
        }
        ring.set(f.entri_id, r);
      }
      const hasil = (await kartu(db, rows, kats)).map((r) => ({ ...r, bukti: ring.get(r.id) ?? { file: 0, tsa_ok: 0, tsa_pending: 0, dkim_pass: 0, dkim_lain: 0 } }));
      const { data: th } = await db.from("pedia_entri").select("tahun");
      return NextResponse.json({ entri: hasil, kategori: kats, tahun: Array.from(new Set((th ?? []).map((x) => x.tahun as number))).sort().reverse() });
    }

    if (bagian === "master") {
      const [kats, { data: reg }, { data: tags }, { data: dipakai }] = await Promise.all([
        semuaKategori(db),
        db.from("pedia_regulasi").select("*").order("jenis").order("tahun", { ascending: false }),
        db.from("pedia_tag").select("id, nama").order("nama"),
        db.from("pedia_entri").select("kategori_id"),
      ]);
      const { data: et } = await db.from("pedia_entri_tag").select("tag_id");
      const { data: er } = await db.from("pedia_entri_regulasi").select("regulasi_id");
      const hit = <T,>(arr: T[] | null, k: (x: T) => number) => (arr ?? []).reduce((m, x) => m.set(k(x), (m.get(k(x)) ?? 0) + 1), new Map<number, number>());
      const jk = hit(dipakai as { kategori_id: number }[] | null, (x) => x.kategori_id);
      const jt = hit(et as { tag_id: number }[] | null, (x) => x.tag_id);
      const jr = hit(er as { regulasi_id: number }[] | null, (x) => x.regulasi_id);
      return NextResponse.json({
        kategori: kats.map((k) => ({ ...k, dipakai: (jk.get(k.id) ?? 0) + kats.filter((x) => x.induk_id === k.id).reduce((a, x) => a + (jk.get(x.id) ?? 0), 0) })),
        regulasi: (reg ?? []).map((r) => ({ ...r, dipakai: jr.get(r.id as number) ?? 0 })),
        tag: (tags ?? []).map((t) => ({ ...t, dipakai: jt.get(t.id as number) ?? 0 })),
      });
    }

    if (bagian === "referensi") {
      const [kats, { data: reg }, { data: keg }, { data: kon }, { data: org }] = await Promise.all([
        semuaKategori(db),
        db.from("pedia_regulasi").select("id, jenis, nomor, tahun, judul, status").order("jenis").order("tahun", { ascending: false }),
        db.from("sigap_kegiatan").select("id, nama").order("id", { ascending: false }),
        db.from("kontrak_paket").select("id, tahun, nomor_urut, nama").neq("status", "batal").order("id", { ascending: false }).limit(200),
        db.from("sigap_akun").select("id, nama").eq("jenis", "organik").eq("aktif", true).order("nama"),
      ]);
      return NextResponse.json({ kategori: kats, regulasi: reg ?? [], kegiatan: keg ?? [], kontrak: kon ?? [], organik: org ?? [] });
    }

    if (bagian === "rekap") {
      const kats = await semuaKategori(db);
      const { data } = await db.from("pedia_entri").select(KOLOM_RINGKAS);
      const rows = (data ?? []) as EntriRingkas[];
      const aktif = rows.filter((r) => r.status !== "dibatalkan");
      const per = (f: (r: EntriRingkas) => string) => Object.entries(aktif.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
      const indukDari = (r: EntriRingkas) => {
        const sub = kats.find((k) => k.id === r.kategori_id);
        const ind = sub?.induk_id ? kats.find((k) => k.id === sub.induk_id) : sub;
        return ind ? `${ind.kode} ${ind.nama}` : "?";
      };
      const batas = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const macet = aktif.filter((r) => r.status === "diajukan" && (r.tgl_diajukan ?? r.dibuat_at.slice(0, 10)) < batas);
      // "job" coba ulang timestamp tertunda (maks 5 file per pemanggilan rekap)
      const { data: pend } = await db.from("pedia_file").select("id").eq("tsa_status", "pending").order("id").limit(5);
      const ulang: { id: number; ok: boolean }[] = [];
      for (const p of pend ?? []) {
        try {
          const r = await cobaUlangTsa(s, p.id as number);
          ulang.push({ id: p.id as number, ok: !!r.ok });
        } catch {
          ulang.push({ id: p.id as number, ok: false });
        }
      }
      const { count: sisaPending } = await db.from("pedia_file").select("id", { count: "exact", head: true }).eq("tsa_status", "pending");
      const { data: rantai } = await db.rpc("pedia_audit_cek_rantai");
      return NextResponse.json({
        total: aktif.length,
        per_kategori: per(indukDari),
        per_kanal: per((r) => r.kanal),
        per_tahun: per((r) => String(r.tahun)),
        per_status: per((r) => r.status),
        diajukan_lama: await kartu(db, macet, kats),
        perlu_ditinjau: await kartu(db, aktif.filter((r) => r.perlu_ditinjau), kats),
        tsa_pending: sisaPending ?? 0,
        tsa_dicoba_ulang: ulang,
        rantai_audit: (rantai ?? []).length ? { utuh: false, ...(rantai as { id: number; masalah: string }[])[0] } : { utuh: true },
      });
    }

    if (bagian === "audit") {
      const id = Number(q.get("id"));
      const { data } = await db.from("pedia_audit").select("id, at, nama, ip, aksi, file_id, detail, hash").eq("entri_id", id).order("id", { ascending: false }).limit(300);
      return NextResponse.json({ audit: data ?? [] });
    }

    return galat("Bagian tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

// ======================================================================== POST
export async function POST(req: NextRequest) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("Hanya pengelola (Admin Anggaran) yang bisa mengubah SIGAP PEDIA.", 403);
  const { db } = s;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const aksi = String(b.aksi ?? "");
  const kini = new Date().toISOString();
  const pesanDb = (m: string) => m.replace(/^.*?SIGAP PEDIA:\s*/, "");

  try {
    if (aksi === "buat" || aksi === "koreksi") {
      let f = ambilField(b);
      let menggantikan: number | null = null;
      if (aksi === "koreksi") {
        const { data: lama } = await db.from("pedia_entri").select("*").eq("id", Number(b.id)).maybeSingle();
        if (!lama) return galat("Entri lama tidak ditemukan.", 404);
        menggantikan = lama.id;
        const dasar: Record<string, unknown> = {};
        for (const k of FIELD_ENTRI) dasar[k] = lama[k];
        f = { ...dasar, ...f };
        // salin relasi bila tidak dikirim
        if (!Array.isArray(b.tag)) b.tag = ((await db.from("pedia_entri_tag").select("pedia_tag(nama)").eq("entri_id", lama.id)).data ?? []).map((x) => (x as unknown as { pedia_tag: { nama: string } }).pedia_tag?.nama);
        if (!Array.isArray(b.regulasi)) b.regulasi = (await db.from("pedia_entri_regulasi").select("regulasi_id, pasal").eq("entri_id", lama.id)).data ?? [];
        if (!Array.isArray(b.tautan)) b.tautan = (await db.from("pedia_tautan").select("jenis, ref_id, ref_teks").eq("entri_id", lama.id)).data ?? [];
      }
      if (!f.kategori_id) return galat("Pilih sub-kategori.");
      if (!f.judul) return galat("Judul (dalam bentuk pertanyaan) wajib diisi.");
      const status = ["diajukan", "dijawab", "ditindaklanjuti"].includes(String(b.status)) ? String(b.status) : f.jawaban ? "dijawab" : "diajukan";
      const { data, error } = await db.rpc("pedia_entri_baru", {
        p: { ...f, status, menggantikan_id: menggantikan, dibuat_oleh: s.nama, dibuat_oleh_id: s.akunId },
      });
      if (error) return galat(pesanDb(error.message));
      const baru = (data as { id: number; nomor_registrasi: string }[])[0];
      await simpanRelasi(s, baru.id, b);
      await audit(s, aksi === "koreksi" ? "koreksi" : "buat", baru.id, null, { nomor: baru.nomor_registrasi, kategori_id: f.kategori_id, menggantikan_id: menggantikan });
      if (menggantikan) await audit(s, "digantikan", menggantikan, null, { oleh: baru.nomor_registrasi });
      return NextResponse.json({ ok: true, id: baru.id, nomor_registrasi: baru.nomor_registrasi });
    }

    const id = Number(b.id);
    const { data: lama } = id ? await db.from("pedia_entri").select("*").eq("id", id).maybeSingle() : { data: null };

    if (aksi === "ubah") {
      if (!lama) return galat("Entri tidak ditemukan.", 404);
      if (lama.status === "final" || lama.status === "dibatalkan") return galat(`Entri sudah ${lama.status}. Gunakan "Buat koreksi" untuk versi baru.`);
      const f = ambilField(b);
      const { error } = await db.from("pedia_entri").update({ ...f, diubah_oleh: s.nama, diubah_at: kini }).eq("id", id);
      if (error) return galat(pesanDb(error.message));
      await simpanRelasi(s, id, b);
      const berubah = Object.keys(f).filter((k) => String(f[k] ?? "") !== String(lama[k] ?? ""));
      if (f.kategori_id && Number(f.kategori_id) !== Number(lama.kategori_id)) await audit(s, "ubah_kategori", id, null, { dari: lama.kategori_id, ke: f.kategori_id, nomor_tetap: lama.nomor_registrasi });
      await audit(s, "ubah", id, null, { kolom: berubah });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "status") {
      if (!lama) return galat("Entri tidak ditemukan.", 404);
      const st = String(b.status);
      if (!["diajukan", "dijawab", "ditindaklanjuti"].includes(st)) return galat("Status tidak valid.");
      if (lama.status === "final" || lama.status === "dibatalkan") return galat(`Entri sudah ${lama.status}.`);
      const { error } = await db.from("pedia_entri").update({ status: st, diubah_oleh: s.nama, diubah_at: kini }).eq("id", id);
      if (error) return galat(pesanDb(error.message));
      await audit(s, "ubah_status", id, null, { dari: lama.status, ke: st });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "finalkan") {
      if (!lama) return galat("Entri tidak ditemukan.", 404);
      if (lama.status === "final" || lama.status === "dibatalkan") return galat(`Entri sudah ${lama.status}.`);
      const kurang: string[] = [];
      if (!lama.jawaban) kurang.push("jawaban");
      if (!lama.kesimpulan) kurang.push("kesimpulan praktis");
      const { count } = await db.from("pedia_file").select("id", { count: "exact", head: true }).eq("entri_id", id);
      if (!count) kurang.push("minimal 1 file bukti");
      if (kurang.length) return galat(`Belum bisa difinalkan, lengkapi: ${kurang.join(", ")}.`);
      const { error } = await db.from("pedia_entri").update({ status: "final", difinalkan_at: kini, difinalkan_oleh: s.nama, diubah_oleh: s.nama, diubah_at: kini }).eq("id", id);
      if (error) return galat(pesanDb(error.message));
      await audit(s, "finalkan", id, null, { dari: lama.status, file: count });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "batalkan") {
      if (!lama) return galat("Entri tidak ditemukan.", 404);
      const alasan = String(b.alasan ?? "").trim();
      if (alasan.length < 5) return galat("Alasan pembatalan wajib diisi.");
      if (lama.status === "dibatalkan") return galat("Entri sudah dibatalkan.");
      const { error } = await db
        .from("pedia_entri")
        .update({ status: "dibatalkan", status_sebelum_batal: lama.status, dibatalkan_alasan: alasan, dibatalkan_oleh: s.nama, dibatalkan_at: kini, diubah_oleh: s.nama, diubah_at: kini })
        .eq("id", id);
      if (error) return galat(pesanDb(error.message));
      await audit(s, "batalkan", id, null, { alasan, status_sebelum: lama.status });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "tinjau") {
      if (!lama) return galat("Entri tidak ditemukan.", 404);
      const nilai = !!b.nilai;
      const { error } = await db
        .from("pedia_entri")
        .update({ perlu_ditinjau: nilai, alasan_tinjau: nilai ? String(b.alasan ?? "").trim() || "Ditandai manual" : null, diubah_oleh: s.nama, diubah_at: kini })
        .eq("id", id);
      if (error) return galat(pesanDb(error.message));
      await audit(s, nilai ? "tandai_tinjau" : "hapus_tanda_tinjau", id, null, { alasan: b.alasan ?? null });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "tautan_tambah") {
      if (!lama) return galat("Entri tidak ditemukan.", 404);
      const jenis = String(b.jenis);
      const { error } = await db
        .from("pedia_tautan")
        .insert({ entri_id: id, jenis, ref_id: b.ref_id ? Number(b.ref_id) : null, ref_teks: String(b.ref_teks ?? "").trim() || null, dibuat_oleh: s.nama });
      if (error) return galat(/duplicate/i.test(error.message) ? "Tautan sudah ada." : pesanDb(error.message));
      await audit(s, "tambah_tautan", id, null, { jenis, ref_id: b.ref_id ?? null, ref_teks: b.ref_teks ?? null });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "kategori_simpan") {
      const k = (b.kategori ?? {}) as Record<string, unknown>;
      const baris = {
        kode: String(k.kode ?? "").trim().toUpperCase(),
        nama: String(k.nama ?? "").trim(),
        induk_id: k.induk_id ? Number(k.induk_id) : null,
        deskripsi: String(k.deskripsi ?? "").trim() || null,
        urutan: Number(k.urutan) || 0,
        aktif: k.aktif !== false,
      };
      if (!baris.kode || !baris.nama) return galat("Kode dan nama kategori wajib diisi.");
      if (k.id) {
        const { data: lamaK } = await db.from("pedia_kategori").select("kode").eq("id", Number(k.id)).maybeSingle();
        const { count } = await db.from("pedia_entri").select("id", { count: "exact", head: true }).eq("kategori_id", Number(k.id));
        if (count && lamaK && lamaK.kode !== baris.kode) return galat("Kode kategori yang sudah dipakai entri tidak bisa diganti (nomor registrasi memakai kode ini).");
        const { error } = await db.from("pedia_kategori").update(baris).eq("id", Number(k.id));
        if (error) return galat(pesanDb(error.message));
      } else {
        const { error } = await db.from("pedia_kategori").insert(baris);
        if (error) return galat(/duplicate/i.test(error.message) ? "Kode kategori sudah ada." : pesanDb(error.message));
      }
      await audit(s, "master_kategori", null, null, baris);
      return NextResponse.json({ ok: true });
    }

    if (aksi === "regulasi_simpan") {
      const r = (b.regulasi ?? {}) as Record<string, unknown>;
      const baris = {
        jenis: String(r.jenis ?? ""),
        nomor: String(r.nomor ?? "").trim(),
        tahun: Number(r.tahun),
        judul: String(r.judul ?? "").trim() || null,
        status: ["berlaku", "diubah", "dicabut"].includes(String(r.status)) ? String(r.status) : "berlaku",
        diubah_oleh_teks: String(r.diubah_oleh_teks ?? "").trim() || null,
        catatan: String(r.catatan ?? "").trim() || null,
      };
      if (!baris.nomor || !baris.tahun) return galat("Nomor dan tahun regulasi wajib diisi.");
      let n = 0;
      if (r.id) {
        const { data: lamaR } = await db.from("pedia_regulasi").select("status").eq("id", Number(r.id)).maybeSingle();
        const { error } = await db.from("pedia_regulasi").update(baris).eq("id", Number(r.id));
        if (error) return galat(pesanDb(error.message));
        if (lamaR && lamaR.status !== baris.status && baris.status !== "berlaku") {
          // trigger pedia_regulasi_status_u menandai entri; ini cadangan di level aplikasi (idempoten)
          const { data: link } = await db.from("pedia_entri_regulasi").select("entri_id").eq("regulasi_id", Number(r.id));
          const ids = (link ?? []).map((x) => x.entri_id as number);
          if (ids.length) {
            const alasan = `${baris.jenis} ${baris.nomor} (${baris.tahun}) berstatus ${baris.status}${baris.diubah_oleh_teks ? ` oleh ${baris.diubah_oleh_teks}` : ""}`;
            await db.from("pedia_entri").update({ perlu_ditinjau: true, alasan_tinjau: alasan, diubah_at: kini }).in("id", ids).neq("status", "dibatalkan");
            for (const eid of ids) await audit(s, "otomatis_perlu_ditinjau", eid, null, { regulasi_id: Number(r.id), alasan });
          }
          n = ids.length;
        }
      } else {
        const { error } = await db.from("pedia_regulasi").insert(baris);
        if (error) return galat(/duplicate/i.test(error.message) ? "Regulasi sudah ada." : pesanDb(error.message));
      }
      await audit(s, "master_regulasi", null, null, { ...baris, entri_ditandai: n });
      return NextResponse.json({ ok: true, entri_ditandai: n });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? pesanDb(e.message) : "Terjadi kesalahan.", 500);
  }
}
