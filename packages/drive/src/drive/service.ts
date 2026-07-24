import {
  addressKeysForId,
  primaryAddress,
  unlockDriveKeys,
  type UnlockedKeys,
} from "../keys/unlock.ts";
import {
  loadSession,
  persistSession,
  refreshSession,
  verifySession,
} from "../proton/auth.ts";
import { NotFoundError, NotSignedInError } from "../util/errors.ts";
import { baseOf, dirOf, joinDrivePath, normalizeDrivePath } from "../util/paths.ts";
import { resolveAccountPassword } from "../util/password.ts";
import { DriveApiClient } from "./client.ts";
import {
  assertBlockHash,
  assertContiguousBlockIndices,
  buildRevisionManifest,
} from "./crypto/download-verify.ts";
import {
  decryptAndVerifyBlock,
  decryptFileSessionKey,
  decryptName,
  encryptBlock,
  encryptName,
  generateFileKeys,
  generateNodeHashKey,
  generateNodeKeys,
  hashKeyOf,
  lookupHash,
  reEncryptName,
  reEncryptNodePassphrase,
  sha256Base64,
  signManifest,
  unlockNodeKey,
  verifyRevisionManifest,
  xorVerifier,
} from "./crypto/node-crypto.ts";
import { getDriveCrypto, base64ToBytes, sha256Raw, type SessionKeyMaterial } from "./crypto/proxy.ts";
import {
  buildShareUrlPasswordFields,
  composeSharePassword,
  decryptShareUrlPassword,
  encryptSessionKeyForPublicKeys,
  permFor,
  randomSharePassword,
  shareRoleLabel,
  signAcceptSessionKey,
  signInviteKeyPacket,
  type LinkPasswordOptions,
} from "./crypto/share-crypto.ts";
import {
  DRIVE_BLOCK_SIZE,
  LINK_TYPE_FILE,
  LINK_TYPE_FOLDER,
  type DriveAlbum,
  type DriveChild,
  type DriveContext,
  type DriveInvitation,
  type DriveItemInfo,
  type DriveLink,
  type DrivePhoto,
  type DryRunAction,
  type PhotosContext,
  type ResolvedPath,
  type ShareInvitee,
  type ShareLinkInfo,
  type ShareMember,
  type ShareStatusInfo,
  type TrashEntry,
} from "./types.ts";

export interface DriveServiceOptions {
  fetchImpl?: typeof fetch;
}

export class DriveService {
  private readonly fetchImpl?: typeof fetch;

  constructor(options: DriveServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl;
  }

  async open(options: {
    password?: string;
    passRef?: string;
  }): Promise<{ client: DriveApiClient; context: DriveContext; unlocked: UnlockedKeys }> {
    const saved = await loadSession();
    if (!saved) {
      throw new NotSignedInError();
    }

    let session = saved.session;
    if (!(await verifySession(session))) {
      session = await refreshSession(session);
      await persistSession(session, saved.username);
    }

    const password =
      options.password ??
      (await resolveAccountPassword({ passRef: options.passRef }));

    const client = new DriveApiClient({
      session,
      fetchImpl: this.fetchImpl,
    });
    const unlocked = await unlockDriveKeys(
      session,
      password,
      this.fetchImpl,
    );
    const context = await this.resolveContext(client, unlocked);
    return { client, context, unlocked };
  }

  async resolveContext(
    client: DriveApiClient,
    unlocked: UnlockedKeys,
  ): Promise<DriveContext> {
    const volumes = await client.listVolumes();
    const volume = volumes[0];
    if (!volume) {
      throw new Error("No Drive volume available.");
    }

    const share = await client.getShare(volume.Share.ShareID);
    const primary = primaryAddress(unlocked);
    const addressKeys = addressKeysForId(unlocked, share.AddressID);
    const crypto = await getDriveCrypto();

    const { data: sharePassphrase } = await crypto.decryptMessage({
      armoredMessage: share.Passphrase,
      decryptionKeys: addressKeys,
      format: "binary",
    });

    const passphraseBytes =
      sharePassphrase instanceof Uint8Array
        ? sharePassphrase
        : new TextEncoder().encode(String(sharePassphrase));

    let sharePassBinary = "";
    for (const byte of passphraseBytes) sharePassBinary += String.fromCharCode(byte);

    const sharePrivate = await crypto.importPrivateKey({
      armoredKey: share.Key,
      passphrase: sharePassBinary,
    });

    return {
      shareId: volume.Share.ShareID,
      volumeId: volume.VolumeID,
      rootLinkId: volume.Share.LinkID,
      shareKeys: [sharePrivate],
      addressId: primary.addressId,
      addressEmail: primary.email,
      addressKeys,
    };
  }

