'use strict';

// util.js
// from npm:unicast

const NodeDgram = require('node:dgram');
const NodeNet = require('node:net');

/**
 * Check if argument is a valid port.
 * @param {number} port
 * @returns {bool}
 */
function isPort(port) {
  if (!Number.isInteger(port)) {
    return false;
  }

  return port > 0 && port <= 0xffff;
}

/**
 * Check if an argument is a valid socket object.
 * @param {any} maybeSocket
 * @returns {bool}
 */
function isDgramSocket(maybeSocket) {
  return maybeSocket instanceof NodeDgram.Socket;
}

/**
 * Check if argument is boolean.
 * @param {any} flag
 * @returns {boolean}
 */
function isBoolean(flag) {
  return typeof flag === 'boolean';
}

/**
 * Check if argument is an Object.
 * @param {any} val
 * @returns {boolean}
 */
function isObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Check if argument is rinfo object.
 * @param {any} val
 * @returns {boolean}
 */
function isrinfo(val) {
  return isObject(val) && NodeNet.isIP(val.address) && isPort(val.port);
}


module.exports = {
  isPort,
  isBoolean,
  isObject,
  isrinfo,
  isDgramSocket,
}