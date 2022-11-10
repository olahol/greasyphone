package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

	"github.com/olahol/melody"
)

var (
	//go:embed jsnes/source/*.js
	jsnesSourceDir embed.FS

	//go:embed jsnes/lib/*.js
	jsnesLibDir embed.FS

	//go:embed public/*
	publicDir embed.FS

	//go:embed index.html
	indexHTML []byte
)

type Command struct {
	Cmd  string `json:"cmd"`
	Data string `json:"data"`
}

func NewCommandJSON(cmd string, data string) []byte {
	res := &Command{cmd, data}
	byt, _ := json.Marshal(res)
	return byt
}

type Game struct {
	Screen  *melody.Session
	Player1 *melody.Session
	Player2 *melody.Session
	Lock    sync.Mutex
}

func (g *Game) Status() []byte {
	data := ""

	if g.Screen != nil {
		data += "screen,"
	}

	if g.Player1 != nil {
		data += "player1,"
	}

	if g.Player2 != nil {
		data += "player2,"
	}

	return NewCommandJSON("status", data)
}

func main() {
	port := flag.Int("p", 5000, "port to listen on")

	flag.Parse()

	roms := flag.Arg(0)

	if roms == "" {
		log.Fatalln("no rom dir")
	}

	files, err := filepath.Glob(filepath.Join(roms, "*.nes"))

	if err != nil {
		log.Fatalln(err)
	}

	m := melody.New()
	g := &Game{}

	http.Handle("/jsnes/lib/", http.FileServer(http.FS(jsnesLibDir)))
	http.Handle("/jsnes/source/", http.FileServer(http.FS(jsnesSourceDir)))
	http.Handle("/public/", http.FileServer(http.FS(publicDir)))
	http.Handle("/roms/", http.StripPrefix("/roms/", http.FileServer(http.Dir(roms))))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}

		w.Write(indexHTML)
	})

	http.HandleFunc("/romlist", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(strings.Join(files, ",")))
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		m.HandleRequest(w, r)
	})

	m.HandleConnect(func(s *melody.Session) {
		s.Write(g.Status())
	})

	m.HandleMessage(func(s *melody.Session, msg []byte) {
		cmd := &Command{}
		err := json.Unmarshal(msg, cmd)

		if err != nil {
			log.Println(err)
			return
		}

		switch cmd.Cmd {
		case "screen":
			if g.Screen == nil {
				g.Lock.Lock()
				g.Screen = s
				s.Write(NewCommandJSON("whoami", "screen"))
				m.BroadcastOthers(NewCommandJSON("join", "screen"), s)
				g.Lock.Unlock()
				log.Println("screen connected")
				return
			}

			s.Write(NewCommandJSON("whoami", "notscreen"))
		case "player":
			if g.Player1 == nil {
				g.Lock.Lock()
				g.Player1 = s
				s.Write(NewCommandJSON("whoami", "player1"))
				m.BroadcastOthers(NewCommandJSON("join", "player1"), s)
				g.Lock.Unlock()
				log.Println("player 1 connected")
				return
			}

			if g.Player2 == nil {
				g.Lock.Lock()
				g.Player2 = s
				s.Write(NewCommandJSON("whoami", "player2"))
				m.BroadcastOthers(NewCommandJSON("join", "player2"), s)
				g.Lock.Unlock()
				log.Println("player 2 connected")
				return
			}

			s.Write(NewCommandJSON("whoami", "notplayer"))
		case "keyup", "keydown":
			if g.Screen != nil && (s == g.Player1 || s == g.Player2) {
				var player string
				if s == g.Player1 {
					player = "player1"
				}

				if s == g.Player2 {
					player = "player2"
				}

				g.Screen.Write(NewCommandJSON(player, cmd.Cmd+" "+cmd.Data))
			}
		default:
			log.Printf("unknown command %s\n", cmd.Cmd)
		}
	})

	m.HandleDisconnect(func(s *melody.Session) {
		g.Lock.Lock()

		if s == g.Screen {
			g.Screen = nil
			m.BroadcastOthers(NewCommandJSON("part", "screen"), s)
			log.Println("screen disconnected")
		}

		if s == g.Player1 {
			g.Player1 = nil
			m.BroadcastOthers(NewCommandJSON("part", "player1"), s)
			log.Println("player 1 disconnected")
		}

		if s == g.Player2 {
			g.Player2 = nil
			m.BroadcastOthers(NewCommandJSON("part", "player2"), s)
			log.Println("player 2 disconnected")
		}

		g.Lock.Unlock()
	})

	log.Printf("listening on http://localhost:%d", *port)

	http.ListenAndServe(fmt.Sprint(":", *port), nil)
}
