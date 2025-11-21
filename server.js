const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware CORS - configurar antes de cualquier ruta
app.use(cors({
  origin: '*', // Permitir cualquier origen
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

// Inicializar archivo de datos si no existe
async function initDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    // El archivo no existe, crearlo con estructura inicial (solo historial)
    const initialData = {
      historial: []
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Leer datos
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    // Asegurar que siempre tenga historial
    if (!parsed.historial) {
      parsed.historial = [];
    }
    return parsed;
  } catch (error) {
    return { historial: [] };
  }
}

// Guardar datos
async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// API: Obtener todas las reflexiones (historial completo - EXACTO del JSON)
app.get('/api/reflexiones', async (req, res) => {
  try {
    // Headers CORS explícitos
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const data = await readData();
    
    // Devolver SOLO el historial tal cual está, sin filtros ni duplicados eliminados
    // Permitir múltiples reflexiones con la misma fecha
    let todasLasReflexiones = [];
    
    if (data.historial && Array.isArray(data.historial)) {
      // Incluir todas las reflexiones del historial, incluso si tienen la misma fecha
      // Asignar ID a reflexiones que no lo tengan (compatibilidad con datos antiguos)
      data.historial.forEach(reflexion => {
        if (reflexion.titulo && reflexion.parrafo && reflexion.fecha) {
          if (!reflexion.id) {
            reflexion.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          }
          todasLasReflexiones.push(reflexion);
        }
      });
      // Guardar si se agregaron IDs
      if (data.historial.some(r => r.id && !todasLasReflexiones.find(tr => tr.id === r.id))) {
        await saveData(data);
      }
    }
    
    // Ordenar por fecha descendente (más reciente primero), manteniendo el orden relativo de las que tienen la misma fecha
    todasLasReflexiones.sort((a, b) => {
      const fechaA = new Date(a.fecha);
      const fechaB = new Date(b.fecha);
      if (fechaA.getTime() === fechaB.getTime()) {
        // Si tienen la misma fecha, mantener el orden original (índice en el array)
        return 0;
      }
      return fechaB - fechaA;
    });
    
    res.json(todasLasReflexiones);
  } catch (error) {
    res.status(500).json({ error: 'Error al leer los datos' });
  }
});

// Manejar preflight OPTIONS
app.options('/api/reflexiones', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

app.options('/api/reflexiones/:id', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// API: Editar reflexión del historial por ID
app.put('/api/reflexiones/:id', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { id } = req.params;
    const { titulo, parrafo, fecha: nuevaFecha } = req.body;
    
    if (!titulo || !parrafo || !nuevaFecha) {
      return res.status(400).json({ error: 'Título, párrafo y fecha son requeridos' });
    }

    const data = await readData();
    if (!data.historial) {
      data.historial = [];
    }
    
    // Buscar la reflexión por ID
    const index = data.historial.findIndex(r => r.id === id);
    
    if (index < 0) {
      return res.status(404).json({ error: 'Reflexión no encontrada' });
    }
    
    // Actualizar la reflexión manteniendo el mismo ID
    const reflexionActualizada = {
      id: id, // Mantener el mismo ID
      titulo: titulo.trim(),
      parrafo: parrafo.trim(),
      fecha: nuevaFecha.trim()
    };
    
    data.historial[index] = reflexionActualizada;
    
    // Ordenar historial por fecha descendente
    data.historial.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    await saveData(data);
    res.json({ success: true, reflexion: reflexionActualizada });
  } catch (error) {
    res.status(500).json({ error: 'Error al editar los datos' });
  }
});

// API: Eliminar reflexión del historial por ID
app.delete('/api/reflexiones/:id', async (req, res) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { id } = req.params;
    
    const data = await readData();
    
    // Eliminar solo la reflexión con el ID específico
    const antes = data.historial.length;
    data.historial = data.historial.filter(r => r.id !== id);
    const despues = data.historial.length;

    if (antes === despues) {
      return res.status(404).json({ error: 'Reflexión no encontrada' });
    }

    await saveData(data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar los datos' });
  }
});

// API: Guardar nueva reflexión (agregar al historial directamente)
app.post('/api/reflexiones', async (req, res) => {
  try {
    // Headers CORS explícitos
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    const { titulo, parrafo, fecha } = req.body;
    
    if (!titulo || !parrafo || !fecha) {
      return res.status(400).json({ error: 'Título, párrafo y fecha son requeridos' });
    }

    const data = await readData();
    if (!data.historial) {
      data.historial = [];
    }
    
    const nuevaReflexion = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // ID único
      titulo: titulo.trim(),
      parrafo: parrafo.trim(),
      fecha: fecha.trim()
    };

    // Agregar al historial (permitir múltiples reflexiones con la misma fecha)
    data.historial.unshift(nuevaReflexion); // Agregar al inicio

    await saveData(data);
    res.json({ success: true, reflexion: nuevaReflexion });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar los datos' });
  }
});

