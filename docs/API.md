# API — TeleHeart REST API

| | |
|---|---|
| Versi | 1.0 (Draft, disepakati bertiga sebelum coding) |
| Base URL | `{API_BASE_URL}/api/v1` (staging: isi setelah deploy) |
| Dokumen terkait | `PRD.md` (aturan bisnis), `ERD.md` (struktur data) |

Dokumen ini adalah **kontrak** antara backend, web, dan mobile. Perubahan endpoint, field, atau kode error harus diumumkan ke seluruh tim dan dicatat di bagian *Riwayat Perubahan* paling bawah.

---

## 1. Ketentuan Umum

### 1.1 Header

| Header | Wajib | Keterangan |
|---|---|---|
| `Authorization: Bearer <access_token>` | Semua endpoint kecuali yang bertanda **Publik** | JWT dari Supabase Auth, diperoleh dari `/auth/login` |
| `Content-Type: application/json` | Untuk body JSON | Upload file memakai `multipart/form-data` |
| `X-Client-Platform: mobile` atau `web` | Wajib di `/auth/login` | Pasien hanya boleh login dari `mobile`, dokter dan admin hanya dari `web` |

### 1.2 Format Respons

Sukses:
```json
{ "data": { }, "meta": { } }
```
`meta` hanya ada pada respons berhalaman:
```json
{ "data": [ ], "meta": { "page": 1, "limit": 20, "total": 57 } }
```

Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data tidak valid",
    "details": [ { "field": "email", "message": "Format email salah" } ]
  }
}
```
`details` opsional. `code` stabil dan dipakai klien untuk logika, `message` untuk ditampilkan ke pengguna (Bahasa Indonesia).

### 1.3 Konvensi Data

| Hal | Aturan |
|---|---|
| ID | `uuid` |
| Waktu | ISO 8601 UTC, contoh `2026-11-04T09:30:00Z`. Klien mengonversi ke WIB untuk tampilan |
| Uang | Integer Rupiah, contoh `150000` |
| Nama field | `snake_case` |
| Pagination | `?page=1&limit=20` (default 20, maksimal 100). Chat memakai cursor (lihat bagian 8) |
| Peran | `patient`, `doctor`, `admin` |

### 1.4 Kode Status dan Kode Error

| HTTP | `error.code` | Arti |
|---|---|---|
| 400 | `BAD_REQUEST` | Permintaan tidak dapat dibaca |
| 401 | `UNAUTHORIZED` | Token tidak ada, tidak valid, atau kedaluwarsa |
| 401 | `INVALID_CREDENTIALS` | Email atau password salah |
| 402/403 | `PAYMENT_NOT_PAID` | Pembayaran belum lunas (dipakai pada unduh resep) |
| 403 | `FORBIDDEN` | Peran atau kepemilikan data tidak sesuai |
| 403 | `EMAIL_NOT_VERIFIED` | Email belum diverifikasi |
| 403 | `ACCOUNT_INACTIVE` | Akun dinonaktifkan admin |
| 403 | `WRONG_PLATFORM` | Peran login dari platform yang salah |
| 403 | `DOCTOR_NOT_APPROVED` | Dokter belum/ditolak verifikasi |
| 404 | `NOT_FOUND` | Data tidak ditemukan (atau tidak boleh diketahui keberadaannya) |
| 409 | `EMAIL_TAKEN`, `NIK_TAKEN` | Data sudah terdaftar |
| 409 | `ACTIVE_CONSULTATION_EXISTS` | Pasien masih punya konsultasi berjalan (respons memuat `consultation_id`) |
| 409 | `INVALID_STATE` | Aksi tidak diizinkan pada status konsultasi saat ini |
| 409 | `VITALS_ALREADY_SUBMITTED` | Tanda vital konsultasi ini sudah terisi |
| 409 | `DOCTOR_UNAVAILABLE` | Dokter tidak online atau sedang menangani sesi |
| 409 | `ASSIGNMENT_EXPIRED` | Batas respons 15 menit sudah lewat |
| 409 | `SESSION_NOT_ACTIVE` | Chat hanya dapat dikirim saat sesi aktif |
| 409 | `PRESCRIPTION_NOT_ISSUED` | Resep belum diterbitkan |
| 413 | `FILE_TOO_LARGE` | Melebihi 5 MB |
| 415 | `UNSUPPORTED_FILE_TYPE` | Format file tidak didukung |
| 422 | `VALIDATION_ERROR` | Isi field tidak valid |
| 422 | `VITALS_REQUIRED` | Tanda vital belum diisi sebelum checkout |
| 422 | `TARIFF_NOT_SET` | Dokter belum menetapkan tarif untuk durasi tersebut |
| 429 | `RATE_LIMITED` | Terlalu banyak permintaan |
| 500 | `INTERNAL_ERROR` | Kesalahan server |

### 1.5 Peran pada Tabel Endpoint

`P` = pasien, `D` = dokter, `A` = admin, `Publik` = tanpa token. Admin **tidak** memiliki akses ke data medis (profil kesehatan, tanda vital, chat, resep, prediksi).

### 1.6 Realtime (langsung ke Supabase, bukan lewat REST)

Web dan mobile memakai Supabase client dengan `access_token` dari login, lalu **subscribe** ke perubahan tabel (dibatasi RLS):

| Tabel | Filter | Dipakai untuk |
|---|---|---|
| `chat_messages` | `consultation_id = <id>` | Pesan masuk real-time |
| `consultations` | `id = <id>` | Perubahan status (mis. `waiting_doctor` → `active`, pergantian dokter) |
| `notifications` | `user_id = <id>` | Notifikasi in-app (web) |

**Menulis** (kirim pesan, ubah status) tetap lewat REST API supaya divalidasi backend.

---

## 2. Auth

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| POST | `/auth/register/patient` | Publik | Registrasi pasien |
| POST | `/auth/register/doctor` | Publik | Registrasi dokter (multipart) |
| POST | `/auth/login` | Publik | Login |
| POST | `/auth/refresh` | Publik | Perbarui token |
| POST | `/auth/logout` | P/D/A | Keluar |
| POST | `/auth/resend-verification` | Publik | Kirim ulang email verifikasi |
| GET | `/me` | P/D/A | Data akun saat ini |

### POST `/auth/register/patient`
```json
{
  "full_name": "Budi Santoso",
  "nik": "3374010101900001",
  "birth_date": "1990-01-01",
  "gender": "male",
  "phone": "081234567890",
  "email": "budi@email.com",
  "password": "min8karakter",
  "consents": [
    { "consent_type": "privacy_policy", "version": "1.0" },
    { "consent_type": "medical_data_processing", "version": "1.0" }
  ]
}
```
Validasi: `nik` 16 digit angka; `gender` `male|female`; `password` minimal 8 karakter; **kedua consent wajib**. `phone` opsional.

**201**
```json
{ "data": { "id": "uuid", "email": "budi@email.com", "role": "patient", "message": "Email verifikasi telah dikirim" } }
```
Error: `EMAIL_TAKEN`, `NIK_TAKEN`, `VALIDATION_ERROR`.

### POST `/auth/register/doctor` (multipart/form-data)

| Field | Wajib | Keterangan |
|---|---|---|
| `full_name`, `email`, `password` | Ya | |
| `str_number`, `sip_number` | Ya | |
| `specialization` | Tidak | Default `Kardiologi` |
| `workplace` | Tidak | |
| `str_file`, `sip_file` | Ya | PDF/JPG/PNG, maks. 5 MB |
| `consents` | Ya | String JSON, isinya sama seperti pasien |

**201**: sama seperti pasien, `role: "doctor"`, ditambah `"verification_status": "pending"`.

### POST `/auth/login`
Header `X-Client-Platform` wajib.
```json
{ "email": "budi@email.com", "password": "min8karakter" }
```
**200**
```json
{
  "data": {
    "access_token": "jwt",
    "refresh_token": "token",
    "expires_in": 3600,
    "user": { "id": "uuid", "role": "patient", "full_name": "Budi Santoso", "email": "budi@email.com" },
    "doctor_verification_status": null
  }
}
```
`doctor_verification_status` terisi (`pending|approved|rejected`) hanya untuk dokter. Dokter `pending` tetap bisa login tetapi hanya melihat status verifikasi.
Error: `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `ACCOUNT_INACTIVE`, `WRONG_PLATFORM`.

