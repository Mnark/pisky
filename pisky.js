"use strict";
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var express = require('express');
var http = require('http');
var https = require('https');
var bodyParser = require('body-parser');
var fs = require('fs');
var uuid = require('node-uuid');
var os = require('os');

class Config extends EventEmitter {
    constructor(options) {
        super()
        if (!options) { var options = [] }
        this.params = []
        this.things = []

        this.setParam = function (name, value) {
            for (var i = 0; i < this.params.length; i++) {
                if (this.params[i].name == name) {
                    //console.log('Parameter ' + name + ' has value : ' + this.params[i].value + ' Setting to: ' + value)
                    if (this.params[i].value != value) {
                        this.params[i].value = value
                        this.emit('CONFIGCHANGED', { "id": this.getParam('id'), "name": name, "value": value })
                        return true
                    } else {
                        return false
                    }
                }
            }
            this.params.push({ "name": name, "value": value })
            this.emit('CONFIGCHANGED', { "id": this.getParam('id'), "name": name, "value": value })
            return true
        }

        this.getParam = function (name) {
            for (var i = 0; i < this.params.length; i++) {
                if (this.params[i].name == name) {
                    return this.params[i].value
                }
            }
            return undefined;
        }

        this.addThing = function (id, requirement) {
            for (var i = 0; i < this.things.length; i++) {
                if (this.things[i].id == id) {
                    this.things[i].requirement = requirement
                    return false;
                }
            }
            this.things.push({ "id": id, "requirement": requirement })
            return true;
        }

        this.removeThing = function (id) {
            for (var i = 0; i < this.things.length; i++) {
                if (this.things[i].id == id) {
                    this.things.splice(i, 1)
                    this.emit('CONFIGCHANGED', { "id": this.getParam('id') })
                    return true;
                }
            }
            return false;
        }

        for (var param in options) {
            //console.log('param = ' + options[param].name + ' Value: ' + options[param].value)
            //if (param == 'id' || param == 'name' || param == 'description' || param == 'img' || param == 'url' || param == 'bottype' || param == 'action' || param == 'html') {
            //this.setParam(param, options[param])
            this.params.push({ "name": options[param].name, "value": options[param].value })
            //}
        }
        //console.log('>>>>>>>Config passed is' + JSON.stringify(options))
        //if (options.things) {
        //    for (var i = 0; i < options.things.length; i++) {
        //console.log('>>>>>>>Adding thing to Config')
        //        this.addThing(options.things[i].id, options.things[i].requirement)
        //    }
        // }
    }

    getModel() {
        var rtn = { 'things': this.things }
        for (var param in this.params) {
            rtn[this.params[param].name] = this.params[param].value
        }
        return rtn
    }

    stringify() {
        return JSON.stringify(this);
    }

    getParameter(name) {
        return this.getParam(name)
    }

    setParameter(name, value) {
        this.setParam(name, value)
    }
}

class State extends EventEmitter {
    constructor() {
        super()
        this._states = []

        this.setState = function (name, value) {
            for (var i = 0; i < this._states.length; i++) {
                if (this._states[i].name == name) {
                    this._states[i].value = value
                    this.emit('STATECHANGED', { "name": name, "value": value })
                    return true
                }
            }
            this._states.push({ "name": name, "value": value })
            this.emit('STATESET', { "name": name, "value": value })
            return true
        }

        this.getState = function (name) {
            for (var i = 0; i < this._states.length; i++) {
                if (this._states[i].name == name) {
                    return this._states[i].value
                }
            }
            return undefined
        }
    }

    getStates() {
        return this._states
    }

    getState(name) {
        return this.getParam(name)
    }

    setState(name, value) {
        this.setParam(name, value)
    }
}

