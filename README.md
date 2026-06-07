# Aplikasi Checklist Kinerja & Pembagian SHU Pengurus Koperasi

Aplikasi web responsif untuk checklist kinerja pengurus koperasi dan simulasi pembagian SHU. Proyek ini siap diunggah ke shared hosting/cPanel seperti Arenhost karena hanya memakai HTML, CSS, JavaScript, PHP, dan MySQL tanpa proses build.

## Fitur

- Login admin dan akun pengguna yang sudah diverifikasi.
- Pengurus tidak bisa mengisi checklist dirinya sendiri.
- Pengurus bisa mengisi checklist pengurus lain.
- Checklist, bobot, kategori, dan rumus SHU mengikuti struktur file Excel.
- Dashboard otomatis membaca seluruh data checklist yang tersimpan.
- Nilai keseriusan otomatis dihitung dari semua penilaian yang masuk.
- Pembagian SHU otomatis: pengurus mendapat 90% berdasarkan proporsi nilai keseriusan, anggota mendapat 10% dibagi rata.
- Panel admin **Arus Kas** untuk import file `.xlsx`, melihat isi sheet, mengedit nilai sel, dan membuka kembali file asli.
- Import arus kas otomatis membaca `Dashboard!H17` sebagai **Input Total SHU**, `SHU!C11` sebagai persentase SHU pengurus, dan `SHU!C9` sebagai persentase SHU anggota.
- Panel checklist memakai rating 1 sampai 5 bintang, setiap bintang bernilai 20 poin.
- Bukti penilaian mendukung upload gambar dari device/kamera dan otomatis dikonversi ke WebP di browser.
- Dashboard profil user lengkap dengan data diri dan foto profil WebP.
- Penyimpanan data tersinkron ke MySQL melalui `api.php`, dengan fallback `localStorage`.
- Bisa diinstal dari browser sebagai aplikasi/PWA melalui tombol **Instal App**.
- Sign up pengguna baru dengan antrean verifikasi admin.
- Dashboard admin untuk approve/reject pengguna baru.
- Tab admin **Penilaian** untuk melihat semua aktivitas penilaian user dan data pembagian SHU semua user.
- Manajemen user admin untuk edit dan hapus akun.
- Admin dapat mengubah password user melalui manajemen user.
- Form sign up berisi data diri: nama, alamat, tanggal lahir, dan nomor WA.

## Akses Pengguna

Pengguna baru harus mengisi form **Daftar Pengguna Baru**. Dropdown akses hanya menampilkan jabatan/status, termasuk opsi **Anggota**. Setelah itu admin login dan membuka tab **Admin** untuk memilih **Approve** atau **Reject**. Akun yang disetujui bisa login memakai password yang diajukan.

Akun admin disembunyikan dari dropdown login normal. Saat membuka `https://mak.indosejuk.my.id`, akun admin tidak ditampilkan baik di browser, app desktop, maupun app mobile.

Akun admin hanya ditampilkan saat membuka halaman admin lewat browser. Halaman ini hanya menampilkan akun admin, dan tidak menampilkan akun admin pada versi app desktop/mobile yang diinstal. Untuk masuk sebagai admin, buka di browser:

```text
https://mak.indosejuk.my.id/admin
```

Role **Anggota** melihat dashboard, profil, dan panel pembagian SHU. Panel pembagian SHU hanya menampilkan user yang sudah approved. Persentase anggota adalah 10% dari total SHU, lalu dibagi rata jika ada lebih dari satu anggota approved.

Panel **Isi Checklist** dan **Data Penilaian** hanya memakai data user pengurus yang sudah sign up dan di-approve admin.

User biasa hanya melihat hasil penilaian tanpa identitas pemberi nilai. Identitas evaluator hanya tampil untuk admin pada tab **Penilaian**.

Panel **Pengaturan** hanya ditampilkan untuk admin.

