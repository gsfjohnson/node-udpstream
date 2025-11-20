'use strict';

// substream.js

const NodeStream = require('node:stream');
const NodeNet = require('node:net');
const NodeUtil = require('node:util');

const Packet = require('./packet');
const Util = require('./util');

const _closed = Symbol('_closed');
const _objectmode = Symbol('_objectmode');
const _ra = Symbol('_remoteAddress');
const _rp = Symbol('_remotePort');
const _writable_closed = Symbol('_writableClosed');
const _readable_closed = Symbol('_readableClosed');
const _overloadBuffer = Symbol('_overloadBuffer');
const _parent = Symbol('_parent');
const pCloseTransport = Symbol('closeTransport');

// debug if appropriate
let debug; try { debug = require('debug')('udpstream:sub'); }
catch (e) { debug = function(){}; debug.inactive = true } // empty stub

const defaultOptions = {
  decodeStrings: true,
};

function throwTypeError(text) { throw new TypeError(text) }

/**
 * This class implements sub (slave) stream of the UdpStream.
 */
class UdpStreamSub extends NodeStream.Duplex
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
    debug('constructor()',options);
    super(Object.assign({}, options, defaultOptions));

    const { parent, objectMode, closeTransport, overloadBuffer } = options;
    let { remoteAddress, remotePort } = options;

    if (Util.isrinfo(options.rinfo)) { remoteAddress = options.rinfo.address; remotePort = options.rinfo.port }
    this.remoteAddress = remoteAddress || throwTypeError('missing remoteAddress');
    this.remotePort = remotePort || throwTypeError('missing remotePort');

    if (parent?.constructor?.name != 'UdpStream') throw new TypeError('missing or invalid _parent: '+parent);

    this[_parent] = parent;
    this[_closed] = false;
    this[_writable_closed] = false;
    this[_readable_closed] = false;

    if (objectMode) this[_objectmode] = objectMode;
    if (overloadBuffer) this[_overloadBuffer] = true;

    const peer = [remoteAddress,remotePort].join(':');
    debug('peer:',peer);

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
    debug('_write()',chunk);
    if (this[_writable_closed]) { cb(new Error('Write after free.')); return; }

    debug('parent.write:',chunk,encoding,cb);
    this[_parent].write(chunk,encoding,cb);
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
      let peer = [this[_ra],this[_rp]].join(':');
      debug('-- disconnecting from event:',peer);
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
    debug('process()');
    if (data) debug('-- data:',data);
    if (rinfo) debug('-- rinfo:',rinfo);
    if (this[_readable_closed]) return false;
    if (this[_objectmode] && !Packet.isPacket(data)) throw new TypeError('first parameter must be Packet object');
    if (!this[_objectmode] && !Buffer.isBuffer(data)) throw new TypeError('first parameter must be buffer object');
    //if (this[_listen] && !Util.isrinfo(rinfo)) throw new TypeError('second parameter must be rinfo object');
    //if (data === null) throw new TypeError('data cannot be null');

    debug('-- push data');
    this.push(data);
    return true;
  }

  /**
   * Close socket.
   */
  close()
  {
    debug('close()');

    if (!this[_closed] && this[pCloseTransport]) {
      let peer = [this[_ra],this[_rp]].join(':');
      debug('-- disconnecting from event:',peer);
      this[_parent].off(peer,this.process);
      this[_parent] = undefined;
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

  [NodeUtil.inspect.custom](depth, options, inspect) {
    return '['+this.constructor.name+']';
  }
}

module.exports = UdpStreamSub;
