/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useState } from "react";

import type { UseImagePacksResult } from "./useImagePacks.ts";
import {
    fetchDiscoveryPack,
    mergeDiscoveryPackMetadata,
    resolveDiscoverySource,
    type DiscoveryFetcher,
} from "./discovery.ts";
import type { DiscoveryIndex, DiscoveryIndexEntry, DiscoverySource } from "./types.ts";

interface DiscoveryPanelProps {
    api: UseImagePacksResult;
    /** Fetcher override; defaults to the browser's `fetch`. */
    fetcher?: DiscoveryFetcher;
    /** Default room id to install discovered packs into. */
    installRoomId: string;
}

interface BrowsedSource {
    source: DiscoverySource;
    index: DiscoveryIndex;
}

export function DiscoveryPanel(props: DiscoveryPanelProps): React.ReactElement {
    const { api, fetcher, installRoomId } = props;
    const [browsing, setBrowsing] = useState<BrowsedSource | null>(null);
    const [browseError, setBrowseError] = useState<string | null>(null);
    const [installError, setInstallError] = useState<string | null>(null);
    const defaultFetcher: DiscoveryFetcher = fetcher ?? {
        async fetchJson(url) {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        },
    };

    return (
        <div data-testid="image-packs-discovery" className="mx_ImagePacksDiscovery">
            {browseError ? <div role="alert">{browseError}</div> : null}
            {installError ? <div role="alert">{installError}</div> : null}
            <ul>
                {api.sources.map((source) => (
                    <li key={source.id} data-testid={`source-${source.id}`}>
                        <span>{source.displayName ?? source.url}</span>
                        <button
                            type="button"
                            onClick={async () => {
                                setBrowseError(null);
                                try {
                                    const index = await resolveDiscoverySource(source, defaultFetcher);
                                    setBrowsing({ source, index });
                                } catch (e) {
                                    setBrowseError(e instanceof Error ? e.message : String(e));
                                }
                            }}
                        >
                            Browse
                        </button>
                        <button type="button" onClick={() => api.removeSource(source.id)}>
                            Remove
                        </button>
                    </li>
                ))}
            </ul>
            <NewSourceForm api={api} />
            {browsing ? (
                <BrowseResult
                    api={api}
                    browsed={browsing}
                    fetcher={defaultFetcher}
                    installRoomId={installRoomId}
                    onError={setInstallError}
                    onClose={() => setBrowsing(null)}
                />
            ) : null}
        </div>
    );
}

function NewSourceForm(props: { api: UseImagePacksResult }): React.ReactElement {
    const { api } = props;
    const [draft, setDraft] = useState<DiscoverySource>({ id: "", url: "" });
    return (
        <div data-testid="new-source-form">
            <input
                aria-label="Source ID"
                placeholder="my-source"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            />
            <input
                aria-label="Source URL"
                placeholder="https://example.com/packs/index.json"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            />
            <button
                type="button"
                onClick={async () => {
                    if (!draft.id.trim() || !draft.url.trim()) return;
                    await api.addSource(draft);
                    setDraft({ id: "", url: "" });
                }}
            >
                Add source
            </button>
        </div>
    );
}

function BrowseResult(props: {
    api: UseImagePacksResult;
    browsed: BrowsedSource;
    fetcher: DiscoveryFetcher;
    installRoomId: string;
    onError: (msg: string) => void;
    onClose: () => void;
}): React.ReactElement {
    const { api, browsed, fetcher, installRoomId, onError, onClose } = props;
    return (
        <div data-testid="discovery-browse" className="mx_ImagePacksDiscovery_browse">
            <h4>{browsed.source.displayName ?? browsed.source.url}</h4>
            <ul>
                {browsed.index.packs.map((entry) => (
                    <BrowseItem
                        key={entry.id}
                        api={api}
                        entry={entry}
                        fetcher={fetcher}
                        installRoomId={installRoomId}
                        onError={onError}
                    />
                ))}
            </ul>
            <button type="button" onClick={onClose}>
                Close
            </button>
        </div>
    );
}

function BrowseItem(props: {
    api: UseImagePacksResult;
    entry: DiscoveryIndexEntry;
    fetcher: DiscoveryFetcher;
    installRoomId: string;
    onError: (msg: string) => void;
}): React.ReactElement {
    const { api, entry, fetcher, installRoomId, onError } = props;
    return (
        <li data-testid={`discovery-entry-${entry.id}`}>
            <span>{entry.displayName ?? entry.id}</span>
            <button
                type="button"
                onClick={async () => {
                    try {
                        const pack = await fetchDiscoveryPack(entry, fetcher);
                        await api.importPack(
                            mergeDiscoveryPackMetadata(pack, entry),
                            installRoomId,
                            entry.id,
                            entry.displayName,
                        );
                    } catch (e) {
                        onError(e instanceof Error ? e.message : String(e));
                    }
                }}
            >
                Install
            </button>
        </li>
    );
}
