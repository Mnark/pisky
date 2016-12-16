class Thing extends EventEmitter {
    constructor(data, callback) {
        super()
        this.id = data.id
        this.initialised = false
        this.callback = callback
        this.channelSocket = { "connected": false }

        this.viewModel = ko.mapping.fromJS(data)

        this.viewModel.add = function (form) {
            var str = $(form).serializeArray()
            this.callback(this.id(), 'Add', str)
            return false
        }

        this.viewModel.update = (form) => {
            if (this.channelSocket.connected) {
                this.channelSocket.emit('command', { id: this.id, command: 'Update', data: $(form).serializeArray() })
            }
            return false
        }

        this.viewModel.command = (name, data) => {
            console.log("command " + name + " found with data: " + ko.toJSON(data));
            if (this.channelSocket.connected) {
                if (typeof data == "object") {
                   //this.channelSocket.emit('command', { id: this.id, command: name.name, data: $(data).serializeArray() })
                    this.channelSocket.emit('command', { id: this.id, command: name, data: ko.toJS(data)})
                } else {
                    this.channelSocket.emit('command', { id: this.id, command: name, data: data })

                }
            }
            //this.callback(this.id(), name, data);
            return false

        }
    }
}

var Client = function Client(data, socket) {
    var self = this;
    self.things = []
    self.users = ko.observableArray(data ? data.users : null);
    self.viewModel = ko.mapping.fromJS({ "things": [] })

    self.viewModel.view = function (thing) {
        if (thing.action() == 'command') {
            this.command('TOGGLE')
        } else {
            var t = self.getThing(thing.id())
            if ($("#guestPage")) {
                if (t.channelSocket.connected) {
                    $("#guestPage").load(thing.html(), function () {
                        ko.cleanNode(document.getElementById("guestPage"))
                        ko.applyBindings(t.viewModel, document.getElementById("guestPage"))
                        $("#guestPage").dialog({ width: "80%", height: "100%" })
                        $.mobile.changePage("#guestPage")
                    });
                } else {
                    t.channelSocket = io.connect("/" + thing.id())
                    t.channelSocket.on('init', function (config, state) {
                        //alert('channel initialising ' + config)
                        ko.mapping.fromJSON(config, t.viewModel)
                        ko.mapping.fromJS({ "state": state }, t.viewModel)
                        t.initialised = true
                        $("#guestPage").load(thing.html(), function () {
                            ko.cleanNode(document.getElementById("guestPage"))
                            ko.applyBindings(t.viewModel, document.getElementById("guestPage"))
                            $("#guestPage").dialog({ width: "80%", height: "100%" })
                            $.mobile.changePage("#guestPage")
                        })
                    })

                    t.channelSocket.on('pulse', function (state) {
                        ko.mapping.fromJS({ "state": state }, t.viewModel)
                    })

                }
            } else {
                console.log("Guest Page not supported");
            }
        }
    }

    self.getThing = function (id) {
        for (var i = 0; i < self.things.length; i++) {
            if (self.things[i].id == id) {
                return self.things[i]
            }
        }
        return false
    }


    self.connect = function (data) {
        if ($("#logIn")) {
            $("#logIn").submit(function (event) {
                var canvas = document.getElementById('canvas');
                var context = canvas.getContext('2d');
                var data = {};
                data.user = event.target['un'].value;
                data.pass = event.target['pw'].value;
                data.image = canvas.toDataURL('image/png');
                $.ajax({
                    type: 'POST',
                    data: JSON.stringify(data),
                    contentType: 'application/json',
                    url: '/login',
                    success: function (data) {
                        console.log('success');
                        self.socket = io.connect(self.url, { query: { username: event.target['un'].value, password: event.target['pw'].value, image: 'imagecode' } });
                        self.socket.on('init', function (id) {
                            self.id = id;
                            self.things = []
                        });

                        self.socket.on('message', function (message) {
                            alert('Got a message:' + message)
                        })

                        self.socket.on('updatechat', function (username, data) {
                            $('#conversation').append('<b>' + username + ':</b> ' + data + '<br>');
                        });


                        self.socket.on('updateusers', function (users, current_user) {
                            self.users.removeAll();
                            $.each(users, function (key, user) {
                                self.users.push(user);
                            });
                        });

                        self.socket.on('addthing', function (thing) {
                            //                            thing.config.socket = thing.socket;
                            //                            var a = new Thing(thing.config);
                            //                            self.things.push(a);
                            if (self.things.indexOf(function (id) { return thing.id == id; }) > -1) {
                            } else {
                                var newThing = new Thing(thing, function (id, command, data) {
                                    self.socket.emit('command', { id: id, command: command, value: data });
                                });
                                self.things.push(newThing);
                            }

                        });

                        self.socket.on('removething', function (id) {
                            for (var i = 0; i < self.things().length; i++) {
                                if (self.things()[i].id == id) {
                                    self.things.splice(i, 1);
                                }
                            }
                        });

                        self.socket.on('things', function (things) {
                            ko.mapping.fromJS({ "things": things }, self.viewModel)

                            for (var i = 0; i < things.length; i++) {
                                if (self.things.indexOf(function (id) { return things[i].id == id; }) > -1) {
                                } else {
                                    var newThing = new Thing(things[i], function (id, command, data) {
                                        if (command == 'getThing') {
                                            //self.socket.join(id)

                                            return self.getThing(data)
                                        } else {
                                            self.socket.emit('command', { socketId: self.socket.id, id: id, command: command, value: data });
                                        }
                                    });
                                    self.things.push(newThing);
                                }
                            }
                            //$("indexPage").refresh()
                            $("things").trigger("refresh")
                        });

                        self.socket.on('config', function (config) {
                            bot.config(config);
                        });

                        self.socket.on('updatechat', function (username, data) {
                            $('#conversation').append('<b>' + username + ':</b> ' + data + '<br>');
                        });

                        console.log(JSON.stringify(data));
                        //$("#logIn").dialog('close');
                        $.mobile.changePage("#");
                    }
                });
                event.preventDefault();
            });

            try {
                var tracker = new tracking.ObjectTracker('face');
                tracker.setInitialScale(4);
                tracker.setSbaudtepSize(2);
                tracker.setEdgesDensity(0.1);

                tracking.track('#video', tracker, { camera: true, aspectRatio: 1 });
                tracker.on('track', function (event) {
                    if (event.data.length === 0) {
                        // No objects were detected in this frame.
                    } else {
                        var xmult = video.videoWidth / video.width;
                        var ymult = video.videoWidth / video.width;
                        event.data.forEach(function (rect) {
                            //canvas.width = rect.width * xmult;
                            //canvas.height = rect.height * ymult;
                            canvas.width = 120;
                            canvas.height = 120;
                            var context = canvas.getContext('2d');
                            //                        context.drawImage(video, rect.x * xmult, rect.y * ymult, rect.width * xmult, rect.height * ymult, 0, 0, rect.width * xmult, rect.height * ymult);
                            context.drawImage(video, rect.x * xmult, rect.y * ymult, rect.width * xmult, rect.height * ymult, 0, 0, canvas.width, canvas.height);
                        });
                    };
                });
            } catch (e) {
                console.log('Cannot access browser camera')
            }
            $("#logIn").dialog({ width: 500 });
            $.mobile.changePage("#logIn");
        } else {
            var username = "username=" + prompt("What's your name for Pisky?");
            var img = "img=images/user-black.png";
            self.socket = io.connect(self.url, { query: username });
        }

    };

    self.addDevice = function (data) {
        var a = new Device(data, function (id, controllerId, command, data) {
            //self.socket.broadcast.to(self.id).emit('send', { id: id, controllerId: controllerId, command: command, data: data });
            self.socket.emit('send', { botId: self.id, controllerId: controllerId, deviceId: id, command: command, value: value });
        });
        self.devices.push(a);
        return a;
    };

    self.getDevice = function (id) {
        for (var i = 0; i < self.controllers().length; i++) {
            for (var j = 0; j < self.controllers()[i].devices().length; j++) {
                if (self.controllers()[i].devices()[j].id == id || self.controllers()[i].devices()[j].name == id) {
                    return self.controllers()[i].devices()[j];
                }
            }
        }
        var a = new Boolean();
        a.value = function () { return false; };
        return a;
    };

    self.pulse = function () {
        var distance = self.geo.velocity * self.heartbeat / 100;
        self.geo.latlon = self.geo.latlon.destinationPoint(distance, self.geo.heading);
        self.geo.latitude = self.geo.latlon.lat;
        self.geo.longtitude = self.geo.latlon.lon;
        self.emit('pulse', Date.now());
    };

    if (typeof (self.heartbeat) == "number") {
        setInterval(self.pulse, 100);
    };

    if (data.connect) {
        self.url = data.url ? data.url : '';
        self.connect();
    } else {
        self.socket = socket;
    }

};

Client.prototype = new EventEmitter();

window.onload = function () {
    client = new Client({ connect: true })

    ko.applyBindings(client.viewModel);

    self.recognition.startRecognition();
};