// lib/konsistensiEngine.ts
//
// Interpreter kecil untuk bahasa ekspresi aturan konsistensi resmi BPS
// (disalin dari kolom `rule_expr` aplikasi desktop client VSEN26 —
// dievaluasi lewat DynamicExpresso/.NET di aplikasi aslinya). Modul ini
// men-tokenize -> parse -> evaluate ekspresi itu LANGSUNG terhadap data
// hasil entri (DBF yang sudah di-parse), tanpa menerjemahkan tiap aturan
// satu-satu secara manual — supaya konsisten dgn logika asli BPS dan bisa
// menjangkau ribuan aturan sekaligus.
//
// Semantik: `rule_expr` mendeskripsikan KONDISI SALAH/ANOMALI. Kalau hasil
// evaluasinya TRUE pada suatu baris data, berarti baris itu MELANGGAR
// aturan (persis pola yang sama dipakai lib/anomalyChecks.ts: `cond: r =>
// ...` lalu push temuan kalau cond true).
//
// Cakupan bahasa yang didukung (hasil audit ~1.018 rule_expr VSEN26.M):
//   - Literal: angka, string '...', true/false
//   - Field: R502, R406a, dst — dgn indeks opsional [i] [i+1] [i-1] [angka]
//     (mis. R403[i+1] = field ART BERIKUTNYA dlm roster rumah tangga)
//   - Operator: == != >= <= > < , AND/OR/&&/||/! , + - * /
//   - Fungsi: ISNULL, INT, STR, MID, LEFT, TRIM, LEN, MOD, CONTAIN,
//     ISALLEMPTY, ISCOMPLETE, COUNT, GETNOART, INNER
//   - TIDAK didukung (ditandai unsupported saat "compile", dilewati —
//     bukan dipaksa jalan): ISKOORDINATKOSONG, INTRANGE, STRINGRANGE
//     (semuanya terkait validasi koordinat GPS — data itu tidak ada sama
//     sekali di tabel hasil entri yang tersimpan aplikasi ini).

export type DbfRow = Record<string, string | number | null | undefined>;

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type IndexSpec =
  | { kind: 'i' }
  | { kind: 'i+1' }
  | { kind: 'i-1' }
  | { kind: 'lit'; n: number }
  | { kind: 'dynamic'; expr: Node }; // indeks berupa field lain, mis. R407[R804] = ART bernomor urut = isi R804

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'field'; name: string; idx?: IndexSpec }
  | { t: 'unary'; op: '-' | '!'; arg: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '==' | '!=' | '>' | '<' | '>=' | '<='; l: Node; r: Node }
  | { t: 'logical'; op: 'AND' | 'OR'; l: Node; r: Node }
  | { t: 'call'; name: string; args: Node[] };

export const UNSUPPORTED_FUNCTIONS = new Set(['ISKOORDINATKOSONG', 'INTRANGE', 'STRINGRANGE']);

