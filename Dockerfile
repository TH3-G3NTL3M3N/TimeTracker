# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
ARG VITE_LOGIN_USER
ARG VITE_LOGIN_PASS
ENV VITE_LOGIN_USER=$VITE_LOGIN_USER
ENV VITE_LOGIN_PASS=$VITE_LOGIN_PASS
RUN npm run build

# Production stage
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
