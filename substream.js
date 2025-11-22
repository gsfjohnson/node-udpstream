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


module.exports = UdpStreamSub;