### POST `/auth/refresh`
Body `{ "refresh_token": "..." }` → respons sama seperti login (tanpa `user`).

### GET `/me`
```json
{ "data": { "id": "uuid", "role": "doctor", "full_name": "dr. Ani", "email": "ani@email.com",
            "is_active": true, "doctor_verification_status": "approved" } }
```

---

## 3. Profil Kesehatan Pasien

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| GET | `/patients/me/profile` | P | Profil + riwayat penyakit + obat rutin + alergi |
| PUT | `/patients/me/profile` | P | Ubah profil dasar |
| GET/POST | `/patients/me/medical-histories` | P | Daftar / tambah riwayat penyakit |
| PUT/DELETE | `/patients/me/medical-histories/:id` | P | Ubah / hapus |
| GET/POST | `/patients/me/medications` | P | Daftar / tambah obat rutin |
| PUT/DELETE | `/patients/me/medications/:id` | P | Ubah / hapus |
| GET/POST | `/patients/me/allergies` | P | Daftar / tambah alergi |
| PUT/DELETE | `/patients/me/allergies/:id` | P | Ubah / hapus |
| GET | `/patients/:id/profile` | D | Profil kesehatan pasien yang ditugaskan |

### GET `/patients/me/profile`
```json
{
  "data": {
    "full_name": "Budi Santoso",
    "nik_masked": "************0001",
    "birth_date": "1990-01-01",
    "gender": "male",
    "phone": "081234567890",
    "has_prior_hospital_checkup": true,
    "medical_histories": [ { "id": "uuid", "condition_name": "Hipertensi", "diagnosed_year": 2021, "notes": null } ],
    "medications": [ { "id": "uuid", "medicine_name": "Amlodipine", "dosage": "5 mg", "frequency": "1x sehari" } ],
    "allergies": [ { "id": "uuid", "allergen": "Penisilin", "reaction": "Ruam" } ]
  }
}
```
NIK tidak pernah dikembalikan utuh.

