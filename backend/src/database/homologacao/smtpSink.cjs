'use strict';

const crypto = require('node:crypto');
const net = require('node:net');

function equalSecret(received, expected) {
  const left = Buffer.from(String(received));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseAuthPlain(value) {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const parts = decoded.split('\0');
    return { username: parts.at(-2) || '', password: parts.at(-1) || '' };
  } catch {
    return { username: '', password: '' };
  }
}

function createSmtpSink({
  host = '127.0.0.1',
  port = 0,
  username,
  password,
  maxMessageBytes = 1024 * 1024,
  maxMessages = 100,
  acceptRecipient = () => true,
} = {}) {
  if (host !== '127.0.0.1') throw new Error('Servidor SMTP de homologacao deve escutar somente em 127.0.0.1.');
  if (!username || !password) throw new Error('Credenciais efemeras do SMTP local sao obrigatorias.');

  const messages = [];
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.setTimeout(30_000, () => socket.destroy());

    let buffer = '';
    let authStep = '';
    let authUsername = '';
    let inData = false;
    let dataLines = [];
    let dataBytes = 0;
    let sender = '';
    let recipients = [];

    const reply = (value) => socket.write(`${value}\r\n`);
    const resetEnvelope = () => { sender = ''; recipients = []; };
    const authenticate = (candidateUser, candidatePassword) => {
      const valid = equalSecret(candidateUser, username) && equalSecret(candidatePassword, password);
      reply(valid ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication failed');
      authStep = '';
      authUsername = '';
    };

    function handleLine(rawLine) {
      const line = rawLine.replace(/\r$/, '');
      if (inData) {
        if (line === '.') {
          inData = false;
          const raw = dataLines.join('\r\n');
          if (messages.length >= maxMessages) {
            reply('452 4.3.1 Local test inbox is full');
          } else {
            messages.push(Object.freeze({ from: sender, to: [...recipients], raw, receivedAt: new Date().toISOString() }));
            reply(`250 2.0.0 queued as local-${messages.length}`);
          }
          dataLines = [];
          dataBytes = 0;
          resetEnvelope();
          return;
        }
        const unescaped = line.startsWith('..') ? line.slice(1) : line;
        dataBytes += Buffer.byteLength(unescaped, 'utf8') + 2;
        if (dataBytes > maxMessageBytes) {
          inData = false;
          dataLines = [];
          dataBytes = 0;
          resetEnvelope();
          reply('552 5.3.4 Local test message exceeds configured size');
          return;
        }
        dataLines.push(unescaped);
        return;
      }

      if (authStep === 'plain') {
        const credentials = parseAuthPlain(line);
        authenticate(credentials.username, credentials.password);
        return;
      }
      if (authStep === 'login_user') {
        try { authUsername = Buffer.from(line, 'base64').toString('utf8'); } catch { authUsername = ''; }
        authStep = 'login_password';
        reply('334 UGFzc3dvcmQ6');
        return;
      }
      if (authStep === 'login_password') {
        let candidatePassword = '';
        try { candidatePassword = Buffer.from(line, 'base64').toString('utf8'); } catch { /* reject below */ }
        authenticate(authUsername, candidatePassword);
        return;
      }

      const [verb, ...rest] = line.split(' ');
      const argument = rest.join(' ');
      switch ((verb || '').toUpperCase()) {
        case 'EHLO':
          socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1048576\r\n');
          break;
        case 'HELO': reply('250 localhost'); break;
        case 'AUTH': {
          const [mechanism, initial] = argument.split(/\s+/, 2);
          if (mechanism?.toUpperCase() === 'PLAIN') {
            if (initial) authenticate(...Object.values(parseAuthPlain(initial)));
            else { authStep = 'plain'; reply('334 '); }
          } else if (mechanism?.toUpperCase() === 'LOGIN') {
            authStep = 'login_user';
            reply('334 VXNlcm5hbWU6');
          } else {
            reply('504 5.5.4 Unsupported authentication mechanism');
          }
          break;
        }
        case 'MAIL':
          if (!line.toUpperCase().startsWith('MAIL FROM:')) { reply('501 5.5.4 Invalid MAIL command'); break; }
          sender = line.slice(line.indexOf(':') + 1).trim();
          reply('250 2.1.0 Sender accepted');
          break;
        case 'RCPT': {
          if (!line.toUpperCase().startsWith('RCPT TO:')) { reply('501 5.5.4 Invalid RCPT command'); break; }
          const recipient = line.slice(line.indexOf(':') + 1).trim();
          if (!acceptRecipient(recipient)) reply('550 5.1.1 Recipient rejected by local test sink');
          else { recipients.push(recipient); reply('250 2.1.5 Recipient accepted'); }
          break;
        }
        case 'DATA':
          if (recipients.length === 0) reply('503 5.5.1 RCPT TO required');
          else { inData = true; dataLines = []; dataBytes = 0; reply('354 End data with <CR><LF>.<CR><LF>'); }
          break;
        case 'RSET': resetEnvelope(); reply('250 2.0.0 Reset'); break;
        case 'NOOP': reply('250 2.0.0 OK'); break;
        case 'QUIT': reply('221 2.0.0 Bye'); socket.end(); break;
        case 'STARTTLS': reply('454 4.7.0 TLS unavailable on loopback test sink'); break;
        default: reply('500 5.5.2 Command unrecognized');
      }
    }

    socket.on('data', (chunk) => {
      buffer += chunk;
      let boundary;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        handleLine(line);
      }
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
    reply('220 localhost ESMTP Amores Pet local test sink');
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        const onError = (error) => { server.removeListener('listening', onListening); reject(error); };
        const onListening = () => {
          server.removeListener('error', onError);
          const address = server.address();
          resolve({ host, port: address.port });
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    messages() { return messages.map((message) => ({ ...message, to: [...message.to] })); },
    close() {
      for (const socket of sockets) socket.end();
      if (!server.listening) return Promise.resolve();
      return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

module.exports = { createSmtpSink };
