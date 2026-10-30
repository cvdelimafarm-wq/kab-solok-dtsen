import openpyxl, warnings, re, json, sys
warnings.filterwarnings('ignore')
COL=['pagu','lock','lalu','ini','sd','persen','sisa']
def baca_xlsx(f):
    ws=openpyxl.load_workbook(f,data_only=True).active
    out=[]; hdr=[]
    for n,r in enumerate(ws.iter_rows(min_row=1,values_only=True),start=1):
        cells=[(i,c) for i,c in enumerate(r) if c is not None and str(c).strip()!='']
        if not cells: continue
        nums=[float(c) for i,c in cells if i>=16 and isinstance(c,(int,float))]
        txt=[(i,str(c).strip()) for i,c in cells if i<16 or isinstance(c,str)]
        if n<9:
            hdr.append(' '.join(t for i,t in txt)); continue
        first=txt[0][1] if txt else ''
        if first.startswith('*Lock Pagu') or first.startswith('Hal '): continue
        if first=='JUMLAH SELURUHNYA': out.append(dict(lvl='total',kode='',ura=first,nums=nums,baris=n)); continue
        if re.fullmatch(r'\d{6}\.',first[:7]) or re.match(r'\d{6}\. ',first):
            m=re.match(r'(\d{6})\.\s*(.*)',first); out.append(dict(lvl='item',kode=m.group(1),ura=m.group(2),nums=nums,baris=n)); continue
        kode=first; lvl=None
        if kode=='GG': lvl='program'
        elif re.fullmatch(r'GG\.\d{4}',kode): lvl='kegiatan'
        elif re.fullmatch(r'[A-Z]{3}',kode): lvl='kro'
        elif re.fullmatch(r'[A-Z]{3}\.\d{3}',kode): lvl='ro'
        elif re.fullmatch(r'\d{3}',kode): lvl='komponen'
        elif re.fullmatch(r'\d{3}\.\w{2}',kode): lvl='subkomp'
        elif re.fullmatch(r'\d{6}',kode): lvl='akun'
        if lvl:
            out.append(dict(lvl=lvl,kode=kode,ura=' '.join(t for i,t in txt[1:]),nums=nums,baris=n)); continue
        # baris lanjutan: tambahkan teks ke baris sebelumnya, abaikan angka (duplikat)
        if out: out[-1]['ura']+=' '+' '.join(t for i,t in txt); out[-1].setdefault('lanjut',0); out[-1]['lanjut']+=1
        if len(nums)>0 and out: out[-1].setdefault('angka_lanjutan',[]).append(nums)
    return hdr,out
def tree(rows):
    """isi konteks dan cek hitung"""
    ctx={}; items=[]
    for r in rows:
        l=r['lvl']
        if l in('kegiatan',): ctx['keg']=r['kode'].split('.')[1]
        elif l=='kro': ctx['kro']=r['kode']
        elif l=='ro': ctx['ro']=ctx['keg']+'.'+r['kode']; 
        elif l=='komponen': ctx['kom']=r['kode']
        elif l=='subkomp': ctx['sub']=r['kode']
        elif l=='akun': ctx['akun']=r['kode']
        elif l=='item': r['ro']=ctx['ro']; r['kom']=ctx['kom']; r['akun']=ctx['akun']; items.append(r)
    return items
if __name__=='__main__':
    hdr,rows=baca_xlsx(sys.argv[1]); items=tree(rows)
    print(hdr)
    from collections import Counter; print(Counter(r['lvl'] for r in rows))
    bad=[r for r in rows if len(r['nums'])!=7]; print('baris != 7 angka', len(bad)); [print(b['lvl'],b['kode'],b['nums'],b['baris']) for b in bad[:10]]
    print('lanjutan', [(r['kode'],r['lanjut']) for r in rows if r.get('lanjut')][:10])
    tot=[r for r in rows if r['lvl']=='total'][0]
    s=[sum(i['nums'][k] for i in items) for k in range(7)]
    print('total',tot['nums']); print('sum items',s)
    # cek tiap level: jumlah anak = induk
    def cek(level_parent, child_levels):
        pass
    # cek akun: sum item per (ro,kom,akun) == akun
    from collections import defaultdict
    ctx={}; acc=defaultdict(lambda:[0]*7); akun_rows=[]; 
    c={}
    for r in rows:
        l=r['lvl']
        if l=='kegiatan': c['keg']=r['kode'].split('.')[1]
        if l=='ro': c['ro']=c['keg']+'.'+r['kode']
        if l=='komponen': c['kom']=r['kode']
        if l=='akun': c['akun']=r['kode']; akun_rows.append(((c['ro'],c['kom'],r['kode']),r['nums']))
    for i in items:
        for k in range(7): acc[(i['ro'],i['kom'],i['akun'])][k]+=i['nums'][k]
    gagal=[(k,v,a) for k,a in akun_rows for v in [acc[k]] if any(abs(v[x]-a[x])>0.5 for x in (0,1,2,3,4,6))]
    print('akun cocok:',len(akun_rows)-len(gagal),'dari',len(akun_rows)); print(gagal[:5])
    pers=[i for i in items if abs(i['nums'][4]-(i['nums'][2]+i['nums'][3]))>0.5]; print('sd != lalu+ini:',len(pers))
    sis=[i for i in items if abs(i['nums'][6]-(i['nums'][0]-i['nums'][1]-i['nums'][4]))>0.5]; print('sisa != pagu-lock-sd:',len(sis)); [print(i['kode'],i['nums']) for i in sis[:5]]
    json.dump(items,open('fa_items.json','w'),ensure_ascii=False)
