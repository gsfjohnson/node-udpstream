'use strict';

const assert = require('assert');
const NodeDgram = require('node:dgram');
const NodeStream = require('node:stream');

const { UdpStream, UdpStreamSlave } = require('../stream'); // Adjust path if needed

describe('UdpStreamSlave', function()
{
  let parentStream, slaveStream, mockSocket;

  beforeEach(function() {
    // Create a mock socket with manual stubs
    mockSocket = {
      address: () => ({ address: '127.0.0.1', port: 12345 }),
      close: () => {},
      bind: () => {},
      on: () => {},
      once: () => {},
      off: () => {},
      send: () => {}
    };

    parentStream = new UdpStream({ socket: mockSocket });
    parentStream.remoteAddress = '127.0.0.1';
    parentStream.remotePort = 54321;
  });

  describe('Constructor', function()
  {
    it('should create a slave stream with valid options', function() {
      const options = {
        parent: parentStream,
        remoteAddress: '192.168.1.1',
        remotePort: 8080,
        objectMode: true,
        overloadBuffer: true
      };
      slaveStream = new UdpStreamSlave(options);

      assert.strictEqual(slaveStream.remoteAddress, '192.168.1.1');
      assert.strictEqual(slaveStream.remotePort, 8080);
      assert.strictEqual(slaveStream.readableObjectMode, true);
      assert.strictEqual(slaveStream.writableObjectMode, true);
      assert.strictEqual(slaveStream.overloadBuffer, true);
    });

    it('should throw error if parent is missing', function() {
      assert.throws(() => new UdpStreamSlave({ remoteAddress: '127.0.0.1', remotePort: 8080 }), TypeError);
    });

    it('should throw error if remoteAddress is invalid', function() {
      assert.throws(() => new UdpStreamSlave({ parent: parentStream, remoteAddress: 'invalid', remotePort: 8080 }), Error);
    });

    it('should throw error if remotePort is invalid', function() {
      assert.throws(() => new UdpStreamSlave({ parent: parentStream, remoteAddress: '127.0.0.1', remotePort: 'invalid' }), Error);
    });

    it('should listen to parent events for the peer', function() {
      let eventCalled = false;
      parentStream.on = (event, handler) => {
        if (event === '127.0.0.1:8080') eventCalled = true;
      };
      const options = { parent: parentStream, remoteAddress: '127.0.0.1', remotePort: 8080 };
      slaveStream = new UdpStreamSlave(options);

      assert.ok(eventCalled);
    });
  });

  describe('Properties', function()
  {
    beforeEach(function()
    {
      slaveStream = new UdpStreamSlave({
        parent: parentStream,
        remoteAddress: '192.168.1.1',
        remotePort: 8080
      });
    });

    it('should delegate localAddress to parent', function() {
      assert.strictEqual(slaveStream.localAddress, parentStream.localAddress);
    });

    it('should delegate localPort to parent', function() {
      assert.strictEqual(slaveStream.localPort, parentStream.localPort);
    });

    it('should get and set remoteAddress', function() {
      slaveStream.remoteAddress = '10.0.0.1';
      assert.strictEqual(slaveStream.remoteAddress, '10.0.0.1');
    });

    it('should get and set remotePort', function() {
      slaveStream.remotePort = 9090;
      assert.strictEqual(slaveStream.remotePort, 9090);
    });
  });

  describe('write', function()
  {
    let writeCalled, writeArgs;
    beforeEach(function()
    {
      slaveStream = new UdpStreamSlave({
        parent: parentStream,
        remoteAddress: '127.0.0.1',
        remotePort: 8080
      });
      writeCalled = false;
      writeArgs = [];
      parentStream.write = (chunk, encoding, cb) => {
        writeCalled = true;
        writeArgs = [chunk, encoding, cb];
        if (cb) cb();
      };
      slaveStream._write = slaveStream._write.bind(slaveStream); // Ensure context
    });

    it('should call parent.write with chunk', function(done)
    {
      const chunk = Buffer.from('test data');
      slaveStream._write(chunk, 'utf8', function(err) {
        assert.ok(!err);
        assert.ok(writeCalled);
        assert.deepStrictEqual(writeArgs[0], chunk);
        assert.strictEqual(writeArgs[1], 'utf8');
        done();
      });
    });

    it('should throw error if writable is closed', function(done)
    {
      slaveStream.end(); // Close writable
      const chunk = Buffer.from('test');
      slaveStream._write(chunk, 'utf8', function(err) {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Write after free.');
        done();
      });
    });
  });

  describe('read', function()
  {
    let pushCalled, pushData;

    beforeEach(function()
    {
      slaveStream = new UdpStreamSlave({
        parent: parentStream,
        remoteAddress: '127.0.0.1',
        remotePort: 8080
      });
      pushCalled = false;
      pushData = null;
      slaveStream.push = (data) => {
        pushCalled = true;
        pushData = data;
        return true;
      };
    });

    it('should push buffer data to stream', function() {
      const data = Buffer.from('incoming data');
      const rinfo = { address: '127.0.0.1', port: 8080 };
      slaveStream.process(data, rinfo);

      assert.ok(pushCalled);
      assert.deepStrictEqual(pushData, data);
    });

    it('should push Packet data in objectMode', function() {
      const slave = new UdpStreamSlave({
        parent: parentStream,
        remoteAddress: '127.0.0.1',
        remotePort: 8080,
        objectMode: true
      });
      let pushCalled = false;
      let pushData = null;
      slave.push = (data) => {
        pushCalled = true;
        pushData = data;
        return true;
      };
      const packet = UdpStream.createPacket( Buffer.from('packet data'), { port: 8080, address: '127.0.0.1' });
      slave.process(packet);

      assert.ok(pushCalled);
      assert.strictEqual(pushData, packet);
    });

    it('should throw error for invalid data type', function() {
      assert.throws(() => slaveStream.process('invalid'), TypeError);
    });

    it('should return false if readable is closed', function() {
      slaveStream.push(null); // Close readable
      const data = Buffer.from('data');
      const result = slaveStream.process(data);
      assert.strictEqual(result, false);
    });
  });

  describe('close', function()
  {
    let endCalled = false;
    let pushCalled = false;
    let pushData = null;

    beforeEach(function()
    {
      slaveStream = new UdpStreamSlave({
        parent: parentStream,
        remoteAddress: '127.0.0.1',
        remotePort: 8080
      });
      endCalled = false;
      pushCalled = false;
      pushData = null;
      slaveStream.end = () => { endCalled = true; };
      slaveStream.push = (data) => {
        pushCalled = true;
        pushData = data;
      };
    });

    it('should disconnect from parent event and close streams', function() {
      let offCalled = false;
      let offEvent = '';
      parentStream.off = (event) => {
        offCalled = true;
        offEvent = event;
      };
      slaveStream.close();

      assert.ok(offCalled);
      assert.strictEqual(offEvent, '127.0.0.1:8080');
      assert.ok(endCalled);
      assert.ok(pushCalled);
      assert.strictEqual(pushData, null);
    });
  });

  describe('Unsupported Methods', function() {
    beforeEach(function() {
      slaveStream = new UdpStreamSlave({
        parent: parentStream,
        remoteAddress: '127.0.0.1',
        remotePort: 8080
      });
    });

    it('should throw error for bind', function() {
      assert.throws(() => slaveStream.bind(), Error);
    });

    it('should throw error for connect', function() {
      assert.throws(() => slaveStream.connect(), Error);
    });

    it('should throw error for listen', function() {
      assert.throws(() => slaveStream.listen(), Error);
    });

    it('should throw error for createConnection', function() {
      assert.throws(() => slaveStream.createConnection(), Error);
    });

    it('should throw error for static create', function() {
      assert.throws(() => UdpStreamSlave.create(), Error);
    });
  });

  describe('_destroy', function()
  {
    let endCalled = false;
    let pushCalled = false;
    let pushData = null;

    beforeEach(function()
    {
      slaveStream = new UdpStreamSlave({
        parent: parentStream,
        remoteAddress: '127.0.0.1',
        remotePort: 8080
      });
      endCalled = false;
      pushCalled = false;
      pushData = null;
      slaveStream.end = () => { endCalled = true; };
      slaveStream.push = (data) => {
        pushCalled = true;
        pushData = data;
      };
    });

    it('should close writable and readable, and disconnect from parent', function(done) {
      let offCalled = false;
      let offEvent = '';
      parentStream.off = (event) => {
        offCalled = true;
        offEvent = event;
      };
      slaveStream._destroy(null, function(err) {
        assert.strictEqual(err, null);
        assert.ok(endCalled);
        assert.ok(pushCalled);
        assert.strictEqual(pushData, null);
        assert.ok(offCalled);
        assert.strictEqual(offEvent, '127.0.0.1:8080');
        done();
      });
    });
  });
});