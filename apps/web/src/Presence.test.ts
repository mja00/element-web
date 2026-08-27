/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import { SetPresence } from "matrix-js-sdk/src/matrix";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import { stubClient } from "test-utils";
import Presence from "./Presence";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

describe("Presence", () => {
    let client: MatrixClient;
    let started: Promise<void> | undefined;

    beforeEach(() => {
        Presence.stop();
        vi.useFakeTimers();
        client = stubClient();
        client.setSyncPresence = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(async () => {
        Presence.stop();
        await started;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("sets the initial state to online", () => {
        started = Presence.start();

        expect(Presence.getState()).toBe(SetPresence.Online);
        expect(client.setSyncPresence).toHaveBeenCalledWith(SetPresence.Online);
    });

    it("marks the user unavailable after the inactivity timeout", async () => {
        started = Presence.start();

        await vi.advanceTimersByTimeAsync(3 * 60 * 1000);

        expect(Presence.getState()).toBe(SetPresence.Unavailable);
        expect(client.setSyncPresence).toHaveBeenLastCalledWith(SetPresence.Unavailable);
    });

    it("resets state and cancels the inactivity timer when stopped", async () => {
        started = Presence.start();
        Presence.stop();

        expect(Presence.getState()).toBeNull();

        await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
        expect(client.setSyncPresence).toHaveBeenCalledTimes(1);
    });
});