  async resolvePath(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
  ): Promise<ResolvedPath> {
    const normalized = normalizeDrivePath(path);
    const rootLink = await client.getLink(context.shareId, context.rootLinkId);
    const rootKeys = await unlockNodeKey(rootLink, context.shareKeys);

    if (normalized === "/") {
      return {
        shareId: context.shareId,
        linkId: context.rootLinkId,
        name: "",
        isFolder: true,
        parentKeys: context.shareKeys,
        nodeKeys: rootKeys,
      };
    }

    const parts = normalized.slice(1).split("/");
    let currentId = context.rootLinkId;
    let parentKeys = context.shareKeys;
    let nodeKeys = rootKeys;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      const children = await client.listChildren(context.shareId, currentId);
      let found: DriveLink | undefined;
      let foundName = "";

      for (const child of children) {
        try {
          const name = await decryptName(child.Name, nodeKeys);
          if (name === part) {
            found = child;
            foundName = name;
            break;
          }
        } catch {
          // skip undecryptable entries
        }
      }

      if (!found) {
        throw new NotFoundError(part);
      }

      if (isLast) {
        const childKeys = await unlockNodeKey(found, nodeKeys);
        return {
          shareId: context.shareId,
          linkId: found.LinkID,
          name: foundName,
          isFolder: found.Type === LINK_TYPE_FOLDER,
          parentKeys: nodeKeys,
          nodeKeys: childKeys,
        };
      }

      if (found.Type !== LINK_TYPE_FOLDER) {
        throw new NotFoundError(part);
      }

      currentId = found.LinkID;
      parentKeys = nodeKeys;
      nodeKeys = await unlockNodeKey(found, nodeKeys);
    }

