# TeleHeart Backend

REST API untuk TeleHeart, platform telehealth konsultasi jantung. Dipakai oleh aplikasi mobile pasien (Flutter) dan website dokter/admin (Next.js).

- Kontrak endpoint: [`docs/API.md`](docs/API.md)
- Kebutuhan dan alur bisnis: [`docs/PRD.md`](docs/PRD.md)
- Struktur database: [`docs/ERD.md`](docs/ERD.md)
- Konteks untuk asisten AI: [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md)

## Stack

Node.js + TypeScript, Express (`serverless-http`), Supabase (PostgreSQL, Auth, Realtime, Storage), Mayar, Firebase Cloud Messaging, deploy di Netlify Functions.

## Menjalankan di Laptop

Prasyarat: Node.js (versi LTS), Git, akun Supabase, Netlify CLI (`npm i -g netlify-cli`).

```bash
git clone <url-repo-backend>
cd teleheart-backend
npm install
cp .env.example .env      # lalu isi nilainya (lihat tabel di bawah)
netlify dev               # menjalankan function secara lokal
```

Cek berjalan: buka `http://localhost:8888/api/v1/health`. Tes endpoint dengan Postman atau Thunder Client, tidak perlu UI.

## Environment Variable

Salin daftar ini ke `.env.example` (nilai dikosongkan) dan `.env` (nilai asli, **jangan di-commit**). Di Netlify, isi di *Site configuration → Environment variables*.

| Variabel | Fungsi |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_ANON_KEY` | Kunci publik (dipakai juga oleh web dan mobile) |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci admin Supabase. **Rahasia, hanya di backend** |
| `MAYAR_API_KEY` | API key Mayar |
| `MAYAR_BASE_URL` | URL API Mayar (production atau sandbox sesuai dokumentasi Mayar) |
| `MAYAR_WEBHOOK_SECRET` | Rahasia/token validasi webhook (nama dan mekanisme mengikuti dokumentasi Mayar) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Kredensial service account untuk kirim FCM |
| `NIK_ENCRYPTION_KEY` | Kunci enkripsi NIK (32 byte, acak) |
| `NIK_HASH_PEPPER` | Rahasia tambahan untuk hash NIK |
| `CORS_ALLOWED_ORIGINS` | Daftar origin web yang diizinkan, dipisah koma |
| `APP_BASE_URL` | URL web, dipakai untuk tautan verifikasi email |
| `DOCTOR_RESPONSE_TIMEOUT_MINUTES` | Default `15` |
| `MAX_DOCTOR_REASSIGN` | Default `3` |
| `PAYMENT_INVOICE_TTL_MINUTES` | Default `60` |
| `JOBS_SECRET` | Rahasia untuk memanggil job internal (jika dipicu lewat HTTP) |

Cara membuat kunci acak: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Deploy ke Netlify

1. Push repo ke GitHub.
2. Di Netlify: *Add new site → Import an existing project*, pilih repo ini.
3. Build command: `echo Building Functions` (placeholder agar function ter-build), sesuai panduan Express Netlify.
4. Isi semua environment variable di atas.
5. Deploy. Setiap `git push` ke branch utama men-deploy ulang otomatis.
6. Uji: `https://<nama-situs>.netlify.app/api/v1/health`.
7. Bagikan URL ini ke tim web dan mobile sebagai `API_BASE_URL`.
8. Daftarkan `https://<nama-situs>.netlify.app/api/v1/webhooks/mayar` sebagai URL webhook di dashboard Mayar.

`netlify.toml` minimal (sesuai panduan Netlify):

```toml
[functions]
  external_node_modules = ["express"]
  node_bundler = "esbuild"

[[redirects]]
  force = true
  from = "/api/*"
  status = 200
  to = "/.netlify/functions/api/:splat"

[build]
  command = "echo Building Functions"
```

## Job Terjadwal

Timeout dokter 15 menit, penutupan sesi otomatis, dan kedaluwarsa invoice butuh job berkala. Panduan Netlify tidak menyarankan Express sebagai scheduled function, jadi job dibuat sebagai **function terpisah** (`netlify/functions/jobs-tick.ts`) yang memanggil logika di `src/jobs/`.

Sebelum implementasi, cek dokumentasi *Netlify Scheduled Functions* untuk **frekuensi minimum** dan batas eksekusi. Jika tidak cukup sering untuk timeout 15 menit, cadangan:
- jadwalkan lewat Supabase `pg_cron`, atau
- evaluasi "malas" (lazy): setiap `GET /consultations/:id` dan `GET /doctor/queue` memeriksa tenggat dan memprosesnya.

## Alur Kerja Tim

- Branch `main` selalu bisa dijalankan. Kerjakan fitur di branch seperti `feat/auth`, `feat/checkout-mayar`, lalu Pull Request.
- Perubahan kontrak API: ubah `docs/API.md`, catat di Riwayat Perubahan, kabari tim web dan mobile.
- Perubahan skema database: tambah file migration baru di `supabase/migrations/`, jangan mengubah migration lama yang sudah dijalankan.
- Jangan commit `.env`, kunci Supabase/Mayar, atau file kredensial Firebase.

## Pengujian Cepat (Postman)

1. `POST /auth/register/patient` lalu verifikasi email.
2. `POST /auth/login` dengan header `X-Client-Platform: mobile`, salin `access_token`.
3. Panggil endpoint lain dengan header `Authorization: Bearer <access_token>`.

Skenario demo lengkap ada di `docs/PRD.md` bagian 14.
