export function parseJsonValue<T>(rawText: string): T | null {
	if (!rawText.trim()) return null;

	try {
		return JSON.parse(rawText) as T;
	} catch {
		return null;
	}
}