### PUT `/patients/me/profile`
Field opsional: `phone`, `has_prior_hospital_checkup`.

### Body POST/PUT sublist

| Resource | Field |
|---|---|
| `medical-histories` | `condition_name` (wajib), `diagnosed_year`, `notes` |
| `medications` | `medicine_name` (wajib), `dosage`, `frequency` |
| `allergies` | `allergen` (wajib), `reaction` |

`GET /patients/:id/profile` (dokter) mengembalikan struktur yang sama tanpa `nik_masked` dan `phone`. Hanya untuk pasien yang punya penugasan `offered/accepted` atau pernah ditangani dokter tersebut, selain itu `FORBIDDEN`. Akses dicatat di audit log.

---

## 4. Dokter dan Tarif

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| GET | `/doctors` | P | Daftar dokter online dan terverifikasi |
| GET | `/doctors/:id` | P | Detail dokter |
| GET | `/doctors/me/profile` | D | Profil sendiri + status verifikasi |
| PUT | `/doctors/me/profile` | D | Ubah profil (`specialization`, `workplace`, `bio`) |
| POST | `/doctors/me/photo` | D | Unggah foto (multipart, field `photo`) |
| PATCH | `/doctors/me/online` | D | Ubah status online |
| GET | `/doctors/me/tariffs` | D | Tarif sendiri |
| PUT | `/doctors/me/tariffs` | D | Atur tarif |
| GET | `/platform-fee/current` | P/D/A | Tarif platform yang berlaku |

