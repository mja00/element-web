/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { parsePackJson } from "./import-export.ts";
import {
    addDiscoverySource,
    readDiscoverySources,
    removeDiscoverySource,
    type AccountDataWriter,
} from "./discovery.ts";
import type { DiscoverySource, EmoteDefinition, ImagePackDefinition } from "./types.ts";

/**
 * Image pack writer contract. The host application supplies a concrete
 * implementation that delegates to the writer helpers in
 * `apps/web/src/custom-emotes.ts`. The module is intentionally kept free of
 * any direct import from the host so it can be tree-shaken and unit-tested
 * in isolation.
 */
export interface PackWriters {
    createRoomImagePack(
        roomId: string,
        stateKey: string,
        draft: RoomPackDraft,
    ): Promise<void>;
    updateRoomImagePackMetadata(
        roomId: string,
        stateKey: string,
        draft: RoomPackDraft,
    ): Promise<void>;
    deleteRoomImagePack(roomId: string, stateKey: string): Promise<void>;
    upsertRoomPackEmote(
        roomId: string,
        stateKey: string,
        emote: EmoteDefinition,
    ): Promise<void>;
    removeRoomPackEmote(
        roomId: string,
        stateKey: string,
        shortcode: string,
    ): Promise<void>;
    reorderRoomImagePacks(roomId: string, orderedStateKeys: string[]): Promise<void>;
    redactRoomImagePack(roomId: string, eventId: string): Promise<void>;
    getRoomImagePackOrder(roomId: string): { stateKeys: string[] } | null;
    upsertUserImagePack(pack: ImagePackDefinition): Promise<void>;
    upsertUserPackEmote(emote: EmoteDefinition): Promise<void>;
    removeUserPackEmote(shortcode: string): Promise<void>;
    enableGlobalPack(reference: { roomId: string; stateKey: string }): Promise<void>;
    disableGlobalPack(reference: { roomId: string; stateKey: string }): Promise<void>;
}


export interface PackStoreClient {
    getUserId(): string | null;
    getAccountData(eventType: string): { getContent(): unknown } | null | undefined;
    setAccountData(eventType: string, content: unknown): Promise<unknown>;
}

export interface RoomPackDraft {
    displayName?: string;
    avatarUrl?: string;
    attribution?: string;
    usage?: string[];
    images?: Record<string, EmoteDefinition>;
}

export interface CreateRoomPackInput {
    roomId: string;
    stateKey: string;
    displayName: string;
    avatarUrl?: string;
    attribution?: string;
    images?: Record<string, EmoteDefinition>;
}

export function toDraft(input: CreateRoomPackInput): RoomPackDraft {
    const draft: RoomPackDraft = { displayName: input.displayName };
    if (input.avatarUrl !== undefined) draft.avatarUrl = input.avatarUrl;
    if (input.attribution !== undefined) draft.attribution = input.attribution;
    if (input.images !== undefined) draft.images = input.images;
    return draft;
}

export function packJsonToRoomInput(
    roomId: string,
    stateKey: string,
    pack: ImagePackDefinition,
): CreateRoomPackInput {
    const out: CreateRoomPackInput = {
        roomId,
        stateKey,
        displayName: pack.displayName,
        images: pack.images,
    };
    if (pack.avatarUrl) out.avatarUrl = pack.avatarUrl;
    if (pack.attribution) out.attribution = pack.attribution;
    return out;
}

export async function createRoomPack(
    writers: PackWriters,
    input: CreateRoomPackInput,
): Promise<void> {
    await writers.createRoomImagePack(input.roomId, input.stateKey, toDraft(input));
}

