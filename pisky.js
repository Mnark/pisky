//"use strict";
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var express = require('express');
var http = require('http');
var https = require('https');
var bodyParser = require('body-parser');
var fs = require('fs');
var uuid = require('node-uuid');

function generateUUID() {
    var d = new Date().getTime();
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
};

class Config {
    constructor(data){
        var os = require('os');
        this.description = data.description || 'A piskybot'
        this.bottype = 'piskybot';
        this.img = data.img || '';
        this.url = '';
        this.interval = parseInt(data.interval) || 50000;
        this.name = data.name || os.hostname();
        this._controllers = [];
    }
    get controllers (){
        var tempControllers = new Array();
        for (var i = 0; i < this._controllers.length; i++) {
            tempControllers.push(this._controllers[i].getConfig());
        }
        return tempControllers;
    }
};
//Config.prototype.getControllers = function () {
//    var tempControllers = new Array();
//    for (var i = 0; i < this.controllers.length; i++) {
//        tempControllers.push(this.controllers[i].getConfig());
//    }
//    return tempControllers;
//};
Config.prototype.loadConfig = function () {
  
};
Config.prototype.saveConfig = function () {
    //    var fs = require("fs");
    //    fs.writeFile(self.name + ".config.json", JSON.stringify(self), "utf8", function (err) {
    //        if (err) {
    //            console.log("Error saving configuration ") + err.message;
    //        }
    //        console.log("Configuration saved");
    //    });    
};

var Device = function (controller, data) {
    var self = this;
    self.id = data.id || generateUUID();
    self.controllerId = controller.id;
    self.control = controller.control;
    self.name = data.name;
    self.description = data.description;
    self.image = data.image || "/images/device.png";
    self.visible = (data.visible || true);
    
    switch (data.type ? data.type.toString().toUpperCase(): 'DEVICE') {
        case 'SWITCH':
            self.type = 'SWITCH';
            self.commands = ['Turn', 'Switch', 'Put'];
            self.states = ['on', 'off'];
            break;
        case 'SCALE':
            self.type = 'SCALE';
            self.commands = ['Faster', 'Slower', 'Speed Up', 'Slow Down'];
            self.states = [0, 1];
            self.valueType = data.valueType;
            self.minValue = data.minValue;
            self.maxValue = data.maxValue;
            self.precision = data.precision;
            break;
        default:
            self.type = 'PISKY';
    }
    
    self.channel = data.channel;
    self.device = data.device;
    self.family = data.family;
    self.switchcode = data.switchcode;
    self.value = data.value;
    self.callback = controller.callback;
    
    self.interval = data.interval || null;
    
    self.read = function () {
        return self.value;
    };
    
    self.setValue = function (value) {
        self.value = value;
        if (typeof (self.callback) == "function") {
            self.callback(self.controllerId, self.id, self.value);
        } else {
            console.log("Device " + self.name + " has no callback method");
        };
    };
    
    //self.updateStatus = function () {
    //    console.log("device (" + self.name + ")updating status");
    //    self.callback(self.controllerId, self.id, self.value);
    //    if (typeof (self.interval) == "number") {
    //        setInterval(self.updateStatus, self.interval);
    //    }
    //};
    //self.updateStatus();
};

var Controller = function (data, callback) {
    var self = this;
    self.id = data.id || generateUUID();
    self.name = data.name;
    self.description = data.description;
    self.control = data.control;
    self.image = data.image || "/images/controller.png";
    self.visible = (data.visible || true);
    self.devices = [];
    self.callback = callback
    self.pulse = data.pulse;
    self.heartbeat = function () {
        self.emit('pulse', {}); //emit the event back to the bot
    };
    if (typeof (self.pulse) == "number") {
        setInterval(self.heartbeat, self.pulse);
    };
    
    self.getConfig = function () {
        return {
            id: self.id,
            name: self.name, 
            description: self.description, 
            image : self.image,
            visible: self.visible,
            devices: self.devices,
    //            html: self.control.html
        };
    };

};

