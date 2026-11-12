import { InvalidWebhookSignatureError, MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from "mercadopago";
import { env } from "../config/env.js";
import { ApiError, unauthorized } from "../lib/http.js";

export type PaymentSnapshot = {
  id: string;
  externalReference: string;
  status: string;
  statusDetail: string;
  amountCents: number;
  currency: string;
  approvedAt?: string;
};

export interface PaymentGateway {
  createPreference(input: {
    reference: string; courseId: number; title: string; priceCents: number; email: string;
    expiresAt?: string;
  }): Promise<{ id: string; url: string }>;
  getPayment(id: string): Promise<PaymentSnapshot>;
  findPaymentsByReference?(reference: string): Promise<string[]>;
}

let testGateway: PaymentGateway | null = null;
let testWebhookSecret: string | null = null;

export function setPaymentGatewayForTests(gateway: PaymentGateway | null, webhookSecret: string | null = null) {
  if (env.isProduction) throw new Error("El proveedor de pruebas no se usa en producción.");
  testGateway = gateway;
  testWebhookSecret = webhookSecret;
}

export function paymentGateway(): PaymentGateway | null {
  if (testGateway) return testGateway;
  if (!env.paymentsConfigured) return null;
  const config = new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN!, options: { timeout: 8_000 } });
  return {
    async createPreference(input) {
      try {
        const returnUrl = new URL("/confirmacion", env.WEB_PUBLIC_URL);
        returnUrl.searchParams.set("orden", input.reference);
        returnUrl.searchParams.set("email", input.email);
        const result = await new Preference(config).create({
          body: {
            items: [{ id: String(input.courseId), title: input.title, quantity: 1,
              currency_id: "ARS", unit_price: input.priceCents / 100 }],
            external_reference: input.reference,
            payer: { email: input.email },
            ...(input.expiresAt ? {
              expires: true,
              expiration_date_from: new Date().toISOString(),
              expiration_date_to: input.expiresAt,
            } : {}),
            notification_url: env.MERCADOPAGO_NOTIFICATION_URL,
            back_urls: {
              success: returnUrl.toString(),
              pending: returnUrl.toString(),
              failure: returnUrl.toString(),
            },
            auto_return: "approved",
          },
          requestOptions: { idempotencyKey: input.reference },
        });
        if (!result.id || !result.init_point) throw new Error("Preferencia incompleta.");
        return { id: result.id, url: result.init_point };
      } catch {
        throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "No se pudo iniciar el pago. Intentá nuevamente.");
      }
    },
    async getPayment(id) {
      try {
        const result = await new Payment(config).get({ id });
        if (result.id === undefined || !result.external_reference || !result.status ||
            !Number.isFinite(result.transaction_amount)) throw new Error("Pago incompleto.");
        return {
          id: String(result.id), externalReference: result.external_reference,
          status: result.status, statusDetail: result.status_detail ?? "",
          approvedAt: result.date_approved ?? undefined,
          amountCents: Math.round(result.transaction_amount! * 100),
          currency: result.currency_id ?? "",
        };
      } catch {
        throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "No se pudo verificar el pago.");
      }
    },
    async findPaymentsByReference(reference) {
      try {
        const result = await new Payment(config).search({
          options: { external_reference: reference, sort: "date_last_updated", criteria: "desc", limit: 20 },
        });
        return (result.results ?? []).map((item) => String(item.id ?? "")).filter((id) => /^\d{1,30}$/.test(id));
      } catch {
        throw new ApiError(502, "PAYMENT_PROVIDER_ERROR", "No se pudo consultar el pago. Intentá nuevamente.");
      }
    },
  };
}

export function verifyPaymentWebhook(xSignature: string | undefined, xRequestId: string | undefined, dataId: string) {
  const secret = testWebhookSecret ?? env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(503, "PAYMENTS_NOT_CONFIGURED", "Los pagos no están configurados.");
  const timestamp = /(?:^|,)\s*ts=(\d+)(?:,|$)/.exec(xSignature ?? "")?.[1];
  if (!timestamp) throw unauthorized("Firma de pago inválida.");
  const epochMs = timestamp.length >= 13 ? Number(timestamp) : Number(timestamp) * 1000;
  if (!Number.isSafeInteger(epochMs) || Math.abs(Date.now() - epochMs) > 300_000) {
    throw unauthorized("Firma de pago expirada.");
  }
  try {
    WebhookSignatureValidator.validate({
      xSignature, xRequestId, dataId, secret,
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) throw unauthorized("Firma de pago inválida.");
    throw error;
  }
}
