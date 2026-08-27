/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { z } from "zod";

import {
    MSC2654_DISCOVERY_SOURCES_EVENT_TYPE,
    MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE,
    type DiscoveryIndex,
    type DiscoveryIndexEntry,
    type DiscoverySource,
} from "./types.ts";

export class DiscoverySourceError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "DiscoverySourceError";
    }
}

const sourceSchema = z.object({
    id: z.string().min(1),
    url: z.string().url(),
    displayName: z.string().optional(),
});

const indexEntrySchema = z.object({
    id: z.string().min(1),
    url: z.string().url(),
    display_name: z.string().optional(),
    avatar_url: z.string().optional(),
    attribution: z.string().optional(),
});
const indexSchema = z.union([
    z.object({ packs: z.array(indexEntrySchema) }),
    z.array(indexEntrySchema),
]);

interface RawDiscoveryIndexEntry {
    id: string;
    url: string;
    display_name?: string;
    avatar_url?: string;
    attribution?: string;
}

export interface AccountDataLike {
    getContent(): unknown;
}

export interface AccountDataWriter {
    getAccountData(eventType: string): AccountDataLike | null | undefined;
    setAccountData(eventType: string, content: unknown): Promise<unknown>;
}

function deriveDisplayName(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.host;
    } catch {
        return url;
    }
}

function normaliseSource(source: DiscoverySource): DiscoverySource {
    return { id: source.id, url: source.url, displayName: source.displayName ?? deriveDisplayName(source.url) };
}

function readSources(writer: AccountDataWriter, eventType: string): DiscoverySource[] {
    const event = writer.getAccountData(eventType);
    const content = event?.getContent();
    if (!content || typeof content !== "object") return [];
    const record = content as Record<string, unknown>;
    const list = Array.isArray(record.sources) ? record.sources : Array.isArray(content) ? content : [];
    const out: DiscoverySource[] = [];
    for (const entry of list) {
        const parsed = sourceSchema.safeParse(entry);
        if (!parsed.success) continue;
        out.push(normaliseSource(parsed.data));
    }
    return out;
}

async function writeSources(
    writer: AccountDataWriter,
    eventType: string,
    sources: DiscoverySource[],
): Promise<void> {
    await writer.setAccountData(eventType, { sources: sources.map(normaliseSource) });
}

/**
 * Read the user's configured MSC2654 discovery sources. Reads the stable
 * event type first, then falls back to the unstable prefix so older clients
 * that predate the merged spec continue to work.
 */
export function readDiscoverySources(writer: AccountDataWriter): DiscoverySource[] {
    const stable = readSources(writer, MSC2654_DISCOVERY_SOURCES_EVENT_TYPE);
    if (stable.length > 0) return stable;
    return readSources(writer, MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE);
}

export async function addDiscoverySource(
    writer: AccountDataWriter,
    source: DiscoverySource,
): Promise<DiscoverySource[]> {
    if (!source.id.trim() || !source.url.trim()) {
        throw new DiscoverySourceError("Discovery source requires both id and url.");
    }
    const stable = readSources(writer, MSC2654_DISCOVERY_SOURCES_EVENT_TYPE);
    const unstable = readSources(writer, MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE);
    const next = stable.filter((s) => s.id !== source.id).concat(normaliseSource(source));
    await writeSources(writer, MSC2654_DISCOVERY_SOURCES_EVENT_TYPE, next);
    if (unstable.length > 0) {
        const nextUnstable = unstable.filter((s) => s.id !== source.id).concat(normaliseSource(source));
        await writeSources(writer, MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE, nextUnstable);
    }
    return readDiscoverySources(writer);
}

export async function removeDiscoverySource(
    writer: AccountDataWriter,
    sourceId: string,
): Promise<DiscoverySource[]> {
    const stable = readSources(writer, MSC2654_DISCOVERY_SOURCES_EVENT_TYPE);
    const unstable = readSources(writer, MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE);
    await writeSources(
        writer,
        MSC2654_DISCOVERY_SOURCES_EVENT_TYPE,
        stable.filter((s) => s.id !== sourceId),
    );
    if (unstable.length > 0) {
        await writeSources(
            writer,
            MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE,
            unstable.filter((s) => s.id !== sourceId),
        );
    }
    return readDiscoverySources(writer);
}

export interface DiscoveryFetcher {
    fetchJson(url: string, init?: RequestInit): Promise<unknown>;
}

const defaultFetcher: DiscoveryFetcher = {
    async fetchJson(url, init) {
        const res = await fetch(url, init);
        if (!res.ok) throw new DiscoverySourceError(`HTTP ${res.status} fetching ${url}.`);
        return res.json();
    },
};

function parseIndex(sourceUrl: string, raw: unknown): DiscoveryIndex {
    const parsed = indexSchema.safeParse(raw);
    if (!parsed.success) {
        throw new DiscoverySourceError("Discovery index did not match the expected shape.");
    }
    const rawEntries: RawDiscoveryIndexEntry[] = Array.isArray(parsed.data) ? parsed.data : parsed.data.packs;
    return {
        sourceUrl,
        packs: rawEntries.map((entry): DiscoveryIndexEntry => {
            const out: DiscoveryIndexEntry = { id: entry.id, url: entry.url };
            if (entry.display_name) out.displayName = entry.display_name;
            if (entry.avatar_url) out.avatarUrl = entry.avatar_url;
            if (entry.attribution) out.attribution = entry.attribution;
            return out;
        }),
    };
}

/**
 * Fetch a discovery index from a configured source URL. The fetcher is
 * injectable so tests can avoid the network and so host apps can route
 * requests through a proxy.
 */
export async function resolveDiscoverySource(
    source: DiscoverySource,
    fetcher: DiscoveryFetcher = defaultFetcher,
): Promise<DiscoveryIndex> {
    const raw = await fetcher.fetchJson(source.url);
    return parseIndex(source.url, raw);
}

/**
 * Fetch a single pack JSON from a discovery index entry. The returned
 * `unknown` value is the on-the-wire MSC2545 `images`/`pack` layout and
 * should be passed through {@link parsePackJson} before installation.
 */
export async function fetchDiscoveryPack(
    entry: DiscoveryIndexEntry,
    fetcher: DiscoveryFetcher = defaultFetcher,
): Promise<unknown> {
    return fetcher.fetchJson(entry.url);
}
