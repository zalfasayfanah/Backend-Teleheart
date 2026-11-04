# 🗺️ Rencana Pengerjaan TeleHeart Backend (Panduan Pemula)

Selamat datang! Dokumen ini dirancang khusus untuk kamu yang **baru pertama kali belajar dan membangun REST API**. Backend TeleHeart adalah aplikasi server yang melayani aplikasi **Mobile Pasien (Flutter)** dan **Web Dokter/Admin (Next.js)**.

---

## 💡 Konsep Dasar REST API untuk Pemula (Analogi Restoran)

Jika kamu belum pernah membuat REST API, bayangkan backend ini seperti **sebuah restoran**:
1. **Frontend / Klien (Mobile & Web)** = Pelanggan yang datang ke restoran.
2. **Endpoint / Route (URL)** = Buku menu makanan (misal: `POST /api/v1/auth/login`, `GET /api/v1/doctors`).
3. **Controller** = Pelayan (Waiter). Tugasnya menerima pesanan dari pelanggan (request), memeriksa kelengkapan pesanan, lalu meneruskannya ke dapur.
4. **Service** = Koki di dapur. Di sinilah logika bisnis sebenarnya dikerjakan (menghitung tarif, mengenkripsi NIK, memproses pembayaran).
5. **Database (Supabase / PostgreSQL)** = Lemari bahan makanan. Tempat semua data disimpan permanen (tabel users, konsultasi, resep).
6. **Middleware** = Satpam di pintu masuk restoran (misal: mengecek kartu identitas / Token JWT apakah pelanggan sah atau dokter asli).

---

## 🛠️ Persiapan Alat & Akun (Prerequisites)

Sebelum mulai menulis kode, pastikan peralatan berikut sudah terpasang di komputer/laptopmu:

