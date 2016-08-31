var IPCamScanner = function() {

var my = {};

// http://www.techspot.com/guides/287-default-router-ip-addresses/
var default_router_addresses = [
'192.168.0.1', '192.168.1.1', '192.168.2.1', '192.168.3.1', '192.168.4.1', '192.168.10.1', '192.168.11.1', 
'192.168.20.1', '192.168.30.1', '192.168.62.1', '192.168.102.1', 
'192.168.0.30', '192.168.0.50', '192.168.0.227', 
'192.168.1.220', '192.168.1.254', 
'10.0.1.1', '10.0.0.2', '10.0.0.138',
'177.66.99.249',  '192.168.1.15', '192.168.0.254'
];

var default_progress_callback = function(counts, good_urls) { console.log(JSON.stringify(counts) + good_urls); }

my.scan_routers = function(progress_callback) {
  var scanner = new URLScanner();
  if (arguments.length > 0) { scanner.on_progress = progress_callback; }
  var router_urls = [];
  for (var i = 0; i < default_router_addresses.length; i++) router_urls.push('http://' + default_router_addresses[i]);
  scanner.scan(router_urls);
}

my.scan_ipcam = function(router_url, progress_callback) {
  var scanner = new URLScanner();
  if (arguments.length > 1) { scanner.on_progress = progress_callback; }
  scanner.scan(gen_urls(router_url, 80, "/get_status.cgi"));
}

my.scan_ip = function(router_url, progress_callback) {
  var scanner = new URLScanner();
  if (arguments.length > 1) { scanner.on_progress = progress_callback; }
  scanner.scan(gen_urls(router_url, 80));
}

function gen_urls(router_url, port, page) {
  if (arguments.length < 3) { page = ""; }
  var d = router_url.split('.');
  var prefix = router_url.substring(0, router_url.length - d[d.length-1].length);
  var urls = [];
  for (var i = 1; i <= 255; i++) { 
    if (i == d[d.length-1]) continue; //ignore router url
    urls.push(prefix + i + ":"+port+page);
  }
  return urls;
}

return my;
}; // IPCamScanner
