"use strict";
var Thing = require('pisky').Thing;
var http = require('http');
var fs = require('fs');

class PiskyRF433 extends Thing {
    constructor(profile, callback) {
        super(profile, callback);
        this.html = "/pisky-rf433.html"
        this.img = "/images/rf433.png"
        this.type = "controller"
        this.name = '433 Mhz Transmitter'
        this.description = '433 Mhz Transmitter/Receiver'
        this.action = 'navigate'
        //this.newThing = new Thing();
        this.config.setParameter("transmitPin", 0)
        this.config.setParameter("recievePin", 2)
        this._appuse.push(__dirname + "/public")

        var self = this

        //this.callBack = function (data) {
        //    switch (data.command) {
        //        case 'Delete':
        //            console.log('RF433 received request to delete device')
        //            this.removeThing(data.id)
        //            break
        //        case 'Add':
        //            console.log('RF433 received request to add device')
        //            break
        //        case 'Update':
        //            console.log('RF433 received request to update device')
        //            break
        //        default:
        //            console.log('RF433 received unknown request:' + JSON.stringify(data))
        //    }
        // }

        var use_rcswitch = false

        if (use_rcswitch) {
            var rcswitch = require('rcswitch');
            rcswitch.enableTransmit(0); // Set WiringPi Pin 0 on OUTPUT (see http://wiringpi.com/pins/ for pin numerotation)
        } else {
            var rpi433 = require('rpi-433')
            var rfSniffer = rpi433.sniffer({
                pin: 2,                     //Snif on GPIO 2 (or Physical PIN 13)
                debounceDelay: 500          //Wait 500ms before reading another code
            })
            var rfEmitter = rpi433.emitter({
                pin: 0,                     //Send through GPIO 0 (or Physical PIN 11)
                pulseLength: 310            //Send the code with a 350 pulse length
            });

            rfSniffer.on('data', function (data) {
                console.log('Code received: ' + JSON.stringify(data));
                //Do whatever the standard action is
            });
        }

        //var rpi433 = require('rpi-433')
        //var rfSniffer = rpi433.sniffer(2, 500) //Snif on PIN 2 with a 500ms debounce delay 
        //var rfSend = rpi433.sendCode;

        //rfSniffer.on('codes', function (code) {
        //    console.log("Detected code: " + code);
        //    for (thing in this.things) {
        //        if (thing.switchcode == code) {
        //            console.log('Doce was for ' + thing.name)
        //        }
        //    }
        //    if (code == 16372675) {
        //        bot.alert('There is someone at the door');
        //    } else {
        //        bot.alert('I just got an RF code');
        //    }
        //});



        var commandHandler = function (data) {
            console.log(this.name + ' received command ' + JSON.stringify(data))
            switch (data.command) {
                case 'Delete':
                    self.removeThing(data.id)
                    break
                case 'TOGGLE':
                    //console.log(this.name + ': Start Power ' + this.getState('Power') + '  Settings: Channel: ' + this.getParameter('channel') + ' Device: ' + this.getParameter('device'))
                    if (this.getState('Power') == 'On') {
                        if (use_rcswitch) {
                            rcswitch.switchOff(parseInt(this.getParameter('channel')), parseInt(this.getParameter('device')));
                        } else {
                            rfEmitter.sendCode(this.getParameter('codeOff'), { pin: 0, pulseLength: this.getParameter('pulseLength')});
                        }
                        this.setState('Power', 'Off')
                    } else {
                        if (use_rcswitch) {
                            rcswitch.switchOn(parseInt(this.getParameter('channel')), parseInt(this.getParameter('device')));
                        } else {
                            rfEmitter.sendCode(this.getParameter('codeOn'), { pin: 0, pulseLength: this.getParameter('pulseLength')});
                        }
                        this.setState('Power', 'On')
                    }
                    //console.log('End Power ' + this.getState('Power') + '  Settings: Channel: ' + this.getParameter('channel') + ' Device: ' + this.getParameter('device'))
                    break
                default:
            }
        }

        this.on('command', (data) => {
            console.log('RF433 received command ' + JSON.stringify(data))
            switch (data.command) {
                case 'Add':
                    //console.log('RF344 received request to add a new device with data:' + JSON.stringify(data.value))
                    var options = { "params": data.value }
                    var device = new Thing(options, this.callback)
                    device.setParameter('action', 'command')
                    device.on('command', commandHandler)
                    this.addThing(device)
                    break
                case 'Update':
                    console.log('RF344 received request to update a device with data:' + JSON.stringify(data.value))
                    for (var prop in data.value) {
                        console.log('Setting ' + data.value[prop].name + ' to ' + data.value[prop].value)
                        this.setParameter(data.value[prop].name, data.value[prop].value)
                    }
                    break
                case 'Listen':
                    console.log('RF344 received request to listen for device')
                    rfSniffer.once('data', function (data) {
                        console.log('Listener Code received once: ' + JSON.stringify(data));
                        self.emit('message', data)
                    });
                    break
                default:
                    console.error('RF344 received an unexpected request' + JSON.data)
            }
        })

        for (var i in this.things) {
            this.things[i].on('command', commandHandler)
            //this.things[i].on('command', function (data) {
            //    console.log(this.name + ' received command ' + JSON.stringify(data))
            //    switch (data.command) {
            //        case 'Delete':
            //            self.removeThing(data.id)
            //            break
            //        case 'TOGGLE':
            //            //console.log(this.name + ': Start Power ' + this.getState('Power') + '  Settings: Channel: ' + this.getParameter('channel') + ' Device: ' + this.getParameter('device'))
            //            if (this.getState('Power') == 'On') {
            //                rcswitch.switchOff(parseInt(this.getParameter('channel')), parseInt(this.getParameter('device')));
            //                this.setState('Power', 'Off')
            //            } else {
            //                rcswitch.switchOn(parseInt(this.getParameter('channel')), parseInt(this.getParameter('device')));
            //                this.setState('Power', 'On')
            //            }
            //console.log('End Power ' + this.getState('Power') + '  Settings: Channel: ' + this.getParameter('channel') + ' Device: ' + this.getParameter('device'))
            //           break
            //       default:
            //   }
            //})
        }


        //var cl = new Thing({params: [ {"name":"name","value":"Corner Light"},{"name":"devicetype","value":"Switch"},{"name":"type","value":"Switch"}, {"name":"img","value":"images/light.png"}, {"name":"description","value":"Corner Light"},{"name":"action","value":'command'}, {"name":"channel",//"value":'1'}, {"name":"device","value":'2'}]});

        //var tl = new Thing({ name: "Tiffany Lamp", devicetype: "Switch", type: "Switch", img: "images/light.png", description: "Tiffany Style Lamp", action: 'command', channel: 1, device: 3, switchcode: 1397079 });
        //tl.config.setParameter("switchcode", 1397079)

        //var t2 = new Thing({ name: "Desk Lamp", devicetype: "Switch", type: "Switch", img: "images/light.png", description: "Desk Lamp", action: 'command', channel: 2, device: 1 });
        //var t4 = new Thing({ name: "Doorbell", devicetype: "Switch", type: "Switch", img: "images/doorbell.png", description: "Doorbell", action: 'command', switchcode: 16372675 });
        //t4.config.setParameter("switchcode", 16372675)

        this.on('send', function (event) {
            console.log("Fatima to action request event:command = " + event.command);
            //    console.log("event" + event.data.id)
            if (event.deviceId) {
                var device = bot.getDevice(event.deviceId);
                if (event.value == 1) {
                    if (device.switchcode) {
                        rcswitch.send(device.switchcode);
                    } else {
                        rcswitch.switchOn(device.channel, device.device);
                    }
                    bot.updateDevice(event.deviceId, 'state', "On");
                } else {
                    rcswitch.switchOff(device.channel, device.device);
                    bot.updateDevice(event.deviceId, 'state', "Off");
                }
            } else {
                var device = bot.getDevice(event.data.id);
                console.log("device:" + device);
                if (device.switchcode) {
                    console.log("sending code:" + device.switchcode);
                    for (var i = 0; i < 8; i++) {
                        //rcswitch.send(device.switchcode);
                        rfSend(device.switchcode);
                    }
                } else {
                    switch (event.command.toUpperCase()) {
                        case "TURNON":
                            if (event.data.family) {
                                console.log("turning ON InterTechno: " + event.data.family + " channel: " + event.data.channel + " device: " + event.data.device);
                                try {
                                    //rcswitch.switchOn(event.data.family, event.data.channel, event.data.device);
                                    rcswitch.switchOn('a', 2, 1);
                                    bot.updateDevice(event.data.id, 'state', "On");
                                } catch (err) {
                                    console.log("Error:" + err.message);
                                }
                            } else {

                                console.log("turning ON channel:" + event.data.channel + " device: " + event.data.device);
                                rcswitch.switchOn(event.data.channel, event.data.device);

                                bot.updateDevice(event.data.id, 'state', "On");
                            }
                            break;
                        case "TURNOFF":
                            if (event.data.family) {
                                console.log("turning OFF InterTechno: " + event.data.family + " channel: " + event.data.channel + " device: " + event.data.device);
                                //                       try {
                                //                       rcswitch.switchOff(event.data.family, event.data.channel, event.data.device);
                                rcswitch.switchOff('a', 2, 1);
                                console.log("Updating InterTechno: " + event.data.id);
                                bot.updateDevice(event.data.id, 'state', "Off");
                                //    } catch (err) {
                                //        console.log("Error:" + err.message);
                                //    }
                            } else {
                                console.log("turning OFF channel:" + event.data.channel + " device: " + event.data.device);
                                rcswitch.switchOff(event.data.channel, event.data.device);
                                bot.updateDevice(event.data.id, 'state', "Off");
                            }
                            console.log("turned OFF channel");
                            break;
                        default:
                            console.log("Unrecognised command received: " + data.command);
                            break;
                    }
                }
            }
        });

        //setTimeout(this.test, 10000, this);
    }

};

module.exports = PiskyRF433;