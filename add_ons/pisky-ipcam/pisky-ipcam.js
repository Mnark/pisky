var Thing = require('pisky').Thing;
var http = require('http');
var MjpegProxy = require('mjpeg-proxy').MjpegProxy;
var fs = require('fs');

class PiskyIpCam extends Thing {
    constructor(options, callback) {
        if (!options.html) {
            options.html = "/pisky-ipcam.html"
        }
        options.type =  "camera";
        super(options);

        var self = this;
        self.snapshotTime = null;
        self.cameraConfig = require(__dirname + "/cameras/generic");
        self.mjpegproxy = new MjpegProxy(self.cameraConfig.videostream(options.url, options.user, options.password));
        self.image = options.image || '/' + self.id + '.mjpg';
        self.img = '/img' + self.id + '.jpg'

        self.getImg = function (req, res) {
            if (self.snapshotTime == null || Date.now().valueOf() - self.snapshotTime > 30000) {
                http.get(self.cameraConfig.snapshot(options.url, options.user, options.password), function (response) {
                    response.on("data", function (chunk) {
                        fs.writeFileSync('./camera-screenshot.jpg', chunk)
                        self.snapshotTime = Date.now().valueOf();
                        res.send(chunk);;
                    });
                }).on('error', function (e) {
                    console.log("Error taking snapshot from camera: " + JSON.stringify(e));
                    res.send(fs.readFileSync(__dirname + '/public/images/ipcam.png'));
                });
            } else {
                res.send(fs.readFileSync('./camera-screenshot.jpg'));
            }
        };

        this._appuse.push(__dirname + "/public");
        this._appget.push({ path: self.image, callback: self.mjpegproxy.proxyRequest });
        this._appget.push({ path: self.img, callback: self.getImg });

        this.videoProviders.push(options.url + self.image);

        this.on('command', function (data) {
            for (var index = 0; index < self.cameraConfig.commands.length; index++) {
                if ( self.cameraConfig.commands[index].name == data.command) {
                    http.get(self.cameraConfig.controller(options.url, options.user, options.password) + '&command=' + self.cameraConfig.commands[index].value + '&onestep=0', function (res) {
                        //console.log('Ip Cam Status:' + res.statusCode)
                    });
                    break;
                };
            }
        });

        this.on('feedback', function (data) {
            if (data.feedback == 'faceDetected') {
                //console.log("faceDetected at :" + JSON.stringify(data.result));
                var midX = data.result[0] + (data.result[2]) / 2
                var midY = data.result[1] + (data.result[3]) / 2
                console.log("MidX at :" + midX + ' midY at : ' + midY);
                if (midX < 310) {
                    if (midY < 230) {
                        http.get(controlurl + '&command=90&onestep=0', function (res) {
                            console.log('move up & left')
                            setTimeout(function () { http.get(controlurl + '&command=1&onestep=0') }, 50)
                        });
                    } else {
                        if (midY > 250) {
                            http.get(controlurl + '&command=91&onestep=0', function (res) {
                                console.log('move down & left')
                                setTimeout(function () { http.get(controlurl + '&command=1&onestep=0') }, 50)
                            });
                        } else {
                            http.get(controlurl + '&command=4&onestep=0', function (res) {
                                console.log('move left')
                                setTimeout(function () { http.get(controlurl + '&command=5&onestep=0') }, 50)
                            });
                        }
                    }

                } else {
                    if (midX > 330) {
                        if (midY < 230) {
                            http.get(controlurl + '&command=92&onestep=0', function (res) {
                                console.log('move up & right')
                                setTimeout(function () { http.get(controlurl + '&command=1&onestep=0') }, 50)
                            });
                        } else {
                            if (midY > 250) {
                                http.get(controlurl + '&command=93&onestep=0', function (res) {
                                    console.log('move down & right')
                                    setTimeout(function () { http.get(controlurl + '&command=1&onestep=0') }, 50)
                                });
                            } else {
                                http.get(controlurl + '&command=6&onestep=0', function (res) {
                                    console.log('move right')
                                    setTimeout(function () { http.get(controlurl + '&command=7&onestep=0') }, 50)
                                });

                            }
                        }
                    } else {
                        if (midY < 230) {
                            http.get(controlurl + '&command=0&onestep=0', function (res) {
                                console.log('move up')
                                setTimeout(function () { http.get(controlurl + '&command=1&onestep=0') }, 50)
                            });
                        } else {
                            if (midY > 250) {
                                http.get(controlurl + '&command=2&onestep=0', function (res) {
                                    console.log('move down')
                                    setTimeout(function () { http.get(controlurl + '&command=3&onestep=0') }, 50)
                                });
                            }
                        }
                    }
                }
            } else {
                console.log("feedback received :" + JSON.stringify(data));
            }
        });

        http.get(self.cameraConfig.status(options.url, options.user, options.password), function (res) {
            //console.log("Got response: " + res.statusCode);
            res.on("data", function (chunk) {
                var a = '{' + chunk.toString().replace(/var /g, '"').replace(/;/g, ',').replace(/=/g, '":');
                var c = a.substr(0, a.lastIndexOf(',')) + "}";
                var options = JSON.parse(c);
                self.id = options.deviceid;
                self.emit('ready', options);
            });
        }).on('error', function (e) {
            console.log("Error connecting to camera: " + e.message);
        });
    }
};

module.exports = PiskyIpCam;