const KNOWN_FUNCTIONS = new Set([
  'ISNULL', 'INT', 'STR', 'MID', 'LEFT', 'TRIM', 'LEN', 'MOD', 'CONTAIN',
  'ISALLEMPTY', 'ISCOMPLETE', 'COUNT', 'GETNOART', 'INNER',
  // Ditambahkan utk VSEN26.KP (lihat lib/konsistensiFieldMapKP.ts) -- SUM
  // dipakai BPS cuma dgn 1 argumen field tunggal (rekap ART -> RT, mis.
  // "SUM(R188K5)", "SUM(MB431K3)"), jadi cukup dievaluasi sbg pass-through
  // thd nilai field itu SENDIRI -- field itu SUDAH berupa hasil agregasi
  // (dijumlahkan lintas baris ART) sejak dibentuk di konteks evaluasi
  // rumah tangga (lib/runKonsistensiPipelineKP.ts), bukan dihitung ulang
  // di sini. CHECKNOALPHA & ROUNDINT diverifikasi cukup sederhana utk
  // diimplementasikan langsung dari nama fungsinya.
  'SUM', 'CHECKNOALPHA', 'ROUNDINT',
]);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokType = 'num' | 'str' | 'ident' | 'op' | 'lparen' | 'rparen' | 'lbrack' | 'rbrack' | 'comma' | 'eof';
interface Tok { t: TokType; v: string }

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '(') { toks.push({ t: 'lparen', v: '(' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rparen', v: ')' }); i++; continue; }
    if (c === '[') { toks.push({ t: 'lbrack', v: '[' }); i++; continue; }
    if (c === ']') { toks.push({ t: 'rbrack', v: ']' }); i++; continue; }
    if (c === ',') { toks.push({ t: 'comma', v: ',' }); i++; continue; }
    if (c === "'") {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== "'") { s += src[j]; j++; }
      toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    // multi-char operators
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=' || two === '&&' || two === '||') {
      toks.push({ t: 'op', v: two }); i += 2; continue;
    }
    if (c === '>' || c === '<' || c === '+' || c === '-' || c === '*' || c === '/' || c === '!') {
      toks.push({ t: 'op', v: c }); i++; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      toks.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    // karakter tak dikenal (mis. sisa syntax aneh spt STRINGRANGE(x,-,U,S))
    // -- lempar error supaya parseRuleExpr menandai rule ini unsupported,
    // bukan diam-diam salah.
    throw new Error(`Karakter tak dikenal "${c}" pada posisi ${i}`);
  }
  toks.push({ t: 'eof', v: '' });
  return toks;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent, precedence: OR < AND < NOT < comparison < additive < multiplicative < unary < primary)
// ---------------------------------------------------------------------------

class Parser {
  toks: Tok[];
  pos = 0;
  constructor(toks: Tok[]) { this.toks = toks; }
  peek(): Tok { return this.toks[this.pos]; }
  next(): Tok { return this.toks[this.pos++]; }
  expect(t: TokType): Tok {
    const tok = this.next();
    if (tok.t !== t) throw new Error(`Diharapkan ${t}, ketemu ${tok.t} ("${tok.v}")`);
    return tok;
  }

  parse(): Node {
    const node = this.parseOr();
    if (this.peek().t !== 'eof') throw new Error(`Token tersisa tak terduga: "${this.peek().v}"`);
    return node;
  }

  private isLogicalOp(v: string, kind: 'AND' | 'OR'): boolean {
    if (kind === 'AND') return v === '&&' || v.toUpperCase() === 'AND';
    return v === '||' || v.toUpperCase() === 'OR';
  }

  parseOr(): Node {
    let node = this.parseAnd();
    while (
      (this.peek().t === 'op' && this.isLogicalOp(this.peek().v, 'OR')) ||
      (this.peek().t === 'ident' && this.isLogicalOp(this.peek().v, 'OR'))
    ) {
      this.next();
      const r = this.parseAnd();
      node = { t: 'logical', op: 'OR', l: node, r };
    }
    return node;
  }

  parseAnd(): Node {
    let node = this.parseNot();
    while (
      (this.peek().t === 'op' && this.isLogicalOp(this.peek().v, 'AND')) ||
      (this.peek().t === 'ident' && this.isLogicalOp(this.peek().v, 'AND'))
    ) {
      this.next();
      const r = this.parseNot();
      node = { t: 'logical', op: 'AND', l: node, r };
    }
    return node;
  }

  parseNot(): Node {
    const tok = this.peek();
    if ((tok.t === 'op' && tok.v === '!') || (tok.t === 'ident' && tok.v.toUpperCase() === 'NOT')) {
      this.next();
      const arg = this.parseNot();
      return { t: 'unary', op: '!', arg };
    }
    return this.parseComparison();
  }

  parseComparison(): Node {
    const l = this.parseAdditive();
    const tok = this.peek();
    if (tok.t === 'op' && ['==', '!=', '>=', '<=', '>', '<'].includes(tok.v)) {
      this.next();
      const r = this.parseAdditive();
      return { t: 'bin', op: tok.v as any, l, r };
    }
    return l;
  }

