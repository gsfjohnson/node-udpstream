const Assert = require('assert');
const dgram = require('dgram');

const { UdpStream } = require('../stream');
const Util = require('../util');

describe('UdpStream', function()
{
  this.timeout(5000); // Increase timeout for network tests

  let socket1, socket2;
  let stream1, stream2;
  const success = {};

  beforeEach(function() {
    socket1 = dgram.createSocket('udp4');
    socket2 = dgram.createSocket('udp4');
  });

  afterEach(function() {
    if (stream1) stream1.destroy();
    if (stream2) stream2.destroy();
    //try { socket1.close() } catch (e) {} // ignore errors
    //try { socket2.close() } catch (e) {} // ignore errors
    socket1.unref();
    socket2.unref();
  });

  describe('constructor', function()
  {
    it('should create an instance', function()
    {
      stream1 = new UdpStream();
      success.constructed = true;
    });

    it('should create an instance with options.socket', function()
    {
      if (!success.constructed) this.skip();

      stream1 = new UdpStream({ socket: socket1 });

      success.constructed_socket = true;
    });

    it('should create an instance with options.objectMode', function()
    {
      if (!success.constructed) this.skip();

      stream1 = new UdpStream({ objectMode: true });
      Assert.strictEqual(stream1.writableObjectMode, true);
      Assert.strictEqual(stream1.readableObjectMode, true);

      success.constructed_objectmode = true;
    });

    it('should create an instance with options.overloadBuffer', function()
    {
      if (!success.constructed) this.skip();

      stream1 = new UdpStream({ overloadBuffer: true });
      Assert.strictEqual(stream1.overloadBuffer, true);

      success.constructed_overloadbuffer = true;
    });

    it('should create an instance with options.overloadBuffer', function()
    {
      if (!success.constructed) this.skip();

      const options = {
        socket: socket1,
        remoteAddress: '127.0.0.1',
        remotePort: 12345,
        //objectMode: false
      };
      stream1 = new UdpStream(options);
      Assert.strictEqual(stream1.remoteAddress, '127.0.0.1');
      Assert.strictEqual(stream1.remotePort, 12345);
      //Assert.strictEqual(stream1[_objectmode], undefined); // Not set

      success.constructed = true;
    });

    it('should throw on invalid socket', function() {
      Assert.throws(() => new UdpStream({ socket: {} }) );
    });

    /*
    it('should throw on invalid messagesFilter', function() {
      const options = { socket: socket1, messagesFilter: 'not a function' };
      Assert.throws(() => new UdpStream(options), TypeError);
    });
    */
  });

  describe('#bind()', function()
  {
    it('should bind to a port and emit bind event', function(done)
    {
      if (!success.constructed) this.skip();

      stream1 = new UdpStream({ socket: socket1 });
      stream1.once('bind', function() {
        Assert.equal(typeof stream1.localAddress, 'string');
        Assert.equal(typeof stream1.localPort, 'number');

        success.bound = true; done();
      });
      stream1.bind(); // Bind to random port
    });
  });

  describe('#connect()', function()
  {
    it('should connect to remote address and port', function(done)
    {
      if (!success.bound) this.skip();

      stream1 = new UdpStream({ socket: socket1 });
      stream1.connect(42623, '127.0.0.1', function() {
        Assert.strictEqual(stream1.remotePort, 42623);
        Assert.strictEqual(stream1.remoteAddress, '127.0.0.1');

        success.connect = true; done();
      });
    });
  });

  describe('#listen()', function()
  {
    it('should callback on success', function(done)
    {
      if (!success.connect) this.skip();

      stream1 = new UdpStream({ socket: socket1 });

      stream1.listen(0, function() {
        success.listen = true;
        done();
      });
    });

    it('should create connections on incoming data', function(done)
    {
      if (!success.listen) this.skip();

      stream1 = new UdpStream({ socket: socket1 });
      stream2 = new UdpStream({ socket: socket2 });

      let filtered;
      const filter = function(data,rinfo) {
        filtered = true;
        return true; // create connection
      }
      const onListen = function()
      {
        const port = stream1.localPort;
        stream1.on('connection', function(conn)
        {
          try {
            Assert.equal(filtered,true);
            Assert.equal(Util.isObject(conn),true);
            Assert.equal(conn.constructor.name,'UdpStreamSlave');
            success.connection = true; done();
          } catch(e) { done(e) }
          //finally { stream1.destroy() }
        });

        stream2.connect(port, '127.0.0.1', function() {
          stream2.write(Buffer.from('hello'));
        });
      };
      stream1.listen(0, onListen, filter);
    });
  });

  describe('data transmission', function()
  {
    it('should send and receive data', function(done)
    {
      if (!success.listen) this.skip();

      stream1 = new UdpStream({ socket: socket1 });
      stream2 = new UdpStream({ socket: socket2 });

      const onConnect = function() {
        stream2.write(Buffer.from('test message'));
      }
      const onListen = function() {
        let port = stream1.localPort;
        stream2.connect(port, '127.0.0.1', onConnect);
      }
      const onData = function(data)
      {
        Assert(Buffer.isBuffer(data));
        Assert.strictEqual(data.toString(), 'test message');

        success.data = true; done();
      }

      stream1.on('data', onData);
      stream1.listen(0, onListen);
    });
  });

  describe('#destroy()', function()
  {
    it('should close the stream and underlying socket', function(done)
    {
      if (!success.data) this.skip();

      stream1 = new UdpStream({ socket: socket1 });
      stream1.bind(0, function() {
        stream1.destroy();
        try {
          Assert.strictEqual(stream1.closed,true);
          done();
        } catch (e) { done(e) }
      });
    });
  });

  describe('static methods', function()
  {
    it('UdpStream.create() should create an instance', function()
    {
      if (!success.constructed) this.skip();
      const stream = UdpStream.create();
      Assert(stream instanceof UdpStream);
      stream.close();
    });

    it('UdpStream.connect() should create and connect', function(done)
    {
      if (!success.connect) this.skip();

      const port = 12345, address = '127.0.0.1';

      // XXX: Mock bind to avoid actual network
      const stream = UdpStream.connect(port, address);

      Assert(stream instanceof UdpStream);

      stream.once('bind', (addr) => {
        let err;
        try {
          //Assert.equal(addr.port, port);
          Assert.equal(addr.address, address);
          done();
        }
        catch (e) { done(e) }
        finally { stream.destroy(); } // unref udp socket
      });
    });

    it('UdpStream.createPacket() should create a packet', function()
    {
      //if (!success.connect) this.skip();
      const packet = UdpStream.createPacket(Buffer.from('test'), 12345, '127.0.0.1');
      Assert(packet.buffer.equals(Buffer.from('test')));
      Assert.strictEqual(packet.port, 12345);
      Assert.strictEqual(packet.address, '127.0.0.1');
    });
  });
});