### GET `/doctors`
Query: `page`, `limit`, `q` (nama). Hanya dokter `approved` dan `is_online = true`.
```json
{
  "data": [
    {
      "id": "uuid",
      "full_name": "dr. Ani Wijaya, Sp.JP",
      "specialization": "Kardiologi",
      "workplace": "RS Contoh",
      "photo_url": "https://...",
      "is_available": true,
      "prices": [
        { "duration_minutes": 15, "doctor_price": 50000, "platform_fee": 5000, "total_price": 55000 },
        { "duration_minutes": 30, "doctor_price": 90000, "platform_fee": 5000, "total_price": 95000 },
        { "duration_minutes": 60, "doctor_price": 160000, "platform_fee": 5000, "total_price": 165000 }
      ]
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3 }
}
```
`is_available` = `false` jika dokter sedang menangani sesi aktif. Durasi tanpa tarif tidak muncul di `prices`.

### PATCH `/doctors/me/online`
`{ "is_online": true }`. Error `DOCTOR_NOT_APPROVED` jika belum disetujui.

### PUT `/doctors/me/tariffs`
```json
{ "tariffs": [
  { "duration_minutes": 15, "price": 50000, "is_active": true },
  { "duration_minutes": 30, "price": 90000, "is_active": true },
  { "duration_minutes": 60, "price": 160000, "is_active": false }
] }
```
`duration_minutes` hanya `15|30|60`, `price` ≥ 0. Berlaku untuk konsultasi berikutnya.

### GET `/platform-fee/current`
`{ "data": { "amount": 5000, "effective_from": "2026-11-01T00:00:00Z" } }`

---

## 5. Konsultasi dan Tanda Vital

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| POST | `/consultations` | P | Mulai pemeriksaan (status `draft`) |
| POST | `/consultations/:id/vitals` | P | Kirim tanda vital |
| POST | `/consultations/:id/checkout` | P | Pilih dokter + durasi, buat invoice |
| POST | `/consultations/:id/cancel` | P | Batalkan (hanya `draft` / `waiting_payment`) |
| GET | `/consultations` | P/D | Daftar konsultasi milik sendiri |
| GET | `/consultations/:id` | P/D | Detail konsultasi |
| GET | `/doctor/queue` | D | Antrean konsultasi untuk dokter |
| POST | `/consultations/:id/accept` | D | Terima konsultasi |
| POST | `/consultations/:id/close` | D | Tutup sesi |
| GET | `/patients/:id/history` | D | Riwayat pemeriksaan pasien |

### POST `/consultations`
Body opsional `{ "complaint": "Dada terasa berdebar" }`.
**201** `{ "data": { "id": "uuid", "status": "draft" } }`
Error `ACTIVE_CONSULTATION_EXISTS` (memuat `consultation_id` konsultasi yang sedang berjalan).

### POST `/consultations/:id/vitals`
Hanya saat status `draft`, satu kali per konsultasi.
```json
{
  "systolic": 135,
  "diastolic": 85,
  "heart_rate": 82,
  "spo2": 98,
  "weight_kg": 70.5,
  "height_cm": 170,
  "temperature_c": 36.7,
  "symptoms": ["palpitations", "dizziness"],
  "notes": "Mulai terasa sejak pagi",
  "measured_at": "2026-11-04T09:30:00Z"
}
```
Wajib: `systolic`, `diastolic`, `heart_rate`. Lainnya opsional. `measured_at` default waktu server.

Kode gejala yang diterima:

| Kode | Keterangan | Memicu darurat |
|---|---|---|
| `chest_pain` | Nyeri dada | Ya |
| `severe_shortness_of_breath` | Sesak napas berat | Ya |
| `fainting` | Pingsan | Ya |
| `pain_radiating_arm_jaw` | Nyeri menjalar ke lengan/rahang | Ya |
| `palpitations`, `dizziness`, `fatigue`, `leg_swelling`, `cough`, `other` | Gejala lain | Tidak |

