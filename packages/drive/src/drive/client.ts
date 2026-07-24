import { DRIVE_BLOCKS_PATH, DRIVE_VOLUMES_PATH } from "../proton/constants.ts";
import { protonFetch } from "../proton/http.ts";
import type { Session } from "../proton/types.ts";
import type { DriveLink } from "./types.ts";

export interface DriveApiOptions {
  session: Session;
  fetchImpl?: typeof fetch;
}

export interface VolumeRecord {
  VolumeID: string;
  Share: { ShareID: string; LinkID: string };
}

export interface ShareRecord {
  AddressID: string;
  Key: string;
  Passphrase: string;
  PassphraseSignature: string;
}

export class DriveApiClient {
  readonly session: Session;
  readonly fetchImpl?: typeof fetch;

  constructor(options: DriveApiOptions) {
    this.session = options.session;
    this.fetchImpl = options.fetchImpl;
  }

  private fetch<T>(path: string, options: Parameters<typeof protonFetch>[1] = {}) {
    return protonFetch<T>(path, {
      ...options,
      session: this.session,
      fetchImpl: this.fetchImpl,
    });
  }

  async listVolumes(): Promise<VolumeRecord[]> {
    const { status, data } = await this.fetch<{ Volumes: VolumeRecord[] }>(
      DRIVE_VOLUMES_PATH,
    );
    if (status !== 200 || !data.Volumes?.length) {
      throw new Error("No Drive volumes found.");
    }
    return data.Volumes;
  }

  async getShare(shareId: string): Promise<ShareRecord> {
    const { status, data } = await this.fetch<{ Share: ShareRecord }>(
      `/drive/shares/${shareId}`,
    );
    if (status !== 200 || !data.Share) {
      throw new Error(`Failed to load share ${shareId}.`);
    }
    return data.Share;
  }

  async getLink(shareId: string, linkId: string): Promise<DriveLink> {
    const { status, data } = await this.fetch<{ Link: DriveLink }>(
      `/drive/shares/${shareId}/links/${linkId}`,
    );
    if (status !== 200 || !data.Link) {
      throw new Error(`Failed to load link ${linkId}.`);
    }
    return data.Link;
  }

  async listChildren(shareId: string, linkId: string): Promise<DriveLink[]> {
    const all: DriveLink[] = [];
    for (let page = 0; ; page++) {
      const query = `?Page=${page}&PageSize=150`;
      const { status, data } = await this.fetch<{ Links: DriveLink[] }>(
        `/drive/shares/${shareId}/folders/${linkId}/children${query}`,
      );
      if (status !== 200) {
        throw new Error(`Failed to list folder children (HTTP ${status}).`);
      }
      const links = data.Links ?? [];
      if (links.length === 0) break;
      all.push(...links);
      if (links.length < 150) break;
    }
    return all;
  }

  async createFolder(
    shareId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { status } = await this.fetch(`/drive/shares/${shareId}/folders`, {
      method: "POST",
      body,
    });
    if (status !== 200) {
      throw new Error(`Folder create failed (HTTP ${status}).`);
    }
  }

  async createFile(
    shareId: string,
    body: Record<string, unknown>,
  ): Promise<{ linkId: string; revisionId: string }> {
    const { status, data } = await this.fetch<{
      File: { ID: string; RevisionID: string };
    }>(`/drive/shares/${shareId}/files`, {
      method: "POST",
      body,
    });
    if (status !== 200 || !data.File?.ID) {
      throw new Error(`File create failed (HTTP ${status}).`);
    }
    return { linkId: data.File.ID, revisionId: data.File.RevisionID };
  }

  async getRevisionVerification(
    shareId: string,
    linkId: string,
    revisionId: string,
  ): Promise<{ verificationCode: string; contentKeyPacket: string }> {
    const { status, data } = await this.fetch<{
      VerificationCode: string;
      ContentKeyPacket: string;
    }>(
      `/drive/shares/${shareId}/links/${linkId}/revisions/${revisionId}/verification`,
    );
    if (status !== 200) {
      throw new Error(`Revision verification failed (HTTP ${status}).`);
    }
    return {
      verificationCode: data.VerificationCode,
      contentKeyPacket: data.ContentKeyPacket,
    };
  }

