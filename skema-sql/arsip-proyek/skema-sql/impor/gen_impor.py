import json,re,collections,hashlib
t=json.load(open('/home/claude/kk/pok_tree.json'))
raw=open('/home/claude/kk/pok_tree.json','rb').read()
SHA=hashlib.sha256(raw).hexdigest()
LV={'program':'program','kegiatan':'kegiatan','kro':'kro','ro':'ro','komponen':'komponen','sub':'subkomp','akun':'akun'}
ALIAS={'SEGMN':'SGMN','O-K':'OK','O-B':'OB','O-P':'OP','OJ':'OJP','O-J':'OJP','LBR':'LMBR','RT':'RUTA','O-TH':'OT'}
nodes=[];dets=[]
cnt=[0]
def kodeonly(level,kode):
    if level=='program': return kode.split('.')[-1]
    if level in('kro','ro'): return kode.split('.')[-1]
    return kode
def add(n,parent,anc):
    cnt[0]+=1; me=cnt[0]
    sib=collections.Counter(); 
    lvl=n['level']
    nm=re.sub(r'\s+',' ',n['nama']).strip()
    ro=n['kode'] if lvl=='ro' else ''
    nodes.append((me,parent,LV[lvl],kodeonly(lvl,n['kode']),nm,n['pagu'],ro))
    anc2=anc+[(lvl,n['kode'])]
    for c in n['children']: add(c,me,anc2)
    if lvl=='akun':
        ro_k=[k for l,k in anc2 if l=='ro'][0]
        kom=[k for l,k in anc2 if l=='komponen'][0]
        for d in n['details']:
            u=re.sub(r'\s+',' ',' '.join(d['uraian'])).strip()
            s=d['satuan'].upper(); s=ALIAS.get(s,s)
            dets.append((me,u,d['vol'],s,d['harga'],d['jumlah']))
for x in t: add(x,0,[])
def num(v):
    return ('%.2f'%v).rstrip('0').rstrip('.') if isinstance(v,float) else str(v)
nl='\n'.join('|'.join([str(a),str(b if b else ''),c,d,e,str(f),g]) for a,b,c,d,e,f,g in nodes)
dl='\n'.join('|'.join([str(a),b,num(c),d,num(e),str(f)]) for a,b,c,d,e,f in dets)
assert '$' not in nl+dl
sql=f"""-- =====================================================================
-- 20261024g_impor_pok_2026_30sep.sql  (DATA, bukan skema; aman diulang)
-- Impor POK/RKKS posisi 30 Sep 2026: {len(nodes)} node, {len(dets)} baris detail,
-- total Rp 13.431.536.000. Sumber: hasil parse PDF RKKS (pok_tree.json, sha256 di bawah).
-- Dibuat sebagai versi POK nomor revisi 1 (SEMENTARA: nomor revisi resmi belum diketahui; ganti bila perlu
-- sebelum RAB/jadwal dibuat). Bergantung pada migrasi a, b, c. Tanpa DELETE/DROP.
-- =====================================================================
do $impor$
declare v bigint; n_ada int; r record; l text; p text[]; idmap jsonb := '{{}}'::jsonb;
        pid bigint; cur bigint; kem int; n_node int := 0; n_det int := 0; tot numeric; v_komp text; v_ro text; v_dasar text; cacah jsonb := '{{}}'::jsonb;
begin
  select count(*) into n_ada from keu_pok_versi where tahun = 2026 and nomor_revisi = 1;
  if n_ada > 0 then raise notice 'Versi POK 2026 revisi 1 sudah ada; impor dilewati.'; return; end if;
  insert into keu_pok_versi(tahun, nomor_revisi, jenis, nomor_pok, tanggal_efektif, sumber_berkas, hash_berkas, status)
  values (2026, 1, 'revisi', 'POK posisi 30 Sep 2026 (nomor revisi resmi menyusul)', date '2026-09-30',
          'RKKS PDF 30 Sep 2026, hasil parse pok_tree.json', '{SHA}', 'draf') returning id into v;

  -- node (urutan = pohon dari atas ke bawah, sehingga induk selalu sudah ada)
  for l in select unnest(string_to_array($nodes$
{nl}
$nodes$, E'\\n')) loop
    if btrim(l) = '' then continue; end if;
    p := string_to_array(l, '|');
    pid := case when p[2] = '' then null else (idmap ->> p[2])::bigint end;
    select count(*) + 1 into kem from keu_pok_node where versi_id = v and induk_id is not distinct from pid and kode = p[4];
    insert into keu_pok_node(versi_id, induk_id, tingkat, kode, kemunculan, nama, pagu, ro_kode)
    values (v, pid, p[3], p[4], kem, p[5], p[6]::numeric, nullif(p[7], ''))
    returning id into pid;
    idmap := idmap || jsonb_build_object(p[1], pid);
    n_node := n_node + 1;
  end loop;

  -- detail; kunci stabil = ro/komponen/akun/uraian#kemunculan
  for l in select unnest(string_to_array($det$
{dl}
$det$, E'\\n')) loop
    if btrim(l) = '' then continue; end if;
    p := string_to_array(l, '|');
    -- telusuri leluhur akun: komponen dan RO
    select (idmap ->> p[1])::bigint into pid;
    v_komp := null; v_ro := null; cur := pid;
    while cur is not null loop
      select induk_id, tingkat, kode, ro_kode into r from keu_pok_node where id = cur;
      if r.tingkat = 'komponen' then v_komp := r.kode; end if;
      if r.tingkat = 'ro' then v_ro := r.ro_kode; end if;
      cur := r.induk_id;
    end loop;
    v_dasar := keu_kunci_detail(v_ro, v_komp, (select kode from keu_pok_node where id = pid), p[2], 1);
    v_dasar := left(v_dasar, length(v_dasar) - 2);
    kem := coalesce((cacah ->> v_dasar)::int, 0) + 1;
    cacah := cacah || jsonb_build_object(v_dasar, kem);
    insert into keu_pok_detail(versi_id, akun_node_id, kunci_stabil, kemunculan, uraian, volume, satuan, harga_satuan, jumlah)
    values (v, pid, v_dasar || '#' || kem, kem, p[2], p[3]::numeric, p[4], p[5]::numeric, p[6]::numeric);
    n_det := n_det + 1;
  end loop;

  select sum(jumlah) into tot from keu_pok_detail where versi_id = v;
  if (select count(*) from keu_v_pok_selisih where versi_id = v and selisih <> 0) > 0 then
    raise exception 'Impor POK: ada node tidak konsisten (lihat keu_v_pok_selisih versi %)', v;
  end if;
  perform keu_pok_berlakukan(v);
  raise notice 'Impor POK selesai: versi %, % node, % detail, total Rp %', v, n_node, n_det, tot;
end
$impor$;
"""
open('g_impor_pok.sql','w').write(sql)
print(len(nodes),len(dets),len(sql), SHA)
