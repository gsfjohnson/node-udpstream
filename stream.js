'use strict';

// socket.js
// from npm:unicast

const NodeDgram = require('node:dgram');
const NodeStream = require('node:stream');
const NodeNet = require('node:net');
const NodeUtil = require('node:util');

const Packet = require('./packet');
const Util = require('./util');

const _udpsock = Symbol('_udpsock');
const _connected = Symbol('_connected');
const _closed = Symbol('_closed');
const _objectmode = Symbol('_objectmode');
const _ra = Symbol('_remoteAddress');
const _rp = Symbol('_remotePort');
const _parent = Symbol('_parent');
const _listen = Symbol('_listen');
const _writable_closed = Symbol('_writableClosed');
const _readable_closed = Symbol('_readableClosed');
const _bound = Symbol('_bound');
const _overloadBuffer = Symbol('_overloadBuffer');
const _on_message = Symbol('_on_message');
const _filter = Symbol('_filter');
const pCloseTransport = Symbol('closeTransport');

// debug if appropriate
let debug; try { debug = require('debug')('udpstream'); }
catch (e) { debug = function(){}; debug.inactive = true } // empty stub

const isFunc = f => typeof f == 'function';
const throwTypeError = text => { throw new TypeError(text) };

const defaultOptions = {
  decodeStrings: true,
};

/**
 * This class implements stream-based dgram socket.
 */
class UdpStream extends NodeStream.Duplex
{
  /**
   * @class
   * @param {Object} options
   * @param {string} options.remoteAddress
   * @param {number} options.remotePort
   * @param {dgram.Socket} options.socket
   * @param {boolean} [options.objectMode]
   * @param {boolean} [options.closeTransport]
   * @param {Function} [options.messagesFilter]
   */
  constructor(options = {})
  {
    debug('constructor()',options);
    super(Object.assign({}, options, defaultOptions));

    if (options.parent) return;

    const { objectMode, remoteAddress, remotePort, socket, messagesFilter, closeTransport, overloadBuffer } = options;

    if (Util.isrinfo(options.rinfo)) { remoteAddress = options.rinfo.address; remotePort = options.rinfo.port }
    if (remoteAddress) this.remoteAddress = remoteAddress;
    if (remotePort) this.remotePort = remotePort;

    //if (socket && !Util.isDgramSocket(socket)) throw new Error('invalid options.socket: '+socket);
    if (socket && !Util.isObject(socket)) throw new Error('Invalid `socket` option, must be Datagram object: '+socket);

    this[_udpsock] = socket ? socket : NodeDgram.createSocket(options.type || 'udp4');
    this[_closed] = false;
    this[_writable_closed] = false;
    this[_readable_closed] = false;
    this[_bound] = false;
    this[_filter] = messagesFilter || filter;

    if (objectMode) this[_objectmode] = true;
    if (overloadBuffer) this[_overloadBuffer] = true;

    if (typeof this[_filter] !== 'function') {
      throw new TypeError('Option `messagesFilter` should be a function.');
    }

    this[_udpsock].on('message', this[_on_message].bind(this) );
    this[_udpsock].once('close', this.close.bind(this) );
    this.once('finish', () => { this[_writable_closed] = true; });

    this[pCloseTransport] = Util.isBoolean(closeTransport) ? closeTransport : true;
  }

  [_on_message](message,rinfo)
  {
    debug('[_on_message]()');

    if (!this[_filter](this, message, rinfo))
    {
      debug('-- message DID NOT pass filter, dropping:',message,rinfo);
      return;
    }
    debug('-- message passed filter:',message,rinfo);

    if (this[_objectmode]) message = new Packet(message,rinfo);
    else if (this[_overloadBuffer] && Buffer.isBuffer(message)) {
      message.port = rinfo.port;
      message.address = rinfo.address;
    }

    this.process(message,rinfo);
  }

  //[_listen](data,rinfo) {
  //  debug('_listen(): return true');
  //  return true; // create connections by default
  //}

