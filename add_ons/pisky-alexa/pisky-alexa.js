var Thing = require('pisky').Thing;
var fs = require('fs');
var os = require("os");
var EventEmitter = require('events').EventEmitter;
var piskyParser = require('pisky-parser');
var auth = require('./authentication.js');
var crypto = require('crypto');
const REG_NUM_BYTES = 12;

class Alert extends EventEmitter {
    constructor(payload) {
        super();
        this.config = payload;
        //this.config.payload = payload;
        this.state = 'IDLE'
        console.log('Alert scheduledTime: ' + payload.scheduledTime);
        if (payload.type == 'TIMER') {
            var now = new Date();
            var timeToWait = Date.parse(payload.scheduledTime) - now.getTime();
            console.log('Alert set for %d milliseconds', timeToWait)
            this.timerId = setTimeout(function (payload) {
                console.log('Alert FIRED!!');
                this.state = 'FOREGROUND ALERT';
                this.super.emit('alert', payload);
            }, timeToWait, payload);
        }
    }
    cancel() {
        clearTimeout(this.timerId);
    }
    stringify() {
        console.log('Internal stringify of Alert' + JSON.stringify(this.config))
        return JSON.stringify(this.config);
    }
};

class PiskyAlexa extends Thing {
    constructor(options) {
        if (!options.name) { options.name = 'Alexa' }
        super(options);

        this._alerts = [];
        this._sessionId = auth.getSessionId();
        console.log('Session-id = ' + this._sessionId)

        var self = this;
        self.registered = false;
        if (this._sessionId) {
            self.registered = true;
        };
        console.log('Registered = ' + self.registered)
        var BOUNDARY = 'pisky-boundary';
        const BOUNDARY_DASHES = '--';
        const NEWLINE = '\r\n';
        const METADATA_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="metadata"';
        const METADATA_CONTENT_TYPE = 'Content-Type: application/json; charset=UTF-8';
        const AUDIO_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="audio"';
        const AUDIO_CONTENT_TYPE = 'Content-Type: application/octet-stream';

        self.html = "/pisky-alexa.html"
        self.http2 = require('http2');
        self.mic = require('mic');
        self.setState('mic', 'IDLE');

        self.image = options.image || '/images/alexa.png';
        self.img = '/images/alexa.png'
        self.connected = false;


        self.lastacivity = -1;


        self.getImg = function (req, res) {
            res.send(fs.readFileSync('/images/alexa.png'));
        };

        self.connect = function () {
            if (self.registered) {
                auth.getAccessToken(this.sessionId, function (err, json) {
                    if (err) {
                        console.log('Error: ' + err.message);
                        throw (err);
                    }
                    self.access_token = json.access_token;
                    console.log('Connecting...');
                    var options = {
                        protocol: 'https:',
                        hostname: 'avs-alexa-na.amazon.com',
                        port: 443,
                        path: '/v20160207/directives',
                        method: 'GET',
                        headers: {
                            "Authorization": 'Bearer ' + self.access_token
                        }
                    };

                    var req = self.http2.request(options, self.handleResponse);
                    req.on('response', function (response) {
                        var options2 = {
                            protocol: 'https:',
                            hostname: 'avs-alexa-na.amazon.com',
                            port: 443,
                            path: '/v20160207/events',
                            method: 'POST',
                            headers: {
                                "Authorization": 'Bearer ' + self.access_token,
                                "Content-Type": 'multipart/form-data; boundary=' + BOUNDARY
                            }
                        };

                        var req2 = self.http2.request(options2);
                        req2.on('error', function (e) {
                            console.log('problem with synchronise request: ' + e.message);
                        });

                        req2.on('response', function (response) {
                            console.log('AWS Sync STATUS:' + response.statusCode);
                            console.log('AWS Sync HEADERS:' + JSON.stringify(response.headers));
                            response.on('data', function (chunk) {
                                console.log(chunk.toString('utf8'));
                            })
                        });

                        req2.write(NEWLINE);
                        req2.write(BOUNDARY_DASHES + BOUNDARY + NEWLINE);
                        req2.write(METADATA_CONTENT_DISPOSITION + NEWLINE);
                        req2.write(METADATA_CONTENT_TYPE + NEWLINE);
                        req2.write(NEWLINE);
                        var json = {
                            "event": {
                                "header": {
                                    "namespace": "System",
                                    "name": "SynchronizeState",
                                    "messageId": self.createUuid
                                },
                                "payload": {
                                }
                            }
                        };
                        json.context = self.context;
                        //        console.log ('json messsage:' + JSON.stringify(json));
                        req2.write(JSON.stringify(json));
                        req2.write(NEWLINE);
                        req2.write(BOUNDARY_DASHES + BOUNDARY + BOUNDARY_DASHES + NEWLINE);
                        req2.end();
                    });
                    req.on('data', function (chunk) {
                        console.log('Downchannel data:' + chunk);
                    })
                    req.on('error', function (err) {
                        console.log('Downchannel error:' + err);
                    })
                    req.on('close', function () {
                        console.log('Downchannel closed');
                    })
                    req.end();
                    setInterval(self.ping, 300000);
                    setInterval(self.inactivity, 3600000);
                });
            }
        };

        self.authresponse = function (req, res) {cdls
            console.log('Code:' + JSON.stringify(req.query.code));
            auth.authresponse(req.query.code, req.query.state, function (err, msg) {
                if (err) {
                    console.log('Error:' + err.message);
                }
                console.log('Success:' + msg);
                res.end('Success! Please close this window and return to Pisky.')
                //self.emit('view', {'url':  url, 'target': 'regpanel'})
           });
        };

        self.recognise = function (req, res) {
            self.createEvent('Recognize');
            res.send()
        };

        self.createEvent = function (eventType, token) {
            //        self.createEvent = function (namespace, name, token) {
            console.info("Create Event Called... eventType:" + eventType + " token: " + token);
            if (self.registered) {
                var now = new Date();
                var eventObj;
                var json = {};
                json.context = self.context;
                switch (eventType) {
                    case 'Recognize':
                        self.lastacivity = now.getTime();
                        json.event = {
                            "header": {
                                "namespace": "SpeechRecognizer",
                                "name": "Recognize",
                                "messageId": self.createUuid,
                                "dialogRequestId": self.createUuid
                            },
                            "payload": {
                                "profile": "CLOSE_TALK",
                                "format": "AUDIO_L16_RATE_16000_CHANNELS_1"
                            }
                        }
                        break;

                    case 'SetAlertSucceeded':
                        json.event = {
                            "header": {
                                "namespace": "Alerts",
                                "name": "SetAlertSucceeded",
                                "messageId": self.createUuid
                            },
                            "payload": {
                                "token": token
                            }
                        }
                        break;

                    case 'SetAlertFailed':
                        json.event = {
                            "header": {
                                "namespace": "Alerts",
                                "name": "SetAlertFailed",
                                "messageId": self.createUuid
                            },
                            "payload": {
                                "token": token
                            }
                        }
                        break;

                    case 'SpeechStarted':
                        json.event = {
                            "header": {
                                "namespace": "SpeechSynthesizer",
                                "name": "SpeechStarted",
                                "messageId": self.createUuid
                            },
                            "payload": {
                                "token": token
                            }
                        };
                        break;

                    case 'SpeechFinished':
                        json.event = {
                            "header": {
                                "namespace": "SpeechSynthesizer",
                                "name": "SpeechFinished",
                                "messageId": self.createUuid
                            },
                            "payload": {
                                "token": token
                            }
                        };
                        break;

                    case 'UserInactivityReport':
                        json.event = {
                            "header": {
                                "namespace": "System",
                                "name": "UserInactivityReport",
                                "messageId": self.createUuid
                            },
                            "payload": {
                                "inactiveTimeInSeconds": token
                            }
                        }
                        break;

                    case 'ResetUserInactivity':
                        json.event = {
                            "header": {
                                "namespace": "System",
                                "name": "ResetUserInactivity",
                                "messageId": self.createUuid
                            },
                            "payload": {
                            }
                        }
                        break

                    default:
                        throw "TypeError: eventType was not a recognised value. Possible values are ['Recognize'|'SpeechStarted'|'SpeechFinished'|'SetAlertFailed']";
                }

                var options = {
                    protocol: 'https:',
                    hostname: 'avs-alexa-na.amazon.com',
                    port: 443,
                    path: '/v20160207/events',
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + self.access_token,
                        'Content-Type': 'multipart/form-data; boundary=' + BOUNDARY
                    }
                }

                var req = self.http2.request(options, self.handleResponse);
                req.on('error', function (e) {
                    console.log("request error:" + e);
                    //throw e;
                });

                req.write(NEWLINE);
                req.write(BOUNDARY_DASHES + BOUNDARY + NEWLINE);
                req.write(METADATA_CONTENT_DISPOSITION + NEWLINE);
                req.write(METADATA_CONTENT_TYPE + NEWLINE);
                req.write(NEWLINE);

                req.write(JSON.stringify(json));
                req.write(NEWLINE);

                switch (eventType) {
                    case 'Recognize':
                        req.write(BOUNDARY_DASHES + BOUNDARY + NEWLINE);
                        req.write('Content-Disposition: form-data; name="audio"' + NEWLINE);
                        req.write('Content-Type: application/octet-stream' + NEWLINE);
                        req.write(NEWLINE);

                        self.captureSpeech(req, function (err) {
                            if (err) {
                                console.log('ABORTING REQUEST :' + err);
                                req.end();
                            } else {
                                req.write(BOUNDARY_DASHES + BOUNDARY + BOUNDARY_DASHES + NEWLINE);
                                console.log('Sending speech recognition request.');
                                req.end();
                            };
                        });

                        break;
                    default:
                        req.write(BOUNDARY_DASHES + BOUNDARY + BOUNDARY_DASHES + NEWLINE);
                        console.log('Sending AVS  request. ' + eventType);
                        req.end();
                }
            } else {
                console.log('You must register with Amazon before you can use this device')
            }
        };

