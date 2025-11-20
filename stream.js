'use strict';

// socket.js
// from npm:unicast

const NodeDgram = require('node:dgram');
const NodeStream = require('node:stream');
const NodeNet = require('node:net');
const NodeUtil = require('node:util');

const UdpStreamSub = require('./substream');
const Packet = require('./packet');
const Util = require('./util');

const _udpsock = Symbol('_udpsock');
const _closed = Symbol('_closed');
const _objectmode = Symbol('_objectmode');
const _ra = Symbol('_remoteAddress');
const _rp = Symbol('_remotePort');
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

    const { objectMode, remoteAddress, remotePort, socket, messagesFilter, closeTransport, overloadBuffer } = options;

    if (Util.isrinfo(options.rinfo)) { remoteAddress = options.rinfo.address; remotePort = options.rinfo.port }
    if (remoteAddress) this.remoteAddress = remoteAddress;
    if (remotePort) this.remotePort = remotePort;

    if (!Util.isDgramSocket(socket)) throw new Error('Option `socket` should be a valid dgram socket.');

    this[_udpsock] = socket;
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

  [_listen](data,rinfo) {
    debug('_listen(): return true');
    return true; // create connections by default
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
    if (this[_writable_closed]) { cb(new Error('Write after free.')); return; }

    let remotePort = this[_rp];
    let remoteAddress = this[_ra];
    let buffer = chunk;

    // de-encapsulate buffer out of Packet
    if (this[_objectmode]) {
      if (!Packet.isPacket(chunk)) { cb(new Error('chunk is not Packet object')); return; }
      buffer = chunk.buffer;
      if (chunk.port) remotePort = chunk.port;
      if (chunk.address) remoteAddress = chunk.address;
    }
    // allow Buffer objects to be overload with port/address properties
    else if (this[_overloadBuffer] && Buffer.isBuffer(chunk)) {
      if (chunk.port) remotePort = chunk.port;
      if (chunk.address) remoteAddress = chunk.address;
    }
    if (!Buffer.isBuffer(buffer)) { cb(new Error('chunk is not a Buffer object')); return; }
    if (!Util.isPort(remotePort)) { cb(new Error('must provide remotePort: '+remotePort)); return; }
    //if (!NodeNet.isIP(remoteAddress)) { cb(new Error('most provide remoteAddress')); return; }

    const params = [buffer];
    if (remotePort) params.push(remotePort);
    if (remoteAddress) params.push(remoteAddress);
    //if (cb) params.push(cb);

    // send it
    debug('sending',...params);
    this[_udpsock].send(...params,() => {
      debug('sent',...params);
      if (cb) cb();
    });
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
    debug('process()');
    if (data) debug('-- data:',data);
    if (rinfo) debug('-- rinfo:',rinfo);
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
    let { port, address, onBind } = Util.parseBindParameters(...arr);

    if (onBind) this.once('bind',onBind);

    const onBound = function() {
      debug('bind() onBind()');
      const addr = this[_udpsock].address();
      debug('-- success:',addr);
      this[_bound] = true;
      debug('-- this[_bound] = true');
      debug('-- emit `bind`');
      this.emit('bind');
    }.bind(this);

    const params = [];
    if (port) { params.push(port); } //this.remotePort = port; }
    if (address) { params.push(address); } //this.remoteAddress = address; }

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
    debug('connect()',...arr);
    let { port, address, onConnect } = Util.parseConnectParameters(...arr);

    const params = [];
    if (port) { params.push(port); this.remotePort = port; }
    if (address) { params.push(address); this.remoteAddress = address; }
    //if (cb) params.push(cb);

    if (!this[_bound]) this.bind(onConnect);
    else if (onConnect) onConnect();
    return;

    this[_udpsock].connect(...params,(err) => {
      if (err) throw err;
      debug('socket connected');
      if (cb) return cb();
    });
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
    debug('listen()',...arr);
    let { port, address, onListen, onMessage } = Util.parseListenParameters(...arr);

    if (onListen) this.once('listen',onListen);
    if (onMessage) this[_listen] = onMessage;
    else this[_listen] = function() { return true; } // create connection for every new unique address:port

    const onBound = function() {
      debug('listen() onBind()');
      debug('-- this[_listen] =',this[_listen]);
      debug('-- emit `listen`');
      this.emit('listen');
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
    const params = { parent: this, rinfo };
    if (this[_objectmode]) params.objectMode = true;
    if (this[_overloadBuffer]) params.overloadBuffer = true;

    const connection = new UdpStreamSub(params)

    debug('-- emit `connection`',connection);
    this.emit('connection',connection);

    process.nextTick(() => connection.process(message,rinfo) );

    return connection;
  }

  /**
   * Create new UdpStream.
   * @param {dgram.Socket|string|Object} socket
   * @param {Object} [options]
   * @returns {UdpStream}
   */
  static create(options = {}) {
    if (typeof options == 'string') options = { type: options };
    if (Util.isDgramSocket(options)) options = { socket: options };
    if (!Util.isObject(options)) options = {};

    if (!Util.isDgramSocket(options.socket))
      options.socket = NodeDgram.createSocket(options.type || 'udp4');

    return new UdpStream(Object.assign({}, options));
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
    return '[UdpStream]';
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

module.exports = UdpStream;