  /**
   * @returns {Boolean}
   */
  get overloadBuffer() {
    return this[_overloadBuffer] ? true : false;
  }

  /**
   * @param {Boolean} value
   */
  set overloadBuffer(value) {
    if (value === undefined || value === null) {} // okay
    else if (typeof value == 'number') {} // okay
    else if (typeof value == 'boolean') {} // okay
    else throw new TypeError('`overloadBuffer` property must be boolean: '+value);
    this[_overloadBuffer] = value ? true : false;
  }

  /**
   * @returns {string}
   */
  get remoteAddress() {
    return this[_ra];
  }

  /**
   * @param {string} address
   */
  set remoteAddress(address) {
    if (!NodeNet.isIP(address)) throw new Error('Option `remoteAddress` should be a valid ip address.');
    debug('set remoteAddress:',address);
    this[_ra] = address;
  }

  /**
   * @returns {number}
   */
  get remotePort() {
    return this[_rp];
  }

  /**
   * @param {number} port
   */
  set remotePort(port) {
    if (!Util.isPort(port)) throw new Error('Option `remotePort` should be a valid port.');
    debug('set remotePort:',port);
    this[_rp] = port;
  }

  /**
   * @returns {string}
   */
  get localAddress() {
    return this[_udpsock].address().address;
  }

  /**
   * @returns {number}
   */
  get localPort() {
    return this[_udpsock].address().port;
  }

  /**
   * @private
   */
  _read() {} // eslint-disable-line class-methods-use-this

  /**
   * @private
   * @param {Buffer} chunk
   * @param {string} encoding
   * @param {Function} callback
   */
  _write(chunk, encoding, cb)
  {
    debug('_write()',chunk);

    const err = function(e) { debug('error:',e.message); cb(e); }

    if (this[_writable_closed]) { err(new Error('Write after free.')); return; }

    const connected = this[_connected];
    let remotePort, remoteAddress, buffer;

    // de-encapsulate buffer out of Packet
    if (this[_objectmode]) {
      if (!Packet.isPacket(chunk)) { err(new Error('chunk is not Packet object')); return; }
      buffer = chunk.buffer;
      remotePort = chunk.port;
      remoteAddress = chunk.address;
    }
    // allow Buffer objects to be overload with port/address properties
    else if (this[_overloadBuffer]) {
      if (!Buffer.isBuffer(chunk)) { err(new Error('chunk is not Buffer object')); return; }
      buffer = chunk;
      remotePort = chunk.port;
      remoteAddress = chunk.address;
    }
    else if (Buffer.isBuffer(chunk)) {
      let { address, port } = chunk;
      buffer = chunk;
      if (port) remotePort = port;
      if (address) remoteAddress = address;
    }

    if (this[_connected]) {
      let [ address, port ] = this[_connected].split(':');
      if (!remoteAddress) remoteAddress = address;
      if (!remotePort) remotePort = parseInt(port);
    }

    if (!Buffer.isBuffer(buffer)) { err(new Error('data must be Buffer')); return; }
    if (!Util.isPort(remotePort)) { err(new Error('must provide remotePort: '+remotePort)); return; }
    if (!NodeNet.isIP(remoteAddress)) { err(new Error('most provide remoteAddress: '+remoteAddress)); return; }

    const params = [buffer];
    if (!connected && remotePort) params.push(remotePort);
    if (!connected && remoteAddress) params.push(remoteAddress);
    //if (cb) params.push(cb);

    // send it
    const onSent = function() {
      debug('sent',...params);
      if (cb) cb();
    };
    debug('sending',...params,onSent);
    this[_udpsock].send(...params,onSent);
  }

  /**
   * @private
   * @param {Error} error
   * @param {Function} callback
   */
  _destroy(error, callback)
  {
    debug('_destroy()');

    if (!this[_writable_closed]) {
      debug('-- writable.end()');
      this.end();
      this[_writable_closed] = true;
    }

    if (!this[_readable_closed]) {
      debug('-- readable.push(null)');
      this.push(null);
      this[_readable_closed] = true;
    }

    if (!this[_closed]) {
      debug('-- udpsocket.close()');
      this[_udpsock].close();
      this[_closed] = true;
    }

    callback(error);
  }

