"use strict";
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var contentType = require('content-type');

var piskyParser = function parser(response) {
    var self = this;
    self._type;
    self._buffer = Buffer.alloc(0);
    self._contentType = contentType.parse(response.headers['content-type'].replace('type=application/json', 'type="application/json"'));
    self._boundary = '--' + self._contentType.parameters.boundary;
    self._type = self._contentType.parameters.type;
    //console.log("Pisky Parser: New Instance created " + response.statusCode);

    self.processPart = function (part) {
        if (part.length == 0) {
            return;
        };
        var headers = {};
        if (part.indexOf('\r\n\r\n') >= 0) {
            var rawHeaders = part.slice(0, part.indexOf('\r\n\r\n')).toString().split('\r\n');
            rawHeaders.forEach(function (rawHeader) {
                var nvp = rawHeader.split(":", 2);
                if (nvp.length == 2) {
                    headers[nvp[0].toLowerCase().trim()] = nvp[1].trim();
                }
            });
            part = part.slice(part.indexOf('\r\n\r\n') + 4);
            self.emit('part', { "headers": headers });
        } else {
            if (part.indexOf('\r\n') >= 0) {
                var rawHeaders = part.slice(0, part.indexOf('\r\n'));
                rawHeaders.forEach(function (rawHeader) {
                    var nvp = rawHeader.split(":", 2);
                    if (nvp.length == 2) {
                        headers[nvp[0].toLowerCase().trim()] = nvp[1].trim();
                    }
                });
                part = part.slice(part.indexOf('\r\n') + 2);
                self.emit('part', { "headers": headers });
            }
        };

        if (headers['content-type']) {
            if (headers['content-type'] && headers['content-type'].startsWith('application/octet-stream')) {
                self.emit('partdata', { "headers": headers }, part);
            };
            if (headers['content-type'].startsWith('application/json')) {
                self.emit('partdata', { "headers": headers }, part.toString());
            };
        };
    };

    response.on('error', (err) => {
        self.emit('error', err);
    });

    response.on('end', () => {
        self.emit('end');
    });

    response.on('data', (chunk) => {
        //console.log(chunk);
        if (!self._contentType.type.startsWith('multipart/')) {
            self.emit('data', chunk);
        };

        self._buffer = Buffer.concat([self._buffer, chunk]);
        while (self._buffer.indexOf(self._boundary) >= 0) {
            self.processPart(self._buffer.slice(0, self._buffer.indexOf(self._boundary)));
            self._buffer = self._buffer.slice(self._buffer.indexOf(self._boundary) + self._boundary.length);
        };
    });
    return self;
};

util.inherits(piskyParser, EventEmitter);
module.exports = piskyParser;