class Thing extends EventEmitter{
    constructor(data, callback) {
        //console.log('Constructor of Thing called for ' + data.name)
        super();
        var self = this;
        this.callback = callback;
        this.id = data.id || uuid.v1();
        this.socket = data.socket;
        this._name = data.name || "Anonymous";
        this.description = data.description || "";
        this.visible = (data.visible || true);
        this.image = data.image || "/images/bot.png";
        this.img = data.img || "/images/bot.png";
        this.html = data.html || "thing.html";
        this.states = data.states || [];
        this.imageProviders = data.imageProviders || new Array();
        this.videoProviders = data.videoProviders || new Array();
        this.audioProviders = data.audioProviders || new Array();
        this._appget = [];
        this._appuse = [];
    }
    
    get config () {
        return {
            id: this.id,
            name: this._name, 
            description: this.description, 
            visible: this.visible,
            image : this.image,
            img : this.img,
            html: this.html,
            socket: this.socket,
            states: this.states,
            imageProviders: this.imageProviders,
            videoProviders: this.videoProviders,
            audioProviders: this.audioProviders
        };
    }

    set host (value) {
        this.callback = value;
    }

    get name () { return this._name}
    set name (value) { this._name = value}

    get createUuid () { return uuid.v1()}

    getState (name){
        for (var i = 0 ; i < this.states.length; i++){
            if ( this.states[i].name == name){
                return this.states[i].value;
            }
        }
        return;
    }

    setState (name, value){
        for (var i = 0 ; i < this.states.length; i++){
            if ( this.states[i].name == name){
                this.states[i].value = value;
                return;
            }
        }
        this.states.push({ name: name, value: value });
        return;
    }
};

class Host extends Thing{
    constructor(data) {
        super(data);
        var self = this;
        this.name = data.name || "Anonymous";
        self.img = data.img || "/images/home.png";
        self.os = require('os');
        self.geo = new Object();
        self.geo.longitude = -3.0092;
        self.geo.latitude = 51.5884;
        self.geo.heading = 61.78;
        self.geo.pitch = -0.76;
        self.geo.velocity = 0;

        self.app = null;
        if (data.app) {
            self.app = data.app
        } else {
            self.app = express();
        };
        self.port = data.port || 80;
        self.httpsPort = data.httpsPort || 443;
        
        self.server = http.createServer(self.app);
        self.httpsServer = https.createServer({
            key: fs.readFileSync(data.key ? data.key : __dirname + '/certs/2b71b8b9-a69a-4d55-b5d6-60a9b044a065.private.pem'),
            cert: fs.readFileSync(data.cert ? data.cert : __dirname + '/certs/2b71b8b9-a69a-4d55-b5d6-60a9b044a065.public.pem')
        }, self.app);
        
        self.server.listen(self.port);
        self.httpsServer.listen(self.httpsPort);
        
        self.app.use(bodyParser.json());
        
        self.app.get("/", function (req, res) {
            //console.log("Requesting root file");
            if (req.secure) {
                console.log("Sending file :" + __dirname + '/public/default.html');
                res.sendFile(__dirname + '/public/default.html');
            } else {
                console.log("Sending file :" + __dirname + '/public/entrance.html');
                res.sendFile(__dirname + '/public/entrance.html');
            }

        });
        
        self.app.post('/login', function (req, res) {
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
        
        self.app.use(express.static('public'));
        self.app.use(express.static(__dirname + '/public'));
        
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
        self.things = [];
        // rooms which are currently available in chat
        self.rooms = ['openchat', '@bots'];
        
        self.interval = data.interval || 60000;
        
        self.status = new Object();
        self.status.user = data.user || '';
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
        self._config = new Config(data);
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
        
        self._config.country = "Unknown";
        self._config.city = "Unknown";
        self._config.wanip = "Unknown";
        self._config.lanip = "Unknown";
        self._config.lanport = self.port;
        
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
        
        self.networkInterfaces = self.os.networkInterfaces();
        for (var i in self.networkInterfaces) {
            if (self._config.lanip == "Unknown") {
                if (self.networkInterfaces.hasOwnProperty(i)) {
                    var net = self.networkInterfaces[i];
                    for (var j = 0; j < net.length; j++) {
                        if (net[j].family == 'IPv4' && net[j].address != '127.0.0.1') {
                            self._config.lanip = net[j].address;
                            break;
                        }
                    }
                }
            }
        }
        
        self.lanurl = "http://" + self._config.lanip + ":" + self._config.lanport + "/";
        
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
                            break;
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
                    self.addThing(new Thing(things[thing])) ? console.log("Added " + things[thing].name + ' id: ' + things[thing].id)  : console.log("Already knew about " + things[thing].name);
                }
                //self.emit('status', event); //emit the event back to the bot
            });
            
