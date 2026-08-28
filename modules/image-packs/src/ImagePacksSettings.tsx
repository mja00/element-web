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
    return (
        <div data-testid="image-packs-tab" className="mx_ImagePacksTab">
            {!hideUserSection ? (
                <section>
                    <h3>Personal &amp; global packs</h3>
                    <PackListPanel api={api} showGlobalToggle onlyUserScope allowCreateUserPack />
                </section>
            ) : null}
            {roomId ? (
                <section>
                    <h3>Room packs</h3>
                    <PackListPanel api={api} restrictToRoomId={roomId} hideUserScope allowCreateRoomPack />
                </section>
            ) : null}
            {hideDiscovery || !roomId ? null : (
                <section>
                    <h3>Image-pack discovery sources</h3>
                    <DiscoveryPanel api={api} installRoomId={roomId} />
                </section>
            )}
        </div>
    );
}
