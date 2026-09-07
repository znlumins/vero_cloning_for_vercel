package signaling

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"golang.org/x/net/websocket"
)

// Hub manages WebRTC signaling connections for VeroMeeting.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[string]*websocket.Conn // roomID → peerID → conn
}

// NewHub creates a new signaling hub.
func NewHub() *Hub {
	return &Hub{
		rooms: make(map[string]map[string]*websocket.Conn),
	}
}

// SignalMessage is the JSON envelope for signaling data.
type SignalMessage struct {
	Type     string          `json:"type"`     // "join", "offer", "answer", "ice-candidate", "leave"
	RoomID   string          `json:"room_id"`
	PeerID   string          `json:"peer_id"`
	TargetID string          `json:"target_id,omitempty"`
	Payload  json.RawMessage `json:"payload,omitempty"`
}

// Handler returns an http.Handler for WebSocket signaling.
func (h *Hub) Handler() http.Handler {
	return websocket.Handler(func(ws *websocket.Conn) {
		defer ws.Close()

		var peerID, roomID string
		defer func() {
			if peerID != "" && roomID != "" {
				h.removePeer(roomID, peerID)
				h.broadcast(roomID, peerID, SignalMessage{
					Type:   "leave",
					RoomID: roomID,
					PeerID: peerID,
				})
			}
		}()

		for {
			var msg SignalMessage
			if err := websocket.JSON.Receive(ws, &msg); err != nil {
				break
			}

			switch msg.Type {
			case "join":
				peerID = msg.PeerID
				roomID = msg.RoomID
				h.addPeer(roomID, peerID, ws)

				// Notify existing peers about new joiner
				h.broadcast(roomID, peerID, SignalMessage{
					Type:   "peer-joined",
					RoomID: roomID,
					PeerID: peerID,
				})

				// Send list of existing peers to new joiner
				peers := h.getPeers(roomID, peerID)
				peersJSON, _ := json.Marshal(peers)
				websocket.JSON.Send(ws, SignalMessage{
					Type:    "peers",
					RoomID:  roomID,
					PeerID:  peerID,
					Payload: peersJSON,
				})

				fmt.Printf("🔗 Peer %s joined room %s (%d peers)\n", peerID, roomID, len(peers)+1)

			case "offer", "answer", "ice-candidate":
				// Forward to target peer
				if msg.TargetID != "" {
					h.sendTo(roomID, msg.TargetID, msg)
				}

			case "leave":
				return
			}
		}
	})
}

func (h *Hub) addPeer(roomID, peerID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[roomID] == nil {
		h.rooms[roomID] = make(map[string]*websocket.Conn)
	}
	h.rooms[roomID][peerID] = conn
}

func (h *Hub) removePeer(roomID, peerID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[roomID]; ok {
		delete(room, peerID)
		if len(room) == 0 {
			delete(h.rooms, roomID)
		}
	}
}

func (h *Hub) getPeers(roomID, excludePeerID string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var peers []string
	if room, ok := h.rooms[roomID]; ok {
		for pid := range room {
			if pid != excludePeerID {
				peers = append(peers, pid)
			}
		}
	}
	return peers
}

func (h *Hub) broadcast(roomID, excludePeerID string, msg SignalMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	for pid, conn := range room {
		if pid == excludePeerID {
			continue
		}
		if err := websocket.JSON.Send(conn, msg); err != nil {
			log.Printf("broadcast to %s failed: %v", pid, err)
		}
	}
}

func (h *Hub) sendTo(roomID, targetPeerID string, msg SignalMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	room, ok := h.rooms[roomID]
	if !ok {
		return
	}
	conn, ok := room[targetPeerID]
	if !ok {
		return
	}
	if err := websocket.JSON.Send(conn, msg); err != nil {
		log.Printf("sendTo %s failed: %v", targetPeerID, err)
	}
}
