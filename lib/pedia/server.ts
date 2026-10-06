// lib/pedia/server.ts
//
// (7 Okt 2026) SIGAP PEDIA -- logika server: akses, audit berantai, simpan file bukti (hash -> storage ->
// TSA -> eml/DKIM -> lampiran), coba ulang TSA, verifikasi ulang -- permintaan user.
// ATURAN: byte file TIDAK PERNAH diubah. Hash dihitung dari Buffer yg sama persis dgn yg diunggah ke storage.
// Server TIDAK PERNAH memanggil remove()/upsert utk bucket sigap-pedia.

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { BUCKET_PEDIA, MAKS_BYTE_FILE, slug, slugNomor } from "./umum";
import { validasiJenis, type JenisFile } from "./deteksi";
import { mintaTimestamp, sha256, validasiRespons } from "./tsa";
import { uraiEml, verifikasiDkim, type HasilDkim, type HeaderEmail } from "./eml";

export type Db = SupabaseClient;
export const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export type SesiPedia = { db: Db; akunId: number; nama: string; baca: boolean; kelola: boolean; ip: string };

export function ipDari(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim() || "-";
}

/** Sesi SIGAP + hak: baca = akun organik ATAU izin pedia.baca; kelola = izin pedia.kelola (level kelola). */
export async function aksesPedia(req: NextRequest): Promise<SesiPedia | { gagal: NextResponse }> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { gagal: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return { gagal: galat("Sesi berakhir. Silakan masuk kembali.", 401) };
  const { data: a } = await db.from("sigap_akun").select("id, nama, jenis, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return { gagal: galat("Sesi berakhir. Silakan masuk kembali.", 401) };
  const { izin } = await izinAkun(db, akunId);
  const kelola = boleh(izin, "pedia.kelola", "kelola");
  const baca = kelola || a.jenis === "organik" || boleh(izin, "pedia.baca", "lihat");
  if (!baca) return { gagal: galat("SIGAP PEDIA hanya untuk pegawai organik. Hubungi admin anggaran bila perlu akses.", 403) };
  return { db, akunId, nama: a.nama as string, baca, kelola, ip: ipDari(req) };
}

/** Audit append-only berantai hash (RPC pedia_audit_tambah). Galat audit tidak menggagalkan aksi baca. */
export async function audit(s: SesiPedia, aksi: string, entriId: number | null, fileId: number | null = null, detail: Record<string, unknown> = {}) {
  const { error } = await s.db.rpc("pedia_audit_tambah", {
    p_akun: s.akunId,
    p_nama: s.nama,
    p_ip: s.ip,
    p_aksi: aksi,
    p_entri: entriId,
    p_file: fileId,
    p_detail: detail,
  });
  if (error) console.error("[pedia audit]", error.message);
}

let bucketSiap = false;
export async function pastikanBucket(db: Db) {
  if (bucketSiap) return;
  const { data } = await db.storage.getBucket(BUCKET_PEDIA);
  if (!data) {
    const { error } = await db.storage.createBucket(BUCKET_PEDIA, { public: false, fileSizeLimit: MAKS_BYTE_FILE });
    if (error && !/exist/i.test(error.message)) throw new Error(`Gagal membuat bucket ${BUCKET_PEDIA}: ${error.message}`);
  }
  bucketSiap = true;
}

async function unggahSekali(db: Db, path: string, data: Buffer, contentType: string) {
  // upsert:false -> storage menolak bila path sudah ada (tidak pernah menimpa)
  const { error } = await db.storage.from(BUCKET_PEDIA).upload(path, data, { contentType, upsert: false, cacheControl: "0" });
  if (error) throw new Error(/exist|duplicate/i.test(error.message) ? "File yang sama persis sudah pernah diunggah untuk entri ini." : `Gagal menyimpan file: ${error.message}`);
}

export async function unduhStorage(db: Db, path: string): Promise<Buffer> {
  const { data, error } = await db.storage.from(BUCKET_PEDIA).download(path);
  if (error || !data) throw new Error(`File tidak bisa dibaca dari storage (${path})`);
  return Buffer.from(await data.arrayBuffer());
}

type Entri = { id: number; nomor_registrasi: string; tahun: number; status: string; nomor_tiket: string | null; tgl_dijawab: string | null; tgl_diajukan: string | null; judul: string };

export type HasilSimpan = { id: number; nama: string; jenis: JenisFile; sha256: string; tsa_status: string; dkim: string | null; lampiran: number };

/** Simpan satu file bukti (+ lampiran .eml rekursif 1 tingkat). */
export async function simpanBukti(
  s: SesiPedia,
  entri: Entri,
  f: { nama: string; data: Buffer; jenis: JenisFile; indukId?: number | null },
  isiOtomatis = true
): Promise<HasilSimpan> {
  if (f.data.length > MAKS_BYTE_FILE) throw new Error(`"${f.nama}" lebih dari 25 MB.`);
  const cek = validasiJenis(f.data, f.jenis);
  if (!cek.ok) throw new Error(`"${f.nama}": ${cek.alasan}`);
  await pastikanBucket(s.db);

  // 1. hash dari byte asli (Buffer yg sama yg diunggah)
  const data = f.data;
  const hash = sha256(data).toString("hex");
  const path = `${entri.tahun}/${slugNomor(entri.nomor_registrasi)}/${hash}_${slug(f.nama, 120)}`;
  await unggahSekali(s.db, path, data, cek.mime);

  // 2. timestamp RFC 3161
  const tsa = await mintaTimestamp(data);
  let kolomTsa: Record<string, unknown> = { tsa_status: "pending", tsa_percobaan: 1, tsa_galat: null };
  if (tsa.ok) {
    const tsaPath = `${path}.tsr`;
    await unggahSekali(s.db, tsaPath, tsa.tsr, "application/timestamp-reply");
    kolomTsa = { tsa_status: "ok", tsa_nama: tsa.tsa.nama, tsa_url: tsa.tsa.url, tsa_gen_time: tsa.info.genTime, tsa_serial: tsa.info.serial, tsa_path: tsaPath, tsa_percobaan: 1 };
  } else kolomTsa.tsa_galat = tsa.galat.join(" | ").slice(0, 1000);

  // 3. khusus .eml: header + DKIM (+ snapshot kunci DNS)
  let email: (HeaderEmail & { ringkas_teks?: string }) | null = null;
  let dkim: HasilDkim | null = null;
  let lampiran: { nama: string; mime: string; data: Buffer }[] = [];
  if (f.jenis === "eml") {
    const u = await uraiEml(data);
    email = { ...u.header, ringkas_teks: u.teks.slice(0, 600) };
    lampiran = u.lampiran;
    try {
      dkim = await verifikasiDkim(data);
    } catch (e) {
      dkim = { status: "temperror", domain: null, selector: null, algoritma: null, header_from: null, tanda_tangan: [], snapshot_dns: [], diverifikasi_at: new Date().toISOString(), mode: "dns_langsung" };
      console.error("[pedia dkim]", e);
    }
  }

  const { data: baris, error } = await s.db
    .from("pedia_file")
    .insert({
      entri_id: entri.id,
      induk_file_id: f.indukId ?? null,
      jenis: f.jenis,
      nama_asli: f.nama,
      mime: cek.mime,
      ukuran: data.length,
      sha256: hash,
      path,
      email,
      dkim,
      diunggah_oleh: s.nama,
      diunggah_oleh_id: s.akunId,
      ...kolomTsa,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Gagal mencatat file: ${error.message}`);
  await audit(s, "tambah_file", entri.id, baris.id, { nama: f.nama, jenis: f.jenis, sha256: hash, tsa: kolomTsa.tsa_status, dkim: dkim?.status ?? null });

  // 4. lampiran di dalam .eml -> file "lampiran" tersendiri (hash & timestamp masing-masing)
  let nLamp = 0;
  for (const l of lampiran) {
    try {
      await simpanBukti(s, entri, { nama: l.nama, data: l.data, jenis: "lampiran", indukId: baris.id }, false);
      nLamp++;
    } catch (e) {
      // lampiran identik (sudah ada) dilewati
      if (!(e instanceof Error && /sudah pernah/.test(e.message))) throw e;
    }
  }

  // 5. isi otomatis nomor tiket, tanggal, judul dari email bila masih kosong (entri belum final)
  if (isiOtomatis && email && entri.status !== "final" && entri.status !== "dibatalkan") {
    const ubah: Record<string, unknown> = {};
    const { tebakNomorTiket } = await import("./eml");
    const tiket = tebakNomorTiket(`${email.subject} ${email.ringkas_teks ?? ""}`);
    if (!entri.nomor_tiket && tiket) ubah.nomor_tiket = tiket;
    if (!entri.tgl_dijawab && email.date) ubah.tgl_dijawab = new Date(new Date(email.date).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    if (Object.keys(ubah).length) {
      ubah.diubah_at = new Date().toISOString();
      ubah.diubah_oleh = s.nama;
      await s.db.from("pedia_entri").update(ubah).eq("id", entri.id);
      await audit(s, "isi_otomatis_eml", entri.id, baris.id, ubah);
    }
  }

  return { id: baris.id, nama: f.nama, jenis: f.jenis, sha256: hash, tsa_status: kolomTsa.tsa_status as string, dkim: dkim?.status ?? null, lampiran: nLamp };
}

/** Coba ulang timestamp utk file berstatus pending. */
export async function cobaUlangTsa(s: SesiPedia, fileId: number) {
  const { data: f } = await s.db.from("pedia_file").select("*").eq("id", fileId).maybeSingle();
  if (!f) throw new Error("File tidak ditemukan.");
  if (f.tsa_status === "ok") return { ok: true, sudah: true };
  const data = await unduhStorage(s.db, f.path);
  if (sha256(data).toString("hex") !== f.sha256) throw new Error("Isi file di storage tidak cocok dengan hash tersimpan — timestamp TIDAK diminta.");
  const tsa = await mintaTimestamp(data);
  if (!tsa.ok) {
    await s.db.from("pedia_file").update({ tsa_percobaan: (f.tsa_percobaan ?? 0) + 1, tsa_galat: tsa.galat.join(" | ").slice(0, 1000) }).eq("id", fileId);
    await audit(s, "coba_ulang_tsa", f.entri_id, fileId, { ok: false, galat: tsa.galat });
    return { ok: false, galat: tsa.galat };
  }
  const tsaPath = `${f.path}.tsr`;
  await unggahSekali(s.db, tsaPath, tsa.tsr, "application/timestamp-reply");
  await s.db
    .from("pedia_file")
    .update({ tsa_status: "ok", tsa_nama: tsa.tsa.nama, tsa_url: tsa.tsa.url, tsa_gen_time: tsa.info.genTime, tsa_serial: tsa.info.serial, tsa_path: tsaPath, tsa_percobaan: (f.tsa_percobaan ?? 0) + 1, tsa_galat: null })
    .eq("id", fileId);
  await audit(s, "coba_ulang_tsa", f.entri_id, fileId, { ok: true, tsa: tsa.tsa.nama, genTime: tsa.info.genTime });
  return { ok: true };
}

export type HasilVerifFile = {
  file_id: number;
  nama: string;
  jenis: string;
  sha256_tersimpan: string;
  sha256_storage: string | null;
  hash_cocok: boolean;
  tsa: { status: string; valid: boolean | null; gen_time: string | null; tsa: string | null; catatan: string | null };
  dkim: { dns_sekarang: string | null; snapshot: string | null; domain: string | null; catatan: string | null } | null;
  galat: string | null;
};

/** Verifikasi Ulang seluruh file sebuah entri: hash, token TSA, DKIM (DNS sekarang + snapshot). */
export async function verifikasiUlangEntri(s: SesiPedia, entriId: number): Promise<{ semua_cocok: boolean; file: HasilVerifFile[] }> {
  const { data: files } = await s.db.from("pedia_file").select("*").eq("entri_id", entriId).order("id");
  const hasil: HasilVerifFile[] = [];
  for (const f of files ?? []) {
    const h: HasilVerifFile = {
      file_id: f.id,
      nama: f.nama_asli,
      jenis: f.jenis,
      sha256_tersimpan: f.sha256,
      sha256_storage: null,
      hash_cocok: false,
      tsa: { status: f.tsa_status, valid: null, gen_time: f.tsa_gen_time, tsa: f.tsa_nama, catatan: null },
      dkim: null,
      galat: null,
    };
    try {
      const data = await unduhStorage(s.db, f.path);
      h.sha256_storage = sha256(data).toString("hex");
      h.hash_cocok = h.sha256_storage === f.sha256;
      if (f.tsa_status === "ok" && f.tsa_path) {
        try {
          const tsr = await unduhStorage(s.db, f.tsa_path);
          const info = await validasiRespons(tsr, data);
          h.tsa.valid = info.hashCocok && info.tandaTanganValid;
          h.tsa.gen_time = info.genTime;
          h.tsa.catatan = !info.hashCocok ? "hash di token TIDAK sama dgn file" : !info.tandaTanganValid ? "tanda tangan token tidak valid" : `ditandatangani ${info.penanda ?? "TSA"}`;
        } catch (e) {
          h.tsa.valid = false;
          h.tsa.catatan = e instanceof Error ? e.message : String(e);
        }
      } else h.tsa.catatan = "timestamp masih tertunda";
      if (f.jenis === "eml") {
        const tersimpan = f.dkim as HasilDkim | null;
        const waktu = new Date(f.dibuat_at);
        let sekarang: string | null = null;
        let snap: string | null = null;
        try {
          sekarang = (await verifikasiDkim(data, { waktu })).status;
        } catch (e) {
          sekarang = `galat: ${e instanceof Error ? e.message : e}`;
        }
        if (tersimpan?.snapshot_dns?.length) {
          try {
            snap = (await verifikasiDkim(data, { snapshot: tersimpan.snapshot_dns, waktu })).status;
          } catch (e) {
            snap = `galat: ${e instanceof Error ? e.message : e}`;
          }
        }
        h.dkim = {
          dns_sekarang: sekarang,
          snapshot: snap,
          domain: tersimpan?.domain ?? null,
          catatan:
            sekarang !== "pass" && snap === "pass"
              ? "Kunci DNS sekarang berbeda/tidak ada, tetapi tanda tangan VALID dengan kunci yang direkam saat unggah."
              : null,
        };
      }
    } catch (e) {
      h.galat = e instanceof Error ? e.message : String(e);
    }
    hasil.push(h);
  }
  const semua_cocok = hasil.length > 0 && hasil.every((h) => h.hash_cocok && h.tsa.valid !== false && !h.galat);
  await s.db.from("pedia_verifikasi").insert({ entri_id: entriId, oleh: s.nama, semua_cocok, hasil });
  await audit(s, "verifikasi_ulang", entriId, null, { semua_cocok, ringkas: hasil.map((h) => ({ id: h.file_id, hash: h.hash_cocok, tsa: h.tsa.valid, dkim: h.dkim?.snapshot ?? null })) });
  return { semua_cocok, file: hasil };
}
