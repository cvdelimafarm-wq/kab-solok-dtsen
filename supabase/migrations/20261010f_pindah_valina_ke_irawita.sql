-- (10 Okt 2026) Permintaan user: PPL Valina alsisri (id 125) dipindah dari PML Ardial Jaraf (id 460) ke PML Irawita (id 96),
-- termasuk wilayah plot SLS-nya (2 baris bencana_alokasi_subsls: id 5005 & 5008). Kembali: tukar 96 <-> 460.
update public.bencana_petugas set atasan_id = 96 where id = 125 and atasan_id = 460;
update public.bencana_alokasi_subsls set pml_id = 96 where ppl_id = 125 and pml_id = 460 and id in (5005, 5008);
