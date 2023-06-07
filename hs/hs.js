const http = require("http")


let server = http.createServer((req, res) => {
  console.log(req.headers)
  res.end("Hello World!")
})

server.listen(8080)