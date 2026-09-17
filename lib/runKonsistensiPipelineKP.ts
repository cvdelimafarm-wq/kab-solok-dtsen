// lib/runKonsistensiPipelineKP.ts
//
// Evaluasi aturan konsistensi resmi BPS VSEN26.KP (lib/konsistensiRulesKP.ts,
// 3.280/3.339 aturan evaluable, dijalankan lewat interpreter
// lib/konsistensiEngine.ts) terhadap DATA HASIL ENTRI YANG SUDAH ADA (tabel
// t3-t12 + m1/m1b/m1c/mrt1/mrt2/mrt3 -- data DBF yang sama yang dipakai
// pipeline Anomali Cepat, lib/runAnomaliPipeline.ts).
//
// Beda dgn VSEN26.M (satu baris = satu ART, roster rapi), data KP berupa
// TABEL PANJANG per-komoditas (t3/t4/t5, satu baris = satu NOURUTKOMO,
// utk t4/187-225 malah BISA >1 baris per NOURUTKOMO per RT krn dicatat per
// ART yg mengonsumsi) + tabel rekap RT (t9/t10/t11/t12, satu baris per RT)
// + tabel rekap per-ART (t6/t7/t8). Supaya rule_expr yg SAMA (dari
// konsistensiEngine.ts, dipakai bareng dgn VSEN26.M) bisa jalan tanpa
// modifikasi, tiap "baris evaluasi" dibentuk sbg OBJEK DATAR yg field2-nya
// SUDAH diberi nama PERSIS spt nama field di rule_expr (lihat
// buildIdentityFieldMap) -- termasuk field "R{n}K{c}" hasil AGREGASI
// (dijumlahkan lintas baris ART per NOURUTKOMO) utk konteks level RT, dan
// field "KOR_..." hasil join ke data VSEN26.M rumah tangga yg sama.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbfRow } from './dbfParser';
import type { Tables } from './anomalyChecks';
import { parseRuleExpr, evaluateRule, collectFieldValues, type EvalCtx, type ParseResult, type FieldValueEntry } from './konsistensiEngine';
import { KONSISTENSI_FIELD_MAP } from './konsistensiFieldMap';
import {
  ROW_FIELD_RE,
  komoditasTableForRow,
  resolveKpStaticField,
  KP_TABLE_KEYS_RT_HEADER,
  KP_TABLE_KEYS_KOR,
} from './konsistensiFieldMapKP';
import { KONSISTENSI_RULES_KP, type KonsistensiRuleKP } from './konsistensiRulesKP';

export type KonsistensiFinding = {
  rule_id: number;
  field: string;
  kuesioner: string;
  nks: string;
  nurt: string;
  art_no: number | null;
  nama_krt: string | null;
  message: string;
  perlakuan: string;
  level: string;
  is_fatal: boolean;
  variabel: FieldValueEntry[]; // semua field & nilai yg dipakai evaluasi rule ini -- utk kartu "Data yang dianalisis"
};

function key(nks: unknown, nurt: unknown): string {
  return `${nks}|${nurt}`;
}
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

