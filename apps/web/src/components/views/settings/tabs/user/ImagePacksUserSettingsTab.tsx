/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { type JSX, useEffect, useState } from "react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { _t } from "../../../../../languageHandler";
import { getUserImagePack, removeUserPackEmote, subscribeToImagePackChanges } from "../../../../../custom-emotes";
import { mediaFromMxc } from "../../../../../customisations/Media";
import SettingsTab from "../SettingsTab";
import { SettingsSection } from "../../shared/SettingsSection";

export default function ImagePacksUserSettingsTab({ client }: { client: MatrixClient }): JSX.Element {
    const [, refresh] = useState(0);
    const pack = getUserImagePack(client);

    useEffect(() => subscribeToImagePackChanges(client, () => refresh((value) => value + 1)), [client]);

    return (
        <SettingsTab data-testid="mx_ImagePacksUserSettingsTab">
            <SettingsSection heading={_t("common|custom_emotes")}>
                {pack && Object.keys(pack.content.images).length > 0 ? (
                    <div className="mx_ImagePacksUserSettingsTab_list">
                        {Object.entries(pack.content.images).map(([shortcode, image]) => {
                            const imageUrl = mediaFromMxc(image.url, client).getThumbnailOfSourceHttp(48, 48, "scale");
                            return (
                                <div className="mx_ImagePacksUserSettingsTab_item" key={shortcode}>
                                    {imageUrl ? <img src={imageUrl} alt={image.body || shortcode} /> : null}
                                    <span>{shortcode}</span>
                                    <button
                                        type="button"
                                        onClick={() => void removeUserPackEmote(client, shortcode)}
                                        aria-label={`${_t("action|remove")} ${shortcode}`}
                                    >
                                        {_t("action|remove")}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p>{_t("common|no_results")}</p>
                )}
            </SettingsSection>
        </SettingsTab>
    );
}
