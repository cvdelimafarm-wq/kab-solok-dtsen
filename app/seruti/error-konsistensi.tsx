"use client";

import { useMemo, useState } from "react";

// ============================================================================
// Tab "Error Konsistensi" — KATALOG REFERENSI aturan konsistensi resmi dari
// aplikasi desktop VSEN26.P (Pemutakhiran Keluarga/SLS) Client, dibaca
// langsung dari file konfigurasi internal aplikasi tsb (Assets/Metadata.xlsx,
// sheet "Konsistensi" — daftar 72 rule aktif per 2026).
//
// PENTING: ini murni KATALOG/REFERENSI, bukan pemeriksa data hidup — sistem
// DTSEN KANAL saat ini belum menampung data hasil Pemutakhiran (VSEN26.P),
// jadi rule di bawah TIDAK dijalankan otomatis terhadap data apa pun di sini.
// Gunanya: jadi rujukan cepat saat manual cek dokumen Pemutakhiran, tanpa
// perlu buka aplikasi desktop terpisah. Field bertanda "B2/B3/B4/B5..." merujuk
// ke rincian pada kuesioner VSEN26.P (bukan VSEN26.KP/M yang sudah ada modul
// anomalinya sendiri di tab Anomali Cepat).
// ============================================================================

interface AturanKonsistensi {
  id: number;
  field: string;
  blok: string;
  page: number | null;
  relFields: string;
  rule: string;
  message: string;
  perlakuan: string;
  level: string;
  isFatal: boolean;
}

