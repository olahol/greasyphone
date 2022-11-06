# greasyphone

> Play NES using smartphones as a joypads.

![demo](https://cdn.rawgit.com/olahol/greasyphone/master/demo.gif "Demo using devtools instead of a mobile cause I couldn't capture anything else.")

## Usage

You will need to have your own ROMs in the `roms/` directory with the extensions `.nes`.

    $ git clone --recursive https://github.com/olahol/greasyphone
    $ go get
    $ go build
    $ ./greasyphone ./roms
    $ $BROWSER http://localhost:5000
