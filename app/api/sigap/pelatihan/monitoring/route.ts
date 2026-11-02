// app/api/sigap/pelatihan/monitoring/route.ts
//
// (2 Nov 2026) Tab Monitoring: progres menurut hierarki.
// Siapa melihat siapa: panitia -> semua; instruktur -> kelasnya; peserta (korwil/PML/PPL) -> dirinya + bawahan (lib/hierarkiPelatihan.ts).
// GET (Bearer sesi; ?kegiatan=ID) -> { kegiatan_id, jenis, ringkas, hierarki_tersedia, aturan_versi, baris:[{akun_id,nama,peran,kedalaman,diri,kelas,undangan,pretest,posttest,hadir,nilai_akhir?,kelulusan?}], ringkasan:{...,kelulusan?} }
// (2 Nov 2026) Aturan versi 2: skor pretest/posttest = nilai percobaan PERTAMA; nilai_akhir dan kelulusan (lulus bila > ambang) hanya FLAG untuk laporan.
// (2 Nov 2026) Tahap C: tiap baris membawa `materi` ({belum, manual} -- video / tautan WAJIB yang belum selesai, dan apakah ada yang ditandai manual); null bila kegiatan tidak punya materi wajib. ringkasan.materi_belum.
// (2 Nov 2026) Blokir tahapan: tiap baris membawa `kunci` ([{tahap, oleh_label, pesan}] -- hanya tes yang jendelanya sudah dibuka dan terhalang) dan `izin` ({pretest?, posttest?}: menunggu | disetujui | ditolak).
//   Tingkat atas: boleh_buka_kunci (panitia / instruktur), blokir_tahap, ringkasan.terkunci / ringkasan.izin_menunggu. Tombol "Buka kunci" memakai POST /api/sigap/pelatihan/izin-buka.