  /**
   * Handle incoming data from another source.
   * @param {Buffer} data
   * @returns {boolean}
   */
  process(data,rinfo)
  {
    debug('process()',data,rinfo);
    if (this[_readable_closed]) return false;
    if (this[_objectmode] && !Packet.isPacket(data)) throw new TypeError('first parameter must be Packet object');
    if (!this[_objectmode] && !Buffer.isBuffer(data)) throw new TypeError('first parameter must be buffer object');
    if (this[_listen] && !Util.isrinfo(rinfo)) throw new TypeError('second parameter must be rinfo object');
    //if (data === null) throw new TypeError('data cannot be null');

    if (this[_listen]) {
      const peer = rinfo.address+':'+rinfo.port;
      if (this.listenerCount(peer)) {
        debug('-- emit `'+peer+'`',data);
        this.emit(peer,data);
        return;
      }
      debug('-- no substream found');

      let result = isFunc(this[_listen]) ? this[_listen](data,rinfo) : false;

      if (result) { // create connection
        //debug('-- create substream:',peer);
        const { port, address } = rinfo;
        this.createConnection(port,address,data);
        return;
      }
    }

    debug('process() push',data);
    let out = this.push(data);
    if (!out) debug('-- return',out);
    return out;
  }

  /**
   * Close socket.
   */
  close()
  {
    debug('close()');

    if (!this[_closed] && this[pCloseTransport]) {
      debug('-- udpsocket.close()');
      this[_udpsock].close();
      this[_closed] = true;
    }

    if (!this[_writable_closed]) {
      debug('-- writable.end()');
      this.end();
      this[_writable_closed] = true;
    }

    if (!this[_readable_closed]) {
      debug('-- readable.push(null)');
      this.push(null);
      this[_readable_closed] = true;
    }
  }

  /**
   * Bind stream to a local address.
   * @param {Number} [port]
   * @param {String} [address]
   * @param {Function} [callback]
   * @returns {undefined}
   */
  bind(...arr)
  {
    debug('bind()',...arr);
    let { port, address, callback } = parseBindParameters(...arr);

    if (port === undefined) port = 0;
    if (callback) this.once('bind',callback);

    const onBound = function() {
      debug('bind() onBound()');
      const addr = this[_udpsock].address();
      this[_bound] = [addr.address,addr.port].join(':');
      debug('-- this[_bound] =',this[_bound]);
      debug('-- emit `bind`',addr);
      this.emit('bind',addr);
    }.bind(this);

    const params = [];
    if (typeof port == 'number') { params.push(port); } //this.remotePort = port; }
    if (typeof address == 'string') { params.push(address); } //this.remoteAddress = address; }

    debug(...params);
    this[_udpsock].bind(...params, onBound);
  }

  /**
   * Connect stream to a specific remote address.
   * @param {Number} port
   * @param {String} [address]
   * @param {Function} [callback]
   * @returns {undefined}
   */
  connect(...arr)
  {
    let { port, address, callback } = parseConnectParameters(...arr);
    debug('connect()',port,address,callback);

    const udpsock = this[_udpsock];
    if (!address) address = '127.0.0.1';

    const stage2 = function() {
      udpsock.connect(...connectParams,(err) => {
        if (err) throw err;
        debug('-- socket connected',port,address);
        this[_connected] = [address,port].join(':');
        debug('-- this[_connected] =',this[_connected]);
        if (callback) callback();
      });
    }

    const connectParams = [];
    if (port) { connectParams.push(port); this.remotePort = port; }
    if (address) { connectParams.push(address); this.remoteAddress = address; }

    const bindParams = [];
    if (address == '127.0.0.1') bindParams.push(address);

    if (!this[_bound]) this.bind(...bindParams,stage2);
    else stage2();

    return this;
  }

