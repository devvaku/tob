// require('win-ca')
var rootCas = require('ssl-root-cas').create();

rootCas.inject().addFile('U:/oth/newExp/w1.cer')
  .addFile('U:/oth/newExp/test.crt');


const https = require("https")
// https.globalAgent.options.ca = rootCas;
const http = require("http")
const crypto = require("crypto")
const EventEmitter = require("events")
var DomParser = require('dom-parser');

const NewSessionForEachTab = false
const DefaultHeaders = {
  "Connection": "keep-alive",
  "Cache-Control": "max-age=0",
  "Accept-Language":"en-US,en;q=0.9",
  // "Accept-Encoding": "gzip, deflate, br",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "User-Agent": "Mvb/0.1b Node.js:http (Windows NT 10.0; Win64; x64)"
  // "hello": ["world","ok"]
}
const http_d = {
  "http:": http,
  "https:": https
}

class Connection extends EventEmitter {
  constructor(url, method, data, headers, id, currentPage, prevCon = null) {
    super()
    this.id = id || crypto.randomUUID()
    this.req = {
      url, method, data, headers, currentPage, prevCon
    }
    this.status = {code: null, msg: null}
    this.res = null
    this.data = ""
    this.con = null
    this.request()
  }
  header = {
    set: (headerObj) => {
      for ( let key in headerObj ) {
        let val = headerObj[key]
        if ( typeof(val) == "object" ) {
          for ( let dval of val ) {
            this.con.setHeader(key, dval)
          }
        } else {
          this.con.setHeader(key, val)
        }
      }
    }
  }
  async request() {
    let {method, data, url: {origin, hostname, href, host, pathname, search, port, protocol}, headers} = this.req
    // console.log("REQUESTING...", this.req)
    if ( data && data.length > 0 ) {
      headers["Content-Length"] = data.length
    }
    headers = Object.assign({},DefaultHeaders,headers)
    let query = pathname + search
    // console.log("Sending...",href, method, headers, data)
    try {
      this.con = http_d[protocol].request(href, {
        method, headers}, (res) => {
        this.status = {code: res.statusCode, msg: res.statusMessage}
        this.res = res
        this.emit("response")
        let data = ""
        res.on("data", (chunk) => {
          data += chunk
        })

        res.on("end", _ => {
          this.data = data
          this.emit("data")
          // resolve({res,data})
          // this.cookieHandler.handle(res).then(_ => {resolve({res,data})})
        })
      })
      this.con.on("error",_ => {
        console.log("Hello Error")
        this.con.end()
        this.emit("data")
      })
      // set headers
      // this.header.set(headers)
      // console.log(this.req)
      this.con.write(data || "")
    } catch(err) {
      this.emit("data")
      // resolve("")
    }
  }
}

class Cookie {
  // expire = new Date("01-01-1970"), maxAge = 0, httpOnly = false, secure = flase, sameSite = ""
  constructor(name, value, domain, meta, path = "/") {
    this.name = name
    this.value = encodeURIComponent(value)
    this.domain = domain
    this.path = path
    this.expire = meta["Expires"]
    this.maxAge = meta["Max-Age"]
    this.size = (name.length + this.value.length)
    this.httpOnly = meta["HttpOnly"]
    this.secure = meta["Secure"]
    this.sameSite = meta["SameSite"]
  }
}

