var Thing = function Thing(data, callback) {
    self = this;
    self.initialised = false;
    self.callback = callback;
    self.devices = ko.observableArray();
    for (var property in data) {
        console.log('adding thing property:' + property + ' value: ' + data[property] + 'type: ' + typeof data[property] + ' isArray: ' + Array.isArray(data[property]));
        if (Array.isArray(data[property])) {
            self[property] = ko.observableArray();
            for (var subprop in data[property]) {
                console.log('populating timer: ' + subprop + ': ' + data[property][subprop])
                var a = ko.observable(data[property][subprop])
                self[property].push(a);
            }
        } else {
            self[property] = ko.observable(data[property]);
        }
    }

    //    self.id = data.id;
    //    self.socket = data.socket;
    //    self.name = ko.observable(data ? data.name : '');
    //    self.image = data ? data.image : '';
    //    self.img = data ? data.img : '';
    //    self.visible = (data.visible || true);
    //    self.html = data.html;
    //    self.controllers = ko.observableArray();
    //    self.states = ko.observableArray(data.states || []);
    //    self.commands = [];
}
Thing.prototype = new EventEmitter();

Thing.prototype.add = function(form){
    var str = $(form).serializeArray()
    this.callback(this.id(), 'Add', str);
        return false;
};

Thing.prototype.update = function(form){
    var str = $(form).serializeArray()
    this.callback(this.id(), 'Update', str);
    return false;
};

Thing.prototype.view = function (thing) {
    //console.log('view called on thing with ' + thing.action() + ' action' )
    if (thing.action() == 'command') {
        this.command('TOGGLE'); 
    } else {
        // action == 'navigate''
        if ($("#guestPage")) {
            if (!thing.initialised){
                for (var i=0;i < thing.things().length;i++){
                    var t = thing.callback(thing.id(), 'getThing',thing.things()[i]().id )
                   thing.things()[i](t) 
                }
                thing.initialised = true;
            }
            $("#guestPage").load(thing.html(), function () {
                ko.cleanNode(document.getElementById("guestPage"));
                var t = bot.getThing(thing.id())
                ko.applyBindings(t, document.getElementById("guestPage"));
                $("#guestPage").dialog({ width: "100%", height: "100%" });
                $.mobile.changePage("#guestPage");
            });
        } else {
            console.log("Guest Page not supported");
        }
    }
};

Thing.prototype.command = function (name, data) {
    console.log("command " + name + " found with data: " + JSON.stringify(data));
    this.callback(this.id(), name, data);
    return false;
    //        for (var index = 0; index < self.commands.length; index++) {
    //        }
};


Thing.prototype.setState = function (name, value) {
    console.log('setting state')
    for (state in this.states()) {
        console.log('state' + JSON.stringify(state));
        if (state.name == name) {
            state.value(value);
            return;
        }
    }
    //    for (var i = 0 ; i < this.states().length; i++){
    //        if (this.states()[i]().name == name){
    //            console.log('found setting')
    //            this.states()[i](value);
    //            return;
    //        }
    //    }
    this.states.push({ name: name, value: value });
    return;
}

