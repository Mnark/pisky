window.onload = function () {
    bot = new Bot({ name: 'Lydia', connect: true });
    var messages = [];
    
    bot.on('controllers', function (data) {
        bot.controllers.removeAll();
        for (var i = 0; i < data.length; i++) {
            bot.CreateController(data[i]);
        }
        $("input[type='checkbox']").each(function (index) {
            try {
                $(this).checkboxradio("refresh");
            } catch (err) {
                $(this).checkboxradio();
            }
        });
        $(".ui-slider-input").each(function (index) {
            try {
                $(this).slider("refresh");
            } catch (err) {
                $(this).slider();
            }
        });
    });
    
    bot.on('message', function (data) {
    });

    bot.on('alert', function (directive) {
        alert(JSON.stringify(directive));
    });
    
    bot.on('status', function (status) {
    });
    
    bot.on('updatechat', function (username, data) {
    });
    
    ko.applyBindings(bot);
    
    self.recognition.startRecognition();
    
    bot.on('pulse', function (current_time) {
//        refreshScreen(current_time);
    });
    
    if (window.DeviceOrientationEvent) {
        //document.getElementById("orientation").innerHTML = "DeviceOrientation";
        window.addEventListener('deviceorientation', function (eventData) {
            if (eventData.gamma == null) {
//                document.getElementById("orientation").innerHTML = "No orientation data";
            } else {
                //var dev = bot.getDevice("Steering");
                //if (eventData.beta > -45 && eventData.beta < 45) {
                //    dev.setValue(eventData.beta / 45);
                //}
                //document.getElementById("orientation").innerHTML = "Orientation:<br />Alpha: " + Math.round(eventData.alpha) + "<br />Beta:  " + Math.round(eventData.beta) + "<br />Gamma: " + Math.round(eventData.gamma);
            };
        }, false);
    }
    
    function refreshScreen() {
    };


};