  parseAdditive(): Node {
    let node = this.parseMultiplicative();
    while (this.peek().t === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
      const op = this.next().v as '+' | '-';
      const r = this.parseMultiplicative();
      node = { t: 'bin', op, l: node, r };
    }
    return node;
  }

  parseMultiplicative(): Node {
    let node = this.parseUnary();
    while (this.peek().t === 'op' && (this.peek().v === '*' || this.peek().v === '/')) {
      const op = this.next().v as '*' | '/';
      const r = this.parseUnary();
      node = { t: 'bin', op, l: node, r };
    }
    return node;
  }

  parseUnary(): Node {
    if (this.peek().t === 'op' && this.peek().v === '-') {
      this.next();
      const arg = this.parseUnary();
      return { t: 'unary', op: '-', arg };
    }
    return this.parsePrimary();
  }

  parseIndex(): IndexSpec {
    // sudah melewati '['
    const tok = this.peek();
    if (tok.t === 'ident' && tok.v === 'i') {
      this.next();
      if (this.peek().t === 'op' && (this.peek().v === '+' || this.peek().v === '-')) {
        const op = this.next().v;
        const numTok = this.expect('num');
        const n = Number(numTok.v);
        this.expect('rbrack');
        return op === '+' ? { kind: 'i+1', ...(n !== 1 ? {} : {}) } as IndexSpec : { kind: 'i-1' };
      }
      this.expect('rbrack');
      return { kind: 'i' };
    }
    if (tok.t === 'num') {
      this.next();
      this.expect('rbrack');
      return { kind: 'lit', n: Number(tok.v) };
    }
    // Indeks dinamis: isinya field lain (boleh berindeks sendiri, mis.
    // "R407[R902[i]]" = ART bernomor urut = isi R902 pada baris ini).
    const expr = this.parsePrimary();
    this.expect('rbrack');
    return { kind: 'dynamic', expr };
  }

  parsePrimary(): Node {
    const tok = this.next();
    if (tok.t === 'num') return { t: 'num', v: Number(tok.v) };
    if (tok.t === 'str') return { t: 'str', v: tok.v };
    if (tok.t === 'lparen') {
      const node = this.parseOr();
      this.expect('rparen');
      return node;
    }
    if (tok.t === 'ident') {
      const upper = tok.v.toUpperCase();
      if (upper === 'TRUE') return { t: 'bool', v: true };
      if (upper === 'FALSE') return { t: 'bool', v: false };
      // panggilan fungsi?
      if (this.peek().t === 'lparen') {
        this.next(); // '('
        const args: Node[] = [];
        if (this.peek().t !== 'rparen') {
          args.push(this.parseOr());
          while (this.peek().t === 'comma') {
            this.next();
            args.push(this.parseOr());
          }
        }
        this.expect('rparen');
        return { t: 'call', name: upper, args };
      }
      // field ref, mungkin dgn indeks [...]
      let idx: IndexSpec | undefined;
      if (this.peek().t === 'lbrack') {
        this.next();
        idx = this.parseIndex();
      }
      return { t: 'field', name: tok.v.toUpperCase(), idx };
    }
    throw new Error(`Token tak terduga: "${tok.v}" (${tok.t})`);
  }
}

// ---------------------------------------------------------------------------
// Analisis statis: kumpulkan nama field & nama fungsi yang dipakai suatu AST
// -- dipakai utk cek dukungan (field termapping? fungsi didukung?) SEKALI
// per rule, bukan berulang tiap baris data.
// ---------------------------------------------------------------------------

function walk(node: Node, cb: (n: Node) => void) {
  cb(node);
  switch (node.t) {
    case 'unary': walk(node.arg, cb); break;
    case 'bin': walk(node.l, cb); walk(node.r, cb); break;
    case 'logical': walk(node.l, cb); walk(node.r, cb); break;
    case 'call': for (const a of node.args) walk(a, cb); break;
  }
}

export function collectFieldNames(ast: Node): string[] {
  const out = new Set<string>();
  walk(ast, (n) => { if (n.t === 'field') out.add(n.name); });
  return [...out];
}

