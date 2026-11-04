import { z } from "zod";

export const prescriptionItemSchema = z.object({
  medicine_name: z
    .string({ required_error: "Nama obat wajib diisi" })
    .min(1, "Nama obat tidak boleh kosong")
    .max(255, "Nama obat maksimal 255 karakter"),
  dosage: z.string().max(100, "Dosis maksimal 100 karakter").optional().nullable(),
  instructions: z
    .string({ required_error: "Aturan pakai wajib diisi" })
    .min(1, "Aturan pakai tidak boleh kosong")
    .max(500, "Aturan pakai maksimal 500 karakter"),
  quantity: z
    .string({ required_error: "Jumlah obat wajib diisi" })
    .min(1, "Jumlah obat tidak boleh kosong")
    .max(50, "Jumlah obat maksimal 50 karakter"),
  notes: z.string().max(500, "Catatan obat maksimal 500 karakter").optional().nullable(),
  sort_order: z.coerce.number().int().min(0).optional().default(0),
});

export const savePrescriptionSchema = z.object({
  notes: z.string().max(1000, "Catatan dokter maksimal 1000 karakter").optional().nullable(),
  items: z
    .array(prescriptionItemSchema)
    .min(1, "Resep minimal harus memiliki 1 item obat"),
});

export type SavePrescriptionInput = z.infer<typeof savePrescriptionSchema>;
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;

