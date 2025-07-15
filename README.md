# Signal Controller

A lightweight event emitter with separation of concerns between emitter and listener,
inspired by the `AbortController` interface.

> The term "signal", in the context of this library, is equivalent to "event".
> The lib is called `signal-controller` because `event-controller` was already taken.
> Both terms are used interchangeably here.

## Features

- **Separation of Concerns.** Separate interfaces for emitting events and listening to events.
- **Supports AbortSignal.** Remove event listeners using an `AbortSignal`.
- **TypeScript Support.**: Full TypeScript definitions with type safety.
- **Promise Support.**: Get a promise that resolves when the next event of a type is emitted.
- **Immediate Mode.**: In this optional mode, the event emitter automatically replays the last event it had emitted to
	new listenres when they start listening.
- **Stream Support.**: Convert events into streams: either pipe data from a `ReadableStream` into the
	`SignalController`, converting chunks into events; or create a `ReadableStream` that is fed by events from an
	`SignalEmitter`.
- **Lightweight.**: Just a single `.js` file. Zero dependencies.
- **Exceptions Handled.** Exceptions thrown by event listeners won't prevents other listeners from being called, and
	emitting events will never throw exceptions. You can listen to error thrown by listeners if you want.
- **Modern.**: TypeScript, AbortSignal, Promises, Streams, Async Iterators.

## Usage

```typescript
import { SignalController } from 'signal-controller';

// Define your event emitter interface (TypeScript only)
interface MySignals {
  userLoggedIn: (user: { id: string; name: string }) => void;
  dataUpdated: (data: any[]) => void;
  error: (error: Error) => void;
}

// Create a controller
const controller = new SignalController<MySignals>();

// Each controller instance has an `emitter` field that can be used to listen to events emitted by the controller.
// You expose only the `emitter` to clients interested in your events.
controller.emitter.on('userLoggedIn', (user) => { // `user` is of type `{ id: string; name: string }`
  console.log(`Welcome, ${user.name}!`);
});

controller.emitter.on('error', (error) => { // `error` is of type `Error`
  console.error('An error occurred:', error.message);
});

// Emit events
controller.emit('userLoggedIn', { id: '123', name: 'John Doe' }); // Arguments are type-checked
controller.emit('error', new Error('Something went wrong'));
```

## Installation

```bash
npm install signal-controller
```

## API Reference

See [api.md](./api.md) file.

## Advanced Usage

### Remove Listenres

Using an `AbortController`:

```typescript
const abortController = new AbortController();

{
	emitter.on('userLoggedIn', { signal: abortController.signal }, (user) => {
		console.log(`User ${user.name} logged in`);
	});

	emitter.on('error', { signal: abortController.signal }, (error) => {
		console.error('Error:', error.message);
	});
}

// Remove all listeners at once
abortController.abort();
```

Using `off()`:

```typescript
emitter.on('userLoggedIn', function onUserLoggedIn(user) {
  console.log(`User ${user.name} logged in`);
});

emitter.on('error', function onError(error) {
  console.error('Error:', error.message);
});

emitter.off(onUserLoggedIn);
emitter.off(onError);
```

### Streams

Convert signals to streams:

```typescript
signalController.emitter.createReadableStream('dataUpdated').pipeTo(sinkStream);

signalController.emit('dataUpdated', someData); // This event will pushed a chunk into the sink stream
```

```typescript
sourceStream.pipeTo(signalController.createWritableStream('dataUpdated'));

signalController.emitter.on('dataUpdated', (data) => {
	// Chunks of data produced by `sourceStream` will trigger this event
});
```

### Async Iterators

```typescript
// Transform events into an async iterator, transforms the data, then pipe into a sink stream.
emitter.iterate('dataUpdated')
	.map(data => JSON.stringify(data))
	.toStream()
	.pipeTo(sinkStream);
```

### Error Handling

Signal listeners that throw errors will have their errors logged to the console, but won't stop other listeners from executing:

```typescript
/// When a listener throws an exception...
controller.emitter.on('userLoggedIn', (user) => {
  throw new Error('This will be logged but won\'t stop other listeners');
});

// This listener from the controller is called
controller.onError = (errors, signalName, args) => {
	if (signalName === 'userLoggedIn') {
		const [user] = args;
		// `errors` is an array of the errors that had been thrown for each listener that threw
		for (const error of errors) {
			console.error(
				'A listener for the signal', signalName, 'threw this error:', error,
				'This happened when the signal was emitted with these arguments:', args,
			);
		}
	}
}
```

### Immediate Mode

When `immediate: true` is set, new listeners will immediately receive the last emitted arguments:

```typescript
const controller = new SignalController<MySignals>({ immediate: true });

// Emit a signal with no listeners
// The emitter will hold onto the last emitted data for each signal type
controller.emit('userLoggedIn', { id: '123', name: 'John' });

// Add a listener after the signal had been emitted
controller.emitter.on('userLoggedIn', (user) => {
  console.log(`Welcome back, ${user.name}!`); // Runs immediately
});
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
