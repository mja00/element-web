/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { ClientEvent, type MatrixClient, MatrixEvent, type Room } from "matrix-js-sdk/src/matrix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "test-utils-rtl";

import { getMockClientWithEventEmitter, mkStubRoom } from "test-utils";
import * as customEmotes from "../../../custom-emotes";
import { LEGACY_USER_IMAGE_PACK_EVENT_TYPE } from "../../../custom-emotes";
import CustomEmoteInfo from "./CustomEmoteInfo";

describe("CustomEmoteInfo", () => {
    const roomId = "!room:example.org";
    const mxcUrl = "mxc://example.org/wave";
    const srcHttp = "https://example.org/_matrix/client/v3/media/download/example.org/wave";
    let client: MatrixClient;
    let room: Room;
    let event: MatrixEvent;

    beforeEach(() => {
        client = getMockClientWithEventEmitter({
            getAccountData: vi.fn().mockReturnValue(undefined),
            getUserId: vi.fn().mockReturnValue("@alice:example.org"),
            getRoom: vi.fn(),
            setAccountData: vi.fn().mockResolvedValue(undefined),
        });
        room = mkStubRoom(roomId, "Room", client);
        event = new MatrixEvent({
            type: "m.room.message",
            room_id: roomId,
            sender: "@sender:example.org",
            content: {
                body: ":wave:",
                msgtype: "m.text",
                format: "org.matrix.custom.html",
                formatted_body: `<img data-mx-emoticon="" src="${mxcUrl}" alt="A friendly wave" title="wave">`,
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resolves packs only when the emote is opened and closes when the viewport moves", () => {
        const pack: customEmotes.ResolvedImagePack = {
            roomId,
            stateKey: "room-emotes",
            displayName: "Room emotes",
            source: "room",
            content: { images: { wave: { url: mxcUrl, body: "A friendly wave" } } },
        };
        const resolver = vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([
            {
                shortcode: "wave",
                url: mxcUrl,
                body: "A friendly wave",
                pack,
                packSlug: "room-emotes",
                sendToken: ":wave:",
            },
        ]);

        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);

        expect(resolver).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        expect(resolver).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: /custom emotes/i })).toHaveTextContent("Room emotes");
        expect(screen.getByRole("dialog").querySelector(".mx_CustomEmoteInfo_preview")).toHaveAttribute("src", srcHttp);

        fireEvent.scroll(window);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("does not attribute a pack when the shortcode uses a different media URL", () => {
        const pack: customEmotes.ResolvedImagePack = {
            roomId,
            stateKey: "room-emotes",
            displayName: "Wrong pack",
            source: "room",
            content: { images: { wave: { url: "mxc://example.org/other-wave" } } },
        };
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([
            {
                shortcode: "wave",
                url: "mxc://example.org/other-wave",
                pack,
                packSlug: "room-emotes",
                sendToken: ":wave:",
            },
        ]);
        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);

        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));

        expect(screen.queryByText("Wrong pack")).toBeNull();
        expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("wave");
    });

    it("requires a valid, non-colliding shortcode before adding an unattributed emote", () => {
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([]);
        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);

        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        const input = screen.getByRole("textbox", { name: "Name" });
        const add = screen.getByRole("button", { name: /Add/ });
        expect(add).toBeEnabled();

        fireEvent.change(input, { target: { value: "wave/room" } });
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(add).toBeDisabled();

        const accountEvent = new MatrixEvent({
            type: LEGACY_USER_IMAGE_PACK_EVENT_TYPE,
            content: { images: { wave: { url: mxcUrl } } },
        });
        vi.mocked(client.getAccountData).mockReturnValue(accountEvent);
        fireEvent.change(input, { target: { value: "wave" } });
        expect(add).toBeDisabled();
        expect(screen.getByRole("button", { name: /remove wave/i })).toBeInTheDocument();
    });

    it("does not show added status when the account-data write fails", async () => {
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([]);
        vi.mocked(client.setAccountData).mockRejectedValueOnce(new Error("offline"));
        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);

        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        fireEvent.click(screen.getByRole("button", { name: /Add/ }));
        await waitFor(() => expect(screen.getByText("Error")).toBeInTheDocument());
        expect(screen.queryByText("Saved")).toBeNull();
    });

    it("updates the saved status from an account-data event after adding", async () => {
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([]);
        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);

        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        fireEvent.click(screen.getByRole("button", { name: /Add/ }));
        await waitFor(() => expect(client.setAccountData).toHaveBeenCalled());

        const accountEvent = new MatrixEvent({
            type: LEGACY_USER_IMAGE_PACK_EVENT_TYPE,
            content: { images: { wave: { url: mxcUrl } } },
        });
        vi.mocked(client.getAccountData).mockReturnValue(accountEvent);
        act(() => client.emit(ClientEvent.AccountData, accountEvent));
        await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    });
});
