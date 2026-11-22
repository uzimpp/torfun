# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 2 |
| Low | 0 |
| Informational | 8 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 2    |
| Info | Informational | http://localhost:3000 | Percentage of responses with status code 2xx | 98 % |
| Info | Informational | http://localhost:3000 | Percentage of responses with status code 4xx | 1 % |
| Info | Informational | http://localhost:3000 | Percentage of endpoints with content type application/javascript | 18 % |
| Info | Informational | http://localhost:3000 | Percentage of endpoints with content type font/woff2 | 3 % |
| Info | Informational | http://localhost:3000 | Percentage of endpoints with content type text/css | 1 % |
| Info | Informational | http://localhost:3000 | Percentage of endpoints with content type text/html | 76 % |
| Info | Informational | http://localhost:3000 | Percentage of endpoints with method GET | 100 % |
| Info | Informational | http://localhost:3000 | Count of total endpoints | 131    |
| Info | Informational | http://localhost:3000 | Percentage of slow responses | 53 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| CSP: script-src unsafe-inline | Medium | 4 |
| CSP: style-src unsafe-inline | Medium | 5 |
| Base64 Disclosure | Informational | 11 |
| Non-Storable Content | Informational | Systemic |
| Sec-Fetch-Dest Header is Missing | Informational | 3 |
| Sec-Fetch-Mode Header is Missing | Informational | 3 |
| Sec-Fetch-Site Header is Missing | Informational | 3 |
| Sec-Fetch-User Header is Missing | Informational | 3 |
| Storable and Cacheable Content | Informational | 4 |
| User Controllable HTML Element Attribute (Potential XSS) | Informational | 9 |




## Alert Detail



### [ CSP: script-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: http://localhost:3000
  * Node Name: `http://localhost:3000`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `script-src includes unsafe-inline.`
* URL: http://localhost:3000/robots.txt
  * Node Name: `http://localhost:3000/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `script-src includes unsafe-inline.`


Instances: 4

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ CSP: style-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: http://localhost:3000
  * Node Name: `http://localhost:3000`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://localhost:3000/robots.txt
  * Node Name: `http://localhost:3000/robots.txt`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: http://localhost:3000/sitemap.xml
  * Node Name: `http://localhost:3000/sitemap.xml`
  * Method: `GET`
  * Parameter: `Content-Security-Policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; frame-src 'self' blob:; connect-src 'self' http://localhost:8080; object-src blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`


Instances: 5

### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Base64 Disclosure ](https://www.zaproxy.org/docs/alerts/10094/)



##### Informational (Medium)

### Description

Base64 encoded data was disclosed by the application/web server. Note: in the interests of performance not all base64 strings in the response were analyzed individually, the entire response should be looked at by the analyst/security team/developer(s).

* URL: http://localhost:3000
  * Node Name: `http://localhost:3000`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/_next/static/chunks/2a4u8ra9y656h.css
  * Node Name: `http://localhost:3000/_next/static/chunks/2a4u8ra9y656h.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `anuphan_709921b2-module__6UD8HG__className`
  * Other Info: `j{�����O}�V��j�W����q���Z��Z�`
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/register
  * Node Name: `http://localhost:3000/register`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/robots.txt
  * Node Name: `http://localhost:3000/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/search
  * Node Name: `http://localhost:3000/search`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/search%3Findustry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app
  * Node Name: `http://localhost:3000/search (industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/search%3Fq
  * Node Name: `http://localhost:3000/search (q)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`
* URL: http://localhost:3000/sitemap.xml
  * Node Name: `http://localhost:3000/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `ibm_plex_mono_17dc8d48-module__FK8goa__variable`
  * Other Info: `����W��j'��{u��Ϧ�ۥ{��+�(k��j��nW`


Instances: 11

### Solution

Manually confirm that the Base64 data does not leak sensitive information, and that the data cannot be aggregated/used to exploit other vulnerabilities.

### Reference


