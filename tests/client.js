
const { UdpStream } = require('..');

const client = UdpStream.create();
console.log('client:',client);

client.once('bind', () => console.log('client bound:',client.localAddress,client.localPort) );
client.on('close',() => console.log('client closed') )

const onConnect = function(){
  console.log('client connected:',client.remoteAddress,client.remotePort);
  console.log('client.write(buffer)');
  const buffer = Buffer.from('hi there');
  client.write(buffer);
  process.nextTick(() => { client.close() });
};

console.log('client.connect( 4444, 127.0.0.1, onConnect )');
client.connect( 4444, '127.0.0.1', onConnect );
