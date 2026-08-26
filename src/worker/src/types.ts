export type LinkOwner = {
	kind: "account" | "discord";
	id: string;
};

export type LinkRecord = {
	slug: string;
	destinationUrl: string;
	creator: string;
	createdAt: string;
	owner?: LinkOwner;
	title?: string;
	embedTitle?: string;
	embedDescription?: string;
	embedImageUrl?: string;
	embedSiteName?: string;
	metadataFetchedAt?: string;
	password?: string;
	expiresAt?: string;
	suppressSocialPreview?: boolean;
	disabledAt?: string;
	disabledReason?: string;
};

export type AccountRecord = {
	id: string;
	creatorName: string;
	createdAt: string;
	discordUserId?: string;
	disabledAt?: string;
	deletedAt?: string;
};

export type TokenRecord = {
	id: string;
	accountId: string;
	label?: string;
	digest: string;
	createdAt: string;
	revokedAt?: string;
};

export type LinkPage = {
	items: LinkRecord[];
	cursor?: string;
};

export type AuthPrincipal =
	| { kind: "admin" }
	| { kind: "account"; account: AccountRecord; token: TokenRecord };

export type ApiError = {
	success: false;
	errors: Array<{
		message: string;
		code: string;
	}>;
};

export type ApiSuccess<T> = {
	success: true;
	result: T;
};
