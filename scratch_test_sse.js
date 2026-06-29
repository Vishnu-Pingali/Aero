import http from 'http';

console.log('Connecting to SSE stream at http://127.0.0.1:8000/api/flights/stream...');

const req = http.get('http://127.0.0.1:8000/api/flights/stream', (res) => {
  console.log(`Response Status: ${res.statusCode}`);
  console.log('Response Headers:', res.headers);

  res.on('data', (chunk) => {
    console.log(`Received Chunk:\n${chunk.toString()}`);
  });

  res.on('end', () => {
    console.log('Stream ended by server.');
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
});

// Run for 5 seconds, then disconnect
setTimeout(() => {
  console.log('Closing connection...');
  req.destroy();
  console.log('Connection closed.');
}, 5000);
