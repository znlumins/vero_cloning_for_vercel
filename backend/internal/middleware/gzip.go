package middleware

import (
	"bufio"
	"compress/gzip"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

// gzipWriter wraps http.ResponseWriter to transparently gzip the response body.
// It also forwards the Hijacker (needed by WebSocket handlers behind this
// middleware) and Flusher interfaces so streaming keeps working.
type gzipWriter struct {
	http.ResponseWriter
	gz *gzip.Writer
}

func (g *gzipWriter) Write(b []byte) (int, error) { return g.gz.Write(b) }

func (g *gzipWriter) Flush() {
	_ = g.gz.Flush()
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (g *gzipWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := g.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, errors.New("http.Hijacker not supported")
}

// Reuse gzip.Writer allocations across requests to avoid GC pressure.
var gzPool = sync.Pool{New: func() any { return gzip.NewWriter(io.Discard) }}

// Gzip compresses responses for clients that send `Accept-Encoding: gzip`.
// WebSocket upgrades are passed through untouched (compressing them would break
// the Hijack + framing).
func Gzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip when the client can't take gzip, or this is a WebSocket upgrade.
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") ||
			r.Header.Get("Upgrade") != "" ||
			strings.EqualFold(r.Header.Get("Connection"), "upgrade") {
			next.ServeHTTP(w, r)
			return
		}

		gz := gzPool.Get().(*gzip.Writer)
		gz.Reset(w)
		defer func() {
			_ = gz.Close()
			gzPool.Put(gz)
		}()

		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Add("Vary", "Accept-Encoding")
		w.Header().Del("Content-Length") // body length changes after compression
		next.ServeHTTP(&gzipWriter{ResponseWriter: w, gz: gz}, r)
	})
}
