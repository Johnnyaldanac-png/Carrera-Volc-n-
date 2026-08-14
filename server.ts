import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

let resend: Resend | null = null;

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resend) {
    resend = new Resend(key);
  }
  return resend;
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

      console.log(`New registration from ${fullName} (${email}), Cédula: ${cedula}`);

      // Notification to Admin
      console.log("Attempting to send email notification to johnnyaldanac@gmail.com...");
      const resendClient = getResend();
      if (resendClient) {
        try {
          const emailResponse = await resendClient.emails.send({
            from: "Registro Carrera <onboarding@resend.dev>",
            to: "johnnyaldanac@gmail.com",
            subject: `Nueva Inscripción: ${fullName}`,
            html: `
              <h1>Nueva Inscripción Recibida</h1>
              <p><strong>Nombre Completo:</strong> ${fullName}</p>
              <p><strong>Correo Electrónico:</strong> ${email}</p>
              <p><strong>Cédula:</strong> ${cedula}</p>
              <p><strong>Fecha de Nacimiento:</strong> ${birthDay}/${birthMonth}/${birthYear}</p>
            `,
          });
          console.log("Email result:", emailResponse);
        } catch (emailError: any) {
          console.error("Resend Error Detail:", emailError);
        }
      } else {
        console.warn("Skipping email: RESEND_API_KEY is missing.");
      }

      res.status(200).json({ success: true, message: "Registration received" });
    } catch (error: any) {
      console.error("Global Server error:", error);
      res.status(500).json({ error: `Error interno del servidor: ${error.message || 'Error desconocido'}` });
    }
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === "production";
  const distPath = path.resolve(process.cwd(), "dist");

  // Health check for debugging
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: process.env.NODE_ENV || "development",
      time: new Date().toISOString(),
      distExists: fs.existsSync(distPath)
    });
  });

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
    
    // Serve static files from dist
    app.use(express.static(distPath));
    
    // SPA fallback: send index.html for any non-API route
    app.get("*", (req, res, next) => {
      if (req.url.startsWith('/api')) return next();
      
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error("❌ index.html not found at:", indexPath);
        res.status(404).send(`
          <div style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #f97316;">Desafío El Volcán</h1>
            <p>La aplicación se está preparando para el acceso público.</p>
            <p>Por favor, recarga la página en unos segundos. Si el problema persiste, contacta al administrador.</p>
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
