# Terminal Cakrawala University — v0.2

Versi berikutnya dari arsip Terminal IDX yang diberikan pengguna. Aplikasi web lokal untuk riset saham Indonesia dan pembelajaran pasar modal. Identitas visual baru: tema gelap navy, teal, emas, ikon SVG lokal, serta layout desktop dan seluler.

## Jalankan

Prasyarat runtime: **Node.js 24 atau lebih baru**. Aplikasi tidak memerlukan dependensi runtime, database eksternal, API key, atau proses build.

```bash
cd Terminal-Cakrawala-University
npm start
```

Pada workspace cloud ini, folder proyek berada di `/workspace/Finterminal/cakrawala`; jalankan perintah dari folder tersebut.

Port default **3100**, host default **127.0.0.1**. Konfigurasi non-rahasia:

- `PORT`: port server.
- `HOST`: alamat binding.
- `ALLOWED_HOSTS`: hostname yang diizinkan, dipisah koma, jika dipakai di reverse proxy.
- `DATA_FILE`: lokasi penyimpanan JSON pribadi. Default `data/store.json`, ditulis atomik dengan permission 0600.

Ini masih aplikasi lokal satu pengguna. `ALLOWED_HOSTS` tidak menggantikan autentikasi dan tidak menjadikannya siap untuk hosting publik multi-pengguna.

## Alur riset baru

| Perintah | Perilaku |
|---|---|
| `BBCA DES` | Memilih BBCA dan membuka company overview |
| `BMRI FA` | Memilih BMRI dan membuka laporan keuangan |
| `BBRI GP` | Memilih BBRI dan membuka grafik/indikator |
| `DES`, `FA`, `GP` | Membuka fungsi sambil mempertahankan emiten terpilih |
| `EQS` | Membuka equity screener |
| `PORT` | Membuka portofolio pribadi |
| `BT` | Membuka Strategy Lab |
| `NEWS`, `AI`, `HOME` | Berita, asisten riset, dan workspace |

Tekan **Ctrl/⌘ K**, ketik kode/nama emiten atau perintah. Gunakan ↑/↓ dan Enter. Escape menutup pencarian atau fullscreen grafik.

- **Workspace:** kartu indeks, grafik, watchlist, snapshot perusahaan, dan insight. Pilihan emiten terhubung ke DES/FA/GP. Tiga layout tersimpan: riset seimbang, fokus grafik, monitor pasar.
- **DES:** profil, valuasi, profitabilitas, statistik, dan pembanding emiten dari katalog tersedia. Klik peer untuk mengubah konteks riset.
- **FA:** laporan laba-rugi, neraca, dan arus kas tahunan; ubah tampilan miliar/juta/unit penuh. Grafik revenue/laba dan tanggal laporan tersedia.
- **GP:** candlestick/area, volume, SMA20/SMA50, pilihan periode, fullscreen, ekspor OHLCV, RSI/EMA/MACD/ATR berbasis engine formula lokal.
- **EQS:** katalog terbatas **39 emiten**, atau watchlist pribadi. Filter nama/sektor/P-E/P-B/ROE/dividend yield/volume, preset Value/Quality/Income/Momentum, sorting, preset tersimpan, dan ekspor CSV.
- **Modul sebelumnya dipertahankan:** portfolio, Strategy Lab/backtest, paper trading, chat AI, kalkulator, settings, serta profile.

## Sumber dan ketepatan interpretasi

Mode awal adalah **Simulasi pembelajaran**. Semua harga, rasio, dan laporan pada mode ini merupakan angka sintetis deterministik, bukan fakta pasar atau laporan aktual perusahaan. Berita di mode ini adalah judul materi edukasi, bukan berita terkini. Nama emiten dipakai sebagai konteks belajar. Neraca dan rasio simulasi dihitung dari dataset yang sama.

Mode **Yahoo Finance** memakai endpoint sumber asli. Harga bisa tertunda. Kegagalan sumber ditampilkan sebagai error; aplikasi tidak mengganti data live dengan simulasi secara diam-diam. Data fundamental tertentu dapat tidak tersedia. Nilai kosong ditampilkan `—`; pada screener, nilai kosong tidak lolos filter metrik tersebut.

