// @vitest-environment jsdom
// #476 — YouTube BGM favorites storage migration: the default skill reader
// (favorites_play / next / prev context) must follow the workspace SoT
// (naia-settings config `bgmYoutubeFavorites`) once it exists, and only fall
// back to the legacy webview localStorage key before migration.
import { afterEach, describe, expect, it } from "vitest";
import { persistedFavoriteTracks } from "../bgm-skill";

const LEGACY_KEY = "yt-bgm-favorites";

afterEach(() => {
	localStorage.clear();
});

describe("persistedFavoriteTracks — workspace SoT first (#476)", () => {
	it("reads favorites from naia-config and ignores a stale legacy copy", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({
				locale: "en",
				bgmYoutubeFavorites: [{ id: "cfg-1", title: "Workspace Fav" }],
			}),
		);
		localStorage.setItem(
			LEGACY_KEY,
			JSON.stringify([{ id: "old-1", title: "Stale Legacy Fav" }]),
		);

		expect(persistedFavoriteTracks()).toEqual([
			{ id: "cfg-1", title: "Workspace Fav" },
		]);
	});

	it("an empty workspace array is authoritative — legacy is not resurrected", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ locale: "en", bgmYoutubeFavorites: [] }),
		);
		localStorage.setItem(
			LEGACY_KEY,
			JSON.stringify([{ id: "old-1", title: "Stale Legacy Fav" }]),
		);

		expect(persistedFavoriteTracks()).toEqual([]);
	});

	it("falls back to the legacy webview copy before migration", () => {
		localStorage.setItem(
			"naia-config",
			JSON.stringify({ locale: "en" }),
		);
		localStorage.setItem(
			LEGACY_KEY,
			JSON.stringify([{ id: "old-1", title: "Legacy Fav" }, { bad: true }]),
		);

		expect(persistedFavoriteTracks()).toEqual([
			{ id: "old-1", title: "Legacy Fav" },
		]);
	});

	it("returns an empty list when neither storage has favorites", () => {
		expect(persistedFavoriteTracks()).toEqual([]);
	});
});