**201**
```json
{
  "data": {
    "vital_id": "uuid",
    "emergency": {
      "is_emergency": true,
      "reasons": [
        { "code": "SYSTOLIC_HIGH", "message": "Tekanan darah sistolik sangat tinggi" },
        { "code": "SYMPTOM_chest_pain", "message": "Nyeri dada" }
      ],
      "emergency_numbers": ["119", "112"]
    }
  }
}
```
`reasons[].code`: `SYSTOLIC_HIGH`, `DIASTOLIC_HIGH`, `SYSTOLIC_LOW`, `HR_HIGH`, `HR_LOW`, `SPO2_LOW`, `SYMPTOM_<kode_gejala>`. Ambang mengikuti PRD bagian 7.5. **Backend adalah sumber kebenaran**. Klien menampilkan peringatan berdasarkan `emergency` dari respons ini, dan peringatan tidak memblokir alur lanjut ke pilih dokter.
Error `VITALS_ALREADY_SUBMITTED`, `INVALID_STATE`.

### POST `/consultations/:id/checkout`
Membuat invoice Mayar. Bisa dipanggil lagi saat status `waiting_payment` dan invoice sebelumnya `expired/failed` (membuat invoice baru, dokter/durasi boleh diganti).
```json
{ "doctor_id": "uuid", "duration_minutes": 30 }
```
**200**
```json
{
  "data": {
    "consultation": {
      "id": "uuid", "status": "waiting_payment",
      "doctor": { "id": "uuid", "full_name": "dr. Ani Wijaya, Sp.JP" },
      "duration_minutes": 30,
      "doctor_fee": 90000, "platform_fee": 5000, "total_amount": 95000
    },
    "payment": {
      "id": "uuid", "status": "pending",
      "payment_url": "https://...", "amount": 95000, "expires_at": "2026-11-04T10:30:00Z"
    }
  }
}
```
Error: `VITALS_REQUIRED`, `DOCTOR_UNAVAILABLE`, `TARIFF_NOT_SET`, `INVALID_STATE`.
Setelah itu klien membuka `payment_url`, lalu memantau status lewat Realtime `consultations` atau `GET /consultations/:id/payments`.

### GET `/consultations`
Query: `status`, `page`, `limit`. Pasien melihat miliknya, dokter melihat yang ditugaskan kepadanya.
```json
{ "data": [ { "id": "uuid", "status": "closed", "created_at": "...", "duration_minutes": 30,
              "counterpart": { "id": "uuid", "full_name": "dr. Ani Wijaya, Sp.JP" },
              "has_prescription": true } ],
  "meta": { "page": 1, "limit": 20, "total": 4 } }
```
`counterpart` = dokter (untuk pasien) atau pasien (untuk dokter).

### GET `/consultations/:id`
```json
{
  "data": {
    "id": "uuid", "status": "active",
    "patient": { "id": "uuid", "full_name": "Budi Santoso" },
    "doctor": { "id": "uuid", "full_name": "dr. Ani Wijaya, Sp.JP" },
    "duration_minutes": 30,
    "total_amount": 95000,
    "complaint": "Dada terasa berdebar",
    "vitals": { "systolic": 135, "diastolic": 85, "heart_rate": 82, "is_emergency": false, "symptoms": ["palpitations"], "measured_at": "..." },
    "started_at": "...", "expires_at": "...", "remaining_seconds": 1480, "ended_at": null,
    "doctor_summary": null,
    "response_deadline_at": null,
    "payment": { "id": "uuid", "status": "paid", "paid_at": "..." },
    "prescription": { "id": "uuid", "status": "issued" }
  }
}
```
`remaining_seconds` hanya saat `active`. `response_deadline_at` hanya saat `waiting_doctor`.

### GET `/doctor/queue`
Query `type=incoming|active` (default `incoming`).
```json
{ "data": [ {
    "consultation_id": "uuid", "patient": { "id": "uuid", "full_name": "Budi Santoso" },
    "duration_minutes": 30, "is_emergency": true, "complaint": "...",
    "vitals": { "systolic": 185, "diastolic": 120, "heart_rate": 95 },
    "response_deadline_at": "2026-11-04T09:45:00Z"
} ] }
```

### POST `/consultations/:id/accept`
Body kosong. Status `waiting_doctor` → `active`, `started_at` dan `expires_at` terisi (timer mulai).
Error `ASSIGNMENT_EXPIRED`, `INVALID_STATE`, `FORBIDDEN`.

### POST `/consultations/:id/close`
```json
{ "doctor_summary": "Tekanan darah stabil, lanjutkan obat, kontrol 1 minggu." }
```
Status `active` → `closed`. Chat menjadi read-only.

