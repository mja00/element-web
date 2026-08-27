/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import {
    addDiscoverySource,
    fetchDiscoveryPack,
    readDiscoverySources,
    removeDiscoverySource,
    resolveDiscoverySource,
} from "./discovery.ts";
import {
    MSC2654_DISCOVERY_SOURCES_EVENT_TYPE,
    MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE,
} from "./types.ts";
import type { AccountDataWriter } from "./discovery.ts";

class FakeWriter implements AccountDataWriter {
    private store = new Map<string, Record<string, unknown>>();

    public getAccountData(eventType: string): { getContent(): Record<string, unknown> | undefined } {
        const content = this.store.get(eventType);
        return { getContent: () => content };
    }

    public async setAccountData(eventType: string, content: unknown): Promise<unknown> {
        this.store.set(eventType, content as Record<string, unknown>);
        return {};
    }

    public raw(eventType: string): Record<string, unknown> | undefined {
        return this.store.get(eventType);
    }
}

describe("MSC2654 discovery sources", () => {
    it("adds and reads a source from the stable event type", async () => {
        const writer = new FakeWriter();
        const list = await addDiscoverySource(writer, { id: "test", url: "https://example.org/index.json" });
        expect(list.map((s) => s.id)).toEqual(["test"]);
        expect(writer.raw(MSC2654_DISCOVERY_SOURCES_EVENT_TYPE)).toEqual({
            sources: [{ id: "test", url: "https://example.org/index.json", displayName: "example.org" }],
        });
        expect(readDiscoverySources(writer).map((s) => s.id)).toEqual(["test"]);
    });

    it("falls back to the unstable event type when the stable one is empty", async () => {
        const writer = new FakeWriter();
        await writer.setAccountData(MSC2654_DISCOVERY_SOURCES_UNSTABLE_EVENT_TYPE, {
            sources: [{ id: "u", url: "https://example.org/u.json" }],
        });
        expect(readDiscoverySources(writer).map((s) => s.id)).toEqual(["u"]);
    });

    it("removes a source by id", async () => {
        const writer = new FakeWriter();
        await addDiscoverySource(writer, { id: "a", url: "https://example.org/a.json" });
        await addDiscoverySource(writer, { id: "b", url: "https://example.org/b.json" });
        const after = await removeDiscoverySource(writer, "a");
        expect(after.map((s) => s.id)).toEqual(["b"]);
    });

    it("rejects sources missing id or url", async () => {
        const writer = new FakeWriter();
        await expect(addDiscoverySource(writer, { id: "", url: "https://e/" })).rejects.toThrow();
        await expect(addDiscoverySource(writer, { id: "x", url: "" })).rejects.toThrow();
    });

    it("parses a discovery index and fetches a single pack", async () => {
        const fetcher = {
            async fetchJson(url: string): Promise<unknown> {
                if (url.endsWith("index.json")) {
                    return {
                        packs: [
                            { id: "one", url: "https://example.org/one.json", display_name: "One" },
                            { id: "two", url: "https://example.org/two.json" },
                        ],
                    };
                }
                return { images: { hi: { url: "mxc://example.org/hi" } }, pack: { display_name: "hi" } };
            },
        };
        const source = { id: "src", url: "https://example.org/index.json" };
        const index = await resolveDiscoverySource(source, fetcher);
        expect(index.packs.map((p) => p.id)).toEqual(["one", "two"]);
        const pack = await fetchDiscoveryPack(index.packs[0], fetcher);
        expect(pack).toEqual({
            images: { hi: { url: "mxc://example.org/hi" } },
            pack: { display_name: "hi" },
        });
    });

    it("rejects malformed discovery indices", async () => {
        const fetcher = { async fetchJson(): Promise<unknown> { return { wrong: true }; } };
        await expect(resolveDiscoverySource({ id: "x", url: "https://e/" }, fetcher)).rejects.toThrow();
    });
});
