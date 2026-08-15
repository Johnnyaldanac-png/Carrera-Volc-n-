import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Lazy initialization of Resend
let resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resend) {
    resend = new Resend(key);
  }
  return resend;
}

// Lazy initialization of Nodemailer (Gmail or Custom SMTP)
let mailTransporter: nodemailer.Transporter | null = null;
function getMailTransporter(): { transporter: nodemailer.Transporter | null; senderAddress: string | null } {
  const user = process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.SMTP_PASS;

  if (user && pass) {
    if (!mailTransporter) {
      if (process.env.SMTP_HOST) {
        mailTransporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
          auth: {
            user,
            pass,
          },
        });
      } else {
        // Standard Gmail configuration
        mailTransporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user,
            pass,
          },
        });
      }
    }
    return { transporter: mailTransporter, senderAddress: user };
  }
  return { transporter: null, senderAddress: null };
}

const calculateCategory = (birthDay: string, birthMonth: string, birthYear: string): string => {
  if (!birthDay || !birthMonth || !birthYear) return "General";
  const birthDate = new Date(parseInt(birthYear), parseInt(birthMonth) - 1, parseInt(birthDay));
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < 5) return "Menor de 5 años";
  if (age <= 11) return `Infantil (${age} años)`;
  if (age <= 15) return `Juvenil (${age} años)`;
  if (age <= 29) return `Libre (${age} años)`;
  if (age <= 39) return `Sub-Master (${age} años)`;
  if (age <= 49) return `Master A (${age} años)`;
  if (age <= 59) return `Master B (${age} años)`;
  return `Master C (${age} años)`;
};

