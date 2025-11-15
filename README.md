# UdpStream

UdpStream is a Node.js module that provides a stream-based interface for UDP (User Datagram Protocol) communication. It wraps Node's built-in `dgram` module to create duplex streams that can send and receive UDP packets, making it easier to integrate UDP networking into stream pipelines.

## Features

- Stream-based UDP communication using Node's `stream.Duplex`.
- Support for object mode with custom `Packet` object.
- Flexible filtering of incoming messages.
- Automatic handling of socket binding and connection.
- Compatible with IPv4 and IPv6.

## Installation

```bash
npm install @gsfjohnson/udpstream
```

## Usage

### Example: Basic

```javascript
const { UdpStream } = require('@gsfjohnson/udpstream');

// Create a UDP stream socket
const stream = UdpStream.create(); // udp4 default

// Bind to a local port
stream.bind(41234, () => {
  console.log('Bound to', stream.localAddress + ':' + stream.localPort);
});

// Connect to a remote address
stream.connect(41235, '127.0.0.1', () => {
  console.log('Connected to', stream.remoteAddress + ':' + stream.remotePort);
});

// Send data
stream.write(Buffer.from('Hello, UDP!'));

// Listen for incoming data
stream.on('data', (buffer) => {
  console.log('Received:', buffer);
});
```

### Example: ObjectMode

```javascript
const { UdpStream, createPacket } = require('@gsfjohnson/udpstream');

const stream = UdpStream.create({ objectMode: true });

stream.bind(() => {
  console.log('bound');
});

stream.on('data', (packet) => {
  console.log('Received packet:', packet);
});

// Send a custom packet
const packet = createPacket(Buffer.from('Hello, Object Mode!'), 41235, '127.0.0.1');
stream.write(packet);
```

## API

### UdpStream Class

Extends `stream.Duplex`.

#### Constructor Options

- `socket` (dgram.Socket): A valid dgram socket. If not provided, a new one is created.
- `remoteAddress` (string): Remote IP address.
- `remotePort` (number): Remote port.
- `objectMode` (boolean): If true, streams operate on `Packet` objects instead of buffers. Default: false.
- `closeTransport` (boolean): Whether to close the underlying socket on stream close. Default: true.
- `messagesFilter` (function): Function to filter incoming messages. Receives `(stream, message, rinfo)` and should return a boolean.

#### Properties

- `remoteAddress` (string): Gets or sets the remote address.
- `remotePort` (number): Gets or sets the remote port.
- `localAddress` (string): Gets the local address (read-only).
- `localPort` (number): Gets the local port (read-only).

#### Methods

- `bind([port], [address], [callback])`: Bind the stream to a local address. Parameters can be passed in any order.
- `connect(port, [address], [callback])`: Connect to a remote address. Parameters can be passed in any order.
- `process(data)`: Manually process incoming data (internal use).
- `close()`: Close the stream and optionally the underlying socket.

#### Static Methods

- `UdpStream.create(options)`: Create a new UdpStream instance. Options can include a socket, type ('udp4' or 'udp6'), etc.
- `UdpStream.createPacket(...args)`: Create a new Packet instance.

### Packet Class

Represents a UDP packet with buffer, address, and port.

#### Constructor

```javascript
new Packet(buffer, port, address)
// or
new Packet(buffer, rinfo)
// or
new Packet(buffer)
```

- `buffer` (Buffer): The packet data.
- `port` (number): The port.
- `address` (string): The IP address.
- `rinfo` (object): Remote info object with `port` and `address`.

#### Static Methods

- `Packet.isPacket(val)`: Check if a value is a Packet instance.

### Utility Functions

Exported as `UdpStreamUtil`, but typically used internally. Includes validation functions like `isDgramSocket`, `isPort`, `isIP`, etc.

### Exported Functions

- `createSocket(options)`: Alias for `UdpStream.create`.
- `createPacket(...args)`: Alias for `UdpStream.createPacket`.

## Events

UdpStream emits standard stream events like 'data', 'end', 'finish', 'error', plus 'close' when the underlying socket closes.

## License

This module is licensed under the MIT License.