"use strict"
var util = require('util')
var EventEmitter = require('events').EventEmitter
process.binding('http_parser').HTTPParser = require('http-parser-js').HTTPParser;
var http = require('http')
var express = require('express')
var https = require('https')
var http2 = require('http2')
var bodyParser = require('body-parser')
var fs = require('fs')
var uuid = require('node-uuid')
var os = require('os')
var path = require('path')
var io = require('socket.io');
var ioc = require('socket.io-client')
var serveStatic = require('serve-static')
var url = require('url')
var piskyParser = require('pisky-parser')
var pem = require('pem')
var npm = require('npm')

const stream = require('stream')
const BOUNDARY = 'pisky-boundary'
const BOUNDARY_DASHES = '--'
const NEWLINE = '\r\n';

class Parameter {
    constructor(options) {
        if (!options) { var options = {} }
        this.value = options.value
        this.prefixId = options.prefixId
        this.type = options.type || "text"
    }
}

class Config extends EventEmitter {
    constructor(options, prefix) {
        //console.log('Constructor of Config called for params ' + JSON.stringify(options))
        super()
        if (!options) { var options = [] }

        this.params = {}
        this.things = []
        this.commands = []
        this.properties = {}

        this.setParam = function (name, value, prefixId = false, type = 'text') {
            if (typeof this.params[name] == 'object' && this.params[name].value == value && this.params[name].prefixId == prefixId) return false
            this.params[name] = { value: value, prefixId: prefixId }
            this.emit('CONFIGCHANGED', { id: this.getParam('id'), name: name, value: value })
            return true
        }

        this.getParam = function (name) {
            if (typeof this.params[name] == 'object') {
                if (this.params[name].prefixId) {
                    return path.normalize(this.prefix + '/' + this.params[name].value)
                } else {
                    return this.params[name].value
                }
            }
            return undefined
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
            this.params[param] = { value: options[param].value, prefixId: options[param].prefixId }
        }

        if (this.params.id == undefined) {
            this.params.id = { value: uuid.v1(), prefixId: false }
        }

        if (this.params.pulse == undefined) {
            this.params.pulse = { value: -1, prefixId: false }
        }

        if (prefix) {
            this.prefix = prefix
        } else {
            this.prefix = this.params.id.value
        }
    }

    getModel() {
        var things = []
        for (var index in this.things) {
            things.push({ id: this.things[index].id })
        }

        return {
            id: this.getParam('id'),
            name: this.getParam('name'),
            description: this.getParam('description'),
            html: this.getParam('html'),
            img: this.getParam('img'),
            action: this.getParam('action'),
            enabled: this.getParam('enabled'),
            things: things
        }
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
        this._states = {}

        this.setState = function (name, value) {
            if (this._states[name] != value) {
                this._states[name] = value
                this.emit('STATECHANGED', { "name": name, "value": value })
            }
            return true
        }

        this.getState = function (name) {
            return this._states[name]
        }
    }

    getStates() {
        return this._states
    }

    getState(name) {
        return this.getState(name)
    }

    setState(name, value) {
        this.setState(name, value)
    }
}

