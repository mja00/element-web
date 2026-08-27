/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { useCallback, useEffect, useState } from "react";

import { exportPackJson } from "./import-export.ts";
import { resolveEnabledPacks, type ResolverClient, type ResolverRoom, type ResolvedPackSummary } from "./resolver.ts";
import {
    addRoomEmote,
    addSource,
    addUserEmote,
    createRoomPack,
    deleteRoomPack,
    disablePackGlobally,
    editRoomEmote,
    editUserEmote,
    enablePackGlobally,
    installPackToRoom,
    listDiscoverySources,
    removeRoomEmote,
    removeSource,
    removeUserEmote,
    renameRoomPack,
    reorderRoomPacks,
    setUserPack,
    type CreateRoomPackInput,
    type PackStoreClient,
    type PackWriters,
} from "./store.ts";
import type { DiscoverySource, EmoteDefinition, ImagePackDefinition } from "./types.ts";

export interface UseImagePacksOptions {
    client: PackStoreClient & ResolverClient;
    writers: PackWriters;
    /** Optional room context. When set, room-scoped packs are exposed too. */
    room?: ResolverRoom | null;
    /** Optional list of canonical space ancestors (most recent last). */
    spaceAncestors?: ResolverRoom[];
}

export interface ImagePackView {
    roomId: string;
    stateKey: string;
    scope: "user" | "room" | "space";
    displayName: string;
    pack: ImagePackDefinition;
}

export interface UseImagePacksResult {
    packs: ImagePackView[];
    sources: DiscoverySource[];
    loading: boolean;
    error: string | null;
    newEmote: EmoteDefinition;
    newPack: CreateRoomPackInput;
    newSource: DiscoverySource;
    setNewEmote: (emote: EmoteDefinition) => void;
    setNewPack: (pack: CreateRoomPackInput) => void;
    setNewSource: (source: DiscoverySource) => void;
    refresh: () => Promise<void>;
    createRoomPack: (input?: Partial<CreateRoomPackInput>) => Promise<void>;
    renameRoomPack: (roomId: string, stateKey: string, displayName: string) => Promise<void>;
    deleteRoomPack: (roomId: string, stateKey: string) => Promise<void>;
    enablePackGlobally: (roomId: string, stateKey: string) => Promise<void>;
    disablePackGlobally: (roomId: string, stateKey: string) => Promise<void>;
    reorderPacks: (orderedKeys: string[]) => Promise<void>;
    addRoomEmote: (roomId: string, stateKey: string, emote: EmoteDefinition) => Promise<void>;
    editRoomEmote: (roomId: string, stateKey: string, emote: EmoteDefinition) => Promise<void>;
    removeRoomEmote: (roomId: string, stateKey: string, shortcode: string) => Promise<void>;
    addUserEmote: (emote: EmoteDefinition) => Promise<void>;
    editUserEmote: (emote: EmoteDefinition) => Promise<void>;
    removeUserEmote: (shortcode: string) => Promise<void>;
    setUserPack: (pack: ImagePackDefinition) => Promise<void>;
    importPack: (payload: unknown, roomId: string, stateKey: string) => Promise<void>;
    addSource: (source: DiscoverySource) => Promise<DiscoverySource[]>;
    removeSource: (sourceId: string) => Promise<DiscoverySource[]>;
    exportPack: (pack: ImagePackDefinition) => string;
}

export function toView(summary: ResolvedPackSummary): ImagePackView {
    return {
        roomId: summary.roomId,
        stateKey: summary.stateKey,
        scope: summary.scope,
        displayName: summary.displayName,
        pack: summary.pack,
    };
}

const defaultEmote = (): EmoteDefinition => ({ shortcode: "", url: "" });
const defaultPack = (roomId: string): CreateRoomPackInput => ({
    roomId,
    stateKey: "",
    displayName: "",
    images: {},
});
const defaultSource = (): DiscoverySource => ({ id: "", url: "" });

const emptyRoom = (): ResolverRoom => ({
    roomId: "",
    currentState: { getStateEvents: () => [] },
});

