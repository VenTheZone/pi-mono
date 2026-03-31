// packages/tui/src/components/scrollable-container.ts
import type { Component } from "../tui.js";

/**
 * A container that supports scroll offset for its child content.
 * By default, shows the bottom of content (scrollOffset = 0 means "at bottom").
 * scrollOffset > 0 means "scrolled up N lines from bottom".
 */
export class ScrollableContainer implements Component {
	private child: Component;
	private scrollOffset = 0; // Distance from bottom (0 = at bottom)
	private getVisibleHeight: () => number;
	private lastContentHeight = 0;

	constructor(child: Component, getVisibleHeight: () => number) {
		this.child = child;
		this.getVisibleHeight = getVisibleHeight;
	}

	/**
	 * Scroll up by N lines (increase offset from bottom).
	 * Returns true if scroll position changed.
	 */
	scrollUp(lines: number): boolean {
		const maxOffset = this.getMaxScrollOffset();
		const newOffset = Math.min(this.scrollOffset + lines, maxOffset);
		if (newOffset !== this.scrollOffset) {
			this.scrollOffset = newOffset;
			return true;
		}
		return false;
	}

	/**
	 * Scroll down by N lines (decrease offset from bottom).
	 * Returns true if scroll position changed.
	 */
	scrollDown(lines: number): boolean {
		const newOffset = Math.max(this.scrollOffset - lines, 0);
		if (newOffset !== this.scrollOffset) {
			this.scrollOffset = newOffset;
			return true;
		}
		return false;
	}

	/**
	 * Scroll to the bottom (reset scroll offset).
	 */
	scrollToBottom(): void {
		this.scrollOffset = 0;
	}

	/**
	 * Get current scroll offset from bottom.
	 */
	getScrollOffset(): number {
		return this.scrollOffset;
	}

	/**
	 * Check if we're at the bottom (no scroll offset).
	 */
	isAtBottom(): boolean {
		return this.scrollOffset === 0;
	}

	/**
	 * Get the maximum scroll offset (content height - visible height).
	 */
	private getMaxScrollOffset(): number {
		return Math.max(0, this.lastContentHeight - this.getVisibleHeight());
	}

	render(width: number): string[] {
		const allLines = this.child.render(width);
		this.lastContentHeight = allLines.length;

		const visibleHeight = this.getVisibleHeight();

		// If content fits in visible area, show all
		if (allLines.length <= visibleHeight) {
			return allLines;
		}

		// Calculate start position from bottom
		// scrollOffset = 0 means show last visibleHeight lines
		// scrollOffset = N means skip N lines from the bottom
		const startIdx = Math.max(0, allLines.length - visibleHeight - this.scrollOffset);
		const endIdx = allLines.length - this.scrollOffset;

		return allLines.slice(startIdx, endIdx);
	}

	invalidate(): void {
		this.child.invalidate?.();
	}

	/**
	 * Get the child component (for direct access if needed)
	 */
	getChild(): Component {
		return this.child;
	}
}
