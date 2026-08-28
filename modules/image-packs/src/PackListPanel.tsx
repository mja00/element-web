/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useState } from "react";

import type { UseImagePacksResult } from "./useImagePacks.ts";
import type { EmoteDefinition, ImagePackDefinition, ImagePackView } from "./types.ts";

interface PackListPanelProps {
    api: UseImagePacksResult;
    /** When provided, only packs for this room id are listed. */
    restrictToRoomId?: string;
    /** Hide personal/user-scope rows. */
    hideUserScope?: boolean;
    /** Show controls for global enable/disable. */
    showGlobalToggle?: boolean;
    /** Limit the list to personal/global references. */
    onlyUserScope?: boolean;
    /** Show the room state-key creation form. */
    allowCreateRoomPack?: boolean;
    /** Show the personal account-data creation form. */
    allowCreateUserPack?: boolean;
}

function isValidShortcode(value: string): boolean {
    return /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function isValidStateKey(value: string): boolean {
    return isValidShortcode(value) && value !== "_order";
}

function isValidMxc(value: string): boolean {
    return /^mxc:\/\/[^\s/]+\/[^\s]+$/.test(value);
}

export function PackListPanel(props: PackListPanelProps): React.ReactElement {
    const {
        api,
        restrictToRoomId,
        hideUserScope,
        showGlobalToggle,
        onlyUserScope,
        allowCreateRoomPack,
        allowCreateUserPack,
    } = props;
    const visible = api.packs.filter((pack) => {
        if (hideUserScope && pack.scope === "user") return false;
        if (onlyUserScope && pack.scope !== "user") return false;
        if (restrictToRoomId && pack.roomId !== restrictToRoomId) return false;
        return true;
    });

    return (
        <div data-testid="image-packs-panel" className="mx_ImagePacksPanel">
            {api.error ? (
                <div className="mx_ImagePacksPanel_error" role="alert">
                    {api.error}
                </div>
            ) : null}
            {visible.length === 0 ? (
                <div className="mx_ImagePacksPanel_empty">No image packs yet.</div>
            ) : (
                visible.map((pack) => (
                    <PackCard
                        key={`${pack.roomId}/${pack.stateKey}`}
                        api={api}
                        pack={pack}
                        showGlobalToggle={showGlobalToggle}
                    />
                ))
            )}
            {allowCreateRoomPack ? <NewPackCard api={api} restrictToRoomId={restrictToRoomId} /> : null}
            {allowCreateUserPack ? <NewUserPackCard api={api} /> : null}
        </div>
    );
}

function PackCard(props: {
    api: UseImagePacksResult;
    pack: ImagePackView;
    showGlobalToggle?: boolean;
}): React.ReactElement {
    const { api, pack, showGlobalToggle } = props;
    const [editing, setEditing] = useState(false);
    const [newEmote, setNewEmote] = useState<EmoteDefinition>({ shortcode: "", url: "" });
    const [emoteError, setEmoteError] = useState<string | null>(null);

    const submitEmote = async (): Promise<void> => {
        setEmoteError(null);
        if (!isValidShortcode(newEmote.shortcode)) {
            setEmoteError("Shortcode must be 1-100 characters of letters, digits, hyphens, or underscores.");
            return;
        }
        if (!isValidMxc(newEmote.url)) {
            setEmoteError("Image URL must be an mxc:// URL.");
            return;
        }
        try {
            if (pack.kind === "personal") await api.addUserEmote(newEmote);
            else await api.addRoomEmote(pack.roomId, pack.stateKey, newEmote);
            setNewEmote({ shortcode: "", url: "" });
        } catch {
            // error already exposed via api.error
        }
    };

    return (
        <div
            className="mx_ImagePacksPanel_pack"
            data-testid={pack.kind === "personal" ? "pack-personal" : `pack-${pack.roomId}-${pack.stateKey}`}
        >
            <div className="mx_ImagePacksPanel_packHeader">
                {editing ? (
                    <PackRenameForm
                        initial={pack.displayName}
                        onSave={async (displayName) => {
                            if (pack.kind === "personal") {
                                await api.setUserPack({ ...pack.pack, displayName });
                            } else {
                                await api.renameRoomPack(pack.roomId, pack.stateKey, displayName);
                            }
                        }}
                        onDone={() => setEditing(false)}
                    />
                ) : (
                    <h4>
                        {pack.displayName} <small>({pack.kind})</small>
                    </h4>
                )}
                <div className="mx_ImagePacksPanel_packActions">
                    {!editing ? (
                        <button type="button" onClick={() => setEditing(true)}>
                            Rename
                        </button>
                    ) : null}
                    {showGlobalToggle && pack.kind !== "personal" ? (
                        <button
                            type="button"
                            onClick={() =>
                                pack.kind === "global"
                                    ? api.disablePackGlobally(pack.roomId, pack.stateKey)
                                    : api.enablePackGlobally(pack.roomId, pack.stateKey)
                            }
                        >
                            {pack.kind === "global" ? "Disable globally" : "Enable globally"}
                        </button>
                    ) : null}
                    {pack.kind === "personal" ? (
                        <button type="button" onClick={() => api.deleteUserPack()}>
                            Delete
                        </button>
                    ) : pack.kind === "room" ? (
                        <button
                            type="button"
                            onClick={() =>
                                pack.eventId
                                    ? api.redactRoomPack(pack.roomId, pack.eventId)
                                    : api.deleteRoomPack(pack.roomId, pack.stateKey)
                            }
                        >
                            Delete
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => downloadJson(api.exportPack(pack.pack), `${pack.stateKey}.json`)}
                    >
                        Export
                    </button>
                </div>
            </div>
            <EmoteGrid
                pack={pack.pack}
                onEdit={async (shortcode, body) => {
                    const image = pack.pack.images[shortcode];
                    if (!image) return;
                    if (pack.kind === "personal") await api.editUserEmote({ ...image, body });
                    else await api.editRoomEmote(pack.roomId, pack.stateKey, { ...image, body });
                }}
                onRemove={async (shortcode) => {
                    if (pack.kind === "personal") await api.removeUserEmote(shortcode);
                    else await api.removeRoomEmote(pack.roomId, pack.stateKey, shortcode);
                }}
            />
            <div className="mx_ImagePacksPanel_emoteForm">
                <input
                    aria-label="Shortcode"
                    placeholder="shortcode"
                    value={newEmote.shortcode}
                    onChange={(e) => setNewEmote({ ...newEmote, shortcode: e.target.value })}
                />
                <input
                    aria-label="Image URL"
                    placeholder="mxc://..."
                    value={newEmote.url}
                    onChange={(e) => setNewEmote({ ...newEmote, url: e.target.value })}
                />
                <input
                    aria-label="Body"
                    placeholder="alt text"
                    value={newEmote.body ?? ""}
                    onChange={(e) => setNewEmote({ ...newEmote, body: e.target.value })}
                />
                <button type="button" onClick={submitEmote}>
                    Add emote
                </button>
                {emoteError ? <span className="mx_ImagePacksPanel_error">{emoteError}</span> : null}
            </div>
        </div>
    );
}

function EmoteGrid(props: {
    pack: ImagePackDefinition;
    onEdit: (shortcode: string, body: string) => Promise<void>;
    onRemove: (shortcode: string) => Promise<void>;
}): React.ReactElement {
    const [editing, setEditing] = useState<string | null>(null);
    const [editBody, setEditBody] = useState("");
    const entries = Object.entries(props.pack.images);
    if (entries.length === 0) return <div className="mx_ImagePacksPanel_emotesEmpty">No emotes in this pack yet.</div>;
    return (
        <ul className="mx_ImagePacksPanel_emotes">
            {entries.map(([shortcode, image]) => (
                <li key={shortcode} className="mx_ImagePacksPanel_emote" data-testid={`emote-${shortcode}`}>
                    <code>:{shortcode}:</code>
                    <span>{image.body ?? ""}</span>
                    {editing === shortcode ? (
                        <>
                            <input
                                aria-label={`Body for ${shortcode}`}
                                value={editBody}
                                onChange={(event) => setEditBody(event.target.value)}
                            />
                            <button
                                type="button"
                                onClick={async () => {
                                    await props.onEdit(shortcode, editBody);
                                    setEditing(null);
                                }}
                            >
                                Save
                            </button>
                            <button type="button" onClick={() => setEditing(null)}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setEditing(shortcode);
                                setEditBody(image.body ?? "");
                            }}
                        >
                            Edit
                        </button>
                    )}
                    <button type="button" onClick={() => void props.onRemove(shortcode)}>
                        Remove
                    </button>
                </li>
            ))}
        </ul>
    );
}