  async requestBlockLinks(body: Record<string, unknown>): Promise<
    { token: string; bareUrl: string }[]
  > {
    const { status, data } = await this.fetch<{
      UploadLinks: { Token: string; BareURL: string }[];
    }>(DRIVE_BLOCKS_PATH, {
      method: "POST",
      body,
    });
    if (status !== 200 || !data.UploadLinks) {
      throw new Error(`Block link request failed (HTTP ${status}).`);
    }
    return data.UploadLinks.map((link) => ({
      token: link.Token,
      bareUrl: link.BareURL,
    }));
  }

  async uploadBlock(
    bareUrl: string,
    token: string,
    data: Uint8Array,
  ): Promise<void> {
    const boundary = "proton-cli-boundary";
    const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="Block"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n`;
    const suffix = `\r\n--${boundary}--\r\n`;
    const body = Buffer.concat([
      Buffer.from(prefix),
      Buffer.from(data),
      Buffer.from(suffix),
    ]);

    const fetchImpl = this.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(bareUrl, {
      method: "POST",
      headers: {
        "pm-storage-token": token,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    if (response.status < 200 || response.status >= 300) {
      const text = await response.text();
      throw new Error(`Block upload failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }
  }

  async commitRevision(
    shareId: string,
    linkId: string,
    revisionId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/shares/${shareId}/files/${linkId}/revisions/${revisionId}`,
      { method: "PUT", body },
    );
    if (status !== 200) {
      throw new Error(`Revision commit failed (HTTP ${status}).`);
    }
  }

  async listRevisionBlocks(
    shareId: string,
    linkId: string,
    revisionId: string,
  ): Promise<
    { index: number; bareUrl: string; token: string; encSignature: string }[]
  > {
    const blocks: {
      index: number;
      bareUrl: string;
      token: string;
      encSignature: string;
    }[] = [];
    const pageSize = 50;
    for (let from = 1; ; from += pageSize) {
      const query = `?FromBlockIndex=${from}&PageSize=${pageSize}`;
      const { status, data } = await this.fetch<{
        Revision: {
          Blocks: {
            Index: number;
            BareURL: string;
            Token: string;
            EncSignature: string;
          }[];
        };
      }>(
        `/drive/shares/${shareId}/files/${linkId}/revisions/${revisionId}${query}`,
      );
      if (status !== 200) {
        throw new Error(`Revision fetch failed (HTTP ${status}).`);
      }
      const page = data.Revision?.Blocks ?? [];
      for (const block of page) {
        blocks.push({
          index: block.Index,
          bareUrl: block.BareURL,
          token: block.Token,
          encSignature: block.EncSignature,
        });
      }
      if (page.length < pageSize) break;
    }
    return blocks.sort((a, b) => a.index - b.index);
  }

  async downloadBlock(bareUrl: string, token: string): Promise<Uint8Array> {
    const fetchImpl = this.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(bareUrl, {
      headers: { "pm-storage-token": token },
    });
    if (!response.ok) {
      throw new Error(`Block download failed (HTTP ${response.status}).`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async renameLink(
    shareId: string,
    linkId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/shares/${shareId}/links/${linkId}/rename`,
      { method: "PUT", body },
    );
    if (status !== 200) {
      throw new Error(`Rename failed (HTTP ${status}).`);
    }
  }

  async moveLink(
    shareId: string,
    linkId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/shares/${shareId}/links/${linkId}/move`,
      { method: "PUT", body },
    );
    if (status !== 200) {
      throw new Error(`Move failed (HTTP ${status}).`);
    }
  }

  async copyLink(
    shareId: string,
    linkId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/shares/${shareId}/links/${linkId}/copy`,
      { method: "PUT", body },
    );
    if (status !== 200) {
      throw new Error(`Copy failed (HTTP ${status}).`);
    }
  }

  async trashLinks(volumeId: string, linkIds: string[]): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/volumes/${volumeId}/trash_multiple`,
      { method: "POST", body: { LinkIDs: linkIds } },
    );
    if (status !== 200) {
      throw new Error(`Trash failed (HTTP ${status}).`);
    }
  }

  async deleteLinksPermanently(
    volumeId: string,
    linkIds: string[],
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/volumes/${volumeId}/trash/delete_multiple`,
      { method: "POST", body: { LinkIDs: linkIds } },
    );
    if (status !== 200) {
      throw new Error(`Permanent delete failed (HTTP ${status}).`);
    }
  }

  async listTrash(
    volumeId: string,
    page = 0,
    pageSize = 150,
  ): Promise<{ shareId: string; linkIds: string[] }[]> {
    const { status, data } = await this.fetch<{
      Trash: { ShareID: string; LinkIDs: string[] }[];
    }>(
      `/drive/volumes/${volumeId}/trash?Page=${page}&PageSize=${pageSize}`,
    );
    if (status !== 200) {
      throw new Error(`Trash list failed (HTTP ${status}).`);
    }
    return (data.Trash ?? []).map((t) => ({
      shareId: t.ShareID,
      linkIds: t.LinkIDs ?? [],
    }));
  }

  async restoreTrash(volumeId: string, linkIds: string[]): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/volumes/${volumeId}/trash/restore_multiple`,
      { method: "PUT", body: { LinkIDs: linkIds } },
    );
    if (status !== 200) {
      throw new Error(`Trash restore failed (HTTP ${status}).`);
    }
  }

  async emptyTrash(volumeId: string): Promise<void> {
    const { status } = await this.fetch(
      `/drive/volumes/${volumeId}/trash`,
      { method: "DELETE" },
    );
    if (status !== 200) {
      throw new Error(`Trash empty failed (HTTP ${status}).`);
    }
  }

  async listShares(showAll = true): Promise<
    {
      shareId: string;
      linkId: string;
      volumeId: string;
      type: number;
      locked: boolean;
    }[]
  > {
    const query = showAll ? "?ShowAll=1" : "";
    const { status, data } = await this.fetch<{
      Shares: {
        ShareID: string;
        LinkID: string;
        VolumeID: string;
        Type: number;
        Locked: boolean;
      }[];
    }>(`/drive/shares${query}`);
    if (status !== 200) {
      throw new Error(`Share list failed (HTTP ${status}).`);
    }
    return (data.Shares ?? []).map((s) => ({
      shareId: s.ShareID,
      linkId: s.LinkID,
      volumeId: s.VolumeID,
      type: s.Type,
      locked: s.Locked,
    }));
  }

  async createVolumeShare(
    volumeId: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const { status, data } = await this.fetch<{ Share: { ID: string } }>(
      `/drive/volumes/${volumeId}/shares`,
      { method: "POST", body },
    );
    if (status !== 200 || !data.Share?.ID) {
      throw new Error(`Share create failed (HTTP ${status}).`);
    }
    return data.Share.ID;
  }

  async listShareUrls(shareId: string): Promise<
    {
      shareUrlId: string;
      shareId: string;
      token: string;
      publicUrl: string;
      password: string;
      permissions: number;
      flags: number;
      createTime: number;
      expirationTime?: number | null;
      numAccesses: number;
    }[]
  > {
    const { status, data } = await this.fetch<{
      ShareURLs: {
        ShareURLID: string;
        ShareID: string;
        Token: string;
        PublicUrl: string;
        Password: string;
        Permissions: number;
        Flags: number;
        CreateTime: number;
        ExpirationTime?: number | null;
        NumAccesses: number;
      }[];
    }>(`/drive/shares/${shareId}/urls`);
    if (status !== 200) {
      throw new Error(`Share URL list failed (HTTP ${status}).`);
    }
    return (data.ShareURLs ?? []).map((u) => ({
      shareUrlId: u.ShareURLID,
      shareId: u.ShareID,
      token: u.Token,
      publicUrl: u.PublicUrl,
      password: u.Password,
      permissions: u.Permissions,
      flags: u.Flags,
      createTime: u.CreateTime,
      expirationTime: u.ExpirationTime,
      numAccesses: u.NumAccesses,
    }));
  }

  async createShareUrl(
    shareId: string,
    body: Record<string, unknown>,
  ): Promise<{
    shareUrlId: string;
    publicUrl: string;
    password: string;
    permissions: number;
    flags: number;
  }> {
    const { status, data } = await this.fetch<{
      ShareURL: {
        ShareURLID: string;
        PublicUrl: string;
        Password: string;
        Permissions: number;
        Flags: number;
      };
    }>(`/drive/shares/${shareId}/urls`, { method: "POST", body });
    if (status !== 200 || !data.ShareURL) {
      throw new Error(`Share URL create failed (HTTP ${status}).`);
    }
    return {
      shareUrlId: data.ShareURL.ShareURLID,
      publicUrl: data.ShareURL.PublicUrl,
      password: data.ShareURL.Password,
      permissions: data.ShareURL.Permissions,
      flags: data.ShareURL.Flags,
    };
  }

  async deleteShareUrl(shareId: string, shareUrlId: string): Promise<void> {
    const { status } = await this.fetch(
      `/drive/shares/${shareId}/urls/${shareUrlId}`,
      { method: "DELETE" },
    );
    if (status !== 200) {
      throw new Error(`Share URL delete failed (HTTP ${status}).`);
    }
  }

  async listMembers(shareId: string): Promise<
    { memberId: string; email: string; permissions: number; createTime: number }[]
  > {
    const { status, data } = await this.fetch<{
      Members: {
        MemberID: string;
        Email: string;
        Permissions: number;
        CreateTime: number;
      }[];
    }>(`/drive/v2/shares/${shareId}/members`);
    if (status !== 200) {
      throw new Error(`Member list failed (HTTP ${status}).`);
    }
    return (data.Members ?? []).map((m) => ({
      memberId: m.MemberID,
      email: m.Email,
      permissions: m.Permissions,
      createTime: m.CreateTime,
    }));
  }

  async listOutgoingInvites(shareId: string): Promise<
    {
      invitationId: string;
      inviteeEmail: string;
      permissions: number;
      createTime: number;
    }[]
  > {
    const { status, data } = await this.fetch<{
      Invitations: {
        InvitationID: string;
        InviteeEmail: string;
        Permissions: number;
        CreateTime: number;
      }[];
    }>(`/drive/v2/shares/${shareId}/invitations`);
    if (status !== 200) {
      throw new Error(`Outgoing invitation list failed (HTTP ${status}).`);
    }
    return (data.Invitations ?? []).map((i) => ({
      invitationId: i.InvitationID,
      inviteeEmail: i.InviteeEmail,
      permissions: i.Permissions,
      createTime: i.CreateTime,
    }));
  }

  async inviteMember(
    shareId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/shares/${shareId}/invitations`,
      { method: "POST", body },
    );
    if (status !== 200) {
      throw new Error(`Member invite failed (HTTP ${status}).`);
    }
  }

  async removeMember(shareId: string, memberId: string): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/shares/${shareId}/members/${memberId}`,
      { method: "DELETE" },
    );
    if (status !== 200) {
      throw new Error(`Member remove failed (HTTP ${status}).`);
    }
  }

  async removeOutgoingInvite(
    shareId: string,
    invitationId: string,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/shares/${shareId}/invitations/${invitationId}`,
      { method: "DELETE" },
    );
    if (status !== 200) {
      throw new Error(`Invitation cancel failed (HTTP ${status}).`);
    }
  }

  async listIncomingInvitations(anchorId?: string): Promise<{
    invitations: { volumeId: string; shareId: string; invitationId: string }[];
    anchorId: string;
    more: boolean;
  }> {
    const query = anchorId ? `?AnchorID=${encodeURIComponent(anchorId)}` : "";
    const { status, data } = await this.fetch<{
      Invitations: {
        VolumeID: string;
        ShareID: string;
        InvitationID: string;
      }[];
      AnchorID: string;
      More: boolean;
    }>(`/drive/v2/shares/invitations${query}`);
    if (status !== 200) {
      throw new Error(`Invitation list failed (HTTP ${status}).`);
    }
    return {
      invitations: (data.Invitations ?? []).map((i) => ({
        volumeId: i.VolumeID,
        shareId: i.ShareID,
        invitationId: i.InvitationID,
      })),
      anchorId: data.AnchorID ?? "",
      more: Boolean(data.More),
    };
  }

  async getInvitation(invitationId: string): Promise<{
    invitationId: string;
    inviterEmail: string;
    inviteeEmail: string;
    permissions: number;
    createTime: number;
    keyPacket: string;
    shareId: string;
    volumeId: string;
  }> {
    const { status, data } = await this.fetch<{
      Invitation: {
        InvitationID: string;
        InviterEmail: string;
        InviteeEmail: string;
        Permissions: number;
        CreateTime: number;
        KeyPacket: string;
      };
      Share: { ShareID: string; VolumeID: string };
    }>(`/drive/v2/shares/invitations/${invitationId}`);
    if (status !== 200 || !data.Invitation) {
      throw new Error(`Invitation fetch failed (HTTP ${status}).`);
    }
    return {
      invitationId: data.Invitation.InvitationID,
      inviterEmail: data.Invitation.InviterEmail,
      inviteeEmail: data.Invitation.InviteeEmail,
      permissions: data.Invitation.Permissions,
      createTime: data.Invitation.CreateTime,
      keyPacket: data.Invitation.KeyPacket,
      shareId: data.Share.ShareID,
      volumeId: data.Share.VolumeID,
    };
  }

  async acceptInvitation(
    invitationId: string,
    sessionKeySignature: string,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/shares/invitations/${invitationId}/accept`,
      {
        method: "POST",
        body: { SessionKeySignature: sessionKeySignature },
      },
    );
    if (status !== 200) {
      throw new Error(`Invitation accept failed (HTTP ${status}).`);
    }
  }

  async rejectInvitation(invitationId: string): Promise<void> {
    const { status } = await this.fetch(
      `/drive/v2/shares/invitations/${invitationId}/reject`,
      { method: "POST" },
    );
    if (status !== 200) {
      throw new Error(`Invitation reject failed (HTTP ${status}).`);
    }
  }

  async fetchAddressPublicKeys(email: string): Promise<string[]> {
    const { status, data } = await this.fetch<{
      Address: { Keys: { PublicKey: string }[] };
    }>(`/core/v4/keys/all?Email=${encodeURIComponent(email)}`);
    if (status !== 200) {
      throw new Error(`Address keys fetch failed (HTTP ${status}).`);
    }
    return (data.Address?.Keys ?? []).map((k) => k.PublicKey);
  }

  async getAuthModulus(): Promise<{ modulus: string; modulusId: string }> {
    const { status, data } = await this.fetch<{
      Modulus: string;
      ModulusID: string;
    }>("/core/v4/auth/modulus");
    if (status !== 200) {
      throw new Error(`Modulus fetch failed (HTTP ${status}).`);
    }
    return { modulus: data.Modulus, modulusId: data.ModulusID };
  }

  async copyVolumeLink(
    volumeId: string,
    linkId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const { status } = await this.fetch(
      `/drive/volumes/${volumeId}/links/${linkId}/copy`,
      { method: "POST", body },
    );
    if (status !== 200) {
      throw new Error(`Copy failed (HTTP ${status}).`);
    }
  }

  async listPhotos(
    volumeId: string,
    options: { tag?: number; previousPageLastLinkId?: string } = {},
  ): Promise<
    {
      linkId: string;
      captureTime: number;
      hash: string;
      contentHash: string;
      tags: number[];
    }[]
  > {
    const params = new URLSearchParams({ PageSize: "500" });
    if (options.tag !== undefined) {
      params.set("Tag", String(options.tag));
    }
    if (options.previousPageLastLinkId) {
      params.set("PreviousPageLastLinkID", options.previousPageLastLinkId);
    }
    const { status, data } = await this.fetch<{
      Photos: {
        LinkID: string;
        CaptureTime: number;
        Hash: string;
        ContentHash: string;
        Tags: number[];
      }[];
    }>(`/drive/volumes/${volumeId}/photos?${params}`);
    if (status !== 200) {
      throw new Error(`Photos list failed (HTTP ${status}).`);
    }
    return (data.Photos ?? []).map((p) => ({
      linkId: p.LinkID,
      captureTime: p.CaptureTime,
      hash: p.Hash,
      contentHash: p.ContentHash,
      tags: p.Tags ?? [],
    }));
  }

  async listAlbums(volumeId: string): Promise<
    { linkId: string; photoCount: number }[]
  > {
    const { status, data } = await this.fetch<{
      Albums: { LinkID: string; PhotoCount: number }[];
    }>(`/drive/photos/volumes/${volumeId}/albums`);
    if (status !== 200) {
      throw new Error(`Album list failed (HTTP ${status}).`);
    }
    return (data.Albums ?? []).map((a) => ({
      linkId: a.LinkID,
      photoCount: a.PhotoCount,
    }));
  }
}
