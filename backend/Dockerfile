# Vercel builds this service as a container image (vercel.json → services.backend.runtime = "container").
# The container must listen on the port Vercel injects as $PORT.
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=build /out/server /app/server
# Model files are read at startup by registry.LoadAll(cfg.ModelsDir).
COPY --from=build /src/models /app/models
ENV VERO_MODELS_DIR=/app/models
EXPOSE 8080
CMD ["/app/server"]