export function collectFunctionNames(ast: Node): string[] {
  const out = new Set<string>();
  walk(ast, (n) => { if (n.t === 'call') out.add(n.name); });
  return [...out];
}

// ---------------------------------------------------------------------------
// Kumpulkan field + NILAI SESUNGGUHNYA yang dipakai saat SATU evaluasi rule
// (dipanggil hanya saat rule itu TERBUKTI melanggar -- lihat pemanggil di
// runKonsistensiPipeline.ts / runKonsistensiPipelineKP.ts) -- dipakai utk
// tampilkan "Data yang dianalisis" di kartu temuan (app/seruti/
// error-konsistensi.tsx), supaya PPL bisa lihat persis angka/isian apa yg
// memicu temuan tanpa harus menghitung ulang manual dari rule_expr.
// ---------------------------------------------------------------------------

export interface FieldValueEntry {
  name: string; // token field spt tampil di rule_expr, mis. "R502" / "R403[i+1]"
  value: unknown;
}

// Label field yg mencakup indeks (kalau ada) -- field yg SAMA dgn indeks
// BEDA (mis. R403 vs R403[i+1]) dianggap dua "variabel" berbeda krn nilainya
// bisa beda (baris ART berbeda), sedangkan field dgn indeks [i] (baris ini
// sendiri) disamakan labelnya dgn field tanpa indeks.
function fieldEntryLabel(node: Extract<Node, { t: 'field' }>): string {
  if (!node.idx || node.idx.kind === 'i') return node.name;
  if (node.idx.kind === 'i+1') return `${node.name}[i+1]`;
  if (node.idx.kind === 'i-1') return `${node.name}[i-1]`;
  if (node.idx.kind === 'lit') return `${node.name}[${node.idx.n}]`;
  return `${node.name}[...]`; // indeks dinamis (field lain) -- label generik
}

