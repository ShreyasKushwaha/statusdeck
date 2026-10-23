const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

const targetUrl = process.env.TARGET_URL || 'http://localhost:4000/health';
const connections = parseInt(process.env.CONNECTIONS || '10', 10);
const duration = parseInt(process.env.DURATION || '15', 10);

console.log(`====================================================`);
console.log(` STATUSDECK LOAD TEST BENCHMARK RUNNER`);
console.log(` Target: ${targetUrl}`);
console.log(` Concurrency: ${connections} Virtual Users`);
console.log(` Duration: ${duration} seconds`);
console.log(`====================================================`);

async function runBenchmark() {
  const result = await autocannon({
    url: targetUrl,
    connections,
    duration,
    pipelining: 1,
    headers: {
      'User-Agent': 'StatusDeck-LoadTester/1.0',
    },
  });

  const formattedResult = {
    target: targetUrl,
    virtualUsers: connections,
    durationSeconds: duration,
    requestsPerSecond: result.requests.average,
    totalRequests: result.requests.total,
    throughputBytesPerSec: result.throughput.average,
    latency: {
      p50: result.latency.p50,
      p95: result.latency.p95 || result.latency.p97_5,
      p99: result.latency.p99,
      avg: result.latency.average,
      min: result.latency.min,
      max: result.latency.max,
    },
    errorRate: Number(((result.errors / (result.requests.total || 1)) * 100).toFixed(2)),
    non2xxCount: result.non2xx,
    timeouts: result.timeouts,
    capturedAt: new Date().toISOString(),
  };

  console.log(`\nResults for ${connections} VUs:`);
  console.log(`- Throughput: ${formattedResult.requestsPerSecond.toFixed(1)} req/sec`);
  console.log(`- p50 Latency: ${formattedResult.latency.p50} ms`);
  console.log(`- p95 Latency: ${formattedResult.latency.p95} ms`);
  console.log(`- p99 Latency: ${formattedResult.latency.p99} ms`);
  console.log(`- Total Requests: ${formattedResult.totalRequests}`);
  console.log(`- Error Rate: ${formattedResult.errorRate}%`);

  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const outputPath = path.join(resultsDir, `benchmark-${connections}vu.json`);
  fs.writeFileSync(outputPath, JSON.stringify(formattedResult, null, 2));
  console.log(`Saved benchmark to ${outputPath}`);

  return formattedResult;
}

runBenchmark().catch((err) => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
