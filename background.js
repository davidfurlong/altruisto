 /**
 * When installing the extension - add alarms that runs every 7 days to clear closedWebsites list and everyday to clear list of websites disabled because user visited them through already affiliated link
 */
chrome.runtime.onInstalled.addListener(function(details){
    chrome.alarms.create('clearClosedWebsites', {periodInMinutes: 10080});
    chrome.alarms.create('clearDisabledWebsites', {periodInMinutes: 1440});
    chrome.alarms.create('updatePartnersList', {periodInMinutes: 1440});

    updatePartnersList();

    if(details.reason == "install"){
        chrome.tabs.create({url: "https://altruisto.com/welcome.html"});
    }
});

chrome.alarms.onAlarm.addListener(function(details){
    switch(details.name){
        case 'clearClosedWebsites' :
            chrome.storage.local.remove(['closedWebsites']);
        break;
        
        case 'clearDisabledWebsites' :
            chrome.storage.local.remove(['disabledWebsites']);
        break;

        case 'updatePartnersList' :
            updatePartnersList();
        break;
    }
});

 /**
 * When a message from content.js is received to deactivate monetizing given affiliate's - delete cookies and affiliate's domain from activatedAffiliates list. 
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse){
    if(sender.tab){
    	chrome.cookies.getAll({domain: request.domain}, function(cookies) {
    		var cookieProtocol;

    		for(var i=0; i<cookies.length;i++) {
    			(cookies[i].secure) ? cookieProtocol = 'https://' : cookieProtocol = 'http://';
    			
    			//delete cookies from given domain to stop monetizing this site
        		chrome.cookies.remove({url: cookieProtocol + request.domain + cookies[i].path, name: cookies[i].name});

        		//delete domain from activated domains list
        		chrome.storage.local.get({activatedAffiliates: []}, function(items) {
        			for(i = 0; i < items.activatedAffiliates.length; i++){
        				if(items.activatedAffiliates[i].domain == request.domain){
        					updatedActivatedAffiliates = items.activatedAffiliates;
							updatedActivatedAffiliates.splice(i, 1);
							chrome.storage.local.set({'activatedAffiliates': updatedActivatedAffiliates});
							break;
        				}
        			}
        		});
    		}
		});

    	sendResponse({status: true});
    }
  });

 /**
 * When user requests an altruisto.com redirect - add redirect URL's domain to activatedAffiliates list.
 */ 
chrome.webRequest.onBeforeRequest.addListener(function(details){ //byc moze onCompleteRedirect - zalezy ktorym latwiej znalezc od pierwszego do ostatniego redirecta
	var redirectUrlParts = details.url.split("?url="),
	    redirectDomain   = extractDomain(redirectUrlParts[1]);

	var data = {domain: redirectDomain, timestamp: details.timeStamp}
	updateActivatedAffiliates(data);
}, {urls: ["https://altruisto.com/redirect*"], types: ["main_frame"]}); 

/**
* When user requests one of the CJ.com redirect domains and it's not altruisto's redirect add the domain to disabledWebsites list 
*/
var doSync = true;
var doTrack = false; 

chrome.webRequest.onBeforeRedirect.addListener(function(details){
    var urlDomain       = extractDomain(details.url);
    var redirectDomain  = extractDomain(details.redirectUrl);

    if(isAffiliateRedirectLink(urlDomain) || isAffiliateRedirectLink(redirectDomain)){
        doTrack = true;
        if(isAltruistoLink(details.url) || isAltruistoLink(details.redirectUrl)){
            doSync = false;
        }
    }
}, {urls: ['<all_urls>'], types: ['main_frame']});

chrome.webRequest.onCompleted.addListener(function(details){
    if(doSync && doTrack){
        disableAffiliate(extractDomain(details.url));
        doSync = true;
        doTrack = false;
    } 
    else if(!doSync && doTrack){
        doSync = true;
        doTrack = false;
    }
}, {urls: ['<all_urls>'], types: ['main_frame']});







