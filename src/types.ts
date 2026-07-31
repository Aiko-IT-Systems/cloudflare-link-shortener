export type LinkRecord = {
	slug: string;
	destinationUrl: string;
	creator: string;
	createdAt: string;
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
