import { truncateToWidth } from "@mariozechner/pi-tui";
import * as Diff from "diff";
import { theme } from "../theme/theme.js";

/** Minimum terminal width to enable split view */
const SPLIT_VIEW_MIN_WIDTH = 120;

/**
 * Get terminal width from process.stdout
 */
function getTerminalWidth(): number {
	return process.stdout.columns || 80;
}

/**
 * Parse diff line to extract prefix, line number, and content.
 * Format: "+123 content" or "-123 content" or " 123 content" or "     ..."
 */
function parseDiffLine(line: string): { prefix: string; lineNum: string; content: string } | null {
	const match = line.match(/^([+-\s])(\s*\d*)\s(.*)$/);
	if (!match) return null;
	return { prefix: match[1], lineNum: match[2], content: match[3] };
}

/**
 * Replace tabs with spaces for consistent rendering.
 */
function replaceTabs(text: string): string {
	return text.replace(/\t/g, "   ");
}

/**
 * Compute word-level diff and render with inverse on changed parts.
 * Uses diffWords which groups whitespace with adjacent words for cleaner highlighting.
 * Strips leading whitespace from inverse to avoid highlighting indentation.
 */
function renderIntraLineDiff(oldContent: string, newContent: string): { removedLine: string; addedLine: string } {
	const wordDiff = Diff.diffWords(oldContent, newContent);

	let removedLine = "";
	let addedLine = "";
	let isFirstRemoved = true;
	let isFirstAdded = true;

	for (const part of wordDiff) {
		if (part.removed) {
			let value = part.value;
			// Strip leading whitespace from the first removed part
			if (isFirstRemoved) {
				const leadingWs = value.match(/^(\s*)/)?.[1] || "";
				value = value.slice(leadingWs.length);
				removedLine += leadingWs;
				isFirstRemoved = false;
			}
			if (value) {
				removedLine += theme.inverse(value);
			}
		} else if (part.added) {
			let value = part.value;
			// Strip leading whitespace from the first added part
			if (isFirstAdded) {
				const leadingWs = value.match(/^(\s*)/)?.[1] || "";
				value = value.slice(leadingWs.length);
				addedLine += leadingWs;
				isFirstAdded = false;
			}
			if (value) {
				addedLine += theme.inverse(value);
			}
		} else {
			removedLine += part.value;
			addedLine += part.value;
		}
	}

	return { removedLine, addedLine };
}

export interface RenderDiffOptions {
	/** File path (unused, kept for API compatibility) */
	filePath?: string;
	/** Force split view mode (old|new side by side). Auto-detected if not specified. */
	splitView?: boolean;
}

/**
 * Render a diff string with colored lines and intra-line change highlighting.
 * - Context lines: dim/gray
 * - Removed lines: red, with inverse on changed tokens
 * - Added lines: green, with inverse on changed tokens
 *
 * When terminal width >= 120 columns, automatically uses split view (old|new).
 */
export function renderDiff(diffText: string, options: RenderDiffOptions = {}): string {
	// Auto-detect split view based on terminal width
	const useSplitView = options.splitView ?? getTerminalWidth() >= SPLIT_VIEW_MIN_WIDTH;

	if (useSplitView) {
		return renderSplitDiff(diffText);
	}
	return renderUnifiedDiff(diffText);
}

/**
 * Render diff in unified format (original behavior).
 */
function renderUnifiedDiff(diffText: string): string {
	const lines = diffText.split("\n");
	const result: string[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const parsed = parseDiffLine(line);

		if (!parsed) {
			result.push(theme.fg("toolDiffContext", line));
			i++;
			continue;
		}

		if (parsed.prefix === "-") {
			// Collect consecutive removed lines
			const removedLines: { lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parseDiffLine(lines[i]);
				if (!p || p.prefix !== "-") break;
				removedLines.push({ lineNum: p.lineNum, content: p.content });
				i++;
			}

			// Collect consecutive added lines
			const addedLines: { lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parseDiffLine(lines[i]);
				if (!p || p.prefix !== "+") break;
				addedLines.push({ lineNum: p.lineNum, content: p.content });
				i++;
			}

			// Only do intra-line diffing when there's exactly one removed and one added line
			// (indicating a single line modification). Otherwise, show lines as-is.
			if (removedLines.length === 1 && addedLines.length === 1) {
				const removed = removedLines[0];
				const added = addedLines[0];

				const { removedLine, addedLine } = renderIntraLineDiff(
					replaceTabs(removed.content),
					replaceTabs(added.content),
				);

				result.push(theme.fg("toolDiffRemoved", `-${removed.lineNum} ${removedLine}`));
				result.push(theme.fg("toolDiffAdded", `+${added.lineNum} ${addedLine}`));
			} else {
				// Show all removed lines first, then all added lines
				for (const removed of removedLines) {
					result.push(theme.fg("toolDiffRemoved", `-${removed.lineNum} ${replaceTabs(removed.content)}`));
				}
				for (const added of addedLines) {
					result.push(theme.fg("toolDiffAdded", `+${added.lineNum} ${replaceTabs(added.content)}`));
				}
			}
		} else if (parsed.prefix === "+") {
			// Standalone added line
			result.push(theme.fg("toolDiffAdded", `+${parsed.lineNum} ${replaceTabs(parsed.content)}`));
			i++;
		} else {
			// Context line
			result.push(theme.fg("toolDiffContext", ` ${parsed.lineNum} ${replaceTabs(parsed.content)}`));
			i++;
		}
	}

	return result.join("\n");
}

