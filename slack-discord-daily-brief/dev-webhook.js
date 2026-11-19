// A local stand-in for a Slack or Discord incoming webhook: prints every JSON body it gets.
//   node dev-webhook.js 18356    then WEBHOOK_URL=http://127.0.0.1:18356/slack node brief.js
'use strict';
const http = require('node:http');

function start(port, onPost) {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      onPost({ path: req.url, body: JSON.parse(body || '{}') });
      res.writeHead(req.url.includes('discord') ? 204 : 200).end(req.url.includes('discord') ? '' : 'ok');
    });
  }).listen(port, '127.0.0.1');
}

if (require.main === module) {
  const port = Number(process.argv[2] || 18356);
  start(port, (m) => console.log(`--- POST ${m.path}\n${JSON.stringify(m.body, null, 1)}`));
  console.log(`dev webhook on http://127.0.0.1:${port}`);
}

module.exports = { start };
