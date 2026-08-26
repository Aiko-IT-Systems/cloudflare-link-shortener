import { LinkRecord } from "./types";
import { SiteConfig } from "./config";

type PageMeta = {
	description?: string;
	imageUrl?: string;
	pageUrl?: string;
	siteName?: string;
	suppressSocialPreview?: boolean;
};

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function metaTags(title: string, config: SiteConfig, meta: PageMeta = {}): string {
	if (meta.suppressSocialPreview) {
		return "";
	}

	const description = meta.description ?? `Transparent ${config.siteName} short link preview. No click analytics, cookies, or tracking pixels.`;
	const siteName = meta.siteName ?? config.siteName;
	const tags = [
		["property", "og:type", "website"],
		["property", "og:title", title],
		["property", "og:description", description],
		["property", "og:site_name", siteName],
		["name", "twitter:card", meta.imageUrl ? "summary_large_image" : "summary"],
		["name", "twitter:title", title],
		["name", "twitter:description", description]
	];

	if (meta.pageUrl) {
		tags.push(["property", "og:url", meta.pageUrl]);
	}

	if (meta.imageUrl) {
		tags.push(["property", "og:image", meta.imageUrl]);
		tags.push(["name", "twitter:image", meta.imageUrl]);
	}

	return tags
		.map(([attribute, name, content]) => `<meta ${attribute}="${escapeHtml(name)}" content="${escapeHtml(content)}">`)
		.join("\n\t\t");
}