Screener **bukan seluruh BEI** dan tidak memiliki master saham historis point-in-time. Cakupan harga dan fundamental ditampilkan. Katalog default berisi 39 emiten; mode watchlist mengikuti pilihan pengguna.

Domain HTTPS untuk fitur live:

- Yahoo: `query1.finance.yahoo.com`, `query2.finance.yahoo.com`, `fc.yahoo.com`.
- Berita: `www.cnbcindonesia.com`, `finance.detik.com`, `www.antaranews.com`, `www.idxchannel.com`, `www.cnnindonesia.com`.
- Crypto lama: `indodax.com`.

AI tetap opsional dan mengikuti pengaturan provider pengguna. Kunci API disamarkan dari respons, tetapi tersimpan sebagai teks pada file lokal berpermission 0600. Jangan memasukkan kunci dalam arsip distribusi. Aplikasi tidak mengirim order riil.

## Perbaikan keandalan yang disertakan

- Menolak periode indikator negatif, nol, pecahan, infinite, dan terlalu besar; memperkuat offset `Ref`.
- Menguji bahwa perubahan bar masa depan tidak mengubah sinyal masa lalu untuk formula kausal.
- Memvalidasi lot/harga/fee paper order serta transaksi kronologis portofolio; menolak penjualan sebelum memiliki saham.
- Cache seri harga memiliki TTL, dibedakan per mode, dan dibuang saat request gagal.
- Posisi `closeAtEnd` tidak lagi dilaporkan terbuka; exposure walk-forward ikut digabungkan.
- Membatasi grid optimasi sebelum alokasi kombinasi besar.
- Request direktori tidak mematikan server; unknown API ditolak; respons data pribadi `no-store`; penyimpanan atomik.
- Runner tes mengembalikan exit nonzero jika gagal. Kalkulator TVM menangani bunga nol.

Ini tidak menyelesaikan seluruh keterbatasan engine lama: backtest masih long-only, tanpa aturan likuiditas/ARA-ARB historis, tanpa universe bebas survivorship bias, tanpa model corporate actions lengkap. Monte Carlo masih aproksimasi trade bootstrap. Walk-forward melikuidasi posisi pada batas fold. Gunakan untuk riset/pembelajaran dengan memahami asumsi tersebut.

## Pengujian

```bash
npm test
```

Menjalankan 37 pemeriksaan asli dan 16 tes regresi/integrasi baru. Untuk tes UI:

```bash
npm ci
npm run test:browser
```

Playwright hanya dependensi pengembangan. Browser test memulai server terisolasi dan store sementara sendiri. Chromium sistem default `/usr/bin/chromium`; atur `CHROMIUM_PATH` jika berbeda, atau gunakan instalasi Chromium yang sesuai. Tes tidak memanggil AI atau membutuhkan market feed live.

Variabel tes opsional: `CAKRAWALA_TEST_URL`, `CAKRAWALA_SCREENSHOTS`, `CHROMIUM_PATH`. Pengujian browser mencakup 14 alur, termasuk command bar, sinkronisasi emiten, filter/export/preset, paper order, ledger, backtest, tampilan seluler, serta penanganan kegagalan sumber.

## Penyimpanan dan struktur

- `data/store.json`: profil, watchlist, transaksi, paper account, chat, dan pengaturan AI; diabaikan Git dan tidak termasuk arsip rilis.
- `localStorage`: sumber data, emiten/fungsi terakhir, layout, serta preset screener. Tersimpan per browser/origin.
- `api/`: handler server, adapter Yahoo/RSS, katalog simulasi, screener.
- `public/js/`: shell, chart, riset DES/FA/GP, screener, dan modul lama.
- `tests/`: tes asli, regresi Node, serta browser workflow.

Sumber arsip Terminal IDX asli tetap terpisah dan tidak diubah. Proyek lama Finterminal di root repository juga dipertahankan; aplikasi baru ini berada di subfolder `cakrawala`.

Grafik memakai Lightweight Charts 4.1.3 dari arsip awal. Copyright dan header lisensi upstream dipertahankan. Kode C++/Python Fincept tidak dibundel sebagai dependensi aplikasi ini.
