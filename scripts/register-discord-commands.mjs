const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
const token = process.env.DISCORD_BOT_TOKEN?.trim();

if (!applicationId || !token) {
	throw new Error(
		"Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN before registering commands.",
	);
}

const commands = [
	{
		name: "shorten",
		description: "Create an AITSYS Go short link",
		type: 1,
		integration_types: [1],
		contexts: [2],
		options: [
			{
				name: "url",
				description: "HTTPS URL to shorten",
				type: 3,
				required: true,
			},
		],
	},
	{ name: "Shorten link", type: 3, integration_types: [1], contexts: [2] },
	{
		name: "manage",
		description: "Manage your Discord-created short links",
		type: 1,
		integration_types: [1],
		contexts: [2],
	},
];

const response = await fetch(
	`https://discord.com/api/v10/applications/${applicationId}/commands`,
	{
		method: "PUT",
		headers: {
			Authorization: `Bot ${token}`,
			"Content-Type": "application/json",
			"User-Agent": "AITSYS-Go/1.3 (+https://go.aitsys.dev/)",
		},
		body: JSON.stringify(commands),
	},
);

if (!response.ok)
	throw new Error(
		`Discord command registration failed (${response.status}): ${await response.text()}`,
	);
console.log("Registered 3 global user-install Discord commands.");
