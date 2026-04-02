import type { AssistantMessage } from "@mariozechner/pi-ai";
import { Container, Markdown, type MarkdownTheme, Spacer, Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

/**
 * Component that renders thinking content with a left border.
 * Styled like opencode's ReasoningPart with a vertical bar on the left.
 */
class ThinkingBlock extends Container {
	private content: string;
	private borderColor: (text: string) => string;

	constructor(content: string, borderColor: (text: string) => string) {
		super();
		this.content = content;
		this.borderColor = borderColor;
	}

	override render(width: number): string[] {
		// Reserve 2 chars for border + space
		const contentWidth = Math.max(1, width - 2);
		const borderChar = this.borderColor("│");

		// Wrap the content to the available width
		const wrappedLines = wrapTextWithAnsi(`_Thinking:_ ${this.content}`, contentWidth);

		// Prepend border to each line
		return wrappedLines.map((line) => `${borderChar} ${theme.fg("thinkingText", theme.italic(line))}`);
	}

	override invalidate(): void {
		// No caching, re-render each time
	}
}

/**
 * Format duration in seconds to human-readable string.
 * Shows seconds if < 1 minute, otherwise mm:ss.
 */
function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}m ${secs}s`;
}

/**
 * Component that renders a complete assistant message.
 *
 * Supports incremental updates: instead of clear+rebuild on every streaming delta,
 * tracks child components and only updates changed portions. When the message is
 * fully resolved (no streaming, no in-progress tools), sets isStatic=true so
 * CachedContainer skips re-rendering entirely.
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private lastMessage?: AssistantMessage;
	private showEndMarker = false;
	private userTimestamp?: number;

	// Incremental update tracking
	private renderedTextContent = "";
	private renderedThinkingContent = "";
	private renderedEndMarker = false;
	private renderedAbortMessage = false;
	private renderedErrorMessage = false;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.markdownTheme = markdownTheme;

		// Container for text/thinking content
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	/**
	 * Enable message end marker showing model info and duration.
	 * @param userTimestamp - Timestamp of the preceding user message (for duration calculation)
	 */
	setEndMarkerEnabled(enabled: boolean, userTimestamp?: number): void {
		this.showEndMarker = enabled;
		this.userTimestamp = userTimestamp;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.hideThinkingBlock = hide;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;

		const hasVisibleContent = message.content.some(
			(c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()),
		);

		// Extract current text and thinking content for diffing
		const textContent = message.content
			.filter((c) => c.type === "text" && c.text.trim())
			.map((c) => (c as { type: "text"; text: string }).text.trim())
			.join("\n\n");
		const thinkingContent = message.content
			.filter((c) => c.type === "thinking" && c.thinking.trim())
			.map((c) => (c as { type: "thinking"; thinking: string }).thinking.trim())
			.join("\n\n");

		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		const isAborted = !hasToolCalls && message.stopReason === "aborted";
		const hasError = !hasToolCalls && message.stopReason === "error";
		const isResolved = message.stopReason !== undefined;

		// Check if we need a full rebuild (structural changes)
		const needsFullRebuild =
			this.contentContainer.children.length === 0 ||
			(this.renderedThinkingContent !== "") !== (thinkingContent !== "") ||
			this.renderedEndMarker !== this.showEndMarker ||
			this.renderedAbortMessage !== isAborted ||
			this.renderedErrorMessage !== hasError;

		if (needsFullRebuild) {
			this._fullRebuild(message, hasVisibleContent, textContent, thinkingContent, isAborted, hasError);
		} else {
			// Incremental: only update changed text content
			if (this.renderedTextContent !== textContent) {
				this._updateTextContent(textContent, hasVisibleContent);
			}
			// Update thinking content if changed
			if (this.renderedThinkingContent !== thinkingContent) {
				this._updateThinkingContent(thinkingContent, message);
			}
		}

		// Update end marker
		if (this.showEndMarker && message.timestamp && message.model) {
			this._updateEndMarker(message);
		}

		// Mark as static when fully resolved - CachedContainer will skip re-rendering
		if (isResolved) {
			this.isStatic = true;
		}
	}

	private _fullRebuild(
		message: AssistantMessage,
		hasVisibleContent: boolean,
		textContent: string,
		thinkingContent: string,
		isAborted: boolean,
		hasError: boolean,
	): void {
		this.contentContainer.clear();

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Add text content
		if (textContent) {
			this.contentContainer.addChild(new Markdown(textContent, 1, 0, this.markdownTheme));
		}

		// Add thinking content
		if (thinkingContent) {
			this._addThinkingBlock(thinkingContent, message);
		}

		// Abort/error messages
		if (isAborted) {
			const abortMessage =
				message.errorMessage && message.errorMessage !== "Request was aborted"
					? message.errorMessage
					: "Operation aborted";
			if (hasVisibleContent) {
				this.contentContainer.addChild(new Spacer(1));
			} else {
				this.contentContainer.addChild(new Spacer(1));
			}
			this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
		} else if (hasError) {
			const errorMsg = message.errorMessage || "Unknown error";
			this.contentContainer.addChild(new Spacer(1));
			this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
		}

		// End marker
		if (this.showEndMarker && message.timestamp && message.model) {
			this._addEndMarker(message);
		}

		// Track what we rendered
		this.renderedTextContent = textContent;
		this.renderedThinkingContent = thinkingContent;
		this.renderedEndMarker = this.showEndMarker && !!message.timestamp && !!message.model;
		this.renderedAbortMessage = isAborted;
		this.renderedErrorMessage = hasError;
	}

	private _addThinkingBlock(thinkingContent: string, message: AssistantMessage): void {
		const thinkingIndex = message.content.findIndex((c) => c.type === "thinking" && c.thinking.trim());
		const hasVisibleContentAfter = message.content
			.slice(thinkingIndex + 1)
			.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

		if (this.hideThinkingBlock) {
			this.contentContainer.addChild(new Text(theme.fg("thinkingText", theme.italic("Thinking...")), 1, 0));
			if (hasVisibleContentAfter) {
				this.contentContainer.addChild(new Spacer(1));
			}
		} else {
			this.contentContainer.addChild(new Spacer(1));
			this.contentContainer.addChild(new ThinkingBlock(thinkingContent, (s) => theme.fg("muted", s)));
			if (hasVisibleContentAfter) {
				this.contentContainer.addChild(new Spacer(1));
			}
		}
	}

	private _addEndMarker(message: AssistantMessage): void {
		this.contentContainer.addChild(new Spacer(1));

		let durationText = "";
		if (this.userTimestamp && message.timestamp) {
			const durationSeconds = (message.timestamp - this.userTimestamp) / 1000;
			if (durationSeconds > 0) {
				durationText = ` · ${formatDuration(durationSeconds)}`;
			}
		}

		const marker = theme.fg("accent", "▣");
		const modelId = theme.fg("text", message.model);
		const duration = durationText ? theme.fg("muted", durationText) : "";

		this.contentContainer.addChild(new Text(`${marker} ${modelId}${duration}`, 1, 0));
	}

	private _updateTextContent(textContent: string, _hasVisibleContent: boolean): void {
		// Find the Markdown child (first non-Spacer child after initial spacer)
		let markdownIndex = -1;
		for (let i = 0; i < this.contentContainer.children.length; i++) {
			const child = this.contentContainer.children[i];
			if (child instanceof Markdown) {
				markdownIndex = i;
				break;
			}
		}

		if (markdownIndex >= 0) {
			// Replace the Markdown component with updated content
			this.contentContainer.children[markdownIndex] = new Markdown(textContent, 1, 0, this.markdownTheme);
		} else if (textContent) {
			// Add new Markdown after initial spacer
			const spacerIndex = this.contentContainer.children.findIndex((c) => c instanceof Spacer);
			if (spacerIndex >= 0) {
				this.contentContainer.children.splice(
					spacerIndex + 1,
					0,
					new Markdown(textContent, 1, 0, this.markdownTheme),
				);
			}
		}

		this.renderedTextContent = textContent;
	}

	private _updateThinkingContent(thinkingContent: string, message: AssistantMessage): void {
		// Find and replace ThinkingBlock or "Thinking..." Text
		for (let i = 0; i < this.contentContainer.children.length; i++) {
			const child = this.contentContainer.children[i];
			if (child instanceof ThinkingBlock || (child instanceof Text && this.hideThinkingBlock)) {
				// Remove old thinking block and its surrounding spacers
				const toRemove: number[] = [];
				// Remove spacer before if exists
				if (i > 0 && this.contentContainer.children[i - 1] instanceof Spacer) {
					toRemove.push(i - 1);
				}
				toRemove.push(i);
				// Remove spacer after if exists
				if (
					i + 1 < this.contentContainer.children.length &&
					this.contentContainer.children[i + 1] instanceof Spacer
				) {
					toRemove.push(i + 1);
				}
				// Remove in reverse order to preserve indices
				for (const idx of toRemove.sort((a, b) => b - a)) {
					this.contentContainer.children.splice(idx, 1);
				}
				break;
			}
		}

		if (thinkingContent) {
			// Find insertion point: after text content, before end marker
			let insertIndex = this.contentContainer.children.length;
			for (let i = 0; i < this.contentContainer.children.length; i++) {
				const child = this.contentContainer.children[i];
				if (child instanceof Spacer && i > 0 && this.contentContainer.children[i - 1] instanceof Markdown) {
					// Insert after the spacer following Markdown
					insertIndex = i + 1;
					break;
				}
			}

			const thinkingIndex = message.content.findIndex((c) => c.type === "thinking" && c.thinking.trim());
			const hasVisibleContentAfter = message.content
				.slice(thinkingIndex + 1)
				.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

			if (this.hideThinkingBlock) {
				this.contentContainer.children.splice(
					insertIndex,
					0,
					new Text(theme.fg("thinkingText", theme.italic("Thinking...")), 1, 0),
				);
				if (hasVisibleContentAfter) {
					this.contentContainer.children.splice(insertIndex + 1, 0, new Spacer(1));
				}
			} else {
				this.contentContainer.children.splice(insertIndex, 0, new Spacer(1));
				this.contentContainer.children.splice(
					insertIndex + 1,
					0,
					new ThinkingBlock(thinkingContent, (s) => theme.fg("muted", s)),
				);
				if (hasVisibleContentAfter) {
					this.contentContainer.children.splice(insertIndex + 2, 0, new Spacer(1));
				}
			}
		}

		this.renderedThinkingContent = thinkingContent;
	}

	private _updateEndMarker(message: AssistantMessage): void {
		// Check if end marker already exists (last child is Text with model info)
		const lastChild = this.contentContainer.children[this.contentContainer.children.length - 1];
		if (lastChild instanceof Text && this.renderedEndMarker) {
			// Update existing end marker
			let durationText = "";
			if (this.userTimestamp && message.timestamp) {
				const durationSeconds = (message.timestamp - this.userTimestamp) / 1000;
				if (durationSeconds > 0) {
					durationText = ` · ${formatDuration(durationSeconds)}`;
				}
			}

			const marker = theme.fg("accent", "▣");
			const modelId = theme.fg("text", message.model);
			const duration = durationText ? theme.fg("muted", durationText) : "";

			// Replace the Text component with updated content
			this.contentContainer.children[this.contentContainer.children.length - 1] = new Text(
				`${marker} ${modelId}${duration}`,
				1,
				0,
			);
		} else if (!this.renderedEndMarker) {
			// Add end marker for the first time
			this._addEndMarker(message);
			this.renderedEndMarker = true;
		}
	}
}