export function collectFieldValues(ast: Node, ctx: EvalCtx): FieldValueEntry[] {
  const seen = new Set<string>();
  const out: FieldValueEntry[] = [];
  walk(ast, (n) => {
    if (n.t !== 'field') return;
    const label = fieldEntryLabel(n);
    if (seen.has(label)) return;
    seen.add(label);
    let value: unknown;
    try {
      value = evalNode(n, ctx);
    } catch {
      value = undefined;
    }
    out.push({ name: label, value });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Parse hasil: sukses (AST) atau unsupported (alasan) -- tidak pernah throw
// keluar dari fungsi ini, supaya loop compile 1000+ rule tetap jalan mulus.
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; ast: Node; fields: string[] }
  | { ok: false; reason: string };

export function parseRuleExpr(expr: string): ParseResult {
  try {
    const toks = tokenize(expr);
    const ast = new Parser(toks).parse();
    const funcs = collectFunctionNames(ast);
    const bad = funcs.find((f) => UNSUPPORTED_FUNCTIONS.has(f));
    if (bad) return { ok: false, reason: `Fungsi "${bad}" belum didukung (butuh data koordinat GPS yang tidak tersedia)` };
    const unknownFn = funcs.find((f) => !KNOWN_FUNCTIONS.has(f));
    if (unknownFn) return { ok: false, reason: `Fungsi "${unknownFn}" tidak dikenal` };
    return { ok: true, ast, fields: collectFieldNames(ast) };
  } catch (e: any) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export interface EvalCtx {
  row: DbfRow;
  roster: DbfRow[];
  rowIndex: number; // posisi `row` di dalam roster (-1 kalau level RT / tidak relevan)
  fieldMap: Map<string, string>; // nama field aturan (UPPER) -> nama kolom DBF sesungguhnya
  artNoColumn: string | null; // kolom yg berisi nomor urut ART (utk GETNOART / indeks literal)
}

function normStr(x: unknown): string {
  if (x === null || x === undefined) return '';
  return String(x).trim();
}
function looksNumeric(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x);
  if (typeof x === 'boolean') return false;
  if (Array.isArray(x)) return false;
  const s = normStr(x);
  if (s === '') return false;
  return Number.isFinite(Number(s));
}
function toNum(x: unknown): number {
  if (typeof x === 'number') return x;
  return Number(normStr(x));
}
function isBlank(x: unknown): boolean {
  return x === null || x === undefined || normStr(x) === '';
}
function valEq(a: unknown, b: unknown): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
  if (looksNumeric(a) && looksNumeric(b)) return toNum(a) === toNum(b);
  return normStr(a) === normStr(b);
}
function valOrd(a: unknown, b: unknown, op: '>' | '<' | '>=' | '<='): boolean {
  if (!looksNumeric(a) || !looksNumeric(b)) return false;
  const x = toNum(a), y = toNum(b);
  switch (op) {
    case '>': return x > y;
    case '<': return x < y;
    case '>=': return x >= y;
    case '<=': return x <= y;
  }
}

function fieldRow(node: Extract<Node, { t: 'field' }>, ctx: EvalCtx): DbfRow | undefined {
  if (!node.idx || node.idx.kind === 'i') return ctx.row;
  if (node.idx.kind === 'i+1') return ctx.roster[ctx.rowIndex + 1];
  if (node.idx.kind === 'i-1') return ctx.roster[ctx.rowIndex - 1];
  if (node.idx.kind === 'lit') {
    if (!ctx.artNoColumn) return undefined;
    const n = node.idx.n;
    return ctx.roster.find((r) => toNum(r[ctx.artNoColumn as string]) === n);
  }
  if (node.idx.kind === 'dynamic') {
    if (!ctx.artNoColumn) return undefined;
    const n = toNum(evalNode(node.idx.expr, ctx));
    if (Number.isNaN(n)) return undefined;
    return ctx.roster.find((r) => toNum(r[ctx.artNoColumn as string]) === n);
  }
  return undefined;
}

function withRow(ctx: EvalCtx, row: DbfRow, rowIndex: number): EvalCtx {
  return { ...ctx, row, rowIndex };
}

export function evalNode(node: Node, ctx: EvalCtx): unknown {
  switch (node.t) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'bool': return node.v;
    case 'field': {
      const col = ctx.fieldMap.get(node.name.toUpperCase());
      if (col === undefined) return undefined;
      const row = fieldRow(node, ctx);
      if (!row) return undefined;
      return row[col];
    }
    case 'unary': {
      if (node.op === '-') return -toNum(evalNode(node.arg, ctx));
      return !Boolean(evalNode(node.arg, ctx));
    }
    case 'bin': {
      if (node.op === '+' || node.op === '-' || node.op === '*' || node.op === '/') {
        const a = toNum(evalNode(node.l, ctx));
        const b = toNum(evalNode(node.r, ctx));
        if (node.op === '+') return a + b;
        if (node.op === '-') return a - b;
        if (node.op === '*') return a * b;
        return b === 0 ? NaN : a / b;
      }
      const a = evalNode(node.l, ctx);
      const b = evalNode(node.r, ctx);
      if (node.op === '==') return valEq(a, b);
      if (node.op === '!=') return !valEq(a, b);
      return valOrd(a, b, node.op as any);
    }
    case 'logical': {
      const a = Boolean(evalNode(node.l, ctx));
      if (node.op === 'AND') return a ? Boolean(evalNode(node.r, ctx)) : false;
      return a ? true : Boolean(evalNode(node.r, ctx));
    }
    case 'call': return evalCall(node, ctx);
  }
}