    throw new NotFoundError(path);
  }

  async list(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
  ): Promise<DriveChild[]> {
    const resolved = await this.resolvePath(client, context, path);
    if (!resolved.isFolder) {
      throw new Error(`${path} is not a folder.`);
    }

    const raw = await client.listChildren(context.shareId, resolved.linkId);
    const out: DriveChild[] = [];
    for (const link of raw) {
      let name = "(decrypt failed)";
      try {
        name = await decryptName(link.Name, resolved.nodeKeys);
      } catch {
        // keep placeholder
      }
      out.push({
        linkId: link.LinkID,
        name,
        type: link.Type,
        size: link.Size,
        createTime: link.CreateTime,
        modifyTime: link.ModifyTime,
      });
    }
    return out;
  }

  async info(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
  ): Promise<DriveItemInfo> {
    const resolved = await this.resolvePath(client, context, path);
    const link = await client.getLink(context.shareId, resolved.linkId);
    return {
      linkId: resolved.linkId,
      name: resolved.name,
      path: normalizeDrivePath(path),
      type: link.Type,
      size: link.Size,
      mimeType: link.MIMEType,
      createTime: link.CreateTime,
      modifyTime: link.ModifyTime,
      shared: (link.ShareIDs?.length ?? 0) > 0,
    };
  }

  planFolderCreate(fullPath: string): DryRunAction {
    return {
      action: "folder.create",
      detail: { path: normalizeDrivePath(fullPath) },
    };
  }

  async createFolder(
    client: DriveApiClient,
    context: DriveContext,
    fullPath: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planFolderCreate(fullPath);
    if (dryRun) return plan;

    const parentPath = dirOf(fullPath);
    const name = baseOf(fullPath);
    if (!name) {
      throw new Error("Folder name is required.");
    }

    const parent = await this.resolvePath(client, context, parentPath);
    if (!parent.isFolder) {
      throw new Error(`${parentPath} is not a folder.`);
    }

    const parentLink = await client.getLink(context.shareId, parent.linkId);
    const hashKey = await hashKeyOf(parentLink, parent.nodeKeys);
    const hash = lookupHash(name, hashKey);
    const encName = await encryptName(name, parent.nodeKeys, context.addressKeys);
    const node = await generateNodeKeys(parent.nodeKeys, context.addressKeys);
    const nodeKeys = [node.nodePrivateKey];
    const nodeHashKey = await generateNodeHashKey(nodeKeys, nodeKeys);

    await client.createFolder(context.shareId, {
      Name: encName,
      Hash: hash,
      ParentLinkID: parent.linkId,
      NodePassphrase: node.nodePassphraseArmored,
      NodePassphraseSignature: node.nodePassphraseSignature,
      SignatureAddress: context.addressEmail,
      NodeKey: node.nodeKeyArmored,
      NodeHashKey: nodeHashKey,
    });
  }

  planUpload(
    destFolder: string,
    fileName: string,
    size?: number,
  ): DryRunAction {
    return {
      action: "items.upload",
      detail: {
        dest: normalizeDrivePath(destFolder),
        name: fileName,
        size: size ?? null,
      },
    };
  }

  async upload(
    client: DriveApiClient,
    context: DriveContext,
    destFolder: string,
    fileName: string,
    source: ReadableStream<Uint8Array> | Uint8Array,
    options: { mimeType?: string; dryRun?: boolean; sizeHint?: number } = {},
  ): Promise<DryRunAction | { linkId: string; revisionId: string }> {
    const plan = this.planUpload(destFolder, fileName, options.sizeHint);
    if (options.dryRun) return plan;

    const parent = await this.resolvePath(client, context, destFolder);
    if (!parent.isFolder) {
      throw new Error(`${destFolder} is not a folder.`);
    }

    const parentLink = await client.getLink(context.shareId, parent.linkId);
    const hashKey = await hashKeyOf(parentLink, parent.nodeKeys);
    const hash = lookupHash(fileName, hashKey);
    const encName = await encryptName(fileName, parent.nodeKeys, context.addressKeys);
    const node = await generateNodeKeys(parent.nodeKeys, context.addressKeys);
    const nodeKeys = [node.nodePrivateKey];
    const fileKeys = await generateFileKeys(nodeKeys);

    const created = await client.createFile(context.shareId, {
      Name: encName,
      Hash: hash,
      ParentLinkID: parent.linkId,
      NodePassphrase: node.nodePassphraseArmored,
      NodePassphraseSignature: node.nodePassphraseSignature,
      SignatureAddress: context.addressEmail,
      NodeKey: node.nodeKeyArmored,
      MIMEType: options.mimeType ?? "application/octet-stream",
      ContentKeyPacket: fileKeys.contentKeyPacket,
      ContentKeyPacketSignature: fileKeys.contentKeyPacketSignature,
    });

    const verification = await client.getRevisionVerification(
      context.shareId,
      created.linkId,
      created.revisionId,
    );
    const verCode = base64ToBytes(verification.verificationCode);

    const reader =
      source instanceof Uint8Array
        ? null
        : source.getReader();

    const rawHashes = new Map<number, Uint8Array>();
    const tokens = new Map<number, string>();
    let index = 0;
    let buffer = new Uint8Array(DRIVE_BLOCK_SIZE);
    let bufferLen = 0;

    const flushBlock = async (blockData: Uint8Array, blockIndex: number) => {
      const { encrypted, encSignature } = await encryptBlock(
        blockData,
        fileKeys.sessionKey,
        nodeKeys,
        context.addressKeys,
      );
      const hashB64 = sha256Base64(encrypted);
      const rawHash = sha256Raw(encrypted);
      const blockList = [
        {
          Hash: hashB64,
          EncSignature: encSignature,
          Size: encrypted.length,
          Index: blockIndex,
          Verifier: { Token: xorVerifier(verCode, encrypted) },
        },
      ];
      const links = await client.requestBlockLinks({
        AddressID: context.addressId,
        ShareID: context.shareId,
        LinkID: created.linkId,
        RevisionID: created.revisionId,
        BlockList: blockList,
      });
      const link = links[0];
      if (!link) {
        throw new Error("No upload link returned for block.");
      }
      await client.uploadBlock(link.bareUrl, link.token, encrypted);
      rawHashes.set(blockIndex, rawHash);
      tokens.set(blockIndex, link.token);
    };

    if (source instanceof Uint8Array) {
      if (source.length === 0) {
        await flushBlock(new Uint8Array(0), 1);
      } else {
        let offset = 0;
        while (offset < source.length) {
          index++;
          const end = Math.min(offset + DRIVE_BLOCK_SIZE, source.length);
          await flushBlock(source.slice(offset, end), index);
          offset = end;
        }
      }
    } else if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done && bufferLen === 0) {
          if (index === 0) {
            await flushBlock(new Uint8Array(0), 1);
          }
          break;
        }
        if (value) {
          let pos = 0;
          while (pos < value.length) {
            const take = Math.min(
              DRIVE_BLOCK_SIZE - bufferLen,
              value.length - pos,
            );
            buffer.set(value.subarray(pos, pos + take), bufferLen);
            bufferLen += take;
            pos += take;
            if (bufferLen === DRIVE_BLOCK_SIZE) {
              index++;
              await flushBlock(buffer, index);
              buffer = new Uint8Array(DRIVE_BLOCK_SIZE);
              bufferLen = 0;
            }
          }
        }
        if (done) {
          if (bufferLen > 0) {
            index++;
            await flushBlock(buffer.subarray(0, bufferLen), index);
          }
          break;
        }
      }
    }

    const manifest = buildRevisionManifest(rawHashes);
    const manifestSig = await signManifest(manifest, context.addressKeys);
    const blockList = [...tokens.entries()]
      .sort(([a], [b]) => a - b)
      .map(([idx, token]) => ({ Index: idx, Token: token }));

    await client.commitRevision(
      context.shareId,
      created.linkId,
      created.revisionId,
      {
        BlockList: blockList,
        State: 1,
        ManifestSignature: manifestSig,
        SignatureAddress: context.addressEmail,
      },
    );

    return created;
  }

  planDownload(path: string): DryRunAction {
    return {
      action: "items.download",
      detail: { path: normalizeDrivePath(path) },
    };
  }

  async download(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    dryRun = false,
  ): Promise<DryRunAction | Uint8Array> {
    const plan = this.planDownload(path);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    if (resolved.isFolder) {
      throw new Error(`${path} is a folder, not a file.`);
    }

    const link = await client.getLink(context.shareId, resolved.linkId);
    if (!link.FileProperties?.ContentKeyPacket) {
      throw new Error("File has no content key packet.");
    }

    // TODO(drive): stream verified blocks to a temp file for large downloads.
    return this.downloadVerifiedFile(
      client,
      context.shareId,
      resolved.linkId,
      link,
      resolved.nodeKeys,
      context.addressKeys,
    );
  }

  private async downloadVerifiedFile(
    client: DriveApiClient,
    shareId: string,
    linkId: string,
    link: DriveLink,
    nodeKeys: DriveContext["shareKeys"],
    addressKeys: DriveContext["addressKeys"],
  ): Promise<Uint8Array> {
    const fileProps = link.FileProperties;
    if (!fileProps?.ContentKeyPacket) {
      throw new Error("File has no content key packet.");
    }

    const sessionKey = await decryptFileSessionKey(
      fileProps.ContentKeyPacket,
      nodeKeys,
      fileProps.ContentKeyPacketSignature,
    );
    const revisionId = fileProps.ActiveRevision.ID;
    const revision = await client.listRevisionBlocks(shareId, linkId, revisionId);
    const blocks = revision.blocks;
    assertContiguousBlockIndices(blocks.map((b) => b.index));

    const verificationKeys = addressKeys.length ? addressKeys : nodeKeys;
    const rawHashes = new Map<number, Uint8Array>();
    const chunks: Uint8Array[] = [];

    for (const block of blocks) {
      const encrypted = await client.downloadBlock(block.bareUrl, block.token);
      assertBlockHash(encrypted, block.hash);
      rawHashes.set(block.index, sha256Raw(encrypted));
      const plain = await decryptAndVerifyBlock(
        encrypted,
        sessionKey,
        nodeKeys,
        verificationKeys,
        block.encSignature,
      );
      chunks.push(plain);
    }

    const manifestSignature =
      revision.manifestSignature ?? fileProps.ActiveRevision.ManifestSignature;
    await verifyRevisionManifest(
      rawHashes,
      manifestSignature,
      verificationKeys,
    );

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  planRename(path: string, newName: string): DryRunAction {
    return {
      action: "items.rename",
      detail: { path: normalizeDrivePath(path), newName },
    };
  }

  async rename(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    newName: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planRename(path, newName);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    const parentPath = dirOf(path);
    const parent = await this.resolvePath(client, context, parentPath);
    const parentLink = await client.getLink(context.shareId, parent.linkId);
    const hashKey = await hashKeyOf(parentLink, parent.nodeKeys);
    const encName = await encryptName(newName, parent.nodeKeys, context.addressKeys);

    await client.renameLink(context.shareId, resolved.linkId, {
      Name: encName,
      Hash: lookupHash(newName, hashKey),
      OriginalHash: lookupHash(resolved.name, hashKey),
      NameSignatureEmail: context.addressEmail,
    });
  }

  planMove(sourcePath: string, destFolder: string): DryRunAction {
    return {
      action: "items.move",
      detail: {
        source: normalizeDrivePath(sourcePath),
        dest: normalizeDrivePath(destFolder),
      },
    };
  }

  async move(
    client: DriveApiClient,
    context: DriveContext,
    sourcePath: string,
    destFolder: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planMove(sourcePath, destFolder);
    if (dryRun) return plan;

    const src = await this.resolvePath(client, context, sourcePath);
    const dst = await this.resolvePath(client, context, destFolder);
    if (!dst.isFolder) {
      throw new Error(`${destFolder} is not a folder.`);
    }

    const srcLink = await client.getLink(context.shareId, src.linkId);
    const dstLink = await client.getLink(context.shareId, dst.linkId);
    const hashKey = await hashKeyOf(dstLink, dst.nodeKeys);
    const encName = await reEncryptName(
      src.name,
      dst.nodeKeys,
      context.addressKeys,
    );
    const { passphrase } = await reEncryptNodePassphrase(
      srcLink,
      src.parentKeys,
      dst.nodeKeys,
      context.addressKeys,
    );

    await client.moveLink(context.shareId, src.linkId, {
      Name: encName,
      Hash: lookupHash(src.name, hashKey),
      ParentLinkID: dst.linkId,
      NodePassphrase: passphrase,
      NameSignatureEmail: context.addressEmail,
    });
  }

  planCopy(sourcePath: string, destFolder: string): DryRunAction {
    return {
      action: "items.copy",
      detail: {
        source: normalizeDrivePath(sourcePath),
        dest: normalizeDrivePath(destFolder),
      },
    };
  }

  async copy(
    client: DriveApiClient,
    context: DriveContext,
    sourcePath: string,
    destFolder: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planCopy(sourcePath, destFolder);
    if (dryRun) return plan;

    const src = await this.resolvePath(client, context, sourcePath);
    const dst = await this.resolvePath(client, context, destFolder);
    if (!dst.isFolder) {
      throw new Error(`${destFolder} is not a folder.`);
    }

    const srcLink = await client.getLink(context.shareId, src.linkId);
    const dstLink = await client.getLink(context.shareId, dst.linkId);
    const hashKey = await hashKeyOf(dstLink, dst.nodeKeys);
    const encName = await reEncryptName(
      src.name,
      dst.nodeKeys,
      context.addressKeys,
    );
    const { passphrase } = await reEncryptNodePassphrase(
      srcLink,
      src.parentKeys,
      dst.nodeKeys,
      context.addressKeys,
    );

    await client.copyVolumeLink(context.volumeId, src.linkId, {
      Name: encName,
      Hash: lookupHash(src.name, hashKey),
      NodePassphrase: passphrase,
      TargetVolumeID: context.volumeId,
      TargetParentLinkID: dst.linkId,
      NameSignatureEmail: context.addressEmail,
    });
  }

  planTrash(path: string): DryRunAction {
    return {
      action: "items.trash",
      detail: { path: normalizeDrivePath(path) },
    };
  }

  async trash(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planTrash(path);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    await client.trashLinks(context.volumeId, [resolved.linkId]);
  }

  planDelete(path: string, permanent: boolean): DryRunAction {
    return {
      action: permanent ? "items.delete" : "items.trash",
      detail: { path: normalizeDrivePath(path), permanent },
    };
  }

  async deleteItem(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    permanent: boolean,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planDelete(path, permanent);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    await client.trashLinks(context.volumeId, [resolved.linkId]);
    if (permanent) {
      await client.deleteLinksPermanently(context.volumeId, [resolved.linkId]);
    }
  }

  async resolvePhotosContext(
    client: DriveApiClient,
    unlocked: UnlockedKeys,
  ): Promise<PhotosContext> {
    const shares = await client.listShares(true);
    const photosShare = shares.find((s) => s.type === 4 && !s.locked);
    if (!photosShare) {
      throw new Error("No photos share available.");
    }

    const share = await client.getShare(photosShare.shareId);
    const addressKeys = addressKeysForId(unlocked, share.AddressID);
    const crypto = await getDriveCrypto();

    const { data: sharePassphrase } = await crypto.decryptMessage({
      armoredMessage: share.Passphrase,
      decryptionKeys: addressKeys,
      format: "binary",
    });

    const passphraseBytes =
      sharePassphrase instanceof Uint8Array
        ? sharePassphrase
        : new TextEncoder().encode(String(sharePassphrase));

    let sharePassBinary = "";
    for (const byte of passphraseBytes) sharePassBinary += String.fromCharCode(byte);

    const sharePrivate = await crypto.importPrivateKey({
      armoredKey: share.Key,
      passphrase: sharePassBinary,
    });

    const primary = primaryAddress(unlocked);
    return {
      shareId: photosShare.shareId,
      volumeId: photosShare.volumeId,
      rootLinkId: photosShare.linkId,
      shareKeys: [sharePrivate],
      addressId: primary.addressId,
      addressEmail: primary.email,
      addressKeys,
    };
  }

  planTrashList(): DryRunAction {
    return { action: "trash.list", detail: {} };
  }

  async listTrash(
    client: DriveApiClient,
    context: DriveContext,
    dryRun = false,
  ): Promise<DryRunAction | TrashEntry[]> {
    const plan = this.planTrashList();
    if (dryRun) return plan;

    const groups = await client.listTrash(context.volumeId);
    const out: TrashEntry[] = [];
    for (const group of groups) {
      for (const linkId of group.linkIds) {
        try {
          const link = await client.getLink(group.shareId, linkId);
          out.push({
            shareId: group.shareId,
            linkId,
            type: link.Type,
            size: link.Size,
          });
        } catch {
          out.push({
            shareId: group.shareId,
            linkId,
            type: 0,
            size: 0,
          });
        }
      }
    }
    return out;
  }

  planTrashRestore(linkIds: string[]): DryRunAction {
    return { action: "trash.restore", detail: { linkIds } };
  }

  async restoreTrash(
    client: DriveApiClient,
    context: DriveContext,
    linkIds: string[],
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planTrashRestore(linkIds);
    if (dryRun) return plan;
    await client.restoreTrash(context.volumeId, linkIds);
  }

  planTrashEmpty(): DryRunAction {
    return { action: "trash.empty", detail: {} };
  }

  async emptyTrash(
    client: DriveApiClient,
    context: DriveContext,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planTrashEmpty();
    if (dryRun) return plan;

    const volumes = await client.listVolumes();
    for (const volume of volumes) {
      await client.emptyTrash(volume.VolumeID);
    }
    await client.emptyTrash(context.volumeId);
  }

  private async shareSessionKey(
    client: DriveApiClient,
    context: DriveContext,
    shareId: string,
    resolved: ResolvedPath,
  ): Promise<SessionKeyMaterial> {
    const share = await client.getShare(shareId);
    const crypto = await getDriveCrypto();
    try {
      return crypto.decryptSessionKey({
        armoredMessage: share.Passphrase,
        decryptionKeys: resolved.nodeKeys,
      });
    } catch {
      return crypto.decryptSessionKey({
        armoredMessage: share.Passphrase,
        decryptionKeys: context.addressKeys,
      });
    }
  }

  private async ensureItemShareId(
    client: DriveApiClient,
    context: DriveContext,
    resolved: ResolvedPath,
  ): Promise<{ shareId: string; sessionKey: SessionKeyMaterial }> {
    const link = await client.getLink(context.shareId, resolved.linkId);
    for (const sid of link.ShareIDs ?? []) {
      if (sid !== context.shareId) {
        const sessionKey = await this.shareSessionKey(client, context, sid, resolved);
        return { shareId: sid, sessionKey };
      }
    }

    const crypto = await getDriveCrypto();
    const node = await generateNodeKeys(resolved.nodeKeys, context.addressKeys);
    const sessionKey = await crypto.generateSessionKey({ algorithm: "aes256" });

    const shareId = await client.createVolumeShare(context.volumeId, {
      AddressID: context.addressId,
      RootLinkID: resolved.linkId,
      ShareKey: node.nodeKeyArmored,
      SharePassphrase: node.nodePassphraseArmored,
      SharePassphraseSignature: node.nodePassphraseSignature,
      PassphraseKeyPacket: node.nodePassphraseArmored,
      NameKeyPacket: node.nodePassphraseArmored,
    });

    return { shareId, sessionKey };
  }

  planShareStatus(path: string): DryRunAction {
    return { action: "share.status", detail: { path: normalizeDrivePath(path) } };
  }

  async shareStatus(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    dryRun = false,
  ): Promise<DryRunAction | ShareStatusInfo> {
    const plan = this.planShareStatus(path);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    const link = await client.getLink(context.shareId, resolved.linkId);
    const status: ShareStatusInfo = {
      path: normalizeDrivePath(path),
      type: link.Type === LINK_TYPE_FOLDER ? "folder" : "file",
      publicLinks: [],
      members: [],
      pendingInvitations: [],
    };

    for (const sid of link.ShareIDs ?? []) {
      if (sid === context.shareId) continue;
      const urls = await client.listShareUrls(sid);
      for (const u of urls) {
        const { generated } = await decryptShareUrlPassword(
          u.password,
          u.flags,
          context.addressKeys,
        );
        status.publicLinks.push({
          shareUrlId: u.shareUrlId,
          shareId: u.shareId,
          url: generated ? `${u.publicUrl}#${generated}` : u.publicUrl,
          canEdit: (u.permissions & 2) !== 0,
          createTime: u.createTime,
          expireTime: u.expirationTime,
          numAccesses: u.numAccesses,
        });
      }

      const members = await client.listMembers(sid);
      status.members.push(
        ...members.map(
          (m): ShareMember => ({
            memberId: m.memberId,
            email: m.email,
            role: shareRoleLabel(m.permissions),
            createTime: m.createTime,
          }),
        ),
      );

      const invites = await client.listOutgoingInvites(sid);
      status.pendingInvitations.push(
        ...invites.map(
          (i): ShareInvitee => ({
            invitationId: i.invitationId,
            email: i.inviteeEmail,
            role: shareRoleLabel(i.permissions),
            createTime: i.createTime,
          }),
        ),
      );
    }

    return status;
  }

  planShareLink(path: string, options: LinkPasswordOptions = {}): DryRunAction {
    return {
      action: "share.link",
      detail: { path: normalizeDrivePath(path), ...options },
    };
  }

  async ensureShareLink(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    options: LinkPasswordOptions = {},
    dryRun = false,
  ): Promise<DryRunAction | ShareLinkInfo> {
    const plan = this.planShareLink(path, options);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    const { shareId, sessionKey } = await this.ensureItemShareId(
      client,
      context,
      resolved,
    );

    const existing = await client.listShareUrls(shareId);
    if (existing.length > 0 && !options.setEdit && !options.setExpiry && !options.setPassword) {
      const u = existing[0]!;
      const { generated } = await decryptShareUrlPassword(
        u.password,
        u.flags,
        context.addressKeys,
      );
      return {
        shareUrlId: u.shareUrlId,
        shareId: u.shareId,
        url: generated ? `${u.publicUrl}#${generated}` : u.publicUrl,
        canEdit: (u.permissions & 2) !== 0,
        createTime: u.createTime,
        expireTime: u.expirationTime,
        numAccesses: u.numAccesses,
        generatedPassword: generated || undefined,
      };
    }

    const generated = randomSharePassword();
    const { full, flags, custom } = composeSharePassword(generated, options);
    const passwordFields = await buildShareUrlPasswordFields(
      sessionKey,
      full,
      context.addressKeys,
      () => client.getAuthModulus(),
    );

    const created = await client.createShareUrl(shareId, {
      Flags: flags,
      Permissions: permFor(Boolean(options.canEdit)),
      MaxAccesses: 0,
      CreatorEmail: context.addressEmail,
      ExpirationDuration:
        options.setExpiry && options.expireSeconds
          ? options.expireSeconds
          : null,
      ...passwordFields,
    });

    return {
      shareUrlId: created.shareUrlId,
      shareId,
      url: `${created.publicUrl}#${generated}`,
      canEdit: Boolean(options.canEdit),
      createTime: Date.now(),
      numAccesses: 0,
      generatedPassword: generated,
      ...(custom ? { customPassword: custom } : {}),
    };
  }

  planShareUnlink(path: string): DryRunAction {
    return { action: "share.unlink", detail: { path: normalizeDrivePath(path) } };
  }

  async unlinkShare(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    dryRun = false,
  ): Promise<DryRunAction | { removed: number }> {
    const plan = this.planShareUnlink(path);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    const link = await client.getLink(context.shareId, resolved.linkId);
    let removed = 0;
    for (const sid of link.ShareIDs ?? []) {
      if (sid === context.shareId) continue;
      const urls = await client.listShareUrls(sid);
      for (const u of urls) {
        await client.deleteShareUrl(u.shareId, u.shareUrlId);
        removed++;
      }
    }
    return { removed };
  }

  planShareAdd(path: string, email: string, canEdit = false): DryRunAction {
    return {
      action: "share.add",
      detail: { path: normalizeDrivePath(path), email, canEdit },
    };
  }

  async addShareMember(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    email: string,
    canEdit = false,
    message = "",
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planShareAdd(path, email, canEdit);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    const { shareId, sessionKey } = await this.ensureItemShareId(
      client,
      context,
      resolved,
    );

    const publicKeys = await client.fetchAddressPublicKeys(email);
    if (publicKeys.length === 0) {
      throw new Error(`${email} is not a Proton user (external invitations unsupported).`);
    }

    const keyPacketB64 = await encryptSessionKeyForPublicKeys(
      sessionKey,
      publicKeys,
    );
    const keyPacket = base64ToBytes(keyPacketB64);
    const keyPacketSignature = await signInviteKeyPacket(
      keyPacket,
      context.addressKeys,
    );

    const body: Record<string, unknown> = {
      Invitation: {
        InviteeEmail: email,
        InviterEmail: context.addressEmail,
        Permissions: permFor(canEdit),
        KeyPacket: keyPacketB64,
        KeyPacketSignature: keyPacketSignature,
      },
    };
    if (message || resolved.name) {
      body.EmailDetails = { Message: message, ItemName: resolved.name };
    }

    await client.inviteMember(shareId, body);
  }

  planShareRemove(path: string, email: string): DryRunAction {
    return {
      action: "share.remove",
      detail: { path: normalizeDrivePath(path), email },
    };
  }

  async removeShareMember(
    client: DriveApiClient,
    context: DriveContext,
    path: string,
    email: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planShareRemove(path, email);
    if (dryRun) return plan;

    const resolved = await this.resolvePath(client, context, path);
    const link = await client.getLink(context.shareId, resolved.linkId);
    const target = email.toLowerCase();

    for (const sid of link.ShareIDs ?? []) {
      if (sid === context.shareId) continue;

      const members = await client.listMembers(sid);
      for (const member of members) {
        if (member.email.toLowerCase() === target) {
          await client.removeMember(sid, member.memberId);
          return;
        }
      }

      const invites = await client.listOutgoingInvites(sid);
      for (const invite of invites) {
        if (invite.inviteeEmail.toLowerCase() === target) {
          await client.removeOutgoingInvite(sid, invite.invitationId);
          return;
        }
      }
    }

    throw new NotFoundError(email);
  }

  async listInvitations(
    client: DriveApiClient,
  ): Promise<DriveInvitation[]> {
    const out: DriveInvitation[] = [];
    let anchor = "";
    for (;;) {
      const page = await client.listIncomingInvitations(anchor || undefined);
      for (const stub of page.invitations) {
        try {
          const details = await client.getInvitation(stub.invitationId);
          out.push({
            invitationId: details.invitationId,
            inviterEmail: details.inviterEmail,
            inviteeEmail: details.inviteeEmail,
            shareId: details.shareId,
            volumeId: details.volumeId,
            role: shareRoleLabel(details.permissions),
            createTime: details.createTime,
          });
        } catch {
          // skip broken invitation entries
        }
      }
      if (!page.more || !page.anchorId) break;
      anchor = page.anchorId;
    }
    return out;
  }

  planInvitationAccept(invitationId: string): DryRunAction {
    return { action: "invitations.accept", detail: { invitationId } };
  }

  async acceptInvitation(
    client: DriveApiClient,
    unlocked: UnlockedKeys,
    invitationId: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planInvitationAccept(invitationId);
    if (dryRun) return plan;

    const details = await client.getInvitation(invitationId);
    const inviteeKeys = unlocked.addresses
      .filter((a) => a.Email.toLowerCase() === details.inviteeEmail.toLowerCase())
      .flatMap((a) => unlocked.addressKeys.get(a.ID) ?? []);

    const keys =
      inviteeKeys.length > 0
        ? inviteeKeys
        : primaryAddress(unlocked).keys;

    const crypto = await getDriveCrypto();
    const sessionKey = await crypto.decryptSessionKey({
      binaryMessage: base64ToBytes(details.keyPacket),
      decryptionKeys: keys,
    });

    const signature = await signAcceptSessionKey(sessionKey.data, keys);
    await client.acceptInvitation(invitationId, signature);
  }

  planInvitationReject(invitationId: string): DryRunAction {
    return { action: "invitations.reject", detail: { invitationId } };
  }

  async rejectInvitation(
    client: DriveApiClient,
    invitationId: string,
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planInvitationReject(invitationId);
    if (dryRun) return plan;
    await client.rejectInvitation(invitationId);
  }

  planPhotosList(): DryRunAction {
    return { action: "photos.list", detail: {} };
  }

  async listPhotos(
    client: DriveApiClient,
    photosContext: PhotosContext,
    dryRun = false,
  ): Promise<DryRunAction | DrivePhoto[]> {
    const plan = this.planPhotosList();
    if (dryRun) return plan;

    const out: DrivePhoto[] = [];
    let cursor = "";
    for (;;) {
      const page = await client.listPhotos(photosContext.volumeId, {
        previousPageLastLinkId: cursor || undefined,
      });
      for (const photo of page) {
        out.push({
          linkId: photo.linkId,
          captureTime: photo.captureTime,
          hash: photo.hash,
          contentHash: photo.contentHash,
        });
      }
      if (page.length < 500) break;
      cursor = page[page.length - 1]?.linkId ?? "";
      if (!cursor) break;
    }
    return out;
  }

  planPhotoUpload(fileName: string): DryRunAction {
    return { action: "photos.upload", detail: { name: fileName } };
  }

  async uploadPhoto(
    client: DriveApiClient,
    photosContext: PhotosContext,
    fileName: string,
    bytes: Uint8Array,
    _captureTime: number,
    dryRun = false,
  ): Promise<DryRunAction | { linkId: string; revisionId: string }> {
    const plan = this.planPhotoUpload(fileName);
    if (dryRun) return plan;

    // Photos captureTime/tags protocol is not wired; upload as a file with MIME only.
    return this.upload(client, photosContext, "/", fileName, bytes, {
      mimeType: guessMimeType(fileName),
      dryRun: false,
      sizeHint: bytes.length,
    }) as Promise<{ linkId: string; revisionId: string }>;
  }

  planPhotoDownload(linkId: string): DryRunAction {
    return { action: "photos.download", detail: { linkId } };
  }

  async downloadPhoto(
    client: DriveApiClient,
    photosContext: PhotosContext,
    linkId: string,
    dryRun = false,
  ): Promise<DryRunAction | Uint8Array> {
    const plan = this.planPhotoDownload(linkId);
    if (dryRun) return plan;

    const link = await client.getLink(photosContext.shareId, linkId);
    const rootLink = await client.getLink(
      photosContext.shareId,
      photosContext.rootLinkId,
    );
    const rootKeys = await unlockNodeKey(rootLink, photosContext.shareKeys);
    const nodeKeys = await unlockNodeKey(link, rootKeys);

    if (!link.FileProperties?.ContentKeyPacket) {
      throw new Error("Photo has no content key packet.");
    }

    return this.downloadVerifiedFile(
      client,
      photosContext.shareId,
      linkId,
      link,
      nodeKeys,
      photosContext.addressKeys,
    );
  }

  planPhotosTrash(linkIds: string[]): DryRunAction {
    return { action: "photos.trash", detail: { linkIds } };
  }

  async trashPhotos(
    client: DriveApiClient,
    photosContext: PhotosContext,
    linkIds: string[],
    dryRun = false,
  ): Promise<DryRunAction | void> {
    const plan = this.planPhotosTrash(linkIds);
    if (dryRun) return plan;
    await client.trashLinks(photosContext.volumeId, linkIds);
  }

  planAlbumsList(): DryRunAction {
    return { action: "photos.albums.list", detail: {} };
  }

  async listAlbums(
    client: DriveApiClient,
    photosContext: PhotosContext,
    dryRun = false,
  ): Promise<DryRunAction | DriveAlbum[]> {
    const plan = this.planAlbumsList();
    if (dryRun) return plan;

    const rootLink = await client.getLink(
      photosContext.shareId,
      photosContext.rootLinkId,
    );
    const rootKeys = await unlockNodeKey(rootLink, photosContext.shareKeys);
    const albums = await client.listAlbums(photosContext.volumeId);
    const out: DriveAlbum[] = [];

    for (const album of albums) {
      let name = "";
      try {
        const link = await client.getLink(photosContext.shareId, album.linkId);
        name = await decryptName(link.Name, rootKeys);
      } catch {
        name = "(decrypt failed)";
      }
      out.push({
        linkId: album.linkId,
        name,
        photoCount: album.photoCount,
      });
    }
    return out;
  }
}

function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}

