
const UdpSocket = require('../socket');

const sock = UdpSocket.createSocket();
console.log('sock:',sock);

console.log('sock.connect(4444, ()=>{} )');
sock.connect(4444,function(){
  console.log('sock connected');
  console.log('sock:',sock);
  console.log('sock.address():',sock.address());
  console.log('sock.close()');
  sock.close();
});