var Bot = function Bot(data, socket) {
    var self = this;
    //self.id = data.id;
    //self.name = ko.observable(data ? data.name : '');
    //self.img = data ? data.img : '';

    //if (typeof (data.heartbeat) == "number") {
    //    self.heartbeat = data.heartbeat;
    //};

    //self.geo = new Object();
    //self.geo.longitude = -3.0092;
    //self.geo.latitude = 51.5884;
    //self.geo.heading = 61.78;
    //self.geo.pitch = -0.76;
    //self.geo.velocity = 0;
    //self.geo.latlon = new LatLon(self.geo.latitude, self.geo.longitude);

    //self.devices = ko.observableArray();
    //self.controllers = ko.observableArray();
    //    self.viewModel = ko.mapping.fromJS(data);
    //    self.devices = ko.observableArray(data ? data.devices : '');

    //self.lanip = data ? data.lanip : '';
    //self.lanport = data ? data.lanport : '';
    //self.driver = ko.observable(data ? data.driver : '');


    self.things = ko.observableArray();

    self.getThing = function (id) {
        for (var i = 0; i < self.things().length; i++) {
            if (self.things()[i].id() == id) {
                return self.things()[i];
            }
        }
        return false;
    };
    self.users = ko.observableArray(data ? data.users : null);

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
                            self.things.removeAll();
                        });

                        // listener, whenever the server emits 'controllers', this updates the local devices on the page
                        //self.socket.on('controllers', function (controllers) {
                        //    for (var i = 0; i < controllers.length; i++) {
                        //        if (self.controllers.indexOf(function (id) { return item.id == id; }) > -1) {

                        //        } else {
                        //            var newController = new Controller(controllers[i], function (id, controllerId, command, value) {
                        //                self.socket.emit('send', { botId: self.id, controllerId: controllerId, deviceId: id, command: command, value: value });
                        //            });
                        //            self.controllers.push(newController);
                        //        }
                        //    };

                        //$('ul').each(function (index, list) {
                        //    try {
                        //        $('#devs').listview('refresh');
                        //    } catch (err) {
                        //        $('#devs').trigger('create');
                        //    }

                        //});

                        self.socket.on('status', function (status) {
                            if (status.botId == self.id) {
                                for (var i = 0; i < self.controllers().length; i++) {
                                    if (self.controllers()[i].id == status.controllerId) {
                                        for (var j = 0; j < self.controllers()[i].devices().length; j++) {
                                            if (self.controllers()[i].devices()[j].id == status.deviceId) {
                                                self.controllers()[i].devices()[j].value(status.value);
                                            }
                                        }
                                    }
                                }
                            } else {
                                console.log('Status event received: ' + JSON.stringify(status));
                                var thing = self.getThing(status.id);
                                console.log('Its a status for Thing: ' + JSON.stringify(thing));
                                if (thing) {
                                    for (state of status.states) {
                                        console.log('setting state: ' + JSON.stringify(state));
                                        thing.setState(state.name, state.value);
                                    }
                                }
                            }

                            for (var i = 0; i < self.things().length; i++) {
                                for (var k = 0; k < self.things()[i].devices().length; k++) {
                                    if (status.id == self.things()[i].devices()[k].id) {
                                        self.things()[i].devices()[k].state(status.state);
                                    }
                                }

                            }
                        });

                        self.socket.on('message', function (message) {
                            alert('Got a message:' + message)
                        })

                        self.socket.on('updatechat', function (username, data) {
                            $('#conversation').append('<b>' + username + ':</b> ' + data + '<br>');
                        });

                        self.socket.on('updaterooms', function (rooms, current_room) {
                            //$('#bots').empty();
                            //$.each(rooms, function (key, thing) {
                            //    $('#bots').append('<li><a href="' + thing.url + '" data-ajax="false"><img class="ui-li-thumb" width="150px" src="' + thing.img + '" /><h2 class="vox">' + thing.name + '</h2><p><strong>' + thing.description + '</strong></p><br /><p class="ui-li-aside">' + thing.bottype + '</p></a></li>');
                            //});
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
                            for (var i = 0; i < things.length; i++) {
                                if (self.things.indexOf(function (id) { return things[i].id == id; }) > -1) {
                                } else {
                                    var newThing = new Thing(things[i], function (id, command, data) {
                                        if( command == 'getThing'){
                                            return self.getThing(data)
                                        }else{
                                            self.socket.emit('command', { socketId: self.socket.id, id: id, command: command, value: data });
                                        }
                                    });
                                    self.things.push(newThing);

                                }
                            }
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



            var tracker = new tracking.ObjectTracker('face');
            tracker.setInitialScale(4);
            tracker.setStepSize(2);
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
            $("#logIn").dialog();
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

Bot.prototype = new EventEmitter();
