# Konteks Proyek: TeleHeart Backend

> File ini untuk asisten AI (Gemini di Antigravity) dan anggota tim. **Baca file ini lebih dulu**, lalu rujuk dokumen di `docs/` sebelum menulis kode.

## 1. Tentang Proyek

TeleHeart adalah platform telehealth khusus pemeriksaan jantung. Pasien memakai aplikasi Android (Flutter), dokter dan admin memakai website (Next.js). Pasien mengisi tanda vital, memilih dokter online, membayar lewat Mayar, chat 1:1 dengan dokter, lalu mengunduh resep PDF. Ada fitur prediksi risiko jantung yang berjalan on-device di mobile dan hanya menyimpan hasilnya ke server.

**Repo ini adalah backend** (REST API). Web dan mobile ada di repo lain dan memanggil API ini.

## 2. Dokumen Rujukan (sumber kebenaran)

| File | Isi | Kapan dibaca |
|---|---|---|
| `docs/PRD.md` | Alur bisnis, aturan bisnis (BR-xx), kebutuhan fungsional (FR-xx), matriks akses | Sebelum membuat logika modul apa pun |
| `docs/ERD.md` | Skema tabel, enum, relasi, aturan RLS, indeks | Sebelum membuat migration atau query |
| `docs/FLOWCHART.md` | Diagram alur sistem, sequence diagram & state machine | Untuk memahami visualisasi alur bisnis & arsitektur |
| `docs/API.md` | Kontrak endpoint, format request/response, kode error | Sebelum membuat route. **Respons harus persis sesuai kontrak** |

Jika ada konflik antar dokumen atau sesuatu tidak jelas, **berhenti dan tanyakan**, jangan menebak. Jika perlu mengubah kontrak API, ubah `docs/API.md` dan catat di Riwayat Perubahan.

## 3. Stack

| Bagian | Teknologi |
|---|---|
| Runtime | Node.js, TypeScript |
| Framework | Express, dibungkus `serverless-http` |
| Deploy | Netlify Functions |
| Database, Auth, Realtime, Storage | Supabase (PostgreSQL) |
| Pembayaran | Mayar (invoice + webhook) |
| Push notification | Firebase Cloud Messaging |
| Validasi input | Zod |
| PDF resep | Library PDF di Node (mis. `pdf-lib`) + QR code |

## 4. Struktur Folder

```
teleheart-backend/
├── netlify/functions/
│   ├── api.ts            # Express app dibungkus serverless-http
│   └── jobs-tick.ts      # Function terjadwal (BUKAN Express)
├── src/
│   ├── app.ts            # Instance Express, middleware, mount router /api/v1
│   ├── config/env.ts     # Baca dan validasi environment variable
│   ├── lib/              # supabase, mayar, fcm, pdf, crypto (NIK), audit
│   ├── middleware/       # auth, requireRole, validate, errorHandler, rateLimit
│   ├── modules/          # satu folder per modul
│   │   ├── auth/ patients/ doctors/ consultations/ chat/
│   │   ├── payments/ prescriptions/ predictions/
│   │   └── notifications/ admin/
│   │       └── (tiap modul: routes.ts, controller.ts, service.ts, schema.ts)
│   └── jobs/             # logika job: timeout dokter, sesi habis, invoice
├── supabase/migrations/  # SQL dari ERD.md, berurutan
├── docs/                 # PRD.md, ERD.md, API.md
├── netlify.toml
├── .env.example
└── README.md
```

Pola per modul: **routes** (definisi endpoint) → **controller** (baca request, panggil service, kirim respons) → **service** (logika bisnis dan query). Logika bisnis tidak boleh ada di controller.

## 5. Aturan Wajib (jangan dilanggar)

### Keamanan dan privasi
1. **`SUPABASE_SERVICE_ROLE_KEY`, API key Mayar, dan kredensial Firebase hanya dibaca dari environment variable.** Tidak boleh ada di kode, log, atau repo.
2. **Admin tidak boleh mengakses data medis**: profil kesehatan, tanda vital, isi chat, isi resep, prediksi. Endpoint admin hanya mengembalikan metadata. Lihat matriks akses di PRD bagian 3.
3. Dokter hanya mengakses pasien yang ditugaskan kepadanya (penugasan `offered`/`accepted` atau pernah ditangani). Riwayat dari dokter lain tidak memuat **isi chat**.
4. Prediksi (`prediction_logs`) tidak boleh dibaca dokter maupun admin.
5. **NIK**: simpan terenkripsi (`nik_encrypted`) dan hash (`nik_hash`). Jangan pernah mengembalikan NIK utuh di respons (pakai `nik_masked`) dan jangan menulisnya ke log.
6. Jangan menulis data medis atau isi chat ke log aplikasi.
7. Setiap akses ke data pasien oleh dokter (profil, tanda vital, riwayat, chat, resep) **dicatat di `audit_logs`**.
8. Semua endpoint selain yang bertanda Publik di `API.md` wajib melewati middleware auth dan cek peran. Cek kepemilikan data di service, bukan hanya peran.
9. File di Storage bersifat private, diakses lewat signed URL berumur pendek.
10. CORS hanya untuk origin yang ada di `CORS_ALLOWED_ORIGINS`.