  /**
   * Listen for packets on address, emit connect.
   * @param {Number} [port]
   * @param {String} [address]
   * @param {Function} [onListen]
   * @param {Function} [onMessage]
   * @returns {undefined}
   */
  listen(...arr)
  {
    let { port, address, callback, arbiter } = parseListenParameters(...arr);
    debug('listen()',port,address,callback,arbiter);

    if (callback) {
      //debug('on `listen`',callback);
      this.once('listen',callback);
    }

    const onBound = function(addr) {
      debug('listen() onBound()',addr);
      if (arbiter) this[_listen] = arbiter;
      else this[_listen] = true;
      debug('-- this[_listen] =',this[_listen]);
      debug('-- emit `listen`',addr);
      this.emit('listen',addr);
    }.bind(this);

    const params = [];
    if (port) { params.push(port); } //this.remotePort = port; }
    if (address) { params.push(address); } //this.remoteAddress = address; }

    this.bind(...params, onBound);
  }

  createConnection(port,address,message)
  {
    if (!this[_listen]) throw new Error('not listening -- unable to create connection');
    if (!Util.isPort(port)) throw new Error('invalid port: '+port);
    if (!NodeNet.isIP(address)) throw new Error('invalid address: '+address);

    const rinfo = { port, address };
    const slaveParams = { parent: this, rinfo };
    if (this[_objectmode]) slaveParams.objectMode = true;
    if (this[_overloadBuffer]) slaveParams.overloadBuffer = true;

    const connection = new UdpStreamSlave(slaveParams)

    debug('-- emit `connection`',connection);
    this.emit('connection',connection);

    process.nextTick(() => connection.process(message,rinfo) );

    return connection;
  }

  /**
   * Create new UdpStream.
   * @param {Object} [options]
   * @returns {UdpStream}
   */
  static create(options = {}) {
    if (typeof options == 'string') options = { type: options };
    if (Util.isDgramSocket(options)) options = { socket: options };
    if (!Util.isObject(options)) options = {};

    return new UdpStream(Object.assign({}, options));
  }

  /**
   * Create new UdpStream and connect.
   * @param {Object} [options]
   * @returns {UdpStream}
   */
  static connect(...arr)
  {
    const { port, address, callback, options } = parseStaticConnectParameters(...arr);

    const udpstream = UdpStream.create(options);

    const params = [port];
    if (address) params.push(address);
    if (callback) params.push(callback);

    return udpstream.connect(...params);
  }

  /**
   * Create new UdpPacket.
   * @param {Buffer} buffer
   * @param {Number} [port]
   * @param {String} [address]
   * @returns {UdpPacket}
   */
  static createPacket(...arr) {
    return new Packet(...arr);
  }

  [NodeUtil.inspect.custom](depth, options, inspect) {
    const arr = [this.constructor.name];
    if (this[_listen]) arr.push('L');
    if (this[_bound]) arr.push(this[_bound]);
    else arr.push('not bound');
    return '['+ arr.join(' ') +']';
  }
}

// debug if appropriate
let rebug; try { rebug = require('debug')('udpstream:sub'); }
catch (e) { rebug = function(){} } // empty stub

/**
 * This class implements sub (slave) stream of the UdpStream.
 */
