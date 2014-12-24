var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Bot = function (data) {
    var self = this;
    self.ioc = require('socket.io-client');
    self.os = require("os");
    self.name = self.os.hostname();
    self.description = data.description || 'A piskybot'
    self.bottype = 'piskybot';
    self.url = '';
    self.img = data.img || '';
    self.driver = '';
    self.engine = 'off';
    self.speed = 0;
    self.rpm = 0;
    self.throttle = 0;
    self.targetrpm = 0;
    self.direction = 0;
    self.acc = 0;
    self.gas = 0;
    self.gear = "N";
    self.networks = [];
    self.wanip = "";
    self.lanip = "";
    self.networkInterfaces = self.os.networkInterfaces();
    for (var i in self.networkInterfaces) {
        if (self.lanip == "") {
            if (self.networkInterfaces.hasOwnProperty(i)) {
                var net = self.networkInterfaces[i];
                for (var j = 0; j < net.length; j++) {
                    if (net[j].family == 'IPv4' && net[j].address != '127.0.0.1') {
                        self.lanip = net[j].address;
                        break;
                    }
                }
            }
        }
    }
    self.lanport = parseInt(data.port);
    self.lanurl = "http://" + self.lanip + ":" + self.lanport + "/";
    self.country = "";
    self.city = "";
    
    self.addNetwork = function (name, url, callbackurl) {
        self.networks.push({ name: name, url: url, callbackurl: callbackurl, socket: null });
    };
    
    self.connect = function () {
        console.log(self.name + " attempting to go online: " + self.networks.length + " networks found");
        for (var i = 0; i < self.networks.length; i++) {
            console.log(self.name + " attempting connection to network " + i + ": " + self.networks[i].name + " @ " + self.networks[i].url);
            //self.networks[i].socket = self.ioc.connect(self.networks[i].url);
            var mysocket = self.ioc.connect(self.networks[i].url);
            //console.log("Awaiting response from network " + i + ": " + self.networks[i].name + " @ " + self.networks[i].url);
            mysocket.on('connect', function () {
                // self.networks[i].socket.on('connect', function () {
                console.log(self.name + "Bot: Connected to PiSkyNet");
                // call the server-side function 'adduser' and send one parameter (value of prompt)
                //self.networks[i].socket.emit('addthing', bot);
                mysocket.emit('addthing', bot);
            });
            
            mysocket.on('updatechat', function (username, data) {
                console.log("Got chat from " + username + " :" + data);
                self.emit('updatechat', username, data);
            });
                //self.networks[i].socket = mysocket;
        }
    }
    
    self.onoff = function () {
        if (self.engine == 'On') {
            self.engine = 'Off';
            self.rpm = 0;
            self.gear = "N";
        } else {
            self.engine = 'On'
            self.rpm = 700;
            self.gear = "N";
        }
    }
    
    self.steer = function (direction) {
        self.direction = direction;
    }
    
    self.setThrottle = function (gas) {
        self.throttle = gas.toFixed(2);
        if (self.on) {
            if (gas < 0) {
                self.gear = "R";
                self.targetrpm = Math.abs(gas) * 800;
            } else {
                if (gas > 0) {
                    self.gear = (Math.ceil(gas / 2)).toString();
                    self.targetrpm = (gas % 2 * 4000) + 700;

                } else {
                    self.gear = "N";
                    self.targetrpm = 700;
                }
            }
            self.gas = gas;
        }
    }
    
    var http = require('http');
    //The url we want is: 'www.random.org/integers/?num=1&min=1&max=10&col=1&base=10&format=plain&rnd=new'
    var options = {
        host: 'api.hostip.info',
        path: '/get_html.php'
    };
    
    var callback = function (response) {
        var str = '';
        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function (chunk) {
            str += chunk;
        });
        //the whole response has been recieved, so we just print it out here
        response.on('end', function () {
            console.log(str);
            var hostipInfo = str.split("\n");
            for (i = 0; i < hostipInfo.length; i++) {
                var nvp = hostipInfo[i].split(":");
                switch (nvp[0]) {
                    case "IP":
                        self.wanip = nvp[1];
                        break;
                    case "Country":
                        self.country = nvp[1];
                        break;
                    case "City":
                        self.city = nvp[1];
                        break;
                }
            }
        });
    }
    http.request(options, callback).end();
    
    self.io = require('socket.io').listen(data.listener);
    
    self.io.sockets.on('connection', function (socket) {
        console.log("connection");
        socket.emit('message', 'Online');
        socket.on('send', function (data) {
            self.emit('send', data);
            //self.io.sockets.emit('message', data);
        });
    });
    
    //this.on('newListener', function (listener) {
    //    console.log('Event Listener: ' + listener);
    //});
    
    setInterval(function () {
        if (self.rpm < self.targetrpm) {
            self.rpm = Math.ceil(self.rpm + 197);
        } else {
            self.rpm = Math.ceil(self.targetrpm);
        }
        self.io.sockets.emit('status', self);
        console.log("Emmitted:  status: " + bot);
    }, 1000);
};

util.inherits(Bot, EventEmitter);

module.exports = Bot;
//module.exports = function (data) {
//    return new Bot(data);
//};