class Cookies {
  constructor(sessionName) {
    this.sessionName = sessionName
    this.cookies = {}
  }
  parseCookieHeader(cookie) {
    let myCookie = {}
    // get cookie data
    let fes = cookie.indexOf("; ")
    let d = cookie.slice(0, fes)
    let fe = d.indexOf("=")
    let name = d.slice(0,fe)
    let value = d.slice(fe+1)
    
    let c = cookie.slice(fes+2).split("; ") // +2 for extra leading whitespace
    for (let d of c) {
      let fe = d.indexOf("=")
      if ( fe != -1 ) {
        let key = d.slice(0,fe)
        let val = d.slice(fe+1)
        myCookie[key.toLowerCase()] = val
      } else {
        myCookie[d.toLowerCase()] = true
      }
    }
    // console.log(myCookie)
    return {name, value, path: myCookie["path"], dom: myCookie["domain"], meta: myCookie}
  }
  async handleRes(url, res) {
    if ( !res ) return
    let headers = res.headers
    if ( !headers ) return
    let domain = url.host
    
      if ( !this.cookies[domain] ) { this.cookies[domain] = {} }
      // console.log(headers)
      let cookies = headers["set-cookie"]
      // console.log(cookies)
      if ( !cookies ) {
        return true
      }
      for ( let cook of cookies ) {
        let {name, value, path, dom, meta} = this.parseCookieHeader(cook)
        let d = domain
        if ( dom ) {
          d = dom
          if ( !this.cookies[d] ) { this.cookies[d] = {} }
        }
        let cookie = new Cookie(name, value, d, meta, path)
        if ( !this.cookies[d][path] ) this.cookies[d][path] = {}
        this.cookies[d][path][name] = cookie
      }
    
    return true
  }
  getCookie(url) {
    // console.log("All Cookies", JSON.stringify(this.cookies))
    let myCookies = ""
    let {host, pathname, protocol} = url
    let secure = protocol == "https:"
    let domains = Object.keys(this.cookies)
    // console.log(domains, host)
    let dm = domains.filter(el => host.indexOf(el) != -1)
    // console.log(dm)
    for ( let host of dm ) {
      let paths = Object.keys(this.cookies[host])
      let pas = paths.filter(path => pathname.indexOf(path) != 1)
      
      for ( let pa of pas ) {
        let coo_keys = Object.keys(this.cookies[host][pa])
        for ( let key of coo_keys ) {
          let cookie = this.cookies[host][pa][key]
          if ( cookie["secure"] && !secure ) { continue; }
          myCookies += `${key}=${decodeURIComponent(cookie["value"])}; `
        }
      }
    }
    myCookies = myCookies.slice(0,-2)
    // console.log("-----",myCookies)
    return myCookies
  }
}

// =---- Tabs Management ----=

// =- Tab -=

class Tab extends EventEmitter {
  constructor(url, tabId, cookieHandler, session) {
    super()
    this.tabId = tabId
    this.session = session
    this.cookieHandler = cookieHandler
    if ( NewSessionForEachTab ) {
      this.cookieHandler = new Cookies(this.tabId)
    }
    this.page = {
      url: null,
      data: "",
      status: "",
      con: null,
      res: null,
      loaded: false
    }
    this.userData = {}
    this.cons = {} // connections

    // if url is valid
    try {
      this.tabUrl = new URL(url)
      this.page.url = url
      this.#setTabUrl(this.tabUrl)
    } catch(err) {
      // console.log("Errrrrr")
      this.tabUrl = new URL("about:balnk")
      this.#setTabUrl(this.tabUrl, true)
    }
  }
  #setTabUrl(url, blank) {
    if ( blank ) { 
      this.page.loaded = true
      this.emit("load")
      return
    }
    this.request(url,{type:"page"})
  }

  updatePage({con, res, data, url}) {
    this.page.data = data
    this.page.status = con.status
    this.page.con = con
    this.page.res = res
    this.page.url = url
    this.page.loaded = true
    this.emit("load")
  }

  async parseResponse(con, type, recNum) {
    if ( recNum > 30 ) {
      return con
    }
    if ( con.status.code == 302 ) {
      let newUrl = con.res.headers["location"]
      if ( !newUrl ) return con
      // making newUrl if newUrl is relative
      if ( newUrl.slice(0,4) != 'http' ) {
        newUrl = con.req.url.origin + newUrl
      }
      console.log("Redirecting...", con.req.url.href, "to", newUrl, " ", recNum)
      return (await this.request(newUrl,{type,prevCon:con,recNum:recNum+1})).con
      
    }
    return con
  }
  
  // =- Request a URL -=
  /* =-
    This method will make a HTTP request that will
    create a new Connection object
  -= */
  request(url, {method = "GET", data = "", headers = {}, type = "page", prevCon = null, recNum = 0}) {
    return new Promise((resolve, reject) => {
      
      if ( typeof(url) == "string" ) {
        url = new URL(url)
      }
      // set stab status to not loaded if type == page
      if ( type == "page" ) {
        this.page.loaded = false
      }

      // create connection ID
      let conId = crypto.randomUUID()
      // get cookie form current session : cookieHandler
      let cookieHeader = this.cookieHandler.getCookie(url)
      // console.log("Cookies:", cookieHeader)
      headers["Cookie"] = cookieHeader

      let con = new Connection(url, method, data, headers, conId, this.page, prevCon)
      this.cons[conId] = con
      // console.log("After coon...", con)
      
      // after connection is completed
      con.on("data", _ => {
        this.cookieHandler.handleRes(url, con.res)
        .then(async _ => {
          if ( type != "xhr" ) {
            this.updatePage({con:con, res:con.res, data: con.data, url})
          }
          let nextCon = await this.parseResponse(con, type, recNum)
          this.emit("data", nextCon)
          resolve({con:nextCon, res:nextCon.res, data: nextCon.data, status:nextCon.status})
          
        })
      })

    })
  }
  
}

