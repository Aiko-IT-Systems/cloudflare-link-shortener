import { DurableObject } from "cloudflare:workers";

type Reservation = {
	key: string;
	expiresAt: number;
};

const RESERVATION_TTL_MS = 60_000;
const METADATA_REFRESH_LEASE_MS = 30_000;
const METADATA_REFRESH_RETRY_MS = 60 * 60_000;

/** Per-identity coordination, sharded by the caller's deterministic name. */
export class LinkCoordinator extends DurableObject<Env> {
	async reserve(key: string): Promise<boolean> {
		const now = Date.now();
		if (await this.ctx.storage.get<boolean>("claimed")) return false;
		const current = await this.ctx.storage.get<Reservation>("reservation");
		if (current && current.expiresAt > now) return false;
		await this.ctx.storage.put("reservation", {
			key,
			expiresAt: now + RESERVATION_TTL_MS,
		});
		try {
			if (await this.env.LINKS.get(key)) {
				await this.ctx.storage.delete("reservation");
				return false;
			}
			return true;
		} catch (error) {
			await this.ctx.storage.delete("reservation");
			throw error;
		}
	}

	async commit(key: string): Promise<void> {
		const current = await this.ctx.storage.get<Reservation>("reservation");
		if (current?.key !== key) return;
		await this.ctx.storage.put("claimed", true);
		await this.ctx.storage.delete("reservation");
	}

	async release(key: string): Promise<void> {
		if (await this.ctx.storage.get<boolean>("claimed")) return;
		const current = await this.ctx.storage.get<Reservation>("reservation");
		if (current?.key === key) await this.ctx.storage.delete("reservation");
	}

	async unclaim(key: string): Promise<void> {
		const current = await this.ctx.storage.get<Reservation>("reservation");
		if (current?.key === key) await this.ctx.storage.delete("reservation");
		await this.ctx.storage.delete("claimed");
	}

	async allowPasswordAttempt(now: number): Promise<{
		allowed: boolean;
		retryAfterSeconds?: number;
	}> {
		const lockedUntil = await this.ctx.storage.get<number>("lockedUntil");
		if (lockedUntil && lockedUntil > now)
			return {
				allowed: false,
				retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
			};
		return { allowed: true };
	}

	async recordPasswordFailure(now: number): Promise<{
		retryAfterSeconds?: number;
	}> {
		let windowStart = await this.ctx.storage.get<number>("windowStart");
		let failures = (await this.ctx.storage.get<number>("failures")) ?? 0;
		if (!windowStart || now - windowStart > 15 * 60_000) {
			failures = 0;
			windowStart = now;
			await this.ctx.storage.put("windowStart", now);
		}
		failures += 1;
		await this.ctx.storage.put("failures", failures);
		const windowEndsAt = windowStart + 15 * 60_000;
		if (failures < 5) {
			await this.ctx.storage.setAlarm(windowEndsAt);
			return {};
		}
		const cooldownSeconds = Math.min(60 * 2 ** (failures - 5), 60 * 60);
		const lockedUntil = now + cooldownSeconds * 1000;
		await this.ctx.storage.put("lockedUntil", lockedUntil);
		await this.ctx.storage.setAlarm(Math.max(windowEndsAt, lockedUntil));
		return { retryAfterSeconds: cooldownSeconds };
	}

	async clearPasswordFailures(): Promise<void> {
		await this.ctx.storage.delete(["windowStart", "failures", "lockedUntil"]);
		await this.ctx.storage.deleteAlarm();
	}

	/**
	 * Allows one stale-preview fetch per link at a time. The Worker which wins
	 * the lease waits for the fresh metadata so Discord receives it immediately;
	 * other concurrent callers retain the last known safe preview.
	 */
	async beginMetadataRefresh(now: number): Promise<boolean> {
		const retryAt = await this.ctx.storage.get<number>("metadataRetryAt");
		if (retryAt && retryAt > now) return false;
		const leaseUntil = await this.ctx.storage.get<number>("metadataLeaseUntil");
		if (leaseUntil && leaseUntil > now) return false;
		await this.ctx.storage.put("metadataLeaseUntil", now + METADATA_REFRESH_LEASE_MS);
		return true;
	}

	async finishMetadataRefresh(now: number, succeeded: boolean): Promise<void> {
		await this.ctx.storage.delete("metadataLeaseUntil");
		if (succeeded) await this.ctx.storage.delete("metadataRetryAt");
		else await this.ctx.storage.put("metadataRetryAt", now + METADATA_REFRESH_RETRY_MS);
	}

	async alarm(): Promise<void> {
		await this.clearPasswordFailures();
	}
}
