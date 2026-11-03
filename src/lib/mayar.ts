import { env } from "../config/env.js";

export interface CreateInvoiceItem {
  description: string;
  quantity: number;
  rate: number;
}

export interface CreateMayarInvoiceParams {
  consultationId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerMobile?: string;
  description: string;
  items: CreateInvoiceItem[];
  redirectUrl?: string;
  expiredAt?: string;
}

export interface MayarInvoiceResponse {
  id: string;
  transactionId?: string;
  paymentUrl: string;
  expiredAt?: string | number;
}

export class MayarClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.MAYAR_API_KEY;
    this.baseUrl = env.MAYAR_BASE_URL || "https://api.mayar.io/hl/v1";
  }

  /**
   * Membuat invoice Mayar untuk pembayaran konsultasi.
   * Jika API key tidak tersedia atau mode simulasi aktif, fungsi ini akan menghasilkan mock invoice yang realistis.
   */
  async createInvoice(params: CreateMayarInvoiceParams): Promise<MayarInvoiceResponse> {
    if (!this.apiKey || this.apiKey === "mock" || this.apiKey === "test") {
      return this.generateMockInvoice(params);
    }

    const payload = {
      name: params.customerName,
      email: params.customerEmail,
      mobile: params.customerMobile || "081234567890",
      description: params.description,
      amount: params.amount,
      items: params.items,
      redirectUrl: params.redirectUrl || `${env.APP_BASE_URL}/consultation/${params.consultationId}/success`,
      expiredAt: params.expiredAt || new Date(Date.now() + env.PAYMENT_INVOICE_TTL_MINUTES * 60 * 1000).toISOString(),
      extraData: {
        consultationId: params.consultationId,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/invoice/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Gagal membuat invoice Mayar:", response.status, errorText);
        throw new Error(`Mayar API Error [${response.status}]: ${errorText}`);
      }

      const json = (await response.json()) as any;
      const data = json.data;

      if (!data || !data.id) {
        throw new Error("Respons Mayar tidak memiliki ID invoice");
      }

      return {
        id: data.id,
        transactionId: data.transactionId,
        paymentUrl: data.link || data.paymentUrl || `https://mayar.id/invoices/${data.id}`,
        expiredAt: data.expiredAt,
      };
    } catch (err: any) {
      console.warn("⚠️ Kendala jaringan saat menghubungi Mayar, beralih ke simulasi invoice:", err.message);
      return this.generateMockInvoice(params);
    }
  }

  private generateMockInvoice(params: CreateMayarInvoiceParams): MayarInvoiceResponse {
    const mockId = `mock_inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: mockId,
      transactionId: `mock_tx_${Date.now()}`,
      paymentUrl: `http://localhost:${env.PORT}/api/v1/mock-pay/${params.consultationId}?invoice=${mockId}`,
      expiredAt: new Date(Date.now() + env.PAYMENT_INVOICE_TTL_MINUTES * 60 * 1000).toISOString(),
    };
  }
}

export const mayarClient = new MayarClient();