### POST `/consultations/:id/cancel`
Hanya pasien pemilik, status `draft` atau `waiting_payment`. Setelah membayar tidak dapat dibatalkan pasien.

### GET `/patients/:id/history`
Dokter, untuk pasien yang punya penugasan `offered/accepted` atau pernah ditangani. **Tidak memuat isi chat.**
```json
{ "data": [ {
    "consultation_id": "uuid", "date": "2026-10-20T08:00:00Z",
    "doctor": { "full_name": "dr. Budi, Sp.JP" },
    "vitals": { "systolic": 150, "diastolic": 95, "heart_rate": 88 },
    "doctor_summary": "...",
    "prescription": { "items": [ { "medicine_name": "Amlodipine", "dosage": "5 mg" } ] }
} ] }
```

---

## 6. Pembayaran

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| GET | `/consultations/:id/payments` | P/D | Daftar pembayaran konsultasi (terbaru dulu) |
| GET | `/payments/:id` | P/D/A | Detail pembayaran (admin: metadata) |
| POST | `/webhooks/mayar` | Publik (divalidasi) | Webhook status pembayaran dari Mayar |

`GET /payments/:id`
```json
{ "data": { "id": "uuid", "consultation_id": "uuid", "amount": 95000, "status": "paid",
            "payment_method": "qris", "paid_at": "...", "expires_at": "..." } }
```

### POST `/webhooks/mayar`
- Backend memvalidasi keaslian webhook sesuai mekanisme di dokumentasi Mayar (dicek saat implementasi), menolak yang tidak valid.
- Diproses **idempotent**: pencocokan lewat `mayar_payment_id`, event duplikat atau status yang sudah final diabaikan.
- Saat `paid`: payment `paid`, konsultasi `waiting_payment` → `waiting_doctor`, buat penugasan ke dokter pilihan (batas respons 15 menit), kirim notifikasi ke dokter dan pasien.
- Balas **200** cepat. Klien (web/mobile) tidak memanggil endpoint ini.

---

## 7. Resep

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| POST | `/consultations/:id/prescription` | D | Buat resep (draft atau langsung terbit) |
| PUT | `/consultations/:id/prescription` | D | Ubah resep yang masih draft |
| POST | `/consultations/:id/prescription/issue` | D | Terbitkan resep draft |
| GET | `/consultations/:id/prescription` | P/D | Lihat resep |
| GET | `/prescriptions/:id/pdf` | P/D | Tautan unduh PDF |
| GET | `/verify/prescription/:code` | Publik | Verifikasi keabsahan (dari QR) |

### POST `/consultations/:id/prescription`
Dokter penangani, status konsultasi `active` atau `closed`.
```json
{
  "notes": "Kontrol 1 minggu lagi",
  "issue": true,
  "items": [
    { "medicine_name": "Amlodipine", "dosage": "5 mg", "instructions": "1x sehari sesudah makan", "quantity": "30 tablet", "notes": "Pagi hari" }
  ]
}
```
`items` minimal 1. `issue: true` langsung menerbitkan dan membuat PDF, selain itu tersimpan sebagai draft.
**201**
```json
{ "data": { "id": "uuid", "status": "issued", "issued_at": "...", "verification_code": "ABC123XYZ" } }
```
Resep yang sudah terbit tidak dapat diubah (`INVALID_STATE`). Notifikasi `prescription_issued` dikirim ke pasien.

### GET `/prescriptions/:id/pdf`
Pasien pemilik atau dokter penerbit.
```json
{ "data": { "url": "https://...signed-url", "expires_in": 300 } }
```
Error `PRESCRIPTION_NOT_ISSUED`, `PAYMENT_NOT_PAID`.

### GET `/verify/prescription/:code`
Tanpa token. Hanya keabsahan, tidak memuat isi resep atau data pasien.
```json
{ "data": { "valid": true, "doctor_name": "dr. Ani Wijaya, Sp.JP", "issued_at": "2026-11-04T10:05:00Z" } }
```

