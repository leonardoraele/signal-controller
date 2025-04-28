const ONCE_SYMBOL = Symbol('once');
const EMIT = Symbol('emit');
const CLEAR_SIGNAL = Symbol('off');
const CLEAR_ALL_SIGNALS = Symbol('clear');

interface ListenerFunction {
	(...args: any[]): unknown;
	[ONCE_SYMBOL]?: boolean;
}

export interface BaseEventEmitterAPI {
	[signalName: string|symbol]: ListenerFunction;
}

export interface SignalListenerOptions {
	once?: boolean;
	signal?: AbortSignal;
}

export class SignalEmitter<T extends BaseEventEmitterAPI> {
	#listeners = new Map<keyof T, Set<BaseEventEmitterAPI['']>>();

	[EMIT]<K extends keyof T>(signalName: K, ...args: Parameters<T[K]>): boolean {
		const listeners = this.#listeners.get(signalName);
		if (!listeners) {
			return false;
		}
		for (const listener of listeners) {
			if (listener[ONCE_SYMBOL]) {
				this.off(signalName, listener);
			}
			try {
				listener(...args);
			} catch (e) {
				console.error(e);
			}
		}
		return true;
	}

	on<K extends keyof T>(signalName: K, listener: T[K]): void;
	on<K extends keyof T>(signalName: K, options: SignalListenerOptions, listener: T[K]): void;
	on<K extends keyof T>(signalName: K, ...args: any[]): void {
		const listener: T[K] = typeof args[0] === 'function' ? args[0] : args[1];
		const options: SignalListenerOptions|undefined = typeof args[0] === 'object' ? args[0] : undefined;
		{
			const listeners = this.#listeners.get(signalName);
			if (listeners) {
				listeners.add(listener);
			} else {
				this.#listeners.set(signalName, new Set([listener]));
			}
		}
		{
			if (options?.once) {
				Object.defineProperty(listener, ONCE_SYMBOL, {
					enumerable: false,
					configurable: true,
					writable: false,
					value: true,
				});
			}
		}
		{
			options?.signal?.addEventListener('abort', () => {
				this.off(signalName, listener);
			}, { once: true });
		}
	}

	readableStream<K extends keyof T>(signalName: K): ReadableStream<Parameters<T[K]>> {
		const aborter = new AbortController();
		return new ReadableStream<Parameters<T[K]>>({
			start: (controller) => {
				this.on(signalName, { signal: aborter.signal }, ((...args: any[]) => {
					controller.enqueue(args as any);
				}) as any);
			},
			cancel: reason => aborter.abort(reason),
		});
	}

	next<K extends keyof T>(signalName: K, { signal = undefined as AbortSignal|undefined } = {}): Promise<Parameters<T[K]>> {
		return new Promise<Parameters<T[K]>>((resolve, reject) => {
			signal?.addEventListener('abort', reason => reject(reason));
			this.on(signalName, { once: true }, ((values: any) => resolve(values)) as any);
		});
	}

	off(signalName: keyof T, listener: ListenerFunction): void {
		delete listener[ONCE_SYMBOL];
		const listeners = this.#listeners.get(signalName);
		if (!listeners) {
			return;
		}
		listeners.delete(listener);
		if (listeners.size === 0) {
			this.#listeners.delete(signalName);
		}
	}

	[CLEAR_SIGNAL](signalName: keyof T): void {
		this.#listeners.get(signalName)
			?.forEach(listener => this.off(signalName, listener));
	}

	[CLEAR_ALL_SIGNALS](): void {
		Object.keys(this.#listeners).forEach(key => this[CLEAR_SIGNAL](key));
	}
}

export class SignalController<T extends BaseEventEmitterAPI> {
	readonly signal = new SignalEmitter<T>();

	constructor(
		// private readonly options: SignalControllerOptions = {},
	) {}

	emit<K extends keyof T>(signalName: K, ...args: Parameters<T[K]>): void {
		this.signal[EMIT](signalName, ...args);
	}

	off(signalName: keyof T): void {
		this.signal[CLEAR_SIGNAL](signalName);
	}

	clear(): void {
		this.signal[CLEAR_ALL_SIGNALS]();
	}

	/** Removes all event listeners, stops accepting new event listeners, and future calls to {@link emit} will only
	 * produce a warning message, but otherwise be ignored. */
	destroy(): void {
		this.clear();
		this.emit = () => {
			const dummy: { stack: string } = {} as any;
			Error.captureStackTrace(dummy, SignalController);
			console.warn("Ignoring event emitted to a SignalController that has been destroyed.", dummy.stack);
		};
		this.signal.on = () => {
			const dummy: { stack: string } = {} as any;
			Error.captureStackTrace(dummy, SignalController);
			console.warn("Ignoring subscription of new listener to a SignalEmitter whose controller has been destroyed.", dummy.stack);
		};
	}

	writableStream<K extends keyof T>(signalName: K): WritableStream<Parameters<T[K]>> {
		return new WritableStream<Parameters<T[K]>>({
			write: args => this.emit(signalName, ...args),
		});
	}
}