class UdpStreamSlave extends UdpStream
{
  /**
   * @class
   * @param {Object} options
   * @param {string} options.remoteAddress
   * @param {number} options.remotePort
   * @param {boolean} [options.objectMode]
   * @param {boolean} [options.closeTransport]
   */
  constructor(options = {})
  {
    rebug('constructor()',options);

    const { parent, objectMode, closeTransport, overloadBuffer } = options;

    if (!parent) throw new TypeError('missing `parent` option: '+parent);
    if (!Util.isObject(parent)) throw new TypeError('invalid `parent` option: '+parent);
    if (parent?.constructor?.name != 'UdpStream') throw new TypeError('`parent` option must be UdpStream object: '+parent.constructor.name);

    super({ ...options, slave: true });

    let { remoteAddress, remotePort } = options;
    if (Util.isrinfo(options.rinfo)) { remoteAddress = options.rinfo.address; remotePort = options.rinfo.port }
    this.remoteAddress = remoteAddress || throwTypeError('missing remoteAddress');
    this.remotePort = remotePort || throwTypeError('missing remotePort');

    this[_parent] = parent;
    this[_closed] = false;
    this[_writable_closed] = false;
    this[_readable_closed] = false;

    if (objectMode) this[_objectmode] = objectMode;
    if (overloadBuffer) this[_overloadBuffer] = true;

    const peer = [remoteAddress,remotePort].join(':');
    rebug('peer:',peer);

    this[_parent].on(peer, this.process.bind(this) );
    this[_parent].once('close', this.close.bind(this) );
    this.once('finish', () => { this[_writable_closed] = true; });

    this[pCloseTransport] = Util.isBoolean(closeTransport) ? closeTransport : true;
  }

  /**
   * @returns {string}
   */
  get remoteAddress() {
    return this[_ra];
  }

  /**
   * @param {string} address
   */
  set remoteAddress(address) {
    if (!NodeNet.isIP(address)) throw new Error('Option `remoteAddress` should be a valid ip address.');
    rebug('set remoteAddress:',address);
    this[_ra] = address;
  }

  /**
   * @returns {number}
   */
  get remotePort() {
    return this[_rp];
  }

  /**
   * @param {number} port
   */
  set remotePort(port) {
    if (!Util.isPort(port)) throw new Error('Option `remotePort` should be a valid port.');
    rebug('set remotePort:',port);
    this[_rp] = port;
  }

  /**
   * @returns {string}
   */
  get localAddress() {
    return this[_parent].localAddress;
  }

  /**
   * @returns {number}
   */
  get localPort() {
    return this[_parent].localPort;
  }

  /**
   * @private
   */
  _read() {} // eslint-disable-line class-methods-use-this

  /**
   * @private
   * @param {Buffer} chunk
   * @param {string} encoding
   * @param {Function} callback
   */
  _write(chunk, encoding, cb)
  {
    rebug('_write()',chunk);
    if (this[_writable_closed]) { cb(new Error('Write after free.')); return; }

    if (this[_objectmode]) {
      if (!Packet.isPacket(data)) throw new TypeError('_write: only accepts Packet{} objects');
    }
    else if (this[_overloadBuffer]) {
      if (!Buffer.isBuffer(chunk)) throw new TypeError('_write: only accepts Buffer objects');
    }
    else if (!Buffer.isBuffer(chunk)) throw new Error('_write: UdpStreamSlave requires buffer');

    chunk.port = this[_rp];
    chunk.address = this[_ra];

    rebug('parent.write:',chunk,encoding,cb);
    this[_parent].write(chunk,encoding,cb);
  }

  /**
   * @private
   * @param {Error} error
   * @param {Function} callback
   */
  _destroy(error, callback)
  {
    rebug('_destroy()');

    if (!this[_writable_closed]) {
      rebug('-- writable.end()');
      this.end();
      this[_writable_closed] = true;
    }

    if (!this[_readable_closed]) {
      rebug('-- readable.push(null)');
      this.push(null);
      this[_readable_closed] = true;
    }

    if (!this[_closed]) {
      let peer = [this[_ra],this[_rp]].join(':');
      rebug('-- disconnecting from event:',peer);
      this[_parent].off(peer,this.process);
      this[_parent] = undefined;
      this[_closed] = true;
    }

    callback(error);
  }

