import { describe, expect, it } from "vitest";
import {
	composeOperatorNotes,
	normalizePlayNotes,
} from "../../../scripts/prepare-play-release-notes.mjs";

describe("Play release-note normalizer", () => {
	it("removes GitHub metadata and converts links and bullets", () => {
		const result = normalizePlayNotes(
			`<!-- generated -->
## What's Changed
- Added [safer sharing](https://example.test/share)
## Contributors
- @automation
**Full Changelog**: https://example.test/compare`,
			{ locale: "en-US" },
		);

		expect(result).toBe("<en-US>\n• Added safer sharing\n</en-US>");
		expect(result).not.toContain("example.test");
		expect(result).not.toContain("automation");
	});

	it("puts custom notes before generated changes", () => {
		const result = normalizePlayNotes("- Generated fix", {
			operatorNotes: "- Important update",
			locale: "de-DE",
		});
		expect(result).toBe(
			"<de-DE>\n• Important update\n• Generated fix\n</de-DE>",
		);
	});

	it("truncates by Unicode characters at a word boundary", () => {
		const result = normalizePlayNotes("- One two three four five six", {
			limit: 18,
		});
		const body = result.split("\n")[1];
		expect(Array.from(body).length).toBeLessThanOrEqual(18);
		expect(body.endsWith("…")).toBe(true);
	});

	it("rejects an empty converted body", () => {
		expect(() =>
			normalizePlayNotes(
				"<!-- only metadata -->\nFull Changelog: https://example.test",
			),
		).toThrow(/empty/i);
	});

	it("does not carry workflow credential or event metadata into Play notes", () => {
		const result = normalizePlayNotes(
			"- Public fix\nGITHUB_TOKEN=do-not-copy\nsecrets.PLAY_KEY\ngithub.event.release.body",
			{},
		);
		expect(result).toBe("<en-US>\n• Public fix\n</en-US>");
	});

	it("trims operator-written notes", () => {
		expect(composeOperatorNotes({ text: "  Manual context  " })).toBe(
			"Manual context",
		);
	});
});
