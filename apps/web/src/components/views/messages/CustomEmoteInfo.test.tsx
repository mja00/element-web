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
import dis from "../../../dispatcher/dispatcher";
import { Action } from "../../../dispatcher/actions";
import { UserTab } from "../dialogs/UserTab";
import { CustomEmoteInfo, getRawCustomEmoteMxc } from "./CustomEmoteInfo";

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

    it("uses the replacement body when an edit changes an emote media URL", () => {
        const replacementMxcUrl = "mxc://example.org/replacement-wave";
        const editedEvent = new MatrixEvent({
            type: "m.room.message",
            room_id: roomId,
            sender: "@sender:example.org",
            content: {
                "body": ":wave:",
                "msgtype": "m.text",
                "format": "org.matrix.custom.html",
                "formatted_body": `<img data-mx-emoticon="" src="${mxcUrl}" title="wave">`,
                "m.new_content": {
                    body: ":wave:",
                    msgtype: "m.text",
                    format: "org.matrix.custom.html",
                    formatted_body: `<img data-mx-emoticon="" src="${replacementMxcUrl}" title="wave">`,
                },
            },
        });

        expect(getRawCustomEmoteMxc(editedEvent, "wave")).toBe(replacementMxcUrl);
    });

    it("ignores malformed or missing raw emote media", () => {
        const malformedEvent = new MatrixEvent({
            type: "m.room.message",
            room_id: roomId,
            content: {
                formatted_body: `<img data-mx-emoticon="" src="https://example.org/wave" title="wave">`,
            },
        });

        expect(getRawCustomEmoteMxc(malformedEvent, "wave")).toBeUndefined();
        expect(getRawCustomEmoteMxc(undefined, "wave")).toBeUndefined();
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

        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        expect(screen.queryByRole("dialog")).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        expect(resolver).toHaveBeenCalledTimes(2);

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

    it.each([
        ["user", "Private"],
        ["global", "Public"],
        ["space", "Space"],
        ["room", "Room"],
    ] as const)("labels a %s pack correctly", (source, scope) => {
        const pack: customEmotes.ResolvedImagePack = {
            roomId,
            stateKey: `${source}-emotes`,
            displayName: `${scope} emotes`,
            source,
            content: {
                images: { wave: { url: mxcUrl, body: "A friendly wave" } },
                pack: { attribution: "Pack author", avatar_url: "mxc://example.org/avatar" },
            },
        };
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([
            {
                shortcode: "wave",
                url: mxcUrl,
                body: "A friendly wave",
                pack,
                packSlug: `${source}-emotes`,
                sendToken: ":wave:",
            },
        ]);

        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);
        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));

        expect(screen.getByText(scope, { selector: ".mx_CustomEmoteInfo_packScope" })).toBeInTheDocument();
        expect(screen.getByRole("dialog").querySelector(".mx_CustomEmoteInfo_attribution")).toHaveTextContent(
            "Pack author",
        );
        expect(
            screen.getByText(scope[0], { selector: ".mx_CustomEmoteInfo_packAvatarPlaceholder" }),
        ).toBeInTheDocument();
    });

    it("opens image-pack settings for an enabled pack", () => {
        const pack: customEmotes.ResolvedImagePack = {
            roomId,
            stateKey: "global-emotes",
            displayName: "Public emotes",
            source: "global",
            content: { images: { wave: { url: mxcUrl } } },
        };
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([
            { shortcode: "wave", url: mxcUrl, pack, packSlug: "global-emotes", sendToken: ":wave:" },
        ]);
        vi.spyOn(dis, "dispatch").mockImplementation(() => undefined);

        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);
        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        fireEvent.click(screen.getByRole("button", { name: /Open Custom emotes/ }));

        expect(dis.dispatch).toHaveBeenCalledWith({
            action: Action.ViewUserSettings,
            initialTabId: UserTab.ImagePacks,
        });
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("enables a room pack and reports a transient failure", async () => {
        const pack: customEmotes.ResolvedImagePack = {
            roomId,
            stateKey: "room-emotes",
            displayName: "Room emotes",
            source: "room",
            content: { images: { wave: { url: mxcUrl } } },
        };
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([
            { shortcode: "wave", url: mxcUrl, pack, packSlug: "room-emotes", sendToken: ":wave:" },
        ]);
        const enable = vi.spyOn(customEmotes, "enableGlobalPack").mockResolvedValue(undefined);

        const view = render(
            <CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />,
        );
        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        fireEvent.click(screen.getByRole("button", { name: /Enable Custom emotes/ }));
        await waitFor(() => expect(enable).toHaveBeenCalledWith(client, { roomId, stateKey: "room-emotes" }));
        expect(screen.getByText("Saved")).toBeInTheDocument();

        view.unmount();
        enable.mockRejectedValueOnce(new Error("offline"));
        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);
        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        fireEvent.click(screen.getByRole("button", { name: /Enable Custom emotes/ }));
        await waitFor(() => expect(screen.getByText("Error")).toBeInTheDocument());
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
        const remove = vi.spyOn(customEmotes, "removeUserPackEmote").mockResolvedValue(undefined);
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

        fireEvent.click(screen.getByRole("button", { name: /Remove wave/i }));
        await waitFor(() => expect(remove).toHaveBeenCalledWith(client, "wave"));
        vi.mocked(client.getAccountData).mockReturnValue(undefined);
        act(() => client.emit(ClientEvent.AccountData, accountEvent));
        await waitFor(() => expect(screen.getByText("Remove")).toBeInTheDocument());
    });

    it("shows an error when removing a personal emote fails", async () => {
        const accountEvent = new MatrixEvent({
            type: LEGACY_USER_IMAGE_PACK_EVENT_TYPE,
            content: { images: { wave: { url: mxcUrl } } },
        });
        vi.mocked(client.getAccountData).mockReturnValue(accountEvent);
        vi.spyOn(customEmotes, "getCustomEmotesForRoom").mockReturnValue([]);
        vi.spyOn(customEmotes, "removeUserPackEmote").mockRejectedValueOnce(new Error("offline"));

        render(<CustomEmoteInfo mxEvent={event} room={room} src={srcHttp} title="wave" alt="A friendly wave" />);
        fireEvent.click(screen.getByRole("button", { name: ":wave:" }));
        fireEvent.click(screen.getByRole("button", { name: /Remove wave/i }));
        await waitFor(() => expect(screen.getByText("Error")).toBeInTheDocument());
    });
});
