import type { ContactInput, SiteSettingsDTO } from "@rozenblum/shared";
import { newId, nowIso } from "../lib/utils.js";
import { env } from "../config/env.js";
import { getRepositories } from "../repositories/index.js";
import { settingsToDTO } from "./mappers.js";
import type { StoredContact } from "../types.js";

export async function submitContact(input: ContactInput): Promise<StoredContact> {
  return getRepositories().contacts.create({
    id: newId("ctc"),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    message: input.message.trim(),
    createdAt: nowIso(),
  });
}

export async function listContacts(): Promise<StoredContact[]> {
  return getRepositories().contacts.list();
}

export async function getPublicSettings(): Promise<SiteSettingsDTO> {
  const settings = await getRepositories().settings.get();
  return settingsToDTO(settings, env.paymentsConfigured);
}