export async function renameRoomPack(
    writers: PackWriters,
    roomId: string,
    stateKey: string,
    changes: { displayName?: string; avatarUrl?: string; attribution?: string },
): Promise<void> {
    const draft: RoomPackDraft = {};
    if (changes.displayName !== undefined) draft.displayName = changes.displayName;
    if (changes.avatarUrl !== undefined) draft.avatarUrl = changes.avatarUrl;
    if (changes.attribution !== undefined) draft.attribution = changes.attribution;
    await writers.updateRoomImagePackMetadata(roomId, stateKey, draft);
}

export async function deleteRoomPack(
    writers: PackWriters,
    roomId: string,
    stateKey: string,
): Promise<void> {
    await writers.deleteRoomImagePack(roomId, stateKey);
}

export async function addRoomEmote(
    writers: PackWriters,
    roomId: string,
    stateKey: string,
    emote: EmoteDefinition,
): Promise<void> {
    await writers.upsertRoomPackEmote(roomId, stateKey, emote);
}

export async function editRoomEmote(
    writers: PackWriters,
    roomId: string,
    stateKey: string,
    emote: EmoteDefinition,
): Promise<void> {
    await writers.upsertRoomPackEmote(roomId, stateKey, emote);
}

export async function removeRoomEmote(
    writers: PackWriters,
    roomId: string,
    stateKey: string,
    shortcode: string,
): Promise<void> {
    await writers.removeRoomPackEmote(roomId, stateKey, shortcode);
}

export async function reorderRoomPacks(
    writers: PackWriters,
    roomId: string,
    orderedStateKeys: string[],
): Promise<void> {
    await writers.reorderRoomImagePacks(roomId, orderedStateKeys);
}

export async function redactRoomPack(
    writers: PackWriters,
    roomId: string,
    eventId: string,
): Promise<void> {
    await writers.redactRoomImagePack(roomId, eventId);
}

export function getRoomPackOrder(
    writers: PackWriters,
    roomId: string,
): { stateKeys: string[] } | null {
    return writers.getRoomImagePackOrder(roomId);
}
export async function enablePackGlobally(
    writers: PackWriters,
    reference: { roomId: string; stateKey: string },
): Promise<void> {
    await writers.enableGlobalPack(reference);
}

export async function disablePackGlobally(
    writers: PackWriters,
    reference: { roomId: string; stateKey: string },
): Promise<void> {
    await writers.disableGlobalPack(reference);
}

export async function addUserEmote(
    writers: PackWriters,
    emote: EmoteDefinition,
): Promise<void> {
    await writers.upsertUserPackEmote(emote);
}

export async function editUserEmote(
    writers: PackWriters,
    emote: EmoteDefinition,
): Promise<void> {
    await writers.upsertUserPackEmote(emote);
}

export async function removeUserEmote(
    writers: PackWriters,
    shortcode: string,
): Promise<void> {
    await writers.removeUserPackEmote(shortcode);
}

export async function setUserPack(
    writers: PackWriters,
    pack: ImagePackDefinition,
): Promise<void> {
    await writers.upsertUserImagePack(pack);
}

function asAccountDataWriter(client: PackStoreClient): AccountDataWriter {
    return {
        getAccountData: (eventType) => client.getAccountData(eventType),
        setAccountData: (eventType, content) => client.setAccountData(eventType, content),
    };
}

export function listDiscoverySources(client: PackStoreClient): DiscoverySource[] {
    return readDiscoverySources(asAccountDataWriter(client));
}

export async function addSource(
    client: PackStoreClient,
    source: DiscoverySource,
): Promise<DiscoverySource[]> {
    return addDiscoverySource(asAccountDataWriter(client), source);
}

export async function removeSource(
    client: PackStoreClient,
    sourceId: string,
): Promise<DiscoverySource[]> {
    return removeDiscoverySource(asAccountDataWriter(client), sourceId);
}

export async function installPackToRoom(
    writers: PackWriters,
    roomId: string,
    stateKey: string,
    payload: unknown,
): Promise<void> {
    const pack = parsePackJson(payload);
    await createRoomPack(writers, packJsonToRoomInput(roomId, stateKey, pack));
}
