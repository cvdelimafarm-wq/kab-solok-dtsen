// lib/pedia/paket.ts
//
// (7 Okt 2026) SIGAP PEDIA -- "Paket Bukti" untuk Inspektorat -- permintaan user. Isi ZIP per entri:
//   bukti/<nama asli>            file asli byte-per-byte (TIDAK diubah)
//   bukti/<nama asli>.tsr        token timestamp RFC 3161 (respons TSA apa adanya)
//   manifest.json                metadata entri + daftar file, SHA-256, info TSA, hasil DKIM + snapshot DNS
//   berita-acara.pdf             lembar ringkasan siap cetak (kop BPS Kabupaten Solok)
//   CARA-VERIFIKASI.txt          langkah verifikasi mandiri (sha256sum, openssl ts -verify, DKIM)
//   sertifikat/                  sertifikat CA/TSA (dari token + akar publik DigiCert/Sectigo/FreeTSA)

import JSZip from "jszip";
import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { teksAman } from "@/lib/pdf/sigap/format";
import { KANAL, SIFAT, STATUS, BUCKET_PEDIA, slug, slugNomor, tanggalIndo, waktuWibPanjang, ukuranRapi } from "./umum";
import { validasiRespons } from "./tsa";
import { unduhStorage, type Db } from "./server";
import type { HasilDkim } from "./eml";

type Baris = Record<string, unknown> & { id: number };

export type DataPaket = {
  entri: Baris;
  kategori: { kode: string; nama: string; induk_kode: string | null; induk_nama: string | null };
  tag: string[];
  regulasi: { jenis: string; nomor: string; tahun: number; judul: string | null; status: string; pasal: string | null }[];
  tautan: { jenis: string; ref_id: number | null; ref_teks: string | null; label: string }[];
  file: Baris[];
  verifikasiTerakhir: { at: string; oleh: string | null; semua_cocok: boolean } | null;
  digantikanOleh: { id: number; nomor_registrasi: string } | null;
};