const ATURAN_KONSISTENSI: AturanKonsistensi[] = [
  {
    "id": 1,
    "field": "B2R2",
    "blok": "Blok II — Ringkasan",
    "page": 1,
    "relFields": "B2R2; B5RCK6_VA; B5RCK6_VB",
    "rule": "ISNULL(B2R2,0) != ISNULL(B5RCK6_VA,0) + ISNULL(B5RCK6_VB,0)",
    "message": "Rincian B2R2 tidak sama dengan penjumlahan B5RCK6_VA + B5RCK6_VB",
    "perlakuan": "Manual cek. Rincian B2R2 harus sama dengan B5RCK6_VA + B5RCK6_VB",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 2,
    "field": "B2R3",
    "blok": "Blok II — Ringkasan",
    "page": 1,
    "relFields": "B2R3",
    "rule": "B2R3 != COUNT(B5K7 > 0)",
    "message": "Rincian B2R3 tidak sama dengan jumlah B5K7 yang terisi lebih dari 0",
    "perlakuan": "Manual cek. Rincian B2R3 harus sama dengan jumlah B5K7 yang terisi lebih dari 0",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 4,
    "field": "B3R2K2_TGL",
    "blok": "Blok III — Keterangan Pencacahan",
    "page": 1,
    "relFields": "B3R2K2_TGL; B3R2K2_BLN",
    "rule": "(B3R2K2_TGL > 28 AND B3R2K2_BLN == 2) OR (B3R2K2_TGL > 30 AND (B3R2K2_BLN == 4 OR B3R2K2_BLN == 6 OR B3R2K2_BLN == 9 OR B3R2K2_BLN == 11))  OR (B3R2K2_TGL > 31 AND (B3R2K2_BLN == 1 OR B3R2K2_BLN == 3 OR B3R2K2_BLN == 5 OR B3R2K2_BLN == 7 OR B3R2K2_BLN == 8 OR B3R2K2_BLN == 10 OR B3R2K2_BLN == 12))",
    "message": "B3R2K2_TGL tidak sesuai dengan B3R2K2_BLN",
    "perlakuan": "Sesuaikan tanggal dengan bulannya",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 5,
    "field": "B3R2K3_TGL",
    "blok": "Blok III — Keterangan Pencacahan",
    "page": 1,
    "relFields": "B3R2K3_TGL; B3R2K3_BLN",
    "rule": "(B3R2K3_TGL > 28 AND B3R2K3_BLN == 2) OR (B3R2K3_TGL > 30 AND (B3R2K3_BLN == 4 OR B3R2K3_BLN == 6 OR B3R2K3_BLN == 9 OR B3R2K3_BLN == 11))  OR (B3R2K3_TGL > 31 AND (B3R2K3_BLN == 1 OR B3R2K3_BLN == 3 OR B3R2K3_BLN == 5 OR B3R2K3_BLN == 7 OR B3R2K3_BLN == 8 OR B3R2K3_BLN == 10 OR B3R2K3_BLN == 12))",
    "message": "B3R2K3_TGL tidak sesuai dengan B3R2K3_BLN",
    "perlakuan": "Sesuaikan tanggal dengan bulannya",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 6,
    "field": "B3R2K3_TGL",
    "blok": "Blok III — Keterangan Pencacahan",
    "page": 1,
    "relFields": "B3R2K2_TGL; B3R2K2_BLN; B3R2K3_TGL; B3R2K3_BLN",
    "rule": "(B3R2K2_BLN == B3R2K3_BLN AND B3R2K2_TGL > B3R2K3_TGL) OR (B3R2K2_BLN > B3R2K3_BLN)",
    "message": "B3R2K2_TGL terisi lebih dari B3R2K3_TGL",
    "perlakuan": "Tanggal pencacahan tidak boleh lebih besar dari tanggal pengawasan",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 7,
    "field": "B4",
    "blok": "Blok IV — Catatan",
    "page": 1,
    "relFields": "B4; B2R2",
    "rule": "B4 == '' AND (B2R2 == 0)",
    "message": "Blok catatan kosong sedangkan B2R2 terisi 0",
    "perlakuan": "Blok catatan harus isi jika B2R2 terisi 0",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 8,
    "field": "B5RCK6_VA",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5RCK6_VA",
    "rule": "B5RCK6_VA != COUNT({B5K6 == `1`})",
    "message": "Rincian B5RCK6_VA tidak sama dengan jumlah baris B5K6 yang terisi kode 1, seharusnya {COUNT(B5K6 == `1`)}",
    "perlakuan": "Jika kosong, isikan 0",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 9,
    "field": "B5RCK6_VB",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5RCK6_VB",
    "rule": "B5RCK6_VB != COUNT({B5K6 == `2`})",
    "message": "Rincian B5RCK6_VB tidak sama dengan jumlah baris B5K6 yang terisi kode 2, seharusnya {COUNT(B5K6 == `2`)}",
    "perlakuan": "Jika kosong, isikan 0",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 10,
    "field": "B5RCK7_VA",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5RCK7_VA",
    "rule": "B5RCK7_VA != COUNT({Tipe == `BVA` AND B5K7 > 0})",
    "message": "Rincian B5RCK7_VA tidak sama dengan jumlah baris B5K7 yang terisi lebih dari 1, seharusnya {COUNT(Tipe == `BVA` AND B5K7 > 0)}",
    "perlakuan": "Jika kosong, isikan 0",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 11,
    "field": "B5RCK7_VB",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5RCK7_VB",
    "rule": "B5RCK7_VB != COUNT({Tipe == `BVB` AND B5K7 > 0})",
    "message": "Rincian B5RCK7_VB tidak sama dengan jumlah baris B5K7 yang terisi lebih dari 1, seharusnya {COUNT(Tipe == `BVB` AND B5K7 > 0)}",
    "perlakuan": "Jika kosong, isikan 0",
    "level": "RT",
    "isFatal": true
  },
  {
    "id": 12,
    "field": "B5K1_KODE",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K1_KODE",
    "rule": "LEN(B5K1_KODE) != 6",
    "message": "Kode sls B5K1_KODE tidak terisi 6 digit",
    "perlakuan": "Kode sls B5K1_KODE harus terisi 6 digit",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 13,
    "field": "B5K1",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K1",
    "rule": "LEN(B5K1) < 3",
    "message": "Nama sls B5K1 terisi kurang dari 3 karakter",
    "perlakuan": "Nama sls B5K1 minimal 3 karakter",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 14,
    "field": "B5K2",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K2",
    "rule": "B5K2 == -1",
    "message": "B5K2 masih terisi -1",
    "perlakuan": "Jika B5K2 terisi -1 harus diperbaiki menjadi 0",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 15,
    "field": "B5K2",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K2;IsPreprinted",
    "rule": "IsPreprinted != 1 AND B5K2 == 0",
    "message": "No urut keluarga terisi 0",
    "perlakuan": "No urut keluarga tidak boleh sama dengan 0",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 16,
    "field": "B5K5",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K5;IsPreprinted",
    "rule": "IsPreprinted != 1 AND (B5K5 == \"\" OR B5K5 == \"0\")",
    "message": "B5K5 kosong",
    "perlakuan": "B5K5 tidak boleh kosong",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 17,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6",
    "rule": "B5K6 != \"2\"",
    "message": "Blok VB tetapi B5K6 tidak terisi 2",
    "perlakuan": "Blok VB maka B5K6 harus terisi 2",
    "level": "BVB",
    "isFatal": true
  },
  {
    "id": 18,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6",
    "rule": "B5K6 != \"0\" AND B5K6 != \"1\" AND B5K6 != \"2\" AND B5K6 != \"9\"",
    "message": "B5K6 terisi selain 0,1,2,-",
    "perlakuan": "B5K6 harus terisi 0,1,2, atau \"-\"",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 19,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6",
    "rule": "B5K6 == \"2\"",
    "message": "Blok VA tetapi B5K6 terisi 2",
    "perlakuan": "Blok VA maka B5K6 tidak boleh terisi 2",
    "level": "BVA",
    "isFatal": true
  },
  {
    "id": 20,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K7; B5K8; B5K9; B5K10; B5K11; B5K12; B5K13; B5K14",
    "rule": "B5K6 == \"0\" AND ISNULL(B5K7,0) + ISNULL(B5K8,0) + ISNULL(B5K9,0) + ISNULL(B5K11,0) + ISNULL(B5K12,0) + ISNULL(B5K13,0) + ISNULL(B5K14,0) > 0",
    "message": "B5K6 terisi 0 tetapi kolom B5K7, B5K8, B5K9, B5K11, B5K12, B5K12, B5K13, B5K14 ada yang terisi",
    "perlakuan": "B5K6 terisi 0 maka kolom B5K7, B5K8, B5K9, B5K11, B5K12, B5K13, B5K14 seharusnya tidak diisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 21,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K7",
    "rule": "(B5K6 == \"1\" OR B5K6 == \"2\" OR B5K6 == \"9\") AND ISNULL(B5K7,999) == 999",
    "message": "B5K6 terisi 1, 2, atau - tetapi B5K7 tidak terisi",
    "perlakuan": "B5K6 terisi 1, 2 atau - maka B5K7 harus terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 22,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K7",
    "rule": "B5K6 == \"0\" AND ISNULL(B5K7,999) != 999",
    "message": "B5K6 terisi 0 tetapi B5K7 terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K7 seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 23,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K8",
    "rule": "(B5K6 == \"1\" OR B5K6 == \"2\" OR B5K6 == \"9\") AND B5K8 == ''",
    "message": "B5K6 terisi 1, 2 atau '-' tetapi B5K8 tidak terisi",
    "perlakuan": "B5K6 terisi 1, 2 atau '-' maka B5K8 harus terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 24,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K8",
    "rule": "B5K6 == \"0\" AND ISNULL(B5K8,0) != 0",
    "message": "B5K6 terisi 0 tetapi B5K8 terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K8 seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 25,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K9",
    "rule": "(B5K6 == \"1\" OR B5K6 == \"2\" OR B5K6 == \"9\") AND ISNULL(B5K9,0)  == 0",
    "message": "B5K6 terisi 1, 2, atau - tetapi B5K9 tidak terisi",
    "perlakuan": "B5K6 terisi 1, 2 atau - maka B5K9 harus terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 26,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K9",
    "rule": "B5K6 == \"0\" AND ISNULL(B5K9,999) != 999",
    "message": "B5K6 terisi 0 tetapi B5K9 terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K9 seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 27,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K10",
    "rule": "B5K6 == \"0\" AND B5K10 != \"\"",
    "message": "B5K6 terisi 0 tetapi kolom B5K10 terisi",
    "perlakuan": "B5K6 terisi 0 maka kolom B5K10 seharusnya tidak diisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 28,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K5; IsPreprinted",
    "rule": "IsPreprinted == 1 AND B5K6 ==\"1\" AND B5K5 == \"\"",
    "message": "Keluarga preprinted dan B5K6 terisi 1 tetapi B5K5 tidak terisi",
    "perlakuan": "Jika keluarga preprinted dan B5K6 terisi 1 maka B5K5 harus terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 29,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K7; IsPreprinted",
    "rule": "IsPreprinted == 0 AND B5K6 == \"9\" AND B5K7 != 1",
    "message": "Rumah tangga baru dan B5K6 terisi '-' tetapi B5K7 tidak terisi 1",
    "perlakuan": "Rumah tangga baru dan B5K6 terisi '-' maka B5K7 harus terisi 1",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 30,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6;IsPreprinted",
    "rule": "IsPreprinted == 1 AND B5K6 == \"2\"",
    "message": "Rumah tangga preprinted tetapi B5K6 berkode 2",
    "perlakuan": "Rumah tangga preprinted maka B5K6 tidak boleh berkode 2",
    "level": "BVA",
    "isFatal": true
  },
  {
    "id": 31,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6;IsPreprinted",
    "rule": "IsPreprinted == 0 AND (B5K6 != \"2\")",
    "message": "Rumah tangga baru di VB tetapi B5K6 tidak berkode 2",
    "perlakuan": "Rumah tangga baru di VB maka B5K6 harus berkode 2",
    "level": "BVB",
    "isFatal": true
  },
  {
    "id": 32,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6;IsPreprinted",
    "rule": "IsPreprinted == 0 AND (B5K6 != \"9\")",
    "message": "Rumah tangga baru di VA tetapi B5K6 tidak berkode -",
    "perlakuan": "Rumah tangga baru di VA maka B5K6 harus berkode -",
    "level": "BVA",
    "isFatal": true
  },
  {
    "id": 33,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K7;IsPreprinted;B5K8",
    "rule": "IsPreprinted == 0 AND ISNULL(B5K7,0) < 1 AND ISUNIQUE(\"B5K8\")",
    "message": "Rumah tangga baru di VB dan B5K7 tidak terisi atau terisi kurang dari 1 tetapi isian B5K8 unik",
    "perlakuan": "Rumah tangga baru di VB dan B5K7 tidak terisi atau terisi kurang dari 1 seharusnya isian B5K8 tidak unik",
    "level": "BVB",
    "isFatal": true
  },
  {
    "id": 34,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K7; B5K11; B5K12; B5K13; B5K14",
    "rule": "B5K7 == 0 AND ISNULL(B5K11,0) + ISNULL(B5K12,0) + ISNULL(B5K13,0) + ISNULL(B5K14,0) > 0",
    "message": "B5K7 terisi 0 tetapi kolom B5K11, B5K12, B5K13, B5K14 ada yang terisi",
    "perlakuan": "B5K7 terisi 0 maka kolom B5K11, B5K12, B5K13, B5K14 seharusnya tidak diisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 35,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K7; B5K11; B5K12; B5K13; B5K14",
    "rule": "ISNULL(B5K7,0) >= 1 AND ISNULL(B5K11,0) + ISNULL(B5K12,0) + ISNULL(B5K13,0) + ISNULL(B5K14,0) == 0",
    "message": "B5K7 terisi 1 atau lebih tetapi B5K11 , B5K12 , B5K13 , B5K14 tidak ada yang terisi",
    "perlakuan": "B5K7 terisi 1 atau lebih maka B5K11 , B5K12 , B5K13 , B5K14 harus terisi salah satu",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 38,
    "field": "B5K8",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K8; B5K7",
    "rule": "ISNULL(B5K7,0) > 0 AND ISNULL(B5K8,0) == 0",
    "message": "B5K7 terisi > 0 tetapi B5K8 tidak terisi",
    "perlakuan": "Jika B5K7 terisi > 0 maka B5K8 harus terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 39,
    "field": "B5K9",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K9; B5K7",
    "rule": "B5K7 == 0 AND ISNULL(B5K9,0) != 1",
    "message": "B5K7 terisi kode 0 tetapi B5K9 tidak terisi 1",
    "perlakuan": "Jika B5K7 terisi kode 0 maka B5K9 harus terisi 1",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 40,
    "field": "B5K10",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K10; B5K9",
    "rule": "B5K10 != \"\" AND B5K9 != 1   AND B5K9 !=2",
    "message": "B5K10 ada isian tetapi B5K9 bukan terisi kode 1 atau 2",
    "perlakuan": "B5K10 terisi jika B5K9 terisi 1 atau 2",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 41,
    "field": "B5K10",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K10; B5K9",
    "rule": "B5K10 == \"\" AND (B5K9 == 1   OR B5K9 == 2)",
    "message": "B5K10 tidak ada isian tetapi B5K9 terisi kode 1 atau 2",
    "perlakuan": "B5K10 tidak diisi jika B5K9 terisi kode 3",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 42,
    "field": "B5K11",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K11; B5K12; B5K13; B5K14",
    "rule": "ISNULL(B5K11,0) + ISNULL(B5K12,0) + ISNULL(B5K13,0) + ISNULL(B5K14,0) > 1",
    "message": "B5K11 sd B5K14 terisi 2 atau lebih",
    "perlakuan": "B5K11 sd B5K14 hanya boleh terisi salah satu",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 43,
    "field": "B5K15Nama",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Nama; B5K7",
    "rule": "ISNULL(B5K7,0) > 0 AND B5K15Nama == \"\"",
    "message": "B5K7 terisi kode 1 atau 2 atau lebih tetapi B5K15Nama tidak diisi",
    "perlakuan": "B5K7 terisi kode 1 atau 2 atau lebih maka B5K15Nama harus terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 44,
    "field": "B5K15Nama",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Nama",
    "rule": "B5K15Nama != \"\" AND ISNUMBER(B5K15Nama) == true",
    "message": "B5K15Nama tidak boleh angka semua",
    "perlakuan": "B5K15Nama tidak boleh angka semua",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 45,
    "field": "B5K10",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K10",
    "rule": "B5K10 != \"\" AND ISNUMBER(B5K10) == true",
    "message": "B5K10 tidak boleh angka semua",
    "perlakuan": "B5K10 tidak boleh angka semua",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 47,
    "field": "B5K15Telpon",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Telpon; B5K15IsWhatsapp",
    "rule": "(B5K15Telpon == \"\" OR B5K15Telpon == \"-\") AND ISNULL(B5K15IsWhatsapp,0) != 0",
    "message": "B5K15Telpon tidak diisi tetapi B5K15IsWhatsapp dicentang",
    "perlakuan": "Jika B5K15IsWhatsapp dicentang maka B5K15Telpon harus terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 48,
    "field": "B5K15Telpon",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Telpon; B5K15IsWhatsapp",
    "rule": "(B5K15Telpon != \"\" AND B5K15Telpon != \"-\") AND ISNULL(B5K15IsWhatsapp,999) == 999",
    "message": "B5K15Telpon terisi tetapi B5K15IsWhatsapp tidak diisi",
    "perlakuan": "Jika B5K15Telpon terisi maka B5K15IsWhatsapp harus terisi, isikan 0 jika bukan no B5K15IsWhatsapp",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 49,
    "field": "B5K15Telpon",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Telpon",
    "rule": "B5K15Telpon != \"\" AND B5K15Telpon != \"-\" AND ISPHONE(B5K15Telpon) == false",
    "message": "Terdapat kesalahan format B5K15Telpon",
    "perlakuan": "B5K15Telpon tidak boleh ada karakter, jumlah digit 10 s.d 13 dan harus diawalin dengan 0",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 50,
    "field": "B5K15Telpon",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Telpon; B5K7",
    "rule": "ISNULL(B5K7,0) > 0 AND B5K15Telpon == \"\"",
    "message": "B5K7 terisi kode 1 atau 2 atau lebih tetapi B5K15Telpon tidak diisi",
    "perlakuan": "B5K7 terisi kode 1 atau 2 atau lebih maka B5K15Telpon harus terisi, jika tidak ada isian, isi -",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 51,
    "field": "B5K15Email",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Email",
    "rule": "B5K15Email != \"\" AND B5K15Email != \"-\" AND ISEMAIL(B5K15Email) == false",
    "message": "Terdapat kesalahan format B5K15Email",
    "perlakuan": "B5K15Email perbaiki sesuai format email",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 52,
    "field": "B5K15Email",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Email; B5K7",
    "rule": "ISNULL(B5K7,0) > 0 AND B5K15Email == \"\"",
    "message": "B5K7 terisi kode 1 atau 2 atau lebih tetapi B5K15Email tidak diisi",
    "perlakuan": "B5K7 terisi kode 1 atau 2 atau lebih maka B5K15Email harus terisi, jika tidak ada isian, isi -",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 53,
    "field": "B5K3_NIK",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K3_NIK",
    "rule": "B5K3_NIK != \"\" AND B5K3_NIK != \"-\" AND (LEN(B5K3_NIK) != 16 OR ISNUMBER(B5K3_NIK) == false)",
    "message": "Terdapat kesalahan format B5K3_NIK",
    "perlakuan": "B5K3_NIK semua harus angka dan jumlah karakter 16",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 54,
    "field": "B5K3_NIK",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K3_NIK",
    "rule": "B5K3_NIK != \"\" AND B5K3_NIK != \"-\" AND ISNUMBER(B5K3_NIK) == false",
    "message": "B5K3_NIK mengandung huruf",
    "perlakuan": "B5K3_NIK tidak boleh ada huruf",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 55,
    "field": "B5K3_NIK",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K3_NIK; IsPreprinted; Tipe",
    "rule": "IsPreprinted == 0 AND Tipe == \"BVB\" AND B5K3_NIK == \"\"",
    "message": "B5K3_NIK tidak terisi",
    "perlakuan": "B5K3_NIK harus terisi, jika tidak tahu isikan \"-\"",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 56,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K7",
    "rule": "B5K7[i]>1 AND COUNT({B5K2==B5K2[i] AND B5K3==B5K3[i]}) != B5K7[i]",
    "message": "Jika B5K7 lebih dari satu maka harus ada pasangan bersesuaian di rumah tangga baru",
    "perlakuan": "B5K7 silahkan diperbaiki, B5K2 pecahan = B5K2 induk, B5K3 pecahan = B5K3 induk",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 57,
    "field": "B5K3Gabung",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K3Gabung",
    "rule": "LEN(B5K3Gabung) < 3",
    "message": "B5K3Gabung terisi kurang dari 3 karakter",
    "perlakuan": "B5K3Gabung harus terisi lebih dari sama dengan 3 karakter",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 58,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K15Nama",
    "rule": "B5K6 == \"0\" AND B5K15Nama !=''",
    "message": "B5K6 terisi 0  tetapi B5K15Nama terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K15Nama seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 59,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K15Telpon",
    "rule": "B5K6 == \"0\" AND B5K15Telpon !=''",
    "message": "B5K6 terisi 0  tetapi B5K15Telpon terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K15Telpon seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 60,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K15Email",
    "rule": "B5K6 == \"0\" AND B5K15Email !=''",
    "message": "B5K6 terisi 0  tetapi B5K15Email terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K15Email seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 61,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K7; B5K15Nama",
    "rule": "B5K7 == 0 AND B5K15Nama !=''",
    "message": "B5K7 terisi 0  tetapi B5K15Nama terisi",
    "perlakuan": "B5K7 terisi 0 maka B5K15Nama seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 62,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K7; B5K15Telpon",
    "rule": "B5K7 == 0 AND B5K15Telpon !=''",
    "message": "B5K7 terisi 0  tetapi B5K15Telpon terisi",
    "perlakuan": "B5K7 terisi 0 maka B5K15Telpon seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 63,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K7; B5K15Email",
    "rule": "B5K7 == 0 AND B5K15Email !=''",
    "message": "B5K7 terisi 0  tetapi B5K15Email terisi",
    "perlakuan": "B5K7 terisi 0 maka B5K15Email seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 64,
    "field": "B5K1_KODE",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K1_KODE",
    "rule": "B5K1_KODE == \"999999\"",
    "message": "B5K1_KODE tidak boleh terisi 999999",
    "perlakuan": "B5K1_KODE tidak boleh terisi 999999",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 65,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K6; B5K15Nama",
    "rule": "B5K6 == \"0\" AND B5K15Nama !=''",
    "message": "B5K6 terisi 0  tetapi B5K15Nama terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K15Nama seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 66,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K6; B5K15Telpon",
    "rule": "B5K6 == \"0\" AND B5K15Telpon !=''",
    "message": "B5K6 terisi 0  tetapi B5K15Telpon terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K15Telpon seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 67,
    "field": "B5K6",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K6; B5K15Email",
    "rule": "B5K6 == \"0\" AND B5K15Email !=''",
    "message": "B5K6 terisi 0  tetapi B5K15Email terisi",
    "perlakuan": "B5K6 terisi 0 maka B5K15Email seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 68,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K7; B5K15Nama",
    "rule": "B5K7 == 0 AND B5K15Nama !=''",
    "message": "B5K7 terisi 0  tetapi B5K15Nama terisi",
    "perlakuan": "B5K7 terisi 0 maka B5K15Nama seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 69,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K7; B5K15Telpon",
    "rule": "B5K7 == 0 AND B5K15Telpon !=''",
    "message": "B5K7 terisi 0  tetapi B5K15Telpon terisi",
    "perlakuan": "B5K7 terisi 0 maka B5K15Telpon seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 70,
    "field": "B5K7",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 3,
    "relFields": "B5K7; B5K15Email",
    "rule": "B5K7 == 0 AND B5K15Email !=''",
    "message": "B5K7 terisi 0  tetapi B5K15Email terisi",
    "perlakuan": "B5K7 terisi 0 maka B5K15Email seharusnya tidak terisi",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 71,
    "field": "B5K10",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K10; B5K9; B5K3",
    "rule": "B5K10 != \"\" AND ( B5K9 == 1  OR B5K9 ==2 ) AND B5K10 == B5K3",
    "message": "B5K10 sama dengan Nama Kepala Keluarga tetapi B5K9 terisi kode 1 atau 2",
    "perlakuan": "B5K9 terisi kode 1 atau 2 maka B5K10 harus berbeda dengan Nama Kepala Keluarga",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 72,
    "field": "B5K5",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K5",
    "rule": "B5K5 !=\"\" AND B5K5 != \"-\" AND ISNUMBER(B5K5) == false",
    "message": "B5K5 ada isian mengandung huruf",
    "perlakuan": "B5K5 harus terisi angka",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 73,
    "field": "B5K4",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K4",
    "rule": "LEN(B5K4) < 3",
    "message": "B5K4 terisi kurang dari 3 karakter",
    "perlakuan": "B5K4 harus terisi lebih dari sama dengan 3 karakter",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 74,
    "field": "B5K10",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K10",
    "rule": "B5K10 !=\"\" AND LEN(B5K10) < 3",
    "message": "B5K10 terisi kurang dari 3 karakter",
    "perlakuan": "B5K10 harus terisi lebih dari sama dengan 3 karakter",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 75,
    "field": "B5K15Nama",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K15Nama",
    "rule": "B5K15Nama !=\"\" AND LEN(B5K15Nama) < 3",
    "message": "B5K15Nama terisi kurang dari 3 karakter",
    "perlakuan": "B5K15Nama harus terisi lebih dari sama dengan 3 karakter",
    "level": "ART",
    "isFatal": true
  },
  {
    "id": 79,
    "field": "B5K9",
    "blok": "Blok V — Daftar Keluarga per SLS",
    "page": 2,
    "relFields": "B5K6; B5K9; IsPreprinted",
    "rule": "IsPreprinted == 0 AND B5K6 == \"9\" AND B5K9 != 2",
    "message": "Rumah tangga baru dan B5K6 terisi '-' tetapi B5K9 tidak terisi 2",
    "perlakuan": "Rumah tangga baru dan B5K6 terisi '-' maka B5K9 harus terisi 2",
    "level": "ART",
    "isFatal": true
  }
];

