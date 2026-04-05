import { parseJsonValue } from "../util/json.js";

export type FormRequestOptions = {
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

export type FormJsonResponse<T> = {
	response: Response;
	data: T | null;
	rawText: string;
};

export async function postFormJson<T>(
	url: string,
	body: URLSearchParams,
	options: FormRequestOptions = {},
): Promise<FormJsonResponse<T>> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
			...options.headers,
		},
		body: body.toString(),
		signal: options.signal,
	});

	const rawText = await response.text();
	return {
		response,
		data: parseJsonValue<T>(rawText),
		rawText,
	};
}
