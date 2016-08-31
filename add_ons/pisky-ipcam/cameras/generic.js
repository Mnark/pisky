class camera {
    constructor() {
        const _videostream = 'videostream.cgi';
        const _controller = 'decoder_control.cgi';
        const _status = 'get_status.cgi';
        const _snapshot = 'snapshot.cgi'; // Warning, this returned invalid headers (LFLF instead of CRLFCRLF)
        const _user = 'loginuse';
        const _pass = 'loginpas';
        const COMMANDS = [{ name: 'up', value: 0 },
            { name: 'stop up', value: 1 },
            { name: 'down', value: 2 },
            { name: 'stop down', value: 3 },
            { name: 'left', value: 4 },
            { name: 'stop left', value: 5 },
            { name: 'right', value: 6 },
            { name: 'stop right', value: 7 },
            { name: 'small aperture', value: 8 },
            { name: 'stop small aperture', value: 9 },
            { name: 'large aperture', value: 10 },
            { name: 'stop large aperture', value: 11 },
            { name: 'focus close', value: 12 },
            { name: 'stop focus close', value: 13 },
            { name: 'focus far', value: 14 },
            { name: 'stop focus far', value: 15 },
            { name: 'zoom close', value: 16 },
            { name: 'stop zoom close', value: 17 },
            { name: 'zoom far', value: 18 },
            { name: 'stop zoom far', value: 19 },
            { name: 'auto patrol', value: 20 },
            { name: 'stop auto patrol', value: 21 },
            { name: 'close switch 1', value: 22 },
            { name: 'disconnect switch1', value: 23 },
            { name: 'close switch 2', value: 24 },
            { name: 'disconnect switch 2', value: 25 },
            { name: 'close switch 3', value: 26 },
            { name: 'disconnect switch 3', value: 27 },
            { name: 'close switch 4', value: 28 },
            { name: 'disconnect switch 4', value: 29 },
            { name: 'set preset1', value: 30 },
            { name: 'go to preset1', value: 31 },
            { name: 'upper left', value: 90 },
            { name: 'upper right', value: 91 },
            { name: 'down left', value: 92 },
            { name: 'down right', value: 93 },
            { name: 'io output high', value: 94 },
            { name: 'io output low', value: 95 },
            { name: 'motor test', value: 255 }
        ];

        this.getCommands = function () {
            return COMMANDS;
        }

        this.videostream = function (url, user, password) {
            return url + _videostream + '?' + _user + '=' + user + '&' + _pass + '=' + password;
        }

        this.controller = function (url, user, password) {
            return url + _controller + '?' + _user + '=' + user + '&' + _pass + '=' + password;
        }
        this.status = function (url, user, password) {
            return url + _status + '?' + _user + '=' + user + '&' + _pass + '=' + password;
        }

        this.snapshot = function (url, user, password) {
            return url + _snapshot + '?' + _user + '=' + user + '&' + _pass + '=' + password;
        }
    }

    get commands() {
        return this.getCommands();
    }

    videostream(url, user, password) {
        return this.videostream();
    }

    controller(url, user, password) {
        return this.controller(url, user, password);
    }

    status(url, user, password) {
        return this.status(url, user, password);
    }

    snapshot(url, user, password) {
        return this.snapshot(url, user, password);
    }
}
module.exports = new camera;