type ByKey<T> = Map<string, T[]>;
function groupByKey(rows: DbfRow[] | undefined): ByKey<DbfRow> {
  const m: ByKey<DbfRow> = new Map();
  for (const r of rows || []) {
    if (r.NKS == null || r.NURT == null) continue;
    const k = key(r.NKS, r.NURT);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

type Household = {
  nks: string;
  nurt: string;
  namaKrt: string | null;
  rtRow: DbfRow; // konteks level RT -- field header + rekap + R{n}Kc teragregasi + KOR_*
  t4Rows: DbfRow[]; // baris mentah utk evaluasi per-ART (dispatch 'art_t4', komoditas 187-225)
  t6Rows: DbfRow[]; // baris mentah utk evaluasi per-ART (dispatch 'art_t6', rekap B43 per ART)
  t7Rows: DbfRow[]; // baris mentah utk evaluasi per-ART (dispatch 'art_t7', B5A)
  t8Rows: DbfRow[]; // baris mentah utk evaluasi per-ART (dispatch 'art_t8', B5B)
};

/**
 * Bangun peta "identity" nama-field(RULE) -> nama-field(OBJEK BARIS DATAR)
 * dari seluruh field yg benar2 dipakai rule KP evaluable. Karena setiap
 * baris evaluasi (rtRow / baris t4 / t7 / t8) dibangun dgn key yg SUDAH
 * sama persis dgn nama field di rule_expr (lihat buildHouseholds &
 * buildArtRow), field map ini murni identity (token -> token) -- cukup
 * dihitung SEKALI di awal, bukan per rumah tangga.
 */
type ParsedRule = { rule: KonsistensiRuleKP; ast: Extract<ParseResult, { ok: true }> };

function buildIdentityFieldMap(parsedRules: ParsedRule[]): Map<string, string> {
  const names = new Set<string>();
  for (const { ast } of parsedRules) {
    for (const f of collectNamesFromAst(ast)) names.add(f.toUpperCase());
  }
  const m = new Map<string, string>();
  for (const n of names) m.set(n, n);
  return m;
}

function collectNamesFromAst(res: Extract<ParseResult, { ok: true }>): string[] {
  // ParseResult sukses menyimpan `fields` (lihat konsistensiEngine.ts).
  return (res as any).fields ?? [];
}

/**
 * Jumlahkan nilai numerik `col` pada seluruh baris (dipakai utk agregasi ART
 * -> RT). SENGAJA mengembalikan 0 (bukan NaN/undefined) kalau tidak ada satu
 * pun baris yg py isian numerik utk kolom ini -- krn ISNULL(x,0) di
 * konsistensiEngine.ts CUMA menganggap "blank" nilai null/undefined/string
 * kosong, BUKAN NaN (NaN dianggap "ada isian tapi bukan angka wajar", supaya
 * aturan lain yg justru mengecek NaN eksplisit tidak salah kaprah) -- kalau
 * fungsi ini mengembalikan NaN, ISNULL(...,0) tidak akan mendefaultkannya ke
 * 0, dan penjumlahan/pembandingan jadi NaN yg SELALU dianggap "tidak sama"
 * dgn angka apapun -> false-positive massal (persis begini dulu bugnya,
 * dikonfirmasi thd rule 28 rumah tangga NKS 00050|NURT 8 yg salah terdeteksi
 * padahal K6=K2+K4 sudah pas).
 */
function sumCol(rows: DbfRow[], col: string): number {
  let s = 0;
  for (const r of rows) {
    const n = toNum(r[col]);
    if (Number.isFinite(n)) s += n;
  }
  return s;
}

function buildHouseholds(tables: Partial<Tables>, parsedRules: ParsedRule[]): Household[] {
  const t3ByKey = groupByKey(tables.t3);
  const t4ByKey = groupByKey(tables.t4);
  const t5ByKey = groupByKey(tables.t5);
  const t6ByKey = groupByKey(tables.t6);
  const t7ByKey = groupByKey(tables.t7);
  const t8ByKey = groupByKey(tables.t8);
  const t9ByKey = groupByKey(tables.t9);
  const t10ByKey = groupByKey(tables.t10);
  const t11ByKey = groupByKey(tables.t11);
  const t12ByKey = groupByKey(tables.t12);
  const mrt1ByKey = groupByKey(tables.mrt1);
  const mrt2ByKey = groupByKey(tables.mrt2);
  const mrt3ByKey = groupByKey(tables.mrt3);

  const kpColumns = new Set<string>();
  for (const t of KP_TABLE_KEYS_RT_HEADER) for (const r of tables[t] || []) for (const c of Object.keys(r)) kpColumns.add(c.toUpperCase());
  const korColumns = new Set<string>();
  for (const t of KP_TABLE_KEYS_KOR) for (const r of tables[t] || []) for (const c of Object.keys(r)) korColumns.add(c.toUpperCase());

  const allKeys = new Set<string>([
    ...t3ByKey.keys(), ...t4ByKey.keys(), ...t5ByKey.keys(),
    ...t6ByKey.keys(), ...t7ByKey.keys(), ...t8ByKey.keys(),
    ...t9ByKey.keys(), ...t10ByKey.keys(), ...t11ByKey.keys(), ...t12ByKey.keys(),
  ]);

  // Field2 non-baris ("R{n}K{c}") yg BENAR2 dipakai rule evaluable -- dihitung
  // sekali supaya tidak perlu resolve utk seluruh kolom yg mungkin ada.
  const staticFieldTokens = new Set<string>();
  const rowFieldTokens: { n: number; c: string; token: string }[] = [];
  for (const { ast } of parsedRules) {
    for (const f of collectNamesFromAst(ast)) {
      const fu = f.toUpperCase();
      const m = ROW_FIELD_RE.exec(fu);
      if (m) rowFieldTokens.push({ n: parseInt(m[1], 10), c: m[2], token: fu });
      else staticFieldTokens.add(fu);
    }
  }

  const households: Household[] = [];
  for (const hhKey of allKeys) {
    const sep = hhKey.indexOf('|');
    const nks = hhKey.slice(0, sep);
    const nurt = hhKey.slice(sep + 1);

    const t3Rows = t3ByKey.get(hhKey) || [];
    const t4Rows = t4ByKey.get(hhKey) || [];
    const t5Rows = t5ByKey.get(hhKey) || [];
    const t6Rows = t6ByKey.get(hhKey) || [];
    const t7Rows = t7ByKey.get(hhKey) || [];
    const t8Rows = t8ByKey.get(hhKey) || [];
    const t9Row = (t9ByKey.get(hhKey) || [])[0];
    const t10Row = (t10ByKey.get(hhKey) || [])[0];
    const t11Row = (t11ByKey.get(hhKey) || [])[0];
    const t12Row = (t12ByKey.get(hhKey) || [])[0];
    const mrt1Row = (mrt1ByKey.get(hhKey) || [])[0];
    const mrt2Row = (mrt2ByKey.get(hhKey) || [])[0];
    const mrt3Row = (mrt3ByKey.get(hhKey) || [])[0];

    // Basis field header + rekap RT-level (identity match langsung).
    const rtBase: DbfRow = { ...(t9Row || {}), ...(t10Row || {}), ...(t11Row || {}), ...(t12Row || {}) };
    const korBase: DbfRow = { ...(mrt1Row || {}), ...(mrt2Row || {}), ...(mrt3Row || {}) };

    const rtRow: DbfRow = { ...rtBase };

    // Field "R{n}K{c}" teragregasi (dijumlahkan lintas baris ART per NOURUTKOMO
    // -- utk t3/t5 yg cuma py 1 baris per NOURUTKOMO per RT, hasilnya sama
    // dgn nilai baris itu sendiri).
    const byNourut = new Map<number, DbfRow[]>();
    for (const r of [...t3Rows, ...t4Rows, ...t5Rows]) {
      const n = toNum(r.NOURUTKOMO);
      if (!Number.isFinite(n)) continue;
      if (!byNourut.has(n)) byNourut.set(n, []);
      byNourut.get(n)!.push(r);
    }
    for (const { n, c, token } of rowFieldTokens) {
      const rows = byNourut.get(n);
      if (!rows) continue;
      rtRow[token] = sumCol(rows, 'KOLOM' + c);
    }

    // Field statis (B4xx/B5x/B6/B7/JmlkomoditasN/header) + alias "MB4xx"/
    // "MB5xK" hasil agregasi lintas baris ART-detail (t6/t7/t8).
    const t6SumCache = new Map<string, number>();
    const t7SumCache = new Map<string, number>();
    const t8SumCache = new Map<string, number>();
    for (const tok of staticFieldTokens) {
      if (tok.startsWith('KOR_')) {
        const rest = tok.slice(4);
        const mapped = KONSISTENSI_FIELD_MAP[rest] ?? KONSISTENSI_FIELD_MAP[rest.replace(/^R/, 'M')];
        if (mapped !== undefined && korBase[mapped] !== undefined) rtRow[tok] = korBase[mapped];
        else if (korBase[rest] !== undefined) rtRow[tok] = korBase[rest];
        continue;
      }
      const r = resolveKpStaticField(tok, kpColumns, korColumns);
      if (!r.ok) continue;
      if (r.kpColumn) {
        if (rtBase[r.kpColumn] !== undefined) {
          rtRow[tok] = rtBase[r.kpColumn];
        } else {
          // Bukan di tabel rekap RT -- kemungkinan field ART-detail (B431K*/
          // B5AK*/B5BK* mentah tanpa prefix M, atau dgn prefix M dari
          // resolver) yg perlu DIJUMLAHKAN lintas t6/t7/t8.
          const col = r.kpColumn;
          if (col.startsWith('B431') || /^B431K\d/.test(col)) {
            if (!t6SumCache.has(col)) t6SumCache.set(col, sumCol(t6Rows, col));
            rtRow[tok] = t6SumCache.get(col);
          } else if (col.startsWith('B5A')) {
            if (!t7SumCache.has(col)) t7SumCache.set(col, sumCol(t7Rows, col));
            rtRow[tok] = t7SumCache.get(col);
          } else if (col.startsWith('B5B') || col.startsWith('MB5B')) {
            if (!t8SumCache.has(col)) t8SumCache.set(col, sumCol(t8Rows, col));
            rtRow[tok] = t8SumCache.get(col);
          }
        }
      } else if (r.korField && korBase[r.korField] !== undefined) {
        rtRow[tok] = korBase[r.korField];
      }
    }

    const namaKrt = (rtBase.NAMAKRT as string) ?? (korBase.NAMAKRT as string) ?? null;

    households.push({ nks, nurt, namaKrt, rtRow, t4Rows, t6Rows, t7Rows, t8Rows });
  }
  return households;
}

/**
 * Bentuk baris evaluasi utk SATU baris mentah level ART (t4/t6/t7/t8): mulai
 * dari konteks rumah tangga (rtRow -- supaya field KOR_ dan R301 dll tetap
 * terbaca), lalu TIMPA dgn field milik baris itu sendiri (nilai MENTAH,
 * tidak dijumlahkan) -- utk t4, field "R{n}K{c}" dgn n = NOURUTKOMO baris
 * ini; utk t6/t7/t8, field "MB431K{c}"/"MB5AK{c}"/"MB5BK{c}" (identity/alias
 * M-strip) diambil langsung dari kolom asli baris itu.
 */
function buildArtRow(hh: Household, raw: DbfRow, kind: 't4' | 't6' | 't7' | 't8'): DbfRow {
  // PENTING (soal memori/OOM): dulu row dibentuk dgn SPREAD PENUH
  // `{ ...hh.rtRow, ...raw }` -- SELURUH field hh.rtRow (bisa ratusan key
  // hasil agregasi seluruh rule KP) DISALIN ULANG utk SETIAP baris ART
  // (t4/t6/t7/t8), padahal jumlah baris ART per upload bisa ribuan (tiap
  // NOURUTKOMO x tiap ART x tiap rumah tangga). Dlm loop sinkron tanpa jeda
  // ini bisa bikin heap V8 melonjak sangat cepat (lebih cepat dari sampling
  // grafik Metrics Railway) sampai kena OOM killer walau limit 1GB blm
  // kelihatan penuh di grafik. Object.create(hh.rtRow) bikin row BARU yg
  // "mewarisi" field hh.rtRow lewat prototype chain (BUKAN disalin) --
  // pembacaan row[col] di konsistensiEngine.ts tetap berlaku SAMA PERSIS spt
  // spread (field baris ini sendiri menutupi field warisan RT), tapi hh.rtRow
  // tetap SATU objek yg dipakai bersama oleh semua baris ART, bukan digandakan.
  const row: DbfRow = Object.create(hh.rtRow);
  for (const c of Object.keys(raw)) row[c] = raw[c];
  if (kind === 't4') {
    const n = toNum(raw.NOURUTKOMO);
    if (Number.isFinite(n)) {
      for (const c of Object.keys(raw)) {
        const cm = /^KOLOM(\d+[A-Z]?)$/.exec(c);
        if (cm) row[`R${n}K${cm[1]}`] = raw[c];
      }
    }
  } else {
    // t6 (B43 ART) / t7 (B5A) / t8 (B5B): tulis field dgn KEDUA bentuk (apa
    // adanya & dgn prefix "M") supaya token rule_expr manapun ("B431K3"
    // ataupun "MB431K3", "B5AK5" ataupun "MB5AK5") ketemu -- lihat catatan
    // resolveKpStaticField ttg t8.MB5BK2 vs t7.B5AK2 yg formatnya tidak
    // seragam di database asli.
    // TANPA akhiran huruf ("...J") -- itu penanda field rekap RT (t10), bukan
    // per-ART (lihat catatan sama di finalize-kp.ts RE_B5A_ART/RE_B5B_ART).
    const pat = kind === 't6' ? /^M?B431K\d+$/ : /^M?B5[AB]K\d+$/;
    for (const c of Object.keys(raw)) {
      if (pat.test(c)) {
        row[c] = raw[c];
        row[c.startsWith('M') ? c.slice(1) : 'M' + c] = raw[c];
      }
    }
  }
  return row;
}

/** Jalankan semua aturan KP yang evaluable terhadap data hasil entri, kembalikan daftar temuan mentah. */
export function evaluateKonsistensiKP(tables: Partial<Tables>): KonsistensiFinding[] {
  // Parse SEMUA rule_expr evaluable SEKALI SAJA di sini, lalu hasilnya dipakai
  // ulang oleh buildIdentityFieldMap & buildHouseholds (sebelumnya rule_expr
  // yg SAMA di-parse 3x terpisah per upload -- triple alokasi AST utk 3.280
  // rule sekaligus, ikut andil bikin beban CPU & memori proses Node.js
  // melonjak & ter-OOM di Railway saat data yg diupload besar).
  const parsed: ParsedRule[] = [];
  for (const rule of KONSISTENSI_RULES_KP) {
    if (!rule.evaluable) continue;
    const res = parseRuleExpr(rule.rule_expr);
    if (res.ok) parsed.push({ rule, ast: res });
  }

  const households = buildHouseholds(tables, parsed);
  const fieldMap = buildIdentityFieldMap(parsed);

  // Log diagnostik SEMENTARA (17/9, lihat catatan logMem di route.ts) --
  // supaya kelihatan di Railway logs berapa banyak rumah tangga & baris ART
  // yg diproses (faktor pengali utama beban memori/CPU tahap ini), plus RSS
  // proses di titik ini.
  {
    const totalArtRows = households.reduce(
      (s, hh) => s + hh.t4Rows.length + hh.t6Rows.length + hh.t7Rows.length + hh.t8Rows.length,
      0
    );
    const mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(
      `[MEM] evaluateKonsistensiKP: ${parsed.length} aturan, ${households.length} rumah tangga, ${totalArtRows} baris ART total, RSS ${mb} MB`
    );
  }

  // Dispatch murni dari rule.dispatch (dihitung dari `field`, lihat
  // konsistensiRulesKP.ts) -- BUKAN dari `level`, yg ternyata tidak selalu
  // konsisten dgn tabel yg relevan (mis. rule 3129 field="MB431K3"
  // level="ART" -- padahal sama sekali tidak berhubungan dgn tabel t4).
  const householdRules = parsed.filter((p) => p.rule.dispatch === 'rt');
  const artT4Rules = parsed.filter((p) => p.rule.dispatch === 'art_t4');
  const artT6Rules = parsed.filter((p) => p.rule.dispatch === 'art_t6');
  const artB5ARules = parsed.filter((p) => p.rule.dispatch === 'art_t7');
  const artB5BRules = parsed.filter((p) => p.rule.dispatch === 'art_t8');

  const findings: KonsistensiFinding[] = [];
  const push = (
    rule: KonsistensiRuleKP,
    hh: Household,
    artNo: number | null,
    ast: Parameters<typeof collectFieldValues>[0],
    ctx: EvalCtx
  ) => {
    findings.push({
      rule_id: rule.rule_id,
      field: rule.field,
      kuesioner: 'KP',
      nks: hh.nks,
      nurt: hh.nurt,
      art_no: artNo,
      nama_krt: hh.namaKrt,
      message: rule.message,
      perlakuan: rule.perlakuan,
      level: rule.level,
      is_fatal: rule.is_fatal,
      variabel: collectFieldValues(ast, ctx),
    });
  };

  let hhIndex = 0;
  for (const hh of households) {
    hhIndex++;
    // Log diagnostik SEMENTARA tiap 100 rumah tangga -- kalau proses mati
    // (OOM) di tengah loop ini, baris [MEM] TERAKHIR yg sempat tercatat di
    // Railway logs menunjukkan kira-kira di rumah tangga ke berapa itu terjadi.
    if (hhIndex === 1 || hhIndex % 100 === 0) {
      const mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
      console.log(`[MEM]   rumah tangga ke-${hhIndex}/${households.length}, temuan sejauh ini ${findings.length}, RSS ${mb} MB`);
    }
    const ctxRt: EvalCtx = { row: hh.rtRow, roster: [hh.rtRow], rowIndex: 0, fieldMap, artNoColumn: null };
    for (const { rule, ast } of householdRules) {
      if (evaluateRule(ast.ast, ctxRt)) push(rule, hh, null, ast.ast, ctxRt);
    }

    for (const raw of hh.t4Rows) {
      const row = buildArtRow(hh, raw, 't4');
      const ctx: EvalCtx = { row, roster: [row], rowIndex: 0, fieldMap, artNoColumn: null };
      const artNo = Number.isFinite(toNum(raw.R401)) ? toNum(raw.R401) : null;
      for (const { rule, ast } of artT4Rules) {
        if (evaluateRule(ast.ast, ctx)) push(rule, hh, artNo, ast.ast, ctx);
      }
    }
    for (const raw of hh.t6Rows) {
      const row = buildArtRow(hh, raw, 't6');
      const ctx: EvalCtx = { row, roster: [row], rowIndex: 0, fieldMap, artNoColumn: null };
      const artNo = Number.isFinite(toNum(raw.R401)) ? toNum(raw.R401) : null;
      for (const { rule, ast } of artT6Rules) {
        if (evaluateRule(ast.ast, ctx)) push(rule, hh, artNo, ast.ast, ctx);
      }
    }
    for (const raw of hh.t7Rows) {
      const row = buildArtRow(hh, raw, 't7');
      const ctx: EvalCtx = { row, roster: [row], rowIndex: 0, fieldMap, artNoColumn: null };
      const artNo = Number.isFinite(toNum(raw.R401)) ? toNum(raw.R401) : null;
      for (const { rule, ast } of artB5ARules) {
        if (evaluateRule(ast.ast, ctx)) push(rule, hh, artNo, ast.ast, ctx);
      }
    }
    for (const raw of hh.t8Rows) {
      const row = buildArtRow(hh, raw, 't8');
      const ctx: EvalCtx = { row, roster: [row], rowIndex: 0, fieldMap, artNoColumn: null };
      const artNo = Number.isFinite(toNum(raw.R401)) ? toNum(raw.R401) : null;
      for (const { rule, ast } of artB5BRules) {
        if (evaluateRule(ast.ast, ctx)) push(rule, hh, artNo, ast.ast, ctx);
      }
    }
  }

  return findings;
}

/**
 * Jalankan evaluasi lalu simpan hasilnya lewat RPC kp_konsistensi_upsert_batch
 * (pola sama dgn runKonsistensiPipeline.ts VSEN26.M) -- p_upload_id dipakai
 * BERSAMA dgn kp_anomali_upload (baris upload yg sama dgn Anomali Cepat)
 * supaya raw_data tidak disimpan dua kali.
 */
export async function runKonsistensiPipelineKP(
  supabase: SupabaseClient,
  tables: Partial<Tables>,
  uploadId: number
) {
  const findings = evaluateKonsistensiKP(tables);

  const payload = findings.map((f) => ({
    rule_id: f.rule_id,
    field: f.field,
    kuesioner: f.kuesioner,
    nks: f.nks,
    nurt: f.nurt,
    art_no: f.art_no,
    nama_krt: f.nama_krt,
    message: f.message,
    perlakuan: f.perlakuan,
    level: f.level,
    is_fatal: f.is_fatal,
    variabel: f.variabel,
  }));

  // p_kuesioner WAJIB 'KP' -- lihat catatan sama di runKonsistensiPipeline.ts
  // (VSEN26.M) ttg migrasi fix_kp_konsistensi_natural_key_scope_by_kuesioner.
  const { data: upsertResult, error: upsertErr } = await supabase
    .rpc('kp_konsistensi_upsert_batch', { p_upload_id: uploadId, p_findings: payload, p_kuesioner: 'KP' })
    .single();
  if (upsertErr) throw upsertErr;

  return {
    totalTemuan: findings.length,
    ringkasan: upsertResult as { baru: number; tetap: number; selesai: number },
  };
}