class Thing extends EventEmitter {
    constructor(profile, callback) {
        //console.log('Constructor of Thing called for params ' + JSON.stringify(profile.params))
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
        this.config = new Config(profile.params, profile.prefix ? profile.prefix.value : false);
        if (this.config.getParameter('enabled') == undefined) { this.config.setParameter('enabled', true) }
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
        //this.states = [];
        //this.pulse = data.pulse;
        this.imageProviders = []
        this.videoProviders = []
        this.audioSources = []
        this.audioSinks = []
        this._appget = []
        this._appuse = []
        this.things = []

        console.log("Thing adding static directory for " + __dirname + '/public')
        this.serve = serveStatic(__dirname + '/public').bind(this)

        //        this.on('command', (data) => {
        //            console.log(this.name + ' saw a command for: ' + data.id + ' ...Checking if it is a thing I know about')
        //            for (var i = 0; i < this.things.length; i++) {
        //                if (data.id == this.things[i].id) {
        //                    console.log(this.name + ' should handle reuest for: ' + data.id)
        //                    return
        //                }
        //            }
        //            console.log(this.name + ' cant handle reuest for: ' + data.id + '. emitting comamnd up')
        //            //this.emit('command', (data))
        //        })
        var self = this

        this.localRequest = (req, res, next) => {
            console.info('************************************')
            console.info('*Local Request called for: ' + req.path + ' this is ' + this.name)
            //var pathParts = req.path.split('/')
            //var path = pathParts[1] + '/' + pathParts[2]
            //console.info('*Local Request path is: ' + path)
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
        }

        if (profile.socket) {
            //console.info('Adding socket appuse for ' + this.config.getParameter('name'))
            //this._appuse.push({ path: '/' + this.config.getParameter('id'), callback: this.remoteRequest })
            this.config.setParameter('uri', profile.uri)
        } else {
            console.info('Adding local appuse for ' + '/' + this.config.getParameter('id') + ' ' + this.config.getParameter('name'))
            this._appuse.push({ path: '/' + this.config.getParameter('id'), callback: this.localRequest })

        }

        this.config.on('CONFIGCHANGED', function (config) {
            //console.log('CONFIGCHANGED for Thing id: ' + config.id + ' parameter: ' + config.name + ' value: ' + config.value)
            self.emit('CONFIGCHANGED', config)
        })

        var self = this

        this._heartbeat = () => {
            console.log('*** INITIALISING STATE ***')
            if (typeof this.heartbeat == 'function') {
                console.log('*** CALLING HEARTBEAT ***')
                this.heartbeat()
            }
            if (this.channelSocket) {
                //console.log('heartbeat emitted: ' + JSON.stringify(this.state.getStates()))
                this.channelSocket.emit('pulse', this.state.getStates())
            }
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
            //           console.log('Pisky Thing add thing called for: ' + thing.name + ' : ' + thing.id)
            if (addToConfig != false) { addToConfig = true }
            if (this.getThing(thing.id)) {
                console.log("Request to add thing: " + thing.name + ' to: ' + this.name + ' : Already exists')
                return false
            }
            if (thing instanceof Thing) {
                //if (thing.prototype != undefined && Thing.constructor.prototype.isPrototypeOf(thing.constructor)) {
                console.log("Request to add Pisky Thing: " + thing.name + ' to: ' + this.name);

                thing.on('refresh', () => {
                    console.log('Refresh event heard by:' + self.name + ' sending ' + self.things.length + ' things')
                    //thing.refresh(self.things)
                    thing.refresh(self.getModel())
                })

                thing.on('alert', (directive) => {
                    //                        console.log("thing ALERTED: " + thing.name + ' id: ' + thing.id);
                    self.io.emit('alert', directive);
                })
                thing.on('directive', (directive, payload) => {
                    //                        console.log("thing ALERTED: " + thing.name + ' id: ' + thing.id);
                    self.emit('directive', directive, payload)
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

                thing.on('command', (data) => {
                    console.log(this.name + ' saw a command for: ' + data.id + ' ...Checking if it is a thing I know about')
                    for (var i = 0; i < this.things.length; i++) {
                        if (data.id == this.things[i].id) {
                            console.log(this.name + ' the command is for: ' + this.things[i].name + ' ...Checking if its local')
                            if (this.things[i].socket) { //Thing is on network
                                console.log(this.name + ': ' + this.things[i].name + ' is remote')
                                switch (data.command) {
                                    case 'addAudioSource':
                                        console.log('Pisky request to add remote audio ' + JSON.stringify(this.things[i]))

                                        var urlObj = url.parse(things[i].uri)
                                        var options = {
                                            protocol: urlObj.protocol,
                                            hostname: urlObj.hostname,
                                            port: urlObj.port,
                                            path: '/' + things[i].voicein,
                                            method: 'POST',
                                            headers: {
                                                'content-type': 'Multipart/related; boundary="' + BOUNDARY + '"'
                                            },
                                            rejectUnauthorized: false
                                        }
                                        var req = http2.request(options);
                                        req.setTimout(0)
                                        req.on('response', function (response) {
                                            console.log('response from alexa' + JSON.stringify(response.headers))
                                            response.on('data', function (data) {
                                                console.log('Body: ' + data)
                                            })
                                        })
                                        req.on('error', function (err) {
                                            console.log('error from alexa: ' + err)
                                        })


                                        data.stream.on('start', function () {
                                            console.log('start voice for Alexa')
                                            req.write('Content-Disposition: form-data; name="audio"' + NEWLINE);
                                            req.write('Content-Type: application/octet-stream' + NEWLINE);
                                            req.write('Transfer-Encoding: chunked' + NEWLINE);
                                            req.write(NEWLINE);
                                        })
                                        data.stream.on('data', function (chunk) {
                                            console.log('data for Alexa')
                                            req.write(chunk)
                                        })
                                        data.stream.on('stop', function () {
                                            console.log('Endvoice for Alexa')
                                            req.write(BOUNDARY_DASHES + BOUNDARY + NEWLINE)
                                        })
                                        //this.remoteRequest(req, res)
                                        break
                                    default:
                                }
                            } else { //Thing is local
                                console.log(this.name + ': ' + this.things[i].name + ' is local')
                                switch (data.command) {
                                    case 'addAudioSource':
                                        this.things[i].addAudioSource(data.stream)
                                        break
                                    default:
                                }

                            }
                            console.log(this.name + ' should handle request for: ' + data.id)
                            return
                        }
                    }
                    console.log(this.name + ' cant handle reuest for: ' + data.id + '. emitting comamnd up?')
                    this.emit('command', (data))
                })

                self.things.push(thing)
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
            }

            if (Array.isArray(thing.things)) {
                for (var i = 0; i < thing.things.length; i++) {
                    self.addThing(thing.things[i], false)
                }
            }
            self.emit('CONFIGCHANGED', { "id": this.id })
            return true
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

        this.allocateChannel = (channelSocket) => {
            //console.log('Channel connected to ' + this.name + 'config: ' + JSON.stringify(this.config))
            console.log('Channel connected to ' + this.name + 'state: ' + JSON.stringify(this.state.getStates()))
            this.channelSocket = channelSocket
            this.channelSocket.emit('init', JSON.stringify(this.config), this.state.getStates())

            this.channelSocket.on('command', (data) => {
                console.log(this.name + ' Heard command ' + JSON.stringify(data))
                switch (data.command) {
                    case 'Update':
                        //console.log(this.name + ' received request to update its configuration with data:' + JSON.stringify(data.data))
                        for (var prop in data.data) {
                            //console.log('Host setting ' + data.data[prop].name + ' to ' + data.data[prop].value)
                            this.setParameter(data.data[prop].name, data.data[prop].value)
                        }


                    default:
                        if (typeof this.processCommand == 'function') {
                            console.log('  Command delegated to add on for processing')
                            this.processCommand(data, (error) => {
                                console.log(error)
                            })
                        }
                }
            })
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

        console.log('Pulse is set to ' + parseInt(this.getParameter('pulse')))
        this._heartbeat()
        if (parseInt(this.getParameter('pulse')) > 10) {
            setInterval(this._heartbeat, parseInt(this.getParameter('pulse')))
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
                        a = require("pisky-ipcam")
                        b = new a(thingProfile, this.callback)
                    } else {
                        if (profile.things[i].requirement.includes('pisky_snowboy')) {
                            a = require(__dirname + "/../../add_ons/pisky-snowboy")
                            b = new a(thingProfile, this.callback)
                        } else {
                            if (profile.things[i].requirement.includes('PiskyAlexa')) {
                                a = require(__dirname + "/../../add_ons/pisky-alexa")
                                b = new a(thingProfile, this.callback)
                            } else {
                                if (profile.things[i].requirement.includes('PiskyRaspivid')) {
                                    a = require(__dirname + "/../../add_ons/pisky-raspivid")
                                    b = new a(thingProfile, this.callback)
                                } else {
                                    if (profile.things[i].requirement.includes('pisky_location')) {
                                        a = require(__dirname + "/../../add_ons/pisky-location")
                                        b = new a(thingProfile, this.callback)
                                    } else {
                                        console.log('Cant create a ' + profile.things[i].requirement)
                                        b = new Thing(thingProfile, this.callback)
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                b = new Thing(thingProfile, this.callback)
                //b = thingProfile
            }

            b.on('CONFIGCHANGED', function (config) {
                console.log('Thing CONFIGCHANGED ')
                //var thing = this.getThing(config.id)
                //this.save(thing)
            })
            this.addThing(b)
        }

        //console.log('Thing this:' + JSON.stringify(this))
    }

    get id() { return this.config.getParameter('id') }

    get name() { return this.config.getParameter('name') ? this.config.getParameter('name') : 'Unnamed' }
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

    get enabled() { return this.config.getParameter('enabled') }
    set enabled(value) { this.config.setParameter('enabled', value) }

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
        return JSON.stringify(this.config)
    }

}

class Host extends Thing {
    constructor(options) {
        var start = () => {
            try {
                fs.accessSync(__dirname + "/config/certs/" + this.id + '.private.pem', 'r')
                var server = http.createServer(this.app)
                server.listen(parseInt(this.config.getParameter('httpPort')))
                var httpsServer = https.createServer({
                    key: fs.readFileSync(options.key ? options.key : path.normalize(__dirname + "/config/certs/" + this.id + ".private.pem")),
                    cert: fs.readFileSync(options.cert ? options.cert : path.normalize(__dirname + "/config/certs/" + this.id + ".public.pem"))
                }, this.app)
                //            self.httpsServer.listen(self.httpsPort);
                self.io.listen(httpsServer.listen(this.config.getParameter('httpsPort')))
                console.log(this.name + ": Listening on: " + this.lanurl + ' and https port: ' + this.config.getParameter('httpPort'));
            } catch (e) {
                console.log('SSL certificate not available: waiting 5 seconds...')
                setTimeout(start, 5000)
            }
        }

        var load = function (id) {
            console.log('********************************************')

            // If the id hasn't been supplied, we should look for a default configuration
            if (!id) {
                try {
                    var data = JSON.parse(fs.readFileSync(path.normalize(__dirname + "/config/pisky.config.json"), { 'encoding': 'utf8' }))
                    console.info('*** Active profile read: ' + JSON.stringify(data))
                    if (data.id) {
                        id = data.id;
                    } else {
                        console.warn('*** Invalid active profile found... Creating new profile ***')
                    }
                } catch (e) {
                    console.warn('*** No active profile found (' + e + '). Creating new profile ***')
                    id = uuid.v1()
                }

                //Check for SSL certificate
                try {
                    fs.accessSync(__dirname + "/config/certs/" + id + '.private.pem', 'r')
                } catch (e) {
                    console.log("Generating self signed certificate...")
                    pem.config({
                        pathOpenSSL: path.normalize("C:\\OpenSSL-Win32\\bin\\openssl.exe")
                    })
                    pem.createCertificate({ days: 365, selfSigned: true }, (err, keys) => {
                        if (err) {
                            throw "Error generating self signed certificate: " + err
                        }
                        fs.writeFile(path.normalize(__dirname + "/config/certs/" + id + ".private.pem"), keys.serviceKey, "utf8", (err) => {
                            if (err) {
                                throw "Error saving private certificate key: " + err
                            } else {
                                console.log("Private certificate key saved")
                            }
                        })
                        fs.writeFile(path.normalize(__dirname + "/config/certs/" + id + ".public.pem"), keys.certificate, "utf8", (err) => {
                            if (err) {
                                throw "Error saving public certificate key: " + err
                            } else {
                                console.log("Public certificate key saved")
                            }
                        })
                    })
                }
                finally {
                }
            }

            // Read the configuration file for this id
            try {
                var data = fs.readFileSync(path.normalize(__dirname + "/config/" + id + ".config.json"), { 'encoding': 'utf8' })
                console.log('*** Loading Configuration  for ' + id + '***')
                return JSON.parse(data);
            } catch (e) {
                console.error('*** New configuration created:' + e)
                return { params: {id: {value: id, prefixId: false }}, things: [] };
            }
        }

        var loadVoice = function (id) {
            console.log('********************************************')
            if (!id) {
                return undefined
            }
            console.log('*** Loading Voice Configuration for ' + id + '***')
            try {
                var data = fs.readFileSync(path.normalize(__dirname + "/config/" + id + "/" + id + ".pmdl"), { 'encoding': 'utf8' })
                console.log('********************************************')
                return JSON.parse(data);
            } catch (e) {
                console.error('*** No local voice configuration found: ' + e)
                console.log('********************************************')
                return null;
            }
        }

        var loadAddOns = () => {
            var addons = []
            fs.readdir(path.normalize(__dirname + '/add_ons'), function (err, files) {
                if (err) {
                    throw err;
                }
                files.filter(function (file) {
                    return fs.statSync(path.normalize(__dirname + '/add_ons/' + file)).isDirectory();
                }).forEach(function (file) {
                    addons.push({ name: file, path: path.normalize(__dirname + '/add_ons/' + file) })
                    //console.log("%s (%s)", file, path.normalize(__dirname + '/add_ons/' + file));
                })
            })
            this.config.properties['addons'] = addons
        }

        if (!options) { var options = {} }
        var profile = load(options.id)

        super(profile, load)
        loadAddOns()
        if (this.getParameter('name') == undefined) { this.setParameter('name', 'Unknown') }
        if (this.getParameter('description') == undefined) { this.setParameter('description', 'Unknown') }
        if (this.getParameter('action') == undefined) { this.setParameter('action', 'navigate') }
        this.setParameter('html', 'host.html', true)
        this.setParameter('img', 'images/host.png', true)
        this.setParameter('type', 'host')
        if (this.getParameter('httpPort') == undefined) { this.setParameter('httpPort', 80) }
        if (this.getParameter('httpsPort') == undefined) { this.setParameter('httpsPort', 443) }

        this.processCommand = (data, cb) => {
            //console.log(this.name + ' got a command to install ' + JSON.stringify(data))
            //console.log('Command is :' + data.command + ':')
            switch (data.command) {
                //InstallAddons 
                case 'InstallAddon':
                    console.log('Command recognised as :' + data.command + ':' + JSON.stringify(data))
                    console.log(this.name + ' got a command to install ' + data.data.path)
                    npm.load((err) => {
                        // handle errors
                        if (err) {
                            cb(err)
                            return
                        }
                        // install module ffi
                        npm.commands.install([data.data.path], (er, installData) => {
                            // log errors or data
                            if (er) {
                                cb(er)
                                return
                            }
                            console.log("Installed sucessfully")
                            var a = require(data.data.name)
                            var b = new a()
                            self.addThing(b)
                            self.io.of('/' + b.id).on('connection', b.allocateChannel)
                            console.log('Adding ' + JSON.stringify(b._appuse) + ' to appuse ' + this.name)
                            for (var i = 0; i < b._appuse.length; i++) {
                                self.app.use(b._appuse[i].path, b.serve);
                            }
                        });

                        npm.on('log', function (message) {
                            // log installation progress
                            //console.log(message);
                        });
                    })

                    break
                default:
                    cb('Host recieved unknown command: ' + data.command)
            }
        }
        this.lastbeat = false

        this.heartbeat = () => {
            var currentbeat = { "cpus": os.cpus(), "time": Date.now() }
            if (this.lastbeat) {
                var cpuLoads = []
                var cpuIdleLoad = 0
                var cpuBusyLoad = 0
                for (var i = 0; i < currentbeat.cpus.length; i++) {
                    cpuIdleLoad = cpuIdleLoad + currentbeat.cpus[i].times.idle - this.lastbeat.cpus[i].times.idle
                    cpuBusyLoad = cpuBusyLoad +
                        (currentbeat.cpus[i].times.user + currentbeat.cpus[i].times.nice + currentbeat.cpus[i].times.sys + currentbeat.cpus[i].times.irq) -
                        (this.lastbeat.cpus[i].times.user + this.lastbeat.cpus[i].times.nice + this.lastbeat.cpus[i].times.sys + this.lastbeat.cpus[i].times.irq)
                }
                this.state.setState('CPULoad', ((cpuBusyLoad / (cpuBusyLoad + cpuIdleLoad)) * 100).toFixed(1))
            } else {
                this.state.setState('CPULoad', 0)
            }
            this.lastbeat = currentbeat
            //this.state.setState('CPULoad', parseInt(os.loadavg()[0] * 100))
            this.state.setState('TotalMem', os.totalmem())
            this.state.setState('FreeMem', os.freemem())
        }

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
            console.log('*Host received command ' + JSON.stringify(data.command))
            switch (data.command) {
                case 'Update':
                    console.log('Host received request to update its configuration with data:' + JSON.stringify(data.value))
                    for (var prop in data.value) {
                        console.log('Host setting ' + data.value[prop].name + ' to ' + data.value[prop].value)
                        this.setParameter(data.value[prop].name, data.value[prop].value)
                    }
                    break
                case 'addAudioSource':
                    //console.log('Host received request to addAudioSource')
                    var thing = this.getThing(data.id)
                    console.log('Host request to add remote audio ' + thing.name + ' at ' + thing.getParameter('voicein'))
                    if (!thing.getParameter('uri')) {
                        console.log('ERROR: Trying to set up remote link to unknown uri')
                    }

                    var urlObj = url.parse(thing.getParameter('uri'))
                    var options = {
                        protocol: urlObj.protocol,
                        hostname: urlObj.hostname,
                        port: urlObj.port,
                        path: '/' + thing.getParameter('voicein'),
                        method: 'POST',
                        headers: {
                            'content-type': 'Multipart/related; boundary="' + BOUNDARY + '"'
                        },
                        rejectUnauthorized: false
                    }
                    var req = http2.request(options);
                    req.on('response', function (response) {
                        console.log('response from alexa' + JSON.stringify(response.headers))
                        response.on('data', function (data) {
                            console.log('Body: ' + data)
                        })
                    })
                    req.on('error', function (err) {
                        console.log('error from alexa' + err)
                    })
                    req.write(NEWLINE)
                    //req.flushHeaders()

                    data.stream.on('start', function () {
                        console.log('Start voice for Alexa')
                        req.write('Content-Disposition: form-data; name="audio"' + NEWLINE);
                        req.write('Content-Type: application/octet-stream' + NEWLINE);
                        req.write('Transfer-Encoding: chunked' + NEWLINE);
                        req.write(NEWLINE);
                    })
                    data.stream.on('data', function (chunk) {
                        console.log('data for Alexa')
                        req.write(chunk)
                    })
                    data.stream.on('stop', function () {
                        console.log('Endvoice for Alexa')
                        req.write(BOUNDARY_DASHES + BOUNDARY + NEWLINE)
                    })

                    break
                default:
                    console.error('Host received an unexpected request' + JSON.data)
            }
        })

        this.save = function (thing) {
            if (!thing.socket) {
                console.log('*******Saving profile for ' + thing.name + ' id: ' + thing.id)
                //console.log('Profile: ' + thing.getConfig())
                fs.writeFile(path.normalize(__dirname + "/config/" + thing.id + ".config.json"), thing.getConfig(), "utf8", function (err) {
                    if (err) {
                        console.error("Error saving configuration: ") + JSON.stringify(err)
                    } else {
                        console.log("Configuration saved")
                    }
                })
                for (var index in thing.things) {
                    this.save(thing.things[index])
                }
                if (thing.id == this.id) {
                    fs.writeFile(path.normalize(__dirname + "/config/pisky.config.json"), '{"id":"' + this.id + '"}', "utf8", function (err) {
                        if (err) {
                            console.log("Error saving default profile ") + err.message
                        }
                        console.log('Profile @: ' + path.normalize(__dirname + "/config/pisky.config.json saved."))
                    })
                }
            }
        }

        this.remoteRequest = (req, res, next) => {
            console.log('Remote Request called for:' + req.originalUrl)
            var pathParts = req.originalUrl.split('/')
            var newReq = '/' + pathParts.slice(2).join('/');
            var host
            for (var i in self.remoteHosts) {
                if (self.remoteHosts[i].id == pathParts[1]) {
                    console.log('self.remoteHosts[i].uri = ' + self.remoteHosts[i].uri)
                    console.log('self.remoteHosts[i].address = ' + self.remoteHosts[i].address)
                    if (self.remoteHosts[i].uri != undefined) {
                        host = url.parse(self.remoteHosts[i].uri).host
                    } else {
                        host = self.remoteHosts[i].address
                    }
                }
            }

            console.log('Remote Request (hacked) called for:' + host + ' path: ' + newReq)
            var options = {
                host: host,
                port: 443,
                path: newReq,
                headers: req.headers,
                rejectUnauthorized: false
            }

            options.agent = new http2.Agent(options)

            http2.get(options, function (response) {
                res.writeHead(response.statusCode, response.statusMessage, response.headers)
                //console.log("Remote response: " + response.statusCode)
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
        self.geo = { longitude: -3.0092, latitude: 51.5884, heading: 61.78, pitch: -0.76, velocity: 0 }

        this.app = null;
        if (options.app) {
            this.app = options.app
        } else {
            this.app = express();
        };

        //self.port = options.port || 80;
        self.config.setParameter('port', options.port || 80)
        self.httpsPort = options.httpsPort || 443

        this.app.use(bodyParser.json());

        this.app.post(/.*audioIn$/, function (req, res) {
            console.log("Requesting audioin pisky file: Path: " + req.originalUrl)
            var pathParts = req.originalUrl.split('/')
            pathParts = pathParts.slice(1)
            if (pathParts[0] == self.id) {
                pathParts = pathParts.slice(1)
            }
            console.log("Requesting audioin pisky file: is for id: " + pathParts[0])
            var target = self.getThing(pathParts[0])
            var parser = new piskyParser(req);
            var request = new stream.PassThrough()
            parser.on('error', (err) => {
                console.log('Parse Error: ' + err);
            });

            parser.on('end', () => {
                console.log('Parse End');
            });

            parser.on('part', (part) => {
                console.log('Parsed part: ' + JSON.stringify(part));
                request.emit('start')
            })

            parser.on('partdata', (chunk, part) => {
                console.log('Parsed partdata: ' + chunk.length + ' bytes of data');
                request.emit('data', chunk)
            })

            parser.on('partend', () => {
                console.log('Part End');
                request.emit('stop')
            })
            target.addAudioSource(request)
            //res.end('Hi')
        })

        this.app.get("/", function (req, res) {
            //console.log("Requesting root file");
            if (req.secure) {
                console.log("Sending file :" + __dirname + '/public/default.html');
                res.sendFile(__dirname + '/public/default.html');
            } else {
                console.log("Sending file :" + __dirname + '/public/entrance.html');
                res.sendFile(__dirname + '/public/entrance.html');
            }

        })

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

        this.app.use(express.static(path.normalize(__dirname + '/public')));

        //var jq = path.dirname(require.resolve('jquery'))
        //this.app.use(express.static(jq));

        var ko = path.dirname(require.resolve('knockout'))
        this.app.use(express.static(ko));

        var kom = path.dirname(require.resolve('knockout-mapping'))
        this.app.use(express.static(kom));

        //var jqm = path.dirname(require.resolve('jquery-mobile'))
        //console.log('jqm directory = ' + jqm)
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

        self.io = io()

        self.io.use(function (socket, next) {
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

        //self.status = new Object();
        //self.status.user = options.user || '';
        //self.status.datetime = new Date();
        //self.status.scale = 1;
        //self.status.direction = 0;
        //self.status.acceleration = 0;
        //self.status.poistion = 0;
        //self.status.devices = [];

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
                var loadProfile = function (id) {
                    //console.info('Creating remote thing: ' + id + ' : ' + prefix)
                    for (var i = 0; i < things.length; i++) {
                        if (things[i].id == id) {
                            //console.info('creating new Thing for ' + things[i].name)
                            things[i].socket = socket
                            things[i].uri = socket.io.uri
                            console.log('socket.io.uri: ' + socket.io.uri)
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
                        console.info('Creating remote host: ' + things[index].name)
                        prefix = things[index].id
                        var newProfile = loadProfile(things[index].id)
                        var newThing = new Thing(newProfile, loadProfile)
                        self.addThing(newThing, false)
                        self.app.use('/' + prefix, self.remoteRequest);
                        self.remoteHosts.push({ 'id': prefix, 'uri': newProfile.uri })
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
        }

        self.alert = function (message) {
            self.io.emit('alert', { 'message': message, 'from': self.name })
        }

        self.io.on('connection', function (socket) {
            console.log("connection from: " + socket.handshake.query.username + ' @ ' + socket.request.connection.remoteAddress);
            //console.log("connection from: " + socket.request.connection.remoteAddress);
            //var address = socket.request.connection.remoteAddress;
            var address = socket.request.connection.remoteAddress.substring(socket.request.connection.remoteAddress.lastIndexOf(':') + 1)
            //console.log("connection from: " + address);
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
                } else { console.log('Didnt find Thing command was for!!!') }
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
            })
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
                console.log("")
                console.log("Client sent " + things.length + " things back")

                var loadProfile = function (id, prefix) {
                    for (var i = 0; i < things.length; i++) {
                        if (things[i].id == id) {
                            things[i].socket = socket
                            //things[i].uri = socket.request.connection.remoteAddress
                            things[i].address = socket.request.connection.remoteAddress
                            things[i].prefix = prefix
                            return things[i]
                        }
                    }
                    console.error('Could not locate thing in returned collection of things')
                    return { params: [], things: [] }
                }

                for (var index in things) {
                    if (!self.getThing(things[index].id)) {
                        console.info('Process client thing : ' + things[index].name)
                        var profile = loadProfile(things[index].id, things[index].id)
                        var newThing = new Thing(profile, loadProfile)
                        console.info(newThing.name + ' (Client) has ' + newThing._appget.length + ' Appgets')
                        self.addThing(newThing, false)
                        self.remoteHosts.push({ 'id': things[index].id, 'address': profile.address })
                        self.app.use('/' + newThing.id, self.remoteRequest);
                        console.log('Adding remote path to application use list ' + newThing.id + ' to list of directoies for ' + newThing.name)
                    }
                }
                console.log("Client things finished processing. ")
                console.log("")
            })

            socket.to(socket.id).emit('message', 'You are connected to' + self.name);
            //console.log("Emmiting init");
            socket.emit('init', self.id);
            socket.emit('things', self.getModel());
            socket.emit('users', self.users);
            //socket.emit('status', self.status);
        })

        self.io.of('/' + this.id).on('connection', this.allocateChannel)
        console.log('Add socket namespace for Host /' + this.id)
        for (var i = 0; i < this.things.length; i++) {
            console.log('Add socket namespace for Thing /' + this.things[i].id)
            //var nspc = self.io.of('/my-namespace');
            self.io.of('/' + this.things[i].id).on('connection', this.things[i].allocateChannel)
        }
        this.heartbeat()
        start()
    }
}

module.exports = Host
module.exports.Thing = Thing
