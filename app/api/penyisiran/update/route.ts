// app/api/penyisiran/update/route.ts
//
// Simpan hasil checklist petugas lapangan (status kunjungan + catatan +
// info PPL/Jorong/Tetangga + prioritas_pasti) untuk satu keluarga. Butuh
// token sesi valid dgn role "penyisiran" (PIN admin, jarang dipakai
// langsung utk ini sekarang) ATAU "penyisiran_petugas" (login personal
// nama+tanggal lahir -- lihat /api/penyisiran/penyisiran-login, cara
// akses UTAMA tab Penyisiran Usaha sekarang).
//
// `petugas_id`/`petugas_nama` (opsional) dikirim client -- diambil dari
// respons login personal (subject token "penyisiran_petugas"), BUKAN
// dropdown manual lagi -- disimpan ke penyisiran_oleh_id/penyisiran_oleh
// supaya tab "Monitoring Petugas Penyisiran" bisa menghitung "Jumlah
// Dikunjungi"/"Jumlah Didata" per petugas. Kalau tidak dikirim (mis. masih
// pakai PIN admin lama tanpa login personal), kolom itu dibiarkan seperti
// semula (tidak ditimpa null) supaya atribusi kunjungan sebelumnya tidak
// hilang.
//
// KHUSUS akun PML (login "penyisiran_petugas" yg py >=1 PPL diawasi lewat
// pengawas_id, lihat lib/wilayahAlokasiPetugas.ts daftarIdUntukSesi()):
// HANYA prioritas_pasti (& SEKARANG jg tag_pml, lihat di bawah) yang
// BOLEH diubah lewat endpoint ini -- status_kunjungan/catatan_petugas/
// info_ppl/info_jorong/info_tetangga yg dikirim body TETAP divalidasi
// bentuknya (spy request lama/FE yg belum update ttp jalan tanpa 400)
// TAPI DIABAIKAN diam2, tidak pernah masuk ke `patch` & tidak pernah
// dicatat ke penyisiran_riwayat -- sesuai permintaan user "PML ... hanya
// bisa lihat dan bisa tandai pasti". Dicek dari SESI yang login
// (getSessionSubject), BUKAN dari petugas_id yg dikirim body (body bisa
// saja beda/dimanipulasi) -- defense in depth spt pola cek alokasi
// wilayah PPL di /api/penyisiran/identifikasi/route.ts.
//
// tag_pml ("🚩 Tandai Perlu Segera", permintaan user): KEBALIKAN dari
// pembatasan di atas -- field ini JUSTRU HANYA boleh ditulis PML (bukan
// PPL), krn tujuannya PML memberi tahu PPL bahwa satu keluarga perlu
// segera didata. Dicek dari SESI yang login jg (isPml), sama spt di
// atas. tag_pml_oleh/tag_pml_at diisi ULANG otomatis di server tiap kali
// ditandai true (BUKAN dikirim dari body) -- dikosongkan lagi begitu
// dibatalkan, pola sama dgn ditemukan_at.
//
// SEBELUM update, baris LAMA diambil dulu (status_kunjungan/info_ppl/
// info_jorong/info_tetangga) supaya field yang BENAR2 berubah nilainya
// bisa dicatat ke penyisiran_riwayat (audit log, dipakai panel "Riwayat
// Perubahan" di kartu) -- kalau petugas menekan Simpan tanpa mengubah
// apa pun (jarang terjadi krn tombol Simpan disabled saat !dirty di
// frontend, tapi tetap dijaga di sini), tidak ada baris riwayat baru yang
// dibuat sama sekali. Utk akun PML, bagian pencatatan riwayat ini otomatis
// tidak pernah terpicu (status/info tidak pernah ikut ditulis, lihat di
// atas).
//
// KUNCI "sehari setelah didata" (permintaan user): kartu berstatus
// "ditemukan" yg ditemukan_at-nya BUKAN LAGI hari ini (WIB) DITOLAK
// (423) kalau body TIDAK menyertakan edit_all=true -- pembatasan
// SEBENARNYA di sini (bukan cuma disable tombol di FE, lihat
// terkunciSetelahHariBerganti() & RowCard di app/seruti/penyisiran-usaha.tsx),
// `edit_all` dikirim client saat tombol melayang "🔒 Edit Semua Info
// Lapangan" (dipakai PML) sedang aktif -- SATU-SATUNYA jalan buka kunci
// ini (sesuai permintaan user, bukan terkunci permanen).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer, type PenyisiranRole } from "@/lib/penyisiranAuth";
import { daftarIdUntukSesi } from "@/lib/wilayahAlokasiPetugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "jadwalkan_besok" -- status BARU: petugas berencana kembali BESOK utk
// keluarga ini (dasar kuota "8 kunjungan/hari" & kartu "Dijadwalkan
// Besok" di FE, lihat tanggalBesokJakarta() & kolom tanggal_rencana_
// kunjungan di bawah). "tidak_ditemukan"/"tidak_bisa" TETAP diterima di
// sini (data lama & baris yg diedit ulang tanpa mengubah status itu harus
// tetap lolos validasi) -- cuma sudah tidak lagi DITAWARKAN di dropdown
// edit FE (lihat STATUS_PILIHAN di app/seruti/penyisiran-usaha.tsx).
const STATUS_VALID = new Set([
  "belum",
  "ditemukan",
  "tidak_ditemukan",
  "tidak_bisa",
  "sudah_didata_se2026",
  "jadwalkan_besok",
]);

