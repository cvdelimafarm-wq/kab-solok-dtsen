// app/api/bencana/alokasi/impor/route.ts
//
// (4 Okt 2026) "Impor Plotting (Excel)": terapkan susunan plotting PPL (+ opsional
// atasan PML) dari file Excel sekaligus, sebagai pengganti klik dropdown satu per
// satu. File Excel di-parse di browser (lihat modal "Impor Plotting" di
// app/bencana/page.tsx); route ini menerima hasilnya sebagai JSON dan menerapkan
// ATURAN YANG SAMA dgn reassign/route.ts & susunan-tim/route.ts (PPL wajib mitra
// aktif, belum berperan PML/Korwil; atasan PPL wajib berperan PML; Sub SLS harus
// wilayah sampel).
//
// POST {
//   plotting: [{ idsubsls, ppl_id, porsi_kk? }],   // satu baris per (Sub SLS, PPL)
//   tim?:     [{ ppl_id, pml_id }],                // opsional: atasan tiap PPL
//   timpa:    boolean,                              // false = HANYA isi yg masih kosong
//   simulasi?: boolean,                             // true = pratinjau saja, tidak menulis apa pun
//   pin?: string                                    // wajib utk timpa=true & simulasi=false
// }
//
// Aturan mode:
//   timpa = false -> Sub SLS yg SUDAH punya plotting dilewati sama sekali; atasan
//                    PPL yg SUDAH terisi tidak diubah. Hanya yg kosong yg diisi.
//   timpa = true  -> Sub SLS yg ada di file diganti sesuai file (baris PPL lama utk
//                    Sub SLS itu dihapus); atasan PPL diganti sesuai file. Sub SLS
//                    yg TIDAK ada di file tidak disentuh. Aksi ini digerbangi PIN
//                    yg sama dgn "Reset Semua Plotting".
// Sub SLS dgn >1 baris di file = dipecah ke beberapa PPL, porsi_kk (jumlah KK
// langsung per PPL) WAJIB diisi (> 0) utk semua barisnya.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hitungJarakJalanMassal, haversineKm } from "@/lib/jarakJalan";
import { rpcSemua } from "@/lib/supabaseRpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sama dgn PIN_RESET di reset-semua/route.ts (cuma extra friction, bukan login).
const PIN_TIMPA = "1234";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

interface BarisPlot {
  idsubsls: string;
  ppl_id: number;
  porsi_kk: number | null;
}
interface BarisTim {
  ppl_id: number;
  pml_id: number;
}
interface PetugasRow {
  id: number;
  nama: string;
  peran: string | null;
  atasan_id: number | null;
  status_kepegawaian: string;
  aktif: boolean;
  lat: number | null;
  lng: number | null;
  lokasi_status: string;
}
interface AlokasiRow {
  id: number;
  idsubsls: string;
  ppl_id: number;
  jarak_km: number | null;
  jarak_metode: string | null;
  jarak_status: string | null;
  porsi_kk: number | null;
}
interface Masalah {
  baris: string;
  pesan: string;
}

