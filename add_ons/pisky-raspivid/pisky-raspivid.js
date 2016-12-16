var Thing = require('pisky').Thing
var path = require('path')
var serveStatic = require('serve-static')
var raspivid = require('raspivid')
var avconv = require('avconv')
var EventEmitter = require('events').EventEmitter

var child = require('child_process');

class raspistill extends EventEmitter {
    constructor(options) {
        options = options || {};
        super()

        var cmd = [
            'raspistill --nopreview'
        ]
        Object.keys(options || {}).forEach(function (key) {
            cmd = cmd + ' --' + key
            var val = options[key];
            if (val || val === 0) {
                cmd = cmd + ' ' + val
            }
        })
        cmd = cmd + ' -o -'

        child.exec(cmd, { "encoding": "buffer", "maxBuffer": 1000 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`)
                this.emit('error', error)
                return;
            }
            this.emit('end', stdout)
        })
    }
}

class PiskyRaspivid extends Thing {
    constructor(options, callback) {
        super(options);
        if (this.getParameter('name') == undefined) { this.setParameter('name', 'Pi Camera') }
        if (this.getParameter('description') == undefined) { this.setParameter('description', 'Raspberry Pi Camera Module') }
        this.serve = serveStatic(__dirname + '/public').bind(this)
        this.html = "pisky-raspivid.html"
        this.img = "images/raspivid.png"
        this.type = "camera"
        this.action = 'navigate'

        if (this.getParameter('video') == undefined) {
            this.setParameter('video', 'video.mp4', true)
        }
        if (this.getParameter('cameraOptionsImage') == undefined) {
            this.setParameter('cameraOptionsImage', '{ "width": 800, "height": 600, "timeout": 1, "verbose": "" }')
        }
        if (this.getParameter('cameraOptionsVideo') == undefined) {
            this.setParameter('cameraOptionsVideo', '{"width": 640, "height": 480, "timeout": 0, "framerate": 25, "intra": 125, "bitrate": 1000000, "inline": "" , "profile": "high", "verbose":""}')

        }
        if (this.getParameter('cameraMode') == undefined) {
            this.cameraMode = this.setParameter('mode', 'jpg')
        }

        switch (this.getParameter('mode')) {
            case 'jpg':
                break
            case 'mjpeg':
                break
            case 'stream':
                this.video = raspivid(this.cameraOptions)
                this.video.on('error', (err) => {
                    console.log('RASPIVID Error:' + err)
                })

                console.log('RASPIVID STARTED Framerate: ' + this.cameraOptions.framerate)

                var params = [
                    '-i', 'pipe:0', // Tell avconv to expect an input stream (via its stdin) 
                    '-f', 'hls',
                    '-hls_time', 5,
                    '-an',
                    '-c:v', 'copy',
                    'pipe:null'        // Tell avconv to stream the converted data (via its stdout) 
                ];

                //       params = [
                //            '-i', 'pipe:0', // Tell avconv to expect an input stream (via its stdin) 
                //            //'-g', '52', //Keyframe at least every 52 frames
                //            //'-f', 'mp4',
                //            //'-f', 'h264',
                //            '-f', 'segment',
                //            '-an',
                //            '-pre', 'baseline',
                //            //'-reset_timestamps', 1, 
                //            //'-movflags', 'frag_keyframe+empty_moov',
                //            //'-movflags', 'faststart',
                //            '-movflags', 'faststart+frag_keyframe+separate_moof+omit_tfhd_offset+empty_moov',
                //            //'-frag_size', '16384',
                //            //'-frag_duration', 4000,
                //            //'-c:v', 'h264',
                //            '-c:v', 'copy',
                //            'pipe:null'        // Tell avconv to stream the converted data (via its stdout) 
                //            //            'pipe:1'        // Tell avconv to stream the converted data (via its stdout) 
                //        ];

                //var params = [
                //    '-i', 'pipe:0', // Tell avconv to expect an input stream (via its stdin) 
                //    '-f', 'mpjpeg',
                //    '-an',
                //'-movflags', 'faststart',
                //    'pipe:1'        // Tell avconv to stream the converted data (via its stdout) 
                //];
                //'-f', 'mp4',
                //'-movflags', 'faststart'
                //'-vcodec', 'libx264',
                //'-c:v',

                this.stream = avconv(params, false);

                this.stream.on('error', function (err) {
                    console.log('AVCONV Error:' + err)
                })
                this.stream.on('message', function (data) {
                    //console.log('AVCONV Message:' + data)
                })
                this.stream.once('exit', function (exitCode, signal, metadata) {
                    console.log('AVCONV Exit:' + exitCode)
                })
                this.stream.once('data', function (chunk) {
                    console.log('AVCONV Streaming commenced: ' + chunk.length + ' bytes')
                })

                var piped = false;

                this.video.pipe(this.stream);
                piped = true
                break
            default:
                this.setParameter('mode', 'jpg')
        }

        console.log(`Pi cam starting in %s mode`, this.getParameter('mode'))

        this.getVideo = function (req, res) {
            if (this.getParameter('mode') != 'mp4'){
                console.log (`Pi Cam called for streaming while in %s mode`, this.getParameter('mode'))
                res.writeHead(500, 'System Error: Cannot access camera')
                res.end()
                return
            }
            console.log('Getting Raspberry video')
            try {
                if (!piped) {
                    this.video.pipe(this.stream);
                    piped = true
                }
                res.on('error', (err) => {
                    console.log('error writing to stream')
                })
                res.on('abort', (err) => {
                    console.log('response abort')
                })
                res.setHeader('X-Powered-By', 'Pisky')

                res.writeHead(200, 'OK', {
                    'Transfer-Encoding': 'chunked',
                    'Content-Type': 'video/mp4'
                    //'Accept-Ranges': 'bytes'
                })
                // Pipe a file into avconv 
                this.stream.pipe(res);
                var writeData = function (chunk) {
                    //console.log('writing ' + chunk.length + ' bytes to Response')
                    res.write(chunk)
                }

                this.stream.on('data', writeData)

                //this.stream.once('data', function (chunk) {
                //    console.log('started to stream data to Request: ' + chunk.length + ' bytes')
                //})

                console.log('Stream started: Pipe has ' + this.stream.listenerCount('data') + ' listeners')

                req.on('close', (err) => {  ///add 'end'
                    console.log('request closed')
                    //this.stream.unpipe(res)
                    this.stream.removeListener('data', writeData)
                    if (this.stream.listenerCount('data') == 0) {
                        //this.video.unpipe(this.stream)
                        //piped = false
                    }
                    console.log('Stream closed: Pipe has ' + this.stream.listenerCount('data') + ' data listeners')
                })
            } catch (e) {
                console.log('Exception : ' + e)
            }
        }.bind(this)

        this.getImage = (req, res) => {
            console.log()
            this.video = new raspistill(JSON.parse(this.getParameter('cameraOptionsImage')))
            this.video.on('end', (data) => {
                res.writeHead(200, 'OK', {
                    'Content-Type': 'image/jpg',
                    'Content-Length': data.length
                    //'Transfer-Encoding': 'chunked',
                })
                res.end(data)
            })
            this.video.on('error', (err) => {
                res.writeHead(500, 'System Error: Cannot access camera', {
                })
                res.end()
            })
        }


        this._appget.push({ path: '/video.mp4', callback: this.getVideo })
        this._appget.push({ path: '/image.jpg', callback: this.getImage })
        this._appuse.push(path.normalize(__dirname + "/public"))
        this.videoProviders.push(this.video);

        this.on('command', function (data) {
            switch (data.command) {
                case 'Update':
                    console.info('IPCam received request to update data:' + JSON.stringify(data.value))
                    for (var prop in data.value) {
                        this.setParameter(data.value[prop].name, data.value[prop].value)
                    }
                    break
                default:
//                    for (var index = 0; index < self.cameraConfig.commands.length; index++) {
//                        if (self.cameraConfig.commands[index].name == data.command) {
//                            http.get(self.cameraConfig.controller(self.getParameter('camUrl'), self.getParameter('camUser'), self.getParameter('camPassword')) + '&command=' + self.cameraConfig.commands[index].value + '&onestep=0', function (res) {
//                                //console.log('Ip Cam Status:' + res.statusCode)
//                            });
//                            break;
//                        };
//                    }
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

    }

    getVideo(req, res) {
        return this.getVideo
    }
};

module.exports = PiskyRaspivid;