class Thing extends EventEmitter {
    constructor(profile, callback) {
        //console.log('Constructor of Thing called for ' + JSON.stringify(profile))
        super();
        if (!profile) {
            var profile = { params: [], things: [] }
        } else {
            if (!profile.params) {
                profile.params = []
            }
            if (!profile.things) {
                profile.things = []
            }
        }
        this.config = new Config(profile.params);
        if (this.config.getParameter('id') == undefined) { this.config.setParameter('id', uuid.v1()) }
        if (this.config.getParameter('html') == undefined) { this.config.setParameter('html', "thing.html") }
        if (this.config.getParameter('img') == undefined) { this.config.setParameter('img', "images/thing.png") }
        if (this.config.getParameter('action') == undefined) { this.config.setParameter('action', "naviagte") }

        this.config.on('CONFIGCHANGED', function (config) {
            //console.log('CONFIGCHANGED for Thing id: ' + config.id + ' parameter: ' + config.name + ' value: ' + config.value)
            self.emit('CONFIGCHANGED', config)
        })

        this.state = new State();
        //this.state.on('STATECHANGED', function (state) {
        //    this.emit('STATECHANGED', state)
        //})

        this.callback = callback
        //        this.socket = data.socket;
        //        this.visible = (data.visible || true);
        this.visible = true
        //        this.image = data.image || "/images/bot.png";
        //        this.img = data.img || "/images/bot.png";

        this.states = [];
        //this.pulse = data.pulse;
        this.imageProviders = []
        this.videoProviders = []
        this.audioProviders = []
        this._appget = []
        this._appuse = []
        this.things = []
        var self = this

        this.heartbeat = function () {
            this.emit('pulse', this.state); //emit the event back to the host
        }

        this.getThing = function (id) {
            //console.log('Searching for ' + id + ' in ' + this.things.length + ' things')
            for (var i = 0; i < this.things.length; i++) {
                if (this.things[i].id == id) {
                    return this.things[i];
                }
                for (var j = 0; j < this.things[i].things.length; j++) {
                    var a = this.things[i].getThing(id)
                    if (a) {
                        return a
                    }
                }
            }
            return false;
        }

        this.addThing = function (thing, addToConfig) {
            console.log('Pisky Thing add thing called for: ' + thing.id)
            if (addToConfig != false) { addToConfig = true }
            if (this.getThing(thing.id)) {
                console.log("Request to add thing: " + thing.name + ' to: ' + this.name + ' : Already exists');
                return false;
            } else {
                if (thing instanceof Thing) {
                    //if (thing.prototype != undefined && Thing.constructor.prototype.isPrototypeOf(thing.constructor)) {
                    console.log("Request to add Pisky Thing: " + thing.name + ' to: ' + this.name);
                    thing.on('alert', (directive) => {
                        //                        console.log("thing ALERTED: " + thing.name + ' id: ' + thing.id);
                        self.io.emit('alert', directive);
                    })
                    thing.on('status', (status) => {
                        console.log("thing STATUS: " + thing.name + ' id: ' + thing.id);
                        self.io.emit('status', { id: thing.id, states: status });
                    })
                    thing.on('view', (data) => {
                        //                        console.log('emitting view back to client')
                        self.io.emit('view', { id: thing.id, url: data.url, target: data.target });
                    })
                    thing.on('CONFIGCHANGED', (config) => {
                        self.emit('CONFIGCHANGED', config)
                    })
                    thing.on('message', (message) => {
                        //console.log( this.name + ' saw a message: ' + message)
                        self.emit('message', message)
                    })
                    self.things.push(thing);
                    if (addToConfig) {
                        this.config.addThing(thing.id, thing.constructor.name)
                    }
                } else {
                    console.log("Request to add thing: " + thing.name + ' to: ' + this.name + ' WARNING: New Thing created');
                    var a = new Thing(thing);
                    self.things.push(a);
                };

                if (Array.isArray(thing._appget)) {
                    for (var index = 0; index < thing._appget.length; index++) {
                        this._appget.push(thing._appget[index])
                        //if ((typeof thing._appget[index] === "object") && (thing._appget[index] !== null)) {
                        //                        console.log("Adding _appget for " + thing._appget[index].path);
                        //    self.app.get(thing._appget[index].path, thing._appget[index].callback);
                        //}
                    }
                };

                if (Array.isArray(thing._appuse)) {
                    for (var index = 0; index < thing._appuse.length; index++) {
                        this._appuse.push(thing._appuse[index])
                    }
                };

                if (Array.isArray(thing.things)) {
                    for (var i = 0; i < thing.things.length; i++) {
                        self.addThing(thing.things[i], false);
                    }
                }
                self.emit('CONFIGCHANGED', { "id": this.id })
                return true;
            };

        }

        this.removeThing = function (id) {
            console.log('* Remove * ' + id + ' from ' + this.id)
            for (var i = 0; i < this.things.length; i++) {
                if (this.things[i].id == id) {
                    this.things.splice(i, 1);
                    this.config.removeThing(id)
                    return true
                }
            }
            return false
        }

        this.getModel = function () {
            var rtn = []
            var a = this.config.getModel()
            a.state = this.state.getStates()
            rtn.push(a)

            for (var index = 0; index < this.things.length; index++) {
                var m = this.things[index].getModel()
                rtn = rtn.concat(m)
            }
            return rtn
        }

        if (typeof (this.pulse) == "number") {
            setInterval(this.heartbeat, this.pulse);
        }

        //console.log('Thing ' + this.name + ' has ' + profile.things.length + ' things')
        for (var i = 0; i < profile.things.length; i++) {
            console.log('Loading thing')
            var thingProfile = this.callback(profile.things[i].id)
            var a, b
            if (profile.things[i].requirement.includes('PiskyRF433')) {
                a = require(__dirname + "/../../add_ons/pisky-rf433")
                b = new a(thingProfile, this.callback)
            } else {
                b = new Thing(thingProfile, this.callback)
            }
            //            b.on('command', function(data){
            //
            //            })

            b.on('CONFIGCHANGED', function (config) {
                console.log('Thing CONFIGCHANGED ')
                //var thing = this.getThing(config.id)
                //this.save(thing)
            })
            console.log(">>> Initial loading of thing id: " + b.id + ' name: ' + b.name)
            this.addThing(b)
            //if (this.addThing(b)) {
            //    this.save(b)
            //}
        }

    }

