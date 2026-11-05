import { Router } from "express";
import { checkoutSchema, contactSchema } from "@rozenblum/shared";
import { sendData } from "../lib/http.js";
import { listPublishedCourses, getLatestPublishedCourse, getPublishedCourseDetail } from "../services/courses.js";
import { checkout, getOrderReceipt } from "../services/checkout.js";
import { submitContact, getPublicSettings } from "../services/contact.js";
import { optionalAuth } from "../middleware/auth.js";
import { asyncRoute, parseBody } from "./helpers.js";
import { getHomeContent } from "../services/home.js";

export const publicRouter = Router();

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

publicRouter.get(
  "/settings",
  asyncRoute(async (_req, res) => {
    sendData(res, await getPublicSettings());
  }),
);
