import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { Session } from "../src/proton/types.ts";
import {
  ADDRESSES_PATH,
  LABELS_PATH,
  LABEL_ARCHIVE,
  LABEL_INBOX,
  LABEL_STARRED,
  LABEL_TRASH,
  LABEL_TYPE_FOLDER,
  LABEL_TYPE_LABEL,
  MAIL_MESSAGES_DELETE_PATH,
  MAIL_MESSAGES_LABEL_PATH,
  MAIL_MESSAGES_READ_PATH,
  MAIL_MESSAGES_UNLABEL_PATH,
  MAIL_MESSAGES_UNREAD_PATH,
} from "../src/proton/constants.ts";

mock.restore();

const mockSession: Session = {
  Code: 1000,
  AccessToken: "access-token",
  RefreshToken: "refresh-token",
  TokenType: "Bearer",
  Scopes: ["full"],
  UID: "uid-1",
  UserID: "user-1",
  ExpiresIn: 3600,
};

type RouteHandler = (init?: RequestInit) => unknown;

function mockFetch(routes: Record<string, RouteHandler>) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url).pathname;
    const query = new URL(url).search;
    const key = query ? `${path}${query}` : path;
    const handler = routes[key] ?? routes[path];
    if (!handler) {
      throw new Error(`unexpected fetch: ${key || path} ${init?.method ?? "GET"}`);
    }
    const body = handler(init);
    return new Response(JSON.stringify(body ?? { Code: 1000 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

const {
  labelMessages,
  unlabelMessages,
  markMessagesRead,
  markMessagesUnread,
  deleteMessages,
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  listAddresses,
} = await import("../src/proton/client.ts");

const {
  moveMessages,
  applyLabel,
  starMessages,
  trashMessages,
  readMessages,
  permanentlyDeleteMessages,
} = await import("../src/service/organize.ts");

const {
  listUserLabels,
  createUserLabel,
  deleteUserLabel,
} = await import("../src/service/labels.ts");

const { listAccountAddresses } = await import("../src/service/addresses.ts");

describe("CASE-ORGANIZE-LABELS", () => {
  afterAll(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  test("labelMessages PUTs LabelID and IDs", async () => {
    let method: string | undefined;
    let posted: Record<string, unknown> | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_LABEL_PATH]: (init) => {
        method = init?.method;
        posted = init?.body ? JSON.parse(String(init.body)) : undefined;
        return { Code: 1000 };
      },
    });

    await labelMessages({
      session: mockSession,
      fetchImpl,
      labelId: LABEL_ARCHIVE,
      messageIds: ["msg-1", "msg-2"],
    });

    expect(method).toBe("PUT");
    expect(posted).toEqual({
      LabelID: LABEL_ARCHIVE,
      IDs: ["msg-1", "msg-2"],
    });
  });

  test("unlabelMessages PUTs unlabel endpoint", async () => {
    let posted: Record<string, unknown> | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_UNLABEL_PATH]: (init) => {
        posted = init?.body ? JSON.parse(String(init.body)) : undefined;
        return { Code: 1000 };
      },
    });

    await unlabelMessages({
      session: mockSession,
      fetchImpl,
      labelId: LABEL_INBOX,
      messageIds: ["msg-1"],
    });

    expect(posted).toEqual({ LabelID: LABEL_INBOX, IDs: ["msg-1"] });
  });

  test("markMessagesRead and unread use message action endpoints", async () => {
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_READ_PATH]: (init) => {
        calls.push({
          path: MAIL_MESSAGES_READ_PATH,
          body: JSON.parse(String(init?.body)),
        });
        return { Code: 1000 };
      },
      [MAIL_MESSAGES_UNREAD_PATH]: (init) => {
        calls.push({
          path: MAIL_MESSAGES_UNREAD_PATH,
          body: JSON.parse(String(init?.body)),
        });
        return { Code: 1000 };
      },
    });

    await markMessagesRead({
      session: mockSession,
      fetchImpl,
      messageIds: ["a"],
    });
    await markMessagesUnread({
      session: mockSession,
      fetchImpl,
      messageIds: ["b"],
    });

    expect(calls).toEqual([
      { path: MAIL_MESSAGES_READ_PATH, body: { IDs: ["a"] } },
      { path: MAIL_MESSAGES_UNREAD_PATH, body: { IDs: ["b"] } },
    ]);
  });

  test("deleteMessages PUTs delete endpoint", async () => {
    let posted: Record<string, unknown> | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_DELETE_PATH]: (init) => {
        posted = init?.body ? JSON.parse(String(init.body)) : undefined;
        return { Code: 1000 };
      },
    });

    await deleteMessages({
      session: mockSession,
      fetchImpl,
      messageIds: ["msg-del"],
    });

    expect(posted).toEqual({ IDs: ["msg-del"] });
  });

  test("moveMessages labels target and optionally unlabels source", async () => {
    const calls: string[] = [];
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_LABEL_PATH]: () => {
        calls.push("label");
        return { Code: 1000 };
      },
      [MAIL_MESSAGES_UNLABEL_PATH]: () => {
        calls.push("unlabel");
        return { Code: 1000 };
      },
    });

    await moveMessages({
      session: mockSession,
      fetchImpl,
      messageIds: ["msg-1"],
      toLabel: "archive",
      fromLabel: "inbox",
    });

    expect(calls).toEqual(["label", "unlabel"]);
  });

  test("starMessages resolves starred system label", async () => {
    let labelId: string | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_LABEL_PATH]: (init) => {
        const posted = JSON.parse(String(init?.body)) as { LabelID: string };
        labelId = posted.LabelID;
        return { Code: 1000 };
      },
    });

    await starMessages({
      session: mockSession,
      fetchImpl,
      messageIds: ["msg-1"],
    });

    expect(labelId).toBe(LABEL_STARRED);
  });

  test("trashMessages labels trash system id", async () => {
    let labelId: string | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_LABEL_PATH]: (init) => {
        const posted = JSON.parse(String(init?.body)) as { LabelID: string };
        labelId = posted.LabelID;
        return { Code: 1000 };
      },
    });

    await trashMessages({
      session: mockSession,
      fetchImpl,
      messageIds: ["msg-1"],
    });

    expect(labelId).toBe(LABEL_TRASH);
  });

  test("applyLabel resolves system label names", async () => {
    let labelId: string | undefined;
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_LABEL_PATH]: (init) => {
        const posted = JSON.parse(String(init?.body)) as { LabelID: string };
        labelId = posted.LabelID;
        return { Code: 1000 };
      },
    });

    await applyLabel({
      session: mockSession,
      fetchImpl,
      messageIds: ["msg-1"],
      label: "inbox",
    });

    expect(labelId).toBe(LABEL_INBOX);
  });

  test("listLabels fetches Type=1 and Type=3", async () => {
    const paths: string[] = [];
    const fetchImpl = mockFetch({
      [`${LABELS_PATH}?Type=${LABEL_TYPE_LABEL}`]: () => {
        paths.push("labels");
        return {
          Labels: [{ ID: "lbl-1", Name: "Work", Color: "#000", Type: LABEL_TYPE_LABEL }],
        };
      },
      [`${LABELS_PATH}?Type=${LABEL_TYPE_FOLDER}`]: () => {
        paths.push("folders");
        return {
          Labels: [{ ID: "fld-1", Name: "Projects", Color: "#111", Type: LABEL_TYPE_FOLDER }],
        };
      },
    });

    const items = await listLabels({ session: mockSession, fetchImpl });
    expect(paths).toEqual(["labels", "folders"]);
    expect(items).toHaveLength(2);
    expect(items[0]?.name).toBe("Work");
    expect(items[1]?.name).toBe("Projects");
  });

  test("createLabel POSTs label payload", async () => {
    let method: string | undefined;
    let posted: Record<string, unknown> | undefined;
    const fetchImpl = mockFetch({
      [LABELS_PATH]: (init) => {
        method = init?.method;
        posted = init?.body ? JSON.parse(String(init.body)) : undefined;
        return {
          Label: { ID: "lbl-new", Name: "VIP", Color: "#7272a1", Type: LABEL_TYPE_LABEL },
        };
      },
    });

    const label = await createUserLabel({
      session: mockSession,
      fetchImpl,
      name: "VIP",
    });

    expect(method).toBe("POST");
    expect(posted?.Name).toBe("VIP");
    expect(label.id).toBe("lbl-new");
  });

  test("updateLabel and deleteLabel hit label id paths", async () => {
    const calls: Array<{ method: string; path: string }> = [];
    const fetchImpl = mockFetch({
      [`${LABELS_PATH}/lbl-1`]: (init) => {
        calls.push({ method: init?.method ?? "GET", path: `${LABELS_PATH}/lbl-1` });
        if (init?.method === "PUT") {
          return {
            Label: { ID: "lbl-1", Name: "Renamed", Color: "#7272a1", Type: LABEL_TYPE_LABEL },
          };
        }
        return { Code: 1000 };
      },
    });

    await updateLabel({
      session: mockSession,
      fetchImpl,
      labelId: "lbl-1",
      request: { Name: "Renamed" },
    });
    await deleteLabel({ session: mockSession, fetchImpl, labelId: "lbl-1" });

    expect(calls).toEqual([
      { method: "PUT", path: `${LABELS_PATH}/lbl-1` },
      { method: "DELETE", path: `${LABELS_PATH}/lbl-1` },
    ]);
  });

  test("listUserLabels only requests Type=1", async () => {
    let requested = "";
    const fetchImpl = mockFetch({
      [`${LABELS_PATH}?Type=${LABEL_TYPE_LABEL}`]: () => {
        requested = "type-1";
        return { Labels: [] };
      },
    });

    await listUserLabels({ session: mockSession, fetchImpl });
    expect(requested).toBe("type-1");
  });

  test("deleteUserLabel deletes by id", async () => {
    let method: string | undefined;
    const fetchImpl = mockFetch({
      [`${LABELS_PATH}/lbl-x`]: (init) => {
        method = init?.method;
        return { Code: 1000 };
      },
    });

    await deleteUserLabel({
      session: mockSession,
      fetchImpl,
      labelId: "lbl-x",
    });

    expect(method).toBe("DELETE");
  });

  test("listAddresses GETs core addresses", async () => {
    let path = "";
    const fetchImpl = mockFetch({
      [ADDRESSES_PATH]: () => {
        path = ADDRESSES_PATH;
        return {
          Addresses: [
            {
              ID: "addr-1",
              Email: "me@proton.me",
              Keys: [{ ID: "key-1", PrivateKey: "x" }],
            },
          ],
        };
      },
    });

    const raw = await listAddresses({ session: mockSession, fetchImpl });
    expect(path).toBe(ADDRESSES_PATH);
    expect(raw[0]?.Email).toBe("me@proton.me");

    const summaries = await listAccountAddresses({
      session: mockSession,
      fetchImpl,
    });
    expect(summaries[0]).toEqual({
      id: "addr-1",
      email: "me@proton.me",
      keyCount: 1,
    });
  });

  test("readMessages and permanentlyDeleteMessages delegate to client", async () => {
    const paths: string[] = [];
    const fetchImpl = mockFetch({
      [MAIL_MESSAGES_READ_PATH]: () => {
        paths.push("read");
        return { Code: 1000 };
      },
      [MAIL_MESSAGES_DELETE_PATH]: () => {
        paths.push("delete");
        return { Code: 1000 };
      },
    });

    await readMessages({ session: mockSession, fetchImpl, messageIds: ["m1"] });
    await permanentlyDeleteMessages({
      session: mockSession,
      fetchImpl,
      messageIds: ["m2"],
    });

    expect(paths).toEqual(["read", "delete"]);
  });
});
