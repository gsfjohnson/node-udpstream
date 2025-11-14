'use strict';

// packet.js

const NodeNet = require('node:net');

const Util = require('./util');

const _buffer = Symbol('buffer');
const _rinfo = Symbol('rinfo');

class Packet
{
  constructor(...arr)
  {
    let buffer, port, address;
    let el; while (el = arr.shift()) {
      if (Buffer.isBuffer(el)) { this.buffer = el; continue; }
      if (Util.isrinfo(el)) { this.port = el.port; this.address = el.address; continue; }
      if (Util.isPort(el)) { this.port = el; continue; }
      if (NodeNet.isIP(el)) { this.address = el; continue; }
    }
    //if (!Buffer.isBuffer(buffer)) throw new TypeError('parameter buffer must be buffer');
    //if (!Util.isrinfo(rinfo)) throw new TypeError('parameter rinfo must be rinfo object');

    //this.buffer = buffer;
    //if (rinfo) this.rinfo = rinfo;
  }

  /*
  get buffer() {
    return this[_buffer];
  }

  set buffer(obj) {
    if (!Buffer.isBuffer(obj)) throw new TypeError('parameter buffer must be buffer');
    this[_buffer] = obj;
  }

  get rinfo() {
    return this[_rinfo];
  }

  set rinfo(obj) {
    if (!Util.isrinfo(obj)) throw new TypeError('parameter rinfo must be rinfo object');
    this[_rinfo] = obj;
  }
  */

  static isPacket(val) {
    return val instanceof Packet;
  }
}

module.exports = Packet;
