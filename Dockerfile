# Static site: no build step, nginx just serves the files.
# Unprivileged nginx runs as uid 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY src/       /usr/share/nginx/html/src/
# Default (example) inventory. Deployments mount their own file over config/.
COPY config/    /usr/share/nginx/html/config/