function page(config: SiteConfig, title: string, body: string, status = 200, meta: PageMeta = {}): Response {
	return new Response(`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<meta name="robots" content="noindex, nofollow">
		${metaTags(title, config, meta)}
		<title>${escapeHtml(title)} · ${escapeHtml(config.siteName)}</title>
		<link rel="icon" href="${escapeHtml(config.faviconUrl)}">
		<style>
			:root {
				color-scheme: dark;
				font-family: Bahnschrift, "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
				background: #020711;
				color: #f6f8fb;
				--bg: #020711;
				--panel: rgba(39, 39, 39, .82);
				--line: rgba(255, 255, 255, .14);
				--soft-line: rgba(255, 255, 255, .08);
				--text-muted: #c7d4e3;
				--text-dim: #8495a8;
				--cyan: #45c8ff;
				--cyan-soft: rgba(69, 200, 255, .2);
				--go: ${config.brandColor ?? "#fc0fc0"};
				--pink-soft: rgba(252, 15, 192, .2);
				--fg: #f6f8fb;
			}
			* { box-sizing: border-box; }
			body {
				margin: 0;
				min-height: 100vh;
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 2rem 1rem;
				background:
					linear-gradient(115deg, rgba(69, 200, 255, .14), transparent 32rem),
					linear-gradient(245deg, rgba(252, 15, 192, .18), transparent 34rem),
					linear-gradient(145deg, #020711 0%, #272727 52%, #120915 100%);
				overflow-x: hidden;
			}
			main {
				position: relative;
				width: min(72rem, 100%);
				min-height: 34rem;
				padding: 3.25rem;
				border: 1px solid var(--line);
				border-radius: 1.25rem;
				background:
					linear-gradient(90deg, rgba(2, 7, 17, .94), rgba(39, 39, 39, .72) 58%, rgba(18, 9, 21, .74)),
					var(--panel);
				box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, .35);
				overflow: hidden;
			}
			main::before {
				content: "";
				position: absolute;
				inset: 0;
				opacity: .7;
				pointer-events: none;
			}
			main::after {
				content: "";
				position: absolute;
				right: -8rem;
				top: 3rem;
				width: 34rem;
				height: 28rem;
				border: 1px solid rgba(252, 15, 192, .22);
				border-radius: 4rem;
				transform: rotate(-18deg);
				background:
					linear-gradient(135deg, rgba(252, 15, 192, .14), transparent 50%),
					repeating-linear-gradient(90deg, rgba(255, 255, 255, .06) 0 .08rem, transparent .08rem 2rem);
				pointer-events: none;
			}
			.content {
				position: relative;
				z-index: 1;
				width: min(43rem, 100%);
			}
			.brand {
				display: flex;
				align-items: center;
				gap: 1rem;
				margin-bottom: 2.4rem;
			}
			.brand-lockup {
				display: inline-flex;
				align-items: center;
				gap: 1.1rem;
			}
			.brand-logo {
				width: 9.5rem;
				height: auto;
				display: block;
			}
			.brand-go {
				color: var(--go);
				font-size: 3.6rem;
				font-weight: 800;
				line-height: .85;
				text-transform: uppercase;
			}
			.brand-name {
				color: var(--fg);
				font-size: 3.6rem;
				font-weight: 800;
				line-height: .85;
				text-transform: uppercase;
			}
			.mascot {
				position: absolute;
				z-index: 1;
				right: 5.1rem;
				top: 9rem;
				width: 14rem;
				height: auto;
				filter: drop-shadow(0 1.8rem 2.4rem rgba(0, 0, 0, .45));
				pointer-events: none;
			}
			h1 {
				margin: 0 0 1.05rem;
				font-size: 4.1rem;
				line-height: .96;
				letter-spacing: 0;
				text-transform: uppercase;
				text-wrap: balance;
			}
			h1 .accent {
				color: var(--pink);
				display: inline;
				white-space: nowrap;
			}
			.one-line {
				white-space: nowrap;
			}
			p {
				margin: 0 0 1rem;
				color: var(--text-muted);
				line-height: 1.7;
				font-size: 1.05rem;
			}
			dl {
				margin: 1.5rem 0;
				display: grid;
				border: 1px solid var(--soft-line);
				border-radius: .75rem;
				background: rgba(3, 8, 16, .58);
			}
			.meta {
				padding: .95rem 1rem;
				border-top: 1px solid var(--soft-line);
			}
			.meta:first-child {
				border-top: 0;
			}
			dt {
				margin-bottom: .25rem;
				color: var(--text-dim);
				font-size: .82rem;
				text-transform: uppercase;
				letter-spacing: 0;
			}
			dd {
				margin: 0;
				overflow-wrap: anywhere;
			}
			a.button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				margin-top: .5rem;
				min-height: 2.9rem;
				padding: .78rem 1.15rem;
				border: 1px solid rgba(252, 15, 192, .46);
				border-radius: .38rem;
				background:
					linear-gradient(180deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .02)),
					rgba(3, 8, 16, .72);
				color: #f6f8fb;
				font-weight: 700;
				text-decoration: none;
				box-shadow:
					inset 0 -2px 0 rgba(252, 15, 192, .42),
					0 .85rem 2.2rem rgba(0, 0, 0, .2);
				transition: border-color .15s ease, background .15s ease, transform .15s ease;
			}
			form {
				display: grid;
				gap: .85rem;
				width: min(24rem, 100%);
				margin-top: 1.4rem;
			}
			input {
				min-height: 2.9rem;
				padding: .78rem .9rem;
				border: 1px solid rgba(255, 255, 255, .18);
				border-radius: .38rem;
				background: rgba(3, 8, 16, .72);
				color: #f6f8fb;
				font: inherit;
			}
			button {
				min-height: 2.9rem;
				padding: .78rem 1.15rem;
				border: 1px solid rgba(252, 15, 192, .46);
				border-radius: .38rem;
				background: linear-gradient(180deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .02)), rgba(3, 8, 16, .72);
				color: #f6f8fb;
				font: inherit;
				font-weight: 700;
				cursor: pointer;
				box-shadow: inset 0 -2px 0 rgba(252, 15, 192, .42), 0 .85rem 2.2rem rgba(0, 0, 0, .2);
			}
			a.button:hover {
				border-color: rgba(69, 200, 255, .75);
				background:
					linear-gradient(180deg, rgba(255, 255, 255, .08), rgba(255, 255, 255, .03)),
					#272727;
				transform: translateY(-1px);
			}
			code {
				padding: .15rem .35rem;
				border-radius: .3rem;
				background: rgba(255, 255, 255, .09);
				color: #eef9f7;
			}
			.note {
				margin-top: 1.25rem;
				font-size: .95rem;
				color: #aebdcb;
			}
			@media (max-width: 52rem) {
				body {
					align-items: flex-start;
				}
				main {
					min-height: auto;
					padding: 2rem 1.25rem;
				}
				main::after {
					opacity: .28;
					right: -18rem;
				}
				.mascot {
					right: -1.5rem;
					top: 2.6rem;
					width: 9rem;
					opacity: .38;
				}
				h1 {
					font-size: 2.75rem;
				}
				.brand {
					margin-bottom: 1.7rem;
				}
				.brand-go {
					font-size: 2.9rem;
				}
			}
			@media (max-width: 30rem) {
				h1 {
					font-size: 2.15rem;
				}
				.brand-logo {
					width: 7.2rem;
				}
				.brand-lockup {
					gap: .75rem;
				}
				.brand-go {
					font-size: 2.25rem;
				}
				.mascot {
					display: none;
				}
			}
		</style>
	</head>
	<body>
		<main>
			<img class="mascot" src="/brand/lulalaby-cat.png" alt="" aria-hidden="true">
			<div class="content">
				<div class="brand">
					<div class="brand-lockup">
						<img class="brand-logo" src="${escapeHtml(config.brandLogoUrl)}" alt="${escapeHtml(config.brandLogoAlt)}">
						<span class="brand-name">${escapeHtml(config.siteName.replace('Go', '').trim())}</span> <span class="brand-go">GO</span>
					</div>
				</div>
				${body}
			</div>
		</main>
	</body>
</html>`, {
		status,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Referrer-Policy": "no-referrer",
			"X-Content-Type-Options": "nosniff"
		}
	});
}

