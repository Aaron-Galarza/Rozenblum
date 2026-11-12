import type { StoredUser } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: StoredUser;
    }
  }
}

export {};