// =- Tabs -=
/* =-
  Class will manage the tabs for a session
  Methods Includes
  - new Tab
    -- Custom cookie manager configration to be implemented
  
-= */
class Tabs {
  constructor(sessionName, cookie, session) {
    this.sessionName = sessionName
    this.cookie = cookie
    this.session = session
    this.tabs = {}
  }
  // =- Create new instance of Tab -=
  /* =-
    Params:
      # url to open in tab
      url : URL
      # if cookieManager provided it is used
      # or else default session's cookie manager
      # is used
      cookieManager : Cookies 
  -= */
  newTab(url, tabId, cookieManager = undefined) {
    return new Promise((resolve, reject) => {
      tabId = tabId || crypto.randomUUID()
      let tab = new Tab(url, tabId, cookieManager || this.cookie, this.session)
      
      this.tabs[tabId] = tab
      // console.log(tab)
      if ( tab.page.loaded ) {
        resolve(tab)
        return
      }
      tab.once("load", _ => {
        // console.log("Tab Loaded")
        resolve(tab)
      })

    })
  }
}


// =---- Mini Virtual Browser ----=

class Mvb {
  constructor(sessionName) {
    this.sessionName = sessionName
    this.cookie = new Cookies(sessionName)
    this.tabs = new Tabs(sessionName, this.cookie, this)
    this.userData = {}
  }

  // =-- New Tab --=
  async newTab(url, tabId) {
    return await this.tabs.newTab(url, tabId)
  }
}


// =---- Manage Mini Virtual Browser ----=

class MvbManager {
  constructor(name) {
    this.name = name
    this.sessions = {}
    // groups may contains multiple tabId from different sessions
    this.groups = {}
  }
  newSession(sessionName) {
    if ( this.sessions[sessionName] ) return false
    let session = new Mvb(sessionName)
    this.sessions[sessionName] = session
    return session
  }
  newGroup(groupName) {
    this.groups[groupName] = {}
  }
}