export function homepage(config: SiteConfig, pageUrl: string): Response {
	const brandImageUrl = new URL(config.brandLogoUrl, pageUrl).href;
	return page(config, "Private link shortener", `
		<p>A small link redirector for projects, release posts, docs, and community links.</p>
		<p>Short links show the destination before leaving this site, who added the link, and when it was created. No click analytics, no cookies, no tracking pixels.</p>
	`, 200, {
		description: `Transparent ${config.siteName} short links with a privacy-first splash page.`,
		imageUrl: brandImageUrl,
		pageUrl,
		siteName: config.siteName
	});
}

export function privacyPolicy(config: SiteConfig): Response {
	return page(config, "Privacy policy", `
		<h1>Privacy <span class="accent">policy</span></h1>
		<p>${escapeHtml(config.siteName)} creates and manages short links. It does not use advertising, analytics, click tracking, cookies, or telemetry.</p>
		<dl>
			<div class="meta">
				<dt>Service and hosting</dt>
				<dd>The service runs on Cloudflare Workers and uses Cloudflare KV to store the application data needed to operate it. Cloudflare may process normal technical request data while providing that infrastructure under its own privacy policy. AITSYS Go stores link destinations, slugs, optional settings, public creator names, ownership, and preview metadata. A short link and its preview details may be publicly visible. Issued API tokens are stored only as hashes.</dd>
			</div>
			<div class="meta">
				<dt>Browser extension and Android app</dt>
				<dd>The browser extension stores its configured API base URL and issued user token in browser extension storage, which is not encrypted. It sends the selected page URL and entered fields only to that configured API. The Android app stores its issued token encrypted with Android Keystore, excludes it from Android backup, and keeps ordinary settings and cached public branding locally. It sends entered link data or shared URLs only to the configured API. Both clients fetch public branding metadata from that API.</dd>
			</div>
			<div class="meta">
				<dt>Discord and distribution</dt>
				<dd>Discord user IDs are used for ownership checks and Discord usernames are stored as public authors. Multi-link Discord batches temporarily retain pending URLs and the invoking user ID for up to 15 minutes. Browser extension stores and Google Play distribute application packages under their own privacy policies; AITSYS Go does not receive store account data merely because an app is installed.</dd>
			</div>
			<div class="meta">
				<dt>Your choices</dt>
				<dd>You can revoke an issued token, disable a link, or ask the administrator to remove an account. Account removal revokes active tokens but retains existing public links so another account cannot inherit them. For privacy questions or data requests, contact <a href="mailto:${escapeHtml(config.privacyEmail)}">${escapeHtml(config.privacyEmail)}</a>.</dd>
			</div>
		</dl>
		<p class="note">The Android app can optionally require the device's biometric authentication or device PIN, pattern, or password. It does not create, store, or transmit an app-specific passcode.</p>
	`, 200, {
		description: `${config.siteName} privacy policy. No advertising, analytics, click tracking, cookies, or telemetry.`,
		suppressSocialPreview: true
	});
}

