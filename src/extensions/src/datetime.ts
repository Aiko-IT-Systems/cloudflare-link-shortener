/**
 * Converts the local wall-clock value emitted by an HTML `datetime-local`
 * control into the API's canonical UTC ISO-8601 representation.
 */
export function localDateTimeToUtcIso(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
	if (!match) throw new Error("Choose a valid expiry date and time.");

	const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", fractionText = ""] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const second = Number(secondText);
	const milliseconds = Number(fractionText.padEnd(3, "0"));
	const local = new Date(year, month - 1, day, hour, minute, second, milliseconds);

	if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day
		|| local.getHours() !== hour || local.getMinutes() !== minute || local.getSeconds() !== second) {
		throw new Error("Choose a valid expiry date and time.");
	}

	return local.toISOString();
}
