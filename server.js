const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 8080;

// Conexión a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://developjuansebastian_db_user:AjRlHPRSQrM01mpA@proyectomongodb.ycpota1.mongodb.net/jsdejuansebastian?appName=ProyectoMongodb';

// Modelos de Mongoose
const emailSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  fecha: { type: String, required: true },
  seleccionado: { type: Boolean, default: false }
}, { timestamps: false });

const Email = mongoose.model('Email', emailSchema, 'emails');

// Middleware CORS - configurar antes de cualquier ruta
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
const webPath = path.join(__dirname, '..', 'web');
app.use(express.static(webPath));

// Ruta raíz - servir index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(webPath, 'index.html'));
});

// Conectar a MongoDB
async function connectMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Conectado a MongoDB');
  } catch (error) {
    console.error('Error al conectar a MongoDB:', error);
    throw error;
  }
}


// Contraseña del admin
const ADMIN_PASSWORD = 'jsdeadmin2025';

// Verificar sesión admin (token simple en memoria)
const adminSessions = new Set();

// Configuración SMTP para newsletter
const SMTP_CONFIG = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'developjuansebastian@gmail.com',
    pass: 'iyuzpzpctykkofd'
  }
};

// Configuración de email - Usar Resend (recomendado para Railway)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_EMAIL_FROM = process.env.RESEND_EMAIL_FROM || 'onboarding@resend.dev';

// ============ NEWSLETTER ENDPOINTS ============

// Suscribirse al newsletter
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { email } = req.body;
    
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'El correo electrónico es requerido' });
    }
    
    // Validar formato de email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'El formato del correo electrónico no es válido' });
    }
    
    const emailNormalized = email.trim().toLowerCase();
    
    // Verificar si el email ya existe
    const existe = await Email.findOne({ email: emailNormalized });
    
    if (existe) {
      return res.status(400).json({ error: 'Este correo ya está suscrito' });
    }
    
    // Crear nuevo email
    const nuevoEmail = new Email({
      email: emailNormalized,
      fecha: new Date().toISOString().split('T')[0]
    });
    
    await nuevoEmail.save();
    res.json({ success: true, message: 'Suscripción exitosa' });
  } catch (error) {
    console.error('Error al suscribirse:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Este correo ya está suscrito' });
    }
    res.status(500).json({ error: 'Error al procesar la suscripción' });
  }
});

// Obtener lista de emails (solo admin)
app.get('/api/newsletter/emails', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const authHeader = req.headers.authorization || req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || authHeader;
    
    if (!token || !adminSessions.has(token)) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const emails = await Email.find({}).sort({ fecha: -1 }).lean();
    
    res.json({ success: true, emails });
  } catch (error) {
    console.error('Error al obtener emails:', error);
    res.status(500).json({ error: 'Error al obtener los emails' });
  }
});

// Actualizar estado de selección de un email (solo admin)
app.put('/api/newsletter/emails/:email/select', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const authHeader = req.headers.authorization || req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || authHeader;
    
    if (!token || !adminSessions.has(token)) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const emailToUpdate = decodeURIComponent(req.params.email).toLowerCase();
    const { seleccionado } = req.body;
    
    if (typeof seleccionado !== 'boolean') {
      return res.status(400).json({ error: 'El campo seleccionado debe ser true o false' });
    }
    
    const result = await Email.findOneAndUpdate(
      { email: emailToUpdate },
      { seleccionado: seleccionado },
      { new: true, lean: true }
    );
    
    if (!result) {
      return res.status(404).json({ error: 'Correo no encontrado' });
    }
    
    res.json({ success: true, email: result });
  } catch (error) {
    console.error('Error al actualizar selección:', error);
    res.status(500).json({ error: 'Error al actualizar la selección' });
  }
});

// Marcar/desmarcar todos los emails (solo admin)
app.put('/api/newsletter/emails/select-all', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const authHeader = req.headers.authorization || req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || authHeader;
    
    if (!token || !adminSessions.has(token)) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const { seleccionado } = req.body;
    
    if (typeof seleccionado !== 'boolean') {
      return res.status(400).json({ error: 'El campo seleccionado debe ser true o false' });
    }
    
    const result = await Email.updateMany({}, { seleccionado: seleccionado });
    
    res.json({ 
      success: true, 
      message: `${result.modifiedCount} correos actualizados`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error al actualizar todos:', error);
    res.status(500).json({ error: 'Error al actualizar los correos' });
  }
});

// Eliminar un correo del newsletter (solo admin)
app.delete('/api/newsletter/emails/:email', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const authHeader = req.headers.authorization || req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || authHeader;
    
    if (!token || !adminSessions.has(token)) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    
    const emailToDelete = decodeURIComponent(req.params.email).toLowerCase();
    
    if (!emailToDelete) {
      return res.status(400).json({ error: 'El correo es requerido' });
    }
    
    const result = await Email.findOneAndDelete({ email: emailToDelete });
    
    if (!result) {
      return res.status(404).json({ error: 'Correo no encontrado' });
    }
    
    res.json({ success: true, message: 'Correo eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar correo:', error);
    res.status(500).json({ error: 'Error al eliminar el correo' });
  }
});