export function splash(config: SiteConfig, record: LinkRecord, pageUrl: string): Response {
	const label = record.embedTitle ?? record.title ?? record.destinationUrl;
	const description = record.embedDescription
		?? `Short link to ${record.destinationUrl}. No click analytics, cookies, or tracking pixels.`;
	return page(config, label, `
		<h1>Leaving <span class="accent">GO</span></h1>
		<p>This short link points to the destination below. Nothing is tracked here: no click counter, no cookies, and no analytics storage.</p>
		<dl>
			<div class="meta">
				<dt>Destination</dt>
				<dd>${escapeHtml(record.destinationUrl)}</dd>
			</div>
			<div class="meta">
				<dt>Added by</dt>
				<dd>${escapeHtml(record.creator)}</dd>
			</div>
			<div class="meta">
				<dt>Created</dt>
				<dd>${escapeHtml(new Date(record.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }))} UTC</dd>
			</div>
		</dl>
		<a class="button" href="${escapeHtml(record.destinationUrl)}" rel="noreferrer">Continue to destination</a>
	`, 200, {
		description,
		imageUrl: record.embedImageUrl,
		pageUrl,
		siteName: record.embedSiteName,
		suppressSocialPreview: record.suppressSocialPreview
	});
}

export function unavailable(config: SiteConfig, record: LinkRecord): Response {
	return page(config, "Link unavailable", `
		<h1 class="one-line">Link <span class="accent">disabled</span></h1>
		<p>The short link <code>/${escapeHtml(record.slug)}</code> exists, but it is no longer available.</p>
		${record.disabledReason ? `<p class="note">${escapeHtml(record.disabledReason)}</p>` : ""}
	`, 410);
}

export function expired(config: SiteConfig, record: LinkRecord): Response {
	return page(config, "Link expired", `
		<h1 class="one-line">Link <span class="accent">expired</span></h1>
		<p>The short link <code>/${escapeHtml(record.slug)}</code> exists, but its expiry time has passed.</p>
		${record.expiresAt ? `<p class="note">Expired at ${escapeHtml(new Date(record.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }))} UTC.</p>` : ""}
	`, 410, { suppressSocialPreview: record.suppressSocialPreview });
}

export function passwordPrompt(config: SiteConfig, record: LinkRecord, invalid = false): Response {
	return page(config, "Password required", `
		<h1 class="one-line">Password <span class="accent">required</span></h1>
		<p>The short link <code>/${escapeHtml(record.slug)}</code> is protected. Enter the password to view the destination splash.</p>
		${invalid ? `<p class="note">That password did not match.</p>` : ""}
		<form method="post" action="/${escapeHtml(record.slug)}">
			<input type="password" name="password" placeholder="Password" autocomplete="current-password" required>
			<button type="submit">Unlock link</button>
		</form>
	`, invalid ? 401 : 200, { suppressSocialPreview: true });
}

export function notFound(config: SiteConfig): Response {
	return page(config, "Link not found", `
		<h1 class="one-line">Link <span class="accent">not found</span></h1>
		<p>That short link does not exist, or it was typed with an extra character hiding somewhere.</p>
		<a class="button" href="/">Back home</a>
	`, 404);
}

export function robots(): Response {
	return new Response("User-agent: *\nDisallow: /\n", {
		headers: {
			"Content-Type": "text/plain; charset=utf-8"
		}
	});
}