function disableAffiliate(domain) {
    var updatedDisabledWebsites = [];
    chrome.storage.local.get({disabledWebsites: []}, function(items) {
        updatedDisabledWebsites = items.disabledWebsites;
        updatedDisabledWebsites.push(domain);
        chrome.storage.local.set({'disabledWebsites': updatedDisabledWebsites});
    });
}

/**
* Check if given URL is altruisto's affiliate link by comparing it against our stamps
*
* @returns {boolean}
*/
function isAltruistoLink(url){
    var altruistoStamps = ['id=XK9XruzkyUo', '8106588'];
    if(new RegExp(altruistoStamps.join("|")).test(url)) {
        return true;
    }
    else {
        return false;
    }
}

/**
* Check if given URL is affiliate redirect link by compating it against list of domains of affiliate networks
*
* @returns {boolean}
*/
function isAffiliateRedirectLink(domain){
    var trackedDomains = ['anrdoezrs.net', 'commission-junction.com', 'dpbolvw.net', 'apmebf.com', 'jdoqocy.com', 'kqzyfj.com', 'qksrv.net', 'tkqlhce.com', 'ww.qksz.net', 
    'emjcd.com', 'afcyhf.com', 'awltovhc.com', 'ftjcfx.com', 'lduhtrp.net', 'tqlkg.com', 'awxibrm.com', 'cualbr.com', 'rnsfpw.net', 'vofzpwh.com', 'yceml.net'];
    
    if(trackedDomains.indexOf(domain) == -1) {
        return false;
    }
    else {
        return true;
    }
}


 /**
 * Extract the domain from given url. Subdomains will be striped down to main domain.
 *
 * @param {string} url The url from which the function will extract the main domain.
 * @returns {string} Main domain ("example.com").
 */
function extractDomain(url) {
    url = url.toString();
    var domain;

    //find & remove protocol 
    if (url.indexOf("://") > -1) {
        domain = url.split('/')[2];
    }
    else {
        domain = url.split('/')[0];
    }

    //find & remove port number
    domain = domain.split(':')[0];

    //remove www.
    domain = domain.replace(/^www\./, "");
    

    //find & remove subdomains
    var parts = domain.split('.');
    if(parts.length > 2){
    	domain = parts.slice(-2).join('.');
    }

    return domain;
}

 /**
 * Save an affiliate's domain to the locally stored list of websites that the user has activated AKA started raising money from them 
 *
 * @param {object} data New data to be pushed into the list containing domain and current timestamp.
 */
function updateActivatedAffiliates(data) {
	var newData, i, domainAlreadySaved;

	//test if the given object is not empty
	if (Object.keys(data).length === 0 && data.constructor === Object) {
        return;
    }

    chrome.storage.local.get('activatedAffiliates', function(items) {
        if(items.activatedAffiliates != null){
        	
        	newData = items.activatedAffiliates;

        	for(i = 0; i < newData.length; i++){
        		if(newData[i].domain == data.domain){ //if the domain exist update timestamp
        			newData[i].timestamp = data.timestamp;
        			domainAlreadySaved = true;
        			break;
        		}
        	}

        	if(!domainAlreadySaved){
        		newData.push(data);
        	}
        }
        else { //there was no data
        	newData = new Array(data);
        }

        chrome.storage.local.set({'activatedAffiliates': newData}, function (){
        	chrome.storage.local.get('activatedAffiliates');
        });
    });
}

function updatePartnersList(){
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "https://altruisto.com/api/partners");
    xhr.onreadystatechange = function() {
        if(xhr.readyState == 4){
            if(xhr.responseText){
                var partners = JSON.parse(xhr.responseText);
                chrome.storage.local.remove(['partners']);
                chrome.storage.local.set({'partners': partners});
            }
        }
    }
    xhr.send();
}