function evalCall(node: Extract<Node, { t: 'call' }>, ctx: EvalCtx): unknown {
  const { name, args } = node;
  switch (name) {
    case 'COUNT': {
      let c = 0;
      for (let i = 0; i < ctx.roster.length; i++) {
        if (Boolean(evalNode(args[0], withRow(ctx, ctx.roster[i], i)))) c++;
      }
      return c;
    }
    case 'GETNOART': {
      const out: number[] = [];
      for (let i = 0; i < ctx.roster.length; i++) {
        if (Boolean(evalNode(args[0], withRow(ctx, ctx.roster[i], i)))) {
          const artNo = ctx.artNoColumn ? ctx.roster[i][ctx.artNoColumn] : undefined;
          const n = toNum(artNo);
          if (!Number.isNaN(n)) out.push(n);
        }
      }
      return out;
    }
    case 'INNER': {
      const value = evalNode(args[0], ctx);
      const list = evalNode(args[1], ctx);
      if (!Array.isArray(list)) return false;
      const n = toNum(value);
      if (Number.isNaN(n)) return false;
      return (list as number[]).includes(n);
    }
    case 'ISNULL': {
      const v = evalNode(args[0], ctx);
      const def = args[1] ? evalNode(args[1], ctx) : '';
      return isBlank(v) ? def : v;
    }
    case 'INT': {
      const v = evalNode(args[0], ctx);
      const n = parseInt(normStr(v), 10);
      return Number.isNaN(n) ? NaN : n;
    }
    case 'STR': return normStr(evalNode(args[0], ctx));
    case 'MID': {
      // PENTING: start di sini 0-based (gaya .NET Substring/DynamicExpresso),
      // BUKAN VB MID (1-based) walau namanya "MID". Diverifikasi manual
      // terhadap data NIK riil: rule_expr "MID(R502,6,2)" dgn pesan "digit
      // ke-7 dan ke-8" cuma cocok kalau start=6 berarti index 0-based ke-6
      // (karakter ke-7 dlm hitungan manusia). Pakai start-1 (VB-style) di
      // sini bikin SEMUA aturan MID salah geser 1 posisi & salah deteksi
      // ratusan "pelanggaran" NIK yang sebenarnya valid.
      const s = normStr(evalNode(args[0], ctx));
      const start = toNum(evalNode(args[1], ctx));
      const len = toNum(evalNode(args[2], ctx));
      if (!Number.isFinite(start) || !Number.isFinite(len)) return '';
      return s.substr(Math.max(0, start), len);
    }
    case 'LEFT': {
      const s = normStr(evalNode(args[0], ctx));
      const len = toNum(evalNode(args[1], ctx));
      return s.substr(0, Math.max(0, len));
    }
    case 'TRIM': return normStr(evalNode(args[0], ctx));
    case 'LEN': return normStr(evalNode(args[0], ctx)).length;
    case 'MOD': {
      const a = toNum(evalNode(args[0], ctx));
      const b = toNum(evalNode(args[1], ctx));
      return b === 0 ? NaN : a % b;
    }
    case 'CONTAIN': {
      const s = normStr(evalNode(args[0], ctx)).toUpperCase();
      for (let i = 1; i < args.length; i++) {
        const opt = normStr(evalNode(args[i], ctx)).toUpperCase();
        if (opt && s.includes(opt)) return true;
      }
      return false;
    }
    case 'ISALLEMPTY': return args.every((a) => isBlank(evalNode(a, ctx)));
    case 'ISCOMPLETE': return args.every((a) => !isBlank(evalNode(a, ctx)));
    case 'SUM': {
      // Lihat catatan di KNOWN_FUNCTIONS -- field argumennya sudah berupa
      // total teragregasi, jadi SUM cukup jadi pass-through.
      const v = evalNode(args[0], ctx);
      return isBlank(v) ? 0 : toNum(v);
    }
    case 'CHECKNOALPHA': {
      // true kalau isian TIDAK mengandung huruf sama sekali (dipakai utk
      // validasi kolom yg seharusnya cuma angka/simbol, mis. satuan/kode).
      const s = normStr(evalNode(args[0], ctx));
      return !/[a-zA-Z]/.test(s);
    }
    case 'ROUNDINT': {
      const v = toNum(evalNode(args[0], ctx));
      return Number.isFinite(v) ? Math.round(v) : NaN;
    }
    default:
      return undefined;
  }
}

// Evaluasi tingkat atas -- selalu mengembalikan boolean murni, gagal-aman
// (exception saat runtime -> dianggap TIDAK melanggar, bukan crash pipeline).
export function evaluateRule(ast: Node, ctx: EvalCtx): boolean {
  try {
    return Boolean(evalNode(ast, ctx));
  } catch {
    return false;
  }
}