- [ ] **Node.js (LTS v20+)**: Mesin runtime untuk menjalankan JavaScript/TypeScript di komputer.
- [ ] **VS Code** (atau IDE Antigravity) + Ekstensi direkomendasikan: *Prettier*, *ESLint*, *Prisma/PostgreSQL*.
- [ ] **Git**: Untuk mencatat riwayat perubahan kode (version control).
- [ ] **Postman** atau **Thunder Client (VS Code)**: Alat untuk menguji API (mengirim request `GET`, `POST`, dll tanpa perlu membuat antarmuka frontend dulu).
- [ ] **Akun Supabase (Gratis)**: Database PostgreSQL cloud + Auth + Storage di [supabase.com](https://supabase.com).
- [ ] **Akun Netlify (Gratis)**: Platform hosting backend serverless di [netlify.com](https://netlify.com).
- [ ] **Akun Sandbox Mayar**: Payment gateway untuk simulasi pembayaran di [mayar.id](https://mayar.id).

---

## 📚 Dokumen Acuan (Wajib Dibuka Saat Bekerja)

Semua spesifikasi proyek sudah dirapikan ke dalam folder `docs/`:
- 📄 [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md): Ringkasan arsitektur, aturan keamanan wajib, dan panduan AI.
- 📄 [`docs/PRD.md`](docs/PRD.md): Aturan bisnis (*Business Rules*) dan alur fungsional sistem.
- 📄 [`docs/ERD.md`](docs/ERD.md): Skema tabel database, tipe data, relasi foreign key, dan enum.
- 📄 [`docs/API.md`](docs/API.md): Kontrak endpoint (URL, header, format JSON request & response).

---

## 🚀 Tahapan Pengerjaan Bertahap (Roadmap Checklist)

Kerjakan **satu tahap demi satu tahap**. Jangan melompat ke tahap berikutnya sebelum tahap sebelumnya selesai dan teruji!

---

### 🟢 Fase 0: Setup Fondasi Proyek & Health Check ✅ *(Selesai)*
> **Tujuan:** Menyiapkan struktur folder Node.js + TypeScript dan memastikan server bisa berjalan lokal serta diakses.

- [x] **Task 0.1: Inisialisasi Proyek Node.js & TypeScript**
  - Buat `package.json` (`npm init -y`).
  - Install dependensi inti: `express`, `serverless-http`, `cors`, `dotenv`, `zod`.
  - Install devDependencies: `typescript`, `@types/node`, `@types/express`, `@types/cors`, `tsx`, `vitest`, `supertest`.
  - Konfigurasi `tsconfig.json` untuk TypeScript modern.
- [x] **Task 0.2: Buat Struktur Folder Standar**
  - Buat folder `src/`, `src/config/`, `src/middleware/`, `src/lib/`, `src/modules/`, `netlify/functions/`.
- [x] **Task 0.3: Konfigurasi Environment & Netlify**
  - Buat file `.env.example` dan `.env` lokal.
  - Buat file `netlify.toml` untuk routing serverless functions.
  - Buat validator variabel lingkungan di `src/config/env.ts` menggunakan Zod.
- [x] **Task 0.4: Buat Server Express & Endpoint Health Check**
  - Buat `src/app.ts` yang menginisialisasi Express dan pasang middleware standar (JSON parser, CORS).
  - Buat `netlify/functions/api.ts` yang membungkus Express app dengan `serverless-http`.
  - Buat endpoint `GET /api/v1/health` yang mengembalikan status `{ "data": { "status": "ok", "service": "teleheart-backend", "timestamp": "..." } }`.
  - **Uji coba:** Unit testing dengan Vitest (`npm run test`) terverifikasi 2 passed. Server siap dijalankan dengan `npm run dev`.

---

### 🟢 Fase 1: Setup Database Supabase & Migrasi Awal ✅ *(Selesai)*
> **Tujuan:** Menyiapkan rumah data (tabel, enum, relasi) di PostgreSQL sesuai `docs/ERD.md`.

- [x] **Task 1.1: Buat Proyek di Supabase**
  - Buat project baru di dashboard Supabase (`cndxpqotturhmgsadfqi`).
  - Salin `Project URL`, `anon key`, dan `service_role key` ke file `.env` lokal.
- [x] **Task 1.2: Buat File Migrasi SQL Berdasarkan `docs/ERD.md`**
  - Buat folder `supabase/migrations/`.
  - Buat file migrasi untuk 9 tipe ENUM dan 20 tabel utama di `supabase/migrations/20261103000001_initial_schema.sql`.
- [x] **Task 1.3: Eksekusi Migrasi & Cek Relasi**
  - Jalankan script SQL di Supabase SQL Editor.
  - Verifikasi otomatis seluruh 20 tabel berhasil aktif via unit test Vitest.
- [x] **Task 1.4: Inisialisasi Supabase Client di Backend**
  - Buat file `src/lib/supabase.ts` untuk koneksi Supabase Admin Client (`supabaseAdmin`) dengan `service_role_key` dan `supabaseAnon`.

---

### 🟢 Fase 2: Autentikasi Pengguna & Middleware Keamanan ✅ *(Selesai)*
> **Tujuan:** Mengizinkan pasien & dokter mendaftar, login, dan membatasi akses sesuai hak pengguna.

- [x] **Task 2.1: Modul Format Respons & Penanganan Error Terpusat**
  - Standar response helper di `src/lib/response.ts` (`{ data: ... }` dan `{ error: ... }`).
  - Penanganan error terpusat di `src/middleware/errorHandler.ts` (`AppError`, `ZodError`, 404, 500).
- [x] **Task 2.2: Middleware Validasi Input (Zod)**
  - `src/middleware/validate.ts` untuk memvalidasi request body, query params, atau url params otomatis.
- [x] **Task 2.3: Registrasi Pasien & Dokter**
  - `src/modules/auth/schema.ts`, `service.ts`, `controller.ts`, `routes.ts`.
  - `POST /api/v1/auth/register/patient`: Validasi Zod (NIK 16 digit, gender, password, 2 consents), simpan ke Supabase Auth + `users` + `patient_profiles` (NIK terenkripsi & hash).
  - `POST /api/v1/auth/register/doctor`: Registrasi dokter dengan STR, SIP, status pending verifikasi.
- [x] **Task 2.4: Login, Refresh Token & Logout**
  - `POST /api/v1/auth/login`: Wajib header `X-Client-Platform` (pasien harus mobile, dokter/admin harus web). Cek status `is_active`.
  - `POST /api/v1/auth/refresh`: Memperbarui token kadaluwarsa via Supabase Auth.
  - `POST /api/v1/auth/logout`: Menghapus sesi auth.
- [x] **Task 2.5: Middleware Autentikasi & Otorisasi Peran**
  - `src/middleware/auth.ts`: Memvalidasi header `Authorization: Bearer <token>`.
  - `src/middleware/requireRole.ts`: Proteksi akses berbasis peran (`patient`, `doctor`, `admin`).
  - `GET /api/v1/auth/me` & `GET /api/v1/me`: Mengambil info akun yang sedang login.
  - **Uji coba:** 12 unit & integration tests lolos (total 38 tests passing).

---

### 🟢 Fase 3: Modul Profil Pasien & Enkripsi Data Medis ✅ *(Selesai)*
> **Tujuan:** Mengelola data pasien dengan enkripsi NIK sesuai regulasi privasi data medis.

- [x] **Task 3.1: Utilitas Enkripsi NIK**
  - Buat `src/lib/crypto.ts` untuk enkripsi AES-256 (`nik_encrypted`), hashing dengan pepper (`nik_hash`), dan masking (`nik_masked`, format `************0001`).
- [x] **Task 3.2: CRUD Profil Kesehatan Pasien**
  - Buat `src/modules/patients/` (routes, controller, service, schema).
  - `GET /api/v1/patients/me/profile`: Mengambil profil pasien sendiri (NIK wajib ter-mask, riwayat penyakit, obat rutin, alergi).
  - `PUT /api/v1/patients/me/profile`: Update profil umum (`phone`, `has_prior_hospital_checkup`).
  - `GET/POST /api/v1/patients/me/medical-histories`: Daftar / tambah riwayat penyakit.
  - `PUT/DELETE /api/v1/patients/me/medical-histories/:id`: Ubah / hapus riwayat penyakit.
  - `GET/POST /api/v1/patients/me/medications`: Daftar / tambah obat rutin.
  - `PUT/DELETE /api/v1/patients/me/medications/:id`: Ubah / hapus obat rutin.
  - `GET/POST /api/v1/patients/me/allergies`: Daftar / tambah alergi.
  - `PUT/DELETE /api/v1/patients/me/allergies/:id`: Ubah / hapus alergi.
  - `GET /api/v1/patients/:id/profile`: Profil kesehatan pasien untuk dokter yang ditugaskan (audit trail dicatat, NIK & phone disembunyikan).
  - **Uji coba:** 11 unit & integration tests lolos (total 49 tests passing).

---

### 🟢 Fase 4: Modul Dokter, Tarif & Verifikasi Admin ✅ *(Selesai)*
> **Tujuan:** Menampilkan daftar dokter yang online untuk pasien dan mengelola status dokter.

- [x] **Task 4.1: Modul Dokter (Sisi Pasien & Publik)**
  - Buat `src/modules/doctors/` (schema, service, controller, routes).
  - `GET /api/v1/doctors`: Menampilkan daftar dokter aktif, terverifikasi (`approved`), dan sedang online (`is_online = true`) dengan kalkulasi tarif paket (15, 30, 60 menit) + biaya platform.
  - `GET /api/v1/doctors/:id`: Menampilkan detail dokter dan ketersediaan (`is_available`).
  - `GET /api/v1/platform-fee/current`: Mengambil tarif platform yang berlaku.
- [x] **Task 4.2: Modul Dokter (Sisi Dokter Sendiri)**
  - `GET /api/v1/doctors/me/profile`: Info profil dokter login & status verifikasi.
  - `PUT /api/v1/doctors/me/profile`: Update bio, workplace, spesialisasi.
  - `PATCH /api/v1/doctors/me/online`: Ganti status online/offline (otomatis dicek: dokter wajib `approved`).
  - `GET /api/v1/doctors/me/tariffs`: Mengambil tarif dokter (15, 30, 60 menit).
  - `PUT /api/v1/doctors/me/tariffs`: Atur tarif konsultasi dokter.
- [x] **Task 4.3: Verifikasi Dokter oleh Admin**
  - `PATCH /api/v1/admin/doctors/:id/verification`: Admin approve/reject dokter beserta alasan penolakan dan pengiriman notifikasi in-app.
  - **Uji coba:** 9 unit & integration tests lolos (total 58 tests passing).

---

### 🟢 Fase 5: Modul Konsultasi & Evaluasi Tanda Vital ✅ *(Selesai)*
> **Tujuan:** Pasien membuat draft konsultasi, memasukkan tanda vital, dan mendapatkan status peringatan darurat.

- [x] **Task 5.1: Evaluator Tanda Vital (Early Warning System)**
  - Buat logika pemeriksaan tanda vital di `src/modules/consultations/vitalSignsEvaluator.ts` (sesuai ambang batas medis di PRD: tekanan darah sistolik/diastolik, denyut nadi, SpO2).
  - Tentukan kategori: `normal`, `warning`, atau `critical` beserta rekomendasi darurat.
- [x] **Task 5.2: Pembuatan Konsultasi (Draft & Checkout)**
  - Buat `src/modules/consultations/`.
  - `POST /api/v1/consultations`: Pasien memilih dokter, mengisi keluhan dan durasi paket. Status awal: `draft`.
  - `POST /api/v1/consultations/:id/vitals`: Pasien mengisi tanda vital awal dan mendapatkan hasil evaluasi early warning (`normal`, `warning`, `critical`).
  - Validasi aturan: Pasien tidak boleh memiliki konsultasi berjalan yang belum selesai.
  - Snapshot biaya otomatis: `doctor_fee`, `platform_fee`, `total_amount`.
  - `GET /api/v1/consultations/:id`: Melihat detail konsultasi beserta tanda vital.
  - `GET /api/v1/consultations`: Riwayat konsultasi pasien/dokter.
  - `POST /api/v1/consultations/:id/cancel`: Membatalkan konsultasi draft.
  - **Uji coba:** 9 unit & integration tests lolos (total 67 tests passing).

---

### 🟢 Fase 6: Integrasi Pembayaran Mayar (Invoice & Webhook) ✅ *(Selesai)*
> **Tujuan:** Menghubungkan sistem ke gateway pembayaran Mayar dan memproses webhook saat pembayaran sukses.

- [x] **Task 6.1: Service Klien Mayar**
  - Buat `src/lib/mayar.ts` untuk komunikasi dengan REST API Mayar Sandbox/Live.
  - Fungsi `createMayarInvoice`: Mengirim detail checkout (nama, email, nominal, redirect URL) dan menerima `payment_url` serta `invoice_id`.
- [x] **Task 6.2: Endpoint Checkout Konsultasi**
  - `POST /api/v1/consultations/:id/checkout`: Membuat invoice Mayar untuk konsultasi yang sudah dilengkapi tanda vital.
  - Simpan ID invoice dan status `pending` di tabel `payments`.
  - Kembalikan tautan pembayaran ke aplikasi mobile.
- [x] **Task 6.3: Webhook Handler Mayar (Krusial & Idempotent)**
  - Buat endpoint publik `POST /api/v1/webhooks/mayar`.
  - Verifikasi signature / token webhook dari Mayar.
  - **Idempotensi**: Jika webhook untuk invoice yang sama diterima 2 kali, jangan proses ulang.
  - Jika pembayaran berhasil: Update tabel `payments` jadi `paid`, ubah status `consultations` jadi `waiting_doctor`, dan picu penugasan dokter pertama (`consultation_assignments`) serta kirim notifikasi in-app.
  - **Uji coba:** 8 skenario pengujian integrasi lolos (total 75 tests passing).

---

### 🟢 Fase 7: Alur Penugasan Dokter, Timeout & Siklus Konsultasi ✅ *(Selesai)*
> **Tujuan:** Mengatur giliran dokter menerima konsultasi (15 menit timeout) hingga sesi berakhir.

- [x] **Task 7.1: Antrean & Penerimaan oleh Dokter**
  - `GET /api/v1/doctors/me/queue`: Menampilkan permintaan konsultasi yang masuk (`type=incoming`) dan aktif (`type=active`).
  - `POST /api/v1/consultations/:id/accept`: Dokter menerima konsultasi. Status berubah menjadi `active`, timer mulai berjalan (`started_at`, `expires_at`, `remaining_seconds`).
  - `POST /api/v1/consultations/:id/reject`: Dokter menolak konsultasi, cari dokter pengganti secara otomatis.
- [x] **Task 7.2: Scheduled Function / Job Pemantau (jobs-tick)**
  - Buat logika di `src/jobs/consultationTimeoutJob.ts`:
    - Cek konsultasi `waiting_doctor` yang lebih dari 15 menit belum di-accept dokter.
    - Oper ke dokter lain (maksimal 3 kali reassign) atau batalkan dan proses refund.
    - Cek konsultasi `active` yang sudah melewati durasi untuk ditutup otomatis (`duration_expired`).
  - `POST /api/v1/jobs/check-timeouts`: Endpoint pemantau job yang dilindungi `JOBS_SECRET`.
  - Sambungkan ke Netlify Function `netlify/functions/jobs-tick.ts`.
- [x] **Task 7.3: Penutupan Konsultasi & Riwayat Medis Pasien**
  - `POST /api/v1/consultations/:id/close`: Dokter mengakhiri konsultasi setelah diagnosis selesai beserta ringkasan medis (`doctor_summary`). Status berubah menjadi `closed`.
  - `GET /api/v1/patients/:id/history`: Dokter melihat riwayat rekam medis, tanda vital, dan resep pasien terdahulu dengan privasi terjaga (tanpa isi chat).
  - **Uji coba:** 12 skenario pengujian integrasi lolos (total 87 tests passing).

---

### 🟢 Fase 8: Modul Chat 1:1 & Unggah Gambar
> **Tujuan:** Komunikasi teks dan kirim foto/dokumen antara pasien dan dokter saat sesi konsultasi aktif.

- [x] **Task 8.1: Endpoint Kirim & Ambil Pesan Chat**
  - Buat `src/modules/chat/`.
  - Validasi ketat: Pesan hanya boleh dikirim jika konsultasi berstatus `active`.
  - `POST /api/v1/consultations/:id/messages`: Kirim pesan teks.
  - `GET /api/v1/consultations/:id/messages`: Ambil riwayat chat (dengan pagination).
- [x] **Task 8.2: Upload Gambar Medis via Signed URL & Supabase Storage**
  - Konfigurasi bucket privat di Supabase Storage (`chat-attachments`).
  - `POST /api/v1/consultations/:id/attachments`: Upload lampiran gambar medis (multipart JPG/PNG/WEBP maks 5MB) dan peroleh short-lived signed URL (300 detik).
- [x] **Task 8.3: Tandai Pesan Telah Dibaca (Read Status)**
  - `PATCH /api/v1/consultations/:id/messages/read`: Update status `read_at = now()` untuk pesan dari lawan bicara.
  - **Uji coba:** 10 skenario pengujian chat lolos (total 97 tests passing).

---

### 🟢 Fase 9: Modul Resep Obat Digital & Generator PDF
> **Tujuan:** Dokter menerbitkan resep digital berformat PDF dengan QR code verifikasi publik.

- [x] **Task 9.1: Pembuatan Resep oleh Dokter**
  - Buat `src/modules/prescriptions/`.
  - `POST /api/v1/consultations/:id/prescription`: Input daftar obat, dosis, aturan pakai, dan catatan dokter. Status awal: `draft`.
  - `POST /api/v1/consultations/:id/prescription/issue`: Menerbitkan resep resmi (`issued`). Resep yang sudah terbit terkunci dan tidak bisa diedit lagi.
- [x] **Task 9.2: Generator Dokumen PDF & QR Code**
  - Buat `src/lib/pdf.ts` menggunakan library `pdf-lib` dan generator QR Code (`qrcode`).
  - Buat template PDF resmi resep TeleHeart (memuat kop, data dokter & SIP, nama pasien terverifikasi, daftar obat, dan tanda tangan elektronik).
  - Tanamkan QR Code yang mengarah ke URL validasi publik (`/verify-prescription?code=...`).
  - Simpan PDF ke bucket privat Supabase Storage (`prescriptions`).
- [x] **Task 9.3: Unduh Resep & Verifikasi Publik**
  - `GET /api/v1/prescriptions/:id/download`: Mendapatkan link download PDF (hanya bisa diunduh oleh pasien bersangkutan atau dokter penanggung jawab).
  - `GET /api/v1/public/prescriptions/verify/:code`: Endpoint publik tanpa login untuk memvalidasi keaslian resep jika dibuka oleh apotek/pihak ketiga.
  - **Uji coba:** 16 skenario pengujian resep lolos (total 113 tests passing).

---

### 🟢 Fase 10: Notifikasi Push (Firebase FCM) & Log Prediksi AI
> **Tujuan:** Mengirim notifikasi push ke handphone pasien saat ada pesan chat/status berubah dan mencatat riwayat prediksi jantung.

- [x] **Task 10.1: Integrasi Firebase Admin SDK & FCM v1**
  - Buat `src/lib/fcm.ts` dengan otentikasi Google Service Account native RS256 tanpa dependensi bengkak.
  - Fungsi kirim pesan push ke perangkat: `sendPushNotification(tokens, title, body, dataPayload)`.
  - Helper pengiriman ganda: Simpan ke tabel `notifications` (In-App) dan kirim Push Notification (FCM).
- [x] **Task 10.2: Pendaftaran Token Perangkat Pasien/Dokter**
  - `POST /api/v1/notifications/token`: Menyimpan atau memperbarui FCM token perangkat pengguna.
  - `DELETE /api/v1/notifications/token`: Menghapus token perangkat saat logout.
  - `GET /api/v1/notifications`: Mengambil daftar notifikasi in-app pengguna beserta counter belum dibaca (`unread_count`).
  - `PATCH /api/v1/notifications/:id/read` & `PATCH /api/v1/notifications/read-all`: Menandai notifikasi telah dibaca.
- [x] **Task 10.3: Picu Notifikasi Otomatis**
  - Terintegrasi otomatis pada:
    - Dokter menerima konsultasi (`consultation_accepted`).
    - Pesan chat teks atau lampiran gambar medis masuk (`new_chat_message`).
    - Resep obat elektronik diterbitkan (`prescription_issued`).
    - Dokter menyelesaikan konsultasi (`consultation_closed`).
- [x] **Task 10.4: Penyimpanan Hasil Prediksi Risiko Jantung**
  - Sesuai aturan keamanan: Prediksi dihitung on-device di aplikasi Flutter, backend hanya menerima hasil kesimpulan.
  - `POST /api/v1/predictions`: Simpan skor risiko (`at_risk` atau `not_at_risk`), parameter kardiovaskular, dan rekomendasi awal.
  - `GET /api/v1/predictions/my-history`: Pasien melihat riwayat risiko jantungnya sendiri. (Catatan: Dokter & Admin dilarang membaca data ini sesuai BR).
  - **Uji coba:** 14 skenario pengujian notifikasi & prediksi lolos (total 127 tests passing).

---

### 🟢 Fase 11: Modul Admin, Audit Trail & Keamanan Khusus
> **Tujuan:** Dashboard pengelolaan admin tanpa melanggar privasi data medis pasien.

- [x] **Task 11.1: Audit Logging Terpusat**
  - Buat `src/lib/audit.ts`.
  - Catat setiap akses dokter ke data medis pasien (nama dokter, ID pasien, aksi yang diakses, timestamp, IP).
- [x] **Task 11.2: Endpoint Khusus Admin (Metadata Only)**
  - Buat `src/modules/admin/`.
  - `GET /api/v1/admin/users`: Daftar pengguna sistem (pasien & dokter dengan NIK ter-masking).
  - `GET /api/v1/admin/transactions`: Laporan keuangan & transaksi pembayaran (hanya nominal, status bayar, ID transaksi; **tanpa diagnosis medis**).
  - `GET /api/v1/admin/audit-logs`: Melihat log aktivitas sistem.
  - `POST /api/v1/admin/refunds`: Memproses pengembalian dana jika konsultasi gagal/batal.
  - **Uji coba:** 12 skenario pengujian modul admin lolos (total 139 tests passing).

---

### 🟢 Fase 12: Pengujian Menyeluruh (Testing End-to-End) & Deploy
> **Tujuan:** Memastikan seluruh sistem bekerja harmonis dari awal hingga akhir sebelum diserahkan ke tim frontend.

- [x] **Task 12.1: Buat Postman Collection Komprehensif**
  - Susun urutan request di Postman dari Folder 0 (Health) sampai Folder 11 (Admin).
  - Atur Environment Variables di Postman (`{{base_url}}`, `{{access_token}}`, `{{doctor_token}}`, `{{admin_token}}`, `{{consultation_id}}`).
- [x] **Task 12.2: Uji Skenario Lengkap (Happy Path)**
  - Pasien daftar & login -> input profil kesehatan.
  - Pasien lihat daftar dokter online -> buat order konsultasi.
  - Bayar konsultasi via invoice Mayar -> trigger webhook sukses.
  - Dokter terima konsultasi dari antrean -> konsultasi aktif.
  - Kirim pesan chat & upload lampiran medis.
  - Dokter terbitkan resep -> unduh PDF resep -> verifikasi QR Code publik.
  - Dokter tutup konsultasi -> status closed.
- [x] **Task 12.3: Uji Skenario Negatif (Edge Cases & Security Guards)**
  - Pasien A coba akses data/chat/resep Pasien B -> Ditolak (403/404).
  - Kirim chat saat status sudah ditutup -> Ditolak (`SESSION_NOT_ACTIVE`).
  - Platform guard: Pasien login via Web atau Dokter login via Mobile -> Ditolak (`WRONG_PLATFORM`).
  - Admin buka laporan finansial & audit log -> Data klinis pasien terlindungi (privacy preserved).
- [x] **Task 12.4: Deploy ke Netlify Staging & Verifikasi Live URL**
  - Terhubung otomatis CI/CD GitHub ke Netlify.
  - Environment variables terkonfigurasi.
  - Uji endpoint live: `https://backend-teleheart.netlify.app/api/v1/health` (HTTP 200 OK).
  - Uji scheduled cron jobs-tick: `https://backend-teleheart.netlify.app/.netlify/functions/jobs-tick` (HTTP 200 OK).
- [x] **Pengujian Otomatis End-to-End (`tests/e2e.test.ts`):** 19 dari 19 skenario lolos 100% (Total suite 158 tests passing).

---

## 💡 Tips & Panduan Belajar Saat Mengerjakan

1. **Satu File, Satu Tanggung Jawab**:
   - `routes.ts`: Hanya mendefinisikan URL dan metode HTTP.
   - `schema.ts`: Hanya berisi aturan validasi form Zod.
   - `controller.ts`: Menerima input dari pengguna dan mengembalikan respons JSON.
   - `service.ts`: Tempat logika utama dan query ke database.
2. **Jangan Takut Menghadapi Error**:
   - Jika ada error di terminal, baca baris paling atas atau kata kunci `Error:` atau `ZodError`.
   - Gunakan `console.error` saat proses *development* untuk memeriksa variabel yang bernilai `undefined`.
3. **Komit Git Secara Berkala**:
   - Setiap kali satu task checklist selesai dan berhasil dites, lakukan git commit:
     `git add .`
     `git commit -m "feat(auth): selesaikan registrasi pasien"`
4. **Tanyakan pada Asisten AI Kapan Saja**:
   - Kapan pun kamu bingung tentang maksud dari suatu fungsi, mintalah penjelasan:
     *"Bantu saya kerjakan Fase 0 Task 0.1, tolong jelaskan baris kodenya dengan sederhana."*

---

Selamat belajar dan berkarya! Mulailah dari **Fase 0**! 🚀