### Aturan bisnis kritis
1. **Status pembayaran hanya berubah lewat webhook Mayar**, tidak pernah dari klien. Webhook harus divalidasi keasliannya dan **idempotent** (event ganda tidak boleh menggandakan efek).
2. Harga di-**snapshot** saat checkout: `total_amount = doctor_fee + platform_fee`, tidak berubah setelah itu.
3. Transisi status konsultasi divalidasi di backend sesuai diagram di PRD 5.4 (`draft → waiting_payment → waiting_doctor → active → closed`, atau `cancelled`). Aksi di status yang salah → `INVALID_STATE`.
4. Pesan chat hanya boleh dikirim saat status `active`.
5. Pasien hanya boleh punya satu konsultasi berjalan (`waiting_payment`, `waiting_doctor`, `active`).
6. Resep hanya dapat diunduh jika sudah `issued` dan pembayaran `paid`. Resep terbit tidak dapat diubah.
7. Backend adalah sumber kebenaran evaluasi peringatan darurat tanda vital (ambang di PRD 7.5).
8. Durasi konsultasi hanya 15, 30, atau 60 menit.
9. Role dan platform: pasien hanya login dengan `X-Client-Platform: mobile`, dokter dan admin dengan `web`.

### Konvensi kode
- Format respons dan error persis seperti `API.md` bagian 1.2. Gunakan satu error handler terpusat dan class error dengan `code` dan status HTTP.
- Validasi semua input dengan Zod di `schema.ts` masing-masing modul. Pesan error untuk pengguna dalam Bahasa Indonesia.
- Nama field JSON dan kolom database `snake_case`. Waktu disimpan dan dikirim UTC (ISO 8601).
- Uang selalu integer Rupiah.
- Jangan membuat endpoint, field, atau tabel di luar dokumen tanpa konfirmasi.
- Tulis komentar singkat hanya untuk logika yang tidak jelas. Jangan menambah dependensi besar tanpa alasan.
- Tangani error dari layanan luar (Supabase, Mayar, FCM) dan kembalikan `INTERNAL_ERROR` tanpa membocorkan detail.

## 6. Cara Kerja dengan AI (saran)

Kerjakan **satu modul per permintaan**, jangan sekaligus. Urutan yang disarankan:

| # | Modul | Hasil yang dicek |
|---|---|---|
| 0 | Setup: project, `netlify.toml`, `api.ts`, `GET /health`, deploy staging | URL staging merespons |
| 1 | Migration Supabase dari `ERD.md` + RLS dasar | Tabel dan enum terbentuk |
| 2 | Auth (register pasien/dokter, login, refresh, `/me`), consent | Login dari Postman berhasil |
| 3 | Profil kesehatan pasien | CRUD profil, NIK ter-mask |
| 4 | Dokter: profil, tarif, online, tarif platform, verifikasi admin | Daftar dokter muncul sesuai syarat |
| 5 | Konsultasi + tanda vital + peringatan darurat | Status `draft` sampai checkout |
| 6 | Pembayaran Mayar: invoice dan webhook | Webhook mengubah status |
| 7 | Penugasan dokter, accept, close, timeout dan pergantian dokter (job) | Alur 15 menit berjalan |
| 8 | Chat: pesan, gambar, tandai terbaca | Pesan tampil via Realtime |
| 9 | Resep + PDF + QR + verifikasi publik | PDF terunduh |
| 10 | Prediksi (simpan/riwayat), notifikasi dan FCM | Push terkirim |
| 11 | Admin: pengguna, transaksi, refund, laporan, audit log | Admin tidak bisa lihat data medis |

Setelah tiap modul: jalankan, tes dengan Postman, commit, deploy staging, beri kabar tim.

## 7. Hal yang Belum Pasti (jangan ditebak)

- Ambang peringatan darurat adalah usulan, perlu validasi tenaga medis.
- Mekanisme validasi webhook dan format payload Mayar: ikuti dokumentasi resmi Mayar saat implementasi.
- Daftar fitur final prediksi menunggu dokumen pemodelan, sehingga kolom `prediction_logs` bisa berubah.
- Batas waktu eksekusi Netlify Functions dan frekuensi minimum function terjadwal: cek dokumentasi Netlify terbaru.
