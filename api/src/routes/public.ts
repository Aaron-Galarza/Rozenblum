import { Router } from "express";
import { z } from "zod";
import { checkoutSchema, contactSchema } from "@rozenblum/shared";
import { badRequest, notFound, sendData } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import { orderToDTO } from "../services/mappers.js";
import { listPublishedCourses, getLatestPublishedCourse, getPublishedCourseDetail } from "../services/courses.js";
import { checkout, getOrderReceipt } from "../services/checkout.js";
import { submitContact } from "../services/contact.js";
import { optionalAuth } from "../middleware/auth.js";
import { asyncRoute, parseBody } from "./helpers.js";
import { getHomeContent } from "../services/home.js";
import { paymentNotificationSchema, processPaymentWebhook, reconcileReturnedPayment } from "../services/payments.js";

export const publicRouter = Router();
const checkoutReturnSchema = z.object({ email: z.string().trim().email().optional(), paymentId: z.string().optional() }).strict();

publicRouter.post("/payments/mercadopago/webhook", asyncRoute(async (req, res) => {
  const queryPaymentId = req.query["data.id"];
  if (typeof queryPaymentId !== "string" || !/^\d{1,30}$/.test(queryPaymentId)) {
    throw badRequest("Identificador de pago inválido.");
  }
  const notification = parseBody(paymentNotificationSchema, req.body);
  await processPaymentWebhook({
    notification, queryPaymentId,
    xSignature: req.header("x-signature"),
    xRequestId: req.header("x-request-id"),
  });
  res.status(200).json({ data: { received: true } });
}));

publicRouter.get(
  "/content/home",
  asyncRoute(async (_req, res) => {
    sendData(res, await getHomeContent());
  }),
);

publicRouter.get(
  "/courses",
  asyncRoute(async (_req, res) => {
    sendData(res, await listPublishedCourses());
  }),
);

publicRouter.get(
  "/courses/latest",
  asyncRoute(async (_req, res) => {
    sendData(res, await getLatestPublishedCourse());
  }),
);

publicRouter.get(
  "/courses/:slug",
  asyncRoute(async (req, res) => {
    sendData(res, await getPublishedCourseDetail(req.params.slug));
  }),
);

publicRouter.post(
  "/checkout",
  optionalAuth,
  asyncRoute(async (req, res) => {
    const input = parseBody(checkoutSchema, req.body);
    const result = await checkout(input, req.authUser);
    sendData(res, result, 201);
  }),
);

publicRouter.get(
  "/orders/:reference",
  asyncRoute(async (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email : "";
    sendData(res, await getOrderReceipt(req.params.reference, email));
  }),
);

publicRouter.post("/orders/:reference/reconcile", asyncRoute(async (req, res) => {
  const input = parseBody(checkoutReturnSchema, req.body);
  await reconcileReturnedPayment(req.params.reference, input.email, input.paymentId);
  if (input.email) sendData(res, await getOrderReceipt(req.params.reference, input.email));
  else {
    const order = await getRepositories().orders.findByReference(req.params.reference);
    if (!order) throw notFound("Orden de pago no encontrada.");
    sendData(res, orderToDTO(order));
  }
}));

publicRouter.post(
  "/contact",
  asyncRoute(async (req, res) => {
    const input = parseBody(contactSchema, req.body);
    const contact = await submitContact(input);
    sendData(
      res,
      {
        id: contact.id,
        message: "Mensaje recibido por el Estudio.",
      },
      201,
    );
  }),
);
