(function ($) {
    var self = this;
    self.recognition = new webkitSpeechRecognition() || new Object();
    self.recognition.commands = ko.observableArray();
    self.recognition.pageCommands = ko.observableArray();
    self.recognition.continuous = true;
    self.recognition.interimResults = true;
    self.recognition.question = ko.observable();
    self.recognition.answerOptions = ko.observableArray();
    
    $(document).on("pagecontainershow", function (event, ui) {//        "pagecontainerbeforetransition" ||
        console.log('Queen Bee: Loading Voice Commands')
        self.recognition.pageCommands.removeAll();
        
        $.each($.mobile.pageContainer.pagecontainer("getActivePage").find('.vox'), function (index, value) {
            var target = $(value).closest('a');
            self.recognition.pageCommands.push({ voiceText: value.innerText, obj: value, action: target.click, id: value.id });
            console.log('Queen Bee: Added "' + value.innerText + '" to the page commands list')
        });
    });
    
    $(document).on("panelopen", function (event, ui) {//        "pagecontainerbeforetransition" ||
        console.log('Queen Bee: Loading Panel Voice Commands')
        $.each($(event.target).find('.vox'), function (index, value) {
            var target = $(value).closest('a');
            //self.recognition.commands.push({ voiceText: value.innerText, action: "$('#settings_panel').panel('close' , null );" });
            self.recognition.commands.push({ voiceText: value.innerText, action: target.click });
            console.log('Queen Bee: Added "' + value.innerText + '" to the panel commands list')
        });
    });
    
    self.recognition.onresult = function (event) {
        console.log('Queen Bee: OnResult triggered');
        //console.log('Checking question responses...');
        for (var i = event.resultIndex; i < event.results.length; ++i) {
            console.log('Queen Bee: result :' + i + ' = ' + event.results[i][0].transcript.trim());
            //console.log('recognition = ' + recognition);
            if (self.recognition.question()) {
                if (!self.recognition.question().answered) {
                    //console.log('Checking unanswered question responses...');
                    for (var j = 0; j < self.recognition.question().answerOptions().length; j++) {
                        if (event.results[i][0].transcript.trim() == self.recognition.question().answerOptions()[j].voiceText.toLowerCase()) {
                            //self.recognition.question().answered = true;
                            eval(self.recognition.question().answerOptions()[j].action);
                            //recognition.question().onAnswer(recognition.question().answerOptions()[j]);
                            //event.results.length = 0;
                            return false;
                        }
                    }
                }
            }
            
            //Check for Page commands
            for (var j = 0; j < self.recognition.pageCommands().length; j++) {
                console.log('Queen Bee: Speech heard "' + event.results[i][0].transcript.trim() + '" : compared to "' + recognition.pageCommands()[j].voiceText.toLowerCase() + '"');
                if (event.results[i][0].transcript.trim() == self.recognition.pageCommands()[j].voiceText.toLowerCase()) {
                    console.log("Queen Bee: Page Match found: triggering action: " + recognition.pageCommands()[j].voiceText.toLowerCase());
                    $(self.recognition.pageCommands()[j].obj).click();
                    return false;
                }
            }
            
            //Check for Application commands
            for (var j = 0; j < self.recognition.commands().length; j++) {
                //console.log('... checking if you said ' + recognition.commands()[j].voiceText.toLowerCase());
                if (event.results[i][0].transcript.trim() == self.recognition.commands()[j].voiceText.toLowerCase()) {
                    console.log('Click!');
                    //eval(self.recognition.commands()[j].action);
                    $(self.recognition.pageCommands()[j].obj).click();
                    //event.results.length = 0;
                    return false;
                }
            }
        }
        return this;
    };
    
    self.recognition.setQuestion = function (question) {
        self.recognition.question(question);
        //            recognition.answerOptions(question.answerOptions());
        return this;
    };
    
    self.recognition.startRecognition = function (question) {
        //textArea.focus();
        if (question) {
            self.recognition.setQuestion(question);
        }
        
        try {
            self.recognition.start();
        } catch (e) {
            console.log('Error on start: ' + e.message);
        }
        return this;
    };
    
    self.navigator.getUserMedia = (navigator.getUserMedia ||
                   navigator.webkitGetUserMedia ||
                   navigator.mozGetUserMedia ||
                   navigator.msGetUserMedia);
    
    //self.getUserMedia = self.navigator.getUserMedia(
    //    {
    //        video: true,
    //        audio: false
    //    },


    //    // successCallback
    //    function (localMediaStream) {
    //        var video = $('video');
    //        $.each($('video'), function (index, value) {
    //            value.src = window.URL.createObjectURL(localMediaStream);
    //        });
    //    },


    //    // errorCallback
    //    function (err) {
    //        console.log("The following error occured: " + err);
    //    }
    //);
    
    self.navigator.snapshot = function (action) {
        //    //if (localMediaStream) {
        var canvas = document.querySelector('canvas');
        canvas.width = 320;
        canvas.height = 240;
        var ctx = canvas.getContext('2d');
        var video = document.querySelector('video');
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, 320, 240);
        return canvas.toDataURL('image/png');
        //var parameters = { ItemId: "fc478ba4-4364-e411-be96-801b71caa4a7", ImageData: canvas.toDataURL('image/png') };
        //$.ajax({
        //    type: 'POST',
        //    cache: false,
        //    url: action == 'barcode' ? "/api/Property/PostBarcode" : "/api/Property/PostImage/",
        //    data: JSON.stringify(parameters),
        //    contentType: 'application/json; charset=utf-8',
        //    dataType: 'json',
        //    success: function (item) {
        //        //alert(action + ': Success : id = ' + itemImage.id + ': itemId = ' + itemImage.itemId);
        //        var app = window.quizMasterApp.propertyViewModel;
        //        var newItem = app.createItem(item);
        //        app.items.push(newItem);
        //        app.selectItem(newItem);
        //        //for (var i = 0; i < app.items().length; i++) {
        //        //    if (app.items()[i].id == item.id) {
        //        //        app.selectItem(app.items()[i]);
        //        //    }
        //        //}
        //        window.location.href = "#itemPage";
        //    }
        //});
        return true;
    };

}(jQuery));