// Panel admin - HTML mejorado con historial
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-panel.html'));
});

// Panel admin - HTML anterior (por si acaso)
app.get('/admin-old', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin - Reflexión del Día</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .container {
          background: white;
          border-radius: 12px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 28px;
        }
        
        .subtitle {
          color: #666;
          margin-bottom: 30px;
          font-size: 14px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        label {
          display: block;
          color: #333;
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        input[type="text"],
        textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          transition: border-color 0.3s;
        }
        
        input[type="text"]:focus,
        textarea:focus {
          outline: none;
          border-color: #667eea;
        }
        
        textarea {
          min-height: 150px;
          resize: vertical;
        }
        
        button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        
        button:active {
          transform: translateY(0);
        }
        
        .message {
          margin-top: 20px;
          padding: 12px;
          border-radius: 8px;
          display: none;
        }
        
        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
          display: block;
        }
        
        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
          display: block;
        }
        
        .current {
          margin-top: 30px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }
        
        .current h2 {
          font-size: 16px;
          color: #333;
          margin-bottom: 10px;
        }
        
        .current p {
          color: #666;
          font-size: 14px;
          line-height: 1.6;
        }
        
        .current strong {
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📝 Reflexión del Día</h1>
        <p class="subtitle">Agrega el título y párrafo de la reflexión diaria</p>
        
        <form id="reflexionForm">
          <div class="form-group">
            <label for="titulo">Título</label>
            <input type="text" id="titulo" name="titulo" required placeholder="Ej: El lenguaje es un arma cargada de intenciones">
          </div>
          
          <div class="form-group">
            <label for="parrafo">Párrafo</label>
            <textarea id="parrafo" name="parrafo" required placeholder="Escribe aquí el párrafo completo de la reflexión..."></textarea>
          </div>
          
          <button type="submit">Guardar Reflexión</button>
        </form>
        
        <div id="message" class="message"></div>
        
        <div class="current">
          <h2>Reflexión actual:</h2>
          <p><strong>Título:</strong> <span id="currentTitulo">Cargando...</span></p>
          <p><strong>Párrafo:</strong> <span id="currentParrafo">Cargando...</span></p>
          <p style="margin-top: 10px; font-size: 12px; color: #999;"><strong>Fecha:</strong> <span id="currentFecha">-</span></p>
        </div>
      </div>
      
      <script>
        const form = document.getElementById('reflexionForm');
        const message = document.getElementById('message');
        
        // Cargar reflexión actual
        async function loadCurrent() {
          try {
            const response = await fetch('/api/reflexion-hoy');
            const data = await response.json();
            
            document.getElementById('currentTitulo').textContent = data.titulo || '(Vacío)';
            document.getElementById('currentParrafo').textContent = data.parrafo || '(Vacío)';
            document.getElementById('currentFecha').textContent = data.fecha || '-';
            
            // Pre-llenar formulario
            if (data.titulo) {
              document.getElementById('titulo').value = data.titulo;
            }
            if (data.parrafo) {
              document.getElementById('parrafo').value = data.parrafo;
            }
          } catch (error) {
            console.error('Error al cargar:', error);
          }
        }
        
        // Enviar formulario
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const titulo = document.getElementById('titulo').value;
          const parrafo = document.getElementById('parrafo').value;
          
          try {
            const response = await fetch('/api/reflexion-hoy', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ titulo, parrafo })
            });
            
            const data = await response.json();
            
            if (response.ok) {
              message.className = 'message success';
              message.textContent = '✅ Reflexión guardada exitosamente';
              
              // Actualizar vista actual
              await loadCurrent();
              
              // Limpiar mensaje después de 3 segundos
              setTimeout(() => {
                message.className = 'message';
              }, 3000);
            } else {
              message.className = 'message error';
              message.textContent = '❌ Error: ' + (data.error || 'Error al guardar');
            }
          } catch (error) {
            message.className = 'message error';
            message.textContent = '❌ Error de conexión';
          }
        });
        
        // Cargar al inicio
        loadCurrent();
      </script>
    </body>
    </html>
  `);
});

// Iniciar servidor
async function startServer() {
  await initDataFile();
  
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    console.log(`Web: http://localhost:${PORT}/`);
    console.log(`Panel admin: http://localhost:${PORT}/admin`);
    console.log(`🔌 API: http://localhost:${PORT}/api/reflexion-hoy`);
  });
}

startServer();

