## API Reference

### SignalController

The main class that manages signal emission and provides access to the signal emitter.

#### Constructor

```typescript
constructor(options?: SignalControllerOptions)
```

**Options:**
- `immediate?: boolean` - If true, newly subscribed listeners will immediately receive the last emitted arguments (if any)

#### Methods

##### `emit<K extends keyof T>(signalName: K, ...args: Parameters<T[K]>): boolean`

Emits a signal with the specified arguments.

**Parameters:**
- `signalName` - The name of the signal to emit
- `...args` - Arguments to pass to the listeners

**Returns:** `true` if the signal was handled by at least one listener, `false` otherwise

**Example:**
```typescript
const handled = controller.emit('userLoggedIn', { id: '123', name: 'John' });
console.log(handled); // true if there were listeners, false otherwise
```

##### `off(signalName: keyof T): void`

Removes all listeners for a specific signal.

**Parameters:**
- `signalName` - The name of the signal to clear

**Example:**
```typescript
controller.off('userLoggedIn'); // Removes all userLoggedIn listeners
```

##### `clear(): void`

Removes all listeners for all signals.

**Example:**
```typescript
controller.clear(); // Removes all listeners
```

##### `destroy(): void`

Removes all listeners and prevents future emissions and subscriptions. Future calls to `emit()` will show a warning and be ignored.

**Example:**
```typescript
controller.destroy(); // Cleanup when done
```

##### `createWritableStream<K extends keyof T>(signalName: K): WritableStream<Parameters<T[K]>>`

Creates a WritableStream that emits signals when written to.

**Parameters:**
- `signalName` - The signal to emit when data is written

**Returns:** A WritableStream that emits the specified signal

**Example:**
```typescript
const stream = controller.createWritableStream('dataUpdated');
const writer = stream.getWriter();
writer.write([{ id: 1, name: 'Item 1' }]); // Emits 'dataUpdated' signal
```

#### Properties

##### `signal: SignalEmitter<T>`

The signal emitter instance used for subscribing to signals.

### SignalEmitter

The emitter class used for subscribing to signals. **Do not instantiate directly** - use `SignalController.signal`.

#### Methods

##### `on<K extends keyof T>(signalName: K, listener: T[K]): void`
##### `on<K extends keyof T>(signalName: K, options: SignalListenerOptions, listener: T[K]): void`

Subscribes to a signal.

**Parameters:**
- `signalName` - The name of the signal to listen to
- `options` - Optional configuration (see SignalListenerOptions)
- `listener` - The function to call when the signal is emitted

**Example:**
```typescript
// Basic subscription
controller.signal.on('userLoggedIn', (user) => {
  console.log(`User ${user.name} logged in`);
});

// With options
controller.signal.on('userLoggedIn', { once: true }, (user) => {
  console.log(`First login: ${user.name}`);
});

// With AbortController
const abortController = new AbortController();
controller.signal.on('userLoggedIn', { signal: abortController.signal }, (user) => {
  console.log(`User ${user.name} logged in`);
});
// Later: abortController.abort(); // Removes the listener
```

##### `once<K extends keyof T>(signalName: K, options?: { signal?: AbortSignal }): Promise<Parameters<T[K]>>`

Returns a promise that resolves when the signal is emitted once.

**Parameters:**
- `signalName` - The name of the signal to wait for
- `options` - Optional configuration with AbortSignal support

**Returns:** A promise that resolves with the signal arguments

**Example:**
```typescript
// Wait for a signal
const [user] = await controller.signal.once('userLoggedIn');
console.log(`User ${user.name} logged in`);

// With timeout using AbortController
const abortController = new AbortController();
setTimeout(() => abortController.abort(), 5000); // 5 second timeout

try {
  const [user] = await controller.signal.once('userLoggedIn', {
    signal: abortController.signal
  });
  console.log(`User ${user.name} logged in`);
} catch (error) {
  console.log('Timeout waiting for user login');
}
```

##### `off(signalName: keyof T, listener: ListenerFunction): void`

Removes a specific listener from a signal.

**Parameters:**
- `signalName` - The name of the signal
- `listener` - The listener function to remove

**Example:**
```typescript
const listener = (user) => console.log(`Welcome ${user.name}`);
controller.signal.on('userLoggedIn', listener);

// Later...
controller.signal.off('userLoggedIn', listener);
```

##### `createReadableStream<K extends keyof T>(signalName: K): ReadableStream<Parameters<T[K]>>`

Creates a ReadableStream that emits chunks when the signal is fired.

**Parameters:**
- `signalName` - The signal to listen to

**Returns:** A ReadableStream that emits signal arguments as chunks

**Example:**
```typescript
const stream = controller.signal.createReadableStream('dataUpdated');
const reader = stream.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  console.log('Data updated:', value[0]); // value[0] is the data argument
}
```

### SignalListenerOptions

Options for configuring signal listeners.

```typescript
interface SignalListenerOptions {
  once?: boolean;        // Remove listener after first emission
  signal?: AbortSignal;  // Remove listener when AbortSignal is aborted
}
```
