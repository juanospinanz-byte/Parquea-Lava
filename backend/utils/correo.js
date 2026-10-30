const nodemailer = require('nodemailer');

// Envío de correos con SMTP (Gmail, Outlook, etc.), configurado en backend/.env.
// Sin SMTP configurado (desarrollo), el código se muestra en la consola del backend.
const smtpConfigurado = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

const enviarCodigoRecuperacion = async (correo, nombre, codigo, minutos) => {
  if (!smtpConfigurado()) {
    console.log(`[Recuperar contraseña] SMTP no configurado. Código para ${correo}: ${codigo}`);
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: correo,
    subject: 'Código para recuperar tu contraseña · ParkApp',
    text:
      `Hola ${nombre},\n\n` +
      `Tu código para cambiar la contraseña es: ${codigo}\n\n` +
      `Vence en ${minutos} minutos. Si no lo pediste, ignora este correo.`,
    html:
      `<p>Hola ${nombre},</p>` +
      `<p>Tu código para cambiar la contraseña es:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${codigo}</p>` +
      `<p>Vence en ${minutos} minutos. Si no lo pediste, ignora este correo.</p>`,
  });
};

module.exports = { enviarCodigoRecuperacion };