export default function ErrorKonsistensiTab() {
  const [search, setSearch] = useState("");
  const [filterBlok, setFilterBlok] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const blokOptions = useMemo(
    () => Array.from(new Set(ATURAN_KONSISTENSI.map((r) => r.blok))).sort(),
    []
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ATURAN_KONSISTENSI.filter((r) => {
      if (filterBlok && r.blok !== filterBlok) return false;
      if (!q) return true;
      return (
        r.field.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q) ||
        r.perlakuan.toLowerCase().includes(q) ||
        String(r.id).includes(q)
      );
    });
  }, [search, filterBlok]);

  const selected = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  return (
    <div className="space-y-3 pb-6">
      <div>
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Error Konsistensi</h1>
        <p className="mt-0.5 text-xs text-ink/60 sm:text-sm">
          Katalog {ATURAN_KONSISTENSI.length} rule konsistensi resmi VSEN26.P (Pemutakhiran Keluarga/SLS),
          dibaca langsung dari aplikasi desktop client-nya.
        </p>
      </div>

      <div className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-xs leading-relaxed text-navy-700 sm:text-sm">
        📖 Ini katalog referensi untuk bantu manual cek dokumen Pemutakhiran — belum tersambung ke data hidup
        karena hasil Pemutakhiran (VSEN26.P) belum diupload ke sistem ini. Untuk pengecekan otomatis
        VSEN26.KP &amp; VSEN26.M, lihat tab &quot;Anomali Cepat&quot;.
      </div>

      {/* ---------- Filter ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari field, ID, atau kata kunci pesan..."
          className="min-w-[200px] flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs sm:text-sm"
        />
        <select
          value={filterBlok}
          onChange={(e) => setFilterBlok(e.target.value)}
          className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs sm:text-sm"
        >
          <option value="">Semua Blok</option>
          {blokOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink/40">{filtered.length} rule</span>
      </div>

      {/* ---------- Daftar + Detail (gaya sama dgn dialog desktop) ---------- */}
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
                <tr>
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Deskripsi</th>
                  <th className="px-3 py-2 font-medium">Blok</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer border-t border-line align-top ${
                      selected?.id === r.id ? "bg-navy-50" : "hover:bg-paper/60"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-ink/60">{r.id}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-navy-900">{r.field}</td>
                    <td className="px-3 py-2 text-xs text-ink/70">{r.message}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-ink/50">
                      {r.blok.replace(/^Blok /, "")}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-ink/40">
                      Tidak ada rule yang cocok dengan pencarian ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- Panel detail ---------- */}
        <div className="rounded-lg border border-line bg-white p-4">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs text-ink/50">
                  ID {selected.id} &middot; {selected.field}
                </p>
                <span className="rounded-full bg-rust-100 px-2 py-0.5 text-[10px] font-semibold text-rust-700">
                  {selected.isFatal ? "Wajib Dipenuhi" : "Peringatan"}
                </span>
              </div>

              <div className="mt-3 rounded-md border border-rust-100 bg-rust-100/40 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rust-700">Kesalahan</p>
                <p className="mt-1 text-sm text-rust-700">{selected.message}</p>
              </div>

              <div className="mt-3 rounded-md border border-line bg-navy-50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-navy-700">Perlakuan</p>
                <p className="mt-1 text-sm text-navy-900">{selected.perlakuan}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/50">
                <span>Blok: {selected.blok}</span>
                {selected.page !== null && <span>Halaman: {selected.page}</span>}
                <span>Level: {selected.level}</span>
              </div>

              {selected.relFields && (
                <p className="mt-2 text-xs text-ink/50">
                  Rincian terkait: <span className="font-mono">{selected.relFields}</span>
                </p>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-navy-400 hover:text-navy-700">
                  Tampilkan formula teknis
                </summary>
                <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-ink/5 p-2.5 font-mono text-[11px] leading-relaxed text-ink/70">
                  {selected.rule}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-xs text-ink/40">Pilih salah satu rule di sebelah kiri untuk lihat detail.</p>
          )}
        </div>
      </div>
    </div>
  );
}