export async function muatDataPaket(db: Db, entriId: number): Promise<DataPaket | null> {
  const { data: e } = await db.from("pedia_entri").select("*").eq("id", entriId).maybeSingle();
  if (!e) return null;
  const [{ data: kat }, { data: tags }, { data: regs }, { data: taut }, { data: files }, { data: ver }, { data: ganti }] = await Promise.all([
    db.from("pedia_kategori").select("kode, nama, induk_id").eq("id", e.kategori_id).maybeSingle(),
    db.from("pedia_entri_tag").select("pedia_tag(nama)").eq("entri_id", entriId),
    db.from("pedia_entri_regulasi").select("pasal, pedia_regulasi(jenis, nomor, tahun, judul, status)").eq("entri_id", entriId),
    db.from("pedia_tautan").select("jenis, ref_id, ref_teks").eq("entri_id", entriId),
    db.from("pedia_file").select("*").eq("entri_id", entriId).order("id"),
    db.from("pedia_verifikasi").select("at, oleh, semua_cocok").eq("entri_id", entriId).order("id", { ascending: false }).limit(1),
    db.from("pedia_entri").select("id, nomor_registrasi").eq("menggantikan_id", entriId).limit(1),
  ]);
  let induk: { kode: string; nama: string } | null = null;
  if (kat?.induk_id) induk = (await db.from("pedia_kategori").select("kode, nama").eq("id", kat.induk_id).maybeSingle()).data;
  return {
    entri: e,
    kategori: { kode: kat?.kode ?? "?", nama: kat?.nama ?? "?", induk_kode: induk?.kode ?? null, induk_nama: induk?.nama ?? null },
    tag: (tags ?? []).map((t) => (t as unknown as { pedia_tag: { nama: string } }).pedia_tag?.nama).filter(Boolean),
    regulasi: (regs ?? []).map((r) => {
      const x = (r as unknown as { pedia_regulasi: { jenis: string; nomor: string; tahun: number; judul: string | null; status: string } }).pedia_regulasi;
      return { ...x, pasal: (r as { pasal: string | null }).pasal };
    }),
    tautan: (taut ?? []).map((t) => ({ ...(t as { jenis: string; ref_id: number | null; ref_teks: string | null }), label: `${t.jenis}${t.ref_id ? ` #${t.ref_id}` : ""}${t.ref_teks ? ` ${t.ref_teks}` : ""}` })),
    file: (files ?? []) as Baris[],
    verifikasiTerakhir: ver?.[0] ?? null,
    digantikanOleh: ganti?.[0] ?? null,
  };
}

// ---------------------------------------------------------------- berita acara (PDF)

async function logo(doc: PDFDocument) {
  try {
    const png = await fs.readFile(path.join(process.cwd(), "public", "logo-bps-hd.png"));
    return await doc.embedPng(png);
  } catch {
    return null;
  }
}

function bungkus(teks: string, font: PDFFont, ukuran: number, lebar: number): string[] {
  const out: string[] = [];
  for (const par of teksAman(teks).split(/\n/)) {
    let baris = "";
    for (const kata of par.split(/\s+/)) {
      const coba = baris ? `${baris} ${kata}` : kata;
      if (font.widthOfTextAtSize(coba, ukuran) > lebar && baris) {
        out.push(baris);
        baris = kata;
      } else baris = coba;
    }
    out.push(baris);
  }
  return out;
}

export async function beritaAcaraPdf(d: DataPaket, dicetakOleh: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Berita Acara Bukti Konsultasi ${d.entri.nomor_registrasi}`);
  doc.setAuthor("SIGAP PEDIA - BPS Kabupaten Solok");
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const fm = await doc.embedFont(StandardFonts.Courier);
  const lg = await logo(doc);
  const W = 595.28,
    H = 841.89,
    X = 50,
    L = W - 100;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - 50;
  const hitam = rgb(0.08, 0.12, 0.18),
    abu = rgb(0.35, 0.4, 0.45);

  const halamanBaru = () => {
    page = doc.addPage([W, H]);
    y = H - 50;
  };
  const tulis = (t: string, o: { font?: PDFFont; ukuran?: number; x?: number; lebar?: number; warna?: ReturnType<typeof rgb>; spasi?: number } = {}) => {
    const font = o.font ?? f,
      uk = o.ukuran ?? 9.5,
      x = o.x ?? X,
      lb = o.lebar ?? L;
    for (const b of bungkus(t, font, uk, lb)) {
      if (y < 60) halamanBaru();
      page.drawText(b, { x, y, size: uk, font, color: o.warna ?? hitam });
      y -= uk + (o.spasi ?? 3);
    }
  };
  const garis = () => {
    page.drawLine({ start: { x: X, y: y + 4 }, end: { x: W - X, y: y + 4 }, thickness: 0.6, color: rgb(0.8, 0.83, 0.87) });
    y -= 14;
  };
  const baris2 = (label: string, nilai: string) => {
    const y0 = y;
    page.drawText(teksAman(label), { x: X, y, size: 9, font: fb, color: abu });
    const b = bungkus(nilai || "-", f, 9.5, L - 150);
    for (const [i, t] of b.entries()) {
      if (y < 60) halamanBaru();
      page.drawText(t, { x: X + 150, y: i === 0 ? y0 : y, size: 9.5, font: f, color: hitam });
      y -= 12.5;
    }
  };

  // Kop
  if (lg) page.drawImage(lg, { x: X, y: y - 34, width: 44, height: (44 * lg.height) / lg.width });
  page.drawText("BADAN PUSAT STATISTIK", { x: X + 54, y: y - 12, size: 13, font: fb, color: rgb(0, 0.36, 0.62) });
  page.drawText("KABUPATEN SOLOK", { x: X + 54, y: y - 28, size: 13, font: fb, color: rgb(0, 0.36, 0.62) });
  y -= 50;
  garis();
  tulis("BERITA ACARA BUKTI KONSULTASI RESMI", { font: fb, ukuran: 13 });
  tulis(`SIGAP PEDIA - Nomor Registrasi ${d.entri.nomor_registrasi}`, { font: fb, ukuran: 10.5, warna: abu, spasi: 8 });

  const e = d.entri as Record<string, string | null>;
  baris2("Kategori", `${d.kategori.kode} ${d.kategori.nama}${d.kategori.induk_nama ? ` (${d.kategori.induk_kode} ${d.kategori.induk_nama})` : ""}`);
  baris2("Kanal", `${KANAL[e.kanal ?? ""] ?? e.kanal}${e.kanal_lain ? ` - ${e.kanal_lain}` : ""}`);
  baris2("Nomor tiket / surat", e.nomor_tiket ?? "-");
  baris2("Tanggal diajukan / dijawab", `${tanggalIndo(e.tgl_diajukan)} / ${tanggalIndo(e.tgl_dijawab)}`);
  baris2("Sifat jawaban", SIFAT[e.sifat ?? ""] ?? "-");
  baris2("Status", `${STATUS[e.status ?? ""]?.label ?? e.status}${e.perlu_ditinjau ? " - PERLU DITINJAU" : ""}${d.digantikanOleh ? ` - digantikan oleh ${d.digantikanOleh.nomor_registrasi}` : ""}`);
  baris2("Penanya / tim", `${e.penanya_nama ?? "-"}${e.tim ? ` / ${e.tim}` : ""}`);
  if (e.nota_dinas_srikandi || e.keputusan_ppk) baris2("Nota Dinas / Keputusan PPK", `${e.nota_dinas_srikandi ?? "-"} / ${e.keputusan_ppk ?? "-"}`);
  y -= 4;
  garis();
  tulis("Pertanyaan", { font: fb, ukuran: 10 });
  tulis(e.judul ?? "", { font: fb });
  tulis((e.pertanyaan ?? "-").slice(0, 1800), { spasi: 2.5 });
  y -= 4;
  tulis("Ringkasan jawaban", { font: fb, ukuran: 10 });
  tulis((e.jawaban ?? "-").slice(0, 2200), { spasi: 2.5 });
  y -= 4;
  tulis("Kesimpulan praktis", { font: fb, ukuran: 10 });
  tulis(e.kesimpulan ?? "-", { spasi: 2.5 });
  y -= 4;
  tulis("Dasar hukum", { font: fb, ukuran: 10 });
  if (!d.regulasi.length) tulis("-");
  for (const r of d.regulasi) tulis(`- ${r.jenis} ${r.nomor} (${r.tahun})${r.pasal ? ` ${r.pasal}` : ""}${r.judul ? ` - ${r.judul}` : ""} [${r.status}]`);
  y -= 4;
  garis();
  tulis("File bukti, hash SHA-256 & timestamp", { font: fb, ukuran: 10 });
  for (const fl of d.file) {
    const x = fl as Record<string, string | number | null>;
    const dk = fl.dkim as HasilDkim | null;
    tulis(`${x.nama_asli} (${x.jenis}, ${ukuranRapi(Number(x.ukuran))})`, { font: fb, ukuran: 9 });
    tulis(`SHA-256: ${x.sha256}`, { font: fm, ukuran: 7.5 });
    tulis(
      `Timestamp: ${x.tsa_status === "ok" ? `${x.tsa_nama} - ${waktuWibPanjang(String(x.tsa_gen_time))} (serial ${x.tsa_serial})` : "TERTUNDA"}${dk ? ` | DKIM: ${dk.status.toUpperCase()}${dk.domain ? ` d=${dk.domain}` : ""}${dk.selector ? ` s=${dk.selector}` : ""}` : ""}`,
      { ukuran: 8, warna: abu, spasi: 6 }
    );
  }
  y -= 2;
  garis();
  tulis(
    d.verifikasiTerakhir
      ? `Verifikasi ulang terakhir: ${waktuWibPanjang(d.verifikasiTerakhir.at)} oleh ${d.verifikasiTerakhir.oleh ?? "-"} - ${d.verifikasiTerakhir.semua_cocok ? "SEMUA COCOK" : "ADA YANG TIDAK COCOK"}`
      : "Verifikasi ulang: belum pernah dijalankan.",
    { font: fb, ukuran: 9 }
  );
  tulis(`Dicetak dari SIGAP PEDIA pada ${waktuWibPanjang(new Date().toISOString())} oleh ${dicetakOleh}. Keaslian file dapat diperiksa mandiri dengan langkah pada CARA-VERIFIKASI.txt di paket ini.`, {
    ukuran: 8,
    warna: abu,
  });
  return doc.save();
}

// ---------------------------------------------------------------- CARA-VERIFIKASI.txt

function caraVerifikasi(d: DataPaket, folder: string): string {
  const baris: string[] = [];
  baris.push(`CARA VERIFIKASI MANDIRI - SIGAP PEDIA ${d.entri.nomor_registrasi}`);
  baris.push("=".repeat(70));
  baris.push("Langkah berikut TIDAK memerlukan akses ke aplikasi SIGAP. Jalankan di folder paket ini.");
  baris.push("");
  baris.push("1) Cocokkan hash SHA-256 setiap file dengan manifest.json / berita-acara.pdf");
  baris.push("   Linux/macOS : sha256sum bukti/*      (macOS: shasum -a 256 bukti/*)");
  baris.push("   Windows     : certutil -hashfile \"bukti\\NAMA_FILE\" SHA256");
  baris.push("   Daftar hash yang tercatat:");
  for (const f of d.file) baris.push(`   ${f.sha256}  ${folder}/${f.nama_asli}`);
  baris.push("");
  baris.push("2) Periksa timestamp RFC 3161 (membuktikan file sudah ada & tidak berubah sejak waktu tsb)");
  baris.push("   Perintah umum (OpenSSL 1.1+ / 3.x):");
  baris.push("   openssl ts -reply -in bukti/FILE.tsr -text                 # lihat waktu, TSA, serial");
  baris.push("   openssl ts -verify -data bukti/FILE -in bukti/FILE.tsr -CAfile sertifikat/AKAR_TSA.pem -untrusted sertifikat/token_FILE.pem");
  baris.push("   Hasil yang diharapkan: \"Verification: OK\".");
  baris.push("   Akar CA per TSA: FreeTSA -> sertifikat/freetsa-cacert.pem ; DigiCert -> sertifikat/DigiCert_Trusted_Root_G4.pem ;");
  baris.push("   Sectigo -> sertifikat/USERTrust_RSA_Certification_Authority.pem (atau COMODO_RSA_Certification_Authority.pem).");
  baris.push("   Bila akar FreeTSA tidak ada di paket, unduh dari https://freetsa.org/files/cacert.pem");
  for (const f of d.file) {
    if (f.tsa_status !== "ok") {
      baris.push(`   - ${f.nama_asli}: timestamp TERTUNDA (tidak ada .tsr)`);
      continue;
    }
    const nama = `${folder}/${f.nama_asli}`;
    baris.push(`   - ${f.nama_asli} (${f.tsa_nama}, ${waktuWibPanjang(String(f.tsa_gen_time))}):`);
    baris.push(`     openssl ts -verify -data "${nama}" -in "${nama}.tsr" -CAfile "sertifikat/${f.tsa_nama === "FreeTSA" ? "freetsa-cacert.pem" : f.tsa_nama === "DigiCert" ? "DigiCert_Trusted_Root_G4.pem" : "USERTrust_RSA_Certification_Authority.pem"}" -untrusted "sertifikat/token_${slug(String(f.nama_asli))}.pem"`);
  }
  baris.push("");
  baris.push("3) Periksa tanda tangan DKIM email (.eml) - membuktikan email benar dikirim domain pengirim & tidak diubah");
  baris.push("   a. Node.js : npx mailauth report bukti/FILE.eml   (lihat bagian dkim -> status: pass)");
  baris.push("   b. Python  : pip install dkimpy ; dkimverify < bukti/FILE.eml");
  baris.push("   c. Thunderbird/Outlook: buka .eml lalu lihat header Authentication-Results / gunakan add-on DKIM Verifier.");
  baris.push("   Catatan: verifikasi DKIM memakai kunci publik DNS saat ini. Bila instansi sudah mengganti kuncinya,");
  baris.push("   hasil bisa 'fail/neutral' walau email asli. Kunci publik yang direkam SAAT UNGGAH ada di manifest.json");
  baris.push("   (file[].dkim.snapshot_dns) dan bisa dipakai dengan resolver kustom (contoh: mailauth dengan opsi resolver).");
  for (const f of d.file) {
    const dk = f.dkim as HasilDkim | null;
    if (dk) baris.push(`   - ${f.nama_asli}: DKIM saat unggah = ${dk.status.toUpperCase()} (d=${dk.domain ?? "-"}, s=${dk.selector ?? "-"}, ${waktuWibPanjang(dk.diverifikasi_at)})`);
  }
  baris.push("");
  baris.push("4) Rantai audit SIGAP PEDIA dapat diperiksa admin dengan SQL: select * from pedia_audit_cek_rantai(); (kosong = utuh)");
  baris.push("");
  baris.push(`Semua waktu ditampilkan dalam WIB (UTC+7). Paket dibuat ${waktuWibPanjang(new Date().toISOString())}.`);
  return baris.join("\r\n");
}

// ---------------------------------------------------------------- ZIP

async function akarFreeTsa(db: Db): Promise<Buffer | null> {
  const p = "ca/freetsa-cacert.pem";
  try {
    return await unduhStorage(db, p);
  } catch {
    /* belum tersimpan */
  }
  try {
    const r = await fetch("https://freetsa.org/files/cacert.pem", { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (!b.toString().includes("BEGIN CERTIFICATE")) return null;
    await db.storage.from(BUCKET_PEDIA).upload(p, b, { contentType: "application/x-pem-file", upsert: false });
    return b;
  } catch {
    return null;
  }
}

/** Tambahkan satu entri ke ZIP (di folder `akar`). */
export async function tambahKeZip(zip: JSZip, db: Db, d: DataPaket, akar: string, dicetakOleh: string) {
  const folder = akar ? `${akar}/bukti` : "bukti";
  const dir = akar ? zip.folder(akar)! : zip;
  const manifestFile: Record<string, unknown>[] = [];
  const dipakai = new Set<string>();
  for (const f of d.file) {
    let nama = String(f.nama_asli);
    for (let i = 2; dipakai.has(nama); i++) nama = String(f.nama_asli).replace(/(\.[^.]*)?$/, (m) => `_${i}${m}`);
    dipakai.add(nama);
    f.nama_asli = nama;
    const data = await unduhStorage(db, String(f.path));
    zip.file(`${folder}/${nama}`, data, { binary: true, compression: "STORE" });
    let tokenCert: string[] = [];
    if (f.tsa_status === "ok" && f.tsa_path) {
      const tsr = await unduhStorage(db, String(f.tsa_path));
      zip.file(`${folder}/${nama}.tsr`, tsr, { binary: true, compression: "STORE" });
      try {
        tokenCert = (await validasiRespons(tsr, data)).sertifikat;
        if (tokenCert.length) dir.file(`sertifikat/token_${slug(nama)}.pem`, tokenCert.join(""));
      } catch {
        /* tetap sertakan .tsr */
      }
    }
    manifestFile.push({
      nama,
      jenis: f.jenis,
      ukuran: f.ukuran,
      sha256: f.sha256,
      induk_file_id: f.induk_file_id,
      diunggah: { oleh: f.diunggah_oleh, at_utc: f.dibuat_at },
      timestamp: f.tsa_status === "ok" ? { tsa: f.tsa_nama, url: f.tsa_url, gen_time_utc: f.tsa_gen_time, serial: f.tsa_serial, file: `${nama}.tsr` } : { status: "tertunda" },
      email: f.email ?? null,
      dkim: f.dkim ?? null,
    });
  }
  const manifest = {
    dibuat_utc: new Date().toISOString(),
    aplikasi: "SIGAP PEDIA - BPS Kabupaten Solok",
    entri: {
      ...d.entri,
      kategori: d.kategori,
      tag: d.tag,
      dasar_hukum: d.regulasi,
      tautan: d.tautan,
      digantikan_oleh: d.digantikanOleh,
    },
    file: manifestFile,
    verifikasi_terakhir: d.verifikasiTerakhir,
  };
  dir.file("manifest.json", JSON.stringify(manifest, null, 2));
  dir.file("berita-acara.pdf", await beritaAcaraPdf(d, dicetakOleh));
  dir.file("CARA-VERIFIKASI.txt", caraVerifikasi(d, "bukti"));
  // akar CA
  const caDir = path.join(process.cwd(), "lib", "pedia", "ca");
  for (const n of await fs.readdir(caDir).catch(() => [] as string[])) if (n.endsWith(".pem")) dir.file(`sertifikat/${n}`, await fs.readFile(path.join(caDir, n)));
  const ft = await akarFreeTsa(db);
  if (ft) dir.file("sertifikat/freetsa-cacert.pem", ft);
}

export const namaZip = (nomor: string) => `PaketBukti_${slugNomor(nomor)}.zip`;