// Enviar correo a todos los suscriptores (solo admin)
app.post('/api/newsletter/send', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    const authHeader = req.headers.authorization || req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || authHeader;
    
    console.log('=== Enviar correo ===');
    console.log('Header authorization recibido:', req.headers.authorization ? 'presente' : 'ausente');
    console.log('Token extraído:', token ? token.substring(0, 20) + '...' : 'ninguno');
    console.log('Tokens activos:', Array.from(adminSessions).length);
    console.log('Token válido?', token && adminSessions.has(token));
    
    if (!token || !adminSessions.has(token)) {
      console.log('Error: Token no autorizado');
      return res.status(401).json({ error: 'No autorizado. Por favor, recarga la página e inicia sesión nuevamente.' });
    }
    
    const { asunto, mensaje } = req.body;
    
    if (!asunto || !mensaje) {
      return res.status(400).json({ error: 'El asunto y mensaje son requeridos' });
    }
    
    // Solo obtener emails seleccionados
    const emailsData = await Email.find({ seleccionado: true }).lean();
    const emails = emailsData.map(e => e.email);
    
    if (emails.length === 0) {
      return res.status(400).json({ error: 'No hay suscriptores seleccionados para enviar' });
    }
    
    console.log(`Preparando enviar correo a ${emails.length} suscriptores...`);
    console.log('Asunto:', asunto);
    console.log('Mensaje (primeros 50 chars):', mensaje.substring(0, 50));
    
    const destinatarios = emails;
    const resultados = [];
    
    console.log(`Iniciando envío a ${destinatarios.length} destinatarios...`);
    
    // Usar Resend si está configurado
    if (RESEND_API_KEY) {
      console.log('Usando Resend para enviar correos...');
      const { Resend } = require('resend');
      const resend = new Resend(RESEND_API_KEY);
      
      for (let i = 0; i < destinatarios.length; i++) {
        const email = destinatarios[i];
        try {
          console.log(`Enviando correo ${i + 1}/${destinatarios.length} a ${email}...`);
          
          const { data, error } = await resend.emails.send({
            from: RESEND_EMAIL_FROM,
            to: email,
            subject: asunto,
            html: mensaje.replace(/\n/g, '<br>'),
            text: mensaje
          });
          
          if (error) {
            throw new Error(error.message || 'Error desconocido de Resend');
          }
          
          console.log(`✓ Correo enviado exitosamente a ${email}`);
          resultados.push({ email, success: true });
        } catch (error) {
          console.error(`✗ Error al enviar a ${email}:`, error.message);
          resultados.push({ email, success: false, error: error.message });
        }
      }
    } else {
      // Fallback a Gmail SMTP
      console.log('⚠️  RESEND_API_KEY no configurada, usando Gmail SMTP (puede tener problemas en Railway)...');
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.secure,
        auth: SMTP_CONFIG.auth,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });
      
      for (let i = 0; i < destinatarios.length; i++) {
        const email = destinatarios[i];
        try {
          console.log(`Enviando correo ${i + 1}/${destinatarios.length} a ${email}...`);
          
          const sendPromise = transporter.sendMail({
            from: SMTP_CONFIG.auth.user,
            to: email,
            subject: asunto,
            text: mensaje,
            html: mensaje.replace(/\n/g, '<br>')
          });
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout al enviar correo (15 segundos)')), 15000)
          );
          
          await Promise.race([sendPromise, timeoutPromise]);
          
          console.log(`✓ Correo enviado exitosamente a ${email}`);
          resultados.push({ email, success: true });
        } catch (error) {
          console.error(`✗ Error al enviar a ${email}:`, error.message);
          resultados.push({ email, success: false, error: error.message });
        }
      }
    }
    
    const exitosos = resultados.filter(r => r.success).length;
    const fallidos = resultados.filter(r => !r.success).length;
    
    console.log(`=== Envío completado: ${exitosos} exitosos, ${fallidos} fallidos ===`);
    
    res.json({ 
      success: true, 
      message: `Enviados ${exitosos} correos exitosamente${fallidos > 0 ? `, ${fallidos} fallidos` : ''}`,
      emailsCount: emails.length,
      sent: exitosos,
      failed: fallidos,
      results: resultados
    });
  } catch (error) {
    console.error('Error al enviar correo:', error);
    console.error('Detalles del error:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Error al enviar el correo: ' + (error.message || 'Error desconocido'),
      message: 'Error de conexión con el servidor SMTP. Verifica que Railway permita conexiones SMTP salientes.'
    });
  }
});

app.post('/admin/login', (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
      const token = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      adminSessions.add(token);
      
      setTimeout(() => {
        adminSessions.delete(token);
      }, 24 * 60 * 60 * 1000);
      
      res.json({ success: true, token: token });
    } else {
      res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar contraseña' });
  }
});

// Verificar token de sesión
app.get('/admin/verify', (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    
    if (token && adminSessions.has(token)) {
      res.json({ valid: true });
    } else {
      res.json({ valid: false });
    }
  } catch (error) {
    res.json({ valid: false });
  }
});

// Panel admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-panel.html'));
});

// Iniciar servidor
async function startServer() {
  try {
    await connectMongoDB();
    
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
      console.log(`Web: http://localhost:${PORT}/`);
      console.log(`Panel admin: http://localhost:${PORT}/admin`);
    });
  } catch (error) {
    console.error('Error al iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