* [ https://projects.webappsec.org/w/page/13246936/Information%20Leakage ](https://projects.webappsec.org/w/page/13246936/Information%20Leakage)


#### CWE Id: [ 319 ](https://cwe.mitre.org/data/definitions/319.html)


#### WASC Id: 13

#### Source ID: 3

### [ Non-Storable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are not storable by caching components such as proxy servers. If the response does not contain sensitive, personal or user-specific information, it may benefit from being stored and cached, to improve performance.

* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: http://localhost:3000/register
  * Node Name: `http://localhost:3000/register`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: http://localhost:3000/robots.txt
  * Node Name: `http://localhost:3000/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: http://localhost:3000/sitemap.xml
  * Node Name: `http://localhost:3000/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``

Instances: Systemic


### Solution

The content may be marked as storable by ensuring that the following conditions are satisfied:
The request method must be understood by the cache and defined as being cacheable ("GET", "HEAD", and "POST" are currently defined as cacheable)
The response status code must be understood by the cache (one of the 1XX, 2XX, 3XX, 4XX, or 5XX response classes are generally understood)
The "no-store" cache directive must not appear in the request or response header fields
For caching by "shared" caches such as "proxy" caches, the "private" response directive must not appear in the response
For caching by "shared" caches such as "proxy" caches, the "Authorization" header field must not appear in the request, unless the response explicitly allows it (using one of the "must-revalidate", "public", or "s-maxage" Cache-Control response directives)
In addition to the conditions above, at least one of the following conditions must also be satisfied by the response:
It must contain an "Expires" header field
It must contain a "max-age" response directive
For "shared" caches such as "proxy" caches, it must contain a "s-maxage" response directive
It must contain a "Cache Control Extension" that allows it to be cached
It must have a status code that is defined as cacheable by default (200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501).

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ Sec-Fetch-Dest Header is Missing ](https://www.zaproxy.org/docs/alerts/90005/)



##### Informational (High)

### Description

Specifies how and where the data would be used. For instance, if the value is audio, then the requested resource must be audio data and not any other type of resource.

* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Dest`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Dest`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/sitemap.xml
  * Node Name: `http://localhost:3000/sitemap.xml`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Dest`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 3

### Solution

Ensure that Sec-Fetch-Dest header is included in request headers.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Dest ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Dest)


#### CWE Id: [ 352 ](https://cwe.mitre.org/data/definitions/352.html)


#### WASC Id: 9

#### Source ID: 3

### [ Sec-Fetch-Mode Header is Missing ](https://www.zaproxy.org/docs/alerts/90005/)



##### Informational (High)

### Description

Allows to differentiate between requests for navigating between HTML pages and requests for loading resources like images, audio etc.

* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Mode`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Mode`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/sitemap.xml
  * Node Name: `http://localhost:3000/sitemap.xml`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Mode`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 3

### Solution

Ensure that Sec-Fetch-Mode header is included in request headers.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Mode ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Mode)


#### CWE Id: [ 352 ](https://cwe.mitre.org/data/definitions/352.html)


#### WASC Id: 9

#### Source ID: 3

### [ Sec-Fetch-Site Header is Missing ](https://www.zaproxy.org/docs/alerts/90005/)



##### Informational (High)

### Description

Specifies the relationship between request initiator's origin and target's origin.

* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Site`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Site`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/sitemap.xml
  * Node Name: `http://localhost:3000/sitemap.xml`
  * Method: `GET`
  * Parameter: `Sec-Fetch-Site`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 3

### Solution

Ensure that Sec-Fetch-Site header is included in request headers.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site)


#### CWE Id: [ 352 ](https://cwe.mitre.org/data/definitions/352.html)


#### WASC Id: 9

#### Source ID: 3

### [ Sec-Fetch-User Header is Missing ](https://www.zaproxy.org/docs/alerts/90005/)



##### Informational (High)

### Description

Specifies if a navigation request was initiated by a user.

* URL: http://localhost:3000/
  * Node Name: `http://localhost:3000/`
  * Method: `GET`
  * Parameter: `Sec-Fetch-User`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/login
  * Node Name: `http://localhost:3000/login`
  * Method: `GET`
  * Parameter: `Sec-Fetch-User`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: http://localhost:3000/sitemap.xml
  * Node Name: `http://localhost:3000/sitemap.xml`
  * Method: `GET`
  * Parameter: `Sec-Fetch-User`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 3

### Solution

Ensure that Sec-Fetch-User header is included in user initiated requests.

### Reference


* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-User ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-User)


