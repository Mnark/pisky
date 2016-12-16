var Thing = require('pisky').Thing
var snowboy = require('snowboy')
const record = require('node-record-lpcm16')
var serveStatic = require('serve-static')
var fs = require('fs')
var path = require('path')
var url = require('url')
const stream = require('stream')

class Channel extends stream.PassThrough {
    constructor(id) {
        super({ end: false })
        this._id = id || Math.random()
        this._active = false
        this._soundDetected = false

        this.on('unpipe', (src) => {
            console.error('Channel has stopped piping into the writer.')
            this._active = false
            this._soundDetected = false
            process.nextTick(() => this.emit('stop'))
        })

        this.on('pipe', (src) => {
            this.emit('start')
            this._active = true
            this._soundDetected = false
            console.error('Channel has started piping into the writer.')
        })
    }

    get id() {
        return this._id
    }

    get active() {
        return this._active
    }

    get soundDetected() {
        return this._soundDetected
    }

    set soundDetected(value) {
        if (value) {
            this._soundDetected = true
        } else {
            this._soundDetected = false
        }
    }
}

class Distributor extends stream.PassThrough {
    constructor(options) {
        super(options)
        this.streams = []

        this.removeStream = function (id) {
            for (var i = 0; i < this.streams.length; i++) {
                if (this.streams[i].id == id) {
                    if (this.streams[i].active) {
                        this.unpipe(this.streams[i])
                        break
                    }
                }
            }
        }
    }

    addStream(req, res, addHeader = true) {
        var id = Math.random()
        req.on("close", function () {
            console.log('audio stream request closed')
            this.removeStream(id)
        }.bind(this))
        res.setHeader('Content-Type', 'audio/wav');
        if (addHeader) {
            // Create a 44 byte buffer (will be initialised with zeros)
            var wavHeader = Buffer.alloc(44)

            // Marks the file as a riff file. Characters are each 1 byte long.
            wavHeader.write("RIFF", 0, 4, "ascii")

            // Size of the overall file - 8 bytes, in bytes (32-bit integer). Typically, you'd fill this in after creation.
            wavHeader.writeInt32LE(0, 4)

            // File Type Header. For our purposes, it always equals "WAVE".
            wavHeader.write("WAVE", 9, 4, "ascii")

            //Format chunk marker. Includes trailing null
            wavHeader.write("fmt", 13, 3, "ascii")

            // Length of format data
            wavHeader.writeInt32LE(16, 16)

            // Audio format (floating point (3) or PCM (1)). Any other format indicates compression.
            wavHeader.writeInt16LE(1, 20)

            // Number of Channels - 2 byte integer
            wavHeader.writeInt16LE(1, 22)

            // Sample rate.
            wavHeader.writeInt32LE(16000, 24)

            // Bytes rate.
            wavHeader.writeInt32LE(32000, 28)

            // Block align.
            wavHeader.writeInt16LE(4, 32)

            wavHeader.writeInt16LE(16, 34)
            // Bits per sample.
            wavHeader.write("data", 36, 4, "ascii")

            wavHeader.writeInt32LE(0, 40)
            // Sub-chunk 2.
            // Sub-chunk 2 ID.
            //res.Write(Encoding.ASCII.GetBytes("data"), 0, 4);

            // Sub-chunk 2 size.
            //res.Write(BitConverter.GetBytes((bitDepth / 8) * totalSampleCount), 0, 4);
            console.log("wavHeader: " + wavHeader.toString('hex'))
            res.write(wavHeader)
        }
        this.streams.push({ 'id': id, 'stream': res, 'soundDetected': false })
    }

    createStream(id) {
        var newStream = new Channel(id)
        this.streams.push(newStream)
        return newStream
    }

    activateStream(id) {
        for (var i = 0; i < this.streams.length; i++) {
            if (this.streams[i].id == id) {
                this.pipe(this.streams[i])
                //this.streams[i].active = true
                return
            }
        }
        console.warn('*Snowboy: Request to activate non-existant stream')
    }

    silenceDetected() {
        for (var i = 0; i < this.streams.length; i++) {
            if (this.streams[i].soundDetected) {
                this.removeStream(this.streams[i].id)
            }
        }
    }

    soundDetected() {
        for (var i = 0; i < this.streams.length; i++) {
            if (this.streams[i].active) {
                if (!this.streams[i].soundDetected) {
                    this.streams[i].soundDetected = true
                }
            }
        }
    }