Panel **Arus Kas** hanya ditampilkan untuk admin. File `.xlsx` yang diimport disimpan ke database hosting bersama hasil pembacaan sheet, sehingga bisa tampil lagi setelah sinkron ke database. Ukuran file import dibatasi maksimal 4 MB agar sinkronisasi tetap stabil di shared hosting. Tombol **Buka File Arus Kas** mengambil file dari endpoint database hosting dan tersedia di dashboard user saat file sudah diimport.

## Cara Menjalankan Lokal

Buka `index.html` langsung di browser, atau jalankan server lokal:

```bash
python -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Upload ke Arenhost/cPanel

1. Masuk ke cPanel Arenhost.
2. Buka **File Manager**.
3. Masuk ke folder domain, biasanya `public_html` atau folder addon domain.
4. Upload semua file proyek ini ke folder:
   - `indoseju/mak.indosejuk.my.id`
5. File utama yang wajib ada:
   - `index.html`
   - `style.css`
   - `app.js`
   - `api.php`
   - `config.php`
   - `manifest.webmanifest`
   - `sw.js`
   - folder `icons`
   - `.htaccess`
   - `.nojekyll` boleh ikut diupload, tidak mengganggu hosting.
6. Pastikan `index.html` berada langsung di root folder domain, bukan di dalam subfolder tambahan.
7. Edit `config.php`, lalu isi password database dari cPanel pada baris:
   - `DB_PASS`
8. Buka domain di browser. `api.php` otomatis membuat tabel database yang dibutuhkan dan mengisi data referensi awal jika tabel masih kosong.
9. Login admin melalui `https://mak.indosejuk.my.id/admin`.

Data database yang disiapkan untuk versi backend:

- Database: `indoseju_mak_db`
- User database: `indoseju_mak`
- Folder domain: `indoseju/mak.indosejuk.my.id`

Versi ini menyimpan data penilaian, akun, request, total SHU, persentase SHU, dan file arus kas ke tabel `app_state` di MySQL melalui `api.php`. Data role dan checklist dimuat dari tabel `app_roles` dan `app_checklist_items`, bukan dari file JavaScript statis. Browser tetap menyimpan salinan lokal sebagai fallback jika koneksi database sedang gagal.

File `.htaccess` sudah disiapkan untuk:

- menjadikan `index.html` sebagai halaman utama,
- mematikan directory listing,
- mengaktifkan kompresi bila server mendukung,
- menambahkan header keamanan dasar,
- mengarahkan request non-file kembali ke `index.html`.

## Upload ke GitHub

URL publik:

```bash
https://palileo.github.io/web-sejuk/
```

Perintah dari folder proyek:

```bash
git init
git branch -M main
git add -A
git commit -m "Siapkan aplikasi checklist SHU untuk hosting"
git remote add origin https://github.com/palileo/web-sejuk.git
git push -u origin main
```

## Catatan Produksi

Versi ini adalah prototipe front-end dengan sinkronisasi MySQL melalui `api.php`. Data checklist, akun, request sign up, total SHU, persentase SHU, dan file arus kas disimpan di database dengan salinan lokal browser sebagai cadangan saat koneksi API gagal.

Password aplikasi statis masih tersimpan di browser/file JavaScript, sehingga belum aman untuk data sensitif. Gunakan versi backend sebelum aplikasi dipakai sebagai sistem resmi multi-pengguna.

## Rumus yang Dipakai

- 1 bintang = 20
- 2 bintang = 40
- 3 bintang = 60
- 4 bintang = 80
- 5 bintang = 100
- Nilai keseriusan = total skor bobot / total bobot yang dinilai
- Total SHU diambil otomatis dari sheet `Dashboard` sel `H17` jika file arus kas sudah diimport
- Persentase SHU pengurus diambil dari sheet `SHU` sel `C11`, fallback 90% jika belum ada file
- Persentase SHU pengurus = persentase pengurus × nilai keseriusan pengurus / total nilai keseriusan semua pengurus
- Persentase SHU anggota diambil dari sheet `SHU` sel `C9`, fallback 10% jika belum ada file
- Persentase SHU anggota = persentase anggota / jumlah anggota approved
- Nominal SHU = total SHU × persentase SHU
