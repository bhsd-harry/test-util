/* eslint-disable jsdoc/require-jsdoc, @typescript-eslint/class-methods-use-this */
import {rgba} from '@bhsd/common/color';

class OffscreenCanvasRenderingContext {
	#rgba: [number, number, number, number] = [0, 0, 0, 1];

	get fillStyle(): string {
		return `rgba(${this.#rgba.join(', ')})`;
	}

	set fillStyle(value: string) {
		const result = rgba(value);
		if (result.length === 4) {
			this.#rgba = result;
		}
	}

	clearRect(): void {
		//
	}

	fillRect(): void {
		//
	}

	getImageData(): {data: number[]} {
		return {data: [...this.#rgba.slice(0, 3), this.#rgba[3] * 255]};
	}
}

class OffscreenCanvas { // eslint-disable-line @typescript-eslint/no-shadow
	getContext(): OffscreenCanvasRenderingContext {
		return new OffscreenCanvasRenderingContext();
	}
}

Object.assign(globalThis, {OffscreenCanvas});