---

## 8. Chat

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| GET | `/consultations/:id/messages` | P/D | Riwayat pesan (cursor) |
| POST | `/consultations/:id/messages` | P/D | Kirim pesan teks |
| POST | `/consultations/:id/attachments` | P/D | Kirim gambar (multipart, field `file`) |
| PATCH | `/consultations/:id/messages/read` | P/D | Tandai terbaca |

### GET `/consultations/:id/messages`
Query `limit` (default 50) dan `before` (ID pesan, untuk memuat yang lebih lama).
```json
{ "data": [ {
    "id": "uuid", "sender_id": "uuid", "message_type": "image",
    "body": null,
    "attachment_url": "https://...signed-url", "attachment_url_expires_in": 300,
    "created_at": "...", "read_at": null
} ], "meta": { "has_more": true } }
```
Urutan lama → baru. Admin tidak dapat mengakses.

### POST `/consultations/:id/messages`
`{ "body": "Selamat pagi dok" }` → **201** pesan baru. Hanya saat sesi `active`, selain itu `SESSION_NOT_ACTIVE`.

### POST `/consultations/:id/attachments`
Multipart, `file` JPG/PNG maks. 5 MB. Membuat pesan bertipe `image`, respons seperti satu item pesan. Error `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `SESSION_NOT_ACTIVE`.

### PATCH `/consultations/:id/messages/read`
`{ "up_to_message_id": "uuid" }` → menandai semua pesan lawan bicara sampai pesan itu sebagai terbaca.

---

## 9. Prediksi Risiko Jantung

Inferensi berjalan **on-device** di Flutter. Endpoint ini hanya **menyimpan** hasil sebagai riwayat. Dokter dan admin tidak dapat mengakses.

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| POST | `/predictions` | P | Simpan input dan hasil prediksi |
| GET | `/predictions` | P | Riwayat prediksi sendiri |
| GET | `/predictions/:id` | P | Detail |

### POST `/predictions`
```json
{
  "male": true, "age": 52, "education": 2,
  "current_smoker": false, "cigs_per_day": 0,
  "bp_meds": false, "prevalent_stroke": false, "prevalent_hyp": true, "diabetes": false,
  "total_cholesterol": 210, "sys_bp": 140, "dia_bp": 90,
  "bmi": 26.5, "heart_rate": 78, "glucose": 95,
  "result": "at_risk",
  "model_version": "rf-v1"
}
```
`result` hanya `at_risk` atau `not_at_risk`, tanpa probabilitas. **Daftar field mengikuti dataset Framingham dan akan diselaraskan dengan dokumen pemodelan**. Perubahan dicatat di riwayat perubahan dokumen ini.
**201** `{ "data": { "id": "uuid", "result": "at_risk", "created_at": "..." } }`

Tampilan hasil di klien wajib memuat disclaimer (bukan diagnosis medis) dan, jika `at_risk`, anjuran konsultasi (PRD FR-AI-05).

---

## 10. Notifikasi dan Perangkat

| Method | Path | Peran | Deskripsi |
|---|---|---|---|
| GET | `/notifications` | P/D/A | Daftar notifikasi (`unread=true` opsional) |
| PATCH | `/notifications/:id/read` | P/D/A | Tandai terbaca |
| PATCH | `/notifications/read-all` | P/D/A | Tandai semua terbaca |
| POST | `/devices` | P | Daftarkan token FCM |
| DELETE | `/devices/:fcm_token` | P | Hapus token saat logout |

`POST /devices`: `{ "fcm_token": "...", "platform": "android" }`

Item notifikasi:
```json
{ "id": "uuid", "type": "new_message", "title": "Pesan baru", "body": "Anda menerima pesan baru",
  "data": { "consultation_id": "uuid" }, "is_read": false, "created_at": "..." }
