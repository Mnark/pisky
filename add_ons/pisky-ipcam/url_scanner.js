var URLScanner = function() {

var my = {};

my.scan = function(urls) { counts.total = urls.length; loop_url(urls, 0); }

my.on_progress = function(counts, good_urls) { console.log(JSON.stringify(counts) + good_urls); }
my.on_finish = function(ips) { console.log(ips + ''); }

var c = {};
c.parallel_max = 5;
c.busy_sleep = 100;
c.timeout = 500;
c.scan_sleep = 100;

var parallel_count = 0;

var counts = {'total':0, 'requested':0, 'scanned':0, 'open':0, 'shut':0};
var good_urls = [];

function notify() { 
  my.on_progress(counts, good_urls); 
  if (counts.total <= counts.scanned) { my.on_finish(good_urls); }
}

var already = {};
function loop_url(urls, index) {
  var url = urls[index];
  if (already[url]) { --counts.total; notify(); } 
  else { already[url] = true; console.log("scanning: "+url); my.probe_url(url, on_url_done); ++counts.requested; notify(); }
  if (++index < urls.length) { setTimeout(function() { loop_url(urls, index); }, c.scan_sleep); }
}

function on_url_done(url, open) {
  ++counts.scanned;
  if (open) { good_urls.push(url); ++counts.open;}
  else { ++counts.shut;}
  notify();
}

my.probe_url = function(url, callback) {
	var script = document.createElement('script');
	var open = function() { callback(url, true); };
	var shut = function() { callback(url, false); };
	script.type = 'text/javascript';
	if (script.addEventListener) {
		script.addEventListener("load", open, false);
		script.addEventListener("error", shut, false);
	} else {
		script.attachEvent("load", open);
		script.attachEvent("error", shut);
	}
	script.src = url;
	var head = document.head || document.getElementsByTagName( "head" )[0] || document.documentElement;
	head.appendChild(script);
}

return my;
}