class linkRunner extends EventEmitter {
  /*
    runArray: [
      {"url","method","data","type","cbs"}
    ]
  */
  constructor(runList, tab, run = false) {
    super()
    // console.log("RunList", runList)
    this.runList = runList
    this.tab = tab
    this.cons = []
    this.stat = {i:0, curLink:null, links:{}}
    if ( run ) this.run()
  }
  async run() {
    this.emit("start")
    let i = 0
    while ( i != this.runList.length ) {
      let linkData  = this.runList[i]
      // console.log("******On Step", i, linkData)
      
      this.stat.i += 1

      let {linkId, cbs} = linkData
      let id = (linkId.id || linkId)+"_"+this.stat.i
      this.stat.links[id] = {status:"before b", linkId}
      
      let bRs = {intr: false}
      let aRs = {intr: false}
      
      this.emit("before",linkData)
      if ( cbs.b ) bRs = await cbs.b(linkData.data, this.cons, this.tab, this.stat.i, linkData) || bRs
      this.stat.links[id]["bRes"] = bRs
      
      if ( bRs.intr ) {
        // do something if cont:continue is false
        // mostry used for data alteration
        // request(url, method = "GET", data = "", headers = {}, type="page", prevCon = null, recNum = 0) {
        if (bRs["override"]) {
          if ( bRs["override"].data ) {
            bRs["override"].data = {data: bRs["override"].data, uData: linkData.data.uData || {}}
          }
          // linkData.url = url || bRs["override"].url
          // linkData.method = method || bRs["override"].method
          // linkData.data = data || bRs["override"].data
          // linkData.headers = data || bRs["override"].headers
          linkData = {...linkData,...bRs["override"]}
          console.log("Data overridden", bRs["override"])
        }
        if ( bRs.skip ) {
          console.log("Skipped...",linkId)
          this.stat.links[id]["status"] = "skipped"
          i += 1
          continue
        }
        // MAJOR ISSUE of INF RECURRSION
        // if ( bRs.addSetps ) {
        //   // new steps added continuing
        //   console.log("New Steps addedd before step:", i)
        //   this.runList.splice(i, 0, ...bRs.steps)
        //   continue
        // }
        
      }

      let {url,method,data,type,headers} = linkData
      
      this.stat.links[id]["status"] = "after b"
      this.stat.curLink = {...linkData}
      
      console.log("Resuesting", url, method)
      let con = await this.tab.request(url,{method, data:data.data, headers, type})
      console.log("Resuest success...", url, con.status)
      
      this.stat.links[id]["status"] = "before a"
      this.cons[this.stat.i] = con
      this.stat.links[id]["con"] = this.cons[this.stat.i]
      this.stat.curLink["con"] = this.cons[this.stat.i]
      
      this.emit("after",linkData)
      if ( cbs.a ) aRs = cbs.a(con, data, this.cons, this.tab, this.stat.i) || aRs
      this.stat.links[id]["aRes"] = aRs
      if ( aRs.intr ) {
        // do something
        // can be features like adding/skipping steps
        // console.log("Haha aRS Intrupr...", aRs, i, this.runList, aRs.steps)
        if ( aRs.addSteps ) {
          this.runList.splice(i+1, 0, ...aRs.steps)
          // console.log("Added step", i+1, this.runList)
        }
      }
      
      this.stat.links[id]["status"] = "completed"

      // increment i
      i += 1
    }
    this.emit("end", {stat:this.stat, curLink: this.stat.curLink, tab: this.tab})
  }
  
}

class MvbHelper {
  constructor(mvb) {
    this.mvb = mvb
    this.links = {}
    this.parser = new DomParser()
  }
  
  addLink(linkId, url, cbs, headers={}, method = "GET", data = "", type = "page", pLink = null) {
    if ( pLink ) {
      let links = this.getLinkIdData(pLink)
      // get the object for parent to link
      if ( !links["links"] ) links["links"] = {}
      links["links"][linkId] = {url, cbs, method, data, type, headers}
      // console.log("Links", links[pLink].links[linkId], pLink)
    } else {
      this.links[linkId] = {url, cbs, method, data, type, headers}
      // console.log("Links", this.links[linkId])
    }
  }

  getLinkIdData(linkId, links = false, options = {getSubLinks: true})  {
    if ( links === false ) { links = this.links }
    // console.log("Getting", linkId)

    let fsl = linkId.indexOf("/")
    fsl = (fsl == -1 && linkId.length) || fsl
    let fLinkId = linkId.slice(0,fsl)
    // console.log("=> ",fsl,".", fLinkId,".", linkId)
    let linkD = links[fLinkId]
    if ( linkD ) {
      if ( !linkD["links"] || fLinkId == linkId ) {
        // console.log(linkD)
        if ( options.getSubLinks ) {
          return linkD
        } else {
          return {...linkD,...{links:""}}
        }
      } else {
        // console.log("Getting slash", fsl, linkId.slice(fsl+1))
        return this.getLinkIdData(linkId.slice(fsl+1), linkD["links"], options)
      }
    } else {
      console.log("inError", linkId, links)
    }
  }

