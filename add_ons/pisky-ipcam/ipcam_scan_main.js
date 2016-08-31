var IPCamScanController = function() {

var my = {};

var scanned_routers = {};
var checked_ips = {};
var is_success = false;

var reset = function() {
  console.log('reset');
  scanned_routers = {};
  checked_ips = {};
  is_success = false;
  $('#status').html('');
  $('#reasons').hide();
};

my.scan = function() {
  reset();
  $('.main').css('padding-top', '50px');
  var progressbar_el = $('<div id="progressbar" ></div>').appendTo('#status');
  var message_el = $('<div id="message" ></div>').appendTo('#status');
  progressbar_el.progressbar({ value: false });
  message_el.attr('class', 'info');
  message_el.html('scanning routers, this may take 1 or 2 minutes, please be patient ...'); 
  a = new IPCamScanner(); 

  a.scan_routers( function(router_counts, router_urls) {
  
    //console.log(JSON.stringify(router_counts));
    
    if (router_counts.scanned == 0) { $('#progressbar').progressbar({ value: router_counts.requested * 100 / router_counts.total }); }
    else { $('#progressbar').progressbar({ value: router_counts.scanned * 100 / router_counts.total }); }
    
    if (router_urls.length > 0) {
      for (var i = 0; i < router_urls.length; i++) my.scan_with_router_url(router_urls[i], 'Detected');
    }
    
    if (router_counts.scanned >= router_counts.total) { // finished
      if (router_urls.length == 0) {
        message_el.attr('class', 'error');
        //message_el.html("can not find local router. <a href='http://goo.gl/bKQtP'>report your router's ip address here</a> so we can help you in the next version"); 
        message_el.html("can not find local router, please input your router's ip or your computer's ip (like 192.168.0.1) and click start.");
        message_el.append("don't know your computer's ip? google 'find computer ip address' or check <a href='http://compnetworking.about.com/cs/windowsnetworkin1/ht/findaddrwinxp.htm'>this link</a>, you should find the string correspond to IPv4 Address");
        message_el.append("<br/><input id='user_ip' width=200 type='text'/>");
        message_el.append("<a onclick='controller.scan_with_user_ip()' class='button green'>Start</a>");
        progressbar_el.hide();
        return;
      } else { 
        message_el.attr('class', 'success');
        message_el.html("router scanning finished. found routers " + router_urls.join(' ')); 
        progressbar_el.hide();
      }
    }
  });
};

function isIP(str) {
 var ary = str.split(".");
 var ip = true;
 for (var i in ary) { ip = (!ary[i].match(/^\d{1,3}$/) || (Number(ary[i]) > 255)) ? false : ip; }
 ip = (ary.length != 4) ? false : ip;
 return ip;
}

my.scan_with_user_ip = function () { 
  var ip_str = $('#user_ip').val();
  if (ip_str.length == 0) { alert("please input an ip address before start!"); return; }
  if (!isIP(ip_str)) { alert("please input a valid ip address something like 192.168.0.123!"); return; }
  var router_url = 'http://' + ip_str;
  my.scan_with_router_url(router_url, 'User');
};

my.scan_with_router_url = function(router_url, type) {
  if (scanned_routers[router_url]) return;
  scanned_routers[router_url] = true;
  
  var progressbar_el = $('<div id="progressbar" class="progressbar" ></div>').appendTo('#status');
  var message_el = $('<div id="message" class="info"></div>').appendTo('#status');
  message_el.html("found local router " + router_url + '<br/> start scanning ip device' + '<br/>sending requests ...'); 
  
  console.log('scan with router url: ' + router_url);
  var a = new IPCamScanner(); 
  
  a.scan_ip(router_url, function(counts, good_urls) {
  
    console.log(JSON.stringify(counts));
    if (counts.scanned > 10) { progressbar_el.progressbar({ value: counts.scanned * 100 / counts.total }); }
    else { progressbar_el.progressbar({ value: counts.requested * 100 / counts.total }); } 
    
    if (good_urls.length > 0) {
      message_el.attr('class', 'info');
      message_el.html('found ' + good_urls.length + ' ip camera candidates');
      for (var i = 0; i < good_urls.length; i++) {
        var url = good_urls[i]; //good_urls[i].substring(0, good_urls[i].length-'/get_status.cgi'.length);
        message_el.append('<br/><a href="' + url + '" target="_blank">' + url + '</a>');         
        my.check_ipcam_with_ip(good_urls[i]);
      }
    }
    
    if (counts.scanned >= counts.total) {
      progressbar_el.hide();
      if (good_urls.length == 0) { 
        message_el.attr('class', 'error');
        message_el.html("can not find any ip camera candidates in network of " + router_url + '. please check the following list.'); 
        $('#reasons').show();
        return; 
      } else if (!is_success) {
        var ns_message_el = $('<div id="message" class="info"></div>').appendTo('#status');
        ns_message_el.html("not sure whether there are ip cameras in network of " + router_url + ' or not. you can first '
         + 'check the above urls, if all of them are not your ip camera, please check the following list.'); 
        $('#reasons').show();
        return;
      }
    }
  });
}

my.check_ipcam_with_ip = function (url) {
  if (checked_ips[url]) return;
  checked_ips[url] = true;
  var ipcam_message_el = $('<div id="message" class="info"></div>').appendTo('#status');
  ipcam_message_el.html("found local device " + url + ' with port 80 open, <br/> start checking whether its an ip camera or not' + '<br/>sending requests ...'); 
  var scanner = new URLScanner();
  scanner.probe_url(url + '/get_status.cgi', function(cam_url, success) {
    if (success) {
      ipcam_message_el.attr('class', 'success');
      ipcam_message_el.html("I am 99% sure this is an ip camera: " + '<a href="' + url + '" target="_blank">' + url + '</a>');
      //ipcam_message_el.append("<br/>Found ip camera? Could you please do me a favor? +1 and rate this webapp <a href='https://chrome.google.com/webstore/detail/find-my-ip-camera/jehadinicggeoihhnoblmelidahkeolh/reviews' target='_blank'>here</a>");
      is_success = true;
    } else {
      ipcam_message_el.remove();
    }
  });
}

return my;

};

var controller = new IPCamScanController();

$(function() {

$('#reasons').hide();

$('#goscan').click(function(event) { controller.scan(); });


});