    errorDetected() {
        console.log('*Snowboy: Error detected in audio stream')
    }
}

class pisky_snowboy extends Thing {
    constructor(profile, callback) {
        super(profile, callback)
        this.html = "/pisky-snowboy.html"
        this.img = "/images/snowboy.png"
        this.type = "voice-in"
        //this.name = 'Snowboy'
        this.setParameter('name', 'Snowboy')
        this.description = 'Snowboy hotword detection from Kitt.ai'
        this.action = 'navigate'
        this.serve = serveStatic(__dirname + '/public').bind(this)

        var models = new snowboy.Models()
        var distributor = new Distributor()

        var listeners = []
        var availableHotwords

        var isHotwordAvailable = (hotword) => {
            for (var i in availableHotwords) {
                if (availableHotwords[i].hotword == hotword.toLowerCase().replace(/[\W_]+/g, " ")) {
                    return availableHotwords[i]
                }
            }
            return false
        }

        fs.readdir(__dirname + '/resources', (err, files) => {
            if (err) {
                console.log('Error reading initial files: ' + err)
                return
            }
            availableHotwords = []
            for (var i in files) {
                //console.log('Adding file ' + files[i])
                var fileObj = path.parse(files[i])
                if (fileObj.ext == '.pmdl' || fileObj.ext == '.umdl') {
                    var hotword = fileObj.name.toLowerCase().replace(/[\W_]+/g, " ")
                    if (!isHotwordAvailable(hotword)) {
                        availableHotwords.push({ hotword: hotword, file: __dirname + '/resources/' + files[i] })
                    }
                }
            }
            console.log(availableHotwords.length + ' hotwords available: ')
        })

        this.on('command', function (data) {
            switch (data.command) {
                case 'Update':
                    console.info('Snowboy received request to update configuration data:' + JSON.stringify(data.value))
                    for (var prop in data.value) {
                        this.setParameter(data.value[prop].name, data.value[prop].value)
                    }
                    break
                default:
            }
        })

        this.on('feedback', function (data) {
        })


        this.getAudio = (req, res) => {
            console.log('*Snowboy get audio called')
            distributor.addStream(req, res, true)
        }

        this.refresh = (things) => {
            models = new snowboy.Models()
            for (var i in things) {
                console.log('Snowboy request to add voice name for ' + things[i].name)
                var hotName = isHotwordAvailable(things[i].name)
                if (hotName) {
                    models.add({
                        file: hotName.file,
                        sensitivity: '0.5',
                        hotwords: hotName.hotword,
                        isName: true,
                        isCommand: false,
                        id: things[i].id,
                        triggerEvent: "recognize",
                        thing: things[i]
                    })

                    console.log('Added hotword:  ' + hotName.hotword)

                    if (things[i].name.toLowerCase() == 'alexa') {
                        var targetStream = distributor.createStream(things[i].id)
                        this.emit('command', { id: things[i].id, command: 'addAudioSource', stream: targetStream })
                    }
                }
            }

            var detector = new snowboy.Detector({
                resource: "/home/pi/Pisky/node_modules/snowboy/resources/common.res",
                models: models,
                audioGain: 2.0
            })


            detector.on('silence', function () {
                distributor.silenceDetected()
                //console.log('silence')
            })

            detector.on('sound', function (chunk) {
                //console.log('sound detected')
                distributor.soundDetected()
            })

            detector.on('error', function (err) {
                distributor.errorDetected()
                console.log('error' + err)
            })

            detector.on('hotword', function (index, hotword) {
                console.log('hotword', index, hotword)
                for (var i in models.models) {
                    if (models.models[i].hotwords == hotword) {
                        distributor.activateStream(models.models[i].thing.id)
                        //models.models[i].thing.emit('command', { id: models.models[i].thing.id, command: 'Recognize', stream: this.id })
                    }
                }
            }.bind(this))

            const mic = record.start({
                threshold: 0,
                verbose: false
            })

            mic.pipe(distributor).pipe(detector)

        }

        this._appget.push({ path: '/audio.wav', callback: this.getAudio })
        setTimeout(() => {
            //console.info('Snowboy will initialise in 10 seconds')
            this.emit('refresh')
        }, 10000)

    }

    //refresh(things) {
    //    console.log('Snowboy was requested to configure recognition for ' + things.length + ' things.')
    //}

}

module.exports = pisky_snowboy