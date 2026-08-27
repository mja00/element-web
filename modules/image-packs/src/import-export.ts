/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { z } from "zod";

import {
    MXC_REGEX,
    PACK_IMPORT_SCHEMA_VERSION,
    SHORTCODE_REGEX,
    type EmoteDefinition,
    type ImagePackDefinition,
    type PackImportPayload,
} from "./types.ts";

export class PackImportError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "PackImportError";
    }
}

const mxc = z.string().regex(MXC_REGEX, { message: "Must be an mxc:// URL." });
const shortcode = z.string().regex(SHORTCODE_REGEX, {
    message: `Must match ${SHORTCODE_REGEX.source}.`,
});

const wireImage = z.object({
    url: mxc,
    body: z.string().optional(),
    info: z.record(z.string(), z.unknown()).optional(),
});

const wirePackMeta = z.object({
    display_name: z.string().min(1, { message: "Pack `display_name` is required." }),
    avatar_url: mxc.optional(),
    attribution: z.string().optional(),
    usage: z.array(z.string()).optional(),
});

const wirePackContent = z.object({
    images: z.record(shortcode, wireImage),
    pack: wirePackMeta,
});

const camelPackContent = z.object({
    displayName: z.string().min(1, { message: "Pack `displayName` is required." }),
    avatarUrl: mxc.optional(),
    attribution: z.string().optional(),
    usage: z.array(z.string()).optional(),
    images: z.record(
        shortcode,
        z.object({
            shortcode: shortcode.optional(),
            url: mxc,
            body: z.string().optional(),
            info: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
});

const envelopeSchema = z.object({
    version: z.literal(PACK_IMPORT_SCHEMA_VERSION),
    pack: z.union([wirePackContent, camelPackContent]),
});

function fromWireContent(value: z.infer<typeof wirePackContent>): ImagePackDefinition {
    const def: ImagePackDefinition = {
        displayName: value.pack.display_name.trim(),
        images: Object.fromEntries(
            Object.entries(value.images).map(([k, v]) => [k, toEmote(k, v)]),
        ),
    };
    if (value.pack.avatar_url) def.avatarUrl = value.pack.avatar_url;
    if (value.pack.attribution) def.attribution = value.pack.attribution;
    if (value.pack.usage) def.usage = value.pack.usage;
    return def;
}

function fromCamelContent(value: z.infer<typeof camelPackContent>): ImagePackDefinition {
    const def: ImagePackDefinition = {
        displayName: value.displayName.trim(),
        images: Object.fromEntries(
            Object.entries(value.images).map(([k, v]) => [k, toEmote(k, v)]),
        ),
    };
    if (value.avatarUrl) def.avatarUrl = value.avatarUrl;
    if (value.attribution) def.attribution = value.attribution;
    if (value.usage) def.usage = value.usage;
    return def;
}

function toEmote(key: string, value: { url: string; body?: string; info?: Record<string, unknown> }): EmoteDefinition {
    const out: EmoteDefinition = { shortcode: key, url: value.url };
    if (value.body) out.body = value.body;
    if (value.info) out.info = value.info;
    return out;
}

/**
 * Parse and validate a pack JSON payload produced by {@link exportPackJson}.
 * Accepts three shapes:
 *   1. `{ version: 1, pack: ImagePackDefinition }` (the form export produces)
 *   2. `{ version: 1, pack: { images, pack: { display_name, ... } } }` (the wire form)
 *   3. Bare `{ images, pack: { display_name, ... } }` (raw MSC2545 content)
 *
 * Throws {@link PackImportError} if the input does not match the expected
 * schema. The function is intentionally strict — clients should not silently
 * accept malformed packs.
 */
export function parsePackJson(input: unknown): ImagePackDefinition {
    if (typeof input !== "object" || input === null) {
        throw new PackImportError("Pack JSON must be an object.");
    }
    const obj = input as Record<string, unknown>;

    if (obj.version === PACK_IMPORT_SCHEMA_VERSION && "pack" in obj) {
        const parsed = envelopeSchema.safeParse(obj);
        if (!parsed.success) throw new PackImportError(parsed.error.issues[0]?.message ?? "Invalid pack JSON.");
        const inner = parsed.data.pack;
        return "displayName" in inner ? fromCamelContent(inner) : fromWireContent(inner);
    }
    if ("images" in obj && "pack" in obj) {
        const parsed = wirePackContent.safeParse(obj);
        if (!parsed.success) throw new PackImportError(parsed.error.issues[0]?.message ?? "Invalid pack JSON.");
        return fromWireContent(parsed.data);
    }
    if ("images" in obj && "displayName" in obj) {
        const parsed = camelPackContent.safeParse(obj);
        if (!parsed.success) throw new PackImportError(parsed.error.issues[0]?.message ?? "Invalid pack JSON.");
        return fromCamelContent(parsed.data);
    }
    throw new PackImportError("Pack JSON missing required `images` and `pack` keys.");
}

/**
 * Serialise a pack to the versioned envelope shape. The output round-trips
 * through {@link parsePackJson}.
 */
export function exportPackJson(pack: ImagePackDefinition): PackImportPayload {
    if (!pack.displayName.trim()) {
        throw new PackImportError("Cannot export a pack without a display name.");
    }
    const images: ImagePackDefinition["images"] = {};
    for (const [shortcode, image] of Object.entries(pack.images)) {
        if (!SHORTCODE_REGEX.test(shortcode)) {
            throw new PackImportError(
                `Invalid shortcode "${shortcode}". Must match ${SHORTCODE_REGEX.source}.`,
            );
        }
        if (!MXC_REGEX.test(image.url)) {
            throw new PackImportError(`Invalid MXC URL "${image.url}".`);
        }
        const emote: EmoteDefinition = { shortcode, url: image.url };
        if (image.body) emote.body = image.body;
        if (image.info) emote.info = image.info;
        images[shortcode] = emote;
    }
    const out: PackImportPayload = {
        version: PACK_IMPORT_SCHEMA_VERSION,
        pack: {
            displayName: pack.displayName.trim(),
            images,
            usage: pack.usage ?? ["emoticon"],
        },
    };
    if (pack.avatarUrl) out.pack.avatarUrl = pack.avatarUrl;
    if (pack.attribution) out.pack.attribution = pack.attribution;
    return out;
}
