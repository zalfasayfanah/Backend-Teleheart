# 📱 Panduan Integrasi Frontend TeleHeart (Fase 0 - Fase 6)

Dokumen ini ditujukan untuk tim Frontend (**Mobile App Pasien** dan **Web Portal Dokter**) agar dapat langsung menghubungkan tampilan antarmuka ke Backend TeleHeart.

---

## 🚀 1. File Siap Pakai untuk Pengujian (Postman)

Di dalam repositori folder `docs/`, terdapat file:
📁 [`TeleHeart_API_Collection.postman_collection.json`](file:///d:/MaSelf/PakMun/Telehealth/Backend-Teleheart/docs/TeleHeart_API_Collection.postman_collection.json)

> **Cara Pakai untuk Frontend:**
> 1. Buka aplikasi **Postman**.
> 2. Klik tombol **Import** (di pojok kiri atas).
> 3. Tarik (drag & drop) file `TeleHeart_API_Collection.postman_collection.json`.
> 4. Seluruh endpoint, contoh request body, dan header sudah otomatis siap pakai!

---

## 🌐 2. Base URL & Konfigurasi Lingkungan

- **Lokal (Localhost)**: `http://localhost:8888/api/v1`
- **Deploy Staging / Cloud**: `https://<site-name>.netlify.app/api/v1`

---

## 🔒 3. Aturan Header Wajib (Krusial!)

Backend TeleHeart menerapkan aturan keamanan ketat:

### A. Setiap Request JSON
```http
Content-Type: application/json
```

### B. Header Platform (Wajib saat Login `/auth/login`)
Sistem membedakan akses login berdasarkan platform:
- **Aplikasi Mobile Pasien**: Wajib mengirim `X-Client-Platform: mobile`
- **Web Portal Dokter**: Wajib mengirim `X-Client-Platform: web`
> *Catatan: Pasien dilarang login via Web, dan Dokter dilarang login via Mobile (akan ditolak 403 WRONG_PLATFORM).*

### C. Request Terproteksi (Bearer Token)
Semua endpoint setelah login membutuhkan header Authorization:
```http
Authorization: Bearer <access_token>
```

---

## 📦 4. Standar Format Respons Backend

### Response Sukses (200 / 201)
```json
{
  "status": "success",
  "data": { ... }
}
```

### Response Error (400 / 401 / 403 / 404 / 409 / 422)
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data tidak valid",
    "details": [
      { "field": "email", "message": "Format email tidak valid" }
    ]
  }
}
```

---

## 🔄 5. Alur Integrasi Flow Aplikasi (User Journey)

### Flow 1: Registrasi & Login Pasien
1. Pasien mendaftar: `POST /api/v1/auth/register/patient`
   - Wajib menyertakan array 2 persetujuan: `privacy_policy` dan `medical_data_processing`.
2. Pasien login: `POST /api/v1/auth/login` (Header `X-Client-Platform: mobile`).
   - Simpan `access_token` dan `refresh_token` di secure storage aplikasi mobile.
3. Ambil data akun login: `GET /api/v1/me`.

### Flow 2: Profil & Rekam Medis Pasien
1. Ambil profil: `GET /api/v1/patients/me/profile`
   - NIK sudah disamarkan secara otomatis oleh backend (`************0001`).
2. Tambah riwayat penyakit: `POST /api/v1/patients/me/medical-histories`.
3. Tambah obat rutin yang sedang diminum: `POST /api/v1/patients/me/medications`.
4. Tambah riwayat alergi obat: `POST /api/v1/patients/me/allergies`.

### Flow 3: Cari Dokter Spesialis Jantung
1. Pasien membuka halaman daftar dokter: `GET /api/v1/doctors`.
   - Hanya dokter yang **terverifikasi admin** dan sedang **online** (`is_online = true`) yang muncul.
   - Respons sudah menyertakan daftar paket durasi (15, 30, 60 menit) beserta kalkulasi total biaya (tarif dokter + tarif platform).

### Flow 4: Pembuatan Konsultasi & Pengisian Tanda Vital
1. Pasien memilih dokter & durasi: `POST /api/v1/consultations`.
   - Status awal konsultasi: `"draft"`.
2. Pasien mengisi tensi dan denyut nadi: `POST /api/v1/consultations/:id/vitals`.
   - Backend memiliki **Early Warning System (EWS)** cerdas:
     - Jika tensi normal: `overall_status: "normal"`, `is_emergency: false`.
     - Jika krisis hipertensi / SpO2 rendah: `overall_status: "critical"`, `is_emergency: true` (Frontend bisa menampilkan pop-up peringatan IGD).

### Flow 5: Checkout & Pembayaran Mayar
1. Pasien menekan tombol "Bayar Sekarang": `POST /api/v1/consultations/:id/checkout`.
   - Backend memanggil gateway pembayaran **Mayar**.
   - Respons memberikan `payment_url` dan `mayar_invoice_id`.
   - Status konsultasi berubah menjadi `"waiting_payment"`.
2. Frontend membuka WebView atau browser eksternal mengarah ke `payment_url`.
3. Pasien membayar via QRIS, Virtual Account, dsb.
4. Server Mayar mengirimkan webhook ke Backend:
   - Status pembayaran otomatis menjadi `"paid"`.
   - Status konsultasi otomatis berpindah ke `"waiting_doctor"`.
   - Dokter mendapatkan notifikasi penugasan baru dengan batas waktu konfirmasi 15 menit.

### Flow 6: Antrean & Penerimaan Konsultasi oleh Dokter (Fase 7)
1. Dokter membuka aplikasi / dashboard dan melihat antrean pasien masuk:
   - `GET /api/v1/doctors/consultations/queue?type=incoming`: Daftar konsultasi `waiting_doctor` yang ditugaskan ke dokter ini beserta countdown sisa detik respon dokter.
   - `GET /api/v1/doctors/consultations/queue?type=active`: Daftar sesi konsultasi yang sedang aktif ditangani.
2. Dokter menerima atau menolak konsultasi:
   - `POST /api/v1/consultations/:id/accept`: Dokter menerima sesi. Timer aktif (30 menit sesi), status menjadi `"active"`.
   - `POST /api/v1/consultations/:id/reject`: Dokter menolak konsultasi dengan alasan (sistem otomatis me-reassign ke dokter lain yang tersedia).
3. Dokter melihat rekam medis lampau pasien (riwayat konsultasi & diagnosa terdahulu):
   - `GET /api/v1/patients/:id/history` (privasi terjaga, tanpa isi percakapan chat).
4. Dokter mengakhiri konsultasi:
   - `POST /api/v1/consultations/:id/close`: Dokter memberikan kesimpulan medis (`doctor_summary`), status berubah menjadi `"closed"`.

### Flow 7: Chat 1:1 Real-Time & Lampiran Gambar Medis (Fase 8)
Ruang chat hanya dapat diakses oleh pasien pemilik dan dokter yang menangani saat status `"active"`.
1. Kirim pesan teks:
   - `POST /api/v1/consultations/:id/messages`
   - Body JSON: `{ "message": "Halo dok, ini hasil tes darah saya" }`
2. Kirim gambar/foto medis (EKG, foto rontgen, dsb):
   - `POST /api/v1/consultations/:id/attachments`
   - Header: `Content-Type: multipart/form-data`
   - Body form-data: `file` (File gambar: JPG/PNG/WEBP, maks 5MB)
   - Respons memberikan signed URL berdurasi 300 detik yang aman.
3. Ambil riwayat chat (dengan pagination):
   - `GET /api/v1/consultations/:id/messages?limit=30&before=2026-11-04T00:00:00Z`
4. Tandai pesan telah dibaca (Read Receipts):
   - `PATCH /api/v1/consultations/:id/messages/read`
   - Otomatis mencatat `read_at` untuk pesan dari lawan bicara.

### Flow 8: Resep Obat Digital & Generator PDF dengan QR Code (Fase 9)
Setelah diagnosis dilakukan, dokter dapat membuat resep obat digital yang diterbitkan resmi dalam bentuk dokumen PDF berstandar medis lengkap dengan QR code verifikasi:
1. Dokter membuat / mengubah draft resep:
   - `POST /api/v1/consultations/:id/prescription`
   - Headers: `Authorization: Bearer <doctor_token>`
   - Body JSON:
     ```json
     {
       "notes": "Minum obat teratur setelah makan. Kontrol tensi setiap pagi.",
       "items": [
         {
           "medicine_name": "Atorvastatin 20mg",
           "dosage": "20 mg",
           "instructions": "1x sehari 1 tablet malam hari",
           "quantity": "30 tablet",
           "notes": "Minum malam hari"
         }
       ]
     }
     ```
2. Dokter menerbitkan resep resmi (`issued`):
   - `POST /api/v1/consultations/:id/prescription/issue`
   - Headers: `Authorization: Bearer <doctor_token>`
   - Backend otomatis meng-generate:
     - Nomor resep unik (`TH-RX-YYYYMM-XXXX`)
     - Dokumen PDF resmi (Kop klinik, data dokter + SIP, nama pasien, tabel obat R/, catatan)
     - QR code verifikasi publik
     - Menyimpan berkas ke Supabase Storage dan mengembalikan `download_url`.
   - *Catatan Penting:* Resep yang sudah `issued` dikunci secara permanen (*immutable*) dan tidak dapat diedit kembali.
3. Pasien atau Dokter melihat resep:
   - `GET /api/v1/consultations/:id/prescription`
   - Mengembalikan detail obat dan `download_url` jika sudah diterbitkan.
4. Pasien mengunduh dokumen PDF:
   - `GET /api/v1/prescriptions/:id/download`
   - Mengembalikan signed URL unduhan dokumen PDF.
5. Verifikasi Keaslian Resep Terbuka (Public / Pihak Apotek):
   - `GET /api/v1/public/prescriptions/verify/:code`
   - *Tanpa perlu header Authorization*.
   - Mengembalikan status validitas `is_valid: true`, identitas dokter penerbit & SIP, nama pasien, dan rincian obat.

---

## 📋 6. Ringkasan Status Konsultasi (State Machine)

| Status | Arti | Aksi Pasien / Dokter |
| :--- | :--- | :--- |
| `draft` | Konsultasi baru dibuat | Pasien mengisi tanda vital awal |
| `waiting_payment` | Invoice Mayar telah diterbitkan | Pasien menyelesaikan pembayaran |
| `waiting_doctor` | Pembayaran lunas, mencari/menunggu respon dokter | Menunggu dokter konfirmasi (maks 15 menit) |
| `active` | Dokter menerima konsultasi *(Fase 7)* | Ruang chat aktif (Fase 8) |
| `closed` | Konsultasi selesai & resep obat terbit *(Fase 7-9)* | Konsultasi ditutup dokter dengan ringkasan medis |
| `cancelled` | Dibatalkan sebelum bayar | Konsultasi batal |

