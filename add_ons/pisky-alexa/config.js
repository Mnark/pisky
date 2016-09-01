/**
 * @module
 * This module defines the settings that need to be configured for a new
 * environment.
 * The clientId and clientSecret are provided when you create
 * a new security profile in Login with Amazon.  
 * 
 * You will also need to specify
 * the redirect url under allowed settings as the return url that LWA
 * will call back to with the authorization code.  The authresponse endpoint
 * is setup in app.js, and should not be changed.  
 * 
 * lwaRedirectHost and lwaApiHost are setup for login with Amazon, and you should
 * not need to modify those elements.
 */

var config = {
    clientId: 'amzn1.application-oa2-client.ddc342ac60c4443c82e17f5271f70188',
    clientSecret: 'ef6264fca1555d2d292a91158124d385519ae71e75e92e09212a095e75942419',
    redirectUrl: 'https://localhost/authresponse',
    lwaRedirectHost: 'amazon.com',
    lwaApiHost: 'api.amazon.com',
    validateCertChain: true,
    sslKey: '/home/pi/Desktop/alexa-avs-raspberry-pi-master/samples/javaclient/certs/server/node.key',
    sslCert: '/home/pi/Desktop/alexa-avs-raspberry-pi-master/samples/javaclient/certs/server/node.crt',
    sslCaCert: '/home/pi/Desktop/alexa-avs-raspberry-pi-master/samples/javaclient/certs/ca/ca.crt',
    products: {
        "Pisky_Alexa": ["123456","123457"], // Fill in with valid device values, eg: "testdevice1": ["DSN1234", "DSN5678"]
    },
};

module.exports = config;