"use strict"
var util = require('util')
var EventEmitter = require('events').EventEmitter
process.binding('http_parser').HTTPParser = require('http-parser-js').HTTPParser;
var http = require('http')
var express = require('express')
var https = require('https')
var bodyParser = require('body-parser')
var fs = require('fs')
var uuid = require('node-uuid')
var os = require('os')
var path = require('path')
var ioc = require('socket.io-client')
var serveStatic = require('serve-static')
var url = require('url')

class Config extends EventEmitter {
    constructor(options, prefix) {
        super()
        if (!options) { var options = [] }

        this.params = []
        this.things = []

        this.setParam = function (name, value, prefixId = false) {
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
            this.params.push({ "name": name, "value": value, "prefixId": prefixId })
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
            this.params.push({ "name": options[param].name, "value": options[param].value, "prefixId": options[param].prefixId })
        }

        if (this.getParam('id') == undefined) {
            this.params.push({ "name": "id", "value": uuid.v1(), "prefixId": false })
        }

        if (prefix) {
            this.prefix = prefix
        } else {
            this.prefix = this.getParam('id')
        }

    }

    getModel() {
        var things = []
        for (var index in this.things) {
            things.push({ id: this.things[index].id })
        }

        var params = []
        for (var index in this.params) {
            if (this.params[index].prefixId) {
                params.push({ "name": this.params[index].name, "value": path.normalize(this.prefix + '/' + this.params[index].value), "prefixId": this.params[index].prefixId })
            } else {
                params.push({ "name": this.params[index].name, "value": this.params[index].value, "prefixId": this.params[index].prefixId })
            }
        }

        var rtn = { 'things': things, 'params': params }

        for (var param in params) {
            rtn[params[param].name] = params[param].value
        }
        return rtn
    }

    stringify() {
        return JSON.stringify(this);
    }

    getParameter(name) {
        return this.getParam(name)
    }

