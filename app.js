const express = require('express');
const exphbs = require('express-handlebars');
const redis = require('redis');
const bodyParser = require('body-parser');
const { promisify } = require('util');
const app = express();
const port = 3000;

// View engine
app.engine('handlebars', exphbs({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');

// Create Redis Client
let client = redis.createClient();

client.on('connect', () => {
  console.log('Connected to Redis...');
});

// Async Redis functions
const LRANGE_ASYNC = promisify(client.lrange).bind(client);
const LPUSH_ASYNC = promisify(client.lpush).bind(client);
const EXPIRE_ASYNC = promisify(client.expire).bind(client);
const TTL_ASYNC = promisify(client.ttl).bind(client);

// Body-parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended:false }));

// Generate random alphanumeric for url
function alphanumeric() {
  return Math.random().toString(23).substring(2);
}

// Convert Redis TTL from seconds to dd:hh:mm:ss
function convertSecs(secs) {
  let d = secs / 86400 | 0;
  let H = (secs % 86400) / 3600 | 0;
  let m = (secs % 3600) / 60 | 0;
  let s = secs % 60;
  let z = n => (n < 10? '0' : '') + n;
  if (s < 0) { return 'Expired' }
  return `${d} day(s), ${z(H)} hour(s), ${z(m)} min(s), ${z(s)} sec(s)`;
}

// Initialize a box
const createBox = async (url) => {
  await LPUSH_ASYNC(url, "");
  await EXPIRE_ASYNC(url, 172800);
};

// Handle GET and POST requests
const logRequest = async (req, res) => {
  let url = req.params.path;
  dataToSave = {
    'method': req.method,
    'time': new Date().toUTCString(),
    'body': req.body,
    'headers': req.headers
  }
  try {
    await LPUSH_ASYNC(url, JSON.stringify(dataToSave));
    res.send('Yo c:');
  } catch (err) {
    res.send(err.message);
  }
}

// Homepage
app.get('/', async (_, res) => {
  try {
    let url = alphanumeric();
    createBox(url)
    res.render('makeBox', { 'url': url });
  } catch (err) {
    res.send(err.message);
  }
});

// GET and POST to a given box
app.get('/:path', logRequest);
app.post('/:path', logRequest);

// Inspect page for a given box
app.get('/:path/inspect', async (req, res) => {
  let url = req.params.path;
  let boxRequests = [];
  try {
    let ttl = await TTL_ASYNC(url)
    let dataStrings = await LRANGE_ASYNC(url, 0, 19);
    dataStrings.forEach(requestString => {
      if (requestString != "") {
        let boxReq = JSON.parse(requestString);
        let fixed = {
          'method': boxReq.method.toString(),
          'time': boxReq.time.toString(),
          'body': boxReq.body,
          'headers': boxReq.headers
        }
        boxRequests.push(fixed)
      }
    })
    res.render('inspectBox', {
      'id': `${req.headers.host}/${url}`,
      'ttl': convertSecs(ttl),
      'requests': boxRequests
    })
  } catch (err) {
    res.send(err.message)
  }
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});