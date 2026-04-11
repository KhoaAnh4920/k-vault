const http = require('http');
http.get('http://localhost:3001/api/videos', (res) => { // wait, api/videos requires auth. Let me just test hitting the chunk with %2F.
  console.log(res.statusCode);
});
