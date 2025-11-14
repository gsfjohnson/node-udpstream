
const NodeDgram = require('node:dgram');

const sock = NodeDgram.createSocket('udp4');
console.log('sock:',sock);

console.log('sock.connect(4444, ()=>{} )');
sock.connect(4444,function(){
  console.log('sock connected');
  console.log('sock:',sock);
  console.log('sock.address():',sock.address());
  console.log('sock.close()');
  sock.close();
});