        self._processAlert = function (directive) {
            switch (directive.header.name) {
                case "SetAlert":
                    //try{
                    var alert = new Alert(directive.payload);
                    alert.on('alert', (directive) => {
                        console.log('Alert Fired: received by PA')
                        self.emit('alert', directive);
                    });
                    console.log('Alert: ' + alert.stringify());
                    this._alerts.push(alert);
                    self.createEvent('SetAlertSucceeded', directive.payload.token);
                    //} catch (e){
                    //    self.createEvent('SetAlertFailed');
                    //}
                    break;
                case "DeleteAlert":
                    var deleted = false;
                    for (var i = 0; i < this._alerts.length; i++) {
                        if (this._alerts[i].token == directive.payload.token) {
                            this._alerts[i].cancel();
                            self.createEvent('DeleteAlertSucceeded', directive.payload.token);
                            deleted = true;
                            continue;
                        }
                    }
                    if (!deleted) {
                        self.createEvent('DeleteAlertFailed', directive.payload.token);
                    }
                    break;
                default:
                    console.log('ToDo: processalert' + directive.header.name)
                    break;
            }

        };

        self.handleResponse = function (res) {
            console.log('****************************************');
            console.log('AVS RESPONSE STATUS: ' + res.statusCode);
            console.log('AVS RESPONSE HEADERS: ' + JSON.stringify(res.headers));
            //        res.on('data', (chunk) => {
            //            console.log('data: ' + chunk);
            //        })
            if (res.headers['content-type']) {
                //console.log('Creating new parser');
                var parser = new piskyParser(res);
                var directive;

                parser.on('error', (err) => {
                    console.log('Parse Error: ' + err);
                });

                parser.on('end', () => {
                    console.log('Parse End');
                });

                parser.on('part', (part) => {
                    console.log('Parsed part: ' + JSON.stringify(part));
                });

                parser.on('data', (chunk) => {
                    if (res.headers['content-type'].startsWith('application/json')) {
                        var reply = JSON.parse(chunk);
                        console.log('AVS RESPONSE Reply: ' + JSON.stringify(reply));
                        console.log('****************************************');
                    } else {
                        console.log('Parser emits data: ' + chunk);
                    }
                });

                parser.on('partdata', (part, chunk) => {
                    console.log('Parsed partdata: Content-type: ' + part.headers['content-type'] + ', ' + chunk.length + ' bytes of data');
                    if (part.headers['content-type'].startsWith('application/json')) {
                        directive = JSON.parse(chunk).directive;
                        switch (directive.header.namespace) {
                            case "Alerts":
                                self._processAlert(directive);
                                break;
                            default:
                                self.emit("directive", directive, null, function (stream) {
                                    console.log('Got a stream back? Type:' + stream);
                                    self.stream = stream;
                                });
                        }
                    };
                    if (part.headers['content-type'].startsWith('application/octet-stream')) {
                        self.stream.end(chunk);
                        self.createEvent('SpeechStarted', directive.payload.token);
                        //self.stream.on('end', function(){
                        //    console.log('Stream Ended - Complete');
                        //    self.createEvent('SpeechFinished', directive.payload.token);
                        //})
                        self.stream.on('close', function () {
                            console.log('Stream closed - Complete');
                            self.createEvent('SpeechFinished', directive.payload.token);
                        })
                        //self.stream.on('finish', function(){
                        //    console.log('Stream Finished - Complete');
                        //    self.createEvent('SpeechFinished', directive.payload.token);
                        //})
                    };

                });
            };
        };

