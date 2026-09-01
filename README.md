# muuu

Aplicación web para organizar y registrar los horarios de alimentación de un
bebé y las extracciones de leche materna. Permite gestionar los eventos de cada
día, registrar volúmenes en mililitros, consultar resúmenes diarios y revisar
estadísticas de extracciones por rango de fechas.

## Tecnologías

- **Python 3:** backend HTTP, autenticación y lógica de la aplicación.
- **SQLite:** persistencia de usuarios, sesiones, horarios, volúmenes y configuraciones diarias.
- **HTML, CSS y JavaScript:** interfaz web estática y comportamiento del sitio.
- **Nginx:** servidor de archivos estáticos y proxy para la API.
- **Docker y Docker Compose:** empaquetado y ejecución de los servicios.

## Estructura de archivos

```text
.
├── server.py              # Backend HTTP, autenticación y API REST.
├── docker-compose.yml     # Definición de los servicios Docker de la aplicación.
├── Dockerfile             # Imagen Docker del backend Python.
├── Dockerfile.nginx       # Imagen Docker del servidor Nginx.
├── nginx.conf             # Rutas de archivos estáticos y proxy de la API.
├── README.md              # Descripción, tecnologías y estructura del proyecto.
└── html/                  # Frontend que se despliega en Nginx.
    ├── index.html         # Pantalla principal de horarios y registro diario.
    ├── app.js             # Navegación diaria, edición y guardado de registros.
    ├── stats.html         # Pantalla de estadísticas de extracciones.
    ├── stats.js           # Filtros y gráfico diario de mililitros extraídos.
    ├── login.html         # Pantalla de inicio de sesión.
    ├── login.js           # Lógica de autenticación del usuario.
    ├── admin.html         # Panel de administración de usuarios.
    ├── admin.js           # Gestión de usuarios y configuración inicial.
    └── styles.css         # Estilos compartidos, temas claro/oscuro y diseño responsive.
```
