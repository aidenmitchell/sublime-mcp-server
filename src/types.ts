// Define common error response structure
export interface ApiErrorResponse {
	error?: {
		type?: string;
		message?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

// Message groups response structure
export interface MessageGroupsResponse {
	message_groups?: Array<{
		messages?: Array<{
			id: string;
			[key: string]: unknown;
		}>;
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
}

// Hunt job details and results
export interface HuntJobDetails {
	source?: unknown;
	[key: string]: unknown;
}

export interface HuntJobResults {
	[key: string]: unknown;
}
