import { Router, Request, Response } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { PaymentService } from "./service.js";

export const mockPayRouter = Router();

mockPayRouter.get("/:consultationId", async (req: Request, res: Response) => {
  const consultationId = req.params.consultationId as string;
  const invoice = (req.query.invoice as string) || "";

  const { data: consultation } = await supabaseAdmin
    .from("consultations")
    .select("*, payments(*)")
    .eq("id", consultationId)
    .maybeSingle();

  const amount = consultation?.total_amount || 55000;
  const status = consultation?.status || "waiting_payment";
  const isPaid = status !== "draft" && status !== "waiting_payment";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simulasi Pembayaran TeleHeart</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 32px; max-width: 440px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; }
    .logo { color: #dc2626; font-size: 24px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .amount { font-size: 32px; font-weight: 800; color: #111827; margin: 16px 0 8px; }
    .label { color: #6b7280; font-size: 14px; }
    .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin: 20px 0; text-align: left; font-size: 13px; color: #374151; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .info-row:last-child { margin-bottom: 0; font-weight: 600; border-top: 1px dashed #d1d5db; padding-top: 8px; }
    .btn { background: #dc2626; color: white; border: none; border-radius: 10px; padding: 14px 20px; font-size: 15px; font-weight: 600; width: 100%; cursor: pointer; transition: background 0.2s; }
    .btn:hover { background: #b91c1c; }
    .btn-disabled { background: #10b981; cursor: default; }
    .footer { font-size: 11px; color: #9ca3af; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">❤️ TeleHeart Pay</div>
    <span class="badge">Simulasi Sandbox Mayar</span>
    <p class="label">Total Tagihan Konsultasi</p>
    <div class="amount">Rp ${amount.toLocaleString("id-ID")}</div>
    <div class="info-box">
      <div class="info-row"><span>ID Konsultasi</span><span>${consultationId.substring(0, 8)}...</span></div>
      <div class="info-row"><span>Invoice ID</span><span>${invoice || "MOCK-INV"}</span></div>
      <div class="info-row"><span>Metode</span><span>QRIS / Virtual Account</span></div>
      <div class="info-row"><span>Status</span><span style="color: ${isPaid ? '#10b981' : '#f59e0b'}">${isPaid ? 'Lunas (Paid)' : 'Menunggu Bayar'}</span></div>
    </div>
    ${
      isPaid
        ? `<button class="btn btn-disabled" disabled>✅ Pembayaran Berhasil</button>
           <p style="margin-top: 12px; font-size: 13px; color: #059669;">Konsultasi sudah dikonfirmasi. Dokter sedang ditugaskan. Silakan kembali ke aplikasi mobile.</p>`
        : `<form method="POST" action="/api/v1/mock-pay/${consultationId}/pay">
             <input type="hidden" name="invoice" value="${invoice}" />
             <button type="submit" class="btn">💳 Bayar Sekarang (Simulasi Sukses)</button>
           </form>`
    }
    <p class="footer">TeleHeart Telehealth Platform • Mock Payment Gateway</p>
  </div>
</body>
</html>`);
});

mockPayRouter.post("/:consultationId/pay", async (req: Request, res: Response) => {
  const consultationId = req.params.consultationId as string;
  const invoice = (req.body?.invoice || req.query?.invoice || "") as string;

  try {
    await PaymentService.handleMayarWebhook({
      event: "payment.received",
      data: {
        productId: invoice,
        status: "SUCCESS",
        paymentMethod: "QRIS",
        amount: 55000,
        extraData: {
          consultationId,
        },
      },
    });

    res.redirect(`/api/v1/mock-pay/${consultationId}?invoice=${invoice}`);
  } catch (err: any) {
    res.status(500).send(`Gagal memproses simulasi pembayaran: ${err.message}`);
  }
});