function PackRenameForm(props: {
    initial: string;
    onSave: (displayName: string) => Promise<void>;
    onDone: () => void;
}): React.ReactElement {
    const { initial, onSave, onDone } = props;
    const [value, setValue] = useState(initial);
    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                if (!value.trim()) return;
                await onSave(value.trim());
                onDone();
            }}
        >
            <input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Pack name" />
            <button type="submit">Save</button>
            <button type="button" onClick={onDone}>
                Cancel
            </button>
        </form>
    );
}

function NewPackCard(props: { api: UseImagePacksResult; restrictToRoomId?: string }): React.ReactElement {
    const { api, restrictToRoomId } = props;
    const [stateKey, setStateKey] = useState("");
    const [displayName, setDisplayName] = useState("");
    const submit = async (): Promise<void> => {
        const roomId = restrictToRoomId ?? api.newPack.roomId;
        if (!isValidStateKey(stateKey) || !displayName.trim() || !roomId) return;
        await api.createRoomPack({
            roomId,
            stateKey,
            displayName,
            usage: ["emoticon"],
            images: {},
        });
        setStateKey("");
        setDisplayName("");
    };
    return (
        <div className="mx_ImagePacksPanel_newPack" data-testid="new-pack-form">
            <h4>New pack</h4>
            <input
                aria-label="State key"
                placeholder="state-key (a-z, 0-9, -, _)"
                value={stateKey}
                onChange={(e) => setStateKey(e.target.value)}
            />
            <input
                aria-label="Display name"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
            />
            <button type="button" onClick={submit}>
                Create pack
            </button>
        </div>
    );
}

function NewUserPackCard(props: { api: UseImagePacksResult }): React.ReactElement {
    const { api } = props;
    const [displayName, setDisplayName] = useState("");
    const submit = async (): Promise<void> => {
        if (!displayName.trim()) return;
        await api.setUserPack({ displayName: displayName.trim(), usage: ["emoticon"], images: {} });
        setDisplayName("");
    };
    return (
        <div className="mx_ImagePacksPanel_newPack" data-testid="new-user-pack-form">
            <h4>New personal pack</h4>
            <input
                aria-label="Personal pack display name"
                placeholder="Display name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
            />
            <button type="button" onClick={submit}>
                Create pack
            </button>
        </div>
    );
}

function downloadJson(content: string, filename: string): void {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