  /*
    runData type:
    [
      {"link":"link/subLink", uData:{userData,userConf}}
    ]
  */
  runLinks(runData, tab, options = {runNow : false, onlyRunList: false}) {
    // console.log("Loading Runner", runData)
    let runList = []
    for ( let data of runData ) {
      let linkId = data.link

      let linkData = {
        url: "", method: "GET", data: "", type: "page", headers: {},
        cbs: { b: null, a: null }, linkId
      }
      
      // check for temperory links
      if ( data.temp ) {
        linkData = {...linkData,...data.temp}
      } else {
        linkData = this.getLinkIdData(linkId, false, {getSubLinks: false})
      }
      // console.log("LinkData", linkId,linkData)
      // let {url,method,data,type,cbs, headers, linkId} = linkData
      if ( data.overrides ) {
        let {url, method, headers, data:oData} = data.overrides
        linkData.url = url || linkData.url
        linkData.method = method || linkData.method
        linkData.headers = headers || linkData.headers
        linkData.data = oData || linkData.data
      }
      data = {data:linkData.data, uData:data.uData || {}}
      runList.push({
        ...linkData, linkId, data
      })
    }
    // console.log("RunList 517", runList)
    if ( options.onlyRunList === true ) {
      return runList
    }
    return new linkRunner(runList, tab, options.runNow)
  }

}

class FormElement {
  constructor(dom) {
    this.dom = dom
    this.type = this.dom.nodeName
    if ( this.type == "input" ) {
      this.parseInput()
    }
  }
  parseInput() {
    this.id = this.dom.getAttribute("id")
    this.name = this.dom.getAttribute("name")
    this.type = this.dom.getAttribute("type")
    this.value = this.dom.getAttribute("value")
    if ( !this.name ) {
      this.ignore = true
    }
  }
  getData(ignoreIgnore = false) {
    if ( !ignoreIgnore && this.ignore ) {
      return ""
    }
    return `${this.name}=${encodeURIComponent(this.value)}`
  }
}

class Form {
  constructor(dom) {
    this.dom = dom
    this.name = dom.getAttribute("name") || dom.getAttribute("id")
    this.action = dom.getAttribute("action")
    this.method = dom.getAttribute("method")
    this.fe = []
    // console.log(this.name)
    this.parseForm()
  }
  parseForm() {
    // parse input element
    for ( let fe of this.dom.getElementsByTagName("input") ) {
      // console.log(fe.nodeName, fe.attributes)
      this.fe.push(new FormElement(fe))
    }
  }
  getEle(name) {
    let fes = this.fe.filter(fe => fe.name == name)
    if ( fes.length == 1 ) {
      return fes[0]
    }
    return fes
  }
  getFormData(ii) {
    // get url encoded string of forms
    let formData = this.fe.map(el => el.getData(ii))
    let formDataStr = formData.join("&")
    // remove any traling &
    formDataStr = formDataStr.replace(/&$/,"")
    // console.log(formDataStr)
    return {action: this.action, method: this.method, data: formDataStr}
  }
}

class Forms {
  constructor(dom) {
    this.dom = dom
    this.formsDom = null
    this.forms = []
    this.parseDom()
  }
  parseDom() {
    this.formsDom = this.dom.getElementsByTagName("form")
    // console.log(this.formsDom)
    for ( let formDom of this.formsDom ) {
      // console.log("Attrs",formDom.attributes, formDom.getAttribute("id"))
      this.forms.push( new Form(formDom) )
    }
  }
  getForm(name) {
    let forms = this.forms.filter(form => form.name == name)
    if ( forms.length == 1 ) {
      return forms[0]
    }
    return forms
  }
}

class DOM {
  // ii = see FormElement
  constructor(str) {
    this.str = str
    this.parser = new DomParser()
    str = str.replace(/ [a-zA-Z0-9]+=[^"][a-zA-Z0-9_]+[^ >]/g,(a,c) => {return a.replace('=','="') + '"'})
    this.dom = this.parser.parseFromString(str)
    // this.dom.getElementById("d")
  }
  getForms() {
    // need to create Form Object ; yes new class name Form
    // and parse the fors and then return
    return new Forms(this.dom)
  }
}

exports.Mvb = MvbManager
exports.MvbHelper = MvbHelper
exports.DOM = DOM