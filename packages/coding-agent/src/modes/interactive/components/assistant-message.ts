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
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private hiddenThinkingLabel: string;
	private lastMessage?: AssistantMessage;
	private showEndMarker = false;
	private userTimestamp?: number;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		hiddenThinkingLabel = "Thinking...",
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.markdownTheme = markdownTheme;
		this.hiddenThinkingLabel = hiddenThinkingLabel;

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

	setHiddenThinkingLabel(label: string): void {
		this.hiddenThinkingLabel = label;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;

		// Clear content container
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(
			(c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()),
		);

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Render content in order
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				// Assistant text messages with no background - trim the text
				// Set paddingY=0 to avoid extra spacing before tool executions
				this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
			} else if (content.type === "thinking" && content.thinking.trim()) {
				// Add spacing only when another visible assistant content follows.
				// This avoids a superfluous blank line before separately-rendered tool execution blocks.
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

				if (this.hideThinkingBlock) {
					// Show static thinking label when hidden
					this.contentContainer.addChild(
						new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				} else {
					// Thinking block with left border like opencode
					this.contentContainer.addChild(new Spacer(1));
					this.contentContainer.addChild(new ThinkingBlock(content.thinking.trim(), (s) => theme.fg("muted", s)));
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				}
			}
		}

		// Check if aborted - show after partial content
		// But only if there are no tool calls (tool execution components will show the error)
		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
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
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}

		// Render end marker if enabled (shows model ID and response duration)
		if (this.showEndMarker && message.timestamp && message.model) {
			this.contentContainer.addChild(new Spacer(1));

			// Calculate duration from user message to assistant completion
			let durationText = "";
			if (this.userTimestamp && message.timestamp) {
				const durationSeconds = (message.timestamp - this.userTimestamp) / 1000;
				if (durationSeconds > 0) {
					durationText = ` · ${formatDuration(durationSeconds)}`;
				}
			}

			// Format: ▣ modelID · duration
			const marker = theme.fg("accent", "▣");
			const modelId = theme.fg("text", message.model);
			const duration = durationText ? theme.fg("muted", durationText) : "";

			this.contentContainer.addChild(new Text(`${marker} ${modelId}${duration}`, 1, 0));
		}
	}
}
