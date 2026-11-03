-- ==============================================================================
-- TELEHEART DATABASE SCHEMA MIGRATION
-- File: 20261103000001_initial_schema.sql
-- Sesuai dengan spesifikasi: docs/ERD.md
-- ==============================================================================

-- 1. Ekstensi
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tipe Data Enum
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE gender AS ENUM ('male', 'female');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE consultation_status AS ENUM (
    'draft',
    'waiting_payment',
    'waiting_doctor',
    'active',
    'closed',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM ('offered', 'accepted', 'timeout', 'declined');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'expired', 'failed', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('text', 'image');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE prescription_status AS ENUM ('draft', 'issued');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE prediction_result AS ENUM ('at_risk', 'not_at_risk');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Tabel Utama

-- 3.1 users (relasi ke auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 consents
CREATE TABLE IF NOT EXISTS public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET
);

-- 3.3 patient_profiles
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  nik_encrypted TEXT NOT NULL,
  nik_hash TEXT NOT NULL UNIQUE,
  birth_date DATE NOT NULL,
  gender gender NOT NULL,
  phone TEXT,
  has_prior_hospital_checkup BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 patient_medical_histories
CREATE TABLE IF NOT EXISTS public.patient_medical_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  condition_name TEXT NOT NULL,
  diagnosed_year SMALLINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5 patient_medications (obat rutin)
CREATE TABLE IF NOT EXISTS public.patient_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.6 patient_allergies
CREATE TABLE IF NOT EXISTS public.patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  allergen TEXT NOT NULL,
  reaction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.7 doctor_profiles
CREATE TABLE IF NOT EXISTS public.doctor_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  str_number TEXT NOT NULL UNIQUE,
  sip_number TEXT NOT NULL,
  specialization TEXT NOT NULL DEFAULT 'Kardiologi',
  workplace TEXT,
  bio TEXT,
  photo_path TEXT,
  str_file_path TEXT,
  sip_file_path TEXT,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.8 doctor_tariffs
CREATE TABLE IF NOT EXISTS public.doctor_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes IN (15, 30, 60)),
  price INTEGER NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, duration_minutes)
);

-- 3.9 platform_fees
CREATE TABLE IF NOT EXISTS public.platform_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.10 consultations
CREATE TABLE IF NOT EXISTS public.consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  doctor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  duration_minutes SMALLINT CHECK (duration_minutes IN (15, 30, 60)),
  doctor_fee INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  status consultation_status NOT NULL DEFAULT 'draft',
  complaint TEXT,
  reassign_count SMALLINT NOT NULL DEFAULT 0 CHECK (reassign_count >= 0 AND reassign_count <= 3),
  response_deadline_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  close_reason TEXT,
  doctor_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.11 consultation_assignments
CREATE TABLE IF NOT EXISTS public.consultation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status assignment_status NOT NULL DEFAULT 'offered',
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ
);

-- 3.12 vital_signs
CREATE TABLE IF NOT EXISTS public.vital_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL UNIQUE REFERENCES public.consultations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  systolic SMALLINT NOT NULL,
  diastolic SMALLINT NOT NULL,
  heart_rate SMALLINT NOT NULL,
  spo2 SMALLINT,
  weight_kg NUMERIC(5,2),
  height_cm NUMERIC(5,2),
  temperature_c NUMERIC(4,1),
  symptoms TEXT[] DEFAULT '{}',
  notes TEXT,
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  emergency_reasons TEXT[] DEFAULT '{}',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.13 chat_messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_type message_type NOT NULL DEFAULT 'text',
  body TEXT,
  attachment_path TEXT,
  attachment_mime TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CONSTRAINT chk_chat_message_content CHECK (
    (message_type = 'text' AND body IS NOT NULL) OR
    (message_type = 'image' AND attachment_path IS NOT NULL)
  )
);

-- 3.14 payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  mayar_payment_id TEXT UNIQUE,
  payment_url TEXT,
  amount INTEGER NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  refunded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  refund_note TEXT,
  raw_webhook JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.15 prescriptions
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL UNIQUE REFERENCES public.consultations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  notes TEXT,
  status prescription_status NOT NULL DEFAULT 'draft',
  issued_at TIMESTAMPTZ,
  pdf_path TEXT,
  verification_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.16 prescription_items
CREATE TABLE IF NOT EXISTS public.prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT,
  instructions TEXT,
  quantity TEXT,
  notes TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 0
);

-- 3.17 prediction_logs (riwayat prediksi AI mandiri - privasi tinggi)
CREATE TABLE IF NOT EXISTS public.prediction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  male BOOLEAN,
  age SMALLINT,
  education SMALLINT,
  current_smoker BOOLEAN,
  cigs_per_day SMALLINT,
  bp_meds BOOLEAN,
  prevalent_stroke BOOLEAN,
  prevalent_hyp BOOLEAN,
  diabetes BOOLEAN,
  total_cholesterol NUMERIC(6,2),
  sys_bp NUMERIC(5,1),
  dia_bp NUMERIC(5,1),
  bmi NUMERIC(5,2),
  heart_rate NUMERIC(5,1),
  glucose NUMERIC(6,2),
  result prediction_result NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'v1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.18 notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.19 device_tokens
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android',
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.20 audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role user_role,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  patient_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indeks & Partial Unique Constraint

-- Satu konsultasi berjalan per pasien (waiting_payment, waiting_doctor, active)
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_one_active_per_patient
  ON public.consultations (patient_id)
  WHERE status IN ('waiting_payment', 'waiting_doctor', 'active');

CREATE INDEX IF NOT EXISTS idx_consultations_patient_history ON public.consultations (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor_queue ON public.consultations (doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_consultation_assignments_timeout ON public.consultation_assignments (status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_consultation ON public.chat_messages (consultation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_payments_consultation ON public.payments (consultation_id);
CREATE INDEX IF NOT EXISTS idx_doctor_profiles_online ON public.doctor_profiles (verification_status, is_online);
CREATE INDEX IF NOT EXISTS idx_vital_signs_patient ON public.vital_signs (patient_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_logs_patient ON public.prediction_logs (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_patient ON public.audit_logs (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_id, created_at DESC);

-- 5. Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medical_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Default Policies (Service role bypasses RLS automatically)
-- Kebijakan dasar agar user dapat membaca datanya sendiri di auth:
CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Patients can read own profile" ON public.patient_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Patients can read own vital signs" ON public.vital_signs
  FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Patients can read own prediction logs" ON public.prediction_logs
  FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
