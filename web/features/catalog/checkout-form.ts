export type CheckoutField = "nombre" | "email" | "dni";
export type CheckoutFields = Record<CheckoutField, string>;
export type CheckoutFieldErrors = Partial<Record<CheckoutField, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_PATTERN = /^\d{7,8}$/;

export function normalizeCheckoutFields(fields: CheckoutFields): CheckoutFields {
  return {
    nombre: fields.nombre.trim(),
    email: fields.email.trim(),
    dni: fields.dni.trim(),
  };
}

export function validateCheckoutFields(fields: CheckoutFields): CheckoutFieldErrors {
  const values = normalizeCheckoutFields(fields);
  const errors: CheckoutFieldErrors = {};
  if (values.nombre.length < 3) errors.nombre = "Ingresá tu nombre y apellido (mínimo 3 caracteres).";
  if (!EMAIL_PATTERN.test(values.email)) errors.email = "Ingresá un correo electrónico válido.";
  if (!DNI_PATTERN.test(values.dni)) errors.dni = "El DNI debe tener 7 u 8 dígitos, sin puntos.";
  return errors;
}

/** Builds only the fields accepted by the checkout contract; the price is never sent. */
export function checkoutPayload(courseSlug: string, fields: CheckoutFields) {
  const values = normalizeCheckoutFields(fields);
  return { courseSlug, nombre: values.nombre, email: values.email, dni: values.dni };
}

export type SingleFlight = {
  readonly active: boolean;
  enter: () => boolean;
  leave: () => void;
};

/** Synchronous guard: the second call before `leave()` is rejected even within the same tick. */
export function createSingleFlight(): SingleFlight {
  let active = false;
  return {
    get active() {
      return active;
    },
    enter() {
      if (active) return false;
      active = true;
      return true;
    },
    leave() {
      active = false;
    },
  };
}

const CHECKOUT_ERROR_MESSAGES: Record<string, string> = {
  CONFLICT:
    "Ya existe una inscripción para este curso con ese correo, o el pago anterior necesita revisión. Consultá el estado de tu orden o contactá al Estudio; no inicies otro pago.",
};

/** Keeps the backend message as fallback, but makes checkout-specific errors actionable. */
export function checkoutErrorMessage(code: string | undefined, fallback: string): string {
  return (code && CHECKOUT_ERROR_MESSAGES[code]) || fallback;
}