    setParameter(name, value, prefixId) {
        this.setParam(name, value, prefixId)
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
        this.config = new Config(profile.params, profile.prefix);
        if (this.config.getParameter('html') == undefined) { this.config.setParameter('html', "thing.html", true) }
        if (this.config.getParameter('img') == undefined) { this.config.setParameter('img', "images/thing.png", true) }
        if (this.config.getParameter('action') == undefined) { this.config.setParameter('action', "naviagte") }

        this.state = new State();
        //this.state.on('STATECHANGED', function (state) {
        //    this.emit('STATECHANGED', state)
        //})

        this.callback = callback
        this.socket = profile.socket;
        this.visible = true
        this.states = [];
        //this.pulse = data.pulse;
        this.imageProviders = []
        this.videoProviders = []
        this.audioProviders = []
        this._appget = []
        this._appuse = []
        this.things = []

        this.serve = serveStatic(__dirname + '/public').bind(this)
        var self = this

        this.localRequest = (req, res, next) => {
            console.info('************************************')
            console.info('*Local Request called for: ' + req.path + ' this is ' + this.name)
            var pathParts = req.path.split('/')
            var path = pathParts[1] + '/' + pathParts[2]
            console.info('*Local Request path is: ' + path)
            //console.info('*Local Request base Directory: ' + self.getParameter("baseDir"))
            //var fileName = path.normalize(self.getParameter("baseDir") + req.path)
            //console.info('*Local Request file: ' + fileName)
            for (var i = 0; i < this._appget.length; i++) {
                console.info('*Checking if ' + this._appget[i].path + ' == ' + req.path)
                if (this._appget[i].path == req.path) {
                    console.info('*Found local _apget')
                    this._appget[i].callback(req, res)
                    return;
                }
            }
            this.serve(req, res, next)
            //            fs.stat(fileName, (err, stats) => {
            //                if (err) {
            //                    console.info('*Local Request static file not found')
            //                    console.info('*Searching local _apget')
            //                    for (var i = 0; i < this._appget.length; i++) {
            //                        console.info('*Checking if ' + this._appget[i].path + ' == ' + req.path)
            //                        if (this._appget[i].path == req.path) {
            //                            console.info('*Found local _apget')
            //                            this._appget[i].callback(req, res)
            //
            //                        }
            //                    }
            //                    console.info('************************************')
            //next()
            //                } else {
            //                    console.info('*Local Request serving static file')
            //                    res.writeHead(200, {
            //                        'Content-Type': 'image/png',
            //                        'Content-Length': stats.size
            //                    });
            //                    var readStream = fs.createReadStream(fileName);
            // We replaced all the event handlers with a simple call to readStream.pipe()
            //                    readStream.pipe(res);
            //res.send(fs.readFile(fileName))
            //                    console.info('************************************')
            //                }
            //            })
        }

        if (profile.socket) {
            console.info('Adding socket appuse for ' + this.config.getParameter('name'))
            this._appuse.push({ path: '/' + this.config.getParameter('id'), callback: this.remoteRequest })
            //this.config.setParameter('html', '/' + this.config.getParameter('id') + '/' + this.config.getParameter('html'))
            //this.config.setParameter('img', '/' + this.config.getParameter('id') + '/' + this.config.getParameter('img'))
            this.config.setParameter('uri', profile.uri)
        } else {
            console.info('Adding local appuse for ' + '/' + this.config.getParameter('id') + this.config.getParameter('name'))
            this._appuse.push({ path: '/' + this.config.getParameter('id'), callback: this.localRequest })
            //console.info('Adding local static server of ' + this.config.getParameter("baseDir") + '/public for ' + this.config.getParameter('name'))
            //this.serve = serveStatic(this.config.getParameter("baseDir") + '/public')
        }

        this.config.on('CONFIGCHANGED', function (config) {
            //console.log('CONFIGCHANGED for Thing id: ' + config.id + ' parameter: ' + config.name + ' value: ' + config.value)
            self.emit('CONFIGCHANGED', config)
        })

        var self = this
        this.heartbeat = function () {
            this.emit('pulse', this.state); //emit the event back to the host
        }

        this.getThing = function (id) {
            //console.log('Searching for ' + id + ' in ' + this.things.length + ' things')
            if (this.id == id) {
                return this;
            }
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
            if (!(thing instanceof Thing)) {
                console.log("Request to add thing: " + thing.config.name + ' to: ' + this.name + ' WARNING: New Thing created');
                var soc = thing.socket
                var thing = new Thing(thing.config)
                thing.socket = soc
            }
            console.log('Pisky Thing add thing called for: ' + thing.name + ' : ' + thing.id)
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
                    console.log("!!!!!!!!!!!!!!You should never see this code.. investigate");
                    //var a = new Thing(thing);
                    //self.things.push(a);
                }

                if (Array.isArray(thing._appget)) {
                    //console.error("_appget for " + thing.name + " has " + thing._appget.length + " items")
                    for (var index = 0; index < thing._appget.length; index++) {
                        //console.log('VVVVVVVV adding _appget for ' + thing.name)
                        this._appget.push(thing._appget[index])
                        //if ((typeof thing._appget[index] === "object") && (thing._appget[index] !== null)) {
                        //                        console.log("Adding _appget for " + thing._appget[index].path);
                        //    self.app.get(thing._appget[index].path, thing._appget[index].callback);
                        //}
                    }
                } else {
                    console.error("_appget for " + thing.name + " is not an Array!!!")
                }

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
            //console.log('Loading profile thing')
            var thingProfile = this.callback(profile.things[i].id, profile.prefix)
            //console.log('thingProfile : ' + JSON.stringify(thingProfile))
            var a, b
            if (!profile.socket && profile.things[i].requirement) {
                if (profile.things[i].requirement.includes('PiskyRF433')) {
                    a = require(__dirname + "/../../add_ons/pisky-rf433")
                    b = new a(thingProfile, this.callback)
                } else {
                    if (profile.things[i].requirement.includes('PiskyIpCam')) {
                        a = require(__dirname + "/../../add_ons/pisky-ipcam")
                        b = new a(thingProfile, this.callback)
                    } else {
                        b = new Thing(thingProfile, this.callback)
                    }
                }
            } else {
                b = new Thing(thingProfile, this.callback)
            }

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

    get id() { return this.config.getParameter('id') }

    get name() { return this.config.getParameter('name') }
    set name(value) { this.config.setParameter('name', value) }

    get html() { return this.config.getParameter('html') }
    set html(value) { this.config.setParameter('html', value, true) }

    get img() { return this.config.getParameter('img') }
    set img(value) { this.config.setParameter('img', value, true) }

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

    setParameter(name, value, prefixId) {
        return this.config.setParameter(name, value, prefixId);
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
            if (!id) {
                console.log('*** Reading active profile ***')
                try {
                    var data = JSON.parse(fs.readFileSync(path.normalize(__dirname + "/.config/pisky.config.json"), { 'encoding': 'utf8' }))
                    console.info('Profile read: ' + JSON.stringify(data))
                    if (data.id) {
                        id = data.id;
                    } else {
                        console.warn('Invalid active profile found... Creating new profile ***')
                    }
                } catch (e) {
                    console.warn('No active profile found (' + e + '). Creating new profile ***')
                }
            }
            if (id) {
                console.log('*** Loading Configuration  for ' + id + '***')
                try {
                    var data2 = fs.readFileSync(path.normalize(__dirname + "/.config/" + id + ".config.json"), { 'encoding': 'utf8' })
                    //console.log('Profile read: ' + data2)
                    return JSON.parse(data2);
                } catch (e) {
                    console.error('Error loading configuration:' + e)
                    return { params: [], things: [] };
                }
            }
            return { params: [], things: [] };
        }

        if (!options) { var options = {} }
        var profile = load(options.id)

        super(profile, load);
        if (this.getParameter('name') == undefined) { this.setParameter('name', 'Unknown') }
        if (this.getParameter('description') == undefined) { this.setParameter('description', 'Unknown') }
        if (this.getParameter('action') == undefined) { this.setParameter('action', 'navigate') }
        this.setParameter('html', 'host.html', true)
        this.setParameter('img', 'images/host.png', true)
        this.setParameter('type', 'host')

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
            self.io.emit('message', message)
        })

        this.on('command', (data) => {
            console.log('Host received command ' + JSON.stringify(data))
            switch (data.command) {
                case 'Update':
                    console.log('Host received request to update its configuration with data:' + JSON.stringify(data.value))
                    for (var prop in data.value) {
                        console.log('Host setting ' + data.value[prop].name + ' to ' + data.value[prop].value)
                        this.setParameter(data.value[prop].name, data.value[prop].value)
                    }
                    break
                default:
                    console.error('Host received an unexpected request' + JSON.data)
            }
        })

        this.save = function (thing) {
            if (!thing.socket) {
                console.log('*******Saving profile for ' + thing.name + ' id: ' + thing.id)
                //console.log('Profile: ' + thing.getConfig())
                fs.writeFile(path.normalize(__dirname + "/.config/" + thing.id + ".config.json"), thing.getConfig(), "utf8", function (err) {
                    if (err) {
                        console.error("Error saving configuration: ") + JSON.stringify(err)
                    } else {
                        console.log("Configuration saved")
                    }
                });
                for (var index in thing.things) {
                    this.save(thing.things[index])
                }
                if (thing.id == this.id) {
                    fs.writeFile(path.normalize(__dirname + "/.config/pisky.config.json"), '{"id":"' + this.id + '"}', "utf8", function (err) {
                        if (err) {
                            console.log("Error saving default profile ") + err.message
                        }
                        console.log('Profile @: ' + path.normalize(__dirname + "/.config/pisky.config.json saved."))
                    });
                }
            }
        }

        this.remoteRequest = (req, res, next) => {
            console.log('Remote Request called for:' + req.originalUrl)
            var pathParts = req.originalUrl.split('/')
            var newReq = '/' + pathParts.slice(2).join('/');
            var urlObj
            for (var i in self.remoteHosts) {
                if (self.remoteHosts[i].id == pathParts[1]) {
                    urlObj = url.parse(self.remoteHosts[i].uri)
                }
            }

            console.log('Remote Request (hacked) called for:' + newReq)
            var options = {
                hostname: urlObj.hostname,
                port: 443,
                path: newReq,
                headers: req.headers,
                rejectUnauthorized: false
            };

            options.agent = new https.Agent(options);

            https.get(options, function (response) {
                res.writeHead(response.statusCode, response.statusMessage, response.headers)
                response.on("data", function (chunk) {
                    res.write(chunk)
                })
                response.on("end", function (chunk) {
                    res.end(chunk)
                })
            }).on('error', function (e) {
                console.log("Error with remote request: " + JSON.stringify(e))
                res.send(fs.readFileSync(__dirname + '/public/images/device.png'))
            }, this)
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
        this.app.use(express.static(path.normalize(__dirname + '/public')));

        var jq = path.dirname(require.resolve('jquery'))
        this.app.use(express.static(jq));

        var ko = path.dirname(require.resolve('knockout'))
        this.app.use(express.static(ko));

        //        var jqm = path.dirname(require.resolve('jquery-mobile'))
        //        console.log('jqm directory = ' + jqm)
        //        this.app.use(express.static(jqm));

        for (var i in this._appuse) {
            if (this._appuse[i].path) {
                console.log('Adding ' + this._appuse[i].path + ' to list of directories for ' + this.name)
                this.app.use(this._appuse[i].path, this._appuse[i].callback);
            } else {
                this.app.use(express.static(this._appuse[i]));
            }
        }

        for (var i in this._appget) {
            console.log('Adding ' + this._appget[i].path + ' to list of files for ' + this.name)
            this.app.get(this._appget[i].path, this._appget[i].callback);
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

        self.networks = []
        self.remoteHosts = []
        //self.country = "";
        //self.city = "";

        var networkInterfaces = os.networkInterfaces();
        for (var i in networkInterfaces) {
            if (self.config.getParameter('lanip') == undefined) {
                if (networkInterfaces.hasOwnProperty(i)) {
                    var net = networkInterfaces[i];
                    for (var j = 0; j < net.length; j++) {
                        if (net[j].family == 'IPv4' && net[j].address != '127.0.0.1') {
                            self.config.setParameter('lanip', net[j].address);
                            break;
                        }
                    }
                }
            }
        }

        self.lanurl = "http://" + self.config.getParameter('lanip') + ":" + self.config.getParameter('port') + "/";

        self.addNetwork = function (url) {
            console.log('Request to add network @ ' + url + ')')

            //var host = url.parse(hostUrl)

            var socket = ioc.connect(url, { query: { id: self.id, username: self.name, image: 'imagecode', type: 'host' } })
            socket.on('connect_error', function (err) {
                console.log('Connection Error: ' + err)
            })
            socket.on('connect', function () {
                console.log(self.name + ": Connected to: " + socket.io.uri + " on socket id:" + socket.id)
                //socket.piskyId = self.id
                //socket.piskyName = self.name
                console.info('sending things to ' + socket.io.uri)
                socket.emit('things', self.getModel());
                //for (var thing in self.things) {
                //    console.info('sending thing:' + self.things[thing].name + ' to ' + name)
                //    //var a = self.things[thing].getModel()
                //    //a.socket = socket.id
                //    //socket.emit('addthing', { config: self.things[thing].getModel(), socket: socket.id });
                //    socket.emit('addthing', self.things[thing].getModel());
                //}
                self.networks.push({ url: url, socket: socket });
            });

            socket.on('disconnect', function () {
                console.info('Network socket has disconnected')

                for (var i in self.networks) {
                    if (self.networks[i].socket == socket) {
                        console.info("Removing network " + self.networks[i].url);
                        self.networks.splice(i, 1)
                    }
                }

                for (var thing in this.things) {
                    if (this.things[thing].socket == socket.id) {
                        console.info("Removing " + this.things[thing].name);
                        self.io.emit("removething", self.things[i].id)
                        this.things.splice(i, 1);
                    }
                }
            })

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
                console.log("")
                console.log("Got " + things.length + " things back from " + socket.io.uri)
                var prefix
                var loadThing = function (id) {
                    console.info('Remote thing load called ' + id + ' : ' + prefix)
                    for (var i = 0; i < things.length; i++) {
                        if (things[i].id == id) {
                            console.info('creating new Thing for ' + things[i].name)
                            things[i].socket = socket.id
                            things[i].uri = socket.io.uri
                            things[i].prefix = prefix
                            //var newThing = new Thing(things[i], loadThing)
                            return things[i]
                        }
                    }
                    console.error('Could not locate thing in returned collection of things')
                    return { params: [], things: [] }
                }

                for (var index in things) {
                    //console.info('Process remote thing : ' + things[index].name)
                    if (!self.getThing(things[index].id)) {
                        console.info('Creating remote thing : ' + things[index].name)
                        prefix = things[index].id
                        var newProfile = loadThing(things[index].id)
                        var newThing = new Thing(newProfile, loadThing)
                        self.addThing(newThing, false)
                        self.app.use('/' + prefix, self.remoteRequest);
                        self.remoteHosts.push({ 'id': prefix, 'uri': socket.io.uri })
                        //for (var i in newThing._appuse) {
                        //    console.log('Adding socket ' + newThing._appuse[i].path + ' to list of directoies for ' + newThing.name)
                        //    self.app.use(newThing._appuse[i].path, newThing._appuse[i].callback);
                        //}
                        //for (var i in newThing._appget) {
                        //    console.log('Adding socket ' + newThing._appget[i].path + ' to list of files for ' + newThing.name)
                        //    self.app.get(newThing._appget[i].path, newThing._appget[i].callback);
                        //}
                        console.info('Adding ' + things[index].name + ' to ' + self.name)
                    }
                }
                //self.emit('status', event); //emit the event back to the bot
            })


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
            console.log("connection from: " + socket.request.connection.remoteAddress);
            //var address = socket.request.connection.remoteAddress;
            var address = socket.request.connection.remoteAddress.substring(socket.request.connection.remoteAddress.lastIndexOf(':') + 1)
            console.log("connection from: " + address);
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
            socket.on('addthing', function (things) {
                console.log('socket addthing: ' + JSON.stringify(things))
                //console.log('socket addthing: ' + thing.config.name + " (" + thing.config.id + ") connection from " + " @ " + socket.id);
                //return
                //thing.setParameter('socket', socket.id)
                //First check if you already know about this thing
                if (self.addThing(thing)) {
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
                        console.log('Got a command message for thing (' + t.name + '), so emmitting to socket:' + t.socket);
                        t.socket.emit('command', data);
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
            socket.on('things', function (things) {
                console.log("Client sent " + things.length + " things back ")
                var loadThing = function (id, prefix) {
                    // console.info('Remote thing load called ')
                    for (var i = 0; i < things.length; i++) {
                        if (things[i].id == id) {
                            console.info('creating new Thing for ' + things[i].name)
                            things[i].socket = socket.id
                            things[i].uri = address
                            //things[i].uri = 'https://192.168.0.18/' //socket.io.uri
                            var newThing = new Thing(things[i], loadThing)
                            console.info(newThing.name + ' (NewRemote) has ' + newThing._appget.length + ' Appgets')
                            return newThing
                        }
                    }
                    console.error('Could not locate thing in returned collection of things')
                    return { params: [], things: [] }
                }

                for (var index in things) {
                    console.info('Process client thing : ' + things[index].name)
                    if (!self.getThing(things[index].id)) {
                        console.info('Creating client thing : ' + things[index].name)
                        var newThing = loadThing(things[index].id, things[index].id)
                        console.info(newThing.name + ' (Client) has ' + newThing._appget.length + ' Appgets')
                        self.addThing(newThing, false)
                        for (var i in newThing._appuse) {
                            console.log('Adding socket ' + newThing._appuse[i].path + ' to list of directoies for ' + newThing.name)
                            self.app.use(newThing._appuse[i].path, newThing._appuse[i].callback);
                        }
                        for (var i in newThing._appget) {
                            console.log('Adding socket ' + newThing._appget[i].path + ' to list of files for ' + newThing.name)
                            self.app.get(newThing._appget[i].path, newThing._appget[i].callback);
                        }
                        console.info('Adding ' + things[index].name + ' to ' + self.name)
                    }
                }
                //self.emit('status', event); //emit the event back to the bot
            })
            //socket.on('things', function (things) {
            //    console.log('Things recieved on socket :' + JSON.stringify(things))
            //    for (var i = 0; i < things.length; i++) {
            //        if (self.things.indexOf(function (id) { return things[i].id == id; }) > -1) {
            //        } else {
            //            var newThing = new Thing(things[i], function (id, command, data) {
            //                if (command == 'getThing') {
            //                    return self.getThing(data)
            //                //} else {
            //                //    self.socket.emit('command', { socketId: self.socket.id, id: id, command: command, value: data });
            //                }
            //            });
            //            newThing.socket = socket.id
            //            self.addThing(newThing, false)
            //           //self.things.push(newThing);
            //        }
            //    }
            //});

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
    }
}

module.exports = Host;
module.exports.Thing = Thing;
