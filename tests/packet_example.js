
const Udp = require('../socket');

const clnt = Udp.createSocket({ objectMode: true, type: 'udp4'});
const svr = Udp.createSocket({ objectMode: true, type: 'udp4'});

const initial = Udp.createPacket(Buffer.from('hello'));
const response = Udp.createPacket(Buffer.from('hi there'));

svr.on('data', pkt => {
  console.log('svr receives:',pkt)
  response.port = pkt.port;
  response.address = pkt.address;
  console.log('svr responding:',response);
  svr.write(response);
});

clnt.on('data', pkt => {
  console.log('clnt receives:',pkt)
  svr.close();
  clnt.close();
});

console.log('svr.bind()');
svr.bind(4444,() =>
{
  const svrPort = svr.localPort;
  console.log('svr bound: localPort =',svrPort);

  initial.port = svrPort;
  initial.address = '127.0.0.1';

  console.log('clnt writing:',initial);
  clnt.write(initial)
});
