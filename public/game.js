(function (ctx) {
  "use strict";

  var Game = ctx.Game = function () {
    this.ws = null;
    this.whoami = null;
    this.rom = null;
    this.status = [];
    this.nes = new NES();
    this.$emulator = $("#emulator");
    this.$controller = $("#controller");
    this.$selector = $("#selector");
    this.$status = $("#status");
    this.$error = $("#error");
    this.cmd = this.cmd.bind(this);
    this.$selector.change(function (e, val) {
      this.handleSelect($(e.target).val());
    }.bind(this));
  };

  Game.prototype.connect = function () {
    var url = "ws://" + window.location.host + "/ws";
    this.ws = new WebSocket(url);
    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
  };

  Game.prototype.type = function () {
    if ("ontouchstart" in window) {
      return "player";
    }

    return "screen";
  };

  Game.prototype.cmd = function (cmd, data) {
    this.ws.send(JSON.stringify({cmd: cmd, data: data}));
  };

  Game.prototype.handleOpen = function () {
    this.cmd(this.type(), "");
  };

  Game.prototype.handleMessage = function (msg) {
    try {
      var json = JSON.parse(msg.data);
      switch (json.cmd) {
        case "status":
          this.handleStatus(json.data);
          this.updateStatus();
          break;
        case "whoami":
          this.handleWhoami(json.data);
          this.updateStatus();
          break;
        case "join":
          this.handleJoin(json.data);
          this.updateStatus();
          break;
        case "part":
          this.handlePart(json.data);
          this.updateStatus();
          break;
        case "player1":
          this.handlePlayer(1, json.data);
          break;
        case "player2":
          this.handlePlayer(2, json.data);
          break;
        default:
          console.error("unknown cmd " + json.cmd);
          break;
      }
    } catch (e) {
      console.error(msg, e);
    }
  };

  Game.prototype.handleStatus = function (data) {
    this.status = data.split(",").filter(function (p) {
      return p !== "";
    });

    if (this.ready()) {
      this.startPlaying();
    }
  };

  Game.prototype.handleWhoami = function (whoami) {
    this.whoami = whoami;

    if (this.whoami === "notscreen") {
      return this.showError("there is already a screen connected");
    }

    if (this.whoami === "notplayer") {
      return this.showError("there are already two players connected");
    }

    this.status.push(whoami);

    if (this.isScreen()) {
      this.showEmulator();
      this.getROMs();
    }

    if (this.isPlayer()) {
      this.showController();
    }

    if (this.ready()) {
      this.startPlaying();
    }
  };

  Game.prototype.handleJoin = function (data) {
    this.status.push(data);

    if (this.ready()) {
      this.startPlaying();
    }
  };

  Game.prototype.handlePart = function (data) {
    this.status = this.status.filter(function (p) {
      return p !== data;
    });

    if (this.isScreen() && this.nes.jsnes !== null && !this.ready()) {
      this.stopPlaying();
    }
  };

  Game.prototype.handlePlayer = function (player, data) {
    var key = data.split(" ");
    this.nes.input(player, key[0], key[1]);
  };

  Game.prototype.handleSelect = function (rom) {
    if (rom === "none") {
      this.rom = null;
      this.stopPlaying();
      return;
    }

    this.setROM(rom);
  };

  Game.prototype.showEmulator = function () {
    this.nes.create();
    this.nes.clear();
    this.$emulator.append(this.nes.screen);
    this.$emulator.show();
  };

  Game.prototype.showController = function () {
    this.$controller.show();

    var pad = document.getElementById("pad");

    pad.addEventListener("load", function () {
      var $doc = $(pad.getSVGDocument());

      var playerText = this.whoami === "player1" ? "PLAYER 1" : "PLAYER 2";
      $doc.find("#player").text(playerText);

      var registerKey = function (button, cb) {
        var $button = $doc.find("#" + button);

        $button.bind("touchstart", function (e) {
          cb("keydown", button);
        });

        $button.bind("touchend", function (e) {
          cb("keyup", button);
        });
      };

      registerKey("left", this.cmd);
      registerKey("right", this.cmd);
      registerKey("up", this.cmd);
      registerKey("down", this.cmd);
      registerKey("start", this.cmd);
      registerKey("select", this.cmd);
      registerKey("a", this.cmd);
      registerKey("b", this.cmd);

      registerKey("upleft", function (state) {
        this.cmd(state, "up");
        this.cmd(state, "left");
      }.bind(this));

      registerKey("upright", function (state) {
        this.cmd(state, "up");
        this.cmd(state, "right");
      }.bind(this));

      registerKey("downleft", function (state) {
        this.cmd(state, "down");
        this.cmd(state, "left");
      }.bind(this));

      registerKey("downright", function (state) {
        this.cmd(state, "down");
        this.cmd(state, "right");
      }.bind(this));
    }.bind(this), false);
  };

  Game.prototype.showError = function (msg) {
    this.$error.show();
    this.$error.text(msg);
  };

  Game.prototype.updateStatus = function () {
    if (!this.isScreen()) {
      return;
    }

    var connected = this.status.map(function (p) {
      return p.toUpperCase();
    }).join(", ");

    this.$status.text("CONNECTED: " + connected);
  };

  Game.prototype.getROMs = function () {
    var $sel = this.$selector;
    $.getJSON("/romlist", function (data) {
      $.each(data.roms, function (i, rom) {
        var $option = $("<option>");
        $option.text(rom);
        $option.val(rom);
        $sel.append($option);
      });
    });
  };

  Game.prototype.setROM = function (path) {
    this.rom = path;

    if (this.ready()) {
      this.startPlaying();
    }
  };

  Game.prototype.startPlaying = function () {
    if (this.nes.running) { return ; }

    this.nes.load(this.rom, function (err) {
      if (err) {
        return console.error(err);
      }

      this.nes.start();
    }.bind(this));
  };

  Game.prototype.stopPlaying = function () {
    this.nes.stop();
  };

  Game.prototype.isPlayer = function () {
    return this.whoami === "player1" || this.whoami === "player2";
  };

  Game.prototype.isScreen = function () {
    return this.whoami === "screen";
  };

  Game.prototype.ready = function () {
    return this.rom !== null && this.isScreen() && this.status.indexOf("player1") > -1;
  };
}(this));
