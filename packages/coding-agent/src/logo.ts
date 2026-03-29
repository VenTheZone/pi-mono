import type { Theme } from "./modes/interactive/theme/theme.js";

/**
 * VENCODE ASCII art logo in figlet font style.
 */
const logo = [
	"                               _      ",
	"__   _____ _ __   ___ ___   __| | ___ ",
	"\\ \\ / / _ \\ '_ \\ / __/ _ \\ / _` |/ _ \\",
	" \\ V /  __/ | | | (_| (_) | (_| |  __/",
	"  \\_/ \\___|_| |_|\\___\\___/ \\__,_|\\___|",
	"                                      ",
];

const reset = "\x1b[0m";

/**
 * Render the VENCODE ASCII art logo using the active theme.
 * Uses "dim" color for the main foreground.
 * @param theme - The active Theme instance
 * @returns The rendered logo string with ANSI escape codes
 */
export function renderLogo(theme: Theme): string {
	const fg = theme.getFgAnsi("dim");

	const result = logo.map((line) => {
		let colored = "";
		for (const char of line) {
			if (char === " ") {
				colored += " ";
			} else {
				colored += fg + char + reset;
			}
		}
		return colored;
	});

	return result.join("\n");
}
