/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    IMAGE_PACK_EVENT_TYPE,
    IMAGE_PACK_ROOMS_EVENT_TYPE,
    LEGACY_IMAGE_PACK_EVENT_TYPE,
    LEGACY_IMAGE_PACK_ROOMS_EVENT_TYPE,
    LEGACY_USER_IMAGE_PACK_EVENT_TYPE,
} from "./types.ts";
import type { DiscoverySource, ImagePackDefinition, ImagePackScope } from "./types.ts";
export {
    IMAGE_PACK_EVENT_TYPE,
    IMAGE_PACK_ROOMS_EVENT_TYPE,
    LEGACY_IMAGE_PACK_EVENT_TYPE,
    LEGACY_IMAGE_PACK_ROOMS_EVENT_TYPE,
    LEGACY_USER_IMAGE_PACK_EVENT_TYPE,
};
export interface ResolverClient {
    getUserId(): string | null;
    getRoom(roomId: string): ResolverRoom | null;
    getAccountData(eventType: string): { getContent(): unknown } | null;
}

export interface ResolverRoom {
    roomId: string;
    name?: string;
    currentState: {
        getStateEvents(eventType: string, stateKey?: string): unknown;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ResolvedPackSummary {
    roomId: string;
    stateKey: string;
    scope: ImagePackScope;
    displayName: string;
    pack: ImagePackDefinition;
}

function readPackEvent(room: ResolverRoom, stateKey: string): ResolvedPackSummary | null {
    const stable = room.currentState.getStateEvents(IMAGE_PACK_EVENT_TYPE, stateKey) as
        | { getContent(): unknown }
        | null
        | undefined;
    const legacy = room.currentState.getStateEvents(LEGACY_IMAGE_PACK_EVENT_TYPE, stateKey) as
        | { getContent(): unknown }
        | null
        | undefined;
    const event = stable ?? legacy;
    if (!event) return null;
    const content = event.getContent();
    if (!isRecord(content)) return null;
    const images = isRecord(content.images) ? content.images : {};
    const packMeta = isRecord(content.pack) ? content.pack : {};
    const def: ImagePackDefinition = {
        displayName: typeof packMeta.display_name === "string" ? packMeta.display_name : room.name ?? "",
        images: Object.fromEntries(
            Object.entries(images).map(([k, v]) => {
                if (!isRecord(v) || typeof v.url !== "string") return [k, { shortcode: k, url: "" }];
                const image: ImagePackDefinition["images"][string] = { shortcode: k, url: v.url };
                if (typeof v.body === "string") image.body = v.body;
                if (isRecord(v.info)) image.info = v.info as Record<string, unknown>;
                return [k, image];
            }),
        ),
    };
    if (typeof packMeta.avatar_url === "string") def.avatarUrl = packMeta.avatar_url;
    if (typeof packMeta.attribution === "string") def.attribution = packMeta.attribution;
    if (Array.isArray(packMeta.usage)) {
        def.usage = packMeta.usage.filter((v): v is string => typeof v === "string");
    }
    return {
        roomId: room.roomId,
        stateKey,
        scope: "room",
        displayName: def.displayName,
        pack: def,
    };
}

/**
 * Resolve the list of packs enabled for a user in a deterministic order that
 * matches the spec's recommended priority:
 *   1. user / global packs (from `m.image_pack.rooms` and the legacy keys),
 *   2. room packs (from `m.room.image_pack`),
 *   3. space packs (caller passes the resolved ancestors).
 */
export function resolveEnabledPacks(
    client: ResolverClient,
    room: ResolverRoom,
    spaceAncestors: ResolverRoom[] = [],
): ResolvedPackSummary[] {
    const out: ResolvedPackSummary[] = [];
    const seen = new Set<string>();

    // 1. User / global references
    for (const eventType of [IMAGE_PACK_ROOMS_EVENT_TYPE, LEGACY_IMAGE_PACK_ROOMS_EVENT_TYPE]) {
        const event = client.getAccountData(eventType);
        const content = event?.getContent();
        if (!isRecord(content) || !isRecord(content.rooms)) continue;
        for (const [globalRoomId, packs] of Object.entries(content.rooms)) {
            if (!isRecord(packs)) continue;
            for (const stateKey of Object.keys(packs)) {
                const referenced = client.getRoom(globalRoomId);
                if (!referenced) continue;
                const summary = readPackEvent(referenced, stateKey);
                if (!summary) continue;
                const key = `${summary.roomId}\u0000${summary.stateKey}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ ...summary, scope: "user" });
            }
        }
    }

    // 1b. Personal account-data pack (legacy)
    const personal = client.getAccountData(LEGACY_USER_IMAGE_PACK_EVENT_TYPE);
    if (personal) {
        const content = personal.getContent();
        if (isRecord(content) && isRecord(content.images)) {
            const summary: ResolvedPackSummary = {
                roomId: client.getUserId() ?? "",
                stateKey: LEGACY_USER_IMAGE_PACK_EVENT_TYPE,
                scope: "user",
                displayName:
                    (isRecord(content.pack) && typeof content.pack.display_name === "string"
                        ? content.pack.display_name
                        : "Personal") ?? "Personal",
                pack: {
                    displayName: "Personal",
                    images: {},
                },
            };
            if (!seen.has(summary.stateKey)) {
                seen.add(summary.stateKey);
                out.push(summary);
            }
        }
    }

    // 2. Room packs (stable then legacy), sorted by the order marker if set.
    const roomPacks: ResolvedPackSummary[] = [];
    for (const eventType of [IMAGE_PACK_EVENT_TYPE, LEGACY_IMAGE_PACK_EVENT_TYPE]) {
        const events = room.currentState.getStateEvents(eventType);
        if (!Array.isArray(events)) continue;
        for (const event of events) {
            const candidate = event as { getStateKey?: () => string; getContent: () => unknown };
            const stateKey = candidate.getStateKey?.() ?? "";
            if (stateKey === "_order") continue;
            const summary = readPackEvent(room, stateKey);
            if (!summary) continue;
            const key = `${summary.roomId}\u0000${summary.stateKey}`;
            if (seen.has(key)) continue;
            seen.add(key);
            roomPacks.push({ ...summary, scope: "room" });
        }
    }
    const orderEvent = room.currentState.getStateEvents(IMAGE_PACK_EVENT_TYPE, "_order") as
        | { getContent(): unknown }
        | null
        | undefined;
    if (orderEvent) {
        const content = orderEvent.getContent();
        if (isRecord(content) && Array.isArray(content.stateKeys)) {
            const rank = new Map<string, number>();
            content.stateKeys.forEach((key, index) => {
                if (typeof key === "string") rank.set(key, index);
            });
            roomPacks.sort((a, b) => {
                const ra = rank.get(a.stateKey);
                const rb = rank.get(b.stateKey);
                if (ra === undefined && rb === undefined) return 0;
                if (ra === undefined) return 1;
                if (rb === undefined) return -1;
                return ra - rb;
            });
        }
    }
    for (const summary of roomPacks) {
        out.push(summary);
    }

    // 3. Space ancestor packs (caller passes the resolved ancestors).
    for (const ancestor of spaceAncestors) {
        for (const eventType of [IMAGE_PACK_EVENT_TYPE, LEGACY_IMAGE_PACK_EVENT_TYPE]) {
            const events = ancestor.currentState.getStateEvents(eventType);
            if (!Array.isArray(events)) continue;
            for (const event of events) {
                const candidate = event as { getStateKey?: () => string };
                const stateKey = candidate.getStateKey?.() ?? "";
                if (stateKey === "_order") continue;
                const summary = readPackEvent(ancestor, stateKey);
                if (!summary) continue;
                const key = `${summary.roomId}\u0000${summary.stateKey}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ ...summary, scope: "space" });
            }
        }
    }

    return out;
}

export function listEnabledSourceIds(client: ResolverClient): Set<string> {
    const out = new Set<string>();
    for (const eventType of [IMAGE_PACK_ROOMS_EVENT_TYPE, LEGACY_IMAGE_PACK_ROOMS_EVENT_TYPE]) {
        const event = client.getAccountData(eventType);
        const content = event?.getContent();
        if (!isRecord(content) || !isRecord(content.rooms)) continue;
        for (const packs of Object.values(content.rooms)) {
            if (!isRecord(packs)) continue;
            for (const stateKey of Object.keys(packs)) {
                out.add(stateKey);
            }
        }
    }
    return out;
}


export function discoverySourcesForResolver(
    sources: readonly DiscoverySource[],
): DiscoverySource[] {
    return [...sources].sort((a, b) => a.id.localeCompare(b.id));
}