#### CWE Id: [ 352 ](https://cwe.mitre.org/data/definitions/352.html)


#### WASC Id: 9

#### Source ID: 3

### [ Storable and Cacheable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are storable by caching components such as proxy servers, and may be retrieved directly from the cache, rather than from the origin server by the caching servers, in response to similar requests from other users. If the response data is sensitive, personal or user-specific, this may result in sensitive information being leaked. In some cases, this may even result in a user gaining complete control of the session of another user, depending on the configuration of the caching components in use in their environment. This is primarily an issue where "shared" caching servers such as "proxy" caches are configured on the local network. This configuration is typically found in corporate or educational environments, for instance.

* URL: http://localhost:3000/_next/static/chunks/2a4u8ra9y656h.css
  * Node Name: `http://localhost:3000/_next/static/chunks/2a4u8ra9y656h.css`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: http://localhost:3000/_next/static/media/48a9130fde140ce9-s.p.2chmmw5jncpj5.woff2
  * Node Name: `http://localhost:3000/_next/static/media/48a9130fde140ce9-s.p.2chmmw5jncpj5.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: http://localhost:3000/_next/static/media/99e609270109b47d-s.p.30xqm3yldpj47.woff2
  * Node Name: `http://localhost:3000/_next/static/media/99e609270109b47d-s.p.30xqm3yldpj47.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: http://localhost:3000/_next/static/media/effe91970fc4db64-s.p.27korwsf9c79u.woff2
  * Node Name: `http://localhost:3000/_next/static/media/effe91970fc4db64-s.p.27korwsf9c79u.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``


Instances: 4

### Solution

Validate that the response does not contain sensitive, personal or user-specific information. If it does, consider the use of the following HTTP response headers, to limit, or prevent the content being stored and retrieved from the cache by another user:
Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0
This configuration directs both HTTP 1.0 and HTTP 1.1 compliant caching servers to not store the response, and to not retrieve the response (without validation) from the cache, in response to a similar request.

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ User Controllable HTML Element Attribute (Potential XSS) ](https://www.zaproxy.org/docs/alerts/10031/)



##### Informational (Low)

### Description

This check looks at user-supplied input in query string parameters and POST data to identify where certain HTML attribute values might be controlled. This provides hot-spot detection for XSS (cross-site scripting) that will require further review by a security analyst to determine exploitability.

* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `deadlineFrom`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [max] attribute

The user input found was:
deadlineFrom=2026-11-16

The user-controlled value was:
2026-11-16`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `deadlineTo`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [max] attribute

The user input found was:
deadlineTo=2026-11-16

The user-controlled value was:
2026-11-16`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `deptName`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
deptName=ZAP

The user-controlled value was:
zap`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `industry`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
industry=ZAP

The user-controlled value was:
zap`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `outcome`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
outcome=tor_analysed

The user-controlled value was:
tor_analysed`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `publishedFrom`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [max] attribute

The user input found was:
publishedFrom=2026-11-16

The user-controlled value was:
2026-11-16`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `publishedTo`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [max] attribute

The user input found was:
publishedTo=2026-11-16

The user-controlled value was:
2026-11-16`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `status`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
status=drafting

The user-controlled value was:
drafting`
* URL: http://localhost:3000/search%3FdeadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack
  * Node Name: `http://localhost:3000/search (deadlineFrom,deadlineTo,deptName,industry,maxBudget,minBudget,minDaysLeft,outcome,publishedFrom,publishedTo,status,targetPlatforms,techStack)`
  * Method: `GET`
  * Parameter: `targetPlatforms`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

http://localhost:3000/search?deadlineFrom=2026-11-16&deadlineTo=2026-11-16&deptName=ZAP&industry=ZAP&maxBudget=0&minBudget=0&minDaysLeft=0&outcome=tor_analysed&publishedFrom=2026-11-16&publishedTo=2026-11-16&status=drafting&targetPlatforms=web_app&techStack

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
targetPlatforms=web_app

The user-controlled value was:
web_app`


Instances: 9

### Solution

Validate all input and sanitize output it before writing to any HTML attributes.

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)


#### CWE Id: [ 20 ](https://cwe.mitre.org/data/definitions/20.html)


#### WASC Id: 20

#### Source ID: 3


