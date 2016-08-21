var Host = require('./pisky.js');

var host = new Host({
    name: "This Pisky",
    description: "Pisky Host",
    img : 'images/home.png'
});

//host.addNetwork('PiSkyNet', 'http://piskynet.azurewebsites.net/');

console.log(host.name + ": Listening on: " + host.lanurl + ' and https port: ' + host.httpsPort);

module.exports = host.serve