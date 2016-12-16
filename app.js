var Host = require('pisky')

var host = new Host();

//host.addNetwork('PiSkyNet', 'http://piskynet.azurewebsites.net/');

console.log(host.name + ": Listening on: " + host.lanurl + ' and https port: ' + host.httpsPort);
