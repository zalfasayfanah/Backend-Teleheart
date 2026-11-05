# Diagram Alur Sistem — TeleHeart

Dokumen ini memuat diagram alur (flowchart), sequence diagram, dan diagram state machine untuk sistem **TeleHeart**, mencakup arsitektur keseluruhan, autentikasi multi-platform, registrasi dokter, prediksi AI, pembayaran Mayar, chat konsultasi, hingga resep digital.

---

## Daftar Isi
1. [Arsitektur Sistem Keseluruhan](#1-arsitektur-sistem-keseluruhan)
2. [Alur Autentikasi & Validasi Platform (Role Guard)](#2-alur-autentikasi--validasi-platform-role-guard)
3. [Alur Registrasi & Verifikasi Dokter](#3-alur-registrasi--verifikasi-dokter)
4. [Alur Skrining & Prediksi Risiko Jantung AI](#4-alur-skrining--prediksi-risiko-jantung-ai)
5. [Alur Inti Konsultasi & Pembayaran (End-to-End)](#5-alur-inti-konsultasi--pembayaran-end-to-end)
6. [Alur Chat Realtime & Pembuatan Resep Digital](#6-alur-chat-realtime--pembuatan-resep-digital)
7. [State Machine Status Konsultasi](#7-state-machine-status-konsultasi)
8. [Alur Background Jobs / Schedulers (jobs-tick)](#8-alur-background-jobs--schedulers-jobs-tick)

---

## 1. Arsitektur Sistem Keseluruhan

TeleHeart membagi antarmuka menjadi aplikasi mobile untuk Pasien dan portal web untuk Dokter & Admin, dengan backend serverless berbasis Express di Netlify Functions.

```mermaid
flowchart TD
  subgraph Clients["Frontend Clients"]
    MobileApp["Aplikasi Flutter (Mobile - Pasien)"]
    WebPortal["Portal Web (Dokter & Admin)"]
  end

  subgraph Gateway["API Gateway / Netlify Serverless"]
    ExpressApp["Express REST API (/api/v1)<br/>Middleware: CORS, Auth JWT, Role Guard, Rate Limiter"]
    CronJob["Scheduled Function (jobs-tick)<br/>Cron: Background Auto-cancel & Expiration"]
  end

  subgraph BackendServices["Backend Modules & Services"]
    AuthMod["Auth Module"]
    PatientMod["Patient & Vitals Module"]
    DocMod["Doctor Profile & Tariffs"]
    ConsMod["Consultation Lifecycle"]
    ChatMod["Chat & Messaging Module"]
    PrescMod["Prescription PDF Generator"]
    PredMod["Prediction Logs Module"]
    AdminMod["Admin Oversight & Audit"]
  end

  subgraph CloudStorageAndDB["Supabase Cloud"]
    SupaAuth["Supabase Auth (JWT)"]
    SupaDB[("PostgreSQL Database (Tables & RLS)")]
    SupaRealtime["Supabase Realtime (WebSocket Chat)"]
    SupaStorage["Supabase Storage (STR/SIP & PDF Resep)"]
  end

  subgraph ExternalProviders["External Third-Party Services"]
    MayarPG["Mayar Payment Gateway (Invoice & Webhook)"]
    FCM["Firebase Cloud Messaging (FCM Push)"]
  end

  MobileApp -->|HTTP REST| ExpressApp
  WebPortal -->|HTTP REST| ExpressApp
  CronJob -->|Internal DB Query| SupaDB

  ExpressApp --> AuthMod & PatientMod & DocMod & ConsMod & ChatMod & PrescMod & PredMod & AdminMod

  AuthMod --> SupaAuth & SupaDB
  PatientMod --> SupaDB
  DocMod --> SupaDB & SupaStorage
  ConsMod --> SupaDB
  ChatMod --> SupaDB
  PrescMod --> SupaStorage & SupaDB
  PredMod --> SupaDB
  AdminMod --> SupaDB

  MobileApp -.->|Listen Chat Events| SupaRealtime
  WebPortal -.->|Listen Chat Events| SupaRealtime

  ConsMod -->|Create Invoice| MayarPG
  MayarPG -->|Webhook payment.received| ExpressApp
  ConsMod -->|Send Push Notification| FCM
  FCM -.->|Push Alert| MobileApp & WebPortal
```

---

## 2. Alur Autentikasi & Validasi Platform (Role Guard)

Setiap request login divalidasi berdasarkan header `X-Client-Platform` untuk mencegah salah kamar (Pasien login di Web atau Dokter login di Mobile).

```mermaid
flowchart TD
  Start(["User Login Request"]) --> InputCheck{"Header X-Client-Platform valid?<br/>('mobile' / 'web')"}
  
  InputCheck -- "Tidak Ada / Salah" --> ErrHeader["400 BAD_REQUEST<br/>Header X-Client-Platform wajib diisi"]
  InputCheck -- "Valid" --> AuthSupa["Verifikasi Email & Password via Supabase Auth"]

  AuthSupa -- "Kredensial Salah" --> ErrAuth["401 UNAUTHORIZED<br/>Email atau password salah"]
  AuthSupa -- "Kredensial Benar" --> FetchRole["Ambil Role & Profil User dari Database"]

  FetchRole --> CheckPlatform{"Pengecekan Platform vs Role"}

  CheckPlatform -- "Role: patient & Platform: web" --> ErrWrongPlat1["403 WRONG_PLATFORM<br/>Pasien hanya boleh login di aplikasi mobile"]
  CheckPlatform -- "Role: doctor & Platform: mobile" --> ErrWrongPlat2["403 WRONG_PLATFORM<br/>Dokter hanya boleh login di portal web"]
  CheckPlatform -- "Role: admin & Platform: mobile" --> ErrWrongPlat3["403 WRONG_PLATFORM<br/>Admin hanya boleh login di portal web"]

  CheckPlatform -- "Cocok" --> CheckDoc{"Apakah Role = doctor?"}

  CheckDoc -- "Bukan Doctor (Pasien / Admin)" --> ReturnToken["200 OK<br/>Kembalikan access_token & refresh_token"]
  CheckDoc -- "Ya (Doctor)" --> CheckVerif["Sertakan verification_status di respons<br/>('pending' / 'approved' / 'rejected')"]
  CheckVerif --> ReturnToken

  ReturnToken --> Success(["User Masuk ke Dashboard"])
```

---

## 3. Alur Registrasi & Verifikasi Dokter

Pendaftaran dokter memerlukan dua tahap: upload dokumen STR/SIP ke storage, lalu submit form data terstruktur untuk direview oleh Admin.

```mermaid
sequenceDiagram
  autonumber
  actor Doc as Calon Dokter (Web)
  participant API as Backend TeleHeart
  participant Storage as Supabase Storage
  participant DB as Supabase Database
  actor Admin as Administrator (Web)

  Note over Doc,API: Tahap 1: Upload Dokumen Legalitas
  Doc->>API: POST /api/v1/auth/upload-document (File STR)
  API->>Storage: Simpan file ke bucket 'doctor-documents/str/'
  Storage-->>API: file_path & signed_url
  API-->>Doc: 201 Created (str_file_path)

  Doc->>API: POST /api/v1/auth/upload-document (File SIP)
  API->>Storage: Simpan file ke bucket 'doctor-documents/sip/'
  Storage-->>API: file_path & signed_url
  API-->>Doc: 201 Created (sip_file_path)

  Note over Doc,API: Tahap 2: Pendaftaran Akun
  Doc->>API: POST /api/v1/auth/register/doctor<br/>(Data profil, str_file_path, sip_file_path, consents)
  API->>DB: Buat user (role: 'doctor') & profil (verification_status: 'pending')
  API-->>Doc: 201 Created (Status: pending)

  Note over Admin,API: Tahap 3: Verifikasi Dokumen oleh Admin
  Admin->>API: GET /api/v1/admin/users?role=doctor
  API-->>Admin: Daftar dokter pending beserta download URL STR/SIP
  Admin->>Admin: Periksa keabsahan STR & SIP

  alt Dokumen Valid & Terverifikasi
    Admin->>API: PATCH /api/v1/admin/doctors/:id/verification { status: "approved" }
    API->>DB: Update verification_status = "approved"
    API-->>Admin: 200 OK (Dokter disetujui)
    Note over Doc: Dokter kini dapat mengubah status menjadi Online & menerima konsultasi
  else Dokumen Tidak Valid / Kadaluarsa
    Admin->>API: PATCH /api/v1/admin/doctors/:id/verification { status: "rejected", rejection_reason: "..." }
    API->>DB: Update verification_status = "rejected"
    API-->>Admin: 200 OK (Dokter ditolak)
  end
```

---

## 4. Alur Skrining & Prediksi Risiko Jantung AI

Proses inferensi AI berjalan secara lokal di perangkat pasien (on-device) untuk menjaga privasi data medis dan respon cepat tanpa ketergantungan internet saat komputasi.

```mermaid
flowchart TD
  Start(["Pasien Buka Fitur Skrining Jantung (Mobile)"]) --> FormInput["Pasien Mengisi Parameter Klinis:<br/>- Usia, Jenis Kelamin, Tipe Nyeri Dada<br/>- Tekanan Darah, Kolesterol, Gula Darah Puasa<br/>- EKG Istirahat, Detak Jantung Maks, Angina, dll."]
  
  FormInput --> LocalInference["Flutter On-Device AI Model<br/>(Logistic Regression Model: 'lr-v1')"]
  
  LocalInference --> ResultCalc["Hitung Probabilitas & Kategori Risiko:<br/>- Rendah (< 30%)<br/>- Sedang (30% - 70%)<br/>- Tinggi (> 70%)"]
  
  ResultCalc --> SaveLog["POST /api/v1/predictions<br/>(Kirim input_data, prediction_result, risk_level, model_version)"]
  
  SaveLog --> DBLog[("Simpan ke tabel prediction_logs<br/>(Dilindungi RLS: Hanya pasien bersangkutan yang bisa baca)")]
  
  DBLog --> DisplayUI["Tampilkan Hasil Skrining di Layar HP Pasien"]
  
  DisplayUI --> DecisionRisk{"Apakah Risiko Sedang / Tinggi?"}
  DecisionRisk -- "Ya" --> RecomCTA["Tampilkan Rekomendasi Konsultasi dengan Dokter Spesialis Jantung"]
  DecisionRisk -- "Tidak" --> HealthyCTA["Tampilkan Tips Pola Hidup Sehat & Skrining Berkala"]
  
  RecomCTA --> End(["Selesai / Arahkan ke Pilih Dokter"])
  HealthyCTA --> End
```

---

## 5. Alur Inti Konsultasi & Pembayaran (End-to-End)

Alur bisnis sentral dari TeleHeart: pasien mengisi tanda vital, memilih dokter dan durasi, melakukan pembayaran instan via Mayar, hingga sesi konsultasi dikonfirmasi.

```mermaid
sequenceDiagram
  autonumber
  actor Patient as Pasien (Mobile)
  participant API as Backend TeleHeart
  participant DB as Supabase DB
  participant Mayar as Mayar Payment Gateway
  actor Doctor as Dokter (Web)

  Patient->>API: POST /api/v1/consultations (Buat Sesi Baru)
  API->>DB: Insert consultations (status: 'draft')
  API-->>Patient: 201 Created (consultation_id)

  Patient->>API: POST /api/v1/consultations/:id/vitals (Input Tanda Vital: TD, HR, Suhu, dll.)
  API->>DB: Simpan ke tabel vital_signs
  API-->>Patient: 200 OK

  Patient->>API: GET /api/v1/doctors?is_online=true
  API-->>Patient: Daftar dokter online & tarifnya

  Patient->>API: POST /api/v1/consultations/:id/checkout { doctor_id, duration_minutes: 15 }
  API->>DB: Validasi dokter online & hitung total biaya (Honor Dokter + Biaya Layanan)
  API->>Mayar: createInvoice(totalAmount, patientInfo, consultationId)
  Mayar-->>API: invoiceId & paymentUrl
  API->>DB: Simpan payments & update konsultasi (status: 'waiting_payment')
  API-->>Patient: 200 OK { data: { payment_url: "https://mayar.link/..." } }

  Patient->>Mayar: Buka payment_url & bayar via QRIS / Virtual Account
  Mayar->>API: Webhook POST /api/v1/payments/mayar-webhook (event: "payment.received")
  API->>API: Verifikasi Signature / Token Webhook
  API->>DB: Update payments (status: 'paid') & konsultasi (status: 'confirmed')
  API->>DB: Buat tawaran penugasan (consultation_assignments: 'offered')
  API->>Doctor: Kirim Notifikasi Tawaran Konsultasi (FCM / WebSocket)

  Doctor->>API: POST /api/v1/consultations/:id/accept
  API->>DB: Update konsultasi (status: 'in_progress', started_at: NOW)
  API-->>Doctor: 200 OK (Sesi aktif)
  API-->>Patient: Notifikasi: Dokter telah bergabung, sesi dimulai!
```

---

## 6. Alur Chat Realtime & Pembuatan Resep Digital

Saat konsultasi berstatus `in_progress`, pasien dan dokter bertukar pesan secara realtime. Dokter kemudian meresepkan obat dan mengakhiri sesi.

```mermaid
sequenceDiagram
  autonumber
  actor Patient as Pasien (Mobile)
  participant RT as Supabase Realtime (WSS)
  participant API as Backend TeleHeart
  participant DB as Supabase DB
  participant Storage as Supabase Storage
  actor Doctor as Dokter (Web)

  Note over Patient,Doctor: Sesi Konsultasi Aktif (in_progress)
  Patient->>RT: Kirim Pesan Chat / Keluhan Tambahan
  RT-->>Doctor: Pesan Diterima Realtime
  Doctor->>RT: Balas Anamnesis / Saran Klinis
  RT-->>Patient: Balasan Diterima Realtime

  Note over Doctor,API: Pembuatan Resep Obat Digital
  Doctor->>API: POST /api/v1/consultations/:id/prescriptions<br/>(Diagnosis, Instruksi, & Daftar Obat)
  API->>API: Generate PDF Resep Elektronik Resmi + QR Verifikasi
  API->>Storage: Simpan PDF ke bucket 'prescriptions/resep-xxx.pdf'
  Storage-->>API: prescription_file_path & signed_url
  API->>DB: Simpan data prescriptions & prescription_items
  API-->>Doctor: 201 Created

  Note over Doctor,API: Pengakhiran Sesi Konsultasi
  Doctor->>API: POST /api/v1/consultations/:id/end
  API->>DB: Update konsultasi status: 'completed', ended_at: NOW
  API->>DB: Catat audit_logs (Dokter menyelesaikan sesi)
  API-->>Doctor: 200 OK (Konsultasi Selesai)
  API-->>Patient: Notifikasi Konsultasi Selesai

  Patient->>API: GET /api/v1/consultations/:id/prescription
  API-->>Patient: 200 OK (Download Link PDF Resep)
```

---

## 7. State Machine Status Konsultasi

Diagram transisi status konsultasi dari pembuatan awal hingga selesai atau dibatalkan.

```mermaid
stateDiagram-v2
  [*] --> draft: Pasien membuat sesi awal
  
  draft --> waiting_payment: Pasien mengisi vital signs & memilih dokter (checkout)
  draft --> cancelled: Dibatalkan sebelum bayar
  
  waiting_payment --> confirmed: Pembayaran lunas via Webhook Mayar
  waiting_payment --> expired: Melebihi batas waktu pembayaran (TTL 60 menit)
  
  confirmed --> waiting_doctor: Sesi siap ditugaskan ke dokter
  
  waiting_doctor --> in_progress: Dokter menerima tawaran (accept)
  waiting_doctor --> waiting_doctor: Timeout dokter (15 menit) -> Reassign ke dokter lain (maks 3x)
  waiting_doctor --> cancelled: Melebihi batas reassign / tidak ada dokter online
  
  in_progress --> completed: Dokter mengakhiri konsultasi (end session)
  in_progress --> completed: Auto-close oleh scheduler setelah melebihi durasi
  
  completed --> [*]
  expired --> [*]
  cancelled --> [*]
```

---

## 8. Alur Background Jobs / Schedulers (`jobs-tick`)

Fungsi cron terjadwal (`netlify/functions/jobs-tick.ts`) dijalankan secara periodik untuk menjaga konsistensi transaksi dan sesi tanpa intervensi manual.

```mermaid
flowchart TD
  Trigger(["Trigger Cron Periodik (Netlify Scheduled Function)"]) --> JobStart["Jalankan jobs-tick Handler"]

  subgraph Task1["1. Penanganan Invoice Kedaluwarsa (Payments)"]
    T1Query["Cari pembayaran status 'pending' yang expires_at < NOW()"]
    T1Query --> T1Update["Update payments -> 'expired'<br/>Update consultations -> 'expired'"]
  end

  subgraph Task2["2. Penanganan Timeout Respon Dokter"]
    T2Query["Cari consultation_assignments status 'offered'<br/>yang umurnya > DOCTOR_RESPONSE_TIMEOUT_MINUTES (15 mnt)"]
    T2Query --> T2Decision{"Sudah mencapai MAX_DOCTOR_REASSIGN (3x)?"}
    T2Decision -- "Belum" --> T2Reassign["Tandai assignment 'timeout'<br/>Cari dokter online lain & tawarkan sesi baru"]
    T2Decision -- "Sudah" --> T2Cancel["Tandai assignment 'timeout'<br/>Update konsultasi -> 'cancelled'<br/>Jadwalkan refund pasien"]
  end

  subgraph Task3["3. Penutupan Sesi Overdue (Auto-close)"]
    T3Query["Cari konsultasi status 'in_progress'<br/>yang started_at + duration_minutes + grace_period < NOW()"]
    T3Query --> T3Close["Update konsultasi -> 'completed'<br/>Catat alasan 'auto_closed_timeout'"]
  end

  JobStart --> Task1 --> Task2 --> Task3 --> JobEnd(["Selesai & Catat Log Eksekusi"])
```
