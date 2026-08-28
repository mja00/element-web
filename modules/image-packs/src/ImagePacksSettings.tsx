/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import { PackListPanel } from "./PackListPanel.tsx";
import { DiscoveryPanel } from "./DiscoveryPanel.tsx";
import type { UseImagePacksResult } from "./useImagePacks.ts";

export interface ImagePacksSettingsProps {
    api: UseImagePacksResult;
    /** When provided, only this room's packs are shown and discovery installs target it. */
    roomId?: string;
    /** Hide the personal/global tab. */
    hideUserSection?: boolean;
    /** Hide the discovery section (e.g. when surfacing inside room settings). */
    hideDiscovery?: boolean;
}

/**
 * Image packs tab/section body. Used both for the User Settings tab and the
 * Room Settings section — pass `roomId` for the latter.
 */
export function ImagePacksSettings(props: ImagePacksSettingsProps): React.ReactElement {
    const { api, roomId, hideUserSection, hideDiscovery } = props;
    const userPacks = api.packs.filter((pack) => pack.scope === "user");
    const roomPacks = roomId ? api.packs.filter((pack) => pack.roomId === roomId && pack.scope !== "user") : [];
    const totalEmotes = api.packs.reduce((count, pack) => count + Object.keys(pack.pack.images).length, 0);

    return (
        <div data-testid="image-packs-tab" className="mx_ImagePacksTab">
            <header className="mx_ImagePacksHero">
                <div className="mx_ImagePacksHero_orbit" aria-hidden="true" />
                <div className="mx_ImagePacksHero_copy">
                    <span className="mx_ImagePacksEyebrow">Emoji library</span>
                    <h2>Make every message yours</h2>
                    <p>
                        Keep your favourite packs close, tune each room, and discover new expressions without leaving
                        Element.
                    </p>
                </div>
                <div className="mx_ImagePacksHero_meta">
                    <div className="mx_ImagePacksHero_stats" aria-label="Image pack summary">
                        <span>
                            <strong>{api.packs.length}</strong>
                            <small>packs</small>
                        </span>
                        <span>
                            <strong>{totalEmotes}</strong>
                            <small>emotes</small>
                        </span>
                    </div>
                    <button
                        type="button"
                        className="mx_ImagePacksButton mx_ImagePacksButton_secondary"
                        onClick={() => void api.refresh()}
                        disabled={api.loading}
                    >
                        {api.loading ? "Refreshing…" : "Refresh library"}
                    </button>
                </div>
            </header>
            {!hideUserSection ? (
                <section className="mx_ImagePacksSection" aria-labelledby="image-packs-account-heading">
                    <div className="mx_ImagePacksSection_heading">
                        <div>
                            <span className="mx_ImagePacksEyebrow">Account library</span>
                            <h3 id="image-packs-account-heading">Personal &amp; global packs</h3>
                            <p>Only you can edit personal packs. Global packs follow you into every room.</p>
                        </div>
                        <span className="mx_ImagePacksCount">
                            {userPacks.length} {userPacks.length === 1 ? "pack" : "packs"}
                        </span>
                    </div>
                    <PackListPanel api={api} showGlobalToggle onlyUserScope allowCreateUserPack />
                </section>
            ) : null}
            {roomId ? (
                <section className="mx_ImagePacksSection" aria-labelledby="image-packs-room-heading">
                    <div className="mx_ImagePacksSection_heading">
                        <div>
                            <span className="mx_ImagePacksEyebrow">This room</span>
                            <h3 id="image-packs-room-heading">Room packs</h3>
                            <p>Shape the shared emoji shelf for everyone in this conversation.</p>
                        </div>
                        <span className="mx_ImagePacksCount">
                            {roomPacks.length} {roomPacks.length === 1 ? "pack" : "packs"}
                        </span>
                    </div>
                    <PackListPanel api={api} restrictToRoomId={roomId} hideUserScope allowCreateRoomPack />
                </section>
            ) : null}
            {hideDiscovery || !roomId ? null : (
                <section className="mx_ImagePacksSection" aria-labelledby="image-packs-discovery-heading">
                    <div className="mx_ImagePacksSection_heading">
                        <div>
                            <span className="mx_ImagePacksEyebrow">Find something new</span>
                            <h3 id="image-packs-discovery-heading">Image-pack discovery sources</h3>
                            <p>Save trusted directories and browse their packs when you want a fresh look.</p>
                        </div>
                        <span className="mx_ImagePacksCount">
                            {api.sources.length} {api.sources.length === 1 ? "source" : "sources"}
                        </span>
                    </div>
                    <DiscoveryPanel api={api} installRoomId={roomId} />
                </section>
            )}
        </div>
    );
}
