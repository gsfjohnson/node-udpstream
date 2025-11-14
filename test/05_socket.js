'use strict';

const Assert = require('assert');
const NodeDgram = require('node:dgram');

const Util = require('../util');
const Socket = require('../socket');

const sinon = require('sinon');
const Emitter = require('events');
//const { describe } = require('node:test');


describe('Socket', function()
{
  describe('new Socket()', function()
  {
    it('should check port', () =>
    {
      Assert.throws(() => {
        // eslint-disable-next-line no-new
        new Socket({
          remotePort: -1,
          remoteAddress: '127.0.0.1',
        });
      }, /Option `remotePort` should be a valid port\./);
    });

    it('should check address', () => {
      Assert.throws(() => {
        // eslint-disable-next-line no-new
        new Socket({
          remotePort: 100,
          remoteAddress: 'not.an.ip.addr',
        });
      }, /Option `remoteAddress` should be a valid ip address\./);
    });

    it('should check socket', () => {
      Assert.throws(() => {
        // eslint-disable-next-line no-new
        new Socket({
          remotePort: 100,
          remoteAddress: '127.0.0.1',
          socket: false,
        });
      }, /Option `socket` should be a valid dgram socket\./);
    });

    it('should check filter', () => {
      Assert.throws(() => {
        // eslint-disable-next-line no-new
        new Socket({
          remotePort: 100,
          remoteAddress: '127.0.0.1',
          socket: NodeDgram.createSocket('udp4'),
          messagesFilter: true,
        });
      }, /Option `messagesFilter` should be a function\./);
    });
  });

  describe('what', function()
  {
    let isDgramSocket;

    before(function() {
      isDgramSocket = Util.isDgramSocket;
      Util.isDgramSocket = function() { return true };
    });
    after(function() {
      Util.isDgramSocket = isDgramSocket;
    });

    it('should read', () => {
      const mockDgramSock = Object.assign(new Emitter(), {
        //send: sinon.spy(),
        //close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mockDgramSock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
      });

      const invalidMessage = Buffer.from('invalid');
      const validMessage = Buffer.from('valid');

      //socket.push = sinon.spy(() => true);
      let success = false;
      //socket.on('data', (chunk) => {
      //  console.log('data:',chunk);
      //  if (chunk === validMessage) success = true;
      //});

      mockDgramSock.emit('message', invalidMessage, { address: '127.0.0.2', port: 1111 });
      if ( socket.read() === validMessage ) success = true;

      mockDgramSock.emit('message', invalidMessage, { address: '127.0.0.1', port: 2222 });
      if ( socket.read() === validMessage ) success = true;

      mockDgramSock.emit('message', validMessage, { address: '127.0.0.1', port: 1111 });
      if ( socket.read() === validMessage ) success = true;

      //Assert.equal(socket.push.callCount, 1);
      Assert.equal(success,true);
    });

    it('should not read after close', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
      });

      const message = Buffer.from('valid');
      const rinfo = {
        address: '127.0.0.1',
        port: 1111,
      };

      socket.push = sinon.spy(() => true);
      socket.close();

      mock.emit('message', message, rinfo);
      Assert(!socket.push.calledWith(message));
    });

    it('should send messages', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const remotePort = 1111;
      const remoteAddress = '127.0.0.1';

      const socket = new Socket({
        socket: mock,
        remotePort,
        remoteAddress,
      });

      const message = Buffer.from('valid');
      socket.write(message);

      Assert.equal(mock.send.callCount, 1);
      const lastcall = mock.send.lastCall.args;

      Assert.equal(lastcall[0], message);
      Assert.equal(lastcall[1], remotePort);
      Assert.equal(lastcall[2], remoteAddress);
    });

    it('should not send messages after close', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const remotePort = 1111;
      const remoteAddress = '127.0.0.1';

      const socket = new Socket({
        socket: mock,
        remotePort,
        remoteAddress,
      });

      const message = Buffer.from('valid');
      const callback = sinon.spy();

      socket.close();

      // eslint-disable-next-line no-underscore-dangle
      socket._write(message, 'buffer', callback);
      Assert(callback.calledWith(sinon.match.instanceOf(Error)));
      Assert.equal(mock.send.callCount, 0);
    });

    it('should close', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
      });

      socket.push = sinon.spy(() => true);
      socket.end = sinon.spy();

      socket.close();

      Assert.equal(socket.push.callCount, 1);
      Assert(socket.push.calledWith(null));

      Assert.equal(socket.end.callCount, 1);
      Assert.equal(mock.close.callCount, 1);
    });

    it('should close when dgram socket is closed', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
      });

      socket.push = sinon.spy(() => true);
      socket.end = sinon.spy();

      mock.emit('close');

      Assert.equal(socket.push.callCount, 1);
      Assert(socket.push.calledWith(null));

      Assert.equal(socket.end.callCount, 1);
      Assert.equal(mock.close.callCount, 0);
    });

    it('should not close the socket then `closeTransport = false`', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
        closeTransport: false,
      });

      socket.push = sinon.spy(() => true);
      socket.end = sinon.spy();

      socket.close();

      Assert.equal(socket.push.callCount, 1);
      Assert(socket.push.calledWith(null));

      Assert.equal(socket.end.callCount, 1);
      Assert.equal(mock.close.callCount, 0);
    });

    it('should close the socket then `closeTransport = true`', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
        closeTransport: true,
      });

      socket.push = sinon.spy(() => true);
      socket.end = sinon.spy();

      socket.close();

      Assert.equal(socket.push.callCount, 1);
      Assert(socket.push.calledWith(null));

      Assert.equal(socket.end.callCount, 1);
      Assert.equal(mock.close.callCount, 1);
    });

    it('destroy', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
      });

      socket.push = sinon.spy(() => true);
      socket.end = sinon.spy();

      socket.destroy();

      Assert.equal(socket.push.callCount, 1);
      Assert(socket.push.lastCall.calledWith(null));

      Assert.equal(socket.end.callCount, 1);
      Assert.equal(mock.close.callCount, 1);
    });

    it('address', () => {
      const address = '127.0.0.2';
      const port = 2222;

      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
        address: sinon.stub().returns({ address, port }),
      });

      const remotePort = 1111;
      const remoteAddress = '127.0.0.1';

      const socket = new Socket({
        socket: mock,
        remotePort,
        remoteAddress,
      });

      Assert.equal(socket.remotePort, remotePort);
      Assert.equal(socket.remoteAddress, remoteAddress);
      Assert.equal(socket.localPort, port);
      Assert.equal(socket.localAddress, address);
    });

    it('process() should work', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
      });

      socket.push = sinon.spy(() => true);
      const message = Buffer.from('valid');

      Assert.equal(socket.process(message), true);

      Assert.equal(socket.push.callCount, 1);
      Assert(socket.push.lastCall.calledWith(message));
    });

    it('.process({}) should not work', () => {
      const mock = Object.assign(new Emitter(), {
        send: sinon.spy(),
        close: sinon.spy(),
      });

      const socket = new Socket({
        socket: mock,
        remotePort: 1111,
        remoteAddress: '127.0.0.1',
      });

      const message = Buffer.from('valid');

      Assert.equal(socket.process({}), false);

      socket.close();
      Assert.equal(socket.process(message), false);
    });

  });

});