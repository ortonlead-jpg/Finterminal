# Terminal Cakrawala University v0.2

Versi web untuk riset dan pembelajaran pasar modal Indonesia, dikembangkan dari Terminal IDX.

## Unduh aplikasi

- [Download ZIP v0.2](https://github.com/ortonlead-jpg/Finterminal/raw/refs/heads/main/downloads/Terminal-Cakrawala-University-v0.2.zip)
- [Download TAR.GZ v0.2](https://github.com/ortonlead-jpg/Finterminal/raw/refs/heads/main/downloads/Terminal-Cakrawala-University-v0.2.tar.gz)
- [Periksa checksum](downloads/SHA256SUMS.txt)

Jika tautan langsung meminta login, masuk dengan akun GitHub yang memiliki akses ke repositori ini. Anda juga dapat membuka folder `downloads`, memilih file ZIP, lalu menekan **Download raw file**.

## Menjalankan setelah ekstraksi

Instal Node.js 24 atau lebih baru. Buka terminal di folder hasil ekstraksi `Terminal-Cakrawala-University`, kemudian jalankan:

```bash
npm start
```

Server berjalan lokal pada port 3100. Tidak perlu `npm install` untuk menjalankan aplikasi; tidak ada dependensi runtime atau proses build.

Untuk memeriksa engine dan API, jalankan `npm test`. Untuk tes browser, jalankan `npm ci` lalu `npm run test:browser` dengan Chromium terpasang.

## Fitur

- Identitas dan UI baru, termasuk tampilan desktop dan seluler.
- Command bar: `BBCA DES`, `BMRI FA`, `BBRI GP`, `EQS`, `PORT`, `BT`, `NEWS`, `AI`, `HOME`.
- Konteks emiten tersinkron, layout workspace tersimpan, profil perusahaan, laporan keuangan, grafik, dan indikator.
- Screener katalog terbatas 39 emiten atau watchlist, dengan filter, preset, sorting, serta ekspor CSV.
- Modul portofolio, backtesting, paper trading, AI chat, dan kalkulator.
- Perbaikan validasi formula, order, ledger, cache, beberapa metrik backtest, dan ketahanan server.

Default adalah **simulasi pembelajaran yang diberi label**, bukan data pasar atau laporan aktual. Mode Yahoo memerlukan akses jaringan dan ketersediaan provider; kegagalan data tidak otomatis diganti simulasi. Screener bukan cakupan seluruh BEI. Tidak ada order riil.

Paket tidak menyertakan data pribadi, API key, node_modules, atau hasil tes browser. Aplikasi masih ditujukan untuk penggunaan lokal satu pengguna.

Kode sumber: [cakrawala](cakrawala/). Dokumentasi: [README aplikasi](cakrawala/README.md).

Validasi versi 0.2: 37 pemeriksaan asli, 16 tes regresi/API, serta 14 alur browser lulus.