import { NextRequest, NextResponse } from "next/server";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";
import { izinAkun } from "@/lib/sigapAkses";
import { cakupanLihat, ringkasCakupan } from "@/lib/hierarkiPelatihan";
import { muatAturan } from "@/lib/sigapAturanDb";
import { hitungKelulusan, type StatusKelulusan } from "@/lib/sigapAturanTes";
import { muatNilaiAkhir } from "@/lib/sigapNilai";
import { muatProgres, muatSimpulHierarki, tentukanPengguna } from "@/lib/sigapPelatihanBaruDb";
import { hitungTahapan, kunciUntuk, ringkasIzin, type KodeTahap } from "@/lib/sigapTahapan";
import { muatStatusMateriBatch, type StatusMateriBatch } from "@/lib/sigapMateriDb";
import { muatIzin, muatTahapanBatch, type KeadaanTahapanBatch } from "@/lib/sigapTahapanDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    if (pengguna.jenis === "peserta" && !(await pesertaPelatihan(db, akun.id, kegiatanId))) return galat("Anda bukan peserta pelatihan ini.", 403);

    const { tersedia, simpul } = await muatSimpulHierarki(db, kegiatanId);
    const cakupan = cakupanLihat(pengguna, simpul);
    const progres = await muatProgres(db, kegiatanId, cakupan.map((b) => b.simpul.akun_id));
    const aturan = await muatAturan(db, kegiatanId);
    // aturan versi 2: nilai pertama + nilai akhir + kelulusan (tahan galat: bila gagal dihitung, kolom tambahan saja yang kosong)
    let nilai: Awaited<ReturnType<typeof muatNilaiAkhir>> | null = null;
    if (aturan.versi === 2) {
      try {
        nilai = await muatNilaiAkhir(db, kegiatanId, cakupan.map((b) => b.simpul.akun_id), aturan);
      } catch {
        nilai = null;
      }
    }
    // blokir tahapan + izin buka kunci (tahan galat: SQL belum dijalankan = tanpa kunci / izin)
    const idsCakupan = cakupan.map((b) => b.simpul.akun_id);
    const sekarangMs = Date.now();
    const izinBatch = await muatIzin(db, kegiatanId, idsCakupan, sekarangMs);
    let tahapBatch: KeadaanTahapanBatch | null = null;
    if (aturan.blokir_tahap) {
      try {
        tahapBatch = await muatTahapanBatch(db, kegiatanId, idsCakupan, sekarangMs, aturan);
      } catch {
        tahapBatch = null;
      }
    }
    // materi wajib (Tahap C): tahan galat; SQL belum dijalankan / tidak ada materi wajib -> kolom materi null
    let materiBatch: StatusMateriBatch | null = null;
    try {
      const m = await muatStatusMateriBatch(db, kegiatanId, idsCakupan);
      materiBatch = m.tersedia && m.wajib_total > 0 ? m : null;
    } catch {
      materiBatch = null;
    }
    const kunciBaris = (akunId: number): { kunci: { tahap: KodeTahap; oleh: KodeTahap; oleh_label: string; pesan: string }[]; izin: { pretest: string | null; posttest: string | null } } => {
      try {
        return kunciBarisAman(akunId);
      } catch {
        return { kunci: [], izin: { pretest: null, posttest: null } }; // Monitoring tidak boleh gagal hanya karena kunci tak terhitung
      }
    };
    const kunciBarisAman = (akunId: number) => {
      const barisIzin = izinBatch.peta.get(akunId) ?? [];
      const masukan = tahapBatch?.masukan.get(akunId);
      const hasil = masukan ? hitungTahapan(masukan, true, barisIzin, sekarangMs) : [];
      const kunci = (["pretest", "posttest"] as const)
        .map((jenis) => {
          const k = kunciUntuk(hasil, jenis);
          const tes = tahapBatch?.tes.find((t) => t.jenis === jenis);
          // relevan hanya bila tesnya sudah dibuka (atau sudah lewat): sebelum itu semua orang "terkunci" dan itu bukan masalah
          if (!k || !tes || new Date(tes.buka_at).getTime() > sekarangMs) return null;
          return { tahap: jenis as KodeTahap, oleh: k.oleh, oleh_label: k.oleh_label, pesan: k.pesan };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const status = (jenis: "pretest" | "posttest") => ringkasIzin(barisIzin, jenis, sekarangMs)?.status ?? null;
      return { kunci, izin: { pretest: status("pretest"), posttest: status("posttest") } };
    };
    const baris = cakupan.map((b) => {
      const p = progres.get(b.simpul.akun_id)!;
      const n = nilai?.per.get(b.simpul.akun_id);
      const pre = n && p.pretest.status === "selesai" ? { ...p.pretest, skor: n.pretest } : p.pretest;
      const post = n && p.posttest.status === "selesai" ? { ...p.posttest, skor: n.posttest } : p.posttest;
      const tambahan = n ? { nilai_akhir: n.akhir, kelulusan: (n.status_lulus ?? "belum_dinilai") as StatusKelulusan } : {};
      return { akun_id: b.simpul.akun_id, nama: b.simpul.nama, peran: b.simpul.peran, kedalaman: b.kedalaman, diri: b.diri, kelas: b.simpul.kelas, undangan: p.undangan, pretest: pre, posttest: post, hadir: p.hadir, materi: materiBatch ? { belum: materiBatch.belum.get(b.simpul.akun_id) ?? materiBatch.wajib_total, manual: materiBatch.manual.has(b.simpul.akun_id) } : null, ...kunciBaris(b.simpul.akun_id), ...tambahan };
    });
    const hitung = (f: (r: (typeof baris)[number]) => boolean) => baris.filter(f).length;
    return NextResponse.json({
      kegiatan_id: kegiatanId,
      jenis: pengguna.jenis,
      ringkas: ringkasCakupan(cakupan),
      hierarki_tersedia: tersedia,
      aturan_versi: aturan.versi,
      blokir_tahap: aturan.blokir_tahap,
      boleh_buka_kunci: pengguna.jenis !== "peserta",
      baris,
      ringkasan: {
        total: baris.length,
        undangan_terima: hitung((r) => r.undangan === "terima"),
        undangan_tolak: hitung((r) => r.undangan === "tolak"),
        pretest_selesai: hitung((r) => r.pretest.status === "selesai"),
        posttest_selesai: hitung((r) => r.posttest.status === "selesai"),
        hadir: hitung((r) => r.hadir),
        materi_wajib: materiBatch ? materiBatch.wajib_total : 0,
        materi_belum: hitung((r) => !!r.materi && r.materi.belum > 0),
        terkunci: hitung((r) => r.kunci.length > 0),
        izin_menunggu: hitung((r) => r.izin.pretest === "menunggu" || r.izin.posttest === "menunggu"),
        ...(nilai ? { kelulusan: hitungKelulusan(baris.map((r) => ("kelulusan" in r ? (r.kelulusan as StatusKelulusan) : "belum_dinilai"))) } : {}),
      },
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