    //set host(value) {
    //    this.callback = value
    // }

    get id() { return this.config.getParameter('id') }

    get name() { return this.config.getParameter('name') }
    set name(value) { this.config.setParameter('name', value) }

    get html() { return this.config.getParameter('html') }
    set html(value) { this.config.setParameter('html', value) }

    get img() { return this.config.getParameter('img') }
    set img(value) { this.config.setParameter('img', value) }

    get type() { return this.config.getParameter('type') }
    set type(value) { this.config.setParameter('type', value) }

    get description() { return this.config.getParameter('description') }
    set description(value) { this.config.setParameter('description', value) }

    get action() { return this.config.getParameter('action') }
    set action(value) { this.config.setParameter('action', value) }

    get createUuid() { return uuid.v1() }

    getModel() {
        return this.getModel()
    }

    getParameter(name) {
        return this.config.getParameter(name);
    }

    setParameter(name, value) {
        return this.config.setParameter(name, value);
    }

    getState(name) {
        return this.state.getState(name);
    }

    setState(name, value) {
        return this.state.setState(name, value);
    }

    getThing(id) {
        this.getThing(id)
    }

    addThing(thing) {
        console.log("Thing addThing called")
        return this.addThing(thing)
    }

    getConfig() {
        return this.config.stringify()
    }

}

