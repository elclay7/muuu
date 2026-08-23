# muuu
Lactancia - Horarios de alimentación

## Despliegue con Docker y Portainer

El servicio usa `nginx:alpine` como proxy y un backend Python con SQLite. El
contenido estático se sirve desde:

`/storage/webservices/alimentacion-emma/html`

Los contenedores se llaman `ws-app` (Nginx) y `ws-db` (backend SQLite). La base
SQLite no usa un contenedor separado: se persiste en
`/storage/webservices/alimentacion-emma/db`.

La configuración de Nginx se incorpora en la imagen mediante
`Dockerfile.nginx`; no se monta ningún archivo `nginx.conf` desde el servidor.
Por eso, en `/storage/webservices/alimentacion-emma` solo deben existir `html`
y `db`.

La carpeta `/storage/webservices/alimentacion-emma/db` queda reservada para la
persistencia futura y no es modificada por este despliegue.
El compose publica el sitio en el puerto `8083` del servidor.

```sh
mkdir -p /storage/webservices/alimentacion-emma/html \
	/storage/webservices/alimentacion-emma/db
cp -R docs/. /storage/webservices/alimentacion-emma/html/
docker compose up -d --build
```

En la primera visita, abre `/admin` para crear tu cuenta de administrador. Desde
ese panel crea el usuario familiar que utilizarán ambos padres. Los horarios,
intervalos y credenciales se almacenan en SQLite dentro de `db`. Una vez creado
el usuario, los intervalos se cambian directamente haciendo click en `cada X h`
desde la pantalla principal. `/admin` no aparece como opción de navegación y
solo acepta sesiones con rol administrador.

En Portainer, crea un Stack desde este repositorio (`main`) usando
`docker-compose.yml`. La ruta del volumen es del host donde corre Docker, no del
equipo desde el que abras Portainer.

### Actualizaciones recomendadas

Para este caso recomiendo GitHub Actions con el webhook de Portainer. Así
Portainer sigue siendo el dueño del stack, mientras Actions actualiza el
contenido y solicita un redeploy limpio.

El flujo queda así:

1. Push a `main`.
2. GitHub Actions sincroniza `docs/` dentro de
	`/storage/webservices/alimentacion-emma/html`, eliminando archivos antiguos
	sin reemplazar la carpeta montada por Docker.
3. No modifica `/storage/webservices/alimentacion-emma/db`.
4. Portainer obtiene del repositorio el backend, Nginx y Compose, y reconstruye
	las imágenes antes del redeploy.
5. Portainer reconstruye el backend y vuelve a crear los dos contenedores.

El workflow está en `.github/workflows/deploy.yml`. Configura estos secretos del
repositorio: `DEPLOY_HOST`, `DEPLOY_USER`, `SSH_PRIVATE_KEY` y
`PORTAINER_WEBHOOK_URL` y `SSH_PORT`. Para GitHub Actions configura
`SSH_PORT=75422`, que es el puerto SSH publicado desde Internet. El puerto `22`
es el acceso desde la red interna.

El workflow obtiene automáticamente la clave pública del host mediante
`ssh-keyscan` en el puerto definido en `SSH_PORT` (`75422` para acceso externo),
por lo que no necesitas crear
el secreto `DEPLOY_KNOWN_HOSTS`. El webhook debe ser el endpoint de redeploy del stack en
Portainer; no lo expongas en el repositorio ni lo guardes como texto plano.
