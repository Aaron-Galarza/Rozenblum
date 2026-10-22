import { Router } from "express";
import { checkoutSchema, contactSchema } from "@rozenblum/shared";
import { sendData } from "../lib/http.js";
import { listPublishedCourses, getPublishedCourseDetail } from "../services/courses.js";
import { checkout, getOrderReceipt } from "../services/checkout.js";
import { submitContact, getPublicSettings } from "../services/contact.js";
import { asyncRoute, parseBody } from "./helpers.js";
import { HomeContentModel } from "../models/index.js";

export const publicRouter = Router();

publicRouter.get(
  "/content/home",
  asyncRoute(async (_req, res) => {
    const content = await HomeContentModel.findOne({ key: "home" }).select("-_id").lean().exec();
    if (!content) throw new Error("El contenido de inicio no existe en Atlas.");
    sendData(res, content);
  }),
);

publicRouter.get(
  "/courses",
  asyncRoute(async (_req, res) => {
    sendData(res, await listPublishedCourses());
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
  asyncRoute(async (req, res) => {
    const input = parseBody(checkoutSchema, req.body);
    const result = await checkout(input);
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

publicRouter.post(
  "/contact",
  asyncRoute(async (req, res) => {
    const input = parseBody(contactSchema, req.body);
    const contact = await submitContact(input);
    sendData(
      res,
      {
        id: contact.id,
        message: "Mensaje recibido. Te respondemos dentro de las próximas 48 horas hábiles.",
      },
      201,
    );
  }),
);

publicRouter.get(
  "/settings",
  asyncRoute(async (_req, res) => {
    sendData(res, await getPublicSettings());
  }),
);