async function sendRegistrationEmails(payload: {
  fullName: string;
  email: string;
  cedula: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
}) {
  const { fullName, email, cedula, birthDay, birthMonth, birthYear } = payload;
  const category = calculateCategory(birthDay, birthMonth, birthYear);
  const birthFormatted = `${birthDay.padStart(2, "0")}/${birthMonth.padStart(2, "0")}/${birthYear}`;
  const adminEmail = process.env.ADMIN_EMAIL || "johnnyaldanac@gmail.com";
  const fromEmail = process.env.FROM_EMAIL || "onboarding@resend.dev";

  const emailHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8f9fa; color: #1a1a1a; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #fed7aa; box-shadow: 0 10px 25px rgba(249, 115, 22, 0.1); }
          .header { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; }
          .header p { margin: 6px 0 0 0; font-size: 13px; font-weight: 700; opacity: 0.9; letter-spacing: 2px; }
          .content { padding: 32px 24px; }
          .welcome { font-size: 18px; font-weight: 800; color: #1a1a1a; margin-bottom: 12px; }
          .box { background: #fff7ed; border: 1px solid #ffedd5; border-radius: 16px; padding: 20px; margin: 20px 0; }
          .field { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fed7aa; font-size: 14px; }
          .field:last-child { border-bottom: none; }
          .label { font-weight: 700; color: #9a3412; }
          .value { font-weight: 600; color: #1f2937; }
          .badge { display: inline-block; background: #f97316; color: #ffffff; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 800; text-transform: uppercase; }
          .footer { background: #fafafa; padding: 20px 24px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #f3f4f6; }
          .contact-btn { display: inline-block; background: #25d366; color: #ffffff; padding: 12px 24px; border-radius: 12px; font-weight: 800; text-decoration: none; font-size: 13px; margin-top: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <p>NEW ERA</p>
            <h1>DESAFÍO EL VOLCÁN</h1>
          </div>
          <div class="content">
            <div class="welcome">¡Hola, ${fullName}! 👋</div>
            <p style="font-size: 14px; color: #4b5563; line-height: 1.6;">
              Tu registro para el <strong>Desafío El Volcán</strong> ha sido recibido exitosamente. A continuación encuentras los datos de tu inscripción:
            </p>
            
            <div class="box">
              <div class="field">
                <span class="label">Atleta:</span>
                <span class="value">${fullName}</span>
              </div>
              <div class="field">
                <span class="label">Cédula / Documento:</span>
                <span class="value">${cedula}</span>
              </div>
              <div class="field">
                <span class="label">Correo:</span>
                <span class="value">${email}</span>
              </div>
              <div class="field">
                <span class="label">Nacimiento:</span>
                <span class="value">${birthFormatted}</span>
              </div>
              <div class="field">
                <span class="label">Categoría Asignada:</span>
                <span class="value"><span class="badge">${category}</span></span>
              </div>
            </div>

            <p style="font-size: 13px; color: #6b7280; line-height: 1.5;">
              📍 <strong>Ubicación:</strong> El Volcán, Caracas<br>
              🏃 <strong>Modalidad:</strong> 3KM Trail Running / Asfalto<br>
              🏁 <strong>Meta:</strong> Las Antenas / Hacienda Topito
            </p>

            <div style="text-align: center; margin-top: 24px;">
              <p style="font-size: 12px; font-weight: 700; color: #9a3412;">¿Tienes alguna consulta o deseas contactar a la organización?</p>
              <a href="https://wa.me/584142525647?text=${encodeURIComponent('Hola, me he inscrito en el Desafío El Volcán: ' + fullName + ' (Cédula: ' + cedula + ')')}" class="contact-btn">
                💬 Escribir al WhatsApp Oficial (0414-2525647)
              </a>
            </div>
          </div>
          <div class="footer">
            Desafío El Volcán • Caracas, Venezuela<br>
            Contacto del organizador: ${adminEmail}
          </div>
        </div>
      </body>
    </html>
  `;

  let participantSent = false;
  let adminSent = false;
  let providerUsed = "none";
  let deliveryError: string | null = null;

  // 1. Try Nodemailer (Gmail / Custom SMTP)
  const { transporter, senderAddress } = getMailTransporter();
  if (transporter && senderAddress) {
    try {
      providerUsed = "gmail/smtp";
      // Send to participant
      await transporter.sendMail({
        from: `"Desafío El Volcán" <${senderAddress}>`,
        to: email,
        subject: `🏆 Confirmación de Inscripción: ${fullName} - Desafío El Volcán`,
        html: emailHtml,
      });
      participantSent = true;

      // Send to admin
      if (adminEmail) {
        await transporter.sendMail({
          from: `"Desafío El Volcán" <${senderAddress}>`,
          to: adminEmail,
          subject: `🚨 Nueva Inscripción: ${fullName} (${category})`,
          html: emailHtml,
        });
        adminSent = true;
      }
      console.log(`✅ Email delivered via SMTP/Gmail to participant: ${email} and admin: ${adminEmail}`);
    } catch (smtpErr: any) {
      console.error("⚠️ SMTP/Gmail delivery failed:", smtpErr?.message || smtpErr);
      deliveryError = `Error SMTP: ${smtpErr?.message || 'Fallo de autenticación'}`;
    }
  }

  // 2. Try Resend if Nodemailer was not used or failed
  if (!participantSent || !adminSent) {
    const resendClient = getResend();
    if (resendClient) {
      providerUsed = "resend";
      // Participant email
      if (!participantSent) {
        try {
          const res = await resendClient.emails.send({
            from: `Desafío El Volcán <${fromEmail}>`,
            to: email,
            subject: `🏆 Confirmación de Inscripción: ${fullName} - Desafío El Volcán`,
            html: emailHtml,
          });
          if (res.data?.id) {
            participantSent = true;
            console.log(`✅ Resend delivered to ${email} (ID: ${res.data.id})`);
          } else if (res.error) {
            console.error("⚠️ Resend error:", res.error);
            deliveryError = `Resend error: ${res.error.message}`;
          }
        } catch (resErr: any) {
          console.error("⚠️ Resend participant send error:", resErr?.message || resErr);
          deliveryError = `Resend: ${resErr?.message || 'Error al conectar'}`;
        }
      }

      // Admin email
      if (!adminSent && adminEmail) {
        try {
          const resAdmin = await resendClient.emails.send({
            from: `Desafío El Volcán <${fromEmail}>`,
            to: adminEmail,
            subject: `🚨 Nueva Inscripción: ${fullName} (${category})`,
            html: emailHtml,
          });
          if (resAdmin.data?.id) {
            adminSent = true;
            console.log(`✅ Resend delivered to admin ${adminEmail}`);
          }
        } catch (resAdminErr: any) {
          console.error("⚠️ Resend admin send error:", resAdminErr?.message || resAdminErr);
        }
      }
    }
  }

  if (providerUsed === "none") {
    deliveryError = "No hay credenciales de correo configuradas en las variables de entorno (GMAIL_USER / GMAIL_APP_PASSWORD o RESEND_API_KEY).";
    console.log("ℹ️ No email provider credentials found. Registration saved to Firestore database.");
  }

  return {
    participantSent,
    adminSent,
    providerUsed,
    deliveryError,
  };
}

async function startServer() {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.post("/api/register", async (req, res) => {
    try {
      const {
        fullName,
        email,
        cedula,
        birthDay,
        birthMonth,
        birthYear,
      } = req.body;

      if (!fullName || !email || !cedula) {
        console.error("Missing required fields:", { fullName, email, cedula });
        return res.status(400).json({ error: "Faltan campos requeridos en el servidor" });
      }

      console.log(`📥 New registration received: ${fullName} (${email}), Cédula: ${cedula}`);

      // Send email notifications
      const emailResult = await sendRegistrationEmails({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        cedula: cedula.trim(),
        birthDay: String(birthDay),
        birthMonth: String(birthMonth),
        birthYear: String(birthYear),
      });

      res.status(200).json({ 
        success: true, 
        message: "Registro procesado con éxito",
        emailDetails: emailResult
      });
    } catch (error: any) {
      console.error("Global Server error:", error);
      res.status(500).json({ error: `Error interno del servidor: ${error.message || 'Error desconocido'}` });
    }
  });

  // Check email configuration status
  app.get("/api/email-status", (req, res) => {
    const hasGmail = Boolean(
      (process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.SMTP_USER) &&
      (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.SMTP_PASS)
    );
    const hasResend = Boolean(process.env.RESEND_API_KEY);
    
    res.json({
      configured: hasGmail || hasResend,
      provider: hasGmail ? "Gmail/SMTP" : hasResend ? "Resend" : "Ninguno (Requiere configuración)",
      adminEmail: process.env.ADMIN_EMAIL || "johnnyaldanac@gmail.com",
    });
  });

  // Health check for debugging
  const distPath = path.resolve(process.cwd(), "dist");
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: process.env.NODE_ENV || "development",
      time: new Date().toISOString(),
      hasResendKey: Boolean(process.env.RESEND_API_KEY),
      hasGmailUser: Boolean(process.env.GMAIL_USER || process.env.SMTP_USER),
      distExists: fs.existsSync(distPath)
    });
  });

  // Vite middleware for development vs static build in production
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    console.log("🛠️ Starting Vite in development mode...");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        hmr: false 
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("📦 Serving production build...");
    app.use(express.static(distPath));
    
    // SPA fallback
    app.get("*", (req, res, next) => {
      if (req.url.startsWith('/api')) return next();
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send(`
          <div style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #f97316;">Desafío El Volcán</h1>
            <p>La aplicación se está preparando. Recarga la página en unos segundos.</p>
            <button onclick="location.reload()" style="background: #f97316; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Recargar</button>
          </div>
        `);
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📁 Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
