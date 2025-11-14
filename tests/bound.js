
const NodeDgram = require('node:dgram');

const sock = NodeDgram.createSocket('udp4');
sock.bind(function(){
  console.log('sock.address():',sock.address());
  sock.close();
});
console.log('sock:',sock);
