// Local stand-ins for a webhook and an SMTP server, to see the alerts without sending anything.
//   node dev-receivers.js 18352 18353    -> webhook on :18352, SMTP on :18353, prints what arrives
'use strict';
const http = require('node:http');
const net = require('node:net');

function webhook(port, onMessage) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      onMessage({ path: req.url, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    });
  }).listen(port, '127.0.0.1');
}

function smtp(port, onMail) {
  return net.createServer((sock) => {
    let data = null;
    let buf = '';
    sock.write('220 dev-smtp ready\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data !== null) {
          if (line === '.') { onMail(data.join('\n')); data = null; sock.write('250 queued\r\n'); } else data.push(line);
        } else if (/^EHLO/i.test(line)) sock.write('250-dev-smtp\r\n250 AUTH PLAIN\r\n');
        else if (/^DATA/i.test(line)) { data = []; sock.write('354 go on\r\n'); } else if (/^QUIT/i.test(line)) sock.end('221 bye\r\n');
        else if (/^AUTH/i.test(line)) sock.write('235 ok\r\n');
        else sock.write('250 ok\r\n');
      }
    });
  }).listen(port, '127.0.0.1');
}

if (require.main === module) {
  const [wp = 18352, sp = 18353] = process.argv.slice(2).map(Number);
  webhook(wp, (m) => console.log(`--- webhook ${m.path}\n${JSON.stringify(m.body, null, 1)}`));
  smtp(sp, (m) => console.log(`--- mail\n${m}`));
  console.log(`webhook http://127.0.0.1:${wp}  smtp 127.0.0.1:${sp}`);
}

module.exports = { webhook, smtp };
