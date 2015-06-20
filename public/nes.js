(function (ctx) {
  "use strict";

  var player1Map = {
    "up": 38,
    "down": 40,
    "left": 37,
    "right": 39,
    "start": 13,
    "select": 17,
    "a": 88,
    "b": 90
  };

  var player2Map = {
    "up": 104,
    "down": 98,
    "left": 100,
    "right": 102,
    "start": 97,
    "select": 99,
    "a": 103,
    "b": 105
  };

  var NES = ctx.NES = function () {
    this.jsnes = null;
    this.screen = $("<canvas width='256' height='240'>");
    this.context = this.screen[0].getContext("2d");
    this.imageData = this.context.getImageData(0, 0, 256, 240);
    this.running = false;
  };

  NES.prototype.create = function () {
    if (this.jsnes) {
      throw new Error("jsnes already created");
    }

    this.jsnes = new JSNES({
      swfPath: "/jsnes/lib/",
      emulateSound: true
    });

    this.dynamicaudio = new DynamicAudio({
      swf: "/jsnes/lib/dynamicaudio.swf"
    });

    this.jsnes.ui.writeFrame = function (buffer, prevBuffer) {
      var data = this.imageData.data;
      var pixel, i, j;
      for (i = 0; i < 256 * 240; i++) {
        pixel = buffer[i];
        if (pixel !== prevBuffer[i]) {
          j = i * 4;
          data[j] = pixel & 0xFF;
          data[j + 1] = (pixel >> 8) & 0xFF;
          data[j + 2] = (pixel >> 16) & 0xFF;
          prevBuffer[i] = pixel;
        }
      }
      this.context.putImageData(this.imageData, 0, 0);
    }.bind(this);

    this.jsnes.ui.writeAudio = function (samples) {
      return this.dynamicaudio.writeInt(samples);
    }.bind(this);
  };

  NES.prototype.clear = function () {
    this.context.fillStyle = "black";
    this.context.fillRect(0, 0, 256, 240);
    for (var i = 3; i < this.imageData.data.length - 3; i += 4) {
      this.imageData.data[i] = 0xFF;
    }
  };

  NES.prototype.load = function (url, cb) {
    if (!this.jsnes) {
      throw new Error("jsnes must be created");
    }

    if (typeof cb !== "function") {
      throw new Error("must have a callback function");
    }

    $.ajax({
      url: escape(url),
      xhr: function() {
        var xhr = $.ajaxSettings.xhr();
        xhr.overrideMimeType("text/plain; charset=x-user-defined");
        return xhr;
      },
      complete: function(xhr, status) {
        if (status !== "success") {
          return cb(new Error("error loading " + url + " rom"));
        }

        this.jsnes.loadRom(xhr.responseText);
        cb();
      }.bind(this)
    });
  };

  NES.prototype.input = function (player, state, button) {
    if (!this.jsnes) {
      throw new Error("jsnes must be created");
    }

    if (player !== 1 && player !== 2) {
      throw new Error("player must be either 1 or 2");
    }

    if (state !== "keydown" && state !== "keyup") {
      throw new Error("state must be either keydown or keyup");
    }

    if (!(player1Map[button] > 0)) {
      throw new Error(button + " is not a valid button");
    }

    var map = player === 1 ? player1Map : player2Map;
    var e = new $.Event(state);
    var code = map[button];
    e.which = code;
    e.keyCode = code;

    if (state === "keydown") {
      this.jsnes.keyboard.keyDown(e);
    }

    if (state === "keyup") {
      this.jsnes.keyboard.keyUp(e);
    }
  };

  NES.prototype.start = function () {
    if (!this.jsnes) {
      throw new Error("jsnes must be created");
    }

    if (this.running) {
      return;
    }

    this.running = true;
    this.jsnes.start();
  };

  NES.prototype.stop = function () {
    if (!this.jsnes) {
      throw new Error("jsnes must be created");
    }

    if (!this.running) {
      return;
    }

    this.running = false;
    this.jsnes.stop();
    this.clear();
  };
}(this));
