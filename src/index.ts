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
	/** If true, this listener will only be called once. */
	once?: boolean;
	/** If provided, the listener will be removed when the abort signal is triggered. */
	signal?: AbortSignal;
}

export type { SignalEmitter };

/** This class is used to listen to signals. */
class SignalEmitter<T extends BaseEventEmitterAPI> {
	#listeners = new Map<keyof T, Set<BaseEventEmitterAPI['']>>();
	#lastArgs?: Map<keyof T, any[]>;

	constructor({ immediate = false } = {}) {
		if (immediate) {
			this.#lastArgs = new Map();
		}
	}

	[EMIT]<K extends keyof T>(signalName: K, ...args: Parameters<T[K]>): [boolean, unknown[]] {
		// Save arguments if necessary
		{
			this.#lastArgs?.set(signalName, args);
		}

		const listeners = this.#listeners.get(signalName);
		if (!listeners) {
			return [false, []];
		}

		const errors = listeners
			.values()
			.flatMap(listener => {
				if (listener[ONCE_SYMBOL]) {
					this.off(signalName, listener);
				}
				try {
					listener(...args);
				} catch (e) {
					return [e];
				}
				return [];
			})
			.toArray();

		return [true, errors];
	}

	/** Start listening to a signal. The provided callback is called whenever the specified signal is emitted. */
	on<K extends keyof T>(signalName: K, listener: T[K]): void;
	on<K extends keyof T>(signalName: K, options: SignalListenerOptions, listener: T[K]): void;
	on<K extends keyof T>(signalName: K, ...args: any[]): void {
		const listener: T[K] = typeof args[0] === 'function' ? args[0] : args[1];
		const options: SignalListenerOptions|undefined = typeof args[0] === 'object' ? args[0] : undefined;

		// Add listener to the list
		{
			const listeners = this.#listeners.get(signalName);
			if (listeners) {
				listeners.add(listener);
			} else {
				this.#listeners.set(signalName, new Set([listener]));
			}
		}

		// Handles `once` option
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

		// Handles `signal` option
		{
			options?.signal?.addEventListener('abort', () => {
				this.off(signalName, listener);
			}, { once: true });
		}

		// Handles `immediate` option
		{
			const lastArgs = this.#lastArgs?.get(signalName);
			if (lastArgs) {
				listener(...lastArgs);
			}
		}
	}

	/** Creates a readable stream that produces data each time the specified signal is emitted. */
	createReadableStream<K extends keyof T>(signalName: K): ReadableStream<Parameters<T[K]>> {
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

	/** Creates a Proimse that is resolved the next time the specified signal is emitted. The promise is rejected only
	 * if an abort signal is provided and it is aborted before the waited signal is emitted. */
	once<K extends keyof T>(signalName: K, { signal = undefined as AbortSignal|undefined } = {}): Promise<Parameters<T[K]>> {
		return new Promise<Parameters<T[K]>>((resolve, reject) => {
			signal?.addEventListener('abort', reason => reject(reason));
			this.on(signalName, { once: true }, ((values: any) => resolve(values)) as any);
		});
	}

	/** Removes a listener. */
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

interface SignalControllerOptions {
	/** If this option is true, the signal emitter will immediately call newly subscribed listeners with the last
	 * arguments emitted (if any). */
	immediate?: boolean;
	/** Callback called when an signal listener throws. */
	onError?: (error: unknown, signalName: string, args: unknown[]) => void;
}

/** This class is used to emit signals. */
export class SignalController<T extends BaseEventEmitterAPI> {
	constructor(
		private readonly options: SignalControllerOptions = {},
	) {
		this.emitter = new SignalEmitter<T>({ immediate: options.immediate });
		this.onError = options.onError || console.error;
	}

	readonly emitter: SignalEmitter<T>;
	public onError: SignalControllerOptions['onError'];

	/** Emits a signal with some payload. Returns true if the signal was handled by at least one listener. */
	emit<K extends keyof T>(signalName: K, ...args: Parameters<T[K]>): boolean {
		const [called, errors] = this.emitter[EMIT](signalName, ...args);
		for (const error of errors) {
			try {
				this.options.onError?.(error, signalName as string, args);
			} catch (e) {
				console.error(error, signalName, args);
				console.error(e);
			}
		}
		return called;
	}

	/** Removes all listeners for a specific signal. */
	off(signalName: keyof T): void {
		this.emitter[CLEAR_SIGNAL](signalName);
	}

	/** Removes all listeners for all signals. */
	clear(): void {
		this.emitter[CLEAR_ALL_SIGNALS]();
	}

	/** Removes all signal listeners, stops accepting new signal listeners, and future calls to {@link emit} will only
	 * produce a warning message, but otherwise be ignored. */
	destroy(): void {
		this.clear();
		this.emit = () => {
			const dummy = {} as unknown as { stack: string };
			if ('captureStackTrace' in Error && typeof Error.captureStackTrace === 'function') {
				Error.captureStackTrace(dummy, SignalController);
			} else {
				dummy.stack = new Error().stack || '';
			}
			console.warn("Ignoring signal emitted to a SignalController that has been destroyed.", dummy.stack);
			return false;
		};
		this.emitter.on = () => {
			const dummy = {} as unknown as { stack: string };
			if ('captureStackTrace' in Error && typeof Error.captureStackTrace === 'function') {
				Error.captureStackTrace(dummy, SignalController);
			} else {
				dummy.stack = new Error().stack || '';
			}
			console.warn("Ignoring subscription of new listener to a SignalEmitter whose controller has been destroyed.", dummy.stack);
		};
	}

	/** Creates a writable stream that produces signals of the specified type for each chunk of data it receives. */
	createWritableStream<K extends keyof T>(signalName: K): WritableStream<Parameters<T[K]>> {
		return new WritableStream<Parameters<T[K]>>({
			write: args => void this.emit(signalName, ...args),
		});
	}
}