  /**
   * Handle incoming data from another source.
   * @param {Buffer} data
   * @returns {boolean}
   */
  process(data,rinfo)
  {
    rebug('process()');
    if (data) rebug('-- data:',data);
    if (rinfo) rebug('-- rinfo:',rinfo);
    if (this[_readable_closed]) return false;
    if (this[_objectmode] && !Packet.isPacket(data)) throw new TypeError('first parameter must be Packet object');
    if (!this[_objectmode] && !Buffer.isBuffer(data)) throw new TypeError('first parameter must be buffer object');
    //if (this[_listen] && !Util.isrinfo(rinfo)) throw new TypeError('second parameter must be rinfo object');
    //if (data === null) throw new TypeError('data cannot be null');

    rebug('-- push data');
    this.push(data);
    return true;
  }

  /**
   * Close socket.
   */
  close()
  {
    rebug('close()');

    if (!this[_closed] && this[pCloseTransport]) {
      let peer = [this[_ra],this[_rp]].join(':');
      rebug('-- disconnecting from event:',peer);
      this[_parent].off(peer,this.process);
      this[_parent] = undefined;
      this[_closed] = true;
    }

    if (!this[_writable_closed]) {
      rebug('-- writable.end()');
      this.end();
      this[_writable_closed] = true;
    }

    if (!this[_readable_closed]) {
      rebug('-- readable.push(null)');
      this.push(null);
      this[_readable_closed] = true;
    }
  }

  bind() { throw new Error('UdpStreamSlave cannot bind()') }
  connect() { throw new Error('UdpStreamSlave cannot connect()') }
  listen() { throw new Error('UdpStreamSlave cannot listen()') }
  createConnection() { throw new Error('UdpStreamSlave cannot createConnection()') }
  static create() { throw new Error('UdpStreamSlave cannot create()') }

  [NodeUtil.inspect.custom](depth, options, inspect) {
    return '['+this.constructor.name+']';
  }
}

/**
 * Default filter for incoming messages.
 * @param {UdpStream} stream
 * @param {Buffer} message
 * @param {{address: string, port: number}} rinfo
 * @returns {bool}
 */
function filter(stream, message, rinfo) {
  return true;
  const isAllowedAddress = stream.remoteAddress === rinfo.address;
  const isAllowedPort = stream.remotePort === rinfo.port;

  return isAllowedAddress && isAllowedPort;
}

function parseListenParameters(...arr)
{
  let port, address, callback, arbiter;
  arr.forEach( (el) => {
    if (Util.isPort(el)) port = el;
    else if (NodeNet.isIP(el)) address = el;
    else if (!callback && typeof el == 'function') callback = el;
    else if (!arbiter && typeof el == 'function') arbiter = el;
  });
  return { port, address, callback, arbiter };
}

function parseConnectParameters(...arr)
{
  let port, address, callback;
  arr.forEach( (el) => {
    if (Util.isPort(el)) port = el;
    else if (NodeNet.isIP(el)) address = el;
    else if (typeof el == 'function') callback = el;
  });
  if (!port) throw new TypeError('Must specify port > 0 and < 65536.  Received: '+port);
  return { port, address, callback };
}

function parseBindParameters(...arr)
{
  let port, address, callback;
  arr.forEach( (el) => {
    if (Util.isPort(el)) port = el;
    else if (NodeNet.isIP(el)) address = el;
    else if (!callback && typeof el == 'function') callback = el;
  });
  return { port, address, callback };
}

function parseStaticConnectParameters(...arr)
{
  let port, address, callback, options = {};
  arr.forEach( (el) => {
    if (Util.isPort(el)) options.port = el;
    else if (NodeNet.isIP(el)) options.address = el;
    else if (['udp4','udp6'].includes(el)) options.type = el;
    else if (typeof el == 'function') options.onConnect = el;
    else if (typeof el == 'object' && el !== null && !Array.isArray(el))
      Object.assign(options,el);
    else throw new TypeError('invalid parameter: '+ el);
  });
  if (options.port) { port = options.port; delete options.port; }
  if (options.address) { address = options.address; delete options.address; }
  if (options.onConnect) { callback = options.onConnect; delete options.onConnect; }
  rebug({ port, address, callback, options });
  return { port, address, callback, options };
}

module.exports = {
  UdpStream,
  UdpStreamSlave,
};
