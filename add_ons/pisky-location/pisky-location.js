var Thing = require('pisky').Thing
var serveStatic = require('serve-static')
var SerialPort = require('serialport')
var GPS = require('gps')
// var apiKey = 'AIzaSyC2sj6ZvpqKmmhjetFPxomfEsWOzCRz_Kg'
class pisky_location extends Thing {
    constructor(options, callback) {
        super(options)

        if (this.name == 'Unnamed') { this.name = 'GPS' }
        if (this.description == undefined) { this.description = 'Global Positioning' }
        if (this.enabled == undefined) { this.enabled = true }
        if (this.getParameter('baud') == undefined) { this.setParameter('baud', 4800) }
        this.html = "pisky-location.html"
        this.img = "images/location.png"

        this.serve = serveStatic(__dirname + '/public').bind(this)

        if (this.getParameter('path') == undefined) {
            console.log('Unable to start GPS module: Please configure the "path" pamameter')
        } else {
            var port = new SerialPort(this.getParameter('path'),  { //'/dev/ttyS0', { // change path 
                baudrate: parseInt(this.getParameter('baud')),
                parser: SerialPort.parsers.readline('\r\n')
            })

            var gps = new GPS

            gps.on('data', (data) => {
                //console.log ('track = ' + gps.state.track )
                for (var prop in gps.state) {
                    this.setState(prop, gps.state[prop])
                }
            })

            port.on('data', function (data) {
                //console.log('DATA: ' + data)
                gps.update(data)
            })

        }
    }
}

module.exports = pisky_location