/**
 * Pad a string to a given width, truncating if too long.
 * Uses truncateToWidth for proper ANSI handling.
 */
function padOrTruncate(text: string, width: number): string {
	return truncateToWidth(text, width, "…", true);
}

/**
 * Render diff in split view format (old | new).
 * Shows removed lines on left, added lines on right.
 */
function renderSplitDiff(diffText: string): string {
	const lines = diffText.split("\n");
	const result: string[] = [];
	const termWidth = getTerminalWidth();
	const halfWidth = Math.floor((termWidth - 3) / 2); // -3 for " | " separator

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const parsed = parseDiffLine(line);

		if (!parsed) {
			// Context line or header - show centered
			result.push(theme.fg("toolDiffContext", replaceTabs(line)));
			i++;
			continue;
		}

		if (parsed.prefix === "-") {
			// Collect consecutive removed lines
			const removedLines: { lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parseDiffLine(lines[i]);
				if (!p || p.prefix !== "-") break;
				removedLines.push({ lineNum: p.lineNum, content: p.content });
				i++;
			}

			// Collect consecutive added lines
			const addedLines: { lineNum: string; content: string }[] = [];
			while (i < lines.length) {
				const p = parseDiffLine(lines[i]);
				if (!p || p.prefix !== "+") break;
				addedLines.push({ lineNum: p.lineNum, content: p.content });
				i++;
			}

			// Pair up lines for side-by-side display
			const maxLines = Math.max(removedLines.length, addedLines.length);
			for (let j = 0; j < maxLines; j++) {
				const removed = removedLines[j];
				const added = addedLines[j];

				// Build left side (removed)
				let leftSide = "";
				if (removed) {
					const content = replaceTabs(removed.content);
					leftSide = theme.fg("toolDiffRemoved", `-${removed.lineNum} ${content}`);
				}

				// Build right side (added)
				let rightSide = "";
				if (added) {
					const content = replaceTabs(added.content);
					rightSide = theme.fg("toolDiffAdded", `+${added.lineNum} ${content}`);
				}

				// For single-line modifications, show intra-line diff
				if (removedLines.length === 1 && addedLines.length === 1 && j === 0) {
					const { removedLine, addedLine } = renderIntraLineDiff(
						replaceTabs(removedLines[0].content),
						replaceTabs(addedLines[0].content),
					);
					leftSide = theme.fg("toolDiffRemoved", `-${removedLines[0].lineNum} ${removedLine}`);
					rightSide = theme.fg("toolDiffAdded", `+${addedLines[0].lineNum} ${addedLine}`);
				}

				// Combine sides with separator
				const leftPadded = padOrTruncate(leftSide, halfWidth);
				const separator = theme.fg("muted", "│");
				result.push(`${leftPadded} ${separator} ${rightSide}`);
			}
		} else if (parsed.prefix === "+") {
			// Standalone added line (no corresponding removed)
			const content = replaceTabs(parsed.content);
			const leftSide = "".padEnd(halfWidth);
			const rightSide = theme.fg("toolDiffAdded", `+${parsed.lineNum} ${content}`);
			const separator = theme.fg("muted", "│");
			result.push(`${leftSide} ${separator} ${rightSide}`);
			i++;
		} else {
			// Context line - show on both sides
			const content = replaceTabs(parsed.content);
			const contextLine = theme.fg("toolDiffContext", ` ${parsed.lineNum} ${content}`);
			const separator = theme.fg("muted", "│");
			result.push(`${contextLine} ${separator} ${contextLine}`);
			i++;
		}
	}

	return result.join("\n");
}
