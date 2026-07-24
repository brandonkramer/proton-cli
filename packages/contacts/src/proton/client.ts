import type { DecryptedUserKey } from "@bkramer/proton-core";
import {
  cardsFromApi,
  decryptCards,
  encryptAndSignCard,
  signCard,
} from "../crypto/card.ts";
import {
  CardSigned,
  type ContactCard,
  buildSignedVCard,
  contactFromCards,
  contactUid,
  encryptedVCard,
  findSignedEmail,
  hasEncryptedFields,
  parseSignedVCard,
  signedVCard,
  type SignedContact,
  type VCardFields,
} from "../vcard/vcard.ts";
import { isFullId } from "../util/id.ts";
import { pickRef } from "../util/ref.ts";
import { CliError, NotFoundError } from "../util/errors.ts";
import { encodePinnedKey, prependUnique } from "../util/key.ts";
import {
  CONTACT_GROUP_LABEL_TYPE,
  CONTACTS_DELETE_PATH,
  CONTACTS_EXPORT_PATH,
  CONTACTS_LABEL_PATH,
  CONTACTS_PATH,
  CONTACTS_UNLABEL_PATH,
  DEFAULT_PAGE_SIZE,
  LABELS_PATH,
} from "./constants.ts";
import { protonFetch, type RequestOptions } from "./http.ts";
import type {
  ApiContactRecord,
  ContactResponse,
  ContactsExportResponse,
  CreateContactsRequest,
  CreateContactsResponse,
  DeleteContactsRequest,
  LabelResponse,
  LabelsResponse,
  CreateLabelRequest,
  ContactLabelRequest,
  Session,
  UpdateContactRequest,
} from "./types.ts";

export interface ContactSummary {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  emails: string[];
  phones: string[];
  org: string;
  note: string;
  title: string;
  birthday: string;
  address: string;
  url: string;
  cards?: string[];
}

export interface NewContactInput {
  name: string;
  emails: string[];
  phones: string[];
  note: string;
  org: string;
  title: string;
  birthday: string;
  address: string;
  url: string;
}

export interface ContactGroupSummary {
  id: string;
  name: string;
  color: string;
}

export interface ContactsClientOptions {
  session: Session;
  userKey: DecryptedUserKey;
  fetchImpl?: typeof fetch;
}

export function cardPayload(cards: ContactCard[]): Array<Record<string, unknown>> {
  return cards.map((card) => ({
    Type: card.Type,
    Data: card.Data,
    ...(card.Signature ? { Signature: card.Signature } : {}),
  }));
}

function toVCardFields(input: NewContactInput): VCardFields {
  return {
    phones: input.phones,
    note: input.note,
    org: input.org,
    title: input.title,
    birthday: input.birthday,
    address: input.address,
    url: input.url,
  };
}

async function decryptRecord(
  record: ApiContactRecord,
  userKey: DecryptedUserKey,
): Promise<ContactSummary> {
  const cards = cardsFromApi(record.Cards);
  const plaintextCards = await decryptCards(cards, userKey);
  const summary = contactFromCards(record.ID, plaintextCards);
  return { ...summary, cards: plaintextCards };
}

export class ContactsClient {
  readonly #session: Session;
  readonly #userKey: DecryptedUserKey;
  readonly #fetchImpl?: typeof fetch;

  constructor(options: ContactsClientOptions) {
    this.#session = options.session;
    this.#userKey = options.userKey;
    this.#fetchImpl = options.fetchImpl;
  }

  #requestOptions(): RequestOptions {
    return { session: this.#session, fetchImpl: this.#fetchImpl };
  }

