
const Udp = require('../socket');

const clnt = Udp.createSocket('udp4');
const svr = Udp.createSocket('udp4');

console.log('svr.bind()');
svr.bind(4444,() =>
{
  const svrPort = svr.localPort;
  console.log('svr bound: localPort =',svrPort);

  svr.on('data', buff => {
    console.log('svr receives:',buff)
    svr.close();
    clnt.close();
  });

  clnt.connect(svrPort, (err) => {
    if (err) throw err;

    console.log('cl connected: localPort =',clnt.localPort,'/ remotePort =',clnt.remotePort);

    clnt.write( Buffer.from('hello world') )
  });
});

