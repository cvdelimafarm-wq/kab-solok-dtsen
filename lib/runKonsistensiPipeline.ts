// lib/runKonsistensiPipeline.ts
//
// Evaluasi aturan konsistensi resmi BPS VSEN26.M (lib/konsistensiRulesM.ts,
// dijalankan lewat interpreter lib/konsistensiEngine.ts) terhadap DATA HASIL
// ENTRI YANG SUDAH ADA (tabel m1/mrt1/mrt2 — data DBF yang sama yang dipakai
// pipeline Anomali Cepat, lib/runAnomaliPipeline.ts). Beda dengan Anomali
// Cepat (heuristik kewajaran buatan sendiri), ini adalah 932 dari 1.018
// aturan konsistensi RESMI BPS (field yang datanya tidak terekam di aplikasi
// ini dilewati — lihat lib/konsistensiRulesM.ts).
//
// Setiap temuan terikat identitas jelas: NKS + nomor urut sampel (NURT) +
// nomor urut ART (utk aturan level ART/BALITA — dihitung dari urutan entri
// ART dalam rumah tangga, KARENA tidak ada kolom "nomor urut ART" eksplisit
// di data hasil entri; lihat ART_NO_COL). PPL nantinya HANYA melihat temuan
// utk NKS yang jadi tanggung jawabnya (dicocokkan lewat kp_nks_jorong).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbfRow } from './dbfParser';
import type { Tables } from './anomalyChecks';
import { parseRuleExpr, evaluateRule, type EvalCtx, type ParseResult } from './konsistensiEngine';
import { KONSISTENSI_FIELD_MAP } from './konsistensiFieldMap';
import { KONSISTENSI_RULES_M, type KonsistensiRuleM } from './konsistensiRulesM';

// Kolom sintetis (bukan dari DBF) — nomor urut ART dalam rumah tangga,
// dihitung dari urutan ROWNUMBER (urutan asli entri di aplikasi desktop,
// yg dikonfirmasi lewat data riil selalu naik sesuai urutan Blok 4 / roster
// ART: 1=KRT, dst).
const ART_NO_COL = '__ART_NO__';

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
};

type Household = {
  nks: string;
  nurt: string;
  namaKrt: string | null;
  roster: DbfRow[]; // baris m1 (digabung field RT) terurut sesuai ROWNUMBER, tiap baris punya ART_NO_COL
  householdRow: DbfRow; // baris gabungan mrt1+mrt2 (+ fallback ART pertama), dipakai utk aturan level RT
};

function buildHouseholds(tables: Partial<Tables>): Household[] {
  const m1 = (tables.m1 || []) as DbfRow[];
  const mrt1 = (tables.mrt1 || []) as DbfRow[];
  const mrt2 = (tables.mrt2 || []) as DbfRow[];

  const mrt1ByKey = new Map<string, DbfRow>();
  for (const r of mrt1) {
    if (r.NKS == null || r.NURT == null) continue;
    mrt1ByKey.set(`${r.NKS}|${r.NURT}`, r);
  }
  const mrt2ByKey = new Map<string, DbfRow>();
  for (const r of mrt2) {
    if (r.NKS == null || r.NURT == null) continue;
    mrt2ByKey.set(`${r.NKS}|${r.NURT}`, r);
  }

  const m1ByKey = new Map<string, DbfRow[]>();
  for (const r of m1) {
    if (r.NKS == null || r.NURT == null) continue;
    const key = `${r.NKS}|${r.NURT}`;
    if (!m1ByKey.has(key)) m1ByKey.set(key, []);
    m1ByKey.get(key)!.push(r);
  }

  const allKeys = new Set<string>([...m1ByKey.keys(), ...mrt1ByKey.keys(), ...mrt2ByKey.keys()]);

  const households: Household[] = [];
  for (const key of allKeys) {
    const sep = key.indexOf('|');
    const nks = key.slice(0, sep);
    const nurt = key.slice(sep + 1);

    const rt1 = mrt1ByKey.get(key);
    const rt2 = mrt2ByKey.get(key);
    const householdBase: DbfRow = { ...(rt1 || {}), ...(rt2 || {}) };

    const rows = m1ByKey.get(key) || [];
    const sorted = [...rows].sort((a, b) => {
      const an = Number(a.ROWNUMBER);
      const bn = Number(b.ROWNUMBER);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return 0;
    });

    const roster: DbfRow[] = sorted.map((r, i) => ({
      ...householdBase,
      ...r,
      [ART_NO_COL]: i + 1,
    }));

    const namaKrt = (rows[0]?.NAMAKRT as string) ?? (householdBase.NAMAKRT as string) ?? null;

    households.push({
      nks,
      nurt,
      namaKrt,
      roster,
      householdRow: { ...householdBase, ...(rows[0] || {}) },
    });
  }
  return households;
}