        self.inactivity = function () {
            var now = new Date();
            self.createEvent('UserInactivityReport', (now - Date.parse(self.lastacivity)) / 1000);
        }

        self.ping = function () {
            var options = {
                protocol: 'https:',
                hostname: 'avs-alexa-na.amazon.com',
                port: 443,
                path: '/ping',
                method: 'GET',
                headers: {
                    "Authorization": 'Bearer ' + self.access_token
                }
            };

            var req = self.http2.request(options, function (response) {
                console.log('Ping Status:' + response.statusCode);
                //console.log('Ping headers:' + JSON.stringify(response.headers));
            });
            req.on('error', function (err) {
                console.log('Ping Error' + err);
            })
            req.end();
        }

        self.captureSpeech = function (request, callback) {
            //         self.setState('mic', 'IDLE');
            console.log('Capture Speech. State: ' + self.getState('mic'));
            if (self.getState('mic') != 'IDLE') {
                callback('Microphone in use');
                return;
            }
            self.dataWritten = 0;
            self.activeRequest = request;
            self.activeCallback = callback;
            var micInstance = self.mic({ 'rate': '16000', 'channels': '1', 'debug': false, 'exitOnSilence': 10, 'buffertime': 500, 'duration': 10 });
            self.micInputStream = micInstance.getAudioStream();
            self.micInputStream.on('data', function (data) {
                console.log('Mic data:' + data.length);
                if (self.activeRequest) {
                    self.activeRequest.write(data);
                    self.dataWritten = self.dataWritten + data.length;
                }
            });

            self.micInputStream.on('error', function (err) {
                self.activeCallback("Error in Input Stream. " + err);
                micInstance.stop();
            });

            self.micInputStream.on('startComplete', function () {
                self.setState('mic', 'BUSY');
                //console.log('Emitting status event')
                self.emit('status', self.states);
            });

            self.micInputStream.on('silence', function () {
                console.log("Got SIGNAL silence - ending recording");
                micInstance.stop();
            });

            self.micInputStream.on('audioProcessExitComplete', function () {
                console.log("Got SIGNAL audioProcessExitComplete");
                self.setState('mic', 'IDLE');
                self.emit('status', self.states);
                self.activeCallback();
            });

            micInstance.start();
            //micInputStream.pipe(outputFileStream);
            //                self.lastRecording = 'recordings/' + self.createUuid + '.raw';
            //var outputFileStream = fs.createWriteStream(self.lastRecording);
            //micInstance.start();
            //            } else {
            //                if (self.micState == 'PAUSED') {
            //                    micInstance.resume();
            //                    self.micState = 'BUSY'
            //                } else {
            //                    console.log('Microphone already in use. Request cancelled');
            //                    throw "Microphone already in use.";
            //                }
            //            }
        };

