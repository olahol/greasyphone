package main

import (
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"sync"

	"github.com/gin-gonic/gin"
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

func MustSub(fsys fs.FS, dir string) fs.FS {
	f, err := fs.Sub(fsys, dir)

	if err != nil {
		panic(err)
	}

	return f
}

func main() {
	flag.Parse()

	roms := flag.Arg(0)

	if roms == "" {
		log.Fatalln("no rom dir")
	}

	r := gin.New()
	m := melody.New()
	g := &Game{}

	r.StaticFS("/jsnes/lib/", http.FS(MustSub(jsnesLibDir, "jsnes/lib")))
	r.StaticFS("/jsnes/source/", http.FS(MustSub(jsnesSourceDir, "jsnes/source")))
	r.StaticFS("/public/", http.FS(MustSub(publicDir, "public")))

	r.Static("/roms/", roms)

	r.GET("/", func(c *gin.Context) {
		c.Writer.Write(indexHTML)
	})

	r.GET("/ws", func(c *gin.Context) {
		m.HandleRequest(c.Writer, c.Request)
	})

	r.GET("/romlist", func(c *gin.Context) {
		files, _ := filepath.Glob(filepath.Join(roms, "*.nes"))
		c.JSON(200, gin.H{"roms": files})
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
				return
			}

			if g.Player2 == nil {
				g.Lock.Lock()
				g.Player2 = s
				s.Write(NewCommandJSON("whoami", "player2"))
				m.BroadcastOthers(NewCommandJSON("join", "player2"), s)
				g.Lock.Unlock()
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
			log.Printf("unknown command %s", cmd.Cmd)
		}
	})

	m.HandleDisconnect(func(s *melody.Session) {
		g.Lock.Lock()

		if s == g.Screen {
			g.Screen = nil
			m.BroadcastOthers(NewCommandJSON("part", "screen"), s)
		}

		if s == g.Player1 {
			g.Player1 = nil
			m.BroadcastOthers(NewCommandJSON("part", "player1"), s)
		}

		if s == g.Player2 {
			g.Player2 = nil
			m.BroadcastOthers(NewCommandJSON("part", "player2"), s)
		}

		g.Lock.Unlock()
	})

	r.Run(":5000")
}
