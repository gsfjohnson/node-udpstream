
const UdpStream = require('../stream');

const stream = UdpStream.create();
console.log('stream:',stream);

console.log('stream.connect(4444, ()=>{} )');
stream.bind(4444,function(){
  console.log('stream connected');
  console.log('stream:',stream);
  console.log('stream.address():',stream.address());
  console.log('stream.close()');
  stream.close();
});
