export function createAbortError(message: string): Error {
	const error = new Error(message);
	error.name = "AbortError";
	return error;
}

export function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
	if (signal?.aborted) {
		throw createAbortError(message);
	}
}

export function sleepWithAbort(ms: number, signal: AbortSignal | undefined, message: string): Promise<void> {
	throwIfAborted(signal, message);

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		const onAbort = () => {
			clearTimeout(timer);
			reject(createAbortError(message));
		};

		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
