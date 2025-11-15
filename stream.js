'use strict';

// socket.js
// from npm:unicast

const NodeDgram = require('node:dgram');
const NodeStream = require('node:stream');
const NodeNet = require('node:net');

const Packet = require('./packet');
const Util = require('./util');

const _udpsock = Symbol('_udpsock');
const _closed = Symbol('_closed');
const _objectmode = Symbol('_objectmode');
const _ra = Symbol('_remoteAddress');
const _rp = Symbol('_remotePort');
const _writable_closed = Symbol('_writableClosed');
const _readable_closed = Symbol('_readableClosed');
const _bound = Symbol('_bound');
const pCloseTransport = Symbol('closeTransport');

// debug if appropriate
let debug; try { debug = require('debug')('udpstream'); }
catch (e) { debug = function(){}; } // empty stub

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
    super(Object.assign({}, options, defaultOptions));

    const { objectMode, remoteAddress, remotePort, socket, messagesFilter, closeTransport } = options;

    if (!Util.isDgramSocket(socket)) throw new Error('Option `socket` should be a valid dgram socket.');
    if (remoteAddress) this.remoteAddress = remoteAddress;
    if (remotePort) this.remotePort = remotePort;

    this[_udpsock] = socket;
    this[_objectmode] = objectMode;
    this[_closed] = false;
    this[_writable_closed] = false;
    this[_readable_closed] = false;
    this[_bound] = false;

    const checkMessage = messagesFilter || filter;

    if (typeof checkMessage !== 'function') {
      throw new TypeError('Option `messagesFilter` should be a function.');
    }

    this[_udpsock].on('message', (message, rinfo) => {
      debug('message:',message,rinfo);
      if (checkMessage(this, message, rinfo)) {
        if (this[_objectmode]) message = new Packet(message,rinfo);
        this.process(message);
      }
    });

    this[_udpsock].once('close', () => {
      this[_closed] = true;
      this.close();
    });

    this.once('finish', () => {
      this[_writable_closed] = true;
    });

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
  _destroy(error, callback) {
    if (!this[_writable_closed]) {
      this.end();
      this[_writable_closed] = true;
    }

    if (!this[_readable_closed]) {
      this.push(null);
      this[_readable_closed] = true;
    }

    if (!this[_closed]) {
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
  process(data)
  {
    debug('process',data);
    if (this[_readable_closed]) return false;
    if (this[_objectmode] && !Packet.isPacket(data)) throw new TypeError('data must be Packet object');
    if (!this[_objectmode] && !Buffer.isBuffer(data)) throw new TypeError('data must be buffer object');
    //if (data === null) throw new TypeError('data cannot be null');

    this.push(data);
    return true;
  }

  /**
   * Close socket.
   */
  close() {
    if (!this[_closed] && this[pCloseTransport]) {
      this[_udpsock].close();
      this[_closed] = true;
    }

    if (!this[_writable_closed]) {
      this.end();
      this[_writable_closed] = true;
    }

    if (!this[_readable_closed]) {
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
    let port, address, cb;
    let el; while (el = arr.shift()) {
      if (Util.isPort(el)) port = el;
      else if (NodeNet.isIP(el)) address = el;
      else if (typeof el == 'function') cb = el;
    }
    const params = [];
    if (port) { params.push(port); } //this.remotePort = port; }
    if (address) { params.push(address); } //this.remoteAddress = address; }
    this[_udpsock].bind(...params,() => {
      const { port, address } = this[_udpsock].address();
      debug('bound',port,address);
      this[_bound] = true;
      if (cb) return cb();
    });
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
    let port, address, cb;
    let el; while (el = arr.shift()) {
      if (Util.isPort(el)) port = el;
      else if (NodeNet.isIP(el)) address = el;
      else if (typeof el == 'function') cb = el;
    }
    const params = [];
    if (port) { params.push(port); this.remotePort = port; }
    if (address) { params.push(address); this.remoteAddress = address; }
    //if (cb) params.push(cb);

    if (!this[_bound]) { this.bind(cb); return; }
    if (cb) { cb(); return; }
    return;

    this[_udpsock].connect(...params,(err) => {
      if (err) throw err;
      debug('socket connected');
      if (cb) return cb();
    });
  }

  /**
   * Create a new UDP socket.
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

  static createPacket(...arr) { return new Packet(...arr) }
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
