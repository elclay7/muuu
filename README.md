# muuu
Lactancia - Horarios de alimentación

## Despliegue con Docker y Portainer

El servicio usa `nginx:alpine` y sirve el contenido estático desde:

`/storage/webservices/alimentacion-emma/html`

La carpeta `/storage/webservices/alimentacion-emma/db` queda reservada para la
persistencia futura y no es modificada por este despliegue.
El compose publica el sitio en el puerto `8083` del servidor.

```sh
mkdir -p /storage/webservices/alimentacion-emma/html \
	/storage/webservices/alimentacion-emma/db
cp -R docs/. /storage/webservices/alimentacion-emma/html/
docker compose up -d
```

En Portainer, crea un Stack desde este repositorio (`main`) usando
`docker-compose.yml`. La ruta del volumen es del host donde corre Docker, no del
equipo desde el que abras Portainer.

### Actualizaciones recomendadas

Para este caso recomiendo GitHub Actions con el webhook de Portainer. Así
Portainer sigue siendo el dueño del stack, mientras Actions actualiza el
contenido y solicita un redeploy limpio.

El flujo queda así:

1. Push a `main`.
2. GitHub Actions prepara la nueva versión en una carpeta temporal del servidor.
3. Reemplaza `/storage/webservices/alimentacion-emma/html` sin tocar `db`.
4. Llama al webhook de Portainer; Portainer detiene y vuelve a crear el contenedor.

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