// Tanggal BESOK menurut zona waktu Asia/Jakarta (WIB), format "YYYY-MM-DD"
// -- dihitung dari wall-clock Jakarta (UTC+7, tanpa DST), BUKAN dari zona
// waktu server (Railway biasanya UTC) supaya tidak meleset saat mendekati
// pergantian hari. Dipakai mengisi tanggal_rencana_kunjungan otomatis saat
// status diubah jadi "jadwalkan_besok" -- SAMA formula dgn filter tanggal
// di RPC penyisiran_summary()/penyisiran_summary_wilayah() (`(now() at
// time zone 'Asia/Jakarta')::date + 1`), supaya konsisten dgn hitungan
// kuota di kartu "Dijadwalkan Besok".
function tanggalBesokJakarta(): string {
  const jakartaMs = Date.now() + 7 * 60 * 60 * 1000;
  const jakarta = new Date(jakartaMs);
  jakarta.setUTCDate(jakarta.getUTCDate() + 1);
  return jakarta.toISOString().slice(0, 10);
}

export async function PATCH(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const role = (token?.split(".")[0] ?? "") as PenyisiranRole;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status_kunjungan === "string" ? body.status_kunjungan : "";
  const catatan = typeof body?.catatan_petugas === "string" ? body.catatan_petugas : null;
  const infoPpl = Boolean(body?.info_ppl);
  const infoJorong = Boolean(body?.info_jorong);
  const infoTetangga = Boolean(body?.info_tetangga);
  const prioritasPasti = Boolean(body?.prioritas_pasti);
  const tagPml = Boolean(body?.tag_pml);
  // Catatan opsional utk tag_pml (permintaan user "pada flag buka juga
  // tambah catatan") -- SAMA pembatasannya dgn tag_pml sendiri (isPml only,
  // lihat patch di bawah), null/"" dianggap "tidak ada catatan".
  const tagPmlCatatanRaw = typeof body?.tag_pml_catatan === "string" ? body.tag_pml_catatan.trim() : "";
  const tagPmlCatatan = tagPmlCatatanRaw || null;
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const petugasNama = typeof body?.petugas_nama === "string" && body.petugas_nama.trim() ? body.petugas_nama.trim() : null;
  const editAll = Boolean(body?.edit_all);

  if (!id || !STATUS_VALID.has(status)) {
    return NextResponse.json({ error: "Data tidak lengkap / status tidak valid." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // PML: cuma prioritas_pasti yg boleh ditulis -- lihat komentar panjang
  // di atas file ini. Dicek dari subjectId SESI (bukan body.petugas_id).
  let isPml = false;
  if (role === "penyisiran_petugas") {
    const subjectId = getSessionSubject(token);
    const sesiId = Number(subjectId);
    if (subjectId && Number.isFinite(sesiId) && sesiId > 0) {
      try {
        ({ isPml } = await daftarIdUntukSesi(supabase, sesiId));
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal memeriksa peran." }, { status: 500 });
      }
    }
  }

  const { data: lama, error: lamaErr } = await supabase
    .from("penyisiran_usaha")
    .select("status_kunjungan, info_ppl, info_jorong, info_tetangga, ditemukan_at, tag_pml")
    .eq("kode_identitas", id)
    .maybeSingle();
  if (lamaErr) return NextResponse.json({ error: lamaErr.message }, { status: 500 });

  // Kunci "sehari setelah didata" -- lihat komentar panjang di atas file
  // ini. Cuma berlaku utk kartu YANG SUDAH "ditemukan" DI HARI SEBELUMNYA
  // (bukan hari ini) -- dicek DARI DATA LAMA (bukan status yg baru dikirim
  // body), supaya tetap terkunci apa pun status baru yg dicoba dikirim
  // (termasuk kalau petugas coba "membetulkan" dgn mengganti ke status
  // lain). PML tidak kena aturan ini sama sekali (isPml sudah menolak
  // hampir semua field di atas duluan).
  if (!isPml && lama && lama.status_kunjungan === "ditemukan" && lama.ditemukan_at && !editAll) {
    const hariIniWib = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const hariDitemukanWib = new Date(new Date(lama.ditemukan_at).getTime() + 7 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    if (hariDitemukanWib !== hariIniWib) {
      return NextResponse.json(
        {
          error:
            "Kartu ini sudah terkunci (ditandai \"Usaha Ditemukan\" pada hari sebelumnya). Aktifkan tombol \"🔒 Edit Semua Info Lapangan\" kalau memang perlu dikoreksi.",
        },
        { status: 423 }
      );
    }
  }

  const patch: Record<string, unknown> = isPml
    ? {
        prioritas_pasti: prioritasPasti,
        // tag_pml_oleh/tag_pml_at: SELALU diisi ulang (bukan dari body)
        // tiap kali tag_pml disimpan sbg true -- dikosongkan lagi begitu
        // dibatalkan (klik ulang). Lihat komentar panjang di atas file.
        tag_pml: tagPml,
        tag_pml_oleh: tagPml ? petugasNama : null,
        tag_pml_at: tagPml ? new Date().toISOString() : null,
        // tag_pml_catatan: SAMA polanya dgn tag_pml_oleh/at -- dikosongkan
        // lagi begitu tanda dibatalkan (permintaan blm ada, tapi konsisten
        // dgn "catatan ini melekat ke tanda yg SEDANG aktif").
        tag_pml_catatan: tagPml ? tagPmlCatatan : null,
        updated_at: new Date().toISOString(),
      }
    : {
        status_kunjungan: status,
        catatan_petugas: catatan,
        info_ppl: infoPpl,
        info_jorong: infoJorong,
        info_tetangga: infoTetangga,
        prioritas_pasti: prioritasPasti,
        updated_at: new Date().toISOString(),
        // tanggal_rencana_kunjungan: diisi BESOK (WIB) tiap kali status
        // disimpan sbg "jadwalkan_besok" (termasuk simpan ulang ke status
        // yg sama -- dianggap menjadwalkan ulang ke "besok" yg baru), null
        // kan kalau status apa pun selain itu, supaya tidak nyangkut jadi
        // baris "basi" yg tetap ikut kehitung kuota. Lihat komentar
        // tanggalBesokJakarta() di atas.
        tanggal_rencana_kunjungan: status === "jadwalkan_besok" ? tanggalBesokJakarta() : null,
      };
  // ditemukan_at: HANYA diisi saat status BENAR2 BERUBAH MENJADI
  // "ditemukan" (bukan tiap simpan ulang) -- dasar hitungan "Usaha
  // Ditemukan Hari Ini" (StatTile, lihat migrasi
  // 20260920_penyisiran_jadwalkan_besok.sql). Kalau status berubah MENJADI
  // sesuatu SELAIN "ditemukan" (mis. petugas keliru lalu membetulkan),
  // dikosongkan lagi supaya tidak salah ikut kehitung "ditemukan hari
  // ini". Tidak disentuh sama sekali kalau statusnya TETAP "ditemukan"
  // (resave catatan/pasti dll) -- waktu "ditemukan" pertama kali tidak
  // boleh mundur cuma krn diedit ulang.
  if (!isPml && lama) {
    if (status === "ditemukan") {
      if (lama.status_kunjungan !== "ditemukan") patch.ditemukan_at = new Date().toISOString();
    } else {
      patch.ditemukan_at = null;
    }
  }
  if (petugasId && petugasNama) {
    patch.penyisiran_oleh_id = petugasId;
    patch.penyisiran_oleh = petugasNama;
  }

  const { error } = await supabase.from("penyisiran_usaha").update(patch).eq("kode_identitas", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Catat ke penyisiran_riwayat HANYA field yang nilainya BENAR2 berubah
  // dibanding sebelumnya -- lihat komentar di atas. Akun PML dilewati sama
  // sekali (isPml true) krn status/info tidak pernah ikut ditulis utk PML.
  if (lama && !isPml) {
    const entri: { jenis: string; nilai_lama: string | null; nilai_baru: string }[] = [];
    if (lama.status_kunjungan !== status) {
      entri.push({ jenis: "status_kunjungan", nilai_lama: lama.status_kunjungan, nilai_baru: status });
    }
    if (lama.info_ppl !== infoPpl) {
      entri.push({ jenis: "info_ppl", nilai_lama: String(lama.info_ppl), nilai_baru: String(infoPpl) });
    }
    if (lama.info_jorong !== infoJorong) {
      entri.push({ jenis: "info_jorong", nilai_lama: String(lama.info_jorong), nilai_baru: String(infoJorong) });
    }
    if (lama.info_tetangga !== infoTetangga) {
      entri.push({ jenis: "info_tetangga", nilai_lama: String(lama.info_tetangga), nilai_baru: String(infoTetangga) });
    }
    if (entri.length > 0) {
      await supabase.from("penyisiran_riwayat").insert(
        entri.map((e) => ({
          kode_identitas: id,
          jenis: e.jenis,
          nilai_lama: e.nilai_lama,
          nilai_baru: e.nilai_baru,
          oleh_nama: petugasNama,
          oleh_role: role || null,
        }))
      );
      // Kegagalan insert riwayat SENGAJA tidak digagalkan ke pengguna
      // (checklist utama sudah tersimpan) -- riwayat cuma pelengkap audit.
    }
  }

  // Riwayat khusus tag_pml -- KEBALIKAN dari blok di atas, cuma dicatat
  // utk akun PML (satu2nya yg boleh mengubah field ini, lihat komentar
  // panjang di atas file), supaya panel "🕘 Riwayat Perubahan" jg mencatat
  // siapa/kapan menandai atau membatalkan "🚩 Perlu Segera".
  if (lama && isPml && lama.tag_pml !== tagPml) {
    await supabase.from("penyisiran_riwayat").insert({
      kode_identitas: id,
      jenis: "tag_pml",
      nilai_lama: String(lama.tag_pml),
      nilai_baru: String(tagPml),
      oleh_nama: petugasNama,
      oleh_role: role || null,
    });
    // Kegagalan insert riwayat SENGAJA tidak digagalkan ke pengguna, sama
    // spt blok riwayat di atas.
  }

  return NextResponse.json({ ok: true });
}