function buildFieldMap(): Map<string, string> {
  return new Map(Object.entries(KONSISTENSI_FIELD_MAP));
}

/** Jalankan semua aturan M yang evaluable terhadap data hasil entri, kembalikan daftar temuan mentah (belum disimpan). */
export function evaluateKonsistensiM(tables: Partial<Tables>): KonsistensiFinding[] {
  const households = buildHouseholds(tables);
  const fieldMap = buildFieldMap();

  // Parse SEKALI di awal (bukan per rumah tangga) -- 932 aturan x ribuan
  // rumah tangga akan sangat lambat kalau rule_expr di-parse ulang tiap kali.
  const parsed: { rule: KonsistensiRuleM; ast: Extract<ParseResult, { ok: true }> }[] = [];
  for (const rule of KONSISTENSI_RULES_M) {
    if (!rule.evaluable) continue;
    const res = parseRuleExpr(rule.rule_expr);
    if (res.ok) parsed.push({ rule, ast: res });
  }

  const artRules = parsed.filter((p) => p.rule.level !== 'RT');
  const rtRules = parsed.filter((p) => p.rule.level === 'RT');

  const findings: KonsistensiFinding[] = [];

  for (const hh of households) {
    for (let i = 0; i < hh.roster.length; i++) {
      const row = hh.roster[i];
      const ctx: EvalCtx = { row, roster: hh.roster, rowIndex: i, fieldMap, artNoColumn: ART_NO_COL };
      for (const { rule, ast } of artRules) {
        if (evaluateRule(ast.ast, ctx)) {
          findings.push({
            rule_id: rule.rule_id,
            field: rule.field,
            kuesioner: 'M',
            nks: hh.nks,
            nurt: hh.nurt,
            art_no: (row[ART_NO_COL] as number) ?? null,
            nama_krt: hh.namaKrt,
            message: rule.message,
            perlakuan: rule.perlakuan,
            level: rule.level,
            is_fatal: rule.is_fatal,
          });
        }
      }
    }

    const ctxRt: EvalCtx = { row: hh.householdRow, roster: hh.roster, rowIndex: -1, fieldMap, artNoColumn: ART_NO_COL };
    for (const { rule, ast } of rtRules) {
      if (evaluateRule(ast.ast, ctxRt)) {
        findings.push({
          rule_id: rule.rule_id,
          field: rule.field,
          kuesioner: 'M',
          nks: hh.nks,
          nurt: hh.nurt,
          art_no: null,
          nama_krt: hh.namaKrt,
          message: rule.message,
          perlakuan: rule.perlakuan,
          level: rule.level,
          is_fatal: rule.is_fatal,
        });
      }
    }
  }

  return findings;
}

/**
 * Jalankan evaluasi lalu simpan hasilnya lewat RPC kp_konsistensi_upsert_batch
 * (pola sama dgn lib/runAnomaliPipeline.ts: insert baru, pertahankan status
 * "dibaca" kalau temuan yg sama masih muncul, tandai resolved kalau sudah
 * tidak muncul lagi). p_upload_id dipakai BERSAMA dgn kp_anomali_upload
 * (baris upload yg sama dgn Anomali Cepat) supaya raw_data tidak disimpan dua
 * kali.
 */
export async function runKonsistensiPipeline(
  supabase: SupabaseClient,
  tables: Partial<Tables>,
  uploadId: number
) {
  const findings = evaluateKonsistensiM(tables);

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
  }));

  const { data: upsertResult, error: upsertErr } = await supabase
    .rpc('kp_konsistensi_upsert_batch', { p_upload_id: uploadId, p_findings: payload })
    .single();
  if (upsertErr) throw upsertErr;

  return {
    totalTemuan: findings.length,
    ringkasan: upsertResult as { baru: number; tetap: number; selesai: number },
  };
}
