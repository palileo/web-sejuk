const APP_DATA = {
  admin: { id: "admin", name: "Admin Indosejuk", role: "Administrator", password: "admin123" },
  ratings: [
    { value: 1, label: "1 Bintang", score: 20 },
    { value: 2, label: "2 Bintang", score: 40 },
    { value: 3, label: "3 Bintang", score: 60 },
    { value: 4, label: "4 Bintang", score: 80 },
    { value: 5, label: "5 Bintang", score: 100 }
  ],
  members: [
    { id: "brur", name: "Brur", role: "Ketua Pengurus", focus: "Arah organisasi, keputusan, pengawasan" },
    { id: "priyo", name: "Priyo", role: "Manager Marketing", focus: "Pemasaran, penjualan, pasar, harga produk" },
    { id: "wawan", name: "Wawan", role: "Sekretaris Umum", focus: "Administrasi, notulen, arsip, evaluasi" },
    { id: "anang", name: "Anang", role: "Bendahara Umum", focus: "Keuangan, kas, laporan, pembagian hasil" },
    { id: "topik", name: "Topik", role: "Manager Lapangan / Operasional", focus: "Alur kerja, tugas lapangan, operasional" },
    { id: "wisnu", name: "Wisnu", role: "Pengawas Koperasi", focus: "Pengawasan pengurus, evaluasi kerja, transparansi, kontrol organisasi" }
  ],
  checklists: {
    brur: [
      { no: 1, area: "Kepemimpinan", task: "Aktif memimpin rapat koperasi", frequency: "Mingguan", weight: 10 },
      { no: 2, area: "Kepemimpinan", task: "Menetapkan arah organisasi secara jelas", frequency: "Mingguan", weight: 10 },
      { no: 3, area: "Keputusan", task: "Berani mengambil keputusan penting", frequency: "Mingguan", weight: 10 },
      { no: 4, area: "Pengawasan", task: "Memastikan setiap keputusan rapat dijalankan", frequency: "Mingguan", weight: 10 },
      { no: 5, area: "Pengawasan", task: "Meminta laporan dari setiap bagian", frequency: "Mingguan", weight: 10 },
      { no: 6, area: "Keuangan", task: "Mengawasi keuangan bersama bendahara secara rutin", frequency: "Mingguan", weight: 10 },
      { no: 7, area: "Koordinasi", task: "Menjadi penengah jika terjadi perbedaan pendapat", frequency: "Mingguan", weight: 10 },
      { no: 8, area: "Disiplin", task: "Tidak membiarkan masalah menggantung", frequency: "Mingguan", weight: 10 },
      { no: 9, area: "Disiplin", task: "Menegur pengurus yang tidak menjalankan tugas", frequency: "Mingguan", weight: 10 },
      { no: 10, area: "Arah Organisasi", task: "Menjaga koperasi tetap sesuai prinsip dan tujuan", frequency: "Mingguan", weight: 10 }
    ],
    priyo: [
      { no: 1, area: "Produk/Jasa", task: "Membuat daftar produk atau jasa yang akan dipasarkan", frequency: "Mingguan", weight: 10 },
      { no: 2, area: "Target", task: "Menyusun target penjualan", frequency: "Mingguan", weight: 10 },
      { no: 3, area: "Strategi", task: "Membuat strategi promosi koperasi", frequency: "Mingguan", weight: 10 },
      { no: 4, area: "Pasar", task: "Menentukan target pasar", frequency: "Mingguan", weight: 10 },
      { no: 5, area: "Mitra", task: "Mencari calon pembeli atau mitra", frequency: "Mingguan", weight: 10 },
      { no: 6, area: "Harga", task: "Membuat aturan harga bersama bendahara dan ketua", frequency: "Mingguan", weight: 10 },
      { no: 7, area: "Penjualan", task: "Menyusun sistem penjualan yang jelas", frequency: "Mingguan", weight: 10 },
      { no: 8, area: "Promosi", task: "Membuat agenda promosi rutin", frequency: "Mingguan", weight: 10 },
      { no: 9, area: "Laporan", task: "Melaporkan perkembangan pasar secara berkala", frequency: "Mingguan", weight: 10 },
      { no: 10, area: "Peluang", task: "Membawa peluang nyata, bukan hanya ide", frequency: "Mingguan", weight: 10 }
    ],
    wawan: [
      { no: 1, area: "Notulen", task: "Setiap rapat memiliki notulen tertulis", frequency: "Mingguan", weight: 10 },
      { no: 2, area: "Dokumen", task: "Menyusun dokumen dasar koperasi", frequency: "Mingguan", weight: 10 },
      { no: 3, area: "Keputusan", task: "Mencatat keputusan dan pembagian tugas", frequency: "Mingguan", weight: 10 },
      { no: 4, area: "Arsip", task: "Mengarsipkan data anggota, program, dan kegiatan", frequency: "Mingguan", weight: 10 },
      { no: 5, area: "Laporan", task: "Membuat format laporan kerja tiap bagian", frequency: "Mingguan", weight: 10 },
      { no: 6, area: "Pengingat", task: "Mengingatkan pengurus terhadap tugas yang disepakati", frequency: "Mingguan", weight: 10 },
      { no: 7, area: "Evaluasi", task: "Menyusun indikator evaluasi keseriusan pengurus", frequency: "Mingguan", weight: 10 },
      { no: 8, area: "Objektivitas", task: "Mencatat perkembangan tiap orang secara objektif", frequency: "Mingguan", weight: 10 },
      { no: 9, area: "Sistem", task: "Menjaga sistem administrasi tetap rapi", frequency: "Mingguan", weight: 10 },
      { no: 10, area: "Akurasi", task: "Membedakan janji, rencana, dan tindakan nyata", frequency: "Mingguan", weight: 10 }
    ],
    anang: [
      { no: 1, area: "Kas", task: "Mencatat seluruh uang masuk dan keluar", frequency: "Mingguan", weight: 10 },
      { no: 2, area: "Laporan", task: "Membuat laporan kas koperasi", frequency: "Mingguan", weight: 10 },
      { no: 3, area: "Bukti", task: "Menyimpan bukti transaksi", frequency: "Mingguan", weight: 10 },
      { no: 4, area: "Transparansi", task: "Laporan keuangan bisa diperiksa", frequency: "Mingguan", weight: 10 },
      { no: 5, area: "Pembagian Hasil", task: "Menyusun sistem pembagian hasil tertulis", frequency: "Mingguan", weight: 10 },
      { no: 6, area: "Anggaran", task: "Mengatur pos anggaran kebutuhan mendesak", frequency: "Mingguan", weight: 10 },
      { no: 7, area: "Koordinasi", task: "Berkoordinasi dengan marketing soal harga dan penjualan", frequency: "Mingguan", weight: 10 },
      { no: 8, area: "Koordinasi", task: "Berkoordinasi dengan ketua soal pengawasan keuangan", frequency: "Mingguan", weight: 10 },
      { no: 9, area: "Disiplin", task: "Tidak menunda laporan uang", frequency: "Mingguan", weight: 10 },
      { no: 10, area: "Integritas", task: "Tidak mencampur uang pribadi dengan uang koperasi", frequency: "Mingguan", weight: 10 }
    ],
    topik: [
      { no: 1, area: "Tugas Lapangan", task: "Membuat daftar tugas lapangan", frequency: "Mingguan", weight: 10 },
      { no: 2, area: "Jadwal", task: "Menyusun jadwal kerja atau pembagian tugas", frequency: "Mingguan", weight: 10 },
      { no: 3, area: "Alur Kerja", task: "Menyusun alur kerja dari pesanan sampai penyelesaian", frequency: "Mingguan", weight: 10 },
      { no: 4, area: "Pengawasan", task: "Mengawasi pelaksanaan tugas di lapangan", frequency: "Mingguan", weight: 10 },
      { no: 5, area: "Kendala", task: "Melaporkan kendala operasional dengan jelas", frequency: "Mingguan", weight: 10 },
      { no: 6, area: "Pemerataan", task: "Memastikan pekerjaan tidak dibebankan kepada orang tertentu", frequency: "Mingguan", weight: 10 },
      { no: 7, area: "Kerapihan", task: "Menjaga kerapihan proses kerja", frequency: "Mingguan", weight: 10 },
      { no: 8, area: "Kepatuhan", task: "Menjalankan operasional sesuai keputusan rapat", frequency: "Mingguan", weight: 10 },
      { no: 9, area: "Kualitas", task: "Menghindari kerja asal-asalan", frequency: "Mingguan", weight: 10 },
      { no: 10, area: "Laporan", task: "Membawa laporan nyata dari lapangan, bukan hanya keluhan", frequency: "Mingguan", weight: 10 }
    ],
    wisnu: [
      { no: 1, area: "Pengawasan", task: "Memantau perkembangan kerja setiap pengurus", frequency: "Mingguan", weight: 10 },
      { no: 2, area: "Keputusan", task: "Memastikan keputusan rapat benar-benar dijalankan", frequency: "Mingguan", weight: 10 },
      { no: 3, area: "Pemeriksaan", task: "Memeriksa laporan administrasi, keuangan, pemasaran, dan operasional", frequency: "Mingguan", weight: 10 },
      { no: 4, area: "Teguran", task: "Berani menegur jika ada tugas yang tidak dijalankan", frequency: "Mingguan", weight: 10 },
      { no: 5, area: "Transparansi", task: "Mengawasi transparansi keuangan bersama ketua dan bendahara", frequency: "Mingguan", weight: 10 },
      { no: 6, area: "Integritas", task: "Memastikan tidak ada penyalahgunaan wewenang, uang, atau keputusan", frequency: "Mingguan", weight: 10 },
      { no: 7, area: "Objektivitas", task: "Menilai keseriusan pengurus berdasarkan bukti kerja nyata", frequency: "Mingguan", weight: 10 },
      { no: 8, area: "Laporan", task: "Memberikan laporan hasil pengawasan kepada forum rapat", frequency: "Mingguan", weight: 10 },
      { no: 9, area: "Netralitas", task: "Tidak memihak kepada satu orang atau kelompok tertentu", frequency: "Mingguan", weight: 10 },
      { no: 10, area: "Konstruktif", task: "Memberikan masukan membangun, bukan hanya menyalahkan", frequency: "Mingguan", weight: 10 }
    ]
  }
};