function angka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const timpa = body?.timpa === true;
  const simulasi = body?.simulasi === true;
  if (timpa && !simulasi) {
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
    if (pin !== PIN_TIMPA) return NextResponse.json({ error: "PIN salah." }, { status: 403 });
  }

  const plotMentah: unknown[] = Array.isArray(body?.plotting) ? body.plotting : [];
  const timMentah: unknown[] = Array.isArray(body?.tim) ? body.tim : [];
  if (plotMentah.length === 0 && timMentah.length === 0) {
    return NextResponse.json({ error: "File tidak berisi baris plotting maupun susunan tim." }, { status: 400 });
  }
  if (plotMentah.length > 3000 || timMentah.length > 3000) {
    return NextResponse.json({ error: "Terlalu banyak baris (maks 3000)." }, { status: 400 });
  }

  try {
    const masalah: Masalah[] = [];
    const tambah = (baris: string, pesan: string): void => {
      masalah.push({ baris, pesan });
    };
    const dilewati: Masalah[] = [];

    // ---------- 1. Normalisasi baris
    const plot: BarisPlot[] = [];
    const lihat = new Set<string>();
    plotMentah.forEach((r, i) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const idsubsls = typeof o.idsubsls === "string" ? o.idsubsls.trim() : String(o.idsubsls ?? "").trim();
      const ppl_id = angka(o.ppl_id);
      const label = `Plotting baris ${i + 1}${idsubsls ? ` (${idsubsls})` : ""}`;
      if (!idsubsls) return tambah(label, "idsubsls kosong.");
      if (ppl_id == null || !Number.isInteger(ppl_id)) {
        return tambah(label, "ID PPL kosong / bukan angka.");
      }
      const kunci = `${idsubsls}|${ppl_id}`;
      if (lihat.has(kunci)) return tambah(label, "Duplikat (Sub SLS & PPL sama).");
      lihat.add(kunci);
      const porsi = angka(o.porsi_kk);
      plot.push({ idsubsls, ppl_id, porsi_kk: porsi != null && porsi > 0 ? porsi : null });
    });
    const tim: BarisTim[] = [];
    const lihatTim = new Set<number>();
    timMentah.forEach((r, i) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const ppl_id = angka(o.ppl_id);
      const pml_id = angka(o.pml_id);
      const label = `Tim baris ${i + 1}`;
      if (ppl_id == null || pml_id == null) return tambah(label, "ID PPL / ID PML kosong.");
      if (lihatTim.has(ppl_id)) return tambah(label, `PPL ${ppl_id} muncul lebih dari sekali.`);
      lihatTim.add(ppl_id);
      tim.push({ ppl_id, pml_id });
    });

    // ---------- 2. Muat data pembanding
    const idPetugas = Array.from(new Set([...plot.map((p) => p.ppl_id), ...tim.flatMap((t) => [t.ppl_id, t.pml_id])]));
    const petugasMap = new Map<number, PetugasRow>();
    for (let i = 0; i < idPetugas.length; i += 200) {
      const { data, error } = await supabase
        .from("bencana_petugas")
        .select("id, nama, peran, atasan_id, status_kepegawaian, aktif, lat, lng, lokasi_status")
        .in("id", idPetugas.slice(i, i + 200));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      (data ?? []).forEach((p) => petugasMap.set(p.id as number, p as PetugasRow));
    }

    const idsubslsFile = Array.from(new Set(plot.map((p) => p.idsubsls)));
    const sampelOk = new Set<string>();
    const alokasiAda = new Map<string, AlokasiRow[]>();
    for (let i = 0; i < idsubslsFile.length; i += 200) {
      const potong = idsubslsFile.slice(i, i + 200);
      const { data: sm, error: e1 } = await supabase
        .from("bencana_sampel_subsls")
        .select("idsubsls, termasuk_sampel")
        .in("idsubsls", potong);
      if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
      (sm ?? []).forEach((s) => s.termasuk_sampel && sampelOk.add(s.idsubsls as string));
      const { data: al, error: e2 } = await supabase
        .from("bencana_alokasi_subsls")
        .select("id, idsubsls, ppl_id, jarak_km, jarak_metode, jarak_status, porsi_kk")
        .in("idsubsls", potong);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      (al ?? []).forEach((a) => {
        const arr = alokasiAda.get(a.idsubsls as string) ?? [];
        arr.push(a as AlokasiRow);
        alokasiAda.set(a.idsubsls as string, arr);
      });
    }

    // ---------- 3. Peran di file (PML dari sheet Tim) -> cegah PPL merangkap PML
    const pmlDiFile = new Set(tim.map((t) => t.pml_id));
    const pmlSah = new Set<number>();
    pmlDiFile.forEach((id) => {
      const p = petugasMap.get(id);
      if (!p) return tambah(`PML ${id}`, "Petugas tidak ditemukan.");
      if (!p.aktif) return tambah(`PML ${p.nama}`, "Tidak aktif.");
      if (p.peran && p.peran !== "pml") {
        return tambah(`PML ${p.nama}`, `Sudah berperan ${p.peran}; tidak bisa jadi PML.`);
      }
      pmlSah.add(id);
    });

    const pplSah = (id: number): string | null => {
      const p = petugasMap.get(id);
      if (!p) return `Petugas ${id} tidak ditemukan.`;
      if (!p.aktif) return `${p.nama} tidak aktif.`;
      if (p.status_kepegawaian !== "mitra") return `${p.nama} bukan mitra (PPL wajib mitra).`;
      if (p.peran && p.peran !== "ppl") return `${p.nama} sudah berperan ${p.peran}.`;
      if (pmlDiFile.has(id)) return `${p.nama} ditetapkan sebagai PML di sheet Tim; tidak bisa jadi PPL.`;
      return null;
    };

    // ---------- 4. Keputusan per Sub SLS
    const perSub = new Map<string, BarisPlot[]>();
    plot.forEach((p) => perSub.set(p.idsubsls, [...(perSub.get(p.idsubsls) ?? []), p]));

    const ringkas = { baru: 0, ditimpa: 0, sama: 0, dilewati: 0, ditolak: 0 };
    const tulis: { idsubsls: string; baris: BarisPlot[]; hapusId: number[]; mode: "baru" | "timpa" }[] = [];

    perSub.forEach((baris, idsubsls) => {
      const label = `Sub SLS ${idsubsls}`;
      if (!sampelOk.has(idsubsls)) {
        ringkas.ditolak++;
        return tambah(label, "Bukan wilayah sampel (centang dulu di langkah 1).");
      }
      const salah = baris.map((b) => pplSah(b.ppl_id)).find((s) => s);
      if (salah) {
        ringkas.ditolak++;
        return tambah(label, salah);
      }
      if (baris.length > 1 && baris.some((b) => b.porsi_kk == null)) {
        ringkas.ditolak++;
        return tambah(label, "Dipecah ke >1 PPL tetapi porsi KK belum diisi.");
      }
      if (baris.length === 1) baris[0].porsi_kk = null;

      const ada = alokasiAda.get(idsubsls) ?? [];
      if (ada.length > 0 && !timpa) {
        ringkas.dilewati++;
        const nama = ada.map((a) => petugasMap.get(a.ppl_id)?.nama ?? `ID ${a.ppl_id}`).join(", ");
        dilewati.push({ baris: label, pesan: `Sudah terplot (${nama}); dilewati karena Timpa tidak dicentang.` });
        return;
      }
      if (ada.length > 0) {
        const sama =
          ada.length === baris.length &&
          baris.every((b) => ada.some((a) => a.ppl_id === b.ppl_id && (a.porsi_kk ?? null) === (b.porsi_kk ?? null)));
        if (sama) {
          ringkas.sama++;
          return;
        }
        const hapusId = ada.filter((a) => !baris.some((b) => b.ppl_id === a.ppl_id)).map((a) => a.id);
        ringkas.ditimpa++;
        tulis.push({ idsubsls, baris, hapusId, mode: "timpa" });
      } else {
        ringkas.baru++;
        tulis.push({ idsubsls, baris, hapusId: [], mode: "baru" });
      }
    });

    // ---------- 5. Atasan PPL
    const atasanTulis: { ppl_id: number; pml_id: number }[] = [];
    let atasanDilewati = 0;
    tim.forEach((t) => {
      const alasanPpl = pplSah(t.ppl_id);
      const p = petugasMap.get(t.ppl_id);
      if (alasanPpl) return tambah(`Tim PPL ${t.ppl_id}`, alasanPpl);
      if (!pmlSah.has(t.pml_id)) return; // alasan sudah dicatat di atas
      if (p && p.atasan_id === t.pml_id) return;
      if (p && p.atasan_id && !timpa) {
        atasanDilewati++;
        return;
      }
      atasanTulis.push(t);
    });
    const pmlBaru = Array.from(pmlSah).filter((id) => petugasMap.get(id)?.peran !== "pml");
    const pplDiTulis = new Set<number>();
    tulis.forEach((t) => t.baris.forEach((b) => pplDiTulis.add(b.ppl_id)));
    atasanTulis.forEach((t) => pplDiTulis.add(t.ppl_id));

    const ringkasan = {
      timpa,
      baris_plotting: plot.length,
      sub_sls_baru: ringkas.baru,
      sub_sls_ditimpa: ringkas.ditimpa,
      sub_sls_sudah_sama: ringkas.sama,
      sub_sls_dilewati: ringkas.dilewati,
      sub_sls_ditolak: ringkas.ditolak,
      pml_baru: pmlBaru.length,
      atasan_diset: atasanTulis.length,
      atasan_dilewati: atasanDilewati,
      baris_dihapus: tulis.reduce((n, t) => n + t.hapusId.length, 0),
    };

    if (simulasi) {
      return NextResponse.json({
        ok: true,
        simulasi: true,
        ringkasan,
        dilewati: dilewati.slice(0, 50),
        masalah: masalah.slice(0, 100),
        jumlah_dilewati: dilewati.length,
        jumlah_masalah: masalah.length,
      });
    }

    // ---------- 6. Tulis. PML dulu (supaya atasan PPL valid), lalu plotting, lalu atasan.
    if (pmlBaru.length > 0) {
      const { error } = await supabase.from("bencana_petugas").update({ peran: "pml" }).in("id", pmlBaru);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Jarak: sama dgn reassign/route.ts (OSRM kalau tersedia, kalau tidak haversine); hanya
    // utk pasangan (Sub SLS, PPL) yg baru / berganti PPL -- baris yg tidak berubah dipertahankan.
    const butuhJarak = new Map<number, string[]>();
    tulis.forEach((t) =>
      t.baris.forEach((b) => {
        const lama = (alokasiAda.get(t.idsubsls) ?? []).find((a) => a.ppl_id === b.ppl_id);
        if (!lama) butuhJarak.set(b.ppl_id, [...(butuhJarak.get(b.ppl_id) ?? []), t.idsubsls]);
      })
    );
    const jarakHasil = new Map<string, { jarak_km: number | null; jarak_metode: string | null; jarak_status: string }>();
    if (butuhJarak.size > 0) {
      const { data: titikRows } = await rpcSemua<{ idsubsls: string; lat: number | null; lng: number | null }>(
        supabase,
        "bencana_subsls_titik_jarak"
      );
      const titikMap = new Map((titikRows ?? []).map((t) => [t.idsubsls, t]));
      for (const [pplId, daftar] of butuhJarak) {
        const p = petugasMap.get(pplId);
        if (!p || p.lokasi_status !== "riil" || typeof p.lat !== "number" || typeof p.lng !== "number") continue;
        const valid = daftar.filter((id) => {
          const t = titikMap.get(id);
          return t && typeof t.lat === "number" && typeof t.lng === "number";
        });
        if (valid.length === 0) continue;
        const asal = { lat: p.lat, lng: p.lng };
        const tujuan = valid.map((id) => ({ lat: titikMap.get(id)!.lat as number, lng: titikMap.get(id)!.lng as number }));
        const osrm = await hitungJarakJalanMassal(asal, tujuan);
        valid.forEach((id, i) => {
          const km = osrm ? osrm[i] : haversineKm(asal.lat, asal.lng, tujuan[i].lat, tujuan[i].lng);
          jarakHasil.set(`${id}|${pplId}`, {
            jarak_km: Math.round(km * 100) / 100,
            jarak_metode: osrm ? "osrm" : "haversine_fallback",
            jarak_status: "riil",
          });
        });
      }
    }

    // PPL diberi peran 'ppl' sebelum baris ditugaskan (sama dgn reassign/route.ts)
    const butuhPeranPpl = Array.from(pplDiTulis).filter((id) => petugasMap.get(id)?.peran !== "ppl");
    if (butuhPeranPpl.length > 0) {
      const { error } = await supabase.from("bencana_petugas").update({ peran: "ppl" }).in("id", butuhPeranPpl);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const hapusSemua = tulis.flatMap((t) => t.hapusId);
    const pplKehilangan = new Set<number>();
    if (hapusSemua.length > 0) {
      tulis.forEach((t) =>
        (alokasiAda.get(t.idsubsls) ?? []).forEach((a) => t.hapusId.includes(a.id) && pplKehilangan.add(a.ppl_id))
      );
      for (let i = 0; i < hapusSemua.length; i += 200) {
        const { error } = await supabase.from("bencana_alokasi_subsls").delete().in("id", hapusSemua.slice(i, i + 200));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const upsertRows = tulis.flatMap((t) =>
      t.baris.map((b) => {
        const lama = (alokasiAda.get(t.idsubsls) ?? []).find((a) => a.ppl_id === b.ppl_id);
        const jr = jarakHasil.get(`${t.idsubsls}|${b.ppl_id}`);
        return {
          idsubsls: t.idsubsls,
          ppl_id: b.ppl_id,
          jarak_km: lama ? lama.jarak_km : jr?.jarak_km ?? null,
          jarak_metode: lama ? lama.jarak_metode : jr?.jarak_metode ?? null,
          jarak_status: lama ? lama.jarak_status ?? "tanpa_data" : jr?.jarak_status ?? "tanpa_data",
          terkunci: true,
          porsi_kk: b.porsi_kk,
        };
      })
    );
    for (let i = 0; i < upsertRows.length; i += 200) {
      const { error } = await supabase
        .from("bencana_alokasi_subsls")
        .upsert(upsertRows.slice(i, i + 200), { onConflict: "idsubsls,ppl_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // PPL yg kehilangan plot TERAKHIR dilepas perannya (sama dgn buka_kunci di reassign/route.ts)
    for (const id of pplKehilangan) {
      const { count } = await supabase.from("bencana_alokasi_subsls").select("id", { count: "exact", head: true }).eq("ppl_id", id);
      if (!count && petugasMap.get(id)?.peran === "ppl") {
        await supabase.from("bencana_petugas").update({ peran: null }).eq("id", id);
      }
    }

    // Atasan PPL, dikelompokkan per PML supaya sedikit query
    const perPml = new Map<number, number[]>();
    atasanTulis.forEach((t) => perPml.set(t.pml_id, [...(perPml.get(t.pml_id) ?? []), t.ppl_id]));
    for (const [pmlId, daftar] of perPml) {
      const { error } = await supabase.from("bencana_petugas").update({ atasan_id: pmlId }).in("id", daftar);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ringkasan,
      dilewati: dilewati.slice(0, 50),
      masalah: masalah.slice(0, 100),
      jumlah_dilewati: dilewati.length,
      jumlah_masalah: masalah.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