export function useImagePacks(opts: UseImagePacksOptions): UseImagePacksResult {
    const { client, writers, room, spaceAncestors } = opts;
    const [packs, setPacks] = useState<ImagePackView[]>([]);
    const [sources, setSources] = useState<DiscoverySource[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newEmote, setNewEmote] = useState<EmoteDefinition>(defaultEmote());
    const [newPack, setNewPack] = useState<CreateRoomPackInput>(defaultPack(room?.roomId ?? ""));
    const [newSource, setNewSource] = useState<DiscoverySource>(defaultSource());

    const refresh = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const resolved = resolveEnabledPacks(client, room ?? emptyRoom(), spaceAncestors ?? []);
            setPacks(resolved.map(toView));
            setSources(listDiscoverySources(client));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [client, room, spaceAncestors]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const wrap = useCallback(
        async <T,>(fn: () => Promise<T>): Promise<T> => {
            try {
                setError(null);
                const result = await fn();
                await refresh();
                return result;
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                throw e;
            }
        },
        [refresh],
    );

    return {
        packs,
        sources,
        loading,
        error,
        newEmote,
        newPack,
        newSource,
        setNewEmote,
        setNewPack,
        setNewSource,
        refresh,
        createRoomPack: (input?: Partial<CreateRoomPackInput>): Promise<void> =>
            wrap(() =>
                createRoomPack(writers, {
                    roomId: input?.roomId ?? newPack.roomId,
                    stateKey: input?.stateKey ?? newPack.stateKey,
                    displayName: input?.displayName ?? newPack.displayName,
                    images: input?.images ?? newPack.images,
                }),
            ),
        renameRoomPack: (roomId: string, stateKey: string, displayName: string): Promise<void> =>
            wrap(() => renameRoomPack(writers, roomId, stateKey, { displayName })),
        deleteRoomPack: (roomId: string, stateKey: string): Promise<void> =>
            wrap(() => deleteRoomPack(writers, roomId, stateKey)),
        enablePackGlobally: (roomId: string, stateKey: string): Promise<void> =>
            wrap(() => enablePackGlobally(writers, { roomId, stateKey })),
        disablePackGlobally: (roomId: string, stateKey: string): Promise<void> =>
            wrap(() => disablePackGlobally(writers, { roomId, stateKey })),
        reorderPacks: (orderedKeys: string[]): Promise<void> =>
            wrap(async () => {
                if (!room) return;
                await reorderRoomPacks(writers, room.roomId, orderedKeys);
            }),
        addRoomEmote: (roomId: string, stateKey: string, emote: EmoteDefinition): Promise<void> =>
            wrap(() => addRoomEmote(writers, roomId, stateKey, emote)),
        editRoomEmote: (roomId: string, stateKey: string, emote: EmoteDefinition): Promise<void> =>
            wrap(() => editRoomEmote(writers, roomId, stateKey, emote)),
        removeRoomEmote: (roomId: string, stateKey: string, shortcode: string): Promise<void> =>
            wrap(() => removeRoomEmote(writers, roomId, stateKey, shortcode)),
        addUserEmote: (emote: EmoteDefinition): Promise<void> => wrap(() => addUserEmote(writers, emote)),
        editUserEmote: (emote: EmoteDefinition): Promise<void> => wrap(() => editUserEmote(writers, emote)),
        removeUserEmote: (shortcode: string): Promise<void> => wrap(() => removeUserEmote(writers, shortcode)),
        setUserPack: (pack: ImagePackDefinition): Promise<void> => wrap(() => setUserPack(writers, pack)),
        importPack: (payload: unknown, roomId: string, stateKey: string): Promise<void> =>
            wrap(() => installPackToRoom(writers, roomId, stateKey, payload)),
        addSource: (source: DiscoverySource): Promise<DiscoverySource[]> => wrap(() => addSource(client, source)),
        removeSource: (sourceId: string): Promise<DiscoverySource[]> => wrap(() => removeSource(client, sourceId)),
        exportPack: (pack: ImagePackDefinition): string => JSON.stringify(exportPackJson(pack), null, 2),
    };
}
