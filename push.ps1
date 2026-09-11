# push.ps1 - jalankan ini tiap kali ada perubahan yang mau di-push
# Cara pakai: buka PowerShell di folder proyek, lalu ketik:  .\push.ps1

$pesan = Read-Host "Tulis deskripsi singkat perubahannya (contoh: perbaiki tampilan form)"
if ([string]::IsNullOrWhiteSpace($pesan)) {
    $pesan = "update"
}

git add .
git commit -m "$pesan"
git push

Write-Host ""
Write-Host "Selesai. Railway akan otomatis build ulang dalam 1-3 menit." -ForegroundColor Green
