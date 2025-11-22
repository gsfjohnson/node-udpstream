
let xcount = 1;
const { UdpStream } = require('..');

const server = UdpStream.create({ objectMode: true });
//console.log('stream:',stream);

server.once('bind', () => console.log('server bound:',server.localAddress,server.localPort) );

const onConnection = function(sub){
  console.log('connection event:',sub);
  sub.on('data',(data) => console.log('substream `data`:',data) )
  //sub.once('end',() => console.log('substream `end` event') );
  sub.once('end',() => console.log('substream `end`') );
  sub.once('close',() => {
    console.log('substream `close` / xcount =',xcount);
    if (xcount-- < 1) {
      console.log('xcount == 0 -- server.close()');
      server.close(); // close when xcount=0
    }
  });
  process.nextTick( () => sub.close() );
};

console.log('server.on(`connection`,onConnection)');
server.on('connection',onConnection);

/*
const onConnect = function(connected){
  console.log('connected stream:',connected);
  connected.on('close',() => console.log('connected stream closed!') )
  stream.close();
};

console.log('stream.on(`connect`,onConnect)');
stream.on('connect',onConnect);
*/

const onListenMessage = function(pkt) {
  console.log('server received:',pkt);
  console.log('return true -- to create connection');
  return true; // true = create connection
};

const onListen = function() {
  console.log('server is listening');
  const pkt = UdpStream.createPacket( Buffer.from('hi'), 4444 );
  console.log('write packet to stream');
  server.write(pkt);
};

console.log('stream.listen(4444, onListen, onListenMessage)');
server.listen( 4444, '127.0.0.1', onListen, onListenMessage );