class Host extends Thing {
    constructor(options) {
        var load = function (id) {
            console.log('********************************************')
            console.log('*** Loading Configuration  for ' + id + '***')
            if (!id) {
                console.log('*** Reading active profile ***')
                try {
                    var data = JSON.parse(fs.readFileSync(__dirname + "/.config/pisky.config.json", { 'encoding': 'utf8' }))
                    //console.log('Profile read: ' + JSON.stringify(data))
                    if (data.id) {
                        id = data.id;
                    }
                } catch (e) {
                    console.log('No active profile found... Creating new profile ***')
                }
            }
            if (id) {
                try {
                    var data2 = fs.readFileSync(__dirname + "/.config/" + id + ".config.json", { 'encoding': 'utf8' })
                    //console.log('Profile read: ' + data2)
                    return JSON.parse(data2);
                } catch (e) {
                    console.log('Error loading configuration:' + e)
                    return { params: [], things: [] };
                }
            }
            return { params: [], things: [] };
        }

        if (!options) { var options = {} }
        var profile = load(options.id)
        //       for (var i = 0; i < profile.params.length; i++) {
        //           var name = profile.params[i].name;
        //           if (!options[name]) {
        //               options[name] = profile.params[i].value
        //           }
        //       }
        //       options.things = profile.things

        //        if (options.action) {
        //            
        //            options.action = "navigate"
        //        }
        //        if (!options.html) {
        //            options.html = "host.html"
        //        }
        //        if (!options.img) {
        //            options.img = "/images/home.png"
        //        }

        super(profile, load);
        if (this.getParameter('name') == undefined) { this.setParameter('name', 'Unknown') }
        if (this.getParameter('description') == undefined) { this.setParameter('description', 'Unknown') }
        if (this.getParameter('action') == undefined) { this.setParameter('action', 'navigate') }
        if (this.getParameter('html') == undefined) { this.setParameter('html', 'host.html') }
        if (this.getParameter('img') == undefined) { this.setParameter('img', '/images/home.png') }

        this.on('CONFIGCHANGED', function (config) {
            var a = this.getThing(config.id)
            if (a) {
                this.save(a)
            } else {
                console.log("Request to save config of unknown thing: id " + config.id)
            }

        })

        this.on('message', function (message) {
            console.log('host got message ' + message)
            //send everyone a message for now
            self.io.emit('message',message)
        })

        this.save = function (thing) {
            console.log('*******Saving profile for id: ' + thing.id)
            //console.log('Profile: ' + thing.getConfig())
            fs.writeFile(__dirname + "/.config/" + thing.id + ".config.json", thing.getConfig(), "utf8", function (err) {
                if (err) {
                    console.log("Error saving configuration ") + err.message
                }
                console.log("Configuration saved")
            });
            for (var index in thing.things) {
                this.save(thing.things[index])
            }
        }

        var self = this;
        self.geo = {};
        self.geo.longitude = -3.0092;
        self.geo.latitude = 51.5884;
        self.geo.heading = 61.78;
        self.geo.pitch = -0.76;
        self.geo.velocity = 0;

        this.app = null;
        if (options.app) {
            this.app = options.app
        } else {
            this.app = express();
        };
        self.port = options.port || 80;
        self.httpsPort = options.httpsPort || 443;

        self.server = http.createServer(this.app);
        self.httpsServer = https.createServer({
            key: fs.readFileSync(options.key ? options.key : __dirname + '/certs/2b71b8b9-a69a-4d55-b5d6-60a9b044a065.private.pem'),
            cert: fs.readFileSync(options.cert ? options.cert : __dirname + '/certs/2b71b8b9-a69a-4d55-b5d6-60a9b044a065.public.pem')
        }, this.app);

        self.server.listen(self.port);
        self.httpsServer.listen(self.httpsPort);

        this.app.use(bodyParser.json());

        this.app.get("/", function (req, res) {
            //console.log("Requesting root file");
            if (req.secure) {
                console.log("Sending file :" + __dirname + '/public/default.html');
                res.sendFile(__dirname + '/public/default.html');
            } else {
                console.log("Sending file :" + __dirname + '/public/entrance.html');
                res.sendFile(__dirname + '/public/entrance.html');
            }

        });

        this.app.post('/login', function (req, res) {
            //self.passport.authenticate('local', {
            //    successRedirect: '/loginSuccess',
            //    failureRedirect: '/loginFailure'
            //})
            if (req.body.image) {
                var base64Data = req.body.image.replace(/^data:image\/png;base64,/, "");
                try {
                    //           self.fs.mkdirSync("//sharecenter/PiUsers/" + req.body.user);
                } catch (e) {
                    if (e.code != 'EEXIST') {
                        throw e;
                    }
                }
                //        self.fs.writeFile("//sharecenter/PiUsers/" + req.body.user + "/" + generateUUID() + ".png", base64Data, 'base64', function (err) {
                //            console.log(err);
                //        });
            }
            self.users.push({ name: req.body.user });
            res.send('login');
        });

        //self.app.use(express.static('public'));
        this.app.use(express.static(__dirname + '/public'));
        for (var i in this._appuse) {
            console.log('Adding ' + this._appuse[i] + ' to list of directories for ' + this.name)
            this.app.use(express.static(this._appuse[i]));
        }

        self.io = require('socket.io')
            .listen(self.httpsServer.listen(self.httpsPort))
            .use(function (socket, next) {
                //console.log("Query: ", socket.handshake.query);
                //// return the result of next() to accept the connection.
                //if (socket.handshake.query.username == "Mark") {
                return next();
                //}
                //// call next() with an Error if you need to reject the connection.
                //next(new Error('Authentication error'));
            });

        // usernames which are currently connected to the chat
        self.users = [];

        // rooms which are currently available in chat
        self.rooms = ['openchat', '@bots'];

        self.interval = options.interval || 60000;

        self.status = new Object();
        self.status.user = options.user || '';
        self.status.datetime = new Date();
        self.status.scale = 1;
        self.status.direction = 0;
        self.status.acceleration = 0;
        self.status.poistion = 0;
        self.status.devices = [];

        //Load or Create Configuration
        //    try {
        //        self._config = require("." + self.os.hostname() + ".config.json");
        //self._config = require(self.os.hostname() + ".config.json");
        //        console.log("Configuration loaded: " + self._config.controllers.length + " controllers");
        //        for (var i = 0; i < self._config.controllers.length; i++) {
        //            for (var j = 0; j < self._config.controllers[i].devices.length; j++) {
        //                console.log("Pisky: Adding device to self.status.devices: " + self._config.controllers[i].devices[j]);
        //                self.status.devices.push(self._config.controllers[i].devices[j]);
        //            }
        //        }
        //       self.io.emit('config', self._config);
        //    } catch (err) {
        //       console.log("Previous configuration not loaded: " + err.message);
        //console.log("Creating new configuration.");
        //self._config = new Config(data);
        //       self._config = new Object();
        //       self._config.description = data.description || 'A piskybot'
        //       self._config.bottype = 'piskybot';
        //       self._config.img = data.img || '';
        //       self._config.url = '';
        //       self._config.interval = parseInt(data.interval) || 50000;
        //       self._config.controllers = [];
        //   }

        //    self._config.controllers = function (){
        //        var tempControllers = new Array();
        //        for (var i = 0; i < self._config.controllers.length; i++){

        //            tempControllers.push(self._config.controllers[i].getConfig());
        //       }
        //        return tempControllers;
        //    };

        //self.config.setParameter('country', "Unknown");
        //self._config.city = "Unknown";
        //self._config.wanip = "Unknown";
        //self._config.lanip = "Unknown";
        //self._config.lanport = self.port;

        //Find geo location from ip address
        //http.get("http://www.telize.com/geoip", function (res) {
        //    res.on("data", function (chunk) {
        //        var options = JSON.parse(chunk.toString());
        //        self._config.country = options.country;
        //        self._config.city = options.city;
        //        self._config.wanip = options.ip;
        //    });
        //}).on('error', function (e) {
        //    console.log("Got error reading geoip: " + e.message);
        //});

        self.networks = [];
        //self.country = "";
        //self.city = "";

        self.networkInterfaces = os.networkInterfaces();
        for (var i in self.networkInterfaces) {
            if (self.config.getParameter('lanip') == undefined) {
                if (self.networkInterfaces.hasOwnProperty(i)) {
                    var net = self.networkInterfaces[i];
                    for (var j = 0; j < net.length; j++) {
                        if (net[j].family == 'IPv4' && net[j].address != '127.0.0.1') {
                            self.config.setParameter('lanip', net[j].address);
                            break;
                        }
                    }
                }
            }
        }

        self.lanurl = "http://" + self.config.getParameter('lanip') + ":" + self.config.getParameter('lanport') + "/";

        self.addNetwork = function (name, url, callbackurl) {
            var ioc = require('socket.io-client');
            var socket = ioc.connect(url, { query: { id: self.id, username: self.name, image: 'imagecode' } });
            socket.on('connect', function () {
                console.log(self._config.name + ": Connected to: " + name + " on socket id:" + socket.id);
                self._config.url = self.lanurl;
                for (var thing in self.things) {
                    socket.emit('addthing', { config: self.things[thing].getConfig(), socket: socket.id });
                }
            });

            socket.on('disconnect', function () {

                if (socket.handshake.query.username) {
                    console.log('disconnect: ' + socket.handshake.query.username);
                    for (var i = 0; i < self.users.length; i++) {
                        if (self.users[i].name == socket.handshake.query.username) {
                            self.users.splice(i, 1);
                        }
                    }
                    for (var i = 0; i < self.things.length; i++) {
                        if (self.things[i].name == socket.handshake.query.username) {
                            self.things.splice(i, 1);
                        }
                    }
                    console.log(socket.id + ' socket has disconnected');
                    socket.leave(socket.room);
                } else {
                    console.log(socket.handshake.query.username + ' has disconnected');
                    for (var i = 0; i < self.things.length; i++) {
                        if (self.things[i].socket == socket.id) {
                            self.io.emit("removething", self.things[i].id)
                            self.things.splice(i, 1);
                            console.log(socket.username + " logged out!");
                        }
                    }
                }
            });

            socket.on('command', function (data) {
                console.log('Command received from Network: ' + JSON.stringify(data));
                for (var index = 0; index < self.things.length; index++) {
                    if (self.things[index].id == data.id) {
                        if (self.things[index].socket) {
                            console.log('Got a command message for thing (' + self.things[index].name + '), so emmitting to socket:' + self.things[index].socket);
                            self.io.emit('command', data);
                        } else {
                            var listened = self.things[index].emit('command', data);
                            console.log("Listeners:" + listened);
                        }
                        return;
                    };
                }
                //            console.log('Not for a thing, so telling the app');
                self.emit(data.command, data.data);
            });

            socket.on('updatechat', function (username, data) {
                //            console.log("Got chat from " + username + " :" + data);
                //            self.io.emit('updatechat', username, data);
            });

            socket.on('send', function (event) {
                console.log("Got send and raising back to the app");
                self.emit('send', event); //emit the event back to the bot
                //socket.broadcast.to(event.socketId).emit('send', event);
                //socket.emit('send', event);
                //self.io.sockets.emit('send', event);
            });

            socket.on('status', function (event) {
                console.log("Got status and raising back to the app");
                self.emit('status', event); //emit the event back to the bot
            });

            socket.on('things', function (things) {
                console.log("Got things back from " + name);
                for (thing in things) {
                    self.addThing(new Thing(things[thing])) ? console.log("Added " + things[thing].name + ' id: ' + things[thing].id) : console.log("Already knew about " + things[thing].name);
                }
                //self.emit('status', event); //emit the event back to the bot
            });

            self.networks.push({ name: name, url: url, callbackurl: callbackurl, socket: socket });
        };

        self.callback = function (controllerId, id, value) {
            //self.io.sockets.emit("status", {
            self.io.emit("status", {
                botId: self.id, controllerId: controllerId, deviceId: id, value: value
            });

            for (var i = 0; i < self.networks.length; i++) {
                self.networks[i].socket.emit("status", {
                    botId: self.id, controllerId: controllerId, deviceId: id, value: value
                });
            };
        };

        self.updateStatus = function () {
            for (var i = 0; i < self.status.devices.length; i++) {
                if (self.status.devices[i].control) {
                    console.log("A device needs to read its controller");
                    for (var j = 0; j < self._config.controllers.length; j++) {
                        if (self._config.controllers[j].id == self.status.devices[i].controllerId) {
                            if (typeof (self._config.controllers[j].read) == 'function') {
                                console.log("Read function available. Attempting to read from controller: ");
                                //if (self._config.controllers[j].control.testConnection()) {
                                self.status.devices[i].value = self._config.controllers[j].read();
                            }
                            console.log("self.status.devices[i].value: " + self.status.devices[i].value);
                            //}
                        }
                    }
                    self.emit('status', self.status.devices[i]);
                }
                if (self.status.rpm < self.targetrpm) {
                    self.status.rpm = Math.ceil(self.status.rpm + 197);
                } else {
                    self.status.rpm = Math.ceil(self.targetrpm);
                }
                self.status.datetime = new Date();
                self.io.emit('status', self.status);
            }
        }

        setInterval(self.updateStatus, self.config.getParameter('interval'));

        self.alert = function (message) {
            self.io.emit('alert', { 'message': message, 'from': self.name })
        }

        self.io.on('connection', function (socket) {
            console.log("connection from: " + socket.handshake.query.username);
            socket.on('send', function (event) {
                //self.updateDevice(event.id, 'value', event.value);
                //self.emit('status', self.status);
                if (event.socketId) {
                    console.log("Going to forward send message to socket id:" + event.socketId + " command: " + event.command + " value: " + event.value);
                    //self.io.sockets.emit('send', event);
                    socket.broadcast.to(event.socketId).emit('send', event);
                } else {
                    if (event.id) {
                        //console.log("this event has an id, so find the thing this that id:" + event.id);
                        // this event has an id, so find the thing this that id
                        var a = self.getThing(event.id);
                        a.emit('feedback', event);
                    } else {
                        //console.log("Pisky Emmiting Send to application. deviceId =" + event.deviceId + " command: " + event.command + " value: " + event.value);
                        self.emit('send', event);
                    }
                }
            });
            socket.on('sendchat', function (data) {
                //console.log(socket.username + ' sent chat to: ' + socket.room);
                // we tell the client to execute 'updatechat' with 2 parameters
                self.io.sockets.emit('updatechat', socket.username, data);
                console.log("Chat Sent locally:" + data);
                for (var i = 0; i < self.networks.length; i++) {
                    if (self.networks[i].socket.connected) {
                        self.networks[i].socket.emit('sendchat', data);
                        console.log("Chat Sent remotely to:" + self.networks[i].name);
                    }
                }
            });
            socket.on('addthing', function (thing) {
                console.log('socket addthing: ' + thing.config.name + " (" + thing.config.id + ") connection from " + " @ " + socket.id);
                thing.config.socket = socket.id;
                //First check if you already know about this thing
                if (self.addThing(thing.config)) {
                    //Create a namespace for this thing
                    //var nsp = io.of('/' + thing.id);
                    //nsp.on('connection', function (nsp_socket) {
                    //    console.log("someone connected to " + thing.name + "'s namespace on " + self.name);
                    //    //nsp_socket.on('status', function (device) {
                    //    //    socket.emit('status', device);
                    //    //});
                    //});

                    // 
                    //nsp.emit('hi', 'everyone!');
                    // store the name in the socket session for this client
                    socket.username = thing.config.name;
                    // store the room name in the socket session for this client
                    socket.room = thing.config.name;
                    // add the client's username to the global list
                    //usernamess[thing.name] = thing.name;
                    //self.users.push(thing);
                    //                self.rooms.push(thing);

                    // join your rooms
                    socket.join('openchat');
                    socket.broadcast.to('openchat').emit('updatechat', thing.name + " has come online.");
                    socket.join('@bots');
                    //socket.broadcast.to('@bots').emit('updatethings', self.things);
                    socket.join(thing.name);

                    // echo to client they've connected
                    socket.emit('updatechat', 'SERVER', 'you have connected to ' + thing.name);
                    socket.broadcast.emit('updatechat', thing.name, ' Online');
                    socket.broadcast.emit('addthing', thing);
                    //        socket.emit('updatethings', things, thing);
                    //self.io.emit('updatethings', self.things);
                    //socket.emit('updaterooms', self.things, thing);
                    self.emit('addthing', thing)
                };
            });
            socket.on('adduser', function (user) {
                console.log('adduser: ' + user);
                if (user) {
                    socket.username = user.username;
                    socket.room = 'openchat';
                    //usernames[username] = username;
                    self.users.push({ name: user.username, bottype: 'Human', description: 'Web Page', img: user.img });
                    socket.join(socket.room);
                    // Tell everyone you've connected
                    self.io.emit('updateusers', self.users);
                    socket.emit('updatethings', self.things);
                    //socket.broadcast.to(socket.room).emit('updatethings', self.things);
                };
            });
            socket.on('status', function (device) {
                console.log('Pisky got a status message, so telling everyone');
                self.io.emit('status', device);
            });
            socket.on('command', function (data) {
                console.log('Got a command message for ' + JSON.stringify(data.id) + ' Searching ' + self.things.length + ' things');
                var t = self.getThing(data.id)
                if (t) {
                    if (t.socket) {
                        console.log('Got a command message for thing (' + self.things[index].name + '), so emmitting to socket:' + self.things[index].socket);
                        self.io.emit('command', data);
                    } else {
                        console.log("Command is for: " + t.name + ' from user socket ');
                        var listened = t.emit('command', data);
                        console.log(t.name + " was Listening?: " + listened);
                    }
                }
                return;

                //for (var index = 0; index < self.things.length; index++) {
                //    if (self.things[index].id == data.id) {
                //        //console.log('self.things[index].emit :' + self.things[index].emit);
                //        if (self.things[index].socket) {
                //            console.log('Got a command message for thing (' + self.things[index].name + '), so emmitting to socket:' + self.things[index].socket);
                //            self.io.emit('command', data);
                //socket.broadcast.to(self.things[index].socket).emit('command', data);
                //self.io.sockets[self.things[index].socket].emit(data);
                //self.things[index].socket.emit(data);
                //        } else {
                //            console.log("Command is for: " + self.things[index].name);
                //            var listened = self.things[index].emit('command', data);
                //            console.log(self.things[index].name + " was Listening?: " + listened);
                //            break;
                //        }
                //        return;
                //    };
                //}
                //            console.log('Not for a thing, so telling the app');
                //self.emit(data.command, data.data);
            });
            socket.on('switchRoom', function (newroom) {
                console.log('switchRoom');
                // leave the current room (stored in session)
                socket.leave(socket.room);
                // join new room, received as function parameter
                socket.join(newroom);
                socket.emit('updatechat', 'SERVER', 'you have connected to ' + newroom);
                // sent message to OLD room
                socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.username + ' has left this room');
                // update socket session room title
                socket.room = newroom;
                socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.username + ' has joined this room');
                socket.emit('updaterooms', self.rooms, newroom);
            });
            socket.on('config', function (bot) {
            });
            socket.on('alert', function (message) {
                console.log("Got an alert from " + message.from);
                self.emit('alert', message);
            });
            socket.on('disconnect', function () {
                if (socket.handshake.query.username) {
                    console.log('disconnect: ' + socket.handshake.query.username);
                    //console.log('Server listening at port %d', port);
                    // remove the username from global usernames list
                    //delete usernames[socket.username];
                    for (var i = 0; i < self.users.length; i++) {
                        if (self.users[i].name == socket.handshake.query.username) {
                            self.users.splice(i, 1);
                        }
                    }
                    for (var i = 0; i < self.things.length; i++) {
                        if (self.things[i].name == socket.handshake.query.username) {
                            self.things.splice(i, 1);
                        }
                    }
                    //socket.broadcast.emit('updateusers', self.users);
                    // update list of users in chat, client-side
                    //socket.broadcast.to('@bots').emit('updatethings', self.things);
                    // echo globally that this client has left
                    console.log(socket.handshake.query.username + ' has disconnected');
                    //socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
                    socket.leave(socket.room);
                } else {
                    for (var i = 0; i < self.things.length; i++) {
                        if (self.things[i].socket == socket.id) {
                            self.io.emit("removething", self.things[i].id)
                            self.things.splice(i, 1);
                            console.log(socket.username + " logged out!");
                        }
                    }
                    //                console.log("System: A thing called has disconnected:" + JSON.stringify(socket.username))
                }

            });

            socket.to(socket.id).emit('message', 'You are connected to' + self.name);
            //console.log("Emmiting init");
            socket.emit('init', self.id);
            socket.emit('things', self.getModel());
            socket.emit('users', self.users);
            socket.emit('status', self.status);
        });

        self.states = [{ 'name': 'Operating System', 'value': os.arch() }
            , { 'name': 'CPUs', 'value': os.cpus().length }
            , { 'name': 'Platform', 'value': os.platform() }
            , { 'name': 'Operating System', 'value': os.type() }];

        //var a = new Thing(self);
        //a.set('users', self.count('users'));
        //self.addThing(self);
        //var createThing = function (id, requirement) {
        //    var a
        //    if (requirement.includes('PiskyRF433')) {
        //        a = require(__dirname + "/../../add_ons/pisky-rf433")
        //    } else {
        //        a = require(requirement)
        //    }
        //    var profile = load(id)
        //console.log("Thing Config =" + JSON.stringify(thingConfig))
        //var b = new a({"id":self.config.things[i].id})
        //    return new a(profile, load)
        //}

        //console.log('>>>> Initial config for host has ' + this.config.things.length + ' things')
        //       for (var i = 0; i < this.config.things.length; i++) {
        //var a
        //if (this.config.things[i].requirement.includes('PiskyRF433')) {
        //    a = require(__dirname + "/../../add_ons/pisky-rf433")
        //} else {
        //    a = require(this.config.things[i].requirement)
        //}
        //var thingConfig = load(self.config.things[i].id)
        //console.log("Thing Config =" + JSON.stringify(thingConfig))
        //var b = new a(thingConfig)
        //           var b = createThing(this.config.things[i].id, this.config.things[i].requirement)
        //           b.on('CONFIGCHANGED', function (config) {
        //                console.log('CONFIGCHANGED Saving profile @: ' + __dirname + "/.config/" + config.id + ".config.json")
        //               var thing = this.getThing(config.id)
        //               this.save(thing)
        //           })
        //           console.log("Initial loading of thing is id: " + b.id)
        //           if (super.addThing(b)) {
        //               this.save(b)
        //           }
        //       }
        //this.save(self)
        //fs.writeFile(__dirname + "/.config/pisky.config.json", '{"id":"' + self.id + '"}', "utf8", function (err) {
        //    if (err) {
        //        console.log("Error saving default profile ") + err.message
        //    }
        //    console.log('Inititial profile @: ' + __dirname + "/.config/pisky.config.json saved.")
        //});
    }

    addThing(thing) {
        console.log('Pisky Host add thing called for' + thing.id)
        if (super.addThing(thing)) {
            this.save(thing)
        }
    }

    saveProfile() {
        this.save(this)

        fs.writeFile(__dirname + "/.config/pisky.config.json", '{"id":"' + this.id + '"}', "utf8", function (err) {
            if (err) {
                console.log("Error saving default profile ") + err.message
            }
            console.log('Inititial profile @: ' + __dirname + "/.config/pisky.config.json saved.")
        });
    }
}

module.exports = Host;
module.exports.Thing = Thing;