            self.networks.push({ name: name, url: url, callbackurl: callbackurl, socket: socket });
        };
        
        self.getDevice = function (id) {
            for (var i = 0; i < self._config.controllers.length; i++) {
                for (var j = 0; j < self._config.controllers[i].devices.length; j++) {
                    if (self._config.controllers[i].devices[j].id == id) {
                        return self._config.controllers[i].devices[j];
                    }
                }
            }
            return false;
        };
        
        self.addThing = function (thing) {
            console.log("Request to add thing: " + thing.name + ' id: ' + thing.id + ' thing instanceof Thing: ' + (thing instanceof Thing) + ' thing instanceof Host: ' + (thing instanceof Host));
            if (self.getThing(thing.id)) {
                console.log("Already knew about thing: " + thing.name + ' id: ' + thing.id);
                return false;
            } else {
                if (thing instanceof Thing || thing instanceof Host) {
                    console.log("adding thing: " + thing.name + ' id: ' + thing.id);
                    thing.on('alert', (directive) => {
                        console.log("thing ALERTED: " + thing.name + ' id: ' + thing.id);
                        self.io.emit('alert', directive);
                    })
                    thing.on('status', (status) => {
                        console.log("thing STATUS: " + thing.name + ' id: ' + thing.id);
                        self.io.emit('status', {id: thing.id, states: status});
                    })
                    self.things.push(thing);
                } else {
                    var a = new Thing(thing);
                    self.things.push(a);
                    console.log("adding NEW thing: " + thing.name + " socket: " + a.socket);
                };
                
                //Get the homepage of the thing that has connected
                if (thing.config) {
                    //self.http.get(thing.config.url, function (res) {
                    //    thing.config.homepage = res;
                    //}).on('error', function (e) {
                    //    console.log("Homepage not available: " + e.message);
                    //}).end();
                };

                if (Array.isArray(thing._appget)) {
                    for (var index = 0; index < thing._appget.length; index++) {
                        if ((typeof thing._appget[index] === "object") && (thing._appget[index] !== null)) {
                            //                        console.log("Adding _appget for " + thing._appget[index].path);
                            self.app.get(thing._appget[index].path, thing._appget[index].callback);
                        }
                    }
                };
                console.log("Adding _appuse for " + thing._appuse.length);
                if (Array.isArray(thing._appuse)) {
                    for (var index = 0; index < thing._appuse.length; index++) {
                       // if ((typeof thing._appuse[index] === "object") && (thing._appuse[index] !== null)) {
                            console.log("Adding _appuse for " + thing._appuse[index]);

                            self.app.use(express.static(thing._appuse[index]));
                       // }
                    }
                };
                if (Array.isArray(thing.things)) {
                    for (var i = 0; i < thing.things.length; i++) {
                        self.addThing(thing.things[i]);
                    }
                }
                return true;
            };

        };
        
        self.getThing = function (id) {
            for (var i = 0; i < self.things.length; i++) {
                if (self.things[i].id == id) {
                    return self.things[i];
                }
            }
            return false;
        };
        
        self.createDevice = function (controller, data) {
            var a = new Device(controller, data);
            for (var i = 0; i < self._config.controllers.length; i++) {
                if (self._config.controllers[i].id == controller.id) {
                    self._config.controllers[i].devices.push(a);
                    break;
                }
            }
            self.status.devices.push(a);
            //self.saveConfig();
            return a;
        };
        
        self.updateDevice = function (id, property, value) {
            //        console.log("Pisky: updateDevice id:" + id + " property: " + property + " value :" + value);
            var dev = self.getDevice(id);
            if (dev) { dev.setValue(value) };
            
            for (var i = 0; i < self.status.devices.length; i++) {
                if (self.status.devices[i].id == id) {
                    self.status.devices[i][property] = value;
                    console.log("Pisky: updateDevice : emmiting status message to direct clients");
                    //tell direct connections the new value
                    //self.io.sockets.emit("status", self.status.devices[i]);
                    //tell networks the new value
                    for (var j = 0; j < self.networks.length; j++) {
                        //self.networks[i].socket.broadcast.emit("status", self.status);
                        self.networks[j].socket.emit("status", self.status.devices[i]);
                    }
                }
            }
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
        
        self.createController = function (data, obj) {
            if (typeof obj == 'function') {
                data.control = new obj();
            }
            var a = new Controller(data, self.callback);
            self._config.controllers.push(a);
            self._config.saveConfig();
            if (data.control) {
                if ((typeof data.control._appget === "object") && (data.control._appget !== null)) {
                    self.app.get(data.control._appget.path, data.control._appget.callback);
                }
            }
            return a;
        }
        
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
        
        setInterval(self.updateStatus, self._config.interval);
        
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
                //console.log('Got a command message for ' + JSON.stringify(data.id) + ' Searching ' + self.things.length + ' things');
                for (var index = 0; index < self.things.length; index++) {
                    if (self.things[index].id == data.id) {
                        //console.log('self.things[index].emit :' + self.things[index].emit);
                        if (self.things[index].socket) {
                            //console.log('Got a command message for thing (' + self.things[index].name + '), so emmitting to socket:' + self.things[index].socket);
                            self.io.emit('command', data);
                            //socket.broadcast.to(self.things[index].socket).emit('command', data);
                            //self.io.sockets[self.things[index].socket].emit(data);
                            //self.things[index].socket.emit(data);
                        } else {
                            //console.log("self.things[index].name: " + self.things[index].name);
                            var listened = self.things[index].emit('command', data);
                            //console.log("Listeners:" + listened);
                        }
                        return;
                    };
                }
                //            console.log('Not for a thing, so telling the app');
                self.emit(data.command, data.data);
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
            //console.log("Emmiting message");
            socket.to(socket.id).emit('message', 'You are connected to' + self._config.name);
            //console.log("Emmiting init");
            socket.emit('init', self.id);
            //console.log("Emmiting controllers");
            socket.emit('controllers', self._config.controllers);
            console.log("Emmiting " + self.things.length + " things");
            //self.things.forEach(function (thing) {console.log(' thing.name:' + thing.name)}) 
            //socket.to(socket.id).emit('things', self.things);
            var newThings = [];
            for (var index = 0; index < self.things.length; index++) {
                newThings.push(self.things[index].config);
            }
            //newThings.forEach(function (thing) {console.log(' thing.name:' + thing.name)}) 
            socket.emit('things', newThings);
            //socket.emit('things', self.things);
            //console.log("Emmiting users");
            socket.emit('users', self.users);
            //console.log("Emmiting status");
            socket.emit('status', self.status);
        });
        
        self.states = [{ 'name': 'Operating System', 'value': self.os.arch() }
                , { 'name': 'CPUs', 'value': self.os.cpus().length }
                , { 'name': 'Platform', 'value': self.os.platform() }
                , { 'name': 'Operating System', 'value': self.os.type() }];
        
        //var a = new Thing(self);
        //a.set('users', self.count('users'));
        self.addThing(self);
    };
};

//Host.prototype = new Thing({});

Host.prototype.count = function (objectName) {
    switch (objectName.toLowerCase()) {
        case 'users':
            return this.users.length;

        case 'things':
            return this.users.length;
        default:
            return this.users.length;
    }
};

util.inherits(Controller, EventEmitter);
//util.inherits(Thing, EventEmitter);
//util.inherits(Host, EventEmitter);
module.exports = Host;
module.exports.Thing = Thing;
