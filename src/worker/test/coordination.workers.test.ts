import { env } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import {
	hashLinkPassword,
	passwordThrottleIdentifier,
	verifyLinkPassword,
} from "../src/passwords";
import type { LinkRecord } from "../src/types";

const pepper = "worker-runtime-password-pepper-at-least-32-bytes";

describe("LinkCoordinator in the Workers runtime", () => {
	test("serializes a permanent claim", async () => {
		const key = "link:coordinated";
		const coordinator = env.LINK_COORDINATOR.getByName("slug:coordinated");
		expect(
			(
				await Promise.all([
					coordinator.reserve(key),
					coordinator.reserve(key),
				])
			).sort(),
		).toEqual([false, true]);
		await coordinator.commit(key);
		expect(await coordinator.reserve(key)).toBe(false);
	});

	test("rejects a claim already present in KV", async () => {
		const key = "link:already-stored";
		await env.LINKS.put(key, "existing");
		const coordinator = env.LINK_COORDINATOR.getByName("slug:already-stored");
		expect(await coordinator.reserve(key)).toBe(false);
	});

	test("releases an abandoned reservation", async () => {
		const key = "link:released";
		const coordinator = env.LINK_COORDINATOR.getByName("slug:released");
		expect(await coordinator.reserve(key)).toBe(true);
		await coordinator.release(key);
		expect(await coordinator.reserve(key)).toBe(true);
	});

	test("allows an explicitly removed reusable identity to be claimed again", async () => {
		const key = "discord-account:123456789012345678";
		const coordinator = env.LINK_COORDINATOR.getByName(
			"discord:123456789012345678",
		);
		expect(await coordinator.reserve(key)).toBe(true);
		await coordinator.commit(key);
		expect(await coordinator.reserve(key)).toBe(false);
		await coordinator.unclaim(key);
		expect(await coordinator.reserve(key)).toBe(true);
	});

	test("persists and clears password failure state", async () => {
		const coordinator = env.LINK_COORDINATOR.getByName(
			"password:test:client-a",
		);
		const now = Date.now();
		for (let attempt = 0; attempt < 4; attempt += 1)
			expect(await coordinator.recordPasswordFailure(now)).toEqual({});
		expect(await coordinator.recordPasswordFailure(now)).toEqual({
			retryAfterSeconds: 60,
		});
		expect((await coordinator.allowPasswordAttempt(now)).allowed).toBe(false);
		expect(await runDurableObjectAlarm(coordinator)).toBe(true);
		expect(await coordinator.allowPasswordAttempt(now)).toEqual({ allowed: true });
	});
});

describe("password verifier in the Workers runtime", () => {
	test("uses a keyed verifier and rejects the wrong password", async () => {
		const passwordVerifier = await hashLinkPassword("correct horse", pepper);
		const record = {
			slug: "password-test",
			destinationUrl: "https://example.com",
			creator: "Test Cat",
			createdAt: new Date().toISOString(),
			passwordVerifier,
		} satisfies LinkRecord;
		expect(passwordVerifier.algorithm).toBe("HMAC-SHA-256");
		expect(
			(await verifyLinkPassword(record, "correct horse", pepper)).valid,
		).toBe(true);
		expect((await verifyLinkPassword(record, "wrong", pepper)).valid).toBe(
			false,
		);
		expect(
			await passwordThrottleIdentifier("192.0.2.1", pepper),
		).not.toBe(await passwordThrottleIdentifier("192.0.2.2", pepper));
	});

	test("keeps verifier creation below the Workers Free CPU budget", async () => {
		for (let warmup = 0; warmup < 5; warmup += 1)
			await hashLinkPassword(`warmup-${warmup}`, pepper);
		const iterations = 50;
		const started = performance.now();
		for (let index = 0; index < iterations; index += 1)
			await hashLinkPassword(`benchmark-${index}`, pepper);
		const averageMilliseconds = (performance.now() - started) / iterations;
		console.info(
			`HMAC password verifier average: ${averageMilliseconds.toFixed(3)} ms`,
		);
		expect(averageMilliseconds).toBeLessThan(10);
	});
});
