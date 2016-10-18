var Thing = require('pisky').Thing
process.binding('http_parser').HTTPParser = require('http-parser-js').HTTPParser;
var http = require('http')
var MjpegProxy = require('mjpeg-proxy').MjpegProxy
var fs = require('fs')
var path = require('path')
var serveStatic = require('serve-static')

class PiskyIpCam extends Thing {
    constructor(options, callback) {
        super(options);
        if (this.getParameter('name') == undefined) { this.setParameter('name', 'IP Camera') }
        if (this.getParameter('description') == undefined) { this.setParameter('description', 'IP Camera') }
        //this.setParameter("baseDir", __dirname)
        this.serve = serveStatic( __dirname + '/public').bind(this)
        this.html = "pisky-ipcam.html"
        this.img = "images/ipcam.png"
        this.type = "camera"
        this.action = 'navigate'
        if (this.getParameter('video') == undefined) { this.setParameter('video', 'video.mjpg', true) }
        if (this.getParameter('camUser') == undefined) { this.setParameter('camUser', '') }
        if (this.getParameter('camPassword') == undefined) { this.setParameter('camPassword', '') }
        if (this.getParameter('camUrl') == undefined) { this.setParameter('camUrl', '') }

        var mjpegproxy

        var snapshotTime = 0

        this.getVideo = function (req, res) {
            try {
                if (!mjpegproxy) {
                    mjpegproxy = new MjpegProxy(self.cameraConfig.videostream(self.getParameter('camUrl'), self.getParameter('camUser'), self.getParameter('camPassword')));
                }
                mjpegproxy.proxyRequest(req, res)
            } catch (e) {
                console.log('error reading video: ' + JSON.stringify(e))
                //                res.send(fs.readFileSync(__dirname + '/public/images/ipcam.png'));
            }
        }

        var getImg = function (req, res) {
            if (Date.now().valueOf() - snapshotTime > 30000) {
                self.snapshot = new Buffer(0)
                http.get(self.cameraConfig.snapshot(self.getParameter('camUrl'), self.getParameter('camUser'), self.getParameter('camPassword')), function (response) {
                    response.on("data", function (chunk) {
                        //fs.writeFileSync('./camera-screenshot.jpg', chunk)
                        self.snapshot = Buffer.concat([self.snapshot, chunk])
                        //snapshotTime = Date.now().valueOf()
                        //res.send(chunk)
                    })
                    response.on("end", function (chunk) {
                        if (chunk) {
                            self.snapshot = Buffer.concat([self.snapshot, chunk])
                        }
                        fs.writeFileSync('./camera-screenshot.jpg', self.snapshot)
                        snapshotTime = Date.now().valueOf()
                        res.send(self.snapshot)
                    })
                }).on('error', function (e) {
                    console.log("Error taking snapshot from camera: " + JSON.stringify(e))
                    res.send(fs.readFileSync(__dirname + '/public/images/ipcam.png'))
                })
            } else {
                res.send(fs.readFileSync('./camera-screenshot.jpg'))
            }
        }

        var self = this;
        self.snapshot
        self.cameraConfig = require(__dirname + "/cameras/generic");

        //this._appget.push({ path: this.getParameter('id') + '/video', callback: this.getVideo })
        this._appget.push({ path: '/img', callback: getImg })
        this._appget.push({ path: '/video.mjpg', callback: this.getVideo })
        //this._appuse.push(path.normalize(__dirname + "/public"))

        this.videoProviders.push(self.video);

        this.on('command', function (data) {
            switch (data.command) {
                case 'Update':
                    console.info('IPCam received request to update a device with data:' + JSON.stringify(data.value))
                    for (var prop in data.value) {
                        this.setParameter(data.value[prop].name, data.value[prop].value)
                    }
                    break
                default:
                    for (var index = 0; index < self.cameraConfig.commands.length; index++) {
                        if (self.cameraConfig.commands[index].name == data.command) {
                            http.get(self.cameraConfig.controller(self.getParameter('camUrl'), self.getParameter('camUser'), self.getParameter('camPassword')) + '&command=' + self.cameraConfig.commands[index].value + '&onestep=0', function (res) {
                                //console.log('Ip Cam Status:' + res.statusCode)
                            });
                            break;
                        };
                    }
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

        if (self.getParameter('camUrl')) {
            http.get(self.cameraConfig.status(self.getParameter('camUrl'), self.getParameter('camUser'), self.getParameter('camPassword')), function (res) {
                //console.log("Got response: " + res.statusCode);
                res.on("data", function (chunk) {
                    //console.info('IP Cam Status: ' + chunk.toString())
                    //var a = '{' + chunk.toString().replace(/var /g, '"').replace(/;/g, ',').replace(/=/g, '":')
                    //var c = a.substr(0, a.lastIndexOf(',')) + "}"
                    //var options = JSON.parse(c)
                    //self.emit('ready', options);
                });
            }).on('error', function (e) {
                console.log("Error connecting to camera: " + e.message)
            })
        }
    }

    getVideo(req, res) {
        return this.getVideo
    }
};

module.exports = PiskyIpCam;