```
`type`: `consultation_incoming`, `consultation_accepted`, `new_message`, `payment_status`, `doctor_timeout`, `prescription_issued`, `doctor_verification`, `session_closing`, `session_closed`. Isi notifikasi **tidak memuat isi chat atau data medis**. Klien membuka layar yang sesuai dari `data`.

---

## 11. Admin

Semua endpoint di bagian ini hanya untuk peran `A`.

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/admin/doctors` | Daftar dokter (`status=pending|approved|rejected`, `q`, pagination) |
| GET | `/admin/doctors/:id` | Detail dokter + tautan dokumen STR/SIP (signed URL) |
| PATCH | `/admin/doctors/:id/verification` | Setujui atau tolak |
| GET | `/admin/users` | Daftar akun (`role`, `q`, pagination) |
| PATCH | `/admin/users/:id/status` | Aktifkan/nonaktifkan akun |
| GET | `/admin/platform-fees` | Riwayat tarif platform |
| POST | `/admin/platform-fees` | Tambah tarif platform baru |
| GET | `/admin/payments` | Daftar transaksi (metadata) |
| PATCH | `/admin/payments/:id/refund` | Tandai refund |
| GET | `/admin/reports/summary` | Ringkasan laporan |
| GET | `/admin/audit-logs` | Audit log akses data |

### PATCH `/admin/doctors/:id/verification`
```json
{ "status": "rejected", "rejection_reason": "Dokumen STR tidak terbaca" }
```
`status`: `approved` atau `rejected`. `rejection_reason` wajib jika ditolak. Dokter menerima notifikasi `doctor_verification`.

### GET `/admin/users`
Berisi `id`, `role`, `full_name`, `email`, `is_active`, `created_at`. **Tanpa data medis.** Admin tidak dapat menonaktifkan akunnya sendiri.

### PATCH `/admin/users/:id/status`
`{ "is_active": false }`

### POST `/admin/platform-fees`
`{ "amount": 7500, "effective_from": "2026-12-01T00:00:00Z", "note": "Penyesuaian tarif" }`. `effective_from` default sekarang. Tidak mengubah konsultasi yang sudah dibuat.

### GET `/admin/payments`
Query: `status`, `from`, `to`, `page`.
```json
{ "data": [ { "id": "uuid", "consultation_id": "uuid", "patient_name": "Budi Santoso",
              "doctor_name": "dr. Ani Wijaya, Sp.JP", "amount": 95000, "status": "paid", "paid_at": "..." } ],
  "meta": { "page": 1, "limit": 20, "total": 12 } }
```

### PATCH `/admin/payments/:id/refund`
`{ "note": "Dokter tidak tersedia" }`. Hanya untuk pembayaran berstatus `paid`. Status menjadi `refunded`. Pengembalian dana dilakukan manual lewat Mayar, sistem hanya mencatat.

### GET `/admin/reports/summary`
Query `from`, `to`.
```json
{ "data": {
  "consultations": { "total": 40, "closed": 31, "cancelled": 5, "active": 1, "waiting": 3 },
  "payments": { "paid": 36, "pending": 2, "expired": 3, "refunded": 2 },
  "total_revenue": 3420000,
  "platform_revenue": 180000,
  "active_doctors": 4
} }
```

### GET `/admin/audit-logs`
Query: `actor_id`, `patient_id`, `action`, `from`, `to`, `page`. Berisi jejak akses (siapa, kapan, aksi apa), tanpa isi data medis.

---

## 12. Job Internal (bukan endpoint publik)

Dijalankan terjadwal oleh backend, tidak dipanggil oleh klien. Dampaknya terlihat lewat Realtime dan notifikasi.

| Job | Tindakan |
|---|---|
| Timeout dokter | Penugasan `offered` yang lewat 15 menit → `timeout`, tawarkan ke dokter online lain dengan harga total ≤ yang dibayar (maks. 3 kali). Jika gagal → konsultasi `cancelled` dan masuk antrean refund |
| Sesi habis | Konsultasi `active` melewati `expires_at` → `closed` |
| Invoice | Pembayaran `pending` melewati `expires_at` → `expired`. Konsultasi `waiting_payment` tanpa pembayaran selama 24 jam → `cancelled` |

---

## Riwayat Perubahan

| Tanggal | Perubahan | Oleh |
|---|---|---|
| 2 Nov 2026 | Draft awal v1.0 | Backend |