  async listAll(): Promise<ContactSummary[]> {
    const out: ContactSummary[] = [];
    for (let page = 0; ; page += 1) {
      const query = `?Page=${page}&PageSize=${DEFAULT_PAGE_SIZE}`;
      const { status, data } = await protonFetch<ContactsExportResponse>(
        `${CONTACTS_EXPORT_PATH}${query}`,
        { ...this.#requestOptions(), method: "GET" },
      );
      if (status !== 200) {
        throw new CliError(`Failed to list contacts (HTTP ${status}).`);
      }
      const batch = data.Contacts ?? [];
      if (batch.length === 0) break;
      for (const record of batch) {
        try {
          out.push(await decryptRecord(record, this.#userKey));
        } catch {
          // Skip contacts we cannot decrypt.
        }
      }
      if (batch.length < DEFAULT_PAGE_SIZE) break;
    }
    return out;
  }

  async get(id: string): Promise<ContactSummary> {
    const { status, data } = await protonFetch<ContactResponse>(
      `${CONTACTS_PATH}/${id}`,
      { ...this.#requestOptions(), method: "GET" },
    );
    if (status !== 200 || !data.Contact) {
      throw new CliError(`Contact not found (HTTP ${status}).`);
    }
    return decryptRecord(data.Contact, this.#userKey);
  }

  async resolveRef(ref: string): Promise<string> {
    if (isFullId(ref)) return ref;
    const contacts = await this.listAll();
    const needle = ref.toLowerCase();
    const matches = contacts.filter((contact) => {
      if (contact.name.toLowerCase().includes(needle)) return true;
      return contact.emails.some((email) => email.toLowerCase().includes(needle));
    });
    const picked = pickRef(
      "contact",
      ref,
      matches,
      (contact) => contact.id,
      (contact) => `${contact.name} <${contact.email ?? ""}>`,
    );
    return picked.id;
  }

  async buildCards(input: NewContactInput): Promise<ContactCard[]> {
    if (!input.name && input.emails.length === 0) {
      throw new CliError("name or email is required");
    }
    const name = input.name || input.emails[0] || "";
    const signed = signedVCard(name, input.emails, contactUid());
    const cards: ContactCard[] = [await signCard(signed, this.#userKey)];
    const fields = toVCardFields(input);
    if (hasEncryptedFields(fields)) {
      cards.push(await encryptAndSignCard(encryptedVCard(fields), this.#userKey));
    }
    return cards;
  }

  async create(input: NewContactInput): Promise<string> {
    const cards = await this.buildCards(input);
    const body: CreateContactsRequest = {
      Contacts: [{ Cards: cardPayload(cards) }],
      Overwrite: 0,
      Labels: 0,
    };
    const { status, data } = await protonFetch<CreateContactsResponse>(
      CONTACTS_PATH,
      {
        ...this.#requestOptions(),
        method: "POST",
        body,
      },
    );
    if (status !== 200) {
      throw new CliError(`Failed to create contact (HTTP ${status}).`);
    }
    const id = data.Responses?.[0]?.Response.Contact?.ID;
    if (!id) {
      throw new CliError("Create contact returned no ID.");
    }
    return id;
  }

  async update(id: string, patch: NewContactInput): Promise<ContactSummary> {
    const existing = await this.get(id);
    const merged: NewContactInput = {
      name: patch.name || existing.name,
      emails: patch.emails.length > 0 ? patch.emails : existing.emails,
      phones: patch.phones.length > 0 ? patch.phones : existing.phones,
      note: patch.note || existing.note,
      org: patch.org || existing.org,
      title: patch.title || existing.title,
      birthday: patch.birthday || existing.birthday,
      address: patch.address || existing.address,
      url: patch.url || existing.url,
    };
    const oldSigned = parseSignedVCard((existing.cards ?? []).join("\n"));
    const model: SignedContact = {
      name: merged.name || merged.emails[0] || "",
      uid: oldSigned.uid || contactUid(),
      emails: merged.emails.map((address) => {
        const prev = oldSigned.emails.find(
          (entry) => entry.address.toLowerCase() === address.toLowerCase(),
        );
        return {
          address,
          keyValues: prev?.keyValues ?? [],
          encrypt: prev?.encrypt,
          sign: prev?.sign,
          scheme: prev?.scheme,
        };
      }),
    };
    const cards: ContactCard[] = [
      await signCard(buildSignedVCard(model), this.#userKey),
    ];
    const fields = toVCardFields(merged);
    if (hasEncryptedFields(fields)) {
      cards.push(await encryptAndSignCard(encryptedVCard(fields), this.#userKey));
    }
    const body: UpdateContactRequest = { Cards: cardPayload(cards) };
    const { status, data } = await protonFetch<ContactResponse>(
      `${CONTACTS_PATH}/${id}`,
      {
        ...this.#requestOptions(),
        method: "PUT",
        body,
      },
    );
    if (status !== 200 || !data.Contact) {
      throw new CliError(`Failed to update contact (HTTP ${status}).`);
    }
    return decryptRecord(data.Contact, this.#userKey);
  }

  async delete(ids: string[]): Promise<void> {
    const body: DeleteContactsRequest = { IDs: ids };
    const { status } = await protonFetch<Record<string, unknown>>(
      CONTACTS_DELETE_PATH,
      {
        ...this.#requestOptions(),
        method: "PUT",
        body,
      },
    );
    if (status !== 200) {
      throw new CliError(`Failed to delete contact (HTTP ${status}).`);
    }
  }

  async resolveContactEmail(id: string, emailFlag?: string): Promise<string> {
    if (emailFlag) return emailFlag;
    const contact = await this.get(id);
    switch (contact.emails.length) {
      case 0:
        throw new CliError("contact has no email address; pass --email");
      case 1:
        return contact.emails[0] ?? "";
      default:
        throw new CliError(
          `contact has ${contact.emails.length} email addresses; pass --email to choose one`,
        );
    }
  }

  async #rawContactCards(id: string): Promise<ContactCard[]> {
    const { status, data } = await protonFetch<ContactResponse>(
      `${CONTACTS_PATH}/${id}`,
      { ...this.#requestOptions(), method: "GET" },
    );
    if (status !== 200 || !data.Contact) {
      throw new CliError(`Contact not found (HTTP ${status}).`);
    }
    return cardsFromApi(data.Contact.Cards);
  }

  async #editableSignedContact(
    id: string,
  ): Promise<{ model: SignedContact; others: ContactCard[] }> {
    const cards = await this.#rawContactCards(id);
    let signedData = "";
    let haveSigned = false;
    const others: ContactCard[] = [];
    for (const card of cards) {
      if (card.Type === CardSigned && !haveSigned) {
        signedData = card.Data;
        haveSigned = true;
        continue;
      }
      others.push(card);
    }
    if (!haveSigned) {
      throw new CliError("contact has no signed card to edit");
    }
    const model = parseSignedVCard(signedData);
    if (!model.uid) {
      model.uid = contactUid();
    }
    return { model, others };
  }

  async #putContactCards(
    id: string,
    model: SignedContact,
    others: ContactCard[],
  ): Promise<void> {
    const signedCard = await signCard(buildSignedVCard(model), this.#userKey);
    const body: UpdateContactRequest = {
      Cards: [...cardPayload([signedCard]), ...cardPayload(others)],
    };
    const { status } = await protonFetch<ContactResponse>(
      `${CONTACTS_PATH}/${id}`,
      {
        ...this.#requestOptions(),
        method: "PUT",
        body,
      },
    );
    if (status !== 200) {
      throw new CliError(`Failed to update contact (HTTP ${status}).`);
    }
  }

  async pinKey(options: {
    id: string;
    email: string;
    armoredKey: string;
    encrypt?: boolean;
    sign?: boolean;
    scheme?: string;
  }): Promise<void> {
    const keyValue = await encodePinnedKey(options.armoredKey);
    const { model, others } = await this.#editableSignedContact(options.id);
    let emailEntry = findSignedEmail(model, options.email);
    if (!emailEntry) {
      model.emails.push({ address: options.email, keyValues: [] });
      emailEntry = model.emails[model.emails.length - 1]!;
    }
    emailEntry.keyValues = prependUnique(emailEntry.keyValues, keyValue);
    emailEntry.encrypt = options.encrypt ?? true;
    emailEntry.sign = options.sign ?? true;
    if (options.scheme) {
      emailEntry.scheme = options.scheme;
    }
    await this.#putContactCards(options.id, model, others);
  }

  async unpinKey(id: string, email: string): Promise<void> {
    const { model, others } = await this.#editableSignedContact(id);
    const emailEntry = findSignedEmail(model, email);
    if (!emailEntry || emailEntry.keyValues.length === 0) {
      throw new NotFoundError("pinned key", email);
    }
    emailEntry.keyValues = [];
    emailEntry.encrypt = undefined;
    emailEntry.sign = undefined;
    emailEntry.scheme = undefined;
    await this.#putContactCards(id, model, others);
  }

  async listGroups(): Promise<ContactGroupSummary[]> {
    const { status, data } = await protonFetch<LabelsResponse>(
      `${LABELS_PATH}?Type=${CONTACT_GROUP_LABEL_TYPE}`,
      { ...this.#requestOptions(), method: "GET" },
    );
    if (status !== 200) {
      throw new CliError(`Failed to list groups (HTTP ${status}).`);
    }
    return (data.Labels ?? []).map((label) => ({
      id: label.ID,
      name: label.Name,
      color: label.Color,
    }));
  }

  async createGroup(name: string, color: string): Promise<string> {
    const body: CreateLabelRequest = {
      Name: name,
      Color: color,
      Type: CONTACT_GROUP_LABEL_TYPE,
    };
    const { status, data } = await protonFetch<LabelResponse>(LABELS_PATH, {
      ...this.#requestOptions(),
      method: "POST",
      body,
    });
    if (status !== 200 || !data.Label?.ID) {
      throw new CliError(`Failed to create group (HTTP ${status}).`);
    }
    return data.Label.ID;
  }

  async deleteGroup(id: string): Promise<void> {
    const { status } = await protonFetch<Record<string, unknown>>(
      `${LABELS_PATH}/${id}`,
      { ...this.#requestOptions(), method: "DELETE" },
    );
    if (status !== 200) {
      throw new CliError(`Failed to delete group (HTTP ${status}).`);
    }
  }

  async addGroupMembers(groupId: string, contactIds: string[]): Promise<void> {
    const body: ContactLabelRequest = {
      LabelID: groupId,
      ContactIDs: contactIds,
    };
    const { status } = await protonFetch<Record<string, unknown>>(
      CONTACTS_LABEL_PATH,
      {
        ...this.#requestOptions(),
        method: "PUT",
        body,
      },
    );
    if (status !== 200) {
      throw new CliError(`Failed to add contacts to group (HTTP ${status}).`);
    }
  }

  async removeGroupMembers(groupId: string, contactIds: string[]): Promise<void> {
    const body: ContactLabelRequest = {
      LabelID: groupId,
      ContactIDs: contactIds,
    };
    const { status } = await protonFetch<Record<string, unknown>>(
      CONTACTS_UNLABEL_PATH,
      {
        ...this.#requestOptions(),
        method: "PUT",
        body,
      },
    );
    if (status !== 200) {
      throw new CliError(`Failed to remove contacts from group (HTTP ${status}).`);
    }
  }
}
