test('SMTP do codigo usa transporte simulado e remetente Amores Pet', async () => {
  const config = {
    EMAIL_HOST: process.env.EMAIL_HOST,
    EMAIL_PORT: process.env.EMAIL_PORT,
    EMAIL_SECURE: process.env.EMAIL_SECURE,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
  };
  process.env.EMAIL_HOST = 'smtp.example.invalid';
  process.env.EMAIL_PORT = '2525';
  process.env.EMAIL_SECURE = 'false';
  process.env.EMAIL_USER = 'no-reply@example.invalid';
  process.env.EMAIL_PASSWORD = 'fake-test-secret';

  jest.resetModules();
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'mock-only' });
  const createTransport = jest.fn(() => ({ sendMail, verify: jest.fn() }));
  jest.doMock('nodemailer', () => ({ createTransport }));
  jest.dontMock('../src/services/emailService');
  const service = require('../src/services/emailService');

  expect(createTransport).not.toHaveBeenCalled();
  await service.enviarCodigoVerificacao({ para: 'tutor@example.invalid', codigo: '908172', contexto: 'IDENTIFICACAO' });
  expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.invalid', port: 2525 }));
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: '"Amores Pet" <no-reply@example.invalid>',
    to: 'tutor@example.invalid',
    subject: expect.stringContaining('Amores Pet'),
    text: expect.stringContaining('908172'),
  }));

  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
