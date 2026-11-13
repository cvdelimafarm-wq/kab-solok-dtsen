# push.ps1 - jalankan ini tiap kali ada perubahan yang mau di-push
# Cara pakai: buka PowerShell di folder proyek, lalu ketik:  .\push.ps1
# (14 Nov 2026, aturan luring L9) Seluruh tes (npm test) wajib lulus sebelum push. Bila gagal, push dibatalkan; laporkan ke Claude.

$pesan = Read-Host "Tulis deskripsi singkat perubahannya (contoh: perbaiki tampilan form)"
if ([string]::IsNullOrWhiteSpace($pesan)) {
    $pesan = "update"
}

Write-Host ""
Write-Host "Menjalankan tes (npm test)..." -ForegroundColor Cyan
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Tes GAGAL. Push dibatalkan; tidak ada yang dikirim. Salin pesan galat di atas ke Claude." -ForegroundColor Red
    exit 1
}

git add .
git commit -m "$pesan"
git push

Write-Host ""
Write-Host "Selesai. Railway akan otomatis build ulang dalam 1-3 menit." -ForegroundColor Green