        self.on('command', function (data) {
            console.log('Alexa Received:' + JSON.stringify(data) + ' for target ' + data.data);
            switch (data.command) {
                case 'register':
                    self.register(data.data);
                    break;
                case 'start recording':
                    console.log('Starting recording!');
                    self.createEvent("Recognize");
                    break;
                case 'play recording':
                    var music = new sound(self.lastRecording);
                    music.play();
                    music.on('complete', function () {
                        console.log('Done with playback of recording!');
                    });
                    break;
                case 'play sample':
                    var music = new sound('900yearsold.wav');
                    music.play();
                    music.on('complete', function () {
                        console.log('Done with playback of sample!');
                    });
                    break;
            }
        });

        self._appget.push({ path: self.img, callback: self.getImg });
        self._appget.push({ path: '/provision/regCode', callback: auth.getRegCode });
        self._appget.push({ path: '/provision/accessToken', callback: auth.getAccessToken });
        self._appget.push({ path: '/provision/:regCode', callback: auth.getRegCode });
        self._appget.push({ path: '/authresponse', callback: self.authresponse });
        self._appget.push({ path: '/register', callback: self.register });
        self._appget.push({ path: '/recognise', callback: self.recognise });

        self.connect();
    }

    register(target) {
        var self = this;
        var productId = 'Pisky_Alexa'
        var missingProperties = [];
        var dsn = false;
        var interfaces = os.networkInterfaces();
        for (var i in interfaces) {
            if (dsn == false) {
                var net = interfaces[i];
                for (var j in net) {
                    if (net[j].family == 'IPv4' && net[j].address != '127.0.0.1') {
                        dsn = net[j].mac;
                        console.log('dsn = ' + dsn)
                        break;
                    }
                }
            }
        }

        if (!dsn) {
            console.log("Failed to find MAC address for Alexa registration");
        }
        var sessionId = super.createUuid;

        crypto.randomBytes(REG_NUM_BYTES, function (err, regCodeBuffer) {
            if (err) {
                console.log("failed on generate bytes", err);
                //callback(error("InternalError", "Failure generating code", 500));
                return;
            } else {
                this.regCode = regCodeBuffer.toString('hex');

                console.log('This id = ' + sessionId)

                auth.state.sessionIds.push(sessionId);
                auth.state.regCodeToSessionId[this.regCode] = sessionId;
                auth.state.sessionIdToDeviceInfo[sessionId] = {
                    productId: productId,
                    dsn: dsn,
                };

                fs.writeFile('./cookie.js', JSON.stringify(auth.state));
                console.log('Reg Code:' + this.regCode + ' | Session Id:' + sessionId)
                //auth.register(this.regCode, res, function (response) {
                auth.register(this.regCode, target, function (err, url, target) {
                    console.log('url: ' + url);
                    console.log('target: ' + target);
                    self.emit('view', {'url':  url, 'target': target})
                });
            }
        });
    }

    register2(req, res) {
        var productId = 'Pisky_Alexa'
        var missingProperties = [];
        var dsn = false;
        var interfaces = os.networkInterfaces();
        for (var i in interfaces) {
            if (dsn == false) {
                var net = interfaces[i];
                for (var j in net) {
                    if (net[j].family == 'IPv4' && net[j].address != '127.0.0.1') {
                        dsn = net[j].mac;
                        console.log('dsn = ' + dsn)
                        break;
                    }
                }
            }
        }

        if (!dsn) {
            console.log("Failed to find MAC address for Alexa registration");
        }
        this.sessionId = super.createUuid;
        console.log('This id = ' + this.sessionId)

        crypto.randomBytes(REG_NUM_BYTES, function (err, regCodeBuffer) {
            if (err) {
                console.log("failed on generate bytes", err);
                //callback(error("InternalError", "Failure generating code", 500));
                return;
            } else {
                this.regCode = regCodeBuffer.toString('hex');
                console.log('This id = ' + this.sessionId)

                auth.state.sessionIds.push(this.sessionId);
                auth.state.regCodeToSessionId[this.regCode] = this.sessionId;
                auth.state.sessionIdToDeviceInfo[this.sessionId] = {
                    productId: productId,
                    dsn: dsn,
                };

                fs.writeFile('./cookie.js', JSON.stringify(auth.state));
                console.log('Reg Code:' + this.regCode + ' | Session Id:' + this.sessionId)
                //auth.register(regCode, res, function (response) {
                //    console.log('STATUS:' + response.statusCode);
                //    console.log('Response:' + JSON.stringify(response.headers));
                //    console.log('Access Token: ' + response.statusCode);
                //});
            }
        });
    }

    get config() {
        var config = super.config;
        //       var config = {};
        //console.log('config before timers: ' + JSON.stringify(config))
        //console.log ('timers: ' + JSON.stringify(this._alerts))
        config.timers = [];
        for (var alert in this._alerts) {
            config.timers.push(this._alerts[alert].config);
        }
        //console.log('Config after  timers: ' + JSON.stringify(config))
        return config;
    }

    get context() {
        var context = [];
        //self.emit("AudioPlayerStatus", function () {
        //});
        context.push({
            "header": {
                "namespace": "AudioPlayer",
                "name": "PlaybackState"
            },
            "payload": {
                "token": "",
                "offsetInMilliseconds": 0,
                "playerActivity": "IDLE"
            }
        });
        context.push({
            "header": {
                "namespace": "Alerts",
                "name": "AlertsState"
            },
            "payload": {
                "allAlerts": [],
                "activeAlerts": []
            }
        });
        context.push({
            "header": {
                "namespace": "Speaker",
                "name": "VolumeState"
            },
            "payload": {
                "volume": 50,
                "muted": false
            }
        });
        //        context.push({
        //            "header": {
        //                "namespace": "SpeechSynthesizer",
        //                "name": "SpeechState"
        //            },
        //            "payload": {
        //                "token": "",
        //                "offsetInMilliseconds": 0,
        //                "playerActivity": "IDLE"
        //           }
        //        });
        return context;
    }

    get sessionId(){
        return this._sessionId;
    }

    set sessionId(value){
        this._sessionId = value;
    }

    get alerts() {
        return this._alerts;
    }
};

module.exports = PiskyAlexa;