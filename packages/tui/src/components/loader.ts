import type { TUI } from "../tui.js";
import { Text } from "./text.js";

/**
 * Loader component that updates every 80ms with spinning animation
 */
export class Loader extends Text {
	private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private currentFrame = 0;
	private intervalId: NodeJS.Timeout | null = null;
	private ui: TUI | null = null;
	private animationsEnabled = true;

	constructor(
		ui: TUI,
		private spinnerColorFn: (str: string) => string,
		private messageColorFn: (str: string) => string,
		private message: string = "Loading...",
		animationsEnabled: boolean = true,
	) {
		super("", 1, 0);
		this.ui = ui;
		this.animationsEnabled = animationsEnabled;
		this.start();
	}

	render(width: number): string[] {
		return ["", ...super.render(width)];
	}

	start() {
		this.updateDisplay();
		if (this.animationsEnabled) {
			this.intervalId = setInterval(() => {
				this.currentFrame = (this.currentFrame + 1) % this.frames.length;
				this.updateDisplay();
			}, 80);
		}
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	setMessage(message: string) {
		this.message = message;
		this.updateDisplay();
	}

	setAnimationsEnabled(enabled: boolean) {
		this.animationsEnabled = enabled;
		if (enabled && !this.intervalId) {
			this.intervalId = setInterval(() => {
				this.currentFrame = (this.currentFrame + 1) % this.frames.length;
				this.updateDisplay();
			}, 80);
		} else if (!enabled && this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.updateDisplay();
	}

	private updateDisplay() {
		const frame = this.animationsEnabled ? this.frames[this.currentFrame] : "⋯";
		this.setText(`${this.spinnerColorFn(frame)} ${this.messageColorFn(this.message)}`);
		if (this.ui) {
			this.ui.requestRender();
		}
	}
}
